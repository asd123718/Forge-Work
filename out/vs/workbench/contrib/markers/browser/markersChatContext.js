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
import { groupBy } from "../../../../base/common/arrays.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { extUri } from "../../../../base/common/resources.js";
import { localize } from "../../../../nls.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IMarkerService, MarkerSeverity } from "../../../../platform/markers/common/markers.js";
import { EditorResourceAccessor } from "../../../common/editor.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IChatContextPickService, picksWithPromiseFn } from "../../chat/browser/attachments/chatContextPickService.js";
import { IDiagnosticVariableEntryFilterData } from "../../chat/common/attachments/chatVariableEntries.js";
let MarkerChatContextPick = class {
  constructor(_markerService, _labelService, _editorService) {
    this._markerService = _markerService;
    this._labelService = _labelService;
    this._editorService = _editorService;
    this.type = "pickerPick";
    this.label = localize("chatContext.diagnstic", "Problems...");
    this.icon = Codicon.error;
    this.ordinal = -100;
  }
  isEnabled(widget) {
    return !!widget.attachmentCapabilities.supportsProblemAttachments;
  }
  asPicker() {
    return {
      placeholder: localize("chatContext.diagnstic.placeholder", "Select a problem to attach"),
      picks: picksWithPromiseFn(async (query, token) => {
        return this.getPicksForQuery(query);
      })
    };
  }
  /**
   * @internal For testing purposes only
   */
  getPicksForQuery(query) {
    const markers = this._markerService.read({ severities: MarkerSeverity.Error | MarkerSeverity.Warning | MarkerSeverity.Info });
    const grouped = groupBy(markers, (a, b) => extUri.compare(a.resource, b.resource));
    const activeEditorUri = EditorResourceAccessor.getCanonicalUri(this._editorService.activeEditor);
    const sortedGroups = grouped.sort((groupA, groupB) => {
      const resourceA = groupA[0].resource;
      const resourceB = groupB[0].resource;
      if (activeEditorUri) {
        const isAActiveFile = extUri.isEqual(resourceA, activeEditorUri);
        const isBActiveFile = extUri.isEqual(resourceB, activeEditorUri);
        if (isAActiveFile && !isBActiveFile) {
          return -1;
        }
        if (!isAActiveFile && isBActiveFile) {
          return 1;
        }
      }
      return extUri.compare(resourceA, resourceB);
    });
    const severities = /* @__PURE__ */ new Set();
    const items = [];
    let pickCount = 0;
    for (const group of sortedGroups) {
      const resource = group[0].resource;
      const isActiveFile = activeEditorUri && extUri.isEqual(resource, activeEditorUri);
      const fileLabel = this._labelService.getUriLabel(resource, { relative: true });
      const separatorLabel = isActiveFile ? `${fileLabel} (current file)` : fileLabel;
      items.push({ type: "separator", label: separatorLabel });
      for (const marker of group) {
        pickCount++;
        severities.add(marker.severity);
        items.push({
          label: marker.message,
          description: localize("markers.panel.at.ln.col.number", "[Ln {0}, Col {1}]", "" + marker.startLineNumber, "" + marker.startColumn),
          asAttachment() {
            return IDiagnosticVariableEntryFilterData.toEntry(IDiagnosticVariableEntryFilterData.fromMarker(marker));
          }
        });
      }
    }
    items.unshift({
      label: localize("markers.panel.allErrors", "All Problems"),
      asAttachment() {
        return IDiagnosticVariableEntryFilterData.toEntry({
          filterSeverity: MarkerSeverity.Info
        });
      }
    });
    return items;
  }
};
MarkerChatContextPick = __decorateClass([
  __decorateParam(0, IMarkerService),
  __decorateParam(1, ILabelService),
  __decorateParam(2, IEditorService)
], MarkerChatContextPick);
let MarkerChatContextContribution = class extends Disposable {
  constructor(contextPickService, instantiationService) {
    super();
    this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(MarkerChatContextPick)));
  }
};
MarkerChatContextContribution.ID = "workbench.contrib.chat.markerChatContextContribution";
MarkerChatContextContribution = __decorateClass([
  __decorateParam(0, IChatContextPickService),
  __decorateParam(1, IInstantiationService)
], MarkerChatContextContribution);
export {
  MarkerChatContextContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1hcmtlcnNcXGJyb3dzZXJcXG1hcmtlcnNDaGF0Q29udGV4dC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cblxuaW1wb3J0IHsgZ3JvdXBCeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBleHRVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElNYXJrZXJTZXJ2aWNlLCBNYXJrZXJTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgSVF1aWNrUGlja1NlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0Q29udGV4dFBpY2tlckl0ZW0sIElDaGF0Q29udGV4dFBpY2tlclBpY2tJdGVtLCBJQ2hhdENvbnRleHRQaWNrU2VydmljZSwgSUNoYXRDb250ZXh0UGlja2VyLCBwaWNrc1dpdGhQcm9taXNlRm4gfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvYXR0YWNobWVudHMvY2hhdENvbnRleHRQaWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGlhZ25vc3RpY1ZhcmlhYmxlRW50cnlGaWx0ZXJEYXRhIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldCB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcblxuY2xhc3MgTWFya2VyQ2hhdENvbnRleHRQaWNrIGltcGxlbWVudHMgSUNoYXRDb250ZXh0UGlja2VySXRlbSB7XG5cblx0cmVhZG9ubHkgdHlwZSA9ICdwaWNrZXJQaWNrJztcblx0cmVhZG9ubHkgbGFiZWwgPSBsb2NhbGl6ZSgnY2hhdENvbnRleHQuZGlhZ25zdGljJywgJ1Byb2JsZW1zLi4uJyk7XG5cdHJlYWRvbmx5IGljb24gPSBDb2RpY29uLmVycm9yO1xuXHRyZWFkb25seSBvcmRpbmFsID0gLTEwMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1hcmtlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWFya2VyU2VydmljZTogSU1hcmtlclNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0KSB7IH1cblxuXHRpc0VuYWJsZWQod2lkZ2V0OiBJQ2hhdFdpZGdldCk6IFByb21pc2U8Ym9vbGVhbj4gfCBib29sZWFuIHtcblx0XHRyZXR1cm4gISF3aWRnZXQuYXR0YWNobWVudENhcGFiaWxpdGllcy5zdXBwb3J0c1Byb2JsZW1BdHRhY2htZW50cztcblx0fVxuXHRhc1BpY2tlcigpOiBJQ2hhdENvbnRleHRQaWNrZXIge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwbGFjZWhvbGRlcjogbG9jYWxpemUoJ2NoYXRDb250ZXh0LmRpYWduc3RpYy5wbGFjZWhvbGRlcicsICdTZWxlY3QgYSBwcm9ibGVtIHRvIGF0dGFjaCcpLFxuXHRcdFx0cGlja3M6IHBpY2tzV2l0aFByb21pc2VGbihhc3luYyAocXVlcnk6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmdldFBpY2tzRm9yUXVlcnkocXVlcnkpO1xuXHRcdFx0fSlcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbnRlcm5hbCBGb3IgdGVzdGluZyBwdXJwb3NlcyBvbmx5XG5cdCAqL1xuXHRnZXRQaWNrc0ZvclF1ZXJ5KHF1ZXJ5OiBzdHJpbmcpOiAoSUNoYXRDb250ZXh0UGlja2VyUGlja0l0ZW0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yKVtdIHtcblx0XHRjb25zdCBtYXJrZXJzID0gdGhpcy5fbWFya2VyU2VydmljZS5yZWFkKHsgc2V2ZXJpdGllczogTWFya2VyU2V2ZXJpdHkuRXJyb3IgfCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nIHwgTWFya2VyU2V2ZXJpdHkuSW5mbyB9KTtcblx0XHRjb25zdCBncm91cGVkID0gZ3JvdXBCeShtYXJrZXJzLCAoYSwgYikgPT4gZXh0VXJpLmNvbXBhcmUoYS5yZXNvdXJjZSwgYi5yZXNvdXJjZSkpO1xuXG5cdFx0Ly8gR2V0IHRoZSBhY3RpdmUgZWRpdG9yIFVSSSBmb3IgcHJpb3JpdGl6YXRpb25cblx0XHRjb25zdCBhY3RpdmVFZGl0b3JVcmkgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldENhbm9uaWNhbFVyaSh0aGlzLl9lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcik7XG5cblx0XHQvLyBTb3J0IGdyb3VwcyB0byBwcmlvcml0aXplIGFjdGl2ZSBmaWxlXG5cdFx0Y29uc3Qgc29ydGVkR3JvdXBzID0gZ3JvdXBlZC5zb3J0KChncm91cEEsIGdyb3VwQikgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VBID0gZ3JvdXBBWzBdLnJlc291cmNlO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VCID0gZ3JvdXBCWzBdLnJlc291cmNlO1xuXG5cdFx0XHQvLyBJZiBvbmUgZ3JvdXAgaXMgZnJvbSB0aGUgYWN0aXZlIGZpbGUsIHByaW9yaXRpemUgaXRcblx0XHRcdGlmIChhY3RpdmVFZGl0b3JVcmkpIHtcblx0XHRcdFx0Y29uc3QgaXNBQWN0aXZlRmlsZSA9IGV4dFVyaS5pc0VxdWFsKHJlc291cmNlQSwgYWN0aXZlRWRpdG9yVXJpKTtcblx0XHRcdFx0Y29uc3QgaXNCQWN0aXZlRmlsZSA9IGV4dFVyaS5pc0VxdWFsKHJlc291cmNlQiwgYWN0aXZlRWRpdG9yVXJpKTtcblxuXHRcdFx0XHRpZiAoaXNBQWN0aXZlRmlsZSAmJiAhaXNCQWN0aXZlRmlsZSkge1xuXHRcdFx0XHRcdHJldHVybiAtMTsgLy8gQSBjb21lcyBmaXJzdFxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghaXNBQWN0aXZlRmlsZSAmJiBpc0JBY3RpdmVGaWxlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIDE7IC8vIEIgY29tZXMgZmlyc3Rcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBPdGhlcndpc2UsIHNvcnQgYnkgcmVzb3VyY2UgVVJJIGFzIGJlZm9yZVxuXHRcdFx0cmV0dXJuIGV4dFVyaS5jb21wYXJlKHJlc291cmNlQSwgcmVzb3VyY2VCKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNldmVyaXRpZXMgPSBuZXcgU2V0PE1hcmtlclNldmVyaXR5PigpO1xuXHRcdGNvbnN0IGl0ZW1zOiAoSUNoYXRDb250ZXh0UGlja2VyUGlja0l0ZW0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yKVtdID0gW107XG5cblx0XHRsZXQgcGlja0NvdW50ID0gMDtcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHNvcnRlZEdyb3Vwcykge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBncm91cFswXS5yZXNvdXJjZTtcblx0XHRcdGNvbnN0IGlzQWN0aXZlRmlsZSA9IGFjdGl2ZUVkaXRvclVyaSAmJiBleHRVcmkuaXNFcXVhbChyZXNvdXJjZSwgYWN0aXZlRWRpdG9yVXJpKTtcblx0XHRcdGNvbnN0IGZpbGVMYWJlbCA9IHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbChyZXNvdXJjZSwgeyByZWxhdGl2ZTogdHJ1ZSB9KTtcblx0XHRcdGNvbnN0IHNlcGFyYXRvckxhYmVsID0gaXNBY3RpdmVGaWxlID8gYCR7ZmlsZUxhYmVsfSAoY3VycmVudCBmaWxlKWAgOiBmaWxlTGFiZWw7XG5cblx0XHRcdGl0ZW1zLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IHNlcGFyYXRvckxhYmVsIH0pO1xuXHRcdFx0Zm9yIChjb25zdCBtYXJrZXIgb2YgZ3JvdXApIHtcblx0XHRcdFx0cGlja0NvdW50Kys7XG5cdFx0XHRcdHNldmVyaXRpZXMuYWRkKG1hcmtlci5zZXZlcml0eSk7XG5cblx0XHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWw6IG1hcmtlci5tZXNzYWdlLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWFya2Vycy5wYW5lbC5hdC5sbi5jb2wubnVtYmVyJywgXCJbTG4gezB9LCBDb2wgezF9XVwiLCAnJyArIG1hcmtlci5zdGFydExpbmVOdW1iZXIsICcnICsgbWFya2VyLnN0YXJ0Q29sdW1uKSxcblx0XHRcdFx0XHRhc0F0dGFjaG1lbnQoKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gSURpYWdub3N0aWNWYXJpYWJsZUVudHJ5RmlsdGVyRGF0YS50b0VudHJ5KElEaWFnbm9zdGljVmFyaWFibGVFbnRyeUZpbHRlckRhdGEuZnJvbU1hcmtlcihtYXJrZXIpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGl0ZW1zLnVuc2hpZnQoe1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtYXJrZXJzLnBhbmVsLmFsbEVycm9ycycsICdBbGwgUHJvYmxlbXMnKSxcblx0XHRcdGFzQXR0YWNobWVudCgpIHtcblx0XHRcdFx0cmV0dXJuIElEaWFnbm9zdGljVmFyaWFibGVFbnRyeUZpbHRlckRhdGEudG9FbnRyeSh7XG5cdFx0XHRcdFx0ZmlsdGVyU2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkluZm9cblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGl0ZW1zO1xuXHR9XG59XG5cblxuZXhwb3J0IGNsYXNzIE1hcmtlckNoYXRDb250ZXh0Q29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5jaGF0Lm1hcmtlckNoYXRDb250ZXh0Q29udHJpYnV0aW9uJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRDb250ZXh0UGlja1NlcnZpY2UgY29udGV4dFBpY2tTZXJ2aWNlOiBJQ2hhdENvbnRleHRQaWNrU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKGNvbnRleHRQaWNrU2VydmljZS5yZWdpc3RlckNoYXRDb250ZXh0SXRlbShpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYXJrZXJDaGF0Q29udGV4dFBpY2spKSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxlQUFlO0FBRXhCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGNBQWM7QUFDdkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQkFBZ0Isc0JBQXNCO0FBRS9DLFNBQVMsOEJBQThCO0FBRXZDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQTZELHlCQUE2QywwQkFBMEI7QUFDcEksU0FBUywwQ0FBMEM7QUFHbkQsSUFBTSx3QkFBTixNQUE4RDtBQUFBLEVBTzdELFlBQ2tDLGdCQUNELGVBQ0MsZ0JBQ2hDO0FBSGdDO0FBQ0Q7QUFDQztBQVJsQyxTQUFTLE9BQU87QUFDaEIsU0FBUyxRQUFRLFNBQVMseUJBQXlCLGFB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
