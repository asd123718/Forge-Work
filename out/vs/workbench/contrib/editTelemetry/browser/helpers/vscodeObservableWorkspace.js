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
import { onUnexpectedError } from "../../../../../base/common/errors.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { derived, mapObservableArrayCached, observableSignalFromEvent, observableValue, transaction } from "../../../../../base/common/observable.js";
import { isDefined } from "../../../../../base/common/types.js";
import { StringText } from "../../../../../editor/common/core/text/abstractText.js";
import { offsetEditFromContentChanges } from "../../../../../editor/common/model/textModelStringEdit.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { ObservableWorkspace, StringEditWithReason } from "./observableWorkspace.js";
let VSCodeWorkspace = class extends ObservableWorkspace {
  constructor(_textModelService) {
    super();
    this._textModelService = _textModelService;
    this._store = new DisposableStore();
    const onModelAdded = observableSignalFromEvent(this, this._textModelService.onModelAdded);
    const onModelRemoved = observableSignalFromEvent(this, this._textModelService.onModelRemoved);
    const models = derived(this, (reader) => {
      onModelAdded.read(reader);
      onModelRemoved.read(reader);
      const models2 = this._textModelService.getModels();
      return models2;
    });
    const documents = mapObservableArrayCached(this, models, (m, store) => {
      if (m.isTooLargeForSyncing()) {
        return void 0;
      }
      return store.add(new VSCodeDocument(m));
    }).recomputeInitiallyAndOnChange(this._store).map((d) => d.filter(isDefined));
    this._documents = documents;
  }
  get documents() {
    return this._documents;
  }
  dispose() {
    this._store.dispose();
  }
};
VSCodeWorkspace = __decorateClass([
  __decorateParam(0, IModelService)
], VSCodeWorkspace);
class VSCodeDocument extends Disposable {
  constructor(textModel) {
    super();
    this.textModel = textModel;
    this._value = observableValue(this, new StringText(this.textModel.getValue()));
    this._version = observableValue(this, this.textModel.getVersionId());
    this._languageId = observableValue(this, this.textModel.getLanguageId());
    this._register(this.textModel.onDidChangeContent((e) => {
      transaction((tx) => {
        const edit = offsetEditFromContentChanges(e.changes);
        if (e.detailedReasons.length !== 1) {
          onUnexpectedError(new Error(`Unexpected number of detailed reasons: ${e.detailedReasons.length}`));
        }
        const change = new StringEditWithReason(edit.replacements, e.detailedReasons[0]);
        this._value.set(new StringText(this.textModel.getValue()), tx, change);
        this._version.set(this.textModel.getVersionId(), tx);
      });
    }));
    this._register(this.textModel.onDidChangeLanguage((e) => {
      transaction((tx) => {
        this._languageId.set(this.textModel.getLanguageId(), tx);
      });
    }));
  }
  get uri() {
    return this.textModel.uri;
  }
  get value() {
    return this._value;
  }
  get version() {
    return this._version;
  }
  get languageId() {
    return this._languageId;
  }
}
export {
  VSCodeDocument,
  VSCodeWorkspace
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGVkaXRUZWxlbWV0cnlcXGJyb3dzZXJcXGhlbHBlcnNcXHZzY29kZU9ic2VydmFibGVXb3Jrc3BhY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGRlcml2ZWQsIElPYnNlcnZhYmxlLCBJT2JzZXJ2YWJsZVdpdGhDaGFuZ2UsIG1hcE9ic2VydmFibGVBcnJheUNhY2hlZCwgb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCwgb2JzZXJ2YWJsZVZhbHVlLCB0cmFuc2FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFN0cmluZ1RleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvdGV4dC9hYnN0cmFjdFRleHQuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgb2Zmc2V0RWRpdEZyb21Db250ZW50Q2hhbmdlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdGV4dE1vZGVsU3RyaW5nRWRpdC5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZURvY3VtZW50LCBPYnNlcnZhYmxlV29ya3NwYWNlLCBTdHJpbmdFZGl0V2l0aFJlYXNvbiB9IGZyb20gJy4vb2JzZXJ2YWJsZVdvcmtzcGFjZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBWU0NvZGVXb3Jrc3BhY2UgZXh0ZW5kcyBPYnNlcnZhYmxlV29ya3NwYWNlIGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHM7XG5cdHB1YmxpYyBnZXQgZG9jdW1lbnRzKCkgeyByZXR1cm4gdGhpcy5fZG9jdW1lbnRzOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGV4dE1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IG9uTW9kZWxBZGRlZCA9IG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQodGhpcywgdGhpcy5fdGV4dE1vZGVsU2VydmljZS5vbk1vZGVsQWRkZWQpO1xuXHRcdGNvbnN0IG9uTW9kZWxSZW1vdmVkID0gb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCh0aGlzLCB0aGlzLl90ZXh0TW9kZWxTZXJ2aWNlLm9uTW9kZWxSZW1vdmVkKTtcblxuXHRcdGNvbnN0IG1vZGVscyA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdG9uTW9kZWxBZGRlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRvbk1vZGVsUmVtb3ZlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBtb2RlbHMgPSB0aGlzLl90ZXh0TW9kZWxTZXJ2aWNlLmdldE1vZGVscygpO1xuXHRcdFx0cmV0dXJuIG1vZGVscztcblx0XHR9KTtcblxuXHRcdGNvbnN0IGRvY3VtZW50cyA9IG1hcE9ic2VydmFibGVBcnJheUNhY2hlZCh0aGlzLCBtb2RlbHMsIChtLCBzdG9yZSkgPT4ge1xuXHRcdFx0aWYgKG0uaXNUb29MYXJnZUZvclN5bmNpbmcoKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHN0b3JlLmFkZChuZXcgVlNDb2RlRG9jdW1lbnQobSkpO1xuXHRcdH0pLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlKS5tYXAoZCA9PiBkLmZpbHRlcihpc0RlZmluZWQpKTtcblxuXHRcdHRoaXMuX2RvY3VtZW50cyA9IGRvY3VtZW50cztcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RvcmUuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBWU0NvZGVEb2N1bWVudCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJT2JzZXJ2YWJsZURvY3VtZW50IHtcblx0Z2V0IHVyaSgpOiBVUkkgeyByZXR1cm4gdGhpcy50ZXh0TW9kZWwudXJpOyB9XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZhbHVlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF92ZXJzaW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUlkO1xuXHRnZXQgdmFsdWUoKTogSU9ic2VydmFibGVXaXRoQ2hhbmdlPFN0cmluZ1RleHQsIFN0cmluZ0VkaXRXaXRoUmVhc29uPiB7IHJldHVybiB0aGlzLl92YWx1ZTsgfVxuXHRnZXQgdmVyc2lvbigpOiBJT2JzZXJ2YWJsZTxudW1iZXI+IHsgcmV0dXJuIHRoaXMuX3ZlcnNpb247IH1cblx0Z2V0IGxhbmd1YWdlSWQoKTogSU9ic2VydmFibGU8c3RyaW5nPiB7IHJldHVybiB0aGlzLl9sYW5ndWFnZUlkOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHRleHRNb2RlbDogSVRleHRNb2RlbCxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3ZhbHVlID0gb2JzZXJ2YWJsZVZhbHVlPFN0cmluZ1RleHQsIFN0cmluZ0VkaXRXaXRoUmVhc29uPih0aGlzLCBuZXcgU3RyaW5nVGV4dCh0aGlzLnRleHRNb2RlbC5nZXRWYWx1ZSgpKSk7XG5cdFx0dGhpcy5fdmVyc2lvbiA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB0aGlzLnRleHRNb2RlbC5nZXRWZXJzaW9uSWQoKSk7XG5cdFx0dGhpcy5fbGFuZ3VhZ2VJZCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB0aGlzLnRleHRNb2RlbC5nZXRMYW5ndWFnZUlkKCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50ZXh0TW9kZWwub25EaWRDaGFuZ2VDb250ZW50KChlKSA9PiB7XG5cdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdGNvbnN0IGVkaXQgPSBvZmZzZXRFZGl0RnJvbUNvbnRlbnRDaGFuZ2VzKGUuY2hhbmdlcyk7XG5cdFx0XHRcdGlmIChlLmRldGFpbGVkUmVhc29ucy5sZW5ndGggIT09IDEpIHtcblx0XHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihuZXcgRXJyb3IoYFVuZXhwZWN0ZWQgbnVtYmVyIG9mIGRldGFpbGVkIHJlYXNvbnM6ICR7ZS5kZXRhaWxlZFJlYXNvbnMubGVuZ3RofWApKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGNoYW5nZSA9IG5ldyBTdHJpbmdFZGl0V2l0aFJlYXNvbihlZGl0LnJlcGxhY2VtZW50cywgZS5kZXRhaWxlZFJlYXNvbnNbMF0pO1xuXG5cdFx0XHRcdHRoaXMuX3ZhbHVlLnNldChuZXcgU3RyaW5nVGV4dCh0aGlzLnRleHRNb2RlbC5nZXRWYWx1ZSgpKSwgdHgsIGNoYW5nZSk7XG5cdFx0XHRcdHRoaXMuX3ZlcnNpb24uc2V0KHRoaXMudGV4dE1vZGVsLmdldFZlcnNpb25JZCgpLCB0eCk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRleHRNb2RlbC5vbkRpZENoYW5nZUxhbmd1YWdlKGUgPT4ge1xuXHRcdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0XHR0aGlzLl9sYW5ndWFnZUlkLnNldCh0aGlzLnRleHRNb2RlbC5nZXRMYW5ndWFnZUlkKCksIHR4KTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFlBQVksdUJBQW9DO0FBQ3pELFNBQVMsU0FBNkMsMEJBQTBCLDJCQUEyQixpQkFBaUIsbUJBQW1CO0FBQy9JLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMscUJBQXFCO0FBQzlCLFNBQThCLHFCQUFxQiw0QkFBNEI7QUFFeEUsSUFBTSxrQkFBTixjQUE4QixvQkFBMkM7QUFBQSxFQU0vRSxZQUNpQyxtQkFDL0I7QUFDRCxVQUFNO0FBRjBCO0FBSGpDLFNBQWlCLFNBQVMsSUFBSSxnQkFB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
