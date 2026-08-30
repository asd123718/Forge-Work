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
import { ThrottledDelayer } from "../../../../base/common/async.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { FontMeasurements } from "../../../../editor/browser/config/fontMeasurements.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
let DisplayChangeRemeasureFonts = class extends Disposable {
  constructor(nativeHostService) {
    super();
    this._delayer = this._register(new ThrottledDelayer(2e3));
    this._register(nativeHostService.onDidChangeDisplay(() => {
      this._delayer.trigger(() => {
        FontMeasurements.clearAllFontInfos();
        return Promise.resolve();
      });
    }));
  }
};
DisplayChangeRemeasureFonts = __decorateClass([
  __decorateParam(0, INativeHostService)
], DisplayChangeRemeasureFonts);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DisplayChangeRemeasureFonts, LifecyclePhase.Eventually);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvZGVFZGl0b3JcXGVsZWN0cm9uLWJyb3dzZXJcXGRpc3BsYXlDaGFuZ2VSZW1lYXN1cmVGb250cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFRocm90dGxlZERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEZvbnRNZWFzdXJlbWVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9jb25maWcvZm9udE1lYXN1cmVtZW50cy5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIFdvcmtiZW5jaEV4dGVuc2lvbnMsIElXb3JrYmVuY2hDb250cmlidXRpb24sIElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuY2xhc3MgRGlzcGxheUNoYW5nZVJlbWVhc3VyZUZvbnRzIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGhyb3R0bGVkRGVsYXllcigyMDAwKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElOYXRpdmVIb3N0U2VydmljZSBuYXRpdmVIb3N0U2VydmljZTogSU5hdGl2ZUhvc3RTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihuYXRpdmVIb3N0U2VydmljZS5vbkRpZENoYW5nZURpc3BsYXkoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZGVsYXllci50cmlnZ2VyKCgpID0+IHtcblx0XHRcdFx0Rm9udE1lYXN1cmVtZW50cy5jbGVhckFsbEZvbnRJbmZvcygpO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oV29ya2JlbmNoRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpLnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKERpc3BsYXlDaGFuZ2VSZW1lYXN1cmVGb250cywgTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsY0FBYywyQkFBb0Y7QUFDM0csU0FBUyxzQkFBc0I7QUFFL0IsSUFBTSw4QkFBTixjQUEwQyxXQUE2QztBQUFBLEVBSXRGLFlBQ3FCLG1CQUNuQjtBQUNELFVBQU07QUFMUCxTQUFpQixXQUFXLEtBQUssVUFBVSxJQUFJLGlCQUFpQixHQUFJLENBQUM7QUFPcEUsU0FBSyxVQUFVLGtCQUFrQixtQkFBbUIsTUFBTTtBQUN6RCxXQUFLLFNBQVMsUUFBUSxNQUFNO0FBQzNCLHlCQUFpQixrQkFBa0I7QUFDbkMsZUFBTyxRQUFRLFFBQVE7QUFBQSxNQUN4QixDQUFDO0FBQUEsSUFDRixDQUFDLENBQUM7QUFBQSxFQUNIO0FBQ0Q7QUFoQk0sOEJBQU47QUFBQSxFQUtHO0FBQUEsR0FMRztBQWtCTixTQUFTLEdBQW9DLG9CQUFvQixTQUFTLEVBQUUsOEJBQThCLDZCQUE2QixlQUFlLFVBQVU7IiwKICAibmFtZXMiOiBbXQp9Cg==
