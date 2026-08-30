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
import * as dom from "../../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { PixelRatio } from "../../../../base/browser/pixelRatio.js";
import { ActionBar, ActionsOrientation } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { Action } from "../../../../base/common/actions.js";
import * as arrays from "../../../../base/common/arrays.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import * as errors from "../../../../base/common/errors.js";
import { DisposableStore, markAsSingleton, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { Platform, platform } from "../../../../base/common/platform.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { DropdownWithPrimaryActionViewItem } from "../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js";
import { createActionViewItem, getFlatActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { widgetBorder } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService, Themable } from "../../../../platform/theme/common/themeService.js";
import { getTitleBarStyle, TitlebarStyle } from "../../../../platform/window/common/window.js";
import { EditorTabsMode, IWorkbenchLayoutService, LayoutSettings, Parts } from "../../../services/layout/browser/layoutService.js";
import { CONTEXT_DEBUG_STATE, CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_FOCUSED_SESSION_IS_NO_DEBUG, CONTEXT_IN_DEBUG_MODE, CONTEXT_MULTI_SESSION_DEBUG, CONTEXT_STEP_BACK_SUPPORTED, CONTEXT_SUSPEND_DEBUGGEE_SUPPORTED, CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED, IDebugService, State, VIEWLET_ID } from "../common/debug.js";
import { FocusSessionActionViewItem } from "./debugActionViewItems.js";
import { debugToolBarBackground, debugToolBarBorder } from "./debugColors.js";
import { CONTINUE_ID, CONTINUE_LABEL, DISCONNECT_AND_SUSPEND_ID, DISCONNECT_AND_SUSPEND_LABEL, DISCONNECT_ID, DISCONNECT_LABEL, FOCUS_SESSION_ID, FOCUS_SESSION_LABEL, PAUSE_ID, PAUSE_LABEL, RESTART_LABEL, RESTART_SESSION_ID, REVERSE_CONTINUE_ID, STEP_BACK_ID, STEP_INTO_ID, STEP_INTO_LABEL, STEP_OUT_ID, STEP_OUT_LABEL, STEP_OVER_ID, STEP_OVER_LABEL, STOP_ID, STOP_LABEL } from "./debugCommands.js";
import * as icons from "./debugIcons.js";
import "./media/debugToolBar.css";
const DEBUG_TOOLBAR_POSITION_KEY = "debug.actionswidgetposition";
const DEBUG_TOOLBAR_Y_KEY = "debug.actionswidgety";
let DebugToolBar = class extends Themable {
  constructor(notificationService, telemetryService, debugService, layoutService, storageService, configurationService, themeService, instantiationService, menuService, contextKeyService) {
    super(themeService);
    this.notificationService = notificationService;
    this.telemetryService = telemetryService;
    this.debugService = debugService;
    this.layoutService = layoutService;
    this.storageService = storageService;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.isVisible = false;
    this.isBuilt = false;
    this.stopActionViewItemDisposables = this._register(new DisposableStore());
    /** coordinate of the debug toolbar per aux window */
    this.auxWindowCoordinates = /* @__PURE__ */ new WeakMap();
    this.trackPixelRatioListener = this._register(new MutableDisposable());
    this.$el = dom.$("div.debug-toolbar");
    const controlsOnTitlebar = getTitleBarStyle(this.configurationService) === TitlebarStyle.CUSTOM;
    const controlsOnLeft = controlsOnTitlebar && platform === Platform.Mac;
    const controlsOnRight = controlsOnTitlebar && (platform === Platform.Windows || platform === Platform.Linux);
    this.$el.style.transform = `translate(
			min(
				max(${controlsOnLeft ? "60px" : "0px"}, calc(-50% + (100vw * var(--x-position)))),
				calc(100vw - 100% - ${controlsOnRight ? "100px" : "0px"})
			),
			var(--y-position)
		)`;
    this.dragArea = dom.append(this.$el, dom.$("div.drag-area" + ThemeIcon.asCSSSelector(icons.debugGripper)));
    const actionBarContainer = dom.append(this.$el, dom.$("div.action-bar-container"));
    this.debugToolBarMenu = menuService.createMenu(MenuId.DebugToolBar, contextKeyService);
    this._register(this.debugToolBarMenu);
    this.activeActions = [];
    this.actionBar = this._register(new ActionBar(actionBarContainer, {
      orientation: ActionsOrientation.HORIZONTAL,
      actionViewItemProvider: (action, options) => {
        if (action.id === FOCUS_SESSION_ID) {
          return this.instantiationService.createInstance(FocusSessionActionViewItem, action, void 0);
        } else if (action.id === STOP_ID || action.id === DISCONNECT_ID) {
          this.stopActionViewItemDisposables.clear();
          const item = this.instantiationService.invokeFunction((accessor) => createDisconnectMenuItemAction(action, this.stopActionViewItemDisposables, accessor, { hoverDelegate: options.hoverDelegate }));
          if (item) {
            return item;
          }
        }
        return createActionViewItem(this.instantiationService, action, options);
      }
    }));
    this.updateScheduler = this._register(new RunOnceScheduler(() => {
      const state = this.debugService.state;
      const toolBarLocation = this.configurationService.getValue("debug").toolBarLocation;
      if (state === State.Inactive || toolBarLocation !== "floating" || this.debugService.getModel().getSessions().every((s) => s.suppressDebugToolbar) || state === State.Initializing && this.debugService.initializingOptions?.suppressDebugToolbar) {
        return this.hide();
      }
      const actions = getFlatActionBarActions(this.debugToolBarMenu.getActions({ shouldForwardArgs: true }));
      if (!arrays.equals(actions, this.activeActions, (first, second) => first.id === second.id && first.enabled === second.enabled)) {
        this.actionBar.clear();
        this.actionBar.push(actions, { icon: true, label: false });
        this.activeActions = actions;
      }
      this.show();
    }, 20));
    this.updateStyles();
    this.registerListeners();
    this.hide();
  }
  registerListeners() {
    this._register(this.debugService.onDidChangeState(() => this.updateScheduler.schedule()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("debug.toolBarLocation")) {
        this.updateScheduler.schedule();
      }
      if (e.affectsConfiguration(LayoutSettings.EDITOR_TABS_MODE) || e.affectsConfiguration(LayoutSettings.COMMAND_CENTER)) {
        this._yRange = void 0;
        this.setCoordinates();
      }
    }));
    this._register(this.debugToolBarMenu.onDidChange(() => this.updateScheduler.schedule()));
    this._register(this.actionBar.actionRunner.onDidRun((e) => {
      if (e.error && !errors.isCancellationError(e.error)) {
        this.notificationService.warn(e.error);
      }
      this.telemetryService.publicLog2("workbenchActionExecuted", { id: e.action.id, from: "debugActionsWidget" });
    }));
    this._register(dom.addDisposableGenericMouseUpListener(this.dragArea, (event) => {
      const mouseClickEvent = new StandardMouseEvent(dom.getWindow(this.dragArea), event);
      if (mouseClickEvent.detail === 2) {
        this.setCoordinates(0.5, this.yDefault);
        this.storePosition();
      }
    }));
    this._register(dom.addDisposableGenericMouseDownListener(this.dragArea, (e) => {
      this.dragArea.classList.add("dragged");
      const activeWindow = dom.getWindow(this.layoutService.activeContainer);
      const originEvent = new StandardMouseEvent(activeWindow, e);
      const originX = this.computeCurrentXPercent();
      const originY = this.getCurrentYPosition();
      const mouseMoveListener = dom.addDisposableGenericMouseMoveListener(activeWindow, (e2) => {
        const mouseMoveEvent = new StandardMouseEvent(activeWindow, e2);
        mouseMoveEvent.preventDefault();
        this.setCoordinates(
          originX + (mouseMoveEvent.posx - originEvent.posx) / activeWindow.innerWidth,
          originY + mouseMoveEvent.posy - originEvent.posy
        );
      });
      const mouseUpListener = dom.addDisposableGenericMouseUpListener(activeWindow, (e2) => {
        this.storePosition();
        this.dragArea.classList.remove("dragged");
        mouseMoveListener.dispose();
        mouseUpListener.dispose();
      });
    }));
    this._register(this.layoutService.onDidChangePartVisibility(() => this.setCoordinates()));
    this._register(this.layoutService.onDidChangeActiveContainer(async () => {
      this._yRange = void 0;
      await this.layoutService.whenContainerStylesLoaded(dom.getWindow(this.layoutService.activeContainer));
      if (this.isBuilt) {
        this.doShowInActiveContainer();
        this.setCoordinates();
      }
    }));
  }
  /**
   * Computes the x percent position at which the toolbar is currently displayed.
   */
  computeCurrentXPercent() {
    const { left, width } = this.$el.getBoundingClientRect();
    return (left + width / 2) / dom.getWindow(this.$el).innerWidth;
  }
  /**
   * Gets the x position set in the style of the toolbar. This may not be its
   * actual position on screen depending on toolbar locations.
   */
  getCurrentXPercent() {
    return Number(this.$el.style.getPropertyValue("--x-position"));
  }
  /** Gets the y position set in the style of the toolbar */
  getCurrentYPosition() {
    return parseInt(this.$el.style.getPropertyValue("--y-position"));
  }
  storePosition() {
    const activeWindow = dom.getWindow(this.layoutService.activeContainer);
    const isMainWindow = this.layoutService.activeContainer === this.layoutService.mainContainer;
    const x = this.getCurrentXPercent();
    const y = this.getCurrentYPosition();
    if (isMainWindow) {
      this.storageService.store(DEBUG_TOOLBAR_POSITION_KEY, x, StorageScope.PROFILE, StorageTarget.MACHINE);
      this.storageService.store(DEBUG_TOOLBAR_Y_KEY, y, StorageScope.PROFILE, StorageTarget.MACHINE);
    } else {
      this.auxWindowCoordinates.set(activeWindow, { x, y });
    }
  }
  updateStyles() {
    super.updateStyles();
    if (this.$el) {
      this.$el.style.backgroundColor = this.getColor(debugToolBarBackground) || "";
      const contrastBorderColor = this.getColor(widgetBorder);
      const borderColor = this.getColor(debugToolBarBorder);
      if (contrastBorderColor) {
        this.$el.style.border = `1px solid ${contrastBorderColor}`;
      } else {
        this.$el.style.border = borderColor ? `solid ${borderColor}` : "none";
        this.$el.style.border = "1px 0";
      }
    }
  }
  /** Gets the stored X position of the middle of the toolbar based on the current window width */
  getStoredXPosition() {
    const currentWindow = dom.getWindow(this.layoutService.activeContainer);
    const isMainWindow = currentWindow === mainWindow;
    const storedPercentage = isMainWindow ? Number(this.storageService.get(DEBUG_TOOLBAR_POSITION_KEY, StorageScope.PROFILE)) : this.auxWindowCoordinates.get(currentWindow)?.x;
    return storedPercentage !== void 0 && !isNaN(storedPercentage) ? storedPercentage : 0.5;
  }
  getStoredYPosition() {
    const currentWindow = dom.getWindow(this.layoutService.activeContainer);
    const isMainWindow = currentWindow === mainWindow;
    const storedY = isMainWindow ? this.storageService.getNumber(DEBUG_TOOLBAR_Y_KEY, StorageScope.PROFILE) : this.auxWindowCoordinates.get(currentWindow)?.y;
    return storedY ?? this.yDefault;
  }
  setCoordinates(x, y) {
    if (!this.isVisible) {
      return;
    }
    x ??= this.getStoredXPosition();
    y ??= this.getStoredYPosition();
    const [yMin, yMax] = this.yRange;
    y = Math.max(yMin, Math.min(y, yMax));
    this.$el.style.setProperty("--x-position", `${x}`);
    this.$el.style.setProperty("--y-position", `${y}px`);
  }
  get yDefault() {
    return this.layoutService.mainContainerOffset.top;
  }
  get yRange() {
    if (!this._yRange) {
      const isTitleBarVisible = this.layoutService.isVisible(Parts.TITLEBAR_PART, dom.getWindow(this.layoutService.activeContainer));
      const yMin = isTitleBarVisible ? 0 : this.layoutService.mainContainerOffset.top;
      let yMax = 0;
      if (isTitleBarVisible) {
        if (this.configurationService.getValue(LayoutSettings.COMMAND_CENTER) === true) {
          yMax += 35;
        } else {
          yMax += 28;
        }
      }
      if (this.configurationService.getValue(LayoutSettings.EDITOR_TABS_MODE) !== EditorTabsMode.NONE) {
        yMax += 35;
      }
      this._yRange = [yMin, yMax];
    }
    return this._yRange;
  }
  show() {
    if (this.isVisible) {
      this.setCoordinates();
      return;
    }
    if (!this.isBuilt) {
      this.isBuilt = true;
      this.doShowInActiveContainer();
    }
    this.isVisible = true;
    dom.show(this.$el);
    this.setCoordinates();
  }
  doShowInActiveContainer() {
    this.layoutService.activeContainer.appendChild(this.$el);
    this.trackPixelRatioListener.value = PixelRatio.getInstance(dom.getWindow(this.$el)).onDidChange(
      () => this.setCoordinates()
    );
  }
  hide() {
    this.isVisible = false;
    dom.hide(this.$el);
  }
  dispose() {
    super.dispose();
    this.$el?.remove();
  }
};
DebugToolBar = __decorateClass([
  __decorateParam(0, INotificationService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IDebugService),
  __decorateParam(3, IWorkbenchLayoutService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IThemeService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IMenuService),
  __decorateParam(9, IContextKeyService)
], DebugToolBar);
function createDisconnectMenuItemAction(action, disposables, accessor, options) {
  const menuService = accessor.get(IMenuService);
  const contextKeyService = accessor.get(IContextKeyService);
  const instantiationService = accessor.get(IInstantiationService);
  const menu = menuService.getMenuActions(MenuId.DebugToolBarStop, contextKeyService, { shouldForwardArgs: true });
  const secondary = getFlatActionBarActions(menu);
  if (!secondary.length) {
    return void 0;
  }
  const dropdownAction = disposables.add(new Action("notebook.moreRunActions", localize("notebook.moreRunActionsLabel", "More..."), "codicon-chevron-down", true));
  const item = instantiationService.createInstance(
    DropdownWithPrimaryActionViewItem,
    action,
    dropdownAction,
    secondary,
    "debug-stop-actions",
    options
  );
  return item;
}
const debugViewTitleItems = new DisposableStore();
const registerDebugToolBarItem = (id, title, order, icon, when, precondition, alt) => {
  MenuRegistry.appendMenuItem(MenuId.DebugToolBar, {
    group: "navigation",
    when,
    order,
    command: {
      id,
      title,
      icon,
      precondition
    },
    alt
  });
  debugViewTitleItems.add(MenuRegistry.appendMenuItem(MenuId.ViewContainerTitle, {
    group: "navigation",
    when: ContextKeyExpr.and(when, ContextKeyExpr.equals("viewContainer", VIEWLET_ID), CONTEXT_DEBUG_STATE.notEqualsTo("inactive"), ContextKeyExpr.equals("config.debug.toolBarLocation", "docked")),
    order,
    command: {
      id,
      title,
      icon,
      precondition
    }
  }));
};
markAsSingleton(MenuRegistry.onDidChangeMenu((e) => {
  if (e.has(MenuId.DebugToolBar)) {
    debugViewTitleItems.clear();
    const items = MenuRegistry.getMenuItems(MenuId.DebugToolBar);
    for (const i of items) {
      debugViewTitleItems.add(MenuRegistry.appendMenuItem(MenuId.ViewContainerTitle, {
        ...i,
        when: ContextKeyExpr.and(i.when, ContextKeyExpr.equals("viewContainer", VIEWLET_ID), CONTEXT_DEBUG_STATE.notEqualsTo("inactive"), ContextKeyExpr.equals("config.debug.toolBarLocation", "docked"))
      }));
    }
  }
}));
const CONTEXT_TOOLBAR_COMMAND_CENTER = ContextKeyExpr.equals("config.debug.toolBarLocation", "commandCenter");
MenuRegistry.appendMenuItem(MenuId.CommandCenterCenter, {
  submenu: MenuId.DebugToolBar,
  title: "Debug",
  icon: Codicon.debug,
  order: 1,
  when: ContextKeyExpr.and(CONTEXT_IN_DEBUG_MODE, CONTEXT_TOOLBAR_COMMAND_CENTER)
});
registerDebugToolBarItem(CONTINUE_ID, CONTINUE_LABEL, 10, icons.debugContinue, CONTEXT_DEBUG_STATE.isEqualTo("stopped"));
registerDebugToolBarItem(PAUSE_ID, PAUSE_LABEL, 10, icons.debugPause, CONTEXT_DEBUG_STATE.notEqualsTo("stopped"), ContextKeyExpr.and(CONTEXT_DEBUG_STATE.isEqualTo("running"), CONTEXT_FOCUSED_SESSION_IS_NO_DEBUG.toNegated()));
registerDebugToolBarItem(STOP_ID, STOP_LABEL, 70, icons.debugStop, CONTEXT_FOCUSED_SESSION_IS_ATTACH.toNegated(), void 0, { id: DISCONNECT_ID, title: DISCONNECT_LABEL, icon: icons.debugDisconnect, precondition: ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH.toNegated(), CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED) });
registerDebugToolBarItem(DISCONNECT_ID, DISCONNECT_LABEL, 70, icons.debugDisconnect, CONTEXT_FOCUSED_SESSION_IS_ATTACH, void 0, { id: STOP_ID, title: STOP_LABEL, icon: icons.debugStop, precondition: ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED) });
registerDebugToolBarItem(STEP_OVER_ID, STEP_OVER_LABEL, 20, icons.debugStepOver, void 0, CONTEXT_DEBUG_STATE.isEqualTo("stopped"));
registerDebugToolBarItem(STEP_INTO_ID, STEP_INTO_LABEL, 30, icons.debugStepInto, void 0, CONTEXT_DEBUG_STATE.isEqualTo("stopped"));
registerDebugToolBarItem(STEP_OUT_ID, STEP_OUT_LABEL, 40, icons.debugStepOut, void 0, CONTEXT_DEBUG_STATE.isEqualTo("stopped"));
registerDebugToolBarItem(RESTART_SESSION_ID, RESTART_LABEL, 60, icons.debugRestart);
registerDebugToolBarItem(STEP_BACK_ID, localize("stepBackDebug", "Step Back"), 50, icons.debugStepBack, CONTEXT_STEP_BACK_SUPPORTED, CONTEXT_DEBUG_STATE.isEqualTo("stopped"));
registerDebugToolBarItem(REVERSE_CONTINUE_ID, localize("reverseContinue", "Reverse"), 55, icons.debugReverseContinue, CONTEXT_STEP_BACK_SUPPORTED, CONTEXT_DEBUG_STATE.isEqualTo("stopped"));
registerDebugToolBarItem(FOCUS_SESSION_ID, FOCUS_SESSION_LABEL, 100, Codicon.listTree, ContextKeyExpr.and(CONTEXT_MULTI_SESSION_DEBUG, CONTEXT_TOOLBAR_COMMAND_CENTER.negate()));
MenuRegistry.appendMenuItem(MenuId.DebugToolBarStop, {
  group: "navigation",
  when: ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH.toNegated(), CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED),
  order: 0,
  command: {
    id: DISCONNECT_ID,
    title: DISCONNECT_LABEL,
    icon: icons.debugDisconnect
  }
});
MenuRegistry.appendMenuItem(MenuId.DebugToolBarStop, {
  group: "navigation",
  when: ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED),
  order: 0,
  command: {
    id: STOP_ID,
    title: STOP_LABEL,
    icon: icons.debugStop
  }
});
MenuRegistry.appendMenuItem(MenuId.DebugToolBarStop, {
  group: "navigation",
  when: ContextKeyExpr.or(
    ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH.toNegated(), CONTEXT_SUSPEND_DEBUGGEE_SUPPORTED, CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED),
    ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_SUSPEND_DEBUGGEE_SUPPORTED)
  ),
  order: 0,
  command: {
    id: DISCONNECT_AND_SUSPEND_ID,
    title: DISCONNECT_AND_SUSPEND_LABEL,
    icon: icons.debugDisconnect
  }
});
export {
  DebugToolBar,
  createDisconnectMenuItemAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxkZWJ1Z1Rvb2xCYXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBQaXhlbFJhdGlvIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3BpeGVsUmF0aW8uanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyLCBBY3Rpb25zT3JpZW50YXRpb24sIElBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IElCYXNlQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgQ29kZVdpbmRvdywgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uLCBJUnVuRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24sIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCAqIGFzIGFycmF5cyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgKiBhcyBlcnJvcnMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgbWFya0FzU2luZ2xldG9uLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBQbGF0Zm9ybSwgcGxhdGZvcm0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kQWN0aW9uLCBJQ29tbWFuZEFjdGlvblRpdGxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb24uanMnO1xuaW1wb3J0IHsgRHJvcGRvd25XaXRoUHJpbWFyeUFjdGlvblZpZXdJdGVtLCBJRHJvcGRvd25XaXRoUHJpbWFyeUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9kcm9wZG93bldpdGhQcmltYXJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uVmlld0l0ZW0sIGdldEZsYXRBY3Rpb25CYXJBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElNZW51LCBJTWVudVNlcnZpY2UsIE1lbnVJZCwgTWVudUl0ZW1BY3Rpb24sIE1lbnVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgQ29udGV4dEtleUV4cHJlc3Npb24sIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IHdpZGdldEJvcmRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UsIFRoZW1hYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRUaXRsZUJhclN0eWxlLCBUaXRsZWJhclN0eWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IEVkaXRvclRhYnNNb2RlLCBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgTGF5b3V0U2V0dGluZ3MsIFBhcnRzIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDT05URVhUX0RFQlVHX1NUQVRFLCBDT05URVhUX0ZPQ1VTRURfU0VTU0lPTl9JU19BVFRBQ0gsIENPTlRFWFRfRk9DVVNFRF9TRVNTSU9OX0lTX05PX0RFQlVHLCBDT05URVhUX0lOX0RFQlVHX01PREUsIENPTlRFWFRfTVVMVElfU0VTU0lPTl9ERUJVRywgQ09OVEVYVF9TVEVQX0JBQ0tfU1VQUE9SVEVELCBDT05URVhUX1NVU1BFTkRfREVCVUdHRUVfU1VQUE9SVEVELCBDT05URVhUX1RFUk1JTkFURV9ERUJVR0dFRV9TVVBQT1JURUQsIElEZWJ1Z0NvbmZpZ3VyYXRpb24sIElEZWJ1Z1NlcnZpY2UsIFN0YXRlLCBWSUVXTEVUX0lEIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IEZvY3VzU2Vzc2lvbkFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi9kZWJ1Z0FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBkZWJ1Z1Rvb2xCYXJCYWNrZ3JvdW5kLCBkZWJ1Z1Rvb2xCYXJCb3JkZXIgfSBmcm9tICcuL2RlYnVnQ29sb3JzLmpzJztcbmltcG9ydCB7IENPTlRJTlVFX0lELCBDT05USU5VRV9MQUJFTCwgRElTQ09OTkVDVF9BTkRfU1VTUEVORF9JRCwgRElTQ09OTkVDVF9BTkRfU1VTUEVORF9MQUJFTCwgRElTQ09OTkVDVF9JRCwgRElTQ09OTkVDVF9MQUJFTCwgRk9DVVNfU0VTU0lPTl9JRCwgRk9DVVNfU0VTU0lPTl9MQUJFTCwgUEFVU0VfSUQsIFBBVVNFX0xBQkVMLCBSRVNUQVJUX0xBQkVMLCBSRVNUQVJUX1NFU1NJT05fSUQsIFJFVkVSU0VfQ09OVElOVUVfSUQsIFNURVBfQkFDS19JRCwgU1RFUF9JTlRPX0lELCBTVEVQX0lOVE9fTEFCRUwsIFNURVBfT1VUX0lELCBTVEVQX09VVF9MQUJFTCwgU1RFUF9PVkVSX0lELCBTVEVQX09WRVJfTEFCRUwsIFNUT1BfSUQsIFNUT1BfTEFCRUwgfSBmcm9tICcuL2RlYnVnQ29tbWFuZHMuanMnO1xuaW1wb3J0ICogYXMgaWNvbnMgZnJvbSAnLi9kZWJ1Z0ljb25zLmpzJztcbmltcG9ydCAnLi9tZWRpYS9kZWJ1Z1Rvb2xCYXIuY3NzJztcblxuY29uc3QgREVCVUdfVE9PTEJBUl9QT1NJVElPTl9LRVkgPSAnZGVidWcuYWN0aW9uc3dpZGdldHBvc2l0aW9uJztcbmNvbnN0IERFQlVHX1RPT0xCQVJfWV9LRVkgPSAnZGVidWcuYWN0aW9uc3dpZGdldHknO1xuXG5leHBvcnQgY2xhc3MgRGVidWdUb29sQmFyIGV4dGVuZHMgVGhlbWFibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRwcml2YXRlICRlbDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgZHJhZ0FyZWE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGFjdGlvbkJhcjogQWN0aW9uQmFyO1xuXHRwcml2YXRlIGFjdGl2ZUFjdGlvbnM6IElBY3Rpb25bXTtcblx0cHJpdmF0ZSB1cGRhdGVTY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cdHByaXZhdGUgZGVidWdUb29sQmFyTWVudTogSU1lbnU7XG5cblx0cHJpdmF0ZSBpc1Zpc2libGUgPSBmYWxzZTtcblx0cHJpdmF0ZSBpc0J1aWx0ID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBzdG9wQWN0aW9uVmlld0l0ZW1EaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdC8qKiBjb29yZGluYXRlIG9mIHRoZSBkZWJ1ZyB0b29sYmFyIHBlciBhdXggd2luZG93ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgYXV4V2luZG93Q29vcmRpbmF0ZXMgPSBuZXcgV2Vha01hcDxDb2RlV2luZG93LCB7IHg6IG51bWJlcjsgeTogbnVtYmVyIHwgdW5kZWZpbmVkIH0+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSB0cmFja1BpeGVsUmF0aW9MaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASURlYnVnU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIodGhlbWVTZXJ2aWNlKTtcblxuXHRcdHRoaXMuJGVsID0gZG9tLiQoJ2Rpdi5kZWJ1Zy10b29sYmFyJyk7XG5cblx0XHQvLyBOb3RlOiBjaGFuZ2VzIHRvIHRoaXMgc2V0dGluZyByZXF1aXJlIGEgcmVzdGFydCwgc28gbm8gbmVlZCB0byBsaXN0ZW4gdG8gaXQuXG5cdFx0Y29uc3QgY29udHJvbHNPblRpdGxlYmFyID0gZ2V0VGl0bGVCYXJTdHlsZSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKSA9PT0gVGl0bGViYXJTdHlsZS5DVVNUT007XG5cblx0XHQvLyBEbyBub3QgYWxsb3cgdGhlIHdpZGdldCB0byBvdmVyZmxvdyBvciB1bmRlcmZsb3cgd2luZG93IGNvbnRyb2xzLlxuXHRcdC8vIFVzZSBDU1MgY2FsY3VsYXRpb25zIHRvIGF2b2lkIGhhdmluZyB0byBmb3JjZSBsYXlvdXQgd2l0aCBgLmNsaWVudFdpZHRoYFxuXHRcdGNvbnN0IGNvbnRyb2xzT25MZWZ0ID0gY29udHJvbHNPblRpdGxlYmFyICYmIHBsYXRmb3JtID09PSBQbGF0Zm9ybS5NYWM7XG5cdFx0Y29uc3QgY29udHJvbHNPblJpZ2h0ID0gY29udHJvbHNPblRpdGxlYmFyICYmIChwbGF0Zm9ybSA9PT0gUGxhdGZvcm0uV2luZG93cyB8fCBwbGF0Zm9ybSA9PT0gUGxhdGZvcm0uTGludXgpO1xuXHRcdHRoaXMuJGVsLnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUoXG5cdFx0XHRtaW4oXG5cdFx0XHRcdG1heCgke2NvbnRyb2xzT25MZWZ0ID8gJzYwcHgnIDogJzBweCd9LCBjYWxjKC01MCUgKyAoMTAwdncgKiB2YXIoLS14LXBvc2l0aW9uKSkpKSxcblx0XHRcdFx0Y2FsYygxMDB2dyAtIDEwMCUgLSAke2NvbnRyb2xzT25SaWdodCA/ICcxMDBweCcgOiAnMHB4J30pXG5cdFx0XHQpLFxuXHRcdFx0dmFyKC0teS1wb3NpdGlvbilcblx0XHQpYDtcblxuXHRcdHRoaXMuZHJhZ0FyZWEgPSBkb20uYXBwZW5kKHRoaXMuJGVsLCBkb20uJCgnZGl2LmRyYWctYXJlYScgKyBUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5kZWJ1Z0dyaXBwZXIpKSk7XG5cblx0XHRjb25zdCBhY3Rpb25CYXJDb250YWluZXIgPSBkb20uYXBwZW5kKHRoaXMuJGVsLCBkb20uJCgnZGl2LmFjdGlvbi1iYXItY29udGFpbmVyJykpO1xuXHRcdHRoaXMuZGVidWdUb29sQmFyTWVudSA9IG1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoTWVudUlkLkRlYnVnVG9vbEJhciwgY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVidWdUb29sQmFyTWVudSk7XG5cblx0XHR0aGlzLmFjdGl2ZUFjdGlvbnMgPSBbXTtcblx0XHR0aGlzLmFjdGlvbkJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb25CYXIoYWN0aW9uQmFyQ29udGFpbmVyLCB7XG5cdFx0XHRvcmllbnRhdGlvbjogQWN0aW9uc09yaWVudGF0aW9uLkhPUklaT05UQUwsXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zOiBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucykgPT4ge1xuXHRcdFx0XHRpZiAoYWN0aW9uLmlkID09PSBGT0NVU19TRVNTSU9OX0lEKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRm9jdXNTZXNzaW9uQWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSBlbHNlIGlmIChhY3Rpb24uaWQgPT09IFNUT1BfSUQgfHwgYWN0aW9uLmlkID09PSBESVNDT05ORUNUX0lEKSB7XG5cdFx0XHRcdFx0dGhpcy5zdG9wQWN0aW9uVmlld0l0ZW1EaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGNyZWF0ZURpc2Nvbm5lY3RNZW51SXRlbUFjdGlvbihhY3Rpb24gYXMgTWVudUl0ZW1BY3Rpb24sIHRoaXMuc3RvcEFjdGlvblZpZXdJdGVtRGlzcG9zYWJsZXMsIGFjY2Vzc29yLCB7IGhvdmVyRGVsZWdhdGU6IG9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSB9KSk7XG5cdFx0XHRcdFx0aWYgKGl0ZW0pIHtcblx0XHRcdFx0XHRcdHJldHVybiBpdGVtO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBjcmVhdGVBY3Rpb25WaWV3SXRlbSh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMudXBkYXRlU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLmRlYnVnU2VydmljZS5zdGF0ZTtcblx0XHRcdGNvbnN0IHRvb2xCYXJMb2NhdGlvbiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SURlYnVnQ29uZmlndXJhdGlvbj4oJ2RlYnVnJykudG9vbEJhckxvY2F0aW9uO1xuXHRcdFx0aWYgKFxuXHRcdFx0XHRzdGF0ZSA9PT0gU3RhdGUuSW5hY3RpdmUgfHxcblx0XHRcdFx0dG9vbEJhckxvY2F0aW9uICE9PSAnZmxvYXRpbmcnIHx8XG5cdFx0XHRcdHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0U2Vzc2lvbnMoKS5ldmVyeShzID0+IHMuc3VwcHJlc3NEZWJ1Z1Rvb2xiYXIpIHx8XG5cdFx0XHRcdChzdGF0ZSA9PT0gU3RhdGUuSW5pdGlhbGl6aW5nICYmIHRoaXMuZGVidWdTZXJ2aWNlLmluaXRpYWxpemluZ09wdGlvbnM/LnN1cHByZXNzRGVidWdUb29sYmFyKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmhpZGUoKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IGdldEZsYXRBY3Rpb25CYXJBY3Rpb25zKHRoaXMuZGVidWdUb29sQmFyTWVudS5nZXRBY3Rpb25zKHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSkpO1xuXHRcdFx0aWYgKCFhcnJheXMuZXF1YWxzKGFjdGlvbnMsIHRoaXMuYWN0aXZlQWN0aW9ucywgKGZpcnN0LCBzZWNvbmQpID0+IGZpcnN0LmlkID09PSBzZWNvbmQuaWQgJiYgZmlyc3QuZW5hYmxlZCA9PT0gc2Vjb25kLmVuYWJsZWQpKSB7XG5cdFx0XHRcdHRoaXMuYWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0XHRcdHRoaXMuYWN0aW9uQmFyLnB1c2goYWN0aW9ucywgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdFx0XHRcdHRoaXMuYWN0aXZlQWN0aW9ucyA9IGFjdGlvbnM7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuc2hvdygpO1xuXHRcdH0sIDIwKSk7XG5cblx0XHR0aGlzLnVwZGF0ZVN0eWxlcygpO1xuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0XHR0aGlzLmhpZGUoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWJ1Z1NlcnZpY2Uub25EaWRDaGFuZ2VTdGF0ZSgoKSA9PiB0aGlzLnVwZGF0ZVNjaGVkdWxlci5zY2hlZHVsZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZGVidWcudG9vbEJhckxvY2F0aW9uJykpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKExheW91dFNldHRpbmdzLkVESVRPUl9UQUJTX01PREUpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTGF5b3V0U2V0dGluZ3MuQ09NTUFORF9DRU5URVIpKSB7XG5cdFx0XHRcdHRoaXMuX3lSYW5nZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5zZXRDb29yZGluYXRlcygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlYnVnVG9vbEJhck1lbnUub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy51cGRhdGVTY2hlZHVsZXIuc2NoZWR1bGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYWN0aW9uQmFyLmFjdGlvblJ1bm5lci5vbkRpZFJ1bigoZTogSVJ1bkV2ZW50KSA9PiB7XG5cdFx0XHQvLyBjaGVjayBmb3IgZXJyb3Jcblx0XHRcdGlmIChlLmVycm9yICYmICFlcnJvcnMuaXNDYW5jZWxsYXRpb25FcnJvcihlLmVycm9yKSkge1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uud2FybihlLmVycm9yKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gbG9nIGluIHRlbGVtZXRyeVxuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJywgeyBpZDogZS5hY3Rpb24uaWQsIGZyb206ICdkZWJ1Z0FjdGlvbnNXaWRnZXQnIH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlVXBMaXN0ZW5lcih0aGlzLmRyYWdBcmVhLCAoZXZlbnQ6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IG1vdXNlQ2xpY2tFdmVudCA9IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoZG9tLmdldFdpbmRvdyh0aGlzLmRyYWdBcmVhKSwgZXZlbnQpO1xuXHRcdFx0aWYgKG1vdXNlQ2xpY2tFdmVudC5kZXRhaWwgPT09IDIpIHtcblx0XHRcdFx0Ly8gZG91YmxlIGNsaWNrIG9uIGRlYnVnIGJhciBjZW50ZXJzIGl0IGFnYWluICM4MjUwXG5cdFx0XHRcdHRoaXMuc2V0Q29vcmRpbmF0ZXMoMC41LCB0aGlzLnlEZWZhdWx0KTtcblx0XHRcdFx0dGhpcy5zdG9yZVBvc2l0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VEb3duTGlzdGVuZXIodGhpcy5kcmFnQXJlYSwgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdHRoaXMuZHJhZ0FyZWEuY2xhc3NMaXN0LmFkZCgnZHJhZ2dlZCcpO1xuXHRcdFx0Y29uc3QgYWN0aXZlV2luZG93ID0gZG9tLmdldFdpbmRvdyh0aGlzLmxheW91dFNlcnZpY2UuYWN0aXZlQ29udGFpbmVyKTtcblx0XHRcdGNvbnN0IG9yaWdpbkV2ZW50ID0gbmV3IFN0YW5kYXJkTW91c2VFdmVudChhY3RpdmVXaW5kb3csIGUpO1xuXG5cdFx0XHRjb25zdCBvcmlnaW5YID0gdGhpcy5jb21wdXRlQ3VycmVudFhQZXJjZW50KCk7XG5cdFx0XHRjb25zdCBvcmlnaW5ZID0gdGhpcy5nZXRDdXJyZW50WVBvc2l0aW9uKCk7XG5cblx0XHRcdGNvbnN0IG1vdXNlTW92ZUxpc3RlbmVyID0gZG9tLmFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VNb3ZlTGlzdGVuZXIoYWN0aXZlV2luZG93LCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0XHRjb25zdCBtb3VzZU1vdmVFdmVudCA9IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoYWN0aXZlV2luZG93LCBlKTtcblx0XHRcdFx0Ly8gUHJldmVudCBkZWZhdWx0IHRvIHN0b3AgZWRpdG9yIHNlbGVjdGluZyB0ZXh0ICM4NTI0XG5cdFx0XHRcdG1vdXNlTW92ZUV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHRoaXMuc2V0Q29vcmRpbmF0ZXMoXG5cdFx0XHRcdFx0b3JpZ2luWCArIChtb3VzZU1vdmVFdmVudC5wb3N4IC0gb3JpZ2luRXZlbnQucG9zeCkgLyBhY3RpdmVXaW5kb3cuaW5uZXJXaWR0aCxcblx0XHRcdFx0XHRvcmlnaW5ZICsgbW91c2VNb3ZlRXZlbnQucG9zeSAtIG9yaWdpbkV2ZW50LnBvc3ksXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgbW91c2VVcExpc3RlbmVyID0gZG9tLmFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VVcExpc3RlbmVyKGFjdGl2ZVdpbmRvdywgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdFx0dGhpcy5zdG9yZVBvc2l0aW9uKCk7XG5cdFx0XHRcdHRoaXMuZHJhZ0FyZWEuY2xhc3NMaXN0LnJlbW92ZSgnZHJhZ2dlZCcpO1xuXG5cdFx0XHRcdG1vdXNlTW92ZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0bW91c2VVcExpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGF5b3V0U2VydmljZS5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5KCgpID0+IHRoaXMuc2V0Q29vcmRpbmF0ZXMoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYXlvdXRTZXJ2aWNlLm9uRGlkQ2hhbmdlQWN0aXZlQ29udGFpbmVyKGFzeW5jICgpID0+IHtcblx0XHRcdHRoaXMuX3lSYW5nZSA9IHVuZGVmaW5lZDtcblxuXHRcdFx0Ly8gbm90ZTogd2UgaW50ZW50aW9uYWxseSBkb24ndCBrZWVwIHRoZSBhY3RpdmVDb250YWluZXIgYmVmb3JlIHRoZVxuXHRcdFx0Ly8gYGF3YWl0YCBjbGF1c2UgdG8gYXZvaWQgYW55IHJhY2VzIGR1ZSB0byBxdWlja2x5IHN3aXRjaGluZyB3aW5kb3dzLlxuXHRcdFx0YXdhaXQgdGhpcy5sYXlvdXRTZXJ2aWNlLndoZW5Db250YWluZXJTdHlsZXNMb2FkZWQoZG9tLmdldFdpbmRvdyh0aGlzLmxheW91dFNlcnZpY2UuYWN0aXZlQ29udGFpbmVyKSk7XG5cdFx0XHRpZiAodGhpcy5pc0J1aWx0KSB7XG5cdFx0XHRcdHRoaXMuZG9TaG93SW5BY3RpdmVDb250YWluZXIoKTtcblx0XHRcdFx0dGhpcy5zZXRDb29yZGluYXRlcygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb21wdXRlcyB0aGUgeCBwZXJjZW50IHBvc2l0aW9uIGF0IHdoaWNoIHRoZSB0b29sYmFyIGlzIGN1cnJlbnRseSBkaXNwbGF5ZWQuXG5cdCAqL1xuXHRwcml2YXRlIGNvbXB1dGVDdXJyZW50WFBlcmNlbnQoKTogbnVtYmVyIHtcblx0XHRjb25zdCB7IGxlZnQsIHdpZHRoIH0gPSB0aGlzLiRlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRyZXR1cm4gKGxlZnQgKyB3aWR0aCAvIDIpIC8gZG9tLmdldFdpbmRvdyh0aGlzLiRlbCkuaW5uZXJXaWR0aDtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSB4IHBvc2l0aW9uIHNldCBpbiB0aGUgc3R5bGUgb2YgdGhlIHRvb2xiYXIuIFRoaXMgbWF5IG5vdCBiZSBpdHNcblx0ICogYWN0dWFsIHBvc2l0aW9uIG9uIHNjcmVlbiBkZXBlbmRpbmcgb24gdG9vbGJhciBsb2NhdGlvbnMuXG5cdCAqL1xuXHRwcml2YXRlIGdldEN1cnJlbnRYUGVyY2VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiBOdW1iZXIodGhpcy4kZWwuc3R5bGUuZ2V0UHJvcGVydHlWYWx1ZSgnLS14LXBvc2l0aW9uJykpO1xuXHR9XG5cblx0LyoqIEdldHMgdGhlIHkgcG9zaXRpb24gc2V0IGluIHRoZSBzdHlsZSBvZiB0aGUgdG9vbGJhciAqL1xuXHRwcml2YXRlIGdldEN1cnJlbnRZUG9zaXRpb24oKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gcGFyc2VJbnQodGhpcy4kZWwuc3R5bGUuZ2V0UHJvcGVydHlWYWx1ZSgnLS15LXBvc2l0aW9uJykpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdG9yZVBvc2l0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2ZVdpbmRvdyA9IGRvbS5nZXRXaW5kb3codGhpcy5sYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lcik7XG5cdFx0Y29uc3QgaXNNYWluV2luZG93ID0gdGhpcy5sYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lciA9PT0gdGhpcy5sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXI7XG5cblx0XHRjb25zdCB4ID0gdGhpcy5nZXRDdXJyZW50WFBlcmNlbnQoKTtcblx0XHRjb25zdCB5ID0gdGhpcy5nZXRDdXJyZW50WVBvc2l0aW9uKCk7XG5cdFx0aWYgKGlzTWFpbldpbmRvdykge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShERUJVR19UT09MQkFSX1BPU0lUSU9OX0tFWSwgeCwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKERFQlVHX1RPT0xCQVJfWV9LRVksIHksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmF1eFdpbmRvd0Nvb3JkaW5hdGVzLnNldChhY3RpdmVXaW5kb3csIHsgeCwgeSB9KTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVTdHlsZXMoKTogdm9pZCB7XG5cdFx0c3VwZXIudXBkYXRlU3R5bGVzKCk7XG5cblx0XHRpZiAodGhpcy4kZWwpIHtcblx0XHRcdHRoaXMuJGVsLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IHRoaXMuZ2V0Q29sb3IoZGVidWdUb29sQmFyQmFja2dyb3VuZCkgfHwgJyc7XG5cblx0XHRcdGNvbnN0IGNvbnRyYXN0Qm9yZGVyQ29sb3IgPSB0aGlzLmdldENvbG9yKHdpZGdldEJvcmRlcik7XG5cdFx0XHRjb25zdCBib3JkZXJDb2xvciA9IHRoaXMuZ2V0Q29sb3IoZGVidWdUb29sQmFyQm9yZGVyKTtcblxuXHRcdFx0aWYgKGNvbnRyYXN0Qm9yZGVyQ29sb3IpIHtcblx0XHRcdFx0dGhpcy4kZWwuc3R5bGUuYm9yZGVyID0gYDFweCBzb2xpZCAke2NvbnRyYXN0Qm9yZGVyQ29sb3J9YDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuJGVsLnN0eWxlLmJvcmRlciA9IGJvcmRlckNvbG9yID8gYHNvbGlkICR7Ym9yZGVyQ29sb3J9YCA6ICdub25lJztcblx0XHRcdFx0dGhpcy4kZWwuc3R5bGUuYm9yZGVyID0gJzFweCAwJztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKiogR2V0cyB0aGUgc3RvcmVkIFggcG9zaXRpb24gb2YgdGhlIG1pZGRsZSBvZiB0aGUgdG9vbGJhciBiYXNlZCBvbiB0aGUgY3VycmVudCB3aW5kb3cgd2lkdGggKi9cblx0cHJpdmF0ZSBnZXRTdG9yZWRYUG9zaXRpb24oKSB7XG5cdFx0Y29uc3QgY3VycmVudFdpbmRvdyA9IGRvbS5nZXRXaW5kb3codGhpcy5sYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lcik7XG5cdFx0Y29uc3QgaXNNYWluV2luZG93ID0gY3VycmVudFdpbmRvdyA9PT0gbWFpbldpbmRvdztcblx0XHRjb25zdCBzdG9yZWRQZXJjZW50YWdlID0gaXNNYWluV2luZG93XG5cdFx0XHQ/IE51bWJlcih0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChERUJVR19UT09MQkFSX1BPU0lUSU9OX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpKVxuXHRcdFx0OiB0aGlzLmF1eFdpbmRvd0Nvb3JkaW5hdGVzLmdldChjdXJyZW50V2luZG93KT8ueDtcblx0XHRyZXR1cm4gc3RvcmVkUGVyY2VudGFnZSAhPT0gdW5kZWZpbmVkICYmICFpc05hTihzdG9yZWRQZXJjZW50YWdlKSA/IHN0b3JlZFBlcmNlbnRhZ2UgOiAwLjU7XG5cdH1cblxuXHRwcml2YXRlIGdldFN0b3JlZFlQb3NpdGlvbigpIHtcblx0XHRjb25zdCBjdXJyZW50V2luZG93ID0gZG9tLmdldFdpbmRvdyh0aGlzLmxheW91dFNlcnZpY2UuYWN0aXZlQ29udGFpbmVyKTtcblx0XHRjb25zdCBpc01haW5XaW5kb3cgPSBjdXJyZW50V2luZG93ID09PSBtYWluV2luZG93O1xuXHRcdGNvbnN0IHN0b3JlZFkgPSBpc01haW5XaW5kb3dcblx0XHRcdD8gdGhpcy5zdG9yYWdlU2VydmljZS5nZXROdW1iZXIoREVCVUdfVE9PTEJBUl9ZX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpXG5cdFx0XHQ6IHRoaXMuYXV4V2luZG93Q29vcmRpbmF0ZXMuZ2V0KGN1cnJlbnRXaW5kb3cpPy55O1xuXHRcdHJldHVybiBzdG9yZWRZID8/IHRoaXMueURlZmF1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHNldENvb3JkaW5hdGVzKHg/OiBudW1iZXIsIHk/OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaXNWaXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0eCA/Pz0gdGhpcy5nZXRTdG9yZWRYUG9zaXRpb24oKTtcblx0XHR5ID8/PSB0aGlzLmdldFN0b3JlZFlQb3NpdGlvbigpO1xuXG5cdFx0Y29uc3QgW3lNaW4sIHlNYXhdID0gdGhpcy55UmFuZ2U7XG5cdFx0eSA9IE1hdGgubWF4KHlNaW4sIE1hdGgubWluKHksIHlNYXgpKTtcblx0XHR0aGlzLiRlbC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS14LXBvc2l0aW9uJywgYCR7eH1gKTtcblx0XHR0aGlzLiRlbC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS15LXBvc2l0aW9uJywgYCR7eX1weGApO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgeURlZmF1bHQoKSB7XG5cdFx0cmV0dXJuIHRoaXMubGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyT2Zmc2V0LnRvcDtcblx0fVxuXG5cdHByaXZhdGUgX3lSYW5nZTogW251bWJlciwgbnVtYmVyXSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBnZXQgeVJhbmdlKCk6IFtudW1iZXIsIG51bWJlcl0ge1xuXHRcdGlmICghdGhpcy5feVJhbmdlKSB7XG5cdFx0XHRjb25zdCBpc1RpdGxlQmFyVmlzaWJsZSA9IHRoaXMubGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuVElUTEVCQVJfUEFSVCwgZG9tLmdldFdpbmRvdyh0aGlzLmxheW91dFNlcnZpY2UuYWN0aXZlQ29udGFpbmVyKSk7XG5cdFx0XHRjb25zdCB5TWluID0gaXNUaXRsZUJhclZpc2libGUgPyAwIDogdGhpcy5sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXJPZmZzZXQudG9wO1xuXHRcdFx0bGV0IHlNYXggPSAwO1xuXG5cdFx0XHRpZiAoaXNUaXRsZUJhclZpc2libGUpIHtcblx0XHRcdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoTGF5b3V0U2V0dGluZ3MuQ09NTUFORF9DRU5URVIpID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0eU1heCArPSAzNTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR5TWF4ICs9IDI4O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKExheW91dFNldHRpbmdzLkVESVRPUl9UQUJTX01PREUpICE9PSBFZGl0b3JUYWJzTW9kZS5OT05FKSB7XG5cdFx0XHRcdHlNYXggKz0gMzU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl95UmFuZ2UgPSBbeU1pbiwgeU1heF07XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl95UmFuZ2U7XG5cdH1cblxuXHRwcml2YXRlIHNob3coKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNWaXNpYmxlKSB7XG5cdFx0XHR0aGlzLnNldENvb3JkaW5hdGVzKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5pc0J1aWx0KSB7XG5cdFx0XHR0aGlzLmlzQnVpbHQgPSB0cnVlO1xuXHRcdFx0dGhpcy5kb1Nob3dJbkFjdGl2ZUNvbnRhaW5lcigpO1xuXHRcdH1cblxuXHRcdHRoaXMuaXNWaXNpYmxlID0gdHJ1ZTtcblx0XHRkb20uc2hvdyh0aGlzLiRlbCk7XG5cdFx0dGhpcy5zZXRDb29yZGluYXRlcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1Nob3dJbkFjdGl2ZUNvbnRhaW5lcigpOiB2b2lkIHtcblx0XHR0aGlzLmxheW91dFNlcnZpY2UuYWN0aXZlQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuJGVsKTtcblx0XHR0aGlzLnRyYWNrUGl4ZWxSYXRpb0xpc3RlbmVyLnZhbHVlID0gUGl4ZWxSYXRpby5nZXRJbnN0YW5jZShkb20uZ2V0V2luZG93KHRoaXMuJGVsKSkub25EaWRDaGFuZ2UoXG5cdFx0XHQoKSA9PiB0aGlzLnNldENvb3JkaW5hdGVzKClcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBoaWRlKCk6IHZvaWQge1xuXHRcdHRoaXMuaXNWaXNpYmxlID0gZmFsc2U7XG5cdFx0ZG9tLmhpZGUodGhpcy4kZWwpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLiRlbD8ucmVtb3ZlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZURpc2Nvbm5lY3RNZW51SXRlbUFjdGlvbihhY3Rpb246IE1lbnVJdGVtQWN0aW9uLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCBhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgb3B0aW9uczogSURyb3Bkb3duV2l0aFByaW1hcnlBY3Rpb25WaWV3SXRlbU9wdGlvbnMpOiBJQWN0aW9uVmlld0l0ZW0gfCB1bmRlZmluZWQge1xuXHRjb25zdCBtZW51U2VydmljZSA9IGFjY2Vzc29yLmdldChJTWVudVNlcnZpY2UpO1xuXHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpO1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdGNvbnN0IG1lbnUgPSBtZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhNZW51SWQuRGVidWdUb29sQmFyU3RvcCwgY29udGV4dEtleVNlcnZpY2UsIHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSk7XG5cdGNvbnN0IHNlY29uZGFyeSA9IGdldEZsYXRBY3Rpb25CYXJBY3Rpb25zKG1lbnUpO1xuXG5cdGlmICghc2Vjb25kYXJ5Lmxlbmd0aCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCBkcm9wZG93bkFjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uKCdub3RlYm9vay5tb3JlUnVuQWN0aW9ucycsIGxvY2FsaXplKCdub3RlYm9vay5tb3JlUnVuQWN0aW9uc0xhYmVsJywgXCJNb3JlLi4uXCIpLCAnY29kaWNvbi1jaGV2cm9uLWRvd24nLCB0cnVlKSk7XG5cdGNvbnN0IGl0ZW0gPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEcm9wZG93bldpdGhQcmltYXJ5QWN0aW9uVmlld0l0ZW0sXG5cdFx0YWN0aW9uIGFzIE1lbnVJdGVtQWN0aW9uLFxuXHRcdGRyb3Bkb3duQWN0aW9uLFxuXHRcdHNlY29uZGFyeSxcblx0XHQnZGVidWctc3RvcC1hY3Rpb25zJyxcblx0XHRvcHRpb25zKTtcblx0cmV0dXJuIGl0ZW07XG59XG5cbi8vIERlYnVnIHRvb2xiYXJcblxuY29uc3QgZGVidWdWaWV3VGl0bGVJdGVtcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcbmNvbnN0IHJlZ2lzdGVyRGVidWdUb29sQmFySXRlbSA9IChpZDogc3RyaW5nLCB0aXRsZTogc3RyaW5nIHwgSUNvbW1hbmRBY3Rpb25UaXRsZSwgb3JkZXI6IG51bWJlciwgaWNvbj86IHsgbGlnaHQ/OiBVUkk7IGRhcms/OiBVUkkgfSB8IFRoZW1lSWNvbiwgd2hlbj86IENvbnRleHRLZXlFeHByZXNzaW9uLCBwcmVjb25kaXRpb24/OiBDb250ZXh0S2V5RXhwcmVzc2lvbiwgYWx0PzogSUNvbW1hbmRBY3Rpb24pID0+IHtcblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5EZWJ1Z1Rvb2xCYXIsIHtcblx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdHdoZW4sXG5cdFx0b3JkZXIsXG5cdFx0Y29tbWFuZDoge1xuXHRcdFx0aWQsXG5cdFx0XHR0aXRsZSxcblx0XHRcdGljb24sXG5cdFx0XHRwcmVjb25kaXRpb25cblx0XHR9LFxuXHRcdGFsdFxuXHR9KTtcblxuXHQvLyBSZWdpc3RlciBhY3Rpb25zIGluIGRlYnVnIHZpZXdsZXQgd2hlbiB0b29sYmFyIGlzIGRvY2tlZFxuXHRkZWJ1Z1ZpZXdUaXRsZUl0ZW1zLmFkZChNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlZpZXdDb250YWluZXJUaXRsZSwge1xuXHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKHdoZW4sIENvbnRleHRLZXlFeHByLmVxdWFscygndmlld0NvbnRhaW5lcicsIFZJRVdMRVRfSUQpLCBDT05URVhUX0RFQlVHX1NUQVRFLm5vdEVxdWFsc1RvKCdpbmFjdGl2ZScpLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5kZWJ1Zy50b29sQmFyTG9jYXRpb24nLCAnZG9ja2VkJykpLFxuXHRcdG9yZGVyLFxuXHRcdGNvbW1hbmQ6IHtcblx0XHRcdGlkLFxuXHRcdFx0dGl0bGUsXG5cdFx0XHRpY29uLFxuXHRcdFx0cHJlY29uZGl0aW9uXG5cdFx0fVxuXHR9KSk7XG59O1xuXG5tYXJrQXNTaW5nbGV0b24oTWVudVJlZ2lzdHJ5Lm9uRGlkQ2hhbmdlTWVudShlID0+IHtcblx0Ly8gSW4gY2FzZSB0aGUgZGVidWcgdG9vbGJhciBpcyBkb2NrZWQgd2UgbmVlZCB0byBtYWtlIHN1cmUgdGhhdCB0aGUgZG9ja2VkIHRvb2xiYXIgaGFzIHRoZSB1cCB0byBkYXRlIGNvbW1hbmRzIHJlZ2lzdGVyZWQgIzExNTk0NVxuXHRpZiAoZS5oYXMoTWVudUlkLkRlYnVnVG9vbEJhcikpIHtcblx0XHRkZWJ1Z1ZpZXdUaXRsZUl0ZW1zLmNsZWFyKCk7XG5cdFx0Y29uc3QgaXRlbXMgPSBNZW51UmVnaXN0cnkuZ2V0TWVudUl0ZW1zKE1lbnVJZC5EZWJ1Z1Rvb2xCYXIpO1xuXHRcdGZvciAoY29uc3QgaSBvZiBpdGVtcykge1xuXHRcdFx0ZGVidWdWaWV3VGl0bGVJdGVtcy5hZGQoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5WaWV3Q29udGFpbmVyVGl0bGUsIHtcblx0XHRcdFx0Li4uaSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKGkud2hlbiwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3Q29udGFpbmVyJywgVklFV0xFVF9JRCksIENPTlRFWFRfREVCVUdfU1RBVEUubm90RXF1YWxzVG8oJ2luYWN0aXZlJyksIENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLmRlYnVnLnRvb2xCYXJMb2NhdGlvbicsICdkb2NrZWQnKSlcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cbn0pKTtcblxuXG5jb25zdCBDT05URVhUX1RPT0xCQVJfQ09NTUFORF9DRU5URVIgPSBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5kZWJ1Zy50b29sQmFyTG9jYXRpb24nLCAnY29tbWFuZENlbnRlcicpO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRDZW50ZXJDZW50ZXIsIHtcblx0c3VibWVudTogTWVudUlkLkRlYnVnVG9vbEJhcixcblx0dGl0bGU6ICdEZWJ1ZycsXG5cdGljb246IENvZGljb24uZGVidWcsXG5cdG9yZGVyOiAxLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9JTl9ERUJVR19NT0RFLCBDT05URVhUX1RPT0xCQVJfQ09NTUFORF9DRU5URVIpXG59KTtcblxucmVnaXN0ZXJEZWJ1Z1Rvb2xCYXJJdGVtKENPTlRJTlVFX0lELCBDT05USU5VRV9MQUJFTCwgMTAsIGljb25zLmRlYnVnQ29udGludWUsIENPTlRFWFRfREVCVUdfU1RBVEUuaXNFcXVhbFRvKCdzdG9wcGVkJykpO1xucmVnaXN0ZXJEZWJ1Z1Rvb2xCYXJJdGVtKFBBVVNFX0lELCBQQVVTRV9MQUJFTCwgMTAsIGljb25zLmRlYnVnUGF1c2UsIENPTlRFWFRfREVCVUdfU1RBVEUubm90RXF1YWxzVG8oJ3N0b3BwZWQnKSwgQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfREVCVUdfU1RBVEUuaXNFcXVhbFRvKCdydW5uaW5nJyksIENPTlRFWFRfRk9DVVNFRF9TRVNTSU9OX0lTX05PX0RFQlVHLnRvTmVnYXRlZCgpKSk7XG5yZWdpc3RlckRlYnVnVG9vbEJhckl0ZW0oU1RPUF9JRCwgU1RPUF9MQUJFTCwgNzAsIGljb25zLmRlYnVnU3RvcCwgQ09OVEVYVF9GT0NVU0VEX1NFU1NJT05fSVNfQVRUQUNILnRvTmVnYXRlZCgpLCB1bmRlZmluZWQsIHsgaWQ6IERJU0NPTk5FQ1RfSUQsIHRpdGxlOiBESVNDT05ORUNUX0xBQkVMLCBpY29uOiBpY29ucy5kZWJ1Z0Rpc2Nvbm5lY3QsIHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfRk9DVVNFRF9TRVNTSU9OX0lTX0FUVEFDSC50b05lZ2F0ZWQoKSwgQ09OVEVYVF9URVJNSU5BVEVfREVCVUdHRUVfU1VQUE9SVEVEKSwgfSk7XG5yZWdpc3RlckRlYnVnVG9vbEJhckl0ZW0oRElTQ09OTkVDVF9JRCwgRElTQ09OTkVDVF9MQUJFTCwgNzAsIGljb25zLmRlYnVnRGlzY29ubmVjdCwgQ09OVEVYVF9GT0NVU0VEX1NFU1NJT05fSVNfQVRUQUNILCB1bmRlZmluZWQsIHsgaWQ6IFNUT1BfSUQsIHRpdGxlOiBTVE9QX0xBQkVMLCBpY29uOiBpY29ucy5kZWJ1Z1N0b3AsIHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfRk9DVVNFRF9TRVNTSU9OX0lTX0FUVEFDSCwgQ09OVEVYVF9URVJNSU5BVEVfREVCVUdHRUVfU1VQUE9SVEVEKSwgfSk7XG5yZWdpc3RlckRlYnVnVG9vbEJhckl0ZW0oU1RFUF9PVkVSX0lELCBTVEVQX09WRVJfTEFCRUwsIDIwLCBpY29ucy5kZWJ1Z1N0ZXBPdmVyLCB1bmRlZmluZWQsIENPTlRFWFRfREVCVUdfU1RBVEUuaXNFcXVhbFRvKCdzdG9wcGVkJykpO1xucmVnaXN0ZXJEZWJ1Z1Rvb2xCYXJJdGVtKFNURVBfSU5UT19JRCwgU1RFUF9JTlRPX0xBQkVMLCAzMCwgaWNvbnMuZGVidWdTdGVwSW50bywgdW5kZWZpbmVkLCBDT05URVhUX0RFQlVHX1NUQVRFLmlzRXF1YWxUbygnc3RvcHBlZCcpKTtcbnJlZ2lzdGVyRGVidWdUb29sQmFySXRlbShTVEVQX09VVF9JRCwgU1RFUF9PVVRfTEFCRUwsIDQwLCBpY29ucy5kZWJ1Z1N0ZXBPdXQsIHVuZGVmaW5lZCwgQ09OVEVYVF9ERUJVR19TVEFURS5pc0VxdWFsVG8oJ3N0b3BwZWQnKSk7XG5yZWdpc3RlckRlYnVnVG9vbEJhckl0ZW0oUkVTVEFSVF9TRVNTSU9OX0lELCBSRVNUQVJUX0xBQkVMLCA2MCwgaWNvbnMuZGVidWdSZXN0YXJ0KTtcbnJlZ2lzdGVyRGVidWdUb29sQmFySXRlbShTVEVQX0JBQ0tfSUQsIGxvY2FsaXplKCdzdGVwQmFja0RlYnVnJywgXCJTdGVwIEJhY2tcIiksIDUwLCBpY29ucy5kZWJ1Z1N0ZXBCYWNrLCBDT05URVhUX1NURVBfQkFDS19TVVBQT1JURUQsIENPTlRFWFRfREVCVUdfU1RBVEUuaXNFcXVhbFRvKCdzdG9wcGVkJykpO1xucmVnaXN0ZXJEZWJ1Z1Rvb2xCYXJJdGVtKFJFVkVSU0VfQ09OVElOVUVfSUQsIGxvY2FsaXplKCdyZXZlcnNlQ29udGludWUnLCBcIlJldmVyc2VcIiksIDU1LCBpY29ucy5kZWJ1Z1JldmVyc2VDb250aW51ZSwgQ09OVEVYVF9TVEVQX0JBQ0tfU1VQUE9SVEVELCBDT05URVhUX0RFQlVHX1NUQVRFLmlzRXF1YWxUbygnc3RvcHBlZCcpKTtcbnJlZ2lzdGVyRGVidWdUb29sQmFySXRlbShGT0NVU19TRVNTSU9OX0lELCBGT0NVU19TRVNTSU9OX0xBQkVMLCAxMDAsIENvZGljb24ubGlzdFRyZWUsIENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX01VTFRJX1NFU1NJT05fREVCVUcsIENPTlRFWFRfVE9PTEJBUl9DT01NQU5EX0NFTlRFUi5uZWdhdGUoKSkpO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkRlYnVnVG9vbEJhclN0b3AsIHtcblx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfRk9DVVNFRF9TRVNTSU9OX0lTX0FUVEFDSC50b05lZ2F0ZWQoKSwgQ09OVEVYVF9URVJNSU5BVEVfREVCVUdHRUVfU1VQUE9SVEVEKSxcblx0b3JkZXI6IDAsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogRElTQ09OTkVDVF9JRCxcblx0XHR0aXRsZTogRElTQ09OTkVDVF9MQUJFTCxcblx0XHRpY29uOiBpY29ucy5kZWJ1Z0Rpc2Nvbm5lY3Rcblx0fVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRGVidWdUb29sQmFyU3RvcCwge1xuXHRncm91cDogJ25hdmlnYXRpb24nLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9GT0NVU0VEX1NFU1NJT05fSVNfQVRUQUNILCBDT05URVhUX1RFUk1JTkFURV9ERUJVR0dFRV9TVVBQT1JURUQpLFxuXHRvcmRlcjogMCxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBTVE9QX0lELFxuXHRcdHRpdGxlOiBTVE9QX0xBQkVMLFxuXHRcdGljb246IGljb25zLmRlYnVnU3RvcFxuXHR9XG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5EZWJ1Z1Rvb2xCYXJTdG9wLCB7XG5cdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLm9yKFxuXHRcdENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0ZPQ1VTRURfU0VTU0lPTl9JU19BVFRBQ0gudG9OZWdhdGVkKCksIENPTlRFWFRfU1VTUEVORF9ERUJVR0dFRV9TVVBQT1JURUQsIENPTlRFWFRfVEVSTUlOQVRFX0RFQlVHR0VFX1NVUFBPUlRFRCksXG5cdFx0Q29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfRk9DVVNFRF9TRVNTSU9OX0lTX0FUVEFDSCwgQ09OVEVYVF9TVVNQRU5EX0RFQlVHR0VFX1NVUFBPUlRFRCksXG5cdCksXG5cdG9yZGVyOiAwLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IERJU0NPTk5FQ1RfQU5EX1NVU1BFTkRfSUQsXG5cdFx0dGl0bGU6IERJU0NPTk5FQ1RfQU5EX1NVU1BFTkRfTEFCRUwsXG5cdFx0aWNvbjogaWNvbnMuZGVidWdEaXNjb25uZWN0XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxXQUFXLDBCQUEyQztBQUUvRCxTQUFxQixrQkFBa0I7QUFDdkMsU0FBUyxjQUF1RztBQUNoSCxZQUFZLFlBQVk7QUFDeEIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxlQUFlO0FBQ3hCLFlBQVksWUFBWTtBQUN4QixTQUFTLGlCQUFpQixpQkFBaUIseUJBQXlCO0FBQ3BFLFNBQVMsVUFBVSxnQkFBZ0I7QUFDbkMsU0FBUyxpQkFBaUI7QUFHMUIsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyx5Q0FBb0Y7QUFDN0YsU0FBUyxzQkFBc0IsK0JBQStCO0FBQzlELFNBQWdCLGNBQWMsUUFBd0Isb0JBQW9CO0FBQzFFLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0JBQXNDLDBCQUEwQjtBQUN6RSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGVBQWUsZ0JBQWdCO0FBQ3hDLFNBQVMsa0JBQWtCLHFCQUFxQjtBQUVoRCxTQUFTLGdCQUFnQix5QkFBeUIsZ0JBQWdCLGFBQWE7QUFDL0UsU0FBUyxxQkFBcUIsbUNBQW1DLHFDQUFxQyx1QkFBdUIsNkJBQTZCLDZCQUE2QixvQ0FBb0Msc0NBQTJE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
