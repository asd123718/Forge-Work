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
import { TreeFindMode } from "../../../../base/browser/ui/tree/abstractTree.js";
import { TreeVisibility } from "../../../../base/browser/ui/tree/tree.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { createMatches } from "../../../../base/common/filters.js";
import { normalizeDriveLetter, tildify } from "../../../../base/common/labels.js";
import { dispose, DisposableMap, DisposableStore } from "../../../../base/common/lifecycle.js";
import { isAbsolute, normalize, posix } from "../../../../base/common/path.js";
import { isWindows } from "../../../../base/common/platform.js";
import { ltrim } from "../../../../base/common/strings.js";
import { URI } from "../../../../base/common/uri.js";
import * as nls from "../../../../nls.js";
import { MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { FileKind } from "../../../../platform/files/common/files.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { WorkbenchCompressibleObjectTree } from "../../../../platform/list/browser/listService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { ResourceLabels } from "../../../browser/labels.js";
import { ViewAction, ViewPane } from "../../../browser/parts/views/viewPane.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { CONTEXT_LOADED_SCRIPTS_ITEM_TYPE, IDebugService, LOADED_SCRIPTS_VIEW_ID } from "../common/debug.js";
import { DebugContentProvider } from "../common/debugContentProvider.js";
import { renderViewTree } from "./baseDebugView.js";
const NEW_STYLE_COMPRESS = true;
const URI_SCHEMA_PATTERN = /^[a-zA-Z][a-zA-Z0-9\+\-\.]+:/;
class BaseTreeItem {
  constructor(_parent, _label, isIncompressible = false) {
    this._parent = _parent;
    this._label = _label;
    this.isIncompressible = isIncompressible;
    this._children = /* @__PURE__ */ new Map();
    this._showedMoreThanOne = false;
  }
  updateLabel(label) {
    this._label = label;
  }
  isLeaf() {
    return this._children.size === 0;
  }
  getSession() {
    if (this._parent) {
      return this._parent.getSession();
    }
    return void 0;
  }
  setSource(session, source) {
    this._source = source;
    this._children.clear();
    if (source.raw && source.raw.sources) {
      for (const src of source.raw.sources) {
        if (src.name && src.path) {
          const s = new BaseTreeItem(this, src.name);
          this._children.set(src.path, s);
          const ss = session.getSource(src);
          s.setSource(session, ss);
        }
      }
    }
  }
  createIfNeeded(key, factory) {
    let child = this._children.get(key);
    if (!child) {
      child = factory(this, key);
      this._children.set(key, child);
    }
    return child;
  }
  getChild(key) {
    return this._children.get(key);
  }
  remove(key) {
    this._children.delete(key);
  }
  removeFromParent() {
    if (this._parent) {
      this._parent.remove(this._label);
      if (this._parent._children.size === 0) {
        this._parent.removeFromParent();
      }
    }
  }
  getTemplateId() {
    return "id";
  }
  // a dynamic ID based on the parent chain; required for reparenting (see #55448)
  getId() {
    const parent = this.getParent();
    return parent ? `${parent.getId()}/${this.getInternalId()}` : this.getInternalId();
  }
  getInternalId() {
    return this._label;
  }
  // skips intermediate single-child nodes
  getParent() {
    if (this._parent) {
      if (this._parent.isSkipped()) {
        return this._parent.getParent();
      }
      return this._parent;
    }
    return void 0;
  }
  isSkipped() {
    if (this._parent) {
      if (this._parent.oneChild()) {
        return true;
      }
      return false;
    }
    return true;
  }
  // skips intermediate single-child nodes
  hasChildren() {
    const child = this.oneChild();
    if (child) {
      return child.hasChildren();
    }
    return this._children.size > 0;
  }
  // skips intermediate single-child nodes
  getChildren() {
    const child = this.oneChild();
    if (child) {
      return child.getChildren();
    }
    const array = [];
    for (const child2 of this._children.values()) {
      array.push(child2);
    }
    return array.sort((a, b) => this.compare(a, b));
  }
  // skips intermediate single-child nodes
  getLabel(separateRootFolder = true) {
    const child = this.oneChild();
    if (child) {
      const sep = this instanceof RootFolderTreeItem && separateRootFolder ? " \u2022 " : posix.sep;
      return `${this._label}${sep}${child.getLabel()}`;
    }
    return this._label;
  }
  // skips intermediate single-child nodes
  getHoverLabel() {
    if (this._source && this._parent && this._parent._source) {
      return this._source.raw.path || this._source.raw.name;
    }
    const label = this.getLabel(false);
    const parent = this.getParent();
    if (parent) {
      const hover = parent.getHoverLabel();
      if (hover) {
        return `${hover}/${label}`;
      }
    }
    return label;
  }
  // skips intermediate single-child nodes
  getSource() {
    const child = this.oneChild();
    if (child) {
      return child.getSource();
    }
    return this._source;
  }
  compare(a, b) {
    if (a._label && b._label) {
      return a._label.localeCompare(b._label);
    }
    return 0;
  }
  oneChild() {
    if (!this._source && !this._showedMoreThanOne && this.skipOneChild()) {
      if (this._children.size === 1) {
        return this._children.values().next().value;
      }
      if (this._children.size > 1) {
        this._showedMoreThanOne = true;
      }
    }
    return void 0;
  }
  skipOneChild() {
    if (NEW_STYLE_COMPRESS) {
      return this instanceof RootTreeItem;
    } else {
      return !(this instanceof RootFolderTreeItem) && !(this instanceof SessionTreeItem);
    }
  }
}
class RootFolderTreeItem extends BaseTreeItem {
  constructor(parent, folder) {
    super(parent, folder.name, true);
    this.folder = folder;
  }
}
class RootTreeItem extends BaseTreeItem {
  constructor(_pathService, _contextService, _labelService) {
    super(void 0, "Root");
    this._pathService = _pathService;
    this._contextService = _contextService;
    this._labelService = _labelService;
  }
  add(session) {
    return this.createIfNeeded(session.getId(), () => new SessionTreeItem(this._labelService, this, session, this._pathService, this._contextService));
  }
  find(session) {
    return this.getChild(session.getId());
  }
}
const _SessionTreeItem = class _SessionTreeItem extends BaseTreeItem {
  constructor(labelService, parent, session, _pathService, rootProvider) {
    super(parent, session.getLabel(), true);
    this._pathService = _pathService;
    this.rootProvider = rootProvider;
    this._map = /* @__PURE__ */ new Map();
    this._labelService = labelService;
    this._session = session;
  }
  getInternalId() {
    return this._session.getId();
  }
  getSession() {
    return this._session;
  }
  getHoverLabel() {
    return void 0;
  }
  hasChildren() {
    return true;
  }
  compare(a, b) {
    const acat = this.category(a);
    const bcat = this.category(b);
    if (acat !== bcat) {
      return acat - bcat;
    }
    return super.compare(a, b);
  }
  category(item) {
    if (item instanceof RootFolderTreeItem) {
      return item.folder.index;
    }
    const l = item.getLabel();
    if (l && /^<.+>$/.test(l)) {
      return 1e3;
    }
    return 999;
  }
  async addPath(source) {
    let folder;
    let url;
    let path = source.raw.path;
    if (!path) {
      return;
    }
    if (this._labelService && URI_SCHEMA_PATTERN.test(path)) {
      path = this._labelService.getUriLabel(URI.parse(path));
    }
    const match = _SessionTreeItem.URL_REGEXP.exec(path);
    if (match && match.length === 3) {
      url = match[1];
      path = decodeURI(match[2]);
    } else {
      if (isAbsolute(path)) {
        const resource = URI.file(path);
        folder = this.rootProvider ? this.rootProvider.getWorkspaceFolder(resource) : null;
        if (folder) {
          path = normalize(ltrim(resource.path.substring(folder.uri.path.length), posix.sep));
          const hasMultipleRoots = this.rootProvider.getWorkspace().folders.length > 1;
          if (hasMultipleRoots) {
            path = posix.sep + path;
          } else {
            folder = null;
          }
        } else {
          path = normalize(path);
          if (isWindows) {
            path = normalizeDriveLetter(path);
          } else {
            path = tildify(path, (await this._pathService.userHome()).fsPath);
          }
        }
      }
    }
    let leaf = this;
    path.split(/[\/\\]/).forEach((segment, i) => {
      if (i === 0 && folder) {
        const f = folder;
        leaf = leaf.createIfNeeded(folder.name, (parent) => new RootFolderTreeItem(parent, f));
      } else if (i === 0 && url) {
        leaf = leaf.createIfNeeded(url, (parent) => new BaseTreeItem(parent, url));
      } else {
        leaf = leaf.createIfNeeded(segment, (parent) => new BaseTreeItem(parent, segment));
      }
    });
    leaf.setSource(this._session, source);
    if (source.raw.path) {
      this._map.set(source.raw.path, leaf);
    }
  }
  removePath(source) {
    if (source.raw.path) {
      const leaf = this._map.get(source.raw.path);
      if (leaf) {
        leaf.removeFromParent();
        return true;
      }
    }
    return false;
  }
};
_SessionTreeItem.URL_REGEXP = /^(https?:\/\/[^/]+)(\/.*)$/;
let SessionTreeItem = _SessionTreeItem;
function asTreeElement(item, viewState) {
  const children = item.getChildren();
  const collapsed = viewState ? !viewState.expanded.has(item.getId()) : !(item instanceof SessionTreeItem);
  return {
    element: item,
    collapsed,
    collapsible: item.hasChildren(),
    children: children.map((i) => asTreeElement(i, viewState))
  };
}
let LoadedScriptsView = class extends ViewPane {
  constructor(options, contextMenuService, keybindingService, instantiationService, viewDescriptorService, configurationService, editorService, contextKeyService, contextService, debugService, labelService, pathService, openerService, themeService, hoverService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.editorService = editorService;
    this.contextService = contextService;
    this.debugService = debugService;
    this.labelService = labelService;
    this.pathService = pathService;
    this.treeNeedsRefreshOnVisible = false;
    this.loadedScriptsItemType = CONTEXT_LOADED_SCRIPTS_ITEM_TYPE.bindTo(contextKeyService);
  }
  renderBody(container) {
    super.renderBody(container);
    this.element.classList.add("debug-pane");
    container.classList.add("debug-loaded-scripts", "show-file-icons");
    this.treeContainer = renderViewTree(container);
    this.filter = new LoadedScriptsFilter();
    const root = new RootTreeItem(this.pathService, this.contextService, this.labelService);
    this.treeLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility });
    this._register(this.treeLabels);
    const onFileIconThemeChange = (fileIconTheme) => {
      this.treeContainer.classList.toggle("align-icons-and-twisties", fileIconTheme.hasFileIcons && !fileIconTheme.hasFolderIcons);
      this.treeContainer.classList.toggle("hide-arrows", fileIconTheme.hidesExplorerArrows === true);
    };
    this._register(this.themeService.onDidFileIconThemeChange(onFileIconThemeChange));
    onFileIconThemeChange(this.themeService.getFileIconTheme());
    this.tree = this.instantiationService.createInstance(
      WorkbenchCompressibleObjectTree,
      "LoadedScriptsView",
      this.treeContainer,
      new LoadedScriptsDelegate(),
      [new LoadedScriptsRenderer(this.treeLabels)],
      {
        compressionEnabled: NEW_STYLE_COMPRESS,
        collapseByDefault: true,
        hideTwistiesOfChildlessElements: true,
        identityProvider: {
          getId: (element) => element.getId()
        },
        keyboardNavigationLabelProvider: {
          getKeyboardNavigationLabel: (element) => {
            return element.getLabel();
          },
          getCompressedNodeKeyboardNavigationLabel: (elements) => {
            return elements.map((e) => e.getLabel()).join("/");
          }
        },
        filter: this.filter,
        accessibilityProvider: new LoadedSciptsAccessibilityProvider(),
        overrideStyles: this.getLocationBasedColors().listOverrideStyles
      }
    );
    const updateView = (viewState2) => this.tree.setChildren(null, asTreeElement(root, viewState2).children);
    updateView();
    this.changeScheduler = new RunOnceScheduler(() => {
      this.treeNeedsRefreshOnVisible = false;
      if (this.tree) {
        updateView();
      }
    }, 300);
    this._register(this.changeScheduler);
    this._register(this.tree.onDidOpen((e) => {
      if (e.element instanceof BaseTreeItem) {
        const source = e.element.getSource();
        if (source && source.available) {
          const nullRange = { startLineNumber: 0, startColumn: 0, endLineNumber: 0, endColumn: 0 };
          source.openInEditor(this.editorService, nullRange, e.editorOptions.preserveFocus, e.sideBySide, e.editorOptions.pinned);
        }
      }
    }));
    this._register(this.tree.onDidChangeFocus(() => {
      const focus = this.tree.getFocus();
      if (focus instanceof SessionTreeItem) {
        this.loadedScriptsItemType.set("session");
      } else {
        this.loadedScriptsItemType.reset();
      }
    }));
    const scheduleRefreshOnVisible = () => {
      if (this.isBodyVisible()) {
        this.changeScheduler.schedule();
      } else {
        this.treeNeedsRefreshOnVisible = true;
      }
    };
    const addSourcePathsToSession = async (session) => {
      if (session.capabilities.supportsLoadedSourcesRequest) {
        const sessionNode = root.add(session);
        const paths = await session.getLoadedSources();
        for (const path of paths) {
          await sessionNode.addPath(path);
        }
        scheduleRefreshOnVisible();
      }
    };
    const sessionListeners = this._register(new DisposableMap());
    const registerSessionListeners = (session) => {
      const store = new DisposableStore();
      sessionListeners.set(session.getId(), store);
      store.add(session.onDidChangeName(async () => {
        const sessionRoot = root.find(session);
        if (sessionRoot) {
          sessionRoot.updateLabel(session.getLabel());
          scheduleRefreshOnVisible();
        }
      }));
      store.add(session.onDidLoadedSource(async (event) => {
        let sessionRoot;
        switch (event.reason) {
          case "new":
          case "changed":
            sessionRoot = root.add(session);
            await sessionRoot.addPath(event.source);
            scheduleRefreshOnVisible();
            if (event.reason === "changed") {
              DebugContentProvider.refreshDebugContent(event.source.uri);
            }
            break;
          case "removed":
            sessionRoot = root.find(session);
            if (sessionRoot && sessionRoot.removePath(event.source)) {
              scheduleRefreshOnVisible();
            }
            break;
          default:
            this.filter.setFilter(event.source.name);
            this.tree.refilter();
            break;
        }
      }));
    };
    this._register(this.debugService.onDidNewSession(registerSessionListeners));
    this.debugService.getModel().getSessions().forEach(registerSessionListeners);
    this._register(this.debugService.onDidEndSession(({ session }) => {
      sessionListeners.deleteAndDispose(session.getId());
      root.remove(session.getId());
      this.changeScheduler.schedule();
    }));
    this.changeScheduler.schedule(0);
    this._register(this.onDidChangeBodyVisibility((visible) => {
      if (visible && this.treeNeedsRefreshOnVisible) {
        this.changeScheduler.schedule();
      }
    }));
    let viewState;
    this._register(this.tree.onDidChangeFindPattern((pattern) => {
      if (this.tree.findMode === TreeFindMode.Highlight) {
        return;
      }
      if (!viewState && pattern) {
        const expanded = /* @__PURE__ */ new Set();
        const visit = (node) => {
          if (node.element && !node.collapsed) {
            expanded.add(node.element.getId());
          }
          for (const child of node.children) {
            visit(child);
          }
        };
        visit(this.tree.getNode());
        viewState = { expanded };
        this.tree.expandAll();
      } else if (!pattern && viewState) {
        this.tree.setFocus([]);
        updateView(viewState);
        viewState = void 0;
      }
    }));
    this.debugService.getModel().getSessions().forEach((session) => addSourcePathsToSession(session));
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.tree.layout(height, width);
  }
  collapseAll() {
    this.tree.collapseAll();
  }
  dispose() {
    dispose(this.tree);
    dispose(this.treeLabels);
    super.dispose();
  }
};
LoadedScriptsView = __decorateClass([
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IViewDescriptorService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IEditorService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IWorkspaceContextService),
  __decorateParam(9, IDebugService),
  __decorateParam(10, ILabelService),
  __decorateParam(11, IPathService),
  __decorateParam(12, IOpenerService),
  __decorateParam(13, IThemeService),
  __decorateParam(14, IHoverService)
], LoadedScriptsView);
class LoadedScriptsDelegate {
  getHeight(element) {
    return 22;
  }
  getTemplateId(element) {
    return LoadedScriptsRenderer.ID;
  }
}
const _LoadedScriptsRenderer = class _LoadedScriptsRenderer {
  constructor(labels) {
    this.labels = labels;
  }
  get templateId() {
    return _LoadedScriptsRenderer.ID;
  }
  renderTemplate(container) {
    const label = this.labels.create(container, { supportHighlights: true });
    return { label };
  }
  renderElement(node, index, data) {
    const element = node.element;
    const label = element.getLabel();
    this.render(element, label, data, node.filterData);
  }
  renderCompressedElements(node, index, data) {
    const element = node.element.elements[node.element.elements.length - 1];
    const labels = node.element.elements.map((e) => e.getLabel());
    this.render(element, labels, data, node.filterData);
  }
  render(element, labels, data, filterData) {
    const label = {
      name: labels
    };
    const options = {
      title: element.getHoverLabel()
    };
    if (element instanceof RootFolderTreeItem) {
      options.fileKind = FileKind.ROOT_FOLDER;
    } else if (element instanceof SessionTreeItem) {
      options.title = nls.localize("loadedScriptsSession", "Debug Session");
      options.hideIcon = true;
    } else if (element instanceof BaseTreeItem) {
      const src = element.getSource();
      if (src && src.uri) {
        label.resource = src.uri;
        options.fileKind = FileKind.FILE;
      } else {
        options.fileKind = FileKind.FOLDER;
      }
    }
    options.matches = createMatches(filterData);
    data.label.setResource(label, options);
  }
  disposeTemplate(templateData) {
    templateData.label.dispose();
  }
};
_LoadedScriptsRenderer.ID = "lsrenderer";
let LoadedScriptsRenderer = _LoadedScriptsRenderer;
class LoadedSciptsAccessibilityProvider {
  getWidgetAriaLabel() {
    return nls.localize({ comment: ["Debug is a noun in this context, not a verb."], key: "loadedScriptsAriaLabel" }, "Debug Loaded Scripts");
  }
  getAriaLabel(element) {
    if (element instanceof RootFolderTreeItem) {
      return nls.localize("loadedScriptsRootFolderAriaLabel", "Workspace folder {0}, loaded script, debug", element.getLabel());
    }
    if (element instanceof SessionTreeItem) {
      return nls.localize("loadedScriptsSessionAriaLabel", "Session {0}, loaded script, debug", element.getLabel());
    }
    if (element.hasChildren()) {
      return nls.localize("loadedScriptsFolderAriaLabel", "Folder {0}, loaded script, debug", element.getLabel());
    } else {
      return nls.localize("loadedScriptsSourceAriaLabel", "{0}, loaded script, debug", element.getLabel());
    }
  }
}
class LoadedScriptsFilter {
  setFilter(filterText) {
    this.filterText = filterText;
  }
  filter(element, parentVisibility) {
    if (!this.filterText) {
      return TreeVisibility.Visible;
    }
    if (element.isLeaf()) {
      const name = element.getLabel();
      if (name.indexOf(this.filterText) >= 0) {
        return TreeVisibility.Visible;
      }
      return TreeVisibility.Hidden;
    }
    return TreeVisibility.Recurse;
  }
}
registerAction2(class Collapse extends ViewAction {
  constructor() {
    super({
      id: "loadedScripts.collapse",
      viewId: LOADED_SCRIPTS_VIEW_ID,
      title: nls.localize("collapse", "Collapse All"),
      f1: false,
      icon: Codicon.collapseAll,
      menu: {
        id: MenuId.ViewTitle,
        order: 30,
        group: "navigation",
        when: ContextKeyExpr.equals("view", LOADED_SCRIPTS_VIEW_ID)
      }
    });
  }
  runInView(_accessor, view) {
    view.collapseAll();
  }
});
export {
  LoadedScriptsView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxsb2FkZWRTY3JpcHRzVmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgVHJlZUZpbmRNb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvYWJzdHJhY3RUcmVlLmpzJztcbmltcG9ydCB0eXBlIHsgSUNvbXByZXNzZWRUcmVlTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL2NvbXByZXNzZWRPYmplY3RUcmVlTW9kZWwuanMnO1xuaW1wb3J0IHR5cGUgeyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvb2JqZWN0VHJlZS5qcyc7XG5pbXBvcnQgeyBJVHJlZUVsZW1lbnQsIElUcmVlRmlsdGVyLCBJVHJlZU5vZGUsIFRyZWVGaWx0ZXJSZXN1bHQsIFRyZWVWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZU1hdGNoZXMsIEZ1enp5U2NvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IG5vcm1hbGl6ZURyaXZlTGV0dGVyLCB0aWxkaWZ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGFiZWxzLmpzJztcbmltcG9ydCB7IGRpc3Bvc2UsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc0Fic29sdXRlLCBub3JtYWxpemUsIHBvc2l4IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBsdHJpbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IEZpbGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaENvbXByZXNzaWJsZU9iamVjdFRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJRmlsZUljb25UaGVtZSwgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVJlc291cmNlTGFiZWwsIElSZXNvdXJjZUxhYmVsT3B0aW9ucywgSVJlc291cmNlTGFiZWxQcm9wcywgUmVzb3VyY2VMYWJlbHMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBWaWV3QWN0aW9uLCBWaWV3UGFuZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmUuanMnO1xuaW1wb3J0IHsgSVZpZXdsZXRWaWV3T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld3NWaWV3bGV0LmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ09OVEVYVF9MT0FERURfU0NSSVBUU19JVEVNX1RZUEUsIElEZWJ1Z1NlcnZpY2UsIElEZWJ1Z1Nlc3Npb24sIExPQURFRF9TQ1JJUFRTX1ZJRVdfSUQgfSBmcm9tICcuLi9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgRGVidWdDb250ZW50UHJvdmlkZXIgfSBmcm9tICcuLi9jb21tb24vZGVidWdDb250ZW50UHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgU291cmNlIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnU291cmNlLmpzJztcbmltcG9ydCB7IHJlbmRlclZpZXdUcmVlIH0gZnJvbSAnLi9iYXNlRGVidWdWaWV3LmpzJztcblxuY29uc3QgTkVXX1NUWUxFX0NPTVBSRVNTID0gdHJ1ZTtcblxuLy8gUkZDIDIzOTYsIEFwcGVuZGl4IEE6IGh0dHBzOi8vd3d3LmlldGYub3JnL3JmYy9yZmMyMzk2LnR4dFxuY29uc3QgVVJJX1NDSEVNQV9QQVRURVJOID0gL15bYS16QS1aXVthLXpBLVowLTlcXCtcXC1cXC5dKzovO1xuXG50eXBlIExvYWRlZFNjcmlwdHNJdGVtID0gQmFzZVRyZWVJdGVtO1xuXG5jbGFzcyBCYXNlVHJlZUl0ZW0ge1xuXG5cdHByaXZhdGUgX3Nob3dlZE1vcmVUaGFuT25lOiBib29sZWFuO1xuXHRwcml2YXRlIF9jaGlsZHJlbiA9IG5ldyBNYXA8c3RyaW5nLCBCYXNlVHJlZUl0ZW0+KCk7XG5cdHByaXZhdGUgX3NvdXJjZTogU291cmNlIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgX3BhcmVudDogQmFzZVRyZWVJdGVtIHwgdW5kZWZpbmVkLCBwcml2YXRlIF9sYWJlbDogc3RyaW5nLCBwdWJsaWMgcmVhZG9ubHkgaXNJbmNvbXByZXNzaWJsZSA9IGZhbHNlKSB7XG5cdFx0dGhpcy5fc2hvd2VkTW9yZVRoYW5PbmUgPSBmYWxzZTtcblx0fVxuXG5cdHVwZGF0ZUxhYmVsKGxhYmVsOiBzdHJpbmcpIHtcblx0XHR0aGlzLl9sYWJlbCA9IGxhYmVsO1xuXHR9XG5cblx0aXNMZWFmKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jaGlsZHJlbi5zaXplID09PSAwO1xuXHR9XG5cblx0Z2V0U2Vzc2lvbigpOiBJRGVidWdTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fcGFyZW50KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcGFyZW50LmdldFNlc3Npb24oKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHNldFNvdXJjZShzZXNzaW9uOiBJRGVidWdTZXNzaW9uLCBzb3VyY2U6IFNvdXJjZSk6IHZvaWQge1xuXHRcdHRoaXMuX3NvdXJjZSA9IHNvdXJjZTtcblx0XHR0aGlzLl9jaGlsZHJlbi5jbGVhcigpO1xuXHRcdGlmIChzb3VyY2UucmF3ICYmIHNvdXJjZS5yYXcuc291cmNlcykge1xuXHRcdFx0Zm9yIChjb25zdCBzcmMgb2Ygc291cmNlLnJhdy5zb3VyY2VzKSB7XG5cdFx0XHRcdGlmIChzcmMubmFtZSAmJiBzcmMucGF0aCkge1xuXHRcdFx0XHRcdGNvbnN0IHMgPSBuZXcgQmFzZVRyZWVJdGVtKHRoaXMsIHNyYy5uYW1lKTtcblx0XHRcdFx0XHR0aGlzLl9jaGlsZHJlbi5zZXQoc3JjLnBhdGgsIHMpO1xuXHRcdFx0XHRcdGNvbnN0IHNzID0gc2Vzc2lvbi5nZXRTb3VyY2Uoc3JjKTtcblx0XHRcdFx0XHRzLnNldFNvdXJjZShzZXNzaW9uLCBzcyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRjcmVhdGVJZk5lZWRlZDxUIGV4dGVuZHMgQmFzZVRyZWVJdGVtPihrZXk6IHN0cmluZywgZmFjdG9yeTogKHBhcmVudDogQmFzZVRyZWVJdGVtLCBsYWJlbDogc3RyaW5nKSA9PiBUKTogVCB7XG5cdFx0bGV0IGNoaWxkID0gPFQ+dGhpcy5fY2hpbGRyZW4uZ2V0KGtleSk7XG5cdFx0aWYgKCFjaGlsZCkge1xuXHRcdFx0Y2hpbGQgPSBmYWN0b3J5KHRoaXMsIGtleSk7XG5cdFx0XHR0aGlzLl9jaGlsZHJlbi5zZXQoa2V5LCBjaGlsZCk7XG5cdFx0fVxuXHRcdHJldHVybiBjaGlsZDtcblx0fVxuXG5cdGdldENoaWxkKGtleTogc3RyaW5nKTogQmFzZVRyZWVJdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY2hpbGRyZW4uZ2V0KGtleSk7XG5cdH1cblxuXHRyZW1vdmUoa2V5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9jaGlsZHJlbi5kZWxldGUoa2V5KTtcblx0fVxuXG5cdHJlbW92ZUZyb21QYXJlbnQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3BhcmVudCkge1xuXHRcdFx0dGhpcy5fcGFyZW50LnJlbW92ZSh0aGlzLl9sYWJlbCk7XG5cdFx0XHRpZiAodGhpcy5fcGFyZW50Ll9jaGlsZHJlbi5zaXplID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuX3BhcmVudC5yZW1vdmVGcm9tUGFyZW50KCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiAnaWQnO1xuXHR9XG5cblx0Ly8gYSBkeW5hbWljIElEIGJhc2VkIG9uIHRoZSBwYXJlbnQgY2hhaW47IHJlcXVpcmVkIGZvciByZXBhcmVudGluZyAoc2VlICM1NTQ0OClcblx0Z2V0SWQoKTogc3RyaW5nIHtcblx0XHRjb25zdCBwYXJlbnQgPSB0aGlzLmdldFBhcmVudCgpO1xuXHRcdHJldHVybiBwYXJlbnQgPyBgJHtwYXJlbnQuZ2V0SWQoKX0vJHt0aGlzLmdldEludGVybmFsSWQoKX1gIDogdGhpcy5nZXRJbnRlcm5hbElkKCk7XG5cdH1cblxuXHRnZXRJbnRlcm5hbElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2xhYmVsO1xuXHR9XG5cblx0Ly8gc2tpcHMgaW50ZXJtZWRpYXRlIHNpbmdsZS1jaGlsZCBub2Rlc1xuXHRnZXRQYXJlbnQoKTogQmFzZVRyZWVJdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fcGFyZW50KSB7XG5cdFx0XHRpZiAodGhpcy5fcGFyZW50LmlzU2tpcHBlZCgpKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9wYXJlbnQuZ2V0UGFyZW50KCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5fcGFyZW50O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0aXNTa2lwcGVkKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9wYXJlbnQpIHtcblx0XHRcdGlmICh0aGlzLl9wYXJlbnQub25lQ2hpbGQoKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcdC8vIHNraXBwZWQgaWYgSSdtIHRoZSBvbmx5IGNoaWxkIG9mIG15IHBhcmVudHNcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XHQvLyByb290cyBhcmUgbmV2ZXIgc2tpcHBlZFxuXHR9XG5cblx0Ly8gc2tpcHMgaW50ZXJtZWRpYXRlIHNpbmdsZS1jaGlsZCBub2Rlc1xuXHRoYXNDaGlsZHJlbigpOiBib29sZWFuIHtcblx0XHRjb25zdCBjaGlsZCA9IHRoaXMub25lQ2hpbGQoKTtcblx0XHRpZiAoY2hpbGQpIHtcblx0XHRcdHJldHVybiBjaGlsZC5oYXNDaGlsZHJlbigpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fY2hpbGRyZW4uc2l6ZSA+IDA7XG5cdH1cblxuXHQvLyBza2lwcyBpbnRlcm1lZGlhdGUgc2luZ2xlLWNoaWxkIG5vZGVzXG5cdGdldENoaWxkcmVuKCk6IEJhc2VUcmVlSXRlbVtdIHtcblx0XHRjb25zdCBjaGlsZCA9IHRoaXMub25lQ2hpbGQoKTtcblx0XHRpZiAoY2hpbGQpIHtcblx0XHRcdHJldHVybiBjaGlsZC5nZXRDaGlsZHJlbigpO1xuXHRcdH1cblx0XHRjb25zdCBhcnJheTogQmFzZVRyZWVJdGVtW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMuX2NoaWxkcmVuLnZhbHVlcygpKSB7XG5cdFx0XHRhcnJheS5wdXNoKGNoaWxkKTtcblx0XHR9XG5cdFx0cmV0dXJuIGFycmF5LnNvcnQoKGEsIGIpID0+IHRoaXMuY29tcGFyZShhLCBiKSk7XG5cdH1cblxuXHQvLyBza2lwcyBpbnRlcm1lZGlhdGUgc2luZ2xlLWNoaWxkIG5vZGVzXG5cdGdldExhYmVsKHNlcGFyYXRlUm9vdEZvbGRlciA9IHRydWUpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGNoaWxkID0gdGhpcy5vbmVDaGlsZCgpO1xuXHRcdGlmIChjaGlsZCkge1xuXHRcdFx0Y29uc3Qgc2VwID0gKHRoaXMgaW5zdGFuY2VvZiBSb290Rm9sZGVyVHJlZUl0ZW0gJiYgc2VwYXJhdGVSb290Rm9sZGVyKSA/ICcgXHUyMDIyICcgOiBwb3NpeC5zZXA7XG5cdFx0XHRyZXR1cm4gYCR7dGhpcy5fbGFiZWx9JHtzZXB9JHtjaGlsZC5nZXRMYWJlbCgpfWA7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9sYWJlbDtcblx0fVxuXG5cdC8vIHNraXBzIGludGVybWVkaWF0ZSBzaW5nbGUtY2hpbGQgbm9kZXNcblx0Z2V0SG92ZXJMYWJlbCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9zb3VyY2UgJiYgdGhpcy5fcGFyZW50ICYmIHRoaXMuX3BhcmVudC5fc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc291cmNlLnJhdy5wYXRoIHx8IHRoaXMuX3NvdXJjZS5yYXcubmFtZTtcblx0XHR9XG5cdFx0Y29uc3QgbGFiZWwgPSB0aGlzLmdldExhYmVsKGZhbHNlKTtcblx0XHRjb25zdCBwYXJlbnQgPSB0aGlzLmdldFBhcmVudCgpO1xuXHRcdGlmIChwYXJlbnQpIHtcblx0XHRcdGNvbnN0IGhvdmVyID0gcGFyZW50LmdldEhvdmVyTGFiZWwoKTtcblx0XHRcdGlmIChob3Zlcikge1xuXHRcdFx0XHRyZXR1cm4gYCR7aG92ZXJ9LyR7bGFiZWx9YDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGxhYmVsO1xuXHR9XG5cblx0Ly8gc2tpcHMgaW50ZXJtZWRpYXRlIHNpbmdsZS1jaGlsZCBub2Rlc1xuXHRnZXRTb3VyY2UoKTogU291cmNlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjaGlsZCA9IHRoaXMub25lQ2hpbGQoKTtcblx0XHRpZiAoY2hpbGQpIHtcblx0XHRcdHJldHVybiBjaGlsZC5nZXRTb3VyY2UoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3NvdXJjZTtcblx0fVxuXG5cdHByb3RlY3RlZCBjb21wYXJlKGE6IEJhc2VUcmVlSXRlbSwgYjogQmFzZVRyZWVJdGVtKTogbnVtYmVyIHtcblx0XHRpZiAoYS5fbGFiZWwgJiYgYi5fbGFiZWwpIHtcblx0XHRcdHJldHVybiBhLl9sYWJlbC5sb2NhbGVDb21wYXJlKGIuX2xhYmVsKTtcblx0XHR9XG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRwcml2YXRlIG9uZUNoaWxkKCk6IEJhc2VUcmVlSXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLl9zb3VyY2UgJiYgIXRoaXMuX3Nob3dlZE1vcmVUaGFuT25lICYmIHRoaXMuc2tpcE9uZUNoaWxkKCkpIHtcblx0XHRcdGlmICh0aGlzLl9jaGlsZHJlbi5zaXplID09PSAxKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9jaGlsZHJlbi52YWx1ZXMoKS5uZXh0KCkudmFsdWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBpZiBhIG5vZGUgaGFkIG1vcmUgdGhhbiBvbmUgY2hpbGQgb25jZSwgaXQgd2lsbCBuZXZlciBiZSBza2lwcGVkIGFnYWluXG5cdFx0XHRpZiAodGhpcy5fY2hpbGRyZW4uc2l6ZSA+IDEpIHtcblx0XHRcdFx0dGhpcy5fc2hvd2VkTW9yZVRoYW5PbmUgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBza2lwT25lQ2hpbGQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKE5FV19TVFlMRV9DT01QUkVTUykge1xuXHRcdFx0Ly8gaWYgdGhlIHJvb3Qgbm9kZSBoYXMgb25seSBvbmUgU2Vzc2lvbiwgZG9uJ3Qgc2hvdyB0aGUgc2Vzc2lvblxuXHRcdFx0cmV0dXJuIHRoaXMgaW5zdGFuY2VvZiBSb290VHJlZUl0ZW07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiAhKHRoaXMgaW5zdGFuY2VvZiBSb290Rm9sZGVyVHJlZUl0ZW0pICYmICEodGhpcyBpbnN0YW5jZW9mIFNlc3Npb25UcmVlSXRlbSk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFJvb3RGb2xkZXJUcmVlSXRlbSBleHRlbmRzIEJhc2VUcmVlSXRlbSB7XG5cblx0Y29uc3RydWN0b3IocGFyZW50OiBCYXNlVHJlZUl0ZW0sIHB1YmxpYyBmb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRzdXBlcihwYXJlbnQsIGZvbGRlci5uYW1lLCB0cnVlKTtcblx0fVxufVxuXG5jbGFzcyBSb290VHJlZUl0ZW0gZXh0ZW5kcyBCYXNlVHJlZUl0ZW0ge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgX3BhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsIHByaXZhdGUgX2NvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIHByaXZhdGUgX2xhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSkge1xuXHRcdHN1cGVyKHVuZGVmaW5lZCwgJ1Jvb3QnKTtcblx0fVxuXG5cdGFkZChzZXNzaW9uOiBJRGVidWdTZXNzaW9uKTogU2Vzc2lvblRyZWVJdGVtIHtcblx0XHRyZXR1cm4gdGhpcy5jcmVhdGVJZk5lZWRlZChzZXNzaW9uLmdldElkKCksICgpID0+IG5ldyBTZXNzaW9uVHJlZUl0ZW0odGhpcy5fbGFiZWxTZXJ2aWNlLCB0aGlzLCBzZXNzaW9uLCB0aGlzLl9wYXRoU2VydmljZSwgdGhpcy5fY29udGV4dFNlcnZpY2UpKTtcblx0fVxuXG5cdGZpbmQoc2Vzc2lvbjogSURlYnVnU2Vzc2lvbik6IFNlc3Npb25UcmVlSXRlbSB7XG5cdFx0cmV0dXJuIDxTZXNzaW9uVHJlZUl0ZW0+dGhpcy5nZXRDaGlsZChzZXNzaW9uLmdldElkKCkpO1xuXHR9XG59XG5cbmNsYXNzIFNlc3Npb25UcmVlSXRlbSBleHRlbmRzIEJhc2VUcmVlSXRlbSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVVJMX1JFR0VYUCA9IC9eKGh0dHBzPzpcXC9cXC9bXi9dKykoXFwvLiopJC87XG5cblx0cHJpdmF0ZSBfc2Vzc2lvbjogSURlYnVnU2Vzc2lvbjtcblx0cHJpdmF0ZSBfbWFwID0gbmV3IE1hcDxzdHJpbmcsIEJhc2VUcmVlSXRlbT4oKTtcblx0cHJpdmF0ZSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlO1xuXG5cdGNvbnN0cnVjdG9yKGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSwgcGFyZW50OiBCYXNlVHJlZUl0ZW0sIHNlc3Npb246IElEZWJ1Z1Nlc3Npb24sIHByaXZhdGUgX3BhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsIHByaXZhdGUgcm9vdFByb3ZpZGVyOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UpIHtcblx0XHRzdXBlcihwYXJlbnQsIHNlc3Npb24uZ2V0TGFiZWwoKSwgdHJ1ZSk7XG5cdFx0dGhpcy5fbGFiZWxTZXJ2aWNlID0gbGFiZWxTZXJ2aWNlO1xuXHRcdHRoaXMuX3Nlc3Npb24gPSBzZXNzaW9uO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0SW50ZXJuYWxJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9uLmdldElkKCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRTZXNzaW9uKCk6IElEZWJ1Z1Nlc3Npb24ge1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9uO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0SG92ZXJMYWJlbCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRvdmVycmlkZSBoYXNDaGlsZHJlbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjb21wYXJlKGE6IEJhc2VUcmVlSXRlbSwgYjogQmFzZVRyZWVJdGVtKTogbnVtYmVyIHtcblx0XHRjb25zdCBhY2F0ID0gdGhpcy5jYXRlZ29yeShhKTtcblx0XHRjb25zdCBiY2F0ID0gdGhpcy5jYXRlZ29yeShiKTtcblx0XHRpZiAoYWNhdCAhPT0gYmNhdCkge1xuXHRcdFx0cmV0dXJuIGFjYXQgLSBiY2F0O1xuXHRcdH1cblx0XHRyZXR1cm4gc3VwZXIuY29tcGFyZShhLCBiKTtcblx0fVxuXG5cdHByaXZhdGUgY2F0ZWdvcnkoaXRlbTogQmFzZVRyZWVJdGVtKTogbnVtYmVyIHtcblxuXHRcdC8vIHdvcmtzcGFjZSBzY3JpcHRzIGNvbWUgYXQgdGhlIGJlZ2lubmluZyBpbiBcImZvbGRlclwiIG9yZGVyXG5cdFx0aWYgKGl0ZW0gaW5zdGFuY2VvZiBSb290Rm9sZGVyVHJlZUl0ZW0pIHtcblx0XHRcdHJldHVybiBpdGVtLmZvbGRlci5pbmRleDtcblx0XHR9XG5cblx0XHQvLyA8Li4uPiBjb21lIGF0IHRoZSB2ZXJ5IGVuZFxuXHRcdGNvbnN0IGwgPSBpdGVtLmdldExhYmVsKCk7XG5cdFx0aWYgKGwgJiYgL148Lis+JC8udGVzdChsKSkge1xuXHRcdFx0cmV0dXJuIDEwMDA7XG5cdFx0fVxuXG5cdFx0Ly8gZXZlcnl0aGluZyBlbHNlIGluIGJldHdlZW5cblx0XHRyZXR1cm4gOTk5O1xuXHR9XG5cblx0YXN5bmMgYWRkUGF0aChzb3VyY2U6IFNvdXJjZSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0bGV0IGZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciB8IG51bGw7XG5cdFx0bGV0IHVybDogc3RyaW5nO1xuXG5cdFx0bGV0IHBhdGggPSBzb3VyY2UucmF3LnBhdGg7XG5cdFx0aWYgKCFwYXRoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2xhYmVsU2VydmljZSAmJiBVUklfU0NIRU1BX1BBVFRFUk4udGVzdChwYXRoKSkge1xuXHRcdFx0cGF0aCA9IHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbChVUkkucGFyc2UocGF0aCkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1hdGNoID0gU2Vzc2lvblRyZWVJdGVtLlVSTF9SRUdFWFAuZXhlYyhwYXRoKTtcblx0XHRpZiAobWF0Y2ggJiYgbWF0Y2gubGVuZ3RoID09PSAzKSB7XG5cdFx0XHR1cmwgPSBtYXRjaFsxXTtcblx0XHRcdHBhdGggPSBkZWNvZGVVUkkobWF0Y2hbMl0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoaXNBYnNvbHV0ZShwYXRoKSkge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKHBhdGgpO1xuXG5cdFx0XHRcdC8vIHJldHVybiBlYXJseSBpZiB3ZSBjYW4gcmVzb2x2ZSBhIHJlbGF0aXZlIHBhdGggbGFiZWwgZnJvbSB0aGUgcm9vdCBmb2xkZXJcblx0XHRcdFx0Zm9sZGVyID0gdGhpcy5yb290UHJvdmlkZXIgPyB0aGlzLnJvb3RQcm92aWRlci5nZXRXb3Jrc3BhY2VGb2xkZXIocmVzb3VyY2UpIDogbnVsbDtcblx0XHRcdFx0aWYgKGZvbGRlcikge1xuXHRcdFx0XHRcdC8vIHN0cmlwIG9mZiB0aGUgcm9vdCBmb2xkZXIgcGF0aFxuXHRcdFx0XHRcdHBhdGggPSBub3JtYWxpemUobHRyaW0ocmVzb3VyY2UucGF0aC5zdWJzdHJpbmcoZm9sZGVyLnVyaS5wYXRoLmxlbmd0aCksIHBvc2l4LnNlcCkpO1xuXHRcdFx0XHRcdGNvbnN0IGhhc011bHRpcGxlUm9vdHMgPSB0aGlzLnJvb3RQcm92aWRlci5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzLmxlbmd0aCA+IDE7XG5cdFx0XHRcdFx0aWYgKGhhc011bHRpcGxlUm9vdHMpIHtcblx0XHRcdFx0XHRcdHBhdGggPSBwb3NpeC5zZXAgKyBwYXRoO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBkb24ndCBzaG93IHJvb3QgZm9sZGVyXG5cdFx0XHRcdFx0XHRmb2xkZXIgPSBudWxsO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBvbiB1bml4IHRyeSB0byB0aWxkaWZ5IGFic29sdXRlIHBhdGhzXG5cdFx0XHRcdFx0cGF0aCA9IG5vcm1hbGl6ZShwYXRoKTtcblx0XHRcdFx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRcdFx0XHRwYXRoID0gbm9ybWFsaXplRHJpdmVMZXR0ZXIocGF0aCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHBhdGggPSB0aWxkaWZ5KHBhdGgsIChhd2FpdCB0aGlzLl9wYXRoU2VydmljZS51c2VySG9tZSgpKS5mc1BhdGgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBsZWFmOiBCYXNlVHJlZUl0ZW0gPSB0aGlzO1xuXHRcdHBhdGguc3BsaXQoL1tcXC9cXFxcXS8pLmZvckVhY2goKHNlZ21lbnQsIGkpID0+IHtcblx0XHRcdGlmIChpID09PSAwICYmIGZvbGRlcikge1xuXHRcdFx0XHRjb25zdCBmID0gZm9sZGVyO1xuXHRcdFx0XHRsZWFmID0gbGVhZi5jcmVhdGVJZk5lZWRlZChmb2xkZXIubmFtZSwgcGFyZW50ID0+IG5ldyBSb290Rm9sZGVyVHJlZUl0ZW0ocGFyZW50LCBmKSk7XG5cdFx0XHR9IGVsc2UgaWYgKGkgPT09IDAgJiYgdXJsKSB7XG5cdFx0XHRcdGxlYWYgPSBsZWFmLmNyZWF0ZUlmTmVlZGVkKHVybCwgcGFyZW50ID0+IG5ldyBCYXNlVHJlZUl0ZW0ocGFyZW50LCB1cmwpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxlYWYgPSBsZWFmLmNyZWF0ZUlmTmVlZGVkKHNlZ21lbnQsIHBhcmVudCA9PiBuZXcgQmFzZVRyZWVJdGVtKHBhcmVudCwgc2VnbWVudCkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0bGVhZi5zZXRTb3VyY2UodGhpcy5fc2Vzc2lvbiwgc291cmNlKTtcblx0XHRpZiAoc291cmNlLnJhdy5wYXRoKSB7XG5cdFx0XHR0aGlzLl9tYXAuc2V0KHNvdXJjZS5yYXcucGF0aCwgbGVhZik7XG5cdFx0fVxuXHR9XG5cblx0cmVtb3ZlUGF0aChzb3VyY2U6IFNvdXJjZSk6IGJvb2xlYW4ge1xuXHRcdGlmIChzb3VyY2UucmF3LnBhdGgpIHtcblx0XHRcdGNvbnN0IGxlYWYgPSB0aGlzLl9tYXAuZ2V0KHNvdXJjZS5yYXcucGF0aCk7XG5cdFx0XHRpZiAobGVhZikge1xuXHRcdFx0XHRsZWFmLnJlbW92ZUZyb21QYXJlbnQoKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSVZpZXdTdGF0ZSB7XG5cdHJlYWRvbmx5IGV4cGFuZGVkOiBTZXQ8c3RyaW5nPjtcbn1cblxuLyoqXG4gKiBUaGlzIG1hcHMgYSBtb2RlbCBpdGVtIGludG8gYSB2aWV3IG1vZGVsIGl0ZW0uXG4gKi9cbmZ1bmN0aW9uIGFzVHJlZUVsZW1lbnQoaXRlbTogQmFzZVRyZWVJdGVtLCB2aWV3U3RhdGU/OiBJVmlld1N0YXRlKTogSVRyZWVFbGVtZW50PExvYWRlZFNjcmlwdHNJdGVtPiB7XG5cdGNvbnN0IGNoaWxkcmVuID0gaXRlbS5nZXRDaGlsZHJlbigpO1xuXHRjb25zdCBjb2xsYXBzZWQgPSB2aWV3U3RhdGUgPyAhdmlld1N0YXRlLmV4cGFuZGVkLmhhcyhpdGVtLmdldElkKCkpIDogIShpdGVtIGluc3RhbmNlb2YgU2Vzc2lvblRyZWVJdGVtKTtcblxuXHRyZXR1cm4ge1xuXHRcdGVsZW1lbnQ6IGl0ZW0sXG5cdFx0Y29sbGFwc2VkLFxuXHRcdGNvbGxhcHNpYmxlOiBpdGVtLmhhc0NoaWxkcmVuKCksXG5cdFx0Y2hpbGRyZW46IGNoaWxkcmVuLm1hcChpID0+IGFzVHJlZUVsZW1lbnQoaSwgdmlld1N0YXRlKSlcblx0fTtcbn1cblxuZXhwb3J0IGNsYXNzIExvYWRlZFNjcmlwdHNWaWV3IGV4dGVuZHMgVmlld1BhbmUge1xuXG5cdHByaXZhdGUgdHJlZUNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGxvYWRlZFNjcmlwdHNJdGVtVHlwZTogSUNvbnRleHRLZXk8c3RyaW5nPjtcblx0cHJpdmF0ZSB0cmVlITogV29ya2JlbmNoQ29tcHJlc3NpYmxlT2JqZWN0VHJlZTxMb2FkZWRTY3JpcHRzSXRlbSwgRnV6enlTY29yZT47XG5cdHByaXZhdGUgdHJlZUxhYmVscyE6IFJlc291cmNlTGFiZWxzO1xuXHRwcml2YXRlIGNoYW5nZVNjaGVkdWxlciE6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cdHByaXZhdGUgdHJlZU5lZWRzUmVmcmVzaE9uVmlzaWJsZSA9IGZhbHNlO1xuXHRwcml2YXRlIGZpbHRlciE6IExvYWRlZFNjcmlwdHNGaWx0ZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0aW9uczogSVZpZXdsZXRWaWV3T3B0aW9ucyxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASURlYnVnU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASVBhdGhTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIob3B0aW9ucywga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGhvdmVyU2VydmljZSk7XG5cdFx0dGhpcy5sb2FkZWRTY3JpcHRzSXRlbVR5cGUgPSBDT05URVhUX0xPQURFRF9TQ1JJUFRTX0lURU1fVFlQRS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblxuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdkZWJ1Zy1wYW5lJyk7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2RlYnVnLWxvYWRlZC1zY3JpcHRzJywgJ3Nob3ctZmlsZS1pY29ucycpO1xuXG5cdFx0dGhpcy50cmVlQ29udGFpbmVyID0gcmVuZGVyVmlld1RyZWUoY29udGFpbmVyKTtcblxuXHRcdHRoaXMuZmlsdGVyID0gbmV3IExvYWRlZFNjcmlwdHNGaWx0ZXIoKTtcblxuXHRcdGNvbnN0IHJvb3QgPSBuZXcgUm9vdFRyZWVJdGVtKHRoaXMucGF0aFNlcnZpY2UsIHRoaXMuY29udGV4dFNlcnZpY2UsIHRoaXMubGFiZWxTZXJ2aWNlKTtcblxuXHRcdHRoaXMudHJlZUxhYmVscyA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VMYWJlbHMsIHsgb25EaWRDaGFuZ2VWaXNpYmlsaXR5OiB0aGlzLm9uRGlkQ2hhbmdlQm9keVZpc2liaWxpdHkgfSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlTGFiZWxzKTtcblxuXHRcdGNvbnN0IG9uRmlsZUljb25UaGVtZUNoYW5nZSA9IChmaWxlSWNvblRoZW1lOiBJRmlsZUljb25UaGVtZSkgPT4ge1xuXHRcdFx0dGhpcy50cmVlQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2FsaWduLWljb25zLWFuZC10d2lzdGllcycsIGZpbGVJY29uVGhlbWUuaGFzRmlsZUljb25zICYmICFmaWxlSWNvblRoZW1lLmhhc0ZvbGRlckljb25zKTtcblx0XHRcdHRoaXMudHJlZUNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdoaWRlLWFycm93cycsIGZpbGVJY29uVGhlbWUuaGlkZXNFeHBsb3JlckFycm93cyA9PT0gdHJ1ZSk7XG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkRmlsZUljb25UaGVtZUNoYW5nZShvbkZpbGVJY29uVGhlbWVDaGFuZ2UpKTtcblx0XHRvbkZpbGVJY29uVGhlbWVDaGFuZ2UodGhpcy50aGVtZVNlcnZpY2UuZ2V0RmlsZUljb25UaGVtZSgpKTtcblxuXHRcdHRoaXMudHJlZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoQ29tcHJlc3NpYmxlT2JqZWN0VHJlZTxMb2FkZWRTY3JpcHRzSXRlbSwgRnV6enlTY29yZT4sXG5cdFx0XHQnTG9hZGVkU2NyaXB0c1ZpZXcnLFxuXHRcdFx0dGhpcy50cmVlQ29udGFpbmVyLFxuXHRcdFx0bmV3IExvYWRlZFNjcmlwdHNEZWxlZ2F0ZSgpLFxuXHRcdFx0W25ldyBMb2FkZWRTY3JpcHRzUmVuZGVyZXIodGhpcy50cmVlTGFiZWxzKV0sXG5cdFx0XHR7XG5cdFx0XHRcdGNvbXByZXNzaW9uRW5hYmxlZDogTkVXX1NUWUxFX0NPTVBSRVNTLFxuXHRcdFx0XHRjb2xsYXBzZUJ5RGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0aGlkZVR3aXN0aWVzT2ZDaGlsZGxlc3NFbGVtZW50czogdHJ1ZSxcblx0XHRcdFx0aWRlbnRpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldElkOiAoZWxlbWVudDogTG9hZGVkU2NyaXB0c0l0ZW0pID0+IGVsZW1lbnQuZ2V0SWQoKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0S2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWw6IChlbGVtZW50OiBMb2FkZWRTY3JpcHRzSXRlbSkgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQuZ2V0TGFiZWwoKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldENvbXByZXNzZWROb2RlS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWw6IChlbGVtZW50czogTG9hZGVkU2NyaXB0c0l0ZW1bXSkgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnRzLm1hcChlID0+IGUuZ2V0TGFiZWwoKSkuam9pbignLycpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0ZmlsdGVyOiB0aGlzLmZpbHRlcixcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBuZXcgTG9hZGVkU2NpcHRzQWNjZXNzaWJpbGl0eVByb3ZpZGVyKCksXG5cdFx0XHRcdG92ZXJyaWRlU3R5bGVzOiB0aGlzLmdldExvY2F0aW9uQmFzZWRDb2xvcnMoKS5saXN0T3ZlcnJpZGVTdHlsZXNcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0Y29uc3QgdXBkYXRlVmlldyA9ICh2aWV3U3RhdGU/OiBJVmlld1N0YXRlKSA9PiB0aGlzLnRyZWUuc2V0Q2hpbGRyZW4obnVsbCwgYXNUcmVlRWxlbWVudChyb290LCB2aWV3U3RhdGUpLmNoaWxkcmVuKTtcblxuXHRcdHVwZGF0ZVZpZXcoKTtcblxuXHRcdHRoaXMuY2hhbmdlU2NoZWR1bGVyID0gbmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdFx0dGhpcy50cmVlTmVlZHNSZWZyZXNoT25WaXNpYmxlID0gZmFsc2U7XG5cdFx0XHRpZiAodGhpcy50cmVlKSB7XG5cdFx0XHRcdHVwZGF0ZVZpZXcoKTtcblx0XHRcdH1cblx0XHR9LCAzMDApO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhbmdlU2NoZWR1bGVyKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZE9wZW4oZSA9PiB7XG5cdFx0XHRpZiAoZS5lbGVtZW50IGluc3RhbmNlb2YgQmFzZVRyZWVJdGVtKSB7XG5cdFx0XHRcdGNvbnN0IHNvdXJjZSA9IGUuZWxlbWVudC5nZXRTb3VyY2UoKTtcblx0XHRcdFx0aWYgKHNvdXJjZSAmJiBzb3VyY2UuYXZhaWxhYmxlKSB7XG5cdFx0XHRcdFx0Y29uc3QgbnVsbFJhbmdlID0geyBzdGFydExpbmVOdW1iZXI6IDAsIHN0YXJ0Q29sdW1uOiAwLCBlbmRMaW5lTnVtYmVyOiAwLCBlbmRDb2x1bW46IDAgfTtcblx0XHRcdFx0XHRzb3VyY2Uub3BlbkluRWRpdG9yKHRoaXMuZWRpdG9yU2VydmljZSwgbnVsbFJhbmdlLCBlLmVkaXRvck9wdGlvbnMucHJlc2VydmVGb2N1cywgZS5zaWRlQnlTaWRlLCBlLmVkaXRvck9wdGlvbnMucGlubmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZENoYW5nZUZvY3VzKCgpID0+IHtcblx0XHRcdGNvbnN0IGZvY3VzID0gdGhpcy50cmVlLmdldEZvY3VzKCk7XG5cdFx0XHRpZiAoZm9jdXMgaW5zdGFuY2VvZiBTZXNzaW9uVHJlZUl0ZW0pIHtcblx0XHRcdFx0dGhpcy5sb2FkZWRTY3JpcHRzSXRlbVR5cGUuc2V0KCdzZXNzaW9uJyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmxvYWRlZFNjcmlwdHNJdGVtVHlwZS5yZXNldCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHNjaGVkdWxlUmVmcmVzaE9uVmlzaWJsZSA9ICgpID0+IHtcblx0XHRcdGlmICh0aGlzLmlzQm9keVZpc2libGUoKSkge1xuXHRcdFx0XHR0aGlzLmNoYW5nZVNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy50cmVlTmVlZHNSZWZyZXNoT25WaXNpYmxlID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgYWRkU291cmNlUGF0aHNUb1Nlc3Npb24gPSBhc3luYyAoc2Vzc2lvbjogSURlYnVnU2Vzc2lvbikgPT4ge1xuXHRcdFx0aWYgKHNlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzTG9hZGVkU291cmNlc1JlcXVlc3QpIHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbk5vZGUgPSByb290LmFkZChzZXNzaW9uKTtcblx0XHRcdFx0Y29uc3QgcGF0aHMgPSBhd2FpdCBzZXNzaW9uLmdldExvYWRlZFNvdXJjZXMoKTtcblx0XHRcdFx0Zm9yIChjb25zdCBwYXRoIG9mIHBhdGhzKSB7XG5cdFx0XHRcdFx0YXdhaXQgc2Vzc2lvbk5vZGUuYWRkUGF0aChwYXRoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzY2hlZHVsZVJlZnJlc2hPblZpc2libGUoKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gVHJhY2sgbGlzdGVuZXJzIHBlciBzZXNzaW9uIHRvIGF2b2lkIGxlYWtpbmcgZGlzcG9zYWJsZXNcblx0XHRjb25zdCBzZXNzaW9uTGlzdGVuZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXG5cdFx0Y29uc3QgcmVnaXN0ZXJTZXNzaW9uTGlzdGVuZXJzID0gKHNlc3Npb246IElEZWJ1Z1Nlc3Npb24pID0+IHtcblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0c2Vzc2lvbkxpc3RlbmVycy5zZXQoc2Vzc2lvbi5nZXRJZCgpLCBzdG9yZSk7XG5cblx0XHRcdHN0b3JlLmFkZChzZXNzaW9uLm9uRGlkQ2hhbmdlTmFtZShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25Sb290ID0gcm9vdC5maW5kKHNlc3Npb24pO1xuXHRcdFx0XHRpZiAoc2Vzc2lvblJvb3QpIHtcblx0XHRcdFx0XHRzZXNzaW9uUm9vdC51cGRhdGVMYWJlbChzZXNzaW9uLmdldExhYmVsKCkpO1xuXHRcdFx0XHRcdHNjaGVkdWxlUmVmcmVzaE9uVmlzaWJsZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRzdG9yZS5hZGQoc2Vzc2lvbi5vbkRpZExvYWRlZFNvdXJjZShhc3luYyBldmVudCA9PiB7XG5cdFx0XHRcdGxldCBzZXNzaW9uUm9vdDogU2Vzc2lvblRyZWVJdGVtO1xuXHRcdFx0XHRzd2l0Y2ggKGV2ZW50LnJlYXNvbikge1xuXHRcdFx0XHRcdGNhc2UgJ25ldyc6XG5cdFx0XHRcdFx0Y2FzZSAnY2hhbmdlZCc6XG5cdFx0XHRcdFx0XHRzZXNzaW9uUm9vdCA9IHJvb3QuYWRkKHNlc3Npb24pO1xuXHRcdFx0XHRcdFx0YXdhaXQgc2Vzc2lvblJvb3QuYWRkUGF0aChldmVudC5zb3VyY2UpO1xuXHRcdFx0XHRcdFx0c2NoZWR1bGVSZWZyZXNoT25WaXNpYmxlKCk7XG5cdFx0XHRcdFx0XHRpZiAoZXZlbnQucmVhc29uID09PSAnY2hhbmdlZCcpIHtcblx0XHRcdFx0XHRcdFx0RGVidWdDb250ZW50UHJvdmlkZXIucmVmcmVzaERlYnVnQ29udGVudChldmVudC5zb3VyY2UudXJpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3JlbW92ZWQnOlxuXHRcdFx0XHRcdFx0c2Vzc2lvblJvb3QgPSByb290LmZpbmQoc2Vzc2lvbik7XG5cdFx0XHRcdFx0XHRpZiAoc2Vzc2lvblJvb3QgJiYgc2Vzc2lvblJvb3QucmVtb3ZlUGF0aChldmVudC5zb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRcdHNjaGVkdWxlUmVmcmVzaE9uVmlzaWJsZSgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdHRoaXMuZmlsdGVyLnNldEZpbHRlcihldmVudC5zb3VyY2UubmFtZSk7XG5cdFx0XHRcdFx0XHR0aGlzLnRyZWUucmVmaWx0ZXIoKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVidWdTZXJ2aWNlLm9uRGlkTmV3U2Vzc2lvbihyZWdpc3RlclNlc3Npb25MaXN0ZW5lcnMpKTtcblx0XHR0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldFNlc3Npb25zKCkuZm9yRWFjaChyZWdpc3RlclNlc3Npb25MaXN0ZW5lcnMpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWJ1Z1NlcnZpY2Uub25EaWRFbmRTZXNzaW9uKCh7IHNlc3Npb24gfSkgPT4ge1xuXHRcdFx0c2Vzc2lvbkxpc3RlbmVycy5kZWxldGVBbmREaXNwb3NlKHNlc3Npb24uZ2V0SWQoKSk7XG5cdFx0XHRyb290LnJlbW92ZShzZXNzaW9uLmdldElkKCkpO1xuXHRcdFx0dGhpcy5jaGFuZ2VTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLmNoYW5nZVNjaGVkdWxlci5zY2hlZHVsZSgwKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eSh2aXNpYmxlID0+IHtcblx0XHRcdGlmICh2aXNpYmxlICYmIHRoaXMudHJlZU5lZWRzUmVmcmVzaE9uVmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLmNoYW5nZVNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIGZlYXR1cmU6IGV4cGFuZCBhbGwgbm9kZXMgd2hlbiBmaWx0ZXJpbmcgKG5vdCB3aGVuIGZpbmRpbmcpXG5cdFx0bGV0IHZpZXdTdGF0ZTogSVZpZXdTdGF0ZSB8IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25EaWRDaGFuZ2VGaW5kUGF0dGVybihwYXR0ZXJuID0+IHtcblx0XHRcdGlmICh0aGlzLnRyZWUuZmluZE1vZGUgPT09IFRyZWVGaW5kTW9kZS5IaWdobGlnaHQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXZpZXdTdGF0ZSAmJiBwYXR0ZXJuKSB7XG5cdFx0XHRcdGNvbnN0IGV4cGFuZGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRcdGNvbnN0IHZpc2l0ID0gKG5vZGU6IElUcmVlTm9kZTxCYXNlVHJlZUl0ZW0gfCBudWxsLCBGdXp6eVNjb3JlPikgPT4ge1xuXHRcdFx0XHRcdGlmIChub2RlLmVsZW1lbnQgJiYgIW5vZGUuY29sbGFwc2VkKSB7XG5cdFx0XHRcdFx0XHRleHBhbmRlZC5hZGQobm9kZS5lbGVtZW50LmdldElkKCkpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZS5jaGlsZHJlbikge1xuXHRcdFx0XHRcdFx0dmlzaXQoY2hpbGQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHR2aXNpdCh0aGlzLnRyZWUuZ2V0Tm9kZSgpKTtcblx0XHRcdFx0dmlld1N0YXRlID0geyBleHBhbmRlZCB9O1xuXHRcdFx0XHR0aGlzLnRyZWUuZXhwYW5kQWxsKCk7XG5cdFx0XHR9IGVsc2UgaWYgKCFwYXR0ZXJuICYmIHZpZXdTdGF0ZSkge1xuXHRcdFx0XHR0aGlzLnRyZWUuc2V0Rm9jdXMoW10pO1xuXHRcdFx0XHR1cGRhdGVWaWV3KHZpZXdTdGF0ZSk7XG5cdFx0XHRcdHZpZXdTdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBwb3B1bGF0ZSB0cmVlIG1vZGVsIHdpdGggc291cmNlIHBhdGhzIGZyb20gYWxsIGRlYnVnIHNlc3Npb25zXG5cdFx0dGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRTZXNzaW9ucygpLmZvckVhY2goc2Vzc2lvbiA9PiBhZGRTb3VyY2VQYXRoc1RvU2Vzc2lvbihzZXNzaW9uKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbGF5b3V0Qm9keShoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHN1cGVyLmxheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0dGhpcy50cmVlLmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdGNvbGxhcHNlQWxsKCk6IHZvaWQge1xuXHRcdHRoaXMudHJlZS5jb2xsYXBzZUFsbCgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRkaXNwb3NlKHRoaXMudHJlZSk7XG5cdFx0ZGlzcG9zZSh0aGlzLnRyZWVMYWJlbHMpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBMb2FkZWRTY3JpcHRzRGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxMb2FkZWRTY3JpcHRzSXRlbT4ge1xuXG5cdGdldEhlaWdodChlbGVtZW50OiBMb2FkZWRTY3JpcHRzSXRlbSk6IG51bWJlciB7XG5cdFx0cmV0dXJuIDIyO1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBMb2FkZWRTY3JpcHRzSXRlbSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIExvYWRlZFNjcmlwdHNSZW5kZXJlci5JRDtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUxvYWRlZFNjcmlwdHNJdGVtVGVtcGxhdGVEYXRhIHtcblx0bGFiZWw6IElSZXNvdXJjZUxhYmVsO1xufVxuXG5jbGFzcyBMb2FkZWRTY3JpcHRzUmVuZGVyZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPEJhc2VUcmVlSXRlbSwgRnV6enlTY29yZSwgSUxvYWRlZFNjcmlwdHNJdGVtVGVtcGxhdGVEYXRhPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2xzcmVuZGVyZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgbGFiZWxzOiBSZXNvdXJjZUxhYmVsc1xuXHQpIHtcblx0fVxuXG5cdGdldCB0ZW1wbGF0ZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIExvYWRlZFNjcmlwdHNSZW5kZXJlci5JRDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJTG9hZGVkU2NyaXB0c0l0ZW1UZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGxhYmVsID0gdGhpcy5sYWJlbHMuY3JlYXRlKGNvbnRhaW5lciwgeyBzdXBwb3J0SGlnaGxpZ2h0czogdHJ1ZSB9KTtcblx0XHRyZXR1cm4geyBsYWJlbCB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8QmFzZVRyZWVJdGVtLCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgZGF0YTogSUxvYWRlZFNjcmlwdHNJdGVtVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cblx0XHRjb25zdCBlbGVtZW50ID0gbm9kZS5lbGVtZW50O1xuXHRcdGNvbnN0IGxhYmVsID0gZWxlbWVudC5nZXRMYWJlbCgpO1xuXG5cdFx0dGhpcy5yZW5kZXIoZWxlbWVudCwgbGFiZWwsIGRhdGEsIG5vZGUuZmlsdGVyRGF0YSk7XG5cdH1cblxuXHRyZW5kZXJDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8QmFzZVRyZWVJdGVtPiwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIGRhdGE6IElMb2FkZWRTY3JpcHRzSXRlbVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXG5cdFx0Y29uc3QgZWxlbWVudCA9IG5vZGUuZWxlbWVudC5lbGVtZW50c1tub2RlLmVsZW1lbnQuZWxlbWVudHMubGVuZ3RoIC0gMV07XG5cdFx0Y29uc3QgbGFiZWxzID0gbm9kZS5lbGVtZW50LmVsZW1lbnRzLm1hcChlID0+IGUuZ2V0TGFiZWwoKSk7XG5cblx0XHR0aGlzLnJlbmRlcihlbGVtZW50LCBsYWJlbHMsIGRhdGEsIG5vZGUuZmlsdGVyRGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlcihlbGVtZW50OiBCYXNlVHJlZUl0ZW0sIGxhYmVsczogc3RyaW5nIHwgc3RyaW5nW10sIGRhdGE6IElMb2FkZWRTY3JpcHRzSXRlbVRlbXBsYXRlRGF0YSwgZmlsdGVyRGF0YTogRnV6enlTY29yZSB8IHVuZGVmaW5lZCkge1xuXG5cdFx0Y29uc3QgbGFiZWw6IElSZXNvdXJjZUxhYmVsUHJvcHMgPSB7XG5cdFx0XHRuYW1lOiBsYWJlbHNcblx0XHR9O1xuXHRcdGNvbnN0IG9wdGlvbnM6IElSZXNvdXJjZUxhYmVsT3B0aW9ucyA9IHtcblx0XHRcdHRpdGxlOiBlbGVtZW50LmdldEhvdmVyTGFiZWwoKVxuXHRcdH07XG5cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFJvb3RGb2xkZXJUcmVlSXRlbSkge1xuXG5cdFx0XHRvcHRpb25zLmZpbGVLaW5kID0gRmlsZUtpbmQuUk9PVF9GT0xERVI7XG5cblx0XHR9IGVsc2UgaWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBTZXNzaW9uVHJlZUl0ZW0pIHtcblxuXHRcdFx0b3B0aW9ucy50aXRsZSA9IG5scy5sb2NhbGl6ZSgnbG9hZGVkU2NyaXB0c1Nlc3Npb24nLCBcIkRlYnVnIFNlc3Npb25cIik7XG5cdFx0XHRvcHRpb25zLmhpZGVJY29uID0gdHJ1ZTtcblxuXHRcdH0gZWxzZSBpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEJhc2VUcmVlSXRlbSkge1xuXG5cdFx0XHRjb25zdCBzcmMgPSBlbGVtZW50LmdldFNvdXJjZSgpO1xuXHRcdFx0aWYgKHNyYyAmJiBzcmMudXJpKSB7XG5cdFx0XHRcdGxhYmVsLnJlc291cmNlID0gc3JjLnVyaTtcblx0XHRcdFx0b3B0aW9ucy5maWxlS2luZCA9IEZpbGVLaW5kLkZJTEU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvcHRpb25zLmZpbGVLaW5kID0gRmlsZUtpbmQuRk9MREVSO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRvcHRpb25zLm1hdGNoZXMgPSBjcmVhdGVNYXRjaGVzKGZpbHRlckRhdGEpO1xuXG5cdFx0ZGF0YS5sYWJlbC5zZXRSZXNvdXJjZShsYWJlbCwgb3B0aW9ucyk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJTG9hZGVkU2NyaXB0c0l0ZW1UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIExvYWRlZFNjaXB0c0FjY2Vzc2liaWxpdHlQcm92aWRlciBpbXBsZW1lbnRzIElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPExvYWRlZFNjcmlwdHNJdGVtPiB7XG5cblx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSh7IGNvbW1lbnQ6IFsnRGVidWcgaXMgYSBub3VuIGluIHRoaXMgY29udGV4dCwgbm90IGEgdmVyYi4nXSwga2V5OiAnbG9hZGVkU2NyaXB0c0FyaWFMYWJlbCcgfSwgXCJEZWJ1ZyBMb2FkZWQgU2NyaXB0c1wiKTtcblx0fVxuXG5cdGdldEFyaWFMYWJlbChlbGVtZW50OiBMb2FkZWRTY3JpcHRzSXRlbSk6IHN0cmluZyB7XG5cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFJvb3RGb2xkZXJUcmVlSXRlbSkge1xuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnbG9hZGVkU2NyaXB0c1Jvb3RGb2xkZXJBcmlhTGFiZWwnLCBcIldvcmtzcGFjZSBmb2xkZXIgezB9LCBsb2FkZWQgc2NyaXB0LCBkZWJ1Z1wiLCBlbGVtZW50LmdldExhYmVsKCkpO1xuXHRcdH1cblxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgU2Vzc2lvblRyZWVJdGVtKSB7XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdsb2FkZWRTY3JpcHRzU2Vzc2lvbkFyaWFMYWJlbCcsIFwiU2Vzc2lvbiB7MH0sIGxvYWRlZCBzY3JpcHQsIGRlYnVnXCIsIGVsZW1lbnQuZ2V0TGFiZWwoKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQuaGFzQ2hpbGRyZW4oKSkge1xuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnbG9hZGVkU2NyaXB0c0ZvbGRlckFyaWFMYWJlbCcsIFwiRm9sZGVyIHswfSwgbG9hZGVkIHNjcmlwdCwgZGVidWdcIiwgZWxlbWVudC5nZXRMYWJlbCgpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnbG9hZGVkU2NyaXB0c1NvdXJjZUFyaWFMYWJlbCcsIFwiezB9LCBsb2FkZWQgc2NyaXB0LCBkZWJ1Z1wiLCBlbGVtZW50LmdldExhYmVsKCkpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBMb2FkZWRTY3JpcHRzRmlsdGVyIGltcGxlbWVudHMgSVRyZWVGaWx0ZXI8QmFzZVRyZWVJdGVtLCBGdXp6eVNjb3JlPiB7XG5cblx0cHJpdmF0ZSBmaWx0ZXJUZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0c2V0RmlsdGVyKGZpbHRlclRleHQ6IHN0cmluZykge1xuXHRcdHRoaXMuZmlsdGVyVGV4dCA9IGZpbHRlclRleHQ7XG5cdH1cblxuXHRmaWx0ZXIoZWxlbWVudDogQmFzZVRyZWVJdGVtLCBwYXJlbnRWaXNpYmlsaXR5OiBUcmVlVmlzaWJpbGl0eSk6IFRyZWVGaWx0ZXJSZXN1bHQ8RnV6enlTY29yZT4ge1xuXG5cdFx0aWYgKCF0aGlzLmZpbHRlclRleHQpIHtcblx0XHRcdHJldHVybiBUcmVlVmlzaWJpbGl0eS5WaXNpYmxlO1xuXHRcdH1cblxuXHRcdGlmIChlbGVtZW50LmlzTGVhZigpKSB7XG5cdFx0XHRjb25zdCBuYW1lID0gZWxlbWVudC5nZXRMYWJlbCgpO1xuXHRcdFx0aWYgKG5hbWUuaW5kZXhPZih0aGlzLmZpbHRlclRleHQpID49IDApIHtcblx0XHRcdFx0cmV0dXJuIFRyZWVWaXNpYmlsaXR5LlZpc2libGU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gVHJlZVZpc2liaWxpdHkuSGlkZGVuO1xuXHRcdH1cblx0XHRyZXR1cm4gVHJlZVZpc2liaWxpdHkuUmVjdXJzZTtcblx0fVxufVxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENvbGxhcHNlIGV4dGVuZHMgVmlld0FjdGlvbjxMb2FkZWRTY3JpcHRzVmlldz4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2xvYWRlZFNjcmlwdHMuY29sbGFwc2UnLFxuXHRcdFx0dmlld0lkOiBMT0FERURfU0NSSVBUU19WSUVXX0lELFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnY29sbGFwc2UnLCBcIkNvbGxhcHNlIEFsbFwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGljb246IENvZGljb24uY29sbGFwc2VBbGwsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRvcmRlcjogMzAsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIExPQURFRF9TQ1JJUFRTX1ZJRVdfSUQpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW5JblZpZXcoX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBMb2FkZWRTY3JpcHRzVmlldykge1xuXHRcdHZpZXcuY29sbGFwc2VBbGwoKTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU9BLFNBQVMsb0JBQW9CO0FBRzdCLFNBQWlFLHNCQUFzQjtBQUN2RixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxxQkFBaUM7QUFDMUMsU0FBUyxzQkFBc0IsZUFBZTtBQUM5QyxTQUFTLFNBQVMsZUFBZSx1QkFBdUI7QUFDeEQsU0FBUyxZQUFZLFdBQVcsYUFBYTtBQUM3QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxXQUFXO0FBQ3BCLFlBQVksU0FBUztBQUNyQixTQUFTLFFBQVEsdUJBQXVCO0FBQ3hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0JBQTZCLDBCQUEwQjtBQUNoRSxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDZCQUErQztBQUN4RCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHVDQUF1QztBQUNoRCxTQUFTLHNCQUFzQjtBQUMvQixTQUF5QixxQkFBcUI7QUFDOUMsU0FBUyxnQ0FBa0Q7QUFDM0QsU0FBcUUsc0JBQXNCO0FBQzNGLFNBQVMsWUFBWSxnQkFBZ0I7QUFFckMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxrQ0FBa0MsZUFBOEIsOEJBQThCO0FBQ3ZHLFNBQVMsNEJBQTRCO0FBRXJDLFNBQVMsc0JBQXNCO0FBRS9CLE1BQU0scUJBQXFCO0FBRzNCLE1BQU0scUJBQXFCO0FBSTNCLE1BQU0sYUFBYTtB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
