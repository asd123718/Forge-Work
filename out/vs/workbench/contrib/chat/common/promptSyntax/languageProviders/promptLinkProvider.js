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
import { IPromptsService } from "../service/promptsService.js";
let PromptLinkProvider = class {
  constructor(promptsService) {
    this.promptsService = promptsService;
  }
  /**
   * Provide list of links for the provided text model.
   */
  async provideLinks(model, token) {
    const promptAST = this.promptsService.getParsedPromptFile(model);
    if (!promptAST.body) {
      return;
    }
    const links = [];
    for (const ref of promptAST.body.fileReferences) {
      if (!ref.isMarkdownLink) {
        const url = promptAST.body.resolveFilePath(ref.content);
        if (url) {
          links.push({ range: ref.range, url });
        }
      }
    }
    return { links };
  }
};
PromptLinkProvider = __decorateClass([
  __decorateParam(0, IPromptsService)
], PromptLinkProvider);
export {
  PromptLinkProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxccHJvbXB0U3ludGF4XFxsYW5ndWFnZVByb3ZpZGVyc1xccHJvbXB0TGlua1Byb3ZpZGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSVByb21wdHNTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGluaywgSUxpbmtzTGlzdCwgTGlua1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuXG4vKipcbiAqIFByb3ZpZGVzIGxpbmsgcmVmZXJlbmNlcyBmb3IgcHJvbXB0IGZpbGVzLlxuICovXG5leHBvcnQgY2xhc3MgUHJvbXB0TGlua1Byb3ZpZGVyIGltcGxlbWVudHMgTGlua1Byb3ZpZGVyIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElQcm9tcHRzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb21wdHNTZXJ2aWNlOiBJUHJvbXB0c1NlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0LyoqXG5cdCAqIFByb3ZpZGUgbGlzdCBvZiBsaW5rcyBmb3IgdGhlIHByb3ZpZGVkIHRleHQgbW9kZWwuXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgcHJvdmlkZUxpbmtzKG1vZGVsOiBJVGV4dE1vZGVsLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElMaW5rc0xpc3QgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwcm9tcHRBU1QgPSB0aGlzLnByb21wdHNTZXJ2aWNlLmdldFBhcnNlZFByb21wdEZpbGUobW9kZWwpO1xuXHRcdGlmICghcHJvbXB0QVNULmJvZHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGlua3M6IElMaW5rW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHJlZiBvZiBwcm9tcHRBU1QuYm9keS5maWxlUmVmZXJlbmNlcykge1xuXHRcdFx0aWYgKCFyZWYuaXNNYXJrZG93bkxpbmspIHtcblx0XHRcdFx0Y29uc3QgdXJsID0gcHJvbXB0QVNULmJvZHkucmVzb2x2ZUZpbGVQYXRoKHJlZi5jb250ZW50KTtcblx0XHRcdFx0aWYgKHVybCkge1xuXHRcdFx0XHRcdGxpbmtzLnB1c2goeyByYW5nZTogcmVmLnJhbmdlLCB1cmwgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHsgbGlua3MgfTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHVCQUF1QjtBQVF6QixJQUFNLHFCQUFOLE1BQWlEO0FBQUEsRUFDdkQsWUFDbUMsZ0JBQ2pDO0FBRGlDO0FBQUEsRUFFbkM7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE1BQWEsYUFBYSxPQUFtQixPQUEyRDtBQUN2RyxVQUFNLFlBQVksS0FBSyxlQUFlLG9CQUFvQixLQUFLO0FBQy9ELFFBQUksQ0FBQyxVQUFVLE1BQU07QUFDcEI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxRQUFpQixDQUFDO0FBQ3hCLGVBQVcsT0FBTyxVQUFVLEtBQUssZ0JBQWdCO0FBQ2hELFVBQUksQ0FBQyxJQUFJLGdCQUFnQjtBQUN4QixjQUFNLE1BQU0sVUFBVSxLQUFLLGdCQUFnQixJQUFJLE9BQU87QUFDdEQsWUFBSSxLQUFLO0FBQ1IsZ0JBQU0sS0FBSyxFQUFFLE9BQU8sSUFBSSxPQUFPLElBQUksQ0FBQztBQUFBLFFBQ3JDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxXQUFPLEVBQUUsTUFBTTtBQUFBLEVBQ2hCO0FBQ0Q7QUF6QmEscUJBQU47QUFBQSxFQUVKO0FBQUEsR0FGVTsiLAogICJuYW1lcyI6IFtdCn0K
