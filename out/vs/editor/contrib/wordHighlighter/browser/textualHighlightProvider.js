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
import { USUAL_WORD_SEPARATORS } from "../../../common/core/wordHelper.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { DocumentHighlightKind } from "../../../common/languages.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
class TextualDocumentHighlightProvider {
  constructor() {
    this.selector = { language: "*" };
  }
  provideDocumentHighlights(model, position, token) {
    if (model.isDisposed()) {
      return;
    }
    const result = [];
    const word = model.getWordAtPosition({
      lineNumber: position.lineNumber,
      column: position.column
    });
    if (!word) {
      return Promise.resolve(result);
    }
    const matches = model.findMatches(word.word, true, false, true, USUAL_WORD_SEPARATORS, false);
    return matches.map((m) => ({
      range: m.range,
      kind: DocumentHighlightKind.Text
    }));
  }
  provideMultiDocumentHighlights(primaryModel, position, otherModels, token) {
    if (primaryModel.isDisposed()) {
      return;
    }
    const result = new ResourceMap();
    const word = primaryModel.getWordAtPosition({
      lineNumber: position.lineNumber,
      column: position.column
    });
    if (!word) {
      return Promise.resolve(result);
    }
    for (const model of [primaryModel, ...otherModels]) {
      if (model.isDisposed()) {
        continue;
      }
      const matches = model.findMatches(word.word, true, false, true, USUAL_WORD_SEPARATORS, false);
      const highlights = matches.map((m) => ({
        range: m.range,
        kind: DocumentHighlightKind.Text
      }));
      if (highlights) {
        result.set(model.uri, highlights);
      }
    }
    return result;
  }
}
let TextualMultiDocumentHighlightFeature = class extends Disposable {
  constructor(languageFeaturesService) {
    super();
    this._register(languageFeaturesService.documentHighlightProvider.register("*", new TextualDocumentHighlightProvider()));
    this._register(languageFeaturesService.multiDocumentHighlightProvider.register("*", new TextualDocumentHighlightProvider()));
  }
};
TextualMultiDocumentHighlightFeature = __decorateClass([
  __decorateParam(0, ILanguageFeaturesService)
], TextualMultiDocumentHighlightFeature);
export {
  TextualMultiDocumentHighlightFeature
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHdvcmRIaWdobGlnaHRlclxcYnJvd3NlclxcdGV4dHVhbEhpZ2hsaWdodFByb3ZpZGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVVNVQUxfV09SRF9TRVBBUkFUT1JTIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvd29yZEhlbHBlci5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBEb2N1bWVudEhpZ2hsaWdodCwgRG9jdW1lbnRIaWdobGlnaHRLaW5kLCBEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyLCBNdWx0aURvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIsIFByb3ZpZGVyUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZUZpbHRlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZVNlbGVjdG9yLmpzJztcblxuXG5jbGFzcyBUZXh0dWFsRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlciBpbXBsZW1lbnRzIERvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIsIE11bHRpRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlciB7XG5cblx0c2VsZWN0b3I6IExhbmd1YWdlRmlsdGVyID0geyBsYW5ndWFnZTogJyonIH07XG5cblx0cHJvdmlkZURvY3VtZW50SGlnaGxpZ2h0cyhtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm92aWRlclJlc3VsdDxEb2N1bWVudEhpZ2hsaWdodFtdPiB7XG5cdFx0aWYgKG1vZGVsLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogRG9jdW1lbnRIaWdobGlnaHRbXSA9IFtdO1xuXG5cdFx0Y29uc3Qgd29yZCA9IG1vZGVsLmdldFdvcmRBdFBvc2l0aW9uKHtcblx0XHRcdGxpbmVOdW1iZXI6IHBvc2l0aW9uLmxpbmVOdW1iZXIsXG5cdFx0XHRjb2x1bW46IHBvc2l0aW9uLmNvbHVtblxuXHRcdH0pO1xuXG5cdFx0aWYgKCF3b3JkKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWF0Y2hlcyA9IG1vZGVsLmZpbmRNYXRjaGVzKHdvcmQud29yZCwgdHJ1ZSwgZmFsc2UsIHRydWUsIFVTVUFMX1dPUkRfU0VQQVJBVE9SUywgZmFsc2UpO1xuXHRcdHJldHVybiBtYXRjaGVzLm1hcChtID0+ICh7XG5cdFx0XHRyYW5nZTogbS5yYW5nZSxcblx0XHRcdGtpbmQ6IERvY3VtZW50SGlnaGxpZ2h0S2luZC5UZXh0XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdmlkZU11bHRpRG9jdW1lbnRIaWdobGlnaHRzKHByaW1hcnlNb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCBvdGhlck1vZGVsczogSVRleHRNb2RlbFtdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm92aWRlclJlc3VsdDxSZXNvdXJjZU1hcDxEb2N1bWVudEhpZ2hsaWdodFtdPj4ge1xuXHRcdGlmIChwcmltYXJ5TW9kZWwuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFJlc291cmNlTWFwPERvY3VtZW50SGlnaGxpZ2h0W10+KCk7XG5cblx0XHRjb25zdCB3b3JkID0gcHJpbWFyeU1vZGVsLmdldFdvcmRBdFBvc2l0aW9uKHtcblx0XHRcdGxpbmVOdW1iZXI6IHBvc2l0aW9uLmxpbmVOdW1iZXIsXG5cdFx0XHRjb2x1bW46IHBvc2l0aW9uLmNvbHVtblxuXHRcdH0pO1xuXHRcdGlmICghd29yZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHQpO1xuXHRcdH1cblxuXG5cdFx0Zm9yIChjb25zdCBtb2RlbCBvZiBbcHJpbWFyeU1vZGVsLCAuLi5vdGhlck1vZGVsc10pIHtcblx0XHRcdGlmIChtb2RlbC5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1hdGNoZXMgPSBtb2RlbC5maW5kTWF0Y2hlcyh3b3JkLndvcmQsIHRydWUsIGZhbHNlLCB0cnVlLCBVU1VBTF9XT1JEX1NFUEFSQVRPUlMsIGZhbHNlKTtcblx0XHRcdGNvbnN0IGhpZ2hsaWdodHMgPSBtYXRjaGVzLm1hcChtID0+ICh7XG5cdFx0XHRcdHJhbmdlOiBtLnJhbmdlLFxuXHRcdFx0XHRraW5kOiBEb2N1bWVudEhpZ2hsaWdodEtpbmQuVGV4dFxuXHRcdFx0fSkpO1xuXG5cdFx0XHRpZiAoaGlnaGxpZ2h0cykge1xuXHRcdFx0XHRyZXN1bHQuc2V0KG1vZGVsLnVyaSwgaGlnaGxpZ2h0cyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBUZXh0dWFsTXVsdGlEb2N1bWVudEhpZ2hsaWdodEZlYXR1cmUgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIucmVnaXN0ZXIoJyonLCBuZXcgVGV4dHVhbERvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLm11bHRpRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlci5yZWdpc3RlcignKicsIG5ldyBUZXh0dWFsRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlcigpKSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBNEIsNkJBQXdHO0FBSXBJLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsbUJBQW1CO0FBSTVCLE1BQU0saUNBQXNHO0FBQUEsRUFBNUc7QUFFQyxvQkFBMkIsRUFBRSxVQUFVLElBQUk7QUFBQTtBQUFBLEVBRTNDLDBCQUEwQixPQUFtQixVQUFvQixPQUErRDtBQUMvSCxRQUFJLE1BQU0sV0FBVyxHQUFHO0FBQ3ZCO0FBQUEsSUFDRDtBQUVBLFVBQU0sU0FBOEIsQ0FBQztBQUVyQyxVQUFNLE9BQU8sTUFBTSxrQkFBa0I7QUFBQSxNQUNwQyxZQUFZLFNBQVM7QUFBQSxNQUNyQixRQUFRLFNBQVM7QUFBQSxJQUNsQixDQUFDO0FBRUQsUUFBSSxDQUFDLE1BQU07QUFDVixhQUFPLFFBQVEsUUFBUSxNQUFNO0FBQUEsSUFDOUI7QUFFQSxVQUFNLFVBQVUsTUFBTSxZQUFZLEtBQUssTUFBTSxNQUFNLE9BQU8sTUFBTSx1QkFBdUIsS0FBSztBQUM1RixXQUFPLFFBQVEsSUFBSSxRQUFNO0FBQUEsTUFDeEIsT0FBTyxFQUFFO0FBQUEsTUFDVCxNQUFNLHNCQUFzQjtBQUFBLElBQzdCLEVBQUU7QUFBQSxFQUNIO0FBQUEsRUFFQSwrQkFBK0IsY0FBMEIsVUFBb0IsYUFBMkIsT0FBNEU7QUFDbkwsUUFBSSxhQUFhLFdBQVcsR0FBRztBQUM5QjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFNBQVMsSUFBSSxZQUFpQztBQUVwRCxVQUFNLE9BQU8sYUFBYSxrQkFBa0I7QUFBQSxNQUMzQyxZQUFZLFNBQVM7QUFBQSxNQUNyQixRQUFRLFNBQVM7QUFBQSxJQUNsQixDQUFDO0FBQ0QsUUFBSSxDQUFDLE1BQU07QUFDVixhQUFPLFFBQVEsUUFBUSxNQUFNO0FBQUEsSUFDOUI7QUFHQSxlQUFXLFNBQVMsQ0FBQyxjQUFjLEdBQUcsV0FBVyxHQUFHO0FBQ25ELFVBQUksTUFBTSxXQUFXLEdBQUc7QUFDdkI7QUFBQSxNQUNEO0FBRUEsWUFBTSxVQUFVLE1BQU0sWUFBWSxLQUFLLE1BQU0sTUFBTSxPQUFPLE1BQU0sdUJBQXVCLEtBQUs7QUFDNUYsWUFBTSxhQUFhLFFBQVEsSUFBSSxRQUFNO0FBQUEsUUFDcEMsT0FBTyxFQUFFO0FBQUEsUUFDVCxNQUFNLHNCQUFzQjtBQUFBLE1BQzdCLEVBQUU7QUFFRixVQUFJLFlBQVk7QUFDZixlQUFPLElBQUksTUFBTSxLQUFLLFVBQVU7QUFBQSxNQUNqQztBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUVEO0FBRU8sSUFBTSx1Q0FBTixjQUFtRCxXQUFXO0FBQUEsRUFDcEUsWUFDMkIseUJBQ3pCO0FBQ0QsVUFBTTtBQUNOLFNBQUssVUFBVSx3QkFBd0IsMEJBQTBCLFNBQVMsS0FBSyxJQUFJLGlDQUFpQyxDQUFDLENBQUM7QUFDdEgsU0FBSyxVQUFVLHdCQUF3QiwrQkFBK0IsU0FBUyxLQUFLLElBQUksaUNBQWlDLENBQUMsQ0FBQztBQUFBLEVBQzVIO0FBQ0Q7QUFSYSx1Q0FBTjtBQUFBLEVBRUo7QUFBQSxHQUZVOyIsCiAgIm5hbWVzIjogW10KfQo=
