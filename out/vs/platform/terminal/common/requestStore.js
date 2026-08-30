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
import { timeout } from "../../../base/common/async.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, dispose, toDisposable } from "../../../base/common/lifecycle.js";
import { ILogService } from "../../log/common/log.js";
let RequestStore = class extends Disposable {
  /**
   * @param timeout How long in ms to allow requests to go unanswered for, undefined will use the
   * default (15 seconds).
   */
  constructor(timeout2, _logService) {
    super();
    this._logService = _logService;
    this._lastRequestId = 0;
    this._pendingRequests = /* @__PURE__ */ new Map();
    this._pendingRequestDisposables = /* @__PURE__ */ new Map();
    this._onCreateRequest = this._register(new Emitter());
    this.onCreateRequest = this._onCreateRequest.event;
    this._timeout = timeout2 === void 0 ? 15e3 : timeout2;
    this._register(toDisposable(() => {
      for (const d of this._pendingRequestDisposables.values()) {
        dispose(d);
      }
    }));
  }
  /**
   * Creates a request.
   * @param args The arguments to pass to the onCreateRequest event.
   */
  createRequest(args) {
    return new Promise((resolve, reject) => {
      const requestId = ++this._lastRequestId;
      this._pendingRequests.set(requestId, resolve);
      this._onCreateRequest.fire({ requestId, ...args });
      const tokenSource = new CancellationTokenSource();
      timeout(this._timeout, tokenSource.token).then(() => reject(`Request ${requestId} timed out (${this._timeout}ms)`));
      this._pendingRequestDisposables.set(requestId, [toDisposable(() => tokenSource.cancel())]);
    });
  }
  /**
   * Accept a reply to a request.
   * @param requestId The request ID originating from the onCreateRequest event.
   * @param data The reply data.
   */
  acceptReply(requestId, data) {
    const resolveRequest = this._pendingRequests.get(requestId);
    if (resolveRequest) {
      this._pendingRequests.delete(requestId);
      dispose(this._pendingRequestDisposables.get(requestId) || []);
      this._pendingRequestDisposables.delete(requestId);
      resolveRequest(data);
    } else {
      this._logService.warn(`RequestStore#acceptReply was called without receiving a matching request ${requestId}`);
    }
  }
};
RequestStore = __decorateClass([
  __decorateParam(1, ILogService)
], RequestStore);
export {
  RequestStore
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVybWluYWxcXGNvbW1vblxccmVxdWVzdFN0b3JlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBkaXNwb3NlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuXG4vKipcbiAqIEEgaGVscGVyIGNsYXNzIHRvIHRyYWNrIHJlcXVlc3RzIHRoYXQgaGF2ZSByZXBsaWVzLiBVc2luZyB0aGlzIGl0J3MgZWFzeSB0byBpbXBsZW1lbnQgYW4gZXZlbnRcbiAqIHRoYXQgYWNjZXB0cyBhIHJlcGx5LlxuICovXG5leHBvcnQgY2xhc3MgUmVxdWVzdFN0b3JlPFQsIFJlcXVlc3RBcmdzPiBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIF9sYXN0UmVxdWVzdElkID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBfdGltZW91dDogbnVtYmVyO1xuXHRwcml2YXRlIF9wZW5kaW5nUmVxdWVzdHM6IE1hcDxudW1iZXIsIChyZXNvbHZlZDogVCkgPT4gdm9pZD4gPSBuZXcgTWFwKCk7XG5cdHByaXZhdGUgX3BlbmRpbmdSZXF1ZXN0RGlzcG9zYWJsZXM6IE1hcDxudW1iZXIsIElEaXNwb3NhYmxlW10+ID0gbmV3IE1hcCgpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQ3JlYXRlUmVxdWVzdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFJlcXVlc3RBcmdzICYgeyByZXF1ZXN0SWQ6IG51bWJlciB9PigpKTtcblx0cmVhZG9ubHkgb25DcmVhdGVSZXF1ZXN0ID0gdGhpcy5fb25DcmVhdGVSZXF1ZXN0LmV2ZW50O1xuXG5cdC8qKlxuXHQgKiBAcGFyYW0gdGltZW91dCBIb3cgbG9uZyBpbiBtcyB0byBhbGxvdyByZXF1ZXN0cyB0byBnbyB1bmFuc3dlcmVkIGZvciwgdW5kZWZpbmVkIHdpbGwgdXNlIHRoZVxuXHQgKiBkZWZhdWx0ICgxNSBzZWNvbmRzKS5cblx0ICovXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHRpbWVvdXQ6IG51bWJlciB8IHVuZGVmaW5lZCxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl90aW1lb3V0ID0gdGltZW91dCA9PT0gdW5kZWZpbmVkID8gMTUwMDAgOiB0aW1lb3V0O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGQgb2YgdGhpcy5fcGVuZGluZ1JlcXVlc3REaXNwb3NhYmxlcy52YWx1ZXMoKSkge1xuXHRcdFx0XHRkaXNwb3NlKGQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgcmVxdWVzdC5cblx0ICogQHBhcmFtIGFyZ3MgVGhlIGFyZ3VtZW50cyB0byBwYXNzIHRvIHRoZSBvbkNyZWF0ZVJlcXVlc3QgZXZlbnQuXG5cdCAqL1xuXHRjcmVhdGVSZXF1ZXN0KGFyZ3M6IFJlcXVlc3RBcmdzKTogUHJvbWlzZTxUPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPFQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IHJlcXVlc3RJZCA9ICsrdGhpcy5fbGFzdFJlcXVlc3RJZDtcblx0XHRcdHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5zZXQocmVxdWVzdElkLCByZXNvbHZlKTtcblx0XHRcdHRoaXMuX29uQ3JlYXRlUmVxdWVzdC5maXJlKHsgcmVxdWVzdElkLCAuLi5hcmdzIH0pO1xuXHRcdFx0Y29uc3QgdG9rZW5Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdHRpbWVvdXQodGhpcy5fdGltZW91dCwgdG9rZW5Tb3VyY2UudG9rZW4pLnRoZW4oKCkgPT4gcmVqZWN0KGBSZXF1ZXN0ICR7cmVxdWVzdElkfSB0aW1lZCBvdXQgKCR7dGhpcy5fdGltZW91dH1tcylgKSk7XG5cdFx0XHR0aGlzLl9wZW5kaW5nUmVxdWVzdERpc3Bvc2FibGVzLnNldChyZXF1ZXN0SWQsIFt0b0Rpc3Bvc2FibGUoKCkgPT4gdG9rZW5Tb3VyY2UuY2FuY2VsKCkpXSk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQWNjZXB0IGEgcmVwbHkgdG8gYSByZXF1ZXN0LlxuXHQgKiBAcGFyYW0gcmVxdWVzdElkIFRoZSByZXF1ZXN0IElEIG9yaWdpbmF0aW5nIGZyb20gdGhlIG9uQ3JlYXRlUmVxdWVzdCBldmVudC5cblx0ICogQHBhcmFtIGRhdGEgVGhlIHJlcGx5IGRhdGEuXG5cdCAqL1xuXHRhY2NlcHRSZXBseShyZXF1ZXN0SWQ6IG51bWJlciwgZGF0YTogVCkge1xuXHRcdGNvbnN0IHJlc29sdmVSZXF1ZXN0ID0gdGhpcy5fcGVuZGluZ1JlcXVlc3RzLmdldChyZXF1ZXN0SWQpO1xuXHRcdGlmIChyZXNvbHZlUmVxdWVzdCkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1JlcXVlc3RzLmRlbGV0ZShyZXF1ZXN0SWQpO1xuXHRcdFx0ZGlzcG9zZSh0aGlzLl9wZW5kaW5nUmVxdWVzdERpc3Bvc2FibGVzLmdldChyZXF1ZXN0SWQpIHx8IFtdKTtcblx0XHRcdHRoaXMuX3BlbmRpbmdSZXF1ZXN0RGlzcG9zYWJsZXMuZGVsZXRlKHJlcXVlc3RJZCk7XG5cdFx0XHRyZXNvbHZlUmVxdWVzdChkYXRhKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBSZXF1ZXN0U3RvcmUjYWNjZXB0UmVwbHkgd2FzIGNhbGxlZCB3aXRob3V0IHJlY2VpdmluZyBhIG1hdGNoaW5nIHJlcXVlc3QgJHtyZXF1ZXN0SWR9YCk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLFNBQXNCLG9CQUFvQjtBQUMvRCxTQUFTLG1CQUFtQjtBQU1yQixJQUFNLGVBQU4sY0FBMkMsV0FBVztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFhNUQsWUFDQ0EsVUFDOEIsYUFDN0I7QUFDRCxVQUFNO0FBRndCO0FBZC9CLFNBQVEsaUJBQWlCO0FBRXpCLFNBQVEsbUJBQXVELG9CQUFJLElBQUk7QUFDdkUsU0FBUSw2QkFBeUQsb0JBQUksSUFBSTtBQUV6RSxTQUFpQixtQkFBbUIsS0FBSyxVQUFVLElBQUksUUFBNkMsQ0FBQztBQUNyRyxTQUFTLGtCQUFrQixLQUFLLGlCQUFpQjtBQVdoRCxTQUFLLFdBQVdBLGFBQVksU0FBWSxPQUFRQTtBQUNoRCxTQUFLLFVBQVUsYUFBYSxNQUFNO0FBQ2pDLGlCQUFXLEtBQUssS0FBSywyQkFBMkIsT0FBTyxHQUFHO0FBQ3pELGdCQUFRLENBQUM7QUFBQSxNQUNWO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLGNBQWMsTUFBK0I7QUFDNUMsV0FBTyxJQUFJLFFBQVcsQ0FBQyxTQUFTLFdBQVc7QUFDMUMsWUFBTSxZQUFZLEVBQUUsS0FBSztBQUN6QixXQUFLLGlCQUFpQixJQUFJLFdBQVcsT0FBTztBQUM1QyxXQUFLLGlCQUFpQixLQUFLLEVBQUUsV0FBVyxHQUFHLEtBQUssQ0FBQztBQUNqRCxZQUFNLGNBQWMsSUFBSSx3QkFBd0I7QUFDaEQsY0FBUSxLQUFLLFVBQVUsWUFBWSxLQUFLLEVBQUUsS0FBSyxNQUFNLE9BQU8sV0FBVyxTQUFTLGVBQWUsS0FBSyxRQUFRLEtBQUssQ0FBQztBQUNsSCxXQUFLLDJCQUEyQixJQUFJLFdBQVcsQ0FBQyxhQUFhLE1BQU0sWUFBWSxPQUFPLENBQUMsQ0FBQyxDQUFDO0FBQUEsSUFDMUYsQ0FBQztBQUFBLEVBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPQSxZQUFZLFdBQW1CLE1BQVM7QUFDdkMsVUFBTSxpQkFBaUIsS0FBSyxpQkFBaUIsSUFBSSxTQUFTO0FBQzFELFFBQUksZ0JBQWdCO0FBQ25CLFdBQUssaUJBQWlCLE9BQU8sU0FBUztBQUN0QyxjQUFRLEtBQUssMkJBQTJCLElBQUksU0FBUyxLQUFLLENBQUMsQ0FBQztBQUM1RCxXQUFLLDJCQUEyQixPQUFPLFNBQVM7QUFDaEQscUJBQWUsSUFBSTtBQUFBLElBQ3BCLE9BQU87QUFDTixXQUFLLFlBQVksS0FBSyw0RUFBNEUsU0FBUyxFQUFFO0FBQUEsSUFDOUc7QUFBQSxFQUNEO0FBQ0Q7QUF6RGEsZUFBTjtBQUFBLEVBZUo7QUFBQSxHQWZVOyIsCiAgIm5hbWVzIjogWyJ0aW1lb3V0Il0KfQo=
