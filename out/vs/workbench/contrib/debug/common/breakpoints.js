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
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
let Breakpoints = class {
  constructor(breakpointContribution, contextKeyService) {
    this.breakpointContribution = breakpointContribution;
    this.contextKeyService = contextKeyService;
    this.breakpointsWhen = typeof breakpointContribution.when === "string" ? ContextKeyExpr.deserialize(breakpointContribution.when) : void 0;
  }
  get language() {
    return this.breakpointContribution.language;
  }
  get enabled() {
    return !this.breakpointsWhen || this.contextKeyService.contextMatchesRules(this.breakpointsWhen);
  }
};
Breakpoints = __decorateClass([
  __decorateParam(1, IContextKeyService)
], Breakpoints);
export {
  Breakpoints
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxjb21tb25cXGJyZWFrcG9pbnRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIENvbnRleHRLZXlFeHByZXNzaW9uLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElCcmVha3BvaW50Q29udHJpYnV0aW9uIH0gZnJvbSAnLi9kZWJ1Zy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBCcmVha3BvaW50cyB7XG5cblx0cHJpdmF0ZSBicmVha3BvaW50c1doZW46IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYnJlYWtwb2ludENvbnRyaWJ1dGlvbjogSUJyZWFrcG9pbnRDb250cmlidXRpb24sXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuYnJlYWtwb2ludHNXaGVuID0gdHlwZW9mIGJyZWFrcG9pbnRDb250cmlidXRpb24ud2hlbiA9PT0gJ3N0cmluZycgPyBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShicmVha3BvaW50Q29udHJpYnV0aW9uLndoZW4pIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0IGxhbmd1YWdlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuYnJlYWtwb2ludENvbnRyaWJ1dGlvbi5sYW5ndWFnZTtcblx0fVxuXG5cdGdldCBlbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5icmVha3BvaW50c1doZW4gfHwgdGhpcy5jb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKHRoaXMuYnJlYWtwb2ludHNXaGVuKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFzQywwQkFBMEI7QUFHbEUsSUFBTSxjQUFOLE1BQWtCO0FBQUEsRUFJeEIsWUFDa0Isd0JBQ29CLG1CQUNwQztBQUZnQjtBQUNvQjtBQUVyQyxTQUFLLGtCQUFrQixPQUFPLHVCQUF1QixTQUFTLFdBQVcsZUFBZSxZQUFZLHVCQUF1QixJQUFJLElBQUk7QUFBQSxFQUNwSTtBQUFBLEVBRUEsSUFBSSxXQUFtQjtBQUN0QixXQUFPLEtBQUssdUJBQXVCO0FBQUEsRUFDcEM7QUFBQSxFQUVBLElBQUksVUFBbUI7QUFDdEIsV0FBTyxDQUFDLEtBQUssbUJBQW1CLEtBQUssa0JBQWtCLG9CQUFvQixLQUFLLGVBQWU7QUFBQSxFQUNoRztBQUNEO0FBbEJhLGNBQU47QUFBQSxFQU1KO0FBQUEsR0FOVTsiLAogICJuYW1lcyI6IFtdCn0K
