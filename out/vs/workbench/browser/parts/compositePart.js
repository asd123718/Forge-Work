import "./media/compositepart.css";
import { localize } from "../../../nls.js";
import { defaultGenerator } from "../../../base/common/idGenerator.js";
import { dispose, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { Emitter } from "../../../base/common/event.js";
import { isCancellationError } from "../../../base/common/errors.js";
import { ActionsOrientation, prepareActions } from "../../../base/browser/ui/actionbar/actionbar.js";
import { ProgressBar } from "../../../base/browser/ui/progressbar/progressbar.js";
import { Part } from "../part.js";
import { StorageScope, StorageTarget } from "../../../platform/storage/common/storage.js";
import { ServiceCollection } from "../../../platform/instantiation/common/serviceCollection.js";
import { IEditorProgressService } from "../../../platform/progress/common/progress.js";
import { Dimension, append, $, hide, show } from "../../../base/browser/dom.js";
import { AnchorAlignment } from "../../../base/browser/ui/contextview/contextview.js";
import { assertReturnsDefined } from "../../../base/common/types.js";
import { createActionViewItem } from "../../../platform/actions/browser/menuEntryActionViewItem.js";
import { AbstractProgressScope, ScopedProgressIndicator } from "../../services/progress/browser/progressIndicator.js";
import { WorkbenchToolBar } from "../../../platform/actions/browser/toolbar.js";
import { defaultProgressBarStyles } from "../../../platform/theme/browser/defaultStyles.js";
import { createInstantHoverDelegate, getDefaultHoverDelegate } from "../../../base/browser/ui/hover/hoverDelegateFactory.js";
class CompositePart extends Part {
  constructor(notificationService, storageService, contextMenuService, layoutService, keybindingService, hoverService, instantiationService, themeService, registry, activeCompositeSettingsKey, defaultCompositeId, nameForTelemetry, compositeCSSClass, titleForegroundColor, titleBorderColor, id, options) {
    super(id, options, themeService, storageService, layoutService);
    this.notificationService = notificationService;
    this.storageService = storageService;
    this.contextMenuService = contextMenuService;
    this.keybindingService = keybindingService;
    this.hoverService = hoverService;
    this.instantiationService = instantiationService;
    this.registry = registry;
    this.activeCompositeSettingsKey = activeCompositeSettingsKey;
    this.defaultCompositeId = defaultCompositeId;
    this.nameForTelemetry = nameForTelemetry;
    this.compositeCSSClass = compositeCSSClass;
    this.titleForegroundColor = titleForegroundColor;
    this.titleBorderColor = titleBorderColor;
    this.onDidCompositeOpen = this._register(new Emitter());
    this.onDidCompositeClose = this._register(new Emitter());
    this.mapCompositeToCompositeContainer = /* @__PURE__ */ new Map();
    this.mapActionsBindingToComposite = /* @__PURE__ */ new Map();
    this.instantiatedCompositeItems = /* @__PURE__ */ new Map();
    this.actionsListener = this._register(new MutableDisposable());
    this.lastActiveCompositeId = storageService.get(activeCompositeSettingsKey, StorageScope.WORKSPACE, this.defaultCompositeId);
    this.toolbarHoverDelegate = this._register(createInstantHoverDelegate());
    this.trailingSeparator = options.trailingSeparator ?? false;
  }
  openComposite(id, focus) {
    if (this.activeComposite?.getId() === id) {
      if (focus) {
        this.activeComposite.focus();
      }
      return this.activeComposite;
    }
    if (!this.element) {
      return;
    }
    return this.doOpenComposite(id, focus);
  }
  doOpenComposite(id, focus = false) {
    const currentCompositeOpenToken = defaultGenerator.nextId();
    this.currentCompositeOpenToken = currentCompositeOpenToken;
    if (this.activeComposite) {
      this.hideActiveComposite();
    }
    this.updateTitle(id);
    const composite = this.createComposite(id, true);
    if (this.currentCompositeOpenToken !== currentCompositeOpenToken || this.activeComposite && this.activeComposite.getId() !== composite.getId()) {
      return void 0;
    }
    if (this.activeComposite?.getId() === composite.getId()) {
      if (focus) {
        composite.focus();
      }
      this.onDidCompositeOpen.fire({ composite, focus });
      return composite;
    }
    this.showComposite(composite);
    if (focus) {
      composite.focus();
    }
    if (composite) {
      this.onDidCompositeOpen.fire({ composite, focus });
    }
    return composite;
  }
  createComposite(id, isActive) {
    const compositeItem = this.instantiatedCompositeItems.get(id);
    if (compositeItem) {
      return compositeItem.composite;
    }
    const compositeDescriptor = this.registry.getComposite(id);
    if (compositeDescriptor) {
      const disposable = new DisposableStore();
      const that = this;
      const compositeProgressIndicator = disposable.add(new ScopedProgressIndicator(assertReturnsDefined(this.progressBar), disposable.add(new class extends AbstractProgressScope {
        constructor() {
          super(compositeDescriptor.id, !!isActive);
          this._register(that.onDidCompositeOpen.event((e) => this.onScopeOpened(e.composite.getId())));
          this._register(that.onDidCompositeClose.event((e) => this.onScopeClosed(e.getId())));
        }
      }())));
      const compositeInstantiationService = disposable.add(this.instantiationService.createChild(new ServiceCollection(
        [IEditorProgressService, compositeProgressIndicator]
        // provide the editor progress service for any editors instantiated within the composite
      )));
      const composite = compositeDescriptor.instantiate(compositeInstantiationService);
      this.instantiatedCompositeItems.set(id, { composite, disposable, progress: compositeProgressIndicator });
      disposable.add(composite.onTitleAreaUpdate(() => this.onTitleAreaUpdate(composite.getId()), this));
      return composite;
    }
    throw new Error(`Unable to find composite with id ${id}`);
  }
  showComposite(composite) {
    this.activeComposite = composite;
    const id = this.activeComposite.getId();
    if (id !== this.defaultCompositeId) {
      this.storageService.store(this.activeCompositeSettingsKey, id, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(this.activeCompositeSettingsKey, StorageScope.WORKSPACE);
    }
    this.lastActiveCompositeId = this.activeComposite.getId();
    let compositeContainer = this.mapCompositeToCompositeContainer.get(composite.getId());
    if (!compositeContainer) {
      compositeContainer = $(".composite");
      compositeContainer.classList.add(...this.compositeCSSClass.split(" "));
      compositeContainer.id = composite.getId();
      composite.create(compositeContainer);
      composite.updateStyles();
      this.mapCompositeToCompositeContainer.set(composite.getId(), compositeContainer);
    }
    if (!this.activeComposite || composite.getId() !== this.activeComposite.getId()) {
      return void 0;
    }
    this.contentArea?.appendChild(compositeContainer);
    show(compositeContainer);
    if (this.toolBar) {
      this.toolBar.actionRunner = composite.getActionRunner();
    }
    const descriptor = this.registry.getComposite(composite.getId());
    if (descriptor && descriptor.name !== composite.getTitle()) {
      this.updateTitle(composite.getId(), composite.getTitle());
    }
    let actionsBinding = this.mapActionsBindingToComposite.get(composite.getId());
    if (!actionsBinding) {
      actionsBinding = this.collectCompositeActions(composite);
      this.mapActionsBindingToComposite.set(composite.getId(), actionsBinding);
    }
    actionsBinding();
    if (this.toolBar) {
      this.actionsListener.value = this.toolBar.actionRunner.onDidRun((e) => {
        if (e.error && !isCancellationError(e.error)) {
          this.notificationService.error(e.error);
        }
      });
    }
    composite.setVisible(true);
    if (!this.activeComposite || composite.getId() !== this.activeComposite.getId()) {
      return;
    }
    if (this.contentAreaSize) {
      composite.layout(this.contentAreaSize);
    }
    if (this.boundarySashes) {
      composite.setBoundarySashes(this.boundarySashes);
    }
  }
  onTitleAreaUpdate(compositeId) {
    const composite = this.instantiatedCompositeItems.get(compositeId);
    if (composite) {
      this.updateTitle(compositeId, composite.composite.getTitle());
    }
    if (this.activeComposite?.getId() === compositeId) {
      const actionsBinding = this.collectCompositeActions(this.activeComposite);
      this.mapActionsBindingToComposite.set(this.activeComposite.getId(), actionsBinding);
      actionsBinding();
    } else {
      this.mapActionsBindingToComposite.delete(compositeId);
    }
  }
  updateTitle(compositeId, compositeTitle) {
    const compositeDescriptor = this.registry.getComposite(compositeId);
    if (!compositeDescriptor || !this.titleLabel) {
      return;
    }
    if (!compositeTitle) {
      compositeTitle = compositeDescriptor.name;
    }
    const keybinding = this.keybindingService.lookupKeybinding(compositeId);
    this.titleLabel.updateTitle(compositeId, compositeTitle, keybinding?.getLabel() ?? void 0);
    this.toolBar?.setAriaLabel(localize("ariaCompositeToolbarLabel", "{0} actions", compositeTitle));
  }
  collectCompositeActions(composite) {
    const menuIds = composite?.getMenuIds();
    const primaryActions = composite?.getActions().slice(0) || [];
    const secondaryActions = composite?.getSecondaryActions().slice(0) || [];
    if (this.toolBar) {
      this.toolBar.context = this.actionsContextProvider();
    }
    return () => {
      this.toolBar?.setActions(prepareActions(primaryActions), prepareActions(secondaryActions), menuIds);
      this.titleArea?.classList.toggle("has-actions", primaryActions.length > 0 || secondaryActions.length > 0);
    };
  }
  getActiveComposite() {
    return this.activeComposite;
  }
  getLastActiveCompositeId() {
    return this.lastActiveCompositeId;
  }
  hideActiveComposite() {
    if (!this.activeComposite) {
      return void 0;
    }
    const composite = this.activeComposite;
    this.activeComposite = void 0;
    const compositeContainer = this.mapCompositeToCompositeContainer.get(composite.getId());
    composite.setVisible(false);
    if (compositeContainer) {
      compositeContainer.remove();
      hide(compositeContainer);
    }
    this.progressBar?.stop().hide();
    if (this.toolBar) {
      this.collectCompositeActions()();
    }
    this.onDidCompositeClose.fire(composite);
    return composite;
  }
  createTitleArea(parent) {
    if (!this.options.hasTitle) {
      return void 0;
    }
    const titleArea = append(parent, $(".composite"));
    titleArea.classList.add("title");
    this.titleLabel = this.createTitleLabel(titleArea);
    const titleActionsContainer = append(titleArea, $(".title-actions"));
    this.toolBar = this._register(this.instantiationService.createInstance(WorkbenchToolBar, titleActionsContainer, {
      actionViewItemProvider: (action, options) => this.actionViewItemProvider(action, options),
      orientation: ActionsOrientation.HORIZONTAL,
      getKeyBinding: (action) => this.keybindingService.lookupKeybinding(action.id),
      anchorAlignmentProvider: () => this.getTitleAreaDropDownAnchorAlignment(),
      toggleMenuTitle: localize("viewsAndMoreActions", "Views and More Actions..."),
      telemetrySource: this.nameForTelemetry,
      hoverDelegate: this.toolbarHoverDelegate,
      trailingSeparator: this.trailingSeparator
    }));
    this.collectCompositeActions()();
    return titleArea;
  }
  createTitleLabel(parent) {
    const titleContainer = append(parent, $(".title-label"));
    const titleLabel = append(titleContainer, $("h2"));
    this.titleLabelElement = titleLabel;
    const hover = this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), titleLabel, ""));
    const $this = this;
    return {
      updateTitle: (id, title, keybinding) => {
        if (!this.activeComposite || this.activeComposite.getId() === id) {
          titleLabel.textContent = title;
          hover.update(keybinding ? localize("titleTooltip", "{0} ({1})", title, keybinding) : title);
        }
      },
      updateStyles: () => {
        titleLabel.style.color = $this.titleForegroundColor ? $this.getColor($this.titleForegroundColor) || "" : "";
        const borderColor = $this.titleBorderColor ? $this.getColor($this.titleBorderColor) : void 0;
        parent.style.borderBottom = borderColor ? `1px solid ${borderColor}` : "";
      }
    };
  }
  createHeaderArea() {
    return $(".composite");
  }
  createFooterArea() {
    return $(".composite");
  }
  updateStyles() {
    super.updateStyles();
    this.titleLabel?.updateStyles();
  }
  actionViewItemProvider(action, options) {
    if (this.activeComposite) {
      return this.activeComposite.getActionViewItem(action, options);
    }
    return createActionViewItem(this.instantiationService, action, options);
  }
  actionsContextProvider() {
    if (this.activeComposite) {
      return this.activeComposite.getActionsContext();
    }
    return null;
  }
  createContentArea(parent) {
    const contentContainer = append(parent, $(".content"));
    this.progressBar = this._register(new ProgressBar(contentContainer, defaultProgressBarStyles));
    this.progressBar.hide();
    return contentContainer;
  }
  getProgressIndicator(id) {
    const compositeItem = this.instantiatedCompositeItems.get(id);
    return compositeItem ? compositeItem.progress : void 0;
  }
  getTitleAreaDropDownAnchorAlignment() {
    return AnchorAlignment.RIGHT;
  }
  layout(width, height, top, left) {
    super.layout(width, height, top, left);
    this.contentAreaSize = Dimension.lift(super.layoutContents(width, height).contentSize);
    this.activeComposite?.layout(this.contentAreaSize);
  }
  setBoundarySashes(sashes) {
    this.boundarySashes = sashes;
    this.activeComposite?.setBoundarySashes(sashes);
  }
  removeComposite(compositeId) {
    if (this.activeComposite?.getId() === compositeId) {
      return false;
    }
    this.mapCompositeToCompositeContainer.delete(compositeId);
    this.mapActionsBindingToComposite.delete(compositeId);
    const compositeItem = this.instantiatedCompositeItems.get(compositeId);
    if (compositeItem) {
      compositeItem.composite.dispose();
      dispose(compositeItem.disposable);
      this.instantiatedCompositeItems.delete(compositeId);
    }
    return true;
  }
  dispose() {
    this.mapCompositeToCompositeContainer.clear();
    this.mapActionsBindingToComposite.clear();
    this.instantiatedCompositeItems.forEach((compositeItem) => {
      compositeItem.composite.dispose();
      dispose(compositeItem.disposable);
    });
    this.instantiatedCompositeItems.clear();
    super.dispose();
  }
}
export {
  CompositePart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxjb21wb3NpdGVQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2NvbXBvc2l0ZXBhcnQuY3NzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGRlZmF1bHRHZW5lcmF0b3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9pZEdlbmVyYXRvci5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgZGlzcG9zZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgQWN0aW9uc09yaWVudGF0aW9uLCBJQWN0aW9uVmlld0l0ZW0sIHByZXBhcmVBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgUHJvZ3Jlc3NCYXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvcHJvZ3Jlc3NiYXIvcHJvZ3Jlc3NiYXIuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgUGFydCwgSVBhcnRPcHRpb25zIH0gZnJvbSAnLi4vcGFydC5qcyc7XG5pbXBvcnQgeyBDb21wb3NpdGUsIENvbXBvc2l0ZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IElDb21wb3NpdGUgfSBmcm9tICcuLi8uLi9jb21tb24vY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc0luZGljYXRvciwgSUVkaXRvclByb2dyZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgRGltZW5zaW9uLCBhcHBlbmQsICQsIGhpZGUsIHNob3cgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFuY2hvckFsaWdubWVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb250ZXh0dmlldy9jb250ZXh0dmlldy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRSZXR1cm5zRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IEFic3RyYWN0UHJvZ3Jlc3NTY29wZSwgU2NvcGVkUHJvZ3Jlc3NJbmRpY2F0b3IgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9wcm9ncmVzcy9icm93c2VyL3Byb2dyZXNzSW5kaWNhdG9yLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0UHJvZ3Jlc3NCYXJTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSUJvdW5kYXJ5U2FzaGVzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Nhc2gvc2FzaC5qcyc7XG5pbXBvcnQgeyBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IElIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGUuanMnO1xuaW1wb3J0IHsgY3JlYXRlSW5zdGFudEhvdmVyRGVsZWdhdGUsIGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB0eXBlIHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDb21wb3NpdGVUaXRsZUxhYmVsIHtcblxuXHQvKipcblx0ICogQXNrcyB0byB1cGRhdGUgdGhlIHRpdGxlIGZvciB0aGUgY29tcG9zaXRlIHdpdGggdGhlIGdpdmVuIElELlxuXHQgKi9cblx0dXBkYXRlVGl0bGUoaWQ6IHN0cmluZywgdGl0bGU6IHN0cmluZywga2V5YmluZGluZz86IHN0cmluZyk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIENhbGxlZCB3aGVuIHRoZW1pbmcgaW5mb3JtYXRpb24gY2hhbmdlcy5cblx0ICovXG5cdHVwZGF0ZVN0eWxlcygpOiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgQ29tcG9zaXRlSXRlbSB7XG5cdHJlYWRvbmx5IGNvbXBvc2l0ZTogQ29tcG9zaXRlO1xuXHRyZWFkb25seSBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZTtcblx0cmVhZG9ubHkgcHJvZ3Jlc3M6IElQcm9ncmVzc0luZGljYXRvcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29tcG9zaXRlUGFydE9wdGlvbnMgZXh0ZW5kcyBJUGFydE9wdGlvbnMge1xuXHRyZWFkb25seSB0cmFpbGluZ1NlcGFyYXRvcj86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBDb21wb3NpdGVQYXJ0PFQgZXh0ZW5kcyBDb21wb3NpdGUsIE1lbWVudG9UeXBlIGV4dGVuZHMgb2JqZWN0ID0gb2JqZWN0PiBleHRlbmRzIFBhcnQ8TWVtZW50b1R5cGU+IHtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgb25EaWRDb21wb3NpdGVPcGVuID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBjb21wb3NpdGU6IElDb21wb3NpdGU7IGZvY3VzOiBib29sZWFuIH0+KCkpO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgb25EaWRDb21wb3NpdGVDbG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElDb21wb3NpdGU+KCkpO1xuXG5cdHByb3RlY3RlZCB0b29sQmFyOiBXb3JrYmVuY2hUb29sQmFyIHwgdW5kZWZpbmVkO1xuXHRwcm90ZWN0ZWQgdGl0bGVMYWJlbEVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgdG9vbGJhckhvdmVyRGVsZWdhdGU6IElIb3ZlckRlbGVnYXRlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbWFwQ29tcG9zaXRlVG9Db21wb3NpdGVDb250YWluZXIgPSBuZXcgTWFwPHN0cmluZywgSFRNTEVsZW1lbnQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWFwQWN0aW9uc0JpbmRpbmdUb0NvbXBvc2l0ZSA9IG5ldyBNYXA8c3RyaW5nLCAoKSA9PiB2b2lkPigpO1xuXHRwcml2YXRlIGFjdGl2ZUNvbXBvc2l0ZTogQ29tcG9zaXRlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGxhc3RBY3RpdmVDb21wb3NpdGVJZDogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRlZENvbXBvc2l0ZUl0ZW1zID0gbmV3IE1hcDxzdHJpbmcsIENvbXBvc2l0ZUl0ZW0+KCk7XG5cdHByb3RlY3RlZCB0aXRsZUxhYmVsOiBJQ29tcG9zaXRlVGl0bGVMYWJlbCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBwcm9ncmVzc0JhcjogUHJvZ3Jlc3NCYXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY29udGVudEFyZWFTaXplOiBEaW1lbnNpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgYWN0aW9uc0xpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIGN1cnJlbnRDb21wb3NpdGVPcGVuVG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBib3VuZGFyeVNhc2hlczogSUJvdW5kYXJ5U2FzaGVzIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IHRyYWlsaW5nU2VwYXJhdG9yOiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHR0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IHJlZ2lzdHJ5OiBDb21wb3NpdGVSZWdpc3RyeTxUPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGFjdGl2ZUNvbXBvc2l0ZVNldHRpbmdzS2V5OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkZWZhdWx0Q29tcG9zaXRlSWQ6IHN0cmluZyxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgbmFtZUZvclRlbGVtZXRyeTogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29tcG9zaXRlQ1NTQ2xhc3M6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRpdGxlRm9yZWdyb3VuZENvbG9yOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB0aXRsZUJvcmRlckNvbG9yOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0aWQ6IHN0cmluZyxcblx0XHRvcHRpb25zOiBJQ29tcG9zaXRlUGFydE9wdGlvbnNcblx0KSB7XG5cdFx0c3VwZXIoaWQsIG9wdGlvbnMsIHRoZW1lU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxheW91dFNlcnZpY2UpO1xuXG5cdFx0dGhpcy5sYXN0QWN0aXZlQ29tcG9zaXRlSWQgPSBzdG9yYWdlU2VydmljZS5nZXQoYWN0aXZlQ29tcG9zaXRlU2V0dGluZ3NLZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIHRoaXMuZGVmYXVsdENvbXBvc2l0ZUlkKTtcblx0XHR0aGlzLnRvb2xiYXJIb3ZlckRlbGVnYXRlID0gdGhpcy5fcmVnaXN0ZXIoY3JlYXRlSW5zdGFudEhvdmVyRGVsZWdhdGUoKSk7XG5cdFx0dGhpcy50cmFpbGluZ1NlcGFyYXRvciA9IG9wdGlvbnMudHJhaWxpbmdTZXBhcmF0b3IgPz8gZmFsc2U7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3BlbkNvbXBvc2l0ZShpZDogc3RyaW5nLCBmb2N1cz86IGJvb2xlYW4pOiBDb21wb3NpdGUgfCB1bmRlZmluZWQge1xuXG5cdFx0Ly8gQ2hlY2sgaWYgY29tcG9zaXRlIGFscmVhZHkgdmlzaWJsZSBhbmQganVzdCBmb2N1cyBpbiB0aGF0IGNhc2Vcblx0XHRpZiAodGhpcy5hY3RpdmVDb21wb3NpdGU/LmdldElkKCkgPT09IGlkKSB7XG5cdFx0XHRpZiAoZm9jdXMpIHtcblx0XHRcdFx0dGhpcy5hY3RpdmVDb21wb3NpdGUuZm9jdXMoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRnVsbGZpbGwgcHJvbWlzZSB3aXRoIGNvbXBvc2l0ZSB0aGF0IGlzIGJlaW5nIG9wZW5lZFxuXHRcdFx0cmV0dXJuIHRoaXMuYWN0aXZlQ29tcG9zaXRlO1xuXHRcdH1cblxuXHRcdC8vIFdlIGNhbm5vdCBvcGVuIHRoZSBjb21wb3NpdGUgaWYgd2UgaGF2ZSBub3QgYmVlbiBjcmVhdGVkIHlldFxuXHRcdGlmICghdGhpcy5lbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gT3BlblxuXHRcdHJldHVybiB0aGlzLmRvT3BlbkNvbXBvc2l0ZShpZCwgZm9jdXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb09wZW5Db21wb3NpdGUoaWQ6IHN0cmluZywgZm9jdXM6IGJvb2xlYW4gPSBmYWxzZSk6IENvbXBvc2l0ZSB8IHVuZGVmaW5lZCB7XG5cblx0XHQvLyBVc2UgYSBnZW5lcmF0ZWQgdG9rZW4gdG8gYXZvaWQgcmFjZSBjb25kaXRpb25zIGZyb20gbG9uZyBydW5uaW5nIHByb21pc2VzXG5cdFx0Y29uc3QgY3VycmVudENvbXBvc2l0ZU9wZW5Ub2tlbiA9IGRlZmF1bHRHZW5lcmF0b3IubmV4dElkKCk7XG5cdFx0dGhpcy5jdXJyZW50Q29tcG9zaXRlT3BlblRva2VuID0gY3VycmVudENvbXBvc2l0ZU9wZW5Ub2tlbjtcblxuXHRcdC8vIEhpZGUgY3VycmVudFxuXHRcdGlmICh0aGlzLmFjdGl2ZUNvbXBvc2l0ZSkge1xuXHRcdFx0dGhpcy5oaWRlQWN0aXZlQ29tcG9zaXRlKCk7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIFRpdGxlXG5cdFx0dGhpcy51cGRhdGVUaXRsZShpZCk7XG5cblx0XHQvLyBDcmVhdGUgY29tcG9zaXRlXG5cdFx0Y29uc3QgY29tcG9zaXRlID0gdGhpcy5jcmVhdGVDb21wb3NpdGUoaWQsIHRydWUpO1xuXG5cdFx0Ly8gQ2hlY2sgaWYgYW5vdGhlciBjb21wb3NpdGUgb3BlbmVkIG1lYW53aGlsZSBhbmQgcmV0dXJuIGluIHRoYXQgY2FzZVxuXHRcdGlmICgodGhpcy5jdXJyZW50Q29tcG9zaXRlT3BlblRva2VuICE9PSBjdXJyZW50Q29tcG9zaXRlT3BlblRva2VuKSB8fCAodGhpcy5hY3RpdmVDb21wb3NpdGUgJiYgdGhpcy5hY3RpdmVDb21wb3NpdGUuZ2V0SWQoKSAhPT0gY29tcG9zaXRlLmdldElkKCkpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIGNvbXBvc2l0ZSBhbHJlYWR5IHZpc2libGUgYW5kIGp1c3QgZm9jdXMgaW4gdGhhdCBjYXNlXG5cdFx0aWYgKHRoaXMuYWN0aXZlQ29tcG9zaXRlPy5nZXRJZCgpID09PSBjb21wb3NpdGUuZ2V0SWQoKSkge1xuXHRcdFx0aWYgKGZvY3VzKSB7XG5cdFx0XHRcdGNvbXBvc2l0ZS5mb2N1cygpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLm9uRGlkQ29tcG9zaXRlT3Blbi5maXJlKHsgY29tcG9zaXRlLCBmb2N1cyB9KTtcblx0XHRcdHJldHVybiBjb21wb3NpdGU7XG5cdFx0fVxuXG5cdFx0Ly8gU2hvdyBDb21wb3NpdGUgYW5kIEZvY3VzXG5cdFx0dGhpcy5zaG93Q29tcG9zaXRlKGNvbXBvc2l0ZSk7XG5cdFx0aWYgKGZvY3VzKSB7XG5cdFx0XHRjb21wb3NpdGUuZm9jdXMoKTtcblx0XHR9XG5cblx0XHQvLyBSZXR1cm4gd2l0aCB0aGUgY29tcG9zaXRlIHRoYXQgaXMgYmVpbmcgb3BlbmVkXG5cdFx0aWYgKGNvbXBvc2l0ZSkge1xuXHRcdFx0dGhpcy5vbkRpZENvbXBvc2l0ZU9wZW4uZmlyZSh7IGNvbXBvc2l0ZSwgZm9jdXMgfSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbXBvc2l0ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVDb21wb3NpdGUoaWQ6IHN0cmluZywgaXNBY3RpdmU/OiBib29sZWFuKTogQ29tcG9zaXRlIHtcblxuXHRcdC8vIENoZWNrIGlmIGNvbXBvc2l0ZSBpcyBhbHJlYWR5IGNyZWF0ZWRcblx0XHRjb25zdCBjb21wb3NpdGVJdGVtID0gdGhpcy5pbnN0YW50aWF0ZWRDb21wb3NpdGVJdGVtcy5nZXQoaWQpO1xuXHRcdGlmIChjb21wb3NpdGVJdGVtKSB7XG5cdFx0XHRyZXR1cm4gY29tcG9zaXRlSXRlbS5jb21wb3NpdGU7XG5cdFx0fVxuXG5cdFx0Ly8gSW5zdGFudGlhdGUgY29tcG9zaXRlIGZyb20gcmVnaXN0cnkgb3RoZXJ3aXNlXG5cdFx0Y29uc3QgY29tcG9zaXRlRGVzY3JpcHRvciA9IHRoaXMucmVnaXN0cnkuZ2V0Q29tcG9zaXRlKGlkKTtcblx0XHRpZiAoY29tcG9zaXRlRGVzY3JpcHRvcikge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdFx0Y29uc3QgY29tcG9zaXRlUHJvZ3Jlc3NJbmRpY2F0b3IgPSBkaXNwb3NhYmxlLmFkZChuZXcgU2NvcGVkUHJvZ3Jlc3NJbmRpY2F0b3IoYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5wcm9ncmVzc0JhciksIGRpc3Bvc2FibGUuYWRkKG5ldyBjbGFzcyBleHRlbmRzIEFic3RyYWN0UHJvZ3Jlc3NTY29wZSB7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdHN1cGVyKGNvbXBvc2l0ZURlc2NyaXB0b3IhLmlkLCAhIWlzQWN0aXZlKTtcblx0XHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGF0Lm9uRGlkQ29tcG9zaXRlT3Blbi5ldmVudChlID0+IHRoaXMub25TY29wZU9wZW5lZChlLmNvbXBvc2l0ZS5nZXRJZCgpKSkpO1xuXHRcdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoYXQub25EaWRDb21wb3NpdGVDbG9zZS5ldmVudChlID0+IHRoaXMub25TY29wZUNsb3NlZChlLmdldElkKCkpKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0oKSkpKTtcblx0XHRcdGNvbnN0IGNvbXBvc2l0ZUluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZS5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRcdFtJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlLCBjb21wb3NpdGVQcm9ncmVzc0luZGljYXRvcl0gLy8gcHJvdmlkZSB0aGUgZWRpdG9yIHByb2dyZXNzIHNlcnZpY2UgZm9yIGFueSBlZGl0b3JzIGluc3RhbnRpYXRlZCB3aXRoaW4gdGhlIGNvbXBvc2l0ZVxuXHRcdFx0KSkpO1xuXG5cdFx0XHRjb25zdCBjb21wb3NpdGUgPSBjb21wb3NpdGVEZXNjcmlwdG9yLmluc3RhbnRpYXRlKGNvbXBvc2l0ZUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdFx0Ly8gUmVtZW1iZXIgYXMgSW5zdGFudGlhdGVkXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRlZENvbXBvc2l0ZUl0ZW1zLnNldChpZCwgeyBjb21wb3NpdGUsIGRpc3Bvc2FibGUsIHByb2dyZXNzOiBjb21wb3NpdGVQcm9ncmVzc0luZGljYXRvciB9KTtcblxuXHRcdFx0Ly8gUmVnaXN0ZXIgdG8gdGl0bGUgYXJlYSB1cGRhdGUgZXZlbnRzIGZyb20gdGhlIGNvbXBvc2l0ZVxuXHRcdFx0ZGlzcG9zYWJsZS5hZGQoY29tcG9zaXRlLm9uVGl0bGVBcmVhVXBkYXRlKCgpID0+IHRoaXMub25UaXRsZUFyZWFVcGRhdGUoY29tcG9zaXRlLmdldElkKCkpLCB0aGlzKSk7XG5cblx0XHRcdHJldHVybiBjb21wb3NpdGU7XG5cdFx0fVxuXG5cdFx0dGhyb3cgbmV3IEVycm9yKGBVbmFibGUgdG8gZmluZCBjb21wb3NpdGUgd2l0aCBpZCAke2lkfWApO1xuXHR9XG5cblx0cHJvdGVjdGVkIHNob3dDb21wb3NpdGUoY29tcG9zaXRlOiBDb21wb3NpdGUpOiB2b2lkIHtcblxuXHRcdC8vIFJlbWVtYmVyIENvbXBvc2l0ZVxuXHRcdHRoaXMuYWN0aXZlQ29tcG9zaXRlID0gY29tcG9zaXRlO1xuXG5cdFx0Ly8gU3RvcmUgaW4gcHJlZmVyZW5jZXNcblx0XHRjb25zdCBpZCA9IHRoaXMuYWN0aXZlQ29tcG9zaXRlLmdldElkKCk7XG5cdFx0aWYgKGlkICE9PSB0aGlzLmRlZmF1bHRDb21wb3NpdGVJZCkge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZSh0aGlzLmFjdGl2ZUNvbXBvc2l0ZVNldHRpbmdzS2V5LCBpZCwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUodGhpcy5hY3RpdmVDb21wb3NpdGVTZXR0aW5nc0tleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtZW1iZXJcblx0XHR0aGlzLmxhc3RBY3RpdmVDb21wb3NpdGVJZCA9IHRoaXMuYWN0aXZlQ29tcG9zaXRlLmdldElkKCk7XG5cblx0XHQvLyBDb21wb3NpdGVzIGNyZWF0ZWQgZm9yIHRoZSBmaXJzdCB0aW1lXG5cdFx0bGV0IGNvbXBvc2l0ZUNvbnRhaW5lciA9IHRoaXMubWFwQ29tcG9zaXRlVG9Db21wb3NpdGVDb250YWluZXIuZ2V0KGNvbXBvc2l0ZS5nZXRJZCgpKTtcblx0XHRpZiAoIWNvbXBvc2l0ZUNvbnRhaW5lcikge1xuXG5cdFx0XHQvLyBCdWlsZCBDb250YWluZXIgb2ZmLURPTVxuXHRcdFx0Y29tcG9zaXRlQ29udGFpbmVyID0gJCgnLmNvbXBvc2l0ZScpO1xuXHRcdFx0Y29tcG9zaXRlQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoLi4udGhpcy5jb21wb3NpdGVDU1NDbGFzcy5zcGxpdCgnICcpKTtcblx0XHRcdGNvbXBvc2l0ZUNvbnRhaW5lci5pZCA9IGNvbXBvc2l0ZS5nZXRJZCgpO1xuXG5cdFx0XHRjb21wb3NpdGUuY3JlYXRlKGNvbXBvc2l0ZUNvbnRhaW5lcik7XG5cdFx0XHRjb21wb3NpdGUudXBkYXRlU3R5bGVzKCk7XG5cblx0XHRcdC8vIFJlbWVtYmVyIGNvbXBvc2l0ZSBjb250YWluZXJcblx0XHRcdHRoaXMubWFwQ29tcG9zaXRlVG9Db21wb3NpdGVDb250YWluZXIuc2V0KGNvbXBvc2l0ZS5nZXRJZCgpLCBjb21wb3NpdGVDb250YWluZXIpO1xuXHRcdH1cblxuXHRcdC8vIEZpbGwgQ29udGVudCBhbmQgQWN0aW9uc1xuXHRcdC8vIE1ha2Ugc3VyZSB0aGF0IHRoZSB1c2VyIG1lYW53aGlsZSBkaWQgbm90IG9wZW4gYW5vdGhlciBjb21wb3NpdGUgb3IgY2xvc2VkIHRoZSBwYXJ0IGNvbnRhaW5pbmcgdGhlIGNvbXBvc2l0ZVxuXHRcdGlmICghdGhpcy5hY3RpdmVDb21wb3NpdGUgfHwgY29tcG9zaXRlLmdldElkKCkgIT09IHRoaXMuYWN0aXZlQ29tcG9zaXRlLmdldElkKCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gVGFrZSBDb21wb3NpdGUgb24tRE9NIGFuZCBzaG93XG5cdFx0dGhpcy5jb250ZW50QXJlYT8uYXBwZW5kQ2hpbGQoY29tcG9zaXRlQ29udGFpbmVyKTtcblx0XHRzaG93KGNvbXBvc2l0ZUNvbnRhaW5lcik7XG5cblx0XHQvLyBTZXR1cCBhY3Rpb24gcnVubmVyXG5cdFx0aWYgKHRoaXMudG9vbEJhcikge1xuXHRcdFx0dGhpcy50b29sQmFyLmFjdGlvblJ1bm5lciA9IGNvbXBvc2l0ZS5nZXRBY3Rpb25SdW5uZXIoKTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgdGl0bGUgd2l0aCBjb21wb3NpdGUgdGl0bGUgaWYgaXQgZGlmZmVycyBmcm9tIGRlc2NyaXB0b3Jcblx0XHRjb25zdCBkZXNjcmlwdG9yID0gdGhpcy5yZWdpc3RyeS5nZXRDb21wb3NpdGUoY29tcG9zaXRlLmdldElkKCkpO1xuXHRcdGlmIChkZXNjcmlwdG9yICYmIGRlc2NyaXB0b3IubmFtZSAhPT0gY29tcG9zaXRlLmdldFRpdGxlKCkpIHtcblx0XHRcdHRoaXMudXBkYXRlVGl0bGUoY29tcG9zaXRlLmdldElkKCksIGNvbXBvc2l0ZS5nZXRUaXRsZSgpKTtcblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgQ29tcG9zaXRlIEFjdGlvbnNcblx0XHRsZXQgYWN0aW9uc0JpbmRpbmcgPSB0aGlzLm1hcEFjdGlvbnNCaW5kaW5nVG9Db21wb3NpdGUuZ2V0KGNvbXBvc2l0ZS5nZXRJZCgpKTtcblx0XHRpZiAoIWFjdGlvbnNCaW5kaW5nKSB7XG5cdFx0XHRhY3Rpb25zQmluZGluZyA9IHRoaXMuY29sbGVjdENvbXBvc2l0ZUFjdGlvbnMoY29tcG9zaXRlKTtcblx0XHRcdHRoaXMubWFwQWN0aW9uc0JpbmRpbmdUb0NvbXBvc2l0ZS5zZXQoY29tcG9zaXRlLmdldElkKCksIGFjdGlvbnNCaW5kaW5nKTtcblx0XHR9XG5cdFx0YWN0aW9uc0JpbmRpbmcoKTtcblxuXHRcdC8vIEFjdGlvbiBSdW4gSGFuZGxpbmdcblx0XHRpZiAodGhpcy50b29sQmFyKSB7XG5cdFx0XHR0aGlzLmFjdGlvbnNMaXN0ZW5lci52YWx1ZSA9IHRoaXMudG9vbEJhci5hY3Rpb25SdW5uZXIub25EaWRSdW4oZSA9PiB7XG5cblx0XHRcdFx0Ly8gQ2hlY2sgZm9yIEVycm9yXG5cdFx0XHRcdGlmIChlLmVycm9yICYmICFpc0NhbmNlbGxhdGlvbkVycm9yKGUuZXJyb3IpKSB7XG5cdFx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGUuZXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBJbmRpY2F0ZSB0byBjb21wb3NpdGUgdGhhdCBpdCBpcyBub3cgdmlzaWJsZVxuXHRcdGNvbXBvc2l0ZS5zZXRWaXNpYmxlKHRydWUpO1xuXG5cdFx0Ly8gTWFrZSBzdXJlIHRoYXQgdGhlIHVzZXIgbWVhbndoaWxlIGRpZCBub3Qgb3BlbiBhbm90aGVyIGNvbXBvc2l0ZSBvciBjbG9zZWQgdGhlIHBhcnQgY29udGFpbmluZyB0aGUgY29tcG9zaXRlXG5cdFx0aWYgKCF0aGlzLmFjdGl2ZUNvbXBvc2l0ZSB8fCBjb21wb3NpdGUuZ2V0SWQoKSAhPT0gdGhpcy5hY3RpdmVDb21wb3NpdGUuZ2V0SWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE1ha2Ugc3VyZSB0aGUgY29tcG9zaXRlIGlzIGxheWVkIG91dFxuXHRcdGlmICh0aGlzLmNvbnRlbnRBcmVhU2l6ZSkge1xuXHRcdFx0Y29tcG9zaXRlLmxheW91dCh0aGlzLmNvbnRlbnRBcmVhU2l6ZSk7XG5cdFx0fVxuXG5cdFx0Ly8gTWFrZSBzdXJlIGJvdW5kYXJ5IHNhc2hlcyBhcmUgcHJvcGFnYXRlZFxuXHRcdGlmICh0aGlzLmJvdW5kYXJ5U2FzaGVzKSB7XG5cdFx0XHRjb21wb3NpdGUuc2V0Qm91bmRhcnlTYXNoZXModGhpcy5ib3VuZGFyeVNhc2hlcyk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG9uVGl0bGVBcmVhVXBkYXRlKGNvbXBvc2l0ZUlkOiBzdHJpbmcpOiB2b2lkIHtcblxuXHRcdC8vIFRpdGxlXG5cdFx0Y29uc3QgY29tcG9zaXRlID0gdGhpcy5pbnN0YW50aWF0ZWRDb21wb3NpdGVJdGVtcy5nZXQoY29tcG9zaXRlSWQpO1xuXHRcdGlmIChjb21wb3NpdGUpIHtcblx0XHRcdHRoaXMudXBkYXRlVGl0bGUoY29tcG9zaXRlSWQsIGNvbXBvc2l0ZS5jb21wb3NpdGUuZ2V0VGl0bGUoKSk7XG5cdFx0fVxuXG5cdFx0Ly8gQWN0aXZlIENvbXBvc2l0ZVxuXHRcdGlmICh0aGlzLmFjdGl2ZUNvbXBvc2l0ZT8uZ2V0SWQoKSA9PT0gY29tcG9zaXRlSWQpIHtcblx0XHRcdC8vIEFjdGlvbnNcblx0XHRcdGNvbnN0IGFjdGlvbnNCaW5kaW5nID0gdGhpcy5jb2xsZWN0Q29tcG9zaXRlQWN0aW9ucyh0aGlzLmFjdGl2ZUNvbXBvc2l0ZSk7XG5cdFx0XHR0aGlzLm1hcEFjdGlvbnNCaW5kaW5nVG9Db21wb3NpdGUuc2V0KHRoaXMuYWN0aXZlQ29tcG9zaXRlLmdldElkKCksIGFjdGlvbnNCaW5kaW5nKTtcblx0XHRcdGFjdGlvbnNCaW5kaW5nKCk7XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlIGludmFsaWRhdGUgYWN0aW9ucyBiaW5kaW5nIGZvciBuZXh0IHRpbWUgd2hlbiB0aGUgY29tcG9zaXRlIGJlY29tZXMgdmlzaWJsZVxuXHRcdGVsc2Uge1xuXHRcdFx0dGhpcy5tYXBBY3Rpb25zQmluZGluZ1RvQ29tcG9zaXRlLmRlbGV0ZShjb21wb3NpdGVJZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVUaXRsZShjb21wb3NpdGVJZDogc3RyaW5nLCBjb21wb3NpdGVUaXRsZT86IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbXBvc2l0ZURlc2NyaXB0b3IgPSB0aGlzLnJlZ2lzdHJ5LmdldENvbXBvc2l0ZShjb21wb3NpdGVJZCk7XG5cdFx0aWYgKCFjb21wb3NpdGVEZXNjcmlwdG9yIHx8ICF0aGlzLnRpdGxlTGFiZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIWNvbXBvc2l0ZVRpdGxlKSB7XG5cdFx0XHRjb21wb3NpdGVUaXRsZSA9IGNvbXBvc2l0ZURlc2NyaXB0b3IubmFtZTtcblx0XHR9XG5cblx0XHRjb25zdCBrZXliaW5kaW5nID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGNvbXBvc2l0ZUlkKTtcblxuXHRcdHRoaXMudGl0bGVMYWJlbC51cGRhdGVUaXRsZShjb21wb3NpdGVJZCwgY29tcG9zaXRlVGl0bGUsIGtleWJpbmRpbmc/LmdldExhYmVsKCkgPz8gdW5kZWZpbmVkKTtcblxuXHRcdHRoaXMudG9vbEJhcj8uc2V0QXJpYUxhYmVsKGxvY2FsaXplKCdhcmlhQ29tcG9zaXRlVG9vbGJhckxhYmVsJywgXCJ7MH0gYWN0aW9uc1wiLCBjb21wb3NpdGVUaXRsZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjb2xsZWN0Q29tcG9zaXRlQWN0aW9ucyhjb21wb3NpdGU/OiBDb21wb3NpdGUpOiAoKSA9PiB2b2lkIHtcblxuXHRcdC8vIEZyb20gQ29tcG9zaXRlXG5cdFx0Y29uc3QgbWVudUlkcyA9IGNvbXBvc2l0ZT8uZ2V0TWVudUlkcygpO1xuXHRcdGNvbnN0IHByaW1hcnlBY3Rpb25zOiBJQWN0aW9uW10gPSBjb21wb3NpdGU/LmdldEFjdGlvbnMoKS5zbGljZSgwKSB8fCBbXTtcblx0XHRjb25zdCBzZWNvbmRhcnlBY3Rpb25zOiBJQWN0aW9uW10gPSBjb21wb3NpdGU/LmdldFNlY29uZGFyeUFjdGlvbnMoKS5zbGljZSgwKSB8fCBbXTtcblxuXHRcdC8vIFVwZGF0ZSBjb250ZXh0XG5cdFx0aWYgKHRoaXMudG9vbEJhcikge1xuXHRcdFx0dGhpcy50b29sQmFyLmNvbnRleHQgPSB0aGlzLmFjdGlvbnNDb250ZXh0UHJvdmlkZXIoKTtcblx0XHR9XG5cblx0XHQvLyBSZXR1cm4gZm4gdG8gc2V0IGludG8gdG9vbGJhclxuXHRcdHJldHVybiAoKSA9PiB7XG5cdFx0XHR0aGlzLnRvb2xCYXI/LnNldEFjdGlvbnMocHJlcGFyZUFjdGlvbnMocHJpbWFyeUFjdGlvbnMpLCBwcmVwYXJlQWN0aW9ucyhzZWNvbmRhcnlBY3Rpb25zKSwgbWVudUlkcyk7XG5cdFx0XHR0aGlzLnRpdGxlQXJlYT8uY2xhc3NMaXN0LnRvZ2dsZSgnaGFzLWFjdGlvbnMnLCBwcmltYXJ5QWN0aW9ucy5sZW5ndGggPiAwIHx8IHNlY29uZGFyeUFjdGlvbnMubGVuZ3RoID4gMCk7XG5cdFx0fTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRBY3RpdmVDb21wb3NpdGUoKTogSUNvbXBvc2l0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuYWN0aXZlQ29tcG9zaXRlO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldExhc3RBY3RpdmVDb21wb3NpdGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmxhc3RBY3RpdmVDb21wb3NpdGVJZDtcblx0fVxuXG5cdHByb3RlY3RlZCBoaWRlQWN0aXZlQ29tcG9zaXRlKCk6IENvbXBvc2l0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLmFjdGl2ZUNvbXBvc2l0ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gTm90aGluZyB0byBkb1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbXBvc2l0ZSA9IHRoaXMuYWN0aXZlQ29tcG9zaXRlO1xuXHRcdHRoaXMuYWN0aXZlQ29tcG9zaXRlID0gdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgY29tcG9zaXRlQ29udGFpbmVyID0gdGhpcy5tYXBDb21wb3NpdGVUb0NvbXBvc2l0ZUNvbnRhaW5lci5nZXQoY29tcG9zaXRlLmdldElkKCkpO1xuXG5cdFx0Ly8gSW5kaWNhdGUgdG8gQ29tcG9zaXRlXG5cdFx0Y29tcG9zaXRlLnNldFZpc2libGUoZmFsc2UpO1xuXG5cdFx0Ly8gVGFrZSBDb250YWluZXIgT2ZmLURPTSBhbmQgaGlkZVxuXHRcdGlmIChjb21wb3NpdGVDb250YWluZXIpIHtcblx0XHRcdGNvbXBvc2l0ZUNvbnRhaW5lci5yZW1vdmUoKTtcblx0XHRcdGhpZGUoY29tcG9zaXRlQ29udGFpbmVyKTtcblx0XHR9XG5cblx0XHQvLyBDbGVhciBhbnkgcnVubmluZyBQcm9ncmVzc1xuXHRcdHRoaXMucHJvZ3Jlc3NCYXI/LnN0b3AoKS5oaWRlKCk7XG5cblx0XHQvLyBFbXB0eSBBY3Rpb25zXG5cdFx0aWYgKHRoaXMudG9vbEJhcikge1xuXHRcdFx0dGhpcy5jb2xsZWN0Q29tcG9zaXRlQWN0aW9ucygpKCk7XG5cdFx0fVxuXHRcdHRoaXMub25EaWRDb21wb3NpdGVDbG9zZS5maXJlKGNvbXBvc2l0ZSk7XG5cblx0XHRyZXR1cm4gY29tcG9zaXRlO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNyZWF0ZVRpdGxlQXJlYShwYXJlbnQ6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5vcHRpb25zLmhhc1RpdGxlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFRpdGxlIEFyZWEgQ29udGFpbmVyXG5cdFx0Y29uc3QgdGl0bGVBcmVhID0gYXBwZW5kKHBhcmVudCwgJCgnLmNvbXBvc2l0ZScpKTtcblx0XHR0aXRsZUFyZWEuY2xhc3NMaXN0LmFkZCgndGl0bGUnKTtcblxuXHRcdC8vIExlZnQgVGl0bGUgTGFiZWxcblx0XHR0aGlzLnRpdGxlTGFiZWwgPSB0aGlzLmNyZWF0ZVRpdGxlTGFiZWwodGl0bGVBcmVhKTtcblxuXHRcdC8vIFJpZ2h0IEFjdGlvbnMgQ29udGFpbmVyXG5cdFx0Y29uc3QgdGl0bGVBY3Rpb25zQ29udGFpbmVyID0gYXBwZW5kKHRpdGxlQXJlYSwgJCgnLnRpdGxlLWFjdGlvbnMnKSk7XG5cblx0XHQvLyBUb29sYmFyXG5cdFx0dGhpcy50b29sQmFyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hUb29sQmFyLCB0aXRsZUFjdGlvbnNDb250YWluZXIsIHtcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHRoaXMuYWN0aW9uVmlld0l0ZW1Qcm92aWRlcihhY3Rpb24sIG9wdGlvbnMpLFxuXHRcdFx0b3JpZW50YXRpb246IEFjdGlvbnNPcmllbnRhdGlvbi5IT1JJWk9OVEFMLFxuXHRcdFx0Z2V0S2V5QmluZGluZzogYWN0aW9uID0+IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhhY3Rpb24uaWQpLFxuXHRcdFx0YW5jaG9yQWxpZ25tZW50UHJvdmlkZXI6ICgpID0+IHRoaXMuZ2V0VGl0bGVBcmVhRHJvcERvd25BbmNob3JBbGlnbm1lbnQoKSxcblx0XHRcdHRvZ2dsZU1lbnVUaXRsZTogbG9jYWxpemUoJ3ZpZXdzQW5kTW9yZUFjdGlvbnMnLCBcIlZpZXdzIGFuZCBNb3JlIEFjdGlvbnMuLi5cIiksXG5cdFx0XHR0ZWxlbWV0cnlTb3VyY2U6IHRoaXMubmFtZUZvclRlbGVtZXRyeSxcblx0XHRcdGhvdmVyRGVsZWdhdGU6IHRoaXMudG9vbGJhckhvdmVyRGVsZWdhdGUsXG5cdFx0XHR0cmFpbGluZ1NlcGFyYXRvcjogdGhpcy50cmFpbGluZ1NlcGFyYXRvcixcblx0XHR9KSk7XG5cblx0XHR0aGlzLmNvbGxlY3RDb21wb3NpdGVBY3Rpb25zKCkoKTtcblxuXHRcdHJldHVybiB0aXRsZUFyZWE7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlVGl0bGVMYWJlbChwYXJlbnQ6IEhUTUxFbGVtZW50KTogSUNvbXBvc2l0ZVRpdGxlTGFiZWwge1xuXHRcdGNvbnN0IHRpdGxlQ29udGFpbmVyID0gYXBwZW5kKHBhcmVudCwgJCgnLnRpdGxlLWxhYmVsJykpO1xuXHRcdGNvbnN0IHRpdGxlTGFiZWwgPSBhcHBlbmQodGl0bGVDb250YWluZXIsICQoJ2gyJykpO1xuXHRcdHRoaXMudGl0bGVMYWJlbEVsZW1lbnQgPSB0aXRsZUxhYmVsO1xuXHRcdGNvbnN0IGhvdmVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIHRpdGxlTGFiZWwsICcnKSk7XG5cblx0XHRjb25zdCAkdGhpcyA9IHRoaXM7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHVwZGF0ZVRpdGxlOiAoaWQsIHRpdGxlLCBrZXliaW5kaW5nKSA9PiB7XG5cdFx0XHRcdC8vIFRoZSB0aXRsZSBsYWJlbCBpcyBzaGFyZWQgZm9yIGFsbCBjb21wb3NpdGVzIGluIHRoZSBiYXNlIENvbXBvc2l0ZVBhcnRcblx0XHRcdFx0aWYgKCF0aGlzLmFjdGl2ZUNvbXBvc2l0ZSB8fCB0aGlzLmFjdGl2ZUNvbXBvc2l0ZS5nZXRJZCgpID09PSBpZCkge1xuXHRcdFx0XHRcdHRpdGxlTGFiZWwudGV4dENvbnRlbnQgPSB0aXRsZTtcblx0XHRcdFx0XHRob3Zlci51cGRhdGUoa2V5YmluZGluZyA/IGxvY2FsaXplKCd0aXRsZVRvb2x0aXAnLCBcInswfSAoezF9KVwiLCB0aXRsZSwga2V5YmluZGluZykgOiB0aXRsZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cblx0XHRcdHVwZGF0ZVN0eWxlczogKCkgPT4ge1xuXHRcdFx0XHR0aXRsZUxhYmVsLnN0eWxlLmNvbG9yID0gJHRoaXMudGl0bGVGb3JlZ3JvdW5kQ29sb3IgPyAkdGhpcy5nZXRDb2xvcigkdGhpcy50aXRsZUZvcmVncm91bmRDb2xvcikgfHwgJycgOiAnJztcblx0XHRcdFx0Y29uc3QgYm9yZGVyQ29sb3IgPSAkdGhpcy50aXRsZUJvcmRlckNvbG9yID8gJHRoaXMuZ2V0Q29sb3IoJHRoaXMudGl0bGVCb3JkZXJDb2xvcikgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdHBhcmVudC5zdHlsZS5ib3JkZXJCb3R0b20gPSBib3JkZXJDb2xvciA/IGAxcHggc29saWQgJHtib3JkZXJDb2xvcn1gIDogJyc7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVIZWFkZXJBcmVhKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gJCgnLmNvbXBvc2l0ZScpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZUZvb3RlckFyZWEoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiAkKCcuY29tcG9zaXRlJyk7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVTdHlsZXMoKTogdm9pZCB7XG5cdFx0c3VwZXIudXBkYXRlU3R5bGVzKCk7XG5cblx0XHQvLyBGb3J3YXJkIHRvIHRpdGxlIGxhYmVsIGlmIHByZXNlbnRcblx0XHR0aGlzLnRpdGxlTGFiZWw/LnVwZGF0ZVN0eWxlcygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFjdGlvblZpZXdJdGVtUHJvdmlkZXIoYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zOiBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyk6IElBY3Rpb25WaWV3SXRlbSB8IHVuZGVmaW5lZCB7XG5cblx0XHQvLyBDaGVjayBBY3RpdmUgQ29tcG9zaXRlXG5cdFx0aWYgKHRoaXMuYWN0aXZlQ29tcG9zaXRlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5hY3RpdmVDb21wb3NpdGUuZ2V0QWN0aW9uVmlld0l0ZW0oYWN0aW9uLCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY3JlYXRlQWN0aW9uVmlld0l0ZW0odGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgYWN0aW9uLCBvcHRpb25zKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhY3Rpb25zQ29udGV4dFByb3ZpZGVyKCk6IHVua25vd24ge1xuXG5cdFx0Ly8gQ2hlY2sgQWN0aXZlIENvbXBvc2l0ZVxuXHRcdGlmICh0aGlzLmFjdGl2ZUNvbXBvc2l0ZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuYWN0aXZlQ29tcG9zaXRlLmdldEFjdGlvbnNDb250ZXh0KCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY3JlYXRlQ29udGVudEFyZWEocGFyZW50OiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBjb250ZW50Q29udGFpbmVyID0gYXBwZW5kKHBhcmVudCwgJCgnLmNvbnRlbnQnKSk7XG5cblx0XHR0aGlzLnByb2dyZXNzQmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFByb2dyZXNzQmFyKGNvbnRlbnRDb250YWluZXIsIGRlZmF1bHRQcm9ncmVzc0JhclN0eWxlcykpO1xuXHRcdHRoaXMucHJvZ3Jlc3NCYXIuaGlkZSgpO1xuXG5cdFx0cmV0dXJuIGNvbnRlbnRDb250YWluZXI7XG5cdH1cblxuXHRnZXRQcm9ncmVzc0luZGljYXRvcihpZDogc3RyaW5nKTogSVByb2dyZXNzSW5kaWNhdG9yIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjb21wb3NpdGVJdGVtID0gdGhpcy5pbnN0YW50aWF0ZWRDb21wb3NpdGVJdGVtcy5nZXQoaWQpO1xuXG5cdFx0cmV0dXJuIGNvbXBvc2l0ZUl0ZW0gPyBjb21wb3NpdGVJdGVtLnByb2dyZXNzIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldFRpdGxlQXJlYURyb3BEb3duQW5jaG9yQWxpZ25tZW50KCk6IEFuY2hvckFsaWdubWVudCB7XG5cdFx0cmV0dXJuIEFuY2hvckFsaWdubWVudC5SSUdIVDtcblx0fVxuXG5cdG92ZXJyaWRlIGxheW91dCh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgdG9wOiBudW1iZXIsIGxlZnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHN1cGVyLmxheW91dCh3aWR0aCwgaGVpZ2h0LCB0b3AsIGxlZnQpO1xuXG5cdFx0Ly8gTGF5b3V0IGNvbnRlbnRzXG5cdFx0dGhpcy5jb250ZW50QXJlYVNpemUgPSBEaW1lbnNpb24ubGlmdChzdXBlci5sYXlvdXRDb250ZW50cyh3aWR0aCwgaGVpZ2h0KS5jb250ZW50U2l6ZSk7XG5cblx0XHQvLyBMYXlvdXQgY29tcG9zaXRlXG5cdFx0dGhpcy5hY3RpdmVDb21wb3NpdGU/LmxheW91dCh0aGlzLmNvbnRlbnRBcmVhU2l6ZSk7XG5cdH1cblxuXHRzZXRCb3VuZGFyeVNhc2hlcz8oc2FzaGVzOiBJQm91bmRhcnlTYXNoZXMpOiB2b2lkIHtcblx0XHR0aGlzLmJvdW5kYXJ5U2FzaGVzID0gc2FzaGVzO1xuXHRcdHRoaXMuYWN0aXZlQ29tcG9zaXRlPy5zZXRCb3VuZGFyeVNhc2hlcyhzYXNoZXMpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlbW92ZUNvbXBvc2l0ZShjb21wb3NpdGVJZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuYWN0aXZlQ29tcG9zaXRlPy5nZXRJZCgpID09PSBjb21wb3NpdGVJZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBkbyBub3QgcmVtb3ZlIGFjdGl2ZSBjb21wb3NpdGVcblx0XHR9XG5cblx0XHR0aGlzLm1hcENvbXBvc2l0ZVRvQ29tcG9zaXRlQ29udGFpbmVyLmRlbGV0ZShjb21wb3NpdGVJZCk7XG5cdFx0dGhpcy5tYXBBY3Rpb25zQmluZGluZ1RvQ29tcG9zaXRlLmRlbGV0ZShjb21wb3NpdGVJZCk7XG5cdFx0Y29uc3QgY29tcG9zaXRlSXRlbSA9IHRoaXMuaW5zdGFudGlhdGVkQ29tcG9zaXRlSXRlbXMuZ2V0KGNvbXBvc2l0ZUlkKTtcblx0XHRpZiAoY29tcG9zaXRlSXRlbSkge1xuXHRcdFx0Y29tcG9zaXRlSXRlbS5jb21wb3NpdGUuZGlzcG9zZSgpO1xuXHRcdFx0ZGlzcG9zZShjb21wb3NpdGVJdGVtLmRpc3Bvc2FibGUpO1xuXHRcdFx0dGhpcy5pbnN0YW50aWF0ZWRDb21wb3NpdGVJdGVtcy5kZWxldGUoY29tcG9zaXRlSWQpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLm1hcENvbXBvc2l0ZVRvQ29tcG9zaXRlQ29udGFpbmVyLmNsZWFyKCk7XG5cdFx0dGhpcy5tYXBBY3Rpb25zQmluZGluZ1RvQ29tcG9zaXRlLmNsZWFyKCk7XG5cblx0XHR0aGlzLmluc3RhbnRpYXRlZENvbXBvc2l0ZUl0ZW1zLmZvckVhY2goY29tcG9zaXRlSXRlbSA9PiB7XG5cdFx0XHRjb21wb3NpdGVJdGVtLmNvbXBvc2l0ZS5kaXNwb3NlKCk7XG5cdFx0XHRkaXNwb3NlKGNvbXBvc2l0ZUl0ZW0uZGlzcG9zYWJsZSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLmluc3RhbnRpYXRlZENvbXBvc2l0ZUl0ZW1zLmNsZWFyKCk7XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU87QUFDUCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFzQixTQUFTLGlCQUFpQix5QkFBMEI7QUFDMUUsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQXFDLHNCQUFzQjtBQUNwRSxTQUFTLG1CQUFtQjtBQUU1QixTQUFTLFlBQTBCO0FBSW5DLFNBQTBCLGNBQWMscUJBQXFCO0FBRzdELFNBQVMseUJBQXlCO0FBQ2xDLFNBQTZCLDhCQUE4QjtBQUkzRCxTQUFTLFdBQVcsUUFBUSxHQUFHLE1BQU0sWUFBWTtBQUNqRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHVCQUF1QiwrQkFBK0I7QUFDL0QsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQ0FBZ0M7QUFJekMsU0FBUyw0QkFBNEIsK0JBQStCO0FBMEI3RCxNQUFlLHNCQUFnRixLQUFrQjtBQUFBLEVBc0J2SCxZQUNrQixxQkFDRSxnQkFDQSxvQkFDbkIsZUFDbUIsbUJBQ0YsY0FDRSxzQkFDbkIsY0FDbUIsVUFDRiw0QkFDQSxvQkFDRSxrQkFDRixtQkFDQSxzQkFDQSxrQkFDakIsSUFDQSxTQUNDO0FBQ0QsVUFBTSxJQUFJLFNBQVMsY0FBYyxnQkFBZ0IsYUFBYTtBQWxCN0M7QUFDRTtBQUNBO0FBRUE7QUFDRjtBQUNFO0FBRUE7QUFDRjtBQUNBO0FBQ0U7QUFDRjtBQUNBO0FBQ0E7QUFuQ2xCLFNBQW1CLHFCQUFxQixLQUFLLFVBQVUsSUFBSSxRQUFtRCxDQUFDO0FBQy9HLFNBQW1CLHNCQUFzQixLQUFLLFVBQVUsSUFBSSxRQUFvQixDQUFDO0FBTWpGLFNBQWlCLG1DQUFtQyxvQkFBSSxJQUF5QjtBQUNq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
