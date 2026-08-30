import { dirname } from "../../../../base/common/resources.js";
import * as nls from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IListService } from "../../../../platform/list/browser/listService.js";
import { ViewContainerLocation } from "../../../common/views.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import * as Constants from "../common/constants.js";
import * as SearchEditorConstants from "../../searchEditor/browser/constants.js";
import { IsSessionsWindowContext } from "../../../common/contextkeys.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { resolveResourcesForSearchIncludes } from "../../../services/search/common/queryBuilder.js";
import { getMultiSelectedResources, IExplorerService } from "../../files/browser/files.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { ExplorerFolderContext, ExplorerRootContext, FilesExplorerFocusCondition, VIEWLET_ID as VIEWLET_ID_FILES } from "../../files/common/files.js";
import { IPaneCompositePartService } from "../../../services/panecomposite/browser/panecomposite.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { category, findInFilesCommand, getElementsToOperateOn, getSearchView, openSearchView } from "./searchActionsBase.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { forcedExpandRecursively } from "./searchActionsTopBar.js";
import { isSearchTreeFileMatch, isSearchTreeMatch } from "./searchTreeModel/searchTreeCommon.js";
registerAction2(class RestrictSearchToFolderAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.RestrictSearchToFolderId,
      title: nls.localize2("restrictResultsToFolder", "Restrict Search to Folder"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.ResourceFolderFocusKey),
        primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyF
      },
      menu: [
        {
          id: MenuId.SearchContext,
          group: "search",
          order: 3,
          when: ContextKeyExpr.and(Constants.SearchContext.ResourceFolderFocusKey)
        }
      ]
    });
  }
  async run(accessor, folderMatch) {
    await searchWithFolderCommand(accessor, false, true, void 0, folderMatch);
  }
});
registerAction2(class ExpandSelectedTreeCommandAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ExpandRecursivelyCommandId,
      title: nls.localize("search.expandRecursively", "Expand Recursively"),
      category,
      menu: [{
        id: MenuId.SearchContext,
        when: ContextKeyExpr.and(
          Constants.SearchContext.FolderFocusKey,
          Constants.SearchContext.HasSearchResults
        ),
        group: "search",
        order: 4
      }]
    });
  }
  async run(accessor) {
    return expandSelectSubtree(accessor);
  }
});
registerAction2(class ExcludeFolderFromSearchAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ExcludeFolderFromSearchId,
      title: nls.localize2("excludeFolderFromSearch", "Exclude Folder from Search"),
      category,
      menu: [
        {
          id: MenuId.SearchContext,
          group: "search",
          order: 4,
          when: Constants.SearchContext.ResourceFolderFocusKey
        }
      ]
    });
  }
  async run(accessor, folderMatch) {
    await searchWithFolderCommand(accessor, false, false, void 0, folderMatch);
  }
});
registerAction2(class ExcludeFileTypeFromSearchAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ExcludeFileTypeFromSearchId,
      title: nls.localize2("excludeFileTypeFromSearch", "Exclude File Type from Search"),
      category,
      menu: [
        {
          id: MenuId.SearchContext,
          group: "search",
          order: 5,
          when: Constants.SearchContext.FileFocusKey
        }
      ]
    });
  }
  async run(accessor, fileMatch) {
    await modifySearchFileTypePattern(accessor, fileMatch, true);
  }
});
registerAction2(class IncludeFileTypeInSearchAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.IncludeFileTypeInSearchId,
      title: nls.localize2("includeFileTypeInSearch", "Include File Type from Search"),
      category,
      menu: [
        {
          id: MenuId.SearchContext,
          group: "search",
          order: 6,
          when: Constants.SearchContext.FileFocusKey
        }
      ]
    });
  }
  async run(accessor, fileMatch) {
    await modifySearchFileTypePattern(accessor, fileMatch, false);
  }
});
registerAction2(class RevealInSideBarForSearchResultsAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.RevealInSideBarForSearchResults,
      title: nls.localize2("revealInSideBar", "Reveal in Explorer View"),
      category,
      menu: [{
        id: MenuId.SearchContext,
        when: ContextKeyExpr.and(Constants.SearchContext.FileFocusKey, Constants.SearchContext.HasSearchResults),
        group: "search_3",
        order: 1
      }]
    });
  }
  async run(accessor, args) {
    const paneCompositeService = accessor.get(IPaneCompositePartService);
    const explorerService = accessor.get(IExplorerService);
    const contextService = accessor.get(IWorkspaceContextService);
    const searchView = getSearchView(accessor.get(IViewsService));
    if (!searchView) {
      return;
    }
    let fileMatch;
    if (isSearchTreeFileMatch(args)) {
      fileMatch = args;
    } else {
      args = searchView.getControl().getFocus()[0];
      return;
    }
    paneCompositeService.openPaneComposite(VIEWLET_ID_FILES, ViewContainerLocation.Sidebar, false).then((viewlet) => {
      if (!viewlet) {
        return;
      }
      const explorerViewContainer = viewlet.getViewPaneContainer();
      const uri = fileMatch.resource;
      if (uri && contextService.isInsideWorkspace(uri)) {
        const explorerView = explorerViewContainer.getExplorerView();
        explorerView.setExpanded(true);
        explorerService.select(uri, true).then(() => explorerView.focus(), onUnexpectedError);
      }
    });
  }
});
registerAction2(class FindInFilesAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.FindInFilesActionId,
      title: {
        ...nls.localize2("findInFiles", "Find in Files"),
        mnemonicTitle: nls.localize({ key: "miFindInFiles", comment: ["&& denotes a mnemonic"] }, "Find &&in Files")
      },
      metadata: {
        description: nls.localize("findInFiles.description", "Open a workspace search"),
        args: [
          {
            name: nls.localize("findInFiles.args", "A set of options for the search"),
            schema: {
              type: "object",
              properties: {
                query: { "type": "string" },
                replace: { "type": "string" },
                preserveCase: { "type": "boolean" },
                triggerSearch: { "type": "boolean" },
                filesToInclude: { "type": "string" },
                filesToExclude: { "type": "string" },
                isRegex: { "type": "boolean" },
                isCaseSensitive: { "type": "boolean" },
                matchWholeWord: { "type": "boolean" },
                useExcludeSettingsAndIgnoreFiles: { "type": "boolean" },
                onlyOpenEditors: { "type": "boolean" },
                showIncludesExcludes: { "type": "boolean" }
              }
            }
          }
        ]
      },
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF
      },
      menu: [{
        id: MenuId.MenubarEditMenu,
        group: "4_find_global",
        order: 1,
        when: IsSessionsWindowContext.negate()
      }],
      f1: true,
      precondition: IsSessionsWindowContext.negate()
    });
  }
  async run(accessor, args = {}) {
    findInFilesCommand(accessor, args);
  }
});
registerAction2(class FindInFolderAction extends Action2 {
  // from explorer
  constructor() {
    super({
      id: Constants.SearchCommandIds.FindInFolderId,
      title: nls.localize2("findInFolder", "Find in Folder..."),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerFolderContext),
        primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyF
      },
      menu: [
        {
          id: MenuId.ExplorerContext,
          group: "4_search",
          order: 10,
          when: ExplorerFolderContext
        }
      ]
    });
  }
  async run(accessor, resource) {
    await searchWithFolderCommand(accessor, true, true, resource);
  }
});
registerAction2(class FindInWorkspaceAction extends Action2 {
  // from explorer
  constructor() {
    super({
      id: Constants.SearchCommandIds.FindInWorkspaceId,
      title: nls.localize2("findInWorkspace", "Find in Workspace..."),
      category,
      menu: [
        {
          id: MenuId.ExplorerContext,
          group: "4_search",
          order: 10,
          when: ContextKeyExpr.and(ExplorerRootContext, ExplorerFolderContext.toNegated())
        }
      ]
    });
  }
  async run(accessor) {
    const searchConfig = accessor.get(IConfigurationService).getValue().search;
    const mode = searchConfig?.mode;
    if (mode === "view") {
      const searchView = await openSearchView(accessor.get(IViewsService), true);
      searchView?.searchInFolders();
    } else {
      await accessor.get(ICommandService).executeCommand(SearchEditorConstants.OpenEditorCommandId, {
        location: mode === "newEditor" ? "new" : "reuse",
        filesToInclude: ""
      });
    }
  }
});
async function expandSelectSubtree(accessor) {
  const viewsService = accessor.get(IViewsService);
  const searchView = getSearchView(viewsService);
  if (searchView) {
    const viewer = searchView.getControl();
    const selected = viewer.getFocus()[0];
    await forcedExpandRecursively(viewer, selected);
  }
}
function extractSearchFilePattern(fileName) {
  const parts = fileName.split(".");
  if (parts.length <= 1) {
    return fileName;
  }
  const extensionParts = parts.slice(1);
  return `*.${extensionParts.join(".")}`;
}
function mergeSearchPatternIfNotExists(currentPatterns, newPattern) {
  if (!currentPatterns.trim()) {
    return newPattern;
  }
  const existingPatterns = currentPatterns.split(",").map((pattern) => pattern.trim()).filter((pattern) => pattern.length > 0);
  if (existingPatterns.includes(newPattern)) {
    return currentPatterns;
  }
  return `${currentPatterns}, ${newPattern}`;
}
async function searchWithFolderCommand(accessor, isFromExplorer, isIncludes, resource, folderMatch) {
  const fileService = accessor.get(IFileService);
  const viewsService = accessor.get(IViewsService);
  const contextService = accessor.get(IWorkspaceContextService);
  const commandService = accessor.get(ICommandService);
  const searchConfig = accessor.get(IConfigurationService).getValue().search;
  const mode = searchConfig?.mode;
  let resources;
  if (isFromExplorer) {
    resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IExplorerService));
  } else {
    const searchView = getSearchView(viewsService);
    if (!searchView) {
      return;
    }
    resources = getMultiSelectedSearchResources(searchView.getControl(), folderMatch, searchConfig);
  }
  const resolvedResources = fileService.resolveAll(resources.map((resource2) => ({ resource: resource2 }))).then((results) => {
    const folders = [];
    results.forEach((result) => {
      if (result.success && result.stat) {
        folders.push(result.stat.isDirectory ? result.stat.resource : dirname(result.stat.resource));
      }
    });
    return resolveResourcesForSearchIncludes(folders, contextService);
  });
  if (mode === "view") {
    const searchView = await openSearchView(viewsService, true);
    if (resources && resources.length && searchView) {
      if (isIncludes) {
        searchView.searchInFolders(await resolvedResources);
      } else {
        searchView.searchOutsideOfFolders(await resolvedResources);
      }
    }
    return void 0;
  } else {
    if (isIncludes) {
      return commandService.executeCommand(SearchEditorConstants.OpenEditorCommandId, {
        filesToInclude: (await resolvedResources).join(", "),
        showIncludesExcludes: true,
        location: mode === "newEditor" ? "new" : "reuse"
      });
    } else {
      return commandService.executeCommand(SearchEditorConstants.OpenEditorCommandId, {
        filesToExclude: (await resolvedResources).join(", "),
        showIncludesExcludes: true,
        location: mode === "newEditor" ? "new" : "reuse"
      });
    }
  }
}
function getMultiSelectedSearchResources(viewer, currElement, sortConfig) {
  return getElementsToOperateOn(viewer, currElement, sortConfig).map((renderableMatch) => isSearchTreeMatch(renderableMatch) ? null : renderableMatch.resource).filter((renderableMatch) => renderableMatch !== null);
}
async function modifySearchFileTypePattern(accessor, fileMatch, isExclude) {
  const viewsService = accessor.get(IViewsService);
  const searchView = getSearchView(viewsService);
  if (!searchView || !fileMatch) {
    return;
  }
  const resource = fileMatch.resource;
  const fileName = resource.path.split("/").pop() || "";
  const newPattern = extractSearchFilePattern(fileName);
  const patternWidget = isExclude ? searchView.searchExcludePattern : searchView.searchIncludePattern;
  const currentPatterns = patternWidget.getValue();
  const updatedPatterns = mergeSearchPatternIfNotExists(currentPatterns, newPattern);
  if (updatedPatterns !== currentPatterns) {
    patternWidget.setValue(updatedPatterns);
    searchView.toggleQueryDetails(false, true);
    searchView.triggerQueryChange({ preserveFocus: false });
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNlYXJjaFxcYnJvd3Nlclxcc2VhcmNoQWN0aW9uc0ZpbmQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IHsgZGlybmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMaXN0U2VydmljZSwgV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBWaWV3Q29udGFpbmVyTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0ICogYXMgQ29uc3RhbnRzIGZyb20gJy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0ICogYXMgU2VhcmNoRWRpdG9yQ29uc3RhbnRzIGZyb20gJy4uLy4uL3NlYXJjaEVkaXRvci9icm93c2VyL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJU2VhcmNoQ29uZmlndXJhdGlvbiwgSVNlYXJjaENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgcmVzb2x2ZVJlc291cmNlc0ZvclNlYXJjaEluY2x1ZGVzIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9xdWVyeUJ1aWxkZXIuanMnO1xuaW1wb3J0IHsgZ2V0TXVsdGlTZWxlY3RlZFJlc291cmNlcywgSUV4cGxvcmVyU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzL2Jyb3dzZXIvZmlsZXMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IEV4cGxvcmVyRm9sZGVyQ29udGV4dCwgRXhwbG9yZXJSb290Q29udGV4dCwgRmlsZXNFeHBsb3JlckZvY3VzQ29uZGl0aW9uLCBWSUVXTEVUX0lEIGFzIFZJRVdMRVRfSURfRklMRVMgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3BhbmVjb21wb3NpdGUvYnJvd3Nlci9wYW5lY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IEV4cGxvcmVyVmlld1BhbmVDb250YWluZXIgfSBmcm9tICcuLi8uLi9maWxlcy9icm93c2VyL2V4cGxvcmVyVmlld2xldC5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBjYXRlZ29yeSwgZmluZEluRmlsZXNDb21tYW5kLCBnZXRFbGVtZW50c1RvT3BlcmF0ZU9uLCBnZXRTZWFyY2hWaWV3LCBJRmluZEluRmlsZXNBcmdzLCBvcGVuU2VhcmNoVmlldyB9IGZyb20gJy4vc2VhcmNoQWN0aW9uc0Jhc2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZm9yY2VkRXhwYW5kUmVjdXJzaXZlbHkgfSBmcm9tICcuL3NlYXJjaEFjdGlvbnNUb3BCYXIuanMnO1xuaW1wb3J0IHsgUmVuZGVyYWJsZU1hdGNoLCBJU2VhcmNoVHJlZUZpbGVNYXRjaCwgSVNlYXJjaFRyZWVGb2xkZXJNYXRjaFdpdGhSZXNvdXJjZSwgSVNlYXJjaFJlc3VsdCwgaXNTZWFyY2hUcmVlRmlsZU1hdGNoLCBpc1NlYXJjaFRyZWVNYXRjaCB9IGZyb20gJy4vc2VhcmNoVHJlZU1vZGVsL3NlYXJjaFRyZWVDb21tb24uanMnO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgUmVzdHJpY3RTZWFyY2hUb0ZvbGRlckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuUmVzdHJpY3RTZWFyY2hUb0ZvbGRlcklkLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3Jlc3RyaWN0UmVzdWx0c1RvRm9sZGVyJywgXCJSZXN0cmljdCBTZWFyY2ggdG8gRm9sZGVyXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuU2VhcmNoVmlld1Zpc2libGVLZXksIENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlJlc291cmNlRm9sZGVyRm9jdXNLZXkpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlGLFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuU2VhcmNoQ29udGV4dCxcblx0XHRcdFx0XHRncm91cDogJ3NlYXJjaCcsXG5cdFx0XHRcdFx0b3JkZXI6IDMsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlJlc291cmNlRm9sZGVyRm9jdXNLZXkpXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGZvbGRlck1hdGNoPzogSVNlYXJjaFRyZWVGb2xkZXJNYXRjaFdpdGhSZXNvdXJjZSkge1xuXHRcdGF3YWl0IHNlYXJjaFdpdGhGb2xkZXJDb21tYW5kKGFjY2Vzc29yLCBmYWxzZSwgdHJ1ZSwgdW5kZWZpbmVkLCBmb2xkZXJNYXRjaCk7XG5cdH1cbn0pO1xuXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBFeHBhbmRTZWxlY3RlZFRyZWVDb21tYW5kQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKFxuXHQpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuRXhwYW5kUmVjdXJzaXZlbHlDb21tYW5kSWQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdzZWFyY2guZXhwYW5kUmVjdXJzaXZlbHknLCBcIkV4cGFuZCBSZWN1cnNpdmVseVwiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5TZWFyY2hDb250ZXh0LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q29uc3RhbnRzLlNlYXJjaENvbnRleHQuRm9sZGVyRm9jdXNLZXksXG5cdFx0XHRcdFx0Q29uc3RhbnRzLlNlYXJjaENvbnRleHQuSGFzU2VhcmNoUmVzdWx0c1xuXHRcdFx0XHQpLFxuXHRcdFx0XHRncm91cDogJ3NlYXJjaCcsXG5cdFx0XHRcdG9yZGVyOiA0XG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBhbnkpIHtcblx0XHRyZXR1cm4gZXhwYW5kU2VsZWN0U3VidHJlZShhY2Nlc3Nvcik7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRXhjbHVkZUZvbGRlckZyb21TZWFyY2hBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLkV4Y2x1ZGVGb2xkZXJGcm9tU2VhcmNoSWQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignZXhjbHVkZUZvbGRlckZyb21TZWFyY2gnLCBcIkV4Y2x1ZGUgRm9sZGVyIGZyb20gU2VhcmNoXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLlNlYXJjaENvbnRleHQsXG5cdFx0XHRcdFx0Z3JvdXA6ICdzZWFyY2gnLFxuXHRcdFx0XHRcdG9yZGVyOiA0LFxuXHRcdFx0XHRcdHdoZW46IENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlJlc291cmNlRm9sZGVyRm9jdXNLZXlcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZm9sZGVyTWF0Y2g/OiBJU2VhcmNoVHJlZUZvbGRlck1hdGNoV2l0aFJlc291cmNlKSB7XG5cdFx0YXdhaXQgc2VhcmNoV2l0aEZvbGRlckNvbW1hbmQoYWNjZXNzb3IsIGZhbHNlLCBmYWxzZSwgdW5kZWZpbmVkLCBmb2xkZXJNYXRjaCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRXhjbHVkZUZpbGVUeXBlRnJvbVNlYXJjaEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuRXhjbHVkZUZpbGVUeXBlRnJvbVNlYXJjaElkLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2V4Y2x1ZGVGaWxlVHlwZUZyb21TZWFyY2gnLCBcIkV4Y2x1ZGUgRmlsZSBUeXBlIGZyb20gU2VhcmNoXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLlNlYXJjaENvbnRleHQsXG5cdFx0XHRcdFx0Z3JvdXA6ICdzZWFyY2gnLFxuXHRcdFx0XHRcdG9yZGVyOiA1LFxuXHRcdFx0XHRcdHdoZW46IENvbnN0YW50cy5TZWFyY2hDb250ZXh0LkZpbGVGb2N1c0tleVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBmaWxlTWF0Y2g/OiBJU2VhcmNoVHJlZUZpbGVNYXRjaCkge1xuXHRcdGF3YWl0IG1vZGlmeVNlYXJjaEZpbGVUeXBlUGF0dGVybihhY2Nlc3NvciwgZmlsZU1hdGNoLCB0cnVlKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBJbmNsdWRlRmlsZVR5cGVJblNlYXJjaEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuSW5jbHVkZUZpbGVUeXBlSW5TZWFyY2hJZCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdpbmNsdWRlRmlsZVR5cGVJblNlYXJjaCcsIFwiSW5jbHVkZSBGaWxlIFR5cGUgZnJvbSBTZWFyY2hcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuU2VhcmNoQ29udGV4dCxcblx0XHRcdFx0XHRncm91cDogJ3NlYXJjaCcsXG5cdFx0XHRcdFx0b3JkZXI6IDYsXG5cdFx0XHRcdFx0d2hlbjogQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuRmlsZUZvY3VzS2V5XG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGZpbGVNYXRjaD86IElTZWFyY2hUcmVlRmlsZU1hdGNoKSB7XG5cdFx0YXdhaXQgbW9kaWZ5U2VhcmNoRmlsZVR5cGVQYXR0ZXJuKGFjY2Vzc29yLCBmaWxlTWF0Y2gsIGZhbHNlKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBSZXZlYWxJblNpZGVCYXJGb3JTZWFyY2hSZXN1bHRzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5SZXZlYWxJblNpZGVCYXJGb3JTZWFyY2hSZXN1bHRzLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3JldmVhbEluU2lkZUJhcicsIFwiUmV2ZWFsIGluIEV4cGxvcmVyIFZpZXdcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuU2VhcmNoQ29udGV4dCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnN0YW50cy5TZWFyY2hDb250ZXh0LkZpbGVGb2N1c0tleSwgQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuSGFzU2VhcmNoUmVzdWx0cyksXG5cdFx0XHRcdGdyb3VwOiAnc2VhcmNoXzMnLFxuXHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0fV1cblx0XHR9KTtcblxuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuXHRcdGNvbnN0IHBhbmVDb21wb3NpdGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UpO1xuXHRcdGNvbnN0IGV4cGxvcmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXhwbG9yZXJTZXJ2aWNlKTtcblx0XHRjb25zdCBjb250ZXh0U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2VhcmNoVmlldyA9IGdldFNlYXJjaFZpZXcoYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpKTtcblx0XHRpZiAoIXNlYXJjaFZpZXcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgZmlsZU1hdGNoOiBJU2VhcmNoVHJlZUZpbGVNYXRjaDtcblx0XHRpZiAoaXNTZWFyY2hUcmVlRmlsZU1hdGNoKGFyZ3MpKSB7XG5cdFx0XHRmaWxlTWF0Y2ggPSBhcmdzO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhcmdzID0gc2VhcmNoVmlldy5nZXRDb250cm9sKCkuZ2V0Rm9jdXMoKVswXTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRwYW5lQ29tcG9zaXRlU2VydmljZS5vcGVuUGFuZUNvbXBvc2l0ZShWSUVXTEVUX0lEX0ZJTEVTLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhciwgZmFsc2UpLnRoZW4oKHZpZXdsZXQpID0+IHtcblx0XHRcdGlmICghdmlld2xldCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGV4cGxvcmVyVmlld0NvbnRhaW5lciA9IHZpZXdsZXQuZ2V0Vmlld1BhbmVDb250YWluZXIoKSBhcyBFeHBsb3JlclZpZXdQYW5lQ29udGFpbmVyO1xuXHRcdFx0Y29uc3QgdXJpID0gZmlsZU1hdGNoLnJlc291cmNlO1xuXHRcdFx0aWYgKHVyaSAmJiBjb250ZXh0U2VydmljZS5pc0luc2lkZVdvcmtzcGFjZSh1cmkpKSB7XG5cdFx0XHRcdGNvbnN0IGV4cGxvcmVyVmlldyA9IGV4cGxvcmVyVmlld0NvbnRhaW5lci5nZXRFeHBsb3JlclZpZXcoKTtcblx0XHRcdFx0ZXhwbG9yZXJWaWV3LnNldEV4cGFuZGVkKHRydWUpO1xuXHRcdFx0XHRleHBsb3JlclNlcnZpY2Uuc2VsZWN0KHVyaSwgdHJ1ZSkudGhlbigoKSA9PiBleHBsb3JlclZpZXcuZm9jdXMoKSwgb25VbmV4cGVjdGVkRXJyb3IpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59KTtcblxuLy8gRmluZCBpbiBGaWxlcyBieSBkZWZhdWx0IGlzIHRoZSBzYW1lIGFzIFZpZXc6IFNob3cgU2VhcmNoLCBidXQgY2FuIGJlIGNvbmZpZ3VyZWQgdG8gb3BlbiBhIHNlYXJjaCBlZGl0b3IgaW5zdGVhZCB3aXRoIHRoZSBgc2VhcmNoLm1vZGVgIGJpbmRpbmdcbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBGaW5kSW5GaWxlc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHQpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuRmluZEluRmlsZXNBY3Rpb25JZCxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLm5scy5sb2NhbGl6ZTIoJ2ZpbmRJbkZpbGVzJywgXCJGaW5kIGluIEZpbGVzXCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaUZpbmRJbkZpbGVzJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkZpbmQgJiZpbiBGaWxlc1wiKSxcblx0XHRcdH0sXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdmaW5kSW5GaWxlcy5kZXNjcmlwdGlvbicsIFwiT3BlbiBhIHdvcmtzcGFjZSBzZWFyY2hcIiksXG5cdFx0XHRcdGFyZ3M6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRuYW1lOiBubHMubG9jYWxpemUoJ2ZpbmRJbkZpbGVzLmFyZ3MnLCBcIkEgc2V0IG9mIG9wdGlvbnMgZm9yIHRoZSBzZWFyY2hcIiksXG5cdFx0XHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRxdWVyeTogeyAndHlwZSc6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0XHRcdFx0cmVwbGFjZTogeyAndHlwZSc6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0XHRcdFx0cHJlc2VydmVDYXNlOiB7ICd0eXBlJzogJ2Jvb2xlYW4nIH0sXG5cdFx0XHRcdFx0XHRcdFx0dHJpZ2dlclNlYXJjaDogeyAndHlwZSc6ICdib29sZWFuJyB9LFxuXHRcdFx0XHRcdFx0XHRcdGZpbGVzVG9JbmNsdWRlOiB7ICd0eXBlJzogJ3N0cmluZycgfSxcblx0XHRcdFx0XHRcdFx0XHRmaWxlc1RvRXhjbHVkZTogeyAndHlwZSc6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0XHRcdFx0aXNSZWdleDogeyAndHlwZSc6ICdib29sZWFuJyB9LFxuXHRcdFx0XHRcdFx0XHRcdGlzQ2FzZVNlbnNpdGl2ZTogeyAndHlwZSc6ICdib29sZWFuJyB9LFxuXHRcdFx0XHRcdFx0XHRcdG1hdGNoV2hvbGVXb3JkOiB7ICd0eXBlJzogJ2Jvb2xlYW4nIH0sXG5cdFx0XHRcdFx0XHRcdFx0dXNlRXhjbHVkZVNldHRpbmdzQW5kSWdub3JlRmlsZXM6IHsgJ3R5cGUnOiAnYm9vbGVhbicgfSxcblx0XHRcdFx0XHRcdFx0XHRvbmx5T3BlbkVkaXRvcnM6IHsgJ3R5cGUnOiAnYm9vbGVhbicgfSxcblx0XHRcdFx0XHRcdFx0XHRzaG93SW5jbHVkZXNFeGNsdWRlczogeyAndHlwZSc6ICdib29sZWFuJyB9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5Rixcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLk1lbnViYXJFZGl0TWVudSxcblx0XHRcdFx0Z3JvdXA6ICc0X2ZpbmRfZ2xvYmFsJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0fV0sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKClcblx0XHR9KTtcblxuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzOiBJRmluZEluRmlsZXNBcmdzID0ge30pOiBQcm9taXNlPGFueT4ge1xuXHRcdGZpbmRJbkZpbGVzQ29tbWFuZChhY2Nlc3NvciwgYXJncyk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRmluZEluRm9sZGVyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdC8vIGZyb20gZXhwbG9yZXJcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLkZpbmRJbkZvbGRlcklkLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2ZpbmRJbkZvbGRlcicsIFwiRmluZCBpbiBGb2xkZXIuLi5cIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChGaWxlc0V4cGxvcmVyRm9jdXNDb25kaXRpb24sIEV4cGxvcmVyRm9sZGVyQ29udGV4dCksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleUYsXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5FeHBsb3JlckNvbnRleHQsXG5cdFx0XHRcdFx0Z3JvdXA6ICc0X3NlYXJjaCcsXG5cdFx0XHRcdFx0b3JkZXI6IDEwLFxuXHRcdFx0XHRcdHdoZW46IEV4cGxvcmVyRm9sZGVyQ29udGV4dFxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCByZXNvdXJjZT86IFVSSSkge1xuXHRcdGF3YWl0IHNlYXJjaFdpdGhGb2xkZXJDb21tYW5kKGFjY2Vzc29yLCB0cnVlLCB0cnVlLCByZXNvdXJjZSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRmluZEluV29ya3NwYWNlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdC8vIGZyb20gZXhwbG9yZXJcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLkZpbmRJbldvcmtzcGFjZUlkLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2ZpbmRJbldvcmtzcGFjZScsIFwiRmluZCBpbiBXb3Jrc3BhY2UuLi5cIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuRXhwbG9yZXJDb250ZXh0LFxuXHRcdFx0XHRcdGdyb3VwOiAnNF9zZWFyY2gnLFxuXHRcdFx0XHRcdG9yZGVyOiAxMCxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRXhwbG9yZXJSb290Q29udGV4dCwgRXhwbG9yZXJGb2xkZXJDb250ZXh0LnRvTmVnYXRlZCgpKVxuXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBzZWFyY2hDb25maWcgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKS5nZXRWYWx1ZTxJU2VhcmNoQ29uZmlndXJhdGlvbj4oKS5zZWFyY2g7XG5cdFx0Y29uc3QgbW9kZSA9IHNlYXJjaENvbmZpZz8ubW9kZTtcblxuXHRcdGlmIChtb2RlID09PSAndmlldycpIHtcblx0XHRcdGNvbnN0IHNlYXJjaFZpZXcgPSBhd2FpdCBvcGVuU2VhcmNoVmlldyhhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSksIHRydWUpO1xuXHRcdFx0c2VhcmNoVmlldz8uc2VhcmNoSW5Gb2xkZXJzKCk7XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0YXdhaXQgYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSkuZXhlY3V0ZUNvbW1hbmQoU2VhcmNoRWRpdG9yQ29uc3RhbnRzLk9wZW5FZGl0b3JDb21tYW5kSWQsIHtcblx0XHRcdFx0bG9jYXRpb246IG1vZGUgPT09ICduZXdFZGl0b3InID8gJ25ldycgOiAncmV1c2UnLFxuXHRcdFx0XHRmaWxlc1RvSW5jbHVkZTogJycsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cbn0pO1xuXG4vLyNyZWdpb24gSGVscGVyc1xuYXN5bmMgZnVuY3Rpb24gZXhwYW5kU2VsZWN0U3VidHJlZShhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdGNvbnN0IHNlYXJjaFZpZXcgPSBnZXRTZWFyY2hWaWV3KHZpZXdzU2VydmljZSk7XG5cdGlmIChzZWFyY2hWaWV3KSB7XG5cdFx0Y29uc3Qgdmlld2VyID0gc2VhcmNoVmlldy5nZXRDb250cm9sKCk7XG5cdFx0Y29uc3Qgc2VsZWN0ZWQgPSB2aWV3ZXIuZ2V0Rm9jdXMoKVswXTtcblx0XHRhd2FpdCBmb3JjZWRFeHBhbmRSZWN1cnNpdmVseSh2aWV3ZXIsIHNlbGVjdGVkKTtcblx0fVxufVxuXG5mdW5jdGlvbiBleHRyYWN0U2VhcmNoRmlsZVBhdHRlcm4oZmlsZU5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHBhcnRzID0gZmlsZU5hbWUuc3BsaXQoJy4nKTtcblxuXHRpZiAocGFydHMubGVuZ3RoIDw9IDEpIHtcblx0XHRyZXR1cm4gZmlsZU5hbWU7XG5cdH1cblxuXHRjb25zdCBleHRlbnNpb25QYXJ0cyA9IHBhcnRzLnNsaWNlKDEpO1xuXHRyZXR1cm4gYCouJHtleHRlbnNpb25QYXJ0cy5qb2luKCcuJyl9YDtcbn1cblxuZnVuY3Rpb24gbWVyZ2VTZWFyY2hQYXR0ZXJuSWZOb3RFeGlzdHMoY3VycmVudFBhdHRlcm5zOiBzdHJpbmcsIG5ld1BhdHRlcm46IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICghY3VycmVudFBhdHRlcm5zLnRyaW0oKSkge1xuXHRcdHJldHVybiBuZXdQYXR0ZXJuO1xuXHR9XG5cblx0Y29uc3QgZXhpc3RpbmdQYXR0ZXJucyA9IGN1cnJlbnRQYXR0ZXJucy5zcGxpdCgnLCcpLm1hcChwYXR0ZXJuID0+IHBhdHRlcm4udHJpbSgpKS5maWx0ZXIocGF0dGVybiA9PiBwYXR0ZXJuLmxlbmd0aCA+IDApO1xuXG5cdGlmIChleGlzdGluZ1BhdHRlcm5zLmluY2x1ZGVzKG5ld1BhdHRlcm4pKSB7XG5cdFx0cmV0dXJuIGN1cnJlbnRQYXR0ZXJucztcblx0fVxuXG5cdHJldHVybiBgJHtjdXJyZW50UGF0dGVybnN9LCAke25ld1BhdHRlcm59YDtcbn1cblxuYXN5bmMgZnVuY3Rpb24gc2VhcmNoV2l0aEZvbGRlckNvbW1hbmQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGlzRnJvbUV4cGxvcmVyOiBib29sZWFuLCBpc0luY2x1ZGVzOiBib29sZWFuLCByZXNvdXJjZT86IFVSSSwgZm9sZGVyTWF0Y2g/OiBJU2VhcmNoVHJlZUZvbGRlck1hdGNoV2l0aFJlc291cmNlKSB7XG5cdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSk7XG5cdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0Y29uc3QgY29udGV4dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0Y29uc3Qgc2VhcmNoQ29uZmlnID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkuZ2V0VmFsdWU8SVNlYXJjaENvbmZpZ3VyYXRpb24+KCkuc2VhcmNoO1xuXHRjb25zdCBtb2RlID0gc2VhcmNoQ29uZmlnPy5tb2RlO1xuXG5cdGxldCByZXNvdXJjZXM6IFVSSVtdO1xuXG5cdGlmIChpc0Zyb21FeHBsb3Jlcikge1xuXHRcdHJlc291cmNlcyA9IGdldE11bHRpU2VsZWN0ZWRSZXNvdXJjZXMocmVzb3VyY2UsIGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUV4cGxvcmVyU2VydmljZSkpO1xuXHR9IGVsc2Uge1xuXHRcdGNvbnN0IHNlYXJjaFZpZXcgPSBnZXRTZWFyY2hWaWV3KHZpZXdzU2VydmljZSk7XG5cdFx0aWYgKCFzZWFyY2hWaWV3KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJlc291cmNlcyA9IGdldE11bHRpU2VsZWN0ZWRTZWFyY2hSZXNvdXJjZXMoc2VhcmNoVmlldy5nZXRDb250cm9sKCksIGZvbGRlck1hdGNoLCBzZWFyY2hDb25maWcpO1xuXHR9XG5cblx0Y29uc3QgcmVzb2x2ZWRSZXNvdXJjZXMgPSBmaWxlU2VydmljZS5yZXNvbHZlQWxsKHJlc291cmNlcy5tYXAocmVzb3VyY2UgPT4gKHsgcmVzb3VyY2UgfSkpKS50aGVuKHJlc3VsdHMgPT4ge1xuXHRcdGNvbnN0IGZvbGRlcnM6IFVSSVtdID0gW107XG5cdFx0cmVzdWx0cy5mb3JFYWNoKHJlc3VsdCA9PiB7XG5cdFx0XHRpZiAocmVzdWx0LnN1Y2Nlc3MgJiYgcmVzdWx0LnN0YXQpIHtcblx0XHRcdFx0Zm9sZGVycy5wdXNoKHJlc3VsdC5zdGF0LmlzRGlyZWN0b3J5ID8gcmVzdWx0LnN0YXQucmVzb3VyY2UgOiBkaXJuYW1lKHJlc3VsdC5zdGF0LnJlc291cmNlKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHJlc29sdmVSZXNvdXJjZXNGb3JTZWFyY2hJbmNsdWRlcyhmb2xkZXJzLCBjb250ZXh0U2VydmljZSk7XG5cdH0pO1xuXG5cdGlmIChtb2RlID09PSAndmlldycpIHtcblx0XHRjb25zdCBzZWFyY2hWaWV3ID0gYXdhaXQgb3BlblNlYXJjaFZpZXcodmlld3NTZXJ2aWNlLCB0cnVlKTtcblx0XHRpZiAocmVzb3VyY2VzICYmIHJlc291cmNlcy5sZW5ndGggJiYgc2VhcmNoVmlldykge1xuXHRcdFx0aWYgKGlzSW5jbHVkZXMpIHtcblx0XHRcdFx0c2VhcmNoVmlldy5zZWFyY2hJbkZvbGRlcnMoYXdhaXQgcmVzb2x2ZWRSZXNvdXJjZXMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2VhcmNoVmlldy5zZWFyY2hPdXRzaWRlT2ZGb2xkZXJzKGF3YWl0IHJlc29sdmVkUmVzb3VyY2VzKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fSBlbHNlIHtcblx0XHRpZiAoaXNJbmNsdWRlcykge1xuXHRcdFx0cmV0dXJuIGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFNlYXJjaEVkaXRvckNvbnN0YW50cy5PcGVuRWRpdG9yQ29tbWFuZElkLCB7XG5cdFx0XHRcdGZpbGVzVG9JbmNsdWRlOiAoYXdhaXQgcmVzb2x2ZWRSZXNvdXJjZXMpLmpvaW4oJywgJyksXG5cdFx0XHRcdHNob3dJbmNsdWRlc0V4Y2x1ZGVzOiB0cnVlLFxuXHRcdFx0XHRsb2NhdGlvbjogbW9kZSA9PT0gJ25ld0VkaXRvcicgPyAnbmV3JyA6ICdyZXVzZScsXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHRyZXR1cm4gY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoU2VhcmNoRWRpdG9yQ29uc3RhbnRzLk9wZW5FZGl0b3JDb21tYW5kSWQsIHtcblx0XHRcdFx0ZmlsZXNUb0V4Y2x1ZGU6IChhd2FpdCByZXNvbHZlZFJlc291cmNlcykuam9pbignLCAnKSxcblx0XHRcdFx0c2hvd0luY2x1ZGVzRXhjbHVkZXM6IHRydWUsXG5cdFx0XHRcdGxvY2F0aW9uOiBtb2RlID09PSAnbmV3RWRpdG9yJyA/ICduZXcnIDogJ3JldXNlJyxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBnZXRNdWx0aVNlbGVjdGVkU2VhcmNoUmVzb3VyY2VzKHZpZXdlcjogV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZTxJU2VhcmNoUmVzdWx0LCBSZW5kZXJhYmxlTWF0Y2gsIHZvaWQ+LCBjdXJyRWxlbWVudDogUmVuZGVyYWJsZU1hdGNoIHwgdW5kZWZpbmVkLCBzb3J0Q29uZmlnOiBJU2VhcmNoQ29uZmlndXJhdGlvblByb3BlcnRpZXMgfCB1bmRlZmluZWQpOiBVUklbXSB7XG5cdHJldHVybiBnZXRFbGVtZW50c1RvT3BlcmF0ZU9uKHZpZXdlciwgY3VyckVsZW1lbnQsIHNvcnRDb25maWcpXG5cdFx0Lm1hcCgocmVuZGVyYWJsZU1hdGNoKSA9PiAoKGlzU2VhcmNoVHJlZU1hdGNoKHJlbmRlcmFibGVNYXRjaCkpID8gbnVsbCA6IHJlbmRlcmFibGVNYXRjaC5yZXNvdXJjZSkpXG5cdFx0LmZpbHRlcigocmVuZGVyYWJsZU1hdGNoKTogcmVuZGVyYWJsZU1hdGNoIGlzIFVSSSA9PiAocmVuZGVyYWJsZU1hdGNoICE9PSBudWxsKSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIG1vZGlmeVNlYXJjaEZpbGVUeXBlUGF0dGVybihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZmlsZU1hdGNoOiBJU2VhcmNoVHJlZUZpbGVNYXRjaCB8IHVuZGVmaW5lZCwgaXNFeGNsdWRlOiBib29sZWFuKSB7XG5cdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0Y29uc3Qgc2VhcmNoVmlldyA9IGdldFNlYXJjaFZpZXcodmlld3NTZXJ2aWNlKTtcblxuXHRpZiAoIXNlYXJjaFZpZXcgfHwgIWZpbGVNYXRjaCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IHJlc291cmNlID0gZmlsZU1hdGNoLnJlc291cmNlO1xuXHRjb25zdCBmaWxlTmFtZSA9IHJlc291cmNlLnBhdGguc3BsaXQoJy8nKS5wb3AoKSB8fCAnJztcblxuXHRjb25zdCBuZXdQYXR0ZXJuID0gZXh0cmFjdFNlYXJjaEZpbGVQYXR0ZXJuKGZpbGVOYW1lKTtcblx0Y29uc3QgcGF0dGVybldpZGdldCA9IGlzRXhjbHVkZSA/IHNlYXJjaFZpZXcuc2VhcmNoRXhjbHVkZVBhdHRlcm4gOiBzZWFyY2hWaWV3LnNlYXJjaEluY2x1ZGVQYXR0ZXJuO1xuXHRjb25zdCBjdXJyZW50UGF0dGVybnMgPSBwYXR0ZXJuV2lkZ2V0LmdldFZhbHVlKCk7XG5cdGNvbnN0IHVwZGF0ZWRQYXR0ZXJucyA9IG1lcmdlU2VhcmNoUGF0dGVybklmTm90RXhpc3RzKGN1cnJlbnRQYXR0ZXJucywgbmV3UGF0dGVybik7XG5cblx0aWYgKHVwZGF0ZWRQYXR0ZXJucyAhPT0gY3VycmVudFBhdHRlcm5zKSB7XG5cdFx0cGF0dGVybldpZGdldC5zZXRWYWx1ZSh1cGRhdGVkUGF0dGVybnMpO1xuXHRcdHNlYXJjaFZpZXcudG9nZ2xlUXVlcnlEZXRhaWxzKGZhbHNlLCB0cnVlKTtcblx0XHRzZWFyY2hWaWV3LnRyaWdnZXJRdWVyeUNoYW5nZSh7IHByZXNlcnZlRm9jdXM6IGZhbHNlIH0pO1xuXHR9XG59XG5cblxuLy8jZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxTQUFTLGVBQWU7QUFDeEIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsb0JBQXdEO0FBQ2pFLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBQzlCLFlBQVksZUFBZTtBQUMzQixZQUFZLDJCQUEyQjtBQUd2QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFNBQVMsUUFBUSx1QkFBdUI7QUFDakQsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyx5Q0FBeUM7QUFDbEQsU0FBUywyQkFBMkIsd0JBQXdCO0FBQzVELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsdUJBQXVCLHFCQUFxQiw2QkFBNkIsY0FBYyx3QkFBd0I7QUFDeEgsU0FBUyxpQ0FBaUM7QUFFMUMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxVQUFVLG9CQUFvQix3QkFBd0IsZUFBaUMsc0JBQXNCO0FBQ3RILFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsK0JBQStCO0FBQ3hDLFNBQW1HLHVCQUF1Qix5QkFBeUI7QUFFbkosZ0JBQWdCLE1BQU0scUNBQXFDLFFBQVE7QUFBQSxFQUNs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
