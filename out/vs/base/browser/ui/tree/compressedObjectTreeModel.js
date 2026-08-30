import { getVisibleState, isFilterResult } from "./indexTreeModel.js";
import { ObjectTreeModel } from "./objectTreeModel.js";
import { TreeError, WeakMapper } from "./tree.js";
import { equals } from "../../../common/arrays.js";
import { Event } from "../../../common/event.js";
import { Iterable } from "../../../common/iterator.js";
function noCompress(element) {
  const elements = [element.element];
  const incompressible = element.incompressible || false;
  return {
    element: { elements, incompressible },
    children: Iterable.map(Iterable.from(element.children), noCompress),
    collapsible: element.collapsible,
    collapsed: element.collapsed
  };
}
function compress(element) {
  const elements = [element.element];
  const incompressible = element.incompressible || false;
  let childrenIterator;
  let children;
  while (true) {
    [children, childrenIterator] = Iterable.consume(Iterable.from(element.children), 2);
    if (children.length !== 1) {
      break;
    }
    if (children[0].incompressible) {
      break;
    }
    element = children[0];
    elements.push(element.element);
  }
  return {
    element: { elements, incompressible },
    children: Iterable.map(Iterable.concat(children, childrenIterator), compress),
    collapsible: element.collapsible,
    collapsed: element.collapsed
  };
}
function _decompress(element, index = 0) {
  let children;
  if (index < element.element.elements.length - 1) {
    children = [_decompress(element, index + 1)];
  } else {
    children = Iterable.map(Iterable.from(element.children), (el) => _decompress(el, 0));
  }
  if (index === 0 && element.element.incompressible) {
    return {
      element: element.element.elements[index],
      children,
      incompressible: true,
      collapsible: element.collapsible,
      collapsed: element.collapsed
    };
  }
  return {
    element: element.element.elements[index],
    children,
    collapsible: element.collapsible,
    collapsed: element.collapsed
  };
}
function decompress(element) {
  return _decompress(element, 0);
}
function splice(treeElement, element, children) {
  if (treeElement.element === element) {
    return { ...treeElement, children };
  }
  return { ...treeElement, children: Iterable.map(Iterable.from(treeElement.children), (e) => splice(e, element, children)) };
}
const wrapIdentityProvider = (base) => ({
  getId(node) {
    return node.elements.map((e) => base.getId(e).toString()).join("\0");
  },
  getGroupId: base.getGroupId ? (node) => {
    return base.getGroupId(node.elements[node.elements.length - 1]);
  } : void 0
});
class CompressedObjectTreeModel {
  constructor(user, options = {}) {
    this.user = user;
    this.rootRef = null;
    this.nodes = /* @__PURE__ */ new Map();
    this.model = new ObjectTreeModel(user, options);
    this.enabled = typeof options.compressionEnabled === "undefined" ? true : options.compressionEnabled;
    this.identityProvider = options.identityProvider;
  }
  get onDidSpliceRenderedNodes() {
    return this.model.onDidSpliceRenderedNodes;
  }
  get onDidSpliceModel() {
    return this.model.onDidSpliceModel;
  }
  get onDidChangeCollapseState() {
    return this.model.onDidChangeCollapseState;
  }
  get onDidChangeRenderNodeCount() {
    return this.model.onDidChangeRenderNodeCount;
  }
  get size() {
    return this.nodes.size;
  }
  setChildren(element, children = Iterable.empty(), options) {
    const diffIdentityProvider = options.diffIdentityProvider && wrapIdentityProvider(options.diffIdentityProvider);
    if (element === null) {
      const compressedChildren = Iterable.map(children, this.enabled ? compress : noCompress);
      this._setChildren(null, compressedChildren, { diffIdentityProvider, diffDepth: Infinity });
      return;
    }
    const compressedNode = this.nodes.get(element);
    if (!compressedNode) {
      throw new TreeError(this.user, "Unknown compressed tree node");
    }
    const node = this.model.getNode(compressedNode);
    const compressedParentNode = this.model.getParentNodeLocation(compressedNode);
    const parent = this.model.getNode(compressedParentNode);
    const decompressedElement = decompress(node);
    const splicedElement = splice(decompressedElement, element, children);
    const recompressedElement = (this.enabled ? compress : noCompress)(splicedElement);
    const elementComparator = options.diffIdentityProvider ? ((a, b) => options.diffIdentityProvider.getId(a) === options.diffIdentityProvider.getId(b)) : void 0;
    if (equals(recompressedElement.element.elements, node.element.elements, elementComparator)) {
      this._setChildren(compressedNode, recompressedElement.children || Iterable.empty(), { diffIdentityProvider, diffDepth: 1 });
      return;
    }
    const parentChildren = parent.children.map((child) => child === node ? recompressedElement : child);
    this._setChildren(parent.element, parentChildren, {
      diffIdentityProvider,
      diffDepth: node.depth - parent.depth
    });
  }
  isCompressionEnabled() {
    return this.enabled;
  }
  setCompressionEnabled(enabled) {
    if (enabled === this.enabled) {
      return;
    }
    this.enabled = enabled;
    const root = this.model.getNode();
    const rootChildren = root.children;
    const decompressedRootChildren = Iterable.map(rootChildren, decompress);
    const recompressedRootChildren = Iterable.map(decompressedRootChildren, enabled ? compress : noCompress);
    this._setChildren(null, recompressedRootChildren, {
      diffIdentityProvider: this.identityProvider,
      diffDepth: Infinity
    });
  }
  _setChildren(node, children, options) {
    const insertedElements = /* @__PURE__ */ new Set();
    const onDidCreateNode = (node2) => {
      for (const element of node2.element.elements) {
        insertedElements.add(element);
        this.nodes.set(element, node2.element);
      }
    };
    const onDidDeleteNode = (node2) => {
      for (const element of node2.element.elements) {
        if (!insertedElements.has(element)) {
          this.nodes.delete(element);
        }
      }
    };
    this.model.setChildren(node, children, { ...options, onDidCreateNode, onDidDeleteNode });
  }
  has(element) {
    return this.nodes.has(element);
  }
  getListIndex(location) {
    const node = this.getCompressedNode(location);
    return this.model.getListIndex(node);
  }
  getListRenderCount(location) {
    const node = this.getCompressedNode(location);
    return this.model.getListRenderCount(node);
  }
  getNode(location) {
    if (typeof location === "undefined") {
      return this.model.getNode();
    }
    const node = this.getCompressedNode(location);
    return this.model.getNode(node);
  }
  // TODO: review this
  getNodeLocation(node) {
    const compressedNode = this.model.getNodeLocation(node);
    if (compressedNode === null) {
      return null;
    }
    return compressedNode.elements[compressedNode.elements.length - 1];
  }
  // TODO: review this
  getParentNodeLocation(location) {
    const compressedNode = this.getCompressedNode(location);
    const parentNode = this.model.getParentNodeLocation(compressedNode);
    if (parentNode === null) {
      return null;
    }
    return parentNode.elements[parentNode.elements.length - 1];
  }
  getFirstElementChild(location) {
    const compressedNode = this.getCompressedNode(location);
    return this.model.getFirstElementChild(compressedNode);
  }
  getLastElementAncestor(location) {
    const compressedNode = typeof location === "undefined" ? void 0 : this.getCompressedNode(location);
    return this.model.getLastElementAncestor(compressedNode);
  }
  isCollapsible(location) {
    const compressedNode = this.getCompressedNode(location);
    return this.model.isCollapsible(compressedNode);
  }
  setCollapsible(location, collapsible) {
    const compressedNode = this.getCompressedNode(location);
    return this.model.setCollapsible(compressedNode, collapsible);
  }
  isCollapsed(location) {
    const compressedNode = this.getCompressedNode(location);
    return this.model.isCollapsed(compressedNode);
  }
  setCollapsed(location, collapsed, recursive) {
    const compressedNode = this.getCompressedNode(location);
    return this.model.setCollapsed(compressedNode, collapsed, recursive);
  }
  expandTo(location) {
    const compressedNode = this.getCompressedNode(location);
    this.model.expandTo(compressedNode);
  }
  rerender(location) {
    const compressedNode = this.getCompressedNode(location);
    this.model.rerender(compressedNode);
  }
  refilter() {
    this.model.refilter();
  }
  resort(location = null, recursive = true) {
    const compressedNode = this.getCompressedNode(location);
    this.model.resort(compressedNode, recursive);
  }
  getCompressedNode(element) {
    if (element === null) {
      return null;
    }
    const node = this.nodes.get(element);
    if (!node) {
      throw new TreeError(this.user, `Tree element not found: ${element}`);
    }
    return node;
  }
}
const DefaultElementMapper = (elements) => elements[elements.length - 1];
class CompressedTreeNodeWrapper {
  constructor(unwrapper, node) {
    this.unwrapper = unwrapper;
    this.node = node;
  }
  get element() {
    return this.node.element === null ? null : this.unwrapper(this.node.element);
  }
  get children() {
    return this.node.children.map((node) => new CompressedTreeNodeWrapper(this.unwrapper, node));
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
function mapOptions(compressedNodeUnwrapper, options) {
  return {
    ...options,
    identityProvider: options.identityProvider && {
      getId(node) {
        return options.identityProvider.getId(compressedNodeUnwrapper(node));
      },
      getGroupId: options.identityProvider.getGroupId ? (node) => {
        return options.identityProvider.getGroupId(compressedNodeUnwrapper(node));
      } : void 0
    },
    sorter: options.sorter && {
      compare(node, otherNode) {
        return options.sorter.compare(node.elements[0], otherNode.elements[0]);
      }
    },
    filter: options.filter && {
      filter(node, parentVisibility) {
        const elements = node.elements;
        for (let i = 0; i < elements.length - 1; i++) {
          const result = options.filter.filter(elements[i], parentVisibility);
          parentVisibility = getVisibleState(isFilterResult(result) ? result.visibility : result);
        }
        return options.filter.filter(elements[elements.length - 1], parentVisibility);
      }
    }
  };
}
class CompressibleObjectTreeModel {
  constructor(user, options = {}) {
    this.rootRef = null;
    this.elementMapper = options.elementMapper || DefaultElementMapper;
    const compressedNodeUnwrapper = (node) => this.elementMapper(node.elements);
    this.nodeMapper = new WeakMapper((node) => new CompressedTreeNodeWrapper(compressedNodeUnwrapper, node));
    this.model = new CompressedObjectTreeModel(user, mapOptions(compressedNodeUnwrapper, options));
  }
  get onDidSpliceModel() {
    return Event.map(this.model.onDidSpliceModel, ({ insertedNodes, deletedNodes }) => ({
      insertedNodes: insertedNodes.map((node) => this.nodeMapper.map(node)),
      deletedNodes: deletedNodes.map((node) => this.nodeMapper.map(node))
    }));
  }
  get onDidSpliceRenderedNodes() {
    return Event.map(this.model.onDidSpliceRenderedNodes, ({ start, deleteCount, elements }) => ({
      start,
      deleteCount,
      elements: elements.map((node) => this.nodeMapper.map(node))
    }));
  }
  get onDidChangeCollapseState() {
    return Event.map(this.model.onDidChangeCollapseState, ({ node, deep }) => ({
      node: this.nodeMapper.map(node),
      deep
    }));
  }
  get onDidChangeRenderNodeCount() {
    return Event.map(this.model.onDidChangeRenderNodeCount, (node) => this.nodeMapper.map(node));
  }
  setChildren(element, children = Iterable.empty(), options = {}) {
    this.model.setChildren(element, children, options);
  }
  isCompressionEnabled() {
    return this.model.isCompressionEnabled();
  }
  setCompressionEnabled(enabled) {
    this.model.setCompressionEnabled(enabled);
  }
  has(location) {
    return this.model.has(location);
  }
  getListIndex(location) {
    return this.model.getListIndex(location);
  }
  getListRenderCount(location) {
    return this.model.getListRenderCount(location);
  }
  getNode(location) {
    return this.nodeMapper.map(this.model.getNode(location));
  }
  getNodeLocation(node) {
    return node.element;
  }
  getParentNodeLocation(location) {
    return this.model.getParentNodeLocation(location);
  }
  getFirstElementChild(location) {
    const result = this.model.getFirstElementChild(location);
    if (result === null || typeof result === "undefined") {
      return result;
    }
    return this.elementMapper(result.elements);
  }
  getLastElementAncestor(location) {
    const result = this.model.getLastElementAncestor(location);
    if (result === null || typeof result === "undefined") {
      return result;
    }
    return this.elementMapper(result.elements);
  }
  isCollapsible(location) {
    return this.model.isCollapsible(location);
  }
  setCollapsible(location, collapsed) {
    return this.model.setCollapsible(location, collapsed);
  }
  isCollapsed(location) {
    return this.model.isCollapsed(location);
  }
  setCollapsed(location, collapsed, recursive) {
    return this.model.setCollapsed(location, collapsed, recursive);
  }
  expandTo(location) {
    return this.model.expandTo(location);
  }
  rerender(location) {
    return this.model.rerender(location);
  }
  refilter() {
    return this.model.refilter();
  }
  resort(element = null, recursive = true) {
    return this.model.resort(element, recursive);
  }
  getCompressedTreeNode(location = null) {
    return this.model.getNode(location);
  }
}
export {
  CompressedObjectTreeModel,
  CompressibleObjectTreeModel,
  DefaultElementMapper,
  compress,
  decompress
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFx1aVxcdHJlZVxcY29tcHJlc3NlZE9iamVjdFRyZWVNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElJZGVudGl0eVByb3ZpZGVyLCBOb3RTZWxlY3RhYmxlR3JvdXBJZFR5cGUgfSBmcm9tICcuLi9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgZ2V0VmlzaWJsZVN0YXRlLCBJSW5kZXhUcmVlTW9kZWxTcGxpY2VPcHRpb25zLCBpc0ZpbHRlclJlc3VsdCB9IGZyb20gJy4vaW5kZXhUcmVlTW9kZWwuanMnO1xuaW1wb3J0IHsgSU9iamVjdFRyZWVNb2RlbCwgSU9iamVjdFRyZWVNb2RlbE9wdGlvbnMsIElPYmplY3RUcmVlTW9kZWxTZXRDaGlsZHJlbk9wdGlvbnMsIE9iamVjdFRyZWVNb2RlbCB9IGZyb20gJy4vb2JqZWN0VHJlZU1vZGVsLmpzJztcbmltcG9ydCB7IElDb2xsYXBzZVN0YXRlQ2hhbmdlRXZlbnQsIElPYmplY3RUcmVlRWxlbWVudCwgSVRyZWVMaXN0U3BsaWNlRGF0YSwgSVRyZWVNb2RlbCwgSVRyZWVNb2RlbFNwbGljZUV2ZW50LCBJVHJlZU5vZGUsIFRyZWVFcnJvciwgVHJlZUZpbHRlclJlc3VsdCwgVHJlZVZpc2liaWxpdHksIFdlYWtNYXBwZXIgfSBmcm9tICcuL3RyZWUuanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5cbi8vIEV4cG9ydGVkIG9ubHkgZm9yIHRlc3QgcmVhc29ucywgZG8gbm90IHVzZSBkaXJlY3RseVxuZXhwb3J0IGludGVyZmFjZSBJQ29tcHJlc3NlZFRyZWVFbGVtZW50PFQ+IGV4dGVuZHMgSU9iamVjdFRyZWVFbGVtZW50PFQ+IHtcblx0cmVhZG9ubHkgY2hpbGRyZW4/OiBJdGVyYWJsZTxJQ29tcHJlc3NlZFRyZWVFbGVtZW50PFQ+Pjtcblx0cmVhZG9ubHkgaW5jb21wcmVzc2libGU/OiBib29sZWFuO1xufVxuXG4vLyBFeHBvcnRlZCBvbmx5IGZvciB0ZXN0IHJlYXNvbnMsIGRvIG5vdCB1c2UgZGlyZWN0bHlcbmV4cG9ydCBpbnRlcmZhY2UgSUNvbXByZXNzZWRUcmVlTm9kZTxUPiB7XG5cdHJlYWRvbmx5IGVsZW1lbnRzOiBUW107XG5cdHJlYWRvbmx5IGluY29tcHJlc3NpYmxlOiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBub0NvbXByZXNzPFQ+KGVsZW1lbnQ6IElDb21wcmVzc2VkVHJlZUVsZW1lbnQ8VD4pOiBJQ29tcHJlc3NlZFRyZWVFbGVtZW50PElDb21wcmVzc2VkVHJlZU5vZGU8VD4+IHtcblx0Y29uc3QgZWxlbWVudHMgPSBbZWxlbWVudC5lbGVtZW50XTtcblx0Y29uc3QgaW5jb21wcmVzc2libGUgPSBlbGVtZW50LmluY29tcHJlc3NpYmxlIHx8IGZhbHNlO1xuXG5cdHJldHVybiB7XG5cdFx0ZWxlbWVudDogeyBlbGVtZW50cywgaW5jb21wcmVzc2libGUgfSxcblx0XHRjaGlsZHJlbjogSXRlcmFibGUubWFwKEl0ZXJhYmxlLmZyb20oZWxlbWVudC5jaGlsZHJlbiksIG5vQ29tcHJlc3MpLFxuXHRcdGNvbGxhcHNpYmxlOiBlbGVtZW50LmNvbGxhcHNpYmxlLFxuXHRcdGNvbGxhcHNlZDogZWxlbWVudC5jb2xsYXBzZWRcblx0fTtcbn1cblxuLy8gRXhwb3J0ZWQgb25seSBmb3IgdGVzdCByZWFzb25zLCBkbyBub3QgdXNlIGRpcmVjdGx5XG5leHBvcnQgZnVuY3Rpb24gY29tcHJlc3M8VD4oZWxlbWVudDogSUNvbXByZXNzZWRUcmVlRWxlbWVudDxUPik6IElDb21wcmVzc2VkVHJlZUVsZW1lbnQ8SUNvbXByZXNzZWRUcmVlTm9kZTxUPj4ge1xuXHRjb25zdCBlbGVtZW50cyA9IFtlbGVtZW50LmVsZW1lbnRdO1xuXHRjb25zdCBpbmNvbXByZXNzaWJsZSA9IGVsZW1lbnQuaW5jb21wcmVzc2libGUgfHwgZmFsc2U7XG5cblx0bGV0IGNoaWxkcmVuSXRlcmF0b3I6IEl0ZXJhYmxlPElDb21wcmVzc2VkVHJlZUVsZW1lbnQ8VD4+O1xuXHRsZXQgY2hpbGRyZW46IElDb21wcmVzc2VkVHJlZUVsZW1lbnQ8VD5bXTtcblxuXHR3aGlsZSAodHJ1ZSkge1xuXHRcdFtjaGlsZHJlbiwgY2hpbGRyZW5JdGVyYXRvcl0gPSBJdGVyYWJsZS5jb25zdW1lKEl0ZXJhYmxlLmZyb20oZWxlbWVudC5jaGlsZHJlbiksIDIpO1xuXG5cdFx0aWYgKGNoaWxkcmVuLmxlbmd0aCAhPT0gMSkge1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0aWYgKGNoaWxkcmVuWzBdLmluY29tcHJlc3NpYmxlKSB7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRlbGVtZW50ID0gY2hpbGRyZW5bMF07XG5cdFx0ZWxlbWVudHMucHVzaChlbGVtZW50LmVsZW1lbnQpO1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHRlbGVtZW50OiB7IGVsZW1lbnRzLCBpbmNvbXByZXNzaWJsZSB9LFxuXHRcdGNoaWxkcmVuOiBJdGVyYWJsZS5tYXAoSXRlcmFibGUuY29uY2F0KGNoaWxkcmVuLCBjaGlsZHJlbkl0ZXJhdG9yKSwgY29tcHJlc3MpLFxuXHRcdGNvbGxhcHNpYmxlOiBlbGVtZW50LmNvbGxhcHNpYmxlLFxuXHRcdGNvbGxhcHNlZDogZWxlbWVudC5jb2xsYXBzZWRcblx0fTtcbn1cblxuZnVuY3Rpb24gX2RlY29tcHJlc3M8VD4oZWxlbWVudDogSUNvbXByZXNzZWRUcmVlRWxlbWVudDxJQ29tcHJlc3NlZFRyZWVOb2RlPFQ+PiwgaW5kZXggPSAwKTogSUNvbXByZXNzZWRUcmVlRWxlbWVudDxUPiB7XG5cdGxldCBjaGlsZHJlbjogSXRlcmFibGU8SUNvbXByZXNzZWRUcmVlRWxlbWVudDxUPj47XG5cblx0aWYgKGluZGV4IDwgZWxlbWVudC5lbGVtZW50LmVsZW1lbnRzLmxlbmd0aCAtIDEpIHtcblx0XHRjaGlsZHJlbiA9IFtfZGVjb21wcmVzcyhlbGVtZW50LCBpbmRleCArIDEpXTtcblx0fSBlbHNlIHtcblx0XHRjaGlsZHJlbiA9IEl0ZXJhYmxlLm1hcChJdGVyYWJsZS5mcm9tKGVsZW1lbnQuY2hpbGRyZW4pLCBlbCA9PiBfZGVjb21wcmVzcyhlbCwgMCkpO1xuXHR9XG5cblx0aWYgKGluZGV4ID09PSAwICYmIGVsZW1lbnQuZWxlbWVudC5pbmNvbXByZXNzaWJsZSkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRlbGVtZW50OiBlbGVtZW50LmVsZW1lbnQuZWxlbWVudHNbaW5kZXhdLFxuXHRcdFx0Y2hpbGRyZW4sXG5cdFx0XHRpbmNvbXByZXNzaWJsZTogdHJ1ZSxcblx0XHRcdGNvbGxhcHNpYmxlOiBlbGVtZW50LmNvbGxhcHNpYmxlLFxuXHRcdFx0Y29sbGFwc2VkOiBlbGVtZW50LmNvbGxhcHNlZFxuXHRcdH07XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdGVsZW1lbnQ6IGVsZW1lbnQuZWxlbWVudC5lbGVtZW50c1tpbmRleF0sXG5cdFx0Y2hpbGRyZW4sXG5cdFx0Y29sbGFwc2libGU6IGVsZW1lbnQuY29sbGFwc2libGUsXG5cdFx0Y29sbGFwc2VkOiBlbGVtZW50LmNvbGxhcHNlZFxuXHR9O1xufVxuXG4vLyBFeHBvcnRlZCBvbmx5IGZvciB0ZXN0IHJlYXNvbnMsIGRvIG5vdCB1c2UgZGlyZWN0bHlcbmV4cG9ydCBmdW5jdGlvbiBkZWNvbXByZXNzPFQ+KGVsZW1lbnQ6IElDb21wcmVzc2VkVHJlZUVsZW1lbnQ8SUNvbXByZXNzZWRUcmVlTm9kZTxUPj4pOiBJQ29tcHJlc3NlZFRyZWVFbGVtZW50PFQ+IHtcblx0cmV0dXJuIF9kZWNvbXByZXNzKGVsZW1lbnQsIDApO1xufVxuXG5mdW5jdGlvbiBzcGxpY2U8VD4odHJlZUVsZW1lbnQ6IElDb21wcmVzc2VkVHJlZUVsZW1lbnQ8VD4sIGVsZW1lbnQ6IFQsIGNoaWxkcmVuOiBJdGVyYWJsZTxJQ29tcHJlc3NlZFRyZWVFbGVtZW50PFQ+Pik6IElDb21wcmVzc2VkVHJlZUVsZW1lbnQ8VD4ge1xuXHRpZiAodHJlZUVsZW1lbnQuZWxlbWVudCA9PT0gZWxlbWVudCkge1xuXHRcdHJldHVybiB7IC4uLnRyZWVFbGVtZW50LCBjaGlsZHJlbiB9O1xuXHR9XG5cblx0cmV0dXJuIHsgLi4udHJlZUVsZW1lbnQsIGNoaWxkcmVuOiBJdGVyYWJsZS5tYXAoSXRlcmFibGUuZnJvbSh0cmVlRWxlbWVudC5jaGlsZHJlbiksIGUgPT4gc3BsaWNlKGUsIGVsZW1lbnQsIGNoaWxkcmVuKSkgfTtcbn1cblxuaW50ZXJmYWNlIElDb21wcmVzc2VkT2JqZWN0VHJlZU1vZGVsT3B0aW9uczxULCBURmlsdGVyRGF0YT4gZXh0ZW5kcyBJT2JqZWN0VHJlZU1vZGVsT3B0aW9uczxJQ29tcHJlc3NlZFRyZWVOb2RlPFQ+LCBURmlsdGVyRGF0YT4ge1xuXHRyZWFkb25seSBjb21wcmVzc2lvbkVuYWJsZWQ/OiBib29sZWFuO1xufVxuXG5jb25zdCB3cmFwSWRlbnRpdHlQcm92aWRlciA9IDxUPihiYXNlOiBJSWRlbnRpdHlQcm92aWRlcjxUPik6IElJZGVudGl0eVByb3ZpZGVyPElDb21wcmVzc2VkVHJlZU5vZGU8VD4+ID0+ICh7XG5cdGdldElkKG5vZGUpIHtcblx0XHRyZXR1cm4gbm9kZS5lbGVtZW50cy5tYXAoZSA9PiBiYXNlLmdldElkKGUpLnRvU3RyaW5nKCkpLmpvaW4oJ1xcMCcpO1xuXHR9LFxuXHRnZXRHcm91cElkOiBiYXNlLmdldEdyb3VwSWQgPyAobm9kZTogSUNvbXByZXNzZWRUcmVlTm9kZTxUPik6IG51bWJlciB8IE5vdFNlbGVjdGFibGVHcm91cElkVHlwZSA9PiB7XG5cdFx0cmV0dXJuIGJhc2UuZ2V0R3JvdXBJZCEobm9kZS5lbGVtZW50c1tub2RlLmVsZW1lbnRzLmxlbmd0aCAtIDFdKTtcblx0fSA6IHVuZGVmaW5lZFxufSk7XG5cbi8vIEV4cG9ydGVkIG9ubHkgZm9yIHRlc3QgcmVhc29ucywgZG8gbm90IHVzZSBkaXJlY3RseVxuZXhwb3J0IGNsYXNzIENvbXByZXNzZWRPYmplY3RUcmVlTW9kZWw8VCwgVEZpbHRlckRhdGEgPSB2b2lkPiBpbXBsZW1lbnRzIElUcmVlTW9kZWw8SUNvbXByZXNzZWRUcmVlTm9kZTxUPiB8IG51bGwsIFRGaWx0ZXJEYXRhLCBUIHwgbnVsbD4ge1xuXG5cdHJlYWRvbmx5IHJvb3RSZWYgPSBudWxsO1xuXG5cdGdldCBvbkRpZFNwbGljZVJlbmRlcmVkTm9kZXMoKTogRXZlbnQ8SVRyZWVMaXN0U3BsaWNlRGF0YTxJQ29tcHJlc3NlZFRyZWVOb2RlPFQ+IHwgbnVsbCwgVEZpbHRlckRhdGE+PiB7IHJldHVybiB0aGlzLm1vZGVsLm9uRGlkU3BsaWNlUmVuZGVyZWROb2RlczsgfVxuXHRnZXQgb25EaWRTcGxpY2VNb2RlbCgpOiBFdmVudDxJVHJlZU1vZGVsU3BsaWNlRXZlbnQ8SUNvbXByZXNzZWRUcmVlTm9kZTxUPiB8IG51bGwsIFRGaWx0ZXJEYXRhPj4geyByZXR1cm4gdGhpcy5tb2RlbC5vbkRpZFNwbGljZU1vZGVsOyB9XG5cdGdldCBvbkRpZENoYW5nZUNvbGxhcHNlU3RhdGUoKTogRXZlbnQ8SUNvbGxhcHNlU3RhdGVDaGFuZ2VFdmVudDxJQ29tcHJlc3NlZFRyZWVOb2RlPFQ+LCBURmlsdGVyRGF0YT4+IHsgcmV0dXJuIHRoaXMubW9kZWwub25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlOyB9XG5cdGdldCBvbkRpZENoYW5nZVJlbmRlck5vZGVDb3VudCgpOiBFdmVudDxJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxUPiwgVEZpbHRlckRhdGE+PiB7IHJldHVybiB0aGlzLm1vZGVsLm9uRGlkQ2hhbmdlUmVuZGVyTm9kZUNvdW50OyB9XG5cblx0cHJpdmF0ZSBtb2RlbDogT2JqZWN0VHJlZU1vZGVsPElDb21wcmVzc2VkVHJlZU5vZGU8VD4sIFRGaWx0ZXJEYXRhPjtcblx0cHJpdmF0ZSBub2RlcyA9IG5ldyBNYXA8VCB8IG51bGwsIElDb21wcmVzc2VkVHJlZU5vZGU8VD4+KCk7XG5cdHByaXZhdGUgZW5hYmxlZDogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBpZGVudGl0eVByb3ZpZGVyPzogSUlkZW50aXR5UHJvdmlkZXI8SUNvbXByZXNzZWRUcmVlTm9kZTxUPj47XG5cblx0Z2V0IHNpemUoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMubm9kZXMuc2l6ZTsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgdXNlcjogc3RyaW5nLFxuXHRcdG9wdGlvbnM6IElDb21wcmVzc2VkT2JqZWN0VHJlZU1vZGVsT3B0aW9uczxULCBURmlsdGVyRGF0YT4gPSB7fVxuXHQpIHtcblx0XHR0aGlzLm1vZGVsID0gbmV3IE9iamVjdFRyZWVNb2RlbCh1c2VyLCBvcHRpb25zKTtcblx0XHR0aGlzLmVuYWJsZWQgPSB0eXBlb2Ygb3B0aW9ucy5jb21wcmVzc2lvbkVuYWJsZWQgPT09ICd1bmRlZmluZWQnID8gdHJ1ZSA6IG9wdGlvbnMuY29tcHJlc3Npb25FbmFibGVkO1xuXHRcdHRoaXMuaWRlbnRpdHlQcm92aWRlciA9IG9wdGlvbnMuaWRlbnRpdHlQcm92aWRlcjtcblx0fVxuXG5cdHNldENoaWxkcmVuKFxuXHRcdGVsZW1lbnQ6IFQgfCBudWxsLFxuXHRcdGNoaWxkcmVuOiBJdGVyYWJsZTxJQ29tcHJlc3NlZFRyZWVFbGVtZW50PFQ+PiA9IEl0ZXJhYmxlLmVtcHR5KCksXG5cdFx0b3B0aW9uczogSU9iamVjdFRyZWVNb2RlbFNldENoaWxkcmVuT3B0aW9uczxULCBURmlsdGVyRGF0YT4sXG5cdCk6IHZvaWQge1xuXHRcdC8vIERpZmZzIG11c3QgYmUgZGVlcCwgc2luY2UgdGhlIGNvbXByZXNzaW9uIGNhbiBhZmZlY3QgbmVzdGVkIGVsZW1lbnRzLlxuXHRcdC8vIEBzZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xMTQyMzcjaXNzdWVjb21tZW50LTc1OTQyNTAzNFxuXG5cdFx0Y29uc3QgZGlmZklkZW50aXR5UHJvdmlkZXIgPSBvcHRpb25zLmRpZmZJZGVudGl0eVByb3ZpZGVyICYmIHdyYXBJZGVudGl0eVByb3ZpZGVyKG9wdGlvbnMuZGlmZklkZW50aXR5UHJvdmlkZXIpO1xuXHRcdGlmIChlbGVtZW50ID09PSBudWxsKSB7XG5cdFx0XHRjb25zdCBjb21wcmVzc2VkQ2hpbGRyZW4gPSBJdGVyYWJsZS5tYXAoY2hpbGRyZW4sIHRoaXMuZW5hYmxlZCA/IGNvbXByZXNzIDogbm9Db21wcmVzcyk7XG5cdFx0XHR0aGlzLl9zZXRDaGlsZHJlbihudWxsLCBjb21wcmVzc2VkQ2hpbGRyZW4sIHsgZGlmZklkZW50aXR5UHJvdmlkZXIsIGRpZmZEZXB0aDogSW5maW5pdHkgfSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29tcHJlc3NlZE5vZGUgPSB0aGlzLm5vZGVzLmdldChlbGVtZW50KTtcblxuXHRcdGlmICghY29tcHJlc3NlZE5vZGUpIHtcblx0XHRcdHRocm93IG5ldyBUcmVlRXJyb3IodGhpcy51c2VyLCAnVW5rbm93biBjb21wcmVzc2VkIHRyZWUgbm9kZScpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vZGUgPSB0aGlzLm1vZGVsLmdldE5vZGUoY29tcHJlc3NlZE5vZGUpIGFzIElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPFQ+LCBURmlsdGVyRGF0YT47XG5cdFx0Y29uc3QgY29tcHJlc3NlZFBhcmVudE5vZGUgPSB0aGlzLm1vZGVsLmdldFBhcmVudE5vZGVMb2NhdGlvbihjb21wcmVzc2VkTm9kZSk7XG5cdFx0Y29uc3QgcGFyZW50ID0gdGhpcy5tb2RlbC5nZXROb2RlKGNvbXByZXNzZWRQYXJlbnROb2RlKSBhcyBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxUPiwgVEZpbHRlckRhdGE+O1xuXG5cdFx0Y29uc3QgZGVjb21wcmVzc2VkRWxlbWVudCA9IGRlY29tcHJlc3Mobm9kZSk7XG5cdFx0Y29uc3Qgc3BsaWNlZEVsZW1lbnQgPSBzcGxpY2UoZGVjb21wcmVzc2VkRWxlbWVudCwgZWxlbWVudCwgY2hpbGRyZW4pO1xuXHRcdGNvbnN0IHJlY29tcHJlc3NlZEVsZW1lbnQgPSAodGhpcy5lbmFibGVkID8gY29tcHJlc3MgOiBub0NvbXByZXNzKShzcGxpY2VkRWxlbWVudCk7XG5cblx0XHQvLyBJZiB0aGUgcmVjb21wcmVzc2VkIG5vZGUgaXMgaWRlbnRpY2FsIHRvIHRoZSBvcmlnaW5hbCwganVzdCBzZXQgaXRzIGNoaWxkcmVuLlxuXHRcdC8vIFNhdmVzIHdvcmsgYW5kIGNodXJuIGRpZmZpbmcgdGhlIHBhcmVudCBlbGVtZW50LlxuXHRcdGNvbnN0IGVsZW1lbnRDb21wYXJhdG9yID0gb3B0aW9ucy5kaWZmSWRlbnRpdHlQcm92aWRlclxuXHRcdFx0PyAoKGE6IFQsIGI6IFQpID0+IG9wdGlvbnMuZGlmZklkZW50aXR5UHJvdmlkZXIhLmdldElkKGEpID09PSBvcHRpb25zLmRpZmZJZGVudGl0eVByb3ZpZGVyIS5nZXRJZChiKSlcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGlmIChlcXVhbHMocmVjb21wcmVzc2VkRWxlbWVudC5lbGVtZW50LmVsZW1lbnRzLCBub2RlLmVsZW1lbnQuZWxlbWVudHMsIGVsZW1lbnRDb21wYXJhdG9yKSkge1xuXHRcdFx0dGhpcy5fc2V0Q2hpbGRyZW4oY29tcHJlc3NlZE5vZGUsIHJlY29tcHJlc3NlZEVsZW1lbnQuY2hpbGRyZW4gfHwgSXRlcmFibGUuZW1wdHkoKSwgeyBkaWZmSWRlbnRpdHlQcm92aWRlciwgZGlmZkRlcHRoOiAxIH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhcmVudENoaWxkcmVuID0gcGFyZW50LmNoaWxkcmVuXG5cdFx0XHQubWFwKGNoaWxkID0+IGNoaWxkID09PSBub2RlID8gcmVjb21wcmVzc2VkRWxlbWVudCA6IGNoaWxkKTtcblxuXHRcdHRoaXMuX3NldENoaWxkcmVuKHBhcmVudC5lbGVtZW50LCBwYXJlbnRDaGlsZHJlbiwge1xuXHRcdFx0ZGlmZklkZW50aXR5UHJvdmlkZXIsXG5cdFx0XHRkaWZmRGVwdGg6IG5vZGUuZGVwdGggLSBwYXJlbnQuZGVwdGgsXG5cdFx0fSk7XG5cdH1cblxuXHRpc0NvbXByZXNzaW9uRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5lbmFibGVkO1xuXHR9XG5cblx0c2V0Q29tcHJlc3Npb25FbmFibGVkKGVuYWJsZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoZW5hYmxlZCA9PT0gdGhpcy5lbmFibGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5lbmFibGVkID0gZW5hYmxlZDtcblxuXHRcdGNvbnN0IHJvb3QgPSB0aGlzLm1vZGVsLmdldE5vZGUoKTtcblx0XHRjb25zdCByb290Q2hpbGRyZW4gPSByb290LmNoaWxkcmVuIGFzIElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPFQ+PltdO1xuXHRcdGNvbnN0IGRlY29tcHJlc3NlZFJvb3RDaGlsZHJlbiA9IEl0ZXJhYmxlLm1hcChyb290Q2hpbGRyZW4sIGRlY29tcHJlc3MpO1xuXHRcdGNvbnN0IHJlY29tcHJlc3NlZFJvb3RDaGlsZHJlbiA9IEl0ZXJhYmxlLm1hcChkZWNvbXByZXNzZWRSb290Q2hpbGRyZW4sIGVuYWJsZWQgPyBjb21wcmVzcyA6IG5vQ29tcHJlc3MpO1xuXG5cdFx0Ly8gaXQgc2hvdWxkIGJlIHNhZmUgdG8gYWx3YXlzIHVzZSBkZWVwIGRpZmYgbW9kZSBoZXJlIGlmIGFuIGlkZW50aXR5XG5cdFx0Ly8gcHJvdmlkZXIgaXMgYXZhaWxhYmxlLCBzaW5jZSB3ZSBrbm93IHRoZSByYXcgbm9kZXMgYXJlIHVuY2hhbmdlZC5cblx0XHR0aGlzLl9zZXRDaGlsZHJlbihudWxsLCByZWNvbXByZXNzZWRSb290Q2hpbGRyZW4sIHtcblx0XHRcdGRpZmZJZGVudGl0eVByb3ZpZGVyOiB0aGlzLmlkZW50aXR5UHJvdmlkZXIsXG5cdFx0XHRkaWZmRGVwdGg6IEluZmluaXR5LFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0Q2hpbGRyZW4oXG5cdFx0bm9kZTogSUNvbXByZXNzZWRUcmVlTm9kZTxUPiB8IG51bGwsXG5cdFx0Y2hpbGRyZW46IEl0ZXJhYmxlPElPYmplY3RUcmVlRWxlbWVudDxJQ29tcHJlc3NlZFRyZWVOb2RlPFQ+Pj4sXG5cdFx0b3B0aW9uczogSUluZGV4VHJlZU1vZGVsU3BsaWNlT3B0aW9uczxJQ29tcHJlc3NlZFRyZWVOb2RlPFQ+LCBURmlsdGVyRGF0YT4sXG5cdCk6IHZvaWQge1xuXHRcdGNvbnN0IGluc2VydGVkRWxlbWVudHMgPSBuZXcgU2V0PFQgfCBudWxsPigpO1xuXHRcdGNvbnN0IG9uRGlkQ3JlYXRlTm9kZSA9IChub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxUPiwgVEZpbHRlckRhdGE+KSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2Ygbm9kZS5lbGVtZW50LmVsZW1lbnRzKSB7XG5cdFx0XHRcdGluc2VydGVkRWxlbWVudHMuYWRkKGVsZW1lbnQpO1xuXHRcdFx0XHR0aGlzLm5vZGVzLnNldChlbGVtZW50LCBub2RlLmVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBvbkRpZERlbGV0ZU5vZGUgPSAobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8VD4sIFRGaWx0ZXJEYXRhPikgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIG5vZGUuZWxlbWVudC5lbGVtZW50cykge1xuXHRcdFx0XHRpZiAoIWluc2VydGVkRWxlbWVudHMuaGFzKGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0dGhpcy5ub2Rlcy5kZWxldGUoZWxlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGhpcy5tb2RlbC5zZXRDaGlsZHJlbihub2RlLCBjaGlsZHJlbiwgeyAuLi5vcHRpb25zLCBvbkRpZENyZWF0ZU5vZGUsIG9uRGlkRGVsZXRlTm9kZSB9KTtcblx0fVxuXG5cdGhhcyhlbGVtZW50OiBUIHwgbnVsbCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm5vZGVzLmhhcyhlbGVtZW50KTtcblx0fVxuXG5cdGdldExpc3RJbmRleChsb2NhdGlvbjogVCB8IG51bGwpOiBudW1iZXIge1xuXHRcdGNvbnN0IG5vZGUgPSB0aGlzLmdldENvbXByZXNzZWROb2RlKGxvY2F0aW9uKTtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5nZXRMaXN0SW5kZXgobm9kZSk7XG5cdH1cblxuXHRnZXRMaXN0UmVuZGVyQ291bnQobG9jYXRpb246IFQgfCBudWxsKTogbnVtYmVyIHtcblx0XHRjb25zdCBub2RlID0gdGhpcy5nZXRDb21wcmVzc2VkTm9kZShsb2NhdGlvbik7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuZ2V0TGlzdFJlbmRlckNvdW50KG5vZGUpO1xuXHR9XG5cblx0Z2V0Tm9kZShsb2NhdGlvbj86IFQgfCBudWxsIHwgdW5kZWZpbmVkKTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8VD4gfCBudWxsLCBURmlsdGVyRGF0YT4ge1xuXHRcdGlmICh0eXBlb2YgbG9jYXRpb24gPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5tb2RlbC5nZXROb2RlKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm9kZSA9IHRoaXMuZ2V0Q29tcHJlc3NlZE5vZGUobG9jYXRpb24pO1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmdldE5vZGUobm9kZSk7XG5cdH1cblxuXHQvLyBUT0RPOiByZXZpZXcgdGhpc1xuXHRnZXROb2RlTG9jYXRpb24obm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8VD4sIFRGaWx0ZXJEYXRhPik6IFQgfCBudWxsIHtcblx0XHRjb25zdCBjb21wcmVzc2VkTm9kZSA9IHRoaXMubW9kZWwuZ2V0Tm9kZUxvY2F0aW9uKG5vZGUpO1xuXG5cdFx0aWYgKGNvbXByZXNzZWROb2RlID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gY29tcHJlc3NlZE5vZGUuZWxlbWVudHNbY29tcHJlc3NlZE5vZGUuZWxlbWVudHMubGVuZ3RoIC0gMV07XG5cdH1cblxuXHQvLyBUT0RPOiByZXZpZXcgdGhpc1xuXHRnZXRQYXJlbnROb2RlTG9jYXRpb24obG9jYXRpb246IFQgfCBudWxsKTogVCB8IG51bGwge1xuXHRcdGNvbnN0IGNvbXByZXNzZWROb2RlID0gdGhpcy5nZXRDb21wcmVzc2VkTm9kZShsb2NhdGlvbik7XG5cdFx0Y29uc3QgcGFyZW50Tm9kZSA9IHRoaXMubW9kZWwuZ2V0UGFyZW50Tm9kZUxvY2F0aW9uKGNvbXByZXNzZWROb2RlKTtcblxuXHRcdGlmIChwYXJlbnROb2RlID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gcGFyZW50Tm9kZS5lbGVtZW50c1twYXJlbnROb2RlLmVsZW1lbnRzLmxlbmd0aCAtIDFdO1xuXHR9XG5cblx0Z2V0Rmlyc3RFbGVtZW50Q2hpbGQobG9jYXRpb246IFQgfCBudWxsKTogSUNvbXByZXNzZWRUcmVlTm9kZTxUPiB8IG51bGwgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNvbXByZXNzZWROb2RlID0gdGhpcy5nZXRDb21wcmVzc2VkTm9kZShsb2NhdGlvbik7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuZ2V0Rmlyc3RFbGVtZW50Q2hpbGQoY29tcHJlc3NlZE5vZGUpO1xuXHR9XG5cblx0Z2V0TGFzdEVsZW1lbnRBbmNlc3Rvcihsb2NhdGlvbj86IFQgfCBudWxsIHwgdW5kZWZpbmVkKTogSUNvbXByZXNzZWRUcmVlTm9kZTxUPiB8IG51bGwgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNvbXByZXNzZWROb2RlID0gdHlwZW9mIGxvY2F0aW9uID09PSAndW5kZWZpbmVkJyA/IHVuZGVmaW5lZCA6IHRoaXMuZ2V0Q29tcHJlc3NlZE5vZGUobG9jYXRpb24pO1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmdldExhc3RFbGVtZW50QW5jZXN0b3IoY29tcHJlc3NlZE5vZGUpO1xuXHR9XG5cblx0aXNDb2xsYXBzaWJsZShsb2NhdGlvbjogVCB8IG51bGwpOiBib29sZWFuIHtcblx0XHRjb25zdCBjb21wcmVzc2VkTm9kZSA9IHRoaXMuZ2V0Q29tcHJlc3NlZE5vZGUobG9jYXRpb24pO1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmlzQ29sbGFwc2libGUoY29tcHJlc3NlZE5vZGUpO1xuXHR9XG5cblx0c2V0Q29sbGFwc2libGUobG9jYXRpb246IFQgfCBudWxsLCBjb2xsYXBzaWJsZT86IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRjb25zdCBjb21wcmVzc2VkTm9kZSA9IHRoaXMuZ2V0Q29tcHJlc3NlZE5vZGUobG9jYXRpb24pO1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLnNldENvbGxhcHNpYmxlKGNvbXByZXNzZWROb2RlLCBjb2xsYXBzaWJsZSk7XG5cdH1cblxuXHRpc0NvbGxhcHNlZChsb2NhdGlvbjogVCB8IG51bGwpOiBib29sZWFuIHtcblx0XHRjb25zdCBjb21wcmVzc2VkTm9kZSA9IHRoaXMuZ2V0Q29tcHJlc3NlZE5vZGUobG9jYXRpb24pO1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmlzQ29sbGFwc2VkKGNvbXByZXNzZWROb2RlKTtcblx0fVxuXG5cdHNldENvbGxhcHNlZChsb2NhdGlvbjogVCB8IG51bGwsIGNvbGxhcHNlZD86IGJvb2xlYW4gfCB1bmRlZmluZWQsIHJlY3Vyc2l2ZT86IGJvb2xlYW4gfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRjb25zdCBjb21wcmVzc2VkTm9kZSA9IHRoaXMuZ2V0Q29tcHJlc3NlZE5vZGUobG9jYXRpb24pO1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLnNldENvbGxhcHNlZChjb21wcmVzc2VkTm9kZSwgY29sbGFwc2VkLCByZWN1cnNpdmUpO1xuXHR9XG5cblx0ZXhwYW5kVG8obG9jYXRpb246IFQgfCBudWxsKTogdm9pZCB7XG5cdFx0Y29uc3QgY29tcHJlc3NlZE5vZGUgPSB0aGlzLmdldENvbXByZXNzZWROb2RlKGxvY2F0aW9uKTtcblx0XHR0aGlzLm1vZGVsLmV4cGFuZFRvKGNvbXByZXNzZWROb2RlKTtcblx0fVxuXG5cdHJlcmVuZGVyKGxvY2F0aW9uOiBUIHwgbnVsbCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbXByZXNzZWROb2RlID0gdGhpcy5nZXRDb21wcmVzc2VkTm9kZShsb2NhdGlvbik7XG5cdFx0dGhpcy5tb2RlbC5yZXJlbmRlcihjb21wcmVzc2VkTm9kZSk7XG5cdH1cblxuXHRyZWZpbHRlcigpOiB2b2lkIHtcblx0XHR0aGlzLm1vZGVsLnJlZmlsdGVyKCk7XG5cdH1cblxuXHRyZXNvcnQobG9jYXRpb246IFQgfCBudWxsID0gbnVsbCwgcmVjdXJzaXZlID0gdHJ1ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbXByZXNzZWROb2RlID0gdGhpcy5nZXRDb21wcmVzc2VkTm9kZShsb2NhdGlvbik7XG5cdFx0dGhpcy5tb2RlbC5yZXNvcnQoY29tcHJlc3NlZE5vZGUsIHJlY3Vyc2l2ZSk7XG5cdH1cblxuXHRnZXRDb21wcmVzc2VkTm9kZShlbGVtZW50OiBUIHwgbnVsbCk6IElDb21wcmVzc2VkVHJlZU5vZGU8VD4gfCBudWxsIHtcblx0XHRpZiAoZWxlbWVudCA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm9kZSA9IHRoaXMubm9kZXMuZ2V0KGVsZW1lbnQpO1xuXG5cdFx0aWYgKCFub2RlKSB7XG5cdFx0XHR0aHJvdyBuZXcgVHJlZUVycm9yKHRoaXMudXNlciwgYFRyZWUgZWxlbWVudCBub3QgZm91bmQ6ICR7ZWxlbWVudH1gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbm9kZTtcblx0fVxufVxuXG4vLyBDb21wcmVzc2libGUgT2JqZWN0IFRyZWVcblxuZXhwb3J0IHR5cGUgRWxlbWVudE1hcHBlcjxUPiA9IChlbGVtZW50czogVFtdKSA9PiBUO1xuZXhwb3J0IGNvbnN0IERlZmF1bHRFbGVtZW50TWFwcGVyOiBFbGVtZW50TWFwcGVyPHVua25vd24+ID0gZWxlbWVudHMgPT4gZWxlbWVudHNbZWxlbWVudHMubGVuZ3RoIC0gMV07XG5cbmV4cG9ydCB0eXBlIENvbXByZXNzZWROb2RlVW53cmFwcGVyPFQ+ID0gKG5vZGU6IElDb21wcmVzc2VkVHJlZU5vZGU8VD4pID0+IFQ7XG50eXBlIENvbXByZXNzZWROb2RlV2Vha01hcHBlcjxULCBURmlsdGVyRGF0YT4gPSBXZWFrTWFwcGVyPElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPFQ+IHwgbnVsbCwgVEZpbHRlckRhdGE+LCBJVHJlZU5vZGU8VCB8IG51bGwsIFRGaWx0ZXJEYXRhPj47XG5cbmNsYXNzIENvbXByZXNzZWRUcmVlTm9kZVdyYXBwZXI8VCwgVEZpbHRlckRhdGE+IGltcGxlbWVudHMgSVRyZWVOb2RlPFQgfCBudWxsLCBURmlsdGVyRGF0YT4ge1xuXG5cdGdldCBlbGVtZW50KCk6IFQgfCBudWxsIHsgcmV0dXJuIHRoaXMubm9kZS5lbGVtZW50ID09PSBudWxsID8gbnVsbCA6IHRoaXMudW53cmFwcGVyKHRoaXMubm9kZS5lbGVtZW50KTsgfVxuXHRnZXQgY2hpbGRyZW4oKTogSVRyZWVOb2RlPFQgfCBudWxsLCBURmlsdGVyRGF0YT5bXSB7IHJldHVybiB0aGlzLm5vZGUuY2hpbGRyZW4ubWFwKG5vZGUgPT4gbmV3IENvbXByZXNzZWRUcmVlTm9kZVdyYXBwZXIodGhpcy51bndyYXBwZXIsIG5vZGUpKTsgfVxuXHRnZXQgZGVwdGgoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMubm9kZS5kZXB0aDsgfVxuXHRnZXQgdmlzaWJsZUNoaWxkcmVuQ291bnQoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMubm9kZS52aXNpYmxlQ2hpbGRyZW5Db3VudDsgfVxuXHRnZXQgdmlzaWJsZUNoaWxkSW5kZXgoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMubm9kZS52aXNpYmxlQ2hpbGRJbmRleDsgfVxuXHRnZXQgY29sbGFwc2libGUoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLm5vZGUuY29sbGFwc2libGU7IH1cblx0Z2V0IGNvbGxhcHNlZCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMubm9kZS5jb2xsYXBzZWQ7IH1cblx0Z2V0IHZpc2libGUoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLm5vZGUudmlzaWJsZTsgfVxuXHRnZXQgZmlsdGVyRGF0YSgpOiBURmlsdGVyRGF0YSB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLm5vZGUuZmlsdGVyRGF0YTsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgdW53cmFwcGVyOiBDb21wcmVzc2VkTm9kZVVud3JhcHBlcjxUPixcblx0XHRwcml2YXRlIG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPFQ+IHwgbnVsbCwgVEZpbHRlckRhdGE+XG5cdCkgeyB9XG59XG5cbmZ1bmN0aW9uIG1hcE9wdGlvbnM8VCwgVEZpbHRlckRhdGE+KGNvbXByZXNzZWROb2RlVW53cmFwcGVyOiBDb21wcmVzc2VkTm9kZVVud3JhcHBlcjxUPiwgb3B0aW9uczogSUNvbXByZXNzaWJsZU9iamVjdFRyZWVNb2RlbE9wdGlvbnM8VCwgVEZpbHRlckRhdGE+KTogSUNvbXByZXNzZWRPYmplY3RUcmVlTW9kZWxPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPiB7XG5cdHJldHVybiB7XG5cdFx0Li4ub3B0aW9ucyxcblx0XHRpZGVudGl0eVByb3ZpZGVyOiBvcHRpb25zLmlkZW50aXR5UHJvdmlkZXIgJiYge1xuXHRcdFx0Z2V0SWQobm9kZTogSUNvbXByZXNzZWRUcmVlTm9kZTxUPik6IHsgdG9TdHJpbmcoKTogc3RyaW5nIH0ge1xuXHRcdFx0XHRyZXR1cm4gb3B0aW9ucy5pZGVudGl0eVByb3ZpZGVyIS5nZXRJZChjb21wcmVzc2VkTm9kZVVud3JhcHBlcihub2RlKSk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0R3JvdXBJZDogb3B0aW9ucy5pZGVudGl0eVByb3ZpZGVyIS5nZXRHcm91cElkID8gKG5vZGU6IElDb21wcmVzc2VkVHJlZU5vZGU8VD4pOiBudW1iZXIgfCBOb3RTZWxlY3RhYmxlR3JvdXBJZFR5cGUgPT4ge1xuXHRcdFx0XHRyZXR1cm4gb3B0aW9ucy5pZGVudGl0eVByb3ZpZGVyIS5nZXRHcm91cElkIShjb21wcmVzc2VkTm9kZVVud3JhcHBlcihub2RlKSk7XG5cdFx0XHR9IDogdW5kZWZpbmVkXG5cdFx0fSxcblx0XHRzb3J0ZXI6IG9wdGlvbnMuc29ydGVyICYmIHtcblx0XHRcdGNvbXBhcmUobm9kZTogSUNvbXByZXNzZWRUcmVlTm9kZTxUPiwgb3RoZXJOb2RlOiBJQ29tcHJlc3NlZFRyZWVOb2RlPFQ+KTogbnVtYmVyIHtcblx0XHRcdFx0cmV0dXJuIG9wdGlvbnMuc29ydGVyIS5jb21wYXJlKG5vZGUuZWxlbWVudHNbMF0sIG90aGVyTm9kZS5lbGVtZW50c1swXSk7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRmaWx0ZXI6IG9wdGlvbnMuZmlsdGVyICYmIHtcblx0XHRcdGZpbHRlcihub2RlOiBJQ29tcHJlc3NlZFRyZWVOb2RlPFQ+LCBwYXJlbnRWaXNpYmlsaXR5OiBUcmVlVmlzaWJpbGl0eSk6IFRyZWVGaWx0ZXJSZXN1bHQ8VEZpbHRlckRhdGE+IHtcblx0XHRcdFx0Y29uc3QgZWxlbWVudHMgPSBub2RlLmVsZW1lbnRzO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGVsZW1lbnRzLmxlbmd0aCAtIDE7IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IG9wdGlvbnMuZmlsdGVyIS5maWx0ZXIoZWxlbWVudHNbaV0sIHBhcmVudFZpc2liaWxpdHkpO1xuXHRcdFx0XHRcdHBhcmVudFZpc2liaWxpdHkgPSBnZXRWaXNpYmxlU3RhdGUoaXNGaWx0ZXJSZXN1bHQocmVzdWx0KSA/IHJlc3VsdC52aXNpYmlsaXR5IDogcmVzdWx0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gb3B0aW9ucy5maWx0ZXIhLmZpbHRlcihlbGVtZW50c1tlbGVtZW50cy5sZW5ndGggLSAxXSwgcGFyZW50VmlzaWJpbGl0eSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb21wcmVzc2libGVPYmplY3RUcmVlTW9kZWxPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPiBleHRlbmRzIElPYmplY3RUcmVlTW9kZWxPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPiB7XG5cdHJlYWRvbmx5IGNvbXByZXNzaW9uRW5hYmxlZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGVsZW1lbnRNYXBwZXI/OiBFbGVtZW50TWFwcGVyPFQ+O1xufVxuXG5leHBvcnQgY2xhc3MgQ29tcHJlc3NpYmxlT2JqZWN0VHJlZU1vZGVsPFQsIFRGaWx0ZXJEYXRhID0gdm9pZD4gaW1wbGVtZW50cyBJT2JqZWN0VHJlZU1vZGVsPFQsIFRGaWx0ZXJEYXRhPiB7XG5cblx0cmVhZG9ubHkgcm9vdFJlZiA9IG51bGw7XG5cblx0Z2V0IG9uRGlkU3BsaWNlTW9kZWwoKTogRXZlbnQ8SVRyZWVNb2RlbFNwbGljZUV2ZW50PFQgfCBudWxsLCBURmlsdGVyRGF0YT4+IHtcblx0XHRyZXR1cm4gRXZlbnQubWFwKHRoaXMubW9kZWwub25EaWRTcGxpY2VNb2RlbCwgKHsgaW5zZXJ0ZWROb2RlcywgZGVsZXRlZE5vZGVzIH0pID0+ICh7XG5cdFx0XHRpbnNlcnRlZE5vZGVzOiBpbnNlcnRlZE5vZGVzLm1hcChub2RlID0+IHRoaXMubm9kZU1hcHBlci5tYXAobm9kZSkpLFxuXHRcdFx0ZGVsZXRlZE5vZGVzOiBkZWxldGVkTm9kZXMubWFwKG5vZGUgPT4gdGhpcy5ub2RlTWFwcGVyLm1hcChub2RlKSksXG5cdFx0fSkpO1xuXHR9XG5cblx0Z2V0IG9uRGlkU3BsaWNlUmVuZGVyZWROb2RlcygpOiBFdmVudDxJVHJlZUxpc3RTcGxpY2VEYXRhPFQgfCBudWxsLCBURmlsdGVyRGF0YT4+IHtcblx0XHRyZXR1cm4gRXZlbnQubWFwKHRoaXMubW9kZWwub25EaWRTcGxpY2VSZW5kZXJlZE5vZGVzLCAoeyBzdGFydCwgZGVsZXRlQ291bnQsIGVsZW1lbnRzIH0pID0+ICh7XG5cdFx0XHRzdGFydCxcblx0XHRcdGRlbGV0ZUNvdW50LFxuXHRcdFx0ZWxlbWVudHM6IGVsZW1lbnRzLm1hcChub2RlID0+IHRoaXMubm9kZU1hcHBlci5tYXAobm9kZSkpXG5cdFx0fSkpO1xuXHR9XG5cblx0Z2V0IG9uRGlkQ2hhbmdlQ29sbGFwc2VTdGF0ZSgpOiBFdmVudDxJQ29sbGFwc2VTdGF0ZUNoYW5nZUV2ZW50PFQgfCBudWxsLCBURmlsdGVyRGF0YT4+IHtcblx0XHRyZXR1cm4gRXZlbnQubWFwKHRoaXMubW9kZWwub25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlLCAoeyBub2RlLCBkZWVwIH0pID0+ICh7XG5cdFx0XHRub2RlOiB0aGlzLm5vZGVNYXBwZXIubWFwKG5vZGUpLFxuXHRcdFx0ZGVlcFxuXHRcdH0pKTtcblx0fVxuXG5cdGdldCBvbkRpZENoYW5nZVJlbmRlck5vZGVDb3VudCgpOiBFdmVudDxJVHJlZU5vZGU8VCB8IG51bGwsIFRGaWx0ZXJEYXRhPj4ge1xuXHRcdHJldHVybiBFdmVudC5tYXAodGhpcy5tb2RlbC5vbkRpZENoYW5nZVJlbmRlck5vZGVDb3VudCwgbm9kZSA9PiB0aGlzLm5vZGVNYXBwZXIubWFwKG5vZGUpKTtcblx0fVxuXG5cdHByaXZhdGUgZWxlbWVudE1hcHBlcjogRWxlbWVudE1hcHBlcjxUPjtcblx0cHJpdmF0ZSBub2RlTWFwcGVyOiBDb21wcmVzc2VkTm9kZVdlYWtNYXBwZXI8VCwgVEZpbHRlckRhdGE+O1xuXHRwcml2YXRlIG1vZGVsOiBDb21wcmVzc2VkT2JqZWN0VHJlZU1vZGVsPFQsIFRGaWx0ZXJEYXRhPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR1c2VyOiBzdHJpbmcsXG5cdFx0b3B0aW9uczogSUNvbXByZXNzaWJsZU9iamVjdFRyZWVNb2RlbE9wdGlvbnM8VCwgVEZpbHRlckRhdGE+ID0ge31cblx0KSB7XG5cdFx0dGhpcy5lbGVtZW50TWFwcGVyID0gb3B0aW9ucy5lbGVtZW50TWFwcGVyIHx8IChEZWZhdWx0RWxlbWVudE1hcHBlciBhcyBFbGVtZW50TWFwcGVyPFQ+KTtcblx0XHRjb25zdCBjb21wcmVzc2VkTm9kZVVud3JhcHBlcjogQ29tcHJlc3NlZE5vZGVVbndyYXBwZXI8VD4gPSBub2RlID0+IHRoaXMuZWxlbWVudE1hcHBlcihub2RlLmVsZW1lbnRzKTtcblx0XHR0aGlzLm5vZGVNYXBwZXIgPSBuZXcgV2Vha01hcHBlcihub2RlID0+IG5ldyBDb21wcmVzc2VkVHJlZU5vZGVXcmFwcGVyKGNvbXByZXNzZWROb2RlVW53cmFwcGVyLCBub2RlKSk7XG5cblx0XHR0aGlzLm1vZGVsID0gbmV3IENvbXByZXNzZWRPYmplY3RUcmVlTW9kZWwodXNlciwgbWFwT3B0aW9ucyhjb21wcmVzc2VkTm9kZVVud3JhcHBlciwgb3B0aW9ucykpO1xuXHR9XG5cblx0c2V0Q2hpbGRyZW4oXG5cdFx0ZWxlbWVudDogVCB8IG51bGwsXG5cdFx0Y2hpbGRyZW46IEl0ZXJhYmxlPElDb21wcmVzc2VkVHJlZUVsZW1lbnQ8VD4+ID0gSXRlcmFibGUuZW1wdHkoKSxcblx0XHRvcHRpb25zOiBJT2JqZWN0VHJlZU1vZGVsU2V0Q2hpbGRyZW5PcHRpb25zPFQsIFRGaWx0ZXJEYXRhPiA9IHt9LFxuXHQpOiB2b2lkIHtcblx0XHR0aGlzLm1vZGVsLnNldENoaWxkcmVuKGVsZW1lbnQsIGNoaWxkcmVuLCBvcHRpb25zKTtcblx0fVxuXG5cdGlzQ29tcHJlc3Npb25FbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmlzQ29tcHJlc3Npb25FbmFibGVkKCk7XG5cdH1cblxuXHRzZXRDb21wcmVzc2lvbkVuYWJsZWQoZW5hYmxlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMubW9kZWwuc2V0Q29tcHJlc3Npb25FbmFibGVkKGVuYWJsZWQpO1xuXHR9XG5cblx0aGFzKGxvY2F0aW9uOiBUIHwgbnVsbCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmhhcyhsb2NhdGlvbik7XG5cdH1cblxuXHRnZXRMaXN0SW5kZXgobG9jYXRpb246IFQgfCBudWxsKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5nZXRMaXN0SW5kZXgobG9jYXRpb24pO1xuXHR9XG5cblx0Z2V0TGlzdFJlbmRlckNvdW50KGxvY2F0aW9uOiBUIHwgbnVsbCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuZ2V0TGlzdFJlbmRlckNvdW50KGxvY2F0aW9uKTtcblx0fVxuXG5cdGdldE5vZGUobG9jYXRpb24/OiBUIHwgbnVsbCB8IHVuZGVmaW5lZCk6IElUcmVlTm9kZTxUIHwgbnVsbCwgVEZpbHRlckRhdGE+IHtcblx0XHRyZXR1cm4gdGhpcy5ub2RlTWFwcGVyLm1hcCh0aGlzLm1vZGVsLmdldE5vZGUobG9jYXRpb24pKTtcblx0fVxuXG5cdGdldE5vZGVMb2NhdGlvbihub2RlOiBJVHJlZU5vZGU8VCB8IG51bGwsIFRGaWx0ZXJEYXRhPik6IFQgfCBudWxsIHtcblx0XHRyZXR1cm4gbm9kZS5lbGVtZW50O1xuXHR9XG5cblx0Z2V0UGFyZW50Tm9kZUxvY2F0aW9uKGxvY2F0aW9uOiBUIHwgbnVsbCk6IFQgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5nZXRQYXJlbnROb2RlTG9jYXRpb24obG9jYXRpb24pO1xuXHR9XG5cblx0Z2V0Rmlyc3RFbGVtZW50Q2hpbGQobG9jYXRpb246IFQgfCBudWxsKTogVCB8IG51bGwgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMubW9kZWwuZ2V0Rmlyc3RFbGVtZW50Q2hpbGQobG9jYXRpb24pO1xuXG5cdFx0aWYgKHJlc3VsdCA9PT0gbnVsbCB8fCB0eXBlb2YgcmVzdWx0ID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5lbGVtZW50TWFwcGVyKHJlc3VsdC5lbGVtZW50cyk7XG5cdH1cblxuXHRnZXRMYXN0RWxlbWVudEFuY2VzdG9yKGxvY2F0aW9uPzogVCB8IG51bGwgfCB1bmRlZmluZWQpOiBUIHwgbnVsbCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5tb2RlbC5nZXRMYXN0RWxlbWVudEFuY2VzdG9yKGxvY2F0aW9uKTtcblxuXHRcdGlmIChyZXN1bHQgPT09IG51bGwgfHwgdHlwZW9mIHJlc3VsdCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZWxlbWVudE1hcHBlcihyZXN1bHQuZWxlbWVudHMpO1xuXHR9XG5cblx0aXNDb2xsYXBzaWJsZShsb2NhdGlvbjogVCB8IG51bGwpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5pc0NvbGxhcHNpYmxlKGxvY2F0aW9uKTtcblx0fVxuXG5cdHNldENvbGxhcHNpYmxlKGxvY2F0aW9uOiBUIHwgbnVsbCwgY29sbGFwc2VkPzogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLnNldENvbGxhcHNpYmxlKGxvY2F0aW9uLCBjb2xsYXBzZWQpO1xuXHR9XG5cblx0aXNDb2xsYXBzZWQobG9jYXRpb246IFQgfCBudWxsKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuaXNDb2xsYXBzZWQobG9jYXRpb24pO1xuXHR9XG5cblx0c2V0Q29sbGFwc2VkKGxvY2F0aW9uOiBUIHwgbnVsbCwgY29sbGFwc2VkPzogYm9vbGVhbiB8IHVuZGVmaW5lZCwgcmVjdXJzaXZlPzogYm9vbGVhbiB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLnNldENvbGxhcHNlZChsb2NhdGlvbiwgY29sbGFwc2VkLCByZWN1cnNpdmUpO1xuXHR9XG5cblx0ZXhwYW5kVG8obG9jYXRpb246IFQgfCBudWxsKTogdm9pZCB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuZXhwYW5kVG8obG9jYXRpb24pO1xuXHR9XG5cblx0cmVyZW5kZXIobG9jYXRpb246IFQgfCBudWxsKTogdm9pZCB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwucmVyZW5kZXIobG9jYXRpb24pO1xuXHR9XG5cblx0cmVmaWx0ZXIoKTogdm9pZCB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwucmVmaWx0ZXIoKTtcblx0fVxuXG5cdHJlc29ydChlbGVtZW50OiBUIHwgbnVsbCA9IG51bGwsIHJlY3Vyc2l2ZSA9IHRydWUpOiB2b2lkIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5yZXNvcnQoZWxlbWVudCwgcmVjdXJzaXZlKTtcblx0fVxuXG5cdGdldENvbXByZXNzZWRUcmVlTm9kZShsb2NhdGlvbjogVCB8IG51bGwgPSBudWxsKTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8VD4gfCBudWxsLCBURmlsdGVyRGF0YT4ge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmdldE5vZGUobG9jYXRpb24pO1xuXHR9XG59XG4iXSwKICAibWFwcGlu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
