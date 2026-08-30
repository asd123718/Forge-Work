import "./media/actions.css";
import { URI } from "../../../base/common/uri.js";
import { localize, localize2 } from "../../../nls.js";
import { ApplyZoomTarget, MAX_ZOOM_LEVEL, MIN_ZOOM_LEVEL, applyZoom } from "../../../platform/window/electron-browser/window.js";
import { IKeybindingService } from "../../../platform/keybinding/common/keybinding.js";
import { getZoomLevel } from "../../../base/browser/browser.js";
import { FileKind } from "../../../platform/files/common/files.js";
import { IModelService } from "../../../editor/common/services/model.js";
import { ILanguageService } from "../../../editor/common/languages/language.js";
import { IQuickInputService } from "../../../platform/quickinput/common/quickInput.js";
import { getIconClasses } from "../../../editor/common/services/getIconClasses.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { INativeHostService, FocusMode } from "../../../platform/native/common/native.js";
import { IHostService } from "../../services/host/browser/host.js";
import { Codicon } from "../../../base/common/codicons.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from "../../../platform/workspace/common/workspace.js";
import { Action2, MenuId } from "../../../platform/actions/common/actions.js";
import { Categories } from "../../../platform/action/common/actionCommonCategories.js";
import { KeyCode, KeyMod } from "../../../base/common/keyCodes.js";
import { KeybindingWeight } from "../../../platform/keybinding/common/keybindingsRegistry.js";
import { isMacintosh } from "../../../base/common/platform.js";
import { getActiveWindow } from "../../../base/browser/dom.js";
import { isOpenedAuxiliaryWindow } from "../../../platform/window/common/window.js";
import { IsAuxiliaryWindowContext, IsAuxiliaryWindowFocusedContext, IsWindowAlwaysOnTopContext } from "../../common/contextkeys.js";
import { isAuxiliaryWindow, mainWindow } from "../../../base/browser/window.js";
import { ContextKeyExpr } from "../../../platform/contextkey/common/contextkey.js";
const _CloseWindowAction = class _CloseWindowAction extends Action2 {
  constructor() {
    super({
      id: _CloseWindowAction.ID,
      title: {
        ...localize2("closeWindow", "Close Window"),
        mnemonicTitle: localize({ key: "miCloseWindow", comment: ["&& denotes a mnemonic"] }, "Clos&&e Window")
      },
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyW },
        linux: { primary: KeyMod.Alt | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyW] },
        win: { primary: KeyMod.Alt | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyW] }
      },
      menu: {
        id: MenuId.MenubarFileMenu,
        group: "6_close",
        order: 4
      }
    });
  }
  async run(accessor) {
    const nativeHostService = accessor.get(INativeHostService);
    return nativeHostService.closeWindow({ targetWindowId: getActiveWindow().vscodeWindowId });
  }
};
_CloseWindowAction.ID = "workbench.action.closeWindow";
let CloseWindowAction = _CloseWindowAction;
const _CloseOtherWindowsAction = class _CloseOtherWindowsAction extends Action2 {
  constructor() {
    super({
      id: _CloseOtherWindowsAction.ID,
      title: localize2("closeOtherWindows", "Close Other Windows"),
      f1: true
    });
  }
  async run(accessor) {
    const nativeHostService = accessor.get(INativeHostService);
    const currentWindowId = getActiveWindow().vscodeWindowId;
    const windows = await nativeHostService.getWindows({ includeAuxiliaryWindows: false });
    for (const window of windows) {
      if (window.id !== currentWindowId) {
        nativeHostService.closeWindow({ targetWindowId: window.id });
      }
    }
  }
};
_CloseOtherWindowsAction.ID = "workbench.action.closeOtherWindows";
let CloseOtherWindowsAction = _CloseOtherWindowsAction;
const _BaseZoomAction = class _BaseZoomAction extends Action2 {
  async setZoomLevel(accessor, levelOrReset) {
    const configurationService = accessor.get(IConfigurationService);
    let target;
    if (configurationService.getValue(_BaseZoomAction.ZOOM_PER_WINDOW_SETTING_KEY) !== false) {
      target = ApplyZoomTarget.ACTIVE_WINDOW;
    } else {
      target = ApplyZoomTarget.ALL_WINDOWS;
    }
    let level;
    if (typeof levelOrReset === "number") {
      level = Math.round(levelOrReset);
    } else {
      if (target === ApplyZoomTarget.ALL_WINDOWS) {
        level = 0;
      } else {
        const defaultLevel = configurationService.getValue(_BaseZoomAction.ZOOM_LEVEL_SETTING_KEY);
        if (typeof defaultLevel === "number") {
          level = defaultLevel;
        } else {
          level = 0;
        }
      }
    }
    if (level > MAX_ZOOM_LEVEL || level < MIN_ZOOM_LEVEL) {
      return;
    }
    if (target === ApplyZoomTarget.ALL_WINDOWS) {
      await configurationService.updateValue(_BaseZoomAction.ZOOM_LEVEL_SETTING_KEY, level);
    }
    applyZoom(level, target);
  }
};
_BaseZoomAction.ZOOM_LEVEL_SETTING_KEY = "window.zoomLevel";
_BaseZoomAction.ZOOM_PER_WINDOW_SETTING_KEY = "window.zoomPerWindow";
let BaseZoomAction = _BaseZoomAction;
class ZoomInAction extends BaseZoomAction {
  constructor() {
    super({
      id: "workbench.action.zoomIn",
      title: {
        ...localize2("zoomIn", "Zoom In"),
        mnemonicTitle: localize({ key: "miZoomIn", comment: ["&& denotes a mnemonic"] }, "&&Zoom In")
      },
      category: Categories.View,
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.Equal,
        secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Equal, KeyMod.CtrlCmd | KeyCode.NumpadAdd]
      },
      menu: {
        id: MenuId.MenubarAppearanceMenu,
        group: "5_zoom",
        order: 1
      }
    });
  }
  run(accessor) {
    return super.setZoomLevel(accessor, getZoomLevel(getActiveWindow()) + 1);
  }
}
class ZoomOutAction extends BaseZoomAction {
  constructor() {
    super({
      id: "workbench.action.zoomOut",
      title: {
        ...localize2("zoomOut", "Zoom Out"),
        mnemonicTitle: localize({ key: "miZoomOut", comment: ["&& denotes a mnemonic"] }, "&&Zoom Out")
      },
      category: Categories.View,
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.Minus,
        secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Minus, KeyMod.CtrlCmd | KeyCode.NumpadSubtract],
        linux: {
          primary: KeyMod.CtrlCmd | KeyCode.Minus,
          secondary: [KeyMod.CtrlCmd | KeyCode.NumpadSubtract]
        }
      },
      menu: {
        id: MenuId.MenubarAppearanceMenu,
        group: "5_zoom",
        order: 2
      }
    });
  }
  run(accessor) {
    return super.setZoomLevel(accessor, getZoomLevel(getActiveWindow()) - 1);
  }
}
class ZoomResetAction extends BaseZoomAction {
  constructor() {
    super({
      id: "workbench.action.zoomReset",
      title: {
        ...localize2("zoomReset", "Reset Zoom"),
        mnemonicTitle: localize({ key: "miZoomReset", comment: ["&& denotes a mnemonic"] }, "&&Reset Zoom")
      },
      category: Categories.View,
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.Numpad0
      },
      menu: {
        id: MenuId.MenubarAppearanceMenu,
        group: "5_zoom",
        order: 3
      }
    });
  }
  run(accessor) {
    return super.setZoomLevel(accessor, true);
  }
}
class BaseSwitchWindow extends Action2 {
  constructor() {
    super(...arguments);
    this.closeWindowAction = {
      iconClass: ThemeIcon.asClassName(Codicon.removeClose),
      tooltip: localize("close", "Close Window")
    };
    this.closeDirtyWindowAction = {
      iconClass: "dirty-window " + ThemeIcon.asClassName(Codicon.closeDirty),
      tooltip: localize("close", "Close Window"),
      alwaysVisible: true
    };
    this.closeActiveWindowAction = {
      iconClass: "active-window " + ThemeIcon.asClassName(Codicon.windowActive),
      tooltip: localize("closeActive", "Close Active Window"),
      alwaysVisible: true
    };
  }
  async run(accessor) {
    const quickInputService = accessor.get(IQuickInputService);
    const keybindingService = accessor.get(IKeybindingService);
    const modelService = accessor.get(IModelService);
    const languageService = accessor.get(ILanguageService);
    const nativeHostService = accessor.get(INativeHostService);
    const currentWindowId = getActiveWindow().vscodeWindowId;
    const windows = await nativeHostService.getWindows({ includeAuxiliaryWindows: true });
    const mainWindows = /* @__PURE__ */ new Set();
    const mapMainWindowToAuxiliaryWindows = /* @__PURE__ */ new Map();
    for (const window of windows) {
      if (isOpenedAuxiliaryWindow(window)) {
        let auxiliaryWindows = mapMainWindowToAuxiliaryWindows.get(window.parentId);
        if (!auxiliaryWindows) {
          auxiliaryWindows = /* @__PURE__ */ new Set();
          mapMainWindowToAuxiliaryWindows.set(window.parentId, auxiliaryWindows);
        }
        auxiliaryWindows.add(window);
      } else {
        mainWindows.add(window);
      }
    }
    function isWindowPickItem(candidate) {
      const windowPickItem = candidate;
      return typeof windowPickItem?.windowId === "number";
    }
    const picks = [];
    for (const window of mainWindows) {
      const auxiliaryWindows = mapMainWindowToAuxiliaryWindows.get(window.id);
      if (mapMainWindowToAuxiliaryWindows.size > 0) {
        picks.push({ type: "separator", label: auxiliaryWindows ? localize("windowGroup", "window group") : void 0 });
      }
      const resource = window.filename ? URI.file(window.filename) : isSingleFolderWorkspaceIdentifier(window.workspace) ? window.workspace.uri : isWorkspaceIdentifier(window.workspace) ? window.workspace.configPath : void 0;
      const fileKind = window.filename ? FileKind.FILE : isSingleFolderWorkspaceIdentifier(window.workspace) ? FileKind.FOLDER : isWorkspaceIdentifier(window.workspace) ? FileKind.ROOT_FOLDER : FileKind.FILE;
      const pick2 = {
        windowId: window.id,
        label: window.title,
        ariaLabel: window.dirty ? localize("windowDirtyAriaLabel", "{0}, window with unsaved changes", window.title) : window.title,
        iconClasses: getIconClasses(modelService, languageService, resource, fileKind),
        description: currentWindowId === window.id ? localize("current", "Current Window") : void 0,
        buttons: window.dirty ? [this.closeDirtyWindowAction] : currentWindowId === window.id ? [this.closeActiveWindowAction] : [this.closeWindowAction]
      };
      picks.push(pick2);
      if (auxiliaryWindows) {
        for (const auxiliaryWindow of auxiliaryWindows) {
          const pick3 = {
            windowId: auxiliaryWindow.id,
            label: auxiliaryWindow.title,
            iconClasses: getIconClasses(modelService, languageService, auxiliaryWindow.filename ? URI.file(auxiliaryWindow.filename) : void 0, FileKind.FILE),
            description: currentWindowId === auxiliaryWindow.id ? localize("current", "Current Window") : void 0,
            buttons: currentWindowId === auxiliaryWindow.id ? [this.closeActiveWindowAction] : [this.closeWindowAction]
          };
          picks.push(pick3);
        }
      }
    }
    const pick = await quickInputService.pick(picks, {
      contextKey: "inWindowsPicker",
      activeItem: (() => {
        for (let i = 0; i < picks.length; i++) {
          const pick2 = picks[i];
          if (isWindowPickItem(pick2) && pick2.windowId === currentWindowId) {
            let nextPick = picks[i + 1];
            if (isWindowPickItem(nextPick)) {
              return nextPick;
            }
            nextPick = picks[i + 2];
            if (isWindowPickItem(nextPick)) {
              return nextPick;
            }
          }
        }
        return void 0;
      })(),
      placeHolder: localize("switchWindowPlaceHolder", "Select a window to switch to"),
      quickNavigate: this.isQuickNavigate() ? { keybindings: keybindingService.lookupKeybindings(this.desc.id) } : void 0,
      hideInput: this.isQuickNavigate(),
      onDidTriggerItemButton: async (context) => {
        await nativeHostService.closeWindow({ targetWindowId: context.item.windowId });
        context.removeItem();
      }
    });
    if (pick) {
      nativeHostService.focusWindow({ targetWindowId: pick.windowId });
    }
  }
}
class SwitchWindowAction extends BaseSwitchWindow {
  constructor() {
    super({
      id: "workbench.action.switchWindow",
      title: localize2("switchWindow", "Switch Window..."),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: 0,
        mac: { primary: KeyMod.WinCtrl | KeyCode.KeyW }
      }
    });
  }
  isQuickNavigate() {
    return false;
  }
}
class QuickSwitchWindowAction extends BaseSwitchWindow {
  constructor() {
    super({
      id: "workbench.action.quickSwitchWindow",
      title: localize2("quickSwitchWindow", "Quick Switch Window..."),
      f1: false
      // hide quick pickers from command palette to not confuse with the other entry that shows a input field
    });
  }
  isQuickNavigate() {
    return true;
  }
}
class SwitchToMainWindowAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.switchToMainWindow",
      title: localize2("switchToMainWindow", "Switch to Main Window"),
      f1: true,
      precondition: IsAuxiliaryWindowContext
    });
  }
  async run(accessor) {
    const nativeHostService = accessor.get(INativeHostService);
    return nativeHostService.focusWindow({ targetWindowId: mainWindow.vscodeWindowId });
  }
}
const _FocusWindowAction = class _FocusWindowAction extends Action2 {
  constructor() {
    super({
      id: _FocusWindowAction.ID,
      title: localize2("focusWindow", "Focus Window"),
      f1: true
    });
  }
  async run(accessor) {
    const hostService = accessor.get(IHostService);
    await hostService.focus(getActiveWindow(), { mode: FocusMode.Force });
  }
};
_FocusWindowAction.ID = "workbench.action.focusWindow";
let FocusWindowAction = _FocusWindowAction;
function canRunNativeTabsHandler(accessor) {
  if (!isMacintosh) {
    return false;
  }
  const configurationService = accessor.get(IConfigurationService);
  return configurationService.getValue("window.nativeTabs") === true;
}
const NewWindowTabHandler = function(accessor) {
  if (!canRunNativeTabsHandler(accessor)) {
    return;
  }
  return accessor.get(INativeHostService).newWindowTab();
};
const ShowPreviousWindowTabHandler = function(accessor) {
  if (!canRunNativeTabsHandler(accessor)) {
    return;
  }
  return accessor.get(INativeHostService).showPreviousWindowTab();
};
const ShowNextWindowTabHandler = function(accessor) {
  if (!canRunNativeTabsHandler(accessor)) {
    return;
  }
  return accessor.get(INativeHostService).showNextWindowTab();
};
const MoveWindowTabToNewWindowHandler = function(accessor) {
  if (!canRunNativeTabsHandler(accessor)) {
    return;
  }
  return accessor.get(INativeHostService).moveWindowTabToNewWindow();
};
const MergeWindowTabsHandlerHandler = function(accessor) {
  if (!canRunNativeTabsHandler(accessor)) {
    return;
  }
  return accessor.get(INativeHostService).mergeAllWindowTabs();
};
const ToggleWindowTabsBarHandler = function(accessor) {
  if (!canRunNativeTabsHandler(accessor)) {
    return;
  }
  return accessor.get(INativeHostService).toggleWindowTabsBar();
};
const _ToggleWindowAlwaysOnTopAction = class _ToggleWindowAlwaysOnTopAction extends Action2 {
  constructor() {
    super({
      id: _ToggleWindowAlwaysOnTopAction.ID,
      title: localize2("toggleWindowAlwaysOnTop", "Toggle Window Always on Top"),
      f1: true,
      precondition: IsAuxiliaryWindowFocusedContext
    });
  }
  async run(accessor) {
    const nativeHostService = accessor.get(INativeHostService);
    const targetWindow = getActiveWindow();
    if (!isAuxiliaryWindow(targetWindow.window)) {
      return;
    }
    return nativeHostService.toggleWindowAlwaysOnTop({ targetWindowId: getActiveWindow().vscodeWindowId });
  }
};
_ToggleWindowAlwaysOnTopAction.ID = "workbench.action.toggleWindowAlwaysOnTop";
let ToggleWindowAlwaysOnTopAction = _ToggleWindowAlwaysOnTopAction;
const _EnableWindowAlwaysOnTopAction = class _EnableWindowAlwaysOnTopAction extends Action2 {
  constructor() {
    super({
      id: _EnableWindowAlwaysOnTopAction.ID,
      title: localize("enableWindowAlwaysOnTop", "Turn On Always on Top"),
      icon: Codicon.pin,
      menu: {
        id: MenuId.LayoutControlMenu,
        when: ContextKeyExpr.and(IsWindowAlwaysOnTopContext.toNegated(), IsAuxiliaryWindowContext),
        order: 1,
        group: "navigation"
      }
    });
  }
  async run(accessor) {
    const nativeHostService = accessor.get(INativeHostService);
    const targetWindow = getActiveWindow();
    if (!isAuxiliaryWindow(targetWindow.window)) {
      return;
    }
    return nativeHostService.setWindowAlwaysOnTop(true, { targetWindowId: targetWindow.vscodeWindowId });
  }
};
_EnableWindowAlwaysOnTopAction.ID = "workbench.action.enableWindowAlwaysOnTop";
let EnableWindowAlwaysOnTopAction = _EnableWindowAlwaysOnTopAction;
const _DisableWindowAlwaysOnTopAction = class _DisableWindowAlwaysOnTopAction extends Action2 {
  constructor() {
    super({
      id: _DisableWindowAlwaysOnTopAction.ID,
      title: localize("disableWindowAlwaysOnTop", "Turn Off Always on Top"),
      icon: Codicon.pinned,
      menu: {
        id: MenuId.LayoutControlMenu,
        when: ContextKeyExpr.and(IsWindowAlwaysOnTopContext, IsAuxiliaryWindowContext),
        order: 1,
        group: "navigation"
      }
    });
  }
  async run(accessor) {
    const nativeHostService = accessor.get(INativeHostService);
    const targetWindow = getActiveWindow();
    if (!isAuxiliaryWindow(targetWindow.window)) {
      return;
    }
    return nativeHostService.setWindowAlwaysOnTop(false, { targetWindowId: targetWindow.vscodeWindowId });
  }
};
_DisableWindowAlwaysOnTopAction.ID = "workbench.action.disableWindowAlwaysOnTop";
let DisableWindowAlwaysOnTopAction = _DisableWindowAlwaysOnTopAction;
export {
  CloseOtherWindowsAction,
  CloseWindowAction,
  DisableWindowAlwaysOnTopAction,
  EnableWindowAlwaysOnTopAction,
  FocusWindowAction,
  MergeWindowTabsHandlerHandler,
  MoveWindowTabToNewWindowHandler,
  NewWindowTabHandler,
  QuickSwitchWindowAction,
  ShowNextWindowTabHandler,
  ShowPreviousWindowTabHandler,
  SwitchToMainWindowAction,
  SwitchWindowAction,
  ToggleWindowAlwaysOnTopAction,
  ToggleWindowTabsBarHandler,
  ZoomInAction,
  ZoomOutAction,
  ZoomResetAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGVsZWN0cm9uLWJyb3dzZXJcXGFjdGlvbnNcXHdpbmRvd0FjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvYWN0aW9ucy5jc3MnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQXBwbHlab29tVGFyZ2V0LCBNQVhfWk9PTV9MRVZFTCwgTUlOX1pPT01fTEVWRUwsIGFwcGx5Wm9vbSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9lbGVjdHJvbi1icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IGdldFpvb21MZXZlbCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9icm93c2VyLmpzJztcbmltcG9ydCB7IEZpbGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja0lucHV0QnV0dG9uLCBJUXVpY2tQaWNrSXRlbSwgUXVpY2tQaWNrSW5wdXQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IGdldEljb25DbGFzc2VzIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9nZXRJY29uQ2xhc3Nlcy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZEhhbmRsZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdFNlcnZpY2UsIEZvY3VzTW9kZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9jb21tb24vbmF0aXZlLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyLCBpc1dvcmtzcGFjZUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgaXNNYWNpbnRvc2ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBnZXRBY3RpdmVXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElPcGVuZWRBdXhpbGlhcnlXaW5kb3csIElPcGVuZWRNYWluV2luZG93LCBpc09wZW5lZEF1eGlsaWFyeVdpbmRvdyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IElzQXV4aWxpYXJ5V2luZG93Q29udGV4dCwgSXNBdXhpbGlhcnlXaW5kb3dGb2N1c2VkQ29udGV4dCwgSXNXaW5kb3dBbHdheXNPblRvcENvbnRleHQgfSBmcm9tICcuLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgaXNBdXhpbGlhcnlXaW5kb3csIG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBDbG9zZVdpbmRvd0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNsb3NlV2luZG93JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ2xvc2VXaW5kb3dBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5sb2NhbGl6ZTIoJ2Nsb3NlV2luZG93JywgXCJDbG9zZSBXaW5kb3dcIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlDbG9zZVdpbmRvdycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJDbG9zJiZlIFdpbmRvd1wiKSxcblx0XHRcdH0sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5VyB9LFxuXHRcdFx0XHRsaW51eDogeyBwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5GNCwgc2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleVddIH0sXG5cdFx0XHRcdHdpbjogeyBwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5GNCwgc2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleVddIH1cblx0XHRcdH0sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhckZpbGVNZW51LFxuXHRcdFx0XHRncm91cDogJzZfY2xvc2UnLFxuXHRcdFx0XHRvcmRlcjogNFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbmF0aXZlSG9zdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5hdGl2ZUhvc3RTZXJ2aWNlKTtcblxuXHRcdHJldHVybiBuYXRpdmVIb3N0U2VydmljZS5jbG9zZVdpbmRvdyh7IHRhcmdldFdpbmRvd0lkOiBnZXRBY3RpdmVXaW5kb3coKS52c2NvZGVXaW5kb3dJZCB9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2xvc2VPdGhlcldpbmRvd3NBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNsb3NlT3RoZXJXaW5kb3dzJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ2xvc2VPdGhlcldpbmRvd3NBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjbG9zZU90aGVyV2luZG93cycsIFwiQ2xvc2UgT3RoZXIgV2luZG93c1wiKSxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBuYXRpdmVIb3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJTmF0aXZlSG9zdFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgY3VycmVudFdpbmRvd0lkID0gZ2V0QWN0aXZlV2luZG93KCkudnNjb2RlV2luZG93SWQ7XG5cdFx0Y29uc3Qgd2luZG93cyA9IGF3YWl0IG5hdGl2ZUhvc3RTZXJ2aWNlLmdldFdpbmRvd3MoeyBpbmNsdWRlQXV4aWxpYXJ5V2luZG93czogZmFsc2UgfSk7XG5cblx0XHRmb3IgKGNvbnN0IHdpbmRvdyBvZiB3aW5kb3dzKSB7XG5cdFx0XHRpZiAod2luZG93LmlkICE9PSBjdXJyZW50V2luZG93SWQpIHtcblx0XHRcdFx0bmF0aXZlSG9zdFNlcnZpY2UuY2xvc2VXaW5kb3coeyB0YXJnZXRXaW5kb3dJZDogd2luZG93LmlkIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5hYnN0cmFjdCBjbGFzcyBCYXNlWm9vbUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFpPT01fTEVWRUxfU0VUVElOR19LRVkgPSAnd2luZG93Lnpvb21MZXZlbCc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFpPT01fUEVSX1dJTkRPV19TRVRUSU5HX0tFWSA9ICd3aW5kb3cuem9vbVBlcldpbmRvdyc7XG5cblx0cHJvdGVjdGVkIGFzeW5jIHNldFpvb21MZXZlbChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgbGV2ZWxPclJlc2V0OiBudW1iZXIgfCB0cnVlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGxldCB0YXJnZXQ6IEFwcGx5Wm9vbVRhcmdldDtcblx0XHRpZiAoY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQmFzZVpvb21BY3Rpb24uWk9PTV9QRVJfV0lORE9XX1NFVFRJTkdfS0VZKSAhPT0gZmFsc2UpIHtcblx0XHRcdHRhcmdldCA9IEFwcGx5Wm9vbVRhcmdldC5BQ1RJVkVfV0lORE9XO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0YXJnZXQgPSBBcHBseVpvb21UYXJnZXQuQUxMX1dJTkRPV1M7XG5cdFx0fVxuXG5cdFx0bGV0IGxldmVsOiBudW1iZXI7XG5cdFx0aWYgKHR5cGVvZiBsZXZlbE9yUmVzZXQgPT09ICdudW1iZXInKSB7XG5cdFx0XHRsZXZlbCA9IE1hdGgucm91bmQobGV2ZWxPclJlc2V0KTsgLy8gcHJldmVudCBmcmFjdGlvbmFsIHpvb20gbGV2ZWxzXG5cdFx0fSBlbHNlIHtcblxuXHRcdFx0Ly8gcmVzZXQgdG8gMCB3aGVuIHdlIGFwcGx5IHRvIGFsbCB3aW5kb3dzXG5cdFx0XHRpZiAodGFyZ2V0ID09PSBBcHBseVpvb21UYXJnZXQuQUxMX1dJTkRPV1MpIHtcblx0XHRcdFx0bGV2ZWwgPSAwO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBvdGhlcndpc2UsIHJlc2V0IHRvIHRoZSBkZWZhdWx0IHpvb20gbGV2ZWxcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0TGV2ZWwgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShCYXNlWm9vbUFjdGlvbi5aT09NX0xFVkVMX1NFVFRJTkdfS0VZKTtcblx0XHRcdFx0aWYgKHR5cGVvZiBkZWZhdWx0TGV2ZWwgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0bGV2ZWwgPSBkZWZhdWx0TGV2ZWw7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bGV2ZWwgPSAwO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGxldmVsID4gTUFYX1pPT01fTEVWRUwgfHwgbGV2ZWwgPCBNSU5fWk9PTV9MRVZFTCkge1xuXHRcdFx0cmV0dXJuOyAvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNDgzNTdcblx0XHR9XG5cblx0XHRpZiAodGFyZ2V0ID09PSBBcHBseVpvb21UYXJnZXQuQUxMX1dJTkRPV1MpIHtcblx0XHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKEJhc2Vab29tQWN0aW9uLlpPT01fTEVWRUxfU0VUVElOR19LRVksIGxldmVsKTtcblx0XHR9XG5cblx0XHRhcHBseVpvb20obGV2ZWwsIHRhcmdldCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFpvb21JbkFjdGlvbiBleHRlbmRzIEJhc2Vab29tQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uem9vbUluJyxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLmxvY2FsaXplMignem9vbUluJywgXCJab29tIEluXCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pWm9vbUluJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmWm9vbSBJblwiKSxcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRXF1YWwsXG5cdFx0XHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5FcXVhbCwgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLk51bXBhZEFkZF1cblx0XHRcdH0sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhckFwcGVhcmFuY2VNZW51LFxuXHRcdFx0XHRncm91cDogJzVfem9vbScsXG5cdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gc3VwZXIuc2V0Wm9vbUxldmVsKGFjY2Vzc29yLCBnZXRab29tTGV2ZWwoZ2V0QWN0aXZlV2luZG93KCkpICsgMSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFpvb21PdXRBY3Rpb24gZXh0ZW5kcyBCYXNlWm9vbUFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnpvb21PdXQnLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0Li4ubG9jYWxpemUyKCd6b29tT3V0JywgXCJab29tIE91dFwiKSxcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVpvb21PdXQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZab29tIE91dFwiKSxcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuTWludXMsXG5cdFx0XHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5NaW51cywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLk51bXBhZFN1YnRyYWN0XSxcblx0XHRcdFx0bGludXg6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuTWludXMsXG5cdFx0XHRcdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLk51bXBhZFN1YnRyYWN0XVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLk1lbnViYXJBcHBlYXJhbmNlTWVudSxcblx0XHRcdFx0Z3JvdXA6ICc1X3pvb20nLFxuXHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHN1cGVyLnNldFpvb21MZXZlbChhY2Nlc3NvciwgZ2V0Wm9vbUxldmVsKGdldEFjdGl2ZVdpbmRvdygpKSAtIDEpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBab29tUmVzZXRBY3Rpb24gZXh0ZW5kcyBCYXNlWm9vbUFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnpvb21SZXNldCcsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5sb2NhbGl6ZTIoJ3pvb21SZXNldCcsIFwiUmVzZXQgWm9vbVwiKSxcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVpvb21SZXNldCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlJlc2V0IFpvb21cIiksXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLk51bXBhZDBcblx0XHRcdH0sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhckFwcGVhcmFuY2VNZW51LFxuXHRcdFx0XHRncm91cDogJzVfem9vbScsXG5cdFx0XHRcdG9yZGVyOiAzXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gc3VwZXIuc2V0Wm9vbUxldmVsKGFjY2Vzc29yLCB0cnVlKTtcblx0fVxufVxuXG5hYnN0cmFjdCBjbGFzcyBCYXNlU3dpdGNoV2luZG93IGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjbG9zZVdpbmRvd0FjdGlvbjogSVF1aWNrSW5wdXRCdXR0b24gPSB7XG5cdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5yZW1vdmVDbG9zZSksXG5cdFx0dG9vbHRpcDogbG9jYWxpemUoJ2Nsb3NlJywgXCJDbG9zZSBXaW5kb3dcIilcblx0fTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNsb3NlRGlydHlXaW5kb3dBY3Rpb246IElRdWlja0lucHV0QnV0dG9uID0ge1xuXHRcdGljb25DbGFzczogJ2RpcnR5LXdpbmRvdyAnICsgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uY2xvc2VEaXJ0eSksXG5cdFx0dG9vbHRpcDogbG9jYWxpemUoJ2Nsb3NlJywgXCJDbG9zZSBXaW5kb3dcIiksXG5cdFx0YWx3YXlzVmlzaWJsZTogdHJ1ZVxuXHR9O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY2xvc2VBY3RpdmVXaW5kb3dBY3Rpb246IElRdWlja0lucHV0QnV0dG9uID0ge1xuXHRcdGljb25DbGFzczogJ2FjdGl2ZS13aW5kb3cgJyArIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLndpbmRvd0FjdGl2ZSksXG5cdFx0dG9vbHRpcDogbG9jYWxpemUoJ2Nsb3NlQWN0aXZlJywgXCJDbG9zZSBBY3RpdmUgV2luZG93XCIpLFxuXHRcdGFsd2F5c1Zpc2libGU6IHRydWVcblx0fTtcblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgaXNRdWlja05hdmlnYXRlKCk6IGJvb2xlYW47XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBrZXliaW5kaW5nU2VydmljZSA9IGFjY2Vzc29yLmdldChJS2V5YmluZGluZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IG1vZGVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJTW9kZWxTZXJ2aWNlKTtcblx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdFx0Y29uc3QgbmF0aXZlSG9zdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5hdGl2ZUhvc3RTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGN1cnJlbnRXaW5kb3dJZCA9IGdldEFjdGl2ZVdpbmRvdygpLnZzY29kZVdpbmRvd0lkO1xuXG5cdFx0Y29uc3Qgd2luZG93cyA9IGF3YWl0IG5hdGl2ZUhvc3RTZXJ2aWNlLmdldFdpbmRvd3MoeyBpbmNsdWRlQXV4aWxpYXJ5V2luZG93czogdHJ1ZSB9KTtcblxuXHRcdGNvbnN0IG1haW5XaW5kb3dzID0gbmV3IFNldDxJT3BlbmVkTWFpbldpbmRvdz4oKTtcblx0XHRjb25zdCBtYXBNYWluV2luZG93VG9BdXhpbGlhcnlXaW5kb3dzID0gbmV3IE1hcDxudW1iZXIsIFNldDxJT3BlbmVkQXV4aWxpYXJ5V2luZG93Pj4oKTtcblx0XHRmb3IgKGNvbnN0IHdpbmRvdyBvZiB3aW5kb3dzKSB7XG5cdFx0XHRpZiAoaXNPcGVuZWRBdXhpbGlhcnlXaW5kb3cod2luZG93KSkge1xuXHRcdFx0XHRsZXQgYXV4aWxpYXJ5V2luZG93cyA9IG1hcE1haW5XaW5kb3dUb0F1eGlsaWFyeVdpbmRvd3MuZ2V0KHdpbmRvdy5wYXJlbnRJZCk7XG5cdFx0XHRcdGlmICghYXV4aWxpYXJ5V2luZG93cykge1xuXHRcdFx0XHRcdGF1eGlsaWFyeVdpbmRvd3MgPSBuZXcgU2V0PElPcGVuZWRBdXhpbGlhcnlXaW5kb3c+KCk7XG5cdFx0XHRcdFx0bWFwTWFpbldpbmRvd1RvQXV4aWxpYXJ5V2luZG93cy5zZXQod2luZG93LnBhcmVudElkLCBhdXhpbGlhcnlXaW5kb3dzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhdXhpbGlhcnlXaW5kb3dzLmFkZCh3aW5kb3cpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bWFpbldpbmRvd3MuYWRkKHdpbmRvdyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aW50ZXJmYWNlIElXaW5kb3dQaWNrSXRlbSBleHRlbmRzIElRdWlja1BpY2tJdGVtIHtcblx0XHRcdHJlYWRvbmx5IHdpbmRvd0lkOiBudW1iZXI7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gaXNXaW5kb3dQaWNrSXRlbShjYW5kaWRhdGU6IHVua25vd24pOiBjYW5kaWRhdGUgaXMgSVdpbmRvd1BpY2tJdGVtIHtcblx0XHRcdGNvbnN0IHdpbmRvd1BpY2tJdGVtID0gY2FuZGlkYXRlIGFzIElXaW5kb3dQaWNrSXRlbSB8IHVuZGVmaW5lZDtcblxuXHRcdFx0cmV0dXJuIHR5cGVvZiB3aW5kb3dQaWNrSXRlbT8ud2luZG93SWQgPT09ICdudW1iZXInO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBpY2tzOiBBcnJheTxRdWlja1BpY2tJbnB1dDxJV2luZG93UGlja0l0ZW0+PiA9IFtdO1xuXHRcdGZvciAoY29uc3Qgd2luZG93IG9mIG1haW5XaW5kb3dzKSB7XG5cdFx0XHRjb25zdCBhdXhpbGlhcnlXaW5kb3dzID0gbWFwTWFpbldpbmRvd1RvQXV4aWxpYXJ5V2luZG93cy5nZXQod2luZG93LmlkKTtcblx0XHRcdGlmIChtYXBNYWluV2luZG93VG9BdXhpbGlhcnlXaW5kb3dzLnNpemUgPiAwKSB7XG5cdFx0XHRcdHBpY2tzLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGF1eGlsaWFyeVdpbmRvd3MgPyBsb2NhbGl6ZSgnd2luZG93R3JvdXAnLCBcIndpbmRvdyBncm91cFwiKSA6IHVuZGVmaW5lZCB9KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSB3aW5kb3cuZmlsZW5hbWUgPyBVUkkuZmlsZSh3aW5kb3cuZmlsZW5hbWUpIDogaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyKHdpbmRvdy53b3Jrc3BhY2UpID8gd2luZG93LndvcmtzcGFjZS51cmkgOiBpc1dvcmtzcGFjZUlkZW50aWZpZXIod2luZG93LndvcmtzcGFjZSkgPyB3aW5kb3cud29ya3NwYWNlLmNvbmZpZ1BhdGggOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBmaWxlS2luZCA9IHdpbmRvdy5maWxlbmFtZSA/IEZpbGVLaW5kLkZJTEUgOiBpc1NpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIod2luZG93LndvcmtzcGFjZSkgPyBGaWxlS2luZC5GT0xERVIgOiBpc1dvcmtzcGFjZUlkZW50aWZpZXIod2luZG93LndvcmtzcGFjZSkgPyBGaWxlS2luZC5ST09UX0ZPTERFUiA6IEZpbGVLaW5kLkZJTEU7XG5cdFx0XHRjb25zdCBwaWNrOiBJV2luZG93UGlja0l0ZW0gPSB7XG5cdFx0XHRcdHdpbmRvd0lkOiB3aW5kb3cuaWQsXG5cdFx0XHRcdGxhYmVsOiB3aW5kb3cudGl0bGUsXG5cdFx0XHRcdGFyaWFMYWJlbDogd2luZG93LmRpcnR5ID8gbG9jYWxpemUoJ3dpbmRvd0RpcnR5QXJpYUxhYmVsJywgXCJ7MH0sIHdpbmRvdyB3aXRoIHVuc2F2ZWQgY2hhbmdlc1wiLCB3aW5kb3cudGl0bGUpIDogd2luZG93LnRpdGxlLFxuXHRcdFx0XHRpY29uQ2xhc3NlczogZ2V0SWNvbkNsYXNzZXMobW9kZWxTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2UsIHJlc291cmNlLCBmaWxlS2luZCksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAoY3VycmVudFdpbmRvd0lkID09PSB3aW5kb3cuaWQpID8gbG9jYWxpemUoJ2N1cnJlbnQnLCBcIkN1cnJlbnQgV2luZG93XCIpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRidXR0b25zOiB3aW5kb3cuZGlydHkgPyBbdGhpcy5jbG9zZURpcnR5V2luZG93QWN0aW9uXSA6IGN1cnJlbnRXaW5kb3dJZCA9PT0gd2luZG93LmlkID8gW3RoaXMuY2xvc2VBY3RpdmVXaW5kb3dBY3Rpb25dIDogW3RoaXMuY2xvc2VXaW5kb3dBY3Rpb25dXG5cdFx0XHR9O1xuXHRcdFx0cGlja3MucHVzaChwaWNrKTtcblxuXHRcdFx0aWYgKGF1eGlsaWFyeVdpbmRvd3MpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBhdXhpbGlhcnlXaW5kb3cgb2YgYXV4aWxpYXJ5V2luZG93cykge1xuXHRcdFx0XHRcdGNvbnN0IHBpY2s6IElXaW5kb3dQaWNrSXRlbSA9IHtcblx0XHRcdFx0XHRcdHdpbmRvd0lkOiBhdXhpbGlhcnlXaW5kb3cuaWQsXG5cdFx0XHRcdFx0XHRsYWJlbDogYXV4aWxpYXJ5V2luZG93LnRpdGxlLFxuXHRcdFx0XHRcdFx0aWNvbkNsYXNzZXM6IGdldEljb25DbGFzc2VzKG1vZGVsU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlLCBhdXhpbGlhcnlXaW5kb3cuZmlsZW5hbWUgPyBVUkkuZmlsZShhdXhpbGlhcnlXaW5kb3cuZmlsZW5hbWUpIDogdW5kZWZpbmVkLCBGaWxlS2luZC5GSUxFKSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAoY3VycmVudFdpbmRvd0lkID09PSBhdXhpbGlhcnlXaW5kb3cuaWQpID8gbG9jYWxpemUoJ2N1cnJlbnQnLCBcIkN1cnJlbnQgV2luZG93XCIpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0YnV0dG9uczogY3VycmVudFdpbmRvd0lkID09PSBhdXhpbGlhcnlXaW5kb3cuaWQgPyBbdGhpcy5jbG9zZUFjdGl2ZVdpbmRvd0FjdGlvbl0gOiBbdGhpcy5jbG9zZVdpbmRvd0FjdGlvbl1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHBpY2tzLnB1c2gocGljayk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBwaWNrID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljayhwaWNrcywge1xuXHRcdFx0Y29udGV4dEtleTogJ2luV2luZG93c1BpY2tlcicsXG5cdFx0XHRhY3RpdmVJdGVtOiAoKCkgPT4ge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHBpY2tzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgcGljayA9IHBpY2tzW2ldO1xuXHRcdFx0XHRcdGlmIChpc1dpbmRvd1BpY2tJdGVtKHBpY2spICYmIHBpY2sud2luZG93SWQgPT09IGN1cnJlbnRXaW5kb3dJZCkge1xuXHRcdFx0XHRcdFx0bGV0IG5leHRQaWNrID0gcGlja3NbaSArIDFdOyAvLyB0cnkgdG8gc2VsZWN0IG5leHQgd2luZG93IHVubGVzcyBpdCdzIGEgc2VwYXJhdG9yXG5cdFx0XHRcdFx0XHRpZiAoaXNXaW5kb3dQaWNrSXRlbShuZXh0UGljaykpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIG5leHRQaWNrO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRuZXh0UGljayA9IHBpY2tzW2kgKyAyXTsgLy8gb3RoZXJ3aXNlIHRyeSB0byBzZWxlY3QgdGhlIG5leHQgd2luZG93IGFmdGVyIHRoZSBzZXBhcmF0b3Jcblx0XHRcdFx0XHRcdGlmIChpc1dpbmRvd1BpY2tJdGVtKG5leHRQaWNrKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbmV4dFBpY2s7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0pKCksXG5cdFx0XHRwbGFjZUhvbGRlcjogbG9jYWxpemUoJ3N3aXRjaFdpbmRvd1BsYWNlSG9sZGVyJywgXCJTZWxlY3QgYSB3aW5kb3cgdG8gc3dpdGNoIHRvXCIpLFxuXHRcdFx0cXVpY2tOYXZpZ2F0ZTogdGhpcy5pc1F1aWNrTmF2aWdhdGUoKSA/IHsga2V5YmluZGluZ3M6IGtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmdzKHRoaXMuZGVzYy5pZCkgfSA6IHVuZGVmaW5lZCxcblx0XHRcdGhpZGVJbnB1dDogdGhpcy5pc1F1aWNrTmF2aWdhdGUoKSxcblx0XHRcdG9uRGlkVHJpZ2dlckl0ZW1CdXR0b246IGFzeW5jIGNvbnRleHQgPT4ge1xuXHRcdFx0XHRhd2FpdCBuYXRpdmVIb3N0U2VydmljZS5jbG9zZVdpbmRvdyh7IHRhcmdldFdpbmRvd0lkOiBjb250ZXh0Lml0ZW0ud2luZG93SWQgfSk7XG5cdFx0XHRcdGNvbnRleHQucmVtb3ZlSXRlbSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKHBpY2spIHtcblx0XHRcdG5hdGl2ZUhvc3RTZXJ2aWNlLmZvY3VzV2luZG93KHsgdGFyZ2V0V2luZG93SWQ6IHBpY2sud2luZG93SWQgfSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTd2l0Y2hXaW5kb3dBY3Rpb24gZXh0ZW5kcyBCYXNlU3dpdGNoV2luZG93IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uc3dpdGNoV2luZG93Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3N3aXRjaFdpbmRvdycsICdTd2l0Y2ggV2luZG93Li4uJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IDAsXG5cdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuS2V5VyB9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgaXNRdWlja05hdmlnYXRlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUXVpY2tTd2l0Y2hXaW5kb3dBY3Rpb24gZXh0ZW5kcyBCYXNlU3dpdGNoV2luZG93IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ucXVpY2tTd2l0Y2hXaW5kb3cnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncXVpY2tTd2l0Y2hXaW5kb3cnLCAnUXVpY2sgU3dpdGNoIFdpbmRvdy4uLicpLFxuXHRcdFx0ZjE6IGZhbHNlIC8vIGhpZGUgcXVpY2sgcGlja2VycyBmcm9tIGNvbW1hbmQgcGFsZXR0ZSB0byBub3QgY29uZnVzZSB3aXRoIHRoZSBvdGhlciBlbnRyeSB0aGF0IHNob3dzIGEgaW5wdXQgZmllbGRcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBpc1F1aWNrTmF2aWdhdGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFN3aXRjaFRvTWFpbldpbmRvd0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5zd2l0Y2hUb01haW5XaW5kb3cnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc3dpdGNoVG9NYWluV2luZG93JywgXCJTd2l0Y2ggdG8gTWFpbiBXaW5kb3dcIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBuYXRpdmVIb3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJTmF0aXZlSG9zdFNlcnZpY2UpO1xuXHRcdHJldHVybiBuYXRpdmVIb3N0U2VydmljZS5mb2N1c1dpbmRvdyh7IHRhcmdldFdpbmRvd0lkOiBtYWluV2luZG93LnZzY29kZVdpbmRvd0lkIH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBGb2N1c1dpbmRvd0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzV2luZG93JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRm9jdXNXaW5kb3dBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdmb2N1c1dpbmRvdycsIFwiRm9jdXMgV2luZG93XCIpLFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElIb3N0U2VydmljZSk7XG5cblx0XHQvLyBCcmluZyB0aGUgY3VycmVudCB3aW5kb3cgdG8gdGhlIGZvcmVncm91bmQgYW5kIGZvY3VzIGl0LiBgRm9jdXNNb2RlLkZvcmNlYCBpcyB1c2VkIGJlY2F1c2Vcblx0XHQvLyB0aGUgYXBwbGljYXRpb24gbWF5IG5vdCBiZSBhY3RpdmUgKGZvciBleGFtcGxlIHdoZW4gdGhpcyBydW5zIGZyb20gYSBzeXN0ZW0td2lkZSBrZXliaW5kaW5nXG5cdFx0Ly8gd2hpbGUgYW5vdGhlciBhcHAgb3ducyBPUyBmb2N1cykuIFRoaXMgbWFrZXMgaXQgdXNhYmxlIGFzIHRoZSBmaXJzdCBzdGVwIG9mIGEgYHJ1bkNvbW1hbmRzYFxuXHRcdC8vIGNoYWluIHRoYXQgcmV2ZWFscyB0aGUgd2luZG93IGJlZm9yZSBydW5uaW5nIGEgY29tbWFuZCB3aGljaCBzdXJmYWNlcyBVSSBpbiBpdCAoZS5nLiBRdWlja1xuXHRcdC8vIE9wZW4pLlxuXHRcdGF3YWl0IGhvc3RTZXJ2aWNlLmZvY3VzKGdldEFjdGl2ZVdpbmRvdygpLCB7IG1vZGU6IEZvY3VzTW9kZS5Gb3JjZSB9KTtcblx0fVxufVxuXG5mdW5jdGlvbiBjYW5SdW5OYXRpdmVUYWJzSGFuZGxlcihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IGJvb2xlYW4ge1xuXHRpZiAoIWlzTWFjaW50b3NoKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0cmV0dXJuIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHVua25vd24+KCd3aW5kb3cubmF0aXZlVGFicycpID09PSB0cnVlO1xufVxuXG5leHBvcnQgY29uc3QgTmV3V2luZG93VGFiSGFuZGxlcjogSUNvbW1hbmRIYW5kbGVyID0gZnVuY3Rpb24gKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdGlmICghY2FuUnVuTmF0aXZlVGFic0hhbmRsZXIoYWNjZXNzb3IpKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cmV0dXJuIGFjY2Vzc29yLmdldChJTmF0aXZlSG9zdFNlcnZpY2UpLm5ld1dpbmRvd1RhYigpO1xufTtcblxuZXhwb3J0IGNvbnN0IFNob3dQcmV2aW91c1dpbmRvd1RhYkhhbmRsZXI6IElDb21tYW5kSGFuZGxlciA9IGZ1bmN0aW9uIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRpZiAoIWNhblJ1bk5hdGl2ZVRhYnNIYW5kbGVyKGFjY2Vzc29yKSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdHJldHVybiBhY2Nlc3Nvci5nZXQoSU5hdGl2ZUhvc3RTZXJ2aWNlKS5zaG93UHJldmlvdXNXaW5kb3dUYWIoKTtcbn07XG5cbmV4cG9ydCBjb25zdCBTaG93TmV4dFdpbmRvd1RhYkhhbmRsZXI6IElDb21tYW5kSGFuZGxlciA9IGZ1bmN0aW9uIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRpZiAoIWNhblJ1bk5hdGl2ZVRhYnNIYW5kbGVyKGFjY2Vzc29yKSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdHJldHVybiBhY2Nlc3Nvci5nZXQoSU5hdGl2ZUhvc3RTZXJ2aWNlKS5zaG93TmV4dFdpbmRvd1RhYigpO1xufTtcblxuZXhwb3J0IGNvbnN0IE1vdmVXaW5kb3dUYWJUb05ld1dpbmRvd0hhbmRsZXI6IElDb21tYW5kSGFuZGxlciA9IGZ1bmN0aW9uIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRpZiAoIWNhblJ1bk5hdGl2ZVRhYnNIYW5kbGVyKGFjY2Vzc29yKSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdHJldHVybiBhY2Nlc3Nvci5nZXQoSU5hdGl2ZUhvc3RTZXJ2aWNlKS5tb3ZlV2luZG93VGFiVG9OZXdXaW5kb3coKTtcbn07XG5cbmV4cG9ydCBjb25zdCBNZXJnZVdpbmRvd1RhYnNIYW5kbGVySGFuZGxlcjogSUNvbW1hbmRIYW5kbGVyID0gZnVuY3Rpb24gKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdGlmICghY2FuUnVuTmF0aXZlVGFic0hhbmRsZXIoYWNjZXNzb3IpKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cmV0dXJuIGFjY2Vzc29yLmdldChJTmF0aXZlSG9zdFNlcnZpY2UpLm1lcmdlQWxsV2luZG93VGFicygpO1xufTtcblxuZXhwb3J0IGNvbnN0IFRvZ2dsZVdpbmRvd1RhYnNCYXJIYW5kbGVyOiBJQ29tbWFuZEhhbmRsZXIgPSBmdW5jdGlvbiAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0aWYgKCFjYW5SdW5OYXRpdmVUYWJzSGFuZGxlcihhY2Nlc3NvcikpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRyZXR1cm4gYWNjZXNzb3IuZ2V0KElOYXRpdmVIb3N0U2VydmljZSkudG9nZ2xlV2luZG93VGFic0JhcigpO1xufTtcblxuZXhwb3J0IGNsYXNzIFRvZ2dsZVdpbmRvd0Fsd2F5c09uVG9wQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlV2luZG93QWx3YXlzT25Ub3AnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUb2dnbGVXaW5kb3dBbHdheXNPblRvcEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3RvZ2dsZVdpbmRvd0Fsd2F5c09uVG9wJywgXCJUb2dnbGUgV2luZG93IEFsd2F5cyBvbiBUb3BcIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogSXNBdXhpbGlhcnlXaW5kb3dGb2N1c2VkQ29udGV4dFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbmF0aXZlSG9zdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5hdGl2ZUhvc3RTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IGdldEFjdGl2ZVdpbmRvdygpO1xuXHRcdGlmICghaXNBdXhpbGlhcnlXaW5kb3codGFyZ2V0V2luZG93LndpbmRvdykpIHtcblx0XHRcdHJldHVybjsgLy8gQ3VycmVudGx5LCB3ZSBvbmx5IHN1cHBvcnQgdG9nZ2xpbmcgYWx3YXlzIG9uIHRvcCBmb3IgYXV4aWxpYXJ5IHdpbmRvd3Ncblx0XHR9XG5cblx0XHRyZXR1cm4gbmF0aXZlSG9zdFNlcnZpY2UudG9nZ2xlV2luZG93QWx3YXlzT25Ub3AoeyB0YXJnZXRXaW5kb3dJZDogZ2V0QWN0aXZlV2luZG93KCkudnNjb2RlV2luZG93SWQgfSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEVuYWJsZVdpbmRvd0Fsd2F5c09uVG9wQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZW5hYmxlV2luZG93QWx3YXlzT25Ub3AnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBFbmFibGVXaW5kb3dBbHdheXNPblRvcEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZW5hYmxlV2luZG93QWx3YXlzT25Ub3AnLCBcIlR1cm4gT24gQWx3YXlzIG9uIFRvcFwiKSxcblx0XHRcdGljb246IENvZGljb24ucGluLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkxheW91dENvbnRyb2xNZW51LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNXaW5kb3dBbHdheXNPblRvcENvbnRleHQudG9OZWdhdGVkKCksIElzQXV4aWxpYXJ5V2luZG93Q29udGV4dCksXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBuYXRpdmVIb3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJTmF0aXZlSG9zdFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZ2V0QWN0aXZlV2luZG93KCk7XG5cdFx0aWYgKCFpc0F1eGlsaWFyeVdpbmRvdyh0YXJnZXRXaW5kb3cud2luZG93KSkge1xuXHRcdFx0cmV0dXJuOyAvLyBDdXJyZW50bHksIHdlIG9ubHkgc3VwcG9ydCB0b2dnbGluZyBhbHdheXMgb24gdG9wIGZvciBhdXhpbGlhcnkgd2luZG93c1xuXHRcdH1cblxuXHRcdHJldHVybiBuYXRpdmVIb3N0U2VydmljZS5zZXRXaW5kb3dBbHdheXNPblRvcCh0cnVlLCB7IHRhcmdldFdpbmRvd0lkOiB0YXJnZXRXaW5kb3cudnNjb2RlV2luZG93SWQgfSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERpc2FibGVXaW5kb3dBbHdheXNPblRvcEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmRpc2FibGVXaW5kb3dBbHdheXNPblRvcCc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IERpc2FibGVXaW5kb3dBbHdheXNPblRvcEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZGlzYWJsZVdpbmRvd0Fsd2F5c09uVG9wJywgXCJUdXJuIE9mZiBBbHdheXMgb24gVG9wXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5waW5uZWQsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTGF5b3V0Q29udHJvbE1lbnUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc1dpbmRvd0Fsd2F5c09uVG9wQ29udGV4dCwgSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0KSxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbidcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG5hdGl2ZUhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOYXRpdmVIb3N0U2VydmljZSk7XG5cblx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBnZXRBY3RpdmVXaW5kb3coKTtcblx0XHRpZiAoIWlzQXV4aWxpYXJ5V2luZG93KHRhcmdldFdpbmRvdy53aW5kb3cpKSB7XG5cdFx0XHRyZXR1cm47IC8vIEN1cnJlbnRseSwgd2Ugb25seSBzdXBwb3J0IHRvZ2dsaW5nIGFsd2F5cyBvbiB0b3AgZm9yIGF1eGlsaWFyeSB3aW5kb3dzXG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5hdGl2ZUhvc3RTZXJ2aWNlLnNldFdpbmRvd0Fsd2F5c09uVG9wKGZhbHNlLCB7IHRhcmdldFdpbmRvd0lkOiB0YXJnZXRXaW5kb3cudnNjb2RlV2luZG93SWQgfSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU87QUFDUCxT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
