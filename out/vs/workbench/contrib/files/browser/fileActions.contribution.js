import * as nls from "../../../../nls.js";
import { ToggleAutoSaveAction, FocusFilesExplorer, GlobalCompareResourcesAction, ShowActiveFileInExplorer, CompareWithClipboardAction, NEW_FILE_COMMAND_ID, NEW_FILE_LABEL, NEW_FOLDER_COMMAND_ID, NEW_FOLDER_LABEL, TRIGGER_RENAME_LABEL, MOVE_FILE_TO_TRASH_LABEL, COPY_FILE_LABEL, PASTE_FILE_LABEL, FileCopiedContext, renameHandler, moveFileToTrashHandler, copyFileHandler, pasteFileHandler, deleteFileHandler, cutFileHandler, DOWNLOAD_COMMAND_ID, openFilePreserveFocusHandler, DOWNLOAD_LABEL, OpenActiveFileInEmptyWorkspace, UPLOAD_COMMAND_ID, UPLOAD_LABEL, CompareNewUntitledTextFilesAction, SetActiveEditorReadonlyInSession, SetActiveEditorWriteableInSession, ToggleActiveEditorReadonlyInSession, ResetActiveEditorReadonlyInSession } from "./fileActions.js";
import { revertLocalChangesCommand, acceptLocalChangesCommand, CONFLICT_RESOLUTION_CONTEXT } from "./editors/textFileSaveErrorHandler.js";
import { MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { KeyMod, KeyCode } from "../../../../base/common/keyCodes.js";
import { openWindowCommand, newWindowCommand } from "./fileCommands.js";
import { COPY_PATH_COMMAND_ID, REVEAL_IN_EXPLORER_COMMAND_ID, OPEN_TO_SIDE_COMMAND_ID, REVERT_FILE_COMMAND_ID, SAVE_FILE_COMMAND_ID, SAVE_FILE_LABEL, SAVE_FILE_AS_COMMAND_ID, SAVE_FILE_AS_LABEL, SAVE_ALL_IN_GROUP_COMMAND_ID, OpenEditorsGroupContext, COMPARE_WITH_SAVED_COMMAND_ID, COMPARE_RESOURCE_COMMAND_ID, SELECT_FOR_COMPARE_COMMAND_ID, ResourceSelectedForCompareContext, OpenEditorsDirtyEditorContext, COMPARE_SELECTED_COMMAND_ID, REMOVE_ROOT_FOLDER_COMMAND_ID, REMOVE_ROOT_FOLDER_LABEL, SAVE_FILES_COMMAND_ID, COPY_RELATIVE_PATH_COMMAND_ID, SAVE_FILE_WITHOUT_FORMATTING_COMMAND_ID, SAVE_FILE_WITHOUT_FORMATTING_LABEL, OpenEditorsReadonlyEditorContext, OPEN_WITH_EXPLORER_COMMAND_ID, NEW_UNTITLED_FILE_COMMAND_ID, NEW_UNTITLED_FILE_LABEL, SAVE_ALL_COMMAND_ID, OpenEditorsSelectedFileOrUntitledContext } from "./fileConstants.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { FilesExplorerFocusCondition, ExplorerRootContext, ExplorerFolderContext, ExplorerResourceWritableContext, ExplorerResourceCut, ExplorerResourceMoveableToTrash, ExplorerResourceAvailableEditorIdsContext, FoldersViewVisibleContext } from "../common/files.js";
import { ADD_ROOT_FOLDER_COMMAND_ID, ADD_ROOT_FOLDER_LABEL } from "../../../browser/actions/workspaceCommands.js";
import { CLOSE_SAVED_EDITORS_COMMAND_ID, CLOSE_EDITORS_IN_GROUP_COMMAND_ID, CLOSE_EDITOR_COMMAND_ID, CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID, REOPEN_WITH_COMMAND_ID } from "../../../browser/parts/editor/editorCommands.js";
import { AutoSaveAfterShortDelayContext } from "../../../services/filesConfiguration/common/filesConfigurationService.js";
import { WorkbenchListDoubleSelection } from "../../../../platform/list/browser/listService.js";
import { Schemas } from "../../../../base/common/network.js";
import { DirtyWorkingCopiesContext, EnterMultiRootWorkspaceSupportContext, HasWebFileSystemAccess, IsSessionsWindowContext, WorkbenchStateContext, WorkspaceFolderCountContext, SidebarFocusContext, ActiveEditorCanRevertContext, ActiveEditorContext, ActiveEditorDirtyContext, ResourceContextKey, ActiveEditorAvailableEditorIdsContext, MultipleEditorsSelectedInGroupContext, TwoEditorsSelectedInGroupContext, SelectedEditorsInGroupFileOrUntitledResourceContextKey } from "../../../common/contextkeys.js";
import { IsWebContext } from "../../../../platform/contextkey/common/contextkeys.js";
import { IExplorerService } from "./files.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
registerAction2(GlobalCompareResourcesAction);
registerAction2(FocusFilesExplorer);
registerAction2(ShowActiveFileInExplorer);
registerAction2(CompareWithClipboardAction);
registerAction2(CompareNewUntitledTextFilesAction);
registerAction2(ToggleAutoSaveAction);
registerAction2(OpenActiveFileInEmptyWorkspace);
registerAction2(SetActiveEditorReadonlyInSession);
registerAction2(SetActiveEditorWriteableInSession);
registerAction2(ToggleActiveEditorReadonlyInSession);
registerAction2(ResetActiveEditorReadonlyInSession);
CommandsRegistry.registerCommand("_files.windowOpen", openWindowCommand);
CommandsRegistry.registerCommand("_files.newWindow", newWindowCommand);
const explorerCommandsWeightBonus = 10;
const RENAME_ID = "renameFile";
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: RENAME_ID,
  weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
  when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerRootContext.toNegated(), ExplorerResourceWritableContext),
  primary: KeyCode.F2,
  mac: {
    primary: KeyCode.Enter
  },
  handler: renameHandler
});
const MOVE_FILE_TO_TRASH_ID = "moveFileToTrash";
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: MOVE_FILE_TO_TRASH_ID,
  weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
  when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerResourceMoveableToTrash),
  primary: KeyCode.Delete,
  mac: {
    primary: KeyMod.CtrlCmd | KeyCode.Backspace,
    secondary: [KeyCode.Delete]
  },
  handler: moveFileToTrashHandler
});
const DELETE_FILE_ID = "deleteFile";
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: DELETE_FILE_ID,
  weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
  when: FilesExplorerFocusCondition,
  primary: KeyMod.Shift | KeyCode.Delete,
  mac: {
    primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Backspace
  },
  handler: deleteFileHandler
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: DELETE_FILE_ID,
  weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
  when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerResourceMoveableToTrash.toNegated()),
  primary: KeyCode.Delete,
  mac: {
    primary: KeyMod.CtrlCmd | KeyCode.Backspace
  },
  handler: deleteFileHandler
});
const CUT_FILE_ID = "filesExplorer.cut";
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: CUT_FILE_ID,
  weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
  when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerRootContext.toNegated(), ExplorerResourceWritableContext),
  primary: KeyMod.CtrlCmd | KeyCode.KeyX,
  handler: cutFileHandler
});
const COPY_FILE_ID = "filesExplorer.copy";
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: COPY_FILE_ID,
  weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
  when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerRootContext.toNegated()),
  primary: KeyMod.CtrlCmd | KeyCode.KeyC,
  handler: copyFileHandler
});
const PASTE_FILE_ID = "filesExplorer.paste";
CommandsRegistry.registerCommand(PASTE_FILE_ID, pasteFileHandler);
KeybindingsRegistry.registerKeybindingRule({
  id: `^${PASTE_FILE_ID}`,
  // the `^` enables pasting files into the explorer by preventing default bubble up
  weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
  when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerResourceWritableContext),
  primary: KeyMod.CtrlCmd | KeyCode.KeyV
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "filesExplorer.cancelCut",
  weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
  when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerResourceCut),
  primary: KeyCode.Escape,
  handler: async (accessor) => {
    const explorerService = accessor.get(IExplorerService);
    await explorerService.setToCopy([], true);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "filesExplorer.openFilePreserveFocus",
  weight: KeybindingWeight.WorkbenchContrib + explorerCommandsWeightBonus,
  when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerFolderContext.toNegated()),
  primary: KeyCode.Space,
  handler: openFilePreserveFocusHandler
});
const copyPathCommand = {
  id: COPY_PATH_COMMAND_ID,
  title: nls.localize("copyPath", "Copy Path")
};
const copyRelativePathCommand = {
  id: COPY_RELATIVE_PATH_COMMAND_ID,
  title: nls.localize("copyRelativePath", "Copy Relative Path")
};
const revealInSideBarCommand = {
  id: REVEAL_IN_EXPLORER_COMMAND_ID,
  title: nls.localize("revealInSideBar", "Reveal in Explorer View")
};
appendEditorTitleContextMenuItem(SAVE_FILE_COMMAND_ID, SAVE_FILE_LABEL.value, ActiveEditorDirtyContext, "1_close_save", true, 10);
appendEditorTitleContextMenuItem(SAVE_FILE_AS_COMMAND_ID, SAVE_FILE_AS_LABEL.value, ActiveEditorDirtyContext, "1_close_save", false, 20);
appendEditorTitleContextMenuItem(COPY_PATH_COMMAND_ID, copyPathCommand.title, ResourceContextKey.IsFileSystemResource, "1_cutcopypaste", true);
appendEditorTitleContextMenuItem(COPY_RELATIVE_PATH_COMMAND_ID, copyRelativePathCommand.title, ResourceContextKey.IsFileSystemResource, "1_cutcopypaste", true);
appendEditorTitleContextMenuItem(revealInSideBarCommand.id, revealInSideBarCommand.title, ResourceContextKey.IsFileSystemResource, "2_files", false, 1);
function appendEditorTitleContextMenuItem(id, title, when, group, supportsMultiSelect, order) {
  const precondition = supportsMultiSelect !== true ? MultipleEditorsSelectedInGroupContext.negate() : void 0;
  MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
    command: { id, title, precondition },
    when,
    group,
    order
  });
}
appendSaveConflictEditorTitleAction("workbench.files.action.acceptLocalChanges", nls.localize("acceptLocalChanges", "Use your changes and overwrite file contents"), Codicon.check, -10, acceptLocalChangesCommand);
appendSaveConflictEditorTitleAction("workbench.files.action.revertLocalChanges", nls.localize("revertLocalChanges", "Discard your changes and revert to file contents"), Codicon.discard, -9, revertLocalChangesCommand);
function appendSaveConflictEditorTitleAction(id, title, icon, order, command) {
  CommandsRegistry.registerCommand(id, command);
  MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
    command: { id, title, icon },
    when: ContextKeyExpr.equals(CONFLICT_RESOLUTION_CONTEXT, true),
    group: "navigation",
    order
  });
}
function appendToCommandPalette({ id, title, category, metadata }, when) {
  MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
    command: {
      id,
      title,
      category,
      metadata
    },
    when
  });
}
appendToCommandPalette({
  id: COPY_PATH_COMMAND_ID,
  title: nls.localize2("copyPathOfActive", "Copy Path of Active File"),
  category: Categories.File
}, IsSessionsWindowContext.negate());
appendToCommandPalette({
  id: COPY_RELATIVE_PATH_COMMAND_ID,
  title: nls.localize2("copyRelativePathOfActive", "Copy Relative Path of Active File"),
  category: Categories.File
}, IsSessionsWindowContext.negate());
appendToCommandPalette({
  id: SAVE_FILE_COMMAND_ID,
  title: SAVE_FILE_LABEL,
  category: Categories.File
});
appendToCommandPalette({
  id: SAVE_FILE_WITHOUT_FORMATTING_COMMAND_ID,
  title: SAVE_FILE_WITHOUT_FORMATTING_LABEL,
  category: Categories.File
});
appendToCommandPalette({
  id: SAVE_ALL_IN_GROUP_COMMAND_ID,
  title: nls.localize2("saveAllInGroup", "Save All in Group"),
  category: Categories.File
}, IsSessionsWindowContext.negate());
appendToCommandPalette({
  id: SAVE_FILES_COMMAND_ID,
  title: nls.localize2("saveFiles", "Save All Files"),
  category: Categories.File
}, IsSessionsWindowContext.negate());
appendToCommandPalette({
  id: REVERT_FILE_COMMAND_ID,
  title: nls.localize2("revert", "Revert File"),
  category: Categories.File
}, IsSessionsWindowContext.negate());
appendToCommandPalette({
  id: COMPARE_WITH_SAVED_COMMAND_ID,
  title: nls.localize2("compareActiveWithSaved", "Compare Active File with Saved"),
  category: Categories.File,
  metadata: {
    description: nls.localize2("compareActiveWithSavedMeta", "Opens a new diff editor to compare the active file with the version on disk.")
  }
});
appendToCommandPalette({
  id: SAVE_FILE_AS_COMMAND_ID,
  title: SAVE_FILE_AS_LABEL,
  category: Categories.File
}, IsSessionsWindowContext.negate());
appendToCommandPalette({
  id: NEW_FILE_COMMAND_ID,
  title: NEW_FILE_LABEL,
  category: Categories.File
}, ContextKeyExpr.and(WorkspaceFolderCountContext.notEqualsTo("0"), IsSessionsWindowContext.negate()));
appendToCommandPalette({
  id: NEW_FOLDER_COMMAND_ID,
  title: NEW_FOLDER_LABEL,
  category: Categories.File,
  metadata: { description: nls.localize2("newFolderDescription", "Create a new folder or directory") }
}, ContextKeyExpr.and(WorkspaceFolderCountContext.notEqualsTo("0"), IsSessionsWindowContext.negate()));
appendToCommandPalette({
  id: NEW_UNTITLED_FILE_COMMAND_ID,
  title: NEW_UNTITLED_FILE_LABEL,
  category: Categories.File
}, IsSessionsWindowContext.negate());
const isFileOrUntitledResourceContextKey = ContextKeyExpr.or(ResourceContextKey.IsFileSystemResource, ResourceContextKey.Scheme.isEqualTo(Schemas.untitled));
const openToSideCommand = {
  id: OPEN_TO_SIDE_COMMAND_ID,
  title: nls.localize("openToSide", "Open to the Side")
};
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "navigation",
  order: 10,
  command: openToSideCommand,
  when: isFileOrUntitledResourceContextKey
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "1_open",
  order: 10,
  command: {
    id: REOPEN_WITH_COMMAND_ID,
    title: nls.localize("reopenWith", "Reopen Editor With...")
  },
  when: ContextKeyExpr.and(
    // Editors with Available Choices to Open With
    ActiveEditorAvailableEditorIdsContext,
    // Not: editor groups
    OpenEditorsGroupContext.toNegated()
  )
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "1_cutcopypaste",
  order: 10,
  command: copyPathCommand,
  when: ResourceContextKey.IsFileSystemResource
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "1_cutcopypaste",
  order: 20,
  command: copyRelativePathCommand,
  when: ResourceContextKey.IsFileSystemResource
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "2_save",
  order: 10,
  command: {
    id: SAVE_FILE_COMMAND_ID,
    title: SAVE_FILE_LABEL,
    precondition: OpenEditorsDirtyEditorContext
  },
  when: ContextKeyExpr.or(
    // Untitled Editors
    ResourceContextKey.Scheme.isEqualTo(Schemas.untitled),
    // Or:
    ContextKeyExpr.and(
      // Not: editor groups
      OpenEditorsGroupContext.toNegated(),
      // Not: readonly editors
      OpenEditorsReadonlyEditorContext.toNegated(),
      // Not: auto save after short delay
      AutoSaveAfterShortDelayContext.toNegated()
    )
  )
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "2_save",
  order: 20,
  command: {
    id: REVERT_FILE_COMMAND_ID,
    title: nls.localize("revert", "Revert File"),
    precondition: OpenEditorsDirtyEditorContext
  },
  when: ContextKeyExpr.and(
    // Not: editor groups
    OpenEditorsGroupContext.toNegated(),
    // Not: readonly editors
    OpenEditorsReadonlyEditorContext.toNegated(),
    // Not: untitled editors (revert closes them)
    ResourceContextKey.Scheme.notEqualsTo(Schemas.untitled),
    // Not: auto save after short delay
    AutoSaveAfterShortDelayContext.toNegated()
  )
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "2_save",
  order: 30,
  command: {
    id: SAVE_ALL_IN_GROUP_COMMAND_ID,
    title: nls.localize("saveAll", "Save All"),
    precondition: DirtyWorkingCopiesContext
  },
  // Editor Group
  when: OpenEditorsGroupContext
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "3_compare",
  order: 10,
  command: {
    id: COMPARE_WITH_SAVED_COMMAND_ID,
    title: nls.localize("compareWithSaved", "Compare with Saved"),
    precondition: OpenEditorsDirtyEditorContext
  },
  when: ContextKeyExpr.and(ResourceContextKey.IsFileSystemResource, AutoSaveAfterShortDelayContext.toNegated(), WorkbenchListDoubleSelection.toNegated())
});
const compareResourceCommand = {
  id: COMPARE_RESOURCE_COMMAND_ID,
  title: nls.localize("compareWithSelected", "Compare with Selected")
};
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "3_compare",
  order: 20,
  command: compareResourceCommand,
  when: ContextKeyExpr.and(ResourceContextKey.HasResource, ResourceSelectedForCompareContext, isFileOrUntitledResourceContextKey, WorkbenchListDoubleSelection.toNegated())
});
const selectForCompareCommand = {
  id: SELECT_FOR_COMPARE_COMMAND_ID,
  title: nls.localize("compareSource", "Select for Compare")
};
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "3_compare",
  order: 30,
  command: selectForCompareCommand,
  when: ContextKeyExpr.and(ResourceContextKey.HasResource, isFileOrUntitledResourceContextKey, WorkbenchListDoubleSelection.toNegated())
});
const compareSelectedCommand = {
  id: COMPARE_SELECTED_COMMAND_ID,
  title: nls.localize("compareSelected", "Compare Selected")
};
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "3_compare",
  order: 30,
  command: compareSelectedCommand,
  when: ContextKeyExpr.and(ResourceContextKey.HasResource, WorkbenchListDoubleSelection, OpenEditorsSelectedFileOrUntitledContext)
});
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
  group: "1_compare",
  order: 30,
  command: compareSelectedCommand,
  when: ContextKeyExpr.and(ResourceContextKey.HasResource, TwoEditorsSelectedInGroupContext, SelectedEditorsInGroupFileOrUntitledResourceContextKey)
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "4_close",
  order: 10,
  command: {
    id: CLOSE_EDITOR_COMMAND_ID,
    title: nls.localize("close", "Close")
  },
  when: OpenEditorsGroupContext.toNegated()
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "4_close",
  order: 20,
  command: {
    id: CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID,
    title: nls.localize("closeOthers", "Close Others")
  },
  when: OpenEditorsGroupContext.toNegated()
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "4_close",
  order: 30,
  command: {
    id: CLOSE_SAVED_EDITORS_COMMAND_ID,
    title: nls.localize("closeSaved", "Close Saved")
  }
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
  group: "4_close",
  order: 40,
  command: {
    id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID,
    title: nls.localize("closeAll", "Close All")
  }
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "navigation",
  order: 4,
  command: {
    id: NEW_FILE_COMMAND_ID,
    title: NEW_FILE_LABEL,
    precondition: ExplorerResourceWritableContext
  },
  when: ExplorerFolderContext
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "navigation",
  order: 6,
  command: {
    id: NEW_FOLDER_COMMAND_ID,
    title: NEW_FOLDER_LABEL,
    precondition: ExplorerResourceWritableContext
  },
  when: ExplorerFolderContext
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "navigation",
  order: 10,
  command: openToSideCommand,
  when: ContextKeyExpr.and(ExplorerFolderContext.toNegated(), ResourceContextKey.HasResource)
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "navigation",
  order: 20,
  command: {
    id: OPEN_WITH_EXPLORER_COMMAND_ID,
    title: nls.localize("explorerOpenWith", "Open With...")
  },
  when: ContextKeyExpr.and(ExplorerFolderContext.toNegated(), ExplorerResourceAvailableEditorIdsContext)
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "3_compare",
  order: 20,
  command: compareResourceCommand,
  when: ContextKeyExpr.and(ExplorerFolderContext.toNegated(), ResourceContextKey.HasResource, ResourceSelectedForCompareContext, WorkbenchListDoubleSelection.toNegated())
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "3_compare",
  order: 30,
  command: selectForCompareCommand,
  when: ContextKeyExpr.and(ExplorerFolderContext.toNegated(), ResourceContextKey.HasResource, WorkbenchListDoubleSelection.toNegated())
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "3_compare",
  order: 30,
  command: compareSelectedCommand,
  when: ContextKeyExpr.and(ExplorerFolderContext.toNegated(), ResourceContextKey.HasResource, WorkbenchListDoubleSelection)
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "5_cutcopypaste",
  order: 8,
  command: {
    id: CUT_FILE_ID,
    title: nls.localize("cut", "Cut")
  },
  when: ContextKeyExpr.and(ExplorerRootContext.toNegated(), ExplorerResourceWritableContext)
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "5_cutcopypaste",
  order: 10,
  command: {
    id: COPY_FILE_ID,
    title: COPY_FILE_LABEL
  },
  when: ExplorerRootContext.toNegated()
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "5_cutcopypaste",
  order: 20,
  command: {
    id: PASTE_FILE_ID,
    title: PASTE_FILE_LABEL,
    precondition: ContextKeyExpr.and(ExplorerResourceWritableContext, FileCopiedContext)
  },
  when: ExplorerFolderContext
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "5b_importexport",
  order: 10,
  command: {
    id: DOWNLOAD_COMMAND_ID,
    title: DOWNLOAD_LABEL
  },
  when: ContextKeyExpr.or(
    // native: for any remote resource
    ContextKeyExpr.and(IsWebContext.toNegated(), ResourceContextKey.Scheme.notEqualsTo(Schemas.file)),
    // web: for any files
    ContextKeyExpr.and(IsWebContext, ExplorerFolderContext.toNegated(), ExplorerRootContext.toNegated()),
    // web: for any folders if file system API support is provided
    ContextKeyExpr.and(IsWebContext, HasWebFileSystemAccess)
  )
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "5b_importexport",
  order: 20,
  command: {
    id: UPLOAD_COMMAND_ID,
    title: UPLOAD_LABEL
  },
  when: ContextKeyExpr.and(
    // only in web
    IsWebContext,
    // only on folders
    ExplorerFolderContext,
    // only on writable folders
    ExplorerResourceWritableContext
  )
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "6_copypath",
  order: 10,
  command: copyPathCommand,
  when: ResourceContextKey.IsFileSystemResource
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "6_copypath",
  order: 20,
  command: copyRelativePathCommand,
  when: ResourceContextKey.IsFileSystemResource
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "2_workspace",
  order: 10,
  command: {
    id: ADD_ROOT_FOLDER_COMMAND_ID,
    title: ADD_ROOT_FOLDER_LABEL
  },
  when: ContextKeyExpr.and(ExplorerRootContext, ContextKeyExpr.or(EnterMultiRootWorkspaceSupportContext, WorkbenchStateContext.isEqualTo("workspace")))
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "2_workspace",
  order: 30,
  command: {
    id: REMOVE_ROOT_FOLDER_COMMAND_ID,
    title: REMOVE_ROOT_FOLDER_LABEL
  },
  when: ContextKeyExpr.and(ExplorerRootContext, ExplorerFolderContext, ContextKeyExpr.and(WorkspaceFolderCountContext.notEqualsTo("0"), ContextKeyExpr.or(EnterMultiRootWorkspaceSupportContext, WorkbenchStateContext.isEqualTo("workspace"))))
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "7_modification",
  order: 10,
  command: {
    id: RENAME_ID,
    title: TRIGGER_RENAME_LABEL,
    precondition: ExplorerResourceWritableContext
  },
  when: ExplorerRootContext.toNegated()
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "7_modification",
  order: 20,
  command: {
    id: MOVE_FILE_TO_TRASH_ID,
    title: MOVE_FILE_TO_TRASH_LABEL
  },
  alt: {
    id: DELETE_FILE_ID,
    title: nls.localize("deleteFile", "Delete Permanently")
  },
  when: ContextKeyExpr.and(ExplorerRootContext.toNegated(), ExplorerResourceMoveableToTrash)
});
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
  group: "7_modification",
  order: 20,
  command: {
    id: DELETE_FILE_ID,
    title: nls.localize("deleteFile", "Delete Permanently")
  },
  when: ContextKeyExpr.and(ExplorerRootContext.toNegated(), ExplorerResourceMoveableToTrash.toNegated())
});
for (const menuId of [MenuId.EmptyEditorGroupContext, MenuId.EditorTabsBarContext]) {
  MenuRegistry.appendMenuItem(menuId, { command: { id: NEW_UNTITLED_FILE_COMMAND_ID, title: nls.localize("newFile", "New Text File") }, group: "1_file", order: 10 });
  MenuRegistry.appendMenuItem(menuId, { command: { id: "workbench.action.quickOpen", title: nls.localize("openFile", "Open File...") }, group: "1_file", order: 20 });
}
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "1_new",
  command: {
    id: NEW_UNTITLED_FILE_COMMAND_ID,
    title: nls.localize({ key: "miNewFile", comment: ["&& denotes a mnemonic"] }, "&&New Text File")
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "4_save",
  command: {
    id: SAVE_FILE_COMMAND_ID,
    title: nls.localize({ key: "miSave", comment: ["&& denotes a mnemonic"] }, "&&Save"),
    precondition: ContextKeyExpr.or(ActiveEditorContext, ContextKeyExpr.and(FoldersViewVisibleContext, SidebarFocusContext))
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "4_save",
  command: {
    id: SAVE_FILE_AS_COMMAND_ID,
    title: nls.localize({ key: "miSaveAs", comment: ["&& denotes a mnemonic"] }, "Save &&As..."),
    precondition: ContextKeyExpr.or(ActiveEditorContext, ContextKeyExpr.and(FoldersViewVisibleContext, SidebarFocusContext))
  },
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "4_save",
  command: {
    id: SAVE_ALL_COMMAND_ID,
    title: nls.localize({ key: "miSaveAll", comment: ["&& denotes a mnemonic"] }, "Save A&&ll"),
    precondition: DirtyWorkingCopiesContext
  },
  order: 3
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "5_autosave",
  command: {
    id: ToggleAutoSaveAction.ID,
    title: nls.localize({ key: "miAutoSave", comment: ["&& denotes a mnemonic"] }, "A&&uto Save"),
    toggled: ContextKeyExpr.notEquals("config.files.autoSave", "off")
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "6_close",
  command: {
    id: REVERT_FILE_COMMAND_ID,
    title: nls.localize({ key: "miRevert", comment: ["&& denotes a mnemonic"] }, "Re&&vert File"),
    precondition: ContextKeyExpr.or(
      // Active editor can revert
      ContextKeyExpr.and(ActiveEditorCanRevertContext),
      // Explorer focused but not on untitled
      ContextKeyExpr.and(ResourceContextKey.Scheme.notEqualsTo(Schemas.untitled), FoldersViewVisibleContext, SidebarFocusContext)
    )
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "6_close",
  command: {
    id: CLOSE_EDITOR_COMMAND_ID,
    title: nls.localize({ key: "miCloseEditor", comment: ["&& denotes a mnemonic"] }, "&&Close Editor"),
    precondition: ContextKeyExpr.or(ActiveEditorContext, ContextKeyExpr.and(FoldersViewVisibleContext, SidebarFocusContext))
  },
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
  group: "3_global_nav",
  command: {
    id: "workbench.action.quickOpen",
    title: nls.localize({ key: "miGotoFile", comment: ["&& denotes a mnemonic"] }, "Go to &&File...")
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.ChatAttachmentsContext, {
  group: "navigation",
  order: 10,
  command: openToSideCommand,
  when: ContextKeyExpr.and(ResourceContextKey.IsFileSystemResource, ExplorerFolderContext.toNegated())
});
MenuRegistry.appendMenuItem(MenuId.ChatAttachmentsContext, {
  group: "navigation",
  order: 20,
  command: revealInSideBarCommand,
  when: ResourceContextKey.IsFileSystemResource
});
MenuRegistry.appendMenuItem(MenuId.ChatAttachmentsContext, {
  group: "1_cutcopypaste",
  order: 10,
  command: copyPathCommand,
  when: ResourceContextKey.IsFileSystemResource
});
MenuRegistry.appendMenuItem(MenuId.ChatAttachmentsContext, {
  group: "1_cutcopypaste",
  order: 20,
  command: copyRelativePathCommand,
  when: ResourceContextKey.IsFileSystemResource
});
for (const menuId of [MenuId.ChatInlineResourceAnchorContext, MenuId.ChatInputResourceAttachmentContext]) {
  MenuRegistry.appendMenuItem(menuId, {
    group: "navigation",
    order: 10,
    command: openToSideCommand,
    when: ContextKeyExpr.and(ResourceContextKey.HasResource, ExplorerFolderContext.toNegated())
  });
  MenuRegistry.appendMenuItem(menuId, {
    group: "navigation",
    order: 20,
    command: revealInSideBarCommand,
    when: ResourceContextKey.IsFileSystemResource
  });
  MenuRegistry.appendMenuItem(menuId, {
    group: "1_cutcopypaste",
    order: 10,
    command: copyPathCommand,
    when: ResourceContextKey.IsFileSystemResource
  });
  MenuRegistry.appendMenuItem(menuId, {
    group: "1_cutcopypaste",
    order: 20,
    command: copyRelativePathCommand,
    when: ResourceContextKey.IsFileSystemResource
  });
}
export {
  appendEditorTitleContextMenuItem,
  appendToCommandPalette,
  revealInSideBarCommand
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZpbGVzXFxicm93c2VyXFxmaWxlQWN0aW9ucy5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFRvZ2dsZUF1dG9TYXZlQWN0aW9uLCBGb2N1c0ZpbGVzRXhwbG9yZXIsIEdsb2JhbENvbXBhcmVSZXNvdXJjZXNBY3Rpb24sIFNob3dBY3RpdmVGaWxlSW5FeHBsb3JlciwgQ29tcGFyZVdpdGhDbGlwYm9hcmRBY3Rpb24sIE5FV19GSUxFX0NPTU1BTkRfSUQsIE5FV19GSUxFX0xBQkVMLCBORVdfRk9MREVSX0NPTU1BTkRfSUQsIE5FV19GT0xERVJfTEFCRUwsIFRSSUdHRVJfUkVOQU1FX0xBQkVMLCBNT1ZFX0ZJTEVfVE9fVFJBU0hfTEFCRUwsIENPUFlfRklMRV9MQUJFTCwgUEFTVEVfRklMRV9MQUJFTCwgRmlsZUNvcGllZENvbnRleHQsIHJlbmFtZUhhbmRsZXIsIG1vdmVGaWxlVG9UcmFzaEhhbmRsZXIsIGNvcHlGaWxlSGFuZGxlciwgcGFzdGVGaWxlSGFuZGxlciwgZGVsZXRlRmlsZUhhbmRsZXIsIGN1dEZpbGVIYW5kbGVyLCBET1dOTE9BRF9DT01NQU5EX0lELCBvcGVuRmlsZVByZXNlcnZlRm9jdXNIYW5kbGVyLCBET1dOTE9BRF9MQUJFTCwgT3BlbkFjdGl2ZUZpbGVJbkVtcHR5V29ya3NwYWNlLCBVUExPQURfQ09NTUFORF9JRCwgVVBMT0FEX0xBQkVMLCBDb21wYXJlTmV3VW50aXRsZWRUZXh0RmlsZXNBY3Rpb24sIFNldEFjdGl2ZUVkaXRvclJlYWRvbmx5SW5TZXNzaW9uLCBTZXRBY3RpdmVFZGl0b3JXcml0ZWFibGVJblNlc3Npb24sIFRvZ2dsZUFjdGl2ZUVkaXRvclJlYWRvbmx5SW5TZXNzaW9uLCBSZXNldEFjdGl2ZUVkaXRvclJlYWRvbmx5SW5TZXNzaW9uIH0gZnJvbSAnLi9maWxlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyByZXZlcnRMb2NhbENoYW5nZXNDb21tYW5kLCBhY2NlcHRMb2NhbENoYW5nZXNDb21tYW5kLCBDT05GTElDVF9SRVNPTFVUSU9OX0NPTlRFWFQgfSBmcm9tICcuL2VkaXRvcnMvdGV4dEZpbGVTYXZlRXJyb3JIYW5kbGVyLmpzJztcbmltcG9ydCB7IE1lbnVJZCwgTWVudVJlZ2lzdHJ5LCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb24uanMnO1xuaW1wb3J0IHsgS2V5TW9kLCBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgb3BlbldpbmRvd0NvbW1hbmQsIG5ld1dpbmRvd0NvbW1hbmQgfSBmcm9tICcuL2ZpbGVDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDT1BZX1BBVEhfQ09NTUFORF9JRCwgUkVWRUFMX0lOX0VYUExPUkVSX0NPTU1BTkRfSUQsIE9QRU5fVE9fU0lERV9DT01NQU5EX0lELCBSRVZFUlRfRklMRV9DT01NQU5EX0lELCBTQVZFX0ZJTEVfQ09NTUFORF9JRCwgU0FWRV9GSUxFX0xBQkVMLCBTQVZFX0ZJTEVfQVNfQ09NTUFORF9JRCwgU0FWRV9GSUxFX0FTX0xBQkVMLCBTQVZFX0FMTF9JTl9HUk9VUF9DT01NQU5EX0lELCBPcGVuRWRpdG9yc0dyb3VwQ29udGV4dCwgQ09NUEFSRV9XSVRIX1NBVkVEX0NPTU1BTkRfSUQsIENPTVBBUkVfUkVTT1VSQ0VfQ09NTUFORF9JRCwgU0VMRUNUX0ZPUl9DT01QQVJFX0NPTU1BTkRfSUQsIFJlc291cmNlU2VsZWN0ZWRGb3JDb21wYXJlQ29udGV4dCwgT3BlbkVkaXRvcnNEaXJ0eUVkaXRvckNvbnRleHQsIENPTVBBUkVfU0VMRUNURURfQ09NTUFORF9JRCwgUkVNT1ZFX1JPT1RfRk9MREVSX0NPTU1BTkRfSUQsIFJFTU9WRV9ST09UX0ZPTERFUl9MQUJFTCwgU0FWRV9GSUxFU19DT01NQU5EX0lELCBDT1BZX1JFTEFUSVZFX1BBVEhfQ09NTUFORF9JRCwgU0FWRV9GSUxFX1dJVEhPVVRfRk9STUFUVElOR19DT01NQU5EX0lELCBTQVZFX0ZJTEVfV0lUSE9VVF9GT1JNQVRUSU5HX0xBQkVMLCBPcGVuRWRpdG9yc1JlYWRvbmx5RWRpdG9yQ29udGV4dCwgT1BFTl9XSVRIX0VYUExPUkVSX0NPTU1BTkRfSUQsIE5FV19VTlRJVExFRF9GSUxFX0NPTU1BTkRfSUQsIE5FV19VTlRJVExFRF9GSUxFX0xBQkVMLCBTQVZFX0FMTF9DT01NQU5EX0lELCBPcGVuRWRpdG9yc1NlbGVjdGVkRmlsZU9yVW50aXRsZWRDb250ZXh0IH0gZnJvbSAnLi9maWxlQ29uc3RhbnRzLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnksIElDb21tYW5kSGFuZGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgQ29udGV4dEtleUV4cHJlc3Npb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdzUmVnaXN0cnksIEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEZpbGVzRXhwbG9yZXJGb2N1c0NvbmRpdGlvbiwgRXhwbG9yZXJSb290Q29udGV4dCwgRXhwbG9yZXJGb2xkZXJDb250ZXh0LCBFeHBsb3JlclJlc291cmNlV3JpdGFibGVDb250ZXh0LCBFeHBsb3JlclJlc291cmNlQ3V0LCBFeHBsb3JlclJlc291cmNlTW92ZWFibGVUb1RyYXNoLCBFeHBsb3JlclJlc291cmNlQXZhaWxhYmxlRWRpdG9ySWRzQ29udGV4dCwgRm9sZGVyc1ZpZXdWaXNpYmxlQ29udGV4dCB9IGZyb20gJy4uL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBBRERfUk9PVF9GT0xERVJfQ09NTUFORF9JRCwgQUREX1JPT1RfRk9MREVSX0xBQkVMIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hY3Rpb25zL3dvcmtzcGFjZUNvbW1hbmRzLmpzJztcbmltcG9ydCB7IENMT1NFX1NBVkVEX0VESVRPUlNfQ09NTUFORF9JRCwgQ0xPU0VfRURJVE9SU19JTl9HUk9VUF9DT01NQU5EX0lELCBDTE9TRV9FRElUT1JfQ09NTUFORF9JRCwgQ0xPU0VfT1RIRVJfRURJVE9SU19JTl9HUk9VUF9DT01NQU5EX0lELCBSRU9QRU5fV0lUSF9DT01NQU5EX0lEIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQXV0b1NhdmVBZnRlclNob3J0RGVsYXlDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZmlsZXNDb25maWd1cmF0aW9uL2NvbW1vbi9maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaExpc3REb3VibGVTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgRGlydHlXb3JraW5nQ29waWVzQ29udGV4dCwgRW50ZXJNdWx0aVJvb3RXb3Jrc3BhY2VTdXBwb3J0Q29udGV4dCwgSGFzV2ViRmlsZVN5c3RlbUFjY2VzcywgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsIFdvcmtiZW5jaFN0YXRlQ29udGV4dCwgV29ya3NwYWNlRm9sZGVyQ291bnRDb250ZXh0LCBTaWRlYmFyRm9jdXNDb250ZXh0LCBBY3RpdmVFZGl0b3JDYW5SZXZlcnRDb250ZXh0LCBBY3RpdmVFZGl0b3JDb250ZXh0LCBBY3RpdmVFZGl0b3JEaXJ0eUNvbnRleHQsIFJlc291cmNlQ29udGV4dEtleSwgQWN0aXZlRWRpdG9yQXZhaWxhYmxlRWRpdG9ySWRzQ29udGV4dCwgTXVsdGlwbGVFZGl0b3JzU2VsZWN0ZWRJbkdyb3VwQ29udGV4dCwgVHdvRWRpdG9yc1NlbGVjdGVkSW5Hcm91cENvbnRleHQsIFNlbGVjdGVkRWRpdG9yc0luR3JvdXBGaWxlT3JVbnRpdGxlZFJlc291cmNlQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJc1dlYkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSUV4cGxvcmVyU2VydmljZSB9IGZyb20gJy4vZmlsZXMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuXG4vLyBDb250cmlidXRlIEdsb2JhbCBBY3Rpb25zXG5cbnJlZ2lzdGVyQWN0aW9uMihHbG9iYWxDb21wYXJlUmVzb3VyY2VzQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihGb2N1c0ZpbGVzRXhwbG9yZXIpO1xucmVnaXN0ZXJBY3Rpb24yKFNob3dBY3RpdmVGaWxlSW5FeHBsb3Jlcik7XG5yZWdpc3RlckFjdGlvbjIoQ29tcGFyZVdpdGhDbGlwYm9hcmRBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKENvbXBhcmVOZXdVbnRpdGxlZFRleHRGaWxlc0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoVG9nZ2xlQXV0b1NhdmVBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE9wZW5BY3RpdmVGaWxlSW5FbXB0eVdvcmtzcGFjZSk7XG5yZWdpc3RlckFjdGlvbjIoU2V0QWN0aXZlRWRpdG9yUmVhZG9ubHlJblNlc3Npb24pO1xucmVnaXN0ZXJBY3Rpb24yKFNldEFjdGl2ZUVkaXRvcldyaXRlYWJsZUluU2Vzc2lvbik7XG5yZWdpc3RlckFjdGlvbjIoVG9nZ2xlQWN0aXZlRWRpdG9yUmVhZG9ubHlJblNlc3Npb24pO1xucmVnaXN0ZXJBY3Rpb24yKFJlc2V0QWN0aXZlRWRpdG9yUmVhZG9ubHlJblNlc3Npb24pO1xuXG4vLyBDb21tYW5kc1xuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ19maWxlcy53aW5kb3dPcGVuJywgb3BlbldpbmRvd0NvbW1hbmQpO1xuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ19maWxlcy5uZXdXaW5kb3cnLCBuZXdXaW5kb3dDb21tYW5kKTtcblxuY29uc3QgZXhwbG9yZXJDb21tYW5kc1dlaWdodEJvbnVzID0gMTA7IC8vIGdpdmUgb3VyIGNvbW1hbmRzIGEgbGl0dGxlIGJpdCBtb3JlIHdlaWdodCBvdmVyIG90aGVyIGRlZmF1bHQgbGlzdC90cmVlIGNvbW1hbmRzXG5cbmNvbnN0IFJFTkFNRV9JRCA9ICdyZW5hbWVGaWxlJztcbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogUkVOQU1FX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIGV4cGxvcmVyQ29tbWFuZHNXZWlnaHRCb251cyxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEZpbGVzRXhwbG9yZXJGb2N1c0NvbmRpdGlvbiwgRXhwbG9yZXJSb290Q29udGV4dC50b05lZ2F0ZWQoKSwgRXhwbG9yZXJSZXNvdXJjZVdyaXRhYmxlQ29udGV4dCksXG5cdHByaW1hcnk6IEtleUNvZGUuRjIsXG5cdG1hYzoge1xuXHRcdHByaW1hcnk6IEtleUNvZGUuRW50ZXJcblx0fSxcblx0aGFuZGxlcjogcmVuYW1lSGFuZGxlclxufSk7XG5cbmNvbnN0IE1PVkVfRklMRV9UT19UUkFTSF9JRCA9ICdtb3ZlRmlsZVRvVHJhc2gnO1xuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBNT1ZFX0ZJTEVfVE9fVFJBU0hfSUQsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgZXhwbG9yZXJDb21tYW5kc1dlaWdodEJvbnVzLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRmlsZXNFeHBsb3JlckZvY3VzQ29uZGl0aW9uLCBFeHBsb3JlclJlc291cmNlTW92ZWFibGVUb1RyYXNoKSxcblx0cHJpbWFyeTogS2V5Q29kZS5EZWxldGUsXG5cdG1hYzoge1xuXHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5CYWNrc3BhY2UsXG5cdFx0c2Vjb25kYXJ5OiBbS2V5Q29kZS5EZWxldGVdXG5cdH0sXG5cdGhhbmRsZXI6IG1vdmVGaWxlVG9UcmFzaEhhbmRsZXJcbn0pO1xuXG5jb25zdCBERUxFVEVfRklMRV9JRCA9ICdkZWxldGVGaWxlJztcbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogREVMRVRFX0ZJTEVfSUQsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgZXhwbG9yZXJDb21tYW5kc1dlaWdodEJvbnVzLFxuXHR3aGVuOiBGaWxlc0V4cGxvcmVyRm9jdXNDb25kaXRpb24sXG5cdHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRGVsZXRlLFxuXHRtYWM6IHtcblx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLkJhY2tzcGFjZVxuXHR9LFxuXHRoYW5kbGVyOiBkZWxldGVGaWxlSGFuZGxlclxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogREVMRVRFX0ZJTEVfSUQsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgZXhwbG9yZXJDb21tYW5kc1dlaWdodEJvbnVzLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRmlsZXNFeHBsb3JlckZvY3VzQ29uZGl0aW9uLCBFeHBsb3JlclJlc291cmNlTW92ZWFibGVUb1RyYXNoLnRvTmVnYXRlZCgpKSxcblx0cHJpbWFyeTogS2V5Q29kZS5EZWxldGUsXG5cdG1hYzoge1xuXHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5CYWNrc3BhY2Vcblx0fSxcblx0aGFuZGxlcjogZGVsZXRlRmlsZUhhbmRsZXJcbn0pO1xuXG5jb25zdCBDVVRfRklMRV9JRCA9ICdmaWxlc0V4cGxvcmVyLmN1dCc7XG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IENVVF9GSUxFX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIGV4cGxvcmVyQ29tbWFuZHNXZWlnaHRCb251cyxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEZpbGVzRXhwbG9yZXJGb2N1c0NvbmRpdGlvbiwgRXhwbG9yZXJSb290Q29udGV4dC50b05lZ2F0ZWQoKSwgRXhwbG9yZXJSZXNvdXJjZVdyaXRhYmxlQ29udGV4dCksXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlYLFxuXHRoYW5kbGVyOiBjdXRGaWxlSGFuZGxlcixcbn0pO1xuXG5jb25zdCBDT1BZX0ZJTEVfSUQgPSAnZmlsZXNFeHBsb3Jlci5jb3B5JztcbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogQ09QWV9GSUxFX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIGV4cGxvcmVyQ29tbWFuZHNXZWlnaHRCb251cyxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEZpbGVzRXhwbG9yZXJGb2N1c0NvbmRpdGlvbiwgRXhwbG9yZXJSb290Q29udGV4dC50b05lZ2F0ZWQoKSksXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlDLFxuXHRoYW5kbGVyOiBjb3B5RmlsZUhhbmRsZXIsXG59KTtcblxuY29uc3QgUEFTVEVfRklMRV9JRCA9ICdmaWxlc0V4cGxvcmVyLnBhc3RlJztcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoUEFTVEVfRklMRV9JRCwgcGFzdGVGaWxlSGFuZGxlcik7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBgXiR7UEFTVEVfRklMRV9JRH1gLCAvLyB0aGUgYF5gIGVuYWJsZXMgcGFzdGluZyBmaWxlcyBpbnRvIHRoZSBleHBsb3JlciBieSBwcmV2ZW50aW5nIGRlZmF1bHQgYnViYmxlIHVwXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgZXhwbG9yZXJDb21tYW5kc1dlaWdodEJvbnVzLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRmlsZXNFeHBsb3JlckZvY3VzQ29uZGl0aW9uLCBFeHBsb3JlclJlc291cmNlV3JpdGFibGVDb250ZXh0KSxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVYsXG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnZmlsZXNFeHBsb3Jlci5jYW5jZWxDdXQnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIGV4cGxvcmVyQ29tbWFuZHNXZWlnaHRCb251cyxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEZpbGVzRXhwbG9yZXJGb2N1c0NvbmRpdGlvbiwgRXhwbG9yZXJSZXNvdXJjZUN1dCksXG5cdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCBleHBsb3JlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4cGxvcmVyU2VydmljZSk7XG5cdFx0YXdhaXQgZXhwbG9yZXJTZXJ2aWNlLnNldFRvQ29weShbXSwgdHJ1ZSk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdmaWxlc0V4cGxvcmVyLm9wZW5GaWxlUHJlc2VydmVGb2N1cycsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgZXhwbG9yZXJDb21tYW5kc1dlaWdodEJvbnVzLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRmlsZXNFeHBsb3JlckZvY3VzQ29uZGl0aW9uLCBFeHBsb3JlckZvbGRlckNvbnRleHQudG9OZWdhdGVkKCkpLFxuXHRwcmltYXJ5OiBLZXlDb2RlLlNwYWNlLFxuXHRoYW5kbGVyOiBvcGVuRmlsZVByZXNlcnZlRm9jdXNIYW5kbGVyXG59KTtcblxuY29uc3QgY29weVBhdGhDb21tYW5kID0ge1xuXHRpZDogQ09QWV9QQVRIX0NPTU1BTkRfSUQsXG5cdHRpdGxlOiBubHMubG9jYWxpemUoJ2NvcHlQYXRoJywgXCJDb3B5IFBhdGhcIilcbn07XG5cbmNvbnN0IGNvcHlSZWxhdGl2ZVBhdGhDb21tYW5kID0ge1xuXHRpZDogQ09QWV9SRUxBVElWRV9QQVRIX0NPTU1BTkRfSUQsXG5cdHRpdGxlOiBubHMubG9jYWxpemUoJ2NvcHlSZWxhdGl2ZVBhdGgnLCBcIkNvcHkgUmVsYXRpdmUgUGF0aFwiKVxufTtcblxuZXhwb3J0IGNvbnN0IHJldmVhbEluU2lkZUJhckNvbW1hbmQgPSB7XG5cdGlkOiBSRVZFQUxfSU5fRVhQTE9SRVJfQ09NTUFORF9JRCxcblx0dGl0bGU6IG5scy5sb2NhbGl6ZSgncmV2ZWFsSW5TaWRlQmFyJywgXCJSZXZlYWwgaW4gRXhwbG9yZXIgVmlld1wiKVxufTtcblxuLy8gRWRpdG9yIFRpdGxlIENvbnRleHQgTWVudVxuYXBwZW5kRWRpdG9yVGl0bGVDb250ZXh0TWVudUl0ZW0oU0FWRV9GSUxFX0NPTU1BTkRfSUQsIFNBVkVfRklMRV9MQUJFTC52YWx1ZSwgQWN0aXZlRWRpdG9yRGlydHlDb250ZXh0LCAnMV9jbG9zZV9zYXZlJywgdHJ1ZSwgMTApO1xuYXBwZW5kRWRpdG9yVGl0bGVDb250ZXh0TWVudUl0ZW0oU0FWRV9GSUxFX0FTX0NPTU1BTkRfSUQsIFNBVkVfRklMRV9BU19MQUJFTC52YWx1ZSwgQWN0aXZlRWRpdG9yRGlydHlDb250ZXh0LCAnMV9jbG9zZV9zYXZlJywgZmFsc2UsIDIwKTtcbmFwcGVuZEVkaXRvclRpdGxlQ29udGV4dE1lbnVJdGVtKENPUFlfUEFUSF9DT01NQU5EX0lELCBjb3B5UGF0aENvbW1hbmQudGl0bGUsIFJlc291cmNlQ29udGV4dEtleS5Jc0ZpbGVTeXN0ZW1SZXNvdXJjZSwgJzFfY3V0Y29weXBhc3RlJywgdHJ1ZSk7XG5hcHBlbmRFZGl0b3JUaXRsZUNvbnRleHRNZW51SXRlbShDT1BZX1JFTEFUSVZFX1BBVEhfQ09NTUFORF9JRCwgY29weVJlbGF0aXZlUGF0aENvbW1hbmQudGl0bGUsIFJlc291cmNlQ29udGV4dEtleS5Jc0ZpbGVTeXN0ZW1SZXNvdXJjZSwgJzFfY3V0Y29weXBhc3RlJywgdHJ1ZSk7XG5hcHBlbmRFZGl0b3JUaXRsZUNvbnRleHRNZW51SXRlbShyZXZlYWxJblNpZGVCYXJDb21tYW5kLmlkLCByZXZlYWxJblNpZGVCYXJDb21tYW5kLnRpdGxlLCBSZXNvdXJjZUNvbnRleHRLZXkuSXNGaWxlU3lzdGVtUmVzb3VyY2UsICcyX2ZpbGVzJywgZmFsc2UsIDEpO1xuXG5leHBvcnQgZnVuY3Rpb24gYXBwZW5kRWRpdG9yVGl0bGVDb250ZXh0TWVudUl0ZW0oaWQ6IHN0cmluZywgdGl0bGU6IHN0cmluZywgd2hlbjogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQsIGdyb3VwOiBzdHJpbmcsIHN1cHBvcnRzTXVsdGlTZWxlY3Q6IGJvb2xlYW4sIG9yZGVyPzogbnVtYmVyKTogdm9pZCB7XG5cdGNvbnN0IHByZWNvbmRpdGlvbiA9IHN1cHBvcnRzTXVsdGlTZWxlY3QgIT09IHRydWUgPyBNdWx0aXBsZUVkaXRvcnNTZWxlY3RlZEluR3JvdXBDb250ZXh0Lm5lZ2F0ZSgpIDogdW5kZWZpbmVkO1xuXG5cdC8vIE1lbnVcblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUaXRsZUNvbnRleHQsIHtcblx0XHRjb21tYW5kOiB7IGlkLCB0aXRsZSwgcHJlY29uZGl0aW9uIH0sXG5cdFx0d2hlbixcblx0XHRncm91cCxcblx0XHRvcmRlcixcblx0fSk7XG59XG5cbi8vIEVkaXRvciBUaXRsZSBNZW51IGZvciBDb25mbGljdCBSZXNvbHV0aW9uXG5hcHBlbmRTYXZlQ29uZmxpY3RFZGl0b3JUaXRsZUFjdGlvbignd29ya2JlbmNoLmZpbGVzLmFjdGlvbi5hY2NlcHRMb2NhbENoYW5nZXMnLCBubHMubG9jYWxpemUoJ2FjY2VwdExvY2FsQ2hhbmdlcycsIFwiVXNlIHlvdXIgY2hhbmdlcyBhbmQgb3ZlcndyaXRlIGZpbGUgY29udGVudHNcIiksIENvZGljb24uY2hlY2ssIC0xMCwgYWNjZXB0TG9jYWxDaGFuZ2VzQ29tbWFuZCk7XG5hcHBlbmRTYXZlQ29uZmxpY3RFZGl0b3JUaXRsZUFjdGlvbignd29ya2JlbmNoLmZpbGVzLmFjdGlvbi5yZXZlcnRMb2NhbENoYW5nZXMnLCBubHMubG9jYWxpemUoJ3JldmVydExvY2FsQ2hhbmdlcycsIFwiRGlzY2FyZCB5b3VyIGNoYW5nZXMgYW5kIHJldmVydCB0byBmaWxlIGNvbnRlbnRzXCIpLCBDb2RpY29uLmRpc2NhcmQsIC05LCByZXZlcnRMb2NhbENoYW5nZXNDb21tYW5kKTtcblxuZnVuY3Rpb24gYXBwZW5kU2F2ZUNvbmZsaWN0RWRpdG9yVGl0bGVBY3Rpb24oaWQ6IHN0cmluZywgdGl0bGU6IHN0cmluZywgaWNvbjogVGhlbWVJY29uLCBvcmRlcjogbnVtYmVyLCBjb21tYW5kOiBJQ29tbWFuZEhhbmRsZXIpOiB2b2lkIHtcblxuXHQvLyBDb21tYW5kXG5cdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKGlkLCBjb21tYW5kKTtcblxuXHQvLyBBY3Rpb25cblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUaXRsZSwge1xuXHRcdGNvbW1hbmQ6IHsgaWQsIHRpdGxlLCBpY29uIH0sXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKENPTkZMSUNUX1JFU09MVVRJT05fQ09OVEVYVCwgdHJ1ZSksXG5cdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRvcmRlclxuXHR9KTtcbn1cblxuLy8gTWVudSByZWdpc3RyYXRpb24gLSBjb21tYW5kIHBhbGV0dGVcblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGVuZFRvQ29tbWFuZFBhbGV0dGUoeyBpZCwgdGl0bGUsIGNhdGVnb3J5LCBtZXRhZGF0YSB9OiBJQ29tbWFuZEFjdGlvbiwgd2hlbj86IENvbnRleHRLZXlFeHByZXNzaW9uKTogdm9pZCB7XG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHtcblx0XHRjb21tYW5kOiB7XG5cdFx0XHRpZCxcblx0XHRcdHRpdGxlLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRtZXRhZGF0YVxuXHRcdH0sXG5cdFx0d2hlblxuXHR9KTtcbn1cblxuYXBwZW5kVG9Db21tYW5kUGFsZXR0ZSh7XG5cdGlkOiBDT1BZX1BBVEhfQ09NTUFORF9JRCxcblx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2NvcHlQYXRoT2ZBY3RpdmUnLCBcIkNvcHkgUGF0aCBvZiBBY3RpdmUgRmlsZVwiKSxcblx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRmlsZVxufSwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCkpO1xuYXBwZW5kVG9Db21tYW5kUGFsZXR0ZSh7XG5cdGlkOiBDT1BZX1JFTEFUSVZFX1BBVEhfQ09NTUFORF9JRCxcblx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2NvcHlSZWxhdGl2ZVBhdGhPZkFjdGl2ZScsIFwiQ29weSBSZWxhdGl2ZSBQYXRoIG9mIEFjdGl2ZSBGaWxlXCIpLFxuXHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5GaWxlXG59LCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSk7XG5cbmFwcGVuZFRvQ29tbWFuZFBhbGV0dGUoe1xuXHRpZDogU0FWRV9GSUxFX0NPTU1BTkRfSUQsXG5cdHRpdGxlOiBTQVZFX0ZJTEVfTEFCRUwsXG5cdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkZpbGVcbn0pO1xuXG5hcHBlbmRUb0NvbW1hbmRQYWxldHRlKHtcblx0aWQ6IFNBVkVfRklMRV9XSVRIT1VUX0ZPUk1BVFRJTkdfQ09NTUFORF9JRCxcblx0dGl0bGU6IFNBVkVfRklMRV9XSVRIT1VUX0ZPUk1BVFRJTkdfTEFCRUwsXG5cdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkZpbGVcbn0pO1xuXG5hcHBlbmRUb0NvbW1hbmRQYWxldHRlKHtcblx0aWQ6IFNBVkVfQUxMX0lOX0dST1VQX0NPTU1BTkRfSUQsXG5cdHRpdGxlOiBubHMubG9jYWxpemUyKCdzYXZlQWxsSW5Hcm91cCcsIFwiU2F2ZSBBbGwgaW4gR3JvdXBcIiksXG5cdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkZpbGVcbn0sIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKTtcblxuYXBwZW5kVG9Db21tYW5kUGFsZXR0ZSh7XG5cdGlkOiBTQVZFX0ZJTEVTX0NPTU1BTkRfSUQsXG5cdHRpdGxlOiBubHMubG9jYWxpemUyKCdzYXZlRmlsZXMnLCBcIlNhdmUgQWxsIEZpbGVzXCIpLFxuXHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5GaWxlXG59LCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSk7XG5cbmFwcGVuZFRvQ29tbWFuZFBhbGV0dGUoe1xuXHRpZDogUkVWRVJUX0ZJTEVfQ09NTUFORF9JRCxcblx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3JldmVydCcsIFwiUmV2ZXJ0IEZpbGVcIiksXG5cdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkZpbGVcbn0sIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKTtcblxuYXBwZW5kVG9Db21tYW5kUGFsZXR0ZSh7XG5cdGlkOiBDT01QQVJFX1dJVEhfU0FWRURfQ09NTUFORF9JRCxcblx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2NvbXBhcmVBY3RpdmVXaXRoU2F2ZWQnLCBcIkNvbXBhcmUgQWN0aXZlIEZpbGUgd2l0aCBTYXZlZFwiKSxcblx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRmlsZSxcblx0bWV0YWRhdGE6IHtcblx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplMignY29tcGFyZUFjdGl2ZVdpdGhTYXZlZE1ldGEnLCBcIk9wZW5zIGEgbmV3IGRpZmYgZWRpdG9yIHRvIGNvbXBhcmUgdGhlIGFjdGl2ZSBmaWxlIHdpdGggdGhlIHZlcnNpb24gb24gZGlzay5cIilcblx0fVxufSk7XG5cbmFwcGVuZFRvQ29tbWFuZFBhbGV0dGUoe1xuXHRpZDogU0FWRV9GSUxFX0FTX0NPTU1BTkRfSUQsXG5cdHRpdGxlOiBTQVZFX0ZJTEVfQVNfTEFCRUwsXG5cdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkZpbGVcbn0sIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKTtcblxuYXBwZW5kVG9Db21tYW5kUGFsZXR0ZSh7XG5cdGlkOiBORVdfRklMRV9DT01NQU5EX0lELFxuXHR0aXRsZTogTkVXX0ZJTEVfTEFCRUwsXG5cdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkZpbGVcbn0sIENvbnRleHRLZXlFeHByLmFuZChXb3Jrc3BhY2VGb2xkZXJDb3VudENvbnRleHQubm90RXF1YWxzVG8oJzAnKSwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCkpKTtcblxuYXBwZW5kVG9Db21tYW5kUGFsZXR0ZSh7XG5cdGlkOiBORVdfRk9MREVSX0NPTU1BTkRfSUQsXG5cdHRpdGxlOiBORVdfRk9MREVSX0xBQkVMLFxuXHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5GaWxlLFxuXHRtZXRhZGF0YTogeyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplMignbmV3Rm9sZGVyRGVzY3JpcHRpb24nLCBcIkNyZWF0ZSBhIG5ldyBmb2xkZXIgb3IgZGlyZWN0b3J5XCIpIH1cbn0sIENvbnRleHRLZXlFeHByLmFuZChXb3Jrc3BhY2VGb2xkZXJDb3VudENvbnRleHQubm90RXF1YWxzVG8oJzAnKSwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCkpKTtcblxuYXBwZW5kVG9Db21tYW5kUGFsZXR0ZSh7XG5cdGlkOiBORVdfVU5USVRMRURfRklMRV9DT01NQU5EX0lELFxuXHR0aXRsZTogTkVXX1VOVElUTEVEX0ZJTEVfTEFCRUwsXG5cdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkZpbGVcbn0sIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKTtcblxuLy8gTWVudSByZWdpc3RyYXRpb24gLSBvcGVuIGVkaXRvcnNcblxuY29uc3QgaXNGaWxlT3JVbnRpdGxlZFJlc291cmNlQ29udGV4dEtleSA9IENvbnRleHRLZXlFeHByLm9yKFJlc291cmNlQ29udGV4dEtleS5Jc0ZpbGVTeXN0ZW1SZXNvdXJjZSwgUmVzb3VyY2VDb250ZXh0S2V5LlNjaGVtZS5pc0VxdWFsVG8oU2NoZW1hcy51bnRpdGxlZCkpO1xuXG5jb25zdCBvcGVuVG9TaWRlQ29tbWFuZCA9IHtcblx0aWQ6IE9QRU5fVE9fU0lERV9DT01NQU5EX0lELFxuXHR0aXRsZTogbmxzLmxvY2FsaXplKCdvcGVuVG9TaWRlJywgXCJPcGVuIHRvIHRoZSBTaWRlXCIpXG59O1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5PcGVuRWRpdG9yc0NvbnRleHQsIHtcblx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0b3JkZXI6IDEwLFxuXHRjb21tYW5kOiBvcGVuVG9TaWRlQ29tbWFuZCxcblx0d2hlbjogaXNGaWxlT3JVbnRpdGxlZFJlc291cmNlQ29udGV4dEtleVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuT3BlbkVkaXRvcnNDb250ZXh0LCB7XG5cdGdyb3VwOiAnMV9vcGVuJyxcblx0b3JkZXI6IDEwLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IFJFT1BFTl9XSVRIX0NPTU1BTkRfSUQsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgncmVvcGVuV2l0aCcsIFwiUmVvcGVuIEVkaXRvciBXaXRoLi4uXCIpXG5cdH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHQvLyBFZGl0b3JzIHdpdGggQXZhaWxhYmxlIENob2ljZXMgdG8gT3BlbiBXaXRoXG5cdFx0QWN0aXZlRWRpdG9yQXZhaWxhYmxlRWRpdG9ySWRzQ29udGV4dCxcblx0XHQvLyBOb3Q6IGVkaXRvciBncm91cHNcblx0XHRPcGVuRWRpdG9yc0dyb3VwQ29udGV4dC50b05lZ2F0ZWQoKVxuXHQpXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5PcGVuRWRpdG9yc0NvbnRleHQsIHtcblx0Z3JvdXA6ICcxX2N1dGNvcHlwYXN0ZScsXG5cdG9yZGVyOiAxMCxcblx0Y29tbWFuZDogY29weVBhdGhDb21tYW5kLFxuXHR3aGVuOiBSZXNvdXJjZUNvbnRleHRLZXkuSXNGaWxlU3lzdGVtUmVzb3VyY2Vcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk9wZW5FZGl0b3JzQ29udGV4dCwge1xuXHRncm91cDogJzFfY3V0Y29weXBhc3RlJyxcblx0b3JkZXI6IDIwLFxuXHRjb21tYW5kOiBjb3B5UmVsYXRpdmVQYXRoQ29tbWFuZCxcblx0d2hlbjogUmVzb3VyY2VDb250ZXh0S2V5LklzRmlsZVN5c3RlbVJlc291cmNlXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5PcGVuRWRpdG9yc0NvbnRleHQsIHtcblx0Z3JvdXA6ICcyX3NhdmUnLFxuXHRvcmRlcjogMTAsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogU0FWRV9GSUxFX0NPTU1BTkRfSUQsXG5cdFx0dGl0bGU6IFNBVkVfRklMRV9MQUJFTCxcblx0XHRwcmVjb25kaXRpb246IE9wZW5FZGl0b3JzRGlydHlFZGl0b3JDb250ZXh0XG5cdH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLm9yKFxuXHRcdC8vIFVudGl0bGVkIEVkaXRvcnNcblx0XHRSZXNvdXJjZUNvbnRleHRLZXkuU2NoZW1lLmlzRXF1YWxUbyhTY2hlbWFzLnVudGl0bGVkKSxcblx0XHQvLyBPcjpcblx0XHRDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHQvLyBOb3Q6IGVkaXRvciBncm91cHNcblx0XHRcdE9wZW5FZGl0b3JzR3JvdXBDb250ZXh0LnRvTmVnYXRlZCgpLFxuXHRcdFx0Ly8gTm90OiByZWFkb25seSBlZGl0b3JzXG5cdFx0XHRPcGVuRWRpdG9yc1JlYWRvbmx5RWRpdG9yQ29udGV4dC50b05lZ2F0ZWQoKSxcblx0XHRcdC8vIE5vdDogYXV0byBzYXZlIGFmdGVyIHNob3J0IGRlbGF5XG5cdFx0XHRBdXRvU2F2ZUFmdGVyU2hvcnREZWxheUNvbnRleHQudG9OZWdhdGVkKClcblx0XHQpXG5cdClcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk9wZW5FZGl0b3JzQ29udGV4dCwge1xuXHRncm91cDogJzJfc2F2ZScsXG5cdG9yZGVyOiAyMCxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBSRVZFUlRfRklMRV9DT01NQU5EX0lELFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ3JldmVydCcsIFwiUmV2ZXJ0IEZpbGVcIiksXG5cdFx0cHJlY29uZGl0aW9uOiBPcGVuRWRpdG9yc0RpcnR5RWRpdG9yQ29udGV4dFxuXHR9LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0Ly8gTm90OiBlZGl0b3IgZ3JvdXBzXG5cdFx0T3BlbkVkaXRvcnNHcm91cENvbnRleHQudG9OZWdhdGVkKCksXG5cdFx0Ly8gTm90OiByZWFkb25seSBlZGl0b3JzXG5cdFx0T3BlbkVkaXRvcnNSZWFkb25seUVkaXRvckNvbnRleHQudG9OZWdhdGVkKCksXG5cdFx0Ly8gTm90OiB1bnRpdGxlZCBlZGl0b3JzIChyZXZlcnQgY2xvc2VzIHRoZW0pXG5cdFx0UmVzb3VyY2VDb250ZXh0S2V5LlNjaGVtZS5ub3RFcXVhbHNUbyhTY2hlbWFzLnVudGl0bGVkKSxcblx0XHQvLyBOb3Q6IGF1dG8gc2F2ZSBhZnRlciBzaG9ydCBkZWxheVxuXHRcdEF1dG9TYXZlQWZ0ZXJTaG9ydERlbGF5Q29udGV4dC50b05lZ2F0ZWQoKVxuXHQpXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5PcGVuRWRpdG9yc0NvbnRleHQsIHtcblx0Z3JvdXA6ICcyX3NhdmUnLFxuXHRvcmRlcjogMzAsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogU0FWRV9BTExfSU5fR1JPVVBfQ09NTUFORF9JRCxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdzYXZlQWxsJywgXCJTYXZlIEFsbFwiKSxcblx0XHRwcmVjb25kaXRpb246IERpcnR5V29ya2luZ0NvcGllc0NvbnRleHRcblx0fSxcblx0Ly8gRWRpdG9yIEdyb3VwXG5cdHdoZW46IE9wZW5FZGl0b3JzR3JvdXBDb250ZXh0XG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5PcGVuRWRpdG9yc0NvbnRleHQsIHtcblx0Z3JvdXA6ICczX2NvbXBhcmUnLFxuXHRvcmRlcjogMTAsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogQ09NUEFSRV9XSVRIX1NBVkVEX0NPTU1BTkRfSUQsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnY29tcGFyZVdpdGhTYXZlZCcsIFwiQ29tcGFyZSB3aXRoIFNhdmVkXCIpLFxuXHRcdHByZWNvbmRpdGlvbjogT3BlbkVkaXRvcnNEaXJ0eUVkaXRvckNvbnRleHRcblx0fSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFJlc291cmNlQ29udGV4dEtleS5Jc0ZpbGVTeXN0ZW1SZXNvdXJjZSwgQXV0b1NhdmVBZnRlclNob3J0RGVsYXlDb250ZXh0LnRvTmVnYXRlZCgpLCBXb3JrYmVuY2hMaXN0RG91YmxlU2VsZWN0aW9uLnRvTmVnYXRlZCgpKVxufSk7XG5cbmNvbnN0IGNvbXBhcmVSZXNvdXJjZUNvbW1hbmQgPSB7XG5cdGlkOiBDT01QQVJFX1JFU09VUkNFX0NPTU1BTkRfSUQsXG5cdHRpdGxlOiBubHMubG9jYWxpemUoJ2NvbXBhcmVXaXRoU2VsZWN0ZWQnLCBcIkNvbXBhcmUgd2l0aCBTZWxlY3RlZFwiKVxufTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuT3BlbkVkaXRvcnNDb250ZXh0LCB7XG5cdGdyb3VwOiAnM19jb21wYXJlJyxcblx0b3JkZXI6IDIwLFxuXHRjb21tYW5kOiBjb21wYXJlUmVzb3VyY2VDb21tYW5kLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoUmVzb3VyY2VDb250ZXh0S2V5Lkhhc1Jlc291cmNlLCBSZXNvdXJjZVNlbGVjdGVkRm9yQ29tcGFyZUNvbnRleHQsIGlzRmlsZU9yVW50aXRsZWRSZXNvdXJjZUNvbnRleHRLZXksIFdvcmtiZW5jaExpc3REb3VibGVTZWxlY3Rpb24udG9OZWdhdGVkKCkpXG59KTtcblxuY29uc3Qgc2VsZWN0Rm9yQ29tcGFyZUNvbW1hbmQgPSB7XG5cdGlkOiBTRUxFQ1RfRk9SX0NPTVBBUkVfQ09NTUFORF9JRCxcblx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnY29tcGFyZVNvdXJjZScsIFwiU2VsZWN0IGZvciBDb21wYXJlXCIpXG59O1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5PcGVuRWRpdG9yc0NvbnRleHQsIHtcblx0Z3JvdXA6ICczX2NvbXBhcmUnLFxuXHRvcmRlcjogMzAsXG5cdGNvbW1hbmQ6IHNlbGVjdEZvckNvbXBhcmVDb21tYW5kLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoUmVzb3VyY2VDb250ZXh0S2V5Lkhhc1Jlc291cmNlLCBpc0ZpbGVPclVudGl0bGVkUmVzb3VyY2VDb250ZXh0S2V5LCBXb3JrYmVuY2hMaXN0RG91YmxlU2VsZWN0aW9uLnRvTmVnYXRlZCgpKVxufSk7XG5cbmNvbnN0IGNvbXBhcmVTZWxlY3RlZENvbW1hbmQgPSB7XG5cdGlkOiBDT01QQVJFX1NFTEVDVEVEX0NPTU1BTkRfSUQsXG5cdHRpdGxlOiBubHMubG9jYWxpemUoJ2NvbXBhcmVTZWxlY3RlZCcsIFwiQ29tcGFyZSBTZWxlY3RlZFwiKVxufTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuT3BlbkVkaXRvcnNDb250ZXh0LCB7XG5cdGdyb3VwOiAnM19jb21wYXJlJyxcblx0b3JkZXI6IDMwLFxuXHRjb21tYW5kOiBjb21wYXJlU2VsZWN0ZWRDb21tYW5kLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoUmVzb3VyY2VDb250ZXh0S2V5Lkhhc1Jlc291cmNlLCBXb3JrYmVuY2hMaXN0RG91YmxlU2VsZWN0aW9uLCBPcGVuRWRpdG9yc1NlbGVjdGVkRmlsZU9yVW50aXRsZWRDb250ZXh0KVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGVDb250ZXh0LCB7XG5cdGdyb3VwOiAnMV9jb21wYXJlJyxcblx0b3JkZXI6IDMwLFxuXHRjb21tYW5kOiBjb21wYXJlU2VsZWN0ZWRDb21tYW5kLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoUmVzb3VyY2VDb250ZXh0S2V5Lkhhc1Jlc291cmNlLCBUd29FZGl0b3JzU2VsZWN0ZWRJbkdyb3VwQ29udGV4dCwgU2VsZWN0ZWRFZGl0b3JzSW5Hcm91cEZpbGVPclVudGl0bGVkUmVzb3VyY2VDb250ZXh0S2V5KVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuT3BlbkVkaXRvcnNDb250ZXh0LCB7XG5cdGdyb3VwOiAnNF9jbG9zZScsXG5cdG9yZGVyOiAxMCxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBDTE9TRV9FRElUT1JfQ09NTUFORF9JRCxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdjbG9zZScsIFwiQ2xvc2VcIilcblx0fSxcblx0d2hlbjogT3BlbkVkaXRvcnNHcm91cENvbnRleHQudG9OZWdhdGVkKClcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk9wZW5FZGl0b3JzQ29udGV4dCwge1xuXHRncm91cDogJzRfY2xvc2UnLFxuXHRvcmRlcjogMjAsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogQ0xPU0VfT1RIRVJfRURJVE9SU19JTl9HUk9VUF9DT01NQU5EX0lELFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2Nsb3NlT3RoZXJzJywgXCJDbG9zZSBPdGhlcnNcIilcblx0fSxcblx0d2hlbjogT3BlbkVkaXRvcnNHcm91cENvbnRleHQudG9OZWdhdGVkKClcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk9wZW5FZGl0b3JzQ29udGV4dCwge1xuXHRncm91cDogJzRfY2xvc2UnLFxuXHRvcmRlcjogMzAsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogQ0xPU0VfU0FWRURfRURJVE9SU19DT01NQU5EX0lELFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2Nsb3NlU2F2ZWQnLCBcIkNsb3NlIFNhdmVkXCIpXG5cdH1cbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk9wZW5FZGl0b3JzQ29udGV4dCwge1xuXHRncm91cDogJzRfY2xvc2UnLFxuXHRvcmRlcjogNDAsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogQ0xPU0VfRURJVE9SU19JTl9HUk9VUF9DT01NQU5EX0lELFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2Nsb3NlQWxsJywgXCJDbG9zZSBBbGxcIilcblx0fVxufSk7XG5cbi8vIE1lbnUgcmVnaXN0cmF0aW9uIC0gZXhwbG9yZXJcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FeHBsb3JlckNvbnRleHQsIHtcblx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0b3JkZXI6IDQsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogTkVXX0ZJTEVfQ09NTUFORF9JRCxcblx0XHR0aXRsZTogTkVXX0ZJTEVfTEFCRUwsXG5cdFx0cHJlY29uZGl0aW9uOiBFeHBsb3JlclJlc291cmNlV3JpdGFibGVDb250ZXh0XG5cdH0sXG5cdHdoZW46IEV4cGxvcmVyRm9sZGVyQ29udGV4dFxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRXhwbG9yZXJDb250ZXh0LCB7XG5cdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdG9yZGVyOiA2LFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IE5FV19GT0xERVJfQ09NTUFORF9JRCxcblx0XHR0aXRsZTogTkVXX0ZPTERFUl9MQUJFTCxcblx0XHRwcmVjb25kaXRpb246IEV4cGxvcmVyUmVzb3VyY2VXcml0YWJsZUNvbnRleHRcblx0fSxcblx0d2hlbjogRXhwbG9yZXJGb2xkZXJDb250ZXh0XG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FeHBsb3JlckNvbnRleHQsIHtcblx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0b3JkZXI6IDEwLFxuXHRjb21tYW5kOiBvcGVuVG9TaWRlQ29tbWFuZCxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEV4cGxvcmVyRm9sZGVyQ29udGV4dC50b05lZ2F0ZWQoKSwgUmVzb3VyY2VDb250ZXh0S2V5Lkhhc1Jlc291cmNlKVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRXhwbG9yZXJDb250ZXh0LCB7XG5cdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdG9yZGVyOiAyMCxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBPUEVOX1dJVEhfRVhQTE9SRVJfQ09NTUFORF9JRCxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdleHBsb3Jlck9wZW5XaXRoJywgXCJPcGVuIFdpdGguLi5cIiksXG5cdH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChFeHBsb3JlckZvbGRlckNvbnRleHQudG9OZWdhdGVkKCksIEV4cGxvcmVyUmVzb3VyY2VBdmFpbGFibGVFZGl0b3JJZHNDb250ZXh0KSxcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkV4cGxvcmVyQ29udGV4dCwge1xuXHRncm91cDogJzNfY29tcGFyZScsXG5cdG9yZGVyOiAyMCxcblx0Y29tbWFuZDogY29tcGFyZVJlc291cmNlQ29tbWFuZCxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEV4cGxvcmVyRm9sZGVyQ29udGV4dC50b05lZ2F0ZWQoKSwgUmVzb3VyY2VDb250ZXh0S2V5Lkhhc1Jlc291cmNlLCBSZXNvdXJjZVNlbGVjdGVkRm9yQ29tcGFyZUNvbnRleHQsIFdvcmtiZW5jaExpc3REb3VibGVTZWxlY3Rpb24udG9OZWdhdGVkKCkpXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FeHBsb3JlckNvbnRleHQsIHtcblx0Z3JvdXA6ICczX2NvbXBhcmUnLFxuXHRvcmRlcjogMzAsXG5cdGNvbW1hbmQ6IHNlbGVjdEZvckNvbXBhcmVDb21tYW5kLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRXhwbG9yZXJGb2xkZXJDb250ZXh0LnRvTmVnYXRlZCgpLCBSZXNvdXJjZUNvbnRleHRLZXkuSGFzUmVzb3VyY2UsIFdvcmtiZW5jaExpc3REb3VibGVTZWxlY3Rpb24udG9OZWdhdGVkKCkpXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FeHBsb3JlckNvbnRleHQsIHtcblx0Z3JvdXA6ICczX2NvbXBhcmUnLFxuXHRvcmRlcjogMzAsXG5cdGNvbW1hbmQ6IGNvbXBhcmVTZWxlY3RlZENvbW1hbmQsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChFeHBsb3JlckZvbGRlckNvbnRleHQudG9OZWdhdGVkKCksIFJlc291cmNlQ29udGV4dEtleS5IYXNSZXNvdXJjZSwgV29ya2JlbmNoTGlzdERvdWJsZVNlbGVjdGlvbilcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkV4cGxvcmVyQ29udGV4dCwge1xuXHRncm91cDogJzVfY3V0Y29weXBhc3RlJyxcblx0b3JkZXI6IDgsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogQ1VUX0ZJTEVfSUQsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnY3V0JywgXCJDdXRcIiksXG5cdH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChFeHBsb3JlclJvb3RDb250ZXh0LnRvTmVnYXRlZCgpLCBFeHBsb3JlclJlc291cmNlV3JpdGFibGVDb250ZXh0KVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRXhwbG9yZXJDb250ZXh0LCB7XG5cdGdyb3VwOiAnNV9jdXRjb3B5cGFzdGUnLFxuXHRvcmRlcjogMTAsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogQ09QWV9GSUxFX0lELFxuXHRcdHRpdGxlOiBDT1BZX0ZJTEVfTEFCRUwsXG5cdH0sXG5cdHdoZW46IEV4cGxvcmVyUm9vdENvbnRleHQudG9OZWdhdGVkKClcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkV4cGxvcmVyQ29udGV4dCwge1xuXHRncm91cDogJzVfY3V0Y29weXBhc3RlJyxcblx0b3JkZXI6IDIwLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IFBBU1RFX0ZJTEVfSUQsXG5cdFx0dGl0bGU6IFBBU1RFX0ZJTEVfTEFCRUwsXG5cdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoRXhwbG9yZXJSZXNvdXJjZVdyaXRhYmxlQ29udGV4dCwgRmlsZUNvcGllZENvbnRleHQpXG5cdH0sXG5cdHdoZW46IEV4cGxvcmVyRm9sZGVyQ29udGV4dFxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRXhwbG9yZXJDb250ZXh0LCAoe1xuXHRncm91cDogJzViX2ltcG9ydGV4cG9ydCcsXG5cdG9yZGVyOiAxMCxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBET1dOTE9BRF9DT01NQU5EX0lELFxuXHRcdHRpdGxlOiBET1dOTE9BRF9MQUJFTFxuXHR9LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihcblx0XHQvLyBuYXRpdmU6IGZvciBhbnkgcmVtb3RlIHJlc291cmNlXG5cdFx0Q29udGV4dEtleUV4cHIuYW5kKElzV2ViQ29udGV4dC50b05lZ2F0ZWQoKSwgUmVzb3VyY2VDb250ZXh0S2V5LlNjaGVtZS5ub3RFcXVhbHNUbyhTY2hlbWFzLmZpbGUpKSxcblx0XHQvLyB3ZWI6IGZvciBhbnkgZmlsZXNcblx0XHRDb250ZXh0S2V5RXhwci5hbmQoSXNXZWJDb250ZXh0LCBFeHBsb3JlckZvbGRlckNvbnRleHQudG9OZWdhdGVkKCksIEV4cGxvcmVyUm9vdENvbnRleHQudG9OZWdhdGVkKCkpLFxuXHRcdC8vIHdlYjogZm9yIGFueSBmb2xkZXJzIGlmIGZpbGUgc3lzdGVtIEFQSSBzdXBwb3J0IGlzIHByb3ZpZGVkXG5cdFx0Q29udGV4dEtleUV4cHIuYW5kKElzV2ViQ29udGV4dCwgSGFzV2ViRmlsZVN5c3RlbUFjY2Vzcylcblx0KVxufSkpO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkV4cGxvcmVyQ29udGV4dCwgKHtcblx0Z3JvdXA6ICc1Yl9pbXBvcnRleHBvcnQnLFxuXHRvcmRlcjogMjAsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogVVBMT0FEX0NPTU1BTkRfSUQsXG5cdFx0dGl0bGU6IFVQTE9BRF9MQUJFTCxcblx0fSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdC8vIG9ubHkgaW4gd2ViXG5cdFx0SXNXZWJDb250ZXh0LFxuXHRcdC8vIG9ubHkgb24gZm9sZGVyc1xuXHRcdEV4cGxvcmVyRm9sZGVyQ29udGV4dCxcblx0XHQvLyBvbmx5IG9uIHdyaXRhYmxlIGZvbGRlcnNcblx0XHRFeHBsb3JlclJlc291cmNlV3JpdGFibGVDb250ZXh0XG5cdClcbn0pKTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FeHBsb3JlckNvbnRleHQsIHtcblx0Z3JvdXA6ICc2X2NvcHlwYXRoJyxcblx0b3JkZXI6IDEwLFxuXHRjb21tYW5kOiBjb3B5UGF0aENvbW1hbmQsXG5cdHdoZW46IFJlc291cmNlQ29udGV4dEtleS5Jc0ZpbGVTeXN0ZW1SZXNvdXJjZVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRXhwbG9yZXJDb250ZXh0LCB7XG5cdGdyb3VwOiAnNl9jb3B5cGF0aCcsXG5cdG9yZGVyOiAyMCxcblx0Y29tbWFuZDogY29weVJlbGF0aXZlUGF0aENvbW1hbmQsXG5cdHdoZW46IFJlc291cmNlQ29udGV4dEtleS5Jc0ZpbGVTeXN0ZW1SZXNvdXJjZVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRXhwbG9yZXJDb250ZXh0LCB7XG5cdGdyb3VwOiAnMl93b3Jrc3BhY2UnLFxuXHRvcmRlcjogMTAsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogQUREX1JPT1RfRk9MREVSX0NPTU1BTkRfSUQsXG5cdFx0dGl0bGU6IEFERF9ST09UX0ZPTERFUl9MQUJFTCxcblx0fSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEV4cGxvcmVyUm9vdENvbnRleHQsIENvbnRleHRLZXlFeHByLm9yKEVudGVyTXVsdGlSb290V29ya3NwYWNlU3VwcG9ydENvbnRleHQsIFdvcmtiZW5jaFN0YXRlQ29udGV4dC5pc0VxdWFsVG8oJ3dvcmtzcGFjZScpKSlcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkV4cGxvcmVyQ29udGV4dCwge1xuXHRncm91cDogJzJfd29ya3NwYWNlJyxcblx0b3JkZXI6IDMwLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IFJFTU9WRV9ST09UX0ZPTERFUl9DT01NQU5EX0lELFxuXHRcdHRpdGxlOiBSRU1PVkVfUk9PVF9GT0xERVJfTEFCRUwsXG5cdH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChFeHBsb3JlclJvb3RDb250ZXh0LCBFeHBsb3JlckZvbGRlckNvbnRleHQsIENvbnRleHRLZXlFeHByLmFuZChXb3Jrc3BhY2VGb2xkZXJDb3VudENvbnRleHQubm90RXF1YWxzVG8oJzAnKSwgQ29udGV4dEtleUV4cHIub3IoRW50ZXJNdWx0aVJvb3RXb3Jrc3BhY2VTdXBwb3J0Q29udGV4dCwgV29ya2JlbmNoU3RhdGVDb250ZXh0LmlzRXF1YWxUbygnd29ya3NwYWNlJykpKSlcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkV4cGxvcmVyQ29udGV4dCwge1xuXHRncm91cDogJzdfbW9kaWZpY2F0aW9uJyxcblx0b3JkZXI6IDEwLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IFJFTkFNRV9JRCxcblx0XHR0aXRsZTogVFJJR0dFUl9SRU5BTUVfTEFCRUwsXG5cdFx0cHJlY29uZGl0aW9uOiBFeHBsb3JlclJlc291cmNlV3JpdGFibGVDb250ZXh0LFxuXHR9LFxuXHR3aGVuOiBFeHBsb3JlclJvb3RDb250ZXh0LnRvTmVnYXRlZCgpXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FeHBsb3JlckNvbnRleHQsIHtcblx0Z3JvdXA6ICc3X21vZGlmaWNhdGlvbicsXG5cdG9yZGVyOiAyMCxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBNT1ZFX0ZJTEVfVE9fVFJBU0hfSUQsXG5cdFx0dGl0bGU6IE1PVkVfRklMRV9UT19UUkFTSF9MQUJFTFxuXHR9LFxuXHRhbHQ6IHtcblx0XHRpZDogREVMRVRFX0ZJTEVfSUQsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnZGVsZXRlRmlsZScsIFwiRGVsZXRlIFBlcm1hbmVudGx5XCIpXG5cdH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChFeHBsb3JlclJvb3RDb250ZXh0LnRvTmVnYXRlZCgpLCBFeHBsb3JlclJlc291cmNlTW92ZWFibGVUb1RyYXNoKVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRXhwbG9yZXJDb250ZXh0LCB7XG5cdGdyb3VwOiAnN19tb2RpZmljYXRpb24nLFxuXHRvcmRlcjogMjAsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogREVMRVRFX0ZJTEVfSUQsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnZGVsZXRlRmlsZScsIFwiRGVsZXRlIFBlcm1hbmVudGx5XCIpXG5cdH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChFeHBsb3JlclJvb3RDb250ZXh0LnRvTmVnYXRlZCgpLCBFeHBsb3JlclJlc291cmNlTW92ZWFibGVUb1RyYXNoLnRvTmVnYXRlZCgpKVxufSk7XG5cbi8vIEVtcHR5IEVkaXRvciBHcm91cCAvIEVkaXRvciBUYWJzIENvbnRhaW5lciBDb250ZXh0IE1lbnVcbmZvciAoY29uc3QgbWVudUlkIG9mIFtNZW51SWQuRW1wdHlFZGl0b3JHcm91cENvbnRleHQsIE1lbnVJZC5FZGl0b3JUYWJzQmFyQ29udGV4dF0pIHtcblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKG1lbnVJZCwgeyBjb21tYW5kOiB7IGlkOiBORVdfVU5USVRMRURfRklMRV9DT01NQU5EX0lELCB0aXRsZTogbmxzLmxvY2FsaXplKCduZXdGaWxlJywgXCJOZXcgVGV4dCBGaWxlXCIpIH0sIGdyb3VwOiAnMV9maWxlJywgb3JkZXI6IDEwIH0pO1xuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0obWVudUlkLCB7IGNvbW1hbmQ6IHsgaWQ6ICd3b3JrYmVuY2guYWN0aW9uLnF1aWNrT3BlbicsIHRpdGxlOiBubHMubG9jYWxpemUoJ29wZW5GaWxlJywgXCJPcGVuIEZpbGUuLi5cIikgfSwgZ3JvdXA6ICcxX2ZpbGUnLCBvcmRlcjogMjAgfSk7XG59XG5cbi8vIEZpbGUgbWVudVxuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJGaWxlTWVudSwge1xuXHRncm91cDogJzFfbmV3Jyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBORVdfVU5USVRMRURfRklMRV9DT01NQU5EX0lELFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaU5ld0ZpbGUnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZOZXcgVGV4dCBGaWxlXCIpXG5cdH0sXG5cdG9yZGVyOiAxXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyRmlsZU1lbnUsIHtcblx0Z3JvdXA6ICc0X3NhdmUnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IFNBVkVfRklMRV9DT01NQU5EX0lELFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaVNhdmUnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZTYXZlXCIpLFxuXHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIub3IoQWN0aXZlRWRpdG9yQ29udGV4dCwgQ29udGV4dEtleUV4cHIuYW5kKEZvbGRlcnNWaWV3VmlzaWJsZUNvbnRleHQsIFNpZGViYXJGb2N1c0NvbnRleHQpKVxuXHR9LFxuXHRvcmRlcjogMVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckZpbGVNZW51LCB7XG5cdGdyb3VwOiAnNF9zYXZlJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBTQVZFX0ZJTEVfQVNfQ09NTUFORF9JRCxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlTYXZlQXMnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiU2F2ZSAmJkFzLi4uXCIpLFxuXHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIub3IoQWN0aXZlRWRpdG9yQ29udGV4dCwgQ29udGV4dEtleUV4cHIuYW5kKEZvbGRlcnNWaWV3VmlzaWJsZUNvbnRleHQsIFNpZGViYXJGb2N1c0NvbnRleHQpKVxuXHR9LFxuXHRvcmRlcjogMlxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckZpbGVNZW51LCB7XG5cdGdyb3VwOiAnNF9zYXZlJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBTQVZFX0FMTF9DT01NQU5EX0lELFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaVNhdmVBbGwnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiU2F2ZSBBJiZsbFwiKSxcblx0XHRwcmVjb25kaXRpb246IERpcnR5V29ya2luZ0NvcGllc0NvbnRleHRcblx0fSxcblx0b3JkZXI6IDNcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJGaWxlTWVudSwge1xuXHRncm91cDogJzVfYXV0b3NhdmUnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IFRvZ2dsZUF1dG9TYXZlQWN0aW9uLklELFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaUF1dG9TYXZlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkEmJnV0byBTYXZlXCIpLFxuXHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLm5vdEVxdWFscygnY29uZmlnLmZpbGVzLmF1dG9TYXZlJywgJ29mZicpXG5cdH0sXG5cdG9yZGVyOiAxXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyRmlsZU1lbnUsIHtcblx0Z3JvdXA6ICc2X2Nsb3NlJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBSRVZFUlRfRklMRV9DT01NQU5EX0lELFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaVJldmVydCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJSZSYmdmVydCBGaWxlXCIpLFxuXHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIub3IoXG5cdFx0XHQvLyBBY3RpdmUgZWRpdG9yIGNhbiByZXZlcnRcblx0XHRcdENvbnRleHRLZXlFeHByLmFuZChBY3RpdmVFZGl0b3JDYW5SZXZlcnRDb250ZXh0KSxcblx0XHRcdC8vIEV4cGxvcmVyIGZvY3VzZWQgYnV0IG5vdCBvbiB1bnRpdGxlZFxuXHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUubm90RXF1YWxzVG8oU2NoZW1hcy51bnRpdGxlZCksIEZvbGRlcnNWaWV3VmlzaWJsZUNvbnRleHQsIFNpZGViYXJGb2N1c0NvbnRleHQpXG5cdFx0KSxcblx0fSxcblx0b3JkZXI6IDFcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJGaWxlTWVudSwge1xuXHRncm91cDogJzZfY2xvc2UnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IENMT1NFX0VESVRPUl9DT01NQU5EX0lELFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaUNsb3NlRWRpdG9yJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmQ2xvc2UgRWRpdG9yXCIpLFxuXHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIub3IoQWN0aXZlRWRpdG9yQ29udGV4dCwgQ29udGV4dEtleUV4cHIuYW5kKEZvbGRlcnNWaWV3VmlzaWJsZUNvbnRleHQsIFNpZGViYXJGb2N1c0NvbnRleHQpKVxuXHR9LFxuXHRvcmRlcjogMlxufSk7XG5cbi8vIEdvIHRvIG1lbnVcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyR29NZW51LCB7XG5cdGdyb3VwOiAnM19nbG9iYWxfbmF2Jyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5xdWlja09wZW4nLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaUdvdG9GaWxlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkdvIHRvICYmRmlsZS4uLlwiKVxuXHR9LFxuXHRvcmRlcjogMVxufSk7XG5cblxuLy8gQ2hhdCB1c2VkIGF0dGFjaG1lbnQgYW5jaG9yIGNvbnRleHQgbWVudVxuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNoYXRBdHRhY2htZW50c0NvbnRleHQsIHtcblx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0b3JkZXI6IDEwLFxuXHRjb21tYW5kOiBvcGVuVG9TaWRlQ29tbWFuZCxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFJlc291cmNlQ29udGV4dEtleS5Jc0ZpbGVTeXN0ZW1SZXNvdXJjZSwgRXhwbG9yZXJGb2xkZXJDb250ZXh0LnRvTmVnYXRlZCgpKVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ2hhdEF0dGFjaG1lbnRzQ29udGV4dCwge1xuXHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRvcmRlcjogMjAsXG5cdGNvbW1hbmQ6IHJldmVhbEluU2lkZUJhckNvbW1hbmQsXG5cdHdoZW46IFJlc291cmNlQ29udGV4dEtleS5Jc0ZpbGVTeXN0ZW1SZXNvdXJjZVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ2hhdEF0dGFjaG1lbnRzQ29udGV4dCwge1xuXHRncm91cDogJzFfY3V0Y29weXBhc3RlJyxcblx0b3JkZXI6IDEwLFxuXHRjb21tYW5kOiBjb3B5UGF0aENvbW1hbmQsXG5cdHdoZW46IFJlc291cmNlQ29udGV4dEtleS5Jc0ZpbGVTeXN0ZW1SZXNvdXJjZVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ2hhdEF0dGFjaG1lbnRzQ29udGV4dCwge1xuXHRncm91cDogJzFfY3V0Y29weXBhc3RlJyxcblx0b3JkZXI6IDIwLFxuXHRjb21tYW5kOiBjb3B5UmVsYXRpdmVQYXRoQ29tbWFuZCxcblx0d2hlbjogUmVzb3VyY2VDb250ZXh0S2V5LklzRmlsZVN5c3RlbVJlc291cmNlXG59KTtcblxuLy8gQ2hhdCByZXNvdXJjZSBhbmNob3IgYXR0YWNobWVudHMvYW5jaG9ycyBjb250ZXh0IG1lbnVcblxuZm9yIChjb25zdCBtZW51SWQgb2YgW01lbnVJZC5DaGF0SW5saW5lUmVzb3VyY2VBbmNob3JDb250ZXh0LCBNZW51SWQuQ2hhdElucHV0UmVzb3VyY2VBdHRhY2htZW50Q29udGV4dF0pIHtcblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKG1lbnVJZCwge1xuXHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0b3JkZXI6IDEwLFxuXHRcdGNvbW1hbmQ6IG9wZW5Ub1NpZGVDb21tYW5kLFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChSZXNvdXJjZUNvbnRleHRLZXkuSGFzUmVzb3VyY2UsIEV4cGxvcmVyRm9sZGVyQ29udGV4dC50b05lZ2F0ZWQoKSlcblx0fSk7XG5cblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKG1lbnVJZCwge1xuXHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0b3JkZXI6IDIwLFxuXHRcdGNvbW1hbmQ6IHJldmVhbEluU2lkZUJhckNvbW1hbmQsXG5cdFx0d2hlbjogUmVzb3VyY2VDb250ZXh0S2V5LklzRmlsZVN5c3RlbVJlc291cmNlXG5cdH0pO1xuXG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShtZW51SWQsIHtcblx0XHRncm91cDogJzFfY3V0Y29weXBhc3RlJyxcblx0XHRvcmRlcjogMTAsXG5cdFx0Y29tbWFuZDogY29weVBhdGhDb21tYW5kLFxuXHRcdHdoZW46IFJlc291cmNlQ29udGV4dEtleS5Jc0ZpbGVTeXN0ZW1SZXNvdXJjZVxuXHR9KTtcblxuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0obWVudUlkLCB7XG5cdFx0Z3JvdXA6ICcxX2N1dGNvcHlwYXN0ZScsXG5cdFx0b3JkZXI6IDIwLFxuXHRcdGNvbW1hbmQ6IGNvcHlSZWxhdGl2ZVBhdGhDb21tYW5kLFxuXHRcdHdoZW46IFJlc291cmNlQ29udGV4dEtleS5Jc0ZpbGVTeXN0ZW1SZXNvdXJjZVxuXHR9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLHNCQUFzQixvQkFBb0IsOEJBQThCLDBCQUEwQiw0QkFBNEIscUJBQXFCLGdCQUFnQix1QkFBdUIsa0JBQWtCLHNCQUFzQiwwQkFBMEIsaUJBQWlCLGtCQUFrQixtQkFBbUIsZUFBZSx3QkFBd0IsaUJBQWlCLGtCQUFrQixtQkFBbUIsZ0JBQWdCLHFCQUFxQiw4QkFBOEIsZ0JBQWdCLGdDQUFnQyxtQkFBbUIsY0FBYyxtQ0FBbUMsa0NBQWtDLG1DQUFtQyxxQ0FBcUMsMENBQTBDO0FBQ251QixTQUFTLDJCQUEyQiwyQkFBMkIsbUNBQW1DO0FBQ2xHLFNBQVMsUUFBUSxjQUFjLHVCQUF1QjtBQUV0RCxTQUFTLFFBQVEsZUFBZTtBQUNoQyxTQUFTLG1CQUFtQix3QkFBd0I7QUFDcEQsU0FBUyxzQkFBc0IsK0JBQStCLHlCQUF5Qix3QkFBd0Isc0JBQXNCLGlCQUFpQix5QkFBeUIsb0JBQW9CLDhCQUE4Qix5QkFBeUIsK0JBQStCLDZCQUE2QiwrQkFBK0IsbUNBQW1DLCtCQUErQiw2QkFBNkIsK0JBQStCLDBCQUEwQix1QkFBdUIsK0JBQStCLHlDQUF5QyxvQ0FBb0Msa0NBQWtDLCtCQUErQiw4QkFBOEIseUJBQXlCLHFCQUFxQixnREFBZ0Q7QUFDN3lCLFNBQVMsd0JBQXlDO0FBQ2xELFNBQVMsc0JBQTRDO0FBQ3JELFNBQVMscUJBQXFCLHdCQUF3QjtBQUN0RCxTQUFTLDZCQUE2QixxQkFBcUIsdUJBQXVCLGlDQUFpQyxxQkFBcUIsaUNBQWlDLDJDQUEyQyxpQ0FBaUM7QUFDclAsU0FBUyw0QkFBNEIsNkJBQTZCO0FBQ2xFLFNBQVMsZ0NBQWdDLG1DQUFtQyx5QkFBeUIseUNBQXlDLDhCQUE4QjtBQUM1SyxT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
