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
import { Disposable } from "../../../../../../../base/common/lifecycle.js";
import { ILanguageService } from "../../../../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../../../../editor/common/services/resolverService.js";
import { chatInputSchemes } from "../../../../common/constants.js";
let ChatInputBoxContentProvider = class extends Disposable {
  constructor(textModelService, modelService, languageService) {
    super();
    this.modelService = modelService;
    this.languageService = languageService;
    for (const scheme of chatInputSchemes) {
      this._register(textModelService.registerTextModelContentProvider(scheme, this));
    }
  }
  async provideTextContent(resource) {
    const existing = this.modelService.getModel(resource);
    if (existing) {
      return existing;
    }
    return this.modelService.createModel("", this.languageService.createById("chatinput"), resource);
  }
};
ChatInputBoxContentProvider = __decorateClass([
  __decorateParam(0, ITextModelService),
  __decorateParam(1, IModelService),
  __decorateParam(2, ILanguageService)
], ChatInputBoxContentProvider);
export {
  ChatInputBoxContentProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXGVkaXRvclxcY2hhdEVkaXRvcklucHV0Q29udGVudFByb3ZpZGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIsIElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY2hhdElucHV0U2NoZW1lcyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuXG5cbmV4cG9ydCBjbGFzcyBDaGF0SW5wdXRCb3hDb250ZW50UHJvdmlkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRleHRNb2RlbENvbnRlbnRQcm92aWRlciB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSB0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdC8vIEV2ZXJ5IGNoYXQgaW5wdXQgc2NoZW1lIG5lZWRzIHRoaXM6IHBhc3RlIGVkaXRzIGFyZSBhcHBsaWVkIHRocm91Z2ggdGhlXG5cdFx0Ly8gYnVsayBlZGl0IHNlcnZpY2UsIHdoaWNoIHJlc29sdmVzIHRoZSB0YXJnZXQgbW9kZWwgYnkgVVJJLlxuXHRcdGZvciAoY29uc3Qgc2NoZW1lIG9mIGNoYXRJbnB1dFNjaGVtZXMpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRleHRNb2RlbFNlcnZpY2UucmVnaXN0ZXJUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIoc2NoZW1lLCB0aGlzKSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcHJvdmlkZVRleHRDb250ZW50KHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElUZXh0TW9kZWwgfCBudWxsPiB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLm1vZGVsU2VydmljZS5nZXRNb2RlbChyZXNvdXJjZSk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm1vZGVsU2VydmljZS5jcmVhdGVNb2RlbCgnJywgdGhpcy5sYW5ndWFnZVNlcnZpY2UuY3JlYXRlQnlJZCgnY2hhdGlucHV0JyksIHJlc291cmNlKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQjtBQUUzQixTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFvQyx5QkFBeUI7QUFDN0QsU0FBUyx3QkFBd0I7QUFHMUIsSUFBTSw4QkFBTixjQUEwQyxXQUFnRDtBQUFBLEVBQ2hHLFlBQ29CLGtCQUNhLGNBQ0csaUJBQ2xDO0FBQ0QsVUFBTTtBQUgwQjtBQUNHO0FBS25DLGVBQVcsVUFBVSxrQkFBa0I7QUFDdEMsV0FBSyxVQUFVLGlCQUFpQixpQ0FBaUMsUUFBUSxJQUFJLENBQUM7QUFBQSxJQUMvRTtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sbUJBQW1CLFVBQTJDO0FBQ25FLFVBQU0sV0FBVyxLQUFLLGFBQWEsU0FBUyxRQUFRO0FBQ3BELFFBQUksVUFBVTtBQUNiLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxLQUFLLGFBQWEsWUFBWSxJQUFJLEtBQUssZ0JBQWdCLFdBQVcsV0FBVyxHQUFHLFFBQVE7QUFBQSxFQUNoRztBQUNEO0FBckJhLDhCQUFOO0FBQUEsRUFFSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FKVTsiLAogICJuYW1lcyI6IFtdCn0K
