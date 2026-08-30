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
import { Lazy } from "../../../base/common/lazy.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import * as path from "../../../base/common/path.js";
import * as process from "../../../base/common/process.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { IExtHostDocumentsAndEditors } from "./extHostDocumentsAndEditors.js";
import { IExtHostEditorTabs } from "./extHostEditorTabs.js";
import { IExtHostExtensionService } from "./extHostExtensionService.js";
import { CustomEditorTabInput, NotebookDiffEditorTabInput, NotebookEditorTabInput, TextDiffTabInput, TextTabInput } from "./extHostTypes.js";
import { IExtHostWorkspace } from "./extHostWorkspace.js";
import { AbstractVariableResolverService } from "../../services/configurationResolver/common/variableResolver.js";
import { IExtHostConfiguration } from "./extHostConfiguration.js";
const IExtHostVariableResolverProvider = createDecorator("IExtHostVariableResolverProvider");
class ExtHostVariableResolverService extends AbstractVariableResolverService {
  constructor(extensionService, workspaceService, editorService, editorTabs, configProvider, context, homeDir) {
    function getActiveUri() {
      if (editorService) {
        const activeEditor = editorService.activeEditor();
        if (activeEditor) {
          return activeEditor.document.uri;
        }
        const activeTab = editorTabs.tabGroups.all.find((group) => group.isActive)?.activeTab;
        if (activeTab !== void 0) {
          if (activeTab.input instanceof TextDiffTabInput || activeTab.input instanceof NotebookDiffEditorTabInput) {
            return activeTab.input.modified;
          } else if (activeTab.input instanceof TextTabInput || activeTab.input instanceof NotebookEditorTabInput || activeTab.input instanceof CustomEditorTabInput) {
            return activeTab.input.uri;
          }
        }
      }
      return void 0;
    }
    super({
      getFolderUri: (folderName) => {
        const found = context.folders.filter((f) => f.name === folderName);
        if (found && found.length > 0) {
          return found[0].uri;
        }
        return void 0;
      },
      getWorkspaceFolderCount: () => {
        return context.folders.length;
      },
      getConfigurationValue: (folderUri, section) => {
        return configProvider.getConfiguration(void 0, folderUri).get(section);
      },
      getAppRoot: () => {
        return process.cwd();
      },
      getExecPath: () => {
        return process.env["VSCODE_EXEC_PATH"];
      },
      getFilePath: () => {
        const activeUri = getActiveUri();
        if (activeUri) {
          return path.normalize(activeUri.fsPath);
        }
        return void 0;
      },
      getWorkspaceFolderPathForFile: () => {
        if (workspaceService) {
          const activeUri = getActiveUri();
          if (activeUri) {
            const ws = workspaceService.getWorkspaceFolder(activeUri);
            if (ws) {
              return path.normalize(ws.uri.fsPath);
            }
          }
        }
        return void 0;
      },
      getSelectedText: () => {
        if (editorService) {
          const activeEditor = editorService.activeEditor();
          if (activeEditor && !activeEditor.selection.isEmpty) {
            return activeEditor.document.getText(activeEditor.selection);
          }
        }
        return void 0;
      },
      getLineNumber: () => {
        if (editorService) {
          const activeEditor = editorService.activeEditor();
          if (activeEditor) {
            return String(activeEditor.selection.end.line + 1);
          }
        }
        return void 0;
      },
      getColumnNumber: () => {
        if (editorService) {
          const activeEditor = editorService.activeEditor();
          if (activeEditor) {
            return String(activeEditor.selection.end.character + 1);
          }
        }
        return void 0;
      },
      getExtension: (id) => {
        return extensionService.getExtension(id);
      }
    }, void 0, homeDir ? Promise.resolve(homeDir) : void 0, Promise.resolve(process.env));
  }
}
let ExtHostVariableResolverProviderService = class extends Disposable {
  constructor(extensionService, workspaceService, editorService, configurationService, editorTabs) {
    super();
    this.extensionService = extensionService;
    this.workspaceService = workspaceService;
    this.editorService = editorService;
    this.configurationService = configurationService;
    this.editorTabs = editorTabs;
    this._resolver = new Lazy(async () => {
      const configProvider = await this.configurationService.getConfigProvider();
      const folders = await this.workspaceService.getWorkspaceFolders2() || [];
      const dynamic = { folders };
      this._register(this.workspaceService.onDidChangeWorkspace(async (e) => {
        dynamic.folders = await this.workspaceService.getWorkspaceFolders2() || [];
      }));
      return new ExtHostVariableResolverService(
        this.extensionService,
        this.workspaceService,
        this.editorService,
        this.editorTabs,
        configProvider,
        dynamic,
        this.homeDir()
      );
    });
  }
  getResolver() {
    return this._resolver.value;
  }
  homeDir() {
    return void 0;
  }
};
ExtHostVariableResolverProviderService = __decorateClass([
  __decorateParam(0, IExtHostExtensionService),
  __decorateParam(1, IExtHostWorkspace),
  __decorateParam(2, IExtHostDocumentsAndEditors),
  __decorateParam(3, IExtHostConfiguration),
  __decorateParam(4, IExtHostEditorTabs)
], ExtHostVariableResolverProviderService);
export {
  ExtHostVariableResolverProviderService,
  IExtHostVariableResolverProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0VmFyaWFibGVSZXNvbHZlclNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgKiBhcyBwcm9jZXNzIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2Nlc3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzIH0gZnJvbSAnLi9leHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdEVkaXRvclRhYnMgfSBmcm9tICcuL2V4dEhvc3RFZGl0b3JUYWJzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0RXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdEV4dGVuc2lvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ3VzdG9tRWRpdG9yVGFiSW5wdXQsIE5vdGVib29rRGlmZkVkaXRvclRhYklucHV0LCBOb3RlYm9va0VkaXRvclRhYklucHV0LCBUZXh0RGlmZlRhYklucHV0LCBUZXh0VGFiSW5wdXQgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFdvcmtzcGFjZSB9IGZyb20gJy4vZXh0SG9zdFdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb25SZXNvbHZlci9jb21tb24vY29uZmlndXJhdGlvblJlc29sdmVyLmpzJztcbmltcG9ydCB7IEFic3RyYWN0VmFyaWFibGVSZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uUmVzb2x2ZXIvY29tbW9uL3ZhcmlhYmxlUmVzb2x2ZXIuanMnO1xuaW1wb3J0ICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBFeHRIb3N0Q29uZmlnUHJvdmlkZXIsIElFeHRIb3N0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4vZXh0SG9zdENvbmZpZ3VyYXRpb24uanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRIb3N0VmFyaWFibGVSZXNvbHZlclByb3ZpZGVyIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRnZXRSZXNvbHZlcigpOiBQcm9taXNlPElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlPjtcbn1cblxuZXhwb3J0IGNvbnN0IElFeHRIb3N0VmFyaWFibGVSZXNvbHZlclByb3ZpZGVyID0gY3JlYXRlRGVjb3JhdG9yPElFeHRIb3N0VmFyaWFibGVSZXNvbHZlclByb3ZpZGVyPignSUV4dEhvc3RWYXJpYWJsZVJlc29sdmVyUHJvdmlkZXInKTtcblxuaW50ZXJmYWNlIER5bmFtaWNDb250ZXh0IHtcblx0Zm9sZGVyczogdnNjb2RlLldvcmtzcGFjZUZvbGRlcltdO1xufVxuXG5jbGFzcyBFeHRIb3N0VmFyaWFibGVSZXNvbHZlclNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdFZhcmlhYmxlUmVzb2x2ZXJTZXJ2aWNlIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRleHRlbnNpb25TZXJ2aWNlOiBJRXh0SG9zdEV4dGVuc2lvblNlcnZpY2UsXG5cdFx0d29ya3NwYWNlU2VydmljZTogSUV4dEhvc3RXb3Jrc3BhY2UsXG5cdFx0ZWRpdG9yU2VydmljZTogSUV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzLFxuXHRcdGVkaXRvclRhYnM6IElFeHRIb3N0RWRpdG9yVGFicyxcblx0XHRjb25maWdQcm92aWRlcjogRXh0SG9zdENvbmZpZ1Byb3ZpZGVyLFxuXHRcdGNvbnRleHQ6IER5bmFtaWNDb250ZXh0LFxuXHRcdGhvbWVEaXI6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0KSB7XG5cdFx0ZnVuY3Rpb24gZ2V0QWN0aXZlVXJpKCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0XHRpZiAoZWRpdG9yU2VydmljZSkge1xuXHRcdFx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcigpO1xuXHRcdFx0XHRpZiAoYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGFjdGl2ZUVkaXRvci5kb2N1bWVudC51cmk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYWN0aXZlVGFiID0gZWRpdG9yVGFicy50YWJHcm91cHMuYWxsLmZpbmQoZ3JvdXAgPT4gZ3JvdXAuaXNBY3RpdmUpPy5hY3RpdmVUYWI7XG5cdFx0XHRcdGlmIChhY3RpdmVUYWIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdC8vIFJlc29sdmUgYSByZXNvdXJjZSBmcm9tIHRoZSB0YWJcblx0XHRcdFx0XHRpZiAoYWN0aXZlVGFiLmlucHV0IGluc3RhbmNlb2YgVGV4dERpZmZUYWJJbnB1dCB8fCBhY3RpdmVUYWIuaW5wdXQgaW5zdGFuY2VvZiBOb3RlYm9va0RpZmZFZGl0b3JUYWJJbnB1dCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGFjdGl2ZVRhYi5pbnB1dC5tb2RpZmllZDtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGFjdGl2ZVRhYi5pbnB1dCBpbnN0YW5jZW9mIFRleHRUYWJJbnB1dCB8fCBhY3RpdmVUYWIuaW5wdXQgaW5zdGFuY2VvZiBOb3RlYm9va0VkaXRvclRhYklucHV0IHx8IGFjdGl2ZVRhYi5pbnB1dCBpbnN0YW5jZW9mIEN1c3RvbUVkaXRvclRhYklucHV0KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYWN0aXZlVGFiLmlucHV0LnVyaTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0c3VwZXIoe1xuXHRcdFx0Z2V0Rm9sZGVyVXJpOiAoZm9sZGVyTmFtZTogc3RyaW5nKTogVVJJIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdFx0Y29uc3QgZm91bmQgPSBjb250ZXh0LmZvbGRlcnMuZmlsdGVyKGYgPT4gZi5uYW1lID09PSBmb2xkZXJOYW1lKTtcblx0XHRcdFx0aWYgKGZvdW5kICYmIGZvdW5kLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRyZXR1cm4gZm91bmRbMF0udXJpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0V29ya3NwYWNlRm9sZGVyQ291bnQ6ICgpOiBudW1iZXIgPT4ge1xuXHRcdFx0XHRyZXR1cm4gY29udGV4dC5mb2xkZXJzLmxlbmd0aDtcblx0XHRcdH0sXG5cdFx0XHRnZXRDb25maWd1cmF0aW9uVmFsdWU6IChmb2xkZXJVcmk6IFVSSSB8IHVuZGVmaW5lZCwgc2VjdGlvbjogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdFx0cmV0dXJuIGNvbmZpZ1Byb3ZpZGVyLmdldENvbmZpZ3VyYXRpb24odW5kZWZpbmVkLCBmb2xkZXJVcmkpLmdldDxzdHJpbmc+KHNlY3Rpb24pO1xuXHRcdFx0fSxcblx0XHRcdGdldEFwcFJvb3Q6ICgpOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRyZXR1cm4gcHJvY2Vzcy5jd2QoKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRFeGVjUGF0aDogKCk6IHN0cmluZyB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRcdHJldHVybiBwcm9jZXNzLmVudlsnVlNDT0RFX0VYRUNfUEFUSCddO1xuXHRcdFx0fSxcblx0XHRcdGdldEZpbGVQYXRoOiAoKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdFx0Y29uc3QgYWN0aXZlVXJpID0gZ2V0QWN0aXZlVXJpKCk7XG5cdFx0XHRcdGlmIChhY3RpdmVVcmkpIHtcblx0XHRcdFx0XHRyZXR1cm4gcGF0aC5ub3JtYWxpemUoYWN0aXZlVXJpLmZzUGF0aCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRnZXRXb3Jrc3BhY2VGb2xkZXJQYXRoRm9yRmlsZTogKCk6IHN0cmluZyB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRcdGlmICh3b3Jrc3BhY2VTZXJ2aWNlKSB7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aXZlVXJpID0gZ2V0QWN0aXZlVXJpKCk7XG5cdFx0XHRcdFx0aWYgKGFjdGl2ZVVyaSkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgd3MgPSB3b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihhY3RpdmVVcmkpO1xuXHRcdFx0XHRcdFx0aWYgKHdzKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBwYXRoLm5vcm1hbGl6ZSh3cy51cmkuZnNQYXRoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRnZXRTZWxlY3RlZFRleHQ6ICgpOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRpZiAoZWRpdG9yU2VydmljZSkge1xuXHRcdFx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yKCk7XG5cdFx0XHRcdFx0aWYgKGFjdGl2ZUVkaXRvciAmJiAhYWN0aXZlRWRpdG9yLnNlbGVjdGlvbi5pc0VtcHR5KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYWN0aXZlRWRpdG9yLmRvY3VtZW50LmdldFRleHQoYWN0aXZlRWRpdG9yLnNlbGVjdGlvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0TGluZU51bWJlcjogKCk6IHN0cmluZyB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRcdGlmIChlZGl0b3JTZXJ2aWNlKSB7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3IoKTtcblx0XHRcdFx0XHRpZiAoYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gU3RyaW5nKGFjdGl2ZUVkaXRvci5zZWxlY3Rpb24uZW5kLmxpbmUgKyAxKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRnZXRDb2x1bW5OdW1iZXI6ICgpOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRpZiAoZWRpdG9yU2VydmljZSkge1xuXHRcdFx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yKCk7XG5cdFx0XHRcdFx0aWYgKGFjdGl2ZUVkaXRvcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFN0cmluZyhhY3RpdmVFZGl0b3Iuc2VsZWN0aW9uLmVuZC5jaGFyYWN0ZXIgKyAxKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRnZXRFeHRlbnNpb246IChpZCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gZXh0ZW5zaW9uU2VydmljZS5nZXRFeHRlbnNpb24oaWQpO1xuXHRcdFx0fSxcblx0XHR9LCB1bmRlZmluZWQsIGhvbWVEaXIgPyBQcm9taXNlLnJlc29sdmUoaG9tZURpcikgOiB1bmRlZmluZWQsIFByb21pc2UucmVzb2x2ZShwcm9jZXNzLmVudikpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0VmFyaWFibGVSZXNvbHZlclByb3ZpZGVyU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRXh0SG9zdFZhcmlhYmxlUmVzb2x2ZXJQcm92aWRlciB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX3Jlc29sdmVyID0gbmV3IExhenkoYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ1Byb3ZpZGVyID0gYXdhaXQgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRDb25maWdQcm92aWRlcigpO1xuXHRcdGNvbnN0IGZvbGRlcnMgPSBhd2FpdCB0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyczIoKSB8fCBbXTtcblxuXHRcdGNvbnN0IGR5bmFtaWM6IER5bmFtaWNDb250ZXh0ID0geyBmb2xkZXJzIH07XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya3NwYWNlKGFzeW5jIGUgPT4ge1xuXHRcdFx0ZHluYW1pYy5mb2xkZXJzID0gYXdhaXQgdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcnMyKCkgfHwgW107XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIG5ldyBFeHRIb3N0VmFyaWFibGVSZXNvbHZlclNlcnZpY2UoXG5cdFx0XHR0aGlzLmV4dGVuc2lvblNlcnZpY2UsXG5cdFx0XHR0aGlzLndvcmtzcGFjZVNlcnZpY2UsXG5cdFx0XHR0aGlzLmVkaXRvclNlcnZpY2UsXG5cdFx0XHR0aGlzLmVkaXRvclRhYnMsXG5cdFx0XHRjb25maWdQcm92aWRlcixcblx0XHRcdGR5bmFtaWMsXG5cdFx0XHR0aGlzLmhvbWVEaXIoKSxcblx0XHQpO1xuXHR9KTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dEhvc3RFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dEhvc3RFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdFdvcmtzcGFjZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVNlcnZpY2U6IElFeHRIb3N0V29ya3NwYWNlLFxuXHRcdEBJRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMsXG5cdFx0QElFeHRIb3N0Q29uZmlndXJhdGlvbiBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJRXh0SG9zdENvbmZpZ3VyYXRpb24sXG5cdFx0QElFeHRIb3N0RWRpdG9yVGFicyBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclRhYnM6IElFeHRIb3N0RWRpdG9yVGFicyxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRSZXNvbHZlcigpOiBQcm9taXNlPElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVyLnZhbHVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIGhvbWVEaXIoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsWUFBWTtBQUNyQixTQUFTLGtCQUFrQjtBQUMzQixZQUFZLFVBQVU7QUFDdEIsWUFBWSxhQUFhO0FBRXpCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsc0JBQXNCLDRCQUE0Qix3QkFBd0Isa0JBQWtCLG9CQUFvQjtBQUN6SCxTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLHVDQUF1QztBQUVoRCxTQUFnQyw2QkFBNkI7QUFPdEQsTUFBTSxtQ0FBbUMsZ0JBQWtELGtDQUFrQztBQU1wSSxNQUFNLHVDQUF1QyxnQ0FBZ0M7QUFBQSxFQUU1RSxZQUNDLGtCQUNBLGtCQUNBLGVBQ0EsWUFDQSxnQkFDQSxTQUNBLFNBQ0M7QUFDRCxhQUFTLGVBQWdDO0FBQ3hDLFVBQUksZUFBZTtBQUNsQixjQUFNLGVBQWUsY0FBYyxhQUFhO0FBQ2hELFlBQUksY0FBYztBQUNqQixpQkFBTyxhQUFhLFNBQVM7QUFBQSxRQUM5QjtBQUNBLGNBQU0sWUFBWSxXQUFXLFVBQVUsSUFBSSxLQUFLLFdBQVMsTUFBTSxRQUFRLEdBQUc7QUFDMUUsWUFBSSxjQUFjLFFBQVc7QUFFNUIsY0FBSSxVQUFVLGlCQUFpQixvQkFBb0IsVUFBVSxpQkFBaUIsNEJBQTRCO0FBQ3pHLG1CQUFPLFVBQVUsTUFBTTtBQUFBLFVBQ3hCLFdBQVcsVUFBVSxpQkFBaUIsZ0JBQWdCLFVBQVUsaUJBQWlCLDBCQUEwQixVQUFVLGlCQUFpQixzQkFBc0I7QUFDM0osbUJBQU8sVUFBVSxNQUFNO0FBQUEsVUFDeEI7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUNBLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTTtBQUFBLE1BQ0ws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
