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
import { Extensions as ViewExtensions, defaultViewIcon, VIEWS_LOG_ID, VIEWS_LOG_NAME } from "../../../common/views.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { URI } from "../../../../base/common/uri.js";
import { coalesce, move } from "../../../../base/common/arrays.js";
import { isUndefined, isUndefinedOrNull } from "../../../../base/common/types.js";
import { isEqual } from "../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { ILoggerService } from "../../../../platform/log/common/log.js";
import { CounterSet } from "../../../../base/common/map.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { windowLogGroup } from "../../log/common/logConstants.js";
function getViewsStateStorageId(viewContainerStorageId) {
  return `${viewContainerStorageId}.hidden`;
}
let ViewDescriptorsState = class extends Disposable {
  constructor(viewContainerStorageId, viewContainerName, storageService, loggerService) {
    super();
    this.viewContainerName = viewContainerName;
    this.storageService = storageService;
    this._onDidChangeStoredState = this._register(new Emitter());
    this.onDidChangeStoredState = this._onDidChangeStoredState.event;
    this.logger = new Lazy(() => loggerService.createLogger(VIEWS_LOG_ID, { name: VIEWS_LOG_NAME, group: windowLogGroup }));
    this.globalViewsStateStorageId = getViewsStateStorageId(viewContainerStorageId);
    this.workspaceViewsStateStorageId = viewContainerStorageId;
    this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, this.globalViewsStateStorageId, this._store)(() => this.onDidStorageChange()));
    this.state = this.initialize();
  }
  set(id, state) {
    this.state.set(id, state);
  }
  get(id) {
    return this.state.get(id);
  }
  updateState(viewDescriptors) {
    this.updateWorkspaceState(viewDescriptors);
    this.updateGlobalState(viewDescriptors);
  }
  updateWorkspaceState(viewDescriptors) {
    const storedViewsStates = this.getStoredWorkspaceState();
    for (const viewDescriptor of viewDescriptors) {
      const viewState = this.get(viewDescriptor.id);
      if (viewState) {
        storedViewsStates[viewDescriptor.id] = {
          collapsed: !!viewState.collapsed,
          isHidden: !viewState.visibleWorkspace,
          size: viewState.size,
          order: viewDescriptor.workspace && viewState ? viewState.order : void 0
        };
      }
    }
    if (Object.keys(storedViewsStates).length > 0) {
      this.storageService.store(this.workspaceViewsStateStorageId, JSON.stringify(storedViewsStates), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(this.workspaceViewsStateStorageId, StorageScope.WORKSPACE);
    }
  }
  updateGlobalState(viewDescriptors) {
    const storedGlobalState = this.getStoredGlobalState();
    for (const viewDescriptor of viewDescriptors) {
      const state = this.get(viewDescriptor.id);
      storedGlobalState.set(viewDescriptor.id, {
        id: viewDescriptor.id,
        isHidden: state && viewDescriptor.canToggleVisibility ? !state.visibleGlobal : false,
        order: !viewDescriptor.workspace && state ? state.order : void 0
      });
    }
    this.setStoredGlobalState(storedGlobalState);
  }
  onDidStorageChange() {
    if (this.globalViewsStatesValue !== this.getStoredGlobalViewsStatesValue()) {
      this._globalViewsStatesValue = void 0;
      const storedViewsVisibilityStates = this.getStoredGlobalState();
      const storedWorkspaceViewsStates = this.getStoredWorkspaceState();
      const changedStates = [];
      for (const [id, storedState] of storedViewsVisibilityStates) {
        const state = this.get(id);
        if (state) {
          if (state.visibleGlobal !== !storedState.isHidden) {
            if (!storedState.isHidden) {
              this.logger.value.trace(`View visibility state changed: ${id} is now visible`, this.viewContainerName);
            }
            changedStates.push({ id, visible: !storedState.isHidden });
          }
        } else {
          const workspaceViewState = storedWorkspaceViewsStates[id];
          this.set(id, {
            active: false,
            visibleGlobal: !storedState.isHidden,
            visibleWorkspace: isUndefined(workspaceViewState?.isHidden) ? void 0 : !workspaceViewState?.isHidden,
            collapsed: workspaceViewState?.collapsed,
            order: workspaceViewState?.order,
            size: workspaceViewState?.size
          });
        }
      }
      if (changedStates.length) {
        this._onDidChangeStoredState.fire(changedStates);
        for (const changedState of changedStates) {
          const state = this.get(changedState.id);
          if (state) {
            state.visibleGlobal = changedState.visible;
          }
        }
      }
    }
  }
  initialize() {
    const viewStates = /* @__PURE__ */ new Map();
    const workspaceViewsStates = this.getStoredWorkspaceState();
    for (const id of Object.keys(workspaceViewsStates)) {
      const workspaceViewState = workspaceViewsStates[id];
      viewStates.set(id, {
        active: false,
        visibleGlobal: void 0,
        visibleWorkspace: isUndefined(workspaceViewState.isHidden) ? void 0 : !workspaceViewState.isHidden,
        collapsed: workspaceViewState.collapsed,
        order: workspaceViewState.order,
        size: workspaceViewState.size
      });
    }
    const value = this.storageService.get(this.globalViewsStateStorageId, StorageScope.WORKSPACE, "[]");
    const { state: workspaceVisibilityStates } = this.parseStoredGlobalState(value);
    if (workspaceVisibilityStates.size > 0) {
      for (const { id, isHidden } of workspaceVisibilityStates.values()) {
        const viewState = viewStates.get(id);
        if (viewState) {
          if (isUndefined(viewState.visibleWorkspace)) {
            viewState.visibleWorkspace = !isHidden;
          }
        } else {
          viewStates.set(id, {
            active: false,
            collapsed: void 0,
            visibleGlobal: void 0,
            visibleWorkspace: !isHidden
          });
        }
      }
      this.storageService.remove(this.globalViewsStateStorageId, StorageScope.WORKSPACE);
    }
    const { state, hasDuplicates } = this.parseStoredGlobalState(this.globalViewsStatesValue);
    if (hasDuplicates) {
      this.setStoredGlobalState(state);
    }
    for (const { id, isHidden, order } of state.values()) {
      const viewState = viewStates.get(id);
      if (viewState) {
        viewState.visibleGlobal = !isHidden;
        if (!isUndefined(order)) {
          viewState.order = order;
        }
      } else {
        viewStates.set(id, {
          active: false,
          visibleGlobal: !isHidden,
          order,
          collapsed: void 0,
          visibleWorkspace: void 0
        });
      }
    }
    return viewStates;
  }
  getStoredWorkspaceState() {
    return JSON.parse(this.storageService.get(this.workspaceViewsStateStorageId, StorageScope.WORKSPACE, "{}"));
  }
  getStoredGlobalState() {
    return this.parseStoredGlobalState(this.globalViewsStatesValue).state;
  }
  setStoredGlobalState(storedGlobalState) {
    this.globalViewsStatesValue = JSON.stringify([...storedGlobalState.values()]);
  }
  parseStoredGlobalState(value) {
    const storedValue = JSON.parse(value);
    let hasDuplicates = false;
    const state = storedValue.reduce((result, storedState) => {
      if (typeof storedState === "string") {
        hasDuplicates = hasDuplicates || result.has(storedState);
        result.set(storedState, { id: storedState, isHidden: true });
      } else {
        hasDuplicates = hasDuplicates || result.has(storedState.id);
        result.set(storedState.id, storedState);
      }
      return result;
    }, /* @__PURE__ */ new Map());
    return { state, hasDuplicates };
  }
  get globalViewsStatesValue() {
    if (!this._globalViewsStatesValue) {
      this._globalViewsStatesValue = this.getStoredGlobalViewsStatesValue();
    }
    return this._globalViewsStatesValue;
  }
  set globalViewsStatesValue(globalViewsStatesValue) {
    if (this.globalViewsStatesValue !== globalViewsStatesValue) {
      this._globalViewsStatesValue = globalViewsStatesValue;
      this.setStoredGlobalViewsStatesValue(globalViewsStatesValue);
    }
  }
  getStoredGlobalViewsStatesValue() {
    return this.storageService.get(this.globalViewsStateStorageId, StorageScope.PROFILE, "[]");
  }
  setStoredGlobalViewsStatesValue(value) {
    this.storageService.store(this.globalViewsStateStorageId, value, StorageScope.PROFILE, StorageTarget.USER);
  }
};
ViewDescriptorsState = __decorateClass([
  __decorateParam(2, IStorageService),
  __decorateParam(3, ILoggerService)
], ViewDescriptorsState);
let ViewContainerModel = class extends Disposable {
  constructor(viewContainer, instantiationService, contextKeyService, loggerService) {
    super();
    this.viewContainer = viewContainer;
    this.contextKeyService = contextKeyService;
    this.contextKeys = new CounterSet();
    this.viewDescriptorItems = [];
    this._onDidChangeContainerInfo = this._register(new Emitter());
    this.onDidChangeContainerInfo = this._onDidChangeContainerInfo.event;
    this._onDidChangeAllViewDescriptors = this._register(new Emitter());
    this.onDidChangeAllViewDescriptors = this._onDidChangeAllViewDescriptors.event;
    this._onDidChangeActiveViewDescriptors = this._register(new Emitter());
    this.onDidChangeActiveViewDescriptors = this._onDidChangeActiveViewDescriptors.event;
    this._onDidAddVisibleViewDescriptors = this._register(new Emitter());
    this.onDidAddVisibleViewDescriptors = this._onDidAddVisibleViewDescriptors.event;
    this._onDidRemoveVisibleViewDescriptors = this._register(new Emitter());
    this.onDidRemoveVisibleViewDescriptors = this._onDidRemoveVisibleViewDescriptors.event;
    this._onDidMoveVisibleViewDescriptors = this._register(new Emitter());
    this.onDidMoveVisibleViewDescriptors = this._onDidMoveVisibleViewDescriptors.event;
    this.logger = new Lazy(() => loggerService.createLogger(VIEWS_LOG_ID, { name: VIEWS_LOG_NAME, group: windowLogGroup }));
    this._register(Event.filter(contextKeyService.onDidChangeContext, (e) => e.affectsSome(this.contextKeys))(() => this.onDidChangeContext()));
    this.viewDescriptorsState = this._register(instantiationService.createInstance(ViewDescriptorsState, viewContainer.storageId || `${viewContainer.id}.state`, typeof viewContainer.title === "string" ? viewContainer.title : viewContainer.title.original));
    this._register(this.viewDescriptorsState.onDidChangeStoredState((items) => this.updateVisibility(items)));
    this.updateContainerInfo();
  }
  get title() {
    return this._title;
  }
  get icon() {
    return this._icon;
  }
  get keybindingId() {
    return this._keybindingId;
  }
  // All View Descriptors
  get allViewDescriptors() {
    return this.viewDescriptorItems.map((item) => item.viewDescriptor);
  }
  // Active View Descriptors
  get activeViewDescriptors() {
    return this.viewDescriptorItems.filter((item) => item.state.active).map((item) => item.viewDescriptor);
  }
  // Visible View Descriptors
  get visibleViewDescriptors() {
    return this.viewDescriptorItems.filter((item) => this.isViewDescriptorVisible(item)).map((item) => item.viewDescriptor);
  }
  updateContainerInfo() {
    const useDefaultContainerInfo = this.viewContainer.alwaysUseContainerInfo || this.visibleViewDescriptors.length === 0 || this.visibleViewDescriptors.some((v) => Registry.as(ViewExtensions.ViewsRegistry).getViewContainer(v.id) === this.viewContainer);
    const title = useDefaultContainerInfo ? typeof this.viewContainer.title === "string" ? this.viewContainer.title : this.viewContainer.title.value : this.visibleViewDescriptors[0]?.containerTitle || this.visibleViewDescriptors[0]?.name?.value || "";
    let titleChanged = false;
    if (this._title !== title) {
      this._title = title;
      titleChanged = true;
    }
    const icon = useDefaultContainerInfo ? this.viewContainer.icon : this.visibleViewDescriptors[0]?.containerIcon || defaultViewIcon;
    let iconChanged = false;
    if (!this.isEqualIcon(icon)) {
      this._icon = icon;
      iconChanged = true;
    }
    const keybindingId = this.viewContainer.openCommandActionDescriptor?.id ?? this.activeViewDescriptors.find((v) => v.openCommandActionDescriptor)?.openCommandActionDescriptor?.id;
    let keybindingIdChanged = false;
    if (this._keybindingId !== keybindingId) {
      this._keybindingId = keybindingId;
      keybindingIdChanged = true;
    }
    if (titleChanged || iconChanged || keybindingIdChanged) {
      this._onDidChangeContainerInfo.fire({ title: titleChanged, icon: iconChanged, keybindingId: keybindingIdChanged });
    }
  }
  isEqualIcon(icon) {
    if (URI.isUri(icon)) {
      return URI.isUri(this._icon) && isEqual(icon, this._icon);
    } else if (ThemeIcon.isThemeIcon(icon)) {
      return ThemeIcon.isThemeIcon(this._icon) && ThemeIcon.isEqual(icon, this._icon);
    }
    return icon === this._icon;
  }
  isVisible(id) {
    const viewDescriptorItem = this.viewDescriptorItems.find((v) => v.viewDescriptor.id === id);
    if (!viewDescriptorItem) {
      throw new Error(`Unknown view ${id}`);
    }
    return this.isViewDescriptorVisible(viewDescriptorItem);
  }
  setVisible(id, visible) {
    this.updateVisibility([{ id, visible }]);
  }
  updateVisibility(viewDescriptors) {
    const viewDescriptorItemsToHide = coalesce(viewDescriptors.filter(({ visible }) => !visible).map(({ id }) => this.findAndIgnoreIfNotFound(id)));
    const removed = [];
    for (const { viewDescriptorItem, visibleIndex } of viewDescriptorItemsToHide) {
      if (this.updateViewDescriptorItemVisibility(viewDescriptorItem, false)) {
        removed.push({ viewDescriptor: viewDescriptorItem.viewDescriptor, index: visibleIndex });
      }
    }
    if (removed.length) {
      this.broadCastRemovedVisibleViewDescriptors(removed);
    }
    const added = [];
    for (const { id, visible } of viewDescriptors) {
      if (!visible) {
        continue;
      }
      const foundViewDescriptor = this.findAndIgnoreIfNotFound(id);
      if (!foundViewDescriptor) {
        continue;
      }
      const { viewDescriptorItem, visibleIndex } = foundViewDescriptor;
      if (this.updateViewDescriptorItemVisibility(viewDescriptorItem, true)) {
        added.push({ index: visibleIndex, viewDescriptor: viewDescriptorItem.viewDescriptor, size: viewDescriptorItem.state.size, collapsed: !!viewDescriptorItem.state.collapsed });
      }
    }
    if (added.length) {
      this.broadCastAddedVisibleViewDescriptors(added);
    }
  }
  updateViewDescriptorItemVisibility(viewDescriptorItem, visible) {
    if (!viewDescriptorItem.viewDescriptor.canToggleVisibility) {
      return false;
    }
    if (this.isViewDescriptorVisibleWhenActive(viewDescriptorItem) === visible) {
      return false;
    }
    if (viewDescriptorItem.viewDescriptor.workspace) {
      viewDescriptorItem.state.visibleWorkspace = visible;
    } else {
      viewDescriptorItem.state.visibleGlobal = visible;
      if (visible) {
        this.logger.value.trace(`Showing view ${viewDescriptorItem.viewDescriptor.id} in the container ${this.viewContainer.id}`);
      }
    }
    return this.isViewDescriptorVisible(viewDescriptorItem) === visible;
  }
  isCollapsed(id) {
    return !!this.find(id).viewDescriptorItem.state.collapsed;
  }
  setCollapsed(id, collapsed) {
    const { viewDescriptorItem } = this.find(id);
    if (viewDescriptorItem.state.collapsed !== collapsed) {
      viewDescriptorItem.state.collapsed = collapsed;
    }
    this.viewDescriptorsState.updateState(this.allViewDescriptors);
  }
  getSize(id) {
    return this.find(id).viewDescriptorItem.state.size;
  }
  setSizes(newSizes) {
    for (const { id, size } of newSizes) {
      const { viewDescriptorItem } = this.find(id);
      if (viewDescriptorItem.state.size !== size) {
        viewDescriptorItem.state.size = size;
      }
    }
    this.viewDescriptorsState.updateState(this.allViewDescriptors);
  }
  move(from, to) {
    const fromIndex = this.viewDescriptorItems.findIndex((v) => v.viewDescriptor.id === from);
    const toIndex = this.viewDescriptorItems.findIndex((v) => v.viewDescriptor.id === to);
    const fromViewDescriptor = this.viewDescriptorItems[fromIndex];
    const toViewDescriptor = this.viewDescriptorItems[toIndex];
    move(this.viewDescriptorItems, fromIndex, toIndex);
    for (let index = 0; index < this.viewDescriptorItems.length; index++) {
      this.viewDescriptorItems[index].state.order = index;
    }
    this.broadCastMovedViewDescriptors({ index: fromIndex, viewDescriptor: fromViewDescriptor.viewDescriptor }, { index: toIndex, viewDescriptor: toViewDescriptor.viewDescriptor });
  }
  add(addedViewDescriptorStates) {
    const addedItems = [];
    for (const addedViewDescriptorState of addedViewDescriptorStates) {
      const viewDescriptor = addedViewDescriptorState.viewDescriptor;
      if (viewDescriptor.when) {
        for (const key of viewDescriptor.when.keys()) {
          this.contextKeys.add(key);
        }
      }
      let state = this.viewDescriptorsState.get(viewDescriptor.id);
      if (state) {
        if (viewDescriptor.workspace) {
          state.visibleWorkspace = isUndefinedOrNull(addedViewDescriptorState.visible) ? isUndefinedOrNull(state.visibleWorkspace) ? !viewDescriptor.hideByDefault : state.visibleWorkspace : addedViewDescriptorState.visible;
        } else {
          const isVisible = state.visibleGlobal;
          state.visibleGlobal = isUndefinedOrNull(addedViewDescriptorState.visible) ? isUndefinedOrNull(state.visibleGlobal) ? !viewDescriptor.hideByDefault : state.visibleGlobal : addedViewDescriptorState.visible;
          if (state.visibleGlobal && !isVisible) {
            this.logger.value.trace(`Added view ${viewDescriptor.id} in the container ${this.viewContainer.id} and showing it.`, `${isVisible}`, `${viewDescriptor.hideByDefault}`, `${addedViewDescriptorState.visible}`);
          }
        }
        state.collapsed = isUndefinedOrNull(addedViewDescriptorState.collapsed) ? isUndefinedOrNull(state.collapsed) ? !!viewDescriptor.collapsed : state.collapsed : addedViewDescriptorState.collapsed;
      } else {
        state = {
          active: false,
          visibleGlobal: isUndefinedOrNull(addedViewDescriptorState.visible) ? !viewDescriptor.hideByDefault : addedViewDescriptorState.visible,
          visibleWorkspace: isUndefinedOrNull(addedViewDescriptorState.visible) ? !viewDescriptor.hideByDefault : addedViewDescriptorState.visible,
          collapsed: isUndefinedOrNull(addedViewDescriptorState.collapsed) ? !!viewDescriptor.collapsed : addedViewDescriptorState.collapsed
        };
      }
      this.viewDescriptorsState.set(viewDescriptor.id, state);
      state.active = this.contextKeyService.contextMatchesRules(viewDescriptor.when);
      addedItems.push({ viewDescriptor, state });
    }
    this.viewDescriptorItems.push(...addedItems);
    this.viewDescriptorItems.sort(this.compareViewDescriptors.bind(this));
    this._onDidChangeAllViewDescriptors.fire({ added: addedItems.map(({ viewDescriptor }) => viewDescriptor), removed: [] });
    const addedActiveItems = [];
    for (const viewDescriptorItem of addedItems) {
      if (viewDescriptorItem.state.active) {
        addedActiveItems.push({ viewDescriptorItem, visible: this.isViewDescriptorVisible(viewDescriptorItem) });
      }
    }
    if (addedActiveItems.length) {
      this._onDidChangeActiveViewDescriptors.fire({ added: addedActiveItems.map(({ viewDescriptorItem }) => viewDescriptorItem.viewDescriptor), removed: [] });
    }
    const addedVisibleDescriptors = [];
    for (const { viewDescriptorItem, visible } of addedActiveItems) {
      if (visible && this.isViewDescriptorVisible(viewDescriptorItem)) {
        const { visibleIndex } = this.find(viewDescriptorItem.viewDescriptor.id);
        addedVisibleDescriptors.push({ index: visibleIndex, viewDescriptor: viewDescriptorItem.viewDescriptor, size: viewDescriptorItem.state.size, collapsed: !!viewDescriptorItem.state.collapsed });
      }
    }
    this.broadCastAddedVisibleViewDescriptors(addedVisibleDescriptors);
  }
  remove(viewDescriptors) {
    const removed = [];
    const removedItems = [];
    const removedActiveDescriptors = [];
    const removedVisibleDescriptors = [];
    for (const viewDescriptor of viewDescriptors) {
      if (viewDescriptor.when) {
        for (const key of viewDescriptor.when.keys()) {
          this.contextKeys.delete(key);
        }
      }
      const index = this.viewDescriptorItems.findIndex((i) => i.viewDescriptor.id === viewDescriptor.id);
      if (index !== -1) {
        removed.push(viewDescriptor);
        const viewDescriptorItem = this.viewDescriptorItems[index];
        if (viewDescriptorItem.state.active) {
          removedActiveDescriptors.push(viewDescriptorItem.viewDescriptor);
        }
        if (this.isViewDescriptorVisible(viewDescriptorItem)) {
          const { visibleIndex } = this.find(viewDescriptorItem.viewDescriptor.id);
          removedVisibleDescriptors.push({ index: visibleIndex, viewDescriptor: viewDescriptorItem.viewDescriptor });
        }
        removedItems.push(viewDescriptorItem);
      }
    }
    removedItems.forEach((item) => this.viewDescriptorItems.splice(this.viewDescriptorItems.indexOf(item), 1));
    this.broadCastRemovedVisibleViewDescriptors(removedVisibleDescriptors);
    if (removedActiveDescriptors.length) {
      this._onDidChangeActiveViewDescriptors.fire({ added: [], removed: removedActiveDescriptors });
    }
    if (removed.length) {
      this._onDidChangeAllViewDescriptors.fire({ added: [], removed });
    }
  }
  onDidChangeContext() {
    const addedActiveItems = [];
    const removedActiveItems = [];
    for (const item of this.viewDescriptorItems) {
      const wasActive = item.state.active;
      const isActive = this.contextKeyService.contextMatchesRules(item.viewDescriptor.when);
      if (wasActive !== isActive) {
        if (isActive) {
          addedActiveItems.push({ item, visibleWhenActive: this.isViewDescriptorVisibleWhenActive(item) });
        } else {
          removedActiveItems.push(item);
        }
      }
    }
    const removedVisibleDescriptors = [];
    for (const item of removedActiveItems) {
      if (this.isViewDescriptorVisible(item)) {
        const { visibleIndex } = this.find(item.viewDescriptor.id);
        removedVisibleDescriptors.push({ index: visibleIndex, viewDescriptor: item.viewDescriptor });
      }
    }
    removedActiveItems.forEach((item) => item.state.active = false);
    addedActiveItems.forEach(({ item }) => item.state.active = true);
    this.broadCastRemovedVisibleViewDescriptors(removedVisibleDescriptors);
    if (addedActiveItems.length || removedActiveItems.length) {
      this._onDidChangeActiveViewDescriptors.fire({ added: addedActiveItems.map(({ item }) => item.viewDescriptor), removed: removedActiveItems.map((item) => item.viewDescriptor) });
    }
    const addedVisibleDescriptors = [];
    for (const { item, visibleWhenActive } of addedActiveItems) {
      if (visibleWhenActive && this.isViewDescriptorVisible(item)) {
        const { visibleIndex } = this.find(item.viewDescriptor.id);
        addedVisibleDescriptors.push({ index: visibleIndex, viewDescriptor: item.viewDescriptor, size: item.state.size, collapsed: !!item.state.collapsed });
      }
    }
    this.broadCastAddedVisibleViewDescriptors(addedVisibleDescriptors);
  }
  broadCastAddedVisibleViewDescriptors(added) {
    if (added.length) {
      this._onDidAddVisibleViewDescriptors.fire(added.sort((a, b) => a.index - b.index));
      this.updateState(`Added views:${added.map((v) => v.viewDescriptor.id).join(",")} in ${this.viewContainer.id}`);
    }
  }
  broadCastRemovedVisibleViewDescriptors(removed) {
    if (removed.length) {
      this._onDidRemoveVisibleViewDescriptors.fire(removed.sort((a, b) => b.index - a.index));
      this.updateState(`Removed views:${removed.map((v) => v.viewDescriptor.id).join(",")} from ${this.viewContainer.id}`);
    }
  }
  broadCastMovedViewDescriptors(from, to) {
    this._onDidMoveVisibleViewDescriptors.fire({ from, to });
    this.updateState(`Moved view ${from.viewDescriptor.id} to ${to.viewDescriptor.id} in ${this.viewContainer.id}`);
  }
  updateState(reason) {
    this.logger.value.trace(reason);
    this.viewDescriptorsState.updateState(this.allViewDescriptors);
    this.updateContainerInfo();
  }
  isViewDescriptorVisible(viewDescriptorItem) {
    if (!viewDescriptorItem.state.active) {
      return false;
    }
    return this.isViewDescriptorVisibleWhenActive(viewDescriptorItem);
  }
  isViewDescriptorVisibleWhenActive(viewDescriptorItem) {
    if (viewDescriptorItem.viewDescriptor.workspace) {
      return !!viewDescriptorItem.state.visibleWorkspace;
    }
    return !!viewDescriptorItem.state.visibleGlobal;
  }
  find(id) {
    const result = this.findAndIgnoreIfNotFound(id);
    if (result) {
      return result;
    }
    throw new Error(`view descriptor ${id} not found`);
  }
  findAndIgnoreIfNotFound(id) {
    for (let i = 0, visibleIndex = 0; i < this.viewDescriptorItems.length; i++) {
      const viewDescriptorItem = this.viewDescriptorItems[i];
      if (viewDescriptorItem.viewDescriptor.id === id) {
        return { index: i, visibleIndex, viewDescriptorItem };
      }
      if (this.isViewDescriptorVisible(viewDescriptorItem)) {
        visibleIndex++;
      }
    }
    return void 0;
  }
  compareViewDescriptors(a, b) {
    if (a.viewDescriptor.id === b.viewDescriptor.id) {
      return 0;
    }
    return this.getViewOrder(a) - this.getViewOrder(b) || this.getGroupOrderResult(a.viewDescriptor, b.viewDescriptor);
  }
  getViewOrder(viewDescriptorItem) {
    const viewOrder = typeof viewDescriptorItem.state.order === "number" ? viewDescriptorItem.state.order : viewDescriptorItem.viewDescriptor.order;
    return typeof viewOrder === "number" ? viewOrder : Number.MAX_VALUE;
  }
  getGroupOrderResult(a, b) {
    if (!a.group || !b.group) {
      return 0;
    }
    if (a.group === b.group) {
      return 0;
    }
    return a.group < b.group ? -1 : 1;
  }
};
ViewContainerModel = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, ILoggerService)
], ViewContainerModel);
export {
  ViewContainerModel,
  getViewsStateStorageId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx2aWV3c1xcY29tbW9uXFx2aWV3Q29udGFpbmVyTW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBWaWV3Q29udGFpbmVyLCBJVmlld3NSZWdpc3RyeSwgSVZpZXdEZXNjcmlwdG9yLCBFeHRlbnNpb25zIGFzIFZpZXdFeHRlbnNpb25zLCBJVmlld0NvbnRhaW5lck1vZGVsLCBJQWRkZWRWaWV3RGVzY3JpcHRvclJlZiwgSVZpZXdEZXNjcmlwdG9yUmVmLCBJQWRkZWRWaWV3RGVzY3JpcHRvclN0YXRlLCBkZWZhdWx0Vmlld0ljb24sIFZJRVdTX0xPR19JRCwgVklFV1NfTE9HX05BTUUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlLCBtb3ZlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGlzVW5kZWZpbmVkLCBpc1VuZGVmaW5lZE9yTnVsbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUxvZ2dlciwgSUxvZ2dlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBDb3VudGVyU2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IHdpbmRvd0xvZ0dyb3VwIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2dDb25zdGFudHMuanMnO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Vmlld3NTdGF0ZVN0b3JhZ2VJZCh2aWV3Q29udGFpbmVyU3RvcmFnZUlkOiBzdHJpbmcpOiBzdHJpbmcgeyByZXR1cm4gYCR7dmlld0NvbnRhaW5lclN0b3JhZ2VJZH0uaGlkZGVuYDsgfVxuXG5pbnRlcmZhY2UgSVN0b3JlZFdvcmtzcGFjZVZpZXdTdGF0ZSB7XG5cdGNvbGxhcHNlZDogYm9vbGVhbjtcblx0aXNIaWRkZW46IGJvb2xlYW47XG5cdHNpemU/OiBudW1iZXI7XG5cdG9yZGVyPzogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSVN0b3JlZEdsb2JhbFZpZXdTdGF0ZSB7XG5cdGlkOiBzdHJpbmc7XG5cdGlzSGlkZGVuOiBib29sZWFuO1xuXHRvcmRlcj86IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIElWaWV3RGVzY3JpcHRvclN0YXRlIHtcblx0dmlzaWJsZUdsb2JhbDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0dmlzaWJsZVdvcmtzcGFjZTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0Y29sbGFwc2VkOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRhY3RpdmU6IGJvb2xlYW47XG5cdG9yZGVyPzogbnVtYmVyO1xuXHRzaXplPzogbnVtYmVyO1xufVxuXG5jbGFzcyBWaWV3RGVzY3JpcHRvcnNTdGF0ZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVmlld3NTdGF0ZVN0b3JhZ2VJZDogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IGdsb2JhbFZpZXdzU3RhdGVTdG9yYWdlSWQ6IHN0cmluZztcblx0cHJpdmF0ZSByZWFkb25seSBzdGF0ZTogTWFwPHN0cmluZywgSVZpZXdEZXNjcmlwdG9yU3RhdGU+O1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlU3RvcmVkU3RhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGlkOiBzdHJpbmc7IHZpc2libGU6IGJvb2xlYW4gfVtdPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTdG9yZWRTdGF0ZSA9IHRoaXMuX29uRGlkQ2hhbmdlU3RvcmVkU3RhdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBsb2dnZXI6IExhenk8SUxvZ2dlcj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dmlld0NvbnRhaW5lclN0b3JhZ2VJZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmlld0NvbnRhaW5lck5hbWU6IHN0cmluZyxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUxvZ2dlclNlcnZpY2UgbG9nZ2VyU2VydmljZTogSUxvZ2dlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmxvZ2dlciA9IG5ldyBMYXp5KCgpID0+IGxvZ2dlclNlcnZpY2UuY3JlYXRlTG9nZ2VyKFZJRVdTX0xPR19JRCwgeyBuYW1lOiBWSUVXU19MT0dfTkFNRSwgZ3JvdXA6IHdpbmRvd0xvZ0dyb3VwIH0pKTtcblxuXHRcdHRoaXMuZ2xvYmFsVmlld3NTdGF0ZVN0b3JhZ2VJZCA9IGdldFZpZXdzU3RhdGVTdG9yYWdlSWQodmlld0NvbnRhaW5lclN0b3JhZ2VJZCk7XG5cdFx0dGhpcy53b3Jrc3BhY2VWaWV3c1N0YXRlU3RvcmFnZUlkID0gdmlld0NvbnRhaW5lclN0b3JhZ2VJZDtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLlBST0ZJTEUsIHRoaXMuZ2xvYmFsVmlld3NTdGF0ZVN0b3JhZ2VJZCwgdGhpcy5fc3RvcmUpKCgpID0+IHRoaXMub25EaWRTdG9yYWdlQ2hhbmdlKCkpKTtcblxuXHRcdHRoaXMuc3RhdGUgPSB0aGlzLmluaXRpYWxpemUoKTtcblxuXHR9XG5cblx0c2V0KGlkOiBzdHJpbmcsIHN0YXRlOiBJVmlld0Rlc2NyaXB0b3JTdGF0ZSk6IHZvaWQge1xuXHRcdHRoaXMuc3RhdGUuc2V0KGlkLCBzdGF0ZSk7XG5cdH1cblxuXHRnZXQoaWQ6IHN0cmluZyk6IElWaWV3RGVzY3JpcHRvclN0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5zdGF0ZS5nZXQoaWQpO1xuXHR9XG5cblx0dXBkYXRlU3RhdGUodmlld0Rlc2NyaXB0b3JzOiBSZWFkb25seUFycmF5PElWaWV3RGVzY3JpcHRvcj4pOiB2b2lkIHtcblx0XHR0aGlzLnVwZGF0ZVdvcmtzcGFjZVN0YXRlKHZpZXdEZXNjcmlwdG9ycyk7XG5cdFx0dGhpcy51cGRhdGVHbG9iYWxTdGF0ZSh2aWV3RGVzY3JpcHRvcnMpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVXb3Jrc3BhY2VTdGF0ZSh2aWV3RGVzY3JpcHRvcnM6IFJlYWRvbmx5QXJyYXk8SVZpZXdEZXNjcmlwdG9yPik6IHZvaWQge1xuXHRcdGNvbnN0IHN0b3JlZFZpZXdzU3RhdGVzID0gdGhpcy5nZXRTdG9yZWRXb3Jrc3BhY2VTdGF0ZSgpO1xuXHRcdGZvciAoY29uc3Qgdmlld0Rlc2NyaXB0b3Igb2Ygdmlld0Rlc2NyaXB0b3JzKSB7XG5cdFx0XHRjb25zdCB2aWV3U3RhdGUgPSB0aGlzLmdldCh2aWV3RGVzY3JpcHRvci5pZCk7XG5cdFx0XHRpZiAodmlld1N0YXRlKSB7XG5cdFx0XHRcdHN0b3JlZFZpZXdzU3RhdGVzW3ZpZXdEZXNjcmlwdG9yLmlkXSA9IHtcblx0XHRcdFx0XHRjb2xsYXBzZWQ6ICEhdmlld1N0YXRlLmNvbGxhcHNlZCxcblx0XHRcdFx0XHRpc0hpZGRlbjogIXZpZXdTdGF0ZS52aXNpYmxlV29ya3NwYWNlLFxuXHRcdFx0XHRcdHNpemU6IHZpZXdTdGF0ZS5zaXplLFxuXHRcdFx0XHRcdG9yZGVyOiB2aWV3RGVzY3JpcHRvci53b3Jrc3BhY2UgJiYgdmlld1N0YXRlID8gdmlld1N0YXRlLm9yZGVyIDogdW5kZWZpbmVkXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKE9iamVjdC5rZXlzKHN0b3JlZFZpZXdzU3RhdGVzKS5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHRoaXMud29ya3NwYWNlVmlld3NTdGF0ZVN0b3JhZ2VJZCwgSlNPTi5zdHJpbmdpZnkoc3RvcmVkVmlld3NTdGF0ZXMpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZSh0aGlzLndvcmtzcGFjZVZpZXdzU3RhdGVTdG9yYWdlSWQsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlR2xvYmFsU3RhdGUodmlld0Rlc2NyaXB0b3JzOiBSZWFkb25seUFycmF5PElWaWV3RGVzY3JpcHRvcj4pOiB2b2lkIHtcblx0XHRjb25zdCBzdG9yZWRHbG9iYWxTdGF0ZSA9IHRoaXMuZ2V0U3RvcmVkR2xvYmFsU3RhdGUoKTtcblx0XHRmb3IgKGNvbnN0IHZpZXdEZXNjcmlwdG9yIG9mIHZpZXdEZXNjcmlwdG9ycykge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLmdldCh2aWV3RGVzY3JpcHRvci5pZCk7XG5cdFx0XHRzdG9yZWRHbG9iYWxTdGF0ZS5zZXQodmlld0Rlc2NyaXB0b3IuaWQsIHtcblx0XHRcdFx0aWQ6IHZpZXdEZXNjcmlwdG9yLmlkLFxuXHRcdFx0XHRpc0hpZGRlbjogc3RhdGUgJiYgdmlld0Rlc2NyaXB0b3IuY2FuVG9nZ2xlVmlzaWJpbGl0eSA/ICFzdGF0ZS52aXNpYmxlR2xvYmFsIDogZmFsc2UsXG5cdFx0XHRcdG9yZGVyOiAhdmlld0Rlc2NyaXB0b3Iud29ya3NwYWNlICYmIHN0YXRlID8gc3RhdGUub3JkZXIgOiB1bmRlZmluZWRcblx0XHRcdH0pO1xuXHRcdH1cblx0XHR0aGlzLnNldFN0b3JlZEdsb2JhbFN0YXRlKHN0b3JlZEdsb2JhbFN0YXRlKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRTdG9yYWdlQ2hhbmdlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmdsb2JhbFZpZXdzU3RhdGVzVmFsdWUgIT09IHRoaXMuZ2V0U3RvcmVkR2xvYmFsVmlld3NTdGF0ZXNWYWx1ZSgpIC8qIFRoaXMgY2hlY2tzIGlmIGN1cnJlbnQgd2luZG93IGNoYW5nZWQgdGhlIHZhbHVlIG9yIG5vdCAqLykge1xuXHRcdFx0dGhpcy5fZ2xvYmFsVmlld3NTdGF0ZXNWYWx1ZSA9IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHN0b3JlZFZpZXdzVmlzaWJpbGl0eVN0YXRlcyA9IHRoaXMuZ2V0U3RvcmVkR2xvYmFsU3RhdGUoKTtcblx0XHRcdGNvbnN0IHN0b3JlZFdvcmtzcGFjZVZpZXdzU3RhdGVzID0gdGhpcy5nZXRTdG9yZWRXb3Jrc3BhY2VTdGF0ZSgpO1xuXHRcdFx0Y29uc3QgY2hhbmdlZFN0YXRlczogeyBpZDogc3RyaW5nOyB2aXNpYmxlOiBib29sZWFuIH1bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBbaWQsIHN0b3JlZFN0YXRlXSBvZiBzdG9yZWRWaWV3c1Zpc2liaWxpdHlTdGF0ZXMpIHtcblx0XHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLmdldChpZCk7XG5cdFx0XHRcdGlmIChzdGF0ZSkge1xuXHRcdFx0XHRcdGlmIChzdGF0ZS52aXNpYmxlR2xvYmFsICE9PSAhc3RvcmVkU3RhdGUuaXNIaWRkZW4pIHtcblx0XHRcdFx0XHRcdGlmICghc3RvcmVkU3RhdGUuaXNIaWRkZW4pIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5sb2dnZXIudmFsdWUudHJhY2UoYFZpZXcgdmlzaWJpbGl0eSBzdGF0ZSBjaGFuZ2VkOiAke2lkfSBpcyBub3cgdmlzaWJsZWAsIHRoaXMudmlld0NvbnRhaW5lck5hbWUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y2hhbmdlZFN0YXRlcy5wdXNoKHsgaWQsIHZpc2libGU6ICFzdG9yZWRTdGF0ZS5pc0hpZGRlbiB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlVmlld1N0YXRlOiBJU3RvcmVkV29ya3NwYWNlVmlld1N0YXRlIHwgdW5kZWZpbmVkID0gc3RvcmVkV29ya3NwYWNlVmlld3NTdGF0ZXNbaWRdO1xuXHRcdFx0XHRcdHRoaXMuc2V0KGlkLCB7XG5cdFx0XHRcdFx0XHRhY3RpdmU6IGZhbHNlLFxuXHRcdFx0XHRcdFx0dmlzaWJsZUdsb2JhbDogIXN0b3JlZFN0YXRlLmlzSGlkZGVuLFxuXHRcdFx0XHRcdFx0dmlzaWJsZVdvcmtzcGFjZTogaXNVbmRlZmluZWQod29ya3NwYWNlVmlld1N0YXRlPy5pc0hpZGRlbikgPyB1bmRlZmluZWQgOiAhd29ya3NwYWNlVmlld1N0YXRlPy5pc0hpZGRlbixcblx0XHRcdFx0XHRcdGNvbGxhcHNlZDogd29ya3NwYWNlVmlld1N0YXRlPy5jb2xsYXBzZWQsXG5cdFx0XHRcdFx0XHRvcmRlcjogd29ya3NwYWNlVmlld1N0YXRlPy5vcmRlcixcblx0XHRcdFx0XHRcdHNpemU6IHdvcmtzcGFjZVZpZXdTdGF0ZT8uc2l6ZSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGNoYW5nZWRTdGF0ZXMubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RvcmVkU3RhdGUuZmlyZShjaGFuZ2VkU3RhdGVzKTtcblx0XHRcdFx0Ly8gVXBkYXRlIHRoZSBpbiBtZW1vcnkgc3RhdGUgYWZ0ZXIgZmlyaW5nIHRoZSBldmVudFxuXHRcdFx0XHQvLyBzbyB0aGF0IHRoZSB2aWV3cyBjYW4gdXBkYXRlIHRoZWlyIHN0YXRlIGFjY29yZGluZ2x5XG5cdFx0XHRcdGZvciAoY29uc3QgY2hhbmdlZFN0YXRlIG9mIGNoYW5nZWRTdGF0ZXMpIHtcblx0XHRcdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuZ2V0KGNoYW5nZWRTdGF0ZS5pZCk7XG5cdFx0XHRcdFx0aWYgKHN0YXRlKSB7XG5cdFx0XHRcdFx0XHRzdGF0ZS52aXNpYmxlR2xvYmFsID0gY2hhbmdlZFN0YXRlLnZpc2libGU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBpbml0aWFsaXplKCk6IE1hcDxzdHJpbmcsIElWaWV3RGVzY3JpcHRvclN0YXRlPiB7XG5cdFx0Y29uc3Qgdmlld1N0YXRlcyA9IG5ldyBNYXA8c3RyaW5nLCBJVmlld0Rlc2NyaXB0b3JTdGF0ZT4oKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VWaWV3c1N0YXRlcyA9IHRoaXMuZ2V0U3RvcmVkV29ya3NwYWNlU3RhdGUoKTtcblx0XHRmb3IgKGNvbnN0IGlkIG9mIE9iamVjdC5rZXlzKHdvcmtzcGFjZVZpZXdzU3RhdGVzKSkge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlVmlld1N0YXRlID0gd29ya3NwYWNlVmlld3NTdGF0ZXNbaWRdO1xuXHRcdFx0dmlld1N0YXRlcy5zZXQoaWQsIHtcblx0XHRcdFx0YWN0aXZlOiBmYWxzZSxcblx0XHRcdFx0dmlzaWJsZUdsb2JhbDogdW5kZWZpbmVkLFxuXHRcdFx0XHR2aXNpYmxlV29ya3NwYWNlOiBpc1VuZGVmaW5lZCh3b3Jrc3BhY2VWaWV3U3RhdGUuaXNIaWRkZW4pID8gdW5kZWZpbmVkIDogIXdvcmtzcGFjZVZpZXdTdGF0ZS5pc0hpZGRlbixcblx0XHRcdFx0Y29sbGFwc2VkOiB3b3Jrc3BhY2VWaWV3U3RhdGUuY29sbGFwc2VkLFxuXHRcdFx0XHRvcmRlcjogd29ya3NwYWNlVmlld1N0YXRlLm9yZGVyLFxuXHRcdFx0XHRzaXplOiB3b3Jrc3BhY2VWaWV3U3RhdGUuc2l6ZSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIE1pZ3JhdGUgdG8gYHZpZXdsZXRTdGF0ZVN0b3JhZ2VJZGBcblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KHRoaXMuZ2xvYmFsVmlld3NTdGF0ZVN0b3JhZ2VJZCwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgJ1tdJyk7XG5cdFx0Y29uc3QgeyBzdGF0ZTogd29ya3NwYWNlVmlzaWJpbGl0eVN0YXRlcyB9ID0gdGhpcy5wYXJzZVN0b3JlZEdsb2JhbFN0YXRlKHZhbHVlKTtcblx0XHRpZiAod29ya3NwYWNlVmlzaWJpbGl0eVN0YXRlcy5zaXplID4gMCkge1xuXHRcdFx0Zm9yIChjb25zdCB7IGlkLCBpc0hpZGRlbiB9IG9mIHdvcmtzcGFjZVZpc2liaWxpdHlTdGF0ZXMudmFsdWVzKCkpIHtcblx0XHRcdFx0Y29uc3Qgdmlld1N0YXRlID0gdmlld1N0YXRlcy5nZXQoaWQpO1xuXHRcdFx0XHQvLyBOb3QgbWlncmF0ZWQgdG8gYHZpZXdsZXRTdGF0ZVN0b3JhZ2VJZGBcblx0XHRcdFx0aWYgKHZpZXdTdGF0ZSkge1xuXHRcdFx0XHRcdGlmIChpc1VuZGVmaW5lZCh2aWV3U3RhdGUudmlzaWJsZVdvcmtzcGFjZSkpIHtcblx0XHRcdFx0XHRcdHZpZXdTdGF0ZS52aXNpYmxlV29ya3NwYWNlID0gIWlzSGlkZGVuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR2aWV3U3RhdGVzLnNldChpZCwge1xuXHRcdFx0XHRcdFx0YWN0aXZlOiBmYWxzZSxcblx0XHRcdFx0XHRcdGNvbGxhcHNlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0dmlzaWJsZUdsb2JhbDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0dmlzaWJsZVdvcmtzcGFjZTogIWlzSGlkZGVuLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZSh0aGlzLmdsb2JhbFZpZXdzU3RhdGVTdG9yYWdlSWQsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgc3RhdGUsIGhhc0R1cGxpY2F0ZXMgfSA9IHRoaXMucGFyc2VTdG9yZWRHbG9iYWxTdGF0ZSh0aGlzLmdsb2JhbFZpZXdzU3RhdGVzVmFsdWUpO1xuXHRcdGlmIChoYXNEdXBsaWNhdGVzKSB7XG5cdFx0XHR0aGlzLnNldFN0b3JlZEdsb2JhbFN0YXRlKHN0YXRlKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCB7IGlkLCBpc0hpZGRlbiwgb3JkZXIgfSBvZiBzdGF0ZS52YWx1ZXMoKSkge1xuXHRcdFx0Y29uc3Qgdmlld1N0YXRlID0gdmlld1N0YXRlcy5nZXQoaWQpO1xuXHRcdFx0aWYgKHZpZXdTdGF0ZSkge1xuXHRcdFx0XHR2aWV3U3RhdGUudmlzaWJsZUdsb2JhbCA9ICFpc0hpZGRlbjtcblx0XHRcdFx0aWYgKCFpc1VuZGVmaW5lZChvcmRlcikpIHtcblx0XHRcdFx0XHR2aWV3U3RhdGUub3JkZXIgPSBvcmRlcjtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dmlld1N0YXRlcy5zZXQoaWQsIHtcblx0XHRcdFx0XHRhY3RpdmU6IGZhbHNlLFxuXHRcdFx0XHRcdHZpc2libGVHbG9iYWw6ICFpc0hpZGRlbixcblx0XHRcdFx0XHRvcmRlcixcblx0XHRcdFx0XHRjb2xsYXBzZWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR2aXNpYmxlV29ya3NwYWNlOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdmlld1N0YXRlcztcblx0fVxuXG5cdHByaXZhdGUgZ2V0U3RvcmVkV29ya3NwYWNlU3RhdGUoKTogSVN0cmluZ0RpY3Rpb25hcnk8SVN0b3JlZFdvcmtzcGFjZVZpZXdTdGF0ZT4ge1xuXHRcdHJldHVybiBKU09OLnBhcnNlKHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KHRoaXMud29ya3NwYWNlVmlld3NTdGF0ZVN0b3JhZ2VJZCwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgJ3t9JykpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTdG9yZWRHbG9iYWxTdGF0ZSgpOiBNYXA8c3RyaW5nLCBJU3RvcmVkR2xvYmFsVmlld1N0YXRlPiB7XG5cdFx0cmV0dXJuIHRoaXMucGFyc2VTdG9yZWRHbG9iYWxTdGF0ZSh0aGlzLmdsb2JhbFZpZXdzU3RhdGVzVmFsdWUpLnN0YXRlO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRTdG9yZWRHbG9iYWxTdGF0ZShzdG9yZWRHbG9iYWxTdGF0ZTogTWFwPHN0cmluZywgSVN0b3JlZEdsb2JhbFZpZXdTdGF0ZT4pOiB2b2lkIHtcblx0XHR0aGlzLmdsb2JhbFZpZXdzU3RhdGVzVmFsdWUgPSBKU09OLnN0cmluZ2lmeShbLi4uc3RvcmVkR2xvYmFsU3RhdGUudmFsdWVzKCldKTtcblx0fVxuXG5cdHByaXZhdGUgcGFyc2VTdG9yZWRHbG9iYWxTdGF0ZSh2YWx1ZTogc3RyaW5nKTogeyBzdGF0ZTogTWFwPHN0cmluZywgSVN0b3JlZEdsb2JhbFZpZXdTdGF0ZT47IGhhc0R1cGxpY2F0ZXM6IGJvb2xlYW4gfSB7XG5cdFx0Y29uc3Qgc3RvcmVkVmFsdWU6IEFycmF5PHN0cmluZyB8IElTdG9yZWRHbG9iYWxWaWV3U3RhdGU+ID0gSlNPTi5wYXJzZSh2YWx1ZSk7XG5cdFx0bGV0IGhhc0R1cGxpY2F0ZXMgPSBmYWxzZTtcblx0XHRjb25zdCBzdGF0ZSA9IHN0b3JlZFZhbHVlLnJlZHVjZSgocmVzdWx0LCBzdG9yZWRTdGF0ZSkgPT4ge1xuXHRcdFx0aWYgKHR5cGVvZiBzdG9yZWRTdGF0ZSA9PT0gJ3N0cmluZycgLyogbWlncmF0aW9uICovKSB7XG5cdFx0XHRcdGhhc0R1cGxpY2F0ZXMgPSBoYXNEdXBsaWNhdGVzIHx8IHJlc3VsdC5oYXMoc3RvcmVkU3RhdGUpO1xuXHRcdFx0XHRyZXN1bHQuc2V0KHN0b3JlZFN0YXRlLCB7IGlkOiBzdG9yZWRTdGF0ZSwgaXNIaWRkZW46IHRydWUgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRoYXNEdXBsaWNhdGVzID0gaGFzRHVwbGljYXRlcyB8fCByZXN1bHQuaGFzKHN0b3JlZFN0YXRlLmlkKTtcblx0XHRcdFx0cmVzdWx0LnNldChzdG9yZWRTdGF0ZS5pZCwgc3RvcmVkU3RhdGUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9LCBuZXcgTWFwPHN0cmluZywgSVN0b3JlZEdsb2JhbFZpZXdTdGF0ZT4oKSk7XG5cdFx0cmV0dXJuIHsgc3RhdGUsIGhhc0R1cGxpY2F0ZXMgfTtcblx0fVxuXG5cdHByaXZhdGUgX2dsb2JhbFZpZXdzU3RhdGVzVmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBnZXQgZ2xvYmFsVmlld3NTdGF0ZXNWYWx1ZSgpOiBzdHJpbmcge1xuXHRcdGlmICghdGhpcy5fZ2xvYmFsVmlld3NTdGF0ZXNWYWx1ZSkge1xuXHRcdFx0dGhpcy5fZ2xvYmFsVmlld3NTdGF0ZXNWYWx1ZSA9IHRoaXMuZ2V0U3RvcmVkR2xvYmFsVmlld3NTdGF0ZXNWYWx1ZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9nbG9iYWxWaWV3c1N0YXRlc1ZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXQgZ2xvYmFsVmlld3NTdGF0ZXNWYWx1ZShnbG9iYWxWaWV3c1N0YXRlc1ZhbHVlOiBzdHJpbmcpIHtcblx0XHRpZiAodGhpcy5nbG9iYWxWaWV3c1N0YXRlc1ZhbHVlICE9PSBnbG9iYWxWaWV3c1N0YXRlc1ZhbHVlKSB7XG5cdFx0XHR0aGlzLl9nbG9iYWxWaWV3c1N0YXRlc1ZhbHVlID0gZ2xvYmFsVmlld3NTdGF0ZXNWYWx1ZTtcblx0XHRcdHRoaXMuc2V0U3RvcmVkR2xvYmFsVmlld3NTdGF0ZXNWYWx1ZShnbG9iYWxWaWV3c1N0YXRlc1ZhbHVlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFN0b3JlZEdsb2JhbFZpZXdzU3RhdGVzVmFsdWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQodGhpcy5nbG9iYWxWaWV3c1N0YXRlU3RvcmFnZUlkLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgJ1tdJyk7XG5cdH1cblxuXHRwcml2YXRlIHNldFN0b3JlZEdsb2JhbFZpZXdzU3RhdGVzVmFsdWUodmFsdWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUodGhpcy5nbG9iYWxWaWV3c1N0YXRlU3RvcmFnZUlkLCB2YWx1ZSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdH1cblxufVxuXG5pbnRlcmZhY2UgSVZpZXdEZXNjcmlwdG9ySXRlbSB7XG5cdHZpZXdEZXNjcmlwdG9yOiBJVmlld0Rlc2NyaXB0b3I7XG5cdHN0YXRlOiBJVmlld0Rlc2NyaXB0b3JTdGF0ZTtcbn1cblxuZXhwb3J0IGNsYXNzIFZpZXdDb250YWluZXJNb2RlbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVmlld0NvbnRhaW5lck1vZGVsIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlzID0gbmV3IENvdW50ZXJTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIHZpZXdEZXNjcmlwdG9ySXRlbXM6IElWaWV3RGVzY3JpcHRvckl0ZW1bXSA9IFtdO1xuXHRwcml2YXRlIHZpZXdEZXNjcmlwdG9yc1N0YXRlOiBWaWV3RGVzY3JpcHRvcnNTdGF0ZTtcblxuXHQvLyBDb250YWluZXIgSW5mb1xuXHRwcml2YXRlIF90aXRsZSE6IHN0cmluZztcblx0Z2V0IHRpdGxlKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLl90aXRsZTsgfVxuXG5cdHByaXZhdGUgX2ljb246IFVSSSB8IFRoZW1lSWNvbiB8IHVuZGVmaW5lZDtcblx0Z2V0IGljb24oKTogVVJJIHwgVGhlbWVJY29uIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2ljb247IH1cblxuXHRwcml2YXRlIF9rZXliaW5kaW5nSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Z2V0IGtleWJpbmRpbmdJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fa2V5YmluZGluZ0lkOyB9XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VDb250YWluZXJJbmZvID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyB0aXRsZT86IGJvb2xlYW47IGljb24/OiBib29sZWFuOyBrZXliaW5kaW5nSWQ/OiBib29sZWFuIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbnRhaW5lckluZm8gPSB0aGlzLl9vbkRpZENoYW5nZUNvbnRhaW5lckluZm8uZXZlbnQ7XG5cblx0Ly8gQWxsIFZpZXcgRGVzY3JpcHRvcnNcblx0Z2V0IGFsbFZpZXdEZXNjcmlwdG9ycygpOiBSZWFkb25seUFycmF5PElWaWV3RGVzY3JpcHRvcj4geyByZXR1cm4gdGhpcy52aWV3RGVzY3JpcHRvckl0ZW1zLm1hcChpdGVtID0+IGl0ZW0udmlld0Rlc2NyaXB0b3IpOyB9XG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlQWxsVmlld0Rlc2NyaXB0b3JzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBhZGRlZDogUmVhZG9ubHlBcnJheTxJVmlld0Rlc2NyaXB0b3I+OyByZW1vdmVkOiBSZWFkb25seUFycmF5PElWaWV3RGVzY3JpcHRvcj4gfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWxsVmlld0Rlc2NyaXB0b3JzID0gdGhpcy5fb25EaWRDaGFuZ2VBbGxWaWV3RGVzY3JpcHRvcnMuZXZlbnQ7XG5cblx0Ly8gQWN0aXZlIFZpZXcgRGVzY3JpcHRvcnNcblx0Z2V0IGFjdGl2ZVZpZXdEZXNjcmlwdG9ycygpOiBSZWFkb25seUFycmF5PElWaWV3RGVzY3JpcHRvcj4geyByZXR1cm4gdGhpcy52aWV3RGVzY3JpcHRvckl0ZW1zLmZpbHRlcihpdGVtID0+IGl0ZW0uc3RhdGUuYWN0aXZlKS5tYXAoaXRlbSA9PiBpdGVtLnZpZXdEZXNjcmlwdG9yKTsgfVxuXHRwcml2YXRlIF9vbkRpZENoYW5nZUFjdGl2ZVZpZXdEZXNjcmlwdG9ycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgYWRkZWQ6IFJlYWRvbmx5QXJyYXk8SVZpZXdEZXNjcmlwdG9yPjsgcmVtb3ZlZDogUmVhZG9ubHlBcnJheTxJVmlld0Rlc2NyaXB0b3I+IH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZVZpZXdEZXNjcmlwdG9ycyA9IHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlVmlld0Rlc2NyaXB0b3JzLmV2ZW50O1xuXG5cdC8vIFZpc2libGUgVmlldyBEZXNjcmlwdG9yc1xuXHRnZXQgdmlzaWJsZVZpZXdEZXNjcmlwdG9ycygpOiBSZWFkb25seUFycmF5PElWaWV3RGVzY3JpcHRvcj4geyByZXR1cm4gdGhpcy52aWV3RGVzY3JpcHRvckl0ZW1zLmZpbHRlcihpdGVtID0+IHRoaXMuaXNWaWV3RGVzY3JpcHRvclZpc2libGUoaXRlbSkpLm1hcChpdGVtID0+IGl0ZW0udmlld0Rlc2NyaXB0b3IpOyB9XG5cblx0cHJpdmF0ZSBfb25EaWRBZGRWaXNpYmxlVmlld0Rlc2NyaXB0b3JzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUFkZGVkVmlld0Rlc2NyaXB0b3JSZWZbXT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQWRkVmlzaWJsZVZpZXdEZXNjcmlwdG9yczogRXZlbnQ8SUFkZGVkVmlld0Rlc2NyaXB0b3JSZWZbXT4gPSB0aGlzLl9vbkRpZEFkZFZpc2libGVWaWV3RGVzY3JpcHRvcnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRSZW1vdmVWaXNpYmxlVmlld0Rlc2NyaXB0b3JzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVZpZXdEZXNjcmlwdG9yUmVmW10+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlbW92ZVZpc2libGVWaWV3RGVzY3JpcHRvcnM6IEV2ZW50PElWaWV3RGVzY3JpcHRvclJlZltdPiA9IHRoaXMuX29uRGlkUmVtb3ZlVmlzaWJsZVZpZXdEZXNjcmlwdG9ycy5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZE1vdmVWaXNpYmxlVmlld0Rlc2NyaXB0b3JzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBmcm9tOiBJVmlld0Rlc2NyaXB0b3JSZWY7IHRvOiBJVmlld0Rlc2NyaXB0b3JSZWYgfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkTW92ZVZpc2libGVWaWV3RGVzY3JpcHRvcnM6IEV2ZW50PHsgZnJvbTogSVZpZXdEZXNjcmlwdG9yUmVmOyB0bzogSVZpZXdEZXNjcmlwdG9yUmVmIH0+ID0gdGhpcy5fb25EaWRNb3ZlVmlzaWJsZVZpZXdEZXNjcmlwdG9ycy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGxvZ2dlcjogTGF6eTxJTG9nZ2VyPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSB2aWV3Q29udGFpbmVyOiBWaWV3Q29udGFpbmVyLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUxvZ2dlclNlcnZpY2UgbG9nZ2VyU2VydmljZTogSUxvZ2dlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmxvZ2dlciA9IG5ldyBMYXp5KCgpID0+IGxvZ2dlclNlcnZpY2UuY3JlYXRlTG9nZ2VyKFZJRVdTX0xPR19JRCwgeyBuYW1lOiBWSUVXU19MT0dfTkFNRSwgZ3JvdXA6IHdpbmRvd0xvZ0dyb3VwIH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZpbHRlcihjb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQsIGUgPT4gZS5hZmZlY3RzU29tZSh0aGlzLmNvbnRleHRLZXlzKSkoKCkgPT4gdGhpcy5vbkRpZENoYW5nZUNvbnRleHQoKSkpO1xuXHRcdHRoaXMudmlld0Rlc2NyaXB0b3JzU3RhdGUgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShWaWV3RGVzY3JpcHRvcnNTdGF0ZSwgdmlld0NvbnRhaW5lci5zdG9yYWdlSWQgfHwgYCR7dmlld0NvbnRhaW5lci5pZH0uc3RhdGVgLCB0eXBlb2Ygdmlld0NvbnRhaW5lci50aXRsZSA9PT0gJ3N0cmluZycgPyB2aWV3Q29udGFpbmVyLnRpdGxlIDogdmlld0NvbnRhaW5lci50aXRsZS5vcmlnaW5hbCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudmlld0Rlc2NyaXB0b3JzU3RhdGUub25EaWRDaGFuZ2VTdG9yZWRTdGF0ZShpdGVtcyA9PiB0aGlzLnVwZGF0ZVZpc2liaWxpdHkoaXRlbXMpKSk7XG5cblx0XHR0aGlzLnVwZGF0ZUNvbnRhaW5lckluZm8oKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29udGFpbmVySW5mbygpOiB2b2lkIHtcblx0XHQvKiBVc2UgZGVmYXVsdCBjb250YWluZXIgaW5mbyBpZiBvbmUgb2YgdGhlIHZpc2libGUgdmlldyBkZXNjcmlwdG9ycyBiZWxvbmdzIHRvIHRoZSBjdXJyZW50IGNvbnRhaW5lciBieSBkZWZhdWx0ICovXG5cdFx0Y29uc3QgdXNlRGVmYXVsdENvbnRhaW5lckluZm8gPSB0aGlzLnZpZXdDb250YWluZXIuYWx3YXlzVXNlQ29udGFpbmVySW5mbyB8fCB0aGlzLnZpc2libGVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoID09PSAwIHx8IHRoaXMudmlzaWJsZVZpZXdEZXNjcmlwdG9ycy5zb21lKHYgPT4gUmVnaXN0cnkuYXM8SVZpZXdzUmVnaXN0cnk+KFZpZXdFeHRlbnNpb25zLlZpZXdzUmVnaXN0cnkpLmdldFZpZXdDb250YWluZXIodi5pZCkgPT09IHRoaXMudmlld0NvbnRhaW5lcik7XG5cdFx0Y29uc3QgdGl0bGUgPSB1c2VEZWZhdWx0Q29udGFpbmVySW5mbyA/ICh0eXBlb2YgdGhpcy52aWV3Q29udGFpbmVyLnRpdGxlID09PSAnc3RyaW5nJyA/IHRoaXMudmlld0NvbnRhaW5lci50aXRsZSA6IHRoaXMudmlld0NvbnRhaW5lci50aXRsZS52YWx1ZSkgOiB0aGlzLnZpc2libGVWaWV3RGVzY3JpcHRvcnNbMF0/LmNvbnRhaW5lclRpdGxlIHx8IHRoaXMudmlzaWJsZVZpZXdEZXNjcmlwdG9yc1swXT8ubmFtZT8udmFsdWUgfHwgJyc7XG5cdFx0bGV0IHRpdGxlQ2hhbmdlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRcdGlmICh0aGlzLl90aXRsZSAhPT0gdGl0bGUpIHtcblx0XHRcdHRoaXMuX3RpdGxlID0gdGl0bGU7XG5cdFx0XHR0aXRsZUNoYW5nZWQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGljb24gPSB1c2VEZWZhdWx0Q29udGFpbmVySW5mbyA/IHRoaXMudmlld0NvbnRhaW5lci5pY29uIDogdGhpcy52aXNpYmxlVmlld0Rlc2NyaXB0b3JzWzBdPy5jb250YWluZXJJY29uIHx8IGRlZmF1bHRWaWV3SWNvbjtcblx0XHRsZXQgaWNvbkNoYW5nZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0XHRpZiAoIXRoaXMuaXNFcXVhbEljb24oaWNvbikpIHtcblx0XHRcdHRoaXMuX2ljb24gPSBpY29uO1xuXHRcdFx0aWNvbkNoYW5nZWQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGtleWJpbmRpbmdJZCA9IHRoaXMudmlld0NvbnRhaW5lci5vcGVuQ29tbWFuZEFjdGlvbkRlc2NyaXB0b3I/LmlkID8/IHRoaXMuYWN0aXZlVmlld0Rlc2NyaXB0b3JzLmZpbmQodiA9PiB2Lm9wZW5Db21tYW5kQWN0aW9uRGVzY3JpcHRvcik/Lm9wZW5Db21tYW5kQWN0aW9uRGVzY3JpcHRvcj8uaWQ7XG5cdFx0bGV0IGtleWJpbmRpbmdJZENoYW5nZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0XHRpZiAodGhpcy5fa2V5YmluZGluZ0lkICE9PSBrZXliaW5kaW5nSWQpIHtcblx0XHRcdHRoaXMuX2tleWJpbmRpbmdJZCA9IGtleWJpbmRpbmdJZDtcblx0XHRcdGtleWJpbmRpbmdJZENoYW5nZWQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGlmICh0aXRsZUNoYW5nZWQgfHwgaWNvbkNoYW5nZWQgfHwga2V5YmluZGluZ0lkQ2hhbmdlZCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250YWluZXJJbmZvLmZpcmUoeyB0aXRsZTogdGl0bGVDaGFuZ2VkLCBpY29uOiBpY29uQ2hhbmdlZCwga2V5YmluZGluZ0lkOiBrZXliaW5kaW5nSWRDaGFuZ2VkIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaXNFcXVhbEljb24oaWNvbjogVVJJIHwgVGhlbWVJY29uIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0aWYgKFVSSS5pc1VyaShpY29uKSkge1xuXHRcdFx0cmV0dXJuIFVSSS5pc1VyaSh0aGlzLl9pY29uKSAmJiBpc0VxdWFsKGljb24sIHRoaXMuX2ljb24pO1xuXHRcdH0gZWxzZSBpZiAoVGhlbWVJY29uLmlzVGhlbWVJY29uKGljb24pKSB7XG5cdFx0XHRyZXR1cm4gVGhlbWVJY29uLmlzVGhlbWVJY29uKHRoaXMuX2ljb24pICYmIFRoZW1lSWNvbi5pc0VxdWFsKGljb24sIHRoaXMuX2ljb24pO1xuXHRcdH1cblx0XHRyZXR1cm4gaWNvbiA9PT0gdGhpcy5faWNvbjtcblx0fVxuXG5cdGlzVmlzaWJsZShpZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3JJdGVtID0gdGhpcy52aWV3RGVzY3JpcHRvckl0ZW1zLmZpbmQodiA9PiB2LnZpZXdEZXNjcmlwdG9yLmlkID09PSBpZCk7XG5cdFx0aWYgKCF2aWV3RGVzY3JpcHRvckl0ZW0pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5rbm93biB2aWV3ICR7aWR9YCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmlzVmlld0Rlc2NyaXB0b3JWaXNpYmxlKHZpZXdEZXNjcmlwdG9ySXRlbSk7XG5cdH1cblxuXHRzZXRWaXNpYmxlKGlkOiBzdHJpbmcsIHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLnVwZGF0ZVZpc2liaWxpdHkoW3sgaWQsIHZpc2libGUgfV0pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVWaXNpYmlsaXR5KHZpZXdEZXNjcmlwdG9yczogeyBpZDogc3RyaW5nOyB2aXNpYmxlOiBib29sZWFuIH1bXSk6IHZvaWQge1xuXHRcdC8vIEZpcnN0OiBVcGRhdGUgYW5kIHJlbW92ZSB0aGUgdmlldyBkZXNjcmlwdG9ycyB3aGljaCBhcmUgYXNrZWQgdG8gYmUgaGlkZGVuXG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3JJdGVtc1RvSGlkZSA9IGNvYWxlc2NlKHZpZXdEZXNjcmlwdG9ycy5maWx0ZXIoKHsgdmlzaWJsZSB9KSA9PiAhdmlzaWJsZSlcblx0XHRcdC5tYXAoKHsgaWQgfSkgPT4gdGhpcy5maW5kQW5kSWdub3JlSWZOb3RGb3VuZChpZCkpKTtcblx0XHRjb25zdCByZW1vdmVkOiBJVmlld0Rlc2NyaXB0b3JSZWZbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgeyB2aWV3RGVzY3JpcHRvckl0ZW0sIHZpc2libGVJbmRleCB9IG9mIHZpZXdEZXNjcmlwdG9ySXRlbXNUb0hpZGUpIHtcblx0XHRcdGlmICh0aGlzLnVwZGF0ZVZpZXdEZXNjcmlwdG9ySXRlbVZpc2liaWxpdHkodmlld0Rlc2NyaXB0b3JJdGVtLCBmYWxzZSkpIHtcblx0XHRcdFx0cmVtb3ZlZC5wdXNoKHsgdmlld0Rlc2NyaXB0b3I6IHZpZXdEZXNjcmlwdG9ySXRlbS52aWV3RGVzY3JpcHRvciwgaW5kZXg6IHZpc2libGVJbmRleCB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHJlbW92ZWQubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmJyb2FkQ2FzdFJlbW92ZWRWaXNpYmxlVmlld0Rlc2NyaXB0b3JzKHJlbW92ZWQpO1xuXHRcdH1cblxuXHRcdC8vIFNlY29uZDogVXBkYXRlIGFuZCBhZGQgdGhlIHZpZXcgZGVzY3JpcHRvcnMgd2hpY2ggYXJlIGFza2VkIHRvIGJlIHNob3duXG5cdFx0Y29uc3QgYWRkZWQ6IElBZGRlZFZpZXdEZXNjcmlwdG9yUmVmW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHsgaWQsIHZpc2libGUgfSBvZiB2aWV3RGVzY3JpcHRvcnMpIHtcblx0XHRcdGlmICghdmlzaWJsZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGZvdW5kVmlld0Rlc2NyaXB0b3IgPSB0aGlzLmZpbmRBbmRJZ25vcmVJZk5vdEZvdW5kKGlkKTtcblx0XHRcdGlmICghZm91bmRWaWV3RGVzY3JpcHRvcikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHsgdmlld0Rlc2NyaXB0b3JJdGVtLCB2aXNpYmxlSW5kZXggfSA9IGZvdW5kVmlld0Rlc2NyaXB0b3I7XG5cdFx0XHRpZiAodGhpcy51cGRhdGVWaWV3RGVzY3JpcHRvckl0ZW1WaXNpYmlsaXR5KHZpZXdEZXNjcmlwdG9ySXRlbSwgdHJ1ZSkpIHtcblx0XHRcdFx0YWRkZWQucHVzaCh7IGluZGV4OiB2aXNpYmxlSW5kZXgsIHZpZXdEZXNjcmlwdG9yOiB2aWV3RGVzY3JpcHRvckl0ZW0udmlld0Rlc2NyaXB0b3IsIHNpemU6IHZpZXdEZXNjcmlwdG9ySXRlbS5zdGF0ZS5zaXplLCBjb2xsYXBzZWQ6ICEhdmlld0Rlc2NyaXB0b3JJdGVtLnN0YXRlLmNvbGxhcHNlZCB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGFkZGVkLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5icm9hZENhc3RBZGRlZFZpc2libGVWaWV3RGVzY3JpcHRvcnMoYWRkZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVmlld0Rlc2NyaXB0b3JJdGVtVmlzaWJpbGl0eSh2aWV3RGVzY3JpcHRvckl0ZW06IElWaWV3RGVzY3JpcHRvckl0ZW0sIHZpc2libGU6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRpZiAoIXZpZXdEZXNjcmlwdG9ySXRlbS52aWV3RGVzY3JpcHRvci5jYW5Ub2dnbGVWaXNpYmlsaXR5KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmlzVmlld0Rlc2NyaXB0b3JWaXNpYmxlV2hlbkFjdGl2ZSh2aWV3RGVzY3JpcHRvckl0ZW0pID09PSB2aXNpYmxlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gdXBkYXRlIHZpc2liaWxpdHlcblx0XHRpZiAodmlld0Rlc2NyaXB0b3JJdGVtLnZpZXdEZXNjcmlwdG9yLndvcmtzcGFjZSkge1xuXHRcdFx0dmlld0Rlc2NyaXB0b3JJdGVtLnN0YXRlLnZpc2libGVXb3Jrc3BhY2UgPSB2aXNpYmxlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR2aWV3RGVzY3JpcHRvckl0ZW0uc3RhdGUudmlzaWJsZUdsb2JhbCA9IHZpc2libGU7XG5cdFx0XHRpZiAodmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLmxvZ2dlci52YWx1ZS50cmFjZShgU2hvd2luZyB2aWV3ICR7dmlld0Rlc2NyaXB0b3JJdGVtLnZpZXdEZXNjcmlwdG9yLmlkfSBpbiB0aGUgY29udGFpbmVyICR7dGhpcy52aWV3Q29udGFpbmVyLmlkfWApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHJldHVybiBgdHJ1ZWAgb25seSBpZiB2aXNpYmlsaXR5IGlzIGNoYW5nZWRcblx0XHRyZXR1cm4gdGhpcy5pc1ZpZXdEZXNjcmlwdG9yVmlzaWJsZSh2aWV3RGVzY3JpcHRvckl0ZW0pID09PSB2aXNpYmxlO1xuXHR9XG5cblx0aXNDb2xsYXBzZWQoaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuZmluZChpZCkudmlld0Rlc2NyaXB0b3JJdGVtLnN0YXRlLmNvbGxhcHNlZDtcblx0fVxuXG5cdHNldENvbGxhcHNlZChpZDogc3RyaW5nLCBjb2xsYXBzZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCB7IHZpZXdEZXNjcmlwdG9ySXRlbSB9ID0gdGhpcy5maW5kKGlkKTtcblx0XHRpZiAodmlld0Rlc2NyaXB0b3JJdGVtLnN0YXRlLmNvbGxhcHNlZCAhPT0gY29sbGFwc2VkKSB7XG5cdFx0XHR2aWV3RGVzY3JpcHRvckl0ZW0uc3RhdGUuY29sbGFwc2VkID0gY29sbGFwc2VkO1xuXHRcdH1cblx0XHR0aGlzLnZpZXdEZXNjcmlwdG9yc1N0YXRlLnVwZGF0ZVN0YXRlKHRoaXMuYWxsVmlld0Rlc2NyaXB0b3JzKTtcblx0fVxuXG5cdGdldFNpemUoaWQ6IHN0cmluZyk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZmluZChpZCkudmlld0Rlc2NyaXB0b3JJdGVtLnN0YXRlLnNpemU7XG5cdH1cblxuXHRzZXRTaXplcyhuZXdTaXplczogcmVhZG9ubHkgeyBpZDogc3RyaW5nOyBzaXplOiBudW1iZXIgfVtdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCB7IGlkLCBzaXplIH0gb2YgbmV3U2l6ZXMpIHtcblx0XHRcdGNvbnN0IHsgdmlld0Rlc2NyaXB0b3JJdGVtIH0gPSB0aGlzLmZpbmQoaWQpO1xuXHRcdFx0aWYgKHZpZXdEZXNjcmlwdG9ySXRlbS5zdGF0ZS5zaXplICE9PSBzaXplKSB7XG5cdFx0XHRcdHZpZXdEZXNjcmlwdG9ySXRlbS5zdGF0ZS5zaXplID0gc2l6ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy52aWV3RGVzY3JpcHRvcnNTdGF0ZS51cGRhdGVTdGF0ZSh0aGlzLmFsbFZpZXdEZXNjcmlwdG9ycyk7XG5cdH1cblxuXHRtb3ZlKGZyb206IHN0cmluZywgdG86IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGZyb21JbmRleCA9IHRoaXMudmlld0Rlc2NyaXB0b3JJdGVtcy5maW5kSW5kZXgodiA9PiB2LnZpZXdEZXNjcmlwdG9yLmlkID09PSBmcm9tKTtcblx0XHRjb25zdCB0b0luZGV4ID0gdGhpcy52aWV3RGVzY3JpcHRvckl0ZW1zLmZpbmRJbmRleCh2ID0+IHYudmlld0Rlc2NyaXB0b3IuaWQgPT09IHRvKTtcblxuXHRcdGNvbnN0IGZyb21WaWV3RGVzY3JpcHRvciA9IHRoaXMudmlld0Rlc2NyaXB0b3JJdGVtc1tmcm9tSW5kZXhdO1xuXHRcdGNvbnN0IHRvVmlld0Rlc2NyaXB0b3IgPSB0aGlzLnZpZXdEZXNjcmlwdG9ySXRlbXNbdG9JbmRleF07XG5cblx0XHRtb3ZlKHRoaXMudmlld0Rlc2NyaXB0b3JJdGVtcywgZnJvbUluZGV4LCB0b0luZGV4KTtcblxuXHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCB0aGlzLnZpZXdEZXNjcmlwdG9ySXRlbXMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHR0aGlzLnZpZXdEZXNjcmlwdG9ySXRlbXNbaW5kZXhdLnN0YXRlLm9yZGVyID0gaW5kZXg7XG5cdFx0fVxuXG5cdFx0dGhpcy5icm9hZENhc3RNb3ZlZFZpZXdEZXNjcmlwdG9ycyh7IGluZGV4OiBmcm9tSW5kZXgsIHZpZXdEZXNjcmlwdG9yOiBmcm9tVmlld0Rlc2NyaXB0b3Iudmlld0Rlc2NyaXB0b3IgfSwgeyBpbmRleDogdG9JbmRleCwgdmlld0Rlc2NyaXB0b3I6IHRvVmlld0Rlc2NyaXB0b3Iudmlld0Rlc2NyaXB0b3IgfSk7XG5cdH1cblxuXHRhZGQoYWRkZWRWaWV3RGVzY3JpcHRvclN0YXRlczogSUFkZGVkVmlld0Rlc2NyaXB0b3JTdGF0ZVtdKTogdm9pZCB7XG5cdFx0Y29uc3QgYWRkZWRJdGVtczogSVZpZXdEZXNjcmlwdG9ySXRlbVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBhZGRlZFZpZXdEZXNjcmlwdG9yU3RhdGUgb2YgYWRkZWRWaWV3RGVzY3JpcHRvclN0YXRlcykge1xuXHRcdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3IgPSBhZGRlZFZpZXdEZXNjcmlwdG9yU3RhdGUudmlld0Rlc2NyaXB0b3I7XG5cblx0XHRcdGlmICh2aWV3RGVzY3JpcHRvci53aGVuKSB7XG5cdFx0XHRcdGZvciAoY29uc3Qga2V5IG9mIHZpZXdEZXNjcmlwdG9yLndoZW4ua2V5cygpKSB7XG5cdFx0XHRcdFx0dGhpcy5jb250ZXh0S2V5cy5hZGQoa2V5KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRsZXQgc3RhdGUgPSB0aGlzLnZpZXdEZXNjcmlwdG9yc1N0YXRlLmdldCh2aWV3RGVzY3JpcHRvci5pZCk7XG5cdFx0XHRpZiAoc3RhdGUpIHtcblx0XHRcdFx0Ly8gc2V0IGRlZmF1bHRzIGlmIG5vdCBzZXRcblx0XHRcdFx0aWYgKHZpZXdEZXNjcmlwdG9yLndvcmtzcGFjZSkge1xuXHRcdFx0XHRcdHN0YXRlLnZpc2libGVXb3Jrc3BhY2UgPSBpc1VuZGVmaW5lZE9yTnVsbChhZGRlZFZpZXdEZXNjcmlwdG9yU3RhdGUudmlzaWJsZSkgPyAoaXNVbmRlZmluZWRPck51bGwoc3RhdGUudmlzaWJsZVdvcmtzcGFjZSkgPyAhdmlld0Rlc2NyaXB0b3IuaGlkZUJ5RGVmYXVsdCA6IHN0YXRlLnZpc2libGVXb3Jrc3BhY2UpIDogYWRkZWRWaWV3RGVzY3JpcHRvclN0YXRlLnZpc2libGU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgaXNWaXNpYmxlID0gc3RhdGUudmlzaWJsZUdsb2JhbDtcblx0XHRcdFx0XHRzdGF0ZS52aXNpYmxlR2xvYmFsID0gaXNVbmRlZmluZWRPck51bGwoYWRkZWRWaWV3RGVzY3JpcHRvclN0YXRlLnZpc2libGUpID8gKGlzVW5kZWZpbmVkT3JOdWxsKHN0YXRlLnZpc2libGVHbG9iYWwpID8gIXZpZXdEZXNjcmlwdG9yLmhpZGVCeURlZmF1bHQgOiBzdGF0ZS52aXNpYmxlR2xvYmFsKSA6IGFkZGVkVmlld0Rlc2NyaXB0b3JTdGF0ZS52aXNpYmxlO1xuXHRcdFx0XHRcdGlmIChzdGF0ZS52aXNpYmxlR2xvYmFsICYmICFpc1Zpc2libGUpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nZ2VyLnZhbHVlLnRyYWNlKGBBZGRlZCB2aWV3ICR7dmlld0Rlc2NyaXB0b3IuaWR9IGluIHRoZSBjb250YWluZXIgJHt0aGlzLnZpZXdDb250YWluZXIuaWR9IGFuZCBzaG93aW5nIGl0LmAsIGAke2lzVmlzaWJsZX1gLCBgJHt2aWV3RGVzY3JpcHRvci5oaWRlQnlEZWZhdWx0fWAsIGAke2FkZGVkVmlld0Rlc2NyaXB0b3JTdGF0ZS52aXNpYmxlfWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRzdGF0ZS5jb2xsYXBzZWQgPSBpc1VuZGVmaW5lZE9yTnVsbChhZGRlZFZpZXdEZXNjcmlwdG9yU3RhdGUuY29sbGFwc2VkKSA/IChpc1VuZGVmaW5lZE9yTnVsbChzdGF0ZS5jb2xsYXBzZWQpID8gISF2aWV3RGVzY3JpcHRvci5jb2xsYXBzZWQgOiBzdGF0ZS5jb2xsYXBzZWQpIDogYWRkZWRWaWV3RGVzY3JpcHRvclN0YXRlLmNvbGxhcHNlZDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHN0YXRlID0ge1xuXHRcdFx0XHRcdGFjdGl2ZTogZmFsc2UsXG5cdFx0XHRcdFx0dmlzaWJsZUdsb2JhbDogaXNVbmRlZmluZWRPck51bGwoYWRkZWRWaWV3RGVzY3JpcHRvclN0YXRlLnZpc2libGUpID8gIXZpZXdEZXNjcmlwdG9yLmhpZGVCeURlZmF1bHQgOiBhZGRlZFZpZXdEZXNjcmlwdG9yU3RhdGUudmlzaWJsZSxcblx0XHRcdFx0XHR2aXNpYmxlV29ya3NwYWNlOiBpc1VuZGVmaW5lZE9yTnVsbChhZGRlZFZpZXdEZXNjcmlwdG9yU3RhdGUudmlzaWJsZSkgPyAhdmlld0Rlc2NyaXB0b3IuaGlkZUJ5RGVmYXVsdCA6IGFkZGVkVmlld0Rlc2NyaXB0b3JTdGF0ZS52aXNpYmxlLFxuXHRcdFx0XHRcdGNvbGxhcHNlZDogaXNVbmRlZmluZWRPck51bGwoYWRkZWRWaWV3RGVzY3JpcHRvclN0YXRlLmNvbGxhcHNlZCkgPyAhIXZpZXdEZXNjcmlwdG9yLmNvbGxhcHNlZCA6IGFkZGVkVmlld0Rlc2NyaXB0b3JTdGF0ZS5jb2xsYXBzZWQsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnZpZXdEZXNjcmlwdG9yc1N0YXRlLnNldCh2aWV3RGVzY3JpcHRvci5pZCwgc3RhdGUpO1xuXHRcdFx0c3RhdGUuYWN0aXZlID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKHZpZXdEZXNjcmlwdG9yLndoZW4pO1xuXHRcdFx0YWRkZWRJdGVtcy5wdXNoKHsgdmlld0Rlc2NyaXB0b3IsIHN0YXRlIH0pO1xuXHRcdH1cblx0XHR0aGlzLnZpZXdEZXNjcmlwdG9ySXRlbXMucHVzaCguLi5hZGRlZEl0ZW1zKTtcblx0XHR0aGlzLnZpZXdEZXNjcmlwdG9ySXRlbXMuc29ydCh0aGlzLmNvbXBhcmVWaWV3RGVzY3JpcHRvcnMuYmluZCh0aGlzKSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VBbGxWaWV3RGVzY3JpcHRvcnMuZmlyZSh7IGFkZGVkOiBhZGRlZEl0ZW1zLm1hcCgoeyB2aWV3RGVzY3JpcHRvciB9KSA9PiB2aWV3RGVzY3JpcHRvciksIHJlbW92ZWQ6IFtdIH0pO1xuXG5cdFx0Y29uc3QgYWRkZWRBY3RpdmVJdGVtczogeyB2aWV3RGVzY3JpcHRvckl0ZW06IElWaWV3RGVzY3JpcHRvckl0ZW07IHZpc2libGU6IGJvb2xlYW4gfVtdID0gW107XG5cdFx0Zm9yIChjb25zdCB2aWV3RGVzY3JpcHRvckl0ZW0gb2YgYWRkZWRJdGVtcykge1xuXHRcdFx0aWYgKHZpZXdEZXNjcmlwdG9ySXRlbS5zdGF0ZS5hY3RpdmUpIHtcblx0XHRcdFx0YWRkZWRBY3RpdmVJdGVtcy5wdXNoKHsgdmlld0Rlc2NyaXB0b3JJdGVtLCB2aXNpYmxlOiB0aGlzLmlzVmlld0Rlc2NyaXB0b3JWaXNpYmxlKHZpZXdEZXNjcmlwdG9ySXRlbSkgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChhZGRlZEFjdGl2ZUl0ZW1zLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVWaWV3RGVzY3JpcHRvcnMuZmlyZSgoeyBhZGRlZDogYWRkZWRBY3RpdmVJdGVtcy5tYXAoKHsgdmlld0Rlc2NyaXB0b3JJdGVtIH0pID0+IHZpZXdEZXNjcmlwdG9ySXRlbS52aWV3RGVzY3JpcHRvciksIHJlbW92ZWQ6IFtdIH0pKTtcblx0XHR9XG5cblx0XHRjb25zdCBhZGRlZFZpc2libGVEZXNjcmlwdG9yczogSUFkZGVkVmlld0Rlc2NyaXB0b3JSZWZbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgeyB2aWV3RGVzY3JpcHRvckl0ZW0sIHZpc2libGUgfSBvZiBhZGRlZEFjdGl2ZUl0ZW1zKSB7XG5cdFx0XHRpZiAodmlzaWJsZSAmJiB0aGlzLmlzVmlld0Rlc2NyaXB0b3JWaXNpYmxlKHZpZXdEZXNjcmlwdG9ySXRlbSkpIHtcblx0XHRcdFx0Y29uc3QgeyB2aXNpYmxlSW5kZXggfSA9IHRoaXMuZmluZCh2aWV3RGVzY3JpcHRvckl0ZW0udmlld0Rlc2NyaXB0b3IuaWQpO1xuXHRcdFx0XHRhZGRlZFZpc2libGVEZXNjcmlwdG9ycy5wdXNoKHsgaW5kZXg6IHZpc2libGVJbmRleCwgdmlld0Rlc2NyaXB0b3I6IHZpZXdEZXNjcmlwdG9ySXRlbS52aWV3RGVzY3JpcHRvciwgc2l6ZTogdmlld0Rlc2NyaXB0b3JJdGVtLnN0YXRlLnNpemUsIGNvbGxhcHNlZDogISF2aWV3RGVzY3JpcHRvckl0ZW0uc3RhdGUuY29sbGFwc2VkIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLmJyb2FkQ2FzdEFkZGVkVmlzaWJsZVZpZXdEZXNjcmlwdG9ycyhhZGRlZFZpc2libGVEZXNjcmlwdG9ycyk7XG5cdH1cblxuXHRyZW1vdmUodmlld0Rlc2NyaXB0b3JzOiBJVmlld0Rlc2NyaXB0b3JbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHJlbW92ZWQ6IElWaWV3RGVzY3JpcHRvcltdID0gW107XG5cdFx0Y29uc3QgcmVtb3ZlZEl0ZW1zOiBJVmlld0Rlc2NyaXB0b3JJdGVtW10gPSBbXTtcblx0XHRjb25zdCByZW1vdmVkQWN0aXZlRGVzY3JpcHRvcnM6IElWaWV3RGVzY3JpcHRvcltdID0gW107XG5cdFx0Y29uc3QgcmVtb3ZlZFZpc2libGVEZXNjcmlwdG9yczogSVZpZXdEZXNjcmlwdG9yUmVmW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3Qgdmlld0Rlc2NyaXB0b3Igb2Ygdmlld0Rlc2NyaXB0b3JzKSB7XG5cdFx0XHRpZiAodmlld0Rlc2NyaXB0b3Iud2hlbikge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGtleSBvZiB2aWV3RGVzY3JpcHRvci53aGVuLmtleXMoKSkge1xuXHRcdFx0XHRcdHRoaXMuY29udGV4dEtleXMuZGVsZXRlKGtleSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy52aWV3RGVzY3JpcHRvckl0ZW1zLmZpbmRJbmRleChpID0+IGkudmlld0Rlc2NyaXB0b3IuaWQgPT09IHZpZXdEZXNjcmlwdG9yLmlkKTtcblx0XHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0cmVtb3ZlZC5wdXNoKHZpZXdEZXNjcmlwdG9yKTtcblx0XHRcdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3JJdGVtID0gdGhpcy52aWV3RGVzY3JpcHRvckl0ZW1zW2luZGV4XTtcblx0XHRcdFx0aWYgKHZpZXdEZXNjcmlwdG9ySXRlbS5zdGF0ZS5hY3RpdmUpIHtcblx0XHRcdFx0XHRyZW1vdmVkQWN0aXZlRGVzY3JpcHRvcnMucHVzaCh2aWV3RGVzY3JpcHRvckl0ZW0udmlld0Rlc2NyaXB0b3IpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLmlzVmlld0Rlc2NyaXB0b3JWaXNpYmxlKHZpZXdEZXNjcmlwdG9ySXRlbSkpIHtcblx0XHRcdFx0XHRjb25zdCB7IHZpc2libGVJbmRleCB9ID0gdGhpcy5maW5kKHZpZXdEZXNjcmlwdG9ySXRlbS52aWV3RGVzY3JpcHRvci5pZCk7XG5cdFx0XHRcdFx0cmVtb3ZlZFZpc2libGVEZXNjcmlwdG9ycy5wdXNoKHsgaW5kZXg6IHZpc2libGVJbmRleCwgdmlld0Rlc2NyaXB0b3I6IHZpZXdEZXNjcmlwdG9ySXRlbS52aWV3RGVzY3JpcHRvciB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZW1vdmVkSXRlbXMucHVzaCh2aWV3RGVzY3JpcHRvckl0ZW0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHVwZGF0ZSBzdGF0ZVxuXHRcdHJlbW92ZWRJdGVtcy5mb3JFYWNoKGl0ZW0gPT4gdGhpcy52aWV3RGVzY3JpcHRvckl0ZW1zLnNwbGljZSh0aGlzLnZpZXdEZXNjcmlwdG9ySXRlbXMuaW5kZXhPZihpdGVtKSwgMSkpO1xuXG5cdFx0dGhpcy5icm9hZENhc3RSZW1vdmVkVmlzaWJsZVZpZXdEZXNjcmlwdG9ycyhyZW1vdmVkVmlzaWJsZURlc2NyaXB0b3JzKTtcblx0XHRpZiAocmVtb3ZlZEFjdGl2ZURlc2NyaXB0b3JzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVWaWV3RGVzY3JpcHRvcnMuZmlyZSgoeyBhZGRlZDogW10sIHJlbW92ZWQ6IHJlbW92ZWRBY3RpdmVEZXNjcmlwdG9ycyB9KSk7XG5cdFx0fVxuXHRcdGlmIChyZW1vdmVkLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBbGxWaWV3RGVzY3JpcHRvcnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZCB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlQ29udGV4dCgpOiB2b2lkIHtcblx0XHRjb25zdCBhZGRlZEFjdGl2ZUl0ZW1zOiB7IGl0ZW06IElWaWV3RGVzY3JpcHRvckl0ZW07IHZpc2libGVXaGVuQWN0aXZlOiBib29sZWFuIH1bXSA9IFtdO1xuXHRcdGNvbnN0IHJlbW92ZWRBY3RpdmVJdGVtczogSVZpZXdEZXNjcmlwdG9ySXRlbVtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdGhpcy52aWV3RGVzY3JpcHRvckl0ZW1zKSB7XG5cdFx0XHRjb25zdCB3YXNBY3RpdmUgPSBpdGVtLnN0YXRlLmFjdGl2ZTtcblx0XHRcdGNvbnN0IGlzQWN0aXZlID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKGl0ZW0udmlld0Rlc2NyaXB0b3Iud2hlbik7XG5cdFx0XHRpZiAod2FzQWN0aXZlICE9PSBpc0FjdGl2ZSkge1xuXHRcdFx0XHRpZiAoaXNBY3RpdmUpIHtcblx0XHRcdFx0XHRhZGRlZEFjdGl2ZUl0ZW1zLnB1c2goeyBpdGVtLCB2aXNpYmxlV2hlbkFjdGl2ZTogdGhpcy5pc1ZpZXdEZXNjcmlwdG9yVmlzaWJsZVdoZW5BY3RpdmUoaXRlbSkgfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVtb3ZlZEFjdGl2ZUl0ZW1zLnB1c2goaXRlbSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCByZW1vdmVkVmlzaWJsZURlc2NyaXB0b3JzOiBJVmlld0Rlc2NyaXB0b3JSZWZbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiByZW1vdmVkQWN0aXZlSXRlbXMpIHtcblx0XHRcdGlmICh0aGlzLmlzVmlld0Rlc2NyaXB0b3JWaXNpYmxlKGl0ZW0pKSB7XG5cdFx0XHRcdGNvbnN0IHsgdmlzaWJsZUluZGV4IH0gPSB0aGlzLmZpbmQoaXRlbS52aWV3RGVzY3JpcHRvci5pZCk7XG5cdFx0XHRcdHJlbW92ZWRWaXNpYmxlRGVzY3JpcHRvcnMucHVzaCh7IGluZGV4OiB2aXNpYmxlSW5kZXgsIHZpZXdEZXNjcmlwdG9yOiBpdGVtLnZpZXdEZXNjcmlwdG9yIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSB0aGUgU3RhdGVcblx0XHRyZW1vdmVkQWN0aXZlSXRlbXMuZm9yRWFjaChpdGVtID0+IGl0ZW0uc3RhdGUuYWN0aXZlID0gZmFsc2UpO1xuXHRcdGFkZGVkQWN0aXZlSXRlbXMuZm9yRWFjaCgoeyBpdGVtIH0pID0+IGl0ZW0uc3RhdGUuYWN0aXZlID0gdHJ1ZSk7XG5cblx0XHR0aGlzLmJyb2FkQ2FzdFJlbW92ZWRWaXNpYmxlVmlld0Rlc2NyaXB0b3JzKHJlbW92ZWRWaXNpYmxlRGVzY3JpcHRvcnMpO1xuXG5cdFx0aWYgKGFkZGVkQWN0aXZlSXRlbXMubGVuZ3RoIHx8IHJlbW92ZWRBY3RpdmVJdGVtcy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlVmlld0Rlc2NyaXB0b3JzLmZpcmUoKHsgYWRkZWQ6IGFkZGVkQWN0aXZlSXRlbXMubWFwKCh7IGl0ZW0gfSkgPT4gaXRlbS52aWV3RGVzY3JpcHRvciksIHJlbW92ZWQ6IHJlbW92ZWRBY3RpdmVJdGVtcy5tYXAoaXRlbSA9PiBpdGVtLnZpZXdEZXNjcmlwdG9yKSB9KSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWRkZWRWaXNpYmxlRGVzY3JpcHRvcnM6IElBZGRlZFZpZXdEZXNjcmlwdG9yUmVmW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHsgaXRlbSwgdmlzaWJsZVdoZW5BY3RpdmUgfSBvZiBhZGRlZEFjdGl2ZUl0ZW1zKSB7XG5cdFx0XHRpZiAodmlzaWJsZVdoZW5BY3RpdmUgJiYgdGhpcy5pc1ZpZXdEZXNjcmlwdG9yVmlzaWJsZShpdGVtKSkge1xuXHRcdFx0XHRjb25zdCB7IHZpc2libGVJbmRleCB9ID0gdGhpcy5maW5kKGl0ZW0udmlld0Rlc2NyaXB0b3IuaWQpO1xuXHRcdFx0XHRhZGRlZFZpc2libGVEZXNjcmlwdG9ycy5wdXNoKHsgaW5kZXg6IHZpc2libGVJbmRleCwgdmlld0Rlc2NyaXB0b3I6IGl0ZW0udmlld0Rlc2NyaXB0b3IsIHNpemU6IGl0ZW0uc3RhdGUuc2l6ZSwgY29sbGFwc2VkOiAhIWl0ZW0uc3RhdGUuY29sbGFwc2VkIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLmJyb2FkQ2FzdEFkZGVkVmlzaWJsZVZpZXdEZXNjcmlwdG9ycyhhZGRlZFZpc2libGVEZXNjcmlwdG9ycyk7XG5cdH1cblxuXHRwcml2YXRlIGJyb2FkQ2FzdEFkZGVkVmlzaWJsZVZpZXdEZXNjcmlwdG9ycyhhZGRlZDogSUFkZGVkVmlld0Rlc2NyaXB0b3JSZWZbXSk6IHZvaWQge1xuXHRcdGlmIChhZGRlZC5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX29uRGlkQWRkVmlzaWJsZVZpZXdEZXNjcmlwdG9ycy5maXJlKGFkZGVkLnNvcnQoKGEsIGIpID0+IGEuaW5kZXggLSBiLmluZGV4KSk7XG5cdFx0XHR0aGlzLnVwZGF0ZVN0YXRlKGBBZGRlZCB2aWV3czoke2FkZGVkLm1hcCh2ID0+IHYudmlld0Rlc2NyaXB0b3IuaWQpLmpvaW4oJywnKX0gaW4gJHt0aGlzLnZpZXdDb250YWluZXIuaWR9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBicm9hZENhc3RSZW1vdmVkVmlzaWJsZVZpZXdEZXNjcmlwdG9ycyhyZW1vdmVkOiBJVmlld0Rlc2NyaXB0b3JSZWZbXSk6IHZvaWQge1xuXHRcdGlmIChyZW1vdmVkLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fb25EaWRSZW1vdmVWaXNpYmxlVmlld0Rlc2NyaXB0b3JzLmZpcmUocmVtb3ZlZC5zb3J0KChhLCBiKSA9PiBiLmluZGV4IC0gYS5pbmRleCkpO1xuXHRcdFx0dGhpcy51cGRhdGVTdGF0ZShgUmVtb3ZlZCB2aWV3czoke3JlbW92ZWQubWFwKHYgPT4gdi52aWV3RGVzY3JpcHRvci5pZCkuam9pbignLCcpfSBmcm9tICR7dGhpcy52aWV3Q29udGFpbmVyLmlkfWApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYnJvYWRDYXN0TW92ZWRWaWV3RGVzY3JpcHRvcnMoZnJvbTogSVZpZXdEZXNjcmlwdG9yUmVmLCB0bzogSVZpZXdEZXNjcmlwdG9yUmVmKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRNb3ZlVmlzaWJsZVZpZXdEZXNjcmlwdG9ycy5maXJlKHsgZnJvbSwgdG8gfSk7XG5cdFx0dGhpcy51cGRhdGVTdGF0ZShgTW92ZWQgdmlldyAke2Zyb20udmlld0Rlc2NyaXB0b3IuaWR9IHRvICR7dG8udmlld0Rlc2NyaXB0b3IuaWR9IGluICR7dGhpcy52aWV3Q29udGFpbmVyLmlkfWApO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTdGF0ZShyZWFzb246IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMubG9nZ2VyLnZhbHVlLnRyYWNlKHJlYXNvbik7XG5cdFx0dGhpcy52aWV3RGVzY3JpcHRvcnNTdGF0ZS51cGRhdGVTdGF0ZSh0aGlzLmFsbFZpZXdEZXNjcmlwdG9ycyk7XG5cdFx0dGhpcy51cGRhdGVDb250YWluZXJJbmZvKCk7XG5cdH1cblxuXHRwcml2YXRlIGlzVmlld0Rlc2NyaXB0b3JWaXNpYmxlKHZpZXdEZXNjcmlwdG9ySXRlbTogSVZpZXdEZXNjcmlwdG9ySXRlbSk6IGJvb2xlYW4ge1xuXHRcdGlmICghdmlld0Rlc2NyaXB0b3JJdGVtLnN0YXRlLmFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5pc1ZpZXdEZXNjcmlwdG9yVmlzaWJsZVdoZW5BY3RpdmUodmlld0Rlc2NyaXB0b3JJdGVtKTtcblx0fVxuXG5cdHByaXZhdGUgaXNWaWV3RGVzY3JpcHRvclZpc2libGVXaGVuQWN0aXZlKHZpZXdEZXNjcmlwdG9ySXRlbTogSVZpZXdEZXNjcmlwdG9ySXRlbSk6IGJvb2xlYW4ge1xuXHRcdGlmICh2aWV3RGVzY3JpcHRvckl0ZW0udmlld0Rlc2NyaXB0b3Iud29ya3NwYWNlKSB7XG5cdFx0XHRyZXR1cm4gISF2aWV3RGVzY3JpcHRvckl0ZW0uc3RhdGUudmlzaWJsZVdvcmtzcGFjZTtcblx0XHR9XG5cdFx0cmV0dXJuICEhdmlld0Rlc2NyaXB0b3JJdGVtLnN0YXRlLnZpc2libGVHbG9iYWw7XG5cdH1cblxuXHRwcml2YXRlIGZpbmQoaWQ6IHN0cmluZyk6IHsgaW5kZXg6IG51bWJlcjsgdmlzaWJsZUluZGV4OiBudW1iZXI7IHZpZXdEZXNjcmlwdG9ySXRlbTogSVZpZXdEZXNjcmlwdG9ySXRlbSB9IHtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLmZpbmRBbmRJZ25vcmVJZk5vdEZvdW5kKGlkKTtcblx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoYHZpZXcgZGVzY3JpcHRvciAke2lkfSBub3QgZm91bmRgKTtcblx0fVxuXG5cdHByaXZhdGUgZmluZEFuZElnbm9yZUlmTm90Rm91bmQoaWQ6IHN0cmluZyk6IHsgaW5kZXg6IG51bWJlcjsgdmlzaWJsZUluZGV4OiBudW1iZXI7IHZpZXdEZXNjcmlwdG9ySXRlbTogSVZpZXdEZXNjcmlwdG9ySXRlbSB9IHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGxldCBpID0gMCwgdmlzaWJsZUluZGV4ID0gMDsgaSA8IHRoaXMudmlld0Rlc2NyaXB0b3JJdGVtcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3JJdGVtID0gdGhpcy52aWV3RGVzY3JpcHRvckl0ZW1zW2ldO1xuXHRcdFx0aWYgKHZpZXdEZXNjcmlwdG9ySXRlbS52aWV3RGVzY3JpcHRvci5pZCA9PT0gaWQpIHtcblx0XHRcdFx0cmV0dXJuIHsgaW5kZXg6IGksIHZpc2libGVJbmRleCwgdmlld0Rlc2NyaXB0b3JJdGVtOiB2aWV3RGVzY3JpcHRvckl0ZW0gfTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmlzVmlld0Rlc2NyaXB0b3JWaXNpYmxlKHZpZXdEZXNjcmlwdG9ySXRlbSkpIHtcblx0XHRcdFx0dmlzaWJsZUluZGV4Kys7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGNvbXBhcmVWaWV3RGVzY3JpcHRvcnMoYTogSVZpZXdEZXNjcmlwdG9ySXRlbSwgYjogSVZpZXdEZXNjcmlwdG9ySXRlbSk6IG51bWJlciB7XG5cdFx0aWYgKGEudmlld0Rlc2NyaXB0b3IuaWQgPT09IGIudmlld0Rlc2NyaXB0b3IuaWQpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXHRcdHJldHVybiAodGhpcy5nZXRWaWV3T3JkZXIoYSkgLSB0aGlzLmdldFZpZXdPcmRlcihiKSkgfHwgdGhpcy5nZXRHcm91cE9yZGVyUmVzdWx0KGEudmlld0Rlc2NyaXB0b3IsIGIudmlld0Rlc2NyaXB0b3IpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRWaWV3T3JkZXIodmlld0Rlc2NyaXB0b3JJdGVtOiBJVmlld0Rlc2NyaXB0b3JJdGVtKTogbnVtYmVyIHtcblx0XHRjb25zdCB2aWV3T3JkZXIgPSB0eXBlb2Ygdmlld0Rlc2NyaXB0b3JJdGVtLnN0YXRlLm9yZGVyID09PSAnbnVtYmVyJyA/IHZpZXdEZXNjcmlwdG9ySXRlbS5zdGF0ZS5vcmRlciA6IHZpZXdEZXNjcmlwdG9ySXRlbS52aWV3RGVzY3JpcHRvci5vcmRlcjtcblx0XHRyZXR1cm4gdHlwZW9mIHZpZXdPcmRlciA9PT0gJ251bWJlcicgPyB2aWV3T3JkZXIgOiBOdW1iZXIuTUFYX1ZBTFVFO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRHcm91cE9yZGVyUmVzdWx0KGE6IElWaWV3RGVzY3JpcHRvciwgYjogSVZpZXdEZXNjcmlwdG9yKSB7XG5cdFx0aWYgKCFhLmdyb3VwIHx8ICFiLmdyb3VwKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cblx0XHRpZiAoYS5ncm91cCA9PT0gYi5ncm91cCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGEuZ3JvdXAgPCBiLmdyb3VwID8gLTEgOiAxO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQXlELGNBQWMsZ0JBQTZHLGlCQUFpQixjQUFjLHNCQUFzQjtBQUN6TyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLE9BQU8sZUFBZTtBQUMvQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxVQUFVLFlBQVk7QUFDL0IsU0FBUyxhQUFhLHlCQUF5QjtBQUMvQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFB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
