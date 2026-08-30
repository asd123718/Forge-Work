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
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { getExcludes, ISearchService, QueryType, VIEW_ID } from "../../../services/search/common/search.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { IChatContextPickService, picksWithPromiseFn } from "../../chat/browser/attachments/chatContextPickService.js";
import { SearchContext } from "../common/constants.js";
import { SearchView } from "./searchView.js";
import { basename, dirname, joinPath, relativePath } from "../../../../base/common/resources.js";
import { compare } from "../../../../base/common/strings.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { getIconClasses } from "../../../../editor/common/services/getIconClasses.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { FileKind, FileType, IFileService } from "../../../../platform/files/common/files.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IHistoryService } from "../../../services/history/common/history.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import * as glob from "../../../../base/common/glob.js";
import { ResourceSet } from "../../../../base/common/map.js";
import { SymbolsQuickAccessProvider } from "./symbolsQuickAccess.js";
import { SymbolKinds } from "../../../../editor/common/languages.js";
import { isSupportedChatFileScheme } from "../../chat/common/constants.js";
let SearchChatContextContribution = class extends Disposable {
  constructor(instantiationService, chatContextPickService) {
    super();
    this._store.add(chatContextPickService.registerChatContextItem(instantiationService.createInstance(SearchViewResultChatContextPick)));
    this._store.add(chatContextPickService.registerChatContextItem(instantiationService.createInstance(FilesAndFoldersPickerPick)));
    this._store.add(chatContextPickService.registerChatContextItem(this._store.add(instantiationService.createInstance(SymbolsContextPickerPick))));
  }
};
SearchChatContextContribution.ID = "workbench.contributions.searchChatContextContribution";
SearchChatContextContribution = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IChatContextPickService)
], SearchChatContextContribution);
let SearchViewResultChatContextPick = class {
  constructor(_contextKeyService, _viewsService, _labelService) {
    this._contextKeyService = _contextKeyService;
    this._viewsService = _viewsService;
    this._labelService = _labelService;
    this.type = "valuePick";
    this.label = localize("chatContext.searchResults", "Search Results");
    this.icon = Codicon.search;
    this.ordinal = 500;
  }
  isEnabled(widget) {
    return !!SearchContext.HasSearchResults.getValue(this._contextKeyService) && !!widget.attachmentCapabilities.supportsSearchResultAttachments;
  }
  async asAttachment() {
    const searchView = this._viewsService.getViewWithId(VIEW_ID);
    if (!(searchView instanceof SearchView)) {
      return [];
    }
    return searchView.model.searchResult.matches().map((result) => ({
      kind: "file",
      id: result.resource.toString(),
      value: result.resource,
      name: this._labelService.getUriBasenameLabel(result.resource)
    }));
  }
};
SearchViewResultChatContextPick = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IViewsService),
  __decorateParam(2, ILabelService)
], SearchViewResultChatContextPick);
let SymbolsContextPickerPick = class {
  constructor(_instantiationService) {
    this._instantiationService = _instantiationService;
    this.type = "pickerPick";
    this.label = localize("symbols", "Symbols...");
    this.icon = Codicon.symbolField;
    this.ordinal = -200;
  }
  dispose() {
    this._provider?.dispose();
  }
  isEnabled(widget) {
    return !!widget.attachmentCapabilities.supportsSymbolAttachments;
  }
  asPicker() {
    return {
      placeholder: localize("select.symb", "Select a symbol"),
      picks: picksWithPromiseFn((query, token) => {
        this._provider ??= this._instantiationService.createInstance(SymbolsQuickAccessProvider);
        return this._provider.getSymbolPicks(query, void 0, token).then((symbolItems) => {
          const result = [];
          for (const item of symbolItems) {
            if (!item.symbol) {
              continue;
            }
            const attachment = {
              kind: "symbol",
              id: JSON.stringify(item.symbol.location),
              value: item.symbol.location,
              symbolKind: item.symbol.kind,
              icon: SymbolKinds.toIcon(item.symbol.kind),
              fullName: item.label,
              name: item.symbol.name
            };
            result.push({
              label: item.symbol.name,
              iconClass: ThemeIcon.asClassName(SymbolKinds.toIcon(item.symbol.kind)),
              asAttachment() {
                return attachment;
              }
            });
          }
          return result;
        });
      })
    };
  }
};
SymbolsContextPickerPick = __decorateClass([
  __decorateParam(0, IInstantiationService)
], SymbolsContextPickerPick);
let FilesAndFoldersPickerPick = class {
  constructor(_searchService, _labelService, _modelService, _languageService, _configurationService, _workspaceService, _fileService, _historyService, _instantiationService) {
    this._searchService = _searchService;
    this._labelService = _labelService;
    this._modelService = _modelService;
    this._languageService = _languageService;
    this._configurationService = _configurationService;
    this._workspaceService = _workspaceService;
    this._fileService = _fileService;
    this._historyService = _historyService;
    this._instantiationService = _instantiationService;
    this.type = "pickerPick";
    this.label = localize("chatContext.folder", "Files & Folders...");
    this.icon = Codicon.folder;
    this.ordinal = 600;
  }
  asPicker() {
    return {
      placeholder: localize("chatContext.attach.files.placeholder", "Search file or folder by name"),
      picks: picksWithPromiseFn(async (value, token) => {
        const workspaces = this._workspaceService.getWorkspace().folders.map((folder) => folder.uri);
        const defaultItems = [];
        (await getTopLevelFolders(workspaces, this._fileService)).forEach((uri) => defaultItems.push(this._createPickItem(uri, FileKind.FOLDER)));
        this._historyService.getHistory().filter((a) => a.resource && this._instantiationService.invokeFunction((accessor) => isSupportedChatFileScheme(accessor, a.resource.scheme))).slice(0, 30).forEach((uri) => defaultItems.push(this._createPickItem(uri.resource, FileKind.FILE)));
        if (value === "") {
          return defaultItems;
        }
        const result = [];
        await Promise.all(workspaces.map(async (workspace) => {
          const { folders, files } = await searchFilesAndFolders(
            workspace,
            value,
            true,
            token,
            void 0,
            this._configurationService,
            this._searchService
          );
          for (const folder of folders) {
            result.push(this._createPickItem(folder, FileKind.FOLDER));
          }
          for (const file of files) {
            result.push(this._createPickItem(file, FileKind.FILE));
          }
        }));
        result.sort((a, b) => compare(a.label, b.label));
        return result;
      })
    };
  }
  _createPickItem(resource, kind) {
    return {
      label: basename(resource),
      description: this._labelService.getUriLabel(dirname(resource), { relative: true }),
      iconClasses: getIconClasses(this._modelService, this._languageService, resource, kind),
      asAttachment: () => {
        return {
          kind: kind === FileKind.FILE ? "file" : "directory",
          id: resource.toString(),
          value: resource,
          name: basename(resource)
        };
      }
    };
  }
};
FilesAndFoldersPickerPick = __decorateClass([
  __decorateParam(0, ISearchService),
  __decorateParam(1, ILabelService),
  __decorateParam(2, IModelService),
  __decorateParam(3, ILanguageService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, IFileService),
  __decorateParam(7, IHistoryService),
  __decorateParam(8, IInstantiationService)
], FilesAndFoldersPickerPick);
async function searchFilesAndFolders(workspace, pattern, fuzzyMatch, token, cacheKey, configurationService, searchService) {
  const segmentMatchPattern = fuzzyMatch ? fuzzyMatchingGlobPattern(pattern) : continousMatchingGlobPattern(pattern);
  const searchExcludePattern = getExcludes(configurationService.getValue({ resource: workspace })) || {};
  const searchOptions = {
    folderQueries: [{
      folder: workspace,
      disregardIgnoreFiles: configurationService.getValue("explorer.excludeGitIgnore")
    }],
    type: QueryType.File,
    shouldGlobMatchFilePattern: true,
    cacheKey,
    excludePattern: searchExcludePattern,
    sortByScore: true,
    ignoreGlobCase: true
  };
  let searchResult;
  try {
    searchResult = await searchService.fileSearch({ ...searchOptions, filePattern: `{**/${segmentMatchPattern}/**,**/${segmentMatchPattern}}` }, token);
  } catch (e) {
    if (!isCancellationError(e)) {
      throw e;
    }
  }
  if (!searchResult || token?.isCancellationRequested) {
    return { files: [], folders: [] };
  }
  const fileResources = searchResult.results.map((result) => result.resource);
  const folderResources = getMatchingFoldersFromFiles(fileResources, workspace, segmentMatchPattern);
  return { folders: folderResources, files: fileResources };
}
function fuzzyMatchingGlobPattern(pattern) {
  if (!pattern) {
    return "*";
  }
  return "*" + pattern.split("").join("*") + "*";
}
function continousMatchingGlobPattern(pattern) {
  if (!pattern) {
    return "*";
  }
  return "*" + pattern + "*";
}
function getMatchingFoldersFromFiles(resources, workspace, segmentMatchPattern) {
  const uniqueFolders = new ResourceSet();
  for (const resource of resources) {
    const relativePathToRoot = relativePath(workspace, resource);
    if (!relativePathToRoot) {
      throw new Error("Resource is not a child of the workspace");
    }
    let dirResource = workspace;
    const stats = relativePathToRoot.split("/").slice(0, -1);
    for (const stat of stats) {
      dirResource = dirResource.with({ path: `${dirResource.path}/${stat}` });
      uniqueFolders.add(dirResource);
    }
  }
  const matchingFolders = [];
  for (const folderResource of uniqueFolders) {
    const stats = folderResource.path.split("/");
    const dirStat = stats[stats.length - 1];
    if (!dirStat || !glob.match(segmentMatchPattern, dirStat, { ignoreCase: true })) {
      continue;
    }
    matchingFolders.push(folderResource);
  }
  return matchingFolders;
}
async function getTopLevelFolders(workspaces, fileService) {
  const folders = [];
  for (const workspace of workspaces) {
    const fileSystemProvider = fileService.getProvider(workspace.scheme);
    if (!fileSystemProvider) {
      continue;
    }
    const entries = await fileSystemProvider.readdir(workspace);
    for (const [name, type] of entries) {
      const entryResource = joinPath(workspace, name);
      if (type === FileType.Directory) {
        folders.push(entryResource);
      }
    }
  }
  return folders;
}
export {
  SearchChatContextContribution,
  getTopLevelFolders,
  searchFilesAndFolders
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNlYXJjaFxcYnJvd3Nlclxcc2VhcmNoQ2hhdENvbnRleHQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IGdldEV4Y2x1ZGVzLCBJRmlsZVF1ZXJ5LCBJU2VhcmNoQ29tcGxldGUsIElTZWFyY2hDb25maWd1cmF0aW9uLCBJU2VhcmNoU2VydmljZSwgUXVlcnlUeXBlLCBWSUVXX0lEIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZXh0UGlja2VySXRlbSwgSUNoYXRDb250ZXh0UGlja2VyUGlja0l0ZW0sIElDaGF0Q29udGV4dFBpY2tTZXJ2aWNlLCBJQ2hhdENvbnRleHRWYWx1ZUl0ZW0sIHBpY2tzV2l0aFByb21pc2VGbiB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9hdHRhY2htZW50cy9jaGF0Q29udGV4dFBpY2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIElTeW1ib2xWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBTZWFyY2hDb250ZXh0IH0gZnJvbSAnLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBTZWFyY2hWaWV3IH0gZnJvbSAnLi9zZWFyY2hWaWV3LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lLCBqb2luUGF0aCwgcmVsYXRpdmVQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGNvbXBhcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgZ2V0SWNvbkNsYXNzZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2dldEljb25DbGFzc2VzLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRmlsZUtpbmQsIEZpbGVUeXBlLCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSUhpc3RvcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaGlzdG9yeS9jb21tb24vaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCAqIGFzIGdsb2IgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZ2xvYi5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBTeW1ib2xzUXVpY2tBY2Nlc3NQcm92aWRlciB9IGZyb20gJy4vc3ltYm9sc1F1aWNrQWNjZXNzLmpzJztcbmltcG9ydCB7IFN5bWJvbEtpbmRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgaXNTdXBwb3J0ZWRDaGF0RmlsZVNjaGVtZSB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldCB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcblxuZXhwb3J0IGNsYXNzIFNlYXJjaENoYXRDb250ZXh0Q29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYnV0aW9ucy5zZWFyY2hDaGF0Q29udGV4dENvbnRyaWJ1dGlvbic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ2hhdENvbnRleHRQaWNrU2VydmljZSBjaGF0Q29udGV4dFBpY2tTZXJ2aWNlOiBJQ2hhdENvbnRleHRQaWNrU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChjaGF0Q29udGV4dFBpY2tTZXJ2aWNlLnJlZ2lzdGVyQ2hhdENvbnRleHRJdGVtKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlYXJjaFZpZXdSZXN1bHRDaGF0Q29udGV4dFBpY2spKSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKGNoYXRDb250ZXh0UGlja1NlcnZpY2UucmVnaXN0ZXJDaGF0Q29udGV4dEl0ZW0oaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZXNBbmRGb2xkZXJzUGlja2VyUGljaykpKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQoY2hhdENvbnRleHRQaWNrU2VydmljZS5yZWdpc3RlckNoYXRDb250ZXh0SXRlbSh0aGlzLl9zdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3ltYm9sc0NvbnRleHRQaWNrZXJQaWNrKSkpKTtcblx0fVxufVxuXG5jbGFzcyBTZWFyY2hWaWV3UmVzdWx0Q2hhdENvbnRleHRQaWNrIGltcGxlbWVudHMgSUNoYXRDb250ZXh0VmFsdWVJdGVtIHtcblxuXHRyZWFkb25seSB0eXBlID0gJ3ZhbHVlUGljayc7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmcgPSBsb2NhbGl6ZSgnY2hhdENvbnRleHQuc2VhcmNoUmVzdWx0cycsICdTZWFyY2ggUmVzdWx0cycpO1xuXHRyZWFkb25seSBpY29uOiBUaGVtZUljb24gPSBDb2RpY29uLnNlYXJjaDtcblx0cmVhZG9ubHkgb3JkaW5hbCA9IDUwMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElWaWV3c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdmlld3NTZXJ2aWNlOiBJVmlld3NTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0KSB7IH1cblxuXHRpc0VuYWJsZWQod2lkZ2V0OiBJQ2hhdFdpZGdldCk6IFByb21pc2U8Ym9vbGVhbj4gfCBib29sZWFuIHtcblx0XHRyZXR1cm4gISFTZWFyY2hDb250ZXh0Lkhhc1NlYXJjaFJlc3VsdHMuZ2V0VmFsdWUodGhpcy5fY29udGV4dEtleVNlcnZpY2UpICYmICEhd2lkZ2V0LmF0dGFjaG1lbnRDYXBhYmlsaXRpZXMuc3VwcG9ydHNTZWFyY2hSZXN1bHRBdHRhY2htZW50cztcblx0fVxuXG5cdGFzeW5jIGFzQXR0YWNobWVudCgpOiBQcm9taXNlPElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXT4ge1xuXHRcdGNvbnN0IHNlYXJjaFZpZXcgPSB0aGlzLl92aWV3c1NlcnZpY2UuZ2V0Vmlld1dpdGhJZChWSUVXX0lEKTtcblx0XHRpZiAoIShzZWFyY2hWaWV3IGluc3RhbmNlb2YgU2VhcmNoVmlldykpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc2VhcmNoVmlldy5tb2RlbC5zZWFyY2hSZXN1bHQubWF0Y2hlcygpLm1hcChyZXN1bHQgPT4gKHtcblx0XHRcdGtpbmQ6ICdmaWxlJyxcblx0XHRcdGlkOiByZXN1bHQucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdHZhbHVlOiByZXN1bHQucmVzb3VyY2UsXG5cdFx0XHRuYW1lOiB0aGlzLl9sYWJlbFNlcnZpY2UuZ2V0VXJpQmFzZW5hbWVMYWJlbChyZXN1bHQucmVzb3VyY2UpLFxuXHRcdH0pKTtcblx0fVxufVxuXG5jbGFzcyBTeW1ib2xzQ29udGV4dFBpY2tlclBpY2sgaW1wbGVtZW50cyBJQ2hhdENvbnRleHRQaWNrZXJJdGVtIHtcblxuXHRyZWFkb25seSB0eXBlID0gJ3BpY2tlclBpY2snO1xuXG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmcgPSBsb2NhbGl6ZSgnc3ltYm9scycsICdTeW1ib2xzLi4uJyk7XG5cdHJlYWRvbmx5IGljb246IFRoZW1lSWNvbiA9IENvZGljb24uc3ltYm9sRmllbGQ7XG5cdHJlYWRvbmx5IG9yZGluYWwgPSAtMjAwO1xuXG5cdHByaXZhdGUgX3Byb3ZpZGVyOiBTeW1ib2xzUXVpY2tBY2Nlc3NQcm92aWRlciB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkgeyB9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9wcm92aWRlcj8uZGlzcG9zZSgpO1xuXHR9XG5cblx0aXNFbmFibGVkKHdpZGdldDogSUNoYXRXaWRnZXQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF3aWRnZXQuYXR0YWNobWVudENhcGFiaWxpdGllcy5zdXBwb3J0c1N5bWJvbEF0dGFjaG1lbnRzO1xuXHR9XG5cdGFzUGlja2VyKCkge1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnc2VsZWN0LnN5bWInLCBcIlNlbGVjdCBhIHN5bWJvbFwiKSxcblx0XHRcdHBpY2tzOiBwaWNrc1dpdGhQcm9taXNlRm4oKHF1ZXJ5OiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXG5cdFx0XHRcdHRoaXMuX3Byb3ZpZGVyID8/PSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTeW1ib2xzUXVpY2tBY2Nlc3NQcm92aWRlcik7XG5cblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb3ZpZGVyLmdldFN5bWJvbFBpY2tzKHF1ZXJ5LCB1bmRlZmluZWQsIHRva2VuKS50aGVuKHN5bWJvbEl0ZW1zID0+IHtcblx0XHRcdFx0XHRjb25zdCByZXN1bHQ6IElDaGF0Q29udGV4dFBpY2tlclBpY2tJdGVtW10gPSBbXTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2Ygc3ltYm9sSXRlbXMpIHtcblx0XHRcdFx0XHRcdGlmICghaXRlbS5zeW1ib2wpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGNvbnN0IGF0dGFjaG1lbnQ6IElTeW1ib2xWYXJpYWJsZUVudHJ5ID0ge1xuXHRcdFx0XHRcdFx0XHRraW5kOiAnc3ltYm9sJyxcblx0XHRcdFx0XHRcdFx0aWQ6IEpTT04uc3RyaW5naWZ5KGl0ZW0uc3ltYm9sLmxvY2F0aW9uKSxcblx0XHRcdFx0XHRcdFx0dmFsdWU6IGl0ZW0uc3ltYm9sLmxvY2F0aW9uLFxuXHRcdFx0XHRcdFx0XHRzeW1ib2xLaW5kOiBpdGVtLnN5bWJvbC5raW5kLFxuXHRcdFx0XHRcdFx0XHRpY29uOiBTeW1ib2xLaW5kcy50b0ljb24oaXRlbS5zeW1ib2wua2luZCksXG5cdFx0XHRcdFx0XHRcdGZ1bGxOYW1lOiBpdGVtLmxhYmVsLFxuXHRcdFx0XHRcdFx0XHRuYW1lOiBpdGVtLnN5bWJvbC5uYW1lLFxuXHRcdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRcdFx0XHRsYWJlbDogaXRlbS5zeW1ib2wubmFtZSxcblx0XHRcdFx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoU3ltYm9sS2luZHMudG9JY29uKGl0ZW0uc3ltYm9sLmtpbmQpKSxcblx0XHRcdFx0XHRcdFx0YXNBdHRhY2htZW50KCkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBhdHRhY2htZW50O1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KSxcblx0XHR9O1xuXHR9XG59XG5cbmNsYXNzIEZpbGVzQW5kRm9sZGVyc1BpY2tlclBpY2sgaW1wbGVtZW50cyBJQ2hhdENvbnRleHRQaWNrZXJJdGVtIHtcblxuXHRyZWFkb25seSB0eXBlID0gJ3BpY2tlclBpY2snO1xuXHRyZWFkb25seSBsYWJlbCA9IGxvY2FsaXplKCdjaGF0Q29udGV4dC5mb2xkZXInLCAnRmlsZXMgJiBGb2xkZXJzLi4uJyk7XG5cdHJlYWRvbmx5IGljb24gPSBDb2RpY29uLmZvbGRlcjtcblx0cmVhZG9ubHkgb3JkaW5hbCA9IDYwMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVNlYXJjaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2VhcmNoU2VydmljZTogSVNlYXJjaFNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlU2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUhpc3RvcnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2hpc3RvcnlTZXJ2aWNlOiBJSGlzdG9yeVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFzUGlja2VyKCkge1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnY2hhdENvbnRleHQuYXR0YWNoLmZpbGVzLnBsYWNlaG9sZGVyJywgXCJTZWFyY2ggZmlsZSBvciBmb2xkZXIgYnkgbmFtZVwiKSxcblx0XHRcdHBpY2tzOiBwaWNrc1dpdGhQcm9taXNlRm4oYXN5bmMgKHZhbHVlLCB0b2tlbikgPT4ge1xuXG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZXMgPSB0aGlzLl93b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMubWFwKGZvbGRlciA9PiBmb2xkZXIudXJpKTtcblxuXHRcdFx0XHRjb25zdCBkZWZhdWx0SXRlbXM6IElDaGF0Q29udGV4dFBpY2tlclBpY2tJdGVtW10gPSBbXTtcblx0XHRcdFx0KGF3YWl0IGdldFRvcExldmVsRm9sZGVycyh3b3Jrc3BhY2VzLCB0aGlzLl9maWxlU2VydmljZSkpLmZvckVhY2godXJpID0+IGRlZmF1bHRJdGVtcy5wdXNoKHRoaXMuX2NyZWF0ZVBpY2tJdGVtKHVyaSwgRmlsZUtpbmQuRk9MREVSKSkpO1xuXHRcdFx0XHR0aGlzLl9oaXN0b3J5U2VydmljZS5nZXRIaXN0b3J5KClcblx0XHRcdFx0XHQuZmlsdGVyKGEgPT4gYS5yZXNvdXJjZSAmJiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBpc1N1cHBvcnRlZENoYXRGaWxlU2NoZW1lKGFjY2Vzc29yLCBhLnJlc291cmNlIS5zY2hlbWUpKSlcblx0XHRcdFx0XHQuc2xpY2UoMCwgMzApXG5cdFx0XHRcdFx0LmZvckVhY2godXJpID0+IGRlZmF1bHRJdGVtcy5wdXNoKHRoaXMuX2NyZWF0ZVBpY2tJdGVtKHVyaS5yZXNvdXJjZSEsIEZpbGVLaW5kLkZJTEUpKSk7XG5cblx0XHRcdFx0aWYgKHZhbHVlID09PSAnJykge1xuXHRcdFx0XHRcdHJldHVybiBkZWZhdWx0SXRlbXM7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByZXN1bHQ6IElDaGF0Q29udGV4dFBpY2tlclBpY2tJdGVtW10gPSBbXTtcblxuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbCh3b3Jrc3BhY2VzLm1hcChhc3luYyB3b3Jrc3BhY2UgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHsgZm9sZGVycywgZmlsZXMgfSA9IGF3YWl0IHNlYXJjaEZpbGVzQW5kRm9sZGVycyhcblx0XHRcdFx0XHRcdHdvcmtzcGFjZSxcblx0XHRcdFx0XHRcdHZhbHVlLFxuXHRcdFx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0XHRcdHRva2VuLFxuXHRcdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRcdFx0XHR0aGlzLl9zZWFyY2hTZXJ2aWNlXG5cdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdGZvciAoY29uc3QgZm9sZGVyIG9mIGZvbGRlcnMpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKHRoaXMuX2NyZWF0ZVBpY2tJdGVtKGZvbGRlciwgRmlsZUtpbmQuRk9MREVSKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2godGhpcy5fY3JlYXRlUGlja0l0ZW0oZmlsZSwgRmlsZUtpbmQuRklMRSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdHJlc3VsdC5zb3J0KChhLCBiKSA9PiBjb21wYXJlKGEubGFiZWwsIGIubGFiZWwpKTtcblxuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fSksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVBpY2tJdGVtKHJlc291cmNlOiBVUkksIGtpbmQ6IEZpbGVLaW5kKTogSUNoYXRDb250ZXh0UGlja2VyUGlja0l0ZW0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRsYWJlbDogYmFzZW5hbWUocmVzb3VyY2UpLFxuXHRcdFx0ZGVzY3JpcHRpb246IHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbChkaXJuYW1lKHJlc291cmNlKSwgeyByZWxhdGl2ZTogdHJ1ZSB9KSxcblx0XHRcdGljb25DbGFzc2VzOiBnZXRJY29uQ2xhc3Nlcyh0aGlzLl9tb2RlbFNlcnZpY2UsIHRoaXMuX2xhbmd1YWdlU2VydmljZSwgcmVzb3VyY2UsIGtpbmQpLFxuXHRcdFx0YXNBdHRhY2htZW50OiAoKSA9PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0a2luZDoga2luZCA9PT0gRmlsZUtpbmQuRklMRSA/ICdmaWxlJyA6ICdkaXJlY3RvcnknLFxuXHRcdFx0XHRcdGlkOiByZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRcdHZhbHVlOiByZXNvdXJjZSxcblx0XHRcdFx0XHRuYW1lOiBiYXNlbmFtZShyZXNvdXJjZSksXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG59XG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2VhcmNoRmlsZXNBbmRGb2xkZXJzKFxuXHR3b3Jrc3BhY2U6IFVSSSxcblx0cGF0dGVybjogc3RyaW5nLFxuXHRmdXp6eU1hdGNoOiBib29sZWFuLFxuXHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gfCB1bmRlZmluZWQsXG5cdGNhY2hlS2V5OiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdHNlYXJjaFNlcnZpY2U6IElTZWFyY2hTZXJ2aWNlXG4pOiBQcm9taXNlPHsgZm9sZGVyczogVVJJW107IGZpbGVzOiBVUklbXSB9PiB7XG5cdGNvbnN0IHNlZ21lbnRNYXRjaFBhdHRlcm4gPSBmdXp6eU1hdGNoID8gZnV6enlNYXRjaGluZ0dsb2JQYXR0ZXJuKHBhdHRlcm4pIDogY29udGlub3VzTWF0Y2hpbmdHbG9iUGF0dGVybihwYXR0ZXJuKTtcblxuXHRjb25zdCBzZWFyY2hFeGNsdWRlUGF0dGVybiA9IGdldEV4Y2x1ZGVzKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElTZWFyY2hDb25maWd1cmF0aW9uPih7IHJlc291cmNlOiB3b3Jrc3BhY2UgfSkpIHx8IHt9O1xuXHRjb25zdCBzZWFyY2hPcHRpb25zOiBJRmlsZVF1ZXJ5ID0ge1xuXHRcdGZvbGRlclF1ZXJpZXM6IFt7XG5cdFx0XHRmb2xkZXI6IHdvcmtzcGFjZSxcblx0XHRcdGRpc3JlZ2FyZElnbm9yZUZpbGVzOiBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignZXhwbG9yZXIuZXhjbHVkZUdpdElnbm9yZScpLFxuXHRcdH1dLFxuXHRcdHR5cGU6IFF1ZXJ5VHlwZS5GaWxlLFxuXHRcdHNob3VsZEdsb2JNYXRjaEZpbGVQYXR0ZXJuOiB0cnVlLFxuXHRcdGNhY2hlS2V5LFxuXHRcdGV4Y2x1ZGVQYXR0ZXJuOiBzZWFyY2hFeGNsdWRlUGF0dGVybixcblx0XHRzb3J0QnlTY29yZTogdHJ1ZSxcblx0XHRpZ25vcmVHbG9iQ2FzZTogdHJ1ZSxcblx0fTtcblxuXHRsZXQgc2VhcmNoUmVzdWx0OiBJU2VhcmNoQ29tcGxldGUgfCB1bmRlZmluZWQ7XG5cdHRyeSB7XG5cdFx0c2VhcmNoUmVzdWx0ID0gYXdhaXQgc2VhcmNoU2VydmljZS5maWxlU2VhcmNoKHsgLi4uc2VhcmNoT3B0aW9ucywgZmlsZVBhdHRlcm46IGB7KiovJHtzZWdtZW50TWF0Y2hQYXR0ZXJufS8qKiwqKi8ke3NlZ21lbnRNYXRjaFBhdHRlcm59fWAgfSwgdG9rZW4pO1xuXHR9IGNhdGNoIChlKSB7XG5cdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGUpKSB7XG5cdFx0XHR0aHJvdyBlO1xuXHRcdH1cblx0fVxuXG5cdGlmICghc2VhcmNoUmVzdWx0IHx8IHRva2VuPy5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdHJldHVybiB7IGZpbGVzOiBbXSwgZm9sZGVyczogW10gfTtcblx0fVxuXG5cdGNvbnN0IGZpbGVSZXNvdXJjZXMgPSBzZWFyY2hSZXN1bHQucmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5yZXNvdXJjZSk7XG5cdGNvbnN0IGZvbGRlclJlc291cmNlcyA9IGdldE1hdGNoaW5nRm9sZGVyc0Zyb21GaWxlcyhmaWxlUmVzb3VyY2VzLCB3b3Jrc3BhY2UsIHNlZ21lbnRNYXRjaFBhdHRlcm4pO1xuXG5cdHJldHVybiB7IGZvbGRlcnM6IGZvbGRlclJlc291cmNlcywgZmlsZXM6IGZpbGVSZXNvdXJjZXMgfTtcbn1cblxuZnVuY3Rpb24gZnV6enlNYXRjaGluZ0dsb2JQYXR0ZXJuKHBhdHRlcm46IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICghcGF0dGVybikge1xuXHRcdHJldHVybiAnKic7XG5cdH1cblx0cmV0dXJuICcqJyArIHBhdHRlcm4uc3BsaXQoJycpLmpvaW4oJyonKSArICcqJztcbn1cblxuZnVuY3Rpb24gY29udGlub3VzTWF0Y2hpbmdHbG9iUGF0dGVybihwYXR0ZXJuOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoIXBhdHRlcm4pIHtcblx0XHRyZXR1cm4gJyonO1xuXHR9XG5cdHJldHVybiAnKicgKyBwYXR0ZXJuICsgJyonO1xufVxuXG4vLyBUT0RPOiByZW1vdmUgdGhpcyBhbmQgaGF2ZSBzdXBwb3J0IGZyb20gdGhlIHNlYXJjaCBzZXJ2aWNlXG5mdW5jdGlvbiBnZXRNYXRjaGluZ0ZvbGRlcnNGcm9tRmlsZXMocmVzb3VyY2VzOiBVUklbXSwgd29ya3NwYWNlOiBVUkksIHNlZ21lbnRNYXRjaFBhdHRlcm46IHN0cmluZyk6IFVSSVtdIHtcblx0Y29uc3QgdW5pcXVlRm9sZGVycyA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIHJlc291cmNlcykge1xuXHRcdGNvbnN0IHJlbGF0aXZlUGF0aFRvUm9vdCA9IHJlbGF0aXZlUGF0aCh3b3Jrc3BhY2UsIHJlc291cmNlKTtcblx0XHRpZiAoIXJlbGF0aXZlUGF0aFRvUm9vdCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdSZXNvdXJjZSBpcyBub3QgYSBjaGlsZCBvZiB0aGUgd29ya3NwYWNlJyk7XG5cdFx0fVxuXG5cdFx0bGV0IGRpclJlc291cmNlID0gd29ya3NwYWNlO1xuXHRcdGNvbnN0IHN0YXRzID0gcmVsYXRpdmVQYXRoVG9Sb290LnNwbGl0KCcvJykuc2xpY2UoMCwgLTEpO1xuXHRcdGZvciAoY29uc3Qgc3RhdCBvZiBzdGF0cykge1xuXHRcdFx0ZGlyUmVzb3VyY2UgPSBkaXJSZXNvdXJjZS53aXRoKHsgcGF0aDogYCR7ZGlyUmVzb3VyY2UucGF0aH0vJHtzdGF0fWAgfSk7XG5cdFx0XHR1bmlxdWVGb2xkZXJzLmFkZChkaXJSZXNvdXJjZSk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgbWF0Y2hpbmdGb2xkZXJzOiBVUklbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGZvbGRlclJlc291cmNlIG9mIHVuaXF1ZUZvbGRlcnMpIHtcblx0XHRjb25zdCBzdGF0cyA9IGZvbGRlclJlc291cmNlLnBhdGguc3BsaXQoJy8nKTtcblx0XHRjb25zdCBkaXJTdGF0ID0gc3RhdHNbc3RhdHMubGVuZ3RoIC0gMV07XG5cdFx0aWYgKCFkaXJTdGF0IHx8ICFnbG9iLm1hdGNoKHNlZ21lbnRNYXRjaFBhdHRlcm4sIGRpclN0YXQsIHsgaWdub3JlQ2FzZTogdHJ1ZSB9KSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0bWF0Y2hpbmdGb2xkZXJzLnB1c2goZm9sZGVyUmVzb3VyY2UpO1xuXHR9XG5cblx0cmV0dXJuIG1hdGNoaW5nRm9sZGVycztcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFRvcExldmVsRm9sZGVycyh3b3Jrc3BhY2VzOiBVUklbXSwgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSk6IFByb21pc2U8VVJJW10+IHtcblx0Y29uc3QgZm9sZGVyczogVVJJW10gPSBbXTtcblx0Zm9yIChjb25zdCB3b3Jrc3BhY2Ugb2Ygd29ya3NwYWNlcykge1xuXHRcdGNvbnN0IGZpbGVTeXN0ZW1Qcm92aWRlciA9IGZpbGVTZXJ2aWNlLmdldFByb3ZpZGVyKHdvcmtzcGFjZS5zY2hlbWUpO1xuXHRcdGlmICghZmlsZVN5c3RlbVByb3ZpZGVyKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRjb25zdCBlbnRyaWVzID0gYXdhaXQgZmlsZVN5c3RlbVByb3ZpZGVyLnJlYWRkaXIod29ya3NwYWNlKTtcblx0XHRmb3IgKGNvbnN0IFtuYW1lLCB0eXBlXSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRjb25zdCBlbnRyeVJlc291cmNlID0gam9pblBhdGgod29ya3NwYWNlLCBuYW1lKTtcblx0XHRcdGlmICh0eXBlID09PSBGaWxlVHlwZS5EaXJlY3RvcnkpIHtcblx0XHRcdFx0Zm9sZGVycy5wdXNoKGVudHJ5UmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiBmb2xkZXJzO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFFOUIsU0FBUyxhQUFnRSxnQkFBZ0IsV0FBVyxlQUFlO0FBQ25ILFNBQVMscUJBQXFCO0FBQzlCLFNBQTZELHlCQUFnRCwwQkFBMEI7QUFFdkksU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxVQUFVLFNBQVMsVUFBVSxvQkFBb0I7QUFDMUQsU0FBUyxlQUFlO0FBRXhCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsVUFBVSxVQUFVLG9CQUFvQjtBQUNqRCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDJCQUEyQjtBQUNwQyxZQUFZLFVBQVU7QUFDdEIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxpQ0FBaUM7QUFHbkMsSUFBTSxnQ0FBTixjQUE0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
