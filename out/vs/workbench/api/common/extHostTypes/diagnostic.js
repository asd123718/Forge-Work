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
import { equals } from "../../../../base/common/arrays.js";
import { URI } from "../../../../base/common/uri.js";
import { es5ClassCompat } from "./es5ClassCompat.js";
import { Range } from "./range.js";
var DiagnosticTag = /* @__PURE__ */ ((DiagnosticTag2) => {
  DiagnosticTag2[DiagnosticTag2["Unnecessary"] = 1] = "Unnecessary";
  DiagnosticTag2[DiagnosticTag2["Deprecated"] = 2] = "Deprecated";
  return DiagnosticTag2;
})(DiagnosticTag || {});
var DiagnosticSeverity = /* @__PURE__ */ ((DiagnosticSeverity2) => {
  DiagnosticSeverity2[DiagnosticSeverity2["Hint"] = 3] = "Hint";
  DiagnosticSeverity2[DiagnosticSeverity2["Information"] = 2] = "Information";
  DiagnosticSeverity2[DiagnosticSeverity2["Warning"] = 1] = "Warning";
  DiagnosticSeverity2[DiagnosticSeverity2["Error"] = 0] = "Error";
  return DiagnosticSeverity2;
})(DiagnosticSeverity || {});
let DiagnosticRelatedInformation = class {
  static is(thing) {
    if (!thing) {
      return false;
    }
    return typeof thing.message === "string" && thing.location && Range.isRange(thing.location.range) && URI.isUri(thing.location.uri);
  }
  constructor(location, message) {
    this.location = location;
    this.message = message;
  }
  static isEqual(a, b) {
    if (a === b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    return a.message === b.message && a.location.range.isEqual(b.location.range) && a.location.uri.toString() === b.location.uri.toString();
  }
};
DiagnosticRelatedInformation = __decorateClass([
  es5ClassCompat
], DiagnosticRelatedInformation);
let Diagnostic = class {
  constructor(range, message, severity = 0 /* Error */) {
    if (!Range.isRange(range)) {
      throw new TypeError("range must be set");
    }
    if (!message) {
      throw new TypeError("message must be set");
    }
    this.range = range;
    this.message = message;
    this.severity = severity;
  }
  toJSON() {
    return {
      severity: DiagnosticSeverity[this.severity],
      message: this.message,
      range: this.range,
      source: this.source,
      code: this.code
    };
  }
  static isEqual(a, b) {
    if (a === b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    return a.message === b.message && a.severity === b.severity && a.code === b.code && a.severity === b.severity && a.source === b.source && a.range.isEqual(b.range) && equals(a.tags, b.tags) && equals(a.relatedInformation, b.relatedInformation, DiagnosticRelatedInformation.isEqual);
  }
};
Diagnostic = __decorateClass([
  es5ClassCompat
], Diagnostic);
export {
  Diagnostic,
  DiagnosticRelatedInformation,
  DiagnosticSeverity,
  DiagnosticTag
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0VHlwZXNcXGRpYWdub3N0aWMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVzNUNsYXNzQ29tcGF0IH0gZnJvbSAnLi9lczVDbGFzc0NvbXBhdC5qcyc7XG5pbXBvcnQgeyBMb2NhdGlvbiB9IGZyb20gJy4vbG9jYXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuL3JhbmdlLmpzJztcblxuZXhwb3J0IGVudW0gRGlhZ25vc3RpY1RhZyB7XG5cdFVubmVjZXNzYXJ5ID0gMSxcblx0RGVwcmVjYXRlZCA9IDJcbn1cblxuZXhwb3J0IGVudW0gRGlhZ25vc3RpY1NldmVyaXR5IHtcblx0SGludCA9IDMsXG5cdEluZm9ybWF0aW9uID0gMixcblx0V2FybmluZyA9IDEsXG5cdEVycm9yID0gMFxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBEaWFnbm9zdGljUmVsYXRlZEluZm9ybWF0aW9uIHtcblxuXHRzdGF0aWMgaXModGhpbmc6IHVua25vd24pOiB0aGluZyBpcyBEaWFnbm9zdGljUmVsYXRlZEluZm9ybWF0aW9uIHtcblx0XHRpZiAoIXRoaW5nKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0eXBlb2YgKDxEaWFnbm9zdGljUmVsYXRlZEluZm9ybWF0aW9uPnRoaW5nKS5tZXNzYWdlID09PSAnc3RyaW5nJ1xuXHRcdFx0JiYgKDxEaWFnbm9zdGljUmVsYXRlZEluZm9ybWF0aW9uPnRoaW5nKS5sb2NhdGlvblxuXHRcdFx0JiYgUmFuZ2UuaXNSYW5nZSgoPERpYWdub3N0aWNSZWxhdGVkSW5mb3JtYXRpb24+dGhpbmcpLmxvY2F0aW9uLnJhbmdlKVxuXHRcdFx0JiYgVVJJLmlzVXJpKCg8RGlhZ25vc3RpY1JlbGF0ZWRJbmZvcm1hdGlvbj50aGluZykubG9jYXRpb24udXJpKTtcblx0fVxuXG5cdGxvY2F0aW9uOiBMb2NhdGlvbjtcblx0bWVzc2FnZTogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKGxvY2F0aW9uOiBMb2NhdGlvbiwgbWVzc2FnZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5sb2NhdGlvbiA9IGxvY2F0aW9uO1xuXHRcdHRoaXMubWVzc2FnZSA9IG1lc3NhZ2U7XG5cdH1cblxuXHRzdGF0aWMgaXNFcXVhbChhOiBEaWFnbm9zdGljUmVsYXRlZEluZm9ybWF0aW9uLCBiOiBEaWFnbm9zdGljUmVsYXRlZEluZm9ybWF0aW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKGEgPT09IGIpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoIWEgfHwgIWIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIGEubWVzc2FnZSA9PT0gYi5tZXNzYWdlXG5cdFx0XHQmJiBhLmxvY2F0aW9uLnJhbmdlLmlzRXF1YWwoYi5sb2NhdGlvbi5yYW5nZSlcblx0XHRcdCYmIGEubG9jYXRpb24udXJpLnRvU3RyaW5nKCkgPT09IGIubG9jYXRpb24udXJpLnRvU3RyaW5nKCk7XG5cdH1cbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgRGlhZ25vc3RpYyB7XG5cblx0cmFuZ2U6IFJhbmdlO1xuXHRtZXNzYWdlOiBzdHJpbmc7XG5cdHNldmVyaXR5OiBEaWFnbm9zdGljU2V2ZXJpdHk7XG5cdHNvdXJjZT86IHN0cmluZztcblx0Y29kZT86IHN0cmluZyB8IG51bWJlcjtcblx0cmVsYXRlZEluZm9ybWF0aW9uPzogRGlhZ25vc3RpY1JlbGF0ZWRJbmZvcm1hdGlvbltdO1xuXHR0YWdzPzogRGlhZ25vc3RpY1RhZ1tdO1xuXG5cdGNvbnN0cnVjdG9yKHJhbmdlOiBSYW5nZSwgbWVzc2FnZTogc3RyaW5nLCBzZXZlcml0eTogRGlhZ25vc3RpY1NldmVyaXR5ID0gRGlhZ25vc3RpY1NldmVyaXR5LkVycm9yKSB7XG5cdFx0aWYgKCFSYW5nZS5pc1JhbmdlKHJhbmdlKSkge1xuXHRcdFx0dGhyb3cgbmV3IFR5cGVFcnJvcigncmFuZ2UgbXVzdCBiZSBzZXQnKTtcblx0XHR9XG5cdFx0aWYgKCFtZXNzYWdlKSB7XG5cdFx0XHR0aHJvdyBuZXcgVHlwZUVycm9yKCdtZXNzYWdlIG11c3QgYmUgc2V0Jyk7XG5cdFx0fVxuXHRcdHRoaXMucmFuZ2UgPSByYW5nZTtcblx0XHR0aGlzLm1lc3NhZ2UgPSBtZXNzYWdlO1xuXHRcdHRoaXMuc2V2ZXJpdHkgPSBzZXZlcml0eTtcblx0fVxuXG5cdHRvSlNPTigpOiB7IHNldmVyaXR5OiBzdHJpbmc7IG1lc3NhZ2U6IHN0cmluZzsgcmFuZ2U6IFJhbmdlOyBzb3VyY2U/OiBzdHJpbmc7IGNvZGU/OiBzdHJpbmcgfCBudW1iZXIgfSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNldmVyaXR5OiBEaWFnbm9zdGljU2V2ZXJpdHlbdGhpcy5zZXZlcml0eV0sXG5cdFx0XHRtZXNzYWdlOiB0aGlzLm1lc3NhZ2UsXG5cdFx0XHRyYW5nZTogdGhpcy5yYW5nZSxcblx0XHRcdHNvdXJjZTogdGhpcy5zb3VyY2UsXG5cdFx0XHRjb2RlOiB0aGlzLmNvZGUsXG5cdFx0fTtcblx0fVxuXG5cdHN0YXRpYyBpc0VxdWFsKGE6IERpYWdub3N0aWMgfCB1bmRlZmluZWQsIGI6IERpYWdub3N0aWMgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAoYSA9PT0gYikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICghYSB8fCAhYikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gYS5tZXNzYWdlID09PSBiLm1lc3NhZ2Vcblx0XHRcdCYmIGEuc2V2ZXJpdHkgPT09IGIuc2V2ZXJpdHlcblx0XHRcdCYmIGEuY29kZSA9PT0gYi5jb2RlXG5cdFx0XHQmJiBhLnNldmVyaXR5ID09PSBiLnNldmVyaXR5XG5cdFx0XHQmJiBhLnNvdXJjZSA9PT0gYi5zb3VyY2Vcblx0XHRcdCYmIGEucmFuZ2UuaXNFcXVhbChiLnJhbmdlKVxuXHRcdFx0JiYgZXF1YWxzKGEudGFncywgYi50YWdzKVxuXHRcdFx0JiYgZXF1YWxzKGEucmVsYXRlZEluZm9ybWF0aW9uLCBiLnJlbGF0ZWRJbmZvcm1hdGlvbiwgRGlhZ25vc3RpY1JlbGF0ZWRJbmZvcm1hdGlvbi5pc0VxdWFsKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7OztBQUtBLFNBQVMsY0FBYztBQUN2QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyxhQUFhO0FBRWYsSUFBSyxnQkFBTCxrQkFBS0EsbUJBQUw7QUFDTixFQUFBQSw4QkFBQSxpQkFBYyxLQUFkO0FBQ0EsRUFBQUEsOEJBQUEsZ0JBQWEsS0FBYjtBQUZXLFNBQUFBO0FBQUEsR0FBQTtBQUtMLElBQUsscUJBQUwsa0JBQUtDLHdCQUFMO0FBQ04sRUFBQUEsd0NBQUEsVUFBTyxLQUFQO0FBQ0EsRUFBQUEsd0NBQUEsaUJBQWMsS0FBZDtBQUNBLEVBQUFBLHdDQUFBLGFBQVUsS0FBVjtBQUNBLEVBQUFBLHdDQUFBLFdBQVEsS0FBUjtBQUpXLFNBQUFBO0FBQUEsR0FBQTtBQVFMLElBQU0sK0JBQU4sTUFBbUM7QUFBQSxFQUV6QyxPQUFPLEdBQUcsT0FBdUQ7QUFDaEUsUUFBSSxDQUFDLE9BQU87QUFDWCxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sT0FBc0MsTUFBTyxZQUFZLFlBQzdCLE1BQU8sWUFDdEMsTUFBTSxRQUF1QyxNQUFPLFNBQVMsS0FBSyxLQUNsRSxJQUFJLE1BQXFDLE1BQU8sU0FBUyxHQUFHO0FBQUEsRUFDakU7QUFBQSxFQUtBLFlBQVksVUFBb0IsU0FBaUI7QUFDaEQsU0FBSyxXQUFXO0FBQ2hCLFNBQUssVUFBVTtBQUFBLEVBQ2hCO0FBQUEsRUFFQSxPQUFPLFFBQVEsR0FBaUMsR0FBMEM7QUFDekYsUUFBSSxNQUFNLEdBQUc7QUFDWixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksQ0FBQyxLQUFLLENBQUMsR0FBRztBQUNiLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxFQUFFLFlBQVksRUFBRSxXQUNuQixFQUFFLFNBQVMsTUFBTSxRQUFRLEVBQUUsU0FBUyxLQUFLLEtBQ3pDLEVBQUUsU0FBUyxJQUFJLFNBQVMsTUFBTSxFQUFFLFNBQVMsSUFBSSxTQUFTO0FBQUEsRUFDM0Q7QUFDRDtBQS9CYSwrQkFBTjtBQUFBLEVBRE47QUFBQSxHQUNZO0FBa0NOLElBQU0sYUFBTixNQUFpQjtBQUFBLEVBVXZCLFlBQVksT0FBYyxTQUFpQixXQUErQixlQUEwQjtBQUNuRyxRQUFJLENBQUMsTUFBTSxRQUFRLEtBQUssR0FBRztBQUMxQixZQUFNLElBQUksVUFBVSxtQkFBbUI7QUFBQSxJQUN4QztBQUNBLFFBQUksQ0FBQyxTQUFTO0FBQ2IsWUFBTSxJQUFJLFVBQVUscUJBQXFCO0FBQUEsSUFDMUM7QUFDQSxTQUFLLFFBQVE7QUFDYixTQUFLLFVBQVU7QUFDZixTQUFLLFdBQVc7QUFBQSxFQUNqQjtBQUFBLEVBRUEsU0FBdUc7QUFDdEcsV0FBTztBQUFBLE1BQ04sVUFBVSxtQkFBbUIsS0FBSyxRQUFRO0FBQUEsTUFDMUMsU0FBUyxLQUFLO0FBQUEsTUFDZCxPQUFPLEtBQUs7QUFBQSxNQUNaLFFBQVEsS0FBSztBQUFBLE1BQ2IsTUFBTSxLQUFLO0FBQUEsSUFDWjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE9BQU8sUUFBUSxHQUEyQixHQUFvQztBQUM3RSxRQUFJLE1BQU0sR0FBRztBQUNaLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHO0FBQ2IsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLEVBQUUsWUFBWSxFQUFFLFdBQ25CLEVBQUUsYUFBYSxFQUFFLFlBQ2pCLEVBQUUsU0FBUyxFQUFFLFFBQ2IsRUFBRSxhQUFhLEVBQUUsWUFDakIsRUFBRSxXQUFXLEVBQUUsVUFDZixFQUFFLE1BQU0sUUFBUSxFQUFFLEtBQUssS0FDdkIsT0FBTyxFQUFFLE1BQU0sRUFBRSxJQUFJLEtBQ3JCLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxvQkFBb0IsNkJBQTZCLE9BQU87QUFBQSxFQUM1RjtBQUNEO0FBaERhLGFBQU47QUFBQSxFQUROO0FBQUEsR0FDWTsiLAogICJuYW1lcyI6IFsiRGlhZ25vc3RpY1RhZyIsICJEaWFnbm9zdGljU2V2ZXJpdHkiXQp9Cg==
