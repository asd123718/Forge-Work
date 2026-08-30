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
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { TrackedRangeStickiness } from "../../../../../editor/common/model.js";
import { ModelDecorationOptions } from "../../../../../editor/common/model/textModel.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
let RangeHighlightDecorations = class {
  constructor(_modelService) {
    this._modelService = _modelService;
    this._decorationId = null;
    this._model = null;
    this._modelDisposables = new DisposableStore();
  }
  removeHighlightRange() {
    if (this._model && this._decorationId) {
      const decorationId = this._decorationId;
      this._model.changeDecorations((accessor) => {
        accessor.removeDecoration(decorationId);
      });
    }
    this._decorationId = null;
  }
  highlightRange(resource, range, ownerId = 0) {
    let model;
    if (URI.isUri(resource)) {
      model = this._modelService.getModel(resource);
    } else {
      model = resource;
    }
    if (model) {
      this.doHighlightRange(model, range);
    }
  }
  doHighlightRange(model, range) {
    this.removeHighlightRange();
    model.changeDecorations((accessor) => {
      this._decorationId = accessor.addDecoration(range, RangeHighlightDecorations._RANGE_HIGHLIGHT_DECORATION);
    });
    this.setModel(model);
  }
  setModel(model) {
    if (this._model !== model) {
      this.clearModelListeners();
      this._model = model;
      this._modelDisposables.add(this._model.onDidChangeDecorations((e) => {
        this.clearModelListeners();
        this.removeHighlightRange();
        this._model = null;
      }));
      this._modelDisposables.add(this._model.onWillDispose(() => {
        this.clearModelListeners();
        this.removeHighlightRange();
        this._model = null;
      }));
    }
  }
  clearModelListeners() {
    this._modelDisposables.clear();
  }
  dispose() {
    if (this._model) {
      this.removeHighlightRange();
      this._model = null;
    }
    this._modelDisposables.dispose();
  }
};
RangeHighlightDecorations._RANGE_HIGHLIGHT_DECORATION = ModelDecorationOptions.register({
  description: "search-range-highlight",
  stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
  className: "rangeHighlight",
  isWholeLine: true
});
RangeHighlightDecorations = __decorateClass([
  __decorateParam(0, IModelService)
], RangeHighlightDecorations);
export {
  RangeHighlightDecorations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNlYXJjaFxcYnJvd3Nlclxcc2VhcmNoVHJlZU1vZGVsXFxyYW5nZURlY29yYXRpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSURpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcblxuLyoqXG4gKiBDYW4gYWRkIGEgcmFuZ2UgaGlnaGxpZ2h0IGRlY29yYXRpb24gdG8gYSBtb2RlbC5cbiAqIEl0IHdpbGwgYXV0b21hdGljYWxseSByZW1vdmUgaXQgd2hlbiB0aGUgbW9kZWwgaGFzIGl0cyBkZWNvcmF0aW9ucyBjaGFuZ2VkLlxuICovXG5cbmV4cG9ydCBjbGFzcyBSYW5nZUhpZ2hsaWdodERlY29yYXRpb25zIGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgX2RlY29yYXRpb25JZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX21vZGVsOiBJVGV4dE1vZGVsIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlXG5cdCkge1xuXHR9XG5cblx0cmVtb3ZlSGlnaGxpZ2h0UmFuZ2UoKSB7XG5cdFx0aWYgKHRoaXMuX21vZGVsICYmIHRoaXMuX2RlY29yYXRpb25JZCkge1xuXHRcdFx0Y29uc3QgZGVjb3JhdGlvbklkID0gdGhpcy5fZGVjb3JhdGlvbklkO1xuXHRcdFx0dGhpcy5fbW9kZWwuY2hhbmdlRGVjb3JhdGlvbnMoKGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdGFjY2Vzc29yLnJlbW92ZURlY29yYXRpb24oZGVjb3JhdGlvbklkKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHR0aGlzLl9kZWNvcmF0aW9uSWQgPSBudWxsO1xuXHR9XG5cblx0aGlnaGxpZ2h0UmFuZ2UocmVzb3VyY2U6IFVSSSB8IElUZXh0TW9kZWwsIHJhbmdlOiBSYW5nZSwgb3duZXJJZDogbnVtYmVyID0gMCk6IHZvaWQge1xuXHRcdGxldCBtb2RlbDogSVRleHRNb2RlbCB8IG51bGw7XG5cdFx0aWYgKFVSSS5pc1VyaShyZXNvdXJjZSkpIHtcblx0XHRcdG1vZGVsID0gdGhpcy5fbW9kZWxTZXJ2aWNlLmdldE1vZGVsKHJlc291cmNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bW9kZWwgPSByZXNvdXJjZTtcblx0XHR9XG5cblx0XHRpZiAobW9kZWwpIHtcblx0XHRcdHRoaXMuZG9IaWdobGlnaHRSYW5nZShtb2RlbCwgcmFuZ2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZG9IaWdobGlnaHRSYW5nZShtb2RlbDogSVRleHRNb2RlbCwgcmFuZ2U6IFJhbmdlKSB7XG5cdFx0dGhpcy5yZW1vdmVIaWdobGlnaHRSYW5nZSgpO1xuXHRcdG1vZGVsLmNoYW5nZURlY29yYXRpb25zKChhY2Nlc3NvcikgPT4ge1xuXHRcdFx0dGhpcy5fZGVjb3JhdGlvbklkID0gYWNjZXNzb3IuYWRkRGVjb3JhdGlvbihyYW5nZSwgUmFuZ2VIaWdobGlnaHREZWNvcmF0aW9ucy5fUkFOR0VfSElHSExJR0hUX0RFQ09SQVRJT04pO1xuXHRcdH0pO1xuXHRcdHRoaXMuc2V0TW9kZWwobW9kZWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRNb2RlbChtb2RlbDogSVRleHRNb2RlbCkge1xuXHRcdGlmICh0aGlzLl9tb2RlbCAhPT0gbW9kZWwpIHtcblx0XHRcdHRoaXMuY2xlYXJNb2RlbExpc3RlbmVycygpO1xuXHRcdFx0dGhpcy5fbW9kZWwgPSBtb2RlbDtcblx0XHRcdHRoaXMuX21vZGVsRGlzcG9zYWJsZXMuYWRkKHRoaXMuX21vZGVsLm9uRGlkQ2hhbmdlRGVjb3JhdGlvbnMoKGUpID0+IHtcblx0XHRcdFx0dGhpcy5jbGVhck1vZGVsTGlzdGVuZXJzKCk7XG5cdFx0XHRcdHRoaXMucmVtb3ZlSGlnaGxpZ2h0UmFuZ2UoKTtcblx0XHRcdFx0dGhpcy5fbW9kZWwgPSBudWxsO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fbW9kZWxEaXNwb3NhYmxlcy5hZGQodGhpcy5fbW9kZWwub25XaWxsRGlzcG9zZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuY2xlYXJNb2RlbExpc3RlbmVycygpO1xuXHRcdFx0XHR0aGlzLnJlbW92ZUhpZ2hsaWdodFJhbmdlKCk7XG5cdFx0XHRcdHRoaXMuX21vZGVsID0gbnVsbDtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyTW9kZWxMaXN0ZW5lcnMoKSB7XG5cdFx0dGhpcy5fbW9kZWxEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZSgpIHtcblx0XHRpZiAodGhpcy5fbW9kZWwpIHtcblx0XHRcdHRoaXMucmVtb3ZlSGlnaGxpZ2h0UmFuZ2UoKTtcblx0XHRcdHRoaXMuX21vZGVsID0gbnVsbDtcblx0XHR9XG5cdFx0dGhpcy5fbW9kZWxEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfUkFOR0VfSElHSExJR0hUX0RFQ09SQVRJT04gPSBNb2RlbERlY29yYXRpb25PcHRpb25zLnJlZ2lzdGVyKHtcblx0XHRkZXNjcmlwdGlvbjogJ3NlYXJjaC1yYW5nZS1oaWdobGlnaHQnLFxuXHRcdHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLFxuXHRcdGNsYXNzTmFtZTogJ3JhbmdlSGlnaGxpZ2h0Jyxcblx0XHRpc1dob2xlTGluZTogdHJ1ZVxuXHR9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBc0IsdUJBQXVCO0FBQzdDLFNBQVMsV0FBVztBQUNwQixTQUFxQiw4QkFBOEI7QUFDbkQsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxxQkFBcUI7QUFRdkIsSUFBTSw0QkFBTixNQUF1RDtBQUFBLEVBTTdELFlBQ2lDLGVBQy9CO0FBRCtCO0FBTGpDLFNBQVEsZ0JBQStCO0FBQ3ZDLFNBQVEsU0FBNEI7QUFDcEMsU0FBaUIsb0JBQW9CLElBQUksZ0JBQWdCO0FBQUEsRUFLekQ7QUFBQSxFQUVBLHVCQUF1QjtBQUN0QixRQUFJLEtBQUssVUFBVSxLQUFLLGVBQWU7QUFDdEMsWUFBTSxlQUFlLEtBQUs7QUFDMUIsV0FBSyxPQUFPLGtCQUFrQixDQUFDLGFBQWE7QUFDM0MsaUJBQVMsaUJBQWlCLFlBQVk7QUFBQSxNQUN2QyxDQUFDO0FBQUEsSUFDRjtBQUNBLFNBQUssZ0JBQWdCO0FBQUEsRUFDdEI7QUFBQSxFQUVBLGVBQWUsVUFBNEIsT0FBYyxVQUFrQixHQUFTO0FBQ25GLFFBQUk7QUFDSixRQUFJLElBQUksTUFBTSxRQUFRLEdBQUc7QUFDeEIsY0FBUSxLQUFLLGNBQWMsU0FBUyxRQUFRO0FBQUEsSUFDN0MsT0FBTztBQUNOLGNBQVE7QUFBQSxJQUNUO0FBRUEsUUFBSSxPQUFPO0FBQ1YsV0FBSyxpQkFBaUIsT0FBTyxLQUFLO0FBQUEsSUFDbkM7QUFBQSxFQUNEO0FBQUEsRUFFUSxpQkFBaUIsT0FBbUIsT0FBYztBQUN6RCxTQUFLLHFCQUFxQjtBQUMxQixVQUFNLGtCQUFrQixDQUFDLGFBQWE7QUFDckMsV0FBSyxnQkFBZ0IsU0FBUyxjQUFjLE9BQU8sMEJBQTBCLDJCQUEyQjtBQUFBLElBQ3pHLENBQUM7QUFDRCxTQUFLLFNBQVMsS0FBSztBQUFBLEVBQ3BCO0FBQUEsRUFFUSxTQUFTLE9BQW1CO0FBQ25DLFFBQUksS0FBSyxXQUFXLE9BQU87QUFDMUIsV0FBSyxvQkFBb0I7QUFDekIsV0FBSyxTQUFTO0FBQ2QsV0FBSyxrQkFBa0IsSUFBSSxLQUFLLE9BQU8sdUJBQXVCLENBQUMsTUFBTTtBQUNwRSxhQUFLLG9CQUFvQjtBQUN6QixhQUFLLHFCQUFxQjtBQUMxQixhQUFLLFNBQVM7QUFBQSxNQUNmLENBQUMsQ0FBQztBQUNGLFdBQUssa0JBQWtCLElBQUksS0FBSyxPQUFPLGNBQWMsTUFBTTtBQUMxRCxhQUFLLG9CQUFvQjtBQUN6QixhQUFLLHFCQUFxQjtBQUMxQixhQUFLLFNBQVM7QUFBQSxNQUNmLENBQUMsQ0FBQztBQUFBLElBQ0g7QUFBQSxFQUNEO0FBQUEsRUFFUSxzQkFBc0I7QUFDN0IsU0FBSyxrQkFBa0IsTUFBTTtBQUFBLEVBQzlCO0FBQUEsRUFFQSxVQUFVO0FBQ1QsUUFBSSxLQUFLLFFBQVE7QUFDaEIsV0FBSyxxQkFBcUI7QUFDMUIsV0FBSyxTQUFTO0FBQUEsSUFDZjtBQUNBLFNBQUssa0JBQWtCLFFBQVE7QUFBQSxFQUNoQztBQVFEO0FBN0VhLDBCQXVFWSw4QkFBOEIsdUJBQXVCLFNBQVM7QUFBQSxFQUNyRixhQUFhO0FBQUEsRUFDYixZQUFZLHVCQUF1QjtBQUFBLEVBQ25DLFdBQVc7QUFBQSxFQUNYLGFBQWE7QUFDZCxDQUFDO0FBNUVXLDRCQUFOO0FBQUEsRUFPSjtBQUFBLEdBUFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
