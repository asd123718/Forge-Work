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
import "../../../../workbench/contrib/styleOverrides/browser/media/tabs.css";
import "./media/editorBreadcrumbs.css";
import "./media/editorHeader.css";
import "../../../../workbench/services/themes/browser/modernTabColorCustomizations.js";
import "./diffEditor.sessions.contribution.js";
import { NewBrowserTabAction, NewChangesTabAction, NewFileTabAction, NewSearchTabAction } from "./addTabActions.js";
import { localize2 } from "../../../../nls.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { Action2, isIMenuItem, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ActiveEditorContext, EditorPartModalContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext, MainEditorAreaVisibleContext } from "../../../../workbench/common/contextkeys.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../workbench/common/contributions.js";
import { Menus } from "../../../browser/menus.js";
import { IAgentWorkbenchLayoutService } from "../../../browser/workbench.js";
import { CustomViewVisibleContext, EditorMaximizedContext, SinglePaneLayoutEnabledContext } from "../../../common/contextkeys.js";
import { IViewsService } from "../../../../workbench/services/views/common/viewsService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IEditorGroupsService } from "../../../../workbench/services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../../workbench/services/editor/common/editorService.js";
import { IListService } from "../../../../platform/list/browser/listService.js";
import { EditorResourceAccessor, SideBySideEditor } from "../../../../workbench/common/editor.js";
import { resolveCommandsContext } from "../../../../workbench/browser/parts/editor/editorCommandsContext.js";
import { MultiDiffEditorInput } from "../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput.js";
import { CHANGES_VIEW_ID } from "../../changes/common/changes.js";
import { prepareMoveCopyEditors } from "../../../../workbench/browser/parts/editor/editor.js";
import { Parts } from "../../../../workbench/services/layout/browser/layoutService.js";
import { MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID } from "../../../../workbench/browser/parts/editor/editorCommands.js";
import { TERMINAL_VIEW_ID } from "../../../../workbench/contrib/terminal/common/terminal.js";
import { TEXT_FILE_EDITOR_ID } from "../../../../workbench/contrib/files/common/files.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { ISessionsPartService } from "../../../services/sessions/browser/sessionsPartService.js";
import { SessionsCategories } from "../../../common/categories.js";
import { IChangesViewService } from "../../changes/common/changesViewService.js";
const terminalPanelHiddenForMaximizedEditor = /* @__PURE__ */ new WeakSet();
const singlePaneDetailPanel = SinglePaneLayoutEnabledContext;
const notSinglePaneDetailPanel = singlePaneDetailPanel.negate();
const editorTitleActionsWhen = ContextKeyExpr.and(
  IsSessionsWindowContext,
  IsAuxiliaryWindowContext.toNegated(),
  IsTopRightEditorGroupContext
);
const singlePaneLayoutMaximizeOrder = 10;
const singlePaneLayoutHideEditorOrder = 20;
const singlePaneMaximizeKeybindingWhen = ContextKeyExpr.and(
  IsSessionsWindowContext,
  IsAuxiliaryWindowContext.toNegated(),
  singlePaneDetailPanel,
  MainEditorAreaVisibleContext
);
let SinglePaneAddTabContribution = class extends Disposable {
  constructor(layoutService) {
    super();
    if (!layoutService.isSinglePaneLayoutEnabled) {
      return;
    }
    this._register(registerAction2(NewFileTabAction));
    this._register(registerAction2(NewBrowserTabAction));
    this._register(registerAction2(NewSearchTabAction));
    this._register(registerAction2(NewChangesTabAction));
  }
};
SinglePaneAddTabContribution.ID = "workbench.contrib.sessions.singlePaneAddTab";
SinglePaneAddTabContribution = __decorateClass([
  __decorateParam(0, IAgentWorkbenchLayoutService)
], SinglePaneAddTabContribution);
registerWorkbenchContribution2(SinglePaneAddTabContribution.ID, SinglePaneAddTabContribution, WorkbenchPhase.BlockStartup);
const _MaximizeMainEditorPartAction = class _MaximizeMainEditorPartAction extends Action2 {
  constructor() {
    super({
      id: _MaximizeMainEditorPartAction.ID,
      title: localize2("maximizeMainEditorPart", "Maximize Editor Area"),
      icon: Codicon.screenFull,
      f1: false,
      keybinding: {
        weight: KeybindingWeight.SessionsContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyE,
        when: ContextKeyExpr.and(singlePaneMaximizeKeybindingWhen, EditorMaximizedContext.negate())
      },
      menu: [
        {
          id: MenuId.EditorTitleLayout,
          group: "navigation",
          order: singlePaneLayoutMaximizeOrder,
          when: ContextKeyExpr.and(editorTitleActionsWhen, EditorMaximizedContext.negate(), singlePaneDetailPanel, MainEditorAreaVisibleContext)
        },
        {
          id: MenuId.EditorTitleLayout,
          group: "navigation",
          order: 99,
          when: ContextKeyExpr.and(editorTitleActionsWhen, EditorMaximizedContext.negate(), notSinglePaneDetailPanel)
        }
      ]
    });
  }
  async run(accessor) {
    const layoutService = accessor.get(IAgentWorkbenchLayoutService);
    const viewsService = accessor.get(IViewsService);
    let hidTerminalPanel = false;
    if (layoutService.isVisible(Parts.PANEL_PART) && viewsService.isViewVisible(TERMINAL_VIEW_ID)) {
      layoutService.setPartHidden(true, Parts.PANEL_PART);
      hidTerminalPanel = true;
    }
    if (hidTerminalPanel) {
      terminalPanelHiddenForMaximizedEditor.add(layoutService);
    } else {
      terminalPanelHiddenForMaximizedEditor.delete(layoutService);
    }
    layoutService.setEditorMaximized(true);
  }
};
_MaximizeMainEditorPartAction.ID = "workbench.action.agentSessions.maximizeMainEditorPart";
let MaximizeMainEditorPartAction = _MaximizeMainEditorPartAction;
registerAction2(MaximizeMainEditorPartAction);
const _RestoreMainEditorPartAction = class _RestoreMainEditorPartAction extends Action2 {
  constructor() {
    super({
      id: _RestoreMainEditorPartAction.ID,
      title: localize2("restoreMainEditorPart", "Restore Editor Area"),
      icon: Codicon.screenNormal,
      f1: false,
      toggled: EditorMaximizedContext,
      keybinding: {
        weight: KeybindingWeight.SessionsContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyE,
        when: ContextKeyExpr.and(singlePaneMaximizeKeybindingWhen, EditorMaximizedContext)
      },
      menu: [
        {
          id: MenuId.EditorTitleLayout,
          group: "navigation",
          order: singlePaneLayoutMaximizeOrder,
          when: ContextKeyExpr.and(editorTitleActionsWhen, EditorMaximizedContext, singlePaneDetailPanel, MainEditorAreaVisibleContext)
        },
        {
          id: MenuId.EditorTitleLayout,
          group: "navigation",
          order: 99,
          when: ContextKeyExpr.and(editorTitleActionsWhen, EditorMaximizedContext, notSinglePaneDetailPanel)
        }
      ]
    });
  }
  async run(accessor) {
    const layoutService = accessor.get(IAgentWorkbenchLayoutService);
    const shouldRestoreTerminalPanel = terminalPanelHiddenForMaximizedEditor.has(layoutService);
    layoutService.setEditorMaximized(false);
    if (shouldRestoreTerminalPanel && !layoutService.isVisible(Parts.PANEL_PART)) {
      layoutService.setPartHidden(false, Parts.PANEL_PART);
    }
    terminalPanelHiddenForMaximizedEditor.delete(layoutService);
  }
};
_RestoreMainEditorPartAction.ID = "workbench.action.agentSessions.restoreMainEditorPart";
let RestoreMainEditorPartAction = _RestoreMainEditorPartAction;
registerAction2(RestoreMainEditorPartAction);
const _HideMainEditorPartAction = class _HideMainEditorPartAction extends Action2 {
  constructor() {
    super({
      id: _HideMainEditorPartAction.ID,
      title: localize2("hideMainEditorPart", "Hide Editor"),
      icon: Codicon.rightPanelHide,
      f1: false,
      menu: {
        id: MenuId.EditorTitleLayout,
        group: "navigation",
        order: singlePaneLayoutHideEditorOrder,
        when: ContextKeyExpr.false()
      }
    });
  }
  run(accessor) {
    const layoutService = accessor.get(IAgentWorkbenchLayoutService);
    layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
    layoutService.setPartHidden(true, Parts.EDITOR_PART);
    layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
  }
};
_HideMainEditorPartAction.ID = "workbench.action.agentSessions.hideMainEditorPart";
let HideMainEditorPartAction = _HideMainEditorPartAction;
registerAction2(HideMainEditorPartAction);
const _ShowMainEditorPartAction = class _ShowMainEditorPartAction extends Action2 {
  constructor() {
    super({
      id: _ShowMainEditorPartAction.ID,
      title: localize2("showMainEditorPart", "Show Editor"),
      icon: Codicon.rightPanelShow,
      f1: false,
      menu: {
        id: MenuId.EditorTitleLayout,
        group: "navigation",
        order: singlePaneLayoutHideEditorOrder,
        when: ContextKeyExpr.false()
      }
    });
  }
  run(accessor) {
    const layoutService = accessor.get(IAgentWorkbenchLayoutService);
    const editorGroupsService = accessor.get(IEditorGroupsService);
    layoutService.revealEditorPartExplicitly();
    editorGroupsService.activeGroup.focus();
  }
};
_ShowMainEditorPartAction.ID = "workbench.action.agentSessions.showMainEditorPart";
let ShowMainEditorPartAction = _ShowMainEditorPartAction;
registerAction2(ShowMainEditorPartAction);
const _CloseMainEditorPartAction = class _CloseMainEditorPartAction extends Action2 {
  constructor() {
    super({
      id: _CloseMainEditorPartAction.ID,
      title: localize2("closeMainEditorPart", "Close Editor Area"),
      icon: Codicon.close,
      f1: false,
      menu: {
        id: MenuId.EditorTitleLayout,
        group: "navigation",
        order: 100,
        when: ContextKeyExpr.and(
          IsSessionsWindowContext,
          IsAuxiliaryWindowContext.toNegated(),
          IsTopRightEditorGroupContext,
          notSinglePaneDetailPanel
        )
      }
    });
  }
  async run(accessor) {
    const commandService = accessor.get(ICommandService);
    await commandService.executeCommand("workbench.action.closeAllGroups");
  }
};
_CloseMainEditorPartAction.ID = "workbench.action.agentSessions.closeMainEditorPart";
let CloseMainEditorPartAction = _CloseMainEditorPartAction;
registerAction2(CloseMainEditorPartAction);
const _OpenEditorInModalEditorAction = class _OpenEditorInModalEditorAction extends Action2 {
  constructor() {
    super({
      id: _OpenEditorInModalEditorAction.ID,
      title: localize2("openEditorInModal", "Open in Modal Editor"),
      icon: Codicon.openInWindow,
      f1: false,
      menu: {
        id: MenuId.EditorTitleLayout,
        group: "navigation",
        order: 1,
        when: ContextKeyExpr.and(
          IsSessionsWindowContext,
          IsAuxiliaryWindowContext.toNegated(),
          notSinglePaneDetailPanel
        )
      }
    });
  }
  async run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const layoutService = accessor.get(IAgentWorkbenchLayoutService);
    const configurationService = accessor.get(IConfigurationService);
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const isMaximized = layoutService.isEditorMaximized();
    await configurationService.updateValue("workbench.editor.useModal", "all");
    const activeGroup = editorGroupsService.mainPart.activeGroup;
    const multiFileDiffEditor = activeGroup.editors.find((editor) => editor instanceof MultiDiffEditorInput);
    if (multiFileDiffEditor) {
      const view = viewsService.getViewWithId(CHANGES_VIEW_ID);
      await view?.openChanges();
      await activeGroup.closeEditor(multiFileDiffEditor);
    }
    const modalPart = await editorGroupsService.createModalEditorPart();
    const editorsToMove = prepareMoveCopyEditors(activeGroup, activeGroup.editors.slice(), true);
    activeGroup.moveEditors(editorsToMove, modalPart.activeGroup);
    if (isMaximized && !modalPart.maximized) {
      modalPart.toggleMaximized();
    }
    modalPart.activeGroup.focus();
  }
};
_OpenEditorInModalEditorAction.ID = "workbench.action.agentSessions.openEditorInModal";
let OpenEditorInModalEditorAction = _OpenEditorInModalEditorAction;
registerAction2(OpenEditorInModalEditorAction);
const _OpenModalEditorInEditorAction = class _OpenModalEditorInEditorAction extends Action2 {
  constructor() {
    super({
      id: _OpenModalEditorInEditorAction.ID,
      title: localize2("openModalEditorInEditor", "Open in Editor Area"),
      icon: Codicon.openInWindow,
      f1: false,
      // The editor area is not rendered while a custom view replaces the sessions grid.
      precondition: CustomViewVisibleContext.negate(),
      menu: {
        id: MenuId.ModalEditorTitle,
        group: "navigation",
        order: 98,
        when: ContextKeyExpr.and(
          IsSessionsWindowContext,
          EditorPartModalContext
        )
      }
    });
  }
  async run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const commandService = accessor.get(ICommandService);
    const configurationService = accessor.get(IConfigurationService);
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const layoutService = accessor.get(IAgentWorkbenchLayoutService);
    const changesViewService = accessor.get(IChangesViewService);
    const activeEditorPart = editorGroupsService.activeModalEditorPart;
    const activeGroup = activeEditorPart?.activeGroup;
    if (!activeEditorPart || !activeGroup) {
      return;
    }
    const isMaximized = activeEditorPart.maximized;
    await configurationService.updateValue("workbench.editor.useModal", "some");
    layoutService.setPartHidden(false, Parts.EDITOR_PART);
    const navigation = activeGroup.activeEditorPane?.options?.modal?.navigation;
    if (navigation) {
      const view = viewsService.getViewWithId(CHANGES_VIEW_ID);
      const changes = changesViewService.activeSessionChangesObs.get();
      if (changes && navigation.current < changes.length) {
        await view?.openChanges(changes[navigation.current].modifiedUri ?? changes[navigation.current].originalUri);
        await activeGroup.closeEditor(activeGroup.editors[0]);
      }
    }
    await commandService.executeCommand(MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID);
    if (isMaximized) {
      layoutService.setEditorMaximized(true);
    }
    editorGroupsService.activeGroup.focus();
  }
};
_OpenModalEditorInEditorAction.ID = "workbench.action.agentSessions.openModalEditorInEditor";
let OpenModalEditorInEditorAction = _OpenModalEditorInEditorAction;
registerAction2(OpenModalEditorInEditorAction);
const _AddFileAsContextAction = class _AddFileAsContextAction extends Action2 {
  constructor() {
    const precondition = ContextKeyExpr.and(
      IsSessionsWindowContext,
      IsAuxiliaryWindowContext.toNegated(),
      ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID)
    );
    super({
      id: _AddFileAsContextAction.ID,
      title: localize2("addFileAsContext", "Add File as Context"),
      category: SessionsCategories.Sessions,
      icon: Codicon.attach,
      f1: true,
      precondition,
      menu: [{
        id: Menus.SessionsEditorHeaderSecondary,
        group: "navigation",
        order: 1e5,
        when: ContextKeyExpr.and(precondition, singlePaneDetailPanel)
      }, {
        id: MenuId.EditorTitle,
        group: "navigation",
        order: 1e5,
        // towards the far right, mirroring Split Editor Right in the regular window
        when: ContextKeyExpr.and(precondition, notSinglePaneDetailPanel)
      }]
    });
  }
  run(accessor, ...args) {
    const editorService = accessor.get(IEditorService);
    const sessionsService = accessor.get(ISessionsService);
    const sessionsPartService = accessor.get(ISessionsPartService);
    const resolvedContext = resolveCommandsContext(args, editorService, accessor.get(IEditorGroupsService), accessor.get(IListService));
    const resources = resolvedContext.groupedEditors.flatMap((groupedEditor) => groupedEditor.editors).map((editor) => EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY })).filter((uri) => uri !== void 0 && [Schemas.file, Schemas.vscodeRemote, Schemas.untitled].includes(uri.scheme));
    if (resources.length === 0) {
      return;
    }
    const sessionId = sessionsService.activeSession.get()?.sessionId;
    sessionsPartService.getSessionView(sessionId)?.attach(resources);
  }
};
_AddFileAsContextAction.ID = "workbench.action.agentSessions.addFileAsContext";
let AddFileAsContextAction = _AddFileAsContextAction;
registerAction2(AddFileAsContextAction);
let EditorTitleMenuBridgeContribution = class extends Disposable {
  constructor(layoutService) {
    super();
    this._mirrored = this._register(new DisposableStore());
    if (!layoutService.isSinglePaneLayoutEnabled) {
      return;
    }
    this._sync();
    this._register(MenuRegistry.onDidChangeMenu((e) => {
      if (e.has(MenuId.EditorTitle)) {
        this._sync();
      }
    }));
  }
  _sync() {
    this._mirrored.clear();
    for (const item of MenuRegistry.getMenuItems(MenuId.EditorTitle)) {
      const isExtensionItem = isIMenuItem(item) ? !!item.command.source : item.submenu.id.startsWith(EditorTitleMenuBridgeContribution._extensionSubmenuPrefix);
      if (isExtensionItem) {
        const group = item.group === "navigation" ? "extension/navigation" : `secondary/extension/${item.group ?? "other"}`;
        this._mirrored.add(MenuRegistry.appendMenuItem(Menus.SessionsEditorHeaderSecondary, { ...item, group }));
      }
    }
  }
};
EditorTitleMenuBridgeContribution.ID = "workbench.contrib.sessions.editorTitleMenuBridge";
// Extension submenus are registered with a `MenuId.for('api:<id>')` id (see the
// `submenus` extension point), which distinguishes them from core submenus.
EditorTitleMenuBridgeContribution._extensionSubmenuPrefix = "api:";
EditorTitleMenuBridgeContribution = __decorateClass([
  __decorateParam(0, IAgentWorkbenchLayoutService)
], EditorTitleMenuBridgeContribution);
registerWorkbenchContribution2(EditorTitleMenuBridgeContribution.ID, EditorTitleMenuBridgeContribution, WorkbenchPhase.BlockStartup);
export {
  EditorTitleMenuBridgeContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcZWRpdG9yXFxicm93c2VyXFxlZGl0b3IuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9zdHlsZU92ZXJyaWRlcy9icm93c2VyL21lZGlhL3RhYnMuY3NzJztcbmltcG9ydCAnLi9tZWRpYS9lZGl0b3JCcmVhZGNydW1icy5jc3MnO1xuaW1wb3J0ICcuL21lZGlhL2VkaXRvckhlYWRlci5jc3MnO1xuaW1wb3J0ICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvdGhlbWVzL2Jyb3dzZXIvbW9kZXJuVGFiQ29sb3JDdXN0b21pemF0aW9ucy5qcyc7XG5pbXBvcnQgJy4vZGlmZkVkaXRvci5zZXNzaW9ucy5jb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgTmV3QnJvd3NlclRhYkFjdGlvbiwgTmV3Q2hhbmdlc1RhYkFjdGlvbiwgTmV3RmlsZVRhYkFjdGlvbiwgTmV3U2VhcmNoVGFiQWN0aW9uIH0gZnJvbSAnLi9hZGRUYWJBY3Rpb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBpc0lNZW51SXRlbSwgTWVudUlkLCBNZW51UmVnaXN0cnksIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBBY3RpdmVFZGl0b3JDb250ZXh0LCBFZGl0b3JQYXJ0TW9kYWxDb250ZXh0LCBJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQsIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LCBJc1RvcFJpZ2h0RWRpdG9yR3JvdXBDb250ZXh0LCBNYWluRWRpdG9yQXJlYVZpc2libGVDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIsIFdvcmtiZW5jaFBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IE1lbnVzIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9tZW51cy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci93b3JrYmVuY2guanMnO1xuaW1wb3J0IHsgQ3VzdG9tVmlld1Zpc2libGVDb250ZXh0LCBFZGl0b3JNYXhpbWl6ZWRDb250ZXh0LCBTaW5nbGVQYW5lTGF5b3V0RW5hYmxlZENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciwgU2lkZUJ5U2lkZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IHJlc29sdmVDb21tYW5kc0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yQ29tbWFuZHNDb250ZXh0LmpzJztcbmltcG9ydCB7IE11bHRpRGlmZkVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvbXVsdGlEaWZmRWRpdG9yL2Jyb3dzZXIvbXVsdGlEaWZmRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgQ0hBTkdFU19WSUVXX0lEIH0gZnJvbSAnLi4vLi4vY2hhbmdlcy9jb21tb24vY2hhbmdlcy5qcyc7XG5pbXBvcnQgeyBDaGFuZ2VzVmlld1BhbmUgfSBmcm9tICcuLi8uLi9jaGFuZ2VzL2Jyb3dzZXIvY2hhbmdlc1ZpZXcuanMnO1xuaW1wb3J0IHsgcHJlcGFyZU1vdmVDb3B5RWRpdG9ycyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3IuanMnO1xuaW1wb3J0IHsgUGFydHMgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBNT1ZFX01PREFMX0VESVRPUl9UT19NQUlOX0NPTU1BTkRfSUQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgVEVSTUlOQUxfVklFV19JRCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBURVhUX0ZJTEVfRURJVE9SX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQYXJ0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQYXJ0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uc0NhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBJQ2hhbmdlc1ZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhbmdlcy9jb21tb24vY2hhbmdlc1ZpZXdTZXJ2aWNlLmpzJztcblxuY29uc3QgdGVybWluYWxQYW5lbEhpZGRlbkZvck1heGltaXplZEVkaXRvciA9IG5ldyBXZWFrU2V0PElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2U+KCk7XG5cbi8vIFRoZSBwb3Atb3V0LXRvLW1vZGFsIGFuZCBjbG9zZS1lZGl0b3ItYXJlYSBidXR0b25zIGRvIG5vdCBhcHBseSB0byB0aGUgc2luZ2xlLXBhbmVcbi8vIHJlZGVzaWduLCBzbyB0aGV5IGFyZSBoaWRkZW4gd2hlbiBzaW5nbGUtcGFuZSBpcyBlbmFibGVkIChvcmlnaW5hbCBsYXlvdXQga2VlcHMgdGhlbSkuXG5jb25zdCBzaW5nbGVQYW5lRGV0YWlsUGFuZWwgPSBTaW5nbGVQYW5lTGF5b3V0RW5hYmxlZENvbnRleHQ7XG5jb25zdCBub3RTaW5nbGVQYW5lRGV0YWlsUGFuZWwgPSBzaW5nbGVQYW5lRGV0YWlsUGFuZWwubmVnYXRlKCk7XG5cbmNvbnN0IGVkaXRvclRpdGxlQWN0aW9uc1doZW4gPSBDb250ZXh0S2V5RXhwci5hbmQoXG5cdElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LFxuXHRJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQudG9OZWdhdGVkKCksXG5cdElzVG9wUmlnaHRFZGl0b3JHcm91cENvbnRleHQpO1xuLy8gTWF4aW1pemUvcmVzdG9yZSByZW5kZXJzIGZpcnN0IGluIHRoZSBlZGl0b3ItdGl0bGUgbGF5b3V0IGNsdXN0ZXIuXG4vLyBIaWRlL1Nob3cgRWRpdG9yIHJlbWFpbiByZWdpc3RlcmVkIGJ1dCBhcmUgaGlkZGVuIGZyb20gdGhlIG1lbnUuXG5jb25zdCBzaW5nbGVQYW5lTGF5b3V0TWF4aW1pemVPcmRlciA9IDEwO1xuY29uc3Qgc2luZ2xlUGFuZUxheW91dEhpZGVFZGl0b3JPcmRlciA9IDIwO1xuXG4vLyBLZXliaW5kaW5nIHNjb3BlIGZvciB0aGUgc2luZ2xlLXBhbmUgbWF4aW1pemUvcmVzdG9yZSB0b2dnbGU6IGFjdGl2ZSBpbiB0aGVcbi8vIG1haW4gc2Vzc2lvbnMgd2luZG93IHdoZW5ldmVyIHRoZSBzaW5nbGUtcGFuZSBsYXlvdXQgaXMgb24gYW5kIHRoZSBlZGl0b3Jcbi8vIGFyZWEgaXMgdmlzaWJsZS4gRGVsaWJlcmF0ZWx5IGRvZXMgbm90IHJlcXVpcmUgdGhlIGVkaXRvciBncm91cCB0byBiZSBmb2N1c2VkXG4vLyBzbyB0aGUgdG9nZ2xlIHdvcmtzIHdoaWxlIHR5cGluZyBpbiB0aGUgY2hhdC5cbmNvbnN0IHNpbmdsZVBhbmVNYXhpbWl6ZUtleWJpbmRpbmdXaGVuID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRJc1Nlc3Npb25zV2luZG93Q29udGV4dCxcblx0SXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LnRvTmVnYXRlZCgpLFxuXHRzaW5nbGVQYW5lRGV0YWlsUGFuZWwsXG5cdE1haW5FZGl0b3JBcmVhVmlzaWJsZUNvbnRleHQpO1xuXG5jbGFzcyBTaW5nbGVQYW5lQWRkVGFiQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5zZXNzaW9ucy5zaW5nbGVQYW5lQWRkVGFiJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSBsYXlvdXRTZXJ2aWNlOiBJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0aWYgKCFsYXlvdXRTZXJ2aWNlLmlzU2luZ2xlUGFuZUxheW91dEVuYWJsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoTmV3RmlsZVRhYkFjdGlvbikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihOZXdCcm93c2VyVGFiQWN0aW9uKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKE5ld1NlYXJjaFRhYkFjdGlvbikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihOZXdDaGFuZ2VzVGFiQWN0aW9uKSk7XG5cdH1cbn1cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFNpbmdsZVBhbmVBZGRUYWJDb250cmlidXRpb24uSUQsIFNpbmdsZVBhbmVBZGRUYWJDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrU3RhcnR1cCk7XG5cbmNsYXNzIE1heGltaXplTWFpbkVkaXRvclBhcnRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uYWdlbnRTZXNzaW9ucy5tYXhpbWl6ZU1haW5FZGl0b3JQYXJ0JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTWF4aW1pemVNYWluRWRpdG9yUGFydEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21heGltaXplTWFpbkVkaXRvclBhcnQnLCBcIk1heGltaXplIEVkaXRvciBBcmVhXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5zY3JlZW5GdWxsLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuU2Vzc2lvbnNDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleUUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChzaW5nbGVQYW5lTWF4aW1pemVLZXliaW5kaW5nV2hlbiwgRWRpdG9yTWF4aW1pemVkQ29udGV4dC5uZWdhdGUoKSlcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlTGF5b3V0LFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IHNpbmdsZVBhbmVMYXlvdXRNYXhpbWl6ZU9yZGVyLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChlZGl0b3JUaXRsZUFjdGlvbnNXaGVuLCBFZGl0b3JNYXhpbWl6ZWRDb250ZXh0Lm5lZ2F0ZSgpLCBzaW5nbGVQYW5lRGV0YWlsUGFuZWwsIE1haW5FZGl0b3JBcmVhVmlzaWJsZUNvbnRleHQpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlTGF5b3V0LFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDk5LFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChlZGl0b3JUaXRsZUFjdGlvbnNXaGVuLCBFZGl0b3JNYXhpbWl6ZWRDb250ZXh0Lm5lZ2F0ZSgpLCBub3RTaW5nbGVQYW5lRGV0YWlsUGFuZWwpXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSk7XG5cdFx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRcdGxldCBoaWRUZXJtaW5hbFBhbmVsID0gZmFsc2U7XG5cblx0XHRpZiAobGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuUEFORUxfUEFSVCkgJiYgdmlld3NTZXJ2aWNlLmlzVmlld1Zpc2libGUoVEVSTUlOQUxfVklFV19JRCkpIHtcblx0XHRcdGxheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbih0cnVlLCBQYXJ0cy5QQU5FTF9QQVJUKTtcblx0XHRcdGhpZFRlcm1pbmFsUGFuZWwgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChoaWRUZXJtaW5hbFBhbmVsKSB7XG5cdFx0XHR0ZXJtaW5hbFBhbmVsSGlkZGVuRm9yTWF4aW1pemVkRWRpdG9yLmFkZChsYXlvdXRTZXJ2aWNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVybWluYWxQYW5lbEhpZGRlbkZvck1heGltaXplZEVkaXRvci5kZWxldGUobGF5b3V0U2VydmljZSk7XG5cdFx0fVxuXG5cdFx0bGF5b3V0U2VydmljZS5zZXRFZGl0b3JNYXhpbWl6ZWQodHJ1ZSk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKE1heGltaXplTWFpbkVkaXRvclBhcnRBY3Rpb24pO1xuXG5jbGFzcyBSZXN0b3JlTWFpbkVkaXRvclBhcnRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uYWdlbnRTZXNzaW9ucy5yZXN0b3JlTWFpbkVkaXRvclBhcnQnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBSZXN0b3JlTWFpbkVkaXRvclBhcnRBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdyZXN0b3JlTWFpbkVkaXRvclBhcnQnLCBcIlJlc3RvcmUgRWRpdG9yIEFyZWFcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLnNjcmVlbk5vcm1hbCxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdHRvZ2dsZWQ6IEVkaXRvck1heGltaXplZENvbnRleHQsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5TZXNzaW9uc0NvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5RSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKHNpbmdsZVBhbmVNYXhpbWl6ZUtleWJpbmRpbmdXaGVuLCBFZGl0b3JNYXhpbWl6ZWRDb250ZXh0KVxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGVMYXlvdXQsXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogc2luZ2xlUGFuZUxheW91dE1heGltaXplT3JkZXIsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKGVkaXRvclRpdGxlQWN0aW9uc1doZW4sIEVkaXRvck1heGltaXplZENvbnRleHQsIHNpbmdsZVBhbmVEZXRhaWxQYW5lbCwgTWFpbkVkaXRvckFyZWFWaXNpYmxlQ29udGV4dClcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGVMYXlvdXQsXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogOTksXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKGVkaXRvclRpdGxlQWN0aW9uc1doZW4sIEVkaXRvck1heGltaXplZENvbnRleHQsIG5vdFNpbmdsZVBhbmVEZXRhaWxQYW5lbClcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbGF5b3V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBzaG91bGRSZXN0b3JlVGVybWluYWxQYW5lbCA9IHRlcm1pbmFsUGFuZWxIaWRkZW5Gb3JNYXhpbWl6ZWRFZGl0b3IuaGFzKGxheW91dFNlcnZpY2UpO1xuXG5cdFx0bGF5b3V0U2VydmljZS5zZXRFZGl0b3JNYXhpbWl6ZWQoZmFsc2UpO1xuXG5cdFx0aWYgKHNob3VsZFJlc3RvcmVUZXJtaW5hbFBhbmVsICYmICFsYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5QQU5FTF9QQVJUKSkge1xuXHRcdFx0bGF5b3V0U2VydmljZS5zZXRQYXJ0SGlkZGVuKGZhbHNlLCBQYXJ0cy5QQU5FTF9QQVJUKTtcblx0XHR9XG5cblx0XHR0ZXJtaW5hbFBhbmVsSGlkZGVuRm9yTWF4aW1pemVkRWRpdG9yLmRlbGV0ZShsYXlvdXRTZXJ2aWNlKTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoUmVzdG9yZU1haW5FZGl0b3JQYXJ0QWN0aW9uKTtcblxuY2xhc3MgSGlkZU1haW5FZGl0b3JQYXJ0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmFnZW50U2Vzc2lvbnMuaGlkZU1haW5FZGl0b3JQYXJ0JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogSGlkZU1haW5FZGl0b3JQYXJ0QWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaGlkZU1haW5FZGl0b3JQYXJ0JywgXCJIaWRlIEVkaXRvclwiKSxcblx0XHRcdGljb246IENvZGljb24ucmlnaHRQYW5lbEhpZGUsXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGVMYXlvdXQsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiBzaW5nbGVQYW5lTGF5b3V0SGlkZUVkaXRvck9yZGVyLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5mYWxzZSgpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2UpO1xuXHRcdC8vIFJldmVhbCB0aGUgZGV0YWlsIHBhbmVsIGJlZm9yZSBoaWRpbmcgdGhlIGVkaXRvciwgc28gdGhlIHBhbmUgbmV2ZXJcblx0XHQvLyBwYXNzZXMgdGhyb3VnaCBmdWxseSBlbXB0eS5cblx0XHRsYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4oZmFsc2UsIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKTtcblx0XHRsYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4odHJ1ZSwgUGFydHMuRURJVE9SX1BBUlQpO1xuXHRcdC8vIENsb3NpbmcgdGhlIGVkaXRvciBhcmVhIGZyZWVzIGhvcml6b250YWwgc3BhY2UsIHNvIGJyaW5nIHRoZSBzZXNzaW9uc1xuXHRcdC8vIGxpc3QgYmFjayAoaXQgbWF5IGhhdmUgYmVlbiBhdXRvLWNvbGxhcHNlZCB3aGVuIGRldGFpbHMgd2FzIG9wZW5lZCkuXG5cdFx0bGF5b3V0U2VydmljZS5zZXRQYXJ0SGlkZGVuKGZhbHNlLCBQYXJ0cy5TSURFQkFSX1BBUlQpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihIaWRlTWFpbkVkaXRvclBhcnRBY3Rpb24pO1xuXG5jbGFzcyBTaG93TWFpbkVkaXRvclBhcnRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uYWdlbnRTZXNzaW9ucy5zaG93TWFpbkVkaXRvclBhcnQnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTaG93TWFpbkVkaXRvclBhcnRBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzaG93TWFpbkVkaXRvclBhcnQnLCBcIlNob3cgRWRpdG9yXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5yaWdodFBhbmVsU2hvdyxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZUxheW91dCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IHNpbmdsZVBhbmVMYXlvdXRIaWRlRWRpdG9yT3JkZXIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmZhbHNlKClcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yR3JvdXBzU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cdFx0Ly8gQSBkZWxpYmVyYXRlIHVzZXIgYWN0aW9uLCBzbyByZXZlYWwgdGhlIGVkaXRvciBhcmVhIGV4cGxpY2l0bHkgKGxpa2UgdGhlXG5cdFx0Ly8gc2Vzc2lvbi1oZWFkZXIgQ2hhbmdlcyBwaWxsKSByYXRoZXIgdGhhbiBhIHBsYWluIHBhcnQtdmlzaWJpbGl0eSB0b2dnbGU6XG5cdFx0Ly8gdGhpcyByZWNvcmRzIHRoZSByZXZlYWwgYXMgaW50ZW50aW9uYWwgc28gdGhlIGF1dG9tYXRpYyBzaW5nbGUtcGFuZSBoaWRlXG5cdFx0Ly8gcnVsZXMgZG8gbm90IHVuZG8gaXQuXG5cdFx0bGF5b3V0U2VydmljZS5yZXZlYWxFZGl0b3JQYXJ0RXhwbGljaXRseSgpO1xuXHRcdGVkaXRvckdyb3Vwc1NlcnZpY2UuYWN0aXZlR3JvdXAuZm9jdXMoKTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoU2hvd01haW5FZGl0b3JQYXJ0QWN0aW9uKTtcblxuY2xhc3MgQ2xvc2VNYWluRWRpdG9yUGFydEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5hZ2VudFNlc3Npb25zLmNsb3NlTWFpbkVkaXRvclBhcnQnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDbG9zZU1haW5FZGl0b3JQYXJ0QWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2xvc2VNYWluRWRpdG9yUGFydCcsIFwiQ2xvc2UgRWRpdG9yIEFyZWFcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmNsb3NlLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlTGF5b3V0LFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMTAwLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0SXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsXG5cdFx0XHRcdFx0SXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRcdElzVG9wUmlnaHRFZGl0b3JHcm91cENvbnRleHQsXG5cdFx0XHRcdFx0bm90U2luZ2xlUGFuZURldGFpbFBhbmVsKVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5jbG9zZUFsbEdyb3VwcycpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihDbG9zZU1haW5FZGl0b3JQYXJ0QWN0aW9uKTtcblxuY2xhc3MgT3BlbkVkaXRvckluTW9kYWxFZGl0b3JBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uYWdlbnRTZXNzaW9ucy5vcGVuRWRpdG9ySW5Nb2RhbCc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5FZGl0b3JJbk1vZGFsRWRpdG9yQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3BlbkVkaXRvckluTW9kYWwnLCBcIk9wZW4gaW4gTW9kYWwgRWRpdG9yXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5vcGVuSW5XaW5kb3csXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGVMYXlvdXQsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0SXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsXG5cdFx0XHRcdFx0SXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRcdG5vdFNpbmdsZVBhbmVEZXRhaWxQYW5lbFxuXHRcdFx0XHQpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0Y29uc3QgbGF5b3V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvckdyb3Vwc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgaXNNYXhpbWl6ZWQgPSBsYXlvdXRTZXJ2aWNlLmlzRWRpdG9yTWF4aW1pemVkKCk7XG5cblx0XHQvLyBTZXQgdGhlIGB3b3JrYmVuY2guZWRpdG9yLnVzZU1vZGFsYCBzZXR0aW5nIHRvICdhbGwnXG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoJ3dvcmtiZW5jaC5lZGl0b3IudXNlTW9kYWwnLCAnYWxsJyk7XG5cblx0XHQvLyBNb3ZlIGFsbCBlZGl0b3JzIGZyb20gdGhlIGFjdGl2ZSBncm91cCB0byB0aGUgbW9kYWwgZWRpdG9yXG5cdFx0Y29uc3QgYWN0aXZlR3JvdXAgPSBlZGl0b3JHcm91cHNTZXJ2aWNlLm1haW5QYXJ0LmFjdGl2ZUdyb3VwO1xuXG5cdFx0Ly8gQ2hlY2sgZm9yIG11bHRpLWZpbGUgZGlmZiBlZGl0b3Jcblx0XHRjb25zdCBtdWx0aUZpbGVEaWZmRWRpdG9yID0gYWN0aXZlR3JvdXAuZWRpdG9yc1xuXHRcdFx0LmZpbmQoZWRpdG9yID0+IGVkaXRvciBpbnN0YW5jZW9mIE11bHRpRGlmZkVkaXRvcklucHV0KTtcblxuXHRcdGlmIChtdWx0aUZpbGVEaWZmRWRpdG9yKSB7XG5cdFx0XHQvLyBSZW9wZW4gbXVsdGktZmlsZSBkaWZmIGVkaXRvciBhcyB0aGUgZmlyc3QgZWRpdG9yIGluIHRoZSBtb2RhbCBlZGl0b3Jcblx0XHRcdGNvbnN0IHZpZXcgPSB2aWV3c1NlcnZpY2UuZ2V0Vmlld1dpdGhJZDxDaGFuZ2VzVmlld1BhbmU+KENIQU5HRVNfVklFV19JRCk7XG5cdFx0XHRhd2FpdCB2aWV3Py5vcGVuQ2hhbmdlcygpO1xuXG5cdFx0XHQvLyBDbG9zZSB0aGUgbXVsdGktZmlsZSBkaWZmIGVkaXRvclxuXHRcdFx0YXdhaXQgYWN0aXZlR3JvdXAuY2xvc2VFZGl0b3IobXVsdGlGaWxlRGlmZkVkaXRvcik7XG5cdFx0fVxuXG5cdFx0Ly8gTW92ZSBhbGwgcmVtYWluaW5nIGVkaXRvcnMgdG8gdGhlIG1vZGFsIGVkaXRvclxuXHRcdGNvbnN0IG1vZGFsUGFydCA9IGF3YWl0IGVkaXRvckdyb3Vwc1NlcnZpY2UuY3JlYXRlTW9kYWxFZGl0b3JQYXJ0KCk7XG5cdFx0Y29uc3QgZWRpdG9yc1RvTW92ZSA9IHByZXBhcmVNb3ZlQ29weUVkaXRvcnMoYWN0aXZlR3JvdXAsIGFjdGl2ZUdyb3VwLmVkaXRvcnMuc2xpY2UoKSwgdHJ1ZSk7XG5cdFx0YWN0aXZlR3JvdXAubW92ZUVkaXRvcnMoZWRpdG9yc1RvTW92ZSwgbW9kYWxQYXJ0LmFjdGl2ZUdyb3VwKTtcblxuXHRcdC8vIE1heGltaXplXG5cdFx0aWYgKGlzTWF4aW1pemVkICYmICFtb2RhbFBhcnQubWF4aW1pemVkKSB7XG5cdFx0XHRtb2RhbFBhcnQudG9nZ2xlTWF4aW1pemVkKCk7XG5cdFx0fVxuXG5cdFx0Ly8gRm9jdXNcblx0XHRtb2RhbFBhcnQuYWN0aXZlR3JvdXAuZm9jdXMoKTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoT3BlbkVkaXRvckluTW9kYWxFZGl0b3JBY3Rpb24pO1xuXG5jbGFzcyBPcGVuTW9kYWxFZGl0b3JJbkVkaXRvckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5hZ2VudFNlc3Npb25zLm9wZW5Nb2RhbEVkaXRvckluRWRpdG9yJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogT3Blbk1vZGFsRWRpdG9ySW5FZGl0b3JBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdvcGVuTW9kYWxFZGl0b3JJbkVkaXRvcicsIFwiT3BlbiBpbiBFZGl0b3IgQXJlYVwiKSxcblx0XHRcdGljb246IENvZGljb24ub3BlbkluV2luZG93LFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0Ly8gVGhlIGVkaXRvciBhcmVhIGlzIG5vdCByZW5kZXJlZCB3aGlsZSBhIGN1c3RvbSB2aWV3IHJlcGxhY2VzIHRoZSBzZXNzaW9ucyBncmlkLlxuXHRcdFx0cHJlY29uZGl0aW9uOiBDdXN0b21WaWV3VmlzaWJsZUNvbnRleHQubmVnYXRlKCksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTW9kYWxFZGl0b3JUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDk4LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0SXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsXG5cdFx0XHRcdFx0RWRpdG9yUGFydE1vZGFsQ29udGV4dClcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yR3JvdXBzU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cdFx0Y29uc3QgbGF5b3V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBjaGFuZ2VzVmlld1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYW5nZXNWaWV3U2VydmljZSk7XG5cblx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYXJ0ID0gZWRpdG9yR3JvdXBzU2VydmljZS5hY3RpdmVNb2RhbEVkaXRvclBhcnQ7XG5cdFx0Y29uc3QgYWN0aXZlR3JvdXAgPSBhY3RpdmVFZGl0b3JQYXJ0Py5hY3RpdmVHcm91cDtcblx0XHRpZiAoIWFjdGl2ZUVkaXRvclBhcnQgfHwgIWFjdGl2ZUdyb3VwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNNYXhpbWl6ZWQgPSBhY3RpdmVFZGl0b3JQYXJ0Lm1heGltaXplZDtcblxuXHRcdC8vIFNldCB0aGUgYHdvcmtiZW5jaC5lZGl0b3IudXNlTW9kYWxgIHNldHRpbmcgYmFjayB0byAnc29tZSdcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSgnd29ya2JlbmNoLmVkaXRvci51c2VNb2RhbCcsICdzb21lJyk7XG5cblx0XHQvLyBTaG93IHRoZSBtYWluIGVkaXRvciBwYXJ0XG5cdFx0bGF5b3V0U2VydmljZS5zZXRQYXJ0SGlkZGVuKGZhbHNlLCBQYXJ0cy5FRElUT1JfUEFSVCk7XG5cblx0XHQvLyBDaGVjayBmb3IgbmF2aWdhdGlvbiBpbiB0aGUgbW9kYWwgZWRpdG9yXG5cdFx0Y29uc3QgbmF2aWdhdGlvbiA9IGFjdGl2ZUdyb3VwLmFjdGl2ZUVkaXRvclBhbmU/Lm9wdGlvbnM/Lm1vZGFsPy5uYXZpZ2F0aW9uO1xuXHRcdGlmIChuYXZpZ2F0aW9uKSB7XG5cdFx0XHRjb25zdCB2aWV3ID0gdmlld3NTZXJ2aWNlLmdldFZpZXdXaXRoSWQ8Q2hhbmdlc1ZpZXdQYW5lPihDSEFOR0VTX1ZJRVdfSUQpO1xuXHRcdFx0Y29uc3QgY2hhbmdlcyA9IGNoYW5nZXNWaWV3U2VydmljZS5hY3RpdmVTZXNzaW9uQ2hhbmdlc09icy5nZXQoKTtcblxuXHRcdFx0aWYgKGNoYW5nZXMgJiYgbmF2aWdhdGlvbi5jdXJyZW50IDwgY2hhbmdlcy5sZW5ndGgpIHtcblx0XHRcdFx0Ly8gUmVvcGVuIG11bHRpLWZpbGUgZGlmZiBlZGl0b3IgZm9yIHRoZSBjdXJyZW50IGZpbGVcblx0XHRcdFx0YXdhaXQgdmlldz8ub3BlbkNoYW5nZXMoY2hhbmdlc1tuYXZpZ2F0aW9uLmN1cnJlbnRdLm1vZGlmaWVkVXJpID8/IGNoYW5nZXNbbmF2aWdhdGlvbi5jdXJyZW50XS5vcmlnaW5hbFVyaSk7XG5cblx0XHRcdFx0Ly8gQ2xvc2UgdGhlIGVkaXRvciBpbiB0aGUgbW9kYWwgZWRpdG9yIChhc3N1bWUgdGhhdCB0aGVcblx0XHRcdFx0Ly8gbXVsdGktZmlsZSBkaWZmIGVkaXRvciBpcyB0aGUgZmlyc3QgZWRpdG9yIGluIHRoZSBtb2RhbFxuXHRcdFx0XHQvLyBlZGl0b3IpXG5cdFx0XHRcdGF3YWl0IGFjdGl2ZUdyb3VwLmNsb3NlRWRpdG9yKGFjdGl2ZUdyb3VwLmVkaXRvcnNbMF0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE1vdmUgYWxsIHJlbWFpbmluZyBlZGl0b3JzIHRvIHRoZSBtYWluIGVkaXRvciBwYXJ0XG5cdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoTU9WRV9NT0RBTF9FRElUT1JfVE9fTUFJTl9DT01NQU5EX0lEKTtcblxuXHRcdC8vIE1heGltaXplXG5cdFx0aWYgKGlzTWF4aW1pemVkKSB7XG5cdFx0XHRsYXlvdXRTZXJ2aWNlLnNldEVkaXRvck1heGltaXplZCh0cnVlKTtcblx0XHR9XG5cblx0XHQvLyBGb2N1c1xuXHRcdGVkaXRvckdyb3Vwc1NlcnZpY2UuYWN0aXZlR3JvdXAuZm9jdXMoKTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoT3Blbk1vZGFsRWRpdG9ySW5FZGl0b3JBY3Rpb24pO1xuXG5jbGFzcyBBZGRGaWxlQXNDb250ZXh0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmFnZW50U2Vzc2lvbnMuYWRkRmlsZUFzQ29udGV4dCc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgcHJlY29uZGl0aW9uID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0SXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsXG5cdFx0XHRJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQudG9OZWdhdGVkKCksXG5cdFx0XHRBY3RpdmVFZGl0b3JDb250ZXh0LmlzRXF1YWxUbyhURVhUX0ZJTEVfRURJVE9SX0lEKVxuXHRcdCk7XG5cblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQWRkRmlsZUFzQ29udGV4dEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2FkZEZpbGVBc0NvbnRleHQnLCBcIkFkZCBGaWxlIGFzIENvbnRleHRcIiksXG5cdFx0XHRjYXRlZ29yeTogU2Vzc2lvbnNDYXRlZ29yaWVzLlNlc3Npb25zLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5hdHRhY2gsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbixcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51cy5TZXNzaW9uc0VkaXRvckhlYWRlclNlY29uZGFyeSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEwMDAwMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKHByZWNvbmRpdGlvbiwgc2luZ2xlUGFuZURldGFpbFBhbmVsKVxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMTAwMDAwLCAvLyB0b3dhcmRzIHRoZSBmYXIgcmlnaHQsIG1pcnJvcmluZyBTcGxpdCBFZGl0b3IgUmlnaHQgaW4gdGhlIHJlZ3VsYXIgd2luZG93XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChwcmVjb25kaXRpb24sIG5vdFNpbmdsZVBhbmVEZXRhaWxQYW5lbClcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uc1BhcnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1BhcnRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHJlc29sdmVkQ29udGV4dCA9IHJlc29sdmVDb21tYW5kc0NvbnRleHQoYXJncywgZWRpdG9yU2VydmljZSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkpO1xuXHRcdGNvbnN0IHJlc291cmNlcyA9IHJlc29sdmVkQ29udGV4dC5ncm91cGVkRWRpdG9yc1xuXHRcdFx0LmZsYXRNYXAoZ3JvdXBlZEVkaXRvciA9PiBncm91cGVkRWRpdG9yLmVkaXRvcnMpXG5cdFx0XHQubWFwKGVkaXRvciA9PiBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldENhbm9uaWNhbFVyaShlZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KSlcblx0XHRcdC5maWx0ZXIoKHVyaSk6IHVyaSBpcyBVUkkgPT4gdXJpICE9PSB1bmRlZmluZWQgJiYgW1NjaGVtYXMuZmlsZSwgU2NoZW1hcy52c2NvZGVSZW1vdGUsIFNjaGVtYXMudW50aXRsZWRdLmluY2x1ZGVzKHVyaS5zY2hlbWUpKTtcblx0XHRpZiAocmVzb3VyY2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25JZCA9IHNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQ7XG5cdFx0c2Vzc2lvbnNQYXJ0U2VydmljZS5nZXRTZXNzaW9uVmlldyhzZXNzaW9uSWQpPy5hdHRhY2gocmVzb3VyY2VzKTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoQWRkRmlsZUFzQ29udGV4dEFjdGlvbik7XG5cbi8qKlxuICogTWlycm9ycyBleHRlbnNpb24tY29udHJpYnV0ZWQgYGVkaXRvci90aXRsZWAgaXRlbXMgaW50byB7QGxpbmsgTWVudXMuU2Vzc2lvbnNFZGl0b3JIZWFkZXJTZWNvbmRhcnl9XG4gKiBzbyB0aGV5IGFyZSBub3QgbG9zdCBpbiB0aGUgc2luZ2xlLXBhbmUgbGF5b3V0LiBTZWUgYExBWU9VVC5tZGAgZm9yIGRldGFpbHMuXG4gKi9cbmV4cG9ydCBjbGFzcyBFZGl0b3JUaXRsZU1lbnVCcmlkZ2VDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnNlc3Npb25zLmVkaXRvclRpdGxlTWVudUJyaWRnZSc7XG5cblx0Ly8gRXh0ZW5zaW9uIHN1Ym1lbnVzIGFyZSByZWdpc3RlcmVkIHdpdGggYSBgTWVudUlkLmZvcignYXBpOjxpZD4nKWAgaWQgKHNlZSB0aGVcblx0Ly8gYHN1Ym1lbnVzYCBleHRlbnNpb24gcG9pbnQpLCB3aGljaCBkaXN0aW5ndWlzaGVzIHRoZW0gZnJvbSBjb3JlIHN1Ym1lbnVzLlxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfZXh0ZW5zaW9uU3VibWVudVByZWZpeCA9ICdhcGk6JztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9taXJyb3JlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2UgbGF5b3V0U2VydmljZTogSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGlmICghbGF5b3V0U2VydmljZS5pc1NpbmdsZVBhbmVMYXlvdXRFbmFibGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3luYygpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKE1lbnVSZWdpc3RyeS5vbkRpZENoYW5nZU1lbnUoZSA9PiB7XG5cdFx0XHRpZiAoZS5oYXMoTWVudUlkLkVkaXRvclRpdGxlKSkge1xuXHRcdFx0XHR0aGlzLl9zeW5jKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3luYygpOiB2b2lkIHtcblx0XHR0aGlzLl9taXJyb3JlZC5jbGVhcigpO1xuXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIE1lbnVSZWdpc3RyeS5nZXRNZW51SXRlbXMoTWVudUlkLkVkaXRvclRpdGxlKSkge1xuXHRcdFx0Ly8gQnJpZGdlIG9ubHkgZXh0ZW5zaW9uIGNvbnRyaWJ1dGlvbnM6IGNvbW1hbmQgaXRlbXMgd2hvc2UgY29tbWFuZCBjYXJyaWVzIGFcblx0XHRcdC8vIGBzb3VyY2VgIChzZXQgYnkgdGhlIGBjb21tYW5kc2AgZXh0ZW5zaW9uIHBvaW50KSwgYW5kIHN1Ym1lbnUgaXRlbXMgd2hvc2Vcblx0XHRcdC8vIHN1Ym1lbnUgaXMgYW4gZXh0ZW5zaW9uIGBhcGk6YCBtZW51LiBDb3JlIGl0ZW1zIGhhdmUgbmVpdGhlci5cblx0XHRcdGNvbnN0IGlzRXh0ZW5zaW9uSXRlbSA9IGlzSU1lbnVJdGVtKGl0ZW0pXG5cdFx0XHRcdD8gISFpdGVtLmNvbW1hbmQuc291cmNlXG5cdFx0XHRcdDogaXRlbS5zdWJtZW51LmlkLnN0YXJ0c1dpdGgoRWRpdG9yVGl0bGVNZW51QnJpZGdlQ29udHJpYnV0aW9uLl9leHRlbnNpb25TdWJtZW51UHJlZml4KTtcblx0XHRcdGlmIChpc0V4dGVuc2lvbkl0ZW0pIHtcblx0XHRcdFx0Y29uc3QgZ3JvdXAgPSBpdGVtLmdyb3VwID09PSAnbmF2aWdhdGlvbidcblx0XHRcdFx0XHQ/ICdleHRlbnNpb24vbmF2aWdhdGlvbidcblx0XHRcdFx0XHQ6IGBzZWNvbmRhcnkvZXh0ZW5zaW9uLyR7aXRlbS5ncm91cCA/PyAnb3RoZXInfWA7XG5cdFx0XHRcdHRoaXMuX21pcnJvcmVkLmFkZChNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudXMuU2Vzc2lvbnNFZGl0b3JIZWFkZXJTZWNvbmRhcnksIHsgLi4uaXRlbSwgZ3JvdXAgfSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoRWRpdG9yVGl0bGVNZW51QnJpZGdlQ29udHJpYnV0aW9uLklELCBFZGl0b3JUaXRsZU1lbnVCcmlkZ2VDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrU3RhcnR1cCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsU0FBUyxxQkFBcUIscUJBQXFCLGtCQUFrQiwwQkFBMEI7QUFDL0YsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxlQUFlO0FBR3hCLFNBQVMsU0FBUyxhQUFhLFFBQVEsY0FBYyx1QkFBdUI7QUFDNUUsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx3QkFB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
