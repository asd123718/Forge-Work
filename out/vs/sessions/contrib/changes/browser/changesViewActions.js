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
import { observableFromEvent } from "../../../../base/common/observable.js";
import { isEqual } from "../../../../base/common/resources.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { bindContextKey } from "../../../../platform/observable/common/platformObservableUtils.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { TOGGLE_DIFF_SIDE_BY_SIDE } from "../../../../workbench/browser/parts/editor/diffEditorCommands.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../workbench/common/contributions.js";
import { ActiveEditorContext, AuxiliaryBarVisibleContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext, MainEditorAreaVisibleContext, TextCompareEditorActiveContext } from "../../../../workbench/common/contextkeys.js";
import { DiffEditorInput } from "../../../../workbench/common/editor/diffEditorInput.js";
import { IEditorService } from "../../../../workbench/services/editor/common/editorService.js";
import { IViewsService } from "../../../../workbench/services/views/common/viewsService.js";
import { Menus } from "../../../browser/menus.js";
import { SessionHasChangesContext, SessionIsCreatedContext, SinglePaneDiffEditorInputActiveContext, SinglePaneLayoutEnabledContext } from "../../../common/contextkeys.js";
import { logChangesViewViewModeChange } from "../../../common/sessionsTelemetry.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { ActiveSessionContextKeys, CHANGES_VIEW_ID, ChangesContextKeys, ChangesViewMode, SESSIONS_CHANGES_OPEN_SINGLE_FILE_DIFF_SETTING } from "../common/changes.js";
import { IChangesViewService } from "../common/changesViewService.js";
import { CHANGES_HEADER_ACTIONS_ID } from "./changesView.js";
import { SessionChangesEditor } from "./sessionChangesEditor.js";
const openChangesViewActionOptions = {
  id: "workbench.action.agentSessions.openChangesView",
  title: localize2("openChangesView", "Changes"),
  icon: Codicon.diffMultiple,
  f1: false
};
class OpenChangesViewAction extends Action2 {
  constructor() {
    super(openChangesViewActionOptions);
  }
  async run(accessor) {
    const viewsService = accessor.get(IViewsService);
    await viewsService.openView(CHANGES_VIEW_ID, true);
  }
}
OpenChangesViewAction.ID = openChangesViewActionOptions.id;
registerAction2(OpenChangesViewAction);
let ChangesViewActionsContribution = class extends Disposable {
  constructor(contextKeyService, sessionsService, changesViewService, editorService) {
    super();
    this._register(bindContextKey(ActiveSessionContextKeys.HasChanges, contextKeyService, (reader) => {
      const activeSession = sessionsService.activeSession.read(reader);
      if (!activeSession) {
        return false;
      }
      const changes = activeSession.changes.read(reader);
      return changes.length > 0;
    }));
    this._register(bindContextKey(ChangesContextKeys.ViewMode, contextKeyService, (reader) => {
      return changesViewService.viewModeObs.read(reader);
    }));
    const activeEditor = observableFromEvent(this, editorService.onDidActiveEditorChange, () => editorService.activeEditor);
    this._register(bindContextKey(SinglePaneDiffEditorInputActiveContext, contextKeyService, (reader) => activeEditor.read(reader) instanceof DiffEditorInput));
  }
};
ChangesViewActionsContribution.ID = "workbench.contrib.changesViewActions";
ChangesViewActionsContribution = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, ISessionsService),
  __decorateParam(2, IChangesViewService),
  __decorateParam(3, IEditorService)
], ChangesViewActionsContribution);
registerWorkbenchContribution2(ChangesViewActionsContribution.ID, ChangesViewActionsContribution, WorkbenchPhase.AfterRestored);
const _OpenPullRequestAction = class _OpenPullRequestAction extends Action2 {
  constructor() {
    super({
      id: _OpenPullRequestAction.ID,
      title: localize2("openPullRequest", "Open Pull Request"),
      icon: Codicon.gitPullRequest,
      f1: false,
      menu: {
        id: MenuId.AgentsChangesToolbar,
        group: "navigation",
        order: 9,
        when: ContextKeyExpr.and(
          IsSessionsWindowContext,
          ActiveSessionContextKeys.HasPullRequest
        )
      }
    });
  }
  async run(accessor) {
    const openerService = accessor.get(IOpenerService);
    const sessionsService = accessor.get(ISessionsService);
    const activeSession = sessionsService.activeSession.get();
    if (!activeSession) {
      return;
    }
    const gitHubInfo = activeSession.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get();
    if (!gitHubInfo?.pullRequest?.uri) {
      return;
    }
    await openerService.open(gitHubInfo.pullRequest.uri);
  }
};
_OpenPullRequestAction.ID = "workbench.action.agentSessions.openPullRequest";
let OpenPullRequestAction = _OpenPullRequestAction;
registerAction2(OpenPullRequestAction);
const singlePaneChangesEditorActive = ContextKeyExpr.and(
  IsSessionsWindowContext,
  ActiveEditorContext.isEqualTo(SessionChangesEditor.ID),
  SinglePaneLayoutEnabledContext
);
const singlePaneFileDiffEditorActive = ContextKeyExpr.and(
  IsSessionsWindowContext,
  SinglePaneDiffEditorInputActiveContext,
  SinglePaneLayoutEnabledContext
);
const singlePaneTextDiffEditorActive = ContextKeyExpr.and(
  IsSessionsWindowContext,
  TextCompareEditorActiveContext,
  SinglePaneLayoutEnabledContext
);
const singlePaneChangesEditorTitle = ContextKeyExpr.and(
  singlePaneChangesEditorActive,
  IsAuxiliaryWindowContext.toNegated(),
  IsTopRightEditorGroupContext
);
const singlePaneChangesEditorTitleVisible = ContextKeyExpr.and(
  singlePaneChangesEditorTitle,
  MainEditorAreaVisibleContext
);
const singlePaneDiffEditorTitle = ContextKeyExpr.and(
  ContextKeyExpr.or(singlePaneChangesEditorActive, singlePaneFileDiffEditorActive),
  IsAuxiliaryWindowContext.toNegated(),
  IsTopRightEditorGroupContext
);
const singlePaneTextDiffEditorTitle = ContextKeyExpr.and(
  singlePaneTextDiffEditorActive,
  IsAuxiliaryWindowContext.toNegated(),
  IsTopRightEditorGroupContext
);
const singlePaneDiffEditorTitleVisible = ContextKeyExpr.and(
  ContextKeyExpr.or(singlePaneChangesEditorTitle, singlePaneTextDiffEditorTitle),
  MainEditorAreaVisibleContext
);
class ChangesHeaderActionsAction extends Action2 {
  constructor() {
    super({
      id: CHANGES_HEADER_ACTIONS_ID,
      title: localize2("changesView.headerActions", "Changes Actions"),
      f1: false,
      menu: {
        id: Menus.TitleBarSessionMenu,
        group: "navigation",
        order: 5,
        when: ContextKeyExpr.and(
          IsSessionsWindowContext,
          IsAuxiliaryWindowContext.toNegated(),
          SinglePaneLayoutEnabledContext,
          SessionIsCreatedContext,
          SessionHasChangesContext
        )
      }
    });
  }
  async run() {
  }
}
registerAction2(ChangesHeaderActionsAction);
const _SetChangesListViewModeAction = class _SetChangesListViewModeAction extends Action2 {
  constructor() {
    super({
      id: _SetChangesListViewModeAction.ID,
      title: localize2("agentSessions.setChangesListViewMode", "View as List"),
      icon: Codicon.listFlat,
      f1: false,
      menu: {
        // Always in the overflow ("…") of the right header, whether the editor
        // area is visible or collapsed (as long as the changes list is shown).
        id: Menus.SessionsEditorHeaderSecondary,
        group: "secondary/2_viewMode",
        order: 20,
        when: ContextKeyExpr.and(
          singlePaneDiffEditorTitle,
          AuxiliaryBarVisibleContext,
          ChangesContextKeys.ViewMode.isEqualTo(ChangesViewMode.Tree)
        )
      }
    });
  }
  run(accessor) {
    logChangesViewViewModeChange(accessor.get(ITelemetryService), ChangesViewMode.List);
    accessor.get(IChangesViewService).setViewMode(ChangesViewMode.List);
  }
};
_SetChangesListViewModeAction.ID = "workbench.action.agentSessions.setChangesListViewMode";
let SetChangesListViewModeAction = _SetChangesListViewModeAction;
registerAction2(SetChangesListViewModeAction);
const _SetChangesTreeViewModeAction = class _SetChangesTreeViewModeAction extends Action2 {
  constructor() {
    super({
      id: _SetChangesTreeViewModeAction.ID,
      title: localize2("agentSessions.setChangesTreeViewMode", "View as Tree"),
      icon: Codicon.listTree,
      f1: false,
      menu: {
        // Always in the overflow ("…") of the right header, whether the editor
        // area is visible or collapsed (as long as the changes list is shown).
        id: Menus.SessionsEditorHeaderSecondary,
        group: "secondary/2_viewMode",
        order: 20,
        when: ContextKeyExpr.and(
          singlePaneDiffEditorTitle,
          AuxiliaryBarVisibleContext,
          ChangesContextKeys.ViewMode.isEqualTo(ChangesViewMode.List)
        )
      }
    });
  }
  run(accessor) {
    logChangesViewViewModeChange(accessor.get(ITelemetryService), ChangesViewMode.Tree);
    accessor.get(IChangesViewService).setViewMode(ChangesViewMode.Tree);
  }
};
_SetChangesTreeViewModeAction.ID = "workbench.action.agentSessions.setChangesTreeViewMode";
let SetChangesTreeViewModeAction = _SetChangesTreeViewModeAction;
registerAction2(SetChangesTreeViewModeAction);
const _CollapseAllSessionChangesDiffsAction = class _CollapseAllSessionChangesDiffsAction extends Action2 {
  constructor() {
    super({
      id: _CollapseAllSessionChangesDiffsAction.ID,
      title: localize2("agentSessions.collapseAllDiffs", "Collapse All Diffs"),
      icon: Codicon.collapseAll,
      f1: false,
      menu: {
        id: Menus.SessionsEditorHeaderSecondary,
        group: "1_diff",
        order: 10,
        when: ContextKeyExpr.and(
          singlePaneChangesEditorTitleVisible,
          ContextKeyExpr.not("multiDiffEditorAllCollapsed")
        )
      }
    });
  }
  run(accessor) {
    const activeEditorPane = accessor.get(IEditorService).activeEditorPane;
    if (activeEditorPane instanceof SessionChangesEditor) {
      activeEditorPane.collapseAllDiffs();
    }
  }
};
_CollapseAllSessionChangesDiffsAction.ID = "workbench.action.agentSessions.collapseAllDiffs";
let CollapseAllSessionChangesDiffsAction = _CollapseAllSessionChangesDiffsAction;
registerAction2(CollapseAllSessionChangesDiffsAction);
const _ExpandAllSessionChangesDiffsAction = class _ExpandAllSessionChangesDiffsAction extends Action2 {
  constructor() {
    super({
      id: _ExpandAllSessionChangesDiffsAction.ID,
      title: localize2("agentSessions.expandAllDiffs", "Expand All Diffs"),
      icon: Codicon.expandAll,
      f1: false,
      menu: {
        id: Menus.SessionsEditorHeaderSecondary,
        group: "1_diff",
        order: 10,
        when: ContextKeyExpr.and(
          singlePaneChangesEditorActive,
          IsAuxiliaryWindowContext.toNegated(),
          IsTopRightEditorGroupContext,
          MainEditorAreaVisibleContext,
          ContextKeyExpr.has("multiDiffEditorAllCollapsed")
        )
      }
    });
  }
  run(accessor) {
    const activeEditorPane = accessor.get(IEditorService).activeEditorPane;
    if (activeEditorPane instanceof SessionChangesEditor) {
      activeEditorPane.expandAllDiffs();
    }
  }
};
_ExpandAllSessionChangesDiffsAction.ID = "workbench.action.agentSessions.expandAllDiffs";
let ExpandAllSessionChangesDiffsAction = _ExpandAllSessionChangesDiffsAction;
registerAction2(ExpandAllSessionChangesDiffsAction);
MenuRegistry.appendMenuItem(Menus.SessionsEditorHeaderSecondary, {
  command: {
    id: TOGGLE_DIFF_SIDE_BY_SIDE,
    title: localize("showSideBySideDiff", "Show Side by Side Diff"),
    icon: Codicon.diffSidebyside,
    toggled: {
      condition: ContextKeyExpr.or(
        ContextKeyExpr.and(singlePaneChangesEditorActive, EditorContextKeys.multiDiffEditorRenderSideBySide),
        ContextKeyExpr.and(singlePaneFileDiffEditorActive, EditorContextKeys.diffEditorInlineMode.negate())
      ),
      title: localize("showInlineDiff", "Show Inline Diff")
    }
  },
  group: "1_diff",
  order: 20,
  when: singlePaneDiffEditorTitleVisible
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: TOGGLE_DIFF_SIDE_BY_SIDE,
    title: localize2("toggleDiffView", "Toggle Diff View"),
    category: localize2("changes", "Changes")
  },
  when: singlePaneDiffEditorTitleVisible
});
const _OpenChangesAction = class _OpenChangesAction extends Action2 {
  constructor() {
    super({
      id: _OpenChangesAction.ID,
      title: localize2("openChanges", "Open Changes"),
      icon: Codicon.gitCompare,
      f1: false
    });
  }
  async run(accessor, _sessionResource, _ref, ...resources) {
    const editorService = accessor.get(IEditorService);
    const changesViewService = accessor.get(IChangesViewService);
    const sessionChanges = changesViewService.activeSessionChangesObs.get();
    const changes = sessionChanges?.filter(
      (change) => resources.some((resource) => isEqual(change.modifiedUri ?? change.originalUri, resource))
    ) ?? [];
    await Promise.all(changes.map((change) => editorService.openEditor({
      original: { resource: change.originalUri },
      modified: { resource: change.modifiedUri }
    })));
  }
};
_OpenChangesAction.ID = "workbench.action.agentSessions.openChanges";
let OpenChangesAction = _OpenChangesAction;
registerAction2(OpenChangesAction);
const openSingleFileDiffEnabled = ContextKeyExpr.equals(`config.${SESSIONS_CHANGES_OPEN_SINGLE_FILE_DIFF_SETTING}`, true);
const _OpenFileAction = class _OpenFileAction extends Action2 {
  constructor() {
    super({
      id: _OpenFileAction.ID,
      title: localize2("openFile", "Open File"),
      icon: Codicon.goToFile,
      f1: false,
      menu: [
        // When opening a file already shows a single file diff, the "Open
        // Changes" alt action is redundant and is therefore omitted.
        {
          id: MenuId.AgentsChangeInlineToolbar,
          group: "navigation",
          order: 1,
          when: ContextKeyExpr.and(
            IsSessionsWindowContext,
            ChangesContextKeys.ChangeKind.isEqualTo("file"),
            openSingleFileDiffEnabled
          )
        },
        // Default behavior: the alt action ("Open Changes") opens a diff
        // editor for the selected change(s).
        {
          id: MenuId.AgentsChangeInlineToolbar,
          group: "navigation",
          order: 1,
          alt: {
            id: OpenChangesAction.ID,
            title: localize2("openChanges", "Open Changes"),
            icon: Codicon.gitCompare
          },
          when: ContextKeyExpr.and(
            IsSessionsWindowContext,
            ChangesContextKeys.ChangeKind.isEqualTo("file"),
            openSingleFileDiffEnabled.negate()
          )
        }
      ]
    });
  }
  async run(accessor, _sessionResource, _ref, ...resources) {
    const editorService = accessor.get(IEditorService);
    await Promise.all(resources.map((resource) => editorService.openEditor({ resource })));
  }
};
_OpenFileAction.ID = "workbench.action.agentSessions.openFile";
let OpenFileAction = _OpenFileAction;
registerAction2(OpenFileAction);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhbmdlc1xcYnJvd3NlclxcY2hhbmdlc1ZpZXdBY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZUZyb21FdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgSUFjdGlvbjJPcHRpb25zLCBNZW51SWQsIE1lbnVSZWdpc3RyeSwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IGJpbmRDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb2JzZXJ2YWJsZS9jb21tb24vcGxhdGZvcm1PYnNlcnZhYmxlVXRpbHMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBUT0dHTEVfRElGRl9TSURFX0JZX1NJREUgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZGlmZkVkaXRvckNvbW1hbmRzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgQWN0aXZlRWRpdG9yQ29udGV4dCwgQXV4aWxpYXJ5QmFyVmlzaWJsZUNvbnRleHQsIElzQXV4aWxpYXJ5V2luZG93Q29udGV4dCwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsIElzVG9wUmlnaHRFZGl0b3JHcm91cENvbnRleHQsIE1haW5FZGl0b3JBcmVhVmlzaWJsZUNvbnRleHQsIFRleHRDb21wYXJlRWRpdG9yQWN0aXZlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9lZGl0b3IvZGlmZkVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWVudXMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL21lbnVzLmpzJztcbmltcG9ydCB7IFNlc3Npb25IYXNDaGFuZ2VzQ29udGV4dCwgU2Vzc2lvbklzQ3JlYXRlZENvbnRleHQsIFNpbmdsZVBhbmVEaWZmRWRpdG9ySW5wdXRBY3RpdmVDb250ZXh0LCBTaW5nbGVQYW5lTGF5b3V0RW5hYmxlZENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgbG9nQ2hhbmdlc1ZpZXdWaWV3TW9kZUNoYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXNzaW9uc1RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWN0aXZlU2Vzc2lvbkNvbnRleHRLZXlzLCBDSEFOR0VTX1ZJRVdfSUQsIENoYW5nZXNDb250ZXh0S2V5cywgQ2hhbmdlc1ZpZXdNb2RlLCBTRVNTSU9OU19DSEFOR0VTX09QRU5fU0lOR0xFX0ZJTEVfRElGRl9TRVRUSU5HIH0gZnJvbSAnLi4vY29tbW9uL2NoYW5nZXMuanMnO1xuaW1wb3J0IHsgSUNoYW5nZXNWaWV3U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9jaGFuZ2VzVmlld1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ0hBTkdFU19IRUFERVJfQUNUSU9OU19JRCB9IGZyb20gJy4vY2hhbmdlc1ZpZXcuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkNoYW5nZXNFZGl0b3IgfSBmcm9tICcuL3Nlc3Npb25DaGFuZ2VzRWRpdG9yLmpzJztcblxuY29uc3Qgb3BlbkNoYW5nZXNWaWV3QWN0aW9uT3B0aW9uczogSUFjdGlvbjJPcHRpb25zID0ge1xuXHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uYWdlbnRTZXNzaW9ucy5vcGVuQ2hhbmdlc1ZpZXcnLFxuXHR0aXRsZTogbG9jYWxpemUyKCdvcGVuQ2hhbmdlc1ZpZXcnLCBcIkNoYW5nZXNcIiksXG5cdGljb246IENvZGljb24uZGlmZk11bHRpcGxlLFxuXHRmMTogZmFsc2UsXG59O1xuXG5jbGFzcyBPcGVuQ2hhbmdlc1ZpZXdBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSBvcGVuQ2hhbmdlc1ZpZXdBY3Rpb25PcHRpb25zLmlkO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKG9wZW5DaGFuZ2VzVmlld0FjdGlvbk9wdGlvbnMpO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRcdGF3YWl0IHZpZXdzU2VydmljZS5vcGVuVmlldyhDSEFOR0VTX1ZJRVdfSUQsIHRydWUpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihPcGVuQ2hhbmdlc1ZpZXdBY3Rpb24pO1xuXG5jbGFzcyBDaGFuZ2VzVmlld0FjdGlvbnNDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmNoYW5nZXNWaWV3QWN0aW9ucyc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNTZXJ2aWNlIHNlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSxcblx0XHRASUNoYW5nZXNWaWV3U2VydmljZSBjaGFuZ2VzVmlld1NlcnZpY2U6IElDaGFuZ2VzVmlld1NlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gQmluZCBjb250ZXh0IGtleTogdHJ1ZSB3aGVuIHRoZSBhY3RpdmUgc2Vzc2lvbiBoYXMgY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5KEFjdGl2ZVNlc3Npb25Db250ZXh0S2V5cy5IYXNDaGFuZ2VzLCBjb250ZXh0S2V5U2VydmljZSwgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSBzZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWFjdGl2ZVNlc3Npb24pIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY2hhbmdlcyA9IGFjdGl2ZVNlc3Npb24uY2hhbmdlcy5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gY2hhbmdlcy5sZW5ndGggPiAwO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5KENoYW5nZXNDb250ZXh0S2V5cy5WaWV3TW9kZSwgY29udGV4dEtleVNlcnZpY2UsIHJlYWRlciA9PiB7XG5cdFx0XHRyZXR1cm4gY2hhbmdlc1ZpZXdTZXJ2aWNlLnZpZXdNb2RlT2JzLnJlYWQocmVhZGVyKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsIGVkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UsICgpID0+IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yKTtcblx0XHR0aGlzLl9yZWdpc3RlcihiaW5kQ29udGV4dEtleShTaW5nbGVQYW5lRGlmZkVkaXRvcklucHV0QWN0aXZlQ29udGV4dCwgY29udGV4dEtleVNlcnZpY2UsIHJlYWRlciA9PiBhY3RpdmVFZGl0b3IucmVhZChyZWFkZXIpIGluc3RhbmNlb2YgRGlmZkVkaXRvcklucHV0KSk7XG5cdH1cbn1cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENoYW5nZXNWaWV3QWN0aW9uc0NvbnRyaWJ1dGlvbi5JRCwgQ2hhbmdlc1ZpZXdBY3Rpb25zQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcblxuY2xhc3MgT3BlblB1bGxSZXF1ZXN0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmFnZW50U2Vzc2lvbnMub3BlblB1bGxSZXF1ZXN0JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogT3BlblB1bGxSZXF1ZXN0QWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3BlblB1bGxSZXF1ZXN0JywgXCJPcGVuIFB1bGwgUmVxdWVzdFwiKSxcblx0XHRcdGljb246IENvZGljb24uZ2l0UHVsbFJlcXVlc3QsXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQWdlbnRzQ2hhbmdlc1Rvb2xiYXIsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiA5LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0SXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsXG5cdFx0XHRcdFx0QWN0aXZlU2Vzc2lvbkNvbnRleHRLZXlzLkhhc1B1bGxSZXF1ZXN0KVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgb3BlbmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJT3BlbmVyU2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSBzZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoIWFjdGl2ZVNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBnaXRIdWJJbmZvID0gYWN0aXZlU2Vzc2lvbi53b3Jrc3BhY2UuZ2V0KCk/LmZvbGRlcnNbMF0/LmdpdFJlcG9zaXRvcnk/LmdpdEh1YkluZm8uZ2V0KCk7XG5cdFx0aWYgKCFnaXRIdWJJbmZvPy5wdWxsUmVxdWVzdD8udXJpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgb3BlbmVyU2VydmljZS5vcGVuKGdpdEh1YkluZm8ucHVsbFJlcXVlc3QudXJpKTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoT3BlblB1bGxSZXF1ZXN0QWN0aW9uKTtcblxuY29uc3Qgc2luZ2xlUGFuZUNoYW5nZXNFZGl0b3JBY3RpdmUgPSBDb250ZXh0S2V5RXhwci5hbmQoXG5cdElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LFxuXHRBY3RpdmVFZGl0b3JDb250ZXh0LmlzRXF1YWxUbyhTZXNzaW9uQ2hhbmdlc0VkaXRvci5JRCksXG5cdFNpbmdsZVBhbmVMYXlvdXRFbmFibGVkQ29udGV4dFxuKTtcblxuY29uc3Qgc2luZ2xlUGFuZUZpbGVEaWZmRWRpdG9yQWN0aXZlID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRJc1Nlc3Npb25zV2luZG93Q29udGV4dCxcblx0U2luZ2xlUGFuZURpZmZFZGl0b3JJbnB1dEFjdGl2ZUNvbnRleHQsXG5cdFNpbmdsZVBhbmVMYXlvdXRFbmFibGVkQ29udGV4dFxuKTtcblxuY29uc3Qgc2luZ2xlUGFuZVRleHREaWZmRWRpdG9yQWN0aXZlID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRJc1Nlc3Npb25zV2luZG93Q29udGV4dCxcblx0VGV4dENvbXBhcmVFZGl0b3JBY3RpdmVDb250ZXh0LFxuXHRTaW5nbGVQYW5lTGF5b3V0RW5hYmxlZENvbnRleHRcbik7XG5cbi8vIFRpdGxlLWJhciAodGFiLXJvdykgZ2F0ZSB0aGF0IGRvZXMgTk9UIHJlcXVpcmUgdGhlIGVkaXRvciBjb250ZW50IGFyZWEgdG8gYmVcbi8vIHZpc2libGUsIHNvIHNlc3Npb24tbGV2ZWwgdGl0bGUgYWN0aW9ucyAoZS5nLiBDcmVhdGUgUHVsbCBSZXF1ZXN0KSBzdGF5IGF2YWlsYWJsZVxuLy8gd2hlbiB0aGUgZWRpdG9yIGFyZWEgaXMgY2xvc2VkIGJ1dCB0aGUgZG9ja2VkIHRhYiBiYXIgaXMgc3RpbGwgc2hvd24uXG5jb25zdCBzaW5nbGVQYW5lQ2hhbmdlc0VkaXRvclRpdGxlID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRzaW5nbGVQYW5lQ2hhbmdlc0VkaXRvckFjdGl2ZSxcblx0SXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LnRvTmVnYXRlZCgpLFxuXHRJc1RvcFJpZ2h0RWRpdG9yR3JvdXBDb250ZXh0XG4pO1xuXG5jb25zdCBzaW5nbGVQYW5lQ2hhbmdlc0VkaXRvclRpdGxlVmlzaWJsZSA9IENvbnRleHRLZXlFeHByLmFuZChcblx0c2luZ2xlUGFuZUNoYW5nZXNFZGl0b3JUaXRsZSxcblx0TWFpbkVkaXRvckFyZWFWaXNpYmxlQ29udGV4dFxuKTtcblxuY29uc3Qgc2luZ2xlUGFuZURpZmZFZGl0b3JUaXRsZSA9IENvbnRleHRLZXlFeHByLmFuZChcblx0Q29udGV4dEtleUV4cHIub3Ioc2luZ2xlUGFuZUNoYW5nZXNFZGl0b3JBY3RpdmUsIHNpbmdsZVBhbmVGaWxlRGlmZkVkaXRvckFjdGl2ZSksXG5cdElzQXV4aWxpYXJ5V2luZG93Q29udGV4dC50b05lZ2F0ZWQoKSxcblx0SXNUb3BSaWdodEVkaXRvckdyb3VwQ29udGV4dFxuKTtcblxuY29uc3Qgc2luZ2xlUGFuZVRleHREaWZmRWRpdG9yVGl0bGUgPSBDb250ZXh0S2V5RXhwci5hbmQoXG5cdHNpbmdsZVBhbmVUZXh0RGlmZkVkaXRvckFjdGl2ZSxcblx0SXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LnRvTmVnYXRlZCgpLFxuXHRJc1RvcFJpZ2h0RWRpdG9yR3JvdXBDb250ZXh0XG4pO1xuXG5jb25zdCBzaW5nbGVQYW5lRGlmZkVkaXRvclRpdGxlVmlzaWJsZSA9IENvbnRleHRLZXlFeHByLmFuZChcblx0Q29udGV4dEtleUV4cHIub3Ioc2luZ2xlUGFuZUNoYW5nZXNFZGl0b3JUaXRsZSwgc2luZ2xlUGFuZVRleHREaWZmRWRpdG9yVGl0bGUpLFxuXHRNYWluRWRpdG9yQXJlYVZpc2libGVDb250ZXh0XG4pO1xuXG4vKiogQW5jaG9yIGFjdGlvbiBob3N0aW5nIHRoZSBDcmVhdGUgUHVsbCBSZXF1ZXN0IGJ1dHRvbiBiYXIgaW4gdGhlIHRpdGxlIGJhci4gKi9cbmNsYXNzIENoYW5nZXNIZWFkZXJBY3Rpb25zQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDSEFOR0VTX0hFQURFUl9BQ1RJT05TX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhbmdlc1ZpZXcuaGVhZGVyQWN0aW9ucycsIFwiQ2hhbmdlcyBBY3Rpb25zXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudXMuVGl0bGVCYXJTZXNzaW9uTWVudSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRJc1Nlc3Npb25zV2luZG93Q29udGV4dCxcblx0XHRcdFx0XHRJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQudG9OZWdhdGVkKCksXG5cdFx0XHRcdFx0U2luZ2xlUGFuZUxheW91dEVuYWJsZWRDb250ZXh0LFxuXHRcdFx0XHRcdFNlc3Npb25Jc0NyZWF0ZWRDb250ZXh0LFxuXHRcdFx0XHRcdFNlc3Npb25IYXNDaGFuZ2VzQ29udGV4dFxuXHRcdFx0XHQpXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHsgfVxufVxuXG5yZWdpc3RlckFjdGlvbjIoQ2hhbmdlc0hlYWRlckFjdGlvbnNBY3Rpb24pO1xuXG5cbmNsYXNzIFNldENoYW5nZXNMaXN0Vmlld01vZGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uYWdlbnRTZXNzaW9ucy5zZXRDaGFuZ2VzTGlzdFZpZXdNb2RlJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU2V0Q2hhbmdlc0xpc3RWaWV3TW9kZUFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2FnZW50U2Vzc2lvbnMuc2V0Q2hhbmdlc0xpc3RWaWV3TW9kZScsIFwiVmlldyBhcyBMaXN0XCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5saXN0RmxhdCxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0Ly8gQWx3YXlzIGluIHRoZSBvdmVyZmxvdyAoXCJcdTIwMjZcIikgb2YgdGhlIHJpZ2h0IGhlYWRlciwgd2hldGhlciB0aGUgZWRpdG9yXG5cdFx0XHRcdC8vIGFyZWEgaXMgdmlzaWJsZSBvciBjb2xsYXBzZWQgKGFzIGxvbmcgYXMgdGhlIGNoYW5nZXMgbGlzdCBpcyBzaG93bikuXG5cdFx0XHRcdGlkOiBNZW51cy5TZXNzaW9uc0VkaXRvckhlYWRlclNlY29uZGFyeSxcblx0XHRcdFx0Z3JvdXA6ICdzZWNvbmRhcnkvMl92aWV3TW9kZScsXG5cdFx0XHRcdG9yZGVyOiAyMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdHNpbmdsZVBhbmVEaWZmRWRpdG9yVGl0bGUsXG5cdFx0XHRcdFx0QXV4aWxpYXJ5QmFyVmlzaWJsZUNvbnRleHQsXG5cdFx0XHRcdFx0Q2hhbmdlc0NvbnRleHRLZXlzLlZpZXdNb2RlLmlzRXF1YWxUbyhDaGFuZ2VzVmlld01vZGUuVHJlZSkpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRsb2dDaGFuZ2VzVmlld1ZpZXdNb2RlQ2hhbmdlKGFjY2Vzc29yLmdldChJVGVsZW1ldHJ5U2VydmljZSksIENoYW5nZXNWaWV3TW9kZS5MaXN0KTtcblx0XHRhY2Nlc3Nvci5nZXQoSUNoYW5nZXNWaWV3U2VydmljZSkuc2V0Vmlld01vZGUoQ2hhbmdlc1ZpZXdNb2RlLkxpc3QpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihTZXRDaGFuZ2VzTGlzdFZpZXdNb2RlQWN0aW9uKTtcblxuY2xhc3MgU2V0Q2hhbmdlc1RyZWVWaWV3TW9kZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5hZ2VudFNlc3Npb25zLnNldENoYW5nZXNUcmVlVmlld01vZGUnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTZXRDaGFuZ2VzVHJlZVZpZXdNb2RlQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWdlbnRTZXNzaW9ucy5zZXRDaGFuZ2VzVHJlZVZpZXdNb2RlJywgXCJWaWV3IGFzIFRyZWVcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmxpc3RUcmVlLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHQvLyBBbHdheXMgaW4gdGhlIG92ZXJmbG93IChcIlx1MjAyNlwiKSBvZiB0aGUgcmlnaHQgaGVhZGVyLCB3aGV0aGVyIHRoZSBlZGl0b3Jcblx0XHRcdFx0Ly8gYXJlYSBpcyB2aXNpYmxlIG9yIGNvbGxhcHNlZCAoYXMgbG9uZyBhcyB0aGUgY2hhbmdlcyBsaXN0IGlzIHNob3duKS5cblx0XHRcdFx0aWQ6IE1lbnVzLlNlc3Npb25zRWRpdG9ySGVhZGVyU2Vjb25kYXJ5LFxuXHRcdFx0XHRncm91cDogJ3NlY29uZGFyeS8yX3ZpZXdNb2RlJyxcblx0XHRcdFx0b3JkZXI6IDIwLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0c2luZ2xlUGFuZURpZmZFZGl0b3JUaXRsZSxcblx0XHRcdFx0XHRBdXhpbGlhcnlCYXJWaXNpYmxlQ29udGV4dCxcblx0XHRcdFx0XHRDaGFuZ2VzQ29udGV4dEtleXMuVmlld01vZGUuaXNFcXVhbFRvKENoYW5nZXNWaWV3TW9kZS5MaXN0KSlcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGxvZ0NoYW5nZXNWaWV3Vmlld01vZGVDaGFuZ2UoYWNjZXNzb3IuZ2V0KElUZWxlbWV0cnlTZXJ2aWNlKSwgQ2hhbmdlc1ZpZXdNb2RlLlRyZWUpO1xuXHRcdGFjY2Vzc29yLmdldChJQ2hhbmdlc1ZpZXdTZXJ2aWNlKS5zZXRWaWV3TW9kZShDaGFuZ2VzVmlld01vZGUuVHJlZSk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKFNldENoYW5nZXNUcmVlVmlld01vZGVBY3Rpb24pO1xuXG5jbGFzcyBDb2xsYXBzZUFsbFNlc3Npb25DaGFuZ2VzRGlmZnNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uYWdlbnRTZXNzaW9ucy5jb2xsYXBzZUFsbERpZmZzJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29sbGFwc2VBbGxTZXNzaW9uQ2hhbmdlc0RpZmZzQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWdlbnRTZXNzaW9ucy5jb2xsYXBzZUFsbERpZmZzJywgXCJDb2xsYXBzZSBBbGwgRGlmZnNcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmNvbGxhcHNlQWxsLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudXMuU2Vzc2lvbnNFZGl0b3JIZWFkZXJTZWNvbmRhcnksXG5cdFx0XHRcdGdyb3VwOiAnMV9kaWZmJyxcblx0XHRcdFx0b3JkZXI6IDEwLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0c2luZ2xlUGFuZUNoYW5nZXNFZGl0b3JUaXRsZVZpc2libGUsXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIubm90KCdtdWx0aURpZmZFZGl0b3JBbGxDb2xsYXBzZWQnKSlcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvclBhbmUgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0aWYgKGFjdGl2ZUVkaXRvclBhbmUgaW5zdGFuY2VvZiBTZXNzaW9uQ2hhbmdlc0VkaXRvcikge1xuXHRcdFx0YWN0aXZlRWRpdG9yUGFuZS5jb2xsYXBzZUFsbERpZmZzKCk7XG5cdFx0fVxuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihDb2xsYXBzZUFsbFNlc3Npb25DaGFuZ2VzRGlmZnNBY3Rpb24pO1xuXG5jbGFzcyBFeHBhbmRBbGxTZXNzaW9uQ2hhbmdlc0RpZmZzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmFnZW50U2Vzc2lvbnMuZXhwYW5kQWxsRGlmZnMnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBFeHBhbmRBbGxTZXNzaW9uQ2hhbmdlc0RpZmZzQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWdlbnRTZXNzaW9ucy5leHBhbmRBbGxEaWZmcycsIFwiRXhwYW5kIEFsbCBEaWZmc1wiKSxcblx0XHRcdGljb246IENvZGljb24uZXhwYW5kQWxsLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudXMuU2Vzc2lvbnNFZGl0b3JIZWFkZXJTZWNvbmRhcnksXG5cdFx0XHRcdGdyb3VwOiAnMV9kaWZmJyxcblx0XHRcdFx0b3JkZXI6IDEwLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0c2luZ2xlUGFuZUNoYW5nZXNFZGl0b3JBY3RpdmUsXG5cdFx0XHRcdFx0SXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRcdElzVG9wUmlnaHRFZGl0b3JHcm91cENvbnRleHQsXG5cdFx0XHRcdFx0TWFpbkVkaXRvckFyZWFWaXNpYmxlQ29udGV4dCxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5oYXMoJ211bHRpRGlmZkVkaXRvckFsbENvbGxhcHNlZCcpKVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yUGFuZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRpZiAoYWN0aXZlRWRpdG9yUGFuZSBpbnN0YW5jZW9mIFNlc3Npb25DaGFuZ2VzRWRpdG9yKSB7XG5cdFx0XHRhY3RpdmVFZGl0b3JQYW5lLmV4cGFuZEFsbERpZmZzKCk7XG5cdFx0fVxuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihFeHBhbmRBbGxTZXNzaW9uQ2hhbmdlc0RpZmZzQWN0aW9uKTtcblxuLy8gVGhlIEFnZW50cyB3aW5kb3cgcmV1c2VzIHRoZSB3b3JrYmVuY2ggYHRvZ2dsZS5kaWZmLnJlbmRlclNpZGVCeVNpZGVgIGNvbW1hbmQgc28gYVxuLy8gdXNlcidzIGtleWJpbmRpbmcgZm9yIGl0IGNhcnJpZXMgb3ZlciBoZXJlIChpc3N1ZSAjMzI0NzY1KS4gVGhlIHNlc3Npb25zIG92ZXJyaWRlIG9mXG4vLyBJRGlmZkVkaXRvckNvbW1hbmRzU2VydmljZSBmbGlwcyB0aGUgd29ya3NwYWNlIGBkaWZmRWRpdG9yLnJlbmRlclNpZGVCeVNpZGVgIHNldHRpbmcsXG4vLyB3aGljaCB0aGUgQ2hhbmdlcyBlZGl0b3Igb2JzZXJ2ZXMuXG5cbi8vIFByaW1hcnkgaGVhZGVyIGJ1dHRvbiB3aXRoIHN0YXRlLXNwZWNpZmljIHRpdGxlczogXCJTaG93IFNpZGUgYnkgU2lkZSBEaWZmXCIgd2hlblxuLy8gY3VycmVudGx5IGlubGluZSwgYW5kIChjaGVja2VkKSBcIlNob3cgSW5saW5lIERpZmZcIiB3aGVuIGN1cnJlbnRseSBzaWRlIGJ5IHNpZGUuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudXMuU2Vzc2lvbnNFZGl0b3JIZWFkZXJTZWNvbmRhcnksIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBUT0dHTEVfRElGRl9TSURFX0JZX1NJREUsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdzaG93U2lkZUJ5U2lkZURpZmYnLCBcIlNob3cgU2lkZSBieSBTaWRlIERpZmZcIiksXG5cdFx0aWNvbjogQ29kaWNvbi5kaWZmU2lkZWJ5c2lkZSxcblx0XHR0b2dnbGVkOiB7XG5cdFx0XHRjb25kaXRpb246IENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoc2luZ2xlUGFuZUNoYW5nZXNFZGl0b3JBY3RpdmUsIEVkaXRvckNvbnRleHRLZXlzLm11bHRpRGlmZkVkaXRvclJlbmRlclNpZGVCeVNpZGUpLFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoc2luZ2xlUGFuZUZpbGVEaWZmRWRpdG9yQWN0aXZlLCBFZGl0b3JDb250ZXh0S2V5cy5kaWZmRWRpdG9ySW5saW5lTW9kZS5uZWdhdGUoKSlcblx0XHRcdCkhLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzaG93SW5saW5lRGlmZicsIFwiU2hvdyBJbmxpbmUgRGlmZlwiKSxcblx0XHR9LFxuXHR9LFxuXHRncm91cDogJzFfZGlmZicsXG5cdG9yZGVyOiAyMCxcblx0d2hlbjogc2luZ2xlUGFuZURpZmZFZGl0b3JUaXRsZVZpc2libGVcbn0pO1xuXG4vLyBEaXNjb3ZlcmFibGUgaW4gdGhlIGNvbW1hbmQgcGFsZXR0ZSB3aGlsZSBhIENoYW5nZXMgZGlmZiBlZGl0b3IgaXMgdmlzaWJsZS5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBUT0dHTEVfRElGRl9TSURFX0JZX1NJREUsXG5cdFx0dGl0bGU6IGxvY2FsaXplMigndG9nZ2xlRGlmZlZpZXcnLCBcIlRvZ2dsZSBEaWZmIFZpZXdcIiksXG5cdFx0Y2F0ZWdvcnk6IGxvY2FsaXplMignY2hhbmdlcycsIFwiQ2hhbmdlc1wiKSxcblx0fSxcblx0d2hlbjogc2luZ2xlUGFuZURpZmZFZGl0b3JUaXRsZVZpc2libGVcbn0pO1xuXG5jbGFzcyBPcGVuQ2hhbmdlc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5hZ2VudFNlc3Npb25zLm9wZW5DaGFuZ2VzJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogT3BlbkNoYW5nZXNBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdvcGVuQ2hhbmdlcycsIFwiT3BlbiBDaGFuZ2VzXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5naXRDb21wYXJlLFxuXHRcdFx0ZjE6IGZhbHNlXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIF9zZXNzaW9uUmVzb3VyY2U6IFVSSSwgX3JlZjogc3RyaW5nLCAuLi5yZXNvdXJjZXM6IFVSSVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgY2hhbmdlc1ZpZXdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGFuZ2VzVmlld1NlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbkNoYW5nZXMgPSBjaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvbkNoYW5nZXNPYnMuZ2V0KCk7XG5cblx0XHRjb25zdCBjaGFuZ2VzID0gc2Vzc2lvbkNoYW5nZXM/LmZpbHRlcihjaGFuZ2UgPT5cblx0XHRcdHJlc291cmNlcy5zb21lKHJlc291cmNlID0+IGlzRXF1YWwoY2hhbmdlLm1vZGlmaWVkVXJpID8/IGNoYW5nZS5vcmlnaW5hbFVyaSwgcmVzb3VyY2UpKVxuXHRcdCkgPz8gW107XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChjaGFuZ2VzLm1hcChjaGFuZ2UgPT4gZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBjaGFuZ2Uub3JpZ2luYWxVcmkgfSxcblx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBjaGFuZ2UubW9kaWZpZWRVcmkgfVxuXHRcdH0pKSk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKE9wZW5DaGFuZ2VzQWN0aW9uKTtcblxuY29uc3Qgb3BlblNpbmdsZUZpbGVEaWZmRW5hYmxlZCA9IENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7U0VTU0lPTlNfQ0hBTkdFU19PUEVOX1NJTkdMRV9GSUxFX0RJRkZfU0VUVElOR31gLCB0cnVlKTtcblxuY2xhc3MgT3BlbkZpbGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uYWdlbnRTZXNzaW9ucy5vcGVuRmlsZSc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5GaWxlQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3BlbkZpbGUnLCBcIk9wZW4gRmlsZVwiKSxcblx0XHRcdGljb246IENvZGljb24uZ29Ub0ZpbGUsXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdC8vIFdoZW4gb3BlbmluZyBhIGZpbGUgYWxyZWFkeSBzaG93cyBhIHNpbmdsZSBmaWxlIGRpZmYsIHRoZSBcIk9wZW5cblx0XHRcdFx0Ly8gQ2hhbmdlc1wiIGFsdCBhY3Rpb24gaXMgcmVkdW5kYW50IGFuZCBpcyB0aGVyZWZvcmUgb21pdHRlZC5cblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuQWdlbnRzQ2hhbmdlSW5saW5lVG9vbGJhcixcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LFxuXHRcdFx0XHRcdFx0Q2hhbmdlc0NvbnRleHRLZXlzLkNoYW5nZUtpbmQuaXNFcXVhbFRvKCdmaWxlJyksXG5cdFx0XHRcdFx0XHRvcGVuU2luZ2xlRmlsZURpZmZFbmFibGVkKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQvLyBEZWZhdWx0IGJlaGF2aW9yOiB0aGUgYWx0IGFjdGlvbiAoXCJPcGVuIENoYW5nZXNcIikgb3BlbnMgYSBkaWZmXG5cdFx0XHRcdC8vIGVkaXRvciBmb3IgdGhlIHNlbGVjdGVkIGNoYW5nZShzKS5cblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuQWdlbnRzQ2hhbmdlSW5saW5lVG9vbGJhcixcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHRcdGFsdDoge1xuXHRcdFx0XHRcdFx0aWQ6IE9wZW5DaGFuZ2VzQWN0aW9uLklELFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3BlbkNoYW5nZXMnLCBcIk9wZW4gQ2hhbmdlc1wiKSxcblx0XHRcdFx0XHRcdGljb246IENvZGljb24uZ2l0Q29tcGFyZSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LFxuXHRcdFx0XHRcdFx0Q2hhbmdlc0NvbnRleHRLZXlzLkNoYW5nZUtpbmQuaXNFcXVhbFRvKCdmaWxlJyksXG5cdFx0XHRcdFx0XHRvcGVuU2luZ2xlRmlsZURpZmZFbmFibGVkLm5lZ2F0ZSgpKVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIF9zZXNzaW9uUmVzb3VyY2U6IFVSSSwgX3JlZjogc3RyaW5nLCAuLi5yZXNvdXJjZXM6IFVSSVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwocmVzb3VyY2VzLm1hcChyZXNvdXJjZSA9PiBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZSB9KSkpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihPcGVuRmlsZUFjdGlvbik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGVBQWU7QUFFeEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLFNBQTBCLFFBQVEsY0FBYyx1QkFBdUI7QUFDaEYsU0FBUyxnQkFBZ0IsMEJBQTBCO0FBRW5ELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQWlDLGdDQUFnQyxzQkFBc0I7QUFDdkYsU0FBUyxxQkFBcUIsNEJBQTRCLDBCQUEwQix5QkFBeUIsOEJBQThCLDhCQUE4QixzQ0FBc0M7QUFDL00sU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsMEJBQTBCLHlCQUF5Qix3Q0FBd0Msc0NBQXNDO0FBQzFJLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMEJBQTBCLGlCQUFpQixvQkFBb0IsaUJBQWlCLHNEQUFzRDtBQUMvSSxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLDRCQUE0QjtBQUVyQyxNQUFNLCtCQUFnRDtBQUFBLEVBQ3JELElBQUk7QUFBQSxFQUNKLE9BQU8sVUFBVSxtQkFBbUIsU0FBUztBQUFBLEVBQzdDLE1BQU0sUUFB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
