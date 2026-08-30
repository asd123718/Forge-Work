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
import { isObject } from "../../../../base/common/types.js";
import { ResourceEdit } from "../../../../editor/browser/services/bulkEditService.js";
import { IUndoRedoService, UndoRedoElementType } from "../../../../platform/undoRedo/common/undoRedo.js";
class ResourceAttachmentEdit extends ResourceEdit {
  constructor(resource, undo, redo, metadata) {
    super(metadata);
    this.resource = resource;
    this.undo = undo;
    this.redo = redo;
  }
  static is(candidate) {
    if (candidate instanceof ResourceAttachmentEdit) {
      return true;
    } else {
      return isObject(candidate) && Boolean(candidate.undo && candidate.redo);
    }
  }
  static lift(edit) {
    if (edit instanceof ResourceAttachmentEdit) {
      return edit;
    } else {
      return new ResourceAttachmentEdit(edit.resource, edit.undo, edit.redo, edit.metadata);
    }
  }
}
let OpaqueEdits = class {
  constructor(_undoRedoGroup, _undoRedoSource, _progress, _token, _edits, _undoRedoService) {
    this._undoRedoGroup = _undoRedoGroup;
    this._undoRedoSource = _undoRedoSource;
    this._progress = _progress;
    this._token = _token;
    this._edits = _edits;
    this._undoRedoService = _undoRedoService;
  }
  async apply() {
    const resources = [];
    for (const edit of this._edits) {
      if (this._token.isCancellationRequested) {
        break;
      }
      await edit.redo();
      this._undoRedoService.pushElement({
        type: UndoRedoElementType.Resource,
        resource: edit.resource,
        label: edit.metadata?.label || "Custom Edit",
        code: "paste",
        undo: edit.undo,
        redo: edit.redo
      }, this._undoRedoGroup, this._undoRedoSource);
      this._progress.report(void 0);
      resources.push(edit.resource);
    }
    return resources;
  }
};
OpaqueEdits = __decorateClass([
  __decorateParam(5, IUndoRedoService)
], OpaqueEdits);
export {
  OpaqueEdits,
  ResourceAttachmentEdit
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJ1bGtFZGl0XFxicm93c2VyXFxvcGFxdWVFZGl0cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGlzT2JqZWN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFJlc291cmNlRWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2J1bGtFZGl0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9tRWRpdCwgV29ya3NwYWNlRWRpdE1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElVbmRvUmVkb1NlcnZpY2UsIFVuZG9SZWRvRWxlbWVudFR5cGUsIFVuZG9SZWRvR3JvdXAsIFVuZG9SZWRvU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdW5kb1JlZG8vY29tbW9uL3VuZG9SZWRvLmpzJztcblxuZXhwb3J0IGNsYXNzIFJlc291cmNlQXR0YWNobWVudEVkaXQgZXh0ZW5kcyBSZXNvdXJjZUVkaXQgaW1wbGVtZW50cyBJQ3VzdG9tRWRpdCB7XG5cblx0c3RhdGljIGlzKGNhbmRpZGF0ZTogdW5rbm93bik6IGNhbmRpZGF0ZSBpcyBJQ3VzdG9tRWRpdCB7XG5cdFx0aWYgKGNhbmRpZGF0ZSBpbnN0YW5jZW9mIFJlc291cmNlQXR0YWNobWVudEVkaXQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gaXNPYmplY3QoY2FuZGlkYXRlKVxuXHRcdFx0XHQmJiAoQm9vbGVhbigoPElDdXN0b21FZGl0PmNhbmRpZGF0ZSkudW5kbyAmJiAoPElDdXN0b21FZGl0PmNhbmRpZGF0ZSkucmVkbykpO1xuXHRcdH1cblx0fVxuXG5cdHN0YXRpYyBsaWZ0KGVkaXQ6IElDdXN0b21FZGl0KTogUmVzb3VyY2VBdHRhY2htZW50RWRpdCB7XG5cdFx0aWYgKGVkaXQgaW5zdGFuY2VvZiBSZXNvdXJjZUF0dGFjaG1lbnRFZGl0KSB7XG5cdFx0XHRyZXR1cm4gZWRpdDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIG5ldyBSZXNvdXJjZUF0dGFjaG1lbnRFZGl0KGVkaXQucmVzb3VyY2UsIGVkaXQudW5kbywgZWRpdC5yZWRvLCBlZGl0Lm1ldGFkYXRhKTtcblx0XHR9XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSByZXNvdXJjZTogVVJJLFxuXHRcdHJlYWRvbmx5IHVuZG86ICgpID0+IFByb21pc2U8dm9pZD4gfCB2b2lkLFxuXHRcdHJlYWRvbmx5IHJlZG86ICgpID0+IFByb21pc2U8dm9pZD4gfCB2b2lkLFxuXHRcdG1ldGFkYXRhPzogV29ya3NwYWNlRWRpdE1ldGFkYXRhXG5cdCkge1xuXHRcdHN1cGVyKG1ldGFkYXRhKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgT3BhcXVlRWRpdHMge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3VuZG9SZWRvR3JvdXA6IFVuZG9SZWRvR3JvdXAsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdW5kb1JlZG9Tb3VyY2U6IFVuZG9SZWRvU291cmNlIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb2dyZXNzOiBJUHJvZ3Jlc3M8dm9pZD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRzOiBSZXNvdXJjZUF0dGFjaG1lbnRFZGl0W10sXG5cdFx0QElVbmRvUmVkb1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdW5kb1JlZG9TZXJ2aWNlOiBJVW5kb1JlZG9TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFzeW5jIGFwcGx5KCk6IFByb21pc2U8cmVhZG9ubHkgVVJJW10+IHtcblx0XHRjb25zdCByZXNvdXJjZXM6IFVSSVtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgdGhpcy5fZWRpdHMpIHtcblx0XHRcdGlmICh0aGlzLl90b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgZWRpdC5yZWRvKCk7XG5cblx0XHRcdHRoaXMuX3VuZG9SZWRvU2VydmljZS5wdXNoRWxlbWVudCh7XG5cdFx0XHRcdHR5cGU6IFVuZG9SZWRvRWxlbWVudFR5cGUuUmVzb3VyY2UsXG5cdFx0XHRcdHJlc291cmNlOiBlZGl0LnJlc291cmNlLFxuXHRcdFx0XHRsYWJlbDogZWRpdC5tZXRhZGF0YT8ubGFiZWwgfHwgJ0N1c3RvbSBFZGl0Jyxcblx0XHRcdFx0Y29kZTogJ3Bhc3RlJyxcblx0XHRcdFx0dW5kbzogZWRpdC51bmRvLFxuXHRcdFx0XHRyZWRvOiBlZGl0LnJlZG8sXG5cdFx0XHR9LCB0aGlzLl91bmRvUmVkb0dyb3VwLCB0aGlzLl91bmRvUmVkb1NvdXJjZSk7XG5cblx0XHRcdHRoaXMuX3Byb2dyZXNzLnJlcG9ydCh1bmRlZmluZWQpO1xuXHRcdFx0cmVzb3VyY2VzLnB1c2goZWRpdC5yZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc291cmNlcztcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLG9CQUFvQjtBQUc3QixTQUFTLGtCQUFrQiwyQkFBMEQ7QUFFOUUsTUFBTSwrQkFBK0IsYUFBb0M7QUFBQSxFQW1CL0UsWUFDVSxVQUNBLE1BQ0EsTUFDVCxVQUNDO0FBQ0QsVUFBTSxRQUFRO0FBTEw7QUFDQTtBQUNBO0FBQUEsRUFJVjtBQUFBLEVBeEJBLE9BQU8sR0FBRyxXQUE4QztBQUN2RCxRQUFJLHFCQUFxQix3QkFBd0I7QUFDaEQsYUFBTztBQUFBLElBQ1IsT0FBTztBQUNOLGFBQU8sU0FBUyxTQUFTLEtBQ3BCLFFBQXNCLFVBQVcsUUFBc0IsVUFBVyxJQUFJO0FBQUEsSUFDNUU7QUFBQSxFQUNEO0FBQUEsRUFFQSxPQUFPLEtBQUssTUFBMkM7QUFDdEQsUUFBSSxnQkFBZ0Isd0JBQXdCO0FBQzNDLGFBQU87QUFBQSxJQUNSLE9BQU87QUFDTixhQUFPLElBQUksdUJBQXVCLEtBQUssVUFBVSxLQUFLLE1BQU0sS0FBSyxNQUFNLEtBQUssUUFBUTtBQUFBLElBQ3JGO0FBQUEsRUFDRDtBQVVEO0FBRU8sSUFBTSxjQUFOLE1BQWtCO0FBQUEsRUFFeEIsWUFDa0IsZ0JBQ0EsaUJBQ0EsV0FDQSxRQUNBLFFBQ2tCLGtCQUNsQztBQU5nQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ2tCO0FBQUEsRUFDaEM7QUFBQSxFQUVKLE1BQU0sUUFBaUM7QUFDdEMsVUFBTSxZQUFtQixDQUFDO0FBRTFCLGVBQVcsUUFBUSxLQUFLLFFBQVE7QUFDL0IsVUFBSSxLQUFLLE9BQU8seUJBQXlCO0FBQ3hDO0FBQUEsTUFDRDtBQUVBLFlBQU0sS0FBSyxLQUFLO0FBRWhCLFdBQUssaUJBQWlCLFlBQVk7QUFBQSxRQUNqQyxNQUFNLG9CQUFvQjtBQUFBLFFBQzFCLFVBQVUsS0FBSztBQUFBLFFBQ2YsT0FBTyxLQUFLLFVBQVUsU0FBUztBQUFBLFFBQy9CLE1BQU07QUFBQSxRQUNOLE1BQU0sS0FBSztBQUFBLFFBQ1gsTUFBTSxLQUFLO0FBQUEsTUFDWixHQUFHLEtBQUssZ0JBQWdCLEtBQUssZUFBZTtBQUU1QyxXQUFLLFVBQVUsT0FBTyxNQUFTO0FBQy9CLGdCQUFVLEtBQUssS0FBSyxRQUFRO0FBQUEsSUFDN0I7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBcENhLGNBQU47QUFBQSxFQVFKO0FBQUEsR0FSVTsiLAogICJuYW1lcyI6IFtdCn0K
