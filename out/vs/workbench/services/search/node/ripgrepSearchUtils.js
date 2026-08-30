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
import { ILogService } from "../../../../platform/log/common/log.js";
import { SearchRange } from "../common/search.js";
import * as searchExtTypes from "../common/searchExtTypes.js";
function anchorGlob(glob) {
  return glob.startsWith("**") || glob.startsWith("/") ? glob : `/${glob}`;
}
function rangeToSearchRange(range) {
  return new SearchRange(range.start.line, range.start.character, range.end.line, range.end.character);
}
function searchRangeToRange(range) {
  return new searchExtTypes.Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
}
let OutputChannel = class {
  constructor(prefix, logService) {
    this.prefix = prefix;
    this.logService = logService;
  }
  appendLine(msg) {
    this.logService.debug(`${this.prefix}#search`, msg);
  }
};
OutputChannel = __decorateClass([
  __decorateParam(1, ILogService)
], OutputChannel);
export {
  OutputChannel,
  anchorGlob,
  rangeToSearchRange,
  searchRangeToRange
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxzZWFyY2hcXG5vZGVcXHJpcGdyZXBTZWFyY2hVdGlscy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgU2VhcmNoUmFuZ2UgfSBmcm9tICcuLi9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCAqIGFzIHNlYXJjaEV4dFR5cGVzIGZyb20gJy4uL2NvbW1vbi9zZWFyY2hFeHRUeXBlcy5qcyc7XG5cbmV4cG9ydCB0eXBlIE1heWJlPFQ+ID0gVCB8IG51bGwgfCB1bmRlZmluZWQ7XG5cbmV4cG9ydCBmdW5jdGlvbiBhbmNob3JHbG9iKGdsb2I6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBnbG9iLnN0YXJ0c1dpdGgoJyoqJykgfHwgZ2xvYi5zdGFydHNXaXRoKCcvJykgPyBnbG9iIDogYC8ke2dsb2J9YDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJhbmdlVG9TZWFyY2hSYW5nZShyYW5nZTogc2VhcmNoRXh0VHlwZXMuUmFuZ2UpOiBTZWFyY2hSYW5nZSB7XG5cdHJldHVybiBuZXcgU2VhcmNoUmFuZ2UocmFuZ2Uuc3RhcnQubGluZSwgcmFuZ2Uuc3RhcnQuY2hhcmFjdGVyLCByYW5nZS5lbmQubGluZSwgcmFuZ2UuZW5kLmNoYXJhY3Rlcik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZWFyY2hSYW5nZVRvUmFuZ2UocmFuZ2U6IFNlYXJjaFJhbmdlKTogc2VhcmNoRXh0VHlwZXMuUmFuZ2Uge1xuXHRyZXR1cm4gbmV3IHNlYXJjaEV4dFR5cGVzLlJhbmdlKHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc3RhcnRDb2x1bW4sIHJhbmdlLmVuZExpbmVOdW1iZXIsIHJhbmdlLmVuZENvbHVtbik7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU91dHB1dENoYW5uZWwge1xuXHRhcHBlbmRMaW5lKG1zZzogc3RyaW5nKTogdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIE91dHB1dENoYW5uZWwgaW1wbGVtZW50cyBJT3V0cHV0Q2hhbm5lbCB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcHJlZml4OiBzdHJpbmcsIEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlKSB7IH1cblxuXHRhcHBlbmRMaW5lKG1zZzogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGAke3RoaXMucHJlZml4fSNzZWFyY2hgLCBtc2cpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsbUJBQW1CO0FBQzVCLFlBQVksb0JBQW9CO0FBSXpCLFNBQVMsV0FBVyxNQUFzQjtBQUNoRCxTQUFPLEtBQUssV0FBVyxJQUFJLEtBQUssS0FBSyxXQUFXLEdBQUcsSUFBSSxPQUFPLElBQUksSUFBSTtBQUN2RTtBQUVPLFNBQVMsbUJBQW1CLE9BQTBDO0FBQzVFLFNBQU8sSUFBSSxZQUFZLE1BQU0sTUFBTSxNQUFNLE1BQU0sTUFBTSxXQUFXLE1BQU0sSUFBSSxNQUFNLE1BQU0sSUFBSSxTQUFTO0FBQ3BHO0FBRU8sU0FBUyxtQkFBbUIsT0FBMEM7QUFDNUUsU0FBTyxJQUFJLGVBQWUsTUFBTSxNQUFNLGlCQUFpQixNQUFNLGFBQWEsTUFBTSxlQUFlLE1BQU0sU0FBUztBQUMvRztBQU1PLElBQU0sZ0JBQU4sTUFBOEM7QUFBQSxFQUNwRCxZQUFvQixRQUE4QyxZQUF5QjtBQUF2RTtBQUE4QztBQUFBLEVBQTJCO0FBQUEsRUFFN0YsV0FBVyxLQUFtQjtBQUM3QixTQUFLLFdBQVcsTUFBTSxHQUFHLEtBQUssTUFBTSxXQUFXLEdBQUc7QUFBQSxFQUNuRDtBQUNEO0FBTmEsZ0JBQU47QUFBQSxFQUMrQjtBQUFBLEdBRHpCOyIsCiAgIm5hbWVzIjogW10KfQo=
