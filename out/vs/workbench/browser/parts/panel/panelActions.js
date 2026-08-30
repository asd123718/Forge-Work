var _a;
import "./media/panelpart.css";
import { localize, localize2 } from "../../../../nls.js";
import { KeyMod, KeyCode } from "../../../../base/common/keyCodes.js";
import { MenuId, MenuRegistry, registerAction2, Action2 } from "../../../../platform/actions/common/actions.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { isHorizontal, IWorkbenchLayoutService, Parts, Position, positionToString } from "../../../services/layout/browser/layoutService.js";
import { IsAuxiliaryWindowContext, PanelAlignmentContext, PanelMaximizedContext, PanelPositionContext, PanelVisibleContext } from "../../../common/contextkeys.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { ViewContainerLocation, IViewDescriptorService } from "../../../common/views.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { IPaneCompositePartService } from "../../../services/panecomposite/browser/panecomposite.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { SwitchCompositeViewAction } from "../compositeBarActions.js";
const maximizeIcon = registerIcon("panel-maximize", Codicon.screenFull, localize("maximizeIcon", "Icon to maximize a panel."));
const closeIcon = registerIcon("panel-close", Codicon.close, localize("closeIcon", "Icon to close a panel."));
const panelIcon = registerIcon("panel-layout-icon", Codicon.layoutPanel, localize("togglePanelOffIcon", "Icon to toggle the panel off when it is on."));
const panelOffIcon = registerIcon("panel-layout-icon-off", Codicon.layoutPanelOff, localize("togglePanelOnIcon", "Icon to toggle the panel on when it is off."));
const _TogglePanelAction = class _TogglePanelAction extends Action2 {
  constructor() {
    super({
      id: _TogglePanelAction.ID,
      title: _TogglePanelAction.LABEL,
      toggled: {
        condition: PanelVisibleContext,
        title: localize("closePanel", "Hide Panel"),
        icon: closeIcon,
        mnemonicTitle: localize({ key: "miTogglePanelMnemonic", comment: ["&& denotes a mnemonic"] }, "&&Panel")
      },
      icon: closeIcon,
      f1: true,
      category: Categories.View,
      metadata: {
        description: localize("openAndClosePanel", "Open/Show and Close/Hide Panel")
      },
      keybinding: { primary: KeyMod.CtrlCmd | KeyCode.KeyJ, weight: KeybindingWeight.WorkbenchContrib },
      menu: [
        {
          id: MenuId.MenubarAppearanceMenu,
          group: "2_workbench_layout",
          order: 5
        },
        {
          id: MenuId.LayoutControlMenuSubmenu,
          group: "0_workbench_layout",
          order: 4
        }
      ]
    });
  }
  async run(accessor) {
    const layoutService = accessor.get(IWorkbenchLayoutService);
    layoutService.setPartHidden(layoutService.isVisible(Parts.PANEL_PART), Parts.PANEL_PART);
  }
};
_TogglePanelAction.ID = "workbench.action.togglePanel";
_TogglePanelAction.LABEL = localize2("togglePanelVisibility", "Toggle Panel Visibility");
let TogglePanelAction = _TogglePanelAction;
registerAction2(TogglePanelAction);
MenuRegistry.appendMenuItem(MenuId.PanelTitle, {
  command: {
    id: TogglePanelAction.ID,
    title: localize("closePanel", "Hide Panel"),
    icon: closeIcon
  },
  group: "navigation",
  order: 2
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.closePanel",
      title: localize2("closePanel", "Hide Panel"),
      category: Categories.View,
      precondition: PanelVisibleContext,
      f1: true
    });
  }
  run(accessor) {
    accessor.get(IWorkbenchLayoutService).setPartHidden(true, Parts.PANEL_PART);
  }
});
registerAction2((_a = class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.focusPanel",
      title: localize2("focusPanel", "Focus into Panel"),
      category: Categories.View,
      f1: true
    });
  }
  async run(accessor) {
    const layoutService = accessor.get(IWorkbenchLayoutService);
    const paneCompositeService = accessor.get(IPaneCompositePartService);
    if (!layoutService.isVisible(Parts.PANEL_PART)) {
      layoutService.setPartHidden(false, Parts.PANEL_PART);
    }
    const panel = paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel);
    panel?.focus();
  }
}, _a.ID = "workbench.action.focusPanel", _a.LABEL = localize("focusPanel", "Focus into Panel"), _a));
const PositionPanelActionId = {
  LEFT: "workbench.action.positionPanelLeft",
  RIGHT: "workbench.action.positionPanelRight",
  BOTTOM: "workbench.action.positionPanelBottom",
  TOP: "workbench.action.positionPanelTop"
};
const AlignPanelActionId = {
  LEFT: "workbench.action.alignPanelLeft",
  RIGHT: "workbench.action.alignPanelRight",
  CENTER: "workbench.action.alignPanelCenter",
  JUSTIFY: "workbench.action.alignPanelJustify"
};
function createPanelActionConfig(id, title, shortLabel, value, when) {
  return {
    id,
    title,
    shortLabel,
    value,
    when
  };
}
function createPositionPanelActionConfig(id, title, shortLabel, position) {
  return createPanelActionConfig(id, title, shortLabel, position, PanelPositionContext.notEqualsTo(positionToString(position)));
}
function createAlignmentPanelActionConfig(id, title, shortLabel, alignment) {
  return createPanelActionConfig(id, title, shortLabel, alignment, PanelAlignmentContext.notEqualsTo(alignment));
}
const PositionPanelActionConfigs = [
  createPositionPanelActionConfig(PositionPanelActionId.TOP, localize2("positionPanelTop", "Move Panel To Top"), localize("positionPanelTopShort", "Top"), Position.TOP),
  createPositionPanelActionConfig(PositionPanelActionId.LEFT, localize2("positionPanelLeft", "Move Panel Left"), localize("positionPanelLeftShort", "Left"), Position.LEFT),
  createPositionPanelActionConfig(PositionPanelActionId.RIGHT, localize2("positionPanelRight", "Move Panel Right"), localize("positionPanelRightShort", "Right"), Position.RIGHT),
  createPositionPanelActionConfig(PositionPanelActionId.BOTTOM, localize2("positionPanelBottom", "Move Panel To Bottom"), localize("positionPanelBottomShort", "Bottom"), Position.BOTTOM)
];
const AlignPanelActionConfigs = [
  createAlignmentPanelActionConfig(AlignPanelActionId.LEFT, localize2("alignPanelLeft", "Set Panel Alignment to Left"), localize("alignPanelLeftShort", "Left"), "left"),
  createAlignmentPanelActionConfig(AlignPanelActionId.RIGHT, localize2("alignPanelRight", "Set Panel Alignment to Right"), localize("alignPanelRightShort", "Right"), "right"),
  createAlignmentPanelActionConfig(AlignPanelActionId.CENTER, localize2("alignPanelCenter", "Set Panel Alignment to Center"), localize("alignPanelCenterShort", "Center"), "center"),
  createAlignmentPanelActionConfig(AlignPanelActionId.JUSTIFY, localize2("alignPanelJustify", "Set Panel Alignment to Justify"), localize("alignPanelJustifyShort", "Justify"), "justify")
];
MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
  submenu: MenuId.PanelPositionMenu,
  title: localize("positionPanel", "Panel Position"),
  group: "3_workbench_layout_move",
  order: 4
});
PositionPanelActionConfigs.forEach((positionPanelAction, index) => {
  const { id, title, shortLabel, value, when } = positionPanelAction;
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id,
        title,
        category: Categories.View,
        f1: true
      });
    }
    run(accessor) {
      const layoutService = accessor.get(IWorkbenchLayoutService);
      layoutService.setPanelPosition(value === void 0 ? Position.BOTTOM : value);
    }
  });
  MenuRegistry.appendMenuItem(MenuId.PanelPositionMenu, {
    command: {
      id,
      title: shortLabel,
      toggled: when.negate()
    },
    order: 5 + index
  });
});
MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
  submenu: MenuId.PanelAlignmentMenu,
  title: localize("alignPanel", "Align Panel"),
  group: "3_workbench_layout_move",
  order: 5
});
AlignPanelActionConfigs.forEach((alignPanelAction) => {
  const { id, title, shortLabel, value, when } = alignPanelAction;
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id,
        title,
        category: Categories.View,
        toggled: when.negate(),
        f1: true
      });
    }
    run(accessor) {
      const layoutService = accessor.get(IWorkbenchLayoutService);
      layoutService.setPanelAlignment(value === void 0 ? "center" : value);
    }
  });
  MenuRegistry.appendMenuItem(MenuId.PanelAlignmentMenu, {
    command: {
      id,
      title: shortLabel,
      toggled: when.negate()
    },
    order: 5
  });
});
registerAction2(class extends SwitchCompositeViewAction {
  constructor() {
    super({
      id: "workbench.action.previousPanelView",
      title: localize2("previousPanelView", "Previous Panel View"),
      category: Categories.View,
      f1: true
    }, ViewContainerLocation.Panel, -1);
  }
});
registerAction2(class extends SwitchCompositeViewAction {
  constructor() {
    super({
      id: "workbench.action.nextPanelView",
      title: localize2("nextPanelView", "Next Panel View"),
      category: Categories.View,
      f1: true
    }, ViewContainerLocation.Panel, 1);
  }
});
const panelMaximizationSupportedWhen = ContextKeyExpr.or(PanelAlignmentContext.isEqualTo("center"), ContextKeyExpr.and(PanelPositionContext.notEqualsTo("bottom"), PanelPositionContext.notEqualsTo("top")));
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.toggleMaximizedPanel",
      title: localize2("toggleMaximizedPanel", "Toggle Maximized Panel"),
      tooltip: localize("maximizePanel", "Maximize Panel"),
      category: Categories.View,
      f1: true,
      icon: maximizeIcon,
      precondition: panelMaximizationSupportedWhen,
      toggled: {
        condition: PanelMaximizedContext,
        tooltip: localize("minimizePanel", "Restore Panel")
      },
      menu: [{
        id: MenuId.PanelTitle,
        group: "navigation",
        order: 1,
        when: panelMaximizationSupportedWhen
      }]
    });
  }
  run(accessor) {
    const layoutService = accessor.get(IWorkbenchLayoutService);
    const notificationService = accessor.get(INotificationService);
    if (layoutService.getPanelAlignment() !== "center" && isHorizontal(layoutService.getPanelPosition())) {
      notificationService.warn(localize("panelMaxNotSupported", "Maximizing the panel is only supported when it is center aligned."));
      return;
    }
    if (!layoutService.isVisible(Parts.PANEL_PART)) {
      layoutService.setPartHidden(false, Parts.PANEL_PART);
      if (!layoutService.isPanelMaximized()) {
        layoutService.toggleMaximizedPanel();
      }
    } else {
      layoutService.toggleMaximizedPanel();
    }
  }
});
MenuRegistry.appendMenuItems([
  {
    id: MenuId.LayoutControlMenu,
    item: {
      group: "navigation",
      command: {
        id: TogglePanelAction.ID,
        title: localize("togglePanel", "Toggle Panel"),
        icon: panelOffIcon,
        toggled: { condition: PanelVisibleContext, icon: panelIcon }
      },
      when: ContextKeyExpr.and(
        IsAuxiliaryWindowContext.negate(),
        ContextKeyExpr.or(
          ContextKeyExpr.equals("config.workbench.layoutControl.type", "toggles"),
          ContextKeyExpr.equals("config.workbench.layoutControl.type", "both")
        )
      ),
      order: 1
    }
  }
]);
class MoveViewsBetweenPanelsAction extends Action2 {
  constructor(source, destination, desc) {
    super(desc);
    this.source = source;
    this.destination = destination;
  }
  run(accessor, ...args) {
    const viewDescriptorService = accessor.get(IViewDescriptorService);
    const layoutService = accessor.get(IWorkbenchLayoutService);
    const viewsService = accessor.get(IViewsService);
    const srcContainers = viewDescriptorService.getViewContainersByLocation(this.source);
    const destContainers = viewDescriptorService.getViewContainersByLocation(this.destination);
    if (srcContainers.length) {
      const activeViewContainer = viewsService.getVisibleViewContainer(this.source);
      srcContainers.forEach((viewContainer) => viewDescriptorService.moveViewContainerToLocation(viewContainer, this.destination, void 0, this.desc.id));
      layoutService.setPartHidden(false, this.destination === ViewContainerLocation.Panel ? Parts.PANEL_PART : Parts.AUXILIARYBAR_PART);
      if (activeViewContainer && destContainers.length === 0) {
        viewsService.openViewContainer(activeViewContainer.id, true);
      }
    }
  }
}
const _MovePanelToSidePanelAction = class _MovePanelToSidePanelAction extends MoveViewsBetweenPanelsAction {
  constructor() {
    super(ViewContainerLocation.Panel, ViewContainerLocation.AuxiliaryBar, {
      id: _MovePanelToSidePanelAction.ID,
      title: localize2("movePanelToSecondarySideBar", "Move Panel Views To Secondary Side Bar"),
      category: Categories.View,
      f1: false
    });
  }
};
_MovePanelToSidePanelAction.ID = "workbench.action.movePanelToSidePanel";
let MovePanelToSidePanelAction = _MovePanelToSidePanelAction;
const _MovePanelToSecondarySideBarAction = class _MovePanelToSecondarySideBarAction extends MoveViewsBetweenPanelsAction {
  constructor() {
    super(ViewContainerLocation.Panel, ViewContainerLocation.AuxiliaryBar, {
      id: _MovePanelToSecondarySideBarAction.ID,
      title: localize2("movePanelToSecondarySideBar", "Move Panel Views To Secondary Side Bar"),
      category: Categories.View,
      f1: true
    });
  }
};
_MovePanelToSecondarySideBarAction.ID = "workbench.action.movePanelToSecondarySideBar";
let MovePanelToSecondarySideBarAction = _MovePanelToSecondarySideBarAction;
registerAction2(MovePanelToSidePanelAction);
registerAction2(MovePanelToSecondarySideBarAction);
const _MoveSidePanelToPanelAction = class _MoveSidePanelToPanelAction extends MoveViewsBetweenPanelsAction {
  constructor() {
    super(ViewContainerLocation.AuxiliaryBar, ViewContainerLocation.Panel, {
      id: _MoveSidePanelToPanelAction.ID,
      title: localize2("moveSidePanelToPanel", "Move Secondary Side Bar Views To Panel"),
      category: Categories.View,
      f1: false
    });
  }
};
_MoveSidePanelToPanelAction.ID = "workbench.action.moveSidePanelToPanel";
let MoveSidePanelToPanelAction = _MoveSidePanelToPanelAction;
const _MoveSecondarySideBarToPanelAction = class _MoveSecondarySideBarToPanelAction extends MoveViewsBetweenPanelsAction {
  constructor() {
    super(ViewContainerLocation.AuxiliaryBar, ViewContainerLocation.Panel, {
      id: _MoveSecondarySideBarToPanelAction.ID,
      title: localize2("moveSidePanelToPanel", "Move Secondary Side Bar Views To Panel"),
      category: Categories.View,
      f1: true
    });
  }
};
_MoveSecondarySideBarToPanelAction.ID = "workbench.action.moveSecondarySideBarToPanel";
let MoveSecondarySideBarToPanelAction = _MoveSecondarySideBarToPanelAction;
registerAction2(MoveSidePanelToPanelAction);
registerAction2(MoveSecondarySideBarToPanelAction);
export {
  MovePanelToSecondarySideBarAction,
  MoveSecondarySideBarToPanelAction,
  TogglePanelAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxwYW5lbFxccGFuZWxBY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL3BhbmVscGFydC5jc3MnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBLZXlNb2QsIEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBNZW51SWQsIE1lbnVSZWdpc3RyeSwgcmVnaXN0ZXJBY3Rpb24yLCBBY3Rpb24yLCBJQWN0aW9uMk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgaXNIb3Jpem9udGFsLCBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgUGFuZWxBbGlnbm1lbnQsIFBhcnRzLCBQb3NpdGlvbiwgcG9zaXRpb25Ub1N0cmluZyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LCBQYW5lbEFsaWdubWVudENvbnRleHQsIFBhbmVsTWF4aW1pemVkQ29udGV4dCwgUGFuZWxQb3NpdGlvbkNvbnRleHQsIFBhbmVsVmlzaWJsZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIENvbnRleHRLZXlFeHByZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBWaWV3Q29udGFpbmVyTG9jYXRpb24sIElWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3BhbmVjb21wb3NpdGUvYnJvd3Nlci9wYW5lY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRBY3Rpb25UaXRsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFN3aXRjaENvbXBvc2l0ZVZpZXdBY3Rpb24gfSBmcm9tICcuLi9jb21wb3NpdGVCYXJBY3Rpb25zLmpzJztcblxuY29uc3QgbWF4aW1pemVJY29uID0gcmVnaXN0ZXJJY29uKCdwYW5lbC1tYXhpbWl6ZScsIENvZGljb24uc2NyZWVuRnVsbCwgbG9jYWxpemUoJ21heGltaXplSWNvbicsICdJY29uIHRvIG1heGltaXplIGEgcGFuZWwuJykpO1xuY29uc3QgY2xvc2VJY29uID0gcmVnaXN0ZXJJY29uKCdwYW5lbC1jbG9zZScsIENvZGljb24uY2xvc2UsIGxvY2FsaXplKCdjbG9zZUljb24nLCAnSWNvbiB0byBjbG9zZSBhIHBhbmVsLicpKTtcbmNvbnN0IHBhbmVsSWNvbiA9IHJlZ2lzdGVySWNvbigncGFuZWwtbGF5b3V0LWljb24nLCBDb2RpY29uLmxheW91dFBhbmVsLCBsb2NhbGl6ZSgndG9nZ2xlUGFuZWxPZmZJY29uJywgJ0ljb24gdG8gdG9nZ2xlIHRoZSBwYW5lbCBvZmYgd2hlbiBpdCBpcyBvbi4nKSk7XG5jb25zdCBwYW5lbE9mZkljb24gPSByZWdpc3Rlckljb24oJ3BhbmVsLWxheW91dC1pY29uLW9mZicsIENvZGljb24ubGF5b3V0UGFuZWxPZmYsIGxvY2FsaXplKCd0b2dnbGVQYW5lbE9uSWNvbicsICdJY29uIHRvIHRvZ2dsZSB0aGUgcGFuZWwgb24gd2hlbiBpdCBpcyBvZmYuJykpO1xuXG5leHBvcnQgY2xhc3MgVG9nZ2xlUGFuZWxBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi50b2dnbGVQYW5lbCc7XG5cdHN0YXRpYyByZWFkb25seSBMQUJFTCA9IGxvY2FsaXplMigndG9nZ2xlUGFuZWxWaXNpYmlsaXR5JywgXCJUb2dnbGUgUGFuZWwgVmlzaWJpbGl0eVwiKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVG9nZ2xlUGFuZWxBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogVG9nZ2xlUGFuZWxBY3Rpb24uTEFCRUwsXG5cdFx0XHR0b2dnbGVkOiB7XG5cdFx0XHRcdGNvbmRpdGlvbjogUGFuZWxWaXNpYmxlQ29udGV4dCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjbG9zZVBhbmVsJywgJ0hpZGUgUGFuZWwnKSxcblx0XHRcdFx0aWNvbjogY2xvc2VJY29uLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pVG9nZ2xlUGFuZWxNbmVtb25pYycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlBhbmVsXCIpLFxuXHRcdFx0fSxcblx0XHRcdGljb246IGNsb3NlSWNvbixcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnb3BlbkFuZENsb3NlUGFuZWwnLCAnT3Blbi9TaG93IGFuZCBDbG9zZS9IaWRlIFBhbmVsJyksXG5cdFx0XHR9LFxuXHRcdFx0a2V5YmluZGluZzogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Siwgd2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgfSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhckFwcGVhcmFuY2VNZW51LFxuXHRcdFx0XHRcdGdyb3VwOiAnMl93b3JrYmVuY2hfbGF5b3V0Jyxcblx0XHRcdFx0XHRvcmRlcjogNVxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5MYXlvdXRDb250cm9sTWVudVN1Ym1lbnUsXG5cdFx0XHRcdFx0Z3JvdXA6ICcwX3dvcmtiZW5jaF9sYXlvdXQnLFxuXHRcdFx0XHRcdG9yZGVyOiA0XG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaExheW91dFNlcnZpY2UpO1xuXHRcdGxheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbihsYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5QQU5FTF9QQVJUKSwgUGFydHMuUEFORUxfUEFSVCk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKFRvZ2dsZVBhbmVsQWN0aW9uKTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5QYW5lbFRpdGxlLCB7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogVG9nZ2xlUGFuZWxBY3Rpb24uSUQsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdjbG9zZVBhbmVsJywgJ0hpZGUgUGFuZWwnKSxcblx0XHRpY29uOiBjbG9zZUljb25cblx0fSxcblx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0b3JkZXI6IDJcbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNsb3NlUGFuZWwnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2xvc2VQYW5lbCcsICdIaWRlIFBhbmVsJyksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBQYW5lbFZpc2libGVDb250ZXh0LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0YWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKS5zZXRQYXJ0SGlkZGVuKHRydWUsIFBhcnRzLlBBTkVMX1BBUlQpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNQYW5lbCc7XG5cdHN0YXRpYyByZWFkb25seSBMQUJFTCA9IGxvY2FsaXplKCdmb2N1c1BhbmVsJywgXCJGb2N1cyBpbnRvIFBhbmVsXCIpO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5mb2N1c1BhbmVsJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ZvY3VzUGFuZWwnLCBcIkZvY3VzIGludG8gUGFuZWxcIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBwYW5lQ29tcG9zaXRlU2VydmljZSA9IGFjY2Vzc29yLmdldChJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlKTtcblxuXHRcdC8vIFNob3cgcGFuZWxcblx0XHRpZiAoIWxheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLlBBTkVMX1BBUlQpKSB7XG5cdFx0XHRsYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4oZmFsc2UsIFBhcnRzLlBBTkVMX1BBUlQpO1xuXHRcdH1cblxuXHRcdC8vIEZvY3VzIGludG8gYWN0aXZlIHBhbmVsXG5cdFx0Y29uc3QgcGFuZWwgPSBwYW5lQ29tcG9zaXRlU2VydmljZS5nZXRBY3RpdmVQYW5lQ29tcG9zaXRlKFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCk7XG5cdFx0cGFuZWw/LmZvY3VzKCk7XG5cdH1cbn0pO1xuXG5jb25zdCBQb3NpdGlvblBhbmVsQWN0aW9uSWQgPSB7XG5cdExFRlQ6ICd3b3JrYmVuY2guYWN0aW9uLnBvc2l0aW9uUGFuZWxMZWZ0Jyxcblx0UklHSFQ6ICd3b3JrYmVuY2guYWN0aW9uLnBvc2l0aW9uUGFuZWxSaWdodCcsXG5cdEJPVFRPTTogJ3dvcmtiZW5jaC5hY3Rpb24ucG9zaXRpb25QYW5lbEJvdHRvbScsXG5cdFRPUDogJ3dvcmtiZW5jaC5hY3Rpb24ucG9zaXRpb25QYW5lbFRvcCdcbn07XG5cbmNvbnN0IEFsaWduUGFuZWxBY3Rpb25JZCA9IHtcblx0TEVGVDogJ3dvcmtiZW5jaC5hY3Rpb24uYWxpZ25QYW5lbExlZnQnLFxuXHRSSUdIVDogJ3dvcmtiZW5jaC5hY3Rpb24uYWxpZ25QYW5lbFJpZ2h0Jyxcblx0Q0VOVEVSOiAnd29ya2JlbmNoLmFjdGlvbi5hbGlnblBhbmVsQ2VudGVyJyxcblx0SlVTVElGWTogJ3dvcmtiZW5jaC5hY3Rpb24uYWxpZ25QYW5lbEp1c3RpZnknLFxufTtcblxuaW50ZXJmYWNlIFBhbmVsQWN0aW9uQ29uZmlnPFQ+IHtcblx0aWQ6IHN0cmluZztcblx0d2hlbjogQ29udGV4dEtleUV4cHJlc3Npb247XG5cdHRpdGxlOiBJQ29tbWFuZEFjdGlvblRpdGxlO1xuXHRzaG9ydExhYmVsOiBzdHJpbmc7XG5cdHZhbHVlOiBUO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVQYW5lbEFjdGlvbkNvbmZpZzxUPihpZDogc3RyaW5nLCB0aXRsZTogSUNvbW1hbmRBY3Rpb25UaXRsZSwgc2hvcnRMYWJlbDogc3RyaW5nLCB2YWx1ZTogVCwgd2hlbjogQ29udGV4dEtleUV4cHJlc3Npb24pOiBQYW5lbEFjdGlvbkNvbmZpZzxUPiB7XG5cdHJldHVybiB7XG5cdFx0aWQsXG5cdFx0dGl0bGUsXG5cdFx0c2hvcnRMYWJlbCxcblx0XHR2YWx1ZSxcblx0XHR3aGVuLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVQb3NpdGlvblBhbmVsQWN0aW9uQ29uZmlnKGlkOiBzdHJpbmcsIHRpdGxlOiBJQ29tbWFuZEFjdGlvblRpdGxlLCBzaG9ydExhYmVsOiBzdHJpbmcsIHBvc2l0aW9uOiBQb3NpdGlvbik6IFBhbmVsQWN0aW9uQ29uZmlnPFBvc2l0aW9uPiB7XG5cdHJldHVybiBjcmVhdGVQYW5lbEFjdGlvbkNvbmZpZzxQb3NpdGlvbj4oaWQsIHRpdGxlLCBzaG9ydExhYmVsLCBwb3NpdGlvbiwgUGFuZWxQb3NpdGlvbkNvbnRleHQubm90RXF1YWxzVG8ocG9zaXRpb25Ub1N0cmluZyhwb3NpdGlvbikpKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQWxpZ25tZW50UGFuZWxBY3Rpb25Db25maWcoaWQ6IHN0cmluZywgdGl0bGU6IElDb21tYW5kQWN0aW9uVGl0bGUsIHNob3J0TGFiZWw6IHN0cmluZywgYWxpZ25tZW50OiBQYW5lbEFsaWdubWVudCk6IFBhbmVsQWN0aW9uQ29uZmlnPFBhbmVsQWxpZ25tZW50PiB7XG5cdHJldHVybiBjcmVhdGVQYW5lbEFjdGlvbkNvbmZpZzxQYW5lbEFsaWdubWVudD4oaWQsIHRpdGxlLCBzaG9ydExhYmVsLCBhbGlnbm1lbnQsIFBhbmVsQWxpZ25tZW50Q29udGV4dC5ub3RFcXVhbHNUbyhhbGlnbm1lbnQpKTtcbn1cblxuY29uc3QgUG9zaXRpb25QYW5lbEFjdGlvbkNvbmZpZ3M6IFBhbmVsQWN0aW9uQ29uZmlnPFBvc2l0aW9uPltdID0gW1xuXHRjcmVhdGVQb3NpdGlvblBhbmVsQWN0aW9uQ29uZmlnKFBvc2l0aW9uUGFuZWxBY3Rpb25JZC5UT1AsIGxvY2FsaXplMigncG9zaXRpb25QYW5lbFRvcCcsIFwiTW92ZSBQYW5lbCBUbyBUb3BcIiksIGxvY2FsaXplKCdwb3NpdGlvblBhbmVsVG9wU2hvcnQnLCBcIlRvcFwiKSwgUG9zaXRpb24uVE9QKSxcblx0Y3JlYXRlUG9zaXRpb25QYW5lbEFjdGlvbkNvbmZpZyhQb3NpdGlvblBhbmVsQWN0aW9uSWQuTEVGVCwgbG9jYWxpemUyKCdwb3NpdGlvblBhbmVsTGVmdCcsIFwiTW92ZSBQYW5lbCBMZWZ0XCIpLCBsb2NhbGl6ZSgncG9zaXRpb25QYW5lbExlZnRTaG9ydCcsIFwiTGVmdFwiKSwgUG9zaXRpb24uTEVGVCksXG5cdGNyZWF0ZVBvc2l0aW9uUGFuZWxBY3Rpb25Db25maWcoUG9zaXRpb25QYW5lbEFjdGlvbklkLlJJR0hULCBsb2NhbGl6ZTIoJ3Bvc2l0aW9uUGFuZWxSaWdodCcsIFwiTW92ZSBQYW5lbCBSaWdodFwiKSwgbG9jYWxpemUoJ3Bvc2l0aW9uUGFuZWxSaWdodFNob3J0JywgXCJSaWdodFwiKSwgUG9zaXRpb24uUklHSFQpLFxuXHRjcmVhdGVQb3NpdGlvblBhbmVsQWN0aW9uQ29uZmlnKFBvc2l0aW9uUGFuZWxBY3Rpb25JZC5CT1RUT00sIGxvY2FsaXplMigncG9zaXRpb25QYW5lbEJvdHRvbScsIFwiTW92ZSBQYW5lbCBUbyBCb3R0b21cIiksIGxvY2FsaXplKCdwb3NpdGlvblBhbmVsQm90dG9tU2hvcnQnLCBcIkJvdHRvbVwiKSwgUG9zaXRpb24uQk9UVE9NKSxcbl07XG5cblxuY29uc3QgQWxpZ25QYW5lbEFjdGlvbkNvbmZpZ3M6IFBhbmVsQWN0aW9uQ29uZmlnPFBhbmVsQWxpZ25tZW50PltdID0gW1xuXHRjcmVhdGVBbGlnbm1lbnRQYW5lbEFjdGlvbkNvbmZpZyhBbGlnblBhbmVsQWN0aW9uSWQuTEVGVCwgbG9jYWxpemUyKCdhbGlnblBhbmVsTGVmdCcsIFwiU2V0IFBhbmVsIEFsaWdubWVudCB0byBMZWZ0XCIpLCBsb2NhbGl6ZSgnYWxpZ25QYW5lbExlZnRTaG9ydCcsIFwiTGVmdFwiKSwgJ2xlZnQnKSxcblx0Y3JlYXRlQWxpZ25tZW50UGFuZWxBY3Rpb25Db25maWcoQWxpZ25QYW5lbEFjdGlvbklkLlJJR0hULCBsb2NhbGl6ZTIoJ2FsaWduUGFuZWxSaWdodCcsIFwiU2V0IFBhbmVsIEFsaWdubWVudCB0byBSaWdodFwiKSwgbG9jYWxpemUoJ2FsaWduUGFuZWxSaWdodFNob3J0JywgXCJSaWdodFwiKSwgJ3JpZ2h0JyksXG5cdGNyZWF0ZUFsaWdubWVudFBhbmVsQWN0aW9uQ29uZmlnKEFsaWduUGFuZWxBY3Rpb25JZC5DRU5URVIsIGxvY2FsaXplMignYWxpZ25QYW5lbENlbnRlcicsIFwiU2V0IFBhbmVsIEFsaWdubWVudCB0byBDZW50ZXJcIiksIGxvY2FsaXplKCdhbGlnblBhbmVsQ2VudGVyU2hvcnQnLCBcIkNlbnRlclwiKSwgJ2NlbnRlcicpLFxuXHRjcmVhdGVBbGlnbm1lbnRQYW5lbEFjdGlvbkNvbmZpZyhBbGlnblBhbmVsQWN0aW9uSWQuSlVTVElGWSwgbG9jYWxpemUyKCdhbGlnblBhbmVsSnVzdGlmeScsIFwiU2V0IFBhbmVsIEFsaWdubWVudCB0byBKdXN0aWZ5XCIpLCBsb2NhbGl6ZSgnYWxpZ25QYW5lbEp1c3RpZnlTaG9ydCcsIFwiSnVzdGlmeVwiKSwgJ2p1c3RpZnknKSxcbl07XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckFwcGVhcmFuY2VNZW51LCB7XG5cdHN1Ym1lbnU6IE1lbnVJZC5QYW5lbFBvc2l0aW9uTWVudSxcblx0dGl0bGU6IGxvY2FsaXplKCdwb3NpdGlvblBhbmVsJywgXCJQYW5lbCBQb3NpdGlvblwiKSxcblx0Z3JvdXA6ICczX3dvcmtiZW5jaF9sYXlvdXRfbW92ZScsXG5cdG9yZGVyOiA0XG59KTtcblxuUG9zaXRpb25QYW5lbEFjdGlvbkNvbmZpZ3MuZm9yRWFjaCgocG9zaXRpb25QYW5lbEFjdGlvbiwgaW5kZXgpID0+IHtcblx0Y29uc3QgeyBpZCwgdGl0bGUsIHNob3J0TGFiZWwsIHZhbHVlLCB3aGVuIH0gPSBwb3NpdGlvblBhbmVsQWN0aW9uO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZCxcblx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRcdGYxOiB0cnVlXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0XHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKTtcblx0XHRcdGxheW91dFNlcnZpY2Uuc2V0UGFuZWxQb3NpdGlvbih2YWx1ZSA9PT0gdW5kZWZpbmVkID8gUG9zaXRpb24uQk9UVE9NIDogdmFsdWUpO1xuXHRcdH1cblx0fSk7XG5cblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5QYW5lbFBvc2l0aW9uTWVudSwge1xuXHRcdGNvbW1hbmQ6IHtcblx0XHRcdGlkLFxuXHRcdFx0dGl0bGU6IHNob3J0TGFiZWwsXG5cdFx0XHR0b2dnbGVkOiB3aGVuLm5lZ2F0ZSgpXG5cdFx0fSxcblx0XHRvcmRlcjogNSArIGluZGV4XG5cdH0pO1xufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckFwcGVhcmFuY2VNZW51LCB7XG5cdHN1Ym1lbnU6IE1lbnVJZC5QYW5lbEFsaWdubWVudE1lbnUsXG5cdHRpdGxlOiBsb2NhbGl6ZSgnYWxpZ25QYW5lbCcsIFwiQWxpZ24gUGFuZWxcIiksXG5cdGdyb3VwOiAnM193b3JrYmVuY2hfbGF5b3V0X21vdmUnLFxuXHRvcmRlcjogNVxufSk7XG5cbkFsaWduUGFuZWxBY3Rpb25Db25maWdzLmZvckVhY2goYWxpZ25QYW5lbEFjdGlvbiA9PiB7XG5cdGNvbnN0IHsgaWQsIHRpdGxlLCBzaG9ydExhYmVsLCB2YWx1ZSwgd2hlbiB9ID0gYWxpZ25QYW5lbEFjdGlvbjtcblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkLFxuXHRcdFx0XHR0aXRsZSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdFx0dG9nZ2xlZDogd2hlbi5uZWdhdGUoKSxcblx0XHRcdFx0ZjE6IHRydWVcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaExheW91dFNlcnZpY2UpO1xuXHRcdFx0bGF5b3V0U2VydmljZS5zZXRQYW5lbEFsaWdubWVudCh2YWx1ZSA9PT0gdW5kZWZpbmVkID8gJ2NlbnRlcicgOiB2YWx1ZSk7XG5cdFx0fVxuXHR9KTtcblxuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlBhbmVsQWxpZ25tZW50TWVudSwge1xuXHRcdGNvbW1hbmQ6IHtcblx0XHRcdGlkLFxuXHRcdFx0dGl0bGU6IHNob3J0TGFiZWwsXG5cdFx0XHR0b2dnbGVkOiB3aGVuLm5lZ2F0ZSgpXG5cdFx0fSxcblx0XHRvcmRlcjogNVxuXHR9KTtcbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBTd2l0Y2hDb21wb3NpdGVWaWV3QWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnByZXZpb3VzUGFuZWxWaWV3Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3ByZXZpb3VzUGFuZWxWaWV3JywgXCJQcmV2aW91cyBQYW5lbCBWaWV3XCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsLCAtMSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBTd2l0Y2hDb21wb3NpdGVWaWV3QWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm5leHRQYW5lbFZpZXcnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbmV4dFBhbmVsVmlldycsIFwiTmV4dCBQYW5lbCBWaWV3XCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsLCAxKTtcblx0fVxufSk7XG5cbmNvbnN0IHBhbmVsTWF4aW1pemF0aW9uU3VwcG9ydGVkV2hlbiA9IENvbnRleHRLZXlFeHByLm9yKFBhbmVsQWxpZ25tZW50Q29udGV4dC5pc0VxdWFsVG8oJ2NlbnRlcicpLCBDb250ZXh0S2V5RXhwci5hbmQoUGFuZWxQb3NpdGlvbkNvbnRleHQubm90RXF1YWxzVG8oJ2JvdHRvbScpLCBQYW5lbFBvc2l0aW9uQ29udGV4dC5ub3RFcXVhbHNUbygndG9wJykpKTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi50b2dnbGVNYXhpbWl6ZWRQYW5lbCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0b2dnbGVNYXhpbWl6ZWRQYW5lbCcsICdUb2dnbGUgTWF4aW1pemVkIFBhbmVsJyksXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnbWF4aW1pemVQYW5lbCcsIFwiTWF4aW1pemUgUGFuZWxcIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRpY29uOiBtYXhpbWl6ZUljb24sXG5cdFx0XHRwcmVjb25kaXRpb246IHBhbmVsTWF4aW1pemF0aW9uU3VwcG9ydGVkV2hlbixcblx0XHRcdHRvZ2dsZWQ6IHtcblx0XHRcdFx0Y29uZGl0aW9uOiBQYW5lbE1heGltaXplZENvbnRleHQsXG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdtaW5pbWl6ZVBhbmVsJywgXCJSZXN0b3JlIFBhbmVsXCIpXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5QYW5lbFRpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogcGFuZWxNYXhpbWl6YXRpb25TdXBwb3J0ZWRXaGVuXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaExheW91dFNlcnZpY2UpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdGlmIChsYXlvdXRTZXJ2aWNlLmdldFBhbmVsQWxpZ25tZW50KCkgIT09ICdjZW50ZXInICYmIGlzSG9yaXpvbnRhbChsYXlvdXRTZXJ2aWNlLmdldFBhbmVsUG9zaXRpb24oKSkpIHtcblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uud2Fybihsb2NhbGl6ZSgncGFuZWxNYXhOb3RTdXBwb3J0ZWQnLCBcIk1heGltaXppbmcgdGhlIHBhbmVsIGlzIG9ubHkgc3VwcG9ydGVkIHdoZW4gaXQgaXMgY2VudGVyIGFsaWduZWQuXCIpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIWxheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLlBBTkVMX1BBUlQpKSB7XG5cdFx0XHRsYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4oZmFsc2UsIFBhcnRzLlBBTkVMX1BBUlQpO1xuXHRcdFx0Ly8gSWYgdGhlIHBhbmVsIGlzIG5vdCBhbHJlYWR5IG1heGltaXplZCwgbWF4aW1pemUgaXRcblx0XHRcdGlmICghbGF5b3V0U2VydmljZS5pc1BhbmVsTWF4aW1pemVkKCkpIHtcblx0XHRcdFx0bGF5b3V0U2VydmljZS50b2dnbGVNYXhpbWl6ZWRQYW5lbCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdGxheW91dFNlcnZpY2UudG9nZ2xlTWF4aW1pemVkUGFuZWwoKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW1zKFtcblx0e1xuXHRcdGlkOiBNZW51SWQuTGF5b3V0Q29udHJvbE1lbnUsXG5cdFx0aXRlbToge1xuXHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQ6IFRvZ2dsZVBhbmVsQWN0aW9uLklELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3RvZ2dsZVBhbmVsJywgXCJUb2dnbGUgUGFuZWxcIiksXG5cdFx0XHRcdGljb246IHBhbmVsT2ZmSWNvbixcblx0XHRcdFx0dG9nZ2xlZDogeyBjb25kaXRpb246IFBhbmVsVmlzaWJsZUNvbnRleHQsIGljb246IHBhbmVsSWNvbiB9XG5cdFx0XHR9LFxuXHRcdFx0d2hlbjpcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdElzQXV4aWxpYXJ5V2luZG93Q29udGV4dC5uZWdhdGUoKSxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLndvcmtiZW5jaC5sYXlvdXRDb250cm9sLnR5cGUnLCAndG9nZ2xlcycpLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcud29ya2JlbmNoLmxheW91dENvbnRyb2wudHlwZScsICdib3RoJylcblx0XHRcdFx0XHQpXG5cdFx0XHRcdCksXG5cdFx0XHRvcmRlcjogMVxuXHRcdH1cblx0fVxuXSk7XG5cbmNsYXNzIE1vdmVWaWV3c0JldHdlZW5QYW5lbHNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBzb3VyY2U6IFZpZXdDb250YWluZXJMb2NhdGlvbiwgcHJpdmF0ZSByZWFkb25seSBkZXN0aW5hdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uLCBkZXNjOiBSZWFkb25seTxJQWN0aW9uMk9wdGlvbnM+KSB7XG5cdFx0c3VwZXIoZGVzYyk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cblx0XHRjb25zdCBzcmNDb250YWluZXJzID0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJzQnlMb2NhdGlvbih0aGlzLnNvdXJjZSk7XG5cdFx0Y29uc3QgZGVzdENvbnRhaW5lcnMgPSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lcnNCeUxvY2F0aW9uKHRoaXMuZGVzdGluYXRpb24pO1xuXG5cdFx0aWYgKHNyY0NvbnRhaW5lcnMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBhY3RpdmVWaWV3Q29udGFpbmVyID0gdmlld3NTZXJ2aWNlLmdldFZpc2libGVWaWV3Q29udGFpbmVyKHRoaXMuc291cmNlKTtcblxuXHRcdFx0c3JjQ29udGFpbmVycy5mb3JFYWNoKHZpZXdDb250YWluZXIgPT4gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLm1vdmVWaWV3Q29udGFpbmVyVG9Mb2NhdGlvbih2aWV3Q29udGFpbmVyLCB0aGlzLmRlc3RpbmF0aW9uLCB1bmRlZmluZWQsIHRoaXMuZGVzYy5pZCkpO1xuXHRcdFx0bGF5b3V0U2VydmljZS5zZXRQYXJ0SGlkZGVuKGZhbHNlLCB0aGlzLmRlc3RpbmF0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwgPyBQYXJ0cy5QQU5FTF9QQVJUIDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXG5cdFx0XHRpZiAoYWN0aXZlVmlld0NvbnRhaW5lciAmJiBkZXN0Q29udGFpbmVycy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0dmlld3NTZXJ2aWNlLm9wZW5WaWV3Q29udGFpbmVyKGFjdGl2ZVZpZXdDb250YWluZXIuaWQsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG4vLyAtLS0gTW92ZSBQYW5lbCBWaWV3cyBUbyBTZWNvbmRhcnkgU2lkZSBCYXJcblxuY2xhc3MgTW92ZVBhbmVsVG9TaWRlUGFuZWxBY3Rpb24gZXh0ZW5kcyBNb3ZlVmlld3NCZXR3ZWVuUGFuZWxzQWN0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24ubW92ZVBhbmVsVG9TaWRlUGFuZWwnO1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwsIFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIsIHtcblx0XHRcdGlkOiBNb3ZlUGFuZWxUb1NpZGVQYW5lbEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21vdmVQYW5lbFRvU2Vjb25kYXJ5U2lkZUJhcicsIFwiTW92ZSBQYW5lbCBWaWV3cyBUbyBTZWNvbmRhcnkgU2lkZSBCYXJcIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0ZjE6IGZhbHNlXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vdmVQYW5lbFRvU2Vjb25kYXJ5U2lkZUJhckFjdGlvbiBleHRlbmRzIE1vdmVWaWV3c0JldHdlZW5QYW5lbHNBY3Rpb24ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5tb3ZlUGFuZWxUb1NlY29uZGFyeVNpZGVCYXInO1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwsIFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIsIHtcblx0XHRcdGlkOiBNb3ZlUGFuZWxUb1NlY29uZGFyeVNpZGVCYXJBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtb3ZlUGFuZWxUb1NlY29uZGFyeVNpZGVCYXInLCBcIk1vdmUgUGFuZWwgVmlld3MgVG8gU2Vjb25kYXJ5IFNpZGUgQmFyXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKE1vdmVQYW5lbFRvU2lkZVBhbmVsQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihNb3ZlUGFuZWxUb1NlY29uZGFyeVNpZGVCYXJBY3Rpb24pO1xuXG4vLyAtLS0gTW92ZSBTZWNvbmRhcnkgU2lkZSBCYXIgVmlld3MgVG8gUGFuZWxcblxuY2xhc3MgTW92ZVNpZGVQYW5lbFRvUGFuZWxBY3Rpb24gZXh0ZW5kcyBNb3ZlVmlld3NCZXR3ZWVuUGFuZWxzQWN0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24ubW92ZVNpZGVQYW5lbFRvUGFuZWwnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIsIFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCwge1xuXHRcdFx0aWQ6IE1vdmVTaWRlUGFuZWxUb1BhbmVsQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbW92ZVNpZGVQYW5lbFRvUGFuZWwnLCBcIk1vdmUgU2Vjb25kYXJ5IFNpZGUgQmFyIFZpZXdzIFRvIFBhbmVsXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdGYxOiBmYWxzZVxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNb3ZlU2Vjb25kYXJ5U2lkZUJhclRvUGFuZWxBY3Rpb24gZXh0ZW5kcyBNb3ZlVmlld3NCZXR3ZWVuUGFuZWxzQWN0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24ubW92ZVNlY29uZGFyeVNpZGVCYXJUb1BhbmVsJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwsIHtcblx0XHRcdGlkOiBNb3ZlU2Vjb25kYXJ5U2lkZUJhclRvUGFuZWxBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtb3ZlU2lkZVBhbmVsVG9QYW5lbCcsIFwiTW92ZSBTZWNvbmRhcnkgU2lkZSBCYXIgVmlld3MgVG8gUGFuZWxcIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxufVxucmVnaXN0ZXJBY3Rpb24yKE1vdmVTaWRlUGFuZWxUb1BhbmVsQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihNb3ZlU2Vjb25kYXJ5U2lkZUJhclRvUGFuZWxBY3Rpb24pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBQUE7QUFLQSxPQUFPO0FBQ1AsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLFFB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
