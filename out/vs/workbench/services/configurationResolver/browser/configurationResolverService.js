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
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { BaseConfigurationResolverService } from "./baseConfigurationResolverService.js";
import { IConfigurationResolverService } from "../common/configurationResolver.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { IPathService } from "../../path/common/pathService.js";
let ConfigurationResolverService = class extends BaseConfigurationResolverService {
  constructor(editorService, configurationService, commandService, workspaceContextService, quickInputService, labelService, pathService, extensionService, storageService) {
    super(
      { getAppRoot: () => void 0, getExecPath: () => void 0 },
      Promise.resolve(/* @__PURE__ */ Object.create(null)),
      editorService,
      configurationService,
      commandService,
      workspaceContextService,
      quickInputService,
      labelService,
      pathService,
      extensionService,
      storageService
    );
  }
};
ConfigurationResolverService = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, ICommandService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, IQuickInputService),
  __decorateParam(5, ILabelService),
  __decorateParam(6, IPathService),
  __decorateParam(7, IExtensionService),
  __decorateParam(8, IStorageService)
], ConfigurationResolverService);
registerSingleton(IConfigurationResolverService, ConfigurationResolverService, InstantiationType.Delayed);
export {
  ConfigurationResolverService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxjb25maWd1cmF0aW9uUmVzb2x2ZXJcXGJyb3dzZXJcXGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IEJhc2VDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi9iYXNlQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNsYXNzIENvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UgZXh0ZW5kcyBCYXNlQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFZGl0b3JTZXJ2aWNlIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwYXRoU2VydmljZTogSVBhdGhTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHsgZ2V0QXBwUm9vdDogKCkgPT4gdW5kZWZpbmVkLCBnZXRFeGVjUGF0aDogKCkgPT4gdW5kZWZpbmVkIH0sXG5cdFx0XHRQcm9taXNlLnJlc29sdmUoT2JqZWN0LmNyZWF0ZShudWxsKSksIGVkaXRvclNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0Y29tbWFuZFNlcnZpY2UsIHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBxdWlja0lucHV0U2VydmljZSwgbGFiZWxTZXJ2aWNlLCBwYXRoU2VydmljZSwgZXh0ZW5zaW9uU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLCBDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsb0JBQW9CO0FBRXRCLElBQU0sK0JBQU4sY0FBMkMsaUNBQWlDO0FBQUEsRUFFbEYsWUFDaUIsZUFDTyxzQkFDTixnQkFDUyx5QkFDTixtQkFDTCxjQUNELGFBQ0ssa0JBQ0YsZ0JBQ2hCO0FBQ0Q7QUFBQSxNQUFNLEVBQUUsWUFBWSxNQUFNLFFBQVcsYUFBYSxNQUFNLE9BQVU7QUFBQSxNQUNqRSxRQUFRLFFBQVEsdUJBQU8sT0FBTyxJQUFJLENBQUM7QUFBQSxNQUFHO0FBQUEsTUFBZTtBQUFBLE1BQ3JEO0FBQUEsTUFBZ0I7QUFBQSxNQUF5QjtBQUFBLE1BQW1CO0FBQUEsTUFBYztBQUFBLE1BQWE7QUFBQSxNQUFrQjtBQUFBLElBQWM7QUFBQSxFQUN6SDtBQUNEO0FBakJhLCtCQUFOO0FBQUEsRUFHSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FYVTtBQW1CYixrQkFBa0IsK0JBQStCLDhCQUE4QixrQkFBa0IsT0FBTzsiLAogICJuYW1lcyI6IFtdCn0K
