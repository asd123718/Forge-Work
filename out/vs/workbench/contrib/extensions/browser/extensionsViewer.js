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
import { localize } from "../../../../nls.js";
import { dispose, Disposable, DisposableStore, toDisposable, isDisposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { Action, ActionRunner, Separator } from "../../../../base/common/actions.js";
import { IExtensionsWorkbenchService } from "../common/extensions.js";
import { Event } from "../../../../base/common/event.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IListService, WorkbenchAsyncDataTree, WorkbenchPagedList } from "../../../../platform/list/browser/listService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { isNonEmptyArray } from "../../../../base/common/arrays.js";
import { Delegate, Renderer } from "./extensionsList.js";
import { listFocusForeground, listFocusBackground, foreground, editorBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../common/views.js";
import { IWorkbenchLayoutService, Position } from "../../../services/layout/browser/layoutService.js";
import { areSameExtensions } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { ExtensionAction, getContextMenuActions, ManageExtensionAction } from "./extensionsActions.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { getLocationBasedViewColors } from "../../../browser/parts/views/viewPane.js";
import { DelayedPagedModel } from "../../../../base/common/paging.js";
import { ExtensionIconWidget } from "./extensionsWidgets.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { isCancellationError } from "../../../../base/common/errors.js";
function getAriaLabelForExtension(extension) {
  if (!extension) {
    return "";
  }
  const publisher = extension.publisherDomain?.verified ? localize("extension.arialabel.verifiedPublisher", "Verified Publisher {0}", extension.publisherDisplayName) : localize("extension.arialabel.publisher", "Publisher {0}", extension.publisherDisplayName);
  const deprecated = extension?.deprecationInfo ? localize("extension.arialabel.deprecated", "Deprecated") : "";
  const rating = extension?.rating ? localize("extension.arialabel.rating", "Rated {0} out of 5 stars by {1} users", extension.rating.toFixed(2), extension.ratingCount) : "";
  return `${extension.displayName}, ${deprecated ? `${deprecated}, ` : ""}${extension.version}, ${publisher}, ${extension.description} ${rating ? `, ${rating}` : ""}`;
}
let ExtensionsList = class extends Disposable {
  constructor(parent, viewId, options, extensionsViewState, extensionsWorkbenchService, viewDescriptorService, layoutService, notificationService, contextMenuService, contextKeyService, instantiationService, logService) {
    super();
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.contextMenuService = contextMenuService;
    this.contextKeyService = contextKeyService;
    this.instantiationService = instantiationService;
    this.logService = logService;
    this.contextMenuActionRunner = this._register(new ActionRunner());
    this.modalNavigationDisposable = this._register(new MutableDisposable());
    this._register(this.contextMenuActionRunner.onDidRun(({ error }) => error && notificationService.error(error)));
    const delegate = new Delegate();
    const renderer = instantiationService.createInstance(Renderer, extensionsViewState, {
      hoverOptions: {
        position: () => {
          const viewLocation = viewDescriptorService.getViewLocationById(viewId);
          if (viewLocation === ViewContainerLocation.Sidebar) {
            return layoutService.getSideBarPosition() === Position.LEFT ? HoverPosition.RIGHT : HoverPosition.LEFT;
          }
          if (viewLocation === ViewContainerLocation.AuxiliaryBar) {
            return layoutService.getSideBarPosition() === Position.LEFT ? HoverPosition.LEFT : HoverPosition.RIGHT;
          }
          return HoverPosition.RIGHT;
        }
      }
    });
    this.list = instantiationService.createInstance(WorkbenchPagedList, `${viewId}-Extensions`, parent, delegate, [renderer], {
      multipleSelectionSupport: false,
      setRowLineHeight: false,
      horizontalScrolling: false,
      accessibilityProvider: {
        getAriaLabel(extension) {
          return getAriaLabelForExtension(extension);
        },
        getWidgetAriaLabel() {
          return localize("extensions", "Extensions");
        }
      },
      overrideStyles: getLocationBasedViewColors(viewDescriptorService.getViewLocationById(viewId)).listOverrideStyles,
      openOnSingleClick: true,
      ...options
    });
    this._register(this.list.onContextMenu((e) => this.onContextMenu(e), this));
    this._register(this.list);
    this._register(Event.debounce(Event.filter(this.list.onDidOpen, (e) => e.element !== null), (_, event) => event, 75, true)((options2) => {
      this.openExtension(options2.element, { sideByside: options2.sideBySide, ...options2.editorOptions });
    }));
  }
  setModel(model) {
    this.list.model = new DelayedPagedModel(model);
  }
  layout(height, width) {
    this.list.layout(height, width);
  }
  openExtension(extension, options) {
    extension = this.extensionsWorkbenchService.local.filter((e) => areSameExtensions(e.identifier, extension.identifier))[0] || extension;
    this.extensionsWorkbenchService.open(extension, {
      ...options,
      modal: options.sideByside ? void 0 : buildModalNavigationForPagedList(
        extension,
        () => this.list.model,
        (extA, extB) => areSameExtensions(extA.identifier, extB.identifier),
        (ext, modal) => this.extensionsWorkbenchService.open(ext, { pinned: false, modal }),
        this.modalNavigationDisposable,
        this.logService
      )
    });
  }
  async onContextMenu(e) {
    if (e.element) {
      const disposables = new DisposableStore();
      const manageExtensionAction = disposables.add(this.instantiationService.createInstance(ManageExtensionAction));
      const extension = e.element ? this.extensionsWorkbenchService.local.find((local) => areSameExtensions(local.identifier, e.element.identifier) && (!e.element.server || e.element.server === local.server)) || e.element : e.element;
      manageExtensionAction.extension = extension;
      let groups = [];
      if (manageExtensionAction.enabled) {
        groups = await manageExtensionAction.getActionGroups();
      } else if (extension) {
        groups = await getContextMenuActions(extension, this.contextKeyService, this.instantiationService);
        groups.forEach((group) => group.forEach((extensionAction) => {
          if (extensionAction instanceof ExtensionAction) {
            extensionAction.extension = extension;
          }
        }));
      }
      const actions = [];
      for (const menuActions of groups) {
        for (const menuAction of menuActions) {
          actions.push(menuAction);
          if (isDisposable(menuAction)) {
            disposables.add(menuAction);
          }
        }
        actions.push(new Separator());
      }
      actions.pop();
      this.contextMenuService.showContextMenu({
        getAnchor: () => e.anchor,
        getActions: () => actions,
        actionRunner: this.contextMenuActionRunner,
        onHide: () => disposables.dispose()
      });
    }
  }
};
ExtensionsList = __decorateClass([
  __decorateParam(4, IExtensionsWorkbenchService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IWorkbenchLayoutService),
  __decorateParam(7, INotificationService),
  __decorateParam(8, IContextMenuService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IInstantiationService),
  __decorateParam(11, ILogService)
], ExtensionsList);
let ExtensionsGridView = class extends Disposable {
  constructor(parent, delegate, instantiationService) {
    super();
    this.instantiationService = instantiationService;
    this.element = dom.append(parent, dom.$(".extensions-grid-view"));
    this.renderer = this.instantiationService.createInstance(Renderer, { onFocus: Event.None, onBlur: Event.None, filters: {} }, { hoverOptions: { position() {
      return HoverPosition.BELOW;
    } } });
    this.delegate = delegate;
    this.disposableStore = this._register(new DisposableStore());
  }
  setExtensions(extensions) {
    this.disposableStore.clear();
    extensions.forEach((e, index) => this.renderExtension(e, index));
  }
  renderExtension(extension, index) {
    const extensionContainer = dom.append(this.element, dom.$(".extension-container"));
    extensionContainer.style.height = `${this.delegate.getHeight()}px`;
    extensionContainer.setAttribute("tabindex", "0");
    const template = this.renderer.renderTemplate(extensionContainer);
    this.disposableStore.add(toDisposable(() => this.renderer.disposeTemplate(template)));
    const openExtensionAction = this.instantiationService.createInstance(OpenExtensionAction);
    openExtensionAction.extension = extension;
    template.name.setAttribute("tabindex", "0");
    const handleEvent = (e) => {
      if (e instanceof StandardKeyboardEvent && e.keyCode !== KeyCode.Enter) {
        return;
      }
      openExtensionAction.run(e.ctrlKey || e.metaKey);
      e.stopPropagation();
      e.preventDefault();
    };
    this.disposableStore.add(dom.addDisposableListener(template.name, dom.EventType.CLICK, (e) => handleEvent(new StandardMouseEvent(dom.getWindow(template.name), e))));
    this.disposableStore.add(dom.addDisposableListener(template.name, dom.EventType.KEY_DOWN, (e) => handleEvent(new StandardKeyboardEvent(e))));
    this.disposableStore.add(dom.addDisposableListener(extensionContainer, dom.EventType.KEY_DOWN, (e) => handleEvent(new StandardKeyboardEvent(e))));
    this.renderer.renderElement(extension, index, template);
  }
};
ExtensionsGridView = __decorateClass([
  __decorateParam(2, IInstantiationService)
], ExtensionsGridView);
class AsyncDataSource {
  hasChildren({ hasChildren }) {
    return hasChildren;
  }
  getChildren(extensionData) {
    return extensionData.getChildren();
  }
}
class VirualDelegate {
  getHeight(element) {
    return 62;
  }
  getTemplateId({ extension }) {
    return extension ? ExtensionRenderer.TEMPLATE_ID : UnknownExtensionRenderer.TEMPLATE_ID;
  }
}
let ExtensionRenderer = class {
  constructor(instantiationService) {
    this.instantiationService = instantiationService;
  }
  get templateId() {
    return ExtensionRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    container.classList.add("extension");
    const iconWidget = this.instantiationService.createInstance(ExtensionIconWidget, container);
    const details = dom.append(container, dom.$(".details"));
    const header = dom.append(details, dom.$(".header"));
    const name = dom.append(header, dom.$("span.name"));
    const openExtensionAction = this.instantiationService.createInstance(OpenExtensionAction);
    const extensionDisposables = [dom.addDisposableListener(name, "click", (e) => {
      openExtensionAction.run(e.ctrlKey || e.metaKey);
      e.stopPropagation();
      e.preventDefault();
    }), iconWidget, openExtensionAction];
    const identifier = dom.append(header, dom.$("span.identifier"));
    const footer = dom.append(details, dom.$(".footer"));
    const author = dom.append(footer, dom.$(".author"));
    return {
      name,
      identifier,
      author,
      extensionDisposables,
      set extensionData(extensionData) {
        iconWidget.extension = extensionData.extension;
        openExtensionAction.extension = extensionData.extension;
      }
    };
  }
  renderElement(node, index, data) {
    const extension = node.element.extension;
    data.name.textContent = extension.displayName;
    data.identifier.textContent = extension.identifier.id;
    data.author.textContent = extension.publisherDisplayName;
    data.extensionData = node.element;
  }
  disposeTemplate(templateData) {
    templateData.extensionDisposables = dispose(templateData.extensionDisposables);
  }
};
ExtensionRenderer.TEMPLATE_ID = "extension-template";
ExtensionRenderer = __decorateClass([
  __decorateParam(0, IInstantiationService)
], ExtensionRenderer);
const _UnknownExtensionRenderer = class _UnknownExtensionRenderer {
  get templateId() {
    return _UnknownExtensionRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const messageContainer = dom.append(container, dom.$("div.unknown-extension"));
    dom.append(messageContainer, dom.$("span.error-marker")).textContent = localize("error", "Error");
    dom.append(messageContainer, dom.$("span.message")).textContent = localize("Unknown Extension", "Unknown Extension:");
    const identifier = dom.append(messageContainer, dom.$("span.message"));
    return { identifier };
  }
  renderElement(node, index, data) {
    data.identifier.textContent = node.element.extension.identifier.id;
  }
  disposeTemplate(data) {
  }
};
_UnknownExtensionRenderer.TEMPLATE_ID = "unknown-extension-template";
let UnknownExtensionRenderer = _UnknownExtensionRenderer;
let OpenExtensionAction = class extends Action {
  constructor(extensionsWorkdbenchService) {
    super("extensions.action.openExtension", "");
    this.extensionsWorkdbenchService = extensionsWorkdbenchService;
  }
  set extension(extension) {
    this._extension = extension;
  }
  run(sideByside) {
    if (this._extension) {
      return this.extensionsWorkdbenchService.open(this._extension, { sideByside });
    }
    return Promise.resolve();
  }
};
OpenExtensionAction = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService)
], OpenExtensionAction);
let ExtensionsTree = class extends WorkbenchAsyncDataTree {
  constructor(input, container, overrideStyles, contextKeyService, listService, instantiationService, configurationService, extensionsWorkdbenchService) {
    const delegate = new VirualDelegate();
    const dataSource = new AsyncDataSource();
    const renderers = [instantiationService.createInstance(ExtensionRenderer), instantiationService.createInstance(UnknownExtensionRenderer)];
    const identityProvider = {
      getId({ extension, parent }) {
        return parent ? this.getId(parent) + "/" + extension.identifier.id : extension.identifier.id;
      }
    };
    super(
      "ExtensionsTree",
      container,
      delegate,
      renderers,
      dataSource,
      {
        indent: 40,
        identityProvider,
        multipleSelectionSupport: false,
        overrideStyles,
        accessibilityProvider: {
          getAriaLabel(extensionData) {
            return getAriaLabelForExtension(extensionData.extension);
          },
          getWidgetAriaLabel() {
            return localize("extensions", "Extensions");
          }
        }
      },
      instantiationService,
      contextKeyService,
      listService,
      configurationService
    );
    this.setInput(input);
    this.disposables.add(this.onDidChangeSelection((event) => {
      if (dom.isKeyboardEvent(event.browserEvent)) {
        extensionsWorkdbenchService.open(event.elements[0].extension, { sideByside: false });
      }
    }));
  }
};
ExtensionsTree = __decorateClass([
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IListService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IExtensionsWorkbenchService)
], ExtensionsTree);
class ExtensionData {
  constructor(extension, parent, getChildrenExtensionIds, extensionsWorkbenchService) {
    this.extension = extension;
    this.parent = parent;
    this.getChildrenExtensionIds = getChildrenExtensionIds;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.childrenExtensionIds = this.getChildrenExtensionIds(extension);
  }
  get hasChildren() {
    return isNonEmptyArray(this.childrenExtensionIds);
  }
  async getChildren() {
    if (this.hasChildren) {
      const result = await getExtensions(this.childrenExtensionIds, this.extensionsWorkbenchService);
      return result.map((extension) => new ExtensionData(extension, this, this.getChildrenExtensionIds, this.extensionsWorkbenchService));
    }
    return null;
  }
}
async function getExtensions(extensions, extensionsWorkbenchService) {
  const localById = extensionsWorkbenchService.local.reduce((result2, e) => {
    result2.set(e.identifier.id.toLowerCase(), e);
    return result2;
  }, /* @__PURE__ */ new Map());
  const result = [];
  const toQuery = [];
  for (const extensionId of extensions) {
    const id = extensionId.toLowerCase();
    const local = localById.get(id);
    if (local) {
      result.push(local);
    } else {
      toQuery.push(id);
    }
  }
  if (toQuery.length) {
    const galleryResult = await extensionsWorkbenchService.getExtensions(toQuery.map((id) => ({ id })), CancellationToken.None);
    result.push(...galleryResult);
  }
  return result;
}
function buildModalNavigationForPagedList(openedItem, getModel, isSame, openItem, cancellationStore, logService) {
  const model = getModel();
  if (!model) {
    return void 0;
  }
  const total = model.length;
  if (total <= 1) {
    return void 0;
  }
  let current = -1;
  for (let i = 0; i < total; i++) {
    if (model.isResolved(i) && isSame(model.get(i), openedItem)) {
      current = i;
      break;
    }
  }
  if (current === -1) {
    return void 0;
  }
  const openAtIndex = (index, item) => {
    const currentTotal = getModel()?.length ?? 0;
    openItem(item, { navigation: { total: currentTotal, current: index, navigate } });
  };
  let cts;
  const navigate = (index) => {
    cts?.cancel();
    cts = cancellationStore.value = new CancellationTokenSource();
    const token = cts.token;
    const currentModel = getModel();
    if (!currentModel || index < 0 || index >= currentModel.length) {
      return;
    }
    if (currentModel.isResolved(index)) {
      openAtIndex(index, currentModel.get(index));
    } else {
      currentModel.resolve(index, token).then((item) => {
        if (token.isCancellationRequested) {
          return;
        }
        openAtIndex(index, item);
      }, (error) => {
        if (!isCancellationError(error)) {
          logService.error(`Error while resolving item at index ${index} for modal navigation`, error);
        }
      });
    }
  };
  return { navigation: { total, current, navigate } };
}
registerThemingParticipant((theme, collector) => {
  const focusBackground = theme.getColor(listFocusBackground);
  if (focusBackground) {
    collector.addRule(`.extensions-grid-view .extension-container:focus { background-color: ${focusBackground}; outline: none; }`);
  }
  const focusForeground = theme.getColor(listFocusForeground);
  if (focusForeground) {
    collector.addRule(`.extensions-grid-view .extension-container:focus { color: ${focusForeground}; }`);
  }
  const foregroundColor = theme.getColor(foreground);
  const editorBackgroundColor = theme.getColor(editorBackground);
  if (foregroundColor && editorBackgroundColor) {
    const authorForeground = foregroundColor.transparent(0.9).makeOpaque(editorBackgroundColor);
    collector.addRule(`.extensions-grid-view .extension-container:not(.disabled) .author { color: ${authorForeground}; }`);
    const disabledExtensionForeground = foregroundColor.transparent(0.5).makeOpaque(editorBackgroundColor);
    collector.addRule(`.extensions-grid-view .extension-container.disabled { color: ${disabledExtensionForeground}; }`);
  }
});
export {
  ExtensionData,
  ExtensionsGridView,
  ExtensionsList,
  ExtensionsTree,
  buildModalNavigationForPagedList,
  getExtensions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGV4dGVuc2lvbnNcXGJyb3dzZXJcXGV4dGVuc2lvbnNWaWV3ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgZGlzcG9zZSwgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUsIGlzRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBBY3Rpb25SdW5uZXIsIElBY3Rpb24sIFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLCBJRXh0ZW5zaW9uLCBJRXh0ZW5zaW9uc1ZpZXdTdGF0ZSB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UsIElXb3JrYmVuY2hQYWdlZExpc3RPcHRpb25zLCBXb3JrYmVuY2hBc3luY0RhdGFUcmVlLCBXb3JrYmVuY2hQYWdlZExpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50LCBJQ29sb3JUaGVtZSwgSUNzc1N0eWxlQ29sbGVjdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQXN5bmNEYXRhU291cmNlLCBJVHJlZU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IElMaXN0VmlydHVhbERlbGVnYXRlLCBJTGlzdFJlbmRlcmVyLCBJTGlzdENvbnRleHRNZW51RXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTW9kYWxFZGl0b3JQYXJ0T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IGlzTm9uRW1wdHlBcnJheSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBEZWxlZ2F0ZSwgUmVuZGVyZXIgfSBmcm9tICcuL2V4dGVuc2lvbnNMaXN0LmpzJztcbmltcG9ydCB7IGxpc3RGb2N1c0ZvcmVncm91bmQsIGxpc3RGb2N1c0JhY2tncm91bmQsIGZvcmVncm91bmQsIGVkaXRvckJhY2tncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgSUxpc3RTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IEhvdmVyUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgSVN0eWxlT3ZlcnJpZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYXJlU2FtZUV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50VXRpbC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25BY3Rpb24sIGdldENvbnRleHRNZW51QWN0aW9ucywgTWFuYWdlRXh0ZW5zaW9uQWN0aW9uIH0gZnJvbSAnLi9leHRlbnNpb25zQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IGdldExvY2F0aW9uQmFzZWRWaWV3Q29sb3JzIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZS5qcyc7XG5pbXBvcnQgeyBEZWxheWVkUGFnZWRNb2RlbCwgSVBhZ2VkTW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYWdpbmcuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWNvbldpZGdldCB9IGZyb20gJy4vZXh0ZW5zaW9uc1dpZGdldHMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcblxuZnVuY3Rpb24gZ2V0QXJpYUxhYmVsRm9yRXh0ZW5zaW9uKGV4dGVuc2lvbjogSUV4dGVuc2lvbiB8IG51bGwpOiBzdHJpbmcge1xuXHRpZiAoIWV4dGVuc2lvbikge1xuXHRcdHJldHVybiAnJztcblx0fVxuXHRjb25zdCBwdWJsaXNoZXIgPSBleHRlbnNpb24ucHVibGlzaGVyRG9tYWluPy52ZXJpZmllZCA/IGxvY2FsaXplKCdleHRlbnNpb24uYXJpYWxhYmVsLnZlcmlmaWVkUHVibGlzaGVyJywgXCJWZXJpZmllZCBQdWJsaXNoZXIgezB9XCIsIGV4dGVuc2lvbi5wdWJsaXNoZXJEaXNwbGF5TmFtZSkgOiBsb2NhbGl6ZSgnZXh0ZW5zaW9uLmFyaWFsYWJlbC5wdWJsaXNoZXInLCBcIlB1Ymxpc2hlciB7MH1cIiwgZXh0ZW5zaW9uLnB1Ymxpc2hlckRpc3BsYXlOYW1lKTtcblx0Y29uc3QgZGVwcmVjYXRlZCA9IGV4dGVuc2lvbj8uZGVwcmVjYXRpb25JbmZvID8gbG9jYWxpemUoJ2V4dGVuc2lvbi5hcmlhbGFiZWwuZGVwcmVjYXRlZCcsIFwiRGVwcmVjYXRlZFwiKSA6ICcnO1xuXHRjb25zdCByYXRpbmcgPSBleHRlbnNpb24/LnJhdGluZyA/IGxvY2FsaXplKCdleHRlbnNpb24uYXJpYWxhYmVsLnJhdGluZycsIFwiUmF0ZWQgezB9IG91dCBvZiA1IHN0YXJzIGJ5IHsxfSB1c2Vyc1wiLCBleHRlbnNpb24ucmF0aW5nLnRvRml4ZWQoMiksIGV4dGVuc2lvbi5yYXRpbmdDb3VudCkgOiAnJztcblx0cmV0dXJuIGAke2V4dGVuc2lvbi5kaXNwbGF5TmFtZX0sICR7ZGVwcmVjYXRlZCA/IGAke2RlcHJlY2F0ZWR9LCBgIDogJyd9JHtleHRlbnNpb24udmVyc2lvbn0sICR7cHVibGlzaGVyfSwgJHtleHRlbnNpb24uZGVzY3JpcHRpb259ICR7cmF0aW5nID8gYCwgJHtyYXRpbmd9YCA6ICcnfWA7XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25zTGlzdCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHJlYWRvbmx5IGxpc3Q6IFdvcmtiZW5jaFBhZ2VkTGlzdDxJRXh0ZW5zaW9uPjtcblx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudUFjdGlvblJ1bm5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb25SdW5uZXIoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBtb2RhbE5hdmlnYXRpb25EaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHBhcmVudDogSFRNTEVsZW1lbnQsXG5cdFx0dmlld0lkOiBzdHJpbmcsXG5cdFx0b3B0aW9uczogUGFydGlhbDxJV29ya2JlbmNoUGFnZWRMaXN0T3B0aW9uczxJRXh0ZW5zaW9uPj4sXG5cdFx0ZXh0ZW5zaW9uc1ZpZXdTdGF0ZTogSUV4dGVuc2lvbnNWaWV3U3RhdGUsXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2Ugbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRNZW51QWN0aW9uUnVubmVyLm9uRGlkUnVuKCh7IGVycm9yIH0pID0+IGVycm9yICYmIG5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyb3IpKSk7XG5cdFx0Y29uc3QgZGVsZWdhdGUgPSBuZXcgRGVsZWdhdGUoKTtcblx0XHRjb25zdCByZW5kZXJlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlbmRlcmVyLCBleHRlbnNpb25zVmlld1N0YXRlLCB7XG5cdFx0XHRob3Zlck9wdGlvbnM6IHtcblx0XHRcdFx0cG9zaXRpb246ICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCB2aWV3TG9jYXRpb24gPSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0xvY2F0aW9uQnlJZCh2aWV3SWQpO1xuXHRcdFx0XHRcdGlmICh2aWV3TG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbGF5b3V0U2VydmljZS5nZXRTaWRlQmFyUG9zaXRpb24oKSA9PT0gUG9zaXRpb24uTEVGVCA/IEhvdmVyUG9zaXRpb24uUklHSFQgOiBIb3ZlclBvc2l0aW9uLkxFRlQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh2aWV3TG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIpIHtcblx0XHRcdFx0XHRcdHJldHVybiBsYXlvdXRTZXJ2aWNlLmdldFNpZGVCYXJQb3NpdGlvbigpID09PSBQb3NpdGlvbi5MRUZUID8gSG92ZXJQb3NpdGlvbi5MRUZUIDogSG92ZXJQb3NpdGlvbi5SSUdIVDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIEhvdmVyUG9zaXRpb24uUklHSFQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLmxpc3QgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hQYWdlZExpc3QsIGAke3ZpZXdJZH0tRXh0ZW5zaW9uc2AsIHBhcmVudCwgZGVsZWdhdGUsIFtyZW5kZXJlcl0sIHtcblx0XHRcdG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydDogZmFsc2UsXG5cdFx0XHRzZXRSb3dMaW5lSGVpZ2h0OiBmYWxzZSxcblx0XHRcdGhvcml6b250YWxTY3JvbGxpbmc6IGZhbHNlLFxuXHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdGdldEFyaWFMYWJlbChleHRlbnNpb246IElFeHRlbnNpb24gfCBudWxsKTogc3RyaW5nIHtcblx0XHRcdFx0XHRyZXR1cm4gZ2V0QXJpYUxhYmVsRm9yRXh0ZW5zaW9uKGV4dGVuc2lvbik7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnZXh0ZW5zaW9ucycsIFwiRXh0ZW5zaW9uc1wiKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdG92ZXJyaWRlU3R5bGVzOiBnZXRMb2NhdGlvbkJhc2VkVmlld0NvbG9ycyh2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0xvY2F0aW9uQnlJZCh2aWV3SWQpKS5saXN0T3ZlcnJpZGVTdHlsZXMsXG5cdFx0XHRvcGVuT25TaW5nbGVDbGljazogdHJ1ZSxcblx0XHRcdC4uLm9wdGlvbnNcblx0XHR9KSBhcyBXb3JrYmVuY2hQYWdlZExpc3Q8SUV4dGVuc2lvbj47XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saXN0Lm9uQ29udGV4dE1lbnUoZSA9PiB0aGlzLm9uQ29udGV4dE1lbnUoZSksIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxpc3QpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZGVib3VuY2UoRXZlbnQuZmlsdGVyKHRoaXMubGlzdC5vbkRpZE9wZW4sIGUgPT4gZS5lbGVtZW50ICE9PSBudWxsKSwgKF8sIGV2ZW50KSA9PiBldmVudCwgNzUsIHRydWUpKG9wdGlvbnMgPT4ge1xuXHRcdFx0dGhpcy5vcGVuRXh0ZW5zaW9uKG9wdGlvbnMuZWxlbWVudCEsIHsgc2lkZUJ5c2lkZTogb3B0aW9ucy5zaWRlQnlTaWRlLCAuLi5vcHRpb25zLmVkaXRvck9wdGlvbnMgfSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0c2V0TW9kZWwobW9kZWw6IElQYWdlZE1vZGVsPElFeHRlbnNpb24+KSB7XG5cdFx0dGhpcy5saXN0Lm1vZGVsID0gbmV3IERlbGF5ZWRQYWdlZE1vZGVsKG1vZGVsKTtcblx0fVxuXG5cdGxheW91dChoZWlnaHQ/OiBudW1iZXIsIHdpZHRoPzogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5saXN0LmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdHByaXZhdGUgb3BlbkV4dGVuc2lvbihleHRlbnNpb246IElFeHRlbnNpb24sIG9wdGlvbnM6IHsgc2lkZUJ5c2lkZT86IGJvb2xlYW47IHByZXNlcnZlRm9jdXM/OiBib29sZWFuOyBwaW5uZWQ/OiBib29sZWFuIH0pOiB2b2lkIHtcblx0XHRleHRlbnNpb24gPSB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmZpbHRlcihlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpKVswXSB8fCBleHRlbnNpb247XG5cdFx0dGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuKGV4dGVuc2lvbiwge1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdG1vZGFsOiBvcHRpb25zLnNpZGVCeXNpZGUgPyB1bmRlZmluZWQgOiBidWlsZE1vZGFsTmF2aWdhdGlvbkZvclBhZ2VkTGlzdChcblx0XHRcdFx0ZXh0ZW5zaW9uLFxuXHRcdFx0XHQoKSA9PiB0aGlzLmxpc3QubW9kZWwsXG5cdFx0XHRcdChleHRBLCBleHRCKSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhleHRBLmlkZW50aWZpZXIsIGV4dEIuaWRlbnRpZmllciksXG5cdFx0XHRcdChleHQsIG1vZGFsKSA9PiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW4oZXh0LCB7IHBpbm5lZDogZmFsc2UsIG1vZGFsIH0pLFxuXHRcdFx0XHR0aGlzLm1vZGFsTmF2aWdhdGlvbkRpc3Bvc2FibGUsXG5cdFx0XHRcdHRoaXMubG9nU2VydmljZVxuXHRcdFx0KSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25Db250ZXh0TWVudShlOiBJTGlzdENvbnRleHRNZW51RXZlbnQ8SUV4dGVuc2lvbj4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoZS5lbGVtZW50KSB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGNvbnN0IG1hbmFnZUV4dGVuc2lvbkFjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1hbmFnZUV4dGVuc2lvbkFjdGlvbikpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gZS5lbGVtZW50ID8gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5sb2NhbC5maW5kKGxvY2FsID0+IGFyZVNhbWVFeHRlbnNpb25zKGxvY2FsLmlkZW50aWZpZXIsIGUuZWxlbWVudCEuaWRlbnRpZmllcikgJiYgKCFlLmVsZW1lbnQhLnNlcnZlciB8fCBlLmVsZW1lbnQhLnNlcnZlciA9PT0gbG9jYWwuc2VydmVyKSkgfHwgZS5lbGVtZW50XG5cdFx0XHRcdDogZS5lbGVtZW50O1xuXHRcdFx0bWFuYWdlRXh0ZW5zaW9uQWN0aW9uLmV4dGVuc2lvbiA9IGV4dGVuc2lvbjtcblx0XHRcdGxldCBncm91cHM6IElBY3Rpb25bXVtdID0gW107XG5cdFx0XHRpZiAobWFuYWdlRXh0ZW5zaW9uQWN0aW9uLmVuYWJsZWQpIHtcblx0XHRcdFx0Z3JvdXBzID0gYXdhaXQgbWFuYWdlRXh0ZW5zaW9uQWN0aW9uLmdldEFjdGlvbkdyb3VwcygpO1xuXHRcdFx0fSBlbHNlIGlmIChleHRlbnNpb24pIHtcblx0XHRcdFx0Z3JvdXBzID0gYXdhaXQgZ2V0Q29udGV4dE1lbnVBY3Rpb25zKGV4dGVuc2lvbiwgdGhpcy5jb250ZXh0S2V5U2VydmljZSwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0XHRcdGdyb3Vwcy5mb3JFYWNoKGdyb3VwID0+IGdyb3VwLmZvckVhY2goZXh0ZW5zaW9uQWN0aW9uID0+IHtcblx0XHRcdFx0XHRpZiAoZXh0ZW5zaW9uQWN0aW9uIGluc3RhbmNlb2YgRXh0ZW5zaW9uQWN0aW9uKSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb25BY3Rpb24uZXh0ZW5zaW9uID0gZXh0ZW5zaW9uO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IG1lbnVBY3Rpb25zIG9mIGdyb3Vwcykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IG1lbnVBY3Rpb24gb2YgbWVudUFjdGlvbnMpIHtcblx0XHRcdFx0XHRhY3Rpb25zLnB1c2gobWVudUFjdGlvbik7XG5cdFx0XHRcdFx0aWYgKGlzRGlzcG9zYWJsZShtZW51QWN0aW9uKSkge1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG1lbnVBY3Rpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRhY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHRcdH1cblx0XHRcdGFjdGlvbnMucG9wKCk7XG5cdFx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRnZXRBbmNob3I6ICgpID0+IGUuYW5jaG9yLFxuXHRcdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zLFxuXHRcdFx0XHRhY3Rpb25SdW5uZXI6IHRoaXMuY29udGV4dE1lbnVBY3Rpb25SdW5uZXIsXG5cdFx0XHRcdG9uSGlkZTogKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbnNHcmlkVmlldyBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlbmRlcmVyOiBSZW5kZXJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBkZWxlZ2F0ZTogRGVsZWdhdGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZVN0b3JlOiBEaXNwb3NhYmxlU3RvcmU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cGFyZW50OiBIVE1MRWxlbWVudCxcblx0XHRkZWxlZ2F0ZTogRGVsZWdhdGUsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmVsZW1lbnQgPSBkb20uYXBwZW5kKHBhcmVudCwgZG9tLiQoJy5leHRlbnNpb25zLWdyaWQtdmlldycpKTtcblx0XHR0aGlzLnJlbmRlcmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZW5kZXJlciwgeyBvbkZvY3VzOiBFdmVudC5Ob25lLCBvbkJsdXI6IEV2ZW50Lk5vbmUsIGZpbHRlcnM6IHt9IH0sIHsgaG92ZXJPcHRpb25zOiB7IHBvc2l0aW9uKCkgeyByZXR1cm4gSG92ZXJQb3NpdGlvbi5CRUxPVzsgfSB9IH0pO1xuXHRcdHRoaXMuZGVsZWdhdGUgPSBkZWxlZ2F0ZTtcblx0XHR0aGlzLmRpc3Bvc2FibGVTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdH1cblxuXHRzZXRFeHRlbnNpb25zKGV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zYWJsZVN0b3JlLmNsZWFyKCk7XG5cdFx0ZXh0ZW5zaW9ucy5mb3JFYWNoKChlLCBpbmRleCkgPT4gdGhpcy5yZW5kZXJFeHRlbnNpb24oZSwgaW5kZXgpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRXh0ZW5zaW9uKGV4dGVuc2lvbjogSUV4dGVuc2lvbiwgaW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGV4dGVuc2lvbkNvbnRhaW5lciA9IGRvbS5hcHBlbmQodGhpcy5lbGVtZW50LCBkb20uJCgnLmV4dGVuc2lvbi1jb250YWluZXInKSk7XG5cdFx0ZXh0ZW5zaW9uQ29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke3RoaXMuZGVsZWdhdGUuZ2V0SGVpZ2h0KCl9cHhgO1xuXHRcdGV4dGVuc2lvbkNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3RhYmluZGV4JywgJzAnKTtcblxuXHRcdGNvbnN0IHRlbXBsYXRlID0gdGhpcy5yZW5kZXJlci5yZW5kZXJUZW1wbGF0ZShleHRlbnNpb25Db250YWluZXIpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZVN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5yZW5kZXJlci5kaXNwb3NlVGVtcGxhdGUodGVtcGxhdGUpKSk7XG5cblx0XHRjb25zdCBvcGVuRXh0ZW5zaW9uQWN0aW9uID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShPcGVuRXh0ZW5zaW9uQWN0aW9uKTtcblx0XHRvcGVuRXh0ZW5zaW9uQWN0aW9uLmV4dGVuc2lvbiA9IGV4dGVuc2lvbjtcblx0XHR0ZW1wbGF0ZS5uYW1lLnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCAnMCcpO1xuXG5cdFx0Y29uc3QgaGFuZGxlRXZlbnQgPSAoZTogU3RhbmRhcmRNb3VzZUV2ZW50IHwgU3RhbmRhcmRLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZSBpbnN0YW5jZW9mIFN0YW5kYXJkS2V5Ym9hcmRFdmVudCAmJiBlLmtleUNvZGUgIT09IEtleUNvZGUuRW50ZXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0b3BlbkV4dGVuc2lvbkFjdGlvbi5ydW4oZS5jdHJsS2V5IHx8IGUubWV0YUtleSk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdH07XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVTdG9yZS5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0ZW1wbGF0ZS5uYW1lLCBkb20uRXZlbnRUeXBlLkNMSUNLLCAoZTogTW91c2VFdmVudCkgPT4gaGFuZGxlRXZlbnQobmV3IFN0YW5kYXJkTW91c2VFdmVudChkb20uZ2V0V2luZG93KHRlbXBsYXRlLm5hbWUpLCBlKSkpKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVTdG9yZS5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0ZW1wbGF0ZS5uYW1lLCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4gaGFuZGxlRXZlbnQobmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKSkpKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVTdG9yZS5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihleHRlbnNpb25Db250YWluZXIsIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiBoYW5kbGVFdmVudChuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpKSkpO1xuXG5cdFx0dGhpcy5yZW5kZXJlci5yZW5kZXJFbGVtZW50KGV4dGVuc2lvbiwgaW5kZXgsIHRlbXBsYXRlKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUV4dGVuc2lvblRlbXBsYXRlRGF0YSB7XG5cdG5hbWU6IEhUTUxFbGVtZW50O1xuXHRpZGVudGlmaWVyOiBIVE1MRWxlbWVudDtcblx0YXV0aG9yOiBIVE1MRWxlbWVudDtcblx0ZXh0ZW5zaW9uRGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlW107XG5cdGV4dGVuc2lvbkRhdGE6IElFeHRlbnNpb25EYXRhO1xufVxuXG5pbnRlcmZhY2UgSVVua25vd25FeHRlbnNpb25UZW1wbGF0ZURhdGEge1xuXHRpZGVudGlmaWVyOiBIVE1MRWxlbWVudDtcbn1cblxuaW50ZXJmYWNlIElFeHRlbnNpb25EYXRhIHtcblx0ZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uO1xuXHRoYXNDaGlsZHJlbjogYm9vbGVhbjtcblx0Z2V0Q2hpbGRyZW46ICgpID0+IFByb21pc2U8SUV4dGVuc2lvbkRhdGFbXSB8IG51bGw+O1xuXHRwYXJlbnQ6IElFeHRlbnNpb25EYXRhIHwgbnVsbDtcbn1cblxuY2xhc3MgQXN5bmNEYXRhU291cmNlIGltcGxlbWVudHMgSUFzeW5jRGF0YVNvdXJjZTxJRXh0ZW5zaW9uRGF0YSwgYW55PiB7XG5cblx0cHVibGljIGhhc0NoaWxkcmVuKHsgaGFzQ2hpbGRyZW4gfTogSUV4dGVuc2lvbkRhdGEpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaGFzQ2hpbGRyZW47XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q2hpbGRyZW4oZXh0ZW5zaW9uRGF0YTogSUV4dGVuc2lvbkRhdGEpOiBQcm9taXNlPGFueT4ge1xuXHRcdHJldHVybiBleHRlbnNpb25EYXRhLmdldENoaWxkcmVuKCk7XG5cdH1cblxufVxuXG5jbGFzcyBWaXJ1YWxEZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPElFeHRlbnNpb25EYXRhPiB7XG5cblx0cHVibGljIGdldEhlaWdodChlbGVtZW50OiBJRXh0ZW5zaW9uRGF0YSk6IG51bWJlciB7XG5cdFx0cmV0dXJuIDYyO1xuXHR9XG5cdHB1YmxpYyBnZXRUZW1wbGF0ZUlkKHsgZXh0ZW5zaW9uIH06IElFeHRlbnNpb25EYXRhKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gZXh0ZW5zaW9uID8gRXh0ZW5zaW9uUmVuZGVyZXIuVEVNUExBVEVfSUQgOiBVbmtub3duRXh0ZW5zaW9uUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdH1cbn1cblxuY2xhc3MgRXh0ZW5zaW9uUmVuZGVyZXIgaW1wbGVtZW50cyBJTGlzdFJlbmRlcmVyPElUcmVlTm9kZTxJRXh0ZW5zaW9uRGF0YT4sIElFeHRlbnNpb25UZW1wbGF0ZURhdGE+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnZXh0ZW5zaW9uLXRlbXBsYXRlJztcblxuXHRjb25zdHJ1Y3RvcihASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSkge1xuXHR9XG5cblx0cHVibGljIGdldCB0ZW1wbGF0ZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIEV4dGVuc2lvblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHR9XG5cblx0cHVibGljIHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRXh0ZW5zaW9uVGVtcGxhdGVEYXRhIHtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnZXh0ZW5zaW9uJyk7XG5cblx0XHRjb25zdCBpY29uV2lkZ2V0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25JY29uV2lkZ2V0LCBjb250YWluZXIpO1xuXHRcdGNvbnN0IGRldGFpbHMgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5kZXRhaWxzJykpO1xuXG5cdFx0Y29uc3QgaGVhZGVyID0gZG9tLmFwcGVuZChkZXRhaWxzLCBkb20uJCgnLmhlYWRlcicpKTtcblx0XHRjb25zdCBuYW1lID0gZG9tLmFwcGVuZChoZWFkZXIsIGRvbS4kKCdzcGFuLm5hbWUnKSk7XG5cdFx0Y29uc3Qgb3BlbkV4dGVuc2lvbkFjdGlvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoT3BlbkV4dGVuc2lvbkFjdGlvbik7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uRGlzcG9zYWJsZXMgPSBbZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihuYW1lLCAnY2xpY2snLCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0b3BlbkV4dGVuc2lvbkFjdGlvbi5ydW4oZS5jdHJsS2V5IHx8IGUubWV0YUtleSk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdH0pLCBpY29uV2lkZ2V0LCBvcGVuRXh0ZW5zaW9uQWN0aW9uXTtcblx0XHRjb25zdCBpZGVudGlmaWVyID0gZG9tLmFwcGVuZChoZWFkZXIsIGRvbS4kKCdzcGFuLmlkZW50aWZpZXInKSk7XG5cblx0XHRjb25zdCBmb290ZXIgPSBkb20uYXBwZW5kKGRldGFpbHMsIGRvbS4kKCcuZm9vdGVyJykpO1xuXHRcdGNvbnN0IGF1dGhvciA9IGRvbS5hcHBlbmQoZm9vdGVyLCBkb20uJCgnLmF1dGhvcicpKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZSxcblx0XHRcdGlkZW50aWZpZXIsXG5cdFx0XHRhdXRob3IsXG5cdFx0XHRleHRlbnNpb25EaXNwb3NhYmxlcyxcblx0XHRcdHNldCBleHRlbnNpb25EYXRhKGV4dGVuc2lvbkRhdGE6IElFeHRlbnNpb25EYXRhKSB7XG5cdFx0XHRcdGljb25XaWRnZXQuZXh0ZW5zaW9uID0gZXh0ZW5zaW9uRGF0YS5leHRlbnNpb247XG5cdFx0XHRcdG9wZW5FeHRlbnNpb25BY3Rpb24uZXh0ZW5zaW9uID0gZXh0ZW5zaW9uRGF0YS5leHRlbnNpb247XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyByZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxJRXh0ZW5zaW9uRGF0YT4sIGluZGV4OiBudW1iZXIsIGRhdGE6IElFeHRlbnNpb25UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBleHRlbnNpb24gPSBub2RlLmVsZW1lbnQuZXh0ZW5zaW9uO1xuXHRcdGRhdGEubmFtZS50ZXh0Q29udGVudCA9IGV4dGVuc2lvbi5kaXNwbGF5TmFtZTtcblx0XHRkYXRhLmlkZW50aWZpZXIudGV4dENvbnRlbnQgPSBleHRlbnNpb24uaWRlbnRpZmllci5pZDtcblx0XHRkYXRhLmF1dGhvci50ZXh0Q29udGVudCA9IGV4dGVuc2lvbi5wdWJsaXNoZXJEaXNwbGF5TmFtZTtcblx0XHRkYXRhLmV4dGVuc2lvbkRhdGEgPSBub2RlLmVsZW1lbnQ7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUV4dGVuc2lvblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5leHRlbnNpb25EaXNwb3NhYmxlcyA9IGRpc3Bvc2UoKDxJRXh0ZW5zaW9uVGVtcGxhdGVEYXRhPnRlbXBsYXRlRGF0YSkuZXh0ZW5zaW9uRGlzcG9zYWJsZXMpO1xuXHR9XG59XG5cbmNsYXNzIFVua25vd25FeHRlbnNpb25SZW5kZXJlciBpbXBsZW1lbnRzIElMaXN0UmVuZGVyZXI8SVRyZWVOb2RlPElFeHRlbnNpb25EYXRhPiwgSVVua25vd25FeHRlbnNpb25UZW1wbGF0ZURhdGE+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAndW5rbm93bi1leHRlbnNpb24tdGVtcGxhdGUnO1xuXG5cdHB1YmxpYyBnZXQgdGVtcGxhdGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBVbmtub3duRXh0ZW5zaW9uUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdH1cblxuXHRwdWJsaWMgcmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElVbmtub3duRXh0ZW5zaW9uVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBtZXNzYWdlQ29udGFpbmVyID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCdkaXYudW5rbm93bi1leHRlbnNpb24nKSk7XG5cdFx0ZG9tLmFwcGVuZChtZXNzYWdlQ29udGFpbmVyLCBkb20uJCgnc3Bhbi5lcnJvci1tYXJrZXInKSkudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnZXJyb3InLCBcIkVycm9yXCIpO1xuXHRcdGRvbS5hcHBlbmQobWVzc2FnZUNvbnRhaW5lciwgZG9tLiQoJ3NwYW4ubWVzc2FnZScpKS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdVbmtub3duIEV4dGVuc2lvbicsIFwiVW5rbm93biBFeHRlbnNpb246XCIpO1xuXG5cdFx0Y29uc3QgaWRlbnRpZmllciA9IGRvbS5hcHBlbmQobWVzc2FnZUNvbnRhaW5lciwgZG9tLiQoJ3NwYW4ubWVzc2FnZScpKTtcblx0XHRyZXR1cm4geyBpZGVudGlmaWVyIH07XG5cdH1cblxuXHRwdWJsaWMgcmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8SUV4dGVuc2lvbkRhdGE+LCBpbmRleDogbnVtYmVyLCBkYXRhOiBJVW5rbm93bkV4dGVuc2lvblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGRhdGEuaWRlbnRpZmllci50ZXh0Q29udGVudCA9IG5vZGUuZWxlbWVudC5leHRlbnNpb24uaWRlbnRpZmllci5pZDtcblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlVGVtcGxhdGUoZGF0YTogSVVua25vd25FeHRlbnNpb25UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0fVxufVxuXG5jbGFzcyBPcGVuRXh0ZW5zaW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uIHtcblxuXHRwcml2YXRlIF9leHRlbnNpb246IElFeHRlbnNpb24gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoQElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrZGJlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKSB7XG5cdFx0c3VwZXIoJ2V4dGVuc2lvbnMuYWN0aW9uLm9wZW5FeHRlbnNpb24nLCAnJyk7XG5cdH1cblxuXHRwdWJsaWMgc2V0IGV4dGVuc2lvbihleHRlbnNpb246IElFeHRlbnNpb24pIHtcblx0XHR0aGlzLl9leHRlbnNpb24gPSBleHRlbnNpb247XG5cdH1cblxuXHRvdmVycmlkZSBydW4oc2lkZUJ5c2lkZTogYm9vbGVhbik6IFByb21pc2U8YW55PiB7XG5cdFx0aWYgKHRoaXMuX2V4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uc1dvcmtkYmVuY2hTZXJ2aWNlLm9wZW4odGhpcy5fZXh0ZW5zaW9uLCB7IHNpZGVCeXNpZGUgfSk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uc1RyZWUgZXh0ZW5kcyBXb3JrYmVuY2hBc3luY0RhdGFUcmVlPElFeHRlbnNpb25EYXRhLCBJRXh0ZW5zaW9uRGF0YT4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGlucHV0OiBJRXh0ZW5zaW9uRGF0YSxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdG92ZXJyaWRlU3R5bGVzOiBJU3R5bGVPdmVycmlkZTxJTGlzdFN0eWxlcz4sXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTGlzdFNlcnZpY2UgbGlzdFNlcnZpY2U6IElMaXN0U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgZXh0ZW5zaW9uc1dvcmtkYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Vcblx0KSB7XG5cdFx0Y29uc3QgZGVsZWdhdGUgPSBuZXcgVmlydWFsRGVsZWdhdGUoKTtcblx0XHRjb25zdCBkYXRhU291cmNlID0gbmV3IEFzeW5jRGF0YVNvdXJjZSgpO1xuXHRcdGNvbnN0IHJlbmRlcmVycyA9IFtpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25SZW5kZXJlciksIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVua25vd25FeHRlbnNpb25SZW5kZXJlcildO1xuXHRcdGNvbnN0IGlkZW50aXR5UHJvdmlkZXIgPSB7XG5cdFx0XHRnZXRJZCh7IGV4dGVuc2lvbiwgcGFyZW50IH06IElFeHRlbnNpb25EYXRhKTogc3RyaW5nIHtcblx0XHRcdFx0cmV0dXJuIHBhcmVudCA/IHRoaXMuZ2V0SWQocGFyZW50KSArICcvJyArIGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkIDogZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQ7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHN1cGVyKFxuXHRcdFx0J0V4dGVuc2lvbnNUcmVlJyxcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdGRlbGVnYXRlLFxuXHRcdFx0cmVuZGVyZXJzLFxuXHRcdFx0ZGF0YVNvdXJjZSxcblx0XHRcdHtcblx0XHRcdFx0aW5kZW50OiA0MCxcblx0XHRcdFx0aWRlbnRpdHlQcm92aWRlcixcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0b3ZlcnJpZGVTdHlsZXMsXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldEFyaWFMYWJlbChleHRlbnNpb25EYXRhOiBJRXh0ZW5zaW9uRGF0YSk6IHN0cmluZyB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZ2V0QXJpYUxhYmVsRm9yRXh0ZW5zaW9uKGV4dGVuc2lvbkRhdGEuZXh0ZW5zaW9uKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdleHRlbnNpb25zJywgXCJFeHRlbnNpb25zXCIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgbGlzdFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdFx0KTtcblxuXHRcdHRoaXMuc2V0SW5wdXQoaW5wdXQpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5vbkRpZENoYW5nZVNlbGVjdGlvbihldmVudCA9PiB7XG5cdFx0XHRpZiAoZG9tLmlzS2V5Ym9hcmRFdmVudChldmVudC5icm93c2VyRXZlbnQpKSB7XG5cdFx0XHRcdGV4dGVuc2lvbnNXb3JrZGJlbmNoU2VydmljZS5vcGVuKGV2ZW50LmVsZW1lbnRzWzBdLmV4dGVuc2lvbiwgeyBzaWRlQnlzaWRlOiBmYWxzZSB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbkRhdGEgaW1wbGVtZW50cyBJRXh0ZW5zaW9uRGF0YSB7XG5cblx0cmVhZG9ubHkgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uO1xuXHRyZWFkb25seSBwYXJlbnQ6IElFeHRlbnNpb25EYXRhIHwgbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSBnZXRDaGlsZHJlbkV4dGVuc2lvbklkczogKGV4dGVuc2lvbjogSUV4dGVuc2lvbikgPT4gc3RyaW5nW107XG5cdHByaXZhdGUgcmVhZG9ubHkgY2hpbGRyZW5FeHRlbnNpb25JZHM6IHN0cmluZ1tdO1xuXHRwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U7XG5cblx0Y29uc3RydWN0b3IoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCBwYXJlbnQ6IElFeHRlbnNpb25EYXRhIHwgbnVsbCwgZ2V0Q2hpbGRyZW5FeHRlbnNpb25JZHM6IChleHRlbnNpb246IElFeHRlbnNpb24pID0+IHN0cmluZ1tdLCBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKSB7XG5cdFx0dGhpcy5leHRlbnNpb24gPSBleHRlbnNpb247XG5cdFx0dGhpcy5wYXJlbnQgPSBwYXJlbnQ7XG5cdFx0dGhpcy5nZXRDaGlsZHJlbkV4dGVuc2lvbklkcyA9IGdldENoaWxkcmVuRXh0ZW5zaW9uSWRzO1xuXHRcdHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgPSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTtcblx0XHR0aGlzLmNoaWxkcmVuRXh0ZW5zaW9uSWRzID0gdGhpcy5nZXRDaGlsZHJlbkV4dGVuc2lvbklkcyhleHRlbnNpb24pO1xuXHR9XG5cblx0Z2V0IGhhc0NoaWxkcmVuKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpc05vbkVtcHR5QXJyYXkodGhpcy5jaGlsZHJlbkV4dGVuc2lvbklkcyk7XG5cdH1cblxuXHRhc3luYyBnZXRDaGlsZHJlbigpOiBQcm9taXNlPElFeHRlbnNpb25EYXRhW10gfCBudWxsPiB7XG5cdFx0aWYgKHRoaXMuaGFzQ2hpbGRyZW4pIHtcblx0XHRcdGNvbnN0IHJlc3VsdDogSUV4dGVuc2lvbltdID0gYXdhaXQgZ2V0RXh0ZW5zaW9ucyh0aGlzLmNoaWxkcmVuRXh0ZW5zaW9uSWRzLCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKTtcblx0XHRcdHJldHVybiByZXN1bHQubWFwKGV4dGVuc2lvbiA9PiBuZXcgRXh0ZW5zaW9uRGF0YShleHRlbnNpb24sIHRoaXMsIHRoaXMuZ2V0Q2hpbGRyZW5FeHRlbnNpb25JZHMsIHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldEV4dGVuc2lvbnMoZXh0ZW5zaW9uczogc3RyaW5nW10sIGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpOiBQcm9taXNlPElFeHRlbnNpb25bXT4ge1xuXHRjb25zdCBsb2NhbEJ5SWQgPSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5sb2NhbC5yZWR1Y2UoKHJlc3VsdCwgZSkgPT4geyByZXN1bHQuc2V0KGUuaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpLCBlKTsgcmV0dXJuIHJlc3VsdDsgfSwgbmV3IE1hcDxzdHJpbmcsIElFeHRlbnNpb24+KCkpO1xuXHRjb25zdCByZXN1bHQ6IElFeHRlbnNpb25bXSA9IFtdO1xuXHRjb25zdCB0b1F1ZXJ5OiBzdHJpbmdbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGV4dGVuc2lvbklkIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRjb25zdCBpZCA9IGV4dGVuc2lvbklkLnRvTG93ZXJDYXNlKCk7XG5cdFx0Y29uc3QgbG9jYWwgPSBsb2NhbEJ5SWQuZ2V0KGlkKTtcblx0XHRpZiAobG9jYWwpIHtcblx0XHRcdHJlc3VsdC5wdXNoKGxvY2FsKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dG9RdWVyeS5wdXNoKGlkKTtcblx0XHR9XG5cdH1cblx0aWYgKHRvUXVlcnkubGVuZ3RoKSB7XG5cdFx0Y29uc3QgZ2FsbGVyeVJlc3VsdCA9IGF3YWl0IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmdldEV4dGVuc2lvbnModG9RdWVyeS5tYXAoaWQgPT4gKHsgaWQgfSkpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRyZXN1bHQucHVzaCguLi5nYWxsZXJ5UmVzdWx0KTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIEJ1aWxkcyBtb2RhbCBuYXZpZ2F0aW9uIG9wdGlvbnMgZm9yIG5hdmlnYXRpbmcgaXRlbXMgaW4gYSBwYWdlZCBsaXN0IG1vZGVsLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRNb2RhbE5hdmlnYXRpb25Gb3JQYWdlZExpc3Q8VD4oXG5cdG9wZW5lZEl0ZW06IFQsXG5cdGdldE1vZGVsOiAoKSA9PiBJUGFnZWRNb2RlbDxUPiB8IHVuZGVmaW5lZCxcblx0aXNTYW1lOiAoYTogVCwgYjogVCkgPT4gYm9vbGVhbixcblx0b3Blbkl0ZW06IChpdGVtOiBULCBtb2RhbDogSU1vZGFsRWRpdG9yUGFydE9wdGlvbnMpID0+IHZvaWQsXG5cdGNhbmNlbGxhdGlvblN0b3JlOiBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4sXG5cdGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG4pOiBJTW9kYWxFZGl0b3JQYXJ0T3B0aW9ucyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG1vZGVsID0gZ2V0TW9kZWwoKTtcblx0aWYgKCFtb2RlbCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCB0b3RhbCA9IG1vZGVsLmxlbmd0aDtcblx0aWYgKHRvdGFsIDw9IDEpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Ly8gRmluZCB0aGUgaW5kZXggb2YgdGhlIG9wZW5lZCBpdGVtIGluIHRoZSBsaXN0XG5cdGxldCBjdXJyZW50ID0gLTE7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgdG90YWw7IGkrKykge1xuXHRcdGlmIChtb2RlbC5pc1Jlc29sdmVkKGkpICYmIGlzU2FtZShtb2RlbC5nZXQoaSksIG9wZW5lZEl0ZW0pKSB7XG5cdFx0XHRjdXJyZW50ID0gaTtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdGlmIChjdXJyZW50ID09PSAtMSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCBvcGVuQXRJbmRleCA9IChpbmRleDogbnVtYmVyLCBpdGVtOiBUKSA9PiB7XG5cdFx0Y29uc3QgY3VycmVudFRvdGFsID0gZ2V0TW9kZWwoKT8ubGVuZ3RoID8/IDA7XG5cdFx0b3Blbkl0ZW0oaXRlbSwgeyBuYXZpZ2F0aW9uOiB7IHRvdGFsOiBjdXJyZW50VG90YWwsIGN1cnJlbnQ6IGluZGV4LCBuYXZpZ2F0ZSB9IH0pO1xuXHR9O1xuXG5cdGxldCBjdHM6IENhbmNlbGxhdGlvblRva2VuU291cmNlIHwgdW5kZWZpbmVkO1xuXHRjb25zdCBuYXZpZ2F0ZSA9IChpbmRleDogbnVtYmVyKSA9PiB7XG5cdFx0Y3RzPy5jYW5jZWwoKTtcblx0XHRjdHMgPSBjYW5jZWxsYXRpb25TdG9yZS52YWx1ZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IHRva2VuID0gY3RzLnRva2VuO1xuXG5cdFx0Y29uc3QgY3VycmVudE1vZGVsID0gZ2V0TW9kZWwoKTtcblx0XHRpZiAoIWN1cnJlbnRNb2RlbCB8fCBpbmRleCA8IDAgfHwgaW5kZXggPj0gY3VycmVudE1vZGVsLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEZhc3QgcGF0aDogaXRlbSBhbHJlYWR5IHJlc29sdmVkXG5cdFx0aWYgKGN1cnJlbnRNb2RlbC5pc1Jlc29sdmVkKGluZGV4KSkge1xuXHRcdFx0b3BlbkF0SW5kZXgoaW5kZXgsIGN1cnJlbnRNb2RlbC5nZXQoaW5kZXgpKTtcblx0XHR9XG5cblx0XHQvLyBTbG93IHBhdGg6IHJlc29sdmUgdGhlIGl0ZW0gZmlyc3Rcblx0XHRlbHNlIHtcblx0XHRcdGN1cnJlbnRNb2RlbC5yZXNvbHZlKGluZGV4LCB0b2tlbikudGhlbihpdGVtID0+IHtcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0b3BlbkF0SW5kZXgoaW5kZXgsIGl0ZW0pO1xuXHRcdFx0fSwgZXJyb3IgPT4ge1xuXHRcdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdFx0bG9nU2VydmljZS5lcnJvcihgRXJyb3Igd2hpbGUgcmVzb2x2aW5nIGl0ZW0gYXQgaW5kZXggJHtpbmRleH0gZm9yIG1vZGFsIG5hdmlnYXRpb25gLCBlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fTtcblxuXHRyZXR1cm4geyBuYXZpZ2F0aW9uOiB7IHRvdGFsLCBjdXJyZW50LCBuYXZpZ2F0ZSB9IH07XG59XG5cbnJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50KCh0aGVtZTogSUNvbG9yVGhlbWUsIGNvbGxlY3RvcjogSUNzc1N0eWxlQ29sbGVjdG9yKSA9PiB7XG5cdGNvbnN0IGZvY3VzQmFja2dyb3VuZCA9IHRoZW1lLmdldENvbG9yKGxpc3RGb2N1c0JhY2tncm91bmQpO1xuXHRpZiAoZm9jdXNCYWNrZ3JvdW5kKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5leHRlbnNpb25zLWdyaWQtdmlldyAuZXh0ZW5zaW9uLWNvbnRhaW5lcjpmb2N1cyB7IGJhY2tncm91bmQtY29sb3I6ICR7Zm9jdXNCYWNrZ3JvdW5kfTsgb3V0bGluZTogbm9uZTsgfWApO1xuXHR9XG5cdGNvbnN0IGZvY3VzRm9yZWdyb3VuZCA9IHRoZW1lLmdldENvbG9yKGxpc3RGb2N1c0ZvcmVncm91bmQpO1xuXHRpZiAoZm9jdXNGb3JlZ3JvdW5kKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5leHRlbnNpb25zLWdyaWQtdmlldyAuZXh0ZW5zaW9uLWNvbnRhaW5lcjpmb2N1cyB7IGNvbG9yOiAke2ZvY3VzRm9yZWdyb3VuZH07IH1gKTtcblx0fVxuXHRjb25zdCBmb3JlZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihmb3JlZ3JvdW5kKTtcblx0Y29uc3QgZWRpdG9yQmFja2dyb3VuZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZWRpdG9yQmFja2dyb3VuZCk7XG5cdGlmIChmb3JlZ3JvdW5kQ29sb3IgJiYgZWRpdG9yQmFja2dyb3VuZENvbG9yKSB7XG5cdFx0Y29uc3QgYXV0aG9yRm9yZWdyb3VuZCA9IGZvcmVncm91bmRDb2xvci50cmFuc3BhcmVudCguOSkubWFrZU9wYXF1ZShlZGl0b3JCYWNrZ3JvdW5kQ29sb3IpO1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAuZXh0ZW5zaW9ucy1ncmlkLXZpZXcgLmV4dGVuc2lvbi1jb250YWluZXI6bm90KC5kaXNhYmxlZCkgLmF1dGhvciB7IGNvbG9yOiAke2F1dGhvckZvcmVncm91bmR9OyB9YCk7XG5cdFx0Y29uc3QgZGlzYWJsZWRFeHRlbnNpb25Gb3JlZ3JvdW5kID0gZm9yZWdyb3VuZENvbG9yLnRyYW5zcGFyZW50KC41KS5tYWtlT3BhcXVlKGVkaXRvckJhY2tncm91bmRDb2xvcik7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5leHRlbnNpb25zLWdyaWQtdmlldyAuZXh0ZW5zaW9uLWNvbnRhaW5lci5kaXNhYmxlZCB7IGNvbG9yOiAke2Rpc2FibGVkRXh0ZW5zaW9uRm9yZWdyb3VuZH07IH1gKTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGdCQUFnQjtBQUN6QixTQUFzQixTQUFTLFlBQVksaUJBQWlCLGNBQWMsY0FBYyx5QkFBeUI7QUFDakgsU0FBUyxRQUFRLGNBQXVCLGlCQUFpQjtBQUN6RCxTQUFTLG1DQUFxRTtBQUM5RSxTQUFTLGFBQWE7QUFDdEIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxjQUEwQyx3QkFBd0IsMEJBQTBCO0FBQ3JHLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsa0NBQW1FO0FBRzVFLFNBQVMsbUJBQW1CLCtCQUErQjtBQUUzRCxTQUFTLHVCQUF1QjtBQUNo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QU8sY0FBYyxTQUFTLE9BQU8sU0FBUyxFQUFFLENBQUM7QUFBQSxFQUNqRjtBQUVBLE1BQUk7QUFDSixRQUFNLFdBQVcsQ0FBQyxVQUFrQjtBQUNuQyxTQUFLLE9BQU87QUFDWixVQUFNLGtCQUFrQixRQUFRLElBQUksd0JBQXdCO0FBQzVELFVBQU0sUUFBUSxJQUFJO0FBRWxCLFVBQU0sZUFBZSxTQUFTO0FBQzlCLFFBQUksQ0FBQyxnQkFBZ0IsUUFBUSxLQUFLLFNBQVMsYUFBYSxRQUFRO0FBQy9EO0FBQUEsSUFDRDtBQUdBLFFBQUksYUFBYSxXQUFXLEtBQUssR0FBRztBQUNuQyxrQkFBWSxPQUFPLGFBQWEsSUFBSSxLQUFLLENBQUM7QUFBQSxJQUMzQyxPQUdLO0FBQ0osbUJBQWEsUUFBUSxPQUFPLEtBQUssRUFBRSxLQUFLLFVBQVE7QUFDL0MsWUFBSSxNQUFNLHlCQUF5QjtBQUNsQztBQUFBLFFBQ0Q7QUFFQSxvQkFBWSxPQUFPLElBQUk7QUFBQSxNQUN4QixHQUFHLFdBQVM7QUFDWCxZQUFJLENBQUMsb0JBQW9CLEtBQUssR0FBRztBQUNoQyxxQkFBVyxNQUFNLHVDQUF1QyxLQUFLLHlCQUF5QixLQUFLO0FBQUEsUUFDNUY7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUVBLFNBQU8sRUFBRSxZQUFZLEVBQUUsT0FBTyxTQUFTLFNBQVMsRUFBRTtBQUNuRDtBQUVBLDJCQUEyQixDQUFDLE9BQW9CLGNBQWtDO0FBQ2pGLFFBQU0sa0JBQWtCLE1BQU0sU0FBUyxtQkFBbUI7QUFDMUQsTUFBSSxpQkFBaUI7QUFDcEIsY0FBVSxRQUFRLHdFQUF3RSxlQUFlLG9CQUFvQjtBQUFBLEVBQzlIO0FBQ0EsUUFBTSxrQkFBa0IsTUFBTSxTQUFTLG1CQUFtQjtBQUMxRCxNQUFJLGlCQUFpQjtBQUNwQixjQUFVLFFBQVEsNkRBQTZELGVBQWUsS0FBSztBQUFBLEVBQ3BHO0FBQ0EsUUFBTSxrQkFBa0IsTUFBTSxTQUFTLFVBQVU7QUFDakQsUUFBTSx3QkFBd0IsTUFBTSxTQUFTLGdCQUFnQjtBQUM3RCxNQUFJLG1CQUFtQix1QkFBdUI7QUFDN0MsVUFBTSxtQkFBbUIsZ0JBQWdCLFlBQVksR0FBRSxFQUFFLFdBQVcscUJBQXFCO0FBQ3pGLGNBQVUsUUFBUSw4RUFBOEUsZ0JBQWdCLEtBQUs7QUFDckgsVUFBTSw4QkFBOEIsZ0JBQWdCLFlBQVksR0FBRSxFQUFFLFdBQVcscUJBQXFCO0FBQ3BHLGNBQVUsUUFBUSxnRUFBZ0UsMkJBQTJCLEtBQUs7QUFBQSxFQUNuSDtBQUNELENBQUM7IiwKICAibmFtZXMiOiBbIm9wdGlvbnMiLCAicmVzdWx0Il0KfQo=
