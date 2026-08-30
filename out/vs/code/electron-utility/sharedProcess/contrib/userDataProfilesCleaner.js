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
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
let UserDataProfilesCleaner = class extends Disposable {
  constructor(userDataProfilesService) {
    super();
    const scheduler = this._register(new RunOnceScheduler(
      () => {
        userDataProfilesService.cleanUp();
      },
      10 * 1e3
      /* after 10s */
    ));
    scheduler.schedule();
  }
};
UserDataProfilesCleaner = __decorateClass([
  __decorateParam(0, IUserDataProfilesService)
], UserDataProfilesCleaner);
export {
  UserDataProfilesCleaner
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxjb2RlXFxlbGVjdHJvbi11dGlsaXR5XFxzaGFyZWRQcm9jZXNzXFxjb250cmliXFx1c2VyRGF0YVByb2ZpbGVzQ2xlYW5lci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcblxuZXhwb3J0IGNsYXNzIFVzZXJEYXRhUHJvZmlsZXNDbGVhbmVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBzY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHR1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5jbGVhblVwKCk7XG5cdFx0fSwgMTAgKiAxMDAwIC8qIGFmdGVyIDEwcyAqLykpO1xuXHRcdHNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZ0NBQWdDO0FBRWxDLElBQU0sMEJBQU4sY0FBc0MsV0FBVztBQUFBLEVBRXZELFlBQzJCLHlCQUN6QjtBQUNELFVBQU07QUFFTixVQUFNLFlBQVksS0FBSyxVQUFVLElBQUk7QUFBQSxNQUFpQixNQUFNO0FBQzNELGdDQUF3QixRQUFRO0FBQUEsTUFDakM7QUFBQSxNQUFHLEtBQUs7QUFBQTtBQUFBLElBQW9CLENBQUM7QUFDN0IsY0FBVSxTQUFTO0FBQUEsRUFDcEI7QUFDRDtBQVphLDBCQUFOO0FBQUEsRUFHSjtBQUFBLEdBSFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
