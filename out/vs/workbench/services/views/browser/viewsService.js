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
import { Disposable, toDisposable, DisposableStore, DisposableMap } from "../../../../base/common/lifecycle.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../common/views.js";
import { FocusedViewContext, getVisbileViewContextKey } from "../../../common/contextkeys.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { isString } from "../../../../base/common/types.js";
import { MenuId, registerAction2, Action2, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { localize, localize2 } from "../../../../nls.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { PaneCompositeDescriptor, PaneComposite } from "../../../browser/panecomposite.js";
import { IWorkbenchLayoutService, Parts } from "../../layout/browser/layoutService.js";
import { URI } from "../../../../base/common/uri.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { IEditorGroupsService } from "../../editor/common/editorGroupsService.js";
import { FilterViewPaneContainer } from "../../../browser/parts/views/viewsViewlet.js";
import { IPaneCompositePartService } from "../../panecomposite/browser/panecomposite.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { IViewsService } from "../common/viewsService.js";
let ViewsService = class extends Disposable {
  constructor(viewDescriptorService, paneCompositeService, contextKeyService, layoutService, editorService) {
    super();
    this.viewDescriptorService = viewDescriptorService;
    this.paneCompositeService = paneCompositeService;
    this.contextKeyService = contextKeyService;
    this.layoutService = layoutService;
    this.editorService = editorService;
    this._onDidChangeViewVisibility = this._register(new Emitter());
    this.onDidChangeViewVisibility = this._onDidChangeViewVisibility.event;
    this._onDidChangeViewContainerVisibility = this._register(new Emitter());
    this.onDidChangeViewContainerVisibility = this._onDidChangeViewContainerVisibility.event;
    this._onDidChangeFocusedView = this._register(new Emitter());
    this.onDidChangeFocusedView = this._onDidChangeFocusedView.event;
    this.viewContainerDisposables = this._register(new DisposableMap());
    this.viewDisposable = /* @__PURE__ */ new Map();
    this.enabledViewContainersContextKeys = /* @__PURE__ */ new Map();
    this.visibleViewContextKeys = /* @__PURE__ */ new Map();
    this.viewPaneContainers = /* @__PURE__ */ new Map();
    this._register(toDisposable(() => {
      this.viewDisposable.forEach((disposable) => disposable.dispose());
      this.viewDisposable.clear();
    }));
    this.viewDescriptorService.viewContainers.forEach((viewContainer) => this.onDidRegisterViewContainer(viewContainer, this.viewDescriptorService.getViewContainerLocation(viewContainer)));
    this._register(this.viewDescriptorService.onDidChangeViewContainers(({ added, removed }) => this.onDidChangeContainers(added, removed)));
    this._register(this.viewDescriptorService.onDidChangeContainerLocation(({ viewContainer, from, to }) => this.onDidChangeContainerLocation(viewContainer, from, to)));
    this._register(this.paneCompositeService.onDidPaneCompositeOpen((e) => this._onDidChangeViewContainerVisibility.fire({ id: e.composite.getId(), visible: true, location: e.viewContainerLocation })));
    this._register(this.paneCompositeService.onDidPaneCompositeClose((e) => this._onDidChangeViewContainerVisibility.fire({ id: e.composite.getId(), visible: false, location: e.viewContainerLocation })));
    this.focusedViewContextKey = FocusedViewContext.bindTo(contextKeyService);
  }
  onViewsAdded(added) {
    for (const view of added) {
      this.onViewsVisibilityChanged(view, view.isBodyVisible());
    }
  }
  onViewsVisibilityChanged(view, visible) {
    this.getOrCreateActiveViewContextKey(view).set(visible);
    this._onDidChangeViewVisibility.fire({ id: view.id, visible });
  }
  onViewsRemoved(removed) {
    for (const view of removed) {
      this.onViewsVisibilityChanged(view, false);
    }
  }
  getOrCreateActiveViewContextKey(view) {
    const visibleContextKeyId = getVisbileViewContextKey(view.id);
    let contextKey = this.visibleViewContextKeys.get(visibleContextKeyId);
    if (!contextKey) {
      contextKey = new RawContextKey(visibleContextKeyId, false).bindTo(this.contextKeyService);
      this.visibleViewContextKeys.set(visibleContextKeyId, contextKey);
    }
    return contextKey;
  }
  onDidChangeContainers(added, removed) {
    for (const { container, location } of removed) {
      this.onDidDeregisterViewContainer(container, location);
    }
    for (const { container, location } of added) {
      this.onDidRegisterViewContainer(container, location);
    }
  }
  onDidRegisterViewContainer(viewContainer, viewContainerLocation) {
    this.registerPaneComposite(viewContainer, viewContainerLocation);
    const disposables = new DisposableStore();
    const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
    this.onViewDescriptorsAdded(viewContainerModel.allViewDescriptors, viewContainer);
    disposables.add(viewContainerModel.onDidChangeAllViewDescriptors(({ added, removed }) => {
      this.onViewDescriptorsAdded(added, viewContainer);
      this.onViewDescriptorsRemoved(removed);
    }));
    this.updateViewContainerEnablementContextKey(viewContainer);
    disposables.add(viewContainerModel.onDidChangeActiveViewDescriptors(() => this.updateViewContainerEnablementContextKey(viewContainer)));
    disposables.add(this.registerOpenViewContainerAction(viewContainer));
    this.viewContainerDisposables.set(viewContainer.id, disposables);
  }
  onDidDeregisterViewContainer(viewContainer, viewContainerLocation) {
    this.deregisterPaneComposite(viewContainer, viewContainerLocation);
    this.viewContainerDisposables.deleteAndDispose(viewContainer.id);
  }
  onDidChangeContainerLocation(viewContainer, from, to) {
    this.deregisterPaneComposite(viewContainer, from);
    this.registerPaneComposite(viewContainer, to);
    if (this.layoutService.isVisible(this.paneCompositeService.getPartId(to)) && this.viewDescriptorService.getViewContainersByLocation(to).filter((vc) => this.isViewContainerActive(vc.id)).length === 1) {
      this.openViewContainer(viewContainer.id);
    }
  }
  onViewDescriptorsAdded(views, container) {
    const location = this.viewDescriptorService.getViewContainerLocation(container);
    if (location === null) {
      return;
    }
    for (const viewDescriptor of views) {
      const disposables = new DisposableStore();
      disposables.add(this.registerOpenViewAction(viewDescriptor));
      disposables.add(this.registerFocusViewAction(viewDescriptor, container.title));
      disposables.add(this.registerResetViewLocationAction(viewDescriptor));
      this.viewDisposable.set(viewDescriptor, disposables);
    }
  }
  onViewDescriptorsRemoved(views) {
    for (const view of views) {
      const disposable = this.viewDisposable.get(view);
      if (disposable) {
        disposable.dispose();
        this.viewDisposable.delete(view);
      }
    }
  }
  updateViewContainerEnablementContextKey(viewContainer) {
    let contextKey = this.enabledViewContainersContextKeys.get(viewContainer.id);
    if (!contextKey) {
      contextKey = this.contextKeyService.createKey(getEnabledViewContainerContextKey(viewContainer.id), false);
      this.enabledViewContainersContextKeys.set(viewContainer.id, contextKey);
    }
    contextKey.set(!(viewContainer.hideIfEmpty && this.viewDescriptorService.getViewContainerModel(viewContainer).activeViewDescriptors.length === 0));
  }
  async openComposite(compositeId, location, focus) {
    return this.paneCompositeService.openPaneComposite(compositeId, location, focus);
  }
  getComposite(compositeId, location) {
    return this.paneCompositeService.getPaneComposite(compositeId, location);
  }
  // One view container can be visible at a time in a location
  isViewContainerVisible(id) {
    const viewContainer = this.viewDescriptorService.getViewContainerById(id);
    if (!viewContainer) {
      return false;
    }
    const viewContainerLocation = this.viewDescriptorService.getViewContainerLocation(viewContainer);
    if (viewContainerLocation === null) {
      return false;
    }
    return this.paneCompositeService.getActivePaneComposite(viewContainerLocation)?.getId() === id;
  }
  // Multiple view containers can be active/inactive at a time in a location
  isViewContainerActive(id) {
    const viewContainer = this.viewDescriptorService.getViewContainerById(id);
    if (!viewContainer) {
      return false;
    }
    if (!viewContainer.hideIfEmpty) {
      return true;
    }
    return this.viewDescriptorService.getViewContainerModel(viewContainer).activeViewDescriptors.length > 0;
  }
  getVisibleViewContainer(location) {
    const viewContainerId = this.paneCompositeService.getActivePaneComposite(location)?.getId();
    return viewContainerId ? this.viewDescriptorService.getViewContainerById(viewContainerId) : null;
  }
  getActiveViewPaneContainerWithId(viewContainerId) {
    const viewContainer = this.viewDescriptorService.getViewContainerById(viewContainerId);
    return viewContainer ? this.getActiveViewPaneContainer(viewContainer) : null;
  }
  async openViewContainer(id, focus) {
    const viewContainer = this.viewDescriptorService.getViewContainerById(id);
    if (viewContainer) {
      const viewContainerLocation = this.viewDescriptorService.getViewContainerLocation(viewContainer);
      if (viewContainerLocation !== null) {
        const paneComposite = await this.paneCompositeService.openPaneComposite(id, viewContainerLocation, focus);
        return paneComposite || null;
      }
    }
    return null;
  }
  async closeViewContainer(id) {
    const viewContainer = this.viewDescriptorService.getViewContainerById(id);
    if (viewContainer) {
      const viewContainerLocation = this.viewDescriptorService.getViewContainerLocation(viewContainer);
      const isActive = viewContainerLocation !== null && this.paneCompositeService.getActivePaneComposite(viewContainerLocation);
      if (viewContainerLocation !== null) {
        return isActive ? this.layoutService.setPartHidden(true, this.paneCompositeService.getPartId(viewContainerLocation)) : void 0;
      }
    }
  }
  isViewVisible(id) {
    const activeView = this.getActiveViewWithId(id);
    return activeView?.isBodyVisible() || false;
  }
  getActiveViewWithId(id) {
    const viewContainer = this.viewDescriptorService.getViewContainerByViewId(id);
    if (viewContainer) {
      const activeViewPaneContainer = this.getActiveViewPaneContainer(viewContainer);
      if (activeViewPaneContainer) {
        return activeViewPaneContainer.getView(id);
      }
    }
    return null;
  }
  getViewWithId(id) {
    const viewContainer = this.viewDescriptorService.getViewContainerByViewId(id);
    if (viewContainer) {
      const viewPaneContainer = this.viewPaneContainers.get(viewContainer.id);
      if (viewPaneContainer) {
        return viewPaneContainer.getView(id);
      }
    }
    return null;
  }
  getFocusedView() {
    const viewId = this.contextKeyService.getContextKeyValue(FocusedViewContext.key) ?? "";
    return this.viewDescriptorService.getViewDescriptorById(viewId.toString());
  }
  getFocusedViewName() {
    const textEditorFocused = this.editorService.activeTextEditorControl?.hasTextFocus() ? localize("editor", "Text Editor") : void 0;
    return this.getFocusedView()?.name?.value ?? textEditorFocused ?? "";
  }
  async openView(id, focus) {
    const viewContainer = this.viewDescriptorService.getViewContainerByViewId(id);
    if (!viewContainer) {
      return null;
    }
    if (!this.viewDescriptorService.getViewContainerModel(viewContainer).activeViewDescriptors.some((viewDescriptor) => viewDescriptor.id === id)) {
      return null;
    }
    const location = this.viewDescriptorService.getViewContainerLocation(viewContainer);
    const compositeDescriptor = this.getComposite(viewContainer.id, location);
    if (compositeDescriptor) {
      const paneComposite = await this.openComposite(compositeDescriptor.id, location);
      if (paneComposite?.openView) {
        return paneComposite.openView(id, focus) || null;
      } else if (focus) {
        paneComposite?.focus();
      }
    }
    return null;
  }
  closeView(id) {
    const viewContainer = this.viewDescriptorService.getViewContainerByViewId(id);
    if (viewContainer) {
      const activeViewPaneContainer = this.getActiveViewPaneContainer(viewContainer);
      if (activeViewPaneContainer) {
        const view = activeViewPaneContainer.getView(id);
        if (view) {
          if (activeViewPaneContainer.views.length === 1) {
            const location = this.viewDescriptorService.getViewContainerLocation(viewContainer);
            if (location === ViewContainerLocation.Sidebar) {
              this.layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
            } else if (location === ViewContainerLocation.Panel || location === ViewContainerLocation.AuxiliaryBar) {
              this.paneCompositeService.hideActivePaneComposite(location);
            }
            if (this.focusedViewContextKey.get() === id) {
              this.focusedViewContextKey.reset();
            }
          } else {
            view.setExpanded(false);
          }
        }
      }
    }
  }
  getActiveViewPaneContainer(viewContainer) {
    const location = this.viewDescriptorService.getViewContainerLocation(viewContainer);
    if (location === null) {
      return null;
    }
    const activePaneComposite = this.paneCompositeService.getActivePaneComposite(location);
    if (activePaneComposite?.getId() === viewContainer.id) {
      return activePaneComposite.getViewPaneContainer() || null;
    }
    return null;
  }
  getViewProgressIndicator(viewId) {
    const viewContainer = this.viewDescriptorService.getViewContainerByViewId(viewId);
    if (!viewContainer) {
      return void 0;
    }
    const viewPaneContainer = this.viewPaneContainers.get(viewContainer.id);
    if (!viewPaneContainer) {
      return void 0;
    }
    const view = viewPaneContainer.getView(viewId);
    if (!view) {
      return void 0;
    }
    if (viewPaneContainer.isViewMergedWithContainer()) {
      return this.getViewContainerProgressIndicator(viewContainer);
    }
    return view.getProgressIndicator();
  }
  getViewContainerProgressIndicator(viewContainer) {
    const viewContainerLocation = this.viewDescriptorService.getViewContainerLocation(viewContainer);
    if (viewContainerLocation === null) {
      return void 0;
    }
    return this.paneCompositeService.getProgressIndicator(viewContainer.id, viewContainerLocation);
  }
  registerOpenViewContainerAction(viewContainer) {
    const disposables = new DisposableStore();
    if (viewContainer.openCommandActionDescriptor) {
      const { id, mnemonicTitle, keybindings, order } = viewContainer.openCommandActionDescriptor ?? { id: viewContainer.id };
      const title = viewContainer.openCommandActionDescriptor.title ?? viewContainer.title;
      const that = this;
      disposables.add(registerAction2(class OpenViewContainerAction extends Action2 {
        constructor() {
          super({
            id,
            get title() {
              const viewContainerLocation = that.viewDescriptorService.getViewContainerLocation(viewContainer);
              const localizedTitle = typeof title === "string" ? title : title.value;
              const originalTitle = typeof title === "string" ? title : title.original;
              if (viewContainerLocation === ViewContainerLocation.Sidebar) {
                return { value: localize("show view", "Show {0}", localizedTitle), original: `Show ${originalTitle}` };
              } else {
                return { value: localize("toggle view", "Toggle {0}", localizedTitle), original: `Toggle ${originalTitle}` };
              }
            },
            category: Categories.View,
            precondition: ContextKeyExpr.has(getEnabledViewContainerContextKey(viewContainer.id)),
            keybinding: keybindings ? { ...keybindings, weight: KeybindingWeight.WorkbenchContrib } : void 0,
            f1: true
          });
        }
        async run(serviceAccessor) {
          const editorGroupService = serviceAccessor.get(IEditorGroupsService);
          const viewDescriptorService = serviceAccessor.get(IViewDescriptorService);
          const layoutService = serviceAccessor.get(IWorkbenchLayoutService);
          const viewsService = serviceAccessor.get(IViewsService);
          const viewContainerLocation = viewDescriptorService.getViewContainerLocation(viewContainer);
          switch (viewContainerLocation) {
            case ViewContainerLocation.AuxiliaryBar:
            case ViewContainerLocation.Sidebar: {
              const part = viewContainerLocation === ViewContainerLocation.Sidebar ? Parts.SIDEBAR_PART : Parts.AUXILIARYBAR_PART;
              if (!viewsService.isViewContainerVisible(viewContainer.id) || !layoutService.hasFocus(part)) {
                await viewsService.openViewContainer(viewContainer.id, true);
              } else {
                editorGroupService.activeGroup.focus();
              }
              break;
            }
            case ViewContainerLocation.Panel:
              if (!viewsService.isViewContainerVisible(viewContainer.id) || !layoutService.hasFocus(Parts.PANEL_PART)) {
                await viewsService.openViewContainer(viewContainer.id, true);
              } else {
                viewsService.closeViewContainer(viewContainer.id);
              }
              break;
          }
        }
      }));
      if (mnemonicTitle) {
        const defaultLocation = this.viewDescriptorService.getDefaultViewContainerLocation(viewContainer);
        disposables.add(MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
          command: {
            id,
            title: mnemonicTitle
          },
          group: defaultLocation === ViewContainerLocation.Sidebar ? "3_sidebar" : defaultLocation === ViewContainerLocation.AuxiliaryBar ? "4_auxbar" : "5_panel",
          when: ContextKeyExpr.has(getEnabledViewContainerContextKey(viewContainer.id)),
          order: order ?? Number.MAX_VALUE
        }));
      }
    }
    return disposables;
  }
  registerOpenViewAction(viewDescriptor) {
    const disposables = new DisposableStore();
    const title = viewDescriptor.openCommandActionDescriptor?.title ?? viewDescriptor.name;
    const commandId = viewDescriptor.openCommandActionDescriptor?.id ?? `${viewDescriptor.id}.open`;
    const that = this;
    disposables.add(registerAction2(class OpenViewAction extends Action2 {
      constructor() {
        super({
          id: commandId,
          get title() {
            const viewContainerLocation = that.viewDescriptorService.getViewLocationById(viewDescriptor.id);
            const localizedTitle = typeof title === "string" ? title : title.value;
            const originalTitle = typeof title === "string" ? title : title.original;
            if (viewContainerLocation === ViewContainerLocation.Sidebar) {
              return { value: localize("show view", "Show {0}", localizedTitle), original: `Show ${originalTitle}` };
            } else {
              return { value: localize("toggle view", "Toggle {0}", localizedTitle), original: `Toggle ${originalTitle}` };
            }
          },
          category: Categories.View,
          precondition: ContextKeyExpr.has(`${viewDescriptor.id}.active`),
          keybinding: viewDescriptor.openCommandActionDescriptor?.keybindings ? { ...viewDescriptor.openCommandActionDescriptor.keybindings, weight: KeybindingWeight.WorkbenchContrib } : void 0,
          f1: viewDescriptor.openCommandActionDescriptor ? true : void 0,
          metadata: {
            description: localize("open view", "Opens view {0}", viewDescriptor.name.value),
            args: [
              {
                name: "options",
                schema: {
                  type: "object",
                  properties: {
                    "preserveFocus": {
                      type: "boolean",
                      default: false,
                      description: localize("preserveFocus", "Whether to preserve the existing focus when opening the view.")
                    }
                  }
                }
              }
            ]
          }
        });
      }
      async run(serviceAccessor, options) {
        const editorGroupService = serviceAccessor.get(IEditorGroupsService);
        const viewDescriptorService = serviceAccessor.get(IViewDescriptorService);
        const layoutService = serviceAccessor.get(IWorkbenchLayoutService);
        const viewsService = serviceAccessor.get(IViewsService);
        const contextKeyService = serviceAccessor.get(IContextKeyService);
        const focusedViewId = FocusedViewContext.getValue(contextKeyService);
        if (focusedViewId === viewDescriptor.id && !options?.preserveFocus) {
          const viewLocation = viewDescriptorService.getViewLocationById(viewDescriptor.id);
          if (viewDescriptorService.getViewLocationById(viewDescriptor.id) === ViewContainerLocation.Sidebar) {
            editorGroupService.activeGroup.focus();
          } else if (viewLocation !== null) {
            layoutService.setPartHidden(true, that.paneCompositeService.getPartId(viewLocation));
          }
        } else {
          await viewsService.openView(viewDescriptor.id, !options?.preserveFocus);
        }
      }
    }));
    if (viewDescriptor.openCommandActionDescriptor?.mnemonicTitle) {
      const defaultViewContainer = this.viewDescriptorService.getDefaultContainerById(viewDescriptor.id);
      if (defaultViewContainer) {
        const defaultLocation = this.viewDescriptorService.getDefaultViewContainerLocation(defaultViewContainer);
        disposables.add(MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
          command: {
            id: commandId,
            title: viewDescriptor.openCommandActionDescriptor.mnemonicTitle
          },
          group: defaultLocation === ViewContainerLocation.Sidebar ? "3_sidebar" : defaultLocation === ViewContainerLocation.AuxiliaryBar ? "4_auxbar" : "5_panel",
          when: ContextKeyExpr.has(`${viewDescriptor.id}.active`),
          order: viewDescriptor.openCommandActionDescriptor.order ?? Number.MAX_VALUE
        }));
      }
    }
    return disposables;
  }
  registerFocusViewAction(viewDescriptor, category) {
    return registerAction2(class FocusViewAction extends Action2 {
      constructor() {
        const title = localize2({ key: "focus view", comment: ["{0} indicates the name of the view to be focused."] }, "Focus on {0} View", viewDescriptor.name.value);
        super({
          id: viewDescriptor.focusCommand ? viewDescriptor.focusCommand.id : `${viewDescriptor.id}.focus`,
          title,
          category,
          menu: [{
            id: MenuId.CommandPalette,
            when: viewDescriptor.when
          }],
          keybinding: {
            when: ContextKeyExpr.has(`${viewDescriptor.id}.active`),
            weight: KeybindingWeight.WorkbenchContrib,
            primary: viewDescriptor.focusCommand?.keybindings?.primary,
            secondary: viewDescriptor.focusCommand?.keybindings?.secondary,
            linux: viewDescriptor.focusCommand?.keybindings?.linux,
            mac: viewDescriptor.focusCommand?.keybindings?.mac,
            win: viewDescriptor.focusCommand?.keybindings?.win
          },
          metadata: {
            description: title.value,
            args: [
              {
                name: "focusOptions",
                description: "Focus Options",
                schema: {
                  type: "object",
                  properties: {
                    "preserveFocus": {
                      type: "boolean",
                      default: false
                    }
                  }
                }
              }
            ]
          }
        });
      }
      run(accessor, options) {
        accessor.get(IViewsService).openView(viewDescriptor.id, !options?.preserveFocus);
      }
    });
  }
  registerResetViewLocationAction(viewDescriptor) {
    return registerAction2(class ResetViewLocationAction extends Action2 {
      constructor() {
        super({
          id: `${viewDescriptor.id}.resetViewLocation`,
          title: localize2("resetViewLocation", "Reset Location"),
          menu: [{
            id: MenuId.ViewTitleContext,
            when: ContextKeyExpr.or(
              ContextKeyExpr.and(
                ContextKeyExpr.equals("view", viewDescriptor.id),
                ContextKeyExpr.equals(`${viewDescriptor.id}.defaultViewLocation`, false)
              )
            ),
            group: "1_hide",
            order: 2
          }]
        });
      }
      run(accessor) {
        const viewDescriptorService = accessor.get(IViewDescriptorService);
        const defaultContainer = viewDescriptorService.getDefaultContainerById(viewDescriptor.id);
        const containerModel = viewDescriptorService.getViewContainerModel(defaultContainer);
        if (defaultContainer.hideIfEmpty && containerModel.visibleViewDescriptors.length === 0) {
          const defaultLocation = viewDescriptorService.getDefaultViewContainerLocation(defaultContainer);
          viewDescriptorService.moveViewContainerToLocation(defaultContainer, defaultLocation, void 0, this.desc.id);
        }
        viewDescriptorService.moveViewsToContainer([viewDescriptor], defaultContainer, void 0, this.desc.id);
        accessor.get(IViewsService).openView(viewDescriptor.id, true);
      }
    });
  }
  registerPaneComposite(viewContainer, viewContainerLocation) {
    const that = this;
    let PaneContainer = class extends PaneComposite {
      constructor(telemetryService, contextService, storageService, instantiationService, themeService, contextMenuService, extensionService) {
        super(viewContainer.id, telemetryService, storageService, instantiationService, themeService, contextMenuService, extensionService, contextService);
      }
      createViewPaneContainer(element) {
        const viewPaneContainerDisposables = this._register(new DisposableStore());
        const viewPaneContainer = that.createViewPaneContainer(element, viewContainer, viewContainerLocation, viewPaneContainerDisposables, this.instantiationService);
        if (!(viewPaneContainer instanceof FilterViewPaneContainer)) {
          viewPaneContainerDisposables.add(Event.any(viewPaneContainer.onDidAddViews, viewPaneContainer.onDidRemoveViews, viewPaneContainer.onTitleAreaUpdate)(() => {
            this.updateTitleArea();
          }));
        }
        return viewPaneContainer;
      }
    };
    PaneContainer = __decorateClass([
      __decorateParam(0, ITelemetryService),
      __decorateParam(1, IWorkspaceContextService),
      __decorateParam(2, IStorageService),
      __decorateParam(3, IInstantiationService),
      __decorateParam(4, IThemeService),
      __decorateParam(5, IContextMenuService),
      __decorateParam(6, IExtensionService)
    ], PaneContainer);
    Registry.as(this.paneCompositeService.getRegistryId(viewContainerLocation)).registerPaneComposite(PaneCompositeDescriptor.create(
      PaneContainer,
      viewContainer.id,
      typeof viewContainer.title === "string" ? viewContainer.title : viewContainer.title.value,
      isString(viewContainer.icon) ? viewContainer.icon : void 0,
      viewContainer.order,
      viewContainer.requestedIndex,
      viewContainer.icon instanceof URI ? viewContainer.icon : void 0
    ));
  }
  deregisterPaneComposite(viewContainer, viewContainerLocation) {
    Registry.as(this.paneCompositeService.getRegistryId(viewContainerLocation)).deregisterPaneComposite(viewContainer.id);
  }
  createViewPaneContainer(element, viewContainer, viewContainerLocation, disposables, instantiationService) {
    const viewPaneContainer = instantiationService.createInstance(viewContainer.ctorDescriptor.ctor, ...viewContainer.ctorDescriptor.staticArguments || []);
    this.viewPaneContainers.set(viewPaneContainer.getId(), viewPaneContainer);
    disposables.add(toDisposable(() => this.viewPaneContainers.delete(viewPaneContainer.getId())));
    disposables.add(viewPaneContainer.onDidAddViews((views) => this.onViewsAdded(views)));
    disposables.add(viewPaneContainer.onDidChangeViewVisibility((view) => this.onViewsVisibilityChanged(view, view.isBodyVisible())));
    disposables.add(viewPaneContainer.onDidRemoveViews((views) => this.onViewsRemoved(views)));
    disposables.add(viewPaneContainer.onDidFocusView((view) => {
      if (this.focusedViewContextKey.get() !== view.id) {
        this.focusedViewContextKey.set(view.id);
        this._onDidChangeFocusedView.fire();
      }
    }));
    disposables.add(viewPaneContainer.onDidBlurView((view) => {
      if (this.focusedViewContextKey.get() === view.id) {
        this.focusedViewContextKey.reset();
        this._onDidChangeFocusedView.fire();
      }
    }));
    return viewPaneContainer;
  }
};
ViewsService = __decorateClass([
  __decorateParam(0, IViewDescriptorService),
  __decorateParam(1, IPaneCompositePartService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IWorkbenchLayoutService),
  __decorateParam(4, IEditorService)
], ViewsService);
function getEnabledViewContainerContextKey(viewContainerId) {
  return `viewContainer.${viewContainerId}.enabled`;
}
registerSingleton(
  IViewsService,
  ViewsService,
  InstantiationType.Eager
  /* Eager because it registers viewlets and panels in the constructor which are required during workbench layout */
);
export {
  ViewsService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx2aWV3c1xcYnJvd3Nlclxcdmlld3NTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBEaXNwb3NhYmxlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIFZpZXdDb250YWluZXIsIElWaWV3RGVzY3JpcHRvciwgSVZpZXcsIFZpZXdDb250YWluZXJMb2NhdGlvbiwgSVZpZXdQYW5lQ29udGFpbmVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IEZvY3VzZWRWaWV3Q29udGV4dCwgZ2V0VmlzYmlsZVZpZXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiwgQWN0aW9uMiwgTWVudVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVBhbmVDb21wb3NpdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGFuZWNvbXBvc2l0ZS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yLCBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFZpZXdQYW5lQ29udGFpbmVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZUNvbnRhaW5lci5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBQYW5lQ29tcG9zaXRlRGVzY3JpcHRvciwgUGFuZUNvbXBvc2l0ZVJlZ2lzdHJ5LCBQYW5lQ29tcG9zaXRlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYW5lY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBQYXJ0cyB9IGZyb20gJy4uLy4uL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc0luZGljYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEZpbHRlclZpZXdQYW5lQ29udGFpbmVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3c1ZpZXdsZXQuanMnO1xuaW1wb3J0IHsgSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSB9IGZyb20gJy4uLy4uL3BhbmVjb21wb3NpdGUvYnJvd3Nlci9wYW5lY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IElDb21tYW5kQWN0aW9uVGl0bGUsIElMb2NhbGl6ZWRTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBWaWV3c1NlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVZpZXdzU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSB2aWV3RGlzcG9zYWJsZTogTWFwPElWaWV3RGVzY3JpcHRvciwgSURpc3Bvc2FibGU+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHZpZXdQYW5lQ29udGFpbmVyczogTWFwPHN0cmluZywgVmlld1BhbmVDb250YWluZXI+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVmlld1Zpc2liaWxpdHk6IEVtaXR0ZXI8eyBpZDogc3RyaW5nOyB2aXNpYmxlOiBib29sZWFuIH0+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBpZDogc3RyaW5nOyB2aXNpYmxlOiBib29sZWFuIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZpZXdWaXNpYmlsaXR5OiBFdmVudDx7IGlkOiBzdHJpbmc7IHZpc2libGU6IGJvb2xlYW4gfT4gPSB0aGlzLl9vbkRpZENoYW5nZVZpZXdWaXNpYmlsaXR5LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVmlld0NvbnRhaW5lclZpc2liaWxpdHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGlkOiBzdHJpbmc7IHZpc2libGU6IGJvb2xlYW47IGxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24gfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlld0NvbnRhaW5lclZpc2liaWxpdHkgPSB0aGlzLl9vbkRpZENoYW5nZVZpZXdDb250YWluZXJWaXNpYmlsaXR5LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRm9jdXNlZFZpZXcgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGb2N1c2VkVmlldyA9IHRoaXMuX29uRGlkQ2hhbmdlRm9jdXNlZFZpZXcuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSB2aWV3Q29udGFpbmVyRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcCgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBlbmFibGVkVmlld0NvbnRhaW5lcnNDb250ZXh0S2V5czogTWFwPHN0cmluZywgSUNvbnRleHRLZXk8Ym9vbGVhbj4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHZpc2libGVWaWV3Q29udGV4dEtleXM6IE1hcDxzdHJpbmcsIElDb250ZXh0S2V5PGJvb2xlYW4+Pjtcblx0cHJpdmF0ZSByZWFkb25seSBmb2N1c2VkVmlld0NvbnRleHRLZXk6IElDb250ZXh0S2V5PHN0cmluZz47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwYW5lQ29tcG9zaXRlU2VydmljZTogSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy52aWV3RGlzcG9zYWJsZSA9IG5ldyBNYXA8SVZpZXdEZXNjcmlwdG9yLCBJRGlzcG9zYWJsZT4oKTtcblx0XHR0aGlzLmVuYWJsZWRWaWV3Q29udGFpbmVyc0NvbnRleHRLZXlzID0gbmV3IE1hcDxzdHJpbmcsIElDb250ZXh0S2V5PGJvb2xlYW4+PigpO1xuXHRcdHRoaXMudmlzaWJsZVZpZXdDb250ZXh0S2V5cyA9IG5ldyBNYXA8c3RyaW5nLCBJQ29udGV4dEtleTxib29sZWFuPj4oKTtcblx0XHR0aGlzLnZpZXdQYW5lQ29udGFpbmVycyA9IG5ldyBNYXA8c3RyaW5nLCBWaWV3UGFuZUNvbnRhaW5lcj4oKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLnZpZXdEaXNwb3NhYmxlLmZvckVhY2goZGlzcG9zYWJsZSA9PiBkaXNwb3NhYmxlLmRpc3Bvc2UoKSk7XG5cdFx0XHR0aGlzLnZpZXdEaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2Uudmlld0NvbnRhaW5lcnMuZm9yRWFjaCh2aWV3Q29udGFpbmVyID0+IHRoaXMub25EaWRSZWdpc3RlclZpZXdDb250YWluZXIodmlld0NvbnRhaW5lciwgdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckxvY2F0aW9uKHZpZXdDb250YWluZXIpISkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLm9uRGlkQ2hhbmdlVmlld0NvbnRhaW5lcnMoKHsgYWRkZWQsIHJlbW92ZWQgfSkgPT4gdGhpcy5vbkRpZENoYW5nZUNvbnRhaW5lcnMoYWRkZWQsIHJlbW92ZWQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2Uub25EaWRDaGFuZ2VDb250YWluZXJMb2NhdGlvbigoeyB2aWV3Q29udGFpbmVyLCBmcm9tLCB0byB9KSA9PiB0aGlzLm9uRGlkQ2hhbmdlQ29udGFpbmVyTG9jYXRpb24odmlld0NvbnRhaW5lciwgZnJvbSwgdG8pKSk7XG5cblx0XHQvLyBWaWV3IENvbnRhaW5lciBWaXNpYmlsaXR5XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5vbkRpZFBhbmVDb21wb3NpdGVPcGVuKGUgPT4gdGhpcy5fb25EaWRDaGFuZ2VWaWV3Q29udGFpbmVyVmlzaWJpbGl0eS5maXJlKHsgaWQ6IGUuY29tcG9zaXRlLmdldElkKCksIHZpc2libGU6IHRydWUsIGxvY2F0aW9uOiBlLnZpZXdDb250YWluZXJMb2NhdGlvbiB9KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2Uub25EaWRQYW5lQ29tcG9zaXRlQ2xvc2UoZSA9PiB0aGlzLl9vbkRpZENoYW5nZVZpZXdDb250YWluZXJWaXNpYmlsaXR5LmZpcmUoeyBpZDogZS5jb21wb3NpdGUuZ2V0SWQoKSwgdmlzaWJsZTogZmFsc2UsIGxvY2F0aW9uOiBlLnZpZXdDb250YWluZXJMb2NhdGlvbiB9KSkpO1xuXG5cdFx0dGhpcy5mb2N1c2VkVmlld0NvbnRleHRLZXkgPSBGb2N1c2VkVmlld0NvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgb25WaWV3c0FkZGVkKGFkZGVkOiBJVmlld1tdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCB2aWV3IG9mIGFkZGVkKSB7XG5cdFx0XHR0aGlzLm9uVmlld3NWaXNpYmlsaXR5Q2hhbmdlZCh2aWV3LCB2aWV3LmlzQm9keVZpc2libGUoKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblZpZXdzVmlzaWJpbGl0eUNoYW5nZWQodmlldzogSVZpZXcsIHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmdldE9yQ3JlYXRlQWN0aXZlVmlld0NvbnRleHRLZXkodmlldykuc2V0KHZpc2libGUpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlld1Zpc2liaWxpdHkuZmlyZSh7IGlkOiB2aWV3LmlkLCB2aXNpYmxlOiB2aXNpYmxlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBvblZpZXdzUmVtb3ZlZChyZW1vdmVkOiBJVmlld1tdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCB2aWV3IG9mIHJlbW92ZWQpIHtcblx0XHRcdHRoaXMub25WaWV3c1Zpc2liaWxpdHlDaGFuZ2VkKHZpZXcsIGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldE9yQ3JlYXRlQWN0aXZlVmlld0NvbnRleHRLZXkodmlldzogSVZpZXcpOiBJQ29udGV4dEtleTxib29sZWFuPiB7XG5cdFx0Y29uc3QgdmlzaWJsZUNvbnRleHRLZXlJZCA9IGdldFZpc2JpbGVWaWV3Q29udGV4dEtleSh2aWV3LmlkKTtcblx0XHRsZXQgY29udGV4dEtleSA9IHRoaXMudmlzaWJsZVZpZXdDb250ZXh0S2V5cy5nZXQodmlzaWJsZUNvbnRleHRLZXlJZCk7XG5cdFx0aWYgKCFjb250ZXh0S2V5KSB7XG5cdFx0XHRjb250ZXh0S2V5ID0gbmV3IFJhd0NvbnRleHRLZXkodmlzaWJsZUNvbnRleHRLZXlJZCwgZmFsc2UpLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdHRoaXMudmlzaWJsZVZpZXdDb250ZXh0S2V5cy5zZXQodmlzaWJsZUNvbnRleHRLZXlJZCwgY29udGV4dEtleSk7XG5cdFx0fVxuXHRcdHJldHVybiBjb250ZXh0S2V5O1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZUNvbnRhaW5lcnMoYWRkZWQ6IFJlYWRvbmx5QXJyYXk8eyBjb250YWluZXI6IFZpZXdDb250YWluZXI7IGxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24gfT4sIHJlbW92ZWQ6IFJlYWRvbmx5QXJyYXk8eyBjb250YWluZXI6IFZpZXdDb250YWluZXI7IGxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24gfT4pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHsgY29udGFpbmVyLCBsb2NhdGlvbiB9IG9mIHJlbW92ZWQpIHtcblx0XHRcdHRoaXMub25EaWREZXJlZ2lzdGVyVmlld0NvbnRhaW5lcihjb250YWluZXIsIGxvY2F0aW9uKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCB7IGNvbnRhaW5lciwgbG9jYXRpb24gfSBvZiBhZGRlZCkge1xuXHRcdFx0dGhpcy5vbkRpZFJlZ2lzdGVyVmlld0NvbnRhaW5lcihjb250YWluZXIsIGxvY2F0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkUmVnaXN0ZXJWaWV3Q29udGFpbmVyKHZpZXdDb250YWluZXI6IFZpZXdDb250YWluZXIsIHZpZXdDb250YWluZXJMb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5yZWdpc3RlclBhbmVDb21wb3NpdGUodmlld0NvbnRhaW5lciwgdmlld0NvbnRhaW5lckxvY2F0aW9uKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IHZpZXdDb250YWluZXJNb2RlbCA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJNb2RlbCh2aWV3Q29udGFpbmVyKTtcblx0XHR0aGlzLm9uVmlld0Rlc2NyaXB0b3JzQWRkZWQodmlld0NvbnRhaW5lck1vZGVsLmFsbFZpZXdEZXNjcmlwdG9ycywgdmlld0NvbnRhaW5lcik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHZpZXdDb250YWluZXJNb2RlbC5vbkRpZENoYW5nZUFsbFZpZXdEZXNjcmlwdG9ycygoeyBhZGRlZCwgcmVtb3ZlZCB9KSA9PiB7XG5cdFx0XHR0aGlzLm9uVmlld0Rlc2NyaXB0b3JzQWRkZWQoYWRkZWQsIHZpZXdDb250YWluZXIpO1xuXHRcdFx0dGhpcy5vblZpZXdEZXNjcmlwdG9yc1JlbW92ZWQocmVtb3ZlZCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMudXBkYXRlVmlld0NvbnRhaW5lckVuYWJsZW1lbnRDb250ZXh0S2V5KHZpZXdDb250YWluZXIpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh2aWV3Q29udGFpbmVyTW9kZWwub25EaWRDaGFuZ2VBY3RpdmVWaWV3RGVzY3JpcHRvcnMoKCkgPT4gdGhpcy51cGRhdGVWaWV3Q29udGFpbmVyRW5hYmxlbWVudENvbnRleHRLZXkodmlld0NvbnRhaW5lcikpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5yZWdpc3Rlck9wZW5WaWV3Q29udGFpbmVyQWN0aW9uKHZpZXdDb250YWluZXIpKTtcblxuXHRcdHRoaXMudmlld0NvbnRhaW5lckRpc3Bvc2FibGVzLnNldCh2aWV3Q29udGFpbmVyLmlkLCBkaXNwb3NhYmxlcyk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkRGVyZWdpc3RlclZpZXdDb250YWluZXIodmlld0NvbnRhaW5lcjogVmlld0NvbnRhaW5lciwgdmlld0NvbnRhaW5lckxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLmRlcmVnaXN0ZXJQYW5lQ29tcG9zaXRlKHZpZXdDb250YWluZXIsIHZpZXdDb250YWluZXJMb2NhdGlvbik7XG5cdFx0dGhpcy52aWV3Q29udGFpbmVyRGlzcG9zYWJsZXMuZGVsZXRlQW5kRGlzcG9zZSh2aWV3Q29udGFpbmVyLmlkKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VDb250YWluZXJMb2NhdGlvbih2aWV3Q29udGFpbmVyOiBWaWV3Q29udGFpbmVyLCBmcm9tOiBWaWV3Q29udGFpbmVyTG9jYXRpb24sIHRvOiBWaWV3Q29udGFpbmVyTG9jYXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLmRlcmVnaXN0ZXJQYW5lQ29tcG9zaXRlKHZpZXdDb250YWluZXIsIGZyb20pO1xuXHRcdHRoaXMucmVnaXN0ZXJQYW5lQ29tcG9zaXRlKHZpZXdDb250YWluZXIsIHRvKTtcblxuXHRcdC8vIE9wZW4gdmlldyBjb250YWluZXIgaWYgcGFydCBpcyB2aXNpYmxlIGFuZCB0aGVyZSBpcyBvbmx5IG9uZSB2aWV3IGNvbnRhaW5lciBpbiBsb2NhdGlvblxuXHRcdGlmIChcblx0XHRcdHRoaXMubGF5b3V0U2VydmljZS5pc1Zpc2libGUodGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5nZXRQYXJ0SWQodG8pKSAmJlxuXHRcdFx0dGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lcnNCeUxvY2F0aW9uKHRvKS5maWx0ZXIodmMgPT4gdGhpcy5pc1ZpZXdDb250YWluZXJBY3RpdmUodmMuaWQpKS5sZW5ndGggPT09IDFcblx0XHQpIHtcblx0XHRcdHRoaXMub3BlblZpZXdDb250YWluZXIodmlld0NvbnRhaW5lci5pZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblZpZXdEZXNjcmlwdG9yc0FkZGVkKHZpZXdzOiBSZWFkb25seUFycmF5PElWaWV3RGVzY3JpcHRvcj4sIGNvbnRhaW5lcjogVmlld0NvbnRhaW5lcik6IHZvaWQge1xuXHRcdGNvbnN0IGxvY2F0aW9uID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckxvY2F0aW9uKGNvbnRhaW5lcik7XG5cdFx0aWYgKGxvY2F0aW9uID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCB2aWV3RGVzY3JpcHRvciBvZiB2aWV3cykge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5yZWdpc3Rlck9wZW5WaWV3QWN0aW9uKHZpZXdEZXNjcmlwdG9yKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5yZWdpc3RlckZvY3VzVmlld0FjdGlvbih2aWV3RGVzY3JpcHRvciwgY29udGFpbmVyLnRpdGxlKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5yZWdpc3RlclJlc2V0Vmlld0xvY2F0aW9uQWN0aW9uKHZpZXdEZXNjcmlwdG9yKSk7XG5cdFx0XHR0aGlzLnZpZXdEaXNwb3NhYmxlLnNldCh2aWV3RGVzY3JpcHRvciwgZGlzcG9zYWJsZXMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25WaWV3RGVzY3JpcHRvcnNSZW1vdmVkKHZpZXdzOiBSZWFkb25seUFycmF5PElWaWV3RGVzY3JpcHRvcj4pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHZpZXcgb2Ygdmlld3MpIHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0aGlzLnZpZXdEaXNwb3NhYmxlLmdldCh2aWV3KTtcblx0XHRcdGlmIChkaXNwb3NhYmxlKSB7XG5cdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLnZpZXdEaXNwb3NhYmxlLmRlbGV0ZSh2aWV3KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVZpZXdDb250YWluZXJFbmFibGVtZW50Q29udGV4dEtleSh2aWV3Q29udGFpbmVyOiBWaWV3Q29udGFpbmVyKTogdm9pZCB7XG5cdFx0bGV0IGNvbnRleHRLZXkgPSB0aGlzLmVuYWJsZWRWaWV3Q29udGFpbmVyc0NvbnRleHRLZXlzLmdldCh2aWV3Q29udGFpbmVyLmlkKTtcblx0XHRpZiAoIWNvbnRleHRLZXkpIHtcblx0XHRcdGNvbnRleHRLZXkgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShnZXRFbmFibGVkVmlld0NvbnRhaW5lckNvbnRleHRLZXkodmlld0NvbnRhaW5lci5pZCksIGZhbHNlKTtcblx0XHRcdHRoaXMuZW5hYmxlZFZpZXdDb250YWluZXJzQ29udGV4dEtleXMuc2V0KHZpZXdDb250YWluZXIuaWQsIGNvbnRleHRLZXkpO1xuXHRcdH1cblx0XHRjb250ZXh0S2V5LnNldCghKHZpZXdDb250YWluZXIuaGlkZUlmRW1wdHkgJiYgdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKHZpZXdDb250YWluZXIpLmFjdGl2ZVZpZXdEZXNjcmlwdG9ycy5sZW5ndGggPT09IDApKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlbkNvbXBvc2l0ZShjb21wb3NpdGVJZDogc3RyaW5nLCBsb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uLCBmb2N1cz86IGJvb2xlYW4pOiBQcm9taXNlPElQYW5lQ29tcG9zaXRlIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2Uub3BlblBhbmVDb21wb3NpdGUoY29tcG9zaXRlSWQsIGxvY2F0aW9uLCBmb2N1cyk7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbXBvc2l0ZShjb21wb3NpdGVJZDogc3RyaW5nLCBsb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uKTogeyBpZDogc3RyaW5nOyBuYW1lOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0UGFuZUNvbXBvc2l0ZShjb21wb3NpdGVJZCwgbG9jYXRpb24pO1xuXHR9XG5cblx0Ly8gT25lIHZpZXcgY29udGFpbmVyIGNhbiBiZSB2aXNpYmxlIGF0IGEgdGltZSBpbiBhIGxvY2F0aW9uXG5cdGlzVmlld0NvbnRhaW5lclZpc2libGUoaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHZpZXdDb250YWluZXIgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlJZChpZCk7XG5cdFx0aWYgKCF2aWV3Q29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgdmlld0NvbnRhaW5lckxvY2F0aW9uID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckxvY2F0aW9uKHZpZXdDb250YWluZXIpO1xuXHRcdGlmICh2aWV3Q29udGFpbmVyTG9jYXRpb24gPT09IG51bGwpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5nZXRBY3RpdmVQYW5lQ29tcG9zaXRlKHZpZXdDb250YWluZXJMb2NhdGlvbik/LmdldElkKCkgPT09IGlkO1xuXHR9XG5cblx0Ly8gTXVsdGlwbGUgdmlldyBjb250YWluZXJzIGNhbiBiZSBhY3RpdmUvaW5hY3RpdmUgYXQgYSB0aW1lIGluIGEgbG9jYXRpb25cblx0aXNWaWV3Q29udGFpbmVyQWN0aXZlKGlkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCB2aWV3Q29udGFpbmVyID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5SWQoaWQpO1xuXHRcdGlmICghdmlld0NvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICghdmlld0NvbnRhaW5lci5oaWRlSWZFbXB0eSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJNb2RlbCh2aWV3Q29udGFpbmVyKS5hY3RpdmVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoID4gMDtcblx0fVxuXG5cdGdldFZpc2libGVWaWV3Q29udGFpbmVyKGxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24pOiBWaWV3Q29udGFpbmVyIHwgbnVsbCB7XG5cdFx0Y29uc3Qgdmlld0NvbnRhaW5lcklkID0gdGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5nZXRBY3RpdmVQYW5lQ29tcG9zaXRlKGxvY2F0aW9uKT8uZ2V0SWQoKTtcblx0XHRyZXR1cm4gdmlld0NvbnRhaW5lcklkID8gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5SWQodmlld0NvbnRhaW5lcklkKSA6IG51bGw7XG5cdH1cblxuXHRnZXRBY3RpdmVWaWV3UGFuZUNvbnRhaW5lcldpdGhJZCh2aWV3Q29udGFpbmVySWQ6IHN0cmluZyk6IElWaWV3UGFuZUNvbnRhaW5lciB8IG51bGwge1xuXHRcdGNvbnN0IHZpZXdDb250YWluZXIgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlJZCh2aWV3Q29udGFpbmVySWQpO1xuXHRcdHJldHVybiB2aWV3Q29udGFpbmVyID8gdGhpcy5nZXRBY3RpdmVWaWV3UGFuZUNvbnRhaW5lcih2aWV3Q29udGFpbmVyKSA6IG51bGw7XG5cdH1cblxuXHRhc3luYyBvcGVuVmlld0NvbnRhaW5lcihpZDogc3RyaW5nLCBmb2N1cz86IGJvb2xlYW4pOiBQcm9taXNlPElQYW5lQ29tcG9zaXRlIHwgbnVsbD4ge1xuXHRcdGNvbnN0IHZpZXdDb250YWluZXIgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlJZChpZCk7XG5cdFx0aWYgKHZpZXdDb250YWluZXIpIHtcblx0XHRcdGNvbnN0IHZpZXdDb250YWluZXJMb2NhdGlvbiA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJMb2NhdGlvbih2aWV3Q29udGFpbmVyKTtcblx0XHRcdGlmICh2aWV3Q29udGFpbmVyTG9jYXRpb24gIT09IG51bGwpIHtcblx0XHRcdFx0Y29uc3QgcGFuZUNvbXBvc2l0ZSA9IGF3YWl0IHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2Uub3BlblBhbmVDb21wb3NpdGUoaWQsIHZpZXdDb250YWluZXJMb2NhdGlvbiwgZm9jdXMpO1xuXHRcdFx0XHRyZXR1cm4gcGFuZUNvbXBvc2l0ZSB8fCBudWxsO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0YXN5bmMgY2xvc2VWaWV3Q29udGFpbmVyKGlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2aWV3Q29udGFpbmVyID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5SWQoaWQpO1xuXHRcdGlmICh2aWV3Q29udGFpbmVyKSB7XG5cdFx0XHRjb25zdCB2aWV3Q29udGFpbmVyTG9jYXRpb24gPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24odmlld0NvbnRhaW5lcik7XG5cdFx0XHRjb25zdCBpc0FjdGl2ZSA9IHZpZXdDb250YWluZXJMb2NhdGlvbiAhPT0gbnVsbCAmJiB0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldEFjdGl2ZVBhbmVDb21wb3NpdGUodmlld0NvbnRhaW5lckxvY2F0aW9uKTtcblx0XHRcdGlmICh2aWV3Q29udGFpbmVyTG9jYXRpb24gIT09IG51bGwpIHtcblx0XHRcdFx0cmV0dXJuIGlzQWN0aXZlID8gdGhpcy5sYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4odHJ1ZSwgdGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5nZXRQYXJ0SWQodmlld0NvbnRhaW5lckxvY2F0aW9uKSkgOiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aXNWaWV3VmlzaWJsZShpZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgYWN0aXZlVmlldyA9IHRoaXMuZ2V0QWN0aXZlVmlld1dpdGhJZChpZCk7XG5cdFx0cmV0dXJuIGFjdGl2ZVZpZXc/LmlzQm9keVZpc2libGUoKSB8fCBmYWxzZTtcblx0fVxuXG5cdGdldEFjdGl2ZVZpZXdXaXRoSWQ8VCBleHRlbmRzIElWaWV3PihpZDogc3RyaW5nKTogVCB8IG51bGwge1xuXHRcdGNvbnN0IHZpZXdDb250YWluZXIgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlWaWV3SWQoaWQpO1xuXHRcdGlmICh2aWV3Q29udGFpbmVyKSB7XG5cdFx0XHRjb25zdCBhY3RpdmVWaWV3UGFuZUNvbnRhaW5lciA9IHRoaXMuZ2V0QWN0aXZlVmlld1BhbmVDb250YWluZXIodmlld0NvbnRhaW5lcik7XG5cdFx0XHRpZiAoYWN0aXZlVmlld1BhbmVDb250YWluZXIpIHtcblx0XHRcdFx0cmV0dXJuIGFjdGl2ZVZpZXdQYW5lQ29udGFpbmVyLmdldFZpZXcoaWQpIGFzIFQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Z2V0Vmlld1dpdGhJZDxUIGV4dGVuZHMgSVZpZXc+KGlkOiBzdHJpbmcpOiBUIHwgbnVsbCB7XG5cdFx0Y29uc3Qgdmlld0NvbnRhaW5lciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeVZpZXdJZChpZCk7XG5cdFx0aWYgKHZpZXdDb250YWluZXIpIHtcblx0XHRcdGNvbnN0IHZpZXdQYW5lQ29udGFpbmVyOiBJVmlld1BhbmVDb250YWluZXIgfCB1bmRlZmluZWQgPSB0aGlzLnZpZXdQYW5lQ29udGFpbmVycy5nZXQodmlld0NvbnRhaW5lci5pZCk7XG5cdFx0XHRpZiAodmlld1BhbmVDb250YWluZXIpIHtcblx0XHRcdFx0cmV0dXJuIHZpZXdQYW5lQ29udGFpbmVyLmdldFZpZXcoaWQpIGFzIFQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Z2V0Rm9jdXNlZFZpZXcoKTogSVZpZXdEZXNjcmlwdG9yIHwgbnVsbCB7XG5cdFx0Y29uc3Qgdmlld0lkOiBzdHJpbmcgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZShGb2N1c2VkVmlld0NvbnRleHQua2V5KSA/PyAnJztcblx0XHRyZXR1cm4gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0Rlc2NyaXB0b3JCeUlkKHZpZXdJZC50b1N0cmluZygpKTtcblx0fVxuXG5cdGdldEZvY3VzZWRWaWV3TmFtZSgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHRleHRFZGl0b3JGb2N1c2VkID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sPy5oYXNUZXh0Rm9jdXMoKSA/IGxvY2FsaXplKCdlZGl0b3InLCBcIlRleHQgRWRpdG9yXCIpIDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiB0aGlzLmdldEZvY3VzZWRWaWV3KCk/Lm5hbWU/LnZhbHVlID8/IHRleHRFZGl0b3JGb2N1c2VkID8/ICcnO1xuXHR9XG5cblx0YXN5bmMgb3BlblZpZXc8VCBleHRlbmRzIElWaWV3PihpZDogc3RyaW5nLCBmb2N1cz86IGJvb2xlYW4pOiBQcm9taXNlPFQgfCBudWxsPiB7XG5cdFx0Y29uc3Qgdmlld0NvbnRhaW5lciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeVZpZXdJZChpZCk7XG5cdFx0aWYgKCF2aWV3Q29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJNb2RlbCh2aWV3Q29udGFpbmVyKS5hY3RpdmVWaWV3RGVzY3JpcHRvcnMuc29tZSh2aWV3RGVzY3JpcHRvciA9PiB2aWV3RGVzY3JpcHRvci5pZCA9PT0gaWQpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBsb2NhdGlvbiA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJMb2NhdGlvbih2aWV3Q29udGFpbmVyKTtcblx0XHRjb25zdCBjb21wb3NpdGVEZXNjcmlwdG9yID0gdGhpcy5nZXRDb21wb3NpdGUodmlld0NvbnRhaW5lci5pZCwgbG9jYXRpb24hKTtcblx0XHRpZiAoY29tcG9zaXRlRGVzY3JpcHRvcikge1xuXHRcdFx0Y29uc3QgcGFuZUNvbXBvc2l0ZSA9IGF3YWl0IHRoaXMub3BlbkNvbXBvc2l0ZShjb21wb3NpdGVEZXNjcmlwdG9yLmlkLCBsb2NhdGlvbiEpIGFzIElQYW5lQ29tcG9zaXRlIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHBhbmVDb21wb3NpdGU/Lm9wZW5WaWV3KSB7XG5cdFx0XHRcdHJldHVybiBwYW5lQ29tcG9zaXRlLm9wZW5WaWV3PFQ+KGlkLCBmb2N1cykgfHwgbnVsbDtcblx0XHRcdH0gZWxzZSBpZiAoZm9jdXMpIHtcblx0XHRcdFx0cGFuZUNvbXBvc2l0ZT8uZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGNsb3NlVmlldyhpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgdmlld0NvbnRhaW5lciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeVZpZXdJZChpZCk7XG5cdFx0aWYgKHZpZXdDb250YWluZXIpIHtcblx0XHRcdGNvbnN0IGFjdGl2ZVZpZXdQYW5lQ29udGFpbmVyID0gdGhpcy5nZXRBY3RpdmVWaWV3UGFuZUNvbnRhaW5lcih2aWV3Q29udGFpbmVyKTtcblx0XHRcdGlmIChhY3RpdmVWaWV3UGFuZUNvbnRhaW5lcikge1xuXHRcdFx0XHRjb25zdCB2aWV3ID0gYWN0aXZlVmlld1BhbmVDb250YWluZXIuZ2V0VmlldyhpZCk7XG5cdFx0XHRcdGlmICh2aWV3KSB7XG5cdFx0XHRcdFx0aWYgKGFjdGl2ZVZpZXdQYW5lQ29udGFpbmVyLnZpZXdzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24odmlld0NvbnRhaW5lcik7XG5cdFx0XHRcdFx0XHRpZiAobG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMubGF5b3V0U2VydmljZS5zZXRQYXJ0SGlkZGVuKHRydWUsIFBhcnRzLlNJREVCQVJfUEFSVCk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGxvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwgfHwgbG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5oaWRlQWN0aXZlUGFuZUNvbXBvc2l0ZShsb2NhdGlvbik7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIFRoZSBibHVyIGV2ZW50IGRvZXNuJ3QgZmlyZSBvbiBXZWJLaXQgd2hlbiB0aGUgZm9jdXNlZCBlbGVtZW50IGlzIGhpZGRlbixcblx0XHRcdFx0XHRcdC8vIHNvIHRoZSBjb250ZXh0IGtleSBuZWVkcyB0byBiZSBmb3JjZWQgaGVyZSB0b28gb3RoZXJ3aXNlIGEgdmlldyBtYXkgc3RpbGxcblx0XHRcdFx0XHRcdC8vIHRoaW5rIGl0J3Mgc2hvd2luZywgYnJlYWtpbmcgdG9nZ2xlIGNvbW1hbmRzLlxuXHRcdFx0XHRcdFx0aWYgKHRoaXMuZm9jdXNlZFZpZXdDb250ZXh0S2V5LmdldCgpID09PSBpZCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmZvY3VzZWRWaWV3Q29udGV4dEtleS5yZXNldCgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR2aWV3LnNldEV4cGFuZGVkKGZhbHNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEFjdGl2ZVZpZXdQYW5lQ29udGFpbmVyKHZpZXdDb250YWluZXI6IFZpZXdDb250YWluZXIpOiBJVmlld1BhbmVDb250YWluZXIgfCBudWxsIHtcblx0XHRjb25zdCBsb2NhdGlvbiA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJMb2NhdGlvbih2aWV3Q29udGFpbmVyKTtcblx0XHRpZiAobG9jYXRpb24gPT09IG51bGwpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGl2ZVBhbmVDb21wb3NpdGUgPSB0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldEFjdGl2ZVBhbmVDb21wb3NpdGUobG9jYXRpb24pO1xuXHRcdGlmIChhY3RpdmVQYW5lQ29tcG9zaXRlPy5nZXRJZCgpID09PSB2aWV3Q29udGFpbmVyLmlkKSB7XG5cdFx0XHRyZXR1cm4gYWN0aXZlUGFuZUNvbXBvc2l0ZS5nZXRWaWV3UGFuZUNvbnRhaW5lcigpIHx8IG51bGw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRnZXRWaWV3UHJvZ3Jlc3NJbmRpY2F0b3Iodmlld0lkOiBzdHJpbmcpOiBJUHJvZ3Jlc3NJbmRpY2F0b3IgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHZpZXdDb250YWluZXIgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlWaWV3SWQodmlld0lkKTtcblx0XHRpZiAoIXZpZXdDb250YWluZXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgdmlld1BhbmVDb250YWluZXIgPSB0aGlzLnZpZXdQYW5lQ29udGFpbmVycy5nZXQodmlld0NvbnRhaW5lci5pZCk7XG5cdFx0aWYgKCF2aWV3UGFuZUNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCB2aWV3ID0gdmlld1BhbmVDb250YWluZXIuZ2V0Vmlldyh2aWV3SWQpO1xuXHRcdGlmICghdmlldykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAodmlld1BhbmVDb250YWluZXIuaXNWaWV3TWVyZ2VkV2l0aENvbnRhaW5lcigpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRWaWV3Q29udGFpbmVyUHJvZ3Jlc3NJbmRpY2F0b3Iodmlld0NvbnRhaW5lcik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHZpZXcuZ2V0UHJvZ3Jlc3NJbmRpY2F0b3IoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Vmlld0NvbnRhaW5lclByb2dyZXNzSW5kaWNhdG9yKHZpZXdDb250YWluZXI6IFZpZXdDb250YWluZXIpOiBJUHJvZ3Jlc3NJbmRpY2F0b3IgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHZpZXdDb250YWluZXJMb2NhdGlvbiA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJMb2NhdGlvbih2aWV3Q29udGFpbmVyKTtcblx0XHRpZiAodmlld0NvbnRhaW5lckxvY2F0aW9uID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldFByb2dyZXNzSW5kaWNhdG9yKHZpZXdDb250YWluZXIuaWQsIHZpZXdDb250YWluZXJMb2NhdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyT3BlblZpZXdDb250YWluZXJBY3Rpb24odmlld0NvbnRhaW5lcjogVmlld0NvbnRhaW5lcik6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRpZiAodmlld0NvbnRhaW5lci5vcGVuQ29tbWFuZEFjdGlvbkRlc2NyaXB0b3IpIHtcblx0XHRcdGNvbnN0IHsgaWQsIG1uZW1vbmljVGl0bGUsIGtleWJpbmRpbmdzLCBvcmRlciB9ID0gdmlld0NvbnRhaW5lci5vcGVuQ29tbWFuZEFjdGlvbkRlc2NyaXB0b3IgPz8geyBpZDogdmlld0NvbnRhaW5lci5pZCB9O1xuXHRcdFx0Y29uc3QgdGl0bGUgPSB2aWV3Q29udGFpbmVyLm9wZW5Db21tYW5kQWN0aW9uRGVzY3JpcHRvci50aXRsZSA/PyB2aWV3Q29udGFpbmVyLnRpdGxlO1xuXHRcdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE9wZW5WaWV3Q29udGFpbmVyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdFx0Z2V0IHRpdGxlKCk6IElDb21tYW5kQWN0aW9uVGl0bGUge1xuXHRcdFx0XHRcdFx0XHRjb25zdCB2aWV3Q29udGFpbmVyTG9jYXRpb24gPSB0aGF0LnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24odmlld0NvbnRhaW5lcik7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGxvY2FsaXplZFRpdGxlID0gdHlwZW9mIHRpdGxlID09PSAnc3RyaW5nJyA/IHRpdGxlIDogdGl0bGUudmFsdWU7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG9yaWdpbmFsVGl0bGUgPSB0eXBlb2YgdGl0bGUgPT09ICdzdHJpbmcnID8gdGl0bGUgOiB0aXRsZS5vcmlnaW5hbDtcblx0XHRcdFx0XHRcdFx0aWYgKHZpZXdDb250YWluZXJMb2NhdGlvbiA9PT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4geyB2YWx1ZTogbG9jYWxpemUoJ3Nob3cgdmlldycsIFwiU2hvdyB7MH1cIiwgbG9jYWxpemVkVGl0bGUpLCBvcmlnaW5hbDogYFNob3cgJHtvcmlnaW5hbFRpdGxlfWAgfTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4geyB2YWx1ZTogbG9jYWxpemUoJ3RvZ2dsZSB2aWV3JywgXCJUb2dnbGUgezB9XCIsIGxvY2FsaXplZFRpdGxlKSwgb3JpZ2luYWw6IGBUb2dnbGUgJHtvcmlnaW5hbFRpdGxlfWAgfTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRcdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmhhcyhnZXRFbmFibGVkVmlld0NvbnRhaW5lckNvbnRleHRLZXkodmlld0NvbnRhaW5lci5pZCkpLFxuXHRcdFx0XHRcdFx0a2V5YmluZGluZzoga2V5YmluZGluZ3MgPyB7IC4uLmtleWJpbmRpbmdzLCB3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiB9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0ZjE6IHRydWVcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRwdWJsaWMgYXN5bmMgcnVuKHNlcnZpY2VBY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdGNvbnN0IGVkaXRvckdyb3VwU2VydmljZSA9IHNlcnZpY2VBY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdFx0XHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yU2VydmljZSA9IHNlcnZpY2VBY2Nlc3Nvci5nZXQoSVZpZXdEZXNjcmlwdG9yU2VydmljZSk7XG5cdFx0XHRcdFx0Y29uc3QgbGF5b3V0U2VydmljZSA9IHNlcnZpY2VBY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaExheW91dFNlcnZpY2UpO1xuXHRcdFx0XHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IHNlcnZpY2VBY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0XHRcdFx0Y29uc3Qgdmlld0NvbnRhaW5lckxvY2F0aW9uID0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJMb2NhdGlvbih2aWV3Q29udGFpbmVyKTtcblx0XHRcdFx0XHRzd2l0Y2ggKHZpZXdDb250YWluZXJMb2NhdGlvbikge1xuXHRcdFx0XHRcdFx0Y2FzZSBWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyOlxuXHRcdFx0XHRcdFx0Y2FzZSBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcjoge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBwYXJ0ID0gdmlld0NvbnRhaW5lckxvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhciA/IFBhcnRzLlNJREVCQVJfUEFSVCA6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUO1xuXHRcdFx0XHRcdFx0XHRpZiAoIXZpZXdzU2VydmljZS5pc1ZpZXdDb250YWluZXJWaXNpYmxlKHZpZXdDb250YWluZXIuaWQpIHx8ICFsYXlvdXRTZXJ2aWNlLmhhc0ZvY3VzKHBhcnQpKSB7XG5cdFx0XHRcdFx0XHRcdFx0YXdhaXQgdmlld3NTZXJ2aWNlLm9wZW5WaWV3Q29udGFpbmVyKHZpZXdDb250YWluZXIuaWQsIHRydWUpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdGVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cC5mb2N1cygpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y2FzZSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWw6XG5cdFx0XHRcdFx0XHRcdGlmICghdmlld3NTZXJ2aWNlLmlzVmlld0NvbnRhaW5lclZpc2libGUodmlld0NvbnRhaW5lci5pZCkgfHwgIWxheW91dFNlcnZpY2UuaGFzRm9jdXMoUGFydHMuUEFORUxfUEFSVCkpIHtcblx0XHRcdFx0XHRcdFx0XHRhd2FpdCB2aWV3c1NlcnZpY2Uub3BlblZpZXdDb250YWluZXIodmlld0NvbnRhaW5lci5pZCwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0dmlld3NTZXJ2aWNlLmNsb3NlVmlld0NvbnRhaW5lcih2aWV3Q29udGFpbmVyLmlkKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0aWYgKG1uZW1vbmljVGl0bGUpIHtcblx0XHRcdFx0Y29uc3QgZGVmYXVsdExvY2F0aW9uID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0RGVmYXVsdFZpZXdDb250YWluZXJMb2NhdGlvbih2aWV3Q29udGFpbmVyKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclZpZXdNZW51LCB7XG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0XHR0aXRsZTogbW5lbW9uaWNUaXRsZSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiBkZWZhdWx0TG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyID8gJzNfc2lkZWJhcicgOiBkZWZhdWx0TG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIgPyAnNF9hdXhiYXInIDogJzVfcGFuZWwnLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmhhcyhnZXRFbmFibGVkVmlld0NvbnRhaW5lckNvbnRleHRLZXkodmlld0NvbnRhaW5lci5pZCkpLFxuXHRcdFx0XHRcdG9yZGVyOiBvcmRlciA/PyBOdW1iZXIuTUFYX1ZBTFVFXG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZGlzcG9zYWJsZXM7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyT3BlblZpZXdBY3Rpb24odmlld0Rlc2NyaXB0b3I6IElWaWV3RGVzY3JpcHRvcik6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCB0aXRsZSA9IHZpZXdEZXNjcmlwdG9yLm9wZW5Db21tYW5kQWN0aW9uRGVzY3JpcHRvcj8udGl0bGUgPz8gdmlld0Rlc2NyaXB0b3IubmFtZTtcblx0XHRjb25zdCBjb21tYW5kSWQgPSB2aWV3RGVzY3JpcHRvci5vcGVuQ29tbWFuZEFjdGlvbkRlc2NyaXB0b3I/LmlkID8/IGAke3ZpZXdEZXNjcmlwdG9yLmlkfS5vcGVuYDtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE9wZW5WaWV3QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBjb21tYW5kSWQsXG5cdFx0XHRcdFx0Z2V0IHRpdGxlKCk6IElDb21tYW5kQWN0aW9uVGl0bGUge1xuXHRcdFx0XHRcdFx0Y29uc3Qgdmlld0NvbnRhaW5lckxvY2F0aW9uID0gdGhhdC52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0xvY2F0aW9uQnlJZCh2aWV3RGVzY3JpcHRvci5pZCk7XG5cdFx0XHRcdFx0XHRjb25zdCBsb2NhbGl6ZWRUaXRsZSA9IHR5cGVvZiB0aXRsZSA9PT0gJ3N0cmluZycgPyB0aXRsZSA6IHRpdGxlLnZhbHVlO1xuXHRcdFx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxUaXRsZSA9IHR5cGVvZiB0aXRsZSA9PT0gJ3N0cmluZycgPyB0aXRsZSA6IHRpdGxlLm9yaWdpbmFsO1xuXHRcdFx0XHRcdFx0aWYgKHZpZXdDb250YWluZXJMb2NhdGlvbiA9PT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgdmFsdWU6IGxvY2FsaXplKCdzaG93IHZpZXcnLCBcIlNob3cgezB9XCIsIGxvY2FsaXplZFRpdGxlKSwgb3JpZ2luYWw6IGBTaG93ICR7b3JpZ2luYWxUaXRsZX1gIH07XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4geyB2YWx1ZTogbG9jYWxpemUoJ3RvZ2dsZSB2aWV3JywgXCJUb2dnbGUgezB9XCIsIGxvY2FsaXplZFRpdGxlKSwgb3JpZ2luYWw6IGBUb2dnbGUgJHtvcmlnaW5hbFRpdGxlfWAgfTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5oYXMoYCR7dmlld0Rlc2NyaXB0b3IuaWR9LmFjdGl2ZWApLFxuXHRcdFx0XHRcdGtleWJpbmRpbmc6IHZpZXdEZXNjcmlwdG9yLm9wZW5Db21tYW5kQWN0aW9uRGVzY3JpcHRvcj8ua2V5YmluZGluZ3MgPyB7IC4uLnZpZXdEZXNjcmlwdG9yLm9wZW5Db21tYW5kQWN0aW9uRGVzY3JpcHRvci5rZXliaW5kaW5ncywgd2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgfSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRmMTogdmlld0Rlc2NyaXB0b3Iub3BlbkNvbW1hbmRBY3Rpb25EZXNjcmlwdG9yID8gdHJ1ZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdvcGVuIHZpZXcnLCBcIk9wZW5zIHZpZXcgezB9XCIsIHZpZXdEZXNjcmlwdG9yLm5hbWUudmFsdWUpLFxuXHRcdFx0XHRcdFx0YXJnczogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0bmFtZTogJ29wdGlvbnMnLFxuXHRcdFx0XHRcdFx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdCdwcmVzZXJ2ZUZvY3VzJzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ByZXNlcnZlRm9jdXMnLCBcIldoZXRoZXIgdG8gcHJlc2VydmUgdGhlIGV4aXN0aW5nIGZvY3VzIHdoZW4gb3BlbmluZyB0aGUgdmlldy5cIilcblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cHVibGljIGFzeW5jIHJ1bihzZXJ2aWNlQWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIG9wdGlvbnM/OiB7IHByZXNlcnZlRm9jdXM/OiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yR3JvdXBTZXJ2aWNlID0gc2VydmljZUFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yU2VydmljZSA9IHNlcnZpY2VBY2Nlc3Nvci5nZXQoSVZpZXdEZXNjcmlwdG9yU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBzZXJ2aWNlQWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gc2VydmljZUFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBzZXJ2aWNlQWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRcdFx0Y29uc3QgZm9jdXNlZFZpZXdJZCA9IEZvY3VzZWRWaWV3Q29udGV4dC5nZXRWYWx1ZShjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRcdGlmIChmb2N1c2VkVmlld0lkID09PSB2aWV3RGVzY3JpcHRvci5pZCAmJiAhb3B0aW9ucz8ucHJlc2VydmVGb2N1cykge1xuXG5cdFx0XHRcdFx0Y29uc3Qgdmlld0xvY2F0aW9uID0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdMb2NhdGlvbkJ5SWQodmlld0Rlc2NyaXB0b3IuaWQpO1xuXHRcdFx0XHRcdGlmICh2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0xvY2F0aW9uQnlJZCh2aWV3RGVzY3JpcHRvci5pZCkgPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKSB7XG5cdFx0XHRcdFx0XHQvLyBmb2N1cyB0aGUgZWRpdG9yIGlmIHRoZSB2aWV3IGlzIGZvY3VzZWQgYW5kIGluIHRoZSBzaWRlIGJhclxuXHRcdFx0XHRcdFx0ZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwLmZvY3VzKCk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh2aWV3TG9jYXRpb24gIT09IG51bGwpIHtcblx0XHRcdFx0XHRcdC8vIG90aGVyd2lzZSBoaWRlIHRoZSBwYXJ0IHdoZXJlIHRoZSB2aWV3IGxpdmVzIGlmIGZvY3VzZWRcblx0XHRcdFx0XHRcdGxheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbih0cnVlLCB0aGF0LnBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldFBhcnRJZCh2aWV3TG9jYXRpb24pKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YXdhaXQgdmlld3NTZXJ2aWNlLm9wZW5WaWV3KHZpZXdEZXNjcmlwdG9yLmlkLCAhb3B0aW9ucz8ucHJlc2VydmVGb2N1cyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAodmlld0Rlc2NyaXB0b3Iub3BlbkNvbW1hbmRBY3Rpb25EZXNjcmlwdG9yPy5tbmVtb25pY1RpdGxlKSB7XG5cdFx0XHRjb25zdCBkZWZhdWx0Vmlld0NvbnRhaW5lciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldERlZmF1bHRDb250YWluZXJCeUlkKHZpZXdEZXNjcmlwdG9yLmlkKTtcblx0XHRcdGlmIChkZWZhdWx0Vmlld0NvbnRhaW5lcikge1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0TG9jYXRpb24gPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXREZWZhdWx0Vmlld0NvbnRhaW5lckxvY2F0aW9uKGRlZmF1bHRWaWV3Q29udGFpbmVyKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclZpZXdNZW51LCB7XG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IGNvbW1hbmRJZCxcblx0XHRcdFx0XHRcdHRpdGxlOiB2aWV3RGVzY3JpcHRvci5vcGVuQ29tbWFuZEFjdGlvbkRlc2NyaXB0b3IubW5lbW9uaWNUaXRsZSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdyb3VwOiBkZWZhdWx0TG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyID8gJzNfc2lkZWJhcicgOiBkZWZhdWx0TG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIgPyAnNF9hdXhiYXInIDogJzVfcGFuZWwnLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmhhcyhgJHt2aWV3RGVzY3JpcHRvci5pZH0uYWN0aXZlYCksXG5cdFx0XHRcdFx0b3JkZXI6IHZpZXdEZXNjcmlwdG9yLm9wZW5Db21tYW5kQWN0aW9uRGVzY3JpcHRvci5vcmRlciA/PyBOdW1iZXIuTUFYX1ZBTFVFXG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckZvY3VzVmlld0FjdGlvbih2aWV3RGVzY3JpcHRvcjogSVZpZXdEZXNjcmlwdG9yLCBjYXRlZ29yeT86IHN0cmluZyB8IElMb2NhbGl6ZWRTdHJpbmcpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBGb2N1c1ZpZXdBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRjb25zdCB0aXRsZSA9IGxvY2FsaXplMih7IGtleTogJ2ZvY3VzIHZpZXcnLCBjb21tZW50OiBbJ3swfSBpbmRpY2F0ZXMgdGhlIG5hbWUgb2YgdGhlIHZpZXcgdG8gYmUgZm9jdXNlZC4nXSB9LCBcIkZvY3VzIG9uIHswfSBWaWV3XCIsIHZpZXdEZXNjcmlwdG9yLm5hbWUudmFsdWUpO1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IHZpZXdEZXNjcmlwdG9yLmZvY3VzQ29tbWFuZCA/IHZpZXdEZXNjcmlwdG9yLmZvY3VzQ29tbWFuZC5pZCA6IGAke3ZpZXdEZXNjcmlwdG9yLmlkfS5mb2N1c2AsXG5cdFx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdFx0XHR3aGVuOiB2aWV3RGVzY3JpcHRvci53aGVuLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmhhcyhgJHt2aWV3RGVzY3JpcHRvci5pZH0uYWN0aXZlYCksXG5cdFx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHRcdHByaW1hcnk6IHZpZXdEZXNjcmlwdG9yLmZvY3VzQ29tbWFuZD8ua2V5YmluZGluZ3M/LnByaW1hcnksXG5cdFx0XHRcdFx0XHRzZWNvbmRhcnk6IHZpZXdEZXNjcmlwdG9yLmZvY3VzQ29tbWFuZD8ua2V5YmluZGluZ3M/LnNlY29uZGFyeSxcblx0XHRcdFx0XHRcdGxpbnV4OiB2aWV3RGVzY3JpcHRvci5mb2N1c0NvbW1hbmQ/LmtleWJpbmRpbmdzPy5saW51eCxcblx0XHRcdFx0XHRcdG1hYzogdmlld0Rlc2NyaXB0b3IuZm9jdXNDb21tYW5kPy5rZXliaW5kaW5ncz8ubWFjLFxuXHRcdFx0XHRcdFx0d2luOiB2aWV3RGVzY3JpcHRvci5mb2N1c0NvbW1hbmQ/LmtleWJpbmRpbmdzPy53aW5cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogdGl0bGUudmFsdWUsXG5cdFx0XHRcdFx0XHRhcmdzOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnZm9jdXNPcHRpb25zJyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0ZvY3VzIE9wdGlvbnMnLFxuXHRcdFx0XHRcdFx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdCdwcmVzZXJ2ZUZvY3VzJzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIG9wdGlvbnM/OiB7IHByZXNlcnZlRm9jdXM/OiBib29sZWFuIH0pOiB2b2lkIHtcblx0XHRcdFx0YWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpLm9wZW5WaWV3KHZpZXdEZXNjcmlwdG9yLmlkLCAhb3B0aW9ucz8ucHJlc2VydmVGb2N1cyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyUmVzZXRWaWV3TG9jYXRpb25BY3Rpb24odmlld0Rlc2NyaXB0b3I6IElWaWV3RGVzY3JpcHRvcik6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gcmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFJlc2V0Vmlld0xvY2F0aW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBgJHt2aWV3RGVzY3JpcHRvci5pZH0ucmVzZXRWaWV3TG9jYXRpb25gLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Jlc2V0Vmlld0xvY2F0aW9uJywgXCJSZXNldCBMb2NhdGlvblwiKSxcblx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGVDb250ZXh0LFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCB2aWV3RGVzY3JpcHRvci5pZCksXG5cdFx0XHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKGAke3ZpZXdEZXNjcmlwdG9yLmlkfS5kZWZhdWx0Vmlld0xvY2F0aW9uYCwgZmFsc2UpXG5cdFx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHRncm91cDogJzFfaGlkZScsXG5cdFx0XHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdFx0XHRjb25zdCB2aWV3RGVzY3JpcHRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdEZXNjcmlwdG9yU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGRlZmF1bHRDb250YWluZXIgPSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0RGVmYXVsdENvbnRhaW5lckJ5SWQodmlld0Rlc2NyaXB0b3IuaWQpITtcblx0XHRcdFx0Y29uc3QgY29udGFpbmVyTW9kZWwgPSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKGRlZmF1bHRDb250YWluZXIpITtcblxuXHRcdFx0XHQvLyBUaGUgZGVmYXVsdCBjb250YWluZXIgaXMgaGlkZGVuIHNvIHdlIHNob3VsZCB0cnkgdG8gcmVzZXQgaXRzIGxvY2F0aW9uIGZpcnN0XG5cdFx0XHRcdGlmIChkZWZhdWx0Q29udGFpbmVyLmhpZGVJZkVtcHR5ICYmIGNvbnRhaW5lck1vZGVsLnZpc2libGVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGVmYXVsdExvY2F0aW9uID0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldERlZmF1bHRWaWV3Q29udGFpbmVyTG9jYXRpb24oZGVmYXVsdENvbnRhaW5lcikhO1xuXHRcdFx0XHRcdHZpZXdEZXNjcmlwdG9yU2VydmljZS5tb3ZlVmlld0NvbnRhaW5lclRvTG9jYXRpb24oZGVmYXVsdENvbnRhaW5lciwgZGVmYXVsdExvY2F0aW9uLCB1bmRlZmluZWQsIHRoaXMuZGVzYy5pZCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR2aWV3RGVzY3JpcHRvclNlcnZpY2UubW92ZVZpZXdzVG9Db250YWluZXIoW3ZpZXdEZXNjcmlwdG9yXSwgZGVmYXVsdENvbnRhaW5lciwgdW5kZWZpbmVkLCB0aGlzLmRlc2MuaWQpO1xuXHRcdFx0XHRhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSkub3BlblZpZXcodmlld0Rlc2NyaXB0b3IuaWQsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclBhbmVDb21wb3NpdGUodmlld0NvbnRhaW5lcjogVmlld0NvbnRhaW5lciwgdmlld0NvbnRhaW5lckxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24pOiB2b2lkIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRjbGFzcyBQYW5lQ29udGFpbmVyIGV4dGVuZHMgUGFuZUNvbXBvc2l0ZSB7XG5cdFx0XHRjb25zdHJ1Y3Rvcihcblx0XHRcdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0XHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRcdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0XHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRcdFx0QElFeHRlbnNpb25TZXJ2aWNlIGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdFx0KSB7XG5cdFx0XHRcdHN1cGVyKHZpZXdDb250YWluZXIuaWQsIHRlbGVtZXRyeVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGV4dGVuc2lvblNlcnZpY2UsIGNvbnRleHRTZXJ2aWNlKTtcblx0XHRcdH1cblxuXHRcdFx0cHJvdGVjdGVkIGNyZWF0ZVZpZXdQYW5lQ29udGFpbmVyKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogVmlld1BhbmVDb250YWluZXIge1xuXHRcdFx0XHRjb25zdCB2aWV3UGFuZUNvbnRhaW5lckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRcdFx0XHQvLyBVc2UgY29tcG9zaXRlJ3MgaW5zdGFudGlhdGlvbiBzZXJ2aWNlIHRvIGdldCB0aGUgZWRpdG9yIHByb2dyZXNzIHNlcnZpY2UgZm9yIGFueSBlZGl0b3JzIGluc3RhbnRpYXRlZCB3aXRoaW4gdGhlIGNvbXBvc2l0ZVxuXHRcdFx0XHRjb25zdCB2aWV3UGFuZUNvbnRhaW5lciA9IHRoYXQuY3JlYXRlVmlld1BhbmVDb250YWluZXIoZWxlbWVudCwgdmlld0NvbnRhaW5lciwgdmlld0NvbnRhaW5lckxvY2F0aW9uLCB2aWV3UGFuZUNvbnRhaW5lckRpc3Bvc2FibGVzLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdFx0XHQvLyBPbmx5IHVwZGF0ZVRpdGxlQXJlYSBmb3Igbm9uLWZpbHRlciB2aWV3czogbWljcm9zb2Z0L3ZzY29kZS1yZW1vdGUtcmVsZWFzZSMzNjc2XG5cdFx0XHRcdGlmICghKHZpZXdQYW5lQ29udGFpbmVyIGluc3RhbmNlb2YgRmlsdGVyVmlld1BhbmVDb250YWluZXIpKSB7XG5cdFx0XHRcdFx0dmlld1BhbmVDb250YWluZXJEaXNwb3NhYmxlcy5hZGQoRXZlbnQuYW55KHZpZXdQYW5lQ29udGFpbmVyLm9uRGlkQWRkVmlld3MsIHZpZXdQYW5lQ29udGFpbmVyLm9uRGlkUmVtb3ZlVmlld3MsIHZpZXdQYW5lQ29udGFpbmVyLm9uVGl0bGVBcmVhVXBkYXRlKSgoKSA9PiB7XG5cdFx0XHRcdFx0XHQvLyBVcGRhdGUgdGl0bGUgYXJlYSBzaW5jZSB0aGVyZSBpcyBubyBiZXR0ZXIgd2F5IHRvIHVwZGF0ZSBzZWNvbmRhcnkgYWN0aW9uc1xuXHRcdFx0XHRcdFx0dGhpcy51cGRhdGVUaXRsZUFyZWEoKTtcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdmlld1BhbmVDb250YWluZXI7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0UmVnaXN0cnkuYXM8UGFuZUNvbXBvc2l0ZVJlZ2lzdHJ5Pih0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldFJlZ2lzdHJ5SWQodmlld0NvbnRhaW5lckxvY2F0aW9uKSkucmVnaXN0ZXJQYW5lQ29tcG9zaXRlKFBhbmVDb21wb3NpdGVEZXNjcmlwdG9yLmNyZWF0ZShcblx0XHRcdFBhbmVDb250YWluZXIsXG5cdFx0XHR2aWV3Q29udGFpbmVyLmlkLFxuXHRcdFx0dHlwZW9mIHZpZXdDb250YWluZXIudGl0bGUgPT09ICdzdHJpbmcnID8gdmlld0NvbnRhaW5lci50aXRsZSA6IHZpZXdDb250YWluZXIudGl0bGUudmFsdWUsXG5cdFx0XHRpc1N0cmluZyh2aWV3Q29udGFpbmVyLmljb24pID8gdmlld0NvbnRhaW5lci5pY29uIDogdW5kZWZpbmVkLFxuXHRcdFx0dmlld0NvbnRhaW5lci5vcmRlcixcblx0XHRcdHZpZXdDb250YWluZXIucmVxdWVzdGVkSW5kZXgsXG5cdFx0XHR2aWV3Q29udGFpbmVyLmljb24gaW5zdGFuY2VvZiBVUkkgPyB2aWV3Q29udGFpbmVyLmljb24gOiB1bmRlZmluZWRcblx0XHQpKTtcblx0fVxuXG5cdHByaXZhdGUgZGVyZWdpc3RlclBhbmVDb21wb3NpdGUodmlld0NvbnRhaW5lcjogVmlld0NvbnRhaW5lciwgdmlld0NvbnRhaW5lckxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24pOiB2b2lkIHtcblx0XHRSZWdpc3RyeS5hczxQYW5lQ29tcG9zaXRlUmVnaXN0cnk+KHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0UmVnaXN0cnlJZCh2aWV3Q29udGFpbmVyTG9jYXRpb24pKS5kZXJlZ2lzdGVyUGFuZUNvbXBvc2l0ZSh2aWV3Q29udGFpbmVyLmlkKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlVmlld1BhbmVDb250YWluZXIoZWxlbWVudDogSFRNTEVsZW1lbnQsIHZpZXdDb250YWluZXI6IFZpZXdDb250YWluZXIsIHZpZXdDb250YWluZXJMb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogVmlld1BhbmVDb250YWluZXIge1xuXHRcdGNvbnN0IHZpZXdQYW5lQ29udGFpbmVyOiBWaWV3UGFuZUNvbnRhaW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKHZpZXdDb250YWluZXIuY3RvckRlc2NyaXB0b3IuY3RvciwgLi4uKHZpZXdDb250YWluZXIuY3RvckRlc2NyaXB0b3Iuc3RhdGljQXJndW1lbnRzIHx8IFtdKSk7XG5cblx0XHR0aGlzLnZpZXdQYW5lQ29udGFpbmVycy5zZXQodmlld1BhbmVDb250YWluZXIuZ2V0SWQoKSwgdmlld1BhbmVDb250YWluZXIpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy52aWV3UGFuZUNvbnRhaW5lcnMuZGVsZXRlKHZpZXdQYW5lQ29udGFpbmVyLmdldElkKCkpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHZpZXdQYW5lQ29udGFpbmVyLm9uRGlkQWRkVmlld3Modmlld3MgPT4gdGhpcy5vblZpZXdzQWRkZWQodmlld3MpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHZpZXdQYW5lQ29udGFpbmVyLm9uRGlkQ2hhbmdlVmlld1Zpc2liaWxpdHkodmlldyA9PiB0aGlzLm9uVmlld3NWaXNpYmlsaXR5Q2hhbmdlZCh2aWV3LCB2aWV3LmlzQm9keVZpc2libGUoKSkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodmlld1BhbmVDb250YWluZXIub25EaWRSZW1vdmVWaWV3cyh2aWV3cyA9PiB0aGlzLm9uVmlld3NSZW1vdmVkKHZpZXdzKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh2aWV3UGFuZUNvbnRhaW5lci5vbkRpZEZvY3VzVmlldyh2aWV3ID0+IHtcblx0XHRcdGlmICh0aGlzLmZvY3VzZWRWaWV3Q29udGV4dEtleS5nZXQoKSAhPT0gdmlldy5pZCkge1xuXHRcdFx0XHR0aGlzLmZvY3VzZWRWaWV3Q29udGV4dEtleS5zZXQodmlldy5pZCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRm9jdXNlZFZpZXcuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodmlld1BhbmVDb250YWluZXIub25EaWRCbHVyVmlldyh2aWV3ID0+IHtcblx0XHRcdGlmICh0aGlzLmZvY3VzZWRWaWV3Q29udGV4dEtleS5nZXQoKSA9PT0gdmlldy5pZCkge1xuXHRcdFx0XHR0aGlzLmZvY3VzZWRWaWV3Q29udGV4dEtleS5yZXNldCgpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUZvY3VzZWRWaWV3LmZpcmUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gdmlld1BhbmVDb250YWluZXI7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0RW5hYmxlZFZpZXdDb250YWluZXJDb250ZXh0S2V5KHZpZXdDb250YWluZXJJZDogc3RyaW5nKTogc3RyaW5nIHsgcmV0dXJuIGB2aWV3Q29udGFpbmVyLiR7dmlld0NvbnRhaW5lcklkfS5lbmFibGVkYDsgfVxuXG5yZWdpc3RlclNpbmdsZXRvbihJVmlld3NTZXJ2aWNlLCBWaWV3c1NlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyIC8qIEVhZ2VyIGJlY2F1c2UgaXQgcmVnaXN0ZXJzIHZpZXdsZXRzIGFuZCBwYW5lbHMgaW4gdGhlIGNvbnN0cnVjdG9yIHdoaWNoIGFyZSByZXF1aXJlZCBkdXJpbmcgd29ya2JlbmNoIGxheW91dCAqLyk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsWUFBeUIsY0FBYyxpQkFBaUIscUJBQXFCO0FBQ3RGLFNBQVMsd0JBQStELDZCQUFpRDtBQUN6SCxTQUFTLG9CQUFvQixnQ0FBZ0M7QUFDN0QsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQkFBNkIsb0JBQW9CLHFCQUFxQjtBQUMvRSxTQUFTLE9BQU8sZUFBZTtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFFBQVEsaUJBQWlCLFNBQVMsb0JBQW9CO0FBQy9ELFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxtQkFBbUIseUJBQXlCO0FBRXJELFNBQTJCLDZCQUE2QjtBQUV4RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHlCQUFnRCxxQkFBcUI7QUFDOUUsU0FBUyx5QkFBeUIsYUFBYTtBQUMvQyxTQUFTLFdBQVc7QUFFcEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxpQ0FBaUM7QUFFMUMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxxQkFBcUI7QUFFdkIsSUFBTSxlQUFOLGNBQTJCLFdBQW9DO0FBQUEsRUFxQnJFLFlBQzBDLHVCQUNHLHNCQUNQLG1CQUNLLGVBQ1QsZUFDaEM7QUFDRCxVQUFNO0FBTm1DO0FBQ0c7QUFDUDtBQUNLO0FBQ1Q7QUFuQmxDLFNBQWlCLDZCQUF3RSxLQUFLLFVBQVUsSUFBSSxRQUEwQyxDQUFDO0FBQ3ZKLFNBQVMsNEJBQXFFLEtBQUssMkJBQTJCO0FBRTlHLFNBQWlCLHNDQUFzQyxLQUFLLFVBQVUsSUFBSSxRQUEyRSxDQUFDO0FBQ3RKLFNBQVMscUNBQXFDLEtBQUssb0NBQW9DO0FBRXZGLFNBQWlCLDBCQUEwQixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDN0UsU0FBUyx5QkFBeUIsS0FBSyx3QkFBd0I7QUFFL0QsU0FBaUIsMkJBQTJCLEtBQUssVUFBVSxJQUFJLGNBQWMsQ0FBQztBQWM3RSxTQUFLLGlCQUFpQixvQkFBSSxJQUFrQztBQUM1RCxTQUFLLG1DQUFtQyxvQkFBSSxJQUFrQztBQUM5RSxTQUFLLHlCQUF5QixvQkFBSSxJQUFrQztBQUNwRSxTQUFLLHFCQUFxQixvQkFBSSxJQUErQjtBQUU3RCxTQUFLLFVBQVUsYUFBYSxNQUFNO0FBQ2pDLFdBQUssZUFBZSxRQUFRLGdCQUFjLFdBQVcsUUFBUSxDQUFDO0FBQzlELFdBQUssZUFBZSxNQUFNO0FBQUEsSUFDM0IsQ0FBQyxDQUFDO0FBRUYsU0FBSyxzQkFBc0IsZUFBZSxRQUFRLG1CQUFpQixLQUFLLDJCQUEyQixlQUFlLEtBQUssc0JBQXNCLHlCQUF5QixhQUFhLENBQUUsQ0FBQztBQUN0TCxTQUFLLFVBQVUsS0FBSyxzQkFBc0IsMEJBQTBCLENBQUMsRUFBRSxPQUFPLFFBQVEsTUFBTSxLQUFLLHNCQUFzQixPQUFPLE9BQU8sQ0FBQyxDQUFDO0FBQ3ZJLFNBQUssVUFBVSxLQUFLLHNCQUFzQiw2QkFBNkIsQ0FBQyxFQUFFLGVBQWUsTUFBTSxHQUFHLE1BQU0sS0FBSyw2QkFBNkIsZUFBZSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0FBR25LLFNBQUssVUFBVSxLQUFLLHFCQUFxQix1QkFBdUIsT0FBSyxLQUFLLG9DQUFvQyxLQUFLLEVBQUUsSUFBSSxFQUFFLFVBQVUsTUFBTSxHQUFHLFNBQVMsTUFBTSxVQUFVLEVBQUUsc0JBQXNCLENBQUMsQ0FBQyxDQUFDO0FBQ2xNLFNBQUssVUFBVSxLQUFLLHFCQUFxQix3QkFBd0IsT0FBSyxLQUFLLG9DQUFvQyxLQUFLLEVBQUUsSUFBSSxFQUFFLFVBQVUsTUFBTSxHQUFHLFNBQVMsT0FBTyxVQUFVLEVBQUUsc0JBQXNCLENBQUMsQ0FBQyxDQUFDO0FBRXBNLFNBQUssd0JBQXdCLG1CQUFtQixPQUFPLGlCQUFpQjtBQUFBLEVBQ3pFO0FBQUEsRUFFUSxhQUFhLE9BQXNCO0FBQzFDLGVBQVcsUUFBUSxPQUFPO0FBQ3pCLFdBQUsseUJBQXlCLE1BQU0sS0FBSyxjQUFjLENBQUM7QUFBQSxJQUN6RDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHlCQUF5QixNQUFhLFNBQXdCO0FBQ3JFLFNBQUssZ0NBQWdDLElBQUksRUFBRSxJQUFJLE9BQU87QUFDdEQsU0FBSywyQkFBMkIsS0FBSyxFQUFFLElBQUksS0FBSyxJQUFJLFFBQWlCLENBQUM7QUFBQSxFQUN2RTtBQUFBLEVBRVEsZUFBZSxTQUF3QjtBQUM5QyxlQUFXLFFBQVEsU0FBUztBQUMzQixXQUFLLHlCQUF5QixNQUFNLEtBQUs7QUFBQSxJQUMxQztBQUFBLEVBQ0Q7QUFBQSxFQUVRLGdDQUFnQyxNQUFtQztBQUMxRSxVQUFNLHNCQUFzQix5QkFBeUIsS0FBSyxFQUFFO0FBQzVELFFBQUksYUFBYSxLQUFLLHVCQUF1QixJQUFJLG1CQUFtQjtBQUNwRSxRQUFJLENBQUMsWUFBWTtBQUNoQixtQkFBYSxJQUFJLGNBQWMscUJBQXFCLEtBQUssRUFBRSxPQUFPLEtBQUssaUJBQWlCO0FBQ3hGLFdBQUssdUJBQXVCLElBQUkscUJBQXFCLFVBQVU7QUFBQSxJQUNoRTtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxzQkFBc0IsT0FBcUYsU0FBNkY7QUFDL00sZUFBVyxFQUFFLFdBQVcsU0FBUyxLQUFLLFNBQVM7QUFDOUMsV0FBSyw2QkFBNkIsV0FBVyxRQUFRO0FBQUEsSUFDdEQ7QUFDQSxlQUFXLEVBQUUsV0FBVyxTQUFTLEtBQUssT0FBTztBQUM1QyxXQUFLLDJCQUEyQixXQUFXLFFBQVE7QUFBQSxJQUNwRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLDJCQUEyQixlQUE4Qix1QkFBb0Q7QUFDcEgsU0FBSyxzQkFBc0IsZUFBZSxxQkFBcUI7QUFDL0QsVUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBRXhDLFVBQU0scUJBQXFCLEtBQUssc0JBQXNCLHNCQUFzQixhQUFhO0FBQ3pGLFNBQUssdUJBQXVCLG1CQUFtQixvQkFBb0IsYUFBYTtBQUNoRixnQkFBWSxJQUFJLG1CQUFtQiw4QkFBOEIsQ0FBQyxFQUFFLE9BQU8sUUFBUSxNQUFNO0FBQ3hGLFdBQUssdUJBQXVCLE9BQU8sYUFBYTtBQUNoRCxXQUFLLHlCQUF5QixPQUFPO0FBQUEsSUFDdEMsQ0FBQyxDQUFDO0FBQ0YsU0FBSyx3Q0FBd0MsYUFBYTtBQUMxRCxnQkFBWSxJQUFJLG1CQUFtQixpQ0FBaUMsTUFBTSxLQUFLLHdDQUF3QyxhQUFhLENBQUMsQ0FBQztBQUN0SSxnQkFBWSxJQUFJLEtBQUssZ0NBQWdDLGFBQWEsQ0FBQztBQUVuRSxTQUFLLHlCQUF5QixJQUFJLGNBQWMsSUFBSSxXQUFXO0FBQUEsRUFDaEU7QUFBQSxFQUVRLDZCQUE2QixlQUE4Qix1QkFBb0Q7QUFDdEgsU0FBSyx3QkFBd0IsZUFBZSxxQkFBcUI7QUFDakUsU0FBSyx5QkFBeUIsaUJBQWlCLGNBQWMsRUFBRTtBQUFBLEVBQ2hFO0FBQUEsRUFFUSw2QkFBNkIsZUFBOEIsTUFBNkIsSUFBaUM7QUFDaEksU0FBSyx3QkFBd0IsZUFBZSxJQUFJO0FBQ2hELFNBQUssc0JBQXNCLGVBQWUsRUFBRTtBQUc1QyxRQUNDLEtBQUssY0FBYyxVQUFVLEtBQUsscUJBQXFCLFVBQVUsRUFBRSxDQUFDLEtBQ3BFLEtBQUssc0JBQXNCLDRCQUE0QixFQUFFLEVBQUUsT0FBTyxRQUFNLEtBQUssc0JBQXNCLEdBQUcsRUFBRSxDQUFDLEVBQUUsV0FBVyxHQUNySDtBQUNELFdBQUssa0JBQWtCLGNBQWMsRUFBRTtBQUFBLElBQ3hDO0FBQUEsRUFDRDtBQUFBLEVBRVEsdUJBQXVCLE9BQXVDLFdBQWdDO0FBQ3JHLFVBQU0sV0FBVyxLQUFLLHNCQUFzQix5QkFBeUIsU0FBUztBQUM5RSxRQUFJLGFBQWEsTUFBTTtBQUN0QjtBQUFBLElBQ0Q7QUFFQSxlQUFXLGtCQUFrQixPQUFPO0FBQ25DLFlBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxrQkFBWSxJQUFJLEtBQUssdUJBQXVCLGNBQWMsQ0FBQztBQUMzRCxrQkFBWSxJQUFJLEtBQUssd0JBQXdCLGdCQUFnQixVQUFVLEtBQUssQ0FBQztBQUM3RSxrQkFBWSxJQUFJLEtBQUssZ0NBQWdDLGNBQWMsQ0FBQztBQUNwRSxXQUFLLGVBQWUsSUFBSSxnQkFBZ0IsV0FBVztBQUFBLElBQ3BEO0FBQUEsRUFDRDtBQUFBLEVBRVEseUJBQXlCLE9BQTZDO0FBQzdFLGVBQVcsUUFBUSxPQUFPO0FBQ3pCLFlBQU0sYUFBYSxLQUFLLGVBQWUsSUFBSSxJQUFJO0FBQy9DLFVBQUksWUFBWTtBQUNmLG1CQUFXLFFBQVE7QUFDbkIsYUFBSyxlQUFlLE9BQU8sSUFBSTtBQUFBLE1BQ2hDO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHdDQUF3QyxlQUFvQztBQUNuRixRQUFJLGFBQWEsS0FBSyxpQ0FBaUMsSUFBSSxjQUFjLEVBQUU7QUFDM0UsUUFBSSxDQUFDLFlBQVk7QUFDaEIsbUJBQWEsS0FBSyxrQkFBa0IsVUFBVSxrQ0FBa0MsY0FBYyxFQUFFLEdBQUcsS0FBSztBQUN4RyxXQUFLLGlDQUFpQyxJQUFJLGNBQWMsSUFBSSxVQUFVO0FBQUEsSUFDdkU7QUFDQSxlQUFXLElBQUksRUFBRSxjQUFjLGVBQWUsS0FBSyxzQkFBc0Isc0JBQXNCLGFBQWEsRUFBRSxzQkFBc0IsV0FBVyxFQUFFO0FBQUEsRUFDbEo7QUFBQSxFQUVBLE1BQWMsY0FBYyxhQUFxQixVQUFpQyxPQUFzRDtBQUN2SSxXQUFPLEtBQUsscUJBQXFCLGtCQUFrQixhQUFhLFVBQVUsS0FBSztBQUFBLEVBQ2hGO0FBQUEsRUFFUSxhQUFhLGFBQXFCLFVBQTJFO0FBQ3BILFdBQU8sS0FBSyxxQkFBcUIsaUJBQWlCLGFBQWEsUUFBUTtBQUFBLEVBQ3hFO0FBQUE7QUFBQSxFQUdBLHVCQUF1QixJQUFxQjtBQUMzQyxVQUFNLGdCQUFnQixLQUFLLHNCQUFzQixxQkFBcUIsRUFBRTtBQUN4RSxRQUFJLENBQUMsZUFBZTtBQUNuQixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sd0JBQXdCLEtBQUssc0JBQXNCLHlCQUF5QixhQUFhO0FBQy9GLFFBQUksMEJBQTBCLE1BQU07QUFDbkMsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLEtBQUsscUJBQXFCLHVCQUF1QixxQkFBcUIsR0FBRyxNQUFNLE1BQU07QUFBQSxFQUM3RjtBQUFBO0FBQUEsRUFHQSxzQkFBc0IsSUFBcUI7QUFDMUMsVUFBTSxnQkFBZ0IsS0FBSyxzQkFBc0IscUJBQXFCLEVBQUU7QUFDeEUsUUFBSSxDQUFDLGVBQWU7QUFDbkIsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLENBQUMsY0FBYyxhQUFhO0FBQy9CLGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTyxLQUFLLHNCQUFzQixzQkFBc0IsYUFBYSxFQUFFLHNCQUFzQixTQUFTO0FBQUEsRUFDdkc7QUFBQSxFQUVBLHdCQUF3QixVQUF1RDtBQUM5RSxVQUFNLGtCQUFrQixLQUFLLHFCQUFxQix1QkFBdUIsUUFBUSxHQUFHLE1BQU07QUFDMUYsV0FBTyxrQkFBa0IsS0FBSyxzQkFBc0IscUJBQXFCLGVBQWUsSUFBSTtBQUFBLEVBQzdGO0FBQUEsRUFFQSxpQ0FBaUMsaUJBQW9EO0FBQ3BGLFVBQU0sZ0JBQWdCLEtBQUssc0JBQXNCLHFCQUFxQixlQUFlO0FBQ3JGLFdBQU8sZ0JBQWdCLEtBQUssMkJBQTJCLGFBQWEsSUFBSTtBQUFBLEVBQ3pFO0FBQUEsRUFFQSxNQUFNLGtCQUFrQixJQUFZLE9BQWlEO0FBQ3BGLFVBQU0sZ0JBQWdCLEtBQUssc0JBQXNCLHFCQUFxQixFQUFFO0FBQ3hFLFFBQUksZUFBZTtBQUNsQixZQUFNLHdCQUF3QixLQUFLLHNCQUFzQix5QkFBeUIsYUFBYTtBQUMvRixVQUFJLDBCQUEwQixNQUFNO0FBQ25DLGNBQU0sZ0JBQWdCLE1BQU0sS0FBSyxxQkFBcUIsa0JBQWtCLElBQUksdUJBQXVCLEtBQUs7QUFDeEcsZUFBTyxpQkFBaUI7QUFBQSxNQUN6QjtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSxtQkFBbUIsSUFBMkI7QUFDbkQsVUFBTSxnQkFBZ0IsS0FBSyxzQkFBc0IscUJBQXFCLEVBQUU7QUFDeEUsUUFBSSxlQUFlO0FBQ2xCLFlBQU0sd0JBQXdCLEtBQUssc0JBQXNCLHlCQUF5QixhQUFhO0FBQy9GLFlBQU0sV0FBVywwQkFBMEIsUUFBUSxLQUFLLHFCQUFxQix1QkFBdUIscUJBQXFCO0FBQ3pILFVBQUksMEJBQTBCLE1BQU07QUFDbkMsZUFBTyxXQUFXLEtBQUssY0FBYyxjQUFjLE1BQU0sS0FBSyxxQkFBcUIsVUFBVSxxQkFBcUIsQ0FBQyxJQUFJO0FBQUEsTUFDeEg7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsY0FBYyxJQUFxQjtBQUNsQyxVQUFNLGFBQWEsS0FBSyxvQkFBb0IsRUFBRTtBQUM5QyxXQUFPLFlBQVksY0FBYyxLQUFLO0FBQUEsRUFDdkM7QUFBQSxFQUVBLG9CQUFxQyxJQUFzQjtBQUMxRCxVQUFNLGdCQUFnQixLQUFLLHNCQUFzQix5QkFBeUIsRUFBRTtBQUM1RSxRQUFJLGVBQWU7QUFDbEIsWUFBTSwwQkFBMEIsS0FBSywyQkFBMkIsYUFBYTtBQUM3RSxVQUFJLHlCQUF5QjtBQUM1QixlQUFPLHdCQUF3QixRQUFRLEVBQUU7QUFBQSxNQUMxQztBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsY0FBK0IsSUFBc0I7QUFDcEQsVUFBTSxnQkFBZ0IsS0FBSyxzQkFBc0IseUJBQXlCLEVBQUU7QUFDNUUsUUFBSSxlQUFlO0FBQ2xCLFlBQU0sb0JBQW9ELEtBQUssbUJBQW1CLElBQUksY0FBYyxFQUFFO0FBQ3RHLFVBQUksbUJBQW1CO0FBQ3RCLGVBQU8sa0JBQWtCLFFBQVEsRUFBRTtBQUFBLE1BQ3BDO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxpQkFBeUM7QUFDeEMsVUFBTSxTQUFpQixLQUFLLGtCQUFrQixtQkFBbUIsbUJBQW1CLEdBQUcsS0FBSztBQUM1RixXQUFPLEtBQUssc0JBQXNCLHNCQUFzQixPQUFPLFNBQVMsQ0FBQztBQUFBLEVBQzFFO0FBQUEsRUFFQSxxQkFBNkI7QUFDNUIsVUFBTSxvQkFBb0IsS0FBSyxjQUFjLHlCQUF5QixhQUFhLElBQUksU0FBUyxVQUFVLGFBQWEsSUFBSTtBQUMzSCxXQUFPLEtBQUssZUFBZSxHQUFHLE1BQU0sU0FBUyxxQkFBcUI7QUFBQSxFQUNuRTtBQUFBLEVBRUEsTUFBTSxTQUEwQixJQUFZLE9BQW9DO0FBQy9FLFVBQU0sZ0JBQWdCLEtBQUssc0JBQXNCLHlCQUF5QixFQUFFO0FBQzVFLFFBQUksQ0FBQyxlQUFlO0FBQ25CLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxDQUFDLEtBQUssc0JBQXNCLHNCQUFzQixhQUFhLEVBQUUsc0JBQXNCLEtBQUssb0JBQWtCLGVBQWUsT0FBTyxFQUFFLEdBQUc7QUFDNUksYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFdBQVcsS0FBSyxzQkFBc0IseUJBQXlCLGFBQWE7QUFDbEYsVUFBTSxzQkFBc0IsS0FBSyxhQUFhLGNBQWMsSUFBSSxRQUFTO0FBQ3pFLFFBQUkscUJBQXFCO0FBQ3hCLFlBQU0sZ0JBQWdCLE1BQU0sS0FBSyxjQUFjLG9CQUFvQixJQUFJLFFBQVM7QUFDaEYsVUFBSSxlQUFlLFVBQVU7QUFDNUIsZUFBTyxjQUFjLFNBQVksSUFBSSxLQUFLLEtBQUs7QUFBQSxNQUNoRCxXQUFXLE9BQU87QUFDakIsdUJBQWUsTUFBTTtBQUFBLE1BQ3RCO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxVQUFVLElBQWtCO0FBQzNCLFVBQU0sZ0JBQWdCLEtBQUssc0JBQXNCLHlCQUF5QixFQUFFO0FBQzVFLFFBQUksZUFBZTtBQUNsQixZQUFNLDBCQUEwQixLQUFLLDJCQUEyQixhQUFhO0FBQzdFLFVBQUkseUJBQXlCO0FBQzVCLGNBQU0sT0FBTyx3QkFBd0IsUUFBUSxFQUFFO0FBQy9DLFlBQUksTUFBTTtBQUNULGNBQUksd0JBQXdCLE1BQU0sV0FBVyxHQUFHO0FBQy9DLGtCQUFNLFdBQVcsS0FBSyxzQkFBc0IseUJBQXlCLGFBQWE7QUFDbEYsZ0JBQUksYUFBYSxzQkFBc0IsU0FBUztBQUMvQyxtQkFBSyxjQUFjLGNBQWMsTUFBTSxNQUFNLFlBQVk7QUFBQSxZQUMxRCxXQUFXLGFBQWEsc0JBQXNCLFNBQVMsYUFBYSxzQkFBc0IsY0FBYztBQUN2RyxtQkFBSyxxQkFBcUIsd0JBQXdCLFFBQVE7QUFBQSxZQUMzRDtBQUtBLGdCQUFJLEtBQUssc0JBQXNCLElBQUksTUFBTSxJQUFJO0FBQzVDLG1CQUFLLHNCQUFzQixNQUFNO0FBQUEsWUFDbEM7QUFBQSxVQUNELE9BQU87QUFDTixpQkFBSyxZQUFZLEtBQUs7QUFBQSxVQUN2QjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLDJCQUEyQixlQUF5RDtBQUMzRixVQUFNLFdBQVcsS0FBSyxzQkFBc0IseUJBQXlCLGFBQWE7QUFDbEYsUUFBSSxhQUFhLE1BQU07QUFDdEIsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLHNCQUFzQixLQUFLLHFCQUFxQix1QkFBdUIsUUFBUTtBQUNyRixRQUFJLHFCQUFxQixNQUFNLE1BQU0sY0FBYyxJQUFJO0FBQ3RELGFBQU8sb0JBQW9CLHFCQUFxQixLQUFLO0FBQUEsSUFDdEQ7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEseUJBQXlCLFFBQWdEO0FBQ3hFLFVBQU0sZ0JBQWdCLEtBQUssc0JBQXNCLHlCQUF5QixNQUFNO0FBQ2hGLFFBQUksQ0FBQyxlQUFlO0FBQ25CLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxvQkFBb0IsS0FBSyxtQkFBbUIsSUFBSSxjQUFjLEVBQUU7QUFDdEUsUUFBSSxDQUFDLG1CQUFtQjtBQUN2QixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sT0FBTyxrQkFBa0IsUUFBUSxNQUFNO0FBQzdDLFFBQUksQ0FBQyxNQUFNO0FBQ1YsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLGtCQUFrQiwwQkFBMEIsR0FBRztBQUNsRCxhQUFPLEtBQUssa0NBQWtDLGFBQWE7QUFBQSxJQUM1RDtBQUVBLFdBQU8sS0FBSyxxQkFBcUI7QUFBQSxFQUNsQztBQUFBLEVBRVEsa0NBQWtDLGVBQThEO0FBQ3ZHLFVBQU0sd0JBQXdCLEtBQUssc0JBQXNCLHlCQUF5QixhQUFhO0FBQy9GLFFBQUksMEJBQTBCLE1BQU07QUFDbkMsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLEtBQUsscUJBQXFCLHFCQUFxQixjQUFjLElBQUkscUJBQXFCO0FBQUEsRUFDOUY7QUFBQSxFQUVRLGdDQUFnQyxlQUEyQztBQUNsRixVQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsUUFBSSxjQUFjLDZCQUE2QjtBQUM5QyxZQUFNLEVBQUUsSUFBSSxlQUFlLGFBQWEsTUFBTSxJQUFJLGNBQWMsK0JBQStCLEVBQUUsSUFBSSxjQUFjLEdBQUc7QUFDdEgsWUFBTSxRQUFRLGNBQWMsNEJBQTRCLFNBQVMsY0FBYztBQUMvRSxZQUFNLE9BQU87QUFDYixrQkFBWSxJQUFJLGdCQUFnQixNQUFNLGdDQUFnQyxRQUFRO0FBQUEsUUFDN0UsY0FBYztBQUNiLGdCQUFNO0FBQUEsWUFDTDtBQUFBLFlBQ0EsSUFBSSxRQUE2QjtBQUNoQyxvQkFBTSx3QkFBd0IsS0FBSyxzQkFBc0IseUJBQXlCLGFBQWE7QUFDL0Ysb0JBQU0saUJBQWlCLE9BQU8sVUFBVSxXQUFXLFFBQVEsTUFBTTtBQUNqRSxvQkFBTSxnQkFBZ0IsT0FBTyxVQUFVLFdBQVcsUUFBUSxNQUFNO0FBQ2hFLGtCQUFJLDBCQUEwQixzQkFBc0IsU0FBUztBQUM1RCx1QkFBTyxFQUFFLE9BQU8sU0FBUyxhQUFhLFlBQVksY0FBYyxHQUFHLFVBQVUsUUFBUSxhQUFhLEdBQUc7QUFBQSxjQUN0RyxPQUFPO0FBQ04sdUJBQU8sRUFBRSxPQUFPLFNBQVMsZUFBZSxjQUFjLGNBQWMsR0FBRyxVQUFVLFVBQVUsYUFBYSxHQUFHO0FBQUEsY0FDNUc7QUFBQSxZQUNEO0FBQUEsWUFDQSxVQUFVLFdBQVc7QUFBQSxZQUNyQixjQUFjLGVBQWUsSUFBSSxrQ0FBa0MsY0FBYyxFQUFFLENBQUM7QUFBQSxZQUNwRixZQUFZLGNBQWMsRUFBRSxHQUFHLGFBQWEsUUFBUSxpQkFBaUIsaUJBQWlCLElBQUk7QUFBQSxZQUMxRixJQUFJO0FBQUEsVUFDTCxDQUFDO0FBQUEsUUFDRjtBQUFBLFFBQ0EsTUFBYSxJQUFJLGlCQUFrRDtBQUNsRSxnQkFBTSxxQkFBcUIsZ0JBQWdCLElBQUksb0JBQW9CO0FBQ25FLGdCQUFNLHdCQUF3QixnQkFBZ0IsSUFBSSxzQkFBc0I7QUFDeEUsZ0JBQU0sZ0JBQWdCLGdCQUFnQixJQUFJLHVCQUF1QjtBQUNqRSxnQkFBTSxlQUFlLGdCQUFnQixJQUFJLGFBQWE7QUFDdEQsZ0JBQU0sd0JBQXdCLHNCQUFzQix5QkFBeUIsYUFBYTtBQUMxRixrQkFBUSx1QkFBdUI7QUFBQSxZQUM5QixLQUFLLHNCQUFzQjtBQUFBLFlBQzNCLEtBQUssc0JBQXNCLFNBQVM7QUFDbkMsb0JBQU0sT0FBTywwQkFBMEIsc0JBQXNCLFVBQVUsTUFBTSxlQUFlLE1BQU07QUFDbEcsa0JBQUksQ0FBQyxhQUFhLHVCQUF1QixjQUFjLEVBQUUsS0FBSyxDQUFDLGNBQWMsU0FBUyxJQUFJLEdBQUc7QUFDNUYsc0JBQU0sYUFBYSxrQkFBa0IsY0FBYyxJQUFJLElBQUk7QUFBQSxjQUM1RCxPQUFPO0FBQ04sbUNBQW1CLFlBQVksTUFBTTtBQUFBLGNBQ3RDO0FBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQSxLQUFLLHNCQUFzQjtBQUMxQixrQkFBSSxDQUFDLGFBQWEsdUJBQXVCLGNBQWMsRUFBRSxLQUFLLENBQUMsY0FBYyxTQUFTLE1BQU0sVUFBVSxHQUFHO0FBQ3hHLHNCQUFNLGFBQWEsa0JBQWtCLGNBQWMsSUFBSSxJQUFJO0FBQUEsY0FDNUQsT0FBTztBQUNOLDZCQUFhLG1CQUFtQixjQUFjLEVBQUU7QUFBQSxjQUNqRDtBQUNBO0FBQUEsVUFDRjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUMsQ0FBQztBQUVGLFVBQUksZUFBZTtBQUNsQixjQUFNLGtCQUFrQixLQUFLLHNCQUFzQixnQ0FBZ0MsYUFBYTtBQUNoRyxvQkFBWSxJQUFJLGFBQWEsZUFBZSxPQUFPLGlCQUFpQjtBQUFBLFVBQ25FLFNBQVM7QUFBQSxZQUNSO0FBQUEsWUFDQSxPQUFPO0FBQUEsVUFDUjtBQUFBLFVBQ0EsT0FBTyxvQkFBb0Isc0JBQXNCLFVBQVUsY0FBYyxvQkFBb0Isc0JBQXNCLGVBQWUsYUFBYTtBQUFBLFVBQy9JLE1BQU0sZUFBZSxJQUFJLGtDQUFrQyxjQUFjLEVBQUUsQ0FBQztBQUFBLFVBQzVFLE9BQU8sU0FBUyxPQUFPO0FBQUEsUUFDeEIsQ0FBQyxDQUFDO0FBQUEsTUFDSDtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsdUJBQXVCLGdCQUE4QztBQUM1RSxVQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsVUFBTSxRQUFRLGVBQWUsNkJBQTZCLFNBQVMsZUFBZTtBQUNsRixVQUFNLFlBQVksZUFBZSw2QkFBNkIsTUFBTSxHQUFHLGVBQWUsRUFBRTtBQUN4RixVQUFNLE9BQU87QUFDYixnQkFBWSxJQUFJLGdCQUFnQixNQUFNLHVCQUF1QixRQUFRO0FBQUEsTUFDcEUsY0FBYztBQUNiLGNBQU07QUFBQSxVQUNMLElBQUk7QUFBQSxVQUNKLElBQUksUUFBNkI7QUFDaEMsa0JBQU0sd0JBQXdCLEtBQUssc0JBQXNCLG9CQUFvQixlQUFlLEVBQUU7QUFDOUYsa0JBQU0saUJBQWlCLE9BQU8sVUFBVSxXQUFXLFFBQVEsTUFBTTtBQUNqRSxrQkFBTSxnQkFBZ0IsT0FBTyxVQUFVLFdBQVcsUUFBUSxNQUFNO0FBQ2hFLGdCQUFJLDBCQUEwQixzQkFBc0IsU0FBUztBQUM1RCxxQkFBTyxFQUFFLE9BQU8sU0FBUyxhQUFhLFlBQVksY0FBYyxHQUFHLFVBQVUsUUFBUSxhQUFhLEdBQUc7QUFBQSxZQUN0RyxPQUFPO0FBQ04scUJBQU8sRUFBRSxPQUFPLFNBQVMsZUFBZSxjQUFjLGNBQWMsR0FBRyxVQUFVLFVBQVUsYUFBYSxHQUFHO0FBQUEsWUFDNUc7QUFBQSxVQUNEO0FBQUEsVUFDQSxVQUFVLFdBQVc7QUFBQSxVQUNyQixjQUFjLGVBQWUsSUFBSSxHQUFHLGVBQWUsRUFBRSxTQUFTO0FBQUEsVUFDOUQsWUFBWSxlQUFlLDZCQUE2QixjQUFjLEVBQUUsR0FBRyxlQUFlLDRCQUE0QixhQUFhLFFBQVEsaUJBQWlCLGlCQUFpQixJQUFJO0FBQUEsVUFDakwsSUFBSSxlQUFlLDhCQUE4QixPQUFPO0FBQUEsVUFDeEQsVUFBVTtBQUFBLFlBQ1QsYUFBYSxTQUFTLGFBQWEsa0JBQWtCLGVBQWUsS0FBSyxLQUFLO0FBQUEsWUFDOUUsTUFBTTtBQUFBLGNBQ0w7QUFBQSxnQkFDQyxNQUFNO0FBQUEsZ0JBQ04sUUFBUTtBQUFBLGtCQUNQLE1BQU07QUFBQSxrQkFDTixZQUFZO0FBQUEsb0JBQ1gsaUJBQWlCO0FBQUEsc0JBQ2hCLE1BQU07QUFBQSxzQkFDTixTQUFTO0FBQUEsc0JBQ1QsYUFBYSxTQUFTLGlCQUFpQiwrREFBK0Q7QUFBQSxvQkFDdkc7QUFBQSxrQkFDRDtBQUFBLGdCQUNEO0FBQUEsY0FDRDtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRjtBQUFBLE1BQ0EsTUFBYSxJQUFJLGlCQUFtQyxTQUFzRDtBQUN6RyxjQUFNLHFCQUFxQixnQkFBZ0IsSUFBSSxvQkFBb0I7QUFDbkUsY0FBTSx3QkFBd0IsZ0JBQWdCLElBQUksc0JBQXNCO0FBQ3hFLGNBQU0sZ0JBQWdCLGdCQUFnQixJQUFJLHVCQUF1QjtBQUNqRSxjQUFNLGVBQWUsZ0JBQWdCLElBQUksYUFBYTtBQUN0RCxjQUFNLG9CQUFvQixnQkFBZ0IsSUFBSSxrQkFBa0I7QUFFaEUsY0FBTSxnQkFBZ0IsbUJBQW1CLFNBQVMsaUJBQWlCO0FBQ25FLFlBQUksa0JBQWtCLGVBQWUsTUFBTSxDQUFDLFNBQVMsZUFBZTtBQUVuRSxnQkFBTSxlQUFlLHNCQUFzQixvQkFBb0IsZUFBZSxFQUFFO0FBQ2hGLGNBQUksc0JBQXNCLG9CQUFvQixlQUFlLEVBQUUsTUFBTSxzQkFBc0IsU0FBUztBQUVuRywrQkFBbUIsWUFBWSxNQUFNO0FBQUEsVUFDdEMsV0FBVyxpQkFBaUIsTUFBTTtBQUVqQywwQkFBYyxjQUFjLE1BQU0sS0FBSyxxQkFBcUIsVUFBVSxZQUFZLENBQUM7QUFBQSxVQUNwRjtBQUFBLFFBQ0QsT0FBTztBQUNOLGdCQUFNLGFBQWEsU0FBUyxlQUFlLElBQUksQ0FBQyxTQUFTLGFBQWE7QUFBQSxRQUN2RTtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFFBQUksZUFBZSw2QkFBNkIsZUFBZTtBQUM5RCxZQUFNLHVCQUF1QixLQUFLLHNCQUFzQix3QkFBd0IsZUFBZSxFQUFFO0FBQ2pHLFVBQUksc0JBQXNCO0FBQ3pCLGNBQU0sa0JBQWtCLEtBQUssc0JBQXNCLGdDQUFnQyxvQkFBb0I7QUFDdkcsb0JBQVksSUFBSSxhQUFhLGVBQWUsT0FBTyxpQkFBaUI7QUFBQSxVQUNuRSxTQUFTO0FBQUEsWUFDUixJQUFJO0FBQUEsWUFDSixPQUFPLGVBQWUsNEJBQTRCO0FBQUEsVUFDbkQ7QUFBQSxVQUNBLE9BQU8sb0JBQW9CLHNCQUFzQixVQUFVLGNBQWMsb0JBQW9CLHNCQUFzQixlQUFlLGFBQWE7QUFBQSxVQUMvSSxNQUFNLGVBQWUsSUFBSSxHQUFHLGVBQWUsRUFBRSxTQUFTO0FBQUEsVUFDdEQsT0FBTyxlQUFlLDRCQUE0QixTQUFTLE9BQU87QUFBQSxRQUNuRSxDQUFDLENBQUM7QUFBQSxNQUNIO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSx3QkFBd0IsZ0JBQWlDLFVBQW1EO0FBQ25ILFdBQU8sZ0JBQWdCLE1BQU0sd0JBQXdCLFFBQVE7QUFBQSxNQUM1RCxjQUFjO0FBQ2IsY0FBTSxRQUFRLFVBQVUsRUFBRSxLQUFLLGNBQWMsU0FBUyxDQUFDLG1EQUFtRCxFQUFFLEdBQUcscUJBQXFCLGVBQWUsS0FBSyxLQUFLO0FBQzdKLGNBQU07QUFBQSxVQUNMLElBQUksZUFBZSxlQUFlLGVBQWUsYUFBYSxLQUFLLEdBQUcsZUFBZSxFQUFFO0FBQUEsVUFDdkY7QUFBQSxVQUNBO0FBQUEsVUFDQSxNQUFNLENBQUM7QUFBQSxZQUNOLElBQUksT0FBTztBQUFBLFlBQ1gsTUFBTSxlQUFlO0FBQUEsVUFDdEIsQ0FBQztBQUFBLFVBQ0QsWUFBWTtBQUFBLFlBQ1gsTUFBTSxlQUFlLElBQUksR0FBRyxlQUFlLEVBQUUsU0FBUztBQUFBLFlBQ3RELFFBQVEsaUJBQWlCO0FBQUEsWUFDekIsU0FBUyxlQUFlLGNBQWMsYUFBYTtBQUFBLFlBQ25ELFdBQVcsZUFBZSxjQUFjLGFBQWE7QUFBQSxZQUNyRCxPQUFPLGVBQWUsY0FBYyxhQUFhO0FBQUEsWUFDakQsS0FBSyxlQUFlLGNBQWMsYUFBYTtBQUFBLFlBQy9DLEtBQUssZUFBZSxjQUFjLGFBQWE7QUFBQSxVQUNoRDtBQUFBLFVBQ0EsVUFBVTtBQUFBLFlBQ1QsYUFBYSxNQUFNO0FBQUEsWUFDbkIsTUFBTTtBQUFBLGNBQ0w7QUFBQSxnQkFDQyxNQUFNO0FBQUEsZ0JBQ04sYUFBYTtBQUFBLGdCQUNiLFFBQVE7QUFBQSxrQkFDUCxNQUFNO0FBQUEsa0JBQ04sWUFBWTtBQUFBLG9CQUNYLGlCQUFpQjtBQUFBLHNCQUNoQixNQUFNO0FBQUEsc0JBQ04sU0FBUztBQUFBLG9CQUNWO0FBQUEsa0JBQ0Q7QUFBQSxnQkFDRDtBQUFBLGNBQ0Q7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxNQUNBLElBQUksVUFBNEIsU0FBNkM7QUFDNUUsaUJBQVMsSUFBSSxhQUFhLEVBQUUsU0FBUyxlQUFlLElBQUksQ0FBQyxTQUFTLGFBQWE7QUFBQSxNQUNoRjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLGdDQUFnQyxnQkFBOEM7QUFDckYsV0FBTyxnQkFBZ0IsTUFBTSxnQ0FBZ0MsUUFBUTtBQUFBLE1BQ3BFLGNBQWM7QUFDYixjQUFNO0FBQUEsVUFDTCxJQUFJLEdBQUcsZUFBZSxFQUFFO0FBQUEsVUFDeEIsT0FBTyxVQUFVLHFCQUFxQixnQkFBZ0I7QUFBQSxVQUN0RCxNQUFNLENBQUM7QUFBQSxZQUNOLElBQUksT0FBTztBQUFBLFlBQ1gsTUFBTSxlQUFlO0FBQUEsY0FDcEIsZUFBZTtBQUFBLGdCQUNkLGVBQWUsT0FBTyxRQUFRLGVBQWUsRUFBRTtBQUFBLGdCQUMvQyxlQUFlLE9BQU8sR0FBRyxlQUFlLEVBQUUsd0JBQXdCLEtBQUs7QUFBQSxjQUN4RTtBQUFBLFlBQ0Q7QUFBQSxZQUNBLE9BQU87QUFBQSxZQUNQLE9BQU87QUFBQSxVQUNSLENBQUM7QUFBQSxRQUNGLENBQUM7QUFBQSxNQUNGO0FBQUEsTUFDQSxJQUFJLFVBQWtDO0FBQ3JDLGNBQU0sd0JBQXdCLFNBQVMsSUFBSSxzQkFBc0I7QUFDakUsY0FBTSxtQkFBbUIsc0JBQXNCLHdCQUF3QixlQUFlLEVBQUU7QUFDeEYsY0FBTSxpQkFBaUIsc0JBQXNCLHNCQUFzQixnQkFBZ0I7QUFHbkYsWUFBSSxpQkFBaUIsZUFBZSxlQUFlLHVCQUF1QixXQUFXLEdBQUc7QUFDdkYsZ0JBQU0sa0JBQWtCLHNCQUFzQixnQ0FBZ0MsZ0JBQWdCO0FBQzlGLGdDQUFzQiw0QkFBNEIsa0JBQWtCLGlCQUFpQixRQUFXLEtBQUssS0FBSyxFQUFFO0FBQUEsUUFDN0c7QUFFQSw4QkFBc0IscUJBQXFCLENBQUMsY0FBYyxHQUFHLGtCQUFrQixRQUFXLEtBQUssS0FBSyxFQUFFO0FBQ3RHLGlCQUFTLElBQUksYUFBYSxFQUFFLFNBQVMsZUFBZSxJQUFJLElBQUk7QUFBQSxNQUM3RDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLHNCQUFzQixlQUE4Qix1QkFBb0Q7QUFDL0csVUFBTSxPQUFPO0FBQ2IsUUFBTSxnQkFBTixjQUE0QixjQUFjO0FBQUEsTUFDekMsWUFDb0Isa0JBQ08sZ0JBQ1QsZ0JBQ00sc0JBQ1IsY0FDTSxvQkFDRixrQkFDbEI7QUFDRCxjQUFNLGNBQWMsSUFBSSxrQkFBa0IsZ0JBQWdCLHNCQUFzQixjQUFjLG9CQUFvQixrQkFBa0IsY0FBYztBQUFBLE1BQ25KO0FBQUEsTUFFVSx3QkFBd0IsU0FBeUM7QUFDMUUsY0FBTSwrQkFBK0IsS0FBSyxVQUFVLElBQUksZ0JBQWdCLENBQUM7QUFHekUsY0FBTSxvQkFBb0IsS0FBSyx3QkFBd0IsU0FBUyxlQUFlLHVCQUF1Qiw4QkFBOEIsS0FBSyxvQkFBb0I7QUFHN0osWUFBSSxFQUFFLDZCQUE2QiwwQkFBMEI7QUFDNUQsdUNBQTZCLElBQUksTUFBTSxJQUFJLGtCQUFrQixlQUFlLGtCQUFrQixrQkFBa0Isa0JBQWtCLGlCQUFpQixFQUFFLE1BQU07QUFFMUosaUJBQUssZ0JBQWdCO0FBQUEsVUFDdEIsQ0FBQyxDQUFDO0FBQUEsUUFDSDtBQUVBLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQTdCTSxvQkFBTjtBQUFBLE1BRUc7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxPQVJHO0FBK0JOLGFBQVMsR0FBMEIsS0FBSyxxQkFBcUIsY0FBYyxxQkFBcUIsQ0FBQyxFQUFFLHNCQUFzQix3QkFBd0I7QUFBQSxNQUNoSjtBQUFBLE1BQ0EsY0FBYztBQUFBLE1BQ2QsT0FBTyxjQUFjLFVBQVUsV0FBVyxjQUFjLFFBQVEsY0FBYyxNQUFNO0FBQUEsTUFDcEYsU0FBUyxjQUFjLElBQUksSUFBSSxjQUFjLE9BQU87QUFBQSxNQUNwRCxjQUFjO0FBQUEsTUFDZCxjQUFjO0FBQUEsTUFDZCxjQUFjLGdCQUFnQixNQUFNLGNBQWMsT0FBTztBQUFBLElBQzFELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSx3QkFBd0IsZUFBOEIsdUJBQW9EO0FBQ2pILGFBQVMsR0FBMEIsS0FBSyxxQkFBcUIsY0FBYyxxQkFBcUIsQ0FBQyxFQUFFLHdCQUF3QixjQUFjLEVBQUU7QUFBQSxFQUM1STtBQUFBLEVBRVEsd0JBQXdCLFNBQXNCLGVBQThCLHVCQUE4QyxhQUE4QixzQkFBZ0U7QUFDL04sVUFBTSxvQkFBdUMscUJBQXFCLGVBQWUsY0FBYyxlQUFlLE1BQU0sR0FBSSxjQUFjLGVBQWUsbUJBQW1CLENBQUMsQ0FBRTtBQUUzSyxTQUFLLG1CQUFtQixJQUFJLGtCQUFrQixNQUFNLEdBQUcsaUJBQWlCO0FBQ3hFLGdCQUFZLElBQUksYUFBYSxNQUFNLEtBQUssbUJBQW1CLE9BQU8sa0JBQWtCLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFDN0YsZ0JBQVksSUFBSSxrQkFBa0IsY0FBYyxXQUFTLEtBQUssYUFBYSxLQUFLLENBQUMsQ0FBQztBQUNsRixnQkFBWSxJQUFJLGtCQUFrQiwwQkFBMEIsVUFBUSxLQUFLLHlCQUF5QixNQUFNLEtBQUssY0FBYyxDQUFDLENBQUMsQ0FBQztBQUM5SCxnQkFBWSxJQUFJLGtCQUFrQixpQkFBaUIsV0FBUyxLQUFLLGVBQWUsS0FBSyxDQUFDLENBQUM7QUFDdkYsZ0JBQVksSUFBSSxrQkFBa0IsZUFBZSxVQUFRO0FBQ3hELFVBQUksS0FBSyxzQkFBc0IsSUFBSSxNQUFNLEtBQUssSUFBSTtBQUNqRCxhQUFLLHNCQUFzQixJQUFJLEtBQUssRUFBRTtBQUN0QyxhQUFLLHdCQUF3QixLQUFLO0FBQUEsTUFDbkM7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLGdCQUFZLElBQUksa0JBQWtCLGNBQWMsVUFBUTtBQUN2RCxVQUFJLEtBQUssc0JBQXNCLElBQUksTUFBTSxLQUFLLElBQUk7QUFDakQsYUFBSyxzQkFBc0IsTUFBTTtBQUNqQyxhQUFLLHdCQUF3QixLQUFLO0FBQUEsTUFDbkM7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFqcUJhLGVBQU47QUFBQSxFQXNCSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQTFCVTtBQW1xQmIsU0FBUyxrQ0FBa0MsaUJBQWlDO0FBQUUsU0FBTyxpQkFBaUIsZUFBZTtBQUFZO0FBRWpJO0FBQUEsRUFBa0I7QUFBQSxFQUFlO0FBQUEsRUFBYyxrQkFBa0I7QUFBQTtBQUF3SDsiLAogICJuYW1lcyI6IFtdCn0K
