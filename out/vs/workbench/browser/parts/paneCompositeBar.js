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
import { ActionsOrientation } from "../../../base/browser/ui/actionbar/actionbar.js";
import { IActivityService } from "../../services/activity/common/activity.js";
import { IWorkbenchLayoutService, Parts } from "../../services/layout/browser/layoutService.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { DisposableStore, Disposable, DisposableMap, combinedDisposable } from "../../../base/common/lifecycle.js";
import { CompositeBar, CompositeDragAndDrop } from "./compositeBar.js";
import { Dimension, isMouseEvent } from "../../../base/browser/dom.js";
import { createCSSRule } from "../../../base/browser/domStylesheets.js";
import { asCSSUrl } from "../../../base/browser/cssValue.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../platform/storage/common/storage.js";
import { IExtensionService } from "../../services/extensions/common/extensions.js";
import { URI } from "../../../base/common/uri.js";
import { ToggleCompositePinnedAction, ToggleCompositeBadgeAction, CompositeBarAction } from "./compositeBarActions.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../common/views.js";
import { IContextKeyService, ContextKeyExpr } from "../../../platform/contextkey/common/contextkey.js";
import { isString } from "../../../base/common/types.js";
import { IWorkbenchEnvironmentService } from "../../services/environment/common/environmentService.js";
import { isNative } from "../../../base/common/platform.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { Separator, SubmenuAction, toAction } from "../../../base/common/actions.js";
import { StringSHA1 } from "../../../base/common/hash.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { IViewsService } from "../../services/views/common/viewsService.js";
let PaneCompositeBar = class extends Disposable {
  constructor(location, options, part, paneCompositePart, instantiationService, storageService, extensionService, viewDescriptorService, viewService, contextKeyService, environmentService, layoutService) {
    super();
    this.location = location;
    this.options = options;
    this.part = part;
    this.paneCompositePart = paneCompositePart;
    this.instantiationService = instantiationService;
    this.storageService = storageService;
    this.extensionService = extensionService;
    this.viewDescriptorService = viewDescriptorService;
    this.viewService = viewService;
    this.contextKeyService = contextKeyService;
    this.environmentService = environmentService;
    this.layoutService = layoutService;
    this.viewContainerDisposables = this._register(new DisposableMap());
    this.compositeActions = this._register(new DisposableMap());
    this.hasExtensionsRegistered = false;
    this._cachedViewContainers = void 0;
    this.dndHandler = new CompositeDragAndDrop(
      this.viewDescriptorService,
      this.location,
      this.options.orientation,
      async (id, focus) => {
        return await this.paneCompositePart.openPaneComposite(id, focus) ?? null;
      },
      (from, to, before) => this.compositeBar.move(from, to, this.options.orientation === ActionsOrientation.VERTICAL ? before?.verticallyBefore : before?.horizontallyBefore),
      () => this.compositeBar.getCompositeBarItems()
    );
    const cachedItems = this.cachedViewContainers.map((container) => ({
      id: container.id,
      name: container.name,
      visible: !this.shouldBeHidden(container.id, container),
      order: container.order,
      pinned: container.pinned
    }));
    this.compositeBar = this.createCompositeBar(cachedItems);
    this.onDidRegisterViewContainers(this.getViewContainers());
    this.registerListeners();
  }
  createCompositeBar(cachedItems) {
    return this._register(this.instantiationService.createInstance(CompositeBar, cachedItems, {
      icon: this.options.icon,
      compact: this.options.compact,
      orientation: this.options.orientation,
      activityHoverOptions: this.options.activityHoverOptions,
      preventLoopNavigation: this.options.preventLoopNavigation,
      openComposite: async (compositeId, preserveFocus) => {
        return await this.paneCompositePart.openPaneComposite(compositeId, !preserveFocus) ?? null;
      },
      getActivityAction: (compositeId) => this.getCompositeActions(compositeId).activityAction,
      getCompositePinnedAction: (compositeId) => this.getCompositeActions(compositeId).pinnedAction,
      getCompositeBadgeAction: (compositeId) => this.getCompositeActions(compositeId).badgeAction,
      getOnCompositeClickAction: (compositeId) => this.getCompositeActions(compositeId).activityAction,
      fillExtraContextMenuActions: (actions, e) => this.options.fillExtraContextMenuActions(actions, e),
      getContextMenuActionsForComposite: (compositeId) => this.getContextMenuActionsForComposite(compositeId),
      getDefaultCompositeId: () => this.viewDescriptorService.getDefaultViewContainer(this.location)?.id,
      dndHandler: this.dndHandler,
      compositeSize: this.options.compositeSize,
      overflowActionSize: this.options.overflowActionSize,
      colors: (theme) => this.options.colors(theme)
    }));
  }
  getContextMenuActionsForComposite(compositeId) {
    const actions = [new Separator()];
    const viewContainer = this.viewDescriptorService.getViewContainerById(compositeId);
    const defaultLocation = this.viewDescriptorService.getDefaultViewContainerLocation(viewContainer);
    const currentLocation = this.viewDescriptorService.getViewContainerLocation(viewContainer);
    const moveActions = [];
    for (const location of [ViewContainerLocation.Sidebar, ViewContainerLocation.AuxiliaryBar, ViewContainerLocation.Panel]) {
      if (currentLocation !== location) {
        moveActions.push(this.createMoveAction(viewContainer, location, defaultLocation));
      }
    }
    actions.push(new SubmenuAction("moveToMenu", localize("moveToMenu", "Move To"), moveActions));
    if (defaultLocation !== currentLocation) {
      actions.push(toAction({
        id: "resetLocationAction",
        label: localize("resetLocation", "Reset Location"),
        run: () => {
          this.viewDescriptorService.moveViewContainerToLocation(viewContainer, defaultLocation, void 0, "resetLocationAction");
          this.viewService.openViewContainer(viewContainer.id, true);
        }
      }));
    } else {
      const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
      if (viewContainerModel.allViewDescriptors.length === 1) {
        const viewToReset = viewContainerModel.allViewDescriptors[0];
        const defaultContainer = this.viewDescriptorService.getDefaultContainerById(viewToReset.id);
        if (defaultContainer !== viewContainer) {
          actions.push(toAction({
            id: "resetLocationAction",
            label: localize("resetLocation", "Reset Location"),
            run: () => {
              this.viewDescriptorService.moveViewsToContainer([viewToReset], defaultContainer, void 0, "resetLocationAction");
              this.viewService.openViewContainer(viewContainer.id, true);
            }
          }));
        }
      }
    }
    return actions;
  }
  createMoveAction(viewContainer, newLocation, defaultLocation) {
    return toAction({
      id: `moveViewContainerTo${newLocation}`,
      label: newLocation === ViewContainerLocation.Panel ? localize("panel", "Panel") : newLocation === ViewContainerLocation.Sidebar ? localize("sidebar", "Primary Side Bar") : localize("auxiliarybar", "Secondary Side Bar"),
      run: () => {
        let index;
        if (newLocation !== defaultLocation) {
          index = this.viewDescriptorService.getViewContainersByLocation(newLocation).length;
        } else {
          index = void 0;
        }
        this.viewDescriptorService.moveViewContainerToLocation(viewContainer, newLocation, index);
        this.viewService.openViewContainer(viewContainer.id, true);
      }
    });
  }
  registerListeners() {
    this._register(this.viewDescriptorService.onDidChangeViewContainers(({ added, removed }) => this.onDidChangeViewContainers(added, removed)));
    this._register(this.viewDescriptorService.onDidChangeContainerLocation(({ viewContainer, from, to }) => this.onDidChangeViewContainerLocation(viewContainer, from, to)));
    this._register(this.paneCompositePart.onDidPaneCompositeOpen((e) => this.onDidChangeViewContainerVisibility(e.getId(), true)));
    this._register(this.paneCompositePart.onDidPaneCompositeClose((e) => this.onDidChangeViewContainerVisibility(e.getId(), false)));
    this.extensionService.whenInstalledExtensionsRegistered().then(() => {
      if (this._store.isDisposed) {
        return;
      }
      this.onDidRegisterExtensions();
      this._register(this.compositeBar.onDidChange(() => {
        this.updateCompositeBarItemsFromStorage(true);
        this.saveCachedViewContainers();
      }));
      this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, this.options.pinnedViewContainersKey, this._store)(() => this.updateCompositeBarItemsFromStorage(false)));
    });
  }
  onDidChangeViewContainers(added, removed) {
    removed.filter(({ location }) => location === this.location).forEach(({ container }) => this.onDidDeregisterViewContainer(container));
    this.onDidRegisterViewContainers(added.filter(({ location }) => location === this.location).map(({ container }) => container));
  }
  onDidChangeViewContainerLocation(container, from, to) {
    if (from === this.location) {
      this.onDidDeregisterViewContainer(container);
    }
    if (to === this.location) {
      this.onDidRegisterViewContainers([container]);
    }
  }
  onDidChangeViewContainerVisibility(id, visible) {
    if (visible) {
      this.onDidViewContainerVisible(id);
    } else {
      this.compositeBar.deactivateComposite(id);
    }
  }
  onDidRegisterExtensions() {
    this.hasExtensionsRegistered = true;
    for (const { id } of this.cachedViewContainers) {
      const viewContainer = this.getViewContainer(id);
      if (viewContainer) {
        this.showOrHideViewContainer(viewContainer);
      } else {
        if (this.viewDescriptorService.isViewContainerRemovedPermanently(id)) {
          this.removeComposite(id);
        } else {
          this.hideComposite(id);
        }
      }
    }
    this.saveCachedViewContainers();
  }
  onDidViewContainerVisible(id) {
    const viewContainer = this.getViewContainer(id);
    if (viewContainer) {
      this.addComposite(viewContainer);
      this.compositeBar.activateComposite(viewContainer.id);
      if (this.shouldBeHidden(viewContainer)) {
        const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
        if (viewContainerModel.activeViewDescriptors.length === 0) {
          this.hideComposite(viewContainer.id);
        }
      }
    }
  }
  create(parent) {
    return this.compositeBar.create(parent);
  }
  getCompositeActions(compositeId) {
    let compositeActions = this.compositeActions.get(compositeId);
    if (!compositeActions) {
      const viewContainer = this.getViewContainer(compositeId);
      let activityAction;
      let pinnedAction;
      let badgeAction;
      if (viewContainer) {
        const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
        const actionItem = this.toCompositeBarActionItemFrom(viewContainerModel);
        activityAction = this.instantiationService.createInstance(ViewContainerActivityAction, actionItem, this.part, this.paneCompositePart);
        pinnedAction = new ToggleCompositePinnedAction(actionItem, this.compositeBar);
        badgeAction = new ToggleCompositeBadgeAction(actionItem, this.compositeBar);
      } else {
        const cachedComposite = this.cachedViewContainers.filter((c) => c.id === compositeId)[0];
        const actionItem = this.toCompositeBarActionItem(compositeId, cachedComposite?.name ?? compositeId, cachedComposite?.icon, void 0);
        activityAction = this.instantiationService.createInstance(PlaceHolderViewContainerActivityAction, actionItem, this.part, this.paneCompositePart);
        pinnedAction = new PlaceHolderToggleCompositePinnedAction(compositeId, this.compositeBar);
        badgeAction = new PlaceHolderToggleCompositeBadgeAction(compositeId, this.compositeBar);
      }
      const disposable = combinedDisposable(activityAction, pinnedAction, badgeAction);
      compositeActions = { activityAction, pinnedAction, badgeAction, dispose: () => disposable.dispose() };
      this.compositeActions.set(compositeId, compositeActions);
    }
    return compositeActions;
  }
  onDidRegisterViewContainers(viewContainers) {
    for (const viewContainer of viewContainers) {
      this.addComposite(viewContainer);
      const cachedViewContainer = this.cachedViewContainers.filter(({ id }) => id === viewContainer.id)[0];
      if (!cachedViewContainer) {
        this.compositeBar.pin(viewContainer.id);
      }
      const visibleViewContainer = this.paneCompositePart.getActivePaneComposite();
      if (visibleViewContainer?.getId() === viewContainer.id) {
        this.compositeBar.activateComposite(viewContainer.id);
      }
      const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
      this.updateCompositeBarActionItem(viewContainer, viewContainerModel);
      this.showOrHideViewContainer(viewContainer);
      const disposables = new DisposableStore();
      disposables.add(viewContainerModel.onDidChangeContainerInfo(() => this.updateCompositeBarActionItem(viewContainer, viewContainerModel)));
      disposables.add(viewContainerModel.onDidChangeActiveViewDescriptors(() => this.showOrHideViewContainer(viewContainer)));
      this.viewContainerDisposables.set(viewContainer.id, disposables);
    }
  }
  onDidDeregisterViewContainer(viewContainer) {
    this.viewContainerDisposables.deleteAndDispose(viewContainer.id);
    this.removeComposite(viewContainer.id);
  }
  updateCompositeBarActionItem(viewContainer, viewContainerModel) {
    const compositeBarActionItem = this.toCompositeBarActionItemFrom(viewContainerModel);
    const { activityAction, pinnedAction } = this.getCompositeActions(viewContainer.id);
    activityAction.updateCompositeBarActionItem(compositeBarActionItem);
    if (pinnedAction instanceof PlaceHolderToggleCompositePinnedAction) {
      pinnedAction.setActivity(compositeBarActionItem);
    }
    if (this.options.recomputeSizes) {
      this.compositeBar.recomputeSizes();
    }
    this.saveCachedViewContainers();
  }
  toCompositeBarActionItemFrom(viewContainerModel) {
    return this.toCompositeBarActionItem(viewContainerModel.viewContainer.id, viewContainerModel.title, viewContainerModel.icon, viewContainerModel.keybindingId);
  }
  toCompositeBarActionItem(id, name, icon, keybindingId) {
    let classNames = void 0;
    let iconUrl = void 0;
    if (this.options.icon) {
      if (URI.isUri(icon)) {
        iconUrl = icon;
        const cssUrl = asCSSUrl(icon);
        const hash = new StringSHA1();
        hash.update(cssUrl);
        const iconId = `activity-${id.replace(/\./g, "-")}-${hash.digest()}`;
        const iconClass = `.monaco-workbench .${this.options.partContainerClass} .monaco-action-bar .action-label.${iconId}`;
        classNames = [iconId, "uri-icon"];
        createCSSRule(iconClass, `
				mask: ${cssUrl} no-repeat 50% 50%;
				mask-size: var(--activity-bar-icon-size, ${this.options.iconSize}px);
				-webkit-mask: ${cssUrl} no-repeat 50% 50%;
				-webkit-mask-size: var(--activity-bar-icon-size, ${this.options.iconSize}px);
				mask-origin: padding;
				-webkit-mask-origin: padding;
			`);
      } else if (ThemeIcon.isThemeIcon(icon)) {
        classNames = ThemeIcon.asClassNameArray(icon);
      }
    }
    return { id, name, classNames, iconUrl, keybindingId };
  }
  showOrHideViewContainer(viewContainer) {
    if (this.shouldBeHidden(viewContainer)) {
      this.hideComposite(viewContainer.id);
    } else {
      this.addComposite(viewContainer);
      const activePaneComposite = this.paneCompositePart.getActivePaneComposite();
      if (activePaneComposite?.getId() === viewContainer.id) {
        this.compositeBar.activateComposite(viewContainer.id);
      }
    }
  }
  shouldBeHidden(viewContainerOrId, cachedViewContainer) {
    const viewContainer = isString(viewContainerOrId) ? this.getViewContainer(viewContainerOrId) : viewContainerOrId;
    const viewContainerId = isString(viewContainerOrId) ? viewContainerOrId : viewContainerOrId.id;
    if (viewContainer) {
      if (viewContainer.hideIfEmpty) {
        if (this.viewService.isViewContainerActive(viewContainerId)) {
          return false;
        }
      } else {
        return false;
      }
    }
    if (!this.hasExtensionsRegistered && !(this.part === Parts.SIDEBAR_PART && this.environmentService.remoteAuthority && isNative)) {
      cachedViewContainer = cachedViewContainer || this.cachedViewContainers.find(({ id }) => id === viewContainerId);
      if (!viewContainer && cachedViewContainer?.isBuiltin && cachedViewContainer?.visible) {
        return false;
      }
      if (cachedViewContainer?.views?.length) {
        return cachedViewContainer.views.every(({ when }) => !!when && !this.contextKeyService.contextMatchesRules(ContextKeyExpr.deserialize(when)));
      }
    }
    return true;
  }
  addComposite(viewContainer) {
    this.compositeBar.addComposite({ id: viewContainer.id, name: typeof viewContainer.title === "string" ? viewContainer.title : viewContainer.title.value, order: viewContainer.order, requestedIndex: viewContainer.requestedIndex });
  }
  hideComposite(compositeId) {
    this.compositeBar.hideComposite(compositeId);
    const compositeActions = this.compositeActions.get(compositeId);
    if (compositeActions) {
      this.compositeActions.deleteAndDispose(compositeId);
    }
  }
  removeComposite(compositeId) {
    this.compositeBar.removeComposite(compositeId);
    const compositeActions = this.compositeActions.get(compositeId);
    if (compositeActions) {
      this.compositeActions.deleteAndDispose(compositeId);
    }
  }
  getPinnedPaneCompositeIds() {
    const pinnedCompositeIds = this.compositeBar.getPinnedComposites().map((v) => v.id);
    return this.getViewContainers().filter((v) => this.compositeBar.isPinned(v.id)).sort((v1, v2) => pinnedCompositeIds.indexOf(v1.id) - pinnedCompositeIds.indexOf(v2.id)).map((v) => v.id);
  }
  getVisiblePaneCompositeIds() {
    return this.compositeBar.getVisibleComposites().filter((v) => this.paneCompositePart.getActivePaneComposite()?.getId() === v.id || this.compositeBar.isPinned(v.id)).map((v) => v.id);
  }
  getPaneCompositeIds() {
    return this.compositeBar.getVisibleComposites().map((v) => v.id);
  }
  getContextMenuActions() {
    return this.compositeBar.getContextMenuActions();
  }
  focus(index) {
    this.compositeBar.focus(index);
  }
  layout(width, height) {
    this.compositeBar.layout(new Dimension(width, height));
  }
  getViewContainer(id) {
    const viewContainer = this.viewDescriptorService.getViewContainerById(id);
    return viewContainer && this.viewDescriptorService.getViewContainerLocation(viewContainer) === this.location ? viewContainer : void 0;
  }
  getViewContainers() {
    return this.viewDescriptorService.getViewContainersByLocation(this.location);
  }
  updateCompositeBarItemsFromStorage(retainExisting) {
    if (this.pinnedViewContainersValue === this.getStoredPinnedViewContainersValue()) {
      return;
    }
    this._placeholderViewContainersValue = void 0;
    this._pinnedViewContainersValue = void 0;
    this._cachedViewContainers = void 0;
    const newCompositeItems = [];
    const compositeItems = this.compositeBar.getCompositeBarItems();
    for (const cachedViewContainer of this.cachedViewContainers) {
      newCompositeItems.push({
        id: cachedViewContainer.id,
        name: cachedViewContainer.name,
        order: cachedViewContainer.order,
        pinned: cachedViewContainer.pinned,
        visible: cachedViewContainer.visible && !!this.getViewContainer(cachedViewContainer.id)
      });
    }
    for (const viewContainer of this.getViewContainers()) {
      if (!newCompositeItems.some(({ id }) => id === viewContainer.id)) {
        const index = compositeItems.findIndex(({ id }) => id === viewContainer.id);
        if (index !== -1) {
          const compositeItem = compositeItems[index];
          newCompositeItems.splice(index, 0, {
            id: viewContainer.id,
            name: typeof viewContainer.title === "string" ? viewContainer.title : viewContainer.title.value,
            order: compositeItem.order,
            pinned: compositeItem.pinned,
            visible: compositeItem.visible
          });
        } else {
          newCompositeItems.push({
            id: viewContainer.id,
            name: typeof viewContainer.title === "string" ? viewContainer.title : viewContainer.title.value,
            order: viewContainer.order,
            pinned: true,
            visible: !this.shouldBeHidden(viewContainer)
          });
        }
      }
    }
    if (retainExisting) {
      for (const compositeItem of compositeItems) {
        const newCompositeItem = newCompositeItems.find(({ id }) => id === compositeItem.id);
        if (!newCompositeItem) {
          newCompositeItems.push(compositeItem);
        }
      }
    }
    this.compositeBar.setCompositeBarItems(newCompositeItems);
  }
  saveCachedViewContainers() {
    const state = [];
    const compositeItems = this.compositeBar.getCompositeBarItems();
    for (const compositeItem of compositeItems) {
      const viewContainer = this.getViewContainer(compositeItem.id);
      if (viewContainer) {
        const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
        const views = [];
        for (const { when } of viewContainerModel.allViewDescriptors) {
          views.push({ when: when ? when.serialize() : void 0 });
        }
        state.push({
          id: compositeItem.id,
          name: viewContainerModel.title,
          icon: URI.isUri(viewContainerModel.icon) && this.environmentService.remoteAuthority ? void 0 : viewContainerModel.icon,
          // Do not cache uri icons with remote connection
          views,
          pinned: compositeItem.pinned,
          order: compositeItem.order,
          visible: compositeItem.visible,
          isBuiltin: !viewContainer.extensionId
        });
      } else {
        state.push({ id: compositeItem.id, name: compositeItem.name, pinned: compositeItem.pinned, order: compositeItem.order, visible: false, isBuiltin: false });
      }
    }
    this.storeCachedViewContainersState(state);
  }
  get cachedViewContainers() {
    if (this._cachedViewContainers === void 0) {
      this._cachedViewContainers = this.getPinnedViewContainers();
      for (const placeholderViewContainer of this.getPlaceholderViewContainers()) {
        const cachedViewContainer = this._cachedViewContainers.find((cached) => cached.id === placeholderViewContainer.id);
        if (cachedViewContainer) {
          cachedViewContainer.visible = placeholderViewContainer.visible ?? cachedViewContainer.visible;
          cachedViewContainer.name = placeholderViewContainer.name;
          cachedViewContainer.icon = placeholderViewContainer.themeIcon ? placeholderViewContainer.themeIcon : placeholderViewContainer.iconUrl ? URI.revive(placeholderViewContainer.iconUrl) : void 0;
          if (URI.isUri(cachedViewContainer.icon) && this.environmentService.remoteAuthority) {
            cachedViewContainer.icon = void 0;
          }
          cachedViewContainer.views = placeholderViewContainer.views;
          cachedViewContainer.isBuiltin = placeholderViewContainer.isBuiltin;
        }
      }
      for (const viewContainerWorkspaceState of this.getViewContainersWorkspaceState()) {
        const cachedViewContainer = this._cachedViewContainers.find((cached) => cached.id === viewContainerWorkspaceState.id);
        if (cachedViewContainer) {
          cachedViewContainer.visible = viewContainerWorkspaceState.visible ?? cachedViewContainer.visible;
        }
      }
    }
    return this._cachedViewContainers;
  }
  storeCachedViewContainersState(cachedViewContainers) {
    const pinnedViewContainers = this.getPinnedViewContainers();
    this.setPinnedViewContainers(cachedViewContainers.map(({ id, pinned, order }) => ({
      id,
      pinned,
      visible: Boolean(pinnedViewContainers.find(({ id: pinnedId }) => pinnedId === id)?.visible),
      order
    })));
    this.setPlaceholderViewContainers(cachedViewContainers.map(({ id, icon, name, views, isBuiltin }) => ({
      id,
      iconUrl: URI.isUri(icon) ? icon : void 0,
      themeIcon: ThemeIcon.isThemeIcon(icon) ? icon : void 0,
      name,
      isBuiltin,
      views
    })));
    this.setViewContainersWorkspaceState(cachedViewContainers.map(({ id, visible }) => ({
      id,
      visible
    })));
  }
  getPinnedViewContainers() {
    return JSON.parse(this.pinnedViewContainersValue);
  }
  setPinnedViewContainers(pinnedViewContainers) {
    this.pinnedViewContainersValue = JSON.stringify(pinnedViewContainers);
  }
  get pinnedViewContainersValue() {
    if (!this._pinnedViewContainersValue) {
      this._pinnedViewContainersValue = this.getStoredPinnedViewContainersValue();
    }
    return this._pinnedViewContainersValue;
  }
  set pinnedViewContainersValue(pinnedViewContainersValue) {
    if (this.pinnedViewContainersValue !== pinnedViewContainersValue) {
      this._pinnedViewContainersValue = pinnedViewContainersValue;
      this.setStoredPinnedViewContainersValue(pinnedViewContainersValue);
    }
  }
  getStoredPinnedViewContainersValue() {
    return this.storageService.get(this.options.pinnedViewContainersKey, StorageScope.PROFILE, "[]");
  }
  setStoredPinnedViewContainersValue(value) {
    this.storageService.store(this.options.pinnedViewContainersKey, value, StorageScope.PROFILE, StorageTarget.USER);
  }
  getPlaceholderViewContainers() {
    return JSON.parse(this.placeholderViewContainersValue);
  }
  setPlaceholderViewContainers(placeholderViewContainers) {
    this.placeholderViewContainersValue = JSON.stringify(placeholderViewContainers);
  }
  get placeholderViewContainersValue() {
    if (!this._placeholderViewContainersValue) {
      this._placeholderViewContainersValue = this.getStoredPlaceholderViewContainersValue();
    }
    return this._placeholderViewContainersValue;
  }
  set placeholderViewContainersValue(placeholderViewContainesValue) {
    if (this.placeholderViewContainersValue !== placeholderViewContainesValue) {
      this._placeholderViewContainersValue = placeholderViewContainesValue;
      this.setStoredPlaceholderViewContainersValue(placeholderViewContainesValue);
    }
  }
  getStoredPlaceholderViewContainersValue() {
    return this.storageService.get(this.options.placeholderViewContainersKey, StorageScope.PROFILE, "[]");
  }
  setStoredPlaceholderViewContainersValue(value) {
    this.storageService.store(this.options.placeholderViewContainersKey, value, StorageScope.PROFILE, StorageTarget.MACHINE);
  }
  getViewContainersWorkspaceState() {
    return JSON.parse(this.viewContainersWorkspaceStateValue);
  }
  setViewContainersWorkspaceState(viewContainersWorkspaceState) {
    this.viewContainersWorkspaceStateValue = JSON.stringify(viewContainersWorkspaceState);
  }
  get viewContainersWorkspaceStateValue() {
    if (!this._viewContainersWorkspaceStateValue) {
      this._viewContainersWorkspaceStateValue = this.getStoredViewContainersWorkspaceStateValue();
    }
    return this._viewContainersWorkspaceStateValue;
  }
  set viewContainersWorkspaceStateValue(viewContainersWorkspaceStateValue) {
    if (this.viewContainersWorkspaceStateValue !== viewContainersWorkspaceStateValue) {
      this._viewContainersWorkspaceStateValue = viewContainersWorkspaceStateValue;
      this.setStoredViewContainersWorkspaceStateValue(viewContainersWorkspaceStateValue);
    }
  }
  getStoredViewContainersWorkspaceStateValue() {
    return this.storageService.get(this.options.viewContainersWorkspaceStateKey, StorageScope.WORKSPACE, "[]");
  }
  setStoredViewContainersWorkspaceStateValue(value) {
    this.storageService.store(this.options.viewContainersWorkspaceStateKey, value, StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
};
PaneCompositeBar = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IExtensionService),
  __decorateParam(7, IViewDescriptorService),
  __decorateParam(8, IViewsService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IWorkbenchEnvironmentService),
  __decorateParam(11, IWorkbenchLayoutService)
], PaneCompositeBar);
let ViewContainerActivityAction = class extends CompositeBarAction {
  constructor(compositeBarActionItem, part, paneCompositePart, layoutService, configurationService, activityService) {
    super(compositeBarActionItem);
    this.part = part;
    this.paneCompositePart = paneCompositePart;
    this.layoutService = layoutService;
    this.configurationService = configurationService;
    this.activityService = activityService;
    this.lastRun = 0;
    this.updateActivity();
    this._register(this.activityService.onDidChangeActivity((viewContainerOrAction) => {
      if (!isString(viewContainerOrAction) && viewContainerOrAction.id === this.compositeBarActionItem.id) {
        this.updateActivity();
      }
    }));
  }
  updateCompositeBarActionItem(compositeBarActionItem) {
    this.compositeBarActionItem = compositeBarActionItem;
  }
  updateActivity() {
    this.activities = this.activityService.getViewContainerActivities(this.compositeBarActionItem.id);
  }
  async run(event) {
    if (isMouseEvent(event) && event.button === 2) {
      return;
    }
    const now = Date.now();
    if (now > this.lastRun && now - this.lastRun < ViewContainerActivityAction.preventDoubleClickDelay) {
      return;
    }
    this.lastRun = now;
    const focus = event && "preserveFocus" in event ? !event.preserveFocus : true;
    if (this.part === Parts.ACTIVITYBAR_PART) {
      const sideBarVisible = this.layoutService.isVisible(Parts.SIDEBAR_PART);
      const activeViewlet = this.paneCompositePart.getActivePaneComposite();
      const focusBehavior = this.configurationService.getValue("workbench.activityBar.iconClickBehavior");
      if (sideBarVisible && activeViewlet?.getId() === this.compositeBarActionItem.id) {
        switch (focusBehavior) {
          case "focus":
            this.paneCompositePart.openPaneComposite(this.compositeBarActionItem.id, focus);
            break;
          case "toggle":
          default:
            this.layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
            break;
        }
        return;
      }
    }
    await this.paneCompositePart.openPaneComposite(this.compositeBarActionItem.id, focus);
    return this.activate();
  }
};
ViewContainerActivityAction.preventDoubleClickDelay = 300;
ViewContainerActivityAction = __decorateClass([
  __decorateParam(3, IWorkbenchLayoutService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IActivityService)
], ViewContainerActivityAction);
class PlaceHolderViewContainerActivityAction extends ViewContainerActivityAction {
}
class PlaceHolderToggleCompositePinnedAction extends ToggleCompositePinnedAction {
  constructor(id, compositeBar) {
    super({ id, name: id, classNames: void 0 }, compositeBar);
  }
  setActivity(activity) {
    this.label = activity.name;
  }
}
class PlaceHolderToggleCompositeBadgeAction extends ToggleCompositeBadgeAction {
  constructor(id, compositeBar) {
    super({ id, name: id, classNames: void 0 }, compositeBar);
  }
  setCompositeBarActionItem(actionItem) {
    this.label = actionItem.name;
  }
}
export {
  PaneCompositeBar
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxwYW5lQ29tcG9zaXRlQmFyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uc09yaWVudGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgSUFjdGl2aXR5U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2FjdGl2aXR5L2NvbW1vbi9hY3Rpdml0eS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgUGFydHMgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgY29tYmluZWREaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDb2xvclRoZW1lIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb21wb3NpdGVCYXIsIElDb21wb3NpdGVCYXJJdGVtLCBDb21wb3NpdGVEcmFnQW5kRHJvcCB9IGZyb20gJy4vY29tcG9zaXRlQmFyLmpzJztcbmltcG9ydCB7IERpbWVuc2lvbiwgaXNNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDU1NSdWxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbVN0eWxlc2hlZXRzLmpzJztcbmltcG9ydCB7IGFzQ1NTVXJsIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2Nzc1ZhbHVlLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFRvZ2dsZUNvbXBvc2l0ZVBpbm5lZEFjdGlvbiwgSUNvbXBvc2l0ZUJhckNvbG9ycywgSUFjdGl2aXR5SG92ZXJPcHRpb25zLCBUb2dnbGVDb21wb3NpdGVCYWRnZUFjdGlvbiwgQ29tcG9zaXRlQmFyQWN0aW9uLCBJQ29tcG9zaXRlQmFyLCBJQ29tcG9zaXRlQmFyQWN0aW9uSXRlbSB9IGZyb20gJy4vY29tcG9zaXRlQmFyQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBWaWV3Q29udGFpbmVyLCBJVmlld0NvbnRhaW5lck1vZGVsLCBWaWV3Q29udGFpbmVyTG9jYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlLCBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc05hdGl2ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEJlZm9yZTJELCBJQ29tcG9zaXRlRHJhZ0FuZERyb3AgfSBmcm9tICcuLi9kbmQuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElBY3Rpb24sIFNlcGFyYXRvciwgU3VibWVudUFjdGlvbiwgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFN0cmluZ1NIQTEgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IEdlc3R1cmVFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90b3VjaC5qcyc7XG5pbXBvcnQgeyBJUGFuZUNvbXBvc2l0ZVBhcnQgfSBmcm9tICcuL3BhbmVDb21wb3NpdGVQYXJ0LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuXG5pbnRlcmZhY2UgSVBsYWNlaG9sZGVyVmlld0NvbnRhaW5lciB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG5hbWU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGljb25Vcmw/OiBVcmlDb21wb25lbnRzO1xuXHRyZWFkb25seSB0aGVtZUljb24/OiBUaGVtZUljb247XG5cdHJlYWRvbmx5IGlzQnVpbHRpbj86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHZpZXdzPzogeyB3aGVuPzogc3RyaW5nIH1bXTtcblx0Ly8gVE9ETyBAc2FuZHkwODE6IFJlbW92ZSB0aGlzIGFmdGVyIGEgd2hpbGUuIE1pZ3JhdGVkIHRvIHZpc2libGUgaW4gSVZpZXdDb250YWluZXJXb3Jrc3BhY2VTdGF0ZVxuXHRyZWFkb25seSB2aXNpYmxlPzogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIElQaW5uZWRWaWV3Q29udGFpbmVyIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgcGlubmVkOiBib29sZWFuO1xuXHRyZWFkb25seSBvcmRlcj86IG51bWJlcjtcblx0Ly8gVE9ETyBAc2FuZHkwODE6IFJlbW92ZSB0aGlzIGFmdGVyIGEgd2hpbGUuIE1pZ3JhdGVkIHRvIHZpc2libGUgaW4gSVZpZXdDb250YWluZXJXb3Jrc3BhY2VTdGF0ZVxuXHRyZWFkb25seSB2aXNpYmxlOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgSVZpZXdDb250YWluZXJXb3Jrc3BhY2VTdGF0ZSB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHZpc2libGU6IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBJQ2FjaGVkVmlld0NvbnRhaW5lciB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdG5hbWU/OiBzdHJpbmc7XG5cdGljb24/OiBVUkkgfCBUaGVtZUljb247XG5cdHJlYWRvbmx5IHBpbm5lZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgb3JkZXI/OiBudW1iZXI7XG5cdHZpc2libGU6IGJvb2xlYW47XG5cdGlzQnVpbHRpbj86IGJvb2xlYW47XG5cdHZpZXdzPzogeyB3aGVuPzogc3RyaW5nIH1bXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUGFuZUNvbXBvc2l0ZUJhck9wdGlvbnMge1xuXHRyZWFkb25seSBwYXJ0Q29udGFpbmVyQ2xhc3M6IHN0cmluZztcblx0cmVhZG9ubHkgcGlubmVkVmlld0NvbnRhaW5lcnNLZXk6IHN0cmluZztcblx0cmVhZG9ubHkgcGxhY2Vob2xkZXJWaWV3Q29udGFpbmVyc0tleTogc3RyaW5nO1xuXHRyZWFkb25seSB2aWV3Q29udGFpbmVyc1dvcmtzcGFjZVN0YXRlS2V5OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGljb246IGJvb2xlYW47XG5cdHJlYWRvbmx5IGNvbXBhY3Q/OiBib29sZWFuO1xuXHRyZWFkb25seSBpY29uU2l6ZTogbnVtYmVyO1xuXHRyZWFkb25seSByZWNvbXB1dGVTaXplczogYm9vbGVhbjtcblx0cmVhZG9ubHkgb3JpZW50YXRpb246IEFjdGlvbnNPcmllbnRhdGlvbjtcblx0cmVhZG9ubHkgY29tcG9zaXRlU2l6ZTogbnVtYmVyO1xuXHRyZWFkb25seSBvdmVyZmxvd0FjdGlvblNpemU6IG51bWJlcjtcblx0cmVhZG9ubHkgcHJldmVudExvb3BOYXZpZ2F0aW9uPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgYWN0aXZpdHlIb3Zlck9wdGlvbnM6IElBY3Rpdml0eUhvdmVyT3B0aW9ucztcblx0cmVhZG9ubHkgZmlsbEV4dHJhQ29udGV4dE1lbnVBY3Rpb25zOiAoYWN0aW9uczogSUFjdGlvbltdLCBlPzogTW91c2VFdmVudCB8IEdlc3R1cmVFdmVudCkgPT4gdm9pZDtcblx0cmVhZG9ubHkgY29sb3JzOiAodGhlbWU6IElDb2xvclRoZW1lKSA9PiBJQ29tcG9zaXRlQmFyQ29sb3JzO1xufVxuXG5leHBvcnQgY2xhc3MgUGFuZUNvbXBvc2l0ZUJhciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdmlld0NvbnRhaW5lckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBJRGlzcG9zYWJsZT4oKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb21wb3NpdGVCYXI6IENvbXBvc2l0ZUJhcjtcblx0cmVhZG9ubHkgZG5kSGFuZGxlcjogSUNvbXBvc2l0ZURyYWdBbmREcm9wO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbXBvc2l0ZUFjdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIHsgYWN0aXZpdHlBY3Rpb246IFZpZXdDb250YWluZXJBY3Rpdml0eUFjdGlvbjsgcGlubmVkQWN0aW9uOiBUb2dnbGVDb21wb3NpdGVQaW5uZWRBY3Rpb247IGJhZGdlQWN0aW9uOiBUb2dnbGVDb21wb3NpdGVCYWRnZUFjdGlvbjsgZGlzcG9zZTogKCkgPT4gdm9pZCB9PigpKTtcblxuXHRwcml2YXRlIGhhc0V4dGVuc2lvbnNSZWdpc3RlcmVkOiBib29sZWFuID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBvcHRpb25zOiBJUGFuZUNvbXBvc2l0ZUJhck9wdGlvbnMsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IHBhcnQ6IFBhcnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcGFuZUNvbXBvc2l0ZVBhcnQ6IElQYW5lQ29tcG9zaXRlUGFydCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJVmlld3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdmlld1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5kbmRIYW5kbGVyID0gbmV3IENvbXBvc2l0ZURyYWdBbmREcm9wKHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCB0aGlzLmxvY2F0aW9uLCB0aGlzLm9wdGlvbnMub3JpZW50YXRpb24sXG5cdFx0XHRhc3luYyAoaWQ6IHN0cmluZywgZm9jdXM/OiBib29sZWFuKSA9PiB7IHJldHVybiBhd2FpdCB0aGlzLnBhbmVDb21wb3NpdGVQYXJ0Lm9wZW5QYW5lQ29tcG9zaXRlKGlkLCBmb2N1cykgPz8gbnVsbDsgfSxcblx0XHRcdChmcm9tOiBzdHJpbmcsIHRvOiBzdHJpbmcsIGJlZm9yZT86IEJlZm9yZTJEKSA9PiB0aGlzLmNvbXBvc2l0ZUJhci5tb3ZlKGZyb20sIHRvLCB0aGlzLm9wdGlvbnMub3JpZW50YXRpb24gPT09IEFjdGlvbnNPcmllbnRhdGlvbi5WRVJUSUNBTCA/IGJlZm9yZT8udmVydGljYWxseUJlZm9yZSA6IGJlZm9yZT8uaG9yaXpvbnRhbGx5QmVmb3JlKSxcblx0XHRcdCgpID0+IHRoaXMuY29tcG9zaXRlQmFyLmdldENvbXBvc2l0ZUJhckl0ZW1zKCksXG5cdFx0KTtcblxuXHRcdGNvbnN0IGNhY2hlZEl0ZW1zID0gdGhpcy5jYWNoZWRWaWV3Q29udGFpbmVyc1xuXHRcdFx0Lm1hcChjb250YWluZXIgPT4gKHtcblx0XHRcdFx0aWQ6IGNvbnRhaW5lci5pZCxcblx0XHRcdFx0bmFtZTogY29udGFpbmVyLm5hbWUsXG5cdFx0XHRcdHZpc2libGU6ICF0aGlzLnNob3VsZEJlSGlkZGVuKGNvbnRhaW5lci5pZCwgY29udGFpbmVyKSxcblx0XHRcdFx0b3JkZXI6IGNvbnRhaW5lci5vcmRlcixcblx0XHRcdFx0cGlubmVkOiBjb250YWluZXIucGlubmVkLFxuXHRcdFx0fSkpO1xuXHRcdHRoaXMuY29tcG9zaXRlQmFyID0gdGhpcy5jcmVhdGVDb21wb3NpdGVCYXIoY2FjaGVkSXRlbXMpO1xuXHRcdHRoaXMub25EaWRSZWdpc3RlclZpZXdDb250YWluZXJzKHRoaXMuZ2V0Vmlld0NvbnRhaW5lcnMoKSk7XG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVDb21wb3NpdGVCYXIoY2FjaGVkSXRlbXM6IElDb21wb3NpdGVCYXJJdGVtW10pIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb21wb3NpdGVCYXIsIGNhY2hlZEl0ZW1zLCB7XG5cdFx0XHRpY29uOiB0aGlzLm9wdGlvbnMuaWNvbixcblx0XHRcdGNvbXBhY3Q6IHRoaXMub3B0aW9ucy5jb21wYWN0LFxuXHRcdFx0b3JpZW50YXRpb246IHRoaXMub3B0aW9ucy5vcmllbnRhdGlvbixcblx0XHRcdGFjdGl2aXR5SG92ZXJPcHRpb25zOiB0aGlzLm9wdGlvbnMuYWN0aXZpdHlIb3Zlck9wdGlvbnMsXG5cdFx0XHRwcmV2ZW50TG9vcE5hdmlnYXRpb246IHRoaXMub3B0aW9ucy5wcmV2ZW50TG9vcE5hdmlnYXRpb24sXG5cdFx0XHRvcGVuQ29tcG9zaXRlOiBhc3luYyAoY29tcG9zaXRlSWQsIHByZXNlcnZlRm9jdXMpID0+IHtcblx0XHRcdFx0cmV0dXJuIChhd2FpdCB0aGlzLnBhbmVDb21wb3NpdGVQYXJ0Lm9wZW5QYW5lQ29tcG9zaXRlKGNvbXBvc2l0ZUlkLCAhcHJlc2VydmVGb2N1cykpID8/IG51bGw7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0QWN0aXZpdHlBY3Rpb246IGNvbXBvc2l0ZUlkID0+IHRoaXMuZ2V0Q29tcG9zaXRlQWN0aW9ucyhjb21wb3NpdGVJZCkuYWN0aXZpdHlBY3Rpb24sXG5cdFx0XHRnZXRDb21wb3NpdGVQaW5uZWRBY3Rpb246IGNvbXBvc2l0ZUlkID0+IHRoaXMuZ2V0Q29tcG9zaXRlQWN0aW9ucyhjb21wb3NpdGVJZCkucGlubmVkQWN0aW9uLFxuXHRcdFx0Z2V0Q29tcG9zaXRlQmFkZ2VBY3Rpb246IGNvbXBvc2l0ZUlkID0+IHRoaXMuZ2V0Q29tcG9zaXRlQWN0aW9ucyhjb21wb3NpdGVJZCkuYmFkZ2VBY3Rpb24sXG5cdFx0XHRnZXRPbkNvbXBvc2l0ZUNsaWNrQWN0aW9uOiBjb21wb3NpdGVJZCA9PiB0aGlzLmdldENvbXBvc2l0ZUFjdGlvbnMoY29tcG9zaXRlSWQpLmFjdGl2aXR5QWN0aW9uLFxuXHRcdFx0ZmlsbEV4dHJhQ29udGV4dE1lbnVBY3Rpb25zOiAoYWN0aW9ucywgZSkgPT4gdGhpcy5vcHRpb25zLmZpbGxFeHRyYUNvbnRleHRNZW51QWN0aW9ucyhhY3Rpb25zLCBlKSxcblx0XHRcdGdldENvbnRleHRNZW51QWN0aW9uc0ZvckNvbXBvc2l0ZTogY29tcG9zaXRlSWQgPT4gdGhpcy5nZXRDb250ZXh0TWVudUFjdGlvbnNGb3JDb21wb3NpdGUoY29tcG9zaXRlSWQpLFxuXHRcdFx0Z2V0RGVmYXVsdENvbXBvc2l0ZUlkOiAoKSA9PiB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXREZWZhdWx0Vmlld0NvbnRhaW5lcih0aGlzLmxvY2F0aW9uKT8uaWQsXG5cdFx0XHRkbmRIYW5kbGVyOiB0aGlzLmRuZEhhbmRsZXIsXG5cdFx0XHRjb21wb3NpdGVTaXplOiB0aGlzLm9wdGlvbnMuY29tcG9zaXRlU2l6ZSxcblx0XHRcdG92ZXJmbG93QWN0aW9uU2l6ZTogdGhpcy5vcHRpb25zLm92ZXJmbG93QWN0aW9uU2l6ZSxcblx0XHRcdGNvbG9yczogdGhlbWUgPT4gdGhpcy5vcHRpb25zLmNvbG9ycyh0aGVtZSksXG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb250ZXh0TWVudUFjdGlvbnNGb3JDb21wb3NpdGUoY29tcG9zaXRlSWQ6IHN0cmluZyk6IElBY3Rpb25bXSB7XG5cdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW25ldyBTZXBhcmF0b3IoKV07XG5cblx0XHRjb25zdCB2aWV3Q29udGFpbmVyID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5SWQoY29tcG9zaXRlSWQpITtcblx0XHRjb25zdCBkZWZhdWx0TG9jYXRpb24gPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXREZWZhdWx0Vmlld0NvbnRhaW5lckxvY2F0aW9uKHZpZXdDb250YWluZXIpITtcblx0XHRjb25zdCBjdXJyZW50TG9jYXRpb24gPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24odmlld0NvbnRhaW5lcik7XG5cblx0XHQvLyBNb3ZlIFZpZXcgQ29udGFpbmVyXG5cdFx0Y29uc3QgbW92ZUFjdGlvbnMgPSBbXTtcblx0XHRmb3IgKGNvbnN0IGxvY2F0aW9uIG9mIFtWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhciwgVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhciwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsXSkge1xuXHRcdFx0aWYgKGN1cnJlbnRMb2NhdGlvbiAhPT0gbG9jYXRpb24pIHtcblx0XHRcdFx0bW92ZUFjdGlvbnMucHVzaCh0aGlzLmNyZWF0ZU1vdmVBY3Rpb24odmlld0NvbnRhaW5lciwgbG9jYXRpb24sIGRlZmF1bHRMb2NhdGlvbikpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGFjdGlvbnMucHVzaChuZXcgU3VibWVudUFjdGlvbignbW92ZVRvTWVudScsIGxvY2FsaXplKCdtb3ZlVG9NZW51JywgXCJNb3ZlIFRvXCIpLCBtb3ZlQWN0aW9ucykpO1xuXG5cdFx0Ly8gUmVzZXQgTG9jYXRpb25cblx0XHRpZiAoZGVmYXVsdExvY2F0aW9uICE9PSBjdXJyZW50TG9jYXRpb24pIHtcblx0XHRcdGFjdGlvbnMucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRcdGlkOiAncmVzZXRMb2NhdGlvbkFjdGlvbicsIGxhYmVsOiBsb2NhbGl6ZSgncmVzZXRMb2NhdGlvbicsIFwiUmVzZXQgTG9jYXRpb25cIiksIHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLm1vdmVWaWV3Q29udGFpbmVyVG9Mb2NhdGlvbih2aWV3Q29udGFpbmVyLCBkZWZhdWx0TG9jYXRpb24sIHVuZGVmaW5lZCwgJ3Jlc2V0TG9jYXRpb25BY3Rpb24nKTtcblx0XHRcdFx0XHR0aGlzLnZpZXdTZXJ2aWNlLm9wZW5WaWV3Q29udGFpbmVyKHZpZXdDb250YWluZXIuaWQsIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHZpZXdDb250YWluZXJNb2RlbCA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJNb2RlbCh2aWV3Q29udGFpbmVyKTtcblx0XHRcdGlmICh2aWV3Q29udGFpbmVyTW9kZWwuYWxsVmlld0Rlc2NyaXB0b3JzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRjb25zdCB2aWV3VG9SZXNldCA9IHZpZXdDb250YWluZXJNb2RlbC5hbGxWaWV3RGVzY3JpcHRvcnNbMF07XG5cdFx0XHRcdGNvbnN0IGRlZmF1bHRDb250YWluZXIgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXREZWZhdWx0Q29udGFpbmVyQnlJZCh2aWV3VG9SZXNldC5pZCkhO1xuXHRcdFx0XHRpZiAoZGVmYXVsdENvbnRhaW5lciAhPT0gdmlld0NvbnRhaW5lcikge1xuXHRcdFx0XHRcdGFjdGlvbnMucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRcdFx0XHRpZDogJ3Jlc2V0TG9jYXRpb25BY3Rpb24nLCBsYWJlbDogbG9jYWxpemUoJ3Jlc2V0TG9jYXRpb24nLCBcIlJlc2V0IExvY2F0aW9uXCIpLCBydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0dGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UubW92ZVZpZXdzVG9Db250YWluZXIoW3ZpZXdUb1Jlc2V0XSwgZGVmYXVsdENvbnRhaW5lciwgdW5kZWZpbmVkLCAncmVzZXRMb2NhdGlvbkFjdGlvbicpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLnZpZXdTZXJ2aWNlLm9wZW5WaWV3Q29udGFpbmVyKHZpZXdDb250YWluZXIuaWQsIHRydWUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBhY3Rpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVNb3ZlQWN0aW9uKHZpZXdDb250YWluZXI6IFZpZXdDb250YWluZXIsIG5ld0xvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24sIGRlZmF1bHRMb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uKTogSUFjdGlvbiB7XG5cdFx0cmV0dXJuIHRvQWN0aW9uKHtcblx0XHRcdGlkOiBgbW92ZVZpZXdDb250YWluZXJUbyR7bmV3TG9jYXRpb259YCxcblx0XHRcdGxhYmVsOiBuZXdMb2NhdGlvbiA9PT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsID8gbG9jYWxpemUoJ3BhbmVsJywgXCJQYW5lbFwiKSA6IG5ld0xvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhciA/IGxvY2FsaXplKCdzaWRlYmFyJywgXCJQcmltYXJ5IFNpZGUgQmFyXCIpIDogbG9jYWxpemUoJ2F1eGlsaWFyeWJhcicsIFwiU2Vjb25kYXJ5IFNpZGUgQmFyXCIpLFxuXHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdGxldCBpbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAobmV3TG9jYXRpb24gIT09IGRlZmF1bHRMb2NhdGlvbikge1xuXHRcdFx0XHRcdGluZGV4ID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lcnNCeUxvY2F0aW9uKG5ld0xvY2F0aW9uKS5sZW5ndGg7IC8vIG1vdmUgdG8gdGhlIGVuZCBvZiB0aGUgbG9jYXRpb25cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpbmRleCA9IHVuZGVmaW5lZDsgLy8gcmVzdG9yZSBkZWZhdWx0IGxvY2F0aW9uXG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UubW92ZVZpZXdDb250YWluZXJUb0xvY2F0aW9uKHZpZXdDb250YWluZXIsIG5ld0xvY2F0aW9uLCBpbmRleCk7XG5cdFx0XHRcdHRoaXMudmlld1NlcnZpY2Uub3BlblZpZXdDb250YWluZXIodmlld0NvbnRhaW5lci5pZCwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXG5cdFx0Ly8gVmlldyBDb250YWluZXIgQ2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLm9uRGlkQ2hhbmdlVmlld0NvbnRhaW5lcnMoKHsgYWRkZWQsIHJlbW92ZWQgfSkgPT4gdGhpcy5vbkRpZENoYW5nZVZpZXdDb250YWluZXJzKGFkZGVkLCByZW1vdmVkKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGFpbmVyTG9jYXRpb24oKHsgdmlld0NvbnRhaW5lciwgZnJvbSwgdG8gfSkgPT4gdGhpcy5vbkRpZENoYW5nZVZpZXdDb250YWluZXJMb2NhdGlvbih2aWV3Q29udGFpbmVyLCBmcm9tLCB0bykpKTtcblxuXHRcdC8vIFZpZXcgQ29udGFpbmVyIFZpc2liaWxpdHkgQ2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucGFuZUNvbXBvc2l0ZVBhcnQub25EaWRQYW5lQ29tcG9zaXRlT3BlbihlID0+IHRoaXMub25EaWRDaGFuZ2VWaWV3Q29udGFpbmVyVmlzaWJpbGl0eShlLmdldElkKCksIHRydWUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5wYW5lQ29tcG9zaXRlUGFydC5vbkRpZFBhbmVDb21wb3NpdGVDbG9zZShlID0+IHRoaXMub25EaWRDaGFuZ2VWaWV3Q29udGFpbmVyVmlzaWJpbGl0eShlLmdldElkKCksIGZhbHNlKSkpO1xuXG5cdFx0Ly8gRXh0ZW5zaW9uIHJlZ2lzdHJhdGlvblxuXHRcdHRoaXMuZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKS50aGVuKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMub25EaWRSZWdpc3RlckV4dGVuc2lvbnMoKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29tcG9zaXRlQmFyLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0dGhpcy51cGRhdGVDb21wb3NpdGVCYXJJdGVtc0Zyb21TdG9yYWdlKHRydWUpO1xuXHRcdFx0XHR0aGlzLnNhdmVDYWNoZWRWaWV3Q29udGFpbmVycygpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCB0aGlzLm9wdGlvbnMucGlubmVkVmlld0NvbnRhaW5lcnNLZXksIHRoaXMuX3N0b3JlKSgoKSA9PiB0aGlzLnVwZGF0ZUNvbXBvc2l0ZUJhckl0ZW1zRnJvbVN0b3JhZ2UoZmFsc2UpKSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlVmlld0NvbnRhaW5lcnMoYWRkZWQ6IHJlYWRvbmx5IHsgY29udGFpbmVyOiBWaWV3Q29udGFpbmVyOyBsb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uIH1bXSwgcmVtb3ZlZDogcmVhZG9ubHkgeyBjb250YWluZXI6IFZpZXdDb250YWluZXI7IGxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24gfVtdKSB7XG5cdFx0cmVtb3ZlZC5maWx0ZXIoKHsgbG9jYXRpb24gfSkgPT4gbG9jYXRpb24gPT09IHRoaXMubG9jYXRpb24pLmZvckVhY2goKHsgY29udGFpbmVyIH0pID0+IHRoaXMub25EaWREZXJlZ2lzdGVyVmlld0NvbnRhaW5lcihjb250YWluZXIpKTtcblx0XHR0aGlzLm9uRGlkUmVnaXN0ZXJWaWV3Q29udGFpbmVycyhhZGRlZC5maWx0ZXIoKHsgbG9jYXRpb24gfSkgPT4gbG9jYXRpb24gPT09IHRoaXMubG9jYXRpb24pLm1hcCgoeyBjb250YWluZXIgfSkgPT4gY29udGFpbmVyKSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlVmlld0NvbnRhaW5lckxvY2F0aW9uKGNvbnRhaW5lcjogVmlld0NvbnRhaW5lciwgZnJvbTogVmlld0NvbnRhaW5lckxvY2F0aW9uLCB0bzogVmlld0NvbnRhaW5lckxvY2F0aW9uKSB7XG5cdFx0aWYgKGZyb20gPT09IHRoaXMubG9jYXRpb24pIHtcblx0XHRcdHRoaXMub25EaWREZXJlZ2lzdGVyVmlld0NvbnRhaW5lcihjb250YWluZXIpO1xuXHRcdH1cblxuXHRcdGlmICh0byA9PT0gdGhpcy5sb2NhdGlvbikge1xuXHRcdFx0dGhpcy5vbkRpZFJlZ2lzdGVyVmlld0NvbnRhaW5lcnMoW2NvbnRhaW5lcl0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VWaWV3Q29udGFpbmVyVmlzaWJpbGl0eShpZDogc3RyaW5nLCB2aXNpYmxlOiBib29sZWFuKSB7XG5cdFx0aWYgKHZpc2libGUpIHtcblx0XHRcdC8vIEFjdGl2YXRlIHZpZXcgY29udGFpbmVyIGFjdGlvbiBvbiBvcGVuaW5nIG9mIGEgdmlldyBjb250YWluZXJcblx0XHRcdHRoaXMub25EaWRWaWV3Q29udGFpbmVyVmlzaWJsZShpZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIERlYWN0aXZhdGUgdmlldyBjb250YWluZXIgYWN0aW9uIG9uIGNsb3NlXG5cdFx0XHR0aGlzLmNvbXBvc2l0ZUJhci5kZWFjdGl2YXRlQ29tcG9zaXRlKGlkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkUmVnaXN0ZXJFeHRlbnNpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuaGFzRXh0ZW5zaW9uc1JlZ2lzdGVyZWQgPSB0cnVlO1xuXG5cdFx0Ly8gc2hvdy9oaWRlL3JlbW92ZSBjb21wb3NpdGVzXG5cdFx0Zm9yIChjb25zdCB7IGlkIH0gb2YgdGhpcy5jYWNoZWRWaWV3Q29udGFpbmVycykge1xuXHRcdFx0Y29uc3Qgdmlld0NvbnRhaW5lciA9IHRoaXMuZ2V0Vmlld0NvbnRhaW5lcihpZCk7XG5cdFx0XHRpZiAodmlld0NvbnRhaW5lcikge1xuXHRcdFx0XHR0aGlzLnNob3dPckhpZGVWaWV3Q29udGFpbmVyKHZpZXdDb250YWluZXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmlzVmlld0NvbnRhaW5lclJlbW92ZWRQZXJtYW5lbnRseShpZCkpIHtcblx0XHRcdFx0XHR0aGlzLnJlbW92ZUNvbXBvc2l0ZShpZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5oaWRlQ29tcG9zaXRlKGlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuc2F2ZUNhY2hlZFZpZXdDb250YWluZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkVmlld0NvbnRhaW5lclZpc2libGUoaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHZpZXdDb250YWluZXIgPSB0aGlzLmdldFZpZXdDb250YWluZXIoaWQpO1xuXHRcdGlmICh2aWV3Q29udGFpbmVyKSB7XG5cblx0XHRcdC8vIFVwZGF0ZSB0aGUgY29tcG9zaXRlIGJhciBieSBhZGRpbmdcblx0XHRcdHRoaXMuYWRkQ29tcG9zaXRlKHZpZXdDb250YWluZXIpO1xuXHRcdFx0dGhpcy5jb21wb3NpdGVCYXIuYWN0aXZhdGVDb21wb3NpdGUodmlld0NvbnRhaW5lci5pZCk7XG5cblx0XHRcdGlmICh0aGlzLnNob3VsZEJlSGlkZGVuKHZpZXdDb250YWluZXIpKSB7XG5cdFx0XHRcdGNvbnN0IHZpZXdDb250YWluZXJNb2RlbCA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJNb2RlbCh2aWV3Q29udGFpbmVyKTtcblx0XHRcdFx0aWYgKHZpZXdDb250YWluZXJNb2RlbC5hY3RpdmVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0Ly8gVXBkYXRlIHRoZSBjb21wb3NpdGUgYmFyIGJ5IGhpZGluZ1xuXHRcdFx0XHRcdHRoaXMuaGlkZUNvbXBvc2l0ZSh2aWV3Q29udGFpbmVyLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNyZWF0ZShwYXJlbnQ6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLmNvbXBvc2l0ZUJhci5jcmVhdGUocGFyZW50KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29tcG9zaXRlQWN0aW9ucyhjb21wb3NpdGVJZDogc3RyaW5nKTogeyBhY3Rpdml0eUFjdGlvbjogVmlld0NvbnRhaW5lckFjdGl2aXR5QWN0aW9uOyBwaW5uZWRBY3Rpb246IFRvZ2dsZUNvbXBvc2l0ZVBpbm5lZEFjdGlvbjsgYmFkZ2VBY3Rpb246IFRvZ2dsZUNvbXBvc2l0ZUJhZGdlQWN0aW9uIH0ge1xuXHRcdGxldCBjb21wb3NpdGVBY3Rpb25zID0gdGhpcy5jb21wb3NpdGVBY3Rpb25zLmdldChjb21wb3NpdGVJZCk7XG5cdFx0aWYgKCFjb21wb3NpdGVBY3Rpb25zKSB7XG5cdFx0XHRjb25zdCB2aWV3Q29udGFpbmVyID0gdGhpcy5nZXRWaWV3Q29udGFpbmVyKGNvbXBvc2l0ZUlkKTtcblx0XHRcdGxldCBhY3Rpdml0eUFjdGlvbjogVmlld0NvbnRhaW5lckFjdGl2aXR5QWN0aW9uO1xuXHRcdFx0bGV0IHBpbm5lZEFjdGlvbjogVG9nZ2xlQ29tcG9zaXRlUGlubmVkQWN0aW9uO1xuXHRcdFx0bGV0IGJhZGdlQWN0aW9uOiBUb2dnbGVDb21wb3NpdGVCYWRnZUFjdGlvbjtcblx0XHRcdGlmICh2aWV3Q29udGFpbmVyKSB7XG5cdFx0XHRcdGNvbnN0IHZpZXdDb250YWluZXJNb2RlbCA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJNb2RlbCh2aWV3Q29udGFpbmVyKTtcblx0XHRcdFx0Y29uc3QgYWN0aW9uSXRlbSA9IHRoaXMudG9Db21wb3NpdGVCYXJBY3Rpb25JdGVtRnJvbSh2aWV3Q29udGFpbmVyTW9kZWwpO1xuXHRcdFx0XHRhY3Rpdml0eUFjdGlvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVmlld0NvbnRhaW5lckFjdGl2aXR5QWN0aW9uLCBhY3Rpb25JdGVtLCB0aGlzLnBhcnQsIHRoaXMucGFuZUNvbXBvc2l0ZVBhcnQpO1xuXHRcdFx0XHRwaW5uZWRBY3Rpb24gPSBuZXcgVG9nZ2xlQ29tcG9zaXRlUGlubmVkQWN0aW9uKGFjdGlvbkl0ZW0sIHRoaXMuY29tcG9zaXRlQmFyKTtcblx0XHRcdFx0YmFkZ2VBY3Rpb24gPSBuZXcgVG9nZ2xlQ29tcG9zaXRlQmFkZ2VBY3Rpb24oYWN0aW9uSXRlbSwgdGhpcy5jb21wb3NpdGVCYXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgY2FjaGVkQ29tcG9zaXRlID0gdGhpcy5jYWNoZWRWaWV3Q29udGFpbmVycy5maWx0ZXIoYyA9PiBjLmlkID09PSBjb21wb3NpdGVJZClbMF07XG5cdFx0XHRcdGNvbnN0IGFjdGlvbkl0ZW0gPSB0aGlzLnRvQ29tcG9zaXRlQmFyQWN0aW9uSXRlbShjb21wb3NpdGVJZCwgY2FjaGVkQ29tcG9zaXRlPy5uYW1lID8/IGNvbXBvc2l0ZUlkLCBjYWNoZWRDb21wb3NpdGU/Lmljb24sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGFjdGl2aXR5QWN0aW9uID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQbGFjZUhvbGRlclZpZXdDb250YWluZXJBY3Rpdml0eUFjdGlvbiwgYWN0aW9uSXRlbSwgdGhpcy5wYXJ0LCB0aGlzLnBhbmVDb21wb3NpdGVQYXJ0KTtcblx0XHRcdFx0cGlubmVkQWN0aW9uID0gbmV3IFBsYWNlSG9sZGVyVG9nZ2xlQ29tcG9zaXRlUGlubmVkQWN0aW9uKGNvbXBvc2l0ZUlkLCB0aGlzLmNvbXBvc2l0ZUJhcik7XG5cdFx0XHRcdGJhZGdlQWN0aW9uID0gbmV3IFBsYWNlSG9sZGVyVG9nZ2xlQ29tcG9zaXRlQmFkZ2VBY3Rpb24oY29tcG9zaXRlSWQsIHRoaXMuY29tcG9zaXRlQmFyKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGNvbWJpbmVkRGlzcG9zYWJsZShhY3Rpdml0eUFjdGlvbiwgcGlubmVkQWN0aW9uLCBiYWRnZUFjdGlvbik7XG5cdFx0XHRjb21wb3NpdGVBY3Rpb25zID0geyBhY3Rpdml0eUFjdGlvbiwgcGlubmVkQWN0aW9uLCBiYWRnZUFjdGlvbiwgZGlzcG9zZTogKCkgPT4gZGlzcG9zYWJsZS5kaXNwb3NlKCkgfTtcblx0XHRcdHRoaXMuY29tcG9zaXRlQWN0aW9ucy5zZXQoY29tcG9zaXRlSWQsIGNvbXBvc2l0ZUFjdGlvbnMpO1xuXHRcdH1cblxuXHRcdHJldHVybiBjb21wb3NpdGVBY3Rpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZFJlZ2lzdGVyVmlld0NvbnRhaW5lcnModmlld0NvbnRhaW5lcnM6IHJlYWRvbmx5IFZpZXdDb250YWluZXJbXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgdmlld0NvbnRhaW5lciBvZiB2aWV3Q29udGFpbmVycykge1xuXHRcdFx0dGhpcy5hZGRDb21wb3NpdGUodmlld0NvbnRhaW5lcik7XG5cblx0XHRcdC8vIFBpbiBpdCBieSBkZWZhdWx0IGlmIGl0IGlzIG5ld1xuXHRcdFx0Y29uc3QgY2FjaGVkVmlld0NvbnRhaW5lciA9IHRoaXMuY2FjaGVkVmlld0NvbnRhaW5lcnMuZmlsdGVyKCh7IGlkIH0pID0+IGlkID09PSB2aWV3Q29udGFpbmVyLmlkKVswXTtcblx0XHRcdGlmICghY2FjaGVkVmlld0NvbnRhaW5lcikge1xuXHRcdFx0XHR0aGlzLmNvbXBvc2l0ZUJhci5waW4odmlld0NvbnRhaW5lci5pZCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEFjdGl2ZVxuXHRcdFx0Y29uc3QgdmlzaWJsZVZpZXdDb250YWluZXIgPSB0aGlzLnBhbmVDb21wb3NpdGVQYXJ0LmdldEFjdGl2ZVBhbmVDb21wb3NpdGUoKTtcblx0XHRcdGlmICh2aXNpYmxlVmlld0NvbnRhaW5lcj8uZ2V0SWQoKSA9PT0gdmlld0NvbnRhaW5lci5pZCkge1xuXHRcdFx0XHR0aGlzLmNvbXBvc2l0ZUJhci5hY3RpdmF0ZUNvbXBvc2l0ZSh2aWV3Q29udGFpbmVyLmlkKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgdmlld0NvbnRhaW5lck1vZGVsID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKHZpZXdDb250YWluZXIpO1xuXHRcdFx0dGhpcy51cGRhdGVDb21wb3NpdGVCYXJBY3Rpb25JdGVtKHZpZXdDb250YWluZXIsIHZpZXdDb250YWluZXJNb2RlbCk7XG5cdFx0XHR0aGlzLnNob3dPckhpZGVWaWV3Q29udGFpbmVyKHZpZXdDb250YWluZXIpO1xuXG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh2aWV3Q29udGFpbmVyTW9kZWwub25EaWRDaGFuZ2VDb250YWluZXJJbmZvKCgpID0+IHRoaXMudXBkYXRlQ29tcG9zaXRlQmFyQWN0aW9uSXRlbSh2aWV3Q29udGFpbmVyLCB2aWV3Q29udGFpbmVyTW9kZWwpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodmlld0NvbnRhaW5lck1vZGVsLm9uRGlkQ2hhbmdlQWN0aXZlVmlld0Rlc2NyaXB0b3JzKCgpID0+IHRoaXMuc2hvd09ySGlkZVZpZXdDb250YWluZXIodmlld0NvbnRhaW5lcikpKTtcblxuXHRcdFx0dGhpcy52aWV3Q29udGFpbmVyRGlzcG9zYWJsZXMuc2V0KHZpZXdDb250YWluZXIuaWQsIGRpc3Bvc2FibGVzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkRGVyZWdpc3RlclZpZXdDb250YWluZXIodmlld0NvbnRhaW5lcjogVmlld0NvbnRhaW5lcik6IHZvaWQge1xuXHRcdHRoaXMudmlld0NvbnRhaW5lckRpc3Bvc2FibGVzLmRlbGV0ZUFuZERpc3Bvc2Uodmlld0NvbnRhaW5lci5pZCk7XG5cdFx0dGhpcy5yZW1vdmVDb21wb3NpdGUodmlld0NvbnRhaW5lci5pZCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0odmlld0NvbnRhaW5lcjogVmlld0NvbnRhaW5lciwgdmlld0NvbnRhaW5lck1vZGVsOiBJVmlld0NvbnRhaW5lck1vZGVsKTogdm9pZCB7XG5cdFx0Y29uc3QgY29tcG9zaXRlQmFyQWN0aW9uSXRlbSA9IHRoaXMudG9Db21wb3NpdGVCYXJBY3Rpb25JdGVtRnJvbSh2aWV3Q29udGFpbmVyTW9kZWwpO1xuXHRcdGNvbnN0IHsgYWN0aXZpdHlBY3Rpb24sIHBpbm5lZEFjdGlvbiB9ID0gdGhpcy5nZXRDb21wb3NpdGVBY3Rpb25zKHZpZXdDb250YWluZXIuaWQpO1xuXHRcdGFjdGl2aXR5QWN0aW9uLnVwZGF0ZUNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0oY29tcG9zaXRlQmFyQWN0aW9uSXRlbSk7XG5cblx0XHRpZiAocGlubmVkQWN0aW9uIGluc3RhbmNlb2YgUGxhY2VIb2xkZXJUb2dnbGVDb21wb3NpdGVQaW5uZWRBY3Rpb24pIHtcblx0XHRcdHBpbm5lZEFjdGlvbi5zZXRBY3Rpdml0eShjb21wb3NpdGVCYXJBY3Rpb25JdGVtKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLnJlY29tcHV0ZVNpemVzKSB7XG5cdFx0XHR0aGlzLmNvbXBvc2l0ZUJhci5yZWNvbXB1dGVTaXplcygpO1xuXHRcdH1cblxuXHRcdHRoaXMuc2F2ZUNhY2hlZFZpZXdDb250YWluZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHRvQ29tcG9zaXRlQmFyQWN0aW9uSXRlbUZyb20odmlld0NvbnRhaW5lck1vZGVsOiBJVmlld0NvbnRhaW5lck1vZGVsKTogSUNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0ge1xuXHRcdHJldHVybiB0aGlzLnRvQ29tcG9zaXRlQmFyQWN0aW9uSXRlbSh2aWV3Q29udGFpbmVyTW9kZWwudmlld0NvbnRhaW5lci5pZCwgdmlld0NvbnRhaW5lck1vZGVsLnRpdGxlLCB2aWV3Q29udGFpbmVyTW9kZWwuaWNvbiwgdmlld0NvbnRhaW5lck1vZGVsLmtleWJpbmRpbmdJZCk7XG5cdH1cblxuXHRwcml2YXRlIHRvQ29tcG9zaXRlQmFyQWN0aW9uSXRlbShpZDogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIGljb246IFVSSSB8IFRoZW1lSWNvbiB8IHVuZGVmaW5lZCwga2V5YmluZGluZ0lkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJQ29tcG9zaXRlQmFyQWN0aW9uSXRlbSB7XG5cdFx0bGV0IGNsYXNzTmFtZXM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBpY29uVXJsOiBVUkkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5pY29uKSB7XG5cdFx0XHRpZiAoVVJJLmlzVXJpKGljb24pKSB7XG5cdFx0XHRcdGljb25VcmwgPSBpY29uO1xuXHRcdFx0XHRjb25zdCBjc3NVcmwgPSBhc0NTU1VybChpY29uKTtcblx0XHRcdFx0Y29uc3QgaGFzaCA9IG5ldyBTdHJpbmdTSEExKCk7XG5cdFx0XHRcdGhhc2gudXBkYXRlKGNzc1VybCk7XG5cdFx0XHRcdGNvbnN0IGljb25JZCA9IGBhY3Rpdml0eS0ke2lkLnJlcGxhY2UoL1xcLi9nLCAnLScpfS0ke2hhc2guZGlnZXN0KCl9YDtcblx0XHRcdFx0Y29uc3QgaWNvbkNsYXNzID0gYC5tb25hY28td29ya2JlbmNoIC4ke3RoaXMub3B0aW9ucy5wYXJ0Q29udGFpbmVyQ2xhc3N9IC5tb25hY28tYWN0aW9uLWJhciAuYWN0aW9uLWxhYmVsLiR7aWNvbklkfWA7XG5cdFx0XHRcdGNsYXNzTmFtZXMgPSBbaWNvbklkLCAndXJpLWljb24nXTtcblx0XHRcdFx0Y3JlYXRlQ1NTUnVsZShpY29uQ2xhc3MsIGBcblx0XHRcdFx0bWFzazogJHtjc3NVcmx9IG5vLXJlcGVhdCA1MCUgNTAlO1xuXHRcdFx0XHRtYXNrLXNpemU6IHZhcigtLWFjdGl2aXR5LWJhci1pY29uLXNpemUsICR7dGhpcy5vcHRpb25zLmljb25TaXplfXB4KTtcblx0XHRcdFx0LXdlYmtpdC1tYXNrOiAke2Nzc1VybH0gbm8tcmVwZWF0IDUwJSA1MCU7XG5cdFx0XHRcdC13ZWJraXQtbWFzay1zaXplOiB2YXIoLS1hY3Rpdml0eS1iYXItaWNvbi1zaXplLCAke3RoaXMub3B0aW9ucy5pY29uU2l6ZX1weCk7XG5cdFx0XHRcdG1hc2stb3JpZ2luOiBwYWRkaW5nO1xuXHRcdFx0XHQtd2Via2l0LW1hc2stb3JpZ2luOiBwYWRkaW5nO1xuXHRcdFx0YCk7XG5cdFx0XHR9IGVsc2UgaWYgKFRoZW1lSWNvbi5pc1RoZW1lSWNvbihpY29uKSkge1xuXHRcdFx0XHRjbGFzc05hbWVzID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoaWNvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgaWQsIG5hbWUsIGNsYXNzTmFtZXMsIGljb25VcmwsIGtleWJpbmRpbmdJZCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBzaG93T3JIaWRlVmlld0NvbnRhaW5lcih2aWV3Q29udGFpbmVyOiBWaWV3Q29udGFpbmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuc2hvdWxkQmVIaWRkZW4odmlld0NvbnRhaW5lcikpIHtcblx0XHRcdHRoaXMuaGlkZUNvbXBvc2l0ZSh2aWV3Q29udGFpbmVyLmlkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5hZGRDb21wb3NpdGUodmlld0NvbnRhaW5lcik7XG5cblx0XHRcdC8vIEFjdGl2YXRlIGlmIHRoaXMgaXMgdGhlIGFjdGl2ZSBwYW5lIGNvbXBvc2l0ZVxuXHRcdFx0Y29uc3QgYWN0aXZlUGFuZUNvbXBvc2l0ZSA9IHRoaXMucGFuZUNvbXBvc2l0ZVBhcnQuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZSgpO1xuXHRcdFx0aWYgKGFjdGl2ZVBhbmVDb21wb3NpdGU/LmdldElkKCkgPT09IHZpZXdDb250YWluZXIuaWQpIHtcblx0XHRcdFx0dGhpcy5jb21wb3NpdGVCYXIuYWN0aXZhdGVDb21wb3NpdGUodmlld0NvbnRhaW5lci5pZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRCZUhpZGRlbih2aWV3Q29udGFpbmVyT3JJZDogc3RyaW5nIHwgVmlld0NvbnRhaW5lciwgY2FjaGVkVmlld0NvbnRhaW5lcj86IElDYWNoZWRWaWV3Q29udGFpbmVyKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgdmlld0NvbnRhaW5lciA9IGlzU3RyaW5nKHZpZXdDb250YWluZXJPcklkKSA/IHRoaXMuZ2V0Vmlld0NvbnRhaW5lcih2aWV3Q29udGFpbmVyT3JJZCkgOiB2aWV3Q29udGFpbmVyT3JJZDtcblx0XHRjb25zdCB2aWV3Q29udGFpbmVySWQgPSBpc1N0cmluZyh2aWV3Q29udGFpbmVyT3JJZCkgPyB2aWV3Q29udGFpbmVyT3JJZCA6IHZpZXdDb250YWluZXJPcklkLmlkO1xuXG5cdFx0aWYgKHZpZXdDb250YWluZXIpIHtcblx0XHRcdGlmICh2aWV3Q29udGFpbmVyLmhpZGVJZkVtcHR5KSB7XG5cdFx0XHRcdGlmICh0aGlzLnZpZXdTZXJ2aWNlLmlzVmlld0NvbnRhaW5lckFjdGl2ZSh2aWV3Q29udGFpbmVySWQpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgY2FjaGUgb25seSBpZiBleHRlbnNpb25zIGFyZSBub3QgeWV0IHJlZ2lzdGVyZWQgYW5kIGN1cnJlbnQgd2luZG93IGlzIG5vdCBuYXRpdmUgKGRlc2t0b3ApIHJlbW90ZSBjb25uZWN0aW9uIHdpbmRvd1xuXHRcdGlmICghdGhpcy5oYXNFeHRlbnNpb25zUmVnaXN0ZXJlZCAmJiAhKHRoaXMucGFydCA9PT0gUGFydHMuU0lERUJBUl9QQVJUICYmIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSAmJiBpc05hdGl2ZSkpIHtcblx0XHRcdGNhY2hlZFZpZXdDb250YWluZXIgPSBjYWNoZWRWaWV3Q29udGFpbmVyIHx8IHRoaXMuY2FjaGVkVmlld0NvbnRhaW5lcnMuZmluZCgoeyBpZCB9KSA9PiBpZCA9PT0gdmlld0NvbnRhaW5lcklkKTtcblxuXHRcdFx0Ly8gU2hvdyBidWlsdGluIFZpZXdDb250YWluZXIgaWYgbm90IHJlZ2lzdGVyZWQgeWV0XG5cdFx0XHRpZiAoIXZpZXdDb250YWluZXIgJiYgY2FjaGVkVmlld0NvbnRhaW5lcj8uaXNCdWlsdGluICYmIGNhY2hlZFZpZXdDb250YWluZXI/LnZpc2libGUpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY2FjaGVkVmlld0NvbnRhaW5lcj8udmlld3M/Lmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gY2FjaGVkVmlld0NvbnRhaW5lci52aWV3cy5ldmVyeSgoeyB3aGVuIH0pID0+ICEhd2hlbiAmJiAhdGhpcy5jb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKHdoZW4pKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFkZENvbXBvc2l0ZSh2aWV3Q29udGFpbmVyOiBWaWV3Q29udGFpbmVyKTogdm9pZCB7XG5cdFx0dGhpcy5jb21wb3NpdGVCYXIuYWRkQ29tcG9zaXRlKHsgaWQ6IHZpZXdDb250YWluZXIuaWQsIG5hbWU6IHR5cGVvZiB2aWV3Q29udGFpbmVyLnRpdGxlID09PSAnc3RyaW5nJyA/IHZpZXdDb250YWluZXIudGl0bGUgOiB2aWV3Q29udGFpbmVyLnRpdGxlLnZhbHVlLCBvcmRlcjogdmlld0NvbnRhaW5lci5vcmRlciwgcmVxdWVzdGVkSW5kZXg6IHZpZXdDb250YWluZXIucmVxdWVzdGVkSW5kZXggfSk7XG5cdH1cblxuXHRwcml2YXRlIGhpZGVDb21wb3NpdGUoY29tcG9zaXRlSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuY29tcG9zaXRlQmFyLmhpZGVDb21wb3NpdGUoY29tcG9zaXRlSWQpO1xuXG5cdFx0Y29uc3QgY29tcG9zaXRlQWN0aW9ucyA9IHRoaXMuY29tcG9zaXRlQWN0aW9ucy5nZXQoY29tcG9zaXRlSWQpO1xuXHRcdGlmIChjb21wb3NpdGVBY3Rpb25zKSB7XG5cdFx0XHR0aGlzLmNvbXBvc2l0ZUFjdGlvbnMuZGVsZXRlQW5kRGlzcG9zZShjb21wb3NpdGVJZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW1vdmVDb21wb3NpdGUoY29tcG9zaXRlSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuY29tcG9zaXRlQmFyLnJlbW92ZUNvbXBvc2l0ZShjb21wb3NpdGVJZCk7XG5cblx0XHRjb25zdCBjb21wb3NpdGVBY3Rpb25zID0gdGhpcy5jb21wb3NpdGVBY3Rpb25zLmdldChjb21wb3NpdGVJZCk7XG5cdFx0aWYgKGNvbXBvc2l0ZUFjdGlvbnMpIHtcblx0XHRcdHRoaXMuY29tcG9zaXRlQWN0aW9ucy5kZWxldGVBbmREaXNwb3NlKGNvbXBvc2l0ZUlkKTtcblx0XHR9XG5cdH1cblxuXHRnZXRQaW5uZWRQYW5lQ29tcG9zaXRlSWRzKCk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCBwaW5uZWRDb21wb3NpdGVJZHMgPSB0aGlzLmNvbXBvc2l0ZUJhci5nZXRQaW5uZWRDb21wb3NpdGVzKCkubWFwKHYgPT4gdi5pZCk7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0Vmlld0NvbnRhaW5lcnMoKVxuXHRcdFx0LmZpbHRlcih2ID0+IHRoaXMuY29tcG9zaXRlQmFyLmlzUGlubmVkKHYuaWQpKVxuXHRcdFx0LnNvcnQoKHYxLCB2MikgPT4gcGlubmVkQ29tcG9zaXRlSWRzLmluZGV4T2YodjEuaWQpIC0gcGlubmVkQ29tcG9zaXRlSWRzLmluZGV4T2YodjIuaWQpKVxuXHRcdFx0Lm1hcCh2ID0+IHYuaWQpO1xuXHR9XG5cblx0Z2V0VmlzaWJsZVBhbmVDb21wb3NpdGVJZHMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLmNvbXBvc2l0ZUJhci5nZXRWaXNpYmxlQ29tcG9zaXRlcygpXG5cdFx0XHQuZmlsdGVyKHYgPT4gdGhpcy5wYW5lQ29tcG9zaXRlUGFydC5nZXRBY3RpdmVQYW5lQ29tcG9zaXRlKCk/LmdldElkKCkgPT09IHYuaWQgfHwgdGhpcy5jb21wb3NpdGVCYXIuaXNQaW5uZWQodi5pZCkpXG5cdFx0XHQubWFwKHYgPT4gdi5pZCk7XG5cdH1cblxuXHRnZXRQYW5lQ29tcG9zaXRlSWRzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gdGhpcy5jb21wb3NpdGVCYXIuZ2V0VmlzaWJsZUNvbXBvc2l0ZXMoKVxuXHRcdFx0Lm1hcCh2ID0+IHYuaWQpO1xuXHR9XG5cblx0Z2V0Q29udGV4dE1lbnVBY3Rpb25zKCk6IElBY3Rpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuY29tcG9zaXRlQmFyLmdldENvbnRleHRNZW51QWN0aW9ucygpO1xuXHR9XG5cblx0Zm9jdXMoaW5kZXg/OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmNvbXBvc2l0ZUJhci5mb2N1cyhpbmRleCk7XG5cdH1cblxuXHRsYXlvdXQod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmNvbXBvc2l0ZUJhci5sYXlvdXQobmV3IERpbWVuc2lvbih3aWR0aCwgaGVpZ2h0KSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFZpZXdDb250YWluZXIoaWQ6IHN0cmluZyk6IFZpZXdDb250YWluZXIgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHZpZXdDb250YWluZXIgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlJZChpZCk7XG5cdFx0cmV0dXJuIHZpZXdDb250YWluZXIgJiYgdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckxvY2F0aW9uKHZpZXdDb250YWluZXIpID09PSB0aGlzLmxvY2F0aW9uID8gdmlld0NvbnRhaW5lciA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Vmlld0NvbnRhaW5lcnMoKTogcmVhZG9ubHkgVmlld0NvbnRhaW5lcltdIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lcnNCeUxvY2F0aW9uKHRoaXMubG9jYXRpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDb21wb3NpdGVCYXJJdGVtc0Zyb21TdG9yYWdlKHJldGFpbkV4aXN0aW5nOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMucGlubmVkVmlld0NvbnRhaW5lcnNWYWx1ZSA9PT0gdGhpcy5nZXRTdG9yZWRQaW5uZWRWaWV3Q29udGFpbmVyc1ZhbHVlKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9wbGFjZWhvbGRlclZpZXdDb250YWluZXJzVmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcGlubmVkVmlld0NvbnRhaW5lcnNWYWx1ZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9jYWNoZWRWaWV3Q29udGFpbmVycyA9IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IG5ld0NvbXBvc2l0ZUl0ZW1zOiBJQ29tcG9zaXRlQmFySXRlbVtdID0gW107XG5cdFx0Y29uc3QgY29tcG9zaXRlSXRlbXMgPSB0aGlzLmNvbXBvc2l0ZUJhci5nZXRDb21wb3NpdGVCYXJJdGVtcygpO1xuXG5cdFx0Zm9yIChjb25zdCBjYWNoZWRWaWV3Q29udGFpbmVyIG9mIHRoaXMuY2FjaGVkVmlld0NvbnRhaW5lcnMpIHtcblx0XHRcdG5ld0NvbXBvc2l0ZUl0ZW1zLnB1c2goe1xuXHRcdFx0XHRpZDogY2FjaGVkVmlld0NvbnRhaW5lci5pZCxcblx0XHRcdFx0bmFtZTogY2FjaGVkVmlld0NvbnRhaW5lci5uYW1lLFxuXHRcdFx0XHRvcmRlcjogY2FjaGVkVmlld0NvbnRhaW5lci5vcmRlcixcblx0XHRcdFx0cGlubmVkOiBjYWNoZWRWaWV3Q29udGFpbmVyLnBpbm5lZCxcblx0XHRcdFx0dmlzaWJsZTogY2FjaGVkVmlld0NvbnRhaW5lci52aXNpYmxlICYmICEhdGhpcy5nZXRWaWV3Q29udGFpbmVyKGNhY2hlZFZpZXdDb250YWluZXIuaWQpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCB2aWV3Q29udGFpbmVyIG9mIHRoaXMuZ2V0Vmlld0NvbnRhaW5lcnMoKSkge1xuXHRcdFx0Ly8gQWRkIG1pc3NpbmcgdmlldyBjb250YWluZXJzXG5cdFx0XHRpZiAoIW5ld0NvbXBvc2l0ZUl0ZW1zLnNvbWUoKHsgaWQgfSkgPT4gaWQgPT09IHZpZXdDb250YWluZXIuaWQpKSB7XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gY29tcG9zaXRlSXRlbXMuZmluZEluZGV4KCh7IGlkIH0pID0+IGlkID09PSB2aWV3Q29udGFpbmVyLmlkKTtcblx0XHRcdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRcdGNvbnN0IGNvbXBvc2l0ZUl0ZW0gPSBjb21wb3NpdGVJdGVtc1tpbmRleF07XG5cdFx0XHRcdFx0bmV3Q29tcG9zaXRlSXRlbXMuc3BsaWNlKGluZGV4LCAwLCB7XG5cdFx0XHRcdFx0XHRpZDogdmlld0NvbnRhaW5lci5pZCxcblx0XHRcdFx0XHRcdG5hbWU6IHR5cGVvZiB2aWV3Q29udGFpbmVyLnRpdGxlID09PSAnc3RyaW5nJyA/IHZpZXdDb250YWluZXIudGl0bGUgOiB2aWV3Q29udGFpbmVyLnRpdGxlLnZhbHVlLFxuXHRcdFx0XHRcdFx0b3JkZXI6IGNvbXBvc2l0ZUl0ZW0ub3JkZXIsXG5cdFx0XHRcdFx0XHRwaW5uZWQ6IGNvbXBvc2l0ZUl0ZW0ucGlubmVkLFxuXHRcdFx0XHRcdFx0dmlzaWJsZTogY29tcG9zaXRlSXRlbS52aXNpYmxlLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG5ld0NvbXBvc2l0ZUl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdFx0aWQ6IHZpZXdDb250YWluZXIuaWQsXG5cdFx0XHRcdFx0XHRuYW1lOiB0eXBlb2Ygdmlld0NvbnRhaW5lci50aXRsZSA9PT0gJ3N0cmluZycgPyB2aWV3Q29udGFpbmVyLnRpdGxlIDogdmlld0NvbnRhaW5lci50aXRsZS52YWx1ZSxcblx0XHRcdFx0XHRcdG9yZGVyOiB2aWV3Q29udGFpbmVyLm9yZGVyLFxuXHRcdFx0XHRcdFx0cGlubmVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0dmlzaWJsZTogIXRoaXMuc2hvdWxkQmVIaWRkZW4odmlld0NvbnRhaW5lciksXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAocmV0YWluRXhpc3RpbmcpIHtcblx0XHRcdGZvciAoY29uc3QgY29tcG9zaXRlSXRlbSBvZiBjb21wb3NpdGVJdGVtcykge1xuXHRcdFx0XHRjb25zdCBuZXdDb21wb3NpdGVJdGVtID0gbmV3Q29tcG9zaXRlSXRlbXMuZmluZCgoeyBpZCB9KSA9PiBpZCA9PT0gY29tcG9zaXRlSXRlbS5pZCk7XG5cdFx0XHRcdGlmICghbmV3Q29tcG9zaXRlSXRlbSkge1xuXHRcdFx0XHRcdG5ld0NvbXBvc2l0ZUl0ZW1zLnB1c2goY29tcG9zaXRlSXRlbSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmNvbXBvc2l0ZUJhci5zZXRDb21wb3NpdGVCYXJJdGVtcyhuZXdDb21wb3NpdGVJdGVtcyk7XG5cdH1cblxuXHRwcml2YXRlIHNhdmVDYWNoZWRWaWV3Q29udGFpbmVycygpOiB2b2lkIHtcblx0XHRjb25zdCBzdGF0ZTogSUNhY2hlZFZpZXdDb250YWluZXJbXSA9IFtdO1xuXG5cdFx0Y29uc3QgY29tcG9zaXRlSXRlbXMgPSB0aGlzLmNvbXBvc2l0ZUJhci5nZXRDb21wb3NpdGVCYXJJdGVtcygpO1xuXHRcdGZvciAoY29uc3QgY29tcG9zaXRlSXRlbSBvZiBjb21wb3NpdGVJdGVtcykge1xuXHRcdFx0Y29uc3Qgdmlld0NvbnRhaW5lciA9IHRoaXMuZ2V0Vmlld0NvbnRhaW5lcihjb21wb3NpdGVJdGVtLmlkKTtcblx0XHRcdGlmICh2aWV3Q29udGFpbmVyKSB7XG5cdFx0XHRcdGNvbnN0IHZpZXdDb250YWluZXJNb2RlbCA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJNb2RlbCh2aWV3Q29udGFpbmVyKTtcblx0XHRcdFx0Y29uc3Qgdmlld3M6IHsgd2hlbjogc3RyaW5nIHwgdW5kZWZpbmVkIH1bXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHsgd2hlbiB9IG9mIHZpZXdDb250YWluZXJNb2RlbC5hbGxWaWV3RGVzY3JpcHRvcnMpIHtcblx0XHRcdFx0XHR2aWV3cy5wdXNoKHsgd2hlbjogd2hlbiA/IHdoZW4uc2VyaWFsaXplKCkgOiB1bmRlZmluZWQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3RhdGUucHVzaCh7XG5cdFx0XHRcdFx0aWQ6IGNvbXBvc2l0ZUl0ZW0uaWQsXG5cdFx0XHRcdFx0bmFtZTogdmlld0NvbnRhaW5lck1vZGVsLnRpdGxlLFxuXHRcdFx0XHRcdGljb246IFVSSS5pc1VyaSh2aWV3Q29udGFpbmVyTW9kZWwuaWNvbikgJiYgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5ID8gdW5kZWZpbmVkIDogdmlld0NvbnRhaW5lck1vZGVsLmljb24sIC8vIERvIG5vdCBjYWNoZSB1cmkgaWNvbnMgd2l0aCByZW1vdGUgY29ubmVjdGlvblxuXHRcdFx0XHRcdHZpZXdzLFxuXHRcdFx0XHRcdHBpbm5lZDogY29tcG9zaXRlSXRlbS5waW5uZWQsXG5cdFx0XHRcdFx0b3JkZXI6IGNvbXBvc2l0ZUl0ZW0ub3JkZXIsXG5cdFx0XHRcdFx0dmlzaWJsZTogY29tcG9zaXRlSXRlbS52aXNpYmxlLFxuXHRcdFx0XHRcdGlzQnVpbHRpbjogIXZpZXdDb250YWluZXIuZXh0ZW5zaW9uSWRcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzdGF0ZS5wdXNoKHsgaWQ6IGNvbXBvc2l0ZUl0ZW0uaWQsIG5hbWU6IGNvbXBvc2l0ZUl0ZW0ubmFtZSwgcGlubmVkOiBjb21wb3NpdGVJdGVtLnBpbm5lZCwgb3JkZXI6IGNvbXBvc2l0ZUl0ZW0ub3JkZXIsIHZpc2libGU6IGZhbHNlLCBpc0J1aWx0aW46IGZhbHNlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuc3RvcmVDYWNoZWRWaWV3Q29udGFpbmVyc1N0YXRlKHN0YXRlKTtcblx0fVxuXG5cdHByaXZhdGUgX2NhY2hlZFZpZXdDb250YWluZXJzOiBJQ2FjaGVkVmlld0NvbnRhaW5lcltdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIGdldCBjYWNoZWRWaWV3Q29udGFpbmVycygpOiBJQ2FjaGVkVmlld0NvbnRhaW5lcltdIHtcblx0XHRpZiAodGhpcy5fY2FjaGVkVmlld0NvbnRhaW5lcnMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fY2FjaGVkVmlld0NvbnRhaW5lcnMgPSB0aGlzLmdldFBpbm5lZFZpZXdDb250YWluZXJzKCk7XG5cdFx0XHRmb3IgKGNvbnN0IHBsYWNlaG9sZGVyVmlld0NvbnRhaW5lciBvZiB0aGlzLmdldFBsYWNlaG9sZGVyVmlld0NvbnRhaW5lcnMoKSkge1xuXHRcdFx0XHRjb25zdCBjYWNoZWRWaWV3Q29udGFpbmVyID0gdGhpcy5fY2FjaGVkVmlld0NvbnRhaW5lcnMuZmluZChjYWNoZWQgPT4gY2FjaGVkLmlkID09PSBwbGFjZWhvbGRlclZpZXdDb250YWluZXIuaWQpO1xuXHRcdFx0XHRpZiAoY2FjaGVkVmlld0NvbnRhaW5lcikge1xuXHRcdFx0XHRcdGNhY2hlZFZpZXdDb250YWluZXIudmlzaWJsZSA9IHBsYWNlaG9sZGVyVmlld0NvbnRhaW5lci52aXNpYmxlID8/IGNhY2hlZFZpZXdDb250YWluZXIudmlzaWJsZTtcblx0XHRcdFx0XHRjYWNoZWRWaWV3Q29udGFpbmVyLm5hbWUgPSBwbGFjZWhvbGRlclZpZXdDb250YWluZXIubmFtZTtcblx0XHRcdFx0XHRjYWNoZWRWaWV3Q29udGFpbmVyLmljb24gPSBwbGFjZWhvbGRlclZpZXdDb250YWluZXIudGhlbWVJY29uID8gcGxhY2Vob2xkZXJWaWV3Q29udGFpbmVyLnRoZW1lSWNvbiA6XG5cdFx0XHRcdFx0XHRwbGFjZWhvbGRlclZpZXdDb250YWluZXIuaWNvblVybCA/IFVSSS5yZXZpdmUocGxhY2Vob2xkZXJWaWV3Q29udGFpbmVyLmljb25VcmwpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmIChVUkkuaXNVcmkoY2FjaGVkVmlld0NvbnRhaW5lci5pY29uKSAmJiB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdFx0XHRcdGNhY2hlZFZpZXdDb250YWluZXIuaWNvbiA9IHVuZGVmaW5lZDsgLy8gRG8gbm90IGNhY2hlIHVyaSBpY29ucyB3aXRoIHJlbW90ZSBjb25uZWN0aW9uXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhY2hlZFZpZXdDb250YWluZXIudmlld3MgPSBwbGFjZWhvbGRlclZpZXdDb250YWluZXIudmlld3M7XG5cdFx0XHRcdFx0Y2FjaGVkVmlld0NvbnRhaW5lci5pc0J1aWx0aW4gPSBwbGFjZWhvbGRlclZpZXdDb250YWluZXIuaXNCdWlsdGluO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHZpZXdDb250YWluZXJXb3Jrc3BhY2VTdGF0ZSBvZiB0aGlzLmdldFZpZXdDb250YWluZXJzV29ya3NwYWNlU3RhdGUoKSkge1xuXHRcdFx0XHRjb25zdCBjYWNoZWRWaWV3Q29udGFpbmVyID0gdGhpcy5fY2FjaGVkVmlld0NvbnRhaW5lcnMuZmluZChjYWNoZWQgPT4gY2FjaGVkLmlkID09PSB2aWV3Q29udGFpbmVyV29ya3NwYWNlU3RhdGUuaWQpO1xuXHRcdFx0XHRpZiAoY2FjaGVkVmlld0NvbnRhaW5lcikge1xuXHRcdFx0XHRcdGNhY2hlZFZpZXdDb250YWluZXIudmlzaWJsZSA9IHZpZXdDb250YWluZXJXb3Jrc3BhY2VTdGF0ZS52aXNpYmxlID8/IGNhY2hlZFZpZXdDb250YWluZXIudmlzaWJsZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9jYWNoZWRWaWV3Q29udGFpbmVycztcblx0fVxuXG5cdHByaXZhdGUgc3RvcmVDYWNoZWRWaWV3Q29udGFpbmVyc1N0YXRlKGNhY2hlZFZpZXdDb250YWluZXJzOiBJQ2FjaGVkVmlld0NvbnRhaW5lcltdKTogdm9pZCB7XG5cdFx0Y29uc3QgcGlubmVkVmlld0NvbnRhaW5lcnMgPSB0aGlzLmdldFBpbm5lZFZpZXdDb250YWluZXJzKCk7XG5cdFx0dGhpcy5zZXRQaW5uZWRWaWV3Q29udGFpbmVycyhjYWNoZWRWaWV3Q29udGFpbmVycy5tYXAoKHsgaWQsIHBpbm5lZCwgb3JkZXIgfSkgPT4gKHtcblx0XHRcdGlkLFxuXHRcdFx0cGlubmVkLFxuXHRcdFx0dmlzaWJsZTogQm9vbGVhbihwaW5uZWRWaWV3Q29udGFpbmVycy5maW5kKCh7IGlkOiBwaW5uZWRJZCB9KSA9PiBwaW5uZWRJZCA9PT0gaWQpPy52aXNpYmxlKSxcblx0XHRcdG9yZGVyXG5cdFx0fSBzYXRpc2ZpZXMgSVBpbm5lZFZpZXdDb250YWluZXIpKSk7XG5cblx0XHR0aGlzLnNldFBsYWNlaG9sZGVyVmlld0NvbnRhaW5lcnMoY2FjaGVkVmlld0NvbnRhaW5lcnMubWFwKCh7IGlkLCBpY29uLCBuYW1lLCB2aWV3cywgaXNCdWlsdGluIH0pID0+ICh7XG5cdFx0XHRpZCxcblx0XHRcdGljb25Vcmw6IFVSSS5pc1VyaShpY29uKSA/IGljb24gOiB1bmRlZmluZWQsXG5cdFx0XHR0aGVtZUljb246IFRoZW1lSWNvbi5pc1RoZW1lSWNvbihpY29uKSA/IGljb24gOiB1bmRlZmluZWQsXG5cdFx0XHRuYW1lLFxuXHRcdFx0aXNCdWlsdGluLFxuXHRcdFx0dmlld3Ncblx0XHR9IHNhdGlzZmllcyBJUGxhY2Vob2xkZXJWaWV3Q29udGFpbmVyKSkpO1xuXG5cdFx0dGhpcy5zZXRWaWV3Q29udGFpbmVyc1dvcmtzcGFjZVN0YXRlKGNhY2hlZFZpZXdDb250YWluZXJzLm1hcCgoeyBpZCwgdmlzaWJsZSB9KSA9PiAoe1xuXHRcdFx0aWQsXG5cdFx0XHR2aXNpYmxlLFxuXHRcdH0gc2F0aXNmaWVzIElWaWV3Q29udGFpbmVyV29ya3NwYWNlU3RhdGUpKSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFBpbm5lZFZpZXdDb250YWluZXJzKCk6IElQaW5uZWRWaWV3Q29udGFpbmVyW10ge1xuXHRcdHJldHVybiBKU09OLnBhcnNlKHRoaXMucGlubmVkVmlld0NvbnRhaW5lcnNWYWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIHNldFBpbm5lZFZpZXdDb250YWluZXJzKHBpbm5lZFZpZXdDb250YWluZXJzOiBJUGlubmVkVmlld0NvbnRhaW5lcltdKTogdm9pZCB7XG5cdFx0dGhpcy5waW5uZWRWaWV3Q29udGFpbmVyc1ZhbHVlID0gSlNPTi5zdHJpbmdpZnkocGlubmVkVmlld0NvbnRhaW5lcnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGlubmVkVmlld0NvbnRhaW5lcnNWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGdldCBwaW5uZWRWaWV3Q29udGFpbmVyc1ZhbHVlKCk6IHN0cmluZyB7XG5cdFx0aWYgKCF0aGlzLl9waW5uZWRWaWV3Q29udGFpbmVyc1ZhbHVlKSB7XG5cdFx0XHR0aGlzLl9waW5uZWRWaWV3Q29udGFpbmVyc1ZhbHVlID0gdGhpcy5nZXRTdG9yZWRQaW5uZWRWaWV3Q29udGFpbmVyc1ZhbHVlKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3Bpbm5lZFZpZXdDb250YWluZXJzVmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIHNldCBwaW5uZWRWaWV3Q29udGFpbmVyc1ZhbHVlKHBpbm5lZFZpZXdDb250YWluZXJzVmFsdWU6IHN0cmluZykge1xuXHRcdGlmICh0aGlzLnBpbm5lZFZpZXdDb250YWluZXJzVmFsdWUgIT09IHBpbm5lZFZpZXdDb250YWluZXJzVmFsdWUpIHtcblx0XHRcdHRoaXMuX3Bpbm5lZFZpZXdDb250YWluZXJzVmFsdWUgPSBwaW5uZWRWaWV3Q29udGFpbmVyc1ZhbHVlO1xuXHRcdFx0dGhpcy5zZXRTdG9yZWRQaW5uZWRWaWV3Q29udGFpbmVyc1ZhbHVlKHBpbm5lZFZpZXdDb250YWluZXJzVmFsdWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0U3RvcmVkUGlubmVkVmlld0NvbnRhaW5lcnNWYWx1ZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldCh0aGlzLm9wdGlvbnMucGlubmVkVmlld0NvbnRhaW5lcnNLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCAnW10nKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0U3RvcmVkUGlubmVkVmlld0NvbnRhaW5lcnNWYWx1ZSh2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZSh0aGlzLm9wdGlvbnMucGlubmVkVmlld0NvbnRhaW5lcnNLZXksIHZhbHVlLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UGxhY2Vob2xkZXJWaWV3Q29udGFpbmVycygpOiBJUGxhY2Vob2xkZXJWaWV3Q29udGFpbmVyW10ge1xuXHRcdHJldHVybiBKU09OLnBhcnNlKHRoaXMucGxhY2Vob2xkZXJWaWV3Q29udGFpbmVyc1ZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0UGxhY2Vob2xkZXJWaWV3Q29udGFpbmVycyhwbGFjZWhvbGRlclZpZXdDb250YWluZXJzOiBJUGxhY2Vob2xkZXJWaWV3Q29udGFpbmVyW10pOiB2b2lkIHtcblx0XHR0aGlzLnBsYWNlaG9sZGVyVmlld0NvbnRhaW5lcnNWYWx1ZSA9IEpTT04uc3RyaW5naWZ5KHBsYWNlaG9sZGVyVmlld0NvbnRhaW5lcnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGxhY2Vob2xkZXJWaWV3Q29udGFpbmVyc1ZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0IHBsYWNlaG9sZGVyVmlld0NvbnRhaW5lcnNWYWx1ZSgpOiBzdHJpbmcge1xuXHRcdGlmICghdGhpcy5fcGxhY2Vob2xkZXJWaWV3Q29udGFpbmVyc1ZhbHVlKSB7XG5cdFx0XHR0aGlzLl9wbGFjZWhvbGRlclZpZXdDb250YWluZXJzVmFsdWUgPSB0aGlzLmdldFN0b3JlZFBsYWNlaG9sZGVyVmlld0NvbnRhaW5lcnNWYWx1ZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9wbGFjZWhvbGRlclZpZXdDb250YWluZXJzVmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIHNldCBwbGFjZWhvbGRlclZpZXdDb250YWluZXJzVmFsdWUocGxhY2Vob2xkZXJWaWV3Q29udGFpbmVzVmFsdWU6IHN0cmluZykge1xuXHRcdGlmICh0aGlzLnBsYWNlaG9sZGVyVmlld0NvbnRhaW5lcnNWYWx1ZSAhPT0gcGxhY2Vob2xkZXJWaWV3Q29udGFpbmVzVmFsdWUpIHtcblx0XHRcdHRoaXMuX3BsYWNlaG9sZGVyVmlld0NvbnRhaW5lcnNWYWx1ZSA9IHBsYWNlaG9sZGVyVmlld0NvbnRhaW5lc1ZhbHVlO1xuXHRcdFx0dGhpcy5zZXRTdG9yZWRQbGFjZWhvbGRlclZpZXdDb250YWluZXJzVmFsdWUocGxhY2Vob2xkZXJWaWV3Q29udGFpbmVzVmFsdWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0U3RvcmVkUGxhY2Vob2xkZXJWaWV3Q29udGFpbmVyc1ZhbHVlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KHRoaXMub3B0aW9ucy5wbGFjZWhvbGRlclZpZXdDb250YWluZXJzS2V5LCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgJ1tdJyk7XG5cdH1cblxuXHRwcml2YXRlIHNldFN0b3JlZFBsYWNlaG9sZGVyVmlld0NvbnRhaW5lcnNWYWx1ZSh2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZSh0aGlzLm9wdGlvbnMucGxhY2Vob2xkZXJWaWV3Q29udGFpbmVyc0tleSwgdmFsdWUsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRWaWV3Q29udGFpbmVyc1dvcmtzcGFjZVN0YXRlKCk6IElWaWV3Q29udGFpbmVyV29ya3NwYWNlU3RhdGVbXSB7XG5cdFx0cmV0dXJuIEpTT04ucGFyc2UodGhpcy52aWV3Q29udGFpbmVyc1dvcmtzcGFjZVN0YXRlVmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRWaWV3Q29udGFpbmVyc1dvcmtzcGFjZVN0YXRlKHZpZXdDb250YWluZXJzV29ya3NwYWNlU3RhdGU6IElWaWV3Q29udGFpbmVyV29ya3NwYWNlU3RhdGVbXSk6IHZvaWQge1xuXHRcdHRoaXMudmlld0NvbnRhaW5lcnNXb3Jrc3BhY2VTdGF0ZVZhbHVlID0gSlNPTi5zdHJpbmdpZnkodmlld0NvbnRhaW5lcnNXb3Jrc3BhY2VTdGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIF92aWV3Q29udGFpbmVyc1dvcmtzcGFjZVN0YXRlVmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBnZXQgdmlld0NvbnRhaW5lcnNXb3Jrc3BhY2VTdGF0ZVZhbHVlKCk6IHN0cmluZyB7XG5cdFx0aWYgKCF0aGlzLl92aWV3Q29udGFpbmVyc1dvcmtzcGFjZVN0YXRlVmFsdWUpIHtcblx0XHRcdHRoaXMuX3ZpZXdDb250YWluZXJzV29ya3NwYWNlU3RhdGVWYWx1ZSA9IHRoaXMuZ2V0U3RvcmVkVmlld0NvbnRhaW5lcnNXb3Jrc3BhY2VTdGF0ZVZhbHVlKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3ZpZXdDb250YWluZXJzV29ya3NwYWNlU3RhdGVWYWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgc2V0IHZpZXdDb250YWluZXJzV29ya3NwYWNlU3RhdGVWYWx1ZSh2aWV3Q29udGFpbmVyc1dvcmtzcGFjZVN0YXRlVmFsdWU6IHN0cmluZykge1xuXHRcdGlmICh0aGlzLnZpZXdDb250YWluZXJzV29ya3NwYWNlU3RhdGVWYWx1ZSAhPT0gdmlld0NvbnRhaW5lcnNXb3Jrc3BhY2VTdGF0ZVZhbHVlKSB7XG5cdFx0XHR0aGlzLl92aWV3Q29udGFpbmVyc1dvcmtzcGFjZVN0YXRlVmFsdWUgPSB2aWV3Q29udGFpbmVyc1dvcmtzcGFjZVN0YXRlVmFsdWU7XG5cdFx0XHR0aGlzLnNldFN0b3JlZFZpZXdDb250YWluZXJzV29ya3NwYWNlU3RhdGVWYWx1ZSh2aWV3Q29udGFpbmVyc1dvcmtzcGFjZVN0YXRlVmFsdWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0U3RvcmVkVmlld0NvbnRhaW5lcnNXb3Jrc3BhY2VTdGF0ZVZhbHVlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KHRoaXMub3B0aW9ucy52aWV3Q29udGFpbmVyc1dvcmtzcGFjZVN0YXRlS2V5LCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCAnW10nKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0U3RvcmVkVmlld0NvbnRhaW5lcnNXb3Jrc3BhY2VTdGF0ZVZhbHVlKHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHRoaXMub3B0aW9ucy52aWV3Q29udGFpbmVyc1dvcmtzcGFjZVN0YXRlS2V5LCB2YWx1ZSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxufVxuXG5jbGFzcyBWaWV3Q29udGFpbmVyQWN0aXZpdHlBY3Rpb24gZXh0ZW5kcyBDb21wb3NpdGVCYXJBY3Rpb24ge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IHByZXZlbnREb3VibGVDbGlja0RlbGF5ID0gMzAwO1xuXG5cdHByaXZhdGUgbGFzdFJ1biA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29tcG9zaXRlQmFyQWN0aW9uSXRlbTogSUNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwYXJ0OiBQYXJ0cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHBhbmVDb21wb3NpdGVQYXJ0OiBJUGFuZUNvbXBvc2l0ZVBhcnQsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBY3Rpdml0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY3Rpdml0eVNlcnZpY2U6IElBY3Rpdml0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0pO1xuXHRcdHRoaXMudXBkYXRlQWN0aXZpdHkoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFjdGl2aXR5U2VydmljZS5vbkRpZENoYW5nZUFjdGl2aXR5KHZpZXdDb250YWluZXJPckFjdGlvbiA9PiB7XG5cdFx0XHRpZiAoIWlzU3RyaW5nKHZpZXdDb250YWluZXJPckFjdGlvbikgJiYgdmlld0NvbnRhaW5lck9yQWN0aW9uLmlkID09PSB0aGlzLmNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0uaWQpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVBY3Rpdml0eSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHVwZGF0ZUNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0oY29tcG9zaXRlQmFyQWN0aW9uSXRlbTogSUNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0pOiB2b2lkIHtcblx0XHR0aGlzLmNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0gPSBjb21wb3NpdGVCYXJBY3Rpb25JdGVtO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVBY3Rpdml0eSgpOiB2b2lkIHtcblx0XHR0aGlzLmFjdGl2aXRpZXMgPSB0aGlzLmFjdGl2aXR5U2VydmljZS5nZXRWaWV3Q29udGFpbmVyQWN0aXZpdGllcyh0aGlzLmNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0uaWQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGV2ZW50OiB7IHByZXNlcnZlRm9jdXM6IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChpc01vdXNlRXZlbnQoZXZlbnQpICYmIGV2ZW50LmJ1dHRvbiA9PT0gMikge1xuXHRcdFx0cmV0dXJuOyAvLyBkbyBub3QgcnVuIG9uIHJpZ2h0IGNsaWNrXG5cdFx0fVxuXG5cdFx0Ly8gcHJldmVudCBhY2NpZGVudCB0cmlnZ2VyIG9uIGEgZG91YmxlY2xpY2sgKHRvIGhlbHAgbmVydm91cyBwZW9wbGUpXG5cdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRpZiAobm93ID4gdGhpcy5sYXN0UnVuIC8qIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yNTgzMCAqLyAmJiBub3cgLSB0aGlzLmxhc3RSdW4gPCBWaWV3Q29udGFpbmVyQWN0aXZpdHlBY3Rpb24ucHJldmVudERvdWJsZUNsaWNrRGVsYXkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5sYXN0UnVuID0gbm93O1xuXG5cdFx0Y29uc3QgZm9jdXMgPSAoZXZlbnQgJiYgJ3ByZXNlcnZlRm9jdXMnIGluIGV2ZW50KSA/ICFldmVudC5wcmVzZXJ2ZUZvY3VzIDogdHJ1ZTtcblxuXHRcdGlmICh0aGlzLnBhcnQgPT09IFBhcnRzLkFDVElWSVRZQkFSX1BBUlQpIHtcblx0XHRcdGNvbnN0IHNpZGVCYXJWaXNpYmxlID0gdGhpcy5sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5TSURFQkFSX1BBUlQpO1xuXHRcdFx0Y29uc3QgYWN0aXZlVmlld2xldCA9IHRoaXMucGFuZUNvbXBvc2l0ZVBhcnQuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZSgpO1xuXHRcdFx0Y29uc3QgZm9jdXNCZWhhdmlvciA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPignd29ya2JlbmNoLmFjdGl2aXR5QmFyLmljb25DbGlja0JlaGF2aW9yJyk7XG5cblx0XHRcdGlmIChzaWRlQmFyVmlzaWJsZSAmJiBhY3RpdmVWaWV3bGV0Py5nZXRJZCgpID09PSB0aGlzLmNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0uaWQpIHtcblx0XHRcdFx0c3dpdGNoIChmb2N1c0JlaGF2aW9yKSB7XG5cdFx0XHRcdFx0Y2FzZSAnZm9jdXMnOlxuXHRcdFx0XHRcdFx0dGhpcy5wYW5lQ29tcG9zaXRlUGFydC5vcGVuUGFuZUNvbXBvc2l0ZSh0aGlzLmNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0uaWQsIGZvY3VzKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3RvZ2dsZSc6XG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdC8vIEhpZGUgc2lkZWJhciBpZiBzZWxlY3RlZCB2aWV3bGV0IGFscmVhZHkgdmlzaWJsZVxuXHRcdFx0XHRcdFx0dGhpcy5sYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4odHJ1ZSwgUGFydHMuU0lERUJBUl9QQVJUKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMucGFuZUNvbXBvc2l0ZVBhcnQub3BlblBhbmVDb21wb3NpdGUodGhpcy5jb21wb3NpdGVCYXJBY3Rpb25JdGVtLmlkLCBmb2N1cyk7XG5cdFx0cmV0dXJuIHRoaXMuYWN0aXZhdGUoKTtcblx0fVxufVxuXG5jbGFzcyBQbGFjZUhvbGRlclZpZXdDb250YWluZXJBY3Rpdml0eUFjdGlvbiBleHRlbmRzIFZpZXdDb250YWluZXJBY3Rpdml0eUFjdGlvbiB7IH1cblxuY2xhc3MgUGxhY2VIb2xkZXJUb2dnbGVDb21wb3NpdGVQaW5uZWRBY3Rpb24gZXh0ZW5kcyBUb2dnbGVDb21wb3NpdGVQaW5uZWRBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKGlkOiBzdHJpbmcsIGNvbXBvc2l0ZUJhcjogSUNvbXBvc2l0ZUJhcikge1xuXHRcdHN1cGVyKHsgaWQsIG5hbWU6IGlkLCBjbGFzc05hbWVzOiB1bmRlZmluZWQgfSwgY29tcG9zaXRlQmFyKTtcblx0fVxuXG5cdHNldEFjdGl2aXR5KGFjdGl2aXR5OiBJQ29tcG9zaXRlQmFyQWN0aW9uSXRlbSk6IHZvaWQge1xuXHRcdHRoaXMubGFiZWwgPSBhY3Rpdml0eS5uYW1lO1xuXHR9XG59XG5cbmNsYXNzIFBsYWNlSG9sZGVyVG9nZ2xlQ29tcG9zaXRlQmFkZ2VBY3Rpb24gZXh0ZW5kcyBUb2dnbGVDb21wb3NpdGVCYWRnZUFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoaWQ6IHN0cmluZywgY29tcG9zaXRlQmFyOiBJQ29tcG9zaXRlQmFyKSB7XG5cdFx0c3VwZXIoeyBpZCwgbmFtZTogaWQsIGNsYXNzTmFtZXM6IHVuZGVmaW5lZCB9LCBjb21wb3NpdGVCYXIpO1xuXHR9XG5cblx0c2V0Q29tcG9zaXRlQmFyQWN0aW9uSXRlbShhY3Rpb25JdGVtOiBJQ29tcG9zaXRlQmFyQWN0aW9uSXRlbSk6IHZvaWQge1xuXHRcdHRoaXMubGFiZWwgPSBhY3Rpb25JdGVtLm5hbWU7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx5QkFBeUIsYUFBYTtBQUMvQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFzQixpQkFBaUIsWUFBWSxlQUFlLDBCQUEwQjtBQUU1RixTQUFTLGNBQWlDLDRCQUE0QjtBQUN0RSxTQUFTLFdBQVcsb0JBQW9CO0FBQ3hDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsV0FBMEI7QUFDbkMsU0FBUyw2QkFBeUUsNEJBQTRCLDBCQUFrRTtBQUNoTCxTQUFTLHdCQUE0RCw2QkFBNkI7QUFDbEcsU0FBUyxvQkFBb0Isc0JBQXNCO0FBQ25ELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQWtCLFdBQVcsZUFBZSxnQkFBZ0I7QUFDNUQsU0FBUyxrQkFBa0I7QUFHM0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUF1RHZCLElBQU0sbUJBQU4sY0FBK0IsV0FBVztBQUFBLEVBVWhELFlBQ2tCLFVBQ0UsU0FDQSxNQUNGLG1CQUN5QixzQkFDUixnQkFDRSxrQkFDSyx1QkFDVCxhQUNPLG1CQUNRLG9CQUNILGVBQzNDO0FBQ0QsVUFBTTtBQWJXO0FBQ0U7QUFDQTtBQUNGO0FBQ3lCO0FBQ1I7QUFDRTtBQUNLO0FBQ1Q7QUFDTztBQUNRO0FBQ0g7QUFwQjdDLFNBQWlCLDJCQUEyQixLQUFLLFVBQVUsSUFBSSxjQUFtQyxDQUFDO0FBSW5HLFNBQWlCLG1CQUFtQixLQUFLLFVBQVUsSUFBSSxjQUFnTCxDQUFDO0FBRXhPLFNBQVEsMEJBQW1DO0FBdWdCM0MsU0FBUSx3QkFBNEQ7QUFyZm5FLFNBQUssYUFBYSxJQUFJO0FBQUEsTUFBcUIsS0FBSztBQUFBLE1BQXVCLEtBQUs7QUFBQSxNQUFVLEtBQUssUUFBUTtBQUFBLE1BQ2xHLE9BQU8sSUFBWSxVQUFvQjtBQUFFLGVBQU8sTUFBTSxLQUFLLGtCQUFrQixrQkFBa0IsSUFBSSxLQUFLLEtBQUs7QUFBQSxNQUFNO0FBQUEsTUFDbkgsQ0FBQyxNQUFjLElBQVksV0FBc0IsS0FBSyxhQUFhLEtBQUssTUFBTSxJQUFJLEtBQUssUUFBUSxnQkFBZ0IsbUJBQW1CLFdBQVcsUUFBUSxtQkFBbUIsUUFBUSxrQkFBa0I7QUFBQSxNQUNsTSxNQUFNLEtBQUssYUFBYSxxQkFBcUI7QUFBQSxJQUM5QztBQUVBLFVBQU0sY0FBYyxLQUFLLHFCQUN2QixJQUFJLGdCQUFjO0FBQUEsTUFDbEIsSUFBSSxVQUFVO0FBQUEsTUFDZCxNQUFNLFVBQVU7QUFBQSxNQUNoQixTQUFTLENBQUMsS0FBSyxlQUFlLFVBQVUsSUFBSSxTQUFTO0FBQUEsTUFDckQsT0FBTyxVQUFVO0FBQUEsTUFDakIsUUFBUSxVQUFVO0FBQUEsSUFDbkIsRUFBRTtBQUNILFNBQUssZUFBZSxLQUFLLG1CQUFtQixXQUFXO0FBQ3ZELFNBQUssNEJBQTRCLEtBQUssa0JBQWtCLENBQUM7QUFDekQsU0FBSyxrQkFBa0I7QUFBQSxFQUN4QjtBQUFBLEVBRVEsbUJBQW1CLGFBQWtDO0FBQzVELFdBQU8sS0FBSyxVQUFVLEtBQUsscUJBQXFCLGVBQWUsY0FBYyxhQUFhO0FBQUEsTUFDekYsTUFBTSxLQUFLLFFBQVE7QUFBQSxNQUNuQixTQUFTLEtBQUssUUFBUTtBQUFBLE1BQ3RCLGFBQWEsS0FBSyxRQUFRO0FBQUEsTUFDMUIsc0JBQXNCLEtBQUssUUFBUTtBQUFBLE1BQ25DLHVCQUF1QixLQUFLLFFBQVE7QUFBQSxNQUNwQyxlQUFlLE9BQU8sYUFBYSxrQkFBa0I7QUFDcEQsZUFBUSxNQUFNLEtBQUssa0JBQWtCLGtCQUFrQixhQUFhLENBQUMsYUFBYSxLQUFNO0FBQUEsTUFDekY7QUFBQSxNQUNBLG1CQUFtQixpQkFBZSxLQUFLLG9CQUFvQixXQUFXLEVBQUU7QUFBQSxNQUN4RSwwQkFBMEIsaUJBQWUsS0FBSyxvQkFBb0IsV0FBVyxFQUFFO0FBQUEsTUFDL0UseUJBQXlCLGlCQUFlLEtBQUssb0JBQW9CLFdBQVcsRUFBRTtBQUFBLE1BQzlFLDJCQUEyQixpQkFBZSxLQUFLLG9CQUFvQixXQUFXLEVBQUU7QUFBQSxNQUNoRiw2QkFBNkIsQ0FBQyxTQUFTLE1BQU0sS0FBSyxRQUFRLDRCQUE0QixTQUFTLENBQUM7QUFBQSxNQUNoRyxtQ0FBbUMsaUJBQWUsS0FBSyxrQ0FBa0MsV0FBVztBQUFBLE1BQ3BHLHVCQUF1QixNQUFNLEtBQUssc0JBQXNCLHdCQUF3QixLQUFLLFFBQVEsR0FBRztBQUFBLE1BQ2hHLFlBQVksS0FBSztBQUFBLE1BQ2pCLGVBQWUsS0FBSyxRQUFRO0FBQUEsTUFDNUIsb0JBQW9CLEtBQUssUUFBUTtBQUFBLE1BQ2pDLFFBQVEsV0FBUyxLQUFLLFFBQVEsT0FBTyxLQUFLO0FBQUEsSUFDM0MsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRVEsa0NBQWtDLGFBQWdDO0FBQ3pFLFVBQU0sVUFBcUIsQ0FBQyxJQUFJLFVBQVUsQ0FBQztBQUUzQyxVQUFNLGdCQUFnQixLQUFLLHNCQUFzQixxQkFBcUIsV0FBVztBQUNqRixVQUFNLGtCQUFrQixLQUFLLHNCQUFzQixnQ0FBZ0MsYUFBYTtBQUNoRyxVQUFNLGtCQUFrQixLQUFLLHNCQUFzQix5QkFBeUIsYUFBYTtBQUd6RixVQUFNLGNBQWMsQ0FBQztBQUNyQixlQUFXLFlBQVksQ0FBQyxzQkFBc0IsU0FBUyxzQkFBc0IsY0FBYyxzQkFBc0IsS0FBSyxHQUFHO0FBQ3hILFVBQUksb0JBQW9CLFVBQVU7QUFDakMsb0JBQVksS0FBSyxLQUFLLGlCQUFpQixlQUFlLFVBQVUsZUFBZSxDQUFDO0FBQUEsTUFDakY7QUFBQSxJQUNEO0FBRUEsWUFBUSxLQUFLLElBQUksY0FBYyxjQUFjLFNBQVMsY0FBYyxTQUFTLEdBQUcsV0FBVyxDQUFDO0FBRzVGLFFBQUksb0JBQW9CLGlCQUFpQjtBQUN4QyxjQUFRLEtBQUssU0FBUztBQUFBLFFBQ3JCLElBQUk7QUFBQSxRQUF1QixPQUFPLFNBQVMsaUJBQWlCLGdCQUFnQjtBQUFBLFFBQUcsS0FBSyxNQUFNO0FBQ3pGLGVBQUssc0JBQXNCLDRCQUE0QixlQUFlLGlCQUFpQixRQUFXLHFCQUFxQjtBQUN2SCxlQUFLLFlBQVksa0JBQWtCLGNBQWMsSUFBSSxJQUFJO0FBQUEsUUFDMUQ7QUFBQSxNQUNELENBQUMsQ0FBQztBQUFBLElBQ0gsT0FBTztBQUNOLFlBQU0scUJBQXFCLEtBQUssc0JBQXNCLHNCQUFzQixhQUFhO0FBQ3pGLFVBQUksbUJBQW1CLG1CQUFtQixXQUFXLEdBQUc7QUFDdkQsY0FBTSxjQUFjLG1CQUFtQixtQkFBbUIsQ0FBQztBQUMzRCxjQUFNLG1CQUFtQixLQUFLLHNCQUFzQix3QkFBd0IsWUFBWSxFQUFFO0FBQzFGLFlBQUkscUJBQXFCLGVBQWU7QUFDdkMsa0JBQVEsS0FBSyxTQUFTO0FBQUEsWUFDckIsSUFBSTtBQUFBLFlBQXVCLE9BQU8sU0FBUyxpQkFBaUIsZ0JBQWdCO0FBQUEsWUFBRyxLQUFLLE1BQU07QUFDekYsbUJBQUssc0JBQXNCLHFCQUFxQixDQUFDLFdBQVcsR0FBRyxrQkFBa0IsUUFBVyxxQkFBcUI7QUFDakgsbUJBQUssWUFBWSxrQkFBa0IsY0FBYyxJQUFJLElBQUk7QUFBQSxZQUMxRDtBQUFBLFVBQ0QsQ0FBQyxDQUFDO0FBQUEsUUFDSDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLGlCQUFpQixlQUE4QixhQUFvQyxpQkFBaUQ7QUFDM0ksV0FBTyxTQUFTO0FBQUEsTUFDZixJQUFJLHNCQUFzQixXQUFXO0FBQUEsTUFDckMsT0FBTyxnQkFBZ0Isc0JBQXNCLFFBQVEsU0FBUyxTQUFTLE9BQU8sSUFBSSxnQkFBZ0Isc0JBQXNCLFVBQVUsU0FBUyxXQUFXLGtCQUFrQixJQUFJLFNBQVMsZ0JBQWdCLG9CQUFvQjtBQUFBLE1BQ3pOLEtBQUssTUFBTTtBQUNWLFlBQUk7QUFDSixZQUFJLGdCQUFnQixpQkFBaUI7QUFDcEMsa0JBQVEsS0FBSyxzQkFBc0IsNEJBQTRCLFdBQVcsRUFBRTtBQUFBLFFBQzdFLE9BQU87QUFDTixrQkFBUTtBQUFBLFFBQ1Q7QUFDQSxhQUFLLHNCQUFzQiw0QkFBNEIsZUFBZSxhQUFhLEtBQUs7QUFDeEYsYUFBSyxZQUFZLGtCQUFrQixjQUFjLElBQUksSUFBSTtBQUFBLE1BQzFEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsb0JBQTBCO0FBR2pDLFNBQUssVUFBVSxLQUFLLHNCQUFzQiwwQkFBMEIsQ0FBQyxFQUFFLE9BQU8sUUFBUSxNQUFNLEtBQUssMEJBQTBCLE9BQU8sT0FBTyxDQUFDLENBQUM7QUFDM0ksU0FBSyxVQUFVLEtBQUssc0JBQXNCLDZCQUE2QixDQUFDLEVBQUUsZUFBZSxNQUFNLEdBQUcsTUFBTSxLQUFLLGlDQUFpQyxlQUFlLE1BQU0sRUFBRSxDQUFDLENBQUM7QUFHdkssU0FBSyxVQUFVLEtBQUssa0JBQWtCLHVCQUF1QixPQUFLLEtBQUssbUNBQW1DLEVBQUUsTUFBTSxHQUFHLElBQUksQ0FBQyxDQUFDO0FBQzNILFNBQUssVUFBVSxLQUFLLGtCQUFrQix3QkFBd0IsT0FBSyxLQUFLLG1DQUFtQyxFQUFFLE1BQU0sR0FBRyxLQUFLLENBQUMsQ0FBQztBQUc3SCxTQUFLLGlCQUFpQixrQ0FBa0MsRUFBRSxLQUFLLE1BQU07QUFDcEUsVUFBSSxLQUFLLE9BQU8sWUFBWTtBQUMzQjtBQUFBLE1BQ0Q7QUFDQSxXQUFLLHdCQUF3QjtBQUM3QixXQUFLLFVBQVUsS0FBSyxhQUFhLFlBQVksTUFBTTtBQUNsRCxhQUFLLG1DQUFtQyxJQUFJO0FBQzVDLGFBQUsseUJBQXlCO0FBQUEsTUFDL0IsQ0FBQyxDQUFDO0FBQ0YsV0FBSyxVQUFVLEtBQUssZUFBZSxpQkFBaUIsYUFBYSxTQUFTLEtBQUssUUFBUSx5QkFBeUIsS0FBSyxNQUFNLEVBQUUsTUFBTSxLQUFLLG1DQUFtQyxLQUFLLENBQUMsQ0FBQztBQUFBLElBQ25MLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSwwQkFBMEIsT0FBaUYsU0FBbUY7QUFDck0sWUFBUSxPQUFPLENBQUMsRUFBRSxTQUFTLE1BQU0sYUFBYSxLQUFLLFFBQVEsRUFBRSxRQUFRLENBQUMsRUFBRSxVQUFVLE1BQU0sS0FBSyw2QkFBNkIsU0FBUyxDQUFDO0FBQ3BJLFNBQUssNEJBQTRCLE1BQU0sT0FBTyxDQUFDLEVBQUUsU0FBUyxNQUFNLGFBQWEsS0FBSyxRQUFRLEVBQUUsSUFBSSxDQUFDLEVBQUUsVUFBVSxNQUFNLFNBQVMsQ0FBQztBQUFBLEVBQzlIO0FBQUEsRUFFUSxpQ0FBaUMsV0FBMEIsTUFBNkIsSUFBMkI7QUFDMUgsUUFBSSxTQUFTLEtBQUssVUFBVTtBQUMzQixXQUFLLDZCQUE2QixTQUFTO0FBQUEsSUFDNUM7QUFFQSxRQUFJLE9BQU8sS0FBSyxVQUFVO0FBQ3pCLFdBQUssNEJBQTRCLENBQUMsU0FBUyxDQUFDO0FBQUEsSUFDN0M7QUFBQSxFQUNEO0FBQUEsRUFFUSxtQ0FBbUMsSUFBWSxTQUFrQjtBQUN4RSxRQUFJLFNBQVM7QUFFWixXQUFLLDBCQUEwQixFQUFFO0FBQUEsSUFDbEMsT0FBTztBQUVOLFdBQUssYUFBYSxvQkFBb0IsRUFBRTtBQUFBLElBQ3pDO0FBQUEsRUFDRDtBQUFBLEVBRVEsMEJBQWdDO0FBQ3ZDLFNBQUssMEJBQTBCO0FBRy9CLGVBQVcsRUFBRSxHQUFHLEtBQUssS0FBSyxzQkFBc0I7QUFDL0MsWUFBTSxnQkFBZ0IsS0FBSyxpQkFBaUIsRUFBRTtBQUM5QyxVQUFJLGVBQWU7QUFDbEIsYUFBSyx3QkFBd0IsYUFBYTtBQUFBLE1BQzNDLE9BQU87QUFDTixZQUFJLEtBQUssc0JBQXNCLGtDQUFrQyxFQUFFLEdBQUc7QUFDckUsZUFBSyxnQkFBZ0IsRUFBRTtBQUFBLFFBQ3hCLE9BQU87QUFDTixlQUFLLGNBQWMsRUFBRTtBQUFBLFFBQ3RCO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxTQUFLLHlCQUF5QjtBQUFBLEVBQy9CO0FBQUEsRUFFUSwwQkFBMEIsSUFBa0I7QUFDbkQsVUFBTSxnQkFBZ0IsS0FBSyxpQkFBaUIsRUFBRTtBQUM5QyxRQUFJLGVBQWU7QUFHbEIsV0FBSyxhQUFhLGFBQWE7QUFDL0IsV0FBSyxhQUFhLGtCQUFrQixjQUFjLEVBQUU7QUFFcEQsVUFBSSxLQUFLLGVBQWUsYUFBYSxHQUFHO0FBQ3ZDLGNBQU0scUJBQXFCLEtBQUssc0JBQXNCLHNCQUFzQixhQUFhO0FBQ3pGLFlBQUksbUJBQW1CLHNCQUFzQixXQUFXLEdBQUc7QUFFMUQsZUFBSyxjQUFjLGNBQWMsRUFBRTtBQUFBLFFBQ3BDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxPQUFPLFFBQWtDO0FBQ3hDLFdBQU8sS0FBSyxhQUFhLE9BQU8sTUFBTTtBQUFBLEVBQ3ZDO0FBQUEsRUFFUSxvQkFBb0IsYUFBMEo7QUFDckwsUUFBSSxtQkFBbUIsS0FBSyxpQkFBaUIsSUFBSSxXQUFXO0FBQzVELFFBQUksQ0FBQyxrQkFBa0I7QUFDdEIsWUFBTSxnQkFBZ0IsS0FBSyxpQkFBaUIsV0FBVztBQUN2RCxVQUFJO0FBQ0osVUFBSTtBQUNKLFVBQUk7QUFDSixVQUFJLGVBQWU7QUFDbEIsY0FBTSxxQkFBcUIsS0FBSyxzQkFBc0Isc0JBQXNCLGFBQWE7QUFDekYsY0FBTSxhQUFhLEtBQUssNkJBQTZCLGtCQUFrQjtBQUN2RSx5QkFBaUIsS0FBSyxxQkFBcUIsZUFBZSw2QkFBNkIsWUFBWSxLQUFLLE1BQU0sS0FBSyxpQkFBaUI7QUFDcEksdUJBQWUsSUFBSSw0QkFBNEIsWUFBWSxLQUFLLFlBQVk7QUFDNUUsc0JBQWMsSUFBSSwyQkFBMkIsWUFBWSxLQUFLLFlBQVk7QUFBQSxNQUMzRSxPQUFPO0FBQ04sY0FBTSxrQkFBa0IsS0FBSyxxQkFBcUIsT0FBTyxPQUFLLEVBQUUsT0FBTyxXQUFXLEVBQUUsQ0FBQztBQUNyRixjQUFNLGFBQWEsS0FBSyx5QkFBeUIsYUFBYSxpQkFBaUIsUUFBUSxhQUFhLGlCQUFpQixNQUFNLE1BQVM7QUFDcEkseUJBQWlCLEtBQUsscUJBQXFCLGVBQWUsd0NBQXdDLFlBQVksS0FBSyxNQUFNLEtBQUssaUJBQWlCO0FBQy9JLHVCQUFlLElBQUksdUNBQXVDLGFBQWEsS0FBSyxZQUFZO0FBQ3hGLHNCQUFjLElBQUksc0NBQXNDLGFBQWEsS0FBSyxZQUFZO0FBQUEsTUFDdkY7QUFFQSxZQUFNLGFBQWEsbUJBQW1CLGdCQUFnQixjQUFjLFdBQVc7QUFDL0UseUJBQW1CLEVBQUUsZ0JBQWdCLGNBQWMsYUFBYSxTQUFTLE1BQU0sV0FBVyxRQUFRLEVBQUU7QUFDcEcsV0FBSyxpQkFBaUIsSUFBSSxhQUFhLGdCQUFnQjtBQUFBLElBQ3hEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLDRCQUE0QixnQkFBZ0Q7QUFDbkYsZUFBVyxpQkFBaUIsZ0JBQWdCO0FBQzNDLFdBQUssYUFBYSxhQUFhO0FBRy9CLFlBQU0sc0JBQXNCLEtBQUsscUJBQXFCLE9BQU8sQ0FBQyxFQUFFLEdBQUcsTUFBTSxPQUFPLGNBQWMsRUFBRSxFQUFFLENBQUM7QUFDbkcsVUFBSSxDQUFDLHFCQUFxQjtBQUN6QixhQUFLLGFBQWEsSUFBSSxjQUFjLEVBQUU7QUFBQSxNQUN2QztBQUdBLFlBQU0sdUJBQXVCLEtBQUssa0JBQWtCLHVCQUF1QjtBQUMzRSxVQUFJLHNCQUFzQixNQUFNLE1BQU0sY0FBYyxJQUFJO0FBQ3ZELGFBQUssYUFBYSxrQkFBa0IsY0FBYyxFQUFFO0FBQUEsTUFDckQ7QUFFQSxZQUFNLHFCQUFxQixLQUFLLHNCQUFzQixzQkFBc0IsYUFBYTtBQUN6RixXQUFLLDZCQUE2QixlQUFlLGtCQUFrQjtBQUNuRSxXQUFLLHdCQUF3QixhQUFhO0FBRTFDLFlBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxrQkFBWSxJQUFJLG1CQUFtQix5QkFBeUIsTUFBTSxLQUFLLDZCQUE2QixlQUFlLGtCQUFrQixDQUFDLENBQUM7QUFDdkksa0JBQVksSUFBSSxtQkFBbUIsaUNBQWlDLE1BQU0sS0FBSyx3QkFBd0IsYUFBYSxDQUFDLENBQUM7QUFFdEgsV0FBSyx5QkFBeUIsSUFBSSxjQUFjLElBQUksV0FBVztBQUFBLElBQ2hFO0FBQUEsRUFDRDtBQUFBLEVBRVEsNkJBQTZCLGVBQW9DO0FBQ3hFLFNBQUsseUJBQXlCLGlCQUFpQixjQUFjLEVBQUU7QUFDL0QsU0FBSyxnQkFBZ0IsY0FBYyxFQUFFO0FBQUEsRUFDdEM7QUFBQSxFQUVRLDZCQUE2QixlQUE4QixvQkFBK0M7QUFDakgsVUFBTSx5QkFBeUIsS0FBSyw2QkFBNkIsa0JBQWtCO0FBQ25GLFVBQU0sRUFBRSxnQkFBZ0IsYUFBYSxJQUFJLEtBQUssb0JBQW9CLGNBQWMsRUFBRTtBQUNsRixtQkFBZSw2QkFBNkIsc0JBQXNCO0FBRWxFLFFBQUksd0JBQXdCLHdDQUF3QztBQUNuRSxtQkFBYSxZQUFZLHNCQUFzQjtBQUFBLElBQ2hEO0FBRUEsUUFBSSxLQUFLLFFBQVEsZ0JBQWdCO0FBQ2hDLFdBQUssYUFBYSxlQUFlO0FBQUEsSUFDbEM7QUFFQSxTQUFLLHlCQUF5QjtBQUFBLEVBQy9CO0FBQUEsRUFFUSw2QkFBNkIsb0JBQWtFO0FBQ3RHLFdBQU8sS0FBSyx5QkFBeUIsbUJBQW1CLGNBQWMsSUFBSSxtQkFBbUIsT0FBTyxtQkFBbUIsTUFBTSxtQkFBbUIsWUFBWTtBQUFBLEVBQzdKO0FBQUEsRUFFUSx5QkFBeUIsSUFBWSxNQUFjLE1BQW1DLGNBQTJEO0FBQ3hKLFFBQUksYUFBbUM7QUFDdkMsUUFBSSxVQUEyQjtBQUMvQixRQUFJLEtBQUssUUFBUSxNQUFNO0FBQ3RCLFVBQUksSUFBSSxNQUFNLElBQUksR0FBRztBQUNwQixrQkFBVTtBQUNWLGNBQU0sU0FBUyxTQUFTLElBQUk7QUFDNUIsY0FBTSxPQUFPLElBQUksV0FBVztBQUM1QixhQUFLLE9BQU8sTUFBTTtBQUNsQixjQUFNLFNBQVMsWUFBWSxHQUFHLFFBQVEsT0FBTyxHQUFHLENBQUMsSUFBSSxLQUFLLE9BQU8sQ0FBQztBQUNsRSxjQUFNLFlBQVksc0JBQXNCLEtBQUssUUFBUSxrQkFBa0IscUNBQXFDLE1BQU07QUFDbEgscUJBQWEsQ0FBQyxRQUFRLFVBQVU7QUFDaEMsc0JBQWMsV0FBVztBQUFBLFlBQ2pCLE1BQU07QUFBQSwrQ0FDNkIsS0FBSyxRQUFRLFFBQVE7QUFBQSxvQkFDaEQsTUFBTTtBQUFBLHVEQUM2QixLQUFLLFFBQVEsUUFBUTtBQUFBO0FBQUE7QUFBQSxJQUd4RTtBQUFBLE1BQ0QsV0FBVyxVQUFVLFlBQVksSUFBSSxHQUFHO0FBQ3ZDLHFCQUFhLFVBQVUsaUJBQWlCLElBQUk7QUFBQSxNQUM3QztBQUFBLElBQ0Q7QUFFQSxXQUFPLEVBQUUsSUFBSSxNQUFNLFlBQVksU0FBUyxhQUFhO0FBQUEsRUFDdEQ7QUFBQSxFQUVRLHdCQUF3QixlQUFvQztBQUNuRSxRQUFJLEtBQUssZUFBZSxhQUFhLEdBQUc7QUFDdkMsV0FBSyxjQUFjLGNBQWMsRUFBRTtBQUFBLElBQ3BDLE9BQU87QUFDTixXQUFLLGFBQWEsYUFBYTtBQUcvQixZQUFNLHNCQUFzQixLQUFLLGtCQUFrQix1QkFBdUI7QUFDMUUsVUFBSSxxQkFBcUIsTUFBTSxNQUFNLGNBQWMsSUFBSTtBQUN0RCxhQUFLLGFBQWEsa0JBQWtCLGNBQWMsRUFBRTtBQUFBLE1BQ3JEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGVBQWUsbUJBQTJDLHFCQUFxRDtBQUN0SCxVQUFNLGdCQUFnQixTQUFTLGlCQUFpQixJQUFJLEtBQUssaUJBQWlCLGlCQUFpQixJQUFJO0FBQy9GLFVBQU0sa0JBQWtCLFNBQVMsaUJBQWlCLElBQUksb0JBQW9CLGtCQUFrQjtBQUU1RixRQUFJLGVBQWU7QUFDbEIsVUFBSSxjQUFjLGFBQWE7QUFDOUIsWUFBSSxLQUFLLFlBQVksc0JBQXNCLGVBQWUsR0FBRztBQUM1RCxpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNELE9BQU87QUFDTixlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFHQSxRQUFJLENBQUMsS0FBSywyQkFBMkIsRUFBRSxLQUFLLFNBQVMsTUFBTSxnQkFBZ0IsS0FBSyxtQkFBbUIsbUJBQW1CLFdBQVc7QUFDaEksNEJBQXNCLHVCQUF1QixLQUFLLHFCQUFxQixLQUFLLENBQUMsRUFBRSxHQUFHLE1BQU0sT0FBTyxlQUFlO0FBRzlHLFVBQUksQ0FBQyxpQkFBaUIscUJBQXFCLGFBQWEscUJBQXFCLFNBQVM7QUFDckYsZUFBTztBQUFBLE1BQ1I7QUFFQSxVQUFJLHFCQUFxQixPQUFPLFFBQVE7QUFDdkMsZUFBTyxvQkFBb0IsTUFBTSxNQUFNLENBQUMsRUFBRSxLQUFLLE1BQU0sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLGtCQUFrQixvQkFBb0IsZUFBZSxZQUFZLElBQUksQ0FBQyxDQUFDO0FBQUEsTUFDN0k7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLGFBQWEsZUFBb0M7QUFDeEQsU0FBSyxhQUFhLGFBQWEsRUFBRSxJQUFJLGNBQWMsSUFBSSxNQUFNLE9BQU8sY0FBYyxVQUFVLFdBQVcsY0FBYyxRQUFRLGNBQWMsTUFBTSxPQUFPLE9BQU8sY0FBYyxPQUFPLGdCQUFnQixjQUFjLGVBQWUsQ0FBQztBQUFBLEVBQ25PO0FBQUEsRUFFUSxjQUFjLGFBQTJCO0FBQ2hELFNBQUssYUFBYSxjQUFjLFdBQVc7QUFFM0MsVUFBTSxtQkFBbUIsS0FBSyxpQkFBaUIsSUFBSSxXQUFXO0FBQzlELFFBQUksa0JBQWtCO0FBQ3JCLFdBQUssaUJBQWlCLGlCQUFpQixXQUFXO0FBQUEsSUFDbkQ7QUFBQSxFQUNEO0FBQUEsRUFFUSxnQkFBZ0IsYUFBMkI7QUFDbEQsU0FBSyxhQUFhLGdCQUFnQixXQUFXO0FBRTdDLFVBQU0sbUJBQW1CLEtBQUssaUJBQWlCLElBQUksV0FBVztBQUM5RCxRQUFJLGtCQUFrQjtBQUNyQixXQUFLLGlCQUFpQixpQkFBaUIsV0FBVztBQUFBLElBQ25EO0FBQUEsRUFDRDtBQUFBLEVBRUEsNEJBQXNDO0FBQ3JDLFVBQU0scUJBQXFCLEtBQUssYUFBYSxvQkFBb0IsRUFBRSxJQUFJLE9BQUssRUFBRSxFQUFFO0FBQ2hGLFdBQU8sS0FBSyxrQkFBa0IsRUFDNUIsT0FBTyxPQUFLLEtBQUssYUFBYSxTQUFTLEVBQUUsRUFBRSxDQUFDLEVBQzVDLEtBQUssQ0FBQyxJQUFJLE9BQU8sbUJBQW1CLFFBQVEsR0FBRyxFQUFFLElBQUksbUJBQW1CLFFBQVEsR0FBRyxFQUFFLENBQUMsRUFDdEYsSUFBSSxPQUFLLEVBQUUsRUFBRTtBQUFBLEVBQ2hCO0FBQUEsRUFFQSw2QkFBdUM7QUFDdEMsV0FBTyxLQUFLLGFBQWEscUJBQXFCLEVBQzVDLE9BQU8sT0FBSyxLQUFLLGtCQUFrQix1QkFBdUIsR0FBRyxNQUFNLE1BQU0sRUFBRSxNQUFNLEtBQUssYUFBYSxTQUFTLEVBQUUsRUFBRSxDQUFDLEVBQ2pILElBQUksT0FBSyxFQUFFLEVBQUU7QUFBQSxFQUNoQjtBQUFBLEVBRUEsc0JBQWdDO0FBQy9CLFdBQU8sS0FBSyxhQUFhLHFCQUFxQixFQUM1QyxJQUFJLE9BQUssRUFBRSxFQUFFO0FBQUEsRUFDaEI7QUFBQSxFQUVBLHdCQUFtQztBQUNsQyxXQUFPLEtBQUssYUFBYSxzQkFBc0I7QUFBQSxFQUNoRDtBQUFBLEVBRUEsTUFBTSxPQUFzQjtBQUMzQixTQUFLLGFBQWEsTUFBTSxLQUFLO0FBQUEsRUFDOUI7QUFBQSxFQUVBLE9BQU8sT0FBZSxRQUFzQjtBQUMzQyxTQUFLLGFBQWEsT0FBTyxJQUFJLFVBQVUsT0FBTyxNQUFNLENBQUM7QUFBQSxFQUN0RDtBQUFBLEVBRVEsaUJBQWlCLElBQXVDO0FBQy9ELFVBQU0sZ0JBQWdCLEtBQUssc0JBQXNCLHFCQUFxQixFQUFFO0FBQ3hFLFdBQU8saUJBQWlCLEtBQUssc0JBQXNCLHlCQUF5QixhQUFhLE1BQU0sS0FBSyxXQUFXLGdCQUFnQjtBQUFBLEVBQ2hJO0FBQUEsRUFFUSxvQkFBOEM7QUFDckQsV0FBTyxLQUFLLHNCQUFzQiw0QkFBNEIsS0FBSyxRQUFRO0FBQUEsRUFDNUU7QUFBQSxFQUVRLG1DQUFtQyxnQkFBK0I7QUFDekUsUUFBSSxLQUFLLDhCQUE4QixLQUFLLG1DQUFtQyxHQUFHO0FBQ2pGO0FBQUEsSUFDRDtBQUVBLFNBQUssa0NBQWtDO0FBQ3ZDLFNBQUssNkJBQTZCO0FBQ2xDLFNBQUssd0JBQXdCO0FBRTdCLFVBQU0sb0JBQXlDLENBQUM7QUFDaEQsVUFBTSxpQkFBaUIsS0FBSyxhQUFhLHFCQUFxQjtBQUU5RCxlQUFXLHVCQUF1QixLQUFLLHNCQUFzQjtBQUM1RCx3QkFBa0IsS0FBSztBQUFBLFFBQ3RCLElBQUksb0JBQW9CO0FBQUEsUUFDeEIsTUFBTSxvQkFBb0I7QUFBQSxRQUMxQixPQUFPLG9CQUFvQjtBQUFBLFFBQzNCLFFBQVEsb0JBQW9CO0FBQUEsUUFDNUIsU0FBUyxvQkFBb0IsV0FBVyxDQUFDLENBQUMsS0FBSyxpQkFBaUIsb0JBQW9CLEVBQUU7QUFBQSxNQUN2RixDQUFDO0FBQUEsSUFDRjtBQUVBLGVBQVcsaUJBQWlCLEtBQUssa0JBQWtCLEdBQUc7QUFFckQsVUFBSSxDQUFDLGtCQUFrQixLQUFLLENBQUMsRUFBRSxHQUFHLE1BQU0sT0FBTyxjQUFjLEVBQUUsR0FBRztBQUNqRSxjQUFNLFFBQVEsZUFBZSxVQUFVLENBQUMsRUFBRSxHQUFHLE1BQU0sT0FBTyxjQUFjLEVBQUU7QUFDMUUsWUFBSSxVQUFVLElBQUk7QUFDakIsZ0JBQU0sZ0JBQWdCLGVBQWUsS0FBSztBQUMxQyw0QkFBa0IsT0FBTyxPQUFPLEdBQUc7QUFBQSxZQUNsQyxJQUFJLGNBQWM7QUFBQSxZQUNsQixNQUFNLE9BQU8sY0FBYyxVQUFVLFdBQVcsY0FBYyxRQUFRLGNBQWMsTUFBTTtBQUFBLFlBQzFGLE9BQU8sY0FBYztBQUFBLFlBQ3JCLFFBQVEsY0FBYztBQUFBLFlBQ3RCLFNBQVMsY0FBYztBQUFBLFVBQ3hCLENBQUM7QUFBQSxRQUNGLE9BQU87QUFDTiw0QkFBa0IsS0FBSztBQUFBLFlBQ3RCLElBQUksY0FBYztBQUFBLFlBQ2xCLE1BQU0sT0FBTyxjQUFjLFVBQVUsV0FBVyxjQUFjLFFBQVEsY0FBYyxNQUFNO0FBQUEsWUFDMUYsT0FBTyxjQUFjO0FBQUEsWUFDckIsUUFBUTtBQUFBLFlBQ1IsU0FBUyxDQUFDLEtBQUssZUFBZSxhQUFhO0FBQUEsVUFDNUMsQ0FBQztBQUFBLFFBQ0Y7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFFBQUksZ0JBQWdCO0FBQ25CLGlCQUFXLGlCQUFpQixnQkFBZ0I7QUFDM0MsY0FBTSxtQkFBbUIsa0JBQWtCLEtBQUssQ0FBQyxFQUFFLEdBQUcsTUFBTSxPQUFPLGNBQWMsRUFBRTtBQUNuRixZQUFJLENBQUMsa0JBQWtCO0FBQ3RCLDRCQUFrQixLQUFLLGFBQWE7QUFBQSxRQUNyQztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsU0FBSyxhQUFhLHFCQUFxQixpQkFBaUI7QUFBQSxFQUN6RDtBQUFBLEVBRVEsMkJBQWlDO0FBQ3hDLFVBQU0sUUFBZ0MsQ0FBQztBQUV2QyxVQUFNLGlCQUFpQixLQUFLLGFBQWEscUJBQXFCO0FBQzlELGVBQVcsaUJBQWlCLGdCQUFnQjtBQUMzQyxZQUFNLGdCQUFnQixLQUFLLGlCQUFpQixjQUFjLEVBQUU7QUFDNUQsVUFBSSxlQUFlO0FBQ2xCLGNBQU0scUJBQXFCLEtBQUssc0JBQXNCLHNCQUFzQixhQUFhO0FBQ3pGLGNBQU0sUUFBd0MsQ0FBQztBQUMvQyxtQkFBVyxFQUFFLEtBQUssS0FBSyxtQkFBbUIsb0JBQW9CO0FBQzdELGdCQUFNLEtBQUssRUFBRSxNQUFNLE9BQU8sS0FBSyxVQUFVLElBQUksT0FBVSxDQUFDO0FBQUEsUUFDekQ7QUFDQSxjQUFNLEtBQUs7QUFBQSxVQUNWLElBQUksY0FBYztBQUFBLFVBQ2xCLE1BQU0sbUJBQW1CO0FBQUEsVUFDekIsTUFBTSxJQUFJLE1BQU0sbUJBQW1CLElBQUksS0FBSyxLQUFLLG1CQUFtQixrQkFBa0IsU0FBWSxtQkFBbUI7QUFBQTtBQUFBLFVBQ3JIO0FBQUEsVUFDQSxRQUFRLGNBQWM7QUFBQSxVQUN0QixPQUFPLGNBQWM7QUFBQSxVQUNyQixTQUFTLGNBQWM7QUFBQSxVQUN2QixXQUFXLENBQUMsY0FBYztBQUFBLFFBQzNCLENBQUM7QUFBQSxNQUNGLE9BQU87QUFDTixjQUFNLEtBQUssRUFBRSxJQUFJLGNBQWMsSUFBSSxNQUFNLGNBQWMsTUFBTSxRQUFRLGNBQWMsUUFBUSxPQUFPLGNBQWMsT0FBTyxTQUFTLE9BQU8sV0FBVyxNQUFNLENBQUM7QUFBQSxNQUMxSjtBQUFBLElBQ0Q7QUFFQSxTQUFLLCtCQUErQixLQUFLO0FBQUEsRUFDMUM7QUFBQSxFQUdBLElBQVksdUJBQStDO0FBQzFELFFBQUksS0FBSywwQkFBMEIsUUFBVztBQUM3QyxXQUFLLHdCQUF3QixLQUFLLHdCQUF3QjtBQUMxRCxpQkFBVyw0QkFBNEIsS0FBSyw2QkFBNkIsR0FBRztBQUMzRSxjQUFNLHNCQUFzQixLQUFLLHNCQUFzQixLQUFLLFlBQVUsT0FBTyxPQUFPLHlCQUF5QixFQUFFO0FBQy9HLFlBQUkscUJBQXFCO0FBQ3hCLDhCQUFvQixVQUFVLHlCQUF5QixXQUFXLG9CQUFvQjtBQUN0Riw4QkFBb0IsT0FBTyx5QkFBeUI7QUFDcEQsOEJBQW9CLE9BQU8seUJBQXlCLFlBQVkseUJBQXlCLFlBQ3hGLHlCQUF5QixVQUFVLElBQUksT0FBTyx5QkFBeUIsT0FBTyxJQUFJO0FBQ25GLGNBQUksSUFBSSxNQUFNLG9CQUFvQixJQUFJLEtBQUssS0FBSyxtQkFBbUIsaUJBQWlCO0FBQ25GLGdDQUFvQixPQUFPO0FBQUEsVUFDNUI7QUFDQSw4QkFBb0IsUUFBUSx5QkFBeUI7QUFDckQsOEJBQW9CLFlBQVkseUJBQXlCO0FBQUEsUUFDMUQ7QUFBQSxNQUNEO0FBQ0EsaUJBQVcsK0JBQStCLEtBQUssZ0NBQWdDLEdBQUc7QUFDakYsY0FBTSxzQkFBc0IsS0FBSyxzQkFBc0IsS0FBSyxZQUFVLE9BQU8sT0FBTyw0QkFBNEIsRUFBRTtBQUNsSCxZQUFJLHFCQUFxQjtBQUN4Qiw4QkFBb0IsVUFBVSw0QkFBNEIsV0FBVyxvQkFBb0I7QUFBQSxRQUMxRjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRVEsK0JBQStCLHNCQUFvRDtBQUMxRixVQUFNLHVCQUF1QixLQUFLLHdCQUF3QjtBQUMxRCxTQUFLLHdCQUF3QixxQkFBcUIsSUFBSSxDQUFDLEVBQUUsSUFBSSxRQUFRLE1BQU0sT0FBTztBQUFBLE1BQ2pGO0FBQUEsTUFDQTtBQUFBLE1BQ0EsU0FBUyxRQUFRLHFCQUFxQixLQUFLLENBQUMsRUFBRSxJQUFJLFNBQVMsTUFBTSxhQUFhLEVBQUUsR0FBRyxPQUFPO0FBQUEsTUFDMUY7QUFBQSxJQUNELEVBQWlDLENBQUM7QUFFbEMsU0FBSyw2QkFBNkIscUJBQXFCLElBQUksQ0FBQyxFQUFFLElBQUksTUFBTSxNQUFNLE9BQU8sVUFBVSxPQUFPO0FBQUEsTUFDckc7QUFBQSxNQUNBLFNBQVMsSUFBSSxNQUFNLElBQUksSUFBSSxPQUFPO0FBQUEsTUFDbEMsV0FBVyxVQUFVLFlBQVksSUFBSSxJQUFJLE9BQU87QUFBQSxNQUNoRDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxFQUFzQyxDQUFDO0FBRXZDLFNBQUssZ0NBQWdDLHFCQUFxQixJQUFJLENBQUMsRUFBRSxJQUFJLFFBQVEsT0FBTztBQUFBLE1BQ25GO0FBQUEsTUFDQTtBQUFBLElBQ0QsRUFBeUMsQ0FBQztBQUFBLEVBQzNDO0FBQUEsRUFFUSwwQkFBa0Q7QUFDekQsV0FBTyxLQUFLLE1BQU0sS0FBSyx5QkFBeUI7QUFBQSxFQUNqRDtBQUFBLEVBRVEsd0JBQXdCLHNCQUFvRDtBQUNuRixTQUFLLDRCQUE0QixLQUFLLFVBQVUsb0JBQW9CO0FBQUEsRUFDckU7QUFBQSxFQUdBLElBQVksNEJBQW9DO0FBQy9DLFFBQUksQ0FBQyxLQUFLLDRCQUE0QjtBQUNyQyxXQUFLLDZCQUE2QixLQUFLLG1DQUFtQztBQUFBLElBQzNFO0FBRUEsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBWSwwQkFBMEIsMkJBQW1DO0FBQ3hFLFFBQUksS0FBSyw4QkFBOEIsMkJBQTJCO0FBQ2pFLFdBQUssNkJBQTZCO0FBQ2xDLFdBQUssbUNBQW1DLHlCQUF5QjtBQUFBLElBQ2xFO0FBQUEsRUFDRDtBQUFBLEVBRVEscUNBQTZDO0FBQ3BELFdBQU8sS0FBSyxlQUFlLElBQUksS0FBSyxRQUFRLHlCQUF5QixhQUFhLFNBQVMsSUFBSTtBQUFBLEVBQ2hHO0FBQUEsRUFFUSxtQ0FBbUMsT0FBcUI7QUFDL0QsU0FBSyxlQUFlLE1BQU0sS0FBSyxRQUFRLHlCQUF5QixPQUFPLGFBQWEsU0FBUyxjQUFjLElBQUk7QUFBQSxFQUNoSDtBQUFBLEVBRVEsK0JBQTREO0FBQ25FLFdBQU8sS0FBSyxNQUFNLEtBQUssOEJBQThCO0FBQUEsRUFDdEQ7QUFBQSxFQUVRLDZCQUE2QiwyQkFBOEQ7QUFDbEcsU0FBSyxpQ0FBaUMsS0FBSyxVQUFVLHlCQUF5QjtBQUFBLEVBQy9FO0FBQUEsRUFHQSxJQUFZLGlDQUF5QztBQUNwRCxRQUFJLENBQUMsS0FBSyxpQ0FBaUM7QUFDMUMsV0FBSyxrQ0FBa0MsS0FBSyx3Q0FBd0M7QUFBQSxJQUNyRjtBQUVBLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQVksK0JBQStCLCtCQUF1QztBQUNqRixRQUFJLEtBQUssbUNBQW1DLCtCQUErQjtBQUMxRSxXQUFLLGtDQUFrQztBQUN2QyxXQUFLLHdDQUF3Qyw2QkFBNkI7QUFBQSxJQUMzRTtBQUFBLEVBQ0Q7QUFBQSxFQUVRLDBDQUFrRDtBQUN6RCxXQUFPLEtBQUssZUFBZSxJQUFJLEtBQUssUUFBUSw4QkFBOEIsYUFBYSxTQUFTLElBQUk7QUFBQSxFQUNyRztBQUFBLEVBRVEsd0NBQXdDLE9BQXFCO0FBQ3BFLFNBQUssZUFBZSxNQUFNLEtBQUssUUFBUSw4QkFBOEIsT0FBTyxhQUFhLFNBQVMsY0FBYyxPQUFPO0FBQUEsRUFDeEg7QUFBQSxFQUVRLGtDQUFrRTtBQUN6RSxXQUFPLEtBQUssTUFBTSxLQUFLLGlDQUFpQztBQUFBLEVBQ3pEO0FBQUEsRUFFUSxnQ0FBZ0MsOEJBQW9FO0FBQzNHLFNBQUssb0NBQW9DLEtBQUssVUFBVSw0QkFBNEI7QUFBQSxFQUNyRjtBQUFBLEVBR0EsSUFBWSxvQ0FBNEM7QUFDdkQsUUFBSSxDQUFDLEtBQUssb0NBQW9DO0FBQzdDLFdBQUsscUNBQXFDLEtBQUssMkNBQTJDO0FBQUEsSUFDM0Y7QUFFQSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFZLGtDQUFrQyxtQ0FBMkM7QUFDeEYsUUFBSSxLQUFLLHNDQUFzQyxtQ0FBbUM7QUFDakYsV0FBSyxxQ0FBcUM7QUFDMUMsV0FBSywyQ0FBMkMsaUNBQWlDO0FBQUEsSUFDbEY7QUFBQSxFQUNEO0FBQUEsRUFFUSw2Q0FBcUQ7QUFDNUQsV0FBTyxLQUFLLGVBQWUsSUFBSSxLQUFLLFFBQVEsaUNBQWlDLGFBQWEsV0FBVyxJQUFJO0FBQUEsRUFDMUc7QUFBQSxFQUVRLDJDQUEyQyxPQUFxQjtBQUN2RSxTQUFLLGVBQWUsTUFBTSxLQUFLLFFBQVEsaUNBQWlDLE9BQU8sYUFBYSxXQUFXLGNBQWMsT0FBTztBQUFBLEVBQzdIO0FBQ0Q7QUFucUJhLG1CQUFOO0FBQUEsRUFlSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXRCVTtBQXFxQmIsSUFBTSw4QkFBTixjQUEwQyxtQkFBbUI7QUFBQSxFQU01RCxZQUNDLHdCQUNpQixNQUNBLG1CQUN5QixlQUNGLHNCQUNMLGlCQUNsQztBQUNELFVBQU0sc0JBQXNCO0FBTlg7QUFDQTtBQUN5QjtBQUNGO0FBQ0w7QUFScEMsU0FBUSxVQUFVO0FBV2pCLFNBQUssZUFBZTtBQUNwQixTQUFLLFVBQVUsS0FBSyxnQkFBZ0Isb0JBQW9CLDJCQUF5QjtBQUNoRixVQUFJLENBQUMsU0FBUyxxQkFBcUIsS0FBSyxzQkFBc0IsT0FBTyxLQUFLLHVCQUF1QixJQUFJO0FBQ3BHLGFBQUssZUFBZTtBQUFBLE1BQ3JCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSw2QkFBNkIsd0JBQXVEO0FBQ25GLFNBQUsseUJBQXlCO0FBQUEsRUFDL0I7QUFBQSxFQUVRLGlCQUF1QjtBQUM5QixTQUFLLGFBQWEsS0FBSyxnQkFBZ0IsMkJBQTJCLEtBQUssdUJBQXVCLEVBQUU7QUFBQSxFQUNqRztBQUFBLEVBRUEsTUFBZSxJQUFJLE9BQWtEO0FBQ3BFLFFBQUksYUFBYSxLQUFLLEtBQUssTUFBTSxXQUFXLEdBQUc7QUFDOUM7QUFBQSxJQUNEO0FBR0EsVUFBTSxNQUFNLEtBQUssSUFBSTtBQUNyQixRQUFJLE1BQU0sS0FBSyxXQUFrRSxNQUFNLEtBQUssVUFBVSw0QkFBNEIseUJBQXlCO0FBQzFKO0FBQUEsSUFDRDtBQUNBLFNBQUssVUFBVTtBQUVmLFVBQU0sUUFBUyxTQUFTLG1CQUFtQixRQUFTLENBQUMsTUFBTSxnQkFBZ0I7QUFFM0UsUUFBSSxLQUFLLFNBQVMsTUFBTSxrQkFBa0I7QUFDekMsWUFBTSxpQkFBaUIsS0FBSyxjQUFjLFVBQVUsTUFBTSxZQUFZO0FBQ3RFLFlBQU0sZ0JBQWdCLEtBQUssa0JBQWtCLHVCQUF1QjtBQUNwRSxZQUFNLGdCQUFnQixLQUFLLHFCQUFxQixTQUFpQix5Q0FBeUM7QUFFMUcsVUFBSSxrQkFBa0IsZUFBZSxNQUFNLE1BQU0sS0FBSyx1QkFBdUIsSUFBSTtBQUNoRixnQkFBUSxlQUFlO0FBQUEsVUFDdEIsS0FBSztBQUNKLGlCQUFLLGtCQUFrQixrQkFBa0IsS0FBSyx1QkFBdUIsSUFBSSxLQUFLO0FBQzlFO0FBQUEsVUFDRCxLQUFLO0FBQUEsVUFDTDtBQUVDLGlCQUFLLGNBQWMsY0FBYyxNQUFNLE1BQU0sWUFBWTtBQUN6RDtBQUFBLFFBQ0Y7QUFFQTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsVUFBTSxLQUFLLGtCQUFrQixrQkFBa0IsS0FBSyx1QkFBdUIsSUFBSSxLQUFLO0FBQ3BGLFdBQU8sS0FBSyxTQUFTO0FBQUEsRUFDdEI7QUFDRDtBQXJFTSw0QkFFbUIsMEJBQTBCO0FBRjdDLDhCQUFOO0FBQUEsRUFVRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FaRztBQXVFTixNQUFNLCtDQUErQyw0QkFBNEI7QUFBRTtBQUVuRixNQUFNLCtDQUErQyw0QkFBNEI7QUFBQSxFQUVoRixZQUFZLElBQVksY0FBNkI7QUFDcEQsVUFBTSxFQUFFLElBQUksTUFBTSxJQUFJLFlBQVksT0FBVSxHQUFHLFlBQVk7QUFBQSxFQUM1RDtBQUFBLEVBRUEsWUFBWSxVQUF5QztBQUNwRCxTQUFLLFFBQVEsU0FBUztBQUFBLEVBQ3ZCO0FBQ0Q7QUFFQSxNQUFNLDhDQUE4QywyQkFBMkI7QUFBQSxFQUU5RSxZQUFZLElBQVksY0FBNkI7QUFDcEQsVUFBTSxFQUFFLElBQUksTUFBTSxJQUFJLFlBQVksT0FBVSxHQUFHLFlBQVk7QUFBQSxFQUM1RDtBQUFBLEVBRUEsMEJBQTBCLFlBQTJDO0FBQ3BFLFNBQUssUUFBUSxXQUFXO0FBQUEsRUFDekI7QUFDRDsiLAogICJuYW1lcyI6IFtdCn0K
