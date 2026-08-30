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
import { ExtensionRecommendations } from "./extensionRecommendations.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { ExtensionRecommendationReason } from "../../../services/extensionRecommendations/common/extensionRecommendations.js";
let LanguageRecommendations = class extends ExtensionRecommendations {
  constructor(productService) {
    super();
    this.productService = productService;
    this._recommendations = [];
  }
  get recommendations() {
    return this._recommendations;
  }
  async doActivate() {
    if (this.productService.languageExtensionTips) {
      this._recommendations = this.productService.languageExtensionTips.map((extensionId) => ({
        extension: extensionId.toLowerCase(),
        reason: {
          reasonId: ExtensionRecommendationReason.Application,
          reasonText: ""
        }
      }));
    }
  }
};
LanguageRecommendations = __decorateClass([
  __decorateParam(0, IProductService)
], LanguageRecommendations);
export {
  LanguageRecommendations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGV4dGVuc2lvbnNcXGJyb3dzZXJcXGxhbmd1YWdlUmVjb21tZW5kYXRpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zLCBFeHRlbnNpb25SZWNvbW1lbmRhdGlvbiB9IGZyb20gJy4vZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblJlY29tbWVuZGF0aW9uUmVhc29uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zL2NvbW1vbi9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMuanMnO1xuXG5leHBvcnQgY2xhc3MgTGFuZ3VhZ2VSZWNvbW1lbmRhdGlvbnMgZXh0ZW5kcyBFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnMge1xuXG5cdHByaXZhdGUgX3JlY29tbWVuZGF0aW9uczogRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25bXSA9IFtdO1xuXHRnZXQgcmVjb21tZW5kYXRpb25zKCk6IFJlYWRvbmx5QXJyYXk8RXh0ZW5zaW9uUmVjb21tZW5kYXRpb24+IHsgcmV0dXJuIHRoaXMuX3JlY29tbWVuZGF0aW9uczsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGRvQWN0aXZhdGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMucHJvZHVjdFNlcnZpY2UubGFuZ3VhZ2VFeHRlbnNpb25UaXBzKSB7XG5cdFx0XHR0aGlzLl9yZWNvbW1lbmRhdGlvbnMgPSB0aGlzLnByb2R1Y3RTZXJ2aWNlLmxhbmd1YWdlRXh0ZW5zaW9uVGlwcy5tYXAoKGV4dGVuc2lvbklkKTogRXh0ZW5zaW9uUmVjb21tZW5kYXRpb24gPT4gKHtcblx0XHRcdFx0ZXh0ZW5zaW9uOiBleHRlbnNpb25JZC50b0xvd2VyQ2FzZSgpLFxuXHRcdFx0XHRyZWFzb246IHtcblx0XHRcdFx0XHRyZWFzb25JZDogRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25SZWFzb24uQXBwbGljYXRpb24sXG5cdFx0XHRcdFx0cmVhc29uVGV4dDogJydcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdDQUF5RDtBQUNsRSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHFDQUFxQztBQUV2QyxJQUFNLDBCQUFOLGNBQXNDLHlCQUF5QjtBQUFBLEVBS3JFLFlBQ21DLGdCQUNqQztBQUNELFVBQU07QUFGNEI7QUFKbkMsU0FBUSxtQkFBOEMsQ0FBQztBQUFBLEVBT3ZEO0FBQUEsRUFOQSxJQUFJLGtCQUEwRDtBQUFFLFdBQU8sS0FBSztBQUFBLEVBQWtCO0FBQUEsRUFROUYsTUFBZ0IsYUFBNEI7QUFDM0MsUUFBSSxLQUFLLGVBQWUsdUJBQXVCO0FBQzlDLFdBQUssbUJBQW1CLEtBQUssZUFBZSxzQkFBc0IsSUFBSSxDQUFDLGlCQUEwQztBQUFBLFFBQ2hILFdBQVcsWUFBWSxZQUFZO0FBQUEsUUFDbkMsUUFBUTtBQUFBLFVBQ1AsVUFBVSw4QkFBOEI7QUFBQSxVQUN4QyxZQUFZO0FBQUEsUUFDYjtBQUFBLE1BQ0QsRUFBRTtBQUFBLElBQ0g7QUFBQSxFQUNEO0FBQ0Q7QUF0QmEsMEJBQU47QUFBQSxFQU1KO0FBQUEsR0FOVTsiLAogICJuYW1lcyI6IFtdCn0K
