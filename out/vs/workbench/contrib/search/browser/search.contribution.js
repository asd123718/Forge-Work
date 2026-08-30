import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import * as platform from "../../../../base/common/platform.js";
import * as nls from "../../../../nls.js";
import { ConfigurationScope, Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { Extensions as QuickAccessExtensions } from "../../../../platform/quickinput/common/quickAccess.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { ViewPaneContainer } from "../../../browser/parts/views/viewPaneContainer.js";
import { Extensions as ViewExtensions, ViewContainerLocation } from "../../../common/views.js";
import { searchViewIcon } from "./searchIcons.js";
import { SearchView } from "./searchView.js";
import { registerContributions as searchWidgetContributions } from "./searchWidget.js";
import { SearchViewModelWorkbenchService } from "./searchTreeModel/searchModel.js";
import { ISearchViewModelWorkbenchService } from "./searchTreeModel/searchViewModelWorkbenchService.js";
import { SearchSortOrder, SEARCH_EXCLUDE_CONFIG, VIEWLET_ID, ViewMode, VIEW_ID, DEFAULT_MAX_SEARCH_RESULTS, SemanticSearchBehavior } from "../../../services/search/common/search.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { assertType } from "../../../../base/common/types.js";
import { getWorkspaceSymbols, searchConfigurationNode } from "../common/search.js";
import * as Constants from "../common/constants.js";
import { SearchChatContextContribution } from "./searchChatContext.js";
import "./searchActionsCopy.js";
import "./searchActionsFind.js";
import "./searchActionsNav.js";
import "./searchActionsRemoveReplace.js";
import "./searchActionsTopBar.js";
import "./searchActionsTextQuickAccess.js";
import "./searchQuickAccess.contribution.js";
import "./search.common.contribution.js";
import { TEXT_SEARCH_QUICK_ACCESS_PREFIX, TextSearchQuickAccess } from "./quickTextSearch/textSearchQuickAccess.js";
import { Extensions } from "../../../common/configuration.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../common/contributions.js";
import { AccessibleViewRegistry } from "../../../../platform/accessibility/browser/accessibleViewRegistry.js";
import { SearchAccessibilityHelp } from "./searchAccessibilityHelp.js";
registerSingleton(ISearchViewModelWorkbenchService, SearchViewModelWorkbenchService, InstantiationType.Delayed);
searchWidgetContributions();
registerWorkbenchContribution2(SearchChatContextContribution.ID, SearchChatContextContribution, WorkbenchPhase.AfterRestored);
AccessibleViewRegistry.register(new SearchAccessibilityHelp());
const SEARCH_MODE_CONFIG = "search.mode";
const viewContainer = Registry.as(ViewExtensions.ViewContainersRegistry).registerViewContainer({
  id: VIEWLET_ID,
  title: nls.localize2("search", "Search"),
  ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [VIEWLET_ID, { mergeViewWithContainerWhenSingleView: true }]),
  hideIfEmpty: true,
  icon: searchViewIcon,
  order: 1
}, ViewContainerLocation.Sidebar, { doNotRegisterOpenCommand: true });
const viewDescriptor = {
  id: VIEW_ID,
  containerIcon: searchViewIcon,
  name: nls.localize2("search", "Search"),
  ctorDescriptor: new SyncDescriptor(SearchView),
  canToggleVisibility: false,
  canMoveView: true,
  openCommandActionDescriptor: {
    id: viewContainer.id,
    mnemonicTitle: nls.localize({ key: "miViewSearch", comment: ["&& denotes a mnemonic"] }, "&&Search"),
    keybindings: {
      primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF,
      // Yes, this is weird. See #116188, #115556, #115511, and now #124146, for examples of what can go wrong here.
      when: ContextKeyExpr.regex("neverMatch", /doesNotMatch/)
    },
    order: 1
  }
};
Registry.as(ViewExtensions.ViewsRegistry).registerViews([viewDescriptor], viewContainer);
const quickAccessRegistry = Registry.as(QuickAccessExtensions.Quickaccess);
quickAccessRegistry.registerQuickAccessProvider({
  ctor: TextSearchQuickAccess,
  prefix: TEXT_SEARCH_QUICK_ACCESS_PREFIX,
  contextKey: "inTextSearchPicker",
  placeholder: nls.localize("textSearchPickerPlaceholder", "Search for text in your workspace files."),
  helpEntries: [
    {
      description: nls.localize("textSearchPickerHelp", "Search for Text"),
      commandId: Constants.SearchCommandIds.QuickTextSearchActionId,
      commandCenterOrder: 25
    }
  ]
});
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
  ...searchConfigurationNode,
  properties: {
    [SEARCH_EXCLUDE_CONFIG]: {
      type: "object",
      markdownDescription: nls.localize("exclude", "Configure [glob patterns](https://code.visualstudio.com/docs/editor/codebasics#_advanced-search-options) for excluding files and folders in fulltext searches and file search in quick open. To exclude files from the recently opened list in quick open, patterns must be absolute (for example `**/node_modules/**`). Inherits all glob patterns from the `#files.exclude#` setting."),
      default: { "**/node_modules": true, "**/bower_components": true, "**/*.code-search": true },
      additionalProperties: {
        anyOf: [
          {
            type: "boolean",
            description: nls.localize("exclude.boolean", "The glob pattern to match file paths against. Set to true or false to enable or disable the pattern.")
          },
          {
            type: "object",
            properties: {
              when: {
                type: "string",
                // expression ({ "**/*.js": { "when": "$(basename).js" } })
                pattern: "\\w*\\$\\(basename\\)\\w*",
                default: "$(basename).ext",
                markdownDescription: nls.localize({ key: "exclude.when", comment: ["\\$(basename) should not be translated"] }, "Additional check on the siblings of a matching file. Use \\$(basename) as variable for the matching file name.")
              }
            }
          }
        ]
      },
      scope: ConfigurationScope.RESOURCE
    },
    [SEARCH_MODE_CONFIG]: {
      type: "string",
      enum: ["view", "reuseEditor", "newEditor"],
      default: "view",
      markdownDescription: nls.localize("search.mode", "Controls where new `Search: Find in Files` and `Find in Folder` operations occur: either in the Search view, or in a search editor."),
      enumDescriptions: [
        nls.localize("search.mode.view", "Search in the Search view, either in the panel or side bars."),
        nls.localize("search.mode.reuseEditor", "Search in an existing search editor if present, otherwise in a new search editor."),
        nls.localize("search.mode.newEditor", "Search in a new search editor.")
      ]
    },
    "search.useIgnoreFiles": {
      type: "boolean",
      markdownDescription: nls.localize("useIgnoreFiles", "Controls whether to use `.gitignore` and `.ignore` files when searching for files."),
      default: true,
      scope: ConfigurationScope.RESOURCE
    },
    "search.useGlobalIgnoreFiles": {
      type: "boolean",
      markdownDescription: nls.localize("useGlobalIgnoreFiles", "Controls whether to use your global gitignore file (for example, from `$HOME/.config/git/ignore`) when searching for files. Requires {0} to be enabled.", "`#search.useIgnoreFiles#`"),
      default: false,
      scope: ConfigurationScope.RESOURCE
    },
    "search.useParentIgnoreFiles": {
      type: "boolean",
      markdownDescription: nls.localize("useParentIgnoreFiles", "Controls whether to use `.gitignore` and `.ignore` files in parent directories when searching for files. Requires {0} to be enabled.", "`#search.useIgnoreFiles#`"),
      default: false,
      scope: ConfigurationScope.RESOURCE
    },
    "search.quickOpen.includeSymbols": {
      type: "boolean",
      description: nls.localize("search.quickOpen.includeSymbols", "Whether to include results from a global symbol search in the file results for Quick Open."),
      default: false
    },
    "search.ripgrep.maxThreads": {
      type: "number",
      description: nls.localize("search.ripgrep.maxThreads", "Number of threads to use for searching. When set to 0, the engine automatically determines this value."),
      default: 0
    },
    "search.quickOpen.includeHistory": {
      type: "boolean",
      description: nls.localize("search.quickOpen.includeHistory", "Whether to include results from recently opened files in the file results for Quick Open."),
      default: true,
      agentsWindow: { default: false }
    },
    "search.quickOpen.history.filterSortOrder": {
      type: "string",
      enum: ["default", "recency"],
      default: "default",
      enumDescriptions: [
        nls.localize("filterSortOrder.default", "History entries are sorted by relevance based on the filter value used. More relevant entries appear first."),
        nls.localize("filterSortOrder.recency", "History entries are sorted by recency. More recently opened entries appear first.")
      ],
      description: nls.localize("filterSortOrder", "Controls sorting order of editor history in quick open when filtering.")
    },
    "search.followSymlinks": {
      type: "boolean",
      description: nls.localize("search.followSymlinks", "Controls whether to follow symlinks while searching."),
      default: true
    },
    "search.smartCase": {
      type: "boolean",
      description: nls.localize("search.smartCase", "Search case-insensitively if the pattern is all lowercase, otherwise, search case-sensitively."),
      default: false
    },
    "search.globalFindClipboard": {
      type: "boolean",
      default: false,
      description: nls.localize("search.globalFindClipboard", "Controls whether the Search view should read or modify the shared find clipboard on macOS."),
      included: platform.isMacintosh
    },
    "search.maxResults": {
      type: ["number", "null"],
      default: DEFAULT_MAX_SEARCH_RESULTS,
      markdownDescription: nls.localize("search.maxResults", "Controls the maximum number of search results, this can be set to `null` (empty) to return unlimited results.")
    },
    "search.collapseResults": {
      type: "string",
      enum: ["auto", "alwaysCollapse", "alwaysExpand"],
      enumDescriptions: [
        nls.localize("search.collapseResults.auto", "Files with less than 10 results are expanded. Others are collapsed."),
        "",
        ""
      ],
      default: "alwaysExpand",
      description: nls.localize("search.collapseAllResults", "Controls whether the search results will be collapsed or expanded.")
    },
    "search.useReplacePreview": {
      type: "boolean",
      default: true,
      description: nls.localize("search.useReplacePreview", "Controls whether to open Replace Preview when selecting or replacing a match.")
    },
    "search.showLineNumbers": {
      type: "boolean",
      default: false,
      description: nls.localize("search.showLineNumbers", "Controls whether to show line numbers for search results.")
    },
    "search.actionsPosition": {
      type: "string",
      enum: ["auto", "right"],
      enumDescriptions: [
        nls.localize("search.actionsPositionAuto", "Position the actionbar to the right when the Search view is narrow, and immediately after the content when the Search view is wide."),
        nls.localize("search.actionsPositionRight", "Always position the actionbar to the right.")
      ],
      default: "right",
      description: nls.localize("search.actionsPosition", "Controls the positioning of the actionbar on rows in the Search view.")
    },
    "search.seedWithNearestWord": {
      type: "boolean",
      default: false,
      description: nls.localize("search.seedWithNearestWord", "Enable seeding search from the word nearest the cursor when the active editor has no selection.")
    },
    "search.seedOnFocus": {
      type: "boolean",
      default: false,
      markdownDescription: nls.localize("search.seedOnFocus", "Update the search query to the editor's selected text when focusing the Search view. This happens either on click or when triggering the `workbench.views.search.focus` command.")
    },
    "search.sortOrder": {
      type: "string",
      enum: [SearchSortOrder.Default, SearchSortOrder.FileNames, SearchSortOrder.Type, SearchSortOrder.Modified, SearchSortOrder.CountDescending, SearchSortOrder.CountAscending],
      default: SearchSortOrder.Default,
      enumDescriptions: [
        nls.localize("searchSortOrder.default", "Results are sorted by folder and file names, in alphabetical order."),
        nls.localize("searchSortOrder.filesOnly", "Results are sorted by file names ignoring folder order, in alphabetical order."),
        nls.localize("searchSortOrder.type", "Results are sorted by file extensions, in alphabetical order."),
        nls.localize("searchSortOrder.modified", "Results are sorted by file last modified date, in descending order."),
        nls.localize("searchSortOrder.countDescending", "Results are sorted by count per file, in descending order."),
        nls.localize("searchSortOrder.countAscending", "Results are sorted by count per file, in ascending order.")
      ],
      description: nls.localize("search.sortOrder", "Controls sorting order of search results.")
    },
    "search.decorations.colors": {
      type: "boolean",
      description: nls.localize("search.decorations.colors", "Controls whether search file decorations should use colors."),
      default: true
    },
    "search.decorations.badges": {
      type: "boolean",
      description: nls.localize("search.decorations.badges", "Controls whether search file decorations should use badges."),
      default: true
    },
    "search.defaultViewMode": {
      type: "string",
      enum: [ViewMode.Tree, ViewMode.List],
      default: ViewMode.List,
      enumDescriptions: [
        nls.localize("scm.defaultViewMode.tree", "Shows search results as a tree."),
        nls.localize("scm.defaultViewMode.list", "Shows search results as a list.")
      ],
      description: nls.localize("search.defaultViewMode", "Controls the default search result view mode.")
    },
    "search.quickAccess.preserveInput": {
      type: "boolean",
      description: nls.localize("search.quickAccess.preserveInput", "Controls whether the last typed input to Quick Search should be restored when opening it the next time."),
      default: false
    },
    "search.experimental.closedNotebookRichContentResults": {
      type: "boolean",
      description: nls.localize("search.experimental.closedNotebookResults", "Show notebook editor rich content results for closed notebooks. Please refresh your search results after changing this setting."),
      default: false
    },
    "search.experimental.useIgnoreFilesInFindFiles": {
      type: "boolean",
      default: false,
      markdownDescription: nls.localize("search.experimental.useIgnoreFilesInFindFiles", "When enabled, the legacy `findFiles` extension API honors the user's `#search.useIgnoreFiles#` setting instead of always ignoring `.gitignore`. Extensions that explicitly pass `null` as the `exclude` argument still get unfiltered results. Telemetry is emitted regardless of this setting to help decide future defaults."),
      tags: ["experimental"]
    },
    "search.searchView.semanticSearchBehavior": {
      type: "string",
      description: nls.localize("search.searchView.semanticSearchBehavior", "Controls the behavior of the semantic search results displayed in the Search view."),
      enum: [SemanticSearchBehavior.Manual, SemanticSearchBehavior.RunOnEmpty, SemanticSearchBehavior.Auto],
      default: SemanticSearchBehavior.Manual,
      enumDescriptions: [
        nls.localize("search.searchView.semanticSearchBehavior.manual", "Only request semantic search results manually."),
        nls.localize("search.searchView.semanticSearchBehavior.runOnEmpty", "Request semantic results automatically only when text search results are empty."),
        nls.localize("search.searchView.semanticSearchBehavior.auto", "Request semantic results automatically with every search.")
      ],
      tags: ["preview"]
    },
    "search.searchView.keywordSuggestions": {
      type: "boolean",
      description: nls.localize("search.searchView.keywordSuggestions", "Enable keyword suggestions in the Search view."),
      default: false,
      tags: ["preview"]
    }
  }
});
CommandsRegistry.registerCommand("_executeWorkspaceSymbolProvider", async function(accessor, ...args) {
  const [query] = args;
  assertType(typeof query === "string");
  const result = await getWorkspaceSymbols(query);
  return result.map((item) => item.symbol);
});
Registry.as(Extensions.ConfigurationMigration).registerConfigurationMigrations([{
  key: "search.experimental.quickAccess.preserveInput",
  migrateFn: (value, _accessor) => [
    ["search.quickAccess.preserveInput", { value }],
    ["search.experimental.quickAccess.preserveInput", { value: void 0 }]
  ]
}]);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNlYXJjaFxcYnJvd3Nlclxcc2VhcmNoLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblNjb3BlLCBFeHRlbnNpb25zIGFzIENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBRdWlja0FjY2Vzc0V4dGVuc2lvbnMsIElRdWlja0FjY2Vzc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tBY2Nlc3MuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVmlld1BhbmVDb250YWluZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lQ29udGFpbmVyLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgVmlld0V4dGVuc2lvbnMsIElWaWV3Q29udGFpbmVyc1JlZ2lzdHJ5LCBJVmlld0Rlc2NyaXB0b3IsIElWaWV3c1JlZ2lzdHJ5LCBWaWV3Q29udGFpbmVyTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgc2VhcmNoVmlld0ljb24gfSBmcm9tICcuL3NlYXJjaEljb25zLmpzJztcbmltcG9ydCB7IFNlYXJjaFZpZXcgfSBmcm9tICcuL3NlYXJjaFZpZXcuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJDb250cmlidXRpb25zIGFzIHNlYXJjaFdpZGdldENvbnRyaWJ1dGlvbnMgfSBmcm9tICcuL3NlYXJjaFdpZGdldC5qcyc7XG5pbXBvcnQgeyBTZWFyY2hWaWV3TW9kZWxXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi9zZWFyY2hUcmVlTW9kZWwvc2VhcmNoTW9kZWwuanMnO1xuaW1wb3J0IHsgSVNlYXJjaFZpZXdNb2RlbFdvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuL3NlYXJjaFRyZWVNb2RlbC9zZWFyY2hWaWV3TW9kZWxXb3JrYmVuY2hTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlYXJjaFNvcnRPcmRlciwgU0VBUkNIX0VYQ0xVREVfQ09ORklHLCBWSUVXTEVUX0lELCBWaWV3TW9kZSwgVklFV19JRCwgREVGQVVMVF9NQVhfU0VBUkNIX1JFU1VMVFMsIFNlbWFudGljU2VhcmNoQmVoYXZpb3IgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IGFzc2VydFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBnZXRXb3Jrc3BhY2VTeW1ib2xzLCBJV29ya3NwYWNlU3ltYm9sLCBzZWFyY2hDb25maWd1cmF0aW9uTm9kZSB9IGZyb20gJy4uL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0ICogYXMgQ29uc3RhbnRzIGZyb20gJy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgU2VhcmNoQ2hhdENvbnRleHRDb250cmlidXRpb24gfSBmcm9tICcuL3NlYXJjaENoYXRDb250ZXh0LmpzJztcblxuaW1wb3J0ICcuL3NlYXJjaEFjdGlvbnNDb3B5LmpzJztcbmltcG9ydCAnLi9zZWFyY2hBY3Rpb25zRmluZC5qcyc7XG5pbXBvcnQgJy4vc2VhcmNoQWN0aW9uc05hdi5qcyc7XG5pbXBvcnQgJy4vc2VhcmNoQWN0aW9uc1JlbW92ZVJlcGxhY2UuanMnO1xuaW1wb3J0ICcuL3NlYXJjaEFjdGlvbnNUb3BCYXIuanMnO1xuaW1wb3J0ICcuL3NlYXJjaEFjdGlvbnNUZXh0UXVpY2tBY2Nlc3MuanMnO1xuaW1wb3J0ICcuL3NlYXJjaFF1aWNrQWNjZXNzLmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgJy4vc2VhcmNoLmNvbW1vbi5jb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgVEVYVF9TRUFSQ0hfUVVJQ0tfQUNDRVNTX1BSRUZJWCwgVGV4dFNlYXJjaFF1aWNrQWNjZXNzIH0gZnJvbSAnLi9xdWlja1RleHRTZWFyY2gvdGV4dFNlYXJjaFF1aWNrQWNjZXNzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uTWlncmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIsIFdvcmtiZW5jaFBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJsZVZpZXdSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmxlVmlld1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFNlYXJjaEFjY2Vzc2liaWxpdHlIZWxwIH0gZnJvbSAnLi9zZWFyY2hBY2Nlc3NpYmlsaXR5SGVscC5qcyc7XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElTZWFyY2hWaWV3TW9kZWxXb3JrYmVuY2hTZXJ2aWNlLCBTZWFyY2hWaWV3TW9kZWxXb3JrYmVuY2hTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcblxuc2VhcmNoV2lkZ2V0Q29udHJpYnV0aW9ucygpO1xuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoU2VhcmNoQ2hhdENvbnRleHRDb250cmlidXRpb24uSUQsIFNlYXJjaENoYXRDb250ZXh0Q29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcblxuQWNjZXNzaWJsZVZpZXdSZWdpc3RyeS5yZWdpc3RlcihuZXcgU2VhcmNoQWNjZXNzaWJpbGl0eUhlbHAoKSk7XG5cbmNvbnN0IFNFQVJDSF9NT0RFX0NPTkZJRyA9ICdzZWFyY2gubW9kZSc7XG5cbmNvbnN0IHZpZXdDb250YWluZXIgPSBSZWdpc3RyeS5hczxJVmlld0NvbnRhaW5lcnNSZWdpc3RyeT4oVmlld0V4dGVuc2lvbnMuVmlld0NvbnRhaW5lcnNSZWdpc3RyeSkucmVnaXN0ZXJWaWV3Q29udGFpbmVyKHtcblx0aWQ6IFZJRVdMRVRfSUQsXG5cdHRpdGxlOiBubHMubG9jYWxpemUyKCdzZWFyY2gnLCBcIlNlYXJjaFwiKSxcblx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihWaWV3UGFuZUNvbnRhaW5lciwgW1ZJRVdMRVRfSUQsIHsgbWVyZ2VWaWV3V2l0aENvbnRhaW5lcldoZW5TaW5nbGVWaWV3OiB0cnVlIH1dKSxcblx0aGlkZUlmRW1wdHk6IHRydWUsXG5cdGljb246IHNlYXJjaFZpZXdJY29uLFxuXHRvcmRlcjogMSxcbn0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyLCB7IGRvTm90UmVnaXN0ZXJPcGVuQ29tbWFuZDogdHJ1ZSB9KTtcblxuY29uc3Qgdmlld0Rlc2NyaXB0b3I6IElWaWV3RGVzY3JpcHRvciA9IHtcblx0aWQ6IFZJRVdfSUQsXG5cdGNvbnRhaW5lckljb246IHNlYXJjaFZpZXdJY29uLFxuXHRuYW1lOiBubHMubG9jYWxpemUyKCdzZWFyY2gnLCBcIlNlYXJjaFwiKSxcblx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihTZWFyY2hWaWV3KSxcblx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogZmFsc2UsXG5cdGNhbk1vdmVWaWV3OiB0cnVlLFxuXHRvcGVuQ29tbWFuZEFjdGlvbkRlc2NyaXB0b3I6IHtcblx0XHRpZDogdmlld0NvbnRhaW5lci5pZCxcblx0XHRtbmVtb25pY1RpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaVZpZXdTZWFyY2gnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZTZWFyY2hcIiksXG5cdFx0a2V5YmluZGluZ3M6IHtcblx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlGLFxuXHRcdFx0Ly8gWWVzLCB0aGlzIGlzIHdlaXJkLiBTZWUgIzExNjE4OCwgIzExNTU1NiwgIzExNTUxMSwgYW5kIG5vdyAjMTI0MTQ2LCBmb3IgZXhhbXBsZXMgb2Ygd2hhdCBjYW4gZ28gd3JvbmcgaGVyZS5cblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLnJlZ2V4KCduZXZlck1hdGNoJywgL2RvZXNOb3RNYXRjaC8pXG5cdFx0fSxcblx0XHRvcmRlcjogMVxuXHR9XG59O1xuXG4vLyBSZWdpc3RlciBzZWFyY2ggZGVmYXVsdCBsb2NhdGlvbiB0byBzaWRlYmFyXG5SZWdpc3RyeS5hczxJVmlld3NSZWdpc3RyeT4oVmlld0V4dGVuc2lvbnMuVmlld3NSZWdpc3RyeSkucmVnaXN0ZXJWaWV3cyhbdmlld0Rlc2NyaXB0b3JdLCB2aWV3Q29udGFpbmVyKTtcblxuLy8gUmVnaXN0ZXIgUXVpY2sgQWNjZXNzIEhhbmRsZXJcbmNvbnN0IHF1aWNrQWNjZXNzUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJUXVpY2tBY2Nlc3NSZWdpc3RyeT4oUXVpY2tBY2Nlc3NFeHRlbnNpb25zLlF1aWNrYWNjZXNzKTtcblxucXVpY2tBY2Nlc3NSZWdpc3RyeS5yZWdpc3RlclF1aWNrQWNjZXNzUHJvdmlkZXIoe1xuXHRjdG9yOiBUZXh0U2VhcmNoUXVpY2tBY2Nlc3MsXG5cdHByZWZpeDogVEVYVF9TRUFSQ0hfUVVJQ0tfQUNDRVNTX1BSRUZJWCxcblx0Y29udGV4dEtleTogJ2luVGV4dFNlYXJjaFBpY2tlcicsXG5cdHBsYWNlaG9sZGVyOiBubHMubG9jYWxpemUoJ3RleHRTZWFyY2hQaWNrZXJQbGFjZWhvbGRlcicsIFwiU2VhcmNoIGZvciB0ZXh0IGluIHlvdXIgd29ya3NwYWNlIGZpbGVzLlwiKSxcblx0aGVscEVudHJpZXM6IFtcblx0XHR7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd0ZXh0U2VhcmNoUGlja2VySGVscCcsIFwiU2VhcmNoIGZvciBUZXh0XCIpLFxuXHRcdFx0Y29tbWFuZElkOiBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5RdWlja1RleHRTZWFyY2hBY3Rpb25JZCxcblx0XHRcdGNvbW1hbmRDZW50ZXJPcmRlcjogMjUsXG5cdFx0fVxuXHRdXG59KTtcblxuLy8gQ29uZmlndXJhdGlvblxuY29uc3QgY29uZmlndXJhdGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5jb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0Li4uc2VhcmNoQ29uZmlndXJhdGlvbk5vZGUsXG5cdHByb3BlcnRpZXM6IHtcblx0XHRbU0VBUkNIX0VYQ0xVREVfQ09ORklHXToge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2V4Y2x1ZGUnLCBcIkNvbmZpZ3VyZSBbZ2xvYiBwYXR0ZXJuc10oaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vZG9jcy9lZGl0b3IvY29kZWJhc2ljcyNfYWR2YW5jZWQtc2VhcmNoLW9wdGlvbnMpIGZvciBleGNsdWRpbmcgZmlsZXMgYW5kIGZvbGRlcnMgaW4gZnVsbHRleHQgc2VhcmNoZXMgYW5kIGZpbGUgc2VhcmNoIGluIHF1aWNrIG9wZW4uIFRvIGV4Y2x1ZGUgZmlsZXMgZnJvbSB0aGUgcmVjZW50bHkgb3BlbmVkIGxpc3QgaW4gcXVpY2sgb3BlbiwgcGF0dGVybnMgbXVzdCBiZSBhYnNvbHV0ZSAoZm9yIGV4YW1wbGUgYCoqL25vZGVfbW9kdWxlcy8qKmApLiBJbmhlcml0cyBhbGwgZ2xvYiBwYXR0ZXJucyBmcm9tIHRoZSBgI2ZpbGVzLmV4Y2x1ZGUjYCBzZXR0aW5nLlwiKSxcblx0XHRcdGRlZmF1bHQ6IHsgJyoqL25vZGVfbW9kdWxlcyc6IHRydWUsICcqKi9ib3dlcl9jb21wb25lbnRzJzogdHJ1ZSwgJyoqLyouY29kZS1zZWFyY2gnOiB0cnVlIH0sXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHRhbnlPZjogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2V4Y2x1ZGUuYm9vbGVhbicsIFwiVGhlIGdsb2IgcGF0dGVybiB0byBtYXRjaCBmaWxlIHBhdGhzIGFnYWluc3QuIFNldCB0byB0cnVlIG9yIGZhbHNlIHRvIGVuYWJsZSBvciBkaXNhYmxlIHRoZSBwYXR0ZXJuLlwiKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHR3aGVuOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsIC8vIGV4cHJlc3Npb24gKHsgXCIqKi8qLmpzXCI6IHsgXCJ3aGVuXCI6IFwiJChiYXNlbmFtZSkuanNcIiB9IH0pXG5cdFx0XHRcdFx0XHRcdFx0cGF0dGVybjogJ1xcXFx3KlxcXFwkXFxcXChiYXNlbmFtZVxcXFwpXFxcXHcqJyxcblx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAnJChiYXNlbmFtZSkuZXh0Jyxcblx0XHRcdFx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoeyBrZXk6ICdleGNsdWRlLndoZW4nLCBjb21tZW50OiBbJ1xcXFwkKGJhc2VuYW1lKSBzaG91bGQgbm90IGJlIHRyYW5zbGF0ZWQnXSB9LCAnQWRkaXRpb25hbCBjaGVjayBvbiB0aGUgc2libGluZ3Mgb2YgYSBtYXRjaGluZyBmaWxlLiBVc2UgXFxcXCQoYmFzZW5hbWUpIGFzIHZhcmlhYmxlIGZvciB0aGUgbWF0Y2hpbmcgZmlsZSBuYW1lLicpXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH0sXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLlJFU09VUkNFXG5cdFx0fSxcblx0XHRbU0VBUkNIX01PREVfQ09ORklHXToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ3ZpZXcnLCAncmV1c2VFZGl0b3InLCAnbmV3RWRpdG9yJ10sXG5cdFx0XHRkZWZhdWx0OiAndmlldycsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NlYXJjaC5tb2RlJywgXCJDb250cm9scyB3aGVyZSBuZXcgYFNlYXJjaDogRmluZCBpbiBGaWxlc2AgYW5kIGBGaW5kIGluIEZvbGRlcmAgb3BlcmF0aW9ucyBvY2N1cjogZWl0aGVyIGluIHRoZSBTZWFyY2ggdmlldywgb3IgaW4gYSBzZWFyY2ggZWRpdG9yLlwiKSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzZWFyY2gubW9kZS52aWV3JywgXCJTZWFyY2ggaW4gdGhlIFNlYXJjaCB2aWV3LCBlaXRoZXIgaW4gdGhlIHBhbmVsIG9yIHNpZGUgYmFycy5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2VhcmNoLm1vZGUucmV1c2VFZGl0b3InLCBcIlNlYXJjaCBpbiBhbiBleGlzdGluZyBzZWFyY2ggZWRpdG9yIGlmIHByZXNlbnQsIG90aGVyd2lzZSBpbiBhIG5ldyBzZWFyY2ggZWRpdG9yLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzZWFyY2gubW9kZS5uZXdFZGl0b3InLCBcIlNlYXJjaCBpbiBhIG5ldyBzZWFyY2ggZWRpdG9yLlwiKSxcblx0XHRcdF1cblx0XHR9LFxuXHRcdCdzZWFyY2gudXNlSWdub3JlRmlsZXMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3VzZUlnbm9yZUZpbGVzJywgXCJDb250cm9scyB3aGV0aGVyIHRvIHVzZSBgLmdpdGlnbm9yZWAgYW5kIGAuaWdub3JlYCBmaWxlcyB3aGVuIHNlYXJjaGluZyBmb3IgZmlsZXMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuUkVTT1VSQ0Vcblx0XHR9LFxuXHRcdCdzZWFyY2gudXNlR2xvYmFsSWdub3JlRmlsZXMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3VzZUdsb2JhbElnbm9yZUZpbGVzJywgXCJDb250cm9scyB3aGV0aGVyIHRvIHVzZSB5b3VyIGdsb2JhbCBnaXRpZ25vcmUgZmlsZSAoZm9yIGV4YW1wbGUsIGZyb20gYCRIT01FLy5jb25maWcvZ2l0L2lnbm9yZWApIHdoZW4gc2VhcmNoaW5nIGZvciBmaWxlcy4gUmVxdWlyZXMgezB9IHRvIGJlIGVuYWJsZWQuXCIsICdgI3NlYXJjaC51c2VJZ25vcmVGaWxlcyNgJyksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuUkVTT1VSQ0Vcblx0XHR9LFxuXHRcdCdzZWFyY2gudXNlUGFyZW50SWdub3JlRmlsZXMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3VzZVBhcmVudElnbm9yZUZpbGVzJywgXCJDb250cm9scyB3aGV0aGVyIHRvIHVzZSBgLmdpdGlnbm9yZWAgYW5kIGAuaWdub3JlYCBmaWxlcyBpbiBwYXJlbnQgZGlyZWN0b3JpZXMgd2hlbiBzZWFyY2hpbmcgZm9yIGZpbGVzLiBSZXF1aXJlcyB7MH0gdG8gYmUgZW5hYmxlZC5cIiwgJ2Ajc2VhcmNoLnVzZUlnbm9yZUZpbGVzI2AnKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5SRVNPVVJDRVxuXHRcdH0sXG5cdFx0J3NlYXJjaC5xdWlja09wZW4uaW5jbHVkZVN5bWJvbHMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzZWFyY2gucXVpY2tPcGVuLmluY2x1ZGVTeW1ib2xzJywgXCJXaGV0aGVyIHRvIGluY2x1ZGUgcmVzdWx0cyBmcm9tIGEgZ2xvYmFsIHN5bWJvbCBzZWFyY2ggaW4gdGhlIGZpbGUgcmVzdWx0cyBmb3IgUXVpY2sgT3Blbi5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdH0sXG5cdFx0J3NlYXJjaC5yaXBncmVwLm1heFRocmVhZHMnOiB7XG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NlYXJjaC5yaXBncmVwLm1heFRocmVhZHMnLCBcIk51bWJlciBvZiB0aHJlYWRzIHRvIHVzZSBmb3Igc2VhcmNoaW5nLiBXaGVuIHNldCB0byAwLCB0aGUgZW5naW5lIGF1dG9tYXRpY2FsbHkgZGV0ZXJtaW5lcyB0aGlzIHZhbHVlLlwiKSxcblx0XHRcdGRlZmF1bHQ6IDBcblx0XHR9LFxuXHRcdCdzZWFyY2gucXVpY2tPcGVuLmluY2x1ZGVIaXN0b3J5Jzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2VhcmNoLnF1aWNrT3Blbi5pbmNsdWRlSGlzdG9yeScsIFwiV2hldGhlciB0byBpbmNsdWRlIHJlc3VsdHMgZnJvbSByZWNlbnRseSBvcGVuZWQgZmlsZXMgaW4gdGhlIGZpbGUgcmVzdWx0cyBmb3IgUXVpY2sgT3Blbi5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0YWdlbnRzV2luZG93OiB7IGRlZmF1bHQ6IGZhbHNlIH0sXG5cdFx0fSxcblx0XHQnc2VhcmNoLnF1aWNrT3Blbi5oaXN0b3J5LmZpbHRlclNvcnRPcmRlcic6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydkZWZhdWx0JywgJ3JlY2VuY3knXSxcblx0XHRcdGRlZmF1bHQ6ICdkZWZhdWx0Jyxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdmaWx0ZXJTb3J0T3JkZXIuZGVmYXVsdCcsICdIaXN0b3J5IGVudHJpZXMgYXJlIHNvcnRlZCBieSByZWxldmFuY2UgYmFzZWQgb24gdGhlIGZpbHRlciB2YWx1ZSB1c2VkLiBNb3JlIHJlbGV2YW50IGVudHJpZXMgYXBwZWFyIGZpcnN0LicpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2ZpbHRlclNvcnRPcmRlci5yZWNlbmN5JywgJ0hpc3RvcnkgZW50cmllcyBhcmUgc29ydGVkIGJ5IHJlY2VuY3kuIE1vcmUgcmVjZW50bHkgb3BlbmVkIGVudHJpZXMgYXBwZWFyIGZpcnN0LicpXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZmlsdGVyU29ydE9yZGVyJywgXCJDb250cm9scyBzb3J0aW5nIG9yZGVyIG9mIGVkaXRvciBoaXN0b3J5IGluIHF1aWNrIG9wZW4gd2hlbiBmaWx0ZXJpbmcuXCIpXG5cdFx0fSxcblx0XHQnc2VhcmNoLmZvbGxvd1N5bWxpbmtzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2VhcmNoLmZvbGxvd1N5bWxpbmtzJywgXCJDb250cm9scyB3aGV0aGVyIHRvIGZvbGxvdyBzeW1saW5rcyB3aGlsZSBzZWFyY2hpbmcuXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdH0sXG5cdFx0J3NlYXJjaC5zbWFydENhc2UnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzZWFyY2guc21hcnRDYXNlJywgXCJTZWFyY2ggY2FzZS1pbnNlbnNpdGl2ZWx5IGlmIHRoZSBwYXR0ZXJuIGlzIGFsbCBsb3dlcmNhc2UsIG90aGVyd2lzZSwgc2VhcmNoIGNhc2Utc2Vuc2l0aXZlbHkuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHR9LFxuXHRcdCdzZWFyY2guZ2xvYmFsRmluZENsaXBib2FyZCc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2VhcmNoLmdsb2JhbEZpbmRDbGlwYm9hcmQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIFNlYXJjaCB2aWV3IHNob3VsZCByZWFkIG9yIG1vZGlmeSB0aGUgc2hhcmVkIGZpbmQgY2xpcGJvYXJkIG9uIG1hY09TLlwiKSxcblx0XHRcdGluY2x1ZGVkOiBwbGF0Zm9ybS5pc01hY2ludG9zaFxuXHRcdH0sXG5cdFx0J3NlYXJjaC5tYXhSZXN1bHRzJzoge1xuXHRcdFx0dHlwZTogWydudW1iZXInLCAnbnVsbCddLFxuXHRcdFx0ZGVmYXVsdDogREVGQVVMVF9NQVhfU0VBUkNIX1JFU1VMVFMsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NlYXJjaC5tYXhSZXN1bHRzJywgXCJDb250cm9scyB0aGUgbWF4aW11bSBudW1iZXIgb2Ygc2VhcmNoIHJlc3VsdHMsIHRoaXMgY2FuIGJlIHNldCB0byBgbnVsbGAgKGVtcHR5KSB0byByZXR1cm4gdW5saW1pdGVkIHJlc3VsdHMuXCIpXG5cdFx0fSxcblx0XHQnc2VhcmNoLmNvbGxhcHNlUmVzdWx0cyc6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydhdXRvJywgJ2Fsd2F5c0NvbGxhcHNlJywgJ2Fsd2F5c0V4cGFuZCddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NlYXJjaC5jb2xsYXBzZVJlc3VsdHMuYXV0bycsIFwiRmlsZXMgd2l0aCBsZXNzIHRoYW4gMTAgcmVzdWx0cyBhcmUgZXhwYW5kZWQuIE90aGVycyBhcmUgY29sbGFwc2VkLlwiKSxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcnXG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdDogJ2Fsd2F5c0V4cGFuZCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzZWFyY2guY29sbGFwc2VBbGxSZXN1bHRzJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBzZWFyY2ggcmVzdWx0cyB3aWxsIGJlIGNvbGxhcHNlZCBvciBleHBhbmRlZC5cIiksXG5cdFx0fSxcblx0XHQnc2VhcmNoLnVzZVJlcGxhY2VQcmV2aWV3Jzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NlYXJjaC51c2VSZXBsYWNlUHJldmlldycsIFwiQ29udHJvbHMgd2hldGhlciB0byBvcGVuIFJlcGxhY2UgUHJldmlldyB3aGVuIHNlbGVjdGluZyBvciByZXBsYWNpbmcgYSBtYXRjaC5cIiksXG5cdFx0fSxcblx0XHQnc2VhcmNoLnNob3dMaW5lTnVtYmVycyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2VhcmNoLnNob3dMaW5lTnVtYmVycycsIFwiQ29udHJvbHMgd2hldGhlciB0byBzaG93IGxpbmUgbnVtYmVycyBmb3Igc2VhcmNoIHJlc3VsdHMuXCIpLFxuXHRcdH0sXG5cdFx0J3NlYXJjaC5hY3Rpb25zUG9zaXRpb24nOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnYXV0bycsICdyaWdodCddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NlYXJjaC5hY3Rpb25zUG9zaXRpb25BdXRvJywgXCJQb3NpdGlvbiB0aGUgYWN0aW9uYmFyIHRvIHRoZSByaWdodCB3aGVuIHRoZSBTZWFyY2ggdmlldyBpcyBuYXJyb3csIGFuZCBpbW1lZGlhdGVseSBhZnRlciB0aGUgY29udGVudCB3aGVuIHRoZSBTZWFyY2ggdmlldyBpcyB3aWRlLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzZWFyY2guYWN0aW9uc1Bvc2l0aW9uUmlnaHQnLCBcIkFsd2F5cyBwb3NpdGlvbiB0aGUgYWN0aW9uYmFyIHRvIHRoZSByaWdodC5cIiksXG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdDogJ3JpZ2h0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NlYXJjaC5hY3Rpb25zUG9zaXRpb24nLCBcIkNvbnRyb2xzIHRoZSBwb3NpdGlvbmluZyBvZiB0aGUgYWN0aW9uYmFyIG9uIHJvd3MgaW4gdGhlIFNlYXJjaCB2aWV3LlwiKVxuXHRcdH0sXG5cdFx0J3NlYXJjaC5zZWVkV2l0aE5lYXJlc3RXb3JkJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzZWFyY2guc2VlZFdpdGhOZWFyZXN0V29yZCcsIFwiRW5hYmxlIHNlZWRpbmcgc2VhcmNoIGZyb20gdGhlIHdvcmQgbmVhcmVzdCB0aGUgY3Vyc29yIHdoZW4gdGhlIGFjdGl2ZSBlZGl0b3IgaGFzIG5vIHNlbGVjdGlvbi5cIilcblx0XHR9LFxuXHRcdCdzZWFyY2guc2VlZE9uRm9jdXMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2VhcmNoLnNlZWRPbkZvY3VzJywgXCJVcGRhdGUgdGhlIHNlYXJjaCBxdWVyeSB0byB0aGUgZWRpdG9yJ3Mgc2VsZWN0ZWQgdGV4dCB3aGVuIGZvY3VzaW5nIHRoZSBTZWFyY2ggdmlldy4gVGhpcyBoYXBwZW5zIGVpdGhlciBvbiBjbGljayBvciB3aGVuIHRyaWdnZXJpbmcgdGhlIGB3b3JrYmVuY2gudmlld3Muc2VhcmNoLmZvY3VzYCBjb21tYW5kLlwiKVxuXHRcdH0sXG5cdFx0J3NlYXJjaC5zb3J0T3JkZXInOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFtTZWFyY2hTb3J0T3JkZXIuRGVmYXVsdCwgU2VhcmNoU29ydE9yZGVyLkZpbGVOYW1lcywgU2VhcmNoU29ydE9yZGVyLlR5cGUsIFNlYXJjaFNvcnRPcmRlci5Nb2RpZmllZCwgU2VhcmNoU29ydE9yZGVyLkNvdW50RGVzY2VuZGluZywgU2VhcmNoU29ydE9yZGVyLkNvdW50QXNjZW5kaW5nXSxcblx0XHRcdGRlZmF1bHQ6IFNlYXJjaFNvcnRPcmRlci5EZWZhdWx0LFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NlYXJjaFNvcnRPcmRlci5kZWZhdWx0JywgXCJSZXN1bHRzIGFyZSBzb3J0ZWQgYnkgZm9sZGVyIGFuZCBmaWxlIG5hbWVzLCBpbiBhbHBoYWJldGljYWwgb3JkZXIuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NlYXJjaFNvcnRPcmRlci5maWxlc09ubHknLCBcIlJlc3VsdHMgYXJlIHNvcnRlZCBieSBmaWxlIG5hbWVzIGlnbm9yaW5nIGZvbGRlciBvcmRlciwgaW4gYWxwaGFiZXRpY2FsIG9yZGVyLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzZWFyY2hTb3J0T3JkZXIudHlwZScsIFwiUmVzdWx0cyBhcmUgc29ydGVkIGJ5IGZpbGUgZXh0ZW5zaW9ucywgaW4gYWxwaGFiZXRpY2FsIG9yZGVyLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzZWFyY2hTb3J0T3JkZXIubW9kaWZpZWQnLCBcIlJlc3VsdHMgYXJlIHNvcnRlZCBieSBmaWxlIGxhc3QgbW9kaWZpZWQgZGF0ZSwgaW4gZGVzY2VuZGluZyBvcmRlci5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2VhcmNoU29ydE9yZGVyLmNvdW50RGVzY2VuZGluZycsIFwiUmVzdWx0cyBhcmUgc29ydGVkIGJ5IGNvdW50IHBlciBmaWxlLCBpbiBkZXNjZW5kaW5nIG9yZGVyLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzZWFyY2hTb3J0T3JkZXIuY291bnRBc2NlbmRpbmcnLCBcIlJlc3VsdHMgYXJlIHNvcnRlZCBieSBjb3VudCBwZXIgZmlsZSwgaW4gYXNjZW5kaW5nIG9yZGVyLlwiKVxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NlYXJjaC5zb3J0T3JkZXInLCBcIkNvbnRyb2xzIHNvcnRpbmcgb3JkZXIgb2Ygc2VhcmNoIHJlc3VsdHMuXCIpXG5cdFx0fSxcblx0XHQnc2VhcmNoLmRlY29yYXRpb25zLmNvbG9ycyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NlYXJjaC5kZWNvcmF0aW9ucy5jb2xvcnMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgc2VhcmNoIGZpbGUgZGVjb3JhdGlvbnMgc2hvdWxkIHVzZSBjb2xvcnMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdH0sXG5cdFx0J3NlYXJjaC5kZWNvcmF0aW9ucy5iYWRnZXMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzZWFyY2guZGVjb3JhdGlvbnMuYmFkZ2VzJywgXCJDb250cm9scyB3aGV0aGVyIHNlYXJjaCBmaWxlIGRlY29yYXRpb25zIHNob3VsZCB1c2UgYmFkZ2VzLlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHR9LFxuXHRcdCdzZWFyY2guZGVmYXVsdFZpZXdNb2RlJzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbVmlld01vZGUuVHJlZSwgVmlld01vZGUuTGlzdF0sXG5cdFx0XHRkZWZhdWx0OiBWaWV3TW9kZS5MaXN0LFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NjbS5kZWZhdWx0Vmlld01vZGUudHJlZScsIFwiU2hvd3Mgc2VhcmNoIHJlc3VsdHMgYXMgYSB0cmVlLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzY20uZGVmYXVsdFZpZXdNb2RlLmxpc3QnLCBcIlNob3dzIHNlYXJjaCByZXN1bHRzIGFzIGEgbGlzdC5cIilcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzZWFyY2guZGVmYXVsdFZpZXdNb2RlJywgXCJDb250cm9scyB0aGUgZGVmYXVsdCBzZWFyY2ggcmVzdWx0IHZpZXcgbW9kZS5cIilcblx0XHR9LFxuXHRcdCdzZWFyY2gucXVpY2tBY2Nlc3MucHJlc2VydmVJbnB1dCc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NlYXJjaC5xdWlja0FjY2Vzcy5wcmVzZXJ2ZUlucHV0JywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBsYXN0IHR5cGVkIGlucHV0IHRvIFF1aWNrIFNlYXJjaCBzaG91bGQgYmUgcmVzdG9yZWQgd2hlbiBvcGVuaW5nIGl0IHRoZSBuZXh0IHRpbWUuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHR9LFxuXHRcdCdzZWFyY2guZXhwZXJpbWVudGFsLmNsb3NlZE5vdGVib29rUmljaENvbnRlbnRSZXN1bHRzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2VhcmNoLmV4cGVyaW1lbnRhbC5jbG9zZWROb3RlYm9va1Jlc3VsdHMnLCBcIlNob3cgbm90ZWJvb2sgZWRpdG9yIHJpY2ggY29udGVudCByZXN1bHRzIGZvciBjbG9zZWQgbm90ZWJvb2tzLiBQbGVhc2UgcmVmcmVzaCB5b3VyIHNlYXJjaCByZXN1bHRzIGFmdGVyIGNoYW5naW5nIHRoaXMgc2V0dGluZy5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdH0sXG5cdFx0J3NlYXJjaC5leHBlcmltZW50YWwudXNlSWdub3JlRmlsZXNJbkZpbmRGaWxlcyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzZWFyY2guZXhwZXJpbWVudGFsLnVzZUlnbm9yZUZpbGVzSW5GaW5kRmlsZXMnLCBcIldoZW4gZW5hYmxlZCwgdGhlIGxlZ2FjeSBgZmluZEZpbGVzYCBleHRlbnNpb24gQVBJIGhvbm9ycyB0aGUgdXNlcidzIGAjc2VhcmNoLnVzZUlnbm9yZUZpbGVzI2Agc2V0dGluZyBpbnN0ZWFkIG9mIGFsd2F5cyBpZ25vcmluZyBgLmdpdGlnbm9yZWAuIEV4dGVuc2lvbnMgdGhhdCBleHBsaWNpdGx5IHBhc3MgYG51bGxgIGFzIHRoZSBgZXhjbHVkZWAgYXJndW1lbnQgc3RpbGwgZ2V0IHVuZmlsdGVyZWQgcmVzdWx0cy4gVGVsZW1ldHJ5IGlzIGVtaXR0ZWQgcmVnYXJkbGVzcyBvZiB0aGlzIHNldHRpbmcgdG8gaGVscCBkZWNpZGUgZnV0dXJlIGRlZmF1bHRzLlwiKSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0fSxcblx0XHQnc2VhcmNoLnNlYXJjaFZpZXcuc2VtYW50aWNTZWFyY2hCZWhhdmlvcic6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2VhcmNoLnNlYXJjaFZpZXcuc2VtYW50aWNTZWFyY2hCZWhhdmlvcicsIFwiQ29udHJvbHMgdGhlIGJlaGF2aW9yIG9mIHRoZSBzZW1hbnRpYyBzZWFyY2ggcmVzdWx0cyBkaXNwbGF5ZWQgaW4gdGhlIFNlYXJjaCB2aWV3LlwiKSxcblx0XHRcdGVudW06IFtTZW1hbnRpY1NlYXJjaEJlaGF2aW9yLk1hbnVhbCwgU2VtYW50aWNTZWFyY2hCZWhhdmlvci5SdW5PbkVtcHR5LCBTZW1hbnRpY1NlYXJjaEJlaGF2aW9yLkF1dG9dLFxuXHRcdFx0ZGVmYXVsdDogU2VtYW50aWNTZWFyY2hCZWhhdmlvci5NYW51YWwsXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2VhcmNoLnNlYXJjaFZpZXcuc2VtYW50aWNTZWFyY2hCZWhhdmlvci5tYW51YWwnLCBcIk9ubHkgcmVxdWVzdCBzZW1hbnRpYyBzZWFyY2ggcmVzdWx0cyBtYW51YWxseS5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2VhcmNoLnNlYXJjaFZpZXcuc2VtYW50aWNTZWFyY2hCZWhhdmlvci5ydW5PbkVtcHR5JywgXCJSZXF1ZXN0IHNlbWFudGljIHJlc3VsdHMgYXV0b21hdGljYWxseSBvbmx5IHdoZW4gdGV4dCBzZWFyY2ggcmVzdWx0cyBhcmUgZW1wdHkuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NlYXJjaC5zZWFyY2hWaWV3LnNlbWFudGljU2VhcmNoQmVoYXZpb3IuYXV0bycsIFwiUmVxdWVzdCBzZW1hbnRpYyByZXN1bHRzIGF1dG9tYXRpY2FsbHkgd2l0aCBldmVyeSBzZWFyY2guXCIpXG5cdFx0XHRdLFxuXHRcdFx0dGFnczogWydwcmV2aWV3J10sXG5cdFx0fSxcblx0XHQnc2VhcmNoLnNlYXJjaFZpZXcua2V5d29yZFN1Z2dlc3Rpb25zJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2VhcmNoLnNlYXJjaFZpZXcua2V5d29yZFN1Z2dlc3Rpb25zJywgXCJFbmFibGUga2V5d29yZCBzdWdnZXN0aW9ucyBpbiB0aGUgU2VhcmNoIHZpZXcuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHR0YWdzOiBbJ3ByZXZpZXcnXSxcblx0XHR9LFxuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ19leGVjdXRlV29ya3NwYWNlU3ltYm9sUHJvdmlkZXInLCBhc3luYyBmdW5jdGlvbiAoYWNjZXNzb3IsIC4uLmFyZ3MpOiBQcm9taXNlPElXb3Jrc3BhY2VTeW1ib2xbXT4ge1xuXHRjb25zdCBbcXVlcnldID0gYXJncztcblx0YXNzZXJ0VHlwZSh0eXBlb2YgcXVlcnkgPT09ICdzdHJpbmcnKTtcblx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZ2V0V29ya3NwYWNlU3ltYm9scyhxdWVyeSk7XG5cdHJldHVybiByZXN1bHQubWFwKGl0ZW0gPT4gaXRlbS5zeW1ib2wpO1xufSk7XG5cbi8vIHRvZG86IEBhbmRyZWFtYWggZ2V0IHJpZCBvZiB0aGlzIGFmdGVyIGEgZmV3IGl0ZXJhdGlvbnNcblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uTWlncmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbk1pZ3JhdGlvbilcblx0LnJlZ2lzdGVyQ29uZmlndXJhdGlvbk1pZ3JhdGlvbnMoW3tcblx0XHRrZXk6ICdzZWFyY2guZXhwZXJpbWVudGFsLnF1aWNrQWNjZXNzLnByZXNlcnZlSW5wdXQnLFxuXHRcdG1pZ3JhdGVGbjogKHZhbHVlLCBfYWNjZXNzb3IpID0+IChbXG5cdFx0XHRbJ3NlYXJjaC5xdWlja0FjY2Vzcy5wcmVzZXJ2ZUlucHV0JywgeyB2YWx1ZSB9XSxcblx0XHRcdFsnc2VhcmNoLmV4cGVyaW1lbnRhbC5xdWlja0FjY2Vzcy5wcmVzZXJ2ZUlucHV0JywgeyB2YWx1ZTogdW5kZWZpbmVkIH1dXG5cdFx0XSlcblx0fV0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxTQUFTLGNBQWM7QUFDaEMsWUFBWSxjQUFjO0FBQzFCLFlBQVksU0FBUztBQUNyQixTQUFT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
