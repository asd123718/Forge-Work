import { localize, localize2 } from "../../../nls.js";
import { MenuId, MenuRegistry, registerAction2, Action2 } from "../../../platform/actions/common/actions.js";
import { Categories } from "../../../platform/action/common/actionCommonCategories.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { alert } from "../../../base/browser/ui/aria/aria.js";
import { EditorActionsLocation, EditorTabsMode, IWorkbenchLayoutService, LayoutSettings, Parts, Position, ZenModeSettings, positionToString } from "../../services/layout/browser/layoutService.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { KeyMod, KeyCode } from "../../../base/common/keyCodes.js";
import { isWindows, isLinux, isWeb, isMacintosh, isNative } from "../../../base/common/platform.js";
import { IsMacNativeContext } from "../../../platform/contextkey/common/contextkeys.js";
import { KeybindingWeight } from "../../../platform/keybinding/common/keybindingsRegistry.js";
import { ContextKeyExpr, IContextKeyService } from "../../../platform/contextkey/common/contextkey.js";
import { IViewDescriptorService, ViewContainerLocation, ViewContainerLocationToString } from "../../common/views.js";
import { IViewsService } from "../../services/views/common/viewsService.js";
import { IQuickInputService } from "../../../platform/quickinput/common/quickInput.js";
import { IDialogService } from "../../../platform/dialogs/common/dialogs.js";
import { IPaneCompositePartService } from "../../services/panecomposite/browser/panecomposite.js";
import { ToggleAuxiliaryBarAction } from "../parts/auxiliarybar/auxiliaryBarActions.js";
import { TogglePanelAction } from "../parts/panel/panelActions.js";
import { ICommandService } from "../../../platform/commands/common/commands.js";
import { AuxiliaryBarVisibleContext, PanelAlignmentContext, PanelVisibleContext, SideBarVisibleContext, FocusedViewContext, InEditorZenModeContext, IsMainEditorCenteredLayoutContext, MainEditorAreaVisibleContext, IsMainWindowFullscreenContext, PanelPositionContext, IsAuxiliaryWindowFocusedContext, IsSessionsWindowContext, TitleBarStyleContext, IsAuxiliaryWindowContext } from "../../common/contextkeys.js";
import { Codicon } from "../../../base/common/codicons.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { registerIcon } from "../../../platform/theme/common/iconRegistry.js";
import { mainWindow } from "../../../base/browser/window.js";
import { IKeybindingService } from "../../../platform/keybinding/common/keybinding.js";
import { MenuSettings, TitlebarStyle } from "../../../platform/window/common/window.js";
import { IPreferencesService } from "../../services/preferences/common/preferences.js";
import { QuickInputAlignmentContextKey } from "../../../platform/quickinput/browser/quickInput.js";
import { IEditorGroupsService } from "../../services/editor/common/editorGroupsService.js";
const menubarIcon = registerIcon("menuBar", Codicon.layoutMenubar, localize("menuBarIcon", "Represents the menu bar"));
const activityBarLeftIcon = registerIcon("activity-bar-left", Codicon.layoutActivitybarLeft, localize("activityBarLeft", "Represents the activity bar in the left position"));
const activityBarRightIcon = registerIcon("activity-bar-right", Codicon.layoutActivitybarRight, localize("activityBarRight", "Represents the activity bar in the right position"));
const panelLeftIcon = registerIcon("panel-left", Codicon.layoutSidebarLeft, localize("panelLeft", "Represents a side bar in the left position"));
const panelLeftOffIcon = registerIcon("panel-left-off", Codicon.layoutSidebarLeftOff, localize("panelLeftOff", "Represents a side bar in the left position toggled off"));
const panelRightIcon = registerIcon("panel-right", Codicon.layoutSidebarRight, localize("panelRight", "Represents side bar in the right position"));
const panelRightOffIcon = registerIcon("panel-right-off", Codicon.layoutSidebarRightOff, localize("panelRightOff", "Represents side bar in the right position toggled off"));
const panelIcon = registerIcon("panel-bottom", Codicon.layoutPanel, localize("panelBottom", "Represents the bottom panel"));
const statusBarIcon = registerIcon("statusBar", Codicon.layoutStatusbar, localize("statusBarIcon", "Represents the status bar"));
const panelAlignmentLeftIcon = registerIcon("panel-align-left", Codicon.layoutPanelLeft, localize("panelBottomLeft", "Represents the bottom panel alignment set to the left"));
const panelAlignmentRightIcon = registerIcon("panel-align-right", Codicon.layoutPanelRight, localize("panelBottomRight", "Represents the bottom panel alignment set to the right"));
const panelAlignmentCenterIcon = registerIcon("panel-align-center", Codicon.layoutPanelCenter, localize("panelBottomCenter", "Represents the bottom panel alignment set to the center"));
const panelAlignmentJustifyIcon = registerIcon("panel-align-justify", Codicon.layoutPanelJustify, localize("panelBottomJustify", "Represents the bottom panel alignment set to justified"));
const quickInputAlignmentTopIcon = registerIcon("quickInputAlignmentTop", Codicon.arrowUp, localize("quickInputAlignmentTop", "Represents quick input alignment set to the top"));
const quickInputAlignmentCenterIcon = registerIcon("quickInputAlignmentCenter", Codicon.circle, localize("quickInputAlignmentCenter", "Represents quick input alignment set to the center"));
const fullscreenIcon = registerIcon("fullscreen", Codicon.screenFull, localize("fullScreenIcon", "Represents full screen"));
const centerLayoutIcon = registerIcon("centerLayoutIcon", Codicon.layoutCentered, localize("centerLayoutIcon", "Represents centered layout mode"));
const zenModeIcon = registerIcon("zenMode", Codicon.target, localize("zenModeIcon", "Represents zen mode"));
const ToggleActivityBarVisibilityActionId = "workbench.action.toggleActivityBarVisibility";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.toggleCenteredLayout",
      title: {
        ...localize2("toggleCenteredLayout", "Toggle Centered Layout"),
        mnemonicTitle: localize({ key: "miToggleCenteredLayout", comment: ["&& denotes a mnemonic"] }, "&&Centered Layout")
      },
      precondition: ContextKeyExpr.and(IsAuxiliaryWindowFocusedContext.toNegated(), IsSessionsWindowContext.negate()),
      category: Categories.View,
      f1: true,
      toggled: IsMainEditorCenteredLayoutContext,
      menu: [{
        id: MenuId.MenubarAppearanceMenu,
        group: "1_toggle_view",
        order: 3,
        when: IsSessionsWindowContext.negate()
      }]
    });
  }
  run(accessor) {
    const layoutService = accessor.get(IWorkbenchLayoutService);
    const editorGroupService = accessor.get(IEditorGroupsService);
    layoutService.centerMainEditorLayout(!layoutService.isMainEditorLayoutCentered());
    editorGroupService.activeGroup.focus();
  }
});
const sidebarPositionConfigurationKey = "workbench.sideBar.location";
class MoveSidebarPositionAction extends Action2 {
  constructor(id, title, position) {
    super({
      id,
      title,
      f1: false
    });
    this.position = position;
  }
  async run(accessor) {
    const layoutService = accessor.get(IWorkbenchLayoutService);
    const configurationService = accessor.get(IConfigurationService);
    const position = layoutService.getSideBarPosition();
    if (position !== this.position) {
      return configurationService.updateValue(sidebarPositionConfigurationKey, positionToString(this.position));
    }
  }
}
const _MoveSidebarRightAction = class _MoveSidebarRightAction extends MoveSidebarPositionAction {
  constructor() {
    super(_MoveSidebarRightAction.ID, localize2("moveSidebarRight", "Move Primary Side Bar Right"), Position.RIGHT);
  }
};
_MoveSidebarRightAction.ID = "workbench.action.moveSideBarRight";
let MoveSidebarRightAction = _MoveSidebarRightAction;
const _MoveSidebarLeftAction = class _MoveSidebarLeftAction extends MoveSidebarPositionAction {
  constructor() {
    super(_MoveSidebarLeftAction.ID, localize2("moveSidebarLeft", "Move Primary Side Bar Left"), Position.LEFT);
  }
};
_MoveSidebarLeftAction.ID = "workbench.action.moveSideBarLeft";
let MoveSidebarLeftAction = _MoveSidebarLeftAction;
registerAction2(MoveSidebarRightAction);
registerAction2(MoveSidebarLeftAction);
const _ToggleSidebarPositionAction = class _ToggleSidebarPositionAction extends Action2 {
  static getLabel(layoutService) {
    return layoutService.getSideBarPosition() === Position.LEFT ? localize("moveSidebarRight", "Move Primary Side Bar Right") : localize("moveSidebarLeft", "Move Primary Side Bar Left");
  }
  constructor() {
    super({
      id: _ToggleSidebarPositionAction.ID,
      title: localize2("toggleSidebarPosition", "Toggle Primary Side Bar Position"),
      category: Categories.View,
      f1: true,
      precondition: IsSessionsWindowContext.negate()
    });
  }
  run(accessor) {
    const layoutService = accessor.get(IWorkbenchLayoutService);
    const configurationService = accessor.get(IConfigurationService);
    const position = layoutService.getSideBarPosition();
    const newPositionValue = position === Position.LEFT ? "right" : "left";
    return configurationService.updateValue(sidebarPositionConfigurationKey, newPositionValue);
  }
};
_ToggleSidebarPositionAction.ID = "workbench.action.toggleSidebarPosition";
_ToggleSidebarPositionAction.LABEL = localize("toggleSidebarPosition", "Toggle Primary Side Bar Position");
let ToggleSidebarPositionAction = _ToggleSidebarPositionAction;
registerAction2(ToggleSidebarPositionAction);
const configureLayoutIcon = registerIcon("configure-layout-icon", Codicon.layout, localize("cofigureLayoutIcon", "Icon represents workbench layout configuration."));
MenuRegistry.appendMenuItem(MenuId.LayoutControlMenu, {
  submenu: MenuId.LayoutControlMenuSubmenu,
  title: localize("configureLayout", "Configure Layout"),
  icon: configureLayoutIcon,
  group: "1_workbench_layout",
  when: ContextKeyExpr.and(
    IsAuxiliaryWindowContext.negate(),
    ContextKeyExpr.equals("config.workbench.layoutControl.type", "menu")
  )
});
MenuRegistry.appendMenuItems([{
  id: MenuId.ViewContainerTitleContext,
  item: {
    group: "3_workbench_layout_move",
    command: {
      id: ToggleSidebarPositionAction.ID,
      title: localize("move side bar right", "Move Primary Side Bar Right")
    },
    when: ContextKeyExpr.and(ContextKeyExpr.notEquals("config.workbench.sideBar.location", "right"), ContextKeyExpr.equals("viewContainerLocation", ViewContainerLocationToString(ViewContainerLocation.Sidebar))),
    order: 1
  }
}, {
  id: MenuId.ViewContainerTitleContext,
  item: {
    group: "3_workbench_layout_move",
    command: {
      id: ToggleSidebarPositionAction.ID,
      title: localize("move sidebar left", "Move Primary Side Bar Left")
    },
    when: ContextKeyExpr.and(ContextKeyExpr.equals("config.workbench.sideBar.location", "right"), ContextKeyExpr.equals("viewContainerLocation", ViewContainerLocationToString(ViewContainerLocation.Sidebar))),
    order: 1
  }
}, {
  id: MenuId.ViewContainerTitleContext,
  item: {
    group: "3_workbench_layout_move",
    command: {
      id: ToggleSidebarPositionAction.ID,
      title: localize("move second sidebar left", "Move Secondary Side Bar Left")
    },
    when: ContextKeyExpr.and(ContextKeyExpr.notEquals("config.workbench.sideBar.location", "right"), ContextKeyExpr.equals("viewContainerLocation", ViewContainerLocationToString(ViewContainerLocation.AuxiliaryBar))),
    order: 1
  }
}, {
  id: MenuId.ViewContainerTitleContext,
  item: {
    group: "3_workbench_layout_move",
    command: {
      id: ToggleSidebarPositionAction.ID,
      title: localize("move second sidebar right", "Move Secondary Side Bar Right")
    },
    when: ContextKeyExpr.and(ContextKeyExpr.equals("config.workbench.sideBar.location", "right"), ContextKeyExpr.equals("viewContainerLocation", ViewContainerLocationToString(ViewContainerLocation.AuxiliaryBar))),
    order: 1
  }
}]);
MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
  group: "3_workbench_layout_move",
  command: {
    id: ToggleSidebarPositionAction.ID,
    title: localize({ key: "miMoveSidebarRight", comment: ["&& denotes a mnemonic"] }, "&&Move Primary Side Bar Right")
  },
  when: ContextKeyExpr.and(ContextKeyExpr.notEquals("config.workbench.sideBar.location", "right"), IsSessionsWindowContext.negate()),
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
  group: "3_workbench_layout_move",
  command: {
    id: ToggleSidebarPositionAction.ID,
    title: localize({ key: "miMoveSidebarLeft", comment: ["&& denotes a mnemonic"] }, "&&Move Primary Side Bar Left")
  },
  when: ContextKeyExpr.and(ContextKeyExpr.equals("config.workbench.sideBar.location", "right"), IsSessionsWindowContext.negate()),
  order: 2
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.toggleEditorVisibility",
      title: {
        ...localize2("toggleEditor", "Toggle Editor Area Visibility"),
        mnemonicTitle: localize({ key: "miShowEditorArea", comment: ["&& denotes a mnemonic"] }, "Show &&Editor Area")
      },
      category: Categories.View,
      f1: true,
      toggled: MainEditorAreaVisibleContext,
      // the workbench grid currently prevents us from supporting panel maximization with non-center panel alignment
      precondition: ContextKeyExpr.and(IsAuxiliaryWindowFocusedContext.toNegated(), ContextKeyExpr.or(PanelAlignmentContext.isEqualTo("center"), PanelPositionContext.notEqualsTo("bottom")))
    });
  }
  run(accessor) {
    accessor.get(IWorkbenchLayoutService).toggleMaximizedPanel();
  }
});
MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
  group: "2_appearance",
  title: localize({ key: "miAppearance", comment: ["&& denotes a mnemonic"] }, "&&Appearance"),
  submenu: MenuId.MenubarAppearanceMenu,
  when: IsSessionsWindowContext.negate(),
  order: 1
});
const _ToggleSidebarVisibilityAction = class _ToggleSidebarVisibilityAction extends Action2 {
  constructor() {
    super({
      id: _ToggleSidebarVisibilityAction.ID,
      title: localize2("toggleSidebar", "Toggle Primary Side Bar Visibility"),
      toggled: {
        condition: SideBarVisibleContext,
        title: localize("primary sidebar", "Primary Side Bar"),
        mnemonicTitle: localize({ key: "primary sidebar mnemonic", comment: ["&& denotes a mnemonic"] }, "&&Primary Side Bar")
      },
      metadata: {
        description: localize("openAndCloseSidebar", "Open/Show and Close/Hide Sidebar")
      },
      category: Categories.View,
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.KeyB
      },
      menu: [
        {
          id: MenuId.LayoutControlMenuSubmenu,
          group: "0_workbench_layout",
          order: 0
        },
        {
          id: MenuId.MenubarAppearanceMenu,
          group: "2_workbench_layout",
          order: 1
        }
      ]
    });
  }
  run(accessor) {
    const layoutService = accessor.get(IWorkbenchLayoutService);
    const isCurrentlyVisible = layoutService.isVisible(Parts.SIDEBAR_PART);
    layoutService.setPartHidden(isCurrentlyVisible, Parts.SIDEBAR_PART);
    const alertMessage = isCurrentlyVisible ? localize("sidebarHidden", "Primary Side Bar hidden") : localize("sidebarVisible", "Primary Side Bar shown");
    alert(alertMessage);
  }
};
_ToggleSidebarVisibilityAction.ID = "workbench.action.toggleSidebarVisibility";
_ToggleSidebarVisibilityAction.LABEL = localize("compositePart.hideSideBarLabel", "Hide Primary Side Bar");
let ToggleSidebarVisibilityAction = _ToggleSidebarVisibilityAction;
registerAction2(ToggleSidebarVisibilityAction);
MenuRegistry.appendMenuItems([
  {
    id: MenuId.ViewContainerTitleContext,
    item: {
      group: "3_workbench_layout_move",
      command: {
        id: ToggleSidebarVisibilityAction.ID,
        title: localize("compositePart.hideSideBarLabel", "Hide Primary Side Bar")
      },
      when: ContextKeyExpr.and(SideBarVisibleContext, ContextKeyExpr.equals("viewContainerLocation", ViewContainerLocationToString(ViewContainerLocation.Sidebar))),
      order: 2
    }
  },
  {
    id: MenuId.LayoutControlMenu,
    item: {
      group: "navigation",
      command: {
        id: ToggleSidebarVisibilityAction.ID,
        title: localize("toggleSideBar", "Toggle Primary Side Bar"),
        icon: panelLeftOffIcon,
        toggled: { condition: SideBarVisibleContext, icon: panelLeftIcon }
      },
      when: ContextKeyExpr.and(
        IsAuxiliaryWindowContext.negate(),
        ContextKeyExpr.or(
          ContextKeyExpr.equals("config.workbench.layoutControl.type", "toggles"),
          ContextKeyExpr.equals("config.workbench.layoutControl.type", "both")
        ),
        ContextKeyExpr.equals("config.workbench.sideBar.location", "left")
      ),
      order: 0
    }
  },
  {
    id: MenuId.LayoutControlMenu,
    item: {
      group: "navigation",
      command: {
        id: ToggleSidebarVisibilityAction.ID,
        title: localize("toggleSideBar", "Toggle Primary Side Bar"),
        icon: panelRightOffIcon,
        toggled: { condition: SideBarVisibleContext, icon: panelRightIcon }
      },
      when: ContextKeyExpr.and(
        IsAuxiliaryWindowContext.negate(),
        ContextKeyExpr.or(
          ContextKeyExpr.equals("config.workbench.layoutControl.type", "toggles"),
          ContextKeyExpr.equals("config.workbench.layoutControl.type", "both")
        ),
        ContextKeyExpr.equals("config.workbench.sideBar.location", "right")
      ),
      order: 2
    }
  }
]);
const _ToggleStatusbarVisibilityAction = class _ToggleStatusbarVisibilityAction extends Action2 {
  constructor() {
    super({
      id: _ToggleStatusbarVisibilityAction.ID,
      title: {
        ...localize2("toggleStatusbar", "Toggle Status Bar Visibility"),
        mnemonicTitle: localize({ key: "miStatusbar", comment: ["&& denotes a mnemonic"] }, "S&&tatus Bar")
      },
      category: Categories.View,
      f1: true,
      precondition: IsSessionsWindowContext.negate(),
      toggled: ContextKeyExpr.equals("config.workbench.statusBar.visible", true),
      menu: [{
        id: MenuId.MenubarAppearanceMenu,
        group: "2_workbench_layout",
        order: 3,
        when: IsSessionsWindowContext.negate()
      }]
    });
  }
  run(accessor) {
    const layoutService = accessor.get(IWorkbenchLayoutService);
    const configurationService = accessor.get(IConfigurationService);
    const visibility = layoutService.isVisible(Parts.STATUSBAR_PART, mainWindow);
    const newVisibilityValue = !visibility;
    return configurationService.updateValue(_ToggleStatusbarVisibilityAction.statusbarVisibleKey, newVisibilityValue);
  }
};
_ToggleStatusbarVisibilityAction.ID = "workbench.action.toggleStatusbarVisibility";
_ToggleStatusbarVisibilityAction.statusbarVisibleKey = "workbench.statusBar.visible";
let ToggleStatusbarVisibilityAction = _ToggleStatusbarVisibilityAction;
registerAction2(ToggleStatusbarVisibilityAction);
class AbstractSetShowTabsAction extends Action2 {
  constructor(settingName, value, title, id, precondition, description) {
    super({
      id,
      title,
      category: Categories.View,
      precondition: ContextKeyExpr.and(precondition, IsSessionsWindowContext.negate()),
      metadata: description ? { description } : void 0,
      f1: true
    });
    this.settingName = settingName;
    this.value = value;
  }
  run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    return configurationService.updateValue(this.settingName, this.value);
  }
}
const _HideEditorTabsAction = class _HideEditorTabsAction extends AbstractSetShowTabsAction {
  constructor() {
    const precondition = ContextKeyExpr.and(ContextKeyExpr.equals(`config.${LayoutSettings.EDITOR_TABS_MODE}`, EditorTabsMode.NONE).negate(), InEditorZenModeContext.negate());
    const title = localize2("hideEditorTabs", "Hide Editor Tabs");
    super(LayoutSettings.EDITOR_TABS_MODE, EditorTabsMode.NONE, title, _HideEditorTabsAction.ID, precondition, localize2("hideEditorTabsDescription", "Hide Tab Bar"));
  }
};
_HideEditorTabsAction.ID = "workbench.action.hideEditorTabs";
let HideEditorTabsAction = _HideEditorTabsAction;
const _ZenHideEditorTabsAction = class _ZenHideEditorTabsAction extends AbstractSetShowTabsAction {
  constructor() {
    const precondition = ContextKeyExpr.and(ContextKeyExpr.equals(`config.${ZenModeSettings.SHOW_TABS}`, EditorTabsMode.NONE).negate(), InEditorZenModeContext);
    const title = localize2("hideEditorTabsZenMode", "Hide Editor Tabs in Zen Mode");
    super(ZenModeSettings.SHOW_TABS, EditorTabsMode.NONE, title, _ZenHideEditorTabsAction.ID, precondition, localize2("hideEditorTabsZenModeDescription", "Hide Tab Bar in Zen Mode"));
  }
};
_ZenHideEditorTabsAction.ID = "workbench.action.zenHideEditorTabs";
let ZenHideEditorTabsAction = _ZenHideEditorTabsAction;
const _ShowMultipleEditorTabsAction = class _ShowMultipleEditorTabsAction extends AbstractSetShowTabsAction {
  constructor() {
    const precondition = ContextKeyExpr.and(ContextKeyExpr.equals(`config.${LayoutSettings.EDITOR_TABS_MODE}`, EditorTabsMode.MULTIPLE).negate(), InEditorZenModeContext.negate());
    const title = localize2("showMultipleEditorTabs", "Show Multiple Editor Tabs");
    super(LayoutSettings.EDITOR_TABS_MODE, EditorTabsMode.MULTIPLE, title, _ShowMultipleEditorTabsAction.ID, precondition, localize2("showMultipleEditorTabsDescription", "Show Tab Bar with multiple tabs"));
  }
};
_ShowMultipleEditorTabsAction.ID = "workbench.action.showMultipleEditorTabs";
let ShowMultipleEditorTabsAction = _ShowMultipleEditorTabsAction;
const _ZenShowMultipleEditorTabsAction = class _ZenShowMultipleEditorTabsAction extends AbstractSetShowTabsAction {
  constructor() {
    const precondition = ContextKeyExpr.and(ContextKeyExpr.equals(`config.${ZenModeSettings.SHOW_TABS}`, EditorTabsMode.MULTIPLE).negate(), InEditorZenModeContext);
    const title = localize2("showMultipleEditorTabsZenMode", "Show Multiple Editor Tabs in Zen Mode");
    super(ZenModeSettings.SHOW_TABS, EditorTabsMode.MULTIPLE, title, _ZenShowMultipleEditorTabsAction.ID, precondition, localize2("showMultipleEditorTabsZenModeDescription", "Show Tab Bar in Zen Mode"));
  }
};
_ZenShowMultipleEditorTabsAction.ID = "workbench.action.zenShowMultipleEditorTabs";
let ZenShowMultipleEditorTabsAction = _ZenShowMultipleEditorTabsAction;
const _ShowSingleEditorTabAction = class _ShowSingleEditorTabAction extends AbstractSetShowTabsAction {
  constructor() {
    const precondition = ContextKeyExpr.and(ContextKeyExpr.equals(`config.${LayoutSettings.EDITOR_TABS_MODE}`, EditorTabsMode.SINGLE).negate(), InEditorZenModeContext.negate());
    const title = localize2("showSingleEditorTab", "Show Single Editor Tab");
    super(LayoutSettings.EDITOR_TABS_MODE, EditorTabsMode.SINGLE, title, _ShowSingleEditorTabAction.ID, precondition, localize2("showSingleEditorTabDescription", "Show Tab Bar with one Tab"));
  }
};
_ShowSingleEditorTabAction.ID = "workbench.action.showEditorTab";
let ShowSingleEditorTabAction = _ShowSingleEditorTabAction;
registerAction2(HideEditorTabsAction);
registerAction2(ShowMultipleEditorTabsAction);
registerAction2(ShowSingleEditorTabAction);
const _ZenShowSingleEditorTabAction = class _ZenShowSingleEditorTabAction extends AbstractSetShowTabsAction {
  constructor() {
    const precondition = ContextKeyExpr.and(ContextKeyExpr.equals(`config.${ZenModeSettings.SHOW_TABS}`, EditorTabsMode.SINGLE).negate(), InEditorZenModeContext);
    const title = localize2("showSingleEditorTabZenMode", "Show Single Editor Tab in Zen Mode");
    super(ZenModeSettings.SHOW_TABS, EditorTabsMode.SINGLE, title, _ZenShowSingleEditorTabAction.ID, precondition, localize2("showSingleEditorTabZenModeDescription", "Show Tab Bar in Zen Mode with one Tab"));
  }
};
_ZenShowSingleEditorTabAction.ID = "workbench.action.zenShowEditorTab";
let ZenShowSingleEditorTabAction = _ZenShowSingleEditorTabAction;
MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
  submenu: MenuId.EditorTabsBarShowTabsSubmenu,
  title: localize("tabBar", "Tab Bar"),
  group: "3_workbench_layout_move",
  order: 10,
  when: ContextKeyExpr.and(InEditorZenModeContext.negate(), IsSessionsWindowContext.negate())
});
const _EditorActionsTitleBarAction = class _EditorActionsTitleBarAction extends Action2 {
  constructor() {
    super({
      id: _EditorActionsTitleBarAction.ID,
      title: localize2("moveEditorActionsToTitleBar", "Move Editor Actions to Title Bar"),
      category: Categories.View,
      precondition: ContextKeyExpr.and(ContextKeyExpr.equals(`config.${LayoutSettings.EDITOR_ACTIONS_LOCATION}`, EditorActionsLocation.TITLEBAR).negate(), IsSessionsWindowContext.negate()),
      metadata: { description: localize2("moveEditorActionsToTitleBarDescription", "Move Editor Actions from the tab bar to the title bar") },
      f1: true
    });
  }
  run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    return configurationService.updateValue(LayoutSettings.EDITOR_ACTIONS_LOCATION, EditorActionsLocation.TITLEBAR);
  }
};
_EditorActionsTitleBarAction.ID = "workbench.action.editorActionsTitleBar";
let EditorActionsTitleBarAction = _EditorActionsTitleBarAction;
registerAction2(EditorActionsTitleBarAction);
const _EditorActionsDefaultAction = class _EditorActionsDefaultAction extends Action2 {
  constructor() {
    super({
      id: _EditorActionsDefaultAction.ID,
      title: localize2("moveEditorActionsToTabBar", "Move Editor Actions to Tab Bar"),
      category: Categories.View,
      precondition: ContextKeyExpr.and(
        ContextKeyExpr.equals(`config.${LayoutSettings.EDITOR_ACTIONS_LOCATION}`, EditorActionsLocation.DEFAULT).negate(),
        ContextKeyExpr.equals(`config.${LayoutSettings.EDITOR_TABS_MODE}`, EditorTabsMode.NONE).negate(),
        IsSessionsWindowContext.negate()
      ),
      metadata: { description: localize2("moveEditorActionsToTabBarDescription", "Move Editor Actions from the title bar to the tab bar") },
      f1: true
    });
  }
  run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    return configurationService.updateValue(LayoutSettings.EDITOR_ACTIONS_LOCATION, EditorActionsLocation.DEFAULT);
  }
};
_EditorActionsDefaultAction.ID = "workbench.action.editorActionsDefault";
let EditorActionsDefaultAction = _EditorActionsDefaultAction;
registerAction2(EditorActionsDefaultAction);
const _HideEditorActionsAction = class _HideEditorActionsAction extends Action2 {
  constructor() {
    super({
      id: _HideEditorActionsAction.ID,
      title: localize2("hideEditorActons", "Hide Editor Actions"),
      category: Categories.View,
      precondition: ContextKeyExpr.and(ContextKeyExpr.equals(`config.${LayoutSettings.EDITOR_ACTIONS_LOCATION}`, EditorActionsLocation.HIDDEN).negate(), IsSessionsWindowContext.negate()),
      metadata: { description: localize2("hideEditorActonsDescription", "Hide Editor Actions in the tab and title bar") },
      f1: true
    });
  }
  run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    return configurationService.updateValue(LayoutSettings.EDITOR_ACTIONS_LOCATION, EditorActionsLocation.HIDDEN);
  }
};
_HideEditorActionsAction.ID = "workbench.action.hideEditorActions";
let HideEditorActionsAction = _HideEditorActionsAction;
registerAction2(HideEditorActionsAction);
const _ShowEditorActionsAction = class _ShowEditorActionsAction extends Action2 {
  constructor() {
    super({
      id: _ShowEditorActionsAction.ID,
      title: localize2("showEditorActons", "Show Editor Actions"),
      category: Categories.View,
      precondition: ContextKeyExpr.and(ContextKeyExpr.equals(`config.${LayoutSettings.EDITOR_ACTIONS_LOCATION}`, EditorActionsLocation.HIDDEN), IsSessionsWindowContext.negate()),
      metadata: { description: localize2("showEditorActonsDescription", "Make Editor Actions visible.") },
      f1: true
    });
  }
  run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    return configurationService.updateValue(LayoutSettings.EDITOR_ACTIONS_LOCATION, EditorActionsLocation.DEFAULT);
  }
};
_ShowEditorActionsAction.ID = "workbench.action.showEditorActions";
let ShowEditorActionsAction = _ShowEditorActionsAction;
registerAction2(ShowEditorActionsAction);
MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
  submenu: MenuId.EditorActionsPositionSubmenu,
  title: localize("editorActionsPosition", "Editor Actions Position"),
  group: "3_workbench_layout_move",
  order: 11,
  when: IsSessionsWindowContext.negate()
});
const _ConfigureEditorTabsAction = class _ConfigureEditorTabsAction extends Action2 {
  constructor() {
    super({
      id: _ConfigureEditorTabsAction.ID,
      title: localize2("configureTabs", "Configure Tabs"),
      category: Categories.View
    });
  }
  run(accessor) {
    const preferencesService = accessor.get(IPreferencesService);
    preferencesService.openSettings({ jsonEditor: false, query: "workbench.editor tab" });
  }
};
_ConfigureEditorTabsAction.ID = "workbench.action.configureEditorTabs";
let ConfigureEditorTabsAction = _ConfigureEditorTabsAction;
registerAction2(ConfigureEditorTabsAction);
const _ConfigureEditorAction = class _ConfigureEditorAction extends Action2 {
  constructor() {
    super({
      id: _ConfigureEditorAction.ID,
      title: localize2("configureEditors", "Configure Editors"),
      category: Categories.View
    });
  }
  run(accessor) {
    const preferencesService = accessor.get(IPreferencesService);
    preferencesService.openSettings({ jsonEditor: false, query: "workbench.editor" });
  }
};
_ConfigureEditorAction.ID = "workbench.action.configureEditor";
let ConfigureEditorAction = _ConfigureEditorAction;
registerAction2(ConfigureEditorAction);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.toggleSeparatePinnedEditorTabs",
      title: localize2("toggleSeparatePinnedEditorTabs", "Separate Pinned Editor Tabs"),
      category: Categories.View,
      precondition: ContextKeyExpr.equals(`config.${LayoutSettings.EDITOR_TABS_MODE}`, EditorTabsMode.MULTIPLE),
      metadata: { description: localize2("toggleSeparatePinnedEditorTabsDescription", "Toggle whether pinned editor tabs are shown on a separate row above unpinned tabs.") },
      f1: true
    });
  }
  run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    const oldettingValue = configurationService.getValue("workbench.editor.pinnedTabsOnSeparateRow");
    const newSettingValue = !oldettingValue;
    return configurationService.updateValue("workbench.editor.pinnedTabsOnSeparateRow", newSettingValue);
  }
});
if (isWindows || isLinux || isWeb) {
  registerAction2(class ToggleMenubarAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.toggleMenuBar",
        title: {
          ...localize2("toggleMenuBar", "Toggle Menu Bar"),
          mnemonicTitle: localize({ key: "miMenuBar", comment: ["&& denotes a mnemonic"] }, "Menu &&Bar")
        },
        category: Categories.View,
        f1: true,
        precondition: IsSessionsWindowContext.negate(),
        toggled: ContextKeyExpr.and(IsMacNativeContext.toNegated(), ContextKeyExpr.notEquals(`config.${MenuSettings.MenuBarVisibility}`, "hidden"), ContextKeyExpr.notEquals(`config.${MenuSettings.MenuBarVisibility}`, "toggle"), ContextKeyExpr.notEquals(`config.${MenuSettings.MenuBarVisibility}`, "compact")),
        menu: [{
          id: MenuId.MenubarAppearanceMenu,
          group: "2_workbench_layout",
          order: 0,
          when: IsSessionsWindowContext.negate()
        }]
      });
    }
    run(accessor) {
      return accessor.get(IWorkbenchLayoutService).toggleMenuBar();
    }
  });
  for (const menuId of [MenuId.TitleBarContext, MenuId.TitleBarTitleContext]) {
    MenuRegistry.appendMenuItem(menuId, {
      command: {
        id: "workbench.action.toggleMenuBar",
        title: localize("miMenuBarNoMnemonic", "Menu Bar"),
        toggled: ContextKeyExpr.and(IsMacNativeContext.toNegated(), ContextKeyExpr.notEquals(`config.${MenuSettings.MenuBarVisibility}`, "hidden"), ContextKeyExpr.notEquals(`config.${MenuSettings.MenuBarVisibility}`, "toggle"), ContextKeyExpr.notEquals(`config.${MenuSettings.MenuBarVisibility}`, "compact"))
      },
      when: ContextKeyExpr.and(IsAuxiliaryWindowFocusedContext.toNegated(), ContextKeyExpr.notEquals(TitleBarStyleContext.key, TitlebarStyle.NATIVE), IsMainWindowFullscreenContext.negate()),
      group: "2_config",
      order: 0
    });
  }
}
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.resetViewLocations",
      title: localize2("resetViewLocations", "Reset View Locations"),
      category: Categories.View,
      f1: true
    });
  }
  run(accessor) {
    return accessor.get(IViewDescriptorService).reset();
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.moveView",
      title: localize2("moveView", "Move View"),
      category: Categories.View,
      f1: true
    });
  }
  async run(accessor) {
    const viewDescriptorService = accessor.get(IViewDescriptorService);
    const instantiationService = accessor.get(IInstantiationService);
    const quickInputService = accessor.get(IQuickInputService);
    const contextKeyService = accessor.get(IContextKeyService);
    const paneCompositePartService = accessor.get(IPaneCompositePartService);
    const focusedViewId = FocusedViewContext.getValue(contextKeyService);
    let viewId;
    if (focusedViewId && viewDescriptorService.getViewDescriptorById(focusedViewId)?.canMoveView) {
      viewId = focusedViewId;
    }
    try {
      viewId = await this.getView(quickInputService, viewDescriptorService, paneCompositePartService, viewId);
      if (!viewId) {
        return;
      }
      const moveFocusedViewAction = new MoveFocusedViewAction();
      instantiationService.invokeFunction((accessor2) => moveFocusedViewAction.run(accessor2, viewId));
    } catch {
    }
  }
  getViewItems(viewDescriptorService, paneCompositePartService) {
    const results = [];
    const viewlets = paneCompositePartService.getVisiblePaneCompositeIds(ViewContainerLocation.Sidebar);
    viewlets.forEach((viewletId) => {
      const container = viewDescriptorService.getViewContainerById(viewletId);
      const containerModel = viewDescriptorService.getViewContainerModel(container);
      let hasAddedView = false;
      containerModel.visibleViewDescriptors.forEach((viewDescriptor) => {
        if (viewDescriptor.canMoveView) {
          if (!hasAddedView) {
            results.push({
              type: "separator",
              label: localize("sidebarContainer", "Side Bar / {0}", containerModel.title)
            });
            hasAddedView = true;
          }
          results.push({
            id: viewDescriptor.id,
            label: viewDescriptor.name.value
          });
        }
      });
    });
    const panels = paneCompositePartService.getPinnedPaneCompositeIds(ViewContainerLocation.Panel);
    panels.forEach((panel) => {
      const container = viewDescriptorService.getViewContainerById(panel);
      const containerModel = viewDescriptorService.getViewContainerModel(container);
      let hasAddedView = false;
      containerModel.visibleViewDescriptors.forEach((viewDescriptor) => {
        if (viewDescriptor.canMoveView) {
          if (!hasAddedView) {
            results.push({
              type: "separator",
              label: localize("panelContainer", "Panel / {0}", containerModel.title)
            });
            hasAddedView = true;
          }
          results.push({
            id: viewDescriptor.id,
            label: viewDescriptor.name.value
          });
        }
      });
    });
    const sidePanels = paneCompositePartService.getPinnedPaneCompositeIds(ViewContainerLocation.AuxiliaryBar);
    sidePanels.forEach((panel) => {
      const container = viewDescriptorService.getViewContainerById(panel);
      const containerModel = viewDescriptorService.getViewContainerModel(container);
      let hasAddedView = false;
      containerModel.visibleViewDescriptors.forEach((viewDescriptor) => {
        if (viewDescriptor.canMoveView) {
          if (!hasAddedView) {
            results.push({
              type: "separator",
              label: localize("secondarySideBarContainer", "Secondary Side Bar / {0}", containerModel.title)
            });
            hasAddedView = true;
          }
          results.push({
            id: viewDescriptor.id,
            label: viewDescriptor.name.value
          });
        }
      });
    });
    return results;
  }
  async getView(quickInputService, viewDescriptorService, paneCompositePartService, viewId) {
    const disposables = new DisposableStore();
    const quickPick = disposables.add(quickInputService.createQuickPick({ useSeparators: true }));
    quickPick.placeholder = localize("moveFocusedView.selectView", "Select a View to Move");
    quickPick.items = this.getViewItems(viewDescriptorService, paneCompositePartService);
    quickPick.selectedItems = quickPick.items.filter((item) => item.id === viewId);
    return new Promise((resolve, reject) => {
      disposables.add(quickPick.onDidAccept(() => {
        const viewId2 = quickPick.selectedItems[0];
        if (viewId2.id) {
          resolve(viewId2.id);
        } else {
          reject();
        }
        quickPick.hide();
      }));
      disposables.add(quickPick.onDidHide(() => {
        disposables.dispose();
        reject();
      }));
      quickPick.show();
    });
  }
});
class MoveFocusedViewAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.moveFocusedView",
      title: localize2("moveFocusedView", "Move Focused View"),
      category: Categories.View,
      precondition: FocusedViewContext.notEqualsTo(""),
      f1: true
    });
  }
  run(accessor, viewId) {
    const viewDescriptorService = accessor.get(IViewDescriptorService);
    const viewsService = accessor.get(IViewsService);
    const quickInputService = accessor.get(IQuickInputService);
    const contextKeyService = accessor.get(IContextKeyService);
    const dialogService = accessor.get(IDialogService);
    const paneCompositePartService = accessor.get(IPaneCompositePartService);
    const focusedViewId = viewId || FocusedViewContext.getValue(contextKeyService);
    if (focusedViewId === void 0 || focusedViewId.trim() === "") {
      dialogService.error(localize("moveFocusedView.error.noFocusedView", "There is no view currently focused."));
      return;
    }
    const viewDescriptor = viewDescriptorService.getViewDescriptorById(focusedViewId);
    if (!viewDescriptor?.canMoveView) {
      dialogService.error(localize("moveFocusedView.error.nonMovableView", "The currently focused view is not movable."));
      return;
    }
    const disposables = new DisposableStore();
    const quickPick = disposables.add(quickInputService.createQuickPick({ useSeparators: true }));
    quickPick.placeholder = localize("moveFocusedView.selectDestination", "Select a Destination for the View");
    quickPick.title = localize({ key: "moveFocusedView.title", comment: ["{0} indicates the title of the view the user has selected to move."] }, "View: Move {0}", viewDescriptor.name.value);
    const items = [];
    const currentContainer = viewDescriptorService.getViewContainerByViewId(focusedViewId);
    const currentLocation = viewDescriptorService.getViewLocationById(focusedViewId);
    const isViewSolo = viewDescriptorService.getViewContainerModel(currentContainer).allViewDescriptors.length === 1;
    if (!(isViewSolo && currentLocation === ViewContainerLocation.Panel)) {
      items.push({
        id: "_.panel.newcontainer",
        label: localize({ key: "moveFocusedView.newContainerInPanel", comment: ["Creates a new top-level tab in the panel."] }, "New Panel Entry")
      });
    }
    if (!(isViewSolo && currentLocation === ViewContainerLocation.Sidebar)) {
      items.push({
        id: "_.sidebar.newcontainer",
        label: localize("moveFocusedView.newContainerInSidebar", "New Side Bar Entry")
      });
    }
    if (!(isViewSolo && currentLocation === ViewContainerLocation.AuxiliaryBar)) {
      items.push({
        id: "_.auxiliarybar.newcontainer",
        label: localize("moveFocusedView.newContainerInSidePanel", "New Secondary Side Bar Entry")
      });
    }
    items.push({
      type: "separator",
      label: localize("sidebar", "Side Bar")
    });
    const pinnedViewlets = paneCompositePartService.getVisiblePaneCompositeIds(ViewContainerLocation.Sidebar);
    items.push(...pinnedViewlets.filter((viewletId) => {
      if (viewletId === viewDescriptorService.getViewContainerByViewId(focusedViewId).id) {
        return false;
      }
      return !viewDescriptorService.getViewContainerById(viewletId).rejectAddedViews;
    }).map((viewletId) => {
      return {
        id: viewletId,
        label: viewDescriptorService.getViewContainerModel(viewDescriptorService.getViewContainerById(viewletId)).title
      };
    }));
    items.push({
      type: "separator",
      label: localize("panel", "Panel")
    });
    const pinnedPanels = paneCompositePartService.getPinnedPaneCompositeIds(ViewContainerLocation.Panel);
    items.push(...pinnedPanels.filter((panel) => {
      if (panel === viewDescriptorService.getViewContainerByViewId(focusedViewId).id) {
        return false;
      }
      return !viewDescriptorService.getViewContainerById(panel).rejectAddedViews;
    }).map((panel) => {
      return {
        id: panel,
        label: viewDescriptorService.getViewContainerModel(viewDescriptorService.getViewContainerById(panel)).title
      };
    }));
    items.push({
      type: "separator",
      label: localize("secondarySideBar", "Secondary Side Bar")
    });
    const pinnedAuxPanels = paneCompositePartService.getPinnedPaneCompositeIds(ViewContainerLocation.AuxiliaryBar);
    items.push(...pinnedAuxPanels.filter((panel) => {
      if (panel === viewDescriptorService.getViewContainerByViewId(focusedViewId).id) {
        return false;
      }
      return !viewDescriptorService.getViewContainerById(panel).rejectAddedViews;
    }).map((panel) => {
      return {
        id: panel,
        label: viewDescriptorService.getViewContainerModel(viewDescriptorService.getViewContainerById(panel)).title
      };
    }));
    quickPick.items = items;
    disposables.add(quickPick.onDidAccept(() => {
      const destination = quickPick.selectedItems[0];
      if (destination.id === "_.panel.newcontainer") {
        viewDescriptorService.moveViewToLocation(viewDescriptor, ViewContainerLocation.Panel, this.desc.id);
        viewsService.openView(focusedViewId, true);
      } else if (destination.id === "_.sidebar.newcontainer") {
        viewDescriptorService.moveViewToLocation(viewDescriptor, ViewContainerLocation.Sidebar, this.desc.id);
        viewsService.openView(focusedViewId, true);
      } else if (destination.id === "_.auxiliarybar.newcontainer") {
        viewDescriptorService.moveViewToLocation(viewDescriptor, ViewContainerLocation.AuxiliaryBar, this.desc.id);
        viewsService.openView(focusedViewId, true);
      } else if (destination.id) {
        viewDescriptorService.moveViewsToContainer([viewDescriptor], viewDescriptorService.getViewContainerById(destination.id), void 0, this.desc.id);
        viewsService.openView(focusedViewId, true);
      }
      quickPick.hide();
    }));
    disposables.add(quickPick.onDidHide(() => disposables.dispose()));
    quickPick.show();
  }
}
registerAction2(MoveFocusedViewAction);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.resetFocusedViewLocation",
      title: localize2("resetFocusedViewLocation", "Reset Focused View Location"),
      category: Categories.View,
      f1: true,
      precondition: FocusedViewContext.notEqualsTo("")
    });
  }
  run(accessor) {
    const viewDescriptorService = accessor.get(IViewDescriptorService);
    const contextKeyService = accessor.get(IContextKeyService);
    const dialogService = accessor.get(IDialogService);
    const viewsService = accessor.get(IViewsService);
    const focusedViewId = FocusedViewContext.getValue(contextKeyService);
    let viewDescriptor = null;
    if (focusedViewId !== void 0 && focusedViewId.trim() !== "") {
      viewDescriptor = viewDescriptorService.getViewDescriptorById(focusedViewId);
    }
    if (!viewDescriptor) {
      dialogService.error(localize("resetFocusedView.error.noFocusedView", "There is no view currently focused."));
      return;
    }
    const defaultContainer = viewDescriptorService.getDefaultContainerById(viewDescriptor.id);
    if (!defaultContainer || defaultContainer === viewDescriptorService.getViewContainerByViewId(viewDescriptor.id)) {
      return;
    }
    viewDescriptorService.moveViewsToContainer([viewDescriptor], defaultContainer, void 0, this.desc.id);
    viewsService.openView(viewDescriptor.id, true);
  }
});
class BaseResizeViewAction extends Action2 {
  // This is a css pixel size
  resizePart(widthChange, heightChange, layoutService, partToResize) {
    if (layoutService.activeContainer !== layoutService.mainContainer) {
      return;
    }
    let part;
    if (partToResize === void 0) {
      const isEditorFocus = layoutService.hasFocus(Parts.EDITOR_PART);
      const isSidebarFocus = layoutService.hasFocus(Parts.SIDEBAR_PART);
      const isPanelFocus = layoutService.hasFocus(Parts.PANEL_PART);
      const isAuxiliaryBarFocus = layoutService.hasFocus(Parts.AUXILIARYBAR_PART);
      if (isSidebarFocus) {
        part = Parts.SIDEBAR_PART;
      } else if (isPanelFocus) {
        part = Parts.PANEL_PART;
      } else if (isEditorFocus) {
        part = Parts.EDITOR_PART;
      } else if (isAuxiliaryBarFocus) {
        part = Parts.AUXILIARYBAR_PART;
      }
    } else {
      part = partToResize;
    }
    if (part) {
      layoutService.resizePart(part, widthChange, heightChange);
    }
  }
}
BaseResizeViewAction.RESIZE_INCREMENT = 60;
class IncreaseViewSizeAction extends BaseResizeViewAction {
  constructor() {
    super({
      id: "workbench.action.increaseViewSize",
      title: localize2("increaseViewSize", "Increase Current View Size"),
      f1: true,
      precondition: IsAuxiliaryWindowFocusedContext.toNegated()
    });
  }
  run(accessor) {
    this.resizePart(BaseResizeViewAction.RESIZE_INCREMENT, BaseResizeViewAction.RESIZE_INCREMENT, accessor.get(IWorkbenchLayoutService));
  }
}
class IncreaseViewWidthAction extends BaseResizeViewAction {
  constructor() {
    super({
      id: "workbench.action.increaseViewWidth",
      title: localize2("increaseEditorWidth", "Increase Editor Width"),
      f1: true,
      precondition: IsAuxiliaryWindowFocusedContext.toNegated()
    });
  }
  run(accessor) {
    this.resizePart(BaseResizeViewAction.RESIZE_INCREMENT, 0, accessor.get(IWorkbenchLayoutService), Parts.EDITOR_PART);
  }
}
class IncreaseViewHeightAction extends BaseResizeViewAction {
  constructor() {
    super({
      id: "workbench.action.increaseViewHeight",
      title: localize2("increaseEditorHeight", "Increase Editor Height"),
      f1: true,
      precondition: IsAuxiliaryWindowFocusedContext.toNegated()
    });
  }
  run(accessor) {
    this.resizePart(0, BaseResizeViewAction.RESIZE_INCREMENT, accessor.get(IWorkbenchLayoutService), Parts.EDITOR_PART);
  }
}
class DecreaseViewSizeAction extends BaseResizeViewAction {
  constructor() {
    super({
      id: "workbench.action.decreaseViewSize",
      title: localize2("decreaseViewSize", "Decrease Current View Size"),
      f1: true,
      precondition: IsAuxiliaryWindowFocusedContext.toNegated()
    });
  }
  run(accessor) {
    this.resizePart(-BaseResizeViewAction.RESIZE_INCREMENT, -BaseResizeViewAction.RESIZE_INCREMENT, accessor.get(IWorkbenchLayoutService));
  }
}
class DecreaseViewWidthAction extends BaseResizeViewAction {
  constructor() {
    super({
      id: "workbench.action.decreaseViewWidth",
      title: localize2("decreaseEditorWidth", "Decrease Editor Width"),
      f1: true,
      precondition: IsAuxiliaryWindowFocusedContext.toNegated()
    });
  }
  run(accessor) {
    this.resizePart(-BaseResizeViewAction.RESIZE_INCREMENT, 0, accessor.get(IWorkbenchLayoutService), Parts.EDITOR_PART);
  }
}
class DecreaseViewHeightAction extends BaseResizeViewAction {
  constructor() {
    super({
      id: "workbench.action.decreaseViewHeight",
      title: localize2("decreaseEditorHeight", "Decrease Editor Height"),
      f1: true,
      precondition: IsAuxiliaryWindowFocusedContext.toNegated()
    });
  }
  run(accessor) {
    this.resizePart(0, -BaseResizeViewAction.RESIZE_INCREMENT, accessor.get(IWorkbenchLayoutService), Parts.EDITOR_PART);
  }
}
registerAction2(IncreaseViewSizeAction);
registerAction2(IncreaseViewWidthAction);
registerAction2(IncreaseViewHeightAction);
registerAction2(DecreaseViewSizeAction);
registerAction2(DecreaseViewWidthAction);
registerAction2(DecreaseViewHeightAction);
registerAction2(class AlignQuickInputTopAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.alignQuickInputTop",
      title: localize2("alignQuickInputTop", "Align Quick Input Top"),
      f1: false
    });
  }
  run(accessor) {
    const quickInputService = accessor.get(IQuickInputService);
    quickInputService.setAlignment("top");
  }
});
registerAction2(class AlignQuickInputCenterAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.alignQuickInputCenter",
      title: localize2("alignQuickInputCenter", "Align Quick Input Center"),
      f1: false
    });
  }
  run(accessor) {
    const quickInputService = accessor.get(IQuickInputService);
    quickInputService.setAlignment("center");
  }
});
function isContextualLayoutVisualIcon(icon) {
  return icon.iconA !== void 0;
}
const CreateToggleLayoutItem = (id, active, label, visualIcon) => {
  return {
    id,
    active,
    label,
    visualIcon,
    activeIcon: Codicon.eye,
    inactiveIcon: Codicon.eyeClosed,
    activeAriaLabel: localize("selectToHide", "Select to Hide"),
    inactiveAriaLabel: localize("selectToShow", "Select to Show"),
    useButtons: true
  };
};
const CreateOptionLayoutItem = (id, active, label, visualIcon) => {
  return {
    id,
    active,
    label,
    visualIcon,
    activeIcon: Codicon.check,
    activeAriaLabel: localize("active", "Active"),
    useButtons: false
  };
};
const MenuBarToggledContext = ContextKeyExpr.and(IsMacNativeContext.toNegated(), ContextKeyExpr.notEquals(`config.${MenuSettings.MenuBarVisibility}`, "hidden"), ContextKeyExpr.notEquals(`config.${MenuSettings.MenuBarVisibility}`, "toggle"), ContextKeyExpr.notEquals(`config.${MenuSettings.MenuBarVisibility}`, "compact"));
const ToggleVisibilityActions = [];
if (!isMacintosh || !isNative) {
  ToggleVisibilityActions.push(CreateToggleLayoutItem("workbench.action.toggleMenuBar", MenuBarToggledContext, localize("menuBar", "Menu Bar"), menubarIcon));
}
ToggleVisibilityActions.push(...[
  CreateToggleLayoutItem(ToggleActivityBarVisibilityActionId, ContextKeyExpr.notEquals("config.workbench.activityBar.location", "hidden"), localize("activityBar", "Activity Bar"), { whenA: ContextKeyExpr.equals("config.workbench.sideBar.location", "left"), iconA: activityBarLeftIcon, iconB: activityBarRightIcon }),
  CreateToggleLayoutItem(ToggleSidebarVisibilityAction.ID, SideBarVisibleContext, localize("sideBar", "Primary Side Bar"), { whenA: ContextKeyExpr.equals("config.workbench.sideBar.location", "left"), iconA: panelLeftIcon, iconB: panelRightIcon }),
  CreateToggleLayoutItem(ToggleAuxiliaryBarAction.ID, AuxiliaryBarVisibleContext, localize("secondarySideBar", "Secondary Side Bar"), { whenA: ContextKeyExpr.equals("config.workbench.sideBar.location", "left"), iconA: panelRightIcon, iconB: panelLeftIcon }),
  CreateToggleLayoutItem(TogglePanelAction.ID, PanelVisibleContext, localize("panel", "Panel"), panelIcon),
  CreateToggleLayoutItem(ToggleStatusbarVisibilityAction.ID, ContextKeyExpr.equals("config.workbench.statusBar.visible", true), localize("statusBar", "Status Bar"), statusBarIcon)
]);
const MoveSideBarActions = [
  CreateOptionLayoutItem(MoveSidebarLeftAction.ID, ContextKeyExpr.equals("config.workbench.sideBar.location", "left"), localize("leftSideBar", "Left"), panelLeftIcon),
  CreateOptionLayoutItem(MoveSidebarRightAction.ID, ContextKeyExpr.equals("config.workbench.sideBar.location", "right"), localize("rightSideBar", "Right"), panelRightIcon)
];
const AlignPanelActions = [
  CreateOptionLayoutItem("workbench.action.alignPanelLeft", PanelAlignmentContext.isEqualTo("left"), localize("leftPanel", "Left"), panelAlignmentLeftIcon),
  CreateOptionLayoutItem("workbench.action.alignPanelRight", PanelAlignmentContext.isEqualTo("right"), localize("rightPanel", "Right"), panelAlignmentRightIcon),
  CreateOptionLayoutItem("workbench.action.alignPanelCenter", PanelAlignmentContext.isEqualTo("center"), localize("centerPanel", "Center"), panelAlignmentCenterIcon),
  CreateOptionLayoutItem("workbench.action.alignPanelJustify", PanelAlignmentContext.isEqualTo("justify"), localize("justifyPanel", "Justify"), panelAlignmentJustifyIcon)
];
const QuickInputActions = [
  CreateOptionLayoutItem("workbench.action.alignQuickInputTop", QuickInputAlignmentContextKey.isEqualTo("top"), localize("top", "Top"), quickInputAlignmentTopIcon),
  CreateOptionLayoutItem("workbench.action.alignQuickInputCenter", QuickInputAlignmentContextKey.isEqualTo("center"), localize("center", "Center"), quickInputAlignmentCenterIcon)
];
const MiscLayoutOptions = [
  CreateOptionLayoutItem("workbench.action.toggleFullScreen", IsMainWindowFullscreenContext, localize("fullscreen", "Full Screen"), fullscreenIcon),
  CreateOptionLayoutItem("workbench.action.toggleZenMode", InEditorZenModeContext, localize("zenMode", "Zen Mode"), zenModeIcon),
  CreateOptionLayoutItem("workbench.action.toggleCenteredLayout", IsMainEditorCenteredLayoutContext, localize("centeredLayout", "Centered Layout"), centerLayoutIcon)
];
const LayoutContextKeySet = /* @__PURE__ */ new Set();
for (const { active } of [...ToggleVisibilityActions, ...MoveSideBarActions, ...AlignPanelActions, ...QuickInputActions, ...MiscLayoutOptions]) {
  for (const key of active.keys()) {
    LayoutContextKeySet.add(key);
  }
}
const EditorActionsInTitleBar = ContextKeyExpr.or(
  ContextKeyExpr.equals(`config.${LayoutSettings.EDITOR_ACTIONS_LOCATION}`, EditorActionsLocation.TITLEBAR),
  ContextKeyExpr.and(
    ContextKeyExpr.equals(`config.${LayoutSettings.EDITOR_ACTIONS_LOCATION}`, EditorActionsLocation.DEFAULT),
    ContextKeyExpr.equals(`config.${LayoutSettings.EDITOR_TABS_MODE}`, EditorTabsMode.NONE)
  )
);
registerAction2(class CustomizeLayoutAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.customizeLayout",
      title: localize2("customizeLayout", "Customize Layout..."),
      f1: true,
      icon: configureLayoutIcon,
      menu: [
        {
          id: MenuId.LayoutControlMenuSubmenu,
          group: "z_end"
        },
        {
          id: MenuId.LayoutControlMenu,
          when: ContextKeyExpr.and(
            IsAuxiliaryWindowContext.toNegated(),
            ContextKeyExpr.equals("config.workbench.layoutControl.type", "both"),
            EditorActionsInTitleBar.negate()
          ),
          group: "navigation"
        },
        {
          id: MenuId.LayoutControlMenu,
          when: ContextKeyExpr.and(
            IsAuxiliaryWindowContext.toNegated(),
            ContextKeyExpr.equals("config.workbench.layoutControl.type", "both"),
            EditorActionsInTitleBar
          ),
          group: "1_layout"
        }
      ]
    });
  }
  getItems(contextKeyService, keybindingService) {
    const toQuickPickItem = (item) => {
      const toggled = item.active.evaluate(contextKeyService.getContext(null));
      let label = item.useButtons ? item.label : item.label + (toggled && item.activeIcon ? ` $(${item.activeIcon.id})` : !toggled && item.inactiveIcon ? ` $(${item.inactiveIcon.id})` : "");
      const ariaLabel = item.label + (toggled && item.activeAriaLabel ? ` (${item.activeAriaLabel})` : !toggled && item.inactiveAriaLabel ? ` (${item.inactiveAriaLabel})` : "");
      if (item.visualIcon) {
        let icon2 = item.visualIcon;
        if (isContextualLayoutVisualIcon(icon2)) {
          const useIconA = icon2.whenA.evaluate(contextKeyService.getContext(null));
          icon2 = useIconA ? icon2.iconA : icon2.iconB;
        }
        label = `$(${icon2.id}) ${label}`;
      }
      const icon = toggled ? item.activeIcon : item.inactiveIcon;
      return {
        type: "item",
        id: item.id,
        label,
        ariaLabel,
        keybinding: keybindingService.lookupKeybinding(item.id, contextKeyService),
        buttons: !item.useButtons ? void 0 : [
          {
            alwaysVisible: false,
            tooltip: ariaLabel,
            iconClass: icon ? ThemeIcon.asClassName(icon) : void 0
          }
        ]
      };
    };
    return [
      {
        type: "separator",
        label: localize("toggleVisibility", "Visibility")
      },
      ...ToggleVisibilityActions.map(toQuickPickItem),
      {
        type: "separator",
        label: localize("sideBarPosition", "Primary Side Bar Position")
      },
      ...MoveSideBarActions.map(toQuickPickItem),
      {
        type: "separator",
        label: localize("panelAlignment", "Panel Alignment")
      },
      ...AlignPanelActions.map(toQuickPickItem),
      {
        type: "separator",
        label: localize("quickOpen", "Quick Input Position")
      },
      ...QuickInputActions.map(toQuickPickItem),
      {
        type: "separator",
        label: localize("layoutModes", "Modes")
      },
      ...MiscLayoutOptions.map(toQuickPickItem)
    ];
  }
  run(accessor) {
    if (this._currentQuickPick) {
      this._currentQuickPick.hide();
      return;
    }
    const configurationService = accessor.get(IConfigurationService);
    const contextKeyService = accessor.get(IContextKeyService);
    const commandService = accessor.get(ICommandService);
    const quickInputService = accessor.get(IQuickInputService);
    const keybindingService = accessor.get(IKeybindingService);
    const disposables = new DisposableStore();
    const quickPick = disposables.add(quickInputService.createQuickPick({ useSeparators: true }));
    this._currentQuickPick = quickPick;
    quickPick.items = this.getItems(contextKeyService, keybindingService);
    quickPick.ignoreFocusOut = true;
    quickPick.hideInput = true;
    quickPick.title = localize("customizeLayoutQuickPickTitle", "Customize Layout");
    const closeButton = {
      alwaysVisible: true,
      iconClass: ThemeIcon.asClassName(Codicon.close),
      tooltip: localize("close", "Close")
    };
    const resetButton = {
      alwaysVisible: true,
      iconClass: ThemeIcon.asClassName(Codicon.discard),
      tooltip: localize("restore defaults", "Restore Defaults")
    };
    quickPick.buttons = [
      resetButton,
      closeButton
    ];
    let selectedItem = void 0;
    disposables.add(contextKeyService.onDidChangeContext((changeEvent) => {
      if (changeEvent.affectsSome(LayoutContextKeySet)) {
        quickPick.items = this.getItems(contextKeyService, keybindingService);
        if (selectedItem) {
          quickPick.activeItems = quickPick.items.filter((item) => item.id === selectedItem?.id);
        }
        setTimeout(() => quickInputService.focus(), 0);
      }
    }));
    disposables.add(quickPick.onDidAccept((event) => {
      if (quickPick.selectedItems.length) {
        selectedItem = quickPick.selectedItems[0];
        commandService.executeCommand(selectedItem.id);
      }
    }));
    disposables.add(quickPick.onDidTriggerItemButton((event) => {
      if (event.item) {
        selectedItem = event.item;
        commandService.executeCommand(selectedItem.id);
      }
    }));
    disposables.add(quickPick.onDidTriggerButton((button) => {
      if (button === closeButton) {
        quickPick.hide();
      } else if (button === resetButton) {
        const resetSetting = (id) => {
          const config = configurationService.inspect(id);
          configurationService.updateValue(id, config.defaultValue);
        };
        resetSetting("workbench.activityBar.location");
        resetSetting("workbench.sideBar.location");
        resetSetting("workbench.statusBar.visible");
        resetSetting("workbench.panel.defaultLocation");
        if (!isMacintosh || !isNative) {
          resetSetting("window.menuBarVisibility");
        }
        commandService.executeCommand("workbench.action.alignPanelCenter");
        commandService.executeCommand("workbench.action.alignQuickInputTop");
      }
    }));
    disposables.add(quickPick.onDidHide(() => {
      quickPick.dispose();
    }));
    disposables.add(quickPick.onDispose(() => {
      this._currentQuickPick = void 0;
      disposables.dispose();
    }));
    quickPick.show();
  }
});
export {
  AbstractSetShowTabsAction,
  ConfigureEditorAction,
  ConfigureEditorTabsAction,
  EditorActionsDefaultAction,
  EditorActionsTitleBarAction,
  HideEditorActionsAction,
  HideEditorTabsAction,
  ShowEditorActionsAction,
  ShowMultipleEditorTabsAction,
  ShowSingleEditorTabAction,
  ToggleActivityBarVisibilityActionId,
  ToggleSidebarPositionAction,
  ToggleSidebarVisibilityAction,
  ToggleStatusbarVisibilityAction,
  ZenHideEditorTabsAction,
  ZenShowMultipleEditorTabsAction,
  ZenShowSingleEditorTabAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXGFjdGlvbnNcXGxheW91dEFjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJTG9jYWxpemVkU3RyaW5nLCBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE1lbnVJZCwgTWVudVJlZ2lzdHJ5LCByZWdpc3RlckFjdGlvbjIsIEFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBhbGVydCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aW9uc0xvY2F0aW9uLCBFZGl0b3JUYWJzTW9kZSwgSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIExheW91dFNldHRpbmdzLCBQYXJ0cywgUG9zaXRpb24sIFplbk1vZGVTZXR0aW5ncywgcG9zaXRpb25Ub1N0cmluZyB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciwgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXlNb2QsIEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MsIGlzTGludXgsIGlzV2ViLCBpc01hY2ludG9zaCwgaXNOYXRpdmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJc01hY05hdGl2ZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgQ29udGV4dEtleUV4cHJlc3Npb24sIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLCBJVmlld0Rlc2NyaXB0b3IsIFZpZXdDb250YWluZXJMb2NhdGlvblRvU3RyaW5nIH0gZnJvbSAnLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFF1aWNrUGlja0l0ZW0sIElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0sIElRdWlja1BpY2tTZXBhcmF0b3IsIElRdWlja1BpY2sgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvcGFuZWNvbXBvc2l0ZS9icm93c2VyL3BhbmVjb21wb3NpdGUuanMnO1xuaW1wb3J0IHsgVG9nZ2xlQXV4aWxpYXJ5QmFyQWN0aW9uIH0gZnJvbSAnLi4vcGFydHMvYXV4aWxpYXJ5YmFyL2F1eGlsaWFyeUJhckFjdGlvbnMuanMnO1xuaW1wb3J0IHsgVG9nZ2xlUGFuZWxBY3Rpb24gfSBmcm9tICcuLi9wYXJ0cy9wYW5lbC9wYW5lbEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEF1eGlsaWFyeUJhclZpc2libGVDb250ZXh0LCBQYW5lbEFsaWdubWVudENvbnRleHQsIFBhbmVsVmlzaWJsZUNvbnRleHQsIFNpZGVCYXJWaXNpYmxlQ29udGV4dCwgRm9jdXNlZFZpZXdDb250ZXh0LCBJbkVkaXRvclplbk1vZGVDb250ZXh0LCBJc01haW5FZGl0b3JDZW50ZXJlZExheW91dENvbnRleHQsIE1haW5FZGl0b3JBcmVhVmlzaWJsZUNvbnRleHQsIElzTWFpbldpbmRvd0Z1bGxzY3JlZW5Db250ZXh0LCBQYW5lbFBvc2l0aW9uQ29udGV4dCwgSXNBdXhpbGlhcnlXaW5kb3dGb2N1c2VkQ29udGV4dCwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsIFRpdGxlQmFyU3R5bGVDb250ZXh0LCBJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQgfSBmcm9tICcuLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZEFjdGlvblRpdGxlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb24uanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBNZW51U2V0dGluZ3MsIFRpdGxlYmFyU3R5bGUgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJUHJlZmVyZW5jZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IFF1aWNrSW5wdXRBbGlnbm1lbnRDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9icm93c2VyL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuXG4vLyBSZWdpc3RlciBJY29uc1xuY29uc3QgbWVudWJhckljb24gPSByZWdpc3Rlckljb24oJ21lbnVCYXInLCBDb2RpY29uLmxheW91dE1lbnViYXIsIGxvY2FsaXplKCdtZW51QmFySWNvbicsIFwiUmVwcmVzZW50cyB0aGUgbWVudSBiYXJcIikpO1xuY29uc3QgYWN0aXZpdHlCYXJMZWZ0SWNvbiA9IHJlZ2lzdGVySWNvbignYWN0aXZpdHktYmFyLWxlZnQnLCBDb2RpY29uLmxheW91dEFjdGl2aXR5YmFyTGVmdCwgbG9jYWxpemUoJ2FjdGl2aXR5QmFyTGVmdCcsIFwiUmVwcmVzZW50cyB0aGUgYWN0aXZpdHkgYmFyIGluIHRoZSBsZWZ0IHBvc2l0aW9uXCIpKTtcbmNvbnN0IGFjdGl2aXR5QmFyUmlnaHRJY29uID0gcmVnaXN0ZXJJY29uKCdhY3Rpdml0eS1iYXItcmlnaHQnLCBDb2RpY29uLmxheW91dEFjdGl2aXR5YmFyUmlnaHQsIGxvY2FsaXplKCdhY3Rpdml0eUJhclJpZ2h0JywgXCJSZXByZXNlbnRzIHRoZSBhY3Rpdml0eSBiYXIgaW4gdGhlIHJpZ2h0IHBvc2l0aW9uXCIpKTtcbmNvbnN0IHBhbmVsTGVmdEljb24gPSByZWdpc3Rlckljb24oJ3BhbmVsLWxlZnQnLCBDb2RpY29uLmxheW91dFNpZGViYXJMZWZ0LCBsb2NhbGl6ZSgncGFuZWxMZWZ0JywgXCJSZXByZXNlbnRzIGEgc2lkZSBiYXIgaW4gdGhlIGxlZnQgcG9zaXRpb25cIikpO1xuY29uc3QgcGFuZWxMZWZ0T2ZmSWNvbiA9IHJlZ2lzdGVySWNvbigncGFuZWwtbGVmdC1vZmYnLCBDb2RpY29uLmxheW91dFNpZGViYXJMZWZ0T2ZmLCBsb2NhbGl6ZSgncGFuZWxMZWZ0T2ZmJywgXCJSZXByZXNlbnRzIGEgc2lkZSBiYXIgaW4gdGhlIGxlZnQgcG9zaXRpb24gdG9nZ2xlZCBvZmZcIikpO1xuY29uc3QgcGFuZWxSaWdodEljb24gPSByZWdpc3Rlckljb24oJ3BhbmVsLXJpZ2h0JywgQ29kaWNvbi5sYXlvdXRTaWRlYmFyUmlnaHQsIGxvY2FsaXplKCdwYW5lbFJpZ2h0JywgXCJSZXByZXNlbnRzIHNpZGUgYmFyIGluIHRoZSByaWdodCBwb3NpdGlvblwiKSk7XG5jb25zdCBwYW5lbFJpZ2h0T2ZmSWNvbiA9IHJlZ2lzdGVySWNvbigncGFuZWwtcmlnaHQtb2ZmJywgQ29kaWNvbi5sYXlvdXRTaWRlYmFyUmlnaHRPZmYsIGxvY2FsaXplKCdwYW5lbFJpZ2h0T2ZmJywgXCJSZXByZXNlbnRzIHNpZGUgYmFyIGluIHRoZSByaWdodCBwb3NpdGlvbiB0b2dnbGVkIG9mZlwiKSk7XG5jb25zdCBwYW5lbEljb24gPSByZWdpc3Rlckljb24oJ3BhbmVsLWJvdHRvbScsIENvZGljb24ubGF5b3V0UGFuZWwsIGxvY2FsaXplKCdwYW5lbEJvdHRvbScsIFwiUmVwcmVzZW50cyB0aGUgYm90dG9tIHBhbmVsXCIpKTtcbmNvbnN0IHN0YXR1c0Jhckljb24gPSByZWdpc3Rlckljb24oJ3N0YXR1c0JhcicsIENvZGljb24ubGF5b3V0U3RhdHVzYmFyLCBsb2NhbGl6ZSgnc3RhdHVzQmFySWNvbicsIFwiUmVwcmVzZW50cyB0aGUgc3RhdHVzIGJhclwiKSk7XG5cbmNvbnN0IHBhbmVsQWxpZ25tZW50TGVmdEljb24gPSByZWdpc3Rlckljb24oJ3BhbmVsLWFsaWduLWxlZnQnLCBDb2RpY29uLmxheW91dFBhbmVsTGVmdCwgbG9jYWxpemUoJ3BhbmVsQm90dG9tTGVmdCcsIFwiUmVwcmVzZW50cyB0aGUgYm90dG9tIHBhbmVsIGFsaWdubWVudCBzZXQgdG8gdGhlIGxlZnRcIikpO1xuY29uc3QgcGFuZWxBbGlnbm1lbnRSaWdodEljb24gPSByZWdpc3Rlckljb24oJ3BhbmVsLWFsaWduLXJpZ2h0JywgQ29kaWNvbi5sYXlvdXRQYW5lbFJpZ2h0LCBsb2NhbGl6ZSgncGFuZWxCb3R0b21SaWdodCcsIFwiUmVwcmVzZW50cyB0aGUgYm90dG9tIHBhbmVsIGFsaWdubWVudCBzZXQgdG8gdGhlIHJpZ2h0XCIpKTtcbmNvbnN0IHBhbmVsQWxpZ25tZW50Q2VudGVySWNvbiA9IHJlZ2lzdGVySWNvbigncGFuZWwtYWxpZ24tY2VudGVyJywgQ29kaWNvbi5sYXlvdXRQYW5lbENlbnRlciwgbG9jYWxpemUoJ3BhbmVsQm90dG9tQ2VudGVyJywgXCJSZXByZXNlbnRzIHRoZSBib3R0b20gcGFuZWwgYWxpZ25tZW50IHNldCB0byB0aGUgY2VudGVyXCIpKTtcbmNvbnN0IHBhbmVsQWxpZ25tZW50SnVzdGlmeUljb24gPSByZWdpc3Rlckljb24oJ3BhbmVsLWFsaWduLWp1c3RpZnknLCBDb2RpY29uLmxheW91dFBhbmVsSnVzdGlmeSwgbG9jYWxpemUoJ3BhbmVsQm90dG9tSnVzdGlmeScsIFwiUmVwcmVzZW50cyB0aGUgYm90dG9tIHBhbmVsIGFsaWdubWVudCBzZXQgdG8ganVzdGlmaWVkXCIpKTtcblxuY29uc3QgcXVpY2tJbnB1dEFsaWdubWVudFRvcEljb24gPSByZWdpc3Rlckljb24oJ3F1aWNrSW5wdXRBbGlnbm1lbnRUb3AnLCBDb2RpY29uLmFycm93VXAsIGxvY2FsaXplKCdxdWlja0lucHV0QWxpZ25tZW50VG9wJywgXCJSZXByZXNlbnRzIHF1aWNrIGlucHV0IGFsaWdubWVudCBzZXQgdG8gdGhlIHRvcFwiKSk7XG5jb25zdCBxdWlja0lucHV0QWxpZ25tZW50Q2VudGVySWNvbiA9IHJlZ2lzdGVySWNvbigncXVpY2tJbnB1dEFsaWdubWVudENlbnRlcicsIENvZGljb24uY2lyY2xlLCBsb2NhbGl6ZSgncXVpY2tJbnB1dEFsaWdubWVudENlbnRlcicsIFwiUmVwcmVzZW50cyBxdWljayBpbnB1dCBhbGlnbm1lbnQgc2V0IHRvIHRoZSBjZW50ZXJcIikpO1xuXG5jb25zdCBmdWxsc2NyZWVuSWNvbiA9IHJlZ2lzdGVySWNvbignZnVsbHNjcmVlbicsIENvZGljb24uc2NyZWVuRnVsbCwgbG9jYWxpemUoJ2Z1bGxTY3JlZW5JY29uJywgXCJSZXByZXNlbnRzIGZ1bGwgc2NyZWVuXCIpKTtcbmNvbnN0IGNlbnRlckxheW91dEljb24gPSByZWdpc3Rlckljb24oJ2NlbnRlckxheW91dEljb24nLCBDb2RpY29uLmxheW91dENlbnRlcmVkLCBsb2NhbGl6ZSgnY2VudGVyTGF5b3V0SWNvbicsIFwiUmVwcmVzZW50cyBjZW50ZXJlZCBsYXlvdXQgbW9kZVwiKSk7XG5jb25zdCB6ZW5Nb2RlSWNvbiA9IHJlZ2lzdGVySWNvbignemVuTW9kZScsIENvZGljb24udGFyZ2V0LCBsb2NhbGl6ZSgnemVuTW9kZUljb24nLCBcIlJlcHJlc2VudHMgemVuIG1vZGVcIikpO1xuXG5leHBvcnQgY29uc3QgVG9nZ2xlQWN0aXZpdHlCYXJWaXNpYmlsaXR5QWN0aW9uSWQgPSAnd29ya2JlbmNoLmFjdGlvbi50b2dnbGVBY3Rpdml0eUJhclZpc2liaWxpdHknO1xuXG4vLyAtLS0gVG9nZ2xlIENlbnRlcmVkIExheW91dFxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlQ2VudGVyZWRMYXlvdXQnLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0Li4ubG9jYWxpemUyKCd0b2dnbGVDZW50ZXJlZExheW91dCcsIFwiVG9nZ2xlIENlbnRlcmVkIExheW91dFwiKSxcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVRvZ2dsZUNlbnRlcmVkTGF5b3V0JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmQ2VudGVyZWQgTGF5b3V0XCIpLFxuXHRcdFx0fSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKElzQXV4aWxpYXJ5V2luZG93Rm9jdXNlZENvbnRleHQudG9OZWdhdGVkKCksIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHRvZ2dsZWQ6IElzTWFpbkVkaXRvckNlbnRlcmVkTGF5b3V0Q29udGV4dCxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhckFwcGVhcmFuY2VNZW51LFxuXHRcdFx0XHRncm91cDogJzFfdG9nZ2xlX3ZpZXcnLFxuXHRcdFx0XHRvcmRlcjogMyxcblx0XHRcdFx0d2hlbjogSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKClcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JHcm91cFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXG5cdFx0bGF5b3V0U2VydmljZS5jZW50ZXJNYWluRWRpdG9yTGF5b3V0KCFsYXlvdXRTZXJ2aWNlLmlzTWFpbkVkaXRvckxheW91dENlbnRlcmVkKCkpO1xuXHRcdGVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cC5mb2N1cygpO1xuXHR9XG59KTtcblxuLy8gLS0tIFNldCBTaWRlYmFyIFBvc2l0aW9uXG5jb25zdCBzaWRlYmFyUG9zaXRpb25Db25maWd1cmF0aW9uS2V5ID0gJ3dvcmtiZW5jaC5zaWRlQmFyLmxvY2F0aW9uJztcblxuY2xhc3MgTW92ZVNpZGViYXJQb3NpdGlvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcihpZDogc3RyaW5nLCB0aXRsZTogSUNvbW1hbmRBY3Rpb25UaXRsZSwgcHJpdmF0ZSByZWFkb25seSBwb3NpdGlvbjogUG9zaXRpb24pIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZCxcblx0XHRcdHRpdGxlLFxuXHRcdFx0ZjE6IGZhbHNlXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcG9zaXRpb24gPSBsYXlvdXRTZXJ2aWNlLmdldFNpZGVCYXJQb3NpdGlvbigpO1xuXHRcdGlmIChwb3NpdGlvbiAhPT0gdGhpcy5wb3NpdGlvbikge1xuXHRcdFx0cmV0dXJuIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKHNpZGViYXJQb3NpdGlvbkNvbmZpZ3VyYXRpb25LZXksIHBvc2l0aW9uVG9TdHJpbmcodGhpcy5wb3NpdGlvbikpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBNb3ZlU2lkZWJhclJpZ2h0QWN0aW9uIGV4dGVuZHMgTW92ZVNpZGViYXJQb3NpdGlvbkFjdGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLm1vdmVTaWRlQmFyUmlnaHQnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKE1vdmVTaWRlYmFyUmlnaHRBY3Rpb24uSUQsIGxvY2FsaXplMignbW92ZVNpZGViYXJSaWdodCcsIFwiTW92ZSBQcmltYXJ5IFNpZGUgQmFyIFJpZ2h0XCIpLCBQb3NpdGlvbi5SSUdIVCk7XG5cdH1cbn1cblxuY2xhc3MgTW92ZVNpZGViYXJMZWZ0QWN0aW9uIGV4dGVuZHMgTW92ZVNpZGViYXJQb3NpdGlvbkFjdGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLm1vdmVTaWRlQmFyTGVmdCc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoTW92ZVNpZGViYXJMZWZ0QWN0aW9uLklELCBsb2NhbGl6ZTIoJ21vdmVTaWRlYmFyTGVmdCcsIFwiTW92ZSBQcmltYXJ5IFNpZGUgQmFyIExlZnRcIiksIFBvc2l0aW9uLkxFRlQpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihNb3ZlU2lkZWJhclJpZ2h0QWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihNb3ZlU2lkZWJhckxlZnRBY3Rpb24pO1xuXG4vLyAtLS0gVG9nZ2xlIFNpZGViYXIgUG9zaXRpb25cblxuZXhwb3J0IGNsYXNzIFRvZ2dsZVNpZGViYXJQb3NpdGlvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZVNpZGViYXJQb3NpdGlvbic7XG5cdHN0YXRpYyByZWFkb25seSBMQUJFTCA9IGxvY2FsaXplKCd0b2dnbGVTaWRlYmFyUG9zaXRpb24nLCBcIlRvZ2dsZSBQcmltYXJ5IFNpZGUgQmFyIFBvc2l0aW9uXCIpO1xuXG5cdHN0YXRpYyBnZXRMYWJlbChsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxheW91dFNlcnZpY2UuZ2V0U2lkZUJhclBvc2l0aW9uKCkgPT09IFBvc2l0aW9uLkxFRlQgPyBsb2NhbGl6ZSgnbW92ZVNpZGViYXJSaWdodCcsIFwiTW92ZSBQcmltYXJ5IFNpZGUgQmFyIFJpZ2h0XCIpIDogbG9jYWxpemUoJ21vdmVTaWRlYmFyTGVmdCcsIFwiTW92ZSBQcmltYXJ5IFNpZGUgQmFyIExlZnRcIik7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVG9nZ2xlU2lkZWJhclBvc2l0aW9uQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndG9nZ2xlU2lkZWJhclBvc2l0aW9uJywgXCJUb2dnbGUgUHJpbWFyeSBTaWRlIEJhciBQb3NpdGlvblwiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKClcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaExheW91dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBwb3NpdGlvbiA9IGxheW91dFNlcnZpY2UuZ2V0U2lkZUJhclBvc2l0aW9uKCk7XG5cdFx0Y29uc3QgbmV3UG9zaXRpb25WYWx1ZSA9IChwb3NpdGlvbiA9PT0gUG9zaXRpb24uTEVGVCkgPyAncmlnaHQnIDogJ2xlZnQnO1xuXG5cdFx0cmV0dXJuIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKHNpZGViYXJQb3NpdGlvbkNvbmZpZ3VyYXRpb25LZXksIG5ld1Bvc2l0aW9uVmFsdWUpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihUb2dnbGVTaWRlYmFyUG9zaXRpb25BY3Rpb24pO1xuXG5jb25zdCBjb25maWd1cmVMYXlvdXRJY29uID0gcmVnaXN0ZXJJY29uKCdjb25maWd1cmUtbGF5b3V0LWljb24nLCBDb2RpY29uLmxheW91dCwgbG9jYWxpemUoJ2NvZmlndXJlTGF5b3V0SWNvbicsICdJY29uIHJlcHJlc2VudHMgd29ya2JlbmNoIGxheW91dCBjb25maWd1cmF0aW9uLicpKTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTGF5b3V0Q29udHJvbE1lbnUsIHtcblx0c3VibWVudTogTWVudUlkLkxheW91dENvbnRyb2xNZW51U3VibWVudSxcblx0dGl0bGU6IGxvY2FsaXplKCdjb25maWd1cmVMYXlvdXQnLCBcIkNvbmZpZ3VyZSBMYXlvdXRcIiksXG5cdGljb246IGNvbmZpZ3VyZUxheW91dEljb24sXG5cdGdyb3VwOiAnMV93b3JrYmVuY2hfbGF5b3V0Jyxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdElzQXV4aWxpYXJ5V2luZG93Q29udGV4dC5uZWdhdGUoKSxcblx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy53b3JrYmVuY2gubGF5b3V0Q29udHJvbC50eXBlJywgJ21lbnUnKVxuXHQpXG59KTtcblxuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW1zKFt7XG5cdGlkOiBNZW51SWQuVmlld0NvbnRhaW5lclRpdGxlQ29udGV4dCxcblx0aXRlbToge1xuXHRcdGdyb3VwOiAnM193b3JrYmVuY2hfbGF5b3V0X21vdmUnLFxuXHRcdGNvbW1hbmQ6IHtcblx0XHRcdGlkOiBUb2dnbGVTaWRlYmFyUG9zaXRpb25BY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ21vdmUgc2lkZSBiYXIgcmlnaHQnLCBcIk1vdmUgUHJpbWFyeSBTaWRlIEJhciBSaWdodFwiKVxuXHRcdH0sXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLm5vdEVxdWFscygnY29uZmlnLndvcmtiZW5jaC5zaWRlQmFyLmxvY2F0aW9uJywgJ3JpZ2h0JyksIENvbnRleHRLZXlFeHByLmVxdWFscygndmlld0NvbnRhaW5lckxvY2F0aW9uJywgVmlld0NvbnRhaW5lckxvY2F0aW9uVG9TdHJpbmcoVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpKSksXG5cdFx0b3JkZXI6IDFcblx0fVxufSwge1xuXHRpZDogTWVudUlkLlZpZXdDb250YWluZXJUaXRsZUNvbnRleHQsXG5cdGl0ZW06IHtcblx0XHRncm91cDogJzNfd29ya2JlbmNoX2xheW91dF9tb3ZlJyxcblx0XHRjb21tYW5kOiB7XG5cdFx0XHRpZDogVG9nZ2xlU2lkZWJhclBvc2l0aW9uQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdtb3ZlIHNpZGViYXIgbGVmdCcsIFwiTW92ZSBQcmltYXJ5IFNpZGUgQmFyIExlZnRcIilcblx0XHR9LFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy53b3JrYmVuY2guc2lkZUJhci5sb2NhdGlvbicsICdyaWdodCcpLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXdDb250YWluZXJMb2NhdGlvbicsIFZpZXdDb250YWluZXJMb2NhdGlvblRvU3RyaW5nKFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKSkpLFxuXHRcdG9yZGVyOiAxXG5cdH1cbn0sIHtcblx0aWQ6IE1lbnVJZC5WaWV3Q29udGFpbmVyVGl0bGVDb250ZXh0LFxuXHRpdGVtOiB7XG5cdFx0Z3JvdXA6ICczX3dvcmtiZW5jaF9sYXlvdXRfbW92ZScsXG5cdFx0Y29tbWFuZDoge1xuXHRcdFx0aWQ6IFRvZ2dsZVNpZGViYXJQb3NpdGlvbkFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbW92ZSBzZWNvbmQgc2lkZWJhciBsZWZ0JywgXCJNb3ZlIFNlY29uZGFyeSBTaWRlIEJhciBMZWZ0XCIpXG5cdFx0fSxcblx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIubm90RXF1YWxzKCdjb25maWcud29ya2JlbmNoLnNpZGVCYXIubG9jYXRpb24nLCAncmlnaHQnKSwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3Q29udGFpbmVyTG9jYXRpb24nLCBWaWV3Q29udGFpbmVyTG9jYXRpb25Ub1N0cmluZyhWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyKSkpLFxuXHRcdG9yZGVyOiAxXG5cdH1cbn0sIHtcblx0aWQ6IE1lbnVJZC5WaWV3Q29udGFpbmVyVGl0bGVDb250ZXh0LFxuXHRpdGVtOiB7XG5cdFx0Z3JvdXA6ICczX3dvcmtiZW5jaF9sYXlvdXRfbW92ZScsXG5cdFx0Y29tbWFuZDoge1xuXHRcdFx0aWQ6IFRvZ2dsZVNpZGViYXJQb3NpdGlvbkFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbW92ZSBzZWNvbmQgc2lkZWJhciByaWdodCcsIFwiTW92ZSBTZWNvbmRhcnkgU2lkZSBCYXIgUmlnaHRcIilcblx0XHR9LFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy53b3JrYmVuY2guc2lkZUJhci5sb2NhdGlvbicsICdyaWdodCcpLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXdDb250YWluZXJMb2NhdGlvbicsIFZpZXdDb250YWluZXJMb2NhdGlvblRvU3RyaW5nKFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIpKSksXG5cdFx0b3JkZXI6IDFcblx0fVxufV0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJBcHBlYXJhbmNlTWVudSwge1xuXHRncm91cDogJzNfd29ya2JlbmNoX2xheW91dF9tb3ZlJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBUb2dnbGVTaWRlYmFyUG9zaXRpb25BY3Rpb24uSUQsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlNb3ZlU2lkZWJhclJpZ2h0JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmTW92ZSBQcmltYXJ5IFNpZGUgQmFyIFJpZ2h0XCIpXG5cdH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoJ2NvbmZpZy53b3JrYmVuY2guc2lkZUJhci5sb2NhdGlvbicsICdyaWdodCcpLCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSksXG5cdG9yZGVyOiAyXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyQXBwZWFyYW5jZU1lbnUsIHtcblx0Z3JvdXA6ICczX3dvcmtiZW5jaF9sYXlvdXRfbW92ZScsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogVG9nZ2xlU2lkZWJhclBvc2l0aW9uQWN0aW9uLklELFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pTW92ZVNpZGViYXJMZWZ0JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmTW92ZSBQcmltYXJ5IFNpZGUgQmFyIExlZnRcIilcblx0fSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLndvcmtiZW5jaC5zaWRlQmFyLmxvY2F0aW9uJywgJ3JpZ2h0JyksIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKSxcblx0b3JkZXI6IDJcbn0pO1xuXG4vLyAtLS0gVG9nZ2xlIEVkaXRvciBWaXNpYmlsaXR5XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi50b2dnbGVFZGl0b3JWaXNpYmlsaXR5Jyxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLmxvY2FsaXplMigndG9nZ2xlRWRpdG9yJywgXCJUb2dnbGUgRWRpdG9yIEFyZWEgVmlzaWJpbGl0eVwiKSxcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVNob3dFZGl0b3JBcmVhJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIlNob3cgJiZFZGl0b3IgQXJlYVwiKSxcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHR0b2dnbGVkOiBNYWluRWRpdG9yQXJlYVZpc2libGVDb250ZXh0LFxuXHRcdFx0Ly8gdGhlIHdvcmtiZW5jaCBncmlkIGN1cnJlbnRseSBwcmV2ZW50cyB1cyBmcm9tIHN1cHBvcnRpbmcgcGFuZWwgbWF4aW1pemF0aW9uIHdpdGggbm9uLWNlbnRlciBwYW5lbCBhbGlnbm1lbnRcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKElzQXV4aWxpYXJ5V2luZG93Rm9jdXNlZENvbnRleHQudG9OZWdhdGVkKCksIENvbnRleHRLZXlFeHByLm9yKFBhbmVsQWxpZ25tZW50Q29udGV4dC5pc0VxdWFsVG8oJ2NlbnRlcicpLCBQYW5lbFBvc2l0aW9uQ29udGV4dC5ub3RFcXVhbHNUbygnYm90dG9tJykpKVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0YWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKS50b2dnbGVNYXhpbWl6ZWRQYW5lbCgpO1xuXHR9XG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyVmlld01lbnUsIHtcblx0Z3JvdXA6ICcyX2FwcGVhcmFuY2UnLFxuXHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaUFwcGVhcmFuY2UnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZBcHBlYXJhbmNlXCIpLFxuXHRzdWJtZW51OiBNZW51SWQuTWVudWJhckFwcGVhcmFuY2VNZW51LFxuXHR3aGVuOiBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSxcblx0b3JkZXI6IDFcbn0pO1xuXG4vLyBUb2dnbGUgU2lkZWJhciBWaXNpYmlsaXR5XG5cbmV4cG9ydCBjbGFzcyBUb2dnbGVTaWRlYmFyVmlzaWJpbGl0eUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZVNpZGViYXJWaXNpYmlsaXR5Jztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUoJ2NvbXBvc2l0ZVBhcnQuaGlkZVNpZGVCYXJMYWJlbCcsIFwiSGlkZSBQcmltYXJ5IFNpZGUgQmFyXCIpO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUb2dnbGVTaWRlYmFyVmlzaWJpbGl0eUFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3RvZ2dsZVNpZGViYXInLCAnVG9nZ2xlIFByaW1hcnkgU2lkZSBCYXIgVmlzaWJpbGl0eScpLFxuXHRcdFx0dG9nZ2xlZDoge1xuXHRcdFx0XHRjb25kaXRpb246IFNpZGVCYXJWaXNpYmxlQ29udGV4dCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdwcmltYXJ5IHNpZGViYXInLCBcIlByaW1hcnkgU2lkZSBCYXJcIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAncHJpbWFyeSBzaWRlYmFyIG1uZW1vbmljJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmUHJpbWFyeSBTaWRlIEJhclwiKSxcblx0XHRcdH0sXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ29wZW5BbmRDbG9zZVNpZGViYXInLCAnT3Blbi9TaG93IGFuZCBDbG9zZS9IaWRlIFNpZGViYXInKSxcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5QlxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuTGF5b3V0Q29udHJvbE1lbnVTdWJtZW51LFxuXHRcdFx0XHRcdGdyb3VwOiAnMF93b3JrYmVuY2hfbGF5b3V0Jyxcblx0XHRcdFx0XHRvcmRlcjogMFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFyQXBwZWFyYW5jZU1lbnUsXG5cdFx0XHRcdFx0Z3JvdXA6ICcyX3dvcmtiZW5jaF9sYXlvdXQnLFxuXHRcdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaExheW91dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGlzQ3VycmVudGx5VmlzaWJsZSA9IGxheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLlNJREVCQVJfUEFSVCk7XG5cblx0XHRsYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4oaXNDdXJyZW50bHlWaXNpYmxlLCBQYXJ0cy5TSURFQkFSX1BBUlQpO1xuXG5cdFx0Ly8gQW5ub3VuY2UgdmlzaWJpbGl0eSBjaGFuZ2UgdG8gc2NyZWVuIHJlYWRlcnNcblx0XHRjb25zdCBhbGVydE1lc3NhZ2UgPSBpc0N1cnJlbnRseVZpc2libGVcblx0XHRcdD8gbG9jYWxpemUoJ3NpZGViYXJIaWRkZW4nLCBcIlByaW1hcnkgU2lkZSBCYXIgaGlkZGVuXCIpXG5cdFx0XHQ6IGxvY2FsaXplKCdzaWRlYmFyVmlzaWJsZScsIFwiUHJpbWFyeSBTaWRlIEJhciBzaG93blwiKTtcblx0XHRhbGVydChhbGVydE1lc3NhZ2UpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihUb2dnbGVTaWRlYmFyVmlzaWJpbGl0eUFjdGlvbik7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbXMoW1xuXHR7XG5cdFx0aWQ6IE1lbnVJZC5WaWV3Q29udGFpbmVyVGl0bGVDb250ZXh0LFxuXHRcdGl0ZW06IHtcblx0XHRcdGdyb3VwOiAnM193b3JrYmVuY2hfbGF5b3V0X21vdmUnLFxuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogVG9nZ2xlU2lkZWJhclZpc2liaWxpdHlBY3Rpb24uSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY29tcG9zaXRlUGFydC5oaWRlU2lkZUJhckxhYmVsJywgXCJIaWRlIFByaW1hcnkgU2lkZSBCYXJcIiksXG5cdFx0XHR9LFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFNpZGVCYXJWaXNpYmxlQ29udGV4dCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3Q29udGFpbmVyTG9jYXRpb24nLCBWaWV3Q29udGFpbmVyTG9jYXRpb25Ub1N0cmluZyhWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcikpKSxcblx0XHRcdG9yZGVyOiAyXG5cdFx0fVxuXHR9LCB7XG5cdFx0aWQ6IE1lbnVJZC5MYXlvdXRDb250cm9sTWVudSxcblx0XHRpdGVtOiB7XG5cdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogVG9nZ2xlU2lkZWJhclZpc2liaWxpdHlBY3Rpb24uSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgndG9nZ2xlU2lkZUJhcicsIFwiVG9nZ2xlIFByaW1hcnkgU2lkZSBCYXJcIiksXG5cdFx0XHRcdGljb246IHBhbmVsTGVmdE9mZkljb24sXG5cdFx0XHRcdHRvZ2dsZWQ6IHsgY29uZGl0aW9uOiBTaWRlQmFyVmlzaWJsZUNvbnRleHQsIGljb246IHBhbmVsTGVmdEljb24gfVxuXHRcdFx0fSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0SXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy53b3JrYmVuY2gubGF5b3V0Q29udHJvbC50eXBlJywgJ3RvZ2dsZXMnKSxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy53b3JrYmVuY2gubGF5b3V0Q29udHJvbC50eXBlJywgJ2JvdGgnKSksXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLndvcmtiZW5jaC5zaWRlQmFyLmxvY2F0aW9uJywgJ2xlZnQnKVxuXHRcdFx0KSxcblx0XHRcdG9yZGVyOiAwXG5cdFx0fVxuXHR9LCB7XG5cdFx0aWQ6IE1lbnVJZC5MYXlvdXRDb250cm9sTWVudSxcblx0XHRpdGVtOiB7XG5cdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogVG9nZ2xlU2lkZWJhclZpc2liaWxpdHlBY3Rpb24uSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgndG9nZ2xlU2lkZUJhcicsIFwiVG9nZ2xlIFByaW1hcnkgU2lkZSBCYXJcIiksXG5cdFx0XHRcdGljb246IHBhbmVsUmlnaHRPZmZJY29uLFxuXHRcdFx0XHR0b2dnbGVkOiB7IGNvbmRpdGlvbjogU2lkZUJhclZpc2libGVDb250ZXh0LCBpY29uOiBwYW5lbFJpZ2h0SWNvbiB9XG5cdFx0XHR9LFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQubmVnYXRlKCksXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLndvcmtiZW5jaC5sYXlvdXRDb250cm9sLnR5cGUnLCAndG9nZ2xlcycpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLndvcmtiZW5jaC5sYXlvdXRDb250cm9sLnR5cGUnLCAnYm90aCcpKSxcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcud29ya2JlbmNoLnNpZGVCYXIubG9jYXRpb24nLCAncmlnaHQnKVxuXHRcdFx0KSxcblx0XHRcdG9yZGVyOiAyXG5cdFx0fVxuXHR9XG5dKTtcblxuLy8gLS0tIFRvZ2dsZSBTdGF0dXNiYXIgVmlzaWJpbGl0eVxuXG5leHBvcnQgY2xhc3MgVG9nZ2xlU3RhdHVzYmFyVmlzaWJpbGl0eUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZVN0YXR1c2JhclZpc2liaWxpdHknO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IHN0YXR1c2JhclZpc2libGVLZXkgPSAnd29ya2JlbmNoLnN0YXR1c0Jhci52aXNpYmxlJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVG9nZ2xlU3RhdHVzYmFyVmlzaWJpbGl0eUFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLmxvY2FsaXplMigndG9nZ2xlU3RhdHVzYmFyJywgXCJUb2dnbGUgU3RhdHVzIEJhciBWaXNpYmlsaXR5XCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pU3RhdHVzYmFyJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIlMmJnRhdHVzIEJhclwiKSxcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0dG9nZ2xlZDogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcud29ya2JlbmNoLnN0YXR1c0Jhci52aXNpYmxlJywgdHJ1ZSksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLk1lbnViYXJBcHBlYXJhbmNlTWVudSxcblx0XHRcdFx0Z3JvdXA6ICcyX3dvcmtiZW5jaF9sYXlvdXQnLFxuXHRcdFx0XHRvcmRlcjogMyxcblx0XHRcdFx0d2hlbjogSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKClcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdmlzaWJpbGl0eSA9IGxheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLlNUQVRVU0JBUl9QQVJULCBtYWluV2luZG93KTtcblx0XHRjb25zdCBuZXdWaXNpYmlsaXR5VmFsdWUgPSAhdmlzaWJpbGl0eTtcblxuXHRcdHJldHVybiBjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShUb2dnbGVTdGF0dXNiYXJWaXNpYmlsaXR5QWN0aW9uLnN0YXR1c2JhclZpc2libGVLZXksIG5ld1Zpc2liaWxpdHlWYWx1ZSk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKFRvZ2dsZVN0YXR1c2JhclZpc2liaWxpdHlBY3Rpb24pO1xuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tIEVkaXRvciBUYWJzIExheW91dCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RTZXRTaG93VGFic0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgc2V0dGluZ05hbWU6IHN0cmluZywgcHJpdmF0ZSByZWFkb25seSB2YWx1ZTogc3RyaW5nLCB0aXRsZTogSUNvbW1hbmRBY3Rpb25UaXRsZSwgaWQ6IHN0cmluZywgcHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwcmVzc2lvbiwgZGVzY3JpcHRpb246IHN0cmluZyB8IElMb2NhbGl6ZWRTdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZCxcblx0XHRcdHRpdGxlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKHByZWNvbmRpdGlvbiwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCkpLFxuXHRcdFx0bWV0YWRhdGE6IGRlc2NyaXB0aW9uID8geyBkZXNjcmlwdGlvbiB9IDogdW5kZWZpbmVkLFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0cmV0dXJuIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKHRoaXMuc2V0dGluZ05hbWUsIHRoaXMudmFsdWUpO1xuXHR9XG59XG5cbi8vIC0tLSBIaWRlIEVkaXRvciBUYWJzXG5cbmV4cG9ydCBjbGFzcyBIaWRlRWRpdG9yVGFic0FjdGlvbiBleHRlbmRzIEFic3RyYWN0U2V0U2hvd1RhYnNBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmhpZGVFZGl0b3JUYWJzJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25zdCBwcmVjb25kaXRpb24gPSBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtMYXlvdXRTZXR0aW5ncy5FRElUT1JfVEFCU19NT0RFfWAsIEVkaXRvclRhYnNNb2RlLk5PTkUpLm5lZ2F0ZSgpLCBJbkVkaXRvclplbk1vZGVDb250ZXh0Lm5lZ2F0ZSgpKSE7XG5cdFx0Y29uc3QgdGl0bGUgPSBsb2NhbGl6ZTIoJ2hpZGVFZGl0b3JUYWJzJywgJ0hpZGUgRWRpdG9yIFRhYnMnKTtcblx0XHRzdXBlcihMYXlvdXRTZXR0aW5ncy5FRElUT1JfVEFCU19NT0RFLCBFZGl0b3JUYWJzTW9kZS5OT05FLCB0aXRsZSwgSGlkZUVkaXRvclRhYnNBY3Rpb24uSUQsIHByZWNvbmRpdGlvbiwgbG9jYWxpemUyKCdoaWRlRWRpdG9yVGFic0Rlc2NyaXB0aW9uJywgXCJIaWRlIFRhYiBCYXJcIikpO1xuXHR9XG59XG5cbi8vIC0tLSBIaWRlIEVkaXRvciBUYWJzIChaZW4gTW9kZSlcblxuZXhwb3J0IGNsYXNzIFplbkhpZGVFZGl0b3JUYWJzQWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RTZXRTaG93VGFic0FjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uemVuSGlkZUVkaXRvclRhYnMnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbnN0IHByZWNvbmRpdGlvbiA9IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke1plbk1vZGVTZXR0aW5ncy5TSE9XX1RBQlN9YCwgRWRpdG9yVGFic01vZGUuTk9ORSkubmVnYXRlKCksIEluRWRpdG9yWmVuTW9kZUNvbnRleHQpITtcblx0XHRjb25zdCB0aXRsZSA9IGxvY2FsaXplMignaGlkZUVkaXRvclRhYnNaZW5Nb2RlJywgJ0hpZGUgRWRpdG9yIFRhYnMgaW4gWmVuIE1vZGUnKTtcblx0XHRzdXBlcihaZW5Nb2RlU2V0dGluZ3MuU0hPV19UQUJTLCBFZGl0b3JUYWJzTW9kZS5OT05FLCB0aXRsZSwgWmVuSGlkZUVkaXRvclRhYnNBY3Rpb24uSUQsIHByZWNvbmRpdGlvbiwgbG9jYWxpemUyKCdoaWRlRWRpdG9yVGFic1plbk1vZGVEZXNjcmlwdGlvbicsIFwiSGlkZSBUYWIgQmFyIGluIFplbiBNb2RlXCIpKTtcblx0fVxufVxuXG4vLyAtLS0gU2hvdyBNdWx0aXBsZSBFZGl0b3IgVGFic1xuXG5leHBvcnQgY2xhc3MgU2hvd011bHRpcGxlRWRpdG9yVGFic0FjdGlvbiBleHRlbmRzIEFic3RyYWN0U2V0U2hvd1RhYnNBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLnNob3dNdWx0aXBsZUVkaXRvclRhYnMnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbnN0IHByZWNvbmRpdGlvbiA9IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke0xheW91dFNldHRpbmdzLkVESVRPUl9UQUJTX01PREV9YCwgRWRpdG9yVGFic01vZGUuTVVMVElQTEUpLm5lZ2F0ZSgpLCBJbkVkaXRvclplbk1vZGVDb250ZXh0Lm5lZ2F0ZSgpKSE7XG5cdFx0Y29uc3QgdGl0bGUgPSBsb2NhbGl6ZTIoJ3Nob3dNdWx0aXBsZUVkaXRvclRhYnMnLCAnU2hvdyBNdWx0aXBsZSBFZGl0b3IgVGFicycpO1xuXG5cdFx0c3VwZXIoTGF5b3V0U2V0dGluZ3MuRURJVE9SX1RBQlNfTU9ERSwgRWRpdG9yVGFic01vZGUuTVVMVElQTEUsIHRpdGxlLCBTaG93TXVsdGlwbGVFZGl0b3JUYWJzQWN0aW9uLklELCBwcmVjb25kaXRpb24sIGxvY2FsaXplMignc2hvd011bHRpcGxlRWRpdG9yVGFic0Rlc2NyaXB0aW9uJywgXCJTaG93IFRhYiBCYXIgd2l0aCBtdWx0aXBsZSB0YWJzXCIpKTtcblx0fVxufVxuXG4vLyAtLS0gU2hvdyBNdWx0aXBsZSBFZGl0b3IgVGFicyAoWmVuIE1vZGUpXG5cbmV4cG9ydCBjbGFzcyBaZW5TaG93TXVsdGlwbGVFZGl0b3JUYWJzQWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RTZXRTaG93VGFic0FjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uemVuU2hvd011bHRpcGxlRWRpdG9yVGFicyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgcHJlY29uZGl0aW9uID0gQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7WmVuTW9kZVNldHRpbmdzLlNIT1dfVEFCU31gLCBFZGl0b3JUYWJzTW9kZS5NVUxUSVBMRSkubmVnYXRlKCksIEluRWRpdG9yWmVuTW9kZUNvbnRleHQpITtcblx0XHRjb25zdCB0aXRsZSA9IGxvY2FsaXplMignc2hvd011bHRpcGxlRWRpdG9yVGFic1plbk1vZGUnLCAnU2hvdyBNdWx0aXBsZSBFZGl0b3IgVGFicyBpbiBaZW4gTW9kZScpO1xuXG5cdFx0c3VwZXIoWmVuTW9kZVNldHRpbmdzLlNIT1dfVEFCUywgRWRpdG9yVGFic01vZGUuTVVMVElQTEUsIHRpdGxlLCBaZW5TaG93TXVsdGlwbGVFZGl0b3JUYWJzQWN0aW9uLklELCBwcmVjb25kaXRpb24sIGxvY2FsaXplMignc2hvd011bHRpcGxlRWRpdG9yVGFic1plbk1vZGVEZXNjcmlwdGlvbicsIFwiU2hvdyBUYWIgQmFyIGluIFplbiBNb2RlXCIpKTtcblx0fVxufVxuXG4vLyAtLS0gU2hvdyBTaW5nbGUgRWRpdG9yIFRhYlxuXG5leHBvcnQgY2xhc3MgU2hvd1NpbmdsZUVkaXRvclRhYkFjdGlvbiBleHRlbmRzIEFic3RyYWN0U2V0U2hvd1RhYnNBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLnNob3dFZGl0b3JUYWInO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbnN0IHByZWNvbmRpdGlvbiA9IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke0xheW91dFNldHRpbmdzLkVESVRPUl9UQUJTX01PREV9YCwgRWRpdG9yVGFic01vZGUuU0lOR0xFKS5uZWdhdGUoKSwgSW5FZGl0b3JaZW5Nb2RlQ29udGV4dC5uZWdhdGUoKSkhO1xuXHRcdGNvbnN0IHRpdGxlID0gbG9jYWxpemUyKCdzaG93U2luZ2xlRWRpdG9yVGFiJywgJ1Nob3cgU2luZ2xlIEVkaXRvciBUYWInKTtcblxuXHRcdHN1cGVyKExheW91dFNldHRpbmdzLkVESVRPUl9UQUJTX01PREUsIEVkaXRvclRhYnNNb2RlLlNJTkdMRSwgdGl0bGUsIFNob3dTaW5nbGVFZGl0b3JUYWJBY3Rpb24uSUQsIHByZWNvbmRpdGlvbiwgbG9jYWxpemUyKCdzaG93U2luZ2xlRWRpdG9yVGFiRGVzY3JpcHRpb24nLCBcIlNob3cgVGFiIEJhciB3aXRoIG9uZSBUYWJcIikpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihIaWRlRWRpdG9yVGFic0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoU2hvd011bHRpcGxlRWRpdG9yVGFic0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoU2hvd1NpbmdsZUVkaXRvclRhYkFjdGlvbik7XG5cbi8vIC0tLSBTaG93IFNpbmdsZSBFZGl0b3IgVGFiIChaZW4gTW9kZSlcblxuZXhwb3J0IGNsYXNzIFplblNob3dTaW5nbGVFZGl0b3JUYWJBY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdFNldFNob3dUYWJzQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi56ZW5TaG93RWRpdG9yVGFiJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25zdCBwcmVjb25kaXRpb24gPSBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtaZW5Nb2RlU2V0dGluZ3MuU0hPV19UQUJTfWAsIEVkaXRvclRhYnNNb2RlLlNJTkdMRSkubmVnYXRlKCksIEluRWRpdG9yWmVuTW9kZUNvbnRleHQpITtcblx0XHRjb25zdCB0aXRsZSA9IGxvY2FsaXplMignc2hvd1NpbmdsZUVkaXRvclRhYlplbk1vZGUnLCAnU2hvdyBTaW5nbGUgRWRpdG9yIFRhYiBpbiBaZW4gTW9kZScpO1xuXG5cdFx0c3VwZXIoWmVuTW9kZVNldHRpbmdzLlNIT1dfVEFCUywgRWRpdG9yVGFic01vZGUuU0lOR0xFLCB0aXRsZSwgWmVuU2hvd1NpbmdsZUVkaXRvclRhYkFjdGlvbi5JRCwgcHJlY29uZGl0aW9uLCBsb2NhbGl6ZTIoJ3Nob3dTaW5nbGVFZGl0b3JUYWJaZW5Nb2RlRGVzY3JpcHRpb24nLCBcIlNob3cgVGFiIEJhciBpbiBaZW4gTW9kZSB3aXRoIG9uZSBUYWJcIikpO1xuXHR9XG59XG5cbi8vIC0tLSBUYWIgQmFyIFN1Ym1lbnUgaW4gVmlldyBBcHBlYXJhbmNlIE1lbnVcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyQXBwZWFyYW5jZU1lbnUsIHtcblx0c3VibWVudTogTWVudUlkLkVkaXRvclRhYnNCYXJTaG93VGFic1N1Ym1lbnUsXG5cdHRpdGxlOiBsb2NhbGl6ZSgndGFiQmFyJywgXCJUYWIgQmFyXCIpLFxuXHRncm91cDogJzNfd29ya2JlbmNoX2xheW91dF9tb3ZlJyxcblx0b3JkZXI6IDEwLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSW5FZGl0b3JaZW5Nb2RlQ29udGV4dC5uZWdhdGUoKSwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCkpXG59KTtcblxuLy8gLS0tIFNob3cgRWRpdG9yIEFjdGlvbnMgaW4gVGl0bGUgQmFyXG5cbmV4cG9ydCBjbGFzcyBFZGl0b3JBY3Rpb25zVGl0bGVCYXJBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5lZGl0b3JBY3Rpb25zVGl0bGVCYXInO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBFZGl0b3JBY3Rpb25zVGl0bGVCYXJBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtb3ZlRWRpdG9yQWN0aW9uc1RvVGl0bGVCYXInLCBcIk1vdmUgRWRpdG9yIEFjdGlvbnMgdG8gVGl0bGUgQmFyXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7TGF5b3V0U2V0dGluZ3MuRURJVE9SX0FDVElPTlNfTE9DQVRJT059YCwgRWRpdG9yQWN0aW9uc0xvY2F0aW9uLlRJVExFQkFSKS5uZWdhdGUoKSwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCkpLFxuXHRcdFx0bWV0YWRhdGE6IHsgZGVzY3JpcHRpb246IGxvY2FsaXplMignbW92ZUVkaXRvckFjdGlvbnNUb1RpdGxlQmFyRGVzY3JpcHRpb24nLCBcIk1vdmUgRWRpdG9yIEFjdGlvbnMgZnJvbSB0aGUgdGFiIGJhciB0byB0aGUgdGl0bGUgYmFyXCIpIH0sXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRyZXR1cm4gY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoTGF5b3V0U2V0dGluZ3MuRURJVE9SX0FDVElPTlNfTE9DQVRJT04sIEVkaXRvckFjdGlvbnNMb2NhdGlvbi5USVRMRUJBUik7XG5cdH1cbn1cbnJlZ2lzdGVyQWN0aW9uMihFZGl0b3JBY3Rpb25zVGl0bGVCYXJBY3Rpb24pO1xuXG4vLyAtLS0gRWRpdG9yIEFjdGlvbnMgRGVmYXVsdCBQb3NpdGlvblxuXG5leHBvcnQgY2xhc3MgRWRpdG9yQWN0aW9uc0RlZmF1bHRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5lZGl0b3JBY3Rpb25zRGVmYXVsdCc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEVkaXRvckFjdGlvbnNEZWZhdWx0QWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbW92ZUVkaXRvckFjdGlvbnNUb1RhYkJhcicsIFwiTW92ZSBFZGl0b3IgQWN0aW9ucyB0byBUYWIgQmFyXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke0xheW91dFNldHRpbmdzLkVESVRPUl9BQ1RJT05TX0xPQ0FUSU9OfWAsIEVkaXRvckFjdGlvbnNMb2NhdGlvbi5ERUZBVUxUKS5uZWdhdGUoKSxcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtMYXlvdXRTZXR0aW5ncy5FRElUT1JfVEFCU19NT0RFfWAsIEVkaXRvclRhYnNNb2RlLk5PTkUpLm5lZ2F0ZSgpLFxuXHRcdFx0XHRJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSxcblx0XHRcdCksXG5cdFx0XHRtZXRhZGF0YTogeyBkZXNjcmlwdGlvbjogbG9jYWxpemUyKCdtb3ZlRWRpdG9yQWN0aW9uc1RvVGFiQmFyRGVzY3JpcHRpb24nLCBcIk1vdmUgRWRpdG9yIEFjdGlvbnMgZnJvbSB0aGUgdGl0bGUgYmFyIHRvIHRoZSB0YWIgYmFyXCIpIH0sXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRyZXR1cm4gY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoTGF5b3V0U2V0dGluZ3MuRURJVE9SX0FDVElPTlNfTE9DQVRJT04sIEVkaXRvckFjdGlvbnNMb2NhdGlvbi5ERUZBVUxUKTtcblx0fVxufVxucmVnaXN0ZXJBY3Rpb24yKEVkaXRvckFjdGlvbnNEZWZhdWx0QWN0aW9uKTtcblxuLy8gLS0tIEhpZGUgRWRpdG9yIEFjdGlvbnNcblxuZXhwb3J0IGNsYXNzIEhpZGVFZGl0b3JBY3Rpb25zQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uaGlkZUVkaXRvckFjdGlvbnMnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBIaWRlRWRpdG9yQWN0aW9uc0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2hpZGVFZGl0b3JBY3RvbnMnLCBcIkhpZGUgRWRpdG9yIEFjdGlvbnNcIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtMYXlvdXRTZXR0aW5ncy5FRElUT1JfQUNUSU9OU19MT0NBVElPTn1gLCBFZGl0b3JBY3Rpb25zTG9jYXRpb24uSElEREVOKS5uZWdhdGUoKSwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCkpLFxuXHRcdFx0bWV0YWRhdGE6IHsgZGVzY3JpcHRpb246IGxvY2FsaXplMignaGlkZUVkaXRvckFjdG9uc0Rlc2NyaXB0aW9uJywgXCJIaWRlIEVkaXRvciBBY3Rpb25zIGluIHRoZSB0YWIgYW5kIHRpdGxlIGJhclwiKSB9LFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0cmV0dXJuIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKExheW91dFNldHRpbmdzLkVESVRPUl9BQ1RJT05TX0xPQ0FUSU9OLCBFZGl0b3JBY3Rpb25zTG9jYXRpb24uSElEREVOKTtcblx0fVxufVxucmVnaXN0ZXJBY3Rpb24yKEhpZGVFZGl0b3JBY3Rpb25zQWN0aW9uKTtcblxuLy8gLS0tIEhpZGUgRWRpdG9yIEFjdGlvbnNcblxuZXhwb3J0IGNsYXNzIFNob3dFZGl0b3JBY3Rpb25zQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uc2hvd0VkaXRvckFjdGlvbnMnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTaG93RWRpdG9yQWN0aW9uc0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Nob3dFZGl0b3JBY3RvbnMnLCBcIlNob3cgRWRpdG9yIEFjdGlvbnNcIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtMYXlvdXRTZXR0aW5ncy5FRElUT1JfQUNUSU9OU19MT0NBVElPTn1gLCBFZGl0b3JBY3Rpb25zTG9jYXRpb24uSElEREVOKSwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCkpLFxuXHRcdFx0bWV0YWRhdGE6IHsgZGVzY3JpcHRpb246IGxvY2FsaXplMignc2hvd0VkaXRvckFjdG9uc0Rlc2NyaXB0aW9uJywgXCJNYWtlIEVkaXRvciBBY3Rpb25zIHZpc2libGUuXCIpIH0sXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRyZXR1cm4gY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoTGF5b3V0U2V0dGluZ3MuRURJVE9SX0FDVElPTlNfTE9DQVRJT04sIEVkaXRvckFjdGlvbnNMb2NhdGlvbi5ERUZBVUxUKTtcblx0fVxufVxucmVnaXN0ZXJBY3Rpb24yKFNob3dFZGl0b3JBY3Rpb25zQWN0aW9uKTtcblxuLy8gLS0tIEVkaXRvciBBY3Rpb25zIFBvc2l0aW9uIFN1Ym1lbnUgaW4gVmlldyBBcHBlYXJhbmNlIE1lbnVcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyQXBwZWFyYW5jZU1lbnUsIHtcblx0c3VibWVudTogTWVudUlkLkVkaXRvckFjdGlvbnNQb3NpdGlvblN1Ym1lbnUsXG5cdHRpdGxlOiBsb2NhbGl6ZSgnZWRpdG9yQWN0aW9uc1Bvc2l0aW9uJywgXCJFZGl0b3IgQWN0aW9ucyBQb3NpdGlvblwiKSxcblx0Z3JvdXA6ICczX3dvcmtiZW5jaF9sYXlvdXRfbW92ZScsXG5cdG9yZGVyOiAxMSxcblx0d2hlbjogSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKClcbn0pO1xuXG4vLyAtLS0gQ29uZmlndXJlIFRhYnMgTGF5b3V0XG5cbmV4cG9ydCBjbGFzcyBDb25maWd1cmVFZGl0b3JUYWJzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY29uZmlndXJlRWRpdG9yVGFicyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbmZpZ3VyZUVkaXRvclRhYnNBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjb25maWd1cmVUYWJzJywgXCJDb25maWd1cmUgVGFic1wiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBwcmVmZXJlbmNlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSk7XG5cdFx0cHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5TZXR0aW5ncyh7IGpzb25FZGl0b3I6IGZhbHNlLCBxdWVyeTogJ3dvcmtiZW5jaC5lZGl0b3IgdGFiJyB9KTtcblx0fVxufVxucmVnaXN0ZXJBY3Rpb24yKENvbmZpZ3VyZUVkaXRvclRhYnNBY3Rpb24pO1xuXG4vLyAtLS0gQ29uZmlndXJlIEVkaXRvclxuXG5leHBvcnQgY2xhc3MgQ29uZmlndXJlRWRpdG9yQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY29uZmlndXJlRWRpdG9yJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uZmlndXJlRWRpdG9yQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY29uZmlndXJlRWRpdG9ycycsIFwiQ29uZmlndXJlIEVkaXRvcnNcIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgcHJlZmVyZW5jZXNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQcmVmZXJlbmNlc1NlcnZpY2UpO1xuXHRcdHByZWZlcmVuY2VzU2VydmljZS5vcGVuU2V0dGluZ3MoeyBqc29uRWRpdG9yOiBmYWxzZSwgcXVlcnk6ICd3b3JrYmVuY2guZWRpdG9yJyB9KTtcblx0fVxufVxucmVnaXN0ZXJBY3Rpb24yKENvbmZpZ3VyZUVkaXRvckFjdGlvbik7XG5cbi8vIC0tLSBUb2dnbGUgUGlubmVkIFRhYnMgT24gU2VwYXJhdGUgUm93XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi50b2dnbGVTZXBhcmF0ZVBpbm5lZEVkaXRvclRhYnMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndG9nZ2xlU2VwYXJhdGVQaW5uZWRFZGl0b3JUYWJzJywgXCJTZXBhcmF0ZSBQaW5uZWQgRWRpdG9yIFRhYnNcIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke0xheW91dFNldHRpbmdzLkVESVRPUl9UQUJTX01PREV9YCwgRWRpdG9yVGFic01vZGUuTVVMVElQTEUpLFxuXHRcdFx0bWV0YWRhdGE6IHsgZGVzY3JpcHRpb246IGxvY2FsaXplMigndG9nZ2xlU2VwYXJhdGVQaW5uZWRFZGl0b3JUYWJzRGVzY3JpcHRpb24nLCBcIlRvZ2dsZSB3aGV0aGVyIHBpbm5lZCBlZGl0b3IgdGFicyBhcmUgc2hvd24gb24gYSBzZXBhcmF0ZSByb3cgYWJvdmUgdW5waW5uZWQgdGFicy5cIikgfSxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgb2xkZXR0aW5nVmFsdWUgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCd3b3JrYmVuY2guZWRpdG9yLnBpbm5lZFRhYnNPblNlcGFyYXRlUm93Jyk7XG5cdFx0Y29uc3QgbmV3U2V0dGluZ1ZhbHVlID0gIW9sZGV0dGluZ1ZhbHVlO1xuXG5cdFx0cmV0dXJuIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKCd3b3JrYmVuY2guZWRpdG9yLnBpbm5lZFRhYnNPblNlcGFyYXRlUm93JywgbmV3U2V0dGluZ1ZhbHVlKTtcblx0fVxufSk7XG5cbi8vIC0tLSBUb2dnbGUgTWVudSBCYXJcblxuaWYgKGlzV2luZG93cyB8fCBpc0xpbnV4IHx8IGlzV2ViKSB7XG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBUb2dnbGVNZW51YmFyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZU1lbnVCYXInLFxuXHRcdFx0XHR0aXRsZToge1xuXHRcdFx0XHRcdC4uLmxvY2FsaXplMigndG9nZ2xlTWVudUJhcicsIFwiVG9nZ2xlIE1lbnUgQmFyXCIpLFxuXHRcdFx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlNZW51QmFyJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIk1lbnUgJiZCYXJcIiksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0XHR0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5hbmQoSXNNYWNOYXRpdmVDb250ZXh0LnRvTmVnYXRlZCgpLCBDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoYGNvbmZpZy4ke01lbnVTZXR0aW5ncy5NZW51QmFyVmlzaWJpbGl0eX1gLCAnaGlkZGVuJyksIENvbnRleHRLZXlFeHByLm5vdEVxdWFscyhgY29uZmlnLiR7TWVudVNldHRpbmdzLk1lbnVCYXJWaXNpYmlsaXR5fWAsICd0b2dnbGUnKSwgQ29udGV4dEtleUV4cHIubm90RXF1YWxzKGBjb25maWcuJHtNZW51U2V0dGluZ3MuTWVudUJhclZpc2liaWxpdHl9YCwgJ2NvbXBhY3QnKSksXG5cdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFyQXBwZWFyYW5jZU1lbnUsXG5cdFx0XHRcdFx0Z3JvdXA6ICcyX3dvcmtiZW5jaF9sYXlvdXQnLFxuXHRcdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHRcdHdoZW46IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpXG5cdFx0XHRcdH1dXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaExheW91dFNlcnZpY2UpLnRvZ2dsZU1lbnVCYXIoKTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vIEFkZCBzZXBhcmF0ZWx5IHRvIHRpdGxlIGJhciBjb250ZXh0IG1lbnUgc28gd2UgY2FuIHVzZSBhIGRpZmZlcmVudCB0aXRsZVxuXHRmb3IgKGNvbnN0IG1lbnVJZCBvZiBbTWVudUlkLlRpdGxlQmFyQ29udGV4dCwgTWVudUlkLlRpdGxlQmFyVGl0bGVDb250ZXh0XSkge1xuXHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShtZW51SWQsIHtcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZU1lbnVCYXInLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ21pTWVudUJhck5vTW5lbW9uaWMnLCBcIk1lbnUgQmFyXCIpLFxuXHRcdFx0XHR0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5hbmQoSXNNYWNOYXRpdmVDb250ZXh0LnRvTmVnYXRlZCgpLCBDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoYGNvbmZpZy4ke01lbnVTZXR0aW5ncy5NZW51QmFyVmlzaWJpbGl0eX1gLCAnaGlkZGVuJyksIENvbnRleHRLZXlFeHByLm5vdEVxdWFscyhgY29uZmlnLiR7TWVudVNldHRpbmdzLk1lbnVCYXJWaXNpYmlsaXR5fWAsICd0b2dnbGUnKSwgQ29udGV4dEtleUV4cHIubm90RXF1YWxzKGBjb25maWcuJHtNZW51U2V0dGluZ3MuTWVudUJhclZpc2liaWxpdHl9YCwgJ2NvbXBhY3QnKSlcblx0XHRcdH0sXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNBdXhpbGlhcnlXaW5kb3dGb2N1c2VkQ29udGV4dC50b05lZ2F0ZWQoKSwgQ29udGV4dEtleUV4cHIubm90RXF1YWxzKFRpdGxlQmFyU3R5bGVDb250ZXh0LmtleSwgVGl0bGViYXJTdHlsZS5OQVRJVkUpLCBJc01haW5XaW5kb3dGdWxsc2NyZWVuQ29udGV4dC5uZWdhdGUoKSksXG5cdFx0XHRncm91cDogJzJfY29uZmlnJyxcblx0XHRcdG9yZGVyOiAwXG5cdFx0fSk7XG5cdH1cbn1cblxuLy8gLS0tIFJlc2V0IFZpZXcgTG9jYXRpb25zXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5yZXNldFZpZXdMb2NhdGlvbnMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncmVzZXRWaWV3TG9jYXRpb25zJywgXCJSZXNldCBWaWV3IExvY2F0aW9uc1wiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0cmV0dXJuIGFjY2Vzc29yLmdldChJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlKS5yZXNldCgpO1xuXHR9XG59KTtcblxuLy8gLS0tIE1vdmUgVmlld1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ubW92ZVZpZXcnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbW92ZVZpZXcnLCBcIk1vdmUgVmlld1wiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3RGVzY3JpcHRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IHBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGZvY3VzZWRWaWV3SWQgPSBGb2N1c2VkVmlld0NvbnRleHQuZ2V0VmFsdWUoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGxldCB2aWV3SWQ6IHN0cmluZztcblxuXHRcdGlmIChmb2N1c2VkVmlld0lkICYmIHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3RGVzY3JpcHRvckJ5SWQoZm9jdXNlZFZpZXdJZCk/LmNhbk1vdmVWaWV3KSB7XG5cdFx0XHR2aWV3SWQgPSBmb2N1c2VkVmlld0lkO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHR2aWV3SWQgPSBhd2FpdCB0aGlzLmdldFZpZXcocXVpY2tJbnB1dFNlcnZpY2UsIHZpZXdEZXNjcmlwdG9yU2VydmljZSwgcGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlLCB2aWV3SWQhKTtcblx0XHRcdGlmICghdmlld0lkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbW92ZUZvY3VzZWRWaWV3QWN0aW9uID0gbmV3IE1vdmVGb2N1c2VkVmlld0FjdGlvbigpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gbW92ZUZvY3VzZWRWaWV3QWN0aW9uLnJ1bihhY2Nlc3Nvciwgdmlld0lkKSk7XG5cdFx0fSBjYXRjaCB7IH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0Vmlld0l0ZW1zKHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgcGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlOiBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlKTogQXJyYXk8UXVpY2tQaWNrSXRlbT4ge1xuXHRcdGNvbnN0IHJlc3VsdHM6IEFycmF5PFF1aWNrUGlja0l0ZW0+ID0gW107XG5cblx0XHRjb25zdCB2aWV3bGV0cyA9IHBhbmVDb21wb3NpdGVQYXJ0U2VydmljZS5nZXRWaXNpYmxlUGFuZUNvbXBvc2l0ZUlkcyhWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cdFx0dmlld2xldHMuZm9yRWFjaCh2aWV3bGV0SWQgPT4ge1xuXHRcdFx0Y29uc3QgY29udGFpbmVyID0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeUlkKHZpZXdsZXRJZCkhO1xuXHRcdFx0Y29uc3QgY29udGFpbmVyTW9kZWwgPSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKGNvbnRhaW5lcik7XG5cblx0XHRcdGxldCBoYXNBZGRlZFZpZXcgPSBmYWxzZTtcblx0XHRcdGNvbnRhaW5lck1vZGVsLnZpc2libGVWaWV3RGVzY3JpcHRvcnMuZm9yRWFjaCh2aWV3RGVzY3JpcHRvciA9PiB7XG5cdFx0XHRcdGlmICh2aWV3RGVzY3JpcHRvci5jYW5Nb3ZlVmlldykge1xuXHRcdFx0XHRcdGlmICghaGFzQWRkZWRWaWV3KSB7XG5cdFx0XHRcdFx0XHRyZXN1bHRzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc2VwYXJhdG9yJyxcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzaWRlYmFyQ29udGFpbmVyJywgXCJTaWRlIEJhciAvIHswfVwiLCBjb250YWluZXJNb2RlbC50aXRsZSlcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0aGFzQWRkZWRWaWV3ID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXN1bHRzLnB1c2goe1xuXHRcdFx0XHRcdFx0aWQ6IHZpZXdEZXNjcmlwdG9yLmlkLFxuXHRcdFx0XHRcdFx0bGFiZWw6IHZpZXdEZXNjcmlwdG9yLm5hbWUudmFsdWVcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBwYW5lbHMgPSBwYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UuZ2V0UGlubmVkUGFuZUNvbXBvc2l0ZUlkcyhWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpO1xuXHRcdHBhbmVscy5mb3JFYWNoKHBhbmVsID0+IHtcblx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlJZChwYW5lbCkhO1xuXHRcdFx0Y29uc3QgY29udGFpbmVyTW9kZWwgPSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKGNvbnRhaW5lcik7XG5cblx0XHRcdGxldCBoYXNBZGRlZFZpZXcgPSBmYWxzZTtcblx0XHRcdGNvbnRhaW5lck1vZGVsLnZpc2libGVWaWV3RGVzY3JpcHRvcnMuZm9yRWFjaCh2aWV3RGVzY3JpcHRvciA9PiB7XG5cdFx0XHRcdGlmICh2aWV3RGVzY3JpcHRvci5jYW5Nb3ZlVmlldykge1xuXHRcdFx0XHRcdGlmICghaGFzQWRkZWRWaWV3KSB7XG5cdFx0XHRcdFx0XHRyZXN1bHRzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc2VwYXJhdG9yJyxcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwYW5lbENvbnRhaW5lcicsIFwiUGFuZWwgLyB7MH1cIiwgY29udGFpbmVyTW9kZWwudGl0bGUpXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdGhhc0FkZGVkVmlldyA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmVzdWx0cy5wdXNoKHtcblx0XHRcdFx0XHRcdGlkOiB2aWV3RGVzY3JpcHRvci5pZCxcblx0XHRcdFx0XHRcdGxhYmVsOiB2aWV3RGVzY3JpcHRvci5uYW1lLnZhbHVlXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cblx0XHRjb25zdCBzaWRlUGFuZWxzID0gcGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlLmdldFBpbm5lZFBhbmVDb21wb3NpdGVJZHMoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcik7XG5cdFx0c2lkZVBhbmVscy5mb3JFYWNoKHBhbmVsID0+IHtcblx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlJZChwYW5lbCkhO1xuXHRcdFx0Y29uc3QgY29udGFpbmVyTW9kZWwgPSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKGNvbnRhaW5lcik7XG5cblx0XHRcdGxldCBoYXNBZGRlZFZpZXcgPSBmYWxzZTtcblx0XHRcdGNvbnRhaW5lck1vZGVsLnZpc2libGVWaWV3RGVzY3JpcHRvcnMuZm9yRWFjaCh2aWV3RGVzY3JpcHRvciA9PiB7XG5cdFx0XHRcdGlmICh2aWV3RGVzY3JpcHRvci5jYW5Nb3ZlVmlldykge1xuXHRcdFx0XHRcdGlmICghaGFzQWRkZWRWaWV3KSB7XG5cdFx0XHRcdFx0XHRyZXN1bHRzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc2VwYXJhdG9yJyxcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzZWNvbmRhcnlTaWRlQmFyQ29udGFpbmVyJywgXCJTZWNvbmRhcnkgU2lkZSBCYXIgLyB7MH1cIiwgY29udGFpbmVyTW9kZWwudGl0bGUpXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdGhhc0FkZGVkVmlldyA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmVzdWx0cy5wdXNoKHtcblx0XHRcdFx0XHRcdGlkOiB2aWV3RGVzY3JpcHRvci5pZCxcblx0XHRcdFx0XHRcdGxhYmVsOiB2aWV3RGVzY3JpcHRvci5uYW1lLnZhbHVlXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHJlc3VsdHM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFZpZXcocXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBwYW5lQ29tcG9zaXRlUGFydFNlcnZpY2U6IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UsIHZpZXdJZD86IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcXVpY2tQaWNrID0gZGlzcG9zYWJsZXMuYWRkKHF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljayh7IHVzZVNlcGFyYXRvcnM6IHRydWUgfSkpO1xuXHRcdHF1aWNrUGljay5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdtb3ZlRm9jdXNlZFZpZXcuc2VsZWN0VmlldycsIFwiU2VsZWN0IGEgVmlldyB0byBNb3ZlXCIpO1xuXHRcdHF1aWNrUGljay5pdGVtcyA9IHRoaXMuZ2V0Vmlld0l0ZW1zKHZpZXdEZXNjcmlwdG9yU2VydmljZSwgcGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlKTtcblx0XHRxdWlja1BpY2suc2VsZWN0ZWRJdGVtcyA9IHF1aWNrUGljay5pdGVtcy5maWx0ZXIoaXRlbSA9PiAoaXRlbSBhcyBJUXVpY2tQaWNrSXRlbSkuaWQgPT09IHZpZXdJZCkgYXMgSVF1aWNrUGlja0l0ZW1bXTtcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdFx0Y29uc3Qgdmlld0lkID0gcXVpY2tQaWNrLnNlbGVjdGVkSXRlbXNbMF07XG5cdFx0XHRcdGlmICh2aWV3SWQuaWQpIHtcblx0XHRcdFx0XHRyZXNvbHZlKHZpZXdJZC5pZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVqZWN0KCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRxdWlja1BpY2suaGlkZSgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmVqZWN0KCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHF1aWNrUGljay5zaG93KCk7XG5cdFx0fSk7XG5cdH1cbn0pO1xuXG4vLyAtLS0gTW92ZSBGb2N1c2VkIFZpZXdcblxuY2xhc3MgTW92ZUZvY3VzZWRWaWV3QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm1vdmVGb2N1c2VkVmlldycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtb3ZlRm9jdXNlZFZpZXcnLCBcIk1vdmUgRm9jdXNlZCBWaWV3XCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdHByZWNvbmRpdGlvbjogRm9jdXNlZFZpZXdDb250ZXh0Lm5vdEVxdWFsc1RvKCcnKSxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXdJZD86IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IHBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGZvY3VzZWRWaWV3SWQgPSB2aWV3SWQgfHwgRm9jdXNlZFZpZXdDb250ZXh0LmdldFZhbHVlKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGlmIChmb2N1c2VkVmlld0lkID09PSB1bmRlZmluZWQgfHwgZm9jdXNlZFZpZXdJZC50cmltKCkgPT09ICcnKSB7XG5cdFx0XHRkaWFsb2dTZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdtb3ZlRm9jdXNlZFZpZXcuZXJyb3Iubm9Gb2N1c2VkVmlldycsIFwiVGhlcmUgaXMgbm8gdmlldyBjdXJyZW50bHkgZm9jdXNlZC5cIikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yID0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdEZXNjcmlwdG9yQnlJZChmb2N1c2VkVmlld0lkKTtcblx0XHRpZiAoIXZpZXdEZXNjcmlwdG9yPy5jYW5Nb3ZlVmlldykge1xuXHRcdFx0ZGlhbG9nU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnbW92ZUZvY3VzZWRWaWV3LmVycm9yLm5vbk1vdmFibGVWaWV3JywgXCJUaGUgY3VycmVudGx5IGZvY3VzZWQgdmlldyBpcyBub3QgbW92YWJsZS5cIikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHF1aWNrUGljayA9IGRpc3Bvc2FibGVzLmFkZChxdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2soeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0pKTtcblx0XHRxdWlja1BpY2sucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnbW92ZUZvY3VzZWRWaWV3LnNlbGVjdERlc3RpbmF0aW9uJywgXCJTZWxlY3QgYSBEZXN0aW5hdGlvbiBmb3IgdGhlIFZpZXdcIik7XG5cdFx0cXVpY2tQaWNrLnRpdGxlID0gbG9jYWxpemUoeyBrZXk6ICdtb3ZlRm9jdXNlZFZpZXcudGl0bGUnLCBjb21tZW50OiBbJ3swfSBpbmRpY2F0ZXMgdGhlIHRpdGxlIG9mIHRoZSB2aWV3IHRoZSB1c2VyIGhhcyBzZWxlY3RlZCB0byBtb3ZlLiddIH0sIFwiVmlldzogTW92ZSB7MH1cIiwgdmlld0Rlc2NyaXB0b3IubmFtZS52YWx1ZSk7XG5cblx0XHRjb25zdCBpdGVtczogQXJyYXk8SVF1aWNrUGlja0l0ZW0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yPiA9IFtdO1xuXHRcdGNvbnN0IGN1cnJlbnRDb250YWluZXIgPSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKGZvY3VzZWRWaWV3SWQpITtcblx0XHRjb25zdCBjdXJyZW50TG9jYXRpb24gPSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0xvY2F0aW9uQnlJZChmb2N1c2VkVmlld0lkKSE7XG5cdFx0Y29uc3QgaXNWaWV3U29sbyA9IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwoY3VycmVudENvbnRhaW5lcikuYWxsVmlld0Rlc2NyaXB0b3JzLmxlbmd0aCA9PT0gMTtcblxuXHRcdGlmICghKGlzVmlld1NvbG8gJiYgY3VycmVudExvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpKSB7XG5cdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0aWQ6ICdfLnBhbmVsLm5ld2NvbnRhaW5lcicsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSh7IGtleTogJ21vdmVGb2N1c2VkVmlldy5uZXdDb250YWluZXJJblBhbmVsJywgY29tbWVudDogWydDcmVhdGVzIGEgbmV3IHRvcC1sZXZlbCB0YWIgaW4gdGhlIHBhbmVsLiddIH0sIFwiTmV3IFBhbmVsIEVudHJ5XCIpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKCEoaXNWaWV3U29sbyAmJiBjdXJyZW50TG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKSkge1xuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdGlkOiAnXy5zaWRlYmFyLm5ld2NvbnRhaW5lcicsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbW92ZUZvY3VzZWRWaWV3Lm5ld0NvbnRhaW5lckluU2lkZWJhcicsIFwiTmV3IFNpZGUgQmFyIEVudHJ5XCIpXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAoIShpc1ZpZXdTb2xvICYmIGN1cnJlbnRMb2NhdGlvbiA9PT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcikpIHtcblx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRpZDogJ18uYXV4aWxpYXJ5YmFyLm5ld2NvbnRhaW5lcicsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbW92ZUZvY3VzZWRWaWV3Lm5ld0NvbnRhaW5lckluU2lkZVBhbmVsJywgXCJOZXcgU2Vjb25kYXJ5IFNpZGUgQmFyIEVudHJ5XCIpXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdHR5cGU6ICdzZXBhcmF0b3InLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzaWRlYmFyJywgXCJTaWRlIEJhclwiKVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcGlubmVkVmlld2xldHMgPSBwYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UuZ2V0VmlzaWJsZVBhbmVDb21wb3NpdGVJZHMoVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpO1xuXHRcdGl0ZW1zLnB1c2goLi4ucGlubmVkVmlld2xldHNcblx0XHRcdC5maWx0ZXIodmlld2xldElkID0+IHtcblx0XHRcdFx0aWYgKHZpZXdsZXRJZCA9PT0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeVZpZXdJZChmb2N1c2VkVmlld0lkKSEuaWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gIXZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlJZCh2aWV3bGV0SWQpIS5yZWplY3RBZGRlZFZpZXdzO1xuXHRcdFx0fSlcblx0XHRcdC5tYXAodmlld2xldElkID0+IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpZDogdmlld2xldElkLFxuXHRcdFx0XHRcdGxhYmVsOiB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlJZCh2aWV3bGV0SWQpISkudGl0bGVcblx0XHRcdFx0fTtcblx0XHRcdH0pKTtcblxuXHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0dHlwZTogJ3NlcGFyYXRvcicsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3BhbmVsJywgXCJQYW5lbFwiKVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcGlubmVkUGFuZWxzID0gcGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlLmdldFBpbm5lZFBhbmVDb21wb3NpdGVJZHMoVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsKTtcblx0XHRpdGVtcy5wdXNoKC4uLnBpbm5lZFBhbmVsc1xuXHRcdFx0LmZpbHRlcihwYW5lbCA9PiB7XG5cdFx0XHRcdGlmIChwYW5lbCA9PT0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeVZpZXdJZChmb2N1c2VkVmlld0lkKSEuaWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gIXZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlJZChwYW5lbCkhLnJlamVjdEFkZGVkVmlld3M7XG5cdFx0XHR9KVxuXHRcdFx0Lm1hcChwYW5lbCA9PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aWQ6IHBhbmVsLFxuXHRcdFx0XHRcdGxhYmVsOiB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlJZChwYW5lbCkhKS50aXRsZVxuXHRcdFx0XHR9O1xuXHRcdFx0fSkpO1xuXG5cdFx0aXRlbXMucHVzaCh7XG5cdFx0XHR0eXBlOiAnc2VwYXJhdG9yJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc2Vjb25kYXJ5U2lkZUJhcicsIFwiU2Vjb25kYXJ5IFNpZGUgQmFyXCIpXG5cdFx0fSk7XG5cblx0XHRjb25zdCBwaW5uZWRBdXhQYW5lbHMgPSBwYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UuZ2V0UGlubmVkUGFuZUNvbXBvc2l0ZUlkcyhWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyKTtcblx0XHRpdGVtcy5wdXNoKC4uLnBpbm5lZEF1eFBhbmVsc1xuXHRcdFx0LmZpbHRlcihwYW5lbCA9PiB7XG5cdFx0XHRcdGlmIChwYW5lbCA9PT0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeVZpZXdJZChmb2N1c2VkVmlld0lkKSEuaWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gIXZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlJZChwYW5lbCkhLnJlamVjdEFkZGVkVmlld3M7XG5cdFx0XHR9KVxuXHRcdFx0Lm1hcChwYW5lbCA9PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aWQ6IHBhbmVsLFxuXHRcdFx0XHRcdGxhYmVsOiB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlJZChwYW5lbCkhKS50aXRsZVxuXHRcdFx0XHR9O1xuXHRcdFx0fSkpO1xuXG5cdFx0cXVpY2tQaWNrLml0ZW1zID0gaXRlbXM7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdGNvbnN0IGRlc3RpbmF0aW9uID0gcXVpY2tQaWNrLnNlbGVjdGVkSXRlbXNbMF07XG5cblx0XHRcdGlmIChkZXN0aW5hdGlvbi5pZCA9PT0gJ18ucGFuZWwubmV3Y29udGFpbmVyJykge1xuXHRcdFx0XHR2aWV3RGVzY3JpcHRvclNlcnZpY2UubW92ZVZpZXdUb0xvY2F0aW9uKHZpZXdEZXNjcmlwdG9yLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwsIHRoaXMuZGVzYy5pZCk7XG5cdFx0XHRcdHZpZXdzU2VydmljZS5vcGVuVmlldyhmb2N1c2VkVmlld0lkLCB0cnVlKTtcblx0XHRcdH0gZWxzZSBpZiAoZGVzdGluYXRpb24uaWQgPT09ICdfLnNpZGViYXIubmV3Y29udGFpbmVyJykge1xuXHRcdFx0XHR2aWV3RGVzY3JpcHRvclNlcnZpY2UubW92ZVZpZXdUb0xvY2F0aW9uKHZpZXdEZXNjcmlwdG9yLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhciwgdGhpcy5kZXNjLmlkKTtcblx0XHRcdFx0dmlld3NTZXJ2aWNlLm9wZW5WaWV3KGZvY3VzZWRWaWV3SWQsIHRydWUpO1xuXHRcdFx0fSBlbHNlIGlmIChkZXN0aW5hdGlvbi5pZCA9PT0gJ18uYXV4aWxpYXJ5YmFyLm5ld2NvbnRhaW5lcicpIHtcblx0XHRcdFx0dmlld0Rlc2NyaXB0b3JTZXJ2aWNlLm1vdmVWaWV3VG9Mb2NhdGlvbih2aWV3RGVzY3JpcHRvciwgVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhciwgdGhpcy5kZXNjLmlkKTtcblx0XHRcdFx0dmlld3NTZXJ2aWNlLm9wZW5WaWV3KGZvY3VzZWRWaWV3SWQsIHRydWUpO1xuXHRcdFx0fSBlbHNlIGlmIChkZXN0aW5hdGlvbi5pZCkge1xuXHRcdFx0XHR2aWV3RGVzY3JpcHRvclNlcnZpY2UubW92ZVZpZXdzVG9Db250YWluZXIoW3ZpZXdEZXNjcmlwdG9yXSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeUlkKGRlc3RpbmF0aW9uLmlkKSEsIHVuZGVmaW5lZCwgdGhpcy5kZXNjLmlkKTtcblx0XHRcdFx0dmlld3NTZXJ2aWNlLm9wZW5WaWV3KGZvY3VzZWRWaWV3SWQsIHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHRxdWlja1BpY2suaGlkZSgpO1xuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRIaWRlKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSkpO1xuXG5cdFx0cXVpY2tQaWNrLnNob3coKTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoTW92ZUZvY3VzZWRWaWV3QWN0aW9uKTtcblxuLy8gLS0tIFJlc2V0IEZvY3VzZWQgVmlldyBMb2NhdGlvblxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ucmVzZXRGb2N1c2VkVmlld0xvY2F0aW9uJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Jlc2V0Rm9jdXNlZFZpZXdMb2NhdGlvbicsIFwiUmVzZXQgRm9jdXNlZCBWaWV3IExvY2F0aW9uXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBGb2N1c2VkVmlld0NvbnRleHQubm90RXF1YWxzVG8oJycpXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdEZXNjcmlwdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cblx0XHRjb25zdCBmb2N1c2VkVmlld0lkID0gRm9jdXNlZFZpZXdDb250ZXh0LmdldFZhbHVlKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGxldCB2aWV3RGVzY3JpcHRvcjogSVZpZXdEZXNjcmlwdG9yIHwgbnVsbCA9IG51bGw7XG5cdFx0aWYgKGZvY3VzZWRWaWV3SWQgIT09IHVuZGVmaW5lZCAmJiBmb2N1c2VkVmlld0lkLnRyaW0oKSAhPT0gJycpIHtcblx0XHRcdHZpZXdEZXNjcmlwdG9yID0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdEZXNjcmlwdG9yQnlJZChmb2N1c2VkVmlld0lkKTtcblx0XHR9XG5cblx0XHRpZiAoIXZpZXdEZXNjcmlwdG9yKSB7XG5cdFx0XHRkaWFsb2dTZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdyZXNldEZvY3VzZWRWaWV3LmVycm9yLm5vRm9jdXNlZFZpZXcnLCBcIlRoZXJlIGlzIG5vIHZpZXcgY3VycmVudGx5IGZvY3VzZWQuXCIpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkZWZhdWx0Q29udGFpbmVyID0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldERlZmF1bHRDb250YWluZXJCeUlkKHZpZXdEZXNjcmlwdG9yLmlkKTtcblx0XHRpZiAoIWRlZmF1bHRDb250YWluZXIgfHwgZGVmYXVsdENvbnRhaW5lciA9PT0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeVZpZXdJZCh2aWV3RGVzY3JpcHRvci5pZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR2aWV3RGVzY3JpcHRvclNlcnZpY2UubW92ZVZpZXdzVG9Db250YWluZXIoW3ZpZXdEZXNjcmlwdG9yXSwgZGVmYXVsdENvbnRhaW5lciwgdW5kZWZpbmVkLCB0aGlzLmRlc2MuaWQpO1xuXHRcdHZpZXdzU2VydmljZS5vcGVuVmlldyh2aWV3RGVzY3JpcHRvci5pZCwgdHJ1ZSk7XG5cdH1cbn0pO1xuXG4vLyAtLS0gUmVzaXplIFZpZXdcblxuYWJzdHJhY3QgY2xhc3MgQmFzZVJlc2l6ZVZpZXdBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRwcm90ZWN0ZWQgc3RhdGljIHJlYWRvbmx5IFJFU0laRV9JTkNSRU1FTlQgPSA2MDsgLy8gVGhpcyBpcyBhIGNzcyBwaXhlbCBzaXplXG5cblx0cHJvdGVjdGVkIHJlc2l6ZVBhcnQod2lkdGhDaGFuZ2U6IG51bWJlciwgaGVpZ2h0Q2hhbmdlOiBudW1iZXIsIGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBwYXJ0VG9SZXNpemU/OiBQYXJ0cyk6IHZvaWQge1xuXHRcdGlmIChsYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lciAhPT0gbGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47IC8vIHdlIGRvIG5vdCBzdXBwb3J0IHJlc2l6aW5nIGluIGF1eGlsaWFyeSB3aW5kb3dzXG5cdFx0fVxuXG5cdFx0bGV0IHBhcnQ6IFBhcnRzIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChwYXJ0VG9SZXNpemUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgaXNFZGl0b3JGb2N1cyA9IGxheW91dFNlcnZpY2UuaGFzRm9jdXMoUGFydHMuRURJVE9SX1BBUlQpO1xuXHRcdFx0Y29uc3QgaXNTaWRlYmFyRm9jdXMgPSBsYXlvdXRTZXJ2aWNlLmhhc0ZvY3VzKFBhcnRzLlNJREVCQVJfUEFSVCk7XG5cdFx0XHRjb25zdCBpc1BhbmVsRm9jdXMgPSBsYXlvdXRTZXJ2aWNlLmhhc0ZvY3VzKFBhcnRzLlBBTkVMX1BBUlQpO1xuXHRcdFx0Y29uc3QgaXNBdXhpbGlhcnlCYXJGb2N1cyA9IGxheW91dFNlcnZpY2UuaGFzRm9jdXMoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXG5cdFx0XHRpZiAoaXNTaWRlYmFyRm9jdXMpIHtcblx0XHRcdFx0cGFydCA9IFBhcnRzLlNJREVCQVJfUEFSVDtcblx0XHRcdH0gZWxzZSBpZiAoaXNQYW5lbEZvY3VzKSB7XG5cdFx0XHRcdHBhcnQgPSBQYXJ0cy5QQU5FTF9QQVJUO1xuXHRcdFx0fSBlbHNlIGlmIChpc0VkaXRvckZvY3VzKSB7XG5cdFx0XHRcdHBhcnQgPSBQYXJ0cy5FRElUT1JfUEFSVDtcblx0XHRcdH0gZWxzZSBpZiAoaXNBdXhpbGlhcnlCYXJGb2N1cykge1xuXHRcdFx0XHRwYXJ0ID0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQ7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHBhcnQgPSBwYXJ0VG9SZXNpemU7XG5cdFx0fVxuXG5cdFx0aWYgKHBhcnQpIHtcblx0XHRcdGxheW91dFNlcnZpY2UucmVzaXplUGFydChwYXJ0LCB3aWR0aENoYW5nZSwgaGVpZ2h0Q2hhbmdlKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgSW5jcmVhc2VWaWV3U2l6ZUFjdGlvbiBleHRlbmRzIEJhc2VSZXNpemVWaWV3QWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uaW5jcmVhc2VWaWV3U2l6ZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbmNyZWFzZVZpZXdTaXplJywgJ0luY3JlYXNlIEN1cnJlbnQgVmlldyBTaXplJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogSXNBdXhpbGlhcnlXaW5kb3dGb2N1c2VkQ29udGV4dC50b05lZ2F0ZWQoKVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0dGhpcy5yZXNpemVQYXJ0KEJhc2VSZXNpemVWaWV3QWN0aW9uLlJFU0laRV9JTkNSRU1FTlQsIEJhc2VSZXNpemVWaWV3QWN0aW9uLlJFU0laRV9JTkNSRU1FTlQsIGFjY2Vzc29yLmdldChJV29ya2JlbmNoTGF5b3V0U2VydmljZSkpO1xuXHR9XG59XG5cbmNsYXNzIEluY3JlYXNlVmlld1dpZHRoQWN0aW9uIGV4dGVuZHMgQmFzZVJlc2l6ZVZpZXdBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5pbmNyZWFzZVZpZXdXaWR0aCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbmNyZWFzZUVkaXRvcldpZHRoJywgJ0luY3JlYXNlIEVkaXRvciBXaWR0aCcpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IElzQXV4aWxpYXJ5V2luZG93Rm9jdXNlZENvbnRleHQudG9OZWdhdGVkKClcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdHRoaXMucmVzaXplUGFydChCYXNlUmVzaXplVmlld0FjdGlvbi5SRVNJWkVfSU5DUkVNRU5ULCAwLCBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaExheW91dFNlcnZpY2UpLCBQYXJ0cy5FRElUT1JfUEFSVCk7XG5cdH1cbn1cblxuY2xhc3MgSW5jcmVhc2VWaWV3SGVpZ2h0QWN0aW9uIGV4dGVuZHMgQmFzZVJlc2l6ZVZpZXdBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5pbmNyZWFzZVZpZXdIZWlnaHQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW5jcmVhc2VFZGl0b3JIZWlnaHQnLCAnSW5jcmVhc2UgRWRpdG9yIEhlaWdodCcpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IElzQXV4aWxpYXJ5V2luZG93Rm9jdXNlZENvbnRleHQudG9OZWdhdGVkKClcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdHRoaXMucmVzaXplUGFydCgwLCBCYXNlUmVzaXplVmlld0FjdGlvbi5SRVNJWkVfSU5DUkVNRU5ULCBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaExheW91dFNlcnZpY2UpLCBQYXJ0cy5FRElUT1JfUEFSVCk7XG5cdH1cbn1cblxuY2xhc3MgRGVjcmVhc2VWaWV3U2l6ZUFjdGlvbiBleHRlbmRzIEJhc2VSZXNpemVWaWV3QWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uZGVjcmVhc2VWaWV3U2l6ZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdkZWNyZWFzZVZpZXdTaXplJywgJ0RlY3JlYXNlIEN1cnJlbnQgVmlldyBTaXplJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogSXNBdXhpbGlhcnlXaW5kb3dGb2N1c2VkQ29udGV4dC50b05lZ2F0ZWQoKVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0dGhpcy5yZXNpemVQYXJ0KC1CYXNlUmVzaXplVmlld0FjdGlvbi5SRVNJWkVfSU5DUkVNRU5ULCAtQmFzZVJlc2l6ZVZpZXdBY3Rpb24uUkVTSVpFX0lOQ1JFTUVOVCwgYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKSk7XG5cdH1cbn1cblxuY2xhc3MgRGVjcmVhc2VWaWV3V2lkdGhBY3Rpb24gZXh0ZW5kcyBCYXNlUmVzaXplVmlld0FjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5kZWNyZWFzZVZpZXdXaWR0aCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdkZWNyZWFzZUVkaXRvcldpZHRoJywgJ0RlY3JlYXNlIEVkaXRvciBXaWR0aCcpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IElzQXV4aWxpYXJ5V2luZG93Rm9jdXNlZENvbnRleHQudG9OZWdhdGVkKClcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdHRoaXMucmVzaXplUGFydCgtQmFzZVJlc2l6ZVZpZXdBY3Rpb24uUkVTSVpFX0lOQ1JFTUVOVCwgMCwgYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKSwgUGFydHMuRURJVE9SX1BBUlQpO1xuXHR9XG59XG5cbmNsYXNzIERlY3JlYXNlVmlld0hlaWdodEFjdGlvbiBleHRlbmRzIEJhc2VSZXNpemVWaWV3QWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uZGVjcmVhc2VWaWV3SGVpZ2h0Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2RlY3JlYXNlRWRpdG9ySGVpZ2h0JywgJ0RlY3JlYXNlIEVkaXRvciBIZWlnaHQnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBJc0F1eGlsaWFyeVdpbmRvd0ZvY3VzZWRDb250ZXh0LnRvTmVnYXRlZCgpXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHR0aGlzLnJlc2l6ZVBhcnQoMCwgLUJhc2VSZXNpemVWaWV3QWN0aW9uLlJFU0laRV9JTkNSRU1FTlQsIGFjY2Vzc29yLmdldChJV29ya2JlbmNoTGF5b3V0U2VydmljZSksIFBhcnRzLkVESVRPUl9QQVJUKTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoSW5jcmVhc2VWaWV3U2l6ZUFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoSW5jcmVhc2VWaWV3V2lkdGhBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKEluY3JlYXNlVmlld0hlaWdodEFjdGlvbik7XG5cbnJlZ2lzdGVyQWN0aW9uMihEZWNyZWFzZVZpZXdTaXplQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihEZWNyZWFzZVZpZXdXaWR0aEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoRGVjcmVhc2VWaWV3SGVpZ2h0QWN0aW9uKTtcblxuLy8jcmVnaW9uIFF1aWNrIElucHV0IEFsaWdubWVudCBBY3Rpb25zXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBBbGlnblF1aWNrSW5wdXRUb3BBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uYWxpZ25RdWlja0lucHV0VG9wJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2FsaWduUXVpY2tJbnB1dFRvcCcsICdBbGlnbiBRdWljayBJbnB1dCBUb3AnKSxcblx0XHRcdGYxOiBmYWxzZVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRxdWlja0lucHV0U2VydmljZS5zZXRBbGlnbm1lbnQoJ3RvcCcpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEFsaWduUXVpY2tJbnB1dENlbnRlckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5hbGlnblF1aWNrSW5wdXRDZW50ZXInLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWxpZ25RdWlja0lucHV0Q2VudGVyJywgJ0FsaWduIFF1aWNrIElucHV0IENlbnRlcicpLFxuXHRcdFx0ZjE6IGZhbHNlXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdHF1aWNrSW5wdXRTZXJ2aWNlLnNldEFsaWdubWVudCgnY2VudGVyJyk7XG5cdH1cbn0pO1xuXG4vLyNlbmRyZWdpb25cblxudHlwZSBDb250ZXh0dWFsTGF5b3V0VmlzdWFsSWNvbiA9IHsgaWNvbkE6IFRoZW1lSWNvbjsgaWNvbkI6IFRoZW1lSWNvbjsgd2hlbkE6IENvbnRleHRLZXlFeHByZXNzaW9uIH07XG50eXBlIExheW91dFZpc3VhbEljb24gPSBUaGVtZUljb24gfCBDb250ZXh0dWFsTGF5b3V0VmlzdWFsSWNvbjtcblxuZnVuY3Rpb24gaXNDb250ZXh0dWFsTGF5b3V0VmlzdWFsSWNvbihpY29uOiBMYXlvdXRWaXN1YWxJY29uKTogaWNvbiBpcyBDb250ZXh0dWFsTGF5b3V0VmlzdWFsSWNvbiB7XG5cdHJldHVybiAoaWNvbiBhcyBDb250ZXh0dWFsTGF5b3V0VmlzdWFsSWNvbikuaWNvbkEgIT09IHVuZGVmaW5lZDtcbn1cblxuaW50ZXJmYWNlIEN1c3RvbWl6ZUxheW91dEl0ZW0ge1xuXHRpZDogc3RyaW5nO1xuXHRhY3RpdmU6IENvbnRleHRLZXlFeHByZXNzaW9uO1xuXHRsYWJlbDogc3RyaW5nO1xuXHRhY3RpdmVJY29uOiBUaGVtZUljb247XG5cdHZpc3VhbEljb24/OiBMYXlvdXRWaXN1YWxJY29uO1xuXHRhY3RpdmVBcmlhTGFiZWw6IHN0cmluZztcblx0aW5hY3RpdmVJY29uPzogVGhlbWVJY29uO1xuXHRpbmFjdGl2ZUFyaWFMYWJlbD86IHN0cmluZztcblx0dXNlQnV0dG9uczogYm9vbGVhbjtcbn1cblxuY29uc3QgQ3JlYXRlVG9nZ2xlTGF5b3V0SXRlbSA9IChpZDogc3RyaW5nLCBhY3RpdmU6IENvbnRleHRLZXlFeHByZXNzaW9uLCBsYWJlbDogc3RyaW5nLCB2aXN1YWxJY29uPzogTGF5b3V0VmlzdWFsSWNvbik6IEN1c3RvbWl6ZUxheW91dEl0ZW0gPT4ge1xuXHRyZXR1cm4ge1xuXHRcdGlkLFxuXHRcdGFjdGl2ZSxcblx0XHRsYWJlbCxcblx0XHR2aXN1YWxJY29uLFxuXHRcdGFjdGl2ZUljb246IENvZGljb24uZXllLFxuXHRcdGluYWN0aXZlSWNvbjogQ29kaWNvbi5leWVDbG9zZWQsXG5cdFx0YWN0aXZlQXJpYUxhYmVsOiBsb2NhbGl6ZSgnc2VsZWN0VG9IaWRlJywgXCJTZWxlY3QgdG8gSGlkZVwiKSxcblx0XHRpbmFjdGl2ZUFyaWFMYWJlbDogbG9jYWxpemUoJ3NlbGVjdFRvU2hvdycsIFwiU2VsZWN0IHRvIFNob3dcIiksXG5cdFx0dXNlQnV0dG9uczogdHJ1ZSxcblx0fTtcbn07XG5cbmNvbnN0IENyZWF0ZU9wdGlvbkxheW91dEl0ZW0gPSAoaWQ6IHN0cmluZywgYWN0aXZlOiBDb250ZXh0S2V5RXhwcmVzc2lvbiwgbGFiZWw6IHN0cmluZywgdmlzdWFsSWNvbj86IExheW91dFZpc3VhbEljb24pOiBDdXN0b21pemVMYXlvdXRJdGVtID0+IHtcblx0cmV0dXJuIHtcblx0XHRpZCxcblx0XHRhY3RpdmUsXG5cdFx0bGFiZWwsXG5cdFx0dmlzdWFsSWNvbixcblx0XHRhY3RpdmVJY29uOiBDb2RpY29uLmNoZWNrLFxuXHRcdGFjdGl2ZUFyaWFMYWJlbDogbG9jYWxpemUoJ2FjdGl2ZScsIFwiQWN0aXZlXCIpLFxuXHRcdHVzZUJ1dHRvbnM6IGZhbHNlXG5cdH07XG59O1xuXG5jb25zdCBNZW51QmFyVG9nZ2xlZENvbnRleHQgPSBDb250ZXh0S2V5RXhwci5hbmQoSXNNYWNOYXRpdmVDb250ZXh0LnRvTmVnYXRlZCgpLCBDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoYGNvbmZpZy4ke01lbnVTZXR0aW5ncy5NZW51QmFyVmlzaWJpbGl0eX1gLCAnaGlkZGVuJyksIENvbnRleHRLZXlFeHByLm5vdEVxdWFscyhgY29uZmlnLiR7TWVudVNldHRpbmdzLk1lbnVCYXJWaXNpYmlsaXR5fWAsICd0b2dnbGUnKSwgQ29udGV4dEtleUV4cHIubm90RXF1YWxzKGBjb25maWcuJHtNZW51U2V0dGluZ3MuTWVudUJhclZpc2liaWxpdHl9YCwgJ2NvbXBhY3QnKSkgYXMgQ29udGV4dEtleUV4cHJlc3Npb247XG5jb25zdCBUb2dnbGVWaXNpYmlsaXR5QWN0aW9uczogQ3VzdG9taXplTGF5b3V0SXRlbVtdID0gW107XG5pZiAoIWlzTWFjaW50b3NoIHx8ICFpc05hdGl2ZSkge1xuXHRUb2dnbGVWaXNpYmlsaXR5QWN0aW9ucy5wdXNoKENyZWF0ZVRvZ2dsZUxheW91dEl0ZW0oJ3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlTWVudUJhcicsIE1lbnVCYXJUb2dnbGVkQ29udGV4dCwgbG9jYWxpemUoJ21lbnVCYXInLCBcIk1lbnUgQmFyXCIpLCBtZW51YmFySWNvbikpO1xufVxuXG5Ub2dnbGVWaXNpYmlsaXR5QWN0aW9ucy5wdXNoKC4uLltcblx0Q3JlYXRlVG9nZ2xlTGF5b3V0SXRlbShUb2dnbGVBY3Rpdml0eUJhclZpc2liaWxpdHlBY3Rpb25JZCwgQ29udGV4dEtleUV4cHIubm90RXF1YWxzKCdjb25maWcud29ya2JlbmNoLmFjdGl2aXR5QmFyLmxvY2F0aW9uJywgJ2hpZGRlbicpLCBsb2NhbGl6ZSgnYWN0aXZpdHlCYXInLCBcIkFjdGl2aXR5IEJhclwiKSwgeyB3aGVuQTogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcud29ya2JlbmNoLnNpZGVCYXIubG9jYXRpb24nLCAnbGVmdCcpLCBpY29uQTogYWN0aXZpdHlCYXJMZWZ0SWNvbiwgaWNvbkI6IGFjdGl2aXR5QmFyUmlnaHRJY29uIH0pLFxuXHRDcmVhdGVUb2dnbGVMYXlvdXRJdGVtKFRvZ2dsZVNpZGViYXJWaXNpYmlsaXR5QWN0aW9uLklELCBTaWRlQmFyVmlzaWJsZUNvbnRleHQsIGxvY2FsaXplKCdzaWRlQmFyJywgXCJQcmltYXJ5IFNpZGUgQmFyXCIpLCB7IHdoZW5BOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy53b3JrYmVuY2guc2lkZUJhci5sb2NhdGlvbicsICdsZWZ0JyksIGljb25BOiBwYW5lbExlZnRJY29uLCBpY29uQjogcGFuZWxSaWdodEljb24gfSksXG5cdENyZWF0ZVRvZ2dsZUxheW91dEl0ZW0oVG9nZ2xlQXV4aWxpYXJ5QmFyQWN0aW9uLklELCBBdXhpbGlhcnlCYXJWaXNpYmxlQ29udGV4dCwgbG9jYWxpemUoJ3NlY29uZGFyeVNpZGVCYXInLCBcIlNlY29uZGFyeSBTaWRlIEJhclwiKSwgeyB3aGVuQTogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcud29ya2JlbmNoLnNpZGVCYXIubG9jYXRpb24nLCAnbGVmdCcpLCBpY29uQTogcGFuZWxSaWdodEljb24sIGljb25COiBwYW5lbExlZnRJY29uIH0pLFxuXHRDcmVhdGVUb2dnbGVMYXlvdXRJdGVtKFRvZ2dsZVBhbmVsQWN0aW9uLklELCBQYW5lbFZpc2libGVDb250ZXh0LCBsb2NhbGl6ZSgncGFuZWwnLCBcIlBhbmVsXCIpLCBwYW5lbEljb24pLFxuXHRDcmVhdGVUb2dnbGVMYXlvdXRJdGVtKFRvZ2dsZVN0YXR1c2JhclZpc2liaWxpdHlBY3Rpb24uSUQsIENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLndvcmtiZW5jaC5zdGF0dXNCYXIudmlzaWJsZScsIHRydWUpLCBsb2NhbGl6ZSgnc3RhdHVzQmFyJywgXCJTdGF0dXMgQmFyXCIpLCBzdGF0dXNCYXJJY29uKSxcbl0pO1xuXG5jb25zdCBNb3ZlU2lkZUJhckFjdGlvbnM6IEN1c3RvbWl6ZUxheW91dEl0ZW1bXSA9IFtcblx0Q3JlYXRlT3B0aW9uTGF5b3V0SXRlbShNb3ZlU2lkZWJhckxlZnRBY3Rpb24uSUQsIENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLndvcmtiZW5jaC5zaWRlQmFyLmxvY2F0aW9uJywgJ2xlZnQnKSwgbG9jYWxpemUoJ2xlZnRTaWRlQmFyJywgXCJMZWZ0XCIpLCBwYW5lbExlZnRJY29uKSxcblx0Q3JlYXRlT3B0aW9uTGF5b3V0SXRlbShNb3ZlU2lkZWJhclJpZ2h0QWN0aW9uLklELCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy53b3JrYmVuY2guc2lkZUJhci5sb2NhdGlvbicsICdyaWdodCcpLCBsb2NhbGl6ZSgncmlnaHRTaWRlQmFyJywgXCJSaWdodFwiKSwgcGFuZWxSaWdodEljb24pLFxuXTtcblxuY29uc3QgQWxpZ25QYW5lbEFjdGlvbnM6IEN1c3RvbWl6ZUxheW91dEl0ZW1bXSA9IFtcblx0Q3JlYXRlT3B0aW9uTGF5b3V0SXRlbSgnd29ya2JlbmNoLmFjdGlvbi5hbGlnblBhbmVsTGVmdCcsIFBhbmVsQWxpZ25tZW50Q29udGV4dC5pc0VxdWFsVG8oJ2xlZnQnKSwgbG9jYWxpemUoJ2xlZnRQYW5lbCcsIFwiTGVmdFwiKSwgcGFuZWxBbGlnbm1lbnRMZWZ0SWNvbiksXG5cdENyZWF0ZU9wdGlvbkxheW91dEl0ZW0oJ3dvcmtiZW5jaC5hY3Rpb24uYWxpZ25QYW5lbFJpZ2h0JywgUGFuZWxBbGlnbm1lbnRDb250ZXh0LmlzRXF1YWxUbygncmlnaHQnKSwgbG9jYWxpemUoJ3JpZ2h0UGFuZWwnLCBcIlJpZ2h0XCIpLCBwYW5lbEFsaWdubWVudFJpZ2h0SWNvbiksXG5cdENyZWF0ZU9wdGlvbkxheW91dEl0ZW0oJ3dvcmtiZW5jaC5hY3Rpb24uYWxpZ25QYW5lbENlbnRlcicsIFBhbmVsQWxpZ25tZW50Q29udGV4dC5pc0VxdWFsVG8oJ2NlbnRlcicpLCBsb2NhbGl6ZSgnY2VudGVyUGFuZWwnLCBcIkNlbnRlclwiKSwgcGFuZWxBbGlnbm1lbnRDZW50ZXJJY29uKSxcblx0Q3JlYXRlT3B0aW9uTGF5b3V0SXRlbSgnd29ya2JlbmNoLmFjdGlvbi5hbGlnblBhbmVsSnVzdGlmeScsIFBhbmVsQWxpZ25tZW50Q29udGV4dC5pc0VxdWFsVG8oJ2p1c3RpZnknKSwgbG9jYWxpemUoJ2p1c3RpZnlQYW5lbCcsIFwiSnVzdGlmeVwiKSwgcGFuZWxBbGlnbm1lbnRKdXN0aWZ5SWNvbiksXG5dO1xuXG5jb25zdCBRdWlja0lucHV0QWN0aW9uczogQ3VzdG9taXplTGF5b3V0SXRlbVtdID0gW1xuXHRDcmVhdGVPcHRpb25MYXlvdXRJdGVtKCd3b3JrYmVuY2guYWN0aW9uLmFsaWduUXVpY2tJbnB1dFRvcCcsIFF1aWNrSW5wdXRBbGlnbm1lbnRDb250ZXh0S2V5LmlzRXF1YWxUbygndG9wJyksIGxvY2FsaXplKCd0b3AnLCBcIlRvcFwiKSwgcXVpY2tJbnB1dEFsaWdubWVudFRvcEljb24pLFxuXHRDcmVhdGVPcHRpb25MYXlvdXRJdGVtKCd3b3JrYmVuY2guYWN0aW9uLmFsaWduUXVpY2tJbnB1dENlbnRlcicsIFF1aWNrSW5wdXRBbGlnbm1lbnRDb250ZXh0S2V5LmlzRXF1YWxUbygnY2VudGVyJyksIGxvY2FsaXplKCdjZW50ZXInLCBcIkNlbnRlclwiKSwgcXVpY2tJbnB1dEFsaWdubWVudENlbnRlckljb24pLFxuXTtcblxuY29uc3QgTWlzY0xheW91dE9wdGlvbnM6IEN1c3RvbWl6ZUxheW91dEl0ZW1bXSA9IFtcblx0Q3JlYXRlT3B0aW9uTGF5b3V0SXRlbSgnd29ya2JlbmNoLmFjdGlvbi50b2dnbGVGdWxsU2NyZWVuJywgSXNNYWluV2luZG93RnVsbHNjcmVlbkNvbnRleHQsIGxvY2FsaXplKCdmdWxsc2NyZWVuJywgXCJGdWxsIFNjcmVlblwiKSwgZnVsbHNjcmVlbkljb24pLFxuXHRDcmVhdGVPcHRpb25MYXlvdXRJdGVtKCd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZVplbk1vZGUnLCBJbkVkaXRvclplbk1vZGVDb250ZXh0LCBsb2NhbGl6ZSgnemVuTW9kZScsIFwiWmVuIE1vZGVcIiksIHplbk1vZGVJY29uKSxcblx0Q3JlYXRlT3B0aW9uTGF5b3V0SXRlbSgnd29ya2JlbmNoLmFjdGlvbi50b2dnbGVDZW50ZXJlZExheW91dCcsIElzTWFpbkVkaXRvckNlbnRlcmVkTGF5b3V0Q29udGV4dCwgbG9jYWxpemUoJ2NlbnRlcmVkTGF5b3V0JywgXCJDZW50ZXJlZCBMYXlvdXRcIiksIGNlbnRlckxheW91dEljb24pLFxuXTtcblxuY29uc3QgTGF5b3V0Q29udGV4dEtleVNldCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuZm9yIChjb25zdCB7IGFjdGl2ZSB9IG9mIFsuLi5Ub2dnbGVWaXNpYmlsaXR5QWN0aW9ucywgLi4uTW92ZVNpZGVCYXJBY3Rpb25zLCAuLi5BbGlnblBhbmVsQWN0aW9ucywgLi4uUXVpY2tJbnB1dEFjdGlvbnMsIC4uLk1pc2NMYXlvdXRPcHRpb25zXSkge1xuXHRmb3IgKGNvbnN0IGtleSBvZiBhY3RpdmUua2V5cygpKSB7XG5cdFx0TGF5b3V0Q29udGV4dEtleVNldC5hZGQoa2V5KTtcblx0fVxufVxuXG4vKipcbiAqIE1hdGNoZXMgdGhlIHRpdGxlIGJhcidzIGBlZGl0b3JBY3Rpb25zRW5hYmxlZGAgZ2V0dGVyOiB0cnVlIHdoZW4gZWRpdG9yXG4gKiBhY3Rpb25zIHJlbmRlciBpbiB0aGUgdGl0bGUgYmFyIChlaXRoZXIgZXhwbGljaXRseSwgb3IgYmVjYXVzZSB0YWJzIGFyZVxuICogaGlkZGVuIGFuZCB0aGUgbG9jYXRpb24gZGVmYXVsdHMgdGhlcmUpLlxuICovXG5jb25zdCBFZGl0b3JBY3Rpb25zSW5UaXRsZUJhciA9IENvbnRleHRLZXlFeHByLm9yKFxuXHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke0xheW91dFNldHRpbmdzLkVESVRPUl9BQ1RJT05TX0xPQ0FUSU9OfWAsIEVkaXRvckFjdGlvbnNMb2NhdGlvbi5USVRMRUJBUiksXG5cdENvbnRleHRLZXlFeHByLmFuZChcblx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke0xheW91dFNldHRpbmdzLkVESVRPUl9BQ1RJT05TX0xPQ0FUSU9OfWAsIEVkaXRvckFjdGlvbnNMb2NhdGlvbi5ERUZBVUxUKSxcblx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke0xheW91dFNldHRpbmdzLkVESVRPUl9UQUJTX01PREV9YCwgRWRpdG9yVGFic01vZGUuTk9ORSlcblx0KVxuKSE7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBDdXN0b21pemVMYXlvdXRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRwcml2YXRlIF9jdXJyZW50UXVpY2tQaWNrPzogSVF1aWNrUGljazxJUXVpY2tQaWNrSXRlbSwgeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0+O1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jdXN0b21pemVMYXlvdXQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY3VzdG9taXplTGF5b3V0JywgXCJDdXN0b21pemUgTGF5b3V0Li4uXCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRpY29uOiBjb25maWd1cmVMYXlvdXRJY29uLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5MYXlvdXRDb250cm9sTWVudVN1Ym1lbnUsXG5cdFx0XHRcdFx0Z3JvdXA6ICd6X2VuZCcsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkxheW91dENvbnRyb2xNZW51LFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdElzQXV4aWxpYXJ5V2luZG93Q29udGV4dC50b05lZ2F0ZWQoKSxcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLndvcmtiZW5jaC5sYXlvdXRDb250cm9sLnR5cGUnLCAnYm90aCcpLFxuXHRcdFx0XHRcdFx0RWRpdG9yQWN0aW9uc0luVGl0bGVCYXIubmVnYXRlKClcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbidcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuTGF5b3V0Q29udHJvbE1lbnUsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0SXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcud29ya2JlbmNoLmxheW91dENvbnRyb2wudHlwZScsICdib3RoJyksXG5cdFx0XHRcdFx0XHRFZGl0b3JBY3Rpb25zSW5UaXRsZUJhclxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0Z3JvdXA6ICcxX2xheW91dCdcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0Z2V0SXRlbXMoY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSwga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSk6IFF1aWNrUGlja0l0ZW1bXSB7XG5cdFx0Y29uc3QgdG9RdWlja1BpY2tJdGVtID0gKGl0ZW06IEN1c3RvbWl6ZUxheW91dEl0ZW0pOiBJUXVpY2tQaWNrSXRlbSA9PiB7XG5cdFx0XHRjb25zdCB0b2dnbGVkID0gaXRlbS5hY3RpdmUuZXZhbHVhdGUoY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dChudWxsKSk7XG5cdFx0XHRsZXQgbGFiZWwgPSBpdGVtLnVzZUJ1dHRvbnMgP1xuXHRcdFx0XHRpdGVtLmxhYmVsIDpcblx0XHRcdFx0aXRlbS5sYWJlbCArICh0b2dnbGVkICYmIGl0ZW0uYWN0aXZlSWNvbiA/IGAgJCgke2l0ZW0uYWN0aXZlSWNvbi5pZH0pYCA6ICghdG9nZ2xlZCAmJiBpdGVtLmluYWN0aXZlSWNvbiA/IGAgJCgke2l0ZW0uaW5hY3RpdmVJY29uLmlkfSlgIDogJycpKTtcblx0XHRcdGNvbnN0IGFyaWFMYWJlbCA9XG5cdFx0XHRcdGl0ZW0ubGFiZWwgKyAodG9nZ2xlZCAmJiBpdGVtLmFjdGl2ZUFyaWFMYWJlbCA/IGAgKCR7aXRlbS5hY3RpdmVBcmlhTGFiZWx9KWAgOiAoIXRvZ2dsZWQgJiYgaXRlbS5pbmFjdGl2ZUFyaWFMYWJlbCA/IGAgKCR7aXRlbS5pbmFjdGl2ZUFyaWFMYWJlbH0pYCA6ICcnKSk7XG5cblx0XHRcdGlmIChpdGVtLnZpc3VhbEljb24pIHtcblx0XHRcdFx0bGV0IGljb24gPSBpdGVtLnZpc3VhbEljb247XG5cdFx0XHRcdGlmIChpc0NvbnRleHR1YWxMYXlvdXRWaXN1YWxJY29uKGljb24pKSB7XG5cdFx0XHRcdFx0Y29uc3QgdXNlSWNvbkEgPSBpY29uLndoZW5BLmV2YWx1YXRlKGNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHQobnVsbCkpO1xuXHRcdFx0XHRcdGljb24gPSB1c2VJY29uQSA/IGljb24uaWNvbkEgOiBpY29uLmljb25CO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGFiZWwgPSBgJCgke2ljb24uaWR9KSAke2xhYmVsfWA7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGljb24gPSB0b2dnbGVkID8gaXRlbS5hY3RpdmVJY29uIDogaXRlbS5pbmFjdGl2ZUljb247XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6ICdpdGVtJyxcblx0XHRcdFx0aWQ6IGl0ZW0uaWQsXG5cdFx0XHRcdGxhYmVsLFxuXHRcdFx0XHRhcmlhTGFiZWwsXG5cdFx0XHRcdGtleWJpbmRpbmc6IGtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoaXRlbS5pZCwgY29udGV4dEtleVNlcnZpY2UpLFxuXHRcdFx0XHRidXR0b25zOiAhaXRlbS51c2VCdXR0b25zID8gdW5kZWZpbmVkIDogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGFsd2F5c1Zpc2libGU6IGZhbHNlLFxuXHRcdFx0XHRcdFx0dG9vbHRpcDogYXJpYUxhYmVsLFxuXHRcdFx0XHRcdFx0aWNvbkNsYXNzOiBpY29uID8gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb24pIDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXHRcdH07XG5cdFx0cmV0dXJuIFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ3NlcGFyYXRvcicsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgndG9nZ2xlVmlzaWJpbGl0eScsIFwiVmlzaWJpbGl0eVwiKVxuXHRcdFx0fSxcblx0XHRcdC4uLlRvZ2dsZVZpc2liaWxpdHlBY3Rpb25zLm1hcCh0b1F1aWNrUGlja0l0ZW0pLFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnc2VwYXJhdG9yJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzaWRlQmFyUG9zaXRpb24nLCBcIlByaW1hcnkgU2lkZSBCYXIgUG9zaXRpb25cIilcblx0XHRcdH0sXG5cdFx0XHQuLi5Nb3ZlU2lkZUJhckFjdGlvbnMubWFwKHRvUXVpY2tQaWNrSXRlbSksXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdzZXBhcmF0b3InLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3BhbmVsQWxpZ25tZW50JywgXCJQYW5lbCBBbGlnbm1lbnRcIilcblx0XHRcdH0sXG5cdFx0XHQuLi5BbGlnblBhbmVsQWN0aW9ucy5tYXAodG9RdWlja1BpY2tJdGVtKSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ3NlcGFyYXRvcicsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncXVpY2tPcGVuJywgXCJRdWljayBJbnB1dCBQb3NpdGlvblwiKVxuXHRcdFx0fSxcblx0XHRcdC4uLlF1aWNrSW5wdXRBY3Rpb25zLm1hcCh0b1F1aWNrUGlja0l0ZW0pLFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnc2VwYXJhdG9yJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdsYXlvdXRNb2RlcycsIFwiTW9kZXNcIiksXG5cdFx0XHR9LFxuXHRcdFx0Li4uTWlzY0xheW91dE9wdGlvbnMubWFwKHRvUXVpY2tQaWNrSXRlbSksXG5cdFx0XTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jdXJyZW50UXVpY2tQaWNrKSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50UXVpY2tQaWNrLmhpZGUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGtleWJpbmRpbmdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElLZXliaW5kaW5nU2VydmljZSk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IHF1aWNrUGljayA9IGRpc3Bvc2FibGVzLmFkZChxdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2soeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0pKTtcblxuXHRcdHRoaXMuX2N1cnJlbnRRdWlja1BpY2sgPSBxdWlja1BpY2s7XG5cdFx0cXVpY2tQaWNrLml0ZW1zID0gdGhpcy5nZXRJdGVtcyhjb250ZXh0S2V5U2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UpO1xuXHRcdHF1aWNrUGljay5pZ25vcmVGb2N1c091dCA9IHRydWU7XG5cdFx0cXVpY2tQaWNrLmhpZGVJbnB1dCA9IHRydWU7XG5cdFx0cXVpY2tQaWNrLnRpdGxlID0gbG9jYWxpemUoJ2N1c3RvbWl6ZUxheW91dFF1aWNrUGlja1RpdGxlJywgXCJDdXN0b21pemUgTGF5b3V0XCIpO1xuXG5cdFx0Y29uc3QgY2xvc2VCdXR0b24gPSB7XG5cdFx0XHRhbHdheXNWaXNpYmxlOiB0cnVlLFxuXHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5jbG9zZSksXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnY2xvc2UnLCBcIkNsb3NlXCIpXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlc2V0QnV0dG9uID0ge1xuXHRcdFx0YWx3YXlzVmlzaWJsZTogdHJ1ZSxcblx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZGlzY2FyZCksXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgncmVzdG9yZSBkZWZhdWx0cycsIFwiUmVzdG9yZSBEZWZhdWx0c1wiKVxuXHRcdH07XG5cblx0XHRxdWlja1BpY2suYnV0dG9ucyA9IFtcblx0XHRcdHJlc2V0QnV0dG9uLFxuXHRcdFx0Y2xvc2VCdXR0b25cblx0XHRdO1xuXG5cdFx0bGV0IHNlbGVjdGVkSXRlbTogQ3VzdG9taXplTGF5b3V0SXRlbSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0KGNoYW5nZUV2ZW50ID0+IHtcblx0XHRcdGlmIChjaGFuZ2VFdmVudC5hZmZlY3RzU29tZShMYXlvdXRDb250ZXh0S2V5U2V0KSkge1xuXHRcdFx0XHRxdWlja1BpY2suaXRlbXMgPSB0aGlzLmdldEl0ZW1zKGNvbnRleHRLZXlTZXJ2aWNlLCBrZXliaW5kaW5nU2VydmljZSk7XG5cdFx0XHRcdGlmIChzZWxlY3RlZEl0ZW0pIHtcblx0XHRcdFx0XHRxdWlja1BpY2suYWN0aXZlSXRlbXMgPSBxdWlja1BpY2suaXRlbXMuZmlsdGVyKGl0ZW0gPT4gKGl0ZW0gYXMgQ3VzdG9taXplTGF5b3V0SXRlbSkuaWQgPT09IHNlbGVjdGVkSXRlbT8uaWQpIGFzIElRdWlja1BpY2tJdGVtW107XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHF1aWNrSW5wdXRTZXJ2aWNlLmZvY3VzKCksIDApO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRBY2NlcHQoZXZlbnQgPT4ge1xuXHRcdFx0aWYgKHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zLmxlbmd0aCkge1xuXHRcdFx0XHRzZWxlY3RlZEl0ZW0gPSBxdWlja1BpY2suc2VsZWN0ZWRJdGVtc1swXSBhcyBDdXN0b21pemVMYXlvdXRJdGVtO1xuXHRcdFx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChzZWxlY3RlZEl0ZW0uaWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRUcmlnZ2VySXRlbUJ1dHRvbihldmVudCA9PiB7XG5cdFx0XHRpZiAoZXZlbnQuaXRlbSkge1xuXHRcdFx0XHRzZWxlY3RlZEl0ZW0gPSBldmVudC5pdGVtIGFzIEN1c3RvbWl6ZUxheW91dEl0ZW07XG5cdFx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKHNlbGVjdGVkSXRlbS5pZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZFRyaWdnZXJCdXR0b24oKGJ1dHRvbikgPT4ge1xuXHRcdFx0aWYgKGJ1dHRvbiA9PT0gY2xvc2VCdXR0b24pIHtcblx0XHRcdFx0cXVpY2tQaWNrLmhpZGUoKTtcblx0XHRcdH0gZWxzZSBpZiAoYnV0dG9uID09PSByZXNldEJ1dHRvbikge1xuXG5cdFx0XHRcdGNvbnN0IHJlc2V0U2V0dGluZyA9IChpZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgY29uZmlnID0gY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdChpZCk7XG5cdFx0XHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoaWQsIGNvbmZpZy5kZWZhdWx0VmFsdWUpO1xuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdC8vIFJlc2V0IGFsbCBsYXlvdXQgb3B0aW9uc1xuXHRcdFx0XHRyZXNldFNldHRpbmcoJ3dvcmtiZW5jaC5hY3Rpdml0eUJhci5sb2NhdGlvbicpO1xuXHRcdFx0XHRyZXNldFNldHRpbmcoJ3dvcmtiZW5jaC5zaWRlQmFyLmxvY2F0aW9uJyk7XG5cdFx0XHRcdHJlc2V0U2V0dGluZygnd29ya2JlbmNoLnN0YXR1c0Jhci52aXNpYmxlJyk7XG5cdFx0XHRcdHJlc2V0U2V0dGluZygnd29ya2JlbmNoLnBhbmVsLmRlZmF1bHRMb2NhdGlvbicpO1xuXG5cdFx0XHRcdGlmICghaXNNYWNpbnRvc2ggfHwgIWlzTmF0aXZlKSB7XG5cdFx0XHRcdFx0cmVzZXRTZXR0aW5nKCd3aW5kb3cubWVudUJhclZpc2liaWxpdHknKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLmFsaWduUGFuZWxDZW50ZXInKTtcblx0XHRcdFx0Y29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24uYWxpZ25RdWlja0lucHV0VG9wJyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0cXVpY2tQaWNrLmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlzcG9zZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9jdXJyZW50UXVpY2tQaWNrID0gdW5kZWZpbmVkO1xuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH0pKTtcblxuXHRcdHF1aWNrUGljay5zaG93KCk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBMkIsVUFBVSxpQkFBaUI7QUFDdEQsU0FBUyxRQUFRLGNBQWMsaUJBQWlCLGVBQWU7QUFDL0QsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsdUJBQXVCLGdCQUFnQix5QkFBeUIsZ0JBQWdCLE9BQU8sVUFBVSxpQkFBaUIsd0JBQXdCO0FBQ25KLFNBQTJCLDZCQUE2QjtBQUN4RCxTQUFTLFFBQVEsZUFBZTtBQUNoQyxTQUFTLFdBQVcsU0FBUyxPQUFPLGFBQWEsZ0JBQWdCO0FBQ2pFLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0JBQXNDLDBCQUEwQjtBQUN6RSxTQUFTLHdCQUF3Qix1QkFBd0MscUNBQXFDO0FBQzlHLFNBQVMscUJBQXFCO0FBQzlCLFNBQXdCLDBCQUEyRTtBQUNuRyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGlDQUFpQztBQUMxQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDRCQUE0Qix1QkFBdUIscUJBQXFCLHVCQUF1QixvQkFBb0Isd0JBQXdCLG1DQUFtQyw4QkFBOEIsK0JBQStCLHNCQUFzQixpQ0FBaUMseUJBQXlCLHNCQUFzQixnQ0FBZ0M7QUFDMVgsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsY0FBYyxxQkFBcUI7QUFDNUMsU0FBUywyQkFBMkI7QUFDcEMs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Q3BDLGdCQUFNLFNBQVMscUJBQXFCLFFBQVEsRUFBRTtBQUM5QywrQkFBcUIsWUFBWSxJQUFJLE9BQU8sWUFBWTtBQUFBLFFBQ3pEO0FBR0EscUJBQWEsZ0NBQWdDO0FBQzdDLHFCQUFhLDRCQUE0QjtBQUN6QyxxQkFBYSw2QkFBNkI7QUFDMUMscUJBQWEsaUNBQWlDO0FBRTlDLFlBQUksQ0FBQyxlQUFlLENBQUMsVUFBVTtBQUM5Qix1QkFBYSwwQkFBMEI7QUFBQSxRQUN4QztBQUVBLHVCQUFlLGVBQWUsbUNBQW1DO0FBQ2pFLHVCQUFlLGVBQWUscUNBQXFDO0FBQUEsTUFDcEU7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLGdCQUFZLElBQUksVUFBVSxVQUFVLE1BQU07QUFDekMsZ0JBQVUsUUFBUTtBQUFBLElBQ25CLENBQUMsQ0FBQztBQUVGLGdCQUFZLElBQUksVUFBVSxVQUFVLE1BQU07QUFDekMsV0FBSyxvQkFBb0I7QUFDekIsa0JBQVksUUFBUTtBQUFBLElBQ3JCLENBQUMsQ0FBQztBQUVGLGNBQVUsS0FBSztBQUFBLEVBQ2hCO0FBQ0QsQ0FBQzsiLAogICJuYW1lcyI6IFsiYWNjZXNzb3IiLCAidmlld0lkIiwgImljb24iXQp9Cg==
