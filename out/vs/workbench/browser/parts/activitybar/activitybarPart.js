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
import "./media/activitybarpart.css";
import "./media/activityaction.css";
import { localize, localize2 } from "../../../../nls.js";
import { ActionsOrientation } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { Part } from "../../part.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { ActivityBarPosition, IWorkbenchLayoutService, LayoutSettings, Parts, Position, FLOATING_PANEL_INNER_MARGIN, FLOATING_PANEL_MARGIN, isFloatingTopEdgeExposed } from "../../../services/layout/browser/layoutService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { ToggleSidebarPositionAction, ToggleSidebarVisibilityAction } from "../../actions/layoutActions.js";
import { IThemeService, registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { ACTIVITY_BAR_BACKGROUND, ACTIVITY_BAR_BORDER, ACTIVITY_BAR_FOREGROUND, ACTIVITY_BAR_ACTIVE_BORDER, ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, ACTIVITY_BAR_INACTIVE_FOREGROUND, ACTIVITY_BAR_ACTIVE_BACKGROUND, ACTIVITY_BAR_DRAG_AND_DROP_BORDER, ACTIVITY_BAR_ACTIVE_FOCUS_BORDER } from "../../../common/theme.js";
import { activeContrastBorder, contrastBorder, focusBorder } from "../../../../platform/theme/common/colorRegistry.js";
import { addDisposableListener, append, EventType, isAncestor, $, clearNode } from "../../../../base/browser/dom.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { CustomMenubarControl } from "../titlebar/menubarControl.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { getMenuBarVisibility, MenuSettings } from "../../../../platform/window/common/window.js";
import { Separator, SubmenuAction, toAction } from "../../../../base/common/actions.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { PaneCompositeBar } from "../paneCompositeBar.js";
import { GlobalCompositeBar } from "../globalCompositeBar.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { Action2, IMenuService, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IsSessionsWindowContext } from "../../../common/contextkeys.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { getContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IViewDescriptorService, ViewContainerLocation, ViewContainerLocationToString } from "../../../common/views.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { SwitchCompositeViewAction } from "../compositeBarActions.js";
let ActivitybarPart = class extends Part {
  constructor(location, paneCompositePart, instantiationService, layoutService, themeService, storageService, configurationService) {
    super(Parts.ACTIVITYBAR_PART, { hasTitle: false }, themeService, storageService, layoutService);
    this.location = location;
    this.paneCompositePart = paneCompositePart;
    this.instantiationService = instantiationService;
    this.configurationService = configurationService;
    this.minimumHeight = 0;
    this.maximumHeight = Number.POSITIVE_INFINITY;
    this.compositeBar = this._register(new MutableDisposable());
    this._isCompact = this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_COMPACT) ?? false;
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_COMPACT)) {
        this._isCompact = this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_COMPACT) ?? false;
        this.updateCompactStyle();
        this.recreateCompositeBar();
        this._onDidChange.fire(void 0);
      }
      if (e.affectsConfiguration(LayoutSettings.MODERN_UI)) {
        this.updateCompactStyle();
        this.recreateCompositeBar();
        this._onDidChange.fire(void 0);
      }
    }));
  }
  //#region IView
  get minimumWidth() {
    return this.baseWidth + this.floatingHorizontalGutter;
  }
  get maximumWidth() {
    return this.baseWidth + this.floatingHorizontalGutter;
  }
  //#endregion
  /** The intrinsic activity bar width (excludes any floating gutter). */
  get baseWidth() {
    if (this.layoutService.isFloatingPanelsEnabled()) {
      return this._isCompact ? ActivitybarPart.FLOATING_COMPACT_ACTIVITYBAR_WIDTH : ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH;
    }
    return this._isCompact ? ActivitybarPart.COMPACT_ACTIVITYBAR_WIDTH : ActivitybarPart.ACTIVITYBAR_WIDTH;
  }
  /** The action (item) height that drives visible item sizing and the composite bar overflow size. */
  get actionHeight() {
    if (this._isCompact) {
      return ActivitybarPart.COMPACT_ACTION_HEIGHT;
    }
    return this.layoutService.isFloatingPanelsEnabled() ? ActivitybarPart.FLOATING_ACTION_HEIGHT : ActivitybarPart.ACTION_HEIGHT;
  }
  get floatingHorizontalGutter() {
    if (!this.layoutService.isFloatingPanelsEnabled()) {
      return 0;
    }
    return ActivitybarPart.FLOATING_MARGIN * 2 + (this.layoutService.getSideBarPosition() === Position.RIGHT ? FLOATING_PANEL_MARGIN : 0);
  }
  updateCompactStyle() {
    if (this.element) {
      this.element.classList.toggle("compact", this._isCompact);
      this.layoutService.mainContainer.classList.toggle("activitybar-compact", this._isCompact);
      this.element.style.setProperty("--activity-bar-width", `${this.baseWidth}px`);
      this.element.style.setProperty("--activity-bar-action-height", `${this.actionHeight}px`);
      this.element.style.setProperty("--activity-bar-icon-size", `${this._isCompact ? ActivitybarPart.COMPACT_ICON_SIZE : ActivitybarPart.ICON_SIZE}px`);
    }
  }
  recreateCompositeBar() {
    if (!this.content || !this.compositeBar.value) {
      return;
    }
    this.compositeBar.clear();
    clearNode(this.content);
    this.compositeBar.value = this.createCompositeBar();
    this.compositeBar.value.create(this.content);
    if (this.dimension) {
      this.layout(this.dimension.width, this.dimension.height);
    }
  }
  createCompositeBar() {
    const actionHeight = this.actionHeight;
    const iconSize = this._isCompact ? ActivitybarPart.COMPACT_ICON_SIZE : ActivitybarPart.ICON_SIZE;
    return this.instantiationService.createInstance(ActivityBarCompositeBar, this.location, {
      partContainerClass: "activitybar",
      pinnedViewContainersKey: ActivitybarPart.pinnedViewContainersKey,
      placeholderViewContainersKey: ActivitybarPart.placeholderViewContainersKey,
      viewContainersWorkspaceStateKey: ActivitybarPart.viewContainersWorkspaceStateKey,
      orientation: ActionsOrientation.VERTICAL,
      icon: true,
      iconSize,
      activityHoverOptions: {
        position: () => this.layoutService.getSideBarPosition() === Position.LEFT ? HoverPosition.RIGHT : HoverPosition.LEFT
      },
      preventLoopNavigation: true,
      recomputeSizes: false,
      fillExtraContextMenuActions: (actions, e) => {
      },
      compositeSize: 52,
      colors: (theme) => ({
        activeForegroundColor: theme.getColor(ACTIVITY_BAR_FOREGROUND),
        inactiveForegroundColor: theme.getColor(ACTIVITY_BAR_INACTIVE_FOREGROUND),
        activeBorderColor: theme.getColor(ACTIVITY_BAR_ACTIVE_BORDER),
        activeBackground: theme.getColor(ACTIVITY_BAR_ACTIVE_BACKGROUND),
        badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
        badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
        dragAndDropBorder: theme.getColor(ACTIVITY_BAR_DRAG_AND_DROP_BORDER),
        activeBackgroundColor: void 0,
        inactiveBackgroundColor: void 0,
        activeBorderBottomColor: void 0
      }),
      overflowActionSize: actionHeight
    }, Parts.ACTIVITYBAR_PART, this.paneCompositePart, true);
  }
  createContentArea(parent) {
    this.element = parent;
    this.content = append(this.element, $(".content"));
    this.updateCompactStyle();
    if (this.layoutService.isVisible(Parts.ACTIVITYBAR_PART)) {
      this.show();
    }
    return this.content;
  }
  getPinnedPaneCompositeIds() {
    return this.compositeBar.value?.getPinnedPaneCompositeIds() ?? [];
  }
  getVisiblePaneCompositeIds() {
    return this.compositeBar.value?.getVisiblePaneCompositeIds() ?? [];
  }
  getPaneCompositeIds() {
    return this.compositeBar.value?.getPaneCompositeIds() ?? [];
  }
  focus() {
    this.compositeBar.value?.focus();
  }
  updateStyles() {
    super.updateStyles();
    const container = assertReturnsDefined(this.getContainer());
    const background = this.getColor(ACTIVITY_BAR_BACKGROUND) || "";
    container.style.backgroundColor = background;
    const borderColor = this.getColor(ACTIVITY_BAR_BORDER) || this.getColor(contrastBorder) || "";
    container.classList.toggle("bordered", !!borderColor);
    container.style.borderColor = borderColor ? borderColor : "";
  }
  show(focus) {
    if (!this.content) {
      return;
    }
    if (!this.compositeBar.value) {
      this.compositeBar.value = this.createCompositeBar();
      this.compositeBar.value.create(this.content);
      if (this.dimension) {
        this.layout(this.dimension.width, this.dimension.height);
      }
    }
    if (focus) {
      this.focus();
    }
  }
  hide() {
    if (!this.compositeBar.value) {
      return;
    }
    this.compositeBar.clear();
    if (this.content) {
      clearNode(this.content);
    }
  }
  layout(width, height) {
    super.layout(width, height, 0, 0);
    if (!this.content) {
      return;
    }
    const { top, bottom } = this.getFloatingGutters();
    const contentWidth = Math.max(0, width - this.floatingHorizontalGutter);
    const contentHeight = Math.max(0, height - top - bottom);
    const contentAreaSize = super.layoutContents(contentWidth, contentHeight).contentSize;
    this.compositeBar.value?.layout(contentWidth, contentAreaSize.height);
  }
  /**
   * Vertical gutters (in pixels) mirroring the margins in `floatingPanels.css`.
   * The top is flush with title/banner chrome and doubles only at an exposed window edge.
   */
  getFloatingGutters() {
    if (!this.layoutService.isFloatingPanelsEnabled()) {
      return { top: 0, bottom: 0 };
    }
    return {
      top: isFloatingTopEdgeExposed(this.layoutService, mainWindow) ? FLOATING_PANEL_MARGIN * 2 : FLOATING_PANEL_INNER_MARGIN,
      bottom: this.layoutService.isVisible(Parts.STATUSBAR_PART, mainWindow) ? FLOATING_PANEL_MARGIN : FLOATING_PANEL_MARGIN * 2
    };
  }
  toJSON() {
    return {
      type: Parts.ACTIVITYBAR_PART
    };
  }
};
ActivitybarPart.ACTION_HEIGHT = 48;
ActivitybarPart.COMPACT_ACTION_HEIGHT = 28;
ActivitybarPart.ACTIVITYBAR_WIDTH = 48;
ActivitybarPart.COMPACT_ACTIVITYBAR_WIDTH = 36;
/** Narrower dimensions used when the floating panels (Modern UI) experiment is enabled. */
ActivitybarPart.FLOATING_ACTION_HEIGHT = 36;
ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH = 36;
ActivitybarPart.FLOATING_COMPACT_ACTIVITYBAR_WIDTH = 28;
ActivitybarPart.ICON_SIZE = 24;
ActivitybarPart.COMPACT_ICON_SIZE = 16;
/**
 * Base gutter reserved around the activity bar under the floating panels
 * experiment. Must match the margins applied in `floatingPanels.css`.
 */
