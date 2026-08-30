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
import { es5ClassCompat } from "./es5ClassCompat.js";
import { Location } from "./location.js";
import { Range } from "./range.js";
var SymbolKind = /* @__PURE__ */ ((SymbolKind2) => {
  SymbolKind2[SymbolKind2["File"] = 0] = "File";
  SymbolKind2[SymbolKind2["Module"] = 1] = "Module";
  SymbolKind2[SymbolKind2["Namespace"] = 2] = "Namespace";
  SymbolKind2[SymbolKind2["Package"] = 3] = "Package";
  SymbolKind2[SymbolKind2["Class"] = 4] = "Class";
  SymbolKind2[SymbolKind2["Method"] = 5] = "Method";
  SymbolKind2[SymbolKind2["Property"] = 6] = "Property";
  SymbolKind2[SymbolKind2["Field"] = 7] = "Field";
  SymbolKind2[SymbolKind2["Constructor"] = 8] = "Constructor";
  SymbolKind2[SymbolKind2["Enum"] = 9] = "Enum";
  SymbolKind2[SymbolKind2["Interface"] = 10] = "Interface";
  SymbolKind2[SymbolKind2["Function"] = 11] = "Function";
  SymbolKind2[SymbolKind2["Variable"] = 12] = "Variable";
  SymbolKind2[SymbolKind2["Constant"] = 13] = "Constant";
  SymbolKind2[SymbolKind2["String"] = 14] = "String";
  SymbolKind2[SymbolKind2["Number"] = 15] = "Number";
  SymbolKind2[SymbolKind2["Boolean"] = 16] = "Boolean";
  SymbolKind2[SymbolKind2["Array"] = 17] = "Array";
  SymbolKind2[SymbolKind2["Object"] = 18] = "Object";
  SymbolKind2[SymbolKind2["Key"] = 19] = "Key";
  SymbolKind2[SymbolKind2["Null"] = 20] = "Null";
  SymbolKind2[SymbolKind2["EnumMember"] = 21] = "EnumMember";
  SymbolKind2[SymbolKind2["Struct"] = 22] = "Struct";
  SymbolKind2[SymbolKind2["Event"] = 23] = "Event";
  SymbolKind2[SymbolKind2["Operator"] = 24] = "Operator";
  SymbolKind2[SymbolKind2["TypeParameter"] = 25] = "TypeParameter";
  return SymbolKind2;
})(SymbolKind || {});
var SymbolTag = /* @__PURE__ */ ((SymbolTag2) => {
  SymbolTag2[SymbolTag2["Deprecated"] = 1] = "Deprecated";
  return SymbolTag2;
})(SymbolTag || {});
let SymbolInformation = class {
  static validate(candidate) {
    if (!candidate.name) {
      throw new Error("name must not be falsy");
    }
  }
  constructor(name, kind, rangeOrContainer, locationOrUri, containerName) {
    this.name = name;
    this.kind = kind;
    this.containerName = containerName;
    if (typeof rangeOrContainer === "string") {
      this.containerName = rangeOrContainer;
    }
    if (locationOrUri instanceof Location) {
      this.location = locationOrUri;
    } else if (rangeOrContainer instanceof Range) {
      this.location = new Location(locationOrUri, rangeOrContainer);
    }
    SymbolInformation.validate(this);
  }
  toJSON() {
    return {
      name: this.name,
      kind: SymbolKind[this.kind],
      location: this.location,
      containerName: this.containerName
    };
  }
};
SymbolInformation = __decorateClass([
  es5ClassCompat
], SymbolInformation);
export {
  SymbolInformation,
  SymbolKind,
  SymbolTag
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0VHlwZXNcXHN5bWJvbEluZm9ybWF0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVzNUNsYXNzQ29tcGF0IH0gZnJvbSAnLi9lczVDbGFzc0NvbXBhdC5qcyc7XG5pbXBvcnQgeyBMb2NhdGlvbiB9IGZyb20gJy4vbG9jYXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuL3JhbmdlLmpzJztcblxuZXhwb3J0IGVudW0gU3ltYm9sS2luZCB7XG5cdEZpbGUgPSAwLFxuXHRNb2R1bGUgPSAxLFxuXHROYW1lc3BhY2UgPSAyLFxuXHRQYWNrYWdlID0gMyxcblx0Q2xhc3MgPSA0LFxuXHRNZXRob2QgPSA1LFxuXHRQcm9wZXJ0eSA9IDYsXG5cdEZpZWxkID0gNyxcblx0Q29uc3RydWN0b3IgPSA4LFxuXHRFbnVtID0gOSxcblx0SW50ZXJmYWNlID0gMTAsXG5cdEZ1bmN0aW9uID0gMTEsXG5cdFZhcmlhYmxlID0gMTIsXG5cdENvbnN0YW50ID0gMTMsXG5cdFN0cmluZyA9IDE0LFxuXHROdW1iZXIgPSAxNSxcblx0Qm9vbGVhbiA9IDE2LFxuXHRBcnJheSA9IDE3LFxuXHRPYmplY3QgPSAxOCxcblx0S2V5ID0gMTksXG5cdE51bGwgPSAyMCxcblx0RW51bU1lbWJlciA9IDIxLFxuXHRTdHJ1Y3QgPSAyMixcblx0RXZlbnQgPSAyMyxcblx0T3BlcmF0b3IgPSAyNCxcblx0VHlwZVBhcmFtZXRlciA9IDI1XG59XG5cbmV4cG9ydCBlbnVtIFN5bWJvbFRhZyB7XG5cdERlcHJlY2F0ZWQgPSAxXG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIFN5bWJvbEluZm9ybWF0aW9uIHtcblxuXHRzdGF0aWMgdmFsaWRhdGUoY2FuZGlkYXRlOiBTeW1ib2xJbmZvcm1hdGlvbik6IHZvaWQge1xuXHRcdGlmICghY2FuZGlkYXRlLm5hbWUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignbmFtZSBtdXN0IG5vdCBiZSBmYWxzeScpO1xuXHRcdH1cblx0fVxuXG5cdG5hbWU6IHN0cmluZztcblx0bG9jYXRpb24hOiBMb2NhdGlvbjtcblx0a2luZDogU3ltYm9sS2luZDtcblx0dGFncz86IFN5bWJvbFRhZ1tdO1xuXHRjb250YWluZXJOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IobmFtZTogc3RyaW5nLCBraW5kOiBTeW1ib2xLaW5kLCBjb250YWluZXJOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsIGxvY2F0aW9uOiBMb2NhdGlvbik7XG5cdGNvbnN0cnVjdG9yKG5hbWU6IHN0cmluZywga2luZDogU3ltYm9sS2luZCwgcmFuZ2U6IFJhbmdlLCB1cmk/OiBVUkksIGNvbnRhaW5lck5hbWU/OiBzdHJpbmcpO1xuXHRjb25zdHJ1Y3RvcihuYW1lOiBzdHJpbmcsIGtpbmQ6IFN5bWJvbEtpbmQsIHJhbmdlT3JDb250YWluZXI6IHN0cmluZyB8IHVuZGVmaW5lZCB8IFJhbmdlLCBsb2NhdGlvbk9yVXJpPzogTG9jYXRpb24gfCBVUkksIGNvbnRhaW5lck5hbWU/OiBzdHJpbmcpIHtcblx0XHR0aGlzLm5hbWUgPSBuYW1lO1xuXHRcdHRoaXMua2luZCA9IGtpbmQ7XG5cdFx0dGhpcy5jb250YWluZXJOYW1lID0gY29udGFpbmVyTmFtZTtcblxuXHRcdGlmICh0eXBlb2YgcmFuZ2VPckNvbnRhaW5lciA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRoaXMuY29udGFpbmVyTmFtZSA9IHJhbmdlT3JDb250YWluZXI7XG5cdFx0fVxuXG5cdFx0aWYgKGxvY2F0aW9uT3JVcmkgaW5zdGFuY2VvZiBMb2NhdGlvbikge1xuXHRcdFx0dGhpcy5sb2NhdGlvbiA9IGxvY2F0aW9uT3JVcmk7XG5cdFx0fSBlbHNlIGlmIChyYW5nZU9yQ29udGFpbmVyIGluc3RhbmNlb2YgUmFuZ2UpIHtcblx0XHRcdHRoaXMubG9jYXRpb24gPSBuZXcgTG9jYXRpb24obG9jYXRpb25PclVyaSEsIHJhbmdlT3JDb250YWluZXIpO1xuXHRcdH1cblxuXHRcdFN5bWJvbEluZm9ybWF0aW9uLnZhbGlkYXRlKHRoaXMpO1xuXHR9XG5cblx0dG9KU09OKCk6IHsgbmFtZTogc3RyaW5nOyBraW5kOiBzdHJpbmc7IGxvY2F0aW9uOiBMb2NhdGlvbjsgY29udGFpbmVyTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkIH0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRuYW1lOiB0aGlzLm5hbWUsXG5cdFx0XHRraW5kOiBTeW1ib2xLaW5kW3RoaXMua2luZF0sXG5cdFx0XHRsb2NhdGlvbjogdGhpcy5sb2NhdGlvbixcblx0XHRcdGNvbnRhaW5lck5hbWU6IHRoaXMuY29udGFpbmVyTmFtZVxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7QUFNQSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFFZixJQUFLLGFBQUwsa0JBQUtBLGdCQUFMO0FBQ04sRUFBQUEsd0JBQUEsVUFBTyxLQUFQO0FBQ0EsRUFBQUEsd0JBQUEsWUFBUyxLQUFUO0FBQ0EsRUFBQUEsd0JBQUEsZUFBWSxLQUFaO0FBQ0EsRUFBQUEsd0JBQUEsYUFBVSxLQUFWO0FBQ0EsRUFBQUEsd0JBQUEsV0FBUSxLQUFSO0FBQ0EsRUFBQUEsd0JBQUEsWUFBUyxLQUFUO0FBQ0EsRUFBQUEsd0JBQUEsY0FBVyxLQUFYO0FBQ0EsRUFBQUEsd0JBQUEsV0FBUSxLQUFSO0FBQ0EsRUFBQUEsd0JBQUEsaUJBQWMsS0FBZDtBQUNBLEVBQUFBLHdCQUFBLFVBQU8sS0FBUDtBQUNBLEVBQUFBLHdCQUFBLGVBQVksTUFBWjtBQUNBLEVBQUFBLHdCQUFBLGNBQVcsTUFBWDtBQUNBLEVBQUFBLHdCQUFBLGNBQVcsTUFBWDtBQUNBLEVBQUFBLHdCQUFBLGNBQVcsTUFBWDtBQUNBLEVBQUFBLHdCQUFBLFlBQVMsTUFBVDtBQUNBLEVBQUFBLHdCQUFBLFlBQVMsTUFBVDtBQUNBLEVBQUFBLHdCQUFBLGFBQVUsTUFBVjtBQUNBLEVBQUFBLHdCQUFBLFdBQVEsTUFBUjtBQUNBLEVBQUFBLHdCQUFBLFlBQVMsTUFBVDtBQUNBLEVBQUFBLHdCQUFBLFNBQU0sTUFBTjtBQUNBLEVBQUFBLHdCQUFBLFVBQU8sTUFBUDtBQUNBLEVBQUFBLHdCQUFBLGdCQUFhLE1BQWI7QUFDQSxFQUFBQSx3QkFBQSxZQUFTLE1BQVQ7QUFDQSxFQUFBQSx3QkFBQSxXQUFRLE1BQVI7QUFDQSxFQUFBQSx3QkFBQSxjQUFXLE1BQVg7QUFDQSxFQUFBQSx3QkFBQSxtQkFBZ0IsTUFBaEI7QUExQlcsU0FBQUE7QUFBQSxHQUFBO0FBNkJMLElBQUssWUFBTCxrQkFBS0MsZUFBTDtBQUNOLEVBQUFBLHNCQUFBLGdCQUFhLEtBQWI7QUFEVyxTQUFBQTtBQUFBLEdBQUE7QUFLTCxJQUFNLG9CQUFOLE1BQXdCO0FBQUEsRUFFOUIsT0FBTyxTQUFTLFdBQW9DO0FBQ25ELFFBQUksQ0FBQyxVQUFVLE1BQU07QUFDcEIsWUFBTSxJQUFJLE1BQU0sd0JBQXdCO0FBQUEsSUFDekM7QUFBQSxFQUNEO0FBQUEsRUFVQSxZQUFZLE1BQWMsTUFBa0Isa0JBQThDLGVBQWdDLGVBQXdCO0FBQ2pKLFNBQUssT0FBTztBQUNaLFNBQUssT0FBTztBQUNaLFNBQUssZ0JBQWdCO0FBRXJCLFFBQUksT0FBTyxxQkFBcUIsVUFBVTtBQUN6QyxXQUFLLGdCQUFnQjtBQUFBLElBQ3RCO0FBRUEsUUFBSSx5QkFBeUIsVUFBVTtBQUN0QyxXQUFLLFdBQVc7QUFBQSxJQUNqQixXQUFXLDRCQUE0QixPQUFPO0FBQzdDLFdBQUssV0FBVyxJQUFJLFNBQVMsZUFBZ0IsZ0JBQWdCO0FBQUEsSUFDOUQ7QUFFQSxzQkFBa0IsU0FBUyxJQUFJO0FBQUEsRUFDaEM7QUFBQSxFQUVBLFNBQWdHO0FBQy9GLFdBQU87QUFBQSxNQUNOLE1BQU0sS0FBSztBQUFBLE1BQ1gsTUFBTSxXQUFXLEtBQUssSUFBSTtBQUFBLE1BQzFCLFVBQVUsS0FBSztBQUFBLE1BQ2YsZUFBZSxLQUFLO0FBQUEsSUFDckI7QUFBQSxFQUNEO0FBQ0Q7QUExQ2Esb0JBQU47QUFBQSxFQUROO0FBQUEsR0FDWTsiLAogICJuYW1lcyI6IFsiU3ltYm9sS2luZCIsICJTeW1ib2xUYWciXQp9Cg==
