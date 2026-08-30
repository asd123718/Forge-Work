var _a;
import { isMacintosh } from "../../../../base/common/platform.js";
import * as nls from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import * as Constants from "../common/constants.js";
import * as SearchEditorConstants from "../../searchEditor/browser/constants.js";
import { SearchEditorInput } from "../../searchEditor/browser/searchEditorInput.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IsSessionsWindowContext } from "../../../common/contextkeys.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { ToggleCaseSensitiveKeybinding, TogglePreserveCaseKeybinding, ToggleRegexKeybinding, ToggleWholeWordKeybinding } from "../../../../editor/contrib/find/browser/findModel.js";
import { category, getSearchView, openSearchView } from "./searchActionsBase.js";
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from "../../../../platform/accessibility/common/accessibility.js";
import { getActiveElement } from "../../../../base/browser/dom.js";
import { isSearchTreeFolderMatch } from "./searchTreeModel/searchTreeCommon.js";
registerAction2(class ToggleQueryDetailsAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ToggleQueryDetailsActionId,
      title: nls.localize2("ToggleQueryDetailsAction.label", "Toggle Query Details"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.or(Constants.SearchContext.SearchViewFocusedKey, SearchEditorConstants.InSearchEditor),
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyJ
      }
    });
  }
  run(accessor, ...args) {
    const options = args[0];
    const contextService = accessor.get(IContextKeyService).getContext(getActiveElement());
    if (contextService.getValue(SearchEditorConstants.InSearchEditor.serialize())) {
      accessor.get(IEditorService).activeEditorPane.toggleQueryDetails(options?.show);
    } else if (contextService.getValue(Constants.SearchContext.SearchViewFocusedKey.serialize())) {
      const searchView = getSearchView(accessor.get(IViewsService));
      assertReturnsDefined(searchView).toggleQueryDetails(void 0, options?.show);
    }
  }
});
registerAction2(class CloseReplaceAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.CloseReplaceWidgetActionId,
      title: nls.localize2("CloseReplaceWidget.label", "Close Replace Widget"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.ReplaceInputBoxFocusedKey),
        primary: KeyCode.Escape
      }
    });
  }
  run(accessor) {
    const searchView = getSearchView(accessor.get(IViewsService));
    if (searchView) {
      searchView.searchAndReplaceWidget.toggleReplace(false);
      searchView.searchAndReplaceWidget.focus();
    }
    return Promise.resolve(null);
  }
});
registerAction2(class ToggleCaseSensitiveCommandAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ToggleCaseSensitiveCommandId,
      title: nls.localize2("ToggleCaseSensitiveCommandId.label", "Toggle Case Sensitive"),
      category,
      keybinding: Object.assign({
        weight: KeybindingWeight.WorkbenchContrib,
        when: isMacintosh ? ContextKeyExpr.and(Constants.SearchContext.SearchViewFocusedKey, Constants.SearchContext.FileMatchOrFolderMatchFocusKey.toNegated()) : Constants.SearchContext.SearchViewFocusedKey
      }, ToggleCaseSensitiveKeybinding)
    });
  }
  async run(accessor) {
    toggleCaseSensitiveCommand(accessor);
  }
});
registerAction2(class ToggleWholeWordCommandAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ToggleWholeWordCommandId,
      title: nls.localize2("ToggleWholeWordCommandId.label", "Toggle Whole Word"),
      keybinding: Object.assign({
        weight: KeybindingWeight.WorkbenchContrib,
        when: Constants.SearchContext.SearchViewFocusedKey
      }, ToggleWholeWordKeybinding),
      category
    });
  }
  async run(accessor) {
    return toggleWholeWordCommand(accessor);
  }
});
registerAction2(class ToggleRegexCommandAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ToggleRegexCommandId,
      title: nls.localize2("ToggleRegexCommandId.label", "Toggle Regex"),
      keybinding: Object.assign({
        weight: KeybindingWeight.WorkbenchContrib,
        when: Constants.SearchContext.SearchViewFocusedKey
      }, ToggleRegexKeybinding),
      category
    });
  }
  async run(accessor) {
    return toggleRegexCommand(accessor);
  }
});
registerAction2(class TogglePreserveCaseAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.TogglePreserveCaseId,
      title: nls.localize2("TogglePreserveCaseId.label", "Toggle Preserve Case"),
      keybinding: Object.assign({
        weight: KeybindingWeight.WorkbenchContrib,
        when: Constants.SearchContext.SearchViewFocusedKey
      }, TogglePreserveCaseKeybinding),
      category
    });
  }
  async run(accessor) {
    return togglePreserveCaseCommand(accessor);
  }
});
registerAction2(class OpenMatchAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.OpenMatch,
      title: nls.localize2("OpenMatch.label", "Open Match"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.FileMatchOrMatchFocusKey),
        primary: KeyCode.Enter,
        mac: {
          primary: KeyCode.Enter,
          secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow]
        }
      }
    });
  }
  run(accessor) {
    const searchView = getSearchView(accessor.get(IViewsService));
    if (searchView) {
      const tree = searchView.getControl();
      const viewer = searchView.getControl();
      const focus = tree.getFocus()[0];
      if (isSearchTreeFolderMatch(focus)) {
        viewer.toggleCollapsed(focus);
      } else {
        searchView.open(tree.getFocus()[0], false, false, true);
      }
    }
  }
});
registerAction2(class OpenMatchToSideAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.OpenMatchToSide,
      title: nls.localize2("OpenMatchToSide.label", "Open Match To Side"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.FileMatchOrMatchFocusKey),
        primary: KeyMod.CtrlCmd | KeyCode.Enter,
        mac: {
          primary: KeyMod.WinCtrl | KeyCode.Enter
        }
      }
    });
  }
  run(accessor) {
    const searchView = getSearchView(accessor.get(IViewsService));
    if (searchView) {
      const tree = searchView.getControl();
      searchView.open(tree.getFocus()[0], false, true, true);
    }
  }
});
registerAction2(class AddCursorsAtSearchResultsAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.AddCursorsAtSearchResults,
      title: nls.localize2("AddCursorsAtSearchResults.label", "Add Cursors at Search Results"),
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.FileMatchOrMatchFocusKey),
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL
      },
      category
    });
  }
  async run(accessor) {
    const searchView = getSearchView(accessor.get(IViewsService));
    if (searchView) {
      const tree = searchView.getControl();
      searchView.openEditorWithMultiCursor(tree.getFocus()[0]);
    }
  }
});
registerAction2(class FocusNextInputAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.FocusNextInputActionId,
      title: nls.localize2("FocusNextInputAction.label", "Focus Next Input"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.or(
          ContextKeyExpr.and(SearchEditorConstants.InSearchEditor, Constants.SearchContext.InputBoxFocusedKey),
          ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.InputBoxFocusedKey)
        ),
        primary: KeyMod.CtrlCmd | KeyCode.DownArrow
      }
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const input = editorService.activeEditor;
    if (input instanceof SearchEditorInput) {
      editorService.activeEditorPane.focusNextInput();
    }
    const searchView = getSearchView(accessor.get(IViewsService));
    searchView?.focusNextInputBox();
  }
});
registerAction2(class FocusPreviousInputAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.FocusPreviousInputActionId,
      title: nls.localize2("FocusPreviousInputAction.label", "Focus Previous Input"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.or(
          ContextKeyExpr.and(SearchEditorConstants.InSearchEditor, Constants.SearchContext.InputBoxFocusedKey),
          ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.InputBoxFocusedKey, Constants.SearchContext.SearchInputBoxFocusedKey.toNegated())
        ),
        primary: KeyMod.CtrlCmd | KeyCode.UpArrow
      }
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const input = editorService.activeEditor;
    if (input instanceof SearchEditorInput) {
      editorService.activeEditorPane.focusPrevInput();
    }
    const searchView = getSearchView(accessor.get(IViewsService));
    searchView?.focusPreviousInputBox();
  }
});
registerAction2(class FocusSearchFromResultsAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.FocusSearchFromResults,
      title: nls.localize2("FocusSearchFromResults.label", "Focus Search From Results"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, ContextKeyExpr.or(Constants.SearchContext.FirstMatchFocusKey, CONTEXT_ACCESSIBILITY_MODE_ENABLED)),
        primary: KeyMod.CtrlCmd | KeyCode.UpArrow
      }
    });
  }
  run(accessor) {
    const searchView = getSearchView(accessor.get(IViewsService));
    searchView?.focusPreviousInputBox();
  }
});
registerAction2((_a = class extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ToggleSearchOnTypeActionId,
      title: nls.localize2("toggleTabs", "Toggle Search on Type"),
      category
    });
  }
  async run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    const searchOnType = configurationService.getValue(_a.searchOnTypeKey);
    return configurationService.updateValue(_a.searchOnTypeKey, !searchOnType);
  }
}, _a.searchOnTypeKey = "search.searchOnType", _a));
registerAction2(class FocusSearchListCommandAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.FocusSearchListCommandID,
      title: nls.localize2("focusSearchListCommandLabel", "Focus List"),
      category,
      f1: true
    });
  }
  async run(accessor) {
    focusSearchListCommand(accessor);
  }
});
registerAction2(class FocusNextSearchResultAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.FocusNextSearchResultActionId,
      title: nls.localize2("FocusNextSearchResult.label", "Focus Next Search Result"),
      keybinding: [{
        primary: KeyCode.F4,
        weight: KeybindingWeight.WorkbenchContrib
      }],
      category,
      f1: true,
      precondition: ContextKeyExpr.or(Constants.SearchContext.HasSearchResults, SearchEditorConstants.InSearchEditor)
    });
  }
  async run(accessor) {
    return await focusNextSearchResult(accessor);
  }
});
registerAction2(class FocusPreviousSearchResultAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.FocusPreviousSearchResultActionId,
      title: nls.localize2("FocusPreviousSearchResult.label", "Focus Previous Search Result"),
      keybinding: [{
        primary: KeyMod.Shift | KeyCode.F4,
        weight: KeybindingWeight.WorkbenchContrib
      }],
      category,
      f1: true,
      precondition: ContextKeyExpr.or(Constants.SearchContext.HasSearchResults, SearchEditorConstants.InSearchEditor)
    });
  }
  async run(accessor) {
    return await focusPreviousSearchResult(accessor);
  }
});
registerAction2(class ReplaceInFilesAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ReplaceInFilesActionId,
      title: nls.localize2("replaceInFiles", "Replace in Files"),
      keybinding: [{
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyH,
        weight: KeybindingWeight.WorkbenchContrib
      }],
      category,
      f1: true,
      precondition: IsSessionsWindowContext.negate(),
      menu: [{
        id: MenuId.MenubarEditMenu,
        group: "4_find_global",
        order: 2,
        when: IsSessionsWindowContext.negate()
      }]
    });
  }
  async run(accessor) {
    return await findOrReplaceInFiles(accessor, true);
  }
});
function toggleCaseSensitiveCommand(accessor) {
  const searchView = getSearchView(accessor.get(IViewsService));
  searchView?.toggleCaseSensitive();
}
function toggleWholeWordCommand(accessor) {
  const searchView = getSearchView(accessor.get(IViewsService));
  searchView?.toggleWholeWords();
}
function toggleRegexCommand(accessor) {
  const searchView = getSearchView(accessor.get(IViewsService));
  searchView?.toggleRegex();
}
function togglePreserveCaseCommand(accessor) {
  const searchView = getSearchView(accessor.get(IViewsService));
  searchView?.togglePreserveCase();
}
const focusSearchListCommand = (accessor) => {
  const viewsService = accessor.get(IViewsService);
  openSearchView(viewsService).then((searchView) => {
    searchView?.moveFocusToResults();
  });
};
async function focusNextSearchResult(accessor) {
  const editorService = accessor.get(IEditorService);
  const input = editorService.activeEditor;
  if (input instanceof SearchEditorInput) {
    return editorService.activeEditorPane.focusNextResult();
  }
  return openSearchView(accessor.get(IViewsService)).then((searchView) => searchView?.selectNextMatch());
}
async function focusPreviousSearchResult(accessor) {
  const editorService = accessor.get(IEditorService);
  const input = editorService.activeEditor;
  if (input instanceof SearchEditorInput) {
    return editorService.activeEditorPane.focusPreviousResult();
  }
  return openSearchView(accessor.get(IViewsService)).then((searchView) => searchView?.selectPreviousMatch());
}
async function findOrReplaceInFiles(accessor, expandSearchReplaceWidget) {
  return openSearchView(accessor.get(IViewsService), false).then((openedView) => {
    if (openedView) {
      const searchAndReplaceWidget = openedView.searchAndReplaceWidget;
      searchAndReplaceWidget.toggleReplace(expandSearchReplaceWidget);
      const updatedText = openedView.updateTextFromFindWidgetOrSelection({ allowUnselectedWord: !expandSearchReplaceWidget });
      openedView.searchAndReplaceWidget.focus(void 0, updatedText, updatedText);
    }
  });
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNlYXJjaFxcYnJvd3Nlclxcc2VhcmNoQWN0aW9uc05hdi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGlzTWFjaW50b3NoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZEhhbmRsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hDb21wcmVzc2libGVBc3luY0RhdGFUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCAqIGFzIENvbnN0YW50cyBmcm9tICcuLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCAqIGFzIFNlYXJjaEVkaXRvckNvbnN0YW50cyBmcm9tICcuLi8uLi9zZWFyY2hFZGl0b3IvYnJvd3Nlci9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgU2VhcmNoRWRpdG9yIH0gZnJvbSAnLi4vLi4vc2VhcmNoRWRpdG9yL2Jyb3dzZXIvc2VhcmNoRWRpdG9yLmpzJztcbmltcG9ydCB7IFNlYXJjaEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vc2VhcmNoRWRpdG9yL2Jyb3dzZXIvc2VhcmNoRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgVG9nZ2xlQ2FzZVNlbnNpdGl2ZUtleWJpbmRpbmcsIFRvZ2dsZVByZXNlcnZlQ2FzZUtleWJpbmRpbmcsIFRvZ2dsZVJlZ2V4S2V5YmluZGluZywgVG9nZ2xlV2hvbGVXb3JkS2V5YmluZGluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2ZpbmQvYnJvd3Nlci9maW5kTW9kZWwuanMnO1xuaW1wb3J0IHsgY2F0ZWdvcnksIGdldFNlYXJjaFZpZXcsIG9wZW5TZWFyY2hWaWV3IH0gZnJvbSAnLi9zZWFyY2hBY3Rpb25zQmFzZS5qcyc7XG5pbXBvcnQgeyBDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVEIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBnZXRBY3RpdmVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBGaWxlTWF0Y2hPck1hdGNoLCBSZW5kZXJhYmxlTWF0Y2gsIElTZWFyY2hSZXN1bHQsIGlzU2VhcmNoVHJlZUZvbGRlck1hdGNoIH0gZnJvbSAnLi9zZWFyY2hUcmVlTW9kZWwvc2VhcmNoVHJlZUNvbW1vbi5qcyc7XG5cbi8vI3JlZ2lvbiBBY3Rpb25zOiBDaGFuZ2luZyBTZWFyY2ggSW5wdXQgT3B0aW9uc1xucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFRvZ2dsZVF1ZXJ5RGV0YWlsc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuVG9nZ2xlUXVlcnlEZXRhaWxzQWN0aW9uSWQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignVG9nZ2xlUXVlcnlEZXRhaWxzQWN0aW9uLmxhYmVsJywgXCJUb2dnbGUgUXVlcnkgRGV0YWlsc1wiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuU2VhcmNoVmlld0ZvY3VzZWRLZXksIFNlYXJjaEVkaXRvckNvbnN0YW50cy5JblNlYXJjaEVkaXRvciksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlKLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSBhcmdzWzBdIGFzIHsgc2hvdz86IGJvb2xlYW4gfSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb250ZXh0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpLmdldENvbnRleHQoZ2V0QWN0aXZlRWxlbWVudCgpKTtcblx0XHRpZiAoY29udGV4dFNlcnZpY2UuZ2V0VmFsdWUoU2VhcmNoRWRpdG9yQ29uc3RhbnRzLkluU2VhcmNoRWRpdG9yLnNlcmlhbGl6ZSgpKSkge1xuXHRcdFx0KGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yUGFuZSBhcyBTZWFyY2hFZGl0b3IpLnRvZ2dsZVF1ZXJ5RGV0YWlscyhvcHRpb25zPy5zaG93KTtcblx0XHR9IGVsc2UgaWYgKGNvbnRleHRTZXJ2aWNlLmdldFZhbHVlKENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlNlYXJjaFZpZXdGb2N1c2VkS2V5LnNlcmlhbGl6ZSgpKSkge1xuXHRcdFx0Y29uc3Qgc2VhcmNoVmlldyA9IGdldFNlYXJjaFZpZXcoYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpKTtcblx0XHRcdGFzc2VydFJldHVybnNEZWZpbmVkKHNlYXJjaFZpZXcpLnRvZ2dsZVF1ZXJ5RGV0YWlscyh1bmRlZmluZWQsIG9wdGlvbnM/LnNob3cpO1xuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBDbG9zZVJlcGxhY2VBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLkNsb3NlUmVwbGFjZVdpZGdldEFjdGlvbklkLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ0Nsb3NlUmVwbGFjZVdpZGdldC5sYWJlbCcsIFwiQ2xvc2UgUmVwbGFjZSBXaWRnZXRcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb25zdGFudHMuU2VhcmNoQ29udGV4dC5TZWFyY2hWaWV3VmlzaWJsZUtleSwgQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuUmVwbGFjZUlucHV0Qm94Rm9jdXNlZEtleSksXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblxuXHRcdGNvbnN0IHNlYXJjaFZpZXcgPSBnZXRTZWFyY2hWaWV3KGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKSk7XG5cdFx0aWYgKHNlYXJjaFZpZXcpIHtcblx0XHRcdHNlYXJjaFZpZXcuc2VhcmNoQW5kUmVwbGFjZVdpZGdldC50b2dnbGVSZXBsYWNlKGZhbHNlKTtcblx0XHRcdHNlYXJjaFZpZXcuc2VhcmNoQW5kUmVwbGFjZVdpZGdldC5mb2N1cygpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFRvZ2dsZUNhc2VTZW5zaXRpdmVDb21tYW5kQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdCkge1xuXG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLlRvZ2dsZUNhc2VTZW5zaXRpdmVDb21tYW5kSWQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignVG9nZ2xlQ2FzZVNlbnNpdGl2ZUNvbW1hbmRJZC5sYWJlbCcsIFwiVG9nZ2xlIENhc2UgU2Vuc2l0aXZlXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRrZXliaW5kaW5nOiBPYmplY3QuYXNzaWduKHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHdoZW46IGlzTWFjaW50b3NoID8gQ29udGV4dEtleUV4cHIuYW5kKENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlNlYXJjaFZpZXdGb2N1c2VkS2V5LCBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5GaWxlTWF0Y2hPckZvbGRlck1hdGNoRm9jdXNLZXkudG9OZWdhdGVkKCkpIDogQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuU2VhcmNoVmlld0ZvY3VzZWRLZXksXG5cdFx0XHR9LCBUb2dnbGVDYXNlU2Vuc2l0aXZlS2V5YmluZGluZylcblxuXHRcdH0pO1xuXG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPGFueT4ge1xuXHRcdHRvZ2dsZUNhc2VTZW5zaXRpdmVDb21tYW5kKGFjY2Vzc29yKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBUb2dnbGVXaG9sZVdvcmRDb21tYW5kQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5Ub2dnbGVXaG9sZVdvcmRDb21tYW5kSWQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignVG9nZ2xlV2hvbGVXb3JkQ29tbWFuZElkLmxhYmVsJywgXCJUb2dnbGUgV2hvbGUgV29yZFwiKSxcblx0XHRcdGtleWJpbmRpbmc6IE9iamVjdC5hc3NpZ24oe1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0d2hlbjogQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuU2VhcmNoVmlld0ZvY3VzZWRLZXksXG5cdFx0XHR9LCBUb2dnbGVXaG9sZVdvcmRLZXliaW5kaW5nKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTxhbnk+IHtcblx0XHRyZXR1cm4gdG9nZ2xlV2hvbGVXb3JkQ29tbWFuZChhY2Nlc3Nvcik7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgVG9nZ2xlUmVnZXhDb21tYW5kQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5Ub2dnbGVSZWdleENvbW1hbmRJZCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdUb2dnbGVSZWdleENvbW1hbmRJZC5sYWJlbCcsIFwiVG9nZ2xlIFJlZ2V4XCIpLFxuXHRcdFx0a2V5YmluZGluZzogT2JqZWN0LmFzc2lnbih7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHR3aGVuOiBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5TZWFyY2hWaWV3Rm9jdXNlZEtleSxcblx0XHRcdH0sIFRvZ2dsZVJlZ2V4S2V5YmluZGluZyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8YW55PiB7XG5cdFx0cmV0dXJuIHRvZ2dsZVJlZ2V4Q29tbWFuZChhY2Nlc3Nvcik7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgVG9nZ2xlUHJlc2VydmVDYXNlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5Ub2dnbGVQcmVzZXJ2ZUNhc2VJZCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdUb2dnbGVQcmVzZXJ2ZUNhc2VJZC5sYWJlbCcsIFwiVG9nZ2xlIFByZXNlcnZlIENhc2VcIiksXG5cdFx0XHRrZXliaW5kaW5nOiBPYmplY3QuYXNzaWduKHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHdoZW46IENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlNlYXJjaFZpZXdGb2N1c2VkS2V5LFxuXHRcdFx0fSwgVG9nZ2xlUHJlc2VydmVDYXNlS2V5YmluZGluZyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8YW55PiB7XG5cdFx0cmV0dXJuIHRvZ2dsZVByZXNlcnZlQ2FzZUNvbW1hbmQoYWNjZXNzb3IpO1xuXHR9XG59KTtcblxuLy8jZW5kcmVnaW9uXG4vLyNyZWdpb24gQWN0aW9uczogT3BlbmluZyBNYXRjaGVzXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgT3Blbk1hdGNoQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5PcGVuTWF0Y2gsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignT3Blbk1hdGNoLmxhYmVsJywgXCJPcGVuIE1hdGNoXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuU2VhcmNoVmlld1Zpc2libGVLZXksIENvbnN0YW50cy5TZWFyY2hDb250ZXh0LkZpbGVNYXRjaE9yTWF0Y2hGb2N1c0tleSksXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRW50ZXIsXG5cdFx0XHRcdG1hYzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRW50ZXIsXG5cdFx0XHRcdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRvd25BcnJvd11cblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3Qgc2VhcmNoVmlldyA9IGdldFNlYXJjaFZpZXcoYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpKTtcblx0XHRpZiAoc2VhcmNoVmlldykge1xuXHRcdFx0Y29uc3QgdHJlZTogV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZTxJU2VhcmNoUmVzdWx0LCBSZW5kZXJhYmxlTWF0Y2g+ID0gc2VhcmNoVmlldy5nZXRDb250cm9sKCk7XG5cdFx0XHRjb25zdCB2aWV3ZXIgPSBzZWFyY2hWaWV3LmdldENvbnRyb2woKTtcblx0XHRcdGNvbnN0IGZvY3VzID0gdHJlZS5nZXRGb2N1cygpWzBdO1xuXG5cdFx0XHRpZiAoaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2goZm9jdXMpKSB7XG5cdFx0XHRcdHZpZXdlci50b2dnbGVDb2xsYXBzZWQoZm9jdXMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2VhcmNoVmlldy5vcGVuKDxGaWxlTWF0Y2hPck1hdGNoPnRyZWUuZ2V0Rm9jdXMoKVswXSwgZmFsc2UsIGZhbHNlLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgT3Blbk1hdGNoVG9TaWRlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5PcGVuTWF0Y2hUb1NpZGUsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignT3Blbk1hdGNoVG9TaWRlLmxhYmVsJywgXCJPcGVuIE1hdGNoIFRvIFNpZGVcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb25zdGFudHMuU2VhcmNoQ29udGV4dC5TZWFyY2hWaWV3VmlzaWJsZUtleSwgQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuRmlsZU1hdGNoT3JNYXRjaEZvY3VzS2V5KSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkVudGVyLFxuXHRcdFx0XHRtYWM6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuRW50ZXJcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3Qgc2VhcmNoVmlldyA9IGdldFNlYXJjaFZpZXcoYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpKTtcblx0XHRpZiAoc2VhcmNoVmlldykge1xuXHRcdFx0Y29uc3QgdHJlZTogV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZTxJU2VhcmNoUmVzdWx0LCBSZW5kZXJhYmxlTWF0Y2g+ID0gc2VhcmNoVmlldy5nZXRDb250cm9sKCk7XG5cdFx0XHRzZWFyY2hWaWV3Lm9wZW4oPEZpbGVNYXRjaE9yTWF0Y2g+dHJlZS5nZXRGb2N1cygpWzBdLCBmYWxzZSwgdHJ1ZSwgdHJ1ZSk7XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEFkZEN1cnNvcnNBdFNlYXJjaFJlc3VsdHNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLkFkZEN1cnNvcnNBdFNlYXJjaFJlc3VsdHMsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignQWRkQ3Vyc29yc0F0U2VhcmNoUmVzdWx0cy5sYWJlbCcsIFwiQWRkIEN1cnNvcnMgYXQgU2VhcmNoIFJlc3VsdHNcIiksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuU2VhcmNoVmlld1Zpc2libGVLZXksIENvbnN0YW50cy5TZWFyY2hDb250ZXh0LkZpbGVNYXRjaE9yTWF0Y2hGb2N1c0tleSksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlMLFxuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTxhbnk+IHtcblx0XHRjb25zdCBzZWFyY2hWaWV3ID0gZ2V0U2VhcmNoVmlldyhhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSkpO1xuXHRcdGlmIChzZWFyY2hWaWV3KSB7XG5cdFx0XHRjb25zdCB0cmVlOiBXb3JrYmVuY2hDb21wcmVzc2libGVBc3luY0RhdGFUcmVlPElTZWFyY2hSZXN1bHQsIFJlbmRlcmFibGVNYXRjaD4gPSBzZWFyY2hWaWV3LmdldENvbnRyb2woKTtcblx0XHRcdHNlYXJjaFZpZXcub3BlbkVkaXRvcldpdGhNdWx0aUN1cnNvcig8RmlsZU1hdGNoT3JNYXRjaD50cmVlLmdldEZvY3VzKClbMF0pO1xuXHRcdH1cblx0fVxufSk7XG5cbi8vI2VuZHJlZ2lvblxuLy8jcmVnaW9uIEFjdGlvbnM6IFRvZ2dsaW5nIEZvY3VzXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRm9jdXNOZXh0SW5wdXRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLkZvY3VzTmV4dElucHV0QWN0aW9uSWQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignRm9jdXNOZXh0SW5wdXRBY3Rpb24ubGFiZWwnLCBcIkZvY3VzIE5leHQgSW5wdXRcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmFuZChTZWFyY2hFZGl0b3JDb25zdGFudHMuSW5TZWFyY2hFZGl0b3IsIENvbnN0YW50cy5TZWFyY2hDb250ZXh0LklucHV0Qm94Rm9jdXNlZEtleSksXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlNlYXJjaFZpZXdWaXNpYmxlS2V5LCBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5JbnB1dEJveEZvY3VzZWRLZXkpKSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPGFueT4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGlucHV0ID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3I7XG5cdFx0aWYgKGlucHV0IGluc3RhbmNlb2YgU2VhcmNoRWRpdG9ySW5wdXQpIHtcblx0XHRcdC8vIGNhc3QgYXMgd2UgY2Fubm90IGltcG9ydCBTZWFyY2hFZGl0b3IgYXMgYSB2YWx1ZSBiL2MgY3ljbGljIGRlcGVuZGVuY3kuXG5cdFx0XHQoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lIGFzIFNlYXJjaEVkaXRvcikuZm9jdXNOZXh0SW5wdXQoKTtcblx0XHR9XG5cblx0XHRjb25zdCBzZWFyY2hWaWV3ID0gZ2V0U2VhcmNoVmlldyhhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSkpO1xuXHRcdHNlYXJjaFZpZXc/LmZvY3VzTmV4dElucHV0Qm94KCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRm9jdXNQcmV2aW91c0lucHV0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5Gb2N1c1ByZXZpb3VzSW5wdXRBY3Rpb25JZCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdGb2N1c1ByZXZpb3VzSW5wdXRBY3Rpb24ubGFiZWwnLCBcIkZvY3VzIFByZXZpb3VzIElucHV0XCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoU2VhcmNoRWRpdG9yQ29uc3RhbnRzLkluU2VhcmNoRWRpdG9yLCBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5JbnB1dEJveEZvY3VzZWRLZXkpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmFuZChDb25zdGFudHMuU2VhcmNoQ29udGV4dC5TZWFyY2hWaWV3VmlzaWJsZUtleSwgQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuSW5wdXRCb3hGb2N1c2VkS2V5LCBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5TZWFyY2hJbnB1dEJveEZvY3VzZWRLZXkudG9OZWdhdGVkKCkpKSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlVwQXJyb3csXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTxhbnk+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBpbnB1dCA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yO1xuXHRcdGlmIChpbnB1dCBpbnN0YW5jZW9mIFNlYXJjaEVkaXRvcklucHV0KSB7XG5cdFx0XHQvLyBjYXN0IGFzIHdlIGNhbm5vdCBpbXBvcnQgU2VhcmNoRWRpdG9yIGFzIGEgdmFsdWUgYi9jIGN5Y2xpYyBkZXBlbmRlbmN5LlxuXHRcdFx0KGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSBhcyBTZWFyY2hFZGl0b3IpLmZvY3VzUHJldklucHV0KCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VhcmNoVmlldyA9IGdldFNlYXJjaFZpZXcoYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpKTtcblx0XHRzZWFyY2hWaWV3Py5mb2N1c1ByZXZpb3VzSW5wdXRCb3goKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBGb2N1c1NlYXJjaEZyb21SZXN1bHRzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5Gb2N1c1NlYXJjaEZyb21SZXN1bHRzLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ0ZvY3VzU2VhcmNoRnJvbVJlc3VsdHMubGFiZWwnLCBcIkZvY3VzIFNlYXJjaCBGcm9tIFJlc3VsdHNcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb25zdGFudHMuU2VhcmNoQ29udGV4dC5TZWFyY2hWaWV3VmlzaWJsZUtleSwgQ29udGV4dEtleUV4cHIub3IoQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuRmlyc3RNYXRjaEZvY3VzS2V5LCBDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVEKSksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5VcEFycm93LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBzZWFyY2hWaWV3ID0gZ2V0U2VhcmNoVmlldyhhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSkpO1xuXHRcdHNlYXJjaFZpZXc/LmZvY3VzUHJldmlvdXNJbnB1dEJveCgpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFRvZ2dsZVNlYXJjaE9uVHlwZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBzZWFyY2hPblR5cGVLZXkgPSAnc2VhcmNoLnNlYXJjaE9uVHlwZSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5Ub2dnbGVTZWFyY2hPblR5cGVBY3Rpb25JZCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCd0b2dnbGVUYWJzJywgXCJUb2dnbGUgU2VhcmNoIG9uIFR5cGVcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHR9KTtcblxuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTxhbnk+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHNlYXJjaE9uVHlwZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFRvZ2dsZVNlYXJjaE9uVHlwZUFjdGlvbi5zZWFyY2hPblR5cGVLZXkpO1xuXHRcdHJldHVybiBjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShUb2dnbGVTZWFyY2hPblR5cGVBY3Rpb24uc2VhcmNoT25UeXBlS2V5LCAhc2VhcmNoT25UeXBlKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBGb2N1c1NlYXJjaExpc3RDb21tYW5kQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5Gb2N1c1NlYXJjaExpc3RDb21tYW5kSUQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignZm9jdXNTZWFyY2hMaXN0Q29tbWFuZExhYmVsJywgXCJGb2N1cyBMaXN0XCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTxhbnk+IHtcblx0XHRmb2N1c1NlYXJjaExpc3RDb21tYW5kKGFjY2Vzc29yKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBGb2N1c05leHRTZWFyY2hSZXN1bHRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLkZvY3VzTmV4dFNlYXJjaFJlc3VsdEFjdGlvbklkLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ0ZvY3VzTmV4dFNlYXJjaFJlc3VsdC5sYWJlbCcsIFwiRm9jdXMgTmV4dCBTZWFyY2ggUmVzdWx0XCIpLFxuXHRcdFx0a2V5YmluZGluZzogW3tcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5GNCxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHR9XSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLm9yKENvbnN0YW50cy5TZWFyY2hDb250ZXh0Lkhhc1NlYXJjaFJlc3VsdHMsIFNlYXJjaEVkaXRvckNvbnN0YW50cy5JblNlYXJjaEVkaXRvciksXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPGFueT4ge1xuXHRcdHJldHVybiBhd2FpdCBmb2N1c05leHRTZWFyY2hSZXN1bHQoYWNjZXNzb3IpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEZvY3VzUHJldmlvdXNTZWFyY2hSZXN1bHRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLkZvY3VzUHJldmlvdXNTZWFyY2hSZXN1bHRBY3Rpb25JZCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdGb2N1c1ByZXZpb3VzU2VhcmNoUmVzdWx0LmxhYmVsJywgXCJGb2N1cyBQcmV2aW91cyBTZWFyY2ggUmVzdWx0XCIpLFxuXHRcdFx0a2V5YmluZGluZzogW3tcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5GNCxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHR9XSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLm9yKENvbnN0YW50cy5TZWFyY2hDb250ZXh0Lkhhc1NlYXJjaFJlc3VsdHMsIFNlYXJjaEVkaXRvckNvbnN0YW50cy5JblNlYXJjaEVkaXRvciksXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPGFueT4ge1xuXHRcdHJldHVybiBhd2FpdCBmb2N1c1ByZXZpb3VzU2VhcmNoUmVzdWx0KGFjY2Vzc29yKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBSZXBsYWNlSW5GaWxlc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuUmVwbGFjZUluRmlsZXNBY3Rpb25JZCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdyZXBsYWNlSW5GaWxlcycsIFwiUmVwbGFjZSBpbiBGaWxlc1wiKSxcblx0XHRcdGtleWJpbmRpbmc6IFt7XG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlILFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdH1dLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLk1lbnViYXJFZGl0TWVudSxcblx0XHRcdFx0Z3JvdXA6ICc0X2ZpbmRfZ2xvYmFsJyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdHdoZW46IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPGFueT4ge1xuXHRcdHJldHVybiBhd2FpdCBmaW5kT3JSZXBsYWNlSW5GaWxlcyhhY2Nlc3NvciwgdHJ1ZSk7XG5cdH1cbn0pO1xuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIEhlbHBlcnNcbmZ1bmN0aW9uIHRvZ2dsZUNhc2VTZW5zaXRpdmVDb21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdGNvbnN0IHNlYXJjaFZpZXcgPSBnZXRTZWFyY2hWaWV3KGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKSk7XG5cdHNlYXJjaFZpZXc/LnRvZ2dsZUNhc2VTZW5zaXRpdmUoKTtcbn1cblxuZnVuY3Rpb24gdG9nZ2xlV2hvbGVXb3JkQ29tbWFuZChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRjb25zdCBzZWFyY2hWaWV3ID0gZ2V0U2VhcmNoVmlldyhhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSkpO1xuXHRzZWFyY2hWaWV3Py50b2dnbGVXaG9sZVdvcmRzKCk7XG59XG5cbmZ1bmN0aW9uIHRvZ2dsZVJlZ2V4Q29tbWFuZChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRjb25zdCBzZWFyY2hWaWV3ID0gZ2V0U2VhcmNoVmlldyhhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSkpO1xuXHRzZWFyY2hWaWV3Py50b2dnbGVSZWdleCgpO1xufVxuXG5mdW5jdGlvbiB0b2dnbGVQcmVzZXJ2ZUNhc2VDb21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdGNvbnN0IHNlYXJjaFZpZXcgPSBnZXRTZWFyY2hWaWV3KGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKSk7XG5cdHNlYXJjaFZpZXc/LnRvZ2dsZVByZXNlcnZlQ2FzZSgpO1xufVxuXG5jb25zdCBmb2N1c1NlYXJjaExpc3RDb21tYW5kOiBJQ29tbWFuZEhhbmRsZXIgPSBhY2Nlc3NvciA9PiB7XG5cdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0b3BlblNlYXJjaFZpZXcodmlld3NTZXJ2aWNlKS50aGVuKHNlYXJjaFZpZXcgPT4ge1xuXHRcdHNlYXJjaFZpZXc/Lm1vdmVGb2N1c1RvUmVzdWx0cygpO1xuXHR9KTtcbn07XG5cbmFzeW5jIGZ1bmN0aW9uIGZvY3VzTmV4dFNlYXJjaFJlc3VsdChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8YW55PiB7XG5cdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRjb25zdCBpbnB1dCA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yO1xuXHRpZiAoaW5wdXQgaW5zdGFuY2VvZiBTZWFyY2hFZGl0b3JJbnB1dCkge1xuXHRcdC8vIGNhc3QgYXMgd2UgY2Fubm90IGltcG9ydCBTZWFyY2hFZGl0b3IgYXMgYSB2YWx1ZSBiL2MgY3ljbGljIGRlcGVuZGVuY3kuXG5cdFx0cmV0dXJuIChlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUgYXMgU2VhcmNoRWRpdG9yKS5mb2N1c05leHRSZXN1bHQoKTtcblx0fVxuXG5cdHJldHVybiBvcGVuU2VhcmNoVmlldyhhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSkpLnRoZW4oc2VhcmNoVmlldyA9PiBzZWFyY2hWaWV3Py5zZWxlY3ROZXh0TWF0Y2goKSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGZvY3VzUHJldmlvdXNTZWFyY2hSZXN1bHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPGFueT4ge1xuXHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0Y29uc3QgaW5wdXQgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcjtcblx0aWYgKGlucHV0IGluc3RhbmNlb2YgU2VhcmNoRWRpdG9ySW5wdXQpIHtcblx0XHQvLyBjYXN0IGFzIHdlIGNhbm5vdCBpbXBvcnQgU2VhcmNoRWRpdG9yIGFzIGEgdmFsdWUgYi9jIGN5Y2xpYyBkZXBlbmRlbmN5LlxuXHRcdHJldHVybiAoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lIGFzIFNlYXJjaEVkaXRvcikuZm9jdXNQcmV2aW91c1Jlc3VsdCgpO1xuXHR9XG5cblx0cmV0dXJuIG9wZW5TZWFyY2hWaWV3KGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKSkudGhlbihzZWFyY2hWaWV3ID0+IHNlYXJjaFZpZXc/LnNlbGVjdFByZXZpb3VzTWF0Y2goKSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGZpbmRPclJlcGxhY2VJbkZpbGVzKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBleHBhbmRTZWFyY2hSZXBsYWNlV2lkZ2V0OiBib29sZWFuKTogUHJvbWlzZTxhbnk+IHtcblx0cmV0dXJuIG9wZW5TZWFyY2hWaWV3KGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKSwgZmFsc2UpLnRoZW4ob3BlbmVkVmlldyA9PiB7XG5cdFx0aWYgKG9wZW5lZFZpZXcpIHtcblx0XHRcdGNvbnN0IHNlYXJjaEFuZFJlcGxhY2VXaWRnZXQgPSBvcGVuZWRWaWV3LnNlYXJjaEFuZFJlcGxhY2VXaWRnZXQ7XG5cdFx0XHRzZWFyY2hBbmRSZXBsYWNlV2lkZ2V0LnRvZ2dsZVJlcGxhY2UoZXhwYW5kU2VhcmNoUmVwbGFjZVdpZGdldCk7XG5cblx0XHRcdGNvbnN0IHVwZGF0ZWRUZXh0ID0gb3BlbmVkVmlldy51cGRhdGVUZXh0RnJvbUZpbmRXaWRnZXRPclNlbGVjdGlvbih7IGFsbG93VW5zZWxlY3RlZFdvcmQ6ICFleHBhbmRTZWFyY2hSZXBsYWNlV2lkZ2V0IH0pO1xuXHRcdFx0b3BlbmVkVmlldy5zZWFyY2hBbmRSZXBsYWNlV2lkZ2V0LmZvY3VzKHVuZGVmaW5lZCwgdXBkYXRlZFRleHQsIHVwZGF0ZWRUZXh0KTtcblx0XHR9XG5cdH0pO1xufVxuLy8jZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiQUFBQTtBQUtBLFNBQVMsbUJBQW1CO0FBQzVCLFlBQVksU0FBUztBQUVyQixTQUFTLDZCQUE2QjtBQUd0QyxTQUFTLHFCQUFxQjtBQUM5QixZQUFZLGVBQWU7QUFDM0IsWUFBWSwyQkFBMkI7QUFFdkMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxnQkFBZ0IsMEJBQTBCO0FBQ25ELFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsU0FBUyxRQUFRLHVCQUF1QjtBQUNqRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLCtCQUErQiw4QkFBOEIsdUJBQXVCLGlDQUFpQztBQUM5SCxTQUFTLFVBQVUsZUFBZSxzQkFBc0I7QUFDeEQsU0FBUywwQ0FBMEM7QUFDbkQsU0FBUyx3QkFBd0I7QUFDakMs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
