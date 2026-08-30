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
import { CancellationToken } from "../../../base/common/cancellation.js";
import { dispose } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { IShareService } from "../../contrib/share/common/share.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
let MainThreadShare = class {
  constructor(extHostContext, shareService) {
    this.shareService = shareService;
    this.providers = /* @__PURE__ */ new Map();
    this.providerDisposables = /* @__PURE__ */ new Map();
    this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostShare);
  }
  $registerShareProvider(handle, selector, id, label, priority) {
    const provider = {
      id,
      label,
      selector,
      priority,
      provideShare: async (item) => {
        const result = await this.proxy.$provideShare(handle, item, CancellationToken.None);
        return typeof result === "string" ? result : URI.revive(result);
      }
    };
    this.providers.set(handle, provider);
    const disposable = this.shareService.registerShareProvider(provider);
    this.providerDisposables.set(handle, disposable);
  }
  $unregisterShareProvider(handle) {
    this.providers.delete(handle);
    this.providerDisposables.delete(handle);
  }
  dispose() {
    this.providers.clear();
    dispose(this.providerDisposables.values());
    this.providerDisposables.clear();
  }
};
MainThreadShare = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadShare),
  __decorateParam(1, IShareService)
], MainThreadShare);
export {
  MainThreadShare
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZFNoYXJlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIGRpc3Bvc2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb250ZXh0LCBFeHRIb3N0U2hhcmVTaGFwZSwgSURvY3VtZW50RmlsdGVyRHRvLCBNYWluQ29udGV4dCwgTWFpblRocmVhZFNoYXJlU2hhcGUgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBJU2hhcmVQcm92aWRlciwgSVNoYXJlU2VydmljZSwgSVNoYXJlYWJsZUl0ZW0gfSBmcm9tICcuLi8uLi9jb250cmliL3NoYXJlL2NvbW1vbi9zaGFyZS5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdENvbnRleHQsIGV4dEhvc3ROYW1lZEN1c3RvbWVyIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0SG9zdEN1c3RvbWVycy5qcyc7XG5cbkBleHRIb3N0TmFtZWRDdXN0b21lcihNYWluQ29udGV4dC5NYWluVGhyZWFkU2hhcmUpXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZFNoYXJlIGltcGxlbWVudHMgTWFpblRocmVhZFNoYXJlU2hhcGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcHJveHk6IEV4dEhvc3RTaGFyZVNoYXBlO1xuXHRwcml2YXRlIHByb3ZpZGVycyA9IG5ldyBNYXA8bnVtYmVyLCBJU2hhcmVQcm92aWRlcj4oKTtcblx0cHJpdmF0ZSBwcm92aWRlckRpc3Bvc2FibGVzID0gbmV3IE1hcDxudW1iZXIsIElEaXNwb3NhYmxlPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGV4dEhvc3RDb250ZXh0OiBJRXh0SG9zdENvbnRleHQsXG5cdFx0QElTaGFyZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzaGFyZVNlcnZpY2U6IElTaGFyZVNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5wcm94eSA9IGV4dEhvc3RDb250ZXh0LmdldFByb3h5KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RTaGFyZSk7XG5cdH1cblxuXHQkcmVnaXN0ZXJTaGFyZVByb3ZpZGVyKGhhbmRsZTogbnVtYmVyLCBzZWxlY3RvcjogSURvY3VtZW50RmlsdGVyRHRvW10sIGlkOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIHByaW9yaXR5OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBwcm92aWRlcjogSVNoYXJlUHJvdmlkZXIgPSB7XG5cdFx0XHRpZCxcblx0XHRcdGxhYmVsLFxuXHRcdFx0c2VsZWN0b3IsXG5cdFx0XHRwcmlvcml0eSxcblx0XHRcdHByb3ZpZGVTaGFyZTogYXN5bmMgKGl0ZW06IElTaGFyZWFibGVJdGVtKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucHJveHkuJHByb3ZpZGVTaGFyZShoYW5kbGUsIGl0ZW0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRyZXR1cm4gdHlwZW9mIHJlc3VsdCA9PT0gJ3N0cmluZycgPyByZXN1bHQgOiBVUkkucmV2aXZlKHJlc3VsdCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLnByb3ZpZGVycy5zZXQoaGFuZGxlLCBwcm92aWRlcik7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRoaXMuc2hhcmVTZXJ2aWNlLnJlZ2lzdGVyU2hhcmVQcm92aWRlcihwcm92aWRlcik7XG5cdFx0dGhpcy5wcm92aWRlckRpc3Bvc2FibGVzLnNldChoYW5kbGUsIGRpc3Bvc2FibGUpO1xuXHR9XG5cblx0JHVucmVnaXN0ZXJTaGFyZVByb3ZpZGVyKGhhbmRsZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5wcm92aWRlcnMuZGVsZXRlKGhhbmRsZSk7XG5cdFx0dGhpcy5wcm92aWRlckRpc3Bvc2FibGVzLmRlbGV0ZShoYW5kbGUpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLnByb3ZpZGVycy5jbGVhcigpO1xuXHRcdGRpc3Bvc2UodGhpcy5wcm92aWRlckRpc3Bvc2FibGVzLnZhbHVlcygpKTtcblx0XHR0aGlzLnByb3ZpZGVyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFzQixlQUFlO0FBQ3JDLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUF1RCxtQkFBeUM7QUFDekcsU0FBeUIscUJBQXFDO0FBQzlELFNBQTBCLDRCQUE0QjtBQUcvQyxJQUFNLGtCQUFOLE1BQXNEO0FBQUEsRUFNNUQsWUFDQyxnQkFDZ0MsY0FDL0I7QUFEK0I7QUFMakMsU0FBUSxZQUFZLG9CQUFJLElBQTRCO0FBQ3BELFNBQVEsc0JBQXNCLG9CQUFJLElBQXlCO0FBTTFELFNBQUssUUFBUSxlQUFlLFNBQVMsZUFBZSxZQUFZO0FBQUEsRUFDakU7QUFBQSxFQUVBLHVCQUF1QixRQUFnQixVQUFnQyxJQUFZLE9BQWUsVUFBd0I7QUFDekgsVUFBTSxXQUEyQjtBQUFBLE1BQ2hDO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxjQUFjLE9BQU8sU0FBeUI7QUFDN0MsY0FBTSxTQUFTLE1BQU0sS0FBSyxNQUFNLGNBQWMsUUFBUSxNQUFNLGtCQUFrQixJQUFJO0FBQ2xGLGVBQU8sT0FBTyxXQUFXLFdBQVcsU0FBUyxJQUFJLE9BQU8sTUFBTTtBQUFBLE1BQy9EO0FBQUEsSUFDRDtBQUNBLFNBQUssVUFBVSxJQUFJLFFBQVEsUUFBUTtBQUNuQyxVQUFNLGFBQWEsS0FBSyxhQUFhLHNCQUFzQixRQUFRO0FBQ25FLFNBQUssb0JBQW9CLElBQUksUUFBUSxVQUFVO0FBQUEsRUFDaEQ7QUFBQSxFQUVBLHlCQUF5QixRQUFzQjtBQUM5QyxTQUFLLFVBQVUsT0FBTyxNQUFNO0FBQzVCLFNBQUssb0JBQW9CLE9BQU8sTUFBTTtBQUFBLEVBQ3ZDO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFNBQUssVUFBVSxNQUFNO0FBQ3JCLFlBQVEsS0FBSyxvQkFBb0IsT0FBTyxDQUFDO0FBQ3pDLFNBQUssb0JBQW9CLE1BQU07QUFBQSxFQUNoQztBQUNEO0FBdkNhLGtCQUFOO0FBQUEsRUFETixxQkFBcUIsWUFBWSxlQUFlO0FBQUEsRUFTOUM7QUFBQSxHQVJVOyIsCiAgIm5hbWVzIjogW10KfQo=
