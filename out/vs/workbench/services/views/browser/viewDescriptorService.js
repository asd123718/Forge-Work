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
import { ViewContainerLocation, IViewDescriptorService, Extensions as ViewExtensions, ViewVisibilityState, defaultViewIcon, ViewContainerLocationToString, VIEWS_LOG_ID, VIEWS_LOG_NAME, WindowEnablement } from "../../../common/views.js";
import { RawContextKey, IContextKeyService, ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { toDisposable, DisposableStore, Disposable, DisposableMap } from "../../../../base/common/lifecycle.js";
import { ViewPaneContainer, ViewPaneContainerAction, ViewsSubMenu } from "../../../browser/parts/views/viewPaneContainer.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { getViewsStateStorageId, ViewContainerModel } from "../common/viewContainerModel.js";
import { registerAction2, Action2, MenuId } from "../../../../platform/actions/common/actions.js";
import { localize, localize2 } from "../../../../nls.js";
import { ILoggerService } from "../../../../platform/log/common/log.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { IViewsService } from "../common/viewsService.js";
import { windowLogGroup } from "../../log/common/logConstants.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
function getViewContainerStorageId(viewContainerId) {
  return `${viewContainerId}.state`;
}
let ViewDescriptorService = class extends Disposable {
  constructor(instantiationService, contextKeyService, storageService, extensionService, telemetryService, loggerService, environmentService) {
    super();
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.storageService = storageService;
    this.extensionService = extensionService;
    this.telemetryService = telemetryService;
    this._onDidChangeContainer = this._register(new Emitter());
    this.onDidChangeContainer = this._onDidChangeContainer.event;
    this._onDidChangeLocation = this._register(new Emitter());
    this.onDidChangeLocation = this._onDidChangeLocation.event;
    this._onDidChangeContainerLocation = this._register(new Emitter());
    this.onDidChangeContainerLocation = this._onDidChangeContainerLocation.event;
    this.viewContainerModels = this._register(new DisposableMap());
    this.viewsVisibilityActionDisposables = this._register(new DisposableMap());
    this.canRegisterViewsVisibilityActions = false;
    this._onDidChangeViewContainers = this._register(new Emitter());
    this.onDidChangeViewContainers = this._onDidChangeViewContainers.event;
    this.logger = new Lazy(() => loggerService.createLogger(VIEWS_LOG_ID, { name: VIEWS_LOG_NAME, group: windowLogGroup }));
    this.isSessionsWindow = environmentService.isSessionsWindow;
    this.activeViewContextKeys = /* @__PURE__ */ new Map();
    this.movableViewContextKeys = /* @__PURE__ */ new Map();
    this.defaultViewLocationContextKeys = /* @__PURE__ */ new Map();
    this.defaultViewContainerLocationContextKeys = /* @__PURE__ */ new Map();
    this.viewContainersRegistry = Registry.as(ViewExtensions.ViewContainersRegistry);
    this.viewsRegistry = Registry.as(ViewExtensions.ViewsRegistry);
    this.migrateToViewsCustomizationsStorage();
    this.viewContainersCustomLocations = new Map(Object.entries(this.viewCustomizations.viewContainerLocations));
    this.viewDescriptorsCustomLocations = new Map(Object.entries(this.viewCustomizations.viewLocations));
    this.viewContainerBadgeEnablementStates = new Map(Object.entries(this.viewCustomizations.viewContainerBadgeEnablementStates));
    this.viewContainers.forEach((viewContainer) => this.onDidRegisterViewContainer(viewContainer));
    this._register(this.viewsRegistry.onViewsRegistered((views) => this.onDidRegisterViews(views)));
    this._register(this.viewsRegistry.onViewsDeregistered(({ views, viewContainer }) => this.onDidDeregisterViews(views, viewContainer)));
    this._register(this.viewsRegistry.onDidChangeContainer(({ views, from, to }) => this.onDidChangeDefaultContainer(views, from, to)));
    this._register(this.viewContainersRegistry.onDidRegister(({ viewContainer }) => {
      if (!this.isViewContainerEnabled(viewContainer)) {
        return;
      }
      this.onDidRegisterViewContainer(viewContainer);
      this._onDidChangeViewContainers.fire({ added: [{ container: viewContainer, location: this.getViewContainerLocation(viewContainer) }], removed: [] });
    }));
    this._register(this.viewContainersRegistry.onDidDeregister(({ viewContainer, viewContainerLocation }) => {
      if (!this.isViewContainerEnabled(viewContainer)) {
        return;
      }
      this.onDidDeregisterViewContainer(viewContainer);
      this._onDidChangeViewContainers.fire({ removed: [{ container: viewContainer, location: viewContainerLocation }], added: [] });
    }));
    this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, ViewDescriptorService.VIEWS_CUSTOMIZATIONS, this._store)(() => this.onDidStorageChange()));
    this.extensionService.whenInstalledExtensionsRegistered().then(() => this.whenExtensionsRegistered());
  }
  get viewContainers() {
    return this.viewContainersRegistry.all.filter((vc) => this.isViewContainerEnabled(vc));
  }
  migrateToViewsCustomizationsStorage() {
    if (this.storageService.get(ViewDescriptorService.VIEWS_CUSTOMIZATIONS, StorageScope.PROFILE)) {
      return;
    }
    const viewContainerLocationsValue = this.storageService.get("views.cachedViewContainerLocations", StorageScope.PROFILE);
    const viewDescriptorLocationsValue = this.storageService.get("views.cachedViewPositions", StorageScope.PROFILE);
    if (!viewContainerLocationsValue && !viewDescriptorLocationsValue) {
      return;
    }
    const viewContainerLocations = viewContainerLocationsValue ? JSON.parse(viewContainerLocationsValue) : [];
    const viewDescriptorLocations = viewDescriptorLocationsValue ? JSON.parse(viewDescriptorLocationsValue) : [];
    const viewsCustomizations = {
      viewContainerLocations: viewContainerLocations.reduce((result, [id, location]) => {
        result[id] = location;
        return result;
      }, {}),
      viewLocations: viewDescriptorLocations.reduce((result, [id, { containerId }]) => {
        result[id] = containerId;
        return result;
      }, {}),
      viewContainerBadgeEnablementStates: {}
    };
    this.storageService.store(ViewDescriptorService.VIEWS_CUSTOMIZATIONS, JSON.stringify(viewsCustomizations), StorageScope.PROFILE, StorageTarget.USER);
    this.storageService.remove("views.cachedViewContainerLocations", StorageScope.PROFILE);
    this.storageService.remove("views.cachedViewPositions", StorageScope.PROFILE);
  }
  registerGroupedViews(groupedViews) {
    for (const [containerId, views] of groupedViews.entries()) {
      const viewContainer = this.getViewContainerById(containerId);
      if (!viewContainer || !this.viewContainerModels.has(viewContainer)) {
        if (this.isGeneratedContainerId(containerId)) {
          const viewContainerLocation = this.viewContainersCustomLocations.get(containerId);
          if (viewContainerLocation !== void 0) {
            this.registerGeneratedViewContainer(viewContainerLocation, containerId);
          }
        }
        continue;
      }
      const viewsToAdd = views.filter((view) => this.getViewContainerModel(viewContainer).allViewDescriptors.filter((vd) => vd.id === view.id).length === 0);
      this.addViews(viewContainer, viewsToAdd);
    }
  }
  deregisterGroupedViews(groupedViews) {
    for (const [viewContainerId, views] of groupedViews.entries()) {
      const viewContainer = this.getViewContainerById(viewContainerId);
      if (!viewContainer || !this.viewContainerModels.has(viewContainer)) {
        continue;
      }
      this.removeViews(viewContainer, views);
    }
  }
  moveOrphanViewsToDefaultLocation() {
    for (const [viewId, containerId] of this.viewDescriptorsCustomLocations.entries()) {
      if (this.getViewContainerById(containerId)) {
        continue;
      }
      const viewContainer = this.viewsRegistry.getViewContainer(viewId);
      const viewDescriptor = this.getViewDescriptorById(viewId);
      if (viewContainer && viewDescriptor) {
        this.addViews(viewContainer, [viewDescriptor]);
      }
    }
  }
  whenExtensionsRegistered() {
    this.moveOrphanViewsToDefaultLocation();
    for (const viewContainerId of [...this.viewContainersCustomLocations.keys()]) {
      this.cleanUpGeneratedViewContainer(viewContainerId);
    }
    this.saveViewCustomizations();
    for (const [key, value] of this.viewContainerModels) {
      this.registerViewsVisibilityActions(key, value);
    }
    this.canRegisterViewsVisibilityActions = true;
  }
  onDidRegisterViews(views) {
    this.contextKeyService.bufferChangeEvents(() => {
      views.forEach(({ views: views2, viewContainer }) => {
        const regroupedViews = this.regroupViews(viewContainer.id, views2);
        this.registerGroupedViews(regroupedViews);
        views2.forEach((viewDescriptor) => this.getOrCreateMovableViewContextKey(viewDescriptor).set(!!viewDescriptor.canMoveView));
      });
    });
  }
  isGeneratedContainerId(id) {
    return id.startsWith(ViewDescriptorService.COMMON_CONTAINER_ID_PREFIX);
  }
  onDidDeregisterViews(views, viewContainer) {
    const regroupedViews = this.regroupViews(viewContainer.id, views);
    this.deregisterGroupedViews(regroupedViews);
    this.contextKeyService.bufferChangeEvents(() => {
      views.forEach((viewDescriptor) => this.getOrCreateMovableViewContextKey(viewDescriptor).set(false));
    });
  }
  regroupViews(containerId, views) {
    const viewsByContainer = /* @__PURE__ */ new Map();
    for (const viewDescriptor of views) {
      const correctContainerId = this.viewDescriptorsCustomLocations.get(viewDescriptor.id) ?? containerId;
      let containerViews = viewsByContainer.get(correctContainerId);
      if (!containerViews) {
        viewsByContainer.set(correctContainerId, containerViews = []);
      }
      containerViews.push(viewDescriptor);
    }
    return viewsByContainer;
  }
  getViewDescriptorById(viewId) {
    const view = this.viewsRegistry.getView(viewId);
    if (view && !this.isViewEnabled(view)) {
      return null;
    }
    return view;
  }
  getViewLocationById(viewId) {
    const container = this.getViewContainerByViewId(viewId);
    if (container === null) {
      return null;
    }
    return this.getViewContainerLocation(container);
  }
  getViewContainerByViewId(viewId) {
    const view = this.viewsRegistry.getView(viewId);
    if (view && !this.isViewEnabled(view)) {
      return null;
    }
    const containerId = this.viewDescriptorsCustomLocations.get(viewId);
    return containerId ? this.getViewContainerById(containerId) : this.getDefaultContainerById(viewId);
  }
  getViewContainerLocation(viewContainer) {
    return this.viewContainersCustomLocations.get(viewContainer.id) ?? this.getDefaultViewContainerLocation(viewContainer);
  }
  getDefaultViewContainerLocation(viewContainer) {
    return this.viewContainersRegistry.getViewContainerLocation(viewContainer);
  }
  getDefaultContainerById(viewId) {
    return this.viewsRegistry.getViewContainer(viewId) ?? null;
  }
  getViewContainerModel(container) {
    return this.getOrRegisterViewContainerModel(container);
  }
  getViewContainerById(id) {
    return this.viewContainers.find((vc) => vc.id === id) ?? null;
  }
  getViewContainersByLocation(location) {
    return this.viewContainers.filter((v) => this.getViewContainerLocation(v) === location);
  }
  isViewContainerEnabled(viewContainer) {
    return this.isEnabled(viewContainer.windowEnablement);
  }
  isViewEnabled(view) {
    return this.isEnabled(view.windowEnablement);
  }
  isEnabled(enablement) {
    if (this.isSessionsWindow) {
      return enablement === WindowEnablement.Sessions || enablement === WindowEnablement.Both;
    }
    return !enablement || enablement === WindowEnablement.Editor || enablement === WindowEnablement.Both;
  }
  getDefaultViewContainer(location) {
    const viewContainers = this.viewContainersRegistry.getDefaultViewContainers(location);
    return viewContainers.find((viewContainer) => this.isViewContainerEnabled(viewContainer));
  }
  canMoveViews() {
    return !this.isSessionsWindow;
  }
  moveViewContainerToLocation(viewContainer, location, requestedIndex, reason) {
    if (!this.canMoveViews()) {
      return;
    }
    this.logger.value.trace(`moveViewContainerToLocation: viewContainer:${viewContainer.id} location:${location} reason:${reason}`);
    this.moveViewContainerToLocationWithoutSaving(viewContainer, location, requestedIndex);
    this.saveViewCustomizations();
  }
  getViewContainerBadgeEnablementState(id) {
    return this.viewContainerBadgeEnablementStates.get(id) ?? true;
  }
  setViewContainerBadgeEnablementState(id, badgesEnabled) {
    this.viewContainerBadgeEnablementStates.set(id, badgesEnabled);
    this.saveViewCustomizations();
  }
  moveViewToLocation(view, location, reason) {
    if (!this.canMoveViews()) {
      return;
    }
    this.logger.value.trace(`moveViewToLocation: view:${view.id} location:${location} reason:${reason}`);
    const container = this.registerGeneratedViewContainer(location);
    this.moveViewsToContainer([view], container);
  }
  moveViewsToContainer(views, viewContainer, visibilityState, reason) {
    if (!views.length) {
      return;
    }
    if (!this.canMoveViews()) {
      return;
    }
    this.logger.value.trace(`moveViewsToContainer: views:${views.map((view) => view.id).join(",")} viewContainer:${viewContainer.id} reason:${reason}`);
    const from = this.getViewContainerByViewId(views[0].id);
    const to = viewContainer;
    if (from && to && from !== to) {
      this.moveViewsWithoutSaving(views, from, to, visibilityState);
      this.cleanUpGeneratedViewContainer(from.id);
      this.saveViewCustomizations();
      this.reportMovedViews(views, from, to);
    }
  }
  reset() {
    for (const viewContainer of this.viewContainers) {
      const viewContainerModel = this.getViewContainerModel(viewContainer);
      for (const viewDescriptor of viewContainerModel.allViewDescriptors) {
        const defaultContainer = this.getDefaultContainerById(viewDescriptor.id);
        const currentContainer = this.getViewContainerByViewId(viewDescriptor.id);
        if (currentContainer && defaultContainer && currentContainer !== defaultContainer) {
          this.moveViewsWithoutSaving([viewDescriptor], currentContainer, defaultContainer);
        }
      }
      const defaultContainerLocation = this.getDefaultViewContainerLocation(viewContainer);
      const currentContainerLocation = this.getViewContainerLocation(viewContainer);
      if (defaultContainerLocation !== null && currentContainerLocation !== defaultContainerLocation) {
        this.moveViewContainerToLocationWithoutSaving(viewContainer, defaultContainerLocation);
      }
      this.cleanUpGeneratedViewContainer(viewContainer.id);
    }
    this.viewContainersCustomLocations.clear();
    this.viewDescriptorsCustomLocations.clear();
    this.saveViewCustomizations();
  }
  isViewContainerRemovedPermanently(viewContainerId) {
    return this.isGeneratedContainerId(viewContainerId) && !this.viewContainersCustomLocations.has(viewContainerId);
  }
  onDidChangeDefaultContainer(views, from, to) {
    const viewsToMove = views.filter(
      (view) => !this.viewDescriptorsCustomLocations.has(view.id) || !this.viewContainers.includes(from) && this.viewDescriptorsCustomLocations.get(view.id) === from.id
      // Move views which are moved from a removed container
    );
    if (viewsToMove.length) {
      this.moveViewsWithoutSaving(viewsToMove, from, to);
    }
  }
  reportMovedViews(views, from, to) {
    const containerToString = (container) => {
      if (container.id.startsWith(ViewDescriptorService.COMMON_CONTAINER_ID_PREFIX)) {
        return "custom";
      }
      if (!container.extensionId) {
        return container.id;
      }
      return "extension";
    };
    const oldLocation = this.getViewContainerLocation(from);
    const newLocation = this.getViewContainerLocation(to);
    const viewCount = views.length;
    const fromContainer = containerToString(from);
    const toContainer = containerToString(to);
    const fromLocation = oldLocation === ViewContainerLocation.Panel ? "panel" : "sidebar";
    const toLocation = newLocation === ViewContainerLocation.Panel ? "panel" : "sidebar";
    this.telemetryService.publicLog2("viewDescriptorService.moveViews", { viewCount, fromContainer, toContainer, fromLocation, toLocation });
  }
  moveViewsWithoutSaving(views, from, to, visibilityState = ViewVisibilityState.Expand) {
    this.removeViews(from, views);
    this.addViews(to, views, visibilityState);
    const oldLocation = this.getViewContainerLocation(from);
    const newLocation = this.getViewContainerLocation(to);
    if (oldLocation !== newLocation) {
      this._onDidChangeLocation.fire({ views, from: oldLocation, to: newLocation });
    }
    this._onDidChangeContainer.fire({ views, from, to });
  }
  moveViewContainerToLocationWithoutSaving(viewContainer, location, requestedIndex) {
    const from = this.getViewContainerLocation(viewContainer);
    const to = location;
    if (from !== to) {
      const isGeneratedViewContainer = this.isGeneratedContainerId(viewContainer.id);
      const isDefaultViewContainerLocation = to === this.getDefaultViewContainerLocation(viewContainer);
      if (isGeneratedViewContainer || !isDefaultViewContainerLocation) {
        this.viewContainersCustomLocations.set(viewContainer.id, to);
      } else {
        this.viewContainersCustomLocations.delete(viewContainer.id);
      }
      this.getOrCreateDefaultViewContainerLocationContextKey(viewContainer).set(isGeneratedViewContainer || isDefaultViewContainerLocation);
      viewContainer.requestedIndex = requestedIndex;
      this._onDidChangeContainerLocation.fire({ viewContainer, from, to });
      const views = this.getViewsByContainer(viewContainer);
      this._onDidChangeLocation.fire({ views, from, to });
    }
  }
  cleanUpGeneratedViewContainer(viewContainerId) {
    if (!this.isGeneratedContainerId(viewContainerId)) {
      return;
    }
    const viewContainer = this.getViewContainerById(viewContainerId);
    if (viewContainer && this.getViewContainerModel(viewContainer)?.allViewDescriptors.length) {
      return;
    }
    if ([...this.viewDescriptorsCustomLocations.values()].includes(viewContainerId)) {
      return;
    }
    if (viewContainer) {
      this.viewContainersRegistry.deregisterViewContainer(viewContainer);
    }
    this.viewContainersCustomLocations.delete(viewContainerId);
    this.viewContainerBadgeEnablementStates.delete(viewContainerId);
    this.storageService.remove(getViewsStateStorageId(viewContainer?.storageId || getViewContainerStorageId(viewContainerId)), StorageScope.PROFILE);
  }
  registerGeneratedViewContainer(location, existingId) {
    const id = existingId || this.generateContainerId(location);
    const container = this.viewContainersRegistry.registerViewContainer({
      id,
      ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [id, { mergeViewWithContainerWhenSingleView: true }]),
      title: { value: localize("user", "User View Container"), original: "User View Container" },
      // having a placeholder title - this should not be shown anywhere
      icon: location === ViewContainerLocation.Sidebar ? defaultViewIcon : void 0,
      storageId: getViewContainerStorageId(id),
      hideIfEmpty: true
    }, location, { doNotRegisterOpenCommand: true });
    if (this.viewContainersCustomLocations.get(container.id) !== location) {
      this.viewContainersCustomLocations.set(container.id, location);
    }
    this.getOrCreateDefaultViewContainerLocationContextKey(container).set(true);
    return container;
  }
  onDidStorageChange() {
    if (JSON.stringify(this.viewCustomizations) !== this.getStoredViewCustomizationsValue()) {
      this.onDidViewCustomizationsStorageChange();
    }
  }
  onDidViewCustomizationsStorageChange() {
    this._viewCustomizations = void 0;
    const newViewContainerCustomizations = new Map(Object.entries(this.viewCustomizations.viewContainerLocations));
    const newViewDescriptorCustomizations = new Map(Object.entries(this.viewCustomizations.viewLocations));
    const viewContainersToMove = [];
    const viewsToMove = [];
    for (const [containerId, location] of newViewContainerCustomizations.entries()) {
      const container = this.getViewContainerById(containerId);
      if (container) {
        if (location !== this.getViewContainerLocation(container)) {
          viewContainersToMove.push([container, location]);
        }
      } else if (this.isGeneratedContainerId(containerId)) {
        this.registerGeneratedViewContainer(location, containerId);
      }
    }
    for (const viewContainer of this.viewContainers) {
      if (!newViewContainerCustomizations.has(viewContainer.id)) {
        const currentLocation = this.getViewContainerLocation(viewContainer);
        const defaultLocation = this.getDefaultViewContainerLocation(viewContainer);
        if (currentLocation !== defaultLocation) {
          viewContainersToMove.push([viewContainer, defaultLocation]);
        }
      }
    }
    for (const [viewId, viewContainerId] of newViewDescriptorCustomizations.entries()) {
      const viewDescriptor = this.getViewDescriptorById(viewId);
      if (viewDescriptor) {
        const prevViewContainer = this.getViewContainerByViewId(viewId);
        const newViewContainer = this.getViewContainerById(viewContainerId);
        if (prevViewContainer && newViewContainer && newViewContainer !== prevViewContainer) {
          viewsToMove.push({ views: [viewDescriptor], from: prevViewContainer, to: newViewContainer });
        }
      }
    }
    for (const viewContainer of this.viewContainers) {
      const viewContainerModel = this.getViewContainerModel(viewContainer);
      for (const viewDescriptor of viewContainerModel.allViewDescriptors) {
        if (!newViewDescriptorCustomizations.has(viewDescriptor.id)) {
          const currentContainer = this.getViewContainerByViewId(viewDescriptor.id);
          const defaultContainer = this.getDefaultContainerById(viewDescriptor.id);
          if (currentContainer && defaultContainer && currentContainer !== defaultContainer) {
            viewsToMove.push({ views: [viewDescriptor], from: currentContainer, to: defaultContainer });
          }
        }
      }
    }
    for (const [container, location] of viewContainersToMove) {
      this.moveViewContainerToLocationWithoutSaving(container, location);
    }
    for (const { views, from, to } of viewsToMove) {
      this.moveViewsWithoutSaving(views, from, to, ViewVisibilityState.Default);
    }
    this.viewContainersCustomLocations = newViewContainerCustomizations;
    this.viewDescriptorsCustomLocations = newViewDescriptorCustomizations;
  }
  // Generated Container Id Format
  // {Common Prefix}.{Location}.{Uniqueness Id}
  // Old Format (deprecated)
  // {Common Prefix}.{Uniqueness Id}.{Source View Id}
  generateContainerId(location) {
    return `${ViewDescriptorService.COMMON_CONTAINER_ID_PREFIX}.${ViewContainerLocationToString(location)}.${generateUuid()}`;
  }
  saveViewCustomizations() {
    const viewCustomizations = { viewContainerLocations: {}, viewLocations: {}, viewContainerBadgeEnablementStates: {} };
    for (const [containerId, location] of this.viewContainersCustomLocations) {
      const container = this.getViewContainerById(containerId);
      if (container && !this.isGeneratedContainerId(containerId) && location === this.getDefaultViewContainerLocation(container)) {
        continue;
      }
      viewCustomizations.viewContainerLocations[containerId] = location;
    }
    for (const [viewId, viewContainerId] of this.viewDescriptorsCustomLocations) {
      const viewContainer = this.getViewContainerById(viewContainerId);
      if (viewContainer) {
        const defaultContainer = this.getDefaultContainerById(viewId);
        if (defaultContainer?.id === viewContainer.id) {
          continue;
        }
      }
      viewCustomizations.viewLocations[viewId] = viewContainerId;
    }
    for (const [viewContainerId, badgeEnablementState] of this.viewContainerBadgeEnablementStates) {
      if (badgeEnablementState === false) {
        viewCustomizations.viewContainerBadgeEnablementStates[viewContainerId] = badgeEnablementState;
      }
    }
    this.viewCustomizations = viewCustomizations;
  }
  get viewCustomizations() {
    if (!this._viewCustomizations) {
      this._viewCustomizations = JSON.parse(this.getStoredViewCustomizationsValue());
      this._viewCustomizations.viewContainerLocations = this._viewCustomizations.viewContainerLocations ?? {};
      this._viewCustomizations.viewLocations = this._viewCustomizations.viewLocations ?? {};
      this._viewCustomizations.viewContainerBadgeEnablementStates = this._viewCustomizations.viewContainerBadgeEnablementStates ?? {};
    }
    return this._viewCustomizations;
  }
  set viewCustomizations(viewCustomizations) {
    const value = JSON.stringify(viewCustomizations);
    if (JSON.stringify(this.viewCustomizations) !== value) {
      this._viewCustomizations = viewCustomizations;
      this.setStoredViewCustomizationsValue(value);
    }
  }
  getStoredViewCustomizationsValue() {
    if (this.isSessionsWindow) {
      return "{}";
    }
    return this.storageService.get(ViewDescriptorService.VIEWS_CUSTOMIZATIONS, StorageScope.PROFILE, "{}");
  }
  setStoredViewCustomizationsValue(value) {
    if (this.isSessionsWindow) {
      return;
    }
    this.storageService.store(ViewDescriptorService.VIEWS_CUSTOMIZATIONS, value, StorageScope.PROFILE, StorageTarget.USER);
  }
  getViewsByContainer(viewContainer) {
    const result = this.viewsRegistry.getViews(viewContainer).filter((viewDescriptor) => {
      const viewDescriptorViewContainerId = this.viewDescriptorsCustomLocations.get(viewDescriptor.id) ?? viewContainer.id;
      return viewDescriptorViewContainerId === viewContainer.id;
    });
    for (const [viewId, viewContainerId] of this.viewDescriptorsCustomLocations.entries()) {
      if (viewContainerId !== viewContainer.id) {
        continue;
      }
      if (this.viewsRegistry.getViewContainer(viewId) === viewContainer) {
        continue;
      }
      const viewDescriptor = this.getViewDescriptorById(viewId);
      if (viewDescriptor) {
        result.push(viewDescriptor);
      }
    }
    return result;
  }
  onDidRegisterViewContainer(viewContainer) {
    const defaultLocation = this.isGeneratedContainerId(viewContainer.id) ? true : this.getViewContainerLocation(viewContainer) === this.getDefaultViewContainerLocation(viewContainer);
    this.getOrCreateDefaultViewContainerLocationContextKey(viewContainer).set(defaultLocation);
    this.getOrRegisterViewContainerModel(viewContainer);
  }
  getOrRegisterViewContainerModel(viewContainer) {
    let viewContainerModel = this.viewContainerModels.get(viewContainer)?.viewContainerModel;
    if (!viewContainerModel) {
      const disposables = new DisposableStore();
      viewContainerModel = disposables.add(this.instantiationService.createInstance(ViewContainerModel, viewContainer));
      this.onDidChangeActiveViews({ added: viewContainerModel.activeViewDescriptors, removed: [] });
      viewContainerModel.onDidChangeActiveViewDescriptors((changed) => this.onDidChangeActiveViews(changed), this, disposables);
      this.onDidChangeVisibleViews({ added: [...viewContainerModel.visibleViewDescriptors], removed: [] });
      viewContainerModel.onDidAddVisibleViewDescriptors((added) => this.onDidChangeVisibleViews({ added: added.map(({ viewDescriptor }) => viewDescriptor), removed: [] }), this, disposables);
      viewContainerModel.onDidRemoveVisibleViewDescriptors((removed) => this.onDidChangeVisibleViews({ added: [], removed: removed.map(({ viewDescriptor }) => viewDescriptor) }), this, disposables);
      disposables.add(toDisposable(() => this.viewsVisibilityActionDisposables.deleteAndDispose(viewContainer)));
      disposables.add(this.registerResetViewContainerAction(viewContainer));
      const value = { viewContainerModel, disposables, dispose: () => disposables.dispose() };
      this.viewContainerModels.set(viewContainer, value);
      this.onDidRegisterViews([{ views: this.viewsRegistry.getViews(viewContainer), viewContainer }]);
      const viewsToRegister = this.getViewsByContainer(viewContainer).filter((view) => this.getDefaultContainerById(view.id) !== viewContainer);
      if (viewsToRegister.length) {
        this.addViews(viewContainer, viewsToRegister);
        this.contextKeyService.bufferChangeEvents(() => {
          viewsToRegister.forEach((viewDescriptor) => this.getOrCreateMovableViewContextKey(viewDescriptor).set(!!viewDescriptor.canMoveView));
        });
      }
      if (this.canRegisterViewsVisibilityActions) {
        this.registerViewsVisibilityActions(viewContainer, value);
      }
    }
    return viewContainerModel;
  }
  onDidDeregisterViewContainer(viewContainer) {
    this.viewContainerModels.deleteAndDispose(viewContainer);
    this.viewsVisibilityActionDisposables.deleteAndDispose(viewContainer);
  }
  onDidChangeActiveViews({ added, removed }) {
    this.contextKeyService.bufferChangeEvents(() => {
      added.forEach((viewDescriptor) => this.getOrCreateActiveViewContextKey(viewDescriptor).set(true));
      removed.forEach((viewDescriptor) => this.getOrCreateActiveViewContextKey(viewDescriptor).set(false));
    });
  }
  onDidChangeVisibleViews({ added, removed }) {
    this.contextKeyService.bufferChangeEvents(() => {
      added.forEach((viewDescriptor) => this.getOrCreateVisibleViewContextKey(viewDescriptor).set(true));
      removed.forEach((viewDescriptor) => this.getOrCreateVisibleViewContextKey(viewDescriptor).set(false));
    });
  }
  registerViewsVisibilityActions(viewContainer, { viewContainerModel, disposables }) {
    this.viewsVisibilityActionDisposables.deleteAndDispose(viewContainer);
    this.viewsVisibilityActionDisposables.set(viewContainer, this.registerViewsVisibilityActionsForContainer(viewContainerModel));
    disposables.add(Event.any(
      viewContainerModel.onDidChangeActiveViewDescriptors,
      viewContainerModel.onDidAddVisibleViewDescriptors,
      viewContainerModel.onDidRemoveVisibleViewDescriptors,
      viewContainerModel.onDidMoveVisibleViewDescriptors
    )((e) => {
      this.viewsVisibilityActionDisposables.deleteAndDispose(viewContainer);
      this.viewsVisibilityActionDisposables.set(viewContainer, this.registerViewsVisibilityActionsForContainer(viewContainerModel));
    }));
  }
  registerViewsVisibilityActionsForContainer(viewContainerModel) {
    const disposables = new DisposableStore();
    viewContainerModel.activeViewDescriptors.forEach((viewDescriptor, index) => {
      if (!viewDescriptor.remoteAuthority) {
        disposables.add(registerAction2(class extends ViewPaneContainerAction {
          constructor() {
            super({
              id: `${viewDescriptor.id}.toggleVisibility`,
              viewPaneContainerId: viewContainerModel.viewContainer.id,
              precondition: viewDescriptor.canToggleVisibility && (!viewContainerModel.isVisible(viewDescriptor.id) || viewContainerModel.visibleViewDescriptors.length > 1) ? ContextKeyExpr.true() : ContextKeyExpr.false(),
              toggled: ContextKeyExpr.has(`${viewDescriptor.id}.visible`),
              title: viewDescriptor.name,
              metadata: {
                description: localize2("toggleVisibilityDescription", "Toggles the visibility of the {0} view if the view container it is located in is visible", viewDescriptor.name.value)
              },
              menu: [{
                id: ViewsSubMenu,
                when: ContextKeyExpr.equals("viewContainer", viewContainerModel.viewContainer.id),
                order: index
              }, {
                id: MenuId.ViewContainerTitleContext,
                when: ContextKeyExpr.equals("viewContainer", viewContainerModel.viewContainer.id),
                order: index,
                group: "1_toggleVisibility"
              }, {
                id: MenuId.ViewTitleContext,
                when: ContextKeyExpr.or(...viewContainerModel.visibleViewDescriptors.map((v) => ContextKeyExpr.equals("view", v.id))),
                order: index,
                group: "2_toggleVisibility"
              }]
            });
          }
          async runInViewPaneContainer(serviceAccessor, viewPaneContainer) {
            viewPaneContainer.toggleViewVisibility(viewDescriptor.id);
          }
        }));
        disposables.add(registerAction2(class extends ViewPaneContainerAction {
          constructor() {
            super({
              id: `${viewDescriptor.id}.removeView`,
              viewPaneContainerId: viewContainerModel.viewContainer.id,
              title: localize("hideView", "Hide '{0}'", viewDescriptor.name.value),
              metadata: {
                description: localize2("hideViewDescription", "Hides the {0} view if it is visible and the view container it is located in is visible", viewDescriptor.name.value)
              },
              precondition: viewDescriptor.canToggleVisibility && (!viewContainerModel.isVisible(viewDescriptor.id) || viewContainerModel.visibleViewDescriptors.length > 1) ? ContextKeyExpr.true() : ContextKeyExpr.false(),
              menu: [{
                id: MenuId.ViewTitleContext,
                when: ContextKeyExpr.and(
                  ContextKeyExpr.equals("view", viewDescriptor.id),
                  ContextKeyExpr.has(`${viewDescriptor.id}.visible`)
                ),
                group: "1_hide",
                order: 1
              }]
            });
          }
          async runInViewPaneContainer(serviceAccessor, viewPaneContainer) {
            if (viewPaneContainer.getView(viewDescriptor.id)?.isVisible()) {
              viewPaneContainer.toggleViewVisibility(viewDescriptor.id);
            }
          }
        }));
      }
    });
    return disposables;
  }
  registerResetViewContainerAction(viewContainer) {
    const that = this;
    return registerAction2(class ResetViewLocationAction extends Action2 {
      constructor() {
        super({
          id: `${viewContainer.id}.resetViewContainerLocation`,
          title: localize2("resetViewLocation", "Reset Location"),
          menu: [{
            id: MenuId.ViewContainerTitleContext,
            group: "1_viewActions",
            when: ContextKeyExpr.or(
              ContextKeyExpr.and(
                ContextKeyExpr.equals("viewContainer", viewContainer.id),
                ContextKeyExpr.equals(`${viewContainer.id}.defaultViewContainerLocation`, false)
              )
            )
          }]
        });
      }
      run(accessor) {
        that.moveViewContainerToLocation(viewContainer, that.getDefaultViewContainerLocation(viewContainer), void 0, this.desc.id);
        accessor.get(IViewsService).openViewContainer(viewContainer.id, true);
      }
    });
  }
  addViews(container, views, visibilityState = ViewVisibilityState.Default) {
    this.contextKeyService.bufferChangeEvents(() => {
      views.forEach((view) => {
        const isDefaultContainer = this.getDefaultContainerById(view.id) === container;
        this.getOrCreateDefaultViewLocationContextKey(view).set(isDefaultContainer);
        if (isDefaultContainer) {
          this.viewDescriptorsCustomLocations.delete(view.id);
        } else {
          this.viewDescriptorsCustomLocations.set(view.id, container.id);
        }
      });
    });
    this.getViewContainerModel(container).add(views.map((view) => {
      return {
        viewDescriptor: view,
        collapsed: visibilityState === ViewVisibilityState.Default ? void 0 : false,
        visible: visibilityState === ViewVisibilityState.Default ? void 0 : true
      };
    }));
  }
  removeViews(container, views) {
    this.contextKeyService.bufferChangeEvents(() => {
      views.forEach((view) => {
        if (this.viewDescriptorsCustomLocations.get(view.id) === container.id) {
          this.viewDescriptorsCustomLocations.delete(view.id);
        }
        this.getOrCreateDefaultViewLocationContextKey(view).set(false);
      });
    });
    this.getViewContainerModel(container).remove(views);
  }
  getOrCreateActiveViewContextKey(viewDescriptor) {
    const activeContextKeyId = `${viewDescriptor.id}.active`;
    let contextKey = this.activeViewContextKeys.get(activeContextKeyId);
    if (!contextKey) {
      contextKey = new RawContextKey(activeContextKeyId, false).bindTo(this.contextKeyService);
      this.activeViewContextKeys.set(activeContextKeyId, contextKey);
    }
    return contextKey;
  }
  getOrCreateVisibleViewContextKey(viewDescriptor) {
    const activeContextKeyId = `${viewDescriptor.id}.visible`;
    let contextKey = this.activeViewContextKeys.get(activeContextKeyId);
    if (!contextKey) {
      contextKey = new RawContextKey(activeContextKeyId, false).bindTo(this.contextKeyService);
      this.activeViewContextKeys.set(activeContextKeyId, contextKey);
    }
    return contextKey;
  }
  getOrCreateMovableViewContextKey(viewDescriptor) {
    const movableViewContextKeyId = `${viewDescriptor.id}.canMove`;
    let contextKey = this.movableViewContextKeys.get(movableViewContextKeyId);
    if (!contextKey) {
      contextKey = new RawContextKey(movableViewContextKeyId, false).bindTo(this.contextKeyService);
      this.movableViewContextKeys.set(movableViewContextKeyId, contextKey);
    }
    return contextKey;
  }
  getOrCreateDefaultViewLocationContextKey(viewDescriptor) {
    const defaultViewLocationContextKeyId = `${viewDescriptor.id}.defaultViewLocation`;
    let contextKey = this.defaultViewLocationContextKeys.get(defaultViewLocationContextKeyId);
    if (!contextKey) {
      contextKey = new RawContextKey(defaultViewLocationContextKeyId, false).bindTo(this.contextKeyService);
      this.defaultViewLocationContextKeys.set(defaultViewLocationContextKeyId, contextKey);
    }
    return contextKey;
  }
  getOrCreateDefaultViewContainerLocationContextKey(viewContainer) {
    const defaultViewContainerLocationContextKeyId = `${viewContainer.id}.defaultViewContainerLocation`;
    let contextKey = this.defaultViewContainerLocationContextKeys.get(defaultViewContainerLocationContextKeyId);
    if (!contextKey) {
      contextKey = new RawContextKey(defaultViewContainerLocationContextKeyId, false).bindTo(this.contextKeyService);
      this.defaultViewContainerLocationContextKeys.set(defaultViewContainerLocationContextKeyId, contextKey);
    }
    return contextKey;
  }
};
ViewDescriptorService.VIEWS_CUSTOMIZATIONS = "views.customizations";
ViewDescriptorService.COMMON_CONTAINER_ID_PREFIX = "workbench.views.service";
ViewDescriptorService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IStorageService),
  __decorateParam(3, IExtensionService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, ILoggerService),
  __decorateParam(6, IWorkbenchEnvironmentService)
], ViewDescriptorService);
registerSingleton(IViewDescriptorService, ViewDescriptorService, InstantiationType.Delayed);
export {
  ViewDescriptorService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx2aWV3c1xcYnJvd3Nlclxcdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVmlld0NvbnRhaW5lckxvY2F0aW9uLCBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBWaWV3Q29udGFpbmVyLCBJVmlld3NSZWdpc3RyeSwgSVZpZXdDb250YWluZXJzUmVnaXN0cnksIElWaWV3RGVzY3JpcHRvciwgRXh0ZW5zaW9ucyBhcyBWaWV3RXh0ZW5zaW9ucywgVmlld1Zpc2liaWxpdHlTdGF0ZSwgZGVmYXVsdFZpZXdJY29uLCBWaWV3Q29udGFpbmVyTG9jYXRpb25Ub1N0cmluZywgVklFV1NfTE9HX0lELCBWSUVXU19MT0dfTkFNRSwgV2luZG93RW5hYmxlbWVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgUmF3Q29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyB0b0Rpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVmlld1BhbmVDb250YWluZXIsIFZpZXdQYW5lQ29udGFpbmVyQWN0aW9uLCBWaWV3c1N1Yk1lbnUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lQ29udGFpbmVyLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IGdldFZpZXdzU3RhdGVTdG9yYWdlSWQsIFZpZXdDb250YWluZXJNb2RlbCB9IGZyb20gJy4uL2NvbW1vbi92aWV3Q29udGFpbmVyTW9kZWwuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJBY3Rpb24yLCBBY3Rpb24yLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTG9nZ2VyLCBJTG9nZ2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHdpbmRvd0xvZ0dyb3VwIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2dDb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuXG5pbnRlcmZhY2UgSVZpZXdzQ3VzdG9taXphdGlvbnMge1xuXHR2aWV3Q29udGFpbmVyTG9jYXRpb25zOiBJU3RyaW5nRGljdGlvbmFyeTxWaWV3Q29udGFpbmVyTG9jYXRpb24+O1xuXHR2aWV3TG9jYXRpb25zOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+O1xuXHR2aWV3Q29udGFpbmVyQmFkZ2VFbmFibGVtZW50U3RhdGVzOiBJU3RyaW5nRGljdGlvbmFyeTxib29sZWFuPjtcbn1cblxuZnVuY3Rpb24gZ2V0Vmlld0NvbnRhaW5lclN0b3JhZ2VJZCh2aWV3Q29udGFpbmVySWQ6IHN0cmluZyk6IHN0cmluZyB7IHJldHVybiBgJHt2aWV3Q29udGFpbmVySWR9LnN0YXRlYDsgfVxuXG5leHBvcnQgY2xhc3MgVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElWaWV3RGVzY3JpcHRvclNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFZJRVdTX0NVU1RPTUlaQVRJT05TID0gJ3ZpZXdzLmN1c3RvbWl6YXRpb25zJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQ09NTU9OX0NPTlRBSU5FUl9JRF9QUkVGSVggPSAnd29ya2JlbmNoLnZpZXdzLnNlcnZpY2UnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29udGFpbmVyOiBFbWl0dGVyPHsgdmlld3M6IElWaWV3RGVzY3JpcHRvcltdOyBmcm9tOiBWaWV3Q29udGFpbmVyOyB0bzogVmlld0NvbnRhaW5lciB9PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgdmlld3M6IElWaWV3RGVzY3JpcHRvcltdOyBmcm9tOiBWaWV3Q29udGFpbmVyOyB0bzogVmlld0NvbnRhaW5lciB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb250YWluZXI6IEV2ZW50PHsgdmlld3M6IElWaWV3RGVzY3JpcHRvcltdOyBmcm9tOiBWaWV3Q29udGFpbmVyOyB0bzogVmlld0NvbnRhaW5lciB9PiA9IHRoaXMuX29uRGlkQ2hhbmdlQ29udGFpbmVyLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTG9jYXRpb246IEVtaXR0ZXI8eyB2aWV3czogSVZpZXdEZXNjcmlwdG9yW107IGZyb206IFZpZXdDb250YWluZXJMb2NhdGlvbjsgdG86IFZpZXdDb250YWluZXJMb2NhdGlvbiB9PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgdmlld3M6IElWaWV3RGVzY3JpcHRvcltdOyBmcm9tOiBWaWV3Q29udGFpbmVyTG9jYXRpb247IHRvOiBWaWV3Q29udGFpbmVyTG9jYXRpb24gfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTG9jYXRpb246IEV2ZW50PHsgdmlld3M6IElWaWV3RGVzY3JpcHRvcltdOyBmcm9tOiBWaWV3Q29udGFpbmVyTG9jYXRpb247IHRvOiBWaWV3Q29udGFpbmVyTG9jYXRpb24gfT4gPSB0aGlzLl9vbkRpZENoYW5nZUxvY2F0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29udGFpbmVyTG9jYXRpb246IEVtaXR0ZXI8eyB2aWV3Q29udGFpbmVyOiBWaWV3Q29udGFpbmVyOyBmcm9tOiBWaWV3Q29udGFpbmVyTG9jYXRpb247IHRvOiBWaWV3Q29udGFpbmVyTG9jYXRpb24gfT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHZpZXdDb250YWluZXI6IFZpZXdDb250YWluZXI7IGZyb206IFZpZXdDb250YWluZXJMb2NhdGlvbjsgdG86IFZpZXdDb250YWluZXJMb2NhdGlvbiB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb250YWluZXJMb2NhdGlvbjogRXZlbnQ8eyB2aWV3Q29udGFpbmVyOiBWaWV3Q29udGFpbmVyOyBmcm9tOiBWaWV3Q29udGFpbmVyTG9jYXRpb247IHRvOiBWaWV3Q29udGFpbmVyTG9jYXRpb24gfT4gPSB0aGlzLl9vbkRpZENoYW5nZUNvbnRhaW5lckxvY2F0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdmlld0NvbnRhaW5lck1vZGVscyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPFZpZXdDb250YWluZXIsIHsgdmlld0NvbnRhaW5lck1vZGVsOiBWaWV3Q29udGFpbmVyTW9kZWw7IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUgfSAmIElEaXNwb3NhYmxlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSB2aWV3c1Zpc2liaWxpdHlBY3Rpb25EaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPFZpZXdDb250YWluZXIsIElEaXNwb3NhYmxlPigpKTtcblx0cHJpdmF0ZSBjYW5SZWdpc3RlclZpZXdzVmlzaWJpbGl0eUFjdGlvbnM6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBhY3RpdmVWaWV3Q29udGV4dEtleXM6IE1hcDxzdHJpbmcsIElDb250ZXh0S2V5PGJvb2xlYW4+Pjtcblx0cHJpdmF0ZSByZWFkb25seSBtb3ZhYmxlVmlld0NvbnRleHRLZXlzOiBNYXA8c3RyaW5nLCBJQ29udGV4dEtleTxib29sZWFuPj47XG5cdHByaXZhdGUgcmVhZG9ubHkgZGVmYXVsdFZpZXdMb2NhdGlvbkNvbnRleHRLZXlzOiBNYXA8c3RyaW5nLCBJQ29udGV4dEtleTxib29sZWFuPj47XG5cdHByaXZhdGUgcmVhZG9ubHkgZGVmYXVsdFZpZXdDb250YWluZXJMb2NhdGlvbkNvbnRleHRLZXlzOiBNYXA8c3RyaW5nLCBJQ29udGV4dEtleTxib29sZWFuPj47XG5cblx0cHJpdmF0ZSByZWFkb25seSB2aWV3c1JlZ2lzdHJ5OiBJVmlld3NSZWdpc3RyeTtcblx0cHJpdmF0ZSByZWFkb25seSB2aWV3Q29udGFpbmVyc1JlZ2lzdHJ5OiBJVmlld0NvbnRhaW5lcnNSZWdpc3RyeTtcblxuXHRwcml2YXRlIHZpZXdDb250YWluZXJzQ3VzdG9tTG9jYXRpb25zOiBNYXA8c3RyaW5nLCBWaWV3Q29udGFpbmVyTG9jYXRpb24+O1xuXHRwcml2YXRlIHZpZXdEZXNjcmlwdG9yc0N1c3RvbUxvY2F0aW9uczogTWFwPHN0cmluZywgc3RyaW5nPjtcblx0cHJpdmF0ZSB2aWV3Q29udGFpbmVyQmFkZ2VFbmFibGVtZW50U3RhdGVzOiBNYXA8c3RyaW5nLCBib29sZWFuPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVZpZXdDb250YWluZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBhZGRlZDogUmVhZG9ubHlBcnJheTx7IGNvbnRhaW5lcjogVmlld0NvbnRhaW5lcjsgbG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbiB9PjsgcmVtb3ZlZDogUmVhZG9ubHlBcnJheTx7IGNvbnRhaW5lcjogVmlld0NvbnRhaW5lcjsgbG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbiB9PiB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWaWV3Q29udGFpbmVycyA9IHRoaXMuX29uRGlkQ2hhbmdlVmlld0NvbnRhaW5lcnMuZXZlbnQ7XG5cdGdldCB2aWV3Q29udGFpbmVycygpOiBSZWFkb25seUFycmF5PFZpZXdDb250YWluZXI+IHsgcmV0dXJuIHRoaXMudmlld0NvbnRhaW5lcnNSZWdpc3RyeS5hbGwuZmlsdGVyKHZjID0+IHRoaXMuaXNWaWV3Q29udGFpbmVyRW5hYmxlZCh2YykpOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBsb2dnZXI6IExhenk8SUxvZ2dlcj47XG5cdHByaXZhdGUgcmVhZG9ubHkgaXNTZXNzaW9uc1dpbmRvdzogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUxvZ2dlclNlcnZpY2UgbG9nZ2VyU2VydmljZTogSUxvZ2dlclNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5sb2dnZXIgPSBuZXcgTGF6eSgoKSA9PiBsb2dnZXJTZXJ2aWNlLmNyZWF0ZUxvZ2dlcihWSUVXU19MT0dfSUQsIHsgbmFtZTogVklFV1NfTE9HX05BTUUsIGdyb3VwOiB3aW5kb3dMb2dHcm91cCB9KSk7XG5cdFx0dGhpcy5pc1Nlc3Npb25zV2luZG93ID0gZW52aXJvbm1lbnRTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3c7XG5cblx0XHR0aGlzLmFjdGl2ZVZpZXdDb250ZXh0S2V5cyA9IG5ldyBNYXA8c3RyaW5nLCBJQ29udGV4dEtleTxib29sZWFuPj4oKTtcblx0XHR0aGlzLm1vdmFibGVWaWV3Q29udGV4dEtleXMgPSBuZXcgTWFwPHN0cmluZywgSUNvbnRleHRLZXk8Ym9vbGVhbj4+KCk7XG5cdFx0dGhpcy5kZWZhdWx0Vmlld0xvY2F0aW9uQ29udGV4dEtleXMgPSBuZXcgTWFwPHN0cmluZywgSUNvbnRleHRLZXk8Ym9vbGVhbj4+KCk7XG5cdFx0dGhpcy5kZWZhdWx0Vmlld0NvbnRhaW5lckxvY2F0aW9uQ29udGV4dEtleXMgPSBuZXcgTWFwPHN0cmluZywgSUNvbnRleHRLZXk8Ym9vbGVhbj4+KCk7XG5cblx0XHR0aGlzLnZpZXdDb250YWluZXJzUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJVmlld0NvbnRhaW5lcnNSZWdpc3RyeT4oVmlld0V4dGVuc2lvbnMuVmlld0NvbnRhaW5lcnNSZWdpc3RyeSk7XG5cdFx0dGhpcy52aWV3c1JlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SVZpZXdzUmVnaXN0cnk+KFZpZXdFeHRlbnNpb25zLlZpZXdzUmVnaXN0cnkpO1xuXG5cdFx0dGhpcy5taWdyYXRlVG9WaWV3c0N1c3RvbWl6YXRpb25zU3RvcmFnZSgpO1xuXHRcdHRoaXMudmlld0NvbnRhaW5lcnNDdXN0b21Mb2NhdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgVmlld0NvbnRhaW5lckxvY2F0aW9uPihPYmplY3QuZW50cmllcyh0aGlzLnZpZXdDdXN0b21pemF0aW9ucy52aWV3Q29udGFpbmVyTG9jYXRpb25zKSk7XG5cdFx0dGhpcy52aWV3RGVzY3JpcHRvcnNDdXN0b21Mb2NhdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPihPYmplY3QuZW50cmllcyh0aGlzLnZpZXdDdXN0b21pemF0aW9ucy52aWV3TG9jYXRpb25zKSk7XG5cdFx0dGhpcy52aWV3Q29udGFpbmVyQmFkZ2VFbmFibGVtZW50U3RhdGVzID0gbmV3IE1hcDxzdHJpbmcsIGJvb2xlYW4+KE9iamVjdC5lbnRyaWVzKHRoaXMudmlld0N1c3RvbWl6YXRpb25zLnZpZXdDb250YWluZXJCYWRnZUVuYWJsZW1lbnRTdGF0ZXMpKTtcblxuXHRcdC8vIFJlZ2lzdGVyIGFsbCBjb250YWluZXJzIHRoYXQgd2VyZSByZWdpc3RlcmVkIGJlZm9yZSB0aGlzIGN0b3Jcblx0XHR0aGlzLnZpZXdDb250YWluZXJzLmZvckVhY2godmlld0NvbnRhaW5lciA9PiB0aGlzLm9uRGlkUmVnaXN0ZXJWaWV3Q29udGFpbmVyKHZpZXdDb250YWluZXIpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudmlld3NSZWdpc3RyeS5vblZpZXdzUmVnaXN0ZXJlZCh2aWV3cyA9PiB0aGlzLm9uRGlkUmVnaXN0ZXJWaWV3cyh2aWV3cykpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnZpZXdzUmVnaXN0cnkub25WaWV3c0RlcmVnaXN0ZXJlZCgoeyB2aWV3cywgdmlld0NvbnRhaW5lciB9KSA9PiB0aGlzLm9uRGlkRGVyZWdpc3RlclZpZXdzKHZpZXdzLCB2aWV3Q29udGFpbmVyKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy52aWV3c1JlZ2lzdHJ5Lm9uRGlkQ2hhbmdlQ29udGFpbmVyKCh7IHZpZXdzLCBmcm9tLCB0byB9KSA9PiB0aGlzLm9uRGlkQ2hhbmdlRGVmYXVsdENvbnRhaW5lcih2aWV3cywgZnJvbSwgdG8pKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnZpZXdDb250YWluZXJzUmVnaXN0cnkub25EaWRSZWdpc3RlcigoeyB2aWV3Q29udGFpbmVyIH0pID0+IHtcblx0XHRcdGlmICghdGhpcy5pc1ZpZXdDb250YWluZXJFbmFibGVkKHZpZXdDb250YWluZXIpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMub25EaWRSZWdpc3RlclZpZXdDb250YWluZXIodmlld0NvbnRhaW5lcik7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVZpZXdDb250YWluZXJzLmZpcmUoeyBhZGRlZDogW3sgY29udGFpbmVyOiB2aWV3Q29udGFpbmVyLCBsb2NhdGlvbjogdGhpcy5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24odmlld0NvbnRhaW5lcikgfV0sIHJlbW92ZWQ6IFtdIH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudmlld0NvbnRhaW5lcnNSZWdpc3RyeS5vbkRpZERlcmVnaXN0ZXIoKHsgdmlld0NvbnRhaW5lciwgdmlld0NvbnRhaW5lckxvY2F0aW9uIH0pID0+IHtcblx0XHRcdGlmICghdGhpcy5pc1ZpZXdDb250YWluZXJFbmFibGVkKHZpZXdDb250YWluZXIpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMub25EaWREZXJlZ2lzdGVyVmlld0NvbnRhaW5lcih2aWV3Q29udGFpbmVyKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlld0NvbnRhaW5lcnMuZmlyZSh7IHJlbW92ZWQ6IFt7IGNvbnRhaW5lcjogdmlld0NvbnRhaW5lciwgbG9jYXRpb246IHZpZXdDb250YWluZXJMb2NhdGlvbiB9XSwgYWRkZWQ6IFtdIH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuUFJPRklMRSwgVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLlZJRVdTX0NVU1RPTUlaQVRJT05TLCB0aGlzLl9zdG9yZSkoKCkgPT4gdGhpcy5vbkRpZFN0b3JhZ2VDaGFuZ2UoKSkpO1xuXG5cdFx0dGhpcy5leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpLnRoZW4oKCkgPT4gdGhpcy53aGVuRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKSk7XG5cblx0fVxuXG5cdHByaXZhdGUgbWlncmF0ZVRvVmlld3NDdXN0b21pemF0aW9uc1N0b3JhZ2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFZpZXdEZXNjcmlwdG9yU2VydmljZS5WSUVXU19DVVNUT01JWkFUSU9OUywgU3RvcmFnZVNjb3BlLlBST0ZJTEUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgdmlld0NvbnRhaW5lckxvY2F0aW9uc1ZhbHVlID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoJ3ZpZXdzLmNhY2hlZFZpZXdDb250YWluZXJMb2NhdGlvbnMnLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3JMb2NhdGlvbnNWYWx1ZSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KCd2aWV3cy5jYWNoZWRWaWV3UG9zaXRpb25zJywgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdGlmICghdmlld0NvbnRhaW5lckxvY2F0aW9uc1ZhbHVlICYmICF2aWV3RGVzY3JpcHRvckxvY2F0aW9uc1ZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgdmlld0NvbnRhaW5lckxvY2F0aW9uczogW3N0cmluZywgVmlld0NvbnRhaW5lckxvY2F0aW9uXVtdID0gdmlld0NvbnRhaW5lckxvY2F0aW9uc1ZhbHVlID8gSlNPTi5wYXJzZSh2aWV3Q29udGFpbmVyTG9jYXRpb25zVmFsdWUpIDogW107XG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3JMb2NhdGlvbnM6IFtzdHJpbmcsIHsgY29udGFpbmVySWQ6IHN0cmluZyB9XVtdID0gdmlld0Rlc2NyaXB0b3JMb2NhdGlvbnNWYWx1ZSA/IEpTT04ucGFyc2Uodmlld0Rlc2NyaXB0b3JMb2NhdGlvbnNWYWx1ZSkgOiBbXTtcblx0XHRjb25zdCB2aWV3c0N1c3RvbWl6YXRpb25zOiBJVmlld3NDdXN0b21pemF0aW9ucyA9IHtcblx0XHRcdHZpZXdDb250YWluZXJMb2NhdGlvbnM6IHZpZXdDb250YWluZXJMb2NhdGlvbnMucmVkdWNlPElTdHJpbmdEaWN0aW9uYXJ5PFZpZXdDb250YWluZXJMb2NhdGlvbj4+KChyZXN1bHQsIFtpZCwgbG9jYXRpb25dKSA9PiB7IHJlc3VsdFtpZF0gPSBsb2NhdGlvbjsgcmV0dXJuIHJlc3VsdDsgfSwge30pLFxuXHRcdFx0dmlld0xvY2F0aW9uczogdmlld0Rlc2NyaXB0b3JMb2NhdGlvbnMucmVkdWNlPElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz4+KChyZXN1bHQsIFtpZCwgeyBjb250YWluZXJJZCB9XSkgPT4geyByZXN1bHRbaWRdID0gY29udGFpbmVySWQ7IHJldHVybiByZXN1bHQ7IH0sIHt9KSxcblx0XHRcdHZpZXdDb250YWluZXJCYWRnZUVuYWJsZW1lbnRTdGF0ZXM6IHt9XG5cdFx0fTtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFZpZXdEZXNjcmlwdG9yU2VydmljZS5WSUVXU19DVVNUT01JWkFUSU9OUywgSlNPTi5zdHJpbmdpZnkodmlld3NDdXN0b21pemF0aW9ucyksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKCd2aWV3cy5jYWNoZWRWaWV3Q29udGFpbmVyTG9jYXRpb25zJywgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKCd2aWV3cy5jYWNoZWRWaWV3UG9zaXRpb25zJywgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckdyb3VwZWRWaWV3cyhncm91cGVkVmlld3M6IE1hcDxzdHJpbmcsIElWaWV3RGVzY3JpcHRvcltdPik6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgW2NvbnRhaW5lcklkLCB2aWV3c10gb2YgZ3JvdXBlZFZpZXdzLmVudHJpZXMoKSkge1xuXHRcdFx0Y29uc3Qgdmlld0NvbnRhaW5lciA9IHRoaXMuZ2V0Vmlld0NvbnRhaW5lckJ5SWQoY29udGFpbmVySWQpO1xuXG5cdFx0XHQvLyBUaGUgY29udGFpbmVyIGhhcyBub3QgYmVlbiByZWdpc3RlcmVkIHlldFxuXHRcdFx0aWYgKCF2aWV3Q29udGFpbmVyIHx8ICF0aGlzLnZpZXdDb250YWluZXJNb2RlbHMuaGFzKHZpZXdDb250YWluZXIpKSB7XG5cdFx0XHRcdC8vIFJlZ2lzdGVyIGlmIHRoZSBjb250YWluZXIgaXMgYSBnZW5hcmF0ZWQgY29udGFpbmVyXG5cdFx0XHRcdGlmICh0aGlzLmlzR2VuZXJhdGVkQ29udGFpbmVySWQoY29udGFpbmVySWQpKSB7XG5cdFx0XHRcdFx0Y29uc3Qgdmlld0NvbnRhaW5lckxvY2F0aW9uID0gdGhpcy52aWV3Q29udGFpbmVyc0N1c3RvbUxvY2F0aW9ucy5nZXQoY29udGFpbmVySWQpO1xuXHRcdFx0XHRcdGlmICh2aWV3Q29udGFpbmVyTG9jYXRpb24gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5yZWdpc3RlckdlbmVyYXRlZFZpZXdDb250YWluZXIodmlld0NvbnRhaW5lckxvY2F0aW9uLCBjb250YWluZXJJZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFJlZ2lzdHJhdGlvbiBvZiB0aGUgY29udGFpbmVyIGhhbmRsZXMgcmVnaXN0cmF0aW9uIG9mIGl0cyB2aWV3c1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRmlsdGVyIG91dCB2aWV3cyB0aGF0IGhhdmUgYWxyZWFkeSBiZWVuIGFkZGVkIHRvIHRoZSB2aWV3IGNvbnRhaW5lciBtb2RlbFxuXHRcdFx0Ly8gVGhpcyBpcyBuZWVkZWQgd2hlbiBzdGF0aWNhbGx5LXJlZ2lzdGVyZWQgdmlld3MgYXJlIG1vdmVkIHRvXG5cdFx0XHQvLyBvdGhlciBzdGF0aWNhbGx5IHJlZ2lzdGVyZWQgY29udGFpbmVycyBhcyB0aGV5IHdpbGwgYm90aCB0cnkgdG8gYWRkIG9uIHN0YXJ0dXBcblx0XHRcdGNvbnN0IHZpZXdzVG9BZGQgPSB2aWV3cy5maWx0ZXIodmlldyA9PiB0aGlzLmdldFZpZXdDb250YWluZXJNb2RlbCh2aWV3Q29udGFpbmVyKS5hbGxWaWV3RGVzY3JpcHRvcnMuZmlsdGVyKHZkID0+IHZkLmlkID09PSB2aWV3LmlkKS5sZW5ndGggPT09IDApO1xuXHRcdFx0dGhpcy5hZGRWaWV3cyh2aWV3Q29udGFpbmVyLCB2aWV3c1RvQWRkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRlcmVnaXN0ZXJHcm91cGVkVmlld3MoZ3JvdXBlZFZpZXdzOiBNYXA8c3RyaW5nLCBJVmlld0Rlc2NyaXB0b3JbXT4pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFt2aWV3Q29udGFpbmVySWQsIHZpZXdzXSBvZiBncm91cGVkVmlld3MuZW50cmllcygpKSB7XG5cdFx0XHRjb25zdCB2aWV3Q29udGFpbmVyID0gdGhpcy5nZXRWaWV3Q29udGFpbmVyQnlJZCh2aWV3Q29udGFpbmVySWQpO1xuXG5cdFx0XHQvLyBUaGUgY29udGFpbmVyIGhhcyBub3QgYmVlbiByZWdpc3RlcmVkIHlldFxuXHRcdFx0aWYgKCF2aWV3Q29udGFpbmVyIHx8ICF0aGlzLnZpZXdDb250YWluZXJNb2RlbHMuaGFzKHZpZXdDb250YWluZXIpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnJlbW92ZVZpZXdzKHZpZXdDb250YWluZXIsIHZpZXdzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG1vdmVPcnBoYW5WaWV3c1RvRGVmYXVsdExvY2F0aW9uKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgW3ZpZXdJZCwgY29udGFpbmVySWRdIG9mIHRoaXMudmlld0Rlc2NyaXB0b3JzQ3VzdG9tTG9jYXRpb25zLmVudHJpZXMoKSkge1xuXHRcdFx0Ly8gY2hlY2sgaWYgdGhlIHZpZXcgY29udGFpbmVyIGV4aXN0c1xuXHRcdFx0aWYgKHRoaXMuZ2V0Vmlld0NvbnRhaW5lckJ5SWQoY29udGFpbmVySWQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBjaGVjayBpZiB2aWV3IGhhcyBiZWVuIHJlZ2lzdGVyZWQgdG8gZGVmYXVsdCBsb2NhdGlvblxuXHRcdFx0Y29uc3Qgdmlld0NvbnRhaW5lciA9IHRoaXMudmlld3NSZWdpc3RyeS5nZXRWaWV3Q29udGFpbmVyKHZpZXdJZCk7XG5cdFx0XHRjb25zdCB2aWV3RGVzY3JpcHRvciA9IHRoaXMuZ2V0Vmlld0Rlc2NyaXB0b3JCeUlkKHZpZXdJZCk7XG5cdFx0XHRpZiAodmlld0NvbnRhaW5lciAmJiB2aWV3RGVzY3JpcHRvcikge1xuXHRcdFx0XHR0aGlzLmFkZFZpZXdzKHZpZXdDb250YWluZXIsIFt2aWV3RGVzY3JpcHRvcl0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHdoZW5FeHRlbnNpb25zUmVnaXN0ZXJlZCgpOiB2b2lkIHtcblxuXHRcdC8vIEhhbmRsZSB0aG9zZSB2aWV3cyB3aG9zZSBjdXN0b20gcGFyZW50IHZpZXcgY29udGFpbmVyIGRvZXMgbm90IGV4aXN0IGFueW1vcmVcblx0XHQvLyBNYXkgYmUgdGhlIGV4dGVuc2lvbiBjb250cmlidXRpbmcgdGhpcyB2aWV3IGNvbnRhaW5lciBpcyBubyBsb25nZXIgaW5zdGFsbGVkXG5cdFx0Ly8gT3IgdGhlIHBhcmVudCB2aWV3IGNvbnRhaW5lciBpcyBnZW5lcmF0ZWQgYW5kIG5vIGxvbmdlciBhdmFpbGFibGUuXG5cdFx0dGhpcy5tb3ZlT3JwaGFuVmlld3NUb0RlZmF1bHRMb2NhdGlvbigpO1xuXG5cdFx0Ly8gQ2xlYW4gdXAgZW1wdHkgZ2VuZXJhdGVkIHZpZXcgY29udGFpbmVyc1xuXHRcdGZvciAoY29uc3Qgdmlld0NvbnRhaW5lcklkIG9mIFsuLi50aGlzLnZpZXdDb250YWluZXJzQ3VzdG9tTG9jYXRpb25zLmtleXMoKV0pIHtcblx0XHRcdHRoaXMuY2xlYW5VcEdlbmVyYXRlZFZpZXdDb250YWluZXIodmlld0NvbnRhaW5lcklkKTtcblx0XHR9XG5cblx0XHQvLyBTYXZlIHVwZGF0ZWQgdmlldyBjdXN0b21pemF0aW9ucyBhZnRlciBjbGVhbnVwXG5cdFx0dGhpcy5zYXZlVmlld0N1c3RvbWl6YXRpb25zKCk7XG5cblx0XHQvLyBSZWdpc3RlciB2aXNpYmlsaXR5IGFjdGlvbnMgZm9yIGFsbCB2aWV3c1xuXHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIHRoaXMudmlld0NvbnRhaW5lck1vZGVscykge1xuXHRcdFx0dGhpcy5yZWdpc3RlclZpZXdzVmlzaWJpbGl0eUFjdGlvbnMoa2V5LCB2YWx1ZSk7XG5cdFx0fVxuXHRcdHRoaXMuY2FuUmVnaXN0ZXJWaWV3c1Zpc2liaWxpdHlBY3Rpb25zID0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRSZWdpc3RlclZpZXdzKHZpZXdzOiB7IHZpZXdzOiBJVmlld0Rlc2NyaXB0b3JbXTsgdmlld0NvbnRhaW5lcjogVmlld0NvbnRhaW5lciB9W10pOiB2b2lkIHtcblx0XHR0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmJ1ZmZlckNoYW5nZUV2ZW50cygoKSA9PiB7XG5cdFx0XHR2aWV3cy5mb3JFYWNoKCh7IHZpZXdzLCB2aWV3Q29udGFpbmVyIH0pID0+IHtcblx0XHRcdFx0Ly8gV2hlbiB2aWV3cyBhcmUgcmVnaXN0ZXJlZCwgd2UgbmVlZCB0byByZWdyb3VwIHRoZW0gYmFzZWQgb24gdGhlIGN1c3RvbWl6YXRpb25zXG5cdFx0XHRcdGNvbnN0IHJlZ3JvdXBlZFZpZXdzID0gdGhpcy5yZWdyb3VwVmlld3Modmlld0NvbnRhaW5lci5pZCwgdmlld3MpO1xuXG5cdFx0XHRcdC8vIE9uY2UgdGhleSBhcmUgZ3JvdXBlZCwgdHJ5IHJlZ2lzdGVyaW5nIHRoZW0gd2hpY2ggb2NjdXJzXG5cdFx0XHRcdC8vIGlmIHRoZSBjb250YWluZXIgaGFzIGFscmVhZHkgYmVlbiByZWdpc3RlcmVkIHdpdGhpbiB0aGlzIHNlcnZpY2Vcblx0XHRcdFx0Ly8gb3Igd2UgY2FuIGdlbmVyYXRlIHRoZSBjb250YWluZXIgZnJvbSB0aGUgc291cmNlIHZpZXcgaWRcblx0XHRcdFx0dGhpcy5yZWdpc3Rlckdyb3VwZWRWaWV3cyhyZWdyb3VwZWRWaWV3cyk7XG5cblx0XHRcdFx0dmlld3MuZm9yRWFjaCh2aWV3RGVzY3JpcHRvciA9PiB0aGlzLmdldE9yQ3JlYXRlTW92YWJsZVZpZXdDb250ZXh0S2V5KHZpZXdEZXNjcmlwdG9yKS5zZXQoISF2aWV3RGVzY3JpcHRvci5jYW5Nb3ZlVmlldykpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGlzR2VuZXJhdGVkQ29udGFpbmVySWQoaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpZC5zdGFydHNXaXRoKFZpZXdEZXNjcmlwdG9yU2VydmljZS5DT01NT05fQ09OVEFJTkVSX0lEX1BSRUZJWCk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkRGVyZWdpc3RlclZpZXdzKHZpZXdzOiBJVmlld0Rlc2NyaXB0b3JbXSwgdmlld0NvbnRhaW5lcjogVmlld0NvbnRhaW5lcik6IHZvaWQge1xuXHRcdC8vIFdoZW4gdmlld3MgYXJlIHJlZ2lzdGVyZWQsIHdlIG5lZWQgdG8gcmVncm91cCB0aGVtIGJhc2VkIG9uIHRoZSBjdXN0b21pemF0aW9uc1xuXHRcdGNvbnN0IHJlZ3JvdXBlZFZpZXdzID0gdGhpcy5yZWdyb3VwVmlld3Modmlld0NvbnRhaW5lci5pZCwgdmlld3MpO1xuXHRcdHRoaXMuZGVyZWdpc3Rlckdyb3VwZWRWaWV3cyhyZWdyb3VwZWRWaWV3cyk7XG5cdFx0dGhpcy5jb250ZXh0S2V5U2VydmljZS5idWZmZXJDaGFuZ2VFdmVudHMoKCkgPT4ge1xuXHRcdFx0dmlld3MuZm9yRWFjaCh2aWV3RGVzY3JpcHRvciA9PiB0aGlzLmdldE9yQ3JlYXRlTW92YWJsZVZpZXdDb250ZXh0S2V5KHZpZXdEZXNjcmlwdG9yKS5zZXQoZmFsc2UpKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVncm91cFZpZXdzKGNvbnRhaW5lcklkOiBzdHJpbmcsIHZpZXdzOiBJVmlld0Rlc2NyaXB0b3JbXSk6IE1hcDxzdHJpbmcsIElWaWV3RGVzY3JpcHRvcltdPiB7XG5cdFx0Y29uc3Qgdmlld3NCeUNvbnRhaW5lciA9IG5ldyBNYXA8c3RyaW5nLCBJVmlld0Rlc2NyaXB0b3JbXT4oKTtcblxuXHRcdGZvciAoY29uc3Qgdmlld0Rlc2NyaXB0b3Igb2Ygdmlld3MpIHtcblx0XHRcdGNvbnN0IGNvcnJlY3RDb250YWluZXJJZCA9IHRoaXMudmlld0Rlc2NyaXB0b3JzQ3VzdG9tTG9jYXRpb25zLmdldCh2aWV3RGVzY3JpcHRvci5pZCkgPz8gY29udGFpbmVySWQ7XG5cdFx0XHRsZXQgY29udGFpbmVyVmlld3MgPSB2aWV3c0J5Q29udGFpbmVyLmdldChjb3JyZWN0Q29udGFpbmVySWQpO1xuXHRcdFx0aWYgKCFjb250YWluZXJWaWV3cykge1xuXHRcdFx0XHR2aWV3c0J5Q29udGFpbmVyLnNldChjb3JyZWN0Q29udGFpbmVySWQsIGNvbnRhaW5lclZpZXdzID0gW10pO1xuXHRcdFx0fVxuXHRcdFx0Y29udGFpbmVyVmlld3MucHVzaCh2aWV3RGVzY3JpcHRvcik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHZpZXdzQnlDb250YWluZXI7XG5cdH1cblxuXHRnZXRWaWV3RGVzY3JpcHRvckJ5SWQodmlld0lkOiBzdHJpbmcpOiBJVmlld0Rlc2NyaXB0b3IgfCBudWxsIHtcblx0XHRjb25zdCB2aWV3ID0gdGhpcy52aWV3c1JlZ2lzdHJ5LmdldFZpZXcodmlld0lkKTtcblx0XHRpZiAodmlldyAmJiAhdGhpcy5pc1ZpZXdFbmFibGVkKHZpZXcpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIHZpZXc7XG5cdH1cblxuXHRnZXRWaWV3TG9jYXRpb25CeUlkKHZpZXdJZDogc3RyaW5nKTogVmlld0NvbnRhaW5lckxvY2F0aW9uIHwgbnVsbCB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy5nZXRWaWV3Q29udGFpbmVyQnlWaWV3SWQodmlld0lkKTtcblx0XHRpZiAoY29udGFpbmVyID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24oY29udGFpbmVyKTtcblx0fVxuXG5cdGdldFZpZXdDb250YWluZXJCeVZpZXdJZCh2aWV3SWQ6IHN0cmluZyk6IFZpZXdDb250YWluZXIgfCBudWxsIHtcblx0XHQvLyBDaGVjayBpZiB0aGUgdmlldyBpdHNlbGYgc2hvdWxkIGJlIHZpc2libGUgaW4gY3VycmVudCB3b3Jrc3BhY2Vcblx0XHRjb25zdCB2aWV3ID0gdGhpcy52aWV3c1JlZ2lzdHJ5LmdldFZpZXcodmlld0lkKTtcblx0XHRpZiAodmlldyAmJiAhdGhpcy5pc1ZpZXdFbmFibGVkKHZpZXcpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBjb250YWluZXJJZCA9IHRoaXMudmlld0Rlc2NyaXB0b3JzQ3VzdG9tTG9jYXRpb25zLmdldCh2aWV3SWQpO1xuXG5cdFx0cmV0dXJuIGNvbnRhaW5lcklkID9cblx0XHRcdHRoaXMuZ2V0Vmlld0NvbnRhaW5lckJ5SWQoY29udGFpbmVySWQpIDpcblx0XHRcdHRoaXMuZ2V0RGVmYXVsdENvbnRhaW5lckJ5SWQodmlld0lkKTtcblx0fVxuXG5cdGdldFZpZXdDb250YWluZXJMb2NhdGlvbih2aWV3Q29udGFpbmVyOiBWaWV3Q29udGFpbmVyKTogVmlld0NvbnRhaW5lckxvY2F0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3Q29udGFpbmVyc0N1c3RvbUxvY2F0aW9ucy5nZXQodmlld0NvbnRhaW5lci5pZCkgPz8gdGhpcy5nZXREZWZhdWx0Vmlld0NvbnRhaW5lckxvY2F0aW9uKHZpZXdDb250YWluZXIpO1xuXHR9XG5cblx0Z2V0RGVmYXVsdFZpZXdDb250YWluZXJMb2NhdGlvbih2aWV3Q29udGFpbmVyOiBWaWV3Q29udGFpbmVyKTogVmlld0NvbnRhaW5lckxvY2F0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3Q29udGFpbmVyc1JlZ2lzdHJ5LmdldFZpZXdDb250YWluZXJMb2NhdGlvbih2aWV3Q29udGFpbmVyKTtcblx0fVxuXG5cdGdldERlZmF1bHRDb250YWluZXJCeUlkKHZpZXdJZDogc3RyaW5nKTogVmlld0NvbnRhaW5lciB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLnZpZXdzUmVnaXN0cnkuZ2V0Vmlld0NvbnRhaW5lcih2aWV3SWQpID8/IG51bGw7XG5cdH1cblxuXHRnZXRWaWV3Q29udGFpbmVyTW9kZWwoY29udGFpbmVyOiBWaWV3Q29udGFpbmVyKTogVmlld0NvbnRhaW5lck1vZGVsIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRPclJlZ2lzdGVyVmlld0NvbnRhaW5lck1vZGVsKGNvbnRhaW5lcik7XG5cdH1cblxuXHRnZXRWaWV3Q29udGFpbmVyQnlJZChpZDogc3RyaW5nKTogVmlld0NvbnRhaW5lciB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLnZpZXdDb250YWluZXJzLmZpbmQodmMgPT4gdmMuaWQgPT09IGlkKSA/PyBudWxsO1xuXHR9XG5cblx0Z2V0Vmlld0NvbnRhaW5lcnNCeUxvY2F0aW9uKGxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24pOiBWaWV3Q29udGFpbmVyW10ge1xuXHRcdHJldHVybiB0aGlzLnZpZXdDb250YWluZXJzLmZpbHRlcih2ID0+IHRoaXMuZ2V0Vmlld0NvbnRhaW5lckxvY2F0aW9uKHYpID09PSBsb2NhdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIGlzVmlld0NvbnRhaW5lckVuYWJsZWQodmlld0NvbnRhaW5lcjogVmlld0NvbnRhaW5lcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmlzRW5hYmxlZCh2aWV3Q29udGFpbmVyLndpbmRvd0VuYWJsZW1lbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1ZpZXdFbmFibGVkKHZpZXc6IElWaWV3RGVzY3JpcHRvcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmlzRW5hYmxlZCh2aWV3LndpbmRvd0VuYWJsZW1lbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0VuYWJsZWQoZW5hYmxlbWVudDogV2luZG93RW5hYmxlbWVudCB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmlzU2Vzc2lvbnNXaW5kb3cpIHtcblx0XHRcdHJldHVybiBlbmFibGVtZW50ID09PSBXaW5kb3dFbmFibGVtZW50LlNlc3Npb25zIHx8IGVuYWJsZW1lbnQgPT09IFdpbmRvd0VuYWJsZW1lbnQuQm90aDtcblx0XHR9XG5cdFx0cmV0dXJuICFlbmFibGVtZW50IHx8IGVuYWJsZW1lbnQgPT09IFdpbmRvd0VuYWJsZW1lbnQuRWRpdG9yIHx8IGVuYWJsZW1lbnQgPT09IFdpbmRvd0VuYWJsZW1lbnQuQm90aDtcblx0fVxuXG5cdGdldERlZmF1bHRWaWV3Q29udGFpbmVyKGxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24pOiBWaWV3Q29udGFpbmVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB2aWV3Q29udGFpbmVycyA9IHRoaXMudmlld0NvbnRhaW5lcnNSZWdpc3RyeS5nZXREZWZhdWx0Vmlld0NvbnRhaW5lcnMobG9jYXRpb24pO1xuXHRcdHJldHVybiB2aWV3Q29udGFpbmVycy5maW5kKHZpZXdDb250YWluZXIgPT4gdGhpcy5pc1ZpZXdDb250YWluZXJFbmFibGVkKHZpZXdDb250YWluZXIpKTtcblx0fVxuXG5cdGNhbk1vdmVWaWV3cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIXRoaXMuaXNTZXNzaW9uc1dpbmRvdztcblx0fVxuXG5cdG1vdmVWaWV3Q29udGFpbmVyVG9Mb2NhdGlvbih2aWV3Q29udGFpbmVyOiBWaWV3Q29udGFpbmVyLCBsb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uLCByZXF1ZXN0ZWRJbmRleD86IG51bWJlciwgcmVhc29uPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmNhbk1vdmVWaWV3cygpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMubG9nZ2VyLnZhbHVlLnRyYWNlKGBtb3ZlVmlld0NvbnRhaW5lclRvTG9jYXRpb246IHZpZXdDb250YWluZXI6JHt2aWV3Q29udGFpbmVyLmlkfSBsb2NhdGlvbjoke2xvY2F0aW9ufSByZWFzb246JHtyZWFzb259YCk7XG5cdFx0dGhpcy5tb3ZlVmlld0NvbnRhaW5lclRvTG9jYXRpb25XaXRob3V0U2F2aW5nKHZpZXdDb250YWluZXIsIGxvY2F0aW9uLCByZXF1ZXN0ZWRJbmRleCk7XG5cdFx0dGhpcy5zYXZlVmlld0N1c3RvbWl6YXRpb25zKCk7XG5cdH1cblxuXHRnZXRWaWV3Q29udGFpbmVyQmFkZ2VFbmFibGVtZW50U3RhdGUoaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnZpZXdDb250YWluZXJCYWRnZUVuYWJsZW1lbnRTdGF0ZXMuZ2V0KGlkKSA/PyB0cnVlO1xuXHR9XG5cblx0c2V0Vmlld0NvbnRhaW5lckJhZGdlRW5hYmxlbWVudFN0YXRlKGlkOiBzdHJpbmcsIGJhZGdlc0VuYWJsZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLnZpZXdDb250YWluZXJCYWRnZUVuYWJsZW1lbnRTdGF0ZXMuc2V0KGlkLCBiYWRnZXNFbmFibGVkKTtcblx0XHR0aGlzLnNhdmVWaWV3Q3VzdG9taXphdGlvbnMoKTtcblx0fVxuXG5cdG1vdmVWaWV3VG9Mb2NhdGlvbih2aWV3OiBJVmlld0Rlc2NyaXB0b3IsIGxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24sIHJlYXNvbj86IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jYW5Nb3ZlVmlld3MoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmxvZ2dlci52YWx1ZS50cmFjZShgbW92ZVZpZXdUb0xvY2F0aW9uOiB2aWV3OiR7dmlldy5pZH0gbG9jYXRpb246JHtsb2NhdGlvbn0gcmVhc29uOiR7cmVhc29ufWApO1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMucmVnaXN0ZXJHZW5lcmF0ZWRWaWV3Q29udGFpbmVyKGxvY2F0aW9uKTtcblx0XHR0aGlzLm1vdmVWaWV3c1RvQ29udGFpbmVyKFt2aWV3XSwgY29udGFpbmVyKTtcblx0fVxuXG5cdG1vdmVWaWV3c1RvQ29udGFpbmVyKHZpZXdzOiBJVmlld0Rlc2NyaXB0b3JbXSwgdmlld0NvbnRhaW5lcjogVmlld0NvbnRhaW5lciwgdmlzaWJpbGl0eVN0YXRlPzogVmlld1Zpc2liaWxpdHlTdGF0ZSwgcmVhc29uPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCF2aWV3cy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuY2FuTW92ZVZpZXdzKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmxvZ2dlci52YWx1ZS50cmFjZShgbW92ZVZpZXdzVG9Db250YWluZXI6IHZpZXdzOiR7dmlld3MubWFwKHZpZXcgPT4gdmlldy5pZCkuam9pbignLCcpfSB2aWV3Q29udGFpbmVyOiR7dmlld0NvbnRhaW5lci5pZH0gcmVhc29uOiR7cmVhc29ufWApO1xuXG5cdFx0Y29uc3QgZnJvbSA9IHRoaXMuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKHZpZXdzWzBdLmlkKTtcblx0XHRjb25zdCB0byA9IHZpZXdDb250YWluZXI7XG5cblx0XHRpZiAoZnJvbSAmJiB0byAmJiBmcm9tICE9PSB0bykge1xuXHRcdFx0Ly8gTW92ZSB2aWV3c1xuXHRcdFx0dGhpcy5tb3ZlVmlld3NXaXRob3V0U2F2aW5nKHZpZXdzLCBmcm9tLCB0bywgdmlzaWJpbGl0eVN0YXRlKTtcblx0XHRcdHRoaXMuY2xlYW5VcEdlbmVyYXRlZFZpZXdDb250YWluZXIoZnJvbS5pZCk7XG5cblx0XHRcdC8vIFNhdmUgbmV3IGxvY2F0aW9uc1xuXHRcdFx0dGhpcy5zYXZlVmlld0N1c3RvbWl6YXRpb25zKCk7XG5cblx0XHRcdC8vIExvZyB0byB0ZWxlbWV0cnlcblx0XHRcdHRoaXMucmVwb3J0TW92ZWRWaWV3cyh2aWV3cywgZnJvbSwgdG8pO1xuXHRcdH1cblx0fVxuXG5cdHJlc2V0KCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgdmlld0NvbnRhaW5lciBvZiB0aGlzLnZpZXdDb250YWluZXJzKSB7XG5cdFx0XHRjb25zdCB2aWV3Q29udGFpbmVyTW9kZWwgPSB0aGlzLmdldFZpZXdDb250YWluZXJNb2RlbCh2aWV3Q29udGFpbmVyKTtcblxuXHRcdFx0Zm9yIChjb25zdCB2aWV3RGVzY3JpcHRvciBvZiB2aWV3Q29udGFpbmVyTW9kZWwuYWxsVmlld0Rlc2NyaXB0b3JzKSB7XG5cdFx0XHRcdGNvbnN0IGRlZmF1bHRDb250YWluZXIgPSB0aGlzLmdldERlZmF1bHRDb250YWluZXJCeUlkKHZpZXdEZXNjcmlwdG9yLmlkKTtcblx0XHRcdFx0Y29uc3QgY3VycmVudENvbnRhaW5lciA9IHRoaXMuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKHZpZXdEZXNjcmlwdG9yLmlkKTtcblx0XHRcdFx0aWYgKGN1cnJlbnRDb250YWluZXIgJiYgZGVmYXVsdENvbnRhaW5lciAmJiBjdXJyZW50Q29udGFpbmVyICE9PSBkZWZhdWx0Q29udGFpbmVyKSB7XG5cdFx0XHRcdFx0dGhpcy5tb3ZlVmlld3NXaXRob3V0U2F2aW5nKFt2aWV3RGVzY3JpcHRvcl0sIGN1cnJlbnRDb250YWluZXIsIGRlZmF1bHRDb250YWluZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRlZmF1bHRDb250YWluZXJMb2NhdGlvbiA9IHRoaXMuZ2V0RGVmYXVsdFZpZXdDb250YWluZXJMb2NhdGlvbih2aWV3Q29udGFpbmVyKTtcblx0XHRcdGNvbnN0IGN1cnJlbnRDb250YWluZXJMb2NhdGlvbiA9IHRoaXMuZ2V0Vmlld0NvbnRhaW5lckxvY2F0aW9uKHZpZXdDb250YWluZXIpO1xuXHRcdFx0aWYgKGRlZmF1bHRDb250YWluZXJMb2NhdGlvbiAhPT0gbnVsbCAmJiBjdXJyZW50Q29udGFpbmVyTG9jYXRpb24gIT09IGRlZmF1bHRDb250YWluZXJMb2NhdGlvbikge1xuXHRcdFx0XHR0aGlzLm1vdmVWaWV3Q29udGFpbmVyVG9Mb2NhdGlvbldpdGhvdXRTYXZpbmcodmlld0NvbnRhaW5lciwgZGVmYXVsdENvbnRhaW5lckxvY2F0aW9uKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5jbGVhblVwR2VuZXJhdGVkVmlld0NvbnRhaW5lcih2aWV3Q29udGFpbmVyLmlkKTtcblx0XHR9XG5cblx0XHR0aGlzLnZpZXdDb250YWluZXJzQ3VzdG9tTG9jYXRpb25zLmNsZWFyKCk7XG5cdFx0dGhpcy52aWV3RGVzY3JpcHRvcnNDdXN0b21Mb2NhdGlvbnMuY2xlYXIoKTtcblx0XHR0aGlzLnNhdmVWaWV3Q3VzdG9taXphdGlvbnMoKTtcblx0fVxuXG5cdGlzVmlld0NvbnRhaW5lclJlbW92ZWRQZXJtYW5lbnRseSh2aWV3Q29udGFpbmVySWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmlzR2VuZXJhdGVkQ29udGFpbmVySWQodmlld0NvbnRhaW5lcklkKSAmJiAhdGhpcy52aWV3Q29udGFpbmVyc0N1c3RvbUxvY2F0aW9ucy5oYXModmlld0NvbnRhaW5lcklkKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VEZWZhdWx0Q29udGFpbmVyKHZpZXdzOiBJVmlld0Rlc2NyaXB0b3JbXSwgZnJvbTogVmlld0NvbnRhaW5lciwgdG86IFZpZXdDb250YWluZXIpOiB2b2lkIHtcblx0XHRjb25zdCB2aWV3c1RvTW92ZSA9IHZpZXdzLmZpbHRlcih2aWV3ID0+XG5cdFx0XHQhdGhpcy52aWV3RGVzY3JpcHRvcnNDdXN0b21Mb2NhdGlvbnMuaGFzKHZpZXcuaWQpIC8vIE1vdmUgdmlld3Mgd2hpY2ggYXJlIG5vdCBhbHJlYWR5IG1vdmVkXG5cdFx0XHR8fCAoIXRoaXMudmlld0NvbnRhaW5lcnMuaW5jbHVkZXMoZnJvbSkgJiYgdGhpcy52aWV3RGVzY3JpcHRvcnNDdXN0b21Mb2NhdGlvbnMuZ2V0KHZpZXcuaWQpID09PSBmcm9tLmlkKSAvLyBNb3ZlIHZpZXdzIHdoaWNoIGFyZSBtb3ZlZCBmcm9tIGEgcmVtb3ZlZCBjb250YWluZXJcblx0XHQpO1xuXHRcdGlmICh2aWV3c1RvTW92ZS5sZW5ndGgpIHtcblx0XHRcdHRoaXMubW92ZVZpZXdzV2l0aG91dFNhdmluZyh2aWV3c1RvTW92ZSwgZnJvbSwgdG8pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVwb3J0TW92ZWRWaWV3cyh2aWV3czogSVZpZXdEZXNjcmlwdG9yW10sIGZyb206IFZpZXdDb250YWluZXIsIHRvOiBWaWV3Q29udGFpbmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGFpbmVyVG9TdHJpbmcgPSAoY29udGFpbmVyOiBWaWV3Q29udGFpbmVyKTogc3RyaW5nID0+IHtcblx0XHRcdGlmIChjb250YWluZXIuaWQuc3RhcnRzV2l0aChWaWV3RGVzY3JpcHRvclNlcnZpY2UuQ09NTU9OX0NPTlRBSU5FUl9JRF9QUkVGSVgpKSB7XG5cdFx0XHRcdHJldHVybiAnY3VzdG9tJztcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFjb250YWluZXIuZXh0ZW5zaW9uSWQpIHtcblx0XHRcdFx0cmV0dXJuIGNvbnRhaW5lci5pZDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuICdleHRlbnNpb24nO1xuXHRcdH07XG5cblx0XHRjb25zdCBvbGRMb2NhdGlvbiA9IHRoaXMuZ2V0Vmlld0NvbnRhaW5lckxvY2F0aW9uKGZyb20pO1xuXHRcdGNvbnN0IG5ld0xvY2F0aW9uID0gdGhpcy5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24odG8pO1xuXHRcdGNvbnN0IHZpZXdDb3VudCA9IHZpZXdzLmxlbmd0aDtcblx0XHRjb25zdCBmcm9tQ29udGFpbmVyID0gY29udGFpbmVyVG9TdHJpbmcoZnJvbSk7XG5cdFx0Y29uc3QgdG9Db250YWluZXIgPSBjb250YWluZXJUb1N0cmluZyh0byk7XG5cdFx0Y29uc3QgZnJvbUxvY2F0aW9uID0gb2xkTG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCA/ICdwYW5lbCcgOiAnc2lkZWJhcic7XG5cdFx0Y29uc3QgdG9Mb2NhdGlvbiA9IG5ld0xvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwgPyAncGFuZWwnIDogJ3NpZGViYXInO1xuXG5cdFx0aW50ZXJmYWNlIFZpZXdEZXNjcmlwdG9yU2VydmljZU1vdmVWaWV3c0V2ZW50IHtcblx0XHRcdHZpZXdDb3VudDogbnVtYmVyO1xuXHRcdFx0ZnJvbUNvbnRhaW5lcjogc3RyaW5nO1xuXHRcdFx0dG9Db250YWluZXI6IHN0cmluZztcblx0XHRcdGZyb21Mb2NhdGlvbjogc3RyaW5nO1xuXHRcdFx0dG9Mb2NhdGlvbjogc3RyaW5nO1xuXHRcdH1cblxuXHRcdHR5cGUgVmlld0Rlc2NyaXB0b3JTZXJ2aWNlTW92ZVZpZXdzQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ2JlbmliZW5qJztcblx0XHRcdGNvbW1lbnQ6ICdMb2dnZWQgd2hlbiB2aWV3cyBhcmUgbW92ZWQgZnJvbSBvbmUgdmlldyBjb250YWluZXIgdG8gYW5vdGhlcic7XG5cdFx0XHR2aWV3Q291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgbnVtYmVyIG9mIHZpZXdzIG1vdmVkJyB9O1xuXHRcdFx0ZnJvbUNvbnRhaW5lcjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBzdGFydGluZyB2aWV3IGNvbnRhaW5lciBvZiB0aGUgbW92ZWQgdmlld3MnIH07XG5cdFx0XHR0b0NvbnRhaW5lcjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBkZXN0aW5hdGlvbiB2aWV3IGNvbnRhaW5lciBvZiB0aGUgbW92ZWQgdmlld3MnIH07XG5cdFx0XHRmcm9tTG9jYXRpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgbG9jYXRpb24gb2YgdGhlIHN0YXJ0aW5nIHZpZXcgY29udGFpbmVyLiBlLmcuIFByaW1hcnkgU2lkZSBCYXInIH07XG5cdFx0XHR0b0xvY2F0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGxvY2F0aW9uIG9mIHRoZSBkZXN0aW5hdGlvbiB2aWV3IGNvbnRhaW5lci4gZS5nLiBQYW5lbCcgfTtcblx0XHR9O1xuXG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Vmlld0Rlc2NyaXB0b3JTZXJ2aWNlTW92ZVZpZXdzRXZlbnQsIFZpZXdEZXNjcmlwdG9yU2VydmljZU1vdmVWaWV3c0NsYXNzaWZpY2F0aW9uPigndmlld0Rlc2NyaXB0b3JTZXJ2aWNlLm1vdmVWaWV3cycsIHsgdmlld0NvdW50LCBmcm9tQ29udGFpbmVyLCB0b0NvbnRhaW5lciwgZnJvbUxvY2F0aW9uLCB0b0xvY2F0aW9uIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBtb3ZlVmlld3NXaXRob3V0U2F2aW5nKHZpZXdzOiBJVmlld0Rlc2NyaXB0b3JbXSwgZnJvbTogVmlld0NvbnRhaW5lciwgdG86IFZpZXdDb250YWluZXIsIHZpc2liaWxpdHlTdGF0ZTogVmlld1Zpc2liaWxpdHlTdGF0ZSA9IFZpZXdWaXNpYmlsaXR5U3RhdGUuRXhwYW5kKTogdm9pZCB7XG5cdFx0dGhpcy5yZW1vdmVWaWV3cyhmcm9tLCB2aWV3cyk7XG5cdFx0dGhpcy5hZGRWaWV3cyh0bywgdmlld3MsIHZpc2liaWxpdHlTdGF0ZSk7XG5cblx0XHRjb25zdCBvbGRMb2NhdGlvbiA9IHRoaXMuZ2V0Vmlld0NvbnRhaW5lckxvY2F0aW9uKGZyb20pO1xuXHRcdGNvbnN0IG5ld0xvY2F0aW9uID0gdGhpcy5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24odG8pO1xuXG5cdFx0aWYgKG9sZExvY2F0aW9uICE9PSBuZXdMb2NhdGlvbikge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VMb2NhdGlvbi5maXJlKHsgdmlld3MsIGZyb206IG9sZExvY2F0aW9uLCB0bzogbmV3TG9jYXRpb24gfSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250YWluZXIuZmlyZSh7IHZpZXdzLCBmcm9tLCB0byB9KTtcblx0fVxuXG5cdHByaXZhdGUgbW92ZVZpZXdDb250YWluZXJUb0xvY2F0aW9uV2l0aG91dFNhdmluZyh2aWV3Q29udGFpbmVyOiBWaWV3Q29udGFpbmVyLCBsb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uLCByZXF1ZXN0ZWRJbmRleD86IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGZyb20gPSB0aGlzLmdldFZpZXdDb250YWluZXJMb2NhdGlvbih2aWV3Q29udGFpbmVyKTtcblx0XHRjb25zdCB0byA9IGxvY2F0aW9uO1xuXHRcdGlmIChmcm9tICE9PSB0bykge1xuXHRcdFx0Y29uc3QgaXNHZW5lcmF0ZWRWaWV3Q29udGFpbmVyID0gdGhpcy5pc0dlbmVyYXRlZENvbnRhaW5lcklkKHZpZXdDb250YWluZXIuaWQpO1xuXHRcdFx0Y29uc3QgaXNEZWZhdWx0Vmlld0NvbnRhaW5lckxvY2F0aW9uID0gdG8gPT09IHRoaXMuZ2V0RGVmYXVsdFZpZXdDb250YWluZXJMb2NhdGlvbih2aWV3Q29udGFpbmVyKTtcblx0XHRcdGlmIChpc0dlbmVyYXRlZFZpZXdDb250YWluZXIgfHwgIWlzRGVmYXVsdFZpZXdDb250YWluZXJMb2NhdGlvbikge1xuXHRcdFx0XHR0aGlzLnZpZXdDb250YWluZXJzQ3VzdG9tTG9jYXRpb25zLnNldCh2aWV3Q29udGFpbmVyLmlkLCB0byk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnZpZXdDb250YWluZXJzQ3VzdG9tTG9jYXRpb25zLmRlbGV0ZSh2aWV3Q29udGFpbmVyLmlkKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuZ2V0T3JDcmVhdGVEZWZhdWx0Vmlld0NvbnRhaW5lckxvY2F0aW9uQ29udGV4dEtleSh2aWV3Q29udGFpbmVyKS5zZXQoaXNHZW5lcmF0ZWRWaWV3Q29udGFpbmVyIHx8IGlzRGVmYXVsdFZpZXdDb250YWluZXJMb2NhdGlvbik7XG5cblx0XHRcdHZpZXdDb250YWluZXIucmVxdWVzdGVkSW5kZXggPSByZXF1ZXN0ZWRJbmRleDtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGFpbmVyTG9jYXRpb24uZmlyZSh7IHZpZXdDb250YWluZXIsIGZyb20sIHRvIH0pO1xuXG5cdFx0XHRjb25zdCB2aWV3cyA9IHRoaXMuZ2V0Vmlld3NCeUNvbnRhaW5lcih2aWV3Q29udGFpbmVyKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTG9jYXRpb24uZmlyZSh7IHZpZXdzLCBmcm9tLCB0byB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNsZWFuVXBHZW5lcmF0ZWRWaWV3Q29udGFpbmVyKHZpZXdDb250YWluZXJJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Ly8gU2tpcCBpZiBjb250YWluZXIgaXMgbm90IGdlbmVyYXRlZFxuXHRcdGlmICghdGhpcy5pc0dlbmVyYXRlZENvbnRhaW5lcklkKHZpZXdDb250YWluZXJJZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTa2lwIGlmIGNvbnRhaW5lciBoYXMgdmlld3MgcmVnaXN0ZXJlZFxuXHRcdGNvbnN0IHZpZXdDb250YWluZXIgPSB0aGlzLmdldFZpZXdDb250YWluZXJCeUlkKHZpZXdDb250YWluZXJJZCk7XG5cdFx0aWYgKHZpZXdDb250YWluZXIgJiYgdGhpcy5nZXRWaWV3Q29udGFpbmVyTW9kZWwodmlld0NvbnRhaW5lcik/LmFsbFZpZXdEZXNjcmlwdG9ycy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTa2lwIGlmIGNvbnRhaW5lciBoYXMgbW92ZWQgdmlld3Ncblx0XHRpZiAoWy4uLnRoaXMudmlld0Rlc2NyaXB0b3JzQ3VzdG9tTG9jYXRpb25zLnZhbHVlcygpXS5pbmNsdWRlcyh2aWV3Q29udGFpbmVySWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRGVyZWdpc3RlciB0aGUgY29udGFpbmVyXG5cdFx0aWYgKHZpZXdDb250YWluZXIpIHtcblx0XHRcdHRoaXMudmlld0NvbnRhaW5lcnNSZWdpc3RyeS5kZXJlZ2lzdGVyVmlld0NvbnRhaW5lcih2aWV3Q29udGFpbmVyKTtcblx0XHR9XG5cblx0XHR0aGlzLnZpZXdDb250YWluZXJzQ3VzdG9tTG9jYXRpb25zLmRlbGV0ZSh2aWV3Q29udGFpbmVySWQpO1xuXHRcdHRoaXMudmlld0NvbnRhaW5lckJhZGdlRW5hYmxlbWVudFN0YXRlcy5kZWxldGUodmlld0NvbnRhaW5lcklkKTtcblxuXHRcdC8vIENsZWFuIHVwIGNhY2hlcyBvZiBjb250YWluZXJcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShnZXRWaWV3c1N0YXRlU3RvcmFnZUlkKHZpZXdDb250YWluZXI/LnN0b3JhZ2VJZCB8fCBnZXRWaWV3Q29udGFpbmVyU3RvcmFnZUlkKHZpZXdDb250YWluZXJJZCkpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyR2VuZXJhdGVkVmlld0NvbnRhaW5lcihsb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uLCBleGlzdGluZ0lkPzogc3RyaW5nKTogVmlld0NvbnRhaW5lciB7XG5cdFx0Y29uc3QgaWQgPSBleGlzdGluZ0lkIHx8IHRoaXMuZ2VuZXJhdGVDb250YWluZXJJZChsb2NhdGlvbik7XG5cblx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLnZpZXdDb250YWluZXJzUmVnaXN0cnkucmVnaXN0ZXJWaWV3Q29udGFpbmVyKHtcblx0XHRcdGlkLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihWaWV3UGFuZUNvbnRhaW5lciwgW2lkLCB7IG1lcmdlVmlld1dpdGhDb250YWluZXJXaGVuU2luZ2xlVmlldzogdHJ1ZSB9XSksXG5cdFx0XHR0aXRsZTogeyB2YWx1ZTogbG9jYWxpemUoJ3VzZXInLCBcIlVzZXIgVmlldyBDb250YWluZXJcIiksIG9yaWdpbmFsOiAnVXNlciBWaWV3IENvbnRhaW5lcicgfSwgLy8gaGF2aW5nIGEgcGxhY2Vob2xkZXIgdGl0bGUgLSB0aGlzIHNob3VsZCBub3QgYmUgc2hvd24gYW55d2hlcmVcblx0XHRcdGljb246IGxvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhciA/IGRlZmF1bHRWaWV3SWNvbiA6IHVuZGVmaW5lZCxcblx0XHRcdHN0b3JhZ2VJZDogZ2V0Vmlld0NvbnRhaW5lclN0b3JhZ2VJZChpZCksXG5cdFx0XHRoaWRlSWZFbXB0eTogdHJ1ZVxuXHRcdH0sIGxvY2F0aW9uLCB7IGRvTm90UmVnaXN0ZXJPcGVuQ29tbWFuZDogdHJ1ZSB9KTtcblxuXHRcdGlmICh0aGlzLnZpZXdDb250YWluZXJzQ3VzdG9tTG9jYXRpb25zLmdldChjb250YWluZXIuaWQpICE9PSBsb2NhdGlvbikge1xuXHRcdFx0dGhpcy52aWV3Q29udGFpbmVyc0N1c3RvbUxvY2F0aW9ucy5zZXQoY29udGFpbmVyLmlkLCBsb2NhdGlvbik7XG5cdFx0fVxuXG5cdFx0dGhpcy5nZXRPckNyZWF0ZURlZmF1bHRWaWV3Q29udGFpbmVyTG9jYXRpb25Db250ZXh0S2V5KGNvbnRhaW5lcikuc2V0KHRydWUpO1xuXG5cdFx0cmV0dXJuIGNvbnRhaW5lcjtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRTdG9yYWdlQ2hhbmdlKCk6IHZvaWQge1xuXHRcdGlmIChKU09OLnN0cmluZ2lmeSh0aGlzLnZpZXdDdXN0b21pemF0aW9ucykgIT09IHRoaXMuZ2V0U3RvcmVkVmlld0N1c3RvbWl6YXRpb25zVmFsdWUoKSAvKiBUaGlzIGNoZWNrcyBpZiBjdXJyZW50IHdpbmRvdyBjaGFuZ2VkIHRoZSB2YWx1ZSBvciBub3QgKi8pIHtcblx0XHRcdHRoaXMub25EaWRWaWV3Q3VzdG9taXphdGlvbnNTdG9yYWdlQ2hhbmdlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZFZpZXdDdXN0b21pemF0aW9uc1N0b3JhZ2VDaGFuZ2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fdmlld0N1c3RvbWl6YXRpb25zID0gdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgbmV3Vmlld0NvbnRhaW5lckN1c3RvbWl6YXRpb25zID0gbmV3IE1hcDxzdHJpbmcsIFZpZXdDb250YWluZXJMb2NhdGlvbj4oT2JqZWN0LmVudHJpZXModGhpcy52aWV3Q3VzdG9taXphdGlvbnMudmlld0NvbnRhaW5lckxvY2F0aW9ucykpO1xuXHRcdGNvbnN0IG5ld1ZpZXdEZXNjcmlwdG9yQ3VzdG9taXphdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPihPYmplY3QuZW50cmllcyh0aGlzLnZpZXdDdXN0b21pemF0aW9ucy52aWV3TG9jYXRpb25zKSk7XG5cdFx0Y29uc3Qgdmlld0NvbnRhaW5lcnNUb01vdmU6IFtWaWV3Q29udGFpbmVyLCBWaWV3Q29udGFpbmVyTG9jYXRpb25dW10gPSBbXTtcblx0XHRjb25zdCB2aWV3c1RvTW92ZTogeyB2aWV3czogSVZpZXdEZXNjcmlwdG9yW107IGZyb206IFZpZXdDb250YWluZXI7IHRvOiBWaWV3Q29udGFpbmVyIH1bXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBbY29udGFpbmVySWQsIGxvY2F0aW9uXSBvZiBuZXdWaWV3Q29udGFpbmVyQ3VzdG9taXphdGlvbnMuZW50cmllcygpKSB7XG5cdFx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLmdldFZpZXdDb250YWluZXJCeUlkKGNvbnRhaW5lcklkKTtcblx0XHRcdGlmIChjb250YWluZXIpIHtcblx0XHRcdFx0aWYgKGxvY2F0aW9uICE9PSB0aGlzLmdldFZpZXdDb250YWluZXJMb2NhdGlvbihjb250YWluZXIpKSB7XG5cdFx0XHRcdFx0dmlld0NvbnRhaW5lcnNUb01vdmUucHVzaChbY29udGFpbmVyLCBsb2NhdGlvbl0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHQvLyBJZiB0aGUgY29udGFpbmVyIGlzIGdlbmVyYXRlZCBhbmQgbm90IHJlZ2lzdGVyZWQsIHdlIHJlZ2lzdGVyIGl0IG5vd1xuXHRcdFx0ZWxzZSBpZiAodGhpcy5pc0dlbmVyYXRlZENvbnRhaW5lcklkKGNvbnRhaW5lcklkKSkge1xuXHRcdFx0XHR0aGlzLnJlZ2lzdGVyR2VuZXJhdGVkVmlld0NvbnRhaW5lcihsb2NhdGlvbiwgY29udGFpbmVySWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgdmlld0NvbnRhaW5lciBvZiB0aGlzLnZpZXdDb250YWluZXJzKSB7XG5cdFx0XHRpZiAoIW5ld1ZpZXdDb250YWluZXJDdXN0b21pemF0aW9ucy5oYXModmlld0NvbnRhaW5lci5pZCkpIHtcblx0XHRcdFx0Y29uc3QgY3VycmVudExvY2F0aW9uID0gdGhpcy5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24odmlld0NvbnRhaW5lcik7XG5cdFx0XHRcdGNvbnN0IGRlZmF1bHRMb2NhdGlvbiA9IHRoaXMuZ2V0RGVmYXVsdFZpZXdDb250YWluZXJMb2NhdGlvbih2aWV3Q29udGFpbmVyKTtcblx0XHRcdFx0aWYgKGN1cnJlbnRMb2NhdGlvbiAhPT0gZGVmYXVsdExvY2F0aW9uKSB7XG5cdFx0XHRcdFx0dmlld0NvbnRhaW5lcnNUb01vdmUucHVzaChbdmlld0NvbnRhaW5lciwgZGVmYXVsdExvY2F0aW9uXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IFt2aWV3SWQsIHZpZXdDb250YWluZXJJZF0gb2YgbmV3Vmlld0Rlc2NyaXB0b3JDdXN0b21pemF0aW9ucy5lbnRyaWVzKCkpIHtcblx0XHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yID0gdGhpcy5nZXRWaWV3RGVzY3JpcHRvckJ5SWQodmlld0lkKTtcblx0XHRcdGlmICh2aWV3RGVzY3JpcHRvcikge1xuXHRcdFx0XHRjb25zdCBwcmV2Vmlld0NvbnRhaW5lciA9IHRoaXMuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKHZpZXdJZCk7XG5cdFx0XHRcdGNvbnN0IG5ld1ZpZXdDb250YWluZXIgPSB0aGlzLmdldFZpZXdDb250YWluZXJCeUlkKHZpZXdDb250YWluZXJJZCk7XG5cdFx0XHRcdGlmIChwcmV2Vmlld0NvbnRhaW5lciAmJiBuZXdWaWV3Q29udGFpbmVyICYmIG5ld1ZpZXdDb250YWluZXIgIT09IHByZXZWaWV3Q29udGFpbmVyKSB7XG5cdFx0XHRcdFx0dmlld3NUb01vdmUucHVzaCh7IHZpZXdzOiBbdmlld0Rlc2NyaXB0b3JdLCBmcm9tOiBwcmV2Vmlld0NvbnRhaW5lciwgdG86IG5ld1ZpZXdDb250YWluZXIgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiBhIHZhbHVlIGlzIG5vdCBwcmVzZW50IGluIHRoZSBjYWNoZSwgaXQgbXVzdCBiZSByZXNldCB0byBkZWZhdWx0XG5cdFx0Zm9yIChjb25zdCB2aWV3Q29udGFpbmVyIG9mIHRoaXMudmlld0NvbnRhaW5lcnMpIHtcblx0XHRcdGNvbnN0IHZpZXdDb250YWluZXJNb2RlbCA9IHRoaXMuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKHZpZXdDb250YWluZXIpO1xuXHRcdFx0Zm9yIChjb25zdCB2aWV3RGVzY3JpcHRvciBvZiB2aWV3Q29udGFpbmVyTW9kZWwuYWxsVmlld0Rlc2NyaXB0b3JzKSB7XG5cdFx0XHRcdGlmICghbmV3Vmlld0Rlc2NyaXB0b3JDdXN0b21pemF0aW9ucy5oYXModmlld0Rlc2NyaXB0b3IuaWQpKSB7XG5cdFx0XHRcdFx0Y29uc3QgY3VycmVudENvbnRhaW5lciA9IHRoaXMuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKHZpZXdEZXNjcmlwdG9yLmlkKTtcblx0XHRcdFx0XHRjb25zdCBkZWZhdWx0Q29udGFpbmVyID0gdGhpcy5nZXREZWZhdWx0Q29udGFpbmVyQnlJZCh2aWV3RGVzY3JpcHRvci5pZCk7XG5cdFx0XHRcdFx0aWYgKGN1cnJlbnRDb250YWluZXIgJiYgZGVmYXVsdENvbnRhaW5lciAmJiBjdXJyZW50Q29udGFpbmVyICE9PSBkZWZhdWx0Q29udGFpbmVyKSB7XG5cdFx0XHRcdFx0XHR2aWV3c1RvTW92ZS5wdXNoKHsgdmlld3M6IFt2aWV3RGVzY3JpcHRvcl0sIGZyb206IGN1cnJlbnRDb250YWluZXIsIHRvOiBkZWZhdWx0Q29udGFpbmVyIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEV4ZWN1dGUgVmlldyBDb250YWluZXIgTW92ZW1lbnRzXG5cdFx0Zm9yIChjb25zdCBbY29udGFpbmVyLCBsb2NhdGlvbl0gb2Ygdmlld0NvbnRhaW5lcnNUb01vdmUpIHtcblx0XHRcdHRoaXMubW92ZVZpZXdDb250YWluZXJUb0xvY2F0aW9uV2l0aG91dFNhdmluZyhjb250YWluZXIsIGxvY2F0aW9uKTtcblx0XHR9XG5cdFx0Ly8gRXhlY3V0ZSBWaWV3IE1vdmVtZW50c1xuXHRcdGZvciAoY29uc3QgeyB2aWV3cywgZnJvbSwgdG8gfSBvZiB2aWV3c1RvTW92ZSkge1xuXHRcdFx0dGhpcy5tb3ZlVmlld3NXaXRob3V0U2F2aW5nKHZpZXdzLCBmcm9tLCB0bywgVmlld1Zpc2liaWxpdHlTdGF0ZS5EZWZhdWx0KTtcblx0XHR9XG5cblx0XHR0aGlzLnZpZXdDb250YWluZXJzQ3VzdG9tTG9jYXRpb25zID0gbmV3Vmlld0NvbnRhaW5lckN1c3RvbWl6YXRpb25zO1xuXHRcdHRoaXMudmlld0Rlc2NyaXB0b3JzQ3VzdG9tTG9jYXRpb25zID0gbmV3Vmlld0Rlc2NyaXB0b3JDdXN0b21pemF0aW9ucztcblx0fVxuXG5cdC8vIEdlbmVyYXRlZCBDb250YWluZXIgSWQgRm9ybWF0XG5cdC8vIHtDb21tb24gUHJlZml4fS57TG9jYXRpb259LntVbmlxdWVuZXNzIElkfVxuXHQvLyBPbGQgRm9ybWF0IChkZXByZWNhdGVkKVxuXHQvLyB7Q29tbW9uIFByZWZpeH0ue1VuaXF1ZW5lc3MgSWR9LntTb3VyY2UgVmlldyBJZH1cblx0cHJpdmF0ZSBnZW5lcmF0ZUNvbnRhaW5lcklkKGxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24pOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHtWaWV3RGVzY3JpcHRvclNlcnZpY2UuQ09NTU9OX0NPTlRBSU5FUl9JRF9QUkVGSVh9LiR7Vmlld0NvbnRhaW5lckxvY2F0aW9uVG9TdHJpbmcobG9jYXRpb24pfS4ke2dlbmVyYXRlVXVpZCgpfWA7XG5cdH1cblxuXHRwcml2YXRlIHNhdmVWaWV3Q3VzdG9taXphdGlvbnMoKTogdm9pZCB7XG5cdFx0Y29uc3Qgdmlld0N1c3RvbWl6YXRpb25zOiBJVmlld3NDdXN0b21pemF0aW9ucyA9IHsgdmlld0NvbnRhaW5lckxvY2F0aW9uczoge30sIHZpZXdMb2NhdGlvbnM6IHt9LCB2aWV3Q29udGFpbmVyQmFkZ2VFbmFibGVtZW50U3RhdGVzOiB7fSB9O1xuXG5cdFx0Zm9yIChjb25zdCBbY29udGFpbmVySWQsIGxvY2F0aW9uXSBvZiB0aGlzLnZpZXdDb250YWluZXJzQ3VzdG9tTG9jYXRpb25zKSB7XG5cdFx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLmdldFZpZXdDb250YWluZXJCeUlkKGNvbnRhaW5lcklkKTtcblx0XHRcdC8vIFNraXAgaWYgdGhlIHZpZXcgY29udGFpbmVyIGlzIG5vdCBhIGdlbmVyYXRlZCBjb250YWluZXIgYW5kIGluIGRlZmF1bHQgbG9jYXRpb25cblx0XHRcdGlmIChjb250YWluZXIgJiYgIXRoaXMuaXNHZW5lcmF0ZWRDb250YWluZXJJZChjb250YWluZXJJZCkgJiYgbG9jYXRpb24gPT09IHRoaXMuZ2V0RGVmYXVsdFZpZXdDb250YWluZXJMb2NhdGlvbihjb250YWluZXIpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0dmlld0N1c3RvbWl6YXRpb25zLnZpZXdDb250YWluZXJMb2NhdGlvbnNbY29udGFpbmVySWRdID0gbG9jYXRpb247XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBbdmlld0lkLCB2aWV3Q29udGFpbmVySWRdIG9mIHRoaXMudmlld0Rlc2NyaXB0b3JzQ3VzdG9tTG9jYXRpb25zKSB7XG5cdFx0XHRjb25zdCB2aWV3Q29udGFpbmVyID0gdGhpcy5nZXRWaWV3Q29udGFpbmVyQnlJZCh2aWV3Q29udGFpbmVySWQpO1xuXHRcdFx0aWYgKHZpZXdDb250YWluZXIpIHtcblx0XHRcdFx0Y29uc3QgZGVmYXVsdENvbnRhaW5lciA9IHRoaXMuZ2V0RGVmYXVsdENvbnRhaW5lckJ5SWQodmlld0lkKTtcblx0XHRcdFx0Ly8gU2tpcCBpZiB0aGUgdmlldyBpcyBhdCBkZWZhdWx0IGxvY2F0aW9uXG5cdFx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy85MDQxNFxuXHRcdFx0XHRpZiAoZGVmYXVsdENvbnRhaW5lcj8uaWQgPT09IHZpZXdDb250YWluZXIuaWQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dmlld0N1c3RvbWl6YXRpb25zLnZpZXdMb2NhdGlvbnNbdmlld0lkXSA9IHZpZXdDb250YWluZXJJZDtcblx0XHR9XG5cblx0XHQvLyBMb29wIHRocm91Z2ggdmlld0NvbnRhaW5lckJhZGdlRW5hYmxlbWVudFN0YXRlcyBhbmQgc2F2ZSBvbmx5IHRoZSBvbmVzIHRoYXQgYXJlIGRpc2FibGVkXG5cdFx0Zm9yIChjb25zdCBbdmlld0NvbnRhaW5lcklkLCBiYWRnZUVuYWJsZW1lbnRTdGF0ZV0gb2YgdGhpcy52aWV3Q29udGFpbmVyQmFkZ2VFbmFibGVtZW50U3RhdGVzKSB7XG5cdFx0XHRpZiAoYmFkZ2VFbmFibGVtZW50U3RhdGUgPT09IGZhbHNlKSB7XG5cdFx0XHRcdHZpZXdDdXN0b21pemF0aW9ucy52aWV3Q29udGFpbmVyQmFkZ2VFbmFibGVtZW50U3RhdGVzW3ZpZXdDb250YWluZXJJZF0gPSBiYWRnZUVuYWJsZW1lbnRTdGF0ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy52aWV3Q3VzdG9taXphdGlvbnMgPSB2aWV3Q3VzdG9taXphdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIF92aWV3Q3VzdG9taXphdGlvbnM6IElWaWV3c0N1c3RvbWl6YXRpb25zIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGdldCB2aWV3Q3VzdG9taXphdGlvbnMoKTogSVZpZXdzQ3VzdG9taXphdGlvbnMge1xuXHRcdGlmICghdGhpcy5fdmlld0N1c3RvbWl6YXRpb25zKSB7XG5cdFx0XHR0aGlzLl92aWV3Q3VzdG9taXphdGlvbnMgPSBKU09OLnBhcnNlKHRoaXMuZ2V0U3RvcmVkVmlld0N1c3RvbWl6YXRpb25zVmFsdWUoKSkgYXMgSVZpZXdzQ3VzdG9taXphdGlvbnM7XG5cdFx0XHR0aGlzLl92aWV3Q3VzdG9taXphdGlvbnMudmlld0NvbnRhaW5lckxvY2F0aW9ucyA9IHRoaXMuX3ZpZXdDdXN0b21pemF0aW9ucy52aWV3Q29udGFpbmVyTG9jYXRpb25zID8/IHt9O1xuXHRcdFx0dGhpcy5fdmlld0N1c3RvbWl6YXRpb25zLnZpZXdMb2NhdGlvbnMgPSB0aGlzLl92aWV3Q3VzdG9taXphdGlvbnMudmlld0xvY2F0aW9ucyA/PyB7fTtcblx0XHRcdHRoaXMuX3ZpZXdDdXN0b21pemF0aW9ucy52aWV3Q29udGFpbmVyQmFkZ2VFbmFibGVtZW50U3RhdGVzID0gdGhpcy5fdmlld0N1c3RvbWl6YXRpb25zLnZpZXdDb250YWluZXJCYWRnZUVuYWJsZW1lbnRTdGF0ZXMgPz8ge307XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl92aWV3Q3VzdG9taXphdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIHNldCB2aWV3Q3VzdG9taXphdGlvbnModmlld0N1c3RvbWl6YXRpb25zOiBJVmlld3NDdXN0b21pemF0aW9ucykge1xuXHRcdGNvbnN0IHZhbHVlID0gSlNPTi5zdHJpbmdpZnkodmlld0N1c3RvbWl6YXRpb25zKTtcblx0XHRpZiAoSlNPTi5zdHJpbmdpZnkodGhpcy52aWV3Q3VzdG9taXphdGlvbnMpICE9PSB2YWx1ZSkge1xuXHRcdFx0dGhpcy5fdmlld0N1c3RvbWl6YXRpb25zID0gdmlld0N1c3RvbWl6YXRpb25zO1xuXHRcdFx0dGhpcy5zZXRTdG9yZWRWaWV3Q3VzdG9taXphdGlvbnNWYWx1ZSh2YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRTdG9yZWRWaWV3Q3VzdG9taXphdGlvbnNWYWx1ZSgpOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLmlzU2Vzc2lvbnNXaW5kb3cpIHtcblx0XHRcdHJldHVybiAne30nO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLlZJRVdTX0NVU1RPTUlaQVRJT05TLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgJ3t9Jyk7XG5cdH1cblxuXHRwcml2YXRlIHNldFN0b3JlZFZpZXdDdXN0b21pemF0aW9uc1ZhbHVlKHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5pc1Nlc3Npb25zV2luZG93KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLlZJRVdTX0NVU1RPTUlaQVRJT05TLCB2YWx1ZSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdH1cblxuXHRwcml2YXRlIGdldFZpZXdzQnlDb250YWluZXIodmlld0NvbnRhaW5lcjogVmlld0NvbnRhaW5lcik6IElWaWV3RGVzY3JpcHRvcltdIHtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLnZpZXdzUmVnaXN0cnkuZ2V0Vmlld3Modmlld0NvbnRhaW5lcikuZmlsdGVyKHZpZXdEZXNjcmlwdG9yID0+IHtcblx0XHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yVmlld0NvbnRhaW5lcklkID0gdGhpcy52aWV3RGVzY3JpcHRvcnNDdXN0b21Mb2NhdGlvbnMuZ2V0KHZpZXdEZXNjcmlwdG9yLmlkKSA/PyB2aWV3Q29udGFpbmVyLmlkO1xuXHRcdFx0cmV0dXJuIHZpZXdEZXNjcmlwdG9yVmlld0NvbnRhaW5lcklkID09PSB2aWV3Q29udGFpbmVyLmlkO1xuXHRcdH0pO1xuXG5cdFx0Zm9yIChjb25zdCBbdmlld0lkLCB2aWV3Q29udGFpbmVySWRdIG9mIHRoaXMudmlld0Rlc2NyaXB0b3JzQ3VzdG9tTG9jYXRpb25zLmVudHJpZXMoKSkge1xuXHRcdFx0aWYgKHZpZXdDb250YWluZXJJZCAhPT0gdmlld0NvbnRhaW5lci5pZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMudmlld3NSZWdpc3RyeS5nZXRWaWV3Q29udGFpbmVyKHZpZXdJZCkgPT09IHZpZXdDb250YWluZXIpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yID0gdGhpcy5nZXRWaWV3RGVzY3JpcHRvckJ5SWQodmlld0lkKTtcblx0XHRcdGlmICh2aWV3RGVzY3JpcHRvcikge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh2aWV3RGVzY3JpcHRvcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRSZWdpc3RlclZpZXdDb250YWluZXIodmlld0NvbnRhaW5lcjogVmlld0NvbnRhaW5lcik6IHZvaWQge1xuXHRcdGNvbnN0IGRlZmF1bHRMb2NhdGlvbiA9IHRoaXMuaXNHZW5lcmF0ZWRDb250YWluZXJJZCh2aWV3Q29udGFpbmVyLmlkKSA/IHRydWUgOiB0aGlzLmdldFZpZXdDb250YWluZXJMb2NhdGlvbih2aWV3Q29udGFpbmVyKSA9PT0gdGhpcy5nZXREZWZhdWx0Vmlld0NvbnRhaW5lckxvY2F0aW9uKHZpZXdDb250YWluZXIpO1xuXHRcdHRoaXMuZ2V0T3JDcmVhdGVEZWZhdWx0Vmlld0NvbnRhaW5lckxvY2F0aW9uQ29udGV4dEtleSh2aWV3Q29udGFpbmVyKS5zZXQoZGVmYXVsdExvY2F0aW9uKTtcblx0XHR0aGlzLmdldE9yUmVnaXN0ZXJWaWV3Q29udGFpbmVyTW9kZWwodmlld0NvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIGdldE9yUmVnaXN0ZXJWaWV3Q29udGFpbmVyTW9kZWwodmlld0NvbnRhaW5lcjogVmlld0NvbnRhaW5lcik6IFZpZXdDb250YWluZXJNb2RlbCB7XG5cdFx0bGV0IHZpZXdDb250YWluZXJNb2RlbCA9IHRoaXMudmlld0NvbnRhaW5lck1vZGVscy5nZXQodmlld0NvbnRhaW5lcik/LnZpZXdDb250YWluZXJNb2RlbDtcblxuXHRcdGlmICghdmlld0NvbnRhaW5lck1vZGVsKSB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdHZpZXdDb250YWluZXJNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFZpZXdDb250YWluZXJNb2RlbCwgdmlld0NvbnRhaW5lcikpO1xuXG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlQWN0aXZlVmlld3MoeyBhZGRlZDogdmlld0NvbnRhaW5lck1vZGVsLmFjdGl2ZVZpZXdEZXNjcmlwdG9ycywgcmVtb3ZlZDogW10gfSk7XG5cdFx0XHR2aWV3Q29udGFpbmVyTW9kZWwub25EaWRDaGFuZ2VBY3RpdmVWaWV3RGVzY3JpcHRvcnMoY2hhbmdlZCA9PiB0aGlzLm9uRGlkQ2hhbmdlQWN0aXZlVmlld3MoY2hhbmdlZCksIHRoaXMsIGRpc3Bvc2FibGVzKTtcblxuXHRcdFx0dGhpcy5vbkRpZENoYW5nZVZpc2libGVWaWV3cyh7IGFkZGVkOiBbLi4udmlld0NvbnRhaW5lck1vZGVsLnZpc2libGVWaWV3RGVzY3JpcHRvcnNdLCByZW1vdmVkOiBbXSB9KTtcblx0XHRcdHZpZXdDb250YWluZXJNb2RlbC5vbkRpZEFkZFZpc2libGVWaWV3RGVzY3JpcHRvcnMoYWRkZWQgPT4gdGhpcy5vbkRpZENoYW5nZVZpc2libGVWaWV3cyh7IGFkZGVkOiBhZGRlZC5tYXAoKHsgdmlld0Rlc2NyaXB0b3IgfSkgPT4gdmlld0Rlc2NyaXB0b3IpLCByZW1vdmVkOiBbXSB9KSwgdGhpcywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0dmlld0NvbnRhaW5lck1vZGVsLm9uRGlkUmVtb3ZlVmlzaWJsZVZpZXdEZXNjcmlwdG9ycyhyZW1vdmVkID0+IHRoaXMub25EaWRDaGFuZ2VWaXNpYmxlVmlld3MoeyBhZGRlZDogW10sIHJlbW92ZWQ6IHJlbW92ZWQubWFwKCh7IHZpZXdEZXNjcmlwdG9yIH0pID0+IHZpZXdEZXNjcmlwdG9yKSB9KSwgdGhpcywgZGlzcG9zYWJsZXMpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMudmlld3NWaXNpYmlsaXR5QWN0aW9uRGlzcG9zYWJsZXMuZGVsZXRlQW5kRGlzcG9zZSh2aWV3Q29udGFpbmVyKSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5yZWdpc3RlclJlc2V0Vmlld0NvbnRhaW5lckFjdGlvbih2aWV3Q29udGFpbmVyKSk7XG5cblx0XHRcdGNvbnN0IHZhbHVlID0geyB2aWV3Q29udGFpbmVyTW9kZWw6IHZpZXdDb250YWluZXJNb2RlbCwgZGlzcG9zYWJsZXMsIGRpc3Bvc2U6ICgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSB9O1xuXHRcdFx0dGhpcy52aWV3Q29udGFpbmVyTW9kZWxzLnNldCh2aWV3Q29udGFpbmVyLCB2YWx1ZSk7XG5cblx0XHRcdC8vIFJlZ2lzdGVyIGFsbCB2aWV3cyB0aGF0IHdlcmUgc3RhdGljYWxseSByZWdpc3RlcmVkIHRvIHRoaXMgY29udGFpbmVyXG5cdFx0XHQvLyBQb3RlbnRpYWxseSwgdGhpcyBpcyByZWdpc3RlcmluZyBzb21ldGhpbmcgdGhhdCB3YXMgaGFuZGxlZCBieSBhbm90aGVyIGNvbnRhaW5lclxuXHRcdFx0Ly8gYWRkVmlld3MoKSBoYW5kbGVzIHRoaXMgYnkgZmlsdGVyaW5nIHZpZXdzIHRoYXQgYXJlIGFscmVhZHkgcmVnaXN0ZXJlZFxuXHRcdFx0dGhpcy5vbkRpZFJlZ2lzdGVyVmlld3MoW3sgdmlld3M6IHRoaXMudmlld3NSZWdpc3RyeS5nZXRWaWV3cyh2aWV3Q29udGFpbmVyKSwgdmlld0NvbnRhaW5lciB9XSk7XG5cblx0XHRcdC8vIEFkZCB2aWV3cyB0aGF0IHdlcmUgcmVnaXN0ZXJlZCBwcmlvciB0byB0aGlzIHZpZXcgY29udGFpbmVyXG5cdFx0XHRjb25zdCB2aWV3c1RvUmVnaXN0ZXIgPSB0aGlzLmdldFZpZXdzQnlDb250YWluZXIodmlld0NvbnRhaW5lcikuZmlsdGVyKHZpZXcgPT4gdGhpcy5nZXREZWZhdWx0Q29udGFpbmVyQnlJZCh2aWV3LmlkKSAhPT0gdmlld0NvbnRhaW5lcik7XG5cdFx0XHRpZiAodmlld3NUb1JlZ2lzdGVyLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLmFkZFZpZXdzKHZpZXdDb250YWluZXIsIHZpZXdzVG9SZWdpc3Rlcik7XG5cdFx0XHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UuYnVmZmVyQ2hhbmdlRXZlbnRzKCgpID0+IHtcblx0XHRcdFx0XHR2aWV3c1RvUmVnaXN0ZXIuZm9yRWFjaCh2aWV3RGVzY3JpcHRvciA9PiB0aGlzLmdldE9yQ3JlYXRlTW92YWJsZVZpZXdDb250ZXh0S2V5KHZpZXdEZXNjcmlwdG9yKS5zZXQoISF2aWV3RGVzY3JpcHRvci5jYW5Nb3ZlVmlldykpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuY2FuUmVnaXN0ZXJWaWV3c1Zpc2liaWxpdHlBY3Rpb25zKSB7XG5cdFx0XHRcdHRoaXMucmVnaXN0ZXJWaWV3c1Zpc2liaWxpdHlBY3Rpb25zKHZpZXdDb250YWluZXIsIHZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdmlld0NvbnRhaW5lck1vZGVsO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZERlcmVnaXN0ZXJWaWV3Q29udGFpbmVyKHZpZXdDb250YWluZXI6IFZpZXdDb250YWluZXIpOiB2b2lkIHtcblx0XHR0aGlzLnZpZXdDb250YWluZXJNb2RlbHMuZGVsZXRlQW5kRGlzcG9zZSh2aWV3Q29udGFpbmVyKTtcblx0XHR0aGlzLnZpZXdzVmlzaWJpbGl0eUFjdGlvbkRpc3Bvc2FibGVzLmRlbGV0ZUFuZERpc3Bvc2Uodmlld0NvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlQWN0aXZlVmlld3MoeyBhZGRlZCwgcmVtb3ZlZCB9OiB7IGFkZGVkOiBSZWFkb25seUFycmF5PElWaWV3RGVzY3JpcHRvcj47IHJlbW92ZWQ6IFJlYWRvbmx5QXJyYXk8SVZpZXdEZXNjcmlwdG9yPiB9KTogdm9pZCB7XG5cdFx0dGhpcy5jb250ZXh0S2V5U2VydmljZS5idWZmZXJDaGFuZ2VFdmVudHMoKCkgPT4ge1xuXHRcdFx0YWRkZWQuZm9yRWFjaCh2aWV3RGVzY3JpcHRvciA9PiB0aGlzLmdldE9yQ3JlYXRlQWN0aXZlVmlld0NvbnRleHRLZXkodmlld0Rlc2NyaXB0b3IpLnNldCh0cnVlKSk7XG5cdFx0XHRyZW1vdmVkLmZvckVhY2godmlld0Rlc2NyaXB0b3IgPT4gdGhpcy5nZXRPckNyZWF0ZUFjdGl2ZVZpZXdDb250ZXh0S2V5KHZpZXdEZXNjcmlwdG9yKS5zZXQoZmFsc2UpKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VWaXNpYmxlVmlld3MoeyBhZGRlZCwgcmVtb3ZlZCB9OiB7IGFkZGVkOiBJVmlld0Rlc2NyaXB0b3JbXTsgcmVtb3ZlZDogSVZpZXdEZXNjcmlwdG9yW10gfSk6IHZvaWQge1xuXHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UuYnVmZmVyQ2hhbmdlRXZlbnRzKCgpID0+IHtcblx0XHRcdGFkZGVkLmZvckVhY2godmlld0Rlc2NyaXB0b3IgPT4gdGhpcy5nZXRPckNyZWF0ZVZpc2libGVWaWV3Q29udGV4dEtleSh2aWV3RGVzY3JpcHRvcikuc2V0KHRydWUpKTtcblx0XHRcdHJlbW92ZWQuZm9yRWFjaCh2aWV3RGVzY3JpcHRvciA9PiB0aGlzLmdldE9yQ3JlYXRlVmlzaWJsZVZpZXdDb250ZXh0S2V5KHZpZXdEZXNjcmlwdG9yKS5zZXQoZmFsc2UpKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJWaWV3c1Zpc2liaWxpdHlBY3Rpb25zKHZpZXdDb250YWluZXI6IFZpZXdDb250YWluZXIsIHsgdmlld0NvbnRhaW5lck1vZGVsLCBkaXNwb3NhYmxlcyB9OiB7IHZpZXdDb250YWluZXJNb2RlbDogVmlld0NvbnRhaW5lck1vZGVsOyBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlIH0pOiB2b2lkIHtcblx0XHR0aGlzLnZpZXdzVmlzaWJpbGl0eUFjdGlvbkRpc3Bvc2FibGVzLmRlbGV0ZUFuZERpc3Bvc2Uodmlld0NvbnRhaW5lcik7XG5cdFx0dGhpcy52aWV3c1Zpc2liaWxpdHlBY3Rpb25EaXNwb3NhYmxlcy5zZXQodmlld0NvbnRhaW5lciwgdGhpcy5yZWdpc3RlclZpZXdzVmlzaWJpbGl0eUFjdGlvbnNGb3JDb250YWluZXIodmlld0NvbnRhaW5lck1vZGVsKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50LmFueShcblx0XHRcdHZpZXdDb250YWluZXJNb2RlbC5vbkRpZENoYW5nZUFjdGl2ZVZpZXdEZXNjcmlwdG9ycyxcblx0XHRcdHZpZXdDb250YWluZXJNb2RlbC5vbkRpZEFkZFZpc2libGVWaWV3RGVzY3JpcHRvcnMsXG5cdFx0XHR2aWV3Q29udGFpbmVyTW9kZWwub25EaWRSZW1vdmVWaXNpYmxlVmlld0Rlc2NyaXB0b3JzLFxuXHRcdFx0dmlld0NvbnRhaW5lck1vZGVsLm9uRGlkTW92ZVZpc2libGVWaWV3RGVzY3JpcHRvcnNcblx0XHQpKGUgPT4ge1xuXHRcdFx0dGhpcy52aWV3c1Zpc2liaWxpdHlBY3Rpb25EaXNwb3NhYmxlcy5kZWxldGVBbmREaXNwb3NlKHZpZXdDb250YWluZXIpO1xuXHRcdFx0dGhpcy52aWV3c1Zpc2liaWxpdHlBY3Rpb25EaXNwb3NhYmxlcy5zZXQodmlld0NvbnRhaW5lciwgdGhpcy5yZWdpc3RlclZpZXdzVmlzaWJpbGl0eUFjdGlvbnNGb3JDb250YWluZXIodmlld0NvbnRhaW5lck1vZGVsKSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclZpZXdzVmlzaWJpbGl0eUFjdGlvbnNGb3JDb250YWluZXIodmlld0NvbnRhaW5lck1vZGVsOiBWaWV3Q29udGFpbmVyTW9kZWwpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dmlld0NvbnRhaW5lck1vZGVsLmFjdGl2ZVZpZXdEZXNjcmlwdG9ycy5mb3JFYWNoKCh2aWV3RGVzY3JpcHRvciwgaW5kZXgpID0+IHtcblx0XHRcdGlmICghdmlld0Rlc2NyaXB0b3IucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBWaWV3UGFuZUNvbnRhaW5lckFjdGlvbjxWaWV3UGFuZUNvbnRhaW5lcj4ge1xuXHRcdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdFx0XHRpZDogYCR7dmlld0Rlc2NyaXB0b3IuaWR9LnRvZ2dsZVZpc2liaWxpdHlgLFxuXHRcdFx0XHRcdFx0XHR2aWV3UGFuZUNvbnRhaW5lcklkOiB2aWV3Q29udGFpbmVyTW9kZWwudmlld0NvbnRhaW5lci5pZCxcblx0XHRcdFx0XHRcdFx0cHJlY29uZGl0aW9uOiB2aWV3RGVzY3JpcHRvci5jYW5Ub2dnbGVWaXNpYmlsaXR5ICYmICghdmlld0NvbnRhaW5lck1vZGVsLmlzVmlzaWJsZSh2aWV3RGVzY3JpcHRvci5pZCkgfHwgdmlld0NvbnRhaW5lck1vZGVsLnZpc2libGVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoID4gMSkgPyBDb250ZXh0S2V5RXhwci50cnVlKCkgOiBDb250ZXh0S2V5RXhwci5mYWxzZSgpLFxuXHRcdFx0XHRcdFx0XHR0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5oYXMoYCR7dmlld0Rlc2NyaXB0b3IuaWR9LnZpc2libGVgKSxcblx0XHRcdFx0XHRcdFx0dGl0bGU6IHZpZXdEZXNjcmlwdG9yLm5hbWUsXG5cdFx0XHRcdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplMigndG9nZ2xlVmlzaWJpbGl0eURlc2NyaXB0aW9uJywgJ1RvZ2dsZXMgdGhlIHZpc2liaWxpdHkgb2YgdGhlIHswfSB2aWV3IGlmIHRoZSB2aWV3IGNvbnRhaW5lciBpdCBpcyBsb2NhdGVkIGluIGlzIHZpc2libGUnLCB2aWV3RGVzY3JpcHRvci5uYW1lLnZhbHVlKVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0XHRcdGlkOiBWaWV3c1N1Yk1lbnUsXG5cdFx0XHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3Q29udGFpbmVyJywgdmlld0NvbnRhaW5lck1vZGVsLnZpZXdDb250YWluZXIuaWQpLFxuXHRcdFx0XHRcdFx0XHRcdG9yZGVyOiBpbmRleCxcblx0XHRcdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0XHRcdGlkOiBNZW51SWQuVmlld0NvbnRhaW5lclRpdGxlQ29udGV4dCxcblx0XHRcdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXdDb250YWluZXInLCB2aWV3Q29udGFpbmVyTW9kZWwudmlld0NvbnRhaW5lci5pZCksXG5cdFx0XHRcdFx0XHRcdFx0b3JkZXI6IGluZGV4LFxuXHRcdFx0XHRcdFx0XHRcdGdyb3VwOiAnMV90b2dnbGVWaXNpYmlsaXR5J1xuXHRcdFx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGVDb250ZXh0LFxuXHRcdFx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKC4uLnZpZXdDb250YWluZXJNb2RlbC52aXNpYmxlVmlld0Rlc2NyaXB0b3JzLm1hcCh2ID0+IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIHYuaWQpKSksXG5cdFx0XHRcdFx0XHRcdFx0b3JkZXI6IGluZGV4LFxuXHRcdFx0XHRcdFx0XHRcdGdyb3VwOiAnMl90b2dnbGVWaXNpYmlsaXR5J1xuXHRcdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGFzeW5jIHJ1bkluVmlld1BhbmVDb250YWluZXIoc2VydmljZUFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3UGFuZUNvbnRhaW5lcjogVmlld1BhbmVDb250YWluZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0XHRcdHZpZXdQYW5lQ29udGFpbmVyLnRvZ2dsZVZpZXdWaXNpYmlsaXR5KHZpZXdEZXNjcmlwdG9yLmlkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIFZpZXdQYW5lQ29udGFpbmVyQWN0aW9uPFZpZXdQYW5lQ29udGFpbmVyPiB7XG5cdFx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0XHRcdGlkOiBgJHt2aWV3RGVzY3JpcHRvci5pZH0ucmVtb3ZlVmlld2AsXG5cdFx0XHRcdFx0XHRcdHZpZXdQYW5lQ29udGFpbmVySWQ6IHZpZXdDb250YWluZXJNb2RlbC52aWV3Q29udGFpbmVyLmlkLFxuXHRcdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2hpZGVWaWV3JywgXCJIaWRlICd7MH0nXCIsIHZpZXdEZXNjcmlwdG9yLm5hbWUudmFsdWUpLFxuXHRcdFx0XHRcdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZTIoJ2hpZGVWaWV3RGVzY3JpcHRpb24nLCAnSGlkZXMgdGhlIHswfSB2aWV3IGlmIGl0IGlzIHZpc2libGUgYW5kIHRoZSB2aWV3IGNvbnRhaW5lciBpdCBpcyBsb2NhdGVkIGluIGlzIHZpc2libGUnLCB2aWV3RGVzY3JpcHRvci5uYW1lLnZhbHVlKVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRwcmVjb25kaXRpb246IHZpZXdEZXNjcmlwdG9yLmNhblRvZ2dsZVZpc2liaWxpdHkgJiYgKCF2aWV3Q29udGFpbmVyTW9kZWwuaXNWaXNpYmxlKHZpZXdEZXNjcmlwdG9yLmlkKSB8fCB2aWV3Q29udGFpbmVyTW9kZWwudmlzaWJsZVZpZXdEZXNjcmlwdG9ycy5sZW5ndGggPiAxKSA/IENvbnRleHRLZXlFeHByLnRydWUoKSA6IENvbnRleHRLZXlFeHByLmZhbHNlKCksXG5cdFx0XHRcdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGVDb250ZXh0LFxuXHRcdFx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIHZpZXdEZXNjcmlwdG9yLmlkKSxcblx0XHRcdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmhhcyhgJHt2aWV3RGVzY3JpcHRvci5pZH0udmlzaWJsZWApLFxuXHRcdFx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHRcdFx0Z3JvdXA6ICcxX2hpZGUnLFxuXHRcdFx0XHRcdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YXN5bmMgcnVuSW5WaWV3UGFuZUNvbnRhaW5lcihzZXJ2aWNlQWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXdQYW5lQ29udGFpbmVyOiBWaWV3UGFuZUNvbnRhaW5lcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdFx0aWYgKHZpZXdQYW5lQ29udGFpbmVyLmdldFZpZXcodmlld0Rlc2NyaXB0b3IuaWQpPy5pc1Zpc2libGUoKSkge1xuXHRcdFx0XHRcdFx0XHR2aWV3UGFuZUNvbnRhaW5lci50b2dnbGVWaWV3VmlzaWJpbGl0eSh2aWV3RGVzY3JpcHRvci5pZCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclJlc2V0Vmlld0NvbnRhaW5lckFjdGlvbih2aWV3Q29udGFpbmVyOiBWaWV3Q29udGFpbmVyKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHJldHVybiByZWdpc3RlckFjdGlvbjIoY2xhc3MgUmVzZXRWaWV3TG9jYXRpb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IGAke3ZpZXdDb250YWluZXIuaWR9LnJlc2V0Vmlld0NvbnRhaW5lckxvY2F0aW9uYCxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdyZXNldFZpZXdMb2NhdGlvbicsIFwiUmVzZXQgTG9jYXRpb25cIiksXG5cdFx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuVmlld0NvbnRhaW5lclRpdGxlQ29udGV4dCxcblx0XHRcdFx0XHRcdGdyb3VwOiAnMV92aWV3QWN0aW9ucycsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygndmlld0NvbnRhaW5lcicsIHZpZXdDb250YWluZXIuaWQpLFxuXHRcdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhgJHt2aWV3Q29udGFpbmVyLmlkfS5kZWZhdWx0Vmlld0NvbnRhaW5lckxvY2F0aW9uYCwgZmFsc2UpXG5cdFx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRcdFx0dGhhdC5tb3ZlVmlld0NvbnRhaW5lclRvTG9jYXRpb24odmlld0NvbnRhaW5lciwgdGhhdC5nZXREZWZhdWx0Vmlld0NvbnRhaW5lckxvY2F0aW9uKHZpZXdDb250YWluZXIpLCB1bmRlZmluZWQsIHRoaXMuZGVzYy5pZCk7XG5cdFx0XHRcdGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKS5vcGVuVmlld0NvbnRhaW5lcih2aWV3Q29udGFpbmVyLmlkLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYWRkVmlld3MoY29udGFpbmVyOiBWaWV3Q29udGFpbmVyLCB2aWV3czogSVZpZXdEZXNjcmlwdG9yW10sIHZpc2liaWxpdHlTdGF0ZTogVmlld1Zpc2liaWxpdHlTdGF0ZSA9IFZpZXdWaXNpYmlsaXR5U3RhdGUuRGVmYXVsdCk6IHZvaWQge1xuXHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UuYnVmZmVyQ2hhbmdlRXZlbnRzKCgpID0+IHtcblx0XHRcdHZpZXdzLmZvckVhY2godmlldyA9PiB7XG5cdFx0XHRcdGNvbnN0IGlzRGVmYXVsdENvbnRhaW5lciA9IHRoaXMuZ2V0RGVmYXVsdENvbnRhaW5lckJ5SWQodmlldy5pZCkgPT09IGNvbnRhaW5lcjtcblx0XHRcdFx0dGhpcy5nZXRPckNyZWF0ZURlZmF1bHRWaWV3TG9jYXRpb25Db250ZXh0S2V5KHZpZXcpLnNldChpc0RlZmF1bHRDb250YWluZXIpO1xuXHRcdFx0XHRpZiAoaXNEZWZhdWx0Q29udGFpbmVyKSB7XG5cdFx0XHRcdFx0dGhpcy52aWV3RGVzY3JpcHRvcnNDdXN0b21Mb2NhdGlvbnMuZGVsZXRlKHZpZXcuaWQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMudmlld0Rlc2NyaXB0b3JzQ3VzdG9tTG9jYXRpb25zLnNldCh2aWV3LmlkLCBjb250YWluZXIuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRoaXMuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKGNvbnRhaW5lcikuYWRkKHZpZXdzLm1hcCh2aWV3ID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHZpZXdEZXNjcmlwdG9yOiB2aWV3LFxuXHRcdFx0XHRjb2xsYXBzZWQ6IHZpc2liaWxpdHlTdGF0ZSA9PT0gVmlld1Zpc2liaWxpdHlTdGF0ZS5EZWZhdWx0ID8gdW5kZWZpbmVkIDogZmFsc2UsXG5cdFx0XHRcdHZpc2libGU6IHZpc2liaWxpdHlTdGF0ZSA9PT0gVmlld1Zpc2liaWxpdHlTdGF0ZS5EZWZhdWx0ID8gdW5kZWZpbmVkIDogdHJ1ZVxuXHRcdFx0fTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbW92ZVZpZXdzKGNvbnRhaW5lcjogVmlld0NvbnRhaW5lciwgdmlld3M6IElWaWV3RGVzY3JpcHRvcltdKTogdm9pZCB7XG5cdFx0Ly8gU2V0IHZpZXcgZGVmYXVsdCBsb2NhdGlvbiBrZXlzIHRvIGZhbHNlXG5cdFx0dGhpcy5jb250ZXh0S2V5U2VydmljZS5idWZmZXJDaGFuZ2VFdmVudHMoKCkgPT4ge1xuXHRcdFx0dmlld3MuZm9yRWFjaCh2aWV3ID0+IHtcblx0XHRcdFx0aWYgKHRoaXMudmlld0Rlc2NyaXB0b3JzQ3VzdG9tTG9jYXRpb25zLmdldCh2aWV3LmlkKSA9PT0gY29udGFpbmVyLmlkKSB7XG5cdFx0XHRcdFx0dGhpcy52aWV3RGVzY3JpcHRvcnNDdXN0b21Mb2NhdGlvbnMuZGVsZXRlKHZpZXcuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuZ2V0T3JDcmVhdGVEZWZhdWx0Vmlld0xvY2F0aW9uQ29udGV4dEtleSh2aWV3KS5zZXQoZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHQvLyBSZW1vdmUgdGhlIHZpZXdzXG5cdFx0dGhpcy5nZXRWaWV3Q29udGFpbmVyTW9kZWwoY29udGFpbmVyKS5yZW1vdmUodmlld3MpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRPckNyZWF0ZUFjdGl2ZVZpZXdDb250ZXh0S2V5KHZpZXdEZXNjcmlwdG9yOiBJVmlld0Rlc2NyaXB0b3IpOiBJQ29udGV4dEtleTxib29sZWFuPiB7XG5cdFx0Y29uc3QgYWN0aXZlQ29udGV4dEtleUlkID0gYCR7dmlld0Rlc2NyaXB0b3IuaWR9LmFjdGl2ZWA7XG5cdFx0bGV0IGNvbnRleHRLZXkgPSB0aGlzLmFjdGl2ZVZpZXdDb250ZXh0S2V5cy5nZXQoYWN0aXZlQ29udGV4dEtleUlkKTtcblx0XHRpZiAoIWNvbnRleHRLZXkpIHtcblx0XHRcdGNvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleShhY3RpdmVDb250ZXh0S2V5SWQsIGZhbHNlKS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHR0aGlzLmFjdGl2ZVZpZXdDb250ZXh0S2V5cy5zZXQoYWN0aXZlQ29udGV4dEtleUlkLCBjb250ZXh0S2V5KTtcblx0XHR9XG5cdFx0cmV0dXJuIGNvbnRleHRLZXk7XG5cdH1cblxuXHRwcml2YXRlIGdldE9yQ3JlYXRlVmlzaWJsZVZpZXdDb250ZXh0S2V5KHZpZXdEZXNjcmlwdG9yOiBJVmlld0Rlc2NyaXB0b3IpOiBJQ29udGV4dEtleTxib29sZWFuPiB7XG5cdFx0Y29uc3QgYWN0aXZlQ29udGV4dEtleUlkID0gYCR7dmlld0Rlc2NyaXB0b3IuaWR9LnZpc2libGVgO1xuXHRcdGxldCBjb250ZXh0S2V5ID0gdGhpcy5hY3RpdmVWaWV3Q29udGV4dEtleXMuZ2V0KGFjdGl2ZUNvbnRleHRLZXlJZCk7XG5cdFx0aWYgKCFjb250ZXh0S2V5KSB7XG5cdFx0XHRjb250ZXh0S2V5ID0gbmV3IFJhd0NvbnRleHRLZXkoYWN0aXZlQ29udGV4dEtleUlkLCBmYWxzZSkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0dGhpcy5hY3RpdmVWaWV3Q29udGV4dEtleXMuc2V0KGFjdGl2ZUNvbnRleHRLZXlJZCwgY29udGV4dEtleSk7XG5cdFx0fVxuXHRcdHJldHVybiBjb250ZXh0S2V5O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRPckNyZWF0ZU1vdmFibGVWaWV3Q29udGV4dEtleSh2aWV3RGVzY3JpcHRvcjogSVZpZXdEZXNjcmlwdG9yKTogSUNvbnRleHRLZXk8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IG1vdmFibGVWaWV3Q29udGV4dEtleUlkID0gYCR7dmlld0Rlc2NyaXB0b3IuaWR9LmNhbk1vdmVgO1xuXHRcdGxldCBjb250ZXh0S2V5ID0gdGhpcy5tb3ZhYmxlVmlld0NvbnRleHRLZXlzLmdldChtb3ZhYmxlVmlld0NvbnRleHRLZXlJZCk7XG5cdFx0aWYgKCFjb250ZXh0S2V5KSB7XG5cdFx0XHRjb250ZXh0S2V5ID0gbmV3IFJhd0NvbnRleHRLZXkobW92YWJsZVZpZXdDb250ZXh0S2V5SWQsIGZhbHNlKS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHR0aGlzLm1vdmFibGVWaWV3Q29udGV4dEtleXMuc2V0KG1vdmFibGVWaWV3Q29udGV4dEtleUlkLCBjb250ZXh0S2V5KTtcblx0XHR9XG5cdFx0cmV0dXJuIGNvbnRleHRLZXk7XG5cdH1cblxuXHRwcml2YXRlIGdldE9yQ3JlYXRlRGVmYXVsdFZpZXdMb2NhdGlvbkNvbnRleHRLZXkodmlld0Rlc2NyaXB0b3I6IElWaWV3RGVzY3JpcHRvcik6IElDb250ZXh0S2V5PGJvb2xlYW4+IHtcblx0XHRjb25zdCBkZWZhdWx0Vmlld0xvY2F0aW9uQ29udGV4dEtleUlkID0gYCR7dmlld0Rlc2NyaXB0b3IuaWR9LmRlZmF1bHRWaWV3TG9jYXRpb25gO1xuXHRcdGxldCBjb250ZXh0S2V5ID0gdGhpcy5kZWZhdWx0Vmlld0xvY2F0aW9uQ29udGV4dEtleXMuZ2V0KGRlZmF1bHRWaWV3TG9jYXRpb25Db250ZXh0S2V5SWQpO1xuXHRcdGlmICghY29udGV4dEtleSkge1xuXHRcdFx0Y29udGV4dEtleSA9IG5ldyBSYXdDb250ZXh0S2V5KGRlZmF1bHRWaWV3TG9jYXRpb25Db250ZXh0S2V5SWQsIGZhbHNlKS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHR0aGlzLmRlZmF1bHRWaWV3TG9jYXRpb25Db250ZXh0S2V5cy5zZXQoZGVmYXVsdFZpZXdMb2NhdGlvbkNvbnRleHRLZXlJZCwgY29udGV4dEtleSk7XG5cdFx0fVxuXHRcdHJldHVybiBjb250ZXh0S2V5O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRPckNyZWF0ZURlZmF1bHRWaWV3Q29udGFpbmVyTG9jYXRpb25Db250ZXh0S2V5KHZpZXdDb250YWluZXI6IFZpZXdDb250YWluZXIpOiBJQ29udGV4dEtleTxib29sZWFuPiB7XG5cdFx0Y29uc3QgZGVmYXVsdFZpZXdDb250YWluZXJMb2NhdGlvbkNvbnRleHRLZXlJZCA9IGAke3ZpZXdDb250YWluZXIuaWR9LmRlZmF1bHRWaWV3Q29udGFpbmVyTG9jYXRpb25gO1xuXHRcdGxldCBjb250ZXh0S2V5ID0gdGhpcy5kZWZhdWx0Vmlld0NvbnRhaW5lckxvY2F0aW9uQ29udGV4dEtleXMuZ2V0KGRlZmF1bHRWaWV3Q29udGFpbmVyTG9jYXRpb25Db250ZXh0S2V5SWQpO1xuXHRcdGlmICghY29udGV4dEtleSkge1xuXHRcdFx0Y29udGV4dEtleSA9IG5ldyBSYXdDb250ZXh0S2V5KGRlZmF1bHRWaWV3Q29udGFpbmVyTG9jYXRpb25Db250ZXh0S2V5SWQsIGZhbHNlKS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHR0aGlzLmRlZmF1bHRWaWV3Q29udGFpbmVyTG9jYXRpb25Db250ZXh0S2V5cy5zZXQoZGVmYXVsdFZpZXdDb250YWluZXJMb2NhdGlvbkNvbnRleHRLZXlJZCwgY29udGV4dEtleSk7XG5cdFx0fVxuXHRcdHJldHVybiBjb250ZXh0S2V5O1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIFZpZXdEZXNjcmlwdG9yU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUu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
