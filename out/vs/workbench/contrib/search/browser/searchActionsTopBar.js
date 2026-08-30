import * as nls from "../../../../nls.js";
import { WorkbenchListFocusContextKey } from "../../../../platform/list/browser/listService.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { searchClearIcon, searchCollapseAllIcon, searchExpandAllIcon, searchRefreshIcon, searchShowAsList, searchShowAsTree, searchStopIcon } from "./searchIcons.js";
import * as Constants from "../common/constants.js";
import { ISearchHistoryService } from "../common/searchHistoryService.js";
import { VIEW_ID } from "../../../services/search/common/search.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { SearchStateKey, SearchUIState } from "../common/search.js";
import { category, getSearchView } from "./searchActionsBase.js";
import { isSearchTreeMatch, isSearchTreeFolderMatch, isSearchTreeFolderMatchNoRoot, isSearchTreeFolderMatchWorkspaceRoot, isSearchResult, isTextSearchHeading, isSearchTreeFileMatch } from "./searchTreeModel/searchTreeCommon.js";
registerAction2(class ClearSearchHistoryCommandAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ClearSearchHistoryCommandId,
      title: nls.localize2("clearSearchHistoryLabel", "Clear Search History"),
      category,
      f1: true
    });
  }
  async run(accessor) {
    clearHistoryCommand(accessor);
  }
});
registerAction2(class CancelSearchAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.CancelSearchActionId,
      title: nls.localize2("CancelSearchAction.label", "Cancel Search"),
      icon: searchStopIcon,
      category,
      f1: true,
      precondition: SearchStateKey.isEqualTo(SearchUIState.Idle).negate(),
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, WorkbenchListFocusContextKey),
        primary: KeyCode.Escape
      },
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 0,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", VIEW_ID), SearchStateKey.isEqualTo(SearchUIState.SlowSearch))
      }]
    });
  }
  run(accessor) {
    return cancelSearch(accessor);
  }
});
registerAction2(class RefreshAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.RefreshSearchResultsActionId,
      title: nls.localize2("RefreshAction.label", "Refresh"),
      icon: searchRefreshIcon,
      precondition: Constants.SearchContext.ViewHasSearchPatternKey,
      category,
      f1: true,
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 0,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", VIEW_ID), SearchStateKey.isEqualTo(SearchUIState.SlowSearch).negate())
      }]
    });
  }
  run(accessor, ...args) {
    return refreshSearch(accessor);
  }
});
registerAction2(class CollapseDeepestExpandedLevelAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.CollapseSearchResultsActionId,
      title: nls.localize2("CollapseDeepestExpandedLevelAction.label", "Collapse All"),
      category,
      icon: searchCollapseAllIcon,
      f1: true,
      precondition: ContextKeyExpr.and(Constants.SearchContext.HasSearchResults, Constants.SearchContext.ViewHasSomeCollapsibleKey),
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 4,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", VIEW_ID), ContextKeyExpr.or(Constants.SearchContext.HasSearchResults.negate(), Constants.SearchContext.ViewHasSomeCollapsibleKey))
      }]
    });
  }
  run(accessor, ...args) {
    return collapseDeepestExpandedLevel(accessor);
  }
});
registerAction2(class ExpandAllAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ExpandSearchResultsActionId,
      title: nls.localize2("ExpandAllAction.label", "Expand All"),
      category,
      icon: searchExpandAllIcon,
      f1: true,
      precondition: ContextKeyExpr.and(Constants.SearchContext.HasSearchResults, Constants.SearchContext.ViewHasSomeCollapsibleKey.toNegated()),
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 4,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", VIEW_ID), Constants.SearchContext.HasSearchResults, Constants.SearchContext.ViewHasSomeCollapsibleKey.toNegated())
      }]
    });
  }
  async run(accessor, ...args) {
    return expandAll(accessor);
  }
});
registerAction2(class ClearSearchResultsAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ClearSearchResultsActionId,
      title: nls.localize2("ClearSearchResultsAction.label", "Clear Search Results"),
      category,
      icon: searchClearIcon,
      f1: true,
      precondition: ContextKeyExpr.or(Constants.SearchContext.HasSearchResults, Constants.SearchContext.ViewHasSearchPatternKey, Constants.SearchContext.ViewHasReplacePatternKey, Constants.SearchContext.ViewHasFilePatternKey),
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 1,
        when: ContextKeyExpr.equals("view", VIEW_ID)
      }]
    });
  }
  run(accessor, ...args) {
    return clearSearchResults(accessor);
  }
});
registerAction2(class ViewAsTreeAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ViewAsTreeActionId,
      title: nls.localize2("ViewAsTreeAction.label", "View as Tree"),
      category,
      icon: searchShowAsList,
      f1: true,
      precondition: ContextKeyExpr.and(Constants.SearchContext.HasSearchResults, Constants.SearchContext.InTreeViewKey.toNegated()),
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 2,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", VIEW_ID), Constants.SearchContext.InTreeViewKey.toNegated())
      }]
    });
  }
  async run(accessor, ...args) {
    const searchView = getSearchView(accessor.get(IViewsService));
    if (searchView) {
      await searchView.setTreeView(true);
    }
  }
});
registerAction2(class ViewAsListAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ViewAsListActionId,
      title: nls.localize2("ViewAsListAction.label", "View as List"),
      category,
      icon: searchShowAsTree,
      f1: true,
      precondition: ContextKeyExpr.and(Constants.SearchContext.HasSearchResults, Constants.SearchContext.InTreeViewKey),
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 2,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", VIEW_ID), Constants.SearchContext.InTreeViewKey)
      }]
    });
  }
  async run(accessor, ...args) {
    const searchView = getSearchView(accessor.get(IViewsService));
    if (searchView) {
      await searchView.setTreeView(false);
    }
  }
});
registerAction2(class SearchWithAIAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.SearchWithAIActionId,
      title: nls.localize2("SearchWithAIAction.label", "Search with AI"),
      category,
      f1: true,
      precondition: Constants.SearchContext.hasAIResultProvider,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(Constants.SearchContext.hasAIResultProvider, Constants.SearchContext.SearchViewFocusedKey),
        primary: KeyMod.CtrlCmd | KeyCode.KeyI
      }
    });
  }
  async run(accessor, ...args) {
    const searchView = getSearchView(accessor.get(IViewsService));
    if (searchView) {
      searchView.requestAIResults();
    }
  }
});
const clearHistoryCommand = (accessor) => {
  const searchHistoryService = accessor.get(ISearchHistoryService);
  searchHistoryService.clearHistory();
};
async function expandAll(accessor) {
  const viewsService = accessor.get(IViewsService);
  const searchView = getSearchView(viewsService);
  if (searchView) {
    const viewer = searchView.getControl();
    await forcedExpandRecursively(viewer, void 0);
  }
}
async function forcedExpandRecursively(viewer, element) {
  if (element) {
    if (!viewer.hasNode(element)) {
      return;
    }
    await viewer.expand(element, true);
  }
  const children = viewer.getNode(element)?.children;
  if (children) {
    for (const child of children) {
      if (isSearchResult(child.element)) {
        throw Error("SearchResult should not be a child of a RenderableMatch");
      }
      forcedExpandRecursively(viewer, child.element);
    }
  }
}
function clearSearchResults(accessor) {
  const viewsService = accessor.get(IViewsService);
  const searchView = getSearchView(viewsService);
  searchView?.clearSearchResults();
}
function cancelSearch(accessor) {
  const viewsService = accessor.get(IViewsService);
  const searchView = getSearchView(viewsService);
  searchView?.cancelSearch();
}
function refreshSearch(accessor) {
  const viewsService = accessor.get(IViewsService);
  const searchView = getSearchView(viewsService);
  searchView?.triggerQueryChange({ preserveFocus: false, shouldUpdateAISearch: !searchView.model.searchResult.aiTextSearchResult.hidden });
}
function collapseDeepestExpandedLevel(accessor) {
  const viewsService = accessor.get(IViewsService);
  const searchView = getSearchView(viewsService);
  if (searchView) {
    const viewer = searchView.getControl();
    const navigator = viewer.navigate();
    let node = navigator.first();
    let canCollapseFileMatchLevel = false;
    let canCollapseFirstLevel = false;
    do {
      node = navigator.next();
    } while (isTextSearchHeading(node));
    if (isSearchTreeFolderMatchWorkspaceRoot(node) || searchView.isTreeLayoutViewVisible) {
      while (node = navigator.next()) {
        if (isTextSearchHeading(node)) {
          continue;
        }
        if (isSearchTreeMatch(node)) {
          canCollapseFileMatchLevel = true;
          break;
        }
        if (searchView.isTreeLayoutViewVisible && !canCollapseFirstLevel) {
          let nodeToTest = node;
          if (isSearchTreeFolderMatch(node)) {
            const compressionStartNode = viewer.getCompressedTreeNode(node)?.elements[0].element;
            nodeToTest = compressionStartNode && !isSearchTreeMatch(compressionStartNode) && !isTextSearchHeading(compressionStartNode) && !isSearchResult(compressionStartNode) ? compressionStartNode : node;
          }
          const immediateParent = nodeToTest.parent();
          if (!(isTextSearchHeading(immediateParent) || isSearchTreeFolderMatchWorkspaceRoot(immediateParent) || isSearchTreeFolderMatchNoRoot(immediateParent) || isSearchResult(immediateParent))) {
            canCollapseFirstLevel = true;
          }
        }
      }
    }
    if (canCollapseFileMatchLevel) {
      node = navigator.first();
      do {
        if (isSearchTreeFileMatch(node)) {
          viewer.collapse(node);
        }
      } while (node = navigator.next());
    } else if (canCollapseFirstLevel) {
      node = navigator.first();
      if (node) {
        do {
          let nodeToTest = node;
          if (isSearchTreeFolderMatch(node)) {
            const compressionStartNode = viewer.getCompressedTreeNode(node)?.elements[0].element;
            nodeToTest = compressionStartNode && !isSearchTreeMatch(compressionStartNode) && !isSearchResult(compressionStartNode) ? compressionStartNode : node;
          }
          const immediateParent = nodeToTest.parent();
          if (isSearchTreeFolderMatchWorkspaceRoot(immediateParent) || isSearchTreeFolderMatchNoRoot(immediateParent)) {
            if (viewer.hasNode(node)) {
              viewer.collapse(node, true);
            } else {
              viewer.collapseAll();
            }
          }
        } while (node = navigator.next());
      }
    } else if (isTextSearchHeading(navigator.first())) {
      node = navigator.first();
      do {
        if (!node) {
          break;
        }
        if (isTextSearchHeading(viewer.getParentElement(node))) {
          viewer.collapse(node);
        }
      } while (node = navigator.next());
    } else {
      viewer.collapseAll();
    }
    const firstFocusParent = viewer.getFocus()[0]?.parent();
    if (firstFocusParent && (isSearchTreeFolderMatch(firstFocusParent) || isSearchTreeFileMatch(firstFocusParent)) && viewer.hasNode(firstFocusParent) && viewer.isCollapsed(firstFocusParent)) {
      viewer.domFocus();
      viewer.focusFirst();
      viewer.setSelection(viewer.getFocus());
    }
  }
}
export {
  forcedExpandRecursively
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNlYXJjaFxcYnJvd3Nlclxcc2VhcmNoQWN0aW9uc1RvcEJhci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRIYW5kbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWUsIFdvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgc2VhcmNoQ2xlYXJJY29uLCBzZWFyY2hDb2xsYXBzZUFsbEljb24sIHNlYXJjaEV4cGFuZEFsbEljb24sIHNlYXJjaFJlZnJlc2hJY29uLCBzZWFyY2hTaG93QXNMaXN0LCBzZWFyY2hTaG93QXNUcmVlLCBzZWFyY2hTdG9wSWNvbiB9IGZyb20gJy4vc2VhcmNoSWNvbnMuanMnO1xuaW1wb3J0ICogYXMgQ29uc3RhbnRzIGZyb20gJy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSVNlYXJjaEhpc3RvcnlTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3NlYXJjaEhpc3RvcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFZJRVdfSUQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IFNlYXJjaFN0YXRlS2V5LCBTZWFyY2hVSVN0YXRlIH0gZnJvbSAnLi4vY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBjYXRlZ29yeSwgZ2V0U2VhcmNoVmlldyB9IGZyb20gJy4vc2VhcmNoQWN0aW9uc0Jhc2UuanMnO1xuaW1wb3J0IHsgaXNTZWFyY2hUcmVlTWF0Y2gsIFJlbmRlcmFibGVNYXRjaCwgSVNlYXJjaFJlc3VsdCwgaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2gsIGlzU2VhcmNoVHJlZUZvbGRlck1hdGNoTm9Sb290LCBpc1NlYXJjaFRyZWVGb2xkZXJNYXRjaFdvcmtzcGFjZVJvb3QsIGlzU2VhcmNoUmVzdWx0LCBpc1RleHRTZWFyY2hIZWFkaW5nLCBpc1NlYXJjaFRyZWVGaWxlTWF0Y2ggfSBmcm9tICcuL3NlYXJjaFRyZWVNb2RlbC9zZWFyY2hUcmVlQ29tbW9uLmpzJztcblxuLy8jcmVnaW9uIEFjdGlvbnNcbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBDbGVhclNlYXJjaEhpc3RvcnlDb21tYW5kQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5DbGVhclNlYXJjaEhpc3RvcnlDb21tYW5kSWQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignY2xlYXJTZWFyY2hIaXN0b3J5TGFiZWwnLCBcIkNsZWFyIFNlYXJjaCBIaXN0b3J5XCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPGFueT4ge1xuXHRcdGNsZWFySGlzdG9yeUNvbW1hbmQoYWNjZXNzb3IpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENhbmNlbFNlYXJjaEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuQ2FuY2VsU2VhcmNoQWN0aW9uSWQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignQ2FuY2VsU2VhcmNoQWN0aW9uLmxhYmVsJywgXCJDYW5jZWwgU2VhcmNoXCIpLFxuXHRcdFx0aWNvbjogc2VhcmNoU3RvcEljb24sXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBTZWFyY2hTdGF0ZUtleS5pc0VxdWFsVG8oU2VhcmNoVUlTdGF0ZS5JZGxlKS5uZWdhdGUoKSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb25zdGFudHMuU2VhcmNoQ29udGV4dC5TZWFyY2hWaWV3VmlzaWJsZUtleSwgV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSksXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFZJRVdfSUQpLCBTZWFyY2hTdGF0ZUtleS5pc0VxdWFsVG8oU2VhcmNoVUlTdGF0ZS5TbG93U2VhcmNoKSksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdHJldHVybiBjYW5jZWxTZWFyY2goYWNjZXNzb3IpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFJlZnJlc2hBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLlJlZnJlc2hTZWFyY2hSZXN1bHRzQWN0aW9uSWQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignUmVmcmVzaEFjdGlvbi5sYWJlbCcsIFwiUmVmcmVzaFwiKSxcblx0XHRcdGljb246IHNlYXJjaFJlZnJlc2hJY29uLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5WaWV3SGFzU2VhcmNoUGF0dGVybktleSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBWSUVXX0lEKSwgU2VhcmNoU3RhdGVLZXkuaXNFcXVhbFRvKFNlYXJjaFVJU3RhdGUuU2xvd1NlYXJjaCkubmVnYXRlKCkpLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdHJldHVybiByZWZyZXNoU2VhcmNoKGFjY2Vzc29yKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBDb2xsYXBzZURlZXBlc3RFeHBhbmRlZExldmVsQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5Db2xsYXBzZVNlYXJjaFJlc3VsdHNBY3Rpb25JZCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdDb2xsYXBzZURlZXBlc3RFeHBhbmRlZExldmVsQWN0aW9uLmxhYmVsJywgXCJDb2xsYXBzZSBBbGxcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGljb246IHNlYXJjaENvbGxhcHNlQWxsSWNvbixcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuSGFzU2VhcmNoUmVzdWx0cywgQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuVmlld0hhc1NvbWVDb2xsYXBzaWJsZUtleSksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDQsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBWSUVXX0lEKSwgQ29udGV4dEtleUV4cHIub3IoQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuSGFzU2VhcmNoUmVzdWx0cy5uZWdhdGUoKSwgQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuVmlld0hhc1NvbWVDb2xsYXBzaWJsZUtleSkpLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdHJldHVybiBjb2xsYXBzZURlZXBlc3RFeHBhbmRlZExldmVsKGFjY2Vzc29yKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBFeHBhbmRBbGxBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLkV4cGFuZFNlYXJjaFJlc3VsdHNBY3Rpb25JZCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdFeHBhbmRBbGxBY3Rpb24ubGFiZWwnLCBcIkV4cGFuZCBBbGxcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGljb246IHNlYXJjaEV4cGFuZEFsbEljb24sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnN0YW50cy5TZWFyY2hDb250ZXh0Lkhhc1NlYXJjaFJlc3VsdHMsIENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlZpZXdIYXNTb21lQ29sbGFwc2libGVLZXkudG9OZWdhdGVkKCkpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiA0LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVklFV19JRCksIENvbnN0YW50cy5TZWFyY2hDb250ZXh0Lkhhc1NlYXJjaFJlc3VsdHMsIENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlZpZXdIYXNTb21lQ29sbGFwc2libGVLZXkudG9OZWdhdGVkKCkpLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdHJldHVybiBleHBhbmRBbGwoYWNjZXNzb3IpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENsZWFyU2VhcmNoUmVzdWx0c0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuQ2xlYXJTZWFyY2hSZXN1bHRzQWN0aW9uSWQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignQ2xlYXJTZWFyY2hSZXN1bHRzQWN0aW9uLmxhYmVsJywgXCJDbGVhciBTZWFyY2ggUmVzdWx0c1wiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0aWNvbjogc2VhcmNoQ2xlYXJJY29uLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLm9yKENvbnN0YW50cy5TZWFyY2hDb250ZXh0Lkhhc1NlYXJjaFJlc3VsdHMsIENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlZpZXdIYXNTZWFyY2hQYXR0ZXJuS2V5LCBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5WaWV3SGFzUmVwbGFjZVBhdHRlcm5LZXksIENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlZpZXdIYXNGaWxlUGF0dGVybktleSksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFZJRVdfSUQpLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdHJldHVybiBjbGVhclNlYXJjaFJlc3VsdHMoYWNjZXNzb3IpO1xuXHR9XG59KTtcblxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgVmlld0FzVHJlZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuVmlld0FzVHJlZUFjdGlvbklkLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ1ZpZXdBc1RyZWVBY3Rpb24ubGFiZWwnLCBcIlZpZXcgYXMgVHJlZVwiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0aWNvbjogc2VhcmNoU2hvd0FzTGlzdCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuSGFzU2VhcmNoUmVzdWx0cywgQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuSW5UcmVlVmlld0tleS50b05lZ2F0ZWQoKSksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBWSUVXX0lEKSwgQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuSW5UcmVlVmlld0tleS50b05lZ2F0ZWQoKSksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0Y29uc3Qgc2VhcmNoVmlldyA9IGdldFNlYXJjaFZpZXcoYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpKTtcblx0XHRpZiAoc2VhcmNoVmlldykge1xuXHRcdFx0YXdhaXQgc2VhcmNoVmlldy5zZXRUcmVlVmlldyh0cnVlKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgVmlld0FzTGlzdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuVmlld0FzTGlzdEFjdGlvbklkLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ1ZpZXdBc0xpc3RBY3Rpb24ubGFiZWwnLCBcIlZpZXcgYXMgTGlzdFwiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0aWNvbjogc2VhcmNoU2hvd0FzVHJlZSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuSGFzU2VhcmNoUmVzdWx0cywgQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuSW5UcmVlVmlld0tleSksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBWSUVXX0lEKSwgQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuSW5UcmVlVmlld0tleSksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0Y29uc3Qgc2VhcmNoVmlldyA9IGdldFNlYXJjaFZpZXcoYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpKTtcblx0XHRpZiAoc2VhcmNoVmlldykge1xuXHRcdFx0YXdhaXQgc2VhcmNoVmlldy5zZXRUcmVlVmlldyhmYWxzZSk7XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFNlYXJjaFdpdGhBSUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuU2VhcmNoV2l0aEFJQWN0aW9uSWQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignU2VhcmNoV2l0aEFJQWN0aW9uLmxhYmVsJywgXCJTZWFyY2ggd2l0aCBBSVwiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnN0YW50cy5TZWFyY2hDb250ZXh0Lmhhc0FJUmVzdWx0UHJvdmlkZXIsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuaGFzQUlSZXN1bHRQcm92aWRlciwgQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuU2VhcmNoVmlld0ZvY3VzZWRLZXkpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRjb25zdCBzZWFyY2hWaWV3ID0gZ2V0U2VhcmNoVmlldyhhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSkpO1xuXHRcdGlmIChzZWFyY2hWaWV3KSB7XG5cdFx0XHRzZWFyY2hWaWV3LnJlcXVlc3RBSVJlc3VsdHMoKTtcblx0XHR9XG5cdH1cbn0pO1xuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIEhlbHBlcnNcbmNvbnN0IGNsZWFySGlzdG9yeUNvbW1hbmQ6IElDb21tYW5kSGFuZGxlciA9IGFjY2Vzc29yID0+IHtcblx0Y29uc3Qgc2VhcmNoSGlzdG9yeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlYXJjaEhpc3RvcnlTZXJ2aWNlKTtcblx0c2VhcmNoSGlzdG9yeVNlcnZpY2UuY2xlYXJIaXN0b3J5KCk7XG59O1xuXG5hc3luYyBmdW5jdGlvbiBleHBhbmRBbGwoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRjb25zdCBzZWFyY2hWaWV3ID0gZ2V0U2VhcmNoVmlldyh2aWV3c1NlcnZpY2UpO1xuXHRpZiAoc2VhcmNoVmlldykge1xuXHRcdGNvbnN0IHZpZXdlciA9IHNlYXJjaFZpZXcuZ2V0Q29udHJvbCgpO1xuXHRcdGF3YWl0IGZvcmNlZEV4cGFuZFJlY3Vyc2l2ZWx5KHZpZXdlciwgdW5kZWZpbmVkKTtcblx0fVxufVxuXG4vKipcbiAqIFJlY3Vyc2l2ZWx5IGV4cGFuZCBhbGwgbm9kZXMgaW4gdGhlIHNlYXJjaCByZXN1bHRzIHRyZWUgdGhhdCBhcmUgYSBjaGlsZCBvZiBgZWxlbWVudGBcbiAqIElmIGBlbGVtZW50YCBpcyBub3QgcHJvdmlkZWQsIGl0IGlzIHRoZSByb290IG5vZGUuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBmb3JjZWRFeHBhbmRSZWN1cnNpdmVseShcblx0dmlld2VyOiBXb3JrYmVuY2hDb21wcmVzc2libGVBc3luY0RhdGFUcmVlPElTZWFyY2hSZXN1bHQsIFJlbmRlcmFibGVNYXRjaCwgdm9pZD4sXG5cdGVsZW1lbnQ6IFJlbmRlcmFibGVNYXRjaCB8IHVuZGVmaW5lZFxuKSB7XG5cdGlmIChlbGVtZW50KSB7XG5cdFx0aWYgKCF2aWV3ZXIuaGFzTm9kZShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB2aWV3ZXIuZXhwYW5kKGVsZW1lbnQsIHRydWUpO1xuXHR9XG5cblx0Y29uc3QgY2hpbGRyZW4gPSB2aWV3ZXIuZ2V0Tm9kZShlbGVtZW50KT8uY2hpbGRyZW47XG5cblx0aWYgKGNoaWxkcmVuKSB7XG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuXHRcdFx0aWYgKGlzU2VhcmNoUmVzdWx0KGNoaWxkLmVsZW1lbnQpKSB7XG5cdFx0XHRcdHRocm93IEVycm9yKCdTZWFyY2hSZXN1bHQgc2hvdWxkIG5vdCBiZSBhIGNoaWxkIG9mIGEgUmVuZGVyYWJsZU1hdGNoJyk7XG5cdFx0XHR9XG5cdFx0XHRmb3JjZWRFeHBhbmRSZWN1cnNpdmVseSh2aWV3ZXIsIGNoaWxkLmVsZW1lbnQpO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBjbGVhclNlYXJjaFJlc3VsdHMoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRjb25zdCBzZWFyY2hWaWV3ID0gZ2V0U2VhcmNoVmlldyh2aWV3c1NlcnZpY2UpO1xuXHRzZWFyY2hWaWV3Py5jbGVhclNlYXJjaFJlc3VsdHMoKTtcbn1cblxuZnVuY3Rpb24gY2FuY2VsU2VhcmNoKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0Y29uc3Qgc2VhcmNoVmlldyA9IGdldFNlYXJjaFZpZXcodmlld3NTZXJ2aWNlKTtcblx0c2VhcmNoVmlldz8uY2FuY2VsU2VhcmNoKCk7XG59XG5cbmZ1bmN0aW9uIHJlZnJlc2hTZWFyY2goYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRjb25zdCBzZWFyY2hWaWV3ID0gZ2V0U2VhcmNoVmlldyh2aWV3c1NlcnZpY2UpO1xuXHRzZWFyY2hWaWV3Py50cmlnZ2VyUXVlcnlDaGFuZ2UoeyBwcmVzZXJ2ZUZvY3VzOiBmYWxzZSwgc2hvdWxkVXBkYXRlQUlTZWFyY2g6ICFzZWFyY2hWaWV3Lm1vZGVsLnNlYXJjaFJlc3VsdC5haVRleHRTZWFyY2hSZXN1bHQuaGlkZGVuIH0pO1xufVxuXG5mdW5jdGlvbiBjb2xsYXBzZURlZXBlc3RFeHBhbmRlZExldmVsKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cblx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRjb25zdCBzZWFyY2hWaWV3ID0gZ2V0U2VhcmNoVmlldyh2aWV3c1NlcnZpY2UpO1xuXHRpZiAoc2VhcmNoVmlldykge1xuXHRcdGNvbnN0IHZpZXdlciA9IHNlYXJjaFZpZXcuZ2V0Q29udHJvbCgpO1xuXG5cdFx0LyoqXG5cdFx0ICogb25lIGxldmVsIHRvIGNvbGxhcHNlIHNvIGNvbGxhcHNlIGV2ZXJ5dGhpbmcuIElmIEZvbGRlck1hdGNoLCBjaGVjayBpZiB0aGVyZSBhcmUgdmlzaWJsZSBncmFuZGNoaWxkcmVuLFxuXHRcdCAqIGkuZS4gaWYgTWF0Y2hlcyBhcmUgcmV0dXJuZWQgYnkgdGhlIG5hdmlnYXRvciwgYW5kIGlmIHNvLCBjb2xsYXBzZSB0byB0aGVtLCBvdGhlcndpc2UgY29sbGFwc2UgYWxsIGxldmVscy5cblx0XHQgKi9cblx0XHRjb25zdCBuYXZpZ2F0b3IgPSB2aWV3ZXIubmF2aWdhdGUoKTtcblx0XHRsZXQgbm9kZSA9IG5hdmlnYXRvci5maXJzdCgpO1xuXHRcdGxldCBjYW5Db2xsYXBzZUZpbGVNYXRjaExldmVsID0gZmFsc2U7XG5cdFx0bGV0IGNhbkNvbGxhcHNlRmlyc3RMZXZlbCA9IGZhbHNlO1xuXG5cdFx0ZG8ge1xuXHRcdFx0bm9kZSA9IG5hdmlnYXRvci5uZXh0KCk7XG5cdFx0fSB3aGlsZSAoaXNUZXh0U2VhcmNoSGVhZGluZyhub2RlKSk7XG5cdFx0Ly8gZ28gdG8gdGhlIGZpcnN0IG5vbi1UZXh0U2VhcmNoUmVzdWx0IG5vZGVcblxuXHRcdGlmIChpc1NlYXJjaFRyZWVGb2xkZXJNYXRjaFdvcmtzcGFjZVJvb3Qobm9kZSkgfHwgc2VhcmNoVmlldy5pc1RyZWVMYXlvdXRWaWV3VmlzaWJsZSkge1xuXHRcdFx0d2hpbGUgKG5vZGUgPSBuYXZpZ2F0b3IubmV4dCgpKSB7XG5cdFx0XHRcdGlmIChpc1RleHRTZWFyY2hIZWFkaW5nKG5vZGUpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGlzU2VhcmNoVHJlZU1hdGNoKG5vZGUpKSB7XG5cdFx0XHRcdFx0Y2FuQ29sbGFwc2VGaWxlTWF0Y2hMZXZlbCA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHNlYXJjaFZpZXcuaXNUcmVlTGF5b3V0Vmlld1Zpc2libGUgJiYgIWNhbkNvbGxhcHNlRmlyc3RMZXZlbCkge1xuXHRcdFx0XHRcdGxldCBub2RlVG9UZXN0ID0gbm9kZTtcblxuXHRcdFx0XHRcdGlmIChpc1NlYXJjaFRyZWVGb2xkZXJNYXRjaChub2RlKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY29tcHJlc3Npb25TdGFydE5vZGUgPSB2aWV3ZXIuZ2V0Q29tcHJlc3NlZFRyZWVOb2RlKG5vZGUpPy5lbGVtZW50c1swXS5lbGVtZW50O1xuXHRcdFx0XHRcdFx0Ly8gTWF0Y2ggZWxlbWVudHMgc2hvdWxkIG5ldmVyIGJlIGNvbXByZXNzZWQsIHNvIGAhKGNvbXByZXNzaW9uU3RhcnROb2RlIGluc3RhbmNlb2YgTWF0Y2gpYCBzaG91bGQgYWx3YXlzIGJlIHRydWUgaGVyZS4gU2FtZSB3aXRoIGAhKGNvbXByZXNzaW9uU3RhcnROb2RlIGluc3RhbmNlb2YgVGV4dFNlYXJjaFJlc3VsdClgXG5cdFx0XHRcdFx0XHRub2RlVG9UZXN0ID0gY29tcHJlc3Npb25TdGFydE5vZGUgJiYgIShpc1NlYXJjaFRyZWVNYXRjaChjb21wcmVzc2lvblN0YXJ0Tm9kZSkpICYmICFpc1RleHRTZWFyY2hIZWFkaW5nKGNvbXByZXNzaW9uU3RhcnROb2RlKSAmJiAhKGlzU2VhcmNoUmVzdWx0KGNvbXByZXNzaW9uU3RhcnROb2RlKSkgPyBjb21wcmVzc2lvblN0YXJ0Tm9kZSA6IG5vZGU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgaW1tZWRpYXRlUGFyZW50ID0gbm9kZVRvVGVzdC5wYXJlbnQoKTtcblxuXHRcdFx0XHRcdGlmICghKGlzVGV4dFNlYXJjaEhlYWRpbmcoaW1tZWRpYXRlUGFyZW50KSB8fCBpc1NlYXJjaFRyZWVGb2xkZXJNYXRjaFdvcmtzcGFjZVJvb3QoaW1tZWRpYXRlUGFyZW50KSB8fCBpc1NlYXJjaFRyZWVGb2xkZXJNYXRjaE5vUm9vdChpbW1lZGlhdGVQYXJlbnQpIHx8IGlzU2VhcmNoUmVzdWx0KGltbWVkaWF0ZVBhcmVudCkpKSB7XG5cdFx0XHRcdFx0XHRjYW5Db2xsYXBzZUZpcnN0TGV2ZWwgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChjYW5Db2xsYXBzZUZpbGVNYXRjaExldmVsKSB7XG5cdFx0XHRub2RlID0gbmF2aWdhdG9yLmZpcnN0KCk7XG5cdFx0XHRkbyB7XG5cdFx0XHRcdGlmIChpc1NlYXJjaFRyZWVGaWxlTWF0Y2gobm9kZSkpIHtcblx0XHRcdFx0XHR2aWV3ZXIuY29sbGFwc2Uobm9kZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gd2hpbGUgKG5vZGUgPSBuYXZpZ2F0b3IubmV4dCgpKTtcblx0XHR9IGVsc2UgaWYgKGNhbkNvbGxhcHNlRmlyc3RMZXZlbCkge1xuXHRcdFx0bm9kZSA9IG5hdmlnYXRvci5maXJzdCgpO1xuXHRcdFx0aWYgKG5vZGUpIHtcblx0XHRcdFx0ZG8ge1xuXG5cdFx0XHRcdFx0bGV0IG5vZGVUb1Rlc3QgPSBub2RlO1xuXG5cdFx0XHRcdFx0aWYgKGlzU2VhcmNoVHJlZUZvbGRlck1hdGNoKG5vZGUpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjb21wcmVzc2lvblN0YXJ0Tm9kZSA9IHZpZXdlci5nZXRDb21wcmVzc2VkVHJlZU5vZGUobm9kZSk/LmVsZW1lbnRzWzBdLmVsZW1lbnQ7XG5cdFx0XHRcdFx0XHQvLyBNYXRjaCBlbGVtZW50cyBzaG91bGQgbmV2ZXIgYmUgY29tcHJlc3NlZCwgc28gIShjb21wcmVzc2lvblN0YXJ0Tm9kZSBpbnN0YW5jZW9mIE1hdGNoKSBzaG91bGQgYWx3YXlzIGJlIHRydWUgaGVyZVxuXHRcdFx0XHRcdFx0bm9kZVRvVGVzdCA9IChjb21wcmVzc2lvblN0YXJ0Tm9kZSAmJiAhKGlzU2VhcmNoVHJlZU1hdGNoKGNvbXByZXNzaW9uU3RhcnROb2RlKSkgJiYgIShpc1NlYXJjaFJlc3VsdChjb21wcmVzc2lvblN0YXJ0Tm9kZSkpID8gY29tcHJlc3Npb25TdGFydE5vZGUgOiBub2RlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgaW1tZWRpYXRlUGFyZW50ID0gbm9kZVRvVGVzdC5wYXJlbnQoKTtcblxuXHRcdFx0XHRcdGlmIChpc1NlYXJjaFRyZWVGb2xkZXJNYXRjaFdvcmtzcGFjZVJvb3QoaW1tZWRpYXRlUGFyZW50KSB8fCBpc1NlYXJjaFRyZWVGb2xkZXJNYXRjaE5vUm9vdChpbW1lZGlhdGVQYXJlbnQpKSB7XG5cdFx0XHRcdFx0XHRpZiAodmlld2VyLmhhc05vZGUobm9kZSkpIHtcblx0XHRcdFx0XHRcdFx0dmlld2VyLmNvbGxhcHNlKG5vZGUsIHRydWUpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dmlld2VyLmNvbGxhcHNlQWxsKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IHdoaWxlIChub2RlID0gbmF2aWdhdG9yLm5leHQoKSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChpc1RleHRTZWFyY2hIZWFkaW5nKG5hdmlnYXRvci5maXJzdCgpKSkge1xuXHRcdFx0Ly8gaWYgQUkgcmVzdWx0cyBhcmUgdmlzaWJsZSwganVzdCBjb2xsYXBzZSBldmVyeXRoaW5nIHVuZGVyIHRoZSBUZXh0U2VhcmNoUmVzdWx0LlxuXHRcdFx0bm9kZSA9IG5hdmlnYXRvci5maXJzdCgpO1xuXHRcdFx0ZG8ge1xuXHRcdFx0XHRpZiAoIW5vZGUpIHtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGlzVGV4dFNlYXJjaEhlYWRpbmcodmlld2VyLmdldFBhcmVudEVsZW1lbnQobm9kZSkpKSB7XG5cdFx0XHRcdFx0dmlld2VyLmNvbGxhcHNlKG5vZGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IHdoaWxlIChub2RlID0gbmF2aWdhdG9yLm5leHQoKSk7XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0dmlld2VyLmNvbGxhcHNlQWxsKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlyc3RGb2N1c1BhcmVudCA9IHZpZXdlci5nZXRGb2N1cygpWzBdPy5wYXJlbnQoKTtcblxuXHRcdGlmIChmaXJzdEZvY3VzUGFyZW50ICYmIChpc1NlYXJjaFRyZWVGb2xkZXJNYXRjaChmaXJzdEZvY3VzUGFyZW50KSB8fCBpc1NlYXJjaFRyZWVGaWxlTWF0Y2goZmlyc3RGb2N1c1BhcmVudCkpICYmXG5cdFx0XHR2aWV3ZXIuaGFzTm9kZShmaXJzdEZvY3VzUGFyZW50KSAmJiB2aWV3ZXIuaXNDb2xsYXBzZWQoZmlyc3RGb2N1c1BhcmVudCkpIHtcblx0XHRcdHZpZXdlci5kb21Gb2N1cygpO1xuXHRcdFx0dmlld2VyLmZvY3VzRmlyc3QoKTtcblx0XHRcdHZpZXdlci5zZXRTZWxlY3Rpb24odmlld2VyLmdldEZvY3VzKCkpO1xuXHRcdH1cblx0fVxufVxuXG4vLyNlbmRyZWdpb25cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUdyQixTQUE2QyxvQ0FBb0M7QUFDakYsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxpQkFBaUIsdUJBQXVCLHFCQUFxQixtQkFBbUIsa0JBQWtCLGtCQUFrQixzQkFBc0I7QUFDbkosWUFBWSxlQUFlO0FBQzNCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFNBQVMsUUFBUSx1QkFBdUI7QUFDakQsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyxnQkFBZ0IscUJBQXFCO0FBQzlDLFNBQVMsVUFBVSxxQkFBcUI7QUFDeEMsU0FBUyxtQkFBbUQseUJBQXlCLCtCQUErQixzQ0FBc0MsZ0JBQWdCLHFCQUFxQiw2QkFBNkI7QUFHNU4sZ0JBQWdCLE1BQU0sd0NBQXdDLFFBQVE7QUFBQSxFQUVyRSxjQUNFO0FBQ0QsVUFBTTtBQUFBLE1BQ0wsSUFBSSxVQUFVLGlCQUFpQjtBQUFBLE1BQy9CLE9BQU8sSUFBSSxVQUFVLDJCQUEyQixzQkFBc0I7QUFBQSxNQUN0RTtBQUFBLE1BQ0EsSUFBSTtBQUFBLElBQ0wsQ0FBQztBQUFBLEVBRUY7QUFBQSxFQUVBLE1BQWUsSUFBSSxVQUEwQztBQUM1RCx3QkFBb0IsUUFBUTtBQUFBLEVBQzdCO0FBQ0QsQ0FBQztBQUVELGdCQUFnQixNQUFNLDJCQUEyQixRQUFRO0FBQUEsRUFDeEQsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUks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
