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
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { derived } from "../../../../../../base/common/observable.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { observableCodeEditor } from "../../../../../browser/observableCodeEditor.js";
import { Range } from "../../../../../common/core/range.js";
import { TextReplacement, TextEdit } from "../../../../../common/core/edits/textEdit.js";
import { InlineEditWithChanges } from "./inlineEditWithChanges.js";
import { ModelPerInlineEdit } from "./inlineEditsModel.js";
import { InlineEditsView } from "./inlineEditsView.js";
import { InlineEditTabAction } from "./inlineEditsViewInterface.js";
import { InlineSuggestionGutterMenuData, SimpleInlineSuggestModel } from "./components/gutterIndicatorView.js";
let InlineEditsViewAndDiffProducer = class extends Disposable {
  constructor(_editor, _model, _showCollapsed, instantiationService) {
    super();
    this._editor = _editor;
    this._model = _model;
    this._showCollapsed = _showCollapsed;
    this._inlineEdit = derived(this, (reader) => {
      const model = this._model.read(reader);
      if (!model) {
        return void 0;
      }
      const textModel = this._editor.getModel();
      if (!textModel) {
        return void 0;
      }
      const state = model.inlineEditState.read(reader);
      if (!state) {
        return void 0;
      }
      const action = state.inlineSuggestion.action;
      let diffEdits;
      if (action?.kind === "edit") {
        const editOffset = action.stringEdit;
        const t = state.inlineSuggestion.originalTextRef.getTransformer();
        const edits = editOffset.replacements.map((e) => {
          const innerEditRange = Range.fromPositions(
            t.getPosition(e.replaceRange.start),
            t.getPosition(e.replaceRange.endExclusive)
          );
          return new TextReplacement(innerEditRange, e.newText);
        });
        diffEdits = new TextEdit(edits);
      } else {
        diffEdits = void 0;
      }
      return new InlineEditWithChanges(
        state.inlineSuggestion.originalTextRef,
        action,
        diffEdits,
        model.primaryPosition.read(void 0),
        model.allPositions.read(void 0),
        state.inlineSuggestion.source.inlineSuggestions.commands ?? [],
        state.inlineSuggestion
      );
    });
    this._inlineEditModel = derived(this, (reader) => {
      const model = this._model.read(reader);
      if (!model) {
        return void 0;
      }
      const edit = this._inlineEdit.read(reader);
      if (!edit) {
        return void 0;
      }
      const tabAction = derived(this, (reader2) => {
        if (this._editorObs.isFocused.read(reader2)) {
          if (model.tabShouldJumpToInlineEdit.read(reader2)) {
            return InlineEditTabAction.Jump;
          }
          if (model.tabShouldAcceptInlineEdit.read(reader2)) {
            return InlineEditTabAction.Accept;
          }
        }
        return InlineEditTabAction.Inactive;
      });
      return new ModelPerInlineEdit(model, edit, tabAction);
    });
    this._editorObs = observableCodeEditor(this._editor);
    this.view = this._register(instantiationService.createInstance(
      InlineEditsView,
      this._editor,
      this._inlineEditModel,
      this._model.map((model) => model ? SimpleInlineSuggestModel.fromInlineCompletionModel(model) : void 0),
      this._inlineEdit.map((e) => e ? InlineSuggestionGutterMenuData.fromInlineSuggestion(e.inlineCompletion) : void 0),
      this._showCollapsed
    ));
  }
};
InlineEditsViewAndDiffProducer = __decorateClass([
  __decorateParam(3, IInstantiationService)
], InlineEditsViewAndDiffProducer);
export {
  InlineEditsViewAndDiffProducer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFx2aWV3XFxpbmxpbmVFZGl0c1xcaW5saW5lRWRpdHNWaWV3UHJvZHVjZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGRlcml2ZWQsIElPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IE9ic2VydmFibGVDb2RlRWRpdG9yLCBvYnNlcnZhYmxlQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvb2JzZXJ2YWJsZUNvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBUZXh0UmVwbGFjZW1lbnQsIFRleHRFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdHMvdGV4dEVkaXQuanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbnNNb2RlbCB9IGZyb20gJy4uLy4uL21vZGVsL2lubGluZUNvbXBsZXRpb25zTW9kZWwuanMnO1xuaW1wb3J0IHsgSW5saW5lRWRpdFdpdGhDaGFuZ2VzIH0gZnJvbSAnLi9pbmxpbmVFZGl0V2l0aENoYW5nZXMuanMnO1xuaW1wb3J0IHsgTW9kZWxQZXJJbmxpbmVFZGl0IH0gZnJvbSAnLi9pbmxpbmVFZGl0c01vZGVsLmpzJztcbmltcG9ydCB7IElubGluZUVkaXRzVmlldyB9IGZyb20gJy4vaW5saW5lRWRpdHNWaWV3LmpzJztcbmltcG9ydCB7IElubGluZUVkaXRUYWJBY3Rpb24gfSBmcm9tICcuL2lubGluZUVkaXRzVmlld0ludGVyZmFjZS5qcyc7XG5pbXBvcnQgeyBJbmxpbmVTdWdnZXN0aW9uR3V0dGVyTWVudURhdGEsIFNpbXBsZUlubGluZVN1Z2dlc3RNb2RlbCB9IGZyb20gJy4vY29tcG9uZW50cy9ndXR0ZXJJbmRpY2F0b3JWaWV3LmpzJztcblxuZXhwb3J0IGNsYXNzIElubGluZUVkaXRzVmlld0FuZERpZmZQcm9kdWNlciBleHRlbmRzIERpc3Bvc2FibGUgeyAvLyBUT0RPOiBUaGlzIGNsYXNzIGlzIG5vIGxvbmdlciBhIGRpZmYgcHJvZHVjZXIuIFJlbmFtZSBpdCBvciBnZXQgcmlkIG9mIGl0XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvck9iczogT2JzZXJ2YWJsZUNvZGVFZGl0b3I7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaW5saW5lRWRpdCA9IGRlcml2ZWQ8SW5saW5lRWRpdFdpdGhDaGFuZ2VzIHwgdW5kZWZpbmVkPih0aGlzLCAocmVhZGVyKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9tb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFtb2RlbCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCF0ZXh0TW9kZWwpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdFx0Y29uc3Qgc3RhdGUgPSBtb2RlbC5pbmxpbmVFZGl0U3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdGlmICghc3RhdGUpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdGNvbnN0IGFjdGlvbiA9IHN0YXRlLmlubGluZVN1Z2dlc3Rpb24uYWN0aW9uO1xuXG5cdFx0bGV0IGRpZmZFZGl0czogVGV4dEVkaXQgfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAoYWN0aW9uPy5raW5kID09PSAnZWRpdCcpIHtcblx0XHRcdGNvbnN0IGVkaXRPZmZzZXQgPSBhY3Rpb24uc3RyaW5nRWRpdDtcblx0XHRcdGNvbnN0IHQgPSBzdGF0ZS5pbmxpbmVTdWdnZXN0aW9uLm9yaWdpbmFsVGV4dFJlZi5nZXRUcmFuc2Zvcm1lcigpO1xuXHRcdFx0Y29uc3QgZWRpdHMgPSBlZGl0T2Zmc2V0LnJlcGxhY2VtZW50cy5tYXAoZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGlubmVyRWRpdFJhbmdlID0gUmFuZ2UuZnJvbVBvc2l0aW9ucyhcblx0XHRcdFx0XHR0LmdldFBvc2l0aW9uKGUucmVwbGFjZVJhbmdlLnN0YXJ0KSxcblx0XHRcdFx0XHR0LmdldFBvc2l0aW9uKGUucmVwbGFjZVJhbmdlLmVuZEV4Y2x1c2l2ZSlcblx0XHRcdFx0KTtcblx0XHRcdFx0cmV0dXJuIG5ldyBUZXh0UmVwbGFjZW1lbnQoaW5uZXJFZGl0UmFuZ2UsIGUubmV3VGV4dCk7XG5cdFx0XHR9KTtcblx0XHRcdGRpZmZFZGl0cyA9IG5ldyBUZXh0RWRpdChlZGl0cyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRpZmZFZGl0cyA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IElubGluZUVkaXRXaXRoQ2hhbmdlcyhcblx0XHRcdHN0YXRlLmlubGluZVN1Z2dlc3Rpb24ub3JpZ2luYWxUZXh0UmVmLFxuXHRcdFx0YWN0aW9uLFxuXHRcdFx0ZGlmZkVkaXRzLFxuXHRcdFx0bW9kZWwucHJpbWFyeVBvc2l0aW9uLnJlYWQodW5kZWZpbmVkKSxcblx0XHRcdG1vZGVsLmFsbFBvc2l0aW9ucy5yZWFkKHVuZGVmaW5lZCksXG5cdFx0XHRzdGF0ZS5pbmxpbmVTdWdnZXN0aW9uLnNvdXJjZS5pbmxpbmVTdWdnZXN0aW9ucy5jb21tYW5kcyA/PyBbXSxcblx0XHRcdHN0YXRlLmlubGluZVN1Z2dlc3Rpb25cblx0XHQpO1xuXHR9KTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgX2lubGluZUVkaXRNb2RlbCA9IGRlcml2ZWQ8TW9kZWxQZXJJbmxpbmVFZGl0IHwgdW5kZWZpbmVkPih0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fbW9kZWwucmVhZChyZWFkZXIpO1xuXHRcdGlmICghbW9kZWwpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdGNvbnN0IGVkaXQgPSB0aGlzLl9pbmxpbmVFZGl0LnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIWVkaXQpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdFx0Y29uc3QgdGFiQWN0aW9uID0gZGVyaXZlZDxJbmxpbmVFZGl0VGFiQWN0aW9uPih0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiB0YWJBY3Rpb24gKi9cblx0XHRcdGlmICh0aGlzLl9lZGl0b3JPYnMuaXNGb2N1c2VkLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRpZiAobW9kZWwudGFiU2hvdWxkSnVtcFRvSW5saW5lRWRpdC5yZWFkKHJlYWRlcikpIHsgcmV0dXJuIElubGluZUVkaXRUYWJBY3Rpb24uSnVtcDsgfVxuXHRcdFx0XHRpZiAobW9kZWwudGFiU2hvdWxkQWNjZXB0SW5saW5lRWRpdC5yZWFkKHJlYWRlcikpIHsgcmV0dXJuIElubGluZUVkaXRUYWJBY3Rpb24uQWNjZXB0OyB9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gSW5saW5lRWRpdFRhYkFjdGlvbi5JbmFjdGl2ZTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBuZXcgTW9kZWxQZXJJbmxpbmVFZGl0KG1vZGVsLCBlZGl0LCB0YWJBY3Rpb24pO1xuXHR9KTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgdmlldzogSW5saW5lRWRpdHNWaWV3O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWw6IElPYnNlcnZhYmxlPElubGluZUNvbXBsZXRpb25zTW9kZWwgfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Nob3dDb2xsYXBzZWQ6IElPYnNlcnZhYmxlPGJvb2xlYW4+LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2VkaXRvck9icyA9IG9ic2VydmFibGVDb2RlRWRpdG9yKHRoaXMuX2VkaXRvcik7XG5cblx0XHR0aGlzLnZpZXcgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbmxpbmVFZGl0c1ZpZXcsIHRoaXMuX2VkaXRvciwgdGhpcy5faW5saW5lRWRpdE1vZGVsLFxuXHRcdFx0dGhpcy5fbW9kZWwubWFwKG1vZGVsID0+IG1vZGVsID8gU2ltcGxlSW5saW5lU3VnZ2VzdE1vZGVsLmZyb21JbmxpbmVDb21wbGV0aW9uTW9kZWwobW9kZWwpIDogdW5kZWZpbmVkKSxcblx0XHRcdHRoaXMuX2lubGluZUVkaXQubWFwKGUgPT4gZSA/IElubGluZVN1Z2dlc3Rpb25HdXR0ZXJNZW51RGF0YS5mcm9tSW5saW5lU3VnZ2VzdGlvbihlLmlubGluZUNvbXBsZXRpb24pIDogdW5kZWZpbmVkKSxcblx0XHRcdHRoaXMuX3Nob3dDb2xsYXBzZWQsXG5cdFx0KSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUE0QjtBQUNyQyxTQUFTLDZCQUE2QjtBQUV0QyxTQUErQiw0QkFBNEI7QUFDM0QsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlCLGdCQUFnQjtBQUUxQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGdDQUFnQyxnQ0FBZ0M7QUFFbEUsSUFBTSxpQ0FBTixjQUE2QyxXQUFXO0FBQUEsRUE2RDlELFlBQ2tCLFNBQ0EsUUFDQSxnQkFDTSxzQkFDdEI7QUFDRCxVQUFNO0FBTFc7QUFDQTtBQUNBO0FBN0RsQixTQUFpQixjQUFjLFFBQTJDLE1BQU0sQ0FBQyxXQUFXO0FBQzNGLFlBQU0sUUFBUSxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBQ3JDLFVBQUksQ0FBQyxPQUFPO0FBQUUsZUFBTztBQUFBLE1BQVc7QUFDaEMsWUFBTSxZQUFZLEtBQUssUUFBUSxTQUFTO0FBQ3hDLFVBQUksQ0FBQyxXQUFXO0FBQUUsZUFBTztBQUFBLE1BQVc7QUFFcEMsWUFBTSxRQUFRLE1BQU0sZ0JBQWdCLEtBQUssTUFBTTtBQUMvQyxVQUFJLENBQUMsT0FBTztBQUFFLGVBQU87QUFBQSxNQUFXO0FBQ2hDLFlBQU0sU0FBUyxNQUFNLGlCQUFpQjtBQUV0QyxVQUFJO0FBRUosVUFBSSxRQUFRLFNBQVMsUUFBUTtBQUM1QixjQUFNLGFBQWEsT0FBTztBQUMxQixjQUFNLElBQUksTUFBTSxpQkFBaUIsZ0JBQWdCLGVBQWU7QUFDaEUsY0FBTSxRQUFRLFdBQVcsYUFBYSxJQUFJLE9BQUs7QUFDOUMsZ0JBQU0saUJBQWlCLE1BQU07QUFBQSxZQUM1QixFQUFFLFlBQVksRUFBRSxhQUFhLEtBQUs7QUFBQSxZQUNsQyxFQUFFLFlBQVksRUFBRSxhQUFhLFlBQVk7QUFBQSxVQUMxQztBQUNBLGlCQUFPLElBQUksZ0JBQWdCLGdCQUFnQixFQUFFLE9BQU87QUFBQSxRQUNyRCxDQUFDO0FBQ0Qsb0JBQVksSUFBSSxTQUFTLEtBQUs7QUFBQSxNQUMvQixPQUFPO0FBQ04sb0JBQVk7QUFBQSxNQUNiO0FBRUEsYUFBTyxJQUFJO0FBQUEsUUFDVixNQUFNLGlCQUFpQjtBQUFBLFFBQ3ZCO0FBQUEsUUFDQTtBQUFBLFFBQ0EsTUFBTSxnQkFBZ0IsS0FBSyxNQUFTO0FBQUEsUUFDcEMsTUFBTSxhQUFhLEtBQUssTUFBUztBQUFBLFFBQ2pDLE1BQU0saUJBQWlCLE9BQU8sa0JBQWtCLFlBQVksQ0FBQztBQUFBLFFBQzdELE1BQU07QUFBQSxNQUNQO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBZ0IsbUJBQW1CLFFBQXdDLE1BQU0sWUFBVTtBQUMxRixZQUFNLFFBQVEsS0FBSyxPQUFPLEtBQUssTUFBTTtBQUNyQyxVQUFJLENBQUMsT0FBTztBQUFFLGVBQU87QUFBQSxNQUFXO0FBQ2hDLFlBQU0sT0FBTyxLQUFLLFlBQVksS0FBSyxNQUFNO0FBQ3pDLFVBQUksQ0FBQyxNQUFNO0FBQUUsZUFBTztBQUFBLE1BQVc7QUFFL0IsWUFBTSxZQUFZLFFBQTZCLE1BQU0sQ0FBQUEsWUFBVTtBQUU5RCxZQUFJLEtBQUssV0FBVyxVQUFVLEtBQUtBLE9BQU0sR0FBRztBQUMzQyxjQUFJLE1BQU0sMEJBQTBCLEtBQUtBLE9BQU0sR0FBRztBQUFFLG1CQUFPLG9CQUFvQjtBQUFBLFVBQU07QUFDckYsY0FBSSxNQUFNLDBCQUEwQixLQUFLQSxPQUFNLEdBQUc7QUFBRSxtQkFBTyxvQkFBb0I7QUFBQSxVQUFRO0FBQUEsUUFDeEY7QUFDQSxlQUFPLG9CQUFvQjtBQUFBLE1BQzVCLENBQUM7QUFFRCxhQUFPLElBQUksbUJBQW1CLE9BQU8sTUFBTSxTQUFTO0FBQUEsSUFDckQsQ0FBQztBQVlBLFNBQUssYUFBYSxxQkFBcUIsS0FBSyxPQUFPO0FBRW5ELFNBQUssT0FBTyxLQUFLLFVBQVUscUJBQXFCO0FBQUEsTUFBZTtBQUFBLE1BQWlCLEtBQUs7QUFBQSxNQUFTLEtBQUs7QUFBQSxNQUNsRyxLQUFLLE9BQU8sSUFBSSxXQUFTLFFBQVEseUJBQXlCLDBCQUEwQixLQUFLLElBQUksTUFBUztBQUFBLE1BQ3RHLEtBQUssWUFBWSxJQUFJLE9BQUssSUFBSSwrQkFBK0IscUJBQXFCLEVBQUUsZ0JBQWdCLElBQUksTUFBUztBQUFBLE1BQ2pILEtBQUs7QUFBQSxJQUNOLENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUE3RWEsaUNBQU47QUFBQSxFQWlFSjtBQUFBLEdBakVVOyIsCiAgIm5hbWVzIjogWyJyZWFkZXIiXQp9Cg==
