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
import { URI } from "../../../base/common/uri.js";
import { MainContext } from "./extHost.protocol.js";
import { Disposable, FileDecoration } from "./extHostTypes.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { asArray, groupBy } from "../../../base/common/arrays.js";
import { compare, count } from "../../../base/common/strings.js";
import { dirname } from "../../../base/common/path.js";
import { checkProposedApiEnabled } from "../../services/extensions/common/extensions.js";
let ExtHostDecorations = class {
  constructor(extHostRpc, _logService) {
    this._logService = _logService;
    this._provider = /* @__PURE__ */ new Map();
    this._proxy = extHostRpc.getProxy(MainContext.MainThreadDecorations);
  }
  registerFileDecorationProvider(provider, extensionDescription) {
    const handle = ExtHostDecorations._handlePool++;
    this._provider.set(handle, { provider, extensionDescription });
    this._proxy.$registerDecorationProvider(handle, extensionDescription.identifier.value);
    const listener = provider.onDidChangeFileDecorations && provider.onDidChangeFileDecorations((e) => {
      if (!e) {
        this._proxy.$onDidChange(handle, null);
        return;
      }
      const array = asArray(e);
      if (array.length <= ExtHostDecorations._maxEventSize) {
        this._proxy.$onDidChange(handle, array);
        return;
      }
      this._logService.warn("[Decorations] CAPPING events from decorations provider", extensionDescription.identifier.value, array.length);
      const mapped = array.map((uri) => ({ uri, rank: count(uri.path, "/") }));
      const groups = groupBy(mapped, (a, b) => a.rank - b.rank || compare(a.uri.path, b.uri.path));
      const picked = [];
      outer: for (const uris of groups) {
        let lastDirname;
        for (const obj of uris) {
          const myDirname = dirname(obj.uri.path);
          if (lastDirname !== myDirname) {
            lastDirname = myDirname;
            if (picked.push(obj.uri) >= ExtHostDecorations._maxEventSize) {
              break outer;
            }
          }
        }
      }
      this._proxy.$onDidChange(handle, picked);
    });
    return new Disposable(() => {
      listener?.dispose();
      this._proxy.$unregisterDecorationProvider(handle);
      this._provider.delete(handle);
    });
  }
  async $provideDecorations(handle, requests, token) {
    if (!this._provider.has(handle)) {
      return /* @__PURE__ */ Object.create(null);
    }
    const result = /* @__PURE__ */ Object.create(null);
    const { provider, extensionDescription: extensionId } = this._provider.get(handle);
    await Promise.all(requests.map(async (request) => {
      try {
        const { uri, id } = request;
        const data = await Promise.resolve(provider.provideFileDecoration(URI.revive(uri), token));
        if (!data) {
          return;
        }
        try {
          FileDecoration.validate(data);
          if (data.badge && typeof data.badge !== "string") {
            checkProposedApiEnabled(extensionId, "codiconDecoration");
          }
          result[id] = [data.propagate, data.tooltip, data.badge, data.color];
        } catch (e) {
          this._logService.warn(`INVALID decoration from extension '${extensionId.identifier.value}': ${e}`);
        }
      } catch (err) {
        this._logService.error(err);
      }
    }));
    return result;
  }
};
ExtHostDecorations._handlePool = 0;
ExtHostDecorations._maxEventSize = 250;
ExtHostDecorations = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, ILogService)
], ExtHostDecorations);
const IExtHostDecorations = createDecorator("IExtHostDecorations");
export {
  ExtHostDecorations,
  IExtHostDecorations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0RGVjb3JhdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IE1haW5Db250ZXh0LCBFeHRIb3N0RGVjb3JhdGlvbnNTaGFwZSwgTWFpblRocmVhZERlY29yYXRpb25zU2hhcGUsIERlY29yYXRpb25EYXRhLCBEZWNvcmF0aW9uUmVxdWVzdCwgRGVjb3JhdGlvblJlcGx5IH0gZnJvbSAnLi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIEZpbGVEZWNvcmF0aW9uIH0gZnJvbSAnLi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElFeHRIb3N0UnBjU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdFJwY1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBhc0FycmF5LCBncm91cEJ5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGNvbXBhcmUsIGNvdW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuXG5pbnRlcmZhY2UgUHJvdmlkZXJEYXRhIHtcblx0cHJvdmlkZXI6IHZzY29kZS5GaWxlRGVjb3JhdGlvblByb3ZpZGVyO1xuXHRleHRlbnNpb25EZXNjcmlwdGlvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uO1xufVxuXG5leHBvcnQgY2xhc3MgRXh0SG9zdERlY29yYXRpb25zIGltcGxlbWVudHMgRXh0SG9zdERlY29yYXRpb25zU2hhcGUge1xuXG5cdHByaXZhdGUgc3RhdGljIF9oYW5kbGVQb29sID0gMDtcblx0cHJpdmF0ZSBzdGF0aWMgX21heEV2ZW50U2l6ZSA9IDI1MDtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyID0gbmV3IE1hcDxudW1iZXIsIFByb3ZpZGVyRGF0YT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IE1haW5UaHJlYWREZWNvcmF0aW9uc1NoYXBlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0SG9zdFJwY1NlcnZpY2UgZXh0SG9zdFJwYzogSUV4dEhvc3RScGNTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5fcHJveHkgPSBleHRIb3N0UnBjLmdldFByb3h5KE1haW5Db250ZXh0Lk1haW5UaHJlYWREZWNvcmF0aW9ucyk7XG5cdH1cblxuXHRyZWdpc3RlckZpbGVEZWNvcmF0aW9uUHJvdmlkZXIocHJvdmlkZXI6IHZzY29kZS5GaWxlRGVjb3JhdGlvblByb3ZpZGVyLCBleHRlbnNpb25EZXNjcmlwdGlvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGhhbmRsZSA9IEV4dEhvc3REZWNvcmF0aW9ucy5faGFuZGxlUG9vbCsrO1xuXHRcdHRoaXMuX3Byb3ZpZGVyLnNldChoYW5kbGUsIHsgcHJvdmlkZXIsIGV4dGVuc2lvbkRlc2NyaXB0aW9uIH0pO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlckRlY29yYXRpb25Qcm92aWRlcihoYW5kbGUsIGV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWUpO1xuXG5cdFx0Y29uc3QgbGlzdGVuZXIgPSBwcm92aWRlci5vbkRpZENoYW5nZUZpbGVEZWNvcmF0aW9ucyAmJiBwcm92aWRlci5vbkRpZENoYW5nZUZpbGVEZWNvcmF0aW9ucyhlID0+IHtcblx0XHRcdGlmICghZSkge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2UoaGFuZGxlLCBudWxsKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYXJyYXkgPSBhc0FycmF5KGUpO1xuXHRcdFx0aWYgKGFycmF5Lmxlbmd0aCA8PSBFeHRIb3N0RGVjb3JhdGlvbnMuX21heEV2ZW50U2l6ZSkge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2UoaGFuZGxlLCBhcnJheSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdG9vIG1hbnkgcmVzb3VyY2VzIHBlciBldmVudC4gcGljayBvbmUgcmVzb3VyY2UgcGVyIGZvbGRlciwgc3RhcnRpbmdcblx0XHRcdC8vIHdpdGggcGFyZW50IGZvbGRlcnNcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignW0RlY29yYXRpb25zXSBDQVBQSU5HIGV2ZW50cyBmcm9tIGRlY29yYXRpb25zIHByb3ZpZGVyJywgZXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZSwgYXJyYXkubGVuZ3RoKTtcblx0XHRcdGNvbnN0IG1hcHBlZCA9IGFycmF5Lm1hcCh1cmkgPT4gKHsgdXJpLCByYW5rOiBjb3VudCh1cmkucGF0aCwgJy8nKSB9KSk7XG5cdFx0XHRjb25zdCBncm91cHMgPSBncm91cEJ5KG1hcHBlZCwgKGEsIGIpID0+IGEucmFuayAtIGIucmFuayB8fCBjb21wYXJlKGEudXJpLnBhdGgsIGIudXJpLnBhdGgpKTtcblx0XHRcdGNvbnN0IHBpY2tlZDogVVJJW10gPSBbXTtcblx0XHRcdG91dGVyOiBmb3IgKGNvbnN0IHVyaXMgb2YgZ3JvdXBzKSB7XG5cdFx0XHRcdGxldCBsYXN0RGlybmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRmb3IgKGNvbnN0IG9iaiBvZiB1cmlzKSB7XG5cdFx0XHRcdFx0Y29uc3QgbXlEaXJuYW1lID0gZGlybmFtZShvYmoudXJpLnBhdGgpO1xuXHRcdFx0XHRcdGlmIChsYXN0RGlybmFtZSAhPT0gbXlEaXJuYW1lKSB7XG5cdFx0XHRcdFx0XHRsYXN0RGlybmFtZSA9IG15RGlybmFtZTtcblx0XHRcdFx0XHRcdGlmIChwaWNrZWQucHVzaChvYmoudXJpKSA+PSBFeHRIb3N0RGVjb3JhdGlvbnMuX21heEV2ZW50U2l6ZSkge1xuXHRcdFx0XHRcdFx0XHRicmVhayBvdXRlcjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZENoYW5nZShoYW5kbGUsIHBpY2tlZCk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gbmV3IERpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0bGlzdGVuZXI/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX3Byb3h5LiR1bnJlZ2lzdGVyRGVjb3JhdGlvblByb3ZpZGVyKGhhbmRsZSk7XG5cdFx0XHR0aGlzLl9wcm92aWRlci5kZWxldGUoaGFuZGxlKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jICRwcm92aWRlRGVjb3JhdGlvbnMoaGFuZGxlOiBudW1iZXIsIHJlcXVlc3RzOiBEZWNvcmF0aW9uUmVxdWVzdFtdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPERlY29yYXRpb25SZXBseT4ge1xuXG5cdFx0aWYgKCF0aGlzLl9wcm92aWRlci5oYXMoaGFuZGxlKSkge1xuXHRcdFx0Ly8gbWlnaHQgaGF2ZSBiZWVuIHVucmVnaXN0ZXJlZCBpbiB0aGUgbWVhbnRpbWVcblx0XHRcdHJldHVybiBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogRGVjb3JhdGlvblJlcGx5ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRjb25zdCB7IHByb3ZpZGVyLCBleHRlbnNpb25EZXNjcmlwdGlvbjogZXh0ZW5zaW9uSWQgfSA9IHRoaXMuX3Byb3ZpZGVyLmdldChoYW5kbGUpITtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKHJlcXVlc3RzLm1hcChhc3luYyByZXF1ZXN0ID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHsgdXJpLCBpZCB9ID0gcmVxdWVzdDtcblx0XHRcdFx0Y29uc3QgZGF0YSA9IGF3YWl0IFByb21pc2UucmVzb2x2ZShwcm92aWRlci5wcm92aWRlRmlsZURlY29yYXRpb24oVVJJLnJldml2ZSh1cmkpLCB0b2tlbikpO1xuXHRcdFx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRGaWxlRGVjb3JhdGlvbi52YWxpZGF0ZShkYXRhKTtcblx0XHRcdFx0XHRpZiAoZGF0YS5iYWRnZSAmJiB0eXBlb2YgZGF0YS5iYWRnZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbklkLCAnY29kaWNvbkRlY29yYXRpb24nKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmVzdWx0W2lkXSA9IDxEZWNvcmF0aW9uRGF0YT5bZGF0YS5wcm9wYWdhdGUsIGRhdGEudG9vbHRpcCwgZGF0YS5iYWRnZSwgZGF0YS5jb2xvcl07XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYElOVkFMSUQgZGVjb3JhdGlvbiBmcm9tIGV4dGVuc2lvbiAnJHtleHRlbnNpb25JZC5pZGVudGlmaWVyLnZhbHVlfSc6ICR7ZX1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBJRXh0SG9zdERlY29yYXRpb25zID0gY3JlYXRlRGVjb3JhdG9yPElFeHRIb3N0RGVjb3JhdGlvbnM+KCdJRXh0SG9zdERlY29yYXRpb25zJyk7XG5leHBvcnQgaW50ZXJmYWNlIElFeHRIb3N0RGVjb3JhdGlvbnMgZXh0ZW5kcyBFeHRIb3N0RGVjb3JhdGlvbnMgeyB9XG4iXSwK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
