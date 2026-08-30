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
import { localize, localize2 } from "../../../../nls.js";
import { Action } from "../../../../base/common/actions.js";
import { CloseDirection, SaveReason, EditorsOrder, EditorInputCapabilities, EditorResourceAccessor } from "../../../common/editor.js";
import { SideBySideEditorInput } from "../../../common/editor/sideBySideEditorInput.js";
import { IWorkbenchLayoutService, Parts } from "../../../services/layout/browser/layoutService.js";
import { GoFilter, IHistoryService } from "../../../services/history/common/history.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { CLOSE_EDITOR_COMMAND_ID, MOVE_ACTIVE_EDITOR_COMMAND_ID, SPLIT_EDITOR_LEFT, SPLIT_EDITOR_RIGHT, SPLIT_EDITOR_UP, SPLIT_EDITOR_DOWN, splitEditor, LAYOUT_EDITOR_GROUPS_COMMAND_ID, UNPIN_EDITOR_COMMAND_ID, COPY_ACTIVE_EDITOR_COMMAND_ID, SPLIT_EDITOR, TOGGLE_MAXIMIZE_EDITOR_GROUP, MOVE_EDITOR_INTO_NEW_WINDOW_COMMAND_ID, COPY_EDITOR_INTO_NEW_WINDOW_COMMAND_ID, MOVE_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID, COPY_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID, NEW_EMPTY_EDITOR_WINDOW_COMMAND_ID, MOVE_EDITOR_INTO_RIGHT_GROUP, MOVE_EDITOR_INTO_LEFT_GROUP, MOVE_EDITOR_INTO_ABOVE_GROUP, MOVE_EDITOR_INTO_BELOW_GROUP, REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID } from "./editorCommands.js";
import { IEditorGroupsService, GroupsArrangement, GroupLocation, GroupDirection, preferredSideBySideGroupDirection, GroupOrientation, GroupsOrder, MergeGroupMode } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IWorkspacesService } from "../../../../platform/workspaces/common/workspaces.js";
import { IFileDialogService, ConfirmResult, IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { ItemActivation, IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { AllEditorsByMostRecentlyUsedQuickAccess, ActiveGroupEditorsByMostRecentlyUsedQuickAccess, AllEditorsByAppearanceQuickAccess } from "./editorQuickAccess.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IFilesConfigurationService, AutoSaveMode } from "../../../services/filesConfiguration/common/filesConfigurationService.js";
import { IEditorResolverService } from "../../../services/editor/common/editorResolverService.js";
import { isLinux, isNative, isWindows } from "../../../../base/common/platform.js";
import { Action2, MenuId } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { ActiveEditorAvailableEditorIdsContext, ActiveEditorCannotCloseContext, ActiveEditorContext, ActiveEditorGroupEmptyContext, AuxiliaryBarVisibleContext, EditorPartMaximizedEditorGroupContext, EditorPartMultipleEditorGroupsContext, InAutomationContext, IsAuxiliaryWindowFocusedContext, MultipleEditorGroupsContext, SideBarVisibleContext } from "../../../common/contextkeys.js";
import { getActiveDocument } from "../../../../base/browser/dom.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { resolveCommandsContext } from "./editorCommandsContext.js";
import { IListService } from "../../../../platform/list/browser/listService.js";
import { prepareMoveCopyEditors } from "./editor.js";
class ExecuteCommandAction extends Action2 {
  constructor(desc, commandId, commandArgs) {
    super(desc);
    this.commandId = commandId;
    this.commandArgs = commandArgs;
  }
  run(accessor) {
    const commandService = accessor.get(ICommandService);
    return commandService.executeCommand(this.commandId, this.commandArgs);
  }
}
class AbstractSplitEditorAction extends Action2 {
  getDirection(configurationService) {
    return preferredSideBySideGroupDirection(configurationService);
  }
  async run(accessor, ...args) {
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const configurationService = accessor.get(IConfigurationService);
    const editorService = accessor.get(IEditorService);
    const listService = accessor.get(IListService);
    const direction = this.getDirection(configurationService);
    const commandContext = resolveCommandsContext(args, editorService, editorGroupsService, listService);
    splitEditor(editorGroupsService, direction, commandContext);
  }
}
const _SplitEditorAction = class _SplitEditorAction extends AbstractSplitEditorAction {
  constructor() {
    super({
      id: _SplitEditorAction.ID,
      title: localize2("splitEditor", "Split Editor"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.Backslash
      },
      category: Categories.View
    });
  }
};
_SplitEditorAction.ID = SPLIT_EDITOR;
let SplitEditorAction = _SplitEditorAction;
class SplitEditorOrthogonalAction extends AbstractSplitEditorAction {
  constructor() {
    super({
      id: "workbench.action.splitEditorOrthogonal",
      title: localize2("splitEditorOrthogonal", "Split Editor Orthogonal"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Backslash)
      },
      category: Categories.View
    });
  }
  getDirection(configurationService) {
    const direction = preferredSideBySideGroupDirection(configurationService);
    return direction === GroupDirection.RIGHT ? GroupDirection.DOWN : GroupDirection.RIGHT;
  }
}
class SplitEditorLeftAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: SPLIT_EDITOR_LEFT,
      title: localize2("splitEditorGroupLeft", "Split Editor Left"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Backslash)
      },
      category: Categories.View
    }, SPLIT_EDITOR_LEFT);
  }
}
class SplitEditorRightAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: SPLIT_EDITOR_RIGHT,
      title: localize2("splitEditorGroupRight", "Split Editor Right"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Backslash)
      },
      category: Categories.View
    }, SPLIT_EDITOR_RIGHT);
  }
}
class SplitEditorUpAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: SPLIT_EDITOR_UP,
      title: localize2("splitEditorGroupUp", "Split Editor Up"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Backslash)
      },
      category: Categories.View
    }, SPLIT_EDITOR_UP);
  }
}
SplitEditorUpAction.LABEL = localize("splitEditorGroupUp", "Split Editor Up");
class SplitEditorDownAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: SPLIT_EDITOR_DOWN,
      title: localize2("splitEditorGroupDown", "Split Editor Down"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Backslash)
      },
      category: Categories.View
    }, SPLIT_EDITOR_DOWN);
  }
}
SplitEditorDownAction.LABEL = localize("splitEditorGroupDown", "Split Editor Down");
class JoinTwoGroupsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.joinTwoGroups",
      title: localize2("joinTwoGroups", "Join Editor Group with Next Group"),
      f1: true,
      category: Categories.View
    });
  }
  async run(accessor, context) {
    const editorGroupService = accessor.get(IEditorGroupsService);
    let sourceGroup;
    if (context && typeof context.groupId === "number") {
      sourceGroup = editorGroupService.getGroup(context.groupId);
    } else {
      sourceGroup = editorGroupService.activeGroup;
    }
    if (sourceGroup) {
      const targetGroupDirections = [GroupDirection.RIGHT, GroupDirection.DOWN, GroupDirection.LEFT, GroupDirection.UP];
      for (const targetGroupDirection of targetGroupDirections) {
        const targetGroup = editorGroupService.findGroup({ direction: targetGroupDirection }, sourceGroup);
        if (targetGroup && sourceGroup !== targetGroup) {
          editorGroupService.mergeGroup(sourceGroup, targetGroup);
          break;
        }
      }
    }
  }
}
class JoinAllGroupsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.joinAllGroups",
      title: localize2("joinAllGroups", "Join All Editor Groups"),
      f1: true,
      category: Categories.View
    });
  }
  async run(accessor) {
    const editorGroupService = accessor.get(IEditorGroupsService);
    editorGroupService.mergeAllGroups(editorGroupService.activeGroup);
  }
}
class NavigateBetweenGroupsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.navigateEditorGroups",
      title: localize2("navigateEditorGroups", "Navigate Between Editor Groups"),
      f1: true,
      category: Categories.View
    });
  }
  async run(accessor) {
    const editorGroupService = accessor.get(IEditorGroupsService);
    const nextGroup = editorGroupService.findGroup({ location: GroupLocation.NEXT }, editorGroupService.activeGroup, true);
    nextGroup?.focus();
  }
}
class FocusActiveGroupAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.focusActiveEditorGroup",
      title: localize2("focusActiveEditorGroup", "Focus Active Editor Group"),
      f1: true,
      category: Categories.View
    });
  }
  async run(accessor) {
    const editorGroupService = accessor.get(IEditorGroupsService);
    editorGroupService.activeGroup.focus();
  }
}
class AbstractFocusGroupAction extends Action2 {
  constructor(desc, scope) {
    super(desc);
    this.scope = scope;
  }
  async run(accessor) {
    const editorGroupService = accessor.get(IEditorGroupsService);
    const group = editorGroupService.findGroup(this.scope, editorGroupService.activeGroup, true);
    group?.focus();
  }
}
class FocusFirstGroupAction extends AbstractFocusGroupAction {
  constructor() {
    super({
      id: "workbench.action.focusFirstEditorGroup",
      title: localize2("focusFirstEditorGroup", "Focus First Editor Group"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.Digit1
      },
      category: Categories.View
    }, { location: GroupLocation.FIRST });
  }
}
class FocusLastGroupAction extends AbstractFocusGroupAction {
  constructor() {
    super({
      id: "workbench.action.focusLastEditorGroup",
      title: localize2("focusLastEditorGroup", "Focus Last Editor Group"),
      f1: true,
      category: Categories.View
    }, { location: GroupLocation.LAST });
  }
}
class FocusNextGroup extends AbstractFocusGroupAction {
  constructor() {
    super({
      id: "workbench.action.focusNextGroup",
      title: localize2("focusNextGroup", "Focus Next Editor Group"),
      f1: true,
      category: Categories.View
    }, { location: GroupLocation.NEXT });
  }
}
class FocusPreviousGroup extends AbstractFocusGroupAction {
  constructor() {
    super({
      id: "workbench.action.focusPreviousGroup",
      title: localize2("focusPreviousGroup", "Focus Previous Editor Group"),
      f1: true,
      category: Categories.View
    }, { location: GroupLocation.PREVIOUS });
  }
}
class FocusLeftGroup extends AbstractFocusGroupAction {
  constructor() {
    super({
      id: "workbench.action.focusLeftGroup",
      title: localize2("focusLeftGroup", "Focus Left Editor Group"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.LeftArrow)
      },
      category: Categories.View
    }, { direction: GroupDirection.LEFT });
  }
}
class FocusRightGroup extends AbstractFocusGroupAction {
  constructor() {
    super({
      id: "workbench.action.focusRightGroup",
      title: localize2("focusRightGroup", "Focus Right Editor Group"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.RightArrow)
      },
      category: Categories.View
    }, { direction: GroupDirection.RIGHT });
  }
}
class FocusAboveGroup extends AbstractFocusGroupAction {
  constructor() {
    super({
      id: "workbench.action.focusAboveGroup",
      title: localize2("focusAboveGroup", "Focus Editor Group Above"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.UpArrow)
      },
      category: Categories.View
    }, { direction: GroupDirection.UP });
  }
}
class FocusBelowGroup extends AbstractFocusGroupAction {
  constructor() {
    super({
      id: "workbench.action.focusBelowGroup",
      title: localize2("focusBelowGroup", "Focus Editor Group Below"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.DownArrow)
      },
      category: Categories.View
    }, { direction: GroupDirection.DOWN });
  }
}
let CloseEditorAction = class extends Action {
  constructor(id, label, commandService) {
    super(id, label, ThemeIcon.asClassName(Codicon.close));
    this.commandService = commandService;
  }
  run(context) {
    return this.commandService.executeCommand(CLOSE_EDITOR_COMMAND_ID, void 0, context);
  }
};
CloseEditorAction.ID = "workbench.action.closeActiveEditor";
CloseEditorAction.LABEL = localize("closeEditor", "Close Editor");
CloseEditorAction = __decorateClass([
  __decorateParam(2, ICommandService)
], CloseEditorAction);
let UnpinEditorAction = class extends Action {
  constructor(id, label, commandService) {
    super(id, label, ThemeIcon.asClassName(Codicon.pinned));
    this.commandService = commandService;
  }
  run(context) {
    return this.commandService.executeCommand(UNPIN_EDITOR_COMMAND_ID, void 0, context);
  }
};
UnpinEditorAction.ID = "workbench.action.unpinActiveEditor";
UnpinEditorAction.LABEL = localize("unpinEditor", "Unpin Editor");
UnpinEditorAction = __decorateClass([
  __decorateParam(2, ICommandService)
], UnpinEditorAction);
let CloseEditorTabAction = class extends Action {
  constructor(id, label, editorGroupService) {
    super(id, label, ThemeIcon.asClassName(Codicon.closeSmall));
    this.editorGroupService = editorGroupService;
  }
  async run(context) {
    const group = context ? this.editorGroupService.getGroup(context.groupId) : this.editorGroupService.activeGroup;
    if (!group) {
      return;
    }
    const targetEditor = context?.editorIndex !== void 0 ? group.getEditorByIndex(context.editorIndex) : group.activeEditor;
    if (!targetEditor) {
      return;
    }
    const editors = [];
    if (group.isSelected(targetEditor)) {
      editors.push(...group.selectedEditors);
    } else {
      editors.push(targetEditor);
    }
    for (const editor of editors) {
      await group.closeEditor(editor, { preserveFocus: context?.preserveFocus });
    }
  }
};
CloseEditorTabAction.ID = "workbench.action.closeActiveEditor";
CloseEditorTabAction.LABEL = localize("closeOneEditor", "Close");
CloseEditorTabAction = __decorateClass([
  __decorateParam(2, IEditorGroupsService)
], CloseEditorTabAction);
let CloseOtherEditorTabsInGroupAction = class extends Action {
  constructor(id, label, editorGroupService) {
    super(id, label, ThemeIcon.asClassName(Codicon.closeAll));
    this.editorGroupService = editorGroupService;
  }
  async run(context) {
    const group = context ? this.editorGroupService.getGroup(context.groupId) : this.editorGroupService.activeGroup;
    if (!group) {
      return;
    }
    const targetEditor = context?.editorIndex !== void 0 ? group.getEditorByIndex(context.editorIndex) : group.activeEditor;
    if (!targetEditor) {
      return;
    }
    const editorsToClose = group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true }).filter((editor) => editor !== targetEditor);
    await group.closeEditors(editorsToClose, { preserveFocus: context?.preserveFocus });
  }
};
CloseOtherEditorTabsInGroupAction.ID = "workbench.action.closeOtherEditorTabInGroup";
CloseOtherEditorTabsInGroupAction.LABEL = localize("closeOthers", "Close Others");
CloseOtherEditorTabsInGroupAction = __decorateClass([
  __decorateParam(2, IEditorGroupsService)
], CloseOtherEditorTabsInGroupAction);
class RevertAndCloseEditorAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.revertAndCloseActiveEditor",
      title: localize2("revertAndCloseActiveEditor", "Revert and Close Editor"),
      f1: true,
      category: Categories.View,
      precondition: ActiveEditorCannotCloseContext.toNegated()
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const logService = accessor.get(ILogService);
    const activeEditorPane = editorService.activeEditorPane;
    if (activeEditorPane) {
      const editor = activeEditorPane.input;
      if (editor.hasCapability(EditorInputCapabilities.CannotClose)) {
        return;
      }
      const group = activeEditorPane.group;
      try {
        await editorService.revert({ editor, groupId: group.id });
      } catch (error) {
        logService.error(error);
        await editorService.revert({ editor, groupId: group.id }, { soft: true });
      }
      await group.closeEditor(editor);
    }
  }
}
class CloseLeftEditorsInGroupAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.closeEditorsToTheLeft",
      title: localize2("closeEditorsToTheLeft", "Close Editors to the Left in Group"),
      f1: true,
      category: Categories.View
    });
  }
  async run(accessor, context) {
    const editorGroupService = accessor.get(IEditorGroupsService);
    const { group, editor } = this.getTarget(editorGroupService, context);
    if (group && editor) {
      await group.closeEditors({ direction: CloseDirection.LEFT, except: editor, excludeSticky: true });
    }
  }
  getTarget(editorGroupService, context) {
    if (context) {
      return { editor: context.editor, group: editorGroupService.getGroup(context.groupId) };
    }
    return { group: editorGroupService.activeGroup, editor: editorGroupService.activeGroup.activeEditor };
  }
}
class AbstractCloseAllAction extends Action2 {
  groupsToClose(editorGroupService) {
    const groupsToClose = [];
    const groups = editorGroupService.getGroups(GroupsOrder.GRID_APPEARANCE);
    for (let i = groups.length - 1; i >= 0; i--) {
      groupsToClose.push(groups[i]);
    }
    return groupsToClose;
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const logService = accessor.get(ILogService);
    const progressService = accessor.get(IProgressService);
    const editorGroupService = accessor.get(IEditorGroupsService);
    const filesConfigurationService = accessor.get(IFilesConfigurationService);
    const fileDialogService = accessor.get(IFileDialogService);
    const dirtyEditorsWithDefaultConfirm = /* @__PURE__ */ new Set();
    const dirtyAutoSaveOnFocusChangeEditors = /* @__PURE__ */ new Set();
    const dirtyAutoSaveOnWindowChangeEditors = /* @__PURE__ */ new Set();
    const editorsWithCustomConfirm = /* @__PURE__ */ new Map();
    for (const { editor, groupId } of editorService.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: this.excludeSticky })) {
      if (editor.hasCapability(EditorInputCapabilities.CannotClose)) {
        continue;
      }
      let confirmClose = false;
      let handlerDidError = false;
      if (editor.closeHandler) {
        try {
          confirmClose = editor.closeHandler.showConfirm();
        } catch (error) {
          logService.error(error);
          handlerDidError = true;
        }
      }
      if (!editor.closeHandler || handlerDidError) {
        confirmClose = editor.isDirty() && !editor.isSaving();
      }
      if (!confirmClose) {
        continue;
      }
      if (typeof editor.closeHandler?.confirm === "function") {
        let customEditorsToConfirm = editorsWithCustomConfirm.get(editor.typeId);
        if (!customEditorsToConfirm) {
          customEditorsToConfirm = /* @__PURE__ */ new Set();
          editorsWithCustomConfirm.set(editor.typeId, customEditorsToConfirm);
        }
        customEditorsToConfirm.add({ editor, groupId });
      } else if (!editor.hasCapability(EditorInputCapabilities.Untitled) && filesConfigurationService.getAutoSaveMode(editor).mode === AutoSaveMode.ON_FOCUS_CHANGE) {
        dirtyAutoSaveOnFocusChangeEditors.add({ editor, groupId });
      } else if (isNative && (isWindows || isLinux) && !editor.hasCapability(EditorInputCapabilities.Untitled) && filesConfigurationService.getAutoSaveMode(editor).mode === AutoSaveMode.ON_WINDOW_CHANGE) {
        dirtyAutoSaveOnWindowChangeEditors.add({ editor, groupId });
      } else {
        dirtyEditorsWithDefaultConfirm.add({ editor, groupId });
      }
    }
    if (dirtyEditorsWithDefaultConfirm.size > 0) {
      const editors = Array.from(dirtyEditorsWithDefaultConfirm.values());
      await this.revealEditorsToConfirm(editors, editorGroupService);
      const confirmation = await fileDialogService.showSaveConfirm(editors.map(({ editor }) => {
        if (editor instanceof SideBySideEditorInput) {
          return editor.primary.getName();
        }
        return editor.getName();
      }));
      switch (confirmation) {
        case ConfirmResult.CANCEL:
          return;
        case ConfirmResult.DONT_SAVE:
          await this.revertEditors(editorService, logService, progressService, editors);
          break;
        case ConfirmResult.SAVE:
          await editorService.save(editors, { reason: SaveReason.EXPLICIT });
          break;
      }
    }
    for (const [, editorIdentifiers] of editorsWithCustomConfirm) {
      const editors = Array.from(editorIdentifiers.values());
      await this.revealEditorsToConfirm(editors, editorGroupService);
      const confirmation = await editors.at(0)?.editor.closeHandler?.confirm?.(editors);
      if (typeof confirmation === "number") {
        switch (confirmation) {
          case ConfirmResult.CANCEL:
            return;
          case ConfirmResult.DONT_SAVE:
            await this.revertEditors(editorService, logService, progressService, editors);
            break;
          case ConfirmResult.SAVE:
            await editorService.save(editors, { reason: SaveReason.EXPLICIT });
            break;
        }
      }
    }
    if (dirtyAutoSaveOnFocusChangeEditors.size > 0) {
      const editors = Array.from(dirtyAutoSaveOnFocusChangeEditors.values());
      await editorService.save(editors, { reason: SaveReason.FOCUS_CHANGE });
    }
    if (dirtyAutoSaveOnWindowChangeEditors.size > 0) {
      const editors = Array.from(dirtyAutoSaveOnWindowChangeEditors.values());
      await editorService.save(editors, { reason: SaveReason.WINDOW_CHANGE });
    }
    return this.doCloseAll(editorGroupService);
  }
  revertEditors(editorService, logService, progressService, editors) {
    return progressService.withProgress({
      location: ProgressLocation.Window,
      // use window progress to not be too annoying about this operation
      delay: 800,
      // delay so that it only appears when operation takes a long time
      title: localize("reverting", "Reverting Editors...")
    }, () => this.doRevertEditors(editorService, logService, editors));
  }
  async doRevertEditors(editorService, logService, editors) {
    try {
      await editorService.revert(editors);
    } catch (error) {
      logService.error(error);
      await editorService.revert(editors, { soft: true });
    }
  }
  async revealEditorsToConfirm(editors, editorGroupService) {
    try {
      const handledGroups = /* @__PURE__ */ new Set();
      for (const { editor, groupId } of editors) {
        if (handledGroups.has(groupId)) {
          continue;
        }
        handledGroups.add(groupId);
        const group = editorGroupService.getGroup(groupId);
        await group?.openEditor(editor);
      }
    } catch (error) {
    }
  }
  async doCloseAll(editorGroupService) {
    await Promise.all(this.groupsToClose(editorGroupService).map((group) => group.closeAllEditors({ excludeSticky: this.excludeSticky })));
  }
}
const _CloseAllEditorsAction = class _CloseAllEditorsAction extends AbstractCloseAllAction {
  constructor() {
    super({
      id: _CloseAllEditorsAction.ID,
      title: _CloseAllEditorsAction.LABEL,
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyW)
      },
      icon: Codicon.closeAll,
      category: Categories.View
    });
  }
  get excludeSticky() {
    return true;
  }
};
_CloseAllEditorsAction.ID = "workbench.action.closeAllEditors";
_CloseAllEditorsAction.LABEL = localize2("closeAllEditors", "Close All Editors");
let CloseAllEditorsAction = _CloseAllEditorsAction;
class CloseAllEditorGroupsAction extends AbstractCloseAllAction {
  constructor() {
    super({
      id: "workbench.action.closeAllGroups",
      title: localize2("closeAllGroups", "Close All Editor Groups"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyW)
      },
      category: Categories.View
    });
  }
  get excludeSticky() {
    return false;
  }
  async doCloseAll(editorGroupService) {
    await super.doCloseAll(editorGroupService);
    for (const groupToClose of this.groupsToClose(editorGroupService)) {
      if (groupToClose.count === 0) {
        editorGroupService.removeGroup(groupToClose);
      }
    }
  }
}
class CloseEditorsInOtherGroupsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.closeEditorsInOtherGroups",
      title: localize2("closeEditorsInOtherGroups", "Close Editors in Other Groups"),
      f1: true,
      category: Categories.View
    });
  }
  async run(accessor, context) {
    const editorGroupService = accessor.get(IEditorGroupsService);
    const groupToSkip = context ? editorGroupService.getGroup(context.groupId) : editorGroupService.activeGroup;
    await Promise.all(editorGroupService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE).map(async (group) => {
      if (groupToSkip && group.id === groupToSkip.id) {
        return;
      }
      return group.closeAllEditors({ excludeSticky: true });
    }));
  }
}
class CloseEditorInAllGroupsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.closeEditorInAllGroups",
      title: localize2("closeEditorInAllGroups", "Close Editor in All Groups"),
      f1: true,
      category: Categories.View
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const editorGroupService = accessor.get(IEditorGroupsService);
    const activeEditor = editorService.activeEditor;
    if (activeEditor) {
      await Promise.all(editorGroupService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE).map((group) => group.closeEditor(activeEditor)));
    }
  }
}
class AbstractMoveCopyGroupAction extends Action2 {
  constructor(desc, direction, isMove) {
    super(desc);
    this.direction = direction;
    this.isMove = isMove;
  }
  async run(accessor, context) {
    const editorGroupService = accessor.get(IEditorGroupsService);
    let sourceGroup;
    if (context && typeof context.groupId === "number") {
      sourceGroup = editorGroupService.getGroup(context.groupId);
    } else {
      sourceGroup = editorGroupService.activeGroup;
    }
    if (sourceGroup) {
      let resultGroup = void 0;
      if (this.isMove) {
        const targetGroup = this.findTargetGroup(editorGroupService, sourceGroup);
        if (targetGroup) {
          resultGroup = editorGroupService.moveGroup(sourceGroup, targetGroup, this.direction);
        }
      } else {
        resultGroup = editorGroupService.copyGroup(sourceGroup, sourceGroup, this.direction);
      }
      if (resultGroup) {
        editorGroupService.activateGroup(resultGroup);
      }
    }
  }
  findTargetGroup(editorGroupService, sourceGroup) {
    const targetNeighbours = [this.direction];
    switch (this.direction) {
      case GroupDirection.LEFT:
      case GroupDirection.RIGHT:
        targetNeighbours.push(GroupDirection.UP, GroupDirection.DOWN);
        break;
      case GroupDirection.UP:
      case GroupDirection.DOWN:
        targetNeighbours.push(GroupDirection.LEFT, GroupDirection.RIGHT);
        break;
    }
    for (const targetNeighbour of targetNeighbours) {
      const targetNeighbourGroup = editorGroupService.findGroup({ direction: targetNeighbour }, sourceGroup);
      if (targetNeighbourGroup) {
        return targetNeighbourGroup;
      }
    }
    return void 0;
  }
}
class AbstractMoveGroupAction extends AbstractMoveCopyGroupAction {
  constructor(desc, direction) {
    super(desc, direction, true);
  }
}
class MoveGroupLeftAction extends AbstractMoveGroupAction {
  constructor() {
    super({
      id: "workbench.action.moveActiveEditorGroupLeft",
      title: localize2("moveActiveGroupLeft", "Move Editor Group Left"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.LeftArrow)
      },
      category: Categories.View
    }, GroupDirection.LEFT);
  }
}
class MoveGroupRightAction extends AbstractMoveGroupAction {
  constructor() {
    super({
      id: "workbench.action.moveActiveEditorGroupRight",
      title: localize2("moveActiveGroupRight", "Move Editor Group Right"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.RightArrow)
      },
      category: Categories.View
    }, GroupDirection.RIGHT);
  }
}
class MoveGroupUpAction extends AbstractMoveGroupAction {
  constructor() {
    super({
      id: "workbench.action.moveActiveEditorGroupUp",
      title: localize2("moveActiveGroupUp", "Move Editor Group Up"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.UpArrow)
      },
      category: Categories.View
    }, GroupDirection.UP);
  }
}
class MoveGroupDownAction extends AbstractMoveGroupAction {
  constructor() {
    super({
      id: "workbench.action.moveActiveEditorGroupDown",
      title: localize2("moveActiveGroupDown", "Move Editor Group Down"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.DownArrow)
      },
      category: Categories.View
    }, GroupDirection.DOWN);
  }
}
class AbstractDuplicateGroupAction extends AbstractMoveCopyGroupAction {
  constructor(desc, direction) {
    super(desc, direction, false);
  }
}
class DuplicateGroupLeftAction extends AbstractDuplicateGroupAction {
  constructor() {
    super({
      id: "workbench.action.duplicateActiveEditorGroupLeft",
      title: localize2("duplicateActiveGroupLeft", "Duplicate Editor Group Left"),
      f1: true,
      category: Categories.View
    }, GroupDirection.LEFT);
  }
}
class DuplicateGroupRightAction extends AbstractDuplicateGroupAction {
  constructor() {
    super({
      id: "workbench.action.duplicateActiveEditorGroupRight",
      title: localize2("duplicateActiveGroupRight", "Duplicate Editor Group Right"),
      f1: true,
      category: Categories.View
    }, GroupDirection.RIGHT);
  }
}
class DuplicateGroupUpAction extends AbstractDuplicateGroupAction {
  constructor() {
    super({
      id: "workbench.action.duplicateActiveEditorGroupUp",
      title: localize2("duplicateActiveGroupUp", "Duplicate Editor Group Up"),
      f1: true,
      category: Categories.View
    }, GroupDirection.UP);
  }
}
class DuplicateGroupDownAction extends AbstractDuplicateGroupAction {
  constructor() {
    super({
      id: "workbench.action.duplicateActiveEditorGroupDown",
      title: localize2("duplicateActiveGroupDown", "Duplicate Editor Group Down"),
      f1: true,
      category: Categories.View
    }, GroupDirection.DOWN);
  }
}
class MinimizeOtherGroupsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.minimizeOtherEditors",
      title: localize2("minimizeOtherEditorGroups", "Expand Editor Group"),
      f1: true,
      category: Categories.View,
      precondition: MultipleEditorGroupsContext
    });
  }
  async run(accessor) {
    const editorGroupService = accessor.get(IEditorGroupsService);
    editorGroupService.arrangeGroups(GroupsArrangement.EXPAND);
  }
}
class MinimizeOtherGroupsHideSidebarAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.minimizeOtherEditorsHideSidebar",
      title: localize2("minimizeOtherEditorGroupsHideSidebar", "Expand Editor Group and Hide Side Bars"),
      f1: true,
      category: Categories.View,
      precondition: ContextKeyExpr.or(MultipleEditorGroupsContext, SideBarVisibleContext, AuxiliaryBarVisibleContext)
    });
  }
  async run(accessor) {
    const editorGroupService = accessor.get(IEditorGroupsService);
    const layoutService = accessor.get(IWorkbenchLayoutService);
    layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
    layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
    editorGroupService.arrangeGroups(GroupsArrangement.EXPAND);
  }
}
class ResetGroupSizesAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.evenEditorWidths",
      title: localize2("evenEditorGroups", "Reset Editor Group Sizes"),
      f1: true,
      category: Categories.View
    });
  }
  async run(accessor) {
    const editorGroupService = accessor.get(IEditorGroupsService);
    editorGroupService.arrangeGroups(GroupsArrangement.EVEN);
  }
}
class ToggleGroupSizesAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.toggleEditorWidths",
      title: localize2("toggleEditorWidths", "Toggle Editor Group Sizes"),
      f1: true,
      category: Categories.View
    });
  }
  async run(accessor) {
    const editorGroupService = accessor.get(IEditorGroupsService);
    editorGroupService.toggleExpandGroup();
  }
}
class MaximizeGroupHideSidebarAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.maximizeEditorHideSidebar",
      title: localize2("maximizeEditorHideSidebar", "Maximize Editor Group and Hide Side Bars"),
      f1: true,
      category: Categories.View,
      precondition: ContextKeyExpr.or(ContextKeyExpr.and(EditorPartMaximizedEditorGroupContext.negate(), EditorPartMultipleEditorGroupsContext), SideBarVisibleContext, AuxiliaryBarVisibleContext)
    });
  }
  async run(accessor) {
    const layoutService = accessor.get(IWorkbenchLayoutService);
    const editorGroupService = accessor.get(IEditorGroupsService);
    const editorService = accessor.get(IEditorService);
    if (editorService.activeEditor) {
      layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
      layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
      editorGroupService.arrangeGroups(GroupsArrangement.MAXIMIZE);
    }
  }
}
class ToggleMaximizeEditorGroupAction extends Action2 {
  constructor() {
    super({
      id: TOGGLE_MAXIMIZE_EDITOR_GROUP,
      title: localize2("toggleMaximizeEditorGroup", "Toggle Maximize Editor Group"),
      f1: true,
      category: Categories.View,
      precondition: ContextKeyExpr.or(EditorPartMultipleEditorGroupsContext, EditorPartMaximizedEditorGroupContext),
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyM)
      },
      menu: [
        {
          id: MenuId.EditorTitle,
          order: -1e4,
          // towards the front
          group: "navigation",
          when: EditorPartMaximizedEditorGroupContext
        },
        {
          id: MenuId.EmptyEditorGroup,
          order: -1e4,
          // towards the front
          group: "navigation",
          when: EditorPartMaximizedEditorGroupContext
        }
      ],
      icon: Codicon.screenFull,
      toggled: {
        condition: EditorPartMaximizedEditorGroupContext,
        title: localize("unmaximizeGroup", "Unmaximize Group")
      }
    });
  }
  async run(accessor, ...args) {
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const editorService = accessor.get(IEditorService);
    const listService = accessor.get(IListService);
    const resolvedContext = resolveCommandsContext(args, editorService, editorGroupsService, listService);
    if (resolvedContext.groupedEditors.length) {
      editorGroupsService.toggleMaximizeGroup(resolvedContext.groupedEditors[0].group);
    }
  }
}
class AbstractNavigateEditorAction extends Action2 {
  async run(accessor) {
    const editorGroupService = accessor.get(IEditorGroupsService);
    const result = this.navigate(editorGroupService);
    if (!result) {
      return;
    }
    const { groupId, editor } = result;
    if (!editor) {
      return;
    }
    const group = editorGroupService.getGroup(groupId);
    if (group) {
      await group.openEditor(editor);
    }
  }
}
class OpenNextEditor extends AbstractNavigateEditorAction {
  constructor() {
    super({
      id: "workbench.action.nextEditor",
      title: localize2("openNextEditor", "Open Next Editor"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.PageDown,
        mac: {
          primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.RightArrow,
          secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketRight]
        }
      },
      category: Categories.View
    });
  }
  navigate(editorGroupService) {
    const activeGroup = editorGroupService.activeGroup;
    const activeGroupEditors = activeGroup.getEditors(EditorsOrder.SEQUENTIAL);
    const activeEditorIndex = activeGroup.activeEditor ? activeGroupEditors.indexOf(activeGroup.activeEditor) : -1;
    if (activeEditorIndex + 1 < activeGroupEditors.length) {
      return { editor: activeGroupEditors[activeEditorIndex + 1], groupId: activeGroup.id };
    }
    const handledGroups = /* @__PURE__ */ new Set();
    let currentGroup = editorGroupService.activeGroup;
    while (currentGroup && !handledGroups.has(currentGroup.id)) {
      currentGroup = editorGroupService.findGroup({ location: GroupLocation.NEXT }, currentGroup, true);
      if (currentGroup) {
        handledGroups.add(currentGroup.id);
        const groupEditors = currentGroup.getEditors(EditorsOrder.SEQUENTIAL);
        if (groupEditors.length > 0) {
          return { editor: groupEditors[0], groupId: currentGroup.id };
        }
      }
    }
    return void 0;
  }
}
class OpenPreviousEditor extends AbstractNavigateEditorAction {
  constructor() {
    super({
      id: "workbench.action.previousEditor",
      title: localize2("openPreviousEditor", "Open Previous Editor"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.PageUp,
        mac: {
          primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.LeftArrow,
          secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketLeft]
        }
      },
      category: Categories.View
    });
  }
  navigate(editorGroupService) {
    const activeGroup = editorGroupService.activeGroup;
    const activeGroupEditors = activeGroup.getEditors(EditorsOrder.SEQUENTIAL);
    const activeEditorIndex = activeGroup.activeEditor ? activeGroupEditors.indexOf(activeGroup.activeEditor) : -1;
    if (activeEditorIndex > 0) {
      return { editor: activeGroupEditors[activeEditorIndex - 1], groupId: activeGroup.id };
    }
    const handledGroups = /* @__PURE__ */ new Set();
    let currentGroup = editorGroupService.activeGroup;
    while (currentGroup && !handledGroups.has(currentGroup.id)) {
      currentGroup = editorGroupService.findGroup({ location: GroupLocation.PREVIOUS }, currentGroup, true);
      if (currentGroup) {
        handledGroups.add(currentGroup.id);
        const groupEditors = currentGroup.getEditors(EditorsOrder.SEQUENTIAL);
        if (groupEditors.length > 0) {
          return { editor: groupEditors[groupEditors.length - 1], groupId: currentGroup.id };
        }
      }
    }
    return void 0;
  }
}
class OpenNextEditorInGroup extends AbstractNavigateEditorAction {
  constructor() {
    super({
      id: "workbench.action.nextEditorInGroup",
      title: localize2("nextEditorInGroup", "Open Next Editor in Group"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.PageDown),
        mac: {
          primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.RightArrow)
        }
      },
      category: Categories.View
    });
  }
  navigate(editorGroupService) {
    const group = editorGroupService.activeGroup;
    const editors = group.getEditors(EditorsOrder.SEQUENTIAL);
    const index = group.activeEditor ? editors.indexOf(group.activeEditor) : -1;
    return { editor: index + 1 < editors.length ? editors[index + 1] : editors[0], groupId: group.id };
  }
}
class OpenPreviousEditorInGroup extends AbstractNavigateEditorAction {
  constructor() {
    super({
      id: "workbench.action.previousEditorInGroup",
      title: localize2("openPreviousEditorInGroup", "Open Previous Editor in Group"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.PageUp),
        mac: {
          primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.LeftArrow)
        }
      },
      category: Categories.View
    });
  }
  navigate(editorGroupService) {
    const group = editorGroupService.activeGroup;
    const editors = group.getEditors(EditorsOrder.SEQUENTIAL);
    const index = group.activeEditor ? editors.indexOf(group.activeEditor) : -1;
    return { editor: index > 0 ? editors[index - 1] : editors[editors.length - 1], groupId: group.id };
  }
}
class OpenFirstEditorInGroup extends AbstractNavigateEditorAction {
  constructor() {
    super({
      id: "workbench.action.firstEditorInGroup",
      title: localize2("firstEditorInGroup", "Open First Editor in Group"),
      f1: true,
      category: Categories.View
    });
  }
  navigate(editorGroupService) {
    const group = editorGroupService.activeGroup;
    const editors = group.getEditors(EditorsOrder.SEQUENTIAL);
    return { editor: editors[0], groupId: group.id };
  }
}
class OpenLastEditorInGroup extends AbstractNavigateEditorAction {
  constructor() {
    super({
      id: "workbench.action.lastEditorInGroup",
      title: localize2("lastEditorInGroup", "Open Last Editor in Group"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.Alt | KeyCode.Digit0,
        secondary: [KeyMod.CtrlCmd | KeyCode.Digit9],
        mac: {
          primary: KeyMod.WinCtrl | KeyCode.Digit0,
          secondary: [KeyMod.CtrlCmd | KeyCode.Digit9]
        }
      },
      category: Categories.View
    });
  }
  navigate(editorGroupService) {
    const group = editorGroupService.activeGroup;
    const editors = group.getEditors(EditorsOrder.SEQUENTIAL);
    return { editor: editors[editors.length - 1], groupId: group.id };
  }
}
const _NavigateForwardAction = class _NavigateForwardAction extends Action2 {
  constructor() {
    super({
      id: _NavigateForwardAction.ID,
      title: {
        ...localize2("navigateForward", "Go Forward"),
        mnemonicTitle: localize({ key: "miForward", comment: ["&& denotes a mnemonic"] }, "&&Forward")
      },
      f1: true,
      icon: Codicon.arrowRight,
      precondition: ContextKeyExpr.has("canNavigateForward"),
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        win: { primary: KeyMod.Alt | KeyCode.RightArrow, secondary: [KeyCode.BrowserForward] },
        mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Minus, secondary: [KeyCode.BrowserForward] },
        linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Minus, secondary: [KeyCode.BrowserForward] }
      },
      menu: [
        { id: MenuId.MenubarGoMenu, group: "1_history_nav", order: 2 },
        { id: MenuId.CommandCenter, order: 2, when: ContextKeyExpr.has("config.workbench.navigationControl.enabled") }
      ]
    });
  }
  async run(accessor) {
    const historyService = accessor.get(IHistoryService);
    await historyService.goForward(GoFilter.NONE);
  }
};
_NavigateForwardAction.ID = "workbench.action.navigateForward";
_NavigateForwardAction.LABEL = localize("navigateForward", "Go Forward");
let NavigateForwardAction = _NavigateForwardAction;
const _NavigateBackwardsAction = class _NavigateBackwardsAction extends Action2 {
  constructor() {
    super({
      id: _NavigateBackwardsAction.ID,
      title: {
        ...localize2("navigateBack", "Go Back"),
        mnemonicTitle: localize({ key: "miBack", comment: ["&& denotes a mnemonic"] }, "&&Back")
      },
      f1: true,
      precondition: ContextKeyExpr.has("canNavigateBack"),
      icon: Codicon.arrowLeft,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        win: { primary: KeyMod.Alt | KeyCode.LeftArrow, secondary: [KeyCode.BrowserBack] },
        mac: { primary: KeyMod.WinCtrl | KeyCode.Minus, secondary: [KeyCode.BrowserBack] },
        linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Minus, secondary: [KeyCode.BrowserBack] }
      },
      menu: [
        { id: MenuId.MenubarGoMenu, group: "1_history_nav", order: 1 },
        { id: MenuId.CommandCenter, order: 1, when: ContextKeyExpr.has("config.workbench.navigationControl.enabled") }
      ]
    });
  }
  async run(accessor) {
    const historyService = accessor.get(IHistoryService);
    await historyService.goBack(GoFilter.NONE);
  }
};
_NavigateBackwardsAction.ID = "workbench.action.navigateBack";
_NavigateBackwardsAction.LABEL = localize("navigateBack", "Go Back");
let NavigateBackwardsAction = _NavigateBackwardsAction;
class NavigatePreviousAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.navigateLast",
      title: localize2("navigatePrevious", "Go Previous"),
      f1: true
    });
  }
  async run(accessor) {
    const historyService = accessor.get(IHistoryService);
    await historyService.goPrevious(GoFilter.NONE);
  }
}
class NavigateForwardInEditsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.navigateForwardInEditLocations",
      title: localize2("navigateForwardInEdits", "Go Forward in Edit Locations"),
      f1: true
    });
  }
  async run(accessor) {
    const historyService = accessor.get(IHistoryService);
    await historyService.goForward(GoFilter.EDITS);
  }
}
class NavigateBackwardsInEditsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.navigateBackInEditLocations",
      title: localize2("navigateBackInEdits", "Go Back in Edit Locations"),
      f1: true
    });
  }
  async run(accessor) {
    const historyService = accessor.get(IHistoryService);
    await historyService.goBack(GoFilter.EDITS);
  }
}
class NavigatePreviousInEditsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.navigatePreviousInEditLocations",
      title: localize2("navigatePreviousInEdits", "Go Previous in Edit Locations"),
      f1: true
    });
  }
  async run(accessor) {
    const historyService = accessor.get(IHistoryService);
    await historyService.goPrevious(GoFilter.EDITS);
  }
}
class NavigateToLastEditLocationAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.navigateToLastEditLocation",
      title: localize2("navigateToLastEditLocation", "Go to Last Edit Location"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyQ)
      }
    });
  }
  async run(accessor) {
    const historyService = accessor.get(IHistoryService);
    await historyService.goLast(GoFilter.EDITS);
  }
}
class NavigateForwardInNavigationsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.navigateForwardInNavigationLocations",
      title: localize2("navigateForwardInNavigations", "Go Forward in Navigation Locations"),
      f1: true
    });
  }
  async run(accessor) {
    const historyService = accessor.get(IHistoryService);
    await historyService.goForward(GoFilter.NAVIGATION);
  }
}
class NavigateBackwardsInNavigationsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.navigateBackInNavigationLocations",
      title: localize2("navigateBackInNavigations", "Go Back in Navigation Locations"),
      f1: true
    });
  }
  async run(accessor) {
    const historyService = accessor.get(IHistoryService);
    await historyService.goBack(GoFilter.NAVIGATION);
  }
}
class NavigatePreviousInNavigationsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.navigatePreviousInNavigationLocations",
      title: localize2("navigatePreviousInNavigationLocations", "Go Previous in Navigation Locations"),
      f1: true
    });
  }
  async run(accessor) {
    const historyService = accessor.get(IHistoryService);
    await historyService.goPrevious(GoFilter.NAVIGATION);
  }
}
class NavigateToLastNavigationLocationAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.navigateToLastNavigationLocation",
      title: localize2("navigateToLastNavigationLocation", "Go to Last Navigation Location"),
      f1: true
    });
  }
  async run(accessor) {
    const historyService = accessor.get(IHistoryService);
    await historyService.goLast(GoFilter.NAVIGATION);
  }
}
const _ReopenClosedEditorAction = class _ReopenClosedEditorAction extends Action2 {
  constructor() {
    super({
      id: _ReopenClosedEditorAction.ID,
      title: localize2("reopenClosedEditor", "Reopen Closed Editor"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyT
      },
      category: Categories.View
    });
  }
  async run(accessor) {
    const historyService = accessor.get(IHistoryService);
    await historyService.reopenLastClosedEditor();
  }
};
_ReopenClosedEditorAction.ID = "workbench.action.reopenClosedEditor";
let ReopenClosedEditorAction = _ReopenClosedEditorAction;
const _ClearRecentFilesAction = class _ClearRecentFilesAction extends Action2 {
  constructor() {
    super({
      id: _ClearRecentFilesAction.ID,
      title: localize2("clearRecentFiles", "Clear Recently Opened..."),
      f1: true,
      category: Categories.File
    });
  }
  async run(accessor) {
    const dialogService = accessor.get(IDialogService);
    const workspacesService = accessor.get(IWorkspacesService);
    const historyService = accessor.get(IHistoryService);
    const { confirmed } = await dialogService.confirm({
      type: "warning",
      message: localize("confirmClearRecentsMessage", "Do you want to clear all recently opened files and workspaces?"),
      detail: localize("confirmClearDetail", "This action is irreversible!"),
      primaryButton: localize({ key: "clearButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Clear")
    });
    if (!confirmed) {
      return;
    }
    workspacesService.clearRecentlyOpened();
    historyService.clearRecentlyOpened();
  }
};
_ClearRecentFilesAction.ID = "workbench.action.clearRecentFiles";
let ClearRecentFilesAction = _ClearRecentFilesAction;
const _ShowEditorsInActiveGroupByMostRecentlyUsedAction = class _ShowEditorsInActiveGroupByMostRecentlyUsedAction extends Action2 {
  constructor() {
    super({
      id: _ShowEditorsInActiveGroupByMostRecentlyUsedAction.ID,
      title: localize2("showEditorsInActiveGroup", "Show Editors in Active Group By Most Recently Used"),
      f1: true,
      category: Categories.View
    });
  }
  async run(accessor) {
    const quickInputService = accessor.get(IQuickInputService);
    quickInputService.quickAccess.show(ActiveGroupEditorsByMostRecentlyUsedQuickAccess.PREFIX);
  }
};
_ShowEditorsInActiveGroupByMostRecentlyUsedAction.ID = "workbench.action.showEditorsInActiveGroup";
let ShowEditorsInActiveGroupByMostRecentlyUsedAction = _ShowEditorsInActiveGroupByMostRecentlyUsedAction;
const _ShowAllEditorsByAppearanceAction = class _ShowAllEditorsByAppearanceAction extends Action2 {
  constructor() {
    super({
      id: _ShowAllEditorsByAppearanceAction.ID,
      title: localize2("showAllEditors", "Show All Editors By Appearance"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyP),
        mac: {
          primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Tab
        }
      },
      category: Categories.File
    });
  }
  async run(accessor) {
    const quickInputService = accessor.get(IQuickInputService);
    quickInputService.quickAccess.show(AllEditorsByAppearanceQuickAccess.PREFIX);
  }
};
_ShowAllEditorsByAppearanceAction.ID = "workbench.action.showAllEditors";
let ShowAllEditorsByAppearanceAction = _ShowAllEditorsByAppearanceAction;
const _ShowAllEditorsByMostRecentlyUsedAction = class _ShowAllEditorsByMostRecentlyUsedAction extends Action2 {
  constructor() {
    super({
      id: _ShowAllEditorsByMostRecentlyUsedAction.ID,
      title: localize2("showAllEditorsByMostRecentlyUsed", "Show All Editors By Most Recently Used"),
      f1: true,
      category: Categories.View
    });
  }
  async run(accessor) {
    const quickInputService = accessor.get(IQuickInputService);
    quickInputService.quickAccess.show(AllEditorsByMostRecentlyUsedQuickAccess.PREFIX);
  }
};
_ShowAllEditorsByMostRecentlyUsedAction.ID = "workbench.action.showAllEditorsByMostRecentlyUsed";
let ShowAllEditorsByMostRecentlyUsedAction = _ShowAllEditorsByMostRecentlyUsedAction;
class AbstractQuickAccessEditorAction extends Action2 {
  constructor(desc, prefix, itemActivation) {
    super(desc);
    this.prefix = prefix;
    this.itemActivation = itemActivation;
  }
  async run(accessor) {
    const keybindingService = accessor.get(IKeybindingService);
    const quickInputService = accessor.get(IQuickInputService);
    const keybindings = keybindingService.lookupKeybindings(this.desc.id);
    quickInputService.quickAccess.show(this.prefix, {
      quickNavigateConfiguration: { keybindings },
      itemActivation: this.itemActivation
    });
  }
}
class QuickAccessPreviousRecentlyUsedEditorAction extends AbstractQuickAccessEditorAction {
  constructor() {
    super({
      id: "workbench.action.quickOpenPreviousRecentlyUsedEditor",
      title: localize2("quickOpenPreviousRecentlyUsedEditor", "Quick Open Previous Recently Used Editor"),
      f1: true,
      category: Categories.View
    }, AllEditorsByMostRecentlyUsedQuickAccess.PREFIX, void 0);
  }
}
class QuickAccessLeastRecentlyUsedEditorAction extends AbstractQuickAccessEditorAction {
  constructor() {
    super({
      id: "workbench.action.quickOpenLeastRecentlyUsedEditor",
      title: localize2("quickOpenLeastRecentlyUsedEditor", "Quick Open Least Recently Used Editor"),
      f1: true,
      category: Categories.View
    }, AllEditorsByMostRecentlyUsedQuickAccess.PREFIX, void 0);
  }
}
class QuickAccessPreviousRecentlyUsedEditorInGroupAction extends AbstractQuickAccessEditorAction {
  constructor() {
    super({
      id: "workbench.action.quickOpenPreviousRecentlyUsedEditorInGroup",
      title: localize2("quickOpenPreviousRecentlyUsedEditorInGroup", "Quick Open Previous Recently Used Editor in Group"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.Tab,
        mac: {
          primary: KeyMod.WinCtrl | KeyCode.Tab
        }
      },
      precondition: ActiveEditorGroupEmptyContext.toNegated(),
      category: Categories.View
    }, ActiveGroupEditorsByMostRecentlyUsedQuickAccess.PREFIX, void 0);
  }
}
class QuickAccessLeastRecentlyUsedEditorInGroupAction extends AbstractQuickAccessEditorAction {
  constructor() {
    super({
      id: "workbench.action.quickOpenLeastRecentlyUsedEditorInGroup",
      title: localize2("quickOpenLeastRecentlyUsedEditorInGroup", "Quick Open Least Recently Used Editor in Group"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab,
        mac: {
          primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Tab
        }
      },
      precondition: ActiveEditorGroupEmptyContext.toNegated(),
      category: Categories.View
    }, ActiveGroupEditorsByMostRecentlyUsedQuickAccess.PREFIX, ItemActivation.LAST);
  }
}
const _QuickAccessPreviousEditorFromHistoryAction = class _QuickAccessPreviousEditorFromHistoryAction extends Action2 {
  constructor() {
    super({
      id: _QuickAccessPreviousEditorFromHistoryAction.ID,
      title: localize2("navigateEditorHistoryByInput", "Quick Open Previous Editor from History"),
      f1: true
    });
  }
  async run(accessor) {
    const keybindingService = accessor.get(IKeybindingService);
    const quickInputService = accessor.get(IQuickInputService);
    const editorGroupService = accessor.get(IEditorGroupsService);
    const keybindings = keybindingService.lookupKeybindings(_QuickAccessPreviousEditorFromHistoryAction.ID);
    let itemActivation = void 0;
    if (editorGroupService.activeGroup.count === 0) {
      itemActivation = ItemActivation.FIRST;
    }
    quickInputService.quickAccess.show("", { quickNavigateConfiguration: { keybindings }, itemActivation });
  }
};
_QuickAccessPreviousEditorFromHistoryAction.ID = "workbench.action.openPreviousEditorFromHistory";
let QuickAccessPreviousEditorFromHistoryAction = _QuickAccessPreviousEditorFromHistoryAction;
class OpenNextRecentlyUsedEditorAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.openNextRecentlyUsedEditor",
      title: localize2("openNextRecentlyUsedEditor", "Open Next Recently Used Editor"),
      f1: true,
      category: Categories.View
    });
  }
  async run(accessor) {
    const historyService = accessor.get(IHistoryService);
    historyService.openNextRecentlyUsedEditor();
  }
}
class OpenPreviousRecentlyUsedEditorAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.openPreviousRecentlyUsedEditor",
      title: localize2("openPreviousRecentlyUsedEditor", "Open Previous Recently Used Editor"),
      f1: true,
      category: Categories.View
    });
  }
  async run(accessor) {
    const historyService = accessor.get(IHistoryService);
    historyService.openPreviouslyUsedEditor();
  }
}
class OpenNextRecentlyUsedEditorInGroupAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.openNextRecentlyUsedEditorInGroup",
      title: localize2("openNextRecentlyUsedEditorInGroup", "Open Next Recently Used Editor In Group"),
      f1: true,
      category: Categories.View
    });
  }
  async run(accessor) {
    const historyService = accessor.get(IHistoryService);
    const editorGroupsService = accessor.get(IEditorGroupsService);
    historyService.openNextRecentlyUsedEditor(editorGroupsService.activeGroup.id);
  }
}
class OpenPreviousRecentlyUsedEditorInGroupAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.openPreviousRecentlyUsedEditorInGroup",
      title: localize2("openPreviousRecentlyUsedEditorInGroup", "Open Previous Recently Used Editor In Group"),
      f1: true,
      category: Categories.View
    });
  }
  async run(accessor) {
    const historyService = accessor.get(IHistoryService);
    const editorGroupsService = accessor.get(IEditorGroupsService);
    historyService.openPreviouslyUsedEditor(editorGroupsService.activeGroup.id);
  }
}
class ClearEditorHistoryWithoutConfirmAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.clearEditorHistoryWithoutConfirm",
      title: localize2("clearEditorHistoryWithoutConfirm", "Clear Editor History without Confirmation"),
      f1: true,
      precondition: InAutomationContext
    });
  }
  async run(accessor) {
    const historyService = accessor.get(IHistoryService);
    historyService.clear();
  }
}
class ClearEditorHistoryAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.clearEditorHistory",
      title: localize2("clearEditorHistory", "Clear Editor History"),
      f1: true
    });
  }
  async run(accessor) {
    const dialogService = accessor.get(IDialogService);
    const historyService = accessor.get(IHistoryService);
    const { confirmed } = await dialogService.confirm({
      type: "warning",
      message: localize("confirmClearEditorHistoryMessage", "Do you want to clear the history of recently opened editors?"),
      detail: localize("confirmClearDetail", "This action is irreversible!"),
      primaryButton: localize({ key: "clearButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Clear")
    });
    if (!confirmed) {
      return;
    }
    historyService.clear();
  }
}
class MoveEditorLeftInGroupAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: "workbench.action.moveEditorLeftInGroup",
      title: localize2("moveEditorLeft", "Move Editor Left"),
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.PageUp,
        mac: {
          primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.LeftArrow)
        }
      },
      f1: true,
      category: Categories.View
    }, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: "left" });
  }
}
class MoveEditorRightInGroupAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: "workbench.action.moveEditorRightInGroup",
      title: localize2("moveEditorRight", "Move Editor Right"),
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.PageDown,
        mac: {
          primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.RightArrow)
        }
      },
      f1: true,
      category: Categories.View
    }, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: "right" });
  }
}
class MoveEditorToStartAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: "workbench.action.moveEditorToStart",
      title: localize2("moveEditorToStart", "Move Editor to Start"),
      f1: true,
      category: Categories.View
    }, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: "first" });
  }
}
class MoveEditorToEndAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: "workbench.action.moveEditorToEnd",
      title: localize2("moveEditorToEnd", "Move Editor to End"),
      f1: true,
      category: Categories.View
    }, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: "last" });
  }
}
class MoveEditorToPreviousGroupAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: "workbench.action.moveEditorToPreviousGroup",
      title: localize2("moveEditorToPreviousGroup", "Move Editor into Previous Group"),
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.LeftArrow,
        mac: {
          primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.LeftArrow
        }
      },
      f1: true,
      category: Categories.View
    }, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: "previous", by: "group" });
  }
}
class MoveEditorToNextGroupAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: "workbench.action.moveEditorToNextGroup",
      title: localize2("moveEditorToNextGroup", "Move Editor into Next Group"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.RightArrow,
        mac: {
          primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.RightArrow
        }
      },
      category: Categories.View
    }, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: "next", by: "group" });
  }
}
class MoveEditorToAboveGroupAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: MOVE_EDITOR_INTO_ABOVE_GROUP,
      title: localize2("moveEditorToAboveGroup", "Move Editor into Group Above"),
      f1: true,
      category: Categories.View
    }, MOVE_EDITOR_INTO_ABOVE_GROUP);
  }
}
class MoveEditorToBelowGroupAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: MOVE_EDITOR_INTO_BELOW_GROUP,
      title: localize2("moveEditorToBelowGroup", "Move Editor into Group Below"),
      f1: true,
      category: Categories.View
    }, MOVE_EDITOR_INTO_BELOW_GROUP);
  }
}
class MoveEditorToLeftGroupAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: MOVE_EDITOR_INTO_LEFT_GROUP,
      title: localize2("moveEditorToLeftGroup", "Move Editor into Left Group"),
      f1: true,
      category: Categories.View
    }, MOVE_EDITOR_INTO_LEFT_GROUP);
  }
}
class MoveEditorToRightGroupAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: MOVE_EDITOR_INTO_RIGHT_GROUP,
      title: localize2("moveEditorToRightGroup", "Move Editor into Right Group"),
      f1: true,
      category: Categories.View
    }, MOVE_EDITOR_INTO_RIGHT_GROUP);
  }
}
class MoveEditorToFirstGroupAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: "workbench.action.moveEditorToFirstGroup",
      title: localize2("moveEditorToFirstGroup", "Move Editor into First Group"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.Shift | KeyMod.Alt | KeyCode.Digit1,
        mac: {
          primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.Digit1
        }
      },
      category: Categories.View
    }, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: "first", by: "group" });
  }
}
class MoveEditorToLastGroupAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: "workbench.action.moveEditorToLastGroup",
      title: localize2("moveEditorToLastGroup", "Move Editor into Last Group"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.Shift | KeyMod.Alt | KeyCode.Digit9,
        mac: {
          primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.Digit9
        }
      },
      category: Categories.View
    }, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: "last", by: "group" });
  }
}
class SplitEditorToPreviousGroupAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: "workbench.action.splitEditorToPreviousGroup",
      title: localize2("splitEditorToPreviousGroup", "Split Editor into Previous Group"),
      f1: true,
      category: Categories.View
    }, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: "previous", by: "group" });
  }
}
class SplitEditorToNextGroupAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: "workbench.action.splitEditorToNextGroup",
      title: localize2("splitEditorToNextGroup", "Split Editor into Next Group"),
      f1: true,
      category: Categories.View
    }, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: "next", by: "group" });
  }
}
class SplitEditorToAboveGroupAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: "workbench.action.splitEditorToAboveGroup",
      title: localize2("splitEditorToAboveGroup", "Split Editor into Group Above"),
      f1: true,
      category: Categories.View
    }, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: "up", by: "group" });
  }
}
class SplitEditorToBelowGroupAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: "workbench.action.splitEditorToBelowGroup",
      title: localize2("splitEditorToBelowGroup", "Split Editor into Group Below"),
      f1: true,
      category: Categories.View
    }, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: "down", by: "group" });
  }
}
class SplitEditorToLeftGroupAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: "workbench.action.splitEditorToLeftGroup",
      title: localize2("splitEditorToLeftGroup", "Split Editor into Left Group"),
      f1: true,
      category: Categories.View
    }, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: "left", by: "group" });
  }
}
SplitEditorToLeftGroupAction.ID = "workbench.action.splitEditorToLeftGroup";
SplitEditorToLeftGroupAction.LABEL = localize("splitEditorToLeftGroup", "Split Editor into Left Group");
class SplitEditorToRightGroupAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: "workbench.action.splitEditorToRightGroup",
      title: localize2("splitEditorToRightGroup", "Split Editor into Right Group"),
      f1: true,
      category: Categories.View
    }, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: "right", by: "group" });
  }
}
class SplitEditorToFirstGroupAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: "workbench.action.splitEditorToFirstGroup",
      title: localize2("splitEditorToFirstGroup", "Split Editor into First Group"),
      f1: true,
      category: Categories.View
    }, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: "first", by: "group" });
  }
}
class SplitEditorToLastGroupAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: "workbench.action.splitEditorToLastGroup",
      title: localize2("splitEditorToLastGroup", "Split Editor into Last Group"),
      f1: true,
      category: Categories.View
    }, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: "last", by: "group" });
  }
}
const _EditorLayoutSingleAction = class _EditorLayoutSingleAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: _EditorLayoutSingleAction.ID,
      title: localize2("editorLayoutSingle", "Single Column Editor Layout"),
      f1: true,
      category: Categories.View
    }, LAYOUT_EDITOR_GROUPS_COMMAND_ID, { groups: [{}], orientation: GroupOrientation.HORIZONTAL });
  }
};
_EditorLayoutSingleAction.ID = "workbench.action.editorLayoutSingle";
let EditorLayoutSingleAction = _EditorLayoutSingleAction;
const _EditorLayoutTwoColumnsAction = class _EditorLayoutTwoColumnsAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: _EditorLayoutTwoColumnsAction.ID,
      title: localize2("editorLayoutTwoColumns", "Two Columns Editor Layout"),
      f1: true,
      category: Categories.View
    }, LAYOUT_EDITOR_GROUPS_COMMAND_ID, { groups: [{}, {}], orientation: GroupOrientation.HORIZONTAL });
  }
};
_EditorLayoutTwoColumnsAction.ID = "workbench.action.editorLayoutTwoColumns";
let EditorLayoutTwoColumnsAction = _EditorLayoutTwoColumnsAction;
const _EditorLayoutThreeColumnsAction = class _EditorLayoutThreeColumnsAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: _EditorLayoutThreeColumnsAction.ID,
      title: localize2("editorLayoutThreeColumns", "Three Columns Editor Layout"),
      f1: true,
      category: Categories.View
    }, LAYOUT_EDITOR_GROUPS_COMMAND_ID, { groups: [{}, {}, {}], orientation: GroupOrientation.HORIZONTAL });
  }
};
_EditorLayoutThreeColumnsAction.ID = "workbench.action.editorLayoutThreeColumns";
let EditorLayoutThreeColumnsAction = _EditorLayoutThreeColumnsAction;
const _EditorLayoutTwoRowsAction = class _EditorLayoutTwoRowsAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: _EditorLayoutTwoRowsAction.ID,
      title: localize2("editorLayoutTwoRows", "Two Rows Editor Layout"),
      f1: true,
      category: Categories.View
    }, LAYOUT_EDITOR_GROUPS_COMMAND_ID, { groups: [{}, {}], orientation: GroupOrientation.VERTICAL });
  }
};
_EditorLayoutTwoRowsAction.ID = "workbench.action.editorLayoutTwoRows";
let EditorLayoutTwoRowsAction = _EditorLayoutTwoRowsAction;
const _EditorLayoutThreeRowsAction = class _EditorLayoutThreeRowsAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: _EditorLayoutThreeRowsAction.ID,
      title: localize2("editorLayoutThreeRows", "Three Rows Editor Layout"),
      f1: true,
      category: Categories.View
    }, LAYOUT_EDITOR_GROUPS_COMMAND_ID, { groups: [{}, {}, {}], orientation: GroupOrientation.VERTICAL });
  }
};
_EditorLayoutThreeRowsAction.ID = "workbench.action.editorLayoutThreeRows";
let EditorLayoutThreeRowsAction = _EditorLayoutThreeRowsAction;
const _EditorLayoutTwoByTwoGridAction = class _EditorLayoutTwoByTwoGridAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: _EditorLayoutTwoByTwoGridAction.ID,
      title: localize2("editorLayoutTwoByTwoGrid", "Grid Editor Layout (2x2)"),
      f1: true,
      category: Categories.View
    }, LAYOUT_EDITOR_GROUPS_COMMAND_ID, { groups: [{ groups: [{}, {}] }, { groups: [{}, {}] }], orientation: GroupOrientation.HORIZONTAL });
  }
};
_EditorLayoutTwoByTwoGridAction.ID = "workbench.action.editorLayoutTwoByTwoGrid";
let EditorLayoutTwoByTwoGridAction = _EditorLayoutTwoByTwoGridAction;
const _EditorLayoutTwoColumnsBottomAction = class _EditorLayoutTwoColumnsBottomAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: _EditorLayoutTwoColumnsBottomAction.ID,
      title: localize2("editorLayoutTwoColumnsBottom", "Two Columns Bottom Editor Layout"),
      f1: true,
      category: Categories.View
    }, LAYOUT_EDITOR_GROUPS_COMMAND_ID, { groups: [{}, { groups: [{}, {}] }], orientation: GroupOrientation.VERTICAL });
  }
};
_EditorLayoutTwoColumnsBottomAction.ID = "workbench.action.editorLayoutTwoColumnsBottom";
let EditorLayoutTwoColumnsBottomAction = _EditorLayoutTwoColumnsBottomAction;
const _EditorLayoutTwoRowsRightAction = class _EditorLayoutTwoRowsRightAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: _EditorLayoutTwoRowsRightAction.ID,
      title: localize2("editorLayoutTwoRowsRight", "Two Rows Right Editor Layout"),
      f1: true,
      category: Categories.View
    }, LAYOUT_EDITOR_GROUPS_COMMAND_ID, { groups: [{}, { groups: [{}, {}] }], orientation: GroupOrientation.HORIZONTAL });
  }
};
_EditorLayoutTwoRowsRightAction.ID = "workbench.action.editorLayoutTwoRowsRight";
let EditorLayoutTwoRowsRightAction = _EditorLayoutTwoRowsRightAction;
class AbstractCreateEditorGroupAction extends Action2 {
  constructor(desc, direction) {
    super(desc);
    this.direction = direction;
  }
  async run(accessor) {
    const editorGroupService = accessor.get(IEditorGroupsService);
    const layoutService = accessor.get(IWorkbenchLayoutService);
    const activeDocument = getActiveDocument();
    const focusNewGroup = layoutService.hasFocus(Parts.EDITOR_PART) || activeDocument.activeElement === activeDocument.body;
    const group = editorGroupService.addGroup(editorGroupService.activeGroup, this.direction);
    editorGroupService.activateGroup(group);
    if (focusNewGroup) {
      group.focus();
    }
  }
}
class NewEditorGroupLeftAction extends AbstractCreateEditorGroupAction {
  constructor() {
    super({
      id: "workbench.action.newGroupLeft",
      title: localize2("newGroupLeft", "New Editor Group to the Left"),
      f1: true,
      category: Categories.View
    }, GroupDirection.LEFT);
  }
}
class NewEditorGroupRightAction extends AbstractCreateEditorGroupAction {
  constructor() {
    super({
      id: "workbench.action.newGroupRight",
      title: localize2("newGroupRight", "New Editor Group to the Right"),
      f1: true,
      category: Categories.View
    }, GroupDirection.RIGHT);
  }
}
class NewEditorGroupAboveAction extends AbstractCreateEditorGroupAction {
  constructor() {
    super({
      id: "workbench.action.newGroupAbove",
      title: localize2("newGroupAbove", "New Editor Group Above"),
      f1: true,
      category: Categories.View
    }, GroupDirection.UP);
  }
}
class NewEditorGroupBelowAction extends AbstractCreateEditorGroupAction {
  constructor() {
    super({
      id: "workbench.action.newGroupBelow",
      title: localize2("newGroupBelow", "New Editor Group Below"),
      f1: true,
      category: Categories.View
    }, GroupDirection.DOWN);
  }
}
class ToggleEditorTypeAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.toggleEditorType",
      title: localize2("toggleEditorType", "Toggle Editor Type"),
      f1: true,
      category: Categories.View,
      precondition: ActiveEditorAvailableEditorIdsContext
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const editorResolverService = accessor.get(IEditorResolverService);
    const activeEditorPane = editorService.activeEditorPane;
    if (!activeEditorPane) {
      return;
    }
    const activeEditorResource = EditorResourceAccessor.getCanonicalUri(activeEditorPane.input);
    if (!activeEditorResource) {
      return;
    }
    const editorIds = editorResolverService.getEditors(activeEditorResource).map((editor) => editor.id).filter((id) => id !== activeEditorPane.input.editorId);
    if (editorIds.length === 0) {
      return;
    }
    await editorService.replaceEditors([
      {
        editor: activeEditorPane.input,
        replacement: {
          resource: activeEditorResource,
          options: {
            override: editorIds[0]
          }
        }
      }
    ], activeEditorPane.group);
  }
}
const _ReOpenInTextEditorAction = class _ReOpenInTextEditorAction extends ExecuteCommandAction {
  constructor() {
    super({
      id: _ReOpenInTextEditorAction.ID,
      title: _ReOpenInTextEditorAction.TITLE,
      f1: true,
      category: Categories.View,
      precondition: ActiveEditorAvailableEditorIdsContext
    }, REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID, "default");
  }
};
_ReOpenInTextEditorAction.ID = "workbench.action.reopenTextEditor";
_ReOpenInTextEditorAction.TITLE = localize2("reopenTextEditor", "Reopen Editor with Text Editor");
let ReOpenInTextEditorAction = _ReOpenInTextEditorAction;
class BaseMoveCopyEditorToNewWindowAction extends Action2 {
  constructor(id, title, keybinding, move) {
    super({
      id,
      title,
      category: Categories.View,
      precondition: ActiveEditorContext,
      keybinding,
      f1: true
    });
    this.move = move;
  }
  async run(accessor, ...args) {
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const editorService = accessor.get(IEditorService);
    const listService = accessor.get(IListService);
    const resolvedContext = resolveCommandsContext(args, editorService, editorGroupsService, listService);
    if (!resolvedContext.groupedEditors.length) {
      return;
    }
    const auxiliaryEditorPart = await editorGroupsService.createAuxiliaryEditorPart();
    const { group, editors } = resolvedContext.groupedEditors[0];
    const editorsWithOptions = prepareMoveCopyEditors(group, editors, resolvedContext.preserveFocus);
    if (this.move) {
      group.moveEditors(editorsWithOptions, auxiliaryEditorPart.activeGroup);
    } else {
      group.copyEditors(editorsWithOptions, auxiliaryEditorPart.activeGroup);
    }
    auxiliaryEditorPart.activeGroup.focus();
  }
}
class MoveEditorToNewWindowAction extends BaseMoveCopyEditorToNewWindowAction {
  constructor() {
    super(
      MOVE_EDITOR_INTO_NEW_WINDOW_COMMAND_ID,
      {
        ...localize2("moveEditorToNewWindow", "Move Editor into New Window"),
        mnemonicTitle: localize({ key: "miMoveEditorToNewWindow", comment: ["&& denotes a mnemonic"] }, "&&Move Editor into New Window")
      },
      void 0,
      true
    );
  }
}
class CopyEditorToNewindowAction extends BaseMoveCopyEditorToNewWindowAction {
  constructor() {
    super(
      COPY_EDITOR_INTO_NEW_WINDOW_COMMAND_ID,
      {
        ...localize2("copyEditorToNewWindow", "Copy Editor into New Window"),
        mnemonicTitle: localize({ key: "miCopyEditorToNewWindow", comment: ["&& denotes a mnemonic"] }, "&&Copy Editor into New Window")
      },
      { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyO), weight: KeybindingWeight.WorkbenchContrib },
      false
    );
  }
}
class BaseMoveCopyEditorGroupToNewWindowAction extends Action2 {
  constructor(id, title, move) {
    super({
      id,
      title,
      category: Categories.View,
      f1: true
    });
    this.move = move;
  }
  async run(accessor) {
    const editorGroupService = accessor.get(IEditorGroupsService);
    const activeGroup = editorGroupService.activeGroup;
    const auxiliaryEditorPart = await editorGroupService.createAuxiliaryEditorPart();
    editorGroupService.mergeGroup(activeGroup, auxiliaryEditorPart.activeGroup, {
      mode: this.move ? MergeGroupMode.MOVE_EDITORS : MergeGroupMode.COPY_EDITORS
    });
    auxiliaryEditorPart.activeGroup.focus();
  }
}
class MoveEditorGroupToNewWindowAction extends BaseMoveCopyEditorGroupToNewWindowAction {
  constructor() {
    super(
      MOVE_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID,
      {
        ...localize2("moveEditorGroupToNewWindow", "Move Editor Group into New Window"),
        mnemonicTitle: localize({ key: "miMoveEditorGroupToNewWindow", comment: ["&& denotes a mnemonic"] }, "&&Move Editor Group into New Window")
      },
      true
    );
  }
}
class CopyEditorGroupToNewWindowAction extends BaseMoveCopyEditorGroupToNewWindowAction {
  constructor() {
    super(
      COPY_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID,
      {
        ...localize2("copyEditorGroupToNewWindow", "Copy Editor Group into New Window"),
        mnemonicTitle: localize({ key: "miCopyEditorGroupToNewWindow", comment: ["&& denotes a mnemonic"] }, "&&Copy Editor Group into New Window")
      },
      false
    );
  }
}
class RestoreEditorsToMainWindowAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.restoreEditorsToMainWindow",
      title: {
        ...localize2("restoreEditorsToMainWindow", "Restore Editors into Main Window"),
        mnemonicTitle: localize({ key: "miRestoreEditorsToMainWindow", comment: ["&& denotes a mnemonic"] }, "&&Restore Editors into Main Window")
      },
      f1: true,
      precondition: IsAuxiliaryWindowFocusedContext,
      category: Categories.View
    });
  }
  async run(accessor) {
    const editorGroupService = accessor.get(IEditorGroupsService);
    editorGroupService.mergeAllGroups(editorGroupService.mainPart.activeGroup);
  }
}
class NewEmptyEditorWindowAction extends Action2 {
  constructor() {
    super({
      id: NEW_EMPTY_EDITOR_WINDOW_COMMAND_ID,
      title: {
        ...localize2("newEmptyEditorWindow", "New Empty Editor Window"),
        mnemonicTitle: localize({ key: "miNewEmptyEditorWindow", comment: ["&& denotes a mnemonic"] }, "&&New Empty Editor Window")
      },
      f1: true,
      category: Categories.View
    });
  }
  async run(accessor) {
    const editorGroupService = accessor.get(IEditorGroupsService);
    const auxiliaryEditorPart = await editorGroupService.createAuxiliaryEditorPart();
    auxiliaryEditorPart.activeGroup.focus();
  }
}
export {
  ClearEditorHistoryAction,
  ClearEditorHistoryWithoutConfirmAction,
  ClearRecentFilesAction,
  CloseAllEditorGroupsAction,
  CloseAllEditorsAction,
  CloseEditorAction,
  CloseEditorInAllGroupsAction,
  CloseEditorTabAction,
  CloseEditorsInOtherGroupsAction,
  CloseLeftEditorsInGroupAction,
  CloseOtherEditorTabsInGroupAction,
  CopyEditorGroupToNewWindowAction,
  CopyEditorToNewindowAction,
  DuplicateGroupDownAction,
  DuplicateGroupLeftAction,
  DuplicateGroupRightAction,
  DuplicateGroupUpAction,
  EditorLayoutSingleAction,
  EditorLayoutThreeColumnsAction,
  EditorLayoutThreeRowsAction,
  EditorLayoutTwoByTwoGridAction,
  EditorLayoutTwoColumnsAction,
  EditorLayoutTwoColumnsBottomAction,
  EditorLayoutTwoRowsAction,
  EditorLayoutTwoRowsRightAction,
  FocusAboveGroup,
  FocusActiveGroupAction,
  FocusBelowGroup,
  FocusFirstGroupAction,
  FocusLastGroupAction,
  FocusLeftGroup,
  FocusNextGroup,
  FocusPreviousGroup,
  FocusRightGroup,
  JoinAllGroupsAction,
  JoinTwoGroupsAction,
  MaximizeGroupHideSidebarAction,
  MinimizeOtherGroupsAction,
  MinimizeOtherGroupsHideSidebarAction,
  MoveEditorGroupToNewWindowAction,
  MoveEditorLeftInGroupAction,
  MoveEditorRightInGroupAction,
  MoveEditorToAboveGroupAction,
  MoveEditorToBelowGroupAction,
  MoveEditorToEndAction,
  MoveEditorToFirstGroupAction,
  MoveEditorToLastGroupAction,
  MoveEditorToLeftGroupAction,
  MoveEditorToNewWindowAction,
  MoveEditorToNextGroupAction,
  MoveEditorToPreviousGroupAction,
  MoveEditorToRightGroupAction,
  MoveEditorToStartAction,
  MoveGroupDownAction,
  MoveGroupLeftAction,
  MoveGroupRightAction,
  MoveGroupUpAction,
  NavigateBackwardsAction,
  NavigateBackwardsInEditsAction,
  NavigateBackwardsInNavigationsAction,
  NavigateBetweenGroupsAction,
  NavigateForwardAction,
  NavigateForwardInEditsAction,
  NavigateForwardInNavigationsAction,
  NavigatePreviousAction,
  NavigatePreviousInEditsAction,
  NavigatePreviousInNavigationsAction,
  NavigateToLastEditLocationAction,
  NavigateToLastNavigationLocationAction,
  NewEditorGroupAboveAction,
  NewEditorGroupBelowAction,
  NewEditorGroupLeftAction,
  NewEditorGroupRightAction,
  NewEmptyEditorWindowAction,
  OpenFirstEditorInGroup,
  OpenLastEditorInGroup,
  OpenNextEditor,
  OpenNextEditorInGroup,
  OpenNextRecentlyUsedEditorAction,
  OpenNextRecentlyUsedEditorInGroupAction,
  OpenPreviousEditor,
  OpenPreviousEditorInGroup,
  OpenPreviousRecentlyUsedEditorAction,
  OpenPreviousRecentlyUsedEditorInGroupAction,
  QuickAccessLeastRecentlyUsedEditorAction,
  QuickAccessLeastRecentlyUsedEditorInGroupAction,
  QuickAccessPreviousEditorFromHistoryAction,
  QuickAccessPreviousRecentlyUsedEditorAction,
  QuickAccessPreviousRecentlyUsedEditorInGroupAction,
  ReOpenInTextEditorAction,
  ReopenClosedEditorAction,
  ResetGroupSizesAction,
  RestoreEditorsToMainWindowAction,
  RevertAndCloseEditorAction,
  ShowAllEditorsByAppearanceAction,
  ShowAllEditorsByMostRecentlyUsedAction,
  ShowEditorsInActiveGroupByMostRecentlyUsedAction,
  SplitEditorAction,
  SplitEditorDownAction,
  SplitEditorLeftAction,
  SplitEditorOrthogonalAction,
  SplitEditorRightAction,
  SplitEditorToAboveGroupAction,
  SplitEditorToBelowGroupAction,
  SplitEditorToFirstGroupAction,
  SplitEditorToLastGroupAction,
  SplitEditorToLeftGroupAction,
  SplitEditorToNextGroupAction,
  SplitEditorToPreviousGroupAction,
  SplitEditorToRightGroupAction,
  SplitEditorUpAction,
  ToggleEditorTypeAction,
  ToggleGroupSizesAction,
  ToggleMaximizeEditorGroupAction,
  UnpinEditorAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxlZGl0b3JcXGVkaXRvckFjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUVkaXRvcklkZW50aWZpZXIsIElFZGl0b3JDb21tYW5kc0NvbnRleHQsIENsb3NlRGlyZWN0aW9uLCBTYXZlUmVhc29uLCBFZGl0b3JzT3JkZXIsIEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLCBHcm91cElkZW50aWZpZXIsIEVkaXRvclJlc291cmNlQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBTaWRlQnlTaWRlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL3NpZGVCeVNpZGVFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgUGFydHMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEdvRmlsdGVyLCBJSGlzdG9yeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9oaXN0b3J5L2NvbW1vbi9oaXN0b3J5LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENMT1NFX0VESVRPUl9DT01NQU5EX0lELCBNT1ZFX0FDVElWRV9FRElUT1JfQ09NTUFORF9JRCwgU2VsZWN0ZWRFZGl0b3JzTW92ZUNvcHlBcmd1bWVudHMsIFNQTElUX0VESVRPUl9MRUZULCBTUExJVF9FRElUT1JfUklHSFQsIFNQTElUX0VESVRPUl9VUCwgU1BMSVRfRURJVE9SX0RPV04sIHNwbGl0RWRpdG9yLCBMQVlPVVRfRURJVE9SX0dST1VQU19DT01NQU5EX0lELCBVTlBJTl9FRElUT1JfQ09NTUFORF9JRCwgQ09QWV9BQ1RJVkVfRURJVE9SX0NPTU1BTkRfSUQsIFNQTElUX0VESVRPUiwgVE9HR0xFX01BWElNSVpFX0VESVRPUl9HUk9VUCwgTU9WRV9FRElUT1JfSU5UT19ORVdfV0lORE9XX0NPTU1BTkRfSUQsIENPUFlfRURJVE9SX0lOVE9fTkVXX1dJTkRPV19DT01NQU5EX0lELCBNT1ZFX0VESVRPUl9HUk9VUF9JTlRPX05FV19XSU5ET1dfQ09NTUFORF9JRCwgQ09QWV9FRElUT1JfR1JPVVBfSU5UT19ORVdfV0lORE9XX0NPTU1BTkRfSUQsIE5FV19FTVBUWV9FRElUT1JfV0lORE9XX0NPTU1BTkRfSUQsIE1PVkVfRURJVE9SX0lOVE9fUklHSFRfR1JPVVAsIE1PVkVfRURJVE9SX0lOVE9fTEVGVF9HUk9VUCwgTU9WRV9FRElUT1JfSU5UT19BQk9WRV9HUk9VUCwgTU9WRV9FRElUT1JfSU5UT19CRUxPV19HUk9VUCwgUkVPUEVOX0FDVElWRV9FRElUT1JfV0lUSF9DT01NQU5EX0lEIH0gZnJvbSAnLi9lZGl0b3JDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSwgSUVkaXRvckdyb3VwLCBHcm91cHNBcnJhbmdlbWVudCwgR3JvdXBMb2NhdGlvbiwgR3JvdXBEaXJlY3Rpb24sIHByZWZlcnJlZFNpZGVCeVNpZGVHcm91cERpcmVjdGlvbiwgSUZpbmRHcm91cFNjb3BlLCBHcm91cE9yaWVudGF0aW9uLCBFZGl0b3JHcm91cExheW91dCwgR3JvdXBzT3JkZXIsIE1lcmdlR3JvdXBNb2RlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlcy9jb21tb24vd29ya3NwYWNlcy5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UsIENvbmZpcm1SZXN1bHQsIElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJdGVtQWN0aXZhdGlvbiwgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBBbGxFZGl0b3JzQnlNb3N0UmVjZW50bHlVc2VkUXVpY2tBY2Nlc3MsIEFjdGl2ZUdyb3VwRWRpdG9yc0J5TW9zdFJlY2VudGx5VXNlZFF1aWNrQWNjZXNzLCBBbGxFZGl0b3JzQnlBcHBlYXJhbmNlUXVpY2tBY2Nlc3MgfSBmcm9tICcuL2VkaXRvclF1aWNrQWNjZXNzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsIEF1dG9TYXZlTW9kZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2ZpbGVzQ29uZmlndXJhdGlvbi9jb21tb24vZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNMaW51eCwgaXNOYXRpdmUsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIElBY3Rpb24yT3B0aW9ucywgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgS2V5Q2hvcmQsIEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nUnVsZSwgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IEFjdGl2ZUVkaXRvckF2YWlsYWJsZUVkaXRvcklkc0NvbnRleHQsIEFjdGl2ZUVkaXRvckNhbm5vdENsb3NlQ29udGV4dCwgQWN0aXZlRWRpdG9yQ29udGV4dCwgQWN0aXZlRWRpdG9yR3JvdXBFbXB0eUNvbnRleHQsIEF1eGlsaWFyeUJhclZpc2libGVDb250ZXh0LCBFZGl0b3JQYXJ0TWF4aW1pemVkRWRpdG9yR3JvdXBDb250ZXh0LCBFZGl0b3JQYXJ0TXVsdGlwbGVFZGl0b3JHcm91cHNDb250ZXh0LCBJbkF1dG9tYXRpb25Db250ZXh0LCBJc0F1eGlsaWFyeVdpbmRvd0ZvY3VzZWRDb250ZXh0LCBNdWx0aXBsZUVkaXRvckdyb3Vwc0NvbnRleHQsIFNpZGVCYXJWaXNpYmxlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBnZXRBY3RpdmVEb2N1bWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRBY3Rpb25UaXRsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1NlcnZpY2UsIFByb2dyZXNzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgcmVzb2x2ZUNvbW1hbmRzQ29udGV4dCB9IGZyb20gJy4vZWRpdG9yQ29tbWFuZHNDb250ZXh0LmpzJztcbmltcG9ydCB7IElMaXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBwcmVwYXJlTW92ZUNvcHlFZGl0b3JzIH0gZnJvbSAnLi9lZGl0b3IuanMnO1xuXG5jbGFzcyBFeGVjdXRlQ29tbWFuZEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGRlc2M6IFJlYWRvbmx5PElBY3Rpb24yT3B0aW9ucz4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb21tYW5kSWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRBcmdzPzogdW5rbm93blxuXHQpIHtcblx0XHRzdXBlcihkZXNjKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cblx0XHRyZXR1cm4gY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQodGhpcy5jb21tYW5kSWQsIHRoaXMuY29tbWFuZEFyZ3MpO1xuXHR9XG59XG5cbmFic3RyYWN0IGNsYXNzIEFic3RyYWN0U3BsaXRFZGl0b3JBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRwcm90ZWN0ZWQgZ2V0RGlyZWN0aW9uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpOiBHcm91cERpcmVjdGlvbiB7XG5cdFx0cmV0dXJuIHByZWZlcnJlZFNpZGVCeVNpZGVHcm91cERpcmVjdGlvbihjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvckdyb3Vwc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgbGlzdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGRpcmVjdGlvbiA9IHRoaXMuZ2V0RGlyZWN0aW9uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBjb21tYW5kQ29udGV4dCA9IHJlc29sdmVDb21tYW5kc0NvbnRleHQoYXJncywgZWRpdG9yU2VydmljZSwgZWRpdG9yR3JvdXBzU2VydmljZSwgbGlzdFNlcnZpY2UpO1xuXG5cdFx0c3BsaXRFZGl0b3IoZWRpdG9yR3JvdXBzU2VydmljZSwgZGlyZWN0aW9uLCBjb21tYW5kQ29udGV4dCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNwbGl0RWRpdG9yQWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RTcGxpdEVkaXRvckFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gU1BMSVRfRURJVE9SO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTcGxpdEVkaXRvckFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3NwbGl0RWRpdG9yJywgJ1NwbGl0IEVkaXRvcicpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuQmFja3NsYXNoXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTcGxpdEVkaXRvck9ydGhvZ29uYWxBY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdFNwbGl0RWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uc3BsaXRFZGl0b3JPcnRob2dvbmFsJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3NwbGl0RWRpdG9yT3J0aG9nb25hbCcsICdTcGxpdCBFZGl0b3IgT3J0aG9nb25hbCcpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkJhY2tzbGFzaClcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3XG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0RGlyZWN0aW9uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpOiBHcm91cERpcmVjdGlvbiB7XG5cdFx0Y29uc3QgZGlyZWN0aW9uID0gcHJlZmVycmVkU2lkZUJ5U2lkZUdyb3VwRGlyZWN0aW9uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdHJldHVybiBkaXJlY3Rpb24gPT09IEdyb3VwRGlyZWN0aW9uLlJJR0hUID8gR3JvdXBEaXJlY3Rpb24uRE9XTiA6IEdyb3VwRGlyZWN0aW9uLlJJR0hUO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTcGxpdEVkaXRvckxlZnRBY3Rpb24gZXh0ZW5kcyBFeGVjdXRlQ29tbWFuZEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFNQTElUX0VESVRPUl9MRUZULFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc3BsaXRFZGl0b3JHcm91cExlZnQnLCAnU3BsaXQgRWRpdG9yIExlZnQnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5CYWNrc2xhc2gpXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0sIFNQTElUX0VESVRPUl9MRUZUKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3BsaXRFZGl0b3JSaWdodEFjdGlvbiBleHRlbmRzIEV4ZWN1dGVDb21tYW5kQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU1BMSVRfRURJVE9SX1JJR0hULFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc3BsaXRFZGl0b3JHcm91cFJpZ2h0JywgJ1NwbGl0IEVkaXRvciBSaWdodCcpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkJhY2tzbGFzaClcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3XG5cdFx0fSwgU1BMSVRfRURJVE9SX1JJR0hUKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3BsaXRFZGl0b3JVcEFjdGlvbiBleHRlbmRzIEV4ZWN1dGVDb21tYW5kQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBsb2NhbGl6ZSgnc3BsaXRFZGl0b3JHcm91cFVwJywgXCJTcGxpdCBFZGl0b3IgVXBcIik7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFNQTElUX0VESVRPUl9VUCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3NwbGl0RWRpdG9yR3JvdXBVcCcsIFwiU3BsaXQgRWRpdG9yIFVwXCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkJhY2tzbGFzaClcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3XG5cdFx0fSwgU1BMSVRfRURJVE9SX1VQKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3BsaXRFZGl0b3JEb3duQWN0aW9uIGV4dGVuZHMgRXhlY3V0ZUNvbW1hbmRBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBMQUJFTCA9IGxvY2FsaXplKCdzcGxpdEVkaXRvckdyb3VwRG93bicsIFwiU3BsaXQgRWRpdG9yIERvd25cIik7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFNQTElUX0VESVRPUl9ET1dOLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc3BsaXRFZGl0b3JHcm91cERvd24nLCBcIlNwbGl0IEVkaXRvciBEb3duXCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkJhY2tzbGFzaClcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3XG5cdFx0fSwgU1BMSVRfRURJVE9SX0RPV04pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBKb2luVHdvR3JvdXBzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmpvaW5Ud29Hcm91cHMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignam9pblR3b0dyb3VwcycsICdKb2luIEVkaXRvciBHcm91cCB3aXRoIE5leHQgR3JvdXAnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0PzogSUVkaXRvcklkZW50aWZpZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JHcm91cFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXG5cdFx0bGV0IHNvdXJjZUdyb3VwOiBJRWRpdG9yR3JvdXAgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGNvbnRleHQgJiYgdHlwZW9mIGNvbnRleHQuZ3JvdXBJZCA9PT0gJ251bWJlcicpIHtcblx0XHRcdHNvdXJjZUdyb3VwID0gZWRpdG9yR3JvdXBTZXJ2aWNlLmdldEdyb3VwKGNvbnRleHQuZ3JvdXBJZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNvdXJjZUdyb3VwID0gZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwO1xuXHRcdH1cblxuXHRcdGlmIChzb3VyY2VHcm91cCkge1xuXHRcdFx0Y29uc3QgdGFyZ2V0R3JvdXBEaXJlY3Rpb25zID0gW0dyb3VwRGlyZWN0aW9uLlJJR0hULCBHcm91cERpcmVjdGlvbi5ET1dOLCBHcm91cERpcmVjdGlvbi5MRUZULCBHcm91cERpcmVjdGlvbi5VUF07XG5cdFx0XHRmb3IgKGNvbnN0IHRhcmdldEdyb3VwRGlyZWN0aW9uIG9mIHRhcmdldEdyb3VwRGlyZWN0aW9ucykge1xuXHRcdFx0XHRjb25zdCB0YXJnZXRHcm91cCA9IGVkaXRvckdyb3VwU2VydmljZS5maW5kR3JvdXAoeyBkaXJlY3Rpb246IHRhcmdldEdyb3VwRGlyZWN0aW9uIH0sIHNvdXJjZUdyb3VwKTtcblx0XHRcdFx0aWYgKHRhcmdldEdyb3VwICYmIHNvdXJjZUdyb3VwICE9PSB0YXJnZXRHcm91cCkge1xuXHRcdFx0XHRcdGVkaXRvckdyb3VwU2VydmljZS5tZXJnZUdyb3VwKHNvdXJjZUdyb3VwLCB0YXJnZXRHcm91cCk7XG5cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSm9pbkFsbEdyb3Vwc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5qb2luQWxsR3JvdXBzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2pvaW5BbGxHcm91cHMnLCAnSm9pbiBBbGwgRWRpdG9yIEdyb3VwcycpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JHcm91cFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXG5cdFx0ZWRpdG9yR3JvdXBTZXJ2aWNlLm1lcmdlQWxsR3JvdXBzKGVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5hdmlnYXRlQmV0d2Vlbkdyb3Vwc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5uYXZpZ2F0ZUVkaXRvckdyb3VwcycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCduYXZpZ2F0ZUVkaXRvckdyb3VwcycsICdOYXZpZ2F0ZSBCZXR3ZWVuIEVkaXRvciBHcm91cHMnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yR3JvdXBTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG5leHRHcm91cCA9IGVkaXRvckdyb3VwU2VydmljZS5maW5kR3JvdXAoeyBsb2NhdGlvbjogR3JvdXBMb2NhdGlvbi5ORVhUIH0sIGVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cCwgdHJ1ZSk7XG5cdFx0bmV4dEdyb3VwPy5mb2N1cygpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBGb2N1c0FjdGl2ZUdyb3VwQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzQWN0aXZlRWRpdG9yR3JvdXAnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZm9jdXNBY3RpdmVFZGl0b3JHcm91cCcsICdGb2N1cyBBY3RpdmUgRWRpdG9yIEdyb3VwJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvckdyb3VwU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cblx0XHRlZGl0b3JHcm91cFNlcnZpY2UuYWN0aXZlR3JvdXAuZm9jdXMoKTtcblx0fVxufVxuXG5hYnN0cmFjdCBjbGFzcyBBYnN0cmFjdEZvY3VzR3JvdXBBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRkZXNjOiBSZWFkb25seTxJQWN0aW9uMk9wdGlvbnM+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2NvcGU6IElGaW5kR3JvdXBTY29wZVxuXHQpIHtcblx0XHRzdXBlcihkZXNjKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvckdyb3VwU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cblx0XHRjb25zdCBncm91cCA9IGVkaXRvckdyb3VwU2VydmljZS5maW5kR3JvdXAodGhpcy5zY29wZSwgZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwLCB0cnVlKTtcblx0XHRncm91cD8uZm9jdXMoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRm9jdXNGaXJzdEdyb3VwQWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RGb2N1c0dyb3VwQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNGaXJzdEVkaXRvckdyb3VwJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ZvY3VzRmlyc3RFZGl0b3JHcm91cCcsICdGb2N1cyBGaXJzdCBFZGl0b3IgR3JvdXAnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRpZ2l0MVxuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9LCB7IGxvY2F0aW9uOiBHcm91cExvY2F0aW9uLkZJUlNUIH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBGb2N1c0xhc3RHcm91cEFjdGlvbiBleHRlbmRzIEFic3RyYWN0Rm9jdXNHcm91cEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzTGFzdEVkaXRvckdyb3VwJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ZvY3VzTGFzdEVkaXRvckdyb3VwJywgJ0ZvY3VzIExhc3QgRWRpdG9yIEdyb3VwJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9LCB7IGxvY2F0aW9uOiBHcm91cExvY2F0aW9uLkxBU1QgfSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEZvY3VzTmV4dEdyb3VwIGV4dGVuZHMgQWJzdHJhY3RGb2N1c0dyb3VwQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNOZXh0R3JvdXAnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZm9jdXNOZXh0R3JvdXAnLCAnRm9jdXMgTmV4dCBFZGl0b3IgR3JvdXAnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0sIHsgbG9jYXRpb246IEdyb3VwTG9jYXRpb24uTkVYVCB9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRm9jdXNQcmV2aW91c0dyb3VwIGV4dGVuZHMgQWJzdHJhY3RGb2N1c0dyb3VwQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNQcmV2aW91c0dyb3VwJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ZvY3VzUHJldmlvdXNHcm91cCcsICdGb2N1cyBQcmV2aW91cyBFZGl0b3IgR3JvdXAnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0sIHsgbG9jYXRpb246IEdyb3VwTG9jYXRpb24uUFJFVklPVVMgfSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEZvY3VzTGVmdEdyb3VwIGV4dGVuZHMgQWJzdHJhY3RGb2N1c0dyb3VwQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNMZWZ0R3JvdXAnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZm9jdXNMZWZ0R3JvdXAnLCAnRm9jdXMgTGVmdCBFZGl0b3IgR3JvdXAnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5MZWZ0QXJyb3cpXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0sIHsgZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbi5MRUZUIH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBGb2N1c1JpZ2h0R3JvdXAgZXh0ZW5kcyBBYnN0cmFjdEZvY3VzR3JvdXBBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5mb2N1c1JpZ2h0R3JvdXAnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZm9jdXNSaWdodEdyb3VwJywgJ0ZvY3VzIFJpZ2h0IEVkaXRvciBHcm91cCcpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlJpZ2h0QXJyb3cpXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0sIHsgZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbi5SSUdIVCB9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRm9jdXNBYm92ZUdyb3VwIGV4dGVuZHMgQWJzdHJhY3RGb2N1c0dyb3VwQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNBYm92ZUdyb3VwJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ZvY3VzQWJvdmVHcm91cCcsICdGb2N1cyBFZGl0b3IgR3JvdXAgQWJvdmUnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5VcEFycm93KVxuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9LCB7IGRpcmVjdGlvbjogR3JvdXBEaXJlY3Rpb24uVVAgfSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEZvY3VzQmVsb3dHcm91cCBleHRlbmRzIEFic3RyYWN0Rm9jdXNHcm91cEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzQmVsb3dHcm91cCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdmb2N1c0JlbG93R3JvdXAnLCAnRm9jdXMgRWRpdG9yIEdyb3VwIEJlbG93JyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRG93bkFycm93KVxuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9LCB7IGRpcmVjdGlvbjogR3JvdXBEaXJlY3Rpb24uRE9XTiB9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2xvc2VFZGl0b3JBY3Rpb24gZXh0ZW5kcyBBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNsb3NlQWN0aXZlRWRpdG9yJztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUoJ2Nsb3NlRWRpdG9yJywgXCJDbG9zZSBFZGl0b3JcIik7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aWQ6IHN0cmluZyxcblx0XHRsYWJlbDogc3RyaW5nLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGlkLCBsYWJlbCwgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uY2xvc2UpKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihjb250ZXh0PzogSUVkaXRvckNvbW1hbmRzQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKENMT1NFX0VESVRPUl9DT01NQU5EX0lELCB1bmRlZmluZWQsIGNvbnRleHQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBVbnBpbkVkaXRvckFjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24udW5waW5BY3RpdmVFZGl0b3InO1xuXHRzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBsb2NhbGl6ZSgndW5waW5FZGl0b3InLCBcIlVucGluIEVkaXRvclwiKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpZDogc3RyaW5nLFxuXHRcdGxhYmVsOiBzdHJpbmcsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoaWQsIGxhYmVsLCBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5waW5uZWQpKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihjb250ZXh0PzogSUVkaXRvckNvbW1hbmRzQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFVOUElOX0VESVRPUl9DT01NQU5EX0lELCB1bmRlZmluZWQsIGNvbnRleHQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDbG9zZUVkaXRvclRhYkFjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2xvc2VBY3RpdmVFZGl0b3InO1xuXHRzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBsb2NhbGl6ZSgnY2xvc2VPbmVFZGl0b3InLCBcIkNsb3NlXCIpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGlkOiBzdHJpbmcsXG5cdFx0bGFiZWw6IHN0cmluZyxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGlkLCBsYWJlbCwgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uY2xvc2VTbWFsbCkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGNvbnRleHQ/OiBJRWRpdG9yQ29tbWFuZHNDb250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZ3JvdXAgPSBjb250ZXh0ID8gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuZ2V0R3JvdXAoY29udGV4dC5ncm91cElkKSA6IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwO1xuXHRcdGlmICghZ3JvdXApIHtcblx0XHRcdC8vIGdyb3VwIG1lbnRpb25lZCBpbiBjb250ZXh0IGRvZXMgbm90IGV4aXN0XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0RWRpdG9yID0gY29udGV4dD8uZWRpdG9ySW5kZXggIT09IHVuZGVmaW5lZCA/IGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoY29udGV4dC5lZGl0b3JJbmRleCkgOiBncm91cC5hY3RpdmVFZGl0b3I7XG5cdFx0aWYgKCF0YXJnZXRFZGl0b3IpIHtcblx0XHRcdC8vIE5vIGVkaXRvciBvcGVuIG9yIGVkaXRvciBhdCBpbmRleCBkb2VzIG5vdCBleGlzdFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvcnM6IEVkaXRvcklucHV0W10gPSBbXTtcblx0XHRpZiAoZ3JvdXAuaXNTZWxlY3RlZCh0YXJnZXRFZGl0b3IpKSB7XG5cdFx0XHRlZGl0b3JzLnB1c2goLi4uZ3JvdXAuc2VsZWN0ZWRFZGl0b3JzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZWRpdG9ycy5wdXNoKHRhcmdldEVkaXRvcik7XG5cdFx0fVxuXG5cdFx0Ly8gQ2xvc2Ugc3BlY2lmaWMgZWRpdG9ycyBpbiBncm91cFxuXHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGVkaXRvcnMpIHtcblx0XHRcdGF3YWl0IGdyb3VwLmNsb3NlRWRpdG9yKGVkaXRvciwgeyBwcmVzZXJ2ZUZvY3VzOiBjb250ZXh0Py5wcmVzZXJ2ZUZvY3VzIH0pO1xuXHRcdH1cblx0fVxufVxuXG4vLyBUaGUgYWx0LWhvbGQgYWx0ZXJuYXRpdmUgdG8gQ2xvc2VFZGl0b3JUYWJBY3Rpb24gKHNlZSBNdWx0aUVkaXRvclRhYnNDb250cm9sKSwgbm90IHRoZSBtdWx0aS1zZWxlY3QtYXdhcmUgY2xvc2VPdGhlckVkaXRvcnMgY29tbWFuZC5cbmV4cG9ydCBjbGFzcyBDbG9zZU90aGVyRWRpdG9yVGFic0luR3JvdXBBY3Rpb24gZXh0ZW5kcyBBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNsb3NlT3RoZXJFZGl0b3JUYWJJbkdyb3VwJztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUoJ2Nsb3NlT3RoZXJzJywgXCJDbG9zZSBPdGhlcnNcIik7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aWQ6IHN0cmluZyxcblx0XHRsYWJlbDogc3RyaW5nLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoaWQsIGxhYmVsLCBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5jbG9zZUFsbCkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGNvbnRleHQ/OiBJRWRpdG9yQ29tbWFuZHNDb250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZ3JvdXAgPSBjb250ZXh0ID8gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuZ2V0R3JvdXAoY29udGV4dC5ncm91cElkKSA6IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwO1xuXHRcdGlmICghZ3JvdXApIHtcblx0XHRcdC8vIGdyb3VwIG1lbnRpb25lZCBpbiBjb250ZXh0IGRvZXMgbm90IGV4aXN0XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0RWRpdG9yID0gY29udGV4dD8uZWRpdG9ySW5kZXggIT09IHVuZGVmaW5lZCA/IGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoY29udGV4dC5lZGl0b3JJbmRleCkgOiBncm91cC5hY3RpdmVFZGl0b3I7XG5cdFx0aWYgKCF0YXJnZXRFZGl0b3IpIHtcblx0XHRcdC8vIE5vIGVkaXRvciBvcGVuIG9yIGVkaXRvciBhdCBpbmRleCBkb2VzIG5vdCBleGlzdFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvcnNUb0Nsb3NlID0gZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCwgeyBleGNsdWRlU3RpY2t5OiB0cnVlIH0pLmZpbHRlcihlZGl0b3IgPT4gZWRpdG9yICE9PSB0YXJnZXRFZGl0b3IpO1xuXHRcdGF3YWl0IGdyb3VwLmNsb3NlRWRpdG9ycyhlZGl0b3JzVG9DbG9zZSwgeyBwcmVzZXJ2ZUZvY3VzOiBjb250ZXh0Py5wcmVzZXJ2ZUZvY3VzIH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZXZlcnRBbmRDbG9zZUVkaXRvckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5yZXZlcnRBbmRDbG9zZUFjdGl2ZUVkaXRvcicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdyZXZlcnRBbmRDbG9zZUFjdGl2ZUVkaXRvcicsICdSZXZlcnQgYW5kIENsb3NlIEVkaXRvcicpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBBY3RpdmVFZGl0b3JDYW5ub3RDbG9zZUNvbnRleHQudG9OZWdhdGVkKClcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yUGFuZSA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRpZiAoYWN0aXZlRWRpdG9yUGFuZSkge1xuXHRcdFx0Y29uc3QgZWRpdG9yID0gYWN0aXZlRWRpdG9yUGFuZS5pbnB1dDtcblx0XHRcdGlmIChlZGl0b3IuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5DYW5ub3RDbG9zZSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBncm91cCA9IGFjdGl2ZUVkaXRvclBhbmUuZ3JvdXA7XG5cblx0XHRcdC8vIGZpcnN0IHRyeSBhIG5vcm1hbCByZXZlcnQgd2hlcmUgdGhlIGNvbnRlbnRzIG9mIHRoZSBlZGl0b3IgYXJlIHJlc3RvcmVkXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLnJldmVydCh7IGVkaXRvciwgZ3JvdXBJZDogZ3JvdXAuaWQgfSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRsb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblxuXHRcdFx0XHQvLyBpZiB0aGF0IGZhaWxzLCBzaW5jZSB3ZSBhcmUgYWJvdXQgdG8gY2xvc2UgdGhlIGVkaXRvciwgd2UgYWNjZXB0IHRoYXRcblx0XHRcdFx0Ly8gdGhlIGVkaXRvciBjYW5ub3QgYmUgcmV2ZXJ0ZWQgYW5kIGluc3RlYWQgZG8gYSBzb2Z0IHJldmVydCB0aGF0IGp1c3Rcblx0XHRcdFx0Ly8gZW5hYmxlcyB1cyB0byBjbG9zZSB0aGUgZWRpdG9yLiBXaXRoIHRoaXMsIGEgdXNlciBjYW4gYWx3YXlzIGNsb3NlIGFcblx0XHRcdFx0Ly8gZGlydHkgZWRpdG9yIGV2ZW4gd2hlbiByZXZlcnRpbmcgZmFpbHMuXG5cblx0XHRcdFx0YXdhaXQgZWRpdG9yU2VydmljZS5yZXZlcnQoeyBlZGl0b3IsIGdyb3VwSWQ6IGdyb3VwLmlkIH0sIHsgc29mdDogdHJ1ZSB9KTtcblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgZ3JvdXAuY2xvc2VFZGl0b3IoZWRpdG9yKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENsb3NlTGVmdEVkaXRvcnNJbkdyb3VwQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNsb3NlRWRpdG9yc1RvVGhlTGVmdCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjbG9zZUVkaXRvcnNUb1RoZUxlZnQnLCAnQ2xvc2UgRWRpdG9ycyB0byB0aGUgTGVmdCBpbiBHcm91cCcpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ/OiBJRWRpdG9ySWRlbnRpZmllcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvckdyb3VwU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cblx0XHRjb25zdCB7IGdyb3VwLCBlZGl0b3IgfSA9IHRoaXMuZ2V0VGFyZ2V0KGVkaXRvckdyb3VwU2VydmljZSwgY29udGV4dCk7XG5cdFx0aWYgKGdyb3VwICYmIGVkaXRvcikge1xuXHRcdFx0YXdhaXQgZ3JvdXAuY2xvc2VFZGl0b3JzKHsgZGlyZWN0aW9uOiBDbG9zZURpcmVjdGlvbi5MRUZULCBleGNlcHQ6IGVkaXRvciwgZXhjbHVkZVN0aWNreTogdHJ1ZSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFRhcmdldChlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLCBjb250ZXh0PzogSUVkaXRvcklkZW50aWZpZXIpOiB7IGVkaXRvcjogRWRpdG9ySW5wdXQgfCBudWxsOyBncm91cDogSUVkaXRvckdyb3VwIHwgdW5kZWZpbmVkIH0ge1xuXHRcdGlmIChjb250ZXh0KSB7XG5cdFx0XHRyZXR1cm4geyBlZGl0b3I6IGNvbnRleHQuZWRpdG9yLCBncm91cDogZWRpdG9yR3JvdXBTZXJ2aWNlLmdldEdyb3VwKGNvbnRleHQuZ3JvdXBJZCkgfTtcblx0XHR9XG5cblx0XHQvLyBGYWxsYmFjayB0byBhY3RpdmUgZ3JvdXBcblx0XHRyZXR1cm4geyBncm91cDogZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwLCBlZGl0b3I6IGVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cC5hY3RpdmVFZGl0b3IgfTtcblx0fVxufVxuXG5hYnN0cmFjdCBjbGFzcyBBYnN0cmFjdENsb3NlQWxsQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0cHJvdGVjdGVkIGdyb3Vwc1RvQ2xvc2UoZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSk6IElFZGl0b3JHcm91cFtdIHtcblx0XHRjb25zdCBncm91cHNUb0Nsb3NlOiBJRWRpdG9yR3JvdXBbXSA9IFtdO1xuXG5cdFx0Ly8gQ2xvc2UgZWRpdG9ycyBpbiByZXZlcnNlIG9yZGVyIG9mIHRoZWlyIGdyaWQgYXBwZWFyYW5jZSBzbyB0aGF0IHRoZSBlZGl0b3Jcblx0XHQvLyBncm91cCB0aGF0IGlzIHRoZSBmaXJzdCAodG9wLWxlZnQpIHJlbWFpbnMuIFRoaXMgaGVscHMgdG8ga2VlcCB2aWV3IHN0YXRlXG5cdFx0Ly8gZm9yIGVkaXRvcnMgYXJvdW5kIHRoYXQgaGF2ZSBiZWVuIG9wZW5lZCBpbiB0aGlzIHZpc3VhbGx5IGZpcnN0IGdyb3VwLlxuXHRcdGNvbnN0IGdyb3VwcyA9IGVkaXRvckdyb3VwU2VydmljZS5nZXRHcm91cHMoR3JvdXBzT3JkZXIuR1JJRF9BUFBFQVJBTkNFKTtcblx0XHRmb3IgKGxldCBpID0gZ3JvdXBzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRncm91cHNUb0Nsb3NlLnB1c2goZ3JvdXBzW2ldKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZ3JvdXBzVG9DbG9zZTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IHByb2dyZXNzU2VydmljZSA9IGFjY2Vzc29yLmdldChJUHJvZ3Jlc3NTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JHcm91cFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGZpbGVEaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlRGlhbG9nU2VydmljZSk7XG5cblx0XHQvLyBEZXBlbmRpbmcgb24gdGhlIGVkaXRvciBhbmQgYXV0byBzYXZlIGNvbmZpZ3VyYXRpb24sXG5cdFx0Ly8gc3BsaXQgZWRpdG9ycyBpbnRvIGJ1Y2tldHMgZm9yIGhhbmRsaW5nIGNvbmZpcm1hdGlvblxuXG5cdFx0Y29uc3QgZGlydHlFZGl0b3JzV2l0aERlZmF1bHRDb25maXJtID0gbmV3IFNldDxJRWRpdG9ySWRlbnRpZmllcj4oKTtcblx0XHRjb25zdCBkaXJ0eUF1dG9TYXZlT25Gb2N1c0NoYW5nZUVkaXRvcnMgPSBuZXcgU2V0PElFZGl0b3JJZGVudGlmaWVyPigpO1xuXHRcdGNvbnN0IGRpcnR5QXV0b1NhdmVPbldpbmRvd0NoYW5nZUVkaXRvcnMgPSBuZXcgU2V0PElFZGl0b3JJZGVudGlmaWVyPigpO1xuXHRcdGNvbnN0IGVkaXRvcnNXaXRoQ3VzdG9tQ29uZmlybSA9IG5ldyBNYXA8c3RyaW5nIC8qIHR5cGVJZCAqLywgU2V0PElFZGl0b3JJZGVudGlmaWVyPj4oKTtcblxuXHRcdGZvciAoY29uc3QgeyBlZGl0b3IsIGdyb3VwSWQgfSBvZiBlZGl0b3JTZXJ2aWNlLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwsIHsgZXhjbHVkZVN0aWNreTogdGhpcy5leGNsdWRlU3RpY2t5IH0pKSB7XG5cdFx0XHRpZiAoZWRpdG9yLmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuQ2Fubm90Q2xvc2UpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgY29uZmlybUNsb3NlID0gZmFsc2U7XG5cdFx0XHRsZXQgaGFuZGxlckRpZEVycm9yID0gZmFsc2U7XG5cdFx0XHRpZiAoZWRpdG9yLmNsb3NlSGFuZGxlcikge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbmZpcm1DbG9zZSA9IGVkaXRvci5jbG9zZUhhbmRsZXIuc2hvd0NvbmZpcm0oKTsgLy8gY3VzdG9tIGhhbmRsaW5nIG9mIGNvbmZpcm1hdGlvbiBvbiBjbG9zZVxuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHRcdGhhbmRsZXJEaWRFcnJvciA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKCFlZGl0b3IuY2xvc2VIYW5kbGVyIHx8IGhhbmRsZXJEaWRFcnJvcikge1xuXHRcdFx0XHRjb25maXJtQ2xvc2UgPSBlZGl0b3IuaXNEaXJ0eSgpICYmICFlZGl0b3IuaXNTYXZpbmcoKTsgLy8gZGVmYXVsdCBjb25maXJtIG9ubHkgd2hlbiBkaXJ0eSBhbmQgbm90IHNhdmluZ1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWNvbmZpcm1DbG9zZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRWRpdG9yIGhhcyBjdXN0b20gY29uZmlybSBpbXBsZW1lbnRhdGlvblxuXHRcdFx0aWYgKHR5cGVvZiBlZGl0b3IuY2xvc2VIYW5kbGVyPy5jb25maXJtID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdGxldCBjdXN0b21FZGl0b3JzVG9Db25maXJtID0gZWRpdG9yc1dpdGhDdXN0b21Db25maXJtLmdldChlZGl0b3IudHlwZUlkKTtcblx0XHRcdFx0aWYgKCFjdXN0b21FZGl0b3JzVG9Db25maXJtKSB7XG5cdFx0XHRcdFx0Y3VzdG9tRWRpdG9yc1RvQ29uZmlybSA9IG5ldyBTZXQoKTtcblx0XHRcdFx0XHRlZGl0b3JzV2l0aEN1c3RvbUNvbmZpcm0uc2V0KGVkaXRvci50eXBlSWQsIGN1c3RvbUVkaXRvcnNUb0NvbmZpcm0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y3VzdG9tRWRpdG9yc1RvQ29uZmlybS5hZGQoeyBlZGl0b3IsIGdyb3VwSWQgfSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEVkaXRvciB3aWxsIGJlIHNhdmVkIG9uIGZvY3VzIGNoYW5nZSB3aGVuIGFcblx0XHRcdC8vIGRpYWxvZyBhcHBlYXJzLCBzbyBqdXN0IHRyYWNrIHRoYXQgc2VwYXJhdGVcblx0XHRcdGVsc2UgaWYgKCFlZGl0b3IuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5VbnRpdGxlZCkgJiYgZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5nZXRBdXRvU2F2ZU1vZGUoZWRpdG9yKS5tb2RlID09PSBBdXRvU2F2ZU1vZGUuT05fRk9DVVNfQ0hBTkdFKSB7XG5cdFx0XHRcdGRpcnR5QXV0b1NhdmVPbkZvY3VzQ2hhbmdlRWRpdG9ycy5hZGQoeyBlZGl0b3IsIGdyb3VwSWQgfSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFdpbmRvd3MsIExpbnV4OiBlZGl0b3Igd2lsbCBiZSBzYXZlZCBvbiB3aW5kb3cgY2hhbmdlXG5cdFx0XHQvLyB3aGVuIGEgbmF0aXZlIGRpYWxvZyBhcHBlYXJzLCBzbyBqdXN0IHRyYWNrIHRoYXQgc2VwYXJhdGVcblx0XHRcdC8vIChzZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEzNDI1MClcblx0XHRcdGVsc2UgaWYgKChpc05hdGl2ZSAmJiAoaXNXaW5kb3dzIHx8IGlzTGludXgpKSAmJiAhZWRpdG9yLmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuVW50aXRsZWQpICYmIGZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0QXV0b1NhdmVNb2RlKGVkaXRvcikubW9kZSA9PT0gQXV0b1NhdmVNb2RlLk9OX1dJTkRPV19DSEFOR0UpIHtcblx0XHRcdFx0ZGlydHlBdXRvU2F2ZU9uV2luZG93Q2hhbmdlRWRpdG9ycy5hZGQoeyBlZGl0b3IsIGdyb3VwSWQgfSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEVkaXRvciB3aWxsIHNob3cgaW4gZ2VuZXJpYyBmaWxlIGJhc2VkIGRpYWxvZ1xuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGRpcnR5RWRpdG9yc1dpdGhEZWZhdWx0Q29uZmlybS5hZGQoeyBlZGl0b3IsIGdyb3VwSWQgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gMS4pIFNob3cgZGVmYXVsdCBmaWxlIGJhc2VkIGRpYWxvZ1xuXHRcdGlmIChkaXJ0eUVkaXRvcnNXaXRoRGVmYXVsdENvbmZpcm0uc2l6ZSA+IDApIHtcblx0XHRcdGNvbnN0IGVkaXRvcnMgPSBBcnJheS5mcm9tKGRpcnR5RWRpdG9yc1dpdGhEZWZhdWx0Q29uZmlybS52YWx1ZXMoKSk7XG5cblx0XHRcdGF3YWl0IHRoaXMucmV2ZWFsRWRpdG9yc1RvQ29uZmlybShlZGl0b3JzLCBlZGl0b3JHcm91cFNlcnZpY2UpOyAvLyBoZWxwIHVzZXIgbWFrZSBhIGRlY2lzaW9uIGJ5IHJldmVhbGluZyBlZGl0b3JzXG5cblx0XHRcdGNvbnN0IGNvbmZpcm1hdGlvbiA9IGF3YWl0IGZpbGVEaWFsb2dTZXJ2aWNlLnNob3dTYXZlQ29uZmlybShlZGl0b3JzLm1hcCgoeyBlZGl0b3IgfSkgPT4ge1xuXHRcdFx0XHRpZiAoZWRpdG9yIGluc3RhbmNlb2YgU2lkZUJ5U2lkZUVkaXRvcklucHV0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIGVkaXRvci5wcmltYXJ5LmdldE5hbWUoKTsgLy8gcHJlZmVyIHNob3J0ZXIgbmFtZXMgYnkgdXNpbmcgcHJpbWFyeSdzIG5hbWUgaW4gdGhpcyBjYXNlXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gZWRpdG9yLmdldE5hbWUoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0c3dpdGNoIChjb25maXJtYXRpb24pIHtcblx0XHRcdFx0Y2FzZSBDb25maXJtUmVzdWx0LkNBTkNFTDpcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdGNhc2UgQ29uZmlybVJlc3VsdC5ET05UX1NBVkU6XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5yZXZlcnRFZGl0b3JzKGVkaXRvclNlcnZpY2UsIGxvZ1NlcnZpY2UsIHByb2dyZXNzU2VydmljZSwgZWRpdG9ycyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgQ29uZmlybVJlc3VsdC5TQVZFOlxuXHRcdFx0XHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uuc2F2ZShlZGl0b3JzLCB7IHJlYXNvbjogU2F2ZVJlYXNvbi5FWFBMSUNJVCB9KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyAyLikgU2hvdyBjdXN0b20gY29uZmlybSBiYXNlZCBkaWFsb2dcblx0XHRmb3IgKGNvbnN0IFssIGVkaXRvcklkZW50aWZpZXJzXSBvZiBlZGl0b3JzV2l0aEN1c3RvbUNvbmZpcm0pIHtcblx0XHRcdGNvbnN0IGVkaXRvcnMgPSBBcnJheS5mcm9tKGVkaXRvcklkZW50aWZpZXJzLnZhbHVlcygpKTtcblxuXHRcdFx0YXdhaXQgdGhpcy5yZXZlYWxFZGl0b3JzVG9Db25maXJtKGVkaXRvcnMsIGVkaXRvckdyb3VwU2VydmljZSk7IC8vIGhlbHAgdXNlciBtYWtlIGEgZGVjaXNpb24gYnkgcmV2ZWFsaW5nIGVkaXRvcnNcblxuXHRcdFx0Y29uc3QgY29uZmlybWF0aW9uID0gYXdhaXQgZWRpdG9ycy5hdCgwKT8uZWRpdG9yLmNsb3NlSGFuZGxlcj8uY29uZmlybT8uKGVkaXRvcnMpO1xuXHRcdFx0aWYgKHR5cGVvZiBjb25maXJtYXRpb24gPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdHN3aXRjaCAoY29uZmlybWF0aW9uKSB7XG5cdFx0XHRcdFx0Y2FzZSBDb25maXJtUmVzdWx0LkNBTkNFTDpcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRjYXNlIENvbmZpcm1SZXN1bHQuRE9OVF9TQVZFOlxuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5yZXZlcnRFZGl0b3JzKGVkaXRvclNlcnZpY2UsIGxvZ1NlcnZpY2UsIHByb2dyZXNzU2VydmljZSwgZWRpdG9ycyk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIENvbmZpcm1SZXN1bHQuU0FWRTpcblx0XHRcdFx0XHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uuc2F2ZShlZGl0b3JzLCB7IHJlYXNvbjogU2F2ZVJlYXNvbi5FWFBMSUNJVCB9KTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gMy4pIFNhdmUgYXV0b3NhdmVhYmxlIGVkaXRvcnMgKGZvY3VzIGNoYW5nZSlcblx0XHRpZiAoZGlydHlBdXRvU2F2ZU9uRm9jdXNDaGFuZ2VFZGl0b3JzLnNpemUgPiAwKSB7XG5cdFx0XHRjb25zdCBlZGl0b3JzID0gQXJyYXkuZnJvbShkaXJ0eUF1dG9TYXZlT25Gb2N1c0NoYW5nZUVkaXRvcnMudmFsdWVzKCkpO1xuXG5cdFx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLnNhdmUoZWRpdG9ycywgeyByZWFzb246IFNhdmVSZWFzb24uRk9DVVNfQ0hBTkdFIH0pO1xuXHRcdH1cblxuXHRcdC8vIDQuKSBTYXZlIGF1dG9zYXZlYWJsZSBlZGl0b3JzICh3aW5kb3cgY2hhbmdlKVxuXHRcdGlmIChkaXJ0eUF1dG9TYXZlT25XaW5kb3dDaGFuZ2VFZGl0b3JzLnNpemUgPiAwKSB7XG5cdFx0XHRjb25zdCBlZGl0b3JzID0gQXJyYXkuZnJvbShkaXJ0eUF1dG9TYXZlT25XaW5kb3dDaGFuZ2VFZGl0b3JzLnZhbHVlcygpKTtcblxuXHRcdFx0YXdhaXQgZWRpdG9yU2VydmljZS5zYXZlKGVkaXRvcnMsIHsgcmVhc29uOiBTYXZlUmVhc29uLldJTkRPV19DSEFOR0UgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gNS4pIEZpbmFsbHkgY2xvc2UgYWxsIGVkaXRvcnM6IGV2ZW4gaWYgYW4gZWRpdG9yIGZhaWxlZCB0b1xuXHRcdC8vIHNhdmUgb3IgcmV2ZXJ0IGFuZCBzdGlsbCByZXBvcnRzIGRpcnR5LCB0aGUgZWRpdG9yIHBhcnQgbWFrZXNcblx0XHQvLyBzdXJlIHRvIGJyaW5nIHVwIGFub3RoZXIgY29uZmlybSBkaWFsb2cgZm9yIHRob3NlIGVkaXRvcnNcblx0XHQvLyBzcGVjaWZpY2FsbHkuXG5cdFx0cmV0dXJuIHRoaXMuZG9DbG9zZUFsbChlZGl0b3JHcm91cFNlcnZpY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSByZXZlcnRFZGl0b3JzKGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSwgcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLCBlZGl0b3JzOiBJRWRpdG9ySWRlbnRpZmllcltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3Moe1xuXHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uV2luZG93LCBcdC8vIHVzZSB3aW5kb3cgcHJvZ3Jlc3MgdG8gbm90IGJlIHRvbyBhbm5veWluZyBhYm91dCB0aGlzIG9wZXJhdGlvblxuXHRcdFx0ZGVsYXk6IDgwMCxcdFx0XHRcdFx0XHRcdC8vIGRlbGF5IHNvIHRoYXQgaXQgb25seSBhcHBlYXJzIHdoZW4gb3BlcmF0aW9uIHRha2VzIGEgbG9uZyB0aW1lXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3JldmVydGluZycsIFwiUmV2ZXJ0aW5nIEVkaXRvcnMuLi5cIiksXG5cdFx0fSwgKCkgPT4gdGhpcy5kb1JldmVydEVkaXRvcnMoZWRpdG9yU2VydmljZSwgbG9nU2VydmljZSwgZWRpdG9ycykpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1JldmVydEVkaXRvcnMoZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLCBlZGl0b3JzOiBJRWRpdG9ySWRlbnRpZmllcltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIFdlIGZpcnN0IGF0dGVtcHQgdG8gcmV2ZXJ0IGFsbCBlZGl0b3JzIHdpdGggYHNvZnQ6IGZhbHNlYCwgdG8gZW5zdXJlIHRoYXRcblx0XHRcdC8vIHdvcmtpbmcgY29waWVzIHJldmVydCB0byB0aGVpciBzdGF0ZSBvbiBkaXNrLiBFdmVuIHRob3VnaCB3ZSBjbG9zZSBlZGl0b3JzLFxuXHRcdFx0Ly8gaXQgaXMgcG9zc2libGUgdGhhdCBvdGhlciBwYXJ0aWVzIGhvbGQgYSByZWZlcmVuY2UgdG8gdGhlIHdvcmtpbmcgY29weVxuXHRcdFx0Ly8gYW5kIGV4cGVjdCBpdCB0byBiZSBpbiBhIGNlcnRhaW4gc3RhdGUgYWZ0ZXIgdGhlIGVkaXRvciBpcyBjbG9zZWQgd2l0aG91dFxuXHRcdFx0Ly8gc2F2aW5nLlxuXHRcdFx0YXdhaXQgZWRpdG9yU2VydmljZS5yZXZlcnQoZWRpdG9ycyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXG5cdFx0XHQvLyBpZiB0aGF0IGZhaWxzLCBzaW5jZSB3ZSBhcmUgYWJvdXQgdG8gY2xvc2UgdGhlIGVkaXRvciwgd2UgYWNjZXB0IHRoYXRcblx0XHRcdC8vIHRoZSBlZGl0b3IgY2Fubm90IGJlIHJldmVydGVkIGFuZCBpbnN0ZWFkIGRvIGEgc29mdCByZXZlcnQgdGhhdCBqdXN0XG5cdFx0XHQvLyBlbmFibGVzIHVzIHRvIGNsb3NlIHRoZSBlZGl0b3IuIFdpdGggdGhpcywgYSB1c2VyIGNhbiBhbHdheXMgY2xvc2UgYVxuXHRcdFx0Ly8gZGlydHkgZWRpdG9yIGV2ZW4gd2hlbiByZXZlcnRpbmcgZmFpbHMuXG5cdFx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLnJldmVydChlZGl0b3JzLCB7IHNvZnQ6IHRydWUgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXZlYWxFZGl0b3JzVG9Db25maXJtKGVkaXRvcnM6IFJlYWRvbmx5QXJyYXk8SUVkaXRvcklkZW50aWZpZXI+LCBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGhhbmRsZWRHcm91cHMgPSBuZXcgU2V0PEdyb3VwSWRlbnRpZmllcj4oKTtcblx0XHRcdGZvciAoY29uc3QgeyBlZGl0b3IsIGdyb3VwSWQgfSBvZiBlZGl0b3JzKSB7XG5cdFx0XHRcdGlmIChoYW5kbGVkR3JvdXBzLmhhcyhncm91cElkKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aGFuZGxlZEdyb3Vwcy5hZGQoZ3JvdXBJZCk7XG5cblx0XHRcdFx0Y29uc3QgZ3JvdXAgPSBlZGl0b3JHcm91cFNlcnZpY2UuZ2V0R3JvdXAoZ3JvdXBJZCk7XG5cdFx0XHRcdGF3YWl0IGdyb3VwPy5vcGVuRWRpdG9yKGVkaXRvcik7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdC8vIGlnbm9yZSBhbnkgZXJyb3IgYXMgdGhlIHJldmVhbGluZyBpcyBqdXN0IGNvbnZpbmllbmNlXG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IGdldCBleGNsdWRlU3RpY2t5KCk6IGJvb2xlYW47XG5cblx0cHJvdGVjdGVkIGFzeW5jIGRvQ2xvc2VBbGwoZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKHRoaXMuZ3JvdXBzVG9DbG9zZShlZGl0b3JHcm91cFNlcnZpY2UpLm1hcChncm91cCA9PiBncm91cC5jbG9zZUFsbEVkaXRvcnMoeyBleGNsdWRlU3RpY2t5OiB0aGlzLmV4Y2x1ZGVTdGlja3kgfSkpKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2xvc2VBbGxFZGl0b3JzQWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RDbG9zZUFsbEFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2xvc2VBbGxFZGl0b3JzJztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUyKCdjbG9zZUFsbEVkaXRvcnMnLCAnQ2xvc2UgQWxsIEVkaXRvcnMnKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ2xvc2VBbGxFZGl0b3JzQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IENsb3NlQWxsRWRpdG9yc0FjdGlvbi5MQUJFTCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlXKVxuXHRcdFx0fSxcblx0XHRcdGljb246IENvZGljb24uY2xvc2VBbGwsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3XG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0IGV4Y2x1ZGVTdGlja3koKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7IC8vIGV4Y2x1ZGUgc3RpY2t5IGZyb20gdGhpcyBtYXNzLWNsb3Npbmcgb3BlcmF0aW9uXG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENsb3NlQWxsRWRpdG9yR3JvdXBzQWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RDbG9zZUFsbEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNsb3NlQWxsR3JvdXBzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Nsb3NlQWxsR3JvdXBzJywgJ0Nsb3NlIEFsbCBFZGl0b3IgR3JvdXBzJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5Vylcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3XG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0IGV4Y2x1ZGVTdGlja3koKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlOyAvLyB0aGUgaW50ZW50IHRvIGNsb3NlIGdyb3VwcyBtZWFucywgZXZlbiBzdGlja3kgYXJlIGluY2x1ZGVkXG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgZG9DbG9zZUFsbChlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgc3VwZXIuZG9DbG9zZUFsbChlZGl0b3JHcm91cFNlcnZpY2UpO1xuXG5cdFx0Zm9yIChjb25zdCBncm91cFRvQ2xvc2Ugb2YgdGhpcy5ncm91cHNUb0Nsb3NlKGVkaXRvckdyb3VwU2VydmljZSkpIHtcblx0XHRcdGlmIChncm91cFRvQ2xvc2UuY291bnQgPT09IDApIHtcblx0XHRcdFx0ZWRpdG9yR3JvdXBTZXJ2aWNlLnJlbW92ZUdyb3VwKGdyb3VwVG9DbG9zZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDbG9zZUVkaXRvcnNJbk90aGVyR3JvdXBzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNsb3NlRWRpdG9yc0luT3RoZXJHcm91cHMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2xvc2VFZGl0b3JzSW5PdGhlckdyb3VwcycsICdDbG9zZSBFZGl0b3JzIGluIE90aGVyIEdyb3VwcycpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ/OiBJRWRpdG9ySWRlbnRpZmllcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvckdyb3VwU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cblx0XHRjb25zdCBncm91cFRvU2tpcCA9IGNvbnRleHQgPyBlZGl0b3JHcm91cFNlcnZpY2UuZ2V0R3JvdXAoY29udGV4dC5ncm91cElkKSA6IGVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cDtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChlZGl0b3JHcm91cFNlcnZpY2UuZ2V0R3JvdXBzKEdyb3Vwc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKS5tYXAoYXN5bmMgZ3JvdXAgPT4ge1xuXHRcdFx0aWYgKGdyb3VwVG9Ta2lwICYmIGdyb3VwLmlkID09PSBncm91cFRvU2tpcC5pZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBncm91cC5jbG9zZUFsbEVkaXRvcnMoeyBleGNsdWRlU3RpY2t5OiB0cnVlIH0pO1xuXHRcdH0pKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2xvc2VFZGl0b3JJbkFsbEdyb3Vwc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jbG9zZUVkaXRvckluQWxsR3JvdXBzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Nsb3NlRWRpdG9ySW5BbGxHcm91cHMnLCAnQ2xvc2UgRWRpdG9yIGluIEFsbCBHcm91cHMnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yR3JvdXBTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yO1xuXHRcdGlmIChhY3RpdmVFZGl0b3IpIHtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKGVkaXRvckdyb3VwU2VydmljZS5nZXRHcm91cHMoR3JvdXBzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpLm1hcChncm91cCA9PiBncm91cC5jbG9zZUVkaXRvcihhY3RpdmVFZGl0b3IpKSk7XG5cdFx0fVxuXHR9XG59XG5cbmFic3RyYWN0IGNsYXNzIEFic3RyYWN0TW92ZUNvcHlHcm91cEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGRlc2M6IFJlYWRvbmx5PElBY3Rpb24yT3B0aW9ucz4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkaXJlY3Rpb246IEdyb3VwRGlyZWN0aW9uLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaXNNb3ZlOiBib29sZWFuXG5cdCkge1xuXHRcdHN1cGVyKGRlc2MpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0PzogSUVkaXRvcklkZW50aWZpZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JHcm91cFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXG5cdFx0bGV0IHNvdXJjZUdyb3VwOiBJRWRpdG9yR3JvdXAgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGNvbnRleHQgJiYgdHlwZW9mIGNvbnRleHQuZ3JvdXBJZCA9PT0gJ251bWJlcicpIHtcblx0XHRcdHNvdXJjZUdyb3VwID0gZWRpdG9yR3JvdXBTZXJ2aWNlLmdldEdyb3VwKGNvbnRleHQuZ3JvdXBJZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNvdXJjZUdyb3VwID0gZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwO1xuXHRcdH1cblxuXHRcdGlmIChzb3VyY2VHcm91cCkge1xuXHRcdFx0bGV0IHJlc3VsdEdyb3VwOiBJRWRpdG9yR3JvdXAgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAodGhpcy5pc01vdmUpIHtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0R3JvdXAgPSB0aGlzLmZpbmRUYXJnZXRHcm91cChlZGl0b3JHcm91cFNlcnZpY2UsIHNvdXJjZUdyb3VwKTtcblx0XHRcdFx0aWYgKHRhcmdldEdyb3VwKSB7XG5cdFx0XHRcdFx0cmVzdWx0R3JvdXAgPSBlZGl0b3JHcm91cFNlcnZpY2UubW92ZUdyb3VwKHNvdXJjZUdyb3VwLCB0YXJnZXRHcm91cCwgdGhpcy5kaXJlY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXN1bHRHcm91cCA9IGVkaXRvckdyb3VwU2VydmljZS5jb3B5R3JvdXAoc291cmNlR3JvdXAsIHNvdXJjZUdyb3VwLCB0aGlzLmRpcmVjdGlvbik7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXN1bHRHcm91cCkge1xuXHRcdFx0XHRlZGl0b3JHcm91cFNlcnZpY2UuYWN0aXZhdGVHcm91cChyZXN1bHRHcm91cCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBmaW5kVGFyZ2V0R3JvdXAoZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSwgc291cmNlR3JvdXA6IElFZGl0b3JHcm91cCk6IElFZGl0b3JHcm91cCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdGFyZ2V0TmVpZ2hib3VyczogR3JvdXBEaXJlY3Rpb25bXSA9IFt0aGlzLmRpcmVjdGlvbl07XG5cblx0XHQvLyBBbGxvdyB0aGUgdGFyZ2V0IGdyb3VwIHRvIGJlIGluIGFsdGVybmF0aXZlIGxvY2F0aW9ucyB0byBzdXBwb3J0IG1vcmVcblx0XHQvLyBzY2VuYXJpb3Mgb2YgbW92aW5nIHRoZSBncm91cCB0byB0aGUgdGFyZXQgbG9jYXRpb24uXG5cdFx0Ly8gSGVscHMgZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy81MDc0MVxuXHRcdHN3aXRjaCAodGhpcy5kaXJlY3Rpb24pIHtcblx0XHRcdGNhc2UgR3JvdXBEaXJlY3Rpb24uTEVGVDpcblx0XHRcdGNhc2UgR3JvdXBEaXJlY3Rpb24uUklHSFQ6XG5cdFx0XHRcdHRhcmdldE5laWdoYm91cnMucHVzaChHcm91cERpcmVjdGlvbi5VUCwgR3JvdXBEaXJlY3Rpb24uRE9XTik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBHcm91cERpcmVjdGlvbi5VUDpcblx0XHRcdGNhc2UgR3JvdXBEaXJlY3Rpb24uRE9XTjpcblx0XHRcdFx0dGFyZ2V0TmVpZ2hib3Vycy5wdXNoKEdyb3VwRGlyZWN0aW9uLkxFRlQsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCB0YXJnZXROZWlnaGJvdXIgb2YgdGFyZ2V0TmVpZ2hib3Vycykge1xuXHRcdFx0Y29uc3QgdGFyZ2V0TmVpZ2hib3VyR3JvdXAgPSBlZGl0b3JHcm91cFNlcnZpY2UuZmluZEdyb3VwKHsgZGlyZWN0aW9uOiB0YXJnZXROZWlnaGJvdXIgfSwgc291cmNlR3JvdXApO1xuXHRcdFx0aWYgKHRhcmdldE5laWdoYm91ckdyb3VwKSB7XG5cdFx0XHRcdHJldHVybiB0YXJnZXROZWlnaGJvdXJHcm91cDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmFic3RyYWN0IGNsYXNzIEFic3RyYWN0TW92ZUdyb3VwQWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RNb3ZlQ29weUdyb3VwQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRkZXNjOiBSZWFkb25seTxJQWN0aW9uMk9wdGlvbnM+LFxuXHRcdGRpcmVjdGlvbjogR3JvdXBEaXJlY3Rpb25cblx0KSB7XG5cdFx0c3VwZXIoZGVzYywgZGlyZWN0aW9uLCB0cnVlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTW92ZUdyb3VwTGVmdEFjdGlvbiBleHRlbmRzIEFic3RyYWN0TW92ZUdyb3VwQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ubW92ZUFjdGl2ZUVkaXRvckdyb3VwTGVmdCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtb3ZlQWN0aXZlR3JvdXBMZWZ0JywgJ01vdmUgRWRpdG9yIEdyb3VwIExlZnQnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleUNvZGUuTGVmdEFycm93KVxuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9LCBHcm91cERpcmVjdGlvbi5MRUZUKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTW92ZUdyb3VwUmlnaHRBY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdE1vdmVHcm91cEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm1vdmVBY3RpdmVFZGl0b3JHcm91cFJpZ2h0Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21vdmVBY3RpdmVHcm91cFJpZ2h0JywgJ01vdmUgRWRpdG9yIEdyb3VwIFJpZ2h0JyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlDb2RlLlJpZ2h0QXJyb3cpXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0sIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTW92ZUdyb3VwVXBBY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdE1vdmVHcm91cEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm1vdmVBY3RpdmVFZGl0b3JHcm91cFVwJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21vdmVBY3RpdmVHcm91cFVwJywgJ01vdmUgRWRpdG9yIEdyb3VwIFVwJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlDb2RlLlVwQXJyb3cpXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0sIEdyb3VwRGlyZWN0aW9uLlVQKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTW92ZUdyb3VwRG93bkFjdGlvbiBleHRlbmRzIEFic3RyYWN0TW92ZUdyb3VwQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ubW92ZUFjdGl2ZUVkaXRvckdyb3VwRG93bicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtb3ZlQWN0aXZlR3JvdXBEb3duJywgJ01vdmUgRWRpdG9yIEdyb3VwIERvd24nKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleUNvZGUuRG93bkFycm93KVxuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9LCBHcm91cERpcmVjdGlvbi5ET1dOKTtcblx0fVxufVxuXG5hYnN0cmFjdCBjbGFzcyBBYnN0cmFjdER1cGxpY2F0ZUdyb3VwQWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RNb3ZlQ29weUdyb3VwQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRkZXNjOiBSZWFkb25seTxJQWN0aW9uMk9wdGlvbnM+LFxuXHRcdGRpcmVjdGlvbjogR3JvdXBEaXJlY3Rpb25cblx0KSB7XG5cdFx0c3VwZXIoZGVzYywgZGlyZWN0aW9uLCBmYWxzZSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIER1cGxpY2F0ZUdyb3VwTGVmdEFjdGlvbiBleHRlbmRzIEFic3RyYWN0RHVwbGljYXRlR3JvdXBBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5kdXBsaWNhdGVBY3RpdmVFZGl0b3JHcm91cExlZnQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZHVwbGljYXRlQWN0aXZlR3JvdXBMZWZ0JywgJ0R1cGxpY2F0ZSBFZGl0b3IgR3JvdXAgTGVmdCcpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3XG5cdFx0fSwgR3JvdXBEaXJlY3Rpb24uTEVGVCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIER1cGxpY2F0ZUdyb3VwUmlnaHRBY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdER1cGxpY2F0ZUdyb3VwQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uZHVwbGljYXRlQWN0aXZlRWRpdG9yR3JvdXBSaWdodCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdkdXBsaWNhdGVBY3RpdmVHcm91cFJpZ2h0JywgJ0R1cGxpY2F0ZSBFZGl0b3IgR3JvdXAgUmlnaHQnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0sIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRHVwbGljYXRlR3JvdXBVcEFjdGlvbiBleHRlbmRzIEFic3RyYWN0RHVwbGljYXRlR3JvdXBBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5kdXBsaWNhdGVBY3RpdmVFZGl0b3JHcm91cFVwJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2R1cGxpY2F0ZUFjdGl2ZUdyb3VwVXAnLCAnRHVwbGljYXRlIEVkaXRvciBHcm91cCBVcCcpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3XG5cdFx0fSwgR3JvdXBEaXJlY3Rpb24uVVApO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEdXBsaWNhdGVHcm91cERvd25BY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdER1cGxpY2F0ZUdyb3VwQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uZHVwbGljYXRlQWN0aXZlRWRpdG9yR3JvdXBEb3duJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2R1cGxpY2F0ZUFjdGl2ZUdyb3VwRG93bicsICdEdXBsaWNhdGUgRWRpdG9yIEdyb3VwIERvd24nKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0sIEdyb3VwRGlyZWN0aW9uLkRPV04pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNaW5pbWl6ZU90aGVyR3JvdXBzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm1pbmltaXplT3RoZXJFZGl0b3JzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21pbmltaXplT3RoZXJFZGl0b3JHcm91cHMnLCAnRXhwYW5kIEVkaXRvciBHcm91cCcpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBNdWx0aXBsZUVkaXRvckdyb3Vwc0NvbnRleHRcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvckdyb3VwU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cblx0XHRlZGl0b3JHcm91cFNlcnZpY2UuYXJyYW5nZUdyb3VwcyhHcm91cHNBcnJhbmdlbWVudC5FWFBBTkQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNaW5pbWl6ZU90aGVyR3JvdXBzSGlkZVNpZGViYXJBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ubWluaW1pemVPdGhlckVkaXRvcnNIaWRlU2lkZWJhcicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtaW5pbWl6ZU90aGVyRWRpdG9yR3JvdXBzSGlkZVNpZGViYXInLCAnRXhwYW5kIEVkaXRvciBHcm91cCBhbmQgSGlkZSBTaWRlIEJhcnMnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIub3IoTXVsdGlwbGVFZGl0b3JHcm91cHNDb250ZXh0LCBTaWRlQmFyVmlzaWJsZUNvbnRleHQsIEF1eGlsaWFyeUJhclZpc2libGVDb250ZXh0KVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yR3JvdXBTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblx0XHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKTtcblxuXHRcdGxheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbih0cnVlLCBQYXJ0cy5TSURFQkFSX1BBUlQpO1xuXHRcdGxheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbih0cnVlLCBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCk7XG5cdFx0ZWRpdG9yR3JvdXBTZXJ2aWNlLmFycmFuZ2VHcm91cHMoR3JvdXBzQXJyYW5nZW1lbnQuRVhQQU5EKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUmVzZXRHcm91cFNpemVzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmV2ZW5FZGl0b3JXaWR0aHMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZXZlbkVkaXRvckdyb3VwcycsICdSZXNldCBFZGl0b3IgR3JvdXAgU2l6ZXMnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yR3JvdXBTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblxuXHRcdGVkaXRvckdyb3VwU2VydmljZS5hcnJhbmdlR3JvdXBzKEdyb3Vwc0FycmFuZ2VtZW50LkVWRU4pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUb2dnbGVHcm91cFNpemVzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZUVkaXRvcldpZHRocycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0b2dnbGVFZGl0b3JXaWR0aHMnLCAnVG9nZ2xlIEVkaXRvciBHcm91cCBTaXplcycpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JHcm91cFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXG5cdFx0ZWRpdG9yR3JvdXBTZXJ2aWNlLnRvZ2dsZUV4cGFuZEdyb3VwKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1heGltaXplR3JvdXBIaWRlU2lkZWJhckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5tYXhpbWl6ZUVkaXRvckhpZGVTaWRlYmFyJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21heGltaXplRWRpdG9ySGlkZVNpZGViYXInLCAnTWF4aW1pemUgRWRpdG9yIEdyb3VwIGFuZCBIaWRlIFNpZGUgQmFycycpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5vcihDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yUGFydE1heGltaXplZEVkaXRvckdyb3VwQ29udGV4dC5uZWdhdGUoKSwgRWRpdG9yUGFydE11bHRpcGxlRWRpdG9yR3JvdXBzQ29udGV4dCksIFNpZGVCYXJWaXNpYmxlQ29udGV4dCwgQXV4aWxpYXJ5QmFyVmlzaWJsZUNvbnRleHQpXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JHcm91cFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXG5cdFx0aWYgKGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRsYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4odHJ1ZSwgUGFydHMuU0lERUJBUl9QQVJUKTtcblx0XHRcdGxheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbih0cnVlLCBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCk7XG5cdFx0XHRlZGl0b3JHcm91cFNlcnZpY2UuYXJyYW5nZUdyb3VwcyhHcm91cHNBcnJhbmdlbWVudC5NQVhJTUlaRSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUb2dnbGVNYXhpbWl6ZUVkaXRvckdyb3VwQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRPR0dMRV9NQVhJTUlaRV9FRElUT1JfR1JPVVAsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0b2dnbGVNYXhpbWl6ZUVkaXRvckdyb3VwJywgJ1RvZ2dsZSBNYXhpbWl6ZSBFZGl0b3IgR3JvdXAnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIub3IoRWRpdG9yUGFydE11bHRpcGxlRWRpdG9yR3JvdXBzQ29udGV4dCwgRWRpdG9yUGFydE1heGltaXplZEVkaXRvckdyb3VwQ29udGV4dCksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleU0pLFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGUsXG5cdFx0XHRcdG9yZGVyOiAtMTAwMDAsIC8vIHRvd2FyZHMgdGhlIGZyb250XG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdHdoZW46IEVkaXRvclBhcnRNYXhpbWl6ZWRFZGl0b3JHcm91cENvbnRleHRcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuRW1wdHlFZGl0b3JHcm91cCxcblx0XHRcdFx0b3JkZXI6IC0xMDAwMCwgLy8gdG93YXJkcyB0aGUgZnJvbnRcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0d2hlbjogRWRpdG9yUGFydE1heGltaXplZEVkaXRvckdyb3VwQ29udGV4dFxuXHRcdFx0fV0sXG5cdFx0XHRpY29uOiBDb2RpY29uLnNjcmVlbkZ1bGwsXG5cdFx0XHR0b2dnbGVkOiB7XG5cdFx0XHRcdGNvbmRpdGlvbjogRWRpdG9yUGFydE1heGltaXplZEVkaXRvckdyb3VwQ29udGV4dCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd1bm1heGltaXplR3JvdXAnLCBcIlVubWF4aW1pemUgR3JvdXBcIilcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvckdyb3Vwc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGxpc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSk7XG5cblx0XHRjb25zdCByZXNvbHZlZENvbnRleHQgPSByZXNvbHZlQ29tbWFuZHNDb250ZXh0KGFyZ3MsIGVkaXRvclNlcnZpY2UsIGVkaXRvckdyb3Vwc1NlcnZpY2UsIGxpc3RTZXJ2aWNlKTtcblx0XHRpZiAocmVzb2x2ZWRDb250ZXh0Lmdyb3VwZWRFZGl0b3JzLmxlbmd0aCkge1xuXHRcdFx0ZWRpdG9yR3JvdXBzU2VydmljZS50b2dnbGVNYXhpbWl6ZUdyb3VwKHJlc29sdmVkQ29udGV4dC5ncm91cGVkRWRpdG9yc1swXS5ncm91cCk7XG5cdFx0fVxuXHR9XG59XG5cbmFic3RyYWN0IGNsYXNzIEFic3RyYWN0TmF2aWdhdGVFZGl0b3JBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JHcm91cFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5uYXZpZ2F0ZShlZGl0b3JHcm91cFNlcnZpY2UpO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBncm91cElkLCBlZGl0b3IgfSA9IHJlc3VsdDtcblx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGdyb3VwID0gZWRpdG9yR3JvdXBTZXJ2aWNlLmdldEdyb3VwKGdyb3VwSWQpO1xuXHRcdGlmIChncm91cCkge1xuXHRcdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihlZGl0b3IpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBuYXZpZ2F0ZShlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlKTogSUVkaXRvcklkZW50aWZpZXIgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuTmV4dEVkaXRvciBleHRlbmRzIEFic3RyYWN0TmF2aWdhdGVFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5uZXh0RWRpdG9yJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ29wZW5OZXh0RWRpdG9yJywgJ09wZW4gTmV4dCBFZGl0b3InKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlBhZ2VEb3duLFxuXHRcdFx0XHRtYWM6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLlJpZ2h0QXJyb3csXG5cdFx0XHRcdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkJyYWNrZXRSaWdodF1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBuYXZpZ2F0ZShlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlKTogSUVkaXRvcklkZW50aWZpZXIgfCB1bmRlZmluZWQge1xuXG5cdFx0Ly8gTmF2aWdhdGUgaW4gYWN0aXZlIGdyb3VwIGlmIHBvc3NpYmxlXG5cdFx0Y29uc3QgYWN0aXZlR3JvdXAgPSBlZGl0b3JHcm91cFNlcnZpY2UuYWN0aXZlR3JvdXA7XG5cdFx0Y29uc3QgYWN0aXZlR3JvdXBFZGl0b3JzID0gYWN0aXZlR3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCk7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9ySW5kZXggPSBhY3RpdmVHcm91cC5hY3RpdmVFZGl0b3IgPyBhY3RpdmVHcm91cEVkaXRvcnMuaW5kZXhPZihhY3RpdmVHcm91cC5hY3RpdmVFZGl0b3IpIDogLTE7XG5cdFx0aWYgKGFjdGl2ZUVkaXRvckluZGV4ICsgMSA8IGFjdGl2ZUdyb3VwRWRpdG9ycy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB7IGVkaXRvcjogYWN0aXZlR3JvdXBFZGl0b3JzW2FjdGl2ZUVkaXRvckluZGV4ICsgMV0sIGdyb3VwSWQ6IGFjdGl2ZUdyb3VwLmlkIH07XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlIHRyeSBpbiBuZXh0IGdyb3VwIHRoYXQgaGFzIGVkaXRvcnNcblx0XHRjb25zdCBoYW5kbGVkR3JvdXBzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cdFx0bGV0IGN1cnJlbnRHcm91cDogSUVkaXRvckdyb3VwIHwgdW5kZWZpbmVkID0gZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwO1xuXHRcdHdoaWxlIChjdXJyZW50R3JvdXAgJiYgIWhhbmRsZWRHcm91cHMuaGFzKGN1cnJlbnRHcm91cC5pZCkpIHtcblx0XHRcdGN1cnJlbnRHcm91cCA9IGVkaXRvckdyb3VwU2VydmljZS5maW5kR3JvdXAoeyBsb2NhdGlvbjogR3JvdXBMb2NhdGlvbi5ORVhUIH0sIGN1cnJlbnRHcm91cCwgdHJ1ZSk7XG5cdFx0XHRpZiAoY3VycmVudEdyb3VwKSB7XG5cdFx0XHRcdGhhbmRsZWRHcm91cHMuYWRkKGN1cnJlbnRHcm91cC5pZCk7XG5cblx0XHRcdFx0Y29uc3QgZ3JvdXBFZGl0b3JzID0gY3VycmVudEdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpO1xuXHRcdFx0XHRpZiAoZ3JvdXBFZGl0b3JzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRyZXR1cm4geyBlZGl0b3I6IGdyb3VwRWRpdG9yc1swXSwgZ3JvdXBJZDogY3VycmVudEdyb3VwLmlkIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuUHJldmlvdXNFZGl0b3IgZXh0ZW5kcyBBYnN0cmFjdE5hdmlnYXRlRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ucHJldmlvdXNFZGl0b3InLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3BlblByZXZpb3VzRWRpdG9yJywgJ09wZW4gUHJldmlvdXMgRWRpdG9yJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5QYWdlVXAsXG5cdFx0XHRcdG1hYzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuTGVmdEFycm93LFxuXHRcdFx0XHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5CcmFja2V0TGVmdF1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBuYXZpZ2F0ZShlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlKTogSUVkaXRvcklkZW50aWZpZXIgfCB1bmRlZmluZWQge1xuXG5cdFx0Ly8gTmF2aWdhdGUgaW4gYWN0aXZlIGdyb3VwIGlmIHBvc3NpYmxlXG5cdFx0Y29uc3QgYWN0aXZlR3JvdXAgPSBlZGl0b3JHcm91cFNlcnZpY2UuYWN0aXZlR3JvdXA7XG5cdFx0Y29uc3QgYWN0aXZlR3JvdXBFZGl0b3JzID0gYWN0aXZlR3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCk7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9ySW5kZXggPSBhY3RpdmVHcm91cC5hY3RpdmVFZGl0b3IgPyBhY3RpdmVHcm91cEVkaXRvcnMuaW5kZXhPZihhY3RpdmVHcm91cC5hY3RpdmVFZGl0b3IpIDogLTE7XG5cdFx0aWYgKGFjdGl2ZUVkaXRvckluZGV4ID4gMCkge1xuXHRcdFx0cmV0dXJuIHsgZWRpdG9yOiBhY3RpdmVHcm91cEVkaXRvcnNbYWN0aXZlRWRpdG9ySW5kZXggLSAxXSwgZ3JvdXBJZDogYWN0aXZlR3JvdXAuaWQgfTtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2UgdHJ5IGluIHByZXZpb3VzIGdyb3VwIHRoYXQgaGFzIGVkaXRvcnNcblx0XHRjb25zdCBoYW5kbGVkR3JvdXBzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cdFx0bGV0IGN1cnJlbnRHcm91cDogSUVkaXRvckdyb3VwIHwgdW5kZWZpbmVkID0gZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwO1xuXHRcdHdoaWxlIChjdXJyZW50R3JvdXAgJiYgIWhhbmRsZWRHcm91cHMuaGFzKGN1cnJlbnRHcm91cC5pZCkpIHtcblx0XHRcdGN1cnJlbnRHcm91cCA9IGVkaXRvckdyb3VwU2VydmljZS5maW5kR3JvdXAoeyBsb2NhdGlvbjogR3JvdXBMb2NhdGlvbi5QUkVWSU9VUyB9LCBjdXJyZW50R3JvdXAsIHRydWUpO1xuXHRcdFx0aWYgKGN1cnJlbnRHcm91cCkge1xuXHRcdFx0XHRoYW5kbGVkR3JvdXBzLmFkZChjdXJyZW50R3JvdXAuaWQpO1xuXG5cdFx0XHRcdGNvbnN0IGdyb3VwRWRpdG9ycyA9IGN1cnJlbnRHcm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKTtcblx0XHRcdFx0aWYgKGdyb3VwRWRpdG9ycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgZWRpdG9yOiBncm91cEVkaXRvcnNbZ3JvdXBFZGl0b3JzLmxlbmd0aCAtIDFdLCBncm91cElkOiBjdXJyZW50R3JvdXAuaWQgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE9wZW5OZXh0RWRpdG9ySW5Hcm91cCBleHRlbmRzIEFic3RyYWN0TmF2aWdhdGVFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5uZXh0RWRpdG9ySW5Hcm91cCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCduZXh0RWRpdG9ySW5Hcm91cCcsICdPcGVuIE5leHQgRWRpdG9yIGluIEdyb3VwJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuUGFnZURvd24pLFxuXHRcdFx0XHRtYWM6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5SaWdodEFycm93KVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG5hdmlnYXRlKGVkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UpOiBJRWRpdG9ySWRlbnRpZmllciB7XG5cdFx0Y29uc3QgZ3JvdXAgPSBlZGl0b3JHcm91cFNlcnZpY2UuYWN0aXZlR3JvdXA7XG5cdFx0Y29uc3QgZWRpdG9ycyA9IGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpO1xuXHRcdGNvbnN0IGluZGV4ID0gZ3JvdXAuYWN0aXZlRWRpdG9yID8gZWRpdG9ycy5pbmRleE9mKGdyb3VwLmFjdGl2ZUVkaXRvcikgOiAtMTtcblxuXHRcdHJldHVybiB7IGVkaXRvcjogaW5kZXggKyAxIDwgZWRpdG9ycy5sZW5ndGggPyBlZGl0b3JzW2luZGV4ICsgMV0gOiBlZGl0b3JzWzBdLCBncm91cElkOiBncm91cC5pZCB9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuUHJldmlvdXNFZGl0b3JJbkdyb3VwIGV4dGVuZHMgQWJzdHJhY3ROYXZpZ2F0ZUVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnByZXZpb3VzRWRpdG9ySW5Hcm91cCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdvcGVuUHJldmlvdXNFZGl0b3JJbkdyb3VwJywgJ09wZW4gUHJldmlvdXMgRWRpdG9yIGluIEdyb3VwJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuUGFnZVVwKSxcblx0XHRcdFx0bWFjOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuTGVmdEFycm93KVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG5hdmlnYXRlKGVkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UpOiBJRWRpdG9ySWRlbnRpZmllciB7XG5cdFx0Y29uc3QgZ3JvdXAgPSBlZGl0b3JHcm91cFNlcnZpY2UuYWN0aXZlR3JvdXA7XG5cdFx0Y29uc3QgZWRpdG9ycyA9IGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpO1xuXHRcdGNvbnN0IGluZGV4ID0gZ3JvdXAuYWN0aXZlRWRpdG9yID8gZWRpdG9ycy5pbmRleE9mKGdyb3VwLmFjdGl2ZUVkaXRvcikgOiAtMTtcblxuXHRcdHJldHVybiB7IGVkaXRvcjogaW5kZXggPiAwID8gZWRpdG9yc1tpbmRleCAtIDFdIDogZWRpdG9yc1tlZGl0b3JzLmxlbmd0aCAtIDFdLCBncm91cElkOiBncm91cC5pZCB9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuRmlyc3RFZGl0b3JJbkdyb3VwIGV4dGVuZHMgQWJzdHJhY3ROYXZpZ2F0ZUVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmZpcnN0RWRpdG9ySW5Hcm91cCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdmaXJzdEVkaXRvckluR3JvdXAnLCAnT3BlbiBGaXJzdCBFZGl0b3IgaW4gR3JvdXAnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG5hdmlnYXRlKGVkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UpOiBJRWRpdG9ySWRlbnRpZmllciB7XG5cdFx0Y29uc3QgZ3JvdXAgPSBlZGl0b3JHcm91cFNlcnZpY2UuYWN0aXZlR3JvdXA7XG5cdFx0Y29uc3QgZWRpdG9ycyA9IGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpO1xuXG5cdFx0cmV0dXJuIHsgZWRpdG9yOiBlZGl0b3JzWzBdLCBncm91cElkOiBncm91cC5pZCB9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuTGFzdEVkaXRvckluR3JvdXAgZXh0ZW5kcyBBYnN0cmFjdE5hdmlnYXRlRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ubGFzdEVkaXRvckluR3JvdXAnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbGFzdEVkaXRvckluR3JvdXAnLCAnT3BlbiBMYXN0IEVkaXRvciBpbiBHcm91cCcpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5EaWdpdDAsXG5cdFx0XHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5EaWdpdDldLFxuXHRcdFx0XHRtYWM6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuRGlnaXQwLFxuXHRcdFx0XHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5EaWdpdDldXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3XG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgbmF2aWdhdGUoZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSk6IElFZGl0b3JJZGVudGlmaWVyIHtcblx0XHRjb25zdCBncm91cCA9IGVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cDtcblx0XHRjb25zdCBlZGl0b3JzID0gZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCk7XG5cblx0XHRyZXR1cm4geyBlZGl0b3I6IGVkaXRvcnNbZWRpdG9ycy5sZW5ndGggLSAxXSwgZ3JvdXBJZDogZ3JvdXAuaWQgfTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTmF2aWdhdGVGb3J3YXJkQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24ubmF2aWdhdGVGb3J3YXJkJztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUoJ25hdmlnYXRlRm9yd2FyZCcsIFwiR28gRm9yd2FyZFwiKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTmF2aWdhdGVGb3J3YXJkQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0Li4ubG9jYWxpemUyKCduYXZpZ2F0ZUZvcndhcmQnLCBcIkdvIEZvcndhcmRcIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlGb3J3YXJkJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmRm9yd2FyZFwiKVxuXHRcdFx0fSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5hcnJvd1JpZ2h0LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5oYXMoJ2Nhbk5hdmlnYXRlRm9yd2FyZCcpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0d2luOiB7IHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLlJpZ2h0QXJyb3csIHNlY29uZGFyeTogW0tleUNvZGUuQnJvd3NlckZvcndhcmRdIH0sXG5cdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuTWludXMsIHNlY29uZGFyeTogW0tleUNvZGUuQnJvd3NlckZvcndhcmRdIH0sXG5cdFx0XHRcdGxpbnV4OiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5NaW51cywgc2Vjb25kYXJ5OiBbS2V5Q29kZS5Ccm93c2VyRm9yd2FyZF0gfVxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0eyBpZDogTWVudUlkLk1lbnViYXJHb01lbnUsIGdyb3VwOiAnMV9oaXN0b3J5X25hdicsIG9yZGVyOiAyIH0sXG5cdFx0XHRcdHsgaWQ6IE1lbnVJZC5Db21tYW5kQ2VudGVyLCBvcmRlcjogMiwgd2hlbjogQ29udGV4dEtleUV4cHIuaGFzKCdjb25maWcud29ya2JlbmNoLm5hdmlnYXRpb25Db250cm9sLmVuYWJsZWQnKSB9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBoaXN0b3J5U2VydmljZSA9IGFjY2Vzc29yLmdldChJSGlzdG9yeVNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgaGlzdG9yeVNlcnZpY2UuZ29Gb3J3YXJkKEdvRmlsdGVyLk5PTkUpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBOYXZpZ2F0ZUJhY2t3YXJkc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLm5hdmlnYXRlQmFjayc7XG5cdHN0YXRpYyByZWFkb25seSBMQUJFTCA9IGxvY2FsaXplKCduYXZpZ2F0ZUJhY2snLCBcIkdvIEJhY2tcIik7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE5hdmlnYXRlQmFja3dhcmRzQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0Li4ubG9jYWxpemUyKCduYXZpZ2F0ZUJhY2snLCBcIkdvIEJhY2tcIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlCYWNrJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmQmFja1wiKVxuXHRcdFx0fSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5oYXMoJ2Nhbk5hdmlnYXRlQmFjaycpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5hcnJvd0xlZnQsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHR3aW46IHsgcHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuTGVmdEFycm93LCBzZWNvbmRhcnk6IFtLZXlDb2RlLkJyb3dzZXJCYWNrXSB9LFxuXHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLk1pbnVzLCBzZWNvbmRhcnk6IFtLZXlDb2RlLkJyb3dzZXJCYWNrXSB9LFxuXHRcdFx0XHRsaW51eDogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLk1pbnVzLCBzZWNvbmRhcnk6IFtLZXlDb2RlLkJyb3dzZXJCYWNrXSB9XG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7IGlkOiBNZW51SWQuTWVudWJhckdvTWVudSwgZ3JvdXA6ICcxX2hpc3RvcnlfbmF2Jywgb3JkZXI6IDEgfSxcblx0XHRcdFx0eyBpZDogTWVudUlkLkNvbW1hbmRDZW50ZXIsIG9yZGVyOiAxLCB3aGVuOiBDb250ZXh0S2V5RXhwci5oYXMoJ2NvbmZpZy53b3JrYmVuY2gubmF2aWdhdGlvbkNvbnRyb2wuZW5hYmxlZCcpIH1cblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGhpc3RvcnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElIaXN0b3J5U2VydmljZSk7XG5cblx0XHRhd2FpdCBoaXN0b3J5U2VydmljZS5nb0JhY2soR29GaWx0ZXIuTk9ORSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5hdmlnYXRlUHJldmlvdXNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ubmF2aWdhdGVMYXN0Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25hdmlnYXRlUHJldmlvdXMnLCAnR28gUHJldmlvdXMnKSxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBoaXN0b3J5U2VydmljZSA9IGFjY2Vzc29yLmdldChJSGlzdG9yeVNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgaGlzdG9yeVNlcnZpY2UuZ29QcmV2aW91cyhHb0ZpbHRlci5OT05FKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTmF2aWdhdGVGb3J3YXJkSW5FZGl0c0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5uYXZpZ2F0ZUZvcndhcmRJbkVkaXRMb2NhdGlvbnMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbmF2aWdhdGVGb3J3YXJkSW5FZGl0cycsICdHbyBGb3J3YXJkIGluIEVkaXQgTG9jYXRpb25zJyksXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUhpc3RvcnlTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IGhpc3RvcnlTZXJ2aWNlLmdvRm9yd2FyZChHb0ZpbHRlci5FRElUUyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5hdmlnYXRlQmFja3dhcmRzSW5FZGl0c0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5uYXZpZ2F0ZUJhY2tJbkVkaXRMb2NhdGlvbnMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbmF2aWdhdGVCYWNrSW5FZGl0cycsICdHbyBCYWNrIGluIEVkaXQgTG9jYXRpb25zJyksXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUhpc3RvcnlTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IGhpc3RvcnlTZXJ2aWNlLmdvQmFjayhHb0ZpbHRlci5FRElUUyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5hdmlnYXRlUHJldmlvdXNJbkVkaXRzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm5hdmlnYXRlUHJldmlvdXNJbkVkaXRMb2NhdGlvbnMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbmF2aWdhdGVQcmV2aW91c0luRWRpdHMnLCAnR28gUHJldmlvdXMgaW4gRWRpdCBMb2NhdGlvbnMnKSxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBoaXN0b3J5U2VydmljZSA9IGFjY2Vzc29yLmdldChJSGlzdG9yeVNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgaGlzdG9yeVNlcnZpY2UuZ29QcmV2aW91cyhHb0ZpbHRlci5FRElUUyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5hdmlnYXRlVG9MYXN0RWRpdExvY2F0aW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm5hdmlnYXRlVG9MYXN0RWRpdExvY2F0aW9uJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25hdmlnYXRlVG9MYXN0RWRpdExvY2F0aW9uJywgJ0dvIHRvIExhc3QgRWRpdCBMb2NhdGlvbicpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVEpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBoaXN0b3J5U2VydmljZSA9IGFjY2Vzc29yLmdldChJSGlzdG9yeVNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgaGlzdG9yeVNlcnZpY2UuZ29MYXN0KEdvRmlsdGVyLkVESVRTKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTmF2aWdhdGVGb3J3YXJkSW5OYXZpZ2F0aW9uc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5uYXZpZ2F0ZUZvcndhcmRJbk5hdmlnYXRpb25Mb2NhdGlvbnMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbmF2aWdhdGVGb3J3YXJkSW5OYXZpZ2F0aW9ucycsICdHbyBGb3J3YXJkIGluIE5hdmlnYXRpb24gTG9jYXRpb25zJyksXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUhpc3RvcnlTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IGhpc3RvcnlTZXJ2aWNlLmdvRm9yd2FyZChHb0ZpbHRlci5OQVZJR0FUSU9OKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTmF2aWdhdGVCYWNrd2FyZHNJbk5hdmlnYXRpb25zQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm5hdmlnYXRlQmFja0luTmF2aWdhdGlvbkxvY2F0aW9ucycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCduYXZpZ2F0ZUJhY2tJbk5hdmlnYXRpb25zJywgJ0dvIEJhY2sgaW4gTmF2aWdhdGlvbiBMb2NhdGlvbnMnKSxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBoaXN0b3J5U2VydmljZSA9IGFjY2Vzc29yLmdldChJSGlzdG9yeVNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgaGlzdG9yeVNlcnZpY2UuZ29CYWNrKEdvRmlsdGVyLk5BVklHQVRJT04pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBOYXZpZ2F0ZVByZXZpb3VzSW5OYXZpZ2F0aW9uc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5uYXZpZ2F0ZVByZXZpb3VzSW5OYXZpZ2F0aW9uTG9jYXRpb25zJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25hdmlnYXRlUHJldmlvdXNJbk5hdmlnYXRpb25Mb2NhdGlvbnMnLCAnR28gUHJldmlvdXMgaW4gTmF2aWdhdGlvbiBMb2NhdGlvbnMnKSxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBoaXN0b3J5U2VydmljZSA9IGFjY2Vzc29yLmdldChJSGlzdG9yeVNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgaGlzdG9yeVNlcnZpY2UuZ29QcmV2aW91cyhHb0ZpbHRlci5OQVZJR0FUSU9OKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTmF2aWdhdGVUb0xhc3ROYXZpZ2F0aW9uTG9jYXRpb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ubmF2aWdhdGVUb0xhc3ROYXZpZ2F0aW9uTG9jYXRpb24nLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbmF2aWdhdGVUb0xhc3ROYXZpZ2F0aW9uTG9jYXRpb24nLCAnR28gdG8gTGFzdCBOYXZpZ2F0aW9uIExvY2F0aW9uJyksXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUhpc3RvcnlTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IGhpc3RvcnlTZXJ2aWNlLmdvTGFzdChHb0ZpbHRlci5OQVZJR0FUSU9OKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUmVvcGVuQ2xvc2VkRWRpdG9yQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24ucmVvcGVuQ2xvc2VkRWRpdG9yJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogUmVvcGVuQ2xvc2VkRWRpdG9yQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncmVvcGVuQ2xvc2VkRWRpdG9yJywgJ1Jlb3BlbiBDbG9zZWQgRWRpdG9yJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlUXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUhpc3RvcnlTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IGhpc3RvcnlTZXJ2aWNlLnJlb3Blbkxhc3RDbG9zZWRFZGl0b3IoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2xlYXJSZWNlbnRGaWxlc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNsZWFyUmVjZW50RmlsZXMnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDbGVhclJlY2VudEZpbGVzQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2xlYXJSZWNlbnRGaWxlcycsICdDbGVhciBSZWNlbnRseSBPcGVuZWQuLi4nKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRmlsZVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtzcGFjZXNTZXJ2aWNlKTtcblx0XHRjb25zdCBoaXN0b3J5U2VydmljZSA9IGFjY2Vzc29yLmdldChJSGlzdG9yeVNlcnZpY2UpO1xuXG5cdFx0Ly8gQXNrIGZvciBjb25maXJtYXRpb25cblx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdHR5cGU6ICd3YXJuaW5nJyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdjb25maXJtQ2xlYXJSZWNlbnRzTWVzc2FnZScsIFwiRG8geW91IHdhbnQgdG8gY2xlYXIgYWxsIHJlY2VudGx5IG9wZW5lZCBmaWxlcyBhbmQgd29ya3NwYWNlcz9cIiksXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdjb25maXJtQ2xlYXJEZXRhaWwnLCBcIlRoaXMgYWN0aW9uIGlzIGlycmV2ZXJzaWJsZSFcIiksXG5cdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSh7IGtleTogJ2NsZWFyQnV0dG9uTGFiZWwnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZDbGVhclwiKVxuXHRcdH0pO1xuXG5cdFx0aWYgKCFjb25maXJtZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDbGVhciBnbG9iYWwgcmVjZW50bHkgb3BlbmVkXG5cdFx0d29ya3NwYWNlc1NlcnZpY2UuY2xlYXJSZWNlbnRseU9wZW5lZCgpO1xuXG5cdFx0Ly8gQ2xlYXIgd29ya3NwYWNlIHNwZWNpZmljIHJlY2VudGx5IG9wZW5lZFxuXHRcdGhpc3RvcnlTZXJ2aWNlLmNsZWFyUmVjZW50bHlPcGVuZWQoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2hvd0VkaXRvcnNJbkFjdGl2ZUdyb3VwQnlNb3N0UmVjZW50bHlVc2VkQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uc2hvd0VkaXRvcnNJbkFjdGl2ZUdyb3VwJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU2hvd0VkaXRvcnNJbkFjdGl2ZUdyb3VwQnlNb3N0UmVjZW50bHlVc2VkQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc2hvd0VkaXRvcnNJbkFjdGl2ZUdyb3VwJywgJ1Nob3cgRWRpdG9ycyBpbiBBY3RpdmUgR3JvdXAgQnkgTW9zdCBSZWNlbnRseSBVc2VkJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cblx0XHRxdWlja0lucHV0U2VydmljZS5xdWlja0FjY2Vzcy5zaG93KEFjdGl2ZUdyb3VwRWRpdG9yc0J5TW9zdFJlY2VudGx5VXNlZFF1aWNrQWNjZXNzLlBSRUZJWCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNob3dBbGxFZGl0b3JzQnlBcHBlYXJhbmNlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uc2hvd0FsbEVkaXRvcnMnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTaG93QWxsRWRpdG9yc0J5QXBwZWFyYW5jZUFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Nob3dBbGxFZGl0b3JzJywgJ1Nob3cgQWxsIEVkaXRvcnMgQnkgQXBwZWFyYW5jZScpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVApLFxuXHRcdFx0XHRtYWM6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLlRhYlxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRmlsZVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblxuXHRcdHF1aWNrSW5wdXRTZXJ2aWNlLnF1aWNrQWNjZXNzLnNob3coQWxsRWRpdG9yc0J5QXBwZWFyYW5jZVF1aWNrQWNjZXNzLlBSRUZJWCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNob3dBbGxFZGl0b3JzQnlNb3N0UmVjZW50bHlVc2VkQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uc2hvd0FsbEVkaXRvcnNCeU1vc3RSZWNlbnRseVVzZWQnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTaG93QWxsRWRpdG9yc0J5TW9zdFJlY2VudGx5VXNlZEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Nob3dBbGxFZGl0b3JzQnlNb3N0UmVjZW50bHlVc2VkJywgJ1Nob3cgQWxsIEVkaXRvcnMgQnkgTW9zdCBSZWNlbnRseSBVc2VkJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cblx0XHRxdWlja0lucHV0U2VydmljZS5xdWlja0FjY2Vzcy5zaG93KEFsbEVkaXRvcnNCeU1vc3RSZWNlbnRseVVzZWRRdWlja0FjY2Vzcy5QUkVGSVgpO1xuXHR9XG59XG5cbmFic3RyYWN0IGNsYXNzIEFic3RyYWN0UXVpY2tBY2Nlc3NFZGl0b3JBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRkZXNjOiBSZWFkb25seTxJQWN0aW9uMk9wdGlvbnM+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcHJlZml4OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpdGVtQWN0aXZhdGlvbjogSXRlbUFjdGl2YXRpb24gfCB1bmRlZmluZWQsXG5cdCkge1xuXHRcdHN1cGVyKGRlc2MpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qga2V5YmluZGluZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUtleWJpbmRpbmdTZXJ2aWNlKTtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qga2V5YmluZGluZ3MgPSBrZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5ncyh0aGlzLmRlc2MuaWQpO1xuXG5cdFx0cXVpY2tJbnB1dFNlcnZpY2UucXVpY2tBY2Nlc3Muc2hvdyh0aGlzLnByZWZpeCwge1xuXHRcdFx0cXVpY2tOYXZpZ2F0ZUNvbmZpZ3VyYXRpb246IHsga2V5YmluZGluZ3MgfSxcblx0XHRcdGl0ZW1BY3RpdmF0aW9uOiB0aGlzLml0ZW1BY3RpdmF0aW9uXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFF1aWNrQWNjZXNzUHJldmlvdXNSZWNlbnRseVVzZWRFZGl0b3JBY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdFF1aWNrQWNjZXNzRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ucXVpY2tPcGVuUHJldmlvdXNSZWNlbnRseVVzZWRFZGl0b3InLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncXVpY2tPcGVuUHJldmlvdXNSZWNlbnRseVVzZWRFZGl0b3InLCAnUXVpY2sgT3BlbiBQcmV2aW91cyBSZWNlbnRseSBVc2VkIEVkaXRvcicpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3XG5cdFx0fSwgQWxsRWRpdG9yc0J5TW9zdFJlY2VudGx5VXNlZFF1aWNrQWNjZXNzLlBSRUZJWCwgdW5kZWZpbmVkKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUXVpY2tBY2Nlc3NMZWFzdFJlY2VudGx5VXNlZEVkaXRvckFjdGlvbiBleHRlbmRzIEFic3RyYWN0UXVpY2tBY2Nlc3NFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5xdWlja09wZW5MZWFzdFJlY2VudGx5VXNlZEVkaXRvcicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdxdWlja09wZW5MZWFzdFJlY2VudGx5VXNlZEVkaXRvcicsICdRdWljayBPcGVuIExlYXN0IFJlY2VudGx5IFVzZWQgRWRpdG9yJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9LCBBbGxFZGl0b3JzQnlNb3N0UmVjZW50bHlVc2VkUXVpY2tBY2Nlc3MuUFJFRklYLCB1bmRlZmluZWQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBRdWlja0FjY2Vzc1ByZXZpb3VzUmVjZW50bHlVc2VkRWRpdG9ySW5Hcm91cEFjdGlvbiBleHRlbmRzIEFic3RyYWN0UXVpY2tBY2Nlc3NFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5xdWlja09wZW5QcmV2aW91c1JlY2VudGx5VXNlZEVkaXRvckluR3JvdXAnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncXVpY2tPcGVuUHJldmlvdXNSZWNlbnRseVVzZWRFZGl0b3JJbkdyb3VwJywgJ1F1aWNrIE9wZW4gUHJldmlvdXMgUmVjZW50bHkgVXNlZCBFZGl0b3IgaW4gR3JvdXAnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlRhYixcblx0XHRcdFx0bWFjOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLlRhYlxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBBY3RpdmVFZGl0b3JHcm91cEVtcHR5Q29udGV4dC50b05lZ2F0ZWQoKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9LCBBY3RpdmVHcm91cEVkaXRvcnNCeU1vc3RSZWNlbnRseVVzZWRRdWlja0FjY2Vzcy5QUkVGSVgsIHVuZGVmaW5lZCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFF1aWNrQWNjZXNzTGVhc3RSZWNlbnRseVVzZWRFZGl0b3JJbkdyb3VwQWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RRdWlja0FjY2Vzc0VkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnF1aWNrT3BlbkxlYXN0UmVjZW50bHlVc2VkRWRpdG9ySW5Hcm91cCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdxdWlja09wZW5MZWFzdFJlY2VudGx5VXNlZEVkaXRvckluR3JvdXAnLCAnUXVpY2sgT3BlbiBMZWFzdCBSZWNlbnRseSBVc2VkIEVkaXRvciBpbiBHcm91cCcpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVGFiLFxuXHRcdFx0XHRtYWM6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVGFiXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRwcmVjb25kaXRpb246IEFjdGl2ZUVkaXRvckdyb3VwRW1wdHlDb250ZXh0LnRvTmVnYXRlZCgpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0sIEFjdGl2ZUdyb3VwRWRpdG9yc0J5TW9zdFJlY2VudGx5VXNlZFF1aWNrQWNjZXNzLlBSRUZJWCwgSXRlbUFjdGl2YXRpb24uTEFTVCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFF1aWNrQWNjZXNzUHJldmlvdXNFZGl0b3JGcm9tSGlzdG9yeUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblByZXZpb3VzRWRpdG9yRnJvbUhpc3RvcnknO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBRdWlja0FjY2Vzc1ByZXZpb3VzRWRpdG9yRnJvbUhpc3RvcnlBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCduYXZpZ2F0ZUVkaXRvckhpc3RvcnlCeUlucHV0JywgJ1F1aWNrIE9wZW4gUHJldmlvdXMgRWRpdG9yIGZyb20gSGlzdG9yeScpLFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGtleWJpbmRpbmdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElLZXliaW5kaW5nU2VydmljZSk7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JHcm91cFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXG5cdFx0Y29uc3Qga2V5YmluZGluZ3MgPSBrZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5ncyhRdWlja0FjY2Vzc1ByZXZpb3VzRWRpdG9yRnJvbUhpc3RvcnlBY3Rpb24uSUQpO1xuXG5cdFx0Ly8gRW5mb3JjZSB0byBhY3RpdmF0ZSB0aGUgZmlyc3QgaXRlbSBpbiBxdWljayBhY2Nlc3MgaWZcblx0XHQvLyB0aGUgY3VycmVudGx5IGFjdGl2ZSBlZGl0b3IgZ3JvdXAgaGFzIG4gZWRpdG9yIG9wZW5lZFxuXHRcdGxldCBpdGVtQWN0aXZhdGlvbjogSXRlbUFjdGl2YXRpb24gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKGVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cC5jb3VudCA9PT0gMCkge1xuXHRcdFx0aXRlbUFjdGl2YXRpb24gPSBJdGVtQWN0aXZhdGlvbi5GSVJTVDtcblx0XHR9XG5cblx0XHRxdWlja0lucHV0U2VydmljZS5xdWlja0FjY2Vzcy5zaG93KCcnLCB7IHF1aWNrTmF2aWdhdGVDb25maWd1cmF0aW9uOiB7IGtleWJpbmRpbmdzIH0sIGl0ZW1BY3RpdmF0aW9uIH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuTmV4dFJlY2VudGx5VXNlZEVkaXRvckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuTmV4dFJlY2VudGx5VXNlZEVkaXRvcicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdvcGVuTmV4dFJlY2VudGx5VXNlZEVkaXRvcicsICdPcGVuIE5leHQgUmVjZW50bHkgVXNlZCBFZGl0b3InKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUhpc3RvcnlTZXJ2aWNlKTtcblxuXHRcdGhpc3RvcnlTZXJ2aWNlLm9wZW5OZXh0UmVjZW50bHlVc2VkRWRpdG9yKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE9wZW5QcmV2aW91c1JlY2VudGx5VXNlZEVkaXRvckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuUHJldmlvdXNSZWNlbnRseVVzZWRFZGl0b3InLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3BlblByZXZpb3VzUmVjZW50bHlVc2VkRWRpdG9yJywgJ09wZW4gUHJldmlvdXMgUmVjZW50bHkgVXNlZCBFZGl0b3InKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUhpc3RvcnlTZXJ2aWNlKTtcblxuXHRcdGhpc3RvcnlTZXJ2aWNlLm9wZW5QcmV2aW91c2x5VXNlZEVkaXRvcigpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuTmV4dFJlY2VudGx5VXNlZEVkaXRvckluR3JvdXBBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ub3Blbk5leHRSZWNlbnRseVVzZWRFZGl0b3JJbkdyb3VwJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ29wZW5OZXh0UmVjZW50bHlVc2VkRWRpdG9ySW5Hcm91cCcsICdPcGVuIE5leHQgUmVjZW50bHkgVXNlZCBFZGl0b3IgSW4gR3JvdXAnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUhpc3RvcnlTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JHcm91cHNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblxuXHRcdGhpc3RvcnlTZXJ2aWNlLm9wZW5OZXh0UmVjZW50bHlVc2VkRWRpdG9yKGVkaXRvckdyb3Vwc1NlcnZpY2UuYWN0aXZlR3JvdXAuaWQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuUHJldmlvdXNSZWNlbnRseVVzZWRFZGl0b3JJbkdyb3VwQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5QcmV2aW91c1JlY2VudGx5VXNlZEVkaXRvckluR3JvdXAnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3BlblByZXZpb3VzUmVjZW50bHlVc2VkRWRpdG9ySW5Hcm91cCcsICdPcGVuIFByZXZpb3VzIFJlY2VudGx5IFVzZWQgRWRpdG9yIEluIEdyb3VwJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGhpc3RvcnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElIaXN0b3J5U2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yR3JvdXBzU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cblx0XHRoaXN0b3J5U2VydmljZS5vcGVuUHJldmlvdXNseVVzZWRFZGl0b3IoZWRpdG9yR3JvdXBzU2VydmljZS5hY3RpdmVHcm91cC5pZCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENsZWFyRWRpdG9ySGlzdG9yeVdpdGhvdXRDb25maXJtQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNsZWFyRWRpdG9ySGlzdG9yeVdpdGhvdXRDb25maXJtJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NsZWFyRWRpdG9ySGlzdG9yeVdpdGhvdXRDb25maXJtJywgJ0NsZWFyIEVkaXRvciBIaXN0b3J5IHdpdGhvdXQgQ29uZmlybWF0aW9uJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogSW5BdXRvbWF0aW9uQ29udGV4dFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUhpc3RvcnlTZXJ2aWNlKTtcblxuXHRcdC8vIENsZWFyIGVkaXRvciBoaXN0b3J5XG5cdFx0aGlzdG9yeVNlcnZpY2UuY2xlYXIoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2xlYXJFZGl0b3JIaXN0b3J5QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNsZWFyRWRpdG9ySGlzdG9yeScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjbGVhckVkaXRvckhpc3RvcnknLCAnQ2xlYXIgRWRpdG9yIEhpc3RvcnknKSxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBoaXN0b3J5U2VydmljZSA9IGFjY2Vzc29yLmdldChJSGlzdG9yeVNlcnZpY2UpO1xuXG5cdFx0Ly8gQXNrIGZvciBjb25maXJtYXRpb25cblx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdHR5cGU6ICd3YXJuaW5nJyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdjb25maXJtQ2xlYXJFZGl0b3JIaXN0b3J5TWVzc2FnZScsIFwiRG8geW91IHdhbnQgdG8gY2xlYXIgdGhlIGhpc3Rvcnkgb2YgcmVjZW50bHkgb3BlbmVkIGVkaXRvcnM/XCIpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnY29uZmlybUNsZWFyRGV0YWlsJywgXCJUaGlzIGFjdGlvbiBpcyBpcnJldmVyc2libGUhXCIpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoeyBrZXk6ICdjbGVhckJ1dHRvbkxhYmVsJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmQ2xlYXJcIilcblx0XHR9KTtcblxuXHRcdGlmICghY29uZmlybWVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ2xlYXIgZWRpdG9yIGhpc3Rvcnlcblx0XHRoaXN0b3J5U2VydmljZS5jbGVhcigpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNb3ZlRWRpdG9yTGVmdEluR3JvdXBBY3Rpb24gZXh0ZW5kcyBFeGVjdXRlQ29tbWFuZEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm1vdmVFZGl0b3JMZWZ0SW5Hcm91cCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtb3ZlRWRpdG9yTGVmdCcsICdNb3ZlIEVkaXRvciBMZWZ0JyksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuUGFnZVVwLFxuXHRcdFx0XHRtYWM6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkxlZnRBcnJvdylcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0sIE1PVkVfQUNUSVZFX0VESVRPUl9DT01NQU5EX0lELCB7IHRvOiAnbGVmdCcgfSBzYXRpc2ZpZXMgU2VsZWN0ZWRFZGl0b3JzTW92ZUNvcHlBcmd1bWVudHMpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNb3ZlRWRpdG9yUmlnaHRJbkdyb3VwQWN0aW9uIGV4dGVuZHMgRXhlY3V0ZUNvbW1hbmRBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5tb3ZlRWRpdG9yUmlnaHRJbkdyb3VwJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21vdmVFZGl0b3JSaWdodCcsICdNb3ZlIEVkaXRvciBSaWdodCcpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlBhZ2VEb3duLFxuXHRcdFx0XHRtYWM6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlJpZ2h0QXJyb3cpXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9LCBNT1ZFX0FDVElWRV9FRElUT1JfQ09NTUFORF9JRCwgeyB0bzogJ3JpZ2h0JyB9IHNhdGlzZmllcyBTZWxlY3RlZEVkaXRvcnNNb3ZlQ29weUFyZ3VtZW50cyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vdmVFZGl0b3JUb1N0YXJ0QWN0aW9uIGV4dGVuZHMgRXhlY3V0ZUNvbW1hbmRBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5tb3ZlRWRpdG9yVG9TdGFydCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtb3ZlRWRpdG9yVG9TdGFydCcsICdNb3ZlIEVkaXRvciB0byBTdGFydCcpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3XG5cdFx0fSwgTU9WRV9BQ1RJVkVfRURJVE9SX0NPTU1BTkRfSUQsIHsgdG86ICdmaXJzdCcgfSBzYXRpc2ZpZXMgU2VsZWN0ZWRFZGl0b3JzTW92ZUNvcHlBcmd1bWVudHMpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNb3ZlRWRpdG9yVG9FbmRBY3Rpb24gZXh0ZW5kcyBFeGVjdXRlQ29tbWFuZEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm1vdmVFZGl0b3JUb0VuZCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtb3ZlRWRpdG9yVG9FbmQnLCAnTW92ZSBFZGl0b3IgdG8gRW5kJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9LCBNT1ZFX0FDVElWRV9FRElUT1JfQ09NTUFORF9JRCwgeyB0bzogJ2xhc3QnIH0gc2F0aXNmaWVzIFNlbGVjdGVkRWRpdG9yc01vdmVDb3B5QXJndW1lbnRzKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTW92ZUVkaXRvclRvUHJldmlvdXNHcm91cEFjdGlvbiBleHRlbmRzIEV4ZWN1dGVDb21tYW5kQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ubW92ZUVkaXRvclRvUHJldmlvdXNHcm91cCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtb3ZlRWRpdG9yVG9QcmV2aW91c0dyb3VwJywgJ01vdmUgRWRpdG9yIGludG8gUHJldmlvdXMgR3JvdXAnKSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuTGVmdEFycm93LFxuXHRcdFx0XHRtYWM6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5MZWZ0QXJyb3dcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHR9LCBNT1ZFX0FDVElWRV9FRElUT1JfQ09NTUFORF9JRCwgeyB0bzogJ3ByZXZpb3VzJywgYnk6ICdncm91cCcgfSBzYXRpc2ZpZXMgU2VsZWN0ZWRFZGl0b3JzTW92ZUNvcHlBcmd1bWVudHMpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNb3ZlRWRpdG9yVG9OZXh0R3JvdXBBY3Rpb24gZXh0ZW5kcyBFeGVjdXRlQ29tbWFuZEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm1vdmVFZGl0b3JUb05leHRHcm91cCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtb3ZlRWRpdG9yVG9OZXh0R3JvdXAnLCAnTW92ZSBFZGl0b3IgaW50byBOZXh0IEdyb3VwJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuUmlnaHRBcnJvdyxcblx0XHRcdFx0bWFjOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuUmlnaHRBcnJvd1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0sIE1PVkVfQUNUSVZFX0VESVRPUl9DT01NQU5EX0lELCB7IHRvOiAnbmV4dCcsIGJ5OiAnZ3JvdXAnIH0gc2F0aXNmaWVzIFNlbGVjdGVkRWRpdG9yc01vdmVDb3B5QXJndW1lbnRzKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTW92ZUVkaXRvclRvQWJvdmVHcm91cEFjdGlvbiBleHRlbmRzIEV4ZWN1dGVDb21tYW5kQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTU9WRV9FRElUT1JfSU5UT19BQk9WRV9HUk9VUCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21vdmVFZGl0b3JUb0Fib3ZlR3JvdXAnLCAnTW92ZSBFZGl0b3IgaW50byBHcm91cCBBYm92ZScpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3XG5cdFx0fSwgTU9WRV9FRElUT1JfSU5UT19BQk9WRV9HUk9VUCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vdmVFZGl0b3JUb0JlbG93R3JvdXBBY3Rpb24gZXh0ZW5kcyBFeGVjdXRlQ29tbWFuZEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1PVkVfRURJVE9SX0lOVE9fQkVMT1dfR1JPVVAsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtb3ZlRWRpdG9yVG9CZWxvd0dyb3VwJywgJ01vdmUgRWRpdG9yIGludG8gR3JvdXAgQmVsb3cnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0sIE1PVkVfRURJVE9SX0lOVE9fQkVMT1dfR1JPVVApO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNb3ZlRWRpdG9yVG9MZWZ0R3JvdXBBY3Rpb24gZXh0ZW5kcyBFeGVjdXRlQ29tbWFuZEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1PVkVfRURJVE9SX0lOVE9fTEVGVF9HUk9VUCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21vdmVFZGl0b3JUb0xlZnRHcm91cCcsICdNb3ZlIEVkaXRvciBpbnRvIExlZnQgR3JvdXAnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0sIE1PVkVfRURJVE9SX0lOVE9fTEVGVF9HUk9VUCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vdmVFZGl0b3JUb1JpZ2h0R3JvdXBBY3Rpb24gZXh0ZW5kcyBFeGVjdXRlQ29tbWFuZEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1PVkVfRURJVE9SX0lOVE9fUklHSFRfR1JPVVAsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtb3ZlRWRpdG9yVG9SaWdodEdyb3VwJywgJ01vdmUgRWRpdG9yIGludG8gUmlnaHQgR3JvdXAnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0sIE1PVkVfRURJVE9SX0lOVE9fUklHSFRfR1JPVVApO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNb3ZlRWRpdG9yVG9GaXJzdEdyb3VwQWN0aW9uIGV4dGVuZHMgRXhlY3V0ZUNvbW1hbmRBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5tb3ZlRWRpdG9yVG9GaXJzdEdyb3VwJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21vdmVFZGl0b3JUb0ZpcnN0R3JvdXAnLCAnTW92ZSBFZGl0b3IgaW50byBGaXJzdCBHcm91cCcpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5EaWdpdDEsXG5cdFx0XHRcdG1hYzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLkRpZ2l0MVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0sIE1PVkVfQUNUSVZFX0VESVRPUl9DT01NQU5EX0lELCB7IHRvOiAnZmlyc3QnLCBieTogJ2dyb3VwJyB9IHNhdGlzZmllcyBTZWxlY3RlZEVkaXRvcnNNb3ZlQ29weUFyZ3VtZW50cyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vdmVFZGl0b3JUb0xhc3RHcm91cEFjdGlvbiBleHRlbmRzIEV4ZWN1dGVDb21tYW5kQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ubW92ZUVkaXRvclRvTGFzdEdyb3VwJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21vdmVFZGl0b3JUb0xhc3RHcm91cCcsICdNb3ZlIEVkaXRvciBpbnRvIExhc3QgR3JvdXAnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuRGlnaXQ5LFxuXHRcdFx0XHRtYWM6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5EaWdpdDlcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9LCBNT1ZFX0FDVElWRV9FRElUT1JfQ09NTUFORF9JRCwgeyB0bzogJ2xhc3QnLCBieTogJ2dyb3VwJyB9IHNhdGlzZmllcyBTZWxlY3RlZEVkaXRvcnNNb3ZlQ29weUFyZ3VtZW50cyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNwbGl0RWRpdG9yVG9QcmV2aW91c0dyb3VwQWN0aW9uIGV4dGVuZHMgRXhlY3V0ZUNvbW1hbmRBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5zcGxpdEVkaXRvclRvUHJldmlvdXNHcm91cCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzcGxpdEVkaXRvclRvUHJldmlvdXNHcm91cCcsICdTcGxpdCBFZGl0b3IgaW50byBQcmV2aW91cyBHcm91cCcpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3XG5cdFx0fSwgQ09QWV9BQ1RJVkVfRURJVE9SX0NPTU1BTkRfSUQsIHsgdG86ICdwcmV2aW91cycsIGJ5OiAnZ3JvdXAnIH0gc2F0aXNmaWVzIFNlbGVjdGVkRWRpdG9yc01vdmVDb3B5QXJndW1lbnRzKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3BsaXRFZGl0b3JUb05leHRHcm91cEFjdGlvbiBleHRlbmRzIEV4ZWN1dGVDb21tYW5kQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uc3BsaXRFZGl0b3JUb05leHRHcm91cCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzcGxpdEVkaXRvclRvTmV4dEdyb3VwJywgJ1NwbGl0IEVkaXRvciBpbnRvIE5leHQgR3JvdXAnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0sIENPUFlfQUNUSVZFX0VESVRPUl9DT01NQU5EX0lELCB7IHRvOiAnbmV4dCcsIGJ5OiAnZ3JvdXAnIH0gc2F0aXNmaWVzIFNlbGVjdGVkRWRpdG9yc01vdmVDb3B5QXJndW1lbnRzKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3BsaXRFZGl0b3JUb0Fib3ZlR3JvdXBBY3Rpb24gZXh0ZW5kcyBFeGVjdXRlQ29tbWFuZEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnNwbGl0RWRpdG9yVG9BYm92ZUdyb3VwJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3NwbGl0RWRpdG9yVG9BYm92ZUdyb3VwJywgJ1NwbGl0IEVkaXRvciBpbnRvIEdyb3VwIEFib3ZlJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9LCBDT1BZX0FDVElWRV9FRElUT1JfQ09NTUFORF9JRCwgeyB0bzogJ3VwJywgYnk6ICdncm91cCcgfSBzYXRpc2ZpZXMgU2VsZWN0ZWRFZGl0b3JzTW92ZUNvcHlBcmd1bWVudHMpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTcGxpdEVkaXRvclRvQmVsb3dHcm91cEFjdGlvbiBleHRlbmRzIEV4ZWN1dGVDb21tYW5kQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uc3BsaXRFZGl0b3JUb0JlbG93R3JvdXAnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc3BsaXRFZGl0b3JUb0JlbG93R3JvdXAnLCAnU3BsaXQgRWRpdG9yIGludG8gR3JvdXAgQmVsb3cnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0sIENPUFlfQUNUSVZFX0VESVRPUl9DT01NQU5EX0lELCB7IHRvOiAnZG93bicsIGJ5OiAnZ3JvdXAnIH0gc2F0aXNmaWVzIFNlbGVjdGVkRWRpdG9yc01vdmVDb3B5QXJndW1lbnRzKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3BsaXRFZGl0b3JUb0xlZnRHcm91cEFjdGlvbiBleHRlbmRzIEV4ZWN1dGVDb21tYW5kQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5zcGxpdEVkaXRvclRvTGVmdEdyb3VwJztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUoJ3NwbGl0RWRpdG9yVG9MZWZ0R3JvdXAnLCBcIlNwbGl0IEVkaXRvciBpbnRvIExlZnQgR3JvdXBcIik7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnNwbGl0RWRpdG9yVG9MZWZ0R3JvdXAnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc3BsaXRFZGl0b3JUb0xlZnRHcm91cCcsIFwiU3BsaXQgRWRpdG9yIGludG8gTGVmdCBHcm91cFwiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0sIENPUFlfQUNUSVZFX0VESVRPUl9DT01NQU5EX0lELCB7IHRvOiAnbGVmdCcsIGJ5OiAnZ3JvdXAnIH0gc2F0aXNmaWVzIFNlbGVjdGVkRWRpdG9yc01vdmVDb3B5QXJndW1lbnRzKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3BsaXRFZGl0b3JUb1JpZ2h0R3JvdXBBY3Rpb24gZXh0ZW5kcyBFeGVjdXRlQ29tbWFuZEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnNwbGl0RWRpdG9yVG9SaWdodEdyb3VwJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3NwbGl0RWRpdG9yVG9SaWdodEdyb3VwJywgJ1NwbGl0IEVkaXRvciBpbnRvIFJpZ2h0IEdyb3VwJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9LCBDT1BZX0FDVElWRV9FRElUT1JfQ09NTUFORF9JRCwgeyB0bzogJ3JpZ2h0JywgYnk6ICdncm91cCcgfSBzYXRpc2ZpZXMgU2VsZWN0ZWRFZGl0b3JzTW92ZUNvcHlBcmd1bWVudHMpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTcGxpdEVkaXRvclRvRmlyc3RHcm91cEFjdGlvbiBleHRlbmRzIEV4ZWN1dGVDb21tYW5kQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uc3BsaXRFZGl0b3JUb0ZpcnN0R3JvdXAnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc3BsaXRFZGl0b3JUb0ZpcnN0R3JvdXAnLCAnU3BsaXQgRWRpdG9yIGludG8gRmlyc3QgR3JvdXAnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0sIENPUFlfQUNUSVZFX0VESVRPUl9DT01NQU5EX0lELCB7IHRvOiAnZmlyc3QnLCBieTogJ2dyb3VwJyB9IHNhdGlzZmllcyBTZWxlY3RlZEVkaXRvcnNNb3ZlQ29weUFyZ3VtZW50cyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNwbGl0RWRpdG9yVG9MYXN0R3JvdXBBY3Rpb24gZXh0ZW5kcyBFeGVjdXRlQ29tbWFuZEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnNwbGl0RWRpdG9yVG9MYXN0R3JvdXAnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc3BsaXRFZGl0b3JUb0xhc3RHcm91cCcsICdTcGxpdCBFZGl0b3IgaW50byBMYXN0IEdyb3VwJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9LCBDT1BZX0FDVElWRV9FRElUT1JfQ09NTUFORF9JRCwgeyB0bzogJ2xhc3QnLCBieTogJ2dyb3VwJyB9IHNhdGlzZmllcyBTZWxlY3RlZEVkaXRvcnNNb3ZlQ29weUFyZ3VtZW50cyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEVkaXRvckxheW91dFNpbmdsZUFjdGlvbiBleHRlbmRzIEV4ZWN1dGVDb21tYW5kQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5lZGl0b3JMYXlvdXRTaW5nbGUnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBFZGl0b3JMYXlvdXRTaW5nbGVBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdlZGl0b3JMYXlvdXRTaW5nbGUnLCAnU2luZ2xlIENvbHVtbiBFZGl0b3IgTGF5b3V0JyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9LCBMQVlPVVRfRURJVE9SX0dST1VQU19DT01NQU5EX0lELCB7IGdyb3VwczogW3t9XSwgb3JpZW50YXRpb246IEdyb3VwT3JpZW50YXRpb24uSE9SSVpPTlRBTCB9IHNhdGlzZmllcyBFZGl0b3JHcm91cExheW91dCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEVkaXRvckxheW91dFR3b0NvbHVtbnNBY3Rpb24gZXh0ZW5kcyBFeGVjdXRlQ29tbWFuZEFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZWRpdG9yTGF5b3V0VHdvQ29sdW1ucyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEVkaXRvckxheW91dFR3b0NvbHVtbnNBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdlZGl0b3JMYXlvdXRUd29Db2x1bW5zJywgJ1R3byBDb2x1bW5zIEVkaXRvciBMYXlvdXQnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0sIExBWU9VVF9FRElUT1JfR1JPVVBTX0NPTU1BTkRfSUQsIHsgZ3JvdXBzOiBbe30sIHt9XSwgb3JpZW50YXRpb246IEdyb3VwT3JpZW50YXRpb24uSE9SSVpPTlRBTCB9IHNhdGlzZmllcyBFZGl0b3JHcm91cExheW91dCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEVkaXRvckxheW91dFRocmVlQ29sdW1uc0FjdGlvbiBleHRlbmRzIEV4ZWN1dGVDb21tYW5kQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5lZGl0b3JMYXlvdXRUaHJlZUNvbHVtbnMnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBFZGl0b3JMYXlvdXRUaHJlZUNvbHVtbnNBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdlZGl0b3JMYXlvdXRUaHJlZUNvbHVtbnMnLCAnVGhyZWUgQ29sdW1ucyBFZGl0b3IgTGF5b3V0JyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9LCBMQVlPVVRfRURJVE9SX0dST1VQU19DT01NQU5EX0lELCB7IGdyb3VwczogW3t9LCB7fSwge31dLCBvcmllbnRhdGlvbjogR3JvdXBPcmllbnRhdGlvbi5IT1JJWk9OVEFMIH0gc2F0aXNmaWVzIEVkaXRvckdyb3VwTGF5b3V0KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRWRpdG9yTGF5b3V0VHdvUm93c0FjdGlvbiBleHRlbmRzIEV4ZWN1dGVDb21tYW5kQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5lZGl0b3JMYXlvdXRUd29Sb3dzJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRWRpdG9yTGF5b3V0VHdvUm93c0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2VkaXRvckxheW91dFR3b1Jvd3MnLCAnVHdvIFJvd3MgRWRpdG9yIExheW91dCcpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3XG5cdFx0fSwgTEFZT1VUX0VESVRPUl9HUk9VUFNfQ09NTUFORF9JRCwgeyBncm91cHM6IFt7fSwge31dLCBvcmllbnRhdGlvbjogR3JvdXBPcmllbnRhdGlvbi5WRVJUSUNBTCB9IHNhdGlzZmllcyBFZGl0b3JHcm91cExheW91dCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEVkaXRvckxheW91dFRocmVlUm93c0FjdGlvbiBleHRlbmRzIEV4ZWN1dGVDb21tYW5kQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5lZGl0b3JMYXlvdXRUaHJlZVJvd3MnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBFZGl0b3JMYXlvdXRUaHJlZVJvd3NBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdlZGl0b3JMYXlvdXRUaHJlZVJvd3MnLCAnVGhyZWUgUm93cyBFZGl0b3IgTGF5b3V0JyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9LCBMQVlPVVRfRURJVE9SX0dST1VQU19DT01NQU5EX0lELCB7IGdyb3VwczogW3t9LCB7fSwge31dLCBvcmllbnRhdGlvbjogR3JvdXBPcmllbnRhdGlvbi5WRVJUSUNBTCB9IHNhdGlzZmllcyBFZGl0b3JHcm91cExheW91dCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEVkaXRvckxheW91dFR3b0J5VHdvR3JpZEFjdGlvbiBleHRlbmRzIEV4ZWN1dGVDb21tYW5kQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5lZGl0b3JMYXlvdXRUd29CeVR3b0dyaWQnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBFZGl0b3JMYXlvdXRUd29CeVR3b0dyaWRBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdlZGl0b3JMYXlvdXRUd29CeVR3b0dyaWQnLCAnR3JpZCBFZGl0b3IgTGF5b3V0ICgyeDIpJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9LCBMQVlPVVRfRURJVE9SX0dST1VQU19DT01NQU5EX0lELCB7IGdyb3VwczogW3sgZ3JvdXBzOiBbe30sIHt9XSB9LCB7IGdyb3VwczogW3t9LCB7fV0gfV0sIG9yaWVudGF0aW9uOiBHcm91cE9yaWVudGF0aW9uLkhPUklaT05UQUwgfSBzYXRpc2ZpZXMgRWRpdG9yR3JvdXBMYXlvdXQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFZGl0b3JMYXlvdXRUd29Db2x1bW5zQm90dG9tQWN0aW9uIGV4dGVuZHMgRXhlY3V0ZUNvbW1hbmRBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmVkaXRvckxheW91dFR3b0NvbHVtbnNCb3R0b20nO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBFZGl0b3JMYXlvdXRUd29Db2x1bW5zQm90dG9tQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZWRpdG9yTGF5b3V0VHdvQ29sdW1uc0JvdHRvbScsICdUd28gQ29sdW1ucyBCb3R0b20gRWRpdG9yIExheW91dCcpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3XG5cdFx0fSwgTEFZT1VUX0VESVRPUl9HUk9VUFNfQ09NTUFORF9JRCwgeyBncm91cHM6IFt7fSwgeyBncm91cHM6IFt7fSwge31dIH1dLCBvcmllbnRhdGlvbjogR3JvdXBPcmllbnRhdGlvbi5WRVJUSUNBTCB9IHNhdGlzZmllcyBFZGl0b3JHcm91cExheW91dCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEVkaXRvckxheW91dFR3b1Jvd3NSaWdodEFjdGlvbiBleHRlbmRzIEV4ZWN1dGVDb21tYW5kQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5lZGl0b3JMYXlvdXRUd29Sb3dzUmlnaHQnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBFZGl0b3JMYXlvdXRUd29Sb3dzUmlnaHRBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdlZGl0b3JMYXlvdXRUd29Sb3dzUmlnaHQnLCAnVHdvIFJvd3MgUmlnaHQgRWRpdG9yIExheW91dCcpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3XG5cdFx0fSwgTEFZT1VUX0VESVRPUl9HUk9VUFNfQ09NTUFORF9JRCwgeyBncm91cHM6IFt7fSwgeyBncm91cHM6IFt7fSwge31dIH1dLCBvcmllbnRhdGlvbjogR3JvdXBPcmllbnRhdGlvbi5IT1JJWk9OVEFMIH0gc2F0aXNmaWVzIEVkaXRvckdyb3VwTGF5b3V0KTtcblx0fVxufVxuXG5hYnN0cmFjdCBjbGFzcyBBYnN0cmFjdENyZWF0ZUVkaXRvckdyb3VwQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZGVzYzogUmVhZG9ubHk8SUFjdGlvbjJPcHRpb25zPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRpcmVjdGlvbjogR3JvdXBEaXJlY3Rpb25cblx0KSB7XG5cdFx0c3VwZXIoZGVzYyk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JHcm91cFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaExheW91dFNlcnZpY2UpO1xuXG5cdFx0Ly8gV2UgYXJlIGFib3V0IHRvIGNyZWF0ZSBhIG5ldyBlbXB0eSBlZGl0b3IgZ3JvdXAuIFdlIG1ha2UgYW4gb3BpbmlhdGVkXG5cdFx0Ly8gZGVjaXNpb24gaGVyZSB3aGV0aGVyIHRvIGZvY3VzIHRoYXQgbmV3IGVkaXRvciBncm91cCBvciBub3QgYmFzZWRcblx0XHQvLyBvbiB3aGF0IGlzIGN1cnJlbnRseSBmb2N1c2VkLiBJZiBmb2N1cyBpcyBvdXRzaWRlIHRoZSBlZGl0b3IgYXJlYSBub3Rcblx0XHQvLyBpbiB0aGUgPGJvZHk+LCB3ZSBkbyBub3QgZm9jdXMsIHdpdGggdGhlIHJhdGlvbmFsZSB0aGF0IGEgdXNlciBtaWdodFxuXHRcdC8vIGhhdmUgZm9jdXMgb24gYSB0cmVlL2xpc3Qgd2l0aCB0aGUgaW50ZW50aW9uIHRvIHBpY2sgYW4gZWxlbWVudCB0b1xuXHRcdC8vIG9wZW4gaW4gdGhlIG5ldyBncm91cCBmcm9tIHRoYXQgdHJlZS9saXN0LlxuXHRcdC8vXG5cdFx0Ly8gSWYgZm9jdXMgaXMgaW5zaWRlIHRoZSBlZGl0b3IgYXJlYSwgd2Ugd2FudCB0byBwcmV2ZW50IHRoZSBzaXR1YXRpb25cblx0XHQvLyBvZiBhbiBlZGl0b3IgaGF2aW5nIGtleWJvYXJkIGZvY3VzIGluIGFuIGluYWN0aXZlIGVkaXRvciBncm91cFxuXHRcdC8vIChzZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE4OTI1NilcblxuXHRcdGNvbnN0IGFjdGl2ZURvY3VtZW50ID0gZ2V0QWN0aXZlRG9jdW1lbnQoKTtcblx0XHRjb25zdCBmb2N1c05ld0dyb3VwID0gbGF5b3V0U2VydmljZS5oYXNGb2N1cyhQYXJ0cy5FRElUT1JfUEFSVCkgfHwgYWN0aXZlRG9jdW1lbnQuYWN0aXZlRWxlbWVudCA9PT0gYWN0aXZlRG9jdW1lbnQuYm9keTtcblxuXHRcdGNvbnN0IGdyb3VwID0gZWRpdG9yR3JvdXBTZXJ2aWNlLmFkZEdyb3VwKGVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cCwgdGhpcy5kaXJlY3Rpb24pO1xuXHRcdGVkaXRvckdyb3VwU2VydmljZS5hY3RpdmF0ZUdyb3VwKGdyb3VwKTtcblxuXHRcdGlmIChmb2N1c05ld0dyb3VwKSB7XG5cdFx0XHRncm91cC5mb2N1cygpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTmV3RWRpdG9yR3JvdXBMZWZ0QWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RDcmVhdGVFZGl0b3JHcm91cEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm5ld0dyb3VwTGVmdCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCduZXdHcm91cExlZnQnLCAnTmV3IEVkaXRvciBHcm91cCB0byB0aGUgTGVmdCcpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3XG5cdFx0fSwgR3JvdXBEaXJlY3Rpb24uTEVGVCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5ld0VkaXRvckdyb3VwUmlnaHRBY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdENyZWF0ZUVkaXRvckdyb3VwQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ubmV3R3JvdXBSaWdodCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCduZXdHcm91cFJpZ2h0JywgJ05ldyBFZGl0b3IgR3JvdXAgdG8gdGhlIFJpZ2h0JyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9LCBHcm91cERpcmVjdGlvbi5SSUdIVCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5ld0VkaXRvckdyb3VwQWJvdmVBY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdENyZWF0ZUVkaXRvckdyb3VwQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ubmV3R3JvdXBBYm92ZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCduZXdHcm91cEFib3ZlJywgJ05ldyBFZGl0b3IgR3JvdXAgQWJvdmUnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlld1xuXHRcdH0sIEdyb3VwRGlyZWN0aW9uLlVQKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTmV3RWRpdG9yR3JvdXBCZWxvd0FjdGlvbiBleHRlbmRzIEFic3RyYWN0Q3JlYXRlRWRpdG9yR3JvdXBBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5uZXdHcm91cEJlbG93Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25ld0dyb3VwQmVsb3cnLCAnTmV3IEVkaXRvciBHcm91cCBCZWxvdycpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3XG5cdFx0fSwgR3JvdXBEaXJlY3Rpb24uRE9XTik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRvZ2dsZUVkaXRvclR5cGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlRWRpdG9yVHlwZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0b2dnbGVFZGl0b3JUeXBlJywgJ1RvZ2dsZSBFZGl0b3IgVHlwZScpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBBY3RpdmVFZGl0b3JBdmFpbGFibGVFZGl0b3JJZHNDb250ZXh0XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JSZXNvbHZlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclJlc29sdmVyU2VydmljZSk7XG5cblx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdGlmICghYWN0aXZlRWRpdG9yUGFuZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvclJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRDYW5vbmljYWxVcmkoYWN0aXZlRWRpdG9yUGFuZS5pbnB1dCk7XG5cdFx0aWYgKCFhY3RpdmVFZGl0b3JSZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvcklkcyA9IGVkaXRvclJlc29sdmVyU2VydmljZS5nZXRFZGl0b3JzKGFjdGl2ZUVkaXRvclJlc291cmNlKS5tYXAoZWRpdG9yID0+IGVkaXRvci5pZCkuZmlsdGVyKGlkID0+IGlkICE9PSBhY3RpdmVFZGl0b3JQYW5lLmlucHV0LmVkaXRvcklkKTtcblx0XHRpZiAoZWRpdG9ySWRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFJlcGxhY2UgdGhlIGN1cnJlbnQgZWRpdG9yIHdpdGggdGhlIG5leHQgYXZhaWFibGUgZWRpdG9yIHR5cGVcblx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLnJlcGxhY2VFZGl0b3JzKFtcblx0XHRcdHtcblx0XHRcdFx0ZWRpdG9yOiBhY3RpdmVFZGl0b3JQYW5lLmlucHV0LFxuXHRcdFx0XHRyZXBsYWNlbWVudDoge1xuXHRcdFx0XHRcdHJlc291cmNlOiBhY3RpdmVFZGl0b3JSZXNvdXJjZSxcblx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRvdmVycmlkZTogZWRpdG9ySWRzWzBdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XSwgYWN0aXZlRWRpdG9yUGFuZS5ncm91cCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlT3BlbkluVGV4dEVkaXRvckFjdGlvbiBleHRlbmRzIEV4ZWN1dGVDb21tYW5kQWN0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24ucmVvcGVuVGV4dEVkaXRvcic7XG5cdHN0YXRpYyByZWFkb25seSBUSVRMRSA9IGxvY2FsaXplMigncmVvcGVuVGV4dEVkaXRvcicsICdSZW9wZW4gRWRpdG9yIHdpdGggVGV4dCBFZGl0b3InKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogUmVPcGVuSW5UZXh0RWRpdG9yQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IFJlT3BlbkluVGV4dEVkaXRvckFjdGlvbi5USVRMRSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdHByZWNvbmRpdGlvbjogQWN0aXZlRWRpdG9yQXZhaWxhYmxlRWRpdG9ySWRzQ29udGV4dFxuXHRcdH0sIFJFT1BFTl9BQ1RJVkVfRURJVE9SX1dJVEhfQ09NTUFORF9JRCwgJ2RlZmF1bHQnKTtcblx0fVxufVxuXG5cbmFic3RyYWN0IGNsYXNzIEJhc2VNb3ZlQ29weUVkaXRvclRvTmV3V2luZG93QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aWQ6IHN0cmluZyxcblx0XHR0aXRsZTogSUNvbW1hbmRBY3Rpb25UaXRsZSxcblx0XHRrZXliaW5kaW5nOiBPbWl0PElLZXliaW5kaW5nUnVsZSwgJ2lkJz4gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtb3ZlOiBib29sZWFuXG5cdCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkLFxuXHRcdFx0dGl0bGUsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBBY3RpdmVFZGl0b3JDb250ZXh0LFxuXHRcdFx0a2V5YmluZGluZyxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdGNvbnN0IGVkaXRvckdyb3Vwc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGxpc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSk7XG5cblx0XHRjb25zdCByZXNvbHZlZENvbnRleHQgPSByZXNvbHZlQ29tbWFuZHNDb250ZXh0KGFyZ3MsIGVkaXRvclNlcnZpY2UsIGVkaXRvckdyb3Vwc1NlcnZpY2UsIGxpc3RTZXJ2aWNlKTtcblx0XHRpZiAoIXJlc29sdmVkQ29udGV4dC5ncm91cGVkRWRpdG9ycy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhdXhpbGlhcnlFZGl0b3JQYXJ0ID0gYXdhaXQgZWRpdG9yR3JvdXBzU2VydmljZS5jcmVhdGVBdXhpbGlhcnlFZGl0b3JQYXJ0KCk7XG5cblx0XHRjb25zdCB7IGdyb3VwLCBlZGl0b3JzIH0gPSByZXNvbHZlZENvbnRleHQuZ3JvdXBlZEVkaXRvcnNbMF07IC8vIG9ubHkgc2luZ2xlIGdyb3VwIHN1cHBvcnRlZCBmb3IgbW92ZS9jb3B5IGZvciBub3dcblx0XHRjb25zdCBlZGl0b3JzV2l0aE9wdGlvbnMgPSBwcmVwYXJlTW92ZUNvcHlFZGl0b3JzKGdyb3VwLCBlZGl0b3JzLCByZXNvbHZlZENvbnRleHQucHJlc2VydmVGb2N1cyk7XG5cdFx0aWYgKHRoaXMubW92ZSkge1xuXHRcdFx0Z3JvdXAubW92ZUVkaXRvcnMoZWRpdG9yc1dpdGhPcHRpb25zLCBhdXhpbGlhcnlFZGl0b3JQYXJ0LmFjdGl2ZUdyb3VwKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Z3JvdXAuY29weUVkaXRvcnMoZWRpdG9yc1dpdGhPcHRpb25zLCBhdXhpbGlhcnlFZGl0b3JQYXJ0LmFjdGl2ZUdyb3VwKTtcblx0XHR9XG5cblx0XHRhdXhpbGlhcnlFZGl0b3JQYXJ0LmFjdGl2ZUdyb3VwLmZvY3VzKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vdmVFZGl0b3JUb05ld1dpbmRvd0FjdGlvbiBleHRlbmRzIEJhc2VNb3ZlQ29weUVkaXRvclRvTmV3V2luZG93QWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihcblx0XHRcdE1PVkVfRURJVE9SX0lOVE9fTkVXX1dJTkRPV19DT01NQU5EX0lELFxuXHRcdFx0e1xuXHRcdFx0XHQuLi5sb2NhbGl6ZTIoJ21vdmVFZGl0b3JUb05ld1dpbmRvdycsIFwiTW92ZSBFZGl0b3IgaW50byBOZXcgV2luZG93XCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pTW92ZUVkaXRvclRvTmV3V2luZG93JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmTW92ZSBFZGl0b3IgaW50byBOZXcgV2luZG93XCIpLFxuXHRcdFx0fSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHRydWVcblx0XHQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb3B5RWRpdG9yVG9OZXdpbmRvd0FjdGlvbiBleHRlbmRzIEJhc2VNb3ZlQ29weUVkaXRvclRvTmV3V2luZG93QWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihcblx0XHRcdENPUFlfRURJVE9SX0lOVE9fTkVXX1dJTkRPV19DT01NQU5EX0lELFxuXHRcdFx0e1xuXHRcdFx0XHQuLi5sb2NhbGl6ZTIoJ2NvcHlFZGl0b3JUb05ld1dpbmRvdycsIFwiQ29weSBFZGl0b3IgaW50byBOZXcgV2luZG93XCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pQ29weUVkaXRvclRvTmV3V2luZG93JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmQ29weSBFZGl0b3IgaW50byBOZXcgV2luZG93XCIpLFxuXHRcdFx0fSxcblx0XHRcdHsgcHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleUNvZGUuS2V5TyksIHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliIH0sXG5cdFx0XHRmYWxzZVxuXHRcdCk7XG5cdH1cbn1cblxuYWJzdHJhY3QgY2xhc3MgQmFzZU1vdmVDb3B5RWRpdG9yR3JvdXBUb05ld1dpbmRvd0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGlkOiBzdHJpbmcsXG5cdFx0dGl0bGU6IElDb21tYW5kQWN0aW9uVGl0bGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtb3ZlOiBib29sZWFuXG5cdCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkLFxuXHRcdFx0dGl0bGUsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvckdyb3VwU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cdFx0Y29uc3QgYWN0aXZlR3JvdXAgPSBlZGl0b3JHcm91cFNlcnZpY2UuYWN0aXZlR3JvdXA7XG5cblx0XHRjb25zdCBhdXhpbGlhcnlFZGl0b3JQYXJ0ID0gYXdhaXQgZWRpdG9yR3JvdXBTZXJ2aWNlLmNyZWF0ZUF1eGlsaWFyeUVkaXRvclBhcnQoKTtcblxuXHRcdGVkaXRvckdyb3VwU2VydmljZS5tZXJnZUdyb3VwKGFjdGl2ZUdyb3VwLCBhdXhpbGlhcnlFZGl0b3JQYXJ0LmFjdGl2ZUdyb3VwLCB7XG5cdFx0XHRtb2RlOiB0aGlzLm1vdmUgPyBNZXJnZUdyb3VwTW9kZS5NT1ZFX0VESVRPUlMgOiBNZXJnZUdyb3VwTW9kZS5DT1BZX0VESVRPUlNcblx0XHR9KTtcblxuXHRcdGF1eGlsaWFyeUVkaXRvclBhcnQuYWN0aXZlR3JvdXAuZm9jdXMoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTW92ZUVkaXRvckdyb3VwVG9OZXdXaW5kb3dBY3Rpb24gZXh0ZW5kcyBCYXNlTW92ZUNvcHlFZGl0b3JHcm91cFRvTmV3V2luZG93QWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihcblx0XHRcdE1PVkVfRURJVE9SX0dST1VQX0lOVE9fTkVXX1dJTkRPV19DT01NQU5EX0lELFxuXHRcdFx0e1xuXHRcdFx0XHQuLi5sb2NhbGl6ZTIoJ21vdmVFZGl0b3JHcm91cFRvTmV3V2luZG93JywgXCJNb3ZlIEVkaXRvciBHcm91cCBpbnRvIE5ldyBXaW5kb3dcIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlNb3ZlRWRpdG9yR3JvdXBUb05ld1dpbmRvdycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJk1vdmUgRWRpdG9yIEdyb3VwIGludG8gTmV3IFdpbmRvd1wiKSxcblx0XHRcdH0sXG5cdFx0XHR0cnVlXG5cdFx0KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29weUVkaXRvckdyb3VwVG9OZXdXaW5kb3dBY3Rpb24gZXh0ZW5kcyBCYXNlTW92ZUNvcHlFZGl0b3JHcm91cFRvTmV3V2luZG93QWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihcblx0XHRcdENPUFlfRURJVE9SX0dST1VQX0lOVE9fTkVXX1dJTkRPV19DT01NQU5EX0lELFxuXHRcdFx0e1xuXHRcdFx0XHQuLi5sb2NhbGl6ZTIoJ2NvcHlFZGl0b3JHcm91cFRvTmV3V2luZG93JywgXCJDb3B5IEVkaXRvciBHcm91cCBpbnRvIE5ldyBXaW5kb3dcIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlDb3B5RWRpdG9yR3JvdXBUb05ld1dpbmRvdycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkNvcHkgRWRpdG9yIEdyb3VwIGludG8gTmV3IFdpbmRvd1wiKSxcblx0XHRcdH0sXG5cdFx0XHRmYWxzZVxuXHRcdCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlc3RvcmVFZGl0b3JzVG9NYWluV2luZG93QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnJlc3RvcmVFZGl0b3JzVG9NYWluV2luZG93Jyxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLmxvY2FsaXplMigncmVzdG9yZUVkaXRvcnNUb01haW5XaW5kb3cnLCBcIlJlc3RvcmUgRWRpdG9ycyBpbnRvIE1haW4gV2luZG93XCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pUmVzdG9yZUVkaXRvcnNUb01haW5XaW5kb3cnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZSZXN0b3JlIEVkaXRvcnMgaW50byBNYWluIFdpbmRvd1wiKSxcblx0XHRcdH0sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogSXNBdXhpbGlhcnlXaW5kb3dGb2N1c2VkQ29udGV4dCxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvckdyb3VwU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cblx0XHRlZGl0b3JHcm91cFNlcnZpY2UubWVyZ2VBbGxHcm91cHMoZWRpdG9yR3JvdXBTZXJ2aWNlLm1haW5QYXJ0LmFjdGl2ZUdyb3VwKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTmV3RW1wdHlFZGl0b3JXaW5kb3dBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTkVXX0VNUFRZX0VESVRPUl9XSU5ET1dfQ09NTUFORF9JRCxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLmxvY2FsaXplMignbmV3RW1wdHlFZGl0b3JXaW5kb3cnLCBcIk5ldyBFbXB0eSBFZGl0b3IgV2luZG93XCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pTmV3RW1wdHlFZGl0b3JXaW5kb3cnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZOZXcgRW1wdHkgRWRpdG9yIFdpbmRvd1wiKSxcblx0XHRcdH0sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXdcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvckdyb3VwU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cblx0XHRjb25zdCBhdXhpbGlhcnlFZGl0b3JQYXJ0ID0gYXdhaXQgZWRpdG9yR3JvdXBTZXJ2aWNlLmNyZWF0ZUF1eGlsaWFyeUVkaXRvclBhcnQoKTtcblx0XHRhdXhpbGlhcnlFZGl0b3JQYXJ0LmFjdGl2ZUdyb3VwLmZvY3VzKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLGNBQWM7QUFDdkIsU0FBb0QsZ0JBQWdCLFlBQVksY0FBYyx5QkFBMEMsOEJBQThCO0FBRXRLLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCLGFBQWE7QUFDL0MsU0FBUyxVQUFVLHVCQUF1QjtBQUMxQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QiwrQkFBaUUsbUJBQW1CLG9CQUFvQixpQkFBaUIsbUJBQW1CLGFBQWEsaUNBQWlDLHlCQUF5QiwrQkFBK0IsY0FBYyw4QkFBOEIsd0NBQXdDLHdDQUF3Qyw4Q0FBOEMsOENBQThDLG9DQUFvQyw4QkFBOEIsNkJBQTZCLDhCQUE4Qiw4QkFBOEIsNENBQTRDO0FBQ25yQixTQUFTLHNCQUFvQyxtQkFBbUIsZUFBZSxnQkFBZ0IsbUNBQW9ELGtCQUFxQyxhQUFhLHNCQUFzQjtBQUMzTixTQUFT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
