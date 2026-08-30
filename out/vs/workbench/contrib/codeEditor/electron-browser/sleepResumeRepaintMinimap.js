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
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
let SleepResumeRepaintMinimap = class extends Disposable {
  constructor(codeEditorService, nativeHostService) {
    super();
    this._register(nativeHostService.onDidResumeOS(() => {
      codeEditorService.listCodeEditors().forEach((editor) => editor.render(true));
    }));
  }
};
SleepResumeRepaintMinimap = __decorateClass([
  __decorateParam(0, ICodeEditorService),
  __decorateParam(1, INativeHostService)
], SleepResumeRepaintMinimap);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(SleepResumeRepaintMinimap, LifecyclePhase.Eventually);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvZGVFZGl0b3JcXGVsZWN0cm9uLWJyb3dzZXJcXHNsZWVwUmVzdW1lUmVwYWludE1pbmltYXAudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoRXh0ZW5zaW9ucywgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOYXRpdmVIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9jb21tb24vbmF0aXZlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuXG5jbGFzcyBTbGVlcFJlc3VtZVJlcGFpbnRNaW5pbWFwIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASU5hdGl2ZUhvc3RTZXJ2aWNlIG5hdGl2ZUhvc3RTZXJ2aWNlOiBJTmF0aXZlSG9zdFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG5hdGl2ZUhvc3RTZXJ2aWNlLm9uRGlkUmVzdW1lT1MoKCkgPT4ge1xuXHRcdFx0Y29kZUVkaXRvclNlcnZpY2UubGlzdENvZGVFZGl0b3JzKCkuZm9yRWFjaChlZGl0b3IgPT4gZWRpdG9yLnJlbmRlcih0cnVlKSk7XG5cdFx0fSkpO1xuXHR9XG59XG5cblJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihTbGVlcFJlc3VtZVJlcGFpbnRNaW5pbWFwLCBMaWZlY3ljbGVQaGFzZS5FdmVudHVhbGx5KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxjQUFjLDJCQUFvRjtBQUMzRyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGtCQUFrQjtBQUUzQixJQUFNLDRCQUFOLGNBQXdDLFdBQTZDO0FBQUEsRUFFcEYsWUFDcUIsbUJBQ0EsbUJBQ25CO0FBQ0QsVUFBTTtBQUVOLFNBQUssVUFBVSxrQkFBa0IsY0FBYyxNQUFNO0FBQ3BELHdCQUFrQixnQkFBZ0IsRUFBRSxRQUFRLFlBQVUsT0FBTyxPQUFPLElBQUksQ0FBQztBQUFBLElBQzFFLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFDRDtBQVpNLDRCQUFOO0FBQUEsRUFHRztBQUFBLEVBQ0E7QUFBQSxHQUpHO0FBY04sU0FBUyxHQUFvQyxvQkFBb0IsU0FBUyxFQUFFLDhCQUE4QiwyQkFBMkIsZUFBZSxVQUFVOyIsCiAgIm5hbWVzIjogW10KfQo=
