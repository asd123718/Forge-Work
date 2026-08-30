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
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
let NotebookRendererMessagingService = class extends Disposable {
  constructor(extensionService) {
    super();
    this.extensionService = extensionService;
    /**
     * Activation promises. Maps renderer IDs to a queue of messages that should
     * be sent once activation finishes, or undefined if activation is complete.
     */
    this.activations = /* @__PURE__ */ new Map();
    this.scopedMessaging = /* @__PURE__ */ new Map();
    this.postMessageEmitter = this._register(new Emitter());
    this.onShouldPostMessage = this.postMessageEmitter.event;
  }
  /** @inheritdoc */
  receiveMessage(editorId, rendererId, message) {
    if (editorId === void 0) {
      const sends = [...this.scopedMessaging.values()].map((e) => e.receiveMessageHandler?.(rendererId, message));
      return Promise.all(sends).then((s) => s.some((s2) => !!s2));
    }
    return this.scopedMessaging.get(editorId)?.receiveMessageHandler?.(rendererId, message) ?? Promise.resolve(false);
  }
  /** @inheritdoc */
  prepare(rendererId) {
    if (this.activations.has(rendererId)) {
      return;
    }
    const queue = [];
    this.activations.set(rendererId, queue);
    this.extensionService.activateByEvent(`onRenderer:${rendererId}`).then(() => {
      for (const message of queue) {
        this.postMessageEmitter.fire(message);
      }
      this.activations.set(rendererId, void 0);
    });
  }
  /** @inheritdoc */
  getScoped(editorId) {
    const existing = this.scopedMessaging.get(editorId);
    if (existing) {
      return existing;
    }
    const messaging = {
      postMessage: (rendererId, message) => this.postMessage(editorId, rendererId, message),
      dispose: () => this.scopedMessaging.delete(editorId)
    };
    this.scopedMessaging.set(editorId, messaging);
    return messaging;
  }
  postMessage(editorId, rendererId, message) {
    if (!this.activations.has(rendererId)) {
      this.prepare(rendererId);
    }
    const activation = this.activations.get(rendererId);
    const toSend = { rendererId, editorId, message };
    if (activation === void 0) {
      this.postMessageEmitter.fire(toSend);
    } else {
      activation.push(toSend);
    }
  }
};
NotebookRendererMessagingService = __decorateClass([
  __decorateParam(0, IExtensionService)
], NotebookRendererMessagingService);
export {
  NotebookRendererMessagingService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxzZXJ2aWNlc1xcbm90ZWJvb2tSZW5kZXJlck1lc3NhZ2luZ1NlcnZpY2VJbXBsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rUmVuZGVyZXJNZXNzYWdpbmdTZXJ2aWNlLCBJU2NvcGVkUmVuZGVyZXJNZXNzYWdpbmcgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tSZW5kZXJlck1lc3NhZ2luZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcblxudHlwZSBNZXNzYWdlVG9TZW5kID0geyBlZGl0b3JJZDogc3RyaW5nOyByZW5kZXJlcklkOiBzdHJpbmc7IG1lc3NhZ2U6IHVua25vd24gfTtcblxuZXhwb3J0IGNsYXNzIE5vdGVib29rUmVuZGVyZXJNZXNzYWdpbmdTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElOb3RlYm9va1JlbmRlcmVyTWVzc2FnaW5nU2VydmljZSB7XG5cdGRlY2xhcmUgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHQvKipcblx0ICogQWN0aXZhdGlvbiBwcm9taXNlcy4gTWFwcyByZW5kZXJlciBJRHMgdG8gYSBxdWV1ZSBvZiBtZXNzYWdlcyB0aGF0IHNob3VsZFxuXHQgKiBiZSBzZW50IG9uY2UgYWN0aXZhdGlvbiBmaW5pc2hlcywgb3IgdW5kZWZpbmVkIGlmIGFjdGl2YXRpb24gaXMgY29tcGxldGUuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGl2YXRpb25zID0gbmV3IE1hcDxzdHJpbmcgLyogcmVuZGVyZXJJZCAqLywgdW5kZWZpbmVkIHwgTWVzc2FnZVRvU2VuZFtdPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNjb3BlZE1lc3NhZ2luZyA9IG5ldyBNYXA8LyogZWRpdG9ySWQgKi8gc3RyaW5nLCBJU2NvcGVkUmVuZGVyZXJNZXNzYWdpbmc+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgcG9zdE1lc3NhZ2VFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8TWVzc2FnZVRvU2VuZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvblNob3VsZFBvc3RNZXNzYWdlID0gdGhpcy5wb3N0TWVzc2FnZUVtaXR0ZXIuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgcmVjZWl2ZU1lc3NhZ2UoZWRpdG9ySWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgcmVuZGVyZXJJZDogc3RyaW5nLCBtZXNzYWdlOiB1bmtub3duKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKGVkaXRvcklkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IHNlbmRzID0gWy4uLnRoaXMuc2NvcGVkTWVzc2FnaW5nLnZhbHVlcygpXS5tYXAoZSA9PiBlLnJlY2VpdmVNZXNzYWdlSGFuZGxlcj8uKHJlbmRlcmVySWQsIG1lc3NhZ2UpKTtcblx0XHRcdHJldHVybiBQcm9taXNlLmFsbChzZW5kcykudGhlbihzID0+IHMuc29tZShzID0+ICEhcykpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnNjb3BlZE1lc3NhZ2luZy5nZXQoZWRpdG9ySWQpPy5yZWNlaXZlTWVzc2FnZUhhbmRsZXI/LihyZW5kZXJlcklkLCBtZXNzYWdlKSA/PyBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyBwcmVwYXJlKHJlbmRlcmVySWQ6IHN0cmluZykge1xuXHRcdGlmICh0aGlzLmFjdGl2YXRpb25zLmhhcyhyZW5kZXJlcklkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHF1ZXVlOiBNZXNzYWdlVG9TZW5kW10gPSBbXTtcblx0XHR0aGlzLmFjdGl2YXRpb25zLnNldChyZW5kZXJlcklkLCBxdWV1ZSk7XG5cblx0XHR0aGlzLmV4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KGBvblJlbmRlcmVyOiR7cmVuZGVyZXJJZH1gKS50aGVuKCgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgbWVzc2FnZSBvZiBxdWV1ZSkge1xuXHRcdFx0XHR0aGlzLnBvc3RNZXNzYWdlRW1pdHRlci5maXJlKG1lc3NhZ2UpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmFjdGl2YXRpb25zLnNldChyZW5kZXJlcklkLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyBnZXRTY29wZWQoZWRpdG9ySWQ6IHN0cmluZyk6IElTY29wZWRSZW5kZXJlck1lc3NhZ2luZyB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLnNjb3BlZE1lc3NhZ2luZy5nZXQoZWRpdG9ySWQpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1lc3NhZ2luZzogSVNjb3BlZFJlbmRlcmVyTWVzc2FnaW5nID0ge1xuXHRcdFx0cG9zdE1lc3NhZ2U6IChyZW5kZXJlcklkLCBtZXNzYWdlKSA9PiB0aGlzLnBvc3RNZXNzYWdlKGVkaXRvcklkLCByZW5kZXJlcklkLCBtZXNzYWdlKSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHRoaXMuc2NvcGVkTWVzc2FnaW5nLmRlbGV0ZShlZGl0b3JJZCksXG5cdFx0fTtcblxuXHRcdHRoaXMuc2NvcGVkTWVzc2FnaW5nLnNldChlZGl0b3JJZCwgbWVzc2FnaW5nKTtcblx0XHRyZXR1cm4gbWVzc2FnaW5nO1xuXHR9XG5cblx0cHJpdmF0ZSBwb3N0TWVzc2FnZShlZGl0b3JJZDogc3RyaW5nLCByZW5kZXJlcklkOiBzdHJpbmcsIG1lc3NhZ2U6IHVua25vd24pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuYWN0aXZhdGlvbnMuaGFzKHJlbmRlcmVySWQpKSB7XG5cdFx0XHR0aGlzLnByZXBhcmUocmVuZGVyZXJJZCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aXZhdGlvbiA9IHRoaXMuYWN0aXZhdGlvbnMuZ2V0KHJlbmRlcmVySWQpO1xuXHRcdGNvbnN0IHRvU2VuZCA9IHsgcmVuZGVyZXJJZCwgZWRpdG9ySWQsIG1lc3NhZ2UgfTtcblx0XHRpZiAoYWN0aXZhdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLnBvc3RNZXNzYWdlRW1pdHRlci5maXJlKHRvU2VuZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFjdGl2YXRpb24ucHVzaCh0b1NlbmQpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyx5QkFBeUI7QUFJM0IsSUFBTSxtQ0FBTixjQUErQyxXQUF3RDtBQUFBLEVBVzdHLFlBQ3FDLGtCQUNuQztBQUNELFVBQU07QUFGOEI7QUFOckM7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFpQixjQUFjLG9CQUFJLElBQTBEO0FBQzdGLFNBQWlCLGtCQUFrQixvQkFBSSxJQUFxRDtBQUM1RixTQUFpQixxQkFBcUIsS0FBSyxVQUFVLElBQUksUUFBdUIsQ0FBQztBQUNqRixTQUFnQixzQkFBc0IsS0FBSyxtQkFBbUI7QUFBQSxFQU05RDtBQUFBO0FBQUEsRUFHTyxlQUFlLFVBQThCLFlBQW9CLFNBQW9DO0FBQzNHLFFBQUksYUFBYSxRQUFXO0FBQzNCLFlBQU0sUUFBUSxDQUFDLEdBQUcsS0FBSyxnQkFBZ0IsT0FBTyxDQUFDLEVBQUUsSUFBSSxPQUFLLEVBQUUsd0JBQXdCLFlBQVksT0FBTyxDQUFDO0FBQ3hHLGFBQU8sUUFBUSxJQUFJLEtBQUssRUFBRSxLQUFLLE9BQUssRUFBRSxLQUFLLENBQUFBLE9BQUssQ0FBQyxDQUFDQSxFQUFDLENBQUM7QUFBQSxJQUNyRDtBQUVBLFdBQU8sS0FBSyxnQkFBZ0IsSUFBSSxRQUFRLEdBQUcsd0JBQXdCLFlBQVksT0FBTyxLQUFLLFFBQVEsUUFBUSxLQUFLO0FBQUEsRUFDakg7QUFBQTtBQUFBLEVBR08sUUFBUSxZQUFvQjtBQUNsQyxRQUFJLEtBQUssWUFBWSxJQUFJLFVBQVUsR0FBRztBQUNyQztBQUFBLElBQ0Q7QUFFQSxVQUFNLFFBQXlCLENBQUM7QUFDaEMsU0FBSyxZQUFZLElBQUksWUFBWSxLQUFLO0FBRXRDLFNBQUssaUJBQWlCLGdCQUFnQixjQUFjLFVBQVUsRUFBRSxFQUFFLEtBQUssTUFBTTtBQUM1RSxpQkFBVyxXQUFXLE9BQU87QUFDNUIsYUFBSyxtQkFBbUIsS0FBSyxPQUFPO0FBQUEsTUFDckM7QUFFQSxXQUFLLFlBQVksSUFBSSxZQUFZLE1BQVM7QUFBQSxJQUMzQyxDQUFDO0FBQUEsRUFDRjtBQUFBO0FBQUEsRUFHTyxVQUFVLFVBQTRDO0FBQzVELFVBQU0sV0FBVyxLQUFLLGdCQUFnQixJQUFJLFFBQVE7QUFDbEQsUUFBSSxVQUFVO0FBQ2IsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFlBQXNDO0FBQUEsTUFDM0MsYUFBYSxDQUFDLFlBQVksWUFBWSxLQUFLLFlBQVksVUFBVSxZQUFZLE9BQU87QUFBQSxNQUNwRixTQUFTLE1BQU0sS0FBSyxnQkFBZ0IsT0FBTyxRQUFRO0FBQUEsSUFDcEQ7QUFFQSxTQUFLLGdCQUFnQixJQUFJLFVBQVUsU0FBUztBQUM1QyxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsWUFBWSxVQUFrQixZQUFvQixTQUF3QjtBQUNqRixRQUFJLENBQUMsS0FBSyxZQUFZLElBQUksVUFBVSxHQUFHO0FBQ3RDLFdBQUssUUFBUSxVQUFVO0FBQUEsSUFDeEI7QUFFQSxVQUFNLGFBQWEsS0FBSyxZQUFZLElBQUksVUFBVTtBQUNsRCxVQUFNLFNBQVMsRUFBRSxZQUFZLFVBQVUsUUFBUTtBQUMvQyxRQUFJLGVBQWUsUUFBVztBQUM3QixXQUFLLG1CQUFtQixLQUFLLE1BQU07QUFBQSxJQUNwQyxPQUFPO0FBQ04saUJBQVcsS0FBSyxNQUFNO0FBQUEsSUFDdkI7QUFBQSxFQUNEO0FBQ0Q7QUExRWEsbUNBQU47QUFBQSxFQVlKO0FBQUEsR0FaVTsiLAogICJuYW1lcyI6IFsicyJdCn0K
