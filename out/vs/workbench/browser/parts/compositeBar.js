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
import { localize } from "../../../nls.js";
import { toAction } from "../../../base/common/actions.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { ActionBar, ActionsOrientation } from "../../../base/browser/ui/actionbar/actionbar.js";
import { CompositeActionViewItem, CompositeOverflowActivityAction, CompositeOverflowActivityActionViewItem } from "./compositeBarActions.js";
import { $, addDisposableListener, EventType, EventHelper, isAncestor, getWindow } from "../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../base/browser/mouseEvent.js";
import { IContextMenuService } from "../../../platform/contextview/browser/contextView.js";
import { Widget } from "../../../base/browser/ui/widget.js";
import { isUndefinedOrNull } from "../../../base/common/types.js";
import { Emitter } from "../../../base/common/event.js";
import { IViewDescriptorService } from "../../common/views.js";
import { CompositeDragAndDropObserver, toggleDropEffect } from "../dnd.js";
import { Gesture, EventType as TouchEventType } from "../../../base/browser/touch.js";
import { MutableDisposable } from "../../../base/common/lifecycle.js";
class CompositeDragAndDrop {
  constructor(viewDescriptorService, targetContainerLocation, orientation, openComposite, moveComposite, getItems) {
    this.viewDescriptorService = viewDescriptorService;
    this.targetContainerLocation = targetContainerLocation;
    this.orientation = orientation;
    this.openComposite = openComposite;
    this.moveComposite = moveComposite;
    this.getItems = getItems;
  }
  drop(data, targetCompositeId, originalEvent, before) {
    const dragData = data.getData();
    if (dragData.type === "composite") {
      const currentContainer = this.viewDescriptorService.getViewContainerById(dragData.id);
      const currentLocation = this.viewDescriptorService.getViewContainerLocation(currentContainer);
      let moved = false;
      if (currentLocation === this.targetContainerLocation) {
        if (targetCompositeId) {
          this.moveComposite(dragData.id, targetCompositeId, before);
          moved = true;
        }
      } else {
        this.viewDescriptorService.moveViewContainerToLocation(currentContainer, this.targetContainerLocation, this.getTargetIndex(targetCompositeId, before), "dnd");
        moved = true;
      }
      if (moved) {
        this.openComposite(currentContainer.id, true);
      }
    }
    if (dragData.type === "view") {
      const viewToMove = this.viewDescriptorService.getViewDescriptorById(dragData.id);
      if (viewToMove.canMoveView) {
        this.viewDescriptorService.moveViewToLocation(viewToMove, this.targetContainerLocation, "dnd");
        const newContainer = this.viewDescriptorService.getViewContainerByViewId(viewToMove.id);
        if (targetCompositeId) {
          this.moveComposite(newContainer.id, targetCompositeId, before);
        }
        this.openComposite(newContainer.id, true).then((composite) => {
          composite?.openView(viewToMove.id, true);
        });
      }
    }
  }
  onDragEnter(data, targetCompositeId, originalEvent) {
    return this.canDrop(data, targetCompositeId);
  }
  onDragOver(data, targetCompositeId, originalEvent) {
    return this.canDrop(data, targetCompositeId);
  }
  getTargetIndex(targetId, before2d) {
    if (!targetId) {
      return void 0;
    }
    const items = this.getItems();
    const before = this.orientation === ActionsOrientation.HORIZONTAL ? before2d?.horizontallyBefore : before2d?.verticallyBefore;
    return items.filter((item) => item.visible).findIndex((item) => item.id === targetId) + (before ? 0 : 1);
  }
  canDrop(data, targetCompositeId) {
    const dragData = data.getData();
    if (dragData.type === "composite") {
      const currentContainer = this.viewDescriptorService.getViewContainerById(dragData.id);
      const currentLocation = this.viewDescriptorService.getViewContainerLocation(currentContainer);
      if (currentLocation === this.targetContainerLocation) {
        return dragData.id !== targetCompositeId;
      }
      return true;
    } else {
      const viewDescriptor = this.viewDescriptorService.getViewDescriptorById(dragData.id);
      if (!viewDescriptor?.canMoveView) {
        return false;
      }
      return true;
    }
  }
}
class CompositeBarDndCallbacks {
  constructor(compositeBarContainer, actionBarContainer, compositeBarModel, dndHandler, orientation) {
    this.compositeBarContainer = compositeBarContainer;
    this.actionBarContainer = actionBarContainer;
    this.compositeBarModel = compositeBarModel;
    this.dndHandler = dndHandler;
    this.orientation = orientation;
    this.insertDropBefore = void 0;
  }
  onDragOver(e) {
    const visibleItems = this.compositeBarModel.visibleItems;
    if (!visibleItems.length || e.eventData.target && isAncestor(e.eventData.target, this.actionBarContainer)) {
      this.insertDropBefore = this.updateFromDragging(this.compositeBarContainer, false, false, true);
      return;
    }
    const insertAtFront = this.insertAtFront(this.actionBarContainer, e.eventData);
    const target = insertAtFront ? visibleItems[0] : visibleItems[visibleItems.length - 1];
    const validDropTarget = this.dndHandler.onDragOver(e.dragAndDropData, target.id, e.eventData);
    toggleDropEffect(e.eventData.dataTransfer, "move", validDropTarget);
    this.insertDropBefore = this.updateFromDragging(this.compositeBarContainer, validDropTarget, insertAtFront, true);
  }
  onDragLeave(e) {
    this.insertDropBefore = this.updateFromDragging(this.compositeBarContainer, false, false, false);
  }
  onDragEnd(e) {
    this.insertDropBefore = this.updateFromDragging(this.compositeBarContainer, false, false, false);
  }
  onDrop(e) {
    const visibleItems = this.compositeBarModel.visibleItems;
    let targetId = void 0;
    if (visibleItems.length) {
      targetId = this.insertAtFront(this.actionBarContainer, e.eventData) ? visibleItems[0].id : visibleItems[visibleItems.length - 1].id;
    }
    this.dndHandler.drop(e.dragAndDropData, targetId, e.eventData, this.insertDropBefore);
    this.insertDropBefore = this.updateFromDragging(this.compositeBarContainer, false, false, false);
  }
  insertAtFront(element, event) {
    const rect = element.getBoundingClientRect();
    const posX = event.clientX;
    const posY = event.clientY;
    switch (this.orientation) {
      case ActionsOrientation.HORIZONTAL:
        return posX < rect.left;
      case ActionsOrientation.VERTICAL:
        return posY < rect.top;
    }
  }
  updateFromDragging(element, showFeedback, front, isDragging) {
    element.classList.toggle("dragged-over", isDragging);
    element.classList.toggle("dragged-over-head", showFeedback && front);
    element.classList.toggle("dragged-over-tail", showFeedback && !front);
    if (!showFeedback) {
      return void 0;
    }
    return { verticallyBefore: front, horizontallyBefore: front };
  }
}
let CompositeBar = class extends Widget {
  constructor(items, options, instantiationService, contextMenuService, viewDescriptorService) {
    super();
    this.options = options;
    this.instantiationService = instantiationService;
    this.contextMenuService = contextMenuService;
    this.viewDescriptorService = viewDescriptorService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this.compositeOverflowAction = this._register(new MutableDisposable());
    this.compositeOverflowActionViewItem = this._register(new MutableDisposable());
    this.model = new CompositeBarModel(items, options);
    this.visibleComposites = [];
    this.compositeSizeInBar = /* @__PURE__ */ new Map();
    this.computeSizes(this.model.visibleItems);
  }
  getCompositeBarItems() {
    return [...this.model.items];
  }
  setCompositeBarItems(items) {
    this.model.setItems(items);
    this.updateCompositeSwitcher(true);
  }
  getPinnedComposites() {
    return this.model.pinnedItems;
  }
  getPinnedCompositeIds() {
    return this.getPinnedComposites().map((c) => c.id);
  }
  getVisibleComposites() {
    return this.model.visibleItems;
  }
  create(parent) {
    const actionBarDiv = parent.appendChild($(".composite-bar"));
    this.compositeSwitcherBar = this._register(new ActionBar(actionBarDiv, {
      actionViewItemProvider: (action, options) => {
        if (action instanceof CompositeOverflowActivityAction) {
          return this.compositeOverflowActionViewItem.value;
        }
        const item = this.model.findItem(action.id);
        return item && this.instantiationService.createInstance(
          CompositeActionViewItem,
          { ...options, draggable: true, colors: this.options.colors, icon: this.options.icon, hoverOptions: this.options.activityHoverOptions, compact: this.options.compact },
          action,
          item.pinnedAction,
          item.toggleBadgeAction,
          (compositeId) => this.options.getContextMenuActionsForComposite(compositeId),
          () => this.getContextMenuActions(),
          this.options.dndHandler,
          this
        );
      },
      orientation: this.options.orientation,
      ariaLabel: localize("activityBarAriaLabel", "Active View Switcher"),
      ariaRole: "tablist",
      preventLoopNavigation: this.options.preventLoopNavigation,
      triggerKeys: { keyDown: true }
    }));
    this._register(addDisposableListener(parent, EventType.CONTEXT_MENU, (e) => this.showContextMenu(getWindow(parent), e)));
    this._register(Gesture.addTarget(parent));
    this._register(addDisposableListener(parent, TouchEventType.Contextmenu, (e) => this.showContextMenu(getWindow(parent), e)));
    const dndCallback = new CompositeBarDndCallbacks(parent, actionBarDiv, this.model, this.options.dndHandler, this.options.orientation);
    this._register(CompositeDragAndDropObserver.INSTANCE.registerTarget(parent, dndCallback));
    return actionBarDiv;
  }
  focus(index) {
    this.compositeSwitcherBar?.focus(index);
  }
  recomputeSizes() {
    this.computeSizes(this.model.visibleItems);
    this.updateCompositeSwitcher();
  }
  layout(dimension) {
    this.dimension = dimension;
    if (dimension.height === 0 || dimension.width === 0) {
      return;
    }
    if (this.compositeSizeInBar.size === 0) {
      this.computeSizes(this.model.visibleItems);
    }
    this.updateCompositeSwitcher();
  }
  addComposite({ id, name, order, requestedIndex }) {
    if (this.model.add(id, name, order, requestedIndex)) {
      this.computeSizes([this.model.findItem(id)]);
      this.updateCompositeSwitcher();
    }
  }
  removeComposite(id) {
    if (this.isPinned(id)) {
      this.unpin(id);
    }
    if (this.model.remove(id)) {
      this.updateCompositeSwitcher();
    }
  }
  hideComposite(id) {
    if (this.model.hide(id)) {
      this.resetActiveComposite(id);
      this.updateCompositeSwitcher();
    }
  }
  activateComposite(id) {
    const previousActiveItem = this.model.activeItem;
    if (this.model.activate(id)) {
      if (this.visibleComposites.indexOf(id) === -1 || !!this.model.activeItem && !this.model.activeItem.pinned || previousActiveItem && !previousActiveItem.pinned) {
        this.updateCompositeSwitcher();
      }
    }
  }
  deactivateComposite(id) {
    const previousActiveItem = this.model.activeItem;
    if (this.model.deactivate()) {
      if (previousActiveItem && !previousActiveItem.pinned) {
        this.updateCompositeSwitcher();
      }
    }
  }
  async pin(compositeId, open) {
    if (this.model.setPinned(compositeId, true)) {
      this.updateCompositeSwitcher();
      if (open) {
        await this.options.openComposite(compositeId);
        this.activateComposite(compositeId);
      }
    }
  }
  unpin(compositeId) {
    if (this.model.setPinned(compositeId, false)) {
      this.updateCompositeSwitcher();
      this.resetActiveComposite(compositeId);
    }
  }
  areBadgesEnabled(compositeId) {
    return this.viewDescriptorService.getViewContainerBadgeEnablementState(compositeId);
  }
  toggleBadgeEnablement(compositeId) {
    this.viewDescriptorService.setViewContainerBadgeEnablementState(compositeId, !this.areBadgesEnabled(compositeId));
    this.updateCompositeSwitcher();
    const item = this.model.findItem(compositeId);
    if (item) {
      item.activityAction.activities = item.activityAction.activities;
    }
  }
  resetActiveComposite(compositeId) {
    const defaultCompositeId = this.options.getDefaultCompositeId();
    if (!this.model.activeItem || this.model.activeItem.id !== compositeId) {
      return;
    }
    this.deactivateComposite(compositeId);
    if (defaultCompositeId && defaultCompositeId !== compositeId && this.isPinned(defaultCompositeId)) {
      this.options.openComposite(defaultCompositeId, true);
    } else {
      const visibleComposite = this.visibleComposites.find((cid) => cid !== compositeId);
      if (visibleComposite) {
        this.options.openComposite(visibleComposite);
      }
    }
  }
  isPinned(compositeId) {
    const item = this.model.findItem(compositeId);
    return item?.pinned;
  }
  move(compositeId, toCompositeId, before) {
    if (before !== void 0) {
      const fromIndex = this.model.items.findIndex((c) => c.id === compositeId);
      let toIndex = this.model.items.findIndex((c) => c.id === toCompositeId);
      if (fromIndex >= 0 && toIndex >= 0) {
        if (!before && fromIndex > toIndex) {
          toIndex++;
        }
        if (before && fromIndex < toIndex) {
          toIndex--;
        }
        if (toIndex < this.model.items.length && toIndex >= 0 && toIndex !== fromIndex) {
          if (this.model.move(this.model.items[fromIndex].id, this.model.items[toIndex].id)) {
            setTimeout(() => this.updateCompositeSwitcher(), 0);
          }
        }
      }
    } else {
      if (this.model.move(compositeId, toCompositeId)) {
        setTimeout(() => this.updateCompositeSwitcher(), 0);
      }
    }
  }
  getAction(compositeId) {
    const item = this.model.findItem(compositeId);
    return item?.activityAction;
  }
  computeSizes(items) {
    const size = this.options.compositeSize;
    if (size) {
      items.forEach((composite) => this.compositeSizeInBar.set(composite.id, size));
    } else {
      const compositeSwitcherBar = this.compositeSwitcherBar;
      if (compositeSwitcherBar && this.dimension && this.dimension.height !== 0 && this.dimension.width !== 0) {
        const currentItemsLength = compositeSwitcherBar.viewItems.length;
        compositeSwitcherBar.push(items.map((composite) => composite.activityAction));
        items.map((composite, index) => this.compositeSizeInBar.set(
          composite.id,
          this.options.orientation === ActionsOrientation.VERTICAL ? compositeSwitcherBar.getHeight(currentItemsLength + index) : compositeSwitcherBar.getWidth(currentItemsLength + index)
        ));
        items.forEach(() => compositeSwitcherBar.pull(compositeSwitcherBar.viewItems.length - 1));
      }
    }
  }
  updateCompositeSwitcher(donotTrigger) {
    const compositeSwitcherBar = this.compositeSwitcherBar;
    if (!compositeSwitcherBar || !this.dimension) {
      return;
    }
    let compositesToShow = this.model.visibleItems.filter(
      (item) => item.pinned || this.model.activeItem && this.model.activeItem.id === item.id
      /* Show the active composite even if it is not pinned */
    ).map((item) => item.id);
    let maxVisible = compositesToShow.length;
    const totalComposites = compositesToShow.length;
    let size = 0;
    const limit = this.options.orientation === ActionsOrientation.VERTICAL ? this.dimension.height : this.dimension.width;
    for (let i = 0; i < compositesToShow.length; i++) {
      const compositeSize = this.compositeSizeInBar.get(compositesToShow[i]);
      if (size + compositeSize > limit) {
        maxVisible = i;
        break;
      }
      size += compositeSize;
    }
    if (totalComposites > maxVisible) {
      compositesToShow = compositesToShow.slice(0, maxVisible);
    }
    if (this.model.activeItem && compositesToShow.every((compositeId) => !!this.model.activeItem && compositeId !== this.model.activeItem.id)) {
      size += this.compositeSizeInBar.get(this.model.activeItem.id);
      compositesToShow.push(this.model.activeItem.id);
    }
    while (size > limit && compositesToShow.length) {
      const removedComposite = compositesToShow.length > 1 ? compositesToShow.splice(compositesToShow.length - 2, 1)[0] : compositesToShow.pop();
      size -= this.compositeSizeInBar.get(removedComposite);
    }
    if (totalComposites > compositesToShow.length) {
      size += this.options.overflowActionSize;
    }
    while (size > limit && compositesToShow.length) {
      const removedComposite = compositesToShow.length > 1 && compositesToShow[compositesToShow.length - 1] === this.model.activeItem?.id ? compositesToShow.splice(compositesToShow.length - 2, 1)[0] : compositesToShow.pop();
      size -= this.compositeSizeInBar.get(removedComposite);
    }
    if (totalComposites === compositesToShow.length && this.compositeOverflowAction.value) {
      compositeSwitcherBar.pull(compositeSwitcherBar.length() - 1);
      this.compositeOverflowAction.value = void 0;
      this.compositeOverflowActionViewItem.value = void 0;
    }
    const compositesToRemove = [];
    this.visibleComposites.forEach((compositeId, index) => {
      if (!compositesToShow.includes(compositeId)) {
        compositesToRemove.push(index);
      }
    });
    compositesToRemove.reverse().forEach((index) => {
      compositeSwitcherBar.pull(index);
      this.visibleComposites.splice(index, 1);
    });
    compositesToShow.forEach((compositeId, newIndex) => {
      const currentIndex = this.visibleComposites.indexOf(compositeId);
      if (newIndex !== currentIndex) {
        if (currentIndex !== -1) {
          compositeSwitcherBar.pull(currentIndex);
          this.visibleComposites.splice(currentIndex, 1);
        }
        compositeSwitcherBar.push(this.model.findItem(compositeId).activityAction, { label: true, icon: this.options.icon, index: newIndex });
        this.visibleComposites.splice(newIndex, 0, compositeId);
      }
    });
    if (totalComposites > compositesToShow.length && !this.compositeOverflowAction.value) {
      this.compositeOverflowAction.value = this.instantiationService.createInstance(CompositeOverflowActivityAction, () => {
        this.compositeOverflowActionViewItem.value?.showMenu();
      });
      this.compositeOverflowActionViewItem.value = this.instantiationService.createInstance(
        CompositeOverflowActivityActionViewItem,
        this.compositeOverflowAction.value,
        () => this.getOverflowingComposites(),
        () => this.model.activeItem ? this.model.activeItem.id : void 0,
        (compositeId) => {
          const item = this.model.findItem(compositeId);
          return item?.activity[0]?.badge;
        },
        this.options.getOnCompositeClickAction,
        this.options.colors,
        this.options.activityHoverOptions
      );
      compositeSwitcherBar.push(this.compositeOverflowAction.value, { label: false, icon: true });
    }
    if (!donotTrigger) {
      this._onDidChange.fire();
    }
  }
  getOverflowingComposites() {
    let overflowingIds = this.model.visibleItems.filter((item) => item.pinned).map((item) => item.id);
    if (this.model.activeItem && !this.model.activeItem.pinned) {
      overflowingIds.push(this.model.activeItem.id);
    }
    overflowingIds = overflowingIds.filter((compositeId) => !this.visibleComposites.includes(compositeId));
    return this.model.visibleItems.filter((c) => overflowingIds.includes(c.id)).map((item) => {
      return { id: item.id, name: this.getAction(item.id)?.label || item.name };
    });
  }
  showContextMenu(targetWindow, e) {
    EventHelper.stop(e, true);
    const event = new StandardMouseEvent(targetWindow, e);
    this.contextMenuService.showContextMenu({
      getAnchor: () => event,
      getActions: () => this.getContextMenuActions(e)
    });
  }
  getContextMenuActions(e) {
    const actions = this.model.visibleItems.map(({ id, name, activityAction }) => {
      const isPinned = this.isPinned(id);
      return toAction({
        id,
        label: this.getAction(id).label || name || id,
        checked: isPinned,
        enabled: activityAction.enabled && (!isPinned || this.getPinnedCompositeIds().length > 1),
        run: () => {
          if (this.isPinned(id)) {
            this.unpin(id);
          } else {
            this.pin(id, true);
          }
        }
      });
    });
    this.options.fillExtraContextMenuActions(actions, e);
    return actions;
  }
};
CompositeBar = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IViewDescriptorService)
], CompositeBar);
class CompositeBarModel {
  constructor(items, options) {
    this._items = [];
    this.options = options;
    this.setItems(items);
  }
  get items() {
    return this._items;
  }
  setItems(items) {
    this._items = [];
    this._items = items.map((i) => this.createCompositeBarItem(i.id, i.name, i.order, i.pinned, i.visible));
  }
  get visibleItems() {
    return this.items.filter((item) => item.visible);
  }
  get pinnedItems() {
    return this.items.filter((item) => item.visible && item.pinned);
  }
  createCompositeBarItem(id, name, order, pinned, visible) {
    const options = this.options;
    return {
      id,
      name,
      pinned,
      order,
      visible,
      activity: [],
      get activityAction() {
        return options.getActivityAction(id);
      },
      get pinnedAction() {
        return options.getCompositePinnedAction(id);
      },
      get toggleBadgeAction() {
        return options.getCompositeBadgeAction(id);
      }
    };
  }
  add(id, name, order, requestedIndex) {
    const item = this.findItem(id);
    if (item) {
      let changed = false;
      item.name = name;
      if (!isUndefinedOrNull(order)) {
        changed = item.order !== order;
        item.order = order;
      }
      if (!item.visible) {
        item.visible = true;
        changed = true;
      }
      return changed;
    } else {
      const item2 = this.createCompositeBarItem(id, name, order, true, true);
      if (!isUndefinedOrNull(requestedIndex)) {
        let index = 0;
        let rIndex = requestedIndex;
        while (rIndex > 0 && index < this.items.length) {
          if (this.items[index++].visible) {
            rIndex--;
          }
        }
        this.items.splice(index, 0, item2);
      } else if (isUndefinedOrNull(order)) {
        this.items.push(item2);
      } else {
        let index = 0;
        while (index < this.items.length && typeof this.items[index].order === "number" && this.items[index].order < order) {
          index++;
        }
        this.items.splice(index, 0, item2);
      }
      return true;
    }
  }
  remove(id) {
    for (let index = 0; index < this.items.length; index++) {
      if (this.items[index].id === id) {
        this.items.splice(index, 1);
        return true;
      }
    }
    return false;
  }
  hide(id) {
    for (const item of this.items) {
      if (item.id === id) {
        if (item.visible) {
          item.visible = false;
          return true;
        }
        return false;
      }
    }
    return false;
  }
  move(compositeId, toCompositeId) {
    const fromIndex = this.findIndex(compositeId);
    const toIndex = this.findIndex(toCompositeId);
    if (fromIndex === -1 || toIndex === -1) {
      return false;
    }
    const sourceItem = this.items.splice(fromIndex, 1)[0];
    this.items.splice(toIndex, 0, sourceItem);
    sourceItem.pinned = true;
    return true;
  }
  setPinned(id, pinned) {
    for (const item of this.items) {
      if (item.id === id) {
        if (item.pinned !== pinned) {
          item.pinned = pinned;
          return true;
        }
        return false;
      }
    }
    return false;
  }
  activate(id) {
    if (!this.activeItem || this.activeItem.id !== id) {
      if (this.activeItem) {
        this.deactivate();
      }
      for (const item of this.items) {
        if (item.id === id) {
          this.activeItem = item;
          this.activeItem.activityAction.activate();
          return true;
        }
      }
    }
    return false;
  }
  deactivate() {
    if (this.activeItem) {
      this.activeItem.activityAction.deactivate();
      this.activeItem = void 0;
      return true;
    }
    return false;
  }
  findItem(id) {
    return this.items.filter((item) => item.id === id)[0];
  }
  findIndex(id) {
    for (let index = 0; index < this.items.length; index++) {
      if (this.items[index].id === id) {
        return index;
      }
    }
    return -1;
  }
}
export {
  CompositeBar,
  CompositeDragAndDrop
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxjb21wb3NpdGVCYXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUFjdGl2aXR5IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvYWN0aXZpdHkvY29tbW9uL2FjdGl2aXR5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyLCBBY3Rpb25zT3JpZW50YXRpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBDb21wb3NpdGVBY3Rpb25WaWV3SXRlbSwgQ29tcG9zaXRlT3ZlcmZsb3dBY3Rpdml0eUFjdGlvbiwgQ29tcG9zaXRlT3ZlcmZsb3dBY3Rpdml0eUFjdGlvblZpZXdJdGVtLCBDb21wb3NpdGVCYXJBY3Rpb24sIElDb21wb3NpdGVCYXIsIElDb21wb3NpdGVCYXJDb2xvcnMsIElBY3Rpdml0eUhvdmVyT3B0aW9ucyB9IGZyb20gJy4vY29tcG9zaXRlQmFyQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBEaW1lbnNpb24sICQsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRXZlbnRUeXBlLCBFdmVudEhlbHBlciwgaXNBbmNlc3RvciwgZ2V0V2luZG93IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvd2lkZ2V0LmpzJztcbmltcG9ydCB7IGlzVW5kZWZpbmVkT3JOdWxsIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUNvbG9yVGhlbWUgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBWaWV3Q29udGFpbmVyTG9jYXRpb24sIElWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSVBhbmVDb21wb3NpdGUgfSBmcm9tICcuLi8uLi9jb21tb24vcGFuZWNvbXBvc2l0ZS5qcyc7XG5pbXBvcnQgeyBJQ29tcG9zaXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbXBvc2l0ZS5qcyc7XG5pbXBvcnQgeyBDb21wb3NpdGVEcmFnQW5kRHJvcERhdGEsIENvbXBvc2l0ZURyYWdBbmREcm9wT2JzZXJ2ZXIsIElEcmFnZ2VkQ29tcG9zaXRlRGF0YSwgSUNvbXBvc2l0ZURyYWdBbmREcm9wLCBCZWZvcmUyRCwgdG9nZ2xlRHJvcEVmZmVjdCwgSUNvbXBvc2l0ZURyYWdBbmREcm9wT2JzZXJ2ZXJDYWxsYmFja3MgfSBmcm9tICcuLi9kbmQuanMnO1xuaW1wb3J0IHsgR2VzdHVyZSwgRXZlbnRUeXBlIGFzIFRvdWNoRXZlbnRUeXBlLCBHZXN0dXJlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdG91Y2guanMnO1xuaW1wb3J0IHsgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDb21wb3NpdGVCYXJJdGVtIHtcblxuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXG5cdG5hbWU/OiBzdHJpbmc7XG5cdHBpbm5lZDogYm9vbGVhbjtcblx0b3JkZXI/OiBudW1iZXI7XG5cdHZpc2libGU6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBDb21wb3NpdGVEcmFnQW5kRHJvcCBpbXBsZW1lbnRzIElDb21wb3NpdGVEcmFnQW5kRHJvcCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0cHJpdmF0ZSB0YXJnZXRDb250YWluZXJMb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uLFxuXHRcdHByaXZhdGUgb3JpZW50YXRpb246IEFjdGlvbnNPcmllbnRhdGlvbixcblx0XHRwcml2YXRlIG9wZW5Db21wb3NpdGU6IChpZDogc3RyaW5nLCBmb2N1cz86IGJvb2xlYW4pID0+IFByb21pc2U8SVBhbmVDb21wb3NpdGUgfCBudWxsPixcblx0XHRwcml2YXRlIG1vdmVDb21wb3NpdGU6IChmcm9tOiBzdHJpbmcsIHRvOiBzdHJpbmcsIGJlZm9yZT86IEJlZm9yZTJEKSA9PiB2b2lkLFxuXHRcdHByaXZhdGUgZ2V0SXRlbXM6ICgpID0+IElDb21wb3NpdGVCYXJJdGVtW11cblx0KSB7IH1cblxuXHRkcm9wKGRhdGE6IENvbXBvc2l0ZURyYWdBbmREcm9wRGF0YSwgdGFyZ2V0Q29tcG9zaXRlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50LCBiZWZvcmU/OiBCZWZvcmUyRCk6IHZvaWQge1xuXHRcdGNvbnN0IGRyYWdEYXRhID0gZGF0YS5nZXREYXRhKCk7XG5cblx0XHRpZiAoZHJhZ0RhdGEudHlwZSA9PT0gJ2NvbXBvc2l0ZScpIHtcblx0XHRcdGNvbnN0IGN1cnJlbnRDb250YWluZXIgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlJZChkcmFnRGF0YS5pZCkhO1xuXHRcdFx0Y29uc3QgY3VycmVudExvY2F0aW9uID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckxvY2F0aW9uKGN1cnJlbnRDb250YWluZXIpO1xuXHRcdFx0bGV0IG1vdmVkID0gZmFsc2U7XG5cblx0XHRcdC8vIC4uLiBvbiB0aGUgc2FtZSBjb21wb3NpdGUgYmFyXG5cdFx0XHRpZiAoY3VycmVudExvY2F0aW9uID09PSB0aGlzLnRhcmdldENvbnRhaW5lckxvY2F0aW9uKSB7XG5cdFx0XHRcdGlmICh0YXJnZXRDb21wb3NpdGVJZCkge1xuXHRcdFx0XHRcdHRoaXMubW92ZUNvbXBvc2l0ZShkcmFnRGF0YS5pZCwgdGFyZ2V0Q29tcG9zaXRlSWQsIGJlZm9yZSk7XG5cdFx0XHRcdFx0bW92ZWQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHQvLyAuLi4gb24gYSBkaWZmZXJlbnQgY29tcG9zaXRlIGJhclxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLm1vdmVWaWV3Q29udGFpbmVyVG9Mb2NhdGlvbihjdXJyZW50Q29udGFpbmVyLCB0aGlzLnRhcmdldENvbnRhaW5lckxvY2F0aW9uLCB0aGlzLmdldFRhcmdldEluZGV4KHRhcmdldENvbXBvc2l0ZUlkLCBiZWZvcmUpLCAnZG5kJyk7XG5cdFx0XHRcdG1vdmVkID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG1vdmVkKSB7XG5cdFx0XHRcdHRoaXMub3BlbkNvbXBvc2l0ZShjdXJyZW50Q29udGFpbmVyLmlkLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZHJhZ0RhdGEudHlwZSA9PT0gJ3ZpZXcnKSB7XG5cdFx0XHRjb25zdCB2aWV3VG9Nb3ZlID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0Rlc2NyaXB0b3JCeUlkKGRyYWdEYXRhLmlkKSE7XG5cdFx0XHRpZiAodmlld1RvTW92ZS5jYW5Nb3ZlVmlldykge1xuXHRcdFx0XHR0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5tb3ZlVmlld1RvTG9jYXRpb24odmlld1RvTW92ZSwgdGhpcy50YXJnZXRDb250YWluZXJMb2NhdGlvbiwgJ2RuZCcpO1xuXG5cdFx0XHRcdGNvbnN0IG5ld0NvbnRhaW5lciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeVZpZXdJZCh2aWV3VG9Nb3ZlLmlkKSE7XG5cblx0XHRcdFx0aWYgKHRhcmdldENvbXBvc2l0ZUlkKSB7XG5cdFx0XHRcdFx0dGhpcy5tb3ZlQ29tcG9zaXRlKG5ld0NvbnRhaW5lci5pZCwgdGFyZ2V0Q29tcG9zaXRlSWQsIGJlZm9yZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLm9wZW5Db21wb3NpdGUobmV3Q29udGFpbmVyLmlkLCB0cnVlKS50aGVuKGNvbXBvc2l0ZSA9PiB7XG5cdFx0XHRcdFx0Y29tcG9zaXRlPy5vcGVuVmlldyh2aWV3VG9Nb3ZlLmlkLCB0cnVlKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0b25EcmFnRW50ZXIoZGF0YTogQ29tcG9zaXRlRHJhZ0FuZERyb3BEYXRhLCB0YXJnZXRDb21wb3NpdGVJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jYW5Ecm9wKGRhdGEsIHRhcmdldENvbXBvc2l0ZUlkKTtcblx0fVxuXG5cdG9uRHJhZ092ZXIoZGF0YTogQ29tcG9zaXRlRHJhZ0FuZERyb3BEYXRhLCB0YXJnZXRDb21wb3NpdGVJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jYW5Ecm9wKGRhdGEsIHRhcmdldENvbXBvc2l0ZUlkKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VGFyZ2V0SW5kZXgodGFyZ2V0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgYmVmb3JlMmQ6IEJlZm9yZTJEIHwgdW5kZWZpbmVkKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRhcmdldElkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5nZXRJdGVtcygpO1xuXHRcdGNvbnN0IGJlZm9yZSA9IHRoaXMub3JpZW50YXRpb24gPT09IEFjdGlvbnNPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gYmVmb3JlMmQ/Lmhvcml6b250YWxseUJlZm9yZSA6IGJlZm9yZTJkPy52ZXJ0aWNhbGx5QmVmb3JlO1xuXHRcdHJldHVybiBpdGVtcy5maWx0ZXIoaXRlbSA9PiBpdGVtLnZpc2libGUpLmZpbmRJbmRleChpdGVtID0+IGl0ZW0uaWQgPT09IHRhcmdldElkKSArIChiZWZvcmUgPyAwIDogMSk7XG5cdH1cblxuXHRwcml2YXRlIGNhbkRyb3AoZGF0YTogQ29tcG9zaXRlRHJhZ0FuZERyb3BEYXRhLCB0YXJnZXRDb21wb3NpdGVJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZHJhZ0RhdGEgPSBkYXRhLmdldERhdGEoKTtcblxuXHRcdGlmIChkcmFnRGF0YS50eXBlID09PSAnY29tcG9zaXRlJykge1xuXG5cdFx0XHQvLyBEcmFnZ2luZyBhIGNvbXBvc2l0ZVxuXHRcdFx0Y29uc3QgY3VycmVudENvbnRhaW5lciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeUlkKGRyYWdEYXRhLmlkKSE7XG5cdFx0XHRjb25zdCBjdXJyZW50TG9jYXRpb24gPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24oY3VycmVudENvbnRhaW5lcik7XG5cblx0XHRcdC8vIC4uLiB0byB0aGUgc2FtZSBjb21wb3NpdGUgbG9jYXRpb25cblx0XHRcdGlmIChjdXJyZW50TG9jYXRpb24gPT09IHRoaXMudGFyZ2V0Q29udGFpbmVyTG9jYXRpb24pIHtcblx0XHRcdFx0cmV0dXJuIGRyYWdEYXRhLmlkICE9PSB0YXJnZXRDb21wb3NpdGVJZDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBlbHNlIHtcblxuXHRcdFx0Ly8gRHJhZ2dpbmcgYW4gaW5kaXZpZHVhbCB2aWV3XG5cdFx0XHRjb25zdCB2aWV3RGVzY3JpcHRvciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdEZXNjcmlwdG9yQnlJZChkcmFnRGF0YS5pZCk7XG5cblx0XHRcdC8vIC4uLiB0aGF0IGNhbm5vdCBtb3ZlXG5cdFx0XHRpZiAoIXZpZXdEZXNjcmlwdG9yPy5jYW5Nb3ZlVmlldykge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIC4uLiB0byBjcmVhdGUgYSB2aWV3IGNvbnRhaW5lclxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbXBvc2l0ZUJhck9wdGlvbnMge1xuXG5cdHJlYWRvbmx5IGljb246IGJvb2xlYW47XG5cdHJlYWRvbmx5IG9yaWVudGF0aW9uOiBBY3Rpb25zT3JpZW50YXRpb247XG5cdHJlYWRvbmx5IGNvbG9yczogKHRoZW1lOiBJQ29sb3JUaGVtZSkgPT4gSUNvbXBvc2l0ZUJhckNvbG9ycztcblx0cmVhZG9ubHkgY29tcGFjdD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGNvbXBvc2l0ZVNpemU6IG51bWJlcjtcblx0cmVhZG9ubHkgb3ZlcmZsb3dBY3Rpb25TaXplOiBudW1iZXI7XG5cdHJlYWRvbmx5IGRuZEhhbmRsZXI6IElDb21wb3NpdGVEcmFnQW5kRHJvcDtcblx0cmVhZG9ubHkgYWN0aXZpdHlIb3Zlck9wdGlvbnM6IElBY3Rpdml0eUhvdmVyT3B0aW9ucztcblx0cmVhZG9ubHkgcHJldmVudExvb3BOYXZpZ2F0aW9uPzogYm9vbGVhbjtcblxuXHRyZWFkb25seSBnZXRBY3Rpdml0eUFjdGlvbjogKGNvbXBvc2l0ZUlkOiBzdHJpbmcpID0+IENvbXBvc2l0ZUJhckFjdGlvbjtcblx0cmVhZG9ubHkgZ2V0Q29tcG9zaXRlUGlubmVkQWN0aW9uOiAoY29tcG9zaXRlSWQ6IHN0cmluZykgPT4gSUFjdGlvbjtcblx0cmVhZG9ubHkgZ2V0Q29tcG9zaXRlQmFkZ2VBY3Rpb246IChjb21wb3NpdGVJZDogc3RyaW5nKSA9PiBJQWN0aW9uO1xuXHRyZWFkb25seSBnZXRPbkNvbXBvc2l0ZUNsaWNrQWN0aW9uOiAoY29tcG9zaXRlSWQ6IHN0cmluZykgPT4gSUFjdGlvbjtcblx0cmVhZG9ubHkgZmlsbEV4dHJhQ29udGV4dE1lbnVBY3Rpb25zOiAoYWN0aW9uczogSUFjdGlvbltdLCBlPzogTW91c2VFdmVudCB8IEdlc3R1cmVFdmVudCkgPT4gdm9pZDtcblx0cmVhZG9ubHkgZ2V0Q29udGV4dE1lbnVBY3Rpb25zRm9yQ29tcG9zaXRlOiAoY29tcG9zaXRlSWQ6IHN0cmluZykgPT4gSUFjdGlvbltdO1xuXG5cdHJlYWRvbmx5IG9wZW5Db21wb3NpdGU6IChjb21wb3NpdGVJZDogc3RyaW5nLCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbikgPT4gUHJvbWlzZTxJQ29tcG9zaXRlIHwgbnVsbD47XG5cdHJlYWRvbmx5IGdldERlZmF1bHRDb21wb3NpdGVJZDogKCkgPT4gc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5jbGFzcyBDb21wb3NpdGVCYXJEbmRDYWxsYmFja3MgaW1wbGVtZW50cyBJQ29tcG9zaXRlRHJhZ0FuZERyb3BPYnNlcnZlckNhbGxiYWNrcyB7XG5cblx0cHJpdmF0ZSBpbnNlcnREcm9wQmVmb3JlOiBCZWZvcmUyRCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbXBvc2l0ZUJhckNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBhY3Rpb25CYXJDb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29tcG9zaXRlQmFyTW9kZWw6IENvbXBvc2l0ZUJhck1vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZG5kSGFuZGxlcjogSUNvbXBvc2l0ZURyYWdBbmREcm9wLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3JpZW50YXRpb246IEFjdGlvbnNPcmllbnRhdGlvbixcblx0KSB7IH1cblxuXHRvbkRyYWdPdmVyKGU6IElEcmFnZ2VkQ29tcG9zaXRlRGF0YSkge1xuXG5cdFx0Ly8gZG9uJ3QgYWRkIGZlZWRiYWNrIGlmIHRoaXMgaXMgb3ZlciB0aGUgY29tcG9zaXRlIGJhciBhY3Rpb25zIG9yIHRoZXJlIGFyZSBubyBhY3Rpb25zXG5cdFx0Y29uc3QgdmlzaWJsZUl0ZW1zID0gdGhpcy5jb21wb3NpdGVCYXJNb2RlbC52aXNpYmxlSXRlbXM7XG5cdFx0aWYgKCF2aXNpYmxlSXRlbXMubGVuZ3RoIHx8IChlLmV2ZW50RGF0YS50YXJnZXQgJiYgaXNBbmNlc3RvcihlLmV2ZW50RGF0YS50YXJnZXQgYXMgSFRNTEVsZW1lbnQsIHRoaXMuYWN0aW9uQmFyQ29udGFpbmVyKSkpIHtcblx0XHRcdHRoaXMuaW5zZXJ0RHJvcEJlZm9yZSA9IHRoaXMudXBkYXRlRnJvbURyYWdnaW5nKHRoaXMuY29tcG9zaXRlQmFyQ29udGFpbmVyLCBmYWxzZSwgZmFsc2UsIHRydWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluc2VydEF0RnJvbnQgPSB0aGlzLmluc2VydEF0RnJvbnQodGhpcy5hY3Rpb25CYXJDb250YWluZXIsIGUuZXZlbnREYXRhKTtcblx0XHRjb25zdCB0YXJnZXQgPSBpbnNlcnRBdEZyb250ID8gdmlzaWJsZUl0ZW1zWzBdIDogdmlzaWJsZUl0ZW1zW3Zpc2libGVJdGVtcy5sZW5ndGggLSAxXTtcblx0XHRjb25zdCB2YWxpZERyb3BUYXJnZXQgPSB0aGlzLmRuZEhhbmRsZXIub25EcmFnT3ZlcihlLmRyYWdBbmREcm9wRGF0YSwgdGFyZ2V0LmlkLCBlLmV2ZW50RGF0YSk7XG5cdFx0dG9nZ2xlRHJvcEVmZmVjdChlLmV2ZW50RGF0YS5kYXRhVHJhbnNmZXIsICdtb3ZlJywgdmFsaWREcm9wVGFyZ2V0KTtcblx0XHR0aGlzLmluc2VydERyb3BCZWZvcmUgPSB0aGlzLnVwZGF0ZUZyb21EcmFnZ2luZyh0aGlzLmNvbXBvc2l0ZUJhckNvbnRhaW5lciwgdmFsaWREcm9wVGFyZ2V0LCBpbnNlcnRBdEZyb250LCB0cnVlKTtcblx0fVxuXG5cdG9uRHJhZ0xlYXZlKGU6IElEcmFnZ2VkQ29tcG9zaXRlRGF0YSkge1xuXHRcdHRoaXMuaW5zZXJ0RHJvcEJlZm9yZSA9IHRoaXMudXBkYXRlRnJvbURyYWdnaW5nKHRoaXMuY29tcG9zaXRlQmFyQ29udGFpbmVyLCBmYWxzZSwgZmFsc2UsIGZhbHNlKTtcblx0fVxuXG5cdG9uRHJhZ0VuZChlOiBJRHJhZ2dlZENvbXBvc2l0ZURhdGEpIHtcblx0XHR0aGlzLmluc2VydERyb3BCZWZvcmUgPSB0aGlzLnVwZGF0ZUZyb21EcmFnZ2luZyh0aGlzLmNvbXBvc2l0ZUJhckNvbnRhaW5lciwgZmFsc2UsIGZhbHNlLCBmYWxzZSk7XG5cdH1cblxuXHRvbkRyb3AoZTogSURyYWdnZWRDb21wb3NpdGVEYXRhKSB7XG5cdFx0Y29uc3QgdmlzaWJsZUl0ZW1zID0gdGhpcy5jb21wb3NpdGVCYXJNb2RlbC52aXNpYmxlSXRlbXM7XG5cdFx0bGV0IHRhcmdldElkID0gdW5kZWZpbmVkO1xuXHRcdGlmICh2aXNpYmxlSXRlbXMubGVuZ3RoKSB7XG5cdFx0XHR0YXJnZXRJZCA9IHRoaXMuaW5zZXJ0QXRGcm9udCh0aGlzLmFjdGlvbkJhckNvbnRhaW5lciwgZS5ldmVudERhdGEpID8gdmlzaWJsZUl0ZW1zWzBdLmlkIDogdmlzaWJsZUl0ZW1zW3Zpc2libGVJdGVtcy5sZW5ndGggLSAxXS5pZDtcblx0XHR9XG5cdFx0dGhpcy5kbmRIYW5kbGVyLmRyb3AoZS5kcmFnQW5kRHJvcERhdGEsIHRhcmdldElkLCBlLmV2ZW50RGF0YSwgdGhpcy5pbnNlcnREcm9wQmVmb3JlKTtcblx0XHR0aGlzLmluc2VydERyb3BCZWZvcmUgPSB0aGlzLnVwZGF0ZUZyb21EcmFnZ2luZyh0aGlzLmNvbXBvc2l0ZUJhckNvbnRhaW5lciwgZmFsc2UsIGZhbHNlLCBmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIGluc2VydEF0RnJvbnQoZWxlbWVudDogSFRNTEVsZW1lbnQsIGV2ZW50OiBEcmFnRXZlbnQpOiBib29sZWFuIHtcblx0XHRjb25zdCByZWN0ID0gZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRjb25zdCBwb3NYID0gZXZlbnQuY2xpZW50WDtcblx0XHRjb25zdCBwb3NZID0gZXZlbnQuY2xpZW50WTtcblxuXHRcdHN3aXRjaCAodGhpcy5vcmllbnRhdGlvbikge1xuXHRcdFx0Y2FzZSBBY3Rpb25zT3JpZW50YXRpb24uSE9SSVpPTlRBTDpcblx0XHRcdFx0cmV0dXJuIHBvc1ggPCByZWN0LmxlZnQ7XG5cdFx0XHRjYXNlIEFjdGlvbnNPcmllbnRhdGlvbi5WRVJUSUNBTDpcblx0XHRcdFx0cmV0dXJuIHBvc1kgPCByZWN0LnRvcDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUZyb21EcmFnZ2luZyhlbGVtZW50OiBIVE1MRWxlbWVudCwgc2hvd0ZlZWRiYWNrOiBib29sZWFuLCBmcm9udDogYm9vbGVhbiwgaXNEcmFnZ2luZzogYm9vbGVhbik6IEJlZm9yZTJEIHwgdW5kZWZpbmVkIHtcblx0XHRlbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2RyYWdnZWQtb3ZlcicsIGlzRHJhZ2dpbmcpO1xuXHRcdGVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnZHJhZ2dlZC1vdmVyLWhlYWQnLCBzaG93RmVlZGJhY2sgJiYgZnJvbnQpO1xuXHRcdGVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnZHJhZ2dlZC1vdmVyLXRhaWwnLCBzaG93RmVlZGJhY2sgJiYgIWZyb250KTtcblxuXHRcdGlmICghc2hvd0ZlZWRiYWNrKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IHZlcnRpY2FsbHlCZWZvcmU6IGZyb250LCBob3Jpem9udGFsbHlCZWZvcmU6IGZyb250IH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbXBvc2l0ZUJhciBleHRlbmRzIFdpZGdldCBpbXBsZW1lbnRzIElDb21wb3NpdGVCYXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSBkaW1lbnNpb246IERpbWVuc2lvbiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGNvbXBvc2l0ZVN3aXRjaGVyQmFyOiBBY3Rpb25CYXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY29tcG9zaXRlT3ZlcmZsb3dBY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q29tcG9zaXRlT3ZlcmZsb3dBY3Rpdml0eUFjdGlvbj4oKSk7XG5cdHByaXZhdGUgY29tcG9zaXRlT3ZlcmZsb3dBY3Rpb25WaWV3SXRlbSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxDb21wb3NpdGVPdmVyZmxvd0FjdGl2aXR5QWN0aW9uVmlld0l0ZW0+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbW9kZWw6IENvbXBvc2l0ZUJhck1vZGVsO1xuXHRwcml2YXRlIHJlYWRvbmx5IHZpc2libGVDb21wb3NpdGVzOiBzdHJpbmdbXTtcblx0cHJpdmF0ZSByZWFkb25seSBjb21wb3NpdGVTaXplSW5CYXI6IE1hcDxzdHJpbmcsIG51bWJlcj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aXRlbXM6IElDb21wb3NpdGVCYXJJdGVtW10sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiBJQ29tcG9zaXRlQmFyT3B0aW9ucyxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMubW9kZWwgPSBuZXcgQ29tcG9zaXRlQmFyTW9kZWwoaXRlbXMsIG9wdGlvbnMpO1xuXHRcdHRoaXMudmlzaWJsZUNvbXBvc2l0ZXMgPSBbXTtcblx0XHR0aGlzLmNvbXBvc2l0ZVNpemVJbkJhciA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0dGhpcy5jb21wdXRlU2l6ZXModGhpcy5tb2RlbC52aXNpYmxlSXRlbXMpO1xuXHR9XG5cblx0Z2V0Q29tcG9zaXRlQmFySXRlbXMoKTogSUNvbXBvc2l0ZUJhckl0ZW1bXSB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLm1vZGVsLml0ZW1zXTtcblx0fVxuXG5cdHNldENvbXBvc2l0ZUJhckl0ZW1zKGl0ZW1zOiBJQ29tcG9zaXRlQmFySXRlbVtdKTogdm9pZCB7XG5cdFx0dGhpcy5tb2RlbC5zZXRJdGVtcyhpdGVtcyk7XG5cdFx0dGhpcy51cGRhdGVDb21wb3NpdGVTd2l0Y2hlcih0cnVlKTtcblx0fVxuXG5cdGdldFBpbm5lZENvbXBvc2l0ZXMoKTogSUNvbXBvc2l0ZUJhckl0ZW1bXSB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwucGlubmVkSXRlbXM7XG5cdH1cblxuXHRnZXRQaW5uZWRDb21wb3NpdGVJZHMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLmdldFBpbm5lZENvbXBvc2l0ZXMoKS5tYXAoYyA9PiBjLmlkKTtcblx0fVxuXG5cdGdldFZpc2libGVDb21wb3NpdGVzKCk6IElDb21wb3NpdGVCYXJJdGVtW10ge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLnZpc2libGVJdGVtcztcblx0fVxuXG5cdGNyZWF0ZShwYXJlbnQ6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IGFjdGlvbkJhckRpdiA9IHBhcmVudC5hcHBlbmRDaGlsZCgkKCcuY29tcG9zaXRlLWJhcicpKTtcblx0XHR0aGlzLmNvbXBvc2l0ZVN3aXRjaGVyQmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbkJhcihhY3Rpb25CYXJEaXYsIHtcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIENvbXBvc2l0ZU92ZXJmbG93QWN0aXZpdHlBY3Rpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5jb21wb3NpdGVPdmVyZmxvd0FjdGlvblZpZXdJdGVtLnZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLm1vZGVsLmZpbmRJdGVtKGFjdGlvbi5pZCk7XG5cdFx0XHRcdHJldHVybiBpdGVtICYmIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdFx0Q29tcG9zaXRlQWN0aW9uVmlld0l0ZW0sXG5cdFx0XHRcdFx0eyAuLi5vcHRpb25zLCBkcmFnZ2FibGU6IHRydWUsIGNvbG9yczogdGhpcy5vcHRpb25zLmNvbG9ycywgaWNvbjogdGhpcy5vcHRpb25zLmljb24sIGhvdmVyT3B0aW9uczogdGhpcy5vcHRpb25zLmFjdGl2aXR5SG92ZXJPcHRpb25zLCBjb21wYWN0OiB0aGlzLm9wdGlvbnMuY29tcGFjdCB9LFxuXHRcdFx0XHRcdGFjdGlvbiBhcyBDb21wb3NpdGVCYXJBY3Rpb24sXG5cdFx0XHRcdFx0aXRlbS5waW5uZWRBY3Rpb24sXG5cdFx0XHRcdFx0aXRlbS50b2dnbGVCYWRnZUFjdGlvbixcblx0XHRcdFx0XHRjb21wb3NpdGVJZCA9PiB0aGlzLm9wdGlvbnMuZ2V0Q29udGV4dE1lbnVBY3Rpb25zRm9yQ29tcG9zaXRlKGNvbXBvc2l0ZUlkKSxcblx0XHRcdFx0XHQoKSA9PiB0aGlzLmdldENvbnRleHRNZW51QWN0aW9ucygpLFxuXHRcdFx0XHRcdHRoaXMub3B0aW9ucy5kbmRIYW5kbGVyLFxuXHRcdFx0XHRcdHRoaXNcblx0XHRcdFx0KTtcblx0XHRcdH0sXG5cdFx0XHRvcmllbnRhdGlvbjogdGhpcy5vcHRpb25zLm9yaWVudGF0aW9uLFxuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnYWN0aXZpdHlCYXJBcmlhTGFiZWwnLCBcIkFjdGl2ZSBWaWV3IFN3aXRjaGVyXCIpLFxuXHRcdFx0YXJpYVJvbGU6ICd0YWJsaXN0Jyxcblx0XHRcdHByZXZlbnRMb29wTmF2aWdhdGlvbjogdGhpcy5vcHRpb25zLnByZXZlbnRMb29wTmF2aWdhdGlvbixcblx0XHRcdHRyaWdnZXJLZXlzOiB7IGtleURvd246IHRydWUgfVxuXHRcdH0pKTtcblxuXHRcdC8vIENvbnRleHRtZW51IGZvciBjb21wb3NpdGVzXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHBhcmVudCwgRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgZSA9PiB0aGlzLnNob3dDb250ZXh0TWVudShnZXRXaW5kb3cocGFyZW50KSwgZSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihHZXN0dXJlLmFkZFRhcmdldChwYXJlbnQpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIocGFyZW50LCBUb3VjaEV2ZW50VHlwZS5Db250ZXh0bWVudSwgZSA9PiB0aGlzLnNob3dDb250ZXh0TWVudShnZXRXaW5kb3cocGFyZW50KSwgZSkpKTtcblxuXHRcdC8vIFJlZ2lzdGVyIGEgZHJvcCB0YXJnZXQgb24gdGhlIHdob2xlIGJhciB0byBwcmV2ZW50IGZvcmJpZGRlbiBmZWVkYmFja1xuXHRcdGNvbnN0IGRuZENhbGxiYWNrID0gbmV3IENvbXBvc2l0ZUJhckRuZENhbGxiYWNrcyhwYXJlbnQsIGFjdGlvbkJhckRpdiwgdGhpcy5tb2RlbCwgdGhpcy5vcHRpb25zLmRuZEhhbmRsZXIsIHRoaXMub3B0aW9ucy5vcmllbnRhdGlvbik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoQ29tcG9zaXRlRHJhZ0FuZERyb3BPYnNlcnZlci5JTlNUQU5DRS5yZWdpc3RlclRhcmdldChwYXJlbnQsIGRuZENhbGxiYWNrKSk7XG5cblx0XHRyZXR1cm4gYWN0aW9uQmFyRGl2O1xuXHR9XG5cblx0Zm9jdXMoaW5kZXg/OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmNvbXBvc2l0ZVN3aXRjaGVyQmFyPy5mb2N1cyhpbmRleCk7XG5cdH1cblxuXHRyZWNvbXB1dGVTaXplcygpOiB2b2lkIHtcblx0XHR0aGlzLmNvbXB1dGVTaXplcyh0aGlzLm1vZGVsLnZpc2libGVJdGVtcyk7XG5cdFx0dGhpcy51cGRhdGVDb21wb3NpdGVTd2l0Y2hlcigpO1xuXHR9XG5cblx0bGF5b3V0KGRpbWVuc2lvbjogRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5kaW1lbnNpb24gPSBkaW1lbnNpb247XG5cblx0XHRpZiAoZGltZW5zaW9uLmhlaWdodCA9PT0gMCB8fCBkaW1lbnNpb24ud2lkdGggPT09IDApIHtcblx0XHRcdC8vIERvIG5vdCBsYXlvdXQgaWYgbm90IHZpc2libGUuIE90aGVyd2lzZSB0aGUgc2l6ZSBtZWFzdXJtZW50IHdvdWxkIGJlIGNvbXB1dGVkIHdyb25nbHlcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jb21wb3NpdGVTaXplSW5CYXIuc2l6ZSA9PT0gMCkge1xuXHRcdFx0Ly8gQ29tcHV0ZSBzaXplIG9mIGVhY2ggY29tcG9zaXRlIGJ5IGdldHRpbmcgdGhlIHNpemUgZnJvbSB0aGUgY3NzIHJlbmRlcmVyXG5cdFx0XHQvLyBTaXplIGlzIGxhdGVyIHVzZWQgZm9yIG92ZXJmbG93IGNvbXB1dGF0aW9uXG5cdFx0XHR0aGlzLmNvbXB1dGVTaXplcyh0aGlzLm1vZGVsLnZpc2libGVJdGVtcyk7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVDb21wb3NpdGVTd2l0Y2hlcigpO1xuXHR9XG5cblx0YWRkQ29tcG9zaXRlKHsgaWQsIG5hbWUsIG9yZGVyLCByZXF1ZXN0ZWRJbmRleCB9OiB7IGlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZzsgb3JkZXI/OiBudW1iZXI7IHJlcXVlc3RlZEluZGV4PzogbnVtYmVyIH0pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5tb2RlbC5hZGQoaWQsIG5hbWUsIG9yZGVyLCByZXF1ZXN0ZWRJbmRleCkpIHtcblx0XHRcdHRoaXMuY29tcHV0ZVNpemVzKFt0aGlzLm1vZGVsLmZpbmRJdGVtKGlkKV0pO1xuXHRcdFx0dGhpcy51cGRhdGVDb21wb3NpdGVTd2l0Y2hlcigpO1xuXHRcdH1cblx0fVxuXG5cdHJlbW92ZUNvbXBvc2l0ZShpZDogc3RyaW5nKTogdm9pZCB7XG5cblx0XHQvLyBJZiBpdCBwaW5uZWQsIHVucGluIGl0IGZpcnN0XG5cdFx0aWYgKHRoaXMuaXNQaW5uZWQoaWQpKSB7XG5cdFx0XHR0aGlzLnVucGluKGlkKTtcblx0XHR9XG5cblx0XHQvLyBSZW1vdmUgZnJvbSB0aGUgbW9kZWxcblx0XHRpZiAodGhpcy5tb2RlbC5yZW1vdmUoaWQpKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZUNvbXBvc2l0ZVN3aXRjaGVyKCk7XG5cdFx0fVxuXHR9XG5cblx0aGlkZUNvbXBvc2l0ZShpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubW9kZWwuaGlkZShpZCkpIHtcblx0XHRcdHRoaXMucmVzZXRBY3RpdmVDb21wb3NpdGUoaWQpO1xuXHRcdFx0dGhpcy51cGRhdGVDb21wb3NpdGVTd2l0Y2hlcigpO1xuXHRcdH1cblx0fVxuXG5cdGFjdGl2YXRlQ29tcG9zaXRlKGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBwcmV2aW91c0FjdGl2ZUl0ZW0gPSB0aGlzLm1vZGVsLmFjdGl2ZUl0ZW07XG5cdFx0aWYgKHRoaXMubW9kZWwuYWN0aXZhdGUoaWQpKSB7XG5cdFx0XHQvLyBVcGRhdGUgaWYgY3VycmVudCBjb21wb3NpdGUgaXMgbmVpdGhlciB2aXNpYmxlIG5vciBwaW5uZWRcblx0XHRcdC8vIG9yIHByZXZpb3VzIGFjdGl2ZSBjb21wb3NpdGUgaXMgbm90IHBpbm5lZFxuXHRcdFx0aWYgKHRoaXMudmlzaWJsZUNvbXBvc2l0ZXMuaW5kZXhPZihpZCkgPT09IC0gMSB8fCAoISF0aGlzLm1vZGVsLmFjdGl2ZUl0ZW0gJiYgIXRoaXMubW9kZWwuYWN0aXZlSXRlbS5waW5uZWQpIHx8IChwcmV2aW91c0FjdGl2ZUl0ZW0gJiYgIXByZXZpb3VzQWN0aXZlSXRlbS5waW5uZWQpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlQ29tcG9zaXRlU3dpdGNoZXIoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRkZWFjdGl2YXRlQ29tcG9zaXRlKGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBwcmV2aW91c0FjdGl2ZUl0ZW0gPSB0aGlzLm1vZGVsLmFjdGl2ZUl0ZW07XG5cdFx0aWYgKHRoaXMubW9kZWwuZGVhY3RpdmF0ZSgpKSB7XG5cdFx0XHRpZiAocHJldmlvdXNBY3RpdmVJdGVtICYmICFwcmV2aW91c0FjdGl2ZUl0ZW0ucGlubmVkKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlQ29tcG9zaXRlU3dpdGNoZXIoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyBwaW4oY29tcG9zaXRlSWQ6IHN0cmluZywgb3Blbj86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5tb2RlbC5zZXRQaW5uZWQoY29tcG9zaXRlSWQsIHRydWUpKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZUNvbXBvc2l0ZVN3aXRjaGVyKCk7XG5cblx0XHRcdGlmIChvcGVuKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMub3B0aW9ucy5vcGVuQ29tcG9zaXRlKGNvbXBvc2l0ZUlkKTtcblx0XHRcdFx0dGhpcy5hY3RpdmF0ZUNvbXBvc2l0ZShjb21wb3NpdGVJZCk7IC8vIEFjdGl2YXRlIGFmdGVyIG9wZW5pbmdcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHR1bnBpbihjb21wb3NpdGVJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubW9kZWwuc2V0UGlubmVkKGNvbXBvc2l0ZUlkLCBmYWxzZSkpIHtcblxuXHRcdFx0dGhpcy51cGRhdGVDb21wb3NpdGVTd2l0Y2hlcigpO1xuXG5cdFx0XHR0aGlzLnJlc2V0QWN0aXZlQ29tcG9zaXRlKGNvbXBvc2l0ZUlkKTtcblx0XHR9XG5cdH1cblxuXHRhcmVCYWRnZXNFbmFibGVkKGNvbXBvc2l0ZUlkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJhZGdlRW5hYmxlbWVudFN0YXRlKGNvbXBvc2l0ZUlkKTtcblx0fVxuXG5cdHRvZ2dsZUJhZGdlRW5hYmxlbWVudChjb21wb3NpdGVJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2Uuc2V0Vmlld0NvbnRhaW5lckJhZGdlRW5hYmxlbWVudFN0YXRlKGNvbXBvc2l0ZUlkLCAhdGhpcy5hcmVCYWRnZXNFbmFibGVkKGNvbXBvc2l0ZUlkKSk7XG5cdFx0dGhpcy51cGRhdGVDb21wb3NpdGVTd2l0Y2hlcigpO1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLm1vZGVsLmZpbmRJdGVtKGNvbXBvc2l0ZUlkKTtcblx0XHRpZiAoaXRlbSkge1xuXHRcdFx0Ly8gVE9ETyBAbHJhbW9zMTUgaG93IGRvIHdlIHRlbGwgdGhlIGFjdGl2aXR5IHRvIHJlLXJlbmRlciB0aGUgYmFkZ2U/IFRoaXMgdHJpZ2dlcnMgYW4gb25EaWRDaGFuZ2UgYnV0IGlzbid0IHRoZSByaWdodCB3YXkgdG8gZG8gaXQuXG5cdFx0XHQvLyBJIGNvdWxkIGFkZCBhbm90aGVyIHNwZWNpZmljIGZ1bmN0aW9uIGxpa2UgYGFjdGl2aXR5LnVwZGF0ZUJhZGdlRW5hYmxlbWVudGAgd291bGQgdGhlbiB0aGUgYWN0aXZpdHkgc3RvcmUgdGhlIHNhdGU/XG5cdFx0XHRpdGVtLmFjdGl2aXR5QWN0aW9uLmFjdGl2aXRpZXMgPSBpdGVtLmFjdGl2aXR5QWN0aW9uLmFjdGl2aXRpZXM7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZXNldEFjdGl2ZUNvbXBvc2l0ZShjb21wb3NpdGVJZDogc3RyaW5nKSB7XG5cdFx0Y29uc3QgZGVmYXVsdENvbXBvc2l0ZUlkID0gdGhpcy5vcHRpb25zLmdldERlZmF1bHRDb21wb3NpdGVJZCgpO1xuXG5cdFx0Ly8gQ2FzZTogY29tcG9zaXRlIGlzIG5vdCB0aGUgYWN0aXZlIG9uZSBvciB0aGUgYWN0aXZlIG9uZSBpcyBhIGRpZmZlcmVudCBvbmVcblx0XHQvLyBTb2x2OiB3ZSBkbyBub3RoaW5nXG5cdFx0aWYgKCF0aGlzLm1vZGVsLmFjdGl2ZUl0ZW0gfHwgdGhpcy5tb2RlbC5hY3RpdmVJdGVtLmlkICE9PSBjb21wb3NpdGVJZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIERlYWN0aXZhdGUgaXRzZWxmXG5cdFx0dGhpcy5kZWFjdGl2YXRlQ29tcG9zaXRlKGNvbXBvc2l0ZUlkKTtcblxuXHRcdC8vIENhc2U6IGNvbXBvc2l0ZSBpcyBub3QgdGhlIGRlZmF1bHQgY29tcG9zaXRlIGFuZCBkZWZhdWx0IGNvbXBvc2l0ZSBpcyBzdGlsbCBzaG93aW5nXG5cdFx0Ly8gU29sdjogd2Ugb3BlbiB0aGUgZGVmYXVsdCBjb21wb3NpdGVcblx0XHRpZiAoZGVmYXVsdENvbXBvc2l0ZUlkICYmIGRlZmF1bHRDb21wb3NpdGVJZCAhPT0gY29tcG9zaXRlSWQgJiYgdGhpcy5pc1Bpbm5lZChkZWZhdWx0Q29tcG9zaXRlSWQpKSB7XG5cdFx0XHR0aGlzLm9wdGlvbnMub3BlbkNvbXBvc2l0ZShkZWZhdWx0Q29tcG9zaXRlSWQsIHRydWUpO1xuXHRcdH1cblxuXHRcdC8vIENhc2U6IHdlIGNsb3NlZCB0aGUgZGVmYXVsdCBjb21wb3NpdGVcblx0XHQvLyBTb2x2OiB3ZSBvcGVuIHRoZSBuZXh0IHZpc2libGUgY29tcG9zaXRlIGZyb20gdG9wXG5cdFx0ZWxzZSB7XG5cdFx0XHRjb25zdCB2aXNpYmxlQ29tcG9zaXRlID0gdGhpcy52aXNpYmxlQ29tcG9zaXRlcy5maW5kKGNpZCA9PiBjaWQgIT09IGNvbXBvc2l0ZUlkKTtcblx0XHRcdGlmICh2aXNpYmxlQ29tcG9zaXRlKSB7XG5cdFx0XHRcdHRoaXMub3B0aW9ucy5vcGVuQ29tcG9zaXRlKHZpc2libGVDb21wb3NpdGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGlzUGlubmVkKGNvbXBvc2l0ZUlkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCBpdGVtID0gdGhpcy5tb2RlbC5maW5kSXRlbShjb21wb3NpdGVJZCk7XG5cdFx0cmV0dXJuIGl0ZW0/LnBpbm5lZDtcblx0fVxuXG5cdG1vdmUoY29tcG9zaXRlSWQ6IHN0cmluZywgdG9Db21wb3NpdGVJZDogc3RyaW5nLCBiZWZvcmU/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGJlZm9yZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBmcm9tSW5kZXggPSB0aGlzLm1vZGVsLml0ZW1zLmZpbmRJbmRleChjID0+IGMuaWQgPT09IGNvbXBvc2l0ZUlkKTtcblx0XHRcdGxldCB0b0luZGV4ID0gdGhpcy5tb2RlbC5pdGVtcy5maW5kSW5kZXgoYyA9PiBjLmlkID09PSB0b0NvbXBvc2l0ZUlkKTtcblxuXHRcdFx0aWYgKGZyb21JbmRleCA+PSAwICYmIHRvSW5kZXggPj0gMCkge1xuXHRcdFx0XHRpZiAoIWJlZm9yZSAmJiBmcm9tSW5kZXggPiB0b0luZGV4KSB7XG5cdFx0XHRcdFx0dG9JbmRleCsrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGJlZm9yZSAmJiBmcm9tSW5kZXggPCB0b0luZGV4KSB7XG5cdFx0XHRcdFx0dG9JbmRleC0tO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRvSW5kZXggPCB0aGlzLm1vZGVsLml0ZW1zLmxlbmd0aCAmJiB0b0luZGV4ID49IDAgJiYgdG9JbmRleCAhPT0gZnJvbUluZGV4KSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMubW9kZWwubW92ZSh0aGlzLm1vZGVsLml0ZW1zW2Zyb21JbmRleF0uaWQsIHRoaXMubW9kZWwuaXRlbXNbdG9JbmRleF0uaWQpKSB7XG5cdFx0XHRcdFx0XHQvLyB0aW1lb3V0IGhlbHBzIHRvIHByZXZlbnQgYXJ0aWZhY3RzIGZyb20gc2hvd2luZyB1cFxuXHRcdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB0aGlzLnVwZGF0ZUNvbXBvc2l0ZVN3aXRjaGVyKCksIDApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodGhpcy5tb2RlbC5tb3ZlKGNvbXBvc2l0ZUlkLCB0b0NvbXBvc2l0ZUlkKSkge1xuXHRcdFx0XHQvLyB0aW1lb3V0IGhlbHBzIHRvIHByZXZlbnQgYXJ0aWZhY3RzIGZyb20gc2hvd2luZyB1cFxuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHRoaXMudXBkYXRlQ29tcG9zaXRlU3dpdGNoZXIoKSwgMCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Z2V0QWN0aW9uKGNvbXBvc2l0ZUlkOiBzdHJpbmcpOiBDb21wb3NpdGVCYXJBY3Rpb24ge1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLm1vZGVsLmZpbmRJdGVtKGNvbXBvc2l0ZUlkKTtcblxuXHRcdHJldHVybiBpdGVtPy5hY3Rpdml0eUFjdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZVNpemVzKGl0ZW1zOiBJQ29tcG9zaXRlQmFyTW9kZWxJdGVtW10pOiB2b2lkIHtcblx0XHRjb25zdCBzaXplID0gdGhpcy5vcHRpb25zLmNvbXBvc2l0ZVNpemU7XG5cdFx0aWYgKHNpemUpIHtcblx0XHRcdGl0ZW1zLmZvckVhY2goY29tcG9zaXRlID0+IHRoaXMuY29tcG9zaXRlU2l6ZUluQmFyLnNldChjb21wb3NpdGUuaWQsIHNpemUpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgY29tcG9zaXRlU3dpdGNoZXJCYXIgPSB0aGlzLmNvbXBvc2l0ZVN3aXRjaGVyQmFyO1xuXHRcdFx0aWYgKGNvbXBvc2l0ZVN3aXRjaGVyQmFyICYmIHRoaXMuZGltZW5zaW9uICYmIHRoaXMuZGltZW5zaW9uLmhlaWdodCAhPT0gMCAmJiB0aGlzLmRpbWVuc2lvbi53aWR0aCAhPT0gMCkge1xuXG5cdFx0XHRcdC8vIENvbXB1dGUgc2l6ZXMgb25seSBpZiB2aXNpYmxlLiBPdGhlcndpc2UgdGhlIHNpemUgbWVhc3VybWVudCB3b3VsZCBiZSBjb21wdXRlZCB3cm9uZ2x5LlxuXHRcdFx0XHRjb25zdCBjdXJyZW50SXRlbXNMZW5ndGggPSBjb21wb3NpdGVTd2l0Y2hlckJhci52aWV3SXRlbXMubGVuZ3RoO1xuXHRcdFx0XHRjb21wb3NpdGVTd2l0Y2hlckJhci5wdXNoKGl0ZW1zLm1hcChjb21wb3NpdGUgPT4gY29tcG9zaXRlLmFjdGl2aXR5QWN0aW9uKSk7XG5cdFx0XHRcdGl0ZW1zLm1hcCgoY29tcG9zaXRlLCBpbmRleCkgPT4gdGhpcy5jb21wb3NpdGVTaXplSW5CYXIuc2V0KGNvbXBvc2l0ZS5pZCwgdGhpcy5vcHRpb25zLm9yaWVudGF0aW9uID09PSBBY3Rpb25zT3JpZW50YXRpb24uVkVSVElDQUxcblx0XHRcdFx0XHQ/IGNvbXBvc2l0ZVN3aXRjaGVyQmFyLmdldEhlaWdodChjdXJyZW50SXRlbXNMZW5ndGggKyBpbmRleClcblx0XHRcdFx0XHQ6IGNvbXBvc2l0ZVN3aXRjaGVyQmFyLmdldFdpZHRoKGN1cnJlbnRJdGVtc0xlbmd0aCArIGluZGV4KVxuXHRcdFx0XHQpKTtcblx0XHRcdFx0aXRlbXMuZm9yRWFjaCgoKSA9PiBjb21wb3NpdGVTd2l0Y2hlckJhci5wdWxsKGNvbXBvc2l0ZVN3aXRjaGVyQmFyLnZpZXdJdGVtcy5sZW5ndGggLSAxKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDb21wb3NpdGVTd2l0Y2hlcihkb25vdFRyaWdnZXI/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgY29tcG9zaXRlU3dpdGNoZXJCYXIgPSB0aGlzLmNvbXBvc2l0ZVN3aXRjaGVyQmFyO1xuXHRcdGlmICghY29tcG9zaXRlU3dpdGNoZXJCYXIgfHwgIXRoaXMuZGltZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm47IC8vIFdlIGhhdmUgbm90IGJlZW4gcmVuZGVyZWQgeWV0IHNvIHRoZXJlIGlzIG5vdGhpbmcgdG8gdXBkYXRlLlxuXHRcdH1cblxuXHRcdGxldCBjb21wb3NpdGVzVG9TaG93ID0gdGhpcy5tb2RlbC52aXNpYmxlSXRlbXMuZmlsdGVyKGl0ZW0gPT5cblx0XHRcdGl0ZW0ucGlubmVkXG5cdFx0XHR8fCAodGhpcy5tb2RlbC5hY3RpdmVJdGVtICYmIHRoaXMubW9kZWwuYWN0aXZlSXRlbS5pZCA9PT0gaXRlbS5pZCkgLyogU2hvdyB0aGUgYWN0aXZlIGNvbXBvc2l0ZSBldmVuIGlmIGl0IGlzIG5vdCBwaW5uZWQgKi9cblx0XHQpLm1hcChpdGVtID0+IGl0ZW0uaWQpO1xuXG5cdFx0Ly8gRW5zdXJlIHdlIGFyZSBub3Qgc2hvd2luZyBtb3JlIGNvbXBvc2l0ZXMgdGhhbiB3ZSBoYXZlIGhlaWdodCBmb3Jcblx0XHRsZXQgbWF4VmlzaWJsZSA9IGNvbXBvc2l0ZXNUb1Nob3cubGVuZ3RoO1xuXHRcdGNvbnN0IHRvdGFsQ29tcG9zaXRlcyA9IGNvbXBvc2l0ZXNUb1Nob3cubGVuZ3RoO1xuXHRcdGxldCBzaXplID0gMDtcblx0XHRjb25zdCBsaW1pdCA9IHRoaXMub3B0aW9ucy5vcmllbnRhdGlvbiA9PT0gQWN0aW9uc09yaWVudGF0aW9uLlZFUlRJQ0FMID8gdGhpcy5kaW1lbnNpb24uaGVpZ2h0IDogdGhpcy5kaW1lbnNpb24ud2lkdGg7XG5cblx0XHQvLyBBZGQgY29tcG9zaXRlcyB3aGlsZSB0aGV5IGZpdFxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY29tcG9zaXRlc1RvU2hvdy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgY29tcG9zaXRlU2l6ZSA9IHRoaXMuY29tcG9zaXRlU2l6ZUluQmFyLmdldChjb21wb3NpdGVzVG9TaG93W2ldKSE7XG5cdFx0XHQvLyBBZGRpbmcgdGhpcyBjb21wb3NpdGUgd2lsbCBvdmVyZmxvdyBhdmFpbGFibGUgc2l6ZSwgc28gZG9uJ3Rcblx0XHRcdGlmIChzaXplICsgY29tcG9zaXRlU2l6ZSA+IGxpbWl0KSB7XG5cdFx0XHRcdG1heFZpc2libGUgPSBpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0c2l6ZSArPSBjb21wb3NpdGVTaXplO1xuXHRcdH1cblxuXHRcdC8vIFJlbW92ZSB0aGUgdGFpbCBvZiBjb21wb3NpdGVzIHRoYXQgZGlkIG5vdCBmaXRcblx0XHRpZiAodG90YWxDb21wb3NpdGVzID4gbWF4VmlzaWJsZSkge1xuXHRcdFx0Y29tcG9zaXRlc1RvU2hvdyA9IGNvbXBvc2l0ZXNUb1Nob3cuc2xpY2UoMCwgbWF4VmlzaWJsZSk7XG5cdFx0fVxuXG5cdFx0Ly8gV2UgYWx3YXlzIHRyeSBzaG93IHRoZSBhY3RpdmUgY29tcG9zaXRlLCBzbyByZS1hZGQgaXQgaWYgaXQgd2FzIHNsaWNlZCBvdXRcblx0XHRpZiAodGhpcy5tb2RlbC5hY3RpdmVJdGVtICYmIGNvbXBvc2l0ZXNUb1Nob3cuZXZlcnkoY29tcG9zaXRlSWQgPT4gISF0aGlzLm1vZGVsLmFjdGl2ZUl0ZW0gJiYgY29tcG9zaXRlSWQgIT09IHRoaXMubW9kZWwuYWN0aXZlSXRlbS5pZCkpIHtcblx0XHRcdHNpemUgKz0gdGhpcy5jb21wb3NpdGVTaXplSW5CYXIuZ2V0KHRoaXMubW9kZWwuYWN0aXZlSXRlbS5pZCkhO1xuXHRcdFx0Y29tcG9zaXRlc1RvU2hvdy5wdXNoKHRoaXMubW9kZWwuYWN0aXZlSXRlbS5pZCk7XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIGFjdGl2ZSBjb21wb3NpdGUgbWlnaHQgaGF2ZSBwdXNoZWQgdXMgb3ZlciB0aGUgbGltaXRcblx0XHQvLyBLZWVwIHBvcHBpbmcgdGhlIGNvbXBvc2l0ZSBiZWZvcmUgdGhlIGFjdGl2ZSBvbmUgdW50aWwgaXQgZml0c1xuXHRcdC8vIElmIGV2ZW4gdGhlIGFjdGl2ZSBvbmUgZG9lc24ndCBmaXQsIHdlIHdpbGwgcmVzb3J0IHRvIG92ZXJmbG93XG5cdFx0d2hpbGUgKHNpemUgPiBsaW1pdCAmJiBjb21wb3NpdGVzVG9TaG93Lmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgcmVtb3ZlZENvbXBvc2l0ZSA9IGNvbXBvc2l0ZXNUb1Nob3cubGVuZ3RoID4gMSA/IGNvbXBvc2l0ZXNUb1Nob3cuc3BsaWNlKGNvbXBvc2l0ZXNUb1Nob3cubGVuZ3RoIC0gMiwgMSlbMF0gOiBjb21wb3NpdGVzVG9TaG93LnBvcCgpO1xuXHRcdFx0c2l6ZSAtPSB0aGlzLmNvbXBvc2l0ZVNpemVJbkJhci5nZXQocmVtb3ZlZENvbXBvc2l0ZSEpITtcblx0XHR9XG5cblx0XHQvLyBXZSBhcmUgb3ZlcmZsb3dpbmcsIGFkZCB0aGUgb3ZlcmZsb3cgc2l6ZVxuXHRcdGlmICh0b3RhbENvbXBvc2l0ZXMgPiBjb21wb3NpdGVzVG9TaG93Lmxlbmd0aCkge1xuXHRcdFx0c2l6ZSArPSB0aGlzLm9wdGlvbnMub3ZlcmZsb3dBY3Rpb25TaXplO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHdlIG5lZWQgdG8gbWFrZSBleHRyYSByb29tIGZvciB0aGUgb3ZlcmZsb3cgYWN0aW9uXG5cdFx0d2hpbGUgKHNpemUgPiBsaW1pdCAmJiBjb21wb3NpdGVzVG9TaG93Lmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgcmVtb3ZlZENvbXBvc2l0ZSA9IGNvbXBvc2l0ZXNUb1Nob3cubGVuZ3RoID4gMSAmJiBjb21wb3NpdGVzVG9TaG93W2NvbXBvc2l0ZXNUb1Nob3cubGVuZ3RoIC0gMV0gPT09IHRoaXMubW9kZWwuYWN0aXZlSXRlbT8uaWQgP1xuXHRcdFx0XHRjb21wb3NpdGVzVG9TaG93LnNwbGljZShjb21wb3NpdGVzVG9TaG93Lmxlbmd0aCAtIDIsIDEpWzBdIDogY29tcG9zaXRlc1RvU2hvdy5wb3AoKTtcblx0XHRcdHNpemUgLT0gdGhpcy5jb21wb3NpdGVTaXplSW5CYXIuZ2V0KHJlbW92ZWRDb21wb3NpdGUhKSE7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIHRoZSBvdmVyZmxvdyBhY3Rpb24gaWYgdGhlcmUgYXJlIG5vIG92ZXJmbG93c1xuXHRcdGlmICh0b3RhbENvbXBvc2l0ZXMgPT09IGNvbXBvc2l0ZXNUb1Nob3cubGVuZ3RoICYmIHRoaXMuY29tcG9zaXRlT3ZlcmZsb3dBY3Rpb24udmFsdWUpIHtcblx0XHRcdGNvbXBvc2l0ZVN3aXRjaGVyQmFyLnB1bGwoY29tcG9zaXRlU3dpdGNoZXJCYXIubGVuZ3RoKCkgLSAxKTtcblxuXHRcdFx0dGhpcy5jb21wb3NpdGVPdmVyZmxvd0FjdGlvbi52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuY29tcG9zaXRlT3ZlcmZsb3dBY3Rpb25WaWV3SXRlbS52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBQdWxsIG91dCBjb21wb3NpdGVzIHRoYXQgb3ZlcmZsb3cgb3IgZ290IGhpZGRlblxuXHRcdGNvbnN0IGNvbXBvc2l0ZXNUb1JlbW92ZTogbnVtYmVyW10gPSBbXTtcblx0XHR0aGlzLnZpc2libGVDb21wb3NpdGVzLmZvckVhY2goKGNvbXBvc2l0ZUlkLCBpbmRleCkgPT4ge1xuXHRcdFx0aWYgKCFjb21wb3NpdGVzVG9TaG93LmluY2x1ZGVzKGNvbXBvc2l0ZUlkKSkge1xuXHRcdFx0XHRjb21wb3NpdGVzVG9SZW1vdmUucHVzaChpbmRleCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29tcG9zaXRlc1RvUmVtb3ZlLnJldmVyc2UoKS5mb3JFYWNoKGluZGV4ID0+IHtcblx0XHRcdGNvbXBvc2l0ZVN3aXRjaGVyQmFyLnB1bGwoaW5kZXgpO1xuXHRcdFx0dGhpcy52aXNpYmxlQ29tcG9zaXRlcy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gVXBkYXRlIHRoZSBwb3NpdGlvbnMgb2YgdGhlIGNvbXBvc2l0ZXNcblx0XHRjb21wb3NpdGVzVG9TaG93LmZvckVhY2goKGNvbXBvc2l0ZUlkLCBuZXdJbmRleCkgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudEluZGV4ID0gdGhpcy52aXNpYmxlQ29tcG9zaXRlcy5pbmRleE9mKGNvbXBvc2l0ZUlkKTtcblx0XHRcdGlmIChuZXdJbmRleCAhPT0gY3VycmVudEluZGV4KSB7XG5cdFx0XHRcdGlmIChjdXJyZW50SW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0Y29tcG9zaXRlU3dpdGNoZXJCYXIucHVsbChjdXJyZW50SW5kZXgpO1xuXHRcdFx0XHRcdHRoaXMudmlzaWJsZUNvbXBvc2l0ZXMuc3BsaWNlKGN1cnJlbnRJbmRleCwgMSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb21wb3NpdGVTd2l0Y2hlckJhci5wdXNoKHRoaXMubW9kZWwuZmluZEl0ZW0oY29tcG9zaXRlSWQpLmFjdGl2aXR5QWN0aW9uLCB7IGxhYmVsOiB0cnVlLCBpY29uOiB0aGlzLm9wdGlvbnMuaWNvbiwgaW5kZXg6IG5ld0luZGV4IH0pO1xuXHRcdFx0XHR0aGlzLnZpc2libGVDb21wb3NpdGVzLnNwbGljZShuZXdJbmRleCwgMCwgY29tcG9zaXRlSWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gQWRkIG92ZXJmbG93IGFjdGlvbiBhcyBuZWVkZWRcblx0XHRpZiAodG90YWxDb21wb3NpdGVzID4gY29tcG9zaXRlc1RvU2hvdy5sZW5ndGggJiYgIXRoaXMuY29tcG9zaXRlT3ZlcmZsb3dBY3Rpb24udmFsdWUpIHtcblx0XHRcdHRoaXMuY29tcG9zaXRlT3ZlcmZsb3dBY3Rpb24udmFsdWUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbXBvc2l0ZU92ZXJmbG93QWN0aXZpdHlBY3Rpb24sICgpID0+IHtcblx0XHRcdFx0dGhpcy5jb21wb3NpdGVPdmVyZmxvd0FjdGlvblZpZXdJdGVtLnZhbHVlPy5zaG93TWVudSgpO1xuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLmNvbXBvc2l0ZU92ZXJmbG93QWN0aW9uVmlld0l0ZW0udmFsdWUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDb21wb3NpdGVPdmVyZmxvd0FjdGl2aXR5QWN0aW9uVmlld0l0ZW0sXG5cdFx0XHRcdHRoaXMuY29tcG9zaXRlT3ZlcmZsb3dBY3Rpb24udmFsdWUsXG5cdFx0XHRcdCgpID0+IHRoaXMuZ2V0T3ZlcmZsb3dpbmdDb21wb3NpdGVzKCksXG5cdFx0XHRcdCgpID0+IHRoaXMubW9kZWwuYWN0aXZlSXRlbSA/IHRoaXMubW9kZWwuYWN0aXZlSXRlbS5pZCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y29tcG9zaXRlSWQgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLm1vZGVsLmZpbmRJdGVtKGNvbXBvc2l0ZUlkKTtcblx0XHRcdFx0XHRyZXR1cm4gaXRlbT8uYWN0aXZpdHlbMF0/LmJhZGdlO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR0aGlzLm9wdGlvbnMuZ2V0T25Db21wb3NpdGVDbGlja0FjdGlvbixcblx0XHRcdFx0dGhpcy5vcHRpb25zLmNvbG9ycyxcblx0XHRcdFx0dGhpcy5vcHRpb25zLmFjdGl2aXR5SG92ZXJPcHRpb25zXG5cdFx0XHQpO1xuXG5cdFx0XHRjb21wb3NpdGVTd2l0Y2hlckJhci5wdXNoKHRoaXMuY29tcG9zaXRlT3ZlcmZsb3dBY3Rpb24udmFsdWUsIHsgbGFiZWw6IGZhbHNlLCBpY29uOiB0cnVlIH0pO1xuXHRcdH1cblxuXHRcdGlmICghZG9ub3RUcmlnZ2VyKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRPdmVyZmxvd2luZ0NvbXBvc2l0ZXMoKTogeyBpZDogc3RyaW5nOyBuYW1lPzogc3RyaW5nIH1bXSB7XG5cdFx0bGV0IG92ZXJmbG93aW5nSWRzID0gdGhpcy5tb2RlbC52aXNpYmxlSXRlbXMuZmlsdGVyKGl0ZW0gPT4gaXRlbS5waW5uZWQpLm1hcChpdGVtID0+IGl0ZW0uaWQpO1xuXG5cdFx0Ly8gU2hvdyB0aGUgYWN0aXZlIGNvbXBvc2l0ZSBldmVuIGlmIGl0IGlzIG5vdCBwaW5uZWRcblx0XHRpZiAodGhpcy5tb2RlbC5hY3RpdmVJdGVtICYmICF0aGlzLm1vZGVsLmFjdGl2ZUl0ZW0ucGlubmVkKSB7XG5cdFx0XHRvdmVyZmxvd2luZ0lkcy5wdXNoKHRoaXMubW9kZWwuYWN0aXZlSXRlbS5pZCk7XG5cdFx0fVxuXG5cdFx0b3ZlcmZsb3dpbmdJZHMgPSBvdmVyZmxvd2luZ0lkcy5maWx0ZXIoY29tcG9zaXRlSWQgPT4gIXRoaXMudmlzaWJsZUNvbXBvc2l0ZXMuaW5jbHVkZXMoY29tcG9zaXRlSWQpKTtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC52aXNpYmxlSXRlbXMuZmlsdGVyKGMgPT4gb3ZlcmZsb3dpbmdJZHMuaW5jbHVkZXMoYy5pZCkpLm1hcChpdGVtID0+IHsgcmV0dXJuIHsgaWQ6IGl0ZW0uaWQsIG5hbWU6IHRoaXMuZ2V0QWN0aW9uKGl0ZW0uaWQpPy5sYWJlbCB8fCBpdGVtLm5hbWUgfTsgfSk7XG5cdH1cblxuXHRwcml2YXRlIHNob3dDb250ZXh0TWVudSh0YXJnZXRXaW5kb3c6IFdpbmRvdywgZTogTW91c2VFdmVudCB8IEdlc3R1cmVFdmVudCk6IHZvaWQge1xuXHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cblx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQodGFyZ2V0V2luZG93LCBlKTtcblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBldmVudCxcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHRoaXMuZ2V0Q29udGV4dE1lbnVBY3Rpb25zKGUpXG5cdFx0fSk7XG5cdH1cblxuXHRnZXRDb250ZXh0TWVudUFjdGlvbnMoZT86IE1vdXNlRXZlbnQgfCBHZXN0dXJlRXZlbnQpOiBJQWN0aW9uW10ge1xuXHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IHRoaXMubW9kZWwudmlzaWJsZUl0ZW1zXG5cdFx0XHQubWFwKCh7IGlkLCBuYW1lLCBhY3Rpdml0eUFjdGlvbiB9KSA9PiB7XG5cdFx0XHRcdGNvbnN0IGlzUGlubmVkID0gdGhpcy5pc1Bpbm5lZChpZCk7XG5cdFx0XHRcdHJldHVybiB0b0FjdGlvbih7XG5cdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0bGFiZWw6IHRoaXMuZ2V0QWN0aW9uKGlkKS5sYWJlbCB8fCBuYW1lIHx8IGlkLFxuXHRcdFx0XHRcdGNoZWNrZWQ6IGlzUGlubmVkLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IGFjdGl2aXR5QWN0aW9uLmVuYWJsZWQgJiYgKCFpc1Bpbm5lZCB8fCB0aGlzLmdldFBpbm5lZENvbXBvc2l0ZUlkcygpLmxlbmd0aCA+IDEpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMuaXNQaW5uZWQoaWQpKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMudW5waW4oaWQpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5waW4oaWQsIHRydWUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdHRoaXMub3B0aW9ucy5maWxsRXh0cmFDb250ZXh0TWVudUFjdGlvbnMoYWN0aW9ucywgZSk7XG5cblx0XHRyZXR1cm4gYWN0aW9ucztcblx0fVxufVxuXG5pbnRlcmZhY2UgSUNvbXBvc2l0ZUJhck1vZGVsSXRlbSBleHRlbmRzIElDb21wb3NpdGVCYXJJdGVtIHtcblx0cmVhZG9ubHkgYWN0aXZpdHlBY3Rpb246IENvbXBvc2l0ZUJhckFjdGlvbjtcblx0cmVhZG9ubHkgcGlubmVkQWN0aW9uOiBJQWN0aW9uO1xuXHRyZWFkb25seSB0b2dnbGVCYWRnZUFjdGlvbjogSUFjdGlvbjtcblx0cmVhZG9ubHkgYWN0aXZpdHk6IElBY3Rpdml0eVtdO1xufVxuXG5jbGFzcyBDb21wb3NpdGVCYXJNb2RlbCB7XG5cblx0cHJpdmF0ZSBfaXRlbXM6IElDb21wb3NpdGVCYXJNb2RlbEl0ZW1bXSA9IFtdO1xuXHRnZXQgaXRlbXMoKTogSUNvbXBvc2l0ZUJhck1vZGVsSXRlbVtdIHsgcmV0dXJuIHRoaXMuX2l0ZW1zOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiBJQ29tcG9zaXRlQmFyT3B0aW9ucztcblxuXHRhY3RpdmVJdGVtPzogSUNvbXBvc2l0ZUJhck1vZGVsSXRlbTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpdGVtczogSUNvbXBvc2l0ZUJhckl0ZW1bXSxcblx0XHRvcHRpb25zOiBJQ29tcG9zaXRlQmFyT3B0aW9uc1xuXHQpIHtcblx0XHR0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdHRoaXMuc2V0SXRlbXMoaXRlbXMpO1xuXHR9XG5cblx0c2V0SXRlbXMoaXRlbXM6IElDb21wb3NpdGVCYXJJdGVtW10pOiB2b2lkIHtcblx0XHR0aGlzLl9pdGVtcyA9IFtdO1xuXHRcdHRoaXMuX2l0ZW1zID0gaXRlbXNcblx0XHRcdC5tYXAoaSA9PiB0aGlzLmNyZWF0ZUNvbXBvc2l0ZUJhckl0ZW0oaS5pZCwgaS5uYW1lLCBpLm9yZGVyLCBpLnBpbm5lZCwgaS52aXNpYmxlKSk7XG5cdH1cblxuXHRnZXQgdmlzaWJsZUl0ZW1zKCk6IElDb21wb3NpdGVCYXJNb2RlbEl0ZW1bXSB7XG5cdFx0cmV0dXJuIHRoaXMuaXRlbXMuZmlsdGVyKGl0ZW0gPT4gaXRlbS52aXNpYmxlKTtcblx0fVxuXG5cdGdldCBwaW5uZWRJdGVtcygpOiBJQ29tcG9zaXRlQmFyTW9kZWxJdGVtW10ge1xuXHRcdHJldHVybiB0aGlzLml0ZW1zLmZpbHRlcihpdGVtID0+IGl0ZW0udmlzaWJsZSAmJiBpdGVtLnBpbm5lZCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUNvbXBvc2l0ZUJhckl0ZW0oaWQ6IHN0cmluZywgbmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBvcmRlcjogbnVtYmVyIHwgdW5kZWZpbmVkLCBwaW5uZWQ6IGJvb2xlYW4sIHZpc2libGU6IGJvb2xlYW4pOiBJQ29tcG9zaXRlQmFyTW9kZWxJdGVtIHtcblx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5vcHRpb25zO1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZCwgbmFtZSwgcGlubmVkLCBvcmRlciwgdmlzaWJsZSxcblx0XHRcdGFjdGl2aXR5OiBbXSxcblx0XHRcdGdldCBhY3Rpdml0eUFjdGlvbigpIHtcblx0XHRcdFx0cmV0dXJuIG9wdGlvbnMuZ2V0QWN0aXZpdHlBY3Rpb24oaWQpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBwaW5uZWRBY3Rpb24oKSB7XG5cdFx0XHRcdHJldHVybiBvcHRpb25zLmdldENvbXBvc2l0ZVBpbm5lZEFjdGlvbihpZCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHRvZ2dsZUJhZGdlQWN0aW9uKCkge1xuXHRcdFx0XHRyZXR1cm4gb3B0aW9ucy5nZXRDb21wb3NpdGVCYWRnZUFjdGlvbihpZCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGFkZChpZDogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIG9yZGVyOiBudW1iZXIgfCB1bmRlZmluZWQsIHJlcXVlc3RlZEluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRjb25zdCBpdGVtID0gdGhpcy5maW5kSXRlbShpZCk7XG5cdFx0aWYgKGl0ZW0pIHtcblx0XHRcdGxldCBjaGFuZ2VkID0gZmFsc2U7XG5cdFx0XHRpdGVtLm5hbWUgPSBuYW1lO1xuXHRcdFx0aWYgKCFpc1VuZGVmaW5lZE9yTnVsbChvcmRlcikpIHtcblx0XHRcdFx0Y2hhbmdlZCA9IGl0ZW0ub3JkZXIgIT09IG9yZGVyO1xuXHRcdFx0XHRpdGVtLm9yZGVyID0gb3JkZXI7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWl0ZW0udmlzaWJsZSkge1xuXHRcdFx0XHRpdGVtLnZpc2libGUgPSB0cnVlO1xuXHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGNoYW5nZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLmNyZWF0ZUNvbXBvc2l0ZUJhckl0ZW0oaWQsIG5hbWUsIG9yZGVyLCB0cnVlLCB0cnVlKTtcblx0XHRcdGlmICghaXNVbmRlZmluZWRPck51bGwocmVxdWVzdGVkSW5kZXgpKSB7XG5cdFx0XHRcdGxldCBpbmRleCA9IDA7XG5cdFx0XHRcdGxldCBySW5kZXggPSByZXF1ZXN0ZWRJbmRleDtcblx0XHRcdFx0d2hpbGUgKHJJbmRleCA+IDAgJiYgaW5kZXggPCB0aGlzLml0ZW1zLmxlbmd0aCkge1xuXHRcdFx0XHRcdGlmICh0aGlzLml0ZW1zW2luZGV4KytdLnZpc2libGUpIHtcblx0XHRcdFx0XHRcdHJJbmRleC0tO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuaXRlbXMuc3BsaWNlKGluZGV4LCAwLCBpdGVtKTtcblx0XHRcdH0gZWxzZSBpZiAoaXNVbmRlZmluZWRPck51bGwob3JkZXIpKSB7XG5cdFx0XHRcdHRoaXMuaXRlbXMucHVzaChpdGVtKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxldCBpbmRleCA9IDA7XG5cdFx0XHRcdHdoaWxlIChpbmRleCA8IHRoaXMuaXRlbXMubGVuZ3RoICYmIHR5cGVvZiB0aGlzLml0ZW1zW2luZGV4XS5vcmRlciA9PT0gJ251bWJlcicgJiYgdGhpcy5pdGVtc1tpbmRleF0ub3JkZXIhIDwgb3JkZXIpIHtcblx0XHRcdFx0XHRpbmRleCsrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuaXRlbXMuc3BsaWNlKGluZGV4LCAwLCBpdGVtKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9XG5cblx0cmVtb3ZlKGlkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgdGhpcy5pdGVtcy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRcdGlmICh0aGlzLml0ZW1zW2luZGV4XS5pZCA9PT0gaWQpIHtcblx0XHRcdFx0dGhpcy5pdGVtcy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0aGlkZShpZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIHRoaXMuaXRlbXMpIHtcblx0XHRcdGlmIChpdGVtLmlkID09PSBpZCkge1xuXHRcdFx0XHRpZiAoaXRlbS52aXNpYmxlKSB7XG5cdFx0XHRcdFx0aXRlbS52aXNpYmxlID0gZmFsc2U7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRtb3ZlKGNvbXBvc2l0ZUlkOiBzdHJpbmcsIHRvQ29tcG9zaXRlSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXG5cdFx0Y29uc3QgZnJvbUluZGV4ID0gdGhpcy5maW5kSW5kZXgoY29tcG9zaXRlSWQpO1xuXHRcdGNvbnN0IHRvSW5kZXggPSB0aGlzLmZpbmRJbmRleCh0b0NvbXBvc2l0ZUlkKTtcblxuXHRcdC8vIE1ha2Ugc3VyZSBib3RoIGl0ZW1zIGFyZSBrbm93biB0byB0aGUgbW9kZWxcblx0XHRpZiAoZnJvbUluZGV4ID09PSAtMSB8fCB0b0luZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNvdXJjZUl0ZW0gPSB0aGlzLml0ZW1zLnNwbGljZShmcm9tSW5kZXgsIDEpWzBdO1xuXHRcdHRoaXMuaXRlbXMuc3BsaWNlKHRvSW5kZXgsIDAsIHNvdXJjZUl0ZW0pO1xuXG5cdFx0Ly8gTWFrZSBzdXJlIGEgbW92ZWQgY29tcG9zaXRlIGdldHMgcGlubmVkXG5cdFx0c291cmNlSXRlbS5waW5uZWQgPSB0cnVlO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRzZXRQaW5uZWQoaWQ6IHN0cmluZywgcGlubmVkOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIHRoaXMuaXRlbXMpIHtcblx0XHRcdGlmIChpdGVtLmlkID09PSBpZCkge1xuXHRcdFx0XHRpZiAoaXRlbS5waW5uZWQgIT09IHBpbm5lZCkge1xuXHRcdFx0XHRcdGl0ZW0ucGlubmVkID0gcGlubmVkO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0YWN0aXZhdGUoaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5hY3RpdmVJdGVtIHx8IHRoaXMuYWN0aXZlSXRlbS5pZCAhPT0gaWQpIHtcblx0XHRcdGlmICh0aGlzLmFjdGl2ZUl0ZW0pIHtcblx0XHRcdFx0dGhpcy5kZWFjdGl2YXRlKCk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdGhpcy5pdGVtcykge1xuXHRcdFx0XHRpZiAoaXRlbS5pZCA9PT0gaWQpIHtcblx0XHRcdFx0XHR0aGlzLmFjdGl2ZUl0ZW0gPSBpdGVtO1xuXHRcdFx0XHRcdHRoaXMuYWN0aXZlSXRlbS5hY3Rpdml0eUFjdGlvbi5hY3RpdmF0ZSgpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGRlYWN0aXZhdGUoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuYWN0aXZlSXRlbSkge1xuXHRcdFx0dGhpcy5hY3RpdmVJdGVtLmFjdGl2aXR5QWN0aW9uLmRlYWN0aXZhdGUoKTtcblx0XHRcdHRoaXMuYWN0aXZlSXRlbSA9IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRmaW5kSXRlbShpZDogc3RyaW5nKTogSUNvbXBvc2l0ZUJhck1vZGVsSXRlbSB7XG5cdFx0cmV0dXJuIHRoaXMuaXRlbXMuZmlsdGVyKGl0ZW0gPT4gaXRlbS5pZCA9PT0gaWQpWzBdO1xuXHR9XG5cblx0cHJpdmF0ZSBmaW5kSW5kZXgoaWQ6IHN0cmluZyk6IG51bWJlciB7XG5cdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHRoaXMuaXRlbXMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRpZiAodGhpcy5pdGVtc1tpbmRleF0uaWQgPT09IGlkKSB7XG5cdFx0XHRcdHJldHVybiBpbmRleDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gLTE7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBa0IsZ0JBQWdCO0FBRWxDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsV0FBVywwQkFBMEI7QUFDOUMsU0FBUyx5QkFBeUIsaUNBQWlDLCtDQUE4SDtBQUNqTSxTQUFvQixHQUFHLHVCQUF1QixXQUFXLGFBQWEsWUFBWSxpQkFBaUI7QUFDbkcsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsZUFBZTtBQUN4QixTQUFnQyw4QkFBOEI7QUFHOUQsU0FBbUMsOEJBQXNGLHdCQUFnRTtBQUN6TCxTQUFTLFNBQVMsYUFBYSxzQkFBb0M7QUFDbkUsU0FBUyx5QkFBeUI7QUFZM0IsTUFBTSxxQkFBc0Q7QUFBQSxFQUVsRSxZQUNTLHVCQUNBLHlCQUNBLGFBQ0EsZUFDQSxlQUNBLFVBQ1A7QUFOTztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQSxFQUNMO0FBQUEsRUFFSixLQUFLLE1BQWdDLG1CQUF1QyxlQUEwQixRQUF5QjtBQUM5SCxVQUFNLFdBQVcsS0FBSyxRQUFRO0FBRTlCLFFBQUksU0FBUyxTQUFTLGFBQWE7QUFDbEMsWUFBTSxtQkFBbUIsS0FBSyxzQkFBc0IscUJBQXFCLFNBQVMsRUFBRTtBQUNwRixZQUFNLGtCQUFrQixLQUFLLHNCQUFzQix5QkFBeUIsZ0JBQWdCO0FBQzVGLFVBQUksUUFBUTtBQUdaLFVBQUksb0JBQW9CLEtBQUsseUJBQXlCO0FBQ3JELFlBQUksbUJBQW1CO0FBQ3RCLGVBQUssY0FBYyxTQUFTLElBQUksbUJBQW1CLE1BQU07QUFDekQsa0JBQVE7QUFBQSxRQUNUO0FBQUEsTUFDRCxPQUVL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
