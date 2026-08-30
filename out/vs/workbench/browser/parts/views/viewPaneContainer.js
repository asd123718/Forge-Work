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
import { $, addDisposableListener, DragAndDropObserver, EventType, getWindow, isAncestor } from "../../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { EventType as TouchEventType, Gesture } from "../../../../base/browser/touch.js";
import { Orientation } from "../../../../base/browser/ui/sash/sash.js";
import { PaneView } from "../../../../base/browser/ui/splitview/paneview.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { combinedDisposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import "./media/paneviewlet.css";
import * as nls from "../../../../nls.js";
import { createActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { activeContrastBorder, asCssVariable } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService, Themable } from "../../../../platform/theme/common/themeService.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { CompositeDragAndDropObserver, toggleDropEffect } from "../../dnd.js";
import { Component } from "../../../common/component.js";
import { PANEL_SECTION_BORDER, PANEL_SECTION_DRAG_AND_DROP_BACKGROUND, PANEL_SECTION_HEADER_BACKGROUND, PANEL_SECTION_HEADER_BORDER, PANEL_SECTION_HEADER_FOREGROUND, SIDE_BAR_DRAG_AND_DROP_BACKGROUND, SIDE_BAR_SECTION_HEADER_BACKGROUND, SIDE_BAR_SECTION_HEADER_BORDER, SIDE_BAR_SECTION_HEADER_FOREGROUND } from "../../../common/theme.js";
import { IViewDescriptorService, ViewContainerLocation, ViewVisibilityState } from "../../../common/views.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { FocusedViewContext } from "../../../common/contextkeys.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { isHorizontal, IWorkbenchLayoutService, LayoutSettings, FLOATING_PANEL_MARGIN, Position } from "../../../services/layout/browser/layoutService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { ViewContainerMenuActions } from "./viewMenuActions.js";
const ViewsSubMenu = new MenuId("Views");
MenuRegistry.appendMenuItem(MenuId.ViewContainerTitle, {
  submenu: ViewsSubMenu,
  title: nls.localize("views", "Views"),
  order: 1
});
var DropDirection = /* @__PURE__ */ ((DropDirection2) => {
  DropDirection2[DropDirection2["UP"] = 0] = "UP";
  DropDirection2[DropDirection2["DOWN"] = 1] = "DOWN";
  DropDirection2[DropDirection2["LEFT"] = 2] = "LEFT";
  DropDirection2[DropDirection2["RIGHT"] = 3] = "RIGHT";
  return DropDirection2;
})(DropDirection || {});
const _ViewPaneDropOverlay = class _ViewPaneDropOverlay extends Themable {
  constructor(paneElement, orientation, bounds, location, themeService) {
    super(themeService);
    this.paneElement = paneElement;
    this.orientation = orientation;
    this.bounds = bounds;
    this.location = location;
    this.cleanupOverlayScheduler = this._register(new RunOnceScheduler(() => this.dispose(), 300));
    this.create();
  }
  get currentDropOperation() {
    return this._currentDropOperation;
  }
  get disposed() {
    return !!this._disposed;
  }
  create() {
    this.container = $("div", { id: _ViewPaneDropOverlay.OVERLAY_ID });
    this.container.style.top = "0px";
    this.paneElement.appendChild(this.container);
    this.paneElement.classList.add("dragged-over");
    this._register(toDisposable(() => {
      this.container.remove();
      this.paneElement.classList.remove("dragged-over");
    }));
    this.overlay = $(".pane-overlay-indicator");
    this.container.appendChild(this.overlay);
    this.registerListeners();
    this.updateStyles();
  }
  updateStyles() {
    this.overlay.style.backgroundColor = this.getColor(this.location === ViewContainerLocation.Panel ? PANEL_SECTION_DRAG_AND_DROP_BACKGROUND : SIDE_BAR_DRAG_AND_DROP_BACKGROUND) || "";
    const activeContrastBorderColor = this.getColor(activeContrastBorder);
    this.overlay.style.outlineColor = activeContrastBorderColor || "";
    this.overlay.style.outlineOffset = activeContrastBorderColor ? "-2px" : "";
    this.overlay.style.outlineStyle = activeContrastBorderColor ? "dashed" : "";
    this.overlay.style.outlineWidth = activeContrastBorderColor ? "2px" : "";
    this.overlay.style.borderColor = activeContrastBorderColor || "";
    this.overlay.style.borderStyle = "solid";
    this.overlay.style.borderWidth = "0px";
  }
  registerListeners() {
    this._register(new DragAndDropObserver(this.container, {
      onDragOver: (e) => {
        this.positionOverlay(e.offsetX, e.offsetY);
        if (this.cleanupOverlayScheduler.isScheduled()) {
          this.cleanupOverlayScheduler.cancel();
        }
      },
      onDragLeave: (e) => this.dispose(),
      onDragEnd: (e) => this.dispose(),
      onDrop: (e) => {
        this.dispose();
      }
    }));
    this._register(addDisposableListener(this.container, EventType.MOUSE_OVER, () => {
      if (!this.cleanupOverlayScheduler.isScheduled()) {
        this.cleanupOverlayScheduler.schedule();
      }
    }));
  }
  positionOverlay(mousePosX, mousePosY) {
    const paneWidth = this.paneElement.clientWidth;
    const paneHeight = this.paneElement.clientHeight;
    const splitWidthThreshold = paneWidth / 2;
    const splitHeightThreshold = paneHeight / 2;
    let dropDirection;
    if (this.orientation === Orientation.VERTICAL) {
      if (mousePosY < splitHeightThreshold) {
        dropDirection = 0 /* UP */;
      } else if (mousePosY >= splitHeightThreshold) {
        dropDirection = 1 /* DOWN */;
      }
    } else if (this.orientation === Orientation.HORIZONTAL) {
      if (mousePosX < splitWidthThreshold) {
        dropDirection = 2 /* LEFT */;
      } else if (mousePosX >= splitWidthThreshold) {
        dropDirection = 3 /* RIGHT */;
      }
    }
    switch (dropDirection) {
      case 0 /* UP */:
        this.doPositionOverlay({ top: "0", left: "0", width: "100%", height: "50%" });
        break;
      case 1 /* DOWN */:
        this.doPositionOverlay({ bottom: "0", left: "0", width: "100%", height: "50%" });
        break;
      case 2 /* LEFT */:
        this.doPositionOverlay({ top: "0", left: "0", width: "50%", height: "100%" });
        break;
      case 3 /* RIGHT */:
        this.doPositionOverlay({ top: "0", right: "0", width: "50%", height: "100%" });
        break;
      default: {
        let top = "0";
        let left = "0";
        let width = "100%";
        let height = "100%";
        if (this.bounds) {
          const boundingRect = this.container.getBoundingClientRect();
          top = `${this.bounds.top - boundingRect.top}px`;
          left = `${this.bounds.left - boundingRect.left}px`;
          height = `${this.bounds.bottom - this.bounds.top}px`;
          width = `${this.bounds.right - this.bounds.left}px`;
        }
        this.doPositionOverlay({ top, left, width, height });
      }
    }
    if (this.orientation === Orientation.VERTICAL && paneHeight <= 25 || this.orientation === Orientation.HORIZONTAL && paneWidth <= 25) {
      this.doUpdateOverlayBorder(dropDirection);
    } else {
      this.doUpdateOverlayBorder(void 0);
    }
    this.overlay.style.opacity = "1";
    setTimeout(() => this.overlay.classList.add("overlay-move-transition"), 0);
    this._currentDropOperation = dropDirection;
  }
  doUpdateOverlayBorder(direction) {
    this.overlay.style.borderTopWidth = direction === 0 /* UP */ ? "2px" : "0px";
    this.overlay.style.borderLeftWidth = direction === 2 /* LEFT */ ? "2px" : "0px";
    this.overlay.style.borderBottomWidth = direction === 1 /* DOWN */ ? "2px" : "0px";
    this.overlay.style.borderRightWidth = direction === 3 /* RIGHT */ ? "2px" : "0px";
  }
  doPositionOverlay(options) {
    this.container.style.height = "100%";
    this.overlay.style.top = options.top || "";
    this.overlay.style.left = options.left || "";
    this.overlay.style.bottom = options.bottom || "";
    this.overlay.style.right = options.right || "";
    this.overlay.style.width = options.width;
    this.overlay.style.height = options.height;
  }
  contains(element) {
    return element === this.container || element === this.overlay;
  }
  dispose() {
    super.dispose();
    this._disposed = true;
  }
};
_ViewPaneDropOverlay.OVERLAY_ID = "monaco-pane-drop-overlay";
let ViewPaneDropOverlay = _ViewPaneDropOverlay;
let ViewPaneContainer = class extends Component {
  constructor(id, options, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService, viewDescriptorService, logService) {
    super(id, themeService, storageService);
    this.options = options;
    this.instantiationService = instantiationService;
    this.configurationService = configurationService;
    this.layoutService = layoutService;
    this.contextMenuService = contextMenuService;
    this.telemetryService = telemetryService;
    this.extensionService = extensionService;
    this.storageService = storageService;
    this.contextService = contextService;
    this.viewDescriptorService = viewDescriptorService;
    this.logService = logService;
    this.paneItems = [];
    this.visible = false;
    this.areExtensionsReady = false;
    this.didLayout = false;
    this._onTitleAreaUpdate = this._register(new Emitter());
    this.onTitleAreaUpdate = this._onTitleAreaUpdate.event;
    this._onDidChangeVisibility = this._register(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    this._onDidAddViews = this._register(new Emitter());
    this.onDidAddViews = this._onDidAddViews.event;
    this._onDidRemoveViews = this._register(new Emitter());
    this.onDidRemoveViews = this._onDidRemoveViews.event;
    this._onDidChangeViewVisibility = this._register(new Emitter());
    this.onDidChangeViewVisibility = this._onDidChangeViewVisibility.event;
    this._onDidFocusView = this._register(new Emitter());
    this.onDidFocusView = this._onDidFocusView.event;
    this._onDidBlurView = this._register(new Emitter());
    this.onDidBlurView = this._onDidBlurView.event;
    const container = this.viewDescriptorService.getViewContainerById(id);
    if (!container) {
      throw new Error("Could not find container");
    }
    this.viewContainer = container;
    this.visibleViewsStorageId = `${id}.numberOfVisibleViews`;
    this.visibleViewsCountFromCache = this.storageService.getNumber(this.visibleViewsStorageId, StorageScope.WORKSPACE, void 0);
    this.viewContainerModel = this.viewDescriptorService.getViewContainerModel(container);
  }
  get onDidSashChange() {
    return assertReturnsDefined(this.paneview).onDidSashChange;
  }
  get panes() {
    return this.paneItems.map((i) => i.pane);
  }
  get views() {
    return this.panes;
  }
  get length() {
    return this.paneItems.length;
  }
  get menuActions() {
    return this._menuActions;
  }
  create(parent) {
    const options = this.options;
    options.orientation = this.orientation;
    this.paneview = this._register(new PaneView(parent, this.options));
    if (this._boundarySashes) {
      this.paneview.setBoundarySashes(this._boundarySashes);
    }
    this._register(this.paneview.onDidDrop(({ from, to }) => this.movePane(from, to)));
    this._register(this.paneview.onDidScroll((_) => this.onDidScrollPane()));
    this._register(this.paneview.onDidSashReset((index) => this.onDidSashReset(index)));
    this._register(addDisposableListener(parent, EventType.CONTEXT_MENU, (e) => this.showContextMenu(new StandardMouseEvent(getWindow(parent), e))));
    this._register(Gesture.addTarget(parent));
    this._register(addDisposableListener(parent, TouchEventType.Contextmenu, (e) => this.showContextMenu(new StandardMouseEvent(getWindow(parent), e))));
    this._menuActions = this._register(this.instantiationService.createInstance(ViewContainerMenuActions, this.paneview.element, this.viewContainer, void 0));
    this._register(this._menuActions.onDidChange(() => this.updateTitleArea()));
    let overlay;
    const getOverlayBounds = () => {
      const fullSize = parent.getBoundingClientRect();
      const lastPane = this.panes[this.panes.length - 1].element.getBoundingClientRect();
      const top = this.orientation === Orientation.VERTICAL ? lastPane.bottom : fullSize.top;
      const left = this.orientation === Orientation.HORIZONTAL ? lastPane.right : fullSize.left;
      return {
        top,
        bottom: fullSize.bottom,
        left,
        right: fullSize.right
      };
    };
    const inBounds = (bounds2, pos) => {
      return pos.x >= bounds2.left && pos.x <= bounds2.right && pos.y >= bounds2.top && pos.y <= bounds2.bottom;
    };
    let bounds;
    if (this.viewDescriptorService.canMoveViews()) {
      this._register(CompositeDragAndDropObserver.INSTANCE.registerTarget(parent, {
        onDragEnter: (e) => {
          bounds = getOverlayBounds();
          if (overlay?.disposed) {
            overlay = void 0;
          }
          if (!overlay && inBounds(bounds, e.eventData)) {
            const dropData = e.dragAndDropData.getData();
            if (dropData.type === "view") {
              const oldViewContainer = this.viewDescriptorService.getViewContainerByViewId(dropData.id);
              const viewDescriptor = this.viewDescriptorService.getViewDescriptorById(dropData.id);
              if (oldViewContainer !== this.viewContainer && (!viewDescriptor || !viewDescriptor.canMoveView || this.viewContainer.rejectAddedViews)) {
                return;
              }
              overlay = new ViewPaneDropOverlay(parent, void 0, bounds, this.viewDescriptorService.getViewContainerLocation(this.viewContainer), this.themeService);
            }
            if (dropData.type === "composite" && dropData.id !== this.viewContainer.id) {
              const container = this.viewDescriptorService.getViewContainerById(dropData.id);
              const viewsToMove = this.viewDescriptorService.getViewContainerModel(container).allViewDescriptors;
              if (!viewsToMove.some((v) => !v.canMoveView) && viewsToMove.length > 0) {
                overlay = new ViewPaneDropOverlay(parent, void 0, bounds, this.viewDescriptorService.getViewContainerLocation(this.viewContainer), this.themeService);
              }
            }
          }
        },
        onDragOver: (e) => {
          if (overlay?.disposed) {
            overlay = void 0;
          }
          if (overlay && !inBounds(bounds, e.eventData)) {
            overlay.dispose();
            overlay = void 0;
          }
          if (inBounds(bounds, e.eventData)) {
            toggleDropEffect(e.eventData.dataTransfer, "move", overlay !== void 0);
          }
        },
        onDragLeave: (e) => {
          overlay?.dispose();
          overlay = void 0;
        },
        onDrop: (e) => {
          if (overlay) {
            const dropData = e.dragAndDropData.getData();
            const viewsToMove = [];
            if (dropData.type === "composite" && dropData.id !== this.viewContainer.id) {
              const container = this.viewDescriptorService.getViewContainerById(dropData.id);
              const allViews = this.viewDescriptorService.getViewContainerModel(container).allViewDescriptors;
              if (!allViews.some((v) => !v.canMoveView)) {
                viewsToMove.push(...allViews);
              }
            } else if (dropData.type === "view") {
              const oldViewContainer = this.viewDescriptorService.getViewContainerByViewId(dropData.id);
              const viewDescriptor = this.viewDescriptorService.getViewDescriptorById(dropData.id);
              if (oldViewContainer !== this.viewContainer && viewDescriptor?.canMoveView) {
                this.viewDescriptorService.moveViewsToContainer([viewDescriptor], this.viewContainer, void 0, "dnd");
              }
            }
            const paneCount = this.panes.length;
            if (viewsToMove.length > 0) {
              this.viewDescriptorService.moveViewsToContainer(viewsToMove, this.viewContainer, void 0, "dnd");
            }
            if (paneCount > 0) {
              for (const view of viewsToMove) {
                const paneToMove = this.panes.find((p) => p.id === view.id);
                if (paneToMove) {
                  this.movePane(paneToMove, this.panes[this.panes.length - 1]);
                }
              }
            }
          }
          overlay?.dispose();
          overlay = void 0;
        }
      }));
    }
    this._register(this.onDidSashChange(() => this.saveViewSizes()));
    this._register(this.viewContainerModel.onDidAddVisibleViewDescriptors((added) => this.onDidAddViewDescriptors(added)));
    this._register(this.viewContainerModel.onDidRemoveVisibleViewDescriptors((removed) => this.onDidRemoveViewDescriptors(removed)));
    const addedViews = this.viewContainerModel.visibleViewDescriptors.map((viewDescriptor, index) => {
      const size = this.viewContainerModel.getSize(viewDescriptor.id);
      const collapsed = this.viewContainerModel.isCollapsed(viewDescriptor.id);
      return { viewDescriptor, index, size, collapsed };
    });
    if (addedViews.length) {
      this.onDidAddViewDescriptors(addedViews);
    }
    this.extensionService.whenInstalledExtensionsRegistered().then(() => {
      this.areExtensionsReady = true;
      if (this.panes.length) {
        this.updateTitleArea();
        this.updateViewHeaders();
      }
      this._register(this.configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION)) {
          this.updateViewHeaders();
        }
      }));
    });
    this._register(this.viewContainerModel.onDidChangeActiveViewDescriptors(() => this._onTitleAreaUpdate.fire()));
  }
  getTitle() {
    const containerTitle = this.viewContainerModel.title;
    if (this.isViewMergedWithContainer()) {
      const singleViewPaneContainerTitle = this.paneItems[0].pane.singleViewPaneContainerTitle;
      if (singleViewPaneContainerTitle) {
        return singleViewPaneContainerTitle;
      }
      const paneItemTitle = this.paneItems[0].pane.title;
      if (containerTitle === paneItemTitle) {
        return paneItemTitle;
      }
      return paneItemTitle ? `${containerTitle}: ${paneItemTitle}` : containerTitle;
    }
    return containerTitle;
  }
  showContextMenu(event) {
    for (const paneItem of this.paneItems) {
      if (isAncestor(event.target, paneItem.pane.element)) {
        return;
      }
    }
    event.stopPropagation();
    event.preventDefault();
    this.contextMenuService.showContextMenu({
      getAnchor: () => event,
      getActions: () => this.menuActions?.getContextMenuActions() ?? []
    });
  }
  getActionsContext() {
    if (this.isViewMergedWithContainer()) {
      return this.panes[0].getActionsContext();
    }
    return void 0;
  }
  getActionViewItem(action, options) {
    if (this.isViewMergedWithContainer()) {
      return this.paneItems[0].pane.createActionViewItem(action, options);
    }
    return createActionViewItem(this.instantiationService, action, options);
  }
  focus() {
    let paneToFocus = void 0;
    if (this.lastFocusedPane) {
      paneToFocus = this.lastFocusedPane;
    } else if (this.paneItems.length > 0) {
      for (const { pane } of this.paneItems) {
        if (pane.isExpanded()) {
          paneToFocus = pane;
          break;
        }
      }
    }
    if (paneToFocus) {
      paneToFocus.focus();
    }
  }
  get orientation() {
    switch (this.viewDescriptorService.getViewContainerLocation(this.viewContainer)) {
      case ViewContainerLocation.Sidebar:
      case ViewContainerLocation.AuxiliaryBar:
        return Orientation.VERTICAL;
      case ViewContainerLocation.Panel: {
        return isHorizontal(this.layoutService.getPanelPosition()) ? Orientation.HORIZONTAL : Orientation.VERTICAL;
      }
    }
    return Orientation.VERTICAL;
  }
  layout(dimension) {
    if (this.paneview) {
      if (this.paneview.orientation !== this.orientation) {
        this.paneview.flipOrientation(dimension.height, dimension.width);
      }
      const bottomGap = !this.layoutService.isFloatingPanelsEnabled() ? 0 : this.viewDescriptorService.getViewContainerLocation(this.viewContainer) === ViewContainerLocation.Panel && this.layoutService.getPanelPosition() === Position.TOP ? 1 : FLOATING_PANEL_MARGIN + 1;
      this.paneview.layout(Math.max(0, dimension.height - bottomGap), dimension.width);
    }
    this.dimension = dimension;
    if (this.didLayout) {
      this.saveViewSizes();
    } else {
      this.didLayout = true;
      this.restoreViewSizes();
    }
  }
  setBoundarySashes(sashes) {
    this._boundarySashes = sashes;
    this.paneview?.setBoundarySashes(sashes);
  }
  getOptimalWidth() {
    const additionalMargin = 16;
    const optimalWidth = Math.max(...this.panes.map((view) => view.getOptimalWidth() || 0));
    return optimalWidth + additionalMargin;
  }
  addPanes(panes) {
    const wasMerged = this.isViewMergedWithContainer();
    for (const { pane, size, index, disposable } of panes) {
      this.addPane(pane, size, disposable, index);
    }
    this.updateViewHeaders();
    if (this.isViewMergedWithContainer() !== wasMerged) {
      this.updateTitleArea();
    }
    this._onDidAddViews.fire(panes.map(({ pane }) => pane));
  }
  setVisible(visible) {
    if (this.visible !== !!visible) {
      this.visible = visible;
      this._onDidChangeVisibility.fire(visible);
    }
    this.panes.filter((view) => view.isVisible() !== visible).map((view) => view.setVisible(visible));
  }
  isVisible() {
    return this.visible;
  }
  updateTitleArea() {
    this._onTitleAreaUpdate.fire();
  }
  createView(viewDescriptor, options) {
    return this.instantiationService.createInstance(viewDescriptor.ctorDescriptor.ctor, ...viewDescriptor.ctorDescriptor.staticArguments || [], options);
  }
  getView(id) {
    return this.panes.filter((view) => view.id === id)[0];
  }
  saveViewSizes() {
    if (this.didLayout) {
      this.viewContainerModel.setSizes(this.panes.map((view) => ({ id: view.id, size: this.getPaneSize(view) })));
    }
  }
  restoreViewSizes() {
    if (this.didLayout) {
      let initialSizes;
      for (const viewDescriptor of this.viewContainerModel.visibleViewDescriptors) {
        const pane = this.getView(viewDescriptor.id);
        if (!pane) {
          continue;
        }
        const size = this.viewContainerModel.getSize(viewDescriptor.id);
        if (typeof size === "number") {
          this.resizePane(pane, size);
        } else {
          initialSizes = initialSizes ? initialSizes : this.computeInitialSizes();
          this.resizePane(pane, initialSizes.get(pane.id) || 200);
        }
      }
    }
  }
  computeInitialSizes() {
    const sizes = /* @__PURE__ */ new Map();
    if (this.dimension) {
      const totalWeight = this.viewContainerModel.visibleViewDescriptors.reduce((totalWeight2, { weight }) => totalWeight2 + (weight || 20), 0);
      for (const viewDescriptor of this.viewContainerModel.visibleViewDescriptors) {
        if (this.orientation === Orientation.VERTICAL) {
          sizes.set(viewDescriptor.id, this.dimension.height * (viewDescriptor.weight || 20) / totalWeight);
        } else {
          sizes.set(viewDescriptor.id, this.dimension.width * (viewDescriptor.weight || 20) / totalWeight);
        }
      }
    }
    return sizes;
  }
  saveState() {
    this.panes.forEach((view) => view.saveState());
    this.storageService.store(this.visibleViewsStorageId, this.length, StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  onContextMenu(event, viewPane) {
    event.stopPropagation();
    event.preventDefault();
    const actions = viewPane.menuActions.getContextMenuActions();
    this.contextMenuService.showContextMenu({
      getAnchor: () => event,
      getActions: () => actions
    });
  }
  openView(id, focus) {
    let view = this.getView(id);
    if (!view) {
      this.toggleViewVisibility(id);
    }
    view = this.getView(id);
    if (view) {
      view.setExpanded(true);
      if (focus) {
        view.focus();
      }
    }
    return view;
  }
  onDidAddViewDescriptors(added) {
    const panesToAdd = [];
    for (const { viewDescriptor, collapsed, index, size } of added) {
      const pane = this.createView(
        viewDescriptor,
        {
          id: viewDescriptor.id,
          title: viewDescriptor.name.value,
          fromExtensionId: viewDescriptor.extensionId,
          expanded: !collapsed,
          singleViewPaneContainerTitle: viewDescriptor.singleViewPaneContainerTitle
        }
      );
      try {
        pane.render();
      } catch (error) {
        this.logService.error(`Fail to render view ${viewDescriptor.id}`, error);
        continue;
      }
      if (pane.draggableElement) {
        const contextMenuDisposable = addDisposableListener(pane.draggableElement, "contextmenu", (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.onContextMenu(new StandardMouseEvent(getWindow(pane.draggableElement), e), pane);
        });
        const collapseDisposable = Event.latch(Event.map(pane.onDidChange, () => !pane.isExpanded()))((collapsed2) => {
          this.viewContainerModel.setCollapsed(viewDescriptor.id, collapsed2);
        });
        panesToAdd.push({ pane, size: size || pane.minimumSize, index, disposable: combinedDisposable(contextMenuDisposable, collapseDisposable) });
      }
    }
    this.addPanes(panesToAdd);
    this.restoreViewSizes();
    const panes = [];
    for (const { pane } of panesToAdd) {
      pane.setVisible(this.isVisible());
      panes.push(pane);
    }
    return panes;
  }
  onDidRemoveViewDescriptors(removed) {
    removed = removed.sort((a, b) => b.index - a.index);
    const panesToRemove = [];
    for (const { index } of removed) {
      const paneItem = this.paneItems[index];
      if (paneItem) {
        panesToRemove.push(this.paneItems[index].pane);
      }
    }
    if (panesToRemove.length) {
      this.removePanes(panesToRemove);
      for (const pane of panesToRemove) {
        pane.setVisible(false);
      }
    }
  }
  toggleViewVisibility(viewId) {
    if (this.viewContainerModel.activeViewDescriptors.some((viewDescriptor) => viewDescriptor.id === viewId)) {
      const visible = !this.viewContainerModel.isVisible(viewId);
      this.viewContainerModel.setVisible(viewId, visible);
    }
  }
  addPane(pane, size, disposable, index = this.paneItems.length - 1) {
    const onDidFocus = pane.onDidFocus(() => {
      this._onDidFocusView.fire(pane);
      this.lastFocusedPane = pane;
    });
    const onDidBlur = pane.onDidBlur(() => this._onDidBlurView.fire(pane));
    const onDidChangeTitleArea = pane.onDidChangeTitleArea(() => {
      if (this.isViewMergedWithContainer()) {
        this.updateTitleArea();
      }
    });
    const onDidChangeVisibility = pane.onDidChangeBodyVisibility(() => this._onDidChangeViewVisibility.fire(pane));
    const onDidChange = pane.onDidChange(() => {
      if (pane === this.lastFocusedPane && !pane.isExpanded()) {
        this.lastFocusedPane = void 0;
      }
    });
    const isPanel = this.viewDescriptorService.getViewContainerLocation(this.viewContainer) === ViewContainerLocation.Panel;
    pane.style({
      headerForeground: asCssVariable(isPanel ? PANEL_SECTION_HEADER_FOREGROUND : SIDE_BAR_SECTION_HEADER_FOREGROUND),
      headerBackground: asCssVariable(isPanel ? PANEL_SECTION_HEADER_BACKGROUND : SIDE_BAR_SECTION_HEADER_BACKGROUND),
      headerBorder: asCssVariable(isPanel ? PANEL_SECTION_HEADER_BORDER : SIDE_BAR_SECTION_HEADER_BORDER),
      dropBackground: asCssVariable(isPanel ? PANEL_SECTION_DRAG_AND_DROP_BACKGROUND : SIDE_BAR_DRAG_AND_DROP_BACKGROUND),
      leftBorder: isPanel ? asCssVariable(PANEL_SECTION_BORDER) : void 0
    });
    const store = new DisposableStore();
    store.add(disposable);
    store.add(combinedDisposable(pane, onDidFocus, onDidBlur, onDidChangeTitleArea, onDidChange, onDidChangeVisibility));
    const paneItem = { pane, disposable: store };
    this.paneItems.splice(index, 0, paneItem);
    assertReturnsDefined(this.paneview).addPane(pane, size, index);
    let overlay;
    if (this.viewDescriptorService.canMoveViews()) {
      if (pane.draggableElement) {
        store.add(CompositeDragAndDropObserver.INSTANCE.registerDraggable(pane.draggableElement, () => {
          return { type: "view", id: pane.id };
        }, {}));
      }
      store.add(CompositeDragAndDropObserver.INSTANCE.registerTarget(pane.dropTargetElement, {
        onDragEnter: (e) => {
          if (!overlay) {
            const dropData = e.dragAndDropData.getData();
            if (dropData.type === "view" && dropData.id !== pane.id) {
              const oldViewContainer = this.viewDescriptorService.getViewContainerByViewId(dropData.id);
              const viewDescriptor = this.viewDescriptorService.getViewDescriptorById(dropData.id);
              if (oldViewContainer !== this.viewContainer && (!viewDescriptor || !viewDescriptor.canMoveView || this.viewContainer.rejectAddedViews)) {
                return;
              }
              overlay = new ViewPaneDropOverlay(pane.dropTargetElement, this.orientation ?? Orientation.VERTICAL, void 0, this.viewDescriptorService.getViewContainerLocation(this.viewContainer), this.themeService);
            }
            if (dropData.type === "composite" && dropData.id !== this.viewContainer.id && !this.viewContainer.rejectAddedViews) {
              const container = this.viewDescriptorService.getViewContainerById(dropData.id);
              const viewsToMove = this.viewDescriptorService.getViewContainerModel(container).allViewDescriptors;
              if (!viewsToMove.some((v) => !v.canMoveView) && viewsToMove.length > 0) {
                overlay = new ViewPaneDropOverlay(pane.dropTargetElement, this.orientation ?? Orientation.VERTICAL, void 0, this.viewDescriptorService.getViewContainerLocation(this.viewContainer), this.themeService);
              }
            }
          }
        },
        onDragOver: (e) => {
          toggleDropEffect(e.eventData.dataTransfer, "move", overlay !== void 0);
        },
        onDragLeave: (e) => {
          overlay?.dispose();
          overlay = void 0;
        },
        onDrop: (e) => {
          if (overlay) {
            const dropData = e.dragAndDropData.getData();
            const viewsToMove = [];
            let anchorView;
            if (dropData.type === "composite" && dropData.id !== this.viewContainer.id && !this.viewContainer.rejectAddedViews) {
              const container = this.viewDescriptorService.getViewContainerById(dropData.id);
              const allViews = this.viewDescriptorService.getViewContainerModel(container).allViewDescriptors;
              if (allViews.length > 0 && !allViews.some((v) => !v.canMoveView)) {
                viewsToMove.push(...allViews);
                anchorView = allViews[0];
              }
            } else if (dropData.type === "view") {
              const oldViewContainer = this.viewDescriptorService.getViewContainerByViewId(dropData.id);
              const viewDescriptor = this.viewDescriptorService.getViewDescriptorById(dropData.id);
              if (oldViewContainer !== this.viewContainer && viewDescriptor && viewDescriptor.canMoveView && !this.viewContainer.rejectAddedViews) {
                viewsToMove.push(viewDescriptor);
              }
              if (viewDescriptor) {
                anchorView = viewDescriptor;
              }
            }
            if (viewsToMove) {
              this.viewDescriptorService.moveViewsToContainer(viewsToMove, this.viewContainer, void 0, "dnd");
            }
            if (anchorView) {
              if (overlay.currentDropOperation === 1 /* DOWN */ || overlay.currentDropOperation === 3 /* RIGHT */) {
                const fromIndex = this.panes.findIndex((p) => p.id === anchorView.id);
                let toIndex = this.panes.findIndex((p) => p.id === pane.id);
                if (fromIndex >= 0 && toIndex >= 0) {
                  if (fromIndex > toIndex) {
                    toIndex++;
                  }
                  if (toIndex < this.panes.length && toIndex !== fromIndex) {
                    this.movePane(this.panes[fromIndex], this.panes[toIndex]);
                  }
                }
              }
              if (overlay.currentDropOperation === 0 /* UP */ || overlay.currentDropOperation === 2 /* LEFT */) {
                const fromIndex = this.panes.findIndex((p) => p.id === anchorView.id);
                let toIndex = this.panes.findIndex((p) => p.id === pane.id);
                if (fromIndex >= 0 && toIndex >= 0) {
                  if (fromIndex < toIndex) {
                    toIndex--;
                  }
                  if (toIndex >= 0 && toIndex !== fromIndex) {
                    this.movePane(this.panes[fromIndex], this.panes[toIndex]);
                  }
                }
              }
              if (viewsToMove.length > 1) {
                viewsToMove.slice(1).forEach((view) => {
                  let toIndex = this.panes.findIndex((p) => p.id === anchorView.id);
                  const fromIndex = this.panes.findIndex((p) => p.id === view.id);
                  if (fromIndex >= 0 && toIndex >= 0) {
                    if (fromIndex > toIndex) {
                      toIndex++;
                    }
                    if (toIndex < this.panes.length && toIndex !== fromIndex) {
                      this.movePane(this.panes[fromIndex], this.panes[toIndex]);
                      anchorView = view;
                    }
                  }
                });
              }
            }
          }
          overlay?.dispose();
          overlay = void 0;
        }
      }));
    }
  }
  removePanes(panes) {
    const wasMerged = this.isViewMergedWithContainer();
    panes.forEach((pane) => this.removePane(pane));
    this.updateViewHeaders();
    if (wasMerged !== this.isViewMergedWithContainer()) {
      this.updateTitleArea();
    }
    this._onDidRemoveViews.fire(panes);
  }
  removePane(pane) {
    const index = this.paneItems.findIndex((i) => i.pane === pane);
    if (index === -1) {
      return;
    }
    if (this.lastFocusedPane === pane) {
      this.lastFocusedPane = void 0;
    }
    assertReturnsDefined(this.paneview).removePane(pane);
    const [paneItem] = this.paneItems.splice(index, 1);
    paneItem.disposable.dispose();
  }
  movePane(from, to) {
    const fromIndex = this.paneItems.findIndex((item) => item.pane === from);
    const toIndex = this.paneItems.findIndex((item) => item.pane === to);
    const fromViewDescriptor = this.viewContainerModel.visibleViewDescriptors[fromIndex];
    const toViewDescriptor = this.viewContainerModel.visibleViewDescriptors[toIndex];
    if (fromIndex < 0 || fromIndex >= this.paneItems.length) {
      return;
    }
    if (toIndex < 0 || toIndex >= this.paneItems.length) {
      return;
    }
    const [paneItem] = this.paneItems.splice(fromIndex, 1);
    this.paneItems.splice(toIndex, 0, paneItem);
    assertReturnsDefined(this.paneview).movePane(from, to);
    this.viewContainerModel.move(fromViewDescriptor.id, toViewDescriptor.id);
    this.updateTitleArea();
  }
  resizePane(pane, size) {
    assertReturnsDefined(this.paneview).resizePane(pane, size);
  }
  getPaneSize(pane) {
    return assertReturnsDefined(this.paneview).getPaneSize(pane);
  }
  updateViewHeaders() {
    if (this.isViewMergedWithContainer()) {
      if (this.paneItems[0].pane.isExpanded()) {
        this.lastMergedCollapsedPane = void 0;
      } else {
        this.lastMergedCollapsedPane = this.paneItems[0].pane;
        this.paneItems[0].pane.setExpanded(true);
      }
      this.paneItems[0].pane.headerVisible = false;
      this.paneItems[0].pane.collapsible = true;
    } else {
      if (this.paneItems.length === 1) {
        this.paneItems[0].pane.headerVisible = true;
        if (this.paneItems[0].pane === this.lastMergedCollapsedPane) {
          this.paneItems[0].pane.setExpanded(false);
        }
        this.paneItems[0].pane.collapsible = false;
      } else {
        this.paneItems.forEach((i) => {
          i.pane.headerVisible = true;
          i.pane.collapsible = true;
          if (i.pane === this.lastMergedCollapsedPane) {
            i.pane.setExpanded(false);
          }
        });
      }
      this.lastMergedCollapsedPane = void 0;
    }
  }
  isViewMergedWithContainer() {
    if (!(this.options.mergeViewWithContainerWhenSingleView && this.paneItems.length === 1)) {
      return false;
    }
    if (!this.areExtensionsReady) {
      if (this.visibleViewsCountFromCache === void 0) {
        return this.paneItems[0].pane.isExpanded();
      }
      return this.visibleViewsCountFromCache === 1;
    }
    return true;
  }
  onDidScrollPane() {
    for (const pane of this.panes) {
      pane.onDidScrollRoot();
    }
  }
  onDidSashReset(index) {
    let firstPane = void 0;
    let secondPane = void 0;
    for (let i = index; i >= 0; i--) {
      if (this.paneItems[i].pane?.isVisible() && this.paneItems[i]?.pane.isExpanded()) {
        firstPane = this.paneItems[i].pane;
        break;
      }
    }
    for (let i = index + 1; i < this.paneItems.length; i++) {
      if (this.paneItems[i].pane?.isVisible() && this.paneItems[i]?.pane.isExpanded()) {
        secondPane = this.paneItems[i].pane;
        break;
      }
    }
    if (firstPane && secondPane) {
      const firstPaneSize = this.getPaneSize(firstPane);
      const secondPaneSize = this.getPaneSize(secondPane);
      const newFirstPaneSize = Math.ceil((firstPaneSize + secondPaneSize) / 2);
      const newSecondPaneSize = Math.floor((firstPaneSize + secondPaneSize) / 2);
      if (firstPaneSize > secondPaneSize) {
        this.resizePane(firstPane, newFirstPaneSize);
        this.resizePane(secondPane, newSecondPaneSize);
      } else {
        this.resizePane(secondPane, newSecondPaneSize);
        this.resizePane(firstPane, newFirstPaneSize);
      }
    }
  }
  dispose() {
    super.dispose();
    this.paneItems.forEach((i) => i.disposable.dispose());
    if (this.paneview) {
      this.paneview.dispose();
    }
  }
};
ViewPaneContainer = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IWorkbenchLayoutService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, IExtensionService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IStorageService),
  __decorateParam(10, IWorkspaceContextService),
  __decorateParam(11, IViewDescriptorService),
  __decorateParam(12, ILogService)
], ViewPaneContainer);
class ViewPaneContainerAction extends Action2 {
  constructor(desc) {
    super(desc);
    this.desc = desc;
  }
  run(accessor, ...args) {
    const viewPaneContainer = accessor.get(IViewsService).getActiveViewPaneContainerWithId(this.desc.viewPaneContainerId);
    if (viewPaneContainer) {
      return this.runInViewPaneContainer(accessor, viewPaneContainer, ...args);
    }
    return void 0;
  }
}
class MoveViewPosition extends Action2 {
  constructor(desc, offset) {
    super(desc);
    this.offset = offset;
  }
  async run(accessor) {
    const viewDescriptorService = accessor.get(IViewDescriptorService);
    const contextKeyService = accessor.get(IContextKeyService);
    const viewId = FocusedViewContext.getValue(contextKeyService);
    if (viewId === void 0) {
      return;
    }
    const viewContainer = viewDescriptorService.getViewContainerByViewId(viewId);
    const model = viewDescriptorService.getViewContainerModel(viewContainer);
    const viewDescriptor = model.visibleViewDescriptors.find((vd) => vd.id === viewId);
    const currentIndex = model.visibleViewDescriptors.indexOf(viewDescriptor);
    if (currentIndex + this.offset < 0 || currentIndex + this.offset >= model.visibleViewDescriptors.length) {
      return;
    }
    const newPosition = model.visibleViewDescriptors[currentIndex + this.offset];
    model.move(viewDescriptor.id, newPosition.id);
  }
}
registerAction2(
  class MoveViewUp extends MoveViewPosition {
    constructor() {
      super({
        id: "views.moveViewUp",
        title: nls.localize("viewMoveUp", "Move View Up"),
        keybinding: {
          primary: KeyChord(KeyMod.CtrlCmd + KeyCode.KeyK, KeyCode.UpArrow),
          weight: KeybindingWeight.WorkbenchContrib + 1,
          when: FocusedViewContext.notEqualsTo("")
        }
      }, -1);
    }
  }
);
registerAction2(
  class MoveViewLeft extends MoveViewPosition {
    constructor() {
      super({
        id: "views.moveViewLeft",
        title: nls.localize("viewMoveLeft", "Move View Left"),
        keybinding: {
          primary: KeyChord(KeyMod.CtrlCmd + KeyCode.KeyK, KeyCode.LeftArrow),
          weight: KeybindingWeight.WorkbenchContrib + 1,
          when: FocusedViewContext.notEqualsTo("")
        }
      }, -1);
    }
  }
);
registerAction2(
  class MoveViewDown extends MoveViewPosition {
    constructor() {
      super({
        id: "views.moveViewDown",
        title: nls.localize("viewMoveDown", "Move View Down"),
        keybinding: {
          primary: KeyChord(KeyMod.CtrlCmd + KeyCode.KeyK, KeyCode.DownArrow),
          weight: KeybindingWeight.WorkbenchContrib + 1,
          when: FocusedViewContext.notEqualsTo("")
        }
      }, 1);
    }
  }
);
registerAction2(
  class MoveViewRight extends MoveViewPosition {
    constructor() {
      super({
        id: "views.moveViewRight",
        title: nls.localize("viewMoveRight", "Move View Right"),
        keybinding: {
          primary: KeyChord(KeyMod.CtrlCmd + KeyCode.KeyK, KeyCode.RightArrow),
          weight: KeybindingWeight.WorkbenchContrib + 1,
          when: FocusedViewContext.notEqualsTo("")
        }
      }, 1);
    }
  }
);
registerAction2(class MoveViews extends Action2 {
  constructor() {
    super({
      id: "vscode.moveViews",
      title: nls.localize("viewsMove", "Move Views")
    });
  }
  async run(accessor, options) {
    if (!Array.isArray(options?.viewIds) || typeof options?.destinationId !== "string") {
      return Promise.reject("Invalid arguments");
    }
    const viewDescriptorService = accessor.get(IViewDescriptorService);
    const destination = viewDescriptorService.getViewContainerById(options.destinationId);
    if (!destination) {
      return;
    }
    for (const viewId of options.viewIds) {
      const viewDescriptor = viewDescriptorService.getViewDescriptorById(viewId);
      if (viewDescriptor?.canMoveView) {
        viewDescriptorService.moveViewsToContainer([viewDescriptor], destination, ViewVisibilityState.Default, this.desc.id);
      }
    }
    await accessor.get(IViewsService).openViewContainer(destination.id, true);
  }
});
export {
  ViewPaneContainer,
  ViewPaneContainerAction,
  ViewsSubMenu
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFx2aWV3c1xcdmlld1BhbmVDb250YWluZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyAkLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIERpbWVuc2lvbiwgRHJhZ0FuZERyb3BPYnNlcnZlciwgRXZlbnRUeXBlLCBnZXRXaW5kb3csIGlzQW5jZXN0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IEV2ZW50VHlwZSBhcyBUb3VjaEV2ZW50VHlwZSwgR2VzdHVyZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90b3VjaC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBJQm91bmRhcnlTYXNoZXMsIE9yaWVudGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Nhc2gvc2FzaC5qcyc7XG5pbXBvcnQgeyBJUGFuZVZpZXdPcHRpb25zLCBQYW5lVmlldyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zcGxpdHZpZXcvcGFuZXZpZXcuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q2hvcmQsIEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IGNvbWJpbmVkRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0ICcuL21lZGlhL3BhbmV2aWV3bGV0LmNzcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIElBY3Rpb24yT3B0aW9ucywgSVN1Ym1lbnVJdGVtLCBNZW51SWQsIE1lbnVSZWdpc3RyeSwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBhY3RpdmVDb250cmFzdEJvcmRlciwgYXNDc3NWYXJpYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UsIFRoZW1hYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBDb21wb3NpdGVEcmFnQW5kRHJvcE9ic2VydmVyLCB0b2dnbGVEcm9wRWZmZWN0IH0gZnJvbSAnLi4vLi4vZG5kLmpzJztcbmltcG9ydCB7IFZpZXdQYW5lIH0gZnJvbSAnLi92aWV3UGFuZS5qcyc7XG5pbXBvcnQgeyBJVmlld2xldFZpZXdPcHRpb25zIH0gZnJvbSAnLi92aWV3c1ZpZXdsZXQuanMnO1xuaW1wb3J0IHsgQ29tcG9uZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbXBvbmVudC5qcyc7XG5pbXBvcnQgeyBQQU5FTF9TRUNUSU9OX0JPUkRFUiwgUEFORUxfU0VDVElPTl9EUkFHX0FORF9EUk9QX0JBQ0tHUk9VTkQsIFBBTkVMX1NFQ1RJT05fSEVBREVSX0JBQ0tHUk9VTkQsIFBBTkVMX1NFQ1RJT05fSEVBREVSX0JPUkRFUiwgUEFORUxfU0VDVElPTl9IRUFERVJfRk9SRUdST1VORCwgU0lERV9CQVJfRFJBR19BTkRfRFJPUF9CQUNLR1JPVU5ELCBTSURFX0JBUl9TRUNUSU9OX0hFQURFUl9CQUNLR1JPVU5ELCBTSURFX0JBUl9TRUNUSU9OX0hFQURFUl9CT1JERVIsIFNJREVfQkFSX1NFQ1RJT05fSEVBREVSX0ZPUkVHUk9VTkQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgSUFkZGVkVmlld0Rlc2NyaXB0b3JSZWYsIElDdXN0b21WaWV3RGVzY3JpcHRvciwgSVZpZXcsIElWaWV3Q29udGFpbmVyTW9kZWwsIElWaWV3RGVzY3JpcHRvciwgSVZpZXdEZXNjcmlwdG9yUmVmLCBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBJVmlld1BhbmVDb250YWluZXIsIFZpZXdDb250YWluZXIsIFZpZXdDb250YWluZXJMb2NhdGlvbiwgVmlld1Zpc2liaWxpdHlTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBGb2N1c2VkVmlld0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGlzSG9yaXpvbnRhbCwgSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIExheW91dFNldHRpbmdzLCBGTE9BVElOR19QQU5FTF9NQVJHSU4sIFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgVmlld0NvbnRhaW5lck1lbnVBY3Rpb25zIH0gZnJvbSAnLi92aWV3TWVudUFjdGlvbnMuanMnO1xuXG5leHBvcnQgY29uc3QgVmlld3NTdWJNZW51ID0gbmV3IE1lbnVJZCgnVmlld3MnKTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuVmlld0NvbnRhaW5lclRpdGxlLCB7XG5cdHN1Ym1lbnU6IFZpZXdzU3ViTWVudSxcblx0dGl0bGU6IG5scy5sb2NhbGl6ZSgndmlld3MnLCBcIlZpZXdzXCIpLFxuXHRvcmRlcjogMSxcbn0gc2F0aXNmaWVzIElTdWJtZW51SXRlbSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVZpZXdQYW5lQ29udGFpbmVyT3B0aW9ucyBleHRlbmRzIElQYW5lVmlld09wdGlvbnMge1xuXHRtZXJnZVZpZXdXaXRoQ29udGFpbmVyV2hlblNpbmdsZVZpZXc6IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBJVmlld1BhbmVJdGVtIHtcblx0cGFuZTogVmlld1BhbmU7XG5cdGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlO1xufVxuXG5jb25zdCBlbnVtIERyb3BEaXJlY3Rpb24ge1xuXHRVUCxcblx0RE9XTixcblx0TEVGVCxcblx0UklHSFRcbn1cblxudHlwZSBCb3VuZGluZ1JlY3QgPSB7IHRvcDogbnVtYmVyOyBsZWZ0OiBudW1iZXI7IGJvdHRvbTogbnVtYmVyOyByaWdodDogbnVtYmVyIH07XG5cbmNsYXNzIFZpZXdQYW5lRHJvcE92ZXJsYXkgZXh0ZW5kcyBUaGVtYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgT1ZFUkxBWV9JRCA9ICdtb25hY28tcGFuZS1kcm9wLW92ZXJsYXknO1xuXG5cdHByaXZhdGUgY29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgb3ZlcmxheSE6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgX2N1cnJlbnREcm9wT3BlcmF0aW9uOiBEcm9wRGlyZWN0aW9uIHwgdW5kZWZpbmVkO1xuXG5cdC8vIHByaXZhdGUgY3VycmVudERyb3BPcGVyYXRpb246IElEcm9wT3BlcmF0aW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9kaXNwb3NlZDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGNsZWFudXBPdmVybGF5U2NoZWR1bGVyOiBSdW5PbmNlU2NoZWR1bGVyO1xuXG5cdGdldCBjdXJyZW50RHJvcE9wZXJhdGlvbigpOiBEcm9wRGlyZWN0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY3VycmVudERyb3BPcGVyYXRpb247XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHBhbmVFbGVtZW50OiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbiB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIGJvdW5kczogQm91bmRpbmdSZWN0IHwgdW5kZWZpbmVkLFxuXHRcdHByb3RlY3RlZCBsb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uLFxuXHRcdHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIodGhlbWVTZXJ2aWNlKTtcblx0XHR0aGlzLmNsZWFudXBPdmVybGF5U2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5kaXNwb3NlKCksIDMwMCkpO1xuXG5cdFx0dGhpcy5jcmVhdGUoKTtcblx0fVxuXG5cdGdldCBkaXNwb3NlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLl9kaXNwb3NlZDtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlKCk6IHZvaWQge1xuXG5cdFx0Ly8gQ29udGFpbmVyXG5cdFx0dGhpcy5jb250YWluZXIgPSAkKCdkaXYnLCB7IGlkOiBWaWV3UGFuZURyb3BPdmVybGF5Lk9WRVJMQVlfSUQgfSk7XG5cdFx0dGhpcy5jb250YWluZXIuc3R5bGUudG9wID0gJzBweCc7XG5cblx0XHQvLyBQYXJlbnRcblx0XHR0aGlzLnBhbmVFbGVtZW50LmFwcGVuZENoaWxkKHRoaXMuY29udGFpbmVyKTtcblx0XHR0aGlzLnBhbmVFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2RyYWdnZWQtb3ZlcicpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5yZW1vdmUoKTtcblx0XHRcdHRoaXMucGFuZUVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnZHJhZ2dlZC1vdmVyJyk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gT3ZlcmxheVxuXHRcdHRoaXMub3ZlcmxheSA9ICQoJy5wYW5lLW92ZXJsYXktaW5kaWNhdG9yJyk7XG5cdFx0dGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5vdmVybGF5KTtcblxuXHRcdC8vIE92ZXJsYXkgRXZlbnQgSGFuZGxpbmdcblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cblx0XHQvLyBTdHlsZXNcblx0XHR0aGlzLnVwZGF0ZVN0eWxlcygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlU3R5bGVzKCk6IHZvaWQge1xuXG5cdFx0Ly8gT3ZlcmxheSBkcm9wIGJhY2tncm91bmRcblx0XHR0aGlzLm92ZXJsYXkuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gdGhpcy5nZXRDb2xvcih0aGlzLmxvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwgPyBQQU5FTF9TRUNUSU9OX0RSQUdfQU5EX0RST1BfQkFDS0dST1VORCA6IFNJREVfQkFSX0RSQUdfQU5EX0RST1BfQkFDS0dST1VORCkgfHwgJyc7XG5cblx0XHQvLyBPdmVybGF5IGNvbnRyYXN0IGJvcmRlciAoaWYgYW55KVxuXHRcdGNvbnN0IGFjdGl2ZUNvbnRyYXN0Qm9yZGVyQ29sb3IgPSB0aGlzLmdldENvbG9yKGFjdGl2ZUNvbnRyYXN0Qm9yZGVyKTtcblx0XHR0aGlzLm92ZXJsYXkuc3R5bGUub3V0bGluZUNvbG9yID0gYWN0aXZlQ29udHJhc3RCb3JkZXJDb2xvciB8fCAnJztcblx0XHR0aGlzLm92ZXJsYXkuc3R5bGUub3V0bGluZU9mZnNldCA9IGFjdGl2ZUNvbnRyYXN0Qm9yZGVyQ29sb3IgPyAnLTJweCcgOiAnJztcblx0XHR0aGlzLm92ZXJsYXkuc3R5bGUub3V0bGluZVN0eWxlID0gYWN0aXZlQ29udHJhc3RCb3JkZXJDb2xvciA/ICdkYXNoZWQnIDogJyc7XG5cdFx0dGhpcy5vdmVybGF5LnN0eWxlLm91dGxpbmVXaWR0aCA9IGFjdGl2ZUNvbnRyYXN0Qm9yZGVyQ29sb3IgPyAnMnB4JyA6ICcnO1xuXG5cdFx0dGhpcy5vdmVybGF5LnN0eWxlLmJvcmRlckNvbG9yID0gYWN0aXZlQ29udHJhc3RCb3JkZXJDb2xvciB8fCAnJztcblx0XHR0aGlzLm92ZXJsYXkuc3R5bGUuYm9yZGVyU3R5bGUgPSAnc29saWQnO1xuXHRcdHRoaXMub3ZlcmxheS5zdHlsZS5ib3JkZXJXaWR0aCA9ICcwcHgnO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihuZXcgRHJhZ0FuZERyb3BPYnNlcnZlcih0aGlzLmNvbnRhaW5lciwge1xuXHRcdFx0b25EcmFnT3ZlcjogZSA9PiB7XG5cblx0XHRcdFx0Ly8gUG9zaXRpb24gb3ZlcmxheVxuXHRcdFx0XHR0aGlzLnBvc2l0aW9uT3ZlcmxheShlLm9mZnNldFgsIGUub2Zmc2V0WSk7XG5cblx0XHRcdFx0Ly8gTWFrZSBzdXJlIHRvIHN0b3AgYW55IHJ1bm5pbmcgY2xlYW51cCBzY2hlZHVsZXIgdG8gcmVtb3ZlIHRoZSBvdmVybGF5XG5cdFx0XHRcdGlmICh0aGlzLmNsZWFudXBPdmVybGF5U2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0XHR0aGlzLmNsZWFudXBPdmVybGF5U2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXG5cdFx0XHRvbkRyYWdMZWF2ZTogZSA9PiB0aGlzLmRpc3Bvc2UoKSxcblx0XHRcdG9uRHJhZ0VuZDogZSA9PiB0aGlzLmRpc3Bvc2UoKSxcblxuXHRcdFx0b25Ecm9wOiBlID0+IHtcblx0XHRcdFx0Ly8gRGlzcG9zZSBvdmVybGF5XG5cdFx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNvbnRhaW5lciwgRXZlbnRUeXBlLk1PVVNFX09WRVIsICgpID0+IHtcblx0XHRcdC8vIFVuZGVyIHNvbWUgY2lyY3Vtc3RhbmNlcyB3ZSBoYXZlIHNlZW4gcmVwb3J0cyB3aGVyZSB0aGUgZHJvcCBvdmVybGF5IGlzIG5vdCBiZWluZ1xuXHRcdFx0Ly8gY2xlYW5lZCB1cCBhbmQgYXMgc3VjaCB0aGUgZWRpdG9yIGFyZWEgcmVtYWlucyB1bmRlciB0aGUgb3ZlcmxheSBzbyB0aGF0IHlvdSBjYW5ub3Rcblx0XHRcdC8vIHR5cGUgaW50byB0aGUgZWRpdG9yIGFueW1vcmUuIFRoaXMgc2VlbXMgcmVsYXRlZCB0byB1c2luZyBWTXMgYW5kIERORCB2aWEgaG9zdCBhbmRcblx0XHRcdC8vIGd1ZXN0IE9TLCB0aG91Z2ggc29tZSB1c2VycyBhbHNvIHNhdyBpdCB3aXRob3V0IFZNcy5cblx0XHRcdC8vIFRvIHByb3RlY3QgYWdhaW5zdCB0aGlzIGlzc3VlIHdlIGFsd2F5cyBkZXN0cm95IHRoZSBvdmVybGF5IGFzIHNvb24gYXMgd2UgZGV0ZWN0IGFcblx0XHRcdC8vIG1vdXNlIGV2ZW50IG92ZXIgaXQuIFRoZSBkZWxheSBpcyB1c2VkIHRvIGd1YXJhbnRlZSB3ZSBhcmUgbm90IGludGVyZmVyaW5nIHdpdGggdGhlXG5cdFx0XHQvLyBhY3R1YWwgRFJPUCBldmVudCB0aGF0IGNhbiBhbHNvIHRyaWdnZXIgYSBtb3VzZSBvdmVyIGV2ZW50LlxuXHRcdFx0aWYgKCF0aGlzLmNsZWFudXBPdmVybGF5U2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0dGhpcy5jbGVhbnVwT3ZlcmxheVNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcG9zaXRpb25PdmVybGF5KG1vdXNlUG9zWDogbnVtYmVyLCBtb3VzZVBvc1k6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHBhbmVXaWR0aCA9IHRoaXMucGFuZUVsZW1lbnQuY2xpZW50V2lkdGg7XG5cdFx0Y29uc3QgcGFuZUhlaWdodCA9IHRoaXMucGFuZUVsZW1lbnQuY2xpZW50SGVpZ2h0O1xuXG5cdFx0Y29uc3Qgc3BsaXRXaWR0aFRocmVzaG9sZCA9IHBhbmVXaWR0aCAvIDI7XG5cdFx0Y29uc3Qgc3BsaXRIZWlnaHRUaHJlc2hvbGQgPSBwYW5lSGVpZ2h0IC8gMjtcblxuXHRcdGxldCBkcm9wRGlyZWN0aW9uOiBEcm9wRGlyZWN0aW9uIHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMKSB7XG5cdFx0XHRpZiAobW91c2VQb3NZIDwgc3BsaXRIZWlnaHRUaHJlc2hvbGQpIHtcblx0XHRcdFx0ZHJvcERpcmVjdGlvbiA9IERyb3BEaXJlY3Rpb24uVVA7XG5cdFx0XHR9IGVsc2UgaWYgKG1vdXNlUG9zWSA+PSBzcGxpdEhlaWdodFRocmVzaG9sZCkge1xuXHRcdFx0XHRkcm9wRGlyZWN0aW9uID0gRHJvcERpcmVjdGlvbi5ET1dOO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAodGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCkge1xuXHRcdFx0aWYgKG1vdXNlUG9zWCA8IHNwbGl0V2lkdGhUaHJlc2hvbGQpIHtcblx0XHRcdFx0ZHJvcERpcmVjdGlvbiA9IERyb3BEaXJlY3Rpb24uTEVGVDtcblx0XHRcdH0gZWxzZSBpZiAobW91c2VQb3NYID49IHNwbGl0V2lkdGhUaHJlc2hvbGQpIHtcblx0XHRcdFx0ZHJvcERpcmVjdGlvbiA9IERyb3BEaXJlY3Rpb24uUklHSFQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRHJhdyBvdmVybGF5IGJhc2VkIG9uIHNwbGl0IGRpcmVjdGlvblxuXHRcdHN3aXRjaCAoZHJvcERpcmVjdGlvbikge1xuXHRcdFx0Y2FzZSBEcm9wRGlyZWN0aW9uLlVQOlxuXHRcdFx0XHR0aGlzLmRvUG9zaXRpb25PdmVybGF5KHsgdG9wOiAnMCcsIGxlZnQ6ICcwJywgd2lkdGg6ICcxMDAlJywgaGVpZ2h0OiAnNTAlJyB9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIERyb3BEaXJlY3Rpb24uRE9XTjpcblx0XHRcdFx0dGhpcy5kb1Bvc2l0aW9uT3ZlcmxheSh7IGJvdHRvbTogJzAnLCBsZWZ0OiAnMCcsIHdpZHRoOiAnMTAwJScsIGhlaWdodDogJzUwJScgfSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBEcm9wRGlyZWN0aW9uLkxFRlQ6XG5cdFx0XHRcdHRoaXMuZG9Qb3NpdGlvbk92ZXJsYXkoeyB0b3A6ICcwJywgbGVmdDogJzAnLCB3aWR0aDogJzUwJScsIGhlaWdodDogJzEwMCUnIH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgRHJvcERpcmVjdGlvbi5SSUdIVDpcblx0XHRcdFx0dGhpcy5kb1Bvc2l0aW9uT3ZlcmxheSh7IHRvcDogJzAnLCByaWdodDogJzAnLCB3aWR0aDogJzUwJScsIGhlaWdodDogJzEwMCUnIH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0Ly8gY29uc3QgdG9wID0gdGhpcy5ib3VuZHM/LnRvcCB8fCAwO1xuXHRcdFx0XHQvLyBjb25zdCBsZWZ0ID0gdGhpcy5ib3VuZHM/LmJvdHRvbSB8fCAwO1xuXG5cdFx0XHRcdGxldCB0b3AgPSAnMCc7XG5cdFx0XHRcdGxldCBsZWZ0ID0gJzAnO1xuXHRcdFx0XHRsZXQgd2lkdGggPSAnMTAwJSc7XG5cdFx0XHRcdGxldCBoZWlnaHQgPSAnMTAwJSc7XG5cdFx0XHRcdGlmICh0aGlzLmJvdW5kcykge1xuXHRcdFx0XHRcdGNvbnN0IGJvdW5kaW5nUmVjdCA9IHRoaXMuY29udGFpbmVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0XHRcdHRvcCA9IGAke3RoaXMuYm91bmRzLnRvcCAtIGJvdW5kaW5nUmVjdC50b3B9cHhgO1xuXHRcdFx0XHRcdGxlZnQgPSBgJHt0aGlzLmJvdW5kcy5sZWZ0IC0gYm91bmRpbmdSZWN0LmxlZnR9cHhgO1xuXHRcdFx0XHRcdGhlaWdodCA9IGAke3RoaXMuYm91bmRzLmJvdHRvbSAtIHRoaXMuYm91bmRzLnRvcH1weGA7XG5cdFx0XHRcdFx0d2lkdGggPSBgJHt0aGlzLmJvdW5kcy5yaWdodCAtIHRoaXMuYm91bmRzLmxlZnR9cHhgO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5kb1Bvc2l0aW9uT3ZlcmxheSh7IHRvcCwgbGVmdCwgd2lkdGgsIGhlaWdodCB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoKHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMICYmIHBhbmVIZWlnaHQgPD0gMjUpIHx8XG5cdFx0XHQodGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCAmJiBwYW5lV2lkdGggPD0gMjUpKSB7XG5cdFx0XHR0aGlzLmRvVXBkYXRlT3ZlcmxheUJvcmRlcihkcm9wRGlyZWN0aW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kb1VwZGF0ZU92ZXJsYXlCb3JkZXIodW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHQvLyBNYWtlIHN1cmUgdGhlIG92ZXJsYXkgaXMgdmlzaWJsZSBub3dcblx0XHR0aGlzLm92ZXJsYXkuc3R5bGUub3BhY2l0eSA9ICcxJztcblxuXHRcdC8vIEVuYWJsZSB0cmFuc2l0aW9uIGFmdGVyIGEgdGltZW91dCB0byBwcmV2ZW50IGluaXRpYWwgYW5pbWF0aW9uXG5cdFx0c2V0VGltZW91dCgoKSA9PiB0aGlzLm92ZXJsYXkuY2xhc3NMaXN0LmFkZCgnb3ZlcmxheS1tb3ZlLXRyYW5zaXRpb24nKSwgMCk7XG5cblx0XHQvLyBSZW1lbWJlciBhcyBjdXJyZW50IHNwbGl0IGRpcmVjdGlvblxuXHRcdHRoaXMuX2N1cnJlbnREcm9wT3BlcmF0aW9uID0gZHJvcERpcmVjdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgZG9VcGRhdGVPdmVybGF5Qm9yZGVyKGRpcmVjdGlvbjogRHJvcERpcmVjdGlvbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMub3ZlcmxheS5zdHlsZS5ib3JkZXJUb3BXaWR0aCA9IGRpcmVjdGlvbiA9PT0gRHJvcERpcmVjdGlvbi5VUCA/ICcycHgnIDogJzBweCc7XG5cdFx0dGhpcy5vdmVybGF5LnN0eWxlLmJvcmRlckxlZnRXaWR0aCA9IGRpcmVjdGlvbiA9PT0gRHJvcERpcmVjdGlvbi5MRUZUID8gJzJweCcgOiAnMHB4Jztcblx0XHR0aGlzLm92ZXJsYXkuc3R5bGUuYm9yZGVyQm90dG9tV2lkdGggPSBkaXJlY3Rpb24gPT09IERyb3BEaXJlY3Rpb24uRE9XTiA/ICcycHgnIDogJzBweCc7XG5cdFx0dGhpcy5vdmVybGF5LnN0eWxlLmJvcmRlclJpZ2h0V2lkdGggPSBkaXJlY3Rpb24gPT09IERyb3BEaXJlY3Rpb24uUklHSFQgPyAnMnB4JyA6ICcwcHgnO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1Bvc2l0aW9uT3ZlcmxheShvcHRpb25zOiB7IHRvcD86IHN0cmluZzsgYm90dG9tPzogc3RyaW5nOyBsZWZ0Pzogc3RyaW5nOyByaWdodD86IHN0cmluZzsgd2lkdGg6IHN0cmluZzsgaGVpZ2h0OiBzdHJpbmcgfSk6IHZvaWQge1xuXG5cdFx0Ly8gQ29udGFpbmVyXG5cdFx0dGhpcy5jb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gJzEwMCUnO1xuXG5cdFx0Ly8gT3ZlcmxheVxuXHRcdHRoaXMub3ZlcmxheS5zdHlsZS50b3AgPSBvcHRpb25zLnRvcCB8fCAnJztcblx0XHR0aGlzLm92ZXJsYXkuc3R5bGUubGVmdCA9IG9wdGlvbnMubGVmdCB8fCAnJztcblx0XHR0aGlzLm92ZXJsYXkuc3R5bGUuYm90dG9tID0gb3B0aW9ucy5ib3R0b20gfHwgJyc7XG5cdFx0dGhpcy5vdmVybGF5LnN0eWxlLnJpZ2h0ID0gb3B0aW9ucy5yaWdodCB8fCAnJztcblx0XHR0aGlzLm92ZXJsYXkuc3R5bGUud2lkdGggPSBvcHRpb25zLndpZHRoO1xuXHRcdHRoaXMub3ZlcmxheS5zdHlsZS5oZWlnaHQgPSBvcHRpb25zLmhlaWdodDtcblx0fVxuXG5cblx0Y29udGFpbnMoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZWxlbWVudCA9PT0gdGhpcy5jb250YWluZXIgfHwgZWxlbWVudCA9PT0gdGhpcy5vdmVybGF5O1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLl9kaXNwb3NlZCA9IHRydWU7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFZpZXdQYW5lQ29udGFpbmVyPE1lbWVudG9UeXBlIGV4dGVuZHMgb2JqZWN0ID0gb2JqZWN0PiBleHRlbmRzIENvbXBvbmVudDxNZW1lbnRvVHlwZT4gaW1wbGVtZW50cyBJVmlld1BhbmVDb250YWluZXIge1xuXG5cdHJlYWRvbmx5IHZpZXdDb250YWluZXI6IFZpZXdDb250YWluZXI7XG5cdHByaXZhdGUgbGFzdEZvY3VzZWRQYW5lOiBWaWV3UGFuZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBsYXN0TWVyZ2VkQ29sbGFwc2VkUGFuZTogVmlld1BhbmUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcGFuZUl0ZW1zOiBJVmlld1BhbmVJdGVtW10gPSBbXTtcblx0cHJpdmF0ZSBwYW5ldmlldz86IFBhbmVWaWV3O1xuXG5cdHByaXZhdGUgdmlzaWJsZTogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHByaXZhdGUgYXJlRXh0ZW5zaW9uc1JlYWR5OiBib29sZWFuID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBkaWRMYXlvdXQgPSBmYWxzZTtcblx0cHJpdmF0ZSBkaW1lbnNpb246IERpbWVuc2lvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYm91bmRhcnlTYXNoZXM6IElCb3VuZGFyeVNhc2hlcyB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHZpc2libGVWaWV3c0NvdW50RnJvbUNhY2hlOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgdmlzaWJsZVZpZXdzU3RvcmFnZUlkOiBzdHJpbmc7XG5cdHByb3RlY3RlZCByZWFkb25seSB2aWV3Q29udGFpbmVyTW9kZWw6IElWaWV3Q29udGFpbmVyTW9kZWw7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25UaXRsZUFyZWFVcGRhdGU6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25UaXRsZUFyZWFVcGRhdGU6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25UaXRsZUFyZWFVcGRhdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VWaXNpYmlsaXR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlzaWJpbGl0eSA9IHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFkZFZpZXdzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVZpZXdbXT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQWRkVmlld3MgPSB0aGlzLl9vbkRpZEFkZFZpZXdzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVtb3ZlVmlld3MgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVmlld1tdPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZW1vdmVWaWV3cyA9IHRoaXMuX29uRGlkUmVtb3ZlVmlld3MuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VWaWV3VmlzaWJpbGl0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElWaWV3PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWaWV3VmlzaWJpbGl0eSA9IHRoaXMuX29uRGlkQ2hhbmdlVmlld1Zpc2liaWxpdHkuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRGb2N1c1ZpZXcgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVmlldz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRm9jdXNWaWV3ID0gdGhpcy5fb25EaWRGb2N1c1ZpZXcuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRCbHVyVmlldyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElWaWV3PigpKTtcblx0cmVhZG9ubHkgb25EaWRCbHVyVmlldyA9IHRoaXMuX29uRGlkQmx1clZpZXcuZXZlbnQ7XG5cblx0Z2V0IG9uRGlkU2FzaENoYW5nZSgpOiBFdmVudDxudW1iZXI+IHtcblx0XHRyZXR1cm4gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5wYW5ldmlldykub25EaWRTYXNoQ2hhbmdlO1xuXHR9XG5cblx0Z2V0IHBhbmVzKCk6IFZpZXdQYW5lW10ge1xuXHRcdHJldHVybiB0aGlzLnBhbmVJdGVtcy5tYXAoaSA9PiBpLnBhbmUpO1xuXHR9XG5cblx0Z2V0IHZpZXdzKCk6IElWaWV3W10ge1xuXHRcdHJldHVybiB0aGlzLnBhbmVzO1xuXHR9XG5cblx0Z2V0IGxlbmd0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnBhbmVJdGVtcy5sZW5ndGg7XG5cdH1cblxuXHRwcml2YXRlIF9tZW51QWN0aW9ucz86IFZpZXdDb250YWluZXJNZW51QWN0aW9ucztcblx0Z2V0IG1lbnVBY3Rpb25zKCk6IFZpZXdDb250YWluZXJNZW51QWN0aW9ucyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX21lbnVBY3Rpb25zO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIG9wdGlvbnM6IElWaWV3UGFuZUNvbnRhaW5lck9wdGlvbnMsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcm90ZWN0ZWQgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByb3RlY3RlZCBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBwcm90ZWN0ZWQgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJvdGVjdGVkIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJvdGVjdGVkIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcm90ZWN0ZWQgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJvdGVjdGVkIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcm90ZWN0ZWQgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSBwcm90ZWN0ZWQgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXG5cdFx0c3VwZXIoaWQsIHRoZW1lU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5SWQoaWQpO1xuXHRcdGlmICghY29udGFpbmVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCBmaW5kIGNvbnRhaW5lcicpO1xuXHRcdH1cblxuXG5cdFx0dGhpcy52aWV3Q29udGFpbmVyID0gY29udGFpbmVyO1xuXHRcdHRoaXMudmlzaWJsZVZpZXdzU3RvcmFnZUlkID0gYCR7aWR9Lm51bWJlck9mVmlzaWJsZVZpZXdzYDtcblx0XHR0aGlzLnZpc2libGVWaWV3c0NvdW50RnJvbUNhY2hlID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXROdW1iZXIodGhpcy52aXNpYmxlVmlld3NTdG9yYWdlSWQsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy52aWV3Q29udGFpbmVyTW9kZWwgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwoY29udGFpbmVyKTtcblx0fVxuXG5cdGNyZWF0ZShwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMub3B0aW9ucyBhcyBJUGFuZVZpZXdPcHRpb25zO1xuXHRcdG9wdGlvbnMub3JpZW50YXRpb24gPSB0aGlzLm9yaWVudGF0aW9uO1xuXHRcdHRoaXMucGFuZXZpZXcgPSB0aGlzLl9yZWdpc3RlcihuZXcgUGFuZVZpZXcocGFyZW50LCB0aGlzLm9wdGlvbnMpKTtcblxuXHRcdGlmICh0aGlzLl9ib3VuZGFyeVNhc2hlcykge1xuXHRcdFx0dGhpcy5wYW5ldmlldy5zZXRCb3VuZGFyeVNhc2hlcyh0aGlzLl9ib3VuZGFyeVNhc2hlcyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5wYW5ldmlldy5vbkRpZERyb3AoKHsgZnJvbSwgdG8gfSkgPT4gdGhpcy5tb3ZlUGFuZShmcm9tIGFzIFZpZXdQYW5lLCB0byBhcyBWaWV3UGFuZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnBhbmV2aWV3Lm9uRGlkU2Nyb2xsKF8gPT4gdGhpcy5vbkRpZFNjcm9sbFBhbmUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucGFuZXZpZXcub25EaWRTYXNoUmVzZXQoKGluZGV4KSA9PiB0aGlzLm9uRGlkU2FzaFJlc2V0KGluZGV4KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihwYXJlbnQsIEV2ZW50VHlwZS5DT05URVhUX01FTlUsIChlOiBNb3VzZUV2ZW50KSA9PiB0aGlzLnNob3dDb250ZXh0TWVudShuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGdldFdpbmRvdyhwYXJlbnQpLCBlKSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihHZXN0dXJlLmFkZFRhcmdldChwYXJlbnQpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIocGFyZW50LCBUb3VjaEV2ZW50VHlwZS5Db250ZXh0bWVudSwgKGU6IE1vdXNlRXZlbnQpID0+IHRoaXMuc2hvd0NvbnRleHRNZW51KG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoZ2V0V2luZG93KHBhcmVudCksIGUpKSkpO1xuXG5cdFx0dGhpcy5fbWVudUFjdGlvbnMgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFZpZXdDb250YWluZXJNZW51QWN0aW9ucywgdGhpcy5wYW5ldmlldy5lbGVtZW50LCB0aGlzLnZpZXdDb250YWluZXIsIHVuZGVmaW5lZCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX21lbnVBY3Rpb25zLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMudXBkYXRlVGl0bGVBcmVhKCkpKTtcblxuXHRcdGxldCBvdmVybGF5OiBWaWV3UGFuZURyb3BPdmVybGF5IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGdldE92ZXJsYXlCb3VuZHM6ICgpID0+IEJvdW5kaW5nUmVjdCA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGZ1bGxTaXplID0gcGFyZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0Y29uc3QgbGFzdFBhbmUgPSB0aGlzLnBhbmVzW3RoaXMucGFuZXMubGVuZ3RoIC0gMV0uZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdGNvbnN0IHRvcCA9IHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMID8gbGFzdFBhbmUuYm90dG9tIDogZnVsbFNpemUudG9wO1xuXHRcdFx0Y29uc3QgbGVmdCA9IHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgPyBsYXN0UGFuZS5yaWdodCA6IGZ1bGxTaXplLmxlZnQ7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHRvcCxcblx0XHRcdFx0Ym90dG9tOiBmdWxsU2l6ZS5ib3R0b20sXG5cdFx0XHRcdGxlZnQsXG5cdFx0XHRcdHJpZ2h0OiBmdWxsU2l6ZS5yaWdodCxcblx0XHRcdH07XG5cdFx0fTtcblxuXHRcdGNvbnN0IGluQm91bmRzID0gKGJvdW5kczogQm91bmRpbmdSZWN0LCBwb3M6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSkgPT4ge1xuXHRcdFx0cmV0dXJuIHBvcy54ID49IGJvdW5kcy5sZWZ0ICYmIHBvcy54IDw9IGJvdW5kcy5yaWdodCAmJiBwb3MueSA+PSBib3VuZHMudG9wICYmIHBvcy55IDw9IGJvdW5kcy5ib3R0b207XG5cdFx0fTtcblxuXG5cdFx0bGV0IGJvdW5kczogQm91bmRpbmdSZWN0O1xuXG5cdFx0aWYgKHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmNhbk1vdmVWaWV3cygpKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihDb21wb3NpdGVEcmFnQW5kRHJvcE9ic2VydmVyLklOU1RBTkNFLnJlZ2lzdGVyVGFyZ2V0KHBhcmVudCwge1xuXHRcdFx0XHRvbkRyYWdFbnRlcjogKGUpID0+IHtcblx0XHRcdFx0XHRib3VuZHMgPSBnZXRPdmVybGF5Qm91bmRzKCk7XG5cdFx0XHRcdFx0aWYgKG92ZXJsYXk/LmRpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0XHRvdmVybGF5ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICghb3ZlcmxheSAmJiBpbkJvdW5kcyhib3VuZHMsIGUuZXZlbnREYXRhKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZHJvcERhdGEgPSBlLmRyYWdBbmREcm9wRGF0YS5nZXREYXRhKCk7XG5cdFx0XHRcdFx0XHRpZiAoZHJvcERhdGEudHlwZSA9PT0gJ3ZpZXcnKSB7XG5cblx0XHRcdFx0XHRcdFx0Y29uc3Qgb2xkVmlld0NvbnRhaW5lciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeVZpZXdJZChkcm9wRGF0YS5pZCk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0Rlc2NyaXB0b3JCeUlkKGRyb3BEYXRhLmlkKTtcblxuXHRcdFx0XHRcdFx0XHRpZiAob2xkVmlld0NvbnRhaW5lciAhPT0gdGhpcy52aWV3Q29udGFpbmVyICYmICghdmlld0Rlc2NyaXB0b3IgfHwgIXZpZXdEZXNjcmlwdG9yLmNhbk1vdmVWaWV3IHx8IHRoaXMudmlld0NvbnRhaW5lci5yZWplY3RBZGRlZFZpZXdzKSkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdG92ZXJsYXkgPSBuZXcgVmlld1BhbmVEcm9wT3ZlcmxheShwYXJlbnQsIHVuZGVmaW5lZCwgYm91bmRzLCB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24odGhpcy52aWV3Q29udGFpbmVyKSEsIHRoaXMudGhlbWVTZXJ2aWNlKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKGRyb3BEYXRhLnR5cGUgPT09ICdjb21wb3NpdGUnICYmIGRyb3BEYXRhLmlkICE9PSB0aGlzLnZpZXdDb250YWluZXIuaWQpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5SWQoZHJvcERhdGEuaWQpITtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgdmlld3NUb01vdmUgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwoY29udGFpbmVyKS5hbGxWaWV3RGVzY3JpcHRvcnM7XG5cblx0XHRcdFx0XHRcdFx0aWYgKCF2aWV3c1RvTW92ZS5zb21lKHYgPT4gIXYuY2FuTW92ZVZpZXcpICYmIHZpZXdzVG9Nb3ZlLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdFx0XHRvdmVybGF5ID0gbmV3IFZpZXdQYW5lRHJvcE92ZXJsYXkocGFyZW50LCB1bmRlZmluZWQsIGJvdW5kcywgdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckxvY2F0aW9uKHRoaXMudmlld0NvbnRhaW5lcikhLCB0aGlzLnRoZW1lU2VydmljZSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uRHJhZ092ZXI6IChlKSA9PiB7XG5cdFx0XHRcdFx0aWYgKG92ZXJsYXk/LmRpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0XHRvdmVybGF5ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChvdmVybGF5ICYmICFpbkJvdW5kcyhib3VuZHMsIGUuZXZlbnREYXRhKSkge1xuXHRcdFx0XHRcdFx0b3ZlcmxheS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRvdmVybGF5ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChpbkJvdW5kcyhib3VuZHMsIGUuZXZlbnREYXRhKSkge1xuXHRcdFx0XHRcdFx0dG9nZ2xlRHJvcEVmZmVjdChlLmV2ZW50RGF0YS5kYXRhVHJhbnNmZXIsICdtb3ZlJywgb3ZlcmxheSAhPT0gdW5kZWZpbmVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uRHJhZ0xlYXZlOiAoZSkgPT4ge1xuXHRcdFx0XHRcdG92ZXJsYXk/LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRvdmVybGF5ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbkRyb3A6IChlKSA9PiB7XG5cdFx0XHRcdFx0aWYgKG92ZXJsYXkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGRyb3BEYXRhID0gZS5kcmFnQW5kRHJvcERhdGEuZ2V0RGF0YSgpO1xuXHRcdFx0XHRcdFx0Y29uc3Qgdmlld3NUb01vdmU6IElWaWV3RGVzY3JpcHRvcltdID0gW107XG5cblx0XHRcdFx0XHRcdGlmIChkcm9wRGF0YS50eXBlID09PSAnY29tcG9zaXRlJyAmJiBkcm9wRGF0YS5pZCAhPT0gdGhpcy52aWV3Q29udGFpbmVyLmlkKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeUlkKGRyb3BEYXRhLmlkKSE7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGFsbFZpZXdzID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKGNvbnRhaW5lcikuYWxsVmlld0Rlc2NyaXB0b3JzO1xuXHRcdFx0XHRcdFx0XHRpZiAoIWFsbFZpZXdzLnNvbWUodiA9PiAhdi5jYW5Nb3ZlVmlldykpIHtcblx0XHRcdFx0XHRcdFx0XHR2aWV3c1RvTW92ZS5wdXNoKC4uLmFsbFZpZXdzKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChkcm9wRGF0YS50eXBlID09PSAndmlldycpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgb2xkVmlld0NvbnRhaW5lciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeVZpZXdJZChkcm9wRGF0YS5pZCk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0Rlc2NyaXB0b3JCeUlkKGRyb3BEYXRhLmlkKTtcblx0XHRcdFx0XHRcdFx0aWYgKG9sZFZpZXdDb250YWluZXIgIT09IHRoaXMudmlld0NvbnRhaW5lciAmJiB2aWV3RGVzY3JpcHRvcj8uY2FuTW92ZVZpZXcpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5tb3ZlVmlld3NUb0NvbnRhaW5lcihbdmlld0Rlc2NyaXB0b3JdLCB0aGlzLnZpZXdDb250YWluZXIsIHVuZGVmaW5lZCwgJ2RuZCcpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGNvbnN0IHBhbmVDb3VudCA9IHRoaXMucGFuZXMubGVuZ3RoO1xuXG5cdFx0XHRcdFx0XHRpZiAodmlld3NUb01vdmUubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5tb3ZlVmlld3NUb0NvbnRhaW5lcih2aWV3c1RvTW92ZSwgdGhpcy52aWV3Q29udGFpbmVyLCB1bmRlZmluZWQsICdkbmQnKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKHBhbmVDb3VudCA+IDApIHtcblx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCB2aWV3IG9mIHZpZXdzVG9Nb3ZlKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgcGFuZVRvTW92ZSA9IHRoaXMucGFuZXMuZmluZChwID0+IHAuaWQgPT09IHZpZXcuaWQpO1xuXHRcdFx0XHRcdFx0XHRcdGlmIChwYW5lVG9Nb3ZlKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLm1vdmVQYW5lKHBhbmVUb01vdmUsIHRoaXMucGFuZXNbdGhpcy5wYW5lcy5sZW5ndGggLSAxXSk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0b3ZlcmxheT8uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdG92ZXJsYXkgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkU2FzaENoYW5nZSgoKSA9PiB0aGlzLnNhdmVWaWV3U2l6ZXMoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudmlld0NvbnRhaW5lck1vZGVsLm9uRGlkQWRkVmlzaWJsZVZpZXdEZXNjcmlwdG9ycyhhZGRlZCA9PiB0aGlzLm9uRGlkQWRkVmlld0Rlc2NyaXB0b3JzKGFkZGVkKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudmlld0NvbnRhaW5lck1vZGVsLm9uRGlkUmVtb3ZlVmlzaWJsZVZpZXdEZXNjcmlwdG9ycyhyZW1vdmVkID0+IHRoaXMub25EaWRSZW1vdmVWaWV3RGVzY3JpcHRvcnMocmVtb3ZlZCkpKTtcblx0XHRjb25zdCBhZGRlZFZpZXdzOiBJQWRkZWRWaWV3RGVzY3JpcHRvclJlZltdID0gdGhpcy52aWV3Q29udGFpbmVyTW9kZWwudmlzaWJsZVZpZXdEZXNjcmlwdG9ycy5tYXAoKHZpZXdEZXNjcmlwdG9yLCBpbmRleCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2l6ZSA9IHRoaXMudmlld0NvbnRhaW5lck1vZGVsLmdldFNpemUodmlld0Rlc2NyaXB0b3IuaWQpO1xuXHRcdFx0Y29uc3QgY29sbGFwc2VkID0gdGhpcy52aWV3Q29udGFpbmVyTW9kZWwuaXNDb2xsYXBzZWQodmlld0Rlc2NyaXB0b3IuaWQpO1xuXHRcdFx0cmV0dXJuICh7IHZpZXdEZXNjcmlwdG9yLCBpbmRleCwgc2l6ZSwgY29sbGFwc2VkIH0pO1xuXHRcdH0pO1xuXHRcdGlmIChhZGRlZFZpZXdzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5vbkRpZEFkZFZpZXdEZXNjcmlwdG9ycyhhZGRlZFZpZXdzKTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgaGVhZGVycyBhZnRlciBhbmQgdGl0bGUgY29udHJpYnV0ZWQgdmlld3MgYWZ0ZXIgYXZhaWxhYmxlLCBzaW5jZSB3ZSByZWFkIGZyb20gY2FjaGUgaW4gdGhlIGJlZ2lubmluZyB0byBrbm93IGlmIHRoZSB2aWV3bGV0IGhhcyBzaW5nbGUgdmlldyBvciBub3QuIFJlZiAjMjk2MDlcblx0XHR0aGlzLmV4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCkudGhlbigoKSA9PiB7XG5cdFx0XHR0aGlzLmFyZUV4dGVuc2lvbnNSZWFkeSA9IHRydWU7XG5cdFx0XHRpZiAodGhpcy5wYW5lcy5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVUaXRsZUFyZWEoKTtcblx0XHRcdFx0dGhpcy51cGRhdGVWaWV3SGVhZGVycygpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9MT0NBVElPTikpIHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZVZpZXdIZWFkZXJzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudmlld0NvbnRhaW5lck1vZGVsLm9uRGlkQ2hhbmdlQWN0aXZlVmlld0Rlc2NyaXB0b3JzKCgpID0+IHRoaXMuX29uVGl0bGVBcmVhVXBkYXRlLmZpcmUoKSkpO1xuXHR9XG5cblx0Z2V0VGl0bGUoKTogc3RyaW5nIHtcblx0XHRjb25zdCBjb250YWluZXJUaXRsZSA9IHRoaXMudmlld0NvbnRhaW5lck1vZGVsLnRpdGxlO1xuXG5cdFx0aWYgKHRoaXMuaXNWaWV3TWVyZ2VkV2l0aENvbnRhaW5lcigpKSB7XG5cdFx0XHRjb25zdCBzaW5nbGVWaWV3UGFuZUNvbnRhaW5lclRpdGxlID0gdGhpcy5wYW5lSXRlbXNbMF0ucGFuZS5zaW5nbGVWaWV3UGFuZUNvbnRhaW5lclRpdGxlO1xuXHRcdFx0aWYgKHNpbmdsZVZpZXdQYW5lQ29udGFpbmVyVGl0bGUpIHtcblx0XHRcdFx0cmV0dXJuIHNpbmdsZVZpZXdQYW5lQ29udGFpbmVyVGl0bGU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHBhbmVJdGVtVGl0bGUgPSB0aGlzLnBhbmVJdGVtc1swXS5wYW5lLnRpdGxlO1xuXHRcdFx0aWYgKGNvbnRhaW5lclRpdGxlID09PSBwYW5lSXRlbVRpdGxlKSB7XG5cdFx0XHRcdHJldHVybiBwYW5lSXRlbVRpdGxlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcGFuZUl0ZW1UaXRsZSA/IGAke2NvbnRhaW5lclRpdGxlfTogJHtwYW5lSXRlbVRpdGxlfWAgOiBjb250YWluZXJUaXRsZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY29udGFpbmVyVGl0bGU7XG5cdH1cblxuXHRwcml2YXRlIHNob3dDb250ZXh0TWVudShldmVudDogU3RhbmRhcmRNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBwYW5lSXRlbSBvZiB0aGlzLnBhbmVJdGVtcykge1xuXHRcdFx0Ly8gRG8gbm90IHNob3cgY29udGV4dCBtZW51IGlmIHRhcmdldCBpcyBjb21pbmcgZnJvbSBpbnNpZGUgcGFuZSB2aWV3c1xuXHRcdFx0aWYgKGlzQW5jZXN0b3IoZXZlbnQudGFyZ2V0LCBwYW5lSXRlbS5wYW5lLmVsZW1lbnQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gZXZlbnQsXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiB0aGlzLm1lbnVBY3Rpb25zPy5nZXRDb250ZXh0TWVudUFjdGlvbnMoKSA/PyBbXVxuXHRcdH0pO1xuXHR9XG5cblx0Z2V0QWN0aW9uc0NvbnRleHQoKTogdW5rbm93biB7XG5cdFx0aWYgKHRoaXMuaXNWaWV3TWVyZ2VkV2l0aENvbnRhaW5lcigpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5wYW5lc1swXS5nZXRBY3Rpb25zQ29udGV4dCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0QWN0aW9uVmlld0l0ZW0oYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zOiBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyk6IElBY3Rpb25WaWV3SXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuaXNWaWV3TWVyZ2VkV2l0aENvbnRhaW5lcigpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5wYW5lSXRlbXNbMF0ucGFuZS5jcmVhdGVBY3Rpb25WaWV3SXRlbShhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdH1cblx0XHRyZXR1cm4gY3JlYXRlQWN0aW9uVmlld0l0ZW0odGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgYWN0aW9uLCBvcHRpb25zKTtcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdGxldCBwYW5lVG9Gb2N1czogVmlld1BhbmUgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMubGFzdEZvY3VzZWRQYW5lKSB7XG5cdFx0XHRwYW5lVG9Gb2N1cyA9IHRoaXMubGFzdEZvY3VzZWRQYW5lO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5wYW5lSXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Zm9yIChjb25zdCB7IHBhbmUgfSBvZiB0aGlzLnBhbmVJdGVtcykge1xuXHRcdFx0XHRpZiAocGFuZS5pc0V4cGFuZGVkKCkpIHtcblx0XHRcdFx0XHRwYW5lVG9Gb2N1cyA9IHBhbmU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHBhbmVUb0ZvY3VzKSB7XG5cdFx0XHRwYW5lVG9Gb2N1cy5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0IG9yaWVudGF0aW9uKCk6IE9yaWVudGF0aW9uIHtcblx0XHRzd2l0Y2ggKHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJMb2NhdGlvbih0aGlzLnZpZXdDb250YWluZXIpKSB7XG5cdFx0XHRjYXNlIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyOlxuXHRcdFx0Y2FzZSBWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyOlxuXHRcdFx0XHRyZXR1cm4gT3JpZW50YXRpb24uVkVSVElDQUw7XG5cdFx0XHRjYXNlIFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbDoge1xuXHRcdFx0XHRyZXR1cm4gaXNIb3Jpem9udGFsKHRoaXMubGF5b3V0U2VydmljZS5nZXRQYW5lbFBvc2l0aW9uKCkpID8gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA6IE9yaWVudGF0aW9uLlZFUlRJQ0FMO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBPcmllbnRhdGlvbi5WRVJUSUNBTDtcblx0fVxuXG5cdGxheW91dChkaW1lbnNpb246IERpbWVuc2lvbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLnBhbmV2aWV3KSB7XG5cdFx0XHRpZiAodGhpcy5wYW5ldmlldy5vcmllbnRhdGlvbiAhPT0gdGhpcy5vcmllbnRhdGlvbikge1xuXHRcdFx0XHR0aGlzLnBhbmV2aWV3LmZsaXBPcmllbnRhdGlvbihkaW1lbnNpb24uaGVpZ2h0LCBkaW1lbnNpb24ud2lkdGgpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJbiBNb2Rlcm4gVUkgKGZsb2F0aW5nIHBhbmVscykgcmVzZXJ2ZSBhIHNtYWxsIGJvdHRvbSBnYXAgc28gdGhlIGxhc3Rcblx0XHRcdC8vIHBhbmUgZG9lcyBub3Qgc2l0IGZsdXNoIGFnYWluc3QgdGhlIHBhcnQgZWRnZSwgbWF0Y2hpbmcgdGhlIDRweFxuXHRcdFx0Ly8gaG9yaXpvbnRhbCBtYXJnaW5zIG9uIHRoZSBwYW5lIGhlYWRlcnMuIEFkZCAxcHggZm9yIHRoZSBwYXJ0J3MgYm90dG9tXG5cdFx0XHQvLyBib3JkZXIgc28gdGhlIHZpc2libGUgZ2FwIGxpbmVzIHVwIHdpdGggdGhlIGhvcml6b250YWwgbWFyZ2lucy5cblx0XHRcdC8vIEV4Y2VwdGlvbjogd2hlbiB0aGUgcGFuZWwgaXMgYXQgdGhlIFRPUCwgaXRzIGJvdHRvbSBmYWNlcyB0aGUgZWRpdG9yXG5cdFx0XHQvLyBjYXJkLCBzbyB0aGUgdGlnaHRlciBpbm5lciBjYXJkIGdhcCBpcyBzdWZmaWNpZW50LlxuXHRcdFx0Y29uc3QgYm90dG9tR2FwID0gIXRoaXMubGF5b3V0U2VydmljZS5pc0Zsb2F0aW5nUGFuZWxzRW5hYmxlZCgpID8gMFxuXHRcdFx0XHQ6ICh0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24odGhpcy52aWV3Q29udGFpbmVyKSA9PT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsXG5cdFx0XHRcdFx0JiYgdGhpcy5sYXlvdXRTZXJ2aWNlLmdldFBhbmVsUG9zaXRpb24oKSA9PT0gUG9zaXRpb24uVE9QKSA/IDFcblx0XHRcdFx0XHQ6IEZMT0FUSU5HX1BBTkVMX01BUkdJTiArIDE7XG5cdFx0XHR0aGlzLnBhbmV2aWV3LmxheW91dChNYXRoLm1heCgwLCBkaW1lbnNpb24uaGVpZ2h0IC0gYm90dG9tR2FwKSwgZGltZW5zaW9uLndpZHRoKTtcblx0XHR9XG5cblx0XHR0aGlzLmRpbWVuc2lvbiA9IGRpbWVuc2lvbjtcblx0XHRpZiAodGhpcy5kaWRMYXlvdXQpIHtcblx0XHRcdHRoaXMuc2F2ZVZpZXdTaXplcygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmRpZExheW91dCA9IHRydWU7XG5cdFx0XHR0aGlzLnJlc3RvcmVWaWV3U2l6ZXMoKTtcblx0XHR9XG5cdH1cblxuXHRzZXRCb3VuZGFyeVNhc2hlcyhzYXNoZXM6IElCb3VuZGFyeVNhc2hlcyk6IHZvaWQge1xuXHRcdHRoaXMuX2JvdW5kYXJ5U2FzaGVzID0gc2FzaGVzO1xuXHRcdHRoaXMucGFuZXZpZXc/LnNldEJvdW5kYXJ5U2FzaGVzKHNhc2hlcyk7XG5cdH1cblxuXHRnZXRPcHRpbWFsV2lkdGgoKTogbnVtYmVyIHtcblx0XHRjb25zdCBhZGRpdGlvbmFsTWFyZ2luID0gMTY7XG5cdFx0Y29uc3Qgb3B0aW1hbFdpZHRoID0gTWF0aC5tYXgoLi4udGhpcy5wYW5lcy5tYXAodmlldyA9PiB2aWV3LmdldE9wdGltYWxXaWR0aCgpIHx8IDApKTtcblx0XHRyZXR1cm4gb3B0aW1hbFdpZHRoICsgYWRkaXRpb25hbE1hcmdpbjtcblx0fVxuXG5cdGFkZFBhbmVzKHBhbmVzOiB7IHBhbmU6IFZpZXdQYW5lOyBzaXplOiBudW1iZXI7IGluZGV4PzogbnVtYmVyOyBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSB9W10pOiB2b2lkIHtcblx0XHRjb25zdCB3YXNNZXJnZWQgPSB0aGlzLmlzVmlld01lcmdlZFdpdGhDb250YWluZXIoKTtcblxuXHRcdGZvciAoY29uc3QgeyBwYW5lLCBzaXplLCBpbmRleCwgZGlzcG9zYWJsZSB9IG9mIHBhbmVzKSB7XG5cdFx0XHR0aGlzLmFkZFBhbmUocGFuZSwgc2l6ZSwgZGlzcG9zYWJsZSwgaW5kZXgpO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlVmlld0hlYWRlcnMoKTtcblx0XHRpZiAodGhpcy5pc1ZpZXdNZXJnZWRXaXRoQ29udGFpbmVyKCkgIT09IHdhc01lcmdlZCkge1xuXHRcdFx0dGhpcy51cGRhdGVUaXRsZUFyZWEoKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZEFkZFZpZXdzLmZpcmUocGFuZXMubWFwKCh7IHBhbmUgfSkgPT4gcGFuZSkpO1xuXHR9XG5cblx0c2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudmlzaWJsZSAhPT0gISF2aXNpYmxlKSB7XG5cdFx0XHR0aGlzLnZpc2libGUgPSB2aXNpYmxlO1xuXG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVZpc2liaWxpdHkuZmlyZSh2aXNpYmxlKTtcblx0XHR9XG5cblx0XHR0aGlzLnBhbmVzLmZpbHRlcih2aWV3ID0+IHZpZXcuaXNWaXNpYmxlKCkgIT09IHZpc2libGUpXG5cdFx0XHQubWFwKCh2aWV3KSA9PiB2aWV3LnNldFZpc2libGUodmlzaWJsZSkpO1xuXHR9XG5cblx0aXNWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnZpc2libGU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgdXBkYXRlVGl0bGVBcmVhKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uVGl0bGVBcmVhVXBkYXRlLmZpcmUoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVWaWV3KHZpZXdEZXNjcmlwdG9yOiBJVmlld0Rlc2NyaXB0b3IsIG9wdGlvbnM6IElWaWV3bGV0Vmlld09wdGlvbnMpOiBWaWV3UGFuZSB7XG5cdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2Uodmlld0Rlc2NyaXB0b3IuY3RvckRlc2NyaXB0b3IuY3RvciwgLi4uKHZpZXdEZXNjcmlwdG9yLmN0b3JEZXNjcmlwdG9yLnN0YXRpY0FyZ3VtZW50cyB8fCBbXSksIG9wdGlvbnMpO1xuXHR9XG5cblx0Z2V0VmlldyhpZDogc3RyaW5nKTogVmlld1BhbmUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnBhbmVzLmZpbHRlcih2aWV3ID0+IHZpZXcuaWQgPT09IGlkKVswXTtcblx0fVxuXG5cdHByaXZhdGUgc2F2ZVZpZXdTaXplcygpOiB2b2lkIHtcblx0XHQvLyBTYXZlIHNpemUgb25seSB3aGVuIHRoZSBsYXlvdXQgaGFzIGhhcHBlbmVkXG5cdFx0aWYgKHRoaXMuZGlkTGF5b3V0KSB7XG5cdFx0XHR0aGlzLnZpZXdDb250YWluZXJNb2RlbC5zZXRTaXplcyh0aGlzLnBhbmVzLm1hcCh2aWV3ID0+ICh7IGlkOiB2aWV3LmlkLCBzaXplOiB0aGlzLmdldFBhbmVTaXplKHZpZXcpIH0pKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZXN0b3JlVmlld1NpemVzKCk6IHZvaWQge1xuXHRcdC8vIFJlc3RvcmUgc2l6ZXMgb25seSB3aGVuIHRoZSBsYXlvdXQgaGFzIGhhcHBlbmVkXG5cdFx0aWYgKHRoaXMuZGlkTGF5b3V0KSB7XG5cdFx0XHRsZXQgaW5pdGlhbFNpemVzO1xuXHRcdFx0Zm9yIChjb25zdCB2aWV3RGVzY3JpcHRvciBvZiB0aGlzLnZpZXdDb250YWluZXJNb2RlbC52aXNpYmxlVmlld0Rlc2NyaXB0b3JzKSB7XG5cdFx0XHRcdC8vIExvb2sgdXAgdGhlIHBhbmUgYnkgaWQgcmF0aGVyIHRoYW4gYnkgaW5kZXggc2luY2UgYSB2aWV3IGRlc2NyaXB0b3Jcblx0XHRcdFx0Ly8gbWF5IGJlIHZpc2libGUgd2l0aG91dCBhIGNvcnJlc3BvbmRpbmcgcGFuZSAoZS5nLiB3aGVuIGl0cyBwYW5lIGZhaWxlZCB0byByZW5kZXIpXG5cdFx0XHRcdGNvbnN0IHBhbmUgPSB0aGlzLmdldFZpZXcodmlld0Rlc2NyaXB0b3IuaWQpO1xuXHRcdFx0XHRpZiAoIXBhbmUpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHNpemUgPSB0aGlzLnZpZXdDb250YWluZXJNb2RlbC5nZXRTaXplKHZpZXdEZXNjcmlwdG9yLmlkKTtcblx0XHRcdFx0aWYgKHR5cGVvZiBzaXplID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdHRoaXMucmVzaXplUGFuZShwYW5lLCBzaXplKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpbml0aWFsU2l6ZXMgPSBpbml0aWFsU2l6ZXMgPyBpbml0aWFsU2l6ZXMgOiB0aGlzLmNvbXB1dGVJbml0aWFsU2l6ZXMoKTtcblx0XHRcdFx0XHR0aGlzLnJlc2l6ZVBhbmUocGFuZSwgaW5pdGlhbFNpemVzLmdldChwYW5lLmlkKSB8fCAyMDApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjb21wdXRlSW5pdGlhbFNpemVzKCk6IE1hcDxzdHJpbmcsIG51bWJlcj4ge1xuXHRcdGNvbnN0IHNpemVzOiBNYXA8c3RyaW5nLCBudW1iZXI+ID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0XHRpZiAodGhpcy5kaW1lbnNpb24pIHtcblx0XHRcdGNvbnN0IHRvdGFsV2VpZ2h0ID0gdGhpcy52aWV3Q29udGFpbmVyTW9kZWwudmlzaWJsZVZpZXdEZXNjcmlwdG9ycy5yZWR1Y2UoKHRvdGFsV2VpZ2h0LCB7IHdlaWdodCB9KSA9PiB0b3RhbFdlaWdodCArICh3ZWlnaHQgfHwgMjApLCAwKTtcblx0XHRcdGZvciAoY29uc3Qgdmlld0Rlc2NyaXB0b3Igb2YgdGhpcy52aWV3Q29udGFpbmVyTW9kZWwudmlzaWJsZVZpZXdEZXNjcmlwdG9ycykge1xuXHRcdFx0XHRpZiAodGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uVkVSVElDQUwpIHtcblx0XHRcdFx0XHRzaXplcy5zZXQodmlld0Rlc2NyaXB0b3IuaWQsIHRoaXMuZGltZW5zaW9uLmhlaWdodCAqICh2aWV3RGVzY3JpcHRvci53ZWlnaHQgfHwgMjApIC8gdG90YWxXZWlnaHQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNpemVzLnNldCh2aWV3RGVzY3JpcHRvci5pZCwgdGhpcy5kaW1lbnNpb24ud2lkdGggKiAodmlld0Rlc2NyaXB0b3Iud2VpZ2h0IHx8IDIwKSAvIHRvdGFsV2VpZ2h0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gc2l6ZXM7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgc2F2ZVN0YXRlKCk6IHZvaWQge1xuXHRcdHRoaXMucGFuZXMuZm9yRWFjaCgodmlldykgPT4gdmlldy5zYXZlU3RhdGUoKSk7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZSh0aGlzLnZpc2libGVWaWV3c1N0b3JhZ2VJZCwgdGhpcy5sZW5ndGgsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cblxuXHRwcml2YXRlIG9uQ29udGV4dE1lbnUoZXZlbnQ6IFN0YW5kYXJkTW91c2VFdmVudCwgdmlld1BhbmU6IFZpZXdQYW5lKTogdm9pZCB7XG5cdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblxuXHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IHZpZXdQYW5lLm1lbnVBY3Rpb25zLmdldENvbnRleHRNZW51QWN0aW9ucygpO1xuXG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gZXZlbnQsXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zXG5cdFx0fSk7XG5cdH1cblxuXHRvcGVuVmlldyhpZDogc3RyaW5nLCBmb2N1cz86IGJvb2xlYW4pOiBJVmlldyB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IHZpZXcgPSB0aGlzLmdldFZpZXcoaWQpO1xuXHRcdGlmICghdmlldykge1xuXHRcdFx0dGhpcy50b2dnbGVWaWV3VmlzaWJpbGl0eShpZCk7XG5cdFx0fVxuXHRcdHZpZXcgPSB0aGlzLmdldFZpZXcoaWQpO1xuXHRcdGlmICh2aWV3KSB7XG5cdFx0XHR2aWV3LnNldEV4cGFuZGVkKHRydWUpO1xuXHRcdFx0aWYgKGZvY3VzKSB7XG5cdFx0XHRcdHZpZXcuZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHZpZXc7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb25EaWRBZGRWaWV3RGVzY3JpcHRvcnMoYWRkZWQ6IElBZGRlZFZpZXdEZXNjcmlwdG9yUmVmW10pOiBWaWV3UGFuZVtdIHtcblx0XHRjb25zdCBwYW5lc1RvQWRkOiB7IHBhbmU6IFZpZXdQYW5lOyBzaXplOiBudW1iZXI7IGluZGV4OiBudW1iZXI7IGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlIH1bXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCB7IHZpZXdEZXNjcmlwdG9yLCBjb2xsYXBzZWQsIGluZGV4LCBzaXplIH0gb2YgYWRkZWQpIHtcblx0XHRcdGNvbnN0IHBhbmUgPSB0aGlzLmNyZWF0ZVZpZXcodmlld0Rlc2NyaXB0b3IsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogdmlld0Rlc2NyaXB0b3IuaWQsXG5cdFx0XHRcdFx0dGl0bGU6IHZpZXdEZXNjcmlwdG9yLm5hbWUudmFsdWUsXG5cdFx0XHRcdFx0ZnJvbUV4dGVuc2lvbklkOiAodmlld0Rlc2NyaXB0b3IgYXMgUGFydGlhbDxJQ3VzdG9tVmlld0Rlc2NyaXB0b3I+KS5leHRlbnNpb25JZCxcblx0XHRcdFx0XHRleHBhbmRlZDogIWNvbGxhcHNlZCxcblx0XHRcdFx0XHRzaW5nbGVWaWV3UGFuZUNvbnRhaW5lclRpdGxlOiB2aWV3RGVzY3JpcHRvci5zaW5nbGVWaWV3UGFuZUNvbnRhaW5lclRpdGxlLFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cGFuZS5yZW5kZXIoKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgRmFpbCB0byByZW5kZXIgdmlldyAke3ZpZXdEZXNjcmlwdG9yLmlkfWAsIGVycm9yKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAocGFuZS5kcmFnZ2FibGVFbGVtZW50KSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRleHRNZW51RGlzcG9zYWJsZSA9IGFkZERpc3Bvc2FibGVMaXN0ZW5lcihwYW5lLmRyYWdnYWJsZUVsZW1lbnQsICdjb250ZXh0bWVudScsIGUgPT4ge1xuXHRcdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdHRoaXMub25Db250ZXh0TWVudShuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGdldFdpbmRvdyhwYW5lLmRyYWdnYWJsZUVsZW1lbnQpLCBlKSwgcGFuZSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IGNvbGxhcHNlRGlzcG9zYWJsZSA9IEV2ZW50LmxhdGNoKEV2ZW50Lm1hcChwYW5lLm9uRGlkQ2hhbmdlLCAoKSA9PiAhcGFuZS5pc0V4cGFuZGVkKCkpKShjb2xsYXBzZWQgPT4ge1xuXHRcdFx0XHRcdHRoaXMudmlld0NvbnRhaW5lck1vZGVsLnNldENvbGxhcHNlZCh2aWV3RGVzY3JpcHRvci5pZCwgY29sbGFwc2VkKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0cGFuZXNUb0FkZC5wdXNoKHsgcGFuZSwgc2l6ZTogc2l6ZSB8fCBwYW5lLm1pbmltdW1TaXplLCBpbmRleCwgZGlzcG9zYWJsZTogY29tYmluZWREaXNwb3NhYmxlKGNvbnRleHRNZW51RGlzcG9zYWJsZSwgY29sbGFwc2VEaXNwb3NhYmxlKSB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmFkZFBhbmVzKHBhbmVzVG9BZGQpO1xuXHRcdHRoaXMucmVzdG9yZVZpZXdTaXplcygpO1xuXG5cdFx0Y29uc3QgcGFuZXM6IFZpZXdQYW5lW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHsgcGFuZSB9IG9mIHBhbmVzVG9BZGQpIHtcblx0XHRcdHBhbmUuc2V0VmlzaWJsZSh0aGlzLmlzVmlzaWJsZSgpKTtcblx0XHRcdHBhbmVzLnB1c2gocGFuZSk7XG5cdFx0fVxuXHRcdHJldHVybiBwYW5lcztcblx0fVxuXG5cdHByaXZhdGUgb25EaWRSZW1vdmVWaWV3RGVzY3JpcHRvcnMocmVtb3ZlZDogSVZpZXdEZXNjcmlwdG9yUmVmW10pOiB2b2lkIHtcblx0XHRyZW1vdmVkID0gcmVtb3ZlZC5zb3J0KChhLCBiKSA9PiBiLmluZGV4IC0gYS5pbmRleCk7XG5cdFx0Y29uc3QgcGFuZXNUb1JlbW92ZTogVmlld1BhbmVbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgeyBpbmRleCB9IG9mIHJlbW92ZWQpIHtcblx0XHRcdGNvbnN0IHBhbmVJdGVtID0gdGhpcy5wYW5lSXRlbXNbaW5kZXhdO1xuXHRcdFx0aWYgKHBhbmVJdGVtKSB7XG5cdFx0XHRcdHBhbmVzVG9SZW1vdmUucHVzaCh0aGlzLnBhbmVJdGVtc1tpbmRleF0ucGFuZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHBhbmVzVG9SZW1vdmUubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLnJlbW92ZVBhbmVzKHBhbmVzVG9SZW1vdmUpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHBhbmUgb2YgcGFuZXNUb1JlbW92ZSkge1xuXHRcdFx0XHRwYW5lLnNldFZpc2libGUoZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHRvZ2dsZVZpZXdWaXNpYmlsaXR5KHZpZXdJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Ly8gQ2hlY2sgaWYgdmlldyBpcyBhY3RpdmVcblx0XHRpZiAodGhpcy52aWV3Q29udGFpbmVyTW9kZWwuYWN0aXZlVmlld0Rlc2NyaXB0b3JzLnNvbWUodmlld0Rlc2NyaXB0b3IgPT4gdmlld0Rlc2NyaXB0b3IuaWQgPT09IHZpZXdJZCkpIHtcblx0XHRcdGNvbnN0IHZpc2libGUgPSAhdGhpcy52aWV3Q29udGFpbmVyTW9kZWwuaXNWaXNpYmxlKHZpZXdJZCk7XG5cdFx0XHR0aGlzLnZpZXdDb250YWluZXJNb2RlbC5zZXRWaXNpYmxlKHZpZXdJZCwgdmlzaWJsZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhZGRQYW5lKHBhbmU6IFZpZXdQYW5lLCBzaXplOiBudW1iZXIsIGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlLCBpbmRleCA9IHRoaXMucGFuZUl0ZW1zLmxlbmd0aCAtIDEpOiB2b2lkIHtcblx0XHRjb25zdCBvbkRpZEZvY3VzID0gcGFuZS5vbkRpZEZvY3VzKCgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkRm9jdXNWaWV3LmZpcmUocGFuZSk7XG5cdFx0XHR0aGlzLmxhc3RGb2N1c2VkUGFuZSA9IHBhbmU7XG5cdFx0fSk7XG5cdFx0Y29uc3Qgb25EaWRCbHVyID0gcGFuZS5vbkRpZEJsdXIoKCkgPT4gdGhpcy5fb25EaWRCbHVyVmlldy5maXJlKHBhbmUpKTtcblx0XHRjb25zdCBvbkRpZENoYW5nZVRpdGxlQXJlYSA9IHBhbmUub25EaWRDaGFuZ2VUaXRsZUFyZWEoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNWaWV3TWVyZ2VkV2l0aENvbnRhaW5lcigpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlVGl0bGVBcmVhKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBvbkRpZENoYW5nZVZpc2liaWxpdHkgPSBwYW5lLm9uRGlkQ2hhbmdlQm9keVZpc2liaWxpdHkoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VWaWV3VmlzaWJpbGl0eS5maXJlKHBhbmUpKTtcblx0XHRjb25zdCBvbkRpZENoYW5nZSA9IHBhbmUub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0aWYgKHBhbmUgPT09IHRoaXMubGFzdEZvY3VzZWRQYW5lICYmICFwYW5lLmlzRXhwYW5kZWQoKSkge1xuXHRcdFx0XHR0aGlzLmxhc3RGb2N1c2VkUGFuZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IGlzUGFuZWwgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24odGhpcy52aWV3Q29udGFpbmVyKSA9PT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsO1xuXHRcdHBhbmUuc3R5bGUoe1xuXHRcdFx0aGVhZGVyRm9yZWdyb3VuZDogYXNDc3NWYXJpYWJsZShpc1BhbmVsID8gUEFORUxfU0VDVElPTl9IRUFERVJfRk9SRUdST1VORCA6IFNJREVfQkFSX1NFQ1RJT05fSEVBREVSX0ZPUkVHUk9VTkQpLFxuXHRcdFx0aGVhZGVyQmFja2dyb3VuZDogYXNDc3NWYXJpYWJsZShpc1BhbmVsID8gUEFORUxfU0VDVElPTl9IRUFERVJfQkFDS0dST1VORCA6IFNJREVfQkFSX1NFQ1RJT05fSEVBREVSX0JBQ0tHUk9VTkQpLFxuXHRcdFx0aGVhZGVyQm9yZGVyOiBhc0Nzc1ZhcmlhYmxlKGlzUGFuZWwgPyBQQU5FTF9TRUNUSU9OX0hFQURFUl9CT1JERVIgOiBTSURFX0JBUl9TRUNUSU9OX0hFQURFUl9CT1JERVIpLFxuXHRcdFx0ZHJvcEJhY2tncm91bmQ6IGFzQ3NzVmFyaWFibGUoaXNQYW5lbCA/IFBBTkVMX1NFQ1RJT05fRFJBR19BTkRfRFJPUF9CQUNLR1JPVU5EIDogU0lERV9CQVJfRFJBR19BTkRfRFJPUF9CQUNLR1JPVU5EKSxcblx0XHRcdGxlZnRCb3JkZXI6IGlzUGFuZWwgPyBhc0Nzc1ZhcmlhYmxlKFBBTkVMX1NFQ1RJT05fQk9SREVSKSA6IHVuZGVmaW5lZFxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKGRpc3Bvc2FibGUpO1xuXHRcdHN0b3JlLmFkZChjb21iaW5lZERpc3Bvc2FibGUocGFuZSwgb25EaWRGb2N1cywgb25EaWRCbHVyLCBvbkRpZENoYW5nZVRpdGxlQXJlYSwgb25EaWRDaGFuZ2UsIG9uRGlkQ2hhbmdlVmlzaWJpbGl0eSkpO1xuXHRcdGNvbnN0IHBhbmVJdGVtOiBJVmlld1BhbmVJdGVtID0geyBwYW5lLCBkaXNwb3NhYmxlOiBzdG9yZSB9O1xuXG5cdFx0dGhpcy5wYW5lSXRlbXMuc3BsaWNlKGluZGV4LCAwLCBwYW5lSXRlbSk7XG5cdFx0YXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5wYW5ldmlldykuYWRkUGFuZShwYW5lLCBzaXplLCBpbmRleCk7XG5cblx0XHRsZXQgb3ZlcmxheTogVmlld1BhbmVEcm9wT3ZlcmxheSB8IHVuZGVmaW5lZDtcblxuXHRcdGlmICh0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5jYW5Nb3ZlVmlld3MoKSkge1xuXG5cdFx0XHRpZiAocGFuZS5kcmFnZ2FibGVFbGVtZW50KSB7XG5cdFx0XHRcdHN0b3JlLmFkZChDb21wb3NpdGVEcmFnQW5kRHJvcE9ic2VydmVyLklOU1RBTkNFLnJlZ2lzdGVyRHJhZ2dhYmxlKHBhbmUuZHJhZ2dhYmxlRWxlbWVudCwgKCkgPT4geyByZXR1cm4geyB0eXBlOiAndmlldycsIGlkOiBwYW5lLmlkIH07IH0sIHt9KSk7XG5cdFx0XHR9XG5cblx0XHRcdHN0b3JlLmFkZChDb21wb3NpdGVEcmFnQW5kRHJvcE9ic2VydmVyLklOU1RBTkNFLnJlZ2lzdGVyVGFyZ2V0KHBhbmUuZHJvcFRhcmdldEVsZW1lbnQsIHtcblx0XHRcdFx0b25EcmFnRW50ZXI6IChlKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCFvdmVybGF5KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBkcm9wRGF0YSA9IGUuZHJhZ0FuZERyb3BEYXRhLmdldERhdGEoKTtcblx0XHRcdFx0XHRcdGlmIChkcm9wRGF0YS50eXBlID09PSAndmlldycgJiYgZHJvcERhdGEuaWQgIT09IHBhbmUuaWQpIHtcblxuXHRcdFx0XHRcdFx0XHRjb25zdCBvbGRWaWV3Q29udGFpbmVyID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKGRyb3BEYXRhLmlkKTtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3IgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3RGVzY3JpcHRvckJ5SWQoZHJvcERhdGEuaWQpO1xuXG5cdFx0XHRcdFx0XHRcdGlmIChvbGRWaWV3Q29udGFpbmVyICE9PSB0aGlzLnZpZXdDb250YWluZXIgJiYgKCF2aWV3RGVzY3JpcHRvciB8fCAhdmlld0Rlc2NyaXB0b3IuY2FuTW92ZVZpZXcgfHwgdGhpcy52aWV3Q29udGFpbmVyLnJlamVjdEFkZGVkVmlld3MpKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0b3ZlcmxheSA9IG5ldyBWaWV3UGFuZURyb3BPdmVybGF5KHBhbmUuZHJvcFRhcmdldEVsZW1lbnQsIHRoaXMub3JpZW50YXRpb24gPz8gT3JpZW50YXRpb24uVkVSVElDQUwsIHVuZGVmaW5lZCwgdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckxvY2F0aW9uKHRoaXMudmlld0NvbnRhaW5lcikhLCB0aGlzLnRoZW1lU2VydmljZSk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmIChkcm9wRGF0YS50eXBlID09PSAnY29tcG9zaXRlJyAmJiBkcm9wRGF0YS5pZCAhPT0gdGhpcy52aWV3Q29udGFpbmVyLmlkICYmICF0aGlzLnZpZXdDb250YWluZXIucmVqZWN0QWRkZWRWaWV3cykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlJZChkcm9wRGF0YS5pZCkhO1xuXHRcdFx0XHRcdFx0XHRjb25zdCB2aWV3c1RvTW92ZSA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJNb2RlbChjb250YWluZXIpLmFsbFZpZXdEZXNjcmlwdG9ycztcblxuXHRcdFx0XHRcdFx0XHRpZiAoIXZpZXdzVG9Nb3ZlLnNvbWUodiA9PiAhdi5jYW5Nb3ZlVmlldykgJiYgdmlld3NUb01vdmUubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0XHRcdG92ZXJsYXkgPSBuZXcgVmlld1BhbmVEcm9wT3ZlcmxheShwYW5lLmRyb3BUYXJnZXRFbGVtZW50LCB0aGlzLm9yaWVudGF0aW9uID8/IE9yaWVudGF0aW9uLlZFUlRJQ0FMLCB1bmRlZmluZWQsIHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJMb2NhdGlvbih0aGlzLnZpZXdDb250YWluZXIpISwgdGhpcy50aGVtZVNlcnZpY2UpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbkRyYWdPdmVyOiAoZSkgPT4ge1xuXHRcdFx0XHRcdHRvZ2dsZURyb3BFZmZlY3QoZS5ldmVudERhdGEuZGF0YVRyYW5zZmVyLCAnbW92ZScsIG92ZXJsYXkgIT09IHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uRHJhZ0xlYXZlOiAoZSkgPT4ge1xuXHRcdFx0XHRcdG92ZXJsYXk/LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRvdmVybGF5ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbkRyb3A6IChlKSA9PiB7XG5cdFx0XHRcdFx0aWYgKG92ZXJsYXkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGRyb3BEYXRhID0gZS5kcmFnQW5kRHJvcERhdGEuZ2V0RGF0YSgpO1xuXHRcdFx0XHRcdFx0Y29uc3Qgdmlld3NUb01vdmU6IElWaWV3RGVzY3JpcHRvcltdID0gW107XG5cdFx0XHRcdFx0XHRsZXQgYW5jaG9yVmlldzogSVZpZXdEZXNjcmlwdG9yIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRcdFx0XHRpZiAoZHJvcERhdGEudHlwZSA9PT0gJ2NvbXBvc2l0ZScgJiYgZHJvcERhdGEuaWQgIT09IHRoaXMudmlld0NvbnRhaW5lci5pZCAmJiAhdGhpcy52aWV3Q29udGFpbmVyLnJlamVjdEFkZGVkVmlld3MpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5SWQoZHJvcERhdGEuaWQpITtcblx0XHRcdFx0XHRcdFx0Y29uc3QgYWxsVmlld3MgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwoY29udGFpbmVyKS5hbGxWaWV3RGVzY3JpcHRvcnM7XG5cblx0XHRcdFx0XHRcdFx0aWYgKGFsbFZpZXdzLmxlbmd0aCA+IDAgJiYgIWFsbFZpZXdzLnNvbWUodiA9PiAhdi5jYW5Nb3ZlVmlldykpIHtcblx0XHRcdFx0XHRcdFx0XHR2aWV3c1RvTW92ZS5wdXNoKC4uLmFsbFZpZXdzKTtcblx0XHRcdFx0XHRcdFx0XHRhbmNob3JWaWV3ID0gYWxsVmlld3NbMF07XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoZHJvcERhdGEudHlwZSA9PT0gJ3ZpZXcnKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG9sZFZpZXdDb250YWluZXIgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlWaWV3SWQoZHJvcERhdGEuaWQpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCB2aWV3RGVzY3JpcHRvciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdEZXNjcmlwdG9yQnlJZChkcm9wRGF0YS5pZCk7XG5cdFx0XHRcdFx0XHRcdGlmIChvbGRWaWV3Q29udGFpbmVyICE9PSB0aGlzLnZpZXdDb250YWluZXIgJiYgdmlld0Rlc2NyaXB0b3IgJiYgdmlld0Rlc2NyaXB0b3IuY2FuTW92ZVZpZXcgJiYgIXRoaXMudmlld0NvbnRhaW5lci5yZWplY3RBZGRlZFZpZXdzKSB7XG5cdFx0XHRcdFx0XHRcdFx0dmlld3NUb01vdmUucHVzaCh2aWV3RGVzY3JpcHRvcik7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRpZiAodmlld0Rlc2NyaXB0b3IpIHtcblx0XHRcdFx0XHRcdFx0XHRhbmNob3JWaWV3ID0gdmlld0Rlc2NyaXB0b3I7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKHZpZXdzVG9Nb3ZlKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLm1vdmVWaWV3c1RvQ29udGFpbmVyKHZpZXdzVG9Nb3ZlLCB0aGlzLnZpZXdDb250YWluZXIsIHVuZGVmaW5lZCwgJ2RuZCcpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpZiAoYW5jaG9yVmlldykge1xuXHRcdFx0XHRcdFx0XHRpZiAob3ZlcmxheS5jdXJyZW50RHJvcE9wZXJhdGlvbiA9PT0gRHJvcERpcmVjdGlvbi5ET1dOIHx8XG5cdFx0XHRcdFx0XHRcdFx0b3ZlcmxheS5jdXJyZW50RHJvcE9wZXJhdGlvbiA9PT0gRHJvcERpcmVjdGlvbi5SSUdIVCkge1xuXG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgZnJvbUluZGV4ID0gdGhpcy5wYW5lcy5maW5kSW5kZXgocCA9PiBwLmlkID09PSBhbmNob3JWaWV3IS5pZCk7XG5cdFx0XHRcdFx0XHRcdFx0bGV0IHRvSW5kZXggPSB0aGlzLnBhbmVzLmZpbmRJbmRleChwID0+IHAuaWQgPT09IHBhbmUuaWQpO1xuXG5cdFx0XHRcdFx0XHRcdFx0aWYgKGZyb21JbmRleCA+PSAwICYmIHRvSW5kZXggPj0gMCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKGZyb21JbmRleCA+IHRvSW5kZXgpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dG9JbmRleCsrO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAodG9JbmRleCA8IHRoaXMucGFuZXMubGVuZ3RoICYmIHRvSW5kZXggIT09IGZyb21JbmRleCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0aGlzLm1vdmVQYW5lKHRoaXMucGFuZXNbZnJvbUluZGV4XSwgdGhpcy5wYW5lc1t0b0luZGV4XSk7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0aWYgKG92ZXJsYXkuY3VycmVudERyb3BPcGVyYXRpb24gPT09IERyb3BEaXJlY3Rpb24uVVAgfHxcblx0XHRcdFx0XHRcdFx0XHRvdmVybGF5LmN1cnJlbnREcm9wT3BlcmF0aW9uID09PSBEcm9wRGlyZWN0aW9uLkxFRlQpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBmcm9tSW5kZXggPSB0aGlzLnBhbmVzLmZpbmRJbmRleChwID0+IHAuaWQgPT09IGFuY2hvclZpZXchLmlkKTtcblx0XHRcdFx0XHRcdFx0XHRsZXQgdG9JbmRleCA9IHRoaXMucGFuZXMuZmluZEluZGV4KHAgPT4gcC5pZCA9PT0gcGFuZS5pZCk7XG5cblx0XHRcdFx0XHRcdFx0XHRpZiAoZnJvbUluZGV4ID49IDAgJiYgdG9JbmRleCA+PSAwKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAoZnJvbUluZGV4IDwgdG9JbmRleCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0b0luZGV4LS07XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0XHRcdGlmICh0b0luZGV4ID49IDAgJiYgdG9JbmRleCAhPT0gZnJvbUluZGV4KSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHRoaXMubW92ZVBhbmUodGhpcy5wYW5lc1tmcm9tSW5kZXhdLCB0aGlzLnBhbmVzW3RvSW5kZXhdKTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRpZiAodmlld3NUb01vdmUubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRcdFx0XHRcdHZpZXdzVG9Nb3ZlLnNsaWNlKDEpLmZvckVhY2godmlldyA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRsZXQgdG9JbmRleCA9IHRoaXMucGFuZXMuZmluZEluZGV4KHAgPT4gcC5pZCA9PT0gYW5jaG9yVmlldyEuaWQpO1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgZnJvbUluZGV4ID0gdGhpcy5wYW5lcy5maW5kSW5kZXgocCA9PiBwLmlkID09PSB2aWV3LmlkKTtcblx0XHRcdFx0XHRcdFx0XHRcdGlmIChmcm9tSW5kZXggPj0gMCAmJiB0b0luZGV4ID49IDApIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKGZyb21JbmRleCA+IHRvSW5kZXgpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0b0luZGV4Kys7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRcdFx0XHRpZiAodG9JbmRleCA8IHRoaXMucGFuZXMubGVuZ3RoICYmIHRvSW5kZXggIT09IGZyb21JbmRleCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHRoaXMubW92ZVBhbmUodGhpcy5wYW5lc1tmcm9tSW5kZXhdLCB0aGlzLnBhbmVzW3RvSW5kZXhdKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRhbmNob3JWaWV3ID0gdmlldztcblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0b3ZlcmxheT8uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdG92ZXJsYXkgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRyZW1vdmVQYW5lcyhwYW5lczogVmlld1BhbmVbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHdhc01lcmdlZCA9IHRoaXMuaXNWaWV3TWVyZ2VkV2l0aENvbnRhaW5lcigpO1xuXG5cdFx0cGFuZXMuZm9yRWFjaChwYW5lID0+IHRoaXMucmVtb3ZlUGFuZShwYW5lKSk7XG5cblx0XHR0aGlzLnVwZGF0ZVZpZXdIZWFkZXJzKCk7XG5cdFx0aWYgKHdhc01lcmdlZCAhPT0gdGhpcy5pc1ZpZXdNZXJnZWRXaXRoQ29udGFpbmVyKCkpIHtcblx0XHRcdHRoaXMudXBkYXRlVGl0bGVBcmVhKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRSZW1vdmVWaWV3cy5maXJlKHBhbmVzKTtcblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlUGFuZShwYW5lOiBWaWV3UGFuZSk6IHZvaWQge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5wYW5lSXRlbXMuZmluZEluZGV4KGkgPT4gaS5wYW5lID09PSBwYW5lKTtcblxuXHRcdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5sYXN0Rm9jdXNlZFBhbmUgPT09IHBhbmUpIHtcblx0XHRcdHRoaXMubGFzdEZvY3VzZWRQYW5lID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMucGFuZXZpZXcpLnJlbW92ZVBhbmUocGFuZSk7XG5cdFx0Y29uc3QgW3BhbmVJdGVtXSA9IHRoaXMucGFuZUl0ZW1zLnNwbGljZShpbmRleCwgMSk7XG5cdFx0cGFuZUl0ZW0uZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cblx0fVxuXG5cdG1vdmVQYW5lKGZyb206IFZpZXdQYW5lLCB0bzogVmlld1BhbmUpOiB2b2lkIHtcblx0XHRjb25zdCBmcm9tSW5kZXggPSB0aGlzLnBhbmVJdGVtcy5maW5kSW5kZXgoaXRlbSA9PiBpdGVtLnBhbmUgPT09IGZyb20pO1xuXHRcdGNvbnN0IHRvSW5kZXggPSB0aGlzLnBhbmVJdGVtcy5maW5kSW5kZXgoaXRlbSA9PiBpdGVtLnBhbmUgPT09IHRvKTtcblxuXHRcdGNvbnN0IGZyb21WaWV3RGVzY3JpcHRvciA9IHRoaXMudmlld0NvbnRhaW5lck1vZGVsLnZpc2libGVWaWV3RGVzY3JpcHRvcnNbZnJvbUluZGV4XTtcblx0XHRjb25zdCB0b1ZpZXdEZXNjcmlwdG9yID0gdGhpcy52aWV3Q29udGFpbmVyTW9kZWwudmlzaWJsZVZpZXdEZXNjcmlwdG9yc1t0b0luZGV4XTtcblxuXHRcdGlmIChmcm9tSW5kZXggPCAwIHx8IGZyb21JbmRleCA+PSB0aGlzLnBhbmVJdGVtcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodG9JbmRleCA8IDAgfHwgdG9JbmRleCA+PSB0aGlzLnBhbmVJdGVtcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBbcGFuZUl0ZW1dID0gdGhpcy5wYW5lSXRlbXMuc3BsaWNlKGZyb21JbmRleCwgMSk7XG5cdFx0dGhpcy5wYW5lSXRlbXMuc3BsaWNlKHRvSW5kZXgsIDAsIHBhbmVJdGVtKTtcblxuXHRcdGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMucGFuZXZpZXcpLm1vdmVQYW5lKGZyb20sIHRvKTtcblxuXHRcdHRoaXMudmlld0NvbnRhaW5lck1vZGVsLm1vdmUoZnJvbVZpZXdEZXNjcmlwdG9yLmlkLCB0b1ZpZXdEZXNjcmlwdG9yLmlkKTtcblxuXHRcdHRoaXMudXBkYXRlVGl0bGVBcmVhKCk7XG5cdH1cblxuXHRyZXNpemVQYW5lKHBhbmU6IFZpZXdQYW5lLCBzaXplOiBudW1iZXIpOiB2b2lkIHtcblx0XHRhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLnBhbmV2aWV3KS5yZXNpemVQYW5lKHBhbmUsIHNpemUpO1xuXHR9XG5cblx0Z2V0UGFuZVNpemUocGFuZTogVmlld1BhbmUpOiBudW1iZXIge1xuXHRcdHJldHVybiBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLnBhbmV2aWV3KS5nZXRQYW5lU2l6ZShwYW5lKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVmlld0hlYWRlcnMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNWaWV3TWVyZ2VkV2l0aENvbnRhaW5lcigpKSB7XG5cdFx0XHRpZiAodGhpcy5wYW5lSXRlbXNbMF0ucGFuZS5pc0V4cGFuZGVkKCkpIHtcblx0XHRcdFx0dGhpcy5sYXN0TWVyZ2VkQ29sbGFwc2VkUGFuZSA9IHVuZGVmaW5lZDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubGFzdE1lcmdlZENvbGxhcHNlZFBhbmUgPSB0aGlzLnBhbmVJdGVtc1swXS5wYW5lO1xuXHRcdFx0XHR0aGlzLnBhbmVJdGVtc1swXS5wYW5lLnNldEV4cGFuZGVkKHRydWUpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5wYW5lSXRlbXNbMF0ucGFuZS5oZWFkZXJWaXNpYmxlID0gZmFsc2U7XG5cdFx0XHR0aGlzLnBhbmVJdGVtc1swXS5wYW5lLmNvbGxhcHNpYmxlID0gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMucGFuZUl0ZW1zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHR0aGlzLnBhbmVJdGVtc1swXS5wYW5lLmhlYWRlclZpc2libGUgPSB0cnVlO1xuXHRcdFx0XHRpZiAodGhpcy5wYW5lSXRlbXNbMF0ucGFuZSA9PT0gdGhpcy5sYXN0TWVyZ2VkQ29sbGFwc2VkUGFuZSkge1xuXHRcdFx0XHRcdHRoaXMucGFuZUl0ZW1zWzBdLnBhbmUuc2V0RXhwYW5kZWQoZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMucGFuZUl0ZW1zWzBdLnBhbmUuY29sbGFwc2libGUgPSBmYWxzZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMucGFuZUl0ZW1zLmZvckVhY2goaSA9PiB7XG5cdFx0XHRcdFx0aS5wYW5lLmhlYWRlclZpc2libGUgPSB0cnVlO1xuXHRcdFx0XHRcdGkucGFuZS5jb2xsYXBzaWJsZSA9IHRydWU7XG5cdFx0XHRcdFx0aWYgKGkucGFuZSA9PT0gdGhpcy5sYXN0TWVyZ2VkQ29sbGFwc2VkUGFuZSkge1xuXHRcdFx0XHRcdFx0aS5wYW5lLnNldEV4cGFuZGVkKGZhbHNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5sYXN0TWVyZ2VkQ29sbGFwc2VkUGFuZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRpc1ZpZXdNZXJnZWRXaXRoQ29udGFpbmVyKCk6IGJvb2xlYW4ge1xuXHRcdGlmICghKHRoaXMub3B0aW9ucy5tZXJnZVZpZXdXaXRoQ29udGFpbmVyV2hlblNpbmdsZVZpZXcgJiYgdGhpcy5wYW5lSXRlbXMubGVuZ3RoID09PSAxKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuYXJlRXh0ZW5zaW9uc1JlYWR5KSB7XG5cdFx0XHRpZiAodGhpcy52aXNpYmxlVmlld3NDb3VudEZyb21DYWNoZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnBhbmVJdGVtc1swXS5wYW5lLmlzRXhwYW5kZWQoKTtcblx0XHRcdH1cblx0XHRcdC8vIENoZWNrIGluIGNhY2hlIHNvIHRoYXQgdmlldyBkbyBub3QganVtcC4gU2VlICMyOTYwOVxuXHRcdFx0cmV0dXJuIHRoaXMudmlzaWJsZVZpZXdzQ291bnRGcm9tQ2FjaGUgPT09IDE7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZFNjcm9sbFBhbmUoKSB7XG5cdFx0Zm9yIChjb25zdCBwYW5lIG9mIHRoaXMucGFuZXMpIHtcblx0XHRcdHBhbmUub25EaWRTY3JvbGxSb290KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZFNhc2hSZXNldChpbmRleDogbnVtYmVyKSB7XG5cdFx0bGV0IGZpcnN0UGFuZSA9IHVuZGVmaW5lZDtcblx0XHRsZXQgc2Vjb25kUGFuZSA9IHVuZGVmaW5lZDtcblxuXHRcdC8vIERlYWwgd2l0aCBjb2xsYXBzZWQgdmlld3M6IHRvIGJlIGNsZXZlciwgd2Ugc3BsaXQgdGhlIHNwYWNlIHRha2VuIGJ5IHRoZSBuZWFyZXN0IHVuY29sbGFwc2VkIHZpZXdzXG5cdFx0Zm9yIChsZXQgaSA9IGluZGV4OyBpID49IDA7IGktLSkge1xuXHRcdFx0aWYgKHRoaXMucGFuZUl0ZW1zW2ldLnBhbmU/LmlzVmlzaWJsZSgpICYmIHRoaXMucGFuZUl0ZW1zW2ldPy5wYW5lLmlzRXhwYW5kZWQoKSkge1xuXHRcdFx0XHRmaXJzdFBhbmUgPSB0aGlzLnBhbmVJdGVtc1tpXS5wYW5lO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGxldCBpID0gaW5kZXggKyAxOyBpIDwgdGhpcy5wYW5lSXRlbXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmICh0aGlzLnBhbmVJdGVtc1tpXS5wYW5lPy5pc1Zpc2libGUoKSAmJiB0aGlzLnBhbmVJdGVtc1tpXT8ucGFuZS5pc0V4cGFuZGVkKCkpIHtcblx0XHRcdFx0c2Vjb25kUGFuZSA9IHRoaXMucGFuZUl0ZW1zW2ldLnBhbmU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChmaXJzdFBhbmUgJiYgc2Vjb25kUGFuZSkge1xuXHRcdFx0Y29uc3QgZmlyc3RQYW5lU2l6ZSA9IHRoaXMuZ2V0UGFuZVNpemUoZmlyc3RQYW5lKTtcblx0XHRcdGNvbnN0IHNlY29uZFBhbmVTaXplID0gdGhpcy5nZXRQYW5lU2l6ZShzZWNvbmRQYW5lKTtcblxuXHRcdFx0Ly8gQXZvaWQgcm91bmRpbmcgZXJyb3JzIGFuZCBiZSBjb25zaXN0ZW50IHdoZW4gcmVzaXppbmdcblx0XHRcdC8vIFRoZSBmaXJzdCBwYW5lIGFsd2F5cyBnZXQgaGFsZiByb3VuZGVkIHVwIGFuZCB0aGUgc2Vjb25kIGlzIGhhbGYgcm91bmRlZCBkb3duXG5cdFx0XHRjb25zdCBuZXdGaXJzdFBhbmVTaXplID0gTWF0aC5jZWlsKChmaXJzdFBhbmVTaXplICsgc2Vjb25kUGFuZVNpemUpIC8gMik7XG5cdFx0XHRjb25zdCBuZXdTZWNvbmRQYW5lU2l6ZSA9IE1hdGguZmxvb3IoKGZpcnN0UGFuZVNpemUgKyBzZWNvbmRQYW5lU2l6ZSkgLyAyKTtcblxuXHRcdFx0Ly8gU2hyaW5rIHRoZSBsYXJnZXIgcGFuZSBmaXJzdCwgdGhlbiBncm93IHRoZSBzbWFsbGVyIHBhbmVcblx0XHRcdC8vIFRoaXMgcHJldmVudHMgaW50ZXJmZXJpbmcgd2l0aCBvdGhlciB2aWV3IHNpemVzXG5cdFx0XHRpZiAoZmlyc3RQYW5lU2l6ZSA+IHNlY29uZFBhbmVTaXplKSB7XG5cdFx0XHRcdHRoaXMucmVzaXplUGFuZShmaXJzdFBhbmUsIG5ld0ZpcnN0UGFuZVNpemUpO1xuXHRcdFx0XHR0aGlzLnJlc2l6ZVBhbmUoc2Vjb25kUGFuZSwgbmV3U2Vjb25kUGFuZVNpemUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5yZXNpemVQYW5lKHNlY29uZFBhbmUsIG5ld1NlY29uZFBhbmVTaXplKTtcblx0XHRcdFx0dGhpcy5yZXNpemVQYW5lKGZpcnN0UGFuZSwgbmV3Rmlyc3RQYW5lU2l6ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5wYW5lSXRlbXMuZm9yRWFjaChpID0+IGkuZGlzcG9zYWJsZS5kaXNwb3NlKCkpO1xuXHRcdGlmICh0aGlzLnBhbmV2aWV3KSB7XG5cdFx0XHR0aGlzLnBhbmV2aWV3LmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIFZpZXdQYW5lQ29udGFpbmVyQWN0aW9uPFQgZXh0ZW5kcyBJVmlld1BhbmVDb250YWluZXI+IGV4dGVuZHMgQWN0aW9uMiB7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IGRlc2M6IFJlYWRvbmx5PElBY3Rpb24yT3B0aW9ucz4gJiB7IHZpZXdQYW5lQ29udGFpbmVySWQ6IHN0cmluZyB9O1xuXHRjb25zdHJ1Y3RvcihkZXNjOiBSZWFkb25seTxJQWN0aW9uMk9wdGlvbnM+ICYgeyB2aWV3UGFuZUNvbnRhaW5lcklkOiBzdHJpbmcgfSkge1xuXHRcdHN1cGVyKGRlc2MpO1xuXHRcdHRoaXMuZGVzYyA9IGRlc2M7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHVua25vd24ge1xuXHRcdGNvbnN0IHZpZXdQYW5lQ29udGFpbmVyID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpLmdldEFjdGl2ZVZpZXdQYW5lQ29udGFpbmVyV2l0aElkKHRoaXMuZGVzYy52aWV3UGFuZUNvbnRhaW5lcklkKTtcblx0XHRpZiAodmlld1BhbmVDb250YWluZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLnJ1bkluVmlld1BhbmVDb250YWluZXIoYWNjZXNzb3IsIDxUPnZpZXdQYW5lQ29udGFpbmVyLCAuLi5hcmdzKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFic3RyYWN0IHJ1bkluVmlld1BhbmVDb250YWluZXIoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXdQYW5lQ29udGFpbmVyOiBULCAuLi5hcmdzOiB1bmtub3duW10pOiB1bmtub3duO1xufVxuXG5jbGFzcyBNb3ZlVmlld1Bvc2l0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKGRlc2M6IFJlYWRvbmx5PElBY3Rpb24yT3B0aW9ucz4sIHByaXZhdGUgcmVhZG9ubHkgb2Zmc2V0OiBudW1iZXIpIHtcblx0XHRzdXBlcihkZXNjKTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgdmlld0lkID0gRm9jdXNlZFZpZXdDb250ZXh0LmdldFZhbHVlKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRpZiAodmlld0lkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB2aWV3Q29udGFpbmVyID0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeVZpZXdJZCh2aWV3SWQpITtcblx0XHRjb25zdCBtb2RlbCA9IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwodmlld0NvbnRhaW5lcik7XG5cblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvciA9IG1vZGVsLnZpc2libGVWaWV3RGVzY3JpcHRvcnMuZmluZCh2ZCA9PiB2ZC5pZCA9PT0gdmlld0lkKSE7XG5cdFx0Y29uc3QgY3VycmVudEluZGV4ID0gbW9kZWwudmlzaWJsZVZpZXdEZXNjcmlwdG9ycy5pbmRleE9mKHZpZXdEZXNjcmlwdG9yKTtcblx0XHRpZiAoY3VycmVudEluZGV4ICsgdGhpcy5vZmZzZXQgPCAwIHx8IGN1cnJlbnRJbmRleCArIHRoaXMub2Zmc2V0ID49IG1vZGVsLnZpc2libGVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3UG9zaXRpb24gPSBtb2RlbC52aXNpYmxlVmlld0Rlc2NyaXB0b3JzW2N1cnJlbnRJbmRleCArIHRoaXMub2Zmc2V0XTtcblxuXHRcdG1vZGVsLm1vdmUodmlld0Rlc2NyaXB0b3IuaWQsIG5ld1Bvc2l0aW9uLmlkKTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoXG5cdGNsYXNzIE1vdmVWaWV3VXAgZXh0ZW5kcyBNb3ZlVmlld1Bvc2l0aW9uIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6ICd2aWV3cy5tb3ZlVmlld1VwJyxcblx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgndmlld01vdmVVcCcsIFwiTW92ZSBWaWV3IFVwXCIpLFxuXHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgKyBLZXlDb2RlLktleUssIEtleUNvZGUuVXBBcnJvdyksXG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAxLFxuXHRcdFx0XHRcdHdoZW46IEZvY3VzZWRWaWV3Q29udGV4dC5ub3RFcXVhbHNUbygnJylcblx0XHRcdFx0fVxuXHRcdFx0fSwgLTEpO1xuXHRcdH1cblx0fVxuKTtcblxucmVnaXN0ZXJBY3Rpb24yKFxuXHRjbGFzcyBNb3ZlVmlld0xlZnQgZXh0ZW5kcyBNb3ZlVmlld1Bvc2l0aW9uIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6ICd2aWV3cy5tb3ZlVmlld0xlZnQnLFxuXHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCd2aWV3TW92ZUxlZnQnLCBcIk1vdmUgVmlldyBMZWZ0XCIpLFxuXHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgKyBLZXlDb2RlLktleUssIEtleUNvZGUuTGVmdEFycm93KSxcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEsXG5cdFx0XHRcdFx0d2hlbjogRm9jdXNlZFZpZXdDb250ZXh0Lm5vdEVxdWFsc1RvKCcnKVxuXHRcdFx0XHR9XG5cdFx0XHR9LCAtMSk7XG5cdFx0fVxuXHR9XG4pO1xuXG5yZWdpc3RlckFjdGlvbjIoXG5cdGNsYXNzIE1vdmVWaWV3RG93biBleHRlbmRzIE1vdmVWaWV3UG9zaXRpb24ge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3ZpZXdzLm1vdmVWaWV3RG93bicsXG5cdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ3ZpZXdNb3ZlRG93bicsIFwiTW92ZSBWaWV3IERvd25cIiksXG5cdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCArIEtleUNvZGUuS2V5SywgS2V5Q29kZS5Eb3duQXJyb3cpLFxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMSxcblx0XHRcdFx0XHR3aGVuOiBGb2N1c2VkVmlld0NvbnRleHQubm90RXF1YWxzVG8oJycpXG5cdFx0XHRcdH1cblx0XHRcdH0sIDEpO1xuXHRcdH1cblx0fVxuKTtcblxucmVnaXN0ZXJBY3Rpb24yKFxuXHRjbGFzcyBNb3ZlVmlld1JpZ2h0IGV4dGVuZHMgTW92ZVZpZXdQb3NpdGlvbiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAndmlld3MubW92ZVZpZXdSaWdodCcsXG5cdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ3ZpZXdNb3ZlUmlnaHQnLCBcIk1vdmUgVmlldyBSaWdodFwiKSxcblx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kICsgS2V5Q29kZS5LZXlLLCBLZXlDb2RlLlJpZ2h0QXJyb3cpLFxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMSxcblx0XHRcdFx0XHR3aGVuOiBGb2N1c2VkVmlld0NvbnRleHQubm90RXF1YWxzVG8oJycpXG5cdFx0XHRcdH1cblx0XHRcdH0sIDEpO1xuXHRcdH1cblx0fVxuKTtcblxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgTW92ZVZpZXdzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAndnNjb2RlLm1vdmVWaWV3cycsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCd2aWV3c01vdmUnLCBcIk1vdmUgVmlld3NcIiksXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIG9wdGlvbnM6IHsgdmlld0lkczogc3RyaW5nW107IGRlc3RpbmF0aW9uSWQ6IHN0cmluZyB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KG9wdGlvbnM/LnZpZXdJZHMpIHx8IHR5cGVvZiBvcHRpb25zPy5kZXN0aW5hdGlvbklkICE9PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KCdJbnZhbGlkIGFyZ3VtZW50cycpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGRlc3RpbmF0aW9uID0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeUlkKG9wdGlvbnMuZGVzdGluYXRpb25JZCk7XG5cdFx0aWYgKCFkZXN0aW5hdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEZZSSwgZG9uJ3QgdXNlIGBtb3ZlVmlld3NUb0NvbnRhaW5lcmAgaW4gMSBzaG90LCBiZWNhdXNlIGl0IGV4cGVjdHMgYWxsIHZpZXdzIHRvIGhhdmUgdGhlIHNhbWUgY3VycmVudCBsb2NhdGlvblxuXHRcdGZvciAoY29uc3Qgdmlld0lkIG9mIG9wdGlvbnMudmlld0lkcykge1xuXHRcdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3IgPSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0Rlc2NyaXB0b3JCeUlkKHZpZXdJZCk7XG5cdFx0XHRpZiAodmlld0Rlc2NyaXB0b3I/LmNhbk1vdmVWaWV3KSB7XG5cdFx0XHRcdHZpZXdEZXNjcmlwdG9yU2VydmljZS5tb3ZlVmlld3NUb0NvbnRhaW5lcihbdmlld0Rlc2NyaXB0b3JdLCBkZXN0aW5hdGlvbiwgVmlld1Zpc2liaWxpdHlTdGF0ZS5EZWZhdWx0LCB0aGlzLmRlc2MuaWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGF3YWl0IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKS5vcGVuVmlld0NvbnRhaW5lcihkZXN0aW5hdGlvbi5pZCwgdHJ1ZSk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLEdBQUcsdUJBQWtDLHFCQUFxQixXQUFXLFdBQVcsa0JBQWtCO0FBQzNHLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsYUFBYSxnQkFBZ0IsZUFBZTtBQUVyRCxTQUEwQixtQkFBbUI7QUFDN0MsU0FBMkIsZ0JBQWdCO0FBRTNDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsVUFBVSxTQUFTLGNBQWM7QUFDMUMsU0FBUyxvQkFBb0IsaUJBQThCLG9CQUFvQjtBQUMvRSxTQUFTLDRCQUE0QjtBQUNyQyxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNEJBQTRC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
