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
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { AbstractChatResponseFileChangesService } from "./chatResponseFileChangesService.js";
let EditorChatResponseFileChangesService = class extends AbstractChatResponseFileChangesService {
  constructor(editorService) {
    super();
    this.editorService = editorService;
  }
  openChangesForRequest(sessionResource, requestId, _context) {
    if (requestId === void 0) {
      return;
    }
    const diffs = this.getChangesForRequest(sessionResource, requestId)?.get();
    if (!diffs?.length) {
      return;
    }
    const source = URI.parse(`multi-diff-editor:${Date.now().toString()}-${Math.random().toString(36).slice(2)}`);
    this.editorService.openEditor({
      multiDiffSource: source,
      label: localize("chatTurnPills.changes.title", "Turn File Changes"),
      resources: diffs.map((diff) => ({
        original: { resource: diff.originalURI },
        modified: { resource: diff.isDeleted ? void 0 : diff.modifiedURI }
      }))
    });
  }
};
EditorChatResponseFileChangesService = __decorateClass([
  __decorateParam(0, IEditorService)
], EditorChatResponseFileChangesService);
export {
  EditorChatResponseFileChangesService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGVkaXRvckNoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdENoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZSwgSUNoYXRSZXNwb25zZUZpbGVDaGFuZ2VzT3BlbkNvbnRleHQgfSBmcm9tICcuL2NoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBFZGl0b3JDaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdENoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0b3ZlcnJpZGUgb3BlbkNoYW5nZXNGb3JSZXF1ZXN0KHNlc3Npb25SZXNvdXJjZTogVVJJLCByZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgX2NvbnRleHQ6IElDaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc09wZW5Db250ZXh0KTogdm9pZCB7XG5cdFx0aWYgKHJlcXVlc3RJZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGRpZmZzID0gdGhpcy5nZXRDaGFuZ2VzRm9yUmVxdWVzdChzZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3RJZCk/LmdldCgpO1xuXHRcdGlmICghZGlmZnM/Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzb3VyY2UgPSBVUkkucGFyc2UoYG11bHRpLWRpZmYtZWRpdG9yOiR7RGF0ZS5ub3coKS50b1N0cmluZygpfS0ke01hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIpfWApO1xuXHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdG11bHRpRGlmZlNvdXJjZTogc291cmNlLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjaGF0VHVyblBpbGxzLmNoYW5nZXMudGl0bGUnLCBcIlR1cm4gRmlsZSBDaGFuZ2VzXCIpLFxuXHRcdFx0cmVzb3VyY2VzOiBkaWZmcy5tYXAoZGlmZiA9PiAoe1xuXHRcdFx0XHRvcmlnaW5hbDogeyByZXNvdXJjZTogZGlmZi5vcmlnaW5hbFVSSSB9LFxuXHRcdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogZGlmZi5pc0RlbGV0ZWQgPyB1bmRlZmluZWQgOiBkaWZmLm1vZGlmaWVkVVJJIH0sXG5cdFx0XHR9KSksXG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsOENBQW1GO0FBRXJGLElBQU0sdUNBQU4sY0FBbUQsdUNBQXVDO0FBQUEsRUFDaEcsWUFDa0MsZUFDaEM7QUFDRCxVQUFNO0FBRjJCO0FBQUEsRUFHbEM7QUFBQSxFQUVTLHNCQUFzQixpQkFBc0IsV0FBK0IsVUFBcUQ7QUFDeEksUUFBSSxjQUFjLFFBQVc7QUFDNUI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxRQUFRLEtBQUsscUJBQXFCLGlCQUFpQixTQUFTLEdBQUcsSUFBSTtBQUN6RSxRQUFJLENBQUMsT0FBTyxRQUFRO0FBQ25CO0FBQUEsSUFDRDtBQUNBLFVBQU0sU0FBUyxJQUFJLE1BQU0scUJBQXFCLEtBQUssSUFBSSxFQUFFLFNBQVMsQ0FBQyxJQUFJLEtBQUssT0FBTyxFQUFFLFNBQVMsRUFBRSxFQUFFLE1BQU0sQ0FBQyxDQUFDLEVBQUU7QUFDNUcsU0FBSyxjQUFjLFdBQVc7QUFBQSxNQUM3QixpQkFBaUI7QUFBQSxNQUNqQixPQUFPLFNBQVMsK0JBQStCLG1CQUFtQjtBQUFBLE1BQ2xFLFdBQVcsTUFBTSxJQUFJLFdBQVM7QUFBQSxRQUM3QixVQUFVLEVBQUUsVUFBVSxLQUFLLFlBQVk7QUFBQSxRQUN2QyxVQUFVLEVBQUUsVUFBVSxLQUFLLFlBQVksU0FBWSxLQUFLLFlBQVk7QUFBQSxNQUNyRSxFQUFFO0FBQUEsSUFDSCxDQUFDO0FBQUEsRUFDRjtBQUNEO0FBekJhLHVDQUFOO0FBQUEsRUFFSjtBQUFBLEdBRlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
