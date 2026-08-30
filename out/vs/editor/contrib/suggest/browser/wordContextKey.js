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
import { EditorOption } from "../../../common/config/editorOptions.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { localize } from "../../../../nls.js";
let WordContextKey = class {
  constructor(_editor, contextKeyService) {
    this._editor = _editor;
    this._enabled = false;
    this._ckAtEnd = WordContextKey.AtEnd.bindTo(contextKeyService);
    this._configListener = this._editor.onDidChangeConfiguration((e) => e.hasChanged(EditorOption.tabCompletion) && this._update());
    this._update();
  }
  dispose() {
    this._configListener.dispose();
    this._selectionListener?.dispose();
    this._ckAtEnd.reset();
  }
  _update() {
    const enabled = this._editor.getOption(EditorOption.tabCompletion) === "on";
    if (this._enabled === enabled) {
      return;
    }
    this._enabled = enabled;
    if (this._enabled) {
      const checkForWordEnd = () => {
        if (!this._editor.hasModel()) {
          this._ckAtEnd.set(false);
          return;
        }
        const model = this._editor.getModel();
        const selection = this._editor.getSelection();
        const word = model.getWordAtPosition(selection.getStartPosition());
        if (!word) {
          this._ckAtEnd.set(false);
          return;
        }
        this._ckAtEnd.set(word.endColumn === selection.getStartPosition().column && selection.getStartPosition().lineNumber === selection.getEndPosition().lineNumber);
      };
      this._selectionListener = this._editor.onDidChangeCursorSelection(checkForWordEnd);
      checkForWordEnd();
    } else if (this._selectionListener) {
      this._ckAtEnd.reset();
      this._selectionListener.dispose();
      this._selectionListener = void 0;
    }
  }
};
WordContextKey.AtEnd = new RawContextKey("atEndOfWord", false, { type: "boolean", description: localize("desc", "A context key that is true when at the end of a word. Note that this is only defined when tab-completions are enabled") });
WordContextKey = __decorateClass([
  __decorateParam(1, IContextKeyService)
], WordContextKey);
export {
  WordContextKey
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHN1Z2dlc3RcXGJyb3dzZXJcXHdvcmRDb250ZXh0S2V5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcblxuZXhwb3J0IGNsYXNzIFdvcmRDb250ZXh0S2V5IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgQXRFbmQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignYXRFbmRPZldvcmQnLCBmYWxzZSwgeyB0eXBlOiAnYm9vbGVhbicsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZGVzYycsIFwiQSBjb250ZXh0IGtleSB0aGF0IGlzIHRydWUgd2hlbiBhdCB0aGUgZW5kIG9mIGEgd29yZC4gTm90ZSB0aGF0IHRoaXMgaXMgb25seSBkZWZpbmVkIHdoZW4gdGFiLWNvbXBsZXRpb25zIGFyZSBlbmFibGVkXCIpIH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NrQXRFbmQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25maWdMaXN0ZW5lcjogSURpc3Bvc2FibGU7XG5cblx0cHJpdmF0ZSBfZW5hYmxlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9zZWxlY3Rpb25MaXN0ZW5lcj86IElEaXNwb3NhYmxlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblxuXHRcdHRoaXMuX2NrQXRFbmQgPSBXb3JkQ29udGV4dEtleS5BdEVuZC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2NvbmZpZ0xpc3RlbmVyID0gdGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24udGFiQ29tcGxldGlvbikgJiYgdGhpcy5fdXBkYXRlKCkpO1xuXHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9jb25maWdMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fc2VsZWN0aW9uTGlzdGVuZXI/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9ja0F0RW5kLnJlc2V0KCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGUoKTogdm9pZCB7XG5cdFx0Ly8gb25seSB1cGRhdGUgdGhpcyB3aGVuIHRhYiBjb21wbGV0aW9ucyBhcmUgZW5hYmxlZFxuXHRcdGNvbnN0IGVuYWJsZWQgPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi50YWJDb21wbGV0aW9uKSA9PT0gJ29uJztcblx0XHRpZiAodGhpcy5fZW5hYmxlZCA9PT0gZW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9lbmFibGVkID0gZW5hYmxlZDtcblxuXHRcdGlmICh0aGlzLl9lbmFibGVkKSB7XG5cdFx0XHRjb25zdCBjaGVja0ZvcldvcmRFbmQgPSAoKSA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdFx0XHR0aGlzLl9ja0F0RW5kLnNldChmYWxzZSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdFx0Y29uc3Qgd29yZCA9IG1vZGVsLmdldFdvcmRBdFBvc2l0aW9uKHNlbGVjdGlvbi5nZXRTdGFydFBvc2l0aW9uKCkpO1xuXHRcdFx0XHRpZiAoIXdvcmQpIHtcblx0XHRcdFx0XHR0aGlzLl9ja0F0RW5kLnNldChmYWxzZSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2NrQXRFbmQuc2V0KHdvcmQuZW5kQ29sdW1uID09PSBzZWxlY3Rpb24uZ2V0U3RhcnRQb3NpdGlvbigpLmNvbHVtbiAmJiBzZWxlY3Rpb24uZ2V0U3RhcnRQb3NpdGlvbigpLmxpbmVOdW1iZXIgPT09IHNlbGVjdGlvbi5nZXRFbmRQb3NpdGlvbigpLmxpbmVOdW1iZXIpO1xuXHRcdFx0fTtcblx0XHRcdHRoaXMuX3NlbGVjdGlvbkxpc3RlbmVyID0gdGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uKGNoZWNrRm9yV29yZEVuZCk7XG5cdFx0XHRjaGVja0ZvcldvcmRFbmQoKTtcblxuXHRcdH0gZWxzZSBpZiAodGhpcy5fc2VsZWN0aW9uTGlzdGVuZXIpIHtcblx0XHRcdHRoaXMuX2NrQXRFbmQucmVzZXQoKTtcblx0XHRcdHRoaXMuX3NlbGVjdGlvbkxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX3NlbGVjdGlvbkxpc3RlbmVyID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFPQSxTQUFTLG9CQUFvQjtBQUM3QixTQUFzQixvQkFBb0IscUJBQXFCO0FBQy9ELFNBQVMsZ0JBQWdCO0FBRWxCLElBQU0saUJBQU4sTUFBcUI7QUFBQSxFQVUzQixZQUNrQixTQUNHLG1CQUNuQjtBQUZnQjtBQUpsQixTQUFRLFdBQW9CO0FBUTNCLFNBQUssV0FBVyxlQUFlLE1BQU0sT0FBTyxpQkFBaUI7QUFDN0QsU0FBSyxrQkFBa0IsS0FBSyxRQUFRLHlCQUF5QixPQUFLLEVBQUUsV0FBVyxhQUFhLGFBQWEsS0FBSyxLQUFLLFFBQVEsQ0FBQztBQUM1SCxTQUFLLFFBQVE7QUFBQSxFQUNkO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFNBQUssZ0JBQWdCLFFBQVE7QUFDN0IsU0FBSyxvQkFBb0IsUUFBUTtBQUNqQyxTQUFLLFNBQVMsTUFBTTtBQUFBLEVBQ3JCO0FBQUEsRUFFUSxVQUFnQjtBQUV2QixVQUFNLFVBQVUsS0FBSyxRQUFRLFVBQVUsYUFBYSxhQUFhLE1BQU07QUFDdkUsUUFBSSxLQUFLLGFBQWEsU0FBUztBQUM5QjtBQUFBLElBQ0Q7QUFDQSxTQUFLLFdBQVc7QUFFaEIsUUFBSSxLQUFLLFVBQVU7QUFDbEIsWUFBTSxrQkFBa0IsTUFBTTtBQUM3QixZQUFJLENBQUMsS0FBSyxRQUFRLFNBQVMsR0FBRztBQUM3QixlQUFLLFNBQVMsSUFBSSxLQUFLO0FBQ3ZCO0FBQUEsUUFDRDtBQUNBLGNBQU0sUUFBUSxLQUFLLFFBQVEsU0FBUztBQUNwQyxjQUFNLFlBQVksS0FBSyxRQUFRLGFBQWE7QUFDNUMsY0FBTSxPQUFPLE1BQU0sa0JBQWtCLFVBQVUsaUJBQWlCLENBQUM7QUFDakUsWUFBSSxDQUFDLE1BQU07QUFDVixlQUFLLFNBQVMsSUFBSSxLQUFLO0FBQ3ZCO0FBQUEsUUFDRDtBQUNBLGFBQUssU0FBUyxJQUFJLEtBQUssY0FBYyxVQUFVLGlCQUFpQixFQUFFLFVBQVUsVUFBVSxpQkFBaUIsRUFBRSxlQUFlLFVBQVUsZUFBZSxFQUFFLFVBQVU7QUFBQSxNQUM5SjtBQUNBLFdBQUsscUJBQXFCLEtBQUssUUFBUSwyQkFBMkIsZUFBZTtBQUNqRixzQkFBZ0I7QUFBQSxJQUVqQixXQUFXLEtBQUssb0JBQW9CO0FBQ25DLFdBQUssU0FBUyxNQUFNO0FBQ3BCLFdBQUssbUJBQW1CLFFBQVE7QUFDaEMsV0FBSyxxQkFBcUI7QUFBQSxJQUMzQjtBQUFBLEVBQ0Q7QUFDRDtBQTFEYSxlQUVJLFFBQVEsSUFBSSxjQUF1QixlQUFlLE9BQU8sRUFBRSxNQUFNLFdBQVcsYUFBYSxTQUFTLFFBQVEsdUhBQXVILEVBQUUsQ0FBQztBQUZ4TyxpQkFBTjtBQUFBLEVBWUo7QUFBQSxHQVpVOyIsCiAgIm5hbWVzIjogW10KfQo=
