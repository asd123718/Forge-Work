import { $ } from "../../dom.js";
import { Orientation } from "../sash/sash.js";
import { LayoutPriority, Sizing, SplitView } from "../splitview/splitview.js";
import { equals as arrayEquals, tail } from "../../../common/arrays.js";
import { Color } from "../../../common/color.js";
import { Emitter, Event, Relay } from "../../../common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../common/lifecycle.js";
import { rot } from "../../../common/numbers.js";
import { isUndefined } from "../../../common/types.js";
import "./gridview.css";
import { Orientation as Orientation2 } from "../sash/sash.js";
import { LayoutPriority as LayoutPriority2, Sizing as Sizing2 } from "../splitview/splitview.js";
const defaultStyles = {
  separatorBorder: Color.transparent
};
function orthogonal(orientation) {
  return orientation === Orientation.VERTICAL ? Orientation.HORIZONTAL : Orientation.VERTICAL;
}
function isGridBranchNode(node) {
  return !!node.children;
}
class LayoutController {
  constructor(isLayoutEnabled) {
    this.isLayoutEnabled = isLayoutEnabled;
  }
}
function toAbsoluteBoundarySashes(sashes, orientation) {
  if (orientation === Orientation.HORIZONTAL) {
    return { left: sashes.start, right: sashes.end, top: sashes.orthogonalStart, bottom: sashes.orthogonalEnd };
  } else {
    return { top: sashes.start, bottom: sashes.end, left: sashes.orthogonalStart, right: sashes.orthogonalEnd };
  }
}
function fromAbsoluteBoundarySashes(sashes, orientation) {
  if (orientation === Orientation.HORIZONTAL) {
    return { start: sashes.left, end: sashes.right, orthogonalStart: sashes.top, orthogonalEnd: sashes.bottom };
  } else {
    return { start: sashes.top, end: sashes.bottom, orthogonalStart: sashes.left, orthogonalEnd: sashes.right };
  }
}
function validateIndex(index, numChildren) {
  if (Math.abs(index) > numChildren) {
    throw new Error("Invalid index");
  }
  return rot(index, numChildren + 1);
}
class BranchNode {
  constructor(orientation, layoutController, styles, splitviewProportionalLayout, size = 0, orthogonalSize = 0, edgeSnapping = false, childDescriptors) {
    this.orientation = orientation;
    this.layoutController = layoutController;
    this.splitviewProportionalLayout = splitviewProportionalLayout;
    this.children = [];
    this._absoluteOffset = 0;
    this._absoluteOrthogonalOffset = 0;
    this.absoluteOrthogonalSize = 0;
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
    this._onDidVisibilityChange = new Emitter();
    this.onDidVisibilityChange = this._onDidVisibilityChange.event;
    this.childrenVisibilityChangeDisposable = new DisposableStore();
    this._onDidScroll = new Emitter();
    this.onDidScrollDisposable = Disposable.None;
    this.onDidScroll = this._onDidScroll.event;
    this.childrenChangeDisposable = Disposable.None;
    this._onDidSashReset = new Emitter();
    this.onDidSashReset = this._onDidSashReset.event;
    this.splitviewSashResetDisposable = Disposable.None;
    this.childrenSashResetDisposable = Disposable.None;
    this._boundarySashes = {};
    this._edgeSnapping = false;
    this._styles = styles;
    this._size = size;
    this._orthogonalSize = orthogonalSize;
    this.element = $(".monaco-grid-branch-node");
    if (!childDescriptors) {
      this.splitview = new SplitView(this.element, { orientation, styles, proportionalLayout: splitviewProportionalLayout });
      this.splitview.layout(size, { orthogonalSize, absoluteOffset: 0, absoluteOrthogonalOffset: 0, absoluteSize: size, absoluteOrthogonalSize: orthogonalSize });
    } else {
      const descriptor = {
        views: childDescriptors.map((childDescriptor) => {
          return {
            view: childDescriptor.node,
            size: childDescriptor.node.size,
            visible: childDescriptor.visible !== false
          };
        }),
        size: this.orthogonalSize
      };
      const options = { proportionalLayout: splitviewProportionalLayout, orientation, styles };
      this.children = childDescriptors.map((c) => c.node);
      this.splitview = new SplitView(this.element, { ...options, descriptor });
      this.children.forEach((node, index) => {
        const first = index === 0;
        const last = index === this.children.length;
        node.boundarySashes = {
          start: this.boundarySashes.orthogonalStart,
          end: this.boundarySashes.orthogonalEnd,
          orthogonalStart: first ? this.boundarySashes.start : this.splitview.sashes[index - 1],
          orthogonalEnd: last ? this.boundarySashes.end : this.splitview.sashes[index]
        };
      });
    }
    const onDidSashReset = Event.map(this.splitview.onDidSashReset, (i) => [i]);
    this.splitviewSashResetDisposable = onDidSashReset(this._onDidSashReset.fire, this._onDidSashReset);
    this.updateChildrenEvents();
  }
  get size() {
    return this._size;
  }
  get orthogonalSize() {
    return this._orthogonalSize;
  }
  get absoluteOffset() {
    return this._absoluteOffset;
  }
  get absoluteOrthogonalOffset() {
    return this._absoluteOrthogonalOffset;
  }
  get styles() {
    return this._styles;
  }
  get width() {
    return this.orientation === Orientation.HORIZONTAL ? this.size : this.orthogonalSize;
  }
  get height() {
    return this.orientation === Orientation.HORIZONTAL ? this.orthogonalSize : this.size;
  }
  get top() {
    return this.orientation === Orientation.HORIZONTAL ? this._absoluteOffset : this._absoluteOrthogonalOffset;
  }
  get left() {
    return this.orientation === Orientation.HORIZONTAL ? this._absoluteOrthogonalOffset : this._absoluteOffset;
  }
  get minimumSize() {
    return this.children.length === 0 ? 0 : Math.max(...this.children.map((c, index) => this.splitview.isViewVisible(index) ? c.minimumOrthogonalSize : 0));
  }
  get maximumSize() {
    return Math.min(...this.children.map((c, index) => this.splitview.isViewVisible(index) ? c.maximumOrthogonalSize : Number.POSITIVE_INFINITY));
  }
  get priority() {
    if (this.children.length === 0) {
      return LayoutPriority.Normal;
    }
    const priorities = this.children.map((c) => typeof c.priority === "undefined" ? LayoutPriority.Normal : c.priority);
    if (priorities.some((p) => p === LayoutPriority.High)) {
      return LayoutPriority.High;
    } else if (priorities.some((p) => p === LayoutPriority.Low)) {
      return LayoutPriority.Low;
    }
    return LayoutPriority.Normal;
  }
  get proportionalLayout() {
    if (this.children.length === 0) {
      return true;
    }
    return this.children.every((c) => c.proportionalLayout);
  }
  get minimumOrthogonalSize() {
    return this.splitview.minimumSize;
  }
  get maximumOrthogonalSize() {
    return this.splitview.maximumSize;
  }
  get minimumWidth() {
    return this.orientation === Orientation.HORIZONTAL ? this.minimumOrthogonalSize : this.minimumSize;
  }
  get minimumHeight() {
    return this.orientation === Orientation.HORIZONTAL ? this.minimumSize : this.minimumOrthogonalSize;
  }
  get maximumWidth() {
    return this.orientation === Orientation.HORIZONTAL ? this.maximumOrthogonalSize : this.maximumSize;
  }
  get maximumHeight() {
    return this.orientation === Orientation.HORIZONTAL ? this.maximumSize : this.maximumOrthogonalSize;
  }
  get boundarySashes() {
    return this._boundarySashes;
  }
  set boundarySashes(boundarySashes) {
    if (this._boundarySashes.start === boundarySashes.start && this._boundarySashes.end === boundarySashes.end && this._boundarySashes.orthogonalStart === boundarySashes.orthogonalStart && this._boundarySashes.orthogonalEnd === boundarySashes.orthogonalEnd) {
      return;
    }
    this._boundarySashes = boundarySashes;
    this.splitview.orthogonalStartSash = boundarySashes.orthogonalStart;
    this.splitview.orthogonalEndSash = boundarySashes.orthogonalEnd;
    for (let index = 0; index < this.children.length; index++) {
      const child = this.children[index];
      const first = index === 0;
      const last = index === this.children.length - 1;
      child.boundarySashes = {
        start: boundarySashes.orthogonalStart,
        end: boundarySashes.orthogonalEnd,
        orthogonalStart: first ? boundarySashes.start : child.boundarySashes.orthogonalStart,
        orthogonalEnd: last ? boundarySashes.end : child.boundarySashes.orthogonalEnd
      };
    }
  }
  get edgeSnapping() {
    return this._edgeSnapping;
  }
  set edgeSnapping(edgeSnapping) {
    if (this._edgeSnapping === edgeSnapping) {
      return;
    }
    this._edgeSnapping = edgeSnapping;
    for (const child of this.children) {
      if (child instanceof BranchNode) {
        child.edgeSnapping = edgeSnapping;
      }
    }
    this.updateSplitviewEdgeSnappingEnablement();
  }
  style(styles) {
    this._styles = styles;
    this.splitview.style(styles);
    for (const child of this.children) {
      if (child instanceof BranchNode) {
        child.style(styles);
      }
    }
  }
  layout(size, offset, ctx) {
    if (!this.layoutController.isLayoutEnabled) {
      return;
    }
    if (typeof ctx === "undefined") {
      throw new Error("Invalid state");
    }
    this._size = ctx.orthogonalSize;
    this._orthogonalSize = size;
    this._absoluteOffset = ctx.absoluteOffset + offset;
    this._absoluteOrthogonalOffset = ctx.absoluteOrthogonalOffset;
    this.absoluteOrthogonalSize = ctx.absoluteOrthogonalSize;
    this.splitview.layout(ctx.orthogonalSize, {
      orthogonalSize: size,
      absoluteOffset: this._absoluteOrthogonalOffset,
      absoluteOrthogonalOffset: this._absoluteOffset,
      absoluteSize: ctx.absoluteOrthogonalSize,
      absoluteOrthogonalSize: ctx.absoluteSize
    });
    this.updateSplitviewEdgeSnappingEnablement();
  }
  setVisible(visible) {
    for (const child of this.children) {
      child.setVisible(visible);
    }
  }
  addChild(node, size, index, skipLayout) {
    index = validateIndex(index, this.children.length);
    this.splitview.addView(node, size, index, skipLayout);
    this.children.splice(index, 0, node);
    this.updateBoundarySashes();
    this.onDidChildrenChange();
  }
  removeChild(index, sizing) {
    index = validateIndex(index, this.children.length);
    const result = this.splitview.removeView(index, sizing);
    this.children.splice(index, 1);
    this.updateBoundarySashes();
    this.onDidChildrenChange();
    return result;
  }
  removeAllChildren() {
    const result = this.splitview.removeAllViews();
    this.children.splice(0, this.children.length);
    this.updateBoundarySashes();
    this.onDidChildrenChange();
    return result;
  }
  moveChild(from, to) {
    from = validateIndex(from, this.children.length);
    to = validateIndex(to, this.children.length);
    if (from === to) {
      return;
    }
    if (from < to) {
      to -= 1;
    }
    this.splitview.moveView(from, to);
    this.children.splice(to, 0, this.children.splice(from, 1)[0]);
    this.updateBoundarySashes();
    this.onDidChildrenChange();
  }
  swapChildren(from, to) {
    from = validateIndex(from, this.children.length);
    to = validateIndex(to, this.children.length);
    if (from === to) {
      return;
    }
    this.splitview.swapViews(from, to);
    [this.children[from].boundarySashes, this.children[to].boundarySashes] = [this.children[from].boundarySashes, this.children[to].boundarySashes];
    [this.children[from], this.children[to]] = [this.children[to], this.children[from]];
    this.onDidChildrenChange();
  }
  resizeChild(index, size) {
    index = validateIndex(index, this.children.length);
    this.splitview.resizeView(index, size);
  }
  isChildExpanded(index) {
    return this.splitview.isViewExpanded(index);
  }
  distributeViewSizes(recursive = false) {
    this.splitview.distributeViewSizes();
    if (recursive) {
      for (const child of this.children) {
        if (child instanceof BranchNode) {
          child.distributeViewSizes(true);
        }
      }
    }
  }
  getChildSize(index) {
    index = validateIndex(index, this.children.length);
    return this.splitview.getViewSize(index);
  }
  isChildVisible(index) {
    index = validateIndex(index, this.children.length);
    return this.splitview.isViewVisible(index);
  }
  setChildVisible(index, visible) {
    index = validateIndex(index, this.children.length);
    if (this.splitview.isViewVisible(index) === visible) {
      return;
    }
    const wereAllChildrenHidden = this.splitview.contentSize === 0;
    this.splitview.setViewVisible(index, visible);
    const areAllChildrenHidden = this.splitview.contentSize === 0;
    if (visible && wereAllChildrenHidden || !visible && areAllChildrenHidden) {
      this._onDidVisibilityChange.fire(visible);
    }
  }
  getChildCachedVisibleSize(index) {
    index = validateIndex(index, this.children.length);
    return this.splitview.getViewCachedVisibleSize(index);
  }
  updateBoundarySashes() {
    for (let i = 0; i < this.children.length; i++) {
      this.children[i].boundarySashes = {
        start: this.boundarySashes.orthogonalStart,
        end: this.boundarySashes.orthogonalEnd,
        orthogonalStart: i === 0 ? this.boundarySashes.start : this.splitview.sashes[i - 1],
        orthogonalEnd: i === this.children.length - 1 ? this.boundarySashes.end : this.splitview.sashes[i]
      };
    }
  }
  onDidChildrenChange() {
    this.updateChildrenEvents();
    this._onDidChange.fire(void 0);
  }
  updateChildrenEvents() {
    const onDidChildrenChange = Event.map(Event.any(...this.children.map((c) => c.onDidChange)), () => void 0);
    this.childrenChangeDisposable.dispose();
    this.childrenChangeDisposable = onDidChildrenChange(this._onDidChange.fire, this._onDidChange);
    const onDidChildrenSashReset = Event.any(...this.children.map((c, i) => Event.map(c.onDidSashReset, (location) => [i, ...location])));
    this.childrenSashResetDisposable.dispose();
    this.childrenSashResetDisposable = onDidChildrenSashReset(this._onDidSashReset.fire, this._onDidSashReset);
    const onDidScroll = Event.any(Event.signal(this.splitview.onDidScroll), ...this.children.map((c) => c.onDidScroll));
    this.onDidScrollDisposable.dispose();
    this.onDidScrollDisposable = onDidScroll(this._onDidScroll.fire, this._onDidScroll);
    this.childrenVisibilityChangeDisposable.clear();
    this.children.forEach((child, index) => {
      if (child instanceof BranchNode) {
        this.childrenVisibilityChangeDisposable.add(child.onDidVisibilityChange((visible) => {
          this.setChildVisible(index, visible);
        }));
      }
    });
  }
  trySet2x2(other) {
    if (this.children.length !== 2 || other.children.length !== 2) {
      return Disposable.None;
    }
    if (this.getChildSize(0) !== other.getChildSize(0)) {
      return Disposable.None;
    }
    const [firstChild, secondChild] = this.children;
    const [otherFirstChild, otherSecondChild] = other.children;
    if (!(firstChild instanceof LeafNode) || !(secondChild instanceof LeafNode)) {
      return Disposable.None;
    }
    if (!(otherFirstChild instanceof LeafNode) || !(otherSecondChild instanceof LeafNode)) {
      return Disposable.None;
    }
    if (this.orientation === Orientation.VERTICAL) {
      secondChild.linkedWidthNode = otherFirstChild.linkedHeightNode = firstChild;
      firstChild.linkedWidthNode = otherSecondChild.linkedHeightNode = secondChild;
      otherSecondChild.linkedWidthNode = firstChild.linkedHeightNode = otherFirstChild;
      otherFirstChild.linkedWidthNode = secondChild.linkedHeightNode = otherSecondChild;
    } else {
      otherFirstChild.linkedWidthNode = secondChild.linkedHeightNode = firstChild;
      otherSecondChild.linkedWidthNode = firstChild.linkedHeightNode = secondChild;
      firstChild.linkedWidthNode = otherSecondChild.linkedHeightNode = otherFirstChild;
      secondChild.linkedWidthNode = otherFirstChild.linkedHeightNode = otherSecondChild;
    }
    const mySash = this.splitview.sashes[0];
    const otherSash = other.splitview.sashes[0];
    mySash.linkedSash = otherSash;
    otherSash.linkedSash = mySash;
    this._onDidChange.fire(void 0);
    other._onDidChange.fire(void 0);
    return toDisposable(() => {
      mySash.linkedSash = otherSash.linkedSash = void 0;
      firstChild.linkedHeightNode = firstChild.linkedWidthNode = void 0;
      secondChild.linkedHeightNode = secondChild.linkedWidthNode = void 0;
      otherFirstChild.linkedHeightNode = otherFirstChild.linkedWidthNode = void 0;
      otherSecondChild.linkedHeightNode = otherSecondChild.linkedWidthNode = void 0;
    });
  }
  updateSplitviewEdgeSnappingEnablement() {
    this.splitview.startSnappingEnabled = this._edgeSnapping || this._absoluteOrthogonalOffset > 0;
    this.splitview.endSnappingEnabled = this._edgeSnapping || this._absoluteOrthogonalOffset + this._size < this.absoluteOrthogonalSize;
  }
  dispose() {
    for (const child of this.children) {
      child.dispose();
    }
    this._onDidChange.dispose();
    this._onDidScroll.dispose();
    this._onDidSashReset.dispose();
    this._onDidVisibilityChange.dispose();
    this.childrenVisibilityChangeDisposable.dispose();
    this.splitviewSashResetDisposable.dispose();
    this.childrenSashResetDisposable.dispose();
    this.childrenChangeDisposable.dispose();
    this.onDidScrollDisposable.dispose();
    this.splitview.dispose();
  }
}
function createLatchedOnDidChangeViewEvent(view) {
  const [onDidChangeViewConstraints, onDidSetViewSize] = Event.split(view.onDidChange, isUndefined);
  return Event.any(
    onDidSetViewSize,
    Event.map(
      Event.latch(
        Event.map(onDidChangeViewConstraints, (_) => [view.minimumWidth, view.maximumWidth, view.minimumHeight, view.maximumHeight]),
        arrayEquals
      ),
      (_) => void 0
    )
  );
}
class LeafNode {
  constructor(view, orientation, layoutController, orthogonalSize, size = 0) {
    this.view = view;
    this.orientation = orientation;
    this.layoutController = layoutController;
    this._size = 0;
    this.absoluteOffset = 0;
    this.absoluteOrthogonalOffset = 0;
    this.onDidScroll = Event.None;
    this.onDidSashReset = Event.None;
    this._onDidLinkedWidthNodeChange = new Relay();
    this._linkedWidthNode = void 0;
    this._onDidLinkedHeightNodeChange = new Relay();
    this._linkedHeightNode = void 0;
    this._onDidSetLinkedNode = new Emitter();
    this.disposables = new DisposableStore();
    this._boundarySashes = {};
    this.cachedWidth = 0;
    this.cachedHeight = 0;
    this.cachedTop = 0;
    this.cachedLeft = 0;
    this._orthogonalSize = orthogonalSize;
    this._size = size;
    const onDidChange = createLatchedOnDidChangeViewEvent(view);
    this._onDidViewChange = Event.map(onDidChange, (e) => e && (this.orientation === Orientation.VERTICAL ? e.width : e.height), this.disposables);
    this.onDidChange = Event.any(this._onDidViewChange, this._onDidSetLinkedNode.event, this._onDidLinkedWidthNodeChange.event, this._onDidLinkedHeightNodeChange.event);
  }
  get size() {
    return this._size;
  }
  get orthogonalSize() {
    return this._orthogonalSize;
  }
  get linkedWidthNode() {
    return this._linkedWidthNode;
  }
  set linkedWidthNode(node) {
    this._onDidLinkedWidthNodeChange.input = node ? node._onDidViewChange : Event.None;
    this._linkedWidthNode = node;
    this._onDidSetLinkedNode.fire(void 0);
  }
  get linkedHeightNode() {
    return this._linkedHeightNode;
  }
  set linkedHeightNode(node) {
    this._onDidLinkedHeightNodeChange.input = node ? node._onDidViewChange : Event.None;
    this._linkedHeightNode = node;
    this._onDidSetLinkedNode.fire(void 0);
  }
  get width() {
    return this.orientation === Orientation.HORIZONTAL ? this.orthogonalSize : this.size;
  }
  get height() {
    return this.orientation === Orientation.HORIZONTAL ? this.size : this.orthogonalSize;
  }
  get top() {
    return this.orientation === Orientation.HORIZONTAL ? this.absoluteOffset : this.absoluteOrthogonalOffset;
  }
  get left() {
    return this.orientation === Orientation.HORIZONTAL ? this.absoluteOrthogonalOffset : this.absoluteOffset;
  }
  get element() {
    return this.view.element;
  }
  get minimumWidth() {
    return this.linkedWidthNode ? Math.max(this.linkedWidthNode.view.minimumWidth, this.view.minimumWidth) : this.view.minimumWidth;
  }
  get maximumWidth() {
    return this.linkedWidthNode ? Math.min(this.linkedWidthNode.view.maximumWidth, this.view.maximumWidth) : this.view.maximumWidth;
  }
  get minimumHeight() {
    return this.linkedHeightNode ? Math.max(this.linkedHeightNode.view.minimumHeight, this.view.minimumHeight) : this.view.minimumHeight;
  }
  get maximumHeight() {
    return this.linkedHeightNode ? Math.min(this.linkedHeightNode.view.maximumHeight, this.view.maximumHeight) : this.view.maximumHeight;
  }
  get minimumSize() {
    return this.orientation === Orientation.HORIZONTAL ? this.minimumHeight : this.minimumWidth;
  }
  get maximumSize() {
    return this.orientation === Orientation.HORIZONTAL ? this.maximumHeight : this.maximumWidth;
  }
  get priority() {
    return this.view.priority;
  }
  get proportionalLayout() {
    return this.view.proportionalLayout ?? true;
  }
  get snap() {
    return this.view.snap;
  }
  get minimumOrthogonalSize() {
    return this.orientation === Orientation.HORIZONTAL ? this.minimumWidth : this.minimumHeight;
  }
  get maximumOrthogonalSize() {
    return this.orientation === Orientation.HORIZONTAL ? this.maximumWidth : this.maximumHeight;
  }
  get boundarySashes() {
    return this._boundarySashes;
  }
  set boundarySashes(boundarySashes) {
    this._boundarySashes = boundarySashes;
    this.view.setBoundarySashes?.(toAbsoluteBoundarySashes(boundarySashes, this.orientation));
  }
  layout(size, offset, ctx) {
    if (!this.layoutController.isLayoutEnabled) {
      return;
    }
    if (typeof ctx === "undefined") {
      throw new Error("Invalid state");
    }
    this._size = size;
    this._orthogonalSize = ctx.orthogonalSize;
    this.absoluteOffset = ctx.absoluteOffset + offset;
    this.absoluteOrthogonalOffset = ctx.absoluteOrthogonalOffset;
    this._layout(this.width, this.height, this.top, this.left);
  }
  _layout(width, height, top, left) {
    if (this.cachedWidth === width && this.cachedHeight === height && this.cachedTop === top && this.cachedLeft === left) {
      return;
    }
    this.cachedWidth = width;
    this.cachedHeight = height;
    this.cachedTop = top;
    this.cachedLeft = left;
    this.view.layout(width, height, top, left);
  }
  setVisible(visible) {
    this.view.setVisible?.(visible);
  }
  dispose() {
    this._onDidSetLinkedNode.dispose();
    this.disposables.dispose();
  }
}
function flipNode(node, size, orthogonalSize) {
  if (node instanceof BranchNode) {
    const result = new BranchNode(orthogonal(node.orientation), node.layoutController, node.styles, node.splitviewProportionalLayout, size, orthogonalSize, node.edgeSnapping);
    let totalSize = 0;
    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      const childSize = child instanceof BranchNode ? child.orthogonalSize : child.size;
      let newSize = node.size === 0 ? 0 : Math.round(size * childSize / node.size);
      totalSize += newSize;
      if (i === 0) {
        newSize += size - totalSize;
      }
      result.addChild(flipNode(child, orthogonalSize, newSize), newSize, 0, true);
    }
    node.dispose();
    return result;
  } else {
    const result = new LeafNode(node.view, orthogonal(node.orientation), node.layoutController, orthogonalSize);
    node.dispose();
    return result;
  }
}
class GridView {
  /**
   * Create a new {@link GridView} instance.
   *
   * @remarks It's the caller's responsibility to append the
   * {@link GridView.element} to the page's DOM.
   */
  constructor(options = {}) {
    this.onDidSashResetRelay = new Relay();
    this._onDidScroll = new Relay();
    this._onDidChange = new Relay();
    this._boundarySashes = {};
    this.disposable2x2 = Disposable.None;
    /**
     * Fires whenever the user double clicks a {@link Sash sash}.
     */
    this.onDidSashReset = this.onDidSashResetRelay.event;
    /**
     * Fires whenever the user scrolls a {@link SplitView} within
     * the grid.
     */
    this.onDidScroll = this._onDidScroll.event;
    /**
     * Fires whenever a view within the grid changes its size constraints.
     */
    this.onDidChange = this._onDidChange.event;
    this.maximizedNode = void 0;
    this._onDidChangeViewMaximized = new Emitter();
    this.onDidChangeViewMaximized = this._onDidChangeViewMaximized.event;
    this.element = $(".monaco-grid-view");
    this.styles = options.styles || defaultStyles;
    this.proportionalLayout = typeof options.proportionalLayout !== "undefined" ? !!options.proportionalLayout : true;
    this.layoutController = new LayoutController(false);
    this.root = new BranchNode(Orientation.VERTICAL, this.layoutController, this.styles, this.proportionalLayout);
  }
  get root() {
    return this._root;
  }
  set root(root) {
    const oldRoot = this._root;
    if (oldRoot) {
      oldRoot.element.remove();
      oldRoot.dispose();
    }
    this._root = root;
    this.element.appendChild(root.element);
    this.onDidSashResetRelay.input = root.onDidSashReset;
    this._onDidChange.input = Event.map(root.onDidChange, () => void 0);
    this._onDidScroll.input = root.onDidScroll;
  }
  /**
   * The width of the grid.
   */
  get width() {
    return this.root.width;
  }
  /**
   * The height of the grid.
   */
  get height() {
    return this.root.height;
  }
  /**
   * The minimum width of the grid.
   */
  get minimumWidth() {
    return this.root.minimumWidth;
  }
  /**
   * The minimum height of the grid.
   */
  get minimumHeight() {
    return this.root.minimumHeight;
  }
  /**
   * The maximum width of the grid.
   */
  get maximumWidth() {
    return this.root.maximumHeight;
  }
  /**
   * The maximum height of the grid.
   */
  get maximumHeight() {
    return this.root.maximumHeight;
  }
  get orientation() {
    return this._root.orientation;
  }
  get boundarySashes() {
    return this._boundarySashes;
  }
  /**
   * The orientation of the grid. Matches the orientation of the root
   * {@link SplitView} in the grid's tree model.
   */
  set orientation(orientation) {
    if (this._root.orientation === orientation) {
      return;
    }
    const { size, orthogonalSize, absoluteOffset, absoluteOrthogonalOffset } = this._root;
    this.root = flipNode(this._root, orthogonalSize, size);
    this.root.layout(size, 0, { orthogonalSize, absoluteOffset: absoluteOrthogonalOffset, absoluteOrthogonalOffset: absoluteOffset, absoluteSize: size, absoluteOrthogonalSize: orthogonalSize });
    this.boundarySashes = this.boundarySashes;
  }
  /**
   * A collection of sashes perpendicular to each edge of the grid.
   * Corner sashes will be created for each intersection.
   */
  set boundarySashes(boundarySashes) {
    this._boundarySashes = boundarySashes;
    this.root.boundarySashes = fromAbsoluteBoundarySashes(boundarySashes, this.orientation);
  }
  /**
   * Enable/disable edge snapping across all grid views.
   */
  set edgeSnapping(edgeSnapping) {
    this.root.edgeSnapping = edgeSnapping;
  }
  style(styles) {
    this.styles = styles;
    this.root.style(styles);
  }
  /**
   * Layout the {@link GridView}.
   *
   * Optionally provide a `top` and `left` positions, those will propagate
   * as an origin for positions passed to {@link IView.layout}.
   *
   * @param width The width of the {@link GridView}.
   * @param height The height of the {@link GridView}.
   * @param top Optional, the top location of the {@link GridView}.
   * @param left Optional, the left location of the {@link GridView}.
   */
  layout(width, height, top = 0, left = 0) {
    this.layoutController.isLayoutEnabled = true;
    const [size, orthogonalSize, offset, orthogonalOffset] = this.root.orientation === Orientation.HORIZONTAL ? [height, width, top, left] : [width, height, left, top];
    this.root.layout(size, 0, { orthogonalSize, absoluteOffset: offset, absoluteOrthogonalOffset: orthogonalOffset, absoluteSize: size, absoluteOrthogonalSize: orthogonalSize });
  }
  /**
   * Add a {@link IView view} to this {@link GridView}.
   *
   * @param view The view to add.
   * @param size Either a fixed size, or a dynamic {@link Sizing} strategy.
   * @param location The {@link GridLocation location} to insert the view on.
   */
  addView(view, size, location) {
    if (this.hasMaximizedView()) {
      this.exitMaximizedView();
    }
    this.disposable2x2.dispose();
    this.disposable2x2 = Disposable.None;
    const [rest, index] = tail(location);
    const [pathToParent, parent] = this.getNode(rest);
    if (parent instanceof BranchNode) {
      const node = new LeafNode(view, orthogonal(parent.orientation), this.layoutController, parent.orthogonalSize);
      try {
        parent.addChild(node, size, index);
      } catch (err) {
        node.dispose();
        throw err;
      }
    } else {
      const [, grandParent] = tail(pathToParent);
      const [, parentIndex] = tail(rest);
      let newSiblingSize = 0;
      const newSiblingCachedVisibleSize = grandParent.getChildCachedVisibleSize(parentIndex);
      if (typeof newSiblingCachedVisibleSize === "number") {
        newSiblingSize = Sizing.Invisible(newSiblingCachedVisibleSize);
      }
      const oldChild = grandParent.removeChild(parentIndex);
      oldChild.dispose();
      const newParent = new BranchNode(parent.orientation, parent.layoutController, this.styles, this.proportionalLayout, parent.size, parent.orthogonalSize, grandParent.edgeSnapping);
      grandParent.addChild(newParent, parent.size, parentIndex);
      const newSibling = new LeafNode(parent.view, grandParent.orientation, this.layoutController, parent.size);
      newParent.addChild(newSibling, newSiblingSize, 0);
      if (typeof size !== "number" && size.type === "split") {
        size = Sizing.Split(0);
      }
      const node = new LeafNode(view, grandParent.orientation, this.layoutController, parent.size);
      newParent.addChild(node, size, index);
    }
    this.trySet2x2();
  }
  /**
   * Remove a {@link IView view} from this {@link GridView}.
   *
   * @param location The {@link GridLocation location} of the {@link IView view}.
   * @param sizing Whether to distribute other {@link IView view}'s sizes.
   */
  removeView(location, sizing) {
    if (this.hasMaximizedView()) {
      this.exitMaximizedView();
    }
    this.disposable2x2.dispose();
    this.disposable2x2 = Disposable.None;
    const [rest, index] = tail(location);
    const [pathToParent, parent] = this.getNode(rest);
    if (!(parent instanceof BranchNode)) {
      throw new Error("Invalid location");
    }
    const node = parent.children[index];
    if (!(node instanceof LeafNode)) {
      throw new Error("Invalid location");
    }
    parent.removeChild(index, sizing);
    node.dispose();
    if (parent.children.length === 0) {
      throw new Error("Invalid grid state");
    }
    if (parent.children.length > 1) {
      this.trySet2x2();
      return node.view;
    }
    if (pathToParent.length === 0) {
      const sibling2 = parent.children[0];
      if (sibling2 instanceof LeafNode) {
        return node.view;
      }
      parent.removeChild(0);
      parent.dispose();
      this.root = sibling2;
      this.boundarySashes = this.boundarySashes;
      this.trySet2x2();
      return node.view;
    }
    const [, grandParent] = tail(pathToParent);
    const [, parentIndex] = tail(rest);
    const isSiblingVisible = parent.isChildVisible(0);
    const sibling = parent.removeChild(0);
    const sizes = grandParent.children.map((_, i) => grandParent.getChildSize(i));
    grandParent.removeChild(parentIndex, sizing);
    parent.dispose();
    if (sibling instanceof BranchNode) {
      sizes.splice(parentIndex, 1, ...sibling.children.map((c) => c.size));
      const siblingChildren = sibling.removeAllChildren();
      for (let i = 0; i < siblingChildren.length; i++) {
        grandParent.addChild(siblingChildren[i], siblingChildren[i].size, parentIndex + i);
      }
    } else {
      const newSibling = new LeafNode(sibling.view, orthogonal(sibling.orientation), this.layoutController, sibling.size);
      const sizing2 = isSiblingVisible ? sibling.orthogonalSize : Sizing.Invisible(sibling.orthogonalSize);
      grandParent.addChild(newSibling, sizing2, parentIndex);
    }
    sibling.dispose();
    for (let i = 0; i < sizes.length; i++) {
      grandParent.resizeChild(i, sizes[i]);
    }
    this.trySet2x2();
    return node.view;
  }
  /**
   * Move a {@link IView view} within its parent.
   *
   * @param parentLocation The {@link GridLocation location} of the {@link IView view}'s parent.
   * @param from The index of the {@link IView view} to move.
   * @param to The index where the {@link IView view} should move to.
   */
  moveView(parentLocation, from, to) {
    if (this.hasMaximizedView()) {
      this.exitMaximizedView();
    }
    const [, parent] = this.getNode(parentLocation);
    if (!(parent instanceof BranchNode)) {
      throw new Error("Invalid location");
    }
    parent.moveChild(from, to);
    this.trySet2x2();
  }
  /**
   * Swap two {@link IView views} within the {@link GridView}.
   *
   * @param from The {@link GridLocation location} of one view.
   * @param to The {@link GridLocation location} of another view.
   */
  swapViews(from, to) {
    if (this.hasMaximizedView()) {
      this.exitMaximizedView();
    }
    const [fromRest, fromIndex] = tail(from);
    const [, fromParent] = this.getNode(fromRest);
    if (!(fromParent instanceof BranchNode)) {
      throw new Error("Invalid from location");
    }
    const fromSize = fromParent.getChildSize(fromIndex);
    const fromNode = fromParent.children[fromIndex];
    if (!(fromNode instanceof LeafNode)) {
      throw new Error("Invalid from location");
    }
    const [toRest, toIndex] = tail(to);
    const [, toParent] = this.getNode(toRest);
    if (!(toParent instanceof BranchNode)) {
      throw new Error("Invalid to location");
    }
    const toSize = toParent.getChildSize(toIndex);
    const toNode = toParent.children[toIndex];
    if (!(toNode instanceof LeafNode)) {
      throw new Error("Invalid to location");
    }
    if (fromParent === toParent) {
      fromParent.swapChildren(fromIndex, toIndex);
    } else {
      fromParent.removeChild(fromIndex);
      toParent.removeChild(toIndex);
      fromParent.addChild(toNode, fromSize, fromIndex);
      toParent.addChild(fromNode, toSize, toIndex);
    }
    this.trySet2x2();
  }
  /**
   * Resize a {@link IView view}.
   *
   * @param location The {@link GridLocation location} of the view.
   * @param size The size the view should be. Optionally provide a single dimension.
   */
  resizeView(location, size) {
    if (this.hasMaximizedView()) {
      this.exitMaximizedView();
    }
    const [rest, index] = tail(location);
    const [pathToParent, parent] = this.getNode(rest);
    if (!(parent instanceof BranchNode)) {
      throw new Error("Invalid location");
    }
    if (!size.width && !size.height) {
      return;
    }
    const [parentSize, grandParentSize] = parent.orientation === Orientation.HORIZONTAL ? [size.width, size.height] : [size.height, size.width];
    if (typeof grandParentSize === "number" && pathToParent.length > 0) {
      const [, grandParent] = tail(pathToParent);
      const [, parentIndex] = tail(rest);
      grandParent.resizeChild(parentIndex, grandParentSize);
    }
    if (typeof parentSize === "number") {
      parent.resizeChild(index, parentSize);
    }
    this.trySet2x2();
  }
  /**
   * Get the size of a {@link IView view}.
   *
   * @param location The {@link GridLocation location} of the view. Provide `undefined` to get
   * the size of the grid itself.
   */
  getViewSize(location) {
    if (!location) {
      return { width: this.root.width, height: this.root.height };
    }
    const [, node] = this.getNode(location);
    return { width: node.width, height: node.height };
  }
  /**
   * Get the cached visible size of a {@link IView view}. This was the size
   * of the view at the moment it last became hidden.
   *
   * @param location The {@link GridLocation location} of the view.
   */
  getViewCachedVisibleSize(location) {
    const [rest, index] = tail(location);
    const [, parent] = this.getNode(rest);
    if (!(parent instanceof BranchNode)) {
      throw new Error("Invalid location");
    }
    return parent.getChildCachedVisibleSize(index);
  }
  /**
   * Maximize the size of a {@link IView view} by collapsing all other views
   * to their minimum sizes.
   *
   * @param location The {@link GridLocation location} of the view.
   */
  expandView(location) {
    if (this.hasMaximizedView()) {
      this.exitMaximizedView();
    }
    const [ancestors, node] = this.getNode(location);
    if (!(node instanceof LeafNode)) {
      throw new Error("Invalid location");
    }
    for (let i = 0; i < ancestors.length; i++) {
      ancestors[i].resizeChild(location[i], Number.POSITIVE_INFINITY);
    }
  }
  /**
   * Returns whether all other {@link IView views} are at their minimum size.
   *
   * @param location The {@link GridLocation location} of the view.
   */
  isViewExpanded(location) {
    if (this.hasMaximizedView()) {
      return false;
    }
    const [ancestors, node] = this.getNode(location);
    if (!(node instanceof LeafNode)) {
      throw new Error("Invalid location");
    }
    for (let i = 0; i < ancestors.length; i++) {
      if (!ancestors[i].isChildExpanded(location[i])) {
        return false;
      }
    }
    return true;
  }
  maximizeView(location, excludeViews = []) {
    const [, nodeToMaximize] = this.getNode(location);
    if (!(nodeToMaximize instanceof LeafNode)) {
      throw new Error("Location is not a LeafNode");
    }
    if (this.maximizedNode === nodeToMaximize) {
      return;
    }
    if (this.hasMaximizedView()) {
      this.exitMaximizedView();
    }
    const excludeViewSet = new Set(excludeViews);
    function hideAllViewsBut(parent, exclude) {
      for (let i = 0; i < parent.children.length; i++) {
        const child = parent.children[i];
        if (child instanceof LeafNode) {
          if (child !== exclude && !excludeViewSet.has(child.view)) {
            parent.setChildVisible(i, false);
          }
        } else {
          hideAllViewsBut(child, exclude);
        }
      }
    }
    hideAllViewsBut(this.root, nodeToMaximize);
    this.maximizedNode = nodeToMaximize;
    this._onDidChangeViewMaximized.fire(true);
  }
  exitMaximizedView() {
    if (!this.maximizedNode) {
      return;
    }
    this.maximizedNode = void 0;
    function showViewsInReverseOrder(parent) {
      for (let index = parent.children.length - 1; index >= 0; index--) {
        const child = parent.children[index];
        if (child instanceof LeafNode) {
          parent.setChildVisible(index, true);
        } else {
          showViewsInReverseOrder(child);
        }
      }
    }
    showViewsInReverseOrder(this.root);
    this._onDidChangeViewMaximized.fire(false);
  }
  hasMaximizedView() {
    return this.maximizedNode !== void 0;
  }
  /**
   * Returns whether the {@link IView view} is maximized.
   *
   * @param location The {@link GridLocation location} of the view.
   */
  isViewMaximized(location) {
    const [, node] = this.getNode(location);
    if (!(node instanceof LeafNode)) {
      throw new Error("Location is not a LeafNode");
    }
    return node === this.maximizedNode;
  }
  /**
   * Distribute the size among all {@link IView views} within the entire
   * grid or within a single {@link SplitView}.
   *
   * @param location The {@link GridLocation location} of a view containing
   * children views, which will have their sizes distributed within the parent
   * view's size. Provide `undefined` to recursively distribute all views' sizes
   * in the entire grid.
   */
  distributeViewSizes(location) {
    if (this.hasMaximizedView()) {
      this.exitMaximizedView();
    }
    if (!location) {
      this.root.distributeViewSizes(true);
      return;
    }
    const [, node] = this.getNode(location);
    if (!(node instanceof BranchNode)) {
      throw new Error("Invalid location");
    }
    node.distributeViewSizes();
    this.trySet2x2();
  }
  /**
   * Returns whether a {@link IView view} is visible.
   *
   * @param location The {@link GridLocation location} of the view.
   */
  isViewVisible(location) {
    const [rest, index] = tail(location);
    const [, parent] = this.getNode(rest);
    if (!(parent instanceof BranchNode)) {
      throw new Error("Invalid from location");
    }
    return parent.isChildVisible(index);
  }
  /**
   * Set the visibility state of a {@link IView view}.
   *
   * @param location The {@link GridLocation location} of the view.
   */
  setViewVisible(location, visible) {
    if (this.hasMaximizedView()) {
      this.exitMaximizedView();
      return;
    }
    const [rest, index] = tail(location);
    const [, parent] = this.getNode(rest);
    if (!(parent instanceof BranchNode)) {
      throw new Error("Invalid from location");
    }
    parent.setChildVisible(index, visible);
  }
  getView(location) {
    const node = location ? this.getNode(location)[1] : this._root;
    return this._getViews(node, this.orientation);
  }
  /**
   * Construct a new {@link GridView} from a JSON object.
   *
   * @param json The JSON object.
   * @param deserializer A deserializer which can revive each view.
   * @returns A new {@link GridView} instance.
   */
  static deserialize(json, deserializer, options = {}) {
    if (typeof json.orientation !== "number") {
      throw new Error("Invalid JSON: 'orientation' property must be a number.");
    } else if (typeof json.width !== "number") {
      throw new Error("Invalid JSON: 'width' property must be a number.");
    } else if (typeof json.height !== "number") {
      throw new Error("Invalid JSON: 'height' property must be a number.");
    } else if (json.root?.type !== "branch") {
      throw new Error("Invalid JSON: 'root' property must have 'type' value of branch.");
    }
    const orientation = json.orientation;
    const height = json.height;
    const result = new GridView(options);
    result._deserialize(json.root, orientation, deserializer, height);
    return result;
  }
  _deserialize(root, orientation, deserializer, orthogonalSize) {
    this.root = this._deserializeNode(root, orientation, deserializer, orthogonalSize);
  }
  _deserializeNode(node, orientation, deserializer, orthogonalSize) {
    let result;
    if (node.type === "branch") {
      const serializedChildren = node.data;
      const children = serializedChildren.map((serializedChild) => {
        return {
          node: this._deserializeNode(serializedChild, orthogonal(orientation), deserializer, node.size),
          visible: serializedChild.visible
        };
      });
      result = new BranchNode(orientation, this.layoutController, this.styles, this.proportionalLayout, node.size, orthogonalSize, void 0, children);
    } else {
      result = new LeafNode(deserializer.fromJSON(node.data), orientation, this.layoutController, orthogonalSize, node.size);
      if (node.maximized && !this.maximizedNode) {
        this.maximizedNode = result;
        this._onDidChangeViewMaximized.fire(true);
      }
    }
    return result;
  }
  _getViews(node, orientation, cachedVisibleSize) {
    const box = { top: node.top, left: node.left, width: node.width, height: node.height };
    if (node instanceof LeafNode) {
      return { view: node.view, box, cachedVisibleSize, maximized: this.maximizedNode === node };
    }
    const children = [];
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      const cachedVisibleSize2 = node.getChildCachedVisibleSize(i);
      children.push(this._getViews(child, orthogonal(orientation), cachedVisibleSize2));
    }
    return { children, box };
  }
  getNode(location, node = this.root, path = []) {
    if (location.length === 0) {
      return [path, node];
    }
    if (!(node instanceof BranchNode)) {
      throw new Error("Invalid location");
    }
    const [index, ...rest] = location;
    if (index < 0 || index >= node.children.length) {
      throw new Error("Invalid location");
    }
    const child = node.children[index];
    path.push(node);
    return this.getNode(rest, child, path);
  }
  /**
   * Attempt to lock the {@link Sash sashes} in this {@link GridView} so
   * the grid behaves as a 2x2 matrix, with a corner sash in the middle.
   *
   * In case the grid isn't a 2x2 grid _and_ all sashes are not aligned,
   * this method is a no-op.
   */
  trySet2x2() {
    this.disposable2x2.dispose();
    this.disposable2x2 = Disposable.None;
    if (this.root.children.length !== 2) {
      return;
    }
    const [first, second] = this.root.children;
    if (!(first instanceof BranchNode) || !(second instanceof BranchNode)) {
      return;
    }
    this.disposable2x2 = first.trySet2x2(second);
  }
  /**
   * Populate a map with views to DOM nodes.
   * @remarks To be used internally only.
   */
  getViewMap(map, node) {
    if (!node) {
      node = this.root;
    }
    if (node instanceof BranchNode) {
      node.children.forEach((child) => this.getViewMap(map, child));
    } else {
      map.set(node.view, node.element);
    }
  }
  dispose() {
    this._onDidChangeViewMaximized.dispose();
    this.onDidSashResetRelay.dispose();
    this.root.dispose();
    this.element.remove();
  }
}
export {
  GridView,
  LayoutPriority2 as LayoutPriority,
  Orientation2 as Orientation,
  Sizing2 as Sizing,
  isGridBranchNode,
  orthogonal
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFx1aVxcZ3JpZFxcZ3JpZHZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyAkIH0gZnJvbSAnLi4vLi4vZG9tLmpzJztcbmltcG9ydCB7IElCb3VuZGFyeVNhc2hlcywgT3JpZW50YXRpb24sIFNhc2ggfSBmcm9tICcuLi9zYXNoL3Nhc2guanMnO1xuaW1wb3J0IHsgRGlzdHJpYnV0ZVNpemluZywgSVNwbGl0Vmlld1N0eWxlcywgSVZpZXcgYXMgSVNwbGl0VmlldywgTGF5b3V0UHJpb3JpdHksIFNpemluZywgQXV0b1NpemluZywgU3BsaXRWaWV3IH0gZnJvbSAnLi4vc3BsaXR2aWV3L3NwbGl0dmlldy5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgYXMgYXJyYXlFcXVhbHMsIHRhaWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50LCBSZWxheSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHJvdCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9udW1iZXJzLmpzJztcbmltcG9ydCB7IGlzVW5kZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCAnLi9ncmlkdmlldy5jc3MnO1xuXG5leHBvcnQgeyBPcmllbnRhdGlvbiB9IGZyb20gJy4uL3Nhc2gvc2FzaC5qcyc7XG5leHBvcnQgeyBMYXlvdXRQcmlvcml0eSwgU2l6aW5nIH0gZnJvbSAnLi4vc3BsaXR2aWV3L3NwbGl0dmlldy5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUdyaWRWaWV3U3R5bGVzIGV4dGVuZHMgSVNwbGl0Vmlld1N0eWxlcyB7IH1cblxuY29uc3QgZGVmYXVsdFN0eWxlczogSUdyaWRWaWV3U3R5bGVzID0ge1xuXHRzZXBhcmF0b3JCb3JkZXI6IENvbG9yLnRyYW5zcGFyZW50XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIElWaWV3U2l6ZSB7XG5cdHJlYWRvbmx5IHdpZHRoOiBudW1iZXI7XG5cdHJlYWRvbmx5IGhlaWdodDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSVJlbGF0aXZlQm91bmRhcnlTYXNoZXMge1xuXHRyZWFkb25seSBzdGFydD86IFNhc2g7XG5cdHJlYWRvbmx5IGVuZD86IFNhc2g7XG5cdHJlYWRvbmx5IG9ydGhvZ29uYWxTdGFydD86IFNhc2g7XG5cdHJlYWRvbmx5IG9ydGhvZ29uYWxFbmQ/OiBTYXNoO1xufVxuXG4vKipcbiAqIFRoZSBpbnRlcmZhY2UgdG8gaW1wbGVtZW50IGZvciB2aWV3cyB3aXRoaW4gYSB7QGxpbmsgR3JpZFZpZXd9LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElWaWV3IHtcblxuXHQvKipcblx0ICogVGhlIERPTSBlbGVtZW50IGZvciB0aGlzIHZpZXcuXG5cdCAqL1xuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblxuXHQvKipcblx0ICogQSBtaW5pbXVtIHdpZHRoIGZvciB0aGlzIHZpZXcuXG5cdCAqXG5cdCAqIEByZW1hcmtzIElmIG5vbmUsIHNldCBpdCB0byBgMGAuXG5cdCAqL1xuXHRyZWFkb25seSBtaW5pbXVtV2lkdGg6IG51bWJlcjtcblxuXHQvKipcblx0ICogQSBtaW5pbXVtIHdpZHRoIGZvciB0aGlzIHZpZXcuXG5cdCAqXG5cdCAqIEByZW1hcmtzIElmIG5vbmUsIHNldCBpdCB0byBgTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZYC5cblx0ICovXG5cdHJlYWRvbmx5IG1heGltdW1XaWR0aDogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBBIG1pbmltdW0gaGVpZ2h0IGZvciB0aGlzIHZpZXcuXG5cdCAqXG5cdCAqIEByZW1hcmtzIElmIG5vbmUsIHNldCBpdCB0byBgMGAuXG5cdCAqL1xuXHRyZWFkb25seSBtaW5pbXVtSGVpZ2h0OiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIEEgbWluaW11bSBoZWlnaHQgZm9yIHRoaXMgdmlldy5cblx0ICpcblx0ICogQHJlbWFya3MgSWYgbm9uZSwgc2V0IGl0IHRvIGBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFlgLlxuXHQgKi9cblx0cmVhZG9ubHkgbWF4aW11bUhlaWdodDogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBUaGUgcHJpb3JpdHkgb2YgdGhlIHZpZXcgd2hlbiB0aGUge0BsaW5rIEdyaWRWaWV3fSBsYXlvdXQgYWxnb3JpdGhtXG5cdCAqIHJ1bnMuIFZpZXdzIHdpdGggaGlnaGVyIHByaW9yaXR5IHdpbGwgYmUgcmVzaXplZCBmaXJzdC5cblx0ICpcblx0ICogQHJlbWFya3MgT25seSB1c2VkIHdoZW4gYHByb3BvcnRpb25hbExheW91dGAgaXMgZmFsc2UuXG5cdCAqL1xuXHRyZWFkb25seSBwcmlvcml0eT86IExheW91dFByaW9yaXR5O1xuXG5cdC8qKlxuXHQgKiBJZiB0aGUge0BsaW5rIEdyaWRWaWV3fSBzdXBwb3J0cyBwcm9wb3J0aW9uYWwgbGF5b3V0LFxuXHQgKiB0aGlzIHByb3BlcnR5IGFsbG93cyBmb3IgZmluZXIgY29udHJvbCBvdmVyIHRoZSBwcm9wb3J0aW9uYWwgbGF5b3V0IGFsZ29yaXRobSwgcGVyIHZpZXcuXG5cdCAqXG5cdCAqIEBkZWZhdWx0VmFsdWUgYHRydWVgXG5cdCAqL1xuXHRyZWFkb25seSBwcm9wb3J0aW9uYWxMYXlvdXQ/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSB2aWV3IHdpbGwgc25hcCB3aGVuZXZlciB0aGUgdXNlciByZWFjaGVzIGl0cyBtaW5pbXVtIHNpemUgb3Jcblx0ICogYXR0ZW1wdHMgdG8gZ3JvdyBpdCBiZXlvbmQgdGhlIG1pbmltdW0gc2l6ZS5cblx0ICpcblx0ICogQGRlZmF1bHRWYWx1ZSBgZmFsc2VgXG5cdCAqL1xuXHRyZWFkb25seSBzbmFwPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogVmlldyBpbnN0YW5jZXMgYXJlIHN1cHBvc2VkIHRvIGZpcmUgdGhpcyBldmVudCB3aGVuZXZlciBhbnkgb2YgdGhlIGNvbnN0cmFpbnRcblx0ICogcHJvcGVydGllcyBoYXZlIGNoYW5nZWQ6XG5cdCAqXG5cdCAqIC0ge0BsaW5rIElWaWV3Lm1pbmltdW1XaWR0aH1cblx0ICogLSB7QGxpbmsgSVZpZXcubWF4aW11bVdpZHRofVxuXHQgKiAtIHtAbGluayBJVmlldy5taW5pbXVtSGVpZ2h0fVxuXHQgKiAtIHtAbGluayBJVmlldy5tYXhpbXVtSGVpZ2h0fVxuXHQgKiAtIHtAbGluayBJVmlldy5wcmlvcml0eX1cblx0ICogLSB7QGxpbmsgSVZpZXcuc25hcH1cblx0ICpcblx0ICogVGhlIHtAbGluayBHcmlkVmlld30gd2lsbCByZWxheW91dCB3aGVuZXZlciB0aGF0IGhhcHBlbnMuIFRoZSBldmVudCBjYW5cblx0ICogb3B0aW9uYWxseSBlbWl0IHRoZSB2aWV3J3MgcHJlZmVycmVkIHNpemUgZm9yIHRoYXQgcmVsYXlvdXQuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8SVZpZXdTaXplIHwgdW5kZWZpbmVkPjtcblxuXHQvKipcblx0ICogVGhpcyB3aWxsIGJlIGNhbGxlZCBieSB0aGUge0BsaW5rIEdyaWRWaWV3fSBkdXJpbmcgbGF5b3V0LiBBIHZpZXcgbWVhbnQgdG9cblx0ICogcGFzcyBhbG9uZyB0aGUgbGF5b3V0IGluZm9ybWF0aW9uIGRvd24gdG8gaXRzIGRlc2NlbmRhbnRzLlxuXHQgKi9cblx0bGF5b3V0KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCB0b3A6IG51bWJlciwgbGVmdDogbnVtYmVyKTogdm9pZDtcblxuXHQvKipcblx0ICogVGhpcyB3aWxsIGJlIGNhbGxlZCBieSB0aGUge0BsaW5rIEdyaWRWaWV3fSB3aGVuZXZlciB0aGlzIHZpZXcgaXMgbWFkZVxuXHQgKiB2aXNpYmxlIG9yIGhpZGRlbi5cblx0ICpcblx0ICogQHBhcmFtIHZpc2libGUgV2hldGhlciB0aGUgdmlldyBiZWNvbWVzIHZpc2libGUuXG5cdCAqL1xuXHRzZXRWaXNpYmxlPyh2aXNpYmxlOiBib29sZWFuKTogdm9pZDtcblxuXHQvKipcblx0ICogVGhpcyB3aWxsIGJlIGNhbGxlZCBieSB0aGUge0BsaW5rIEdyaWRWaWV3fSB3aGVuZXZlciB0aGlzIHZpZXcgaXMgb25cblx0ICogYW4gZWRnZSBvZiB0aGUgZ3JpZCBhbmQgdGhlIGdyaWQnc1xuXHQgKiB7QGxpbmsgR3JpZFZpZXcuYm91bmRhcnlTYXNoZXMgYm91bmRhcnkgc2FzaGVzfSBjaGFuZ2UuXG5cdCAqL1xuXHRzZXRCb3VuZGFyeVNhc2hlcz8oc2FzaGVzOiBJQm91bmRhcnlTYXNoZXMpOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZXJpYWxpemFibGVWaWV3IGV4dGVuZHMgSVZpZXcge1xuXHR0b0pTT04oKTogb2JqZWN0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElWaWV3RGVzZXJpYWxpemVyPFQgZXh0ZW5kcyBJU2VyaWFsaXphYmxlVmlldz4ge1xuXHRmcm9tSlNPTihqc29uOiBhbnkpOiBUO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZXJpYWxpemVkTGVhZk5vZGUge1xuXHR0eXBlOiAnbGVhZic7XG5cdGRhdGE6IHVua25vd247XG5cdHNpemU6IG51bWJlcjtcblx0dmlzaWJsZT86IGJvb2xlYW47XG5cdG1heGltaXplZD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlcmlhbGl6ZWRCcmFuY2hOb2RlIHtcblx0dHlwZTogJ2JyYW5jaCc7XG5cdGRhdGE6IElTZXJpYWxpemVkTm9kZVtdO1xuXHRzaXplOiBudW1iZXI7XG5cdHZpc2libGU/OiBib29sZWFuO1xufVxuXG5leHBvcnQgdHlwZSBJU2VyaWFsaXplZE5vZGUgPSBJU2VyaWFsaXplZExlYWZOb2RlIHwgSVNlcmlhbGl6ZWRCcmFuY2hOb2RlO1xuXG5leHBvcnQgaW50ZXJmYWNlIElTZXJpYWxpemVkR3JpZFZpZXcge1xuXHRyb290OiBJU2VyaWFsaXplZE5vZGU7XG5cdG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbjtcblx0d2lkdGg6IG51bWJlcjtcblx0aGVpZ2h0OiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBvcnRob2dvbmFsKG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbik6IE9yaWVudGF0aW9uIHtcblx0cmV0dXJuIG9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5WRVJUSUNBTCA/IE9yaWVudGF0aW9uLkhPUklaT05UQUwgOiBPcmllbnRhdGlvbi5WRVJUSUNBTDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBCb3gge1xuXHRyZWFkb25seSB0b3A6IG51bWJlcjtcblx0cmVhZG9ubHkgbGVmdDogbnVtYmVyO1xuXHRyZWFkb25seSB3aWR0aDogbnVtYmVyO1xuXHRyZWFkb25seSBoZWlnaHQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBHcmlkTGVhZk5vZGUge1xuXHRyZWFkb25seSB2aWV3OiBJVmlldztcblx0cmVhZG9ubHkgYm94OiBCb3g7XG5cdHJlYWRvbmx5IGNhY2hlZFZpc2libGVTaXplOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG1heGltaXplZDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBHcmlkQnJhbmNoTm9kZSB7XG5cdHJlYWRvbmx5IGNoaWxkcmVuOiBHcmlkTm9kZVtdO1xuXHRyZWFkb25seSBib3g6IEJveDtcbn1cblxuZXhwb3J0IHR5cGUgR3JpZE5vZGUgPSBHcmlkTGVhZk5vZGUgfCBHcmlkQnJhbmNoTm9kZTtcblxuZXhwb3J0IGZ1bmN0aW9uIGlzR3JpZEJyYW5jaE5vZGUobm9kZTogR3JpZE5vZGUpOiBub2RlIGlzIEdyaWRCcmFuY2hOb2RlIHtcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdHJldHVybiAhIShub2RlIGFzIGFueSkuY2hpbGRyZW47XG59XG5cbmNsYXNzIExheW91dENvbnRyb2xsZXIge1xuXHRjb25zdHJ1Y3RvcihwdWJsaWMgaXNMYXlvdXRFbmFibGVkOiBib29sZWFuKSB7IH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJR3JpZFZpZXdPcHRpb25zIHtcblxuXHQvKipcblx0ICogU3R5bGVzIG92ZXJyaWRpbmcgdGhlIHtAbGluayBkZWZhdWx0U3R5bGVzIGRlZmF1bHQgb25lc30uXG5cdCAqL1xuXHRyZWFkb25seSBzdHlsZXM/OiBJR3JpZFZpZXdTdHlsZXM7XG5cblx0LyoqXG5cdCAqIFJlc2l6ZSBlYWNoIHZpZXcgcHJvcG9ydGlvbmFsbHkgd2hlbiByZXNpemluZyB0aGUge0BsaW5rIEdyaWRWaWV3fS5cblx0ICpcblx0ICogQGRlZmF1bHRWYWx1ZSBgdHJ1ZWBcblx0ICovXG5cdHJlYWRvbmx5IHByb3BvcnRpb25hbExheW91dD86IGJvb2xlYW47IC8vIGRlZmF1bHQgdHJ1ZVxufVxuXG5pbnRlcmZhY2UgSUxheW91dENvbnRleHQge1xuXHRyZWFkb25seSBvcnRob2dvbmFsU2l6ZTogbnVtYmVyO1xuXHRyZWFkb25seSBhYnNvbHV0ZU9mZnNldDogbnVtYmVyO1xuXHRyZWFkb25seSBhYnNvbHV0ZU9ydGhvZ29uYWxPZmZzZXQ6IG51bWJlcjtcblx0cmVhZG9ubHkgYWJzb2x1dGVTaXplOiBudW1iZXI7XG5cdHJlYWRvbmx5IGFic29sdXRlT3J0aG9nb25hbFNpemU6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gdG9BYnNvbHV0ZUJvdW5kYXJ5U2FzaGVzKHNhc2hlczogSVJlbGF0aXZlQm91bmRhcnlTYXNoZXMsIG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbik6IElCb3VuZGFyeVNhc2hlcyB7XG5cdGlmIChvcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCkge1xuXHRcdHJldHVybiB7IGxlZnQ6IHNhc2hlcy5zdGFydCwgcmlnaHQ6IHNhc2hlcy5lbmQsIHRvcDogc2FzaGVzLm9ydGhvZ29uYWxTdGFydCwgYm90dG9tOiBzYXNoZXMub3J0aG9nb25hbEVuZCB9O1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiB7IHRvcDogc2FzaGVzLnN0YXJ0LCBib3R0b206IHNhc2hlcy5lbmQsIGxlZnQ6IHNhc2hlcy5vcnRob2dvbmFsU3RhcnQsIHJpZ2h0OiBzYXNoZXMub3J0aG9nb25hbEVuZCB9O1xuXHR9XG59XG5cbmZ1bmN0aW9uIGZyb21BYnNvbHV0ZUJvdW5kYXJ5U2FzaGVzKHNhc2hlczogSUJvdW5kYXJ5U2FzaGVzLCBvcmllbnRhdGlvbjogT3JpZW50YXRpb24pOiBJUmVsYXRpdmVCb3VuZGFyeVNhc2hlcyB7XG5cdGlmIChvcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCkge1xuXHRcdHJldHVybiB7IHN0YXJ0OiBzYXNoZXMubGVmdCwgZW5kOiBzYXNoZXMucmlnaHQsIG9ydGhvZ29uYWxTdGFydDogc2FzaGVzLnRvcCwgb3J0aG9nb25hbEVuZDogc2FzaGVzLmJvdHRvbSB9O1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiB7IHN0YXJ0OiBzYXNoZXMudG9wLCBlbmQ6IHNhc2hlcy5ib3R0b20sIG9ydGhvZ29uYWxTdGFydDogc2FzaGVzLmxlZnQsIG9ydGhvZ29uYWxFbmQ6IHNhc2hlcy5yaWdodCB9O1xuXHR9XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlSW5kZXgoaW5kZXg6IG51bWJlciwgbnVtQ2hpbGRyZW46IG51bWJlcik6IG51bWJlciB7XG5cdGlmIChNYXRoLmFicyhpbmRleCkgPiBudW1DaGlsZHJlbikge1xuXHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBpbmRleCcpO1xuXHR9XG5cblx0cmV0dXJuIHJvdChpbmRleCwgbnVtQ2hpbGRyZW4gKyAxKTtcbn1cblxuY2xhc3MgQnJhbmNoTm9kZSBpbXBsZW1lbnRzIElTcGxpdFZpZXc8SUxheW91dENvbnRleHQ+LCBJRGlzcG9zYWJsZSB7XG5cblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGNoaWxkcmVuOiBOb2RlW10gPSBbXTtcblx0cHJpdmF0ZSBzcGxpdHZpZXc6IFNwbGl0VmlldzxJTGF5b3V0Q29udGV4dCwgTm9kZT47XG5cblx0cHJpdmF0ZSBfc2l6ZTogbnVtYmVyO1xuXHRnZXQgc2l6ZSgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5fc2l6ZTsgfVxuXG5cdHByaXZhdGUgX29ydGhvZ29uYWxTaXplOiBudW1iZXI7XG5cdGdldCBvcnRob2dvbmFsU2l6ZSgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5fb3J0aG9nb25hbFNpemU7IH1cblxuXHRwcml2YXRlIF9hYnNvbHV0ZU9mZnNldDogbnVtYmVyID0gMDtcblx0Z2V0IGFic29sdXRlT2Zmc2V0KCk6IG51bWJlciB7IHJldHVybiB0aGlzLl9hYnNvbHV0ZU9mZnNldDsgfVxuXG5cdHByaXZhdGUgX2Fic29sdXRlT3J0aG9nb25hbE9mZnNldDogbnVtYmVyID0gMDtcblx0Z2V0IGFic29sdXRlT3J0aG9nb25hbE9mZnNldCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5fYWJzb2x1dGVPcnRob2dvbmFsT2Zmc2V0OyB9XG5cblx0cHJpdmF0ZSBhYnNvbHV0ZU9ydGhvZ29uYWxTaXplOiBudW1iZXIgPSAwO1xuXG5cdHByaXZhdGUgX3N0eWxlczogSUdyaWRWaWV3U3R5bGVzO1xuXHRnZXQgc3R5bGVzKCk6IElHcmlkVmlld1N0eWxlcyB7IHJldHVybiB0aGlzLl9zdHlsZXM7IH1cblxuXHRnZXQgd2lkdGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IHRoaXMuc2l6ZSA6IHRoaXMub3J0aG9nb25hbFNpemU7XG5cdH1cblxuXHRnZXQgaGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgPyB0aGlzLm9ydGhvZ29uYWxTaXplIDogdGhpcy5zaXplO1xuXHR9XG5cblx0Z2V0IHRvcCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gdGhpcy5fYWJzb2x1dGVPZmZzZXQgOiB0aGlzLl9hYnNvbHV0ZU9ydGhvZ29uYWxPZmZzZXQ7XG5cdH1cblxuXHRnZXQgbGVmdCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gdGhpcy5fYWJzb2x1dGVPcnRob2dvbmFsT2Zmc2V0IDogdGhpcy5fYWJzb2x1dGVPZmZzZXQ7XG5cdH1cblxuXHRnZXQgbWluaW11bVNpemUoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5jaGlsZHJlbi5sZW5ndGggPT09IDAgPyAwIDogTWF0aC5tYXgoLi4udGhpcy5jaGlsZHJlbi5tYXAoKGMsIGluZGV4KSA9PiB0aGlzLnNwbGl0dmlldy5pc1ZpZXdWaXNpYmxlKGluZGV4KSA/IGMubWluaW11bU9ydGhvZ29uYWxTaXplIDogMCkpO1xuXHR9XG5cblx0Z2V0IG1heGltdW1TaXplKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIE1hdGgubWluKC4uLnRoaXMuY2hpbGRyZW4ubWFwKChjLCBpbmRleCkgPT4gdGhpcy5zcGxpdHZpZXcuaXNWaWV3VmlzaWJsZShpbmRleCkgPyBjLm1heGltdW1PcnRob2dvbmFsU2l6ZSA6IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSkpO1xuXHR9XG5cblx0Z2V0IHByaW9yaXR5KCk6IExheW91dFByaW9yaXR5IHtcblx0XHRpZiAodGhpcy5jaGlsZHJlbi5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBMYXlvdXRQcmlvcml0eS5Ob3JtYWw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJpb3JpdGllcyA9IHRoaXMuY2hpbGRyZW4ubWFwKGMgPT4gdHlwZW9mIGMucHJpb3JpdHkgPT09ICd1bmRlZmluZWQnID8gTGF5b3V0UHJpb3JpdHkuTm9ybWFsIDogYy5wcmlvcml0eSk7XG5cblx0XHRpZiAocHJpb3JpdGllcy5zb21lKHAgPT4gcCA9PT0gTGF5b3V0UHJpb3JpdHkuSGlnaCkpIHtcblx0XHRcdHJldHVybiBMYXlvdXRQcmlvcml0eS5IaWdoO1xuXHRcdH0gZWxzZSBpZiAocHJpb3JpdGllcy5zb21lKHAgPT4gcCA9PT0gTGF5b3V0UHJpb3JpdHkuTG93KSkge1xuXHRcdFx0cmV0dXJuIExheW91dFByaW9yaXR5Lkxvdztcblx0XHR9XG5cblx0XHRyZXR1cm4gTGF5b3V0UHJpb3JpdHkuTm9ybWFsO1xuXHR9XG5cblx0Z2V0IHByb3BvcnRpb25hbExheW91dCgpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5jaGlsZHJlbi5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmNoaWxkcmVuLmV2ZXJ5KGMgPT4gYy5wcm9wb3J0aW9uYWxMYXlvdXQpO1xuXHR9XG5cblx0Z2V0IG1pbmltdW1PcnRob2dvbmFsU2l6ZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnNwbGl0dmlldy5taW5pbXVtU2l6ZTtcblx0fVxuXG5cdGdldCBtYXhpbXVtT3J0aG9nb25hbFNpemUoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5zcGxpdHZpZXcubWF4aW11bVNpemU7XG5cdH1cblxuXHRnZXQgbWluaW11bVdpZHRoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgPyB0aGlzLm1pbmltdW1PcnRob2dvbmFsU2l6ZSA6IHRoaXMubWluaW11bVNpemU7XG5cdH1cblxuXHRnZXQgbWluaW11bUhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gdGhpcy5taW5pbXVtU2l6ZSA6IHRoaXMubWluaW11bU9ydGhvZ29uYWxTaXplO1xuXHR9XG5cblx0Z2V0IG1heGltdW1XaWR0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gdGhpcy5tYXhpbXVtT3J0aG9nb25hbFNpemUgOiB0aGlzLm1heGltdW1TaXplO1xuXHR9XG5cblx0Z2V0IG1heGltdW1IZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IHRoaXMubWF4aW11bVNpemUgOiB0aGlzLm1heGltdW1PcnRob2dvbmFsU2l6ZTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gbmV3IEVtaXR0ZXI8bnVtYmVyIHwgdW5kZWZpbmVkPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8bnVtYmVyIHwgdW5kZWZpbmVkPiA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVmlzaWJpbGl0eUNoYW5nZSA9IG5ldyBFbWl0dGVyPGJvb2xlYW4+KCk7XG5cdHJlYWRvbmx5IG9uRGlkVmlzaWJpbGl0eUNoYW5nZTogRXZlbnQ8Ym9vbGVhbj4gPSB0aGlzLl9vbkRpZFZpc2liaWxpdHlDaGFuZ2UuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgY2hpbGRyZW5WaXNpYmlsaXR5Q2hhbmdlRGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHByaXZhdGUgX29uRGlkU2Nyb2xsID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cHJpdmF0ZSBvbkRpZFNjcm9sbERpc3Bvc2FibGU6IElEaXNwb3NhYmxlID0gRGlzcG9zYWJsZS5Ob25lO1xuXHRyZWFkb25seSBvbkRpZFNjcm9sbDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZFNjcm9sbC5ldmVudDtcblxuXHRwcml2YXRlIGNoaWxkcmVuQ2hhbmdlRGlzcG9zYWJsZTogSURpc3Bvc2FibGUgPSBEaXNwb3NhYmxlLk5vbmU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTYXNoUmVzZXQgPSBuZXcgRW1pdHRlcjxHcmlkTG9jYXRpb24+KCk7XG5cdHJlYWRvbmx5IG9uRGlkU2FzaFJlc2V0OiBFdmVudDxHcmlkTG9jYXRpb24+ID0gdGhpcy5fb25EaWRTYXNoUmVzZXQuZXZlbnQ7XG5cdHByaXZhdGUgc3BsaXR2aWV3U2FzaFJlc2V0RGlzcG9zYWJsZTogSURpc3Bvc2FibGUgPSBEaXNwb3NhYmxlLk5vbmU7XG5cdHByaXZhdGUgY2hpbGRyZW5TYXNoUmVzZXREaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSA9IERpc3Bvc2FibGUuTm9uZTtcblxuXHRwcml2YXRlIF9ib3VuZGFyeVNhc2hlczogSVJlbGF0aXZlQm91bmRhcnlTYXNoZXMgPSB7fTtcblx0Z2V0IGJvdW5kYXJ5U2FzaGVzKCk6IElSZWxhdGl2ZUJvdW5kYXJ5U2FzaGVzIHsgcmV0dXJuIHRoaXMuX2JvdW5kYXJ5U2FzaGVzOyB9XG5cdHNldCBib3VuZGFyeVNhc2hlcyhib3VuZGFyeVNhc2hlczogSVJlbGF0aXZlQm91bmRhcnlTYXNoZXMpIHtcblx0XHRpZiAodGhpcy5fYm91bmRhcnlTYXNoZXMuc3RhcnQgPT09IGJvdW5kYXJ5U2FzaGVzLnN0YXJ0XG5cdFx0XHQmJiB0aGlzLl9ib3VuZGFyeVNhc2hlcy5lbmQgPT09IGJvdW5kYXJ5U2FzaGVzLmVuZFxuXHRcdFx0JiYgdGhpcy5fYm91bmRhcnlTYXNoZXMub3J0aG9nb25hbFN0YXJ0ID09PSBib3VuZGFyeVNhc2hlcy5vcnRob2dvbmFsU3RhcnRcblx0XHRcdCYmIHRoaXMuX2JvdW5kYXJ5U2FzaGVzLm9ydGhvZ29uYWxFbmQgPT09IGJvdW5kYXJ5U2FzaGVzLm9ydGhvZ29uYWxFbmQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9ib3VuZGFyeVNhc2hlcyA9IGJvdW5kYXJ5U2FzaGVzO1xuXG5cdFx0dGhpcy5zcGxpdHZpZXcub3J0aG9nb25hbFN0YXJ0U2FzaCA9IGJvdW5kYXJ5U2FzaGVzLm9ydGhvZ29uYWxTdGFydDtcblx0XHR0aGlzLnNwbGl0dmlldy5vcnRob2dvbmFsRW5kU2FzaCA9IGJvdW5kYXJ5U2FzaGVzLm9ydGhvZ29uYWxFbmQ7XG5cblx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRcdGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZHJlbltpbmRleF07XG5cdFx0XHRjb25zdCBmaXJzdCA9IGluZGV4ID09PSAwO1xuXHRcdFx0Y29uc3QgbGFzdCA9IGluZGV4ID09PSB0aGlzLmNoaWxkcmVuLmxlbmd0aCAtIDE7XG5cblx0XHRcdGNoaWxkLmJvdW5kYXJ5U2FzaGVzID0ge1xuXHRcdFx0XHRzdGFydDogYm91bmRhcnlTYXNoZXMub3J0aG9nb25hbFN0YXJ0LFxuXHRcdFx0XHRlbmQ6IGJvdW5kYXJ5U2FzaGVzLm9ydGhvZ29uYWxFbmQsXG5cdFx0XHRcdG9ydGhvZ29uYWxTdGFydDogZmlyc3QgPyBib3VuZGFyeVNhc2hlcy5zdGFydCA6IGNoaWxkLmJvdW5kYXJ5U2FzaGVzLm9ydGhvZ29uYWxTdGFydCxcblx0XHRcdFx0b3J0aG9nb25hbEVuZDogbGFzdCA/IGJvdW5kYXJ5U2FzaGVzLmVuZCA6IGNoaWxkLmJvdW5kYXJ5U2FzaGVzLm9ydGhvZ29uYWxFbmQsXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2VkZ2VTbmFwcGluZyA9IGZhbHNlO1xuXHRnZXQgZWRnZVNuYXBwaW5nKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fZWRnZVNuYXBwaW5nOyB9XG5cdHNldCBlZGdlU25hcHBpbmcoZWRnZVNuYXBwaW5nOiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMuX2VkZ2VTbmFwcGluZyA9PT0gZWRnZVNuYXBwaW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fZWRnZVNuYXBwaW5nID0gZWRnZVNuYXBwaW5nO1xuXG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiB0aGlzLmNoaWxkcmVuKSB7XG5cdFx0XHRpZiAoY2hpbGQgaW5zdGFuY2VvZiBCcmFuY2hOb2RlKSB7XG5cdFx0XHRcdGNoaWxkLmVkZ2VTbmFwcGluZyA9IGVkZ2VTbmFwcGluZztcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZVNwbGl0dmlld0VkZ2VTbmFwcGluZ0VuYWJsZW1lbnQoKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbixcblx0XHRyZWFkb25seSBsYXlvdXRDb250cm9sbGVyOiBMYXlvdXRDb250cm9sbGVyLFxuXHRcdHN0eWxlczogSUdyaWRWaWV3U3R5bGVzLFxuXHRcdHJlYWRvbmx5IHNwbGl0dmlld1Byb3BvcnRpb25hbExheW91dDogYm9vbGVhbixcblx0XHRzaXplOiBudW1iZXIgPSAwLFxuXHRcdG9ydGhvZ29uYWxTaXplOiBudW1iZXIgPSAwLFxuXHRcdGVkZ2VTbmFwcGluZzogYm9vbGVhbiA9IGZhbHNlLFxuXHRcdGNoaWxkRGVzY3JpcHRvcnM/OiBJTm9kZURlc2NyaXB0b3JbXVxuXHQpIHtcblx0XHR0aGlzLl9zdHlsZXMgPSBzdHlsZXM7XG5cdFx0dGhpcy5fc2l6ZSA9IHNpemU7XG5cdFx0dGhpcy5fb3J0aG9nb25hbFNpemUgPSBvcnRob2dvbmFsU2l6ZTtcblxuXHRcdHRoaXMuZWxlbWVudCA9ICQoJy5tb25hY28tZ3JpZC1icmFuY2gtbm9kZScpO1xuXG5cdFx0aWYgKCFjaGlsZERlc2NyaXB0b3JzKSB7XG5cdFx0XHQvLyBOb3JtYWwgYmVoYXZpb3IsIHdlIGhhdmUgbm8gY2hpbGRyZW4geWV0LCBqdXN0IHNldCB1cCB0aGUgc3BsaXR2aWV3XG5cdFx0XHR0aGlzLnNwbGl0dmlldyA9IG5ldyBTcGxpdFZpZXcodGhpcy5lbGVtZW50LCB7IG9yaWVudGF0aW9uLCBzdHlsZXMsIHByb3BvcnRpb25hbExheW91dDogc3BsaXR2aWV3UHJvcG9ydGlvbmFsTGF5b3V0IH0pO1xuXHRcdFx0dGhpcy5zcGxpdHZpZXcubGF5b3V0KHNpemUsIHsgb3J0aG9nb25hbFNpemUsIGFic29sdXRlT2Zmc2V0OiAwLCBhYnNvbHV0ZU9ydGhvZ29uYWxPZmZzZXQ6IDAsIGFic29sdXRlU2l6ZTogc2l6ZSwgYWJzb2x1dGVPcnRob2dvbmFsU2l6ZTogb3J0aG9nb25hbFNpemUgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFJlY29uc3RydWN0aW9uIGJlaGF2aW9yLCB3ZSB3YW50IHRvIHJlY29uc3RydWN0IGEgc3BsaXR2aWV3XG5cdFx0XHRjb25zdCBkZXNjcmlwdG9yID0ge1xuXHRcdFx0XHR2aWV3czogY2hpbGREZXNjcmlwdG9ycy5tYXAoY2hpbGREZXNjcmlwdG9yID0+IHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0dmlldzogY2hpbGREZXNjcmlwdG9yLm5vZGUsXG5cdFx0XHRcdFx0XHRzaXplOiBjaGlsZERlc2NyaXB0b3Iubm9kZS5zaXplLFxuXHRcdFx0XHRcdFx0dmlzaWJsZTogY2hpbGREZXNjcmlwdG9yLnZpc2libGUgIT09IGZhbHNlXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSksXG5cdFx0XHRcdHNpemU6IHRoaXMub3J0aG9nb25hbFNpemVcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IG9wdGlvbnMgPSB7IHByb3BvcnRpb25hbExheW91dDogc3BsaXR2aWV3UHJvcG9ydGlvbmFsTGF5b3V0LCBvcmllbnRhdGlvbiwgc3R5bGVzIH07XG5cblx0XHRcdHRoaXMuY2hpbGRyZW4gPSBjaGlsZERlc2NyaXB0b3JzLm1hcChjID0+IGMubm9kZSk7XG5cdFx0XHR0aGlzLnNwbGl0dmlldyA9IG5ldyBTcGxpdFZpZXcodGhpcy5lbGVtZW50LCB7IC4uLm9wdGlvbnMsIGRlc2NyaXB0b3IgfSk7XG5cblx0XHRcdHRoaXMuY2hpbGRyZW4uZm9yRWFjaCgobm9kZSwgaW5kZXgpID0+IHtcblx0XHRcdFx0Y29uc3QgZmlyc3QgPSBpbmRleCA9PT0gMDtcblx0XHRcdFx0Y29uc3QgbGFzdCA9IGluZGV4ID09PSB0aGlzLmNoaWxkcmVuLmxlbmd0aDtcblxuXHRcdFx0XHRub2RlLmJvdW5kYXJ5U2FzaGVzID0ge1xuXHRcdFx0XHRcdHN0YXJ0OiB0aGlzLmJvdW5kYXJ5U2FzaGVzLm9ydGhvZ29uYWxTdGFydCxcblx0XHRcdFx0XHRlbmQ6IHRoaXMuYm91bmRhcnlTYXNoZXMub3J0aG9nb25hbEVuZCxcblx0XHRcdFx0XHRvcnRob2dvbmFsU3RhcnQ6IGZpcnN0ID8gdGhpcy5ib3VuZGFyeVNhc2hlcy5zdGFydCA6IHRoaXMuc3BsaXR2aWV3LnNhc2hlc1tpbmRleCAtIDFdLFxuXHRcdFx0XHRcdG9ydGhvZ29uYWxFbmQ6IGxhc3QgPyB0aGlzLmJvdW5kYXJ5U2FzaGVzLmVuZCA6IHRoaXMuc3BsaXR2aWV3LnNhc2hlc1tpbmRleF0sXG5cdFx0XHRcdH07XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBvbkRpZFNhc2hSZXNldCA9IEV2ZW50Lm1hcCh0aGlzLnNwbGl0dmlldy5vbkRpZFNhc2hSZXNldCwgaSA9PiBbaV0pO1xuXHRcdHRoaXMuc3BsaXR2aWV3U2FzaFJlc2V0RGlzcG9zYWJsZSA9IG9uRGlkU2FzaFJlc2V0KHRoaXMuX29uRGlkU2FzaFJlc2V0LmZpcmUsIHRoaXMuX29uRGlkU2FzaFJlc2V0KTtcblxuXHRcdHRoaXMudXBkYXRlQ2hpbGRyZW5FdmVudHMoKTtcblx0fVxuXG5cdHN0eWxlKHN0eWxlczogSUdyaWRWaWV3U3R5bGVzKTogdm9pZCB7XG5cdFx0dGhpcy5fc3R5bGVzID0gc3R5bGVzO1xuXHRcdHRoaXMuc3BsaXR2aWV3LnN0eWxlKHN0eWxlcyk7XG5cblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMuY2hpbGRyZW4pIHtcblx0XHRcdGlmIChjaGlsZCBpbnN0YW5jZW9mIEJyYW5jaE5vZGUpIHtcblx0XHRcdFx0Y2hpbGQuc3R5bGUoc3R5bGVzKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRsYXlvdXQoc2l6ZTogbnVtYmVyLCBvZmZzZXQ6IG51bWJlciwgY3R4OiBJTGF5b3V0Q29udGV4dCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5sYXlvdXRDb250cm9sbGVyLmlzTGF5b3V0RW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgY3R4ID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHN0YXRlJyk7XG5cdFx0fVxuXG5cdFx0Ly8gYnJhbmNoIG5vZGVzIHNob3VsZCBmbGlwIHRoZSBub3JtYWwvb3J0aG9nb25hbCBkaXJlY3Rpb25zXG5cdFx0dGhpcy5fc2l6ZSA9IGN0eC5vcnRob2dvbmFsU2l6ZTtcblx0XHR0aGlzLl9vcnRob2dvbmFsU2l6ZSA9IHNpemU7XG5cdFx0dGhpcy5fYWJzb2x1dGVPZmZzZXQgPSBjdHguYWJzb2x1dGVPZmZzZXQgKyBvZmZzZXQ7XG5cdFx0dGhpcy5fYWJzb2x1dGVPcnRob2dvbmFsT2Zmc2V0ID0gY3R4LmFic29sdXRlT3J0aG9nb25hbE9mZnNldDtcblx0XHR0aGlzLmFic29sdXRlT3J0aG9nb25hbFNpemUgPSBjdHguYWJzb2x1dGVPcnRob2dvbmFsU2l6ZTtcblxuXHRcdHRoaXMuc3BsaXR2aWV3LmxheW91dChjdHgub3J0aG9nb25hbFNpemUsIHtcblx0XHRcdG9ydGhvZ29uYWxTaXplOiBzaXplLFxuXHRcdFx0YWJzb2x1dGVPZmZzZXQ6IHRoaXMuX2Fic29sdXRlT3J0aG9nb25hbE9mZnNldCxcblx0XHRcdGFic29sdXRlT3J0aG9nb25hbE9mZnNldDogdGhpcy5fYWJzb2x1dGVPZmZzZXQsXG5cdFx0XHRhYnNvbHV0ZVNpemU6IGN0eC5hYnNvbHV0ZU9ydGhvZ29uYWxTaXplLFxuXHRcdFx0YWJzb2x1dGVPcnRob2dvbmFsU2l6ZTogY3R4LmFic29sdXRlU2l6ZVxuXHRcdH0pO1xuXG5cdFx0dGhpcy51cGRhdGVTcGxpdHZpZXdFZGdlU25hcHBpbmdFbmFibGVtZW50KCk7XG5cdH1cblxuXHRzZXRWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMuY2hpbGRyZW4pIHtcblx0XHRcdGNoaWxkLnNldFZpc2libGUodmlzaWJsZSk7XG5cdFx0fVxuXHR9XG5cblx0YWRkQ2hpbGQobm9kZTogTm9kZSwgc2l6ZTogbnVtYmVyIHwgU2l6aW5nLCBpbmRleDogbnVtYmVyLCBza2lwTGF5b3V0PzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGluZGV4ID0gdmFsaWRhdGVJbmRleChpbmRleCwgdGhpcy5jaGlsZHJlbi5sZW5ndGgpO1xuXG5cdFx0dGhpcy5zcGxpdHZpZXcuYWRkVmlldyhub2RlLCBzaXplLCBpbmRleCwgc2tpcExheW91dCk7XG5cdFx0dGhpcy5jaGlsZHJlbi5zcGxpY2UoaW5kZXgsIDAsIG5vZGUpO1xuXG5cdFx0dGhpcy51cGRhdGVCb3VuZGFyeVNhc2hlcygpO1xuXHRcdHRoaXMub25EaWRDaGlsZHJlbkNoYW5nZSgpO1xuXHR9XG5cblx0cmVtb3ZlQ2hpbGQoaW5kZXg6IG51bWJlciwgc2l6aW5nPzogU2l6aW5nKTogTm9kZSB7XG5cdFx0aW5kZXggPSB2YWxpZGF0ZUluZGV4KGluZGV4LCB0aGlzLmNoaWxkcmVuLmxlbmd0aCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLnNwbGl0dmlldy5yZW1vdmVWaWV3KGluZGV4LCBzaXppbmcpO1xuXHRcdHRoaXMuY2hpbGRyZW4uc3BsaWNlKGluZGV4LCAxKTtcblxuXHRcdHRoaXMudXBkYXRlQm91bmRhcnlTYXNoZXMoKTtcblx0XHR0aGlzLm9uRGlkQ2hpbGRyZW5DaGFuZ2UoKTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRyZW1vdmVBbGxDaGlsZHJlbigpOiBOb2RlW10ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuc3BsaXR2aWV3LnJlbW92ZUFsbFZpZXdzKCk7XG5cblx0XHR0aGlzLmNoaWxkcmVuLnNwbGljZSgwLCB0aGlzLmNoaWxkcmVuLmxlbmd0aCk7XG5cblx0XHR0aGlzLnVwZGF0ZUJvdW5kYXJ5U2FzaGVzKCk7XG5cdFx0dGhpcy5vbkRpZENoaWxkcmVuQ2hhbmdlKCk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0bW92ZUNoaWxkKGZyb206IG51bWJlciwgdG86IG51bWJlcik6IHZvaWQge1xuXHRcdGZyb20gPSB2YWxpZGF0ZUluZGV4KGZyb20sIHRoaXMuY2hpbGRyZW4ubGVuZ3RoKTtcblx0XHR0byA9IHZhbGlkYXRlSW5kZXgodG8sIHRoaXMuY2hpbGRyZW4ubGVuZ3RoKTtcblxuXHRcdGlmIChmcm9tID09PSB0bykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChmcm9tIDwgdG8pIHtcblx0XHRcdHRvIC09IDE7XG5cdFx0fVxuXG5cdFx0dGhpcy5zcGxpdHZpZXcubW92ZVZpZXcoZnJvbSwgdG8pO1xuXHRcdHRoaXMuY2hpbGRyZW4uc3BsaWNlKHRvLCAwLCB0aGlzLmNoaWxkcmVuLnNwbGljZShmcm9tLCAxKVswXSk7XG5cblx0XHR0aGlzLnVwZGF0ZUJvdW5kYXJ5U2FzaGVzKCk7XG5cdFx0dGhpcy5vbkRpZENoaWxkcmVuQ2hhbmdlKCk7XG5cdH1cblxuXHRzd2FwQ2hpbGRyZW4oZnJvbTogbnVtYmVyLCB0bzogbnVtYmVyKTogdm9pZCB7XG5cdFx0ZnJvbSA9IHZhbGlkYXRlSW5kZXgoZnJvbSwgdGhpcy5jaGlsZHJlbi5sZW5ndGgpO1xuXHRcdHRvID0gdmFsaWRhdGVJbmRleCh0bywgdGhpcy5jaGlsZHJlbi5sZW5ndGgpO1xuXG5cdFx0aWYgKGZyb20gPT09IHRvKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5zcGxpdHZpZXcuc3dhcFZpZXdzKGZyb20sIHRvKTtcblxuXHRcdC8vIHN3YXAgYm91bmRhcnkgc2FzaGVzXG5cdFx0W3RoaXMuY2hpbGRyZW5bZnJvbV0uYm91bmRhcnlTYXNoZXMsIHRoaXMuY2hpbGRyZW5bdG9dLmJvdW5kYXJ5U2FzaGVzXVxuXHRcdFx0PSBbdGhpcy5jaGlsZHJlbltmcm9tXS5ib3VuZGFyeVNhc2hlcywgdGhpcy5jaGlsZHJlblt0b10uYm91bmRhcnlTYXNoZXNdO1xuXG5cdFx0Ly8gc3dhcCBjaGlsZHJlblxuXHRcdFt0aGlzLmNoaWxkcmVuW2Zyb21dLCB0aGlzLmNoaWxkcmVuW3RvXV0gPSBbdGhpcy5jaGlsZHJlblt0b10sIHRoaXMuY2hpbGRyZW5bZnJvbV1dO1xuXG5cdFx0dGhpcy5vbkRpZENoaWxkcmVuQ2hhbmdlKCk7XG5cdH1cblxuXHRyZXNpemVDaGlsZChpbmRleDogbnVtYmVyLCBzaXplOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpbmRleCA9IHZhbGlkYXRlSW5kZXgoaW5kZXgsIHRoaXMuY2hpbGRyZW4ubGVuZ3RoKTtcblxuXHRcdHRoaXMuc3BsaXR2aWV3LnJlc2l6ZVZpZXcoaW5kZXgsIHNpemUpO1xuXHR9XG5cblx0aXNDaGlsZEV4cGFuZGVkKGluZGV4OiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5zcGxpdHZpZXcuaXNWaWV3RXhwYW5kZWQoaW5kZXgpO1xuXHR9XG5cblx0ZGlzdHJpYnV0ZVZpZXdTaXplcyhyZWN1cnNpdmUgPSBmYWxzZSk6IHZvaWQge1xuXHRcdHRoaXMuc3BsaXR2aWV3LmRpc3RyaWJ1dGVWaWV3U2l6ZXMoKTtcblxuXHRcdGlmIChyZWN1cnNpdmUpIHtcblx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgdGhpcy5jaGlsZHJlbikge1xuXHRcdFx0XHRpZiAoY2hpbGQgaW5zdGFuY2VvZiBCcmFuY2hOb2RlKSB7XG5cdFx0XHRcdFx0Y2hpbGQuZGlzdHJpYnV0ZVZpZXdTaXplcyh0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGdldENoaWxkU2l6ZShpbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpbmRleCA9IHZhbGlkYXRlSW5kZXgoaW5kZXgsIHRoaXMuY2hpbGRyZW4ubGVuZ3RoKTtcblxuXHRcdHJldHVybiB0aGlzLnNwbGl0dmlldy5nZXRWaWV3U2l6ZShpbmRleCk7XG5cdH1cblxuXHRpc0NoaWxkVmlzaWJsZShpbmRleDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0aW5kZXggPSB2YWxpZGF0ZUluZGV4KGluZGV4LCB0aGlzLmNoaWxkcmVuLmxlbmd0aCk7XG5cblx0XHRyZXR1cm4gdGhpcy5zcGxpdHZpZXcuaXNWaWV3VmlzaWJsZShpbmRleCk7XG5cdH1cblxuXHRzZXRDaGlsZFZpc2libGUoaW5kZXg6IG51bWJlciwgdmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGluZGV4ID0gdmFsaWRhdGVJbmRleChpbmRleCwgdGhpcy5jaGlsZHJlbi5sZW5ndGgpO1xuXG5cdFx0aWYgKHRoaXMuc3BsaXR2aWV3LmlzVmlld1Zpc2libGUoaW5kZXgpID09PSB2aXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2VyZUFsbENoaWxkcmVuSGlkZGVuID0gdGhpcy5zcGxpdHZpZXcuY29udGVudFNpemUgPT09IDA7XG5cdFx0dGhpcy5zcGxpdHZpZXcuc2V0Vmlld1Zpc2libGUoaW5kZXgsIHZpc2libGUpO1xuXHRcdGNvbnN0IGFyZUFsbENoaWxkcmVuSGlkZGVuID0gdGhpcy5zcGxpdHZpZXcuY29udGVudFNpemUgPT09IDA7XG5cblx0XHQvLyBJZiBhbGwgY2hpbGRyZW4gYXJlIGhpZGRlbiB0aGVuIHRoZSBwYXJlbnQgc2hvdWxkIGhpZGUgdGhlIGVudGlyZSBzcGxpdHZpZXdcblx0XHQvLyBJZiB0aGUgZW50aXJlIHNwbGl0dmlldyBpcyBoaWRkZW4gdGhlbiB0aGUgcGFyZW50IHNob3VsZCBzaG93IHRoZSBzcGxpdHZpZXcgd2hlbiBhIGNoaWxkIGlzIHNob3duXG5cdFx0aWYgKCh2aXNpYmxlICYmIHdlcmVBbGxDaGlsZHJlbkhpZGRlbikgfHwgKCF2aXNpYmxlICYmIGFyZUFsbENoaWxkcmVuSGlkZGVuKSkge1xuXHRcdFx0dGhpcy5fb25EaWRWaXNpYmlsaXR5Q2hhbmdlLmZpcmUodmlzaWJsZSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0Q2hpbGRDYWNoZWRWaXNpYmxlU2l6ZShpbmRleDogbnVtYmVyKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpbmRleCA9IHZhbGlkYXRlSW5kZXgoaW5kZXgsIHRoaXMuY2hpbGRyZW4ubGVuZ3RoKTtcblxuXHRcdHJldHVybiB0aGlzLnNwbGl0dmlldy5nZXRWaWV3Q2FjaGVkVmlzaWJsZVNpemUoaW5kZXgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVCb3VuZGFyeVNhc2hlcygpOiB2b2lkIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcblx0XHRcdHRoaXMuY2hpbGRyZW5baV0uYm91bmRhcnlTYXNoZXMgPSB7XG5cdFx0XHRcdHN0YXJ0OiB0aGlzLmJvdW5kYXJ5U2FzaGVzLm9ydGhvZ29uYWxTdGFydCxcblx0XHRcdFx0ZW5kOiB0aGlzLmJvdW5kYXJ5U2FzaGVzLm9ydGhvZ29uYWxFbmQsXG5cdFx0XHRcdG9ydGhvZ29uYWxTdGFydDogaSA9PT0gMCA/IHRoaXMuYm91bmRhcnlTYXNoZXMuc3RhcnQgOiB0aGlzLnNwbGl0dmlldy5zYXNoZXNbaSAtIDFdLFxuXHRcdFx0XHRvcnRob2dvbmFsRW5kOiBpID09PSB0aGlzLmNoaWxkcmVuLmxlbmd0aCAtIDEgPyB0aGlzLmJvdW5kYXJ5U2FzaGVzLmVuZCA6IHRoaXMuc3BsaXR2aWV3LnNhc2hlc1tpXSxcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoaWxkcmVuQ2hhbmdlKCk6IHZvaWQge1xuXHRcdHRoaXMudXBkYXRlQ2hpbGRyZW5FdmVudHMoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNoaWxkcmVuRXZlbnRzKCk6IHZvaWQge1xuXHRcdGNvbnN0IG9uRGlkQ2hpbGRyZW5DaGFuZ2UgPSBFdmVudC5tYXAoRXZlbnQuYW55KC4uLnRoaXMuY2hpbGRyZW4ubWFwKGMgPT4gYy5vbkRpZENoYW5nZSkpLCAoKSA9PiB1bmRlZmluZWQpO1xuXHRcdHRoaXMuY2hpbGRyZW5DaGFuZ2VEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmNoaWxkcmVuQ2hhbmdlRGlzcG9zYWJsZSA9IG9uRGlkQ2hpbGRyZW5DaGFuZ2UodGhpcy5fb25EaWRDaGFuZ2UuZmlyZSwgdGhpcy5fb25EaWRDaGFuZ2UpO1xuXG5cdFx0Y29uc3Qgb25EaWRDaGlsZHJlblNhc2hSZXNldCA9IEV2ZW50LmFueSguLi50aGlzLmNoaWxkcmVuLm1hcCgoYywgaSkgPT4gRXZlbnQubWFwKGMub25EaWRTYXNoUmVzZXQsIGxvY2F0aW9uID0+IFtpLCAuLi5sb2NhdGlvbl0pKSk7XG5cdFx0dGhpcy5jaGlsZHJlblNhc2hSZXNldERpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuY2hpbGRyZW5TYXNoUmVzZXREaXNwb3NhYmxlID0gb25EaWRDaGlsZHJlblNhc2hSZXNldCh0aGlzLl9vbkRpZFNhc2hSZXNldC5maXJlLCB0aGlzLl9vbkRpZFNhc2hSZXNldCk7XG5cblx0XHRjb25zdCBvbkRpZFNjcm9sbCA9IEV2ZW50LmFueShFdmVudC5zaWduYWwodGhpcy5zcGxpdHZpZXcub25EaWRTY3JvbGwpLCAuLi50aGlzLmNoaWxkcmVuLm1hcChjID0+IGMub25EaWRTY3JvbGwpKTtcblx0XHR0aGlzLm9uRGlkU2Nyb2xsRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5vbkRpZFNjcm9sbERpc3Bvc2FibGUgPSBvbkRpZFNjcm9sbCh0aGlzLl9vbkRpZFNjcm9sbC5maXJlLCB0aGlzLl9vbkRpZFNjcm9sbCk7XG5cblx0XHR0aGlzLmNoaWxkcmVuVmlzaWJpbGl0eUNoYW5nZURpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHR0aGlzLmNoaWxkcmVuLmZvckVhY2goKGNoaWxkLCBpbmRleCkgPT4ge1xuXHRcdFx0aWYgKGNoaWxkIGluc3RhbmNlb2YgQnJhbmNoTm9kZSkge1xuXHRcdFx0XHR0aGlzLmNoaWxkcmVuVmlzaWJpbGl0eUNoYW5nZURpc3Bvc2FibGUuYWRkKGNoaWxkLm9uRGlkVmlzaWJpbGl0eUNoYW5nZSgodmlzaWJsZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuc2V0Q2hpbGRWaXNpYmxlKGluZGV4LCB2aXNpYmxlKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0dHJ5U2V0MngyKG90aGVyOiBCcmFuY2hOb2RlKTogSURpc3Bvc2FibGUge1xuXHRcdGlmICh0aGlzLmNoaWxkcmVuLmxlbmd0aCAhPT0gMiB8fCBvdGhlci5jaGlsZHJlbi5sZW5ndGggIT09IDIpIHtcblx0XHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZ2V0Q2hpbGRTaXplKDApICE9PSBvdGhlci5nZXRDaGlsZFNpemUoMCkpIHtcblx0XHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgW2ZpcnN0Q2hpbGQsIHNlY29uZENoaWxkXSA9IHRoaXMuY2hpbGRyZW47XG5cdFx0Y29uc3QgW290aGVyRmlyc3RDaGlsZCwgb3RoZXJTZWNvbmRDaGlsZF0gPSBvdGhlci5jaGlsZHJlbjtcblxuXHRcdGlmICghKGZpcnN0Q2hpbGQgaW5zdGFuY2VvZiBMZWFmTm9kZSkgfHwgIShzZWNvbmRDaGlsZCBpbnN0YW5jZW9mIExlYWZOb2RlKSkge1xuXHRcdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0XHR9XG5cblx0XHRpZiAoIShvdGhlckZpcnN0Q2hpbGQgaW5zdGFuY2VvZiBMZWFmTm9kZSkgfHwgIShvdGhlclNlY29uZENoaWxkIGluc3RhbmNlb2YgTGVhZk5vZGUpKSB7XG5cdFx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5WRVJUSUNBTCkge1xuXHRcdFx0c2Vjb25kQ2hpbGQubGlua2VkV2lkdGhOb2RlID0gb3RoZXJGaXJzdENoaWxkLmxpbmtlZEhlaWdodE5vZGUgPSBmaXJzdENoaWxkO1xuXHRcdFx0Zmlyc3RDaGlsZC5saW5rZWRXaWR0aE5vZGUgPSBvdGhlclNlY29uZENoaWxkLmxpbmtlZEhlaWdodE5vZGUgPSBzZWNvbmRDaGlsZDtcblx0XHRcdG90aGVyU2Vjb25kQ2hpbGQubGlua2VkV2lkdGhOb2RlID0gZmlyc3RDaGlsZC5saW5rZWRIZWlnaHROb2RlID0gb3RoZXJGaXJzdENoaWxkO1xuXHRcdFx0b3RoZXJGaXJzdENoaWxkLmxpbmtlZFdpZHRoTm9kZSA9IHNlY29uZENoaWxkLmxpbmtlZEhlaWdodE5vZGUgPSBvdGhlclNlY29uZENoaWxkO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRvdGhlckZpcnN0Q2hpbGQubGlua2VkV2lkdGhOb2RlID0gc2Vjb25kQ2hpbGQubGlua2VkSGVpZ2h0Tm9kZSA9IGZpcnN0Q2hpbGQ7XG5cdFx0XHRvdGhlclNlY29uZENoaWxkLmxpbmtlZFdpZHRoTm9kZSA9IGZpcnN0Q2hpbGQubGlua2VkSGVpZ2h0Tm9kZSA9IHNlY29uZENoaWxkO1xuXHRcdFx0Zmlyc3RDaGlsZC5saW5rZWRXaWR0aE5vZGUgPSBvdGhlclNlY29uZENoaWxkLmxpbmtlZEhlaWdodE5vZGUgPSBvdGhlckZpcnN0Q2hpbGQ7XG5cdFx0XHRzZWNvbmRDaGlsZC5saW5rZWRXaWR0aE5vZGUgPSBvdGhlckZpcnN0Q2hpbGQubGlua2VkSGVpZ2h0Tm9kZSA9IG90aGVyU2Vjb25kQ2hpbGQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbXlTYXNoID0gdGhpcy5zcGxpdHZpZXcuc2FzaGVzWzBdO1xuXHRcdGNvbnN0IG90aGVyU2FzaCA9IG90aGVyLnNwbGl0dmlldy5zYXNoZXNbMF07XG5cdFx0bXlTYXNoLmxpbmtlZFNhc2ggPSBvdGhlclNhc2g7XG5cdFx0b3RoZXJTYXNoLmxpbmtlZFNhc2ggPSBteVNhc2g7XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHVuZGVmaW5lZCk7XG5cdFx0b3RoZXIuX29uRGlkQ2hhbmdlLmZpcmUodW5kZWZpbmVkKTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0bXlTYXNoLmxpbmtlZFNhc2ggPSBvdGhlclNhc2gubGlua2VkU2FzaCA9IHVuZGVmaW5lZDtcblx0XHRcdGZpcnN0Q2hpbGQubGlua2VkSGVpZ2h0Tm9kZSA9IGZpcnN0Q2hpbGQubGlua2VkV2lkdGhOb2RlID0gdW5kZWZpbmVkO1xuXHRcdFx0c2Vjb25kQ2hpbGQubGlua2VkSGVpZ2h0Tm9kZSA9IHNlY29uZENoaWxkLmxpbmtlZFdpZHRoTm9kZSA9IHVuZGVmaW5lZDtcblx0XHRcdG90aGVyRmlyc3RDaGlsZC5saW5rZWRIZWlnaHROb2RlID0gb3RoZXJGaXJzdENoaWxkLmxpbmtlZFdpZHRoTm9kZSA9IHVuZGVmaW5lZDtcblx0XHRcdG90aGVyU2Vjb25kQ2hpbGQubGlua2VkSGVpZ2h0Tm9kZSA9IG90aGVyU2Vjb25kQ2hpbGQubGlua2VkV2lkdGhOb2RlID0gdW5kZWZpbmVkO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTcGxpdHZpZXdFZGdlU25hcHBpbmdFbmFibGVtZW50KCk6IHZvaWQge1xuXHRcdHRoaXMuc3BsaXR2aWV3LnN0YXJ0U25hcHBpbmdFbmFibGVkID0gdGhpcy5fZWRnZVNuYXBwaW5nIHx8IHRoaXMuX2Fic29sdXRlT3J0aG9nb25hbE9mZnNldCA+IDA7XG5cdFx0dGhpcy5zcGxpdHZpZXcuZW5kU25hcHBpbmdFbmFibGVkID0gdGhpcy5fZWRnZVNuYXBwaW5nIHx8IHRoaXMuX2Fic29sdXRlT3J0aG9nb25hbE9mZnNldCArIHRoaXMuX3NpemUgPCB0aGlzLmFic29sdXRlT3J0aG9nb25hbFNpemU7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgY2hpbGQgb2YgdGhpcy5jaGlsZHJlbikge1xuXHRcdFx0Y2hpbGQuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZFNjcm9sbC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRTYXNoUmVzZXQuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkVmlzaWJpbGl0eUNoYW5nZS5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLmNoaWxkcmVuVmlzaWJpbGl0eUNoYW5nZURpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuc3BsaXR2aWV3U2FzaFJlc2V0RGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5jaGlsZHJlblNhc2hSZXNldERpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuY2hpbGRyZW5DaGFuZ2VEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLm9uRGlkU2Nyb2xsRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5zcGxpdHZpZXcuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIGxhdGNoZWQgZXZlbnQgdGhhdCBhdm9pZHMgYmVpbmcgZmlyZWQgd2hlbiB0aGUgdmlld1xuICogY29uc3RyYWludHMgZG8gbm90IGNoYW5nZSBhdCBhbGwuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZUxhdGNoZWRPbkRpZENoYW5nZVZpZXdFdmVudCh2aWV3OiBJVmlldyk6IEV2ZW50PElWaWV3U2l6ZSB8IHVuZGVmaW5lZD4ge1xuXHRjb25zdCBbb25EaWRDaGFuZ2VWaWV3Q29uc3RyYWludHMsIG9uRGlkU2V0Vmlld1NpemVdID0gRXZlbnQuc3BsaXQ8dW5kZWZpbmVkLCBJVmlld1NpemU+KHZpZXcub25EaWRDaGFuZ2UsIGlzVW5kZWZpbmVkKTtcblxuXHRyZXR1cm4gRXZlbnQuYW55KFxuXHRcdG9uRGlkU2V0Vmlld1NpemUsXG5cdFx0RXZlbnQubWFwKFxuXHRcdFx0RXZlbnQubGF0Y2goXG5cdFx0XHRcdEV2ZW50Lm1hcChvbkRpZENoYW5nZVZpZXdDb25zdHJhaW50cywgXyA9PiAoW3ZpZXcubWluaW11bVdpZHRoLCB2aWV3Lm1heGltdW1XaWR0aCwgdmlldy5taW5pbXVtSGVpZ2h0LCB2aWV3Lm1heGltdW1IZWlnaHRdKSksXG5cdFx0XHRcdGFycmF5RXF1YWxzXG5cdFx0XHQpLFxuXHRcdFx0XyA9PiB1bmRlZmluZWRcblx0XHQpXG5cdCk7XG59XG5cbmNsYXNzIExlYWZOb2RlIGltcGxlbWVudHMgSVNwbGl0VmlldzxJTGF5b3V0Q29udGV4dD4sIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIF9zaXplOiBudW1iZXIgPSAwO1xuXHRnZXQgc2l6ZSgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5fc2l6ZTsgfVxuXG5cdHByaXZhdGUgX29ydGhvZ29uYWxTaXplOiBudW1iZXI7XG5cdGdldCBvcnRob2dvbmFsU2l6ZSgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5fb3J0aG9nb25hbFNpemU7IH1cblxuXHRwcml2YXRlIGFic29sdXRlT2Zmc2V0OiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIGFic29sdXRlT3J0aG9nb25hbE9mZnNldDogbnVtYmVyID0gMDtcblxuXHRyZWFkb25seSBvbkRpZFNjcm9sbDogRXZlbnQ8dm9pZD4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZFNhc2hSZXNldDogRXZlbnQ8R3JpZExvY2F0aW9uPiA9IEV2ZW50Lk5vbmU7XG5cblx0cHJpdmF0ZSBfb25EaWRMaW5rZWRXaWR0aE5vZGVDaGFuZ2UgPSBuZXcgUmVsYXk8bnVtYmVyIHwgdW5kZWZpbmVkPigpO1xuXHRwcml2YXRlIF9saW5rZWRXaWR0aE5vZGU6IExlYWZOb2RlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRnZXQgbGlua2VkV2lkdGhOb2RlKCk6IExlYWZOb2RlIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2xpbmtlZFdpZHRoTm9kZTsgfVxuXHRzZXQgbGlua2VkV2lkdGhOb2RlKG5vZGU6IExlYWZOb2RlIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fb25EaWRMaW5rZWRXaWR0aE5vZGVDaGFuZ2UuaW5wdXQgPSBub2RlID8gbm9kZS5fb25EaWRWaWV3Q2hhbmdlIDogRXZlbnQuTm9uZTtcblx0XHR0aGlzLl9saW5rZWRXaWR0aE5vZGUgPSBub2RlO1xuXHRcdHRoaXMuX29uRGlkU2V0TGlua2VkTm9kZS5maXJlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkRpZExpbmtlZEhlaWdodE5vZGVDaGFuZ2UgPSBuZXcgUmVsYXk8bnVtYmVyIHwgdW5kZWZpbmVkPigpO1xuXHRwcml2YXRlIF9saW5rZWRIZWlnaHROb2RlOiBMZWFmTm9kZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0Z2V0IGxpbmtlZEhlaWdodE5vZGUoKTogTGVhZk5vZGUgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fbGlua2VkSGVpZ2h0Tm9kZTsgfVxuXHRzZXQgbGlua2VkSGVpZ2h0Tm9kZShub2RlOiBMZWFmTm9kZSB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX29uRGlkTGlua2VkSGVpZ2h0Tm9kZUNoYW5nZS5pbnB1dCA9IG5vZGUgPyBub2RlLl9vbkRpZFZpZXdDaGFuZ2UgOiBFdmVudC5Ob25lO1xuXHRcdHRoaXMuX2xpbmtlZEhlaWdodE5vZGUgPSBub2RlO1xuXHRcdHRoaXMuX29uRGlkU2V0TGlua2VkTm9kZS5maXJlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNldExpbmtlZE5vZGUgPSBuZXcgRW1pdHRlcjxudW1iZXIgfCB1bmRlZmluZWQ+KCk7XG5cdHByaXZhdGUgX29uRGlkVmlld0NoYW5nZTogRXZlbnQ8bnVtYmVyIHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PG51bWJlciB8IHVuZGVmaW5lZD47XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSB2aWV3OiBJVmlldyxcblx0XHRyZWFkb25seSBvcmllbnRhdGlvbjogT3JpZW50YXRpb24sXG5cdFx0cmVhZG9ubHkgbGF5b3V0Q29udHJvbGxlcjogTGF5b3V0Q29udHJvbGxlcixcblx0XHRvcnRob2dvbmFsU2l6ZTogbnVtYmVyLFxuXHRcdHNpemU6IG51bWJlciA9IDBcblx0KSB7XG5cdFx0dGhpcy5fb3J0aG9nb25hbFNpemUgPSBvcnRob2dvbmFsU2l6ZTtcblx0XHR0aGlzLl9zaXplID0gc2l6ZTtcblxuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlID0gY3JlYXRlTGF0Y2hlZE9uRGlkQ2hhbmdlVmlld0V2ZW50KHZpZXcpO1xuXHRcdHRoaXMuX29uRGlkVmlld0NoYW5nZSA9IEV2ZW50Lm1hcChvbkRpZENoYW5nZSwgZSA9PiBlICYmICh0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5WRVJUSUNBTCA/IGUud2lkdGggOiBlLmhlaWdodCksIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHRcdHRoaXMub25EaWRDaGFuZ2UgPSBFdmVudC5hbnkodGhpcy5fb25EaWRWaWV3Q2hhbmdlLCB0aGlzLl9vbkRpZFNldExpbmtlZE5vZGUuZXZlbnQsIHRoaXMuX29uRGlkTGlua2VkV2lkdGhOb2RlQ2hhbmdlLmV2ZW50LCB0aGlzLl9vbkRpZExpbmtlZEhlaWdodE5vZGVDaGFuZ2UuZXZlbnQpO1xuXHR9XG5cblx0Z2V0IHdpZHRoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgPyB0aGlzLm9ydGhvZ29uYWxTaXplIDogdGhpcy5zaXplO1xuXHR9XG5cblx0Z2V0IGhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gdGhpcy5zaXplIDogdGhpcy5vcnRob2dvbmFsU2l6ZTtcblx0fVxuXG5cdGdldCB0b3AoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IHRoaXMuYWJzb2x1dGVPZmZzZXQgOiB0aGlzLmFic29sdXRlT3J0aG9nb25hbE9mZnNldDtcblx0fVxuXG5cdGdldCBsZWZ0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgPyB0aGlzLmFic29sdXRlT3J0aG9nb25hbE9mZnNldCA6IHRoaXMuYWJzb2x1dGVPZmZzZXQ7XG5cdH1cblxuXHRnZXQgZWxlbWVudCgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMudmlldy5lbGVtZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgbWluaW11bVdpZHRoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMubGlua2VkV2lkdGhOb2RlID8gTWF0aC5tYXgodGhpcy5saW5rZWRXaWR0aE5vZGUudmlldy5taW5pbXVtV2lkdGgsIHRoaXMudmlldy5taW5pbXVtV2lkdGgpIDogdGhpcy52aWV3Lm1pbmltdW1XaWR0aDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IG1heGltdW1XaWR0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmxpbmtlZFdpZHRoTm9kZSA/IE1hdGgubWluKHRoaXMubGlua2VkV2lkdGhOb2RlLnZpZXcubWF4aW11bVdpZHRoLCB0aGlzLnZpZXcubWF4aW11bVdpZHRoKSA6IHRoaXMudmlldy5tYXhpbXVtV2lkdGg7XG5cdH1cblxuXHRwcml2YXRlIGdldCBtaW5pbXVtSGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMubGlua2VkSGVpZ2h0Tm9kZSA/IE1hdGgubWF4KHRoaXMubGlua2VkSGVpZ2h0Tm9kZS52aWV3Lm1pbmltdW1IZWlnaHQsIHRoaXMudmlldy5taW5pbXVtSGVpZ2h0KSA6IHRoaXMudmlldy5taW5pbXVtSGVpZ2h0O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgbWF4aW11bUhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmxpbmtlZEhlaWdodE5vZGUgPyBNYXRoLm1pbih0aGlzLmxpbmtlZEhlaWdodE5vZGUudmlldy5tYXhpbXVtSGVpZ2h0LCB0aGlzLnZpZXcubWF4aW11bUhlaWdodCkgOiB0aGlzLnZpZXcubWF4aW11bUhlaWdodDtcblx0fVxuXG5cdGdldCBtaW5pbXVtU2l6ZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gdGhpcy5taW5pbXVtSGVpZ2h0IDogdGhpcy5taW5pbXVtV2lkdGg7XG5cdH1cblxuXHRnZXQgbWF4aW11bVNpemUoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IHRoaXMubWF4aW11bUhlaWdodCA6IHRoaXMubWF4aW11bVdpZHRoO1xuXHR9XG5cblx0Z2V0IHByaW9yaXR5KCk6IExheW91dFByaW9yaXR5IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3LnByaW9yaXR5O1xuXHR9XG5cblx0Z2V0IHByb3BvcnRpb25hbExheW91dCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3LnByb3BvcnRpb25hbExheW91dCA/PyB0cnVlO1xuXHR9XG5cblx0Z2V0IHNuYXAoKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMudmlldy5zbmFwO1xuXHR9XG5cblx0Z2V0IG1pbmltdW1PcnRob2dvbmFsU2l6ZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gdGhpcy5taW5pbXVtV2lkdGggOiB0aGlzLm1pbmltdW1IZWlnaHQ7XG5cdH1cblxuXHRnZXQgbWF4aW11bU9ydGhvZ29uYWxTaXplKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgPyB0aGlzLm1heGltdW1XaWR0aCA6IHRoaXMubWF4aW11bUhlaWdodDtcblx0fVxuXG5cdHByaXZhdGUgX2JvdW5kYXJ5U2FzaGVzOiBJUmVsYXRpdmVCb3VuZGFyeVNhc2hlcyA9IHt9O1xuXHRnZXQgYm91bmRhcnlTYXNoZXMoKTogSVJlbGF0aXZlQm91bmRhcnlTYXNoZXMgeyByZXR1cm4gdGhpcy5fYm91bmRhcnlTYXNoZXM7IH1cblx0c2V0IGJvdW5kYXJ5U2FzaGVzKGJvdW5kYXJ5U2FzaGVzOiBJUmVsYXRpdmVCb3VuZGFyeVNhc2hlcykge1xuXHRcdHRoaXMuX2JvdW5kYXJ5U2FzaGVzID0gYm91bmRhcnlTYXNoZXM7XG5cblx0XHR0aGlzLnZpZXcuc2V0Qm91bmRhcnlTYXNoZXM/Lih0b0Fic29sdXRlQm91bmRhcnlTYXNoZXMoYm91bmRhcnlTYXNoZXMsIHRoaXMub3JpZW50YXRpb24pKTtcblx0fVxuXG5cdGxheW91dChzaXplOiBudW1iZXIsIG9mZnNldDogbnVtYmVyLCBjdHg6IElMYXlvdXRDb250ZXh0IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmxheW91dENvbnRyb2xsZXIuaXNMYXlvdXRFbmFibGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBjdHggPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgc3RhdGUnKTtcblx0XHR9XG5cblx0XHR0aGlzLl9zaXplID0gc2l6ZTtcblx0XHR0aGlzLl9vcnRob2dvbmFsU2l6ZSA9IGN0eC5vcnRob2dvbmFsU2l6ZTtcblx0XHR0aGlzLmFic29sdXRlT2Zmc2V0ID0gY3R4LmFic29sdXRlT2Zmc2V0ICsgb2Zmc2V0O1xuXHRcdHRoaXMuYWJzb2x1dGVPcnRob2dvbmFsT2Zmc2V0ID0gY3R4LmFic29sdXRlT3J0aG9nb25hbE9mZnNldDtcblxuXHRcdHRoaXMuX2xheW91dCh0aGlzLndpZHRoLCB0aGlzLmhlaWdodCwgdGhpcy50b3AsIHRoaXMubGVmdCk7XG5cdH1cblxuXHRwcml2YXRlIGNhY2hlZFdpZHRoOiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIGNhY2hlZEhlaWdodDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBjYWNoZWRUb3A6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgY2FjaGVkTGVmdDogbnVtYmVyID0gMDtcblxuXHRwcml2YXRlIF9sYXlvdXQod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHRvcDogbnVtYmVyLCBsZWZ0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jYWNoZWRXaWR0aCA9PT0gd2lkdGggJiYgdGhpcy5jYWNoZWRIZWlnaHQgPT09IGhlaWdodCAmJiB0aGlzLmNhY2hlZFRvcCA9PT0gdG9wICYmIHRoaXMuY2FjaGVkTGVmdCA9PT0gbGVmdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuY2FjaGVkV2lkdGggPSB3aWR0aDtcblx0XHR0aGlzLmNhY2hlZEhlaWdodCA9IGhlaWdodDtcblx0XHR0aGlzLmNhY2hlZFRvcCA9IHRvcDtcblx0XHR0aGlzLmNhY2hlZExlZnQgPSBsZWZ0O1xuXHRcdHRoaXMudmlldy5sYXlvdXQod2lkdGgsIGhlaWdodCwgdG9wLCBsZWZ0KTtcblx0fVxuXG5cdHNldFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMudmlldy5zZXRWaXNpYmxlPy4odmlzaWJsZSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkU2V0TGlua2VkTm9kZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxudHlwZSBOb2RlID0gQnJhbmNoTm9kZSB8IExlYWZOb2RlO1xuXG5leHBvcnQgaW50ZXJmYWNlIElOb2RlRGVzY3JpcHRvciB7XG5cdG5vZGU6IE5vZGU7XG5cdHZpc2libGU/OiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBmbGlwTm9kZShub2RlOiBCcmFuY2hOb2RlLCBzaXplOiBudW1iZXIsIG9ydGhvZ29uYWxTaXplOiBudW1iZXIpOiBCcmFuY2hOb2RlO1xuZnVuY3Rpb24gZmxpcE5vZGUobm9kZTogTGVhZk5vZGUsIHNpemU6IG51bWJlciwgb3J0aG9nb25hbFNpemU6IG51bWJlcik6IExlYWZOb2RlO1xuZnVuY3Rpb24gZmxpcE5vZGUobm9kZTogTm9kZSwgc2l6ZTogbnVtYmVyLCBvcnRob2dvbmFsU2l6ZTogbnVtYmVyKTogTm9kZTtcbmZ1bmN0aW9uIGZsaXBOb2RlKG5vZGU6IE5vZGUsIHNpemU6IG51bWJlciwgb3J0aG9nb25hbFNpemU6IG51bWJlcik6IE5vZGUge1xuXHRpZiAobm9kZSBpbnN0YW5jZW9mIEJyYW5jaE5vZGUpIHtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgQnJhbmNoTm9kZShvcnRob2dvbmFsKG5vZGUub3JpZW50YXRpb24pLCBub2RlLmxheW91dENvbnRyb2xsZXIsIG5vZGUuc3R5bGVzLCBub2RlLnNwbGl0dmlld1Byb3BvcnRpb25hbExheW91dCwgc2l6ZSwgb3J0aG9nb25hbFNpemUsIG5vZGUuZWRnZVNuYXBwaW5nKTtcblxuXHRcdGxldCB0b3RhbFNpemUgPSAwO1xuXG5cdFx0Zm9yIChsZXQgaSA9IG5vZGUuY2hpbGRyZW4ubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IGNoaWxkID0gbm9kZS5jaGlsZHJlbltpXTtcblx0XHRcdGNvbnN0IGNoaWxkU2l6ZSA9IGNoaWxkIGluc3RhbmNlb2YgQnJhbmNoTm9kZSA/IGNoaWxkLm9ydGhvZ29uYWxTaXplIDogY2hpbGQuc2l6ZTtcblxuXHRcdFx0bGV0IG5ld1NpemUgPSBub2RlLnNpemUgPT09IDAgPyAwIDogTWF0aC5yb3VuZCgoc2l6ZSAqIGNoaWxkU2l6ZSkgLyBub2RlLnNpemUpO1xuXHRcdFx0dG90YWxTaXplICs9IG5ld1NpemU7XG5cblx0XHRcdC8vIFRoZSBsYXN0IHZpZXcgdG8gYWRkIHNob3VsZCBhZGp1c3QgdG8gcm91bmRpbmcgZXJyb3JzXG5cdFx0XHRpZiAoaSA9PT0gMCkge1xuXHRcdFx0XHRuZXdTaXplICs9IHNpemUgLSB0b3RhbFNpemU7XG5cdFx0XHR9XG5cblx0XHRcdHJlc3VsdC5hZGRDaGlsZChmbGlwTm9kZShjaGlsZCwgb3J0aG9nb25hbFNpemUsIG5ld1NpemUpLCBuZXdTaXplLCAwLCB0cnVlKTtcblx0XHR9XG5cblx0XHRub2RlLmRpc3Bvc2UoKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9IGVsc2Uge1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBMZWFmTm9kZShub2RlLnZpZXcsIG9ydGhvZ29uYWwobm9kZS5vcmllbnRhdGlvbiksIG5vZGUubGF5b3V0Q29udHJvbGxlciwgb3J0aG9nb25hbFNpemUpO1xuXHRcdG5vZGUuZGlzcG9zZSgpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuLyoqXG4gKiBUaGUgbG9jYXRpb24gb2YgYSB7QGxpbmsgSVZpZXcgdmlld30gd2l0aGluIGEge0BsaW5rIEdyaWRWaWV3fS5cbiAqXG4gKiBBIEdyaWRWaWV3IGlzIGEgdHJlZSBjb21wb3NpdGlvbiBvZiBtdWx0aXBsZSB7QGxpbmsgU3BsaXRWaWV3fSBpbnN0YW5jZXMsIG9ydGhvZ29uYWxcbiAqIGJldHdlZW4gb25lIGFub3RoZXIuIEhlcmUncyBhbiBleGFtcGxlOlxuICpcbiAqIGBgYFxuICogICstLS0tLSstLS0tLS0tLS0tLS0tLS0rXG4gKiAgfCAgQSAgfCAgICAgIEIgICAgICAgIHxcbiAqICArLS0tLS0rLS0tLS0tLS0tKy0tLS0tK1xuICogIHwgICAgICAgIEMgICAgICB8ICAgICB8XG4gKiAgKy0tLS0tLS0tLS0tLS0tLSsgIEQgIHxcbiAqICB8ICAgICAgICBFICAgICAgfCAgICAgfFxuICogICstLS0tLS0tLS0tLS0tLS0rLS0tLS0rXG4gKiBgYGBcbiAqXG4gKiBUaGUgYWJvdmUgZ3JpZCdzIHRyZWUgc3RydWN0dXJlIGlzOlxuICpcbiAqIGBgYFxuICogIFZlcnRpY2FsIFNwbGl0Vmlld1xuICogICstSG9yaXpvbnRhbCBTcGxpdFZpZXdcbiAqICB8ICstQVxuICogIHwgKy1CXG4gKiAgKy0gSG9yaXpvbnRhbCBTcGxpdFZpZXdcbiAqICAgICstVmVydGljYWwgU3BsaXRWaWV3XG4gKiAgICB8ICstQ1xuICogICAgfCArLUVcbiAqICAgICstRFxuICogYGBgXG4gKlxuICogU28sIHtAbGluayBJVmlldyB2aWV3c30gd2l0aGluIGEge0BsaW5rIEdyaWRWaWV3fSBjYW4gYmUgcmVmZXJlbmNlZCBieVxuICogYSBzZXF1ZW5jZSBvZiBpbmRleGVzLCBlYWNoIGluZGV4IHJlZmVyZW5jaW5nIGVhY2ggU3BsaXRWaWV3LiBIZXJlIGFyZVxuICogZWFjaCB2aWV3J3MgbG9jYXRpb25zLCBmcm9tIHRoZSBleGFtcGxlIGFib3ZlOlxuICpcbiAqIC0gYEFgOiBgWzAsMF1gXG4gKiAtIGBCYDogYFswLDFdYFxuICogLSBgQ2A6IGBbMSwwLDBdYFxuICogLSBgRGA6IGBbMSwxXWBcbiAqIC0gYEVgOiBgWzEsMCwxXWBcbiAqL1xuZXhwb3J0IHR5cGUgR3JpZExvY2F0aW9uID0gbnVtYmVyW107XG5cbi8qKlxuICogVGhlIHtAbGluayBHcmlkVmlld30gaXMgdGhlIFVJIGNvbXBvbmVudCB3aGljaCBpbXBsZW1lbnRzIGEgdHdvIGRpbWVuc2lvbmFsXG4gKiBmbGV4LWxpa2UgbGF5b3V0IGFsZ29yaXRobSBmb3IgYSBjb2xsZWN0aW9uIG9mIHtAbGluayBJVmlld30gaW5zdGFuY2VzLCB3aGljaFxuICogYXJlIG1vc3RseSBIVE1MRWxlbWVudCBpbnN0YW5jZXMgd2l0aCBzaXplIGNvbnN0cmFpbnRzLiBBIHtAbGluayBHcmlkVmlld30gaXMgYVxuICogdHJlZSBjb21wb3NpdGlvbiBvZiBtdWx0aXBsZSB7QGxpbmsgU3BsaXRWaWV3fSBpbnN0YW5jZXMsIG9ydGhvZ29uYWwgYmV0d2VlblxuICogb25lIGFub3RoZXIuIEl0IHdpbGwgcmVzcGVjdCB2aWV3J3Mgc2l6ZSBjb250cmFpbnRzLCBqdXN0IGxpa2UgdGhlIFNwbGl0Vmlldy5cbiAqXG4gKiBJdCBoYXMgYSBsb3ctbGV2ZWwgaW5kZXggYmFzZWQgQVBJLCBhbGxvd2luZyBmb3IgZmluZSBncmFpbiBwZXJmb3JtYW50IG9wZXJhdGlvbnMuXG4gKiBMb29rIGludG8gdGhlIHtAbGluayBHcmlkfSB3aWRnZXQgZm9yIGEgaGlnaGVyLWxldmVsIEFQSS5cbiAqXG4gKiBGZWF0dXJlczpcbiAqIC0gZmxleC1saWtlIGxheW91dCBhbGdvcml0aG1cbiAqIC0gc25hcCBzdXBwb3J0XG4gKiAtIGNvcm5lciBzYXNoIHN1cHBvcnRcbiAqIC0gQWx0IGtleSBtb2RpZmllciBiZWhhdmlvciwgbWFjT1Mgc3R5bGVcbiAqIC0gbGF5b3V0IChkZSlzZXJpYWxpemF0aW9uXG4gKi9cbmV4cG9ydCBjbGFzcyBHcmlkVmlldyBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHQvKipcblx0ICogVGhlIERPTSBlbGVtZW50IGZvciB0aGlzIHZpZXcuXG5cdCAqL1xuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHN0eWxlczogSUdyaWRWaWV3U3R5bGVzO1xuXHRwcml2YXRlIHByb3BvcnRpb25hbExheW91dDogYm9vbGVhbjtcblx0cHJpdmF0ZSBfcm9vdCE6IEJyYW5jaE5vZGU7XG5cdHByaXZhdGUgb25EaWRTYXNoUmVzZXRSZWxheSA9IG5ldyBSZWxheTxHcmlkTG9jYXRpb24+KCk7XG5cdHByaXZhdGUgX29uRGlkU2Nyb2xsID0gbmV3IFJlbGF5PHZvaWQ+KCk7XG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlID0gbmV3IFJlbGF5PElWaWV3U2l6ZSB8IHVuZGVmaW5lZD4oKTtcblx0cHJpdmF0ZSBfYm91bmRhcnlTYXNoZXM6IElCb3VuZGFyeVNhc2hlcyA9IHt9O1xuXG5cdC8qKlxuXHQgKiBUaGUgbGF5b3V0IGNvbnRyb2xsZXIgbWFrZXMgc3VyZSBsYXlvdXQgb25seSBwcm9wYWdhdGVzXG5cdCAqIHRvIHRoZSB2aWV3cyBhZnRlciB0aGUgdmVyeSBmaXJzdCBjYWxsIHRvIHtAbGluayBHcmlkVmlldy5sYXlvdXR9LlxuXHQgKi9cblx0cHJpdmF0ZSBsYXlvdXRDb250cm9sbGVyOiBMYXlvdXRDb250cm9sbGVyO1xuXHRwcml2YXRlIGRpc3Bvc2FibGUyeDI6IElEaXNwb3NhYmxlID0gRGlzcG9zYWJsZS5Ob25lO1xuXG5cdHByaXZhdGUgZ2V0IHJvb3QoKTogQnJhbmNoTm9kZSB7IHJldHVybiB0aGlzLl9yb290OyB9XG5cblx0cHJpdmF0ZSBzZXQgcm9vdChyb290OiBCcmFuY2hOb2RlKSB7XG5cdFx0Y29uc3Qgb2xkUm9vdCA9IHRoaXMuX3Jvb3Q7XG5cblx0XHRpZiAob2xkUm9vdCkge1xuXHRcdFx0b2xkUm9vdC5lbGVtZW50LnJlbW92ZSgpO1xuXHRcdFx0b2xkUm9vdC5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcm9vdCA9IHJvb3Q7XG5cdFx0dGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKHJvb3QuZWxlbWVudCk7XG5cdFx0dGhpcy5vbkRpZFNhc2hSZXNldFJlbGF5LmlucHV0ID0gcm9vdC5vbkRpZFNhc2hSZXNldDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5pbnB1dCA9IEV2ZW50Lm1hcChyb290Lm9uRGlkQ2hhbmdlLCAoKSA9PiB1bmRlZmluZWQpOyAvLyBUT0RPXG5cdFx0dGhpcy5fb25EaWRTY3JvbGwuaW5wdXQgPSByb290Lm9uRGlkU2Nyb2xsO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZpcmVzIHdoZW5ldmVyIHRoZSB1c2VyIGRvdWJsZSBjbGlja3MgYSB7QGxpbmsgU2FzaCBzYXNofS5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkU2FzaFJlc2V0ID0gdGhpcy5vbkRpZFNhc2hSZXNldFJlbGF5LmV2ZW50O1xuXG5cdC8qKlxuXHQgKiBGaXJlcyB3aGVuZXZlciB0aGUgdXNlciBzY3JvbGxzIGEge0BsaW5rIFNwbGl0Vmlld30gd2l0aGluXG5cdCAqIHRoZSBncmlkLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRTY3JvbGwgPSB0aGlzLl9vbkRpZFNjcm9sbC5ldmVudDtcblxuXHQvKipcblx0ICogRmlyZXMgd2hlbmV2ZXIgYSB2aWV3IHdpdGhpbiB0aGUgZ3JpZCBjaGFuZ2VzIGl0cyBzaXplIGNvbnN0cmFpbnRzLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2UgPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHQvKipcblx0ICogVGhlIHdpZHRoIG9mIHRoZSBncmlkLlxuXHQgKi9cblx0Z2V0IHdpZHRoKCk6IG51bWJlciB7IHJldHVybiB0aGlzLnJvb3Qud2lkdGg7IH1cblxuXHQvKipcblx0ICogVGhlIGhlaWdodCBvZiB0aGUgZ3JpZC5cblx0ICovXG5cdGdldCBoZWlnaHQoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMucm9vdC5oZWlnaHQ7IH1cblxuXHQvKipcblx0ICogVGhlIG1pbmltdW0gd2lkdGggb2YgdGhlIGdyaWQuXG5cdCAqL1xuXHRnZXQgbWluaW11bVdpZHRoKCk6IG51bWJlciB7IHJldHVybiB0aGlzLnJvb3QubWluaW11bVdpZHRoOyB9XG5cblx0LyoqXG5cdCAqIFRoZSBtaW5pbXVtIGhlaWdodCBvZiB0aGUgZ3JpZC5cblx0ICovXG5cdGdldCBtaW5pbXVtSGVpZ2h0KCk6IG51bWJlciB7IHJldHVybiB0aGlzLnJvb3QubWluaW11bUhlaWdodDsgfVxuXG5cdC8qKlxuXHQgKiBUaGUgbWF4aW11bSB3aWR0aCBvZiB0aGUgZ3JpZC5cblx0ICovXG5cdGdldCBtYXhpbXVtV2lkdGgoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMucm9vdC5tYXhpbXVtSGVpZ2h0OyB9XG5cblx0LyoqXG5cdCAqIFRoZSBtYXhpbXVtIGhlaWdodCBvZiB0aGUgZ3JpZC5cblx0ICovXG5cdGdldCBtYXhpbXVtSGVpZ2h0KCk6IG51bWJlciB7IHJldHVybiB0aGlzLnJvb3QubWF4aW11bUhlaWdodDsgfVxuXG5cdGdldCBvcmllbnRhdGlvbigpOiBPcmllbnRhdGlvbiB7IHJldHVybiB0aGlzLl9yb290Lm9yaWVudGF0aW9uOyB9XG5cdGdldCBib3VuZGFyeVNhc2hlcygpOiBJQm91bmRhcnlTYXNoZXMgeyByZXR1cm4gdGhpcy5fYm91bmRhcnlTYXNoZXM7IH1cblxuXHQvKipcblx0ICogVGhlIG9yaWVudGF0aW9uIG9mIHRoZSBncmlkLiBNYXRjaGVzIHRoZSBvcmllbnRhdGlvbiBvZiB0aGUgcm9vdFxuXHQgKiB7QGxpbmsgU3BsaXRWaWV3fSBpbiB0aGUgZ3JpZCdzIHRyZWUgbW9kZWwuXG5cdCAqL1xuXHRzZXQgb3JpZW50YXRpb24ob3JpZW50YXRpb246IE9yaWVudGF0aW9uKSB7XG5cdFx0aWYgKHRoaXMuX3Jvb3Qub3JpZW50YXRpb24gPT09IG9yaWVudGF0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBzaXplLCBvcnRob2dvbmFsU2l6ZSwgYWJzb2x1dGVPZmZzZXQsIGFic29sdXRlT3J0aG9nb25hbE9mZnNldCB9ID0gdGhpcy5fcm9vdDtcblx0XHR0aGlzLnJvb3QgPSBmbGlwTm9kZSh0aGlzLl9yb290LCBvcnRob2dvbmFsU2l6ZSwgc2l6ZSk7XG5cdFx0dGhpcy5yb290LmxheW91dChzaXplLCAwLCB7IG9ydGhvZ29uYWxTaXplLCBhYnNvbHV0ZU9mZnNldDogYWJzb2x1dGVPcnRob2dvbmFsT2Zmc2V0LCBhYnNvbHV0ZU9ydGhvZ29uYWxPZmZzZXQ6IGFic29sdXRlT2Zmc2V0LCBhYnNvbHV0ZVNpemU6IHNpemUsIGFic29sdXRlT3J0aG9nb25hbFNpemU6IG9ydGhvZ29uYWxTaXplIH0pO1xuXHRcdHRoaXMuYm91bmRhcnlTYXNoZXMgPSB0aGlzLmJvdW5kYXJ5U2FzaGVzO1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgY29sbGVjdGlvbiBvZiBzYXNoZXMgcGVycGVuZGljdWxhciB0byBlYWNoIGVkZ2Ugb2YgdGhlIGdyaWQuXG5cdCAqIENvcm5lciBzYXNoZXMgd2lsbCBiZSBjcmVhdGVkIGZvciBlYWNoIGludGVyc2VjdGlvbi5cblx0ICovXG5cdHNldCBib3VuZGFyeVNhc2hlcyhib3VuZGFyeVNhc2hlczogSUJvdW5kYXJ5U2FzaGVzKSB7XG5cdFx0dGhpcy5fYm91bmRhcnlTYXNoZXMgPSBib3VuZGFyeVNhc2hlcztcblx0XHR0aGlzLnJvb3QuYm91bmRhcnlTYXNoZXMgPSBmcm9tQWJzb2x1dGVCb3VuZGFyeVNhc2hlcyhib3VuZGFyeVNhc2hlcywgdGhpcy5vcmllbnRhdGlvbik7XG5cdH1cblxuXHQvKipcblx0ICogRW5hYmxlL2Rpc2FibGUgZWRnZSBzbmFwcGluZyBhY3Jvc3MgYWxsIGdyaWQgdmlld3MuXG5cdCAqL1xuXHRzZXQgZWRnZVNuYXBwaW5nKGVkZ2VTbmFwcGluZzogYm9vbGVhbikge1xuXHRcdHRoaXMucm9vdC5lZGdlU25hcHBpbmcgPSBlZGdlU25hcHBpbmc7XG5cdH1cblxuXHRwcml2YXRlIG1heGltaXplZE5vZGU6IExlYWZOb2RlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVmlld01heGltaXplZCA9IG5ldyBFbWl0dGVyPGJvb2xlYW4+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlld01heGltaXplZCA9IHRoaXMuX29uRGlkQ2hhbmdlVmlld01heGltaXplZC5ldmVudDtcblxuXHQvKipcblx0ICogQ3JlYXRlIGEgbmV3IHtAbGluayBHcmlkVmlld30gaW5zdGFuY2UuXG5cdCAqXG5cdCAqIEByZW1hcmtzIEl0J3MgdGhlIGNhbGxlcidzIHJlc3BvbnNpYmlsaXR5IHRvIGFwcGVuZCB0aGVcblx0ICoge0BsaW5rIEdyaWRWaWV3LmVsZW1lbnR9IHRvIHRoZSBwYWdlJ3MgRE9NLlxuXHQgKi9cblx0Y29uc3RydWN0b3Iob3B0aW9uczogSUdyaWRWaWV3T3B0aW9ucyA9IHt9KSB7XG5cdFx0dGhpcy5lbGVtZW50ID0gJCgnLm1vbmFjby1ncmlkLXZpZXcnKTtcblx0XHR0aGlzLnN0eWxlcyA9IG9wdGlvbnMuc3R5bGVzIHx8IGRlZmF1bHRTdHlsZXM7XG5cdFx0dGhpcy5wcm9wb3J0aW9uYWxMYXlvdXQgPSB0eXBlb2Ygb3B0aW9ucy5wcm9wb3J0aW9uYWxMYXlvdXQgIT09ICd1bmRlZmluZWQnID8gISFvcHRpb25zLnByb3BvcnRpb25hbExheW91dCA6IHRydWU7XG5cdFx0dGhpcy5sYXlvdXRDb250cm9sbGVyID0gbmV3IExheW91dENvbnRyb2xsZXIoZmFsc2UpO1xuXHRcdHRoaXMucm9vdCA9IG5ldyBCcmFuY2hOb2RlKE9yaWVudGF0aW9uLlZFUlRJQ0FMLCB0aGlzLmxheW91dENvbnRyb2xsZXIsIHRoaXMuc3R5bGVzLCB0aGlzLnByb3BvcnRpb25hbExheW91dCk7XG5cdH1cblxuXHRzdHlsZShzdHlsZXM6IElHcmlkVmlld1N0eWxlcyk6IHZvaWQge1xuXHRcdHRoaXMuc3R5bGVzID0gc3R5bGVzO1xuXHRcdHRoaXMucm9vdC5zdHlsZShzdHlsZXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIExheW91dCB0aGUge0BsaW5rIEdyaWRWaWV3fS5cblx0ICpcblx0ICogT3B0aW9uYWxseSBwcm92aWRlIGEgYHRvcGAgYW5kIGBsZWZ0YCBwb3NpdGlvbnMsIHRob3NlIHdpbGwgcHJvcGFnYXRlXG5cdCAqIGFzIGFuIG9yaWdpbiBmb3IgcG9zaXRpb25zIHBhc3NlZCB0byB7QGxpbmsgSVZpZXcubGF5b3V0fS5cblx0ICpcblx0ICogQHBhcmFtIHdpZHRoIFRoZSB3aWR0aCBvZiB0aGUge0BsaW5rIEdyaWRWaWV3fS5cblx0ICogQHBhcmFtIGhlaWdodCBUaGUgaGVpZ2h0IG9mIHRoZSB7QGxpbmsgR3JpZFZpZXd9LlxuXHQgKiBAcGFyYW0gdG9wIE9wdGlvbmFsLCB0aGUgdG9wIGxvY2F0aW9uIG9mIHRoZSB7QGxpbmsgR3JpZFZpZXd9LlxuXHQgKiBAcGFyYW0gbGVmdCBPcHRpb25hbCwgdGhlIGxlZnQgbG9jYXRpb24gb2YgdGhlIHtAbGluayBHcmlkVmlld30uXG5cdCAqL1xuXHRsYXlvdXQod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHRvcDogbnVtYmVyID0gMCwgbGVmdDogbnVtYmVyID0gMCk6IHZvaWQge1xuXHRcdHRoaXMubGF5b3V0Q29udHJvbGxlci5pc0xheW91dEVuYWJsZWQgPSB0cnVlO1xuXG5cdFx0Y29uc3QgW3NpemUsIG9ydGhvZ29uYWxTaXplLCBvZmZzZXQsIG9ydGhvZ29uYWxPZmZzZXRdID0gdGhpcy5yb290Lm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gW2hlaWdodCwgd2lkdGgsIHRvcCwgbGVmdF0gOiBbd2lkdGgsIGhlaWdodCwgbGVmdCwgdG9wXTtcblx0XHR0aGlzLnJvb3QubGF5b3V0KHNpemUsIDAsIHsgb3J0aG9nb25hbFNpemUsIGFic29sdXRlT2Zmc2V0OiBvZmZzZXQsIGFic29sdXRlT3J0aG9nb25hbE9mZnNldDogb3J0aG9nb25hbE9mZnNldCwgYWJzb2x1dGVTaXplOiBzaXplLCBhYnNvbHV0ZU9ydGhvZ29uYWxTaXplOiBvcnRob2dvbmFsU2l6ZSB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBZGQgYSB7QGxpbmsgSVZpZXcgdmlld30gdG8gdGhpcyB7QGxpbmsgR3JpZFZpZXd9LlxuXHQgKlxuXHQgKiBAcGFyYW0gdmlldyBUaGUgdmlldyB0byBhZGQuXG5cdCAqIEBwYXJhbSBzaXplIEVpdGhlciBhIGZpeGVkIHNpemUsIG9yIGEgZHluYW1pYyB7QGxpbmsgU2l6aW5nfSBzdHJhdGVneS5cblx0ICogQHBhcmFtIGxvY2F0aW9uIFRoZSB7QGxpbmsgR3JpZExvY2F0aW9uIGxvY2F0aW9ufSB0byBpbnNlcnQgdGhlIHZpZXcgb24uXG5cdCAqL1xuXHRhZGRWaWV3KHZpZXc6IElWaWV3LCBzaXplOiBudW1iZXIgfCBTaXppbmcsIGxvY2F0aW9uOiBHcmlkTG9jYXRpb24pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5oYXNNYXhpbWl6ZWRWaWV3KCkpIHtcblx0XHRcdHRoaXMuZXhpdE1heGltaXplZFZpZXcoKTtcblx0XHR9XG5cblx0XHR0aGlzLmRpc3Bvc2FibGUyeDIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZTJ4MiA9IERpc3Bvc2FibGUuTm9uZTtcblxuXHRcdGNvbnN0IFtyZXN0LCBpbmRleF0gPSB0YWlsKGxvY2F0aW9uKTtcblx0XHRjb25zdCBbcGF0aFRvUGFyZW50LCBwYXJlbnRdID0gdGhpcy5nZXROb2RlKHJlc3QpO1xuXG5cdFx0aWYgKHBhcmVudCBpbnN0YW5jZW9mIEJyYW5jaE5vZGUpIHtcblx0XHRcdGNvbnN0IG5vZGUgPSBuZXcgTGVhZk5vZGUodmlldywgb3J0aG9nb25hbChwYXJlbnQub3JpZW50YXRpb24pLCB0aGlzLmxheW91dENvbnRyb2xsZXIsIHBhcmVudC5vcnRob2dvbmFsU2l6ZSk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdHBhcmVudC5hZGRDaGlsZChub2RlLCBzaXplLCBpbmRleCk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0bm9kZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgWywgZ3JhbmRQYXJlbnRdID0gdGFpbChwYXRoVG9QYXJlbnQpO1xuXHRcdFx0Y29uc3QgWywgcGFyZW50SW5kZXhdID0gdGFpbChyZXN0KTtcblxuXHRcdFx0bGV0IG5ld1NpYmxpbmdTaXplOiBudW1iZXIgfCBTaXppbmcgPSAwO1xuXG5cdFx0XHRjb25zdCBuZXdTaWJsaW5nQ2FjaGVkVmlzaWJsZVNpemUgPSBncmFuZFBhcmVudC5nZXRDaGlsZENhY2hlZFZpc2libGVTaXplKHBhcmVudEluZGV4KTtcblx0XHRcdGlmICh0eXBlb2YgbmV3U2libGluZ0NhY2hlZFZpc2libGVTaXplID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRuZXdTaWJsaW5nU2l6ZSA9IFNpemluZy5JbnZpc2libGUobmV3U2libGluZ0NhY2hlZFZpc2libGVTaXplKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgb2xkQ2hpbGQgPSBncmFuZFBhcmVudC5yZW1vdmVDaGlsZChwYXJlbnRJbmRleCk7XG5cdFx0XHRvbGRDaGlsZC5kaXNwb3NlKCk7XG5cblx0XHRcdGNvbnN0IG5ld1BhcmVudCA9IG5ldyBCcmFuY2hOb2RlKHBhcmVudC5vcmllbnRhdGlvbiwgcGFyZW50LmxheW91dENvbnRyb2xsZXIsIHRoaXMuc3R5bGVzLCB0aGlzLnByb3BvcnRpb25hbExheW91dCwgcGFyZW50LnNpemUsIHBhcmVudC5vcnRob2dvbmFsU2l6ZSwgZ3JhbmRQYXJlbnQuZWRnZVNuYXBwaW5nKTtcblx0XHRcdGdyYW5kUGFyZW50LmFkZENoaWxkKG5ld1BhcmVudCwgcGFyZW50LnNpemUsIHBhcmVudEluZGV4KTtcblxuXHRcdFx0Y29uc3QgbmV3U2libGluZyA9IG5ldyBMZWFmTm9kZShwYXJlbnQudmlldywgZ3JhbmRQYXJlbnQub3JpZW50YXRpb24sIHRoaXMubGF5b3V0Q29udHJvbGxlciwgcGFyZW50LnNpemUpO1xuXHRcdFx0bmV3UGFyZW50LmFkZENoaWxkKG5ld1NpYmxpbmcsIG5ld1NpYmxpbmdTaXplLCAwKTtcblxuXHRcdFx0aWYgKHR5cGVvZiBzaXplICE9PSAnbnVtYmVyJyAmJiBzaXplLnR5cGUgPT09ICdzcGxpdCcpIHtcblx0XHRcdFx0c2l6ZSA9IFNpemluZy5TcGxpdCgwKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgbm9kZSA9IG5ldyBMZWFmTm9kZSh2aWV3LCBncmFuZFBhcmVudC5vcmllbnRhdGlvbiwgdGhpcy5sYXlvdXRDb250cm9sbGVyLCBwYXJlbnQuc2l6ZSk7XG5cdFx0XHRuZXdQYXJlbnQuYWRkQ2hpbGQobm9kZSwgc2l6ZSwgaW5kZXgpO1xuXHRcdH1cblxuXHRcdHRoaXMudHJ5U2V0MngyKCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVtb3ZlIGEge0BsaW5rIElWaWV3IHZpZXd9IGZyb20gdGhpcyB7QGxpbmsgR3JpZFZpZXd9LlxuXHQgKlxuXHQgKiBAcGFyYW0gbG9jYXRpb24gVGhlIHtAbGluayBHcmlkTG9jYXRpb24gbG9jYXRpb259IG9mIHRoZSB7QGxpbmsgSVZpZXcgdmlld30uXG5cdCAqIEBwYXJhbSBzaXppbmcgV2hldGhlciB0byBkaXN0cmlidXRlIG90aGVyIHtAbGluayBJVmlldyB2aWV3fSdzIHNpemVzLlxuXHQgKi9cblx0cmVtb3ZlVmlldyhsb2NhdGlvbjogR3JpZExvY2F0aW9uLCBzaXppbmc/OiBEaXN0cmlidXRlU2l6aW5nIHwgQXV0b1NpemluZyk6IElWaWV3IHtcblx0XHRpZiAodGhpcy5oYXNNYXhpbWl6ZWRWaWV3KCkpIHtcblx0XHRcdHRoaXMuZXhpdE1heGltaXplZFZpZXcoKTtcblx0XHR9XG5cblx0XHR0aGlzLmRpc3Bvc2FibGUyeDIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZTJ4MiA9IERpc3Bvc2FibGUuTm9uZTtcblxuXHRcdGNvbnN0IFtyZXN0LCBpbmRleF0gPSB0YWlsKGxvY2F0aW9uKTtcblx0XHRjb25zdCBbcGF0aFRvUGFyZW50LCBwYXJlbnRdID0gdGhpcy5nZXROb2RlKHJlc3QpO1xuXG5cdFx0aWYgKCEocGFyZW50IGluc3RhbmNlb2YgQnJhbmNoTm9kZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBsb2NhdGlvbicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vZGUgPSBwYXJlbnQuY2hpbGRyZW5baW5kZXhdO1xuXG5cdFx0aWYgKCEobm9kZSBpbnN0YW5jZW9mIExlYWZOb2RlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGxvY2F0aW9uJyk7XG5cdFx0fVxuXG5cdFx0cGFyZW50LnJlbW92ZUNoaWxkKGluZGV4LCBzaXppbmcpO1xuXHRcdG5vZGUuZGlzcG9zZSgpO1xuXG5cdFx0aWYgKHBhcmVudC5jaGlsZHJlbi5sZW5ndGggPT09IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBncmlkIHN0YXRlJyk7XG5cdFx0fVxuXG5cdFx0aWYgKHBhcmVudC5jaGlsZHJlbi5sZW5ndGggPiAxKSB7XG5cdFx0XHR0aGlzLnRyeVNldDJ4MigpO1xuXHRcdFx0cmV0dXJuIG5vZGUudmlldztcblx0XHR9XG5cblx0XHRpZiAocGF0aFRvUGFyZW50Lmxlbmd0aCA9PT0gMCkgeyAvLyBwYXJlbnQgaXMgcm9vdFxuXHRcdFx0Y29uc3Qgc2libGluZyA9IHBhcmVudC5jaGlsZHJlblswXTtcblxuXHRcdFx0aWYgKHNpYmxpbmcgaW5zdGFuY2VvZiBMZWFmTm9kZSkge1xuXHRcdFx0XHRyZXR1cm4gbm9kZS52aWV3O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB3ZSBtdXN0IHByb21vdGUgc2libGluZyB0byBiZSB0aGUgbmV3IHJvb3Rcblx0XHRcdHBhcmVudC5yZW1vdmVDaGlsZCgwKTtcblx0XHRcdHBhcmVudC5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLnJvb3QgPSBzaWJsaW5nO1xuXHRcdFx0dGhpcy5ib3VuZGFyeVNhc2hlcyA9IHRoaXMuYm91bmRhcnlTYXNoZXM7XG5cdFx0XHR0aGlzLnRyeVNldDJ4MigpO1xuXHRcdFx0cmV0dXJuIG5vZGUudmlldztcblx0XHR9XG5cblx0XHRjb25zdCBbLCBncmFuZFBhcmVudF0gPSB0YWlsKHBhdGhUb1BhcmVudCk7XG5cdFx0Y29uc3QgWywgcGFyZW50SW5kZXhdID0gdGFpbChyZXN0KTtcblxuXHRcdGNvbnN0IGlzU2libGluZ1Zpc2libGUgPSBwYXJlbnQuaXNDaGlsZFZpc2libGUoMCk7XG5cdFx0Y29uc3Qgc2libGluZyA9IHBhcmVudC5yZW1vdmVDaGlsZCgwKTtcblxuXHRcdGNvbnN0IHNpemVzID0gZ3JhbmRQYXJlbnQuY2hpbGRyZW4ubWFwKChfLCBpKSA9PiBncmFuZFBhcmVudC5nZXRDaGlsZFNpemUoaSkpO1xuXHRcdGdyYW5kUGFyZW50LnJlbW92ZUNoaWxkKHBhcmVudEluZGV4LCBzaXppbmcpO1xuXHRcdHBhcmVudC5kaXNwb3NlKCk7XG5cblx0XHRpZiAoc2libGluZyBpbnN0YW5jZW9mIEJyYW5jaE5vZGUpIHtcblx0XHRcdHNpemVzLnNwbGljZShwYXJlbnRJbmRleCwgMSwgLi4uc2libGluZy5jaGlsZHJlbi5tYXAoYyA9PiBjLnNpemUpKTtcblxuXHRcdFx0Y29uc3Qgc2libGluZ0NoaWxkcmVuID0gc2libGluZy5yZW1vdmVBbGxDaGlsZHJlbigpO1xuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNpYmxpbmdDaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRncmFuZFBhcmVudC5hZGRDaGlsZChzaWJsaW5nQ2hpbGRyZW5baV0sIHNpYmxpbmdDaGlsZHJlbltpXS5zaXplLCBwYXJlbnRJbmRleCArIGkpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBuZXdTaWJsaW5nID0gbmV3IExlYWZOb2RlKHNpYmxpbmcudmlldywgb3J0aG9nb25hbChzaWJsaW5nLm9yaWVudGF0aW9uKSwgdGhpcy5sYXlvdXRDb250cm9sbGVyLCBzaWJsaW5nLnNpemUpO1xuXHRcdFx0Y29uc3Qgc2l6aW5nID0gaXNTaWJsaW5nVmlzaWJsZSA/IHNpYmxpbmcub3J0aG9nb25hbFNpemUgOiBTaXppbmcuSW52aXNpYmxlKHNpYmxpbmcub3J0aG9nb25hbFNpemUpO1xuXHRcdFx0Z3JhbmRQYXJlbnQuYWRkQ2hpbGQobmV3U2libGluZywgc2l6aW5nLCBwYXJlbnRJbmRleCk7XG5cdFx0fVxuXG5cdFx0c2libGluZy5kaXNwb3NlKCk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNpemVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRncmFuZFBhcmVudC5yZXNpemVDaGlsZChpLCBzaXplc1tpXSk7XG5cdFx0fVxuXG5cdFx0dGhpcy50cnlTZXQyeDIoKTtcblx0XHRyZXR1cm4gbm9kZS52aWV3O1xuXHR9XG5cblx0LyoqXG5cdCAqIE1vdmUgYSB7QGxpbmsgSVZpZXcgdmlld30gd2l0aGluIGl0cyBwYXJlbnQuXG5cdCAqXG5cdCAqIEBwYXJhbSBwYXJlbnRMb2NhdGlvbiBUaGUge0BsaW5rIEdyaWRMb2NhdGlvbiBsb2NhdGlvbn0gb2YgdGhlIHtAbGluayBJVmlldyB2aWV3fSdzIHBhcmVudC5cblx0ICogQHBhcmFtIGZyb20gVGhlIGluZGV4IG9mIHRoZSB7QGxpbmsgSVZpZXcgdmlld30gdG8gbW92ZS5cblx0ICogQHBhcmFtIHRvIFRoZSBpbmRleCB3aGVyZSB0aGUge0BsaW5rIElWaWV3IHZpZXd9IHNob3VsZCBtb3ZlIHRvLlxuXHQgKi9cblx0bW92ZVZpZXcocGFyZW50TG9jYXRpb246IEdyaWRMb2NhdGlvbiwgZnJvbTogbnVtYmVyLCB0bzogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaGFzTWF4aW1pemVkVmlldygpKSB7XG5cdFx0XHR0aGlzLmV4aXRNYXhpbWl6ZWRWaWV3KCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgWywgcGFyZW50XSA9IHRoaXMuZ2V0Tm9kZShwYXJlbnRMb2NhdGlvbik7XG5cblx0XHRpZiAoIShwYXJlbnQgaW5zdGFuY2VvZiBCcmFuY2hOb2RlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGxvY2F0aW9uJyk7XG5cdFx0fVxuXG5cdFx0cGFyZW50Lm1vdmVDaGlsZChmcm9tLCB0byk7XG5cblx0XHR0aGlzLnRyeVNldDJ4MigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN3YXAgdHdvIHtAbGluayBJVmlldyB2aWV3c30gd2l0aGluIHRoZSB7QGxpbmsgR3JpZFZpZXd9LlxuXHQgKlxuXHQgKiBAcGFyYW0gZnJvbSBUaGUge0BsaW5rIEdyaWRMb2NhdGlvbiBsb2NhdGlvbn0gb2Ygb25lIHZpZXcuXG5cdCAqIEBwYXJhbSB0byBUaGUge0BsaW5rIEdyaWRMb2NhdGlvbiBsb2NhdGlvbn0gb2YgYW5vdGhlciB2aWV3LlxuXHQgKi9cblx0c3dhcFZpZXdzKGZyb206IEdyaWRMb2NhdGlvbiwgdG86IEdyaWRMb2NhdGlvbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmhhc01heGltaXplZFZpZXcoKSkge1xuXHRcdFx0dGhpcy5leGl0TWF4aW1pemVkVmlldygpO1xuXHRcdH1cblxuXHRcdGNvbnN0IFtmcm9tUmVzdCwgZnJvbUluZGV4XSA9IHRhaWwoZnJvbSk7XG5cdFx0Y29uc3QgWywgZnJvbVBhcmVudF0gPSB0aGlzLmdldE5vZGUoZnJvbVJlc3QpO1xuXG5cdFx0aWYgKCEoZnJvbVBhcmVudCBpbnN0YW5jZW9mIEJyYW5jaE5vZGUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgZnJvbSBsb2NhdGlvbicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZyb21TaXplID0gZnJvbVBhcmVudC5nZXRDaGlsZFNpemUoZnJvbUluZGV4KTtcblx0XHRjb25zdCBmcm9tTm9kZSA9IGZyb21QYXJlbnQuY2hpbGRyZW5bZnJvbUluZGV4XTtcblxuXHRcdGlmICghKGZyb21Ob2RlIGluc3RhbmNlb2YgTGVhZk5vZGUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgZnJvbSBsb2NhdGlvbicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IFt0b1Jlc3QsIHRvSW5kZXhdID0gdGFpbCh0byk7XG5cdFx0Y29uc3QgWywgdG9QYXJlbnRdID0gdGhpcy5nZXROb2RlKHRvUmVzdCk7XG5cblx0XHRpZiAoISh0b1BhcmVudCBpbnN0YW5jZW9mIEJyYW5jaE5vZGUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgdG8gbG9jYXRpb24nKTtcblx0XHR9XG5cblx0XHRjb25zdCB0b1NpemUgPSB0b1BhcmVudC5nZXRDaGlsZFNpemUodG9JbmRleCk7XG5cdFx0Y29uc3QgdG9Ob2RlID0gdG9QYXJlbnQuY2hpbGRyZW5bdG9JbmRleF07XG5cblx0XHRpZiAoISh0b05vZGUgaW5zdGFuY2VvZiBMZWFmTm9kZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCB0byBsb2NhdGlvbicpO1xuXHRcdH1cblxuXHRcdGlmIChmcm9tUGFyZW50ID09PSB0b1BhcmVudCkge1xuXHRcdFx0ZnJvbVBhcmVudC5zd2FwQ2hpbGRyZW4oZnJvbUluZGV4LCB0b0luZGV4KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZnJvbVBhcmVudC5yZW1vdmVDaGlsZChmcm9tSW5kZXgpO1xuXHRcdFx0dG9QYXJlbnQucmVtb3ZlQ2hpbGQodG9JbmRleCk7XG5cblx0XHRcdGZyb21QYXJlbnQuYWRkQ2hpbGQodG9Ob2RlLCBmcm9tU2l6ZSwgZnJvbUluZGV4KTtcblx0XHRcdHRvUGFyZW50LmFkZENoaWxkKGZyb21Ob2RlLCB0b1NpemUsIHRvSW5kZXgpO1xuXHRcdH1cblxuXHRcdHRoaXMudHJ5U2V0MngyKCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVzaXplIGEge0BsaW5rIElWaWV3IHZpZXd9LlxuXHQgKlxuXHQgKiBAcGFyYW0gbG9jYXRpb24gVGhlIHtAbGluayBHcmlkTG9jYXRpb24gbG9jYXRpb259IG9mIHRoZSB2aWV3LlxuXHQgKiBAcGFyYW0gc2l6ZSBUaGUgc2l6ZSB0aGUgdmlldyBzaG91bGQgYmUuIE9wdGlvbmFsbHkgcHJvdmlkZSBhIHNpbmdsZSBkaW1lbnNpb24uXG5cdCAqL1xuXHRyZXNpemVWaWV3KGxvY2F0aW9uOiBHcmlkTG9jYXRpb24sIHNpemU6IFBhcnRpYWw8SVZpZXdTaXplPik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmhhc01heGltaXplZFZpZXcoKSkge1xuXHRcdFx0dGhpcy5leGl0TWF4aW1pemVkVmlldygpO1xuXHRcdH1cblxuXHRcdGNvbnN0IFtyZXN0LCBpbmRleF0gPSB0YWlsKGxvY2F0aW9uKTtcblx0XHRjb25zdCBbcGF0aFRvUGFyZW50LCBwYXJlbnRdID0gdGhpcy5nZXROb2RlKHJlc3QpO1xuXG5cdFx0aWYgKCEocGFyZW50IGluc3RhbmNlb2YgQnJhbmNoTm9kZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBsb2NhdGlvbicpO1xuXHRcdH1cblxuXHRcdGlmICghc2l6ZS53aWR0aCAmJiAhc2l6ZS5oZWlnaHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBbcGFyZW50U2l6ZSwgZ3JhbmRQYXJlbnRTaXplXSA9IHBhcmVudC5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IFtzaXplLndpZHRoLCBzaXplLmhlaWdodF0gOiBbc2l6ZS5oZWlnaHQsIHNpemUud2lkdGhdO1xuXG5cdFx0aWYgKHR5cGVvZiBncmFuZFBhcmVudFNpemUgPT09ICdudW1iZXInICYmIHBhdGhUb1BhcmVudC5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBbLCBncmFuZFBhcmVudF0gPSB0YWlsKHBhdGhUb1BhcmVudCk7XG5cdFx0XHRjb25zdCBbLCBwYXJlbnRJbmRleF0gPSB0YWlsKHJlc3QpO1xuXG5cdFx0XHRncmFuZFBhcmVudC5yZXNpemVDaGlsZChwYXJlbnRJbmRleCwgZ3JhbmRQYXJlbnRTaXplKTtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIHBhcmVudFNpemUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRwYXJlbnQucmVzaXplQ2hpbGQoaW5kZXgsIHBhcmVudFNpemUpO1xuXHRcdH1cblxuXHRcdHRoaXMudHJ5U2V0MngyKCk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHRoZSBzaXplIG9mIGEge0BsaW5rIElWaWV3IHZpZXd9LlxuXHQgKlxuXHQgKiBAcGFyYW0gbG9jYXRpb24gVGhlIHtAbGluayBHcmlkTG9jYXRpb24gbG9jYXRpb259IG9mIHRoZSB2aWV3LiBQcm92aWRlIGB1bmRlZmluZWRgIHRvIGdldFxuXHQgKiB0aGUgc2l6ZSBvZiB0aGUgZ3JpZCBpdHNlbGYuXG5cdCAqL1xuXHRnZXRWaWV3U2l6ZShsb2NhdGlvbj86IEdyaWRMb2NhdGlvbik6IElWaWV3U2l6ZSB7XG5cdFx0aWYgKCFsb2NhdGlvbikge1xuXHRcdFx0cmV0dXJuIHsgd2lkdGg6IHRoaXMucm9vdC53aWR0aCwgaGVpZ2h0OiB0aGlzLnJvb3QuaGVpZ2h0IH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgWywgbm9kZV0gPSB0aGlzLmdldE5vZGUobG9jYXRpb24pO1xuXHRcdHJldHVybiB7IHdpZHRoOiBub2RlLndpZHRoLCBoZWlnaHQ6IG5vZGUuaGVpZ2h0IH07XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHRoZSBjYWNoZWQgdmlzaWJsZSBzaXplIG9mIGEge0BsaW5rIElWaWV3IHZpZXd9LiBUaGlzIHdhcyB0aGUgc2l6ZVxuXHQgKiBvZiB0aGUgdmlldyBhdCB0aGUgbW9tZW50IGl0IGxhc3QgYmVjYW1lIGhpZGRlbi5cblx0ICpcblx0ICogQHBhcmFtIGxvY2F0aW9uIFRoZSB7QGxpbmsgR3JpZExvY2F0aW9uIGxvY2F0aW9ufSBvZiB0aGUgdmlldy5cblx0ICovXG5cdGdldFZpZXdDYWNoZWRWaXNpYmxlU2l6ZShsb2NhdGlvbjogR3JpZExvY2F0aW9uKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBbcmVzdCwgaW5kZXhdID0gdGFpbChsb2NhdGlvbik7XG5cdFx0Y29uc3QgWywgcGFyZW50XSA9IHRoaXMuZ2V0Tm9kZShyZXN0KTtcblxuXHRcdGlmICghKHBhcmVudCBpbnN0YW5jZW9mIEJyYW5jaE5vZGUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgbG9jYXRpb24nKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcGFyZW50LmdldENoaWxkQ2FjaGVkVmlzaWJsZVNpemUoaW5kZXgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1heGltaXplIHRoZSBzaXplIG9mIGEge0BsaW5rIElWaWV3IHZpZXd9IGJ5IGNvbGxhcHNpbmcgYWxsIG90aGVyIHZpZXdzXG5cdCAqIHRvIHRoZWlyIG1pbmltdW0gc2l6ZXMuXG5cdCAqXG5cdCAqIEBwYXJhbSBsb2NhdGlvbiBUaGUge0BsaW5rIEdyaWRMb2NhdGlvbiBsb2NhdGlvbn0gb2YgdGhlIHZpZXcuXG5cdCAqL1xuXHRleHBhbmRWaWV3KGxvY2F0aW9uOiBHcmlkTG9jYXRpb24pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5oYXNNYXhpbWl6ZWRWaWV3KCkpIHtcblx0XHRcdHRoaXMuZXhpdE1heGltaXplZFZpZXcoKTtcblx0XHR9XG5cblx0XHRjb25zdCBbYW5jZXN0b3JzLCBub2RlXSA9IHRoaXMuZ2V0Tm9kZShsb2NhdGlvbik7XG5cblx0XHRpZiAoIShub2RlIGluc3RhbmNlb2YgTGVhZk5vZGUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgbG9jYXRpb24nKTtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGFuY2VzdG9ycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0YW5jZXN0b3JzW2ldLnJlc2l6ZUNoaWxkKGxvY2F0aW9uW2ldLCBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFkpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgYWxsIG90aGVyIHtAbGluayBJVmlldyB2aWV3c30gYXJlIGF0IHRoZWlyIG1pbmltdW0gc2l6ZS5cblx0ICpcblx0ICogQHBhcmFtIGxvY2F0aW9uIFRoZSB7QGxpbmsgR3JpZExvY2F0aW9uIGxvY2F0aW9ufSBvZiB0aGUgdmlldy5cblx0ICovXG5cdGlzVmlld0V4cGFuZGVkKGxvY2F0aW9uOiBHcmlkTG9jYXRpb24pOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5oYXNNYXhpbWl6ZWRWaWV3KCkpIHtcblx0XHRcdC8vIE5vIHZpZXcgY2FuIGJlIGV4cGFuZGVkIHdoZW4gYSB2aWV3IGlzIG1heGltaXplZFxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IFthbmNlc3RvcnMsIG5vZGVdID0gdGhpcy5nZXROb2RlKGxvY2F0aW9uKTtcblxuXHRcdGlmICghKG5vZGUgaW5zdGFuY2VvZiBMZWFmTm9kZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBsb2NhdGlvbicpO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgYW5jZXN0b3JzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAoIWFuY2VzdG9yc1tpXS5pc0NoaWxkRXhwYW5kZWQobG9jYXRpb25baV0pKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdG1heGltaXplVmlldyhsb2NhdGlvbjogR3JpZExvY2F0aW9uLCBleGNsdWRlVmlld3M6IHJlYWRvbmx5IElWaWV3W10gPSBbXSkge1xuXHRcdGNvbnN0IFssIG5vZGVUb01heGltaXplXSA9IHRoaXMuZ2V0Tm9kZShsb2NhdGlvbik7XG5cdFx0aWYgKCEobm9kZVRvTWF4aW1pemUgaW5zdGFuY2VvZiBMZWFmTm9kZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTG9jYXRpb24gaXMgbm90IGEgTGVhZk5vZGUnKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5tYXhpbWl6ZWROb2RlID09PSBub2RlVG9NYXhpbWl6ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmhhc01heGltaXplZFZpZXcoKSkge1xuXHRcdFx0dGhpcy5leGl0TWF4aW1pemVkVmlldygpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4Y2x1ZGVWaWV3U2V0ID0gbmV3IFNldChleGNsdWRlVmlld3MpO1xuXG5cdFx0ZnVuY3Rpb24gaGlkZUFsbFZpZXdzQnV0KHBhcmVudDogQnJhbmNoTm9kZSwgZXhjbHVkZTogTGVhZk5vZGUpOiB2b2lkIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcGFyZW50LmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGNoaWxkID0gcGFyZW50LmNoaWxkcmVuW2ldO1xuXHRcdFx0XHRpZiAoY2hpbGQgaW5zdGFuY2VvZiBMZWFmTm9kZSkge1xuXHRcdFx0XHRcdGlmIChjaGlsZCAhPT0gZXhjbHVkZSAmJiAhZXhjbHVkZVZpZXdTZXQuaGFzKGNoaWxkLnZpZXcpKSB7XG5cdFx0XHRcdFx0XHRwYXJlbnQuc2V0Q2hpbGRWaXNpYmxlKGksIGZhbHNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aGlkZUFsbFZpZXdzQnV0KGNoaWxkLCBleGNsdWRlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGhpZGVBbGxWaWV3c0J1dCh0aGlzLnJvb3QsIG5vZGVUb01heGltaXplKTtcblxuXHRcdHRoaXMubWF4aW1pemVkTm9kZSA9IG5vZGVUb01heGltaXplO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlld01heGltaXplZC5maXJlKHRydWUpO1xuXHR9XG5cblx0ZXhpdE1heGltaXplZFZpZXcoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm1heGltaXplZE5vZGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5tYXhpbWl6ZWROb2RlID0gdW5kZWZpbmVkO1xuXG5cdFx0Ly8gV2hlbiBoaWRpbmcgYSB2aWV3LCBpdCdzIHByZXZpb3VzIHNpemUgaXMgY2FjaGVkLlxuXHRcdC8vIFRvIHJlc3RvcmUgdGhlIHNpemVzIG9mIGFsbCB2aWV3cywgdGhleSBuZWVkIHRvIGJlIG1hZGUgdmlzaWJsZSBpbiByZXZlcnNlIG9yZGVyLlxuXHRcdGZ1bmN0aW9uIHNob3dWaWV3c0luUmV2ZXJzZU9yZGVyKHBhcmVudDogQnJhbmNoTm9kZSk6IHZvaWQge1xuXHRcdFx0Zm9yIChsZXQgaW5kZXggPSBwYXJlbnQuY2hpbGRyZW4ubGVuZ3RoIC0gMTsgaW5kZXggPj0gMDsgaW5kZXgtLSkge1xuXHRcdFx0XHRjb25zdCBjaGlsZCA9IHBhcmVudC5jaGlsZHJlbltpbmRleF07XG5cdFx0XHRcdGlmIChjaGlsZCBpbnN0YW5jZW9mIExlYWZOb2RlKSB7XG5cdFx0XHRcdFx0cGFyZW50LnNldENoaWxkVmlzaWJsZShpbmRleCwgdHJ1ZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c2hvd1ZpZXdzSW5SZXZlcnNlT3JkZXIoY2hpbGQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0c2hvd1ZpZXdzSW5SZXZlcnNlT3JkZXIodGhpcy5yb290KTtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlld01heGltaXplZC5maXJlKGZhbHNlKTtcblx0fVxuXG5cdGhhc01heGltaXplZFZpZXcoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubWF4aW1pemVkTm9kZSAhPT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgd2hldGhlciB0aGUge0BsaW5rIElWaWV3IHZpZXd9IGlzIG1heGltaXplZC5cblx0ICpcblx0ICogQHBhcmFtIGxvY2F0aW9uIFRoZSB7QGxpbmsgR3JpZExvY2F0aW9uIGxvY2F0aW9ufSBvZiB0aGUgdmlldy5cblx0ICovXG5cdGlzVmlld01heGltaXplZChsb2NhdGlvbjogR3JpZExvY2F0aW9uKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgWywgbm9kZV0gPSB0aGlzLmdldE5vZGUobG9jYXRpb24pO1xuXHRcdGlmICghKG5vZGUgaW5zdGFuY2VvZiBMZWFmTm9kZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTG9jYXRpb24gaXMgbm90IGEgTGVhZk5vZGUnKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5vZGUgPT09IHRoaXMubWF4aW1pemVkTm9kZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEaXN0cmlidXRlIHRoZSBzaXplIGFtb25nIGFsbCB7QGxpbmsgSVZpZXcgdmlld3N9IHdpdGhpbiB0aGUgZW50aXJlXG5cdCAqIGdyaWQgb3Igd2l0aGluIGEgc2luZ2xlIHtAbGluayBTcGxpdFZpZXd9LlxuXHQgKlxuXHQgKiBAcGFyYW0gbG9jYXRpb24gVGhlIHtAbGluayBHcmlkTG9jYXRpb24gbG9jYXRpb259IG9mIGEgdmlldyBjb250YWluaW5nXG5cdCAqIGNoaWxkcmVuIHZpZXdzLCB3aGljaCB3aWxsIGhhdmUgdGhlaXIgc2l6ZXMgZGlzdHJpYnV0ZWQgd2l0aGluIHRoZSBwYXJlbnRcblx0ICogdmlldydzIHNpemUuIFByb3ZpZGUgYHVuZGVmaW5lZGAgdG8gcmVjdXJzaXZlbHkgZGlzdHJpYnV0ZSBhbGwgdmlld3MnIHNpemVzXG5cdCAqIGluIHRoZSBlbnRpcmUgZ3JpZC5cblx0ICovXG5cdGRpc3RyaWJ1dGVWaWV3U2l6ZXMobG9jYXRpb24/OiBHcmlkTG9jYXRpb24pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5oYXNNYXhpbWl6ZWRWaWV3KCkpIHtcblx0XHRcdHRoaXMuZXhpdE1heGltaXplZFZpZXcoKTtcblx0XHR9XG5cblx0XHRpZiAoIWxvY2F0aW9uKSB7XG5cdFx0XHR0aGlzLnJvb3QuZGlzdHJpYnV0ZVZpZXdTaXplcyh0cnVlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBbLCBub2RlXSA9IHRoaXMuZ2V0Tm9kZShsb2NhdGlvbik7XG5cblx0XHRpZiAoIShub2RlIGluc3RhbmNlb2YgQnJhbmNoTm9kZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBsb2NhdGlvbicpO1xuXHRcdH1cblxuXHRcdG5vZGUuZGlzdHJpYnV0ZVZpZXdTaXplcygpO1xuXHRcdHRoaXMudHJ5U2V0MngyKCk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB3aGV0aGVyIGEge0BsaW5rIElWaWV3IHZpZXd9IGlzIHZpc2libGUuXG5cdCAqXG5cdCAqIEBwYXJhbSBsb2NhdGlvbiBUaGUge0BsaW5rIEdyaWRMb2NhdGlvbiBsb2NhdGlvbn0gb2YgdGhlIHZpZXcuXG5cdCAqL1xuXHRpc1ZpZXdWaXNpYmxlKGxvY2F0aW9uOiBHcmlkTG9jYXRpb24pOiBib29sZWFuIHtcblx0XHRjb25zdCBbcmVzdCwgaW5kZXhdID0gdGFpbChsb2NhdGlvbik7XG5cdFx0Y29uc3QgWywgcGFyZW50XSA9IHRoaXMuZ2V0Tm9kZShyZXN0KTtcblxuXHRcdGlmICghKHBhcmVudCBpbnN0YW5jZW9mIEJyYW5jaE5vZGUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgZnJvbSBsb2NhdGlvbicpO1xuXHRcdH1cblxuXHRcdHJldHVybiBwYXJlbnQuaXNDaGlsZFZpc2libGUoaW5kZXgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldCB0aGUgdmlzaWJpbGl0eSBzdGF0ZSBvZiBhIHtAbGluayBJVmlldyB2aWV3fS5cblx0ICpcblx0ICogQHBhcmFtIGxvY2F0aW9uIFRoZSB7QGxpbmsgR3JpZExvY2F0aW9uIGxvY2F0aW9ufSBvZiB0aGUgdmlldy5cblx0ICovXG5cdHNldFZpZXdWaXNpYmxlKGxvY2F0aW9uOiBHcmlkTG9jYXRpb24sIHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5oYXNNYXhpbWl6ZWRWaWV3KCkpIHtcblx0XHRcdHRoaXMuZXhpdE1heGltaXplZFZpZXcoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBbcmVzdCwgaW5kZXhdID0gdGFpbChsb2NhdGlvbik7XG5cdFx0Y29uc3QgWywgcGFyZW50XSA9IHRoaXMuZ2V0Tm9kZShyZXN0KTtcblxuXHRcdGlmICghKHBhcmVudCBpbnN0YW5jZW9mIEJyYW5jaE5vZGUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgZnJvbSBsb2NhdGlvbicpO1xuXHRcdH1cblxuXHRcdHBhcmVudC5zZXRDaGlsZFZpc2libGUoaW5kZXgsIHZpc2libGUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYSBkZXNjcmlwdG9yIGZvciB0aGUgZW50aXJlIGdyaWQuXG5cdCAqL1xuXHRnZXRWaWV3KCk6IEdyaWRCcmFuY2hOb2RlO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGEgZGVzY3JpcHRvciBmb3IgYSB7QGxpbmsgR3JpZExvY2F0aW9uIHN1YnRyZWV9IHdpdGhpbiB0aGVcblx0ICoge0BsaW5rIEdyaWRWaWV3fS5cblx0ICpcblx0ICogQHBhcmFtIGxvY2F0aW9uIFRoZSB7QGxpbmsgR3JpZExvY2F0aW9uIGxvY2F0aW9ufSBvZiB0aGUgcm9vdCBvZlxuXHQgKiB0aGUge0BsaW5rIEdyaWRMb2NhdGlvbiBzdWJ0cmVlfS5cblx0ICovXG5cdGdldFZpZXcobG9jYXRpb246IEdyaWRMb2NhdGlvbik6IEdyaWROb2RlO1xuXHRnZXRWaWV3KGxvY2F0aW9uPzogR3JpZExvY2F0aW9uKTogR3JpZE5vZGUge1xuXHRcdGNvbnN0IG5vZGUgPSBsb2NhdGlvbiA/IHRoaXMuZ2V0Tm9kZShsb2NhdGlvbilbMV0gOiB0aGlzLl9yb290O1xuXHRcdHJldHVybiB0aGlzLl9nZXRWaWV3cyhub2RlLCB0aGlzLm9yaWVudGF0aW9uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb25zdHJ1Y3QgYSBuZXcge0BsaW5rIEdyaWRWaWV3fSBmcm9tIGEgSlNPTiBvYmplY3QuXG5cdCAqXG5cdCAqIEBwYXJhbSBqc29uIFRoZSBKU09OIG9iamVjdC5cblx0ICogQHBhcmFtIGRlc2VyaWFsaXplciBBIGRlc2VyaWFsaXplciB3aGljaCBjYW4gcmV2aXZlIGVhY2ggdmlldy5cblx0ICogQHJldHVybnMgQSBuZXcge0BsaW5rIEdyaWRWaWV3fSBpbnN0YW5jZS5cblx0ICovXG5cdHN0YXRpYyBkZXNlcmlhbGl6ZTxUIGV4dGVuZHMgSVNlcmlhbGl6YWJsZVZpZXc+KGpzb246IElTZXJpYWxpemVkR3JpZFZpZXcsIGRlc2VyaWFsaXplcjogSVZpZXdEZXNlcmlhbGl6ZXI8VD4sIG9wdGlvbnM6IElHcmlkVmlld09wdGlvbnMgPSB7fSk6IEdyaWRWaWV3IHtcblx0XHRpZiAodHlwZW9mIGpzb24ub3JpZW50YXRpb24gIT09ICdudW1iZXInKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgSlNPTjogXFwnb3JpZW50YXRpb25cXCcgcHJvcGVydHkgbXVzdCBiZSBhIG51bWJlci4nKTtcblx0XHR9IGVsc2UgaWYgKHR5cGVvZiBqc29uLndpZHRoICE9PSAnbnVtYmVyJykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIEpTT046IFxcJ3dpZHRoXFwnIHByb3BlcnR5IG11c3QgYmUgYSBudW1iZXIuJyk7XG5cdFx0fSBlbHNlIGlmICh0eXBlb2YganNvbi5oZWlnaHQgIT09ICdudW1iZXInKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgSlNPTjogXFwnaGVpZ2h0XFwnIHByb3BlcnR5IG11c3QgYmUgYSBudW1iZXIuJyk7XG5cdFx0fSBlbHNlIGlmIChqc29uLnJvb3Q/LnR5cGUgIT09ICdicmFuY2gnKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgSlNPTjogXFwncm9vdFxcJyBwcm9wZXJ0eSBtdXN0IGhhdmUgXFwndHlwZVxcJyB2YWx1ZSBvZiBicmFuY2guJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3JpZW50YXRpb24gPSBqc29uLm9yaWVudGF0aW9uO1xuXHRcdGNvbnN0IGhlaWdodCA9IGpzb24uaGVpZ2h0O1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IEdyaWRWaWV3KG9wdGlvbnMpO1xuXHRcdHJlc3VsdC5fZGVzZXJpYWxpemUoanNvbi5yb290LCBvcmllbnRhdGlvbiwgZGVzZXJpYWxpemVyLCBoZWlnaHQpO1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX2Rlc2VyaWFsaXplKHJvb3Q6IElTZXJpYWxpemVkQnJhbmNoTm9kZSwgb3JpZW50YXRpb246IE9yaWVudGF0aW9uLCBkZXNlcmlhbGl6ZXI6IElWaWV3RGVzZXJpYWxpemVyPElTZXJpYWxpemFibGVWaWV3Piwgb3J0aG9nb25hbFNpemU6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMucm9vdCA9IHRoaXMuX2Rlc2VyaWFsaXplTm9kZShyb290LCBvcmllbnRhdGlvbiwgZGVzZXJpYWxpemVyLCBvcnRob2dvbmFsU2l6ZSkgYXMgQnJhbmNoTm9kZTtcblx0fVxuXG5cdHByaXZhdGUgX2Rlc2VyaWFsaXplTm9kZShub2RlOiBJU2VyaWFsaXplZE5vZGUsIG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbiwgZGVzZXJpYWxpemVyOiBJVmlld0Rlc2VyaWFsaXplcjxJU2VyaWFsaXphYmxlVmlldz4sIG9ydGhvZ29uYWxTaXplOiBudW1iZXIpOiBOb2RlIHtcblx0XHRsZXQgcmVzdWx0OiBOb2RlO1xuXHRcdGlmIChub2RlLnR5cGUgPT09ICdicmFuY2gnKSB7XG5cdFx0XHRjb25zdCBzZXJpYWxpemVkQ2hpbGRyZW4gPSBub2RlLmRhdGE7XG5cdFx0XHRjb25zdCBjaGlsZHJlbiA9IHNlcmlhbGl6ZWRDaGlsZHJlbi5tYXAoc2VyaWFsaXplZENoaWxkID0+IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRub2RlOiB0aGlzLl9kZXNlcmlhbGl6ZU5vZGUoc2VyaWFsaXplZENoaWxkLCBvcnRob2dvbmFsKG9yaWVudGF0aW9uKSwgZGVzZXJpYWxpemVyLCBub2RlLnNpemUpLFxuXHRcdFx0XHRcdHZpc2libGU6IChzZXJpYWxpemVkQ2hpbGQgYXMgeyB2aXNpYmxlPzogYm9vbGVhbiB9KS52aXNpYmxlXG5cdFx0XHRcdH0gc2F0aXNmaWVzIElOb2RlRGVzY3JpcHRvcjtcblx0XHRcdH0pO1xuXG5cdFx0XHRyZXN1bHQgPSBuZXcgQnJhbmNoTm9kZShvcmllbnRhdGlvbiwgdGhpcy5sYXlvdXRDb250cm9sbGVyLCB0aGlzLnN0eWxlcywgdGhpcy5wcm9wb3J0aW9uYWxMYXlvdXQsIG5vZGUuc2l6ZSwgb3J0aG9nb25hbFNpemUsIHVuZGVmaW5lZCwgY2hpbGRyZW4pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXN1bHQgPSBuZXcgTGVhZk5vZGUoZGVzZXJpYWxpemVyLmZyb21KU09OKG5vZGUuZGF0YSksIG9yaWVudGF0aW9uLCB0aGlzLmxheW91dENvbnRyb2xsZXIsIG9ydGhvZ29uYWxTaXplLCBub2RlLnNpemUpO1xuXHRcdFx0aWYgKG5vZGUubWF4aW1pemVkICYmICF0aGlzLm1heGltaXplZE5vZGUpIHtcblx0XHRcdFx0dGhpcy5tYXhpbWl6ZWROb2RlID0gcmVzdWx0O1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVZpZXdNYXhpbWl6ZWQuZmlyZSh0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Vmlld3Mobm9kZTogTm9kZSwgb3JpZW50YXRpb246IE9yaWVudGF0aW9uLCBjYWNoZWRWaXNpYmxlU2l6ZT86IG51bWJlcik6IEdyaWROb2RlIHtcblx0XHRjb25zdCBib3ggPSB7IHRvcDogbm9kZS50b3AsIGxlZnQ6IG5vZGUubGVmdCwgd2lkdGg6IG5vZGUud2lkdGgsIGhlaWdodDogbm9kZS5oZWlnaHQgfTtcblxuXHRcdGlmIChub2RlIGluc3RhbmNlb2YgTGVhZk5vZGUpIHtcblx0XHRcdHJldHVybiB7IHZpZXc6IG5vZGUudmlldywgYm94LCBjYWNoZWRWaXNpYmxlU2l6ZSwgbWF4aW1pemVkOiB0aGlzLm1heGltaXplZE5vZGUgPT09IG5vZGUgfTtcblx0XHR9XG5cblx0XHRjb25zdCBjaGlsZHJlbjogR3JpZE5vZGVbXSA9IFtdO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBub2RlLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBjaGlsZCA9IG5vZGUuY2hpbGRyZW5baV07XG5cdFx0XHRjb25zdCBjYWNoZWRWaXNpYmxlU2l6ZSA9IG5vZGUuZ2V0Q2hpbGRDYWNoZWRWaXNpYmxlU2l6ZShpKTtcblxuXHRcdFx0Y2hpbGRyZW4ucHVzaCh0aGlzLl9nZXRWaWV3cyhjaGlsZCwgb3J0aG9nb25hbChvcmllbnRhdGlvbiksIGNhY2hlZFZpc2libGVTaXplKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgY2hpbGRyZW4sIGJveCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXROb2RlKGxvY2F0aW9uOiBHcmlkTG9jYXRpb24sIG5vZGU6IE5vZGUgPSB0aGlzLnJvb3QsIHBhdGg6IEJyYW5jaE5vZGVbXSA9IFtdKTogW0JyYW5jaE5vZGVbXSwgTm9kZV0ge1xuXHRcdGlmIChsb2NhdGlvbi5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBbcGF0aCwgbm9kZV07XG5cdFx0fVxuXG5cdFx0aWYgKCEobm9kZSBpbnN0YW5jZW9mIEJyYW5jaE5vZGUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgbG9jYXRpb24nKTtcblx0XHR9XG5cblx0XHRjb25zdCBbaW5kZXgsIC4uLnJlc3RdID0gbG9jYXRpb247XG5cblx0XHRpZiAoaW5kZXggPCAwIHx8IGluZGV4ID49IG5vZGUuY2hpbGRyZW4ubGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgbG9jYXRpb24nKTtcblx0XHR9XG5cblx0XHRjb25zdCBjaGlsZCA9IG5vZGUuY2hpbGRyZW5baW5kZXhdO1xuXHRcdHBhdGgucHVzaChub2RlKTtcblxuXHRcdHJldHVybiB0aGlzLmdldE5vZGUocmVzdCwgY2hpbGQsIHBhdGgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEF0dGVtcHQgdG8gbG9jayB0aGUge0BsaW5rIFNhc2ggc2FzaGVzfSBpbiB0aGlzIHtAbGluayBHcmlkVmlld30gc29cblx0ICogdGhlIGdyaWQgYmVoYXZlcyBhcyBhIDJ4MiBtYXRyaXgsIHdpdGggYSBjb3JuZXIgc2FzaCBpbiB0aGUgbWlkZGxlLlxuXHQgKlxuXHQgKiBJbiBjYXNlIHRoZSBncmlkIGlzbid0IGEgMngyIGdyaWQgX2FuZF8gYWxsIHNhc2hlcyBhcmUgbm90IGFsaWduZWQsXG5cdCAqIHRoaXMgbWV0aG9kIGlzIGEgbm8tb3AuXG5cdCAqL1xuXHR0cnlTZXQyeDIoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlMngyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmRpc3Bvc2FibGUyeDIgPSBEaXNwb3NhYmxlLk5vbmU7XG5cblx0XHRpZiAodGhpcy5yb290LmNoaWxkcmVuLmxlbmd0aCAhPT0gMikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IFtmaXJzdCwgc2Vjb25kXSA9IHRoaXMucm9vdC5jaGlsZHJlbjtcblxuXHRcdGlmICghKGZpcnN0IGluc3RhbmNlb2YgQnJhbmNoTm9kZSkgfHwgIShzZWNvbmQgaW5zdGFuY2VvZiBCcmFuY2hOb2RlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZGlzcG9zYWJsZTJ4MiA9IGZpcnN0LnRyeVNldDJ4MihzZWNvbmQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFBvcHVsYXRlIGEgbWFwIHdpdGggdmlld3MgdG8gRE9NIG5vZGVzLlxuXHQgKiBAcmVtYXJrcyBUbyBiZSB1c2VkIGludGVybmFsbHkgb25seS5cblx0ICovXG5cdGdldFZpZXdNYXAobWFwOiBNYXA8SVZpZXcsIEhUTUxFbGVtZW50Piwgbm9kZT86IE5vZGUpOiB2b2lkIHtcblx0XHRpZiAoIW5vZGUpIHtcblx0XHRcdG5vZGUgPSB0aGlzLnJvb3Q7XG5cdFx0fVxuXG5cdFx0aWYgKG5vZGUgaW5zdGFuY2VvZiBCcmFuY2hOb2RlKSB7XG5cdFx0XHRub2RlLmNoaWxkcmVuLmZvckVhY2goY2hpbGQgPT4gdGhpcy5nZXRWaWV3TWFwKG1hcCwgY2hpbGQpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bWFwLnNldChub2RlLnZpZXcsIG5vZGUuZWxlbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVZpZXdNYXhpbWl6ZWQuZGlzcG9zZSgpO1xuXHRcdHRoaXMub25EaWRTYXNoUmVzZXRSZWxheS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5yb290LmRpc3Bvc2UoKTtcblx0XHR0aGlzLmVsZW1lbnQucmVtb3ZlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsU0FBUztBQUNsQixTQUEwQixtQkFBeUI7QUFDbkQsU0FBa0UsZ0JBQWdCLFFBQW9CLGlCQUFpQjtBQUN2SCxTQUFTLFVBQVUsYUFBYSxZQUFZO0FBQzVDLFNBQVMsYUFBYTtBQUN0QixTQUFTLFNBQVMsT0FBTyxhQUFhO0FBQ3RDLFNBQVMsWUFBWSxpQkFBOEIsb0JBQW9CO0FBQ3ZFLFNBQVMsV0FBVztBQUNwQixTQUFTLG1CQUFtQjtBQUM1QixPQUFPO0FBRVAsU0FBUyxlQUFBQSxvQkFBbUI7QUFDNUIsU0FBUyxrQkFBQUMsaUJBQWdCLFVBQUFDLGVBQWM7QUFJdkMsTUFBTSxnQkFBaUM7QUFBQSxFQUN0QyxpQkFBaUIsTUFBTTtBQUN4QjtBQWtKTyxTQUFTLFdBQVcsYUFBdUM7QUFDakUsU0FBTyxnQkFBZ0IsWUFBWSxXQUFXLFlBQVksYUFBYSxZQUFZO0FBQ3BGO0FBdUJPLFNBQVMsaUJBQWlCLE1BQXdDO0FBRXhFLFNBQU8sQ0FBQyxDQUFFLEtBQWE7QUFDeEI7QUFFQSxNQUFNLGlCQUFpQjtBQUFBLEVBQ3RCLFlBQW1CLGlCQUEwQjtBQUExQjtBQUFBLEVBQTRCO0FBQ2hEO0FBeUJBLFNBQVMseUJBQXlCLFFBQWlDLGFBQTJDO0FBQzdHLE1BQUksZ0JBQWdCLFlB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
