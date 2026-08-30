import { localize, localize2 } from "../../../nls.js";
import { IDialogService } from "../../../platform/dialogs/common/dialogs.js";
import { MenuRegistry, MenuId, Action2, registerAction2 } from "../../../platform/actions/common/actions.js";
import { KeyChord, KeyCode, KeyMod } from "../../../base/common/keyCodes.js";
import { IsMainWindowFullscreenContext } from "../../common/contextkeys.js";
import { IsMacNativeContext, IsDevelopmentContext, IsWebContext, IsIOSContext } from "../../../platform/contextkey/common/contextkeys.js";
import { Categories } from "../../../platform/action/common/actionCommonCategories.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../platform/keybinding/common/keybindingsRegistry.js";
import { IQuickInputService } from "../../../platform/quickinput/common/quickInput.js";
import { IWorkspaceContextService, isWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier } from "../../../platform/workspace/common/workspace.js";
import { ILabelService, Verbosity } from "../../../platform/label/common/label.js";
import { IKeybindingService } from "../../../platform/keybinding/common/keybinding.js";
import { IModelService } from "../../../editor/common/services/model.js";
import { ILanguageService } from "../../../editor/common/languages/language.js";
import { isRecentFolder, isRecentWorkspace, IWorkspacesService } from "../../../platform/workspaces/common/workspaces.js";
import { getIconClasses } from "../../../editor/common/services/getIconClasses.js";
import { FileKind } from "../../../platform/files/common/files.js";
import { splitRecentLabel } from "../../../base/common/labels.js";
import { isMacintosh, isWeb, isWindows } from "../../../base/common/platform.js";
import { ContextKeyExpr } from "../../../platform/contextkey/common/contextkey.js";
import { inQuickPickContext, getQuickNavigateHandler } from "../quickaccess.js";
import { IHostService } from "../../services/host/browser/host.js";
import { ResourceMap } from "../../../base/common/map.js";
import { Codicon } from "../../../base/common/codicons.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { CommandsRegistry } from "../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { isFolderBackupInfo, isWorkspaceBackupInfo } from "../../../platform/backup/common/backup.js";
import { getActiveElement, getActiveWindow, isHTMLElement } from "../../../base/browser/dom.js";
import { IWorkbenchEnvironmentService } from "../../services/environment/common/environmentService.js";
import { isEqual } from "../../../base/common/resources.js";
const inRecentFilesPickerContextKey = "inRecentFilesPicker";
class BaseOpenRecentAction extends Action2 {
  constructor() {
    super(...arguments);
    this.removeFromRecentlyOpened = {
      iconClass: ThemeIcon.asClassName(Codicon.removeClose),
      tooltip: localize("remove", "Remove from Recently Opened")
    };
    this.dirtyRecentlyOpenedFolder = {
      iconClass: "dirty-workspace " + ThemeIcon.asClassName(Codicon.closeDirty),
      tooltip: localize("dirtyRecentlyOpenedFolder", "Folder With Unsaved Files"),
      alwaysVisible: true
    };
    this.dirtyRecentlyOpenedWorkspace = {
      ...this.dirtyRecentlyOpenedFolder,
      tooltip: localize("dirtyRecentlyOpenedWorkspace", "Workspace With Unsaved Files")
    };
    this.windowOpenedRecentlyOpenedFolder = {
      iconClass: "opened-workspace " + ThemeIcon.asClassName(Codicon.window),
      tooltip: localize("openedRecentlyOpenedFolder", "Folder Opened in a Window"),
      alwaysVisible: true
    };
    this.windowOpenedRecentlyOpenedWorkspace = {
      ...this.windowOpenedRecentlyOpenedFolder,
      tooltip: localize("openedRecentlyOpenedWorkspace", "Workspace Opened in a Window")
    };
    this.activeWindowOpenedRecentlyOpenedFolder = {
      iconClass: "opened-workspace " + ThemeIcon.asClassName(Codicon.windowActive),
      tooltip: localize("activeOpenedRecentlyOpenedFolder", "Folder Opened in Active Window"),
      alwaysVisible: true
    };
    this.activeWindowOpenedRecentlyOpenedWorkspace = {
      ...this.activeWindowOpenedRecentlyOpenedFolder,
      tooltip: localize("activeOpenedRecentlyOpenedWorkspace", "Workspace Opened in Active Window")
    };
  }
  async run(accessor) {
    const workspacesService = accessor.get(IWorkspacesService);
    const quickInputService = accessor.get(IQuickInputService);
    const contextService = accessor.get(IWorkspaceContextService);
    const labelService = accessor.get(ILabelService);
    const keybindingService = accessor.get(IKeybindingService);
    const modelService = accessor.get(IModelService);
    const languageService = accessor.get(ILanguageService);
    const hostService = accessor.get(IHostService);
    const dialogService = accessor.get(IDialogService);
    const environmentService = accessor.get(IWorkbenchEnvironmentService);
    const [mainWindows, recentlyOpened, dirtyWorkspacesAndFolders] = await Promise.all([
      hostService.getWindows({ includeAuxiliaryWindows: false }),
      workspacesService.getRecentlyOpened(),
      workspacesService.getDirtyWorkspaces()
    ]);
    let hasWorkspaces = false;
    const dirtyFolders = new ResourceMap();
    const dirtyWorkspaces = new ResourceMap();
    for (const dirtyWorkspace of dirtyWorkspacesAndFolders) {
      if (isFolderBackupInfo(dirtyWorkspace)) {
        dirtyFolders.set(dirtyWorkspace.folderUri, true);
      } else {
        dirtyWorkspaces.set(dirtyWorkspace.workspace.configPath, dirtyWorkspace.workspace);
        hasWorkspaces = true;
      }
    }
    const activeWindowId = getActiveWindow().vscodeWindowId;
    const openedInWindows = new ResourceMap();
    for (const window of mainWindows) {
      const isActive = window.id === activeWindowId;
      if (isSingleFolderWorkspaceIdentifier(window.workspace)) {
        openedInWindows.set(window.workspace.uri, { isActive });
      } else if (isWorkspaceIdentifier(window.workspace)) {
        openedInWindows.set(window.workspace.configPath, { isActive });
      }
    }
    const recentFolders = new ResourceMap();
    const recentWorkspaces = new ResourceMap();
    for (const recent of recentlyOpened.workspaces) {
      if (isRecentFolder(recent)) {
        recentFolders.set(recent.folderUri, true);
      } else {
        recentWorkspaces.set(recent.workspace.configPath, recent.workspace);
        hasWorkspaces = true;
      }
    }
    const workspacePicks = [];
    for (const recent of recentlyOpened.workspaces) {
      const isDirty = isRecentFolder(recent) ? dirtyFolders.has(recent.folderUri) : dirtyWorkspaces.has(recent.workspace.configPath);
      const windowState = isRecentFolder(recent) ? openedInWindows.get(recent.folderUri) : openedInWindows.get(recent.workspace.configPath);
      workspacePicks.push(this.toQuickPick(modelService, languageService, labelService, environmentService, recent, { isDirty, windowState }));
    }
    for (const dirtyWorkspaceOrFolder of dirtyWorkspacesAndFolders) {
      if (isFolderBackupInfo(dirtyWorkspaceOrFolder) && !recentFolders.has(dirtyWorkspaceOrFolder.folderUri)) {
        workspacePicks.push(this.toQuickPick(modelService, languageService, labelService, environmentService, dirtyWorkspaceOrFolder, { isDirty: true, windowState: void 0 }));
      } else if (isWorkspaceBackupInfo(dirtyWorkspaceOrFolder) && !recentWorkspaces.has(dirtyWorkspaceOrFolder.workspace.configPath)) {
        workspacePicks.push(this.toQuickPick(modelService, languageService, labelService, environmentService, dirtyWorkspaceOrFolder, { isDirty: true, windowState: void 0 }));
      }
    }
    const filePicks = recentlyOpened.files.map((p) => this.toQuickPick(modelService, languageService, labelService, environmentService, p, { isDirty: false, windowState: void 0 }));
    const firstEntry = recentlyOpened.workspaces[0];
    const autoFocusSecondEntry = firstEntry && (contextService.isCurrentWorkspace(isRecentWorkspace(firstEntry) ? firstEntry.workspace : firstEntry.folderUri) || isRecentWorkspace(firstEntry) && isEqual(firstEntry.workspace.configPath, environmentService.agentSessionsWorkspace));
    let keyMods;
    const workspaceSeparator = { type: "separator", label: hasWorkspaces ? localize("workspacesAndFolders", "folders & workspaces") : localize("folders", "folders") };
    const fileSeparator = { type: "separator", label: localize("files", "files") };
    const picks = [workspaceSeparator, ...workspacePicks, fileSeparator, ...filePicks];
    const pick = await quickInputService.pick(picks, {
      contextKey: inRecentFilesPickerContextKey,
      activeItem: [...workspacePicks, ...filePicks][autoFocusSecondEntry ? 1 : 0],
      placeHolder: isMacintosh ? localize("openRecentPlaceholderMac", "Select to open (hold Cmd-key to force new window or Option-key for same window)") : localize("openRecentPlaceholder", "Select to open (hold Ctrl-key to force new window or Alt-key for same window)"),
      matchOnDescription: true,
      sortByLabel: false,
      onKeyMods: (mods) => keyMods = mods,
      quickNavigate: this.isQuickNavigate() ? { keybindings: keybindingService.lookupKeybindings(this.desc.id) } : void 0,
      hideInput: this.isQuickNavigate(),
      onDidTriggerItemButton: async (context) => {
        if (context.button === this.removeFromRecentlyOpened || context.button === this.windowOpenedRecentlyOpenedFolder || context.button === this.windowOpenedRecentlyOpenedWorkspace) {
          await workspacesService.removeRecentlyOpened([context.item.resource]);
          context.removeItem();
        } else if (context.button === this.dirtyRecentlyOpenedFolder || context.button === this.dirtyRecentlyOpenedWorkspace) {
          const isDirtyWorkspace = context.button === this.dirtyRecentlyOpenedWorkspace;
          const { confirmed } = await dialogService.confirm({
            title: isDirtyWorkspace ? localize("dirtyWorkspace", "Workspace with Unsaved Files") : localize("dirtyFolder", "Folder with Unsaved Files"),
            message: isDirtyWorkspace ? localize("dirtyWorkspaceConfirm", "Do you want to open the workspace to review the unsaved files?") : localize("dirtyFolderConfirm", "Do you want to open the folder to review the unsaved files?"),
            detail: isDirtyWorkspace ? localize("dirtyWorkspaceConfirmDetail", "Workspaces with unsaved files cannot be removed until all unsaved files have been saved or reverted.") : localize("dirtyFolderConfirmDetail", "Folders with unsaved files cannot be removed until all unsaved files have been saved or reverted.")
          });
          if (confirmed) {
            hostService.openWindow(
              [context.item.openable],
              {
                remoteAuthority: context.item.remoteAuthority || null
                // local window if remoteAuthority is not set or can not be deducted from the openable
              }
            );
            quickInputService.cancel();
          }
        }
      }
    });
    if (pick) {
      return hostService.openWindow([pick.openable], {
        forceNewWindow: keyMods?.ctrlCmd,
        forceReuseWindow: keyMods?.alt,
        remoteAuthority: pick.remoteAuthority || null
        // local window if remoteAuthority is not set or can not be deducted from the openable
      });
    }
  }
  toQuickPick(modelService, languageService, labelService, environmentService, recent, kind) {
    let openable;
    let iconClasses;
    let fullLabel;
    let resource;
    let isWorkspace = false;
    if (isRecentFolder(recent)) {
      resource = recent.folderUri;
      iconClasses = getIconClasses(modelService, languageService, resource, FileKind.FOLDER);
      openable = { folderUri: resource };
      fullLabel = recent.label || labelService.getWorkspaceLabel(resource, { verbose: Verbosity.LONG });
    } else if (isRecentWorkspace(recent)) {
      resource = recent.workspace.configPath;
      iconClasses = getIconClasses(modelService, languageService, resource, FileKind.ROOT_FOLDER);
      openable = { workspaceUri: resource };
      fullLabel = recent.label || labelService.getWorkspaceLabel(recent.workspace, { verbose: Verbosity.LONG });
      isWorkspace = true;
    } else {
      resource = recent.fileUri;
      iconClasses = getIconClasses(modelService, languageService, resource, FileKind.FILE);
      openable = { fileUri: resource };
      fullLabel = recent.label || labelService.getUriLabel(resource, { appendWorkspaceSuffix: true });
    }
    const { name, parentPath } = isRecentWorkspace(recent) && isEqual(recent.workspace.configPath, environmentService.agentSessionsWorkspace) ? { name: fullLabel, parentPath: void 0 } : splitRecentLabel(fullLabel);
    const buttons = [];
    if (kind.isDirty) {
      buttons.push(isWorkspace ? this.dirtyRecentlyOpenedWorkspace : this.dirtyRecentlyOpenedFolder);
    } else if (kind.windowState) {
      if (kind.windowState.isActive) {
        buttons.push(isWorkspace ? this.activeWindowOpenedRecentlyOpenedWorkspace : this.activeWindowOpenedRecentlyOpenedFolder);
      } else {
        buttons.push(isWorkspace ? this.windowOpenedRecentlyOpenedWorkspace : this.windowOpenedRecentlyOpenedFolder);
      }
    } else {
      buttons.push(this.removeFromRecentlyOpened);
    }
    return {
      iconClasses,
      label: name,
      ariaLabel: kind.isDirty ? isWorkspace ? localize("recentDirtyWorkspaceAriaLabel", "{0}, workspace with unsaved changes", name) : localize("recentDirtyFolderAriaLabel", "{0}, folder with unsaved changes", name) : name,
      description: parentPath,
      buttons,
      openable,
      resource,
      remoteAuthority: recent.remoteAuthority
    };
  }
}
const _OpenRecentAction = class _OpenRecentAction extends BaseOpenRecentAction {
  constructor() {
    super({
      id: _OpenRecentAction.ID,
      title: {
        ...localize2("openRecent", "Open Recent..."),
        mnemonicTitle: localize({ key: "miMore", comment: ["&& denotes a mnemonic"] }, "&&More...")
      },
      category: Categories.File,
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.KeyR,
        mac: { primary: KeyMod.WinCtrl | KeyCode.KeyR }
      },
      menu: {
        id: MenuId.MenubarRecentMenu,
        group: "y_more",
        order: 1
      }
    });
  }
  isQuickNavigate() {
    return false;
  }
};
_OpenRecentAction.ID = "workbench.action.openRecent";
let OpenRecentAction = _OpenRecentAction;
class QuickPickRecentAction extends BaseOpenRecentAction {
  constructor() {
    super({
      id: "workbench.action.quickOpenRecent",
      title: localize2("quickOpenRecent", "Quick Open Recent..."),
      category: Categories.File,
      f1: false
      // hide quick pickers from command palette to not confuse with the other entry that shows a input field
    });
  }
  isQuickNavigate() {
    return true;
  }
}
class ToggleFullScreenAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.toggleFullScreen",
      title: {
        ...localize2("toggleFullScreen", "Toggle Full Screen"),
        mnemonicTitle: localize({ key: "miToggleFullScreen", comment: ["&& denotes a mnemonic"] }, "&&Full Screen")
      },
      category: Categories.View,
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyCode.F11,
        mac: {
          primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KeyF
        }
      },
      precondition: IsIOSContext.toNegated(),
      toggled: IsMainWindowFullscreenContext,
      menu: [{
        id: MenuId.MenubarAppearanceMenu,
        group: "1_toggle_view",
        order: 1
      }]
    });
  }
  run(accessor) {
    const hostService = accessor.get(IHostService);
    return hostService.toggleFullScreen(getActiveWindow());
  }
}
const _ReloadWindowAction = class _ReloadWindowAction extends Action2 {
  constructor() {
    super({
      id: _ReloadWindowAction.ID,
      title: localize2("reloadWindow", "Reload Window"),
      category: Categories.Developer,
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib + 50,
        when: IsDevelopmentContext,
        primary: KeyMod.CtrlCmd | KeyCode.KeyR
      }
    });
  }
  async run(accessor) {
    const hostService = accessor.get(IHostService);
    return hostService.reload();
  }
};
_ReloadWindowAction.ID = "workbench.action.reloadWindow";
let ReloadWindowAction = _ReloadWindowAction;
class ShowAboutDialogAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.showAboutDialog",
      title: {
        ...localize2("about", "About"),
        mnemonicTitle: localize({ key: "miAbout", comment: ["&& denotes a mnemonic"] }, "&&About")
      },
      category: Categories.Help,
      f1: true,
      menu: {
        id: MenuId.MenubarHelpMenu,
        group: "z_about",
        order: 1,
        when: IsMacNativeContext.toNegated()
      }
    });
  }
  run(accessor) {
    const dialogService = accessor.get(IDialogService);
    return dialogService.about();
  }
}
class NewWindowAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.newWindow",
      title: {
        ...localize2("newWindow", "New Window"),
        mnemonicTitle: localize({ key: "miNewWindow", comment: ["&& denotes a mnemonic"] }, "New &&Window")
      },
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: isWeb ? isWindows ? KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.Shift | KeyCode.KeyN) : KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.KeyN : KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyN,
        secondary: isWeb ? [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyN] : void 0
      },
      menu: {
        id: MenuId.MenubarFileMenu,
        group: "1_new",
        order: 3
      }
    });
  }
  run(accessor) {
    const hostService = accessor.get(IHostService);
    return hostService.openWindow({ remoteAuthority: null });
  }
}
class BlurAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.blur",
      title: localize2("blur", "Remove keyboard focus from focused element")
    });
  }
  run() {
    const activeElement = getActiveElement();
    if (isHTMLElement(activeElement)) {
      activeElement.blur();
    }
  }
}
registerAction2(NewWindowAction);
registerAction2(ToggleFullScreenAction);
registerAction2(QuickPickRecentAction);
registerAction2(OpenRecentAction);
registerAction2(ReloadWindowAction);
registerAction2(ShowAboutDialogAction);
registerAction2(BlurAction);
const recentFilesPickerContext = ContextKeyExpr.and(inQuickPickContext, ContextKeyExpr.has(inRecentFilesPickerContextKey));
const quickPickNavigateNextInRecentFilesPickerId = "workbench.action.quickOpenNavigateNextInRecentFilesPicker";
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: quickPickNavigateNextInRecentFilesPickerId,
  weight: KeybindingWeight.WorkbenchContrib + 50,
  handler: getQuickNavigateHandler(quickPickNavigateNextInRecentFilesPickerId, true),
  when: recentFilesPickerContext,
  primary: KeyMod.CtrlCmd | KeyCode.KeyR,
  mac: { primary: KeyMod.WinCtrl | KeyCode.KeyR }
});
const quickPickNavigatePreviousInRecentFilesPicker = "workbench.action.quickOpenNavigatePreviousInRecentFilesPicker";
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: quickPickNavigatePreviousInRecentFilesPicker,
  weight: KeybindingWeight.WorkbenchContrib + 50,
  handler: getQuickNavigateHandler(quickPickNavigatePreviousInRecentFilesPicker, false),
  when: recentFilesPickerContext,
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR,
  mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KeyR }
});
CommandsRegistry.registerCommand("workbench.action.toggleConfirmBeforeClose", (accessor) => {
  const configurationService = accessor.get(IConfigurationService);
  const setting = configurationService.inspect("window.confirmBeforeClose").userValue;
  return configurationService.updateValue("window.confirmBeforeClose", setting === "never" ? "keyboardOnly" : "never");
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  group: "z_ConfirmClose",
  command: {
    id: "workbench.action.toggleConfirmBeforeClose",
    title: localize("miConfirmClose", "Confirm Before Close"),
    toggled: ContextKeyExpr.notEquals("config.window.confirmBeforeClose", "never")
  },
  order: 1,
  when: IsWebContext
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  title: localize({ key: "miOpenRecent", comment: ["&& denotes a mnemonic"] }, "Open &&Recent"),
  submenu: MenuId.MenubarRecentMenu,
  group: "2_open",
  order: 4
});
export {
  OpenRecentAction,
  ReloadWindowAction,
  inRecentFilesPickerContextKey
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXGFjdGlvbnNcXHdpbmRvd0FjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElXaW5kb3dPcGVuYWJsZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBNZW51UmVnaXN0cnksIE1lbnVJZCwgQWN0aW9uMiwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBLZXlDaG9yZCwgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgSXNNYWluV2luZG93RnVsbHNjcmVlbkNvbnRleHQgfSBmcm9tICcuLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSXNNYWNOYXRpdmVDb250ZXh0LCBJc0RldmVsb3BtZW50Q29udGV4dCwgSXNXZWJDb250ZXh0LCBJc0lPU0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdzUmVnaXN0cnksIEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0QnV0dG9uLCBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tTZXBhcmF0b3IsIElLZXlNb2RzLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlSWRlbnRpZmllciwgaXNXb3Jrc3BhY2VJZGVudGlmaWVyLCBpc1NpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlLCBWZXJib3NpdHkgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSVJlY2VudCwgaXNSZWNlbnRGb2xkZXIsIGlzUmVjZW50V29ya3NwYWNlLCBJV29ya3NwYWNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZXRJY29uQ2xhc3NlcyB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvZ2V0SWNvbkNsYXNzZXMuanMnO1xuaW1wb3J0IHsgRmlsZUtpbmQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgc3BsaXRSZWNlbnRMYWJlbCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCwgaXNXZWIsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBpblF1aWNrUGlja0NvbnRleHQsIGdldFF1aWNrTmF2aWdhdGVIYW5kbGVyIH0gZnJvbSAnLi4vcXVpY2thY2Nlc3MuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgaXNGb2xkZXJCYWNrdXBJbmZvLCBpc1dvcmtzcGFjZUJhY2t1cEluZm8gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9iYWNrdXAvY29tbW9uL2JhY2t1cC5qcyc7XG5pbXBvcnQgeyBnZXRBY3RpdmVFbGVtZW50LCBnZXRBY3RpdmVXaW5kb3csIGlzSFRNTEVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuXG5leHBvcnQgY29uc3QgaW5SZWNlbnRGaWxlc1BpY2tlckNvbnRleHRLZXkgPSAnaW5SZWNlbnRGaWxlc1BpY2tlcic7XG5cbmludGVyZmFjZSBJUmVjZW50bHlPcGVuZWRQaWNrIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRyZXNvdXJjZTogVVJJO1xuXHRvcGVuYWJsZTogSVdpbmRvd09wZW5hYmxlO1xuXHRyZW1vdGVBdXRob3JpdHk6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuYWJzdHJhY3QgY2xhc3MgQmFzZU9wZW5SZWNlbnRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHJlbW92ZUZyb21SZWNlbnRseU9wZW5lZDogSVF1aWNrSW5wdXRCdXR0b24gPSB7XG5cdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5yZW1vdmVDbG9zZSksXG5cdFx0dG9vbHRpcDogbG9jYWxpemUoJ3JlbW92ZScsIFwiUmVtb3ZlIGZyb20gUmVjZW50bHkgT3BlbmVkXCIpXG5cdH07XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXJ0eVJlY2VudGx5T3BlbmVkRm9sZGVyOiBJUXVpY2tJbnB1dEJ1dHRvbiA9IHtcblx0XHRpY29uQ2xhc3M6ICdkaXJ0eS13b3Jrc3BhY2UgJyArIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmNsb3NlRGlydHkpLFxuXHRcdHRvb2x0aXA6IGxvY2FsaXplKCdkaXJ0eVJlY2VudGx5T3BlbmVkRm9sZGVyJywgXCJGb2xkZXIgV2l0aCBVbnNhdmVkIEZpbGVzXCIpLFxuXHRcdGFsd2F5c1Zpc2libGU6IHRydWVcblx0fTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRpcnR5UmVjZW50bHlPcGVuZWRXb3Jrc3BhY2U6IElRdWlja0lucHV0QnV0dG9uID0ge1xuXHRcdC4uLnRoaXMuZGlydHlSZWNlbnRseU9wZW5lZEZvbGRlcixcblx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnZGlydHlSZWNlbnRseU9wZW5lZFdvcmtzcGFjZScsIFwiV29ya3NwYWNlIFdpdGggVW5zYXZlZCBGaWxlc1wiKSxcblx0fTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHdpbmRvd09wZW5lZFJlY2VudGx5T3BlbmVkRm9sZGVyOiBJUXVpY2tJbnB1dEJ1dHRvbiA9IHtcblx0XHRpY29uQ2xhc3M6ICdvcGVuZWQtd29ya3NwYWNlICcgKyBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi53aW5kb3cpLFxuXHRcdHRvb2x0aXA6IGxvY2FsaXplKCdvcGVuZWRSZWNlbnRseU9wZW5lZEZvbGRlcicsIFwiRm9sZGVyIE9wZW5lZCBpbiBhIFdpbmRvd1wiKSxcblx0XHRhbHdheXNWaXNpYmxlOiB0cnVlXG5cdH07XG5cblx0cHJpdmF0ZSByZWFkb25seSB3aW5kb3dPcGVuZWRSZWNlbnRseU9wZW5lZFdvcmtzcGFjZTogSVF1aWNrSW5wdXRCdXR0b24gPSB7XG5cdFx0Li4udGhpcy53aW5kb3dPcGVuZWRSZWNlbnRseU9wZW5lZEZvbGRlcixcblx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnb3BlbmVkUmVjZW50bHlPcGVuZWRXb3Jrc3BhY2UnLCBcIldvcmtzcGFjZSBPcGVuZWQgaW4gYSBXaW5kb3dcIiksXG5cdH07XG5cblx0cHJpdmF0ZSByZWFkb25seSBhY3RpdmVXaW5kb3dPcGVuZWRSZWNlbnRseU9wZW5lZEZvbGRlcjogSVF1aWNrSW5wdXRCdXR0b24gPSB7XG5cdFx0aWNvbkNsYXNzOiAnb3BlbmVkLXdvcmtzcGFjZSAnICsgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24ud2luZG93QWN0aXZlKSxcblx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnYWN0aXZlT3BlbmVkUmVjZW50bHlPcGVuZWRGb2xkZXInLCBcIkZvbGRlciBPcGVuZWQgaW4gQWN0aXZlIFdpbmRvd1wiKSxcblx0XHRhbHdheXNWaXNpYmxlOiB0cnVlXG5cdH07XG5cblx0cHJpdmF0ZSByZWFkb25seSBhY3RpdmVXaW5kb3dPcGVuZWRSZWNlbnRseU9wZW5lZFdvcmtzcGFjZTogSVF1aWNrSW5wdXRCdXR0b24gPSB7XG5cdFx0Li4udGhpcy5hY3RpdmVXaW5kb3dPcGVuZWRSZWNlbnRseU9wZW5lZEZvbGRlcixcblx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnYWN0aXZlT3BlbmVkUmVjZW50bHlPcGVuZWRXb3Jrc3BhY2UnLCBcIldvcmtzcGFjZSBPcGVuZWQgaW4gQWN0aXZlIFdpbmRvd1wiKSxcblx0fTtcblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgaXNRdWlja05hdmlnYXRlKCk6IGJvb2xlYW47XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtzcGFjZXNTZXJ2aWNlKTtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbnRleHRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cdFx0Y29uc3QgbGFiZWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYWJlbFNlcnZpY2UpO1xuXHRcdGNvbnN0IGtleWJpbmRpbmdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElLZXliaW5kaW5nU2VydmljZSk7XG5cdFx0Y29uc3QgbW9kZWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElNb2RlbFNlcnZpY2UpO1xuXHRcdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCBob3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJSG9zdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IFttYWluV2luZG93cywgcmVjZW50bHlPcGVuZWQsIGRpcnR5V29ya3NwYWNlc0FuZEZvbGRlcnNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0aG9zdFNlcnZpY2UuZ2V0V2luZG93cyh7IGluY2x1ZGVBdXhpbGlhcnlXaW5kb3dzOiBmYWxzZSB9KSxcblx0XHRcdHdvcmtzcGFjZXNTZXJ2aWNlLmdldFJlY2VudGx5T3BlbmVkKCksXG5cdFx0XHR3b3Jrc3BhY2VzU2VydmljZS5nZXREaXJ0eVdvcmtzcGFjZXMoKVxuXHRcdF0pO1xuXG5cdFx0bGV0IGhhc1dvcmtzcGFjZXMgPSBmYWxzZTtcblxuXHRcdC8vIElkZW50aWZ5IGFsbCBmb2xkZXJzIGFuZCB3b3Jrc3BhY2VzIHdpdGggdW5zYXZlZCBmaWxlc1xuXHRcdGNvbnN0IGRpcnR5Rm9sZGVycyA9IG5ldyBSZXNvdXJjZU1hcDxib29sZWFuPigpO1xuXHRcdGNvbnN0IGRpcnR5V29ya3NwYWNlcyA9IG5ldyBSZXNvdXJjZU1hcDxJV29ya3NwYWNlSWRlbnRpZmllcj4oKTtcblx0XHRmb3IgKGNvbnN0IGRpcnR5V29ya3NwYWNlIG9mIGRpcnR5V29ya3NwYWNlc0FuZEZvbGRlcnMpIHtcblx0XHRcdGlmIChpc0ZvbGRlckJhY2t1cEluZm8oZGlydHlXb3Jrc3BhY2UpKSB7XG5cdFx0XHRcdGRpcnR5Rm9sZGVycy5zZXQoZGlydHlXb3Jrc3BhY2UuZm9sZGVyVXJpLCB0cnVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRpcnR5V29ya3NwYWNlcy5zZXQoZGlydHlXb3Jrc3BhY2Uud29ya3NwYWNlLmNvbmZpZ1BhdGgsIGRpcnR5V29ya3NwYWNlLndvcmtzcGFjZSk7XG5cdFx0XHRcdGhhc1dvcmtzcGFjZXMgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIElkZW50aWZ5IGFsbCBmb2xkZXJzIGFuZCB3b3Jrc3BhY2VzIG9wZW5lZCBpbiBtYWluIHdpbmRvd3Ncblx0XHRjb25zdCBhY3RpdmVXaW5kb3dJZCA9IGdldEFjdGl2ZVdpbmRvdygpLnZzY29kZVdpbmRvd0lkO1xuXHRcdGNvbnN0IG9wZW5lZEluV2luZG93cyA9IG5ldyBSZXNvdXJjZU1hcDx7IGlzQWN0aXZlOiBib29sZWFuIH0+KCk7XG5cdFx0Zm9yIChjb25zdCB3aW5kb3cgb2YgbWFpbldpbmRvd3MpIHtcblx0XHRcdGNvbnN0IGlzQWN0aXZlID0gd2luZG93LmlkID09PSBhY3RpdmVXaW5kb3dJZDtcblx0XHRcdGlmIChpc1NpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIod2luZG93LndvcmtzcGFjZSkpIHtcblx0XHRcdFx0b3BlbmVkSW5XaW5kb3dzLnNldCh3aW5kb3cud29ya3NwYWNlLnVyaSwgeyBpc0FjdGl2ZSB9KTtcblx0XHRcdH0gZWxzZSBpZiAoaXNXb3Jrc3BhY2VJZGVudGlmaWVyKHdpbmRvdy53b3Jrc3BhY2UpKSB7XG5cdFx0XHRcdG9wZW5lZEluV2luZG93cy5zZXQod2luZG93LndvcmtzcGFjZS5jb25maWdQYXRoLCB7IGlzQWN0aXZlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIElkZW50aWZ5IGFsbCByZWNlbnRseSBvcGVuZWQgZm9sZGVycyBhbmQgd29ya3NwYWNlc1xuXHRcdGNvbnN0IHJlY2VudEZvbGRlcnMgPSBuZXcgUmVzb3VyY2VNYXA8Ym9vbGVhbj4oKTtcblx0XHRjb25zdCByZWNlbnRXb3Jrc3BhY2VzID0gbmV3IFJlc291cmNlTWFwPElXb3Jrc3BhY2VJZGVudGlmaWVyPigpO1xuXHRcdGZvciAoY29uc3QgcmVjZW50IG9mIHJlY2VudGx5T3BlbmVkLndvcmtzcGFjZXMpIHtcblx0XHRcdGlmIChpc1JlY2VudEZvbGRlcihyZWNlbnQpKSB7XG5cdFx0XHRcdHJlY2VudEZvbGRlcnMuc2V0KHJlY2VudC5mb2xkZXJVcmksIHRydWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVjZW50V29ya3NwYWNlcy5zZXQocmVjZW50LndvcmtzcGFjZS5jb25maWdQYXRoLCByZWNlbnQud29ya3NwYWNlKTtcblx0XHRcdFx0aGFzV29ya3NwYWNlcyA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRmlsbCBpbiBhbGwga25vd24gcmVjZW50bHkgb3BlbmVkIHdvcmtzcGFjZXNcblx0XHRjb25zdCB3b3Jrc3BhY2VQaWNrczogSVJlY2VudGx5T3BlbmVkUGlja1tdID0gW107XG5cdFx0Zm9yIChjb25zdCByZWNlbnQgb2YgcmVjZW50bHlPcGVuZWQud29ya3NwYWNlcykge1xuXHRcdFx0Y29uc3QgaXNEaXJ0eSA9IGlzUmVjZW50Rm9sZGVyKHJlY2VudCkgPyBkaXJ0eUZvbGRlcnMuaGFzKHJlY2VudC5mb2xkZXJVcmkpIDogZGlydHlXb3Jrc3BhY2VzLmhhcyhyZWNlbnQud29ya3NwYWNlLmNvbmZpZ1BhdGgpO1xuXHRcdFx0Y29uc3Qgd2luZG93U3RhdGUgPSBpc1JlY2VudEZvbGRlcihyZWNlbnQpID8gb3BlbmVkSW5XaW5kb3dzLmdldChyZWNlbnQuZm9sZGVyVXJpKSA6IG9wZW5lZEluV2luZG93cy5nZXQocmVjZW50LndvcmtzcGFjZS5jb25maWdQYXRoKTtcblxuXHRcdFx0d29ya3NwYWNlUGlja3MucHVzaCh0aGlzLnRvUXVpY2tQaWNrKG1vZGVsU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlLCBsYWJlbFNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgcmVjZW50LCB7IGlzRGlydHksIHdpbmRvd1N0YXRlIH0pKTtcblx0XHR9XG5cblx0XHQvLyBGaWxsIGFueSBiYWNrdXAgd29ya3NwYWNlIHRoYXQgaXMgbm90IHlldCBzaG93biBhdCB0aGUgZW5kXG5cdFx0Zm9yIChjb25zdCBkaXJ0eVdvcmtzcGFjZU9yRm9sZGVyIG9mIGRpcnR5V29ya3NwYWNlc0FuZEZvbGRlcnMpIHtcblx0XHRcdGlmIChpc0ZvbGRlckJhY2t1cEluZm8oZGlydHlXb3Jrc3BhY2VPckZvbGRlcikgJiYgIXJlY2VudEZvbGRlcnMuaGFzKGRpcnR5V29ya3NwYWNlT3JGb2xkZXIuZm9sZGVyVXJpKSkge1xuXHRcdFx0XHR3b3Jrc3BhY2VQaWNrcy5wdXNoKHRoaXMudG9RdWlja1BpY2sobW9kZWxTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2UsIGxhYmVsU2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCBkaXJ0eVdvcmtzcGFjZU9yRm9sZGVyLCB7IGlzRGlydHk6IHRydWUsIHdpbmRvd1N0YXRlOiB1bmRlZmluZWQgfSkpO1xuXHRcdFx0fSBlbHNlIGlmIChpc1dvcmtzcGFjZUJhY2t1cEluZm8oZGlydHlXb3Jrc3BhY2VPckZvbGRlcikgJiYgIXJlY2VudFdvcmtzcGFjZXMuaGFzKGRpcnR5V29ya3NwYWNlT3JGb2xkZXIud29ya3NwYWNlLmNvbmZpZ1BhdGgpKSB7XG5cdFx0XHRcdHdvcmtzcGFjZVBpY2tzLnB1c2godGhpcy50b1F1aWNrUGljayhtb2RlbFNlcnZpY2UsIGxhbmd1YWdlU2VydmljZSwgbGFiZWxTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIGRpcnR5V29ya3NwYWNlT3JGb2xkZXIsIHsgaXNEaXJ0eTogdHJ1ZSwgd2luZG93U3RhdGU6IHVuZGVmaW5lZCB9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlsZVBpY2tzID0gcmVjZW50bHlPcGVuZWQuZmlsZXMubWFwKHAgPT4gdGhpcy50b1F1aWNrUGljayhtb2RlbFNlcnZpY2UsIGxhbmd1YWdlU2VydmljZSwgbGFiZWxTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIHAsIHsgaXNEaXJ0eTogZmFsc2UsIHdpbmRvd1N0YXRlOiB1bmRlZmluZWQgfSkpO1xuXG5cdFx0Ly8gRm9jdXMgdGhlIHNlY29uZCBlbnRyeSB3aGVuIHRoZSBmaXJzdCBvbmUgcmVwcmVzZW50cyB0aGUgY3VycmVudCB3b3Jrc3BhY2UuXG5cdFx0Y29uc3QgZmlyc3RFbnRyeSA9IHJlY2VudGx5T3BlbmVkLndvcmtzcGFjZXNbMF07XG5cdFx0Y29uc3QgYXV0b0ZvY3VzU2Vjb25kRW50cnk6IGJvb2xlYW4gPSBmaXJzdEVudHJ5ICYmIChcblx0XHRcdGNvbnRleHRTZXJ2aWNlLmlzQ3VycmVudFdvcmtzcGFjZShpc1JlY2VudFdvcmtzcGFjZShmaXJzdEVudHJ5KSA/IGZpcnN0RW50cnkud29ya3NwYWNlIDogZmlyc3RFbnRyeS5mb2xkZXJVcmkpXG5cdFx0XHR8fCAoaXNSZWNlbnRXb3Jrc3BhY2UoZmlyc3RFbnRyeSkgJiYgaXNFcXVhbChmaXJzdEVudHJ5LndvcmtzcGFjZS5jb25maWdQYXRoLCBlbnZpcm9ubWVudFNlcnZpY2UuYWdlbnRTZXNzaW9uc1dvcmtzcGFjZSkpXG5cdFx0KTtcblxuXHRcdGxldCBrZXlNb2RzOiBJS2V5TW9kcyB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZVNlcGFyYXRvcjogSVF1aWNrUGlja1NlcGFyYXRvciA9IHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBoYXNXb3Jrc3BhY2VzID8gbG9jYWxpemUoJ3dvcmtzcGFjZXNBbmRGb2xkZXJzJywgXCJmb2xkZXJzICYgd29ya3NwYWNlc1wiKSA6IGxvY2FsaXplKCdmb2xkZXJzJywgXCJmb2xkZXJzXCIpIH07XG5cdFx0Y29uc3QgZmlsZVNlcGFyYXRvcjogSVF1aWNrUGlja1NlcGFyYXRvciA9IHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnZmlsZXMnLCBcImZpbGVzXCIpIH07XG5cdFx0Y29uc3QgcGlja3MgPSBbd29ya3NwYWNlU2VwYXJhdG9yLCAuLi53b3Jrc3BhY2VQaWNrcywgZmlsZVNlcGFyYXRvciwgLi4uZmlsZVBpY2tzXTtcblxuXHRcdGNvbnN0IHBpY2sgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKHBpY2tzLCB7XG5cdFx0XHRjb250ZXh0S2V5OiBpblJlY2VudEZpbGVzUGlja2VyQ29udGV4dEtleSxcblx0XHRcdGFjdGl2ZUl0ZW06IFsuLi53b3Jrc3BhY2VQaWNrcywgLi4uZmlsZVBpY2tzXVthdXRvRm9jdXNTZWNvbmRFbnRyeSA/IDEgOiAwXSxcblx0XHRcdHBsYWNlSG9sZGVyOiBpc01hY2ludG9zaCA/IGxvY2FsaXplKCdvcGVuUmVjZW50UGxhY2Vob2xkZXJNYWMnLCBcIlNlbGVjdCB0byBvcGVuIChob2xkIENtZC1rZXkgdG8gZm9yY2UgbmV3IHdpbmRvdyBvciBPcHRpb24ta2V5IGZvciBzYW1lIHdpbmRvdylcIikgOiBsb2NhbGl6ZSgnb3BlblJlY2VudFBsYWNlaG9sZGVyJywgXCJTZWxlY3QgdG8gb3BlbiAoaG9sZCBDdHJsLWtleSB0byBmb3JjZSBuZXcgd2luZG93IG9yIEFsdC1rZXkgZm9yIHNhbWUgd2luZG93KVwiKSxcblx0XHRcdG1hdGNoT25EZXNjcmlwdGlvbjogdHJ1ZSxcblx0XHRcdHNvcnRCeUxhYmVsOiBmYWxzZSxcblx0XHRcdG9uS2V5TW9kczogbW9kcyA9PiBrZXlNb2RzID0gbW9kcyxcblx0XHRcdHF1aWNrTmF2aWdhdGU6IHRoaXMuaXNRdWlja05hdmlnYXRlKCkgPyB7IGtleWJpbmRpbmdzOiBrZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5ncyh0aGlzLmRlc2MuaWQpIH0gOiB1bmRlZmluZWQsXG5cdFx0XHRoaWRlSW5wdXQ6IHRoaXMuaXNRdWlja05hdmlnYXRlKCksXG5cdFx0XHRvbkRpZFRyaWdnZXJJdGVtQnV0dG9uOiBhc3luYyBjb250ZXh0ID0+IHtcblxuXHRcdFx0XHQvLyBSZW1vdmVcblx0XHRcdFx0aWYgKGNvbnRleHQuYnV0dG9uID09PSB0aGlzLnJlbW92ZUZyb21SZWNlbnRseU9wZW5lZCB8fCBjb250ZXh0LmJ1dHRvbiA9PT0gdGhpcy53aW5kb3dPcGVuZWRSZWNlbnRseU9wZW5lZEZvbGRlciB8fCBjb250ZXh0LmJ1dHRvbiA9PT0gdGhpcy53aW5kb3dPcGVuZWRSZWNlbnRseU9wZW5lZFdvcmtzcGFjZSkge1xuXHRcdFx0XHRcdGF3YWl0IHdvcmtzcGFjZXNTZXJ2aWNlLnJlbW92ZVJlY2VudGx5T3BlbmVkKFtjb250ZXh0Lml0ZW0ucmVzb3VyY2VdKTtcblx0XHRcdFx0XHRjb250ZXh0LnJlbW92ZUl0ZW0oKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIERpcnR5IEZvbGRlci9Xb3Jrc3BhY2Vcblx0XHRcdFx0ZWxzZSBpZiAoY29udGV4dC5idXR0b24gPT09IHRoaXMuZGlydHlSZWNlbnRseU9wZW5lZEZvbGRlciB8fCBjb250ZXh0LmJ1dHRvbiA9PT0gdGhpcy5kaXJ0eVJlY2VudGx5T3BlbmVkV29ya3NwYWNlKSB7XG5cdFx0XHRcdFx0Y29uc3QgaXNEaXJ0eVdvcmtzcGFjZSA9IGNvbnRleHQuYnV0dG9uID09PSB0aGlzLmRpcnR5UmVjZW50bHlPcGVuZWRXb3Jrc3BhY2U7XG5cdFx0XHRcdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdFx0XHR0aXRsZTogaXNEaXJ0eVdvcmtzcGFjZSA/IGxvY2FsaXplKCdkaXJ0eVdvcmtzcGFjZScsIFwiV29ya3NwYWNlIHdpdGggVW5zYXZlZCBGaWxlc1wiKSA6IGxvY2FsaXplKCdkaXJ0eUZvbGRlcicsIFwiRm9sZGVyIHdpdGggVW5zYXZlZCBGaWxlc1wiKSxcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IGlzRGlydHlXb3Jrc3BhY2UgPyBsb2NhbGl6ZSgnZGlydHlXb3Jrc3BhY2VDb25maXJtJywgXCJEbyB5b3Ugd2FudCB0byBvcGVuIHRoZSB3b3Jrc3BhY2UgdG8gcmV2aWV3IHRoZSB1bnNhdmVkIGZpbGVzP1wiKSA6IGxvY2FsaXplKCdkaXJ0eUZvbGRlckNvbmZpcm0nLCBcIkRvIHlvdSB3YW50IHRvIG9wZW4gdGhlIGZvbGRlciB0byByZXZpZXcgdGhlIHVuc2F2ZWQgZmlsZXM/XCIpLFxuXHRcdFx0XHRcdFx0ZGV0YWlsOiBpc0RpcnR5V29ya3NwYWNlID8gbG9jYWxpemUoJ2RpcnR5V29ya3NwYWNlQ29uZmlybURldGFpbCcsIFwiV29ya3NwYWNlcyB3aXRoIHVuc2F2ZWQgZmlsZXMgY2Fubm90IGJlIHJlbW92ZWQgdW50aWwgYWxsIHVuc2F2ZWQgZmlsZXMgaGF2ZSBiZWVuIHNhdmVkIG9yIHJldmVydGVkLlwiKSA6IGxvY2FsaXplKCdkaXJ0eUZvbGRlckNvbmZpcm1EZXRhaWwnLCBcIkZvbGRlcnMgd2l0aCB1bnNhdmVkIGZpbGVzIGNhbm5vdCBiZSByZW1vdmVkIHVudGlsIGFsbCB1bnNhdmVkIGZpbGVzIGhhdmUgYmVlbiBzYXZlZCBvciByZXZlcnRlZC5cIilcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGlmIChjb25maXJtZWQpIHtcblx0XHRcdFx0XHRcdGhvc3RTZXJ2aWNlLm9wZW5XaW5kb3coXG5cdFx0XHRcdFx0XHRcdFtjb250ZXh0Lml0ZW0ub3BlbmFibGVdLCB7XG5cdFx0XHRcdFx0XHRcdHJlbW90ZUF1dGhvcml0eTogY29udGV4dC5pdGVtLnJlbW90ZUF1dGhvcml0eSB8fCBudWxsIC8vIGxvY2FsIHdpbmRvdyBpZiByZW1vdGVBdXRob3JpdHkgaXMgbm90IHNldCBvciBjYW4gbm90IGJlIGRlZHVjdGVkIGZyb20gdGhlIG9wZW5hYmxlXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHF1aWNrSW5wdXRTZXJ2aWNlLmNhbmNlbCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKHBpY2spIHtcblx0XHRcdHJldHVybiBob3N0U2VydmljZS5vcGVuV2luZG93KFtwaWNrLm9wZW5hYmxlXSwge1xuXHRcdFx0XHRmb3JjZU5ld1dpbmRvdzoga2V5TW9kcz8uY3RybENtZCxcblx0XHRcdFx0Zm9yY2VSZXVzZVdpbmRvdzoga2V5TW9kcz8uYWx0LFxuXHRcdFx0XHRyZW1vdGVBdXRob3JpdHk6IHBpY2sucmVtb3RlQXV0aG9yaXR5IHx8IG51bGwgLy8gbG9jYWwgd2luZG93IGlmIHJlbW90ZUF1dGhvcml0eSBpcyBub3Qgc2V0IG9yIGNhbiBub3QgYmUgZGVkdWN0ZWQgZnJvbSB0aGUgb3BlbmFibGVcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdG9RdWlja1BpY2sobW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsIGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLCByZWNlbnQ6IElSZWNlbnQsIGtpbmQ6IHsgaXNEaXJ0eTogYm9vbGVhbjsgd2luZG93U3RhdGU/OiB7IGlzQWN0aXZlOiBib29sZWFuIH0gfSk6IElSZWNlbnRseU9wZW5lZFBpY2sge1xuXHRcdGxldCBvcGVuYWJsZTogSVdpbmRvd09wZW5hYmxlIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBpY29uQ2xhc3Nlczogc3RyaW5nW107XG5cdFx0bGV0IGZ1bGxMYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCByZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBpc1dvcmtzcGFjZSA9IGZhbHNlO1xuXG5cdFx0Ly8gRm9sZGVyXG5cdFx0aWYgKGlzUmVjZW50Rm9sZGVyKHJlY2VudCkpIHtcblx0XHRcdHJlc291cmNlID0gcmVjZW50LmZvbGRlclVyaTtcblx0XHRcdGljb25DbGFzc2VzID0gZ2V0SWNvbkNsYXNzZXMobW9kZWxTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2UsIHJlc291cmNlLCBGaWxlS2luZC5GT0xERVIpO1xuXHRcdFx0b3BlbmFibGUgPSB7IGZvbGRlclVyaTogcmVzb3VyY2UgfTtcblx0XHRcdGZ1bGxMYWJlbCA9IHJlY2VudC5sYWJlbCB8fCBsYWJlbFNlcnZpY2UuZ2V0V29ya3NwYWNlTGFiZWwocmVzb3VyY2UsIHsgdmVyYm9zZTogVmVyYm9zaXR5LkxPTkcgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gV29ya3NwYWNlXG5cdFx0ZWxzZSBpZiAoaXNSZWNlbnRXb3Jrc3BhY2UocmVjZW50KSkge1xuXHRcdFx0cmVzb3VyY2UgPSByZWNlbnQud29ya3NwYWNlLmNvbmZpZ1BhdGg7XG5cdFx0XHRpY29uQ2xhc3NlcyA9IGdldEljb25DbGFzc2VzKG1vZGVsU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlLCByZXNvdXJjZSwgRmlsZUtpbmQuUk9PVF9GT0xERVIpO1xuXHRcdFx0b3BlbmFibGUgPSB7IHdvcmtzcGFjZVVyaTogcmVzb3VyY2UgfTtcblx0XHRcdGZ1bGxMYWJlbCA9IHJlY2VudC5sYWJlbCB8fCBsYWJlbFNlcnZpY2UuZ2V0V29ya3NwYWNlTGFiZWwocmVjZW50LndvcmtzcGFjZSwgeyB2ZXJib3NlOiBWZXJib3NpdHkuTE9ORyB9KTtcblx0XHRcdGlzV29ya3NwYWNlID0gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBGaWxlXG5cdFx0ZWxzZSB7XG5cdFx0XHRyZXNvdXJjZSA9IHJlY2VudC5maWxlVXJpO1xuXHRcdFx0aWNvbkNsYXNzZXMgPSBnZXRJY29uQ2xhc3Nlcyhtb2RlbFNlcnZpY2UsIGxhbmd1YWdlU2VydmljZSwgcmVzb3VyY2UsIEZpbGVLaW5kLkZJTEUpO1xuXHRcdFx0b3BlbmFibGUgPSB7IGZpbGVVcmk6IHJlc291cmNlIH07XG5cdFx0XHRmdWxsTGFiZWwgPSByZWNlbnQubGFiZWwgfHwgbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHJlc291cmNlLCB7IGFwcGVuZFdvcmtzcGFjZVN1ZmZpeDogdHJ1ZSB9KTtcblx0XHR9XG5cblx0XHRjb25zdCB7IG5hbWUsIHBhcmVudFBhdGggfSA9IGlzUmVjZW50V29ya3NwYWNlKHJlY2VudCkgJiYgaXNFcXVhbChyZWNlbnQud29ya3NwYWNlLmNvbmZpZ1BhdGgsIGVudmlyb25tZW50U2VydmljZS5hZ2VudFNlc3Npb25zV29ya3NwYWNlKVxuXHRcdFx0PyB7IG5hbWU6IGZ1bGxMYWJlbCwgcGFyZW50UGF0aDogdW5kZWZpbmVkIH1cblx0XHRcdDogc3BsaXRSZWNlbnRMYWJlbChmdWxsTGFiZWwpO1xuXG5cdFx0Y29uc3QgYnV0dG9uczogSVF1aWNrSW5wdXRCdXR0b25bXSA9IFtdO1xuXHRcdGlmIChraW5kLmlzRGlydHkpIHtcblx0XHRcdGJ1dHRvbnMucHVzaChpc1dvcmtzcGFjZSA/IHRoaXMuZGlydHlSZWNlbnRseU9wZW5lZFdvcmtzcGFjZSA6IHRoaXMuZGlydHlSZWNlbnRseU9wZW5lZEZvbGRlcik7XG5cdFx0fSBlbHNlIGlmIChraW5kLndpbmRvd1N0YXRlKSB7XG5cdFx0XHRpZiAoa2luZC53aW5kb3dTdGF0ZS5pc0FjdGl2ZSkge1xuXHRcdFx0XHRidXR0b25zLnB1c2goaXNXb3Jrc3BhY2UgPyB0aGlzLmFjdGl2ZVdpbmRvd09wZW5lZFJlY2VudGx5T3BlbmVkV29ya3NwYWNlIDogdGhpcy5hY3RpdmVXaW5kb3dPcGVuZWRSZWNlbnRseU9wZW5lZEZvbGRlcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRidXR0b25zLnB1c2goaXNXb3Jrc3BhY2UgPyB0aGlzLndpbmRvd09wZW5lZFJlY2VudGx5T3BlbmVkV29ya3NwYWNlIDogdGhpcy53aW5kb3dPcGVuZWRSZWNlbnRseU9wZW5lZEZvbGRlcik7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGJ1dHRvbnMucHVzaCh0aGlzLnJlbW92ZUZyb21SZWNlbnRseU9wZW5lZCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGljb25DbGFzc2VzLFxuXHRcdFx0bGFiZWw6IG5hbWUsXG5cdFx0XHRhcmlhTGFiZWw6IGtpbmQuaXNEaXJ0eSA/IGlzV29ya3NwYWNlID8gbG9jYWxpemUoJ3JlY2VudERpcnR5V29ya3NwYWNlQXJpYUxhYmVsJywgXCJ7MH0sIHdvcmtzcGFjZSB3aXRoIHVuc2F2ZWQgY2hhbmdlc1wiLCBuYW1lKSA6IGxvY2FsaXplKCdyZWNlbnREaXJ0eUZvbGRlckFyaWFMYWJlbCcsIFwiezB9LCBmb2xkZXIgd2l0aCB1bnNhdmVkIGNoYW5nZXNcIiwgbmFtZSkgOiBuYW1lLFxuXHRcdFx0ZGVzY3JpcHRpb246IHBhcmVudFBhdGgsXG5cdFx0XHRidXR0b25zLFxuXHRcdFx0b3BlbmFibGUsXG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdHJlbW90ZUF1dGhvcml0eTogcmVjZW50LnJlbW90ZUF1dGhvcml0eVxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE9wZW5SZWNlbnRBY3Rpb24gZXh0ZW5kcyBCYXNlT3BlblJlY2VudEFjdGlvbiB7XG5cblx0c3RhdGljIElEID0gJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblJlY2VudCc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5SZWNlbnRBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5sb2NhbGl6ZTIoJ29wZW5SZWNlbnQnLCBcIk9wZW4gUmVjZW50Li4uXCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pTW9yZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJk1vcmUuLi5cIiksXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRmlsZSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVIsXG5cdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuS2V5UiB9XG5cdFx0XHR9LFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLk1lbnViYXJSZWNlbnRNZW51LFxuXHRcdFx0XHRncm91cDogJ3lfbW9yZScsXG5cdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgaXNRdWlja05hdmlnYXRlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5jbGFzcyBRdWlja1BpY2tSZWNlbnRBY3Rpb24gZXh0ZW5kcyBCYXNlT3BlblJlY2VudEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnF1aWNrT3BlblJlY2VudCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdxdWlja09wZW5SZWNlbnQnLCAnUXVpY2sgT3BlbiBSZWNlbnQuLi4nKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkZpbGUsXG5cdFx0XHRmMTogZmFsc2UgLy8gaGlkZSBxdWljayBwaWNrZXJzIGZyb20gY29tbWFuZCBwYWxldHRlIHRvIG5vdCBjb25mdXNlIHdpdGggdGhlIG90aGVyIGVudHJ5IHRoYXQgc2hvd3MgYSBpbnB1dCBmaWVsZFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGlzUXVpY2tOYXZpZ2F0ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG5jbGFzcyBUb2dnbGVGdWxsU2NyZWVuQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZUZ1bGxTY3JlZW4nLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0Li4ubG9jYWxpemUyKCd0b2dnbGVGdWxsU2NyZWVuJywgXCJUb2dnbGUgRnVsbCBTY3JlZW5cIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlUb2dnbGVGdWxsU2NyZWVuJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmRnVsbCBTY3JlZW5cIiksXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5GMTEsXG5cdFx0XHRcdG1hYzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLktleUZcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHByZWNvbmRpdGlvbjogSXNJT1NDb250ZXh0LnRvTmVnYXRlZCgpLFxuXHRcdFx0dG9nZ2xlZDogSXNNYWluV2luZG93RnVsbHNjcmVlbkNvbnRleHQsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLk1lbnViYXJBcHBlYXJhbmNlTWVudSxcblx0XHRcdFx0Z3JvdXA6ICcxX3RvZ2dsZV92aWV3Jyxcblx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBob3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJSG9zdFNlcnZpY2UpO1xuXG5cdFx0cmV0dXJuIGhvc3RTZXJ2aWNlLnRvZ2dsZUZ1bGxTY3JlZW4oZ2V0QWN0aXZlV2luZG93KCkpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZWxvYWRXaW5kb3dBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5yZWxvYWRXaW5kb3cnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBSZWxvYWRXaW5kb3dBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdyZWxvYWRXaW5kb3cnLCAnUmVsb2FkIFdpbmRvdycpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgNTAsXG5cdFx0XHRcdHdoZW46IElzRGV2ZWxvcG1lbnRDb250ZXh0LFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5UlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaG9zdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUhvc3RTZXJ2aWNlKTtcblxuXHRcdHJldHVybiBob3N0U2VydmljZS5yZWxvYWQoKTtcblx0fVxufVxuXG5jbGFzcyBTaG93QWJvdXREaWFsb2dBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uc2hvd0Fib3V0RGlhbG9nJyxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLmxvY2FsaXplMignYWJvdXQnLCBcIkFib3V0XCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pQWJvdXQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZBYm91dFwiKSxcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5IZWxwLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhckhlbHBNZW51LFxuXHRcdFx0XHRncm91cDogJ3pfYWJvdXQnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogSXNNYWNOYXRpdmVDb250ZXh0LnRvTmVnYXRlZCgpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblxuXHRcdHJldHVybiBkaWFsb2dTZXJ2aWNlLmFib3V0KCk7XG5cdH1cbn1cblxuY2xhc3MgTmV3V2luZG93QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm5ld1dpbmRvdycsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5sb2NhbGl6ZTIoJ25ld1dpbmRvdycsIFwiTmV3IFdpbmRvd1wiKSxcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaU5ld1dpbmRvdycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJOZXcgJiZXaW5kb3dcIiksXG5cdFx0XHR9LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBpc1dlYiA/IChpc1dpbmRvd3MgPyBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlOKSA6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5TikgOiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5Tixcblx0XHRcdFx0c2Vjb25kYXJ5OiBpc1dlYiA/IFtLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5Tl0gOiB1bmRlZmluZWRcblx0XHRcdH0sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhckZpbGVNZW51LFxuXHRcdFx0XHRncm91cDogJzFfbmV3Jyxcblx0XHRcdFx0b3JkZXI6IDMsXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBob3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJSG9zdFNlcnZpY2UpO1xuXG5cdFx0cmV0dXJuIGhvc3RTZXJ2aWNlLm9wZW5XaW5kb3coeyByZW1vdGVBdXRob3JpdHk6IG51bGwgfSk7XG5cdH1cbn1cblxuY2xhc3MgQmx1ckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5ibHVyJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2JsdXInLCAnUmVtb3ZlIGtleWJvYXJkIGZvY3VzIGZyb20gZm9jdXNlZCBlbGVtZW50Jylcblx0XHR9KTtcblx0fVxuXG5cdHJ1bigpOiB2b2lkIHtcblx0XHRjb25zdCBhY3RpdmVFbGVtZW50ID0gZ2V0QWN0aXZlRWxlbWVudCgpO1xuXHRcdGlmIChpc0hUTUxFbGVtZW50KGFjdGl2ZUVsZW1lbnQpKSB7XG5cdFx0XHRhY3RpdmVFbGVtZW50LmJsdXIoKTtcblx0XHR9XG5cdH1cbn1cblxuLy8gLS0tIEFjdGlvbnMgUmVnaXN0cmF0aW9uXG5cbnJlZ2lzdGVyQWN0aW9uMihOZXdXaW5kb3dBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFRvZ2dsZUZ1bGxTY3JlZW5BY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFF1aWNrUGlja1JlY2VudEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoT3BlblJlY2VudEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoUmVsb2FkV2luZG93QWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihTaG93QWJvdXREaWFsb2dBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKEJsdXJBY3Rpb24pO1xuXG4vLyAtLS0gQ29tbWFuZHMvS2V5YmluZGluZ3MgUmVnaXN0cmF0aW9uXG5cbmNvbnN0IHJlY2VudEZpbGVzUGlja2VyQ29udGV4dCA9IENvbnRleHRLZXlFeHByLmFuZChpblF1aWNrUGlja0NvbnRleHQsIENvbnRleHRLZXlFeHByLmhhcyhpblJlY2VudEZpbGVzUGlja2VyQ29udGV4dEtleSkpO1xuXG5jb25zdCBxdWlja1BpY2tOYXZpZ2F0ZU5leHRJblJlY2VudEZpbGVzUGlja2VySWQgPSAnd29ya2JlbmNoLmFjdGlvbi5xdWlja09wZW5OYXZpZ2F0ZU5leHRJblJlY2VudEZpbGVzUGlja2VyJztcbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogcXVpY2tQaWNrTmF2aWdhdGVOZXh0SW5SZWNlbnRGaWxlc1BpY2tlcklkLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDUwLFxuXHRoYW5kbGVyOiBnZXRRdWlja05hdmlnYXRlSGFuZGxlcihxdWlja1BpY2tOYXZpZ2F0ZU5leHRJblJlY2VudEZpbGVzUGlja2VySWQsIHRydWUpLFxuXHR3aGVuOiByZWNlbnRGaWxlc1BpY2tlckNvbnRleHQsXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlSLFxuXHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLktleVIgfVxufSk7XG5cbmNvbnN0IHF1aWNrUGlja05hdmlnYXRlUHJldmlvdXNJblJlY2VudEZpbGVzUGlja2VyID0gJ3dvcmtiZW5jaC5hY3Rpb24ucXVpY2tPcGVuTmF2aWdhdGVQcmV2aW91c0luUmVjZW50RmlsZXNQaWNrZXInO1xuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBxdWlja1BpY2tOYXZpZ2F0ZVByZXZpb3VzSW5SZWNlbnRGaWxlc1BpY2tlcixcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyA1MCxcblx0aGFuZGxlcjogZ2V0UXVpY2tOYXZpZ2F0ZUhhbmRsZXIocXVpY2tQaWNrTmF2aWdhdGVQcmV2aW91c0luUmVjZW50RmlsZXNQaWNrZXIsIGZhbHNlKSxcblx0d2hlbjogcmVjZW50RmlsZXNQaWNrZXJDb250ZXh0LFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5Uixcblx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlSIH1cbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi50b2dnbGVDb25maXJtQmVmb3JlQ2xvc2UnLCBhY2Nlc3NvciA9PiB7XG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdGNvbnN0IHNldHRpbmcgPSBjb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PCdhbHdheXMnIHwgJ2tleWJvYXJkT25seScgfCAnbmV2ZXInPignd2luZG93LmNvbmZpcm1CZWZvcmVDbG9zZScpLnVzZXJWYWx1ZTtcblxuXHRyZXR1cm4gY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoJ3dpbmRvdy5jb25maXJtQmVmb3JlQ2xvc2UnLCBzZXR0aW5nID09PSAnbmV2ZXInID8gJ2tleWJvYXJkT25seScgOiAnbmV2ZXInKTtcbn0pO1xuXG4vLyAtLS0gTWVudSBSZWdpc3RyYXRpb25cblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyRmlsZU1lbnUsIHtcblx0Z3JvdXA6ICd6X0NvbmZpcm1DbG9zZScsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlQ29uZmlybUJlZm9yZUNsb3NlJyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ21pQ29uZmlybUNsb3NlJywgXCJDb25maXJtIEJlZm9yZSBDbG9zZVwiKSxcblx0XHR0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoJ2NvbmZpZy53aW5kb3cuY29uZmlybUJlZm9yZUNsb3NlJywgJ25ldmVyJylcblx0fSxcblx0b3JkZXI6IDEsXG5cdHdoZW46IElzV2ViQ29udGV4dFxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckZpbGVNZW51LCB7XG5cdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pT3BlblJlY2VudCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJPcGVuICYmUmVjZW50XCIpLFxuXHRzdWJtZW51OiBNZW51SWQuTWVudWJhclJlY2VudE1lbnUsXG5cdGdyb3VwOiAnMl9vcGVuJyxcblx0b3JkZXI6IDQsXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsVUFBVSxpQkFBaUI7QUFFcEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxjQUFjLFFBQVEsU0FBUyx1QkFBdUI7QUFDL0QsU0FBUyxVQUFVLFNBQVMsY0FBYztBQUMxQyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLG9CQUFvQixzQkFBc0IsY0FBYyxvQkFBb0I7QUFDckYsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxxQkFBcUIsd0JBQXdCO0FBQ3RELFNBQTRCLDBCQUF5RTtBQUNyRyxTQUFTLDBCQUFnRCx1QkFBdUIseUNBQXlDO0FBQ3pILFNBQVMsZUFBZSxpQkFBaUI7QUFDekMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx3QkFBd0I7QUFDakMsU0FBa0IsZ0JBQWdCLG1CQUFtQiwwQkFBMEI7QUFFL0UsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxhQUFhLE9BQU8saUJBQWlCO0FBQzlDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsb0JBQW9CLCtCQUErQjtBQUM1RCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FB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
