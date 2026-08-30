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
let KeymapRecommendations = class extends ExtensionRecommendations {
  constructor(productService) {
    super();
    this.productService = productService;
    this._recommendations = [];
  }
  get recommendations() {
    return this._recommendations;
  }
  async doActivate() {
    if (this.productService.keymapExtensionTips) {
      this._recommendations = this.productService.keymapExtensionTips.map((extensionId) => ({
        extension: extensionId.toLowerCase(),
        reason: {
          reasonId: ExtensionRecommendationReason.Application,
          reasonText: ""
        }
      }));
    }
  }
};
KeymapRecommendations = __decorateClass([
  __decorateParam(0, IProductService)
], KeymapRecommendations);
export {
  KeymapRecommendations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGV4dGVuc2lvbnNcXGJyb3dzZXJcXGtleW1hcFJlY29tbWVuZGF0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEV4dGVuc2lvblJlY29tbWVuZGF0aW9ucywgRXh0ZW5zaW9uUmVjb21tZW5kYXRpb24gfSBmcm9tICcuL2V4dGVuc2lvblJlY29tbWVuZGF0aW9ucy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25SZWNvbW1lbmRhdGlvblJlYXNvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvblJlY29tbWVuZGF0aW9ucy9jb21tb24vZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zLmpzJztcblxuZXhwb3J0IGNsYXNzIEtleW1hcFJlY29tbWVuZGF0aW9ucyBleHRlbmRzIEV4dGVuc2lvblJlY29tbWVuZGF0aW9ucyB7XG5cblx0cHJpdmF0ZSBfcmVjb21tZW5kYXRpb25zOiBFeHRlbnNpb25SZWNvbW1lbmRhdGlvbltdID0gW107XG5cdGdldCByZWNvbW1lbmRhdGlvbnMoKTogUmVhZG9ubHlBcnJheTxFeHRlbnNpb25SZWNvbW1lbmRhdGlvbj4geyByZXR1cm4gdGhpcy5fcmVjb21tZW5kYXRpb25zOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZG9BY3RpdmF0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5wcm9kdWN0U2VydmljZS5rZXltYXBFeHRlbnNpb25UaXBzKSB7XG5cdFx0XHR0aGlzLl9yZWNvbW1lbmRhdGlvbnMgPSB0aGlzLnByb2R1Y3RTZXJ2aWNlLmtleW1hcEV4dGVuc2lvblRpcHMubWFwKGV4dGVuc2lvbklkID0+ICh7XG5cdFx0XHRcdGV4dGVuc2lvbjogZXh0ZW5zaW9uSWQudG9Mb3dlckNhc2UoKSxcblx0XHRcdFx0cmVhc29uOiB7XG5cdFx0XHRcdFx0cmVhc29uSWQ6IEV4dGVuc2lvblJlY29tbWVuZGF0aW9uUmVhc29uLkFwcGxpY2F0aW9uLFxuXHRcdFx0XHRcdHJlYXNvblRleHQ6ICcnXG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxufVxuXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0NBQXlEO0FBQ2xFLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMscUNBQXFDO0FBRXZDLElBQU0sd0JBQU4sY0FBb0MseUJBQXlCO0FBQUEsRUFLbkUsWUFDbUMsZ0JBQ2pDO0FBQ0QsVUFBTTtBQUY0QjtBQUpuQyxTQUFRLG1CQUE4QyxDQUFDO0FBQUEsRUFPdkQ7QUFBQSxFQU5BLElBQUksa0JBQTBEO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBa0I7QUFBQSxFQVE5RixNQUFnQixhQUE0QjtBQUMzQyxRQUFJLEtBQUssZUFBZSxxQkFBcUI7QUFDNUMsV0FBSyxtQkFBbUIsS0FBSyxlQUFlLG9CQUFvQixJQUFJLGtCQUFnQjtBQUFBLFFBQ25GLFdBQVcsWUFBWSxZQUFZO0FBQUEsUUFDbkMsUUFBUTtBQUFBLFVBQ1AsVUFBVSw4QkFBOEI7QUFBQSxVQUN4QyxZQUFZO0FBQUEsUUFDYjtBQUFBLE1BQ0QsRUFBRTtBQUFBLElBQ0g7QUFBQSxFQUNEO0FBRUQ7QUF2QmEsd0JBQU47QUFBQSxFQU1KO0FBQUEsR0FOVTsiLAogICJuYW1lcyI6IFtdCn0K
