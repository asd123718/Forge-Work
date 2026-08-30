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
import { Emitter } from "../../../base/common/event.js";
import { dispose } from "../../../base/common/lifecycle.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { IDecorationsService } from "../../services/decorations/common/decorations.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { DeferredPromise } from "../../../base/common/async.js";
import { CancellationError } from "../../../base/common/errors.js";
class DecorationRequestsQueue {
  constructor(_proxy, _handle) {
    this._proxy = _proxy;
    this._handle = _handle;
    this._idPool = 0;
    this._requests = /* @__PURE__ */ new Map();
    this._resolver = /* @__PURE__ */ new Map();
  }
  enqueue(uri, token) {
    const id = ++this._idPool;
    const defer = new DeferredPromise();
    this._requests.set(id, { id, uri });
    this._resolver.set(id, defer);
    this._processQueue();
    const sub = token.onCancellationRequested(() => {
      this._requests.delete(id);
      this._resolver.delete(id);
      defer.error(new CancellationError());
    });
    return defer.p.finally(() => sub.dispose());
  }
  _processQueue() {
    if (this._timer !== void 0) {
      return;
    }
    this._timer = setTimeout(() => {
      const requests = this._requests;
      const resolver = this._resolver;
      this._proxy.$provideDecorations(this._handle, [...requests.values()], CancellationToken.None).then((data) => {
        for (const [id, defer] of resolver) {
          defer.complete(data[id]);
        }
      });
      this._requests = /* @__PURE__ */ new Map();
      this._resolver = /* @__PURE__ */ new Map();
      this._timer = void 0;
    }, 0);
  }
}
let MainThreadDecorations = class {
  constructor(context, _decorationsService) {
    this._decorationsService = _decorationsService;
    this._provider = /* @__PURE__ */ new Map();
    this._proxy = context.getProxy(ExtHostContext.ExtHostDecorations);
  }
  dispose() {
    this._provider.forEach((value) => dispose(value));
    this._provider.clear();
  }
  $registerDecorationProvider(handle, label) {
    const emitter = new Emitter();
    const queue = new DecorationRequestsQueue(this._proxy, handle);
    const registration = this._decorationsService.registerDecorationsProvider({
      label,
      onDidChange: emitter.event,
      provideDecorations: async (uri, token) => {
        const data = await queue.enqueue(uri, token);
        if (!data) {
          return void 0;
        }
        const [bubble, tooltip, letter, themeColor] = data;
        return {
          weight: 10,
          bubble: bubble ?? false,
          color: themeColor?.id,
          tooltip,
          letter
        };
      }
    });
    this._provider.set(handle, [emitter, registration]);
  }
  $onDidChange(handle, resources) {
    const provider = this._provider.get(handle);
    if (provider) {
      const [emitter] = provider;
      emitter.fire(resources && resources.map((r) => URI.revive(r)));
    }
  }
  $unregisterDecorationProvider(handle) {
    const provider = this._provider.get(handle);
    if (provider) {
      dispose(provider);
      this._provider.delete(handle);
    }
  }
};
MainThreadDecorations = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadDecorations),
  __decorateParam(1, IDecorationsService)
], MainThreadDecorations);
export {
  MainThreadDecorations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZERlY29yYXRpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgZGlzcG9zZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q29udGV4dCwgTWFpbkNvbnRleHQsIE1haW5UaHJlYWREZWNvcmF0aW9uc1NoYXBlLCBFeHRIb3N0RGVjb3JhdGlvbnNTaGFwZSwgRGVjb3JhdGlvbkRhdGEsIERlY29yYXRpb25SZXF1ZXN0IH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgZXh0SG9zdE5hbWVkQ3VzdG9tZXIsIElFeHRIb3N0Q29udGV4dCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dEhvc3RDdXN0b21lcnMuanMnO1xuaW1wb3J0IHsgSURlY29yYXRpb25zU2VydmljZSwgSURlY29yYXRpb25EYXRhIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZGVjb3JhdGlvbnMvY29tbW9uL2RlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcblxuY2xhc3MgRGVjb3JhdGlvblJlcXVlc3RzUXVldWUge1xuXG5cdHByaXZhdGUgX2lkUG9vbCA9IDA7XG5cdHByaXZhdGUgX3JlcXVlc3RzID0gbmV3IE1hcDxudW1iZXIsIERlY29yYXRpb25SZXF1ZXN0PigpO1xuXHRwcml2YXRlIF9yZXNvbHZlciA9IG5ldyBNYXA8bnVtYmVyLCBEZWZlcnJlZFByb21pc2U8RGVjb3JhdGlvbkRhdGE+PigpO1xuXG5cdHByaXZhdGUgX3RpbWVyOiBUaW1lb3V0IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBFeHRIb3N0RGVjb3JhdGlvbnNTaGFwZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9oYW5kbGU6IG51bWJlclxuXHQpIHtcblx0XHQvL1xuXHR9XG5cblx0ZW5xdWV1ZSh1cmk6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxEZWNvcmF0aW9uRGF0YT4ge1xuXHRcdGNvbnN0IGlkID0gKyt0aGlzLl9pZFBvb2w7XG5cblx0XHRjb25zdCBkZWZlciA9IG5ldyBEZWZlcnJlZFByb21pc2U8RGVjb3JhdGlvbkRhdGE+KCk7XG5cdFx0dGhpcy5fcmVxdWVzdHMuc2V0KGlkLCB7IGlkLCB1cmkgfSk7XG5cdFx0dGhpcy5fcmVzb2x2ZXIuc2V0KGlkLCBkZWZlcik7XG5cdFx0dGhpcy5fcHJvY2Vzc1F1ZXVlKCk7XG5cblx0XHRjb25zdCBzdWIgPSB0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZXF1ZXN0cy5kZWxldGUoaWQpO1xuXHRcdFx0dGhpcy5fcmVzb2x2ZXIuZGVsZXRlKGlkKTtcblx0XHRcdGRlZmVyLmVycm9yKG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKTtcblx0XHR9KTtcblx0XHRyZXR1cm4gZGVmZXIucC5maW5hbGx5KCgpID0+IHN1Yi5kaXNwb3NlKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcHJvY2Vzc1F1ZXVlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl90aW1lciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHQvLyBhbHJlYWR5IHF1ZXVlZFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl90aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0Ly8gbWFrZSByZXF1ZXN0XG5cdFx0XHRjb25zdCByZXF1ZXN0cyA9IHRoaXMuX3JlcXVlc3RzO1xuXHRcdFx0Y29uc3QgcmVzb2x2ZXIgPSB0aGlzLl9yZXNvbHZlcjtcblx0XHRcdHRoaXMuX3Byb3h5LiRwcm92aWRlRGVjb3JhdGlvbnModGhpcy5faGFuZGxlLCBbLi4ucmVxdWVzdHMudmFsdWVzKCldLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKS50aGVuKGRhdGEgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtpZCwgZGVmZXJdIG9mIHJlc29sdmVyKSB7XG5cdFx0XHRcdFx0ZGVmZXIuY29tcGxldGUoZGF0YVtpZF0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gcmVzZXRcblx0XHRcdHRoaXMuX3JlcXVlc3RzID0gbmV3IE1hcCgpO1xuXHRcdFx0dGhpcy5fcmVzb2x2ZXIgPSBuZXcgTWFwKCk7XG5cdFx0XHR0aGlzLl90aW1lciA9IHVuZGVmaW5lZDtcblx0XHR9LCAwKTtcblx0fVxufVxuXG5AZXh0SG9zdE5hbWVkQ3VzdG9tZXIoTWFpbkNvbnRleHQuTWFpblRocmVhZERlY29yYXRpb25zKVxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWREZWNvcmF0aW9ucyBpbXBsZW1lbnRzIE1haW5UaHJlYWREZWNvcmF0aW9uc1NoYXBlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlciA9IG5ldyBNYXA8bnVtYmVyLCBbRW1pdHRlcjxVUklbXT4sIElEaXNwb3NhYmxlXT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IEV4dEhvc3REZWNvcmF0aW9uc1NoYXBlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRleHQ6IElFeHRIb3N0Q29udGV4dCxcblx0XHRASURlY29yYXRpb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9kZWNvcmF0aW9uc1NlcnZpY2U6IElEZWNvcmF0aW9uc1NlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5fcHJveHkgPSBjb250ZXh0LmdldFByb3h5KEV4dEhvc3RDb250ZXh0LkV4dEhvc3REZWNvcmF0aW9ucyk7XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuX3Byb3ZpZGVyLmZvckVhY2godmFsdWUgPT4gZGlzcG9zZSh2YWx1ZSkpO1xuXHRcdHRoaXMuX3Byb3ZpZGVyLmNsZWFyKCk7XG5cdH1cblxuXHQkcmVnaXN0ZXJEZWNvcmF0aW9uUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIGxhYmVsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8VVJJW10+KCk7XG5cdFx0Y29uc3QgcXVldWUgPSBuZXcgRGVjb3JhdGlvblJlcXVlc3RzUXVldWUodGhpcy5fcHJveHksIGhhbmRsZSk7XG5cdFx0Y29uc3QgcmVnaXN0cmF0aW9uID0gdGhpcy5fZGVjb3JhdGlvbnNTZXJ2aWNlLnJlZ2lzdGVyRGVjb3JhdGlvbnNQcm92aWRlcih7XG5cdFx0XHRsYWJlbCxcblx0XHRcdG9uRGlkQ2hhbmdlOiBlbWl0dGVyLmV2ZW50LFxuXHRcdFx0cHJvdmlkZURlY29yYXRpb25zOiBhc3luYyAodXJpLCB0b2tlbik6IFByb21pc2U8SURlY29yYXRpb25EYXRhIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRcdGNvbnN0IGRhdGEgPSBhd2FpdCBxdWV1ZS5lbnF1ZXVlKHVyaSwgdG9rZW4pO1xuXHRcdFx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IFtidWJibGUsIHRvb2x0aXAsIGxldHRlciwgdGhlbWVDb2xvcl0gPSBkYXRhO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHdlaWdodDogMTAsXG5cdFx0XHRcdFx0YnViYmxlOiBidWJibGUgPz8gZmFsc2UsXG5cdFx0XHRcdFx0Y29sb3I6IHRoZW1lQ29sb3I/LmlkLFxuXHRcdFx0XHRcdHRvb2x0aXAsXG5cdFx0XHRcdFx0bGV0dGVyXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fcHJvdmlkZXIuc2V0KGhhbmRsZSwgW2VtaXR0ZXIsIHJlZ2lzdHJhdGlvbl0pO1xuXHR9XG5cblx0JG9uRGlkQ2hhbmdlKGhhbmRsZTogbnVtYmVyLCByZXNvdXJjZXM6IFVyaUNvbXBvbmVudHNbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fcHJvdmlkZXIuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKHByb3ZpZGVyKSB7XG5cdFx0XHRjb25zdCBbZW1pdHRlcl0gPSBwcm92aWRlcjtcblx0XHRcdGVtaXR0ZXIuZmlyZShyZXNvdXJjZXMgJiYgcmVzb3VyY2VzLm1hcChyID0+IFVSSS5yZXZpdmUocikpKTtcblx0XHR9XG5cdH1cblxuXHQkdW5yZWdpc3RlckRlY29yYXRpb25Qcm92aWRlcihoYW5kbGU6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fcHJvdmlkZXIuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKHByb3ZpZGVyKSB7XG5cdFx0XHRkaXNwb3NlKHByb3ZpZGVyKTtcblx0XHRcdHRoaXMuX3Byb3ZpZGVyLmRlbGV0ZShoYW5kbGUpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFdBQTBCO0FBQ25DLFNBQVMsZUFBZTtBQUN4QixTQUFzQixlQUFlO0FBQ3JDLFNBQVMsZ0JBQWdCLG1CQUEyRztBQUNwSSxTQUFTLDRCQUE2QztBQUN0RCxTQUFTLDJCQUE0QztBQUNyRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUVsQyxNQUFNLHdCQUF3QjtBQUFBLEVBUTdCLFlBQ2tCLFFBQ0EsU0FDaEI7QUFGZ0I7QUFDQTtBQVJsQixTQUFRLFVBQVU7QUFDbEIsU0FBUSxZQUFZLG9CQUFJLElBQStCO0FBQ3ZELFNBQVEsWUFBWSxvQkFBSSxJQUE2QztBQUFBLEVBU3JFO0FBQUEsRUFFQSxRQUFRLEtBQVUsT0FBbUQ7QUFDcEUsVUFBTSxLQUFLLEVBQUUsS0FBSztBQUVsQixVQUFNLFFBQVEsSUFBSSxnQkFBZ0M7QUFDbEQsU0FBSyxVQUFVLElBQUksSUFBSSxFQUFFLElBQUksSUFBSSxDQUFDO0FBQ2xDLFNBQUssVUFBVSxJQUFJLElBQUksS0FBSztBQUM1QixTQUFLLGNBQWM7QUFFbkIsVUFBTSxNQUFNLE1BQU0sd0JBQXdCLE1BQU07QUFDL0MsV0FBSyxVQUFVLE9BQU8sRUFBRTtBQUN4QixXQUFLLFVBQVUsT0FBTyxFQUFFO0FBQ3hCLFlBQU0sTUFBTSxJQUFJLGtCQUFrQixDQUFDO0FBQUEsSUFDcEMsQ0FBQztBQUNELFdBQU8sTUFBTSxFQUFFLFFBQVEsTUFBTSxJQUFJLFFBQVEsQ0FBQztBQUFBLEVBQzNDO0FBQUEsRUFFUSxn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
