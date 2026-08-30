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
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
let SuggestAlternatives = class {
  constructor(_editor, contextKeyService) {
    this._editor = _editor;
    this._index = 0;
    this._ckOtherSuggestions = SuggestAlternatives.OtherSuggestions.bindTo(contextKeyService);
  }
  dispose() {
    this.reset();
  }
  reset() {
    this._ckOtherSuggestions.reset();
    this._listener?.dispose();
    this._model = void 0;
    this._acceptNext = void 0;
    this._ignore = false;
  }
  set({ model, index }, acceptNext) {
    if (model.items.length === 0) {
      this.reset();
      return;
    }
    const nextIndex = SuggestAlternatives._moveIndex(true, model, index);
    if (nextIndex === index) {
      this.reset();
      return;
    }
    this._acceptNext = acceptNext;
    this._model = model;
    this._index = index;
    this._listener = this._editor.onDidChangeCursorPosition(() => {
      if (!this._ignore) {
        this.reset();
      }
    });
    this._ckOtherSuggestions.set(true);
  }
  static _moveIndex(fwd, model, index) {
    let newIndex = index;
    for (let rounds = model.items.length; rounds > 0; rounds--) {
      newIndex = (newIndex + model.items.length + (fwd ? 1 : -1)) % model.items.length;
      if (newIndex === index) {
        break;
      }
      if (!model.items[newIndex].completion.additionalTextEdits) {
        break;
      }
    }
    return newIndex;
  }
  next() {
    this._move(true);
  }
  prev() {
    this._move(false);
  }
  _move(fwd) {
    if (!this._model) {
      return;
    }
    try {
      this._ignore = true;
      this._index = SuggestAlternatives._moveIndex(fwd, this._model, this._index);
      this._acceptNext({ index: this._index, item: this._model.items[this._index], model: this._model });
    } finally {
      this._ignore = false;
    }
  }
};
SuggestAlternatives.OtherSuggestions = new RawContextKey("hasOtherSuggestions", false);
SuggestAlternatives = __decorateClass([
  __decorateParam(1, IContextKeyService)
], SuggestAlternatives);
export {
  SuggestAlternatives
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHN1Z2dlc3RcXGJyb3dzZXJcXHN1Z2dlc3RBbHRlcm5hdGl2ZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uTW9kZWwgfSBmcm9tICcuL2NvbXBsZXRpb25Nb2RlbC5qcyc7XG5pbXBvcnQgeyBJU2VsZWN0ZWRTdWdnZXN0aW9uIH0gZnJvbSAnLi9zdWdnZXN0V2lkZ2V0LmpzJztcblxuZXhwb3J0IGNsYXNzIFN1Z2dlc3RBbHRlcm5hdGl2ZXMge1xuXG5cdHN0YXRpYyByZWFkb25seSBPdGhlclN1Z2dlc3Rpb25zID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2hhc090aGVyU3VnZ2VzdGlvbnMnLCBmYWxzZSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2tPdGhlclN1Z2dlc3Rpb25zOiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIF9pbmRleDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBfbW9kZWw6IENvbXBsZXRpb25Nb2RlbCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYWNjZXB0TmV4dDogKChzZWxlY3RlZDogSVNlbGVjdGVkU3VnZ2VzdGlvbikgPT4gdW5rbm93bikgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xpc3RlbmVyOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaWdub3JlOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuX2NrT3RoZXJTdWdnZXN0aW9ucyA9IFN1Z2dlc3RBbHRlcm5hdGl2ZXMuT3RoZXJTdWdnZXN0aW9ucy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLnJlc2V0KCk7XG5cdH1cblxuXHRyZXNldCgpOiB2b2lkIHtcblx0XHR0aGlzLl9ja090aGVyU3VnZ2VzdGlvbnMucmVzZXQoKTtcblx0XHR0aGlzLl9saXN0ZW5lcj8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX21vZGVsID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2FjY2VwdE5leHQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5faWdub3JlID0gZmFsc2U7XG5cdH1cblxuXHRzZXQoeyBtb2RlbCwgaW5kZXggfTogSVNlbGVjdGVkU3VnZ2VzdGlvbiwgYWNjZXB0TmV4dDogKHNlbGVjdGVkOiBJU2VsZWN0ZWRTdWdnZXN0aW9uKSA9PiB1bmtub3duKTogdm9pZCB7XG5cblx0XHQvLyBubyBzdWdnZXN0aW9ucyAtPiBub3RoaW5nIHRvIGRvXG5cdFx0aWYgKG1vZGVsLml0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5yZXNldCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIG5vIGFsdGVybmF0aXZlIHN1Z2dlc3Rpb25zIC0+IG5vdGhpbmcgdG8gZG9cblx0XHRjb25zdCBuZXh0SW5kZXggPSBTdWdnZXN0QWx0ZXJuYXRpdmVzLl9tb3ZlSW5kZXgodHJ1ZSwgbW9kZWwsIGluZGV4KTtcblx0XHRpZiAobmV4dEluZGV4ID09PSBpbmRleCkge1xuXHRcdFx0dGhpcy5yZXNldCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2FjY2VwdE5leHQgPSBhY2NlcHROZXh0O1xuXHRcdHRoaXMuX21vZGVsID0gbW9kZWw7XG5cdFx0dGhpcy5faW5kZXggPSBpbmRleDtcblx0XHR0aGlzLl9saXN0ZW5lciA9IHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uKCgpID0+IHtcblx0XHRcdGlmICghdGhpcy5faWdub3JlKSB7XG5cdFx0XHRcdHRoaXMucmVzZXQoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLl9ja090aGVyU3VnZ2VzdGlvbnMuc2V0KHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX21vdmVJbmRleChmd2Q6IGJvb2xlYW4sIG1vZGVsOiBDb21wbGV0aW9uTW9kZWwsIGluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGxldCBuZXdJbmRleCA9IGluZGV4O1xuXHRcdGZvciAobGV0IHJvdW5kcyA9IG1vZGVsLml0ZW1zLmxlbmd0aDsgcm91bmRzID4gMDsgcm91bmRzLS0pIHtcblx0XHRcdG5ld0luZGV4ID0gKG5ld0luZGV4ICsgbW9kZWwuaXRlbXMubGVuZ3RoICsgKGZ3ZCA/ICsxIDogLTEpKSAlIG1vZGVsLml0ZW1zLmxlbmd0aDtcblx0XHRcdGlmIChuZXdJbmRleCA9PT0gaW5kZXgpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIW1vZGVsLml0ZW1zW25ld0luZGV4XS5jb21wbGV0aW9uLmFkZGl0aW9uYWxUZXh0RWRpdHMpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBuZXdJbmRleDtcblx0fVxuXG5cdG5leHQoKTogdm9pZCB7XG5cdFx0dGhpcy5fbW92ZSh0cnVlKTtcblx0fVxuXG5cdHByZXYoKTogdm9pZCB7XG5cdFx0dGhpcy5fbW92ZShmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIF9tb3ZlKGZ3ZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fbW9kZWwpIHtcblx0XHRcdC8vIG5vdGhpbmcgdG8gcmVhc29uIGFib3V0XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9pZ25vcmUgPSB0cnVlO1xuXHRcdFx0dGhpcy5faW5kZXggPSBTdWdnZXN0QWx0ZXJuYXRpdmVzLl9tb3ZlSW5kZXgoZndkLCB0aGlzLl9tb2RlbCwgdGhpcy5faW5kZXgpO1xuXHRcdFx0dGhpcy5fYWNjZXB0TmV4dCEoeyBpbmRleDogdGhpcy5faW5kZXgsIGl0ZW06IHRoaXMuX21vZGVsLml0ZW1zW3RoaXMuX2luZGV4XSwgbW9kZWw6IHRoaXMuX21vZGVsIH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9pZ25vcmUgPSBmYWxzZTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBT0EsU0FBc0Isb0JBQW9CLHFCQUFxQjtBQUl4RCxJQUFNLHNCQUFOLE1BQTBCO0FBQUEsRUFZaEMsWUFDa0IsU0FDRyxtQkFDbkI7QUFGZ0I7QUFQbEIsU0FBUSxTQUFpQjtBQVV4QixTQUFLLHNCQUFzQixvQkFBb0IsaUJBQWlCLE9BQU8saUJBQWlCO0FBQUEsRUFDekY7QUFBQSxFQUVBLFVBQWdCO0FBQ2YsU0FBSyxNQUFNO0FBQUEsRUFDWjtBQUFBLEVBRUEsUUFBYztBQUNiLFNBQUssb0JBQW9CLE1BQU07QUFDL0IsU0FBSyxXQUFXLFFBQVE7QUFDeEIsU0FBSyxTQUFTO0FBQ2QsU0FBSyxjQUFjO0FBQ25CLFNBQUssVUFBVTtBQUFBLEVBQ2hCO0FBQUEsRUFFQSxJQUFJLEVBQUUsT0FBTyxNQUFNLEdBQXdCLFlBQThEO0FBR3hHLFFBQUksTUFBTSxNQUFNLFdBQVcsR0FBRztBQUM3QixXQUFLLE1BQU07QUFDWDtBQUFBLElBQ0Q7QUFHQSxVQUFNLFlBQVksb0JBQW9CLFdBQVcsTUFBTSxPQUFPLEtBQUs7QUFDbkUsUUFBSSxjQUFjLE9BQU87QUFDeEIsV0FBSyxNQUFNO0FBQ1g7QUFBQSxJQUNEO0FBRUEsU0FBSyxjQUFjO0FBQ25CLFNBQUssU0FBUztBQUNkLFNBQUssU0FBUztBQUNkLFNBQUssWUFBWSxLQUFLLFFBQVEsMEJBQTBCLE1BQU07QUFDN0QsVUFBSSxDQUFDLEtBQUssU0FBUztBQUNsQixhQUFLLE1BQU07QUFBQSxNQUNaO0FBQUEsSUFDRCxDQUFDO0FBQ0QsU0FBSyxvQkFBb0IsSUFBSSxJQUFJO0FBQUEsRUFDbEM7QUFBQSxFQUVBLE9BQWUsV0FBVyxLQUFjLE9BQXdCLE9BQXVCO0FBQ3RGLFFBQUksV0FBVztBQUNmLGFBQVMsU0FBUyxNQUFNLE1BQU0sUUFBUSxTQUFTLEdBQUcsVUFBVTtBQUMzRCxrQkFBWSxXQUFXLE1BQU0sTUFBTSxVQUFVLE1BQU0sSUFBSyxPQUFPLE1BQU0sTUFBTTtBQUMzRSxVQUFJLGFBQWEsT0FBTztBQUN2QjtBQUFBLE1BQ0Q7QUFDQSxVQUFJLENBQUMsTUFBTSxNQUFNLFFBQVEsRUFBRSxXQUFXLHFCQUFxQjtBQUMxRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE9BQWE7QUFDWixTQUFLLE1BQU0sSUFBSTtBQUFBLEVBQ2hCO0FBQUEsRUFFQSxPQUFhO0FBQ1osU0FBSyxNQUFNLEtBQUs7QUFBQSxFQUNqQjtBQUFBLEVBRVEsTUFBTSxLQUFvQjtBQUNqQyxRQUFJLENBQUMsS0FBSyxRQUFRO0FBRWpCO0FBQUEsSUFDRDtBQUNBLFFBQUk7QUFDSCxXQUFLLFVBQVU7QUFDZixXQUFLLFNBQVMsb0JBQW9CLFdBQVcsS0FBSyxLQUFLLFFBQVEsS0FBSyxNQUFNO0FBQzFFLFdBQUssWUFBYSxFQUFFLE9BQU8sS0FBSyxRQUFRLE1BQU0sS0FBSyxPQUFPLE1BQU0sS0FBSyxNQUFNLEdBQUcsT0FBTyxLQUFLLE9BQU8sQ0FBQztBQUFBLElBQ25HLFVBQUU7QUFDRCxXQUFLLFVBQVU7QUFBQSxJQUNoQjtBQUFBLEVBQ0Q7QUFDRDtBQTVGYSxvQkFFSSxtQkFBbUIsSUFBSSxjQUF1Qix1QkFBdUIsS0FBSztBQUY5RSxzQkFBTjtBQUFBLEVBY0o7QUFBQSxHQWRVOyIsCiAgIm5hbWVzIjogW10KfQo=
