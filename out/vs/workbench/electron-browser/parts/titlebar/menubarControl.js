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
import { Separator } from "../../../../base/common/actions.js";
import { IMenuService, SubmenuItemAction, MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IWorkspacesService } from "../../../../platform/workspaces/common/workspaces.js";
import { isMacintosh } from "../../../../base/common/platform.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { INativeWorkbenchEnvironmentService } from "../../../services/environment/electron-browser/environmentService.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IUpdateService } from "../../../../platform/update/common/update.js";
import { MenubarControl } from "../../../browser/parts/titlebar/menubarControl.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { IMenubarService } from "../../../../platform/menubar/electron-browser/menubar.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { OpenRecentAction } from "../../../browser/actions/windowActions.js";
import { isICommandActionToggleInfo } from "../../../../platform/action/common/action.js";
import { getFlatContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
let NativeMenubarControl = class extends MenubarControl {
  constructor(menuService, workspacesService, contextKeyService, keybindingService, configurationService, labelService, updateService, storageService, notificationService, preferencesService, environmentService, accessibilityService, menubarService, hostService, nativeHostService, commandService) {
    super(menuService, workspacesService, contextKeyService, keybindingService, configurationService, labelService, updateService, storageService, notificationService, preferencesService, environmentService, accessibilityService, hostService, commandService);
    this.menubarService = menubarService;
    this.nativeHostService = nativeHostService;
    (async () => {
      this.recentlyOpened = await this.workspacesService.getRecentlyOpened();
      this.doUpdateMenubar();
    })();
    this.registerListeners();
  }
  setupMainMenu() {
    super.setupMainMenu();
    for (const topLevelMenuName of Object.keys(this.topLevelTitles)) {
      const menu = this.menus[topLevelMenuName];
      if (menu) {
        this.mainMenuDisposables.add(menu.onDidChange(() => this.updateMenubar()));
      }
    }
  }
  doUpdateMenubar() {
    if (!this.hostService.hasFocus) {
      return;
    }
    const menubarData = { menus: {}, keybindings: {} };
    if (this.getMenubarMenus(menubarData)) {
      this.menubarService.updateMenubar(this.nativeHostService.windowId, menubarData);
    }
  }
  getMenubarMenus(menubarData) {
    if (!menubarData) {
      return false;
    }
    menubarData.keybindings = this.getAdditionalKeybindings();
    for (const topLevelMenuName of Object.keys(this.topLevelTitles)) {
      const menu = this.menus[topLevelMenuName];
      if (menu) {
        const menubarMenu = { items: [] };
        const menuActions = getFlatContextMenuActions(menu.getActions({ shouldForwardArgs: true }));
        this.populateMenuItems(menuActions, menubarMenu, menubarData.keybindings);
        if (menubarMenu.items.length === 0) {
          return false;
        }
        menubarData.menus[topLevelMenuName] = menubarMenu;
      }
    }
    return true;
  }
  populateMenuItems(menuActions, menuToPopulate, keybindings) {
    for (const menuItem of menuActions) {
      if (menuItem instanceof Separator) {
        menuToPopulate.items.push({ id: "vscode.menubar.separator" });
      } else if (menuItem instanceof MenuItemAction || menuItem instanceof SubmenuItemAction) {
        const title = typeof menuItem.item.title === "string" ? menuItem.item.title : menuItem.item.title.mnemonicTitle ?? menuItem.item.title.value;
        if (menuItem instanceof SubmenuItemAction) {
          const submenu = { items: [] };
          this.populateMenuItems(menuItem.actions, submenu, keybindings);
          if (submenu.items.length > 0) {
            const menubarSubmenuItem = {
              id: menuItem.id,
              label: title,
              submenu
            };
            menuToPopulate.items.push(menubarSubmenuItem);
          }
        } else {
          if (menuItem.id === OpenRecentAction.ID) {
            const actions = this.getOpenRecentActions().map(this.transformOpenRecentAction);
            menuToPopulate.items.push(...actions);
          }
          const menubarMenuItem = {
            id: menuItem.id,
            label: title
          };
          if (isICommandActionToggleInfo(menuItem.item.toggled)) {
            menubarMenuItem.label = menuItem.item.toggled.mnemonicTitle ?? menuItem.item.toggled.title ?? title;
          }
          if (menuItem.checked) {
            menubarMenuItem.checked = true;
          }
          if (!menuItem.enabled) {
            menubarMenuItem.enabled = false;
          }
          keybindings[menuItem.id] = this.getMenubarKeybinding(menuItem.id);
          menuToPopulate.items.push(menubarMenuItem);
        }
      }
    }
  }
  transformOpenRecentAction(action) {
    if (action instanceof Separator) {
      return { id: "vscode.menubar.separator" };
    }
    return {
      id: action.id,
      uri: action.uri,
      remoteAuthority: action.remoteAuthority,
      enabled: action.enabled,
      label: action.label
    };
  }
  getAdditionalKeybindings() {
    const keybindings = {};
    if (isMacintosh) {
      const keybinding = this.getMenubarKeybinding("workbench.action.quit");
      if (keybinding) {
        keybindings["workbench.action.quit"] = keybinding;
      }
    }
    return keybindings;
  }
  getMenubarKeybinding(id) {
    const binding = this.keybindingService.lookupKeybinding(id);
    if (!binding) {
      return void 0;
    }
    const electronAccelerator = binding.getElectronAccelerator();
    if (electronAccelerator) {
      return { label: electronAccelerator, userSettingsLabel: binding.getUserSettingsLabel() ?? void 0 };
    }
    const acceleratorLabel = binding.getLabel();
    if (acceleratorLabel) {
      return { label: acceleratorLabel, isNative: false, userSettingsLabel: binding.getUserSettingsLabel() ?? void 0 };
    }
    return void 0;
  }
};
NativeMenubarControl = __decorateClass([
  __decorateParam(0, IMenuService),
  __decorateParam(1, IWorkspacesService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, ILabelService),
  __decorateParam(6, IUpdateService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, INotificationService),
  __decorateParam(9, IPreferencesService),
  __decorateParam(10, INativeWorkbenchEnvironmentService),
  __decorateParam(11, IAccessibilityService),
  __decorateParam(12, IMenubarService),
  __decorateParam(13, IHostService),
  __decorateParam(14, INativeHostService),
  __decorateParam(15, ICommandService)
], NativeMenubarControl);
export {
  NativeMenubarControl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGVsZWN0cm9uLWJyb3dzZXJcXHBhcnRzXFx0aXRsZWJhclxcbWVudWJhckNvbnRyb2wudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJQWN0aW9uLCBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElNZW51U2VydmljZSwgU3VibWVudUl0ZW1BY3Rpb24sIE1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZXMvY29tbW9uL3dvcmtzcGFjZXMuanMnO1xuaW1wb3J0IHsgaXNNYWNpbnRvc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2VsZWN0cm9uLWJyb3dzZXIvZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElVcGRhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXBkYXRlL2NvbW1vbi91cGRhdGUuanMnO1xuaW1wb3J0IHsgSU9wZW5SZWNlbnRBY3Rpb24sIE1lbnViYXJDb250cm9sIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy90aXRsZWJhci9tZW51YmFyQ29udHJvbC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElNZW51YmFyRGF0YSwgSU1lbnViYXJNZW51LCBJTWVudWJhcktleWJpbmRpbmcsIElNZW51YmFyTWVudUl0ZW1TdWJtZW51LCBJTWVudWJhck1lbnVJdGVtQWN0aW9uLCBNZW51YmFyTWVudUl0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tZW51YmFyL2NvbW1vbi9tZW51YmFyLmpzJztcbmltcG9ydCB7IElNZW51YmFyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21lbnViYXIvZWxlY3Ryb24tYnJvd3Nlci9tZW51YmFyLmpzJztcbmltcG9ydCB7IElOYXRpdmVIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9jb21tb24vbmF0aXZlLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IElQcmVmZXJlbmNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IE9wZW5SZWNlbnRBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FjdGlvbnMvd2luZG93QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBpc0lDb21tYW5kQWN0aW9uVG9nZ2xlSW5mbyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uLmpzJztcbmltcG9ydCB7IGdldEZsYXRDb250ZXh0TWVudUFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuXG5leHBvcnQgY2xhc3MgTmF0aXZlTWVudWJhckNvbnRyb2wgZXh0ZW5kcyBNZW51YmFyQ29udHJvbCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNZW51U2VydmljZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlc1NlcnZpY2Ugd29ya3NwYWNlc1NlcnZpY2U6IElXb3Jrc3BhY2VzU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElVcGRhdGVTZXJ2aWNlIHVwZGF0ZVNlcnZpY2U6IElVcGRhdGVTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2Ugbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElQcmVmZXJlbmNlc1NlcnZpY2UgcHJlZmVyZW5jZXNTZXJ2aWNlOiBJUHJlZmVyZW5jZXNTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSU5hdGl2ZVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElNZW51YmFyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnViYXJTZXJ2aWNlOiBJTWVudWJhclNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBuYXRpdmVIb3N0U2VydmljZTogSU5hdGl2ZUhvc3RTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIobWVudVNlcnZpY2UsIHdvcmtzcGFjZXNTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBsYWJlbFNlcnZpY2UsIHVwZGF0ZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlLCBwcmVmZXJlbmNlc1NlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgYWNjZXNzaWJpbGl0eVNlcnZpY2UsIGhvc3RTZXJ2aWNlLCBjb21tYW5kU2VydmljZSk7XG5cblx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGhpcy5yZWNlbnRseU9wZW5lZCA9IGF3YWl0IHRoaXMud29ya3NwYWNlc1NlcnZpY2UuZ2V0UmVjZW50bHlPcGVuZWQoKTtcblxuXHRcdFx0dGhpcy5kb1VwZGF0ZU1lbnViYXIoKTtcblx0XHR9KSgpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHNldHVwTWFpbk1lbnUoKTogdm9pZCB7XG5cdFx0c3VwZXIuc2V0dXBNYWluTWVudSgpO1xuXG5cdFx0Zm9yIChjb25zdCB0b3BMZXZlbE1lbnVOYW1lIG9mIE9iamVjdC5rZXlzKHRoaXMudG9wTGV2ZWxUaXRsZXMpKSB7XG5cdFx0XHRjb25zdCBtZW51ID0gdGhpcy5tZW51c1t0b3BMZXZlbE1lbnVOYW1lXTtcblx0XHRcdGlmIChtZW51KSB7XG5cdFx0XHRcdHRoaXMubWFpbk1lbnVEaXNwb3NhYmxlcy5hZGQobWVudS5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLnVwZGF0ZU1lbnViYXIoKSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBkb1VwZGF0ZU1lbnViYXIoKTogdm9pZCB7XG5cdFx0Ly8gU2luY2UgdGhlIG5hdGl2ZSBtZW51YmFyIGlzIHNoYXJlZCBiZXR3ZWVuIHdpbmRvd3MgKG1haW4gcHJvY2Vzcylcblx0XHQvLyBvbmx5IGFsbG93IHRoZSBmb2N1c2VkIHdpbmRvdyB0byB1cGRhdGUgdGhlIG1lbnViYXJcblx0XHRpZiAoIXRoaXMuaG9zdFNlcnZpY2UuaGFzRm9jdXMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTZW5kIG1lbnVzIHRvIG1haW4gcHJvY2VzcyB0byBiZSByZW5kZXJlZCBieSBFbGVjdHJvblxuXHRcdGNvbnN0IG1lbnViYXJEYXRhID0geyBtZW51czoge30sIGtleWJpbmRpbmdzOiB7fSB9O1xuXHRcdGlmICh0aGlzLmdldE1lbnViYXJNZW51cyhtZW51YmFyRGF0YSkpIHtcblx0XHRcdHRoaXMubWVudWJhclNlcnZpY2UudXBkYXRlTWVudWJhcih0aGlzLm5hdGl2ZUhvc3RTZXJ2aWNlLndpbmRvd0lkLCBtZW51YmFyRGF0YSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRNZW51YmFyTWVudXMobWVudWJhckRhdGE6IElNZW51YmFyRGF0YSk6IGJvb2xlYW4ge1xuXHRcdGlmICghbWVudWJhckRhdGEpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRtZW51YmFyRGF0YS5rZXliaW5kaW5ncyA9IHRoaXMuZ2V0QWRkaXRpb25hbEtleWJpbmRpbmdzKCk7XG5cdFx0Zm9yIChjb25zdCB0b3BMZXZlbE1lbnVOYW1lIG9mIE9iamVjdC5rZXlzKHRoaXMudG9wTGV2ZWxUaXRsZXMpKSB7XG5cdFx0XHRjb25zdCBtZW51ID0gdGhpcy5tZW51c1t0b3BMZXZlbE1lbnVOYW1lXTtcblx0XHRcdGlmIChtZW51KSB7XG5cdFx0XHRcdGNvbnN0IG1lbnViYXJNZW51OiBJTWVudWJhck1lbnUgPSB7IGl0ZW1zOiBbXSB9O1xuXHRcdFx0XHRjb25zdCBtZW51QWN0aW9ucyA9IGdldEZsYXRDb250ZXh0TWVudUFjdGlvbnMobWVudS5nZXRBY3Rpb25zKHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSkpO1xuXHRcdFx0XHR0aGlzLnBvcHVsYXRlTWVudUl0ZW1zKG1lbnVBY3Rpb25zLCBtZW51YmFyTWVudSwgbWVudWJhckRhdGEua2V5YmluZGluZ3MpO1xuXHRcdFx0XHRpZiAobWVudWJhck1lbnUuaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBNZW51cyBhcmUgaW5jb21wbGV0ZVxuXHRcdFx0XHR9XG5cdFx0XHRcdG1lbnViYXJEYXRhLm1lbnVzW3RvcExldmVsTWVudU5hbWVdID0gbWVudWJhck1lbnU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIHBvcHVsYXRlTWVudUl0ZW1zKG1lbnVBY3Rpb25zOiByZWFkb25seSBJQWN0aW9uW10sIG1lbnVUb1BvcHVsYXRlOiBJTWVudWJhck1lbnUsIGtleWJpbmRpbmdzOiB7IFtpZDogc3RyaW5nXTogSU1lbnViYXJLZXliaW5kaW5nIHwgdW5kZWZpbmVkIH0pIHtcblx0XHRmb3IgKGNvbnN0IG1lbnVJdGVtIG9mIG1lbnVBY3Rpb25zKSB7XG5cdFx0XHRpZiAobWVudUl0ZW0gaW5zdGFuY2VvZiBTZXBhcmF0b3IpIHtcblx0XHRcdFx0bWVudVRvUG9wdWxhdGUuaXRlbXMucHVzaCh7IGlkOiAndnNjb2RlLm1lbnViYXIuc2VwYXJhdG9yJyB9KTtcblx0XHRcdH0gZWxzZSBpZiAobWVudUl0ZW0gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbiB8fCBtZW51SXRlbSBpbnN0YW5jZW9mIFN1Ym1lbnVJdGVtQWN0aW9uKSB7XG5cblx0XHRcdFx0Ly8gdXNlIG1uZW1vbmljVGl0bGUgd2hlbmV2ZXIgcG9zc2libGVcblx0XHRcdFx0Y29uc3QgdGl0bGUgPSB0eXBlb2YgbWVudUl0ZW0uaXRlbS50aXRsZSA9PT0gJ3N0cmluZydcblx0XHRcdFx0XHQ/IG1lbnVJdGVtLml0ZW0udGl0bGVcblx0XHRcdFx0XHQ6IG1lbnVJdGVtLml0ZW0udGl0bGUubW5lbW9uaWNUaXRsZSA/PyBtZW51SXRlbS5pdGVtLnRpdGxlLnZhbHVlO1xuXG5cdFx0XHRcdGlmIChtZW51SXRlbSBpbnN0YW5jZW9mIFN1Ym1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3VibWVudSA9IHsgaXRlbXM6IFtdIH07XG5cblx0XHRcdFx0XHR0aGlzLnBvcHVsYXRlTWVudUl0ZW1zKG1lbnVJdGVtLmFjdGlvbnMsIHN1Ym1lbnUsIGtleWJpbmRpbmdzKTtcblxuXHRcdFx0XHRcdGlmIChzdWJtZW51Lml0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdGNvbnN0IG1lbnViYXJTdWJtZW51SXRlbTogSU1lbnViYXJNZW51SXRlbVN1Ym1lbnUgPSB7XG5cdFx0XHRcdFx0XHRcdGlkOiBtZW51SXRlbS5pZCxcblx0XHRcdFx0XHRcdFx0bGFiZWw6IHRpdGxlLFxuXHRcdFx0XHRcdFx0XHRzdWJtZW51XG5cdFx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0XHRtZW51VG9Qb3B1bGF0ZS5pdGVtcy5wdXNoKG1lbnViYXJTdWJtZW51SXRlbSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmIChtZW51SXRlbS5pZCA9PT0gT3BlblJlY2VudEFjdGlvbi5JRCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgYWN0aW9ucyA9IHRoaXMuZ2V0T3BlblJlY2VudEFjdGlvbnMoKS5tYXAodGhpcy50cmFuc2Zvcm1PcGVuUmVjZW50QWN0aW9uKTtcblx0XHRcdFx0XHRcdG1lbnVUb1BvcHVsYXRlLml0ZW1zLnB1c2goLi4uYWN0aW9ucyk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgbWVudWJhck1lbnVJdGVtOiBJTWVudWJhck1lbnVJdGVtQWN0aW9uID0ge1xuXHRcdFx0XHRcdFx0aWQ6IG1lbnVJdGVtLmlkLFxuXHRcdFx0XHRcdFx0bGFiZWw6IHRpdGxlXG5cdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdGlmIChpc0lDb21tYW5kQWN0aW9uVG9nZ2xlSW5mbyhtZW51SXRlbS5pdGVtLnRvZ2dsZWQpKSB7XG5cdFx0XHRcdFx0XHRtZW51YmFyTWVudUl0ZW0ubGFiZWwgPSBtZW51SXRlbS5pdGVtLnRvZ2dsZWQubW5lbW9uaWNUaXRsZSA/PyBtZW51SXRlbS5pdGVtLnRvZ2dsZWQudGl0bGUgPz8gdGl0bGU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKG1lbnVJdGVtLmNoZWNrZWQpIHtcblx0XHRcdFx0XHRcdG1lbnViYXJNZW51SXRlbS5jaGVja2VkID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoIW1lbnVJdGVtLmVuYWJsZWQpIHtcblx0XHRcdFx0XHRcdG1lbnViYXJNZW51SXRlbS5lbmFibGVkID0gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0a2V5YmluZGluZ3NbbWVudUl0ZW0uaWRdID0gdGhpcy5nZXRNZW51YmFyS2V5YmluZGluZyhtZW51SXRlbS5pZCk7XG5cdFx0XHRcdFx0bWVudVRvUG9wdWxhdGUuaXRlbXMucHVzaChtZW51YmFyTWVudUl0ZW0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB0cmFuc2Zvcm1PcGVuUmVjZW50QWN0aW9uKGFjdGlvbjogU2VwYXJhdG9yIHwgSU9wZW5SZWNlbnRBY3Rpb24pOiBNZW51YmFyTWVudUl0ZW0ge1xuXHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBTZXBhcmF0b3IpIHtcblx0XHRcdHJldHVybiB7IGlkOiAndnNjb2RlLm1lbnViYXIuc2VwYXJhdG9yJyB9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogYWN0aW9uLmlkLFxuXHRcdFx0dXJpOiBhY3Rpb24udXJpLFxuXHRcdFx0cmVtb3RlQXV0aG9yaXR5OiBhY3Rpb24ucmVtb3RlQXV0aG9yaXR5LFxuXHRcdFx0ZW5hYmxlZDogYWN0aW9uLmVuYWJsZWQsXG5cdFx0XHRsYWJlbDogYWN0aW9uLmxhYmVsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWRkaXRpb25hbEtleWJpbmRpbmdzKCk6IHsgW2lkOiBzdHJpbmddOiBJTWVudWJhcktleWJpbmRpbmcgfSB7XG5cdFx0Y29uc3Qga2V5YmluZGluZ3M6IHsgW2lkOiBzdHJpbmddOiBJTWVudWJhcktleWJpbmRpbmcgfSA9IHt9O1xuXHRcdGlmIChpc01hY2ludG9zaCkge1xuXHRcdFx0Y29uc3Qga2V5YmluZGluZyA9IHRoaXMuZ2V0TWVudWJhcktleWJpbmRpbmcoJ3dvcmtiZW5jaC5hY3Rpb24ucXVpdCcpO1xuXHRcdFx0aWYgKGtleWJpbmRpbmcpIHtcblx0XHRcdFx0a2V5YmluZGluZ3NbJ3dvcmtiZW5jaC5hY3Rpb24ucXVpdCddID0ga2V5YmluZGluZztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ga2V5YmluZGluZ3M7XG5cdH1cblxuXHRwcml2YXRlIGdldE1lbnViYXJLZXliaW5kaW5nKGlkOiBzdHJpbmcpOiBJTWVudWJhcktleWJpbmRpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGJpbmRpbmcgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoaWQpO1xuXHRcdGlmICghYmluZGluZykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBmaXJzdCB0cnkgdG8gcmVzb2x2ZSBhIG5hdGl2ZSBhY2NlbGVyYXRvclxuXHRcdGNvbnN0IGVsZWN0cm9uQWNjZWxlcmF0b3IgPSBiaW5kaW5nLmdldEVsZWN0cm9uQWNjZWxlcmF0b3IoKTtcblx0XHRpZiAoZWxlY3Ryb25BY2NlbGVyYXRvcikge1xuXHRcdFx0cmV0dXJuIHsgbGFiZWw6IGVsZWN0cm9uQWNjZWxlcmF0b3IsIHVzZXJTZXR0aW5nc0xhYmVsOiBiaW5kaW5nLmdldFVzZXJTZXR0aW5nc0xhYmVsKCkgPz8gdW5kZWZpbmVkIH07XG5cdFx0fVxuXG5cdFx0Ly8gd2UgbmVlZCB0aGlzIGZhbGxiYWNrIHRvIHN1cHBvcnQga2V5YmluZGluZ3MgdGhhdCBjYW5ub3Qgc2hvdyBpbiBlbGVjdHJvbiBtZW51cyAoZS5nLiBjaG9yZHMpXG5cdFx0Y29uc3QgYWNjZWxlcmF0b3JMYWJlbCA9IGJpbmRpbmcuZ2V0TGFiZWwoKTtcblx0XHRpZiAoYWNjZWxlcmF0b3JMYWJlbCkge1xuXHRcdFx0cmV0dXJuIHsgbGFiZWw6IGFjY2VsZXJhdG9yTGFiZWwsIGlzTmF0aXZlOiBmYWxzZSwgdXNlclNldHRpbmdzTGFiZWw6IGJpbmRpbmcuZ2V0VXNlclNldHRpbmdzTGFiZWwoKSA/PyB1bmRlZmluZWQgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQWtCLGlCQUFpQjtBQUNuQyxTQUFTLGNBQWMsbUJBQW1CLHNCQUFzQjtBQUNoRSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDBDQUEwQztBQUNuRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHNCQUFzQjtBQUMvQixTQUE0QixzQkFBc0I7QUFDbEQsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxrQ0FBa0M7QUFDM0Ms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
