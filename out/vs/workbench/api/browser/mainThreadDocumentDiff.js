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
import { URI } from "../../../base/common/uri.js";
import { IEditorWorkerService } from "../../../editor/common/services/editorWorker.js";
import { MainContext } from "../common/extHost.protocol.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
let MainThreadDocumentDiff = class {
  constructor(_extHostContext, _editorWorkerService) {
    this._editorWorkerService = _editorWorkerService;
  }
  async $computeDocumentDiff(originalUri, modifiedUri, ignoreTrimWhitespace, maxComputationTimeMs, computeMoves) {
    const original = URI.revive(originalUri);
    const modified = URI.revive(modifiedUri);
    const result = await this._editorWorkerService.computeDiff(original, modified, {
      ignoreTrimWhitespace,
      maxComputationTimeMs,
      computeMoves
    }, "advanced");
    if (!result) {
      return null;
    }
    const toLineRange = (r) => ({
      startLineNumber: r.startLineNumber,
      startColumn: 1,
      endLineNumber: r.endLineNumberExclusive,
      endColumn: 1
    });
    const mapChange = (c) => ({
      originalRange: toLineRange(c.original),
      modifiedRange: toLineRange(c.modified),
      innerChanges: c.innerChanges?.map((ic) => ({
        originalRange: ic.originalRange,
        modifiedRange: ic.modifiedRange
      }))
    });
    return {
      identical: result.identical,
      quitEarly: result.quitEarly,
      changes: result.changes.map(mapChange),
      moves: result.moves.map((m) => ({
        originalRange: toLineRange(m.lineRangeMapping.original),
        modifiedRange: toLineRange(m.lineRangeMapping.modified),
        changes: m.changes.map(mapChange)
      }))
    };
  }
  dispose() {
  }
};
MainThreadDocumentDiff = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadDocumentDiff),
  __decorateParam(1, IEditorWorkerService)
], MainThreadDocumentDiff);
export {
  MainThreadDocumentDiff
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZERvY3VtZW50RGlmZi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUVkaXRvcldvcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2VkaXRvcldvcmtlci5qcyc7XG5pbXBvcnQgeyBJRG9jdW1lbnREaWZmTGluZUNoYW5nZUR0bywgSURvY3VtZW50RGlmZlJlc3VsdER0bywgTWFpbkNvbnRleHQsIE1haW5UaHJlYWREb2N1bWVudERpZmZTaGFwZSB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IGV4dEhvc3ROYW1lZEN1c3RvbWVyLCBJRXh0SG9zdENvbnRleHQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRIb3N0Q3VzdG9tZXJzLmpzJztcblxuQGV4dEhvc3ROYW1lZEN1c3RvbWVyKE1haW5Db250ZXh0Lk1haW5UaHJlYWREb2N1bWVudERpZmYpXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZERvY3VtZW50RGlmZiBpbXBsZW1lbnRzIE1haW5UaHJlYWREb2N1bWVudERpZmZTaGFwZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0X2V4dEhvc3RDb250ZXh0OiBJRXh0SG9zdENvbnRleHQsXG5cdFx0QElFZGl0b3JXb3JrZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcldvcmtlclNlcnZpY2U6IElFZGl0b3JXb3JrZXJTZXJ2aWNlLFxuXHQpIHtcblx0fVxuXG5cdGFzeW5jICRjb21wdXRlRG9jdW1lbnREaWZmKG9yaWdpbmFsVXJpOiBVcmlDb21wb25lbnRzLCBtb2RpZmllZFVyaTogVXJpQ29tcG9uZW50cywgaWdub3JlVHJpbVdoaXRlc3BhY2U6IGJvb2xlYW4sIG1heENvbXB1dGF0aW9uVGltZU1zOiBudW1iZXIsIGNvbXB1dGVNb3ZlczogYm9vbGVhbik6IFByb21pc2U8SURvY3VtZW50RGlmZlJlc3VsdER0byB8IG51bGw+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFVSSS5yZXZpdmUob3JpZ2luYWxVcmkpO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gVVJJLnJldml2ZShtb2RpZmllZFVyaSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fZWRpdG9yV29ya2VyU2VydmljZS5jb21wdXRlRGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIHtcblx0XHRcdGlnbm9yZVRyaW1XaGl0ZXNwYWNlLFxuXHRcdFx0bWF4Q29tcHV0YXRpb25UaW1lTXMsXG5cdFx0XHRjb21wdXRlTW92ZXMsXG5cdFx0fSwgJ2FkdmFuY2VkJyk7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCB0b0xpbmVSYW5nZSA9IChyOiB7IHN0YXJ0TGluZU51bWJlcjogbnVtYmVyOyBlbmRMaW5lTnVtYmVyRXhjbHVzaXZlOiBudW1iZXIgfSk6IElSYW5nZSA9PiAoe1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiByLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0ZW5kTGluZU51bWJlcjogci5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlLFxuXHRcdFx0ZW5kQ29sdW1uOiAxLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbWFwQ2hhbmdlID0gKGM6IHR5cGVvZiByZXN1bHQuY2hhbmdlc1swXSk6IElEb2N1bWVudERpZmZMaW5lQ2hhbmdlRHRvID0+ICh7XG5cdFx0XHRvcmlnaW5hbFJhbmdlOiB0b0xpbmVSYW5nZShjLm9yaWdpbmFsKSxcblx0XHRcdG1vZGlmaWVkUmFuZ2U6IHRvTGluZVJhbmdlKGMubW9kaWZpZWQpLFxuXHRcdFx0aW5uZXJDaGFuZ2VzOiBjLmlubmVyQ2hhbmdlcz8ubWFwKGljID0+ICh7XG5cdFx0XHRcdG9yaWdpbmFsUmFuZ2U6IGljLm9yaWdpbmFsUmFuZ2UsXG5cdFx0XHRcdG1vZGlmaWVkUmFuZ2U6IGljLm1vZGlmaWVkUmFuZ2UsXG5cdFx0XHR9KSksXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aWRlbnRpY2FsOiByZXN1bHQuaWRlbnRpY2FsLFxuXHRcdFx0cXVpdEVhcmx5OiByZXN1bHQucXVpdEVhcmx5LFxuXHRcdFx0Y2hhbmdlczogcmVzdWx0LmNoYW5nZXMubWFwKG1hcENoYW5nZSksXG5cdFx0XHRtb3ZlczogcmVzdWx0Lm1vdmVzLm1hcChtID0+ICh7XG5cdFx0XHRcdG9yaWdpbmFsUmFuZ2U6IHRvTGluZVJhbmdlKG0ubGluZVJhbmdlTWFwcGluZy5vcmlnaW5hbCksXG5cdFx0XHRcdG1vZGlmaWVkUmFuZ2U6IHRvTGluZVJhbmdlKG0ubGluZVJhbmdlTWFwcGluZy5tb2RpZmllZCksXG5cdFx0XHRcdGNoYW5nZXM6IG0uY2hhbmdlcy5tYXAobWFwQ2hhbmdlKSxcblx0XHRcdH0pKSxcblx0XHR9O1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHQvLyBub3RoaW5nIHRvIGRpc3Bvc2Vcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLFdBQTBCO0FBQ25DLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQTZELG1CQUFnRDtBQUM3RyxTQUFTLDRCQUE2QztBQUcvQyxJQUFNLHlCQUFOLE1BQW9FO0FBQUEsRUFFMUUsWUFDQyxpQkFDdUMsc0JBQ3RDO0FBRHNDO0FBQUEsRUFFeEM7QUFBQSxFQUVBLE1BQU0scUJBQXFCLGFBQTRCLGFBQTRCLHNCQUErQixzQkFBOEIsY0FBK0Q7QUFDOU0sVUFBTSxXQUFXLElBQUksT0FBTyxXQUFXO0FBQ3ZDLFVBQU0sV0FBVyxJQUFJLE9BQU8sV0FBVztBQUN2QyxVQUFNLFNBQVMsTUFBTSxLQUFLLHFCQUFxQixZQUFZLFVBQVUsVUFBVTtBQUFBLE1BQzlFO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEdBQUcsVUFBVTtBQUNiLFFBQUksQ0FBQyxRQUFRO0FBQ1osYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLGNBQWMsQ0FBQyxPQUE0RTtBQUFBLE1BQ2hHLGlCQUFpQixFQUFFO0FBQUEsTUFDbkIsYUFBYTtBQUFBLE1BQ2IsZUFBZSxFQUFFO0FBQUEsTUFDakIsV0FBVztBQUFBLElBQ1o7QUFFQSxVQUFNLFlBQVksQ0FBQyxPQUE2RDtBQUFBLE1BQy9FLGVBQWUsWUFBWSxFQUFFLFFBQVE7QUFBQSxNQUNyQyxlQUFlLFlBQVksRUFBRSxRQUFRO0FBQUEsTUFDckMsY0FBYyxFQUFFLGNBQWMsSUFBSSxTQUFPO0FBQUEsUUFDeEMsZUFBZSxHQUFHO0FBQUEsUUFDbEIsZUFBZSxHQUFHO0FBQUEsTUFDbkIsRUFBRTtBQUFBLElBQ0g7QUFFQSxXQUFPO0FBQUEsTUFDTixXQUFXLE9BQU87QUFBQSxNQUNsQixXQUFXLE9BQU87QUFBQSxNQUNsQixTQUFTLE9BQU8sUUFBUSxJQUFJLFNBQVM7QUFBQSxNQUNyQyxPQUFPLE9BQU8sTUFBTSxJQUFJLFFBQU07QUFBQSxRQUM3QixlQUFlLFlBQVksRUFBRSxpQkFBaUIsUUFBUTtBQUFBLFFBQ3RELGVBQWUsWUFBWSxFQUFFLGlCQUFpQixRQUFRO0FBQUEsUUFDdEQsU0FBUyxFQUFFLFFBQVEsSUFBSSxTQUFTO0FBQUEsTUFDakMsRUFBRTtBQUFBLElBQ0g7QUFBQSxFQUNEO0FBQUEsRUFFQSxVQUFnQjtBQUFBLEVBRWhCO0FBQ0Q7QUFsRGEseUJBQU47QUFBQSxFQUROLHFCQUFxQixZQUFZLHNCQUFzQjtBQUFBLEVBS3JEO0FBQUEsR0FKVTsiLAogICJuYW1lcyI6IFtdCn0K
