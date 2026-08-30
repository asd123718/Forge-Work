import { basename } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, DisposableStore, dispose } from "../../../base/common/lifecycle.js";
import { NoTreeViewError } from "../../common/views.js";
import { asPromise } from "../../../base/common/async.js";
import * as extHostTypes from "./extHostTypes.js";
import { isUndefinedOrNull, isString } from "../../../base/common/types.js";
import { equals, coalesce, distinct } from "../../../base/common/arrays.js";
import { LogLevel } from "../../../platform/log/common/log.js";
import { MarkdownString, ViewBadge, DataTransfer } from "./extHostTypeConverters.js";
import { isMarkdownString } from "../../../base/common/htmlContent.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { TreeViewsDnDService } from "../../../editor/common/services/treeViewsDnd.js";
import { checkProposedApiEnabled } from "../../services/extensions/common/extensions.js";
function toTreeItemLabel(label, extension) {
  if (isString(label)) {
    return { label };
  }
  if (label && typeof label === "object" && label.label) {
    let highlights = void 0;
    if (Array.isArray(label.highlights)) {
      highlights = label.highlights.filter(((highlight) => highlight.length === 2 && typeof highlight[0] === "number" && typeof highlight[1] === "number"));
      highlights = highlights.length ? highlights : void 0;
    }
    if (isString(label.label)) {
      return { label: label.label, highlights };
    } else if (extHostTypes.MarkdownString.isMarkdownString(label.label)) {
      checkProposedApiEnabled(extension, "treeItemMarkdownLabel");
      return { label: MarkdownString.from(label.label), highlights };
    }
  }
  return void 0;
}
class ExtHostTreeViews extends Disposable {
  constructor(_proxy, _commands, _logService) {
    super();
    this._proxy = _proxy;
    this._commands = _commands;
    this._logService = _logService;
    this._treeViews = /* @__PURE__ */ new Map();
    this._treeDragAndDropService = new TreeViewsDnDService();
    function isTreeViewConvertableItem(arg) {
      return arg && arg.$treeViewId && (arg.$treeItemHandle || arg.$selectedTreeItems || arg.$focusedTreeItem);
    }
    _commands.registerArgumentProcessor({
      processArgument: (arg) => {
        if (isTreeViewConvertableItem(arg)) {
          return this._convertArgument(arg);
        } else if (Array.isArray(arg) && arg.length > 0) {
          return arg.map((item) => {
            if (isTreeViewConvertableItem(item)) {
              return this._convertArgument(item);
            }
            return item;
          });
        }
        return arg;
      }
    });
  }
  registerTreeDataProvider(id, treeDataProvider, extension) {
    const treeView = this.createTreeView(id, { treeDataProvider }, extension);
    return { dispose: () => treeView.dispose() };
  }
  createTreeView(viewId, options, extension) {
    if (!options || !options.treeDataProvider) {
      throw new Error("Options with treeDataProvider is mandatory");
    }
    const dropMimeTypes = options.dragAndDropController?.dropMimeTypes ?? [];
    const dragMimeTypes = options.dragAndDropController?.dragMimeTypes ?? [];
    const hasHandleDrag = !!options.dragAndDropController?.handleDrag;
    const hasHandleDrop = !!options.dragAndDropController?.handleDrop;
    const treeView = this._createExtHostTreeView(viewId, options, extension);
    const proxyOptions = { showCollapseAll: !!options.showCollapseAll, canSelectMany: !!options.canSelectMany, dropMimeTypes, dragMimeTypes, hasHandleDrag, hasHandleDrop, manuallyManageCheckboxes: !!options.manageCheckboxStateManually };
    const registerPromise = this._proxy.$registerTreeViewDataProvider(viewId, proxyOptions);
    const view = {
      get onDidCollapseElement() {
        return treeView.onDidCollapseElement;
      },
      get onDidExpandElement() {
        return treeView.onDidExpandElement;
      },
      get selection() {
        return treeView.selectedElements;
      },
      get onDidChangeSelection() {
        return treeView.onDidChangeSelection;
      },
      get activeItem() {
        checkProposedApiEnabled(extension, "treeViewActiveItem");
        return treeView.focusedElement;
      },
      get onDidChangeActiveItem() {
        checkProposedApiEnabled(extension, "treeViewActiveItem");
        return treeView.onDidChangeActiveItem;
      },
      get visible() {
        return treeView.visible;
      },
      get onDidChangeVisibility() {
        return treeView.onDidChangeVisibility;
      },
      get onDidChangeCheckboxState() {
        return treeView.onDidChangeCheckboxState;
      },
      get message() {
        return treeView.message;
      },
      set message(message) {
        if (isMarkdownString(message)) {
          checkProposedApiEnabled(extension, "treeViewMarkdownMessage");
        }
        treeView.message = message;
      },
      get title() {
        return treeView.title;
      },
      set title(title) {
        treeView.title = title;
      },
      get description() {
        return treeView.description;
      },
      set description(description) {
        treeView.description = description;
      },
      get badge() {
        return treeView.badge;
      },
      set badge(badge) {
        if (badge !== void 0 && extHostTypes.ViewBadge.isViewBadge(badge)) {
          treeView.badge = {
            value: Math.floor(Math.abs(badge.value)),
            tooltip: badge.tooltip
          };
        } else if (badge === void 0) {
          treeView.badge = void 0;
        }
      },
      reveal: (element, options2) => {
        return treeView.reveal(element, options2);
      },
      dispose: async () => {
        await registerPromise;
        if (this._treeViews.get(viewId) === treeView) {
          this._treeViews.delete(viewId);
          this._proxy.$disposeTree(viewId);
        }
        treeView.dispose();
      }
    };
    this._register(view);
    return view;
  }
  async $getChildren(treeViewId, treeItemHandles) {
    const treeView = this._treeViews.get(treeViewId);
    if (!treeView) {
      return Promise.reject(new NoTreeViewError(treeViewId));
    }
    if (!treeItemHandles) {
      const children = await treeView.getChildren();
      return children ? [[0, ...children]] : void 0;
    }
    const result = [];
    for (let i = 0; i < treeItemHandles.length; i++) {
      const treeItemHandle = treeItemHandles[i];
      const children = await treeView.getChildren(treeItemHandle);
      if (children) {
        result.push([i, ...children]);
      }
    }
    return result;
  }
  async $handleDrop(destinationViewId, requestId, treeDataTransferDTO, targetItemHandle, token, operationUuid, sourceViewId, sourceTreeItemHandles) {
    const treeView = this._treeViews.get(destinationViewId);
    if (!treeView) {
      return Promise.reject(new NoTreeViewError(destinationViewId));
    }
    const treeDataTransfer = DataTransfer.toDataTransfer(treeDataTransferDTO, async (dataItemIndex) => {
      return (await this._proxy.$resolveDropFileData(destinationViewId, requestId, dataItemIndex)).buffer;
    });
    if (sourceViewId === destinationViewId && sourceTreeItemHandles) {
      await this._addAdditionalTransferItems(treeDataTransfer, treeView, sourceTreeItemHandles, token, operationUuid);
    }
    return treeView.onDrop(treeDataTransfer, targetItemHandle, token);
  }
  async _addAdditionalTransferItems(treeDataTransfer, treeView, sourceTreeItemHandles, token, operationUuid) {
    const existingTransferOperation = this._treeDragAndDropService.removeDragOperationTransfer(operationUuid);
    if (existingTransferOperation) {
      (await existingTransferOperation)?.forEach((value, key) => {
        if (value) {
          treeDataTransfer.set(key, value);
        }
      });
    } else if (operationUuid && treeView.handleDrag) {
      const willDropPromise = treeView.handleDrag(sourceTreeItemHandles, treeDataTransfer, token);
      this._treeDragAndDropService.addDragOperationTransfer(operationUuid, willDropPromise);
      await willDropPromise;
    }
    return treeDataTransfer;
  }
  async $handleDrag(sourceViewId, sourceTreeItemHandles, operationUuid, token) {
    const treeView = this._treeViews.get(sourceViewId);
    if (!treeView) {
      return Promise.reject(new NoTreeViewError(sourceViewId));
    }
    const treeDataTransfer = await this._addAdditionalTransferItems(new extHostTypes.DataTransfer(), treeView, sourceTreeItemHandles, token, operationUuid);
    if (!treeDataTransfer || token.isCancellationRequested) {
      return;
    }
    return DataTransfer.from(treeDataTransfer);
  }
  async $hasResolve(treeViewId) {
    const treeView = this._treeViews.get(treeViewId);
    if (!treeView) {
      throw new NoTreeViewError(treeViewId);
    }
    return treeView.hasResolve;
  }
  $resolve(treeViewId, treeItemHandle, token) {
    const treeView = this._treeViews.get(treeViewId);
    if (!treeView) {
      throw new NoTreeViewError(treeViewId);
    }
    return treeView.resolveTreeItem(treeItemHandle, token);
  }
  $setExpanded(treeViewId, treeItemHandle, expanded) {
    const treeView = this._treeViews.get(treeViewId);
    if (!treeView) {
      throw new NoTreeViewError(treeViewId);
    }
    treeView.setExpanded(treeItemHandle, expanded);
  }
  $setSelectionAndFocus(treeViewId, selectedHandles, focusedHandle) {
    const treeView = this._treeViews.get(treeViewId);
    if (!treeView) {
      throw new NoTreeViewError(treeViewId);
    }
    treeView.setSelectionAndFocus(selectedHandles, focusedHandle);
  }
  $setVisible(treeViewId, isVisible) {
    const treeView = this._treeViews.get(treeViewId);
    if (!treeView) {
      if (!isVisible) {
        return;
      }
      throw new NoTreeViewError(treeViewId);
    }
    treeView.setVisible(isVisible);
  }
  $changeCheckboxState(treeViewId, checkboxUpdate) {
    const treeView = this._treeViews.get(treeViewId);
    if (!treeView) {
      throw new NoTreeViewError(treeViewId);
    }
    treeView.setCheckboxState(checkboxUpdate);
  }
  _createExtHostTreeView(id, options, extension) {
    const treeView = this._register(new ExtHostTreeView(id, options, this._proxy, this._commands.converter, this._logService, extension));
    this._treeViews.set(id, treeView);
    return treeView;
  }
  _convertArgument(arg) {
    const treeView = this._treeViews.get(arg.$treeViewId);
    const asItemHandle = arg;
    if (treeView && asItemHandle.$treeItemHandle) {
      return treeView.getExtensionElement(asItemHandle.$treeItemHandle);
    }
    const asPaneHandle = arg;
    if (treeView && asPaneHandle.$focusedTreeItem) {
      return treeView.focusedElement;
    }
    return null;
  }
}
const _ExtHostTreeView = class _ExtHostTreeView extends Disposable {
  constructor(_viewId, options, _proxy, _commands, _logService, _extension) {
    super();
    this._viewId = _viewId;
    this._proxy = _proxy;
    this._commands = _commands;
    this._logService = _logService;
    this._extension = _extension;
    this._roots = void 0;
    this._elements = /* @__PURE__ */ new Map();
    this._nodes = /* @__PURE__ */ new Map();
    // Track the latest child-fetch per element so that refresh-triggered cache clears ignore stale results.
    // Without these tokens, an earlier getChildren promise resolving after refresh would re-register handles and hit the duplicate-id guard.
    this._childrenFetchTokens = /* @__PURE__ */ new Map();
    // Global counter for fetch tokens. Using a monotonically increasing counter ensures that even after
    // _childrenFetchTokens.clear() during a root refresh, old in-flight fetches will have requestIds that
    // can never match new fetches (e.g., old fetch has id=5, after clear new fetches get 6, 7, 8...).
    this._globalFetchTokenCounter = 0;
    this._visible = false;
    this._selectedHandles = [];
    this._focusedHandle = void 0;
    this._onDidExpandElement = this._register(new Emitter());
    this.onDidExpandElement = this._onDidExpandElement.event;
    this._onDidCollapseElement = this._register(new Emitter());
    this.onDidCollapseElement = this._onDidCollapseElement.event;
    this._onDidChangeSelection = this._register(new Emitter());
    this.onDidChangeSelection = this._onDidChangeSelection.event;
    this._onDidChangeActiveItem = this._register(new Emitter());
    this.onDidChangeActiveItem = this._onDidChangeActiveItem.event;
    this._onDidChangeVisibility = this._register(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    this._onDidChangeCheckboxState = this._register(new Emitter());
    this.onDidChangeCheckboxState = this._onDidChangeCheckboxState.event;
    this._onDidChangeData = this._register(new Emitter());
    this._refreshPromise = Promise.resolve();
    this._refreshQueue = Promise.resolve();
    this._nodesToClear = /* @__PURE__ */ new Set();
    this._message = "";
    this._title = "";
    this._refreshCancellationSource = new CancellationTokenSource();
    if (_extension.contributes && _extension.contributes.views) {
      for (const location in _extension.contributes.views) {
        for (const view of _extension.contributes.views[location]) {
          if (view.id === _viewId) {
            this._title = view.name;
          }
        }
      }
    }
    this._dataProvider = options.treeDataProvider;
    this._dndController = options.dragAndDropController;
    if (this._dataProvider.onDidChangeTreeData) {
      this._register(this._dataProvider.onDidChangeTreeData((elementOrElements) => {
        if (Array.isArray(elementOrElements) && elementOrElements.length === 0) {
          return;
        }
        this._onDidChangeData.fire({ message: false, element: elementOrElements });
      }));
    }
    let refreshingPromise;
    let promiseCallback;
    const onDidChangeData = Event.debounce(this._onDidChangeData.event, (result, current) => {
      if (!result) {
        result = { message: false, elements: [] };
      }
      if (current.element !== false) {
        if (!refreshingPromise) {
          refreshingPromise = new Promise((c) => promiseCallback = c);
          this._refreshPromise = this._refreshPromise.then(() => refreshingPromise);
        }
        if (Array.isArray(current.element)) {
          result.elements.push(...current.element);
        } else {
          result.elements.push(current.element);
        }
      }
      if (current.message) {
        result.message = true;
      }
      return result;
    }, 200, true);
    this._register(onDidChangeData(({ message, elements }) => {
      if (elements.length) {
        elements = distinct(elements);
        this._refreshQueue = this._refreshQueue.then(() => {
          const _promiseCallback = promiseCallback;
          refreshingPromise = null;
          const childrenToClear = Array.from(this._nodesToClear);
          this._nodesToClear.clear();
          this._debugLogRefresh("start", elements, childrenToClear);
          return this._refresh(elements).then(() => {
            this._debugLogRefresh("done", elements, childrenToClear);
            this._clearNodes(childrenToClear);
            return _promiseCallback();
          }).catch((e) => {
            const message2 = e instanceof Error ? e.message : JSON.stringify(e);
            this._debugLogRefresh("error", elements, childrenToClear);
            this._clearNodes(childrenToClear);
            this._logService.error(`Unable to refresh tree view ${this._viewId}: ${message2}`);
            return _promiseCallback();
          });
        });
      }
      if (message) {
        this._proxy.$setMessage(this._viewId, MarkdownString.fromStrict(this._message) ?? "");
      }
    }));
  }
  get visible() {
    return this._visible;
  }
  get selectedElements() {
    return this._selectedHandles.map((handle) => this.getExtensionElement(handle)).filter((element) => !isUndefinedOrNull(element));
  }
  get focusedElement() {
    return this._focusedHandle ? this.getExtensionElement(this._focusedHandle) : void 0;
  }
  _debugCollectHandles(elements) {
    const changed = [];
    for (const el of elements) {
      if (!el) {
        changed.push("<root>");
        continue;
      }
      const node = this._nodes.get(el);
      if (node) {
        changed.push(node.item.handle);
      }
    }
    const roots = this._roots?.map((r) => r.item.handle) ?? [];
    return { changed, roots };
  }
  _debugLogRefresh(phase, elements, childrenToClear) {
    if (!this._isDebugLogging()) {
      return;
    }
    try {
      const snapshot = this._debugCollectHandles(elements);
      snapshot.clearing = childrenToClear.map((n) => n.item.handle);
      const changedCount = snapshot.changed.length;
      const nodesToClearLen = childrenToClear.length;
      this._logService.debug(`[TreeView:${this._viewId}] refresh ${phase} changed=${changedCount} nodesToClear=${nodesToClearLen} elements.size=${this._elements.size} nodes.size=${this._nodes.size} handles=${JSON.stringify(snapshot)}`);
    } catch {
      this._logService.debug(`[TreeView:${this._viewId}] refresh ${phase} (snapshot failed)`);
    }
  }
  _isDebugLogging() {
    try {
      const level = this._logService.getLevel();
      return level === LogLevel.Debug || level === LogLevel.Trace;
    } catch {
      return false;
    }
  }
  async getChildren(parentHandle) {
    const parentElement = parentHandle ? this.getExtensionElement(parentHandle) : void 0;
    if (parentHandle && !parentElement) {
      this._logService.error(`No tree item with id '${parentHandle}' found.`);
      return Promise.resolve([]);
    }
    let childrenNodes = this._getChildrenNodes(parentHandle);
    if (!childrenNodes) {
      childrenNodes = await this._fetchChildrenNodes(parentElement);
    }
    return childrenNodes ? childrenNodes.map((n) => n.item) : void 0;
  }
  getExtensionElement(treeItemHandle) {
    return this._elements.get(treeItemHandle);
  }
  reveal(element, options) {
    options = options ? options : { select: true, focus: false };
    const select = isUndefinedOrNull(options.select) ? true : options.select;
    const focus = isUndefinedOrNull(options.focus) ? false : options.focus;
    const expand = isUndefinedOrNull(options.expand) ? false : options.expand;
    if (typeof this._dataProvider.getParent !== "function") {
      return Promise.reject(new Error(`Required registered TreeDataProvider to implement 'getParent' method to access 'reveal' method`));
    }
    if (element) {
      return this._refreshPromise.then(() => this._resolveUnknownParentChain(element)).then((parentChain) => this._resolveTreeNode(element, parentChain[parentChain.length - 1]).then((treeNode) => this._proxy.$reveal(this._viewId, { item: treeNode.item, parentChain: parentChain.map((p) => p.item) }, { select, focus, expand })), (error) => this._logService.error(error));
    } else {
      return this._proxy.$reveal(this._viewId, void 0, { select, focus, expand });
    }
  }
  get message() {
    return this._message;
  }
  set message(message) {
    this._message = message;
    this._onDidChangeData.fire({ message: true, element: false });
  }
  get title() {
    return this._title;
  }
  set title(title) {
    this._title = title;
    this._proxy.$setTitle(this._viewId, title, this._description);
  }
  get description() {
    return this._description;
  }
  set description(description) {
    this._description = description;
    this._proxy.$setTitle(this._viewId, this._title, description);
  }
  get badge() {
    return this._badge;
  }
  set badge(badge) {
    if (this._badge?.value === badge?.value && this._badge?.tooltip === badge?.tooltip) {
      return;
    }
    this._badge = ViewBadge.from(badge);
    this._proxy.$setBadge(this._viewId, badge);
  }
  setExpanded(treeItemHandle, expanded) {
    const element = this.getExtensionElement(treeItemHandle);
    if (element) {
      if (expanded) {
        this._onDidExpandElement.fire(Object.freeze({ element }));
      } else {
        this._onDidCollapseElement.fire(Object.freeze({ element }));
      }
    }
  }
  setSelectionAndFocus(selectedHandles, focusedHandle) {
    const changedSelection = !equals(this._selectedHandles, selectedHandles);
    this._selectedHandles = selectedHandles;
    const changedFocus = this._focusedHandle !== focusedHandle;
    this._focusedHandle = focusedHandle;
    if (changedSelection) {
      this._onDidChangeSelection.fire(Object.freeze({ selection: this.selectedElements }));
    }
    if (changedFocus) {
      this._onDidChangeActiveItem.fire(Object.freeze({ activeItem: this.focusedElement }));
    }
  }
  setVisible(visible) {
    if (visible !== this._visible) {
      this._visible = visible;
      this._onDidChangeVisibility.fire(Object.freeze({ visible: this._visible }));
    }
  }
  async setCheckboxState(checkboxUpdates) {
    const items = (await Promise.all(checkboxUpdates.map(async (checkboxUpdate) => {
      const extensionItem = this.getExtensionElement(checkboxUpdate.treeItemHandle);
      if (extensionItem) {
        return {
          extensionItem,
          treeItem: await this._dataProvider.getTreeItem(extensionItem),
          newState: checkboxUpdate.newState ? extHostTypes.TreeItemCheckboxState.Checked : extHostTypes.TreeItemCheckboxState.Unchecked
        };
      }
      return Promise.resolve(void 0);
    }))).filter((item) => item !== void 0);
    items.forEach((item) => {
      item.treeItem.checkboxState = item.newState ? extHostTypes.TreeItemCheckboxState.Checked : extHostTypes.TreeItemCheckboxState.Unchecked;
    });
    this._onDidChangeCheckboxState.fire({ items: items.map((item) => [item.extensionItem, item.newState]) });
  }
  async handleDrag(sourceTreeItemHandles, treeDataTransfer, token) {
    const extensionTreeItems = [];
    for (const sourceHandle of sourceTreeItemHandles) {
      const extensionItem = this.getExtensionElement(sourceHandle);
      if (extensionItem) {
        extensionTreeItems.push(extensionItem);
      }
    }
    if (!this._dndController?.handleDrag || extensionTreeItems.length === 0) {
      return;
    }
    await this._dndController.handleDrag(extensionTreeItems, treeDataTransfer, token);
    return treeDataTransfer;
  }
  get hasHandleDrag() {
    return !!this._dndController?.handleDrag;
  }
  async onDrop(treeDataTransfer, targetHandleOrNode, token) {
    const target = targetHandleOrNode ? this.getExtensionElement(targetHandleOrNode) : void 0;
    if (!target && targetHandleOrNode || !this._dndController?.handleDrop) {
      return;
    }
    return asPromise(() => this._dndController?.handleDrop ? this._dndController.handleDrop(target, treeDataTransfer, token) : void 0);
  }
  get hasResolve() {
    return !!this._dataProvider.resolveTreeItem;
  }
  async resolveTreeItem(treeItemHandle, token) {
    if (!this._dataProvider.resolveTreeItem) {
      return;
    }
    const element = this._elements.get(treeItemHandle);
    if (element) {
      const node = this._nodes.get(element);
      if (node) {
        const resolve = await this._dataProvider.resolveTreeItem(node.extensionItem, element, token) ?? node.extensionItem;
        this._validateTreeItem(resolve);
        node.item.tooltip = this._getTooltip(resolve.tooltip);
        node.item.command = this._getCommand(node.disposableStore, resolve.command);
        return node.item;
      }
    }
    return;
  }
  _resolveUnknownParentChain(element) {
    return this._resolveParent(element).then((parent) => {
      if (!parent) {
        return Promise.resolve([]);
      }
      return this._resolveUnknownParentChain(parent).then((result) => this._resolveTreeNode(parent, result[result.length - 1]).then((parentNode) => {
        result.push(parentNode);
        return result;
      }));
    });
  }
  _resolveParent(element) {
    const node = this._nodes.get(element);
    if (node) {
      return Promise.resolve(node.parent ? this._elements.get(node.parent.item.handle) : void 0);
    }
    return asPromise(() => this._dataProvider.getParent(element));
  }
  async _resolveTreeNode(element, parent) {
    const node = this._nodes.get(element);
    if (node) {
      return node;
    }
    const extTreeItem = await asPromise(() => this._dataProvider.getTreeItem(element));
    const handle = this._createHandle(element, extTreeItem, parent, true);
    await this.getChildren(parent ? parent.item.handle : void 0);
    const cachedElement = this.getExtensionElement(handle);
    if (cachedElement) {
      const node2 = this._nodes.get(cachedElement);
      if (node2) {
        return node2;
      }
    }
    this._logService.error(`[TreeView:${this._viewId}] Failed to resolve tree node for element ${handle}`);
    this._proxy.$logResolveTreeNodeFailure(this._extension.identifier.value);
    throw new Error(`Cannot resolve tree item for element ${handle} from extension ${this._extension.identifier.value}`);
  }
  _getChildrenNodes(parentNodeOrHandle) {
    if (parentNodeOrHandle) {
      let parentNode;
      if (typeof parentNodeOrHandle === "string") {
        const parentElement = this.getExtensionElement(parentNodeOrHandle);
        parentNode = parentElement ? this._nodes.get(parentElement) : void 0;
      } else {
        parentNode = parentNodeOrHandle;
      }
      return parentNode ? parentNode.children || void 0 : void 0;
    }
    return this._roots;
  }
  _getFetchKey(parentElement) {
    return parentElement ?? _ExtHostTreeView.ROOT_FETCH_KEY;
  }
  async _fetchChildrenNodes(parentElement) {
    this._addChildrenToClear(parentElement);
    const fetchKey = this._getFetchKey(parentElement);
    const requestId = ++this._globalFetchTokenCounter;
    this._childrenFetchTokens.set(fetchKey, requestId);
    const cts = new CancellationTokenSource(this._refreshCancellationSource.token);
    try {
      const elements = await this._dataProvider.getChildren(parentElement);
      if (this._childrenFetchTokens.get(fetchKey) !== requestId) {
        return void 0;
      }
      const parentNode = parentElement ? this._nodes.get(parentElement) : void 0;
      if (cts.token.isCancellationRequested) {
        return void 0;
      }
      const coalescedElements = coalesce(elements || []);
      const treeItems = await Promise.all(coalesce(coalescedElements).map((element) => {
        return this._dataProvider.getTreeItem(element);
      }));
      if (this._childrenFetchTokens.get(fetchKey) !== requestId) {
        return void 0;
      }
      if (cts.token.isCancellationRequested) {
        return void 0;
      }
      const items = treeItems.map((item, index) => item ? this._createAndRegisterTreeNode(coalescedElements[index], item, parentNode) : null);
      if (this._childrenFetchTokens.get(fetchKey) !== requestId) {
        return void 0;
      }
      return coalesce(items);
    } finally {
      cts.dispose();
    }
  }
  _refresh(elements) {
    const hasRoot = elements.some((element) => !element);
    if (hasRoot) {
      this._refreshCancellationSource.dispose(true);
      this._refreshCancellationSource = new CancellationTokenSource();
      this._addChildrenToClear();
      return this._proxy.$refresh(this._viewId);
    } else {
      const handlesToRefresh = this._getHandlesToRefresh(elements);
      if (handlesToRefresh.length) {
        return this._refreshHandles(handlesToRefresh);
      }
    }
    return Promise.resolve(void 0);
  }
  _getHandlesToRefresh(elements) {
    const elementsToUpdate = /* @__PURE__ */ new Set();
    const elementNodes = elements.map((element) => this._nodes.get(element));
    for (const elementNode of elementNodes) {
      if (elementNode && !elementsToUpdate.has(elementNode.item.handle)) {
        let currentNode = elementNode;
        while (currentNode && currentNode.parent && elementNodes.findIndex((node) => currentNode && currentNode.parent && node && node.item.handle === currentNode.parent.item.handle) === -1) {
          const parentElement = this._elements.get(currentNode.parent.item.handle);
          currentNode = parentElement ? this._nodes.get(parentElement) : void 0;
        }
        if (currentNode && !currentNode.parent) {
          elementsToUpdate.add(elementNode.item.handle);
        }
      }
    }
    const handlesToUpdate = [];
    elementsToUpdate.forEach((handle) => {
      const element = this._elements.get(handle);
      if (element) {
        const node = this._nodes.get(element);
        if (node && (!node.parent || !elementsToUpdate.has(node.parent.item.handle))) {
          handlesToUpdate.push(handle);
        }
      }
    });
    return handlesToUpdate;
  }
  _refreshHandles(itemHandles) {
    const itemsToRefresh = {};
    return Promise.all(itemHandles.map((treeItemHandle) => this._refreshNode(treeItemHandle).then((node) => {
      if (node) {
        itemsToRefresh[treeItemHandle] = node.item;
      }
    }))).then(() => Object.keys(itemsToRefresh).length ? this._proxy.$refresh(this._viewId, itemsToRefresh) : void 0);
  }
  _refreshNode(treeItemHandle) {
    const extElement = this.getExtensionElement(treeItemHandle);
    if (extElement) {
      const existing = this._nodes.get(extElement);
      if (existing) {
        this._addChildrenToClear(extElement);
        return asPromise(() => this._dataProvider.getTreeItem(extElement)).then((extTreeItem) => {
          if (extTreeItem) {
            const newNode = this._createTreeNode(extElement, extTreeItem, existing.parent);
            this._updateNodeCache(extElement, newNode, existing, existing.parent);
            existing.dispose();
            return newNode;
          }
          return null;
        });
      }
    }
    return Promise.resolve(null);
  }
  _createAndRegisterTreeNode(element, extTreeItem, parentNode) {
    const duplicateHandle = extTreeItem.id ? `${_ExtHostTreeView.ID_HANDLE_PREFIX}/${extTreeItem.id}` : void 0;
    if (duplicateHandle) {
      const existingElement = this._elements.get(duplicateHandle);
      if (existingElement) {
        const existingNode = this._nodes.get(existingElement);
        if (existingElement !== element) {
          this._nodes.delete(existingElement);
        }
        if (existingNode) {
          const newNode = this._createTreeNode(element, extTreeItem, parentNode);
          this._updateNodeCache(element, newNode, existingNode, parentNode);
          existingNode.dispose();
          return newNode;
        }
      }
    }
    const node = this._createTreeNode(element, extTreeItem, parentNode);
    this._addNodeToCache(element, node);
    this._addNodeToParentCache(node, parentNode);
    return node;
  }
  _getTooltip(tooltip) {
    if (extHostTypes.MarkdownString.isMarkdownString(tooltip)) {
      return MarkdownString.from(tooltip);
    }
    return tooltip;
  }
  _getCommand(disposable, command) {
    return command ? { ...this._commands.toInternal(command, disposable), originalId: command.command } : void 0;
  }
  _getCheckbox(extensionTreeItem) {
    if (extensionTreeItem.checkboxState === void 0) {
      return void 0;
    }
    let checkboxState;
    let tooltip = void 0;
    let accessibilityInformation = void 0;
    if (typeof extensionTreeItem.checkboxState === "number") {
      checkboxState = extensionTreeItem.checkboxState;
    } else {
      checkboxState = extensionTreeItem.checkboxState.state;
      tooltip = extensionTreeItem.checkboxState.tooltip;
      accessibilityInformation = extensionTreeItem.checkboxState.accessibilityInformation;
    }
    return { isChecked: checkboxState === extHostTypes.TreeItemCheckboxState.Checked, tooltip, accessibilityInformation };
  }
  _validateTreeItem(extensionTreeItem) {
    if (!extHostTypes.TreeItem.isTreeItem(extensionTreeItem, this._extension)) {
      throw new Error(`Extension ${this._extension.identifier.value} has provided an invalid tree item.`);
    }
  }
  _createTreeNode(element, extensionTreeItem, parent) {
    this._validateTreeItem(extensionTreeItem);
    const disposableStore = this._register(new DisposableStore());
    const handle = this._createHandle(element, extensionTreeItem, parent);
    const icon = this._getLightIconPath(extensionTreeItem);
    const item = {
      handle,
      parentHandle: parent ? parent.item.handle : void 0,
      label: toTreeItemLabel(extensionTreeItem.label, this._extension),
      description: extensionTreeItem.description,
      resourceUri: extensionTreeItem.resourceUri,
      tooltip: this._getTooltip(extensionTreeItem.tooltip),
      command: this._getCommand(disposableStore, extensionTreeItem.command),
      contextValue: extensionTreeItem.contextValue,
      icon,
      iconDark: this._getDarkIconPath(extensionTreeItem) || icon,
      themeIcon: this._getThemeIcon(extensionTreeItem),
      collapsibleState: isUndefinedOrNull(extensionTreeItem.collapsibleState) ? extHostTypes.TreeItemCollapsibleState.None : extensionTreeItem.collapsibleState,
      accessibilityInformation: extensionTreeItem.accessibilityInformation,
      checkbox: this._getCheckbox(extensionTreeItem)
    };
    return {
      item,
      extensionItem: extensionTreeItem,
      parent,
      children: void 0,
      disposableStore,
      dispose() {
        disposableStore.dispose();
      }
    };
  }
  _getThemeIcon(extensionTreeItem) {
    return extensionTreeItem.iconPath instanceof extHostTypes.ThemeIcon ? extensionTreeItem.iconPath : void 0;
  }
  _createHandle(element, { id, label, resourceUri }, parent, returnFirst) {
    if (id) {
      return `${_ExtHostTreeView.ID_HANDLE_PREFIX}/${id}`;
    }
    const treeItemLabel = toTreeItemLabel(label, this._extension);
    const prefix = parent ? parent.item.handle : _ExtHostTreeView.LABEL_HANDLE_PREFIX;
    let labelValue = "";
    if (treeItemLabel) {
      if (isMarkdownString(treeItemLabel.label)) {
        labelValue = treeItemLabel.label.value;
      } else {
        labelValue = treeItemLabel.label;
      }
    }
    let elementId = labelValue || (resourceUri ? basename(resourceUri) : "");
    elementId = elementId.indexOf("/") !== -1 ? elementId.replace("/", "//") : elementId;
    const existingHandle = this._nodes.has(element) ? this._nodes.get(element).item.handle : void 0;
    const childrenNodes = this._getChildrenNodes(parent) || [];
    let handle;
    let counter = 0;
    do {
      handle = `${prefix}/${counter}:${elementId}`;
      if (returnFirst || !this._elements.has(handle) || existingHandle === handle) {
        break;
      }
      counter++;
    } while (counter <= childrenNodes.length);
    return handle;
  }
  _getLightIconPath(extensionTreeItem) {
    if (extensionTreeItem.iconPath && !(extensionTreeItem.iconPath instanceof extHostTypes.ThemeIcon)) {
      if (typeof extensionTreeItem.iconPath === "string" || URI.isUri(extensionTreeItem.iconPath)) {
        return this._getIconPath(extensionTreeItem.iconPath);
      }
      return this._getIconPath(extensionTreeItem.iconPath.light);
    }
    return void 0;
  }
  _getDarkIconPath(extensionTreeItem) {
    if (extensionTreeItem.iconPath && !(extensionTreeItem.iconPath instanceof extHostTypes.ThemeIcon) && extensionTreeItem.iconPath.dark) {
      return this._getIconPath(extensionTreeItem.iconPath.dark);
    }
    return void 0;
  }
  _getIconPath(iconPath) {
    if (URI.isUri(iconPath)) {
      return iconPath;
    }
    return URI.file(iconPath);
  }
  _addNodeToCache(element, node) {
    this._elements.set(node.item.handle, element);
    this._nodes.set(element, node);
  }
  _updateNodeCache(element, newNode, existing, parentNode) {
    this._elements.delete(newNode.item.handle);
    this._nodes.delete(element);
    if (newNode.item.handle !== existing.item.handle) {
      this._elements.delete(existing.item.handle);
    }
    this._addNodeToCache(element, newNode);
    const childrenNodes = this._getChildrenNodes(parentNode) || [];
    const childNode = childrenNodes.filter((c) => c.item.handle === existing.item.handle)[0];
    if (childNode) {
      childrenNodes.splice(childrenNodes.indexOf(childNode), 1, newNode);
    }
  }
  _addNodeToParentCache(node, parentNode) {
    if (parentNode) {
      if (!parentNode.children) {
        parentNode.children = [];
      }
      parentNode.children.push(node);
    } else {
      if (!this._roots) {
        this._roots = [];
      }
      this._roots.push(node);
    }
  }
  _addChildrenToClear(parentElement) {
    if (parentElement) {
      const node = this._nodes.get(parentElement);
      if (node) {
        if (node.children) {
          for (const child of node.children) {
            this._nodesToClear.add(child);
            const childElement = this._elements.get(child.item.handle);
            if (childElement) {
              this._addChildrenToClear(childElement);
              this._nodes.delete(childElement);
              this._elements.delete(child.item.handle);
            }
          }
        }
        node.children = void 0;
      }
    } else {
      this._addAllToClear();
    }
  }
  _addAllToClear() {
    this._roots = void 0;
    this._nodes.forEach((node) => {
      this._nodesToClear.add(node);
    });
    this._nodes.clear();
    this._elements.clear();
    this._childrenFetchTokens.clear();
  }
  _clearNodes(nodes) {
    dispose(nodes);
  }
  _clearAll() {
    this._roots = void 0;
    this._elements.clear();
    dispose(this._nodes.values());
    this._nodes.clear();
    dispose(this._nodesToClear);
    this._nodesToClear.clear();
    this._childrenFetchTokens.clear();
  }
  dispose() {
    super.dispose();
    this._refreshCancellationSource.dispose();
    this._clearAll();
  }
};
_ExtHostTreeView.LABEL_HANDLE_PREFIX = "0";
_ExtHostTreeView.ID_HANDLE_PREFIX = "1";
_ExtHostTreeView.ROOT_FETCH_KEY = /* @__PURE__ */ Symbol("extHostTreeViewRoot");
let ExtHostTreeView = _ExtHostTreeView;
export {
  ExtHostTreeViews
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0VHJlZVZpZXdzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQ2hlY2tib3hVcGRhdGUsIERhdGFUcmFuc2ZlckRUTywgRXh0SG9zdFRyZWVWaWV3c1NoYXBlLCBNYWluVGhyZWFkVHJlZVZpZXdzU2hhcGUgfSBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgSVRyZWVJdGVtLCBUcmVlVmlld0l0ZW1IYW5kbGVBcmcsIElUcmVlSXRlbUxhYmVsLCBJUmV2ZWFsT3B0aW9ucywgVHJlZUNvbW1hbmQsIFRyZWVWaWV3UGFuZUhhbmRsZUFyZywgSVRyZWVJdGVtQ2hlY2tib3hTdGF0ZSwgTm9UcmVlVmlld0Vycm9yIH0gZnJvbSAnLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb21tYW5kcywgQ29tbWFuZHNDb252ZXJ0ZXIgfSBmcm9tICcuL2V4dEhvc3RDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBhc1Byb21pc2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgKiBhcyBleHRIb3N0VHlwZXMgZnJvbSAnLi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IHsgaXNVbmRlZmluZWRPck51bGwsIGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgZXF1YWxzLCBjb2FsZXNjZSwgZGlzdGluY3QgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIExvZ0xldmVsIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZywgVmlld0JhZGdlLCBEYXRhVHJhbnNmZXIgfSBmcm9tICcuL2V4dEhvc3RUeXBlQ29udmVydGVycy5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcsIGlzTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSVRyZWVWaWV3c0RuRFNlcnZpY2UsIFRyZWVWaWV3c0RuRFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RyZWVWaWV3c0RuZC5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuXG50eXBlIFRyZWVJdGVtSGFuZGxlID0gc3RyaW5nO1xuXG5mdW5jdGlvbiB0b1RyZWVJdGVtTGFiZWwobGFiZWw6IGFueSwgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBJVHJlZUl0ZW1MYWJlbCB8IHVuZGVmaW5lZCB7XG5cdGlmIChpc1N0cmluZyhsYWJlbCkpIHtcblx0XHRyZXR1cm4geyBsYWJlbCB9O1xuXHR9XG5cblx0aWYgKGxhYmVsICYmIHR5cGVvZiBsYWJlbCA9PT0gJ29iamVjdCcgJiYgbGFiZWwubGFiZWwpIHtcblx0XHRsZXQgaGlnaGxpZ2h0czogW251bWJlciwgbnVtYmVyXVtdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGxhYmVsLmhpZ2hsaWdodHMpKSB7XG5cdFx0XHRoaWdobGlnaHRzID0gKDxbbnVtYmVyLCBudW1iZXJdW10+bGFiZWwuaGlnaGxpZ2h0cykuZmlsdGVyKChoaWdobGlnaHQgPT4gaGlnaGxpZ2h0Lmxlbmd0aCA9PT0gMiAmJiB0eXBlb2YgaGlnaGxpZ2h0WzBdID09PSAnbnVtYmVyJyAmJiB0eXBlb2YgaGlnaGxpZ2h0WzFdID09PSAnbnVtYmVyJykpO1xuXHRcdFx0aGlnaGxpZ2h0cyA9IGhpZ2hsaWdodHMubGVuZ3RoID8gaGlnaGxpZ2h0cyA6IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKGlzU3RyaW5nKGxhYmVsLmxhYmVsKSkge1xuXHRcdFx0cmV0dXJuIHsgbGFiZWw6IGxhYmVsLmxhYmVsLCBoaWdobGlnaHRzIH07XG5cdFx0fSBlbHNlIGlmIChleHRIb3N0VHlwZXMuTWFya2Rvd25TdHJpbmcuaXNNYXJrZG93blN0cmluZyhsYWJlbC5sYWJlbCkpIHtcblx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3RyZWVJdGVtTWFya2Rvd25MYWJlbCcpO1xuXHRcdFx0cmV0dXJuIHsgbGFiZWw6IE1hcmtkb3duU3RyaW5nLmZyb20obGFiZWwubGFiZWwpLCBoaWdobGlnaHRzIH07XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuXG5leHBvcnQgY2xhc3MgRXh0SG9zdFRyZWVWaWV3cyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBFeHRIb3N0VHJlZVZpZXdzU2hhcGUge1xuXG5cdHByaXZhdGUgX3RyZWVWaWV3czogTWFwPHN0cmluZywgRXh0SG9zdFRyZWVWaWV3PGFueT4+ID0gbmV3IE1hcDxzdHJpbmcsIEV4dEhvc3RUcmVlVmlldzxhbnk+PigpO1xuXHRwcml2YXRlIF90cmVlRHJhZ0FuZERyb3BTZXJ2aWNlOiBJVHJlZVZpZXdzRG5EU2VydmljZTx2c2NvZGUuRGF0YVRyYW5zZmVyPiA9IG5ldyBUcmVlVmlld3NEbkRTZXJ2aWNlPHZzY29kZS5EYXRhVHJhbnNmZXI+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfcHJveHk6IE1haW5UaHJlYWRUcmVlVmlld3NTaGFwZSxcblx0XHRwcml2YXRlIF9jb21tYW5kczogRXh0SG9zdENvbW1hbmRzLFxuXHRcdHByaXZhdGUgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0ZnVuY3Rpb24gaXNUcmVlVmlld0NvbnZlcnRhYmxlSXRlbShhcmc6IGFueSk6IGJvb2xlYW4ge1xuXHRcdFx0cmV0dXJuIGFyZyAmJiBhcmcuJHRyZWVWaWV3SWQgJiYgKGFyZy4kdHJlZUl0ZW1IYW5kbGUgfHwgYXJnLiRzZWxlY3RlZFRyZWVJdGVtcyB8fCBhcmcuJGZvY3VzZWRUcmVlSXRlbSk7XG5cdFx0fVxuXHRcdF9jb21tYW5kcy5yZWdpc3RlckFyZ3VtZW50UHJvY2Vzc29yKHtcblx0XHRcdHByb2Nlc3NBcmd1bWVudDogYXJnID0+IHtcblx0XHRcdFx0aWYgKGlzVHJlZVZpZXdDb252ZXJ0YWJsZUl0ZW0oYXJnKSkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9jb252ZXJ0QXJndW1lbnQoYXJnKTtcblx0XHRcdFx0fSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGFyZykgJiYgKGFyZy5sZW5ndGggPiAwKSkge1xuXHRcdFx0XHRcdHJldHVybiBhcmcubWFwKGl0ZW0gPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGlzVHJlZVZpZXdDb252ZXJ0YWJsZUl0ZW0oaXRlbSkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2NvbnZlcnRBcmd1bWVudChpdGVtKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBpdGVtO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBhcmc7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRyZWdpc3RlclRyZWVEYXRhUHJvdmlkZXI8VD4oaWQ6IHN0cmluZywgdHJlZURhdGFQcm92aWRlcjogdnNjb2RlLlRyZWVEYXRhUHJvdmlkZXI8VD4sIGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHRyZWVWaWV3ID0gdGhpcy5jcmVhdGVUcmVlVmlldyhpZCwgeyB0cmVlRGF0YVByb3ZpZGVyIH0sIGV4dGVuc2lvbik7XG5cdFx0cmV0dXJuIHsgZGlzcG9zZTogKCkgPT4gdHJlZVZpZXcuZGlzcG9zZSgpIH07XG5cdH1cblxuXHRjcmVhdGVUcmVlVmlldzxUPih2aWV3SWQ6IHN0cmluZywgb3B0aW9uczogdnNjb2RlLlRyZWVWaWV3T3B0aW9uczxUPiwgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiB2c2NvZGUuVHJlZVZpZXc8VD4ge1xuXHRcdGlmICghb3B0aW9ucyB8fCAhb3B0aW9ucy50cmVlRGF0YVByb3ZpZGVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ09wdGlvbnMgd2l0aCB0cmVlRGF0YVByb3ZpZGVyIGlzIG1hbmRhdG9yeScpO1xuXHRcdH1cblx0XHRjb25zdCBkcm9wTWltZVR5cGVzID0gb3B0aW9ucy5kcmFnQW5kRHJvcENvbnRyb2xsZXI/LmRyb3BNaW1lVHlwZXMgPz8gW107XG5cdFx0Y29uc3QgZHJhZ01pbWVUeXBlcyA9IG9wdGlvbnMuZHJhZ0FuZERyb3BDb250cm9sbGVyPy5kcmFnTWltZVR5cGVzID8/IFtdO1xuXHRcdGNvbnN0IGhhc0hhbmRsZURyYWcgPSAhIW9wdGlvbnMuZHJhZ0FuZERyb3BDb250cm9sbGVyPy5oYW5kbGVEcmFnO1xuXHRcdGNvbnN0IGhhc0hhbmRsZURyb3AgPSAhIW9wdGlvbnMuZHJhZ0FuZERyb3BDb250cm9sbGVyPy5oYW5kbGVEcm9wO1xuXHRcdGNvbnN0IHRyZWVWaWV3ID0gdGhpcy5fY3JlYXRlRXh0SG9zdFRyZWVWaWV3KHZpZXdJZCwgb3B0aW9ucywgZXh0ZW5zaW9uKTtcblx0XHRjb25zdCBwcm94eU9wdGlvbnMgPSB7IHNob3dDb2xsYXBzZUFsbDogISFvcHRpb25zLnNob3dDb2xsYXBzZUFsbCwgY2FuU2VsZWN0TWFueTogISFvcHRpb25zLmNhblNlbGVjdE1hbnksIGRyb3BNaW1lVHlwZXMsIGRyYWdNaW1lVHlwZXMsIGhhc0hhbmRsZURyYWcsIGhhc0hhbmRsZURyb3AsIG1hbnVhbGx5TWFuYWdlQ2hlY2tib3hlczogISFvcHRpb25zLm1hbmFnZUNoZWNrYm94U3RhdGVNYW51YWxseSB9O1xuXHRcdGNvbnN0IHJlZ2lzdGVyUHJvbWlzZSA9IHRoaXMuX3Byb3h5LiRyZWdpc3RlclRyZWVWaWV3RGF0YVByb3ZpZGVyKHZpZXdJZCwgcHJveHlPcHRpb25zKTtcblx0XHRjb25zdCB2aWV3ID0ge1xuXHRcdFx0Z2V0IG9uRGlkQ29sbGFwc2VFbGVtZW50KCkgeyByZXR1cm4gdHJlZVZpZXcub25EaWRDb2xsYXBzZUVsZW1lbnQ7IH0sXG5cdFx0XHRnZXQgb25EaWRFeHBhbmRFbGVtZW50KCkgeyByZXR1cm4gdHJlZVZpZXcub25EaWRFeHBhbmRFbGVtZW50OyB9LFxuXHRcdFx0Z2V0IHNlbGVjdGlvbigpIHsgcmV0dXJuIHRyZWVWaWV3LnNlbGVjdGVkRWxlbWVudHM7IH0sXG5cdFx0XHRnZXQgb25EaWRDaGFuZ2VTZWxlY3Rpb24oKSB7IHJldHVybiB0cmVlVmlldy5vbkRpZENoYW5nZVNlbGVjdGlvbjsgfSxcblx0XHRcdGdldCBhY3RpdmVJdGVtKCkge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICd0cmVlVmlld0FjdGl2ZUl0ZW0nKTtcblx0XHRcdFx0cmV0dXJuIHRyZWVWaWV3LmZvY3VzZWRFbGVtZW50O1xuXHRcdFx0fSxcblx0XHRcdGdldCBvbkRpZENoYW5nZUFjdGl2ZUl0ZW0oKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3RyZWVWaWV3QWN0aXZlSXRlbScpO1xuXHRcdFx0XHRyZXR1cm4gdHJlZVZpZXcub25EaWRDaGFuZ2VBY3RpdmVJdGVtO1xuXHRcdFx0fSxcblx0XHRcdGdldCB2aXNpYmxlKCkgeyByZXR1cm4gdHJlZVZpZXcudmlzaWJsZTsgfSxcblx0XHRcdGdldCBvbkRpZENoYW5nZVZpc2liaWxpdHkoKSB7IHJldHVybiB0cmVlVmlldy5vbkRpZENoYW5nZVZpc2liaWxpdHk7IH0sXG5cdFx0XHRnZXQgb25EaWRDaGFuZ2VDaGVja2JveFN0YXRlKCkge1xuXHRcdFx0XHRyZXR1cm4gdHJlZVZpZXcub25EaWRDaGFuZ2VDaGVja2JveFN0YXRlO1xuXHRcdFx0fSxcblx0XHRcdGdldCBtZXNzYWdlKCkgeyByZXR1cm4gdHJlZVZpZXcubWVzc2FnZTsgfSxcblx0XHRcdHNldCBtZXNzYWdlKG1lc3NhZ2U6IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZykge1xuXHRcdFx0XHRpZiAoaXNNYXJrZG93blN0cmluZyhtZXNzYWdlKSkge1xuXHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3RyZWVWaWV3TWFya2Rvd25NZXNzYWdlJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dHJlZVZpZXcubWVzc2FnZSA9IG1lc3NhZ2U7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHRpdGxlKCkgeyByZXR1cm4gdHJlZVZpZXcudGl0bGU7IH0sXG5cdFx0XHRzZXQgdGl0bGUodGl0bGU6IHN0cmluZykge1xuXHRcdFx0XHR0cmVlVmlldy50aXRsZSA9IHRpdGxlO1xuXHRcdFx0fSxcblx0XHRcdGdldCBkZXNjcmlwdGlvbigpIHtcblx0XHRcdFx0cmV0dXJuIHRyZWVWaWV3LmRlc2NyaXB0aW9uO1xuXHRcdFx0fSxcblx0XHRcdHNldCBkZXNjcmlwdGlvbihkZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRyZWVWaWV3LmRlc2NyaXB0aW9uID0gZGVzY3JpcHRpb247XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGJhZGdlKCkge1xuXHRcdFx0XHRyZXR1cm4gdHJlZVZpZXcuYmFkZ2U7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IGJhZGdlKGJhZGdlOiB2c2NvZGUuVmlld0JhZGdlIHwgdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGlmICgoYmFkZ2UgIT09IHVuZGVmaW5lZCkgJiYgZXh0SG9zdFR5cGVzLlZpZXdCYWRnZS5pc1ZpZXdCYWRnZShiYWRnZSkpIHtcblx0XHRcdFx0XHR0cmVlVmlldy5iYWRnZSA9IHtcblx0XHRcdFx0XHRcdHZhbHVlOiBNYXRoLmZsb29yKE1hdGguYWJzKGJhZGdlLnZhbHVlKSksXG5cdFx0XHRcdFx0XHR0b29sdGlwOiBiYWRnZS50b29sdGlwXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSBlbHNlIGlmIChiYWRnZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dHJlZVZpZXcuYmFkZ2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRyZXZlYWw6IChlbGVtZW50OiBULCBvcHRpb25zPzogSVJldmVhbE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+ID0+IHtcblx0XHRcdFx0cmV0dXJuIHRyZWVWaWV3LnJldmVhbChlbGVtZW50LCBvcHRpb25zKTtcblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NlOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdC8vIFdhaXQgZm9yIHRoZSByZWdpc3RyYXRpb24gcHJvbWlzZSB0byBmaW5pc2ggYmVmb3JlIGRvaW5nIHRoZSBkaXNwb3NlLlxuXHRcdFx0XHRhd2FpdCByZWdpc3RlclByb21pc2U7XG5cdFx0XHRcdC8vIE9ubHkgbm90aWZ5IHRoZSBtYWluIHRocmVhZCBpZiB0aGlzIHZpZXcgd2FzIG5vdCByZXBsYWNlZCBieSBhIG5ldyByZWdpc3RyYXRpb24uXG5cdFx0XHRcdC8vIFdoZW4gYW4gZXh0ZW5zaW9uIGRpc3Bvc2VzIGEgdmlldyBhbmQgaW1tZWRpYXRlbHkgcmUtcmVnaXN0ZXJzIGl0LCB0aGUgbmV3XG5cdFx0XHRcdC8vIHJlZ2lzdHJhdGlvbiBtYXkgaGF2ZSBhbHJlYWR5IHVwZGF0ZWQgX3RyZWVWaWV3cyBiZWZvcmUgdGhpcyBhc3luYyBkaXNwb3NlIHJ1bnMuXG5cdFx0XHRcdGlmICh0aGlzLl90cmVlVmlld3MuZ2V0KHZpZXdJZCkgPT09IHRyZWVWaWV3KSB7XG5cdFx0XHRcdFx0dGhpcy5fdHJlZVZpZXdzLmRlbGV0ZSh2aWV3SWQpO1xuXHRcdFx0XHRcdHRoaXMuX3Byb3h5LiRkaXNwb3NlVHJlZSh2aWV3SWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRyZWVWaWV3LmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHZpZXcpO1xuXHRcdHJldHVybiB2aWV3IGFzIHZzY29kZS5UcmVlVmlldzxUPjtcblx0fVxuXG5cdGFzeW5jICRnZXRDaGlsZHJlbih0cmVlVmlld0lkOiBzdHJpbmcsIHRyZWVJdGVtSGFuZGxlcz86IHN0cmluZ1tdKTogUHJvbWlzZTwocmVhZG9ubHkgKG51bWJlciB8IElUcmVlSXRlbSlbXSlbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHRyZWVWaWV3ID0gdGhpcy5fdHJlZVZpZXdzLmdldCh0cmVlVmlld0lkKTtcblx0XHRpZiAoIXRyZWVWaWV3KSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IE5vVHJlZVZpZXdFcnJvcih0cmVlVmlld0lkKSk7XG5cdFx0fVxuXHRcdGlmICghdHJlZUl0ZW1IYW5kbGVzKSB7XG5cdFx0XHRjb25zdCBjaGlsZHJlbiA9IGF3YWl0IHRyZWVWaWV3LmdldENoaWxkcmVuKCk7XG5cdFx0XHRyZXR1cm4gY2hpbGRyZW4gPyBbWzAsIC4uLmNoaWxkcmVuXV0gOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdC8vIEtlZXAgb3JkZXIgb2YgdHJlZUl0ZW1IYW5kbGVzIGluIGNhc2UgZXh0ZW5zaW9uIHRyZWVzIGFscmVhZHkgZGVwZW5kIG9uIHRoaXNcblx0XHRjb25zdCByZXN1bHQgPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRyZWVJdGVtSGFuZGxlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgdHJlZUl0ZW1IYW5kbGUgPSB0cmVlSXRlbUhhbmRsZXNbaV07XG5cdFx0XHRjb25zdCBjaGlsZHJlbiA9IGF3YWl0IHRyZWVWaWV3LmdldENoaWxkcmVuKHRyZWVJdGVtSGFuZGxlKTtcblx0XHRcdGlmIChjaGlsZHJlbikge1xuXHRcdFx0XHRyZXN1bHQucHVzaChbaSwgLi4uY2hpbGRyZW5dKTtcblx0XHRcdH1cblxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0YXN5bmMgJGhhbmRsZURyb3AoZGVzdGluYXRpb25WaWV3SWQ6IHN0cmluZywgcmVxdWVzdElkOiBudW1iZXIsIHRyZWVEYXRhVHJhbnNmZXJEVE86IERhdGFUcmFuc2ZlckRUTywgdGFyZ2V0SXRlbUhhbmRsZTogc3RyaW5nIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdFx0b3BlcmF0aW9uVXVpZD86IHN0cmluZywgc291cmNlVmlld0lkPzogc3RyaW5nLCBzb3VyY2VUcmVlSXRlbUhhbmRsZXM/OiBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRyZWVWaWV3ID0gdGhpcy5fdHJlZVZpZXdzLmdldChkZXN0aW5hdGlvblZpZXdJZCk7XG5cdFx0aWYgKCF0cmVlVmlldykge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBOb1RyZWVWaWV3RXJyb3IoZGVzdGluYXRpb25WaWV3SWQpKTtcblx0XHR9XG5cblx0XHRjb25zdCB0cmVlRGF0YVRyYW5zZmVyID0gRGF0YVRyYW5zZmVyLnRvRGF0YVRyYW5zZmVyKHRyZWVEYXRhVHJhbnNmZXJEVE8sIGFzeW5jIGRhdGFJdGVtSW5kZXggPT4ge1xuXHRcdFx0cmV0dXJuIChhd2FpdCB0aGlzLl9wcm94eS4kcmVzb2x2ZURyb3BGaWxlRGF0YShkZXN0aW5hdGlvblZpZXdJZCwgcmVxdWVzdElkLCBkYXRhSXRlbUluZGV4KSkuYnVmZmVyO1xuXHRcdH0pO1xuXHRcdGlmICgoc291cmNlVmlld0lkID09PSBkZXN0aW5hdGlvblZpZXdJZCkgJiYgc291cmNlVHJlZUl0ZW1IYW5kbGVzKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9hZGRBZGRpdGlvbmFsVHJhbnNmZXJJdGVtcyh0cmVlRGF0YVRyYW5zZmVyLCB0cmVlVmlldywgc291cmNlVHJlZUl0ZW1IYW5kbGVzLCB0b2tlbiwgb3BlcmF0aW9uVXVpZCk7XG5cdFx0fVxuXHRcdHJldHVybiB0cmVlVmlldy5vbkRyb3AodHJlZURhdGFUcmFuc2ZlciwgdGFyZ2V0SXRlbUhhbmRsZSwgdG9rZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYWRkQWRkaXRpb25hbFRyYW5zZmVySXRlbXModHJlZURhdGFUcmFuc2ZlcjogdnNjb2RlLkRhdGFUcmFuc2ZlciwgdHJlZVZpZXc6IEV4dEhvc3RUcmVlVmlldzxhbnk+LFxuXHRcdHNvdXJjZVRyZWVJdGVtSGFuZGxlczogc3RyaW5nW10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgb3BlcmF0aW9uVXVpZD86IHN0cmluZyk6IFByb21pc2U8dnNjb2RlLkRhdGFUcmFuc2ZlciB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nVHJhbnNmZXJPcGVyYXRpb24gPSB0aGlzLl90cmVlRHJhZ0FuZERyb3BTZXJ2aWNlLnJlbW92ZURyYWdPcGVyYXRpb25UcmFuc2ZlcihvcGVyYXRpb25VdWlkKTtcblx0XHRpZiAoZXhpc3RpbmdUcmFuc2Zlck9wZXJhdGlvbikge1xuXHRcdFx0KGF3YWl0IGV4aXN0aW5nVHJhbnNmZXJPcGVyYXRpb24pPy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG5cdFx0XHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0XHRcdHRyZWVEYXRhVHJhbnNmZXIuc2V0KGtleSwgdmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9IGVsc2UgaWYgKG9wZXJhdGlvblV1aWQgJiYgdHJlZVZpZXcuaGFuZGxlRHJhZykge1xuXHRcdFx0Y29uc3Qgd2lsbERyb3BQcm9taXNlID0gdHJlZVZpZXcuaGFuZGxlRHJhZyhzb3VyY2VUcmVlSXRlbUhhbmRsZXMsIHRyZWVEYXRhVHJhbnNmZXIsIHRva2VuKTtcblx0XHRcdHRoaXMuX3RyZWVEcmFnQW5kRHJvcFNlcnZpY2UuYWRkRHJhZ09wZXJhdGlvblRyYW5zZmVyKG9wZXJhdGlvblV1aWQsIHdpbGxEcm9wUHJvbWlzZSk7XG5cdFx0XHRhd2FpdCB3aWxsRHJvcFByb21pc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0cmVlRGF0YVRyYW5zZmVyO1xuXHR9XG5cblx0YXN5bmMgJGhhbmRsZURyYWcoc291cmNlVmlld0lkOiBzdHJpbmcsIHNvdXJjZVRyZWVJdGVtSGFuZGxlczogc3RyaW5nW10sIG9wZXJhdGlvblV1aWQ6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxEYXRhVHJhbnNmZXJEVE8gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB0cmVlVmlldyA9IHRoaXMuX3RyZWVWaWV3cy5nZXQoc291cmNlVmlld0lkKTtcblx0XHRpZiAoIXRyZWVWaWV3KSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IE5vVHJlZVZpZXdFcnJvcihzb3VyY2VWaWV3SWQpKTtcblx0XHR9XG5cblx0XHRjb25zdCB0cmVlRGF0YVRyYW5zZmVyID0gYXdhaXQgdGhpcy5fYWRkQWRkaXRpb25hbFRyYW5zZmVySXRlbXMobmV3IGV4dEhvc3RUeXBlcy5EYXRhVHJhbnNmZXIoKSwgdHJlZVZpZXcsIHNvdXJjZVRyZWVJdGVtSGFuZGxlcywgdG9rZW4sIG9wZXJhdGlvblV1aWQpO1xuXHRcdGlmICghdHJlZURhdGFUcmFuc2ZlciB8fCB0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiBEYXRhVHJhbnNmZXIuZnJvbSh0cmVlRGF0YVRyYW5zZmVyKTtcblx0fVxuXG5cdGFzeW5jICRoYXNSZXNvbHZlKHRyZWVWaWV3SWQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHRyZWVWaWV3ID0gdGhpcy5fdHJlZVZpZXdzLmdldCh0cmVlVmlld0lkKTtcblx0XHRpZiAoIXRyZWVWaWV3KSB7XG5cdFx0XHR0aHJvdyBuZXcgTm9UcmVlVmlld0Vycm9yKHRyZWVWaWV3SWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJlZVZpZXcuaGFzUmVzb2x2ZTtcblx0fVxuXG5cdCRyZXNvbHZlKHRyZWVWaWV3SWQ6IHN0cmluZywgdHJlZUl0ZW1IYW5kbGU6IHN0cmluZywgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRyZWVJdGVtIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgdHJlZVZpZXcgPSB0aGlzLl90cmVlVmlld3MuZ2V0KHRyZWVWaWV3SWQpO1xuXHRcdGlmICghdHJlZVZpZXcpIHtcblx0XHRcdHRocm93IG5ldyBOb1RyZWVWaWV3RXJyb3IodHJlZVZpZXdJZCk7XG5cdFx0fVxuXHRcdHJldHVybiB0cmVlVmlldy5yZXNvbHZlVHJlZUl0ZW0odHJlZUl0ZW1IYW5kbGUsIHRva2VuKTtcblx0fVxuXG5cdCRzZXRFeHBhbmRlZCh0cmVlVmlld0lkOiBzdHJpbmcsIHRyZWVJdGVtSGFuZGxlOiBzdHJpbmcsIGV4cGFuZGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgdHJlZVZpZXcgPSB0aGlzLl90cmVlVmlld3MuZ2V0KHRyZWVWaWV3SWQpO1xuXHRcdGlmICghdHJlZVZpZXcpIHtcblx0XHRcdHRocm93IG5ldyBOb1RyZWVWaWV3RXJyb3IodHJlZVZpZXdJZCk7XG5cdFx0fVxuXHRcdHRyZWVWaWV3LnNldEV4cGFuZGVkKHRyZWVJdGVtSGFuZGxlLCBleHBhbmRlZCk7XG5cdH1cblxuXHQkc2V0U2VsZWN0aW9uQW5kRm9jdXModHJlZVZpZXdJZDogc3RyaW5nLCBzZWxlY3RlZEhhbmRsZXM6IHN0cmluZ1tdLCBmb2N1c2VkSGFuZGxlOiBzdHJpbmcpIHtcblx0XHRjb25zdCB0cmVlVmlldyA9IHRoaXMuX3RyZWVWaWV3cy5nZXQodHJlZVZpZXdJZCk7XG5cdFx0aWYgKCF0cmVlVmlldykge1xuXHRcdFx0dGhyb3cgbmV3IE5vVHJlZVZpZXdFcnJvcih0cmVlVmlld0lkKTtcblx0XHR9XG5cdFx0dHJlZVZpZXcuc2V0U2VsZWN0aW9uQW5kRm9jdXMoc2VsZWN0ZWRIYW5kbGVzLCBmb2N1c2VkSGFuZGxlKTtcblx0fVxuXG5cdCRzZXRWaXNpYmxlKHRyZWVWaWV3SWQ6IHN0cmluZywgaXNWaXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgdHJlZVZpZXcgPSB0aGlzLl90cmVlVmlld3MuZ2V0KHRyZWVWaWV3SWQpO1xuXHRcdGlmICghdHJlZVZpZXcpIHtcblx0XHRcdGlmICghaXNWaXNpYmxlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBOb1RyZWVWaWV3RXJyb3IodHJlZVZpZXdJZCk7XG5cdFx0fVxuXHRcdHRyZWVWaWV3LnNldFZpc2libGUoaXNWaXNpYmxlKTtcblx0fVxuXG5cdCRjaGFuZ2VDaGVja2JveFN0YXRlKHRyZWVWaWV3SWQ6IHN0cmluZywgY2hlY2tib3hVcGRhdGU6IENoZWNrYm94VXBkYXRlW10pOiB2b2lkIHtcblx0XHRjb25zdCB0cmVlVmlldyA9IHRoaXMuX3RyZWVWaWV3cy5nZXQodHJlZVZpZXdJZCk7XG5cdFx0aWYgKCF0cmVlVmlldykge1xuXHRcdFx0dGhyb3cgbmV3IE5vVHJlZVZpZXdFcnJvcih0cmVlVmlld0lkKTtcblx0XHR9XG5cdFx0dHJlZVZpZXcuc2V0Q2hlY2tib3hTdGF0ZShjaGVja2JveFVwZGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVFeHRIb3N0VHJlZVZpZXc8VD4oaWQ6IHN0cmluZywgb3B0aW9uczogdnNjb2RlLlRyZWVWaWV3T3B0aW9uczxUPiwgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBFeHRIb3N0VHJlZVZpZXc8VD4ge1xuXHRcdGNvbnN0IHRyZWVWaWV3ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEV4dEhvc3RUcmVlVmlldzxUPihpZCwgb3B0aW9ucywgdGhpcy5fcHJveHksIHRoaXMuX2NvbW1hbmRzLmNvbnZlcnRlciwgdGhpcy5fbG9nU2VydmljZSwgZXh0ZW5zaW9uKSk7XG5cdFx0dGhpcy5fdHJlZVZpZXdzLnNldChpZCwgdHJlZVZpZXcpO1xuXHRcdHJldHVybiB0cmVlVmlldztcblx0fVxuXG5cdHByaXZhdGUgX2NvbnZlcnRBcmd1bWVudChhcmc6IFRyZWVWaWV3SXRlbUhhbmRsZUFyZyB8IFRyZWVWaWV3UGFuZUhhbmRsZUFyZyk6IGFueSB7XG5cdFx0Y29uc3QgdHJlZVZpZXcgPSB0aGlzLl90cmVlVmlld3MuZ2V0KGFyZy4kdHJlZVZpZXdJZCk7XG5cdFx0Y29uc3QgYXNJdGVtSGFuZGxlID0gYXJnIGFzIFBhcnRpYWw8VHJlZVZpZXdJdGVtSGFuZGxlQXJnPjtcblx0XHRpZiAodHJlZVZpZXcgJiYgYXNJdGVtSGFuZGxlLiR0cmVlSXRlbUhhbmRsZSkge1xuXHRcdFx0cmV0dXJuIHRyZWVWaWV3LmdldEV4dGVuc2lvbkVsZW1lbnQoYXNJdGVtSGFuZGxlLiR0cmVlSXRlbUhhbmRsZSk7XG5cdFx0fVxuXHRcdGNvbnN0IGFzUGFuZUhhbmRsZSA9IGFyZyBhcyBQYXJ0aWFsPFRyZWVWaWV3UGFuZUhhbmRsZUFyZz47XG5cdFx0aWYgKHRyZWVWaWV3ICYmIGFzUGFuZUhhbmRsZS4kZm9jdXNlZFRyZWVJdGVtKSB7XG5cdFx0XHRyZXR1cm4gdHJlZVZpZXcuZm9jdXNlZEVsZW1lbnQ7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG59XG5cbnR5cGUgUm9vdCA9IG51bGwgfCB1bmRlZmluZWQgfCB2b2lkO1xudHlwZSBUcmVlRGF0YTxUPiA9IHsgbWVzc2FnZTogYm9vbGVhbjsgZWxlbWVudDogVCB8IFRbXSB8IFJvb3QgfCBmYWxzZSB9O1xuXG5pbnRlcmZhY2UgVHJlZU5vZGUgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdGl0ZW06IElUcmVlSXRlbTtcblx0ZXh0ZW5zaW9uSXRlbTogdnNjb2RlLlRyZWVJdGVtO1xuXHRwYXJlbnQ6IFRyZWVOb2RlIHwgUm9vdDtcblx0Y2hpbGRyZW4/OiBUcmVlTm9kZVtdO1xuXHRkaXNwb3NhYmxlU3RvcmU6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuY2xhc3MgRXh0SG9zdFRyZWVWaWV3PFQ+IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTEFCRUxfSEFORExFX1BSRUZJWCA9ICcwJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSURfSEFORExFX1BSRUZJWCA9ICcxJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUk9PVF9GRVRDSF9LRVkgPSBTeW1ib2woJ2V4dEhvc3RUcmVlVmlld1Jvb3QnKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kYXRhUHJvdmlkZXI6IHZzY29kZS5UcmVlRGF0YVByb3ZpZGVyPFQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kbmRDb250cm9sbGVyOiB2c2NvZGUuVHJlZURyYWdBbmREcm9wQ29udHJvbGxlcjxUPiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9yb290czogVHJlZU5vZGVbXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZWxlbWVudHM6IE1hcDxUcmVlSXRlbUhhbmRsZSwgVD4gPSBuZXcgTWFwPFRyZWVJdGVtSGFuZGxlLCBUPigpO1xuXHRwcml2YXRlIF9ub2RlczogTWFwPFQsIFRyZWVOb2RlPiA9IG5ldyBNYXA8VCwgVHJlZU5vZGU+KCk7XG5cdC8vIFRyYWNrIHRoZSBsYXRlc3QgY2hpbGQtZmV0Y2ggcGVyIGVsZW1lbnQgc28gdGhhdCByZWZyZXNoLXRyaWdnZXJlZCBjYWNoZSBjbGVhcnMgaWdub3JlIHN0YWxlIHJlc3VsdHMuXG5cdC8vIFdpdGhvdXQgdGhlc2UgdG9rZW5zLCBhbiBlYXJsaWVyIGdldENoaWxkcmVuIHByb21pc2UgcmVzb2x2aW5nIGFmdGVyIHJlZnJlc2ggd291bGQgcmUtcmVnaXN0ZXIgaGFuZGxlcyBhbmQgaGl0IHRoZSBkdXBsaWNhdGUtaWQgZ3VhcmQuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoaWxkcmVuRmV0Y2hUb2tlbnMgPSBuZXcgTWFwPFQgfCB0eXBlb2YgRXh0SG9zdFRyZWVWaWV3LlJPT1RfRkVUQ0hfS0VZLCBudW1iZXI+KCk7XG5cdC8vIEdsb2JhbCBjb3VudGVyIGZvciBmZXRjaCB0b2tlbnMuIFVzaW5nIGEgbW9ub3RvbmljYWxseSBpbmNyZWFzaW5nIGNvdW50ZXIgZW5zdXJlcyB0aGF0IGV2ZW4gYWZ0ZXJcblx0Ly8gX2NoaWxkcmVuRmV0Y2hUb2tlbnMuY2xlYXIoKSBkdXJpbmcgYSByb290IHJlZnJlc2gsIG9sZCBpbi1mbGlnaHQgZmV0Y2hlcyB3aWxsIGhhdmUgcmVxdWVzdElkcyB0aGF0XG5cdC8vIGNhbiBuZXZlciBtYXRjaCBuZXcgZmV0Y2hlcyAoZS5nLiwgb2xkIGZldGNoIGhhcyBpZD01LCBhZnRlciBjbGVhciBuZXcgZmV0Y2hlcyBnZXQgNiwgNywgOC4uLikuXG5cdHByaXZhdGUgX2dsb2JhbEZldGNoVG9rZW5Db3VudGVyID0gMDtcblxuXHRwcml2YXRlIF92aXNpYmxlOiBib29sZWFuID0gZmFsc2U7XG5cdGdldCB2aXNpYmxlKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fdmlzaWJsZTsgfVxuXG5cdHByaXZhdGUgX3NlbGVjdGVkSGFuZGxlczogVHJlZUl0ZW1IYW5kbGVbXSA9IFtdO1xuXHRnZXQgc2VsZWN0ZWRFbGVtZW50cygpOiBUW10geyByZXR1cm4gPFRbXT50aGlzLl9zZWxlY3RlZEhhbmRsZXMubWFwKGhhbmRsZSA9PiB0aGlzLmdldEV4dGVuc2lvbkVsZW1lbnQoaGFuZGxlKSkuZmlsdGVyKGVsZW1lbnQgPT4gIWlzVW5kZWZpbmVkT3JOdWxsKGVsZW1lbnQpKTsgfVxuXG5cdHByaXZhdGUgX2ZvY3VzZWRIYW5kbGU6IFRyZWVJdGVtSGFuZGxlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRnZXQgZm9jdXNlZEVsZW1lbnQoKTogVCB8IHVuZGVmaW5lZCB7IHJldHVybiA8VCB8IHVuZGVmaW5lZD4odGhpcy5fZm9jdXNlZEhhbmRsZSA/IHRoaXMuZ2V0RXh0ZW5zaW9uRWxlbWVudCh0aGlzLl9mb2N1c2VkSGFuZGxlKSA6IHVuZGVmaW5lZCk7IH1cblxuXHRwcml2YXRlIF9vbkRpZEV4cGFuZEVsZW1lbnQ6IEVtaXR0ZXI8dnNjb2RlLlRyZWVWaWV3RXhwYW5zaW9uRXZlbnQ8VD4+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dnNjb2RlLlRyZWVWaWV3RXhwYW5zaW9uRXZlbnQ8VD4+KCkpO1xuXHRyZWFkb25seSBvbkRpZEV4cGFuZEVsZW1lbnQ6IEV2ZW50PHZzY29kZS5UcmVlVmlld0V4cGFuc2lvbkV2ZW50PFQ+PiA9IHRoaXMuX29uRGlkRXhwYW5kRWxlbWVudC5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZENvbGxhcHNlRWxlbWVudDogRW1pdHRlcjx2c2NvZGUuVHJlZVZpZXdFeHBhbnNpb25FdmVudDxUPj4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2c2NvZGUuVHJlZVZpZXdFeHBhbnNpb25FdmVudDxUPj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ29sbGFwc2VFbGVtZW50OiBFdmVudDx2c2NvZGUuVHJlZVZpZXdFeHBhbnNpb25FdmVudDxUPj4gPSB0aGlzLl9vbkRpZENvbGxhcHNlRWxlbWVudC5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZVNlbGVjdGlvbjogRW1pdHRlcjx2c2NvZGUuVHJlZVZpZXdTZWxlY3Rpb25DaGFuZ2VFdmVudDxUPj4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2c2NvZGUuVHJlZVZpZXdTZWxlY3Rpb25DaGFuZ2VFdmVudDxUPj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2VsZWN0aW9uOiBFdmVudDx2c2NvZGUuVHJlZVZpZXdTZWxlY3Rpb25DaGFuZ2VFdmVudDxUPj4gPSB0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZUFjdGl2ZUl0ZW06IEVtaXR0ZXI8dnNjb2RlLlRyZWVWaWV3QWN0aXZlSXRlbUNoYW5nZUV2ZW50PFQ+PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZzY29kZS5UcmVlVmlld0FjdGl2ZUl0ZW1DaGFuZ2VFdmVudDxUPj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZlSXRlbTogRXZlbnQ8dnNjb2RlLlRyZWVWaWV3QWN0aXZlSXRlbUNoYW5nZUV2ZW50PFQ+PiA9IHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlSXRlbS5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZVZpc2liaWxpdHk6IEVtaXR0ZXI8dnNjb2RlLlRyZWVWaWV3VmlzaWJpbGl0eUNoYW5nZUV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZzY29kZS5UcmVlVmlld1Zpc2liaWxpdHlDaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlzaWJpbGl0eTogRXZlbnQ8dnNjb2RlLlRyZWVWaWV3VmlzaWJpbGl0eUNoYW5nZUV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZUNoZWNrYm94U3RhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2c2NvZGUuVHJlZUNoZWNrYm94Q2hhbmdlRXZlbnQ8VD4+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNoZWNrYm94U3RhdGU6IEV2ZW50PHZzY29kZS5UcmVlQ2hlY2tib3hDaGFuZ2VFdmVudDxUPj4gPSB0aGlzLl9vbkRpZENoYW5nZUNoZWNrYm94U3RhdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VEYXRhOiBFbWl0dGVyPFRyZWVEYXRhPFQ+PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFRyZWVEYXRhPFQ+PigpKTtcblxuXHRwcml2YXRlIF9yZWZyZXNoUHJvbWlzZTogUHJvbWlzZTx2b2lkPiA9IFByb21pc2UucmVzb2x2ZSgpO1xuXHRwcml2YXRlIF9yZWZyZXNoUXVldWU6IFByb21pc2U8dm9pZD4gPSBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRwcml2YXRlIF9ub2Rlc1RvQ2xlYXI6IFNldDxUcmVlTm9kZT4gPSBuZXcgU2V0PFRyZWVOb2RlPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgX3ZpZXdJZDogc3RyaW5nLCBvcHRpb25zOiB2c2NvZGUuVHJlZVZpZXdPcHRpb25zPFQ+LFxuXHRcdHByaXZhdGUgX3Byb3h5OiBNYWluVGhyZWFkVHJlZVZpZXdzU2hhcGUsXG5cdFx0cHJpdmF0ZSBfY29tbWFuZHM6IENvbW1hbmRzQ29udmVydGVyLFxuXHRcdHByaXZhdGUgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdHByaXZhdGUgX2V4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0aWYgKF9leHRlbnNpb24uY29udHJpYnV0ZXMgJiYgX2V4dGVuc2lvbi5jb250cmlidXRlcy52aWV3cykge1xuXHRcdFx0Zm9yIChjb25zdCBsb2NhdGlvbiBpbiBfZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnZpZXdzKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgdmlldyBvZiBfZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnZpZXdzW2xvY2F0aW9uXSkge1xuXHRcdFx0XHRcdGlmICh2aWV3LmlkID09PSBfdmlld0lkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl90aXRsZSA9IHZpZXcubmFtZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fZGF0YVByb3ZpZGVyID0gb3B0aW9ucy50cmVlRGF0YVByb3ZpZGVyO1xuXHRcdHRoaXMuX2RuZENvbnRyb2xsZXIgPSBvcHRpb25zLmRyYWdBbmREcm9wQ29udHJvbGxlcjtcblx0XHRpZiAodGhpcy5fZGF0YVByb3ZpZGVyLm9uRGlkQ2hhbmdlVHJlZURhdGEpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2RhdGFQcm92aWRlci5vbkRpZENoYW5nZVRyZWVEYXRhKGVsZW1lbnRPckVsZW1lbnRzID0+IHtcblx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoZWxlbWVudE9yRWxlbWVudHMpICYmIGVsZW1lbnRPckVsZW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZURhdGEuZmlyZSh7IG1lc3NhZ2U6IGZhbHNlLCBlbGVtZW50OiBlbGVtZW50T3JFbGVtZW50cyB9KTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRsZXQgcmVmcmVzaGluZ1Byb21pc2U6IFByb21pc2U8dm9pZD4gfCBudWxsO1xuXHRcdGxldCBwcm9taXNlQ2FsbGJhY2s6ICgpID0+IHZvaWQ7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VEYXRhID0gRXZlbnQuZGVib3VuY2U8VHJlZURhdGE8VD4sIHsgbWVzc2FnZTogYm9vbGVhbjsgZWxlbWVudHM6IChUIHwgUm9vdClbXSB9Pih0aGlzLl9vbkRpZENoYW5nZURhdGEuZXZlbnQsIChyZXN1bHQsIGN1cnJlbnQpID0+IHtcblx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdHJlc3VsdCA9IHsgbWVzc2FnZTogZmFsc2UsIGVsZW1lbnRzOiBbXSB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGN1cnJlbnQuZWxlbWVudCAhPT0gZmFsc2UpIHtcblx0XHRcdFx0aWYgKCFyZWZyZXNoaW5nUHJvbWlzZSkge1xuXHRcdFx0XHRcdC8vIE5ldyByZWZyZXNoIGhhcyBzdGFydGVkXG5cdFx0XHRcdFx0cmVmcmVzaGluZ1Byb21pc2UgPSBuZXcgUHJvbWlzZShjID0+IHByb21pc2VDYWxsYmFjayA9IGMpO1xuXHRcdFx0XHRcdHRoaXMuX3JlZnJlc2hQcm9taXNlID0gdGhpcy5fcmVmcmVzaFByb21pc2UudGhlbigoKSA9PiByZWZyZXNoaW5nUHJvbWlzZSEpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KGN1cnJlbnQuZWxlbWVudCkpIHtcblx0XHRcdFx0XHRyZXN1bHQuZWxlbWVudHMucHVzaCguLi5jdXJyZW50LmVsZW1lbnQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc3VsdC5lbGVtZW50cy5wdXNoKGN1cnJlbnQuZWxlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChjdXJyZW50Lm1lc3NhZ2UpIHtcblx0XHRcdFx0cmVzdWx0Lm1lc3NhZ2UgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9LCAyMDAsIHRydWUpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG9uRGlkQ2hhbmdlRGF0YSgoeyBtZXNzYWdlLCBlbGVtZW50cyB9KSA9PiB7XG5cdFx0XHRpZiAoZWxlbWVudHMubGVuZ3RoKSB7XG5cdFx0XHRcdGVsZW1lbnRzID0gZGlzdGluY3QoZWxlbWVudHMpO1xuXHRcdFx0XHR0aGlzLl9yZWZyZXNoUXVldWUgPSB0aGlzLl9yZWZyZXNoUXVldWUudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgX3Byb21pc2VDYWxsYmFjayA9IHByb21pc2VDYWxsYmFjaztcblx0XHRcdFx0XHRyZWZyZXNoaW5nUHJvbWlzZSA9IG51bGw7XG5cdFx0XHRcdFx0Y29uc3QgY2hpbGRyZW5Ub0NsZWFyID0gQXJyYXkuZnJvbSh0aGlzLl9ub2Rlc1RvQ2xlYXIpO1xuXHRcdFx0XHRcdHRoaXMuX25vZGVzVG9DbGVhci5jbGVhcigpO1xuXHRcdFx0XHRcdHRoaXMuX2RlYnVnTG9nUmVmcmVzaCgnc3RhcnQnLCBlbGVtZW50cywgY2hpbGRyZW5Ub0NsZWFyKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fcmVmcmVzaChlbGVtZW50cykudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9kZWJ1Z0xvZ1JlZnJlc2goJ2RvbmUnLCBlbGVtZW50cywgY2hpbGRyZW5Ub0NsZWFyKTtcblx0XHRcdFx0XHRcdHRoaXMuX2NsZWFyTm9kZXMoY2hpbGRyZW5Ub0NsZWFyKTtcblx0XHRcdFx0XHRcdHJldHVybiBfcHJvbWlzZUNhbGxiYWNrKCk7XG5cdFx0XHRcdFx0fSkuY2F0Y2goZSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBtZXNzYWdlID0gZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogSlNPTi5zdHJpbmdpZnkoZSk7XG5cdFx0XHRcdFx0XHR0aGlzLl9kZWJ1Z0xvZ1JlZnJlc2goJ2Vycm9yJywgZWxlbWVudHMsIGNoaWxkcmVuVG9DbGVhcik7XG5cdFx0XHRcdFx0XHR0aGlzLl9jbGVhck5vZGVzKGNoaWxkcmVuVG9DbGVhcik7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBVbmFibGUgdG8gcmVmcmVzaCB0cmVlIHZpZXcgJHt0aGlzLl92aWV3SWR9OiAke21lc3NhZ2V9YCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gX3Byb21pc2VDYWxsYmFjaygpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGlmIChtZXNzYWdlKSB7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRzZXRNZXNzYWdlKHRoaXMuX3ZpZXdJZCwgTWFya2Rvd25TdHJpbmcuZnJvbVN0cmljdCh0aGlzLl9tZXNzYWdlKSA/PyAnJyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGVidWdDb2xsZWN0SGFuZGxlcyhlbGVtZW50czogKFQgfCBSb290KVtdKTogeyBjaGFuZ2VkOiBzdHJpbmdbXTsgcm9vdHM6IHN0cmluZ1tdOyBjbGVhcmluZz86IHN0cmluZ1tdIH0ge1xuXHRcdGNvbnN0IGNoYW5nZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBlbCBvZiBlbGVtZW50cykge1xuXHRcdFx0aWYgKCFlbCkge1xuXHRcdFx0XHRjaGFuZ2VkLnB1c2goJzxyb290PicpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG5vZGUgPSB0aGlzLl9ub2Rlcy5nZXQoZWwgYXMgVCk7XG5cdFx0XHRpZiAobm9kZSkge1xuXHRcdFx0XHRjaGFuZ2VkLnB1c2gobm9kZS5pdGVtLmhhbmRsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHJvb3RzID0gdGhpcy5fcm9vdHM/Lm1hcChyID0+IHIuaXRlbS5oYW5kbGUpID8/IFtdO1xuXHRcdHJldHVybiB7IGNoYW5nZWQsIHJvb3RzIH07XG5cdH1cblxuXHRwcml2YXRlIF9kZWJ1Z0xvZ1JlZnJlc2gocGhhc2U6ICdzdGFydCcgfCAnZG9uZScgfCAnZXJyb3InLCBlbGVtZW50czogKFQgfCBSb290KVtdLCBjaGlsZHJlblRvQ2xlYXI6IFRyZWVOb2RlW10pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzRGVidWdMb2dnaW5nKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNuYXBzaG90ID0gdGhpcy5fZGVidWdDb2xsZWN0SGFuZGxlcyhlbGVtZW50cyk7XG5cdFx0XHRzbmFwc2hvdC5jbGVhcmluZyA9IGNoaWxkcmVuVG9DbGVhci5tYXAobiA9PiBuLml0ZW0uaGFuZGxlKTtcblx0XHRcdGNvbnN0IGNoYW5nZWRDb3VudCA9IHNuYXBzaG90LmNoYW5nZWQubGVuZ3RoO1xuXHRcdFx0Y29uc3Qgbm9kZXNUb0NsZWFyTGVuID0gY2hpbGRyZW5Ub0NsZWFyLmxlbmd0aDtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtUcmVlVmlldzoke3RoaXMuX3ZpZXdJZH1dIHJlZnJlc2ggJHtwaGFzZX0gY2hhbmdlZD0ke2NoYW5nZWRDb3VudH0gbm9kZXNUb0NsZWFyPSR7bm9kZXNUb0NsZWFyTGVufSBlbGVtZW50cy5zaXplPSR7dGhpcy5fZWxlbWVudHMuc2l6ZX0gbm9kZXMuc2l6ZT0ke3RoaXMuX25vZGVzLnNpemV9IGhhbmRsZXM9JHtKU09OLnN0cmluZ2lmeShzbmFwc2hvdCl9YCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBbVHJlZVZpZXc6JHt0aGlzLl92aWV3SWR9XSByZWZyZXNoICR7cGhhc2V9IChzbmFwc2hvdCBmYWlsZWQpYCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaXNEZWJ1Z0xvZ2dpbmcoKTogYm9vbGVhbiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGxldmVsID0gdGhpcy5fbG9nU2VydmljZS5nZXRMZXZlbCgpO1xuXHRcdFx0cmV0dXJuIChsZXZlbCA9PT0gTG9nTGV2ZWwuRGVidWcpIHx8IChsZXZlbCA9PT0gTG9nTGV2ZWwuVHJhY2UpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGdldENoaWxkcmVuKHBhcmVudEhhbmRsZTogVHJlZUl0ZW1IYW5kbGUgfCBSb290KTogUHJvbWlzZTxyZWFkb25seSBJVHJlZUl0ZW1bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHBhcmVudEVsZW1lbnQgPSBwYXJlbnRIYW5kbGUgPyB0aGlzLmdldEV4dGVuc2lvbkVsZW1lbnQocGFyZW50SGFuZGxlKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAocGFyZW50SGFuZGxlICYmICFwYXJlbnRFbGVtZW50KSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBObyB0cmVlIGl0ZW0gd2l0aCBpZCBcXCcke3BhcmVudEhhbmRsZX1cXCcgZm91bmQuYCk7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtdKTtcblx0XHR9XG5cblx0XHRsZXQgY2hpbGRyZW5Ob2RlczogVHJlZU5vZGVbXSB8IHVuZGVmaW5lZCA9IHRoaXMuX2dldENoaWxkcmVuTm9kZXMocGFyZW50SGFuZGxlKTsgLy8gR2V0IGl0IGZyb20gY2FjaGVcblxuXHRcdGlmICghY2hpbGRyZW5Ob2Rlcykge1xuXHRcdFx0Y2hpbGRyZW5Ob2RlcyA9IGF3YWl0IHRoaXMuX2ZldGNoQ2hpbGRyZW5Ob2RlcyhwYXJlbnRFbGVtZW50KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY2hpbGRyZW5Ob2RlcyA/IGNoaWxkcmVuTm9kZXMubWFwKG4gPT4gbi5pdGVtKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldEV4dGVuc2lvbkVsZW1lbnQodHJlZUl0ZW1IYW5kbGU6IFRyZWVJdGVtSGFuZGxlKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2VsZW1lbnRzLmdldCh0cmVlSXRlbUhhbmRsZSk7XG5cdH1cblxuXHRyZXZlYWwoZWxlbWVudDogVCB8IHVuZGVmaW5lZCwgb3B0aW9ucz86IElSZXZlYWxPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0b3B0aW9ucyA9IG9wdGlvbnMgPyBvcHRpb25zIDogeyBzZWxlY3Q6IHRydWUsIGZvY3VzOiBmYWxzZSB9O1xuXHRcdGNvbnN0IHNlbGVjdCA9IGlzVW5kZWZpbmVkT3JOdWxsKG9wdGlvbnMuc2VsZWN0KSA/IHRydWUgOiBvcHRpb25zLnNlbGVjdDtcblx0XHRjb25zdCBmb2N1cyA9IGlzVW5kZWZpbmVkT3JOdWxsKG9wdGlvbnMuZm9jdXMpID8gZmFsc2UgOiBvcHRpb25zLmZvY3VzO1xuXHRcdGNvbnN0IGV4cGFuZCA9IGlzVW5kZWZpbmVkT3JOdWxsKG9wdGlvbnMuZXhwYW5kKSA/IGZhbHNlIDogb3B0aW9ucy5leHBhbmQ7XG5cblx0XHRpZiAodHlwZW9mIHRoaXMuX2RhdGFQcm92aWRlci5nZXRQYXJlbnQgIT09ICdmdW5jdGlvbicpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoYFJlcXVpcmVkIHJlZ2lzdGVyZWQgVHJlZURhdGFQcm92aWRlciB0byBpbXBsZW1lbnQgJ2dldFBhcmVudCcgbWV0aG9kIHRvIGFjY2VzcyAncmV2ZWFsJyBtZXRob2RgKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9yZWZyZXNoUHJvbWlzZVxuXHRcdFx0XHQudGhlbigoKSA9PiB0aGlzLl9yZXNvbHZlVW5rbm93blBhcmVudENoYWluKGVsZW1lbnQpKVxuXHRcdFx0XHQudGhlbihwYXJlbnRDaGFpbiA9PiB0aGlzLl9yZXNvbHZlVHJlZU5vZGUoZWxlbWVudCwgcGFyZW50Q2hhaW5bcGFyZW50Q2hhaW4ubGVuZ3RoIC0gMV0pXG5cdFx0XHRcdFx0LnRoZW4odHJlZU5vZGUgPT4gdGhpcy5fcHJveHkuJHJldmVhbCh0aGlzLl92aWV3SWQsIHsgaXRlbTogdHJlZU5vZGUuaXRlbSwgcGFyZW50Q2hhaW46IHBhcmVudENoYWluLm1hcChwID0+IHAuaXRlbSkgfSwgeyBzZWxlY3QsIGZvY3VzLCBleHBhbmQgfSkpLCBlcnJvciA9PiB0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVycm9yKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLl9wcm94eS4kcmV2ZWFsKHRoaXMuX3ZpZXdJZCwgdW5kZWZpbmVkLCB7IHNlbGVjdCwgZm9jdXMsIGV4cGFuZCB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9tZXNzYWdlOiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmcgPSAnJztcblx0Z2V0IG1lc3NhZ2UoKTogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fbWVzc2FnZTtcblx0fVxuXG5cdHNldCBtZXNzYWdlKG1lc3NhZ2U6IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZykge1xuXHRcdHRoaXMuX21lc3NhZ2UgPSBtZXNzYWdlO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRGF0YS5maXJlKHsgbWVzc2FnZTogdHJ1ZSwgZWxlbWVudDogZmFsc2UgfSk7XG5cdH1cblxuXHRwcml2YXRlIF90aXRsZTogc3RyaW5nID0gJyc7XG5cdGdldCB0aXRsZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl90aXRsZTtcblx0fVxuXG5cdHNldCB0aXRsZSh0aXRsZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5fdGl0bGUgPSB0aXRsZTtcblx0XHR0aGlzLl9wcm94eS4kc2V0VGl0bGUodGhpcy5fdmlld0lkLCB0aXRsZSwgdGhpcy5fZGVzY3JpcHRpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Z2V0IGRlc2NyaXB0aW9uKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2Rlc2NyaXB0aW9uO1xuXHR9XG5cblx0c2V0IGRlc2NyaXB0aW9uKGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9kZXNjcmlwdGlvbiA9IGRlc2NyaXB0aW9uO1xuXHRcdHRoaXMuX3Byb3h5LiRzZXRUaXRsZSh0aGlzLl92aWV3SWQsIHRoaXMuX3RpdGxlLCBkZXNjcmlwdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIF9iYWRnZTogdnNjb2RlLlZpZXdCYWRnZSB8IHVuZGVmaW5lZDtcblx0Z2V0IGJhZGdlKCk6IHZzY29kZS5WaWV3QmFkZ2UgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9iYWRnZTtcblx0fVxuXG5cdHNldCBiYWRnZShiYWRnZTogdnNjb2RlLlZpZXdCYWRnZSB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLl9iYWRnZT8udmFsdWUgPT09IGJhZGdlPy52YWx1ZSAmJlxuXHRcdFx0dGhpcy5fYmFkZ2U/LnRvb2x0aXAgPT09IGJhZGdlPy50b29sdGlwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fYmFkZ2UgPSBWaWV3QmFkZ2UuZnJvbShiYWRnZSk7XG5cdFx0dGhpcy5fcHJveHkuJHNldEJhZGdlKHRoaXMuX3ZpZXdJZCwgYmFkZ2UpO1xuXHR9XG5cblx0c2V0RXhwYW5kZWQodHJlZUl0ZW1IYW5kbGU6IFRyZWVJdGVtSGFuZGxlLCBleHBhbmRlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLmdldEV4dGVuc2lvbkVsZW1lbnQodHJlZUl0ZW1IYW5kbGUpO1xuXHRcdGlmIChlbGVtZW50KSB7XG5cdFx0XHRpZiAoZXhwYW5kZWQpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRFeHBhbmRFbGVtZW50LmZpcmUoT2JqZWN0LmZyZWV6ZSh7IGVsZW1lbnQgfSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDb2xsYXBzZUVsZW1lbnQuZmlyZShPYmplY3QuZnJlZXplKHsgZWxlbWVudCB9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0c2V0U2VsZWN0aW9uQW5kRm9jdXMoc2VsZWN0ZWRIYW5kbGVzOiBUcmVlSXRlbUhhbmRsZVtdLCBmb2N1c2VkSGFuZGxlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBjaGFuZ2VkU2VsZWN0aW9uID0gIWVxdWFscyh0aGlzLl9zZWxlY3RlZEhhbmRsZXMsIHNlbGVjdGVkSGFuZGxlcyk7XG5cdFx0dGhpcy5fc2VsZWN0ZWRIYW5kbGVzID0gc2VsZWN0ZWRIYW5kbGVzO1xuXG5cdFx0Y29uc3QgY2hhbmdlZEZvY3VzID0gdGhpcy5fZm9jdXNlZEhhbmRsZSAhPT0gZm9jdXNlZEhhbmRsZTtcblx0XHR0aGlzLl9mb2N1c2VkSGFuZGxlID0gZm9jdXNlZEhhbmRsZTtcblxuXHRcdGlmIChjaGFuZ2VkU2VsZWN0aW9uKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5maXJlKE9iamVjdC5mcmVlemUoeyBzZWxlY3Rpb246IHRoaXMuc2VsZWN0ZWRFbGVtZW50cyB9KSk7XG5cdFx0fVxuXG5cdFx0aWYgKGNoYW5nZWRGb2N1cykge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVJdGVtLmZpcmUoT2JqZWN0LmZyZWV6ZSh7IGFjdGl2ZUl0ZW06IHRoaXMuZm9jdXNlZEVsZW1lbnQgfSkpO1xuXHRcdH1cblx0fVxuXG5cdHNldFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh2aXNpYmxlICE9PSB0aGlzLl92aXNpYmxlKSB7XG5cdFx0XHR0aGlzLl92aXNpYmxlID0gdmlzaWJsZTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5maXJlKE9iamVjdC5mcmVlemUoeyB2aXNpYmxlOiB0aGlzLl92aXNpYmxlIH0pKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzZXRDaGVja2JveFN0YXRlKGNoZWNrYm94VXBkYXRlczogQ2hlY2tib3hVcGRhdGVbXSkge1xuXHRcdHR5cGUgQ2hlY2tib3hVcGRhdGVXaXRoSXRlbSA9IHsgZXh0ZW5zaW9uSXRlbTogTm9uTnVsbGFibGU8VD47IHRyZWVJdGVtOiB2c2NvZGUuVHJlZUl0ZW07IG5ld1N0YXRlOiBleHRIb3N0VHlwZXMuVHJlZUl0ZW1DaGVja2JveFN0YXRlIH07XG5cdFx0Y29uc3QgaXRlbXMgPSAoYXdhaXQgUHJvbWlzZS5hbGwoY2hlY2tib3hVcGRhdGVzLm1hcChhc3luYyBjaGVja2JveFVwZGF0ZSA9PiB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25JdGVtID0gdGhpcy5nZXRFeHRlbnNpb25FbGVtZW50KGNoZWNrYm94VXBkYXRlLnRyZWVJdGVtSGFuZGxlKTtcblx0XHRcdGlmIChleHRlbnNpb25JdGVtKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSXRlbTogZXh0ZW5zaW9uSXRlbSxcblx0XHRcdFx0XHR0cmVlSXRlbTogYXdhaXQgdGhpcy5fZGF0YVByb3ZpZGVyLmdldFRyZWVJdGVtKGV4dGVuc2lvbkl0ZW0pLFxuXHRcdFx0XHRcdG5ld1N0YXRlOiBjaGVja2JveFVwZGF0ZS5uZXdTdGF0ZSA/IGV4dEhvc3RUeXBlcy5UcmVlSXRlbUNoZWNrYm94U3RhdGUuQ2hlY2tlZCA6IGV4dEhvc3RUeXBlcy5UcmVlSXRlbUNoZWNrYm94U3RhdGUuVW5jaGVja2VkXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0fSkpKS5maWx0ZXI8Q2hlY2tib3hVcGRhdGVXaXRoSXRlbT4oKGl0ZW0pOiBpdGVtIGlzIENoZWNrYm94VXBkYXRlV2l0aEl0ZW0gPT4gaXRlbSAhPT0gdW5kZWZpbmVkKTtcblxuXHRcdGl0ZW1zLmZvckVhY2goaXRlbSA9PiB7XG5cdFx0XHRpdGVtLnRyZWVJdGVtLmNoZWNrYm94U3RhdGUgPSBpdGVtLm5ld1N0YXRlID8gZXh0SG9zdFR5cGVzLlRyZWVJdGVtQ2hlY2tib3hTdGF0ZS5DaGVja2VkIDogZXh0SG9zdFR5cGVzLlRyZWVJdGVtQ2hlY2tib3hTdGF0ZS5VbmNoZWNrZWQ7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZUNoZWNrYm94U3RhdGUuZmlyZSh7IGl0ZW1zOiBpdGVtcy5tYXAoaXRlbSA9PiBbaXRlbS5leHRlbnNpb25JdGVtLCBpdGVtLm5ld1N0YXRlXSkgfSk7XG5cdH1cblxuXHRhc3luYyBoYW5kbGVEcmFnKHNvdXJjZVRyZWVJdGVtSGFuZGxlczogVHJlZUl0ZW1IYW5kbGVbXSwgdHJlZURhdGFUcmFuc2ZlcjogdnNjb2RlLkRhdGFUcmFuc2ZlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2c2NvZGUuRGF0YVRyYW5zZmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uVHJlZUl0ZW1zOiBUW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHNvdXJjZUhhbmRsZSBvZiBzb3VyY2VUcmVlSXRlbUhhbmRsZXMpIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbkl0ZW0gPSB0aGlzLmdldEV4dGVuc2lvbkVsZW1lbnQoc291cmNlSGFuZGxlKTtcblx0XHRcdGlmIChleHRlbnNpb25JdGVtKSB7XG5cdFx0XHRcdGV4dGVuc2lvblRyZWVJdGVtcy5wdXNoKGV4dGVuc2lvbkl0ZW0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fZG5kQ29udHJvbGxlcj8uaGFuZGxlRHJhZyB8fCAoZXh0ZW5zaW9uVHJlZUl0ZW1zLmxlbmd0aCA9PT0gMCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fZG5kQ29udHJvbGxlci5oYW5kbGVEcmFnKGV4dGVuc2lvblRyZWVJdGVtcywgdHJlZURhdGFUcmFuc2ZlciwgdG9rZW4pO1xuXHRcdHJldHVybiB0cmVlRGF0YVRyYW5zZmVyO1xuXHR9XG5cblx0Z2V0IGhhc0hhbmRsZURyYWcoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5fZG5kQ29udHJvbGxlcj8uaGFuZGxlRHJhZztcblx0fVxuXG5cdGFzeW5jIG9uRHJvcCh0cmVlRGF0YVRyYW5zZmVyOiB2c2NvZGUuRGF0YVRyYW5zZmVyLCB0YXJnZXRIYW5kbGVPck5vZGU6IFRyZWVJdGVtSGFuZGxlIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0YXJnZXQgPSB0YXJnZXRIYW5kbGVPck5vZGUgPyB0aGlzLmdldEV4dGVuc2lvbkVsZW1lbnQodGFyZ2V0SGFuZGxlT3JOb2RlKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoKCF0YXJnZXQgJiYgdGFyZ2V0SGFuZGxlT3JOb2RlKSB8fCAhdGhpcy5fZG5kQ29udHJvbGxlcj8uaGFuZGxlRHJvcCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gYXNQcm9taXNlKCgpID0+IHRoaXMuX2RuZENvbnRyb2xsZXI/LmhhbmRsZURyb3Bcblx0XHRcdD8gdGhpcy5fZG5kQ29udHJvbGxlci5oYW5kbGVEcm9wKHRhcmdldCwgdHJlZURhdGFUcmFuc2ZlciwgdG9rZW4pXG5cdFx0XHQ6IHVuZGVmaW5lZCk7XG5cdH1cblxuXHRnZXQgaGFzUmVzb2x2ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLl9kYXRhUHJvdmlkZXIucmVzb2x2ZVRyZWVJdGVtO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZVRyZWVJdGVtKHRyZWVJdGVtSGFuZGxlOiBzdHJpbmcsIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUcmVlSXRlbSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5fZGF0YVByb3ZpZGVyLnJlc29sdmVUcmVlSXRlbSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy5fZWxlbWVudHMuZ2V0KHRyZWVJdGVtSGFuZGxlKTtcblx0XHRpZiAoZWxlbWVudCkge1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHRoaXMuX25vZGVzLmdldChlbGVtZW50KTtcblx0XHRcdGlmIChub2RlKSB7XG5cdFx0XHRcdGNvbnN0IHJlc29sdmUgPSBhd2FpdCB0aGlzLl9kYXRhUHJvdmlkZXIucmVzb2x2ZVRyZWVJdGVtKG5vZGUuZXh0ZW5zaW9uSXRlbSwgZWxlbWVudCwgdG9rZW4pID8/IG5vZGUuZXh0ZW5zaW9uSXRlbTtcblx0XHRcdFx0dGhpcy5fdmFsaWRhdGVUcmVlSXRlbShyZXNvbHZlKTtcblx0XHRcdFx0Ly8gUmVzb2x2YWJsZSBlbGVtZW50cy4gQ3VycmVudGx5IG9ubHkgdG9vbHRpcCBhbmQgY29tbWFuZC5cblx0XHRcdFx0bm9kZS5pdGVtLnRvb2x0aXAgPSB0aGlzLl9nZXRUb29sdGlwKHJlc29sdmUudG9vbHRpcCk7XG5cdFx0XHRcdG5vZGUuaXRlbS5jb21tYW5kID0gdGhpcy5fZ2V0Q29tbWFuZChub2RlLmRpc3Bvc2FibGVTdG9yZSwgcmVzb2x2ZS5jb21tYW5kKTtcblx0XHRcdFx0cmV0dXJuIG5vZGUuaXRlbTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZVVua25vd25QYXJlbnRDaGFpbihlbGVtZW50OiBUKTogUHJvbWlzZTxUcmVlTm9kZVtdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVQYXJlbnQoZWxlbWVudClcblx0XHRcdC50aGVuKChwYXJlbnQpID0+IHtcblx0XHRcdFx0aWYgKCFwYXJlbnQpIHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtdKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcmVzb2x2ZVVua25vd25QYXJlbnRDaGFpbihwYXJlbnQpXG5cdFx0XHRcdFx0LnRoZW4ocmVzdWx0ID0+IHRoaXMuX3Jlc29sdmVUcmVlTm9kZShwYXJlbnQsIHJlc3VsdFtyZXN1bHQubGVuZ3RoIC0gMV0pXG5cdFx0XHRcdFx0XHQudGhlbihwYXJlbnROb2RlID0+IHtcblx0XHRcdFx0XHRcdFx0cmVzdWx0LnB1c2gocGFyZW50Tm9kZSk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVQYXJlbnQoZWxlbWVudDogVCk6IFByb21pc2U8VCB8IFJvb3Q+IHtcblx0XHRjb25zdCBub2RlID0gdGhpcy5fbm9kZXMuZ2V0KGVsZW1lbnQpO1xuXHRcdGlmIChub2RlKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG5vZGUucGFyZW50ID8gdGhpcy5fZWxlbWVudHMuZ2V0KG5vZGUucGFyZW50Lml0ZW0uaGFuZGxlKSA6IHVuZGVmaW5lZCk7XG5cdFx0fVxuXHRcdHJldHVybiBhc1Byb21pc2UoKCkgPT4gdGhpcy5fZGF0YVByb3ZpZGVyLmdldFBhcmVudCEoZWxlbWVudCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVRyZWVOb2RlKGVsZW1lbnQ6IFQsIHBhcmVudD86IFRyZWVOb2RlKTogUHJvbWlzZTxUcmVlTm9kZT4ge1xuXHRcdGNvbnN0IG5vZGUgPSB0aGlzLl9ub2Rlcy5nZXQoZWxlbWVudCk7XG5cdFx0aWYgKG5vZGUpIHtcblx0XHRcdHJldHVybiBub2RlO1xuXHRcdH1cblx0XHRjb25zdCBleHRUcmVlSXRlbSA9IGF3YWl0IGFzUHJvbWlzZSgoKSA9PiB0aGlzLl9kYXRhUHJvdmlkZXIuZ2V0VHJlZUl0ZW0oZWxlbWVudCkpO1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2NyZWF0ZUhhbmRsZShlbGVtZW50LCBleHRUcmVlSXRlbSwgcGFyZW50LCB0cnVlKTtcblx0XHRhd2FpdCB0aGlzLmdldENoaWxkcmVuKHBhcmVudCA/IHBhcmVudC5pdGVtLmhhbmRsZSA6IHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgY2FjaGVkRWxlbWVudCA9IHRoaXMuZ2V0RXh0ZW5zaW9uRWxlbWVudChoYW5kbGUpO1xuXHRcdGlmIChjYWNoZWRFbGVtZW50KSB7XG5cdFx0XHRjb25zdCBub2RlID0gdGhpcy5fbm9kZXMuZ2V0KGNhY2hlZEVsZW1lbnQpO1xuXHRcdFx0aWYgKG5vZGUpIHtcblx0XHRcdFx0cmV0dXJuIG5vZGU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtUcmVlVmlldzoke3RoaXMuX3ZpZXdJZH1dIEZhaWxlZCB0byByZXNvbHZlIHRyZWUgbm9kZSBmb3IgZWxlbWVudCAke2hhbmRsZX1gKTtcblx0XHR0aGlzLl9wcm94eS4kbG9nUmVzb2x2ZVRyZWVOb2RlRmFpbHVyZSh0aGlzLl9leHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSk7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgcmVzb2x2ZSB0cmVlIGl0ZW0gZm9yIGVsZW1lbnQgJHtoYW5kbGV9IGZyb20gZXh0ZW5zaW9uICR7dGhpcy5fZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWV9YCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDaGlsZHJlbk5vZGVzKHBhcmVudE5vZGVPckhhbmRsZTogVHJlZU5vZGUgfCBUcmVlSXRlbUhhbmRsZSB8IFJvb3QpOiBUcmVlTm9kZVtdIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAocGFyZW50Tm9kZU9ySGFuZGxlKSB7XG5cdFx0XHRsZXQgcGFyZW50Tm9kZTogVHJlZU5vZGUgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAodHlwZW9mIHBhcmVudE5vZGVPckhhbmRsZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0Y29uc3QgcGFyZW50RWxlbWVudCA9IHRoaXMuZ2V0RXh0ZW5zaW9uRWxlbWVudChwYXJlbnROb2RlT3JIYW5kbGUpO1xuXHRcdFx0XHRwYXJlbnROb2RlID0gcGFyZW50RWxlbWVudCA/IHRoaXMuX25vZGVzLmdldChwYXJlbnRFbGVtZW50KSA6IHVuZGVmaW5lZDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHBhcmVudE5vZGUgPSBwYXJlbnROb2RlT3JIYW5kbGU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcGFyZW50Tm9kZSA/IHBhcmVudE5vZGUuY2hpbGRyZW4gfHwgdW5kZWZpbmVkIDogdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcm9vdHM7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRGZXRjaEtleShwYXJlbnRFbGVtZW50PzogVCk6IFQgfCB0eXBlb2YgRXh0SG9zdFRyZWVWaWV3LlJPT1RfRkVUQ0hfS0VZIHtcblx0XHRyZXR1cm4gcGFyZW50RWxlbWVudCA/PyBFeHRIb3N0VHJlZVZpZXcuUk9PVF9GRVRDSF9LRVk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9mZXRjaENoaWxkcmVuTm9kZXMocGFyZW50RWxlbWVudD86IFQpOiBQcm9taXNlPFRyZWVOb2RlW10gfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBjbGVhciBjaGlsZHJlbiBjYWNoZVxuXHRcdHRoaXMuX2FkZENoaWxkcmVuVG9DbGVhcihwYXJlbnRFbGVtZW50KTtcblx0XHRjb25zdCBmZXRjaEtleSA9IHRoaXMuX2dldEZldGNoS2V5KHBhcmVudEVsZW1lbnQpO1xuXHRcdGNvbnN0IHJlcXVlc3RJZCA9ICsrdGhpcy5fZ2xvYmFsRmV0Y2hUb2tlbkNvdW50ZXI7XG5cdFx0dGhpcy5fY2hpbGRyZW5GZXRjaFRva2Vucy5zZXQoZmV0Y2hLZXksIHJlcXVlc3RJZCk7XG5cblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UodGhpcy5fcmVmcmVzaENhbmNlbGxhdGlvblNvdXJjZS50b2tlbik7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZWxlbWVudHMgPSBhd2FpdCB0aGlzLl9kYXRhUHJvdmlkZXIuZ2V0Q2hpbGRyZW4ocGFyZW50RWxlbWVudCk7XG5cdFx0XHRpZiAodGhpcy5fY2hpbGRyZW5GZXRjaFRva2Vucy5nZXQoZmV0Y2hLZXkpICE9PSByZXF1ZXN0SWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBhcmVudE5vZGUgPSBwYXJlbnRFbGVtZW50ID8gdGhpcy5fbm9kZXMuZ2V0KHBhcmVudEVsZW1lbnQpIDogdW5kZWZpbmVkO1xuXG5cdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNvYWxlc2NlZEVsZW1lbnRzID0gY29hbGVzY2UoZWxlbWVudHMgfHwgW10pO1xuXHRcdFx0Y29uc3QgdHJlZUl0ZW1zID0gYXdhaXQgUHJvbWlzZS5hbGwoY29hbGVzY2UoY29hbGVzY2VkRWxlbWVudHMpLm1hcChlbGVtZW50ID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2RhdGFQcm92aWRlci5nZXRUcmVlSXRlbShlbGVtZW50KTtcblx0XHRcdH0pKTtcblx0XHRcdGlmICh0aGlzLl9jaGlsZHJlbkZldGNoVG9rZW5zLmdldChmZXRjaEtleSkgIT09IHJlcXVlc3RJZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBjcmVhdGVBbmRSZWdpc3RlclRyZWVOb2RlcyBhZGRzIHRoZSBub2RlcyB0byBhIGNhY2hlLiBUaGlzIG11c3QgYmUgZG9uZSBzeW5jIHNvIHRoYXQgdGhleSBnZXQgYWRkZWQgaW4gdGhlIGNvcnJlY3Qgb3JkZXIuXG5cdFx0XHRjb25zdCBpdGVtcyA9IHRyZWVJdGVtcy5tYXAoKGl0ZW0sIGluZGV4KSA9PiBpdGVtID8gdGhpcy5fY3JlYXRlQW5kUmVnaXN0ZXJUcmVlTm9kZShjb2FsZXNjZWRFbGVtZW50c1tpbmRleF0sIGl0ZW0sIHBhcmVudE5vZGUpIDogbnVsbCk7XG5cdFx0XHRpZiAodGhpcy5fY2hpbGRyZW5GZXRjaFRva2Vucy5nZXQoZmV0Y2hLZXkpICE9PSByZXF1ZXN0SWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGNvYWxlc2NlKGl0ZW1zKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y3RzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWZyZXNoQ2FuY2VsbGF0aW9uU291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cblx0cHJpdmF0ZSBfcmVmcmVzaChlbGVtZW50czogKFQgfCBSb290KVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaGFzUm9vdCA9IGVsZW1lbnRzLnNvbWUoZWxlbWVudCA9PiAhZWxlbWVudCk7XG5cdFx0aWYgKGhhc1Jvb3QpIHtcblx0XHRcdC8vIENhbmNlbCBhbnkgcGVuZGluZyBjaGlsZHJlbiBmZXRjaGVzXG5cdFx0XHR0aGlzLl9yZWZyZXNoQ2FuY2VsbGF0aW9uU291cmNlLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0XHR0aGlzLl9yZWZyZXNoQ2FuY2VsbGF0aW9uU291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cblx0XHRcdHRoaXMuX2FkZENoaWxkcmVuVG9DbGVhcigpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRyZWZyZXNoKHRoaXMuX3ZpZXdJZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGhhbmRsZXNUb1JlZnJlc2ggPSB0aGlzLl9nZXRIYW5kbGVzVG9SZWZyZXNoKDxUW10+ZWxlbWVudHMpO1xuXHRcdFx0aWYgKGhhbmRsZXNUb1JlZnJlc2gubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZWZyZXNoSGFuZGxlcyhoYW5kbGVzVG9SZWZyZXNoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0SGFuZGxlc1RvUmVmcmVzaChlbGVtZW50czogVFtdKTogVHJlZUl0ZW1IYW5kbGVbXSB7XG5cdFx0Y29uc3QgZWxlbWVudHNUb1VwZGF0ZSA9IG5ldyBTZXQ8VHJlZUl0ZW1IYW5kbGU+KCk7XG5cdFx0Y29uc3QgZWxlbWVudE5vZGVzID0gZWxlbWVudHMubWFwKGVsZW1lbnQgPT4gdGhpcy5fbm9kZXMuZ2V0KGVsZW1lbnQpKTtcblx0XHRmb3IgKGNvbnN0IGVsZW1lbnROb2RlIG9mIGVsZW1lbnROb2Rlcykge1xuXHRcdFx0aWYgKGVsZW1lbnROb2RlICYmICFlbGVtZW50c1RvVXBkYXRlLmhhcyhlbGVtZW50Tm9kZS5pdGVtLmhhbmRsZSkpIHtcblx0XHRcdFx0Ly8gY2hlY2sgaWYgYW4gYW5jZXN0b3Igb2YgZXh0RWxlbWVudCBpcyBhbHJlYWR5IGluIHRoZSBlbGVtZW50cyBsaXN0XG5cdFx0XHRcdGxldCBjdXJyZW50Tm9kZTogVHJlZU5vZGUgfCB1bmRlZmluZWQgPSBlbGVtZW50Tm9kZTtcblx0XHRcdFx0d2hpbGUgKGN1cnJlbnROb2RlICYmIGN1cnJlbnROb2RlLnBhcmVudCAmJiBlbGVtZW50Tm9kZXMuZmluZEluZGV4KG5vZGUgPT4gY3VycmVudE5vZGUgJiYgY3VycmVudE5vZGUucGFyZW50ICYmIG5vZGUgJiYgbm9kZS5pdGVtLmhhbmRsZSA9PT0gY3VycmVudE5vZGUucGFyZW50Lml0ZW0uaGFuZGxlKSA9PT0gLTEpIHtcblx0XHRcdFx0XHRjb25zdCBwYXJlbnRFbGVtZW50OiBUIHwgdW5kZWZpbmVkID0gdGhpcy5fZWxlbWVudHMuZ2V0KGN1cnJlbnROb2RlLnBhcmVudC5pdGVtLmhhbmRsZSk7XG5cdFx0XHRcdFx0Y3VycmVudE5vZGUgPSBwYXJlbnRFbGVtZW50ID8gdGhpcy5fbm9kZXMuZ2V0KHBhcmVudEVsZW1lbnQpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjdXJyZW50Tm9kZSAmJiAhY3VycmVudE5vZGUucGFyZW50KSB7XG5cdFx0XHRcdFx0ZWxlbWVudHNUb1VwZGF0ZS5hZGQoZWxlbWVudE5vZGUuaXRlbS5oYW5kbGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFuZGxlc1RvVXBkYXRlOiBUcmVlSXRlbUhhbmRsZVtdID0gW107XG5cdFx0Ly8gVGFrZSBvbmx5IHRvcCBsZXZlbCBlbGVtZW50c1xuXHRcdGVsZW1lbnRzVG9VcGRhdGUuZm9yRWFjaCgoaGFuZGxlKSA9PiB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy5fZWxlbWVudHMuZ2V0KGhhbmRsZSk7XG5cdFx0XHRpZiAoZWxlbWVudCkge1xuXHRcdFx0XHRjb25zdCBub2RlID0gdGhpcy5fbm9kZXMuZ2V0KGVsZW1lbnQpO1xuXHRcdFx0XHRpZiAobm9kZSAmJiAoIW5vZGUucGFyZW50IHx8ICFlbGVtZW50c1RvVXBkYXRlLmhhcyhub2RlLnBhcmVudC5pdGVtLmhhbmRsZSkpKSB7XG5cdFx0XHRcdFx0aGFuZGxlc1RvVXBkYXRlLnB1c2goaGFuZGxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGhhbmRsZXNUb1VwZGF0ZTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZnJlc2hIYW5kbGVzKGl0ZW1IYW5kbGVzOiBUcmVlSXRlbUhhbmRsZVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaXRlbXNUb1JlZnJlc2g6IHsgW3RyZWVJdGVtSGFuZGxlOiBzdHJpbmddOiBJVHJlZUl0ZW0gfSA9IHt9O1xuXHRcdHJldHVybiBQcm9taXNlLmFsbChpdGVtSGFuZGxlcy5tYXAodHJlZUl0ZW1IYW5kbGUgPT5cblx0XHRcdHRoaXMuX3JlZnJlc2hOb2RlKHRyZWVJdGVtSGFuZGxlKVxuXHRcdFx0XHQudGhlbihub2RlID0+IHtcblx0XHRcdFx0XHRpZiAobm9kZSkge1xuXHRcdFx0XHRcdFx0aXRlbXNUb1JlZnJlc2hbdHJlZUl0ZW1IYW5kbGVdID0gbm9kZS5pdGVtO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpKVxuXHRcdFx0LnRoZW4oKCkgPT4gT2JqZWN0LmtleXMoaXRlbXNUb1JlZnJlc2gpLmxlbmd0aCA/IHRoaXMuX3Byb3h5LiRyZWZyZXNoKHRoaXMuX3ZpZXdJZCwgaXRlbXNUb1JlZnJlc2gpIDogdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZnJlc2hOb2RlKHRyZWVJdGVtSGFuZGxlOiBUcmVlSXRlbUhhbmRsZSk6IFByb21pc2U8VHJlZU5vZGUgfCBudWxsPiB7XG5cdFx0Y29uc3QgZXh0RWxlbWVudCA9IHRoaXMuZ2V0RXh0ZW5zaW9uRWxlbWVudCh0cmVlSXRlbUhhbmRsZSk7XG5cdFx0aWYgKGV4dEVsZW1lbnQpIHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fbm9kZXMuZ2V0KGV4dEVsZW1lbnQpO1xuXHRcdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdHRoaXMuX2FkZENoaWxkcmVuVG9DbGVhcihleHRFbGVtZW50KTsgLy8gY2xlYXIgY2hpbGRyZW4gY2FjaGVcblx0XHRcdFx0cmV0dXJuIGFzUHJvbWlzZSgoKSA9PiB0aGlzLl9kYXRhUHJvdmlkZXIuZ2V0VHJlZUl0ZW0oZXh0RWxlbWVudCkpXG5cdFx0XHRcdFx0LnRoZW4oZXh0VHJlZUl0ZW0gPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGV4dFRyZWVJdGVtKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG5ld05vZGUgPSB0aGlzLl9jcmVhdGVUcmVlTm9kZShleHRFbGVtZW50LCBleHRUcmVlSXRlbSwgZXhpc3RpbmcucGFyZW50KTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fdXBkYXRlTm9kZUNhY2hlKGV4dEVsZW1lbnQsIG5ld05vZGUsIGV4aXN0aW5nLCBleGlzdGluZy5wYXJlbnQpO1xuXHRcdFx0XHRcdFx0XHRleGlzdGluZy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBuZXdOb2RlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVBbmRSZWdpc3RlclRyZWVOb2RlKGVsZW1lbnQ6IFQsIGV4dFRyZWVJdGVtOiB2c2NvZGUuVHJlZUl0ZW0sIHBhcmVudE5vZGU6IFRyZWVOb2RlIHwgUm9vdCk6IFRyZWVOb2RlIHtcblx0XHRjb25zdCBkdXBsaWNhdGVIYW5kbGUgPSBleHRUcmVlSXRlbS5pZCA/IGAke0V4dEhvc3RUcmVlVmlldy5JRF9IQU5ETEVfUFJFRklYfS8ke2V4dFRyZWVJdGVtLmlkfWAgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGR1cGxpY2F0ZUhhbmRsZSkge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmdFbGVtZW50ID0gdGhpcy5fZWxlbWVudHMuZ2V0KGR1cGxpY2F0ZUhhbmRsZSk7XG5cdFx0XHRpZiAoZXhpc3RpbmdFbGVtZW50KSB7XG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nTm9kZSA9IHRoaXMuX25vZGVzLmdldChleGlzdGluZ0VsZW1lbnQpO1xuXHRcdFx0XHRpZiAoZXhpc3RpbmdFbGVtZW50ICE9PSBlbGVtZW50KSB7XG5cdFx0XHRcdFx0Ly8gQSBkaWZmZXJlbnQgZWxlbWVudCBvYmplY3Qgd2FzIHJlZ2lzdGVyZWQgd2l0aCB0aGUgc2FtZSBJRC5cblx0XHRcdFx0XHQvLyBUaGlzIGNhbiBoYXBwZW4gZHVyaW5nIGNvbmN1cnJlbnQgdHJlZSBvcGVyYXRpb25zIChlLmcuLCB0cmVlXG5cdFx0XHRcdFx0Ly8gYmVpbmcgc3dpdGNoZWQgdG8gd2hpbGUgZGF0YSBpcyB1cGRhdGVkKS4gQ2xlYW4gdXAgdGhlIHN0YWxlXG5cdFx0XHRcdFx0Ly8gZWxlbWVudCByZWZlcmVuY2UgYmVmb3JlIHJlLXJlZ2lzdGVyaW5nIHdpdGggdGhlIG5ldyBvbmUuXG5cdFx0XHRcdFx0dGhpcy5fbm9kZXMuZGVsZXRlKGV4aXN0aW5nRWxlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGV4aXN0aW5nTm9kZSkge1xuXHRcdFx0XHRcdGNvbnN0IG5ld05vZGUgPSB0aGlzLl9jcmVhdGVUcmVlTm9kZShlbGVtZW50LCBleHRUcmVlSXRlbSwgcGFyZW50Tm9kZSk7XG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlTm9kZUNhY2hlKGVsZW1lbnQsIG5ld05vZGUsIGV4aXN0aW5nTm9kZSwgcGFyZW50Tm9kZSk7XG5cdFx0XHRcdFx0ZXhpc3RpbmdOb2RlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXR1cm4gbmV3Tm9kZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBub2RlID0gdGhpcy5fY3JlYXRlVHJlZU5vZGUoZWxlbWVudCwgZXh0VHJlZUl0ZW0sIHBhcmVudE5vZGUpO1xuXHRcdHRoaXMuX2FkZE5vZGVUb0NhY2hlKGVsZW1lbnQsIG5vZGUpO1xuXHRcdHRoaXMuX2FkZE5vZGVUb1BhcmVudENhY2hlKG5vZGUsIHBhcmVudE5vZGUpO1xuXHRcdHJldHVybiBub2RlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VG9vbHRpcCh0b29sdGlwPzogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nKTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoZXh0SG9zdFR5cGVzLk1hcmtkb3duU3RyaW5nLmlzTWFya2Rvd25TdHJpbmcodG9vbHRpcCkpIHtcblx0XHRcdHJldHVybiBNYXJrZG93blN0cmluZy5mcm9tKHRvb2x0aXApO1xuXHRcdH1cblx0XHRyZXR1cm4gdG9vbHRpcDtcblx0fVxuXG5cdHByaXZhdGUgX2dldENvbW1hbmQoZGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlLCBjb21tYW5kPzogdnNjb2RlLkNvbW1hbmQpOiBUcmVlQ29tbWFuZCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGNvbW1hbmQgPyB7IC4uLnRoaXMuX2NvbW1hbmRzLnRvSW50ZXJuYWwoY29tbWFuZCwgZGlzcG9zYWJsZSksIG9yaWdpbmFsSWQ6IGNvbW1hbmQuY29tbWFuZCB9IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Q2hlY2tib3goZXh0ZW5zaW9uVHJlZUl0ZW06IHZzY29kZS5UcmVlSXRlbSk6IElUcmVlSXRlbUNoZWNrYm94U3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdGlmIChleHRlbnNpb25UcmVlSXRlbS5jaGVja2JveFN0YXRlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGxldCBjaGVja2JveFN0YXRlOiBleHRIb3N0VHlwZXMuVHJlZUl0ZW1DaGVja2JveFN0YXRlO1xuXHRcdGxldCB0b29sdGlwOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IGFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbjogSUFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAodHlwZW9mIGV4dGVuc2lvblRyZWVJdGVtLmNoZWNrYm94U3RhdGUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRjaGVja2JveFN0YXRlID0gZXh0ZW5zaW9uVHJlZUl0ZW0uY2hlY2tib3hTdGF0ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y2hlY2tib3hTdGF0ZSA9IGV4dGVuc2lvblRyZWVJdGVtLmNoZWNrYm94U3RhdGUuc3RhdGU7XG5cdFx0XHR0b29sdGlwID0gZXh0ZW5zaW9uVHJlZUl0ZW0uY2hlY2tib3hTdGF0ZS50b29sdGlwO1xuXHRcdFx0YWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uID0gZXh0ZW5zaW9uVHJlZUl0ZW0uY2hlY2tib3hTdGF0ZS5hY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb247XG5cdFx0fVxuXHRcdHJldHVybiB7IGlzQ2hlY2tlZDogY2hlY2tib3hTdGF0ZSA9PT0gZXh0SG9zdFR5cGVzLlRyZWVJdGVtQ2hlY2tib3hTdGF0ZS5DaGVja2VkLCB0b29sdGlwLCBhY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb24gfTtcblx0fVxuXG5cdHByaXZhdGUgX3ZhbGlkYXRlVHJlZUl0ZW0oZXh0ZW5zaW9uVHJlZUl0ZW06IHZzY29kZS5UcmVlSXRlbSkge1xuXHRcdGlmICghZXh0SG9zdFR5cGVzLlRyZWVJdGVtLmlzVHJlZUl0ZW0oZXh0ZW5zaW9uVHJlZUl0ZW0sIHRoaXMuX2V4dGVuc2lvbikpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgRXh0ZW5zaW9uICR7dGhpcy5fZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWV9IGhhcyBwcm92aWRlZCBhbiBpbnZhbGlkIHRyZWUgaXRlbS5gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVUcmVlTm9kZShlbGVtZW50OiBULCBleHRlbnNpb25UcmVlSXRlbTogdnNjb2RlLlRyZWVJdGVtLCBwYXJlbnQ6IFRyZWVOb2RlIHwgUm9vdCk6IFRyZWVOb2RlIHtcblx0XHR0aGlzLl92YWxpZGF0ZVRyZWVJdGVtKGV4dGVuc2lvblRyZWVJdGVtKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2NyZWF0ZUhhbmRsZShlbGVtZW50LCBleHRlbnNpb25UcmVlSXRlbSwgcGFyZW50KTtcblx0XHRjb25zdCBpY29uID0gdGhpcy5fZ2V0TGlnaHRJY29uUGF0aChleHRlbnNpb25UcmVlSXRlbSk7XG5cdFx0Y29uc3QgaXRlbTogSVRyZWVJdGVtID0ge1xuXHRcdFx0aGFuZGxlLFxuXHRcdFx0cGFyZW50SGFuZGxlOiBwYXJlbnQgPyBwYXJlbnQuaXRlbS5oYW5kbGUgOiB1bmRlZmluZWQsXG5cdFx0XHRsYWJlbDogdG9UcmVlSXRlbUxhYmVsKGV4dGVuc2lvblRyZWVJdGVtLmxhYmVsLCB0aGlzLl9leHRlbnNpb24pLFxuXHRcdFx0ZGVzY3JpcHRpb246IGV4dGVuc2lvblRyZWVJdGVtLmRlc2NyaXB0aW9uLFxuXHRcdFx0cmVzb3VyY2VVcmk6IGV4dGVuc2lvblRyZWVJdGVtLnJlc291cmNlVXJpLFxuXHRcdFx0dG9vbHRpcDogdGhpcy5fZ2V0VG9vbHRpcChleHRlbnNpb25UcmVlSXRlbS50b29sdGlwKSxcblx0XHRcdGNvbW1hbmQ6IHRoaXMuX2dldENvbW1hbmQoZGlzcG9zYWJsZVN0b3JlLCBleHRlbnNpb25UcmVlSXRlbS5jb21tYW5kKSxcblx0XHRcdGNvbnRleHRWYWx1ZTogZXh0ZW5zaW9uVHJlZUl0ZW0uY29udGV4dFZhbHVlLFxuXHRcdFx0aWNvbixcblx0XHRcdGljb25EYXJrOiB0aGlzLl9nZXREYXJrSWNvblBhdGgoZXh0ZW5zaW9uVHJlZUl0ZW0pIHx8IGljb24sXG5cdFx0XHR0aGVtZUljb246IHRoaXMuX2dldFRoZW1lSWNvbihleHRlbnNpb25UcmVlSXRlbSksXG5cdFx0XHRjb2xsYXBzaWJsZVN0YXRlOiBpc1VuZGVmaW5lZE9yTnVsbChleHRlbnNpb25UcmVlSXRlbS5jb2xsYXBzaWJsZVN0YXRlKSA/IGV4dEhvc3RUeXBlcy5UcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuTm9uZSA6IGV4dGVuc2lvblRyZWVJdGVtLmNvbGxhcHNpYmxlU3RhdGUsXG5cdFx0XHRhY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb246IGV4dGVuc2lvblRyZWVJdGVtLmFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbixcblx0XHRcdGNoZWNrYm94OiB0aGlzLl9nZXRDaGVja2JveChleHRlbnNpb25UcmVlSXRlbSksXG5cdFx0fTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRpdGVtLFxuXHRcdFx0ZXh0ZW5zaW9uSXRlbTogZXh0ZW5zaW9uVHJlZUl0ZW0sXG5cdFx0XHRwYXJlbnQsXG5cdFx0XHRjaGlsZHJlbjogdW5kZWZpbmVkLFxuXHRcdFx0ZGlzcG9zYWJsZVN0b3JlLFxuXHRcdFx0ZGlzcG9zZSgpOiB2b2lkIHsgZGlzcG9zYWJsZVN0b3JlLmRpc3Bvc2UoKTsgfVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUaGVtZUljb24oZXh0ZW5zaW9uVHJlZUl0ZW06IHZzY29kZS5UcmVlSXRlbSk6IGV4dEhvc3RUeXBlcy5UaGVtZUljb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBleHRlbnNpb25UcmVlSXRlbS5pY29uUGF0aCBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5UaGVtZUljb24gPyBleHRlbnNpb25UcmVlSXRlbS5pY29uUGF0aCA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUhhbmRsZShlbGVtZW50OiBULCB7IGlkLCBsYWJlbCwgcmVzb3VyY2VVcmkgfTogdnNjb2RlLlRyZWVJdGVtLCBwYXJlbnQ6IFRyZWVOb2RlIHwgUm9vdCwgcmV0dXJuRmlyc3Q/OiBib29sZWFuKTogVHJlZUl0ZW1IYW5kbGUge1xuXHRcdGlmIChpZCkge1xuXHRcdFx0cmV0dXJuIGAke0V4dEhvc3RUcmVlVmlldy5JRF9IQU5ETEVfUFJFRklYfS8ke2lkfWA7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdHJlZUl0ZW1MYWJlbCA9IHRvVHJlZUl0ZW1MYWJlbChsYWJlbCwgdGhpcy5fZXh0ZW5zaW9uKTtcblx0XHRjb25zdCBwcmVmaXg6IHN0cmluZyA9IHBhcmVudCA/IHBhcmVudC5pdGVtLmhhbmRsZSA6IEV4dEhvc3RUcmVlVmlldy5MQUJFTF9IQU5ETEVfUFJFRklYO1xuXHRcdGxldCBsYWJlbFZhbHVlID0gJyc7XG5cdFx0aWYgKHRyZWVJdGVtTGFiZWwpIHtcblx0XHRcdGlmIChpc01hcmtkb3duU3RyaW5nKHRyZWVJdGVtTGFiZWwubGFiZWwpKSB7XG5cdFx0XHRcdGxhYmVsVmFsdWUgPSB0cmVlSXRlbUxhYmVsLmxhYmVsLnZhbHVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGFiZWxWYWx1ZSA9IHRyZWVJdGVtTGFiZWwubGFiZWw7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGxldCBlbGVtZW50SWQgPSBsYWJlbFZhbHVlIHx8IChyZXNvdXJjZVVyaSA/IGJhc2VuYW1lKHJlc291cmNlVXJpKSA6ICcnKTtcblx0XHRlbGVtZW50SWQgPSBlbGVtZW50SWQuaW5kZXhPZignLycpICE9PSAtMSA/IGVsZW1lbnRJZC5yZXBsYWNlKCcvJywgJy8vJykgOiBlbGVtZW50SWQ7XG5cdFx0Y29uc3QgZXhpc3RpbmdIYW5kbGUgPSB0aGlzLl9ub2Rlcy5oYXMoZWxlbWVudCkgPyB0aGlzLl9ub2Rlcy5nZXQoZWxlbWVudCkhLml0ZW0uaGFuZGxlIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNoaWxkcmVuTm9kZXMgPSAodGhpcy5fZ2V0Q2hpbGRyZW5Ob2RlcyhwYXJlbnQpIHx8IFtdKTtcblxuXHRcdGxldCBoYW5kbGU6IFRyZWVJdGVtSGFuZGxlO1xuXHRcdGxldCBjb3VudGVyID0gMDtcblx0XHRkbyB7XG5cdFx0XHRoYW5kbGUgPSBgJHtwcmVmaXh9LyR7Y291bnRlcn06JHtlbGVtZW50SWR9YDtcblx0XHRcdGlmIChyZXR1cm5GaXJzdCB8fCAhdGhpcy5fZWxlbWVudHMuaGFzKGhhbmRsZSkgfHwgZXhpc3RpbmdIYW5kbGUgPT09IGhhbmRsZSkge1xuXHRcdFx0XHQvLyBSZXR1cm4gZmlyc3QgaWYgYXNrZWQgZm9yIG9yXG5cdFx0XHRcdC8vIFJldHVybiBpZiBoYW5kbGUgZG9lcyBub3QgZXhpc3Qgb3Jcblx0XHRcdFx0Ly8gUmV0dXJuIGlmIGhhbmRsZSBpcyBiZWluZyByZXVzZWRcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjb3VudGVyKys7XG5cdFx0fSB3aGlsZSAoY291bnRlciA8PSBjaGlsZHJlbk5vZGVzLmxlbmd0aCk7XG5cblx0XHRyZXR1cm4gaGFuZGxlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0TGlnaHRJY29uUGF0aChleHRlbnNpb25UcmVlSXRlbTogdnNjb2RlLlRyZWVJdGVtKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoZXh0ZW5zaW9uVHJlZUl0ZW0uaWNvblBhdGggJiYgIShleHRlbnNpb25UcmVlSXRlbS5pY29uUGF0aCBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5UaGVtZUljb24pKSB7XG5cdFx0XHRpZiAodHlwZW9mIGV4dGVuc2lvblRyZWVJdGVtLmljb25QYXRoID09PSAnc3RyaW5nJ1xuXHRcdFx0XHR8fCBVUkkuaXNVcmkoZXh0ZW5zaW9uVHJlZUl0ZW0uaWNvblBhdGgpKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9nZXRJY29uUGF0aChleHRlbnNpb25UcmVlSXRlbS5pY29uUGF0aCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5fZ2V0SWNvblBhdGgoKDx7IGxpZ2h0OiBzdHJpbmcgfCBVUkk7IGRhcms6IHN0cmluZyB8IFVSSSB9PmV4dGVuc2lvblRyZWVJdGVtLmljb25QYXRoKS5saWdodCk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXREYXJrSWNvblBhdGgoZXh0ZW5zaW9uVHJlZUl0ZW06IHZzY29kZS5UcmVlSXRlbSk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGV4dGVuc2lvblRyZWVJdGVtLmljb25QYXRoICYmICEoZXh0ZW5zaW9uVHJlZUl0ZW0uaWNvblBhdGggaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuVGhlbWVJY29uKSAmJiAoPHsgbGlnaHQ6IHN0cmluZyB8IFVSSTsgZGFyazogc3RyaW5nIHwgVVJJIH0+ZXh0ZW5zaW9uVHJlZUl0ZW0uaWNvblBhdGgpLmRhcmspIHtcblx0XHRcdHJldHVybiB0aGlzLl9nZXRJY29uUGF0aCgoPHsgbGlnaHQ6IHN0cmluZyB8IFVSSTsgZGFyazogc3RyaW5nIHwgVVJJIH0+ZXh0ZW5zaW9uVHJlZUl0ZW0uaWNvblBhdGgpLmRhcmspO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0SWNvblBhdGgoaWNvblBhdGg6IHN0cmluZyB8IFVSSSk6IFVSSSB7XG5cdFx0aWYgKFVSSS5pc1VyaShpY29uUGF0aCkpIHtcblx0XHRcdHJldHVybiBpY29uUGF0aDtcblx0XHR9XG5cdFx0cmV0dXJuIFVSSS5maWxlKGljb25QYXRoKTtcblx0fVxuXG5cdHByaXZhdGUgX2FkZE5vZGVUb0NhY2hlKGVsZW1lbnQ6IFQsIG5vZGU6IFRyZWVOb2RlKTogdm9pZCB7XG5cdFx0dGhpcy5fZWxlbWVudHMuc2V0KG5vZGUuaXRlbS5oYW5kbGUsIGVsZW1lbnQpO1xuXHRcdHRoaXMuX25vZGVzLnNldChlbGVtZW50LCBub2RlKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZU5vZGVDYWNoZShlbGVtZW50OiBULCBuZXdOb2RlOiBUcmVlTm9kZSwgZXhpc3Rpbmc6IFRyZWVOb2RlLCBwYXJlbnROb2RlOiBUcmVlTm9kZSB8IFJvb3QpOiB2b2lkIHtcblx0XHQvLyBSZW1vdmUgZnJvbSB0aGUgY2FjaGVcblx0XHR0aGlzLl9lbGVtZW50cy5kZWxldGUobmV3Tm9kZS5pdGVtLmhhbmRsZSk7XG5cdFx0dGhpcy5fbm9kZXMuZGVsZXRlKGVsZW1lbnQpO1xuXHRcdGlmIChuZXdOb2RlLml0ZW0uaGFuZGxlICE9PSBleGlzdGluZy5pdGVtLmhhbmRsZSkge1xuXHRcdFx0dGhpcy5fZWxlbWVudHMuZGVsZXRlKGV4aXN0aW5nLml0ZW0uaGFuZGxlKTtcblx0XHR9XG5cblx0XHQvLyBBZGQgdGhlIG5ldyBub2RlIHRvIHRoZSBjYWNoZVxuXHRcdHRoaXMuX2FkZE5vZGVUb0NhY2hlKGVsZW1lbnQsIG5ld05vZGUpO1xuXG5cdFx0Ly8gUmVwbGFjZSB0aGUgbm9kZSBpbiBwYXJlbnQncyBjaGlsZHJlbiBub2Rlc1xuXHRcdGNvbnN0IGNoaWxkcmVuTm9kZXMgPSAodGhpcy5fZ2V0Q2hpbGRyZW5Ob2RlcyhwYXJlbnROb2RlKSB8fCBbXSk7XG5cdFx0Y29uc3QgY2hpbGROb2RlID0gY2hpbGRyZW5Ob2Rlcy5maWx0ZXIoYyA9PiBjLml0ZW0uaGFuZGxlID09PSBleGlzdGluZy5pdGVtLmhhbmRsZSlbMF07XG5cdFx0aWYgKGNoaWxkTm9kZSkge1xuXHRcdFx0Y2hpbGRyZW5Ob2Rlcy5zcGxpY2UoY2hpbGRyZW5Ob2Rlcy5pbmRleE9mKGNoaWxkTm9kZSksIDEsIG5ld05vZGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FkZE5vZGVUb1BhcmVudENhY2hlKG5vZGU6IFRyZWVOb2RlLCBwYXJlbnROb2RlOiBUcmVlTm9kZSB8IFJvb3QpOiB2b2lkIHtcblx0XHRpZiAocGFyZW50Tm9kZSkge1xuXHRcdFx0aWYgKCFwYXJlbnROb2RlLmNoaWxkcmVuKSB7XG5cdFx0XHRcdHBhcmVudE5vZGUuY2hpbGRyZW4gPSBbXTtcblx0XHRcdH1cblx0XHRcdHBhcmVudE5vZGUuY2hpbGRyZW4ucHVzaChub2RlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKCF0aGlzLl9yb290cykge1xuXHRcdFx0XHR0aGlzLl9yb290cyA9IFtdO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcm9vdHMucHVzaChub2RlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hZGRDaGlsZHJlblRvQ2xlYXIocGFyZW50RWxlbWVudD86IFQpOiB2b2lkIHtcblx0XHRpZiAocGFyZW50RWxlbWVudCkge1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHRoaXMuX25vZGVzLmdldChwYXJlbnRFbGVtZW50KTtcblx0XHRcdGlmIChub2RlKSB7XG5cdFx0XHRcdGlmIChub2RlLmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9ub2Rlc1RvQ2xlYXIuYWRkKGNoaWxkKTtcblx0XHRcdFx0XHRcdGNvbnN0IGNoaWxkRWxlbWVudCA9IHRoaXMuX2VsZW1lbnRzLmdldChjaGlsZC5pdGVtLmhhbmRsZSk7XG5cdFx0XHRcdFx0XHRpZiAoY2hpbGRFbGVtZW50KSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2FkZENoaWxkcmVuVG9DbGVhcihjaGlsZEVsZW1lbnQpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9ub2Rlcy5kZWxldGUoY2hpbGRFbGVtZW50KTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fZWxlbWVudHMuZGVsZXRlKGNoaWxkLml0ZW0uaGFuZGxlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0bm9kZS5jaGlsZHJlbiA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fYWRkQWxsVG9DbGVhcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FkZEFsbFRvQ2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fcm9vdHMgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fbm9kZXMuZm9yRWFjaChub2RlID0+IHtcblx0XHRcdHRoaXMuX25vZGVzVG9DbGVhci5hZGQobm9kZSk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fbm9kZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9lbGVtZW50cy5jbGVhcigpO1xuXHRcdHRoaXMuX2NoaWxkcmVuRmV0Y2hUb2tlbnMuY2xlYXIoKTtcblx0fVxuXG5cdHByaXZhdGUgX2NsZWFyTm9kZXMobm9kZXM6IFRyZWVOb2RlW10pOiB2b2lkIHtcblx0XHRkaXNwb3NlKG5vZGVzKTtcblx0fVxuXG5cdHByaXZhdGUgX2NsZWFyQWxsKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Jvb3RzID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2VsZW1lbnRzLmNsZWFyKCk7XG5cdFx0ZGlzcG9zZSh0aGlzLl9ub2Rlcy52YWx1ZXMoKSk7XG5cdFx0dGhpcy5fbm9kZXMuY2xlYXIoKTtcblx0XHRkaXNwb3NlKHRoaXMuX25vZGVzVG9DbGVhcik7XG5cdFx0dGhpcy5fbm9kZXNUb0NsZWFyLmNsZWFyKCk7XG5cdFx0dGhpcy5fY2hpbGRyZW5GZXRjaFRva2Vucy5jbGVhcigpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fcmVmcmVzaENhbmNlbGxhdGlvblNvdXJjZS5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLl9jbGVhckFsbCgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZLGlCQUFpQixlQUE0QjtBQUVsRSxTQUF1SSx1QkFBdUI7QUFFOUosU0FBUyxpQkFBaUI7QUFDMUIsWUFBWSxrQkFBa0I7QUFDOUIsU0FBUyxtQkFBbUIsZ0JBQWdCO0FBQzVDLFNBQVMsUUFBUSxVQUFVLGdCQUFnQjtBQUMzQyxTQUFzQixnQkFBZ0I7QUFFdEMsU0FBUyxnQkFBZ0IsV0FBVyxvQkFBb0I7QUFDeEQsU0FBMEIsd0JBQXdCO0FBQ2xELFNBQTRCLCtCQUErQjtBQUMzRCxTQUErQiwyQkFBMkI7QUFFMUQsU0FBUywrQkFBK0I7QUFJeEMsU0FBUyxnQkFBZ0IsT0FBWSxXQUE4RDtBQUNsRyxNQUFJLFNBQVMsS0FBSyxHQUFHO0FBQ3BCLFdBQU8sRUFBRSxNQUFNO0FBQUEsRUFDaEI7QUFFQSxNQUFJLFNBQVMsT0FBTyxVQUFVLFlBQVksTUFBTSxPQUFPO0FBQ3RELFFBQUksYUFBNkM7QUFDakQsUUFBSSxNQUFNLFFBQVEsTUFBTSxVQUFVLEdBQUc7QUFDcEMsbUJBQWtDLE1BQU0sV0FBWSxRQUFRLGVBQWEsVUFBVSxXQUFXLEtBQUssT0FBTyxVQUFVLENBQUMsTUFBTSxZQUFZLE9BQU8sVUFBVSxDQUFDLE1BQU0sU0FBUztBQUN4SyxtQkFBYSxXQUFXLFNBQVMsYUFBYTtBQUFBLElBQy9DO0FBQ0EsUUFBSSxTQUFTLE1BQU0sS0FBSyxHQUFHO0FBQzFCLGFBQU8sRUFBRSxPQUFPLE1BQU0sT0FBTyxXQUFXO0FBQUEsSUFDekMsV0FBVyxhQUFhLGVBQWUsaUJBQWlCLE1BQU0sS0FBSyxHQUFHO0FBQ3JFLDhCQUF3QixXQUFXLHVCQUF1QjtBQUMxRCxhQUFPLEVBQUUsT0FBTyxlQUFlLEtBQUssTUFBTSxLQUFLLEdBQUcsV0FBVztB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
