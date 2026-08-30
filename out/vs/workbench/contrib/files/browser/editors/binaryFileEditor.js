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
import { localize } from "../../../../../nls.js";
import { BaseBinaryResourceEditor } from "../../../../browser/parts/editor/binaryEditor.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { FileEditorInput } from "./fileEditorInput.js";
import { BINARY_FILE_EDITOR_ID, BINARY_TEXT_FILE_MODE } from "../../common/files.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { EditorResolution } from "../../../../../platform/editor/common/editor.js";
import { IEditorResolverService, ResolvedStatus } from "../../../../services/editor/common/editorResolverService.js";
import { isEditorInputWithOptions } from "../../../../common/editor.js";
import { DiffEditorInput } from "../../../../common/editor/diffEditorInput.js";
let BinaryFileEditor = class extends BaseBinaryResourceEditor {
  constructor(group, telemetryService, themeService, editorResolverService, storageService) {
    super(
      BinaryFileEditor.ID,
      group,
      {
        openInternal: (input, options) => this.openInternal(input, options)
      },
      telemetryService,
      themeService,
      storageService
    );
    this.editorResolverService = editorResolverService;
  }
  async openInternal(input, options) {
    if (input instanceof FileEditorInput && this.group.activeEditor) {
      const activeEditor = this.group.activeEditor;
      const untypedActiveEditor = activeEditor?.toUntyped();
      if (!untypedActiveEditor) {
        return;
      }
      let resolvedEditor = await this.editorResolverService.resolveEditor({
        ...untypedActiveEditor,
        options: {
          ...options,
          override: EditorResolution.PICK
        }
      }, this.group);
      if (resolvedEditor === ResolvedStatus.NONE) {
        resolvedEditor = void 0;
      } else if (resolvedEditor === ResolvedStatus.ABORT) {
        return;
      }
      if (isEditorInputWithOptions(resolvedEditor)) {
        for (const editor of resolvedEditor.editor instanceof DiffEditorInput ? [resolvedEditor.editor.original, resolvedEditor.editor.modified] : [resolvedEditor.editor]) {
          if (editor instanceof FileEditorInput) {
            editor.setForceOpenAsText();
            editor.setPreferredLanguageId(BINARY_TEXT_FILE_MODE);
          }
        }
      }
      await this.group.replaceEditors([{
        editor: activeEditor,
        replacement: resolvedEditor?.editor ?? input,
        options: {
          ...resolvedEditor?.options ?? options
        }
      }]);
    }
  }
  getTitle() {
    return this.input ? this.input.getName() : localize("binaryFileEditor", "Binary File Viewer");
  }
};
BinaryFileEditor.ID = BINARY_FILE_EDITOR_ID;
BinaryFileEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IEditorResolverService),
  __decorateParam(4, IStorageService)
], BinaryFileEditor);
export {
  BinaryFileEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZpbGVzXFxicm93c2VyXFxlZGl0b3JzXFxiaW5hcnlGaWxlRWRpdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQmFzZUJpbmFyeVJlc291cmNlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvYmluYXJ5RWRpdG9yLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEZpbGVFZGl0b3JJbnB1dCB9IGZyb20gJy4vZmlsZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEJJTkFSWV9GSUxFX0VESVRPUl9JRCwgQklOQVJZX1RFWFRfRklMRV9NT0RFIH0gZnJvbSAnLi4vLi4vY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yUmVzb2x1dGlvbiwgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLCBSZXNvbHZlZFN0YXR1cywgUmVzb2x2ZWRFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclJlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc0VkaXRvcklucHV0V2l0aE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZGlmZkVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5cbi8qKlxuICogQW4gaW1wbGVtZW50YXRpb24gb2YgZWRpdG9yIGZvciBiaW5hcnkgZmlsZXMgdGhhdCBjYW5ub3QgYmUgZGlzcGxheWVkLlxuICovXG5leHBvcnQgY2xhc3MgQmluYXJ5RmlsZUVkaXRvciBleHRlbmRzIEJhc2VCaW5hcnlSZXNvdXJjZUVkaXRvciB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gQklOQVJZX0ZJTEVfRURJVE9SX0lEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGdyb3VwOiBJRWRpdG9yR3JvdXAsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUVkaXRvclJlc29sdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclJlc29sdmVyU2VydmljZTogSUVkaXRvclJlc29sdmVyU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoXG5cdFx0XHRCaW5hcnlGaWxlRWRpdG9yLklELFxuXHRcdFx0Z3JvdXAsXG5cdFx0XHR7XG5cdFx0XHRcdG9wZW5JbnRlcm5hbDogKGlucHV0LCBvcHRpb25zKSA9PiB0aGlzLm9wZW5JbnRlcm5hbChpbnB1dCwgb3B0aW9ucylcblx0XHRcdH0sXG5cdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0dGhlbWVTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2Vcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuSW50ZXJuYWwoaW5wdXQ6IEVkaXRvcklucHV0LCBvcHRpb25zOiBJRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChpbnB1dCBpbnN0YW5jZW9mIEZpbGVFZGl0b3JJbnB1dCAmJiB0aGlzLmdyb3VwLmFjdGl2ZUVkaXRvcikge1xuXG5cdFx0XHQvLyBXZSBvcGVyYXRlIG9uIHRoZSBhY3RpdmUgZWRpdG9yIGhlcmUgdG8gc3VwcG9ydCByZS1vcGVuaW5nXG5cdFx0XHQvLyBkaWZmIGVkaXRvcnMgd2hlcmUgYGlucHV0YCBtYXkganVzdCBiZSBvbmUgc2lkZSBvZiB0aGVcblx0XHRcdC8vIGRpZmYgZWRpdG9yLlxuXHRcdFx0Ly8gU2luY2UgYG9wZW5JbnRlcm5hbGAgY2FuIG9ubHkgZXZlciBiZSBzZWxlY3RlZCBmcm9tIHRoZVxuXHRcdFx0Ly8gYWN0aXZlIGVkaXRvciBvZiB0aGUgZ3JvdXAsIHRoaXMgaXMgYSBzYWZlIGFzc3VtcHRpb24uXG5cdFx0XHQvLyAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEyNDIyMilcblx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IHRoaXMuZ3JvdXAuYWN0aXZlRWRpdG9yO1xuXHRcdFx0Y29uc3QgdW50eXBlZEFjdGl2ZUVkaXRvciA9IGFjdGl2ZUVkaXRvcj8udG9VbnR5cGVkKCk7XG5cdFx0XHRpZiAoIXVudHlwZWRBY3RpdmVFZGl0b3IpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyB3ZSBuZWVkIHVudHlwZWQgZWRpdG9yIHN1cHBvcnRcblx0XHRcdH1cblxuXHRcdFx0Ly8gVHJ5IHRvIGxldCB0aGUgdXNlciBwaWNrIGFuIGVkaXRvclxuXHRcdFx0bGV0IHJlc29sdmVkRWRpdG9yOiBSZXNvbHZlZEVkaXRvciB8IHVuZGVmaW5lZCA9IGF3YWl0IHRoaXMuZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLnJlc29sdmVFZGl0b3Ioe1xuXHRcdFx0XHQuLi51bnR5cGVkQWN0aXZlRWRpdG9yLFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0XHRvdmVycmlkZTogRWRpdG9yUmVzb2x1dGlvbi5QSUNLXG5cdFx0XHRcdH1cblx0XHRcdH0sIHRoaXMuZ3JvdXApO1xuXG5cdFx0XHRpZiAocmVzb2x2ZWRFZGl0b3IgPT09IFJlc29sdmVkU3RhdHVzLk5PTkUpIHtcblx0XHRcdFx0cmVzb2x2ZWRFZGl0b3IgPSB1bmRlZmluZWQ7XG5cdFx0XHR9IGVsc2UgaWYgKHJlc29sdmVkRWRpdG9yID09PSBSZXNvbHZlZFN0YXR1cy5BQk9SVCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIHRoZSByZXN1bHQgaWYgYSBmaWxlIGVkaXRvciwgdGhlIHVzZXIgaW5kaWNhdGVkIHRvIG9wZW5cblx0XHRcdC8vIHRoZSBiaW5hcnkgZmlsZSBhcyB0ZXh0LiBBcyBzdWNoIHdlIGFkanVzdCB0aGUgaW5wdXQgZm9yIHRoYXQuXG5cdFx0XHRpZiAoaXNFZGl0b3JJbnB1dFdpdGhPcHRpb25zKHJlc29sdmVkRWRpdG9yKSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiByZXNvbHZlZEVkaXRvci5lZGl0b3IgaW5zdGFuY2VvZiBEaWZmRWRpdG9ySW5wdXQgPyBbcmVzb2x2ZWRFZGl0b3IuZWRpdG9yLm9yaWdpbmFsLCByZXNvbHZlZEVkaXRvci5lZGl0b3IubW9kaWZpZWRdIDogW3Jlc29sdmVkRWRpdG9yLmVkaXRvcl0pIHtcblx0XHRcdFx0XHRpZiAoZWRpdG9yIGluc3RhbmNlb2YgRmlsZUVkaXRvcklucHV0KSB7XG5cdFx0XHRcdFx0XHRlZGl0b3Iuc2V0Rm9yY2VPcGVuQXNUZXh0KCk7XG5cdFx0XHRcdFx0XHRlZGl0b3Iuc2V0UHJlZmVycmVkTGFuZ3VhZ2VJZChCSU5BUllfVEVYVF9GSUxFX01PREUpOyAvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTMxMDc2XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlcGxhY2UgdGhlIGFjdGl2ZSBlZGl0b3Igd2l0aCB0aGUgcGlja2VkIG9uZVxuXHRcdFx0YXdhaXQgdGhpcy5ncm91cC5yZXBsYWNlRWRpdG9ycyhbe1xuXHRcdFx0XHRlZGl0b3I6IGFjdGl2ZUVkaXRvcixcblx0XHRcdFx0cmVwbGFjZW1lbnQ6IHJlc29sdmVkRWRpdG9yPy5lZGl0b3IgPz8gaW5wdXQsXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHQuLi5yZXNvbHZlZEVkaXRvcj8ub3B0aW9ucyA/PyBvcHRpb25zXG5cdFx0XHRcdH1cblx0XHRcdH1dKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBnZXRUaXRsZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmlucHV0ID8gdGhpcy5pbnB1dC5nZXROYW1lKCkgOiBsb2NhbGl6ZSgnYmluYXJ5RmlsZUVkaXRvcicsIFwiQmluYXJ5IEZpbGUgVmlld2VyXCIpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUJBQXVCLDZCQUE2QjtBQUM3RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHdCQUF3QztBQUNqRCxTQUFTLHdCQUF3QixzQkFBc0M7QUFDdkUsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx1QkFBdUI7QUFNekIsSUFBTSxtQkFBTixjQUErQix5QkFBeUI7QUFBQSxFQUk5RCxZQUNDLE9BQ21CLGtCQUNKLGNBQzBCLHVCQUN4QixnQkFDaEI7QUFDRDtBQUFBLE1BQ0MsaUJBQWlCO0FBQUEsTUFDakI7QUFBQSxNQUNBO0FBQUEsUUFDQyxjQUFjLENBQUMsT0FBTyxZQUFZLEtBQUssYUFBYSxPQUFPLE9BQU87QUFBQSxNQUNuRTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFaeUM7QUFBQSxFQWExQztBQUFBLEVBRUEsTUFBYyxhQUFhLE9BQW9CLFNBQW9EO0FBQ2xHLFFBQUksaUJBQWlCLG1CQUFtQixLQUFLLE1BQU0sY0FBYztBQVFoRSxZQUFNLGVBQWUsS0FBSyxNQUFNO0FBQ2hDLFlBQU0sc0JBQXNCLGNBQWMsVUFBVTtBQUNwRCxVQUFJLENBQUMscUJBQXFCO0FBQ3pCO0FBQUEsTUFDRDtBQUdBLFVBQUksaUJBQTZDLE1BQU0sS0FBSyxzQkFBc0IsY0FBYztBQUFBLFFBQy9GLEdBQUc7QUFBQSxRQUNILFNBQVM7QUFBQSxVQUNSLEdBQUc7QUFBQSxVQUNILFVBQVUsaUJBQWlCO0FBQUEsUUFDNUI7QUFBQSxNQUNELEdBQUcsS0FBSyxLQUFLO0FBRWIsVUFBSSxtQkFBbUIsZUFBZSxNQUFNO0FBQzNDLHlCQUFpQjtBQUFBLE1BQ2xCLFdBQVcsbUJBQW1CLGVBQWUsT0FBTztBQUNuRDtBQUFBLE1BQ0Q7QUFJQSxVQUFJLHlCQUF5QixjQUFjLEdBQUc7QUFDN0MsbUJBQVcsVUFBVSxlQUFlLGtCQUFrQixrQkFBa0IsQ0FBQyxlQUFlLE9BQU8sVUFBVSxlQUFlLE9BQU8sUUFBUSxJQUFJLENBQUMsZUFBZSxNQUFNLEdBQUc7QUFDbkssY0FBSSxrQkFBa0IsaUJBQWlCO0FBQ3RDLG1CQUFPLG1CQUFtQjtBQUMxQixtQkFBTyx1QkFBdUIscUJBQXFCO0FBQUEsVUFDcEQ7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUdBLFlBQU0sS0FBSyxNQUFNLGVBQWUsQ0FBQztBQUFBLFFBQ2hDLFFBQVE7QUFBQSxRQUNSLGFBQWEsZ0JBQWdCLFVBQVU7QUFBQSxRQUN2QyxTQUFTO0FBQUEsVUFDUixHQUFHLGdCQUFnQixXQUFXO0FBQUEsUUFDL0I7QUFBQSxNQUNELENBQUMsQ0FBQztBQUFBLElBQ0g7QUFBQSxFQUNEO0FBQUEsRUFFUyxXQUFtQjtBQUMzQixXQUFPLEtBQUssUUFBUSxLQUFLLE1BQU0sUUFBUSxJQUFJLFNBQVMsb0JBQW9CLG9CQUFvQjtBQUFBLEVBQzdGO0FBQ0Q7QUE5RWEsaUJBRUksS0FBSztBQUZULG1CQUFOO0FBQUEsRUFNSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBVFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
