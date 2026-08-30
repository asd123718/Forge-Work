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
import { EditorModel } from "./editorModel.js";
import { IFileService } from "../../../platform/files/common/files.js";
import { Mimes } from "../../../base/common/mime.js";
let BinaryEditorModel = class extends EditorModel {
  constructor(resource, name, fileService) {
    super();
    this.resource = resource;
    this.name = name;
    this.fileService = fileService;
    this.mime = Mimes.binary;
  }
  /**
   * The name of the binary resource.
   */
  getName() {
    return this.name;
  }
  /**
   * The size of the binary resource if known.
   */
  getSize() {
    return this.size;
  }
  /**
   * The mime of the binary resource if known.
   */
  getMime() {
    return this.mime;
  }
  /**
   * The etag of the binary resource if known.
   */
  getETag() {
    return this.etag;
  }
  async resolve() {
    if (this.fileService.hasProvider(this.resource)) {
      const stat = await this.fileService.stat(this.resource);
      this.etag = stat.etag;
      if (typeof stat.size === "number") {
        this.size = stat.size;
      }
    }
    return super.resolve();
  }
};
BinaryEditorModel = __decorateClass([
  __decorateParam(2, IFileService)
], BinaryEditorModel);
export {
  BinaryEditorModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbW1vblxcZWRpdG9yXFxiaW5hcnlFZGl0b3JNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVkaXRvck1vZGVsIH0gZnJvbSAnLi9lZGl0b3JNb2RlbC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IE1pbWVzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWltZS5qcyc7XG5cbi8qKlxuICogQW4gZWRpdG9yIG1vZGVsIHRoYXQganVzdCByZXByZXNlbnRzIGEgcmVzb3VyY2UgdGhhdCBjYW4gYmUgbG9hZGVkLlxuICovXG5leHBvcnQgY2xhc3MgQmluYXJ5RWRpdG9yTW9kZWwgZXh0ZW5kcyBFZGl0b3JNb2RlbCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBtaW1lID0gTWltZXMuYmluYXJ5O1xuXG5cdHByaXZhdGUgc2l6ZTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGV0YWc6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSByZXNvdXJjZTogVVJJLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbmFtZTogc3RyaW5nLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIG5hbWUgb2YgdGhlIGJpbmFyeSByZXNvdXJjZS5cblx0ICovXG5cdGdldE5hbWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5uYW1lO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBzaXplIG9mIHRoZSBiaW5hcnkgcmVzb3VyY2UgaWYga25vd24uXG5cdCAqL1xuXHRnZXRTaXplKCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuc2l6ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgbWltZSBvZiB0aGUgYmluYXJ5IHJlc291cmNlIGlmIGtub3duLlxuXHQgKi9cblx0Z2V0TWltZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLm1pbWU7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIGV0YWcgb2YgdGhlIGJpbmFyeSByZXNvdXJjZSBpZiBrbm93bi5cblx0ICovXG5cdGdldEVUYWcoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5ldGFnO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIE1ha2Ugc3VyZSB0byByZXNvbHZlIHVwIHRvIGRhdGUgc3RhdCBmb3IgZmlsZSByZXNvdXJjZXNcblx0XHRpZiAodGhpcy5maWxlU2VydmljZS5oYXNQcm92aWRlcih0aGlzLnJlc291cmNlKSkge1xuXHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uuc3RhdCh0aGlzLnJlc291cmNlKTtcblx0XHRcdHRoaXMuZXRhZyA9IHN0YXQuZXRhZztcblx0XHRcdGlmICh0eXBlb2Ygc3RhdC5zaXplID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHR0aGlzLnNpemUgPSBzdGF0LnNpemU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN1cGVyLnJlc29sdmUoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLG1CQUFtQjtBQUU1QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGFBQWE7QUFLZixJQUFNLG9CQUFOLGNBQWdDLFlBQVk7QUFBQSxFQU9sRCxZQUNVLFVBQ1EsTUFDYyxhQUM5QjtBQUNELFVBQU07QUFKRztBQUNRO0FBQ2M7QUFSaEMsU0FBaUIsT0FBTyxNQUFNO0FBQUEsRUFXOUI7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLFVBQWtCO0FBQ2pCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLFVBQThCO0FBQzdCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLFVBQWtCO0FBQ2pCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLFVBQThCO0FBQzdCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLE1BQWUsVUFBeUI7QUFHdkMsUUFBSSxLQUFLLFlBQVksWUFBWSxLQUFLLFFBQVEsR0FBRztBQUNoRCxZQUFNLE9BQU8sTUFBTSxLQUFLLFlBQVksS0FBSyxLQUFLLFFBQVE7QUFDdEQsV0FBSyxPQUFPLEtBQUs7QUFDakIsVUFBSSxPQUFPLEtBQUssU0FBUyxVQUFVO0FBQ2xDLGFBQUssT0FBTyxLQUFLO0FBQUEsTUFDbEI7QUFBQSxJQUNEO0FBRUEsV0FBTyxNQUFNLFFBQVE7QUFBQSxFQUN0QjtBQUNEO0FBeERhLG9CQUFOO0FBQUEsRUFVSjtBQUFBLEdBVlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
