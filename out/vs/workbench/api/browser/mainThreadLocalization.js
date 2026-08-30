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
import { MainContext } from "../common/extHost.protocol.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { URI } from "../../../base/common/uri.js";
import { IFileService } from "../../../platform/files/common/files.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { ILanguagePackService } from "../../../platform/languagePacks/common/languagePacks.js";
let MainThreadLocalization = class extends Disposable {
  constructor(extHostContext, fileService, languagePackService) {
    super();
    this.fileService = fileService;
    this.languagePackService = languagePackService;
  }
  async $fetchBuiltInBundleUri(id, language) {
    try {
      const uri = await this.languagePackService.getBuiltInExtensionTranslationsUri(id, language);
      return uri;
    } catch (e) {
      return void 0;
    }
  }
  async $fetchBundleContents(uriComponents) {
    const contents = await this.fileService.readFile(URI.revive(uriComponents));
    return contents.value.toString();
  }
};
MainThreadLocalization = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadLocalization),
  __decorateParam(1, IFileService),
  __decorateParam(2, ILanguagePackService)
], MainThreadLocalization);
export {
  MainThreadLocalization
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZExvY2FsaXphdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IE1haW5Db250ZXh0LCBNYWluVGhyZWFkTG9jYWxpemF0aW9uU2hhcGUgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBleHRIb3N0TmFtZWRDdXN0b21lciwgSUV4dEhvc3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0SG9zdEN1c3RvbWVycy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlUGFja1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sYW5ndWFnZVBhY2tzL2NvbW1vbi9sYW5ndWFnZVBhY2tzLmpzJztcblxuQGV4dEhvc3ROYW1lZEN1c3RvbWVyKE1haW5Db250ZXh0Lk1haW5UaHJlYWRMb2NhbGl6YXRpb24pXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZExvY2FsaXphdGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBNYWluVGhyZWFkTG9jYWxpemF0aW9uU2hhcGUge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGV4dEhvc3RDb250ZXh0OiBJRXh0SG9zdENvbnRleHQsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVBhY2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VQYWNrU2VydmljZTogSUxhbmd1YWdlUGFja1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGFzeW5jICRmZXRjaEJ1aWx0SW5CdW5kbGVVcmkoaWQ6IHN0cmluZywgbGFuZ3VhZ2U6IHN0cmluZyk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHVyaSA9IGF3YWl0IHRoaXMubGFuZ3VhZ2VQYWNrU2VydmljZS5nZXRCdWlsdEluRXh0ZW5zaW9uVHJhbnNsYXRpb25zVXJpKGlkLCBsYW5ndWFnZSk7XG5cdFx0XHRyZXR1cm4gdXJpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgJGZldGNoQnVuZGxlQ29udGVudHModXJpQ29tcG9uZW50czogVXJpQ29tcG9uZW50cyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgY29udGVudHMgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5yZXZpdmUodXJpQ29tcG9uZW50cykpO1xuXHRcdHJldHVybiBjb250ZW50cy52YWx1ZS50b1N0cmluZygpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsbUJBQWdEO0FBQ3pELFNBQVMsNEJBQTZDO0FBQ3RELFNBQVMsV0FBMEI7QUFDbkMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyw0QkFBNEI7QUFHOUIsSUFBTSx5QkFBTixjQUFxQyxXQUFrRDtBQUFBLEVBRTdGLFlBQ0MsZ0JBQytCLGFBQ1EscUJBQ3RDO0FBQ0QsVUFBTTtBQUh5QjtBQUNRO0FBQUEsRUFHeEM7QUFBQSxFQUVBLE1BQU0sdUJBQXVCLElBQVksVUFBNEM7QUFDcEYsUUFBSTtBQUNILFlBQU0sTUFBTSxNQUFNLEtBQUssb0JBQW9CLG1DQUFtQyxJQUFJLFFBQVE7QUFDMUYsYUFBTztBQUFBLElBQ1IsU0FBUyxHQUFHO0FBQ1gsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLHFCQUFxQixlQUErQztBQUN6RSxVQUFNLFdBQVcsTUFBTSxLQUFLLFlBQVksU0FBUyxJQUFJLE9BQU8sYUFBYSxDQUFDO0FBQzFFLFdBQU8sU0FBUyxNQUFNLFNBQVM7QUFBQSxFQUNoQztBQUNEO0FBdkJhLHlCQUFOO0FBQUEsRUFETixxQkFBcUIsWUFBWSxzQkFBc0I7QUFBQSxFQUtyRDtBQUFBLEVBQ0E7QUFBQSxHQUxVOyIsCiAgIm5hbWVzIjogW10KfQo=
