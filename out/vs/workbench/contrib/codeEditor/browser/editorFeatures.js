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
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { getEditorFeatures } from "../../../../editor/common/editorFeatures.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
let EditorFeaturesInstantiator = class extends Disposable {
  constructor(codeEditorService, _instantiationService) {
    super();
    this._instantiationService = _instantiationService;
    this._instantiated = false;
    this._register(codeEditorService.onWillCreateCodeEditor(() => this._instantiate()));
    this._register(codeEditorService.onWillCreateDiffEditor(() => this._instantiate()));
    if (codeEditorService.listCodeEditors().length > 0 || codeEditorService.listDiffEditors().length > 0) {
      this._instantiate();
    }
  }
  _instantiate() {
    if (this._instantiated) {
      return;
    }
    this._instantiated = true;
    const editorFeatures = getEditorFeatures();
    for (const feature of editorFeatures) {
      try {
        const instance = this._instantiationService.createInstance(feature);
        if (typeof instance.dispose === "function") {
          this._register(instance);
        }
      } catch (err) {
        onUnexpectedError(err);
      }
    }
  }
};
EditorFeaturesInstantiator.ID = "workbench.contrib.editorFeaturesInstantiator";
EditorFeaturesInstantiator = __decorateClass([
  __decorateParam(0, ICodeEditorService),
  __decorateParam(1, IInstantiationService)
], EditorFeaturesInstantiator);
registerWorkbenchContribution2(EditorFeaturesInstantiator.ID, EditorFeaturesInstantiator, WorkbenchPhase.BlockRestore);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvZGVFZGl0b3JcXGJyb3dzZXJcXGVkaXRvckZlYXR1cmVzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0RWRpdG9yRmVhdHVyZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckZlYXR1cmVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UsIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcblxuY2xhc3MgRWRpdG9yRmVhdHVyZXNJbnN0YW50aWF0b3IgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmVkaXRvckZlYXR1cmVzSW5zdGFudGlhdG9yJztcblxuXHRwcml2YXRlIF9pbnN0YW50aWF0ZWQgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihjb2RlRWRpdG9yU2VydmljZS5vbldpbGxDcmVhdGVDb2RlRWRpdG9yKCgpID0+IHRoaXMuX2luc3RhbnRpYXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb2RlRWRpdG9yU2VydmljZS5vbldpbGxDcmVhdGVEaWZmRWRpdG9yKCgpID0+IHRoaXMuX2luc3RhbnRpYXRlKCkpKTtcblx0XHRpZiAoY29kZUVkaXRvclNlcnZpY2UubGlzdENvZGVFZGl0b3JzKCkubGVuZ3RoID4gMCB8fCBjb2RlRWRpdG9yU2VydmljZS5saXN0RGlmZkVkaXRvcnMoKS5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9pbnN0YW50aWF0ZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2luc3RhbnRpYXRlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pbnN0YW50aWF0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faW5zdGFudGlhdGVkID0gdHJ1ZTtcblxuXHRcdC8vIEluc3RhbnRpYXRlIGFsbCBlZGl0b3IgZmVhdHVyZXNcblx0XHRjb25zdCBlZGl0b3JGZWF0dXJlcyA9IGdldEVkaXRvckZlYXR1cmVzKCk7XG5cdFx0Zm9yIChjb25zdCBmZWF0dXJlIG9mIGVkaXRvckZlYXR1cmVzKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBpbnN0YW5jZSA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKGZlYXR1cmUpO1xuXHRcdFx0XHRpZiAodHlwZW9mICg8SURpc3Bvc2FibGU+aW5zdGFuY2UpLmRpc3Bvc2UgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0XHR0aGlzLl9yZWdpc3RlcigoPElEaXNwb3NhYmxlPmluc3RhbmNlKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoRWRpdG9yRmVhdHVyZXNJbnN0YW50aWF0b3IuSUQsIEVkaXRvckZlYXR1cmVzSW5zdGFudGlhdG9yLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmUpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGtCQUErQjtBQUN4QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFpQyxnQkFBZ0Isc0NBQXNDO0FBRXZGLElBQU0sNkJBQU4sY0FBeUMsV0FBNkM7QUFBQSxFQU1yRixZQUNxQixtQkFDb0IsdUJBQ3ZDO0FBQ0QsVUFBTTtBQUZrQztBQUp6QyxTQUFRLGdCQUFnQjtBQVF2QixTQUFLLFVBQVUsa0JBQWtCLHVCQUF1QixNQUFNLEtBQUssYUFBYSxDQUFDLENBQUM7QUFDbEYsU0FBSyxVQUFVLGtCQUFrQix1QkFBdUIsTUFBTSxLQUFLLGFBQWEsQ0FBQyxDQUFDO0FBQ2xGLFFBQUksa0JBQWtCLGdCQUFnQixFQUFFLFNBQVMsS0FBSyxrQkFBa0IsZ0JBQWdCLEVBQUUsU0FBUyxHQUFHO0FBQ3JHLFdBQUssYUFBYTtBQUFBLElBQ25CO0FBQUEsRUFDRDtBQUFBLEVBRVEsZUFBcUI7QUFDNUIsUUFBSSxLQUFLLGVBQWU7QUFDdkI7QUFBQSxJQUNEO0FBQ0EsU0FBSyxnQkFBZ0I7QUFHckIsVUFBTSxpQkFBaUIsa0JBQWtCO0FBQ3pDLGVBQVcsV0FBVyxnQkFBZ0I7QUFDckMsVUFBSTtBQUNILGNBQU0sV0FBVyxLQUFLLHNCQUFzQixlQUFlLE9BQU87QUFDbEUsWUFBSSxPQUFxQixTQUFVLFlBQVksWUFBWTtBQUMxRCxlQUFLLFVBQXdCLFFBQVM7QUFBQSxRQUN2QztBQUFBLE1BQ0QsU0FBUyxLQUFLO0FBQ2IsMEJBQWtCLEdBQUc7QUFBQSxNQUN0QjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUF0Q00sMkJBRVcsS0FBSztBQUZoQiw2QkFBTjtBQUFBLEVBT0c7QUFBQSxFQUNBO0FBQUEsR0FSRztBQXdDTiwrQkFBK0IsMkJBQTJCLElBQUksNEJBQTRCLGVBQWUsWUFBWTsiLAogICJuYW1lcyI6IFtdCn0K
