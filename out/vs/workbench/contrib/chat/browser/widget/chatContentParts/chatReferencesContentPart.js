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
var _a, _b;
import * as dom from "../../../../../../base/browser/dom.js";
import { coalesce } from "../../../../../../base/common/arrays.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { matchesSomeScheme, Schemas } from "../../../../../../base/common/network.js";
import { basename } from "../../../../../../base/common/path.js";
import { basenameOrAuthority, isEqualAuthority } from "../../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { URI } from "../../../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../../../nls.js";
import { getFlatContextMenuActions } from "../../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { MenuWorkbenchToolBar } from "../../../../../../platform/actions/browser/toolbar.js";
import { Action2, IMenuService, MenuId, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../../../platform/clipboard/common/clipboardService.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { FileKind } from "../../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { WorkbenchList } from "../../../../../../platform/list/browser/listService.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../../../platform/product/common/productService.js";
import { isDark } from "../../../../../../platform/theme/common/theme.js";
import { IThemeService } from "../../../../../../platform/theme/common/themeService.js";
import { fillEditorsDragData } from "../../../../../browser/dnd.js";
import { ResourceLabels } from "../../../../../browser/labels.js";
import { ResourceContextKey } from "../../../../../common/contextkeys.js";
import { SETTINGS_AUTHORITY } from "../../../../../services/preferences/common/preferences.js";
import { createFileIconThemableTreeContainerScope } from "../../../../files/browser/views/explorerView.js";
import { ExplorerFolderContext } from "../../../../files/common/files.js";
import { chatEditingWidgetFileStateContextKey } from "../../../common/editing/chatEditingService.js";
import { ChatResponseReferencePartStatusKind } from "../../../common/chatService/chatService.js";
import { IChatWidgetService } from "../../chat.js";
import { ChatCollapsibleContentPart } from "./chatCollapsibleContentPart.js";
import { ResourcePool } from "./chatCollections.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
const $ = dom.$;
let ChatCollapsibleListContentPart = class extends ChatCollapsibleContentPart {
  constructor(data, labelOverride, context, contentReferencesListPool, hoverMessage, openerService, menuService, instantiationService, contextMenuService, hoverService, configurationService) {
    super(
      labelOverride ?? (data.length > 1 ? localize("usedReferencesPlural", "Used {0} references", data.length) : localize("usedReferencesSingular", "Used {0} reference", 1)),
      context,
      hoverMessage,
      hoverService,
      configurationService
    );
    this.data = data;
    this.contentReferencesListPool = contentReferencesListPool;
    this.openerService = openerService;
    this.menuService = menuService;
    this.instantiationService = instantiationService;
    this.contextMenuService = contextMenuService;
    this.icon = Codicon.check;
  }
  initContent() {
    const ref = this._register(this.contentReferencesListPool.get());
    const list = ref.object;
    this._register(list.onDidOpen((e) => {
      if (e.element && "reference" in e.element && typeof e.element.reference === "object") {
        const uriOrLocation = "variableName" in e.element.reference ? e.element.reference.value : e.element.reference;
        const uri = URI.isUri(uriOrLocation) ? uriOrLocation : uriOrLocation?.uri;
        if (uri) {
          this.openerService.open(
            uri,
            {
              fromUserGesture: true,
              editorOptions: {
                ...e.editorOptions,
                ...{
                  selection: uriOrLocation && "range" in uriOrLocation ? uriOrLocation.range : void 0
                }
              }
            }
          );
        }
      }
    }));
    this._register(list.onContextMenu((e) => {
      dom.EventHelper.stop(e.browserEvent, true);
      const uri = e.element && getResourceForElement(e.element);
      if (!uri) {
        return;
      }
      this.contextMenuService.showContextMenu({
        getAnchor: () => e.anchor,
        getActions: () => {
          const menu = this.menuService.getMenuActions(MenuId.ChatAttachmentsContext, list.contextKeyService, { shouldForwardArgs: true, arg: uri });
          return getFlatContextMenuActions(menu);
        }
      });
    }));
    const resourceContextKey = this._register(this.instantiationService.createInstance(ResourceContextKey));
    this._register(list.onDidChangeFocus((e) => {
      resourceContextKey.reset();
      const element = e.elements.length ? e.elements[0] : void 0;
      const uri = element && getResourceForElement(element);
      resourceContextKey.set(uri ?? null);
    }));
    const maxItemsShown = 6;
    const itemsShown = Math.min(this.data.length, maxItemsShown);
    const height = itemsShown * 22;
    list.layout(height);
    list.getHTMLElement().style.height = `${height}px`;
    list.splice(0, list.length, this.data);
    return list.getHTMLElement().parentElement;
  }
  hasSameContent(other, followingContent, element) {
    return other.kind === "references" && other.references.length === this.data.length && !!followingContent.length === this.hasFollowingContent;
  }
};
ChatCollapsibleListContentPart = __decorateClass([
  __decorateParam(5, IOpenerService),
  __decorateParam(6, IMenuService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IContextMenuService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, IConfigurationService)
], ChatCollapsibleListContentPart);
let ChatUsedReferencesListContentPart = class extends ChatCollapsibleListContentPart {
  constructor(data, labelOverride, context, contentReferencesListPool, options, openerService, menuService, instantiationService, contextMenuService, hoverService, configurationService) {
    super(data, labelOverride, context, contentReferencesListPool, void 0, openerService, menuService, instantiationService, contextMenuService, hoverService, configurationService);
    this.options = options;
    if (data.length === 0) {
      dom.hide(this.domNode);
    }
  }
  isExpanded() {
    const element = this.element;
    return element.usedReferencesExpanded ?? !!(this.options.expandedWhenEmptyResponse && element.response.value.length === 0);
  }
  setExpanded(value) {
    const element = this.element;
    element.usedReferencesExpanded = !this.isExpanded();
  }
};
ChatUsedReferencesListContentPart = __decorateClass([
  __decorateParam(5, IOpenerService),
  __decorateParam(6, IMenuService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IContextMenuService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, IConfigurationService)
], ChatUsedReferencesListContentPart);
let CollapsibleListPool = class extends Disposable {
  constructor(_onDidChangeVisibility, menuId, listOptions, instantiationService, themeService, labelService) {
    super();
    this._onDidChangeVisibility = _onDidChangeVisibility;
    this.menuId = menuId;
    this.listOptions = listOptions;
    this.instantiationService = instantiationService;
    this.themeService = themeService;
    this.labelService = labelService;
    this._pool = this._register(new ResourcePool(() => this.listFactory()));
  }
  get inUse() {
    return this._pool.inUse;
  }
  listFactory() {
    const store = new DisposableStore();
    const resourceLabels = store.add(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility }));
    const container = $(".chat-used-context-list");
    store.add(createFileIconThemableTreeContainerScope(container, this.themeService));
    const list = store.add(this.instantiationService.createInstance(
      WorkbenchList,
      "ChatListRenderer",
      container,
      new CollapsibleListDelegate(),
      [this.instantiationService.createInstance(CollapsibleListRenderer, resourceLabels, this.menuId)],
      {
        ...this.listOptions,
        alwaysConsumeMouseWheel: false,
        accessibilityProvider: {
          getAriaLabel: (element) => {
            if (element.kind === "warning") {
              return element.content.value;
            }
            const reference = element.reference;
            if (typeof reference === "string") {
              return reference;
            } else if ("variableName" in reference) {
              return reference.variableName;
            } else if (URI.isUri(reference)) {
              return basename(reference.path);
            } else {
              return basename(reference.uri.path);
            }
          },
          getWidgetAriaLabel: () => localize("chatCollapsibleList", "Collapsible Chat References List")
        },
        dnd: {
          getDragURI: (element) => getResourceForElement(element)?.toString() ?? null,
          getDragLabel: (elements, originalEvent) => {
            const uris = coalesce(elements.map(getResourceForElement));
            if (!uris.length) {
              return void 0;
            } else if (uris.length === 1) {
              return this.labelService.getUriLabel(uris[0], { relative: true });
            } else {
              return `${uris.length}`;
            }
          },
          dispose: () => {
          },
          onDragOver: () => false,
          drop: () => {
          },
          onDragStart: (data, originalEvent) => {
            try {
              const elements = data.getData();
              const uris = coalesce(elements.map(getResourceForElement));
              this.instantiationService.invokeFunction((accessor) => fillEditorsDragData(accessor, uris, originalEvent));
            } catch {
            }
          }
        }
      }
    ));
    return {
      list,
      dispose: () => store.dispose()
    };
  }
  get() {
    const wrapper = this._pool.get();
    let stale = false;
    return {
      object: wrapper.list,
      isStale: () => stale,
      dispose: () => {
        stale = true;
        this._pool.release(wrapper);
      }
    };
  }
  clear() {
    this._pool.clear();
  }
};
CollapsibleListPool = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, ILabelService)
], CollapsibleListPool);
class CollapsibleListDelegate {
  getHeight(element) {
    return 22;
  }
  getTemplateId(element) {
    return CollapsibleListRenderer.TEMPLATE_ID;
  }
}
let CollapsibleListRenderer = class {
  constructor(labels, menuId, themeService, productService, instantiationService, contextKeyService) {
    this.labels = labels;
    this.menuId = menuId;
    this.themeService = themeService;
    this.productService = productService;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.templateId = CollapsibleListRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const templateDisposables = new DisposableStore();
    const label = templateDisposables.add(this.labels.create(container, { supportHighlights: true, supportIcons: true }));
    const fileDiffsContainer = $(".working-set-line-counts");
    const addedSpan = dom.$(".working-set-lines-added");
    const removedSpan = dom.$(".working-set-lines-removed");
    fileDiffsContainer.appendChild(addedSpan);
    fileDiffsContainer.appendChild(removedSpan);
    label.element.appendChild(fileDiffsContainer);
    let toolbar;
    let actionBarContainer;
    let contextKeyService;
    if (this.menuId) {
      actionBarContainer = $(".chat-collapsible-list-action-bar");
      contextKeyService = templateDisposables.add(this.contextKeyService.createScoped(actionBarContainer));
      const scopedInstantiationService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
      toolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, this.menuId, { menuOptions: { shouldForwardArgs: true, arg: void 0 } }));
      label.element.appendChild(actionBarContainer);
    }
    return { templateDisposables, label, toolbar, actionBarContainer, contextKeyService, fileDiffsContainer, addedSpan, removedSpan };
  }
  getReferenceIcon(data) {
    if (ThemeIcon.isThemeIcon(data.iconPath)) {
      return data.iconPath;
    } else {
      return isDark(this.themeService.getColorTheme().type) && data.iconPath?.dark ? data.iconPath?.dark : data.iconPath?.light;
    }
  }
  renderElement(data, index, templateData) {
    if (data.kind === "warning") {
      templateData.label.setResource({ name: data.content.value }, { icon: Codicon.warning });
      return;
    }
    const reference = data.reference;
    const icon = this.getReferenceIcon(data);
    templateData.label.element.style.display = "flex";
    let arg;
    if (typeof reference === "object" && "variableName" in reference) {
      if (reference.value) {
        const uri = URI.isUri(reference.value) ? reference.value : reference.value.uri;
        templateData.label.setResource(
          {
            resource: uri,
            name: basenameOrAuthority(uri),
            description: `#${reference.variableName}`,
            range: "range" in reference.value ? reference.value.range : void 0
          },
          { icon, title: data.options?.status?.description ?? data.title }
        );
      } else if (reference.variableName.startsWith("kernelVariable")) {
        const variable = reference.variableName.split(":")[1];
        const asVariableName = `${variable}`;
        const label = `Kernel variable`;
        templateData.label.setLabel(label, asVariableName, { title: data.options?.status?.description });
      } else {
        templateData.label.setLabel(reference.variableName, void 0, { title: data.options?.status?.description ?? data.title });
      }
    } else if (typeof reference === "string") {
      templateData.label.setLabel(reference, void 0, { iconPath: URI.isUri(icon) ? icon : void 0, title: data.options?.status?.description ?? data.title });
    } else {
      const uri = "uri" in reference ? reference.uri : reference;
      arg = uri;
      const extraClasses = data.excluded ? ["excluded"] : [];
      if (uri.scheme === "https" && isEqualAuthority(uri.authority, "github.com") && uri.path.includes("/tree/")) {
        templateData.label.setResource(getResourceLabelForGithubUri(uri), { icon: Codicon.github, title: data.title, strikethrough: data.excluded, extraClasses });
      } else if (uri.scheme === this.productService.urlProtocol && isEqualAuthority(uri.authority, SETTINGS_AUTHORITY)) {
        const settingId = uri.path.substring(1);
        templateData.label.setResource({ resource: uri, name: settingId }, { icon: Codicon.settingsGear, title: localize("setting.hover", "Open setting '{0}'", settingId), strikethrough: data.excluded, extraClasses });
      } else if (matchesSomeScheme(uri, Schemas.mailto, Schemas.http, Schemas.https)) {
        templateData.label.setResource({ resource: uri, name: uri.toString(true) }, { icon: icon ?? Codicon.globe, title: data.options?.status?.description ?? data.title ?? uri.toString(true), strikethrough: data.excluded, extraClasses });
      } else {
        templateData.label.setFile(uri, {
          fileKind: FileKind.FILE,
          // Should not have this live-updating data on a historical reference
          fileDecorations: void 0,
          range: "range" in reference ? reference.range : void 0,
          title: data.options?.status?.description ?? data.title,
          strikethrough: data.excluded,
          extraClasses
        });
      }
    }
    for (const selector of [".monaco-icon-suffix-container", ".monaco-icon-name-container"]) {
      const element = templateData.label.element.querySelector(selector);
      if (element) {
        if (data.options?.status?.kind === ChatResponseReferencePartStatusKind.Omitted || data.options?.status?.kind === ChatResponseReferencePartStatusKind.Partial) {
          element.classList.add("warning");
        } else {
          element.classList.remove("warning");
        }
      }
    }
    if (data.state !== void 0) {
      if (templateData.actionBarContainer || data.showModifiedState) {
        const diffMeta = data?.options?.diffMeta;
        if (diffMeta) {
          if (!templateData.fileDiffsContainer || !templateData.addedSpan || !templateData.removedSpan) {
            return;
          }
          templateData.addedSpan.textContent = `+${diffMeta.added}`;
          templateData.removedSpan.textContent = `-${diffMeta.removed}`;
          templateData.fileDiffsContainer.setAttribute("aria-label", localize("chatEditingSession.fileCounts", "{0} lines added, {1} lines removed", diffMeta.added, diffMeta.removed));
        }
        templateData.label.element.querySelector(".monaco-icon-name-container")?.classList.add("modified");
      }
      if (templateData.toolbar) {
        templateData.toolbar.context = arg;
      }
      if (templateData.contextKeyService) {
        if (data.state !== void 0) {
          chatEditingWidgetFileStateContextKey.bindTo(templateData.contextKeyService).set(data.state);
        }
      }
    }
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
CollapsibleListRenderer.TEMPLATE_ID = "chatCollapsibleListRenderer";
CollapsibleListRenderer = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, IProductService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IContextKeyService)
], CollapsibleListRenderer);
function getResourceLabelForGithubUri(uri) {
  const repoPath = uri.path.split("/").slice(1, 3).join("/");
  const filePath = uri.path.split("/").slice(5);
  const fileName = filePath.at(-1);
  const range = getLineRangeFromGithubUri(uri);
  return {
    resource: uri,
    name: fileName ?? filePath.join("/"),
    description: [repoPath, ...filePath.slice(0, -1)].join("/"),
    range
  };
}
function getLineRangeFromGithubUri(uri) {
  if (!uri.fragment) {
    return void 0;
  }
  const match = uri.fragment.match(/\bL(\d+)(?:-L(\d+))?/);
  if (!match) {
    return void 0;
  }
  const startLine = parseInt(match[1]);
  if (isNaN(startLine)) {
    return void 0;
  }
  const endLine = match[2] ? parseInt(match[2]) : startLine;
  if (isNaN(endLine)) {
    return void 0;
  }
  return {
    startLineNumber: startLine,
    startColumn: 1,
    endLineNumber: endLine,
    endColumn: 1
  };
}
function getResourceForElement(element) {
  if (element.kind === "warning") {
    return null;
  }
  const { reference } = element;
  if (typeof reference === "string" || "variableName" in reference) {
    return null;
  } else if (URI.isUri(reference)) {
    return reference;
  } else {
    return reference.uri;
  }
}
registerAction2((_a = class extends Action2 {
  constructor() {
    super({
      id: _a.id,
      title: {
        ...localize2("addToChat", "Add File to Chat")
      },
      f1: false,
      menu: [{
        id: MenuId.ChatAttachmentsContext,
        group: "chat",
        order: 1,
        when: ContextKeyExpr.and(ResourceContextKey.IsFileSystemResource, ExplorerFolderContext.negate())
      }]
    });
  }
  async run(accessor, resource) {
    const chatWidgetService = accessor.get(IChatWidgetService);
    if (!resource) {
      return;
    }
    const widget = chatWidgetService.lastFocusedWidget;
    if (widget) {
      widget.attachmentModel.addFile(resource);
    }
  }
}, _a.id = "workbench.action.chat.addToChatAction", _a));
registerAction2((_b = class extends Action2 {
  constructor() {
    super({
      id: _b.id,
      title: {
        ...localize2("copyLink", "Copy Link")
      },
      f1: false,
      menu: [{
        id: MenuId.ChatAttachmentsContext,
        group: "chat",
        order: 0,
        when: ContextKeyExpr.or(ResourceContextKey.Scheme.isEqualTo(Schemas.http), ResourceContextKey.Scheme.isEqualTo(Schemas.https))
      }]
    });
  }
  async run(accessor, resource) {
    await accessor.get(IClipboardService).writeResources([resource]);
  }
}, _b.id = "workbench.action.chat.copyLink", _b));
export {
  ChatCollapsibleListContentPart,
  ChatUsedReferencesListContentPart,
  CollapsibleListPool
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdFJlZmVyZW5jZXNDb250ZW50UGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElMaXN0UmVuZGVyZXIsIElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBJTGlzdE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbWF0Y2hlc1NvbWVTY2hlbWUsIFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZU9yQXV0aG9yaXR5LCBpc0VxdWFsQXV0aG9yaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgZ2V0RmxhdENvbnRleHRNZW51QWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBNZW51V29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIElNZW51U2VydmljZSwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IEZpbGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaExpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc0RhcmsgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZmlsbEVkaXRvcnNEcmFnRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IElSZXNvdXJjZUxhYmVsLCBJUmVzb3VyY2VMYWJlbFByb3BzLCBSZXNvdXJjZUxhYmVscyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvbGFiZWxzLmpzJztcbmltcG9ydCB7IFJlc291cmNlQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBTRVRUSU5HU19BVVRIT1JJVFkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRmlsZUljb25UaGVtYWJsZVRyZWVDb250YWluZXJTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uL2ZpbGVzL2Jyb3dzZXIvdmlld3MvZXhwbG9yZXJWaWV3LmpzJztcbmltcG9ydCB7IEV4cGxvcmVyRm9sZGVyQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBjaGF0RWRpdGluZ1dpZGdldEZpbGVTdGF0ZUNvbnRleHRLZXksIE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFJlc3BvbnNlUmVmZXJlbmNlUGFydFN0YXR1c0tpbmQsIElDaGF0Q29udGVudFJlZmVyZW5jZSwgSUNoYXRXYXJuaW5nTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlbmRlcmVyQ29udGVudCwgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IENoYXRUcmVlSXRlbSwgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBDaGF0Q29sbGFwc2libGVDb250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGVSZWZlcmVuY2UsIFJlc291cmNlUG9vbCB9IGZyb20gJy4vY2hhdENvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRSZWZlcmVuY2VMaXN0SXRlbSBleHRlbmRzIElDaGF0Q29udGVudFJlZmVyZW5jZSB7XG5cdHRpdGxlPzogc3RyaW5nO1xuXHRkZXNjcmlwdGlvbj86IHN0cmluZztcblx0c3RhdGU/OiBNb2RpZmllZEZpbGVFbnRyeVN0YXRlO1xuXHRleGNsdWRlZD86IGJvb2xlYW47XG5cdHNob3dNb2RpZmllZFN0YXRlPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IHR5cGUgSUNoYXRDb2xsYXBzaWJsZUxpc3RJdGVtID0gSUNoYXRSZWZlcmVuY2VMaXN0SXRlbSB8IElDaGF0V2FybmluZ01lc3NhZ2U7XG5cbmV4cG9ydCBjbGFzcyBDaGF0Q29sbGFwc2libGVMaXN0Q29udGVudFBhcnQgZXh0ZW5kcyBDaGF0Q29sbGFwc2libGVDb250ZW50UGFydCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkYXRhOiBSZWFkb25seUFycmF5PElDaGF0Q29sbGFwc2libGVMaXN0SXRlbT4sXG5cdFx0bGFiZWxPdmVycmlkZTogSU1hcmtkb3duU3RyaW5nIHwgc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGVudFJlZmVyZW5jZXNMaXN0UG9vbDogQ29sbGFwc2libGVMaXN0UG9vbCxcblx0XHRob3Zlck1lc3NhZ2U6IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihsYWJlbE92ZXJyaWRlID8/IChkYXRhLmxlbmd0aCA+IDEgP1xuXHRcdFx0bG9jYWxpemUoJ3VzZWRSZWZlcmVuY2VzUGx1cmFsJywgXCJVc2VkIHswfSByZWZlcmVuY2VzXCIsIGRhdGEubGVuZ3RoKSA6XG5cdFx0XHRsb2NhbGl6ZSgndXNlZFJlZmVyZW5jZXNTaW5ndWxhcicsIFwiVXNlZCB7MH0gcmVmZXJlbmNlXCIsIDEpKSwgY29udGV4dCwgaG92ZXJNZXNzYWdlLFxuXHRcdFx0aG92ZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5pY29uID0gQ29kaWNvbi5jaGVjaztcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBpbml0Q29udGVudCgpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgcmVmID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZW50UmVmZXJlbmNlc0xpc3RQb29sLmdldCgpKTtcblx0XHRjb25zdCBsaXN0ID0gcmVmLm9iamVjdDtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGxpc3Qub25EaWRPcGVuKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5lbGVtZW50ICYmICdyZWZlcmVuY2UnIGluIGUuZWxlbWVudCAmJiB0eXBlb2YgZS5lbGVtZW50LnJlZmVyZW5jZSA9PT0gJ29iamVjdCcpIHtcblx0XHRcdFx0Y29uc3QgdXJpT3JMb2NhdGlvbiA9ICd2YXJpYWJsZU5hbWUnIGluIGUuZWxlbWVudC5yZWZlcmVuY2UgPyBlLmVsZW1lbnQucmVmZXJlbmNlLnZhbHVlIDogZS5lbGVtZW50LnJlZmVyZW5jZTtcblx0XHRcdFx0Y29uc3QgdXJpID0gVVJJLmlzVXJpKHVyaU9yTG9jYXRpb24pID8gdXJpT3JMb2NhdGlvbiA6XG5cdFx0XHRcdFx0dXJpT3JMb2NhdGlvbj8udXJpO1xuXHRcdFx0XHRpZiAodXJpKSB7XG5cdFx0XHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oXG5cdFx0XHRcdFx0XHR1cmksXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGZyb21Vc2VyR2VzdHVyZTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0ZWRpdG9yT3B0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRcdC4uLmUuZWRpdG9yT3B0aW9ucyxcblx0XHRcdFx0XHRcdFx0XHQuLi57XG5cdFx0XHRcdFx0XHRcdFx0XHRzZWxlY3Rpb246IHVyaU9yTG9jYXRpb24gJiYgJ3JhbmdlJyBpbiB1cmlPckxvY2F0aW9uID8gdXJpT3JMb2NhdGlvbi5yYW5nZSA6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihsaXN0Lm9uQ29udGV4dE1lbnUoZSA9PiB7XG5cdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLmJyb3dzZXJFdmVudCwgdHJ1ZSk7XG5cblx0XHRcdGNvbnN0IHVyaSA9IGUuZWxlbWVudCAmJiBnZXRSZXNvdXJjZUZvckVsZW1lbnQoZS5lbGVtZW50KTtcblx0XHRcdGlmICghdXJpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBlLmFuY2hvcixcblx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IG1lbnUgPSB0aGlzLm1lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKE1lbnVJZC5DaGF0QXR0YWNobWVudHNDb250ZXh0LCBsaXN0LmNvbnRleHRLZXlTZXJ2aWNlLCB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlLCBhcmc6IHVyaSB9KTtcblx0XHRcdFx0XHRyZXR1cm4gZ2V0RmxhdENvbnRleHRNZW51QWN0aW9ucyhtZW51KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2VDb250ZXh0S2V5ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZUNvbnRleHRLZXkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihsaXN0Lm9uRGlkQ2hhbmdlRm9jdXMoZSA9PiB7XG5cdFx0XHRyZXNvdXJjZUNvbnRleHRLZXkucmVzZXQoKTtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSBlLmVsZW1lbnRzLmxlbmd0aCA/IGUuZWxlbWVudHNbMF0gOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCB1cmkgPSBlbGVtZW50ICYmIGdldFJlc291cmNlRm9yRWxlbWVudChlbGVtZW50KTtcblx0XHRcdHJlc291cmNlQ29udGV4dEtleS5zZXQodXJpID8/IG51bGwpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG1heEl0ZW1zU2hvd24gPSA2O1xuXHRcdGNvbnN0IGl0ZW1zU2hvd24gPSBNYXRoLm1pbih0aGlzLmRhdGEubGVuZ3RoLCBtYXhJdGVtc1Nob3duKTtcblx0XHRjb25zdCBoZWlnaHQgPSBpdGVtc1Nob3duICogMjI7XG5cdFx0bGlzdC5sYXlvdXQoaGVpZ2h0KTtcblx0XHRsaXN0LmdldEhUTUxFbGVtZW50KCkuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblx0XHRsaXN0LnNwbGljZSgwLCBsaXN0Lmxlbmd0aCwgdGhpcy5kYXRhKTtcblxuXHRcdHJldHVybiBsaXN0LmdldEhUTUxFbGVtZW50KCkucGFyZW50RWxlbWVudCE7XG5cdH1cblxuXHRoYXNTYW1lQ29udGVudChvdGhlcjogSUNoYXRSZW5kZXJlckNvbnRlbnQsIGZvbGxvd2luZ0NvbnRlbnQ6IElDaGF0UmVuZGVyZXJDb250ZW50W10sIGVsZW1lbnQ6IENoYXRUcmVlSXRlbSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBvdGhlci5raW5kID09PSAncmVmZXJlbmNlcycgJiYgb3RoZXIucmVmZXJlbmNlcy5sZW5ndGggPT09IHRoaXMuZGF0YS5sZW5ndGggJiYgKCEhZm9sbG93aW5nQ29udGVudC5sZW5ndGggPT09IHRoaXMuaGFzRm9sbG93aW5nQ29udGVudCk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFVzZWRSZWZlcmVuY2VzTGlzdE9wdGlvbnMge1xuXHRleHBhbmRlZFdoZW5FbXB0eVJlc3BvbnNlPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRVc2VkUmVmZXJlbmNlc0xpc3RDb250ZW50UGFydCBleHRlbmRzIENoYXRDb2xsYXBzaWJsZUxpc3RDb250ZW50UGFydCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdGRhdGE6IFJlYWRvbmx5QXJyYXk8SUNoYXRDb2xsYXBzaWJsZUxpc3RJdGVtPixcblx0XHRsYWJlbE92ZXJyaWRlOiBJTWFya2Rvd25TdHJpbmcgfCBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0Y29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsXG5cdFx0Y29udGVudFJlZmVyZW5jZXNMaXN0UG9vbDogQ29sbGFwc2libGVMaXN0UG9vbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM6IElDaGF0VXNlZFJlZmVyZW5jZXNMaXN0T3B0aW9ucyxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoZGF0YSwgbGFiZWxPdmVycmlkZSwgY29udGV4dCwgY29udGVudFJlZmVyZW5jZXNMaXN0UG9vbCwgdW5kZWZpbmVkLCBvcGVuZXJTZXJ2aWNlLCBtZW51U2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgaG92ZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0aWYgKGRhdGEubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRkb20uaGlkZSh0aGlzLmRvbU5vZGUpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBpc0V4cGFuZGVkKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLmVsZW1lbnQgYXMgSUNoYXRSZXNwb25zZVZpZXdNb2RlbDtcblx0XHRyZXR1cm4gZWxlbWVudC51c2VkUmVmZXJlbmNlc0V4cGFuZGVkID8/ICEhKFxuXHRcdFx0dGhpcy5vcHRpb25zLmV4cGFuZGVkV2hlbkVtcHR5UmVzcG9uc2UgJiYgZWxlbWVudC5yZXNwb25zZS52YWx1ZS5sZW5ndGggPT09IDBcblx0XHQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHNldEV4cGFuZGVkKHZhbHVlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IHRoaXMuZWxlbWVudCBhcyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsO1xuXHRcdGVsZW1lbnQudXNlZFJlZmVyZW5jZXNFeHBhbmRlZCA9ICF0aGlzLmlzRXhwYW5kZWQoKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUNvbGxhcHNpYmxlTGlzdFdyYXBwZXIgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdGxpc3Q6IFdvcmtiZW5jaExpc3Q8SUNoYXRDb2xsYXBzaWJsZUxpc3RJdGVtPjtcbn1cblxuZXhwb3J0IGNsYXNzIENvbGxhcHNpYmxlTGlzdFBvb2wgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfcG9vbDogUmVzb3VyY2VQb29sPElDb2xsYXBzaWJsZUxpc3RXcmFwcGVyPjtcblxuXHRwdWJsaWMgZ2V0IGluVXNlKCk6IFJlYWRvbmx5U2V0PElDb2xsYXBzaWJsZUxpc3RXcmFwcGVyPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Bvb2wuaW5Vc2U7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIF9vbkRpZENoYW5nZVZpc2liaWxpdHk6IEV2ZW50PGJvb2xlYW4+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbWVudUlkOiBNZW51SWQgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsaXN0T3B0aW9uczogSUxpc3RPcHRpb25zPElDaGF0Q29sbGFwc2libGVMaXN0SXRlbT4gfCB1bmRlZmluZWQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcG9vbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSZXNvdXJjZVBvb2woKCkgPT4gdGhpcy5saXN0RmFjdG9yeSgpKSk7XG5cdH1cblxuXHRwcml2YXRlIGxpc3RGYWN0b3J5KCk6IElDb2xsYXBzaWJsZUxpc3RXcmFwcGVyIHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCByZXNvdXJjZUxhYmVscyA9IHN0b3JlLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlTGFiZWxzLCB7IG9uRGlkQ2hhbmdlVmlzaWJpbGl0eTogdGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5IH0pKTtcblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9ICQoJy5jaGF0LXVzZWQtY29udGV4dC1saXN0Jyk7XG5cdFx0c3RvcmUuYWRkKGNyZWF0ZUZpbGVJY29uVGhlbWFibGVUcmVlQ29udGFpbmVyU2NvcGUoY29udGFpbmVyLCB0aGlzLnRoZW1lU2VydmljZSkpO1xuXG5cdFx0Y29uc3QgbGlzdCA9IHN0b3JlLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0V29ya2JlbmNoTGlzdDxJQ2hhdENvbGxhcHNpYmxlTGlzdEl0ZW0+LFxuXHRcdFx0J0NoYXRMaXN0UmVuZGVyZXInLFxuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0bmV3IENvbGxhcHNpYmxlTGlzdERlbGVnYXRlKCksXG5cdFx0XHRbdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb2xsYXBzaWJsZUxpc3RSZW5kZXJlciwgcmVzb3VyY2VMYWJlbHMsIHRoaXMubWVudUlkKV0sXG5cdFx0XHR7XG5cdFx0XHRcdC4uLnRoaXMubGlzdE9wdGlvbnMsXG5cdFx0XHRcdGFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsOiBmYWxzZSxcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0QXJpYUxhYmVsOiAoZWxlbWVudDogSUNoYXRDb2xsYXBzaWJsZUxpc3RJdGVtKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoZWxlbWVudC5raW5kID09PSAnd2FybmluZycpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQuY29udGVudC52YWx1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IHJlZmVyZW5jZSA9IGVsZW1lbnQucmVmZXJlbmNlO1xuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZiByZWZlcmVuY2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiByZWZlcmVuY2U7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKCd2YXJpYWJsZU5hbWUnIGluIHJlZmVyZW5jZSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gcmVmZXJlbmNlLnZhcmlhYmxlTmFtZTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoVVJJLmlzVXJpKHJlZmVyZW5jZSkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGJhc2VuYW1lKHJlZmVyZW5jZS5wYXRoKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBiYXNlbmFtZShyZWZlcmVuY2UudXJpLnBhdGgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cblx0XHRcdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWw6ICgpID0+IGxvY2FsaXplKCdjaGF0Q29sbGFwc2libGVMaXN0JywgXCJDb2xsYXBzaWJsZSBDaGF0IFJlZmVyZW5jZXMgTGlzdFwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRkbmQ6IHtcblx0XHRcdFx0XHRnZXREcmFnVVJJOiAoZWxlbWVudDogSUNoYXRDb2xsYXBzaWJsZUxpc3RJdGVtKSA9PiBnZXRSZXNvdXJjZUZvckVsZW1lbnQoZWxlbWVudCk/LnRvU3RyaW5nKCkgPz8gbnVsbCxcblx0XHRcdFx0XHRnZXREcmFnTGFiZWw6IChlbGVtZW50cywgb3JpZ2luYWxFdmVudCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgdXJpczogVVJJW10gPSBjb2FsZXNjZShlbGVtZW50cy5tYXAoZ2V0UmVzb3VyY2VGb3JFbGVtZW50KSk7XG5cdFx0XHRcdFx0XHRpZiAoIXVyaXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHVyaXMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbCh1cmlzWzBdLCB7IHJlbGF0aXZlOiB0cnVlIH0pO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGAke3VyaXMubGVuZ3RofWA7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0XHRcdFx0b25EcmFnT3ZlcjogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdFx0ZHJvcDogKCkgPT4geyB9LFxuXHRcdFx0XHRcdG9uRHJhZ1N0YXJ0OiAoZGF0YSwgb3JpZ2luYWxFdmVudCkgPT4ge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZWxlbWVudHMgPSBkYXRhLmdldERhdGEoKSBhcyBJQ2hhdENvbGxhcHNpYmxlTGlzdEl0ZW1bXTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgdXJpczogVVJJW10gPSBjb2FsZXNjZShlbGVtZW50cy5tYXAoZ2V0UmVzb3VyY2VGb3JFbGVtZW50KSk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gZmlsbEVkaXRvcnNEcmFnRGF0YShhY2Nlc3NvciwgdXJpcywgb3JpZ2luYWxFdmVudCkpO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0XHRcdC8vIG5vb3Bcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGxpc3QsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiBzdG9yZS5kaXNwb3NlKClcblx0XHR9O1xuXHR9XG5cblx0Z2V0KCk6IElEaXNwb3NhYmxlUmVmZXJlbmNlPFdvcmtiZW5jaExpc3Q8SUNoYXRDb2xsYXBzaWJsZUxpc3RJdGVtPj4ge1xuXHRcdGNvbnN0IHdyYXBwZXIgPSB0aGlzLl9wb29sLmdldCgpO1xuXHRcdGxldCBzdGFsZSA9IGZhbHNlO1xuXHRcdHJldHVybiB7XG5cdFx0XHRvYmplY3Q6IHdyYXBwZXIubGlzdCxcblx0XHRcdGlzU3RhbGU6ICgpID0+IHN0YWxlLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRzdGFsZSA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX3Bvb2wucmVsZWFzZSh3cmFwcGVyKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fcG9vbC5jbGVhcigpO1xuXHR9XG59XG5cbmNsYXNzIENvbGxhcHNpYmxlTGlzdERlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8SUNoYXRDb2xsYXBzaWJsZUxpc3RJdGVtPiB7XG5cdGdldEhlaWdodChlbGVtZW50OiBJQ2hhdENvbGxhcHNpYmxlTGlzdEl0ZW0pOiBudW1iZXIge1xuXHRcdHJldHVybiAyMjtcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoZWxlbWVudDogSUNoYXRDb2xsYXBzaWJsZUxpc3RJdGVtKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gQ29sbGFwc2libGVMaXN0UmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElDb2xsYXBzaWJsZUxpc3RUZW1wbGF0ZSB7XG5cdHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlPzogSUNvbnRleHRLZXlTZXJ2aWNlO1xuXHRyZWFkb25seSBsYWJlbDogSVJlc291cmNlTGFiZWw7XG5cdHJlYWRvbmx5IHRlbXBsYXRlRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0dG9vbGJhcjogTWVudVdvcmtiZW5jaFRvb2xCYXIgfCB1bmRlZmluZWQ7XG5cdGFjdGlvbkJhckNvbnRhaW5lcj86IEhUTUxFbGVtZW50O1xuXHRmaWxlRGlmZnNDb250YWluZXI/OiBIVE1MRWxlbWVudDtcblx0YWRkZWRTcGFuPzogSFRNTEVsZW1lbnQ7XG5cdHJlbW92ZWRTcGFuPzogSFRNTEVsZW1lbnQ7XG59XG5cbmNsYXNzIENvbGxhcHNpYmxlTGlzdFJlbmRlcmVyIGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxJQ2hhdENvbGxhcHNpYmxlTGlzdEl0ZW0sIElDb2xsYXBzaWJsZUxpc3RUZW1wbGF0ZT4ge1xuXHRzdGF0aWMgVEVNUExBVEVfSUQgPSAnY2hhdENvbGxhcHNpYmxlTGlzdFJlbmRlcmVyJztcblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogc3RyaW5nID0gQ29sbGFwc2libGVMaXN0UmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBsYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdHByaXZhdGUgbWVudUlkOiBNZW51SWQgfCB1bmRlZmluZWQsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElDb2xsYXBzaWJsZUxpc3RUZW1wbGF0ZSB7XG5cdFx0Y29uc3QgdGVtcGxhdGVEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBsYWJlbCA9IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHRoaXMubGFiZWxzLmNyZWF0ZShjb250YWluZXIsIHsgc3VwcG9ydEhpZ2hsaWdodHM6IHRydWUsIHN1cHBvcnRJY29uczogdHJ1ZSB9KSk7XG5cblx0XHRjb25zdCBmaWxlRGlmZnNDb250YWluZXIgPSAkKCcud29ya2luZy1zZXQtbGluZS1jb3VudHMnKTtcblx0XHRjb25zdCBhZGRlZFNwYW4gPSBkb20uJCgnLndvcmtpbmctc2V0LWxpbmVzLWFkZGVkJyk7XG5cdFx0Y29uc3QgcmVtb3ZlZFNwYW4gPSBkb20uJCgnLndvcmtpbmctc2V0LWxpbmVzLXJlbW92ZWQnKTtcblx0XHRmaWxlRGlmZnNDb250YWluZXIuYXBwZW5kQ2hpbGQoYWRkZWRTcGFuKTtcblx0XHRmaWxlRGlmZnNDb250YWluZXIuYXBwZW5kQ2hpbGQocmVtb3ZlZFNwYW4pO1xuXHRcdGxhYmVsLmVsZW1lbnQuYXBwZW5kQ2hpbGQoZmlsZURpZmZzQ29udGFpbmVyKTtcblxuXHRcdGxldCB0b29sYmFyO1xuXHRcdGxldCBhY3Rpb25CYXJDb250YWluZXI7XG5cdFx0bGV0IGNvbnRleHRLZXlTZXJ2aWNlO1xuXHRcdGlmICh0aGlzLm1lbnVJZCkge1xuXHRcdFx0YWN0aW9uQmFyQ29udGFpbmVyID0gJCgnLmNoYXQtY29sbGFwc2libGUtbGlzdC1hY3Rpb24tYmFyJyk7XG5cdFx0XHRjb250ZXh0S2V5U2VydmljZSA9IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKGFjdGlvbkJhckNvbnRhaW5lcikpO1xuXHRcdFx0Y29uc3Qgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZV0pKSk7XG5cdFx0XHR0b29sYmFyID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIGFjdGlvbkJhckNvbnRhaW5lciwgdGhpcy5tZW51SWQsIHsgbWVudU9wdGlvbnM6IHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUsIGFyZzogdW5kZWZpbmVkIH0gfSkpO1xuXHRcdFx0bGFiZWwuZWxlbWVudC5hcHBlbmRDaGlsZChhY3Rpb25CYXJDb250YWluZXIpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IHRlbXBsYXRlRGlzcG9zYWJsZXMsIGxhYmVsLCB0b29sYmFyLCBhY3Rpb25CYXJDb250YWluZXIsIGNvbnRleHRLZXlTZXJ2aWNlLCBmaWxlRGlmZnNDb250YWluZXIsIGFkZGVkU3BhbiwgcmVtb3ZlZFNwYW4gfTtcblx0fVxuXG5cblx0cHJpdmF0ZSBnZXRSZWZlcmVuY2VJY29uKGRhdGE6IElDaGF0Q29udGVudFJlZmVyZW5jZSk6IFVSSSB8IFRoZW1lSWNvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKFRoZW1lSWNvbi5pc1RoZW1lSWNvbihkYXRhLmljb25QYXRoKSkge1xuXHRcdFx0cmV0dXJuIGRhdGEuaWNvblBhdGg7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBpc0RhcmsodGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLnR5cGUpICYmIGRhdGEuaWNvblBhdGg/LmRhcmtcblx0XHRcdFx0PyBkYXRhLmljb25QYXRoPy5kYXJrXG5cdFx0XHRcdDogZGF0YS5pY29uUGF0aD8ubGlnaHQ7XG5cdFx0fVxuXHR9XG5cblx0cmVuZGVyRWxlbWVudChkYXRhOiBJQ2hhdENvbGxhcHNpYmxlTGlzdEl0ZW0sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUNvbGxhcHNpYmxlTGlzdFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0aWYgKGRhdGEua2luZCA9PT0gJ3dhcm5pbmcnKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuc2V0UmVzb3VyY2UoeyBuYW1lOiBkYXRhLmNvbnRlbnQudmFsdWUgfSwgeyBpY29uOiBDb2RpY29uLndhcm5pbmcgfSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVmZXJlbmNlID0gZGF0YS5yZWZlcmVuY2U7XG5cdFx0Y29uc3QgaWNvbiA9IHRoaXMuZ2V0UmVmZXJlbmNlSWNvbihkYXRhKTtcblx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRcdGxldCBhcmc6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRpZiAodHlwZW9mIHJlZmVyZW5jZSA9PT0gJ29iamVjdCcgJiYgJ3ZhcmlhYmxlTmFtZScgaW4gcmVmZXJlbmNlKSB7XG5cdFx0XHRpZiAocmVmZXJlbmNlLnZhbHVlKSB7XG5cdFx0XHRcdGNvbnN0IHVyaSA9IFVSSS5pc1VyaShyZWZlcmVuY2UudmFsdWUpID8gcmVmZXJlbmNlLnZhbHVlIDogcmVmZXJlbmNlLnZhbHVlLnVyaTtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldFJlc291cmNlKFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHJlc291cmNlOiB1cmksXG5cdFx0XHRcdFx0XHRuYW1lOiBiYXNlbmFtZU9yQXV0aG9yaXR5KHVyaSksXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogYCMke3JlZmVyZW5jZS52YXJpYWJsZU5hbWV9YCxcblx0XHRcdFx0XHRcdHJhbmdlOiAncmFuZ2UnIGluIHJlZmVyZW5jZS52YWx1ZSA/IHJlZmVyZW5jZS52YWx1ZS5yYW5nZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR9LCB7IGljb24sIHRpdGxlOiBkYXRhLm9wdGlvbnM/LnN0YXR1cz8uZGVzY3JpcHRpb24gPz8gZGF0YS50aXRsZSB9KTtcblx0XHRcdH0gZWxzZSBpZiAocmVmZXJlbmNlLnZhcmlhYmxlTmFtZS5zdGFydHNXaXRoKCdrZXJuZWxWYXJpYWJsZScpKSB7XG5cdFx0XHRcdGNvbnN0IHZhcmlhYmxlID0gcmVmZXJlbmNlLnZhcmlhYmxlTmFtZS5zcGxpdCgnOicpWzFdO1xuXHRcdFx0XHRjb25zdCBhc1ZhcmlhYmxlTmFtZSA9IGAke3ZhcmlhYmxlfWA7XG5cdFx0XHRcdGNvbnN0IGxhYmVsID0gYEtlcm5lbCB2YXJpYWJsZWA7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5zZXRMYWJlbChsYWJlbCwgYXNWYXJpYWJsZU5hbWUsIHsgdGl0bGU6IGRhdGEub3B0aW9ucz8uc3RhdHVzPy5kZXNjcmlwdGlvbiB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5zZXRMYWJlbChyZWZlcmVuY2UudmFyaWFibGVOYW1lLCB1bmRlZmluZWQsIHsgdGl0bGU6IGRhdGEub3B0aW9ucz8uc3RhdHVzPy5kZXNjcmlwdGlvbiA/PyBkYXRhLnRpdGxlIH0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAodHlwZW9mIHJlZmVyZW5jZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5zZXRMYWJlbChyZWZlcmVuY2UsIHVuZGVmaW5lZCwgeyBpY29uUGF0aDogVVJJLmlzVXJpKGljb24pID8gaWNvbiA6IHVuZGVmaW5lZCwgdGl0bGU6IGRhdGEub3B0aW9ucz8uc3RhdHVzPy5kZXNjcmlwdGlvbiA/PyBkYXRhLnRpdGxlIH0pO1xuXG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHVyaSA9ICd1cmknIGluIHJlZmVyZW5jZSA/IHJlZmVyZW5jZS51cmkgOiByZWZlcmVuY2U7XG5cdFx0XHRhcmcgPSB1cmk7XG5cdFx0XHRjb25zdCBleHRyYUNsYXNzZXMgPSBkYXRhLmV4Y2x1ZGVkID8gWydleGNsdWRlZCddIDogW107XG5cdFx0XHRpZiAodXJpLnNjaGVtZSA9PT0gJ2h0dHBzJyAmJiBpc0VxdWFsQXV0aG9yaXR5KHVyaS5hdXRob3JpdHksICdnaXRodWIuY29tJykgJiYgdXJpLnBhdGguaW5jbHVkZXMoJy90cmVlLycpKSB7XG5cdFx0XHRcdC8vIFBhcnNlIGEgbmljZXIgbGFiZWwgZm9yIEdpdEh1YiBVUklzIHRoYXQgcG9pbnQgYXQgYSBwYXJ0aWN1bGFyIGNvbW1pdCArIGZpbGVcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldFJlc291cmNlKGdldFJlc291cmNlTGFiZWxGb3JHaXRodWJVcmkodXJpKSwgeyBpY29uOiBDb2RpY29uLmdpdGh1YiwgdGl0bGU6IGRhdGEudGl0bGUsIHN0cmlrZXRocm91Z2g6IGRhdGEuZXhjbHVkZWQsIGV4dHJhQ2xhc3NlcyB9KTtcblx0XHRcdH0gZWxzZSBpZiAodXJpLnNjaGVtZSA9PT0gdGhpcy5wcm9kdWN0U2VydmljZS51cmxQcm90b2NvbCAmJiBpc0VxdWFsQXV0aG9yaXR5KHVyaS5hdXRob3JpdHksIFNFVFRJTkdTX0FVVEhPUklUWSkpIHtcblx0XHRcdFx0Ly8gYSBuaWNlciBsYWJlbCBmb3Igc2V0dGluZ3MgVVJJc1xuXHRcdFx0XHRjb25zdCBzZXR0aW5nSWQgPSB1cmkucGF0aC5zdWJzdHJpbmcoMSk7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5zZXRSZXNvdXJjZSh7IHJlc291cmNlOiB1cmksIG5hbWU6IHNldHRpbmdJZCB9LCB7IGljb246IENvZGljb24uc2V0dGluZ3NHZWFyLCB0aXRsZTogbG9jYWxpemUoJ3NldHRpbmcuaG92ZXInLCBcIk9wZW4gc2V0dGluZyAnezB9J1wiLCBzZXR0aW5nSWQpLCBzdHJpa2V0aHJvdWdoOiBkYXRhLmV4Y2x1ZGVkLCBleHRyYUNsYXNzZXMgfSk7XG5cdFx0XHR9IGVsc2UgaWYgKG1hdGNoZXNTb21lU2NoZW1lKHVyaSwgU2NoZW1hcy5tYWlsdG8sIFNjaGVtYXMuaHR0cCwgU2NoZW1hcy5odHRwcykpIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldFJlc291cmNlKHsgcmVzb3VyY2U6IHVyaSwgbmFtZTogdXJpLnRvU3RyaW5nKHRydWUpIH0sIHsgaWNvbjogaWNvbiA/PyBDb2RpY29uLmdsb2JlLCB0aXRsZTogZGF0YS5vcHRpb25zPy5zdGF0dXM/LmRlc2NyaXB0aW9uID8/IGRhdGEudGl0bGUgPz8gdXJpLnRvU3RyaW5nKHRydWUpLCBzdHJpa2V0aHJvdWdoOiBkYXRhLmV4Y2x1ZGVkLCBleHRyYUNsYXNzZXMgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuc2V0RmlsZSh1cmksIHtcblx0XHRcdFx0XHRmaWxlS2luZDogRmlsZUtpbmQuRklMRSxcblx0XHRcdFx0XHQvLyBTaG91bGQgbm90IGhhdmUgdGhpcyBsaXZlLXVwZGF0aW5nIGRhdGEgb24gYSBoaXN0b3JpY2FsIHJlZmVyZW5jZVxuXHRcdFx0XHRcdGZpbGVEZWNvcmF0aW9uczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHJhbmdlOiAncmFuZ2UnIGluIHJlZmVyZW5jZSA/IHJlZmVyZW5jZS5yYW5nZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0aXRsZTogZGF0YS5vcHRpb25zPy5zdGF0dXM/LmRlc2NyaXB0aW9uID8/IGRhdGEudGl0bGUsXG5cdFx0XHRcdFx0c3RyaWtldGhyb3VnaDogZGF0YS5leGNsdWRlZCxcblx0XHRcdFx0XHRleHRyYUNsYXNzZXNcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBzZWxlY3RvciBvZiBbJy5tb25hY28taWNvbi1zdWZmaXgtY29udGFpbmVyJywgJy5tb25hY28taWNvbi1uYW1lLWNvbnRhaW5lciddKSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSB0ZW1wbGF0ZURhdGEubGFiZWwuZWxlbWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcblx0XHRcdGlmIChlbGVtZW50KSB7XG5cdFx0XHRcdGlmIChkYXRhLm9wdGlvbnM/LnN0YXR1cz8ua2luZCA9PT0gQ2hhdFJlc3BvbnNlUmVmZXJlbmNlUGFydFN0YXR1c0tpbmQuT21pdHRlZCB8fCBkYXRhLm9wdGlvbnM/LnN0YXR1cz8ua2luZCA9PT0gQ2hhdFJlc3BvbnNlUmVmZXJlbmNlUGFydFN0YXR1c0tpbmQuUGFydGlhbCkge1xuXHRcdFx0XHRcdGVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnd2FybmluZycpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnd2FybmluZycpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGRhdGEuc3RhdGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aWYgKHRlbXBsYXRlRGF0YS5hY3Rpb25CYXJDb250YWluZXIgfHwgZGF0YS5zaG93TW9kaWZpZWRTdGF0ZSkge1xuXHRcdFx0XHRjb25zdCBkaWZmTWV0YSA9IGRhdGE/Lm9wdGlvbnM/LmRpZmZNZXRhO1xuXHRcdFx0XHRpZiAoZGlmZk1ldGEpIHtcblx0XHRcdFx0XHRpZiAoIXRlbXBsYXRlRGF0YS5maWxlRGlmZnNDb250YWluZXIgfHwgIXRlbXBsYXRlRGF0YS5hZGRlZFNwYW4gfHwgIXRlbXBsYXRlRGF0YS5yZW1vdmVkU3Bhbikge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0ZW1wbGF0ZURhdGEuYWRkZWRTcGFuLnRleHRDb250ZW50ID0gYCske2RpZmZNZXRhLmFkZGVkfWA7XG5cdFx0XHRcdFx0dGVtcGxhdGVEYXRhLnJlbW92ZWRTcGFuLnRleHRDb250ZW50ID0gYC0ke2RpZmZNZXRhLnJlbW92ZWR9YDtcblx0XHRcdFx0XHR0ZW1wbGF0ZURhdGEuZmlsZURpZmZzQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdjaGF0RWRpdGluZ1Nlc3Npb24uZmlsZUNvdW50cycsICd7MH0gbGluZXMgYWRkZWQsIHsxfSBsaW5lcyByZW1vdmVkJywgZGlmZk1ldGEuYWRkZWQsIGRpZmZNZXRhLnJlbW92ZWQpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmxhYmVsLmVsZW1lbnQucXVlcnlTZWxlY3RvcignLm1vbmFjby1pY29uLW5hbWUtY29udGFpbmVyJyk/LmNsYXNzTGlzdC5hZGQoJ21vZGlmaWVkJyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGVtcGxhdGVEYXRhLnRvb2xiYXIpIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLnRvb2xiYXIuY29udGV4dCA9IGFyZztcblx0XHRcdH1cblx0XHRcdGlmICh0ZW1wbGF0ZURhdGEuY29udGV4dEtleVNlcnZpY2UpIHtcblx0XHRcdFx0aWYgKGRhdGEuc3RhdGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGNoYXRFZGl0aW5nV2lkZ2V0RmlsZVN0YXRlQ29udGV4dEtleS5iaW5kVG8odGVtcGxhdGVEYXRhLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoZGF0YS5zdGF0ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJQ29sbGFwc2libGVMaXN0VGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0UmVzb3VyY2VMYWJlbEZvckdpdGh1YlVyaSh1cmk6IFVSSSk6IElSZXNvdXJjZUxhYmVsUHJvcHMge1xuXHRjb25zdCByZXBvUGF0aCA9IHVyaS5wYXRoLnNwbGl0KCcvJykuc2xpY2UoMSwgMykuam9pbignLycpO1xuXHRjb25zdCBmaWxlUGF0aCA9IHVyaS5wYXRoLnNwbGl0KCcvJykuc2xpY2UoNSk7XG5cdGNvbnN0IGZpbGVOYW1lID0gZmlsZVBhdGguYXQoLTEpO1xuXHRjb25zdCByYW5nZSA9IGdldExpbmVSYW5nZUZyb21HaXRodWJVcmkodXJpKTtcblx0cmV0dXJuIHtcblx0XHRyZXNvdXJjZTogdXJpLFxuXHRcdG5hbWU6IGZpbGVOYW1lID8/IGZpbGVQYXRoLmpvaW4oJy8nKSxcblx0XHRkZXNjcmlwdGlvbjogW3JlcG9QYXRoLCAuLi5maWxlUGF0aC5zbGljZSgwLCAtMSldLmpvaW4oJy8nKSxcblx0XHRyYW5nZVxuXHR9O1xufVxuXG5mdW5jdGlvbiBnZXRMaW5lUmFuZ2VGcm9tR2l0aHViVXJpKHVyaTogVVJJKTogSVJhbmdlIHwgdW5kZWZpbmVkIHtcblx0aWYgKCF1cmkuZnJhZ21lbnQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Ly8gRXh0cmFjdCB0aGUgbGluZSByYW5nZSBmcm9tIHRoZSBmcmFnbWVudFxuXHQvLyBHaXRodWIgbGluZSByYW5nZXMgYXJlIDEtYmFzZWRcblx0Y29uc3QgbWF0Y2ggPSB1cmkuZnJhZ21lbnQubWF0Y2goL1xcYkwoXFxkKykoPzotTChcXGQrKSk/Lyk7XG5cdGlmICghbWF0Y2gpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3Qgc3RhcnRMaW5lID0gcGFyc2VJbnQobWF0Y2hbMV0pO1xuXHRpZiAoaXNOYU4oc3RhcnRMaW5lKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCBlbmRMaW5lID0gbWF0Y2hbMl0gPyBwYXJzZUludChtYXRjaFsyXSkgOiBzdGFydExpbmU7XG5cdGlmIChpc05hTihlbmRMaW5lKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdHN0YXJ0TGluZU51bWJlcjogc3RhcnRMaW5lLFxuXHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdGVuZExpbmVOdW1iZXI6IGVuZExpbmUsXG5cdFx0ZW5kQ29sdW1uOiAxXG5cdH07XG59XG5cbmZ1bmN0aW9uIGdldFJlc291cmNlRm9yRWxlbWVudChlbGVtZW50OiBJQ2hhdENvbGxhcHNpYmxlTGlzdEl0ZW0pOiBVUkkgfCBudWxsIHtcblx0aWYgKGVsZW1lbnQua2luZCA9PT0gJ3dhcm5pbmcnKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblx0Y29uc3QgeyByZWZlcmVuY2UgfSA9IGVsZW1lbnQ7XG5cdGlmICh0eXBlb2YgcmVmZXJlbmNlID09PSAnc3RyaW5nJyB8fCAndmFyaWFibGVOYW1lJyBpbiByZWZlcmVuY2UpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fSBlbHNlIGlmIChVUkkuaXNVcmkocmVmZXJlbmNlKSkge1xuXHRcdHJldHVybiByZWZlcmVuY2U7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIHJlZmVyZW5jZS51cmk7XG5cdH1cbn1cblxuLy8jcmVnaW9uIFJlc291cmNlIGNvbnRleHQgbWVudVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQWRkVG9DaGF0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IGlkID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5hZGRUb0NoYXRBY3Rpb24nO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBBZGRUb0NoYXRBY3Rpb24uaWQsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5sb2NhbGl6ZTIoJ2FkZFRvQ2hhdCcsIFwiQWRkIEZpbGUgdG8gQ2hhdFwiKSxcblx0XHRcdH0sXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRBdHRhY2htZW50c0NvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnY2hhdCcsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoUmVzb3VyY2VDb250ZXh0S2V5LklzRmlsZVN5c3RlbVJlc291cmNlLCBFeHBsb3JlckZvbGRlckNvbnRleHQubmVnYXRlKCkpLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgcmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNoYXRXaWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdpZGdldCA9IGNoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdGlmICh3aWRnZXQpIHtcblx0XHRcdHdpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkRmlsZShyZXNvdXJjZSk7XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE9wZW5DaGF0UmVmZXJlbmNlTGlua0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBpZCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuY29weUxpbmsnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBPcGVuQ2hhdFJlZmVyZW5jZUxpbmtBY3Rpb24uaWQsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5sb2NhbGl6ZTIoJ2NvcHlMaW5rJywgXCJDb3B5IExpbmtcIiksXG5cdFx0XHR9LFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0QXR0YWNobWVudHNDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJ2NoYXQnLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoUmVzb3VyY2VDb250ZXh0S2V5LlNjaGVtZS5pc0VxdWFsVG8oU2NoZW1hcy5odHRwKSwgUmVzb3VyY2VDb250ZXh0S2V5LlNjaGVtZS5pc0VxdWFsVG8oU2NoZW1hcy5odHRwcykpLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgcmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSkud3JpdGVSZXNvdXJjZXMoW3Jlc291cmNlXSk7XG5cdH1cbn0pO1xuXG4vLyNlbmRyZWdpb25cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBQUE7QUFLQSxZQUFZLFNBQVM7QUFHckIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBR3hCLFNBQVMsWUFBWSx1QkFBb0M7QUFDekQsU0FBUyxtQkFBbUIsZUFBZTtBQUMzQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUFxQix3QkFBd0I7QUFDdEQsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBRXBCLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxTQUFTLGNBQWMsUUFBUSx1QkFBdUI7QUFDL0QsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQkFBZ0IsMEJBQTBCO0FBQ25ELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsY0FBYztBQUN2QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDJCQUEyQjtBQUNwQyxTQUE4QyxzQkFBc0I7QUFDcEUsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxnREFBZ0Q7QUFDekQsU0FBUyw2QkFBNkI7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QUFDaEMsV0FBTztBQUFBLEVBQ1IsT0FBTztBQUNOLFdBQU8sVUFBVTtBQUFBLEVBQ2xCO0FBQ0Q7QUFJQSxpQkFBZ0IsbUJBQThCLFFBQVE7QUFBQSxFQUlyRCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSSxHQUFnQjtBQUFBLE1BQ3BCLE9BQU87QUFBQSxRQUNOLEdBQUcsVUFBVSxhQUFhLGtCQUFrQjtBQUFBLE1BQzdDO0FBQUEsTUFDQSxJQUFJO0FBQUEsTUFDSixNQUFNLENBQUM7QUFBQSxRQUNOLElBQUksT0FBTztBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsTUFBTSxlQUFlLElBQUksbUJBQW1CLHNCQUFzQixzQkFBc0IsT0FBTyxDQUFDO0FBQUEsTUFDakcsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWUsSUFBSSxVQUE0QixVQUE4QjtBQUM1RSxVQUFNLG9CQUFvQixTQUFTLElBQUksa0JBQWtCO0FBQ3pELFFBQUksQ0FBQyxVQUFVO0FBQ2Q7QUFBQSxJQUNEO0FBRUEsVUFBTSxTQUFTLGtCQUFrQjtBQUNqQyxRQUFJLFFBQVE7QUFDWCxhQUFPLGdCQUFnQixRQUFRLFFBQVE7QUFBQSxJQUN4QztBQUFBLEVBQ0Q7QUFDRCxHQS9CZ0IsR0FFQyxLQUFLLHlDQUZOLEdBK0JmO0FBRUQsaUJBQWdCLG1CQUEwQyxRQUFRO0FBQUEsRUFJakUsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUksR0FBNEI7QUFBQSxNQUNoQyxPQUFPO0FBQUEsUUFDTixHQUFHLFVBQVUsWUFBWSxXQUFXO0FBQUEsTUFDckM7QUFBQSxNQUNBLElBQUk7QUFBQSxNQUNKLE1BQU0sQ0FBQztBQUFBLFFBQ04sSUFBSSxPQUFPO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxNQUFNLGVBQWUsR0FBRyxtQkFBbUIsT0FBTyxVQUFVLFFBQVEsSUFBSSxHQUFHLG1CQUFtQixPQUFPLFVBQVUsUUFBUSxLQUFLLENBQUM7QUFBQSxNQUM5SCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBZSxJQUFJLFVBQTRCLFVBQThCO0FBQzVFLFVBQU0sU0FBUyxJQUFJLGlCQUFpQixFQUFFLGVBQWUsQ0FBQyxRQUFRLENBQUM7QUFBQSxFQUNoRTtBQUNELEdBdkJnQixHQUVDLEtBQUssa0NBRk4sR0F1QmY7IiwKICAibmFtZXMiOiBbXQp9Cg==
