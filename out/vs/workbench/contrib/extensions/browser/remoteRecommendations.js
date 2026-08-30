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
import { PlatformToString, platform } from "../../../../base/common/platform.js";
let RemoteRecommendations = class extends ExtensionRecommendations {
  constructor(productService) {
    super();
    this.productService = productService;
    this._recommendations = [];
  }
  get recommendations() {
    return this._recommendations;
  }
  async doActivate() {
    const extensionTips = { ...this.productService.remoteExtensionTips, ...this.productService.virtualWorkspaceExtensionTips };
    const currentPlatform = PlatformToString(platform);
    this._recommendations = Object.values(extensionTips).filter(({ supportedPlatforms }) => !supportedPlatforms || supportedPlatforms.includes(currentPlatform)).map((extension) => ({
      extension: extension.extensionId.toLowerCase(),
      reason: {
        reasonId: ExtensionRecommendationReason.Application,
        reasonText: ""
      }
    }));
  }
};
RemoteRecommendations = __decorateClass([
  __decorateParam(0, IProductService)
], RemoteRecommendations);
export {
  RemoteRecommendations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGV4dGVuc2lvbnNcXGJyb3dzZXJcXHJlbW90ZVJlY29tbWVuZGF0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEV4dGVuc2lvblJlY29tbWVuZGF0aW9ucywgR2FsbGVyeUV4dGVuc2lvblJlY29tbWVuZGF0aW9uIH0gZnJvbSAnLi9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25SZWFzb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMvY29tbW9uL2V4dGVuc2lvblJlY29tbWVuZGF0aW9ucy5qcyc7XG5pbXBvcnQgeyBQbGF0Zm9ybVRvU3RyaW5nLCBwbGF0Zm9ybSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcblxuZXhwb3J0IGNsYXNzIFJlbW90ZVJlY29tbWVuZGF0aW9ucyBleHRlbmRzIEV4dGVuc2lvblJlY29tbWVuZGF0aW9ucyB7XG5cblx0cHJpdmF0ZSBfcmVjb21tZW5kYXRpb25zOiBHYWxsZXJ5RXh0ZW5zaW9uUmVjb21tZW5kYXRpb25bXSA9IFtdO1xuXHRnZXQgcmVjb21tZW5kYXRpb25zKCk6IFJlYWRvbmx5QXJyYXk8R2FsbGVyeUV4dGVuc2lvblJlY29tbWVuZGF0aW9uPiB7IHJldHVybiB0aGlzLl9yZWNvbW1lbmRhdGlvbnM7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBkb0FjdGl2YXRlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvblRpcHMgPSB7IC4uLnRoaXMucHJvZHVjdFNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uVGlwcywgLi4udGhpcy5wcm9kdWN0U2VydmljZS52aXJ0dWFsV29ya3NwYWNlRXh0ZW5zaW9uVGlwcyB9O1xuXHRcdGNvbnN0IGN1cnJlbnRQbGF0Zm9ybSA9IFBsYXRmb3JtVG9TdHJpbmcocGxhdGZvcm0pO1xuXHRcdHRoaXMuX3JlY29tbWVuZGF0aW9ucyA9IE9iamVjdC52YWx1ZXMoZXh0ZW5zaW9uVGlwcykuZmlsdGVyKCh7IHN1cHBvcnRlZFBsYXRmb3JtcyB9KSA9PiAhc3VwcG9ydGVkUGxhdGZvcm1zIHx8IHN1cHBvcnRlZFBsYXRmb3Jtcy5pbmNsdWRlcyhjdXJyZW50UGxhdGZvcm0pKS5tYXAoZXh0ZW5zaW9uID0+ICh7XG5cdFx0XHRleHRlbnNpb246IGV4dGVuc2lvbi5leHRlbnNpb25JZC50b0xvd2VyQ2FzZSgpLFxuXHRcdFx0cmVhc29uOiB7XG5cdFx0XHRcdHJlYXNvbklkOiBFeHRlbnNpb25SZWNvbW1lbmRhdGlvblJlYXNvbi5BcHBsaWNhdGlvbixcblx0XHRcdFx0cmVhc29uVGV4dDogJydcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cbn1cblxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdDQUFnRTtBQUN6RSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLGtCQUFrQixnQkFBZ0I7QUFFcEMsSUFBTSx3QkFBTixjQUFvQyx5QkFBeUI7QUFBQSxFQUtuRSxZQUNtQyxnQkFDakM7QUFDRCxVQUFNO0FBRjRCO0FBSm5DLFNBQVEsbUJBQXFELENBQUM7QUFBQSxFQU85RDtBQUFBLEVBTkEsSUFBSSxrQkFBaUU7QUFBRSxXQUFPLEtBQUs7QUFBQSxFQUFrQjtBQUFBLEVBUXJHLE1BQWdCLGFBQTRCO0FBQzNDLFVBQU0sZ0JBQWdCLEVBQUUsR0FBRyxLQUFLLGVBQWUscUJBQXFCLEdBQUcsS0FBSyxlQUFlLDhCQUE4QjtBQUN6SCxVQUFNLGtCQUFrQixpQkFBaUIsUUFBUTtBQUNqRCxTQUFLLG1CQUFtQixPQUFPLE9BQU8sYUFBYSxFQUFFLE9BQU8sQ0FBQyxFQUFFLG1CQUFtQixNQUFNLENBQUMsc0JBQXNCLG1CQUFtQixTQUFTLGVBQWUsQ0FBQyxFQUFFLElBQUksZ0JBQWM7QUFBQSxNQUM5SyxXQUFXLFVBQVUsWUFBWSxZQUFZO0FBQUEsTUFDN0MsUUFBUTtBQUFBLFFBQ1AsVUFBVSw4QkFBOEI7QUFBQSxRQUN4QyxZQUFZO0FBQUEsTUFDYjtBQUFBLElBQ0QsRUFBRTtBQUFBLEVBQ0g7QUFDRDtBQXRCYSx3QkFBTjtBQUFBLEVBTUo7QUFBQSxHQU5VOyIsCiAgIm5hbWVzIjogW10KfQo=
