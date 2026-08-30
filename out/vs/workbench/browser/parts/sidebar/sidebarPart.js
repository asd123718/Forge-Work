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
import "./media/sidebarpart.css";
import "./sidebarActions.js";
import { ActivityBarPosition, IWorkbenchLayoutService, LayoutSettings, Parts, Position as SideBarPosition } from "../../../services/layout/browser/layoutService.js";
import { SidebarFocusContext, ActiveViewletContext } from "../../../common/contextkeys.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { contrastBorder } from "../../../../platform/theme/common/colorRegistry.js";
import { SIDE_BAR_TITLE_FOREGROUND, SIDE_BAR_TITLE_BORDER, SIDE_BAR_BACKGROUND, SIDE_BAR_FOREGROUND, SIDE_BAR_BORDER, SIDE_BAR_DRAG_AND_DROP_BACKGROUND, ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, ACTIVITY_BAR_TOP_FOREGROUND, ACTIVITY_BAR_TOP_ACTIVE_BORDER, ACTIVITY_BAR_TOP_INACTIVE_FOREGROUND, ACTIVITY_BAR_TOP_DRAG_AND_DROP_BORDER } from "../../../common/theme.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { AnchorAlignment } from "../../../../base/browser/ui/contextview/contextview.js";
import { MutableDisposable } from "../../../../base/common/lifecycle.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { LayoutPriority } from "../../../../base/browser/ui/grid/grid.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../common/views.js";
import { AbstractPaneCompositePart, CompositeBarPosition } from "../paneCompositePart.js";
import { ActivityBarCompositeBar, ActivitybarPart } from "../activitybar/activitybarPart.js";
import { ActionsOrientation } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Action2, IMenuService, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { Separator } from "../../../../base/common/actions.js";
import { ToggleActivityBarVisibilityActionId } from "../../actions/layoutActions.js";
import { localize2 } from "../../../../nls.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { VisibleViewContainersTracker } from "../visibleViewContainersTracker.js";
import { Extensions } from "../../panecomposite.js";
const PRIMARY_SIDE_BAR_SASH_CLASS = "primary-sidebar-sash";
let SidebarPart = class extends AbstractPaneCompositePart {
  //#endregion
  constructor(notificationService, storageService, contextMenuService, layoutService, keybindingService, hoverService, instantiationService, themeService, viewDescriptorService, contextKeyService, extensionService, configurationService, menuService) {
    super(
      Parts.SIDEBAR_PART,
      { hasTitle: true, trailingSeparator: false, borderWidth: () => this.getColor(SIDE_BAR_BORDER) || this.getColor(contrastBorder) ? 1 : 0 },
      SidebarPart.activeViewletSettingsKey,
      ActiveViewletContext.bindTo(contextKeyService),
      SidebarFocusContext.bindTo(contextKeyService),
      "sideBar",
      "viewlet",
      SIDE_BAR_TITLE_FOREGROUND,
      SIDE_BAR_TITLE_BORDER,
      ViewContainerLocation.Sidebar,
      Extensions.Viewlets,
      MenuId.SidebarTitle,
      notificationService,
      storageService,
      contextMenuService,
      layoutService,
      keybindingService,
      hoverService,
      instantiationService,
      themeService,
      viewDescriptorService,
      contextKeyService,
      extensionService,
      menuService,
      configurationService
    );
    //#region IView
    this.minimumWidth = 170;
    this.maximumWidth = Number.POSITIVE_INFINITY;
    this.minimumHeight = 0;
    this.maximumHeight = Number.POSITIVE_INFINITY;
    this.priority = LayoutPriority.Low;
    this.activityBarPart = this._register(this.instantiationService.createInstance(ActivitybarPart, this.location, this));
    this.primarySideBarSashClassDisposable = this._register(new MutableDisposable());
    this.visibleViewContainersTracker = this._register(instantiationService.createInstance(VisibleViewContainersTracker, ViewContainerLocation.Sidebar));
    this._register(this.visibleViewContainersTracker.onDidChange((e) => this.onDidChangeAutoHideViewContainers(e)));
    this.rememberActivityBarVisiblePosition();
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION)) {
        this.onDidChangeActivityBarLocation();
      }
      if (e.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_AUTO_HIDE)) {
        this.onDidChangeActivityBarLocation();
      }
    }));
    this.registerActions();
  }
  get snap() {
    return true;
  }
  get preferredWidth() {
    const viewlet = this.getActivePaneComposite();
    if (!viewlet) {
      return void 0;
    }
    const width = viewlet.getOptimalWidth();
    if (typeof width !== "number") {
      return void 0;
    }
    return Math.max(width, 300);
  }
  onDidChangeAutoHideViewContainers(e) {
    const activityBarPosition = this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION);
    const autoHide = this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_AUTO_HIDE);
    if (autoHide && (activityBarPosition === ActivityBarPosition.TOP || activityBarPosition === ActivityBarPosition.BOTTOM)) {
      const visibleBefore = e.before > 1;
      const visibleAfter = e.after > 1;
      if (visibleBefore !== visibleAfter) {
        this.onDidChangeActivityBarLocation();
      }
    }
  }
  onDidChangeActivityBarLocation() {
    this.activityBarPart.hide();
    this.updateCompositeBar();
    const id = this.getActiveComposite()?.getId();
    if (id) {
      this.onTitleAreaUpdate(id);
    }
    if (this.shouldShowActivityBar()) {
      this.activityBarPart.show();
    }
    this.rememberActivityBarVisiblePosition();
  }
  updateStyles() {
    super.updateStyles();
    const container = assertReturnsDefined(this.getContainer());
    container.style.backgroundColor = this.getColor(SIDE_BAR_BACKGROUND) || "";
    container.style.color = this.getColor(SIDE_BAR_FOREGROUND) || "";
    const borderColor = this.getColor(SIDE_BAR_BORDER) || this.getColor(contrastBorder);
    const isPositionLeft = this.layoutService.getSideBarPosition() === SideBarPosition.LEFT;
    container.style.borderRightWidth = borderColor && isPositionLeft ? "1px" : "";
    container.style.borderRightStyle = borderColor && isPositionLeft ? "solid" : "";
    container.style.borderRightColor = isPositionLeft ? borderColor || "" : "";
    container.style.borderLeftWidth = borderColor && !isPositionLeft ? "1px" : "";
    container.style.borderLeftStyle = borderColor && !isPositionLeft ? "solid" : "";
    container.style.borderLeftColor = !isPositionLeft ? borderColor || "" : "";
    container.style.outlineColor = this.getColor(SIDE_BAR_DRAG_AND_DROP_BACKGROUND) ?? "";
  }
  layout(width, height, top, left) {
    if (!this.layoutService.isVisible(Parts.SIDEBAR_PART)) {
      return;
    }
    super.layout(width, height, top, left);
  }
  setBoundarySashes(sashes) {
    super.setBoundarySashes?.(sashes);
    this.primarySideBarSashClassDisposable.clear();
    const primarySideBarSash = this.layoutService.getSideBarPosition() === SideBarPosition.LEFT ? sashes.right : sashes.left;
    this.primarySideBarSashClassDisposable.value = primarySideBarSash?.addClass(PRIMARY_SIDE_BAR_SASH_CLASS);
  }
  getTitleAreaDropDownAnchorAlignment() {
    return this.layoutService.getSideBarPosition() === SideBarPosition.LEFT ? AnchorAlignment.LEFT : AnchorAlignment.RIGHT;
  }
  createCompositeBar() {
    return this.instantiationService.createInstance(ActivityBarCompositeBar, ViewContainerLocation.Sidebar, this.getCompositeBarOptions(), this.partId, this, false);
  }
  getCompositeBarOptions() {
    return {
      partContainerClass: "sidebar",
      pinnedViewContainersKey: ActivitybarPart.pinnedViewContainersKey,
      placeholderViewContainersKey: ActivitybarPart.placeholderViewContainersKey,
      viewContainersWorkspaceStateKey: ActivitybarPart.viewContainersWorkspaceStateKey,
      icon: true,
      orientation: ActionsOrientation.HORIZONTAL,
      recomputeSizes: true,
      activityHoverOptions: {
        position: () => this.getCompositeBarPosition() === CompositeBarPosition.BOTTOM ? HoverPosition.ABOVE : HoverPosition.BELOW
      },
      fillExtraContextMenuActions: (actions) => {
        if (this.getCompositeBarPosition() === CompositeBarPosition.TITLE) {
          const viewsSubmenuAction = this.getViewsSubmenuAction();
          if (viewsSubmenuAction) {
            actions.push(new Separator());
            actions.push(viewsSubmenuAction);
          }
        }
      },
      compositeSize: 0,
      iconSize: 16,
      overflowActionSize: 30,
      colors: (theme) => ({
        activeBackgroundColor: theme.getColor(SIDE_BAR_BACKGROUND),
        inactiveBackgroundColor: theme.getColor(SIDE_BAR_BACKGROUND),
        activeBorderBottomColor: theme.getColor(ACTIVITY_BAR_TOP_ACTIVE_BORDER),
        activeForegroundColor: theme.getColor(ACTIVITY_BAR_TOP_FOREGROUND),
        inactiveForegroundColor: theme.getColor(ACTIVITY_BAR_TOP_INACTIVE_FOREGROUND),
        badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
        badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
        dragAndDropBorder: theme.getColor(ACTIVITY_BAR_TOP_DRAG_AND_DROP_BORDER)
      }),
      compact: true
    };
  }
  shouldShowCompositeBar() {
    const activityBarPosition = this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION);
    if (activityBarPosition !== ActivityBarPosition.TOP && activityBarPosition !== ActivityBarPosition.BOTTOM) {
      return false;
    }
    const autoHide = this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_AUTO_HIDE);
    if (autoHide) {
      const visibleCount = this.visibleViewContainersTracker.visibleCount;
      if (visibleCount <= 1) {
        return false;
      }
    }
    return true;
  }
  shouldShowActivityBar() {
    if (this.shouldShowCompositeBar()) {
      return false;
    }
    return this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION) !== ActivityBarPosition.HIDDEN;
  }
  getCompositeBarPosition() {
    const activityBarPosition = this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION);
    switch (activityBarPosition) {
      case ActivityBarPosition.TOP:
        return CompositeBarPosition.TOP;
      case ActivityBarPosition.BOTTOM:
        return CompositeBarPosition.BOTTOM;
      case ActivityBarPosition.HIDDEN:
      case ActivityBarPosition.DEFAULT:
      // noop
      default:
        return CompositeBarPosition.TITLE;
    }
  }
  rememberActivityBarVisiblePosition() {
    const activityBarPosition = this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION);
    if (activityBarPosition !== ActivityBarPosition.HIDDEN) {
      this.storageService.store(LayoutSettings.ACTIVITY_BAR_LOCATION, activityBarPosition, StorageScope.PROFILE, StorageTarget.USER);
    }
  }
  getRememberedActivityBarVisiblePosition() {
    const activityBarPosition = this.storageService.get(LayoutSettings.ACTIVITY_BAR_LOCATION, StorageScope.PROFILE);
    switch (activityBarPosition) {
      case ActivityBarPosition.TOP:
        return ActivityBarPosition.TOP;
      case ActivityBarPosition.BOTTOM:
        return ActivityBarPosition.BOTTOM;
      default:
        return ActivityBarPosition.DEFAULT;
    }
  }
  getPinnedPaneCompositeIds() {
    return this.shouldShowCompositeBar() ? super.getPinnedPaneCompositeIds() : this.activityBarPart.getPinnedPaneCompositeIds();
  }
  getVisiblePaneCompositeIds() {
    return this.shouldShowCompositeBar() ? super.getVisiblePaneCompositeIds() : this.activityBarPart.getVisiblePaneCompositeIds();
  }
  getPaneCompositeIds() {
    return this.shouldShowCompositeBar() ? super.getPaneCompositeIds() : this.activityBarPart.getPaneCompositeIds();
  }
  async focusActivityBar() {
    if (this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION) === ActivityBarPosition.HIDDEN) {
      await this.configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, this.getRememberedActivityBarVisiblePosition());
      this.onDidChangeActivityBarLocation();
    }
    if (this.shouldShowCompositeBar()) {
      this.focusCompositeBar();
    } else {
      if (!this.layoutService.isVisible(Parts.ACTIVITYBAR_PART)) {
        this.layoutService.setPartHidden(false, Parts.ACTIVITYBAR_PART);
      }
      this.activityBarPart.show(true);
    }
  }
  registerActions() {
    const that = this;
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: ToggleActivityBarVisibilityActionId,
          title: localize2("toggleActivityBar", "Toggle Activity Bar Visibility")
        });
      }
      run() {
        const value = that.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION) === ActivityBarPosition.HIDDEN ? that.getRememberedActivityBarVisiblePosition() : ActivityBarPosition.HIDDEN;
        return that.configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, value);
      }
    }));
  }
  toJSON() {
    return {
      type: Parts.SIDEBAR_PART
    };
  }
};
SidebarPart.activeViewletSettingsKey = "workbench.sidebar.activeviewletid";
SidebarPart = __decorateClass([
  __decorateParam(0, INotificationService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IWorkbenchLayoutService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IThemeService),
  __decorateParam(8, IViewDescriptorService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IExtensionService),
  __decorateParam(11, IConfigurationService),
  __decorateParam(12, IMenuService)
], SidebarPart);
export {
  SidebarPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxzaWRlYmFyXFxzaWRlYmFyUGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9zaWRlYmFycGFydC5jc3MnO1xuaW1wb3J0ICcuL3NpZGViYXJBY3Rpb25zLmpzJztcbmltcG9ydCB7IEFjdGl2aXR5QmFyUG9zaXRpb24sIElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBMYXlvdXRTZXR0aW5ncywgUGFydHMsIFBvc2l0aW9uIGFzIFNpZGVCYXJQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2lkZWJhckZvY3VzQ29udGV4dCwgQWN0aXZlVmlld2xldENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjb250cmFzdEJvcmRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFNJREVfQkFSX1RJVExFX0ZPUkVHUk9VTkQsIFNJREVfQkFSX1RJVExFX0JPUkRFUiwgU0lERV9CQVJfQkFDS0dST1VORCwgU0lERV9CQVJfRk9SRUdST1VORCwgU0lERV9CQVJfQk9SREVSLCBTSURFX0JBUl9EUkFHX0FORF9EUk9QX0JBQ0tHUk9VTkQsIEFDVElWSVRZX0JBUl9CQURHRV9CQUNLR1JPVU5ELCBBQ1RJVklUWV9CQVJfQkFER0VfRk9SRUdST1VORCwgQUNUSVZJVFlfQkFSX1RPUF9GT1JFR1JPVU5ELCBBQ1RJVklUWV9CQVJfVE9QX0FDVElWRV9CT1JERVIsIEFDVElWSVRZX0JBUl9UT1BfSU5BQ1RJVkVfRk9SRUdST1VORCwgQUNUSVZJVFlfQkFSX1RPUF9EUkFHX0FORF9EUk9QX0JPUkRFUiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQW5jaG9yQWxpZ25tZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvbnRleHR2aWV3L2NvbnRleHR2aWV3LmpzJztcbmltcG9ydCB7IElCb3VuZGFyeVNhc2hlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zYXNoL3Nhc2guanMnO1xuaW1wb3J0IHsgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IExheW91dFByaW9yaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2dyaWQvZ3JpZC5qcyc7XG5pbXBvcnQgeyBhc3NlcnRSZXR1cm5zRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdFBhbmVDb21wb3NpdGVQYXJ0LCBDb21wb3NpdGVCYXJQb3NpdGlvbiB9IGZyb20gJy4uL3BhbmVDb21wb3NpdGVQYXJ0LmpzJztcbmltcG9ydCB7IEFjdGl2aXR5QmFyQ29tcG9zaXRlQmFyLCBBY3Rpdml0eWJhclBhcnQgfSBmcm9tICcuLi9hY3Rpdml0eWJhci9hY3Rpdml0eWJhclBhcnQuanMnO1xuaW1wb3J0IHsgQWN0aW9uc09yaWVudGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgSG92ZXJQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJUGFuZUNvbXBvc2l0ZUJhck9wdGlvbnMgfSBmcm9tICcuLi9wYW5lQ29tcG9zaXRlQmFyLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBUb2dnbGVBY3Rpdml0eUJhclZpc2liaWxpdHlBY3Rpb25JZCB9IGZyb20gJy4uLy4uL2FjdGlvbnMvbGF5b3V0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgVmlzaWJsZVZpZXdDb250YWluZXJzVHJhY2tlciB9IGZyb20gJy4uL3Zpc2libGVWaWV3Q29udGFpbmVyc1RyYWNrZXIuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uL3BhbmVjb21wb3NpdGUuanMnO1xuXG5jb25zdCBQUklNQVJZX1NJREVfQkFSX1NBU0hfQ0xBU1MgPSAncHJpbWFyeS1zaWRlYmFyLXNhc2gnO1xuXG5leHBvcnQgY2xhc3MgU2lkZWJhclBhcnQgZXh0ZW5kcyBBYnN0cmFjdFBhbmVDb21wb3NpdGVQYXJ0IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgYWN0aXZlVmlld2xldFNldHRpbmdzS2V5ID0gJ3dvcmtiZW5jaC5zaWRlYmFyLmFjdGl2ZXZpZXdsZXRpZCc7XG5cblx0Ly8jcmVnaW9uIElWaWV3XG5cblx0cmVhZG9ubHkgbWluaW11bVdpZHRoOiBudW1iZXIgPSAxNzA7XG5cdHJlYWRvbmx5IG1heGltdW1XaWR0aDogbnVtYmVyID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuXHRyZWFkb25seSBtaW5pbXVtSGVpZ2h0OiBudW1iZXIgPSAwO1xuXHRyZWFkb25seSBtYXhpbXVtSGVpZ2h0OiBudW1iZXIgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG5cdG92ZXJyaWRlIGdldCBzbmFwKCk6IGJvb2xlYW4geyByZXR1cm4gdHJ1ZTsgfVxuXG5cdHJlYWRvbmx5IHByaW9yaXR5OiBMYXlvdXRQcmlvcml0eSA9IExheW91dFByaW9yaXR5LkxvdztcblxuXHRnZXQgcHJlZmVycmVkV2lkdGgoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB2aWV3bGV0ID0gdGhpcy5nZXRBY3RpdmVQYW5lQ29tcG9zaXRlKCk7XG5cblx0XHRpZiAoIXZpZXdsZXQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2lkdGggPSB2aWV3bGV0LmdldE9wdGltYWxXaWR0aCgpO1xuXHRcdGlmICh0eXBlb2Ygd2lkdGggIT09ICdudW1iZXInKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBNYXRoLm1heCh3aWR0aCwgMzAwKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgYWN0aXZpdHlCYXJQYXJ0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBY3Rpdml0eWJhclBhcnQsIHRoaXMubG9jYXRpb24sIHRoaXMpKTtcblx0cHJpdmF0ZSByZWFkb25seSB2aXNpYmxlVmlld0NvbnRhaW5lcnNUcmFja2VyOiBWaXNpYmxlVmlld0NvbnRhaW5lcnNUcmFja2VyO1xuXHRwcml2YXRlIHJlYWRvbmx5IHByaW1hcnlTaWRlQmFyU2FzaENsYXNzRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHQvLyNlbmRyZWdpb25cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2Ugbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0UGFydHMuU0lERUJBUl9QQVJULFxuXHRcdFx0eyBoYXNUaXRsZTogdHJ1ZSwgdHJhaWxpbmdTZXBhcmF0b3I6IGZhbHNlLCBib3JkZXJXaWR0aDogKCkgPT4gKHRoaXMuZ2V0Q29sb3IoU0lERV9CQVJfQk9SREVSKSB8fCB0aGlzLmdldENvbG9yKGNvbnRyYXN0Qm9yZGVyKSkgPyAxIDogMCB9LFxuXHRcdFx0U2lkZWJhclBhcnQuYWN0aXZlVmlld2xldFNldHRpbmdzS2V5LFxuXHRcdFx0QWN0aXZlVmlld2xldENvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKSxcblx0XHRcdFNpZGViYXJGb2N1c0NvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKSxcblx0XHRcdCdzaWRlQmFyJyxcblx0XHRcdCd2aWV3bGV0Jyxcblx0XHRcdFNJREVfQkFSX1RJVExFX0ZPUkVHUk9VTkQsXG5cdFx0XHRTSURFX0JBUl9USVRMRV9CT1JERVIsXG5cdFx0XHRWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcixcblx0XHRcdEV4dGVuc2lvbnMuVmlld2xldHMsXG5cdFx0XHRNZW51SWQuU2lkZWJhclRpdGxlLFxuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0Y29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdFx0bGF5b3V0U2VydmljZSxcblx0XHRcdGtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdFx0aG92ZXJTZXJ2aWNlLFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHR0aGVtZVNlcnZpY2UsXG5cdFx0XHR2aWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0XHRjb250ZXh0S2V5U2VydmljZSxcblx0XHRcdGV4dGVuc2lvblNlcnZpY2UsXG5cdFx0XHRtZW51U2VydmljZSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdCk7XG5cblx0XHQvLyBUcmFjayB2aXNpYmxlIHZpZXcgY29udGFpbmVycyBmb3IgYXV0by1oaWRlXG5cdFx0dGhpcy52aXNpYmxlVmlld0NvbnRhaW5lcnNUcmFja2VyID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVmlzaWJsZVZpZXdDb250YWluZXJzVHJhY2tlciwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnZpc2libGVWaWV3Q29udGFpbmVyc1RyYWNrZXIub25EaWRDaGFuZ2UoKGUpID0+IHRoaXMub25EaWRDaGFuZ2VBdXRvSGlkZVZpZXdDb250YWluZXJzKGUpKSk7XG5cblx0XHR0aGlzLnJlbWVtYmVyQWN0aXZpdHlCYXJWaXNpYmxlUG9zaXRpb24oKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT04pKSB7XG5cdFx0XHRcdHRoaXMub25EaWRDaGFuZ2VBY3Rpdml0eUJhckxvY2F0aW9uKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfQVVUT19ISURFKSkge1xuXHRcdFx0XHR0aGlzLm9uRGlkQ2hhbmdlQWN0aXZpdHlCYXJMb2NhdGlvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJBY3Rpb25zKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlQXV0b0hpZGVWaWV3Q29udGFpbmVycyhlOiB7IGJlZm9yZTogbnVtYmVyOyBhZnRlcjogbnVtYmVyIH0pOiB2b2lkIHtcblx0XHQvLyBPbmx5IHVwZGF0ZSBpZiBhdXRvLWhpZGUgaXMgZW5hYmxlZCBhbmQgY29tcG9zaXRlIGJhciBwb3NpdGlvbiBpcyB0b3AvYm90dG9tXG5cdFx0Y29uc3QgYWN0aXZpdHlCYXJQb3NpdGlvbiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8QWN0aXZpdHlCYXJQb3NpdGlvbj4oTGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0xPQ0FUSU9OKTtcblx0XHRjb25zdCBhdXRvSGlkZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0FVVE9fSElERSk7XG5cdFx0aWYgKGF1dG9IaWRlICYmIChhY3Rpdml0eUJhclBvc2l0aW9uID09PSBBY3Rpdml0eUJhclBvc2l0aW9uLlRPUCB8fCBhY3Rpdml0eUJhclBvc2l0aW9uID09PSBBY3Rpdml0eUJhclBvc2l0aW9uLkJPVFRPTSkpIHtcblx0XHRcdGNvbnN0IHZpc2libGVCZWZvcmUgPSBlLmJlZm9yZSA+IDE7XG5cdFx0XHRjb25zdCB2aXNpYmxlQWZ0ZXIgPSBlLmFmdGVyID4gMTtcblx0XHRcdGlmICh2aXNpYmxlQmVmb3JlICE9PSB2aXNpYmxlQWZ0ZXIpIHtcblx0XHRcdFx0dGhpcy5vbkRpZENoYW5nZUFjdGl2aXR5QmFyTG9jYXRpb24oKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlQWN0aXZpdHlCYXJMb2NhdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLmFjdGl2aXR5QmFyUGFydC5oaWRlKCk7XG5cblx0XHR0aGlzLnVwZGF0ZUNvbXBvc2l0ZUJhcigpO1xuXG5cdFx0Y29uc3QgaWQgPSB0aGlzLmdldEFjdGl2ZUNvbXBvc2l0ZSgpPy5nZXRJZCgpO1xuXHRcdGlmIChpZCkge1xuXHRcdFx0dGhpcy5vblRpdGxlQXJlYVVwZGF0ZShpZCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc2hvdWxkU2hvd0FjdGl2aXR5QmFyKCkpIHtcblx0XHRcdHRoaXMuYWN0aXZpdHlCYXJQYXJ0LnNob3coKTtcblx0XHR9XG5cblx0XHR0aGlzLnJlbWVtYmVyQWN0aXZpdHlCYXJWaXNpYmxlUG9zaXRpb24oKTtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZVN0eWxlcygpOiB2b2lkIHtcblx0XHRzdXBlci51cGRhdGVTdHlsZXMoKTtcblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuZ2V0Q29udGFpbmVyKCkpO1xuXG5cdFx0Y29udGFpbmVyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IHRoaXMuZ2V0Q29sb3IoU0lERV9CQVJfQkFDS0dST1VORCkgfHwgJyc7XG5cdFx0Y29udGFpbmVyLnN0eWxlLmNvbG9yID0gdGhpcy5nZXRDb2xvcihTSURFX0JBUl9GT1JFR1JPVU5EKSB8fCAnJztcblxuXHRcdGNvbnN0IGJvcmRlckNvbG9yID0gdGhpcy5nZXRDb2xvcihTSURFX0JBUl9CT1JERVIpIHx8IHRoaXMuZ2V0Q29sb3IoY29udHJhc3RCb3JkZXIpO1xuXHRcdGNvbnN0IGlzUG9zaXRpb25MZWZ0ID0gdGhpcy5sYXlvdXRTZXJ2aWNlLmdldFNpZGVCYXJQb3NpdGlvbigpID09PSBTaWRlQmFyUG9zaXRpb24uTEVGVDtcblx0XHRjb250YWluZXIuc3R5bGUuYm9yZGVyUmlnaHRXaWR0aCA9IGJvcmRlckNvbG9yICYmIGlzUG9zaXRpb25MZWZ0ID8gJzFweCcgOiAnJztcblx0XHRjb250YWluZXIuc3R5bGUuYm9yZGVyUmlnaHRTdHlsZSA9IGJvcmRlckNvbG9yICYmIGlzUG9zaXRpb25MZWZ0ID8gJ3NvbGlkJyA6ICcnO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5ib3JkZXJSaWdodENvbG9yID0gaXNQb3NpdGlvbkxlZnQgPyBib3JkZXJDb2xvciB8fCAnJyA6ICcnO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5ib3JkZXJMZWZ0V2lkdGggPSBib3JkZXJDb2xvciAmJiAhaXNQb3NpdGlvbkxlZnQgPyAnMXB4JyA6ICcnO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5ib3JkZXJMZWZ0U3R5bGUgPSBib3JkZXJDb2xvciAmJiAhaXNQb3NpdGlvbkxlZnQgPyAnc29saWQnIDogJyc7XG5cdFx0Y29udGFpbmVyLnN0eWxlLmJvcmRlckxlZnRDb2xvciA9ICFpc1Bvc2l0aW9uTGVmdCA/IGJvcmRlckNvbG9yIHx8ICcnIDogJyc7XG5cdFx0Y29udGFpbmVyLnN0eWxlLm91dGxpbmVDb2xvciA9IHRoaXMuZ2V0Q29sb3IoU0lERV9CQVJfRFJBR19BTkRfRFJPUF9CQUNLR1JPVU5EKSA/PyAnJztcblx0fVxuXG5cdG92ZXJyaWRlIGxheW91dCh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgdG9wOiBudW1iZXIsIGxlZnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5TSURFQkFSX1BBUlQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0c3VwZXIubGF5b3V0KHdpZHRoLCBoZWlnaHQsIHRvcCwgbGVmdCk7XG5cdH1cblxuXHRvdmVycmlkZSBzZXRCb3VuZGFyeVNhc2hlcyhzYXNoZXM6IElCb3VuZGFyeVNhc2hlcyk6IHZvaWQge1xuXHRcdHN1cGVyLnNldEJvdW5kYXJ5U2FzaGVzPy4oc2FzaGVzKTtcblxuXHRcdHRoaXMucHJpbWFyeVNpZGVCYXJTYXNoQ2xhc3NEaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0Y29uc3QgcHJpbWFyeVNpZGVCYXJTYXNoID0gdGhpcy5sYXlvdXRTZXJ2aWNlLmdldFNpZGVCYXJQb3NpdGlvbigpID09PSBTaWRlQmFyUG9zaXRpb24uTEVGVCA/IHNhc2hlcy5yaWdodCA6IHNhc2hlcy5sZWZ0O1xuXHRcdHRoaXMucHJpbWFyeVNpZGVCYXJTYXNoQ2xhc3NEaXNwb3NhYmxlLnZhbHVlID0gcHJpbWFyeVNpZGVCYXJTYXNoPy5hZGRDbGFzcyhQUklNQVJZX1NJREVfQkFSX1NBU0hfQ0xBU1MpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldFRpdGxlQXJlYURyb3BEb3duQW5jaG9yQWxpZ25tZW50KCk6IEFuY2hvckFsaWdubWVudCB7XG5cdFx0cmV0dXJuIHRoaXMubGF5b3V0U2VydmljZS5nZXRTaWRlQmFyUG9zaXRpb24oKSA9PT0gU2lkZUJhclBvc2l0aW9uLkxFRlQgPyBBbmNob3JBbGlnbm1lbnQuTEVGVCA6IEFuY2hvckFsaWdubWVudC5SSUdIVDtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjcmVhdGVDb21wb3NpdGVCYXIoKTogQWN0aXZpdHlCYXJDb21wb3NpdGVCYXIge1xuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFjdGl2aXR5QmFyQ29tcG9zaXRlQmFyLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhciwgdGhpcy5nZXRDb21wb3NpdGVCYXJPcHRpb25zKCksIHRoaXMucGFydElkLCB0aGlzLCBmYWxzZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0Q29tcG9zaXRlQmFyT3B0aW9ucygpOiBJUGFuZUNvbXBvc2l0ZUJhck9wdGlvbnMge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwYXJ0Q29udGFpbmVyQ2xhc3M6ICdzaWRlYmFyJyxcblx0XHRcdHBpbm5lZFZpZXdDb250YWluZXJzS2V5OiBBY3Rpdml0eWJhclBhcnQucGlubmVkVmlld0NvbnRhaW5lcnNLZXksXG5cdFx0XHRwbGFjZWhvbGRlclZpZXdDb250YWluZXJzS2V5OiBBY3Rpdml0eWJhclBhcnQucGxhY2Vob2xkZXJWaWV3Q29udGFpbmVyc0tleSxcblx0XHRcdHZpZXdDb250YWluZXJzV29ya3NwYWNlU3RhdGVLZXk6IEFjdGl2aXR5YmFyUGFydC52aWV3Q29udGFpbmVyc1dvcmtzcGFjZVN0YXRlS2V5LFxuXHRcdFx0aWNvbjogdHJ1ZSxcblx0XHRcdG9yaWVudGF0aW9uOiBBY3Rpb25zT3JpZW50YXRpb24uSE9SSVpPTlRBTCxcblx0XHRcdHJlY29tcHV0ZVNpemVzOiB0cnVlLFxuXHRcdFx0YWN0aXZpdHlIb3Zlck9wdGlvbnM6IHtcblx0XHRcdFx0cG9zaXRpb246ICgpID0+IHRoaXMuZ2V0Q29tcG9zaXRlQmFyUG9zaXRpb24oKSA9PT0gQ29tcG9zaXRlQmFyUG9zaXRpb24uQk9UVE9NID8gSG92ZXJQb3NpdGlvbi5BQk9WRSA6IEhvdmVyUG9zaXRpb24uQkVMT1csXG5cdFx0XHR9LFxuXHRcdFx0ZmlsbEV4dHJhQ29udGV4dE1lbnVBY3Rpb25zOiBhY3Rpb25zID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuZ2V0Q29tcG9zaXRlQmFyUG9zaXRpb24oKSA9PT0gQ29tcG9zaXRlQmFyUG9zaXRpb24uVElUTEUpIHtcblx0XHRcdFx0XHRjb25zdCB2aWV3c1N1Ym1lbnVBY3Rpb24gPSB0aGlzLmdldFZpZXdzU3VibWVudUFjdGlvbigpO1xuXHRcdFx0XHRcdGlmICh2aWV3c1N1Ym1lbnVBY3Rpb24pIHtcblx0XHRcdFx0XHRcdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdFx0XHRcdFx0YWN0aW9ucy5wdXNoKHZpZXdzU3VibWVudUFjdGlvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Y29tcG9zaXRlU2l6ZTogMCxcblx0XHRcdGljb25TaXplOiAxNixcblx0XHRcdG92ZXJmbG93QWN0aW9uU2l6ZTogMzAsXG5cdFx0XHRjb2xvcnM6IHRoZW1lID0+ICh7XG5cdFx0XHRcdGFjdGl2ZUJhY2tncm91bmRDb2xvcjogdGhlbWUuZ2V0Q29sb3IoU0lERV9CQVJfQkFDS0dST1VORCksXG5cdFx0XHRcdGluYWN0aXZlQmFja2dyb3VuZENvbG9yOiB0aGVtZS5nZXRDb2xvcihTSURFX0JBUl9CQUNLR1JPVU5EKSxcblx0XHRcdFx0YWN0aXZlQm9yZGVyQm90dG9tQ29sb3I6IHRoZW1lLmdldENvbG9yKEFDVElWSVRZX0JBUl9UT1BfQUNUSVZFX0JPUkRFUiksXG5cdFx0XHRcdGFjdGl2ZUZvcmVncm91bmRDb2xvcjogdGhlbWUuZ2V0Q29sb3IoQUNUSVZJVFlfQkFSX1RPUF9GT1JFR1JPVU5EKSxcblx0XHRcdFx0aW5hY3RpdmVGb3JlZ3JvdW5kQ29sb3I6IHRoZW1lLmdldENvbG9yKEFDVElWSVRZX0JBUl9UT1BfSU5BQ1RJVkVfRk9SRUdST1VORCksXG5cdFx0XHRcdGJhZGdlQmFja2dyb3VuZDogdGhlbWUuZ2V0Q29sb3IoQUNUSVZJVFlfQkFSX0JBREdFX0JBQ0tHUk9VTkQpLFxuXHRcdFx0XHRiYWRnZUZvcmVncm91bmQ6IHRoZW1lLmdldENvbG9yKEFDVElWSVRZX0JBUl9CQURHRV9GT1JFR1JPVU5EKSxcblx0XHRcdFx0ZHJhZ0FuZERyb3BCb3JkZXI6IHRoZW1lLmdldENvbG9yKEFDVElWSVRZX0JBUl9UT1BfRFJBR19BTkRfRFJPUF9CT1JERVIpXG5cdFx0XHR9KSxcblx0XHRcdGNvbXBhY3Q6IHRydWVcblx0XHR9O1xuXHR9XG5cblx0cHJvdGVjdGVkIHNob3VsZFNob3dDb21wb3NpdGVCYXIoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgYWN0aXZpdHlCYXJQb3NpdGlvbiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8QWN0aXZpdHlCYXJQb3NpdGlvbj4oTGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0xPQ0FUSU9OKTtcblx0XHRpZiAoYWN0aXZpdHlCYXJQb3NpdGlvbiAhPT0gQWN0aXZpdHlCYXJQb3NpdGlvbi5UT1AgJiYgYWN0aXZpdHlCYXJQb3NpdGlvbiAhPT0gQWN0aXZpdHlCYXJQb3NpdGlvbi5CT1RUT00pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiBhdXRvLWhpZGUgaXMgZW5hYmxlZCBhbmQgdGhlcmUncyBvbmx5IG9uZSB2aXNpYmxlIHZpZXcgY29udGFpbmVyXG5cdFx0Y29uc3QgYXV0b0hpZGUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9BVVRPX0hJREUpO1xuXHRcdGlmIChhdXRvSGlkZSkge1xuXHRcdFx0Ly8gVXNlIHZpc2libGUgY29tcG9zaXRlIGNvdW50IGZyb20gdGhlIGNvbXBvc2l0ZSBiYXIgaWYgYXZhaWxhYmxlIChjb25zaWRlcnMgcGlubmVkIHN0YXRlKSxcblx0XHRcdC8vIG90aGVyd2lzZSBmYWxsIGJhY2sgdG8gdGhlIHRyYWNrZXIncyBjb3VudCAoYmFzZWQgb24gYWN0aXZlIHZpZXcgZGVzY3JpcHRvcnMpLlxuXHRcdFx0Ly8gTm90ZTogV2UgYWNjZXNzIHBhbmVDb21wb3NpdGVCYXIgZGlyZWN0bHkgdG8gYXZvaWQgY2lyY3VsYXIgY2FsbHMgd2l0aCBnZXRWaXNpYmxlUGFuZUNvbXBvc2l0ZUlkcygpXG5cdFx0XHRjb25zdCB2aXNpYmxlQ291bnQgPSB0aGlzLnZpc2libGVWaWV3Q29udGFpbmVyc1RyYWNrZXIudmlzaWJsZUNvdW50O1xuXHRcdFx0aWYgKHZpc2libGVDb3VudCA8PSAxKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkU2hvd0FjdGl2aXR5QmFyKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLnNob3VsZFNob3dDb21wb3NpdGVCYXIoKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9MT0NBVElPTikgIT09IEFjdGl2aXR5QmFyUG9zaXRpb24uSElEREVOO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldENvbXBvc2l0ZUJhclBvc2l0aW9uKCk6IENvbXBvc2l0ZUJhclBvc2l0aW9uIHtcblx0XHRjb25zdCBhY3Rpdml0eUJhclBvc2l0aW9uID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxBY3Rpdml0eUJhclBvc2l0aW9uPihMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT04pO1xuXHRcdHN3aXRjaCAoYWN0aXZpdHlCYXJQb3NpdGlvbikge1xuXHRcdFx0Y2FzZSBBY3Rpdml0eUJhclBvc2l0aW9uLlRPUDogcmV0dXJuIENvbXBvc2l0ZUJhclBvc2l0aW9uLlRPUDtcblx0XHRcdGNhc2UgQWN0aXZpdHlCYXJQb3NpdGlvbi5CT1RUT006IHJldHVybiBDb21wb3NpdGVCYXJQb3NpdGlvbi5CT1RUT007XG5cdFx0XHRjYXNlIEFjdGl2aXR5QmFyUG9zaXRpb24uSElEREVOOlxuXHRcdFx0Y2FzZSBBY3Rpdml0eUJhclBvc2l0aW9uLkRFRkFVTFQ6IC8vIG5vb3Bcblx0XHRcdGRlZmF1bHQ6IHJldHVybiBDb21wb3NpdGVCYXJQb3NpdGlvbi5USVRMRTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbWVtYmVyQWN0aXZpdHlCYXJWaXNpYmxlUG9zaXRpb24oKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aXZpdHlCYXJQb3NpdGlvbiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT04pO1xuXHRcdGlmIChhY3Rpdml0eUJhclBvc2l0aW9uICE9PSBBY3Rpdml0eUJhclBvc2l0aW9uLkhJRERFTikge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT04sIGFjdGl2aXR5QmFyUG9zaXRpb24sIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0UmVtZW1iZXJlZEFjdGl2aXR5QmFyVmlzaWJsZVBvc2l0aW9uKCk6IEFjdGl2aXR5QmFyUG9zaXRpb24ge1xuXHRcdGNvbnN0IGFjdGl2aXR5QmFyUG9zaXRpb24gPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT04sIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRzd2l0Y2ggKGFjdGl2aXR5QmFyUG9zaXRpb24pIHtcblx0XHRcdGNhc2UgQWN0aXZpdHlCYXJQb3NpdGlvbi5UT1A6IHJldHVybiBBY3Rpdml0eUJhclBvc2l0aW9uLlRPUDtcblx0XHRcdGNhc2UgQWN0aXZpdHlCYXJQb3NpdGlvbi5CT1RUT006IHJldHVybiBBY3Rpdml0eUJhclBvc2l0aW9uLkJPVFRPTTtcblx0XHRcdGRlZmF1bHQ6IHJldHVybiBBY3Rpdml0eUJhclBvc2l0aW9uLkRFRkFVTFQ7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0UGlubmVkUGFuZUNvbXBvc2l0ZUlkcygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuc2hvdWxkU2hvd0NvbXBvc2l0ZUJhcigpID8gc3VwZXIuZ2V0UGlubmVkUGFuZUNvbXBvc2l0ZUlkcygpIDogdGhpcy5hY3Rpdml0eUJhclBhcnQuZ2V0UGlubmVkUGFuZUNvbXBvc2l0ZUlkcygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0VmlzaWJsZVBhbmVDb21wb3NpdGVJZHMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLnNob3VsZFNob3dDb21wb3NpdGVCYXIoKSA/IHN1cGVyLmdldFZpc2libGVQYW5lQ29tcG9zaXRlSWRzKCkgOiB0aGlzLmFjdGl2aXR5QmFyUGFydC5nZXRWaXNpYmxlUGFuZUNvbXBvc2l0ZUlkcygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0UGFuZUNvbXBvc2l0ZUlkcygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuc2hvdWxkU2hvd0NvbXBvc2l0ZUJhcigpID8gc3VwZXIuZ2V0UGFuZUNvbXBvc2l0ZUlkcygpIDogdGhpcy5hY3Rpdml0eUJhclBhcnQuZ2V0UGFuZUNvbXBvc2l0ZUlkcygpO1xuXHR9XG5cblx0YXN5bmMgZm9jdXNBY3Rpdml0eUJhcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT04pID09PSBBY3Rpdml0eUJhclBvc2l0aW9uLkhJRERFTikge1xuXHRcdFx0YXdhaXQgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT04sIHRoaXMuZ2V0UmVtZW1iZXJlZEFjdGl2aXR5QmFyVmlzaWJsZVBvc2l0aW9uKCkpO1xuXG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlQWN0aXZpdHlCYXJMb2NhdGlvbigpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnNob3VsZFNob3dDb21wb3NpdGVCYXIoKSkge1xuXHRcdFx0dGhpcy5mb2N1c0NvbXBvc2l0ZUJhcigpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoIXRoaXMubGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuQUNUSVZJVFlCQVJfUEFSVCkpIHtcblx0XHRcdFx0dGhpcy5sYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4oZmFsc2UsIFBhcnRzLkFDVElWSVRZQkFSX1BBUlQpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmFjdGl2aXR5QmFyUGFydC5zaG93KHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJBY3Rpb25zKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogVG9nZ2xlQWN0aXZpdHlCYXJWaXNpYmlsaXR5QWN0aW9uSWQsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMigndG9nZ2xlQWN0aXZpdHlCYXInLCBcIlRvZ2dsZSBBY3Rpdml0eSBCYXIgVmlzaWJpbGl0eVwiKSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gdGhhdC5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT04pID09PSBBY3Rpdml0eUJhclBvc2l0aW9uLkhJRERFTiA/IHRoYXQuZ2V0UmVtZW1iZXJlZEFjdGl2aXR5QmFyVmlzaWJsZVBvc2l0aW9uKCkgOiBBY3Rpdml0eUJhclBvc2l0aW9uLkhJRERFTjtcblx0XHRcdFx0cmV0dXJuIHRoYXQuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoTGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0xPQ0FUSU9OLCB2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0dG9KU09OKCk6IG9iamVjdCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6IFBhcnRzLlNJREVCQVJfUEFSVFxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLE9BQU87QUFDUCxTQUFTLHFCQUFxQix5QkFBeUIsZ0JBQWdCLE9BQU8sWUFBWSx1QkFBdUI7QUFDakgsU0FBUyxxQkFBcUIsNEJBQTRCO0FBQzFELFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFC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
