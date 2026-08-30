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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { derived } from "../../../../base/common/observable.js";
import { IGitHubService } from "../../github/browser/githubService.js";
let ChecksViewModel = class extends Disposable {
  constructor(gitHubService) {
    super();
    this.checksObs = derived(this, (reader) => {
      return gitHubService.activeSessionPullRequestCIObs.read(reader);
    });
  }
};
ChecksViewModel = __decorateClass([
  __decorateParam(0, IGitHubService)
], ChecksViewModel);
export {
  ChecksViewModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhbmdlc1xcYnJvd3NlclxcY2hlY2tzVmlld01vZGVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBkZXJpdmVkLCBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSUdpdEh1YlNlcnZpY2UgfSBmcm9tICcuLi8uLi9naXRodWIvYnJvd3Nlci9naXRodWJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEdpdEh1YlB1bGxSZXF1ZXN0Q0lNb2RlbCB9IGZyb20gJy4uLy4uL2dpdGh1Yi9icm93c2VyL21vZGVscy9naXRodWJQdWxsUmVxdWVzdENJTW9kZWwuanMnO1xuXG5leHBvcnQgY2xhc3MgQ2hlY2tzVmlld01vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IGNoZWNrc09iczogSU9ic2VydmFibGU8R2l0SHViUHVsbFJlcXVlc3RDSU1vZGVsIHwgdW5kZWZpbmVkPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUdpdEh1YlNlcnZpY2UgZ2l0SHViU2VydmljZTogSUdpdEh1YlNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmNoZWNrc09icyA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdHJldHVybiBnaXRIdWJTZXJ2aWNlLmFjdGl2ZVNlc3Npb25QdWxsUmVxdWVzdENJT2JzLnJlYWQocmVhZGVyKTtcblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQTRCO0FBQ3JDLFNBQVMsc0JBQXNCO0FBR3hCLElBQU0sa0JBQU4sY0FBOEIsV0FBVztBQUFBLEVBRy9DLFlBQ2lCLGVBQ2Y7QUFDRCxVQUFNO0FBRU4sU0FBSyxZQUFZLFFBQVEsTUFBTSxZQUFVO0FBQ3hDLGFBQU8sY0FBYyw4QkFBOEIsS0FBSyxNQUFNO0FBQUEsSUFDL0QsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQVphLGtCQUFOO0FBQUEsRUFJSjtBQUFBLEdBSlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
