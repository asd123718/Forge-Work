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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ILanguagePackService } from "../../../../platform/languagePacks/common/languagePacks.js";
let LocalizationsUpdater = class extends Disposable {
  constructor(localizationsService) {
    super();
    this.localizationsService = localizationsService;
    this.updateLocalizations();
  }
  updateLocalizations() {
    this.localizationsService.update();
  }
};
LocalizationsUpdater = __decorateClass([
  __decorateParam(0, ILanguagePackService)
], LocalizationsUpdater);
export {
  LocalizationsUpdater
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxjb2RlXFxlbGVjdHJvbi11dGlsaXR5XFxzaGFyZWRQcm9jZXNzXFxjb250cmliXFxsb2NhbGl6YXRpb25zVXBkYXRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlUGFja1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYW5ndWFnZVBhY2tzL2NvbW1vbi9sYW5ndWFnZVBhY2tzLmpzJztcbmltcG9ydCB7IE5hdGl2ZUxhbmd1YWdlUGFja1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYW5ndWFnZVBhY2tzL25vZGUvbGFuZ3VhZ2VQYWNrcy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBMb2NhbGl6YXRpb25zVXBkYXRlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFuZ3VhZ2VQYWNrU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvY2FsaXphdGlvbnNTZXJ2aWNlOiBOYXRpdmVMYW5ndWFnZVBhY2tTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnVwZGF0ZUxvY2FsaXphdGlvbnMoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTG9jYWxpemF0aW9ucygpOiB2b2lkIHtcblx0XHR0aGlzLmxvY2FsaXphdGlvbnNTZXJ2aWNlLnVwZGF0ZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsNEJBQTRCO0FBRzlCLElBQU0sdUJBQU4sY0FBbUMsV0FBVztBQUFBLEVBRXBELFlBQ3dDLHNCQUN0QztBQUNELFVBQU07QUFGaUM7QUFJdkMsU0FBSyxvQkFBb0I7QUFBQSxFQUMxQjtBQUFBLEVBRVEsc0JBQTRCO0FBQ25DLFNBQUsscUJBQXFCLE9BQU87QUFBQSxFQUNsQztBQUNEO0FBYmEsdUJBQU47QUFBQSxFQUdKO0FBQUEsR0FIVTsiLAogICJuYW1lcyI6IFtdCn0K