ActivitybarPart.FLOATING_MARGIN = FLOATING_PANEL_MARGIN;
ActivitybarPart.pinnedViewContainersKey = "workbench.activity.pinnedViewlets2";
ActivitybarPart.placeholderViewContainersKey = "workbench.activity.placeholderViewlets";
ActivitybarPart.viewContainersWorkspaceStateKey = "workbench.activity.viewletsWorkspaceState";
ActivitybarPart = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IWorkbenchLayoutService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IConfigurationService)
], ActivitybarPart);
let ActivityBarCompositeBar = class extends PaneCompositeBar {
  constructor(location, options, part, paneCompositePart, showGlobalActivities, instantiationService, storageService, extensionService, viewDescriptorService, viewService, contextKeyService, environmentService, configurationService, menuService, layoutService) {
    super(
      location,
      {
        ...options,
        fillExtraContextMenuActions: (actions, e) => {
          options.fillExtraContextMenuActions(actions, e);
          this.fillContextMenuActions(actions, e);
        }
      },
      part,
      paneCompositePart,
      instantiationService,
      storageService,
      extensionService,
      viewDescriptorService,
      viewService,
      contextKeyService,
      environmentService,
      layoutService
    );
    this.configurationService = configurationService;
    this.menuService = menuService;
    this.menuBar = this._register(new MutableDisposable());
    this.keyboardNavigationDisposables = this._register(new DisposableStore());
    if (showGlobalActivities) {
      this.globalCompositeBar = this._register(instantiationService.createInstance(GlobalCompositeBar, () => this.getContextMenuActions(), (theme) => this.options.colors(theme), this.options.activityHoverOptions));
    }
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(MenuSettings.MenuBarVisibility)) {
        if (getMenuBarVisibility(this.configurationService) === "compact") {
          this.installMenubar();
        } else {
          this.uninstallMenubar();
        }
      }
    }));
  }
  fillContextMenuActions(actions, e) {
    const menuBarVisibility = getMenuBarVisibility(this.configurationService);
    if (menuBarVisibility === "compact" || menuBarVisibility === "hidden" || menuBarVisibility === "toggle") {
      actions.unshift(...[toAction({ id: "toggleMenuVisibility", label: localize("menu", "Menu"), checked: menuBarVisibility === "compact", run: () => this.configurationService.updateValue(MenuSettings.MenuBarVisibility, menuBarVisibility === "compact" ? "toggle" : "compact") }), new Separator()]);
    }
    if (menuBarVisibility === "compact" && this.menuBarContainer && e?.target) {
      if (isAncestor(e.target, this.menuBarContainer)) {
        actions.unshift(...[toAction({ id: "hideCompactMenu", label: localize("hideMenu", "Hide Menu"), run: () => this.configurationService.updateValue(MenuSettings.MenuBarVisibility, "toggle") }), new Separator()]);
      }
    }
    if (this.globalCompositeBar) {
      actions.push(new Separator());
      actions.push(...this.globalCompositeBar.getContextMenuActions());
    }
    actions.push(new Separator());
    actions.push(...this.getActivityBarContextMenuActions());
  }
  uninstallMenubar() {
    if (this.menuBar.value) {
      this.menuBar.value = void 0;
    }
    if (this.menuBarContainer) {
      this.menuBarContainer.remove();
      this.menuBarContainer = void 0;
    }
  }
  installMenubar() {
    if (this.menuBar.value) {
      return;
    }
    this.menuBarContainer = $(".menubar");
    const content = assertReturnsDefined(this.element);
    content.prepend(this.menuBarContainer);
    this.menuBar.value = this.instantiationService.createInstance(CustomMenubarControl);
    this.menuBar.value.create(this.menuBarContainer);
  }
  registerKeyboardNavigationListeners() {
    this.keyboardNavigationDisposables.clear();
    if (this.menuBarContainer) {
      this.keyboardNavigationDisposables.add(addDisposableListener(this.menuBarContainer, EventType.KEY_DOWN, (e) => {
        const kbEvent = new StandardKeyboardEvent(e);
        if (kbEvent.equals(KeyCode.DownArrow) || kbEvent.equals(KeyCode.RightArrow)) {
          this.focus();
        }
      }));
    }
    if (this.compositeBarContainer) {
      this.keyboardNavigationDisposables.add(addDisposableListener(this.compositeBarContainer, EventType.KEY_DOWN, (e) => {
        const kbEvent = new StandardKeyboardEvent(e);
        if (kbEvent.equals(KeyCode.DownArrow) || kbEvent.equals(KeyCode.RightArrow)) {
          this.globalCompositeBar?.focus();
        } else if (kbEvent.equals(KeyCode.UpArrow) || kbEvent.equals(KeyCode.LeftArrow)) {
          this.menuBar.value?.toggleFocus();
        }
      }));
    }
    if (this.globalCompositeBar) {
      this.keyboardNavigationDisposables.add(addDisposableListener(this.globalCompositeBar.element, EventType.KEY_DOWN, (e) => {
        const kbEvent = new StandardKeyboardEvent(e);
        if (kbEvent.equals(KeyCode.UpArrow) || kbEvent.equals(KeyCode.LeftArrow)) {
          this.focus(this.getVisiblePaneCompositeIds().length - 1);
        }
      }));
    }
  }
  create(parent) {
    this.element = parent;
    if (getMenuBarVisibility(this.configurationService) === "compact") {
      this.installMenubar();
    }
    this.compositeBarContainer = super.create(this.element);
    if (this.globalCompositeBar) {
      this.globalCompositeBar.create(this.element);
    }
    this.registerKeyboardNavigationListeners();
    return this.compositeBarContainer;
  }
  layout(width, height) {
    if (this.menuBarContainer) {
      if (this.options.orientation === ActionsOrientation.VERTICAL) {
        height -= this.menuBarContainer.clientHeight;
      } else {
        width -= this.menuBarContainer.clientWidth;
      }
    }
    if (this.globalCompositeBar) {
      if (this.options.orientation === ActionsOrientation.VERTICAL) {
        height -= this.globalCompositeBar.size() * this.options.overflowActionSize;
      } else {
        width -= this.globalCompositeBar.element.clientWidth;
      }
    }
    super.layout(width, height);
  }
  getActivityBarContextMenuActions() {
    const activityBarPositionMenu = this.menuService.getMenuActions(MenuId.ActivityBarPositionMenu, this.contextKeyService, { shouldForwardArgs: true, renderShortTitle: true });
    const positionActions = getContextMenuActions(activityBarPositionMenu).secondary;
    const actions = [
      new SubmenuAction("workbench.action.activityBar.position", localize("activity bar position", "Activity Bar Position"), positionActions)
    ];
    const activityBarPosition = this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION);
    if (activityBarPosition === ActivityBarPosition.DEFAULT) {
      const isCompact = this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_COMPACT) ?? false;
      const sizeActions = [
        toAction({ id: "workbench.action.activityBar.size.default", label: localize("activityBarSizeDefault", "Default"), checked: !isCompact, run: () => this.configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_COMPACT, false) }),
        toAction({ id: "workbench.action.activityBar.size.compact", label: localize("activityBarSizeCompact", "Compact"), checked: isCompact, run: () => this.configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_COMPACT, true) })
      ];
      actions.push(new SubmenuAction("workbench.action.activityBar.size", localize("activity bar size", "Activity Bar Size"), sizeActions));
    }
    actions.push(toAction({ id: ToggleSidebarPositionAction.ID, label: ToggleSidebarPositionAction.getLabel(this.layoutService), run: () => this.instantiationService.invokeFunction((accessor) => new ToggleSidebarPositionAction().run(accessor)) }));
    if (this.part === Parts.SIDEBAR_PART) {
      actions.push(toAction({ id: ToggleSidebarVisibilityAction.ID, label: ToggleSidebarVisibilityAction.LABEL, run: () => this.instantiationService.invokeFunction((accessor) => new ToggleSidebarVisibilityAction().run(accessor)) }));
    }
    return actions;
  }
};
ActivityBarCompositeBar = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IExtensionService),
  __decorateParam(8, IViewDescriptorService),
  __decorateParam(9, IViewsService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, IWorkbenchEnvironmentService),
  __decorateParam(12, IConfigurationService),
  __decorateParam(13, IMenuService),
  __decorateParam(14, IWorkbenchLayoutService)
], ActivityBarCompositeBar);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.activityBarLocation.default",
      title: {
        ...localize2("positionActivityBarDefault", "Move Activity Bar to Side"),
        mnemonicTitle: localize({ key: "miDefaultActivityBar", comment: ["&& denotes a mnemonic"] }, "&&Default")
      },
      shortTitle: localize("default", "Default"),
      category: Categories.View,
      toggled: ContextKeyExpr.equals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.DEFAULT),
      menu: [{
        id: MenuId.ActivityBarPositionMenu,
        order: 1
      }, {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(ContextKeyExpr.notEquals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.DEFAULT), IsSessionsWindowContext.negate())
      }]
    });
  }
  run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, ActivityBarPosition.DEFAULT);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.activityBarLocation.top",
      title: {
        ...localize2("positionActivityBarTop", "Move Activity Bar to Top"),
        mnemonicTitle: localize({ key: "miTopActivityBar", comment: ["&& denotes a mnemonic"] }, "&&Top")
      },
      shortTitle: localize("top", "Top"),
      category: Categories.View,
      toggled: ContextKeyExpr.equals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.TOP),
      menu: [{
        id: MenuId.ActivityBarPositionMenu,
        order: 2
      }, {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(ContextKeyExpr.notEquals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.TOP), IsSessionsWindowContext.negate())
      }]
    });
  }
  run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, ActivityBarPosition.TOP);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.activityBarLocation.bottom",
      title: {
        ...localize2("positionActivityBarBottom", "Move Activity Bar to Bottom"),
        mnemonicTitle: localize({ key: "miBottomActivityBar", comment: ["&& denotes a mnemonic"] }, "&&Bottom")
      },
      shortTitle: localize("bottom", "Bottom"),
      category: Categories.View,
      toggled: ContextKeyExpr.equals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.BOTTOM),
      menu: [{
        id: MenuId.ActivityBarPositionMenu,
        order: 3
      }, {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(ContextKeyExpr.notEquals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.BOTTOM), IsSessionsWindowContext.negate())
      }]
    });
  }
  run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, ActivityBarPosition.BOTTOM);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.activityBarLocation.hide",
      title: {
        ...localize2("hideActivityBar", "Hide Activity Bar"),
        mnemonicTitle: localize({ key: "miHideActivityBar", comment: ["&& denotes a mnemonic"] }, "&&Hidden")
      },
      shortTitle: localize("hide", "Hidden"),
      category: Categories.View,
      toggled: ContextKeyExpr.equals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.HIDDEN),
      menu: [{
        id: MenuId.ActivityBarPositionMenu,
        order: 4
      }, {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(ContextKeyExpr.notEquals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.HIDDEN), IsSessionsWindowContext.negate())
      }]
    });
  }
  run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, ActivityBarPosition.HIDDEN);
  }
});
MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
  submenu: MenuId.ActivityBarPositionMenu,
  title: localize("positionActivituBar", "Activity Bar Position"),
  group: "3_workbench_layout_move",
  order: 2,
  when: IsSessionsWindowContext.negate()
});
MenuRegistry.appendMenuItem(MenuId.ViewContainerTitleContext, {
  submenu: MenuId.ActivityBarPositionMenu,
  title: localize("positionActivituBar", "Activity Bar Position"),
  when: ContextKeyExpr.or(
    ContextKeyExpr.equals("viewContainerLocation", ViewContainerLocationToString(ViewContainerLocation.Sidebar)),
    ContextKeyExpr.equals("viewContainerLocation", ViewContainerLocationToString(ViewContainerLocation.AuxiliaryBar))
  ),
  group: "3_workbench_layout_move",
  order: 1
});
registerAction2(class extends SwitchCompositeViewAction {
  constructor() {
    super({
      id: "workbench.action.previousSideBarView",
      title: localize2("previousSideBarView", "Previous Primary Side Bar View"),
      category: Categories.View,
      f1: true
    }, ViewContainerLocation.Sidebar, -1);
  }
});
registerAction2(class extends SwitchCompositeViewAction {
  constructor() {
    super({
      id: "workbench.action.nextSideBarView",
      title: localize2("nextSideBarView", "Next Primary Side Bar View"),
      category: Categories.View,
      f1: true
    }, ViewContainerLocation.Sidebar, 1);
  }
});
registerAction2(
  class FocusActivityBarAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.focusActivityBar",
        title: localize2("focusActivityBar", "Focus Activity Bar"),
        category: Categories.View,
        f1: true
      });
    }
    async run(accessor) {
      const layoutService = accessor.get(IWorkbenchLayoutService);
      layoutService.focusPart(Parts.ACTIVITYBAR_PART);
    }
  }
);
registerThemingParticipant((theme, collector) => {
  const activityBarActiveBorderColor = theme.getColor(ACTIVITY_BAR_ACTIVE_BORDER);
  if (activityBarActiveBorderColor) {
    collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked .active-item-indicator:before {
				border-left-color: ${activityBarActiveBorderColor};
			}
		`);
  }
  const activityBarActiveFocusBorderColor = theme.getColor(ACTIVITY_BAR_ACTIVE_FOCUS_BORDER);
  if (activityBarActiveFocusBorderColor) {
    collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:focus::before {
				visibility: hidden;
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:focus .active-item-indicator:before {
				visibility: visible;
				border-left-color: ${activityBarActiveFocusBorderColor};
			}
		`);
  }
  const activityBarActiveBackgroundColor = theme.getColor(ACTIVITY_BAR_ACTIVE_BACKGROUND);
  if (activityBarActiveBackgroundColor) {
    collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked .active-item-indicator {
				z-index: 0;
				background-color: ${activityBarActiveBackgroundColor};
			}
		`);
  }
  const outline = theme.getColor(activeContrastBorder);
  if (outline) {
    collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item .action-label::before{
				padding: 6px;
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active .action-label::before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active:hover .action-label::before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked .action-label::before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:hover .action-label::before {
				outline: 1px solid ${outline};
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:hover .action-label::before {
				outline: 1px dashed ${outline};
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:focus .active-item-indicator:before {
				border-left-color: ${outline};
			}
		`);
  } else {
    const focusBorderColor = theme.getColor(focusBorder);
    if (focusBorderColor) {
      collector.addRule(`
				.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:focus .active-item-indicator::before {
						border-left-color: ${focusBorderColor};
					}
				`);
    }
  }
});
export {
  ActivityBarCompositeBar,
  ActivitybarPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxhY3Rpdml0eWJhclxcYWN0aXZpdHliYXJQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2FjdGl2aXR5YmFycGFydC5jc3MnO1xuaW1wb3J0ICcuL21lZGlhL2FjdGl2aXR5YWN0aW9uLmNzcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbnNPcmllbnRhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IFBhcnQgfSBmcm9tICcuLi8uLi9wYXJ0LmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IEFjdGl2aXR5QmFyUG9zaXRpb24sIElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBMYXlvdXRTZXR0aW5ncywgUGFydHMsIFBvc2l0aW9uLCBGTE9BVElOR19QQU5FTF9JTk5FUl9NQVJHSU4sIEZMT0FUSU5HX1BBTkVMX01BUkdJTiwgaXNGbG9hdGluZ1RvcEVkZ2VFeHBvc2VkIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVG9nZ2xlU2lkZWJhclBvc2l0aW9uQWN0aW9uLCBUb2dnbGVTaWRlYmFyVmlzaWJpbGl0eUFjdGlvbiB9IGZyb20gJy4uLy4uL2FjdGlvbnMvbGF5b3V0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlLCBJQ29sb3JUaGVtZSwgcmVnaXN0ZXJUaGVtaW5nUGFydGljaXBhbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFDVElWSVRZX0JBUl9CQUNLR1JPVU5ELCBBQ1RJVklUWV9CQVJfQk9SREVSLCBBQ1RJVklUWV9CQVJfRk9SRUdST1VORCwgQUNUSVZJVFlfQkFSX0FDVElWRV9CT1JERVIsIEFDVElWSVRZX0JBUl9CQURHRV9CQUNLR1JPVU5ELCBBQ1RJVklUWV9CQVJfQkFER0VfRk9SRUdST1VORCwgQUNUSVZJVFlfQkFSX0lOQUNUSVZFX0ZPUkVHUk9VTkQsIEFDVElWSVRZX0JBUl9BQ1RJVkVfQkFDS0dST1VORCwgQUNUSVZJVFlfQkFSX0RSQUdfQU5EX0RST1BfQk9SREVSLCBBQ1RJVklUWV9CQVJfQUNUSVZFX0ZPQ1VTX0JPUkRFUiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBhY3RpdmVDb250cmFzdEJvcmRlciwgY29udHJhc3RCb3JkZXIsIGZvY3VzQm9yZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBhcHBlbmQsIEV2ZW50VHlwZSwgaXNBbmNlc3RvciwgJCwgY2xlYXJOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBhc3NlcnRSZXR1cm5zRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IEN1c3RvbU1lbnViYXJDb250cm9sIH0gZnJvbSAnLi4vdGl0bGViYXIvbWVudWJhckNvbnRyb2wuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBnZXRNZW51QmFyVmlzaWJpbGl0eSwgTWVudVNldHRpbmdzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgU2VwYXJhdG9yLCBTdWJtZW51QWN0aW9uLCB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IEhvdmVyUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgR2VzdHVyZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3RvdWNoLmpzJztcbmltcG9ydCB7IElQYW5lQ29tcG9zaXRlUGFydCB9IGZyb20gJy4uL3BhbmVDb21wb3NpdGVQYXJ0LmpzJztcbmltcG9ydCB7IElQYW5lQ29tcG9zaXRlQmFyT3B0aW9ucywgUGFuZUNvbXBvc2l0ZUJhciB9IGZyb20gJy4uL3BhbmVDb21wb3NpdGVCYXIuanMnO1xuaW1wb3J0IHsgR2xvYmFsQ29tcG9zaXRlQmFyIH0gZnJvbSAnLi4vZ2xvYmFsQ29tcG9zaXRlQmFyLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIE1lbnVSZWdpc3RyeSwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJc1Nlc3Npb25zV2luZG93Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IGdldENvbnRleHRNZW51QWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBWaWV3Q29udGFpbmVyTG9jYXRpb24sIFZpZXdDb250YWluZXJMb2NhdGlvblRvU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTd2l0Y2hDb21wb3NpdGVWaWV3QWN0aW9uIH0gZnJvbSAnLi4vY29tcG9zaXRlQmFyQWN0aW9ucy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBBY3Rpdml0eWJhclBhcnQgZXh0ZW5kcyBQYXJ0IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgQUNUSU9OX0hFSUdIVCA9IDQ4O1xuXHRzdGF0aWMgcmVhZG9ubHkgQ09NUEFDVF9BQ1RJT05fSEVJR0hUID0gMjg7XG5cblx0c3RhdGljIHJlYWRvbmx5IEFDVElWSVRZQkFSX1dJRFRIID0gNDg7XG5cdHN0YXRpYyByZWFkb25seSBDT01QQUNUX0FDVElWSVRZQkFSX1dJRFRIID0gMzY7XG5cblx0LyoqIE5hcnJvd2VyIGRpbWVuc2lvbnMgdXNlZCB3aGVuIHRoZSBmbG9hdGluZyBwYW5lbHMgKE1vZGVybiBVSSkgZXhwZXJpbWVudCBpcyBlbmFibGVkLiAqL1xuXHRzdGF0aWMgcmVhZG9ubHkgRkxPQVRJTkdfQUNUSU9OX0hFSUdIVCA9IDM2O1xuXHRzdGF0aWMgcmVhZG9ubHkgRkxPQVRJTkdfQUNUSVZJVFlCQVJfV0lEVEggPSAzNjtcblx0c3RhdGljIHJlYWRvbmx5IEZMT0FUSU5HX0NPTVBBQ1RfQUNUSVZJVFlCQVJfV0lEVEggPSAyODtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUNPTl9TSVpFID0gMjQ7XG5cdHN0YXRpYyByZWFkb25seSBDT01QQUNUX0lDT05fU0laRSA9IDE2O1xuXG5cdC8qKlxuXHQgKiBCYXNlIGd1dHRlciByZXNlcnZlZCBhcm91bmQgdGhlIGFjdGl2aXR5IGJhciB1bmRlciB0aGUgZmxvYXRpbmcgcGFuZWxzXG5cdCAqIGV4cGVyaW1lbnQuIE11c3QgbWF0Y2ggdGhlIG1hcmdpbnMgYXBwbGllZCBpbiBgZmxvYXRpbmdQYW5lbHMuY3NzYC5cblx0ICovXG5cdHN0YXRpYyByZWFkb25seSBGTE9BVElOR19NQVJHSU4gPSBGTE9BVElOR19QQU5FTF9NQVJHSU47XG5cblx0c3RhdGljIHJlYWRvbmx5IHBpbm5lZFZpZXdDb250YWluZXJzS2V5ID0gJ3dvcmtiZW5jaC5hY3Rpdml0eS5waW5uZWRWaWV3bGV0czInO1xuXHRzdGF0aWMgcmVhZG9ubHkgcGxhY2Vob2xkZXJWaWV3Q29udGFpbmVyc0tleSA9ICd3b3JrYmVuY2guYWN0aXZpdHkucGxhY2Vob2xkZXJWaWV3bGV0cyc7XG5cdHN0YXRpYyByZWFkb25seSB2aWV3Q29udGFpbmVyc1dvcmtzcGFjZVN0YXRlS2V5ID0gJ3dvcmtiZW5jaC5hY3Rpdml0eS52aWV3bGV0c1dvcmtzcGFjZVN0YXRlJztcblxuXHQvLyNyZWdpb24gSVZpZXdcblxuXHRnZXQgbWluaW11bVdpZHRoKCk6IG51bWJlciB7IHJldHVybiB0aGlzLmJhc2VXaWR0aCArIHRoaXMuZmxvYXRpbmdIb3Jpem9udGFsR3V0dGVyOyB9XG5cdGdldCBtYXhpbXVtV2lkdGgoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuYmFzZVdpZHRoICsgdGhpcy5mbG9hdGluZ0hvcml6b250YWxHdXR0ZXI7IH1cblx0cmVhZG9ubHkgbWluaW11bUhlaWdodDogbnVtYmVyID0gMDtcblx0cmVhZG9ubHkgbWF4aW11bUhlaWdodDogbnVtYmVyID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8qKiBUaGUgaW50cmluc2ljIGFjdGl2aXR5IGJhciB3aWR0aCAoZXhjbHVkZXMgYW55IGZsb2F0aW5nIGd1dHRlcikuICovXG5cdHByaXZhdGUgZ2V0IGJhc2VXaWR0aCgpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLmxheW91dFNlcnZpY2UuaXNGbG9hdGluZ1BhbmVsc0VuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2lzQ29tcGFjdCA/IEFjdGl2aXR5YmFyUGFydC5GTE9BVElOR19DT01QQUNUX0FDVElWSVRZQkFSX1dJRFRIIDogQWN0aXZpdHliYXJQYXJ0LkZMT0FUSU5HX0FDVElWSVRZQkFSX1dJRFRIO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5faXNDb21wYWN0ID8gQWN0aXZpdHliYXJQYXJ0LkNPTVBBQ1RfQUNUSVZJVFlCQVJfV0lEVEggOiBBY3Rpdml0eWJhclBhcnQuQUNUSVZJVFlCQVJfV0lEVEg7XG5cdH1cblxuXHQvKiogVGhlIGFjdGlvbiAoaXRlbSkgaGVpZ2h0IHRoYXQgZHJpdmVzIHZpc2libGUgaXRlbSBzaXppbmcgYW5kIHRoZSBjb21wb3NpdGUgYmFyIG92ZXJmbG93IHNpemUuICovXG5cdHByaXZhdGUgZ2V0IGFjdGlvbkhlaWdodCgpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLl9pc0NvbXBhY3QpIHtcblx0XHRcdHJldHVybiBBY3Rpdml0eWJhclBhcnQuQ09NUEFDVF9BQ1RJT05fSEVJR0hUO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5sYXlvdXRTZXJ2aWNlLmlzRmxvYXRpbmdQYW5lbHNFbmFibGVkKCkgPyBBY3Rpdml0eWJhclBhcnQuRkxPQVRJTkdfQUNUSU9OX0hFSUdIVCA6IEFjdGl2aXR5YmFyUGFydC5BQ1RJT05fSEVJR0hUO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgZmxvYXRpbmdIb3Jpem9udGFsR3V0dGVyKCk6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLmxheW91dFNlcnZpY2UuaXNGbG9hdGluZ1BhbmVsc0VuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIEFjdGl2aXR5YmFyUGFydC5GTE9BVElOR19NQVJHSU4gKiAyXG5cdFx0XHQrICh0aGlzLmxheW91dFNlcnZpY2UuZ2V0U2lkZUJhclBvc2l0aW9uKCkgPT09IFBvc2l0aW9uLlJJR0hUID8gRkxPQVRJTkdfUEFORUxfTUFSR0lOIDogMCk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IGNvbXBvc2l0ZUJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxQYW5lQ29tcG9zaXRlQmFyPigpKTtcblx0cHJpdmF0ZSBjb250ZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaXNDb21wYWN0OiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHBhbmVDb21wb3NpdGVQYXJ0OiBJUGFuZUNvbXBvc2l0ZVBhcnQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKFBhcnRzLkFDVElWSVRZQkFSX1BBUlQsIHsgaGFzVGl0bGU6IGZhbHNlIH0sIHRoZW1lU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxheW91dFNlcnZpY2UpO1xuXG5cdFx0dGhpcy5faXNDb21wYWN0ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfQ09NUEFDVCkgPz8gZmFsc2U7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9DT01QQUNUKSkge1xuXHRcdFx0XHR0aGlzLl9pc0NvbXBhY3QgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9DT01QQUNUKSA/PyBmYWxzZTtcblx0XHRcdFx0dGhpcy51cGRhdGVDb21wYWN0U3R5bGUoKTtcblx0XHRcdFx0dGhpcy5yZWNyZWF0ZUNvbXBvc2l0ZUJhcigpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHVuZGVmaW5lZCk7IC8vIFNpZ25hbCBncmlkIHRoYXQgc2l6ZSBjb25zdHJhaW50cyBjaGFuZ2VkXG5cdFx0XHR9XG5cblx0XHRcdC8vIEZsb2F0aW5nIHBhbmVscyBjaGFuZ2VzIHRoZSByZXNlcnZlZCBsZWZ0L2JvdHRvbSBndXR0ZXIgKGFuZCB0aGVyZWZvcmVcblx0XHRcdC8vIHRoZSBmaXhlZCBwYXJ0IHdpZHRoKTogc2lnbmFsIHRoZSBncmlkIHRoYXQgdGhlIHNpemUgY29uc3RyYWludCBjaGFuZ2VkLlxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTGF5b3V0U2V0dGluZ3MuTU9ERVJOX1VJKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUNvbXBhY3RTdHlsZSgpO1xuXHRcdFx0XHR0aGlzLnJlY3JlYXRlQ29tcG9zaXRlQmFyKCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvbXBhY3RTdHlsZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5lbGVtZW50KSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnY29tcGFjdCcsIHRoaXMuX2lzQ29tcGFjdCk7XG5cdFx0XHQvLyBNaXJyb3JlZCBvbiB0aGUgd29ya2JlbmNoIHJvb3QgZm9yIGZsb2F0aW5nUGFuZWxzLmNzc1xuXHRcdFx0dGhpcy5sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZpdHliYXItY29tcGFjdCcsIHRoaXMuX2lzQ29tcGFjdCk7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuc2V0UHJvcGVydHkoJy0tYWN0aXZpdHktYmFyLXdpZHRoJywgYCR7dGhpcy5iYXNlV2lkdGh9cHhgKTtcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1hY3Rpdml0eS1iYXItYWN0aW9uLWhlaWdodCcsIGAke3RoaXMuYWN0aW9uSGVpZ2h0fXB4YCk7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuc2V0UHJvcGVydHkoJy0tYWN0aXZpdHktYmFyLWljb24tc2l6ZScsIGAke3RoaXMuX2lzQ29tcGFjdCA/IEFjdGl2aXR5YmFyUGFydC5DT01QQUNUX0lDT05fU0laRSA6IEFjdGl2aXR5YmFyUGFydC5JQ09OX1NJWkV9cHhgKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlY3JlYXRlQ29tcG9zaXRlQmFyKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jb250ZW50IHx8ICF0aGlzLmNvbXBvc2l0ZUJhci52YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuY29tcG9zaXRlQmFyLmNsZWFyKCk7XG5cdFx0Y2xlYXJOb2RlKHRoaXMuY29udGVudCk7XG5cdFx0dGhpcy5jb21wb3NpdGVCYXIudmFsdWUgPSB0aGlzLmNyZWF0ZUNvbXBvc2l0ZUJhcigpO1xuXHRcdHRoaXMuY29tcG9zaXRlQmFyLnZhbHVlLmNyZWF0ZSh0aGlzLmNvbnRlbnQpO1xuXG5cdFx0aWYgKHRoaXMuZGltZW5zaW9uKSB7XG5cdFx0XHR0aGlzLmxheW91dCh0aGlzLmRpbWVuc2lvbi53aWR0aCwgdGhpcy5kaW1lbnNpb24uaGVpZ2h0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUNvbXBvc2l0ZUJhcigpOiBQYW5lQ29tcG9zaXRlQmFyIHtcblx0XHRjb25zdCBhY3Rpb25IZWlnaHQgPSB0aGlzLmFjdGlvbkhlaWdodDtcblx0XHRjb25zdCBpY29uU2l6ZSA9IHRoaXMuX2lzQ29tcGFjdCA/IEFjdGl2aXR5YmFyUGFydC5DT01QQUNUX0lDT05fU0laRSA6IEFjdGl2aXR5YmFyUGFydC5JQ09OX1NJWkU7XG5cblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBY3Rpdml0eUJhckNvbXBvc2l0ZUJhciwgdGhpcy5sb2NhdGlvbiwge1xuXHRcdFx0cGFydENvbnRhaW5lckNsYXNzOiAnYWN0aXZpdHliYXInLFxuXHRcdFx0cGlubmVkVmlld0NvbnRhaW5lcnNLZXk6IEFjdGl2aXR5YmFyUGFydC5waW5uZWRWaWV3Q29udGFpbmVyc0tleSxcblx0XHRcdHBsYWNlaG9sZGVyVmlld0NvbnRhaW5lcnNLZXk6IEFjdGl2aXR5YmFyUGFydC5wbGFjZWhvbGRlclZpZXdDb250YWluZXJzS2V5LFxuXHRcdFx0dmlld0NvbnRhaW5lcnNXb3Jrc3BhY2VTdGF0ZUtleTogQWN0aXZpdHliYXJQYXJ0LnZpZXdDb250YWluZXJzV29ya3NwYWNlU3RhdGVLZXksXG5cdFx0XHRvcmllbnRhdGlvbjogQWN0aW9uc09yaWVudGF0aW9uLlZFUlRJQ0FMLFxuXHRcdFx0aWNvbjogdHJ1ZSxcblx0XHRcdGljb25TaXplLFxuXHRcdFx0YWN0aXZpdHlIb3Zlck9wdGlvbnM6IHtcblx0XHRcdFx0cG9zaXRpb246ICgpID0+IHRoaXMubGF5b3V0U2VydmljZS5nZXRTaWRlQmFyUG9zaXRpb24oKSA9PT0gUG9zaXRpb24uTEVGVCA/IEhvdmVyUG9zaXRpb24uUklHSFQgOiBIb3ZlclBvc2l0aW9uLkxFRlQsXG5cdFx0XHR9LFxuXHRcdFx0cHJldmVudExvb3BOYXZpZ2F0aW9uOiB0cnVlLFxuXHRcdFx0cmVjb21wdXRlU2l6ZXM6IGZhbHNlLFxuXHRcdFx0ZmlsbEV4dHJhQ29udGV4dE1lbnVBY3Rpb25zOiAoYWN0aW9ucywgZT86IE1vdXNlRXZlbnQgfCBHZXN0dXJlRXZlbnQpID0+IHsgfSxcblx0XHRcdGNvbXBvc2l0ZVNpemU6IDUyLFxuXHRcdFx0Y29sb3JzOiAodGhlbWU6IElDb2xvclRoZW1lKSA9PiAoe1xuXHRcdFx0XHRhY3RpdmVGb3JlZ3JvdW5kQ29sb3I6IHRoZW1lLmdldENvbG9yKEFDVElWSVRZX0JBUl9GT1JFR1JPVU5EKSxcblx0XHRcdFx0aW5hY3RpdmVGb3JlZ3JvdW5kQ29sb3I6IHRoZW1lLmdldENvbG9yKEFDVElWSVRZX0JBUl9JTkFDVElWRV9GT1JFR1JPVU5EKSxcblx0XHRcdFx0YWN0aXZlQm9yZGVyQ29sb3I6IHRoZW1lLmdldENvbG9yKEFDVElWSVRZX0JBUl9BQ1RJVkVfQk9SREVSKSxcblx0XHRcdFx0YWN0aXZlQmFja2dyb3VuZDogdGhlbWUuZ2V0Q29sb3IoQUNUSVZJVFlfQkFSX0FDVElWRV9CQUNLR1JPVU5EKSxcblx0XHRcdFx0YmFkZ2VCYWNrZ3JvdW5kOiB0aGVtZS5nZXRDb2xvcihBQ1RJVklUWV9CQVJfQkFER0VfQkFDS0dST1VORCksXG5cdFx0XHRcdGJhZGdlRm9yZWdyb3VuZDogdGhlbWUuZ2V0Q29sb3IoQUNUSVZJVFlfQkFSX0JBREdFX0ZPUkVHUk9VTkQpLFxuXHRcdFx0XHRkcmFnQW5kRHJvcEJvcmRlcjogdGhlbWUuZ2V0Q29sb3IoQUNUSVZJVFlfQkFSX0RSQUdfQU5EX0RST1BfQk9SREVSKSxcblx0XHRcdFx0YWN0aXZlQmFja2dyb3VuZENvbG9yOiB1bmRlZmluZWQsIGluYWN0aXZlQmFja2dyb3VuZENvbG9yOiB1bmRlZmluZWQsIGFjdGl2ZUJvcmRlckJvdHRvbUNvbG9yOiB1bmRlZmluZWQsXG5cdFx0XHR9KSxcblx0XHRcdG92ZXJmbG93QWN0aW9uU2l6ZTogYWN0aW9uSGVpZ2h0LFxuXHRcdH0sIFBhcnRzLkFDVElWSVRZQkFSX1BBUlQsIHRoaXMucGFuZUNvbXBvc2l0ZVBhcnQsIHRydWUpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNyZWF0ZUNvbnRlbnRBcmVhKHBhcmVudDogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XG5cdFx0dGhpcy5lbGVtZW50ID0gcGFyZW50O1xuXHRcdHRoaXMuY29udGVudCA9IGFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJy5jb250ZW50JykpO1xuXG5cdFx0dGhpcy51cGRhdGVDb21wYWN0U3R5bGUoKTtcblxuXHRcdGlmICh0aGlzLmxheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLkFDVElWSVRZQkFSX1BBUlQpKSB7XG5cdFx0XHR0aGlzLnNob3coKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5jb250ZW50O1xuXHR9XG5cblx0Z2V0UGlubmVkUGFuZUNvbXBvc2l0ZUlkcygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuY29tcG9zaXRlQmFyLnZhbHVlPy5nZXRQaW5uZWRQYW5lQ29tcG9zaXRlSWRzKCkgPz8gW107XG5cdH1cblxuXHRnZXRWaXNpYmxlUGFuZUNvbXBvc2l0ZUlkcygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuY29tcG9zaXRlQmFyLnZhbHVlPy5nZXRWaXNpYmxlUGFuZUNvbXBvc2l0ZUlkcygpID8/IFtdO1xuXHR9XG5cblx0Z2V0UGFuZUNvbXBvc2l0ZUlkcygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuY29tcG9zaXRlQmFyLnZhbHVlPy5nZXRQYW5lQ29tcG9zaXRlSWRzKCkgPz8gW107XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLmNvbXBvc2l0ZUJhci52YWx1ZT8uZm9jdXMoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZVN0eWxlcygpOiB2b2lkIHtcblx0XHRzdXBlci51cGRhdGVTdHlsZXMoKTtcblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuZ2V0Q29udGFpbmVyKCkpO1xuXHRcdGNvbnN0IGJhY2tncm91bmQgPSB0aGlzLmdldENvbG9yKEFDVElWSVRZX0JBUl9CQUNLR1JPVU5EKSB8fCAnJztcblx0XHRjb250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gYmFja2dyb3VuZDtcblxuXHRcdGNvbnN0IGJvcmRlckNvbG9yID0gdGhpcy5nZXRDb2xvcihBQ1RJVklUWV9CQVJfQk9SREVSKSB8fCB0aGlzLmdldENvbG9yKGNvbnRyYXN0Qm9yZGVyKSB8fCAnJztcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnYm9yZGVyZWQnLCAhIWJvcmRlckNvbG9yKTtcblx0XHRjb250YWluZXIuc3R5bGUuYm9yZGVyQ29sb3IgPSBib3JkZXJDb2xvciA/IGJvcmRlckNvbG9yIDogJyc7XG5cdH1cblxuXHRzaG93KGZvY3VzPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jb250ZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmNvbXBvc2l0ZUJhci52YWx1ZSkge1xuXHRcdFx0dGhpcy5jb21wb3NpdGVCYXIudmFsdWUgPSB0aGlzLmNyZWF0ZUNvbXBvc2l0ZUJhcigpO1xuXHRcdFx0dGhpcy5jb21wb3NpdGVCYXIudmFsdWUuY3JlYXRlKHRoaXMuY29udGVudCk7XG5cblx0XHRcdGlmICh0aGlzLmRpbWVuc2lvbikge1xuXHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLmRpbWVuc2lvbi53aWR0aCwgdGhpcy5kaW1lbnNpb24uaGVpZ2h0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZm9jdXMpIHtcblx0XHRcdHRoaXMuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRoaWRlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jb21wb3NpdGVCYXIudmFsdWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmNvbXBvc2l0ZUJhci5jbGVhcigpO1xuXG5cdFx0aWYgKHRoaXMuY29udGVudCkge1xuXHRcdFx0Y2xlYXJOb2RlKHRoaXMuY29udGVudCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgbGF5b3V0KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG5cdFx0c3VwZXIubGF5b3V0KHdpZHRoLCBoZWlnaHQsIDAsIDApO1xuXG5cdFx0aWYgKCF0aGlzLmNvbnRlbnQpIHtcblx0XHRcdHJldHVybjsgLy8gbm90IGNyZWF0ZWQgeWV0XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyB0b3AsIGJvdHRvbSB9ID0gdGhpcy5nZXRGbG9hdGluZ0d1dHRlcnMoKTtcblx0XHRjb25zdCBjb250ZW50V2lkdGggPSBNYXRoLm1heCgwLCB3aWR0aCAtIHRoaXMuZmxvYXRpbmdIb3Jpem9udGFsR3V0dGVyKTtcblx0XHRjb25zdCBjb250ZW50SGVpZ2h0ID0gTWF0aC5tYXgoMCwgaGVpZ2h0IC0gdG9wIC0gYm90dG9tKTtcblxuXHRcdC8vIExheW91dCBjb250ZW50c1xuXHRcdGNvbnN0IGNvbnRlbnRBcmVhU2l6ZSA9IHN1cGVyLmxheW91dENvbnRlbnRzKGNvbnRlbnRXaWR0aCwgY29udGVudEhlaWdodCkuY29udGVudFNpemU7XG5cblx0XHQvLyBMYXlvdXQgY29tcG9zaXRlIGJhclxuXHRcdHRoaXMuY29tcG9zaXRlQmFyLnZhbHVlPy5sYXlvdXQoY29udGVudFdpZHRoLCBjb250ZW50QXJlYVNpemUuaGVpZ2h0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBWZXJ0aWNhbCBndXR0ZXJzIChpbiBwaXhlbHMpIG1pcnJvcmluZyB0aGUgbWFyZ2lucyBpbiBgZmxvYXRpbmdQYW5lbHMuY3NzYC5cblx0ICogVGhlIHRvcCBpcyBmbHVzaCB3aXRoIHRpdGxlL2Jhbm5lciBjaHJvbWUgYW5kIGRvdWJsZXMgb25seSBhdCBhbiBleHBvc2VkIHdpbmRvdyBlZGdlLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXRGbG9hdGluZ0d1dHRlcnMoKTogeyB0b3A6IG51bWJlcjsgYm90dG9tOiBudW1iZXIgfSB7XG5cdFx0aWYgKCF0aGlzLmxheW91dFNlcnZpY2UuaXNGbG9hdGluZ1BhbmVsc0VuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuIHsgdG9wOiAwLCBib3R0b206IDAgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0dG9wOiBpc0Zsb2F0aW5nVG9wRWRnZUV4cG9zZWQodGhpcy5sYXlvdXRTZXJ2aWNlLCBtYWluV2luZG93KSA/IEZMT0FUSU5HX1BBTkVMX01BUkdJTiAqIDIgOiBGTE9BVElOR19QQU5FTF9JTk5FUl9NQVJHSU4sXG5cdFx0XHRib3R0b206IHRoaXMubGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuU1RBVFVTQkFSX1BBUlQsIG1haW5XaW5kb3cpID8gRkxPQVRJTkdfUEFORUxfTUFSR0lOIDogRkxPQVRJTkdfUEFORUxfTUFSR0lOICogMlxuXHRcdH07XG5cdH1cblxuXHR0b0pTT04oKTogb2JqZWN0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogUGFydHMuQUNUSVZJVFlCQVJfUEFSVFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEFjdGl2aXR5QmFyQ29tcG9zaXRlQmFyIGV4dGVuZHMgUGFuZUNvbXBvc2l0ZUJhciB7XG5cblx0cHJpdmF0ZSBlbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG1lbnVCYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q3VzdG9tTWVudWJhckNvbnRyb2w+KCkpO1xuXHRwcml2YXRlIG1lbnVCYXJDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNvbXBvc2l0ZUJhckNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZ2xvYmFsQ29tcG9zaXRlQmFyOiBHbG9iYWxDb21wb3NpdGVCYXIgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBrZXlib2FyZE5hdmlnYXRpb25EaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbixcblx0XHRvcHRpb25zOiBJUGFuZUNvbXBvc2l0ZUJhck9wdGlvbnMsXG5cdFx0cGFydDogUGFydHMsXG5cdFx0cGFuZUNvbXBvc2l0ZVBhcnQ6IElQYW5lQ29tcG9zaXRlUGFydCxcblx0XHRzaG93R2xvYmFsQWN0aXZpdGllczogYm9vbGVhbixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElWaWV3c1NlcnZpY2Ugdmlld1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGxvY2F0aW9uLFxuXHRcdFx0e1xuXHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHRmaWxsRXh0cmFDb250ZXh0TWVudUFjdGlvbnM6IChhY3Rpb25zLCBlKSA9PiB7XG5cdFx0XHRcdFx0b3B0aW9ucy5maWxsRXh0cmFDb250ZXh0TWVudUFjdGlvbnMoYWN0aW9ucywgZSk7XG5cdFx0XHRcdFx0dGhpcy5maWxsQ29udGV4dE1lbnVBY3Rpb25zKGFjdGlvbnMsIGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCBwYXJ0LCBwYW5lQ29tcG9zaXRlUGFydCwgaW5zdGFudGlhdGlvblNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBleHRlbnNpb25TZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UsIHZpZXdTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCBsYXlvdXRTZXJ2aWNlKTtcblxuXHRcdGlmIChzaG93R2xvYmFsQWN0aXZpdGllcykge1xuXHRcdFx0dGhpcy5nbG9iYWxDb21wb3NpdGVCYXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShHbG9iYWxDb21wb3NpdGVCYXIsICgpID0+IHRoaXMuZ2V0Q29udGV4dE1lbnVBY3Rpb25zKCksICh0aGVtZTogSUNvbG9yVGhlbWUpID0+IHRoaXMub3B0aW9ucy5jb2xvcnModGhlbWUpLCB0aGlzLm9wdGlvbnMuYWN0aXZpdHlIb3Zlck9wdGlvbnMpKTtcblx0XHR9XG5cblx0XHQvLyBSZWdpc3RlciBmb3IgY29uZmlndXJhdGlvbiBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihNZW51U2V0dGluZ3MuTWVudUJhclZpc2liaWxpdHkpKSB7XG5cdFx0XHRcdGlmIChnZXRNZW51QmFyVmlzaWJpbGl0eSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKSA9PT0gJ2NvbXBhY3QnKSB7XG5cdFx0XHRcdFx0dGhpcy5pbnN0YWxsTWVudWJhcigpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMudW5pbnN0YWxsTWVudWJhcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaWxsQ29udGV4dE1lbnVBY3Rpb25zKGFjdGlvbnM6IElBY3Rpb25bXSwgZT86IE1vdXNlRXZlbnQgfCBHZXN0dXJlRXZlbnQpIHtcblx0XHQvLyBNZW51XG5cdFx0Y29uc3QgbWVudUJhclZpc2liaWxpdHkgPSBnZXRNZW51QmFyVmlzaWJpbGl0eSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRpZiAobWVudUJhclZpc2liaWxpdHkgPT09ICdjb21wYWN0JyB8fCBtZW51QmFyVmlzaWJpbGl0eSA9PT0gJ2hpZGRlbicgfHwgbWVudUJhclZpc2liaWxpdHkgPT09ICd0b2dnbGUnKSB7XG5cdFx0XHRhY3Rpb25zLnVuc2hpZnQoLi4uW3RvQWN0aW9uKHsgaWQ6ICd0b2dnbGVNZW51VmlzaWJpbGl0eScsIGxhYmVsOiBsb2NhbGl6ZSgnbWVudScsIFwiTWVudVwiKSwgY2hlY2tlZDogbWVudUJhclZpc2liaWxpdHkgPT09ICdjb21wYWN0JywgcnVuOiAoKSA9PiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKE1lbnVTZXR0aW5ncy5NZW51QmFyVmlzaWJpbGl0eSwgbWVudUJhclZpc2liaWxpdHkgPT09ICdjb21wYWN0JyA/ICd0b2dnbGUnIDogJ2NvbXBhY3QnKSB9KSwgbmV3IFNlcGFyYXRvcigpXSk7XG5cdFx0fVxuXG5cdFx0aWYgKG1lbnVCYXJWaXNpYmlsaXR5ID09PSAnY29tcGFjdCcgJiYgdGhpcy5tZW51QmFyQ29udGFpbmVyICYmIGU/LnRhcmdldCkge1xuXHRcdFx0aWYgKGlzQW5jZXN0b3IoZS50YXJnZXQgYXMgTm9kZSwgdGhpcy5tZW51QmFyQ29udGFpbmVyKSkge1xuXHRcdFx0XHRhY3Rpb25zLnVuc2hpZnQoLi4uW3RvQWN0aW9uKHsgaWQ6ICdoaWRlQ29tcGFjdE1lbnUnLCBsYWJlbDogbG9jYWxpemUoJ2hpZGVNZW51JywgXCJIaWRlIE1lbnVcIiksIHJ1bjogKCkgPT4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShNZW51U2V0dGluZ3MuTWVudUJhclZpc2liaWxpdHksICd0b2dnbGUnKSB9KSwgbmV3IFNlcGFyYXRvcigpXSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gR2xvYmFsIENvbXBvc2l0ZSBCYXJcblx0XHRpZiAodGhpcy5nbG9iYWxDb21wb3NpdGVCYXIpIHtcblx0XHRcdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdFx0YWN0aW9ucy5wdXNoKC4uLnRoaXMuZ2xvYmFsQ29tcG9zaXRlQmFyLmdldENvbnRleHRNZW51QWN0aW9ucygpKTtcblx0XHR9XG5cdFx0YWN0aW9ucy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0YWN0aW9ucy5wdXNoKC4uLnRoaXMuZ2V0QWN0aXZpdHlCYXJDb250ZXh0TWVudUFjdGlvbnMoKSk7XG5cdH1cblxuXHRwcml2YXRlIHVuaW5zdGFsbE1lbnViYXIoKSB7XG5cdFx0aWYgKHRoaXMubWVudUJhci52YWx1ZSkge1xuXHRcdFx0dGhpcy5tZW51QmFyLnZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLm1lbnVCYXJDb250YWluZXIpIHtcblx0XHRcdHRoaXMubWVudUJhckNvbnRhaW5lci5yZW1vdmUoKTtcblx0XHRcdHRoaXMubWVudUJhckNvbnRhaW5lciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGluc3RhbGxNZW51YmFyKCkge1xuXHRcdGlmICh0aGlzLm1lbnVCYXIudmFsdWUpIHtcblx0XHRcdHJldHVybjsgLy8gcHJldmVudCBtZW51IGJhciBmcm9tIGluc3RhbGxpbmcgdHdpY2UgIzExMDcyMFxuXHRcdH1cblxuXHRcdHRoaXMubWVudUJhckNvbnRhaW5lciA9ICQoJy5tZW51YmFyJyk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5lbGVtZW50KTtcblx0XHRjb250ZW50LnByZXBlbmQodGhpcy5tZW51QmFyQ29udGFpbmVyKTtcblxuXHRcdC8vIE1lbnViYXI6IGluc3RhbGwgYSBjdXN0b20gbWVudSBiYXIgZGVwZW5kaW5nIG9uIGNvbmZpZ3VyYXRpb25cblx0XHR0aGlzLm1lbnVCYXIudmFsdWUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEN1c3RvbU1lbnViYXJDb250cm9sKTtcblx0XHR0aGlzLm1lbnVCYXIudmFsdWUuY3JlYXRlKHRoaXMubWVudUJhckNvbnRhaW5lcik7XG5cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJLZXlib2FyZE5hdmlnYXRpb25MaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5rZXlib2FyZE5hdmlnYXRpb25EaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Ly8gVXAvRG93biBvciBMZWZ0L1JpZ2h0IGFycm93IG9uIGNvbXBhY3QgbWVudVxuXHRcdGlmICh0aGlzLm1lbnVCYXJDb250YWluZXIpIHtcblx0XHRcdHRoaXMua2V5Ym9hcmROYXZpZ2F0aW9uRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLm1lbnVCYXJDb250YWluZXIsIEV2ZW50VHlwZS5LRVlfRE9XTiwgZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGtiRXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0XHRpZiAoa2JFdmVudC5lcXVhbHMoS2V5Q29kZS5Eb3duQXJyb3cpIHx8IGtiRXZlbnQuZXF1YWxzKEtleUNvZGUuUmlnaHRBcnJvdykpIHtcblx0XHRcdFx0XHR0aGlzLmZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBVcC9Eb3duIG9uIEFjdGl2aXR5IEljb25zXG5cdFx0aWYgKHRoaXMuY29tcG9zaXRlQmFyQ29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLmtleWJvYXJkTmF2aWdhdGlvbkRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5jb21wb3NpdGVCYXJDb250YWluZXIsIEV2ZW50VHlwZS5LRVlfRE9XTiwgZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGtiRXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0XHRpZiAoa2JFdmVudC5lcXVhbHMoS2V5Q29kZS5Eb3duQXJyb3cpIHx8IGtiRXZlbnQuZXF1YWxzKEtleUNvZGUuUmlnaHRBcnJvdykpIHtcblx0XHRcdFx0XHR0aGlzLmdsb2JhbENvbXBvc2l0ZUJhcj8uZm9jdXMoKTtcblx0XHRcdFx0fSBlbHNlIGlmIChrYkV2ZW50LmVxdWFscyhLZXlDb2RlLlVwQXJyb3cpIHx8IGtiRXZlbnQuZXF1YWxzKEtleUNvZGUuTGVmdEFycm93KSkge1xuXHRcdFx0XHRcdHRoaXMubWVudUJhci52YWx1ZT8udG9nZ2xlRm9jdXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIFVwIGFycm93IG9uIGdsb2JhbCBpY29uc1xuXHRcdGlmICh0aGlzLmdsb2JhbENvbXBvc2l0ZUJhcikge1xuXHRcdFx0dGhpcy5rZXlib2FyZE5hdmlnYXRpb25EaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZ2xvYmFsQ29tcG9zaXRlQmFyLmVsZW1lbnQsIEV2ZW50VHlwZS5LRVlfRE9XTiwgZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGtiRXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0XHRpZiAoa2JFdmVudC5lcXVhbHMoS2V5Q29kZS5VcEFycm93KSB8fCBrYkV2ZW50LmVxdWFscyhLZXlDb2RlLkxlZnRBcnJvdykpIHtcblx0XHRcdFx0XHR0aGlzLmZvY3VzKHRoaXMuZ2V0VmlzaWJsZVBhbmVDb21wb3NpdGVJZHMoKS5sZW5ndGggLSAxKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGNyZWF0ZShwYXJlbnQ6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQge1xuXHRcdHRoaXMuZWxlbWVudCA9IHBhcmVudDtcblxuXHRcdC8vIEluc3RhbGwgbWVudWJhciBpZiBjb21wYWN0XG5cdFx0aWYgKGdldE1lbnVCYXJWaXNpYmlsaXR5KHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpID09PSAnY29tcGFjdCcpIHtcblx0XHRcdHRoaXMuaW5zdGFsbE1lbnViYXIoKTtcblx0XHR9XG5cblx0XHQvLyBWaWV3IENvbnRhaW5lcnMgYWN0aW9uIGJhclxuXHRcdHRoaXMuY29tcG9zaXRlQmFyQ29udGFpbmVyID0gc3VwZXIuY3JlYXRlKHRoaXMuZWxlbWVudCk7XG5cblx0XHQvLyBHbG9iYWwgYWN0aW9uIGJhclxuXHRcdGlmICh0aGlzLmdsb2JhbENvbXBvc2l0ZUJhcikge1xuXHRcdFx0dGhpcy5nbG9iYWxDb21wb3NpdGVCYXIuY3JlYXRlKHRoaXMuZWxlbWVudCk7XG5cdFx0fVxuXG5cdFx0Ly8gS2V5Ym9hcmQgTmF2aWdhdGlvblxuXHRcdHRoaXMucmVnaXN0ZXJLZXlib2FyZE5hdmlnYXRpb25MaXN0ZW5lcnMoKTtcblxuXHRcdHJldHVybiB0aGlzLmNvbXBvc2l0ZUJhckNvbnRhaW5lcjtcblx0fVxuXG5cdG92ZXJyaWRlIGxheW91dCh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLm1lbnVCYXJDb250YWluZXIpIHtcblx0XHRcdGlmICh0aGlzLm9wdGlvbnMub3JpZW50YXRpb24gPT09IEFjdGlvbnNPcmllbnRhdGlvbi5WRVJUSUNBTCkge1xuXHRcdFx0XHRoZWlnaHQgLT0gdGhpcy5tZW51QmFyQ29udGFpbmVyLmNsaWVudEhlaWdodDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHdpZHRoIC09IHRoaXMubWVudUJhckNvbnRhaW5lci5jbGllbnRXaWR0aDtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRoaXMuZ2xvYmFsQ29tcG9zaXRlQmFyKSB7XG5cdFx0XHRpZiAodGhpcy5vcHRpb25zLm9yaWVudGF0aW9uID09PSBBY3Rpb25zT3JpZW50YXRpb24uVkVSVElDQUwpIHtcblx0XHRcdFx0aGVpZ2h0IC09ICh0aGlzLmdsb2JhbENvbXBvc2l0ZUJhci5zaXplKCkgKiB0aGlzLm9wdGlvbnMub3ZlcmZsb3dBY3Rpb25TaXplKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHdpZHRoIC09IHRoaXMuZ2xvYmFsQ29tcG9zaXRlQmFyLmVsZW1lbnQuY2xpZW50V2lkdGg7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHN1cGVyLmxheW91dCh3aWR0aCwgaGVpZ2h0KTtcblx0fVxuXG5cdGdldEFjdGl2aXR5QmFyQ29udGV4dE1lbnVBY3Rpb25zKCk6IElBY3Rpb25bXSB7XG5cdFx0Y29uc3QgYWN0aXZpdHlCYXJQb3NpdGlvbk1lbnUgPSB0aGlzLm1lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKE1lbnVJZC5BY3Rpdml0eUJhclBvc2l0aW9uTWVudSwgdGhpcy5jb250ZXh0S2V5U2VydmljZSwgeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSwgcmVuZGVyU2hvcnRUaXRsZTogdHJ1ZSB9KTtcblx0XHRjb25zdCBwb3NpdGlvbkFjdGlvbnMgPSBnZXRDb250ZXh0TWVudUFjdGlvbnMoYWN0aXZpdHlCYXJQb3NpdGlvbk1lbnUpLnNlY29uZGFyeTtcblx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXG5cdFx0XHRuZXcgU3VibWVudUFjdGlvbignd29ya2JlbmNoLmFjdGlvbi5hY3Rpdml0eUJhci5wb3NpdGlvbicsIGxvY2FsaXplKCdhY3Rpdml0eSBiYXIgcG9zaXRpb24nLCBcIkFjdGl2aXR5IEJhciBQb3NpdGlvblwiKSwgcG9zaXRpb25BY3Rpb25zKSxcblx0XHRdO1xuXG5cdFx0Ly8gU2hvdyBzaXplIHN1Ym1lbnUgb25seSB3aGVuIGFjdGl2aXR5IGJhciBpcyBpbiBkZWZhdWx0IHBvc2l0aW9uXG5cdFx0Y29uc3QgYWN0aXZpdHlCYXJQb3NpdGlvbiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT04pO1xuXHRcdGlmIChhY3Rpdml0eUJhclBvc2l0aW9uID09PSBBY3Rpdml0eUJhclBvc2l0aW9uLkRFRkFVTFQpIHtcblx0XHRcdGNvbnN0IGlzQ29tcGFjdCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0NPTVBBQ1QpID8/IGZhbHNlO1xuXHRcdFx0Y29uc3Qgc2l6ZUFjdGlvbnMgPSBbXG5cdFx0XHRcdHRvQWN0aW9uKHsgaWQ6ICd3b3JrYmVuY2guYWN0aW9uLmFjdGl2aXR5QmFyLnNpemUuZGVmYXVsdCcsIGxhYmVsOiBsb2NhbGl6ZSgnYWN0aXZpdHlCYXJTaXplRGVmYXVsdCcsIFwiRGVmYXVsdFwiKSwgY2hlY2tlZDogIWlzQ29tcGFjdCwgcnVuOiAoKSA9PiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9DT01QQUNULCBmYWxzZSkgfSksXG5cdFx0XHRcdHRvQWN0aW9uKHsgaWQ6ICd3b3JrYmVuY2guYWN0aW9uLmFjdGl2aXR5QmFyLnNpemUuY29tcGFjdCcsIGxhYmVsOiBsb2NhbGl6ZSgnYWN0aXZpdHlCYXJTaXplQ29tcGFjdCcsIFwiQ29tcGFjdFwiKSwgY2hlY2tlZDogaXNDb21wYWN0LCBydW46ICgpID0+IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoTGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0NPTVBBQ1QsIHRydWUpIH0pLFxuXHRcdFx0XTtcblx0XHRcdGFjdGlvbnMucHVzaChuZXcgU3VibWVudUFjdGlvbignd29ya2JlbmNoLmFjdGlvbi5hY3Rpdml0eUJhci5zaXplJywgbG9jYWxpemUoJ2FjdGl2aXR5IGJhciBzaXplJywgXCJBY3Rpdml0eSBCYXIgU2l6ZVwiKSwgc2l6ZUFjdGlvbnMpKTtcblx0XHR9XG5cblx0XHRhY3Rpb25zLnB1c2godG9BY3Rpb24oeyBpZDogVG9nZ2xlU2lkZWJhclBvc2l0aW9uQWN0aW9uLklELCBsYWJlbDogVG9nZ2xlU2lkZWJhclBvc2l0aW9uQWN0aW9uLmdldExhYmVsKHRoaXMubGF5b3V0U2VydmljZSksIHJ1bjogKCkgPT4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBuZXcgVG9nZ2xlU2lkZWJhclBvc2l0aW9uQWN0aW9uKCkucnVuKGFjY2Vzc29yKSkgfSkpO1xuXG5cdFx0aWYgKHRoaXMucGFydCA9PT0gUGFydHMuU0lERUJBUl9QQVJUKSB7XG5cdFx0XHRhY3Rpb25zLnB1c2godG9BY3Rpb24oeyBpZDogVG9nZ2xlU2lkZWJhclZpc2liaWxpdHlBY3Rpb24uSUQsIGxhYmVsOiBUb2dnbGVTaWRlYmFyVmlzaWJpbGl0eUFjdGlvbi5MQUJFTCwgcnVuOiAoKSA9PiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IG5ldyBUb2dnbGVTaWRlYmFyVmlzaWJpbGl0eUFjdGlvbigpLnJ1bihhY2Nlc3NvcikpIH0pKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gYWN0aW9ucztcblx0fVxuXG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uYWN0aXZpdHlCYXJMb2NhdGlvbi5kZWZhdWx0Jyxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLmxvY2FsaXplMigncG9zaXRpb25BY3Rpdml0eUJhckRlZmF1bHQnLCAnTW92ZSBBY3Rpdml0eSBCYXIgdG8gU2lkZScpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pRGVmYXVsdEFjdGl2aXR5QmFyJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmRGVmYXVsdFwiKSxcblx0XHRcdH0sXG5cdFx0XHRzaG9ydFRpdGxlOiBsb2NhbGl6ZSgnZGVmYXVsdCcsIFwiRGVmYXVsdFwiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHR0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke0xheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9MT0NBVElPTn1gLCBBY3Rpdml0eUJhclBvc2l0aW9uLkRFRkFVTFQpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5BY3Rpdml0eUJhclBvc2l0aW9uTWVudSxcblx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLm5vdEVxdWFscyhgY29uZmlnLiR7TGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0xPQ0FUSU9OfWAsIEFjdGl2aXR5QmFyUG9zaXRpb24uREVGQVVMVCksIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT04sIEFjdGl2aXR5QmFyUG9zaXRpb24uREVGQVVMVCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmFjdGl2aXR5QmFyTG9jYXRpb24udG9wJyxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLmxvY2FsaXplMigncG9zaXRpb25BY3Rpdml0eUJhclRvcCcsICdNb3ZlIEFjdGl2aXR5IEJhciB0byBUb3AnKSxcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVRvcEFjdGl2aXR5QmFyJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmVG9wXCIpLFxuXHRcdFx0fSxcblx0XHRcdHNob3J0VGl0bGU6IGxvY2FsaXplKCd0b3AnLCBcIlRvcFwiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHR0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke0xheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9MT0NBVElPTn1gLCBBY3Rpdml0eUJhclBvc2l0aW9uLlRPUCksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkFjdGl2aXR5QmFyUG9zaXRpb25NZW51LFxuXHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIubm90RXF1YWxzKGBjb25maWcuJHtMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT059YCwgQWN0aXZpdHlCYXJQb3NpdGlvbi5UT1ApLCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoTGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0xPQ0FUSU9OLCBBY3Rpdml0eUJhclBvc2l0aW9uLlRPUCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmFjdGl2aXR5QmFyTG9jYXRpb24uYm90dG9tJyxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLmxvY2FsaXplMigncG9zaXRpb25BY3Rpdml0eUJhckJvdHRvbScsICdNb3ZlIEFjdGl2aXR5IEJhciB0byBCb3R0b20nKSxcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaUJvdHRvbUFjdGl2aXR5QmFyJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmQm90dG9tXCIpLFxuXHRcdFx0fSxcblx0XHRcdHNob3J0VGl0bGU6IGxvY2FsaXplKCdib3R0b20nLCBcIkJvdHRvbVwiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHR0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke0xheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9MT0NBVElPTn1gLCBBY3Rpdml0eUJhclBvc2l0aW9uLkJPVFRPTSksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkFjdGl2aXR5QmFyUG9zaXRpb25NZW51LFxuXHRcdFx0XHRvcmRlcjogM1xuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIubm90RXF1YWxzKGBjb25maWcuJHtMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT059YCwgQWN0aXZpdHlCYXJQb3NpdGlvbi5CT1RUT00pLCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoTGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0xPQ0FUSU9OLCBBY3Rpdml0eUJhclBvc2l0aW9uLkJPVFRPTSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmFjdGl2aXR5QmFyTG9jYXRpb24uaGlkZScsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5sb2NhbGl6ZTIoJ2hpZGVBY3Rpdml0eUJhcicsICdIaWRlIEFjdGl2aXR5IEJhcicpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pSGlkZUFjdGl2aXR5QmFyJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmSGlkZGVuXCIpLFxuXHRcdFx0fSxcblx0XHRcdHNob3J0VGl0bGU6IGxvY2FsaXplKCdoaWRlJywgXCJIaWRkZW5cIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0dG9nZ2xlZDogQ29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT059YCwgQWN0aXZpdHlCYXJQb3NpdGlvbi5ISURERU4pLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5BY3Rpdml0eUJhclBvc2l0aW9uTWVudSxcblx0XHRcdFx0b3JkZXI6IDRcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLm5vdEVxdWFscyhgY29uZmlnLiR7TGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0xPQ0FUSU9OfWAsIEFjdGl2aXR5QmFyUG9zaXRpb24uSElEREVOKSwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCkpLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9MT0NBVElPTiwgQWN0aXZpdHlCYXJQb3NpdGlvbi5ISURERU4pO1xuXHR9XG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyQXBwZWFyYW5jZU1lbnUsIHtcblx0c3VibWVudTogTWVudUlkLkFjdGl2aXR5QmFyUG9zaXRpb25NZW51LFxuXHR0aXRsZTogbG9jYWxpemUoJ3Bvc2l0aW9uQWN0aXZpdHVCYXInLCBcIkFjdGl2aXR5IEJhciBQb3NpdGlvblwiKSxcblx0Z3JvdXA6ICczX3dvcmtiZW5jaF9sYXlvdXRfbW92ZScsXG5cdG9yZGVyOiAyLFxuXHR3aGVuOiBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuVmlld0NvbnRhaW5lclRpdGxlQ29udGV4dCwge1xuXHRzdWJtZW51OiBNZW51SWQuQWN0aXZpdHlCYXJQb3NpdGlvbk1lbnUsXG5cdHRpdGxlOiBsb2NhbGl6ZSgncG9zaXRpb25BY3Rpdml0dUJhcicsIFwiQWN0aXZpdHkgQmFyIFBvc2l0aW9uXCIpLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihcblx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXdDb250YWluZXJMb2NhdGlvbicsIFZpZXdDb250YWluZXJMb2NhdGlvblRvU3RyaW5nKFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKSksXG5cdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3Q29udGFpbmVyTG9jYXRpb24nLCBWaWV3Q29udGFpbmVyTG9jYXRpb25Ub1N0cmluZyhWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyKSlcblx0KSxcblx0Z3JvdXA6ICczX3dvcmtiZW5jaF9sYXlvdXRfbW92ZScsXG5cdG9yZGVyOiAxXG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgU3dpdGNoQ29tcG9zaXRlVmlld0FjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5wcmV2aW91c1NpZGVCYXJWaWV3Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3ByZXZpb3VzU2lkZUJhclZpZXcnLCAnUHJldmlvdXMgUHJpbWFyeSBTaWRlIEJhciBWaWV3JyksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9LCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhciwgLTEpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgU3dpdGNoQ29tcG9zaXRlVmlld0FjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5uZXh0U2lkZUJhclZpZXcnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbmV4dFNpZGVCYXJWaWV3JywgJ05leHQgUHJpbWFyeSBTaWRlIEJhciBWaWV3JyksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9LCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhciwgMSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoXG5cdGNsYXNzIEZvY3VzQWN0aXZpdHlCYXJBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzQWN0aXZpdHlCYXInLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdmb2N1c0FjdGl2aXR5QmFyJywgJ0ZvY3VzIEFjdGl2aXR5IEJhcicpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0XHRmMTogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKTtcblx0XHRcdGxheW91dFNlcnZpY2UuZm9jdXNQYXJ0KFBhcnRzLkFDVElWSVRZQkFSX1BBUlQpO1xuXHRcdH1cblx0fSk7XG5cbnJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50KCh0aGVtZSwgY29sbGVjdG9yKSA9PiB7XG5cblx0Y29uc3QgYWN0aXZpdHlCYXJBY3RpdmVCb3JkZXJDb2xvciA9IHRoZW1lLmdldENvbG9yKEFDVElWSVRZX0JBUl9BQ1RJVkVfQk9SREVSKTtcblx0aWYgKGFjdGl2aXR5QmFyQWN0aXZlQm9yZGVyQ29sb3IpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAuYWN0aXZpdHliYXIgPiAuY29udGVudCA6bm90KC5tb25hY28tbWVudSkgPiAubW9uYWNvLWFjdGlvbi1iYXIgLmFjdGlvbi1pdGVtLmNoZWNrZWQgLmFjdGl2ZS1pdGVtLWluZGljYXRvcjpiZWZvcmUge1xuXHRcdFx0XHRib3JkZXItbGVmdC1jb2xvcjogJHthY3Rpdml0eUJhckFjdGl2ZUJvcmRlckNvbG9yfTtcblx0XHRcdH1cblx0XHRgKTtcblx0fVxuXG5cdGNvbnN0IGFjdGl2aXR5QmFyQWN0aXZlRm9jdXNCb3JkZXJDb2xvciA9IHRoZW1lLmdldENvbG9yKEFDVElWSVRZX0JBUl9BQ1RJVkVfRk9DVVNfQk9SREVSKTtcblx0aWYgKGFjdGl2aXR5QmFyQWN0aXZlRm9jdXNCb3JkZXJDb2xvcikge1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGBcblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5hY3Rpdml0eWJhciA+IC5jb250ZW50IDpub3QoLm1vbmFjby1tZW51KSA+IC5tb25hY28tYWN0aW9uLWJhciAuYWN0aW9uLWl0ZW0uY2hlY2tlZDpmb2N1czo6YmVmb3JlIHtcblx0XHRcdFx0dmlzaWJpbGl0eTogaGlkZGVuO1xuXHRcdFx0fVxuXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAuYWN0aXZpdHliYXIgPiAuY29udGVudCA6bm90KC5tb25hY28tbWVudSkgPiAubW9uYWNvLWFjdGlvbi1iYXIgLmFjdGlvbi1pdGVtLmNoZWNrZWQ6Zm9jdXMgLmFjdGl2ZS1pdGVtLWluZGljYXRvcjpiZWZvcmUge1xuXHRcdFx0XHR2aXNpYmlsaXR5OiB2aXNpYmxlO1xuXHRcdFx0XHRib3JkZXItbGVmdC1jb2xvcjogJHthY3Rpdml0eUJhckFjdGl2ZUZvY3VzQm9yZGVyQ29sb3J9O1xuXHRcdFx0fVxuXHRcdGApO1xuXHR9XG5cblx0Y29uc3QgYWN0aXZpdHlCYXJBY3RpdmVCYWNrZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihBQ1RJVklUWV9CQVJfQUNUSVZFX0JBQ0tHUk9VTkQpO1xuXHRpZiAoYWN0aXZpdHlCYXJBY3RpdmVCYWNrZ3JvdW5kQ29sb3IpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAuYWN0aXZpdHliYXIgPiAuY29udGVudCA6bm90KC5tb25hY28tbWVudSkgPiAubW9uYWNvLWFjdGlvbi1iYXIgLmFjdGlvbi1pdGVtLmNoZWNrZWQgLmFjdGl2ZS1pdGVtLWluZGljYXRvciB7XG5cdFx0XHRcdHotaW5kZXg6IDA7XG5cdFx0XHRcdGJhY2tncm91bmQtY29sb3I6ICR7YWN0aXZpdHlCYXJBY3RpdmVCYWNrZ3JvdW5kQ29sb3J9O1xuXHRcdFx0fVxuXHRcdGApO1xuXHR9XG5cblx0Ly8gU3R5bGluZyB3aXRoIE91dGxpbmUgY29sb3IgKGUuZy4gaGlnaCBjb250cmFzdCB0aGVtZSlcblx0Y29uc3Qgb3V0bGluZSA9IHRoZW1lLmdldENvbG9yKGFjdGl2ZUNvbnRyYXN0Qm9yZGVyKTtcblx0aWYgKG91dGxpbmUpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAuYWN0aXZpdHliYXIgPiAuY29udGVudCA6bm90KC5tb25hY28tbWVudSkgPiAubW9uYWNvLWFjdGlvbi1iYXIgLmFjdGlvbi1pdGVtIC5hY3Rpb24tbGFiZWw6OmJlZm9yZXtcblx0XHRcdFx0cGFkZGluZzogNnB4O1xuXHRcdFx0fVxuXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAuYWN0aXZpdHliYXIgPiAuY29udGVudCA6bm90KC5tb25hY28tbWVudSkgPiAubW9uYWNvLWFjdGlvbi1iYXIgLmFjdGlvbi1pdGVtLmFjdGl2ZSAuYWN0aW9uLWxhYmVsOjpiZWZvcmUsXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAuYWN0aXZpdHliYXIgPiAuY29udGVudCA6bm90KC5tb25hY28tbWVudSkgPiAubW9uYWNvLWFjdGlvbi1iYXIgLmFjdGlvbi1pdGVtLmFjdGl2ZTpob3ZlciAuYWN0aW9uLWxhYmVsOjpiZWZvcmUsXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAuYWN0aXZpdHliYXIgPiAuY29udGVudCA6bm90KC5tb25hY28tbWVudSkgPiAubW9uYWNvLWFjdGlvbi1iYXIgLmFjdGlvbi1pdGVtLmNoZWNrZWQgLmFjdGlvbi1sYWJlbDo6YmVmb3JlLFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLmFjdGl2aXR5YmFyID4gLmNvbnRlbnQgOm5vdCgubW9uYWNvLW1lbnUpID4gLm1vbmFjby1hY3Rpb24tYmFyIC5hY3Rpb24taXRlbS5jaGVja2VkOmhvdmVyIC5hY3Rpb24tbGFiZWw6OmJlZm9yZSB7XG5cdFx0XHRcdG91dGxpbmU6IDFweCBzb2xpZCAke291dGxpbmV9O1xuXHRcdFx0fVxuXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAuYWN0aXZpdHliYXIgPiAuY29udGVudCA6bm90KC5tb25hY28tbWVudSkgPiAubW9uYWNvLWFjdGlvbi1iYXIgLmFjdGlvbi1pdGVtOmhvdmVyIC5hY3Rpb24tbGFiZWw6OmJlZm9yZSB7XG5cdFx0XHRcdG91dGxpbmU6IDFweCBkYXNoZWQgJHtvdXRsaW5lfTtcblx0XHRcdH1cblxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLmFjdGl2aXR5YmFyID4gLmNvbnRlbnQgOm5vdCgubW9uYWNvLW1lbnUpID4gLm1vbmFjby1hY3Rpb24tYmFyIC5hY3Rpb24taXRlbTpmb2N1cyAuYWN0aXZlLWl0ZW0taW5kaWNhdG9yOmJlZm9yZSB7XG5cdFx0XHRcdGJvcmRlci1sZWZ0LWNvbG9yOiAke291dGxpbmV9O1xuXHRcdFx0fVxuXHRcdGApO1xuXHR9XG5cblx0Ly8gU3R5bGluZyB3aXRob3V0IG91dGxpbmUgY29sb3Jcblx0ZWxzZSB7XG5cdFx0Y29uc3QgZm9jdXNCb3JkZXJDb2xvciA9IHRoZW1lLmdldENvbG9yKGZvY3VzQm9yZGVyKTtcblx0XHRpZiAoZm9jdXNCb3JkZXJDb2xvcikge1xuXHRcdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYFxuXHRcdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAuYWN0aXZpdHliYXIgPiAuY29udGVudCA6bm90KC5tb25hY28tbWVudSkgPiAubW9uYWNvLWFjdGlvbi1iYXIgLmFjdGlvbi1pdGVtOmZvY3VzIC5hY3RpdmUtaXRlbS1pbmRpY2F0b3I6OmJlZm9yZSB7XG5cdFx0XHRcdFx0XHRib3JkZXItbGVmdC1jb2xvcjogJHtmb2N1c0JvcmRlckNvbG9yfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdGApO1xuXHRcdH1cblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxPQUFPO0FBQ1AsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLFlBQVk7QUFDckIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxxQkFBcUIseUJBQXlCLGdCQUFnQixPQUFPLFVBQVUsNkJBQTZCLHVCQUF1QixnQ0FBZ0M7QUFDNUssU0FBUyw2QkFB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
