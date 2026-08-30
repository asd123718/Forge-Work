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
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { extname, isEqual } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { ToggleCaseSensitiveKeybinding, ToggleRegexKeybinding, ToggleWholeWordKeybinding } from "../../../../editor/contrib/find/browser/findModel.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { EditorPaneDescriptor } from "../../../browser/editor.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { EditorExtensions, DEFAULT_EDITOR_ASSOCIATION } from "../../../common/editor.js";
import { ActiveEditorContext } from "../../../common/contextkeys.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { getSearchView } from "../../search/browser/searchActionsBase.js";
import { searchNewEditorIcon, searchRefreshIcon } from "../../search/browser/searchIcons.js";
import * as SearchConstants from "../../search/common/constants.js";
import * as SearchEditorConstants from "./constants.js";
import { SearchEditor } from "./searchEditor.js";
import { createEditorFromSearchResult, modifySearchEditorContextLinesCommand, openNewSearchEditor, openSearchEditor, selectAllSearchEditorMatchesCommand, toggleSearchEditorCaseSensitiveCommand, toggleSearchEditorContextLinesCommand, toggleSearchEditorRegexCommand, toggleSearchEditorWholeWordCommand } from "./searchEditorActions.js";
import { getOrMakeSearchEditorInput, SearchEditorInput, SEARCH_EDITOR_EXT } from "./searchEditorInput.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { VIEW_ID } from "../../../services/search/common/search.js";
import { searchConfigurationNode } from "../../search/common/search.js";
import { RegisteredEditorPriority, IEditorResolverService } from "../../../services/editor/common/editorResolverService.js";
import { IWorkingCopyEditorService } from "../../../services/workingCopy/common/workingCopyEditorService.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { getActiveElement } from "../../../../base/browser/dom.js";
import * as nls from "../../../../nls.js";
import { Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
const OpenInEditorCommandId = "search.action.openInEditor";
const OpenNewEditorToSideCommandId = "search.action.openNewEditorToSide";
const FocusQueryEditorWidgetCommandId = "search.action.focusQueryEditorWidget";
const FocusQueryEditorFilesToIncludeCommandId = "search.action.focusFilesToInclude";
const FocusQueryEditorFilesToExcludeCommandId = "search.action.focusFilesToExclude";
const ToggleSearchEditorCaseSensitiveCommandId = "toggleSearchEditorCaseSensitive";
const ToggleSearchEditorWholeWordCommandId = "toggleSearchEditorWholeWord";
const ToggleSearchEditorRegexCommandId = "toggleSearchEditorRegex";
const IncreaseSearchEditorContextLinesCommandId = "increaseSearchEditorContextLines";
const DecreaseSearchEditorContextLinesCommandId = "decreaseSearchEditorContextLines";
const RerunSearchEditorSearchCommandId = "rerunSearchEditorSearch";
const CleanSearchEditorStateCommandId = "cleanSearchEditorState";
const SelectAllSearchEditorMatchesCommandId = "selectAllSearchEditorMatches";
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  ...searchConfigurationNode,
  properties: {
    "search.searchEditor.doubleClickBehaviour": {
      type: "string",
      enum: ["selectWord", "goToLocation", "openLocationToSide"],
      default: "goToLocation",
      enumDescriptions: [
        nls.localize("search.searchEditor.doubleClickBehaviour.selectWord", "Double-clicking selects the word under the cursor."),
        nls.localize("search.searchEditor.doubleClickBehaviour.goToLocation", "Double-clicking opens the result in the active editor group."),
        nls.localize("search.searchEditor.doubleClickBehaviour.openLocationToSide", "Double-clicking opens the result in the editor group to the side, creating one if it does not yet exist.")
      ],
      markdownDescription: nls.localize("search.searchEditor.doubleClickBehaviour", "Configure effect of double-clicking a result in a search editor.")
    },
    "search.searchEditor.singleClickBehaviour": {
      type: "string",
      enum: ["default", "peekDefinition"],
      default: "default",
      enumDescriptions: [
        nls.localize("search.searchEditor.singleClickBehaviour.default", "Single-clicking does nothing."),
        nls.localize("search.searchEditor.singleClickBehaviour.peekDefinition", "Single-clicking opens a Peek Definition window.")
      ],
      markdownDescription: nls.localize("search.searchEditor.singleClickBehaviour", "Configure effect of single-clicking a result in a search editor.")
    },
    "search.searchEditor.reusePriorSearchConfiguration": {
      type: "boolean",
      default: false,
      markdownDescription: nls.localize({ key: "search.searchEditor.reusePriorSearchConfiguration", comment: ['"Search Editor" is a type of editor that can display search results. "includes, excludes, and flags" refers to the "files to include" and "files to exclude" input boxes, and the flags that control whether a query is case-sensitive or a regex.'] }, "When enabled, new Search Editors will reuse the includes, excludes, and flags of the previously opened Search Editor.")
    },
    "search.searchEditor.defaultNumberOfContextLines": {
      type: ["number", "null"],
      default: 1,
      markdownDescription: nls.localize("search.searchEditor.defaultNumberOfContextLines", "The default number of surrounding context lines to use when creating new Search Editors. If using `#search.searchEditor.reusePriorSearchConfiguration#`, this can be set to `null` (empty) to use the prior Search Editor's configuration.")
    },
    "search.searchEditor.focusResultsOnSearch": {
      type: "boolean",
      default: false,
      markdownDescription: nls.localize("search.searchEditor.focusResultsOnSearch", "When a search is triggered, focus the Search Editor results instead of the Search Editor input.")
    }
  }
});
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    SearchEditor,
    SearchEditor.ID,
    localize("searchEditor", "Search Editor")
  ),
  [
    new SyncDescriptor(SearchEditorInput)
  ]
);
let SearchEditorContribution = class {
  constructor(editorResolverService, instantiationService) {
    editorResolverService.registerEditor(
      "*" + SEARCH_EDITOR_EXT,
      {
        id: SearchEditorInput.ID,
        label: localize("promptOpenWith.searchEditor.displayName", "Search Editor"),
        detail: DEFAULT_EDITOR_ASSOCIATION.providerDisplayName,
        priority: RegisteredEditorPriority.default
      },
      {
        singlePerResource: true,
        canSupportResource: (resource) => extname(resource) === SEARCH_EDITOR_EXT
      },
      {
        createEditorInput: ({ resource }) => {
          return { editor: instantiationService.invokeFunction(getOrMakeSearchEditorInput, { from: "existingFile", fileUri: resource }) };
        }
      }
    );
  }
};
SearchEditorContribution.ID = "workbench.contrib.searchEditor";
SearchEditorContribution = __decorateClass([
  __decorateParam(0, IEditorResolverService),
  __decorateParam(1, IInstantiationService)
], SearchEditorContribution);
registerWorkbenchContribution2(SearchEditorContribution.ID, SearchEditorContribution, WorkbenchPhase.BlockStartup);
class SearchEditorInputSerializer {
  canSerialize(input) {
    return !!input.tryReadConfigSync();
  }
  serialize(input) {
    if (!this.canSerialize(input)) {
      return void 0;
    }
    if (input.isDisposed()) {
      return JSON.stringify({ modelUri: void 0, dirty: false, config: input.tryReadConfigSync(), name: input.getName(), matchRanges: [], backingUri: input.backingUri?.toString() });
    }
    let modelUri = void 0;
    if (input.modelUri.path || input.modelUri.fragment && input.isDirty()) {
      modelUri = input.modelUri.toString();
    }
    const config = input.tryReadConfigSync();
    const dirty = input.isDirty();
    const matchRanges = dirty ? input.getMatchRanges() : [];
    const backingUri = input.backingUri;
    return JSON.stringify({ modelUri, dirty, config, name: input.getName(), matchRanges, backingUri: backingUri?.toString() });
  }
  deserialize(instantiationService, serializedEditorInput) {
    const { modelUri, dirty, config, matchRanges, backingUri } = JSON.parse(serializedEditorInput);
    if (config && config.query !== void 0) {
      if (modelUri) {
        const input = instantiationService.invokeFunction(
          getOrMakeSearchEditorInput,
          { from: "model", modelUri: URI.parse(modelUri), config, backupOf: backingUri ? URI.parse(backingUri) : void 0 }
        );
        input.setDirty(dirty);
        input.setMatchRanges(matchRanges);
        return input;
      } else {
        if (backingUri) {
          return instantiationService.invokeFunction(
            getOrMakeSearchEditorInput,
            { from: "existingFile", fileUri: URI.parse(backingUri) }
          );
        } else {
          return instantiationService.invokeFunction(
            getOrMakeSearchEditorInput,
            { from: "rawData", resultsContents: "", config }
          );
        }
      }
    }
    return void 0;
  }
}
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(
  SearchEditorInput.ID,
  SearchEditorInputSerializer
);
CommandsRegistry.registerCommand(
  CleanSearchEditorStateCommandId,
  (accessor) => {
    const activeEditorPane = accessor.get(IEditorService).activeEditorPane;
    if (activeEditorPane instanceof SearchEditor) {
      activeEditorPane.cleanState();
    }
  }
);
const category = localize2("search", "Search Editor");
const translateLegacyConfig = (legacyConfig = {}) => {
  const config = {};
  const overrides = {
    includes: "filesToInclude",
    excludes: "filesToExclude",
    wholeWord: "matchWholeWord",
    caseSensitive: "isCaseSensitive",
    regexp: "isRegexp",
    useIgnores: "useExcludeSettingsAndIgnoreFiles"
  };
  Object.entries(legacyConfig).forEach(([key, value]) => {
    config[overrides[key] ?? key] = value;
  });
  return config;
};
const openArgMetadata = {
  description: "Open a new search editor. Arguments passed can include variables like ${relativeFileDirname}.",
  args: [{
    name: "Open new Search Editor args",
    schema: {
      properties: {
        query: { type: "string" },
        filesToInclude: { type: "string" },
        filesToExclude: { type: "string" },
        contextLines: { type: "number" },
        matchWholeWord: { type: "boolean" },
        isCaseSensitive: { type: "boolean" },
        isRegexp: { type: "boolean" },
        useExcludeSettingsAndIgnoreFiles: { type: "boolean" },
        showIncludesExcludes: { type: "boolean" },
        triggerSearch: { type: "boolean" },
        focusResults: { type: "boolean" },
        onlyOpenEditors: { type: "boolean" }
      }
    }
  }]
};
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "search.searchEditor.action.deleteFileResults",
      title: localize2("searchEditor.deleteResultBlock", "Delete File Results"),
      keybinding: {
        weight: KeybindingWeight.EditorContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backspace
      },
      precondition: SearchEditorConstants.InSearchEditor,
      category,
      f1: true
    });
  }
  async run(accessor) {
    const contextService = accessor.get(IContextKeyService).getContext(getActiveElement());
    if (contextService.getValue(SearchEditorConstants.InSearchEditor.serialize())) {
      accessor.get(IEditorService).activeEditorPane.deleteResultBlock();
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: SearchEditorConstants.OpenNewEditorCommandId,
      title: localize2("search.openNewSearchEditor", "New Search Editor"),
      category,
      f1: true,
      metadata: openArgMetadata
    });
  }
  async run(accessor, args) {
    await accessor.get(IInstantiationService).invokeFunction(openNewSearchEditor, translateLegacyConfig({ location: "new", ...args }));
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: SearchEditorConstants.OpenEditorCommandId,
      title: localize2("search.openSearchEditor", "Open Search Editor"),
      category,
      f1: true,
      metadata: openArgMetadata
    });
  }
  async run(accessor, args) {
    await accessor.get(IInstantiationService).invokeFunction(openNewSearchEditor, translateLegacyConfig({ location: "reuse", ...args }));
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: OpenNewEditorToSideCommandId,
      title: localize2("search.openNewEditorToSide", "Open New Search Editor to the Side"),
      category,
      f1: true,
      metadata: openArgMetadata
    });
  }
  async run(accessor, args) {
    await accessor.get(IInstantiationService).invokeFunction(openNewSearchEditor, translateLegacyConfig(args), true);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: OpenInEditorCommandId,
      title: localize2("search.openResultsInEditor", "Open Results in Editor"),
      category,
      f1: true,
      keybinding: {
        primary: KeyMod.Alt | KeyCode.Enter,
        when: ContextKeyExpr.and(SearchConstants.SearchContext.HasSearchResults, SearchConstants.SearchContext.SearchViewFocusedKey),
        weight: KeybindingWeight.WorkbenchContrib,
        mac: {
          primary: KeyMod.CtrlCmd | KeyCode.Enter
        }
      }
    });
  }
  async run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const instantiationService = accessor.get(IInstantiationService);
    const searchView = getSearchView(viewsService);
    if (searchView) {
      await instantiationService.invokeFunction(createEditorFromSearchResult, searchView.searchResult, searchView.searchIncludePattern.getValue(), searchView.searchExcludePattern.getValue(), searchView.searchIncludePattern.onlySearchInOpenEditors());
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: RerunSearchEditorSearchCommandId,
      title: localize2("search.rerunSearchInEditor", "Search Again"),
      category,
      keybinding: {
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR,
        when: SearchEditorConstants.InSearchEditor,
        weight: KeybindingWeight.EditorContrib
      },
      icon: searchRefreshIcon,
      menu: [
        ...[MenuId.EditorTitle, MenuId.CompactWindowEditorTitle].map((id) => ({
          id,
          group: "navigation",
          when: ActiveEditorContext.isEqualTo(SearchEditorConstants.SearchEditorID)
        })),
        {
          id: MenuId.CommandPalette,
          when: ActiveEditorContext.isEqualTo(SearchEditorConstants.SearchEditorID)
        }
      ]
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const input = editorService.activeEditor;
    if (input instanceof SearchEditorInput) {
      editorService.activeEditorPane.triggerSearch({ resetCursor: false });
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: FocusQueryEditorWidgetCommandId,
      title: localize2("search.action.focusQueryEditorWidget", "Focus Search Editor Input"),
      category,
      f1: true,
      precondition: SearchEditorConstants.InSearchEditor,
      keybinding: {
        primary: KeyCode.Escape,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const input = editorService.activeEditor;
    if (input instanceof SearchEditorInput) {
      editorService.activeEditorPane.focusSearchInput();
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: FocusQueryEditorFilesToIncludeCommandId,
      title: localize2("search.action.focusFilesToInclude", "Focus Search Editor Files to Include"),
      category,
      f1: true,
      precondition: SearchEditorConstants.InSearchEditor
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const input = editorService.activeEditor;
    if (input instanceof SearchEditorInput) {
      editorService.activeEditorPane.focusFilesToIncludeInput();
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: FocusQueryEditorFilesToExcludeCommandId,
      title: localize2("search.action.focusFilesToExclude", "Focus Search Editor Files to Exclude"),
      category,
      f1: true,
      precondition: SearchEditorConstants.InSearchEditor
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const input = editorService.activeEditor;
    if (input instanceof SearchEditorInput) {
      editorService.activeEditorPane.focusFilesToExcludeInput();
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: ToggleSearchEditorCaseSensitiveCommandId,
      title: localize2("searchEditor.action.toggleSearchEditorCaseSensitive", "Toggle Match Case"),
      category,
      f1: true,
      precondition: SearchEditorConstants.InSearchEditor,
      keybinding: Object.assign({
        weight: KeybindingWeight.WorkbenchContrib,
        when: SearchConstants.SearchContext.SearchInputBoxFocusedKey
      }, ToggleCaseSensitiveKeybinding)
    });
  }
  run(accessor) {
    toggleSearchEditorCaseSensitiveCommand(accessor);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: ToggleSearchEditorWholeWordCommandId,
      title: localize2("searchEditor.action.toggleSearchEditorWholeWord", "Toggle Match Whole Word"),
      category,
      f1: true,
      precondition: SearchEditorConstants.InSearchEditor,
      keybinding: Object.assign({
        weight: KeybindingWeight.WorkbenchContrib,
        when: SearchConstants.SearchContext.SearchInputBoxFocusedKey
      }, ToggleWholeWordKeybinding)
    });
  }
  run(accessor) {
    toggleSearchEditorWholeWordCommand(accessor);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: ToggleSearchEditorRegexCommandId,
      title: localize2("searchEditor.action.toggleSearchEditorRegex", "Toggle Use Regular Expression"),
      category,
      f1: true,
      precondition: SearchEditorConstants.InSearchEditor,
      keybinding: Object.assign({
        weight: KeybindingWeight.WorkbenchContrib,
        when: SearchConstants.SearchContext.SearchInputBoxFocusedKey
      }, ToggleRegexKeybinding)
    });
  }
  run(accessor) {
    toggleSearchEditorRegexCommand(accessor);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: SearchEditorConstants.ToggleSearchEditorContextLinesCommandId,
      title: localize2("searchEditor.action.toggleSearchEditorContextLines", "Toggle Context Lines"),
      category,
      f1: true,
      precondition: SearchEditorConstants.InSearchEditor,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.Alt | KeyCode.KeyL,
        mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyL }
      }
    });
  }
  run(accessor) {
    toggleSearchEditorContextLinesCommand(accessor);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: IncreaseSearchEditorContextLinesCommandId,
      title: localize2("searchEditor.action.increaseSearchEditorContextLines", "Increase Context Lines"),
      category,
      f1: true,
      precondition: SearchEditorConstants.InSearchEditor,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.Alt | KeyCode.Equal
      }
    });
  }
  run(accessor) {
    modifySearchEditorContextLinesCommand(accessor, true);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: DecreaseSearchEditorContextLinesCommandId,
      title: localize2("searchEditor.action.decreaseSearchEditorContextLines", "Decrease Context Lines"),
      category,
      f1: true,
      precondition: SearchEditorConstants.InSearchEditor,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.Alt | KeyCode.Minus
      }
    });
  }
  run(accessor) {
    modifySearchEditorContextLinesCommand(accessor, false);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: SelectAllSearchEditorMatchesCommandId,
      title: localize2("searchEditor.action.selectAllSearchEditorMatches", "Select All Matches"),
      category,
      f1: true,
      precondition: SearchEditorConstants.InSearchEditor,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL
      }
    });
  }
  run(accessor) {
    selectAllSearchEditorMatchesCommand(accessor);
  }
});
registerAction2(class OpenSearchEditorAction extends Action2 {
  constructor() {
    super({
      id: "search.action.openNewEditorFromView",
      title: localize("search.openNewEditor", "Open New Search Editor"),
      category,
      icon: searchNewEditorIcon,
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 2,
        when: ContextKeyExpr.equals("view", VIEW_ID)
      }]
    });
  }
  run(accessor, ...args) {
    return openSearchEditor(accessor);
  }
});
let SearchEditorWorkingCopyEditorHandler = class extends Disposable {
  constructor(instantiationService, workingCopyEditorService) {
    super();
    this.instantiationService = instantiationService;
    this._register(workingCopyEditorService.registerHandler(this));
  }
  handles(workingCopy) {
    return workingCopy.resource.scheme === SearchEditorConstants.SearchEditorScheme;
  }
  isOpen(workingCopy, editor) {
    if (!this.handles(workingCopy)) {
      return false;
    }
    return editor instanceof SearchEditorInput && isEqual(workingCopy.resource, editor.modelUri);
  }
  createEditor(workingCopy) {
    const input = this.instantiationService.invokeFunction(getOrMakeSearchEditorInput, { from: "model", modelUri: workingCopy.resource });
    input.setDirty(true);
    return input;
  }
};
SearchEditorWorkingCopyEditorHandler.ID = "workbench.contrib.searchEditorWorkingCopyEditorHandler";
SearchEditorWorkingCopyEditorHandler = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IWorkingCopyEditorService)
], SearchEditorWorkingCopyEditorHandler);
registerWorkbenchContribution2(SearchEditorWorkingCopyEditorHandler.ID, SearchEditorWorkingCopyEditorHandler, WorkbenchPhase.BlockRestore);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNlYXJjaEVkaXRvclxcYnJvd3Nlclxcc2VhcmNoRWRpdG9yLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IGV4dG5hbWUsIGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFRvZ2dsZUNhc2VTZW5zaXRpdmVLZXliaW5kaW5nLCBUb2dnbGVSZWdleEtleWJpbmRpbmcsIFRvZ2dsZVdob2xlV29yZEtleWJpbmRpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9maW5kL2Jyb3dzZXIvZmluZE1vZGVsLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmVEZXNjcmlwdG9yLCBJRWRpdG9yUGFuZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UsIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJpYWxpemVyLCBJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5LCBFZGl0b3JFeHRlbnNpb25zLCBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgQWN0aXZlRWRpdG9yQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRTZWFyY2hWaWV3IH0gZnJvbSAnLi4vLi4vc2VhcmNoL2Jyb3dzZXIvc2VhcmNoQWN0aW9uc0Jhc2UuanMnO1xuaW1wb3J0IHsgc2VhcmNoTmV3RWRpdG9ySWNvbiwgc2VhcmNoUmVmcmVzaEljb24gfSBmcm9tICcuLi8uLi9zZWFyY2gvYnJvd3Nlci9zZWFyY2hJY29ucy5qcyc7XG5pbXBvcnQgKiBhcyBTZWFyY2hDb25zdGFudHMgZnJvbSAnLi4vLi4vc2VhcmNoL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0ICogYXMgU2VhcmNoRWRpdG9yQ29uc3RhbnRzIGZyb20gJy4vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IFNlYXJjaEVkaXRvciB9IGZyb20gJy4vc2VhcmNoRWRpdG9yLmpzJztcbmltcG9ydCB7IGNyZWF0ZUVkaXRvckZyb21TZWFyY2hSZXN1bHQsIG1vZGlmeVNlYXJjaEVkaXRvckNvbnRleHRMaW5lc0NvbW1hbmQsIG9wZW5OZXdTZWFyY2hFZGl0b3IsIG9wZW5TZWFyY2hFZGl0b3IsIHNlbGVjdEFsbFNlYXJjaEVkaXRvck1hdGNoZXNDb21tYW5kLCB0b2dnbGVTZWFyY2hFZGl0b3JDYXNlU2Vuc2l0aXZlQ29tbWFuZCwgdG9nZ2xlU2VhcmNoRWRpdG9yQ29udGV4dExpbmVzQ29tbWFuZCwgdG9nZ2xlU2VhcmNoRWRpdG9yUmVnZXhDb21tYW5kLCB0b2dnbGVTZWFyY2hFZGl0b3JXaG9sZVdvcmRDb21tYW5kIH0gZnJvbSAnLi9zZWFyY2hFZGl0b3JBY3Rpb25zLmpzJztcbmltcG9ydCB7IGdldE9yTWFrZVNlYXJjaEVkaXRvcklucHV0LCBTZWFyY2hFZGl0b3JJbnB1dCwgU0VBUkNIX0VESVRPUl9FWFQgfSBmcm9tICcuL3NlYXJjaEVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFZJRVdfSUQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBzZWFyY2hDb25maWd1cmF0aW9uTm9kZSB9IGZyb20gJy4uLy4uL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eSwgSUVkaXRvclJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUVkaXRvckhhbmRsZXIsIElXb3JraW5nQ29weUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5SWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgZ2V0QWN0aXZlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcblxuXG5jb25zdCBPcGVuSW5FZGl0b3JDb21tYW5kSWQgPSAnc2VhcmNoLmFjdGlvbi5vcGVuSW5FZGl0b3InO1xuY29uc3QgT3Blbk5ld0VkaXRvclRvU2lkZUNvbW1hbmRJZCA9ICdzZWFyY2guYWN0aW9uLm9wZW5OZXdFZGl0b3JUb1NpZGUnO1xuY29uc3QgRm9jdXNRdWVyeUVkaXRvcldpZGdldENvbW1hbmRJZCA9ICdzZWFyY2guYWN0aW9uLmZvY3VzUXVlcnlFZGl0b3JXaWRnZXQnO1xuY29uc3QgRm9jdXNRdWVyeUVkaXRvckZpbGVzVG9JbmNsdWRlQ29tbWFuZElkID0gJ3NlYXJjaC5hY3Rpb24uZm9jdXNGaWxlc1RvSW5jbHVkZSc7XG5jb25zdCBGb2N1c1F1ZXJ5RWRpdG9yRmlsZXNUb0V4Y2x1ZGVDb21tYW5kSWQgPSAnc2VhcmNoLmFjdGlvbi5mb2N1c0ZpbGVzVG9FeGNsdWRlJztcblxuY29uc3QgVG9nZ2xlU2VhcmNoRWRpdG9yQ2FzZVNlbnNpdGl2ZUNvbW1hbmRJZCA9ICd0b2dnbGVTZWFyY2hFZGl0b3JDYXNlU2Vuc2l0aXZlJztcbmNvbnN0IFRvZ2dsZVNlYXJjaEVkaXRvcldob2xlV29yZENvbW1hbmRJZCA9ICd0b2dnbGVTZWFyY2hFZGl0b3JXaG9sZVdvcmQnO1xuY29uc3QgVG9nZ2xlU2VhcmNoRWRpdG9yUmVnZXhDb21tYW5kSWQgPSAndG9nZ2xlU2VhcmNoRWRpdG9yUmVnZXgnO1xuY29uc3QgSW5jcmVhc2VTZWFyY2hFZGl0b3JDb250ZXh0TGluZXNDb21tYW5kSWQgPSAnaW5jcmVhc2VTZWFyY2hFZGl0b3JDb250ZXh0TGluZXMnO1xuY29uc3QgRGVjcmVhc2VTZWFyY2hFZGl0b3JDb250ZXh0TGluZXNDb21tYW5kSWQgPSAnZGVjcmVhc2VTZWFyY2hFZGl0b3JDb250ZXh0TGluZXMnO1xuXG5jb25zdCBSZXJ1blNlYXJjaEVkaXRvclNlYXJjaENvbW1hbmRJZCA9ICdyZXJ1blNlYXJjaEVkaXRvclNlYXJjaCc7XG5jb25zdCBDbGVhblNlYXJjaEVkaXRvclN0YXRlQ29tbWFuZElkID0gJ2NsZWFuU2VhcmNoRWRpdG9yU3RhdGUnO1xuY29uc3QgU2VsZWN0QWxsU2VhcmNoRWRpdG9yTWF0Y2hlc0NvbW1hbmRJZCA9ICdzZWxlY3RBbGxTZWFyY2hFZGl0b3JNYXRjaGVzJztcblxuXG4vLyNyZWdpb24gU2VhcmNoIEVkaXRvciBDb25maWd1cmF0aW9uXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHQuLi5zZWFyY2hDb25maWd1cmF0aW9uTm9kZSxcblx0cHJvcGVydGllczoge1xuXHRcdCdzZWFyY2guc2VhcmNoRWRpdG9yLmRvdWJsZUNsaWNrQmVoYXZpb3VyJzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ3NlbGVjdFdvcmQnLCAnZ29Ub0xvY2F0aW9uJywgJ29wZW5Mb2NhdGlvblRvU2lkZSddLFxuXHRcdFx0ZGVmYXVsdDogJ2dvVG9Mb2NhdGlvbicsXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2VhcmNoLnNlYXJjaEVkaXRvci5kb3VibGVDbGlja0JlaGF2aW91ci5zZWxlY3RXb3JkJywgXCJEb3VibGUtY2xpY2tpbmcgc2VsZWN0cyB0aGUgd29yZCB1bmRlciB0aGUgY3Vyc29yLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzZWFyY2guc2VhcmNoRWRpdG9yLmRvdWJsZUNsaWNrQmVoYXZpb3VyLmdvVG9Mb2NhdGlvbicsIFwiRG91YmxlLWNsaWNraW5nIG9wZW5zIHRoZSByZXN1bHQgaW4gdGhlIGFjdGl2ZSBlZGl0b3IgZ3JvdXAuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NlYXJjaC5zZWFyY2hFZGl0b3IuZG91YmxlQ2xpY2tCZWhhdmlvdXIub3BlbkxvY2F0aW9uVG9TaWRlJywgXCJEb3VibGUtY2xpY2tpbmcgb3BlbnMgdGhlIHJlc3VsdCBpbiB0aGUgZWRpdG9yIGdyb3VwIHRvIHRoZSBzaWRlLCBjcmVhdGluZyBvbmUgaWYgaXQgZG9lcyBub3QgeWV0IGV4aXN0LlwiKSxcblx0XHRcdF0sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NlYXJjaC5zZWFyY2hFZGl0b3IuZG91YmxlQ2xpY2tCZWhhdmlvdXInLCBcIkNvbmZpZ3VyZSBlZmZlY3Qgb2YgZG91YmxlLWNsaWNraW5nIGEgcmVzdWx0IGluIGEgc2VhcmNoIGVkaXRvci5cIilcblx0XHR9LFxuXHRcdCdzZWFyY2guc2VhcmNoRWRpdG9yLnNpbmdsZUNsaWNrQmVoYXZpb3VyJzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2RlZmF1bHQnLCAncGVla0RlZmluaXRpb24nXSxcblx0XHRcdGRlZmF1bHQ6ICdkZWZhdWx0Jyxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzZWFyY2guc2VhcmNoRWRpdG9yLnNpbmdsZUNsaWNrQmVoYXZpb3VyLmRlZmF1bHQnLCBcIlNpbmdsZS1jbGlja2luZyBkb2VzIG5vdGhpbmcuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NlYXJjaC5zZWFyY2hFZGl0b3Iuc2luZ2xlQ2xpY2tCZWhhdmlvdXIucGVla0RlZmluaXRpb24nLCBcIlNpbmdsZS1jbGlja2luZyBvcGVucyBhIFBlZWsgRGVmaW5pdGlvbiB3aW5kb3cuXCIpLFxuXHRcdFx0XSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2VhcmNoLnNlYXJjaEVkaXRvci5zaW5nbGVDbGlja0JlaGF2aW91cicsIFwiQ29uZmlndXJlIGVmZmVjdCBvZiBzaW5nbGUtY2xpY2tpbmcgYSByZXN1bHQgaW4gYSBzZWFyY2ggZWRpdG9yLlwiKVxuXHRcdH0sXG5cdFx0J3NlYXJjaC5zZWFyY2hFZGl0b3IucmV1c2VQcmlvclNlYXJjaENvbmZpZ3VyYXRpb24nOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSh7IGtleTogJ3NlYXJjaC5zZWFyY2hFZGl0b3IucmV1c2VQcmlvclNlYXJjaENvbmZpZ3VyYXRpb24nLCBjb21tZW50OiBbJ1wiU2VhcmNoIEVkaXRvclwiIGlzIGEgdHlwZSBvZiBlZGl0b3IgdGhhdCBjYW4gZGlzcGxheSBzZWFyY2ggcmVzdWx0cy4gXCJpbmNsdWRlcywgZXhjbHVkZXMsIGFuZCBmbGFnc1wiIHJlZmVycyB0byB0aGUgXCJmaWxlcyB0byBpbmNsdWRlXCIgYW5kIFwiZmlsZXMgdG8gZXhjbHVkZVwiIGlucHV0IGJveGVzLCBhbmQgdGhlIGZsYWdzIHRoYXQgY29udHJvbCB3aGV0aGVyIGEgcXVlcnkgaXMgY2FzZS1zZW5zaXRpdmUgb3IgYSByZWdleC4nXSB9LCBcIldoZW4gZW5hYmxlZCwgbmV3IFNlYXJjaCBFZGl0b3JzIHdpbGwgcmV1c2UgdGhlIGluY2x1ZGVzLCBleGNsdWRlcywgYW5kIGZsYWdzIG9mIHRoZSBwcmV2aW91c2x5IG9wZW5lZCBTZWFyY2ggRWRpdG9yLlwiKVxuXHRcdH0sXG5cdFx0J3NlYXJjaC5zZWFyY2hFZGl0b3IuZGVmYXVsdE51bWJlck9mQ29udGV4dExpbmVzJzoge1xuXHRcdFx0dHlwZTogWydudW1iZXInLCAnbnVsbCddLFxuXHRcdFx0ZGVmYXVsdDogMSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2VhcmNoLnNlYXJjaEVkaXRvci5kZWZhdWx0TnVtYmVyT2ZDb250ZXh0TGluZXMnLCBcIlRoZSBkZWZhdWx0IG51bWJlciBvZiBzdXJyb3VuZGluZyBjb250ZXh0IGxpbmVzIHRvIHVzZSB3aGVuIGNyZWF0aW5nIG5ldyBTZWFyY2ggRWRpdG9ycy4gSWYgdXNpbmcgYCNzZWFyY2guc2VhcmNoRWRpdG9yLnJldXNlUHJpb3JTZWFyY2hDb25maWd1cmF0aW9uI2AsIHRoaXMgY2FuIGJlIHNldCB0byBgbnVsbGAgKGVtcHR5KSB0byB1c2UgdGhlIHByaW9yIFNlYXJjaCBFZGl0b3IncyBjb25maWd1cmF0aW9uLlwiKVxuXHRcdH0sXG5cdFx0J3NlYXJjaC5zZWFyY2hFZGl0b3IuZm9jdXNSZXN1bHRzT25TZWFyY2gnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2VhcmNoLnNlYXJjaEVkaXRvci5mb2N1c1Jlc3VsdHNPblNlYXJjaCcsIFwiV2hlbiBhIHNlYXJjaCBpcyB0cmlnZ2VyZWQsIGZvY3VzIHRoZSBTZWFyY2ggRWRpdG9yIHJlc3VsdHMgaW5zdGVhZCBvZiB0aGUgU2VhcmNoIEVkaXRvciBpbnB1dC5cIilcblx0XHR9LFxuXHR9XG59KTtcbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gRWRpdG9yIERlc2NyaXB0aW9yXG5SZWdpc3RyeS5hczxJRWRpdG9yUGFuZVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvclBhbmUpLnJlZ2lzdGVyRWRpdG9yUGFuZShcblx0RWRpdG9yUGFuZURlc2NyaXB0b3IuY3JlYXRlKFxuXHRcdFNlYXJjaEVkaXRvcixcblx0XHRTZWFyY2hFZGl0b3IuSUQsXG5cdFx0bG9jYWxpemUoJ3NlYXJjaEVkaXRvcicsIFwiU2VhcmNoIEVkaXRvclwiKVxuXHQpLFxuXHRbXG5cdFx0bmV3IFN5bmNEZXNjcmlwdG9yKFNlYXJjaEVkaXRvcklucHV0KVxuXHRdXG4pO1xuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBTdGFydHVwIENvbnRyaWJ1dGlvblxuY2xhc3MgU2VhcmNoRWRpdG9yQ29udHJpYnV0aW9uIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnNlYXJjaEVkaXRvcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFZGl0b3JSZXNvbHZlclNlcnZpY2UgZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlOiBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0ZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKFxuXHRcdFx0JyonICsgU0VBUkNIX0VESVRPUl9FWFQsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBTZWFyY2hFZGl0b3JJbnB1dC5JRCxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwcm9tcHRPcGVuV2l0aC5zZWFyY2hFZGl0b3IuZGlzcGxheU5hbWUnLCBcIlNlYXJjaCBFZGl0b3JcIiksXG5cdFx0XHRcdGRldGFpbDogREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04ucHJvdmlkZXJEaXNwbGF5TmFtZSxcblx0XHRcdFx0cHJpb3JpdHk6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5kZWZhdWx0LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0c2luZ2xlUGVyUmVzb3VyY2U6IHRydWUsXG5cdFx0XHRcdGNhblN1cHBvcnRSZXNvdXJjZTogcmVzb3VyY2UgPT4gKGV4dG5hbWUocmVzb3VyY2UpID09PSBTRUFSQ0hfRURJVE9SX0VYVClcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUVkaXRvcklucHV0OiAoeyByZXNvdXJjZSB9KSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgZWRpdG9yOiBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihnZXRPck1ha2VTZWFyY2hFZGl0b3JJbnB1dCwgeyBmcm9tOiAnZXhpc3RpbmdGaWxlJywgZmlsZVVyaTogcmVzb3VyY2UgfSkgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cbn1cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFNlYXJjaEVkaXRvckNvbnRyaWJ1dGlvbi5JRCwgU2VhcmNoRWRpdG9yQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1N0YXJ0dXApO1xuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBJbnB1dCBTZXJpYWxpemVyXG50eXBlIFNlcmlhbGl6ZWRTZWFyY2hFZGl0b3IgPSB7IG1vZGVsVXJpOiBzdHJpbmcgfCB1bmRlZmluZWQ7IGRpcnR5OiBib29sZWFuOyBjb25maWc/OiBTZWFyY2hFZGl0b3JDb25zdGFudHMuU2VhcmNoQ29uZmlndXJhdGlvbjsgbmFtZTogc3RyaW5nOyBtYXRjaFJhbmdlczogUmFuZ2VbXTsgYmFja2luZ1VyaT86IHN0cmluZyB9O1xuXG5jbGFzcyBTZWFyY2hFZGl0b3JJbnB1dFNlcmlhbGl6ZXIgaW1wbGVtZW50cyBJRWRpdG9yU2VyaWFsaXplciB7XG5cblx0Y2FuU2VyaWFsaXplKGlucHV0OiBTZWFyY2hFZGl0b3JJbnB1dCkge1xuXHRcdHJldHVybiAhIWlucHV0LnRyeVJlYWRDb25maWdTeW5jKCk7XG5cdH1cblxuXHRzZXJpYWxpemUoaW5wdXQ6IFNlYXJjaEVkaXRvcklucHV0KSB7XG5cdFx0aWYgKCF0aGlzLmNhblNlcmlhbGl6ZShpbnB1dCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKGlucHV0LmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHsgbW9kZWxVcmk6IHVuZGVmaW5lZCwgZGlydHk6IGZhbHNlLCBjb25maWc6IGlucHV0LnRyeVJlYWRDb25maWdTeW5jKCksIG5hbWU6IGlucHV0LmdldE5hbWUoKSwgbWF0Y2hSYW5nZXM6IFtdLCBiYWNraW5nVXJpOiBpbnB1dC5iYWNraW5nVXJpPy50b1N0cmluZygpIH0gc2F0aXNmaWVzIFNlcmlhbGl6ZWRTZWFyY2hFZGl0b3IpO1xuXHRcdH1cblxuXHRcdGxldCBtb2RlbFVyaSA9IHVuZGVmaW5lZDtcblx0XHRpZiAoaW5wdXQubW9kZWxVcmkucGF0aCB8fCBpbnB1dC5tb2RlbFVyaS5mcmFnbWVudCAmJiBpbnB1dC5pc0RpcnR5KCkpIHtcblx0XHRcdG1vZGVsVXJpID0gaW5wdXQubW9kZWxVcmkudG9TdHJpbmcoKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb25maWcgPSBpbnB1dC50cnlSZWFkQ29uZmlnU3luYygpO1xuXHRcdGNvbnN0IGRpcnR5ID0gaW5wdXQuaXNEaXJ0eSgpO1xuXHRcdGNvbnN0IG1hdGNoUmFuZ2VzID0gZGlydHkgPyBpbnB1dC5nZXRNYXRjaFJhbmdlcygpIDogW107XG5cdFx0Y29uc3QgYmFja2luZ1VyaSA9IGlucHV0LmJhY2tpbmdVcmk7XG5cblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoeyBtb2RlbFVyaSwgZGlydHksIGNvbmZpZywgbmFtZTogaW5wdXQuZ2V0TmFtZSgpLCBtYXRjaFJhbmdlcywgYmFja2luZ1VyaTogYmFja2luZ1VyaT8udG9TdHJpbmcoKSB9IHNhdGlzZmllcyBTZXJpYWxpemVkU2VhcmNoRWRpdG9yKTtcblx0fVxuXG5cdGRlc2VyaWFsaXplKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsIHNlcmlhbGl6ZWRFZGl0b3JJbnB1dDogc3RyaW5nKTogU2VhcmNoRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHsgbW9kZWxVcmksIGRpcnR5LCBjb25maWcsIG1hdGNoUmFuZ2VzLCBiYWNraW5nVXJpIH0gPSBKU09OLnBhcnNlKHNlcmlhbGl6ZWRFZGl0b3JJbnB1dCkgYXMgU2VyaWFsaXplZFNlYXJjaEVkaXRvcjtcblx0XHRpZiAoY29uZmlnICYmIChjb25maWcucXVlcnkgIT09IHVuZGVmaW5lZCkpIHtcblx0XHRcdGlmIChtb2RlbFVyaSkge1xuXHRcdFx0XHRjb25zdCBpbnB1dCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGdldE9yTWFrZVNlYXJjaEVkaXRvcklucHV0LFxuXHRcdFx0XHRcdHsgZnJvbTogJ21vZGVsJywgbW9kZWxVcmk6IFVSSS5wYXJzZShtb2RlbFVyaSksIGNvbmZpZywgYmFja3VwT2Y6IGJhY2tpbmdVcmkgPyBVUkkucGFyc2UoYmFja2luZ1VyaSkgOiB1bmRlZmluZWQgfSk7XG5cdFx0XHRcdGlucHV0LnNldERpcnR5KGRpcnR5KTtcblx0XHRcdFx0aW5wdXQuc2V0TWF0Y2hSYW5nZXMobWF0Y2hSYW5nZXMpO1xuXHRcdFx0XHRyZXR1cm4gaW5wdXQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoYmFja2luZ1VyaSkge1xuXHRcdFx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihnZXRPck1ha2VTZWFyY2hFZGl0b3JJbnB1dCxcblx0XHRcdFx0XHRcdHsgZnJvbTogJ2V4aXN0aW5nRmlsZScsIGZpbGVVcmk6IFVSSS5wYXJzZShiYWNraW5nVXJpKSB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZ2V0T3JNYWtlU2VhcmNoRWRpdG9ySW5wdXQsXG5cdFx0XHRcdFx0XHR7IGZyb206ICdyYXdEYXRhJywgcmVzdWx0c0NvbnRlbnRzOiAnJywgY29uZmlnIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SUVkaXRvckZhY3RvcnlSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JGYWN0b3J5KS5yZWdpc3RlckVkaXRvclNlcmlhbGl6ZXIoXG5cdFNlYXJjaEVkaXRvcklucHV0LklELFxuXHRTZWFyY2hFZGl0b3JJbnB1dFNlcmlhbGl6ZXIpO1xuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBDb21tYW5kc1xuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoXG5cdENsZWFuU2VhcmNoRWRpdG9yU3RhdGVDb21tYW5kSWQsXG5cdChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvclBhbmUgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0aWYgKGFjdGl2ZUVkaXRvclBhbmUgaW5zdGFuY2VvZiBTZWFyY2hFZGl0b3IpIHtcblx0XHRcdGFjdGl2ZUVkaXRvclBhbmUuY2xlYW5TdGF0ZSgpO1xuXHRcdH1cblx0fSk7XG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIEFjdGlvbnNcbmNvbnN0IGNhdGVnb3J5ID0gbG9jYWxpemUyKCdzZWFyY2gnLCAnU2VhcmNoIEVkaXRvcicpO1xuXG5leHBvcnQgdHlwZSBMZWdhY3lTZWFyY2hFZGl0b3JBcmdzID0gUGFydGlhbDx7XG5cdHF1ZXJ5OiBzdHJpbmc7XG5cdGluY2x1ZGVzOiBzdHJpbmc7XG5cdGV4Y2x1ZGVzOiBzdHJpbmc7XG5cdGNvbnRleHRMaW5lczogbnVtYmVyO1xuXHR3aG9sZVdvcmQ6IGJvb2xlYW47XG5cdGNhc2VTZW5zaXRpdmU6IGJvb2xlYW47XG5cdHJlZ2V4cDogYm9vbGVhbjtcblx0dXNlSWdub3JlczogYm9vbGVhbjtcblx0c2hvd0luY2x1ZGVzRXhjbHVkZXM6IGJvb2xlYW47XG5cdHRyaWdnZXJTZWFyY2g6IGJvb2xlYW47XG5cdGZvY3VzUmVzdWx0czogYm9vbGVhbjtcblx0bG9jYXRpb246ICdyZXVzZScgfCAnbmV3Jztcbn0+O1xuXG5jb25zdCB0cmFuc2xhdGVMZWdhY3lDb25maWcgPSAobGVnYWN5Q29uZmlnOiBMZWdhY3lTZWFyY2hFZGl0b3JBcmdzICYgT3BlblNlYXJjaEVkaXRvckFyZ3MgPSB7fSk6IE9wZW5TZWFyY2hFZGl0b3JBcmdzID0+IHtcblx0Y29uc3QgY29uZmlnOiBPcGVuU2VhcmNoRWRpdG9yQXJncyA9IHt9O1xuXHRjb25zdCBvdmVycmlkZXM6IHsgW0sgaW4ga2V5b2YgTGVnYWN5U2VhcmNoRWRpdG9yQXJnc106IGtleW9mIE9wZW5TZWFyY2hFZGl0b3JBcmdzIH0gPSB7XG5cdFx0aW5jbHVkZXM6ICdmaWxlc1RvSW5jbHVkZScsXG5cdFx0ZXhjbHVkZXM6ICdmaWxlc1RvRXhjbHVkZScsXG5cdFx0d2hvbGVXb3JkOiAnbWF0Y2hXaG9sZVdvcmQnLFxuXHRcdGNhc2VTZW5zaXRpdmU6ICdpc0Nhc2VTZW5zaXRpdmUnLFxuXHRcdHJlZ2V4cDogJ2lzUmVnZXhwJyxcblx0XHR1c2VJZ25vcmVzOiAndXNlRXhjbHVkZVNldHRpbmdzQW5kSWdub3JlRmlsZXMnLFxuXHR9O1xuXHRPYmplY3QuZW50cmllcyhsZWdhY3lDb25maWcpLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4ge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdChjb25maWcgYXMgYW55KVsob3ZlcnJpZGVzIGFzIGFueSlba2V5XSA/PyBrZXldID0gdmFsdWU7XG5cdH0pO1xuXHRyZXR1cm4gY29uZmlnO1xufTtcblxuZXhwb3J0IHR5cGUgT3BlblNlYXJjaEVkaXRvckFyZ3MgPSBQYXJ0aWFsPFNlYXJjaEVkaXRvckNvbnN0YW50cy5TZWFyY2hDb25maWd1cmF0aW9uICYgeyB0cmlnZ2VyU2VhcmNoOiBib29sZWFuOyBmb2N1c1Jlc3VsdHM6IGJvb2xlYW47IGxvY2F0aW9uOiAncmV1c2UnIHwgJ25ldycgfT47XG5jb25zdCBvcGVuQXJnTWV0YWRhdGEgPSB7XG5cdGRlc2NyaXB0aW9uOiAnT3BlbiBhIG5ldyBzZWFyY2ggZWRpdG9yLiBBcmd1bWVudHMgcGFzc2VkIGNhbiBpbmNsdWRlIHZhcmlhYmxlcyBsaWtlICR7cmVsYXRpdmVGaWxlRGlybmFtZX0uJyxcblx0YXJnczogW3tcblx0XHRuYW1lOiAnT3BlbiBuZXcgU2VhcmNoIEVkaXRvciBhcmdzJyxcblx0XHRzY2hlbWE6IHtcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0cXVlcnk6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0ZmlsZXNUb0luY2x1ZGU6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0ZmlsZXNUb0V4Y2x1ZGU6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0Y29udGV4dExpbmVzOiB7IHR5cGU6ICdudW1iZXInIH0sXG5cdFx0XHRcdG1hdGNoV2hvbGVXb3JkOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHRcdFx0XHRpc0Nhc2VTZW5zaXRpdmU6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdFx0XHRcdGlzUmVnZXhwOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHRcdFx0XHR1c2VFeGNsdWRlU2V0dGluZ3NBbmRJZ25vcmVGaWxlczogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0XHRcdFx0c2hvd0luY2x1ZGVzRXhjbHVkZXM6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdFx0XHRcdHRyaWdnZXJTZWFyY2g6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdFx0XHRcdGZvY3VzUmVzdWx0czogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0XHRcdFx0b25seU9wZW5FZGl0b3JzOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHRcdFx0fVxuXHRcdH1cblx0fV1cbn0gYXMgY29uc3Q7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3NlYXJjaC5zZWFyY2hFZGl0b3IuYWN0aW9uLmRlbGV0ZUZpbGVSZXN1bHRzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3NlYXJjaEVkaXRvci5kZWxldGVSZXN1bHRCbG9jaycsICdEZWxldGUgRmlsZSBSZXN1bHRzJyksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuQmFja3NwYWNlLFxuXHRcdFx0fSxcblx0XHRcdHByZWNvbmRpdGlvbjogU2VhcmNoRWRpdG9yQ29uc3RhbnRzLkluU2VhcmNoRWRpdG9yLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IGNvbnRleHRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSkuZ2V0Q29udGV4dChnZXRBY3RpdmVFbGVtZW50KCkpO1xuXHRcdGlmIChjb250ZXh0U2VydmljZS5nZXRWYWx1ZShTZWFyY2hFZGl0b3JDb25zdGFudHMuSW5TZWFyY2hFZGl0b3Iuc2VyaWFsaXplKCkpKSB7XG5cdFx0XHQoYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lIGFzIFNlYXJjaEVkaXRvcikuZGVsZXRlUmVzdWx0QmxvY2soKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFNlYXJjaEVkaXRvckNvbnN0YW50cy5PcGVuTmV3RWRpdG9yQ29tbWFuZElkLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc2VhcmNoLm9wZW5OZXdTZWFyY2hFZGl0b3InLCAnTmV3IFNlYXJjaCBFZGl0b3InKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRtZXRhZGF0YTogb3BlbkFyZ01ldGFkYXRhXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzOiBMZWdhY3lTZWFyY2hFZGl0b3JBcmdzIHwgT3BlblNlYXJjaEVkaXRvckFyZ3MpIHtcblx0XHRhd2FpdCBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKS5pbnZva2VGdW5jdGlvbihvcGVuTmV3U2VhcmNoRWRpdG9yLCB0cmFuc2xhdGVMZWdhY3lDb25maWcoeyBsb2NhdGlvbjogJ25ldycsIC4uLmFyZ3MgfSkpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTZWFyY2hFZGl0b3JDb25zdGFudHMuT3BlbkVkaXRvckNvbW1hbmRJZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3NlYXJjaC5vcGVuU2VhcmNoRWRpdG9yJywgJ09wZW4gU2VhcmNoIEVkaXRvcicpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdG1ldGFkYXRhOiBvcGVuQXJnTWV0YWRhdGFcblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M6IExlZ2FjeVNlYXJjaEVkaXRvckFyZ3MgfCBPcGVuU2VhcmNoRWRpdG9yQXJncykge1xuXHRcdGF3YWl0IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpLmludm9rZUZ1bmN0aW9uKG9wZW5OZXdTZWFyY2hFZGl0b3IsIHRyYW5zbGF0ZUxlZ2FjeUNvbmZpZyh7IGxvY2F0aW9uOiAncmV1c2UnLCAuLi5hcmdzIH0pKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogT3Blbk5ld0VkaXRvclRvU2lkZUNvbW1hbmRJZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3NlYXJjaC5vcGVuTmV3RWRpdG9yVG9TaWRlJywgJ09wZW4gTmV3IFNlYXJjaCBFZGl0b3IgdG8gdGhlIFNpZGUnKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRtZXRhZGF0YTogb3BlbkFyZ01ldGFkYXRhXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzOiBMZWdhY3lTZWFyY2hFZGl0b3JBcmdzIHwgT3BlblNlYXJjaEVkaXRvckFyZ3MpIHtcblx0XHRhd2FpdCBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKS5pbnZva2VGdW5jdGlvbihvcGVuTmV3U2VhcmNoRWRpdG9yLCB0cmFuc2xhdGVMZWdhY3lDb25maWcoYXJncyksIHRydWUpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBPcGVuSW5FZGl0b3JDb21tYW5kSWQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzZWFyY2gub3BlblJlc3VsdHNJbkVkaXRvcicsICdPcGVuIFJlc3VsdHMgaW4gRWRpdG9yJyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5FbnRlcixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFNlYXJjaENvbnN0YW50cy5TZWFyY2hDb250ZXh0Lkhhc1NlYXJjaFJlc3VsdHMsIFNlYXJjaENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlNlYXJjaFZpZXdGb2N1c2VkS2V5KSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdG1hYzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5FbnRlclxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHNlYXJjaFZpZXcgPSBnZXRTZWFyY2hWaWV3KHZpZXdzU2VydmljZSk7XG5cdFx0aWYgKHNlYXJjaFZpZXcpIHtcblx0XHRcdGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGNyZWF0ZUVkaXRvckZyb21TZWFyY2hSZXN1bHQsIHNlYXJjaFZpZXcuc2VhcmNoUmVzdWx0LCBzZWFyY2hWaWV3LnNlYXJjaEluY2x1ZGVQYXR0ZXJuLmdldFZhbHVlKCksIHNlYXJjaFZpZXcuc2VhcmNoRXhjbHVkZVBhdHRlcm4uZ2V0VmFsdWUoKSwgc2VhcmNoVmlldy5zZWFyY2hJbmNsdWRlUGF0dGVybi5vbmx5U2VhcmNoSW5PcGVuRWRpdG9ycygpKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFJlcnVuU2VhcmNoRWRpdG9yU2VhcmNoQ29tbWFuZElkLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc2VhcmNoLnJlcnVuU2VhcmNoSW5FZGl0b3InLCAnU2VhcmNoIEFnYWluJyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleVIsXG5cdFx0XHRcdHdoZW46IFNlYXJjaEVkaXRvckNvbnN0YW50cy5JblNlYXJjaEVkaXRvcixcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRpY29uOiBzZWFyY2hSZWZyZXNoSWNvbixcblx0XHRcdG1lbnU6IFsuLi5bTWVudUlkLkVkaXRvclRpdGxlLCBNZW51SWQuQ29tcGFjdFdpbmRvd0VkaXRvclRpdGxlXS5tYXAoaWQgPT4gKHtcblx0XHRcdFx0aWQsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdHdoZW46IEFjdGl2ZUVkaXRvckNvbnRleHQuaXNFcXVhbFRvKFNlYXJjaEVkaXRvckNvbnN0YW50cy5TZWFyY2hFZGl0b3JJRClcblx0XHRcdH0pKSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQWN0aXZlRWRpdG9yQ29udGV4dC5pc0VxdWFsVG8oU2VhcmNoRWRpdG9yQ29uc3RhbnRzLlNlYXJjaEVkaXRvcklEKVxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBpbnB1dCA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yO1xuXHRcdGlmIChpbnB1dCBpbnN0YW5jZW9mIFNlYXJjaEVkaXRvcklucHV0KSB7XG5cdFx0XHQoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lIGFzIFNlYXJjaEVkaXRvcikudHJpZ2dlclNlYXJjaCh7IHJlc2V0Q3Vyc29yOiBmYWxzZSB9KTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEZvY3VzUXVlcnlFZGl0b3JXaWRnZXRDb21tYW5kSWQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzZWFyY2guYWN0aW9uLmZvY3VzUXVlcnlFZGl0b3JXaWRnZXQnLCAnRm9jdXMgU2VhcmNoIEVkaXRvciBJbnB1dCcpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogU2VhcmNoRWRpdG9yQ29uc3RhbnRzLkluU2VhcmNoRWRpdG9yLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBpbnB1dCA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yO1xuXHRcdGlmIChpbnB1dCBpbnN0YW5jZW9mIFNlYXJjaEVkaXRvcklucHV0KSB7XG5cdFx0XHQoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lIGFzIFNlYXJjaEVkaXRvcikuZm9jdXNTZWFyY2hJbnB1dCgpO1xuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRm9jdXNRdWVyeUVkaXRvckZpbGVzVG9JbmNsdWRlQ29tbWFuZElkLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc2VhcmNoLmFjdGlvbi5mb2N1c0ZpbGVzVG9JbmNsdWRlJywgJ0ZvY3VzIFNlYXJjaCBFZGl0b3IgRmlsZXMgdG8gSW5jbHVkZScpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogU2VhcmNoRWRpdG9yQ29uc3RhbnRzLkluU2VhcmNoRWRpdG9yLFxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGlucHV0ID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3I7XG5cdFx0aWYgKGlucHV0IGluc3RhbmNlb2YgU2VhcmNoRWRpdG9ySW5wdXQpIHtcblx0XHRcdChlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUgYXMgU2VhcmNoRWRpdG9yKS5mb2N1c0ZpbGVzVG9JbmNsdWRlSW5wdXQoKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEZvY3VzUXVlcnlFZGl0b3JGaWxlc1RvRXhjbHVkZUNvbW1hbmRJZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3NlYXJjaC5hY3Rpb24uZm9jdXNGaWxlc1RvRXhjbHVkZScsICdGb2N1cyBTZWFyY2ggRWRpdG9yIEZpbGVzIHRvIEV4Y2x1ZGUnKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IFNlYXJjaEVkaXRvckNvbnN0YW50cy5JblNlYXJjaEVkaXRvcixcblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBpbnB1dCA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yO1xuXHRcdGlmIChpbnB1dCBpbnN0YW5jZW9mIFNlYXJjaEVkaXRvcklucHV0KSB7XG5cdFx0XHQoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lIGFzIFNlYXJjaEVkaXRvcikuZm9jdXNGaWxlc1RvRXhjbHVkZUlucHV0KCk7XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUb2dnbGVTZWFyY2hFZGl0b3JDYXNlU2Vuc2l0aXZlQ29tbWFuZElkLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc2VhcmNoRWRpdG9yLmFjdGlvbi50b2dnbGVTZWFyY2hFZGl0b3JDYXNlU2Vuc2l0aXZlJywgJ1RvZ2dsZSBNYXRjaCBDYXNlJyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBTZWFyY2hFZGl0b3JDb25zdGFudHMuSW5TZWFyY2hFZGl0b3IsXG5cdFx0XHRrZXliaW5kaW5nOiBPYmplY3QuYXNzaWduKHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHdoZW46IFNlYXJjaENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlNlYXJjaElucHV0Qm94Rm9jdXNlZEtleSxcblx0XHRcdH0sIFRvZ2dsZUNhc2VTZW5zaXRpdmVLZXliaW5kaW5nKVxuXHRcdH0pO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdHRvZ2dsZVNlYXJjaEVkaXRvckNhc2VTZW5zaXRpdmVDb21tYW5kKGFjY2Vzc29yKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVG9nZ2xlU2VhcmNoRWRpdG9yV2hvbGVXb3JkQ29tbWFuZElkLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc2VhcmNoRWRpdG9yLmFjdGlvbi50b2dnbGVTZWFyY2hFZGl0b3JXaG9sZVdvcmQnLCAnVG9nZ2xlIE1hdGNoIFdob2xlIFdvcmQnKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IFNlYXJjaEVkaXRvckNvbnN0YW50cy5JblNlYXJjaEVkaXRvcixcblx0XHRcdGtleWJpbmRpbmc6IE9iamVjdC5hc3NpZ24oe1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0d2hlbjogU2VhcmNoQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuU2VhcmNoSW5wdXRCb3hGb2N1c2VkS2V5LFxuXHRcdFx0fSwgVG9nZ2xlV2hvbGVXb3JkS2V5YmluZGluZylcblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHR0b2dnbGVTZWFyY2hFZGl0b3JXaG9sZVdvcmRDb21tYW5kKGFjY2Vzc29yKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVG9nZ2xlU2VhcmNoRWRpdG9yUmVnZXhDb21tYW5kSWQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzZWFyY2hFZGl0b3IuYWN0aW9uLnRvZ2dsZVNlYXJjaEVkaXRvclJlZ2V4JywgXCJUb2dnbGUgVXNlIFJlZ3VsYXIgRXhwcmVzc2lvblwiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IFNlYXJjaEVkaXRvckNvbnN0YW50cy5JblNlYXJjaEVkaXRvcixcblx0XHRcdGtleWJpbmRpbmc6IE9iamVjdC5hc3NpZ24oe1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0d2hlbjogU2VhcmNoQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuU2VhcmNoSW5wdXRCb3hGb2N1c2VkS2V5LFxuXHRcdFx0fSwgVG9nZ2xlUmVnZXhLZXliaW5kaW5nKVxuXHRcdH0pO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdHRvZ2dsZVNlYXJjaEVkaXRvclJlZ2V4Q29tbWFuZChhY2Nlc3Nvcik7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFNlYXJjaEVkaXRvckNvbnN0YW50cy5Ub2dnbGVTZWFyY2hFZGl0b3JDb250ZXh0TGluZXNDb21tYW5kSWQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzZWFyY2hFZGl0b3IuYWN0aW9uLnRvZ2dsZVNlYXJjaEVkaXRvckNvbnRleHRMaW5lcycsIFwiVG9nZ2xlIENvbnRleHQgTGluZXNcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBTZWFyY2hFZGl0b3JDb25zdGFudHMuSW5TZWFyY2hFZGl0b3IsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlMLFxuXHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlMIH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHR0b2dnbGVTZWFyY2hFZGl0b3JDb250ZXh0TGluZXNDb21tYW5kKGFjY2Vzc29yKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogSW5jcmVhc2VTZWFyY2hFZGl0b3JDb250ZXh0TGluZXNDb21tYW5kSWQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzZWFyY2hFZGl0b3IuYWN0aW9uLmluY3JlYXNlU2VhcmNoRWRpdG9yQ29udGV4dExpbmVzJywgXCJJbmNyZWFzZSBDb250ZXh0IExpbmVzXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogU2VhcmNoRWRpdG9yQ29uc3RhbnRzLkluU2VhcmNoRWRpdG9yLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuRXF1YWxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHsgbW9kaWZ5U2VhcmNoRWRpdG9yQ29udGV4dExpbmVzQ29tbWFuZChhY2Nlc3NvciwgdHJ1ZSk7IH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IERlY3JlYXNlU2VhcmNoRWRpdG9yQ29udGV4dExpbmVzQ29tbWFuZElkLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc2VhcmNoRWRpdG9yLmFjdGlvbi5kZWNyZWFzZVNlYXJjaEVkaXRvckNvbnRleHRMaW5lcycsIFwiRGVjcmVhc2UgQ29udGV4dCBMaW5lc1wiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IFNlYXJjaEVkaXRvckNvbnN0YW50cy5JblNlYXJjaEVkaXRvcixcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLk1pbnVzXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7IG1vZGlmeVNlYXJjaEVkaXRvckNvbnRleHRMaW5lc0NvbW1hbmQoYWNjZXNzb3IsIGZhbHNlKTsgfVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU2VsZWN0QWxsU2VhcmNoRWRpdG9yTWF0Y2hlc0NvbW1hbmRJZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3NlYXJjaEVkaXRvci5hY3Rpb24uc2VsZWN0QWxsU2VhcmNoRWRpdG9yTWF0Y2hlcycsIFwiU2VsZWN0IEFsbCBNYXRjaGVzXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogU2VhcmNoRWRpdG9yQ29uc3RhbnRzLkluU2VhcmNoRWRpdG9yLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleUwsXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0c2VsZWN0QWxsU2VhcmNoRWRpdG9yTWF0Y2hlc0NvbW1hbmQoYWNjZXNzb3IpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE9wZW5TZWFyY2hFZGl0b3JBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZWFyY2guYWN0aW9uLm9wZW5OZXdFZGl0b3JGcm9tVmlldycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3NlYXJjaC5vcGVuTmV3RWRpdG9yJywgXCJPcGVuIE5ldyBTZWFyY2ggRWRpdG9yXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRpY29uOiBzZWFyY2hOZXdFZGl0b3JJY29uLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBWSUVXX0lEKSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRyZXR1cm4gb3BlblNlYXJjaEVkaXRvcihhY2Nlc3Nvcik7XG5cdH1cbn0pO1xuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBTZWFyY2ggRWRpdG9yIFdvcmtpbmcgQ29weSBFZGl0b3IgSGFuZGxlclxuY2xhc3MgU2VhcmNoRWRpdG9yV29ya2luZ0NvcHlFZGl0b3JIYW5kbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24sIElXb3JraW5nQ29weUVkaXRvckhhbmRsZXIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5zZWFyY2hFZGl0b3JXb3JraW5nQ29weUVkaXRvckhhbmRsZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlIHdvcmtpbmdDb3B5RWRpdG9yU2VydmljZTogSVdvcmtpbmdDb3B5RWRpdG9yU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdvcmtpbmdDb3B5RWRpdG9yU2VydmljZS5yZWdpc3RlckhhbmRsZXIodGhpcykpO1xuXHR9XG5cblx0aGFuZGxlcyh3b3JraW5nQ29weTogSVdvcmtpbmdDb3B5SWRlbnRpZmllcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB3b3JraW5nQ29weS5yZXNvdXJjZS5zY2hlbWUgPT09IFNlYXJjaEVkaXRvckNvbnN0YW50cy5TZWFyY2hFZGl0b3JTY2hlbWU7XG5cdH1cblxuXHRpc09wZW4od29ya2luZ0NvcHk6IElXb3JraW5nQ29weUlkZW50aWZpZXIsIGVkaXRvcjogRWRpdG9ySW5wdXQpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuaGFuZGxlcyh3b3JraW5nQ29weSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZWRpdG9yIGluc3RhbmNlb2YgU2VhcmNoRWRpdG9ySW5wdXQgJiYgaXNFcXVhbCh3b3JraW5nQ29weS5yZXNvdXJjZSwgZWRpdG9yLm1vZGVsVXJpKTtcblx0fVxuXG5cdGNyZWF0ZUVkaXRvcih3b3JraW5nQ29weTogSVdvcmtpbmdDb3B5SWRlbnRpZmllcik6IEVkaXRvcklucHV0IHtcblx0XHRjb25zdCBpbnB1dCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZ2V0T3JNYWtlU2VhcmNoRWRpdG9ySW5wdXQsIHsgZnJvbTogJ21vZGVsJywgbW9kZWxVcmk6IHdvcmtpbmdDb3B5LnJlc291cmNlIH0pO1xuXHRcdGlucHV0LnNldERpcnR5KHRydWUpO1xuXG5cdFx0cmV0dXJuIGlucHV0O1xuXHR9XG59XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihTZWFyY2hFZGl0b3JXb3JraW5nQ29weUVkaXRvckhhbmRsZXIuSUQsIFNlYXJjaEVkaXRvcldvcmtpbmdDb3B5RWRpdG9ySGFuZGxlciwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcbi8vI2VuZHJlZ2lvblxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLFNBQVMsZUFBZTtBQUNqQyxTQUFTLFdBQVc7QUFHcEIsU0FBUywrQkFBK0IsdUJBQXVCLGlDQUFpQztBQUNoRyxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsU0FBUyxRQUFRLHVCQUF1QjtBQUNqRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGdCQUFnQiwwQkFBMEI7QUFDbkQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw0QkFBaUQ7QUFDMUQsU0FBaUMsZ0JBQWdCLHNDQUFzQztBQUN2RixTQUFvRCxrQkFBa0Isa0NBQWtDO0FBQ3hHLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMscUJBQXFCLHlCQUF5QjtBQUN2RCxZQUFZLHFCQUFxQjtBQUNqQyxZQUFZLDJCQUEyQjtBQUN2QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDhCQUE4Qix1Q0FBdUMscUJBQXFCLGtCQUFrQixxQ0FBcUMsd0NBQXdDLHVDQUF1QyxnQ0FBZ0MsMENBQTBDO0FBQ25ULFNBQVMsNEJBQTRCLG1CQUFtQix5QkFBeUI7QUFDakYsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxl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
