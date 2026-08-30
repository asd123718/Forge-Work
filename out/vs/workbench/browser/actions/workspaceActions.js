import { localize, localize2 } from "../../../nls.js";
import { IWorkspaceContextService, WorkbenchState, hasWorkspaceFileExtension } from "../../../platform/workspace/common/workspace.js";
import { IWorkspaceEditingService } from "../../services/workspaces/common/workspaceEditing.js";
import { IEditorService } from "../../services/editor/common/editorService.js";
import { ICommandService } from "../../../platform/commands/common/commands.js";
import { ADD_ROOT_FOLDER_COMMAND_ID, ADD_ROOT_FOLDER_LABEL, PICK_WORKSPACE_FOLDER_COMMAND_ID, SET_ROOT_FOLDER_COMMAND_ID } from "./workspaceCommands.js";
import { IFileDialogService } from "../../../platform/dialogs/common/dialogs.js";
import { MenuRegistry, MenuId, Action2, registerAction2 } from "../../../platform/actions/common/actions.js";
import { EmptyWorkspaceSupportContext, EnterMultiRootWorkspaceSupportContext, IsSessionsWindowContext, OpenFolderWorkspaceSupportContext, WorkbenchStateContext, WorkspaceFolderCountContext } from "../../common/contextkeys.js";
import { IHostService } from "../../services/host/browser/host.js";
import { KeyChord, KeyCode, KeyMod } from "../../../base/common/keyCodes.js";
import { ContextKeyExpr } from "../../../platform/contextkey/common/contextkey.js";
import { IWorkbenchEnvironmentService } from "../../services/environment/common/environmentService.js";
import { IWorkspacesService } from "../../../platform/workspaces/common/workspaces.js";
import { KeybindingWeight } from "../../../platform/keybinding/common/keybindingsRegistry.js";
import { IsMacNativeContext } from "../../../platform/contextkey/common/contextkeys.js";
import { Categories } from "../../../platform/action/common/actionCommonCategories.js";
const workspacesCategory = localize2("workspaces", "Workspaces");
const _OpenFileAction = class _OpenFileAction extends Action2 {
  constructor() {
    super({
      id: _OpenFileAction.ID,
      title: localize2("openFile", "Open File..."),
      category: Categories.File,
      f1: true,
      keybinding: {
        when: IsMacNativeContext.toNegated(),
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.KeyO
      }
    });
  }
  async run(accessor, data) {
    const fileDialogService = accessor.get(IFileDialogService);
    return fileDialogService.pickFileAndOpen({ forceNewWindow: false, telemetryExtraData: data });
  }
};
_OpenFileAction.ID = "workbench.action.files.openFile";
let OpenFileAction = _OpenFileAction;
const _OpenFolderAction = class _OpenFolderAction extends Action2 {
  constructor() {
    super({
      id: _OpenFolderAction.ID,
      title: localize2("openFolder", "Open Folder..."),
      category: Categories.File,
      f1: true,
      precondition: OpenFolderWorkspaceSupportContext,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: void 0,
        linux: {
          primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyO)
        },
        win: {
          primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyO)
        }
      }
    });
  }
  async run(accessor, data) {
    const fileDialogService = accessor.get(IFileDialogService);
    return fileDialogService.pickFolderAndOpen({ forceNewWindow: false, telemetryExtraData: data });
  }
};
_OpenFolderAction.ID = "workbench.action.files.openFolder";
let OpenFolderAction = _OpenFolderAction;
const _OpenFolderViaWorkspaceAction = class _OpenFolderViaWorkspaceAction extends Action2 {
  constructor() {
    super({
      id: _OpenFolderViaWorkspaceAction.ID,
      title: localize2("openFolder", "Open Folder..."),
      category: Categories.File,
      f1: true,
      precondition: ContextKeyExpr.and(OpenFolderWorkspaceSupportContext.toNegated(), WorkbenchStateContext.isEqualTo("workspace")),
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.KeyO
      }
    });
  }
  run(accessor) {
    const commandService = accessor.get(ICommandService);
    return commandService.executeCommand(SET_ROOT_FOLDER_COMMAND_ID);
  }
};
// This action swaps the folders of a workspace with
// the selected folder and is a workaround for providing
// "Open Folder..." in environments that do not support
// this without having a workspace open (e.g. web serverless)
_OpenFolderViaWorkspaceAction.ID = "workbench.action.files.openFolderViaWorkspace";
let OpenFolderViaWorkspaceAction = _OpenFolderViaWorkspaceAction;
const _OpenFileFolderAction = class _OpenFileFolderAction extends Action2 {
  constructor() {
    super({
      id: _OpenFileFolderAction.ID,
      title: _OpenFileFolderAction.LABEL,
      category: Categories.File,
      f1: true,
      precondition: ContextKeyExpr.and(IsMacNativeContext, OpenFolderWorkspaceSupportContext),
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.KeyO
      }
    });
  }
  async run(accessor, data) {
    const fileDialogService = accessor.get(IFileDialogService);
    return fileDialogService.pickFileFolderAndOpen({ forceNewWindow: false, telemetryExtraData: data });
  }
};
_OpenFileFolderAction.ID = "workbench.action.files.openFileFolder";
_OpenFileFolderAction.LABEL = localize2("openFileFolder", "Open...");
let OpenFileFolderAction = _OpenFileFolderAction;
const _OpenWorkspaceAction = class _OpenWorkspaceAction extends Action2 {
  constructor() {
    super({
      id: _OpenWorkspaceAction.ID,
      title: localize2("openWorkspaceAction", "Open Workspace from File..."),
      category: Categories.File,
      f1: true,
      precondition: EnterMultiRootWorkspaceSupportContext
    });
  }
  async run(accessor, data) {
    const fileDialogService = accessor.get(IFileDialogService);
    return fileDialogService.pickWorkspaceAndOpen({ telemetryExtraData: data });
  }
};
_OpenWorkspaceAction.ID = "workbench.action.openWorkspace";
let OpenWorkspaceAction = _OpenWorkspaceAction;
const _CloseWorkspaceAction = class _CloseWorkspaceAction extends Action2 {
  constructor() {
    super({
      id: _CloseWorkspaceAction.ID,
      title: localize2("closeWorkspace", "Close Workspace"),
      category: workspacesCategory,
      f1: true,
      precondition: ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo("empty"), EmptyWorkspaceSupportContext, IsSessionsWindowContext.negate()),
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyF)
      }
    });
  }
  async run(accessor) {
    const hostService = accessor.get(IHostService);
    const environmentService = accessor.get(IWorkbenchEnvironmentService);
    return hostService.openWindow({ forceReuseWindow: true, remoteAuthority: environmentService.remoteAuthority });
  }
};
_CloseWorkspaceAction.ID = "workbench.action.closeFolder";
let CloseWorkspaceAction = _CloseWorkspaceAction;
const _OpenWorkspaceConfigFileAction = class _OpenWorkspaceConfigFileAction extends Action2 {
  constructor() {
    super({
      id: _OpenWorkspaceConfigFileAction.ID,
      title: localize2("openWorkspaceConfigFile", "Open Workspace Configuration File"),
      category: workspacesCategory,
      f1: true,
      precondition: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo("workspace"), IsSessionsWindowContext.negate())
    });
  }
  async run(accessor) {
    const contextService = accessor.get(IWorkspaceContextService);
    const editorService = accessor.get(IEditorService);
    const configuration = contextService.getWorkspace().configuration;
    if (configuration) {
      await editorService.openEditor({ resource: configuration, options: { pinned: true } });
    }
  }
};
_OpenWorkspaceConfigFileAction.ID = "workbench.action.openWorkspaceConfigFile";
let OpenWorkspaceConfigFileAction = _OpenWorkspaceConfigFileAction;
const _AddRootFolderAction = class _AddRootFolderAction extends Action2 {
  constructor() {
    super({
      id: _AddRootFolderAction.ID,
      title: ADD_ROOT_FOLDER_LABEL,
      category: workspacesCategory,
      f1: true,
      precondition: ContextKeyExpr.and(ContextKeyExpr.or(EnterMultiRootWorkspaceSupportContext, WorkbenchStateContext.isEqualTo("workspace")), IsSessionsWindowContext.negate())
    });
  }
  run(accessor) {
    const commandService = accessor.get(ICommandService);
    return commandService.executeCommand(ADD_ROOT_FOLDER_COMMAND_ID);
  }
};
_AddRootFolderAction.ID = "workbench.action.addRootFolder";
let AddRootFolderAction = _AddRootFolderAction;
const _RemoveRootFolderAction = class _RemoveRootFolderAction extends Action2 {
  constructor() {
    super({
      id: _RemoveRootFolderAction.ID,
      title: localize2("globalRemoveFolderFromWorkspace", "Remove Folder from Workspace..."),
      category: workspacesCategory,
      f1: true,
      precondition: ContextKeyExpr.and(WorkspaceFolderCountContext.notEqualsTo("0"), ContextKeyExpr.or(EnterMultiRootWorkspaceSupportContext, WorkbenchStateContext.isEqualTo("workspace")), IsSessionsWindowContext.negate())
    });
  }
  async run(accessor) {
    const commandService = accessor.get(ICommandService);
    const workspaceEditingService = accessor.get(IWorkspaceEditingService);
    const folder = await commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID);
    if (folder) {
      await workspaceEditingService.removeFolders([folder.uri]);
    }
  }
};
_RemoveRootFolderAction.ID = "workbench.action.removeRootFolder";
let RemoveRootFolderAction = _RemoveRootFolderAction;
const _SaveWorkspaceAsAction = class _SaveWorkspaceAsAction extends Action2 {
  constructor() {
    super({
      id: _SaveWorkspaceAsAction.ID,
      title: localize2("saveWorkspaceAsAction", "Save Workspace As..."),
      category: workspacesCategory,
      f1: true,
      precondition: ContextKeyExpr.and(EnterMultiRootWorkspaceSupportContext, IsSessionsWindowContext.negate())
    });
  }
  async run(accessor) {
    const workspaceEditingService = accessor.get(IWorkspaceEditingService);
    const contextService = accessor.get(IWorkspaceContextService);
    const configPathUri = await workspaceEditingService.pickNewWorkspacePath();
    if (configPathUri && hasWorkspaceFileExtension(configPathUri)) {
      switch (contextService.getWorkbenchState()) {
        case WorkbenchState.EMPTY:
        case WorkbenchState.FOLDER: {
          const folders = contextService.getWorkspace().folders.map((folder) => ({ uri: folder.uri }));
          return workspaceEditingService.createAndEnterWorkspace(folders, configPathUri);
        }
        case WorkbenchState.WORKSPACE:
          return workspaceEditingService.saveAndEnterWorkspace(configPathUri);
      }
    }
  }
};
_SaveWorkspaceAsAction.ID = "workbench.action.saveWorkspaceAs";
let SaveWorkspaceAsAction = _SaveWorkspaceAsAction;
const _DuplicateWorkspaceInNewWindowAction = class _DuplicateWorkspaceInNewWindowAction extends Action2 {
  constructor() {
    super({
      id: _DuplicateWorkspaceInNewWindowAction.ID,
      title: localize2("duplicateWorkspaceInNewWindow", "Duplicate As Workspace in New Window"),
      category: workspacesCategory,
      f1: true,
      precondition: ContextKeyExpr.and(EnterMultiRootWorkspaceSupportContext, IsSessionsWindowContext.negate())
    });
  }
  async run(accessor) {
    const workspaceContextService = accessor.get(IWorkspaceContextService);
    const workspaceEditingService = accessor.get(IWorkspaceEditingService);
    const hostService = accessor.get(IHostService);
    const workspacesService = accessor.get(IWorkspacesService);
    const environmentService = accessor.get(IWorkbenchEnvironmentService);
    const folders = workspaceContextService.getWorkspace().folders;
    const remoteAuthority = environmentService.remoteAuthority;
    const newWorkspace = await workspacesService.createUntitledWorkspace(folders, remoteAuthority);
    await workspaceEditingService.copyWorkspaceSettings(newWorkspace);
    return hostService.openWindow([{ workspaceUri: newWorkspace.configPath }], { forceNewWindow: true, remoteAuthority });
  }
};
_DuplicateWorkspaceInNewWindowAction.ID = "workbench.action.duplicateWorkspaceInNewWindow";
let DuplicateWorkspaceInNewWindowAction = _DuplicateWorkspaceInNewWindowAction;
registerAction2(AddRootFolderAction);
registerAction2(RemoveRootFolderAction);
registerAction2(OpenFileAction);
registerAction2(OpenFolderAction);
registerAction2(OpenFolderViaWorkspaceAction);
registerAction2(OpenFileFolderAction);
registerAction2(OpenWorkspaceAction);
registerAction2(OpenWorkspaceConfigFileAction);
registerAction2(CloseWorkspaceAction);
registerAction2(SaveWorkspaceAsAction);
registerAction2(DuplicateWorkspaceInNewWindowAction);
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "2_open",
  command: {
    id: OpenFileAction.ID,
    title: localize({ key: "miOpenFile", comment: ["&& denotes a mnemonic"] }, "&&Open File...")
  },
  order: 1,
  when: IsMacNativeContext.toNegated()
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "2_open",
  command: {
    id: OpenFolderAction.ID,
    title: localize({ key: "miOpenFolder", comment: ["&& denotes a mnemonic"] }, "Open &&Folder...")
  },
  order: 2,
  when: OpenFolderWorkspaceSupportContext
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "2_open",
  command: {
    id: OpenFolderViaWorkspaceAction.ID,
    title: localize({ key: "miOpenFolder", comment: ["&& denotes a mnemonic"] }, "Open &&Folder...")
  },
  order: 2,
  when: ContextKeyExpr.and(OpenFolderWorkspaceSupportContext.toNegated(), WorkbenchStateContext.isEqualTo("workspace"))
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "2_open",
  command: {
    id: OpenFileFolderAction.ID,
    title: localize({ key: "miOpen", comment: ["&& denotes a mnemonic"] }, "&&Open...")
  },
  order: 1,
  when: ContextKeyExpr.and(IsMacNativeContext, OpenFolderWorkspaceSupportContext)
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "2_open",
  command: {
    id: OpenWorkspaceAction.ID,
    title: localize({ key: "miOpenWorkspace", comment: ["&& denotes a mnemonic"] }, "Open Wor&&kspace from File...")
  },
  order: 3,
  when: EnterMultiRootWorkspaceSupportContext
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "3_workspace",
  command: {
    id: ADD_ROOT_FOLDER_COMMAND_ID,
    title: localize({ key: "miAddFolderToWorkspace", comment: ["&& denotes a mnemonic"] }, "A&&dd Folder to Workspace...")
  },
  when: ContextKeyExpr.and(ContextKeyExpr.or(EnterMultiRootWorkspaceSupportContext, WorkbenchStateContext.isEqualTo("workspace")), IsSessionsWindowContext.negate()),
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "3_workspace",
  command: {
    id: SaveWorkspaceAsAction.ID,
    title: localize("miSaveWorkspaceAs", "Save Workspace As...")
  },
  order: 2,
  when: ContextKeyExpr.and(EnterMultiRootWorkspaceSupportContext, IsSessionsWindowContext.negate())
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "3_workspace",
  command: {
    id: DuplicateWorkspaceInNewWindowAction.ID,
    title: localize("duplicateWorkspace", "Duplicate Workspace")
  },
  order: 3,
  when: ContextKeyExpr.and(EnterMultiRootWorkspaceSupportContext, IsSessionsWindowContext.negate())
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "6_close",
  command: {
    id: CloseWorkspaceAction.ID,
    title: localize({ key: "miCloseFolder", comment: ["&& denotes a mnemonic"] }, "Close &&Folder")
  },
  order: 3,
  when: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo("folder"), EmptyWorkspaceSupportContext, IsSessionsWindowContext.negate())
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "6_close",
  command: {
    id: CloseWorkspaceAction.ID,
    title: localize({ key: "miCloseWorkspace", comment: ["&& denotes a mnemonic"] }, "Close &&Workspace")
  },
  order: 3,
  when: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo("workspace"), EmptyWorkspaceSupportContext, IsSessionsWindowContext.negate())
});
export {
  AddRootFolderAction,
  OpenFileAction,
  OpenFileFolderAction,
  OpenFolderAction,
  OpenFolderViaWorkspaceAction,
  RemoveRootFolderAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXGFjdGlvbnNcXHdvcmtzcGFjZUFjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlEYXRhIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXb3JrYmVuY2hTdGF0ZSwgSVdvcmtzcGFjZUZvbGRlciwgaGFzV29ya3NwYWNlRmlsZUV4dGVuc2lvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3dvcmtzcGFjZXMvY29tbW9uL3dvcmtzcGFjZUVkaXRpbmcuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEFERF9ST09UX0ZPTERFUl9DT01NQU5EX0lELCBBRERfUk9PVF9GT0xERVJfTEFCRUwsIFBJQ0tfV09SS1NQQUNFX0ZPTERFUl9DT01NQU5EX0lELCBTRVRfUk9PVF9GT0xERVJfQ09NTUFORF9JRCB9IGZyb20gJy4vd29ya3NwYWNlQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUZpbGVEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBNZW51UmVnaXN0cnksIE1lbnVJZCwgQWN0aW9uMiwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFbXB0eVdvcmtzcGFjZVN1cHBvcnRDb250ZXh0LCBFbnRlck11bHRpUm9vdFdvcmtzcGFjZVN1cHBvcnRDb250ZXh0LCBJc1Nlc3Npb25zV2luZG93Q29udGV4dCwgT3BlbkZvbGRlcldvcmtzcGFjZVN1cHBvcnRDb250ZXh0LCBXb3JrYmVuY2hTdGF0ZUNvbnRleHQsIFdvcmtzcGFjZUZvbGRlckNvdW50Q29udGV4dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBLZXlDaG9yZCwgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZXMvY29tbW9uL3dvcmtzcGFjZXMuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSXNNYWNOYXRpdmVDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSUxvY2FsaXplZFN0cmluZyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuXG5jb25zdCB3b3Jrc3BhY2VzQ2F0ZWdvcnk6IElMb2NhbGl6ZWRTdHJpbmcgPSBsb2NhbGl6ZTIoJ3dvcmtzcGFjZXMnLCAnV29ya3NwYWNlcycpO1xuXG5leHBvcnQgY2xhc3MgT3BlbkZpbGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5maWxlcy5vcGVuRmlsZSc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5GaWxlQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3BlbkZpbGUnLCAnT3BlbiBGaWxlLi4uJyksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5GaWxlLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IElzTWFjTmF0aXZlQ29udGV4dC50b05lZ2F0ZWQoKSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlPXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGRhdGE/OiBJVGVsZW1ldHJ5RGF0YSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZpbGVEaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlRGlhbG9nU2VydmljZSk7XG5cblx0XHRyZXR1cm4gZmlsZURpYWxvZ1NlcnZpY2UucGlja0ZpbGVBbmRPcGVuKHsgZm9yY2VOZXdXaW5kb3c6IGZhbHNlLCB0ZWxlbWV0cnlFeHRyYURhdGE6IGRhdGEgfSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE9wZW5Gb2xkZXJBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5maWxlcy5vcGVuRm9sZGVyJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogT3BlbkZvbGRlckFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ29wZW5Gb2xkZXInLCAnT3BlbiBGb2xkZXIuLi4nKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkZpbGUsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogT3BlbkZvbGRlcldvcmtzcGFjZVN1cHBvcnRDb250ZXh0LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogdW5kZWZpbmVkLFxuXHRcdFx0XHRsaW51eDoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Tylcblx0XHRcdFx0fSxcblx0XHRcdFx0d2luOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlPKVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGRhdGE/OiBJVGVsZW1ldHJ5RGF0YSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZpbGVEaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlRGlhbG9nU2VydmljZSk7XG5cblx0XHRyZXR1cm4gZmlsZURpYWxvZ1NlcnZpY2UucGlja0ZvbGRlckFuZE9wZW4oeyBmb3JjZU5ld1dpbmRvdzogZmFsc2UsIHRlbGVtZXRyeUV4dHJhRGF0YTogZGF0YSB9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgT3BlbkZvbGRlclZpYVdvcmtzcGFjZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdC8vIFRoaXMgYWN0aW9uIHN3YXBzIHRoZSBmb2xkZXJzIG9mIGEgd29ya3NwYWNlIHdpdGhcblx0Ly8gdGhlIHNlbGVjdGVkIGZvbGRlciBhbmQgaXMgYSB3b3JrYXJvdW5kIGZvciBwcm92aWRpbmdcblx0Ly8gXCJPcGVuIEZvbGRlci4uLlwiIGluIGVudmlyb25tZW50cyB0aGF0IGRvIG5vdCBzdXBwb3J0XG5cdC8vIHRoaXMgd2l0aG91dCBoYXZpbmcgYSB3b3Jrc3BhY2Ugb3BlbiAoZS5nLiB3ZWIgc2VydmVybGVzcylcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5maWxlcy5vcGVuRm9sZGVyVmlhV29ya3NwYWNlJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogT3BlbkZvbGRlclZpYVdvcmtzcGFjZUFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ29wZW5Gb2xkZXInLCAnT3BlbiBGb2xkZXIuLi4nKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkZpbGUsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKE9wZW5Gb2xkZXJXb3Jrc3BhY2VTdXBwb3J0Q29udGV4dC50b05lZ2F0ZWQoKSwgV29ya2JlbmNoU3RhdGVDb250ZXh0LmlzRXF1YWxUbygnd29ya3NwYWNlJykpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleU9cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cblx0XHRyZXR1cm4gY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoU0VUX1JPT1RfRk9MREVSX0NPTU1BTkRfSUQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuRmlsZUZvbGRlckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmZpbGVzLm9wZW5GaWxlRm9sZGVyJztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMOiBJTG9jYWxpemVkU3RyaW5nID0gbG9jYWxpemUyKCdvcGVuRmlsZUZvbGRlcicsICdPcGVuLi4uJyk7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5GaWxlRm9sZGVyQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IE9wZW5GaWxlRm9sZGVyQWN0aW9uLkxBQkVMLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRmlsZSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoSXNNYWNOYXRpdmVDb250ZXh0LCBPcGVuRm9sZGVyV29ya3NwYWNlU3VwcG9ydENvbnRleHQpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleU9cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZGF0YT86IElUZWxlbWV0cnlEYXRhKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZmlsZURpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVEaWFsb2dTZXJ2aWNlKTtcblxuXHRcdHJldHVybiBmaWxlRGlhbG9nU2VydmljZS5waWNrRmlsZUZvbGRlckFuZE9wZW4oeyBmb3JjZU5ld1dpbmRvdzogZmFsc2UsIHRlbGVtZXRyeUV4dHJhRGF0YTogZGF0YSB9KTtcblx0fVxufVxuXG5jbGFzcyBPcGVuV29ya3NwYWNlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbldvcmtzcGFjZSc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5Xb3Jrc3BhY2VBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdvcGVuV29ya3NwYWNlQWN0aW9uJywgJ09wZW4gV29ya3NwYWNlIGZyb20gRmlsZS4uLicpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRmlsZSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFbnRlck11bHRpUm9vdFdvcmtzcGFjZVN1cHBvcnRDb250ZXh0XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGRhdGE/OiBJVGVsZW1ldHJ5RGF0YSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZpbGVEaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlRGlhbG9nU2VydmljZSk7XG5cblx0XHRyZXR1cm4gZmlsZURpYWxvZ1NlcnZpY2UucGlja1dvcmtzcGFjZUFuZE9wZW4oeyB0ZWxlbWV0cnlFeHRyYURhdGE6IGRhdGEgfSk7XG5cdH1cbn1cblxuY2xhc3MgQ2xvc2VXb3Jrc3BhY2VBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jbG9zZUZvbGRlcic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENsb3NlV29ya3NwYWNlQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2xvc2VXb3Jrc3BhY2UnLCAnQ2xvc2UgV29ya3NwYWNlJyksXG5cdFx0XHRjYXRlZ29yeTogd29ya3NwYWNlc0NhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChXb3JrYmVuY2hTdGF0ZUNvbnRleHQubm90RXF1YWxzVG8oJ2VtcHR5JyksIEVtcHR5V29ya3NwYWNlU3VwcG9ydENvbnRleHQsIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlDb2RlLktleUYpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBob3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJSG9zdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlKTtcblxuXHRcdHJldHVybiBob3N0U2VydmljZS5vcGVuV2luZG93KHsgZm9yY2VSZXVzZVdpbmRvdzogdHJ1ZSwgcmVtb3RlQXV0aG9yaXR5OiBlbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5IH0pO1xuXHR9XG59XG5cbmNsYXNzIE9wZW5Xb3Jrc3BhY2VDb25maWdGaWxlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbldvcmtzcGFjZUNvbmZpZ0ZpbGUnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBPcGVuV29ya3NwYWNlQ29uZmlnRmlsZUFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ29wZW5Xb3Jrc3BhY2VDb25maWdGaWxlJywgJ09wZW4gV29ya3NwYWNlIENvbmZpZ3VyYXRpb24gRmlsZScpLFxuXHRcdFx0Y2F0ZWdvcnk6IHdvcmtzcGFjZXNDYXRlZ29yeSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoV29ya2JlbmNoU3RhdGVDb250ZXh0LmlzRXF1YWxUbygnd29ya3NwYWNlJyksIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29udGV4dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSBjb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5jb25maWd1cmF0aW9uO1xuXHRcdGlmIChjb25maWd1cmF0aW9uKSB7XG5cdFx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogY29uZmlndXJhdGlvbiwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9KTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEFkZFJvb3RGb2xkZXJBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5hZGRSb290Rm9sZGVyJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQWRkUm9vdEZvbGRlckFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBBRERfUk9PVF9GT0xERVJfTEFCRUwsXG5cdFx0XHRjYXRlZ29yeTogd29ya3NwYWNlc0NhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5vcihFbnRlck11bHRpUm9vdFdvcmtzcGFjZVN1cHBvcnRDb250ZXh0LCBXb3JrYmVuY2hTdGF0ZUNvbnRleHQuaXNFcXVhbFRvKCd3b3Jrc3BhY2UnKSksIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdHJldHVybiBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChBRERfUk9PVF9GT0xERVJfQ09NTUFORF9JRCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlbW92ZVJvb3RGb2xkZXJBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5yZW1vdmVSb290Rm9sZGVyJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogUmVtb3ZlUm9vdEZvbGRlckFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2dsb2JhbFJlbW92ZUZvbGRlckZyb21Xb3Jrc3BhY2UnLCAnUmVtb3ZlIEZvbGRlciBmcm9tIFdvcmtzcGFjZS4uLicpLFxuXHRcdFx0Y2F0ZWdvcnk6IHdvcmtzcGFjZXNDYXRlZ29yeSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoV29ya3NwYWNlRm9sZGVyQ291bnRDb250ZXh0Lm5vdEVxdWFsc1RvKCcwJyksIENvbnRleHRLZXlFeHByLm9yKEVudGVyTXVsdGlSb290V29ya3NwYWNlU3VwcG9ydENvbnRleHQsIFdvcmtiZW5jaFN0YXRlQ29udGV4dC5pc0VxdWFsVG8oJ3dvcmtzcGFjZScpKSwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCkpXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSk7XG5cblx0XHRjb25zdCBmb2xkZXIgPSBhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxJV29ya3NwYWNlRm9sZGVyPihQSUNLX1dPUktTUEFDRV9GT0xERVJfQ09NTUFORF9JRCk7XG5cdFx0aWYgKGZvbGRlcikge1xuXHRcdFx0YXdhaXQgd29ya3NwYWNlRWRpdGluZ1NlcnZpY2UucmVtb3ZlRm9sZGVycyhbZm9sZGVyLnVyaV0pO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBTYXZlV29ya3NwYWNlQXNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5zYXZlV29ya3NwYWNlQXMnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTYXZlV29ya3NwYWNlQXNBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzYXZlV29ya3NwYWNlQXNBY3Rpb24nLCAnU2F2ZSBXb3Jrc3BhY2UgQXMuLi4nKSxcblx0XHRcdGNhdGVnb3J5OiB3b3Jrc3BhY2VzQ2F0ZWdvcnksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKEVudGVyTXVsdGlSb290V29ya3NwYWNlU3VwcG9ydENvbnRleHQsIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlRWRpdGluZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlKTtcblx0XHRjb25zdCBjb250ZXh0U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgY29uZmlnUGF0aFVyaSA9IGF3YWl0IHdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlLnBpY2tOZXdXb3Jrc3BhY2VQYXRoKCk7XG5cdFx0aWYgKGNvbmZpZ1BhdGhVcmkgJiYgaGFzV29ya3NwYWNlRmlsZUV4dGVuc2lvbihjb25maWdQYXRoVXJpKSkge1xuXHRcdFx0c3dpdGNoIChjb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpKSB7XG5cdFx0XHRcdGNhc2UgV29ya2JlbmNoU3RhdGUuRU1QVFk6XG5cdFx0XHRcdGNhc2UgV29ya2JlbmNoU3RhdGUuRk9MREVSOiB7XG5cdFx0XHRcdFx0Y29uc3QgZm9sZGVycyA9IGNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMubWFwKGZvbGRlciA9PiAoeyB1cmk6IGZvbGRlci51cmkgfSkpO1xuXHRcdFx0XHRcdHJldHVybiB3b3Jrc3BhY2VFZGl0aW5nU2VydmljZS5jcmVhdGVBbmRFbnRlcldvcmtzcGFjZShmb2xkZXJzLCBjb25maWdQYXRoVXJpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRTpcblx0XHRcdFx0XHRyZXR1cm4gd29ya3NwYWNlRWRpdGluZ1NlcnZpY2Uuc2F2ZUFuZEVudGVyV29ya3NwYWNlKGNvbmZpZ1BhdGhVcmkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBEdXBsaWNhdGVXb3Jrc3BhY2VJbk5ld1dpbmRvd0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmR1cGxpY2F0ZVdvcmtzcGFjZUluTmV3V2luZG93JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRHVwbGljYXRlV29ya3NwYWNlSW5OZXdXaW5kb3dBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdkdXBsaWNhdGVXb3Jrc3BhY2VJbk5ld1dpbmRvdycsICdEdXBsaWNhdGUgQXMgV29ya3NwYWNlIGluIE5ldyBXaW5kb3cnKSxcblx0XHRcdGNhdGVnb3J5OiB3b3Jrc3BhY2VzQ2F0ZWdvcnksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKEVudGVyTXVsdGlSb290V29ya3NwYWNlU3VwcG9ydENvbnRleHQsIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlQ29udGV4dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VFZGl0aW5nU2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya3NwYWNlRWRpdGluZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElIb3N0U2VydmljZSk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtzcGFjZXNTZXJ2aWNlKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSk7XG5cblx0XHRjb25zdCBmb2xkZXJzID0gd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycztcblx0XHRjb25zdCByZW1vdGVBdXRob3JpdHkgPSBlbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5O1xuXG5cdFx0Y29uc3QgbmV3V29ya3NwYWNlID0gYXdhaXQgd29ya3NwYWNlc1NlcnZpY2UuY3JlYXRlVW50aXRsZWRXb3Jrc3BhY2UoZm9sZGVycywgcmVtb3RlQXV0aG9yaXR5KTtcblx0XHRhd2FpdCB3b3Jrc3BhY2VFZGl0aW5nU2VydmljZS5jb3B5V29ya3NwYWNlU2V0dGluZ3MobmV3V29ya3NwYWNlKTtcblxuXHRcdHJldHVybiBob3N0U2VydmljZS5vcGVuV2luZG93KFt7IHdvcmtzcGFjZVVyaTogbmV3V29ya3NwYWNlLmNvbmZpZ1BhdGggfV0sIHsgZm9yY2VOZXdXaW5kb3c6IHRydWUsIHJlbW90ZUF1dGhvcml0eSB9KTtcblx0fVxufVxuXG4vLyAtLS0gQWN0aW9ucyBSZWdpc3RyYXRpb25cblxucmVnaXN0ZXJBY3Rpb24yKEFkZFJvb3RGb2xkZXJBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFJlbW92ZVJvb3RGb2xkZXJBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE9wZW5GaWxlQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihPcGVuRm9sZGVyQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihPcGVuRm9sZGVyVmlhV29ya3NwYWNlQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihPcGVuRmlsZUZvbGRlckFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoT3BlbldvcmtzcGFjZUFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoT3BlbldvcmtzcGFjZUNvbmZpZ0ZpbGVBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKENsb3NlV29ya3NwYWNlQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihTYXZlV29ya3NwYWNlQXNBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKER1cGxpY2F0ZVdvcmtzcGFjZUluTmV3V2luZG93QWN0aW9uKTtcblxuLy8gLS0tIE1lbnUgUmVnaXN0cmF0aW9uXG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckZpbGVNZW51LCB7XG5cdGdyb3VwOiAnMl9vcGVuJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBPcGVuRmlsZUFjdGlvbi5JRCxcblx0XHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaU9wZW5GaWxlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmT3BlbiBGaWxlLi4uXCIpXG5cdH0sXG5cdG9yZGVyOiAxLFxuXHR3aGVuOiBJc01hY05hdGl2ZUNvbnRleHQudG9OZWdhdGVkKClcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJGaWxlTWVudSwge1xuXHRncm91cDogJzJfb3BlbicsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogT3BlbkZvbGRlckFjdGlvbi5JRCxcblx0XHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaU9wZW5Gb2xkZXInLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiT3BlbiAmJkZvbGRlci4uLlwiKVxuXHR9LFxuXHRvcmRlcjogMixcblx0d2hlbjogT3BlbkZvbGRlcldvcmtzcGFjZVN1cHBvcnRDb250ZXh0XG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyRmlsZU1lbnUsIHtcblx0Z3JvdXA6ICcyX29wZW4nLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IE9wZW5Gb2xkZXJWaWFXb3Jrc3BhY2VBY3Rpb24uSUQsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlPcGVuRm9sZGVyJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIk9wZW4gJiZGb2xkZXIuLi5cIilcblx0fSxcblx0b3JkZXI6IDIsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChPcGVuRm9sZGVyV29ya3NwYWNlU3VwcG9ydENvbnRleHQudG9OZWdhdGVkKCksIFdvcmtiZW5jaFN0YXRlQ29udGV4dC5pc0VxdWFsVG8oJ3dvcmtzcGFjZScpKVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckZpbGVNZW51LCB7XG5cdGdyb3VwOiAnMl9vcGVuJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBPcGVuRmlsZUZvbGRlckFjdGlvbi5JRCxcblx0XHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaU9wZW4nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZPcGVuLi4uXCIpXG5cdH0sXG5cdG9yZGVyOiAxLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNNYWNOYXRpdmVDb250ZXh0LCBPcGVuRm9sZGVyV29ya3NwYWNlU3VwcG9ydENvbnRleHQpXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyRmlsZU1lbnUsIHtcblx0Z3JvdXA6ICcyX29wZW4nLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IE9wZW5Xb3Jrc3BhY2VBY3Rpb24uSUQsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlPcGVuV29ya3NwYWNlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIk9wZW4gV29yJiZrc3BhY2UgZnJvbSBGaWxlLi4uXCIpXG5cdH0sXG5cdG9yZGVyOiAzLFxuXHR3aGVuOiBFbnRlck11bHRpUm9vdFdvcmtzcGFjZVN1cHBvcnRDb250ZXh0XG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyRmlsZU1lbnUsIHtcblx0Z3JvdXA6ICczX3dvcmtzcGFjZScsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogQUREX1JPT1RfRk9MREVSX0NPTU1BTkRfSUQsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlBZGRGb2xkZXJUb1dvcmtzcGFjZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJBJiZkZCBGb2xkZXIgdG8gV29ya3NwYWNlLi4uXCIpXG5cdH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5vcihFbnRlck11bHRpUm9vdFdvcmtzcGFjZVN1cHBvcnRDb250ZXh0LCBXb3JrYmVuY2hTdGF0ZUNvbnRleHQuaXNFcXVhbFRvKCd3b3Jrc3BhY2UnKSksIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKSxcblx0b3JkZXI6IDFcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJGaWxlTWVudSwge1xuXHRncm91cDogJzNfd29ya3NwYWNlJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBTYXZlV29ya3NwYWNlQXNBY3Rpb24uSUQsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdtaVNhdmVXb3Jrc3BhY2VBcycsIFwiU2F2ZSBXb3Jrc3BhY2UgQXMuLi5cIilcblx0fSxcblx0b3JkZXI6IDIsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChFbnRlck11bHRpUm9vdFdvcmtzcGFjZVN1cHBvcnRDb250ZXh0LCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSlcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJGaWxlTWVudSwge1xuXHRncm91cDogJzNfd29ya3NwYWNlJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBEdXBsaWNhdGVXb3Jrc3BhY2VJbk5ld1dpbmRvd0FjdGlvbi5JRCxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2R1cGxpY2F0ZVdvcmtzcGFjZScsIFwiRHVwbGljYXRlIFdvcmtzcGFjZVwiKVxuXHR9LFxuXHRvcmRlcjogMyxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEVudGVyTXVsdGlSb290V29ya3NwYWNlU3VwcG9ydENvbnRleHQsIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckZpbGVNZW51LCB7XG5cdGdyb3VwOiAnNl9jbG9zZScsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogQ2xvc2VXb3Jrc3BhY2VBY3Rpb24uSUQsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlDbG9zZUZvbGRlcicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJDbG9zZSAmJkZvbGRlclwiKVxuXHR9LFxuXHRvcmRlcjogMyxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFdvcmtiZW5jaFN0YXRlQ29udGV4dC5pc0VxdWFsVG8oJ2ZvbGRlcicpLCBFbXB0eVdvcmtzcGFjZVN1cHBvcnRDb250ZXh0LCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSlcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJGaWxlTWVudSwge1xuXHRncm91cDogJzZfY2xvc2UnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IENsb3NlV29ya3NwYWNlQWN0aW9uLklELFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pQ2xvc2VXb3Jrc3BhY2UnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiQ2xvc2UgJiZXb3Jrc3BhY2VcIilcblx0fSxcblx0b3JkZXI6IDMsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChXb3JrYmVuY2hTdGF0ZUNvbnRleHQuaXNFcXVhbFRvKCd3b3Jrc3BhY2UnKSwgRW1wdHlXb3Jrc3BhY2VTdXBwb3J0Q29udGV4dCwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCkpXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsVUFBVSxpQkFBaUI7QUFFcEMsU0FBUywwQkFBMEIsZ0JBQWtDLGlDQUFpQztBQUN0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
