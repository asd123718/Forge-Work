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
import "./media/paneCompositePart.css";
import { Event } from "../../../base/common/event.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { IViewDescriptorService } from "../../common/views.js";
import { DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { IWorkbenchLayoutService, Parts, getFloatingOuterGutterEdges, getFloatingPaneCompositeHorizontalMargins, getFloatingPaneCompositeVerticalMargins } from "../../services/layout/browser/layoutService.js";
import { CompositePart } from "./compositePart.js";
import { PaneCompositeBar } from "./paneCompositeBar.js";
import { Dimension, EventHelper, trackFocus, $, addDisposableListener, EventType, prepend, getWindow } from "../../../base/browser/dom.js";
import { Registry } from "../../../platform/registry/common/platform.js";
import { INotificationService } from "../../../platform/notification/common/notification.js";
import { IStorageService } from "../../../platform/storage/common/storage.js";
import { IContextMenuService } from "../../../platform/contextview/browser/contextView.js";
import { IKeybindingService } from "../../../platform/keybinding/common/keybinding.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
import { IContextKeyService } from "../../../platform/contextkey/common/contextkey.js";
import { IExtensionService } from "../../services/extensions/common/extensions.js";
import { localize } from "../../../nls.js";
import { CompositeDragAndDropObserver, toggleDropEffect } from "../dnd.js";
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from "../../common/theme.js";
import { IMenuService } from "../../../platform/actions/common/actions.js";
import { ActionsOrientation } from "../../../base/browser/ui/actionbar/actionbar.js";
import { Gesture, EventType as GestureEventType } from "../../../base/browser/touch.js";
import { StandardMouseEvent } from "../../../base/browser/mouseEvent.js";
import { SubmenuAction } from "../../../base/common/actions.js";
import { ViewsSubMenu } from "./views/viewPaneContainer.js";
import { getActionBarActions } from "../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IHoverService } from "../../../platform/hover/browser/hover.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../platform/actions/browser/toolbar.js";
import { DeferredPromise } from "../../../base/common/async.js";
var CompositeBarPosition = /* @__PURE__ */ ((CompositeBarPosition2) => {
  CompositeBarPosition2[CompositeBarPosition2["TOP"] = 0] = "TOP";
  CompositeBarPosition2[CompositeBarPosition2["TITLE"] = 1] = "TITLE";
  CompositeBarPosition2[CompositeBarPosition2["BOTTOM"] = 2] = "BOTTOM";
  return CompositeBarPosition2;
})(CompositeBarPosition || {});
let AbstractPaneCompositePart = class extends CompositePart {
  constructor(partId, partOptions, activePaneCompositeSettingsKey, activePaneContextKey, paneFocusContextKey, nameForTelemetry, compositeCSSClass, titleForegroundColor, titleBorderColor, location, registryId, globalActionsMenuId, notificationService, storageService, contextMenuService, layoutService, keybindingService, hoverService, instantiationService, themeService, viewDescriptorService, contextKeyService, extensionService, menuService, configurationService) {
    super(
      notificationService,
      storageService,
      contextMenuService,
      layoutService,
      keybindingService,
      hoverService,
      instantiationService,
      themeService,
      Registry.as(registryId),
      activePaneCompositeSettingsKey,
      viewDescriptorService.getDefaultViewContainer(location)?.id || "",
      nameForTelemetry,
      compositeCSSClass,
      titleForegroundColor,
      titleBorderColor,
      partId,
      partOptions
    );
    this.partId = partId;
    this.activePaneContextKey = activePaneContextKey;
    this.paneFocusContextKey = paneFocusContextKey;
    this.location = location;
    this.registryId = registryId;
    this.globalActionsMenuId = globalActionsMenuId;
    this.viewDescriptorService = viewDescriptorService;
    this.contextKeyService = contextKeyService;
    this.extensionService = extensionService;
    this.menuService = menuService;
    this.configurationService = configurationService;
    this.onDidPaneCompositeClose = this.onDidCompositeClose.event;
    this.headerFooterCompositeBarDispoables = this._register(new DisposableStore());
    this.paneCompositeBar = this._register(new MutableDisposable());
    this.compositeBarPosition = void 0;
    this.blockOpening = void 0;
    this.registerListeners();
  }
  get snap() {
    return this.layoutService.isVisible(this.partId) || !!this.paneCompositeBar.value?.getVisiblePaneCompositeIds().length;
  }
  get onDidPaneCompositeOpen() {
    return Event.map(this.onDidCompositeOpen.event, (compositeEvent) => compositeEvent.composite);
  }
  registerListeners() {
    this._register(this.onDidPaneCompositeOpen((composite) => this.onDidOpen(composite)));
    this._register(this.onDidPaneCompositeClose(this.onDidClose, this));
    this._register(this.registry.onDidDeregister((viewletDescriptor) => {
      const activeContainers = this.viewDescriptorService.getViewContainersByLocation(this.location).filter((container) => this.viewDescriptorService.getViewContainerModel(container).activeViewDescriptors.length > 0);
      if (activeContainers.length) {
        if (this.getActiveComposite()?.getId() === viewletDescriptor.id) {
          const defaultViewletId = this.viewDescriptorService.getDefaultViewContainer(this.location)?.id;
          const containerToOpen = activeContainers.filter((c) => c.id === defaultViewletId)[0] || activeContainers[0];
          this.doOpenPaneComposite(containerToOpen.id);
        }
      } else {
        this.layoutService.setPartHidden(true, this.partId);
      }
      this.removeComposite(viewletDescriptor.id);
    }));
    this._register(this.extensionService.onDidRegisterExtensions(() => {
      this.layoutCompositeBar();
    }));
  }
  onDidOpen(composite) {
    const compositeId = composite.getId();
    this.activePaneContextKey.set(compositeId);
    this.element.dataset.activeComposite = compositeId;
  }
  onDidClose(composite) {
    const id = composite.getId();
    if (this.activePaneContextKey.get() === id) {
      this.activePaneContextKey.reset();
      delete this.element.dataset.activeComposite;
    }
  }
  showComposite(composite) {
    super.showComposite(composite);
    this.layoutCompositeBar();
    this.layoutEmptyMessage();
  }
  hideActiveComposite() {
    const composite = super.hideActiveComposite();
    this.layoutCompositeBar();
    this.layoutEmptyMessage();
    return composite;
  }
  create(parent) {
    this.element = parent;
    this.element.classList.add("pane-composite-part");
    super.create(parent);
    if (this.contentArea) {
      this.createEmptyPaneMessage(this.contentArea);
    }
    this.updateCompositeBar();
    const focusTracker = this._register(trackFocus(parent));
    this._register(focusTracker.onDidFocus(() => this.paneFocusContextKey.set(true)));
    this._register(focusTracker.onDidBlur(() => this.paneFocusContextKey.set(false)));
  }
  createEmptyPaneMessage(parent) {
    this.emptyPaneMessageElement = $(".empty-pane-message-area");
    const messageElement = $(".empty-pane-message");
    messageElement.textContent = localize("pane.emptyMessage", "Drag a view here to display.");
    this.emptyPaneMessageElement.appendChild(messageElement);
    parent.appendChild(this.emptyPaneMessageElement);
    const setDropBackgroundFeedback = (visible) => {
      const updateActivityBarBackground = !this.getActiveComposite() || !visible;
      const backgroundColor = visible ? this.theme.getColor(EDITOR_DRAG_AND_DROP_BACKGROUND)?.toString() || "" : "";
      if (this.titleContainer && updateActivityBarBackground) {
        this.titleContainer.style.backgroundColor = backgroundColor;
      }
      if (this.headerFooterCompositeBarContainer && updateActivityBarBackground) {
        this.headerFooterCompositeBarContainer.style.backgroundColor = backgroundColor;
      }
      this.emptyPaneMessageElement.style.backgroundColor = backgroundColor;
    };
    if (this.viewDescriptorService.canMoveViews()) {
      this._register(CompositeDragAndDropObserver.INSTANCE.registerTarget(this.element, {
        onDragOver: (e) => {
          EventHelper.stop(e.eventData, true);
          if (this.paneCompositeBar.value) {
            const validDropTarget = this.paneCompositeBar.value.dndHandler.onDragEnter(e.dragAndDropData, void 0, e.eventData);
            toggleDropEffect(e.eventData.dataTransfer, "move", validDropTarget);
          }
        },
        onDragEnter: (e) => {
          EventHelper.stop(e.eventData, true);
          if (this.paneCompositeBar.value) {
            const validDropTarget = this.paneCompositeBar.value.dndHandler.onDragEnter(e.dragAndDropData, void 0, e.eventData);
            setDropBackgroundFeedback(validDropTarget);
          }
        },
        onDragLeave: (e) => {
          EventHelper.stop(e.eventData, true);
          setDropBackgroundFeedback(false);
        },
        onDragEnd: (e) => {
          EventHelper.stop(e.eventData, true);
          setDropBackgroundFeedback(false);
        },
        onDrop: (e) => {
          EventHelper.stop(e.eventData, true);
          setDropBackgroundFeedback(false);
          if (this.paneCompositeBar.value) {
            this.paneCompositeBar.value.dndHandler.drop(e.dragAndDropData, void 0, e.eventData);
          } else {
            const dragData = e.dragAndDropData.getData();
            if (dragData.type === "composite") {
              const currentContainer = this.viewDescriptorService.getViewContainerById(dragData.id);
              this.viewDescriptorService.moveViewContainerToLocation(currentContainer, this.location, void 0, "dnd");
              this.openPaneComposite(currentContainer.id, true);
            } else if (dragData.type === "view") {
              const viewToMove = this.viewDescriptorService.getViewDescriptorById(dragData.id);
              if (viewToMove.canMoveView) {
                this.viewDescriptorService.moveViewToLocation(viewToMove, this.location, "dnd");
                const newContainer = this.viewDescriptorService.getViewContainerByViewId(viewToMove.id);
                this.openPaneComposite(newContainer.id, true).then((composite) => {
                  composite?.openView(viewToMove.id, true);
                });
              }
            }
          }
        }
      }));
    }
  }
  createTitleArea(parent) {
    const titleArea = super.createTitleArea(parent);
    if (!titleArea) {
      return void 0;
    }
    this._register(addDisposableListener(titleArea, EventType.CONTEXT_MENU, (e) => {
      this.onTitleAreaContextMenu(new StandardMouseEvent(getWindow(titleArea), e));
    }));
    this._register(Gesture.addTarget(titleArea));
    this._register(addDisposableListener(titleArea, GestureEventType.Contextmenu, (e) => {
      this.onTitleAreaContextMenu(new StandardMouseEvent(getWindow(titleArea), e));
    }));
    const globalTitleActionsContainer = titleArea.appendChild($(".global-actions"));
    this.globalToolBar = this._register(this.instantiationService.createInstance(
      MenuWorkbenchToolBar,
      globalTitleActionsContainer,
      this.globalActionsMenuId,
      {
        actionViewItemProvider: (action, options) => this.actionViewItemProvider(action, options),
        orientation: ActionsOrientation.HORIZONTAL,
        getKeyBinding: (action) => this.keybindingService.lookupKeybinding(action.id),
        anchorAlignmentProvider: () => this.getTitleAreaDropDownAnchorAlignment(),
        toggleMenuTitle: localize("moreActions", "More Actions..."),
        hoverDelegate: this.toolbarHoverDelegate,
        hiddenItemStrategy: HiddenItemStrategy.NoHide,
        highlightToggledItems: true,
        telemetrySource: this.nameForTelemetry
      }
    ));
    return titleArea;
  }
  createTitleLabel(parent) {
    this.titleContainer = parent;
    const titleLabel = super.createTitleLabel(parent);
    this.titleLabelElement.draggable = this.viewDescriptorService.canMoveViews();
    const draggedItemProvider = () => {
      const activeViewlet = this.getActivePaneComposite();
      return { type: "composite", id: activeViewlet.getId() };
    };
    this._register(CompositeDragAndDropObserver.INSTANCE.registerDraggable(this.titleLabelElement, draggedItemProvider, {}));
    return titleLabel;
  }
  updateCompositeBar(updateCompositeBarOption = false) {
    const wasCompositeBarVisible = this.compositeBarPosition !== void 0;
    const isCompositeBarVisible = this.shouldShowCompositeBar();
    const previousPosition = this.compositeBarPosition;
    const newPosition = isCompositeBarVisible ? this.getCompositeBarPosition() : void 0;
    if (!updateCompositeBarOption && previousPosition === newPosition) {
      return;
    }
    if (wasCompositeBarVisible) {
      const previousCompositeBarContainer = previousPosition === 1 /* TITLE */ ? this.titleContainer : this.headerFooterCompositeBarContainer;
      if (!this.paneCompositeBarContainer || !this.paneCompositeBar.value || !previousCompositeBarContainer) {
        throw new Error("Composite bar containers should exist when removing the previous composite bar");
      }
      this.paneCompositeBarContainer.remove();
      this.paneCompositeBarContainer = void 0;
      this.paneCompositeBar.value = void 0;
      previousCompositeBarContainer.classList.remove("has-composite-bar");
      if (previousPosition === 0 /* TOP */) {
        this.removeFooterHeaderArea(true);
      } else if (previousPosition === 2 /* BOTTOM */) {
        this.removeFooterHeaderArea(false);
      }
    }
    let newCompositeBarContainer;
    switch (newPosition) {
      case 0 /* TOP */:
        newCompositeBarContainer = this.createHeaderArea();
        break;
      case 1 /* TITLE */:
        newCompositeBarContainer = this.titleContainer;
        break;
      case 2 /* BOTTOM */:
        newCompositeBarContainer = this.createFooterArea();
        break;
    }
    if (isCompositeBarVisible) {
      if (this.paneCompositeBarContainer || this.paneCompositeBar.value || !newCompositeBarContainer) {
        throw new Error("Invalid composite bar state when creating the new composite bar");
      }
      newCompositeBarContainer.classList.add("has-composite-bar");
      this.paneCompositeBarContainer = prepend(newCompositeBarContainer, $(".composite-bar-container"));
      this.paneCompositeBar.value = this.createCompositeBar();
      this.paneCompositeBar.value.create(this.paneCompositeBarContainer);
      if (newPosition === 0 /* TOP */) {
        this.setHeaderArea(newCompositeBarContainer);
      } else if (newPosition === 2 /* BOTTOM */) {
        this.setFooterArea(newCompositeBarContainer);
      }
    }
    this.compositeBarPosition = newPosition;
    if (updateCompositeBarOption) {
      this.layoutCompositeBar();
    }
  }
  createHeaderArea() {
    const headerArea = super.createHeaderArea();
    return this.createHeaderFooterCompositeBarArea(headerArea);
  }
  createFooterArea() {
    const footerArea = super.createFooterArea();
    return this.createHeaderFooterCompositeBarArea(footerArea);
  }
  createHeaderFooterCompositeBarArea(area) {
    if (this.headerFooterCompositeBarContainer) {
      throw new Error("Header or Footer composite bar already exists");
    }
    this.headerFooterCompositeBarContainer = area;
    this.headerFooterCompositeBarDispoables.add(addDisposableListener(area, EventType.CONTEXT_MENU, (e) => {
      this.onCompositeBarAreaContextMenu(new StandardMouseEvent(getWindow(area), e));
    }));
    this.headerFooterCompositeBarDispoables.add(Gesture.addTarget(area));
    this.headerFooterCompositeBarDispoables.add(addDisposableListener(area, GestureEventType.Contextmenu, (e) => {
      this.onCompositeBarAreaContextMenu(new StandardMouseEvent(getWindow(area), e));
    }));
    return area;
  }
  removeFooterHeaderArea(header) {
    this.headerFooterCompositeBarContainer = void 0;
    this.headerFooterCompositeBarDispoables.clear();
    if (header) {
      this.removeHeaderArea();
    } else {
      this.removeFooterArea();
    }
  }
  createCompositeBar() {
    return this.instantiationService.createInstance(PaneCompositeBar, this.location, this.getCompositeBarOptions(), this.partId, this);
  }
  onTitleAreaUpdate(compositeId) {
    super.onTitleAreaUpdate(compositeId);
    this.layoutCompositeBar();
  }
  async openPaneComposite(id, focus) {
    if (typeof id === "string" && this.getPaneComposite(id)) {
      return this.doOpenPaneComposite(id, focus);
    }
    await this.extensionService.whenInstalledExtensionsRegistered();
    if (typeof id === "string" && this.getPaneComposite(id)) {
      return this.doOpenPaneComposite(id, focus);
    }
    return void 0;
  }
  async doOpenPaneComposite(id, focus) {
    if (this.blockOpening) {
      return this.blockOpening.p;
    }
    let blockOpening;
    if (!this.layoutService.isVisible(this.partId)) {
      try {
        blockOpening = this.blockOpening = new DeferredPromise();
        this.layoutService.setPartHidden(false, this.partId);
      } finally {
        this.blockOpening = void 0;
      }
    }
    try {
      const result = this.openComposite(id, focus);
      blockOpening?.complete(result);
      return result;
    } catch (error) {
      blockOpening?.error(error);
      throw error;
    }
  }
  getPaneComposite(id) {
    return this.registry.getPaneComposite(id);
  }
  getPaneComposites() {
    return this.registry.getPaneComposites().sort((v1, v2) => {
      if (typeof v1.order !== "number") {
        return 1;
      }
      if (typeof v2.order !== "number") {
        return -1;
      }
      return v1.order - v2.order;
    });
  }
  getPinnedPaneCompositeIds() {
    return this.paneCompositeBar.value?.getPinnedPaneCompositeIds() ?? [];
  }
  getVisiblePaneCompositeIds() {
    return this.paneCompositeBar.value?.getVisiblePaneCompositeIds() ?? [];
  }
  getPaneCompositeIds() {
    return this.paneCompositeBar.value?.getPaneCompositeIds() ?? [];
  }
  getActivePaneComposite() {
    return this.getActiveComposite();
  }
  getLastActivePaneCompositeId() {
    return this.getLastActiveCompositeId();
  }
  hideActivePaneComposite() {
    if (this.layoutService.isVisible(this.partId)) {
      this.layoutService.setPartHidden(true, this.partId);
    }
    this.hideActiveComposite();
  }
  focusCompositeBar() {
    this.paneCompositeBar.value?.focus();
  }
  layout(width, height, top, left) {
    if (!this.layoutService.isVisible(this.partId)) {
      return;
    }
    this.floatingLayoutDimension = new Dimension(width, height);
    const floatingInset = this.getFloatingInset();
    if (floatingInset.width > 0 || floatingInset.height > 0) {
      width = Math.max(0, width - floatingInset.width);
      height = Math.max(0, height - floatingInset.height);
    }
    this.contentDimension = new Dimension(width, height);
    const outerGutter = this.getFloatingOuterGutterEdges();
    this.element.classList.toggle("floating-part-outer-left", outerGutter.left);
    this.element.classList.toggle("floating-part-outer-right", outerGutter.right);
    if (this.partId === Parts.PANEL_PART) {
      const workbenchContainer = this.layoutService.getContainer(getWindow(this.element));
      workbenchContainer.classList.toggle("floating-panel-outer-left", outerGutter.left);
      workbenchContainer.classList.toggle("floating-panel-outer-right", outerGutter.right);
    }
    super.layout(this.contentDimension.width, this.contentDimension.height, top, left);
    this.layoutCompositeBar();
    this.layoutEmptyMessage();
  }
  /**
   * The window edges on which this part is the outermost floating card and therefore
   * adopts a doubled outer gutter, so its contents do not hug the window edge. Applies
   * to the primary side bar, the secondary side bar and the panel; a horizontal panel
   * can own both edges at once.
   */
  getFloatingOuterGutterEdges() {
    return getFloatingOuterGutterEdges(this.layoutService, this.partId);
  }
  getRelayoutDimension() {
    return this.floatingLayoutDimension ?? super.getRelayoutDimension();
  }
  /**
   * Amount (in pixels) to subtract from each axis when the floating panels
   * experiment is enabled: a margin on each side plus a 1px border on each side
   * (the border is drawn inside the box, as `.monaco-workbench .part` is
   * `box-sizing: border-box` in `part.css`). On each window edge this part is the outermost
   * floating card on (see {@link getFloatingOuterGutterEdges}) it gets a doubled outer
   * margin, so its width inset is larger on that side.
   */
  getFloatingInset() {
    if (!this.layoutService.isFloatingPanelsEnabled()) {
      return { width: 0, height: 0 };
    }
    const borderTotal = 2;
    const { top, bottom } = getFloatingPaneCompositeVerticalMargins(this.layoutService, this.partId, getWindow(this.element));
    const { left, right } = getFloatingPaneCompositeHorizontalMargins(this.layoutService, this.partId);
    return {
      width: left + right + borderTotal,
      height: top + bottom + borderTotal
    };
  }
  layoutCompositeBar() {
    if (this.contentDimension && this.dimension && this.paneCompositeBar.value) {
      const padding = this.compositeBarPosition === 1 /* TITLE */ ? 16 : 8;
      const borderWidth = this.partId === Parts.PANEL_PART ? 0 : 1;
      let availableWidth = this.contentDimension.width - padding - borderWidth;
      availableWidth = Math.max(AbstractPaneCompositePart.MIN_COMPOSITE_BAR_WIDTH, availableWidth - this.getToolbarWidth());
      this.paneCompositeBar.value.layout(availableWidth, this.dimension.height);
    }
  }
  layoutEmptyMessage() {
    const visible = !this.getActiveComposite();
    this.element.classList.toggle("empty", visible);
    if (visible) {
      this.titleLabel?.updateTitle("", "");
    }
  }
  getToolbarWidth() {
    if (!this.toolBar || this.compositeBarPosition !== 1 /* TITLE */) {
      return 0;
    }
    const activePane = this.getActivePaneComposite();
    if (!activePane) {
      return 0;
    }
    const toolBarWidth = this.toolBar.getItemsWidth() + this.toolBar.getItemsLength() * 4;
    const globalToolBarWidth = this.globalToolBar ? this.globalToolBar.getItemsWidth() + this.globalToolBar.getItemsLength() * 4 : 0;
    return toolBarWidth + globalToolBarWidth + 8;
  }
  onTitleAreaContextMenu(event) {
    if (this.shouldShowCompositeBar() && this.getCompositeBarPosition() === 1 /* TITLE */) {
      return this.onCompositeBarContextMenu(event);
    } else {
      const activePaneComposite = this.getActivePaneComposite();
      const activePaneCompositeActions = activePaneComposite ? activePaneComposite.getContextMenuActions() : [];
      if (activePaneCompositeActions.length) {
        this.contextMenuService.showContextMenu({
          getAnchor: () => event,
          getActions: () => activePaneCompositeActions,
          getActionViewItem: (action, options) => this.actionViewItemProvider(action, options),
          actionRunner: activePaneComposite.getActionRunner(),
          skipTelemetry: true
        });
      }
    }
  }
  onCompositeBarAreaContextMenu(event) {
    return this.onCompositeBarContextMenu(event);
  }
  onCompositeBarContextMenu(event) {
    if (this.paneCompositeBar.value) {
      const actions = [...this.paneCompositeBar.value.getContextMenuActions()];
      if (actions.length) {
        this.contextMenuService.showContextMenu({
          getAnchor: () => event,
          getActions: () => actions,
          skipTelemetry: true
        });
      }
    }
  }
  getViewsSubmenuAction() {
    const viewPaneContainer = this.getActivePaneComposite()?.getViewPaneContainer();
    if (viewPaneContainer) {
      const disposables = new DisposableStore();
      const scopedContextKeyService = disposables.add(this.contextKeyService.createScoped(this.element));
      scopedContextKeyService.createKey("viewContainer", viewPaneContainer.viewContainer.id);
      const menu = this.menuService.getMenuActions(ViewsSubMenu, scopedContextKeyService, { shouldForwardArgs: true, renderShortTitle: true });
      const viewsActions = getActionBarActions(menu, () => true).primary;
      disposables.dispose();
      return viewsActions.length > 1 && viewsActions.some((a) => a.enabled) ? new SubmenuAction("views", localize("views", "Views"), viewsActions) : void 0;
    }
    return void 0;
  }
};
AbstractPaneCompositePart.MIN_COMPOSITE_BAR_WIDTH = 50;
AbstractPaneCompositePart = __decorateClass([
  __decorateParam(12, INotificationService),
  __decorateParam(13, IStorageService),
  __decorateParam(14, IContextMenuService),
  __decorateParam(15, IWorkbenchLayoutService),
  __decorateParam(16, IKeybindingService),
  __decorateParam(17, IHoverService),
  __decorateParam(18, IInstantiationService),
  __decorateParam(19, IThemeService),
  __decorateParam(20, IViewDescriptorService),
  __decorateParam(21, IContextKeyService),
  __decorateParam(22, IExtensionService),
  __decorateParam(23, IMenuService),
  __decorateParam(24, IConfigurationService)
], AbstractPaneCompositePart);
export {
  AbstractPaneCompositePart,
  CompositeBarPosition
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxwYW5lQ29tcG9zaXRlUGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9wYW5lQ29tcG9zaXRlUGFydC5jc3MnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc0luZGljYXRvciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBQYW5lQ29tcG9zaXRlLCBQYW5lQ29tcG9zaXRlRGVzY3JpcHRvciwgUGFuZUNvbXBvc2l0ZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vcGFuZWNvbXBvc2l0ZS5qcyc7XG5pbXBvcnQgeyBJUGFuZUNvbXBvc2l0ZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wYW5lY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElWaWV3IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2dyaWQvZ3JpZC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgUGFydHMsIFNJTkdMRV9XSU5ET1dfUEFSVFMsIGdldEZsb2F0aW5nT3V0ZXJHdXR0ZXJFZGdlcywgZ2V0RmxvYXRpbmdQYW5lQ29tcG9zaXRlSG9yaXpvbnRhbE1hcmdpbnMsIGdldEZsb2F0aW5nUGFuZUNvbXBvc2l0ZVZlcnRpY2FsTWFyZ2lucyB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29tcG9zaXRlUGFydCwgSUNvbXBvc2l0ZVBhcnRPcHRpb25zLCBJQ29tcG9zaXRlVGl0bGVMYWJlbCB9IGZyb20gJy4vY29tcG9zaXRlUGFydC5qcyc7XG5pbXBvcnQgeyBJUGFuZUNvbXBvc2l0ZUJhck9wdGlvbnMsIFBhbmVDb21wb3NpdGVCYXIgfSBmcm9tICcuL3BhbmVDb21wb3NpdGVCYXIuanMnO1xuaW1wb3J0IHsgRGltZW5zaW9uLCBFdmVudEhlbHBlciwgdHJhY2tGb2N1cywgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBFdmVudFR5cGUsIHByZXBlbmQsIGdldFdpbmRvdyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElDb21wb3NpdGUgfSBmcm9tICcuLi8uLi9jb21tb24vY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbXBvc2l0ZURyYWdBbmREcm9wT2JzZXJ2ZXIsIHRvZ2dsZURyb3BFZmZlY3QgfSBmcm9tICcuLi9kbmQuanMnO1xuaW1wb3J0IHsgRURJVE9SX0RSQUdfQU5EX0RST1BfQkFDS0dST1VORCB9IGZyb20gJy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQWN0aW9uc09yaWVudGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgR2VzdHVyZSwgRXZlbnRUeXBlIGFzIEdlc3R1cmVFdmVudFR5cGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdG91Y2guanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgU3VibWVudUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29tcG9zaXRlIH0gZnJvbSAnLi4vY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IFZpZXdzU3ViTWVudSB9IGZyb20gJy4vdmlld3Mvdmlld1BhbmVDb250YWluZXIuanMnO1xuaW1wb3J0IHsgZ2V0QWN0aW9uQmFyQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEhpZGRlbkl0ZW1TdHJhdGVneSwgTWVudVdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5cbmV4cG9ydCBlbnVtIENvbXBvc2l0ZUJhclBvc2l0aW9uIHtcblx0VE9QLFxuXHRUSVRMRSxcblx0Qk9UVE9NXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVBhbmVDb21wb3NpdGVQYXJ0IGV4dGVuZHMgSVZpZXcge1xuXG5cdHJlYWRvbmx5IHBhcnRJZDogU0lOR0xFX1dJTkRPV19QQVJUUztcblx0cmVhZG9ubHkgcmVnaXN0cnlJZDogc3RyaW5nO1xuXG5cdHJlYWRvbmx5IG9uRGlkUGFuZUNvbXBvc2l0ZU9wZW46IEV2ZW50PElQYW5lQ29tcG9zaXRlPjtcblx0cmVhZG9ubHkgb25EaWRQYW5lQ29tcG9zaXRlQ2xvc2U6IEV2ZW50PElQYW5lQ29tcG9zaXRlPjtcblxuXHQvKipcblx0ICogT3BlbnMgYSB2aWV3bGV0IHdpdGggdGhlIGdpdmVuIGlkZW50aWZpZXIgYW5kIHBhc3Mga2V5Ym9hcmQgZm9jdXMgdG8gaXQgaWYgc3BlY2lmaWVkLlxuXHQgKi9cblx0b3BlblBhbmVDb21wb3NpdGUoaWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgZm9jdXM/OiBib29sZWFuKTogUHJvbWlzZTxJUGFuZUNvbXBvc2l0ZSB8IHVuZGVmaW5lZD47XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGN1cnJlbnQgYWN0aXZlIHZpZXdsZXQgaWYgYW55LlxuXHQgKi9cblx0Z2V0QWN0aXZlUGFuZUNvbXBvc2l0ZSgpOiBJUGFuZUNvbXBvc2l0ZSB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgdmlld2xldCBieSBpZC5cblx0ICovXG5cdGdldFBhbmVDb21wb3NpdGUoaWQ6IHN0cmluZyk6IFBhbmVDb21wb3NpdGVEZXNjcmlwdG9yIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGFsbCBlbmFibGVkIHZpZXdsZXRzXG5cdCAqL1xuXHRnZXRQYW5lQ29tcG9zaXRlcygpOiBQYW5lQ29tcG9zaXRlRGVzY3JpcHRvcltdO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBwcm9ncmVzcyBpbmRpY2F0b3IgZm9yIHRoZSBzaWRlIGJhci5cblx0ICovXG5cdGdldFByb2dyZXNzSW5kaWNhdG9yKGlkOiBzdHJpbmcpOiBJUHJvZ3Jlc3NJbmRpY2F0b3IgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIEhpZGUgdGhlIGFjdGl2ZSB2aWV3bGV0LlxuXHQgKi9cblx0aGlkZUFjdGl2ZVBhbmVDb21wb3NpdGUoKTogdm9pZDtcblxuXHQvKipcblx0ICogUmV0dXJuIHRoZSBsYXN0IGFjdGl2ZSB2aWV3bGV0IGlkLlxuXHQgKi9cblx0Z2V0TGFzdEFjdGl2ZVBhbmVDb21wb3NpdGVJZCgpOiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFJldHVybnMgaWQgb2YgcGlubmVkIHZpZXcgY29udGFpbmVycyBmb2xsb3dpbmcgdGhlIHZpc3VhbCBvcmRlci5cblx0ICovXG5cdGdldFBpbm5lZFBhbmVDb21wb3NpdGVJZHMoKTogc3RyaW5nW107XG5cblx0LyoqXG5cdCAqIFJldHVybnMgaWQgb2YgdmlzaWJsZSB2aWV3IGNvbnRhaW5lcnMgZm9sbG93aW5nIHRoZSB2aXN1YWwgb3JkZXIuXG5cdCAqL1xuXHRnZXRWaXNpYmxlUGFuZUNvbXBvc2l0ZUlkcygpOiBzdHJpbmdbXTtcblxuXHQvKipcblx0ICogUmV0dXJucyBpZCBvZiBhbGwgdmlldyBjb250YWluZXJzIGZvbGxvd2luZyB0aGUgdmlzdWFsIG9yZGVyLlxuXHQgKi9cblx0Z2V0UGFuZUNvbXBvc2l0ZUlkcygpOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0UGFuZUNvbXBvc2l0ZVBhcnQgZXh0ZW5kcyBDb21wb3NpdGVQYXJ0PFBhbmVDb21wb3NpdGU+IGltcGxlbWVudHMgSVBhbmVDb21wb3NpdGVQYXJ0IHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBNSU5fQ09NUE9TSVRFX0JBUl9XSURUSCA9IDUwO1xuXG5cdGdldCBzbmFwKCk6IGJvb2xlYW4ge1xuXHRcdC8vIEFsd2F5cyBhbGxvdyBzbmFwcGluZyBjbG9zZWRcblx0XHQvLyBPbmx5IGFsbG93IGRyYWdnaW5nIG9wZW4gaWYgdGhlIHBhbmVsIGNvbnRhaW5zIHZpZXcgY29udGFpbmVyc1xuXHRcdHJldHVybiB0aGlzLmxheW91dFNlcnZpY2UuaXNWaXNpYmxlKHRoaXMucGFydElkKSB8fCAhIXRoaXMucGFuZUNvbXBvc2l0ZUJhci52YWx1ZT8uZ2V0VmlzaWJsZVBhbmVDb21wb3NpdGVJZHMoKS5sZW5ndGg7XG5cdH1cblxuXHRnZXQgb25EaWRQYW5lQ29tcG9zaXRlT3BlbigpOiBFdmVudDxJUGFuZUNvbXBvc2l0ZT4geyByZXR1cm4gRXZlbnQubWFwKHRoaXMub25EaWRDb21wb3NpdGVPcGVuLmV2ZW50LCBjb21wb3NpdGVFdmVudCA9PiA8SVBhbmVDb21wb3NpdGU+Y29tcG9zaXRlRXZlbnQuY29tcG9zaXRlKTsgfVxuXHRyZWFkb25seSBvbkRpZFBhbmVDb21wb3NpdGVDbG9zZSA9IHRoaXMub25EaWRDb21wb3NpdGVDbG9zZS5ldmVudCBhcyBFdmVudDxJUGFuZUNvbXBvc2l0ZT47XG5cblx0cHJpdmF0ZSB0aXRsZUNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaGVhZGVyRm9vdGVyQ29tcG9zaXRlQmFyQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IGhlYWRlckZvb3RlckNvbXBvc2l0ZUJhckRpc3BvYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHBhbmVDb21wb3NpdGVCYXJDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IHBhbmVDb21wb3NpdGVCYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8UGFuZUNvbXBvc2l0ZUJhcj4oKSk7XG5cdHByaXZhdGUgY29tcG9zaXRlQmFyUG9zaXRpb246IENvbXBvc2l0ZUJhclBvc2l0aW9uIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIGVtcHR5UGFuZU1lc3NhZ2VFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGdsb2JhbFRvb2xCYXI6IE1lbnVXb3JrYmVuY2hUb29sQmFyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGJsb2NrT3BlbmluZzogRGVmZXJyZWRQcm9taXNlPFBhbmVDb21wb3NpdGUgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcm90ZWN0ZWQgY29udGVudERpbWVuc2lvbjogRGltZW5zaW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGZsb2F0aW5nTGF5b3V0RGltZW5zaW9uOiBEaW1lbnNpb24gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgcGFydElkOiBTSU5HTEVfV0lORE9XX1BBUlRTLFxuXHRcdHBhcnRPcHRpb25zOiBJQ29tcG9zaXRlUGFydE9wdGlvbnMsXG5cdFx0YWN0aXZlUGFuZUNvbXBvc2l0ZVNldHRpbmdzS2V5OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBhY3RpdmVQYW5lQ29udGV4dEtleTogSUNvbnRleHRLZXk8c3RyaW5nPixcblx0XHRwcml2YXRlIHBhbmVGb2N1c0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+LFxuXHRcdG5hbWVGb3JUZWxlbWV0cnk6IHN0cmluZyxcblx0XHRjb21wb3NpdGVDU1NDbGFzczogc3RyaW5nLFxuXHRcdHRpdGxlRm9yZWdyb3VuZENvbG9yOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0dGl0bGVCb3JkZXJDb2xvcjogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBsb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uLFxuXHRcdHJlYWRvbmx5IHJlZ2lzdHJ5SWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGdsb2JhbEFjdGlvbnNNZW51SWQ6IE1lbnVJZCxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2Ugbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihcblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdGNvbnRleHRNZW51U2VydmljZSxcblx0XHRcdGxheW91dFNlcnZpY2UsXG5cdFx0XHRrZXliaW5kaW5nU2VydmljZSxcblx0XHRcdGhvdmVyU2VydmljZSxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0dGhlbWVTZXJ2aWNlLFxuXHRcdFx0UmVnaXN0cnkuYXM8UGFuZUNvbXBvc2l0ZVJlZ2lzdHJ5PihyZWdpc3RyeUlkKSxcblx0XHRcdGFjdGl2ZVBhbmVDb21wb3NpdGVTZXR0aW5nc0tleSxcblx0XHRcdHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXREZWZhdWx0Vmlld0NvbnRhaW5lcihsb2NhdGlvbik/LmlkIHx8ICcnLFxuXHRcdFx0bmFtZUZvclRlbGVtZXRyeSxcblx0XHRcdGNvbXBvc2l0ZUNTU0NsYXNzLFxuXHRcdFx0dGl0bGVGb3JlZ3JvdW5kQ29sb3IsXG5cdFx0XHR0aXRsZUJvcmRlckNvbG9yLFxuXHRcdFx0cGFydElkLFxuXHRcdFx0cGFydE9wdGlvbnNcblx0XHQpO1xuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZFBhbmVDb21wb3NpdGVPcGVuKGNvbXBvc2l0ZSA9PiB0aGlzLm9uRGlkT3Blbihjb21wb3NpdGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZFBhbmVDb21wb3NpdGVDbG9zZSh0aGlzLm9uRGlkQ2xvc2UsIHRoaXMpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVnaXN0cnkub25EaWREZXJlZ2lzdGVyKCh2aWV3bGV0RGVzY3JpcHRvcjogUGFuZUNvbXBvc2l0ZURlc2NyaXB0b3IpID0+IHtcblxuXHRcdFx0Y29uc3QgYWN0aXZlQ29udGFpbmVycyA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJzQnlMb2NhdGlvbih0aGlzLmxvY2F0aW9uKVxuXHRcdFx0XHQuZmlsdGVyKGNvbnRhaW5lciA9PiB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwoY29udGFpbmVyKS5hY3RpdmVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoID4gMCk7XG5cblx0XHRcdGlmIChhY3RpdmVDb250YWluZXJzLmxlbmd0aCkge1xuXHRcdFx0XHRpZiAodGhpcy5nZXRBY3RpdmVDb21wb3NpdGUoKT8uZ2V0SWQoKSA9PT0gdmlld2xldERlc2NyaXB0b3IuaWQpIHtcblx0XHRcdFx0XHRjb25zdCBkZWZhdWx0Vmlld2xldElkID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0RGVmYXVsdFZpZXdDb250YWluZXIodGhpcy5sb2NhdGlvbik/LmlkO1xuXHRcdFx0XHRcdGNvbnN0IGNvbnRhaW5lclRvT3BlbiA9IGFjdGl2ZUNvbnRhaW5lcnMuZmlsdGVyKGMgPT4gYy5pZCA9PT0gZGVmYXVsdFZpZXdsZXRJZClbMF0gfHwgYWN0aXZlQ29udGFpbmVyc1swXTtcblx0XHRcdFx0XHR0aGlzLmRvT3BlblBhbmVDb21wb3NpdGUoY29udGFpbmVyVG9PcGVuLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4odHJ1ZSwgdGhpcy5wYXJ0SWQpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnJlbW92ZUNvbXBvc2l0ZSh2aWV3bGV0RGVzY3JpcHRvci5pZCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5leHRlbnNpb25TZXJ2aWNlLm9uRGlkUmVnaXN0ZXJFeHRlbnNpb25zKCgpID0+IHtcblx0XHRcdHRoaXMubGF5b3V0Q29tcG9zaXRlQmFyKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZE9wZW4oY29tcG9zaXRlOiBJQ29tcG9zaXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgY29tcG9zaXRlSWQgPSBjb21wb3NpdGUuZ2V0SWQoKTtcblx0XHR0aGlzLmFjdGl2ZVBhbmVDb250ZXh0S2V5LnNldChjb21wb3NpdGVJZCk7XG5cdFx0dGhpcy5lbGVtZW50LmRhdGFzZXQuYWN0aXZlQ29tcG9zaXRlID0gY29tcG9zaXRlSWQ7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2xvc2UoY29tcG9zaXRlOiBJQ29tcG9zaXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgaWQgPSBjb21wb3NpdGUuZ2V0SWQoKTtcblx0XHRpZiAodGhpcy5hY3RpdmVQYW5lQ29udGV4dEtleS5nZXQoKSA9PT0gaWQpIHtcblx0XHRcdHRoaXMuYWN0aXZlUGFuZUNvbnRleHRLZXkucmVzZXQoKTtcblx0XHRcdGRlbGV0ZSB0aGlzLmVsZW1lbnQuZGF0YXNldC5hY3RpdmVDb21wb3NpdGU7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHNob3dDb21wb3NpdGUoY29tcG9zaXRlOiBDb21wb3NpdGUpOiB2b2lkIHtcblx0XHRzdXBlci5zaG93Q29tcG9zaXRlKGNvbXBvc2l0ZSk7XG5cdFx0dGhpcy5sYXlvdXRDb21wb3NpdGVCYXIoKTtcblx0XHR0aGlzLmxheW91dEVtcHR5TWVzc2FnZSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGhpZGVBY3RpdmVDb21wb3NpdGUoKTogQ29tcG9zaXRlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjb21wb3NpdGUgPSBzdXBlci5oaWRlQWN0aXZlQ29tcG9zaXRlKCk7XG5cdFx0dGhpcy5sYXlvdXRDb21wb3NpdGVCYXIoKTtcblx0XHR0aGlzLmxheW91dEVtcHR5TWVzc2FnZSgpO1xuXHRcdHJldHVybiBjb21wb3NpdGU7XG5cdH1cblxuXHRvdmVycmlkZSBjcmVhdGUocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuZWxlbWVudCA9IHBhcmVudDtcblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgncGFuZS1jb21wb3NpdGUtcGFydCcpO1xuXG5cdFx0c3VwZXIuY3JlYXRlKHBhcmVudCk7XG5cblx0XHRpZiAodGhpcy5jb250ZW50QXJlYSkge1xuXHRcdFx0dGhpcy5jcmVhdGVFbXB0eVBhbmVNZXNzYWdlKHRoaXMuY29udGVudEFyZWEpO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlQ29tcG9zaXRlQmFyKCk7XG5cblx0XHRjb25zdCBmb2N1c1RyYWNrZXIgPSB0aGlzLl9yZWdpc3Rlcih0cmFja0ZvY3VzKHBhcmVudCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGZvY3VzVHJhY2tlci5vbkRpZEZvY3VzKCgpID0+IHRoaXMucGFuZUZvY3VzQ29udGV4dEtleS5zZXQodHJ1ZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihmb2N1c1RyYWNrZXIub25EaWRCbHVyKCgpID0+IHRoaXMucGFuZUZvY3VzQ29udGV4dEtleS5zZXQoZmFsc2UpKSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUVtcHR5UGFuZU1lc3NhZ2UocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuZW1wdHlQYW5lTWVzc2FnZUVsZW1lbnQgPSAkKCcuZW1wdHktcGFuZS1tZXNzYWdlLWFyZWEnKTtcblxuXHRcdGNvbnN0IG1lc3NhZ2VFbGVtZW50ID0gJCgnLmVtcHR5LXBhbmUtbWVzc2FnZScpO1xuXHRcdG1lc3NhZ2VFbGVtZW50LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3BhbmUuZW1wdHlNZXNzYWdlJywgXCJEcmFnIGEgdmlldyBoZXJlIHRvIGRpc3BsYXkuXCIpO1xuXG5cdFx0dGhpcy5lbXB0eVBhbmVNZXNzYWdlRWxlbWVudC5hcHBlbmRDaGlsZChtZXNzYWdlRWxlbWVudCk7XG5cdFx0cGFyZW50LmFwcGVuZENoaWxkKHRoaXMuZW1wdHlQYW5lTWVzc2FnZUVsZW1lbnQpO1xuXG5cdFx0Y29uc3Qgc2V0RHJvcEJhY2tncm91bmRGZWVkYmFjayA9ICh2aXNpYmxlOiBib29sZWFuKSA9PiB7XG5cdFx0XHRjb25zdCB1cGRhdGVBY3Rpdml0eUJhckJhY2tncm91bmQgPSAhdGhpcy5nZXRBY3RpdmVDb21wb3NpdGUoKSB8fCAhdmlzaWJsZTtcblx0XHRcdGNvbnN0IGJhY2tncm91bmRDb2xvciA9IHZpc2libGUgPyB0aGlzLnRoZW1lLmdldENvbG9yKEVESVRPUl9EUkFHX0FORF9EUk9QX0JBQ0tHUk9VTkQpPy50b1N0cmluZygpIHx8ICcnIDogJyc7XG5cblx0XHRcdGlmICh0aGlzLnRpdGxlQ29udGFpbmVyICYmIHVwZGF0ZUFjdGl2aXR5QmFyQmFja2dyb3VuZCkge1xuXHRcdFx0XHR0aGlzLnRpdGxlQ29udGFpbmVyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IGJhY2tncm91bmRDb2xvcjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmhlYWRlckZvb3RlckNvbXBvc2l0ZUJhckNvbnRhaW5lciAmJiB1cGRhdGVBY3Rpdml0eUJhckJhY2tncm91bmQpIHtcblx0XHRcdFx0dGhpcy5oZWFkZXJGb290ZXJDb21wb3NpdGVCYXJDb250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gYmFja2dyb3VuZENvbG9yO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmVtcHR5UGFuZU1lc3NhZ2VFbGVtZW50IS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBiYWNrZ3JvdW5kQ29sb3I7XG5cdFx0fTtcblxuXHRcdGlmICh0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5jYW5Nb3ZlVmlld3MoKSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoQ29tcG9zaXRlRHJhZ0FuZERyb3BPYnNlcnZlci5JTlNUQU5DRS5yZWdpc3RlclRhcmdldCh0aGlzLmVsZW1lbnQsIHtcblx0XHRcdFx0b25EcmFnT3ZlcjogKGUpID0+IHtcblx0XHRcdFx0XHRFdmVudEhlbHBlci5zdG9wKGUuZXZlbnREYXRhLCB0cnVlKTtcblx0XHRcdFx0XHRpZiAodGhpcy5wYW5lQ29tcG9zaXRlQmFyLnZhbHVlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB2YWxpZERyb3BUYXJnZXQgPSB0aGlzLnBhbmVDb21wb3NpdGVCYXIudmFsdWUuZG5kSGFuZGxlci5vbkRyYWdFbnRlcihlLmRyYWdBbmREcm9wRGF0YSwgdW5kZWZpbmVkLCBlLmV2ZW50RGF0YSk7XG5cdFx0XHRcdFx0XHR0b2dnbGVEcm9wRWZmZWN0KGUuZXZlbnREYXRhLmRhdGFUcmFuc2ZlciwgJ21vdmUnLCB2YWxpZERyb3BUYXJnZXQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0b25EcmFnRW50ZXI6IChlKSA9PiB7XG5cdFx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLmV2ZW50RGF0YSwgdHJ1ZSk7XG5cdFx0XHRcdFx0aWYgKHRoaXMucGFuZUNvbXBvc2l0ZUJhci52YWx1ZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgdmFsaWREcm9wVGFyZ2V0ID0gdGhpcy5wYW5lQ29tcG9zaXRlQmFyLnZhbHVlLmRuZEhhbmRsZXIub25EcmFnRW50ZXIoZS5kcmFnQW5kRHJvcERhdGEsIHVuZGVmaW5lZCwgZS5ldmVudERhdGEpO1xuXHRcdFx0XHRcdFx0c2V0RHJvcEJhY2tncm91bmRGZWVkYmFjayh2YWxpZERyb3BUYXJnZXQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0b25EcmFnTGVhdmU6IChlKSA9PiB7XG5cdFx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLmV2ZW50RGF0YSwgdHJ1ZSk7XG5cdFx0XHRcdFx0c2V0RHJvcEJhY2tncm91bmRGZWVkYmFjayhmYWxzZSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uRHJhZ0VuZDogKGUpID0+IHtcblx0XHRcdFx0XHRFdmVudEhlbHBlci5zdG9wKGUuZXZlbnREYXRhLCB0cnVlKTtcblx0XHRcdFx0XHRzZXREcm9wQmFja2dyb3VuZEZlZWRiYWNrKGZhbHNlKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0b25Ecm9wOiAoZSkgPT4ge1xuXHRcdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZS5ldmVudERhdGEsIHRydWUpO1xuXHRcdFx0XHRcdHNldERyb3BCYWNrZ3JvdW5kRmVlZGJhY2soZmFsc2UpO1xuXHRcdFx0XHRcdGlmICh0aGlzLnBhbmVDb21wb3NpdGVCYXIudmFsdWUpIHtcblx0XHRcdFx0XHRcdHRoaXMucGFuZUNvbXBvc2l0ZUJhci52YWx1ZS5kbmRIYW5kbGVyLmRyb3AoZS5kcmFnQW5kRHJvcERhdGEsIHVuZGVmaW5lZCwgZS5ldmVudERhdGEpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBBbGxvdyBvcGVuaW5nIHZpZXdzL2NvbXBvc2l0ZXMgaWYgdGhlIGNvbXBvc2l0ZSBiYXIgaXMgaGlkZGVuXG5cdFx0XHRcdFx0XHRjb25zdCBkcmFnRGF0YSA9IGUuZHJhZ0FuZERyb3BEYXRhLmdldERhdGEoKTtcblxuXHRcdFx0XHRcdFx0aWYgKGRyYWdEYXRhLnR5cGUgPT09ICdjb21wb3NpdGUnKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRDb250YWluZXIgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlJZChkcmFnRGF0YS5pZCkhO1xuXHRcdFx0XHRcdFx0XHR0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5tb3ZlVmlld0NvbnRhaW5lclRvTG9jYXRpb24oY3VycmVudENvbnRhaW5lciwgdGhpcy5sb2NhdGlvbiwgdW5kZWZpbmVkLCAnZG5kJyk7XG5cdFx0XHRcdFx0XHRcdHRoaXMub3BlblBhbmVDb21wb3NpdGUoY3VycmVudENvbnRhaW5lci5pZCwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGVsc2UgaWYgKGRyYWdEYXRhLnR5cGUgPT09ICd2aWV3Jykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCB2aWV3VG9Nb3ZlID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0Rlc2NyaXB0b3JCeUlkKGRyYWdEYXRhLmlkKSE7XG5cdFx0XHRcdFx0XHRcdGlmICh2aWV3VG9Nb3ZlLmNhbk1vdmVWaWV3KSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UubW92ZVZpZXdUb0xvY2F0aW9uKHZpZXdUb01vdmUsIHRoaXMubG9jYXRpb24sICdkbmQnKTtcblxuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IG5ld0NvbnRhaW5lciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeVZpZXdJZCh2aWV3VG9Nb3ZlLmlkKSE7XG5cblx0XHRcdFx0XHRcdFx0XHR0aGlzLm9wZW5QYW5lQ29tcG9zaXRlKG5ld0NvbnRhaW5lci5pZCwgdHJ1ZSkudGhlbihjb21wb3NpdGUgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29tcG9zaXRlPy5vcGVuVmlldyh2aWV3VG9Nb3ZlLmlkLCB0cnVlKTtcblx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY3JlYXRlVGl0bGVBcmVhKHBhcmVudDogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdGl0bGVBcmVhID0gc3VwZXIuY3JlYXRlVGl0bGVBcmVhKHBhcmVudCk7XG5cdFx0aWYgKCF0aXRsZUFyZWEpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRpdGxlQXJlYSwgRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgZSA9PiB7XG5cdFx0XHR0aGlzLm9uVGl0bGVBcmVhQ29udGV4dE1lbnUobmV3IFN0YW5kYXJkTW91c2VFdmVudChnZXRXaW5kb3codGl0bGVBcmVhKSwgZSkpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihHZXN0dXJlLmFkZFRhcmdldCh0aXRsZUFyZWEpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGl0bGVBcmVhLCBHZXN0dXJlRXZlbnRUeXBlLkNvbnRleHRtZW51LCBlID0+IHtcblx0XHRcdHRoaXMub25UaXRsZUFyZWFDb250ZXh0TWVudShuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGdldFdpbmRvdyh0aXRsZUFyZWEpLCBlKSk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZ2xvYmFsVGl0bGVBY3Rpb25zQ29udGFpbmVyID0gdGl0bGVBcmVhLmFwcGVuZENoaWxkKCQoJy5nbG9iYWwtYWN0aW9ucycpKTtcblxuXHRcdC8vIEdsb2JhbCBBY3Rpb25zIFRvb2xiYXJcblx0XHR0aGlzLmdsb2JhbFRvb2xCYXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLFxuXHRcdFx0Z2xvYmFsVGl0bGVBY3Rpb25zQ29udGFpbmVyLFxuXHRcdFx0dGhpcy5nbG9iYWxBY3Rpb25zTWVudUlkLFxuXHRcdFx0e1xuXHRcdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiB0aGlzLmFjdGlvblZpZXdJdGVtUHJvdmlkZXIoYWN0aW9uLCBvcHRpb25zKSxcblx0XHRcdFx0b3JpZW50YXRpb246IEFjdGlvbnNPcmllbnRhdGlvbi5IT1JJWk9OVEFMLFxuXHRcdFx0XHRnZXRLZXlCaW5kaW5nOiBhY3Rpb24gPT4gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5pZCksXG5cdFx0XHRcdGFuY2hvckFsaWdubWVudFByb3ZpZGVyOiAoKSA9PiB0aGlzLmdldFRpdGxlQXJlYURyb3BEb3duQW5jaG9yQWxpZ25tZW50KCksXG5cdFx0XHRcdHRvZ2dsZU1lbnVUaXRsZTogbG9jYWxpemUoJ21vcmVBY3Rpb25zJywgXCJNb3JlIEFjdGlvbnMuLi5cIiksXG5cdFx0XHRcdGhvdmVyRGVsZWdhdGU6IHRoaXMudG9vbGJhckhvdmVyRGVsZWdhdGUsXG5cdFx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lk5vSGlkZSxcblx0XHRcdFx0aGlnaGxpZ2h0VG9nZ2xlZEl0ZW1zOiB0cnVlLFxuXHRcdFx0XHR0ZWxlbWV0cnlTb3VyY2U6IHRoaXMubmFtZUZvclRlbGVtZXRyeVxuXHRcdFx0fVxuXHRcdCkpO1xuXG5cdFx0cmV0dXJuIHRpdGxlQXJlYTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjcmVhdGVUaXRsZUxhYmVsKHBhcmVudDogSFRNTEVsZW1lbnQpOiBJQ29tcG9zaXRlVGl0bGVMYWJlbCB7XG5cdFx0dGhpcy50aXRsZUNvbnRhaW5lciA9IHBhcmVudDtcblxuXHRcdGNvbnN0IHRpdGxlTGFiZWwgPSBzdXBlci5jcmVhdGVUaXRsZUxhYmVsKHBhcmVudCk7XG5cdFx0dGhpcy50aXRsZUxhYmVsRWxlbWVudCEuZHJhZ2dhYmxlID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuY2FuTW92ZVZpZXdzKCk7XG5cdFx0Y29uc3QgZHJhZ2dlZEl0ZW1Qcm92aWRlciA9ICgpOiB7IHR5cGU6ICd2aWV3JyB8ICdjb21wb3NpdGUnOyBpZDogc3RyaW5nIH0gPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlVmlld2xldCA9IHRoaXMuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZSgpITtcblx0XHRcdHJldHVybiB7IHR5cGU6ICdjb21wb3NpdGUnLCBpZDogYWN0aXZlVmlld2xldC5nZXRJZCgpIH07XG5cdFx0fTtcblx0XHR0aGlzLl9yZWdpc3RlcihDb21wb3NpdGVEcmFnQW5kRHJvcE9ic2VydmVyLklOU1RBTkNFLnJlZ2lzdGVyRHJhZ2dhYmxlKHRoaXMudGl0bGVMYWJlbEVsZW1lbnQhLCBkcmFnZ2VkSXRlbVByb3ZpZGVyLCB7fSkpO1xuXG5cdFx0cmV0dXJuIHRpdGxlTGFiZWw7XG5cdH1cblxuXHRwcm90ZWN0ZWQgdXBkYXRlQ29tcG9zaXRlQmFyKHVwZGF0ZUNvbXBvc2l0ZUJhck9wdGlvbjogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2FzQ29tcG9zaXRlQmFyVmlzaWJsZSA9IHRoaXMuY29tcG9zaXRlQmFyUG9zaXRpb24gIT09IHVuZGVmaW5lZDtcblx0XHRjb25zdCBpc0NvbXBvc2l0ZUJhclZpc2libGUgPSB0aGlzLnNob3VsZFNob3dDb21wb3NpdGVCYXIoKTtcblx0XHRjb25zdCBwcmV2aW91c1Bvc2l0aW9uID0gdGhpcy5jb21wb3NpdGVCYXJQb3NpdGlvbjtcblx0XHRjb25zdCBuZXdQb3NpdGlvbiA9IGlzQ29tcG9zaXRlQmFyVmlzaWJsZSA/IHRoaXMuZ2V0Q29tcG9zaXRlQmFyUG9zaXRpb24oKSA6IHVuZGVmaW5lZDtcblxuXHRcdC8vIE9ubHkgdXBkYXRlIGlmIHRoZSB2aXNpYmlsaXR5IG9yIHBvc2l0aW9uIGhhcyBjaGFuZ2VkIG9yIGlmIHRoZSBjb21wb3NpdGUgYmFyIG9wdGlvbnMgc2hvdWxkIGJlIHVwZGF0ZWRcblx0XHRpZiAoIXVwZGF0ZUNvbXBvc2l0ZUJhck9wdGlvbiAmJiBwcmV2aW91c1Bvc2l0aW9uID09PSBuZXdQb3NpdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFJlbW92ZSBvbGQgY29tcG9zaXRlIGJhclxuXHRcdGlmICh3YXNDb21wb3NpdGVCYXJWaXNpYmxlKSB7XG5cdFx0XHRjb25zdCBwcmV2aW91c0NvbXBvc2l0ZUJhckNvbnRhaW5lciA9IHByZXZpb3VzUG9zaXRpb24gPT09IENvbXBvc2l0ZUJhclBvc2l0aW9uLlRJVExFID8gdGhpcy50aXRsZUNvbnRhaW5lciA6IHRoaXMuaGVhZGVyRm9vdGVyQ29tcG9zaXRlQmFyQ29udGFpbmVyO1xuXHRcdFx0aWYgKCF0aGlzLnBhbmVDb21wb3NpdGVCYXJDb250YWluZXIgfHwgIXRoaXMucGFuZUNvbXBvc2l0ZUJhci52YWx1ZSB8fCAhcHJldmlvdXNDb21wb3NpdGVCYXJDb250YWluZXIpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDb21wb3NpdGUgYmFyIGNvbnRhaW5lcnMgc2hvdWxkIGV4aXN0IHdoZW4gcmVtb3ZpbmcgdGhlIHByZXZpb3VzIGNvbXBvc2l0ZSBiYXInKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5wYW5lQ29tcG9zaXRlQmFyQ29udGFpbmVyLnJlbW92ZSgpO1xuXHRcdFx0dGhpcy5wYW5lQ29tcG9zaXRlQmFyQ29udGFpbmVyID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5wYW5lQ29tcG9zaXRlQmFyLnZhbHVlID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRwcmV2aW91c0NvbXBvc2l0ZUJhckNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdoYXMtY29tcG9zaXRlLWJhcicpO1xuXG5cdFx0XHRpZiAocHJldmlvdXNQb3NpdGlvbiA9PT0gQ29tcG9zaXRlQmFyUG9zaXRpb24uVE9QKSB7XG5cdFx0XHRcdHRoaXMucmVtb3ZlRm9vdGVySGVhZGVyQXJlYSh0cnVlKTtcblx0XHRcdH0gZWxzZSBpZiAocHJldmlvdXNQb3NpdGlvbiA9PT0gQ29tcG9zaXRlQmFyUG9zaXRpb24uQk9UVE9NKSB7XG5cdFx0XHRcdHRoaXMucmVtb3ZlRm9vdGVySGVhZGVyQXJlYShmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIG5ldyBjb21wb3NpdGUgYmFyXG5cdFx0bGV0IG5ld0NvbXBvc2l0ZUJhckNvbnRhaW5lcjtcblx0XHRzd2l0Y2ggKG5ld1Bvc2l0aW9uKSB7XG5cdFx0XHRjYXNlIENvbXBvc2l0ZUJhclBvc2l0aW9uLlRPUDogbmV3Q29tcG9zaXRlQmFyQ29udGFpbmVyID0gdGhpcy5jcmVhdGVIZWFkZXJBcmVhKCk7IGJyZWFrO1xuXHRcdFx0Y2FzZSBDb21wb3NpdGVCYXJQb3NpdGlvbi5USVRMRTogbmV3Q29tcG9zaXRlQmFyQ29udGFpbmVyID0gdGhpcy50aXRsZUNvbnRhaW5lcjsgYnJlYWs7XG5cdFx0XHRjYXNlIENvbXBvc2l0ZUJhclBvc2l0aW9uLkJPVFRPTTogbmV3Q29tcG9zaXRlQmFyQ29udGFpbmVyID0gdGhpcy5jcmVhdGVGb290ZXJBcmVhKCk7IGJyZWFrO1xuXHRcdH1cblx0XHRpZiAoaXNDb21wb3NpdGVCYXJWaXNpYmxlKSB7XG5cblx0XHRcdGlmICh0aGlzLnBhbmVDb21wb3NpdGVCYXJDb250YWluZXIgfHwgdGhpcy5wYW5lQ29tcG9zaXRlQmFyLnZhbHVlIHx8ICFuZXdDb21wb3NpdGVCYXJDb250YWluZXIpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGNvbXBvc2l0ZSBiYXIgc3RhdGUgd2hlbiBjcmVhdGluZyB0aGUgbmV3IGNvbXBvc2l0ZSBiYXInKTtcblx0XHRcdH1cblxuXHRcdFx0bmV3Q29tcG9zaXRlQmFyQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2hhcy1jb21wb3NpdGUtYmFyJyk7XG5cdFx0XHR0aGlzLnBhbmVDb21wb3NpdGVCYXJDb250YWluZXIgPSBwcmVwZW5kKG5ld0NvbXBvc2l0ZUJhckNvbnRhaW5lciwgJCgnLmNvbXBvc2l0ZS1iYXItY29udGFpbmVyJykpO1xuXHRcdFx0dGhpcy5wYW5lQ29tcG9zaXRlQmFyLnZhbHVlID0gdGhpcy5jcmVhdGVDb21wb3NpdGVCYXIoKTtcblx0XHRcdHRoaXMucGFuZUNvbXBvc2l0ZUJhci52YWx1ZS5jcmVhdGUodGhpcy5wYW5lQ29tcG9zaXRlQmFyQ29udGFpbmVyKTtcblxuXHRcdFx0aWYgKG5ld1Bvc2l0aW9uID09PSBDb21wb3NpdGVCYXJQb3NpdGlvbi5UT1ApIHtcblx0XHRcdFx0dGhpcy5zZXRIZWFkZXJBcmVhKG5ld0NvbXBvc2l0ZUJhckNvbnRhaW5lcik7XG5cdFx0XHR9IGVsc2UgaWYgKG5ld1Bvc2l0aW9uID09PSBDb21wb3NpdGVCYXJQb3NpdGlvbi5CT1RUT00pIHtcblx0XHRcdFx0dGhpcy5zZXRGb290ZXJBcmVhKG5ld0NvbXBvc2l0ZUJhckNvbnRhaW5lcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5jb21wb3NpdGVCYXJQb3NpdGlvbiA9IG5ld1Bvc2l0aW9uO1xuXG5cdFx0aWYgKHVwZGF0ZUNvbXBvc2l0ZUJhck9wdGlvbikge1xuXHRcdFx0dGhpcy5sYXlvdXRDb21wb3NpdGVCYXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY3JlYXRlSGVhZGVyQXJlYSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgaGVhZGVyQXJlYSA9IHN1cGVyLmNyZWF0ZUhlYWRlckFyZWEoKTtcblxuXHRcdHJldHVybiB0aGlzLmNyZWF0ZUhlYWRlckZvb3RlckNvbXBvc2l0ZUJhckFyZWEoaGVhZGVyQXJlYSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY3JlYXRlRm9vdGVyQXJlYSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgZm9vdGVyQXJlYSA9IHN1cGVyLmNyZWF0ZUZvb3RlckFyZWEoKTtcblxuXHRcdHJldHVybiB0aGlzLmNyZWF0ZUhlYWRlckZvb3RlckNvbXBvc2l0ZUJhckFyZWEoZm9vdGVyQXJlYSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlSGVhZGVyRm9vdGVyQ29tcG9zaXRlQmFyQXJlYShhcmVhOiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHtcblx0XHRpZiAodGhpcy5oZWFkZXJGb290ZXJDb21wb3NpdGVCYXJDb250YWluZXIpIHtcblx0XHRcdC8vIEEgcGFuZSBjb21wb3NpdGUgcGFydCBoYXMgZWl0aGVyIGEgaGVhZGVyIG9yIGEgZm9vdGVyLCBidXQgbm90IGJvdGhcblx0XHRcdHRocm93IG5ldyBFcnJvcignSGVhZGVyIG9yIEZvb3RlciBjb21wb3NpdGUgYmFyIGFscmVhZHkgZXhpc3RzJyk7XG5cdFx0fVxuXHRcdHRoaXMuaGVhZGVyRm9vdGVyQ29tcG9zaXRlQmFyQ29udGFpbmVyID0gYXJlYTtcblxuXHRcdHRoaXMuaGVhZGVyRm9vdGVyQ29tcG9zaXRlQmFyRGlzcG9hYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGFyZWEsIEV2ZW50VHlwZS5DT05URVhUX01FTlUsIGUgPT4ge1xuXHRcdFx0dGhpcy5vbkNvbXBvc2l0ZUJhckFyZWFDb250ZXh0TWVudShuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGdldFdpbmRvdyhhcmVhKSwgZSkpO1xuXHRcdH0pKTtcblx0XHR0aGlzLmhlYWRlckZvb3RlckNvbXBvc2l0ZUJhckRpc3BvYWJsZXMuYWRkKEdlc3R1cmUuYWRkVGFyZ2V0KGFyZWEpKTtcblx0XHR0aGlzLmhlYWRlckZvb3RlckNvbXBvc2l0ZUJhckRpc3BvYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihhcmVhLCBHZXN0dXJlRXZlbnRUeXBlLkNvbnRleHRtZW51LCBlID0+IHtcblx0XHRcdHRoaXMub25Db21wb3NpdGVCYXJBcmVhQ29udGV4dE1lbnUobmV3IFN0YW5kYXJkTW91c2VFdmVudChnZXRXaW5kb3coYXJlYSksIGUpKTtcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gYXJlYTtcblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlRm9vdGVySGVhZGVyQXJlYShoZWFkZXI6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmhlYWRlckZvb3RlckNvbXBvc2l0ZUJhckNvbnRhaW5lciA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmhlYWRlckZvb3RlckNvbXBvc2l0ZUJhckRpc3BvYWJsZXMuY2xlYXIoKTtcblx0XHRpZiAoaGVhZGVyKSB7XG5cdFx0XHR0aGlzLnJlbW92ZUhlYWRlckFyZWEoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yZW1vdmVGb290ZXJBcmVhKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZUNvbXBvc2l0ZUJhcigpOiBQYW5lQ29tcG9zaXRlQmFyIHtcblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQYW5lQ29tcG9zaXRlQmFyLCB0aGlzLmxvY2F0aW9uLCB0aGlzLmdldENvbXBvc2l0ZUJhck9wdGlvbnMoKSwgdGhpcy5wYXJ0SWQsIHRoaXMpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIG9uVGl0bGVBcmVhVXBkYXRlKGNvbXBvc2l0ZUlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRzdXBlci5vblRpdGxlQXJlYVVwZGF0ZShjb21wb3NpdGVJZCk7XG5cblx0XHQvLyBJZiB0aXRsZSBhY3Rpb25zIGNoYW5nZSwgcmVsYXlvdXQgdGhlIGNvbXBvc2l0ZSBiYXJcblx0XHR0aGlzLmxheW91dENvbXBvc2l0ZUJhcigpO1xuXHR9XG5cblx0YXN5bmMgb3BlblBhbmVDb21wb3NpdGUoaWQ/OiBzdHJpbmcsIGZvY3VzPzogYm9vbGVhbik6IFByb21pc2U8UGFuZUNvbXBvc2l0ZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0eXBlb2YgaWQgPT09ICdzdHJpbmcnICYmIHRoaXMuZ2V0UGFuZUNvbXBvc2l0ZShpZCkpIHtcblx0XHRcdHJldHVybiB0aGlzLmRvT3BlblBhbmVDb21wb3NpdGUoaWQsIGZvY3VzKTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCk7XG5cblx0XHRpZiAodHlwZW9mIGlkID09PSAnc3RyaW5nJyAmJiB0aGlzLmdldFBhbmVDb21wb3NpdGUoaWQpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kb09wZW5QYW5lQ29tcG9zaXRlKGlkLCBmb2N1cyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9PcGVuUGFuZUNvbXBvc2l0ZShpZDogc3RyaW5nLCBmb2N1cz86IGJvb2xlYW4pOiBQcm9taXNlPFBhbmVDb21wb3NpdGUgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodGhpcy5ibG9ja09wZW5pbmcpIHtcblx0XHRcdC8vIFdvcmthcm91bmQgYWdhaW5zdCBhIHBvdGVudGlhbCByYWNlIGNvbmRpdGlvbiB3aGVuIGNhbGxpbmdcblx0XHRcdC8vIGBzZXRQYXJ0SGlkZGVuYCB3ZSBtYXkgZW5kIHVwIGluIGBvcGVuUGFuZUNvbXBvc2l0ZWAgYWdhaW4uXG5cdFx0XHQvLyBCdXQgd2Ugc3RpbGwgd2FudCB0byByZXR1cm4gdGhlIHJlc3VsdCBvZiB0aGUgb3JpZ2luYWwgY2FsbCxcblx0XHRcdC8vIHNvIHdlIHJldHVybiB0aGUgcHJvbWlzZSBvZiB0aGUgb3JpZ2luYWwgY2FsbC5cblx0XHRcdHJldHVybiB0aGlzLmJsb2NrT3BlbmluZy5wO1xuXHRcdH1cblxuXHRcdGxldCBibG9ja09wZW5pbmc6IERlZmVycmVkUHJvbWlzZTxQYW5lQ29tcG9zaXRlIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZDtcblx0XHRpZiAoIXRoaXMubGF5b3V0U2VydmljZS5pc1Zpc2libGUodGhpcy5wYXJ0SWQpKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRibG9ja09wZW5pbmcgPSB0aGlzLmJsb2NrT3BlbmluZyA9IG5ldyBEZWZlcnJlZFByb21pc2U8UGFuZUNvbXBvc2l0ZSB8IHVuZGVmaW5lZD4oKTtcblx0XHRcdFx0dGhpcy5sYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4oZmFsc2UsIHRoaXMucGFydElkKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRoaXMuYmxvY2tPcGVuaW5nID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0aGlzLm9wZW5Db21wb3NpdGUoaWQsIGZvY3VzKSBhcyBQYW5lQ29tcG9zaXRlIHwgdW5kZWZpbmVkO1xuXHRcdFx0YmxvY2tPcGVuaW5nPy5jb21wbGV0ZShyZXN1bHQpO1xuXG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRibG9ja09wZW5pbmc/LmVycm9yKGVycm9yKTtcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdGdldFBhbmVDb21wb3NpdGUoaWQ6IHN0cmluZyk6IFBhbmVDb21wb3NpdGVEZXNjcmlwdG9yIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gKHRoaXMucmVnaXN0cnkgYXMgUGFuZUNvbXBvc2l0ZVJlZ2lzdHJ5KS5nZXRQYW5lQ29tcG9zaXRlKGlkKTtcblx0fVxuXG5cdGdldFBhbmVDb21wb3NpdGVzKCk6IFBhbmVDb21wb3NpdGVEZXNjcmlwdG9yW10ge1xuXHRcdHJldHVybiAodGhpcy5yZWdpc3RyeSBhcyBQYW5lQ29tcG9zaXRlUmVnaXN0cnkpLmdldFBhbmVDb21wb3NpdGVzKClcblx0XHRcdC5zb3J0KCh2MSwgdjIpID0+IHtcblx0XHRcdFx0aWYgKHR5cGVvZiB2MS5vcmRlciAhPT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0eXBlb2YgdjIub3JkZXIgIT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHYxLm9yZGVyIC0gdjIub3JkZXI7XG5cdFx0XHR9KTtcblx0fVxuXG5cdGdldFBpbm5lZFBhbmVDb21wb3NpdGVJZHMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLnBhbmVDb21wb3NpdGVCYXIudmFsdWU/LmdldFBpbm5lZFBhbmVDb21wb3NpdGVJZHMoKSA/PyBbXTtcblx0fVxuXG5cdGdldFZpc2libGVQYW5lQ29tcG9zaXRlSWRzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gdGhpcy5wYW5lQ29tcG9zaXRlQmFyLnZhbHVlPy5nZXRWaXNpYmxlUGFuZUNvbXBvc2l0ZUlkcygpID8/IFtdO1xuXHR9XG5cblx0Z2V0UGFuZUNvbXBvc2l0ZUlkcygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMucGFuZUNvbXBvc2l0ZUJhci52YWx1ZT8uZ2V0UGFuZUNvbXBvc2l0ZUlkcygpID8/IFtdO1xuXHR9XG5cblx0Z2V0QWN0aXZlUGFuZUNvbXBvc2l0ZSgpOiBJUGFuZUNvbXBvc2l0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIDxJUGFuZUNvbXBvc2l0ZT50aGlzLmdldEFjdGl2ZUNvbXBvc2l0ZSgpO1xuXHR9XG5cblx0Z2V0TGFzdEFjdGl2ZVBhbmVDb21wb3NpdGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmdldExhc3RBY3RpdmVDb21wb3NpdGVJZCgpO1xuXHR9XG5cblx0aGlkZUFjdGl2ZVBhbmVDb21wb3NpdGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubGF5b3V0U2VydmljZS5pc1Zpc2libGUodGhpcy5wYXJ0SWQpKSB7XG5cdFx0XHR0aGlzLmxheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbih0cnVlLCB0aGlzLnBhcnRJZCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5oaWRlQWN0aXZlQ29tcG9zaXRlKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZm9jdXNDb21wb3NpdGVCYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5wYW5lQ29tcG9zaXRlQmFyLnZhbHVlPy5mb2N1cygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgbGF5b3V0KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCB0b3A6IG51bWJlciwgbGVmdDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmxheW91dFNlcnZpY2UuaXNWaXNpYmxlKHRoaXMucGFydElkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFJlbWVtYmVyIHRoZSBkaW1lbnNpb24gYXMgcHJvdmlkZWQgYnkgdGhlIGdyaWQgKGJlZm9yZSB0aGUgZmxvYXRpbmcgaW5zZXQgaXNcblx0XHQvLyBhcHBsaWVkKSBzbyByZWxheW91dHMgdHJpZ2dlcmVkIGJ5IGludGVybmFsIGNoYW5nZXMgKHRpdGxlL2hlYWRlci9mb290ZXIpIGZlZWRcblx0XHQvLyBiYWNrIHRoaXMgb3JpZ2luYWwgZGltZW5zaW9uIGluc3RlYWQgb2YgYSByZXBlYXRlZGx5IHNocnVuayBvbmUuXG5cdFx0dGhpcy5mbG9hdGluZ0xheW91dERpbWVuc2lvbiA9IG5ldyBEaW1lbnNpb24od2lkdGgsIGhlaWdodCk7XG5cblx0XHQvLyBXaGVuIHRoZSBmbG9hdGluZyBwYW5lbHMgZXhwZXJpbWVudCBpcyBlbmFibGVkLCBzaHJpbmsgdGhlIGNvbnRlbnQgdG9cblx0XHQvLyBsZWF2ZSByb29tIGZvciB0aGUgY2FyZCBtYXJnaW4gYW5kIGJvcmRlciBhcHBsaWVkIHZpYSBDU1Mgb24gdGhlIHBhcnQuXG5cdFx0Y29uc3QgZmxvYXRpbmdJbnNldCA9IHRoaXMuZ2V0RmxvYXRpbmdJbnNldCgpO1xuXHRcdGlmIChmbG9hdGluZ0luc2V0LndpZHRoID4gMCB8fCBmbG9hdGluZ0luc2V0LmhlaWdodCA+IDApIHtcblx0XHRcdHdpZHRoID0gTWF0aC5tYXgoMCwgd2lkdGggLSBmbG9hdGluZ0luc2V0LndpZHRoKTtcblx0XHRcdGhlaWdodCA9IE1hdGgubWF4KDAsIGhlaWdodCAtIGZsb2F0aW5nSW5zZXQuaGVpZ2h0KTtcblx0XHR9XG5cblx0XHR0aGlzLmNvbnRlbnREaW1lbnNpb24gPSBuZXcgRGltZW5zaW9uKHdpZHRoLCBoZWlnaHQpO1xuXG5cdFx0Ly8gUmVmbGVjdCB3aGljaCB3aW5kb3cgZWRnZXMgdGhpcyBwYXJ0IGlzIHRoZSBvdXRlcm1vc3QgZmxvYXRpbmcgY2FyZCBvbiBzbyB0aGVcblx0XHQvLyBtYXRjaGluZyBkb3VibGVkIG91dGVyIGd1dHRlciBjYW4gYmUgYXBwbGllZCBpbiBDU1MgKGtlcHQgaW4gc3luYyB3aXRoXG5cdFx0Ly8gYGdldEZsb2F0aW5nSW5zZXRgKS5cblx0XHRjb25zdCBvdXRlckd1dHRlciA9IHRoaXMuZ2V0RmxvYXRpbmdPdXRlckd1dHRlckVkZ2VzKCk7XG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2Zsb2F0aW5nLXBhcnQtb3V0ZXItbGVmdCcsIG91dGVyR3V0dGVyLmxlZnQpO1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdmbG9hdGluZy1wYXJ0LW91dGVyLXJpZ2h0Jywgb3V0ZXJHdXR0ZXIucmlnaHQpO1xuXG5cdFx0Ly8gTWlycm9yIHRoZSBwYW5lbCdzIG91dGVyLWVkZ2Ugc3RhdGUgb250byB0aGUgd29ya2JlbmNoIGNvbnRhaW5lciBzbyB0aGVcblx0XHQvLyBob3Jpem9udGFsIGdyaWQgc2FzaCBoaWdobGlnaHQgY2FuIG1hdGNoIHRoZSBwYW5lbCBjYXJkJ3MgZG91YmxlZCBvdXRlclxuXHRcdC8vIGd1dHRlciBieSBzZWxlY3RpbmcgYSBkaXJlY3QgY2xhc3MsIHJhdGhlciB0aGFuIGEgYDpoYXMoKWAgcXVlcnkgb24gdGhlXG5cdFx0Ly8gd29ya2JlbmNoIHJvb3QgKHdoaWNoIHdvdWxkIGZvcmNlIHNlbGVjdG9yIGludmFsaWRhdGlvbiBhY3Jvc3MgdGhlIHdob2xlXG5cdFx0Ly8gd29ya2JlbmNoIG9uIGV2ZXJ5IERPTSBjaGFuZ2UpLiBVcGRhdGVkIGhlcmUgaW4gbG9ja3N0ZXAgd2l0aCB0aGUgcGFydC1sZXZlbFxuXHRcdC8vIGNsYXNzZXMgYWJvdmUsIHNvIHRoZSB0aW1pbmcgaXMgaWRlbnRpY2FsLlxuXHRcdGlmICh0aGlzLnBhcnRJZCA9PT0gUGFydHMuUEFORUxfUEFSVCkge1xuXHRcdFx0Y29uc3Qgd29ya2JlbmNoQ29udGFpbmVyID0gdGhpcy5sYXlvdXRTZXJ2aWNlLmdldENvbnRhaW5lcihnZXRXaW5kb3codGhpcy5lbGVtZW50KSk7XG5cdFx0XHR3b3JrYmVuY2hDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnZmxvYXRpbmctcGFuZWwtb3V0ZXItbGVmdCcsIG91dGVyR3V0dGVyLmxlZnQpO1xuXHRcdFx0d29ya2JlbmNoQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2Zsb2F0aW5nLXBhbmVsLW91dGVyLXJpZ2h0Jywgb3V0ZXJHdXR0ZXIucmlnaHQpO1xuXHRcdH1cblxuXHRcdC8vIExheW91dCBjb250ZW50c1xuXHRcdHN1cGVyLmxheW91dCh0aGlzLmNvbnRlbnREaW1lbnNpb24ud2lkdGgsIHRoaXMuY29udGVudERpbWVuc2lvbi5oZWlnaHQsIHRvcCwgbGVmdCk7XG5cblx0XHQvLyBMYXlvdXQgY29tcG9zaXRlIGJhclxuXHRcdHRoaXMubGF5b3V0Q29tcG9zaXRlQmFyKCk7XG5cblx0XHQvLyBBZGQgZW1wdHkgcGFuZSBtZXNzYWdlXG5cdFx0dGhpcy5sYXlvdXRFbXB0eU1lc3NhZ2UoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgd2luZG93IGVkZ2VzIG9uIHdoaWNoIHRoaXMgcGFydCBpcyB0aGUgb3V0ZXJtb3N0IGZsb2F0aW5nIGNhcmQgYW5kIHRoZXJlZm9yZVxuXHQgKiBhZG9wdHMgYSBkb3VibGVkIG91dGVyIGd1dHRlciwgc28gaXRzIGNvbnRlbnRzIGRvIG5vdCBodWcgdGhlIHdpbmRvdyBlZGdlLiBBcHBsaWVzXG5cdCAqIHRvIHRoZSBwcmltYXJ5IHNpZGUgYmFyLCB0aGUgc2Vjb25kYXJ5IHNpZGUgYmFyIGFuZCB0aGUgcGFuZWw7IGEgaG9yaXpvbnRhbCBwYW5lbFxuXHQgKiBjYW4gb3duIGJvdGggZWRnZXMgYXQgb25jZS5cblx0ICovXG5cdHByaXZhdGUgZ2V0RmxvYXRpbmdPdXRlckd1dHRlckVkZ2VzKCk6IHsgbGVmdDogYm9vbGVhbjsgcmlnaHQ6IGJvb2xlYW4gfSB7XG5cdFx0cmV0dXJuIGdldEZsb2F0aW5nT3V0ZXJHdXR0ZXJFZGdlcyh0aGlzLmxheW91dFNlcnZpY2UsIHRoaXMucGFydElkKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRSZWxheW91dERpbWVuc2lvbigpOiBEaW1lbnNpb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmZsb2F0aW5nTGF5b3V0RGltZW5zaW9uID8/IHN1cGVyLmdldFJlbGF5b3V0RGltZW5zaW9uKCk7XG5cdH1cblxuXHQvKipcblx0ICogQW1vdW50IChpbiBwaXhlbHMpIHRvIHN1YnRyYWN0IGZyb20gZWFjaCBheGlzIHdoZW4gdGhlIGZsb2F0aW5nIHBhbmVsc1xuXHQgKiBleHBlcmltZW50IGlzIGVuYWJsZWQ6IGEgbWFyZ2luIG9uIGVhY2ggc2lkZSBwbHVzIGEgMXB4IGJvcmRlciBvbiBlYWNoIHNpZGVcblx0ICogKHRoZSBib3JkZXIgaXMgZHJhd24gaW5zaWRlIHRoZSBib3gsIGFzIGAubW9uYWNvLXdvcmtiZW5jaCAucGFydGAgaXNcblx0ICogYGJveC1zaXppbmc6IGJvcmRlci1ib3hgIGluIGBwYXJ0LmNzc2ApLiBPbiBlYWNoIHdpbmRvdyBlZGdlIHRoaXMgcGFydCBpcyB0aGUgb3V0ZXJtb3N0XG5cdCAqIGZsb2F0aW5nIGNhcmQgb24gKHNlZSB7QGxpbmsgZ2V0RmxvYXRpbmdPdXRlckd1dHRlckVkZ2VzfSkgaXQgZ2V0cyBhIGRvdWJsZWQgb3V0ZXJcblx0ICogbWFyZ2luLCBzbyBpdHMgd2lkdGggaW5zZXQgaXMgbGFyZ2VyIG9uIHRoYXQgc2lkZS5cblx0ICovXG5cdHByaXZhdGUgZ2V0RmxvYXRpbmdJbnNldCgpOiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0ge1xuXHRcdGlmICghdGhpcy5sYXlvdXRTZXJ2aWNlLmlzRmxvYXRpbmdQYW5lbHNFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybiB7IHdpZHRoOiAwLCBoZWlnaHQ6IDAgfTtcblx0XHR9XG5cblx0XHRjb25zdCBib3JkZXJUb3RhbCA9IDI7IC8vIDFweCBib3JkZXIgb24gZWFjaCBzaWRlXG5cdFx0Y29uc3QgeyB0b3AsIGJvdHRvbSB9ID0gZ2V0RmxvYXRpbmdQYW5lQ29tcG9zaXRlVmVydGljYWxNYXJnaW5zKHRoaXMubGF5b3V0U2VydmljZSwgdGhpcy5wYXJ0SWQsIGdldFdpbmRvdyh0aGlzLmVsZW1lbnQpKTtcblx0XHRjb25zdCB7IGxlZnQsIHJpZ2h0IH0gPSBnZXRGbG9hdGluZ1BhbmVDb21wb3NpdGVIb3Jpem9udGFsTWFyZ2lucyh0aGlzLmxheW91dFNlcnZpY2UsIHRoaXMucGFydElkKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0d2lkdGg6IGxlZnQgKyByaWdodCArIGJvcmRlclRvdGFsLFxuXHRcdFx0aGVpZ2h0OiB0b3AgKyBib3R0b20gKyBib3JkZXJUb3RhbFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGxheW91dENvbXBvc2l0ZUJhcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jb250ZW50RGltZW5zaW9uICYmIHRoaXMuZGltZW5zaW9uICYmIHRoaXMucGFuZUNvbXBvc2l0ZUJhci52YWx1ZSkge1xuXHRcdFx0Y29uc3QgcGFkZGluZyA9IHRoaXMuY29tcG9zaXRlQmFyUG9zaXRpb24gPT09IENvbXBvc2l0ZUJhclBvc2l0aW9uLlRJVExFID8gMTYgOiA4O1xuXHRcdFx0Y29uc3QgYm9yZGVyV2lkdGggPSB0aGlzLnBhcnRJZCA9PT0gUGFydHMuUEFORUxfUEFSVCA/IDAgOiAxO1xuXHRcdFx0bGV0IGF2YWlsYWJsZVdpZHRoID0gdGhpcy5jb250ZW50RGltZW5zaW9uLndpZHRoIC0gcGFkZGluZyAtIGJvcmRlcldpZHRoO1xuXHRcdFx0YXZhaWxhYmxlV2lkdGggPSBNYXRoLm1heChBYnN0cmFjdFBhbmVDb21wb3NpdGVQYXJ0Lk1JTl9DT01QT1NJVEVfQkFSX1dJRFRILCBhdmFpbGFibGVXaWR0aCAtIHRoaXMuZ2V0VG9vbGJhcldpZHRoKCkpO1xuXHRcdFx0dGhpcy5wYW5lQ29tcG9zaXRlQmFyLnZhbHVlLmxheW91dChhdmFpbGFibGVXaWR0aCwgdGhpcy5kaW1lbnNpb24uaGVpZ2h0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGxheW91dEVtcHR5TWVzc2FnZSgpOiB2b2lkIHtcblx0XHRjb25zdCB2aXNpYmxlID0gIXRoaXMuZ2V0QWN0aXZlQ29tcG9zaXRlKCk7XG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2VtcHR5JywgdmlzaWJsZSk7XG5cdFx0aWYgKHZpc2libGUpIHtcblx0XHRcdHRoaXMudGl0bGVMYWJlbD8udXBkYXRlVGl0bGUoJycsICcnKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0VG9vbGJhcldpZHRoKCk6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLnRvb2xCYXIgfHwgdGhpcy5jb21wb3NpdGVCYXJQb3NpdGlvbiAhPT0gQ29tcG9zaXRlQmFyUG9zaXRpb24uVElUTEUpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGl2ZVBhbmUgPSB0aGlzLmdldEFjdGl2ZVBhbmVDb21wb3NpdGUoKTtcblx0XHRpZiAoIWFjdGl2ZVBhbmUpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXHRcdC8vIEVhY2ggdG9vbGJhciBpdGVtIGhhcyA0cHggbWFyZ2luXG5cdFx0Y29uc3QgdG9vbEJhcldpZHRoID0gdGhpcy50b29sQmFyLmdldEl0ZW1zV2lkdGgoKSArIHRoaXMudG9vbEJhci5nZXRJdGVtc0xlbmd0aCgpICogNDtcblx0XHRjb25zdCBnbG9iYWxUb29sQmFyV2lkdGggPSB0aGlzLmdsb2JhbFRvb2xCYXIgPyB0aGlzLmdsb2JhbFRvb2xCYXIuZ2V0SXRlbXNXaWR0aCgpICsgdGhpcy5nbG9iYWxUb29sQmFyLmdldEl0ZW1zTGVuZ3RoKCkgKiA0IDogMDtcblx0XHRyZXR1cm4gdG9vbEJhcldpZHRoICsgZ2xvYmFsVG9vbEJhcldpZHRoICsgODsgLy8gOHB4IHBhZGRpbmcgbGVmdFxuXHR9XG5cblx0cHJpdmF0ZSBvblRpdGxlQXJlYUNvbnRleHRNZW51KGV2ZW50OiBTdGFuZGFyZE1vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5zaG91bGRTaG93Q29tcG9zaXRlQmFyKCkgJiYgdGhpcy5nZXRDb21wb3NpdGVCYXJQb3NpdGlvbigpID09PSBDb21wb3NpdGVCYXJQb3NpdGlvbi5USVRMRSkge1xuXHRcdFx0cmV0dXJuIHRoaXMub25Db21wb3NpdGVCYXJDb250ZXh0TWVudShldmVudCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGFjdGl2ZVBhbmVDb21wb3NpdGUgPSB0aGlzLmdldEFjdGl2ZVBhbmVDb21wb3NpdGUoKSBhcyBQYW5lQ29tcG9zaXRlO1xuXHRcdFx0Y29uc3QgYWN0aXZlUGFuZUNvbXBvc2l0ZUFjdGlvbnMgPSBhY3RpdmVQYW5lQ29tcG9zaXRlID8gYWN0aXZlUGFuZUNvbXBvc2l0ZS5nZXRDb250ZXh0TWVudUFjdGlvbnMoKSA6IFtdO1xuXHRcdFx0aWYgKGFjdGl2ZVBhbmVDb21wb3NpdGVBY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gZXZlbnQsXG5cdFx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aXZlUGFuZUNvbXBvc2l0ZUFjdGlvbnMsXG5cdFx0XHRcdFx0Z2V0QWN0aW9uVmlld0l0ZW06IChhY3Rpb24sIG9wdGlvbnMpID0+IHRoaXMuYWN0aW9uVmlld0l0ZW1Qcm92aWRlcihhY3Rpb24sIG9wdGlvbnMpLFxuXHRcdFx0XHRcdGFjdGlvblJ1bm5lcjogYWN0aXZlUGFuZUNvbXBvc2l0ZS5nZXRBY3Rpb25SdW5uZXIoKSxcblx0XHRcdFx0XHRza2lwVGVsZW1ldHJ5OiB0cnVlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25Db21wb3NpdGVCYXJBcmVhQ29udGV4dE1lbnUoZXZlbnQ6IFN0YW5kYXJkTW91c2VFdmVudCk6IHZvaWQge1xuXHRcdHJldHVybiB0aGlzLm9uQ29tcG9zaXRlQmFyQ29udGV4dE1lbnUoZXZlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkNvbXBvc2l0ZUJhckNvbnRleHRNZW51KGV2ZW50OiBTdGFuZGFyZE1vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5wYW5lQ29tcG9zaXRlQmFyLnZhbHVlKSB7XG5cdFx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbLi4udGhpcy5wYW5lQ29tcG9zaXRlQmFyLnZhbHVlLmdldENvbnRleHRNZW51QWN0aW9ucygpXTtcblx0XHRcdGlmIChhY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gZXZlbnQsXG5cdFx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9ucyxcblx0XHRcdFx0XHRza2lwVGVsZW1ldHJ5OiB0cnVlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBnZXRWaWV3c1N1Ym1lbnVBY3Rpb24oKTogU3VibWVudUFjdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgdmlld1BhbmVDb250YWluZXIgPSAodGhpcy5nZXRBY3RpdmVQYW5lQ29tcG9zaXRlKCkgYXMgUGFuZUNvbXBvc2l0ZSk/LmdldFZpZXdQYW5lQ29udGFpbmVyKCk7XG5cdFx0aWYgKHZpZXdQYW5lQ29udGFpbmVyKSB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGNvbnN0IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHRoaXMuZWxlbWVudCkpO1xuXHRcdFx0c2NvcGVkQ29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KCd2aWV3Q29udGFpbmVyJywgdmlld1BhbmVDb250YWluZXIudmlld0NvbnRhaW5lci5pZCk7XG5cdFx0XHRjb25zdCBtZW51ID0gdGhpcy5tZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhWaWV3c1N1Yk1lbnUsIHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLCB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlLCByZW5kZXJTaG9ydFRpdGxlOiB0cnVlIH0pO1xuXHRcdFx0Y29uc3Qgdmlld3NBY3Rpb25zID0gZ2V0QWN0aW9uQmFyQWN0aW9ucyhtZW51LCAoKSA9PiB0cnVlKS5wcmltYXJ5O1xuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuIHZpZXdzQWN0aW9ucy5sZW5ndGggPiAxICYmIHZpZXdzQWN0aW9ucy5zb21lKGEgPT4gYS5lbmFibGVkKSA/IG5ldyBTdWJtZW51QWN0aW9uKCd2aWV3cycsIGxvY2FsaXplKCd2aWV3cycsIFwiVmlld3NcIiksIHZpZXdzQWN0aW9ucykgOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3Qgc2hvdWxkU2hvd0NvbXBvc2l0ZUJhcigpOiBib29sZWFuO1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZ2V0Q29tcG9zaXRlQmFyT3B0aW9ucygpOiBJUGFuZUNvbXBvc2l0ZUJhck9wdGlvbnM7XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBnZXRDb21wb3NpdGVCYXJQb3NpdGlvbigpOiBDb21wb3NpdGVCYXJQb3NpdGlvbjtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsYUFBYTtBQUN0QixTQUFTLDZCQUE2QjtBQUl0QyxTQUFTLDhCQUFxRDtBQUM5RCxTQUFTLGlCQUFpQix5QkFBeUI7QUFFbkQsU0FBUyx5QkFBeUIsT0FBNEIsNkJBQTZCLDJDQUEyQywrQ0FBK0M7QUFDckwsU0FBUyxxQkFBa0U7QUFDM0UsU0FBbUMsd0JBQXdCO0FBQzNELFNBQVMsV0FBVyxhQUFhLFlBQVksR0FBRyx1QkFBdUIsV0FBVyxTQUFTLGlCQUFpQjtBQUM1RyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyx5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QUFDO0FBQ3hHLFVBQUksMkJBQTJCLFFBQVE7QUFDdEMsYUFBSyxtQkFBbUIsZ0JBQWdCO0FBQUEsVUFDdkMsV0FBVyxNQUFNO0FBQUEsVUFDakIsWUFBWSxNQUFNO0FBQUEsVUFDbEIsbUJBQW1CLENBQUMsUUFBUSxZQUFZLEtBQUssdUJBQXVCLFFBQVEsT0FBTztBQUFBLFVBQ25GLGNBQWMsb0JBQW9CLGdCQUFnQjtBQUFBLFVBQ2xELGVBQWU7QUFBQSxRQUNoQixDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSw4QkFBOEIsT0FBaUM7QUFDdEUsV0FBTyxLQUFLLDBCQUEwQixLQUFLO0FBQUEsRUFDNUM7QUFBQSxFQUVRLDBCQUEwQixPQUFpQztBQUNsRSxRQUFJLEtBQUssaUJBQWlCLE9BQU87QUFDaEMsWUFBTSxVQUFxQixDQUFDLEdBQUcsS0FBSyxpQkFBaUIsTUFBTSxzQkFBc0IsQ0FBQztBQUNsRixVQUFJLFFBQVEsUUFBUTtBQUNuQixhQUFLLG1CQUFtQixnQkFBZ0I7QUFBQSxVQUN2QyxXQUFXLE1BQU07QUFBQSxVQUNqQixZQUFZLE1BQU07QUFBQSxVQUNsQixlQUFlO0FBQUEsUUFDaEIsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVUsd0JBQW1EO0FBQzVELFVBQU0sb0JBQXFCLEtBQUssdUJBQXVCLEdBQXFCLHFCQUFxQjtBQUNqRyxRQUFJLG1CQUFtQjtBQUN0QixZQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsWUFBTSwwQkFBMEIsWUFBWSxJQUFJLEtBQUssa0JBQWtCLGFBQWEsS0FBSyxPQUFPLENBQUM7QUFDakcsOEJBQXdCLFVBQVUsaUJBQWlCLGtCQUFrQixjQUFjLEVBQUU7QUFDckYsWUFBTSxPQUFPLEtBQUssWUFBWSxlQUFlLGNBQWMseUJBQXlCLEVBQUUsbUJBQW1CLE1BQU0sa0JBQWtCLEtBQUssQ0FBQztBQUN2SSxZQUFNLGVBQWUsb0JBQW9CLE1BQU0sTUFBTSxJQUFJLEVBQUU7QUFDM0Qsa0JBQVksUUFBUTtBQUNwQixhQUFPLGFBQWEsU0FBUyxLQUFLLGFBQWEsS0FBSyxPQUFLLEVBQUUsT0FBTyxJQUFJLElBQUksY0FBYyxTQUFTLFNBQVMsU0FBUyxPQUFPLEdBQUcsWUFBWSxJQUFJO0FBQUEsSUFDOUk7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUtEO0FBaHBCc0IsMEJBRUcsMEJBQTBCO0FBRjdCLDRCQUFmO0FBQUEsRUF1Q0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQW5EbUI7IiwKICAibmFtZXMiOiBbIkNvbXBvc2l0ZUJhclBvc2l0aW9uIl0KfQo=
