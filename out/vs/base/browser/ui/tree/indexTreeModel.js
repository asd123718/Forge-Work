import { TreeError, TreeVisibility } from "./tree.js";
import { splice, tail } from "../../../common/arrays.js";
import { Delayer } from "../../../common/async.js";
import { MicrotaskDelay } from "../../../common/symbols.js";
import { LcsDiff } from "../../../common/diff/diff.js";
import { Emitter, EventBufferer } from "../../../common/event.js";
import { Iterable } from "../../../common/iterator.js";
function isFilterResult(obj) {
  return !!obj && obj.visibility !== void 0;
}
function getVisibleState(visibility) {
  switch (visibility) {
    case true:
      return TreeVisibility.Visible;
    case false:
      return TreeVisibility.Hidden;
    default:
      return visibility;
  }
}
function isCollapsibleStateUpdate(update) {
  return "collapsible" in update;
}
class IndexTreeModel {
  constructor(user, rootElement, options = {}) {
    this.user = user;
    this.rootRef = [];
    this.eventBufferer = new EventBufferer();
    this._onDidSpliceModel = new Emitter();
    this.onDidSpliceModel = this._onDidSpliceModel.event;
    this._onDidSpliceRenderedNodes = new Emitter();
    this.onDidSpliceRenderedNodes = this._onDidSpliceRenderedNodes.event;
    this._onDidChangeCollapseState = new Emitter();
    this.onDidChangeCollapseState = this.eventBufferer.wrapEvent(this._onDidChangeCollapseState.event);
    this._onDidChangeRenderNodeCount = new Emitter();
    this.onDidChangeRenderNodeCount = this.eventBufferer.wrapEvent(this._onDidChangeRenderNodeCount.event);
    this.refilterDelayer = new Delayer(MicrotaskDelay);
    this.collapseByDefault = typeof options.collapseByDefault === "undefined" ? false : options.collapseByDefault;
    this.allowNonCollapsibleParents = options.allowNonCollapsibleParents ?? false;
    this.filter = options.filter;
    this.autoExpandSingleChildren = typeof options.autoExpandSingleChildren === "undefined" ? false : options.autoExpandSingleChildren;
    this.root = {
      parent: void 0,
      element: rootElement,
      children: [],
      depth: 0,
      visibleChildrenCount: 0,
      visibleChildIndex: -1,
      collapsible: false,
      collapsed: false,
      renderNodeCount: 0,
      visibility: TreeVisibility.Visible,
      visible: true,
      filterData: void 0
    };
  }
  splice(location, deleteCount, toInsert = Iterable.empty(), options = {}) {
    if (location.length === 0) {
      throw new TreeError(this.user, "Invalid tree location");
    }
    if (options.diffIdentityProvider) {
      this.spliceSmart(options.diffIdentityProvider, location, deleteCount, toInsert, options);
    } else {
      this.spliceSimple(location, deleteCount, toInsert, options);
    }
  }
  spliceSmart(identity, location, deleteCount, toInsertIterable = Iterable.empty(), options, recurseLevels = options.diffDepth ?? 0) {
    const { parentNode } = this.getParentNodeWithListIndex(location);
    if (!parentNode.lastDiffIds) {
      return this.spliceSimple(location, deleteCount, toInsertIterable, options);
    }
    const toInsert = [...toInsertIterable];
    const index = location[location.length - 1];
    const diff = new LcsDiff(
      { getElements: () => parentNode.lastDiffIds },
      {
        getElements: () => [
          ...parentNode.children.slice(0, index),
          ...toInsert,
          ...parentNode.children.slice(index + deleteCount)
        ].map((e) => identity.getId(e.element).toString())
      }
    ).ComputeDiff(false);
    if (diff.quitEarly) {
      parentNode.lastDiffIds = void 0;
      return this.spliceSimple(location, deleteCount, toInsert, options);
    }
    const locationPrefix = location.slice(0, -1);
    const recurseSplice = (fromOriginal, fromModified, count) => {
      if (recurseLevels > 0) {
        for (let i = 0; i < count; i++) {
          fromOriginal--;
          fromModified--;
          this.spliceSmart(
            identity,
            [...locationPrefix, fromOriginal, 0],
            Number.MAX_SAFE_INTEGER,
            toInsert[fromModified].children,
            options,
            recurseLevels - 1
          );
        }
      }
    };
    let lastStartO = Math.min(parentNode.children.length, index + deleteCount);
    let lastStartM = toInsert.length;
    for (const change of diff.changes.sort((a, b) => b.originalStart - a.originalStart)) {
      recurseSplice(lastStartO, lastStartM, lastStartO - (change.originalStart + change.originalLength));
      lastStartO = change.originalStart;
      lastStartM = change.modifiedStart - index;
      this.spliceSimple(
        [...locationPrefix, lastStartO],
        change.originalLength,
        Iterable.slice(toInsert, lastStartM, lastStartM + change.modifiedLength),
        options
      );
    }
    recurseSplice(lastStartO, lastStartM, lastStartO);
  }
  spliceSimple(location, deleteCount, toInsert = Iterable.empty(), { onDidCreateNode, onDidDeleteNode, diffIdentityProvider }) {
    const { parentNode, listIndex, revealed, visible } = this.getParentNodeWithListIndex(location);
    const treeListElementsToInsert = [];
    const nodesToInsertIterator = Iterable.map(toInsert, (el) => this.createTreeNode(el, parentNode, parentNode.visible ? TreeVisibility.Visible : TreeVisibility.Hidden, revealed, treeListElementsToInsert, onDidCreateNode));
    const lastIndex = location[location.length - 1];
    let visibleChildStartIndex = 0;
    for (let i = lastIndex; i >= 0 && i < parentNode.children.length; i--) {
      const child = parentNode.children[i];
      if (child.visible) {
        visibleChildStartIndex = child.visibleChildIndex;
        break;
      }
    }
    const nodesToInsert = [];
    let insertedVisibleChildrenCount = 0;
    let renderNodeCount = 0;
    for (const child of nodesToInsertIterator) {
      nodesToInsert.push(child);
      renderNodeCount += child.renderNodeCount;
      if (child.visible) {
        child.visibleChildIndex = visibleChildStartIndex + insertedVisibleChildrenCount++;
      }
    }
    const deletedNodes = splice(parentNode.children, lastIndex, deleteCount, nodesToInsert);
    if (!diffIdentityProvider) {
      parentNode.lastDiffIds = void 0;
    } else if (parentNode.lastDiffIds) {
      splice(parentNode.lastDiffIds, lastIndex, deleteCount, nodesToInsert.map((n) => diffIdentityProvider.getId(n.element).toString()));
    } else {
      parentNode.lastDiffIds = parentNode.children.map((n) => diffIdentityProvider.getId(n.element).toString());
    }
    let deletedVisibleChildrenCount = 0;
    for (const child of deletedNodes) {
      if (child.visible) {
        deletedVisibleChildrenCount++;
      }
    }
    if (deletedVisibleChildrenCount !== 0) {
      for (let i = lastIndex + nodesToInsert.length; i < parentNode.children.length; i++) {
        const child = parentNode.children[i];
        if (child.visible) {
          child.visibleChildIndex -= deletedVisibleChildrenCount;
        }
      }
    }
    parentNode.visibleChildrenCount += insertedVisibleChildrenCount - deletedVisibleChildrenCount;
    if (deletedNodes.length > 0 && onDidDeleteNode) {
      const visit = (node2) => {
        onDidDeleteNode(node2);
        node2.children.forEach(visit);
      };
      deletedNodes.forEach(visit);
    }
    if (revealed && visible) {
      const visibleDeleteCount = deletedNodes.reduce((r, node2) => r + (node2.visible ? node2.renderNodeCount : 0), 0);
      this._updateAncestorsRenderNodeCount(parentNode, renderNodeCount - visibleDeleteCount);
      this._onDidSpliceRenderedNodes.fire({ start: listIndex, deleteCount: visibleDeleteCount, elements: treeListElementsToInsert });
    }
    this._onDidSpliceModel.fire({ insertedNodes: nodesToInsert, deletedNodes });
    let node = parentNode;
    while (node) {
      if (node.visibility === TreeVisibility.Recurse) {
        this.refilterDelayer.trigger(() => this.refilter());
        break;
      }
      node = node.parent;
    }
  }
  rerender(location) {
    if (location.length === 0) {
      throw new TreeError(this.user, "Invalid tree location");
    }
    const { node, listIndex, revealed } = this.getTreeNodeWithListIndex(location);
    if (node.visible && revealed) {
      this._onDidSpliceRenderedNodes.fire({ start: listIndex, deleteCount: 1, elements: [node] });
    }
  }
  has(location) {
    return this.hasTreeNode(location);
  }
  getListIndex(location) {
    const { listIndex, visible, revealed } = this.getTreeNodeWithListIndex(location);
    return visible && revealed ? listIndex : -1;
  }
  getListRenderCount(location) {
    return this.getTreeNode(location).renderNodeCount;
  }
  isCollapsible(location) {
    return this.getTreeNode(location).collapsible;
  }
  setCollapsible(location, collapsible) {
    const node = this.getTreeNode(location);
    if (typeof collapsible === "undefined") {
      collapsible = !node.collapsible;
    }
    const update = { collapsible };
    return this.eventBufferer.bufferEvents(() => this._setCollapseState(location, update));
  }
  isCollapsed(location) {
    return this.getTreeNode(location).collapsed;
  }
  setCollapsed(location, collapsed, recursive) {
    const node = this.getTreeNode(location);
    if (typeof collapsed === "undefined") {
      collapsed = !node.collapsed;
    }
    const update = { collapsed, recursive: recursive || false };
    return this.eventBufferer.bufferEvents(() => this._setCollapseState(location, update));
  }
  _setCollapseState(location, update) {
    const { node, listIndex, revealed } = this.getTreeNodeWithListIndex(location);
    const result = this._setListNodeCollapseState(node, listIndex, revealed, update);
    if (node !== this.root && this.autoExpandSingleChildren && result && !isCollapsibleStateUpdate(update) && node.collapsible && !node.collapsed && !update.recursive) {
      let onlyVisibleChildIndex = -1;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.visible) {
          if (onlyVisibleChildIndex > -1) {
            onlyVisibleChildIndex = -1;
            break;
          } else {
            onlyVisibleChildIndex = i;
          }
        }
      }
      if (onlyVisibleChildIndex > -1) {
        this._setCollapseState([...location, onlyVisibleChildIndex], update);
      }
    }
    return result;
  }
  _setListNodeCollapseState(node, listIndex, revealed, update) {
    const result = this._setNodeCollapseState(node, update, false);
    if (!revealed || !node.visible || !result) {
      return result;
    }
    const previousRenderNodeCount = node.renderNodeCount;
    const toInsert = this.updateNodeAfterCollapseChange(node);
    const deleteCount = previousRenderNodeCount - (listIndex === -1 ? 0 : 1);
    this._onDidSpliceRenderedNodes.fire({ start: listIndex + 1, deleteCount, elements: toInsert.slice(1) });
    return result;
  }
  _setNodeCollapseState(node, update, deep) {
    let result;
    if (node === this.root) {
      result = false;
    } else {
      if (isCollapsibleStateUpdate(update)) {
        result = node.collapsible !== update.collapsible;
        node.collapsible = update.collapsible;
      } else if (!node.collapsible) {
        result = false;
      } else {
        result = node.collapsed !== update.collapsed;
        node.collapsed = update.collapsed;
      }
      if (result) {
        this._onDidChangeCollapseState.fire({ node, deep });
      }
    }
    if (!isCollapsibleStateUpdate(update) && update.recursive) {
      for (const child of node.children) {
        result = this._setNodeCollapseState(child, update, true) || result;
      }
    }
    return result;
  }
  expandTo(location) {
    this.eventBufferer.bufferEvents(() => {
      let node = this.getTreeNode(location);
      while (node.parent) {
        node = node.parent;
        location = location.slice(0, location.length - 1);
        if (node.collapsed) {
          this._setCollapseState(location, { collapsed: false, recursive: false });
        }
      }
    });
  }
  refilter() {
    const previousRenderNodeCount = this.root.renderNodeCount;
    const toInsert = this.updateNodeAfterFilterChange(this.root);
    this._onDidSpliceRenderedNodes.fire({ start: 0, deleteCount: previousRenderNodeCount, elements: toInsert });
    this.refilterDelayer.cancel();
  }
  createTreeNode(treeElement, parent, parentVisibility, revealed, treeListElements, onDidCreateNode) {
    const node = {
      parent,
      element: treeElement.element,
      children: [],
      depth: parent.depth + 1,
      visibleChildrenCount: 0,
      visibleChildIndex: -1,
      collapsible: typeof treeElement.collapsible === "boolean" ? treeElement.collapsible : typeof treeElement.collapsed !== "undefined",
      collapsed: typeof treeElement.collapsed === "undefined" ? this.collapseByDefault : treeElement.collapsed,
      renderNodeCount: 1,
      visibility: TreeVisibility.Visible,
      visible: true,
      filterData: void 0
    };
    const visibility = this._filterNode(node, parentVisibility);
    node.visibility = visibility;
    if (revealed) {
      treeListElements.push(node);
    }
    const childElements = treeElement.children || Iterable.empty();
    const childRevealed = revealed && visibility !== TreeVisibility.Hidden && !node.collapsed;
    let visibleChildrenCount = 0;
    let renderNodeCount = 1;
    for (const el of childElements) {
      const child = this.createTreeNode(el, node, visibility, childRevealed, treeListElements, onDidCreateNode);
      node.children.push(child);
      renderNodeCount += child.renderNodeCount;
      if (child.visible) {
        child.visibleChildIndex = visibleChildrenCount++;
      }
    }
    if (!this.allowNonCollapsibleParents) {
      node.collapsible = node.collapsible || node.children.length > 0;
    }
    node.visibleChildrenCount = visibleChildrenCount;
    node.visible = visibility === TreeVisibility.Recurse ? visibleChildrenCount > 0 : visibility === TreeVisibility.Visible;
    if (!node.visible) {
      node.renderNodeCount = 0;
      if (revealed) {
        treeListElements.pop();
      }
    } else if (!node.collapsed) {
      node.renderNodeCount = renderNodeCount;
    }
    onDidCreateNode?.(node);
    return node;
  }
  updateNodeAfterCollapseChange(node) {
    const previousRenderNodeCount = node.renderNodeCount;
    const result = [];
    this._updateNodeAfterCollapseChange(node, result);
    this._updateAncestorsRenderNodeCount(node.parent, result.length - previousRenderNodeCount);
    return result;
  }
  _updateNodeAfterCollapseChange(node, result) {
    if (node.visible === false) {
      return 0;
    }
    result.push(node);
    node.renderNodeCount = 1;
    if (!node.collapsed) {
      for (const child of node.children) {
        node.renderNodeCount += this._updateNodeAfterCollapseChange(child, result);
      }
    }
    this._onDidChangeRenderNodeCount.fire(node);
    return node.renderNodeCount;
  }
  updateNodeAfterFilterChange(node) {
    const previousRenderNodeCount = node.renderNodeCount;
    const result = [];
    this._updateNodeAfterFilterChange(node, node.visible ? TreeVisibility.Visible : TreeVisibility.Hidden, result);
    this._updateAncestorsRenderNodeCount(node.parent, result.length - previousRenderNodeCount);
    return result;
  }
  _updateNodeAfterFilterChange(node, parentVisibility, result, revealed = true) {
    let visibility;
    if (node !== this.root) {
      visibility = this._filterNode(node, parentVisibility);
      if (visibility === TreeVisibility.Hidden) {
        node.visible = false;
        node.renderNodeCount = 0;
        return false;
      }
      if (revealed) {
        result.push(node);
      }
    }
    const resultStartLength = result.length;
    node.renderNodeCount = node === this.root ? 0 : 1;
    let hasVisibleDescendants = false;
    if (!node.collapsed || visibility !== TreeVisibility.Hidden) {
      let visibleChildIndex = 0;
      for (const child of node.children) {
        hasVisibleDescendants = this._updateNodeAfterFilterChange(child, visibility, result, revealed && !node.collapsed) || hasVisibleDescendants;
        if (child.visible) {
          child.visibleChildIndex = visibleChildIndex++;
        }
      }
      node.visibleChildrenCount = visibleChildIndex;
    } else {
      node.visibleChildrenCount = 0;
    }
    if (node !== this.root) {
      node.visible = visibility === TreeVisibility.Recurse ? hasVisibleDescendants : visibility === TreeVisibility.Visible;
      node.visibility = visibility;
    }
    if (!node.visible) {
      node.renderNodeCount = 0;
      if (revealed) {
        result.pop();
      }
    } else if (!node.collapsed) {
      node.renderNodeCount += result.length - resultStartLength;
    }
    this._onDidChangeRenderNodeCount.fire(node);
    return node.visible;
  }
  _updateAncestorsRenderNodeCount(node, diff) {
    if (diff === 0) {
      return;
    }
    while (node) {
      node.renderNodeCount += diff;
      this._onDidChangeRenderNodeCount.fire(node);
      node = node.parent;
    }
  }
  _filterNode(node, parentVisibility) {
    const result = this.filter ? this.filter.filter(node.element, parentVisibility) : TreeVisibility.Visible;
    if (typeof result === "boolean") {
      node.filterData = void 0;
      return result ? TreeVisibility.Visible : TreeVisibility.Hidden;
    } else if (isFilterResult(result)) {
      node.filterData = result.data;
      return getVisibleState(result.visibility);
    } else {
      node.filterData = void 0;
      return getVisibleState(result);
    }
  }
  // cheap
  hasTreeNode(location, node = this.root) {
    if (!location || location.length === 0) {
      return true;
    }
    const [index, ...rest] = location;
    if (index < 0 || index > node.children.length) {
      return false;
    }
    return this.hasTreeNode(rest, node.children[index]);
  }
  // cheap
  getTreeNode(location, node = this.root) {
    if (!location || location.length === 0) {
      return node;
    }
    const [index, ...rest] = location;
    if (index < 0 || index > node.children.length) {
      throw new TreeError(this.user, "Invalid tree location");
    }
    return this.getTreeNode(rest, node.children[index]);
  }
  // expensive
  getTreeNodeWithListIndex(location) {
    if (location.length === 0) {
      return { node: this.root, listIndex: -1, revealed: true, visible: false };
    }
    const { parentNode, listIndex, revealed, visible } = this.getParentNodeWithListIndex(location);
    const index = location[location.length - 1];
    if (index < 0 || index > parentNode.children.length) {
      throw new TreeError(this.user, "Invalid tree location");
    }
    const node = parentNode.children[index];
    return { node, listIndex, revealed, visible: visible && node.visible };
  }
  getParentNodeWithListIndex(location, node = this.root, listIndex = 0, revealed = true, visible = true) {
    const [index, ...rest] = location;
    if (index < 0 || index > node.children.length) {
      throw new TreeError(this.user, "Invalid tree location");
    }
    for (let i = 0; i < index; i++) {
      listIndex += node.children[i].renderNodeCount;
    }
    revealed = revealed && !node.collapsed;
    visible = visible && node.visible;
    if (rest.length === 0) {
      return { parentNode: node, listIndex, revealed, visible };
    }
    return this.getParentNodeWithListIndex(rest, node.children[index], listIndex + 1, revealed, visible);
  }
  getNode(location = []) {
    return this.getTreeNode(location);
  }
  // TODO@joao perf!
  getNodeLocation(node) {
    const location = [];
    let indexTreeNode = node;
    while (indexTreeNode.parent) {
      location.push(indexTreeNode.parent.children.indexOf(indexTreeNode));
      indexTreeNode = indexTreeNode.parent;
    }
    return location.reverse();
  }
  getParentNodeLocation(location) {
    if (location.length === 0) {
      return void 0;
    } else if (location.length === 1) {
      return [];
    } else {
      return tail(location)[0];
    }
  }
  getFirstElementChild(location) {
    const node = this.getTreeNode(location);
    if (node.children.length === 0) {
      return void 0;
    }
    return node.children[0].element;
  }
  getLastElementAncestor(location = []) {
    const node = this.getTreeNode(location);
    if (node.children.length === 0) {
      return void 0;
    }
    return this._getLastElementAncestor(node);
  }
  _getLastElementAncestor(node) {
    if (node.children.length === 0) {
      return node.element;
    }
    return this._getLastElementAncestor(node.children[node.children.length - 1]);
  }
}
export {
  IndexTreeModel,
  getVisibleState,
  isFilterResult
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFx1aVxcdHJlZVxcaW5kZXhUcmVlTW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJSWRlbnRpdHlQcm92aWRlciB9IGZyb20gJy4uL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBJQ29sbGFwc2VTdGF0ZUNoYW5nZUV2ZW50LCBJVHJlZUVsZW1lbnQsIElUcmVlRmlsdGVyLCBJVHJlZUZpbHRlckRhdGFSZXN1bHQsIElUcmVlTGlzdFNwbGljZURhdGEsIElUcmVlTW9kZWwsIElUcmVlTW9kZWxTcGxpY2VFdmVudCwgSVRyZWVOb2RlLCBUcmVlRXJyb3IsIFRyZWVWaXNpYmlsaXR5IH0gZnJvbSAnLi90cmVlLmpzJztcbmltcG9ydCB7IHNwbGljZSwgdGFpbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgRGVsYXllciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBNaWNyb3Rhc2tEZWxheSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zeW1ib2xzLmpzJztcbmltcG9ydCB7IExjc0RpZmYgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZGlmZi9kaWZmLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50LCBFdmVudEJ1ZmZlcmVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2l0ZXJhdG9yLmpzJztcblxuLy8gRXhwb3J0ZWQgZm9yIHRlc3RzXG5leHBvcnQgaW50ZXJmYWNlIElJbmRleFRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhID0gdm9pZD4gZXh0ZW5kcyBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+IHtcblx0cmVhZG9ubHkgcGFyZW50OiBJSW5kZXhUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4gfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGNoaWxkcmVuOiBJSW5kZXhUcmVlTm9kZTxULCBURmlsdGVyRGF0YT5bXTtcblx0dmlzaWJsZUNoaWxkcmVuQ291bnQ6IG51bWJlcjtcblx0dmlzaWJsZUNoaWxkSW5kZXg6IG51bWJlcjtcblx0Y29sbGFwc2libGU6IGJvb2xlYW47XG5cdGNvbGxhcHNlZDogYm9vbGVhbjtcblx0cmVuZGVyTm9kZUNvdW50OiBudW1iZXI7XG5cdHZpc2liaWxpdHk6IFRyZWVWaXNpYmlsaXR5O1xuXHR2aXNpYmxlOiBib29sZWFuO1xuXHRmaWx0ZXJEYXRhOiBURmlsdGVyRGF0YSB8IHVuZGVmaW5lZDtcblx0bGFzdERpZmZJZHM/OiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzRmlsdGVyUmVzdWx0PFQ+KG9iajogdW5rbm93bik6IG9iaiBpcyBJVHJlZUZpbHRlckRhdGFSZXN1bHQ8VD4ge1xuXHRyZXR1cm4gISFvYmogJiYgKDxJVHJlZUZpbHRlckRhdGFSZXN1bHQ8VD4+b2JqKS52aXNpYmlsaXR5ICE9PSB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRWaXNpYmxlU3RhdGUodmlzaWJpbGl0eTogYm9vbGVhbiB8IFRyZWVWaXNpYmlsaXR5KTogVHJlZVZpc2liaWxpdHkge1xuXHRzd2l0Y2ggKHZpc2liaWxpdHkpIHtcblx0XHRjYXNlIHRydWU6IHJldHVybiBUcmVlVmlzaWJpbGl0eS5WaXNpYmxlO1xuXHRcdGNhc2UgZmFsc2U6IHJldHVybiBUcmVlVmlzaWJpbGl0eS5IaWRkZW47XG5cdFx0ZGVmYXVsdDogcmV0dXJuIHZpc2liaWxpdHk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJSW5kZXhUcmVlTW9kZWxPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPiB7XG5cdHJlYWRvbmx5IGNvbGxhcHNlQnlEZWZhdWx0PzogYm9vbGVhbjsgLy8gZGVmYXVsdHMgdG8gZmFsc2Vcblx0cmVhZG9ubHkgYWxsb3dOb25Db2xsYXBzaWJsZVBhcmVudHM/OiBib29sZWFuOyAvLyBkZWZhdWx0cyB0byBmYWxzZVxuXHRyZWFkb25seSBmaWx0ZXI/OiBJVHJlZUZpbHRlcjxULCBURmlsdGVyRGF0YT47XG5cdHJlYWRvbmx5IGF1dG9FeHBhbmRTaW5nbGVDaGlsZHJlbj86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUluZGV4VHJlZU1vZGVsU3BsaWNlT3B0aW9uczxULCBURmlsdGVyRGF0YT4ge1xuXHQvKipcblx0ICogSWYgc2V0LCBjaGlsZCB1cGRhdGVzIHdpbGwgcmVjdXJzZSB0aGUgZ2l2ZW4gbnVtYmVyIG9mIGxldmVscyBldmVuIGlmXG5cdCAqIGl0ZW1zIGluIHRoZSBzcGxpY2Ugb3BlcmF0aW9uIGFyZSB1bmNoYW5nZWQuIGBJbmZpbml0eWAgaXMgYSB2YWxpZCB2YWx1ZS5cblx0ICovXG5cdHJlYWRvbmx5IGRpZmZEZXB0aD86IG51bWJlcjtcblxuXHQvKipcblx0ICogSWRlbnRpdHkgcHJvdmlkZXIgdXNlZCB0byBvcHRpbWl6ZSBzcGxpY2UoKSBjYWxscyBpbiB0aGUgSW5kZXhUcmVlLiBJZlxuXHQgKiB0aGlzIGlzIG5vdCBwcmVzZW50LCBvcHRpbWl6ZWQgc3BsaWNpbmcgaXMgbm90IGVuYWJsZWQuXG5cdCAqXG5cdCAqIFdhcm5pbmc6IGlmIHRoaXMgaXMgcHJlc2VudCwgY2FsbHMgdG8gYHNldENoaWxkcmVuKClgIHdpbGwgbm90IHJlcGxhY2Vcblx0ICogb3IgdXBkYXRlIG5vZGVzIGlmIHRoZWlyIGlkZW50aXR5IGlzIHRoZSBzYW1lLCBldmVuIGlmIHRoZSBlbGVtZW50cyBhcmVcblx0ICogZGlmZmVyZW50LiBGb3IgdGhpcywgeW91IHNob3VsZCBjYWxsIGByZXJlbmRlcigpYC5cblx0ICovXG5cdHJlYWRvbmx5IGRpZmZJZGVudGl0eVByb3ZpZGVyPzogSUlkZW50aXR5UHJvdmlkZXI8VD47XG5cblx0LyoqXG5cdCAqIENhbGxiYWNrIGZvciB3aGVuIGEgbm9kZSBpcyBjcmVhdGVkLlxuXHQgKi9cblx0b25EaWRDcmVhdGVOb2RlPzogKG5vZGU6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4pID0+IHZvaWQ7XG5cblx0LyoqXG5cdCAqIENhbGxiYWNrIGZvciB3aGVuIGEgbm9kZSBpcyBkZWxldGVkLlxuXHQgKi9cblx0b25EaWREZWxldGVOb2RlPzogKG5vZGU6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4pID0+IHZvaWQ7XG59XG5cbmludGVyZmFjZSBDb2xsYXBzaWJsZVN0YXRlVXBkYXRlIHtcblx0cmVhZG9ubHkgY29sbGFwc2libGU6IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBDb2xsYXBzZWRTdGF0ZVVwZGF0ZSB7XG5cdHJlYWRvbmx5IGNvbGxhcHNlZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgcmVjdXJzaXZlOiBib29sZWFuO1xufVxuXG50eXBlIENvbGxhcHNlU3RhdGVVcGRhdGUgPSBDb2xsYXBzaWJsZVN0YXRlVXBkYXRlIHwgQ29sbGFwc2VkU3RhdGVVcGRhdGU7XG5cbmZ1bmN0aW9uIGlzQ29sbGFwc2libGVTdGF0ZVVwZGF0ZSh1cGRhdGU6IENvbGxhcHNlU3RhdGVVcGRhdGUpOiB1cGRhdGUgaXMgQ29sbGFwc2libGVTdGF0ZVVwZGF0ZSB7XG5cdHJldHVybiAnY29sbGFwc2libGUnIGluIHVwZGF0ZTtcbn1cblxuZXhwb3J0IGNsYXNzIEluZGV4VHJlZU1vZGVsPFQgZXh0ZW5kcyBFeGNsdWRlPHVua25vd24sIHVuZGVmaW5lZD4sIFRGaWx0ZXJEYXRhID0gdm9pZD4gaW1wbGVtZW50cyBJVHJlZU1vZGVsPFQsIFRGaWx0ZXJEYXRhLCBudW1iZXJbXT4ge1xuXG5cdHJlYWRvbmx5IHJvb3RSZWYgPSBbXTtcblxuXHRwcml2YXRlIHJvb3Q6IElJbmRleFRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPjtcblx0cHJpdmF0ZSBldmVudEJ1ZmZlcmVyID0gbmV3IEV2ZW50QnVmZmVyZXIoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNwbGljZU1vZGVsID0gbmV3IEVtaXR0ZXI8SVRyZWVNb2RlbFNwbGljZUV2ZW50PFQsIFRGaWx0ZXJEYXRhPj4oKTtcblx0cmVhZG9ubHkgb25EaWRTcGxpY2VNb2RlbCA9IHRoaXMuX29uRGlkU3BsaWNlTW9kZWwuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTcGxpY2VSZW5kZXJlZE5vZGVzID0gbmV3IEVtaXR0ZXI8SVRyZWVMaXN0U3BsaWNlRGF0YTxULCBURmlsdGVyRGF0YT4+KCk7XG5cdHJlYWRvbmx5IG9uRGlkU3BsaWNlUmVuZGVyZWROb2RlcyA9IHRoaXMuX29uRGlkU3BsaWNlUmVuZGVyZWROb2Rlcy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbGxhcHNlU3RhdGUgPSBuZXcgRW1pdHRlcjxJQ29sbGFwc2VTdGF0ZUNoYW5nZUV2ZW50PFQsIFRGaWx0ZXJEYXRhPj4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlOiBFdmVudDxJQ29sbGFwc2VTdGF0ZUNoYW5nZUV2ZW50PFQsIFRGaWx0ZXJEYXRhPj4gPSB0aGlzLmV2ZW50QnVmZmVyZXIud3JhcEV2ZW50KHRoaXMuX29uRGlkQ2hhbmdlQ29sbGFwc2VTdGF0ZS5ldmVudCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VSZW5kZXJOb2RlQ291bnQgPSBuZXcgRW1pdHRlcjxJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+PigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVJlbmRlck5vZGVDb3VudDogRXZlbnQ8SVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPj4gPSB0aGlzLmV2ZW50QnVmZmVyZXIud3JhcEV2ZW50KHRoaXMuX29uRGlkQ2hhbmdlUmVuZGVyTm9kZUNvdW50LmV2ZW50KTtcblxuXHRwcml2YXRlIGNvbGxhcHNlQnlEZWZhdWx0OiBib29sZWFuO1xuXHRwcml2YXRlIGFsbG93Tm9uQ29sbGFwc2libGVQYXJlbnRzOiBib29sZWFuO1xuXHRwcml2YXRlIGZpbHRlcj86IElUcmVlRmlsdGVyPFQsIFRGaWx0ZXJEYXRhPjtcblx0cHJpdmF0ZSBhdXRvRXhwYW5kU2luZ2xlQ2hpbGRyZW46IGJvb2xlYW47XG5cblx0cHJpdmF0ZSByZWFkb25seSByZWZpbHRlckRlbGF5ZXIgPSBuZXcgRGVsYXllcihNaWNyb3Rhc2tEZWxheSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSB1c2VyOiBzdHJpbmcsXG5cdFx0cm9vdEVsZW1lbnQ6IFQsXG5cdFx0b3B0aW9uczogSUluZGV4VHJlZU1vZGVsT3B0aW9uczxULCBURmlsdGVyRGF0YT4gPSB7fVxuXHQpIHtcblx0XHR0aGlzLmNvbGxhcHNlQnlEZWZhdWx0ID0gdHlwZW9mIG9wdGlvbnMuY29sbGFwc2VCeURlZmF1bHQgPT09ICd1bmRlZmluZWQnID8gZmFsc2UgOiBvcHRpb25zLmNvbGxhcHNlQnlEZWZhdWx0O1xuXHRcdHRoaXMuYWxsb3dOb25Db2xsYXBzaWJsZVBhcmVudHMgPSBvcHRpb25zLmFsbG93Tm9uQ29sbGFwc2libGVQYXJlbnRzID8/IGZhbHNlO1xuXHRcdHRoaXMuZmlsdGVyID0gb3B0aW9ucy5maWx0ZXI7XG5cdFx0dGhpcy5hdXRvRXhwYW5kU2luZ2xlQ2hpbGRyZW4gPSB0eXBlb2Ygb3B0aW9ucy5hdXRvRXhwYW5kU2luZ2xlQ2hpbGRyZW4gPT09ICd1bmRlZmluZWQnID8gZmFsc2UgOiBvcHRpb25zLmF1dG9FeHBhbmRTaW5nbGVDaGlsZHJlbjtcblxuXHRcdHRoaXMucm9vdCA9IHtcblx0XHRcdHBhcmVudDogdW5kZWZpbmVkLFxuXHRcdFx0ZWxlbWVudDogcm9vdEVsZW1lbnQsXG5cdFx0XHRjaGlsZHJlbjogW10sXG5cdFx0XHRkZXB0aDogMCxcblx0XHRcdHZpc2libGVDaGlsZHJlbkNvdW50OiAwLFxuXHRcdFx0dmlzaWJsZUNoaWxkSW5kZXg6IC0xLFxuXHRcdFx0Y29sbGFwc2libGU6IGZhbHNlLFxuXHRcdFx0Y29sbGFwc2VkOiBmYWxzZSxcblx0XHRcdHJlbmRlck5vZGVDb3VudDogMCxcblx0XHRcdHZpc2liaWxpdHk6IFRyZWVWaXNpYmlsaXR5LlZpc2libGUsXG5cdFx0XHR2aXNpYmxlOiB0cnVlLFxuXHRcdFx0ZmlsdGVyRGF0YTogdW5kZWZpbmVkXG5cdFx0fTtcblx0fVxuXG5cdHNwbGljZShcblx0XHRsb2NhdGlvbjogbnVtYmVyW10sXG5cdFx0ZGVsZXRlQ291bnQ6IG51bWJlcixcblx0XHR0b0luc2VydDogSXRlcmFibGU8SVRyZWVFbGVtZW50PFQ+PiA9IEl0ZXJhYmxlLmVtcHR5KCksXG5cdFx0b3B0aW9uczogSUluZGV4VHJlZU1vZGVsU3BsaWNlT3B0aW9uczxULCBURmlsdGVyRGF0YT4gPSB7fSxcblx0KTogdm9pZCB7XG5cdFx0aWYgKGxvY2F0aW9uLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhyb3cgbmV3IFRyZWVFcnJvcih0aGlzLnVzZXIsICdJbnZhbGlkIHRyZWUgbG9jYXRpb24nKTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy5kaWZmSWRlbnRpdHlQcm92aWRlcikge1xuXHRcdFx0dGhpcy5zcGxpY2VTbWFydChvcHRpb25zLmRpZmZJZGVudGl0eVByb3ZpZGVyLCBsb2NhdGlvbiwgZGVsZXRlQ291bnQsIHRvSW5zZXJ0LCBvcHRpb25zKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zcGxpY2VTaW1wbGUobG9jYXRpb24sIGRlbGV0ZUNvdW50LCB0b0luc2VydCwgb3B0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzcGxpY2VTbWFydChcblx0XHRpZGVudGl0eTogSUlkZW50aXR5UHJvdmlkZXI8VD4sXG5cdFx0bG9jYXRpb246IG51bWJlcltdLFxuXHRcdGRlbGV0ZUNvdW50OiBudW1iZXIsXG5cdFx0dG9JbnNlcnRJdGVyYWJsZTogSXRlcmFibGU8SVRyZWVFbGVtZW50PFQ+PiA9IEl0ZXJhYmxlLmVtcHR5KCksXG5cdFx0b3B0aW9uczogSUluZGV4VHJlZU1vZGVsU3BsaWNlT3B0aW9uczxULCBURmlsdGVyRGF0YT4sXG5cdFx0cmVjdXJzZUxldmVscyA9IG9wdGlvbnMuZGlmZkRlcHRoID8/IDAsXG5cdCkge1xuXHRcdGNvbnN0IHsgcGFyZW50Tm9kZSB9ID0gdGhpcy5nZXRQYXJlbnROb2RlV2l0aExpc3RJbmRleChsb2NhdGlvbik7XG5cdFx0aWYgKCFwYXJlbnROb2RlLmxhc3REaWZmSWRzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zcGxpY2VTaW1wbGUobG9jYXRpb24sIGRlbGV0ZUNvdW50LCB0b0luc2VydEl0ZXJhYmxlLCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHRjb25zdCB0b0luc2VydCA9IFsuLi50b0luc2VydEl0ZXJhYmxlXTtcblx0XHRjb25zdCBpbmRleCA9IGxvY2F0aW9uW2xvY2F0aW9uLmxlbmd0aCAtIDFdO1xuXHRcdGNvbnN0IGRpZmYgPSBuZXcgTGNzRGlmZihcblx0XHRcdHsgZ2V0RWxlbWVudHM6ICgpID0+IHBhcmVudE5vZGUubGFzdERpZmZJZHMhIH0sXG5cdFx0XHR7XG5cdFx0XHRcdGdldEVsZW1lbnRzOiAoKSA9PiBbXG5cdFx0XHRcdFx0Li4ucGFyZW50Tm9kZS5jaGlsZHJlbi5zbGljZSgwLCBpbmRleCksXG5cdFx0XHRcdFx0Li4udG9JbnNlcnQsXG5cdFx0XHRcdFx0Li4ucGFyZW50Tm9kZS5jaGlsZHJlbi5zbGljZShpbmRleCArIGRlbGV0ZUNvdW50KSxcblx0XHRcdFx0XS5tYXAoZSA9PiBpZGVudGl0eS5nZXRJZChlLmVsZW1lbnQpLnRvU3RyaW5nKCkpXG5cdFx0XHR9LFxuXHRcdCkuQ29tcHV0ZURpZmYoZmFsc2UpO1xuXG5cdFx0Ly8gaWYgd2Ugd2VyZSBnaXZlbiBhICdiZXN0IGVmZm9ydCcgZGlmZiwgdXNlIGRlZmF1bHQgYmVoYXZpb3Jcblx0XHRpZiAoZGlmZi5xdWl0RWFybHkpIHtcblx0XHRcdHBhcmVudE5vZGUubGFzdERpZmZJZHMgPSB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4gdGhpcy5zcGxpY2VTaW1wbGUobG9jYXRpb24sIGRlbGV0ZUNvdW50LCB0b0luc2VydCwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbG9jYXRpb25QcmVmaXggPSBsb2NhdGlvbi5zbGljZSgwLCAtMSk7XG5cdFx0Y29uc3QgcmVjdXJzZVNwbGljZSA9IChmcm9tT3JpZ2luYWw6IG51bWJlciwgZnJvbU1vZGlmaWVkOiBudW1iZXIsIGNvdW50OiBudW1iZXIpID0+IHtcblx0XHRcdGlmIChyZWN1cnNlTGV2ZWxzID4gMCkge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcblx0XHRcdFx0XHRmcm9tT3JpZ2luYWwtLTtcblx0XHRcdFx0XHRmcm9tTW9kaWZpZWQtLTtcblx0XHRcdFx0XHR0aGlzLnNwbGljZVNtYXJ0KFxuXHRcdFx0XHRcdFx0aWRlbnRpdHksXG5cdFx0XHRcdFx0XHRbLi4ubG9jYXRpb25QcmVmaXgsIGZyb21PcmlnaW5hbCwgMF0sXG5cdFx0XHRcdFx0XHROdW1iZXIuTUFYX1NBRkVfSU5URUdFUixcblx0XHRcdFx0XHRcdHRvSW5zZXJ0W2Zyb21Nb2RpZmllZF0uY2hpbGRyZW4sXG5cdFx0XHRcdFx0XHRvcHRpb25zLFxuXHRcdFx0XHRcdFx0cmVjdXJzZUxldmVscyAtIDEsXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRsZXQgbGFzdFN0YXJ0TyA9IE1hdGgubWluKHBhcmVudE5vZGUuY2hpbGRyZW4ubGVuZ3RoLCBpbmRleCArIGRlbGV0ZUNvdW50KTtcblx0XHRsZXQgbGFzdFN0YXJ0TSA9IHRvSW5zZXJ0Lmxlbmd0aDtcblx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiBkaWZmLmNoYW5nZXMuc29ydCgoYSwgYikgPT4gYi5vcmlnaW5hbFN0YXJ0IC0gYS5vcmlnaW5hbFN0YXJ0KSkge1xuXHRcdFx0cmVjdXJzZVNwbGljZShsYXN0U3RhcnRPLCBsYXN0U3RhcnRNLCBsYXN0U3RhcnRPIC0gKGNoYW5nZS5vcmlnaW5hbFN0YXJ0ICsgY2hhbmdlLm9yaWdpbmFsTGVuZ3RoKSk7XG5cdFx0XHRsYXN0U3RhcnRPID0gY2hhbmdlLm9yaWdpbmFsU3RhcnQ7XG5cdFx0XHRsYXN0U3RhcnRNID0gY2hhbmdlLm1vZGlmaWVkU3RhcnQgLSBpbmRleDtcblxuXHRcdFx0dGhpcy5zcGxpY2VTaW1wbGUoXG5cdFx0XHRcdFsuLi5sb2NhdGlvblByZWZpeCwgbGFzdFN0YXJ0T10sXG5cdFx0XHRcdGNoYW5nZS5vcmlnaW5hbExlbmd0aCxcblx0XHRcdFx0SXRlcmFibGUuc2xpY2UodG9JbnNlcnQsIGxhc3RTdGFydE0sIGxhc3RTdGFydE0gKyBjaGFuZ2UubW9kaWZpZWRMZW5ndGgpLFxuXHRcdFx0XHRvcHRpb25zLFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHQvLyBhdCB0aGlzIHBvaW50LCBzdGFydE8gPT09IHN0YXJ0TSA9PT0gY291bnQgc2luY2UgYW55IHJlbWFpbmluZyBwcmVmaXggc2hvdWxkIG1hdGNoXG5cdFx0cmVjdXJzZVNwbGljZShsYXN0U3RhcnRPLCBsYXN0U3RhcnRNLCBsYXN0U3RhcnRPKTtcblx0fVxuXG5cdHByaXZhdGUgc3BsaWNlU2ltcGxlKFxuXHRcdGxvY2F0aW9uOiBudW1iZXJbXSxcblx0XHRkZWxldGVDb3VudDogbnVtYmVyLFxuXHRcdHRvSW5zZXJ0OiBJdGVyYWJsZTxJVHJlZUVsZW1lbnQ8VD4+ID0gSXRlcmFibGUuZW1wdHkoKSxcblx0XHR7IG9uRGlkQ3JlYXRlTm9kZSwgb25EaWREZWxldGVOb2RlLCBkaWZmSWRlbnRpdHlQcm92aWRlciB9OiBJSW5kZXhUcmVlTW9kZWxTcGxpY2VPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPixcblx0KSB7XG5cdFx0Y29uc3QgeyBwYXJlbnROb2RlLCBsaXN0SW5kZXgsIHJldmVhbGVkLCB2aXNpYmxlIH0gPSB0aGlzLmdldFBhcmVudE5vZGVXaXRoTGlzdEluZGV4KGxvY2F0aW9uKTtcblx0XHRjb25zdCB0cmVlTGlzdEVsZW1lbnRzVG9JbnNlcnQ6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT5bXSA9IFtdO1xuXHRcdGNvbnN0IG5vZGVzVG9JbnNlcnRJdGVyYXRvciA9IEl0ZXJhYmxlLm1hcCh0b0luc2VydCwgZWwgPT4gdGhpcy5jcmVhdGVUcmVlTm9kZShlbCwgcGFyZW50Tm9kZSwgcGFyZW50Tm9kZS52aXNpYmxlID8gVHJlZVZpc2liaWxpdHkuVmlzaWJsZSA6IFRyZWVWaXNpYmlsaXR5LkhpZGRlbiwgcmV2ZWFsZWQsIHRyZWVMaXN0RWxlbWVudHNUb0luc2VydCwgb25EaWRDcmVhdGVOb2RlKSk7XG5cblx0XHRjb25zdCBsYXN0SW5kZXggPSBsb2NhdGlvbltsb2NhdGlvbi5sZW5ndGggLSAxXTtcblxuXHRcdC8vIGZpZ3VyZSBvdXQgd2hhdCdzIHRoZSB2aXNpYmxlIGNoaWxkIHN0YXJ0IGluZGV4IHJpZ2h0IGJlZm9yZSB0aGVcblx0XHQvLyBzcGxpY2UgcG9pbnRcblx0XHRsZXQgdmlzaWJsZUNoaWxkU3RhcnRJbmRleCA9IDA7XG5cblx0XHRmb3IgKGxldCBpID0gbGFzdEluZGV4OyBpID49IDAgJiYgaSA8IHBhcmVudE5vZGUuY2hpbGRyZW4ubGVuZ3RoOyBpLS0pIHtcblx0XHRcdGNvbnN0IGNoaWxkID0gcGFyZW50Tm9kZS5jaGlsZHJlbltpXTtcblxuXHRcdFx0aWYgKGNoaWxkLnZpc2libGUpIHtcblx0XHRcdFx0dmlzaWJsZUNoaWxkU3RhcnRJbmRleCA9IGNoaWxkLnZpc2libGVDaGlsZEluZGV4O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBub2Rlc1RvSW5zZXJ0OiBJSW5kZXhUcmVlTm9kZTxULCBURmlsdGVyRGF0YT5bXSA9IFtdO1xuXHRcdGxldCBpbnNlcnRlZFZpc2libGVDaGlsZHJlbkNvdW50ID0gMDtcblx0XHRsZXQgcmVuZGVyTm9kZUNvdW50ID0gMDtcblxuXHRcdGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZXNUb0luc2VydEl0ZXJhdG9yKSB7XG5cdFx0XHRub2Rlc1RvSW5zZXJ0LnB1c2goY2hpbGQpO1xuXHRcdFx0cmVuZGVyTm9kZUNvdW50ICs9IGNoaWxkLnJlbmRlck5vZGVDb3VudDtcblxuXHRcdFx0aWYgKGNoaWxkLnZpc2libGUpIHtcblx0XHRcdFx0Y2hpbGQudmlzaWJsZUNoaWxkSW5kZXggPSB2aXNpYmxlQ2hpbGRTdGFydEluZGV4ICsgaW5zZXJ0ZWRWaXNpYmxlQ2hpbGRyZW5Db3VudCsrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGRlbGV0ZWROb2RlcyA9IHNwbGljZShwYXJlbnROb2RlLmNoaWxkcmVuLCBsYXN0SW5kZXgsIGRlbGV0ZUNvdW50LCBub2Rlc1RvSW5zZXJ0KTtcblxuXHRcdGlmICghZGlmZklkZW50aXR5UHJvdmlkZXIpIHtcblx0XHRcdHBhcmVudE5vZGUubGFzdERpZmZJZHMgPSB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIGlmIChwYXJlbnROb2RlLmxhc3REaWZmSWRzKSB7XG5cdFx0XHRzcGxpY2UocGFyZW50Tm9kZS5sYXN0RGlmZklkcywgbGFzdEluZGV4LCBkZWxldGVDb3VudCwgbm9kZXNUb0luc2VydC5tYXAobiA9PiBkaWZmSWRlbnRpdHlQcm92aWRlci5nZXRJZChuLmVsZW1lbnQpLnRvU3RyaW5nKCkpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cGFyZW50Tm9kZS5sYXN0RGlmZklkcyA9IHBhcmVudE5vZGUuY2hpbGRyZW4ubWFwKG4gPT4gZGlmZklkZW50aXR5UHJvdmlkZXIuZ2V0SWQobi5lbGVtZW50KS50b1N0cmluZygpKTtcblx0XHR9XG5cblx0XHQvLyBmaWd1cmUgb3V0IHdoYXQgaXMgdGhlIGNvdW50IG9mIGRlbGV0ZWQgdmlzaWJsZSBjaGlsZHJlblxuXHRcdGxldCBkZWxldGVkVmlzaWJsZUNoaWxkcmVuQ291bnQgPSAwO1xuXG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBkZWxldGVkTm9kZXMpIHtcblx0XHRcdGlmIChjaGlsZC52aXNpYmxlKSB7XG5cdFx0XHRcdGRlbGV0ZWRWaXNpYmxlQ2hpbGRyZW5Db3VudCsrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIGFuZCBhZGp1c3QgZm9yIGFsbCB2aXNpYmxlIGNoaWxkcmVuIGFmdGVyIHRoZSBzcGxpY2UgcG9pbnRcblx0XHRpZiAoZGVsZXRlZFZpc2libGVDaGlsZHJlbkNvdW50ICE9PSAwKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gbGFzdEluZGV4ICsgbm9kZXNUb0luc2VydC5sZW5ndGg7IGkgPCBwYXJlbnROb2RlLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGNoaWxkID0gcGFyZW50Tm9kZS5jaGlsZHJlbltpXTtcblxuXHRcdFx0XHRpZiAoY2hpbGQudmlzaWJsZSkge1xuXHRcdFx0XHRcdGNoaWxkLnZpc2libGVDaGlsZEluZGV4IC09IGRlbGV0ZWRWaXNpYmxlQ2hpbGRyZW5Db3VudDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHVwZGF0ZSBwYXJlbnQncyB2aXNpYmxlIGNoaWxkcmVuIGNvdW50XG5cdFx0cGFyZW50Tm9kZS52aXNpYmxlQ2hpbGRyZW5Db3VudCArPSBpbnNlcnRlZFZpc2libGVDaGlsZHJlbkNvdW50IC0gZGVsZXRlZFZpc2libGVDaGlsZHJlbkNvdW50O1xuXG5cdFx0aWYgKGRlbGV0ZWROb2Rlcy5sZW5ndGggPiAwICYmIG9uRGlkRGVsZXRlTm9kZSkge1xuXHRcdFx0Y29uc3QgdmlzaXQgPSAobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPikgPT4ge1xuXHRcdFx0XHRvbkRpZERlbGV0ZU5vZGUobm9kZSk7XG5cdFx0XHRcdG5vZGUuY2hpbGRyZW4uZm9yRWFjaCh2aXNpdCk7XG5cdFx0XHR9O1xuXG5cdFx0XHRkZWxldGVkTm9kZXMuZm9yRWFjaCh2aXNpdCk7XG5cdFx0fVxuXG5cdFx0aWYgKHJldmVhbGVkICYmIHZpc2libGUpIHtcblx0XHRcdGNvbnN0IHZpc2libGVEZWxldGVDb3VudCA9IGRlbGV0ZWROb2Rlcy5yZWR1Y2UoKHIsIG5vZGUpID0+IHIgKyAobm9kZS52aXNpYmxlID8gbm9kZS5yZW5kZXJOb2RlQ291bnQgOiAwKSwgMCk7XG5cblx0XHRcdHRoaXMuX3VwZGF0ZUFuY2VzdG9yc1JlbmRlck5vZGVDb3VudChwYXJlbnROb2RlLCByZW5kZXJOb2RlQ291bnQgLSB2aXNpYmxlRGVsZXRlQ291bnQpO1xuXHRcdFx0dGhpcy5fb25EaWRTcGxpY2VSZW5kZXJlZE5vZGVzLmZpcmUoeyBzdGFydDogbGlzdEluZGV4LCBkZWxldGVDb3VudDogdmlzaWJsZURlbGV0ZUNvdW50LCBlbGVtZW50czogdHJlZUxpc3RFbGVtZW50c1RvSW5zZXJ0IH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkU3BsaWNlTW9kZWwuZmlyZSh7IGluc2VydGVkTm9kZXM6IG5vZGVzVG9JbnNlcnQsIGRlbGV0ZWROb2RlcyB9KTtcblxuXHRcdGxldCBub2RlOiBJSW5kZXhUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4gfCB1bmRlZmluZWQgPSBwYXJlbnROb2RlO1xuXG5cdFx0d2hpbGUgKG5vZGUpIHtcblx0XHRcdGlmIChub2RlLnZpc2liaWxpdHkgPT09IFRyZWVWaXNpYmlsaXR5LlJlY3Vyc2UpIHtcblx0XHRcdFx0Ly8gZGVsYXllZCB0byBhdm9pZCBleGNlc3NpdmUgcmVmaWx0ZXJpbmcsIHNlZSAjMTM1OTQxXG5cdFx0XHRcdHRoaXMucmVmaWx0ZXJEZWxheWVyLnRyaWdnZXIoKCkgPT4gdGhpcy5yZWZpbHRlcigpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdG5vZGUgPSBub2RlLnBhcmVudDtcblx0XHR9XG5cdH1cblxuXHRyZXJlbmRlcihsb2NhdGlvbjogbnVtYmVyW10pOiB2b2lkIHtcblx0XHRpZiAobG9jYXRpb24ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgVHJlZUVycm9yKHRoaXMudXNlciwgJ0ludmFsaWQgdHJlZSBsb2NhdGlvbicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgbm9kZSwgbGlzdEluZGV4LCByZXZlYWxlZCB9ID0gdGhpcy5nZXRUcmVlTm9kZVdpdGhMaXN0SW5kZXgobG9jYXRpb24pO1xuXG5cdFx0aWYgKG5vZGUudmlzaWJsZSAmJiByZXZlYWxlZCkge1xuXHRcdFx0dGhpcy5fb25EaWRTcGxpY2VSZW5kZXJlZE5vZGVzLmZpcmUoeyBzdGFydDogbGlzdEluZGV4LCBkZWxldGVDb3VudDogMSwgZWxlbWVudHM6IFtub2RlXSB9KTtcblx0XHR9XG5cdH1cblxuXHRoYXMobG9jYXRpb246IG51bWJlcltdKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaGFzVHJlZU5vZGUobG9jYXRpb24pO1xuXHR9XG5cblx0Z2V0TGlzdEluZGV4KGxvY2F0aW9uOiBudW1iZXJbXSk6IG51bWJlciB7XG5cdFx0Y29uc3QgeyBsaXN0SW5kZXgsIHZpc2libGUsIHJldmVhbGVkIH0gPSB0aGlzLmdldFRyZWVOb2RlV2l0aExpc3RJbmRleChsb2NhdGlvbik7XG5cdFx0cmV0dXJuIHZpc2libGUgJiYgcmV2ZWFsZWQgPyBsaXN0SW5kZXggOiAtMTtcblx0fVxuXG5cdGdldExpc3RSZW5kZXJDb3VudChsb2NhdGlvbjogbnVtYmVyW10pOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmdldFRyZWVOb2RlKGxvY2F0aW9uKS5yZW5kZXJOb2RlQ291bnQ7XG5cdH1cblxuXHRpc0NvbGxhcHNpYmxlKGxvY2F0aW9uOiBudW1iZXJbXSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmdldFRyZWVOb2RlKGxvY2F0aW9uKS5jb2xsYXBzaWJsZTtcblx0fVxuXG5cdHNldENvbGxhcHNpYmxlKGxvY2F0aW9uOiBudW1iZXJbXSwgY29sbGFwc2libGU/OiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgbm9kZSA9IHRoaXMuZ2V0VHJlZU5vZGUobG9jYXRpb24pO1xuXG5cdFx0aWYgKHR5cGVvZiBjb2xsYXBzaWJsZSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdGNvbGxhcHNpYmxlID0gIW5vZGUuY29sbGFwc2libGU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXBkYXRlOiBDb2xsYXBzaWJsZVN0YXRlVXBkYXRlID0geyBjb2xsYXBzaWJsZSB9O1xuXHRcdHJldHVybiB0aGlzLmV2ZW50QnVmZmVyZXIuYnVmZmVyRXZlbnRzKCgpID0+IHRoaXMuX3NldENvbGxhcHNlU3RhdGUobG9jYXRpb24sIHVwZGF0ZSkpO1xuXHR9XG5cblx0aXNDb2xsYXBzZWQobG9jYXRpb246IG51bWJlcltdKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0VHJlZU5vZGUobG9jYXRpb24pLmNvbGxhcHNlZDtcblx0fVxuXG5cdHNldENvbGxhcHNlZChsb2NhdGlvbjogbnVtYmVyW10sIGNvbGxhcHNlZD86IGJvb2xlYW4sIHJlY3Vyc2l2ZT86IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRjb25zdCBub2RlID0gdGhpcy5nZXRUcmVlTm9kZShsb2NhdGlvbik7XG5cblx0XHRpZiAodHlwZW9mIGNvbGxhcHNlZCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdGNvbGxhcHNlZCA9ICFub2RlLmNvbGxhcHNlZDtcblx0XHR9XG5cblx0XHRjb25zdCB1cGRhdGU6IENvbGxhcHNlZFN0YXRlVXBkYXRlID0geyBjb2xsYXBzZWQsIHJlY3Vyc2l2ZTogcmVjdXJzaXZlIHx8IGZhbHNlIH07XG5cdFx0cmV0dXJuIHRoaXMuZXZlbnRCdWZmZXJlci5idWZmZXJFdmVudHMoKCkgPT4gdGhpcy5fc2V0Q29sbGFwc2VTdGF0ZShsb2NhdGlvbiwgdXBkYXRlKSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRDb2xsYXBzZVN0YXRlKGxvY2F0aW9uOiBudW1iZXJbXSwgdXBkYXRlOiBDb2xsYXBzZVN0YXRlVXBkYXRlKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgeyBub2RlLCBsaXN0SW5kZXgsIHJldmVhbGVkIH0gPSB0aGlzLmdldFRyZWVOb2RlV2l0aExpc3RJbmRleChsb2NhdGlvbik7XG5cblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9zZXRMaXN0Tm9kZUNvbGxhcHNlU3RhdGUobm9kZSwgbGlzdEluZGV4LCByZXZlYWxlZCwgdXBkYXRlKTtcblxuXHRcdGlmIChub2RlICE9PSB0aGlzLnJvb3QgJiYgdGhpcy5hdXRvRXhwYW5kU2luZ2xlQ2hpbGRyZW4gJiYgcmVzdWx0ICYmICFpc0NvbGxhcHNpYmxlU3RhdGVVcGRhdGUodXBkYXRlKSAmJiBub2RlLmNvbGxhcHNpYmxlICYmICFub2RlLmNvbGxhcHNlZCAmJiAhdXBkYXRlLnJlY3Vyc2l2ZSkge1xuXHRcdFx0bGV0IG9ubHlWaXNpYmxlQ2hpbGRJbmRleCA9IC0xO1xuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG5vZGUuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgY2hpbGQgPSBub2RlLmNoaWxkcmVuW2ldO1xuXG5cdFx0XHRcdGlmIChjaGlsZC52aXNpYmxlKSB7XG5cdFx0XHRcdFx0aWYgKG9ubHlWaXNpYmxlQ2hpbGRJbmRleCA+IC0xKSB7XG5cdFx0XHRcdFx0XHRvbmx5VmlzaWJsZUNoaWxkSW5kZXggPSAtMTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRvbmx5VmlzaWJsZUNoaWxkSW5kZXggPSBpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAob25seVZpc2libGVDaGlsZEluZGV4ID4gLTEpIHtcblx0XHRcdFx0dGhpcy5fc2V0Q29sbGFwc2VTdGF0ZShbLi4ubG9jYXRpb24sIG9ubHlWaXNpYmxlQ2hpbGRJbmRleF0sIHVwZGF0ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX3NldExpc3ROb2RlQ29sbGFwc2VTdGF0ZShub2RlOiBJSW5kZXhUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4sIGxpc3RJbmRleDogbnVtYmVyLCByZXZlYWxlZDogYm9vbGVhbiwgdXBkYXRlOiBDb2xsYXBzZVN0YXRlVXBkYXRlKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fc2V0Tm9kZUNvbGxhcHNlU3RhdGUobm9kZSwgdXBkYXRlLCBmYWxzZSk7XG5cblx0XHRpZiAoIXJldmVhbGVkIHx8ICFub2RlLnZpc2libGUgfHwgIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHRjb25zdCBwcmV2aW91c1JlbmRlck5vZGVDb3VudCA9IG5vZGUucmVuZGVyTm9kZUNvdW50O1xuXHRcdGNvbnN0IHRvSW5zZXJ0ID0gdGhpcy51cGRhdGVOb2RlQWZ0ZXJDb2xsYXBzZUNoYW5nZShub2RlKTtcblx0XHRjb25zdCBkZWxldGVDb3VudCA9IHByZXZpb3VzUmVuZGVyTm9kZUNvdW50IC0gKGxpc3RJbmRleCA9PT0gLTEgPyAwIDogMSk7XG5cdFx0dGhpcy5fb25EaWRTcGxpY2VSZW5kZXJlZE5vZGVzLmZpcmUoeyBzdGFydDogbGlzdEluZGV4ICsgMSwgZGVsZXRlQ291bnQ6IGRlbGV0ZUNvdW50LCBlbGVtZW50czogdG9JbnNlcnQuc2xpY2UoMSkgfSk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0Tm9kZUNvbGxhcHNlU3RhdGUobm9kZTogSUluZGV4VHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+LCB1cGRhdGU6IENvbGxhcHNlU3RhdGVVcGRhdGUsIGRlZXA6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRsZXQgcmVzdWx0OiBib29sZWFuO1xuXG5cdFx0aWYgKG5vZGUgPT09IHRoaXMucm9vdCkge1xuXHRcdFx0cmVzdWx0ID0gZmFsc2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChpc0NvbGxhcHNpYmxlU3RhdGVVcGRhdGUodXBkYXRlKSkge1xuXHRcdFx0XHRyZXN1bHQgPSBub2RlLmNvbGxhcHNpYmxlICE9PSB1cGRhdGUuY29sbGFwc2libGU7XG5cdFx0XHRcdG5vZGUuY29sbGFwc2libGUgPSB1cGRhdGUuY29sbGFwc2libGU7XG5cdFx0XHR9IGVsc2UgaWYgKCFub2RlLmNvbGxhcHNpYmxlKSB7XG5cdFx0XHRcdHJlc3VsdCA9IGZhbHNlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0ID0gbm9kZS5jb2xsYXBzZWQgIT09IHVwZGF0ZS5jb2xsYXBzZWQ7XG5cdFx0XHRcdG5vZGUuY29sbGFwc2VkID0gdXBkYXRlLmNvbGxhcHNlZDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbGxhcHNlU3RhdGUuZmlyZSh7IG5vZGUsIGRlZXAgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFpc0NvbGxhcHNpYmxlU3RhdGVVcGRhdGUodXBkYXRlKSAmJiB1cGRhdGUucmVjdXJzaXZlKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdFx0cmVzdWx0ID0gdGhpcy5fc2V0Tm9kZUNvbGxhcHNlU3RhdGUoY2hpbGQsIHVwZGF0ZSwgdHJ1ZSkgfHwgcmVzdWx0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRleHBhbmRUbyhsb2NhdGlvbjogbnVtYmVyW10pOiB2b2lkIHtcblx0XHR0aGlzLmV2ZW50QnVmZmVyZXIuYnVmZmVyRXZlbnRzKCgpID0+IHtcblx0XHRcdGxldCBub2RlID0gdGhpcy5nZXRUcmVlTm9kZShsb2NhdGlvbik7XG5cblx0XHRcdHdoaWxlIChub2RlLnBhcmVudCkge1xuXHRcdFx0XHRub2RlID0gbm9kZS5wYXJlbnQ7XG5cdFx0XHRcdGxvY2F0aW9uID0gbG9jYXRpb24uc2xpY2UoMCwgbG9jYXRpb24ubGVuZ3RoIC0gMSk7XG5cblx0XHRcdFx0aWYgKG5vZGUuY29sbGFwc2VkKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2V0Q29sbGFwc2VTdGF0ZShsb2NhdGlvbiwgeyBjb2xsYXBzZWQ6IGZhbHNlLCByZWN1cnNpdmU6IGZhbHNlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRyZWZpbHRlcigpOiB2b2lkIHtcblx0XHRjb25zdCBwcmV2aW91c1JlbmRlck5vZGVDb3VudCA9IHRoaXMucm9vdC5yZW5kZXJOb2RlQ291bnQ7XG5cdFx0Y29uc3QgdG9JbnNlcnQgPSB0aGlzLnVwZGF0ZU5vZGVBZnRlckZpbHRlckNoYW5nZSh0aGlzLnJvb3QpO1xuXHRcdHRoaXMuX29uRGlkU3BsaWNlUmVuZGVyZWROb2Rlcy5maXJlKHsgc3RhcnQ6IDAsIGRlbGV0ZUNvdW50OiBwcmV2aW91c1JlbmRlck5vZGVDb3VudCwgZWxlbWVudHM6IHRvSW5zZXJ0IH0pO1xuXHRcdHRoaXMucmVmaWx0ZXJEZWxheWVyLmNhbmNlbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVUcmVlTm9kZShcblx0XHR0cmVlRWxlbWVudDogSVRyZWVFbGVtZW50PFQ+LFxuXHRcdHBhcmVudDogSUluZGV4VHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+LFxuXHRcdHBhcmVudFZpc2liaWxpdHk6IFRyZWVWaXNpYmlsaXR5LFxuXHRcdHJldmVhbGVkOiBib29sZWFuLFxuXHRcdHRyZWVMaXN0RWxlbWVudHM6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT5bXSxcblx0XHRvbkRpZENyZWF0ZU5vZGU/OiAobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPikgPT4gdm9pZFxuXHQpOiBJSW5kZXhUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4ge1xuXHRcdGNvbnN0IG5vZGU6IElJbmRleFRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiA9IHtcblx0XHRcdHBhcmVudCxcblx0XHRcdGVsZW1lbnQ6IHRyZWVFbGVtZW50LmVsZW1lbnQsXG5cdFx0XHRjaGlsZHJlbjogW10sXG5cdFx0XHRkZXB0aDogcGFyZW50LmRlcHRoICsgMSxcblx0XHRcdHZpc2libGVDaGlsZHJlbkNvdW50OiAwLFxuXHRcdFx0dmlzaWJsZUNoaWxkSW5kZXg6IC0xLFxuXHRcdFx0Y29sbGFwc2libGU6IHR5cGVvZiB0cmVlRWxlbWVudC5jb2xsYXBzaWJsZSA9PT0gJ2Jvb2xlYW4nID8gdHJlZUVsZW1lbnQuY29sbGFwc2libGUgOiAodHlwZW9mIHRyZWVFbGVtZW50LmNvbGxhcHNlZCAhPT0gJ3VuZGVmaW5lZCcpLFxuXHRcdFx0Y29sbGFwc2VkOiB0eXBlb2YgdHJlZUVsZW1lbnQuY29sbGFwc2VkID09PSAndW5kZWZpbmVkJyA/IHRoaXMuY29sbGFwc2VCeURlZmF1bHQgOiB0cmVlRWxlbWVudC5jb2xsYXBzZWQsXG5cdFx0XHRyZW5kZXJOb2RlQ291bnQ6IDEsXG5cdFx0XHR2aXNpYmlsaXR5OiBUcmVlVmlzaWJpbGl0eS5WaXNpYmxlLFxuXHRcdFx0dmlzaWJsZTogdHJ1ZSxcblx0XHRcdGZpbHRlckRhdGE6IHVuZGVmaW5lZFxuXHRcdH07XG5cblx0XHRjb25zdCB2aXNpYmlsaXR5ID0gdGhpcy5fZmlsdGVyTm9kZShub2RlLCBwYXJlbnRWaXNpYmlsaXR5KTtcblx0XHRub2RlLnZpc2liaWxpdHkgPSB2aXNpYmlsaXR5O1xuXG5cdFx0aWYgKHJldmVhbGVkKSB7XG5cdFx0XHR0cmVlTGlzdEVsZW1lbnRzLnB1c2gobm9kZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hpbGRFbGVtZW50cyA9IHRyZWVFbGVtZW50LmNoaWxkcmVuIHx8IEl0ZXJhYmxlLmVtcHR5KCk7XG5cdFx0Y29uc3QgY2hpbGRSZXZlYWxlZCA9IHJldmVhbGVkICYmIHZpc2liaWxpdHkgIT09IFRyZWVWaXNpYmlsaXR5LkhpZGRlbiAmJiAhbm9kZS5jb2xsYXBzZWQ7XG5cblx0XHRsZXQgdmlzaWJsZUNoaWxkcmVuQ291bnQgPSAwO1xuXHRcdGxldCByZW5kZXJOb2RlQ291bnQgPSAxO1xuXG5cdFx0Zm9yIChjb25zdCBlbCBvZiBjaGlsZEVsZW1lbnRzKSB7XG5cdFx0XHRjb25zdCBjaGlsZCA9IHRoaXMuY3JlYXRlVHJlZU5vZGUoZWwsIG5vZGUsIHZpc2liaWxpdHksIGNoaWxkUmV2ZWFsZWQsIHRyZWVMaXN0RWxlbWVudHMsIG9uRGlkQ3JlYXRlTm9kZSk7XG5cdFx0XHRub2RlLmNoaWxkcmVuLnB1c2goY2hpbGQpO1xuXHRcdFx0cmVuZGVyTm9kZUNvdW50ICs9IGNoaWxkLnJlbmRlck5vZGVDb3VudDtcblxuXHRcdFx0aWYgKGNoaWxkLnZpc2libGUpIHtcblx0XHRcdFx0Y2hpbGQudmlzaWJsZUNoaWxkSW5kZXggPSB2aXNpYmxlQ2hpbGRyZW5Db3VudCsrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghdGhpcy5hbGxvd05vbkNvbGxhcHNpYmxlUGFyZW50cykge1xuXHRcdFx0bm9kZS5jb2xsYXBzaWJsZSA9IG5vZGUuY29sbGFwc2libGUgfHwgbm9kZS5jaGlsZHJlbi5sZW5ndGggPiAwO1xuXHRcdH1cblxuXHRcdG5vZGUudmlzaWJsZUNoaWxkcmVuQ291bnQgPSB2aXNpYmxlQ2hpbGRyZW5Db3VudDtcblx0XHRub2RlLnZpc2libGUgPSB2aXNpYmlsaXR5ID09PSBUcmVlVmlzaWJpbGl0eS5SZWN1cnNlID8gdmlzaWJsZUNoaWxkcmVuQ291bnQgPiAwIDogKHZpc2liaWxpdHkgPT09IFRyZWVWaXNpYmlsaXR5LlZpc2libGUpO1xuXG5cdFx0aWYgKCFub2RlLnZpc2libGUpIHtcblx0XHRcdG5vZGUucmVuZGVyTm9kZUNvdW50ID0gMDtcblxuXHRcdFx0aWYgKHJldmVhbGVkKSB7XG5cdFx0XHRcdHRyZWVMaXN0RWxlbWVudHMucG9wKCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICghbm9kZS5jb2xsYXBzZWQpIHtcblx0XHRcdG5vZGUucmVuZGVyTm9kZUNvdW50ID0gcmVuZGVyTm9kZUNvdW50O1xuXHRcdH1cblxuXHRcdG9uRGlkQ3JlYXRlTm9kZT8uKG5vZGUpO1xuXG5cdFx0cmV0dXJuIG5vZGU7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZU5vZGVBZnRlckNvbGxhcHNlQ2hhbmdlKG5vZGU6IElJbmRleFRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPik6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT5bXSB7XG5cdFx0Y29uc3QgcHJldmlvdXNSZW5kZXJOb2RlQ291bnQgPSBub2RlLnJlbmRlck5vZGVDb3VudDtcblx0XHRjb25zdCByZXN1bHQ6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT5bXSA9IFtdO1xuXG5cdFx0dGhpcy5fdXBkYXRlTm9kZUFmdGVyQ29sbGFwc2VDaGFuZ2Uobm9kZSwgcmVzdWx0KTtcblx0XHR0aGlzLl91cGRhdGVBbmNlc3RvcnNSZW5kZXJOb2RlQ291bnQobm9kZS5wYXJlbnQsIHJlc3VsdC5sZW5ndGggLSBwcmV2aW91c1JlbmRlck5vZGVDb3VudCk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlTm9kZUFmdGVyQ29sbGFwc2VDaGFuZ2Uobm9kZTogSUluZGV4VHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+LCByZXN1bHQ6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT5bXSk6IG51bWJlciB7XG5cdFx0aWYgKG5vZGUudmlzaWJsZSA9PT0gZmFsc2UpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXHRcdHJlc3VsdC5wdXNoKG5vZGUpO1xuXHRcdG5vZGUucmVuZGVyTm9kZUNvdW50ID0gMTtcblxuXHRcdGlmICghbm9kZS5jb2xsYXBzZWQpIHtcblx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZS5jaGlsZHJlbikge1xuXHRcdFx0XHRub2RlLnJlbmRlck5vZGVDb3VudCArPSB0aGlzLl91cGRhdGVOb2RlQWZ0ZXJDb2xsYXBzZUNoYW5nZShjaGlsZCwgcmVzdWx0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZVJlbmRlck5vZGVDb3VudC5maXJlKG5vZGUpO1xuXHRcdHJldHVybiBub2RlLnJlbmRlck5vZGVDb3VudDtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTm9kZUFmdGVyRmlsdGVyQ2hhbmdlKG5vZGU6IElJbmRleFRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPik6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT5bXSB7XG5cdFx0Y29uc3QgcHJldmlvdXNSZW5kZXJOb2RlQ291bnQgPSBub2RlLnJlbmRlck5vZGVDb3VudDtcblx0XHRjb25zdCByZXN1bHQ6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT5bXSA9IFtdO1xuXG5cdFx0dGhpcy5fdXBkYXRlTm9kZUFmdGVyRmlsdGVyQ2hhbmdlKG5vZGUsIG5vZGUudmlzaWJsZSA/IFRyZWVWaXNpYmlsaXR5LlZpc2libGUgOiBUcmVlVmlzaWJpbGl0eS5IaWRkZW4sIHJlc3VsdCk7XG5cdFx0dGhpcy5fdXBkYXRlQW5jZXN0b3JzUmVuZGVyTm9kZUNvdW50KG5vZGUucGFyZW50LCByZXN1bHQubGVuZ3RoIC0gcHJldmlvdXNSZW5kZXJOb2RlQ291bnQpO1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZU5vZGVBZnRlckZpbHRlckNoYW5nZShub2RlOiBJSW5kZXhUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4sIHBhcmVudFZpc2liaWxpdHk6IFRyZWVWaXNpYmlsaXR5LCByZXN1bHQ6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT5bXSwgcmV2ZWFsZWQgPSB0cnVlKTogYm9vbGVhbiB7XG5cdFx0bGV0IHZpc2liaWxpdHk6IFRyZWVWaXNpYmlsaXR5O1xuXG5cdFx0aWYgKG5vZGUgIT09IHRoaXMucm9vdCkge1xuXHRcdFx0dmlzaWJpbGl0eSA9IHRoaXMuX2ZpbHRlck5vZGUobm9kZSwgcGFyZW50VmlzaWJpbGl0eSk7XG5cblx0XHRcdGlmICh2aXNpYmlsaXR5ID09PSBUcmVlVmlzaWJpbGl0eS5IaWRkZW4pIHtcblx0XHRcdFx0bm9kZS52aXNpYmxlID0gZmFsc2U7XG5cdFx0XHRcdG5vZGUucmVuZGVyTm9kZUNvdW50ID0gMDtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmV2ZWFsZWQpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2gobm9kZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0U3RhcnRMZW5ndGggPSByZXN1bHQubGVuZ3RoO1xuXHRcdG5vZGUucmVuZGVyTm9kZUNvdW50ID0gbm9kZSA9PT0gdGhpcy5yb290ID8gMCA6IDE7XG5cblx0XHRsZXQgaGFzVmlzaWJsZURlc2NlbmRhbnRzID0gZmFsc2U7XG5cdFx0aWYgKCFub2RlLmNvbGxhcHNlZCB8fCB2aXNpYmlsaXR5ISAhPT0gVHJlZVZpc2liaWxpdHkuSGlkZGVuKSB7XG5cdFx0XHRsZXQgdmlzaWJsZUNoaWxkSW5kZXggPSAwO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdFx0aGFzVmlzaWJsZURlc2NlbmRhbnRzID0gdGhpcy5fdXBkYXRlTm9kZUFmdGVyRmlsdGVyQ2hhbmdlKGNoaWxkLCB2aXNpYmlsaXR5ISwgcmVzdWx0LCByZXZlYWxlZCAmJiAhbm9kZS5jb2xsYXBzZWQpIHx8IGhhc1Zpc2libGVEZXNjZW5kYW50cztcblxuXHRcdFx0XHRpZiAoY2hpbGQudmlzaWJsZSkge1xuXHRcdFx0XHRcdGNoaWxkLnZpc2libGVDaGlsZEluZGV4ID0gdmlzaWJsZUNoaWxkSW5kZXgrKztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRub2RlLnZpc2libGVDaGlsZHJlbkNvdW50ID0gdmlzaWJsZUNoaWxkSW5kZXg7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG5vZGUudmlzaWJsZUNoaWxkcmVuQ291bnQgPSAwO1xuXHRcdH1cblxuXHRcdGlmIChub2RlICE9PSB0aGlzLnJvb3QpIHtcblx0XHRcdG5vZGUudmlzaWJsZSA9IHZpc2liaWxpdHkhID09PSBUcmVlVmlzaWJpbGl0eS5SZWN1cnNlID8gaGFzVmlzaWJsZURlc2NlbmRhbnRzIDogKHZpc2liaWxpdHkhID09PSBUcmVlVmlzaWJpbGl0eS5WaXNpYmxlKTtcblx0XHRcdG5vZGUudmlzaWJpbGl0eSA9IHZpc2liaWxpdHkhO1xuXHRcdH1cblxuXHRcdGlmICghbm9kZS52aXNpYmxlKSB7XG5cdFx0XHRub2RlLnJlbmRlck5vZGVDb3VudCA9IDA7XG5cblx0XHRcdGlmIChyZXZlYWxlZCkge1xuXHRcdFx0XHRyZXN1bHQucG9wKCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICghbm9kZS5jb2xsYXBzZWQpIHtcblx0XHRcdG5vZGUucmVuZGVyTm9kZUNvdW50ICs9IHJlc3VsdC5sZW5ndGggLSByZXN1bHRTdGFydExlbmd0aDtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZVJlbmRlck5vZGVDb3VudC5maXJlKG5vZGUpO1xuXHRcdHJldHVybiBub2RlLnZpc2libGU7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVBbmNlc3RvcnNSZW5kZXJOb2RlQ291bnQobm9kZTogSUluZGV4VHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+IHwgdW5kZWZpbmVkLCBkaWZmOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoZGlmZiA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHdoaWxlIChub2RlKSB7XG5cdFx0XHRub2RlLnJlbmRlck5vZGVDb3VudCArPSBkaWZmO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VSZW5kZXJOb2RlQ291bnQuZmlyZShub2RlKTtcblx0XHRcdG5vZGUgPSBub2RlLnBhcmVudDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9maWx0ZXJOb2RlKG5vZGU6IElJbmRleFRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiwgcGFyZW50VmlzaWJpbGl0eTogVHJlZVZpc2liaWxpdHkpOiBUcmVlVmlzaWJpbGl0eSB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5maWx0ZXIgPyB0aGlzLmZpbHRlci5maWx0ZXIobm9kZS5lbGVtZW50LCBwYXJlbnRWaXNpYmlsaXR5KSA6IFRyZWVWaXNpYmlsaXR5LlZpc2libGU7XG5cblx0XHRpZiAodHlwZW9mIHJlc3VsdCA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRub2RlLmZpbHRlckRhdGEgPSB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4gcmVzdWx0ID8gVHJlZVZpc2liaWxpdHkuVmlzaWJsZSA6IFRyZWVWaXNpYmlsaXR5LkhpZGRlbjtcblx0XHR9IGVsc2UgaWYgKGlzRmlsdGVyUmVzdWx0PFRGaWx0ZXJEYXRhPihyZXN1bHQpKSB7XG5cdFx0XHRub2RlLmZpbHRlckRhdGEgPSByZXN1bHQuZGF0YTtcblx0XHRcdHJldHVybiBnZXRWaXNpYmxlU3RhdGUocmVzdWx0LnZpc2liaWxpdHkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRub2RlLmZpbHRlckRhdGEgPSB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4gZ2V0VmlzaWJsZVN0YXRlKHJlc3VsdCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gY2hlYXBcblx0cHJpdmF0ZSBoYXNUcmVlTm9kZShsb2NhdGlvbjogbnVtYmVyW10sIG5vZGU6IElJbmRleFRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiA9IHRoaXMucm9vdCk6IGJvb2xlYW4ge1xuXHRcdGlmICghbG9jYXRpb24gfHwgbG9jYXRpb24ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBbaW5kZXgsIC4uLnJlc3RdID0gbG9jYXRpb247XG5cblx0XHRpZiAoaW5kZXggPCAwIHx8IGluZGV4ID4gbm9kZS5jaGlsZHJlbi5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5oYXNUcmVlTm9kZShyZXN0LCBub2RlLmNoaWxkcmVuW2luZGV4XSk7XG5cdH1cblxuXHQvLyBjaGVhcFxuXHRwcml2YXRlIGdldFRyZWVOb2RlKGxvY2F0aW9uOiBudW1iZXJbXSwgbm9kZTogSUluZGV4VHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+ID0gdGhpcy5yb290KTogSUluZGV4VHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+IHtcblx0XHRpZiAoIWxvY2F0aW9uIHx8IGxvY2F0aW9uLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIG5vZGU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgW2luZGV4LCAuLi5yZXN0XSA9IGxvY2F0aW9uO1xuXG5cdFx0aWYgKGluZGV4IDwgMCB8fCBpbmRleCA+IG5vZGUuY2hpbGRyZW4ubGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgVHJlZUVycm9yKHRoaXMudXNlciwgJ0ludmFsaWQgdHJlZSBsb2NhdGlvbicpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmdldFRyZWVOb2RlKHJlc3QsIG5vZGUuY2hpbGRyZW5baW5kZXhdKTtcblx0fVxuXG5cdC8vIGV4cGVuc2l2ZVxuXHRwcml2YXRlIGdldFRyZWVOb2RlV2l0aExpc3RJbmRleChsb2NhdGlvbjogbnVtYmVyW10pOiB7IG5vZGU6IElJbmRleFRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPjsgbGlzdEluZGV4OiBudW1iZXI7IHJldmVhbGVkOiBib29sZWFuOyB2aXNpYmxlOiBib29sZWFuIH0ge1xuXHRcdGlmIChsb2NhdGlvbi5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB7IG5vZGU6IHRoaXMucm9vdCwgbGlzdEluZGV4OiAtMSwgcmV2ZWFsZWQ6IHRydWUsIHZpc2libGU6IGZhbHNlIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBwYXJlbnROb2RlLCBsaXN0SW5kZXgsIHJldmVhbGVkLCB2aXNpYmxlIH0gPSB0aGlzLmdldFBhcmVudE5vZGVXaXRoTGlzdEluZGV4KGxvY2F0aW9uKTtcblx0XHRjb25zdCBpbmRleCA9IGxvY2F0aW9uW2xvY2F0aW9uLmxlbmd0aCAtIDFdO1xuXG5cdFx0aWYgKGluZGV4IDwgMCB8fCBpbmRleCA+IHBhcmVudE5vZGUuY2hpbGRyZW4ubGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgVHJlZUVycm9yKHRoaXMudXNlciwgJ0ludmFsaWQgdHJlZSBsb2NhdGlvbicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vZGUgPSBwYXJlbnROb2RlLmNoaWxkcmVuW2luZGV4XTtcblxuXHRcdHJldHVybiB7IG5vZGUsIGxpc3RJbmRleCwgcmV2ZWFsZWQsIHZpc2libGU6IHZpc2libGUgJiYgbm9kZS52aXNpYmxlIH07XG5cdH1cblxuXHRwcml2YXRlIGdldFBhcmVudE5vZGVXaXRoTGlzdEluZGV4KGxvY2F0aW9uOiBudW1iZXJbXSwgbm9kZTogSUluZGV4VHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+ID0gdGhpcy5yb290LCBsaXN0SW5kZXg6IG51bWJlciA9IDAsIHJldmVhbGVkID0gdHJ1ZSwgdmlzaWJsZSA9IHRydWUpOiB7IHBhcmVudE5vZGU6IElJbmRleFRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPjsgbGlzdEluZGV4OiBudW1iZXI7IHJldmVhbGVkOiBib29sZWFuOyB2aXNpYmxlOiBib29sZWFuIH0ge1xuXHRcdGNvbnN0IFtpbmRleCwgLi4ucmVzdF0gPSBsb2NhdGlvbjtcblxuXHRcdGlmIChpbmRleCA8IDAgfHwgaW5kZXggPiBub2RlLmNoaWxkcmVuLmxlbmd0aCkge1xuXHRcdFx0dGhyb3cgbmV3IFRyZWVFcnJvcih0aGlzLnVzZXIsICdJbnZhbGlkIHRyZWUgbG9jYXRpb24nKTtcblx0XHR9XG5cblx0XHQvLyBUT0RPQGpvYW8gcGVyZiFcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGluZGV4OyBpKyspIHtcblx0XHRcdGxpc3RJbmRleCArPSBub2RlLmNoaWxkcmVuW2ldLnJlbmRlck5vZGVDb3VudDtcblx0XHR9XG5cblx0XHRyZXZlYWxlZCA9IHJldmVhbGVkICYmICFub2RlLmNvbGxhcHNlZDtcblx0XHR2aXNpYmxlID0gdmlzaWJsZSAmJiBub2RlLnZpc2libGU7XG5cblx0XHRpZiAocmVzdC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB7IHBhcmVudE5vZGU6IG5vZGUsIGxpc3RJbmRleCwgcmV2ZWFsZWQsIHZpc2libGUgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5nZXRQYXJlbnROb2RlV2l0aExpc3RJbmRleChyZXN0LCBub2RlLmNoaWxkcmVuW2luZGV4XSwgbGlzdEluZGV4ICsgMSwgcmV2ZWFsZWQsIHZpc2libGUpO1xuXHR9XG5cblx0Z2V0Tm9kZShsb2NhdGlvbjogbnVtYmVyW10gPSBbXSk6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4ge1xuXHRcdHJldHVybiB0aGlzLmdldFRyZWVOb2RlKGxvY2F0aW9uKTtcblx0fVxuXG5cdC8vIFRPRE9Aam9hbyBwZXJmIVxuXHRnZXROb2RlTG9jYXRpb24obm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPik6IG51bWJlcltdIHtcblx0XHRjb25zdCBsb2NhdGlvbjogbnVtYmVyW10gPSBbXTtcblx0XHRsZXQgaW5kZXhUcmVlTm9kZSA9IG5vZGUgYXMgSUluZGV4VHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+OyAvLyB0eXBpbmcgd29lc1xuXG5cdFx0d2hpbGUgKGluZGV4VHJlZU5vZGUucGFyZW50KSB7XG5cdFx0XHRsb2NhdGlvbi5wdXNoKGluZGV4VHJlZU5vZGUucGFyZW50LmNoaWxkcmVuLmluZGV4T2YoaW5kZXhUcmVlTm9kZSkpO1xuXHRcdFx0aW5kZXhUcmVlTm9kZSA9IGluZGV4VHJlZU5vZGUucGFyZW50O1xuXHRcdH1cblxuXHRcdHJldHVybiBsb2NhdGlvbi5yZXZlcnNlKCk7XG5cdH1cblxuXHRnZXRQYXJlbnROb2RlTG9jYXRpb24obG9jYXRpb246IG51bWJlcltdKTogbnVtYmVyW10gfCB1bmRlZmluZWQge1xuXHRcdGlmIChsb2NhdGlvbi5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIGlmIChsb2NhdGlvbi5sZW5ndGggPT09IDEpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRhaWwobG9jYXRpb24pWzBdO1xuXHRcdH1cblx0fVxuXG5cdGdldEZpcnN0RWxlbWVudENoaWxkKGxvY2F0aW9uOiBudW1iZXJbXSk6IFQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG5vZGUgPSB0aGlzLmdldFRyZWVOb2RlKGxvY2F0aW9uKTtcblxuXHRcdGlmIChub2RlLmNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gbm9kZS5jaGlsZHJlblswXS5lbGVtZW50O1xuXHR9XG5cblx0Z2V0TGFzdEVsZW1lbnRBbmNlc3Rvcihsb2NhdGlvbjogbnVtYmVyW10gPSBbXSk6IFQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG5vZGUgPSB0aGlzLmdldFRyZWVOb2RlKGxvY2F0aW9uKTtcblxuXHRcdGlmIChub2RlLmNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fZ2V0TGFzdEVsZW1lbnRBbmNlc3Rvcihub2RlKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldExhc3RFbGVtZW50QW5jZXN0b3Iobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPik6IFQge1xuXHRcdGlmIChub2RlLmNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIG5vZGUuZWxlbWVudDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fZ2V0TGFzdEVsZW1lbnRBbmNlc3Rvcihub2RlLmNoaWxkcmVuW25vZGUuY2hpbGRyZW4ubGVuZ3RoIC0gMV0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUF5SixXQUFXLHNCQUFzQjtBQUMxTCxTQUFTLFFBQVEsWUFBWTtBQUM3QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBZ0IscUJBQXFCO0FBQzlDLFNBQVMsZ0JBQWdCO0FBaUJsQixTQUFTLGVBQWtCLEtBQStDO0FBQ2hGLFNBQU8sQ0FBQyxDQUFDLE9BQWtDLElBQUssZUFBZTtBQUNoRTtBQUVPLFNBQVMsZ0JBQWdCLFlBQXNEO0FBQ3JGLFVBQVEsWUFBWTtBQUFBLElBQ25CLEtBQUs7QUFBTSxhQUFPLGVBQWU7QUFBQSxJQUNqQyxLQUFLO0FBQU8sYUFBTyxlQUFlO0FBQUEsSUFDbEM7QUFBUyxhQUFPO0FBQUEsRUFDakI7QUFDRDtBQWdEQSxTQUFTLHlCQUF5QixRQUErRDtBQUNoRyxTQUFPLGlCQUFpQjtBQUN6QjtBQUVPLE1BQU0sZUFBMEg7QUFBQSxFQTBCdEksWUFDUyxNQUNSLGFBQ0EsVUFBa0QsQ0FBQyxHQUNsRDtBQUhPO0FBekJULFNBQVMsVUFBVSxDQUFDO0FBR3BCLFNBQVEsZ0JBQWdCLElBQUksY0FBYztBQUUxQyxTQUFpQixvQkFBb0IsSUFBSSxRQUErQztBQUN4RixTQUFTLG1CQUFtQixLQUFLLGtCQUFrQjtBQUVuRCxTQUFpQiw0QkFBNEIsSUFBSSxRQUE2QztBQUM5RixTQUFTLDJCQUEyQixLQUFLLDBCQUEwQjtBQUVuRSxTQUFpQiw0QkFBNEIsSUFBSSxRQUFtRDtBQUNwRyxTQUFTLDJCQUE2RSxLQUFLLGNBQWMsVUFBVSxLQUFLLDBCQUEwQixLQUFLO0FBRXZKLFNBQWlCLDhCQUE4QixJQUFJLFFBQW1DO0FBQ3RGLFNBQVMsNkJBQStELEtBQUssY0FBYyxVQUFVLEtBQUssNEJBQTRCLEtBQUs7QUFPM0ksU0FBaUIsa0JB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
