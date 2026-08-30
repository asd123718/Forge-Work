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
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { encodeBase64 } from "../../../../base/common/buffer.js";
let NativeScreenshotService = class {
  constructor(nativeHostService) {
    this.nativeHostService = nativeHostService;
  }
  async captureScreenshot(rect) {
    const buffer = await this.nativeHostService.getScreenshot(rect);
    if (!buffer) {
      return void 0;
    }
    return `data:image/jpeg;base64,${encodeBase64(buffer)}`;
  }
};
NativeScreenshotService = __decorateClass([
  __decorateParam(0, INativeHostService)
], NativeScreenshotService);
export {
  NativeScreenshotService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGlzc3VlXFxlbGVjdHJvbi1icm93c2VyXFxuYXRpdmVTY3JlZW5zaG90U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElOYXRpdmVIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9jb21tb24vbmF0aXZlLmpzJztcbmltcG9ydCB7IElSZWN0YW5nbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJU2NyZWVuc2hvdFNlcnZpY2UgfSBmcm9tICcuLi9icm93c2VyL3NjcmVlbnNob3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGVuY29kZUJhc2U2NCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5cbmV4cG9ydCBjbGFzcyBOYXRpdmVTY3JlZW5zaG90U2VydmljZSBpbXBsZW1lbnRzIElTY3JlZW5zaG90U2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU5hdGl2ZUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbmF0aXZlSG9zdFNlcnZpY2U6IElOYXRpdmVIb3N0U2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBjYXB0dXJlU2NyZWVuc2hvdChyZWN0PzogSVJlY3RhbmdsZSk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYnVmZmVyID0gYXdhaXQgdGhpcy5uYXRpdmVIb3N0U2VydmljZS5nZXRTY3JlZW5zaG90KHJlY3QpO1xuXHRcdGlmICghYnVmZmVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBgZGF0YTppbWFnZS9qcGVnO2Jhc2U2NCwke2VuY29kZUJhc2U2NChidWZmZXIpfWA7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUywwQkFBMEI7QUFHbkMsU0FBUyxvQkFBb0I7QUFFdEIsSUFBTSwwQkFBTixNQUE0RDtBQUFBLEVBR2xFLFlBQ3NDLG1CQUNwQztBQURvQztBQUFBLEVBQ2xDO0FBQUEsRUFFSixNQUFNLGtCQUFrQixNQUFnRDtBQUN2RSxVQUFNLFNBQVMsTUFBTSxLQUFLLGtCQUFrQixjQUFjLElBQUk7QUFDOUQsUUFBSSxDQUFDLFFBQVE7QUFDWixhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU8sMEJBQTBCLGFBQWEsTUFBTSxDQUFDO0FBQUEsRUFDdEQ7QUFDRDtBQWZhLDBCQUFOO0FBQUEsRUFJSjtBQUFBLEdBSlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
