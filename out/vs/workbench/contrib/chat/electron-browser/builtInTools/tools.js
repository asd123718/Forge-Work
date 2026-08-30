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
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { dirname, extUriBiasedIgnorePathCase } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { IFileDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { ChatExternalPathConfirmationContribution } from "../../common/tools/builtinTools/chatExternalPathConfirmation.js";
import { ChatUrlFetchingConfirmationContribution } from "../../common/tools/builtinTools/chatUrlFetchingConfirmation.js";
import { ILanguageModelToolsConfirmationService } from "../../common/tools/languageModelToolsConfirmationService.js";
import { ILanguageModelToolsService } from "../../common/tools/languageModelToolsService.js";
import { InternalFetchWebPageToolId } from "../../common/tools/builtinTools/tools.js";
import { FetchWebPageTool, FetchWebPageToolData } from "./fetchPageTool.js";
let NativeBuiltinToolsContribution = class extends Disposable {
  constructor(toolsService, instantiationService, confirmationService, fileService, storageService, fileDialogService, labelService) {
    super();
    const editTool = instantiationService.createInstance(FetchWebPageTool);
    this._register(toolsService.registerTool(FetchWebPageToolData, editTool));
    this._register(confirmationService.registerConfirmationContribution(
      InternalFetchWebPageToolId,
      instantiationService.createInstance(
        ChatUrlFetchingConfirmationContribution,
        (params) => params.urls
      )
    ));
    const externalPathConfirmation = new ChatExternalPathConfirmationContribution(
      (ref) => {
        const params = ref.parameters;
        if (params?.filePath) {
          return { path: params.filePath, isDirectory: false };
        }
        if (params?.path) {
          return { path: params.path, isDirectory: true };
        }
        return void 0;
      },
      labelService,
      async (pathUri) => {
        let dir = dirname(pathUri);
        for (let i = 0; i < 100; i++) {
          try {
            if (await fileService.exists(URI.joinPath(dir, ".git"))) {
              return dir;
            }
          } catch {
          }
          const parent = dirname(dir);
          if (extUriBiasedIgnorePathCase.isEqual(parent, dir)) {
            return void 0;
          }
          dir = parent;
        }
        return void 0;
      },
      storageService,
      async () => {
        const result = await fileDialogService.showOpenDialog({
          canSelectFolders: true,
          canSelectFiles: false,
          canSelectMany: false
        });
        return result?.[0];
      }
    );
    this._register(externalPathConfirmation);
    this._register(confirmationService.registerConfirmationContribution(
      "copilot_readFile",
      externalPathConfirmation
    ));
    this._register(confirmationService.registerConfirmationContribution(
      "copilot_listDirectory",
      externalPathConfirmation
    ));
  }
};
NativeBuiltinToolsContribution.ID = "chat.nativeBuiltinTools";
NativeBuiltinToolsContribution = __decorateClass([
  __decorateParam(0, ILanguageModelToolsService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ILanguageModelToolsConfirmationService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IFileDialogService),
  __decorateParam(6, ILabelService)
], NativeBuiltinToolsContribution);
export {
  NativeBuiltinToolsContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGVsZWN0cm9uLWJyb3dzZXJcXGJ1aWx0SW5Ub29sc1xcdG9vbHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGRpcm5hbWUsIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdEV4dGVybmFsUGF0aENvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi90b29scy9idWlsdGluVG9vbHMvY2hhdEV4dGVybmFsUGF0aENvbmZpcm1hdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0VXJsRmV0Y2hpbmdDb25maXJtYXRpb25Db250cmlidXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vdG9vbHMvYnVpbHRpblRvb2xzL2NoYXRVcmxGZXRjaGluZ0NvbmZpcm1hdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSW50ZXJuYWxGZXRjaFdlYlBhZ2VUb29sSWQgfSBmcm9tICcuLi8uLi9jb21tb24vdG9vbHMvYnVpbHRpblRvb2xzL3Rvb2xzLmpzJztcbmltcG9ydCB7IEZldGNoV2ViUGFnZVRvb2wsIEZldGNoV2ViUGFnZVRvb2xEYXRhLCBJRmV0Y2hXZWJQYWdlVG9vbFBhcmFtcyB9IGZyb20gJy4vZmV0Y2hQYWdlVG9vbC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBOYXRpdmVCdWlsdGluVG9vbHNDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2NoYXQubmF0aXZlQnVpbHRpblRvb2xzJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgdG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlIGNvbmZpcm1hdGlvblNlcnZpY2U6IElMYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElGaWxlRGlhbG9nU2VydmljZSBmaWxlRGlhbG9nU2VydmljZTogSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGVkaXRUb29sID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmV0Y2hXZWJQYWdlVG9vbCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9vbHNTZXJ2aWNlLnJlZ2lzdGVyVG9vbChGZXRjaFdlYlBhZ2VUb29sRGF0YSwgZWRpdFRvb2wpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbmZpcm1hdGlvblNlcnZpY2UucmVnaXN0ZXJDb25maXJtYXRpb25Db250cmlidXRpb24oXG5cdFx0XHRJbnRlcm5hbEZldGNoV2ViUGFnZVRvb2xJZCxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VXJsRmV0Y2hpbmdDb25maXJtYXRpb25Db250cmlidXRpb24sXG5cdFx0XHRcdHBhcmFtcyA9PiAocGFyYW1zIGFzIElGZXRjaFdlYlBhZ2VUb29sUGFyYW1zKS51cmxzXG5cdFx0XHQpXG5cdFx0KSk7XG5cblx0XHQvLyBSZWdpc3RlciBleHRlcm5hbCBwYXRoIGNvbmZpcm1hdGlvbiBjb250cmlidXRpb24gZm9yIHJlYWRfZmlsZSBhbmQgbGlzdF9kaXJcblx0XHQvLyBUaGV5IHNoYXJlIHRoZSBzYW1lIGFsbG93bGlzdCBzbyBhcHByb3ZpbmcgYSBmb2xkZXIgZm9yIHJlYWRpbmcgZmlsZXMgYWxzbyBhbGxvd3MgbGlzdGluZyB0aGF0IGRpcmVjdG9yeVxuXHRcdGNvbnN0IGV4dGVybmFsUGF0aENvbmZpcm1hdGlvbiA9IG5ldyBDaGF0RXh0ZXJuYWxQYXRoQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uKFxuXHRcdFx0KHJlZikgPT4ge1xuXHRcdFx0XHRjb25zdCBwYXJhbXMgPSByZWYucGFyYW1ldGVycyBhcyB7IGZpbGVQYXRoPzogc3RyaW5nOyBwYXRoPzogc3RyaW5nIH07XG5cdFx0XHRcdC8vIHJlYWRfZmlsZSB1c2VzIGZpbGVQYXRoIChpdCdzIGEgZmlsZSksIGxpc3RfZGlyIHVzZXMgcGF0aCAoaXQncyBhIGRpcmVjdG9yeSlcblx0XHRcdFx0aWYgKHBhcmFtcz8uZmlsZVBhdGgpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBwYXRoOiBwYXJhbXMuZmlsZVBhdGgsIGlzRGlyZWN0b3J5OiBmYWxzZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChwYXJhbXM/LnBhdGgpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBwYXRoOiBwYXJhbXMucGF0aCwgaXNEaXJlY3Rvcnk6IHRydWUgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdGxhYmVsU2VydmljZSxcblx0XHRcdGFzeW5jIChwYXRoVXJpOiBVUkkpID0+IHtcblx0XHRcdFx0Ly8gV2FsayB1cCBmcm9tIHRoZSBwYXRoIGxvb2tpbmcgZm9yIGEgLmdpdCBmb2xkZXIgdG8gZmluZCB0aGUgcmVwb3NpdG9yeSByb290XG5cdFx0XHRcdGxldCBkaXIgPSBkaXJuYW1lKHBhdGhVcmkpO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwMDsgaSsrKSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGlmIChhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoVVJJLmpvaW5QYXRoKGRpciwgJy5naXQnKSkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGRpcjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdC8vIGlnbm9yZSBwZXJtaXNzaW9uIGVycm9ycyBldGMuXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHBhcmVudCA9IGRpcm5hbWUoZGlyKTtcblx0XHRcdFx0XHRpZiAoZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbChwYXJlbnQsIGRpcikpIHtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGRpciA9IHBhcmVudDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmaWxlRGlhbG9nU2VydmljZS5zaG93T3BlbkRpYWxvZyh7XG5cdFx0XHRcdFx0Y2FuU2VsZWN0Rm9sZGVyczogdHJ1ZSxcblx0XHRcdFx0XHRjYW5TZWxlY3RGaWxlczogZmFsc2UsXG5cdFx0XHRcdFx0Y2FuU2VsZWN0TWFueTogZmFsc2UsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0Py5bMF07XG5cdFx0XHR9XG5cdFx0KTtcblx0XHR0aGlzLl9yZWdpc3RlcihleHRlcm5hbFBhdGhDb25maXJtYXRpb24pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29uZmlybWF0aW9uU2VydmljZS5yZWdpc3RlckNvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvbihcblx0XHRcdCdjb3BpbG90X3JlYWRGaWxlJyxcblx0XHRcdGV4dGVybmFsUGF0aENvbmZpcm1hdGlvblxuXHRcdCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29uZmlybWF0aW9uU2VydmljZS5yZWdpc3RlckNvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvbihcblx0XHRcdCdjb3BpbG90X2xpc3REaXJlY3RvcnknLFxuXHRcdFx0ZXh0ZXJuYWxQYXRoQ29uZmlybWF0aW9uXG5cdFx0KSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxTQUFTLGtDQUFrQztBQUNwRCxTQUFTLFdBQVc7QUFDcEIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyxnREFBZ0Q7QUFDekQsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyw4Q0FBOEM7QUFDdkQsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxrQkFBa0IsNEJBQXFEO0FBRXpFLElBQU0saUNBQU4sY0FBNkMsV0FBNkM7QUFBQSxFQUloRyxZQUM2QixjQUNMLHNCQUNpQixxQkFDMUIsYUFDRyxnQkFDRyxtQkFDTCxjQUNkO0FBQ0QsVUFBTTtBQUVOLFVBQU0sV0FBVyxxQkFBcUIsZUFBZSxnQkFBZ0I7QUFDckUsU0FBSyxVQUFVLGFBQWEsYUFBYSxzQkFBc0IsUUFBUSxDQUFDO0FBRXhFLFNBQUssVUFBVSxvQkFBb0I7QUFBQSxNQUNsQztBQUFBLE1BQ0EscUJBQXFCO0FBQUEsUUFDcEI7QUFBQSxRQUNBLFlBQVcsT0FBbUM7QUFBQSxNQUMvQztBQUFBLElBQ0QsQ0FBQztBQUlELFVBQU0sMkJBQTJCLElBQUk7QUFBQSxNQUNwQyxDQUFDLFFBQVE7QUFDUixjQUFNLFNBQVMsSUFBSTtBQUVuQixZQUFJLFFBQVEsVUFBVTtBQUNyQixpQkFBTyxFQUFFLE1BQU0sT0FBTyxVQUFVLGFBQWEsTUFBTTtBQUFBLFFBQ3BEO0FBQ0EsWUFBSSxRQUFRLE1BQU07QUFDakIsaUJBQU8sRUFBRSxNQUFNLE9BQU8sTUFBTSxhQUFhLEtBQUs7QUFBQSxRQUMvQztBQUNBLGVBQU87QUFBQSxNQUNSO0FBQUEsTUFDQTtBQUFBLE1BQ0EsT0FBTyxZQUFpQjtBQUV2QixZQUFJLE1BQU0sUUFBUSxPQUFPO0FBQ3pCLGlCQUFTLElBQUksR0FBRyxJQUFJLEtBQUssS0FBSztBQUM3QixjQUFJO0FBQ0gsZ0JBQUksTUFBTSxZQUFZLE9BQU8sSUFBSSxTQUFTLEtBQUssTUFBTSxDQUFDLEdBQUc7QUFDeEQscUJBQU87QUFBQSxZQUNSO0FBQUEsVUFDRCxRQUFRO0FBQUEsVUFFUjtBQUNBLGdCQUFNLFNBQVMsUUFBUSxHQUFHO0FBQzFCLGNBQUksMkJBQTJCLFFBQVEsUUFBUSxHQUFHLEdBQUc7QUFDcEQsbUJBQU87QUFBQSxVQUNSO0FBQ0EsZ0JBQU07QUFBQSxRQUNQO0FBQ0EsZUFBTztBQUFBLE1BQ1I7QUFBQSxNQUNBO0FBQUEsTUFDQSxZQUFZO0FBQ1gsY0FBTSxTQUFTLE1BQU0sa0JBQWtCLGVBQWU7QUFBQSxVQUNyRCxrQkFBa0I7QUFBQSxVQUNsQixnQkFBZ0I7QUFBQSxVQUNoQixlQUFlO0FBQUEsUUFDaEIsQ0FBQztBQUNELGVBQU8sU0FBUyxDQUFDO0FBQUEsTUFDbEI7QUFBQSxJQUNEO0FBQ0EsU0FBSyxVQUFVLHdCQUF3QjtBQUV2QyxTQUFLLFVBQVUsb0JBQW9CO0FBQUEsTUFDbEM7QUFBQSxNQUNBO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxVQUFVLG9CQUFvQjtBQUFBLE1BQ2xDO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQWxGYSwrQkFFSSxLQUFLO0FBRlQsaUNBQU47QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FYVTsiLAogICJuYW1lcyI6IFtdCn0K
