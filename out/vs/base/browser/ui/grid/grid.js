import { Orientation } from "../sash/sash.js";
import { equals, tail } from "../../../common/arrays.js";
import { Disposable } from "../../../common/lifecycle.js";
import "./gridview.css";
import { GridView, orthogonal, Sizing as GridViewSizing } from "./gridview.js";
import { LayoutPriority, Orientation as Orientation2, orthogonal as orthogonal2 } from "./gridview.js";
var Direction = /* @__PURE__ */ ((Direction2) => {
  Direction2[Direction2["Up"] = 0] = "Up";
  Direction2[Direction2["Down"] = 1] = "Down";
  Direction2[Direction2["Left"] = 2] = "Left";
  Direction2[Direction2["Right"] = 3] = "Right";
  return Direction2;
})(Direction || {});
function oppositeDirection(direction) {
  switch (direction) {
    case 0 /* Up */:
      return 1 /* Down */;
    case 1 /* Down */:
      return 0 /* Up */;
    case 2 /* Left */:
      return 3 /* Right */;
    case 3 /* Right */:
      return 2 /* Left */;
  }
}
function isGridBranchNode(node) {
  return !!node.children;
}
function getGridNode(node, location) {
  if (location.length === 0) {
    return node;
  }
  if (!isGridBranchNode(node)) {
    throw new Error("Invalid location");
  }
  const [index, ...rest] = location;
  return getGridNode(node.children[index], rest);
}
function intersects(one, other) {
  return !(one.start >= other.end || other.start >= one.end);
}
function getBoxBoundary(box, direction) {
  const orientation = getDirectionOrientation(direction);
  const offset = direction === 0 /* Up */ ? box.top : direction === 3 /* Right */ ? box.left + box.width : direction === 1 /* Down */ ? box.top + box.height : box.left;
  const range = {
    start: orientation === Orientation.HORIZONTAL ? box.top : box.left,
    end: orientation === Orientation.HORIZONTAL ? box.top + box.height : box.left + box.width
  };
  return { offset, range };
}
function findAdjacentBoxLeafNodes(boxNode, direction, boundary) {
  const result = [];
  function _(boxNode2, direction2, boundary2) {
    if (isGridBranchNode(boxNode2)) {
      for (const child of boxNode2.children) {
        _(child, direction2, boundary2);
      }
    } else {
      const { offset, range } = getBoxBoundary(boxNode2.box, direction2);
      if (offset === boundary2.offset && intersects(range, boundary2.range)) {
        result.push(boxNode2);
      }
    }
  }
  _(boxNode, direction, boundary);
  return result;
}
function getLocationOrientation(rootOrientation, location) {
  return location.length % 2 === 0 ? orthogonal(rootOrientation) : rootOrientation;
}
function getDirectionOrientation(direction) {
  return direction === 0 /* Up */ || direction === 1 /* Down */ ? Orientation.VERTICAL : Orientation.HORIZONTAL;
}
function getRelativeLocation(rootOrientation, location, direction) {
  const orientation = getLocationOrientation(rootOrientation, location);
  const directionOrientation = getDirectionOrientation(direction);
  if (orientation === directionOrientation) {
    let [rest, index] = tail(location);
    if (direction === 3 /* Right */ || direction === 1 /* Down */) {
      index += 1;
    }
    return [...rest, index];
  } else {
    const index = direction === 3 /* Right */ || direction === 1 /* Down */ ? 1 : 0;
    return [...location, index];
  }
}
function indexInParent(element) {
  const parentElement = element.parentElement;
  if (!parentElement) {
    throw new Error("Invalid grid element");
  }
  let el = parentElement.firstElementChild;
  let index = 0;
  while (el !== element && el !== parentElement.lastElementChild && el) {
    el = el.nextElementSibling;
    index++;
  }
  return index;
}
function getGridLocation(element) {
  const parentElement = element.parentElement;
  if (!parentElement) {
    throw new Error("Invalid grid element");
  }
  if (/\bmonaco-grid-view\b/.test(parentElement.className)) {
    return [];
  }
  const index = indexInParent(parentElement);
  const ancestor = parentElement.parentElement.parentElement.parentElement.parentElement;
  return [...getGridLocation(ancestor), index];
}
var Sizing;
((Sizing2) => {
  Sizing2.Distribute = { type: "distribute" };
  Sizing2.Split = { type: "split" };
  Sizing2.Auto = { type: "auto" };
  function Invisible(cachedVisibleSize) {
    return { type: "invisible", cachedVisibleSize };
  }
  Sizing2.Invisible = Invisible;
})(Sizing || (Sizing = {}));
class Grid extends Disposable {
  /**
   * Create a new {@link Grid}. A grid must *always* have a view
   * inside.
   *
   * @param view An initial view for this Grid.
   */
  constructor(view, options = {}) {
    super();
    this.views = /* @__PURE__ */ new Map();
    this.didLayout = false;
    if (view instanceof GridView) {
      this.gridview = view;
      this.gridview.getViewMap(this.views);
    } else {
      this.gridview = new GridView(options);
    }
    this._register(this.gridview);
    this._register(this.gridview.onDidSashReset(this.onDidSashReset, this));
    if (!(view instanceof GridView)) {
      this._addView(view, 0, [0]);
    }
    this.onDidChange = this.gridview.onDidChange;
    this.onDidScroll = this.gridview.onDidScroll;
    this.onDidChangeViewMaximized = this.gridview.onDidChangeViewMaximized;
  }
  /**
   * The orientation of the grid. Matches the orientation of the root
   * {@link SplitView} in the grid's {@link GridLocation} model.
   */
  get orientation() {
    return this.gridview.orientation;
  }
  set orientation(orientation) {
    this.gridview.orientation = orientation;
  }
  /**
   * The width of the grid.
   */
  get width() {
    return this.gridview.width;
  }
  /**
   * The height of the grid.
   */
  get height() {
    return this.gridview.height;
  }
  /**
   * The minimum width of the grid.
   */
  get minimumWidth() {
    return this.gridview.minimumWidth;
  }
  /**
   * The minimum height of the grid.
   */
  get minimumHeight() {
    return this.gridview.minimumHeight;
  }
  /**
   * The maximum width of the grid.
   */
  get maximumWidth() {
    return this.gridview.maximumWidth;
  }
  /**
   * The maximum height of the grid.
   */
  get maximumHeight() {
    return this.gridview.maximumHeight;
  }
  /**
   * A collection of sashes perpendicular to each edge of the grid.
   * Corner sashes will be created for each intersection.
   */
  get boundarySashes() {
    return this.gridview.boundarySashes;
  }
  set boundarySashes(boundarySashes) {
    this.gridview.boundarySashes = boundarySashes;
  }
  /**
   * Enable/disable edge snapping across all grid views.
   */
  set edgeSnapping(edgeSnapping) {
    this.gridview.edgeSnapping = edgeSnapping;
  }
  /**
   * The DOM element for this view.
   */
  get element() {
    return this.gridview.element;
  }
  style(styles) {
    this.gridview.style(styles);
  }
  /**
   * Layout the {@link Grid}.
   *
   * Optionally provide a `top` and `left` positions, those will propagate
   * as an origin for positions passed to {@link IView.layout}.
   *
   * @param width The width of the {@link Grid}.
   * @param height The height of the {@link Grid}.
   * @param top Optional, the top location of the {@link Grid}.
   * @param left Optional, the left location of the {@link Grid}.
   */
  layout(width, height, top = 0, left = 0) {
    this.gridview.layout(width, height, top, left);
    this.didLayout = true;
  }
  /**
   * Add a {@link IView view} to this {@link Grid}, based on another reference view.
   *
   * Take this grid as an example:
   *
   * ```
   *  +-----+---------------+
   *  |  A  |      B        |
   *  +-----+---------+-----+
   *  |        C      |     |
   *  +---------------+  D  |
   *  |        E      |     |
   *  +---------------+-----+
   * ```
   *
   * Calling `addView(X, Sizing.Distribute, C, Direction.Right)` will make the following
   * changes:
   *
   * ```
   *  +-----+---------------+
   *  |  A  |      B        |
   *  +-----+-+-------+-----+
   *  |   C   |   X   |     |
   *  +-------+-------+  D  |
   *  |        E      |     |
   *  +---------------+-----+
   * ```
   *
   * Or `addView(X, Sizing.Distribute, D, Direction.Down)`:
   *
   * ```
   *  +-----+---------------+
   *  |  A  |      B        |
   *  +-----+---------+-----+
   *  |        C      |  D  |
   *  +---------------+-----+
   *  |        E      |  X  |
   *  +---------------+-----+
   * ```
   *
   * @param newView The view to add.
   * @param size Either a fixed size, or a dynamic {@link Sizing} strategy.
   * @param referenceView Another view to place this new view next to.
   * @param direction The direction the new view should be placed next to the reference view.
   */
  addView(newView, size, referenceView, direction) {
    if (this.views.has(newView)) {
      throw new Error("Can't add same view twice");
    }
    const orientation = getDirectionOrientation(direction);
    if (this.views.size === 1 && this.orientation !== orientation) {
      this.orientation = orientation;
    }
    const referenceLocation = this.getViewLocation(referenceView);
    const location = getRelativeLocation(this.gridview.orientation, referenceLocation, direction);
    let viewSize;
    if (typeof size === "number") {
      viewSize = size;
    } else if (size.type === "split") {
      const [, index] = tail(referenceLocation);
      viewSize = GridViewSizing.Split(index);
    } else if (size.type === "distribute") {
      viewSize = GridViewSizing.Distribute;
    } else if (size.type === "auto") {
      const [, index] = tail(referenceLocation);
      viewSize = GridViewSizing.Auto(index);
    } else {
      viewSize = size;
    }
    this._addView(newView, viewSize, location);
  }
  addViewAt(newView, size, location) {
    if (this.views.has(newView)) {
      throw new Error("Can't add same view twice");
    }
    let viewSize;
    if (typeof size === "number") {
      viewSize = size;
    } else if (size.type === "distribute") {
      viewSize = GridViewSizing.Distribute;
    } else {
      viewSize = size;
    }
    this._addView(newView, viewSize, location);
  }
  _addView(newView, size, location) {
    this.views.set(newView, newView.element);
    this.gridview.addView(newView, size, location);
  }
  /**
   * Remove a {@link IView view} from this {@link Grid}.
   *
   * @param view The {@link IView view} to remove.
   * @param sizing Whether to distribute other {@link IView view}'s sizes.
   */
  removeView(view, sizing) {
    if (this.views.size === 1) {
      throw new Error("Can't remove last view");
    }
    const location = this.getViewLocation(view);
    let gridViewSizing;
    if (sizing?.type === "distribute") {
      gridViewSizing = GridViewSizing.Distribute;
    } else if (sizing?.type === "auto") {
      const index = location[location.length - 1];
      gridViewSizing = GridViewSizing.Auto(index === 0 ? 1 : index - 1);
    }
    this.gridview.removeView(location, gridViewSizing);
    this.views.delete(view);
  }
  /**
   * Move a {@link IView view} to another location in the grid.
   *
   * @remarks See {@link Grid.addView}.
   *
   * @param view The {@link IView view} to move.
   * @param sizing Either a fixed size, or a dynamic {@link Sizing} strategy.
   * @param referenceView Another view to place the view next to.
   * @param direction The direction the view should be placed next to the reference view.
   */
  moveView(view, sizing, referenceView, direction) {
    const sourceLocation = this.getViewLocation(view);
    const [sourceParentLocation, from] = tail(sourceLocation);
    const referenceLocation = this.getViewLocation(referenceView);
    const targetLocation = getRelativeLocation(this.gridview.orientation, referenceLocation, direction);
    const [targetParentLocation, to] = tail(targetLocation);
    if (equals(sourceParentLocation, targetParentLocation)) {
      this.gridview.moveView(sourceParentLocation, from, to);
    } else {
      this.removeView(view, typeof sizing === "number" ? void 0 : sizing);
      this.addView(view, sizing, referenceView, direction);
    }
  }
  /**
   * Move a {@link IView view} to another location in the grid.
   *
   * @remarks Internal method, do not use without knowing what you're doing.
   * @remarks See {@link GridView.moveView}.
   *
   * @param view The {@link IView view} to move.
   * @param location The {@link GridLocation location} to insert the view on.
   */
  moveViewTo(view, location) {
    const sourceLocation = this.getViewLocation(view);
    const [sourceParentLocation, from] = tail(sourceLocation);
    const [targetParentLocation, to] = tail(location);
    if (equals(sourceParentLocation, targetParentLocation)) {
      this.gridview.moveView(sourceParentLocation, from, to);
    } else {
      const size = this.getViewSize(view);
      const orientation = getLocationOrientation(this.gridview.orientation, sourceLocation);
      const cachedViewSize = this.getViewCachedVisibleSize(view);
      const sizing = typeof cachedViewSize === "undefined" ? orientation === Orientation.HORIZONTAL ? size.width : size.height : Sizing.Invisible(cachedViewSize);
      this.removeView(view);
      this.addViewAt(view, sizing, location);
    }
  }
  /**
   * Swap two {@link IView views} within the {@link Grid}.
   *
   * @param from One {@link IView view}.
   * @param to Another {@link IView view}.
   */
  swapViews(from, to) {
    const fromLocation = this.getViewLocation(from);
    const toLocation = this.getViewLocation(to);
    return this.gridview.swapViews(fromLocation, toLocation);
  }
  /**
   * Resize a {@link IView view}.
   *
   * @param view The {@link IView view} to resize.
   * @param size The size the view should be.
   */
  resizeView(view, size) {
    const location = this.getViewLocation(view);
    return this.gridview.resizeView(location, size);
  }
  /**
   * Returns whether all other {@link IView views} are at their minimum size.
   *
   * @param view The reference {@link IView view}.
   */
  isViewExpanded(view) {
    const location = this.getViewLocation(view);
    return this.gridview.isViewExpanded(location);
  }
  /**
   * Returns whether the {@link IView view} is maximized.
   *
   * @param view The reference {@link IView view}.
   */
  isViewMaximized(view) {
    const location = this.getViewLocation(view);
    return this.gridview.isViewMaximized(location);
  }
  /**
   * Returns whether the {@link IView view} is maximized.
   *
   * @param view The reference {@link IView view}.
   */
  hasMaximizedView() {
    return this.gridview.hasMaximizedView();
  }
  /**
   * Get the size of a {@link IView view}.
   *
   * @param view The {@link IView view}. Provide `undefined` to get the size
   * of the grid itself.
   */
  getViewSize(view) {
    if (!view) {
      return this.gridview.getViewSize();
    }
    const location = this.getViewLocation(view);
    return this.gridview.getViewSize(location);
  }
  /**
   * Get the cached visible size of a {@link IView view}. This was the size
   * of the view at the moment it last became hidden.
   *
   * @param view The {@link IView view}.
   */
  getViewCachedVisibleSize(view) {
    const location = this.getViewLocation(view);
    return this.gridview.getViewCachedVisibleSize(location);
  }
  /**
   * Maximizes the specified view and hides all other views.
   * @param view The view to maximize.
   * @param excludeViews Optional array of views to exclude from being hidden.
   */
  maximizeView(view, excludeViews = []) {
    if (this.views.size < 2) {
      throw new Error("At least two views are required to maximize a view");
    }
    const location = this.getViewLocation(view);
    this.gridview.maximizeView(location, excludeViews);
  }
  exitMaximizedView() {
    this.gridview.exitMaximizedView();
  }
  /**
   * Expand the size of a {@link IView view} by collapsing all other views
   * to their minimum sizes.
   *
   * @param view The {@link IView view}.
   */
  expandView(view) {
    const location = this.getViewLocation(view);
    this.gridview.expandView(location);
  }
  /**
   * Distribute the size among all {@link IView views} within the entire grid.
   */
  distributeViewSizes() {
    this.gridview.distributeViewSizes();
  }
  /**
   * Returns whether a {@link IView view} is visible.
   *
   * @param view The {@link IView view}.
   */
  isViewVisible(view) {
    const location = this.getViewLocation(view);
    return this.gridview.isViewVisible(location);
  }
  /**
   * Set the visibility state of a {@link IView view}.
   *
   * @param view The {@link IView view}.
   * @param sizing Whether to redistribute the containing {@link SplitView} after revealing the view.
   */
  setViewVisible(view, visible, sizing) {
    const location = this.getViewLocation(view);
    this.gridview.setViewVisible(location, visible);
    if (visible && sizing?.type === "distribute") {
      const parentLocation = location.length > 0 ? tail(location)[0] : void 0;
      this.gridview.distributeViewSizes(parentLocation);
    }
  }
  /**
   * Returns a descriptor for the entire grid.
   */
  getViews() {
    return this.gridview.getView();
  }
  /**
   * Utility method to return the collection all views which intersect
   * a view's edge.
   *
   * @param view The {@link IView view}.
   * @param direction Which direction edge to be considered.
   * @param wrap Whether the grid wraps around (from right to left, from bottom to top).
   */
  getNeighborViews(view, direction, wrap = false) {
    if (!this.didLayout) {
      throw new Error("Can't call getNeighborViews before first layout");
    }
    const location = this.getViewLocation(view);
    const root = this.getViews();
    const node = getGridNode(root, location);
    let boundary = getBoxBoundary(node.box, direction);
    if (wrap) {
      if (direction === 0 /* Up */ && node.box.top === 0) {
        boundary = { offset: root.box.top + root.box.height, range: boundary.range };
      } else if (direction === 3 /* Right */ && node.box.left + node.box.width === root.box.width) {
        boundary = { offset: 0, range: boundary.range };
      } else if (direction === 1 /* Down */ && node.box.top + node.box.height === root.box.height) {
        boundary = { offset: 0, range: boundary.range };
      } else if (direction === 2 /* Left */ && node.box.left === 0) {
        boundary = { offset: root.box.left + root.box.width, range: boundary.range };
      }
    }
    return findAdjacentBoxLeafNodes(root, oppositeDirection(direction), boundary).map((node2) => node2.view);
  }
  getViewLocation(view) {
    const element = this.views.get(view);
    if (!element) {
      throw new Error("View not found");
    }
    return getGridLocation(element);
  }
  onDidSashReset(location) {
    const resizeToPreferredSize = (location2) => {
      const node = this.gridview.getView(location2);
      if (isGridBranchNode(node)) {
        return false;
      }
      const direction = getLocationOrientation(this.orientation, location2);
      const size = direction === Orientation.HORIZONTAL ? node.view.preferredWidth : node.view.preferredHeight;
      if (typeof size !== "number") {
        return false;
      }
      const viewSize = direction === Orientation.HORIZONTAL ? { width: Math.round(size) } : { height: Math.round(size) };
      this.gridview.resizeView(location2, viewSize);
      return true;
    };
    if (resizeToPreferredSize(location)) {
      return;
    }
    const [parentLocation, index] = tail(location);
    if (resizeToPreferredSize([...parentLocation, index + 1])) {
      return;
    }
    this.gridview.distributeViewSizes(parentLocation);
  }
}
class SerializableGrid extends Grid {
  constructor() {
    super(...arguments);
    /**
     * Useful information in order to proportionally restore view sizes
     * upon the very first layout call.
     */
    this.initialLayoutContext = true;
  }
  static serializeNode(node, orientation) {
    const size = orientation === Orientation.VERTICAL ? node.box.width : node.box.height;
    if (!isGridBranchNode(node)) {
      const serializedLeafNode = { type: "leaf", data: node.view.toJSON(), size };
      if (typeof node.cachedVisibleSize === "number") {
        serializedLeafNode.size = node.cachedVisibleSize;
        serializedLeafNode.visible = false;
      } else if (node.maximized) {
        serializedLeafNode.maximized = true;
      }
      return serializedLeafNode;
    }
    const data = node.children.map((c) => SerializableGrid.serializeNode(c, orthogonal(orientation)));
    if (data.some((c) => c.visible !== false)) {
      return { type: "branch", data, size };
    }
    return { type: "branch", data, size, visible: false };
  }
  /**
   * Construct a new {@link SerializableGrid} from a JSON object.
   *
   * @param json The JSON object.
   * @param deserializer A deserializer which can revive each view.
   * @returns A new {@link SerializableGrid} instance.
   */
  static deserialize(json, deserializer, options = {}) {
    if (typeof json.orientation !== "number") {
      throw new Error("Invalid JSON: 'orientation' property must be a number.");
    } else if (typeof json.width !== "number") {
      throw new Error("Invalid JSON: 'width' property must be a number.");
    } else if (typeof json.height !== "number") {
      throw new Error("Invalid JSON: 'height' property must be a number.");
    }
    const gridview = GridView.deserialize(json, deserializer, options);
    const result = new SerializableGrid(gridview, options);
    return result;
  }
  /**
   * Construct a new {@link SerializableGrid} from a grid descriptor.
   *
   * @param gridDescriptor A grid descriptor in which leaf nodes point to actual views.
   * @returns A new {@link SerializableGrid} instance.
   */
  static from(gridDescriptor, options = {}) {
    return SerializableGrid.deserialize(createSerializedGrid(gridDescriptor), { fromJSON: (view) => view }, options);
  }
  /**
   * Serialize this grid into a JSON object.
   */
  serialize() {
    return {
      root: SerializableGrid.serializeNode(this.getViews(), this.orientation),
      orientation: this.orientation,
      width: this.width,
      height: this.height
    };
  }
  layout(width, height, top = 0, left = 0) {
    super.layout(width, height, top, left);
    if (this.initialLayoutContext) {
      this.initialLayoutContext = false;
      this.gridview.trySet2x2();
    }
  }
}
function isGridBranchNodeDescriptor(nodeDescriptor) {
  return !!nodeDescriptor.groups;
}
function sanitizeGridNodeDescriptor(nodeDescriptor, rootNode) {
  if (!rootNode && nodeDescriptor.groups && nodeDescriptor.groups.length <= 1) {
    nodeDescriptor.groups = void 0;
  }
  if (!isGridBranchNodeDescriptor(nodeDescriptor)) {
    return;
  }
  let totalDefinedSize = 0;
  let totalDefinedSizeCount = 0;
  for (const child of nodeDescriptor.groups) {
    sanitizeGridNodeDescriptor(child, false);
    if (child.size) {
      totalDefinedSize += child.size;
      totalDefinedSizeCount++;
    }
  }
  const totalUndefinedSize = totalDefinedSizeCount > 0 ? totalDefinedSize : 1;
  const totalUndefinedSizeCount = nodeDescriptor.groups.length - totalDefinedSizeCount;
  const eachUndefinedSize = totalUndefinedSize / totalUndefinedSizeCount;
  for (const child of nodeDescriptor.groups) {
    if (!child.size) {
      child.size = eachUndefinedSize;
    }
  }
}
function createSerializedNode(nodeDescriptor) {
  if (isGridBranchNodeDescriptor(nodeDescriptor)) {
    return { type: "branch", data: nodeDescriptor.groups.map((c) => createSerializedNode(c)), size: nodeDescriptor.size };
  } else {
    return { type: "leaf", data: nodeDescriptor.data, size: nodeDescriptor.size };
  }
}
function getDimensions(node, orientation) {
  if (node.type === "branch") {
    const childrenDimensions = node.data.map((c) => getDimensions(c, orthogonal(orientation)));
    if (orientation === Orientation.VERTICAL) {
      const width = node.size || (childrenDimensions.length === 0 ? void 0 : Math.max(...childrenDimensions.map((d) => d.width || 0)));
      const height = childrenDimensions.length === 0 ? void 0 : childrenDimensions.reduce((r, d) => r + (d.height || 0), 0);
      return { width, height };
    } else {
      const width = childrenDimensions.length === 0 ? void 0 : childrenDimensions.reduce((r, d) => r + (d.width || 0), 0);
      const height = node.size || (childrenDimensions.length === 0 ? void 0 : Math.max(...childrenDimensions.map((d) => d.height || 0)));
      return { width, height };
    }
  } else {
    const width = orientation === Orientation.VERTICAL ? node.size : void 0;
    const height = orientation === Orientation.VERTICAL ? void 0 : node.size;
    return { width, height };
  }
}
function createSerializedGrid(gridDescriptor) {
  sanitizeGridNodeDescriptor(gridDescriptor, true);
  const root = createSerializedNode(gridDescriptor);
  const { width, height } = getDimensions(root, gridDescriptor.orientation);
  return {
    root,
    orientation: gridDescriptor.orientation,
    width: width || 1,
    height: height || 1
  };
}
export {
  Direction,
  Grid,
  LayoutPriority,
  Orientation2 as Orientation,
  SerializableGrid,
  Sizing,
  createSerializedGrid,
  getRelativeLocation,
  isGridBranchNode,
  orthogonal2 as orthogonal,
  sanitizeGridNodeDescriptor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFx1aVxcZ3JpZFxcZ3JpZC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElCb3VuZGFyeVNhc2hlcywgT3JpZW50YXRpb24gfSBmcm9tICcuLi9zYXNoL3Nhc2guanMnO1xuaW1wb3J0IHsgZXF1YWxzLCB0YWlsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgJy4vZ3JpZHZpZXcuY3NzJztcbmltcG9ydCB7IEJveCwgR3JpZFZpZXcsIElHcmlkVmlld09wdGlvbnMsIElHcmlkVmlld1N0eWxlcywgSVZpZXcgYXMgSUdyaWRWaWV3VmlldywgSVZpZXdTaXplLCBvcnRob2dvbmFsLCBTaXppbmcgYXMgR3JpZFZpZXdTaXppbmcsIEdyaWRMb2NhdGlvbiB9IGZyb20gJy4vZ3JpZHZpZXcuanMnO1xuaW1wb3J0IHR5cGUgeyBTcGxpdFZpZXcsIEF1dG9TaXppbmcgYXMgU3BsaXRWaWV3QXV0b1NpemluZyB9IGZyb20gJy4uL3NwbGl0dmlldy9zcGxpdHZpZXcuanMnO1xuXG5leHBvcnQgdHlwZSB7IElWaWV3U2l6ZSB9O1xuZXhwb3J0IHsgTGF5b3V0UHJpb3JpdHksIE9yaWVudGF0aW9uLCBvcnRob2dvbmFsIH0gZnJvbSAnLi9ncmlkdmlldy5qcyc7XG5cbmV4cG9ydCBjb25zdCBlbnVtIERpcmVjdGlvbiB7XG5cdFVwLFxuXHREb3duLFxuXHRMZWZ0LFxuXHRSaWdodFxufVxuXG5mdW5jdGlvbiBvcHBvc2l0ZURpcmVjdGlvbihkaXJlY3Rpb246IERpcmVjdGlvbik6IERpcmVjdGlvbiB7XG5cdHN3aXRjaCAoZGlyZWN0aW9uKSB7XG5cdFx0Y2FzZSBEaXJlY3Rpb24uVXA6IHJldHVybiBEaXJlY3Rpb24uRG93bjtcblx0XHRjYXNlIERpcmVjdGlvbi5Eb3duOiByZXR1cm4gRGlyZWN0aW9uLlVwO1xuXHRcdGNhc2UgRGlyZWN0aW9uLkxlZnQ6IHJldHVybiBEaXJlY3Rpb24uUmlnaHQ7XG5cdFx0Y2FzZSBEaXJlY3Rpb24uUmlnaHQ6IHJldHVybiBEaXJlY3Rpb24uTGVmdDtcblx0fVxufVxuXG4vKipcbiAqIFRoZSBpbnRlcmZhY2UgdG8gaW1wbGVtZW50IGZvciB2aWV3cyB3aXRoaW4gYSB7QGxpbmsgR3JpZH0uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVZpZXcgZXh0ZW5kcyBJR3JpZFZpZXdWaWV3IHtcblxuXHQvKipcblx0ICogVGhlIHByZWZlcnJlZCB3aWR0aCBmb3Igd2hlbiB0aGUgdXNlciBkb3VibGUgY2xpY2tzIGEgc2FzaFxuXHQgKiBhZGphY2VudCB0byB0aGlzIHZpZXcuXG5cdCAqL1xuXHRyZWFkb25seSBwcmVmZXJyZWRXaWR0aD86IG51bWJlcjtcblxuXHQvKipcblx0ICogVGhlIHByZWZlcnJlZCBoZWlnaHQgZm9yIHdoZW4gdGhlIHVzZXIgZG91YmxlIGNsaWNrcyBhIHNhc2hcblx0ICogYWRqYWNlbnQgdG8gdGhpcyB2aWV3LlxuXHQgKi9cblx0cmVhZG9ubHkgcHJlZmVycmVkSGVpZ2h0PzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEdyaWRMZWFmTm9kZTxUIGV4dGVuZHMgSVZpZXc+IHtcblx0cmVhZG9ubHkgdmlldzogVDtcblx0cmVhZG9ubHkgYm94OiBCb3g7XG5cdHJlYWRvbmx5IGNhY2hlZFZpc2libGVTaXplOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG1heGltaXplZDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBHcmlkQnJhbmNoTm9kZTxUIGV4dGVuZHMgSVZpZXc+IHtcblx0cmVhZG9ubHkgY2hpbGRyZW46IEdyaWROb2RlPFQ+W107XG5cdHJlYWRvbmx5IGJveDogQm94O1xufVxuXG5leHBvcnQgdHlwZSBHcmlkTm9kZTxUIGV4dGVuZHMgSVZpZXc+ID0gR3JpZExlYWZOb2RlPFQ+IHwgR3JpZEJyYW5jaE5vZGU8VD47XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0dyaWRCcmFuY2hOb2RlPFQgZXh0ZW5kcyBJVmlldz4obm9kZTogR3JpZE5vZGU8VD4pOiBub2RlIGlzIEdyaWRCcmFuY2hOb2RlPFQ+IHtcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdHJldHVybiAhIShub2RlIGFzIGFueSkuY2hpbGRyZW47XG59XG5cbmZ1bmN0aW9uIGdldEdyaWROb2RlPFQgZXh0ZW5kcyBJVmlldz4obm9kZTogR3JpZE5vZGU8VD4sIGxvY2F0aW9uOiBHcmlkTG9jYXRpb24pOiBHcmlkTm9kZTxUPiB7XG5cdGlmIChsb2NhdGlvbi5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gbm9kZTtcblx0fVxuXG5cdGlmICghaXNHcmlkQnJhbmNoTm9kZShub2RlKSkge1xuXHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBsb2NhdGlvbicpO1xuXHR9XG5cblx0Y29uc3QgW2luZGV4LCAuLi5yZXN0XSA9IGxvY2F0aW9uO1xuXHRyZXR1cm4gZ2V0R3JpZE5vZGUobm9kZS5jaGlsZHJlbltpbmRleF0sIHJlc3QpO1xufVxuXG5pbnRlcmZhY2UgUmFuZ2Uge1xuXHRyZWFkb25seSBzdGFydDogbnVtYmVyO1xuXHRyZWFkb25seSBlbmQ6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gaW50ZXJzZWN0cyhvbmU6IFJhbmdlLCBvdGhlcjogUmFuZ2UpOiBib29sZWFuIHtcblx0cmV0dXJuICEob25lLnN0YXJ0ID49IG90aGVyLmVuZCB8fCBvdGhlci5zdGFydCA+PSBvbmUuZW5kKTtcbn1cblxuaW50ZXJmYWNlIEJvdW5kYXJ5IHtcblx0cmVhZG9ubHkgb2Zmc2V0OiBudW1iZXI7XG5cdHJlYWRvbmx5IHJhbmdlOiBSYW5nZTtcbn1cblxuZnVuY3Rpb24gZ2V0Qm94Qm91bmRhcnkoYm94OiBCb3gsIGRpcmVjdGlvbjogRGlyZWN0aW9uKTogQm91bmRhcnkge1xuXHRjb25zdCBvcmllbnRhdGlvbiA9IGdldERpcmVjdGlvbk9yaWVudGF0aW9uKGRpcmVjdGlvbik7XG5cdGNvbnN0IG9mZnNldCA9IGRpcmVjdGlvbiA9PT0gRGlyZWN0aW9uLlVwID8gYm94LnRvcCA6XG5cdFx0ZGlyZWN0aW9uID09PSBEaXJlY3Rpb24uUmlnaHQgPyBib3gubGVmdCArIGJveC53aWR0aCA6XG5cdFx0XHRkaXJlY3Rpb24gPT09IERpcmVjdGlvbi5Eb3duID8gYm94LnRvcCArIGJveC5oZWlnaHQgOlxuXHRcdFx0XHRib3gubGVmdDtcblxuXHRjb25zdCByYW5nZSA9IHtcblx0XHRzdGFydDogb3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgPyBib3gudG9wIDogYm94LmxlZnQsXG5cdFx0ZW5kOiBvcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IGJveC50b3AgKyBib3guaGVpZ2h0IDogYm94LmxlZnQgKyBib3gud2lkdGhcblx0fTtcblxuXHRyZXR1cm4geyBvZmZzZXQsIHJhbmdlIH07XG59XG5cbmZ1bmN0aW9uIGZpbmRBZGphY2VudEJveExlYWZOb2RlczxUIGV4dGVuZHMgSVZpZXc+KGJveE5vZGU6IEdyaWROb2RlPFQ+LCBkaXJlY3Rpb246IERpcmVjdGlvbiwgYm91bmRhcnk6IEJvdW5kYXJ5KTogR3JpZExlYWZOb2RlPFQ+W10ge1xuXHRjb25zdCByZXN1bHQ6IEdyaWRMZWFmTm9kZTxUPltdID0gW107XG5cblx0ZnVuY3Rpb24gXyhib3hOb2RlOiBHcmlkTm9kZTxUPiwgZGlyZWN0aW9uOiBEaXJlY3Rpb24sIGJvdW5kYXJ5OiBCb3VuZGFyeSk6IHZvaWQge1xuXHRcdGlmIChpc0dyaWRCcmFuY2hOb2RlKGJveE5vZGUpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGJveE5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdFx0XyhjaGlsZCwgZGlyZWN0aW9uLCBib3VuZGFyeSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHsgb2Zmc2V0LCByYW5nZSB9ID0gZ2V0Qm94Qm91bmRhcnkoYm94Tm9kZS5ib3gsIGRpcmVjdGlvbik7XG5cblx0XHRcdGlmIChvZmZzZXQgPT09IGJvdW5kYXJ5Lm9mZnNldCAmJiBpbnRlcnNlY3RzKHJhbmdlLCBib3VuZGFyeS5yYW5nZSkpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goYm94Tm9kZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Xyhib3hOb2RlLCBkaXJlY3Rpb24sIGJvdW5kYXJ5KTtcblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gZ2V0TG9jYXRpb25PcmllbnRhdGlvbihyb290T3JpZW50YXRpb246IE9yaWVudGF0aW9uLCBsb2NhdGlvbjogR3JpZExvY2F0aW9uKTogT3JpZW50YXRpb24ge1xuXHRyZXR1cm4gbG9jYXRpb24ubGVuZ3RoICUgMiA9PT0gMCA/IG9ydGhvZ29uYWwocm9vdE9yaWVudGF0aW9uKSA6IHJvb3RPcmllbnRhdGlvbjtcbn1cblxuZnVuY3Rpb24gZ2V0RGlyZWN0aW9uT3JpZW50YXRpb24oZGlyZWN0aW9uOiBEaXJlY3Rpb24pOiBPcmllbnRhdGlvbiB7XG5cdHJldHVybiBkaXJlY3Rpb24gPT09IERpcmVjdGlvbi5VcCB8fCBkaXJlY3Rpb24gPT09IERpcmVjdGlvbi5Eb3duID8gT3JpZW50YXRpb24uVkVSVElDQUwgOiBPcmllbnRhdGlvbi5IT1JJWk9OVEFMO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVsYXRpdmVMb2NhdGlvbihyb290T3JpZW50YXRpb246IE9yaWVudGF0aW9uLCBsb2NhdGlvbjogR3JpZExvY2F0aW9uLCBkaXJlY3Rpb246IERpcmVjdGlvbik6IEdyaWRMb2NhdGlvbiB7XG5cdGNvbnN0IG9yaWVudGF0aW9uID0gZ2V0TG9jYXRpb25PcmllbnRhdGlvbihyb290T3JpZW50YXRpb24sIGxvY2F0aW9uKTtcblx0Y29uc3QgZGlyZWN0aW9uT3JpZW50YXRpb24gPSBnZXREaXJlY3Rpb25PcmllbnRhdGlvbihkaXJlY3Rpb24pO1xuXG5cdGlmIChvcmllbnRhdGlvbiA9PT0gZGlyZWN0aW9uT3JpZW50YXRpb24pIHtcblx0XHRsZXQgW3Jlc3QsIGluZGV4XSA9IHRhaWwobG9jYXRpb24pO1xuXG5cdFx0aWYgKGRpcmVjdGlvbiA9PT0gRGlyZWN0aW9uLlJpZ2h0IHx8IGRpcmVjdGlvbiA9PT0gRGlyZWN0aW9uLkRvd24pIHtcblx0XHRcdGluZGV4ICs9IDE7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFsuLi5yZXN0LCBpbmRleF07XG5cdH0gZWxzZSB7XG5cdFx0Y29uc3QgaW5kZXggPSAoZGlyZWN0aW9uID09PSBEaXJlY3Rpb24uUmlnaHQgfHwgZGlyZWN0aW9uID09PSBEaXJlY3Rpb24uRG93bikgPyAxIDogMDtcblx0XHRyZXR1cm4gWy4uLmxvY2F0aW9uLCBpbmRleF07XG5cdH1cbn1cblxuZnVuY3Rpb24gaW5kZXhJblBhcmVudChlbGVtZW50OiBIVE1MRWxlbWVudCk6IG51bWJlciB7XG5cdGNvbnN0IHBhcmVudEVsZW1lbnQgPSBlbGVtZW50LnBhcmVudEVsZW1lbnQ7XG5cblx0aWYgKCFwYXJlbnRFbGVtZW50KSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGdyaWQgZWxlbWVudCcpO1xuXHR9XG5cblx0bGV0IGVsID0gcGFyZW50RWxlbWVudC5maXJzdEVsZW1lbnRDaGlsZDtcblx0bGV0IGluZGV4ID0gMDtcblxuXHR3aGlsZSAoZWwgIT09IGVsZW1lbnQgJiYgZWwgIT09IHBhcmVudEVsZW1lbnQubGFzdEVsZW1lbnRDaGlsZCAmJiBlbCkge1xuXHRcdGVsID0gZWwubmV4dEVsZW1lbnRTaWJsaW5nO1xuXHRcdGluZGV4Kys7XG5cdH1cblxuXHRyZXR1cm4gaW5kZXg7XG59XG5cbi8qKlxuICogRmluZCB0aGUgZ3JpZCBsb2NhdGlvbiBvZiBhIHNwZWNpZmljIERPTSBlbGVtZW50IGJ5IHRyYXZlcnNpbmcgdGhlIHBhcmVudFxuICogY2hhaW4gYW5kIGZpbmRpbmcgZWFjaCBjaGlsZCBpbmRleCBvbiB0aGUgd2F5LlxuICpcbiAqIFRoaXMgd2lsbCBicmVhayBhcyBzb29uIGFzIERPTSBzdHJ1Y3R1cmVzIG9mIHRoZSBTcGxpdHZpZXcgb3IgR3JpZHZpZXcgY2hhbmdlLlxuICovXG5mdW5jdGlvbiBnZXRHcmlkTG9jYXRpb24oZWxlbWVudDogSFRNTEVsZW1lbnQpOiBHcmlkTG9jYXRpb24ge1xuXHRjb25zdCBwYXJlbnRFbGVtZW50ID0gZWxlbWVudC5wYXJlbnRFbGVtZW50O1xuXG5cdGlmICghcGFyZW50RWxlbWVudCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBncmlkIGVsZW1lbnQnKTtcblx0fVxuXG5cdGlmICgvXFxibW9uYWNvLWdyaWQtdmlld1xcYi8udGVzdChwYXJlbnRFbGVtZW50LmNsYXNzTmFtZSkpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRjb25zdCBpbmRleCA9IGluZGV4SW5QYXJlbnQocGFyZW50RWxlbWVudCk7XG5cdGNvbnN0IGFuY2VzdG9yID0gcGFyZW50RWxlbWVudC5wYXJlbnRFbGVtZW50IS5wYXJlbnRFbGVtZW50IS5wYXJlbnRFbGVtZW50IS5wYXJlbnRFbGVtZW50ITtcblx0cmV0dXJuIFsuLi5nZXRHcmlkTG9jYXRpb24oYW5jZXN0b3IpLCBpbmRleF07XG59XG5cbmV4cG9ydCB0eXBlIERpc3RyaWJ1dGVTaXppbmcgPSB7IHR5cGU6ICdkaXN0cmlidXRlJyB9O1xuZXhwb3J0IHR5cGUgU3BsaXRTaXppbmcgPSB7IHR5cGU6ICdzcGxpdCcgfTtcbmV4cG9ydCB0eXBlIEF1dG9TaXppbmcgPSB7IHR5cGU6ICdhdXRvJyB9O1xuZXhwb3J0IHR5cGUgSW52aXNpYmxlU2l6aW5nID0geyB0eXBlOiAnaW52aXNpYmxlJzsgY2FjaGVkVmlzaWJsZVNpemU6IG51bWJlciB9O1xuZXhwb3J0IHR5cGUgU2l6aW5nID0gRGlzdHJpYnV0ZVNpemluZyB8IFNwbGl0U2l6aW5nIHwgQXV0b1NpemluZyB8IEludmlzaWJsZVNpemluZztcblxuZXhwb3J0IG5hbWVzcGFjZSBTaXppbmcge1xuXHRleHBvcnQgY29uc3QgRGlzdHJpYnV0ZTogRGlzdHJpYnV0ZVNpemluZyA9IHsgdHlwZTogJ2Rpc3RyaWJ1dGUnIH07XG5cdGV4cG9ydCBjb25zdCBTcGxpdDogU3BsaXRTaXppbmcgPSB7IHR5cGU6ICdzcGxpdCcgfTtcblx0ZXhwb3J0IGNvbnN0IEF1dG86IEF1dG9TaXppbmcgPSB7IHR5cGU6ICdhdXRvJyB9O1xuXHRleHBvcnQgZnVuY3Rpb24gSW52aXNpYmxlKGNhY2hlZFZpc2libGVTaXplOiBudW1iZXIpOiBJbnZpc2libGVTaXppbmcgeyByZXR1cm4geyB0eXBlOiAnaW52aXNpYmxlJywgY2FjaGVkVmlzaWJsZVNpemUgfTsgfVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElHcmlkU3R5bGVzIGV4dGVuZHMgSUdyaWRWaWV3U3R5bGVzIHsgfVxuZXhwb3J0IGludGVyZmFjZSBJR3JpZE9wdGlvbnMgZXh0ZW5kcyBJR3JpZFZpZXdPcHRpb25zIHsgfVxuXG4vKipcbiAqIFRoZSB7QGxpbmsgR3JpZH0gZXhwb3NlcyBhIEdyaWQgd2lkZ2V0IGluIGEgZnJpZW5kbGllciBBUEkgdGhhbiB0aGUgdW5kZXJseWluZ1xuICoge0BsaW5rIEdyaWRWaWV3fSB3aWRnZXQuIE5hbWVseSwgYWxsIG11dGF0aW9uIG9wZXJhdGlvbnMgYXJlIGFkZHJlc3NlZCBieSB0aGVcbiAqIG1vZGVsIGVsZW1lbnRzLCByYXRoZXIgdGhhbiBpbmRleGVzLlxuICpcbiAqIEl0IHN1cHBvcnQgdGhlIHNhbWUgZmVhdHVyZXMgYXMgdGhlIHtAbGluayBHcmlkVmlld30uXG4gKi9cbmV4cG9ydCBjbGFzcyBHcmlkPFQgZXh0ZW5kcyBJVmlldyA9IElWaWV3PiBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByb3RlY3RlZCBncmlkdmlldzogR3JpZFZpZXc7XG5cdHByaXZhdGUgdmlld3MgPSBuZXcgTWFwPFQsIEhUTUxFbGVtZW50PigpO1xuXG5cdC8qKlxuXHQgKiBUaGUgb3JpZW50YXRpb24gb2YgdGhlIGdyaWQuIE1hdGNoZXMgdGhlIG9yaWVudGF0aW9uIG9mIHRoZSByb290XG5cdCAqIHtAbGluayBTcGxpdFZpZXd9IGluIHRoZSBncmlkJ3Mge0BsaW5rIEdyaWRMb2NhdGlvbn0gbW9kZWwuXG5cdCAqL1xuXHRnZXQgb3JpZW50YXRpb24oKTogT3JpZW50YXRpb24geyByZXR1cm4gdGhpcy5ncmlkdmlldy5vcmllbnRhdGlvbjsgfVxuXHRzZXQgb3JpZW50YXRpb24ob3JpZW50YXRpb246IE9yaWVudGF0aW9uKSB7IHRoaXMuZ3JpZHZpZXcub3JpZW50YXRpb24gPSBvcmllbnRhdGlvbjsgfVxuXG5cdC8qKlxuXHQgKiBUaGUgd2lkdGggb2YgdGhlIGdyaWQuXG5cdCAqL1xuXHRnZXQgd2lkdGgoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuZ3JpZHZpZXcud2lkdGg7IH1cblxuXHQvKipcblx0ICogVGhlIGhlaWdodCBvZiB0aGUgZ3JpZC5cblx0ICovXG5cdGdldCBoZWlnaHQoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuZ3JpZHZpZXcuaGVpZ2h0OyB9XG5cblx0LyoqXG5cdCAqIFRoZSBtaW5pbXVtIHdpZHRoIG9mIHRoZSBncmlkLlxuXHQgKi9cblx0Z2V0IG1pbmltdW1XaWR0aCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5ncmlkdmlldy5taW5pbXVtV2lkdGg7IH1cblxuXHQvKipcblx0ICogVGhlIG1pbmltdW0gaGVpZ2h0IG9mIHRoZSBncmlkLlxuXHQgKi9cblx0Z2V0IG1pbmltdW1IZWlnaHQoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuZ3JpZHZpZXcubWluaW11bUhlaWdodDsgfVxuXG5cdC8qKlxuXHQgKiBUaGUgbWF4aW11bSB3aWR0aCBvZiB0aGUgZ3JpZC5cblx0ICovXG5cdGdldCBtYXhpbXVtV2lkdGgoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuZ3JpZHZpZXcubWF4aW11bVdpZHRoOyB9XG5cblx0LyoqXG5cdCAqIFRoZSBtYXhpbXVtIGhlaWdodCBvZiB0aGUgZ3JpZC5cblx0ICovXG5cdGdldCBtYXhpbXVtSGVpZ2h0KCk6IG51bWJlciB7IHJldHVybiB0aGlzLmdyaWR2aWV3Lm1heGltdW1IZWlnaHQ7IH1cblxuXHQvKipcblx0ICogRmlyZXMgd2hlbmV2ZXIgYSB2aWV3IHdpdGhpbiB0aGUgZ3JpZCBjaGFuZ2VzIGl0cyBzaXplIGNvbnN0cmFpbnRzLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB8IHVuZGVmaW5lZD47XG5cblx0LyoqXG5cdCAqIEZpcmVzIHdoZW5ldmVyIHRoZSB1c2VyIHNjcm9sbHMgYSB7QGxpbmsgU3BsaXRWaWV3fSB3aXRoaW5cblx0ICogdGhlIGdyaWQuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZFNjcm9sbDogRXZlbnQ8dm9pZD47XG5cblx0LyoqXG5cdCAqIEEgY29sbGVjdGlvbiBvZiBzYXNoZXMgcGVycGVuZGljdWxhciB0byBlYWNoIGVkZ2Ugb2YgdGhlIGdyaWQuXG5cdCAqIENvcm5lciBzYXNoZXMgd2lsbCBiZSBjcmVhdGVkIGZvciBlYWNoIGludGVyc2VjdGlvbi5cblx0ICovXG5cdGdldCBib3VuZGFyeVNhc2hlcygpOiBJQm91bmRhcnlTYXNoZXMgeyByZXR1cm4gdGhpcy5ncmlkdmlldy5ib3VuZGFyeVNhc2hlczsgfVxuXHRzZXQgYm91bmRhcnlTYXNoZXMoYm91bmRhcnlTYXNoZXM6IElCb3VuZGFyeVNhc2hlcykgeyB0aGlzLmdyaWR2aWV3LmJvdW5kYXJ5U2FzaGVzID0gYm91bmRhcnlTYXNoZXM7IH1cblxuXHQvKipcblx0ICogRW5hYmxlL2Rpc2FibGUgZWRnZSBzbmFwcGluZyBhY3Jvc3MgYWxsIGdyaWQgdmlld3MuXG5cdCAqL1xuXHRzZXQgZWRnZVNuYXBwaW5nKGVkZ2VTbmFwcGluZzogYm9vbGVhbikgeyB0aGlzLmdyaWR2aWV3LmVkZ2VTbmFwcGluZyA9IGVkZ2VTbmFwcGluZzsgfVxuXG5cdC8qKlxuXHQgKiBUaGUgRE9NIGVsZW1lbnQgZm9yIHRoaXMgdmlldy5cblx0ICovXG5cdGdldCBlbGVtZW50KCk6IEhUTUxFbGVtZW50IHsgcmV0dXJuIHRoaXMuZ3JpZHZpZXcuZWxlbWVudDsgfVxuXG5cdHByaXZhdGUgZGlkTGF5b3V0ID0gZmFsc2U7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWaWV3TWF4aW1pemVkOiBFdmVudDxib29sZWFuPjtcblx0LyoqXG5cdCAqIENyZWF0ZSBhIG5ldyB7QGxpbmsgR3JpZH0uIEEgZ3JpZCBtdXN0ICphbHdheXMqIGhhdmUgYSB2aWV3XG5cdCAqIGluc2lkZS5cblx0ICpcblx0ICogQHBhcmFtIHZpZXcgQW4gaW5pdGlhbCB2aWV3IGZvciB0aGlzIEdyaWQuXG5cdCAqL1xuXHRjb25zdHJ1Y3Rvcih2aWV3OiBUIHwgR3JpZFZpZXcsIG9wdGlvbnM6IElHcmlkT3B0aW9ucyA9IHt9KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGlmICh2aWV3IGluc3RhbmNlb2YgR3JpZFZpZXcpIHtcblx0XHRcdHRoaXMuZ3JpZHZpZXcgPSB2aWV3O1xuXHRcdFx0dGhpcy5ncmlkdmlldy5nZXRWaWV3TWFwKHRoaXMudmlld3MpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmdyaWR2aWV3ID0gbmV3IEdyaWRWaWV3KG9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZ3JpZHZpZXcpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZ3JpZHZpZXcub25EaWRTYXNoUmVzZXQodGhpcy5vbkRpZFNhc2hSZXNldCwgdGhpcykpO1xuXG5cdFx0aWYgKCEodmlldyBpbnN0YW5jZW9mIEdyaWRWaWV3KSkge1xuXHRcdFx0dGhpcy5fYWRkVmlldyh2aWV3LCAwLCBbMF0pO1xuXHRcdH1cblxuXHRcdHRoaXMub25EaWRDaGFuZ2UgPSB0aGlzLmdyaWR2aWV3Lm9uRGlkQ2hhbmdlO1xuXHRcdHRoaXMub25EaWRTY3JvbGwgPSB0aGlzLmdyaWR2aWV3Lm9uRGlkU2Nyb2xsO1xuXHRcdHRoaXMub25EaWRDaGFuZ2VWaWV3TWF4aW1pemVkID0gdGhpcy5ncmlkdmlldy5vbkRpZENoYW5nZVZpZXdNYXhpbWl6ZWQ7XG5cdH1cblxuXHRzdHlsZShzdHlsZXM6IElHcmlkU3R5bGVzKTogdm9pZCB7XG5cdFx0dGhpcy5ncmlkdmlldy5zdHlsZShzdHlsZXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIExheW91dCB0aGUge0BsaW5rIEdyaWR9LlxuXHQgKlxuXHQgKiBPcHRpb25hbGx5IHByb3ZpZGUgYSBgdG9wYCBhbmQgYGxlZnRgIHBvc2l0aW9ucywgdGhvc2Ugd2lsbCBwcm9wYWdhdGVcblx0ICogYXMgYW4gb3JpZ2luIGZvciBwb3NpdGlvbnMgcGFzc2VkIHRvIHtAbGluayBJVmlldy5sYXlvdXR9LlxuXHQgKlxuXHQgKiBAcGFyYW0gd2lkdGggVGhlIHdpZHRoIG9mIHRoZSB7QGxpbmsgR3JpZH0uXG5cdCAqIEBwYXJhbSBoZWlnaHQgVGhlIGhlaWdodCBvZiB0aGUge0BsaW5rIEdyaWR9LlxuXHQgKiBAcGFyYW0gdG9wIE9wdGlvbmFsLCB0aGUgdG9wIGxvY2F0aW9uIG9mIHRoZSB7QGxpbmsgR3JpZH0uXG5cdCAqIEBwYXJhbSBsZWZ0IE9wdGlvbmFsLCB0aGUgbGVmdCBsb2NhdGlvbiBvZiB0aGUge0BsaW5rIEdyaWR9LlxuXHQgKi9cblx0bGF5b3V0KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCB0b3A6IG51bWJlciA9IDAsIGxlZnQ6IG51bWJlciA9IDApOiB2b2lkIHtcblx0XHR0aGlzLmdyaWR2aWV3LmxheW91dCh3aWR0aCwgaGVpZ2h0LCB0b3AsIGxlZnQpO1xuXHRcdHRoaXMuZGlkTGF5b3V0ID0gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBZGQgYSB7QGxpbmsgSVZpZXcgdmlld30gdG8gdGhpcyB7QGxpbmsgR3JpZH0sIGJhc2VkIG9uIGFub3RoZXIgcmVmZXJlbmNlIHZpZXcuXG5cdCAqXG5cdCAqIFRha2UgdGhpcyBncmlkIGFzIGFuIGV4YW1wbGU6XG5cdCAqXG5cdCAqIGBgYFxuXHQgKiAgKy0tLS0tKy0tLS0tLS0tLS0tLS0tLStcblx0ICogIHwgIEEgIHwgICAgICBCICAgICAgICB8XG5cdCAqICArLS0tLS0rLS0tLS0tLS0tKy0tLS0tK1xuXHQgKiAgfCAgICAgICAgQyAgICAgIHwgICAgIHxcblx0ICogICstLS0tLS0tLS0tLS0tLS0rICBEICB8XG5cdCAqICB8ICAgICAgICBFICAgICAgfCAgICAgfFxuXHQgKiAgKy0tLS0tLS0tLS0tLS0tLSstLS0tLStcblx0ICogYGBgXG5cdCAqXG5cdCAqIENhbGxpbmcgYGFkZFZpZXcoWCwgU2l6aW5nLkRpc3RyaWJ1dGUsIEMsIERpcmVjdGlvbi5SaWdodClgIHdpbGwgbWFrZSB0aGUgZm9sbG93aW5nXG5cdCAqIGNoYW5nZXM6XG5cdCAqXG5cdCAqIGBgYFxuXHQgKiAgKy0tLS0tKy0tLS0tLS0tLS0tLS0tLStcblx0ICogIHwgIEEgIHwgICAgICBCICAgICAgICB8XG5cdCAqICArLS0tLS0rLSstLS0tLS0tKy0tLS0tK1xuXHQgKiAgfCAgIEMgICB8ICAgWCAgIHwgICAgIHxcblx0ICogICstLS0tLS0tKy0tLS0tLS0rICBEICB8XG5cdCAqICB8ICAgICAgICBFICAgICAgfCAgICAgfFxuXHQgKiAgKy0tLS0tLS0tLS0tLS0tLSstLS0tLStcblx0ICogYGBgXG5cdCAqXG5cdCAqIE9yIGBhZGRWaWV3KFgsIFNpemluZy5EaXN0cmlidXRlLCBELCBEaXJlY3Rpb24uRG93bilgOlxuXHQgKlxuXHQgKiBgYGBcblx0ICogICstLS0tLSstLS0tLS0tLS0tLS0tLS0rXG5cdCAqICB8ICBBICB8ICAgICAgQiAgICAgICAgfFxuXHQgKiAgKy0tLS0tKy0tLS0tLS0tLSstLS0tLStcblx0ICogIHwgICAgICAgIEMgICAgICB8ICBEICB8XG5cdCAqICArLS0tLS0tLS0tLS0tLS0tKy0tLS0tK1xuXHQgKiAgfCAgICAgICAgRSAgICAgIHwgIFggIHxcblx0ICogICstLS0tLS0tLS0tLS0tLS0rLS0tLS0rXG5cdCAqIGBgYFxuXHQgKlxuXHQgKiBAcGFyYW0gbmV3VmlldyBUaGUgdmlldyB0byBhZGQuXG5cdCAqIEBwYXJhbSBzaXplIEVpdGhlciBhIGZpeGVkIHNpemUsIG9yIGEgZHluYW1pYyB7QGxpbmsgU2l6aW5nfSBzdHJhdGVneS5cblx0ICogQHBhcmFtIHJlZmVyZW5jZVZpZXcgQW5vdGhlciB2aWV3IHRvIHBsYWNlIHRoaXMgbmV3IHZpZXcgbmV4dCB0by5cblx0ICogQHBhcmFtIGRpcmVjdGlvbiBUaGUgZGlyZWN0aW9uIHRoZSBuZXcgdmlldyBzaG91bGQgYmUgcGxhY2VkIG5leHQgdG8gdGhlIHJlZmVyZW5jZSB2aWV3LlxuXHQgKi9cblx0YWRkVmlldyhuZXdWaWV3OiBULCBzaXplOiBudW1iZXIgfCBTaXppbmcsIHJlZmVyZW5jZVZpZXc6IFQsIGRpcmVjdGlvbjogRGlyZWN0aW9uKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudmlld3MuaGFzKG5ld1ZpZXcpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NhblxcJ3QgYWRkIHNhbWUgdmlldyB0d2ljZScpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9yaWVudGF0aW9uID0gZ2V0RGlyZWN0aW9uT3JpZW50YXRpb24oZGlyZWN0aW9uKTtcblxuXHRcdGlmICh0aGlzLnZpZXdzLnNpemUgPT09IDEgJiYgdGhpcy5vcmllbnRhdGlvbiAhPT0gb3JpZW50YXRpb24pIHtcblx0XHRcdHRoaXMub3JpZW50YXRpb24gPSBvcmllbnRhdGlvbjtcblx0XHR9XG5cblx0XHRjb25zdCByZWZlcmVuY2VMb2NhdGlvbiA9IHRoaXMuZ2V0Vmlld0xvY2F0aW9uKHJlZmVyZW5jZVZpZXcpO1xuXHRcdGNvbnN0IGxvY2F0aW9uID0gZ2V0UmVsYXRpdmVMb2NhdGlvbih0aGlzLmdyaWR2aWV3Lm9yaWVudGF0aW9uLCByZWZlcmVuY2VMb2NhdGlvbiwgZGlyZWN0aW9uKTtcblxuXHRcdGxldCB2aWV3U2l6ZTogbnVtYmVyIHwgR3JpZFZpZXdTaXppbmc7XG5cblx0XHRpZiAodHlwZW9mIHNpemUgPT09ICdudW1iZXInKSB7XG5cdFx0XHR2aWV3U2l6ZSA9IHNpemU7XG5cdFx0fSBlbHNlIGlmIChzaXplLnR5cGUgPT09ICdzcGxpdCcpIHtcblx0XHRcdGNvbnN0IFssIGluZGV4XSA9IHRhaWwocmVmZXJlbmNlTG9jYXRpb24pO1xuXHRcdFx0dmlld1NpemUgPSBHcmlkVmlld1NpemluZy5TcGxpdChpbmRleCk7XG5cdFx0fSBlbHNlIGlmIChzaXplLnR5cGUgPT09ICdkaXN0cmlidXRlJykge1xuXHRcdFx0dmlld1NpemUgPSBHcmlkVmlld1NpemluZy5EaXN0cmlidXRlO1xuXHRcdH0gZWxzZSBpZiAoc2l6ZS50eXBlID09PSAnYXV0bycpIHtcblx0XHRcdGNvbnN0IFssIGluZGV4XSA9IHRhaWwocmVmZXJlbmNlTG9jYXRpb24pO1xuXHRcdFx0dmlld1NpemUgPSBHcmlkVmlld1NpemluZy5BdXRvKGluZGV4KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dmlld1NpemUgPSBzaXplO1xuXHRcdH1cblxuXHRcdHRoaXMuX2FkZFZpZXcobmV3Vmlldywgdmlld1NpemUsIGxvY2F0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgYWRkVmlld0F0KG5ld1ZpZXc6IFQsIHNpemU6IG51bWJlciB8IERpc3RyaWJ1dGVTaXppbmcgfCBJbnZpc2libGVTaXppbmcsIGxvY2F0aW9uOiBHcmlkTG9jYXRpb24pOiB2b2lkIHtcblx0XHRpZiAodGhpcy52aWV3cy5oYXMobmV3VmlldykpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2FuXFwndCBhZGQgc2FtZSB2aWV3IHR3aWNlJyk7XG5cdFx0fVxuXG5cdFx0bGV0IHZpZXdTaXplOiBudW1iZXIgfCBHcmlkVmlld1NpemluZztcblxuXHRcdGlmICh0eXBlb2Ygc2l6ZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdHZpZXdTaXplID0gc2l6ZTtcblx0XHR9IGVsc2UgaWYgKHNpemUudHlwZSA9PT0gJ2Rpc3RyaWJ1dGUnKSB7XG5cdFx0XHR2aWV3U2l6ZSA9IEdyaWRWaWV3U2l6aW5nLkRpc3RyaWJ1dGU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZpZXdTaXplID0gc2l6ZTtcblx0XHR9XG5cblx0XHR0aGlzLl9hZGRWaWV3KG5ld1ZpZXcsIHZpZXdTaXplLCBsb2NhdGlvbik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2FkZFZpZXcobmV3VmlldzogVCwgc2l6ZTogbnVtYmVyIHwgR3JpZFZpZXdTaXppbmcsIGxvY2F0aW9uOiBHcmlkTG9jYXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLnZpZXdzLnNldChuZXdWaWV3LCBuZXdWaWV3LmVsZW1lbnQpO1xuXHRcdHRoaXMuZ3JpZHZpZXcuYWRkVmlldyhuZXdWaWV3LCBzaXplLCBsb2NhdGlvbik7XG5cdH1cblxuXHQvKipcblx0ICogUmVtb3ZlIGEge0BsaW5rIElWaWV3IHZpZXd9IGZyb20gdGhpcyB7QGxpbmsgR3JpZH0uXG5cdCAqXG5cdCAqIEBwYXJhbSB2aWV3IFRoZSB7QGxpbmsgSVZpZXcgdmlld30gdG8gcmVtb3ZlLlxuXHQgKiBAcGFyYW0gc2l6aW5nIFdoZXRoZXIgdG8gZGlzdHJpYnV0ZSBvdGhlciB7QGxpbmsgSVZpZXcgdmlld30ncyBzaXplcy5cblx0ICovXG5cdHJlbW92ZVZpZXcodmlldzogVCwgc2l6aW5nPzogU2l6aW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudmlld3Muc2l6ZSA9PT0gMSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5cXCd0IHJlbW92ZSBsYXN0IHZpZXcnKTtcblx0XHR9XG5cblx0XHRjb25zdCBsb2NhdGlvbiA9IHRoaXMuZ2V0Vmlld0xvY2F0aW9uKHZpZXcpO1xuXG5cdFx0bGV0IGdyaWRWaWV3U2l6aW5nOiBEaXN0cmlidXRlU2l6aW5nIHwgU3BsaXRWaWV3QXV0b1NpemluZyB8IHVuZGVmaW5lZDtcblxuXHRcdGlmIChzaXppbmc/LnR5cGUgPT09ICdkaXN0cmlidXRlJykge1xuXHRcdFx0Z3JpZFZpZXdTaXppbmcgPSBHcmlkVmlld1NpemluZy5EaXN0cmlidXRlO1xuXHRcdH0gZWxzZSBpZiAoc2l6aW5nPy50eXBlID09PSAnYXV0bycpIHtcblx0XHRcdGNvbnN0IGluZGV4ID0gbG9jYXRpb25bbG9jYXRpb24ubGVuZ3RoIC0gMV07XG5cdFx0XHRncmlkVmlld1NpemluZyA9IEdyaWRWaWV3U2l6aW5nLkF1dG8oaW5kZXggPT09IDAgPyAxIDogaW5kZXggLSAxKTtcblx0XHR9XG5cblx0XHR0aGlzLmdyaWR2aWV3LnJlbW92ZVZpZXcobG9jYXRpb24sIGdyaWRWaWV3U2l6aW5nKTtcblx0XHR0aGlzLnZpZXdzLmRlbGV0ZSh2aWV3KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNb3ZlIGEge0BsaW5rIElWaWV3IHZpZXd9IHRvIGFub3RoZXIgbG9jYXRpb24gaW4gdGhlIGdyaWQuXG5cdCAqXG5cdCAqIEByZW1hcmtzIFNlZSB7QGxpbmsgR3JpZC5hZGRWaWV3fS5cblx0ICpcblx0ICogQHBhcmFtIHZpZXcgVGhlIHtAbGluayBJVmlldyB2aWV3fSB0byBtb3ZlLlxuXHQgKiBAcGFyYW0gc2l6aW5nIEVpdGhlciBhIGZpeGVkIHNpemUsIG9yIGEgZHluYW1pYyB7QGxpbmsgU2l6aW5nfSBzdHJhdGVneS5cblx0ICogQHBhcmFtIHJlZmVyZW5jZVZpZXcgQW5vdGhlciB2aWV3IHRvIHBsYWNlIHRoZSB2aWV3IG5leHQgdG8uXG5cdCAqIEBwYXJhbSBkaXJlY3Rpb24gVGhlIGRpcmVjdGlvbiB0aGUgdmlldyBzaG91bGQgYmUgcGxhY2VkIG5leHQgdG8gdGhlIHJlZmVyZW5jZSB2aWV3LlxuXHQgKi9cblx0bW92ZVZpZXcodmlldzogVCwgc2l6aW5nOiBudW1iZXIgfCBTaXppbmcsIHJlZmVyZW5jZVZpZXc6IFQsIGRpcmVjdGlvbjogRGlyZWN0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3Qgc291cmNlTG9jYXRpb24gPSB0aGlzLmdldFZpZXdMb2NhdGlvbih2aWV3KTtcblx0XHRjb25zdCBbc291cmNlUGFyZW50TG9jYXRpb24sIGZyb21dID0gdGFpbChzb3VyY2VMb2NhdGlvbik7XG5cblx0XHRjb25zdCByZWZlcmVuY2VMb2NhdGlvbiA9IHRoaXMuZ2V0Vmlld0xvY2F0aW9uKHJlZmVyZW5jZVZpZXcpO1xuXHRcdGNvbnN0IHRhcmdldExvY2F0aW9uID0gZ2V0UmVsYXRpdmVMb2NhdGlvbih0aGlzLmdyaWR2aWV3Lm9yaWVudGF0aW9uLCByZWZlcmVuY2VMb2NhdGlvbiwgZGlyZWN0aW9uKTtcblx0XHRjb25zdCBbdGFyZ2V0UGFyZW50TG9jYXRpb24sIHRvXSA9IHRhaWwodGFyZ2V0TG9jYXRpb24pO1xuXG5cdFx0aWYgKGVxdWFscyhzb3VyY2VQYXJlbnRMb2NhdGlvbiwgdGFyZ2V0UGFyZW50TG9jYXRpb24pKSB7XG5cdFx0XHR0aGlzLmdyaWR2aWV3Lm1vdmVWaWV3KHNvdXJjZVBhcmVudExvY2F0aW9uLCBmcm9tLCB0byk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucmVtb3ZlVmlldyh2aWV3LCB0eXBlb2Ygc2l6aW5nID09PSAnbnVtYmVyJyA/IHVuZGVmaW5lZCA6IHNpemluZyk7XG5cdFx0XHR0aGlzLmFkZFZpZXcodmlldywgc2l6aW5nLCByZWZlcmVuY2VWaWV3LCBkaXJlY3Rpb24pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBNb3ZlIGEge0BsaW5rIElWaWV3IHZpZXd9IHRvIGFub3RoZXIgbG9jYXRpb24gaW4gdGhlIGdyaWQuXG5cdCAqXG5cdCAqIEByZW1hcmtzIEludGVybmFsIG1ldGhvZCwgZG8gbm90IHVzZSB3aXRob3V0IGtub3dpbmcgd2hhdCB5b3UncmUgZG9pbmcuXG5cdCAqIEByZW1hcmtzIFNlZSB7QGxpbmsgR3JpZFZpZXcubW92ZVZpZXd9LlxuXHQgKlxuXHQgKiBAcGFyYW0gdmlldyBUaGUge0BsaW5rIElWaWV3IHZpZXd9IHRvIG1vdmUuXG5cdCAqIEBwYXJhbSBsb2NhdGlvbiBUaGUge0BsaW5rIEdyaWRMb2NhdGlvbiBsb2NhdGlvbn0gdG8gaW5zZXJ0IHRoZSB2aWV3IG9uLlxuXHQgKi9cblx0bW92ZVZpZXdUbyh2aWV3OiBULCBsb2NhdGlvbjogR3JpZExvY2F0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3Qgc291cmNlTG9jYXRpb24gPSB0aGlzLmdldFZpZXdMb2NhdGlvbih2aWV3KTtcblx0XHRjb25zdCBbc291cmNlUGFyZW50TG9jYXRpb24sIGZyb21dID0gdGFpbChzb3VyY2VMb2NhdGlvbik7XG5cdFx0Y29uc3QgW3RhcmdldFBhcmVudExvY2F0aW9uLCB0b10gPSB0YWlsKGxvY2F0aW9uKTtcblxuXHRcdGlmIChlcXVhbHMoc291cmNlUGFyZW50TG9jYXRpb24sIHRhcmdldFBhcmVudExvY2F0aW9uKSkge1xuXHRcdFx0dGhpcy5ncmlkdmlldy5tb3ZlVmlldyhzb3VyY2VQYXJlbnRMb2NhdGlvbiwgZnJvbSwgdG8pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBzaXplID0gdGhpcy5nZXRWaWV3U2l6ZSh2aWV3KTtcblx0XHRcdGNvbnN0IG9yaWVudGF0aW9uID0gZ2V0TG9jYXRpb25PcmllbnRhdGlvbih0aGlzLmdyaWR2aWV3Lm9yaWVudGF0aW9uLCBzb3VyY2VMb2NhdGlvbik7XG5cdFx0XHRjb25zdCBjYWNoZWRWaWV3U2l6ZSA9IHRoaXMuZ2V0Vmlld0NhY2hlZFZpc2libGVTaXplKHZpZXcpO1xuXHRcdFx0Y29uc3Qgc2l6aW5nID0gdHlwZW9mIGNhY2hlZFZpZXdTaXplID09PSAndW5kZWZpbmVkJ1xuXHRcdFx0XHQ/IChvcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IHNpemUud2lkdGggOiBzaXplLmhlaWdodClcblx0XHRcdFx0OiBTaXppbmcuSW52aXNpYmxlKGNhY2hlZFZpZXdTaXplKTtcblxuXHRcdFx0dGhpcy5yZW1vdmVWaWV3KHZpZXcpO1xuXHRcdFx0dGhpcy5hZGRWaWV3QXQodmlldywgc2l6aW5nLCBsb2NhdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFN3YXAgdHdvIHtAbGluayBJVmlldyB2aWV3c30gd2l0aGluIHRoZSB7QGxpbmsgR3JpZH0uXG5cdCAqXG5cdCAqIEBwYXJhbSBmcm9tIE9uZSB7QGxpbmsgSVZpZXcgdmlld30uXG5cdCAqIEBwYXJhbSB0byBBbm90aGVyIHtAbGluayBJVmlldyB2aWV3fS5cblx0ICovXG5cdHN3YXBWaWV3cyhmcm9tOiBULCB0bzogVCk6IHZvaWQge1xuXHRcdGNvbnN0IGZyb21Mb2NhdGlvbiA9IHRoaXMuZ2V0Vmlld0xvY2F0aW9uKGZyb20pO1xuXHRcdGNvbnN0IHRvTG9jYXRpb24gPSB0aGlzLmdldFZpZXdMb2NhdGlvbih0byk7XG5cdFx0cmV0dXJuIHRoaXMuZ3JpZHZpZXcuc3dhcFZpZXdzKGZyb21Mb2NhdGlvbiwgdG9Mb2NhdGlvbik7XG5cdH1cblxuXHQvKipcblx0ICogUmVzaXplIGEge0BsaW5rIElWaWV3IHZpZXd9LlxuXHQgKlxuXHQgKiBAcGFyYW0gdmlldyBUaGUge0BsaW5rIElWaWV3IHZpZXd9IHRvIHJlc2l6ZS5cblx0ICogQHBhcmFtIHNpemUgVGhlIHNpemUgdGhlIHZpZXcgc2hvdWxkIGJlLlxuXHQgKi9cblx0cmVzaXplVmlldyh2aWV3OiBULCBzaXplOiBJVmlld1NpemUpOiB2b2lkIHtcblx0XHRjb25zdCBsb2NhdGlvbiA9IHRoaXMuZ2V0Vmlld0xvY2F0aW9uKHZpZXcpO1xuXHRcdHJldHVybiB0aGlzLmdyaWR2aWV3LnJlc2l6ZVZpZXcobG9jYXRpb24sIHNpemUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgd2hldGhlciBhbGwgb3RoZXIge0BsaW5rIElWaWV3IHZpZXdzfSBhcmUgYXQgdGhlaXIgbWluaW11bSBzaXplLlxuXHQgKlxuXHQgKiBAcGFyYW0gdmlldyBUaGUgcmVmZXJlbmNlIHtAbGluayBJVmlldyB2aWV3fS5cblx0ICovXG5cdGlzVmlld0V4cGFuZGVkKHZpZXc6IFQpOiBib29sZWFuIHtcblx0XHRjb25zdCBsb2NhdGlvbiA9IHRoaXMuZ2V0Vmlld0xvY2F0aW9uKHZpZXcpO1xuXHRcdHJldHVybiB0aGlzLmdyaWR2aWV3LmlzVmlld0V4cGFuZGVkKGxvY2F0aW9uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIHtAbGluayBJVmlldyB2aWV3fSBpcyBtYXhpbWl6ZWQuXG5cdCAqXG5cdCAqIEBwYXJhbSB2aWV3IFRoZSByZWZlcmVuY2Uge0BsaW5rIElWaWV3IHZpZXd9LlxuXHQgKi9cblx0aXNWaWV3TWF4aW1pemVkKHZpZXc6IFQpOiBib29sZWFuIHtcblx0XHRjb25zdCBsb2NhdGlvbiA9IHRoaXMuZ2V0Vmlld0xvY2F0aW9uKHZpZXcpO1xuXHRcdHJldHVybiB0aGlzLmdyaWR2aWV3LmlzVmlld01heGltaXplZChsb2NhdGlvbik7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB3aGV0aGVyIHRoZSB7QGxpbmsgSVZpZXcgdmlld30gaXMgbWF4aW1pemVkLlxuXHQgKlxuXHQgKiBAcGFyYW0gdmlldyBUaGUgcmVmZXJlbmNlIHtAbGluayBJVmlldyB2aWV3fS5cblx0ICovXG5cdGhhc01heGltaXplZFZpZXcoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZ3JpZHZpZXcuaGFzTWF4aW1pemVkVmlldygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCB0aGUgc2l6ZSBvZiBhIHtAbGluayBJVmlldyB2aWV3fS5cblx0ICpcblx0ICogQHBhcmFtIHZpZXcgVGhlIHtAbGluayBJVmlldyB2aWV3fS4gUHJvdmlkZSBgdW5kZWZpbmVkYCB0byBnZXQgdGhlIHNpemVcblx0ICogb2YgdGhlIGdyaWQgaXRzZWxmLlxuXHQgKi9cblx0Z2V0Vmlld1NpemUodmlldz86IFQpOiBJVmlld1NpemUge1xuXHRcdGlmICghdmlldykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ3JpZHZpZXcuZ2V0Vmlld1NpemUoKTtcblx0XHR9XG5cblx0XHRjb25zdCBsb2NhdGlvbiA9IHRoaXMuZ2V0Vmlld0xvY2F0aW9uKHZpZXcpO1xuXHRcdHJldHVybiB0aGlzLmdyaWR2aWV3LmdldFZpZXdTaXplKGxvY2F0aW9uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIGNhY2hlZCB2aXNpYmxlIHNpemUgb2YgYSB7QGxpbmsgSVZpZXcgdmlld30uIFRoaXMgd2FzIHRoZSBzaXplXG5cdCAqIG9mIHRoZSB2aWV3IGF0IHRoZSBtb21lbnQgaXQgbGFzdCBiZWNhbWUgaGlkZGVuLlxuXHQgKlxuXHQgKiBAcGFyYW0gdmlldyBUaGUge0BsaW5rIElWaWV3IHZpZXd9LlxuXHQgKi9cblx0Z2V0Vmlld0NhY2hlZFZpc2libGVTaXplKHZpZXc6IFQpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGxvY2F0aW9uID0gdGhpcy5nZXRWaWV3TG9jYXRpb24odmlldyk7XG5cdFx0cmV0dXJuIHRoaXMuZ3JpZHZpZXcuZ2V0Vmlld0NhY2hlZFZpc2libGVTaXplKGxvY2F0aW9uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNYXhpbWl6ZXMgdGhlIHNwZWNpZmllZCB2aWV3IGFuZCBoaWRlcyBhbGwgb3RoZXIgdmlld3MuXG5cdCAqIEBwYXJhbSB2aWV3IFRoZSB2aWV3IHRvIG1heGltaXplLlxuXHQgKiBAcGFyYW0gZXhjbHVkZVZpZXdzIE9wdGlvbmFsIGFycmF5IG9mIHZpZXdzIHRvIGV4Y2x1ZGUgZnJvbSBiZWluZyBoaWRkZW4uXG5cdCAqL1xuXHRtYXhpbWl6ZVZpZXcodmlldzogVCwgZXhjbHVkZVZpZXdzOiByZWFkb25seSBUW10gPSBbXSkge1xuXHRcdGlmICh0aGlzLnZpZXdzLnNpemUgPCAyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0F0IGxlYXN0IHR3byB2aWV3cyBhcmUgcmVxdWlyZWQgdG8gbWF4aW1pemUgYSB2aWV3Jyk7XG5cdFx0fVxuXHRcdGNvbnN0IGxvY2F0aW9uID0gdGhpcy5nZXRWaWV3TG9jYXRpb24odmlldyk7XG5cdFx0dGhpcy5ncmlkdmlldy5tYXhpbWl6ZVZpZXcobG9jYXRpb24sIGV4Y2x1ZGVWaWV3cyk7XG5cdH1cblxuXHRleGl0TWF4aW1pemVkVmlldygpOiB2b2lkIHtcblx0XHR0aGlzLmdyaWR2aWV3LmV4aXRNYXhpbWl6ZWRWaWV3KCk7XG5cdH1cblxuXHQvKipcblx0ICogRXhwYW5kIHRoZSBzaXplIG9mIGEge0BsaW5rIElWaWV3IHZpZXd9IGJ5IGNvbGxhcHNpbmcgYWxsIG90aGVyIHZpZXdzXG5cdCAqIHRvIHRoZWlyIG1pbmltdW0gc2l6ZXMuXG5cdCAqXG5cdCAqIEBwYXJhbSB2aWV3IFRoZSB7QGxpbmsgSVZpZXcgdmlld30uXG5cdCAqL1xuXHRleHBhbmRWaWV3KHZpZXc6IFQpOiB2b2lkIHtcblx0XHRjb25zdCBsb2NhdGlvbiA9IHRoaXMuZ2V0Vmlld0xvY2F0aW9uKHZpZXcpO1xuXHRcdHRoaXMuZ3JpZHZpZXcuZXhwYW5kVmlldyhsb2NhdGlvbik7XG5cdH1cblxuXHQvKipcblx0ICogRGlzdHJpYnV0ZSB0aGUgc2l6ZSBhbW9uZyBhbGwge0BsaW5rIElWaWV3IHZpZXdzfSB3aXRoaW4gdGhlIGVudGlyZSBncmlkLlxuXHQgKi9cblx0ZGlzdHJpYnV0ZVZpZXdTaXplcygpOiB2b2lkIHtcblx0XHR0aGlzLmdyaWR2aWV3LmRpc3RyaWJ1dGVWaWV3U2l6ZXMoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgYSB7QGxpbmsgSVZpZXcgdmlld30gaXMgdmlzaWJsZS5cblx0ICpcblx0ICogQHBhcmFtIHZpZXcgVGhlIHtAbGluayBJVmlldyB2aWV3fS5cblx0ICovXG5cdGlzVmlld1Zpc2libGUodmlldzogVCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGxvY2F0aW9uID0gdGhpcy5nZXRWaWV3TG9jYXRpb24odmlldyk7XG5cdFx0cmV0dXJuIHRoaXMuZ3JpZHZpZXcuaXNWaWV3VmlzaWJsZShsb2NhdGlvbik7XG5cdH1cblxuXHQvKipcblx0ICogU2V0IHRoZSB2aXNpYmlsaXR5IHN0YXRlIG9mIGEge0BsaW5rIElWaWV3IHZpZXd9LlxuXHQgKlxuXHQgKiBAcGFyYW0gdmlldyBUaGUge0BsaW5rIElWaWV3IHZpZXd9LlxuXHQgKiBAcGFyYW0gc2l6aW5nIFdoZXRoZXIgdG8gcmVkaXN0cmlidXRlIHRoZSBjb250YWluaW5nIHtAbGluayBTcGxpdFZpZXd9IGFmdGVyIHJldmVhbGluZyB0aGUgdmlldy5cblx0ICovXG5cdHNldFZpZXdWaXNpYmxlKHZpZXc6IFQsIHZpc2libGU6IGJvb2xlYW4sIHNpemluZz86IERpc3RyaWJ1dGVTaXppbmcpOiB2b2lkIHtcblx0XHRjb25zdCBsb2NhdGlvbiA9IHRoaXMuZ2V0Vmlld0xvY2F0aW9uKHZpZXcpO1xuXHRcdHRoaXMuZ3JpZHZpZXcuc2V0Vmlld1Zpc2libGUobG9jYXRpb24sIHZpc2libGUpO1xuXHRcdGlmICh2aXNpYmxlICYmIHNpemluZz8udHlwZSA9PT0gJ2Rpc3RyaWJ1dGUnKSB7XG5cdFx0XHRjb25zdCBwYXJlbnRMb2NhdGlvbiA9IGxvY2F0aW9uLmxlbmd0aCA+IDAgPyB0YWlsKGxvY2F0aW9uKVswXSA6IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuZ3JpZHZpZXcuZGlzdHJpYnV0ZVZpZXdTaXplcyhwYXJlbnRMb2NhdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYSBkZXNjcmlwdG9yIGZvciB0aGUgZW50aXJlIGdyaWQuXG5cdCAqL1xuXHRnZXRWaWV3cygpOiBHcmlkQnJhbmNoTm9kZTxUPiB7XG5cdFx0cmV0dXJuIHRoaXMuZ3JpZHZpZXcuZ2V0VmlldygpIGFzIEdyaWRCcmFuY2hOb2RlPFQ+O1xuXHR9XG5cblx0LyoqXG5cdCAqIFV0aWxpdHkgbWV0aG9kIHRvIHJldHVybiB0aGUgY29sbGVjdGlvbiBhbGwgdmlld3Mgd2hpY2ggaW50ZXJzZWN0XG5cdCAqIGEgdmlldydzIGVkZ2UuXG5cdCAqXG5cdCAqIEBwYXJhbSB2aWV3IFRoZSB7QGxpbmsgSVZpZXcgdmlld30uXG5cdCAqIEBwYXJhbSBkaXJlY3Rpb24gV2hpY2ggZGlyZWN0aW9uIGVkZ2UgdG8gYmUgY29uc2lkZXJlZC5cblx0ICogQHBhcmFtIHdyYXAgV2hldGhlciB0aGUgZ3JpZCB3cmFwcyBhcm91bmQgKGZyb20gcmlnaHQgdG8gbGVmdCwgZnJvbSBib3R0b20gdG8gdG9wKS5cblx0ICovXG5cdGdldE5laWdoYm9yVmlld3ModmlldzogVCwgZGlyZWN0aW9uOiBEaXJlY3Rpb24sIHdyYXA6IGJvb2xlYW4gPSBmYWxzZSk6IFRbXSB7XG5cdFx0aWYgKCF0aGlzLmRpZExheW91dCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5cXCd0IGNhbGwgZ2V0TmVpZ2hib3JWaWV3cyBiZWZvcmUgZmlyc3QgbGF5b3V0Jyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLmdldFZpZXdMb2NhdGlvbih2aWV3KTtcblx0XHRjb25zdCByb290ID0gdGhpcy5nZXRWaWV3cygpO1xuXHRcdGNvbnN0IG5vZGUgPSBnZXRHcmlkTm9kZShyb290LCBsb2NhdGlvbik7XG5cdFx0bGV0IGJvdW5kYXJ5ID0gZ2V0Qm94Qm91bmRhcnkobm9kZS5ib3gsIGRpcmVjdGlvbik7XG5cblx0XHRpZiAod3JhcCkge1xuXHRcdFx0aWYgKGRpcmVjdGlvbiA9PT0gRGlyZWN0aW9uLlVwICYmIG5vZGUuYm94LnRvcCA9PT0gMCkge1xuXHRcdFx0XHRib3VuZGFyeSA9IHsgb2Zmc2V0OiByb290LmJveC50b3AgKyByb290LmJveC5oZWlnaHQsIHJhbmdlOiBib3VuZGFyeS5yYW5nZSB9O1xuXHRcdFx0fSBlbHNlIGlmIChkaXJlY3Rpb24gPT09IERpcmVjdGlvbi5SaWdodCAmJiBub2RlLmJveC5sZWZ0ICsgbm9kZS5ib3gud2lkdGggPT09IHJvb3QuYm94LndpZHRoKSB7XG5cdFx0XHRcdGJvdW5kYXJ5ID0geyBvZmZzZXQ6IDAsIHJhbmdlOiBib3VuZGFyeS5yYW5nZSB9O1xuXHRcdFx0fSBlbHNlIGlmIChkaXJlY3Rpb24gPT09IERpcmVjdGlvbi5Eb3duICYmIG5vZGUuYm94LnRvcCArIG5vZGUuYm94LmhlaWdodCA9PT0gcm9vdC5ib3guaGVpZ2h0KSB7XG5cdFx0XHRcdGJvdW5kYXJ5ID0geyBvZmZzZXQ6IDAsIHJhbmdlOiBib3VuZGFyeS5yYW5nZSB9O1xuXHRcdFx0fSBlbHNlIGlmIChkaXJlY3Rpb24gPT09IERpcmVjdGlvbi5MZWZ0ICYmIG5vZGUuYm94LmxlZnQgPT09IDApIHtcblx0XHRcdFx0Ym91bmRhcnkgPSB7IG9mZnNldDogcm9vdC5ib3gubGVmdCArIHJvb3QuYm94LndpZHRoLCByYW5nZTogYm91bmRhcnkucmFuZ2UgfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmluZEFkamFjZW50Qm94TGVhZk5vZGVzKHJvb3QsIG9wcG9zaXRlRGlyZWN0aW9uKGRpcmVjdGlvbiksIGJvdW5kYXJ5KVxuXHRcdFx0Lm1hcChub2RlID0+IG5vZGUudmlldyk7XG5cdH1cblxuXHRwcml2YXRlIGdldFZpZXdMb2NhdGlvbih2aWV3OiBUKTogR3JpZExvY2F0aW9uIHtcblx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy52aWV3cy5nZXQodmlldyk7XG5cblx0XHRpZiAoIWVsZW1lbnQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVmlldyBub3QgZm91bmQnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZ2V0R3JpZExvY2F0aW9uKGVsZW1lbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZFNhc2hSZXNldChsb2NhdGlvbjogR3JpZExvY2F0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVzaXplVG9QcmVmZXJyZWRTaXplID0gKGxvY2F0aW9uOiBHcmlkTG9jYXRpb24pOiBib29sZWFuID0+IHtcblx0XHRcdGNvbnN0IG5vZGUgPSB0aGlzLmdyaWR2aWV3LmdldFZpZXcobG9jYXRpb24pIGFzIEdyaWROb2RlPFQ+O1xuXG5cdFx0XHRpZiAoaXNHcmlkQnJhbmNoTm9kZShub2RlKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRpcmVjdGlvbiA9IGdldExvY2F0aW9uT3JpZW50YXRpb24odGhpcy5vcmllbnRhdGlvbiwgbG9jYXRpb24pO1xuXHRcdFx0Y29uc3Qgc2l6ZSA9IGRpcmVjdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IG5vZGUudmlldy5wcmVmZXJyZWRXaWR0aCA6IG5vZGUudmlldy5wcmVmZXJyZWRIZWlnaHQ7XG5cblx0XHRcdGlmICh0eXBlb2Ygc2l6ZSAhPT0gJ251bWJlcicpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB2aWV3U2l6ZSA9IGRpcmVjdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IHsgd2lkdGg6IE1hdGgucm91bmQoc2l6ZSkgfSA6IHsgaGVpZ2h0OiBNYXRoLnJvdW5kKHNpemUpIH07XG5cdFx0XHR0aGlzLmdyaWR2aWV3LnJlc2l6ZVZpZXcobG9jYXRpb24sIHZpZXdTaXplKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH07XG5cblx0XHRpZiAocmVzaXplVG9QcmVmZXJyZWRTaXplKGxvY2F0aW9uKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IFtwYXJlbnRMb2NhdGlvbiwgaW5kZXhdID0gdGFpbChsb2NhdGlvbik7XG5cblx0XHRpZiAocmVzaXplVG9QcmVmZXJyZWRTaXplKFsuLi5wYXJlbnRMb2NhdGlvbiwgaW5kZXggKyAxXSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmdyaWR2aWV3LmRpc3RyaWJ1dGVWaWV3U2l6ZXMocGFyZW50TG9jYXRpb24pO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlcmlhbGl6YWJsZVZpZXcgZXh0ZW5kcyBJVmlldyB7XG5cdHRvSlNPTigpOiBvYmplY3Q7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVZpZXdEZXNlcmlhbGl6ZXI8VCBleHRlbmRzIElTZXJpYWxpemFibGVWaWV3PiB7XG5cdGZyb21KU09OKGpzb246IGFueSk6IFQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlcmlhbGl6ZWRMZWFmTm9kZSB7XG5cdHR5cGU6ICdsZWFmJztcblx0ZGF0YTogdW5rbm93bjtcblx0c2l6ZTogbnVtYmVyO1xuXHR2aXNpYmxlPzogYm9vbGVhbjtcblx0bWF4aW1pemVkPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2VyaWFsaXplZEJyYW5jaE5vZGUge1xuXHR0eXBlOiAnYnJhbmNoJztcblx0ZGF0YTogSVNlcmlhbGl6ZWROb2RlW107XG5cdHNpemU6IG51bWJlcjtcblx0dmlzaWJsZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCB0eXBlIElTZXJpYWxpemVkTm9kZSA9IElTZXJpYWxpemVkTGVhZk5vZGUgfCBJU2VyaWFsaXplZEJyYW5jaE5vZGU7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlcmlhbGl6ZWRHcmlkIHtcblx0cm9vdDogSVNlcmlhbGl6ZWROb2RlO1xuXHRvcmllbnRhdGlvbjogT3JpZW50YXRpb247XG5cdHdpZHRoOiBudW1iZXI7XG5cdGhlaWdodDogbnVtYmVyO1xufVxuXG4vKipcbiAqIEEge0BsaW5rIEdyaWR9IHdoaWNoIGNhbiBzZXJpYWxpemUgaXRzZWxmLlxuICovXG5leHBvcnQgY2xhc3MgU2VyaWFsaXphYmxlR3JpZDxUIGV4dGVuZHMgSVNlcmlhbGl6YWJsZVZpZXc+IGV4dGVuZHMgR3JpZDxUPiB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgc2VyaWFsaXplTm9kZTxUIGV4dGVuZHMgSVNlcmlhbGl6YWJsZVZpZXc+KG5vZGU6IEdyaWROb2RlPFQ+LCBvcmllbnRhdGlvbjogT3JpZW50YXRpb24pOiBJU2VyaWFsaXplZE5vZGUge1xuXHRcdGNvbnN0IHNpemUgPSBvcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uVkVSVElDQUwgPyBub2RlLmJveC53aWR0aCA6IG5vZGUuYm94LmhlaWdodDtcblxuXHRcdGlmICghaXNHcmlkQnJhbmNoTm9kZShub2RlKSkge1xuXHRcdFx0Y29uc3Qgc2VyaWFsaXplZExlYWZOb2RlOiBJU2VyaWFsaXplZExlYWZOb2RlID0geyB0eXBlOiAnbGVhZicsIGRhdGE6IG5vZGUudmlldy50b0pTT04oKSwgc2l6ZSB9O1xuXG5cdFx0XHRpZiAodHlwZW9mIG5vZGUuY2FjaGVkVmlzaWJsZVNpemUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdHNlcmlhbGl6ZWRMZWFmTm9kZS5zaXplID0gbm9kZS5jYWNoZWRWaXNpYmxlU2l6ZTtcblx0XHRcdFx0c2VyaWFsaXplZExlYWZOb2RlLnZpc2libGUgPSBmYWxzZTtcblx0XHRcdH0gZWxzZSBpZiAobm9kZS5tYXhpbWl6ZWQpIHtcblx0XHRcdFx0c2VyaWFsaXplZExlYWZOb2RlLm1heGltaXplZCA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBzZXJpYWxpemVkTGVhZk5vZGU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGF0YSA9IG5vZGUuY2hpbGRyZW4ubWFwKGMgPT4gU2VyaWFsaXphYmxlR3JpZC5zZXJpYWxpemVOb2RlKGMsIG9ydGhvZ29uYWwob3JpZW50YXRpb24pKSk7XG5cdFx0aWYgKGRhdGEuc29tZShjID0+IGMudmlzaWJsZSAhPT0gZmFsc2UpKSB7XG5cdFx0XHRyZXR1cm4geyB0eXBlOiAnYnJhbmNoJywgZGF0YTogZGF0YSwgc2l6ZSB9O1xuXHRcdH1cblx0XHRyZXR1cm4geyB0eXBlOiAnYnJhbmNoJywgZGF0YTogZGF0YSwgc2l6ZSwgdmlzaWJsZTogZmFsc2UgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb25zdHJ1Y3QgYSBuZXcge0BsaW5rIFNlcmlhbGl6YWJsZUdyaWR9IGZyb20gYSBKU09OIG9iamVjdC5cblx0ICpcblx0ICogQHBhcmFtIGpzb24gVGhlIEpTT04gb2JqZWN0LlxuXHQgKiBAcGFyYW0gZGVzZXJpYWxpemVyIEEgZGVzZXJpYWxpemVyIHdoaWNoIGNhbiByZXZpdmUgZWFjaCB2aWV3LlxuXHQgKiBAcmV0dXJucyBBIG5ldyB7QGxpbmsgU2VyaWFsaXphYmxlR3JpZH0gaW5zdGFuY2UuXG5cdCAqL1xuXHRzdGF0aWMgZGVzZXJpYWxpemU8VCBleHRlbmRzIElTZXJpYWxpemFibGVWaWV3Pihqc29uOiBJU2VyaWFsaXplZEdyaWQsIGRlc2VyaWFsaXplcjogSVZpZXdEZXNlcmlhbGl6ZXI8VD4sIG9wdGlvbnM6IElHcmlkT3B0aW9ucyA9IHt9KTogU2VyaWFsaXphYmxlR3JpZDxUPiB7XG5cdFx0aWYgKHR5cGVvZiBqc29uLm9yaWVudGF0aW9uICE9PSAnbnVtYmVyJykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIEpTT046IFxcJ29yaWVudGF0aW9uXFwnIHByb3BlcnR5IG11c3QgYmUgYSBudW1iZXIuJyk7XG5cdFx0fSBlbHNlIGlmICh0eXBlb2YganNvbi53aWR0aCAhPT0gJ251bWJlcicpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBKU09OOiBcXCd3aWR0aFxcJyBwcm9wZXJ0eSBtdXN0IGJlIGEgbnVtYmVyLicpO1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIGpzb24uaGVpZ2h0ICE9PSAnbnVtYmVyJykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIEpTT046IFxcJ2hlaWdodFxcJyBwcm9wZXJ0eSBtdXN0IGJlIGEgbnVtYmVyLicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGdyaWR2aWV3ID0gR3JpZFZpZXcuZGVzZXJpYWxpemUoanNvbiwgZGVzZXJpYWxpemVyLCBvcHRpb25zKTtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgU2VyaWFsaXphYmxlR3JpZDxUPihncmlkdmlldywgb3B0aW9ucyk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnN0cnVjdCBhIG5ldyB7QGxpbmsgU2VyaWFsaXphYmxlR3JpZH0gZnJvbSBhIGdyaWQgZGVzY3JpcHRvci5cblx0ICpcblx0ICogQHBhcmFtIGdyaWREZXNjcmlwdG9yIEEgZ3JpZCBkZXNjcmlwdG9yIGluIHdoaWNoIGxlYWYgbm9kZXMgcG9pbnQgdG8gYWN0dWFsIHZpZXdzLlxuXHQgKiBAcmV0dXJucyBBIG5ldyB7QGxpbmsgU2VyaWFsaXphYmxlR3JpZH0gaW5zdGFuY2UuXG5cdCAqL1xuXHRzdGF0aWMgZnJvbTxUIGV4dGVuZHMgSVNlcmlhbGl6YWJsZVZpZXc+KGdyaWREZXNjcmlwdG9yOiBHcmlkRGVzY3JpcHRvcjxUPiwgb3B0aW9uczogSUdyaWRPcHRpb25zID0ge30pOiBTZXJpYWxpemFibGVHcmlkPFQ+IHtcblx0XHRyZXR1cm4gU2VyaWFsaXphYmxlR3JpZC5kZXNlcmlhbGl6ZShjcmVhdGVTZXJpYWxpemVkR3JpZChncmlkRGVzY3JpcHRvciksIHsgZnJvbUpTT046IHZpZXcgPT4gdmlldyB9LCBvcHRpb25zKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVc2VmdWwgaW5mb3JtYXRpb24gaW4gb3JkZXIgdG8gcHJvcG9ydGlvbmFsbHkgcmVzdG9yZSB2aWV3IHNpemVzXG5cdCAqIHVwb24gdGhlIHZlcnkgZmlyc3QgbGF5b3V0IGNhbGwuXG5cdCAqL1xuXHRwcml2YXRlIGluaXRpYWxMYXlvdXRDb250ZXh0OiBib29sZWFuID0gdHJ1ZTtcblxuXHQvKipcblx0ICogU2VyaWFsaXplIHRoaXMgZ3JpZCBpbnRvIGEgSlNPTiBvYmplY3QuXG5cdCAqL1xuXHRzZXJpYWxpemUoKTogSVNlcmlhbGl6ZWRHcmlkIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cm9vdDogU2VyaWFsaXphYmxlR3JpZC5zZXJpYWxpemVOb2RlKHRoaXMuZ2V0Vmlld3MoKSwgdGhpcy5vcmllbnRhdGlvbiksXG5cdFx0XHRvcmllbnRhdGlvbjogdGhpcy5vcmllbnRhdGlvbixcblx0XHRcdHdpZHRoOiB0aGlzLndpZHRoLFxuXHRcdFx0aGVpZ2h0OiB0aGlzLmhlaWdodFxuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSBsYXlvdXQod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHRvcDogbnVtYmVyID0gMCwgbGVmdDogbnVtYmVyID0gMCk6IHZvaWQge1xuXHRcdHN1cGVyLmxheW91dCh3aWR0aCwgaGVpZ2h0LCB0b3AsIGxlZnQpO1xuXG5cdFx0aWYgKHRoaXMuaW5pdGlhbExheW91dENvbnRleHQpIHtcblx0XHRcdHRoaXMuaW5pdGlhbExheW91dENvbnRleHQgPSBmYWxzZTtcblx0XHRcdHRoaXMuZ3JpZHZpZXcudHJ5U2V0MngyKCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCB0eXBlIEdyaWRMZWFmTm9kZURlc2NyaXB0b3I8VD4gPSB7IHNpemU/OiBudW1iZXI7IGRhdGE/OiBhbnkgfTtcbmV4cG9ydCB0eXBlIEdyaWRCcmFuY2hOb2RlRGVzY3JpcHRvcjxUPiA9IHsgc2l6ZT86IG51bWJlcjsgZ3JvdXBzOiBHcmlkTm9kZURlc2NyaXB0b3I8VD5bXSB9O1xuZXhwb3J0IHR5cGUgR3JpZE5vZGVEZXNjcmlwdG9yPFQ+ID0gR3JpZEJyYW5jaE5vZGVEZXNjcmlwdG9yPFQ+IHwgR3JpZExlYWZOb2RlRGVzY3JpcHRvcjxUPjtcbmV4cG9ydCB0eXBlIEdyaWREZXNjcmlwdG9yPFQ+ID0geyBvcmllbnRhdGlvbjogT3JpZW50YXRpb24gfSAmIEdyaWRCcmFuY2hOb2RlRGVzY3JpcHRvcjxUPjtcblxuZnVuY3Rpb24gaXNHcmlkQnJhbmNoTm9kZURlc2NyaXB0b3I8VD4obm9kZURlc2NyaXB0b3I6IEdyaWROb2RlRGVzY3JpcHRvcjxUPik6IG5vZGVEZXNjcmlwdG9yIGlzIEdyaWRCcmFuY2hOb2RlRGVzY3JpcHRvcjxUPiB7XG5cdHJldHVybiAhIShub2RlRGVzY3JpcHRvciBhcyBHcmlkQnJhbmNoTm9kZURlc2NyaXB0b3I8VD4pLmdyb3Vwcztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNhbml0aXplR3JpZE5vZGVEZXNjcmlwdG9yPFQ+KG5vZGVEZXNjcmlwdG9yOiBHcmlkTm9kZURlc2NyaXB0b3I8VD4sIHJvb3ROb2RlOiBib29sZWFuKTogdm9pZCB7XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRpZiAoIXJvb3ROb2RlICYmIChub2RlRGVzY3JpcHRvciBhcyBhbnkpLmdyb3VwcyAmJiAobm9kZURlc2NyaXB0b3IgYXMgYW55KS5ncm91cHMubGVuZ3RoIDw9IDEpIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHQobm9kZURlc2NyaXB0b3IgYXMgYW55KS5ncm91cHMgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRpZiAoIWlzR3JpZEJyYW5jaE5vZGVEZXNjcmlwdG9yKG5vZGVEZXNjcmlwdG9yKSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGxldCB0b3RhbERlZmluZWRTaXplID0gMDtcblx0bGV0IHRvdGFsRGVmaW5lZFNpemVDb3VudCA9IDA7XG5cblx0Zm9yIChjb25zdCBjaGlsZCBvZiBub2RlRGVzY3JpcHRvci5ncm91cHMpIHtcblx0XHRzYW5pdGl6ZUdyaWROb2RlRGVzY3JpcHRvcihjaGlsZCwgZmFsc2UpO1xuXG5cdFx0aWYgKGNoaWxkLnNpemUpIHtcblx0XHRcdHRvdGFsRGVmaW5lZFNpemUgKz0gY2hpbGQuc2l6ZTtcblx0XHRcdHRvdGFsRGVmaW5lZFNpemVDb3VudCsrO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IHRvdGFsVW5kZWZpbmVkU2l6ZSA9IHRvdGFsRGVmaW5lZFNpemVDb3VudCA+IDAgPyB0b3RhbERlZmluZWRTaXplIDogMTtcblx0Y29uc3QgdG90YWxVbmRlZmluZWRTaXplQ291bnQgPSBub2RlRGVzY3JpcHRvci5ncm91cHMubGVuZ3RoIC0gdG90YWxEZWZpbmVkU2l6ZUNvdW50O1xuXHRjb25zdCBlYWNoVW5kZWZpbmVkU2l6ZSA9IHRvdGFsVW5kZWZpbmVkU2l6ZSAvIHRvdGFsVW5kZWZpbmVkU2l6ZUNvdW50O1xuXG5cdGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZURlc2NyaXB0b3IuZ3JvdXBzKSB7XG5cdFx0aWYgKCFjaGlsZC5zaXplKSB7XG5cdFx0XHRjaGlsZC5zaXplID0gZWFjaFVuZGVmaW5lZFNpemU7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVNlcmlhbGl6ZWROb2RlPFQ+KG5vZGVEZXNjcmlwdG9yOiBHcmlkTm9kZURlc2NyaXB0b3I8VD4pOiBJU2VyaWFsaXplZE5vZGUge1xuXHRpZiAoaXNHcmlkQnJhbmNoTm9kZURlc2NyaXB0b3Iobm9kZURlc2NyaXB0b3IpKSB7XG5cdFx0cmV0dXJuIHsgdHlwZTogJ2JyYW5jaCcsIGRhdGE6IG5vZGVEZXNjcmlwdG9yLmdyb3Vwcy5tYXAoYyA9PiBjcmVhdGVTZXJpYWxpemVkTm9kZShjKSksIHNpemU6IG5vZGVEZXNjcmlwdG9yLnNpemUhIH07XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIHsgdHlwZTogJ2xlYWYnLCBkYXRhOiBub2RlRGVzY3JpcHRvci5kYXRhLCBzaXplOiBub2RlRGVzY3JpcHRvci5zaXplISB9O1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldERpbWVuc2lvbnMobm9kZTogSVNlcmlhbGl6ZWROb2RlLCBvcmllbnRhdGlvbjogT3JpZW50YXRpb24pOiB7IHdpZHRoPzogbnVtYmVyOyBoZWlnaHQ/OiBudW1iZXIgfSB7XG5cdGlmIChub2RlLnR5cGUgPT09ICdicmFuY2gnKSB7XG5cdFx0Y29uc3QgY2hpbGRyZW5EaW1lbnNpb25zID0gbm9kZS5kYXRhLm1hcChjID0+IGdldERpbWVuc2lvbnMoYywgb3J0aG9nb25hbChvcmllbnRhdGlvbikpKTtcblxuXHRcdGlmIChvcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uVkVSVElDQUwpIHtcblx0XHRcdGNvbnN0IHdpZHRoID0gbm9kZS5zaXplIHx8IChjaGlsZHJlbkRpbWVuc2lvbnMubGVuZ3RoID09PSAwID8gdW5kZWZpbmVkIDogTWF0aC5tYXgoLi4uY2hpbGRyZW5EaW1lbnNpb25zLm1hcChkID0+IGQud2lkdGggfHwgMCkpKTtcblx0XHRcdGNvbnN0IGhlaWdodCA9IGNoaWxkcmVuRGltZW5zaW9ucy5sZW5ndGggPT09IDAgPyB1bmRlZmluZWQgOiBjaGlsZHJlbkRpbWVuc2lvbnMucmVkdWNlKChyLCBkKSA9PiByICsgKGQuaGVpZ2h0IHx8IDApLCAwKTtcblx0XHRcdHJldHVybiB7IHdpZHRoLCBoZWlnaHQgfTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgd2lkdGggPSBjaGlsZHJlbkRpbWVuc2lvbnMubGVuZ3RoID09PSAwID8gdW5kZWZpbmVkIDogY2hpbGRyZW5EaW1lbnNpb25zLnJlZHVjZSgociwgZCkgPT4gciArIChkLndpZHRoIHx8IDApLCAwKTtcblx0XHRcdGNvbnN0IGhlaWdodCA9IG5vZGUuc2l6ZSB8fCAoY2hpbGRyZW5EaW1lbnNpb25zLmxlbmd0aCA9PT0gMCA/IHVuZGVmaW5lZCA6IE1hdGgubWF4KC4uLmNoaWxkcmVuRGltZW5zaW9ucy5tYXAoZCA9PiBkLmhlaWdodCB8fCAwKSkpO1xuXHRcdFx0cmV0dXJuIHsgd2lkdGgsIGhlaWdodCB9O1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRjb25zdCB3aWR0aCA9IG9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5WRVJUSUNBTCA/IG5vZGUuc2l6ZSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBoZWlnaHQgPSBvcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uVkVSVElDQUwgPyB1bmRlZmluZWQgOiBub2RlLnNpemU7XG5cdFx0cmV0dXJuIHsgd2lkdGgsIGhlaWdodCB9O1xuXHR9XG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBKU09OIG9iamVjdCBmcm9tIGEge0BsaW5rIEdyaWREZXNjcmlwdG9yfSwgd2hpY2ggY2FuXG4gKiBiZSBkZXNlcmlhbGl6ZWQgYnkge0BsaW5rIFNlcmlhbGl6YWJsZUdyaWQuZGVzZXJpYWxpemV9LlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlU2VyaWFsaXplZEdyaWQ8VD4oZ3JpZERlc2NyaXB0b3I6IEdyaWREZXNjcmlwdG9yPFQ+KTogSVNlcmlhbGl6ZWRHcmlkIHtcblx0c2FuaXRpemVHcmlkTm9kZURlc2NyaXB0b3IoZ3JpZERlc2NyaXB0b3IsIHRydWUpO1xuXG5cdGNvbnN0IHJvb3QgPSBjcmVhdGVTZXJpYWxpemVkTm9kZShncmlkRGVzY3JpcHRvcik7XG5cdGNvbnN0IHsgd2lkdGgsIGhlaWdodCB9ID0gZ2V0RGltZW5zaW9ucyhyb290LCBncmlkRGVzY3JpcHRvci5vcmllbnRhdGlvbik7XG5cblx0cmV0dXJuIHtcblx0XHRyb290LFxuXHRcdG9yaWVudGF0aW9uOiBncmlkRGVzY3JpcHRvci5vcmllbnRhdGlvbixcblx0XHR3aWR0aDogd2lkdGggfHwgMSxcblx0XHRoZWlnaHQ6IGhlaWdodCB8fCAxXG5cdH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUEwQixtQkFBbUI7QUFDN0MsU0FBUyxRQUFRLFlBQVk7QUFFN0IsU0FBUyxrQkFBa0I7QUFDM0IsT0FBTztBQUNQLFNBQWMsVUFBZ0YsWUFBWSxVQUFVLHNCQUFvQztBQUl4SixTQUFTLGdCQUFnQixlQUFBQSxjQUFhLGNBQUFD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cUIsQ0FBQyxDQUFDLEdBQUcsTUFBTSxlQUFlLEtBQU07QUFBQSxFQUNwSCxPQUFPO0FBQ04sV0FBTyxFQUFFLE1BQU0sUUFBUSxNQUFNLGVBQWUsTUFBTSxNQUFNLGVBQWUsS0FBTTtBQUFBLEVBQzlFO0FBQ0Q7QUFFQSxTQUFTLGNBQWMsTUFBdUIsYUFBK0Q7QUFDNUcsTUFBSSxLQUFLLFNBQVMsVUFBVTtBQUMzQixVQUFNLHFCQUFxQixLQUFLLEtBQUssSUFBSSxPQUFLLGNBQWMsR0FBRyxXQUFXLFdBQVcsQ0FBQyxDQUFDO0FBRXZGLFFBQUksZ0JBQWdCLFlBQVksVUFBVTtBQUN6QyxZQUFNLFFBQVEsS0FBSyxTQUFTLG1CQUFtQixXQUFXLElBQUksU0FBWSxLQUFLLElBQUksR0FBRyxtQkFBbUIsSUFBSSxPQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7QUFDL0gsWUFBTSxTQUFTLG1CQUFtQixXQUFXLElBQUksU0FBWSxtQkFBbUIsT0FBTyxDQUFDLEdBQUcsTUFBTSxLQUFLLEVBQUUsVUFBVSxJQUFJLENBQUM7QUFDdkgsYUFBTyxFQUFFLE9BQU8sT0FBTztBQUFBLElBQ3hCLE9BQU87QUFDTixZQUFNLFFBQVEsbUJBQW1CLFdBQVcsSUFBSSxTQUFZLG1CQUFtQixPQUFPLENBQUMsR0FBRyxNQUFNLEtBQUssRUFBRSxTQUFTLElBQUksQ0FBQztBQUNySCxZQUFNLFNBQVMsS0FBSyxTQUFTLG1CQUFtQixXQUFXLElBQUksU0FBWSxLQUFLLElBQUksR0FBRyxtQkFBbUIsSUFBSSxPQUFLLEVBQUUsVUFBVSxDQUFDLENBQUM7QUFDakksYUFBTyxFQUFFLE9BQU8sT0FBTztBQUFBLElBQ3hCO0FBQUEsRUFDRCxPQUFPO0FBQ04sVUFBTSxRQUFRLGdCQUFnQixZQUFZLFdBQVcsS0FBSyxPQUFPO0FBQ2pFLFVBQU0sU0FBUyxnQkFBZ0IsWUFBWSxXQUFXLFNBQVksS0FBSztBQUN2RSxXQUFPLEVBQUUsT0FBTyxPQUFPO0FBQUEsRUFDeEI7QUFDRDtBQU1PLFNBQVMscUJBQXdCLGdCQUFvRDtBQUMzRiw2QkFBMkIsZ0JBQWdCLElBQUk7QUFFL0MsUUFBTSxPQUFPLHFCQUFxQixjQUFjO0FBQ2hELFFBQU0sRUFBRSxPQUFPLE9BQU8sSUFBSSxjQUFjLE1BQU0sZUFBZSxXQUFXO0FBRXhFLFNBQU87QUFBQSxJQUNOO0FBQUEsSUFDQSxhQUFhLGVBQWU7QUFBQSxJQUM1QixPQUFPLFNBQVM7QUFBQSxJQUNoQixRQUFRLFVBQVU7QUFBQSxFQUNuQjtBQUNEOyIsCiAgIm5hbWVzIjogWyJPcmllbnRhdGlvbiIsICJvcnRob2dvbmFsIiwgIkRpcmVjdGlvbiIsICJib3hOb2RlIiwgImRpcmVjdGlvbiIsICJib3VuZGFyeSIsICJTaXppbmciLCAibm9kZSIsICJsb2NhdGlvbiJdCn0K
