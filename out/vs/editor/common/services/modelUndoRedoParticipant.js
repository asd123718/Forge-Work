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
import { IModelService } from "./model.js";
import { ITextModelService } from "./resolverService.js";
import { Disposable, dispose } from "../../../base/common/lifecycle.js";
import { IUndoRedoService } from "../../../platform/undoRedo/common/undoRedo.js";
import { MultiModelEditStackElement } from "../model/editStack.js";
let ModelUndoRedoParticipant = class extends Disposable {
  constructor(_modelService, _textModelService, _undoRedoService) {
    super();
    this._modelService = _modelService;
    this._textModelService = _textModelService;
    this._undoRedoService = _undoRedoService;
    this._register(this._modelService.onModelRemoved((model) => {
      const elements = this._undoRedoService.getElements(model.uri);
      if (elements.past.length === 0 && elements.future.length === 0) {
        return;
      }
      for (const element of elements.past) {
        if (element instanceof MultiModelEditStackElement) {
          element.setDelegate(this);
        }
      }
      for (const element of elements.future) {
        if (element instanceof MultiModelEditStackElement) {
          element.setDelegate(this);
        }
      }
    }));
  }
  prepareUndoRedo(element) {
    const missingModels = element.getMissingModels();
    if (missingModels.length === 0) {
      return Disposable.None;
    }
    const disposablesPromises = missingModels.map(async (uri) => {
      try {
        const reference = await this._textModelService.createModelReference(uri);
        return reference;
      } catch (err) {
        return Disposable.None;
      }
    });
    return Promise.all(disposablesPromises).then((disposables) => {
      return {
        dispose: () => dispose(disposables)
      };
    });
  }
};
ModelUndoRedoParticipant = __decorateClass([
  __decorateParam(0, IModelService),
  __decorateParam(1, ITextModelService),
  __decorateParam(2, IUndoRedoService)
], ModelUndoRedoParticipant);
export {
  ModelUndoRedoParticipant
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcc2VydmljZXNcXG1vZGVsVW5kb1JlZG9QYXJ0aWNpcGFudC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuL21vZGVsLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIGRpc3Bvc2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVVuZG9SZWRvU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3VuZG9SZWRvL2NvbW1vbi91bmRvUmVkby5qcyc7XG5pbXBvcnQgeyBJVW5kb1JlZG9EZWxlZ2F0ZSwgTXVsdGlNb2RlbEVkaXRTdGFja0VsZW1lbnQgfSBmcm9tICcuLi9tb2RlbC9lZGl0U3RhY2suanMnO1xuXG5leHBvcnQgY2xhc3MgTW9kZWxVbmRvUmVkb1BhcnRpY2lwYW50IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElVbmRvUmVkb0RlbGVnYXRlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASVVuZG9SZWRvU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91bmRvUmVkb1NlcnZpY2U6IElVbmRvUmVkb1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbW9kZWxTZXJ2aWNlLm9uTW9kZWxSZW1vdmVkKChtb2RlbCkgPT4ge1xuXHRcdFx0Ly8gYSBtb2RlbCB3aWxsIGdldCBkaXNwb3NlZCwgc28gbGV0J3MgY2hlY2sgaWYgdGhlIHVuZG8gcmVkbyBzdGFjayBpcyBtYWludGFpbmVkXG5cdFx0XHRjb25zdCBlbGVtZW50cyA9IHRoaXMuX3VuZG9SZWRvU2VydmljZS5nZXRFbGVtZW50cyhtb2RlbC51cmkpO1xuXHRcdFx0aWYgKGVsZW1lbnRzLnBhc3QubGVuZ3RoID09PSAwICYmIGVsZW1lbnRzLmZ1dHVyZS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIGVsZW1lbnRzLnBhc3QpIHtcblx0XHRcdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBNdWx0aU1vZGVsRWRpdFN0YWNrRWxlbWVudCkge1xuXHRcdFx0XHRcdGVsZW1lbnQuc2V0RGVsZWdhdGUodGhpcyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiBlbGVtZW50cy5mdXR1cmUpIHtcblx0XHRcdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBNdWx0aU1vZGVsRWRpdFN0YWNrRWxlbWVudCkge1xuXHRcdFx0XHRcdGVsZW1lbnQuc2V0RGVsZWdhdGUodGhpcyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgcHJlcGFyZVVuZG9SZWRvKGVsZW1lbnQ6IE11bHRpTW9kZWxFZGl0U3RhY2tFbGVtZW50KTogSURpc3Bvc2FibGUgfCBQcm9taXNlPElEaXNwb3NhYmxlPiB7XG5cdFx0Ly8gTG9hZCBhbGwgdGhlIG5lZWRlZCB0ZXh0IG1vZGVsc1xuXHRcdGNvbnN0IG1pc3NpbmdNb2RlbHMgPSBlbGVtZW50LmdldE1pc3NpbmdNb2RlbHMoKTtcblx0XHRpZiAobWlzc2luZ01vZGVscy5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIEFsbCBtb2RlbHMgYXJlIGF2YWlsYWJsZSFcblx0XHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXNQcm9taXNlcyA9IG1pc3NpbmdNb2RlbHMubWFwKGFzeW5jICh1cmkpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlZmVyZW5jZSA9IGF3YWl0IHRoaXMuX3RleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UodXJpKTtcblx0XHRcdFx0cmV0dXJuIDxJRGlzcG9zYWJsZT5yZWZlcmVuY2U7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0Ly8gVGhpcyBtb2RlbCBjb3VsZCBub3QgYmUgbG9hZGVkLCBtYXliZSBpdCB3YXMgZGVsZXRlZCBpbiB0aGUgbWVhbnRpbWU/XG5cdFx0XHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwoZGlzcG9zYWJsZXNQcm9taXNlcykudGhlbihkaXNwb3NhYmxlcyA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiBkaXNwb3NlKGRpc3Bvc2FibGVzKVxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFlBQXlCLGVBQWU7QUFDakQsU0FBUyx3QkFBd0I7QUFDakMsU0FBNEIsa0NBQWtDO0FBRXZELElBQU0sMkJBQU4sY0FBdUMsV0FBd0M7QUFBQSxFQUNyRixZQUNpQyxlQUNJLG1CQUNELGtCQUNsQztBQUNELFVBQU07QUFKMEI7QUFDSTtBQUNEO0FBR25DLFNBQUssVUFBVSxLQUFLLGNBQWMsZUFBZSxDQUFDLFVBQVU7QUFFM0QsWUFBTSxXQUFXLEtBQUssaUJBQWlCLFlBQVksTUFBTSxHQUFHO0FBQzVELFVBQUksU0FBUyxLQUFLLFdBQVcsS0FBSyxTQUFTLE9BQU8sV0FBVyxHQUFHO0FBQy9EO0FBQUEsTUFDRDtBQUNBLGlCQUFXLFdBQVcsU0FBUyxNQUFNO0FBQ3BDLFlBQUksbUJBQW1CLDRCQUE0QjtBQUNsRCxrQkFBUSxZQUFZLElBQUk7QUFBQSxRQUN6QjtBQUFBLE1BQ0Q7QUFDQSxpQkFBVyxXQUFXLFNBQVMsUUFBUTtBQUN0QyxZQUFJLG1CQUFtQiw0QkFBNEI7QUFDbEQsa0JBQVEsWUFBWSxJQUFJO0FBQUEsUUFDekI7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFTyxnQkFBZ0IsU0FBeUU7QUFFL0YsVUFBTSxnQkFBZ0IsUUFBUSxpQkFBaUI7QUFDL0MsUUFBSSxjQUFjLFdBQVcsR0FBRztBQUUvQixhQUFPLFdBQVc7QUFBQSxJQUNuQjtBQUVBLFVBQU0sc0JBQXNCLGNBQWMsSUFBSSxPQUFPLFFBQVE7QUFDNUQsVUFBSTtBQUNILGNBQU0sWUFBWSxNQUFNLEtBQUssa0JBQWtCLHFCQUFxQixHQUFHO0FBQ3ZFLGVBQW9CO0FBQUEsTUFDckIsU0FBUyxLQUFLO0FBRWIsZUFBTyxXQUFXO0FBQUEsTUFDbkI7QUFBQSxJQUNELENBQUM7QUFFRCxXQUFPLFFBQVEsSUFBSSxtQkFBbUIsRUFBRSxLQUFLLGlCQUFlO0FBQzNELGFBQU87QUFBQSxRQUNOLFNBQVMsTUFBTSxRQUFRLFdBQVc7QUFBQSxNQUNuQztBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQWxEYSwyQkFBTjtBQUFBLEVBRUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBSlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
