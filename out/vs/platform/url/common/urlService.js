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
import { first } from "../../../base/common/async.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { IProductService } from "../../product/common/productService.js";
class AbstractURLService extends Disposable {
  constructor() {
    super(...arguments);
    this.handlers = /* @__PURE__ */ new Set();
  }
  open(uri, options) {
    const handlers = [...this.handlers.values()];
    return first(handlers.map((h) => () => h.handleURL(uri, options)), void 0, false).then((val) => val || false);
  }
  registerHandler(handler) {
    this.handlers.add(handler);
    return toDisposable(() => this.handlers.delete(handler));
  }
}
let NativeURLService = class extends AbstractURLService {
  constructor(productService) {
    super();
    this.productService = productService;
  }
  create(options) {
    let { authority, path, query, fragment } = options ? options : { authority: void 0, path: void 0, query: void 0, fragment: void 0 };
    if (authority && path && path.indexOf("/") !== 0) {
      path = `/${path}`;
    }
    return URI.from({ scheme: this.productService.urlProtocol, authority, path, query, fragment });
  }
};
NativeURLService = __decorateClass([
  __decorateParam(0, IProductService)
], NativeURLService);
export {
  AbstractURLService,
  NativeURLService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXJsXFxjb21tb25cXHVybFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBmaXJzdCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElPcGVuVVJMT3B0aW9ucywgSVVSTEhhbmRsZXIsIElVUkxTZXJ2aWNlIH0gZnJvbSAnLi91cmwuanMnO1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RVUkxTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElVUkxTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGhhbmRsZXJzID0gbmV3IFNldDxJVVJMSGFuZGxlcj4oKTtcblxuXHRhYnN0cmFjdCBjcmVhdGUob3B0aW9ucz86IFBhcnRpYWw8VXJpQ29tcG9uZW50cz4pOiBVUkk7XG5cblx0b3Blbih1cmk6IFVSSSwgb3B0aW9ucz86IElPcGVuVVJMT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGhhbmRsZXJzID0gWy4uLnRoaXMuaGFuZGxlcnMudmFsdWVzKCldO1xuXHRcdHJldHVybiBmaXJzdChoYW5kbGVycy5tYXAoaCA9PiAoKSA9PiBoLmhhbmRsZVVSTCh1cmksIG9wdGlvbnMpKSwgdW5kZWZpbmVkLCBmYWxzZSkudGhlbih2YWwgPT4gdmFsIHx8IGZhbHNlKTtcblx0fVxuXG5cdHJlZ2lzdGVySGFuZGxlcihoYW5kbGVyOiBJVVJMSGFuZGxlcik6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLmhhbmRsZXJzLmFkZChoYW5kbGVyKTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuaGFuZGxlcnMuZGVsZXRlKGhhbmRsZXIpKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTmF0aXZlVVJMU2VydmljZSBleHRlbmRzIEFic3RyYWN0VVJMU2VydmljZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0Y3JlYXRlKG9wdGlvbnM/OiBQYXJ0aWFsPFVyaUNvbXBvbmVudHM+KTogVVJJIHtcblx0XHRsZXQgeyBhdXRob3JpdHksIHBhdGgsIHF1ZXJ5LCBmcmFnbWVudCB9ID0gb3B0aW9ucyA/IG9wdGlvbnMgOiB7IGF1dGhvcml0eTogdW5kZWZpbmVkLCBwYXRoOiB1bmRlZmluZWQsIHF1ZXJ5OiB1bmRlZmluZWQsIGZyYWdtZW50OiB1bmRlZmluZWQgfTtcblxuXHRcdGlmIChhdXRob3JpdHkgJiYgcGF0aCAmJiBwYXRoLmluZGV4T2YoJy8nKSAhPT0gMCkge1xuXHRcdFx0cGF0aCA9IGAvJHtwYXRofWA7IC8vIFVSSSB2YWxpZGF0aW9uIHJlcXVpcmVzIGEgcGF0aCBpZiB0aGVyZSBpcyBhbiBhdXRob3JpdHlcblx0XHR9XG5cblx0XHRyZXR1cm4gVVJJLmZyb20oeyBzY2hlbWU6IHRoaXMucHJvZHVjdFNlcnZpY2UudXJsUHJvdG9jb2wsIGF1dGhvcml0eSwgcGF0aCwgcXVlcnksIGZyYWdtZW50IH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsYUFBYTtBQUN0QixTQUFTLFlBQXlCLG9CQUFvQjtBQUN0RCxTQUFTLFdBQTBCO0FBQ25DLFNBQVMsdUJBQXVCO0FBR3pCLE1BQWUsMkJBQTJCLFdBQWtDO0FBQUEsRUFBNUU7QUFBQTtBQUlOLFNBQVEsV0FBVyxvQkFBSSxJQUFpQjtBQUFBO0FBQUEsRUFJeEMsS0FBSyxLQUFVLFNBQTZDO0FBQzNELFVBQU0sV0FBVyxDQUFDLEdBQUcsS0FBSyxTQUFTLE9BQU8sQ0FBQztBQUMzQyxXQUFPLE1BQU0sU0FBUyxJQUFJLE9BQUssTUFBTSxFQUFFLFVBQVUsS0FBSyxPQUFPLENBQUMsR0FBRyxRQUFXLEtBQUssRUFBRSxLQUFLLFNBQU8sT0FBTyxLQUFLO0FBQUEsRUFDNUc7QUFBQSxFQUVBLGdCQUFnQixTQUFtQztBQUNsRCxTQUFLLFNBQVMsSUFBSSxPQUFPO0FBQ3pCLFdBQU8sYUFBYSxNQUFNLEtBQUssU0FBUyxPQUFPLE9BQU8sQ0FBQztBQUFBLEVBQ3hEO0FBQ0Q7QUFFTyxJQUFNLG1CQUFOLGNBQStCLG1CQUFtQjtBQUFBLEVBRXhELFlBQ3FDLGdCQUNuQztBQUNELFVBQU07QUFGOEI7QUFBQSxFQUdyQztBQUFBLEVBRUEsT0FBTyxTQUF1QztBQUM3QyxRQUFJLEVBQUUsV0FBVyxNQUFNLE9BQU8sU0FBUyxJQUFJLFVBQVUsVUFBVSxFQUFFLFdBQVcsUUFBVyxNQUFNLFFBQVcsT0FBTyxRQUFXLFVBQVUsT0FBVTtBQUU5SSxRQUFJLGFBQWEsUUFBUSxLQUFLLFFBQVEsR0FBRyxNQUFNLEdBQUc7QUFDakQsYUFBTyxJQUFJLElBQUk7QUFBQSxJQUNoQjtBQUVBLFdBQU8sSUFBSSxLQUFLLEVBQUUsUUFBUSxLQUFLLGVBQWUsYUFBYSxXQUFXLE1BQU0sT0FBTyxTQUFTLENBQUM7QUFBQSxFQUM5RjtBQUNEO0FBakJhLG1CQUFOO0FBQUEsRUFHSjtBQUFBLEdBSFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
