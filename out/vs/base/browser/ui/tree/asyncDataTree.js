import { ElementsDragAndDropData } from "../list/listView.js";
import { ComposedTreeDelegate, TreeFindMode, FindFilter, FindController } from "./abstractTree.js";
import { getVisibleState, isFilterResult } from "./indexTreeModel.js";
import { CompressibleObjectTree, ObjectTree } from "./objectTree.js";
import { ObjectTreeElementCollapseState, TreeError, TreeVisibility, WeakMapper } from "./tree.js";
import { createCancelablePromise, Promises, ThrottledDelayer, timeout } from "../../../common/async.js";
import { Codicon } from "../../../common/codicons.js";
import { ThemeIcon } from "../../../common/themables.js";
import { isCancellationError, onUnexpectedError } from "../../../common/errors.js";
import { Emitter, Event } from "../../../common/event.js";
import { Iterable } from "../../../common/iterator.js";
import { DisposableStore, dispose, toDisposable } from "../../../common/lifecycle.js";
import { isIterable } from "../../../common/types.js";
import { CancellationTokenSource } from "../../../common/cancellation.js";
import { FuzzyScore } from "../../../common/filters.js";
import { insertInto, splice } from "../../../common/arrays.js";
import { localize } from "../../../../nls.js";
function createAsyncDataTreeNode(props) {
  return {
    ...props,
    children: [],
    refreshPromise: void 0,
    stale: true,
    slow: false,
    forceExpanded: false
  };
}
function isAncestor(ancestor, descendant) {
  if (!descendant.parent) {
    return false;
  } else if (descendant.parent === ancestor) {
    return true;
  } else {
    return isAncestor(ancestor, descendant.parent);
  }
}
function intersects(node, other) {
  return node === other || isAncestor(node, other) || isAncestor(other, node);
}
class AsyncDataTreeNodeWrapper {
  constructor(node) {
    this.node = node;
  }
  get element() {
    return this.node.element.element;
  }
  get children() {
    return this.node.children.map((node) => new AsyncDataTreeNodeWrapper(node));
  }
  get depth() {
    return this.node.depth;
  }
  get visibleChildrenCount() {
    return this.node.visibleChildrenCount;
  }
  get visibleChildIndex() {
    return this.node.visibleChildIndex;
  }
  get collapsible() {
    return this.node.collapsible;
  }
  get collapsed() {
    return this.node.collapsed;
  }
  get visible() {
    return this.node.visible;
  }
  get filterData() {
    return this.node.filterData;
  }
}
class AsyncDataTreeRenderer {
  constructor(renderer, nodeMapper, onDidChangeTwistieState) {
    this.renderer = renderer;
    this.nodeMapper = nodeMapper;
    this.onDidChangeTwistieState = onDidChangeTwistieState;
    this.renderedNodes = /* @__PURE__ */ new Map();
    this.templateId = renderer.templateId;
  }
  renderTemplate(container) {
    const templateData = this.renderer.renderTemplate(container);
    return { templateData };
  }
  renderElement(node, index, templateData, details) {
    this.renderer.renderElement(this.nodeMapper.map(node), index, templateData.templateData, details);
  }
  renderTwistie(element, twistieElement) {
    if (element.slow) {
      twistieElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.treeItemLoading));
      return true;
    } else {
      twistieElement.classList.remove(...ThemeIcon.asClassNameArray(Codicon.treeItemLoading));
      return false;
    }
  }
  disposeElement(node, index, templateData, details) {
    this.renderer.disposeElement?.(this.nodeMapper.map(node), index, templateData.templateData, details);
  }
  disposeTemplate(templateData) {
    this.renderer.disposeTemplate(templateData.templateData);
  }
  dispose() {
    this.renderedNodes.clear();
  }
}
function asTreeEvent(e) {
  return {
    browserEvent: e.browserEvent,
    elements: e.elements.map((e2) => e2.element)
  };
}
function asTreeMouseEvent(e) {
  return {
    browserEvent: e.browserEvent,
    element: e.element && e.element.element,
    target: e.target
  };
}
function asTreeContextMenuEvent(e) {
  return {
    browserEvent: e.browserEvent,
    element: e.element && e.element.element,
    anchor: e.anchor,
    isStickyScroll: e.isStickyScroll
  };
}
class AsyncDataTreeElementsDragAndDropData extends ElementsDragAndDropData {
  constructor(data) {
    super(data.elements.map((node) => node.element));
    this.data = data;
  }
  set context(context) {
    this.data.context = context;
  }
  get context() {
    return this.data.context;
  }
}
function asAsyncDataTreeDragAndDropData(data) {
  if (data instanceof ElementsDragAndDropData) {
    return new AsyncDataTreeElementsDragAndDropData(data);
  }
  return data;
}
class AsyncDataTreeNodeListDragAndDrop {
  constructor(dnd) {
    this.dnd = dnd;
  }
  getDragURI(node) {
    return this.dnd.getDragURI(node.element);
  }
  getDragLabel(nodes, originalEvent) {
    if (this.dnd.getDragLabel) {
      return this.dnd.getDragLabel(nodes.map((node) => node.element), originalEvent);
    }
    return void 0;
  }
  onDragStart(data, originalEvent) {
    this.dnd.onDragStart?.(asAsyncDataTreeDragAndDropData(data), originalEvent);
  }
  onDragOver(data, targetNode, targetIndex, targetSector, originalEvent, raw = true) {
    return this.dnd.onDragOver(asAsyncDataTreeDragAndDropData(data), targetNode && targetNode.element, targetIndex, targetSector, originalEvent);
  }
  drop(data, targetNode, targetIndex, targetSector, originalEvent) {
    this.dnd.drop(asAsyncDataTreeDragAndDropData(data), targetNode && targetNode.element, targetIndex, targetSector, originalEvent);
  }
  onDragEnd(originalEvent) {
    this.dnd.onDragEnd?.(originalEvent);
  }
  dispose() {
    this.dnd.dispose();
  }
}
class AsyncFindFilter extends FindFilter {
  constructor(findProvider, keyboardNavigationLabelProvider, filter) {
    super(keyboardNavigationLabelProvider, filter);
    this.findProvider = findProvider;
    this.isFindSessionActive = false;
  }
  filter(element, parentVisibility) {
    const filterResult = super.filter(element, parentVisibility);
    if (!this.isFindSessionActive || this.findMode === TreeFindMode.Highlight || !this.findProvider.isVisible) {
      return filterResult;
    }
    const visibility = isFilterResult(filterResult) ? filterResult.visibility : filterResult;
    if (getVisibleState(visibility) === TreeVisibility.Hidden) {
      return TreeVisibility.Hidden;
    }
    return this.findProvider.isVisible(element) ? filterResult : TreeVisibility.Hidden;
  }
}
class AsyncFindController extends FindController {
  constructor(tree, findProvider, filter, contextViewProvider, options) {
    super(tree, filter, contextViewProvider, options);
    this.findProvider = findProvider;
    this.filter = filter;
    this.activeSession = false;
    this.asyncWorkInProgress = false;
    this.taskQueue = new ThrottledDelayer(250);
    this.disposables.add(toDisposable(async () => {
      if (this.activeSession) {
        await this.findProvider.endSession?.();
      }
    }));
  }
  applyPattern(_pattern) {
    this.renderMessage(false);
    this.activeTokenSource?.cancel();
    this.activeTokenSource = new CancellationTokenSource();
    this.taskQueue.trigger(() => this.applyPatternAsync());
  }
  async applyPatternAsync() {
    const token = this.activeTokenSource?.token;
    if (!token || token.isCancellationRequested) {
      return;
    }
    const pattern = this.pattern;
    if (pattern === "") {
      if (this.activeSession) {
        this.asyncWorkInProgress = true;
        await this.deactivateFindSession();
        this.asyncWorkInProgress = false;
        if (!token.isCancellationRequested) {
          this.filter.reset();
          super.applyPattern("");
        }
      }
      return;
    }
    if (!this.activeSession) {
      this.activateFindSession();
    }
    this.asyncWorkInProgress = true;
    this.activeFindMetadata = void 0;
    const findMetadata = await this.findProvider.find(pattern, { matchType: this.matchType, findMode: this.mode }, token);
    if (token.isCancellationRequested || findMetadata === void 0) {
      return;
    }
    this.asyncWorkInProgress = false;
    this.activeFindMetadata = findMetadata;
    this.filter.reset();
    super.applyPattern(pattern);
    if (findMetadata.warningMessage) {
      this.renderMessage(true, findMetadata.warningMessage);
    }
  }
  activateFindSession() {
    this.activeSession = true;
    this.filter.isFindSessionActive = true;
    this.findProvider.startSession?.();
  }
  async deactivateFindSession() {
    this.activeSession = false;
    this.filter.isFindSessionActive = false;
    await this.findProvider.endSession?.();
  }
  render() {
    if (this.asyncWorkInProgress || !this.activeFindMetadata) {
      return;
    }
    const showNotFound = this.activeFindMetadata.matchCount === 0 && this.pattern.length > 0;
    this.renderMessage(showNotFound);
    if (this.pattern.length) {
      this.alertResults(this.activeFindMetadata.matchCount);
    }
  }
  onDidToggleChange(e) {
    this.toggles.set(e.id, e.isChecked);
    this.filter.findMode = this.mode;
    this.filter.findMatchType = this.matchType;
    this.placeholder = this.mode === TreeFindMode.Filter ? localize("type to filter", "Type to filter") : localize("type to search", "Type to search");
    this.applyPattern(this.pattern);
  }
  shouldAllowFocus(node) {
    return this.shouldFocusWhenNavigating(node);
  }
  shouldFocusWhenNavigating(node) {
    if (!this.activeSession || !this.activeFindMetadata) {
      return true;
    }
    const element = node.element?.element;
    if (element && this.activeFindMetadata.isMatch(element)) {
      return true;
    }
    return !FuzzyScore.isDefault(node.filterData);
  }
}
function asObjectTreeOptions(options) {
  return options && {
    ...options,
    collapseByDefault: true,
    identityProvider: options.identityProvider && {
      getId(el) {
        return options.identityProvider.getId(el.element);
      },
      getGroupId: options.identityProvider.getGroupId ? (el) => {
        return options.identityProvider.getGroupId(el.element);
      } : void 0
    },
    dnd: options.dnd && new AsyncDataTreeNodeListDragAndDrop(options.dnd),
    multipleSelectionController: options.multipleSelectionController && {
      isSelectionSingleChangeEvent(e) {
        return options.multipleSelectionController.isSelectionSingleChangeEvent({ ...e, element: e.element });
      },
      isSelectionRangeChangeEvent(e) {
        return options.multipleSelectionController.isSelectionRangeChangeEvent({ ...e, element: e.element });
      }
    },
    accessibilityProvider: options.accessibilityProvider && {
      ...options.accessibilityProvider,
      getPosInSet: void 0,
      getSetSize: void 0,
      getRole: options.accessibilityProvider.getRole ? (el) => {
        return options.accessibilityProvider.getRole(el.element);
      } : () => "treeitem",
      isChecked: options.accessibilityProvider.isChecked ? (e) => {
        return !!options.accessibilityProvider?.isChecked(e.element);
      } : void 0,
      getAriaLabel(e) {
        return options.accessibilityProvider.getAriaLabel(e.element);
      },
      getWidgetAriaLabel() {
        return options.accessibilityProvider.getWidgetAriaLabel();
      },
      getWidgetRole: options.accessibilityProvider.getWidgetRole ? () => options.accessibilityProvider.getWidgetRole() : () => "tree",
      getAriaLevel: options.accessibilityProvider.getAriaLevel && ((node) => {
        return options.accessibilityProvider.getAriaLevel(node.element);
      }),
      getActiveDescendantId: options.accessibilityProvider.getActiveDescendantId && ((node) => {
        return options.accessibilityProvider.getActiveDescendantId(node.element);
      })
    },
    filter: options.filter && {
      filter(e, parentVisibility) {
        return options.filter.filter(e.element, parentVisibility);
      }
    },
    keyboardNavigationLabelProvider: options.keyboardNavigationLabelProvider && {
      ...options.keyboardNavigationLabelProvider,
      getKeyboardNavigationLabel(e) {
        return options.keyboardNavigationLabelProvider.getKeyboardNavigationLabel(e.element);
      }
    },
    sorter: void 0,
    expandOnlyOnTwistieClick: typeof options.expandOnlyOnTwistieClick === "undefined" ? void 0 : typeof options.expandOnlyOnTwistieClick !== "function" ? options.expandOnlyOnTwistieClick : ((e) => options.expandOnlyOnTwistieClick(e.element)),
    twistieAdditionalCssClass: typeof options.twistieAdditionalCssClass === "undefined" ? void 0 : ((e) => options.twistieAdditionalCssClass(e.element)),
    defaultFindVisibility: (e) => {
      if (e.hasChildren && e.stale) {
        return TreeVisibility.Visible;
      } else if (typeof options.defaultFindVisibility === "number") {
        return options.defaultFindVisibility;
      } else if (typeof options.defaultFindVisibility === "undefined") {
        return TreeVisibility.Recurse;
      } else {
        return options.defaultFindVisibility(e.element);
      }
    },
    stickyScrollDelegate: options.stickyScrollDelegate
  };
}
function dfs(node, fn) {
  fn(node);
  node.children.forEach((child) => dfs(child, fn));
}
class AsyncDataTree {
  constructor(user, container, delegate, renderers, dataSource, options = {}) {
    this.user = user;
    this.dataSource = dataSource;
    this.nodes = /* @__PURE__ */ new Map();
    this.subTreeRefreshPromises = /* @__PURE__ */ new Map();
    this.refreshPromises = /* @__PURE__ */ new Map();
    this._onDidRender = new Emitter();
    this._onDidChangeNodeSlowState = new Emitter();
    this.nodeMapper = new WeakMapper((node) => new AsyncDataTreeNodeWrapper(node));
    this.disposables = new DisposableStore();
    this.identityProvider = options.identityProvider;
    this.autoExpandSingleChildren = typeof options.autoExpandSingleChildren === "undefined" ? false : options.autoExpandSingleChildren;
    this.sorter = options.sorter;
    this.getDefaultCollapseState = (e) => options.collapseByDefault ? options.collapseByDefault(e) ? ObjectTreeElementCollapseState.PreserveOrCollapsed : ObjectTreeElementCollapseState.PreserveOrExpanded : void 0;
    let asyncFindEnabled = false;
    let findFilter;
    if (options.findProvider && (options.findWidgetEnabled ?? true) && options.keyboardNavigationLabelProvider && options.contextViewProvider) {
      asyncFindEnabled = true;
      findFilter = new AsyncFindFilter(options.findProvider, options.keyboardNavigationLabelProvider, options.filter);
    }
    this.tree = this.createTree(user, container, delegate, renderers, { ...options, findWidgetEnabled: !asyncFindEnabled, filter: findFilter ?? options.filter });
    this.root = createAsyncDataTreeNode({
      element: void 0,
      parent: null,
      hasChildren: true,
      defaultCollapseState: void 0
    });
    if (this.identityProvider) {
      this.root = {
        ...this.root,
        id: null
      };
    }
    this.nodes.set(null, this.root);
    this.tree.onDidChangeCollapseState(this._onDidChangeCollapseState, this, this.disposables);
    if (asyncFindEnabled) {
      const findOptions = {
        styles: options.findWidgetStyles,
        showNotFoundMessage: options.showNotFoundMessage,
        defaultFindMatchType: options.defaultFindMatchType,
        defaultFindMode: options.defaultFindMode
      };
      this.findController = this.disposables.add(new AsyncFindController(this.tree, options.findProvider, findFilter, this.tree.options.contextViewProvider, findOptions));
      this.focusNavigationFilter = (node) => this.findController.shouldFocusWhenNavigating(node);
      this.onDidChangeFindOpenState = this.findController.onDidChangeOpenState;
      this.onDidChangeFindMode = this.findController.onDidChangeMode;
      this.onDidChangeFindMatchType = this.findController.onDidChangeMatchType;
    } else {
      this.onDidChangeFindOpenState = this.tree.onDidChangeFindOpenState;
      this.onDidChangeFindMode = this.tree.onDidChangeFindMode;
      this.onDidChangeFindMatchType = this.tree.onDidChangeFindMatchType;
    }
  }
  get onDidScroll() {
    return this.tree.onDidScroll;
  }
  get onDidChangeFocus() {
    return Event.map(this.tree.onDidChangeFocus, asTreeEvent);
  }
  get onDidChangeSelection() {
    return Event.map(this.tree.onDidChangeSelection, asTreeEvent);
  }
  get onKeyDown() {
    return this.tree.onKeyDown;
  }
  get onMouseClick() {
    return Event.map(this.tree.onMouseClick, asTreeMouseEvent);
  }
  get onMouseDblClick() {
    return Event.map(this.tree.onMouseDblClick, asTreeMouseEvent);
  }
  get onContextMenu() {
    return Event.map(this.tree.onContextMenu, asTreeContextMenuEvent);
  }
  get onTap() {
    return Event.map(this.tree.onTap, asTreeMouseEvent);
  }
  get onPointer() {
    return Event.map(this.tree.onPointer, asTreeMouseEvent);
  }
  get onDidFocus() {
    return this.tree.onDidFocus;
  }
  get onDidBlur() {
    return this.tree.onDidBlur;
  }
  /**
   * To be used internally only!
   * @deprecated
   */
  get onDidChangeModel() {
    return this.tree.onDidChangeModel;
  }
  get onDidChangeCollapseState() {
    return this.tree.onDidChangeCollapseState;
  }
  get onDidUpdateOptions() {
    return this.tree.onDidUpdateOptions;
  }
  get onDidChangeStickyScrollFocused() {
    return this.tree.onDidChangeStickyScrollFocused;
  }
  get findMode() {
    return this.findController ? this.findController.mode : this.tree.findMode;
  }
  set findMode(mode) {
    this.findController ? this.findController.mode = mode : this.tree.findMode = mode;
  }
  get findMatchType() {
    return this.findController ? this.findController.matchType : this.tree.findMatchType;
  }
  set findMatchType(matchType) {
    this.findController ? this.findController.matchType = matchType : this.tree.findMatchType = matchType;
  }
  get expandOnlyOnTwistieClick() {
    if (typeof this.tree.expandOnlyOnTwistieClick === "boolean") {
      return this.tree.expandOnlyOnTwistieClick;
    }
    const fn = this.tree.expandOnlyOnTwistieClick;
    return (element) => fn(this.nodes.get(element === this.root.element ? null : element) || null);
  }
  get onDidDispose() {
    return this.tree.onDidDispose;
  }
  createTree(user, container, delegate, renderers, options) {
    const objectTreeDelegate = new ComposedTreeDelegate(delegate);
    const objectTreeRenderers = renderers.map((r) => new AsyncDataTreeRenderer(r, this.nodeMapper, this._onDidChangeNodeSlowState.event));
    const objectTreeOptions = asObjectTreeOptions(options) || {};
    return new ObjectTree(user, container, objectTreeDelegate, objectTreeRenderers, objectTreeOptions);
  }
  updateOptions(optionsUpdate = {}) {
    if (this.findController) {
      if (optionsUpdate.defaultFindMode !== void 0) {
        this.findController.mode = optionsUpdate.defaultFindMode;
      }
      if (optionsUpdate.defaultFindMatchType !== void 0) {
        this.findController.matchType = optionsUpdate.defaultFindMatchType;
      }
    }
    this.tree.updateOptions(optionsUpdate);
  }
  get options() {
    return this.tree.options;
  }
  // Widget
  getHTMLElement() {
    return this.tree.getHTMLElement();
  }
  get contentHeight() {
    return this.tree.contentHeight;
  }
  get contentWidth() {
    return this.tree.contentWidth;
  }
  get onDidChangeContentHeight() {
    return this.tree.onDidChangeContentHeight;
  }
  get onDidChangeContentWidth() {
    return this.tree.onDidChangeContentWidth;
  }
  get scrollTop() {
    return this.tree.scrollTop;
  }
  set scrollTop(scrollTop) {
    this.tree.scrollTop = scrollTop;
  }
  get scrollLeft() {
    return this.tree.scrollLeft;
  }
  set scrollLeft(scrollLeft) {
    this.tree.scrollLeft = scrollLeft;
  }
  get scrollHeight() {
    return this.tree.scrollHeight;
  }
  get renderHeight() {
    return this.tree.renderHeight;
  }
  get lastVisibleElement() {
    return this.tree.lastVisibleElement.element;
  }
  get ariaLabel() {
    return this.tree.ariaLabel;
  }
  set ariaLabel(value) {
    this.tree.ariaLabel = value;
  }
  domFocus() {
    this.tree.domFocus();
  }
  isDOMFocused() {
    return this.tree.isDOMFocused();
  }
  navigate(start) {
    let startNode;
    if (start) {
      startNode = this.getDataNode(start);
    }
    return new AsyncDataTreeNavigator(this.tree.navigate(startNode));
  }
  layout(height, width) {
    this.tree.layout(height, width);
  }
  style(styles) {
    this.tree.style(styles);
  }
  // Model
  getInput() {
    return this.root.element;
  }
  async setInput(input, viewState) {
    this.cancelAllRefreshPromises();
    this.root.element = input;
    const viewStateContext = viewState && { viewState, focus: [], selection: [] };
    await this._updateChildren(input, true, false, viewStateContext);
    if (viewStateContext) {
      this.tree.setFocus(viewStateContext.focus);
      this.tree.setSelection(viewStateContext.selection);
    }
    if (viewState && typeof viewState.scrollTop === "number") {
      this.scrollTop = viewState.scrollTop;
    }
  }
  async updateChildren(element = this.root.element, recursive = true, rerender = false, options) {
    await this._updateChildren(element, recursive, rerender, void 0, options);
  }
  cancelAllRefreshPromises(includeSubTrees = false) {
    this.refreshPromises.forEach((promise) => promise.cancel());
    this.refreshPromises.clear();
    if (includeSubTrees) {
      this.subTreeRefreshPromises.forEach((promise) => promise.cancel());
      this.subTreeRefreshPromises.clear();
    }
  }
  async _updateChildren(element = this.root.element, recursive = true, rerender = false, viewStateContext, options) {
    if (typeof this.root.element === "undefined") {
      throw new TreeError(this.user, "Tree input not set");
    }
    if (this.root.refreshPromise) {
      await this.root.refreshPromise;
      await Event.toPromise(this._onDidRender.event);
    }
    const node = this.getDataNode(element);
    await this.refreshAndRenderNode(node, recursive, viewStateContext, options);
    if (rerender) {
      try {
        this.tree.rerender(node);
      } catch {
      }
    }
  }
  resort(element = this.root.element, recursive = true) {
    this.tree.resort(this.getDataNode(element), recursive);
  }
  hasNode(element) {
    if (element === this.root.element) {
      return true;
    }
    const node = this.nodes.get(element);
    if (!node) {
      return false;
    }
    return this.tree.hasElement(node);
  }
  // View
  rerender(element) {
    if (element === void 0 || element === this.root.element) {
      this.tree.rerender();
      return;
    }
    const node = this.getDataNode(element);
    this.tree.rerender(node);
  }
  updateElementHeight(element, height) {
    const node = this.getDataNode(element);
    this.tree.updateElementHeight(node, height);
  }
  updateWidth(element) {
    const node = this.getDataNode(element);
    this.tree.updateWidth(node);
  }
  // Tree
  getNode(element = this.root.element) {
    const dataNode = this.getDataNode(element);
    const node = this.tree.getNode(dataNode === this.root ? null : dataNode);
    return this.nodeMapper.map(node);
  }
  collapse(element, recursive = false) {
    const node = this.getDataNode(element);
    return this.tree.collapse(node === this.root ? null : node, recursive);
  }
  async expand(element, recursive = false) {
    if (typeof this.root.element === "undefined") {
      throw new TreeError(this.user, "Tree input not set");
    }
    if (this.root.refreshPromise) {
      await this.root.refreshPromise;
      await Event.toPromise(this._onDidRender.event);
    }
    const node = this.getDataNode(element);
    if (this.tree.hasElement(node) && !this.tree.isCollapsible(node)) {
      return false;
    }
    if (node.refreshPromise) {
      await node.refreshPromise;
      await Event.toPromise(this._onDidRender.event);
    }
    if (node !== this.root && !node.refreshPromise && !this.tree.isCollapsed(node)) {
      return false;
    }
    const result = this.tree.expand(node === this.root ? null : node, recursive);
    if (node.refreshPromise) {
      await node.refreshPromise;
      await Event.toPromise(this._onDidRender.event);
    }
    return result;
  }
  toggleCollapsed(element, recursive = false) {
    return this.tree.toggleCollapsed(this.getDataNode(element), recursive);
  }
  expandAll() {
    this.tree.expandAll();
  }
  async expandTo(element) {
    if (!this.dataSource.getParent) {
      throw new Error("Can't expand to element without getParent method");
    }
    const elements = [];
    while (!this.hasNode(element)) {
      element = this.dataSource.getParent(element);
      if (element !== this.root.element) {
        elements.push(element);
      }
    }
    for (const element2 of Iterable.reverse(elements)) {
      await this.expand(element2);
    }
    this.tree.expandTo(this.getDataNode(element));
  }
  collapseAll() {
    this.tree.collapseAll();
  }
  isCollapsible(element) {
    return this.tree.isCollapsible(this.getDataNode(element));
  }
  isCollapsed(element) {
    return this.tree.isCollapsed(this.getDataNode(element));
  }
  triggerTypeNavigation() {
    this.tree.triggerTypeNavigation();
  }
  openFind() {
    if (this.findController) {
      this.findController.open();
    } else {
      this.tree.openFind();
    }
  }
  closeFind() {
    if (this.findController) {
      this.findController.close();
    } else {
      this.tree.closeFind();
    }
  }
  refilter() {
    this.tree.refilter();
  }
  setAnchor(element) {
    this.tree.setAnchor(typeof element === "undefined" ? void 0 : this.getDataNode(element));
  }
  getAnchor() {
    const node = this.tree.getAnchor();
    return node?.element;
  }
  setSelection(elements, browserEvent) {
    const nodes = elements.map((e) => this.getDataNode(e));
    this.tree.setSelection(nodes, browserEvent);
  }
  getSelection() {
    const nodes = this.tree.getSelection();
    return nodes.map((n) => n.element);
  }
  setFocus(elements, browserEvent) {
    const nodes = elements.map((e) => this.getDataNode(e));
    this.tree.setFocus(nodes, browserEvent);
  }
  focusNext(n = 1, loop = false, browserEvent) {
    this.tree.focusNext(n, loop, browserEvent, this.focusNavigationFilter);
  }
  focusPrevious(n = 1, loop = false, browserEvent) {
    this.tree.focusPrevious(n, loop, browserEvent, this.focusNavigationFilter);
  }
  focusNextPage(browserEvent) {
    return this.tree.focusNextPage(browserEvent, this.focusNavigationFilter);
  }
  focusPreviousPage(browserEvent) {
    return this.tree.focusPreviousPage(browserEvent, this.focusNavigationFilter);
  }
  focusLast(browserEvent) {
    this.tree.focusLast(browserEvent, this.focusNavigationFilter);
  }
  focusFirst(browserEvent) {
    this.tree.focusFirst(browserEvent, this.focusNavigationFilter);
  }
  getFocus() {
    const nodes = this.tree.getFocus();
    return nodes.map((n) => n.element);
  }
  getStickyScrollFocus() {
    const nodes = this.tree.getStickyScrollFocus();
    return nodes.map((n) => n.element);
  }
  getFocusedPart() {
    return this.tree.getFocusedPart();
  }
  reveal(element, relativeTop) {
    this.tree.reveal(this.getDataNode(element), relativeTop);
  }
  getRelativeTop(element) {
    return this.tree.getRelativeTop(this.getDataNode(element));
  }
  // Tree navigation
  getParentElement(element) {
    const node = this.tree.getParentElement(this.getDataNode(element));
    return node && node.element;
  }
  getFirstElementChild(element = this.root.element) {
    const dataNode = this.getDataNode(element);
    const node = this.tree.getFirstElementChild(dataNode === this.root ? null : dataNode);
    return node && node.element;
  }
  // Implementation
  getDataNode(element) {
    const node = this.nodes.get(element === this.root.element ? null : element);
    if (!node) {
      const nodeIdentity = this.identityProvider?.getId(element).toString();
      throw new TreeError(this.user, `Data tree node not found${nodeIdentity ? `: ${nodeIdentity}` : ""}`);
    }
    return node;
  }
  async refreshAndRenderNode(node, recursive, viewStateContext, options) {
    if (this.disposables.isDisposed) {
      return;
    }
    await this.refreshNode(node, recursive, viewStateContext);
    if (this.disposables.isDisposed) {
      return;
    }
    this.render(node, viewStateContext, options);
  }
  async refreshNode(node, recursive, viewStateContext) {
    let result;
    this.subTreeRefreshPromises.forEach((refreshPromise, refreshNode) => {
      if (!result && intersects(refreshNode, node)) {
        result = refreshPromise.then(() => this.refreshNode(node, recursive, viewStateContext));
      }
    });
    if (result) {
      return result;
    }
    if (node !== this.root) {
      const treeNode = this.tree.getNode(node);
      if (treeNode.collapsed) {
        node.hasChildren = !!this.dataSource.hasChildren(node.element);
        node.stale = true;
        this.setChildren(node, [], recursive, viewStateContext);
        return;
      }
    }
    return this.doRefreshSubTree(node, recursive, viewStateContext);
  }
  async doRefreshSubTree(node, recursive, viewStateContext) {
    const cancelablePromise = createCancelablePromise(async () => {
      const childrenToRefresh = await this.doRefreshNode(node, recursive, viewStateContext);
      node.stale = false;
      await Promises.settled(childrenToRefresh.map((child) => this.doRefreshSubTree(child, recursive, viewStateContext)));
    });
    node.refreshPromise = cancelablePromise;
    this.subTreeRefreshPromises.set(node, cancelablePromise);
    cancelablePromise.finally(() => {
      node.refreshPromise = void 0;
      this.subTreeRefreshPromises.delete(node);
    });
    return cancelablePromise;
  }
  async doRefreshNode(node, recursive, viewStateContext) {
    node.hasChildren = !!this.dataSource.hasChildren(node.element);
    let childrenPromise;
    if (!node.hasChildren) {
      childrenPromise = Promise.resolve(Iterable.empty());
    } else {
      const children = this.doGetChildren(node);
      if (isIterable(children)) {
        childrenPromise = Promise.resolve(children);
      } else {
        const slowTimeout = timeout(800);
        slowTimeout.then(() => {
          node.slow = true;
          this._onDidChangeNodeSlowState.fire(node);
        }, (_) => null);
        childrenPromise = children.finally(() => slowTimeout.cancel());
      }
    }
    try {
      const children = await childrenPromise;
      return this.setChildren(node, children, recursive, viewStateContext);
    } catch (err) {
      if (node !== this.root && this.tree.hasElement(node)) {
        this.tree.collapse(node);
      }
      if (isCancellationError(err)) {
        return [];
      }
      throw err;
    } finally {
      if (node.slow) {
        node.slow = false;
        this._onDidChangeNodeSlowState.fire(node);
      }
    }
  }
  doGetChildren(node) {
    let result = this.refreshPromises.get(node);
    if (result) {
      return result;
    }
    const children = this.dataSource.getChildren(node.element);
    if (isIterable(children)) {
      return this.processChildren(children);
    } else {
      result = createCancelablePromise(async () => this.processChildren(await children));
      this.refreshPromises.set(node, result);
      return result.finally(() => {
        this.refreshPromises.delete(node);
      });
    }
  }
  _onDidChangeCollapseState({ node, deep }) {
    if (node.element === null) {
      return;
    }
    if (!node.collapsed && node.element.stale) {
      if (deep) {
        this.collapse(node.element.element);
      } else {
        this.refreshAndRenderNode(node.element, false).catch(onUnexpectedError);
      }
    }
  }
  setChildren(node, childrenElementsIterable, recursive, viewStateContext) {
    const childrenElements = [...childrenElementsIterable];
    if (node.children.length === 0 && childrenElements.length === 0) {
      return [];
    }
    const nodesToForget = /* @__PURE__ */ new Map();
    const childrenTreeNodesById = /* @__PURE__ */ new Map();
    for (const child of node.children) {
      nodesToForget.set(child.element, child);
      if (this.identityProvider) {
        childrenTreeNodesById.set(child.id, { node: child, collapsed: this.tree.hasElement(child) && this.tree.isCollapsed(child) });
      }
    }
    const childrenToRefresh = [];
    const children = childrenElements.map((element) => {
      const hasChildren = !!this.dataSource.hasChildren(element);
      if (!this.identityProvider) {
        const asyncDataTreeNode = createAsyncDataTreeNode({ element, parent: node, hasChildren, defaultCollapseState: this.getDefaultCollapseState(element) });
        if (hasChildren && asyncDataTreeNode.defaultCollapseState === ObjectTreeElementCollapseState.PreserveOrExpanded) {
          childrenToRefresh.push(asyncDataTreeNode);
        }
        return asyncDataTreeNode;
      }
      const id = this.identityProvider.getId(element).toString();
      const result = childrenTreeNodesById.get(id);
      if (result) {
        const asyncDataTreeNode = result.node;
        nodesToForget.delete(asyncDataTreeNode.element);
        this.nodes.delete(asyncDataTreeNode.element);
        this.nodes.set(element, asyncDataTreeNode);
        asyncDataTreeNode.element = element;
        asyncDataTreeNode.hasChildren = hasChildren;
        if (recursive) {
          if (result.collapsed) {
            asyncDataTreeNode.children.forEach((node2) => dfs(node2, (node3) => this.nodes.delete(node3.element)));
            asyncDataTreeNode.children.splice(0, asyncDataTreeNode.children.length);
            asyncDataTreeNode.stale = true;
          } else {
            childrenToRefresh.push(asyncDataTreeNode);
          }
        } else if (hasChildren && !result.collapsed) {
          childrenToRefresh.push(asyncDataTreeNode);
        }
        return asyncDataTreeNode;
      }
      const childAsyncDataTreeNode = createAsyncDataTreeNode({ element, parent: node, id, hasChildren, defaultCollapseState: this.getDefaultCollapseState(element) });
      if (viewStateContext && viewStateContext.viewState.focus && viewStateContext.viewState.focus.indexOf(id) > -1) {
        viewStateContext.focus.push(childAsyncDataTreeNode);
      }
      if (viewStateContext && viewStateContext.viewState.selection && viewStateContext.viewState.selection.indexOf(id) > -1) {
        viewStateContext.selection.push(childAsyncDataTreeNode);
      }
      if (viewStateContext && viewStateContext.viewState.expanded && viewStateContext.viewState.expanded.indexOf(id) > -1) {
        childrenToRefresh.push(childAsyncDataTreeNode);
      } else if (hasChildren && childAsyncDataTreeNode.defaultCollapseState === ObjectTreeElementCollapseState.PreserveOrExpanded) {
        childrenToRefresh.push(childAsyncDataTreeNode);
      }
      return childAsyncDataTreeNode;
    });
    for (const node2 of nodesToForget.values()) {
      dfs(node2, (node3) => this.nodes.delete(node3.element));
    }
    for (const child of children) {
      this.nodes.set(child.element, child);
    }
    splice(node.children, 0, node.children.length, children);
    if (node !== this.root && this.autoExpandSingleChildren && children.length === 1 && childrenToRefresh.length === 0) {
      children[0].forceExpanded = true;
      childrenToRefresh.push(children[0]);
    }
    return childrenToRefresh;
  }
  render(node, viewStateContext, options) {
    const children = node.children.map((node2) => this.asTreeElement(node2, viewStateContext));
    const objectTreeOptions = options && {
      ...options,
      diffIdentityProvider: options.diffIdentityProvider && {
        getId(node2) {
          return options.diffIdentityProvider.getId(node2.element);
        },
        getGroupId: options.diffIdentityProvider.getGroupId ? (node2) => {
          return options.diffIdentityProvider.getGroupId(node2.element);
        } : void 0
      }
    };
    this.tree.setChildren(node === this.root ? null : node, children, objectTreeOptions);
    if (node !== this.root) {
      this.tree.setCollapsible(node, node.hasChildren);
    }
    this._onDidRender.fire();
  }
  asTreeElement(node, viewStateContext) {
    if (node.stale) {
      return {
        element: node,
        collapsible: node.hasChildren,
        collapsed: true
      };
    }
    let collapsed;
    if (viewStateContext && viewStateContext.viewState.expanded && node.id && viewStateContext.viewState.expanded.indexOf(node.id) > -1) {
      collapsed = false;
    } else if (node.forceExpanded) {
      collapsed = false;
      node.forceExpanded = false;
    } else {
      collapsed = node.defaultCollapseState;
    }
    return {
      element: node,
      children: node.hasChildren ? Iterable.map(node.children, (child) => this.asTreeElement(child, viewStateContext)) : [],
      collapsible: node.hasChildren,
      collapsed
    };
  }
  processChildren(children) {
    if (this.sorter) {
      children = [...children].sort(this.sorter.compare.bind(this.sorter));
    }
    return children;
  }
  // view state
  getViewState() {
    if (!this.identityProvider) {
      throw new TreeError(this.user, "Can't get tree view state without an identity provider");
    }
    const getId = (element) => this.identityProvider.getId(element).toString();
    const focus = this.getFocus().map(getId);
    const selection = this.getSelection().map(getId);
    const expanded = [];
    const root = this.tree.getNode();
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      if (node !== root && node.collapsible && !node.collapsed) {
        expanded.push(getId(node.element.element));
      }
      insertInto(stack, stack.length, node.children);
    }
    return { focus, selection, expanded, scrollTop: this.scrollTop };
  }
  dispose() {
    this._onDidRender.dispose();
    this._onDidChangeNodeSlowState.dispose();
    this.disposables.dispose();
    this.tree.dispose();
  }
}
class CompressibleAsyncDataTreeNodeWrapper {
  constructor(node) {
    this.node = node;
  }
  get element() {
    return {
      elements: this.node.element.elements.map((e) => e.element),
      incompressible: this.node.element.incompressible
    };
  }
  get children() {
    return this.node.children.map((node) => new CompressibleAsyncDataTreeNodeWrapper(node));
  }
  get depth() {
    return this.node.depth;
  }
  get visibleChildrenCount() {
    return this.node.visibleChildrenCount;
  }
  get visibleChildIndex() {
    return this.node.visibleChildIndex;
  }
  get collapsible() {
    return this.node.collapsible;
  }
  get collapsed() {
    return this.node.collapsed;
  }
  get visible() {
    return this.node.visible;
  }
  get filterData() {
    return this.node.filterData;
  }
}
class CompressibleAsyncDataTreeRenderer {
  constructor(renderer, nodeMapper, compressibleNodeMapperProvider, onDidChangeTwistieState) {
    this.renderer = renderer;
    this.nodeMapper = nodeMapper;
    this.compressibleNodeMapperProvider = compressibleNodeMapperProvider;
    this.onDidChangeTwistieState = onDidChangeTwistieState;
    this.renderedNodes = /* @__PURE__ */ new Map();
    this.disposables = [];
    this.templateId = renderer.templateId;
  }
  renderTemplate(container) {
    const templateData = this.renderer.renderTemplate(container);
    return { templateData };
  }
  renderElement(node, index, templateData, details) {
    this.renderer.renderElement(this.nodeMapper.map(node), index, templateData.templateData, details);
  }
  renderCompressedElements(node, index, templateData, details) {
    this.renderer.renderCompressedElements(this.compressibleNodeMapperProvider().map(node), index, templateData.templateData, details);
  }
  renderTwistie(element, twistieElement) {
    if (element.slow) {
      twistieElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.treeItemLoading));
      return true;
    } else {
      twistieElement.classList.remove(...ThemeIcon.asClassNameArray(Codicon.treeItemLoading));
      return false;
    }
  }
  disposeElement(node, index, templateData, details) {
    this.renderer.disposeElement?.(this.nodeMapper.map(node), index, templateData.templateData, details);
  }
  disposeCompressedElements(node, index, templateData, details) {
    this.renderer.disposeCompressedElements?.(this.compressibleNodeMapperProvider().map(node), index, templateData.templateData, details);
  }
  disposeTemplate(templateData) {
    this.renderer.disposeTemplate(templateData.templateData);
  }
  dispose() {
    this.renderedNodes.clear();
    this.disposables = dispose(this.disposables);
  }
}
function asCompressibleObjectTreeOptions(options) {
  const objectTreeOptions = options && asObjectTreeOptions(options);
  return objectTreeOptions && {
    ...objectTreeOptions,
    keyboardNavigationLabelProvider: objectTreeOptions.keyboardNavigationLabelProvider && {
      ...objectTreeOptions.keyboardNavigationLabelProvider,
      getCompressedNodeKeyboardNavigationLabel(els) {
        return options.keyboardNavigationLabelProvider.getCompressedNodeKeyboardNavigationLabel(els.map((e) => e.element));
      }
    },
    stickyScrollDelegate: objectTreeOptions.stickyScrollDelegate
  };
}
class CompressibleAsyncDataTree extends AsyncDataTree {
  constructor(user, container, virtualDelegate, compressionDelegate, renderers, dataSource, options = {}) {
    super(user, container, virtualDelegate, renderers, dataSource, options);
    this.compressionDelegate = compressionDelegate;
    this.compressibleNodeMapper = new WeakMapper((node) => new CompressibleAsyncDataTreeNodeWrapper(node));
    this.filter = options.filter;
  }
  getCompressedTreeNode(e) {
    const node = this.getDataNode(e);
    return this.tree.getCompressedTreeNode(node).element;
  }
  createTree(user, container, delegate, renderers, options) {
    const objectTreeDelegate = new ComposedTreeDelegate(delegate);
    const objectTreeRenderers = renderers.map((r) => new CompressibleAsyncDataTreeRenderer(r, this.nodeMapper, () => this.compressibleNodeMapper, this._onDidChangeNodeSlowState.event));
    const objectTreeOptions = asCompressibleObjectTreeOptions(options) || {};
    return new CompressibleObjectTree(user, container, objectTreeDelegate, objectTreeRenderers, objectTreeOptions);
  }
  asTreeElement(node, viewStateContext) {
    return {
      incompressible: this.compressionDelegate.isIncompressible(node.element),
      ...super.asTreeElement(node, viewStateContext)
    };
  }
  getViewState() {
    if (!this.identityProvider) {
      throw new TreeError(this.user, "Can't get tree view state without an identity provider");
    }
    const getId = (element) => this.identityProvider.getId(element).toString();
    const focus = this.getFocus().map(getId);
    const selection = this.getSelection().map(getId);
    const expanded = [];
    const root = this.tree.getCompressedTreeNode();
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      if (node !== root && node.collapsible && !node.collapsed) {
        for (const asyncNode of node.element.elements) {
          expanded.push(getId(asyncNode.element));
        }
      }
      stack.push(...node.children);
    }
    return { focus, selection, expanded, scrollTop: this.scrollTop };
  }
  render(node, viewStateContext, options) {
    if (!this.identityProvider) {
      return super.render(node, viewStateContext);
    }
    const getId = (element) => this.identityProvider.getId(element).toString();
    const getUncompressedIds = (nodes) => {
      const result = /* @__PURE__ */ new Set();
      for (const node2 of nodes) {
        const compressedNode = this.tree.getCompressedTreeNode(node2 === this.root ? null : node2);
        if (!compressedNode.element) {
          continue;
        }
        for (const node3 of compressedNode.element.elements) {
          result.add(getId(node3.element));
        }
      }
      return result;
    };
    const oldSelection = getUncompressedIds(this.tree.getSelection());
    const oldFocus = getUncompressedIds(this.tree.getFocus());
    super.render(node, viewStateContext, options);
    const selection = this.getSelection();
    let didChangeSelection = false;
    const focus = this.getFocus();
    let didChangeFocus = false;
    const visit = (node2) => {
      const compressedNode = node2.element;
      if (compressedNode) {
        for (let i = 0; i < compressedNode.elements.length; i++) {
          const id = getId(compressedNode.elements[i].element);
          const element = compressedNode.elements[compressedNode.elements.length - 1].element;
          if (oldSelection.has(id) && selection.indexOf(element) === -1) {
            selection.push(element);
            didChangeSelection = true;
          }
          if (oldFocus.has(id) && focus.indexOf(element) === -1) {
            focus.push(element);
            didChangeFocus = true;
          }
        }
      }
      node2.children.forEach(visit);
    };
    visit(this.tree.getCompressedTreeNode(node === this.root ? null : node));
    if (didChangeSelection) {
      this.setSelection(selection);
    }
    if (didChangeFocus) {
      this.setFocus(focus);
    }
  }
  // For compressed async data trees, `TreeVisibility.Recurse` doesn't currently work
  // and we have to filter everything beforehand
  // Related to #85193 and #85835
  processChildren(children) {
    if (this.filter) {
      children = Iterable.filter(children, (e) => {
        const result = this.filter.filter(e, TreeVisibility.Visible);
        const visibility = getVisibility(result);
        if (visibility === TreeVisibility.Recurse) {
          throw new Error("Recursive tree visibility not supported in async data compressed trees");
        }
        return visibility === TreeVisibility.Visible;
      });
    }
    return super.processChildren(children);
  }
  navigate(start) {
    return super.navigate(start);
  }
}
function getVisibility(filterResult) {
  if (typeof filterResult === "boolean") {
    return filterResult ? TreeVisibility.Visible : TreeVisibility.Hidden;
  } else if (isFilterResult(filterResult)) {
    return getVisibleState(filterResult.visibility);
  } else {
    return getVisibleState(filterResult);
  }
}
class AsyncDataTreeNavigator {
  constructor(navigator) {
    this.navigator = navigator;
  }
  current() {
    const current = this.navigator.current();
    if (current === null) {
      return null;
    }
    return current.element;
  }
  previous() {
    this.navigator.previous();
    return this.current();
  }
  first() {
    this.navigator.first();
    return this.current();
  }
  last() {
    this.navigator.last();
    return this.current();
  }
  next() {
    this.navigator.next();
    return this.current();
  }
}
export {
  AsyncDataTree,
  CompressibleAsyncDataTree
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFx1aVxcdHJlZVxcYXN5bmNEYXRhVHJlZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElEcmFnQW5kRHJvcERhdGEgfSBmcm9tICcuLi8uLi9kbmQuanMnO1xuaW1wb3J0IHsgSUlkZW50aXR5UHJvdmlkZXIsIElLZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyLCBJTGlzdERyYWdBbmREcm9wLCBJTGlzdERyYWdPdmVyUmVhY3Rpb24sIElMaXN0TW91c2VFdmVudCwgSUxpc3RUb3VjaEV2ZW50LCBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSwgTm90U2VsZWN0YWJsZUdyb3VwSWRUeXBlIH0gZnJvbSAnLi4vbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhLCBMaXN0Vmlld1RhcmdldFNlY3RvciB9IGZyb20gJy4uL2xpc3QvbGlzdFZpZXcuanMnO1xuaW1wb3J0IHsgSUxpc3RTdHlsZXMgfSBmcm9tICcuLi9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgQ29tcG9zZWRUcmVlRGVsZWdhdGUsIFRyZWVGaW5kTW9kZSwgSUFic3RyYWN0VHJlZU9wdGlvbnMsIElBYnN0cmFjdFRyZWVPcHRpb25zVXBkYXRlLCBUcmVlRmluZE1hdGNoVHlwZSwgQWJzdHJhY3RUcmVlUGFydCwgTGFiZWxGdXp6eVNjb3JlLCBGaW5kRmlsdGVyLCBGaW5kQ29udHJvbGxlciwgSVRyZWVGaW5kVG9nZ2xlQ2hhbmdlRXZlbnQsIElGaW5kQ29udHJvbGxlck9wdGlvbnMsIElTdGlja3lTY3JvbGxEZWxlZ2F0ZSwgQWJzdHJhY3RUcmVlIH0gZnJvbSAnLi9hYnN0cmFjdFRyZWUuanMnO1xuaW1wb3J0IHsgSUNvbXByZXNzZWRUcmVlRWxlbWVudCwgSUNvbXByZXNzZWRUcmVlTm9kZSB9IGZyb20gJy4vY29tcHJlc3NlZE9iamVjdFRyZWVNb2RlbC5qcyc7XG5pbXBvcnQgeyBnZXRWaXNpYmxlU3RhdGUsIGlzRmlsdGVyUmVzdWx0IH0gZnJvbSAnLi9pbmRleFRyZWVNb2RlbC5qcyc7XG5pbXBvcnQgeyBDb21wcmVzc2libGVPYmplY3RUcmVlLCBJQ29tcHJlc3NpYmxlS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlciwgSUNvbXByZXNzaWJsZU9iamVjdFRyZWVPcHRpb25zLCBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyLCBJT2JqZWN0VHJlZU9wdGlvbnMsIElPYmplY3RUcmVlU2V0Q2hpbGRyZW5PcHRpb25zLCBPYmplY3RUcmVlIH0gZnJvbSAnLi9vYmplY3RUcmVlLmpzJztcbmltcG9ydCB7IElBc3luY0RhdGFTb3VyY2UsIElDb2xsYXBzZVN0YXRlQ2hhbmdlRXZlbnQsIElPYmplY3RUcmVlRWxlbWVudCwgSVRyZWVDb250ZXh0TWVudUV2ZW50LCBJVHJlZURyYWdBbmREcm9wLCBJVHJlZUVsZW1lbnRSZW5kZXJEZXRhaWxzLCBJVHJlZUV2ZW50LCBJVHJlZUZpbHRlciwgSVRyZWVNb3VzZUV2ZW50LCBJVHJlZU5hdmlnYXRvciwgSVRyZWVOb2RlLCBJVHJlZVJlbmRlcmVyLCBJVHJlZVNvcnRlciwgT2JqZWN0VHJlZUVsZW1lbnRDb2xsYXBzZVN0YXRlLCBUcmVlRXJyb3IsIFRyZWVGaWx0ZXJSZXN1bHQsIFRyZWVWaXNpYmlsaXR5LCBXZWFrTWFwcGVyIH0gZnJvbSAnLi90cmVlLmpzJztcbmltcG9ydCB7IENhbmNlbGFibGVQcm9taXNlLCBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSwgUHJvbWlzZXMsIFRocm90dGxlZERlbGF5ZXIsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IsIG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIGRpc3Bvc2UsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjcm9sbEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0IHsgaXNJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1Byb3ZpZGVyIH0gZnJvbSAnLi4vY29udGV4dHZpZXcvY29udGV4dHZpZXcuanMnO1xuaW1wb3J0IHsgRnV6enlTY29yZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IGluc2VydEludG8sIHNwbGljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+IHtcblx0ZWxlbWVudDogVElucHV0IHwgVDtcblx0cmVhZG9ubHkgcGFyZW50OiBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiB8IG51bGw7XG5cdHJlYWRvbmx5IGNoaWxkcmVuOiBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPltdO1xuXHRyZWFkb25seSBpZD86IHN0cmluZyB8IG51bGw7XG5cdHJlZnJlc2hQcm9taXNlOiBDYW5jZWxhYmxlUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0aGFzQ2hpbGRyZW46IGJvb2xlYW47XG5cdHN0YWxlOiBib29sZWFuO1xuXHRzbG93OiBib29sZWFuO1xuXHRyZWFkb25seSBkZWZhdWx0Q29sbGFwc2VTdGF0ZTogdW5kZWZpbmVkIHwgT2JqZWN0VHJlZUVsZW1lbnRDb2xsYXBzZVN0YXRlLlByZXNlcnZlT3JDb2xsYXBzZWQgfCBPYmplY3RUcmVlRWxlbWVudENvbGxhcHNlU3RhdGUuUHJlc2VydmVPckV4cGFuZGVkO1xuXHRmb3JjZUV4cGFuZGVkOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgSUFzeW5jRGF0YVRyZWVOb2RlUmVxdWlyZWRQcm9wczxUSW5wdXQsIFQ+IGV4dGVuZHMgUGFydGlhbDxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPj4ge1xuXHRyZWFkb25seSBlbGVtZW50OiBUSW5wdXQgfCBUO1xuXHRyZWFkb25seSBwYXJlbnQ6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+IHwgbnVsbDtcblx0cmVhZG9ubHkgaGFzQ2hpbGRyZW46IGJvb2xlYW47XG5cdHJlYWRvbmx5IGRlZmF1bHRDb2xsYXBzZVN0YXRlOiB1bmRlZmluZWQgfCBPYmplY3RUcmVlRWxlbWVudENvbGxhcHNlU3RhdGUuUHJlc2VydmVPckNvbGxhcHNlZCB8IE9iamVjdFRyZWVFbGVtZW50Q29sbGFwc2VTdGF0ZS5QcmVzZXJ2ZU9yRXhwYW5kZWQ7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4ocHJvcHM6IElBc3luY0RhdGFUcmVlTm9kZVJlcXVpcmVkUHJvcHM8VElucHV0LCBUPik6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+IHtcblx0cmV0dXJuIHtcblx0XHQuLi5wcm9wcyxcblx0XHRjaGlsZHJlbjogW10sXG5cdFx0cmVmcmVzaFByb21pc2U6IHVuZGVmaW5lZCxcblx0XHRzdGFsZTogdHJ1ZSxcblx0XHRzbG93OiBmYWxzZSxcblx0XHRmb3JjZUV4cGFuZGVkOiBmYWxzZVxuXHR9O1xufVxuXG5mdW5jdGlvbiBpc0FuY2VzdG9yPFRJbnB1dCwgVD4oYW5jZXN0b3I6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+LCBkZXNjZW5kYW50OiBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPik6IGJvb2xlYW4ge1xuXHRpZiAoIWRlc2NlbmRhbnQucGFyZW50KSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9IGVsc2UgaWYgKGRlc2NlbmRhbnQucGFyZW50ID09PSBhbmNlc3Rvcikge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBpc0FuY2VzdG9yKGFuY2VzdG9yLCBkZXNjZW5kYW50LnBhcmVudCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gaW50ZXJzZWN0czxUSW5wdXQsIFQ+KG5vZGU6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+LCBvdGhlcjogSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4pOiBib29sZWFuIHtcblx0cmV0dXJuIG5vZGUgPT09IG90aGVyIHx8IGlzQW5jZXN0b3Iobm9kZSwgb3RoZXIpIHx8IGlzQW5jZXN0b3Iob3RoZXIsIG5vZGUpO1xufVxuXG5pbnRlcmZhY2UgSURhdGFUcmVlTGlzdFRlbXBsYXRlRGF0YTxUPiB7XG5cdHRlbXBsYXRlRGF0YTogVDtcbn1cblxudHlwZSBBc3luY0RhdGFUcmVlTm9kZU1hcHBlcjxUSW5wdXQsIFQsIFRGaWx0ZXJEYXRhPiA9IFdlYWtNYXBwZXI8SVRyZWVOb2RlPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+IHwgbnVsbCwgVEZpbHRlckRhdGE+LCBJVHJlZU5vZGU8VElucHV0IHwgVCwgVEZpbHRlckRhdGE+PjtcblxuY2xhc3MgQXN5bmNEYXRhVHJlZU5vZGVXcmFwcGVyPFRJbnB1dCwgVCwgVEZpbHRlckRhdGE+IGltcGxlbWVudHMgSVRyZWVOb2RlPFRJbnB1dCB8IFQsIFRGaWx0ZXJEYXRhPiB7XG5cblx0Z2V0IGVsZW1lbnQoKTogVCB7IHJldHVybiB0aGlzLm5vZGUuZWxlbWVudCEuZWxlbWVudCBhcyBUOyB9XG5cdGdldCBjaGlsZHJlbigpOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+W10geyByZXR1cm4gdGhpcy5ub2RlLmNoaWxkcmVuLm1hcChub2RlID0+IG5ldyBBc3luY0RhdGFUcmVlTm9kZVdyYXBwZXIobm9kZSkpOyB9XG5cdGdldCBkZXB0aCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5ub2RlLmRlcHRoOyB9XG5cdGdldCB2aXNpYmxlQ2hpbGRyZW5Db3VudCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5ub2RlLnZpc2libGVDaGlsZHJlbkNvdW50OyB9XG5cdGdldCB2aXNpYmxlQ2hpbGRJbmRleCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5ub2RlLnZpc2libGVDaGlsZEluZGV4OyB9XG5cdGdldCBjb2xsYXBzaWJsZSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMubm9kZS5jb2xsYXBzaWJsZTsgfVxuXHRnZXQgY29sbGFwc2VkKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5ub2RlLmNvbGxhcHNlZDsgfVxuXHRnZXQgdmlzaWJsZSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMubm9kZS52aXNpYmxlOyB9XG5cdGdldCBmaWx0ZXJEYXRhKCk6IFRGaWx0ZXJEYXRhIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMubm9kZS5maWx0ZXJEYXRhOyB9XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBub2RlOiBJVHJlZU5vZGU8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4gfCBudWxsLCBURmlsdGVyRGF0YT4pIHsgfVxufVxuXG5jbGFzcyBBc3luY0RhdGFUcmVlUmVuZGVyZXI8VElucHV0LCBULCBURmlsdGVyRGF0YSwgVFRlbXBsYXRlRGF0YT4gaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+LCBURmlsdGVyRGF0YSwgSURhdGFUcmVlTGlzdFRlbXBsYXRlRGF0YTxUVGVtcGxhdGVEYXRhPj4ge1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZztcblx0cHJpdmF0ZSByZW5kZXJlZE5vZGVzID0gbmV3IE1hcDxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiwgSURhdGFUcmVlTGlzdFRlbXBsYXRlRGF0YTxUVGVtcGxhdGVEYXRhPj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgcmVuZGVyZXI6IElUcmVlUmVuZGVyZXI8VCwgVEZpbHRlckRhdGEsIFRUZW1wbGF0ZURhdGE+LFxuXHRcdHByb3RlY3RlZCBub2RlTWFwcGVyOiBBc3luY0RhdGFUcmVlTm9kZU1hcHBlcjxUSW5wdXQsIFQsIFRGaWx0ZXJEYXRhPixcblx0XHRyZWFkb25seSBvbkRpZENoYW5nZVR3aXN0aWVTdGF0ZTogRXZlbnQ8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4+XG5cdCkge1xuXHRcdHRoaXMudGVtcGxhdGVJZCA9IHJlbmRlcmVyLnRlbXBsYXRlSWQ7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSURhdGFUcmVlTGlzdFRlbXBsYXRlRGF0YTxUVGVtcGxhdGVEYXRhPiB7XG5cdFx0Y29uc3QgdGVtcGxhdGVEYXRhID0gdGhpcy5yZW5kZXJlci5yZW5kZXJUZW1wbGF0ZShjb250YWluZXIpO1xuXHRcdHJldHVybiB7IHRlbXBsYXRlRGF0YSB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4sIFRGaWx0ZXJEYXRhPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRGF0YVRyZWVMaXN0VGVtcGxhdGVEYXRhPFRUZW1wbGF0ZURhdGE+LCBkZXRhaWxzPzogSVRyZWVFbGVtZW50UmVuZGVyRGV0YWlscyk6IHZvaWQge1xuXHRcdHRoaXMucmVuZGVyZXIucmVuZGVyRWxlbWVudCh0aGlzLm5vZGVNYXBwZXIubWFwKG5vZGUpIGFzIElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4sIGluZGV4LCB0ZW1wbGF0ZURhdGEudGVtcGxhdGVEYXRhLCBkZXRhaWxzKTtcblx0fVxuXG5cdHJlbmRlclR3aXN0aWUoZWxlbWVudDogSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4sIHR3aXN0aWVFbGVtZW50OiBIVE1MRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRcdGlmIChlbGVtZW50LnNsb3cpIHtcblx0XHRcdHR3aXN0aWVFbGVtZW50LmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi50cmVlSXRlbUxvYWRpbmcpKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0d2lzdGllRWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24udHJlZUl0ZW1Mb2FkaW5nKSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+LCBURmlsdGVyRGF0YT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSURhdGFUcmVlTGlzdFRlbXBsYXRlRGF0YTxUVGVtcGxhdGVEYXRhPiwgZGV0YWlscz86IElUcmVlRWxlbWVudFJlbmRlckRldGFpbHMpOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlcmVyLmRpc3Bvc2VFbGVtZW50Py4odGhpcy5ub2RlTWFwcGVyLm1hcChub2RlKSBhcyBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+LCBpbmRleCwgdGVtcGxhdGVEYXRhLnRlbXBsYXRlRGF0YSwgZGV0YWlscyk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJRGF0YVRyZWVMaXN0VGVtcGxhdGVEYXRhPFRUZW1wbGF0ZURhdGE+KTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJlci5kaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhLnRlbXBsYXRlRGF0YSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMucmVuZGVyZWROb2Rlcy5jbGVhcigpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGFzVHJlZUV2ZW50PFRJbnB1dCwgVD4oZTogSVRyZWVFdmVudDxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiB8IG51bGw+KTogSVRyZWVFdmVudDxUPiB7XG5cdHJldHVybiB7XG5cdFx0YnJvd3NlckV2ZW50OiBlLmJyb3dzZXJFdmVudCxcblx0XHRlbGVtZW50czogZS5lbGVtZW50cy5tYXAoZSA9PiBlIS5lbGVtZW50IGFzIFQpXG5cdH07XG59XG5cbmZ1bmN0aW9uIGFzVHJlZU1vdXNlRXZlbnQ8VElucHV0LCBUPihlOiBJVHJlZU1vdXNlRXZlbnQ8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4gfCBudWxsPik6IElUcmVlTW91c2VFdmVudDxUPiB7XG5cdHJldHVybiB7XG5cdFx0YnJvd3NlckV2ZW50OiBlLmJyb3dzZXJFdmVudCxcblx0XHRlbGVtZW50OiBlLmVsZW1lbnQgJiYgZS5lbGVtZW50LmVsZW1lbnQgYXMgVCxcblx0XHR0YXJnZXQ6IGUudGFyZ2V0XG5cdH07XG59XG5cbmZ1bmN0aW9uIGFzVHJlZUNvbnRleHRNZW51RXZlbnQ8VElucHV0LCBUPihlOiBJVHJlZUNvbnRleHRNZW51RXZlbnQ8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4gfCBudWxsPik6IElUcmVlQ29udGV4dE1lbnVFdmVudDxUPiB7XG5cdHJldHVybiB7XG5cdFx0YnJvd3NlckV2ZW50OiBlLmJyb3dzZXJFdmVudCxcblx0XHRlbGVtZW50OiBlLmVsZW1lbnQgJiYgZS5lbGVtZW50LmVsZW1lbnQgYXMgVCxcblx0XHRhbmNob3I6IGUuYW5jaG9yLFxuXHRcdGlzU3RpY2t5U2Nyb2xsOiBlLmlzU3RpY2t5U2Nyb2xsXG5cdH07XG59XG5cbmNsYXNzIEFzeW5jRGF0YVRyZWVFbGVtZW50c0RyYWdBbmREcm9wRGF0YTxUSW5wdXQsIFQsIFRDb250ZXh0PiBleHRlbmRzIEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhPFQsIFRDb250ZXh0PiB7XG5cblx0b3ZlcnJpZGUgc2V0IGNvbnRleHQoY29udGV4dDogVENvbnRleHQgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLmRhdGEuY29udGV4dCA9IGNvbnRleHQ7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgY29udGV4dCgpOiBUQ29udGV4dCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZGF0YS5jb250ZXh0O1xuXHR9XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBkYXRhOiBFbGVtZW50c0RyYWdBbmREcm9wRGF0YTxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiwgVENvbnRleHQ+KSB7XG5cdFx0c3VwZXIoZGF0YS5lbGVtZW50cy5tYXAobm9kZSA9PiBub2RlLmVsZW1lbnQgYXMgVCkpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGFzQXN5bmNEYXRhVHJlZURyYWdBbmREcm9wRGF0YTxUSW5wdXQsIFQ+KGRhdGE6IElEcmFnQW5kRHJvcERhdGEpOiBJRHJhZ0FuZERyb3BEYXRhIHtcblx0aWYgKGRhdGEgaW5zdGFuY2VvZiBFbGVtZW50c0RyYWdBbmREcm9wRGF0YSkge1xuXHRcdHJldHVybiBuZXcgQXN5bmNEYXRhVHJlZUVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhKGRhdGEpO1xuXHR9XG5cblx0cmV0dXJuIGRhdGE7XG59XG5cbmNsYXNzIEFzeW5jRGF0YVRyZWVOb2RlTGlzdERyYWdBbmREcm9wPFRJbnB1dCwgVD4gaW1wbGVtZW50cyBJTGlzdERyYWdBbmREcm9wPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+PiB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBkbmQ6IElUcmVlRHJhZ0FuZERyb3A8VD4pIHsgfVxuXG5cdGdldERyYWdVUkkobm9kZTogSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4pOiBzdHJpbmcgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5kbmQuZ2V0RHJhZ1VSSShub2RlLmVsZW1lbnQgYXMgVCk7XG5cdH1cblxuXHRnZXREcmFnTGFiZWwobm9kZXM6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+W10sIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuZG5kLmdldERyYWdMYWJlbCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZG5kLmdldERyYWdMYWJlbChub2Rlcy5tYXAobm9kZSA9PiBub2RlLmVsZW1lbnQgYXMgVCksIG9yaWdpbmFsRXZlbnQpO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRvbkRyYWdTdGFydChkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLmRuZC5vbkRyYWdTdGFydD8uKGFzQXN5bmNEYXRhVHJlZURyYWdBbmREcm9wRGF0YShkYXRhKSwgb3JpZ2luYWxFdmVudCk7XG5cdH1cblxuXHRvbkRyYWdPdmVyKGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIHRhcmdldE5vZGU6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+IHwgdW5kZWZpbmVkLCB0YXJnZXRJbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkLCB0YXJnZXRTZWN0b3I6IExpc3RWaWV3VGFyZ2V0U2VjdG9yIHwgdW5kZWZpbmVkLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQsIHJhdyA9IHRydWUpOiBib29sZWFuIHwgSUxpc3REcmFnT3ZlclJlYWN0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5kbmQub25EcmFnT3Zlcihhc0FzeW5jRGF0YVRyZWVEcmFnQW5kRHJvcERhdGEoZGF0YSksIHRhcmdldE5vZGUgJiYgdGFyZ2V0Tm9kZS5lbGVtZW50IGFzIFQsIHRhcmdldEluZGV4LCB0YXJnZXRTZWN0b3IsIG9yaWdpbmFsRXZlbnQpO1xuXHR9XG5cblx0ZHJvcChkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCB0YXJnZXROb2RlOiBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiB8IHVuZGVmaW5lZCwgdGFyZ2V0SW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCwgdGFyZ2V0U2VjdG9yOiBMaXN0Vmlld1RhcmdldFNlY3RvciB8IHVuZGVmaW5lZCwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5kbmQuZHJvcChhc0FzeW5jRGF0YVRyZWVEcmFnQW5kRHJvcERhdGEoZGF0YSksIHRhcmdldE5vZGUgJiYgdGFyZ2V0Tm9kZS5lbGVtZW50IGFzIFQsIHRhcmdldEluZGV4LCB0YXJnZXRTZWN0b3IsIG9yaWdpbmFsRXZlbnQpO1xuXHR9XG5cblx0b25EcmFnRW5kKG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMuZG5kLm9uRHJhZ0VuZD8uKG9yaWdpbmFsRXZlbnQpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmRuZC5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQXN5bmNGaW5kVG9nZ2xlcyB7XG5cdG1hdGNoVHlwZTogVHJlZUZpbmRNYXRjaFR5cGU7XG5cdGZpbmRNb2RlOiBUcmVlRmluZE1vZGU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFzeW5jRmluZFJlc3VsdDxUPiB7XG5cdHdhcm5pbmdNZXNzYWdlPzogc3RyaW5nO1xuXHRtYXRjaENvdW50OiBudW1iZXI7XG5cdGlzTWF0Y2goZWxlbWVudDogVCk6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFzeW5jRmluZFByb3ZpZGVyPFQ+IHtcblx0LyoqXG5cdCAqIGBzdGFydFNlc3Npb25gIGlzIGNhbGxlZCB3aGVuIHRoZSB1c2VyIGVudGVycyB0aGUgZmlyc3QgY2hhcmFjdGVyIGluIHRoZSBmaW5kIHdpZGdldC5cblx0ICogVGhpcyBjYW4gYmUgdXNlZCB0byBhbGxvY2F0ZSBzb21lIHN0YXRlIHRvIHByZXNlcnZlIGZvciB0aGUgc2Vzc2lvbi5cblx0ICovXG5cdHN0YXJ0U2Vzc2lvbj8oKTogdm9pZDtcblxuXHQvKipcblx0ICogYGZpbmRgIGlzIGNhbGxlZCB3aGVuIHRoZSB1c2VyIHR5cGVzIG9uZSBvciBtb3JlIGNoYXJhY3RlciBpbnRvIHRoZSBmaW5kIGlucHV0LlxuXHQgKi9cblx0ZmluZChwYXR0ZXJuOiBzdHJpbmcsIHRvZ2dsZXM6IElBc3luY0ZpbmRUb2dnbGVzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElBc3luY0ZpbmRSZXN1bHQ8VD4gfCB1bmRlZmluZWQ+O1xuXG5cdC8qKlxuXHQgKiBgaXNWaXNpYmxlYCBpcyBjYWxsZWQgdG8gY2hlY2sgaWYgYW4gZWxlbWVudCBzaG91bGQgYmUgdmlzaWJsZS5cblx0ICogRm9yIGFuIGVsZW1lbnQgdG8gYmUgdmlzaWJsZSwgYWxsIGl0cyBhbmNlc3RvcnMgbXVzdCBhbHNvIGJlIHZpc2libGUgYW5kIHRoZSBsYWJlbCBtdXN0IG1hdGNoIHRoZSBmaW5kIHBhdHRlcm4uXG5cdCAqL1xuXHRpc1Zpc2libGU/KGVsZW1lbnQ6IFQpOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBFbmQgU2Vzc2lvbiBpcyBjYWxsZWQgd2hlbiB0aGUgdXNlciBlaXRoZXIgY2xvc2VzIHRoZSBmaW5kIHdpZGdldCBvciBoYXMgYW4gZW1wdHkgZmluZCBpbnB1dC5cblx0ICogVGhpcyBjYW4gYmUgdXNlZCB0byBkZWFsbG9jYXRlIGFueSBzdGF0ZSB0aGF0IHdhcyBhbGxvY2F0ZWQuXG5cdCAqL1xuXHRlbmRTZXNzaW9uPygpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5jbGFzcyBBc3luY0ZpbmRGaWx0ZXI8VD4gZXh0ZW5kcyBGaW5kRmlsdGVyPFQ+IHtcblxuXHRwdWJsaWMgaXNGaW5kU2Vzc2lvbkFjdGl2ZSA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBmaW5kUHJvdmlkZXI6IElBc3luY0ZpbmRQcm92aWRlcjxUPiwgLy8gcmVtb3ZlIHB1YmxpY1xuXHRcdGtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXI6IElLZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyPFQ+LFxuXHRcdGZpbHRlcjogSVRyZWVGaWx0ZXI8VCwgRnV6enlTY29yZT5cblx0KSB7XG5cdFx0c3VwZXIoa2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlciwgZmlsdGVyKTtcblx0fVxuXG5cdG92ZXJyaWRlIGZpbHRlcihlbGVtZW50OiBULCBwYXJlbnRWaXNpYmlsaXR5OiBUcmVlVmlzaWJpbGl0eSk6IFRyZWVGaWx0ZXJSZXN1bHQ8RnV6enlTY29yZSB8IExhYmVsRnV6enlTY29yZT4ge1xuXHRcdGNvbnN0IGZpbHRlclJlc3VsdCA9IHN1cGVyLmZpbHRlcihlbGVtZW50LCBwYXJlbnRWaXNpYmlsaXR5KTtcblxuXHRcdGlmICghdGhpcy5pc0ZpbmRTZXNzaW9uQWN0aXZlIHx8IHRoaXMuZmluZE1vZGUgPT09IFRyZWVGaW5kTW9kZS5IaWdobGlnaHQgfHwgIXRoaXMuZmluZFByb3ZpZGVyLmlzVmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuIGZpbHRlclJlc3VsdDtcblx0XHR9XG5cblx0XHRjb25zdCB2aXNpYmlsaXR5ID0gaXNGaWx0ZXJSZXN1bHQoZmlsdGVyUmVzdWx0KSA/IGZpbHRlclJlc3VsdC52aXNpYmlsaXR5IDogZmlsdGVyUmVzdWx0O1xuXHRcdGlmIChnZXRWaXNpYmxlU3RhdGUodmlzaWJpbGl0eSkgPT09IFRyZWVWaXNpYmlsaXR5LkhpZGRlbikge1xuXHRcdFx0cmV0dXJuIFRyZWVWaXNpYmlsaXR5LkhpZGRlbjtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5maW5kUHJvdmlkZXIuaXNWaXNpYmxlKGVsZW1lbnQpID8gZmlsdGVyUmVzdWx0IDogVHJlZVZpc2liaWxpdHkuSGlkZGVuO1xuXHR9XG5cbn1cblxuLy8gVE9ETyBGaXggdHlwZXNcbmNsYXNzIEFzeW5jRmluZENvbnRyb2xsZXI8VElucHV0LCBULCBURmlsdGVyRGF0YT4gZXh0ZW5kcyBGaW5kQ29udHJvbGxlcjxULCBURmlsdGVyRGF0YT4ge1xuXHRwcml2YXRlIGFjdGl2ZVRva2VuU291cmNlOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBhY3RpdmVGaW5kTWV0YWRhdGE6IElBc3luY0ZpbmRSZXN1bHQ8VD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYWN0aXZlU2Vzc2lvbiA9IGZhbHNlO1xuXHRwcml2YXRlIGFzeW5jV29ya0luUHJvZ3Jlc3MgPSBmYWxzZTtcblx0cHJpdmF0ZSB0YXNrUXVldWUgPSBuZXcgVGhyb3R0bGVkRGVsYXllcigyNTApO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHRyZWU6IE9iamVjdFRyZWU8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4sIFRGaWx0ZXJEYXRhPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGZpbmRQcm92aWRlcjogSUFzeW5jRmluZFByb3ZpZGVyPFQ+LFxuXHRcdHByb3RlY3RlZCBvdmVycmlkZSBmaWx0ZXI6IEFzeW5jRmluZEZpbHRlcjxUPixcblx0XHRjb250ZXh0Vmlld1Byb3ZpZGVyOiBJQ29udGV4dFZpZXdQcm92aWRlcixcblx0XHRvcHRpb25zOiBJQWJzdHJhY3RUcmVlT3B0aW9uczxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiwgVEZpbHRlckRhdGE+LFxuXHQpIHtcblx0XHRzdXBlcih0cmVlIGFzIHVua25vd24gYXMgQWJzdHJhY3RUcmVlPFQsIFRGaWx0ZXJEYXRhLCB1bmtub3duPiwgZmlsdGVyLCBjb250ZXh0Vmlld1Byb3ZpZGVyLCBvcHRpb25zKTtcblx0XHQvLyBBbHdheXMgbWFrZSBzdXJlIHRvIGVuZCB0aGUgc2Vzc2lvbiBiZWZvcmUgZGlzcG9zaW5nXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKGFzeW5jICgpID0+IHtcblx0XHRcdGlmICh0aGlzLmFjdGl2ZVNlc3Npb24pIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5maW5kUHJvdmlkZXIuZW5kU2Vzc2lvbj8uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFwcGx5UGF0dGVybihfcGF0dGVybjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJNZXNzYWdlKGZhbHNlKTtcblxuXHRcdHRoaXMuYWN0aXZlVG9rZW5Tb3VyY2U/LmNhbmNlbCgpO1xuXHRcdHRoaXMuYWN0aXZlVG9rZW5Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRcdHRoaXMudGFza1F1ZXVlLnRyaWdnZXIoKCkgPT4gdGhpcy5hcHBseVBhdHRlcm5Bc3luYygpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYXBwbHlQYXR0ZXJuQXN5bmMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdG9rZW4gPSB0aGlzLmFjdGl2ZVRva2VuU291cmNlPy50b2tlbjtcblx0XHRpZiAoIXRva2VuIHx8IHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHBhdHRlcm4gPSB0aGlzLnBhdHRlcm47XG5cblx0XHRpZiAocGF0dGVybiA9PT0gJycpIHtcblx0XHRcdGlmICh0aGlzLmFjdGl2ZVNlc3Npb24pIHtcblx0XHRcdFx0dGhpcy5hc3luY1dvcmtJblByb2dyZXNzID0gdHJ1ZTtcblx0XHRcdFx0YXdhaXQgdGhpcy5kZWFjdGl2YXRlRmluZFNlc3Npb24oKTtcblx0XHRcdFx0dGhpcy5hc3luY1dvcmtJblByb2dyZXNzID0gZmFsc2U7XG5cblx0XHRcdFx0aWYgKCF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHRoaXMuZmlsdGVyLnJlc2V0KCk7XG5cdFx0XHRcdFx0c3VwZXIuYXBwbHlQYXR0ZXJuKCcnKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5hY3RpdmVTZXNzaW9uKSB7XG5cdFx0XHR0aGlzLmFjdGl2YXRlRmluZFNlc3Npb24oKTtcblx0XHR9XG5cblx0XHR0aGlzLmFzeW5jV29ya0luUHJvZ3Jlc3MgPSB0cnVlO1xuXHRcdHRoaXMuYWN0aXZlRmluZE1ldGFkYXRhID0gdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgZmluZE1ldGFkYXRhID0gYXdhaXQgdGhpcy5maW5kUHJvdmlkZXIuZmluZChwYXR0ZXJuLCB7IG1hdGNoVHlwZTogdGhpcy5tYXRjaFR5cGUsIGZpbmRNb2RlOiB0aGlzLm1vZGUgfSwgdG9rZW4pO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCB8fCBmaW5kTWV0YWRhdGEgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuYXN5bmNXb3JrSW5Qcm9ncmVzcyA9IGZhbHNlO1xuXHRcdHRoaXMuYWN0aXZlRmluZE1ldGFkYXRhID0gZmluZE1ldGFkYXRhO1xuXG5cdFx0dGhpcy5maWx0ZXIucmVzZXQoKTtcblx0XHRzdXBlci5hcHBseVBhdHRlcm4ocGF0dGVybik7XG5cblx0XHRpZiAoZmluZE1ldGFkYXRhLndhcm5pbmdNZXNzYWdlKSB7XG5cdFx0XHR0aGlzLnJlbmRlck1lc3NhZ2UodHJ1ZSwgZmluZE1ldGFkYXRhLndhcm5pbmdNZXNzYWdlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFjdGl2YXRlRmluZFNlc3Npb24oKTogdm9pZCB7XG5cdFx0dGhpcy5hY3RpdmVTZXNzaW9uID0gdHJ1ZTtcblx0XHR0aGlzLmZpbHRlci5pc0ZpbmRTZXNzaW9uQWN0aXZlID0gdHJ1ZTtcblx0XHR0aGlzLmZpbmRQcm92aWRlci5zdGFydFNlc3Npb24/LigpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkZWFjdGl2YXRlRmluZFNlc3Npb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5hY3RpdmVTZXNzaW9uID0gZmFsc2U7XG5cdFx0dGhpcy5maWx0ZXIuaXNGaW5kU2Vzc2lvbkFjdGl2ZSA9IGZhbHNlO1xuXHRcdGF3YWl0IHRoaXMuZmluZFByb3ZpZGVyLmVuZFNlc3Npb24/LigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5hc3luY1dvcmtJblByb2dyZXNzIHx8ICF0aGlzLmFjdGl2ZUZpbmRNZXRhZGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNob3dOb3RGb3VuZCA9IHRoaXMuYWN0aXZlRmluZE1ldGFkYXRhLm1hdGNoQ291bnQgPT09IDAgJiYgdGhpcy5wYXR0ZXJuLmxlbmd0aCA+IDA7XG5cdFx0dGhpcy5yZW5kZXJNZXNzYWdlKHNob3dOb3RGb3VuZCk7XG5cblx0XHRpZiAodGhpcy5wYXR0ZXJuLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5hbGVydFJlc3VsdHModGhpcy5hY3RpdmVGaW5kTWV0YWRhdGEubWF0Y2hDb3VudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIG9uRGlkVG9nZ2xlQ2hhbmdlKGU6IElUcmVlRmluZFRvZ2dsZUNoYW5nZUV2ZW50KTogdm9pZCB7XG5cdFx0Ly8gVE9ET0BiZW5pYmVuaiBoYW5kbGUgdG9nZ2xlcyBuaWNlbHkgYWNyb3NzIGFsbCBjb250cm9sbGVycyBhbmQgYmV0d2VlbiBjb250cm9sbGVyIGFuZCBmaWx0ZXJcblx0XHR0aGlzLnRvZ2dsZXMuc2V0KGUuaWQsIGUuaXNDaGVja2VkKTtcblx0XHR0aGlzLmZpbHRlci5maW5kTW9kZSA9IHRoaXMubW9kZTtcblx0XHR0aGlzLmZpbHRlci5maW5kTWF0Y2hUeXBlID0gdGhpcy5tYXRjaFR5cGU7XG5cdFx0dGhpcy5wbGFjZWhvbGRlciA9IHRoaXMubW9kZSA9PT0gVHJlZUZpbmRNb2RlLkZpbHRlciA/IGxvY2FsaXplKCd0eXBlIHRvIGZpbHRlcicsIFwiVHlwZSB0byBmaWx0ZXJcIikgOiBsb2NhbGl6ZSgndHlwZSB0byBzZWFyY2gnLCBcIlR5cGUgdG8gc2VhcmNoXCIpO1xuXG5cdFx0dGhpcy5hcHBseVBhdHRlcm4odGhpcy5wYXR0ZXJuKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNob3VsZEFsbG93Rm9jdXMobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnNob3VsZEZvY3VzV2hlbk5hdmlnYXRpbmcobm9kZSBhcyBJVHJlZU5vZGU8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4gfCBudWxsLCBURmlsdGVyRGF0YT4pO1xuXHR9XG5cblx0c2hvdWxkRm9jdXNXaGVuTmF2aWdhdGluZyhub2RlOiBJVHJlZU5vZGU8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4gfCBudWxsLCBURmlsdGVyRGF0YT4pOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuYWN0aXZlU2Vzc2lvbiB8fCAhdGhpcy5hY3RpdmVGaW5kTWV0YWRhdGEpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVsZW1lbnQgPSBub2RlLmVsZW1lbnQ/LmVsZW1lbnQgYXMgVCB8IHVuZGVmaW5lZDtcblx0XHRpZiAoZWxlbWVudCAmJiB0aGlzLmFjdGl2ZUZpbmRNZXRhZGF0YS5pc01hdGNoKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gIUZ1enp5U2NvcmUuaXNEZWZhdWx0KG5vZGUuZmlsdGVyRGF0YSBhcyB1bmtub3duIGFzIEZ1enp5U2NvcmUpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGFzT2JqZWN0VHJlZU9wdGlvbnM8VElucHV0LCBULCBURmlsdGVyRGF0YT4ob3B0aW9ucz86IElBc3luY0RhdGFUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YT4pOiBJT2JqZWN0VHJlZU9wdGlvbnM8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4sIFRGaWx0ZXJEYXRhPiB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBvcHRpb25zICYmIHtcblx0XHQuLi5vcHRpb25zLFxuXHRcdGNvbGxhcHNlQnlEZWZhdWx0OiB0cnVlLFxuXHRcdGlkZW50aXR5UHJvdmlkZXI6IG9wdGlvbnMuaWRlbnRpdHlQcm92aWRlciAmJiB7XG5cdFx0XHRnZXRJZChlbCkge1xuXHRcdFx0XHRyZXR1cm4gb3B0aW9ucy5pZGVudGl0eVByb3ZpZGVyIS5nZXRJZChlbC5lbGVtZW50IGFzIFQpO1xuXHRcdFx0fSxcblx0XHRcdGdldEdyb3VwSWQ6IG9wdGlvbnMuaWRlbnRpdHlQcm92aWRlciEuZ2V0R3JvdXBJZCA/IChlbCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gb3B0aW9ucy5pZGVudGl0eVByb3ZpZGVyIS5nZXRHcm91cElkIShlbC5lbGVtZW50IGFzIFQpO1xuXHRcdFx0fSA6IHVuZGVmaW5lZFxuXHRcdH0sXG5cdFx0ZG5kOiBvcHRpb25zLmRuZCAmJiBuZXcgQXN5bmNEYXRhVHJlZU5vZGVMaXN0RHJhZ0FuZERyb3Aob3B0aW9ucy5kbmQpLFxuXHRcdG11bHRpcGxlU2VsZWN0aW9uQ29udHJvbGxlcjogb3B0aW9ucy5tdWx0aXBsZVNlbGVjdGlvbkNvbnRyb2xsZXIgJiYge1xuXHRcdFx0aXNTZWxlY3Rpb25TaW5nbGVDaGFuZ2VFdmVudChlKSB7XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWRhbmdlcm91cy10eXBlLWFzc2VydGlvbnNcblx0XHRcdFx0cmV0dXJuIG9wdGlvbnMubXVsdGlwbGVTZWxlY3Rpb25Db250cm9sbGVyIS5pc1NlbGVjdGlvblNpbmdsZUNoYW5nZUV2ZW50KHsgLi4uZSwgZWxlbWVudDogZS5lbGVtZW50IH0gYXMgSUxpc3RNb3VzZUV2ZW50PFQ+IHwgSUxpc3RUb3VjaEV2ZW50PFQ+KTtcblx0XHRcdH0sXG5cdFx0XHRpc1NlbGVjdGlvblJhbmdlQ2hhbmdlRXZlbnQoZSkge1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1kYW5nZXJvdXMtdHlwZS1hc3NlcnRpb25zXG5cdFx0XHRcdHJldHVybiBvcHRpb25zLm11bHRpcGxlU2VsZWN0aW9uQ29udHJvbGxlciEuaXNTZWxlY3Rpb25SYW5nZUNoYW5nZUV2ZW50KHsgLi4uZSwgZWxlbWVudDogZS5lbGVtZW50IH0gYXMgSUxpc3RNb3VzZUV2ZW50PFQ+IHwgSUxpc3RUb3VjaEV2ZW50PFQ+KTtcblx0XHRcdH1cblx0XHR9LFxuXHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogb3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIgJiYge1xuXHRcdFx0Li4ub3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIsXG5cdFx0XHRnZXRQb3NJblNldDogdW5kZWZpbmVkLFxuXHRcdFx0Z2V0U2V0U2l6ZTogdW5kZWZpbmVkLFxuXHRcdFx0Z2V0Um9sZTogb3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIuZ2V0Um9sZSA/IChlbCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gb3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIhLmdldFJvbGUhKGVsLmVsZW1lbnQgYXMgVCk7XG5cdFx0XHR9IDogKCkgPT4gJ3RyZWVpdGVtJyxcblx0XHRcdGlzQ2hlY2tlZDogb3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIuaXNDaGVja2VkID8gKGUpID0+IHtcblx0XHRcdFx0cmV0dXJuICEhKG9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyPy5pc0NoZWNrZWQhKGUuZWxlbWVudCBhcyBUKSk7XG5cdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdFx0Z2V0QXJpYUxhYmVsKGUpIHtcblx0XHRcdFx0cmV0dXJuIG9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyIS5nZXRBcmlhTGFiZWwoZS5lbGVtZW50IGFzIFQpO1xuXHRcdFx0fSxcblx0XHRcdGdldFdpZGdldEFyaWFMYWJlbCgpIHtcblx0XHRcdFx0cmV0dXJuIG9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyIS5nZXRXaWRnZXRBcmlhTGFiZWwoKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRXaWRnZXRSb2xlOiBvcHRpb25zLmFjY2Vzc2liaWxpdHlQcm92aWRlci5nZXRXaWRnZXRSb2xlID8gKCkgPT4gb3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIhLmdldFdpZGdldFJvbGUhKCkgOiAoKSA9PiAndHJlZScsXG5cdFx0XHRnZXRBcmlhTGV2ZWw6IG9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyLmdldEFyaWFMZXZlbCAmJiAobm9kZSA9PiB7XG5cdFx0XHRcdHJldHVybiBvcHRpb25zLmFjY2Vzc2liaWxpdHlQcm92aWRlciEuZ2V0QXJpYUxldmVsIShub2RlLmVsZW1lbnQgYXMgVCk7XG5cdFx0XHR9KSxcblx0XHRcdGdldEFjdGl2ZURlc2NlbmRhbnRJZDogb3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIuZ2V0QWN0aXZlRGVzY2VuZGFudElkICYmIChub2RlID0+IHtcblx0XHRcdFx0cmV0dXJuIG9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyIS5nZXRBY3RpdmVEZXNjZW5kYW50SWQhKG5vZGUuZWxlbWVudCBhcyBUKTtcblx0XHRcdH0pXG5cdFx0fSxcblx0XHRmaWx0ZXI6IG9wdGlvbnMuZmlsdGVyICYmIHtcblx0XHRcdGZpbHRlcihlLCBwYXJlbnRWaXNpYmlsaXR5KSB7XG5cdFx0XHRcdHJldHVybiBvcHRpb25zLmZpbHRlciEuZmlsdGVyKGUuZWxlbWVudCBhcyBULCBwYXJlbnRWaXNpYmlsaXR5KTtcblx0XHRcdH1cblx0XHR9LFxuXHRcdGtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXI6IG9wdGlvbnMua2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlciAmJiB7XG5cdFx0XHQuLi5vcHRpb25zLmtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIsXG5cdFx0XHRnZXRLZXlib2FyZE5hdmlnYXRpb25MYWJlbChlKSB7XG5cdFx0XHRcdHJldHVybiBvcHRpb25zLmtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIhLmdldEtleWJvYXJkTmF2aWdhdGlvbkxhYmVsKGUuZWxlbWVudCBhcyBUKTtcblx0XHRcdH1cblx0XHR9LFxuXHRcdHNvcnRlcjogdW5kZWZpbmVkLFxuXHRcdGV4cGFuZE9ubHlPblR3aXN0aWVDbGljazogdHlwZW9mIG9wdGlvbnMuZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrID09PSAndW5kZWZpbmVkJyA/IHVuZGVmaW5lZCA6IChcblx0XHRcdHR5cGVvZiBvcHRpb25zLmV4cGFuZE9ubHlPblR3aXN0aWVDbGljayAhPT0gJ2Z1bmN0aW9uJyA/IG9wdGlvbnMuZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrIDogKFxuXHRcdFx0XHQoKGU6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+KSA9PiAob3B0aW9ucy5leHBhbmRPbmx5T25Ud2lzdGllQ2xpY2sgYXMgKChlOiBUKSA9PiBib29sZWFuKSkoZS5lbGVtZW50IGFzIFQpKSBhcyAoKGU6IHVua25vd24pID0+IGJvb2xlYW4pXG5cdFx0XHQpXG5cdFx0KSxcblx0XHR0d2lzdGllQWRkaXRpb25hbENzc0NsYXNzOiB0eXBlb2Ygb3B0aW9ucy50d2lzdGllQWRkaXRpb25hbENzc0NsYXNzID09PSAndW5kZWZpbmVkJyA/IHVuZGVmaW5lZCA6IChcblx0XHRcdCgoZTogSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4pID0+IChvcHRpb25zLnR3aXN0aWVBZGRpdGlvbmFsQ3NzQ2xhc3MgYXMgKChlOiBUKSA9PiBzdHJpbmcgfCB1bmRlZmluZWQpKShlLmVsZW1lbnQgYXMgVCkpIGFzICgoZTogdW5rbm93bikgPT4gc3RyaW5nIHwgdW5kZWZpbmVkKVxuXHRcdCksXG5cdFx0ZGVmYXVsdEZpbmRWaXNpYmlsaXR5OiAoZTogSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4pID0+IHtcblx0XHRcdGlmIChlLmhhc0NoaWxkcmVuICYmIGUuc3RhbGUpIHtcblx0XHRcdFx0cmV0dXJuIFRyZWVWaXNpYmlsaXR5LlZpc2libGU7XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBvcHRpb25zLmRlZmF1bHRGaW5kVmlzaWJpbGl0eSA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0cmV0dXJuIG9wdGlvbnMuZGVmYXVsdEZpbmRWaXNpYmlsaXR5O1xuXHRcdFx0fSBlbHNlIGlmICh0eXBlb2Ygb3B0aW9ucy5kZWZhdWx0RmluZFZpc2liaWxpdHkgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdHJldHVybiBUcmVlVmlzaWJpbGl0eS5SZWN1cnNlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIChvcHRpb25zLmRlZmF1bHRGaW5kVmlzaWJpbGl0eSBhcyAoKGU6IFQpID0+IFRyZWVWaXNpYmlsaXR5KSkoZS5lbGVtZW50IGFzIFQpO1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0c3RpY2t5U2Nyb2xsRGVsZWdhdGU6IG9wdGlvbnMuc3RpY2t5U2Nyb2xsRGVsZWdhdGUgYXMgSVN0aWNreVNjcm9sbERlbGVnYXRlPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+LCBURmlsdGVyRGF0YT4gfCB1bmRlZmluZWRcblx0fTtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgSUFzeW5jRGF0YVRyZWVPcHRpb25zVXBkYXRlPFQ+IGV4dGVuZHMgSUFic3RyYWN0VHJlZU9wdGlvbnNVcGRhdGU8VD4geyB9XG5leHBvcnQgaW50ZXJmYWNlIElBc3luY0RhdGFUcmVlVXBkYXRlQ2hpbGRyZW5PcHRpb25zPFQ+IGV4dGVuZHMgSU9iamVjdFRyZWVTZXRDaGlsZHJlbk9wdGlvbnM8VD4geyB9XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFzeW5jRGF0YVRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhID0gdm9pZD4gZXh0ZW5kcyBJQXN5bmNEYXRhVHJlZU9wdGlvbnNVcGRhdGU8VD4sIFBpY2s8SUFic3RyYWN0VHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+LCBFeGNsdWRlPGtleW9mIElBYnN0cmFjdFRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPiwgJ2NvbGxhcHNlQnlEZWZhdWx0Jz4+IHtcblx0cmVhZG9ubHkgY29sbGFwc2VCeURlZmF1bHQ/OiB7IChlOiBUKTogYm9vbGVhbiB9O1xuXHRyZWFkb25seSBpZGVudGl0eVByb3ZpZGVyPzogSUlkZW50aXR5UHJvdmlkZXI8VD47XG5cdHJlYWRvbmx5IHNvcnRlcj86IElUcmVlU29ydGVyPFQ+O1xuXHRyZWFkb25seSBhdXRvRXhwYW5kU2luZ2xlQ2hpbGRyZW4/OiBib29sZWFuO1xuXHRyZWFkb25seSBmaW5kUHJvdmlkZXI/OiBJQXN5bmNGaW5kUHJvdmlkZXI8VD47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFzeW5jRGF0YVRyZWVWaWV3U3RhdGUge1xuXHRyZWFkb25seSBmb2N1cz86IHN0cmluZ1tdO1xuXHRyZWFkb25seSBzZWxlY3Rpb24/OiBzdHJpbmdbXTtcblx0cmVhZG9ubHkgZXhwYW5kZWQ/OiBzdHJpbmdbXTtcblx0cmVhZG9ubHkgc2Nyb2xsVG9wPzogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSUFzeW5jRGF0YVRyZWVWaWV3U3RhdGVDb250ZXh0PFRJbnB1dCwgVD4ge1xuXHRyZWFkb25seSB2aWV3U3RhdGU6IElBc3luY0RhdGFUcmVlVmlld1N0YXRlO1xuXHRyZWFkb25seSBzZWxlY3Rpb246IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+W107XG5cdHJlYWRvbmx5IGZvY3VzOiBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPltdO1xufVxuXG5mdW5jdGlvbiBkZnM8VElucHV0LCBUPihub2RlOiBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiwgZm46IChub2RlOiBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPikgPT4gdm9pZCk6IHZvaWQge1xuXHRmbihub2RlKTtcblx0bm9kZS5jaGlsZHJlbi5mb3JFYWNoKGNoaWxkID0+IGRmcyhjaGlsZCwgZm4pKTtcbn1cblxuZXhwb3J0IGNsYXNzIEFzeW5jRGF0YVRyZWU8VElucHV0LCBULCBURmlsdGVyRGF0YSA9IHZvaWQ+IGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXG5cdHByb3RlY3RlZCByZWFkb25seSB0cmVlOiBPYmplY3RUcmVlPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+LCBURmlsdGVyRGF0YT47XG5cdHByb3RlY3RlZCByZWFkb25seSByb290OiBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPjtcblx0cHJpdmF0ZSByZWFkb25seSBub2RlcyA9IG5ldyBNYXA8bnVsbCB8IFQsIElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNvcnRlcj86IElUcmVlU29ydGVyPFQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGZpbmRDb250cm9sbGVyPzogQXN5bmNGaW5kQ29udHJvbGxlcjxUSW5wdXQsIFQsIFRGaWx0ZXJEYXRhPjtcblx0cHJpdmF0ZSByZWFkb25seSBnZXREZWZhdWx0Q29sbGFwc2VTdGF0ZTogeyAoZTogVCk6IHVuZGVmaW5lZCB8IE9iamVjdFRyZWVFbGVtZW50Q29sbGFwc2VTdGF0ZS5QcmVzZXJ2ZU9yQ29sbGFwc2VkIHwgT2JqZWN0VHJlZUVsZW1lbnRDb2xsYXBzZVN0YXRlLlByZXNlcnZlT3JFeHBhbmRlZCB9O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc3ViVHJlZVJlZnJlc2hQcm9taXNlcyA9IG5ldyBNYXA8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4sIENhbmNlbGFibGVQcm9taXNlPHZvaWQ+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlZnJlc2hQcm9taXNlcyA9IG5ldyBNYXA8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4sIENhbmNlbGFibGVQcm9taXNlPEl0ZXJhYmxlPFQ+Pj4oKTtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgaWRlbnRpdHlQcm92aWRlcj86IElJZGVudGl0eVByb3ZpZGVyPFQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGF1dG9FeHBhbmRTaW5nbGVDaGlsZHJlbjogYm9vbGVhbjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlbmRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRDaGFuZ2VOb2RlU2xvd1N0YXRlID0gbmV3IEVtaXR0ZXI8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4+KCk7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IG5vZGVNYXBwZXI6IEFzeW5jRGF0YVRyZWVOb2RlTWFwcGVyPFRJbnB1dCwgVCwgVEZpbHRlckRhdGE+ID0gbmV3IFdlYWtNYXBwZXIobm9kZSA9PiBuZXcgQXN5bmNEYXRhVHJlZU5vZGVXcmFwcGVyKG5vZGUpKTtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Z2V0IG9uRGlkU2Nyb2xsKCk6IEV2ZW50PFNjcm9sbEV2ZW50PiB7IHJldHVybiB0aGlzLnRyZWUub25EaWRTY3JvbGw7IH1cblxuXHRnZXQgb25EaWRDaGFuZ2VGb2N1cygpOiBFdmVudDxJVHJlZUV2ZW50PFQ+PiB7IHJldHVybiBFdmVudC5tYXAodGhpcy50cmVlLm9uRGlkQ2hhbmdlRm9jdXMsIGFzVHJlZUV2ZW50KTsgfVxuXHRnZXQgb25EaWRDaGFuZ2VTZWxlY3Rpb24oKTogRXZlbnQ8SVRyZWVFdmVudDxUPj4geyByZXR1cm4gRXZlbnQubWFwKHRoaXMudHJlZS5vbkRpZENoYW5nZVNlbGVjdGlvbiwgYXNUcmVlRXZlbnQpOyB9XG5cblx0Z2V0IG9uS2V5RG93bigpOiBFdmVudDxLZXlib2FyZEV2ZW50PiB7IHJldHVybiB0aGlzLnRyZWUub25LZXlEb3duOyB9XG5cdGdldCBvbk1vdXNlQ2xpY2soKTogRXZlbnQ8SVRyZWVNb3VzZUV2ZW50PFQ+PiB7IHJldHVybiBFdmVudC5tYXAodGhpcy50cmVlLm9uTW91c2VDbGljaywgYXNUcmVlTW91c2VFdmVudCk7IH1cblx0Z2V0IG9uTW91c2VEYmxDbGljaygpOiBFdmVudDxJVHJlZU1vdXNlRXZlbnQ8VD4+IHsgcmV0dXJuIEV2ZW50Lm1hcCh0aGlzLnRyZWUub25Nb3VzZURibENsaWNrLCBhc1RyZWVNb3VzZUV2ZW50KTsgfVxuXHRnZXQgb25Db250ZXh0TWVudSgpOiBFdmVudDxJVHJlZUNvbnRleHRNZW51RXZlbnQ8VD4+IHsgcmV0dXJuIEV2ZW50Lm1hcCh0aGlzLnRyZWUub25Db250ZXh0TWVudSwgYXNUcmVlQ29udGV4dE1lbnVFdmVudCk7IH1cblx0Z2V0IG9uVGFwKCk6IEV2ZW50PElUcmVlTW91c2VFdmVudDxUPj4geyByZXR1cm4gRXZlbnQubWFwKHRoaXMudHJlZS5vblRhcCwgYXNUcmVlTW91c2VFdmVudCk7IH1cblx0Z2V0IG9uUG9pbnRlcigpOiBFdmVudDxJVHJlZU1vdXNlRXZlbnQ8VD4+IHsgcmV0dXJuIEV2ZW50Lm1hcCh0aGlzLnRyZWUub25Qb2ludGVyLCBhc1RyZWVNb3VzZUV2ZW50KTsgfVxuXHRnZXQgb25EaWRGb2N1cygpOiBFdmVudDx2b2lkPiB7IHJldHVybiB0aGlzLnRyZWUub25EaWRGb2N1czsgfVxuXHRnZXQgb25EaWRCbHVyKCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIHRoaXMudHJlZS5vbkRpZEJsdXI7IH1cblxuXHQvKipcblx0ICogVG8gYmUgdXNlZCBpbnRlcm5hbGx5IG9ubHkhXG5cdCAqIEBkZXByZWNhdGVkXG5cdCAqL1xuXHRnZXQgb25EaWRDaGFuZ2VNb2RlbCgpOiBFdmVudDx2b2lkPiB7IHJldHVybiB0aGlzLnRyZWUub25EaWRDaGFuZ2VNb2RlbDsgfVxuXHRnZXQgb25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlKCk6IEV2ZW50PElDb2xsYXBzZVN0YXRlQ2hhbmdlRXZlbnQ8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4gfCBudWxsLCBURmlsdGVyRGF0YT4+IHsgcmV0dXJuIHRoaXMudHJlZS5vbkRpZENoYW5nZUNvbGxhcHNlU3RhdGU7IH1cblxuXHRnZXQgb25EaWRVcGRhdGVPcHRpb25zKCk6IEV2ZW50PElBc3luY0RhdGFUcmVlT3B0aW9uc1VwZGF0ZTxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPj4+IHsgcmV0dXJuIHRoaXMudHJlZS5vbkRpZFVwZGF0ZU9wdGlvbnM7IH1cblxuXHRwcml2YXRlIGZvY3VzTmF2aWdhdGlvbkZpbHRlcjogKChub2RlOiBJVHJlZU5vZGU8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4gfCBudWxsLCBURmlsdGVyRGF0YT4pID0+IGJvb2xlYW4pIHwgdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmluZE9wZW5TdGF0ZTogRXZlbnQ8Ym9vbGVhbj47XG5cdGdldCBvbkRpZENoYW5nZVN0aWNreVNjcm9sbEZvY3VzZWQoKTogRXZlbnQ8Ym9vbGVhbj4geyByZXR1cm4gdGhpcy50cmVlLm9uRGlkQ2hhbmdlU3RpY2t5U2Nyb2xsRm9jdXNlZDsgfVxuXG5cdGdldCBmaW5kTW9kZSgpOiBUcmVlRmluZE1vZGUgeyByZXR1cm4gdGhpcy5maW5kQ29udHJvbGxlciA/IHRoaXMuZmluZENvbnRyb2xsZXIubW9kZSA6IHRoaXMudHJlZS5maW5kTW9kZTsgfVxuXHRzZXQgZmluZE1vZGUobW9kZTogVHJlZUZpbmRNb2RlKSB7IHRoaXMuZmluZENvbnRyb2xsZXIgPyB0aGlzLmZpbmRDb250cm9sbGVyLm1vZGUgPSBtb2RlIDogdGhpcy50cmVlLmZpbmRNb2RlID0gbW9kZTsgfVxuXHRyZWFkb25seSBvbkRpZENoYW5nZUZpbmRNb2RlOiBFdmVudDxUcmVlRmluZE1vZGU+O1xuXG5cdGdldCBmaW5kTWF0Y2hUeXBlKCk6IFRyZWVGaW5kTWF0Y2hUeXBlIHsgcmV0dXJuIHRoaXMuZmluZENvbnRyb2xsZXIgPyB0aGlzLmZpbmRDb250cm9sbGVyLm1hdGNoVHlwZSA6IHRoaXMudHJlZS5maW5kTWF0Y2hUeXBlOyB9XG5cdHNldCBmaW5kTWF0Y2hUeXBlKG1hdGNoVHlwZTogVHJlZUZpbmRNYXRjaFR5cGUpIHsgdGhpcy5maW5kQ29udHJvbGxlciA/IHRoaXMuZmluZENvbnRyb2xsZXIubWF0Y2hUeXBlID0gbWF0Y2hUeXBlIDogdGhpcy50cmVlLmZpbmRNYXRjaFR5cGUgPSBtYXRjaFR5cGU7IH1cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGaW5kTWF0Y2hUeXBlOiBFdmVudDxUcmVlRmluZE1hdGNoVHlwZT47XG5cblx0Z2V0IGV4cGFuZE9ubHlPblR3aXN0aWVDbGljaygpOiBib29sZWFuIHwgKChlOiBUKSA9PiBib29sZWFuKSB7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLnRyZWUuZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHJldHVybiB0aGlzLnRyZWUuZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZuID0gdGhpcy50cmVlLmV4cGFuZE9ubHlPblR3aXN0aWVDbGljaztcblx0XHRyZXR1cm4gZWxlbWVudCA9PiBmbih0aGlzLm5vZGVzLmdldCgoZWxlbWVudCA9PT0gdGhpcy5yb290LmVsZW1lbnQgPyBudWxsIDogZWxlbWVudCkgYXMgVCkgfHwgbnVsbCk7XG5cdH1cblxuXHRnZXQgb25EaWREaXNwb3NlKCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIHRoaXMudHJlZS5vbkRpZERpc3Bvc2U7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgdXNlcjogc3RyaW5nLFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0ZGVsZWdhdGU6IElMaXN0VmlydHVhbERlbGVnYXRlPFQ+LFxuXHRcdHJlbmRlcmVyczogSVRyZWVSZW5kZXJlcjxULCBURmlsdGVyRGF0YSwgdW5rbm93bj5bXSxcblx0XHRwcml2YXRlIGRhdGFTb3VyY2U6IElBc3luY0RhdGFTb3VyY2U8VElucHV0LCBUPixcblx0XHRvcHRpb25zOiBJQXN5bmNEYXRhVHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+ID0ge31cblx0KSB7XG5cdFx0dGhpcy5pZGVudGl0eVByb3ZpZGVyID0gb3B0aW9ucy5pZGVudGl0eVByb3ZpZGVyO1xuXHRcdHRoaXMuYXV0b0V4cGFuZFNpbmdsZUNoaWxkcmVuID0gdHlwZW9mIG9wdGlvbnMuYXV0b0V4cGFuZFNpbmdsZUNoaWxkcmVuID09PSAndW5kZWZpbmVkJyA/IGZhbHNlIDogb3B0aW9ucy5hdXRvRXhwYW5kU2luZ2xlQ2hpbGRyZW47XG5cdFx0dGhpcy5zb3J0ZXIgPSBvcHRpb25zLnNvcnRlcjtcblx0XHR0aGlzLmdldERlZmF1bHRDb2xsYXBzZVN0YXRlID0gZSA9PiBvcHRpb25zLmNvbGxhcHNlQnlEZWZhdWx0ID8gKG9wdGlvbnMuY29sbGFwc2VCeURlZmF1bHQoZSkgPyBPYmplY3RUcmVlRWxlbWVudENvbGxhcHNlU3RhdGUuUHJlc2VydmVPckNvbGxhcHNlZCA6IE9iamVjdFRyZWVFbGVtZW50Q29sbGFwc2VTdGF0ZS5QcmVzZXJ2ZU9yRXhwYW5kZWQpIDogdW5kZWZpbmVkO1xuXG5cdFx0bGV0IGFzeW5jRmluZEVuYWJsZWQgPSBmYWxzZTtcblx0XHRsZXQgZmluZEZpbHRlcjogQXN5bmNGaW5kRmlsdGVyPFQ+IHwgdW5kZWZpbmVkO1xuXHRcdGlmIChvcHRpb25zLmZpbmRQcm92aWRlciAmJiAob3B0aW9ucy5maW5kV2lkZ2V0RW5hYmxlZCA/PyB0cnVlKSAmJiBvcHRpb25zLmtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIgJiYgb3B0aW9ucy5jb250ZXh0Vmlld1Byb3ZpZGVyKSB7XG5cdFx0XHRhc3luY0ZpbmRFbmFibGVkID0gdHJ1ZTtcblx0XHRcdGZpbmRGaWx0ZXIgPSBuZXcgQXN5bmNGaW5kRmlsdGVyPFQ+KG9wdGlvbnMuZmluZFByb3ZpZGVyLCBvcHRpb25zLmtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIsIG9wdGlvbnMuZmlsdGVyIGFzIElUcmVlRmlsdGVyPFQsIEZ1enp5U2NvcmU+KTtcblx0XHR9XG5cblx0XHR0aGlzLnRyZWUgPSB0aGlzLmNyZWF0ZVRyZWUodXNlciwgY29udGFpbmVyLCBkZWxlZ2F0ZSwgcmVuZGVyZXJzLCB7IC4uLm9wdGlvbnMsIGZpbmRXaWRnZXRFbmFibGVkOiAhYXN5bmNGaW5kRW5hYmxlZCwgZmlsdGVyOiBmaW5kRmlsdGVyIGFzIElUcmVlRmlsdGVyPFQsIFRGaWx0ZXJEYXRhPiA/PyBvcHRpb25zLmZpbHRlciB9KTtcblxuXHRcdHRoaXMucm9vdCA9IGNyZWF0ZUFzeW5jRGF0YVRyZWVOb2RlKHtcblx0XHRcdGVsZW1lbnQ6IHVuZGVmaW5lZCEsXG5cdFx0XHRwYXJlbnQ6IG51bGwsXG5cdFx0XHRoYXNDaGlsZHJlbjogdHJ1ZSxcblx0XHRcdGRlZmF1bHRDb2xsYXBzZVN0YXRlOiB1bmRlZmluZWRcblx0XHR9KTtcblxuXHRcdGlmICh0aGlzLmlkZW50aXR5UHJvdmlkZXIpIHtcblx0XHRcdHRoaXMucm9vdCA9IHtcblx0XHRcdFx0Li4udGhpcy5yb290LFxuXHRcdFx0XHRpZDogbnVsbFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0aGlzLm5vZGVzLnNldChudWxsLCB0aGlzLnJvb3QpO1xuXG5cdFx0dGhpcy50cmVlLm9uRGlkQ2hhbmdlQ29sbGFwc2VTdGF0ZSh0aGlzLl9vbkRpZENoYW5nZUNvbGxhcHNlU3RhdGUsIHRoaXMsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXG5cdFx0aWYgKGFzeW5jRmluZEVuYWJsZWQpIHtcblx0XHRcdGNvbnN0IGZpbmRPcHRpb25zOiBJRmluZENvbnRyb2xsZXJPcHRpb25zID0ge1xuXHRcdFx0XHRzdHlsZXM6IG9wdGlvbnMuZmluZFdpZGdldFN0eWxlcyxcblx0XHRcdFx0c2hvd05vdEZvdW5kTWVzc2FnZTogb3B0aW9ucy5zaG93Tm90Rm91bmRNZXNzYWdlLFxuXHRcdFx0XHRkZWZhdWx0RmluZE1hdGNoVHlwZTogb3B0aW9ucy5kZWZhdWx0RmluZE1hdGNoVHlwZSxcblx0XHRcdFx0ZGVmYXVsdEZpbmRNb2RlOiBvcHRpb25zLmRlZmF1bHRGaW5kTW9kZSxcblx0XHRcdH07XG5cdFx0XHR0aGlzLmZpbmRDb250cm9sbGVyID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IEFzeW5jRmluZENvbnRyb2xsZXIodGhpcy50cmVlLCBvcHRpb25zLmZpbmRQcm92aWRlciEsIGZpbmRGaWx0ZXIhLCB0aGlzLnRyZWUub3B0aW9ucy5jb250ZXh0Vmlld1Byb3ZpZGVyISwgZmluZE9wdGlvbnMpKTtcblxuXHRcdFx0dGhpcy5mb2N1c05hdmlnYXRpb25GaWx0ZXIgPSBub2RlID0+IHRoaXMuZmluZENvbnRyb2xsZXIhLnNob3VsZEZvY3VzV2hlbk5hdmlnYXRpbmcobm9kZSk7XG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlRmluZE9wZW5TdGF0ZSA9IHRoaXMuZmluZENvbnRyb2xsZXIub25EaWRDaGFuZ2VPcGVuU3RhdGU7XG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlRmluZE1vZGUgPSB0aGlzLmZpbmRDb250cm9sbGVyLm9uRGlkQ2hhbmdlTW9kZTtcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VGaW5kTWF0Y2hUeXBlID0gdGhpcy5maW5kQ29udHJvbGxlci5vbkRpZENoYW5nZU1hdGNoVHlwZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5vbkRpZENoYW5nZUZpbmRPcGVuU3RhdGUgPSB0aGlzLnRyZWUub25EaWRDaGFuZ2VGaW5kT3BlblN0YXRlO1xuXHRcdFx0dGhpcy5vbkRpZENoYW5nZUZpbmRNb2RlID0gdGhpcy50cmVlLm9uRGlkQ2hhbmdlRmluZE1vZGU7XG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlRmluZE1hdGNoVHlwZSA9IHRoaXMudHJlZS5vbkRpZENoYW5nZUZpbmRNYXRjaFR5cGU7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZVRyZWUoXG5cdFx0dXNlcjogc3RyaW5nLFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0ZGVsZWdhdGU6IElMaXN0VmlydHVhbERlbGVnYXRlPFQ+LFxuXHRcdHJlbmRlcmVyczogSVRyZWVSZW5kZXJlcjxULCBURmlsdGVyRGF0YSwgdW5rbm93bj5bXSxcblx0XHRvcHRpb25zOiBJQXN5bmNEYXRhVHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+XG5cdCk6IE9iamVjdFRyZWU8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4sIFRGaWx0ZXJEYXRhPiB7XG5cdFx0Y29uc3Qgb2JqZWN0VHJlZURlbGVnYXRlID0gbmV3IENvbXBvc2VkVHJlZURlbGVnYXRlPFRJbnB1dCB8IFQsIElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+PihkZWxlZ2F0ZSk7XG5cdFx0Y29uc3Qgb2JqZWN0VHJlZVJlbmRlcmVycyA9IHJlbmRlcmVycy5tYXAociA9PiBuZXcgQXN5bmNEYXRhVHJlZVJlbmRlcmVyKHIsIHRoaXMubm9kZU1hcHBlciwgdGhpcy5fb25EaWRDaGFuZ2VOb2RlU2xvd1N0YXRlLmV2ZW50KSk7XG5cdFx0Y29uc3Qgb2JqZWN0VHJlZU9wdGlvbnMgPSBhc09iamVjdFRyZWVPcHRpb25zPFRJbnB1dCwgVCwgVEZpbHRlckRhdGE+KG9wdGlvbnMpIHx8IHt9O1xuXG5cdFx0cmV0dXJuIG5ldyBPYmplY3RUcmVlKHVzZXIsIGNvbnRhaW5lciwgb2JqZWN0VHJlZURlbGVnYXRlLCBvYmplY3RUcmVlUmVuZGVyZXJzLCBvYmplY3RUcmVlT3B0aW9ucyk7XG5cdH1cblxuXHR1cGRhdGVPcHRpb25zKG9wdGlvbnNVcGRhdGU6IElBc3luY0RhdGFUcmVlT3B0aW9uc1VwZGF0ZTxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiB8IG51bGw+ID0ge30pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5maW5kQ29udHJvbGxlcikge1xuXHRcdFx0aWYgKG9wdGlvbnNVcGRhdGUuZGVmYXVsdEZpbmRNb2RlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5maW5kQ29udHJvbGxlci5tb2RlID0gb3B0aW9uc1VwZGF0ZS5kZWZhdWx0RmluZE1vZGU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChvcHRpb25zVXBkYXRlLmRlZmF1bHRGaW5kTWF0Y2hUeXBlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5maW5kQ29udHJvbGxlci5tYXRjaFR5cGUgPSBvcHRpb25zVXBkYXRlLmRlZmF1bHRGaW5kTWF0Y2hUeXBlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMudHJlZS51cGRhdGVPcHRpb25zKG9wdGlvbnNVcGRhdGUpO1xuXHR9XG5cblx0Z2V0IG9wdGlvbnMoKTogSUFzeW5jRGF0YVRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPiB7XG5cdFx0cmV0dXJuIHRoaXMudHJlZS5vcHRpb25zIGFzIElBc3luY0RhdGFUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YT47XG5cdH1cblxuXHQvLyBXaWRnZXRcblxuXHRnZXRIVE1MRWxlbWVudCgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMudHJlZS5nZXRIVE1MRWxlbWVudCgpO1xuXHR9XG5cblx0Z2V0IGNvbnRlbnRIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy50cmVlLmNvbnRlbnRIZWlnaHQ7XG5cdH1cblxuXHRnZXQgY29udGVudFdpZHRoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMudHJlZS5jb250ZW50V2lkdGg7XG5cdH1cblxuXHRnZXQgb25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0KCk6IEV2ZW50PG51bWJlcj4ge1xuXHRcdHJldHVybiB0aGlzLnRyZWUub25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0O1xuXHR9XG5cblx0Z2V0IG9uRGlkQ2hhbmdlQ29udGVudFdpZHRoKCk6IEV2ZW50PG51bWJlcj4ge1xuXHRcdHJldHVybiB0aGlzLnRyZWUub25EaWRDaGFuZ2VDb250ZW50V2lkdGg7XG5cdH1cblxuXHRnZXQgc2Nyb2xsVG9wKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMudHJlZS5zY3JvbGxUb3A7XG5cdH1cblxuXHRzZXQgc2Nyb2xsVG9wKHNjcm9sbFRvcDogbnVtYmVyKSB7XG5cdFx0dGhpcy50cmVlLnNjcm9sbFRvcCA9IHNjcm9sbFRvcDtcblx0fVxuXG5cdGdldCBzY3JvbGxMZWZ0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMudHJlZS5zY3JvbGxMZWZ0O1xuXHR9XG5cblx0c2V0IHNjcm9sbExlZnQoc2Nyb2xsTGVmdDogbnVtYmVyKSB7XG5cdFx0dGhpcy50cmVlLnNjcm9sbExlZnQgPSBzY3JvbGxMZWZ0O1xuXHR9XG5cblx0Z2V0IHNjcm9sbEhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnRyZWUuc2Nyb2xsSGVpZ2h0O1xuXHR9XG5cblx0Z2V0IHJlbmRlckhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnRyZWUucmVuZGVySGVpZ2h0O1xuXHR9XG5cblx0Z2V0IGxhc3RWaXNpYmxlRWxlbWVudCgpOiBUIHtcblx0XHRyZXR1cm4gdGhpcy50cmVlLmxhc3RWaXNpYmxlRWxlbWVudCEuZWxlbWVudCBhcyBUO1xuXHR9XG5cblx0Z2V0IGFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnRyZWUuYXJpYUxhYmVsO1xuXHR9XG5cblx0c2V0IGFyaWFMYWJlbCh2YWx1ZTogc3RyaW5nKSB7XG5cdFx0dGhpcy50cmVlLmFyaWFMYWJlbCA9IHZhbHVlO1xuXHR9XG5cblx0ZG9tRm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cdH1cblxuXHRpc0RPTUZvY3VzZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMudHJlZS5pc0RPTUZvY3VzZWQoKTtcblx0fVxuXG5cdG5hdmlnYXRlKHN0YXJ0PzogVCkge1xuXHRcdGxldCBzdGFydE5vZGU7XG5cdFx0aWYgKHN0YXJ0KSB7XG5cdFx0XHRzdGFydE5vZGUgPSB0aGlzLmdldERhdGFOb2RlKHN0YXJ0KTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBBc3luY0RhdGFUcmVlTmF2aWdhdG9yKHRoaXMudHJlZS5uYXZpZ2F0ZShzdGFydE5vZGUpKTtcblx0fVxuXG5cdGxheW91dChoZWlnaHQ/OiBudW1iZXIsIHdpZHRoPzogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlLmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdHN0eWxlKHN0eWxlczogSUxpc3RTdHlsZXMpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWUuc3R5bGUoc3R5bGVzKTtcblx0fVxuXG5cdC8vIE1vZGVsXG5cblx0Z2V0SW5wdXQoKTogVElucHV0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5yb290LmVsZW1lbnQgYXMgVElucHV0O1xuXHR9XG5cblx0YXN5bmMgc2V0SW5wdXQoaW5wdXQ6IFRJbnB1dCwgdmlld1N0YXRlPzogSUFzeW5jRGF0YVRyZWVWaWV3U3RhdGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmNhbmNlbEFsbFJlZnJlc2hQcm9taXNlcygpO1xuXG5cdFx0dGhpcy5yb290LmVsZW1lbnQgPSBpbnB1dCE7XG5cblx0XHRjb25zdCB2aWV3U3RhdGVDb250ZXh0OiBJQXN5bmNEYXRhVHJlZVZpZXdTdGF0ZUNvbnRleHQ8VElucHV0LCBUPiB8IHVuZGVmaW5lZCA9IHZpZXdTdGF0ZSAmJiB7IHZpZXdTdGF0ZSwgZm9jdXM6IFtdLCBzZWxlY3Rpb246IFtdIH07XG5cblx0XHRhd2FpdCB0aGlzLl91cGRhdGVDaGlsZHJlbihpbnB1dCwgdHJ1ZSwgZmFsc2UsIHZpZXdTdGF0ZUNvbnRleHQpO1xuXG5cdFx0aWYgKHZpZXdTdGF0ZUNvbnRleHQpIHtcblx0XHRcdHRoaXMudHJlZS5zZXRGb2N1cyh2aWV3U3RhdGVDb250ZXh0LmZvY3VzKTtcblx0XHRcdHRoaXMudHJlZS5zZXRTZWxlY3Rpb24odmlld1N0YXRlQ29udGV4dC5zZWxlY3Rpb24pO1xuXHRcdH1cblxuXHRcdGlmICh2aWV3U3RhdGUgJiYgdHlwZW9mIHZpZXdTdGF0ZS5zY3JvbGxUb3AgPT09ICdudW1iZXInKSB7XG5cdFx0XHR0aGlzLnNjcm9sbFRvcCA9IHZpZXdTdGF0ZS5zY3JvbGxUb3A7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgdXBkYXRlQ2hpbGRyZW4oZWxlbWVudDogVElucHV0IHwgVCA9IHRoaXMucm9vdC5lbGVtZW50LCByZWN1cnNpdmUgPSB0cnVlLCByZXJlbmRlciA9IGZhbHNlLCBvcHRpb25zPzogSUFzeW5jRGF0YVRyZWVVcGRhdGVDaGlsZHJlbk9wdGlvbnM8VD4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl91cGRhdGVDaGlsZHJlbihlbGVtZW50LCByZWN1cnNpdmUsIHJlcmVuZGVyLCB1bmRlZmluZWQsIG9wdGlvbnMpO1xuXHR9XG5cblx0Y2FuY2VsQWxsUmVmcmVzaFByb21pc2VzKGluY2x1ZGVTdWJUcmVlczogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0dGhpcy5yZWZyZXNoUHJvbWlzZXMuZm9yRWFjaChwcm9taXNlID0+IHByb21pc2UuY2FuY2VsKCkpO1xuXHRcdHRoaXMucmVmcmVzaFByb21pc2VzLmNsZWFyKCk7XG5cblx0XHRpZiAoaW5jbHVkZVN1YlRyZWVzKSB7XG5cdFx0XHR0aGlzLnN1YlRyZWVSZWZyZXNoUHJvbWlzZXMuZm9yRWFjaChwcm9taXNlID0+IHByb21pc2UuY2FuY2VsKCkpO1xuXHRcdFx0dGhpcy5zdWJUcmVlUmVmcmVzaFByb21pc2VzLmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdXBkYXRlQ2hpbGRyZW4oZWxlbWVudDogVElucHV0IHwgVCA9IHRoaXMucm9vdC5lbGVtZW50LCByZWN1cnNpdmUgPSB0cnVlLCByZXJlbmRlciA9IGZhbHNlLCB2aWV3U3RhdGVDb250ZXh0PzogSUFzeW5jRGF0YVRyZWVWaWV3U3RhdGVDb250ZXh0PFRJbnB1dCwgVD4sIG9wdGlvbnM/OiBJQXN5bmNEYXRhVHJlZVVwZGF0ZUNoaWxkcmVuT3B0aW9uczxUPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0eXBlb2YgdGhpcy5yb290LmVsZW1lbnQgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aHJvdyBuZXcgVHJlZUVycm9yKHRoaXMudXNlciwgJ1RyZWUgaW5wdXQgbm90IHNldCcpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnJvb3QucmVmcmVzaFByb21pc2UpIHtcblx0XHRcdGF3YWl0IHRoaXMucm9vdC5yZWZyZXNoUHJvbWlzZTtcblx0XHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZSh0aGlzLl9vbkRpZFJlbmRlci5ldmVudCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm9kZSA9IHRoaXMuZ2V0RGF0YU5vZGUoZWxlbWVudCk7XG5cdFx0YXdhaXQgdGhpcy5yZWZyZXNoQW5kUmVuZGVyTm9kZShub2RlLCByZWN1cnNpdmUsIHZpZXdTdGF0ZUNvbnRleHQsIG9wdGlvbnMpO1xuXG5cdFx0aWYgKHJlcmVuZGVyKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLnRyZWUucmVyZW5kZXIobm9kZSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gbWlzc2luZyBub2RlcyBhcmUgZmluZSwgdGhpcyBjb3VsZCd2ZSByZXN1bHRlZCBmcm9tXG5cdFx0XHRcdC8vIHBhcmFsbGVsIHJlZnJlc2ggY2FsbHMsIHJlbW92aW5nIGBub2RlYCBhbHRvZ2V0aGVyXG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmVzb3J0KGVsZW1lbnQ6IFRJbnB1dCB8IFQgPSB0aGlzLnJvb3QuZWxlbWVudCwgcmVjdXJzaXZlID0gdHJ1ZSk6IHZvaWQge1xuXHRcdHRoaXMudHJlZS5yZXNvcnQodGhpcy5nZXREYXRhTm9kZShlbGVtZW50KSwgcmVjdXJzaXZlKTtcblx0fVxuXG5cdGhhc05vZGUoZWxlbWVudDogVElucHV0IHwgVCk6IGJvb2xlYW4ge1xuXHRcdGlmIChlbGVtZW50ID09PSB0aGlzLnJvb3QuZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm9kZSA9IHRoaXMubm9kZXMuZ2V0KGVsZW1lbnQgYXMgVCk7XG5cblx0XHRpZiAoIW5vZGUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy50cmVlLmhhc0VsZW1lbnQobm9kZSk7XG5cdH1cblxuXHQvLyBWaWV3XG5cblx0cmVyZW5kZXIoZWxlbWVudD86IFQpOiB2b2lkIHtcblx0XHRpZiAoZWxlbWVudCA9PT0gdW5kZWZpbmVkIHx8IGVsZW1lbnQgPT09IHRoaXMucm9vdC5lbGVtZW50KSB7XG5cdFx0XHR0aGlzLnRyZWUucmVyZW5kZXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBub2RlID0gdGhpcy5nZXREYXRhTm9kZShlbGVtZW50KTtcblx0XHR0aGlzLnRyZWUucmVyZW5kZXIobm9kZSk7XG5cdH1cblxuXHR1cGRhdGVFbGVtZW50SGVpZ2h0KGVsZW1lbnQ6IFQsIGhlaWdodDogbnVtYmVyIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3Qgbm9kZSA9IHRoaXMuZ2V0RGF0YU5vZGUoZWxlbWVudCk7XG5cdFx0dGhpcy50cmVlLnVwZGF0ZUVsZW1lbnRIZWlnaHQobm9kZSwgaGVpZ2h0KTtcblx0fVxuXG5cdHVwZGF0ZVdpZHRoKGVsZW1lbnQ6IFQpOiB2b2lkIHtcblx0XHRjb25zdCBub2RlID0gdGhpcy5nZXREYXRhTm9kZShlbGVtZW50KTtcblx0XHR0aGlzLnRyZWUudXBkYXRlV2lkdGgobm9kZSk7XG5cdH1cblxuXHQvLyBUcmVlXG5cblx0Z2V0Tm9kZShlbGVtZW50OiBUSW5wdXQgfCBUID0gdGhpcy5yb290LmVsZW1lbnQpOiBJVHJlZU5vZGU8VElucHV0IHwgVCwgVEZpbHRlckRhdGE+IHtcblx0XHRjb25zdCBkYXRhTm9kZSA9IHRoaXMuZ2V0RGF0YU5vZGUoZWxlbWVudCk7XG5cdFx0Y29uc3Qgbm9kZSA9IHRoaXMudHJlZS5nZXROb2RlKGRhdGFOb2RlID09PSB0aGlzLnJvb3QgPyBudWxsIDogZGF0YU5vZGUpO1xuXHRcdHJldHVybiB0aGlzLm5vZGVNYXBwZXIubWFwKG5vZGUpO1xuXHR9XG5cblx0Y29sbGFwc2UoZWxlbWVudDogVCwgcmVjdXJzaXZlOiBib29sZWFuID0gZmFsc2UpOiBib29sZWFuIHtcblx0XHRjb25zdCBub2RlID0gdGhpcy5nZXREYXRhTm9kZShlbGVtZW50KTtcblx0XHRyZXR1cm4gdGhpcy50cmVlLmNvbGxhcHNlKG5vZGUgPT09IHRoaXMucm9vdCA/IG51bGwgOiBub2RlLCByZWN1cnNpdmUpO1xuXHR9XG5cblx0YXN5bmMgZXhwYW5kKGVsZW1lbnQ6IFQsIHJlY3Vyc2l2ZTogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLnJvb3QuZWxlbWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHRocm93IG5ldyBUcmVlRXJyb3IodGhpcy51c2VyLCAnVHJlZSBpbnB1dCBub3Qgc2V0Jyk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMucm9vdC5yZWZyZXNoUHJvbWlzZSkge1xuXHRcdFx0YXdhaXQgdGhpcy5yb290LnJlZnJlc2hQcm9taXNlO1xuXHRcdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKHRoaXMuX29uRGlkUmVuZGVyLmV2ZW50KTtcblx0XHR9XG5cblx0XHRjb25zdCBub2RlID0gdGhpcy5nZXREYXRhTm9kZShlbGVtZW50KTtcblxuXHRcdGlmICh0aGlzLnRyZWUuaGFzRWxlbWVudChub2RlKSAmJiAhdGhpcy50cmVlLmlzQ29sbGFwc2libGUobm9kZSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAobm9kZS5yZWZyZXNoUHJvbWlzZSkge1xuXHRcdFx0YXdhaXQgbm9kZS5yZWZyZXNoUHJvbWlzZTtcblx0XHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZSh0aGlzLl9vbkRpZFJlbmRlci5ldmVudCk7XG5cdFx0fVxuXG5cdFx0aWYgKG5vZGUgIT09IHRoaXMucm9vdCAmJiAhbm9kZS5yZWZyZXNoUHJvbWlzZSAmJiAhdGhpcy50cmVlLmlzQ29sbGFwc2VkKG5vZGUpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy50cmVlLmV4cGFuZChub2RlID09PSB0aGlzLnJvb3QgPyBudWxsIDogbm9kZSwgcmVjdXJzaXZlKTtcblxuXHRcdGlmIChub2RlLnJlZnJlc2hQcm9taXNlKSB7XG5cdFx0XHRhd2FpdCBub2RlLnJlZnJlc2hQcm9taXNlO1xuXHRcdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKHRoaXMuX29uRGlkUmVuZGVyLmV2ZW50KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0dG9nZ2xlQ29sbGFwc2VkKGVsZW1lbnQ6IFQsIHJlY3Vyc2l2ZTogYm9vbGVhbiA9IGZhbHNlKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMudHJlZS50b2dnbGVDb2xsYXBzZWQodGhpcy5nZXREYXRhTm9kZShlbGVtZW50KSwgcmVjdXJzaXZlKTtcblx0fVxuXG5cdGV4cGFuZEFsbCgpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWUuZXhwYW5kQWxsKCk7XG5cdH1cblxuXHRhc3luYyBleHBhbmRUbyhlbGVtZW50OiBUKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmRhdGFTb3VyY2UuZ2V0UGFyZW50KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NhblxcJ3QgZXhwYW5kIHRvIGVsZW1lbnQgd2l0aG91dCBnZXRQYXJlbnQgbWV0aG9kJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWxlbWVudHM6IFRbXSA9IFtdO1xuXHRcdHdoaWxlICghdGhpcy5oYXNOb2RlKGVsZW1lbnQpKSB7XG5cdFx0XHRlbGVtZW50ID0gdGhpcy5kYXRhU291cmNlLmdldFBhcmVudChlbGVtZW50KSBhcyBUO1xuXG5cdFx0XHRpZiAoZWxlbWVudCAhPT0gdGhpcy5yb290LmVsZW1lbnQpIHtcblx0XHRcdFx0ZWxlbWVudHMucHVzaChlbGVtZW50KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgSXRlcmFibGUucmV2ZXJzZShlbGVtZW50cykpIHtcblx0XHRcdGF3YWl0IHRoaXMuZXhwYW5kKGVsZW1lbnQpO1xuXHRcdH1cblxuXHRcdHRoaXMudHJlZS5leHBhbmRUbyh0aGlzLmdldERhdGFOb2RlKGVsZW1lbnQpKTtcblx0fVxuXG5cdGNvbGxhcHNlQWxsKCk6IHZvaWQge1xuXHRcdHRoaXMudHJlZS5jb2xsYXBzZUFsbCgpO1xuXHR9XG5cblx0aXNDb2xsYXBzaWJsZShlbGVtZW50OiBUKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMudHJlZS5pc0NvbGxhcHNpYmxlKHRoaXMuZ2V0RGF0YU5vZGUoZWxlbWVudCkpO1xuXHR9XG5cblx0aXNDb2xsYXBzZWQoZWxlbWVudDogVElucHV0IHwgVCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnRyZWUuaXNDb2xsYXBzZWQodGhpcy5nZXREYXRhTm9kZShlbGVtZW50KSk7XG5cdH1cblxuXHR0cmlnZ2VyVHlwZU5hdmlnYXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlLnRyaWdnZXJUeXBlTmF2aWdhdGlvbigpO1xuXHR9XG5cblx0b3BlbkZpbmQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZmluZENvbnRyb2xsZXIpIHtcblx0XHRcdHRoaXMuZmluZENvbnRyb2xsZXIub3BlbigpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnRyZWUub3BlbkZpbmQoKTtcblx0XHR9XG5cdH1cblxuXHRjbG9zZUZpbmQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZmluZENvbnRyb2xsZXIpIHtcblx0XHRcdHRoaXMuZmluZENvbnRyb2xsZXIuY2xvc2UoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy50cmVlLmNsb3NlRmluZCgpO1xuXHRcdH1cblx0fVxuXG5cdHJlZmlsdGVyKCk6IHZvaWQge1xuXHRcdHRoaXMudHJlZS5yZWZpbHRlcigpO1xuXHR9XG5cblx0c2V0QW5jaG9yKGVsZW1lbnQ6IFQgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWUuc2V0QW5jaG9yKHR5cGVvZiBlbGVtZW50ID09PSAndW5kZWZpbmVkJyA/IHVuZGVmaW5lZCA6IHRoaXMuZ2V0RGF0YU5vZGUoZWxlbWVudCkpO1xuXHR9XG5cblx0Z2V0QW5jaG9yKCk6IFQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG5vZGUgPSB0aGlzLnRyZWUuZ2V0QW5jaG9yKCk7XG5cdFx0cmV0dXJuIG5vZGU/LmVsZW1lbnQgYXMgVDtcblx0fVxuXG5cdHNldFNlbGVjdGlvbihlbGVtZW50czogVFtdLCBicm93c2VyRXZlbnQ/OiBVSUV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3Qgbm9kZXMgPSBlbGVtZW50cy5tYXAoZSA9PiB0aGlzLmdldERhdGFOb2RlKGUpKTtcblx0XHR0aGlzLnRyZWUuc2V0U2VsZWN0aW9uKG5vZGVzLCBicm93c2VyRXZlbnQpO1xuXHR9XG5cblx0Z2V0U2VsZWN0aW9uKCk6IFRbXSB7XG5cdFx0Y29uc3Qgbm9kZXMgPSB0aGlzLnRyZWUuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0cmV0dXJuIG5vZGVzLm1hcChuID0+IG4hLmVsZW1lbnQgYXMgVCk7XG5cdH1cblxuXHRzZXRGb2N1cyhlbGVtZW50czogVFtdLCBicm93c2VyRXZlbnQ/OiBVSUV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3Qgbm9kZXMgPSBlbGVtZW50cy5tYXAoZSA9PiB0aGlzLmdldERhdGFOb2RlKGUpKTtcblx0XHR0aGlzLnRyZWUuc2V0Rm9jdXMobm9kZXMsIGJyb3dzZXJFdmVudCk7XG5cdH1cblxuXHRmb2N1c05leHQobiA9IDEsIGxvb3AgPSBmYWxzZSwgYnJvd3NlckV2ZW50PzogVUlFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMudHJlZS5mb2N1c05leHQobiwgbG9vcCwgYnJvd3NlckV2ZW50LCB0aGlzLmZvY3VzTmF2aWdhdGlvbkZpbHRlcik7XG5cdH1cblxuXHRmb2N1c1ByZXZpb3VzKG4gPSAxLCBsb29wID0gZmFsc2UsIGJyb3dzZXJFdmVudD86IFVJRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWUuZm9jdXNQcmV2aW91cyhuLCBsb29wLCBicm93c2VyRXZlbnQsIHRoaXMuZm9jdXNOYXZpZ2F0aW9uRmlsdGVyKTtcblx0fVxuXG5cdGZvY3VzTmV4dFBhZ2UoYnJvd3NlckV2ZW50PzogVUlFdmVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnRyZWUuZm9jdXNOZXh0UGFnZShicm93c2VyRXZlbnQsIHRoaXMuZm9jdXNOYXZpZ2F0aW9uRmlsdGVyKTtcblx0fVxuXG5cdGZvY3VzUHJldmlvdXNQYWdlKGJyb3dzZXJFdmVudD86IFVJRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy50cmVlLmZvY3VzUHJldmlvdXNQYWdlKGJyb3dzZXJFdmVudCwgdGhpcy5mb2N1c05hdmlnYXRpb25GaWx0ZXIpO1xuXHR9XG5cblx0Zm9jdXNMYXN0KGJyb3dzZXJFdmVudD86IFVJRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWUuZm9jdXNMYXN0KGJyb3dzZXJFdmVudCwgdGhpcy5mb2N1c05hdmlnYXRpb25GaWx0ZXIpO1xuXHR9XG5cblx0Zm9jdXNGaXJzdChicm93c2VyRXZlbnQ/OiBVSUV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy50cmVlLmZvY3VzRmlyc3QoYnJvd3NlckV2ZW50LCB0aGlzLmZvY3VzTmF2aWdhdGlvbkZpbHRlcik7XG5cdH1cblxuXHRnZXRGb2N1cygpOiBUW10ge1xuXHRcdGNvbnN0IG5vZGVzID0gdGhpcy50cmVlLmdldEZvY3VzKCk7XG5cdFx0cmV0dXJuIG5vZGVzLm1hcChuID0+IG4hLmVsZW1lbnQgYXMgVCk7XG5cdH1cblxuXHRnZXRTdGlja3lTY3JvbGxGb2N1cygpOiBUW10ge1xuXHRcdGNvbnN0IG5vZGVzID0gdGhpcy50cmVlLmdldFN0aWNreVNjcm9sbEZvY3VzKCk7XG5cdFx0cmV0dXJuIG5vZGVzLm1hcChuID0+IG4hLmVsZW1lbnQgYXMgVCk7XG5cdH1cblxuXHRnZXRGb2N1c2VkUGFydCgpOiBBYnN0cmFjdFRyZWVQYXJ0IHtcblx0XHRyZXR1cm4gdGhpcy50cmVlLmdldEZvY3VzZWRQYXJ0KCk7XG5cdH1cblxuXHRyZXZlYWwoZWxlbWVudDogVCwgcmVsYXRpdmVUb3A/OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWUucmV2ZWFsKHRoaXMuZ2V0RGF0YU5vZGUoZWxlbWVudCksIHJlbGF0aXZlVG9wKTtcblx0fVxuXG5cdGdldFJlbGF0aXZlVG9wKGVsZW1lbnQ6IFQpOiBudW1iZXIgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy50cmVlLmdldFJlbGF0aXZlVG9wKHRoaXMuZ2V0RGF0YU5vZGUoZWxlbWVudCkpO1xuXHR9XG5cblx0Ly8gVHJlZSBuYXZpZ2F0aW9uXG5cblx0Z2V0UGFyZW50RWxlbWVudChlbGVtZW50OiBUKTogVElucHV0IHwgVCB7XG5cdFx0Y29uc3Qgbm9kZSA9IHRoaXMudHJlZS5nZXRQYXJlbnRFbGVtZW50KHRoaXMuZ2V0RGF0YU5vZGUoZWxlbWVudCkpO1xuXHRcdHJldHVybiAobm9kZSAmJiBub2RlLmVsZW1lbnQpITtcblx0fVxuXG5cdGdldEZpcnN0RWxlbWVudENoaWxkKGVsZW1lbnQ6IFRJbnB1dCB8IFQgPSB0aGlzLnJvb3QuZWxlbWVudCk6IFRJbnB1dCB8IFQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGRhdGFOb2RlID0gdGhpcy5nZXREYXRhTm9kZShlbGVtZW50KTtcblx0XHRjb25zdCBub2RlID0gdGhpcy50cmVlLmdldEZpcnN0RWxlbWVudENoaWxkKGRhdGFOb2RlID09PSB0aGlzLnJvb3QgPyBudWxsIDogZGF0YU5vZGUpO1xuXHRcdHJldHVybiAobm9kZSAmJiBub2RlLmVsZW1lbnQpITtcblx0fVxuXG5cdC8vIEltcGxlbWVudGF0aW9uXG5cblx0cHJvdGVjdGVkIGdldERhdGFOb2RlKGVsZW1lbnQ6IFRJbnB1dCB8IFQpOiBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiB7XG5cdFx0Y29uc3Qgbm9kZTogSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4gfCB1bmRlZmluZWQgPSB0aGlzLm5vZGVzLmdldCgoZWxlbWVudCA9PT0gdGhpcy5yb290LmVsZW1lbnQgPyBudWxsIDogZWxlbWVudCkgYXMgVCk7XG5cblx0XHRpZiAoIW5vZGUpIHtcblx0XHRcdGNvbnN0IG5vZGVJZGVudGl0eSA9IHRoaXMuaWRlbnRpdHlQcm92aWRlcj8uZ2V0SWQoZWxlbWVudCBhcyBUKS50b1N0cmluZygpO1xuXHRcdFx0dGhyb3cgbmV3IFRyZWVFcnJvcih0aGlzLnVzZXIsIGBEYXRhIHRyZWUgbm9kZSBub3QgZm91bmQke25vZGVJZGVudGl0eSA/IGA6ICR7bm9kZUlkZW50aXR5fWAgOiAnJ31gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbm9kZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVmcmVzaEFuZFJlbmRlck5vZGUobm9kZTogSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4sIHJlY3Vyc2l2ZTogYm9vbGVhbiwgdmlld1N0YXRlQ29udGV4dD86IElBc3luY0RhdGFUcmVlVmlld1N0YXRlQ29udGV4dDxUSW5wdXQsIFQ+LCBvcHRpb25zPzogSUFzeW5jRGF0YVRyZWVVcGRhdGVDaGlsZHJlbk9wdGlvbnM8VD4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5kaXNwb3NhYmxlcy5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47IC8vIHRyZWUgZGlzcG9zZWQgZHVyaW5nIHJlZnJlc2gsIGFnYWluICgjMjI4MjExKVxuXHRcdH1cblx0XHRhd2FpdCB0aGlzLnJlZnJlc2hOb2RlKG5vZGUsIHJlY3Vyc2l2ZSwgdmlld1N0YXRlQ29udGV4dCk7XG5cdFx0aWYgKHRoaXMuZGlzcG9zYWJsZXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuOyAvLyB0cmVlIGRpc3Bvc2VkIGR1cmluZyByZWZyZXNoICgjMTk5MjY0KVxuXHRcdH1cblx0XHR0aGlzLnJlbmRlcihub2RlLCB2aWV3U3RhdGVDb250ZXh0LCBvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVmcmVzaE5vZGUobm9kZTogSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4sIHJlY3Vyc2l2ZTogYm9vbGVhbiwgdmlld1N0YXRlQ29udGV4dD86IElBc3luY0RhdGFUcmVlVmlld1N0YXRlQ29udGV4dDxUSW5wdXQsIFQ+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IHJlc3VsdDogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMuc3ViVHJlZVJlZnJlc2hQcm9taXNlcy5mb3JFYWNoKChyZWZyZXNoUHJvbWlzZSwgcmVmcmVzaE5vZGUpID0+IHtcblx0XHRcdGlmICghcmVzdWx0ICYmIGludGVyc2VjdHMocmVmcmVzaE5vZGUsIG5vZGUpKSB7XG5cdFx0XHRcdHJlc3VsdCA9IHJlZnJlc2hQcm9taXNlLnRoZW4oKCkgPT4gdGhpcy5yZWZyZXNoTm9kZShub2RlLCByZWN1cnNpdmUsIHZpZXdTdGF0ZUNvbnRleHQpKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0aWYgKG5vZGUgIT09IHRoaXMucm9vdCkge1xuXHRcdFx0Y29uc3QgdHJlZU5vZGUgPSB0aGlzLnRyZWUuZ2V0Tm9kZShub2RlKTtcblxuXHRcdFx0aWYgKHRyZWVOb2RlLmNvbGxhcHNlZCkge1xuXHRcdFx0XHRub2RlLmhhc0NoaWxkcmVuID0gISF0aGlzLmRhdGFTb3VyY2UuaGFzQ2hpbGRyZW4obm9kZS5lbGVtZW50KTtcblx0XHRcdFx0bm9kZS5zdGFsZSA9IHRydWU7XG5cdFx0XHRcdHRoaXMuc2V0Q2hpbGRyZW4obm9kZSwgW10sIHJlY3Vyc2l2ZSwgdmlld1N0YXRlQ29udGV4dCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZG9SZWZyZXNoU3ViVHJlZShub2RlLCByZWN1cnNpdmUsIHZpZXdTdGF0ZUNvbnRleHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1JlZnJlc2hTdWJUcmVlKG5vZGU6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+LCByZWN1cnNpdmU6IGJvb2xlYW4sIHZpZXdTdGF0ZUNvbnRleHQ/OiBJQXN5bmNEYXRhVHJlZVZpZXdTdGF0ZUNvbnRleHQ8VElucHV0LCBUPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNhbmNlbGFibGVQcm9taXNlID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2hpbGRyZW5Ub1JlZnJlc2ggPSBhd2FpdCB0aGlzLmRvUmVmcmVzaE5vZGUobm9kZSwgcmVjdXJzaXZlLCB2aWV3U3RhdGVDb250ZXh0KTtcblx0XHRcdG5vZGUuc3RhbGUgPSBmYWxzZTtcblxuXHRcdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZChjaGlsZHJlblRvUmVmcmVzaC5tYXAoY2hpbGQgPT4gdGhpcy5kb1JlZnJlc2hTdWJUcmVlKGNoaWxkLCByZWN1cnNpdmUsIHZpZXdTdGF0ZUNvbnRleHQpKSk7XG5cdFx0fSk7XG5cblx0XHRub2RlLnJlZnJlc2hQcm9taXNlID0gY2FuY2VsYWJsZVByb21pc2U7XG5cdFx0dGhpcy5zdWJUcmVlUmVmcmVzaFByb21pc2VzLnNldChub2RlLCBjYW5jZWxhYmxlUHJvbWlzZSk7XG5cblx0XHRjYW5jZWxhYmxlUHJvbWlzZS5maW5hbGx5KCgpID0+IHtcblx0XHRcdG5vZGUucmVmcmVzaFByb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnN1YlRyZWVSZWZyZXNoUHJvbWlzZXMuZGVsZXRlKG5vZGUpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGNhbmNlbGFibGVQcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1JlZnJlc2hOb2RlKG5vZGU6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+LCByZWN1cnNpdmU6IGJvb2xlYW4sIHZpZXdTdGF0ZUNvbnRleHQ/OiBJQXN5bmNEYXRhVHJlZVZpZXdTdGF0ZUNvbnRleHQ8VElucHV0LCBUPik6IFByb21pc2U8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD5bXT4ge1xuXHRcdG5vZGUuaGFzQ2hpbGRyZW4gPSAhIXRoaXMuZGF0YVNvdXJjZS5oYXNDaGlsZHJlbihub2RlLmVsZW1lbnQpO1xuXG5cdFx0bGV0IGNoaWxkcmVuUHJvbWlzZTogUHJvbWlzZTxJdGVyYWJsZTxUPj47XG5cblx0XHRpZiAoIW5vZGUuaGFzQ2hpbGRyZW4pIHtcblx0XHRcdGNoaWxkcmVuUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShJdGVyYWJsZS5lbXB0eSgpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgY2hpbGRyZW4gPSB0aGlzLmRvR2V0Q2hpbGRyZW4obm9kZSk7XG5cdFx0XHRpZiAoaXNJdGVyYWJsZShjaGlsZHJlbikpIHtcblx0XHRcdFx0Y2hpbGRyZW5Qcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKGNoaWxkcmVuKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHNsb3dUaW1lb3V0ID0gdGltZW91dCg4MDApO1xuXG5cdFx0XHRcdHNsb3dUaW1lb3V0LnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdG5vZGUuc2xvdyA9IHRydWU7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VOb2RlU2xvd1N0YXRlLmZpcmUobm9kZSk7XG5cdFx0XHRcdH0sIF8gPT4gbnVsbCk7XG5cblx0XHRcdFx0Y2hpbGRyZW5Qcm9taXNlID0gY2hpbGRyZW4uZmluYWxseSgoKSA9PiBzbG93VGltZW91dC5jYW5jZWwoKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNoaWxkcmVuID0gYXdhaXQgY2hpbGRyZW5Qcm9taXNlO1xuXHRcdFx0cmV0dXJuIHRoaXMuc2V0Q2hpbGRyZW4obm9kZSwgY2hpbGRyZW4sIHJlY3Vyc2l2ZSwgdmlld1N0YXRlQ29udGV4dCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAobm9kZSAhPT0gdGhpcy5yb290ICYmIHRoaXMudHJlZS5oYXNFbGVtZW50KG5vZGUpKSB7XG5cdFx0XHRcdHRoaXMudHJlZS5jb2xsYXBzZShub2RlKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cblx0XHRcdHRocm93IGVycjtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKG5vZGUuc2xvdykge1xuXHRcdFx0XHRub2RlLnNsb3cgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VOb2RlU2xvd1N0YXRlLmZpcmUobm9kZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb0dldENoaWxkcmVuKG5vZGU6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+KTogUHJvbWlzZTxJdGVyYWJsZTxUPj4gfCBJdGVyYWJsZTxUPiB7XG5cdFx0bGV0IHJlc3VsdCA9IHRoaXMucmVmcmVzaFByb21pc2VzLmdldChub2RlKTtcblxuXHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNoaWxkcmVuID0gdGhpcy5kYXRhU291cmNlLmdldENoaWxkcmVuKG5vZGUuZWxlbWVudCk7XG5cdFx0aWYgKGlzSXRlcmFibGUoY2hpbGRyZW4pKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5wcm9jZXNzQ2hpbGRyZW4oY2hpbGRyZW4pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXN1bHQgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZShhc3luYyAoKSA9PiB0aGlzLnByb2Nlc3NDaGlsZHJlbihhd2FpdCBjaGlsZHJlbikpO1xuXHRcdFx0dGhpcy5yZWZyZXNoUHJvbWlzZXMuc2V0KG5vZGUsIHJlc3VsdCk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0LmZpbmFsbHkoKCkgPT4geyB0aGlzLnJlZnJlc2hQcm9taXNlcy5kZWxldGUobm9kZSk7IH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlQ29sbGFwc2VTdGF0ZSh7IG5vZGUsIGRlZXAgfTogSUNvbGxhcHNlU3RhdGVDaGFuZ2VFdmVudDxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiB8IG51bGwsIFRGaWx0ZXJEYXRhPik6IHZvaWQge1xuXHRcdGlmIChub2RlLmVsZW1lbnQgPT09IG51bGwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIW5vZGUuY29sbGFwc2VkICYmIG5vZGUuZWxlbWVudC5zdGFsZSkge1xuXHRcdFx0aWYgKGRlZXApIHtcblx0XHRcdFx0dGhpcy5jb2xsYXBzZShub2RlLmVsZW1lbnQuZWxlbWVudCBhcyBUKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMucmVmcmVzaEFuZFJlbmRlck5vZGUobm9kZS5lbGVtZW50LCBmYWxzZSlcblx0XHRcdFx0XHQuY2F0Y2gob25VbmV4cGVjdGVkRXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0Q2hpbGRyZW4obm9kZTogSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4sIGNoaWxkcmVuRWxlbWVudHNJdGVyYWJsZTogSXRlcmFibGU8VD4sIHJlY3Vyc2l2ZTogYm9vbGVhbiwgdmlld1N0YXRlQ29udGV4dD86IElBc3luY0RhdGFUcmVlVmlld1N0YXRlQ29udGV4dDxUSW5wdXQsIFQ+KTogSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD5bXSB7XG5cdFx0Y29uc3QgY2hpbGRyZW5FbGVtZW50cyA9IFsuLi5jaGlsZHJlbkVsZW1lbnRzSXRlcmFibGVdO1xuXG5cdFx0Ly8gcGVyZjogaWYgdGhlIG5vZGUgd2FzIGFuZCBzdGlsbCBpcyBhIGxlYWYsIGF2b2lkIGFsbCB0aGlzIGhhc3NsZVxuXHRcdGlmIChub2RlLmNoaWxkcmVuLmxlbmd0aCA9PT0gMCAmJiBjaGlsZHJlbkVsZW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vZGVzVG9Gb3JnZXQgPSBuZXcgTWFwPFQsIElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+PigpO1xuXHRcdGNvbnN0IGNoaWxkcmVuVHJlZU5vZGVzQnlJZCA9IG5ldyBNYXA8c3RyaW5nLCB7IG5vZGU6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+OyBjb2xsYXBzZWQ6IGJvb2xlYW4gfT4oKTtcblxuXHRcdGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZS5jaGlsZHJlbikge1xuXHRcdFx0bm9kZXNUb0ZvcmdldC5zZXQoY2hpbGQuZWxlbWVudCBhcyBULCBjaGlsZCk7XG5cblx0XHRcdGlmICh0aGlzLmlkZW50aXR5UHJvdmlkZXIpIHtcblx0XHRcdFx0Y2hpbGRyZW5UcmVlTm9kZXNCeUlkLnNldChjaGlsZC5pZCEsIHsgbm9kZTogY2hpbGQsIGNvbGxhcHNlZDogdGhpcy50cmVlLmhhc0VsZW1lbnQoY2hpbGQpICYmIHRoaXMudHJlZS5pc0NvbGxhcHNlZChjaGlsZCkgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hpbGRyZW5Ub1JlZnJlc2g6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+W10gPSBbXTtcblxuXHRcdGNvbnN0IGNoaWxkcmVuID0gY2hpbGRyZW5FbGVtZW50cy5tYXA8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4+KGVsZW1lbnQgPT4ge1xuXHRcdFx0Y29uc3QgaGFzQ2hpbGRyZW4gPSAhIXRoaXMuZGF0YVNvdXJjZS5oYXNDaGlsZHJlbihlbGVtZW50KTtcblxuXHRcdFx0aWYgKCF0aGlzLmlkZW50aXR5UHJvdmlkZXIpIHtcblx0XHRcdFx0Y29uc3QgYXN5bmNEYXRhVHJlZU5vZGUgPSBjcmVhdGVBc3luY0RhdGFUcmVlTm9kZSh7IGVsZW1lbnQsIHBhcmVudDogbm9kZSwgaGFzQ2hpbGRyZW4sIGRlZmF1bHRDb2xsYXBzZVN0YXRlOiB0aGlzLmdldERlZmF1bHRDb2xsYXBzZVN0YXRlKGVsZW1lbnQpIH0pO1xuXG5cdFx0XHRcdGlmIChoYXNDaGlsZHJlbiAmJiBhc3luY0RhdGFUcmVlTm9kZS5kZWZhdWx0Q29sbGFwc2VTdGF0ZSA9PT0gT2JqZWN0VHJlZUVsZW1lbnRDb2xsYXBzZVN0YXRlLlByZXNlcnZlT3JFeHBhbmRlZCkge1xuXHRcdFx0XHRcdGNoaWxkcmVuVG9SZWZyZXNoLnB1c2goYXN5bmNEYXRhVHJlZU5vZGUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGFzeW5jRGF0YVRyZWVOb2RlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpZCA9IHRoaXMuaWRlbnRpdHlQcm92aWRlci5nZXRJZChlbGVtZW50KS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY2hpbGRyZW5UcmVlTm9kZXNCeUlkLmdldChpZCk7XG5cblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0Y29uc3QgYXN5bmNEYXRhVHJlZU5vZGUgPSByZXN1bHQubm9kZTtcblxuXHRcdFx0XHRub2Rlc1RvRm9yZ2V0LmRlbGV0ZShhc3luY0RhdGFUcmVlTm9kZS5lbGVtZW50IGFzIFQpO1xuXHRcdFx0XHR0aGlzLm5vZGVzLmRlbGV0ZShhc3luY0RhdGFUcmVlTm9kZS5lbGVtZW50IGFzIFQpO1xuXHRcdFx0XHR0aGlzLm5vZGVzLnNldChlbGVtZW50LCBhc3luY0RhdGFUcmVlTm9kZSk7XG5cblx0XHRcdFx0YXN5bmNEYXRhVHJlZU5vZGUuZWxlbWVudCA9IGVsZW1lbnQ7XG5cdFx0XHRcdGFzeW5jRGF0YVRyZWVOb2RlLmhhc0NoaWxkcmVuID0gaGFzQ2hpbGRyZW47XG5cblx0XHRcdFx0aWYgKHJlY3Vyc2l2ZSkge1xuXHRcdFx0XHRcdGlmIChyZXN1bHQuY29sbGFwc2VkKSB7XG5cdFx0XHRcdFx0XHRhc3luY0RhdGFUcmVlTm9kZS5jaGlsZHJlbi5mb3JFYWNoKG5vZGUgPT4gZGZzKG5vZGUsIG5vZGUgPT4gdGhpcy5ub2Rlcy5kZWxldGUobm9kZS5lbGVtZW50IGFzIFQpKSk7XG5cdFx0XHRcdFx0XHRhc3luY0RhdGFUcmVlTm9kZS5jaGlsZHJlbi5zcGxpY2UoMCwgYXN5bmNEYXRhVHJlZU5vZGUuY2hpbGRyZW4ubGVuZ3RoKTtcblx0XHRcdFx0XHRcdGFzeW5jRGF0YVRyZWVOb2RlLnN0YWxlID0gdHJ1ZTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y2hpbGRyZW5Ub1JlZnJlc2gucHVzaChhc3luY0RhdGFUcmVlTm9kZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKGhhc0NoaWxkcmVuICYmICFyZXN1bHQuY29sbGFwc2VkKSB7XG5cdFx0XHRcdFx0Y2hpbGRyZW5Ub1JlZnJlc2gucHVzaChhc3luY0RhdGFUcmVlTm9kZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gYXN5bmNEYXRhVHJlZU5vZGU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNoaWxkQXN5bmNEYXRhVHJlZU5vZGUgPSBjcmVhdGVBc3luY0RhdGFUcmVlTm9kZSh7IGVsZW1lbnQsIHBhcmVudDogbm9kZSwgaWQsIGhhc0NoaWxkcmVuLCBkZWZhdWx0Q29sbGFwc2VTdGF0ZTogdGhpcy5nZXREZWZhdWx0Q29sbGFwc2VTdGF0ZShlbGVtZW50KSB9KTtcblxuXHRcdFx0aWYgKHZpZXdTdGF0ZUNvbnRleHQgJiYgdmlld1N0YXRlQ29udGV4dC52aWV3U3RhdGUuZm9jdXMgJiYgdmlld1N0YXRlQ29udGV4dC52aWV3U3RhdGUuZm9jdXMuaW5kZXhPZihpZCkgPiAtMSkge1xuXHRcdFx0XHR2aWV3U3RhdGVDb250ZXh0LmZvY3VzLnB1c2goY2hpbGRBc3luY0RhdGFUcmVlTm9kZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh2aWV3U3RhdGVDb250ZXh0ICYmIHZpZXdTdGF0ZUNvbnRleHQudmlld1N0YXRlLnNlbGVjdGlvbiAmJiB2aWV3U3RhdGVDb250ZXh0LnZpZXdTdGF0ZS5zZWxlY3Rpb24uaW5kZXhPZihpZCkgPiAtMSkge1xuXHRcdFx0XHR2aWV3U3RhdGVDb250ZXh0LnNlbGVjdGlvbi5wdXNoKGNoaWxkQXN5bmNEYXRhVHJlZU5vZGUpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodmlld1N0YXRlQ29udGV4dCAmJiB2aWV3U3RhdGVDb250ZXh0LnZpZXdTdGF0ZS5leHBhbmRlZCAmJiB2aWV3U3RhdGVDb250ZXh0LnZpZXdTdGF0ZS5leHBhbmRlZC5pbmRleE9mKGlkKSA+IC0xKSB7XG5cdFx0XHRcdGNoaWxkcmVuVG9SZWZyZXNoLnB1c2goY2hpbGRBc3luY0RhdGFUcmVlTm9kZSk7XG5cdFx0XHR9IGVsc2UgaWYgKGhhc0NoaWxkcmVuICYmIGNoaWxkQXN5bmNEYXRhVHJlZU5vZGUuZGVmYXVsdENvbGxhcHNlU3RhdGUgPT09IE9iamVjdFRyZWVFbGVtZW50Q29sbGFwc2VTdGF0ZS5QcmVzZXJ2ZU9yRXhwYW5kZWQpIHtcblx0XHRcdFx0Y2hpbGRyZW5Ub1JlZnJlc2gucHVzaChjaGlsZEFzeW5jRGF0YVRyZWVOb2RlKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGNoaWxkQXN5bmNEYXRhVHJlZU5vZGU7XG5cdFx0fSk7XG5cblx0XHRmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXNUb0ZvcmdldC52YWx1ZXMoKSkge1xuXHRcdFx0ZGZzKG5vZGUsIG5vZGUgPT4gdGhpcy5ub2Rlcy5kZWxldGUobm9kZS5lbGVtZW50IGFzIFQpKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XG5cdFx0XHR0aGlzLm5vZGVzLnNldChjaGlsZC5lbGVtZW50IGFzIFQsIGNoaWxkKTtcblx0XHR9XG5cblx0XHRzcGxpY2Uobm9kZS5jaGlsZHJlbiwgMCwgbm9kZS5jaGlsZHJlbi5sZW5ndGgsIGNoaWxkcmVuKTtcblxuXHRcdC8vIFRPRE9Aam9hbyB0aGlzIGRvZXNuJ3QgdGFrZSBmaWx0ZXIgaW50byBhY2NvdW50XG5cdFx0aWYgKG5vZGUgIT09IHRoaXMucm9vdCAmJiB0aGlzLmF1dG9FeHBhbmRTaW5nbGVDaGlsZHJlbiAmJiBjaGlsZHJlbi5sZW5ndGggPT09IDEgJiYgY2hpbGRyZW5Ub1JlZnJlc2gubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRjaGlsZHJlblswXS5mb3JjZUV4cGFuZGVkID0gdHJ1ZTtcblx0XHRcdGNoaWxkcmVuVG9SZWZyZXNoLnB1c2goY2hpbGRyZW5bMF0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBjaGlsZHJlblRvUmVmcmVzaDtcblx0fVxuXG5cdHByb3RlY3RlZCByZW5kZXIobm9kZTogSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4sIHZpZXdTdGF0ZUNvbnRleHQ/OiBJQXN5bmNEYXRhVHJlZVZpZXdTdGF0ZUNvbnRleHQ8VElucHV0LCBUPiwgb3B0aW9ucz86IElBc3luY0RhdGFUcmVlVXBkYXRlQ2hpbGRyZW5PcHRpb25zPFQ+KTogdm9pZCB7XG5cdFx0Y29uc3QgY2hpbGRyZW4gPSBub2RlLmNoaWxkcmVuLm1hcChub2RlID0+IHRoaXMuYXNUcmVlRWxlbWVudChub2RlLCB2aWV3U3RhdGVDb250ZXh0KSk7XG5cdFx0Y29uc3Qgb2JqZWN0VHJlZU9wdGlvbnM6IElPYmplY3RUcmVlU2V0Q2hpbGRyZW5PcHRpb25zPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+PiB8IHVuZGVmaW5lZCA9IG9wdGlvbnMgJiYge1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdGRpZmZJZGVudGl0eVByb3ZpZGVyOiBvcHRpb25zLmRpZmZJZGVudGl0eVByb3ZpZGVyICYmIHtcblx0XHRcdFx0Z2V0SWQobm9kZTogSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4pOiB7IHRvU3RyaW5nKCk6IHN0cmluZyB9IHtcblx0XHRcdFx0XHRyZXR1cm4gb3B0aW9ucy5kaWZmSWRlbnRpdHlQcm92aWRlciEuZ2V0SWQobm9kZS5lbGVtZW50IGFzIFQpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRHcm91cElkOiBvcHRpb25zLmRpZmZJZGVudGl0eVByb3ZpZGVyIS5nZXRHcm91cElkID8gKG5vZGU6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+KTogbnVtYmVyIHwgTm90U2VsZWN0YWJsZUdyb3VwSWRUeXBlID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gb3B0aW9ucy5kaWZmSWRlbnRpdHlQcm92aWRlciEuZ2V0R3JvdXBJZCEobm9kZS5lbGVtZW50IGFzIFQpO1xuXHRcdFx0XHR9IDogdW5kZWZpbmVkXG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMudHJlZS5zZXRDaGlsZHJlbihub2RlID09PSB0aGlzLnJvb3QgPyBudWxsIDogbm9kZSwgY2hpbGRyZW4sIG9iamVjdFRyZWVPcHRpb25zKTtcblxuXHRcdGlmIChub2RlICE9PSB0aGlzLnJvb3QpIHtcblx0XHRcdHRoaXMudHJlZS5zZXRDb2xsYXBzaWJsZShub2RlLCBub2RlLmhhc0NoaWxkcmVuKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZFJlbmRlci5maXJlKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXNUcmVlRWxlbWVudChub2RlOiBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiwgdmlld1N0YXRlQ29udGV4dD86IElBc3luY0RhdGFUcmVlVmlld1N0YXRlQ29udGV4dDxUSW5wdXQsIFQ+KTogSU9iamVjdFRyZWVFbGVtZW50PElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+PiB7XG5cdFx0aWYgKG5vZGUuc3RhbGUpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGVsZW1lbnQ6IG5vZGUsXG5cdFx0XHRcdGNvbGxhcHNpYmxlOiBub2RlLmhhc0NoaWxkcmVuLFxuXHRcdFx0XHRjb2xsYXBzZWQ6IHRydWVcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0bGV0IGNvbGxhcHNlZDogYm9vbGVhbiB8IE9iamVjdFRyZWVFbGVtZW50Q29sbGFwc2VTdGF0ZS5QcmVzZXJ2ZU9yQ29sbGFwc2VkIHwgT2JqZWN0VHJlZUVsZW1lbnRDb2xsYXBzZVN0YXRlLlByZXNlcnZlT3JFeHBhbmRlZCB8IHVuZGVmaW5lZDtcblxuXHRcdGlmICh2aWV3U3RhdGVDb250ZXh0ICYmIHZpZXdTdGF0ZUNvbnRleHQudmlld1N0YXRlLmV4cGFuZGVkICYmIG5vZGUuaWQgJiYgdmlld1N0YXRlQ29udGV4dC52aWV3U3RhdGUuZXhwYW5kZWQuaW5kZXhPZihub2RlLmlkKSA+IC0xKSB7XG5cdFx0XHRjb2xsYXBzZWQgPSBmYWxzZTtcblx0XHR9IGVsc2UgaWYgKG5vZGUuZm9yY2VFeHBhbmRlZCkge1xuXHRcdFx0Y29sbGFwc2VkID0gZmFsc2U7XG5cdFx0XHRub2RlLmZvcmNlRXhwYW5kZWQgPSBmYWxzZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29sbGFwc2VkID0gbm9kZS5kZWZhdWx0Q29sbGFwc2VTdGF0ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZWxlbWVudDogbm9kZSxcblx0XHRcdGNoaWxkcmVuOiBub2RlLmhhc0NoaWxkcmVuID8gSXRlcmFibGUubWFwKG5vZGUuY2hpbGRyZW4sIGNoaWxkID0+IHRoaXMuYXNUcmVlRWxlbWVudChjaGlsZCwgdmlld1N0YXRlQ29udGV4dCkpIDogW10sXG5cdFx0XHRjb2xsYXBzaWJsZTogbm9kZS5oYXNDaGlsZHJlbixcblx0XHRcdGNvbGxhcHNlZFxuXHRcdH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgcHJvY2Vzc0NoaWxkcmVuKGNoaWxkcmVuOiBJdGVyYWJsZTxUPik6IEl0ZXJhYmxlPFQ+IHtcblx0XHRpZiAodGhpcy5zb3J0ZXIpIHtcblx0XHRcdGNoaWxkcmVuID0gWy4uLmNoaWxkcmVuXS5zb3J0KHRoaXMuc29ydGVyLmNvbXBhcmUuYmluZCh0aGlzLnNvcnRlcikpO1xuXHRcdH1cblxuXHRcdHJldHVybiBjaGlsZHJlbjtcblx0fVxuXG5cdC8vIHZpZXcgc3RhdGVcblxuXHRnZXRWaWV3U3RhdGUoKTogSUFzeW5jRGF0YVRyZWVWaWV3U3RhdGUge1xuXHRcdGlmICghdGhpcy5pZGVudGl0eVByb3ZpZGVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgVHJlZUVycm9yKHRoaXMudXNlciwgJ0NhblxcJ3QgZ2V0IHRyZWUgdmlldyBzdGF0ZSB3aXRob3V0IGFuIGlkZW50aXR5IHByb3ZpZGVyJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZ2V0SWQgPSAoZWxlbWVudDogVCkgPT4gdGhpcy5pZGVudGl0eVByb3ZpZGVyIS5nZXRJZChlbGVtZW50KS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGZvY3VzID0gdGhpcy5nZXRGb2N1cygpLm1hcChnZXRJZCk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5nZXRTZWxlY3Rpb24oKS5tYXAoZ2V0SWQpO1xuXG5cdFx0Y29uc3QgZXhwYW5kZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3Qgcm9vdCA9IHRoaXMudHJlZS5nZXROb2RlKCk7XG5cdFx0Y29uc3Qgc3RhY2sgPSBbcm9vdF07XG5cblx0XHR3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHN0YWNrLnBvcCgpITtcblxuXHRcdFx0aWYgKG5vZGUgIT09IHJvb3QgJiYgbm9kZS5jb2xsYXBzaWJsZSAmJiAhbm9kZS5jb2xsYXBzZWQpIHtcblx0XHRcdFx0ZXhwYW5kZWQucHVzaChnZXRJZChub2RlLmVsZW1lbnQhLmVsZW1lbnQgYXMgVCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpbnNlcnRJbnRvKHN0YWNrLCBzdGFjay5sZW5ndGgsIG5vZGUuY2hpbGRyZW4pO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGZvY3VzLCBzZWxlY3Rpb24sIGV4cGFuZGVkLCBzY3JvbGxUb3A6IHRoaXMuc2Nyb2xsVG9wIH07XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkUmVuZGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZU5vZGVTbG93U3RhdGUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMudHJlZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxudHlwZSBDb21wcmVzc2libGVBc3luY0RhdGFUcmVlTm9kZU1hcHBlcjxUSW5wdXQsIFQsIFRGaWx0ZXJEYXRhPiA9IFdlYWtNYXBwZXI8SVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4+LCBURmlsdGVyRGF0YT4sIElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPFRJbnB1dCB8IFQ+LCBURmlsdGVyRGF0YT4+O1xuXG5jbGFzcyBDb21wcmVzc2libGVBc3luY0RhdGFUcmVlTm9kZVdyYXBwZXI8VElucHV0LCBULCBURmlsdGVyRGF0YT4gaW1wbGVtZW50cyBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxUSW5wdXQgfCBUPiwgVEZpbHRlckRhdGE+IHtcblxuXHRnZXQgZWxlbWVudCgpOiBJQ29tcHJlc3NlZFRyZWVOb2RlPFRJbnB1dCB8IFQ+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZWxlbWVudHM6IHRoaXMubm9kZS5lbGVtZW50LmVsZW1lbnRzLm1hcChlID0+IGUuZWxlbWVudCksXG5cdFx0XHRpbmNvbXByZXNzaWJsZTogdGhpcy5ub2RlLmVsZW1lbnQuaW5jb21wcmVzc2libGVcblx0XHR9O1xuXHR9XG5cblx0Z2V0IGNoaWxkcmVuKCk6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPFRJbnB1dCB8IFQ+LCBURmlsdGVyRGF0YT5bXSB7IHJldHVybiB0aGlzLm5vZGUuY2hpbGRyZW4ubWFwKG5vZGUgPT4gbmV3IENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWVOb2RlV3JhcHBlcihub2RlKSk7IH1cblx0Z2V0IGRlcHRoKCk6IG51bWJlciB7IHJldHVybiB0aGlzLm5vZGUuZGVwdGg7IH1cblx0Z2V0IHZpc2libGVDaGlsZHJlbkNvdW50KCk6IG51bWJlciB7IHJldHVybiB0aGlzLm5vZGUudmlzaWJsZUNoaWxkcmVuQ291bnQ7IH1cblx0Z2V0IHZpc2libGVDaGlsZEluZGV4KCk6IG51bWJlciB7IHJldHVybiB0aGlzLm5vZGUudmlzaWJsZUNoaWxkSW5kZXg7IH1cblx0Z2V0IGNvbGxhcHNpYmxlKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5ub2RlLmNvbGxhcHNpYmxlOyB9XG5cdGdldCBjb2xsYXBzZWQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLm5vZGUuY29sbGFwc2VkOyB9XG5cdGdldCB2aXNpYmxlKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5ub2RlLnZpc2libGU7IH1cblx0Z2V0IGZpbHRlckRhdGEoKTogVEZpbHRlckRhdGEgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5ub2RlLmZpbHRlckRhdGE7IH1cblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+PiwgVEZpbHRlckRhdGE+KSB7IH1cbn1cblxuY2xhc3MgQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZVJlbmRlcmVyPFRJbnB1dCwgVCwgVEZpbHRlckRhdGEsIFRUZW1wbGF0ZURhdGE+IGltcGxlbWVudHMgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiwgVEZpbHRlckRhdGEsIElEYXRhVHJlZUxpc3RUZW1wbGF0ZURhdGE8VFRlbXBsYXRlRGF0YT4+IHtcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmc7XG5cdHByaXZhdGUgcmVuZGVyZWROb2RlcyA9IG5ldyBNYXA8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4sIElEYXRhVHJlZUxpc3RUZW1wbGF0ZURhdGE8VFRlbXBsYXRlRGF0YT4+KCk7XG5cdHByaXZhdGUgZGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgcmVuZGVyZXI6IElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8VCwgVEZpbHRlckRhdGEsIFRUZW1wbGF0ZURhdGE+LFxuXHRcdHByb3RlY3RlZCBub2RlTWFwcGVyOiBBc3luY0RhdGFUcmVlTm9kZU1hcHBlcjxUSW5wdXQsIFQsIFRGaWx0ZXJEYXRhPixcblx0XHRwcml2YXRlIGNvbXByZXNzaWJsZU5vZGVNYXBwZXJQcm92aWRlcjogKCkgPT4gQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZU5vZGVNYXBwZXI8VElucHV0LCBULCBURmlsdGVyRGF0YT4sXG5cdFx0cmVhZG9ubHkgb25EaWRDaGFuZ2VUd2lzdGllU3RhdGU6IEV2ZW50PElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+PlxuXHQpIHtcblx0XHR0aGlzLnRlbXBsYXRlSWQgPSByZW5kZXJlci50ZW1wbGF0ZUlkO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElEYXRhVHJlZUxpc3RUZW1wbGF0ZURhdGE8VFRlbXBsYXRlRGF0YT4ge1xuXHRcdGNvbnN0IHRlbXBsYXRlRGF0YSA9IHRoaXMucmVuZGVyZXIucmVuZGVyVGVtcGxhdGUoY29udGFpbmVyKTtcblx0XHRyZXR1cm4geyB0ZW1wbGF0ZURhdGEgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+LCBURmlsdGVyRGF0YT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSURhdGFUcmVlTGlzdFRlbXBsYXRlRGF0YTxUVGVtcGxhdGVEYXRhPiwgZGV0YWlscz86IElUcmVlRWxlbWVudFJlbmRlckRldGFpbHMpOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlcmVyLnJlbmRlckVsZW1lbnQodGhpcy5ub2RlTWFwcGVyLm1hcChub2RlKSBhcyBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+LCBpbmRleCwgdGVtcGxhdGVEYXRhLnRlbXBsYXRlRGF0YSwgZGV0YWlscyk7XG5cdH1cblxuXHRyZW5kZXJDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4+LCBURmlsdGVyRGF0YT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSURhdGFUcmVlTGlzdFRlbXBsYXRlRGF0YTxUVGVtcGxhdGVEYXRhPiwgZGV0YWlscz86IElUcmVlRWxlbWVudFJlbmRlckRldGFpbHMpOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlcmVyLnJlbmRlckNvbXByZXNzZWRFbGVtZW50cyh0aGlzLmNvbXByZXNzaWJsZU5vZGVNYXBwZXJQcm92aWRlcigpLm1hcChub2RlKSBhcyBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxUPiwgVEZpbHRlckRhdGE+LCBpbmRleCwgdGVtcGxhdGVEYXRhLnRlbXBsYXRlRGF0YSwgZGV0YWlscyk7XG5cdH1cblxuXHRyZW5kZXJUd2lzdGllKGVsZW1lbnQ6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+LCB0d2lzdGllRWxlbWVudDogSFRNTEVsZW1lbnQpOiBib29sZWFuIHtcblx0XHRpZiAoZWxlbWVudC5zbG93KSB7XG5cdFx0XHR0d2lzdGllRWxlbWVudC5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24udHJlZUl0ZW1Mb2FkaW5nKSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dHdpc3RpZUVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLnRyZWVJdGVtTG9hZGluZykpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiwgVEZpbHRlckRhdGE+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElEYXRhVHJlZUxpc3RUZW1wbGF0ZURhdGE8VFRlbXBsYXRlRGF0YT4sIGRldGFpbHM/OiBJVHJlZUVsZW1lbnRSZW5kZXJEZXRhaWxzKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJlci5kaXNwb3NlRWxlbWVudD8uKHRoaXMubm9kZU1hcHBlci5tYXAobm9kZSkgYXMgSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiwgaW5kZXgsIHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURhdGEsIGRldGFpbHMpO1xuXHR9XG5cblx0ZGlzcG9zZUNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPj4sIFRGaWx0ZXJEYXRhPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRGF0YVRyZWVMaXN0VGVtcGxhdGVEYXRhPFRUZW1wbGF0ZURhdGE+LCBkZXRhaWxzPzogSVRyZWVFbGVtZW50UmVuZGVyRGV0YWlscyk6IHZvaWQge1xuXHRcdHRoaXMucmVuZGVyZXIuZGlzcG9zZUNvbXByZXNzZWRFbGVtZW50cz8uKHRoaXMuY29tcHJlc3NpYmxlTm9kZU1hcHBlclByb3ZpZGVyKCkubWFwKG5vZGUpIGFzIElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPFQ+LCBURmlsdGVyRGF0YT4sIGluZGV4LCB0ZW1wbGF0ZURhdGEudGVtcGxhdGVEYXRhLCBkZXRhaWxzKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElEYXRhVHJlZUxpc3RUZW1wbGF0ZURhdGE8VFRlbXBsYXRlRGF0YT4pOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlcmVyLmRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGEudGVtcGxhdGVEYXRhKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJlZE5vZGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcyA9IGRpc3Bvc2UodGhpcy5kaXNwb3NhYmxlcyk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVHJlZUNvbXByZXNzaW9uRGVsZWdhdGU8VD4ge1xuXHRpc0luY29tcHJlc3NpYmxlKGVsZW1lbnQ6IFQpOiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBhc0NvbXByZXNzaWJsZU9iamVjdFRyZWVPcHRpb25zPFRJbnB1dCwgVCwgVEZpbHRlckRhdGE+KG9wdGlvbnM/OiBJQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+KTogSUNvbXByZXNzaWJsZU9iamVjdFRyZWVPcHRpb25zPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+LCBURmlsdGVyRGF0YT4gfCB1bmRlZmluZWQge1xuXHRjb25zdCBvYmplY3RUcmVlT3B0aW9ucyA9IG9wdGlvbnMgJiYgYXNPYmplY3RUcmVlT3B0aW9ucyhvcHRpb25zKTtcblxuXHRyZXR1cm4gb2JqZWN0VHJlZU9wdGlvbnMgJiYge1xuXHRcdC4uLm9iamVjdFRyZWVPcHRpb25zLFxuXHRcdGtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXI6IG9iamVjdFRyZWVPcHRpb25zLmtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIgJiYge1xuXHRcdFx0Li4ub2JqZWN0VHJlZU9wdGlvbnMua2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcixcblx0XHRcdGdldENvbXByZXNzZWROb2RlS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWwoZWxzKSB7XG5cdFx0XHRcdHJldHVybiBvcHRpb25zLmtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIhLmdldENvbXByZXNzZWROb2RlS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWwoZWxzLm1hcChlID0+IGUuZWxlbWVudCBhcyBUKSk7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRzdGlja3lTY3JvbGxEZWxlZ2F0ZTogb2JqZWN0VHJlZU9wdGlvbnMuc3RpY2t5U2Nyb2xsRGVsZWdhdGUgYXMgSVN0aWNreVNjcm9sbERlbGVnYXRlPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+LCBURmlsdGVyRGF0YT4gfCB1bmRlZmluZWRcblx0fTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGEgPSB2b2lkPiBleHRlbmRzIElBc3luY0RhdGFUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YT4ge1xuXHRyZWFkb25seSBjb21wcmVzc2lvbkVuYWJsZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyPzogSUNvbXByZXNzaWJsZUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXI8VD47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWVPcHRpb25zVXBkYXRlPFQ+IGV4dGVuZHMgSUFzeW5jRGF0YVRyZWVPcHRpb25zVXBkYXRlPFQ+IHtcblx0cmVhZG9ubHkgY29tcHJlc3Npb25FbmFibGVkPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWU8VElucHV0LCBULCBURmlsdGVyRGF0YSA9IHZvaWQ+IGV4dGVuZHMgQXN5bmNEYXRhVHJlZTxUSW5wdXQsIFQsIFRGaWx0ZXJEYXRhPiB7XG5cblx0cHJvdGVjdGVkIGRlY2xhcmUgcmVhZG9ubHkgdHJlZTogQ29tcHJlc3NpYmxlT2JqZWN0VHJlZTxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiwgVEZpbHRlckRhdGE+O1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgY29tcHJlc3NpYmxlTm9kZU1hcHBlcjogQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZU5vZGVNYXBwZXI8VElucHV0LCBULCBURmlsdGVyRGF0YT4gPSBuZXcgV2Vha01hcHBlcihub2RlID0+IG5ldyBDb21wcmVzc2libGVBc3luY0RhdGFUcmVlTm9kZVdyYXBwZXIobm9kZSkpO1xuXHRwcml2YXRlIGZpbHRlcj86IElUcmVlRmlsdGVyPFQsIFRGaWx0ZXJEYXRhPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR1c2VyOiBzdHJpbmcsXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHR2aXJ0dWFsRGVsZWdhdGU6IElMaXN0VmlydHVhbERlbGVnYXRlPFQ+LFxuXHRcdHByaXZhdGUgY29tcHJlc3Npb25EZWxlZ2F0ZTogSVRyZWVDb21wcmVzc2lvbkRlbGVnYXRlPFQ+LFxuXHRcdHJlbmRlcmVyczogSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxULCBURmlsdGVyRGF0YSwgdW5rbm93bj5bXSxcblx0XHRkYXRhU291cmNlOiBJQXN5bmNEYXRhU291cmNlPFRJbnB1dCwgVD4sXG5cdFx0b3B0aW9uczogSUNvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPiA9IHt9XG5cdCkge1xuXHRcdHN1cGVyKHVzZXIsIGNvbnRhaW5lciwgdmlydHVhbERlbGVnYXRlLCByZW5kZXJlcnMsIGRhdGFTb3VyY2UsIG9wdGlvbnMpO1xuXHRcdHRoaXMuZmlsdGVyID0gb3B0aW9ucy5maWx0ZXI7XG5cdH1cblxuXHRnZXRDb21wcmVzc2VkVHJlZU5vZGUoZTogVCB8IFRJbnB1dCkge1xuXHRcdGNvbnN0IG5vZGUgPSB0aGlzLmdldERhdGFOb2RlKGUpO1xuXHRcdHJldHVybiB0aGlzLnRyZWUuZ2V0Q29tcHJlc3NlZFRyZWVOb2RlKG5vZGUpLmVsZW1lbnQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY3JlYXRlVHJlZShcblx0XHR1c2VyOiBzdHJpbmcsXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRkZWxlZ2F0ZTogSUxpc3RWaXJ0dWFsRGVsZWdhdGU8VD4sXG5cdFx0cmVuZGVyZXJzOiBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPFQsIFRGaWx0ZXJEYXRhLCB1bmtub3duPltdLFxuXHRcdG9wdGlvbnM6IElDb21wcmVzc2libGVBc3luY0RhdGFUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YT5cblx0KTogT2JqZWN0VHJlZTxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiwgVEZpbHRlckRhdGE+IHtcblx0XHRjb25zdCBvYmplY3RUcmVlRGVsZWdhdGUgPSBuZXcgQ29tcG9zZWRUcmVlRGVsZWdhdGU8VElucHV0IHwgVCwgSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4+KGRlbGVnYXRlKTtcblx0XHRjb25zdCBvYmplY3RUcmVlUmVuZGVyZXJzID0gcmVuZGVyZXJzLm1hcChyID0+IG5ldyBDb21wcmVzc2libGVBc3luY0RhdGFUcmVlUmVuZGVyZXIociwgdGhpcy5ub2RlTWFwcGVyLCAoKSA9PiB0aGlzLmNvbXByZXNzaWJsZU5vZGVNYXBwZXIsIHRoaXMuX29uRGlkQ2hhbmdlTm9kZVNsb3dTdGF0ZS5ldmVudCkpO1xuXHRcdGNvbnN0IG9iamVjdFRyZWVPcHRpb25zID0gYXNDb21wcmVzc2libGVPYmplY3RUcmVlT3B0aW9uczxUSW5wdXQsIFQsIFRGaWx0ZXJEYXRhPihvcHRpb25zKSB8fCB7fTtcblxuXHRcdHJldHVybiBuZXcgQ29tcHJlc3NpYmxlT2JqZWN0VHJlZSh1c2VyLCBjb250YWluZXIsIG9iamVjdFRyZWVEZWxlZ2F0ZSwgb2JqZWN0VHJlZVJlbmRlcmVycywgb2JqZWN0VHJlZU9wdGlvbnMpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzVHJlZUVsZW1lbnQobm9kZTogSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4sIHZpZXdTdGF0ZUNvbnRleHQ/OiBJQXN5bmNEYXRhVHJlZVZpZXdTdGF0ZUNvbnRleHQ8VElucHV0LCBUPik6IElDb21wcmVzc2VkVHJlZUVsZW1lbnQ8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aW5jb21wcmVzc2libGU6IHRoaXMuY29tcHJlc3Npb25EZWxlZ2F0ZS5pc0luY29tcHJlc3NpYmxlKG5vZGUuZWxlbWVudCBhcyBUKSxcblx0XHRcdC4uLnN1cGVyLmFzVHJlZUVsZW1lbnQobm9kZSwgdmlld1N0YXRlQ29udGV4dClcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0Vmlld1N0YXRlKCk6IElBc3luY0RhdGFUcmVlVmlld1N0YXRlIHtcblx0XHRpZiAoIXRoaXMuaWRlbnRpdHlQcm92aWRlcikge1xuXHRcdFx0dGhyb3cgbmV3IFRyZWVFcnJvcih0aGlzLnVzZXIsICdDYW5cXCd0IGdldCB0cmVlIHZpZXcgc3RhdGUgd2l0aG91dCBhbiBpZGVudGl0eSBwcm92aWRlcicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGdldElkID0gKGVsZW1lbnQ6IFQpID0+IHRoaXMuaWRlbnRpdHlQcm92aWRlciEuZ2V0SWQoZWxlbWVudCkudG9TdHJpbmcoKTtcblx0XHRjb25zdCBmb2N1cyA9IHRoaXMuZ2V0Rm9jdXMoKS5tYXAoZ2V0SWQpO1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMuZ2V0U2VsZWN0aW9uKCkubWFwKGdldElkKTtcblxuXHRcdGNvbnN0IGV4cGFuZGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHJvb3QgPSB0aGlzLnRyZWUuZ2V0Q29tcHJlc3NlZFRyZWVOb2RlKCk7XG5cdFx0Y29uc3Qgc3RhY2sgPSBbcm9vdF07XG5cblx0XHR3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHN0YWNrLnBvcCgpITtcblxuXHRcdFx0aWYgKG5vZGUgIT09IHJvb3QgJiYgbm9kZS5jb2xsYXBzaWJsZSAmJiAhbm9kZS5jb2xsYXBzZWQpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBhc3luY05vZGUgb2Ygbm9kZS5lbGVtZW50IS5lbGVtZW50cykge1xuXHRcdFx0XHRcdGV4cGFuZGVkLnB1c2goZ2V0SWQoYXN5bmNOb2RlLmVsZW1lbnQgYXMgVCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHN0YWNrLnB1c2goLi4ubm9kZS5jaGlsZHJlbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgZm9jdXMsIHNlbGVjdGlvbiwgZXhwYW5kZWQsIHNjcm9sbFRvcDogdGhpcy5zY3JvbGxUb3AgfTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXIobm9kZTogSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4sIHZpZXdTdGF0ZUNvbnRleHQ/OiBJQXN5bmNEYXRhVHJlZVZpZXdTdGF0ZUNvbnRleHQ8VElucHV0LCBUPiwgb3B0aW9ucz86IElBc3luY0RhdGFUcmVlVXBkYXRlQ2hpbGRyZW5PcHRpb25zPFQ+KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlkZW50aXR5UHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiBzdXBlci5yZW5kZXIobm9kZSwgdmlld1N0YXRlQ29udGV4dCk7XG5cdFx0fVxuXG5cdFx0Ly8gUHJlc2VydmUgdHJhaXRzIGFjcm9zcyBjb21wcmVzc2lvbnMuIEhhY2t5IGJ1dCBkb2VzIHRoZSB0cmljay5cblx0XHQvLyBUaGlzIGlzIGhhcmQgdG8gZml4IHByb3Blcmx5IHNpbmNlIGl0IHJlcXVpcmVzIHJld3JpdGluZyB0aGUgdHJhaXRzXG5cdFx0Ly8gYWNyb3NzIHRyZWVzIGFuZCBsaXN0cy4gTGV0J3MganVzdCBrZWVwIGl0IHRoaXMgd2F5IGZvciBub3cuXG5cdFx0Y29uc3QgZ2V0SWQgPSAoZWxlbWVudDogVCkgPT4gdGhpcy5pZGVudGl0eVByb3ZpZGVyIS5nZXRJZChlbGVtZW50KS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGdldFVuY29tcHJlc3NlZElkcyA9IChub2RlczogSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD5bXSk6IFNldDxzdHJpbmc+ID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXMpIHtcblx0XHRcdFx0Y29uc3QgY29tcHJlc3NlZE5vZGUgPSB0aGlzLnRyZWUuZ2V0Q29tcHJlc3NlZFRyZWVOb2RlKG5vZGUgPT09IHRoaXMucm9vdCA/IG51bGwgOiBub2RlKTtcblxuXHRcdFx0XHRpZiAoIWNvbXByZXNzZWROb2RlLmVsZW1lbnQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAoY29uc3Qgbm9kZSBvZiBjb21wcmVzc2VkTm9kZS5lbGVtZW50LmVsZW1lbnRzKSB7XG5cdFx0XHRcdFx0cmVzdWx0LmFkZChnZXRJZChub2RlLmVsZW1lbnQgYXMgVCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fTtcblxuXHRcdGNvbnN0IG9sZFNlbGVjdGlvbiA9IGdldFVuY29tcHJlc3NlZElkcyh0aGlzLnRyZWUuZ2V0U2VsZWN0aW9uKCkgYXMgSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD5bXSk7XG5cdFx0Y29uc3Qgb2xkRm9jdXMgPSBnZXRVbmNvbXByZXNzZWRJZHModGhpcy50cmVlLmdldEZvY3VzKCkgYXMgSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD5bXSk7XG5cblx0XHRzdXBlci5yZW5kZXIobm9kZSwgdmlld1N0YXRlQ29udGV4dCwgb3B0aW9ucyk7XG5cblx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLmdldFNlbGVjdGlvbigpO1xuXHRcdGxldCBkaWRDaGFuZ2VTZWxlY3Rpb24gPSBmYWxzZTtcblxuXHRcdGNvbnN0IGZvY3VzID0gdGhpcy5nZXRGb2N1cygpO1xuXHRcdGxldCBkaWRDaGFuZ2VGb2N1cyA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgdmlzaXQgPSAobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4+IHwgbnVsbCwgVEZpbHRlckRhdGE+KSA9PiB7XG5cdFx0XHRjb25zdCBjb21wcmVzc2VkTm9kZSA9IG5vZGUuZWxlbWVudDtcblxuXHRcdFx0aWYgKGNvbXByZXNzZWROb2RlKSB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY29tcHJlc3NlZE5vZGUuZWxlbWVudHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRjb25zdCBpZCA9IGdldElkKGNvbXByZXNzZWROb2RlLmVsZW1lbnRzW2ldLmVsZW1lbnQgYXMgVCk7XG5cdFx0XHRcdFx0Y29uc3QgZWxlbWVudCA9IGNvbXByZXNzZWROb2RlLmVsZW1lbnRzW2NvbXByZXNzZWROb2RlLmVsZW1lbnRzLmxlbmd0aCAtIDFdLmVsZW1lbnQgYXMgVDtcblxuXHRcdFx0XHRcdC8vIGdpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvODU5Mzhcblx0XHRcdFx0XHRpZiAob2xkU2VsZWN0aW9uLmhhcyhpZCkgJiYgc2VsZWN0aW9uLmluZGV4T2YoZWxlbWVudCkgPT09IC0xKSB7XG5cdFx0XHRcdFx0XHRzZWxlY3Rpb24ucHVzaChlbGVtZW50KTtcblx0XHRcdFx0XHRcdGRpZENoYW5nZVNlbGVjdGlvbiA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKG9sZEZvY3VzLmhhcyhpZCkgJiYgZm9jdXMuaW5kZXhPZihlbGVtZW50KSA9PT0gLTEpIHtcblx0XHRcdFx0XHRcdGZvY3VzLnB1c2goZWxlbWVudCk7XG5cdFx0XHRcdFx0XHRkaWRDaGFuZ2VGb2N1cyA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdG5vZGUuY2hpbGRyZW4uZm9yRWFjaCh2aXNpdCk7XG5cdFx0fTtcblxuXHRcdHZpc2l0KHRoaXMudHJlZS5nZXRDb21wcmVzc2VkVHJlZU5vZGUobm9kZSA9PT0gdGhpcy5yb290ID8gbnVsbCA6IG5vZGUpKTtcblxuXHRcdGlmIChkaWRDaGFuZ2VTZWxlY3Rpb24pIHtcblx0XHRcdHRoaXMuc2V0U2VsZWN0aW9uKHNlbGVjdGlvbik7XG5cdFx0fVxuXG5cdFx0aWYgKGRpZENoYW5nZUZvY3VzKSB7XG5cdFx0XHR0aGlzLnNldEZvY3VzKGZvY3VzKTtcblx0XHR9XG5cdH1cblxuXHQvLyBGb3IgY29tcHJlc3NlZCBhc3luYyBkYXRhIHRyZWVzLCBgVHJlZVZpc2liaWxpdHkuUmVjdXJzZWAgZG9lc24ndCBjdXJyZW50bHkgd29ya1xuXHQvLyBhbmQgd2UgaGF2ZSB0byBmaWx0ZXIgZXZlcnl0aGluZyBiZWZvcmVoYW5kXG5cdC8vIFJlbGF0ZWQgdG8gIzg1MTkzIGFuZCAjODU4MzVcblx0cHJvdGVjdGVkIG92ZXJyaWRlIHByb2Nlc3NDaGlsZHJlbihjaGlsZHJlbjogSXRlcmFibGU8VD4pOiBJdGVyYWJsZTxUPiB7XG5cdFx0aWYgKHRoaXMuZmlsdGVyKSB7XG5cdFx0XHRjaGlsZHJlbiA9IEl0ZXJhYmxlLmZpbHRlcihjaGlsZHJlbiwgZSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuZmlsdGVyIS5maWx0ZXIoZSwgVHJlZVZpc2liaWxpdHkuVmlzaWJsZSk7XG5cdFx0XHRcdGNvbnN0IHZpc2liaWxpdHkgPSBnZXRWaXNpYmlsaXR5KHJlc3VsdCk7XG5cblx0XHRcdFx0aWYgKHZpc2liaWxpdHkgPT09IFRyZWVWaXNpYmlsaXR5LlJlY3Vyc2UpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1JlY3Vyc2l2ZSB0cmVlIHZpc2liaWxpdHkgbm90IHN1cHBvcnRlZCBpbiBhc3luYyBkYXRhIGNvbXByZXNzZWQgdHJlZXMnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB2aXNpYmlsaXR5ID09PSBUcmVlVmlzaWJpbGl0eS5WaXNpYmxlO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN1cGVyLnByb2Nlc3NDaGlsZHJlbihjaGlsZHJlbik7XG5cdH1cblxuXHRvdmVycmlkZSBuYXZpZ2F0ZShzdGFydD86IFQpOiBBc3luY0RhdGFUcmVlTmF2aWdhdG9yPFRJbnB1dCwgVD4ge1xuXHRcdC8vIEFzc3VtcHRpb25zIGFyZSBtYWRlIGFib3V0IGhvdyB0cmVlIG5hdmlnYXRpb24gd29ya3MgaW4gY29tcHJlc3NlZCB0cmVlc1xuXHRcdC8vIFRoZXNlIGFzc3VtcHRpb25zIG1heSBiZSB3cm9uZyBhbmQgd2Ugc2hvdWxkIHJldmlzaXQgdGhpcyB3aGVuIG5lZWRlZFxuXG5cdFx0Ly8gRXhhbXBsZTpcdFthLCBiL2JhLCBiYS50eHRdXG5cdFx0Ly8gLSBwcmV2aW91cyhiYSkgPT4gYVxuXHRcdC8vIC0gcHJldmlvdXMoYikgPT4gYVxuXHRcdC8vIC0gbmV4dChhKSA9PiBiYVxuXHRcdC8vIC0gbmV4dChiKSA9PiBiYVxuXHRcdC8vIC0gbmV4dChiYSkgPT4gYmEudHh0XG5cdFx0cmV0dXJuIHN1cGVyLm5hdmlnYXRlKHN0YXJ0KTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRWaXNpYmlsaXR5PFRGaWx0ZXJEYXRhPihmaWx0ZXJSZXN1bHQ6IFRyZWVGaWx0ZXJSZXN1bHQ8VEZpbHRlckRhdGE+KTogVHJlZVZpc2liaWxpdHkge1xuXHRpZiAodHlwZW9mIGZpbHRlclJlc3VsdCA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0cmV0dXJuIGZpbHRlclJlc3VsdCA/IFRyZWVWaXNpYmlsaXR5LlZpc2libGUgOiBUcmVlVmlzaWJpbGl0eS5IaWRkZW47XG5cdH0gZWxzZSBpZiAoaXNGaWx0ZXJSZXN1bHQoZmlsdGVyUmVzdWx0KSkge1xuXHRcdHJldHVybiBnZXRWaXNpYmxlU3RhdGUoZmlsdGVyUmVzdWx0LnZpc2liaWxpdHkpO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBnZXRWaXNpYmxlU3RhdGUoZmlsdGVyUmVzdWx0KTtcblx0fVxufVxuXG5jbGFzcyBBc3luY0RhdGFUcmVlTmF2aWdhdG9yPFRJbnB1dCwgVD4gaW1wbGVtZW50cyBJVHJlZU5hdmlnYXRvcjxUPiB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBuYXZpZ2F0b3I6IElUcmVlTmF2aWdhdG9yPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+IHwgbnVsbD4pIHsgfVxuXG5cdGN1cnJlbnQoKTogVCB8IG51bGwge1xuXHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLm5hdmlnYXRvci5jdXJyZW50KCk7XG5cdFx0aWYgKGN1cnJlbnQgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHJldHVybiBjdXJyZW50LmVsZW1lbnQgYXMgVDtcblx0fVxuXG5cdHByZXZpb3VzKCk6IFQgfCBudWxsIHtcblx0XHR0aGlzLm5hdmlnYXRvci5wcmV2aW91cygpO1xuXHRcdHJldHVybiB0aGlzLmN1cnJlbnQoKTtcblx0fVxuXG5cdGZpcnN0KCk6IFQgfCBudWxsIHtcblx0XHR0aGlzLm5hdmlnYXRvci5maXJzdCgpO1xuXHRcdHJldHVybiB0aGlzLmN1cnJlbnQoKTtcblx0fVxuXG5cdGxhc3QoKTogVCB8IG51bGwge1xuXHRcdHRoaXMubmF2aWdhdG9yLmxhc3QoKTtcblx0XHRyZXR1cm4gdGhpcy5jdXJyZW50KCk7XG5cdH1cblxuXHRuZXh0KCk6IFQgfCBudWxsIHtcblx0XHR0aGlzLm5hdmlnYXRvci5uZXh0KCk7XG5cdFx0cmV0dXJuIHRoaXMuY3VycmVudCgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFPQSxTQUFTLCtCQUFxRDtBQUU5RCxTQUFTLHNCQUFzQixjQUFzSCxZQUFZLHNCQUErRztBQUVoUixTQUFTLGlCQUFpQixzQkFBc0I7QUFDaEQsU0FBUyx3QkFBb0wsa0JBQWtCO0FBQy9NLFNBQStPLGdDQUFnQyxXQUE2QixnQkFBZ0Isa0JBQWtCO0FBQzlVLFNBQTRCLHlCQUF5QixVQUFVLGtCQUFrQixlQUFlO0FBQ2hHLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHFCQUFxQix5QkFBeUI7QUFDdkQsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUIsU0FBc0Isb0JBQW9CO0FBRXBFLFNBQVMsa0JBQWtCO0FBQzNCLFNBQTRCLCtCQUErQjtBQUUzRCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFlBQVksY0FBYztBQUNuQyxTQUFTLGdCQUFnQjtBQXNCekIsU0FBUyx3QkFBbUMsT0FBa0Y7QUFDN0gsU0FBTztBQUFBLElBQ04sR0FBRztBQUFBLElBQ0gsVUFBVSxDQUFDO0FBQUEsSUFDWCxnQkFBZ0I7QUFBQSxJQUNoQixPQUFPO0FBQUEsSUFDUCxNQUFNO0FBQUEsSUFDTixlQUFlO0FBQUEsRUFDaEI7QUFDRDtBQUVBLFNBQVMsV0FBc0IsVUFBeUMsWUFBb0Q7QUFDM0gsTUFBSSxDQUFDLFdBQVcsUUFBUTtBQUN2QixXQUFPO0FBQUEsRUFDUixXQUFXLFdBQVcsV0FBVyxVQUFVO0FBQzFDLFdBQU87QUFBQSxFQUNSLE9BQU87QUFDTixXQUFPLFdBQVcsVUFBVSxXQUFXLE1BQU07QUFBQSxFQUM5QztBQUNEO0FBRUEsU0FBUyxXQUFzQixNQUFxQyxPQUErQztBQUNsSCxTQUFPLFNBQVMsU0FBUyxXQUFXLE1BQU0sS0FBSyxLQUFLLFdBQVcsT0FBTyxJQUFJO0FBQzNFO0FBUUEsTUFBTSx5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
