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
import { distinct } from "../../../../base/common/arrays.js";
import { Emitter } from "../../../../base/common/event.js";
import { parse } from "../../../../base/common/json.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { getIconClasses } from "../../../../editor/common/services/getIconClasses.js";
import { FileKind, IFileService } from "../../../../platform/files/common/files.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { isWorkspace, IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { localize } from "../../../../nls.js";
import { IJSONEditingService } from "../../configuration/common/jsonEditing.js";
import { ResourceMap } from "../../../../base/common/map.js";
const EXTENSIONS_CONFIG = ".vscode/extensions.json";
const IWorkspaceExtensionsConfigService = createDecorator("IWorkspaceExtensionsConfigService");
let WorkspaceExtensionsConfigService = class extends Disposable {
  constructor(workspaceContextService, fileService, quickInputService, modelService, languageService, jsonEditingService) {
    super();
    this.workspaceContextService = workspaceContextService;
    this.fileService = fileService;
    this.quickInputService = quickInputService;
    this.modelService = modelService;
    this.languageService = languageService;
    this.jsonEditingService = jsonEditingService;
    this._onDidChangeExtensionsConfigs = this._register(new Emitter());
    this.onDidChangeExtensionsConfigs = this._onDidChangeExtensionsConfigs.event;
    this._register(workspaceContextService.onDidChangeWorkspaceFolders((e) => this._onDidChangeExtensionsConfigs.fire()));
    this._register(fileService.onDidFilesChange((e) => {
      const workspace = workspaceContextService.getWorkspace();
      if (workspace.configuration && e.affects(workspace.configuration) || workspace.folders.some((folder) => e.affects(folder.toResource(EXTENSIONS_CONFIG)))) {
        this._onDidChangeExtensionsConfigs.fire();
      }
    }));
  }
  async getExtensionsConfigs() {
    const workspace = this.workspaceContextService.getWorkspace();
    const result = [];
    const workspaceExtensionsConfigContent = workspace.configuration ? await this.resolveWorkspaceExtensionConfig(workspace.configuration) : void 0;
    if (workspaceExtensionsConfigContent) {
      result.push(workspaceExtensionsConfigContent);
    }
    result.push(...await Promise.all(workspace.folders.map((workspaceFolder) => this.resolveWorkspaceFolderExtensionConfig(workspaceFolder))));
    return result;
  }
  async getRecommendations() {
    const configs = await this.getExtensionsConfigs();
    return distinct(configs.flatMap((c) => c.recommendations ? c.recommendations.map((c2) => c2.toLowerCase()) : []));
  }
  async getUnwantedRecommendations() {
    const configs = await this.getExtensionsConfigs();
    return distinct(configs.flatMap((c) => c.unwantedRecommendations ? c.unwantedRecommendations.map((c2) => c2.toLowerCase()) : []));
  }
  async toggleRecommendation(extensionId) {
    extensionId = extensionId.toLowerCase();
    const workspace = this.workspaceContextService.getWorkspace();
    const workspaceExtensionsConfigContent = workspace.configuration ? await this.resolveWorkspaceExtensionConfig(workspace.configuration) : void 0;
    const workspaceFolderExtensionsConfigContents = new ResourceMap();
    await Promise.all(workspace.folders.map(async (workspaceFolder) => {
      const extensionsConfigContent = await this.resolveWorkspaceFolderExtensionConfig(workspaceFolder);
      workspaceFolderExtensionsConfigContents.set(workspaceFolder.uri, extensionsConfigContent);
    }));
    const isWorkspaceRecommended = workspaceExtensionsConfigContent && workspaceExtensionsConfigContent.recommendations?.some((r) => r.toLowerCase() === extensionId);
    const recommendedWorksapceFolders = workspace.folders.filter((workspaceFolder) => workspaceFolderExtensionsConfigContents.get(workspaceFolder.uri)?.recommendations?.some((r) => r.toLowerCase() === extensionId));
    const isRecommended = isWorkspaceRecommended || recommendedWorksapceFolders.length > 0;
    const workspaceOrFolders = isRecommended ? await this.pickWorkspaceOrFolders(recommendedWorksapceFolders, isWorkspaceRecommended ? workspace : void 0, localize("select for remove", "Remove extension recommendation from")) : await this.pickWorkspaceOrFolders(workspace.folders, workspace.configuration ? workspace : void 0, localize("select for add", "Add extension recommendation to"));
    for (const workspaceOrWorkspaceFolder of workspaceOrFolders) {
      if (isWorkspace(workspaceOrWorkspaceFolder)) {
        await this.addOrRemoveWorkspaceRecommendation(extensionId, workspaceOrWorkspaceFolder, workspaceExtensionsConfigContent, !isRecommended);
      } else {
        await this.addOrRemoveWorkspaceFolderRecommendation(extensionId, workspaceOrWorkspaceFolder, workspaceFolderExtensionsConfigContents.get(workspaceOrWorkspaceFolder.uri), !isRecommended);
      }
    }
  }
  async toggleUnwantedRecommendation(extensionId) {
    const workspace = this.workspaceContextService.getWorkspace();
    const workspaceExtensionsConfigContent = workspace.configuration ? await this.resolveWorkspaceExtensionConfig(workspace.configuration) : void 0;
    const workspaceFolderExtensionsConfigContents = new ResourceMap();
    await Promise.all(workspace.folders.map(async (workspaceFolder) => {
      const extensionsConfigContent = await this.resolveWorkspaceFolderExtensionConfig(workspaceFolder);
      workspaceFolderExtensionsConfigContents.set(workspaceFolder.uri, extensionsConfigContent);
    }));
    const isWorkspaceUnwanted = workspaceExtensionsConfigContent && workspaceExtensionsConfigContent.unwantedRecommendations?.some((r) => r === extensionId);
    const unWantedWorksapceFolders = workspace.folders.filter((workspaceFolder) => workspaceFolderExtensionsConfigContents.get(workspaceFolder.uri)?.unwantedRecommendations?.some((r) => r === extensionId));
    const isUnwanted = isWorkspaceUnwanted || unWantedWorksapceFolders.length > 0;
    const workspaceOrFolders = isUnwanted ? await this.pickWorkspaceOrFolders(unWantedWorksapceFolders, isWorkspaceUnwanted ? workspace : void 0, localize("select for remove", "Remove extension recommendation from")) : await this.pickWorkspaceOrFolders(workspace.folders, workspace.configuration ? workspace : void 0, localize("select for add", "Add extension recommendation to"));
    for (const workspaceOrWorkspaceFolder of workspaceOrFolders) {
      if (isWorkspace(workspaceOrWorkspaceFolder)) {
        await this.addOrRemoveWorkspaceUnwantedRecommendation(extensionId, workspaceOrWorkspaceFolder, workspaceExtensionsConfigContent, !isUnwanted);
      } else {
        await this.addOrRemoveWorkspaceFolderUnwantedRecommendation(extensionId, workspaceOrWorkspaceFolder, workspaceFolderExtensionsConfigContents.get(workspaceOrWorkspaceFolder.uri), !isUnwanted);
      }
    }
  }
  async addOrRemoveWorkspaceFolderRecommendation(extensionId, workspaceFolder, extensionsConfigContent, add) {
    const values = [];
    if (add) {
      if (Array.isArray(extensionsConfigContent.recommendations)) {
        values.push({ path: ["recommendations", -1], value: extensionId });
      } else {
        values.push({ path: ["recommendations"], value: [extensionId] });
      }
      const unwantedRecommendationEdit = this.getEditToRemoveValueFromArray(["unwantedRecommendations"], extensionsConfigContent.unwantedRecommendations, extensionId);
      if (unwantedRecommendationEdit) {
        values.push(unwantedRecommendationEdit);
      }
    } else if (extensionsConfigContent.recommendations) {
      const recommendationEdit = this.getEditToRemoveValueFromArray(["recommendations"], extensionsConfigContent.recommendations, extensionId);
      if (recommendationEdit) {
        values.push(recommendationEdit);
      }
    }
    if (values.length) {
      return this.jsonEditingService.write(workspaceFolder.toResource(EXTENSIONS_CONFIG), values, true);
    }
  }
  async addOrRemoveWorkspaceRecommendation(extensionId, workspace, extensionsConfigContent, add) {
    const values = [];
    if (extensionsConfigContent) {
      if (add) {
        const path = ["extensions", "recommendations"];
        if (Array.isArray(extensionsConfigContent.recommendations)) {
          values.push({ path: [...path, -1], value: extensionId });
        } else {
          values.push({ path, value: [extensionId] });
        }
        const unwantedRecommendationEdit = this.getEditToRemoveValueFromArray(["extensions", "unwantedRecommendations"], extensionsConfigContent.unwantedRecommendations, extensionId);
        if (unwantedRecommendationEdit) {
          values.push(unwantedRecommendationEdit);
        }
      } else if (extensionsConfigContent.recommendations) {
        const recommendationEdit = this.getEditToRemoveValueFromArray(["extensions", "recommendations"], extensionsConfigContent.recommendations, extensionId);
        if (recommendationEdit) {
          values.push(recommendationEdit);
        }
      }
    } else if (add) {
      values.push({ path: ["extensions"], value: { recommendations: [extensionId] } });
    }
    if (values.length) {
      return this.jsonEditingService.write(workspace.configuration, values, true);
    }
  }
  async addOrRemoveWorkspaceFolderUnwantedRecommendation(extensionId, workspaceFolder, extensionsConfigContent, add) {
    const values = [];
    if (add) {
      const path = ["unwantedRecommendations"];
      if (Array.isArray(extensionsConfigContent.unwantedRecommendations)) {
        values.push({ path: [...path, -1], value: extensionId });
      } else {
        values.push({ path, value: [extensionId] });
      }
      const recommendationEdit = this.getEditToRemoveValueFromArray(["recommendations"], extensionsConfigContent.recommendations, extensionId);
      if (recommendationEdit) {
        values.push(recommendationEdit);
      }
    } else if (extensionsConfigContent.unwantedRecommendations) {
      const unwantedRecommendationEdit = this.getEditToRemoveValueFromArray(["unwantedRecommendations"], extensionsConfigContent.unwantedRecommendations, extensionId);
      if (unwantedRecommendationEdit) {
        values.push(unwantedRecommendationEdit);
      }
    }
    if (values.length) {
      return this.jsonEditingService.write(workspaceFolder.toResource(EXTENSIONS_CONFIG), values, true);
    }
  }
  async addOrRemoveWorkspaceUnwantedRecommendation(extensionId, workspace, extensionsConfigContent, add) {
    const values = [];
    if (extensionsConfigContent) {
      if (add) {
        const path = ["extensions", "unwantedRecommendations"];
        if (Array.isArray(extensionsConfigContent.recommendations)) {
          values.push({ path: [...path, -1], value: extensionId });
        } else {
          values.push({ path, value: [extensionId] });
        }
        const recommendationEdit = this.getEditToRemoveValueFromArray(["extensions", "recommendations"], extensionsConfigContent.recommendations, extensionId);
        if (recommendationEdit) {
          values.push(recommendationEdit);
        }
      } else if (extensionsConfigContent.unwantedRecommendations) {
        const unwantedRecommendationEdit = this.getEditToRemoveValueFromArray(["extensions", "unwantedRecommendations"], extensionsConfigContent.unwantedRecommendations, extensionId);
        if (unwantedRecommendationEdit) {
          values.push(unwantedRecommendationEdit);
        }
      }
    } else if (add) {
      values.push({ path: ["extensions"], value: { unwantedRecommendations: [extensionId] } });
    }
    if (values.length) {
      return this.jsonEditingService.write(workspace.configuration, values, true);
    }
  }
  async pickWorkspaceOrFolders(workspaceFolders, workspace, placeHolder) {
    const workspaceOrFolders = workspace ? [...workspaceFolders, workspace] : [...workspaceFolders];
    if (workspaceOrFolders.length === 1) {
      return workspaceOrFolders;
    }
    const folderPicks = workspaceFolders.map((workspaceFolder) => {
      return {
        label: workspaceFolder.name,
        description: localize("workspace folder", "Workspace Folder"),
        workspaceOrFolder: workspaceFolder,
        iconClasses: getIconClasses(this.modelService, this.languageService, workspaceFolder.uri, FileKind.ROOT_FOLDER)
      };
    });
    if (workspace) {
      folderPicks.push({ type: "separator" });
      folderPicks.push({
        label: localize("workspace", "Workspace"),
        workspaceOrFolder: workspace
      });
    }
    const result = await this.quickInputService.pick(folderPicks, { placeHolder, canPickMany: true }) || [];
    return result.map((r) => r.workspaceOrFolder);
  }
  async resolveWorkspaceExtensionConfig(workspaceConfigurationResource) {
    try {
      const content = await this.fileService.readFile(workspaceConfigurationResource);
      const extensionsConfigContent = parse(content.value.toString())["extensions"];
      return extensionsConfigContent ? this.parseExtensionConfig(extensionsConfigContent) : void 0;
    } catch (e) {
    }
    return void 0;
  }
  async resolveWorkspaceFolderExtensionConfig(workspaceFolder) {
    try {
      const content = await this.fileService.readFile(workspaceFolder.toResource(EXTENSIONS_CONFIG));
      const extensionsConfigContent = parse(content.value.toString());
      return this.parseExtensionConfig(extensionsConfigContent);
    } catch (e) {
    }
    return {};
  }
  parseExtensionConfig(extensionsConfigContent) {
    return {
      recommendations: distinct((extensionsConfigContent.recommendations || []).map((e) => e.toLowerCase())),
      unwantedRecommendations: distinct((extensionsConfigContent.unwantedRecommendations || []).map((e) => e.toLowerCase()))
    };
  }
  getEditToRemoveValueFromArray(path, array, value) {
    const index = array?.indexOf(value);
    if (index !== void 0 && index !== -1) {
      return { path: [...path, index], value: void 0 };
    }
    return void 0;
  }
};
WorkspaceExtensionsConfigService = __decorateClass([
  __decorateParam(0, IWorkspaceContextService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, IModelService),
  __decorateParam(4, ILanguageService),
  __decorateParam(5, IJSONEditingService)
], WorkspaceExtensionsConfigService);
registerSingleton(IWorkspaceExtensionsConfigService, WorkspaceExtensionsConfigService, InstantiationType.Delayed);
export {
  EXTENSIONS_CONFIG,
  IWorkspaceExtensionsConfigService,
  WorkspaceExtensionsConfigService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxleHRlbnNpb25SZWNvbW1lbmRhdGlvbnNcXGNvbW1vblxcd29ya3NwYWNlRXh0ZW5zaW9uc0NvbmZpZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRpc3RpbmN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSlNPTlBhdGgsIHBhcnNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGdldEljb25DbGFzc2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9nZXRJY29uQ2xhc3Nlcy5qcyc7XG5pbXBvcnQgeyBGaWxlS2luZCwgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBpc1dvcmtzcGFjZSwgSVdvcmtzcGFjZSwgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSwgSVF1aWNrUGlja1NlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJSlNPTkVkaXRpbmdTZXJ2aWNlLCBJSlNPTlZhbHVlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vanNvbkVkaXRpbmcuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuXG5leHBvcnQgY29uc3QgRVhURU5TSU9OU19DT05GSUcgPSAnLnZzY29kZS9leHRlbnNpb25zLmpzb24nO1xuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRlbnNpb25zQ29uZmlnQ29udGVudCB7XG5cdHJlY29tbWVuZGF0aW9ucz86IHN0cmluZ1tdO1xuXHR1bndhbnRlZFJlY29tbWVuZGF0aW9ucz86IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgY29uc3QgSVdvcmtzcGFjZUV4dGVuc2lvbnNDb25maWdTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElXb3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnU2VydmljZT4oJ0lXb3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnU2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElXb3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnU2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZUV4dGVuc2lvbnNDb25maWdzOiBFdmVudDx2b2lkPjtcblx0Z2V0RXh0ZW5zaW9uc0NvbmZpZ3MoKTogUHJvbWlzZTxJRXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnRbXT47XG5cdGdldFJlY29tbWVuZGF0aW9ucygpOiBQcm9taXNlPHN0cmluZ1tdPjtcblx0Z2V0VW53YW50ZWRSZWNvbW1lbmRhdGlvbnMoKTogUHJvbWlzZTxzdHJpbmdbXT47XG5cblx0dG9nZ2xlUmVjb21tZW5kYXRpb24oZXh0ZW5zaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG5cdHRvZ2dsZVVud2FudGVkUmVjb21tZW5kYXRpb24oZXh0ZW5zaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG59XG5cbmV4cG9ydCBjbGFzcyBXb3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya3NwYWNlRXh0ZW5zaW9uc0NvbmZpZ1NlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRXh0ZW5zaW9uc0NvbmZpZ3MgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VFeHRlbnNpb25zQ29uZmlncyA9IHRoaXMuX29uRGlkQ2hhbmdlRXh0ZW5zaW9uc0NvbmZpZ3MuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElKU09ORWRpdGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBqc29uRWRpdGluZ1NlcnZpY2U6IElKU09ORWRpdGluZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIod29ya3NwYWNlQ29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKGUgPT4gdGhpcy5fb25EaWRDaGFuZ2VFeHRlbnNpb25zQ29uZmlncy5maXJlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihmaWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlKGUgPT4ge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCk7XG5cdFx0XHRpZiAoKHdvcmtzcGFjZS5jb25maWd1cmF0aW9uICYmIGUuYWZmZWN0cyh3b3Jrc3BhY2UuY29uZmlndXJhdGlvbikpXG5cdFx0XHRcdHx8IHdvcmtzcGFjZS5mb2xkZXJzLnNvbWUoZm9sZGVyID0+IGUuYWZmZWN0cyhmb2xkZXIudG9SZXNvdXJjZShFWFRFTlNJT05TX0NPTkZJRykpKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRXh0ZW5zaW9uc0NvbmZpZ3MuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGFzeW5jIGdldEV4dGVuc2lvbnNDb25maWdzKCk6IFByb21pc2U8SUV4dGVuc2lvbnNDb25maWdDb250ZW50W10+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXHRcdGNvbnN0IHJlc3VsdDogSUV4dGVuc2lvbnNDb25maWdDb250ZW50W10gPSBbXTtcblx0XHRjb25zdCB3b3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnQ29udGVudCA9IHdvcmtzcGFjZS5jb25maWd1cmF0aW9uID8gYXdhaXQgdGhpcy5yZXNvbHZlV29ya3NwYWNlRXh0ZW5zaW9uQ29uZmlnKHdvcmtzcGFjZS5jb25maWd1cmF0aW9uKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAod29ya3NwYWNlRXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQpIHtcblx0XHRcdHJlc3VsdC5wdXNoKHdvcmtzcGFjZUV4dGVuc2lvbnNDb25maWdDb250ZW50KTtcblx0XHR9XG5cdFx0cmVzdWx0LnB1c2goLi4uYXdhaXQgUHJvbWlzZS5hbGwod29ya3NwYWNlLmZvbGRlcnMubWFwKHdvcmtzcGFjZUZvbGRlciA9PiB0aGlzLnJlc29sdmVXb3Jrc3BhY2VGb2xkZXJFeHRlbnNpb25Db25maWcod29ya3NwYWNlRm9sZGVyKSkpKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0YXN5bmMgZ2V0UmVjb21tZW5kYXRpb25zKCk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRjb25zdCBjb25maWdzID0gYXdhaXQgdGhpcy5nZXRFeHRlbnNpb25zQ29uZmlncygpO1xuXHRcdHJldHVybiBkaXN0aW5jdChjb25maWdzLmZsYXRNYXAoYyA9PiBjLnJlY29tbWVuZGF0aW9ucyA/IGMucmVjb21tZW5kYXRpb25zLm1hcChjID0+IGMudG9Mb3dlckNhc2UoKSkgOiBbXSkpO1xuXHR9XG5cblx0YXN5bmMgZ2V0VW53YW50ZWRSZWNvbW1lbmRhdGlvbnMoKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3MgPSBhd2FpdCB0aGlzLmdldEV4dGVuc2lvbnNDb25maWdzKCk7XG5cdFx0cmV0dXJuIGRpc3RpbmN0KGNvbmZpZ3MuZmxhdE1hcChjID0+IGMudW53YW50ZWRSZWNvbW1lbmRhdGlvbnMgPyBjLnVud2FudGVkUmVjb21tZW5kYXRpb25zLm1hcChjID0+IGMudG9Mb3dlckNhc2UoKSkgOiBbXSkpO1xuXHR9XG5cblx0YXN5bmMgdG9nZ2xlUmVjb21tZW5kYXRpb24oZXh0ZW5zaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGV4dGVuc2lvbklkID0gZXh0ZW5zaW9uSWQudG9Mb3dlckNhc2UoKTtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUV4dGVuc2lvbnNDb25maWdDb250ZW50ID0gd29ya3NwYWNlLmNvbmZpZ3VyYXRpb24gPyBhd2FpdCB0aGlzLnJlc29sdmVXb3Jrc3BhY2VFeHRlbnNpb25Db25maWcod29ya3NwYWNlLmNvbmZpZ3VyYXRpb24pIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlckV4dGVuc2lvbnNDb25maWdDb250ZW50cyA9IG5ldyBSZXNvdXJjZU1hcDxJRXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQ+KCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwod29ya3NwYWNlLmZvbGRlcnMubWFwKGFzeW5jIHdvcmtzcGFjZUZvbGRlciA9PiB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25zQ29uZmlnQ29udGVudCA9IGF3YWl0IHRoaXMucmVzb2x2ZVdvcmtzcGFjZUZvbGRlckV4dGVuc2lvbkNvbmZpZyh3b3Jrc3BhY2VGb2xkZXIpO1xuXHRcdFx0d29ya3NwYWNlRm9sZGVyRXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnRzLnNldCh3b3Jrc3BhY2VGb2xkZXIudXJpLCBleHRlbnNpb25zQ29uZmlnQ29udGVudCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaXNXb3Jrc3BhY2VSZWNvbW1lbmRlZCA9IHdvcmtzcGFjZUV4dGVuc2lvbnNDb25maWdDb250ZW50ICYmIHdvcmtzcGFjZUV4dGVuc2lvbnNDb25maWdDb250ZW50LnJlY29tbWVuZGF0aW9ucz8uc29tZShyID0+IHIudG9Mb3dlckNhc2UoKSA9PT0gZXh0ZW5zaW9uSWQpO1xuXHRcdGNvbnN0IHJlY29tbWVuZGVkV29ya3NhcGNlRm9sZGVycyA9IHdvcmtzcGFjZS5mb2xkZXJzLmZpbHRlcih3b3Jrc3BhY2VGb2xkZXIgPT4gd29ya3NwYWNlRm9sZGVyRXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnRzLmdldCh3b3Jrc3BhY2VGb2xkZXIudXJpKT8ucmVjb21tZW5kYXRpb25zPy5zb21lKHIgPT4gci50b0xvd2VyQ2FzZSgpID09PSBleHRlbnNpb25JZCkpO1xuXHRcdGNvbnN0IGlzUmVjb21tZW5kZWQgPSBpc1dvcmtzcGFjZVJlY29tbWVuZGVkIHx8IHJlY29tbWVuZGVkV29ya3NhcGNlRm9sZGVycy5sZW5ndGggPiAwO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlT3JGb2xkZXJzID0gaXNSZWNvbW1lbmRlZFxuXHRcdFx0PyBhd2FpdCB0aGlzLnBpY2tXb3Jrc3BhY2VPckZvbGRlcnMocmVjb21tZW5kZWRXb3Jrc2FwY2VGb2xkZXJzLCBpc1dvcmtzcGFjZVJlY29tbWVuZGVkID8gd29ya3NwYWNlIDogdW5kZWZpbmVkLCBsb2NhbGl6ZSgnc2VsZWN0IGZvciByZW1vdmUnLCBcIlJlbW92ZSBleHRlbnNpb24gcmVjb21tZW5kYXRpb24gZnJvbVwiKSlcblx0XHRcdDogYXdhaXQgdGhpcy5waWNrV29ya3NwYWNlT3JGb2xkZXJzKHdvcmtzcGFjZS5mb2xkZXJzLCB3b3Jrc3BhY2UuY29uZmlndXJhdGlvbiA/IHdvcmtzcGFjZSA6IHVuZGVmaW5lZCwgbG9jYWxpemUoJ3NlbGVjdCBmb3IgYWRkJywgXCJBZGQgZXh0ZW5zaW9uIHJlY29tbWVuZGF0aW9uIHRvXCIpKTtcblxuXHRcdGZvciAoY29uc3Qgd29ya3NwYWNlT3JXb3Jrc3BhY2VGb2xkZXIgb2Ygd29ya3NwYWNlT3JGb2xkZXJzKSB7XG5cdFx0XHRpZiAoaXNXb3Jrc3BhY2Uod29ya3NwYWNlT3JXb3Jrc3BhY2VGb2xkZXIpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuYWRkT3JSZW1vdmVXb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbihleHRlbnNpb25JZCwgd29ya3NwYWNlT3JXb3Jrc3BhY2VGb2xkZXIsIHdvcmtzcGFjZUV4dGVuc2lvbnNDb25maWdDb250ZW50LCAhaXNSZWNvbW1lbmRlZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmFkZE9yUmVtb3ZlV29ya3NwYWNlRm9sZGVyUmVjb21tZW5kYXRpb24oZXh0ZW5zaW9uSWQsIHdvcmtzcGFjZU9yV29ya3NwYWNlRm9sZGVyLCB3b3Jrc3BhY2VGb2xkZXJFeHRlbnNpb25zQ29uZmlnQ29udGVudHMuZ2V0KHdvcmtzcGFjZU9yV29ya3NwYWNlRm9sZGVyLnVyaSkhLCAhaXNSZWNvbW1lbmRlZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgdG9nZ2xlVW53YW50ZWRSZWNvbW1lbmRhdGlvbihleHRlbnNpb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnQ29udGVudCA9IHdvcmtzcGFjZS5jb25maWd1cmF0aW9uID8gYXdhaXQgdGhpcy5yZXNvbHZlV29ya3NwYWNlRXh0ZW5zaW9uQ29uZmlnKHdvcmtzcGFjZS5jb25maWd1cmF0aW9uKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXJFeHRlbnNpb25zQ29uZmlnQ29udGVudHMgPSBuZXcgUmVzb3VyY2VNYXA8SUV4dGVuc2lvbnNDb25maWdDb250ZW50PigpO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKHdvcmtzcGFjZS5mb2xkZXJzLm1hcChhc3luYyB3b3Jrc3BhY2VGb2xkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQgPSBhd2FpdCB0aGlzLnJlc29sdmVXb3Jrc3BhY2VGb2xkZXJFeHRlbnNpb25Db25maWcod29ya3NwYWNlRm9sZGVyKTtcblx0XHRcdHdvcmtzcGFjZUZvbGRlckV4dGVuc2lvbnNDb25maWdDb250ZW50cy5zZXQod29ya3NwYWNlRm9sZGVyLnVyaSwgZXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGlzV29ya3NwYWNlVW53YW50ZWQgPSB3b3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnQ29udGVudCAmJiB3b3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnQ29udGVudC51bndhbnRlZFJlY29tbWVuZGF0aW9ucz8uc29tZShyID0+IHIgPT09IGV4dGVuc2lvbklkKTtcblx0XHRjb25zdCB1bldhbnRlZFdvcmtzYXBjZUZvbGRlcnMgPSB3b3Jrc3BhY2UuZm9sZGVycy5maWx0ZXIod29ya3NwYWNlRm9sZGVyID0+IHdvcmtzcGFjZUZvbGRlckV4dGVuc2lvbnNDb25maWdDb250ZW50cy5nZXQod29ya3NwYWNlRm9sZGVyLnVyaSk/LnVud2FudGVkUmVjb21tZW5kYXRpb25zPy5zb21lKHIgPT4gciA9PT0gZXh0ZW5zaW9uSWQpKTtcblx0XHRjb25zdCBpc1Vud2FudGVkID0gaXNXb3Jrc3BhY2VVbndhbnRlZCB8fCB1bldhbnRlZFdvcmtzYXBjZUZvbGRlcnMubGVuZ3RoID4gMDtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZU9yRm9sZGVycyA9IGlzVW53YW50ZWRcblx0XHRcdD8gYXdhaXQgdGhpcy5waWNrV29ya3NwYWNlT3JGb2xkZXJzKHVuV2FudGVkV29ya3NhcGNlRm9sZGVycywgaXNXb3Jrc3BhY2VVbndhbnRlZCA/IHdvcmtzcGFjZSA6IHVuZGVmaW5lZCwgbG9jYWxpemUoJ3NlbGVjdCBmb3IgcmVtb3ZlJywgXCJSZW1vdmUgZXh0ZW5zaW9uIHJlY29tbWVuZGF0aW9uIGZyb21cIikpXG5cdFx0XHQ6IGF3YWl0IHRoaXMucGlja1dvcmtzcGFjZU9yRm9sZGVycyh3b3Jrc3BhY2UuZm9sZGVycywgd29ya3NwYWNlLmNvbmZpZ3VyYXRpb24gPyB3b3Jrc3BhY2UgOiB1bmRlZmluZWQsIGxvY2FsaXplKCdzZWxlY3QgZm9yIGFkZCcsIFwiQWRkIGV4dGVuc2lvbiByZWNvbW1lbmRhdGlvbiB0b1wiKSk7XG5cblx0XHRmb3IgKGNvbnN0IHdvcmtzcGFjZU9yV29ya3NwYWNlRm9sZGVyIG9mIHdvcmtzcGFjZU9yRm9sZGVycykge1xuXHRcdFx0aWYgKGlzV29ya3NwYWNlKHdvcmtzcGFjZU9yV29ya3NwYWNlRm9sZGVyKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmFkZE9yUmVtb3ZlV29ya3NwYWNlVW53YW50ZWRSZWNvbW1lbmRhdGlvbihleHRlbnNpb25JZCwgd29ya3NwYWNlT3JXb3Jrc3BhY2VGb2xkZXIsIHdvcmtzcGFjZUV4dGVuc2lvbnNDb25maWdDb250ZW50LCAhaXNVbndhbnRlZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmFkZE9yUmVtb3ZlV29ya3NwYWNlRm9sZGVyVW53YW50ZWRSZWNvbW1lbmRhdGlvbihleHRlbnNpb25JZCwgd29ya3NwYWNlT3JXb3Jrc3BhY2VGb2xkZXIsIHdvcmtzcGFjZUZvbGRlckV4dGVuc2lvbnNDb25maWdDb250ZW50cy5nZXQod29ya3NwYWNlT3JXb3Jrc3BhY2VGb2xkZXIudXJpKSEsICFpc1Vud2FudGVkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFkZE9yUmVtb3ZlV29ya3NwYWNlRm9sZGVyUmVjb21tZW5kYXRpb24oZXh0ZW5zaW9uSWQ6IHN0cmluZywgd29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyLCBleHRlbnNpb25zQ29uZmlnQ29udGVudDogSUV4dGVuc2lvbnNDb25maWdDb250ZW50LCBhZGQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2YWx1ZXM6IElKU09OVmFsdWVbXSA9IFtdO1xuXHRcdGlmIChhZGQpIHtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KGV4dGVuc2lvbnNDb25maWdDb250ZW50LnJlY29tbWVuZGF0aW9ucykpIHtcblx0XHRcdFx0dmFsdWVzLnB1c2goeyBwYXRoOiBbJ3JlY29tbWVuZGF0aW9ucycsIC0xXSwgdmFsdWU6IGV4dGVuc2lvbklkIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dmFsdWVzLnB1c2goeyBwYXRoOiBbJ3JlY29tbWVuZGF0aW9ucyddLCB2YWx1ZTogW2V4dGVuc2lvbklkXSB9KTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHVud2FudGVkUmVjb21tZW5kYXRpb25FZGl0ID0gdGhpcy5nZXRFZGl0VG9SZW1vdmVWYWx1ZUZyb21BcnJheShbJ3Vud2FudGVkUmVjb21tZW5kYXRpb25zJ10sIGV4dGVuc2lvbnNDb25maWdDb250ZW50LnVud2FudGVkUmVjb21tZW5kYXRpb25zLCBleHRlbnNpb25JZCk7XG5cdFx0XHRpZiAodW53YW50ZWRSZWNvbW1lbmRhdGlvbkVkaXQpIHtcblx0XHRcdFx0dmFsdWVzLnB1c2godW53YW50ZWRSZWNvbW1lbmRhdGlvbkVkaXQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoZXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQucmVjb21tZW5kYXRpb25zKSB7XG5cdFx0XHRjb25zdCByZWNvbW1lbmRhdGlvbkVkaXQgPSB0aGlzLmdldEVkaXRUb1JlbW92ZVZhbHVlRnJvbUFycmF5KFsncmVjb21tZW5kYXRpb25zJ10sIGV4dGVuc2lvbnNDb25maWdDb250ZW50LnJlY29tbWVuZGF0aW9ucywgZXh0ZW5zaW9uSWQpO1xuXHRcdFx0aWYgKHJlY29tbWVuZGF0aW9uRWRpdCkge1xuXHRcdFx0XHR2YWx1ZXMucHVzaChyZWNvbW1lbmRhdGlvbkVkaXQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh2YWx1ZXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5qc29uRWRpdGluZ1NlcnZpY2Uud3JpdGUod29ya3NwYWNlRm9sZGVyLnRvUmVzb3VyY2UoRVhURU5TSU9OU19DT05GSUcpLCB2YWx1ZXMsIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYWRkT3JSZW1vdmVXb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbihleHRlbnNpb25JZDogc3RyaW5nLCB3b3Jrc3BhY2U6IElXb3Jrc3BhY2UsIGV4dGVuc2lvbnNDb25maWdDb250ZW50OiBJRXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQgfCB1bmRlZmluZWQsIGFkZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHZhbHVlczogSUpTT05WYWx1ZVtdID0gW107XG5cdFx0aWYgKGV4dGVuc2lvbnNDb25maWdDb250ZW50KSB7XG5cdFx0XHRpZiAoYWRkKSB7XG5cdFx0XHRcdGNvbnN0IHBhdGg6IEpTT05QYXRoID0gWydleHRlbnNpb25zJywgJ3JlY29tbWVuZGF0aW9ucyddO1xuXHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShleHRlbnNpb25zQ29uZmlnQ29udGVudC5yZWNvbW1lbmRhdGlvbnMpKSB7XG5cdFx0XHRcdFx0dmFsdWVzLnB1c2goeyBwYXRoOiBbLi4ucGF0aCwgLTFdLCB2YWx1ZTogZXh0ZW5zaW9uSWQgfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dmFsdWVzLnB1c2goeyBwYXRoLCB2YWx1ZTogW2V4dGVuc2lvbklkXSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCB1bndhbnRlZFJlY29tbWVuZGF0aW9uRWRpdCA9IHRoaXMuZ2V0RWRpdFRvUmVtb3ZlVmFsdWVGcm9tQXJyYXkoWydleHRlbnNpb25zJywgJ3Vud2FudGVkUmVjb21tZW5kYXRpb25zJ10sIGV4dGVuc2lvbnNDb25maWdDb250ZW50LnVud2FudGVkUmVjb21tZW5kYXRpb25zLCBleHRlbnNpb25JZCk7XG5cdFx0XHRcdGlmICh1bndhbnRlZFJlY29tbWVuZGF0aW9uRWRpdCkge1xuXHRcdFx0XHRcdHZhbHVlcy5wdXNoKHVud2FudGVkUmVjb21tZW5kYXRpb25FZGl0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChleHRlbnNpb25zQ29uZmlnQ29udGVudC5yZWNvbW1lbmRhdGlvbnMpIHtcblx0XHRcdFx0Y29uc3QgcmVjb21tZW5kYXRpb25FZGl0ID0gdGhpcy5nZXRFZGl0VG9SZW1vdmVWYWx1ZUZyb21BcnJheShbJ2V4dGVuc2lvbnMnLCAncmVjb21tZW5kYXRpb25zJ10sIGV4dGVuc2lvbnNDb25maWdDb250ZW50LnJlY29tbWVuZGF0aW9ucywgZXh0ZW5zaW9uSWQpO1xuXHRcdFx0XHRpZiAocmVjb21tZW5kYXRpb25FZGl0KSB7XG5cdFx0XHRcdFx0dmFsdWVzLnB1c2gocmVjb21tZW5kYXRpb25FZGl0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoYWRkKSB7XG5cdFx0XHR2YWx1ZXMucHVzaCh7IHBhdGg6IFsnZXh0ZW5zaW9ucyddLCB2YWx1ZTogeyByZWNvbW1lbmRhdGlvbnM6IFtleHRlbnNpb25JZF0gfSB9KTtcblx0XHR9XG5cblx0XHRpZiAodmFsdWVzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuanNvbkVkaXRpbmdTZXJ2aWNlLndyaXRlKHdvcmtzcGFjZS5jb25maWd1cmF0aW9uISwgdmFsdWVzLCB0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFkZE9yUmVtb3ZlV29ya3NwYWNlRm9sZGVyVW53YW50ZWRSZWNvbW1lbmRhdGlvbihleHRlbnNpb25JZDogc3RyaW5nLCB3b3Jrc3BhY2VGb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIsIGV4dGVuc2lvbnNDb25maWdDb250ZW50OiBJRXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQsIGFkZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHZhbHVlczogSUpTT05WYWx1ZVtdID0gW107XG5cdFx0aWYgKGFkZCkge1xuXHRcdFx0Y29uc3QgcGF0aDogSlNPTlBhdGggPSBbJ3Vud2FudGVkUmVjb21tZW5kYXRpb25zJ107XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShleHRlbnNpb25zQ29uZmlnQ29udGVudC51bndhbnRlZFJlY29tbWVuZGF0aW9ucykpIHtcblx0XHRcdFx0dmFsdWVzLnB1c2goeyBwYXRoOiBbLi4ucGF0aCwgLTFdLCB2YWx1ZTogZXh0ZW5zaW9uSWQgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR2YWx1ZXMucHVzaCh7IHBhdGgsIHZhbHVlOiBbZXh0ZW5zaW9uSWRdIH0pO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVjb21tZW5kYXRpb25FZGl0ID0gdGhpcy5nZXRFZGl0VG9SZW1vdmVWYWx1ZUZyb21BcnJheShbJ3JlY29tbWVuZGF0aW9ucyddLCBleHRlbnNpb25zQ29uZmlnQ29udGVudC5yZWNvbW1lbmRhdGlvbnMsIGV4dGVuc2lvbklkKTtcblx0XHRcdGlmIChyZWNvbW1lbmRhdGlvbkVkaXQpIHtcblx0XHRcdFx0dmFsdWVzLnB1c2gocmVjb21tZW5kYXRpb25FZGl0KTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGV4dGVuc2lvbnNDb25maWdDb250ZW50LnVud2FudGVkUmVjb21tZW5kYXRpb25zKSB7XG5cdFx0XHRjb25zdCB1bndhbnRlZFJlY29tbWVuZGF0aW9uRWRpdCA9IHRoaXMuZ2V0RWRpdFRvUmVtb3ZlVmFsdWVGcm9tQXJyYXkoWyd1bndhbnRlZFJlY29tbWVuZGF0aW9ucyddLCBleHRlbnNpb25zQ29uZmlnQ29udGVudC51bndhbnRlZFJlY29tbWVuZGF0aW9ucywgZXh0ZW5zaW9uSWQpO1xuXHRcdFx0aWYgKHVud2FudGVkUmVjb21tZW5kYXRpb25FZGl0KSB7XG5cdFx0XHRcdHZhbHVlcy5wdXNoKHVud2FudGVkUmVjb21tZW5kYXRpb25FZGl0KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHZhbHVlcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB0aGlzLmpzb25FZGl0aW5nU2VydmljZS53cml0ZSh3b3Jrc3BhY2VGb2xkZXIudG9SZXNvdXJjZShFWFRFTlNJT05TX0NPTkZJRyksIHZhbHVlcywgdHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhZGRPclJlbW92ZVdvcmtzcGFjZVVud2FudGVkUmVjb21tZW5kYXRpb24oZXh0ZW5zaW9uSWQ6IHN0cmluZywgd29ya3NwYWNlOiBJV29ya3NwYWNlLCBleHRlbnNpb25zQ29uZmlnQ29udGVudDogSUV4dGVuc2lvbnNDb25maWdDb250ZW50IHwgdW5kZWZpbmVkLCBhZGQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2YWx1ZXM6IElKU09OVmFsdWVbXSA9IFtdO1xuXHRcdGlmIChleHRlbnNpb25zQ29uZmlnQ29udGVudCkge1xuXHRcdFx0aWYgKGFkZCkge1xuXHRcdFx0XHRjb25zdCBwYXRoOiBKU09OUGF0aCA9IFsnZXh0ZW5zaW9ucycsICd1bndhbnRlZFJlY29tbWVuZGF0aW9ucyddO1xuXHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShleHRlbnNpb25zQ29uZmlnQ29udGVudC5yZWNvbW1lbmRhdGlvbnMpKSB7XG5cdFx0XHRcdFx0dmFsdWVzLnB1c2goeyBwYXRoOiBbLi4ucGF0aCwgLTFdLCB2YWx1ZTogZXh0ZW5zaW9uSWQgfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dmFsdWVzLnB1c2goeyBwYXRoLCB2YWx1ZTogW2V4dGVuc2lvbklkXSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCByZWNvbW1lbmRhdGlvbkVkaXQgPSB0aGlzLmdldEVkaXRUb1JlbW92ZVZhbHVlRnJvbUFycmF5KFsnZXh0ZW5zaW9ucycsICdyZWNvbW1lbmRhdGlvbnMnXSwgZXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQucmVjb21tZW5kYXRpb25zLCBleHRlbnNpb25JZCk7XG5cdFx0XHRcdGlmIChyZWNvbW1lbmRhdGlvbkVkaXQpIHtcblx0XHRcdFx0XHR2YWx1ZXMucHVzaChyZWNvbW1lbmRhdGlvbkVkaXQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGV4dGVuc2lvbnNDb25maWdDb250ZW50LnVud2FudGVkUmVjb21tZW5kYXRpb25zKSB7XG5cdFx0XHRcdGNvbnN0IHVud2FudGVkUmVjb21tZW5kYXRpb25FZGl0ID0gdGhpcy5nZXRFZGl0VG9SZW1vdmVWYWx1ZUZyb21BcnJheShbJ2V4dGVuc2lvbnMnLCAndW53YW50ZWRSZWNvbW1lbmRhdGlvbnMnXSwgZXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQudW53YW50ZWRSZWNvbW1lbmRhdGlvbnMsIGV4dGVuc2lvbklkKTtcblx0XHRcdFx0aWYgKHVud2FudGVkUmVjb21tZW5kYXRpb25FZGl0KSB7XG5cdFx0XHRcdFx0dmFsdWVzLnB1c2godW53YW50ZWRSZWNvbW1lbmRhdGlvbkVkaXQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChhZGQpIHtcblx0XHRcdHZhbHVlcy5wdXNoKHsgcGF0aDogWydleHRlbnNpb25zJ10sIHZhbHVlOiB7IHVud2FudGVkUmVjb21tZW5kYXRpb25zOiBbZXh0ZW5zaW9uSWRdIH0gfSk7XG5cdFx0fVxuXG5cdFx0aWYgKHZhbHVlcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB0aGlzLmpzb25FZGl0aW5nU2VydmljZS53cml0ZSh3b3Jrc3BhY2UuY29uZmlndXJhdGlvbiEsIHZhbHVlcywgdHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwaWNrV29ya3NwYWNlT3JGb2xkZXJzKHdvcmtzcGFjZUZvbGRlcnM6IElXb3Jrc3BhY2VGb2xkZXJbXSwgd29ya3NwYWNlOiBJV29ya3NwYWNlIHwgdW5kZWZpbmVkLCBwbGFjZUhvbGRlcjogc3RyaW5nKTogUHJvbWlzZTwoSVdvcmtzcGFjZSB8IElXb3Jrc3BhY2VGb2xkZXIpW10+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VPckZvbGRlcnMgPSB3b3Jrc3BhY2UgPyBbLi4ud29ya3NwYWNlRm9sZGVycywgd29ya3NwYWNlXSA6IFsuLi53b3Jrc3BhY2VGb2xkZXJzXTtcblx0XHRpZiAod29ya3NwYWNlT3JGb2xkZXJzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIHdvcmtzcGFjZU9yRm9sZGVycztcblx0XHR9XG5cblx0XHRjb25zdCBmb2xkZXJQaWNrczogKElRdWlja1BpY2tJdGVtICYgeyB3b3Jrc3BhY2VPckZvbGRlcjogSVdvcmtzcGFjZSB8IElXb3Jrc3BhY2VGb2xkZXIgfSB8IElRdWlja1BpY2tTZXBhcmF0b3IpW10gPSB3b3Jrc3BhY2VGb2xkZXJzLm1hcCh3b3Jrc3BhY2VGb2xkZXIgPT4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGFiZWw6IHdvcmtzcGFjZUZvbGRlci5uYW1lLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dvcmtzcGFjZSBmb2xkZXInLCBcIldvcmtzcGFjZSBGb2xkZXJcIiksXG5cdFx0XHRcdHdvcmtzcGFjZU9yRm9sZGVyOiB3b3Jrc3BhY2VGb2xkZXIsXG5cdFx0XHRcdGljb25DbGFzc2VzOiBnZXRJY29uQ2xhc3Nlcyh0aGlzLm1vZGVsU2VydmljZSwgdGhpcy5sYW5ndWFnZVNlcnZpY2UsIHdvcmtzcGFjZUZvbGRlci51cmksIEZpbGVLaW5kLlJPT1RfRk9MREVSKVxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdGlmICh3b3Jrc3BhY2UpIHtcblx0XHRcdGZvbGRlclBpY2tzLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJyB9KTtcblx0XHRcdGZvbGRlclBpY2tzLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3dvcmtzcGFjZScsIFwiV29ya3NwYWNlXCIpLFxuXHRcdFx0XHR3b3Jrc3BhY2VPckZvbGRlcjogd29ya3NwYWNlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5xdWlja0lucHV0U2VydmljZS5waWNrKGZvbGRlclBpY2tzLCB7IHBsYWNlSG9sZGVyLCBjYW5QaWNrTWFueTogdHJ1ZSB9KSB8fCBbXTtcblx0XHRyZXR1cm4gcmVzdWx0Lm1hcChyID0+IHIud29ya3NwYWNlT3JGb2xkZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXNvbHZlV29ya3NwYWNlRXh0ZW5zaW9uQ29uZmlnKHdvcmtzcGFjZUNvbmZpZ3VyYXRpb25SZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJRXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQgfCB1bmRlZmluZWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUod29ya3NwYWNlQ29uZmlndXJhdGlvblJlc291cmNlKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbnNDb25maWdDb250ZW50ID0gPElFeHRlbnNpb25zQ29uZmlnQ29udGVudCB8IHVuZGVmaW5lZD5wYXJzZShjb250ZW50LnZhbHVlLnRvU3RyaW5nKCkpWydleHRlbnNpb25zJ107XG5cdFx0XHRyZXR1cm4gZXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQgPyB0aGlzLnBhcnNlRXh0ZW5zaW9uQ29uZmlnKGV4dGVuc2lvbnNDb25maWdDb250ZW50KSA6IHVuZGVmaW5lZDtcblx0XHR9IGNhdGNoIChlKSB7IC8qIElnbm9yZSAqLyB9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZVdvcmtzcGFjZUZvbGRlckV4dGVuc2lvbkNvbmZpZyh3b3Jrc3BhY2VGb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIpOiBQcm9taXNlPElFeHRlbnNpb25zQ29uZmlnQ29udGVudD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZSh3b3Jrc3BhY2VGb2xkZXIudG9SZXNvdXJjZShFWFRFTlNJT05TX0NPTkZJRykpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQgPSA8SUV4dGVuc2lvbnNDb25maWdDb250ZW50PnBhcnNlKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0XHRyZXR1cm4gdGhpcy5wYXJzZUV4dGVuc2lvbkNvbmZpZyhleHRlbnNpb25zQ29uZmlnQ29udGVudCk7XG5cdFx0fSBjYXRjaCAoZSkgeyAvKiBpZ25vcmUgKi8gfVxuXHRcdHJldHVybiB7fTtcblx0fVxuXG5cdHByaXZhdGUgcGFyc2VFeHRlbnNpb25Db25maWcoZXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQ6IElFeHRlbnNpb25zQ29uZmlnQ29udGVudCk6IElFeHRlbnNpb25zQ29uZmlnQ29udGVudCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlY29tbWVuZGF0aW9uczogZGlzdGluY3QoKGV4dGVuc2lvbnNDb25maWdDb250ZW50LnJlY29tbWVuZGF0aW9ucyB8fCBbXSkubWFwKGUgPT4gZS50b0xvd2VyQ2FzZSgpKSksXG5cdFx0XHR1bndhbnRlZFJlY29tbWVuZGF0aW9uczogZGlzdGluY3QoKGV4dGVuc2lvbnNDb25maWdDb250ZW50LnVud2FudGVkUmVjb21tZW5kYXRpb25zIHx8IFtdKS5tYXAoZSA9PiBlLnRvTG93ZXJDYXNlKCkpKVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGdldEVkaXRUb1JlbW92ZVZhbHVlRnJvbUFycmF5KHBhdGg6IEpTT05QYXRoLCBhcnJheTogc3RyaW5nW10gfCB1bmRlZmluZWQsIHZhbHVlOiBzdHJpbmcpOiBJSlNPTlZhbHVlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBpbmRleCA9IGFycmF5Py5pbmRleE9mKHZhbHVlKTtcblx0XHRpZiAoaW5kZXggIT09IHVuZGVmaW5lZCAmJiBpbmRleCAhPT0gLTEpIHtcblx0XHRcdHJldHVybiB7IHBhdGg6IFsuLi5wYXRoLCBpbmRleF0sIHZhbHVlOiB1bmRlZmluZWQgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElXb3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnU2VydmljZSwgV29ya3NwYWNlRXh0ZW5zaW9uc0NvbmZpZ1NlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQXNCO0FBQy9CLFNBQW1CLGFBQWE7QUFDaEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxVQUFVLG9CQUFvQjtBQUN2QyxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxhQUF5QixnQ0FBa0Q7QUFDcEYsU0FBUywwQkFBK0Q7QUFDeEUsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUywyQkFBdUM7QUFDaEQsU0FBUyxtQkFBbUI7QUFFckIsTUFBTSxvQkFBb0I7QUFPMUIsTUFB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
