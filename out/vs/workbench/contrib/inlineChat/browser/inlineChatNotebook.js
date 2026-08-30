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
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { isEqual } from "../../../../base/common/resources.js";
import { InlineChatController } from "./inlineChatController.js";
import { IInlineChatSessionService } from "./inlineChatSessionService.js";
import { INotebookEditorService } from "../../notebook/browser/services/notebookEditorService.js";
import { CellUri } from "../../notebook/common/notebookCommon.js";
let InlineChatNotebookContribution = class {
  #store = new DisposableStore();
  constructor(sessionService, notebookEditorService) {
    this.#store.add(sessionService.onWillStartSession((newSessionEditor) => {
      const candidate = CellUri.parse(newSessionEditor.getModel().uri);
      if (!candidate) {
        return;
      }
      for (const notebookEditor of notebookEditorService.listNotebookEditors()) {
        if (isEqual(notebookEditor.textModel?.uri, candidate.notebook)) {
          let found = false;
          const editors = [];
          for (const [, codeEditor] of notebookEditor.codeEditors) {
            editors.push(codeEditor);
            found = codeEditor === newSessionEditor || found;
          }
          if (found) {
            for (const editor of editors) {
              if (editor !== newSessionEditor) {
                InlineChatController.get(editor)?.acceptSession();
              }
            }
            break;
          }
        }
      }
    }));
  }
  dispose() {
    this.#store.dispose();
  }
};
InlineChatNotebookContribution = __decorateClass([
  __decorateParam(0, IInlineChatSessionService),
  __decorateParam(1, INotebookEditorService)
], InlineChatNotebookContribution);
export {
  InlineChatNotebookContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGlubGluZUNoYXRcXGJyb3dzZXJcXGlubGluZUNoYXROb3RlYm9vay50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDaGF0Q29udHJvbGxlciB9IGZyb20gJy4vaW5saW5lQ2hhdENvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgSUlubGluZUNoYXRTZXNzaW9uU2VydmljZSB9IGZyb20gJy4vaW5saW5lQ2hhdFNlc3Npb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9icm93c2VyL3NlcnZpY2VzL25vdGVib29rRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDZWxsVXJpIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcblxuZXhwb3J0IGNsYXNzIElubGluZUNoYXROb3RlYm9va0NvbnRyaWJ1dGlvbiB7XG5cblx0cmVhZG9ubHkgI3N0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5saW5lQ2hhdFNlc3Npb25TZXJ2aWNlIHNlc3Npb25TZXJ2aWNlOiBJSW5saW5lQ2hhdFNlc3Npb25TZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlIG5vdGVib29rRWRpdG9yU2VydmljZTogSU5vdGVib29rRWRpdG9yU2VydmljZSxcblx0KSB7XG5cblx0XHR0aGlzLiNzdG9yZS5hZGQoc2Vzc2lvblNlcnZpY2Uub25XaWxsU3RhcnRTZXNzaW9uKG5ld1Nlc3Npb25FZGl0b3IgPT4ge1xuXHRcdFx0Y29uc3QgY2FuZGlkYXRlID0gQ2VsbFVyaS5wYXJzZShuZXdTZXNzaW9uRWRpdG9yLmdldE1vZGVsKCkudXJpKTtcblx0XHRcdGlmICghY2FuZGlkYXRlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3Qgbm90ZWJvb2tFZGl0b3Igb2Ygbm90ZWJvb2tFZGl0b3JTZXJ2aWNlLmxpc3ROb3RlYm9va0VkaXRvcnMoKSkge1xuXHRcdFx0XHRpZiAoaXNFcXVhbChub3RlYm9va0VkaXRvci50ZXh0TW9kZWw/LnVyaSwgY2FuZGlkYXRlLm5vdGVib29rKSkge1xuXHRcdFx0XHRcdGxldCBmb3VuZCA9IGZhbHNlO1xuXHRcdFx0XHRcdGNvbnN0IGVkaXRvcnM6IElDb2RlRWRpdG9yW10gPSBbXTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IFssIGNvZGVFZGl0b3JdIG9mIG5vdGVib29rRWRpdG9yLmNvZGVFZGl0b3JzKSB7XG5cdFx0XHRcdFx0XHRlZGl0b3JzLnB1c2goY29kZUVkaXRvcik7XG5cdFx0XHRcdFx0XHRmb3VuZCA9IGNvZGVFZGl0b3IgPT09IG5ld1Nlc3Npb25FZGl0b3IgfHwgZm91bmQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChmb3VuZCkge1xuXHRcdFx0XHRcdFx0Ly8gZm91bmQgdGhlIHRoaXMgZWRpdG9yIGluIHRoZSBvdXRlciBub3RlYm9vayBlZGl0b3IgLT4gbWFrZSBzdXJlIHRvXG5cdFx0XHRcdFx0XHQvLyBjYW5jZWwgYWxsIHNpYmxpbmcgc2Vzc2lvbnNcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGVkaXRvcnMpIHtcblx0XHRcdFx0XHRcdFx0aWYgKGVkaXRvciAhPT0gbmV3U2Vzc2lvbkVkaXRvcikge1xuXHRcdFx0XHRcdFx0XHRcdElubGluZUNoYXRDb250cm9sbGVyLmdldChlZGl0b3IpPy5hY2NlcHRTZXNzaW9uKCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy4jc3RvcmUuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUV4QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGVBQWU7QUFFakIsSUFBTSxpQ0FBTixNQUFxQztBQUFBLEVBRWxDLFNBQVMsSUFBSSxnQkFBZ0I7QUFBQSxFQUV0QyxZQUM0QixnQkFDSCx1QkFDdkI7QUFFRCxTQUFLLE9BQU8sSUFBSSxlQUFlLG1CQUFtQixzQkFBb0I7QUFDckUsWUFBTSxZQUFZLFFBQVEsTUFBTSxpQkFBaUIsU0FBUyxFQUFFLEdBQUc7QUFDL0QsVUFBSSxDQUFDLFdBQVc7QUFDZjtBQUFBLE1BQ0Q7QUFDQSxpQkFBVyxrQkFBa0Isc0JBQXNCLG9CQUFvQixHQUFHO0FBQ3pFLFlBQUksUUFBUSxlQUFlLFdBQVcsS0FBSyxVQUFVLFFBQVEsR0FBRztBQUMvRCxjQUFJLFFBQVE7QUFDWixnQkFBTSxVQUF5QixDQUFDO0FBQ2hDLHFCQUFXLENBQUMsRUFBRSxVQUFVLEtBQUssZUFBZSxhQUFhO0FBQ3hELG9CQUFRLEtBQUssVUFBVTtBQUN2QixvQkFBUSxlQUFlLG9CQUFvQjtBQUFBLFVBQzVDO0FBQ0EsY0FBSSxPQUFPO0FBR1YsdUJBQVcsVUFBVSxTQUFTO0FBQzdCLGtCQUFJLFdBQVcsa0JBQWtCO0FBQ2hDLHFDQUFxQixJQUFJLE1BQU0sR0FBRyxjQUFjO0FBQUEsY0FDakQ7QUFBQSxZQUNEO0FBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLFVBQWdCO0FBQ2YsU0FBSyxPQUFPLFFBQVE7QUFBQSxFQUNyQjtBQUNEO0FBeENhLGlDQUFOO0FBQUEsRUFLSjtBQUFBLEVBQ0E7QUFBQSxHQU5VOyIsCiAgIm5hbWVzIjogW10KfQo=
