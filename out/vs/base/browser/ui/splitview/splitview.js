import { $, addDisposableListener, append, getWindow, scheduleAtNextAnimationFrame } from "../../dom.js";
import { DomEmitter } from "../../event.js";
import { Orientation, Sash, SashState } from "../sash/sash.js";
import { SmoothScrollableElement } from "../scrollbar/scrollableElement.js";
import { pushToEnd, pushToStart, range } from "../../../common/arrays.js";
import { Color } from "../../../common/color.js";
import { Emitter, Event } from "../../../common/event.js";
import { combinedDisposable, Disposable, dispose, toDisposable } from "../../../common/lifecycle.js";
import { clamp } from "../../../common/numbers.js";
import { Scrollable, ScrollbarVisibility } from "../../../common/scrollable.js";
import * as types from "../../../common/types.js";
import "./splitview.css";
import { Orientation as Orientation2 } from "../sash/sash.js";
const defaultStyles = {
  separatorBorder: Color.transparent
};
var LayoutPriority = /* @__PURE__ */ ((LayoutPriority2) => {
  LayoutPriority2[LayoutPriority2["Normal"] = 0] = "Normal";
  LayoutPriority2[LayoutPriority2["Low"] = 1] = "Low";
  LayoutPriority2[LayoutPriority2["High"] = 2] = "High";
  return LayoutPriority2;
})(LayoutPriority || {});
class ViewItem {
  constructor(container, view, size, disposable) {
    this.container = container;
    this.view = view;
    this.disposable = disposable;
    this._cachedVisibleSize = void 0;
    if (typeof size === "number") {
      this._size = size;
      this._cachedVisibleSize = void 0;
      container.classList.add("visible");
    } else {
      this._size = 0;
      this._cachedVisibleSize = size.cachedVisibleSize;
    }
  }
  set size(size) {
    this._size = size;
  }
  get size() {
    return this._size;
  }
  get cachedVisibleSize() {
    return this._cachedVisibleSize;
  }
  get visible() {
    return typeof this._cachedVisibleSize === "undefined";
  }
  setVisible(visible, size) {
    if (visible === this.visible) {
      return;
    }
    if (visible) {
      this.size = clamp(this._cachedVisibleSize, this.viewMinimumSize, this.viewMaximumSize);
      this._cachedVisibleSize = void 0;
    } else {
      this._cachedVisibleSize = typeof size === "number" ? size : this.size;
      this.size = 0;
    }
    this.container.classList.toggle("visible", visible);
    try {
      this.view.setVisible?.(visible);
    } catch (e) {
      console.error("Splitview: Failed to set visible view");
      console.error(e);
    }
  }
  get minimumSize() {
    return this.visible ? this.view.minimumSize : 0;
  }
  get viewMinimumSize() {
    return this.view.minimumSize;
  }
  get maximumSize() {
    return this.visible ? this.view.maximumSize : 0;
  }
  get viewMaximumSize() {
    return this.view.maximumSize;
  }
  get priority() {
    return this.view.priority;
  }
  get proportionalLayout() {
    return this.view.proportionalLayout ?? true;
  }
  get snap() {
    return !!this.view.snap;
  }
  set enabled(enabled) {
    this.container.style.pointerEvents = enabled ? "" : "none";
  }
  layout(offset, layoutContext) {
    this.layoutContainer(offset);
    try {
      this.view.layout(this.size, offset, layoutContext);
    } catch (e) {
      console.error("Splitview: Failed to layout view");
      console.error(e);
    }
  }
  dispose() {
    this.disposable.dispose();
  }
}
class VerticalViewItem extends ViewItem {
  layoutContainer(offset) {
    this.container.style.top = `${offset}px`;
    this.container.style.height = `${this.size}px`;
  }
}
class HorizontalViewItem extends ViewItem {
  layoutContainer(offset) {
    this.container.style.left = `${offset}px`;
    this.container.style.width = `${this.size}px`;
  }
}
var State = /* @__PURE__ */ ((State2) => {
  State2[State2["Idle"] = 0] = "Idle";
  State2[State2["Busy"] = 1] = "Busy";
  return State2;
})(State || {});
var Sizing;
((Sizing2) => {
  Sizing2.Distribute = { type: "distribute" };
  function Split(index) {
    return { type: "split", index };
  }
  Sizing2.Split = Split;
  function Auto(index) {
    return { type: "auto", index };
  }
  Sizing2.Auto = Auto;
  function Invisible(cachedVisibleSize) {
    return { type: "invisible", cachedVisibleSize };
  }
  Sizing2.Invisible = Invisible;
})(Sizing || (Sizing = {}));
class SplitView extends Disposable {
  /**
   * Create a new {@link SplitView} instance.
   */
  constructor(container, options = {}) {
    super();
    this.size = 0;
    this._contentSize = 0;
    this.proportions = void 0;
    this.viewItems = [];
    this.sashItems = [];
    this.state = 0 /* Idle */;
    this._onDidSashChange = this._register(new Emitter());
    this._onDidSashReset = this._register(new Emitter());
    this._startSnappingEnabled = true;
    this._endSnappingEnabled = true;
    /**
     * Fires whenever the user resizes a {@link Sash sash}.
     */
    this.onDidSashChange = this._onDidSashChange.event;
    /**
     * Fires whenever the user double clicks a {@link Sash sash}.
     */
    this.onDidSashReset = this._onDidSashReset.event;
    this.orientation = options.orientation ?? Orientation.VERTICAL;
    this.inverseAltBehavior = options.inverseAltBehavior ?? false;
    this.proportionalLayout = options.proportionalLayout ?? true;
    this.getSashOrthogonalSize = options.getSashOrthogonalSize;
    this.el = document.createElement("div");
    this.el.classList.add("monaco-split-view2");
    this.el.classList.add(this.orientation === Orientation.VERTICAL ? "vertical" : "horizontal");
    container.appendChild(this.el);
    this.sashContainer = append(this.el, $(".sash-container"));
    this.viewContainer = $(".split-view-container");
    this.scrollable = this._register(new Scrollable({
      forceIntegerValues: true,
      smoothScrollDuration: 125,
      scheduleAtNextAnimationFrame: (callback) => scheduleAtNextAnimationFrame(getWindow(this.el), callback)
    }));
    this.scrollableElement = this._register(new SmoothScrollableElement(this.viewContainer, {
      vertical: this.orientation === Orientation.VERTICAL ? options.scrollbarVisibility ?? ScrollbarVisibility.Auto : ScrollbarVisibility.Hidden,
      horizontal: this.orientation === Orientation.HORIZONTAL ? options.scrollbarVisibility ?? ScrollbarVisibility.Auto : ScrollbarVisibility.Hidden
    }, this.scrollable));
    const onDidScrollViewContainer = this._register(new DomEmitter(this.viewContainer, "scroll")).event;
    this._register(onDidScrollViewContainer((_) => {
      const position = this.scrollableElement.getScrollPosition();
      const scrollLeft = Math.abs(this.viewContainer.scrollLeft - position.scrollLeft) <= 1 ? void 0 : this.viewContainer.scrollLeft;
      const scrollTop = Math.abs(this.viewContainer.scrollTop - position.scrollTop) <= 1 ? void 0 : this.viewContainer.scrollTop;
      if (scrollLeft !== void 0 || scrollTop !== void 0) {
        this.scrollableElement.setScrollPosition({ scrollLeft, scrollTop });
      }
    }));
    this.onDidScroll = this.scrollableElement.onScroll;
    this._register(this.onDidScroll((e) => {
      if (e.scrollTopChanged) {
        this.viewContainer.scrollTop = e.scrollTop;
      }
      if (e.scrollLeftChanged) {
        this.viewContainer.scrollLeft = e.scrollLeft;
      }
    }));
    append(this.el, this.scrollableElement.getDomNode());
    this.style(options.styles || defaultStyles);
    if (options.descriptor) {
      this.size = options.descriptor.size;
      options.descriptor.views.forEach((viewDescriptor, index) => {
        const sizing = types.isUndefined(viewDescriptor.visible) || viewDescriptor.visible ? viewDescriptor.size : { type: "invisible", cachedVisibleSize: viewDescriptor.size };
        const view = viewDescriptor.view;
        this.doAddView(view, sizing, index, true);
      });
      this._contentSize = this.viewItems.reduce((r, i) => r + i.size, 0);
      this.saveProportions();
    }
  }
  /**
   * The sum of all views' sizes.
   */
  get contentSize() {
    return this._contentSize;
  }
  /**
   * The amount of views in this {@link SplitView}.
   */
  get length() {
    return this.viewItems.length;
  }
  /**
   * The minimum size of this {@link SplitView}.
   */
  get minimumSize() {
    return this.viewItems.reduce((r, item) => r + item.minimumSize, 0);
  }
  /**
   * The maximum size of this {@link SplitView}.
   */
  get maximumSize() {
    return this.length === 0 ? Number.POSITIVE_INFINITY : this.viewItems.reduce((r, item) => r + item.maximumSize, 0);
  }
  get orthogonalStartSash() {
    return this._orthogonalStartSash;
  }
  get orthogonalEndSash() {
    return this._orthogonalEndSash;
  }
  get startSnappingEnabled() {
    return this._startSnappingEnabled;
  }
  get endSnappingEnabled() {
    return this._endSnappingEnabled;
  }
  /**
   * A reference to a sash, perpendicular to all sashes in this {@link SplitView},
   * located at the left- or top-most side of the SplitView.
   * Corner sashes will be created automatically at the intersections.
   */
  set orthogonalStartSash(sash) {
    for (const sashItem of this.sashItems) {
      sashItem.sash.orthogonalStartSash = sash;
    }
    this._orthogonalStartSash = sash;
  }
  /**
   * A reference to a sash, perpendicular to all sashes in this {@link SplitView},
   * located at the right- or bottom-most side of the SplitView.
   * Corner sashes will be created automatically at the intersections.
   */
  set orthogonalEndSash(sash) {
    for (const sashItem of this.sashItems) {
      sashItem.sash.orthogonalEndSash = sash;
    }
    this._orthogonalEndSash = sash;
  }
  /**
   * The internal sashes within this {@link SplitView}.
   */
  get sashes() {
    return this.sashItems.map((s) => s.sash);
  }
  /**
   * Enable/disable snapping at the beginning of this {@link SplitView}.
   */
  set startSnappingEnabled(startSnappingEnabled) {
    if (this._startSnappingEnabled === startSnappingEnabled) {
      return;
    }
    this._startSnappingEnabled = startSnappingEnabled;
    this.updateSashEnablement();
  }
  /**
   * Enable/disable snapping at the end of this {@link SplitView}.
   */
  set endSnappingEnabled(endSnappingEnabled) {
    if (this._endSnappingEnabled === endSnappingEnabled) {
      return;
    }
    this._endSnappingEnabled = endSnappingEnabled;
    this.updateSashEnablement();
  }
  style(styles) {
    if (styles.separatorBorder.isTransparent()) {
      this.el.classList.remove("separator-border");
      this.el.style.removeProperty("--separator-border");
    } else {
      this.el.classList.add("separator-border");
      this.el.style.setProperty("--separator-border", styles.separatorBorder.toString());
    }
  }
  /**
   * Add a {@link IView view} to this {@link SplitView}.
   *
   * @param view The view to add.
   * @param size Either a fixed size, or a dynamic {@link Sizing} strategy.
   * @param index The index to insert the view on.
   * @param skipLayout Whether layout should be skipped.
   */
  addView(view, size, index = this.viewItems.length, skipLayout) {
    this.doAddView(view, size, index, skipLayout);
  }
  /**
   * Remove a {@link IView view} from this {@link SplitView}.
   *
   * @param index The index where the {@link IView view} is located.
   * @param sizing Whether to distribute other {@link IView view}'s sizes.
   */
  removeView(index, sizing) {
    if (index < 0 || index >= this.viewItems.length) {
      throw new Error("Index out of bounds");
    }
    if (this.state !== 0 /* Idle */) {
      throw new Error("Cant modify splitview");
    }
    this.state = 1 /* Busy */;
    try {
      if (sizing?.type === "auto") {
        if (this.areViewsDistributed()) {
          sizing = { type: "distribute" };
        } else {
          sizing = { type: "split", index: sizing.index };
        }
      }
      const referenceViewItem = sizing?.type === "split" ? this.viewItems[sizing.index] : void 0;
      const viewItemToRemove = this.viewItems.splice(index, 1)[0];
      if (referenceViewItem) {
        referenceViewItem.size += viewItemToRemove.size;
      }
      if (this.viewItems.length >= 1) {
        const sashIndex = Math.max(index - 1, 0);
        const sashItem = this.sashItems.splice(sashIndex, 1)[0];
        sashItem.disposable.dispose();
      }
      this.relayout();
      if (sizing?.type === "distribute") {
        this.distributeViewSizes();
      }
      const result = viewItemToRemove.view;
      viewItemToRemove.dispose();
      return result;
    } finally {
      this.state = 0 /* Idle */;
    }
  }
  removeAllViews() {
    if (this.state !== 0 /* Idle */) {
      throw new Error("Cant modify splitview");
    }
    this.state = 1 /* Busy */;
    try {
      const viewItems = this.viewItems.splice(0, this.viewItems.length);
      for (const viewItem of viewItems) {
        viewItem.dispose();
      }
      const sashItems = this.sashItems.splice(0, this.sashItems.length);
      for (const sashItem of sashItems) {
        sashItem.disposable.dispose();
      }
      this.relayout();
      return viewItems.map((i) => i.view);
    } finally {
      this.state = 0 /* Idle */;
    }
  }
  /**
   * Move a {@link IView view} to a different index.
   *
   * @param from The source index.
   * @param to The target index.
   */
  moveView(from, to) {
    if (this.state !== 0 /* Idle */) {
      throw new Error("Cant modify splitview");
    }
    const cachedVisibleSize = this.getViewCachedVisibleSize(from);
    const sizing = typeof cachedVisibleSize === "undefined" ? this.getViewSize(from) : Sizing.Invisible(cachedVisibleSize);
    const view = this.removeView(from);
    this.addView(view, sizing, to);
  }
  /**
   * Swap two {@link IView views}.
   *
   * @param from The source index.
   * @param to The target index.
   */
  swapViews(from, to) {
    if (this.state !== 0 /* Idle */) {
      throw new Error("Cant modify splitview");
    }
    if (from > to) {
      return this.swapViews(to, from);
    }
    const fromSize = this.getViewSize(from);
    const toSize = this.getViewSize(to);
    const toView = this.removeView(to);
    const fromView = this.removeView(from);
    this.addView(toView, fromSize, from);
    this.addView(fromView, toSize, to);
  }
  /**
   * Returns whether the {@link IView view} is visible.
   *
   * @param index The {@link IView view} index.
   */
  isViewVisible(index) {
    if (index < 0 || index >= this.viewItems.length) {
      throw new Error("Index out of bounds");
    }
    const viewItem = this.viewItems[index];
    return viewItem.visible;
  }
  /**
   * Set a {@link IView view}'s visibility.
   *
   * @param index The {@link IView view} index.
   * @param visible Whether the {@link IView view} should be visible.
   */
  setViewVisible(index, visible) {
    if (index < 0 || index >= this.viewItems.length) {
      throw new Error("Index out of bounds");
    }
    const viewItem = this.viewItems[index];
    viewItem.setVisible(visible);
    this.distributeEmptySpace(index);
    this.layoutViews();
    this.saveProportions();
  }
  /**
   * Returns the {@link IView view}'s size previously to being hidden.
   *
   * @param index The {@link IView view} index.
   */
  getViewCachedVisibleSize(index) {
    if (index < 0 || index >= this.viewItems.length) {
      throw new Error("Index out of bounds");
    }
    const viewItem = this.viewItems[index];
    return viewItem.cachedVisibleSize;
  }
  /**
   * Layout the {@link SplitView}.
   *
   * @param size The entire size of the {@link SplitView}.
   * @param layoutContext An optional layout context to pass along to {@link IView views}.
   */
  layout(size, layoutContext) {
    const previousSize = Math.max(this.size, this._contentSize);
    this.size = size;
    this.layoutContext = layoutContext;
    if (!this.proportions) {
      const indexes = range(this.viewItems.length);
      const lowPriorityIndexes = indexes.filter((i) => this.viewItems[i].priority === 1 /* Low */);
      const highPriorityIndexes = indexes.filter((i) => this.viewItems[i].priority === 2 /* High */);
      this.resize(this.viewItems.length - 1, size - previousSize, void 0, lowPriorityIndexes, highPriorityIndexes);
    } else {
      let total = 0;
      for (let i = 0; i < this.viewItems.length; i++) {
        const item = this.viewItems[i];
        const proportion = this.proportions[i];
        if (typeof proportion === "number") {
          total += proportion;
        } else {
          size -= item.size;
        }
      }
      for (let i = 0; i < this.viewItems.length; i++) {
        const item = this.viewItems[i];
        const proportion = this.proportions[i];
        if (typeof proportion === "number" && total > 0) {
          item.size = clamp(Math.round(proportion * size / total), item.minimumSize, item.maximumSize);
        }
      }
    }
    this.distributeEmptySpace();
    this.layoutViews();
  }
  saveProportions() {
    if (this.proportionalLayout && this._contentSize > 0) {
      this.proportions = this.viewItems.map((v) => v.proportionalLayout && v.visible ? v.size / this._contentSize : void 0);
    }
  }
  onSashStart({ sash, start, alt }) {
    for (const item of this.viewItems) {
      item.enabled = false;
    }
    const index = this.sashItems.findIndex((item) => item.sash === sash);
    const disposable = combinedDisposable(
      addDisposableListener(this.el.ownerDocument.body, "keydown", (e) => resetSashDragState(this.sashDragState.current, e.altKey)),
      addDisposableListener(this.el.ownerDocument.body, "keyup", () => resetSashDragState(this.sashDragState.current, false))
    );
    const resetSashDragState = (start2, alt2) => {
      const sizes = this.viewItems.map((i) => i.size);
      let minDelta = Number.NEGATIVE_INFINITY;
      let maxDelta = Number.POSITIVE_INFINITY;
      if (this.inverseAltBehavior) {
        alt2 = !alt2;
      }
      if (alt2) {
        const isLastSash = index === this.sashItems.length - 1;
        if (isLastSash) {
          const viewItem = this.viewItems[index];
          minDelta = (viewItem.minimumSize - viewItem.size) / 2;
          maxDelta = (viewItem.maximumSize - viewItem.size) / 2;
        } else {
          const viewItem = this.viewItems[index + 1];
          minDelta = (viewItem.size - viewItem.maximumSize) / 2;
          maxDelta = (viewItem.size - viewItem.minimumSize) / 2;
        }
      }
      let snapBefore;
      let snapAfter;
      if (!alt2) {
        const upIndexes = range(index, -1);
        const downIndexes = range(index + 1, this.viewItems.length);
        const minDeltaUp = upIndexes.reduce((r, i) => r + (this.viewItems[i].minimumSize - sizes[i]), 0);
        const maxDeltaUp = upIndexes.reduce((r, i) => r + (this.viewItems[i].viewMaximumSize - sizes[i]), 0);
        const maxDeltaDown = downIndexes.length === 0 ? Number.POSITIVE_INFINITY : downIndexes.reduce((r, i) => r + (sizes[i] - this.viewItems[i].minimumSize), 0);
        const minDeltaDown = downIndexes.length === 0 ? Number.NEGATIVE_INFINITY : downIndexes.reduce((r, i) => r + (sizes[i] - this.viewItems[i].viewMaximumSize), 0);
        const minDelta2 = Math.max(minDeltaUp, minDeltaDown);
        const maxDelta2 = Math.min(maxDeltaDown, maxDeltaUp);
        const snapBeforeIndex = this.findFirstSnapIndex(upIndexes);
        const snapAfterIndex = this.findFirstSnapIndex(downIndexes);
        if (typeof snapBeforeIndex === "number") {
          const viewItem = this.viewItems[snapBeforeIndex];
          const halfSize = Math.floor(viewItem.viewMinimumSize / 2);
          snapBefore = {
            index: snapBeforeIndex,
            limitDelta: viewItem.visible ? minDelta2 - halfSize : minDelta2 + halfSize,
            size: viewItem.size
          };
        }
        if (typeof snapAfterIndex === "number") {
          const viewItem = this.viewItems[snapAfterIndex];
          const halfSize = Math.floor(viewItem.viewMinimumSize / 2);
          snapAfter = {
            index: snapAfterIndex,
            limitDelta: viewItem.visible ? maxDelta2 + halfSize : maxDelta2 - halfSize,
            size: viewItem.size
          };
        }
      }
      this.sashDragState = { start: start2, current: start2, index, sizes, minDelta, maxDelta, alt: alt2, snapBefore, snapAfter, disposable };
    };
    resetSashDragState(start, alt);
  }
  onSashChange({ current }) {
    const { index, start, sizes, alt, minDelta, maxDelta, snapBefore, snapAfter } = this.sashDragState;
    this.sashDragState.current = current;
    const delta = current - start;
    const newDelta = this.resize(index, delta, sizes, void 0, void 0, minDelta, maxDelta, snapBefore, snapAfter);
    if (alt) {
      const isLastSash = index === this.sashItems.length - 1;
      const newSizes = this.viewItems.map((i) => i.size);
      const viewItemIndex = isLastSash ? index : index + 1;
      const viewItem = this.viewItems[viewItemIndex];
      const newMinDelta = viewItem.size - viewItem.maximumSize;
      const newMaxDelta = viewItem.size - viewItem.minimumSize;
      const resizeIndex = isLastSash ? index - 1 : index + 1;
      this.resize(resizeIndex, -newDelta, newSizes, void 0, void 0, newMinDelta, newMaxDelta);
    }
    this.distributeEmptySpace();
    this.layoutViews();
  }
  onSashEnd(index) {
    this._onDidSashChange.fire(index);
    this.sashDragState.disposable.dispose();
    this.saveProportions();
    for (const item of this.viewItems) {
      item.enabled = true;
    }
  }
  onViewChange(item, size) {
    const index = this.viewItems.indexOf(item);
    if (index < 0 || index >= this.viewItems.length) {
      return;
    }
    size = typeof size === "number" ? size : item.size;
    size = clamp(size, item.minimumSize, item.maximumSize);
    if (this.inverseAltBehavior && index > 0) {
      this.resize(index - 1, Math.floor((item.size - size) / 2));
      this.distributeEmptySpace();
      this.layoutViews();
    } else {
      item.size = size;
      this.relayout([index], void 0);
    }
  }
  /**
   * Resize a {@link IView view} within the {@link SplitView}.
   *
   * @param index The {@link IView view} index.
   * @param size The {@link IView view} size.
   */
  resizeView(index, size) {
    if (index < 0 || index >= this.viewItems.length) {
      return;
    }
    if (this.state !== 0 /* Idle */) {
      throw new Error("Cant modify splitview");
    }
    this.state = 1 /* Busy */;
    try {
      const indexes = range(this.viewItems.length).filter((i) => i !== index);
      const lowPriorityIndexes = [...indexes.filter((i) => this.viewItems[i].priority === 1 /* Low */), index];
      const highPriorityIndexes = indexes.filter((i) => this.viewItems[i].priority === 2 /* High */);
      const item = this.viewItems[index];
      size = Math.round(size);
      size = clamp(size, item.minimumSize, Math.min(item.maximumSize, this.size));
      item.size = size;
      this.relayout(lowPriorityIndexes, highPriorityIndexes);
    } finally {
      this.state = 0 /* Idle */;
    }
  }
  /**
   * Returns whether all other {@link IView views} are at their minimum size.
   */
  isViewExpanded(index) {
    if (index < 0 || index >= this.viewItems.length) {
      return false;
    }
    for (const item of this.viewItems) {
      if (item !== this.viewItems[index] && item.size > item.minimumSize) {
        return false;
      }
    }
    return true;
  }
  /**
   * Distribute the entire {@link SplitView} size among all {@link IView views}.
   */
  distributeViewSizes() {
    const flexibleViewItems = [];
    let flexibleSize = 0;
    for (const item of this.viewItems) {
      if (item.maximumSize - item.minimumSize > 0) {
        flexibleViewItems.push(item);
        flexibleSize += item.size;
      }
    }
    const size = Math.floor(flexibleSize / flexibleViewItems.length);
    for (const item of flexibleViewItems) {
      item.size = clamp(size, item.minimumSize, item.maximumSize);
    }
    const indexes = range(this.viewItems.length);
    const lowPriorityIndexes = indexes.filter((i) => this.viewItems[i].priority === 1 /* Low */);
    const highPriorityIndexes = indexes.filter((i) => this.viewItems[i].priority === 2 /* High */);
    this.relayout(lowPriorityIndexes, highPriorityIndexes);
  }
  /**
   * Returns the size of a {@link IView view}.
   */
  getViewSize(index) {
    if (index < 0 || index >= this.viewItems.length) {
      return -1;
    }
    return this.viewItems[index].size;
  }
  doAddView(view, size, index = this.viewItems.length, skipLayout) {
    if (this.state !== 0 /* Idle */) {
      throw new Error("Cant modify splitview");
    }
    this.state = 1 /* Busy */;
    try {
      const container = $(".split-view-view");
      if (index === this.viewItems.length) {
        this.viewContainer.appendChild(container);
      } else {
        this.viewContainer.insertBefore(container, this.viewContainer.children.item(index));
      }
      const onChangeDisposable = view.onDidChange((size2) => this.onViewChange(item, size2));
      const containerDisposable = toDisposable(() => container.remove());
      const disposable = combinedDisposable(onChangeDisposable, containerDisposable);
      let viewSize;
      if (typeof size === "number") {
        viewSize = size;
      } else {
        if (size.type === "auto") {
          if (this.areViewsDistributed()) {
            size = { type: "distribute" };
          } else {
            size = { type: "split", index: size.index };
          }
        }
        if (size.type === "split") {
          viewSize = this.getViewSize(size.index) / 2;
        } else if (size.type === "invisible") {
          viewSize = { cachedVisibleSize: size.cachedVisibleSize };
        } else {
          viewSize = view.minimumSize;
        }
      }
      const item = this.orientation === Orientation.VERTICAL ? new VerticalViewItem(container, view, viewSize, disposable) : new HorizontalViewItem(container, view, viewSize, disposable);
      this.viewItems.splice(index, 0, item);
      if (this.viewItems.length > 1) {
        const opts = { orthogonalStartSash: this.orthogonalStartSash, orthogonalEndSash: this.orthogonalEndSash };
        const sash = this.orientation === Orientation.VERTICAL ? new Sash(this.sashContainer, { getHorizontalSashTop: (s) => this.getSashPosition(s), getHorizontalSashWidth: this.getSashOrthogonalSize }, { ...opts, orientation: Orientation.HORIZONTAL }) : new Sash(this.sashContainer, { getVerticalSashLeft: (s) => this.getSashPosition(s), getVerticalSashHeight: this.getSashOrthogonalSize }, { ...opts, orientation: Orientation.VERTICAL });
        const sashEventMapper = this.orientation === Orientation.VERTICAL ? (e) => ({ sash, start: e.startY, current: e.currentY, alt: e.altKey }) : (e) => ({ sash, start: e.startX, current: e.currentX, alt: e.altKey });
        const onStart = Event.map(sash.onDidStart, sashEventMapper);
        const onStartDisposable = onStart(this.onSashStart, this);
        const onChange = Event.map(sash.onDidChange, sashEventMapper);
        const onChangeDisposable2 = onChange(this.onSashChange, this);
        const onEnd = Event.map(sash.onDidEnd, () => this.sashItems.findIndex((item2) => item2.sash === sash));
        const onEndDisposable = onEnd(this.onSashEnd, this);
        const onDidResetDisposable = sash.onDidReset(() => {
          const index2 = this.sashItems.findIndex((item2) => item2.sash === sash);
          const upIndexes = range(index2, -1);
          const downIndexes = range(index2 + 1, this.viewItems.length);
          const snapBeforeIndex = this.findFirstSnapIndex(upIndexes);
          const snapAfterIndex = this.findFirstSnapIndex(downIndexes);
          if (typeof snapBeforeIndex === "number" && !this.viewItems[snapBeforeIndex].visible) {
            return;
          }
          if (typeof snapAfterIndex === "number" && !this.viewItems[snapAfterIndex].visible) {
            return;
          }
          this._onDidSashReset.fire(index2);
        });
        const disposable2 = combinedDisposable(onStartDisposable, onChangeDisposable2, onEndDisposable, onDidResetDisposable, sash);
        const sashItem = { sash, disposable: disposable2 };
        this.sashItems.splice(index - 1, 0, sashItem);
      }
      container.appendChild(view.element);
      let highPriorityIndexes;
      if (typeof size !== "number" && size.type === "split") {
        highPriorityIndexes = [size.index];
      }
      if (!skipLayout) {
        this.relayout([index], highPriorityIndexes);
      }
      if (!skipLayout && typeof size !== "number" && size.type === "distribute") {
        this.distributeViewSizes();
      }
    } finally {
      this.state = 0 /* Idle */;
    }
  }
  relayout(lowPriorityIndexes, highPriorityIndexes) {
    const contentSize = this.viewItems.reduce((r, i) => r + i.size, 0);
    this.resize(this.viewItems.length - 1, this.size - contentSize, void 0, lowPriorityIndexes, highPriorityIndexes);
    this.distributeEmptySpace();
    this.layoutViews();
    this.saveProportions();
  }
  resize(index, delta, sizes = this.viewItems.map((i) => i.size), lowPriorityIndexes, highPriorityIndexes, overloadMinDelta = Number.NEGATIVE_INFINITY, overloadMaxDelta = Number.POSITIVE_INFINITY, snapBefore, snapAfter) {
    if (index < 0 || index >= this.viewItems.length) {
      return 0;
    }
    const upIndexes = range(index, -1);
    const downIndexes = range(index + 1, this.viewItems.length);
    if (highPriorityIndexes) {
      for (const index2 of highPriorityIndexes) {
        pushToStart(upIndexes, index2);
        pushToStart(downIndexes, index2);
      }
    }
    if (lowPriorityIndexes) {
      for (const index2 of lowPriorityIndexes) {
        pushToEnd(upIndexes, index2);
        pushToEnd(downIndexes, index2);
      }
    }
    const upItems = upIndexes.map((i) => this.viewItems[i]);
    const upSizes = upIndexes.map((i) => sizes[i]);
    const downItems = downIndexes.map((i) => this.viewItems[i]);
    const downSizes = downIndexes.map((i) => sizes[i]);
    const minDeltaUp = upIndexes.reduce((r, i) => r + (this.viewItems[i].minimumSize - sizes[i]), 0);
    const maxDeltaUp = upIndexes.reduce((r, i) => r + (this.viewItems[i].maximumSize - sizes[i]), 0);
    const maxDeltaDown = downIndexes.length === 0 ? Number.POSITIVE_INFINITY : downIndexes.reduce((r, i) => r + (sizes[i] - this.viewItems[i].minimumSize), 0);
    const minDeltaDown = downIndexes.length === 0 ? Number.NEGATIVE_INFINITY : downIndexes.reduce((r, i) => r + (sizes[i] - this.viewItems[i].maximumSize), 0);
    const minDelta = Math.max(minDeltaUp, minDeltaDown, overloadMinDelta);
    const maxDelta = Math.min(maxDeltaDown, maxDeltaUp, overloadMaxDelta);
    let snapped = false;
    if (snapBefore) {
      const snapView = this.viewItems[snapBefore.index];
      const visible = delta >= snapBefore.limitDelta;
      snapped = visible !== snapView.visible;
      snapView.setVisible(visible, snapBefore.size);
    }
    if (!snapped && snapAfter) {
      const snapView = this.viewItems[snapAfter.index];
      const visible = delta < snapAfter.limitDelta;
      snapped = visible !== snapView.visible;
      snapView.setVisible(visible, snapAfter.size);
    }
    if (snapped) {
      return this.resize(index, delta, sizes, lowPriorityIndexes, highPriorityIndexes, overloadMinDelta, overloadMaxDelta);
    }
    delta = clamp(delta, minDelta, maxDelta);
    for (let i = 0, deltaUp = delta; i < upItems.length; i++) {
      const item = upItems[i];
      const size = clamp(upSizes[i] + deltaUp, item.minimumSize, item.maximumSize);
      const viewDelta = size - upSizes[i];
      deltaUp -= viewDelta;
      item.size = size;
    }
    for (let i = 0, deltaDown = delta; i < downItems.length; i++) {
      const item = downItems[i];
      const size = clamp(downSizes[i] - deltaDown, item.minimumSize, item.maximumSize);
      const viewDelta = size - downSizes[i];
      deltaDown += viewDelta;
      item.size = size;
    }
    return delta;
  }
  distributeEmptySpace(lowPriorityIndex) {
    const contentSize = this.viewItems.reduce((r, i) => r + i.size, 0);
    let emptyDelta = this.size - contentSize;
    const indexes = range(this.viewItems.length - 1, -1);
    const lowPriorityIndexes = indexes.filter((i) => this.viewItems[i].priority === 1 /* Low */);
    const highPriorityIndexes = indexes.filter((i) => this.viewItems[i].priority === 2 /* High */);
    for (const index of highPriorityIndexes) {
      pushToStart(indexes, index);
    }
    for (const index of lowPriorityIndexes) {
      pushToEnd(indexes, index);
    }
    if (typeof lowPriorityIndex === "number") {
      pushToEnd(indexes, lowPriorityIndex);
    }
    for (let i = 0; emptyDelta !== 0 && i < indexes.length; i++) {
      const item = this.viewItems[indexes[i]];
      const size = clamp(item.size + emptyDelta, item.minimumSize, item.maximumSize);
      const viewDelta = size - item.size;
      emptyDelta -= viewDelta;
      item.size = size;
    }
  }
  layoutViews() {
    this._contentSize = this.viewItems.reduce((r, i) => r + i.size, 0);
    let offset = 0;
    for (const viewItem of this.viewItems) {
      viewItem.layout(offset, this.layoutContext);
      offset += viewItem.size;
    }
    this.sashItems.forEach((item) => item.sash.layout());
    this.updateSashEnablement();
    this.updateScrollableElement();
  }
  updateScrollableElement() {
    if (this.orientation === Orientation.VERTICAL) {
      this.scrollableElement.setScrollDimensions({
        height: this.size,
        scrollHeight: this._contentSize
      });
    } else {
      this.scrollableElement.setScrollDimensions({
        width: this.size,
        scrollWidth: this._contentSize
      });
    }
  }
  updateSashEnablement() {
    let previous = false;
    const collapsesDown = this.viewItems.map((i) => previous = i.size - i.minimumSize > 0 || previous);
    previous = false;
    const expandsDown = this.viewItems.map((i) => previous = i.maximumSize - i.size > 0 || previous);
    const reverseViews = [...this.viewItems].reverse();
    previous = false;
    const collapsesUp = reverseViews.map((i) => previous = i.size - i.minimumSize > 0 || previous).reverse();
    previous = false;
    const expandsUp = reverseViews.map((i) => previous = i.maximumSize - i.size > 0 || previous).reverse();
    let position = 0;
    for (let index = 0; index < this.sashItems.length; index++) {
      const { sash } = this.sashItems[index];
      const viewItem = this.viewItems[index];
      position += viewItem.size;
      const min = !(collapsesDown[index] && expandsUp[index + 1]);
      const max = !(expandsDown[index] && collapsesUp[index + 1]);
      if (min && max) {
        const upIndexes = range(index, -1);
        const downIndexes = range(index + 1, this.viewItems.length);
        const snapBeforeIndex = this.findFirstSnapIndex(upIndexes);
        const snapAfterIndex = this.findFirstSnapIndex(downIndexes);
        const snappedBefore = typeof snapBeforeIndex === "number" && !this.viewItems[snapBeforeIndex].visible;
        const snappedAfter = typeof snapAfterIndex === "number" && !this.viewItems[snapAfterIndex].visible;
        if (snappedBefore && collapsesUp[index] && (position > 0 || this.startSnappingEnabled)) {
          sash.state = SashState.AtMinimum;
        } else if (snappedAfter && collapsesDown[index] && (position < this._contentSize || this.endSnappingEnabled)) {
          sash.state = SashState.AtMaximum;
        } else {
          sash.state = SashState.Disabled;
        }
      } else if (min && !max) {
        sash.state = SashState.AtMinimum;
      } else if (!min && max) {
        sash.state = SashState.AtMaximum;
      } else {
        sash.state = SashState.Enabled;
      }
    }
  }
  getSashPosition(sash) {
    let position = 0;
    for (let i = 0; i < this.sashItems.length; i++) {
      position += this.viewItems[i].size;
      if (this.sashItems[i].sash === sash) {
        return position;
      }
    }
    return 0;
  }
  findFirstSnapIndex(indexes) {
    for (const index of indexes) {
      const viewItem = this.viewItems[index];
      if (!viewItem.visible) {
        continue;
      }
      if (viewItem.snap) {
        return index;
      }
    }
    for (const index of indexes) {
      const viewItem = this.viewItems[index];
      if (viewItem.visible && viewItem.maximumSize - viewItem.minimumSize > 0) {
        return void 0;
      }
      if (!viewItem.visible && viewItem.snap) {
        return index;
      }
    }
    return void 0;
  }
  areViewsDistributed() {
    let min = void 0, max = void 0;
    for (const view of this.viewItems) {
      min = min === void 0 ? view.size : Math.min(min, view.size);
      max = max === void 0 ? view.size : Math.max(max, view.size);
      if (max - min > 2) {
        return false;
      }
    }
    return true;
  }
  dispose() {
    this.sashDragState?.disposable.dispose();
    dispose(this.viewItems);
    this.viewItems = [];
    this.sashItems.forEach((i) => i.disposable.dispose());
    this.sashItems = [];
    super.dispose();
  }
}
export {
  LayoutPriority,
  Orientation2 as Orientation,
  Sizing,
  SplitView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFx1aVxcc3BsaXR2aWV3XFxzcGxpdHZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyAkLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGFwcGVuZCwgZ2V0V2luZG93LCBzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lIH0gZnJvbSAnLi4vLi4vZG9tLmpzJztcbmltcG9ydCB7IERvbUVtaXR0ZXIgfSBmcm9tICcuLi8uLi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJU2FzaEV2ZW50IGFzIElCYXNlU2FzaEV2ZW50LCBPcmllbnRhdGlvbiwgU2FzaCwgU2FzaFN0YXRlIH0gZnJvbSAnLi4vc2FzaC9zYXNoLmpzJztcbmltcG9ydCB7IFNtb290aFNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vc2Nyb2xsYmFyL3Njcm9sbGFibGVFbGVtZW50LmpzJztcbmltcG9ydCB7IHB1c2hUb0VuZCwgcHVzaFRvU3RhcnQsIHJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBjb21iaW5lZERpc3Bvc2FibGUsIERpc3Bvc2FibGUsIGRpc3Bvc2UsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNsYW1wIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL251bWJlcnMuanMnO1xuaW1wb3J0IHsgU2Nyb2xsYWJsZSwgU2Nyb2xsYmFyVmlzaWJpbGl0eSwgU2Nyb2xsRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgKiBhcyB0eXBlcyBmcm9tICcuLi8uLi8uLi9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0ICcuL3NwbGl0dmlldy5jc3MnO1xuZXhwb3J0IHsgT3JpZW50YXRpb24gfSBmcm9tICcuLi9zYXNoL3Nhc2guanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElTcGxpdFZpZXdTdHlsZXMge1xuXHRyZWFkb25seSBzZXBhcmF0b3JCb3JkZXI6IENvbG9yO1xufVxuXG5jb25zdCBkZWZhdWx0U3R5bGVzOiBJU3BsaXRWaWV3U3R5bGVzID0ge1xuXHRzZXBhcmF0b3JCb3JkZXI6IENvbG9yLnRyYW5zcGFyZW50XG59O1xuXG5leHBvcnQgY29uc3QgZW51bSBMYXlvdXRQcmlvcml0eSB7XG5cdE5vcm1hbCxcblx0TG93LFxuXHRIaWdoXG59XG5cbi8qKlxuICogVGhlIGludGVyZmFjZSB0byBpbXBsZW1lbnQgZm9yIHZpZXdzIHdpdGhpbiBhIHtAbGluayBTcGxpdFZpZXd9LlxuICpcbiAqIEFuIG9wdGlvbmFsIHtAbGluayBUTGF5b3V0Q29udGV4dCBsYXlvdXQgY29udGV4dCB0eXBlfSBtYXkgYmUgdXNlZCBpbiBvcmRlciB0b1xuICogcGFzcyBhbG9uZyBsYXlvdXQgY29udGV4dHVhbCBkYXRhIGZyb20gdGhlIHtAbGluayBTcGxpdFZpZXcubGF5b3V0fSBtZXRob2QgZG93blxuICogdG8gZWFjaCB2aWV3J3Mge0BsaW5rIElWaWV3LmxheW91dH0gY2FsbHMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVZpZXc8VExheW91dENvbnRleHQgPSB1bmRlZmluZWQ+IHtcblxuXHQvKipcblx0ICogVGhlIERPTSBlbGVtZW50IGZvciB0aGlzIHZpZXcuXG5cdCAqL1xuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblxuXHQvKipcblx0ICogQSBtaW5pbXVtIHNpemUgZm9yIHRoaXMgdmlldy5cblx0ICpcblx0ICogQHJlbWFya3MgSWYgbm9uZSwgc2V0IGl0IHRvIGAwYC5cblx0ICovXG5cdHJlYWRvbmx5IG1pbmltdW1TaXplOiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIEEgbWF4aW11bSBzaXplIGZvciB0aGlzIHZpZXcuXG5cdCAqXG5cdCAqIEByZW1hcmtzIElmIG5vbmUsIHNldCBpdCB0byBgTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZYC5cblx0ICovXG5cdHJlYWRvbmx5IG1heGltdW1TaXplOiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIFRoZSBwcmlvcml0eSBvZiB0aGUgdmlldyB3aGVuIHRoZSB7QGxpbmsgU3BsaXRWaWV3LnJlc2l6ZSBsYXlvdXR9IGFsZ29yaXRobVxuXHQgKiBydW5zLiBWaWV3cyB3aXRoIGhpZ2hlciBwcmlvcml0eSB3aWxsIGJlIHJlc2l6ZWQgZmlyc3QuXG5cdCAqXG5cdCAqIEByZW1hcmtzIE9ubHkgdXNlZCB3aGVuIGBwcm9wb3J0aW9uYWxMYXlvdXRgIGlzIGZhbHNlLlxuXHQgKi9cblx0cmVhZG9ubHkgcHJpb3JpdHk/OiBMYXlvdXRQcmlvcml0eTtcblxuXHQvKipcblx0ICogSWYgdGhlIHtAbGluayBTcGxpdFZpZXd9IHN1cHBvcnRzIHtAbGluayBJU3BsaXRWaWV3T3B0aW9ucy5wcm9wb3J0aW9uYWxMYXlvdXQgcHJvcG9ydGlvbmFsIGxheW91dH0sXG5cdCAqIHRoaXMgcHJvcGVydHkgYWxsb3dzIGZvciBmaW5lciBjb250cm9sIG92ZXIgdGhlIHByb3BvcnRpb25hbCBsYXlvdXQgYWxnb3JpdGhtLCBwZXIgdmlldy5cblx0ICpcblx0ICogQGRlZmF1bHRWYWx1ZSBgdHJ1ZWBcblx0ICovXG5cdHJlYWRvbmx5IHByb3BvcnRpb25hbExheW91dD86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIHZpZXcgd2lsbCBzbmFwIHdoZW5ldmVyIHRoZSB1c2VyIHJlYWNoZXMgaXRzIG1pbmltdW0gc2l6ZSBvclxuXHQgKiBhdHRlbXB0cyB0byBncm93IGl0IGJleW9uZCB0aGUgbWluaW11bSBzaXplLlxuXHQgKlxuXHQgKiBAZGVmYXVsdFZhbHVlIGBmYWxzZWBcblx0ICovXG5cdHJlYWRvbmx5IHNuYXA/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBWaWV3IGluc3RhbmNlcyBhcmUgc3VwcG9zZWQgdG8gZmlyZSB0aGUge0BsaW5rIElWaWV3Lm9uRGlkQ2hhbmdlfSBldmVudCB3aGVuZXZlclxuXHQgKiBhbnkgb2YgdGhlIGNvbnN0cmFpbnQgcHJvcGVydGllcyBoYXZlIGNoYW5nZWQ6XG5cdCAqXG5cdCAqIC0ge0BsaW5rIElWaWV3Lm1pbmltdW1TaXplfVxuXHQgKiAtIHtAbGluayBJVmlldy5tYXhpbXVtU2l6ZX1cblx0ICogLSB7QGxpbmsgSVZpZXcucHJpb3JpdHl9XG5cdCAqIC0ge0BsaW5rIElWaWV3LnNuYXB9XG5cdCAqXG5cdCAqIFRoZSBTcGxpdFZpZXcgd2lsbCByZWxheW91dCB3aGVuZXZlciB0aGF0IGhhcHBlbnMuIFRoZSBldmVudCBjYW4gb3B0aW9uYWxseSBlbWl0XG5cdCAqIHRoZSB2aWV3J3MgcHJlZmVycmVkIHNpemUgZm9yIHRoYXQgcmVsYXlvdXQuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8bnVtYmVyIHwgdW5kZWZpbmVkPjtcblxuXHQvKipcblx0ICogVGhpcyB3aWxsIGJlIGNhbGxlZCBieSB0aGUge0BsaW5rIFNwbGl0Vmlld30gZHVyaW5nIGxheW91dC4gQSB2aWV3IG1lYW50IHRvXG5cdCAqIHBhc3MgYWxvbmcgdGhlIGxheW91dCBpbmZvcm1hdGlvbiBkb3duIHRvIGl0cyBkZXNjZW5kYW50cy5cblx0ICpcblx0ICogQHBhcmFtIHNpemUgVGhlIHNpemUgb2YgdGhpcyB2aWV3LCBpbiBwaXhlbHMuXG5cdCAqIEBwYXJhbSBvZmZzZXQgVGhlIG9mZnNldCBvZiB0aGlzIHZpZXcsIHJlbGF0aXZlIHRvIHRoZSBzdGFydCBvZiB0aGUge0BsaW5rIFNwbGl0Vmlld30uXG5cdCAqIEBwYXJhbSBjb250ZXh0IFRoZSBvcHRpb25hbCB7QGxpbmsgSVZpZXcgbGF5b3V0IGNvbnRleHR9IHBhc3NlZCB0byB7QGxpbmsgU3BsaXRWaWV3LmxheW91dH0uXG5cdCAqL1xuXHRsYXlvdXQoc2l6ZTogbnVtYmVyLCBvZmZzZXQ6IG51bWJlciwgY29udGV4dDogVExheW91dENvbnRleHQgfCB1bmRlZmluZWQpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBUaGlzIHdpbGwgYmUgY2FsbGVkIGJ5IHRoZSB7QGxpbmsgU3BsaXRWaWV3fSB3aGVuZXZlciB0aGlzIHZpZXcgaXMgbWFkZVxuXHQgKiB2aXNpYmxlIG9yIGhpZGRlbi5cblx0ICpcblx0ICogQHBhcmFtIHZpc2libGUgV2hldGhlciB0aGUgdmlldyBiZWNvbWVzIHZpc2libGUuXG5cdCAqL1xuXHRzZXRWaXNpYmxlPyh2aXNpYmxlOiBib29sZWFuKTogdm9pZDtcbn1cblxuLyoqXG4gKiBBIGRlc2NyaXB0b3IgZm9yIGEge0BsaW5rIFNwbGl0Vmlld30gaW5zdGFuY2UuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNwbGl0Vmlld0Rlc2NyaXB0b3I8VExheW91dENvbnRleHQgPSB1bmRlZmluZWQsIFRWaWV3IGV4dGVuZHMgSVZpZXc8VExheW91dENvbnRleHQ+ID0gSVZpZXc8VExheW91dENvbnRleHQ+PiB7XG5cblx0LyoqXG5cdCAqIFRoZSBsYXlvdXQgc2l6ZSBvZiB0aGUge0BsaW5rIFNwbGl0Vmlld30uXG5cdCAqL1xuXHRyZWFkb25seSBzaXplOiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIERlc2NyaXB0b3JzIGZvciBlYWNoIHtAbGluayBJVmlldyB2aWV3fS5cblx0ICovXG5cdHJlYWRvbmx5IHZpZXdzOiB7XG5cblx0XHQvKipcblx0XHQgKiBXaGV0aGVyIHRoZSB7QGxpbmsgSVZpZXcgdmlld30gaXMgdmlzaWJsZS5cblx0XHQgKlxuXHRcdCAqIEBkZWZhdWx0VmFsdWUgYHRydWVgXG5cdFx0ICovXG5cdFx0cmVhZG9ubHkgdmlzaWJsZT86IGJvb2xlYW47XG5cblx0XHQvKipcblx0XHQgKiBUaGUgc2l6ZSBvZiB0aGUge0BsaW5rIElWaWV3IHZpZXd9LlxuXHRcdCAqXG5cdFx0ICogQGRlZmF1bHRWYWx1ZSBgdHJ1ZWBcblx0XHQgKi9cblx0XHRyZWFkb25seSBzaXplOiBudW1iZXI7XG5cblx0XHQvKipcblx0XHQgKiBUaGUgc2l6ZSBvZiB0aGUge0BsaW5rIElWaWV3IHZpZXd9LlxuXHRcdCAqXG5cdFx0ICogQGRlZmF1bHRWYWx1ZSBgdHJ1ZWBcblx0XHQgKi9cblx0XHRyZWFkb25seSB2aWV3OiBUVmlldztcblx0fVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTcGxpdFZpZXdPcHRpb25zPFRMYXlvdXRDb250ZXh0ID0gdW5kZWZpbmVkLCBUVmlldyBleHRlbmRzIElWaWV3PFRMYXlvdXRDb250ZXh0PiA9IElWaWV3PFRMYXlvdXRDb250ZXh0Pj4ge1xuXG5cdC8qKlxuXHQgKiBXaGljaCBheGlzIHRoZSB2aWV3cyBhbGlnbiBvbi5cblx0ICpcblx0ICogQGRlZmF1bHRWYWx1ZSBgT3JpZW50YXRpb24uVkVSVElDQUxgXG5cdCAqL1xuXHRyZWFkb25seSBvcmllbnRhdGlvbj86IE9yaWVudGF0aW9uO1xuXG5cdC8qKlxuXHQgKiBTdHlsZXMgb3ZlcnJpZGluZyB0aGUge0BsaW5rIGRlZmF1bHRTdHlsZXMgZGVmYXVsdCBvbmVzfS5cblx0ICovXG5cdHJlYWRvbmx5IHN0eWxlcz86IElTcGxpdFZpZXdTdHlsZXM7XG5cblx0LyoqXG5cdCAqIE1ha2UgQWx0LWRyYWcgdGhlIGRlZmF1bHQgZHJhZyBvcGVyYXRpb24uXG5cdCAqL1xuXHRyZWFkb25seSBpbnZlcnNlQWx0QmVoYXZpb3I/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBSZXNpemUgZWFjaCB2aWV3IHByb3BvcnRpb25hbGx5IHdoZW4gcmVzaXppbmcgdGhlIFNwbGl0Vmlldy5cblx0ICpcblx0ICogQGRlZmF1bHRWYWx1ZSBgdHJ1ZWBcblx0ICovXG5cdHJlYWRvbmx5IHByb3BvcnRpb25hbExheW91dD86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIEFuIGluaXRpYWwgZGVzY3JpcHRpb24gb2YgdGhpcyB7QGxpbmsgU3BsaXRWaWV3fSBpbnN0YW5jZSwgYWxsb3dpbmdcblx0ICogdG8gaW5pdGlhbHplIGFsbCB2aWV3cyB3aXRoaW4gdGhlIGN0b3IuXG5cdCAqL1xuXHRyZWFkb25seSBkZXNjcmlwdG9yPzogSVNwbGl0Vmlld0Rlc2NyaXB0b3I8VExheW91dENvbnRleHQsIFRWaWV3PjtcblxuXHQvKipcblx0ICogVGhlIHNjcm9sbGJhciB2aXNpYmlsaXR5IHNldHRpbmcgZm9yIHdoZW5ldmVyIHRoZSB2aWV3cyB3aXRoaW5cblx0ICogdGhlIHtAbGluayBTcGxpdFZpZXd9IG92ZXJmbG93LlxuXHQgKi9cblx0cmVhZG9ubHkgc2Nyb2xsYmFyVmlzaWJpbGl0eT86IFNjcm9sbGJhclZpc2liaWxpdHk7XG5cblx0LyoqXG5cdCAqIE92ZXJyaWRlIHRoZSBvcnRob2dvbmFsIHNpemUgb2Ygc2FzaGVzLlxuXHQgKi9cblx0cmVhZG9ubHkgZ2V0U2FzaE9ydGhvZ29uYWxTaXplPzogKCkgPT4gbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSVNhc2hFdmVudCB7XG5cdHJlYWRvbmx5IHNhc2g6IFNhc2g7XG5cdHJlYWRvbmx5IHN0YXJ0OiBudW1iZXI7XG5cdHJlYWRvbmx5IGN1cnJlbnQ6IG51bWJlcjtcblx0cmVhZG9ubHkgYWx0OiBib29sZWFuO1xufVxuXG50eXBlIFZpZXdJdGVtU2l6ZSA9IG51bWJlciB8IHsgY2FjaGVkVmlzaWJsZVNpemU6IG51bWJlciB9O1xuXG5hYnN0cmFjdCBjbGFzcyBWaWV3SXRlbTxUTGF5b3V0Q29udGV4dCwgVFZpZXcgZXh0ZW5kcyBJVmlldzxUTGF5b3V0Q29udGV4dD4+IHtcblxuXHRwcml2YXRlIF9zaXplOiBudW1iZXI7XG5cdHNldCBzaXplKHNpemU6IG51bWJlcikge1xuXHRcdHRoaXMuX3NpemUgPSBzaXplO1xuXHR9XG5cblx0Z2V0IHNpemUoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fc2l6ZTtcblx0fVxuXG5cdHByaXZhdGUgX2NhY2hlZFZpc2libGVTaXplOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGdldCBjYWNoZWRWaXNpYmxlU2l6ZSgpOiBudW1iZXIgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fY2FjaGVkVmlzaWJsZVNpemU7IH1cblxuXHRnZXQgdmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHlwZW9mIHRoaXMuX2NhY2hlZFZpc2libGVTaXplID09PSAndW5kZWZpbmVkJztcblx0fVxuXG5cdHNldFZpc2libGUodmlzaWJsZTogYm9vbGVhbiwgc2l6ZT86IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh2aXNpYmxlID09PSB0aGlzLnZpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodmlzaWJsZSkge1xuXHRcdFx0dGhpcy5zaXplID0gY2xhbXAodGhpcy5fY2FjaGVkVmlzaWJsZVNpemUhLCB0aGlzLnZpZXdNaW5pbXVtU2l6ZSwgdGhpcy52aWV3TWF4aW11bVNpemUpO1xuXHRcdFx0dGhpcy5fY2FjaGVkVmlzaWJsZVNpemUgPSB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2NhY2hlZFZpc2libGVTaXplID0gdHlwZW9mIHNpemUgPT09ICdudW1iZXInID8gc2l6ZSA6IHRoaXMuc2l6ZTtcblx0XHRcdHRoaXMuc2l6ZSA9IDA7XG5cdFx0fVxuXG5cdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgndmlzaWJsZScsIHZpc2libGUpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMudmlldy5zZXRWaXNpYmxlPy4odmlzaWJsZSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc29sZS5lcnJvcignU3BsaXR2aWV3OiBGYWlsZWQgdG8gc2V0IHZpc2libGUgdmlldycpO1xuXHRcdFx0Y29uc29sZS5lcnJvcihlKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgbWluaW11bVNpemUoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMudmlzaWJsZSA/IHRoaXMudmlldy5taW5pbXVtU2l6ZSA6IDA7IH1cblx0Z2V0IHZpZXdNaW5pbXVtU2l6ZSgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy52aWV3Lm1pbmltdW1TaXplOyB9XG5cblx0Z2V0IG1heGltdW1TaXplKCk6IG51bWJlciB7IHJldHVybiB0aGlzLnZpc2libGUgPyB0aGlzLnZpZXcubWF4aW11bVNpemUgOiAwOyB9XG5cdGdldCB2aWV3TWF4aW11bVNpemUoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMudmlldy5tYXhpbXVtU2l6ZTsgfVxuXG5cdGdldCBwcmlvcml0eSgpOiBMYXlvdXRQcmlvcml0eSB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLnZpZXcucHJpb3JpdHk7IH1cblx0Z2V0IHByb3BvcnRpb25hbExheW91dCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMudmlldy5wcm9wb3J0aW9uYWxMYXlvdXQgPz8gdHJ1ZTsgfVxuXHRnZXQgc25hcCgpOiBib29sZWFuIHsgcmV0dXJuICEhdGhpcy52aWV3LnNuYXA7IH1cblxuXHRzZXQgZW5hYmxlZChlbmFibGVkOiBib29sZWFuKSB7XG5cdFx0dGhpcy5jb250YWluZXIuc3R5bGUucG9pbnRlckV2ZW50cyA9IGVuYWJsZWQgPyAnJyA6ICdub25lJztcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3RlY3RlZCBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHJlYWRvbmx5IHZpZXc6IFRWaWV3LFxuXHRcdHNpemU6IFZpZXdJdGVtU2l6ZSxcblx0XHRwcml2YXRlIGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlXG5cdCkge1xuXHRcdGlmICh0eXBlb2Ygc2l6ZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdHRoaXMuX3NpemUgPSBzaXplO1xuXHRcdFx0dGhpcy5fY2FjaGVkVmlzaWJsZVNpemUgPSB1bmRlZmluZWQ7XG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgndmlzaWJsZScpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zaXplID0gMDtcblx0XHRcdHRoaXMuX2NhY2hlZFZpc2libGVTaXplID0gc2l6ZS5jYWNoZWRWaXNpYmxlU2l6ZTtcblx0XHR9XG5cdH1cblxuXHRsYXlvdXQob2Zmc2V0OiBudW1iZXIsIGxheW91dENvbnRleHQ6IFRMYXlvdXRDb250ZXh0IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5sYXlvdXRDb250YWluZXIob2Zmc2V0KTtcblxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLnZpZXcubGF5b3V0KHRoaXMuc2l6ZSwgb2Zmc2V0LCBsYXlvdXRDb250ZXh0KTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKCdTcGxpdHZpZXc6IEZhaWxlZCB0byBsYXlvdXQgdmlldycpO1xuXHRcdFx0Y29uc29sZS5lcnJvcihlKTtcblx0XHR9XG5cdH1cblxuXHRhYnN0cmFjdCBsYXlvdXRDb250YWluZXIob2Zmc2V0OiBudW1iZXIpOiB2b2lkO1xuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBWZXJ0aWNhbFZpZXdJdGVtPFRMYXlvdXRDb250ZXh0LCBUVmlldyBleHRlbmRzIElWaWV3PFRMYXlvdXRDb250ZXh0Pj4gZXh0ZW5kcyBWaWV3SXRlbTxUTGF5b3V0Q29udGV4dCwgVFZpZXc+IHtcblxuXHRsYXlvdXRDb250YWluZXIob2Zmc2V0OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS50b3AgPSBgJHtvZmZzZXR9cHhgO1xuXHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke3RoaXMuc2l6ZX1weGA7XG5cdH1cbn1cblxuY2xhc3MgSG9yaXpvbnRhbFZpZXdJdGVtPFRMYXlvdXRDb250ZXh0LCBUVmlldyBleHRlbmRzIElWaWV3PFRMYXlvdXRDb250ZXh0Pj4gZXh0ZW5kcyBWaWV3SXRlbTxUTGF5b3V0Q29udGV4dCwgVFZpZXc+IHtcblxuXHRsYXlvdXRDb250YWluZXIob2Zmc2V0OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5sZWZ0ID0gYCR7b2Zmc2V0fXB4YDtcblx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke3RoaXMuc2l6ZX1weGA7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElTYXNoSXRlbSB7XG5cdHNhc2g6IFNhc2g7XG5cdGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlO1xufVxuXG5pbnRlcmZhY2UgSVNhc2hEcmFnU25hcFN0YXRlIHtcblx0cmVhZG9ubHkgaW5kZXg6IG51bWJlcjtcblx0cmVhZG9ubHkgbGltaXREZWx0YTogbnVtYmVyO1xuXHRyZWFkb25seSBzaXplOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBJU2FzaERyYWdTdGF0ZSB7XG5cdGluZGV4OiBudW1iZXI7XG5cdHN0YXJ0OiBudW1iZXI7XG5cdGN1cnJlbnQ6IG51bWJlcjtcblx0c2l6ZXM6IG51bWJlcltdO1xuXHRtaW5EZWx0YTogbnVtYmVyO1xuXHRtYXhEZWx0YTogbnVtYmVyO1xuXHRhbHQ6IGJvb2xlYW47XG5cdHNuYXBCZWZvcmU6IElTYXNoRHJhZ1NuYXBTdGF0ZSB8IHVuZGVmaW5lZDtcblx0c25hcEFmdGVyOiBJU2FzaERyYWdTbmFwU3RhdGUgfCB1bmRlZmluZWQ7XG5cdGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlO1xufVxuXG5lbnVtIFN0YXRlIHtcblx0SWRsZSxcblx0QnVzeVxufVxuXG4vKipcbiAqIFdoZW4gYWRkaW5nIG9yIHJlbW92aW5nIHZpZXdzLCB1bmlmb3JtbHkgZGlzdHJpYnV0ZSB0aGUgZW50aXJlIHNwbGl0IHZpZXcgc3BhY2UgYW1vbmdcbiAqIGFsbCB2aWV3cy5cbiAqL1xuZXhwb3J0IHR5cGUgRGlzdHJpYnV0ZVNpemluZyA9IHsgdHlwZTogJ2Rpc3RyaWJ1dGUnIH07XG5cbi8qKlxuICogV2hlbiBhZGRpbmcgYSB2aWV3LCBtYWtlIHNwYWNlIGZvciBpdCBieSByZWR1Y2luZyB0aGUgc2l6ZSBvZiBhbm90aGVyIHZpZXcsXG4gKiBpbmRleGVkIGJ5IHRoZSBwcm92aWRlZCBgaW5kZXhgLlxuICovXG5leHBvcnQgdHlwZSBTcGxpdFNpemluZyA9IHsgdHlwZTogJ3NwbGl0JzsgaW5kZXg6IG51bWJlciB9O1xuXG4vKipcbiAqIFdoZW4gYWRkaW5nIGEgdmlldywgdXNlIERpc3RyaWJ1dGVTaXppbmcgd2hlbiBhbGwgcHJlLWV4aXN0aW5nIHZpZXdzIGFyZVxuICogZGlzdHJpYnV0ZWQgZXZlbmx5LCBvdGhlcndpc2UgdXNlIFNwbGl0U2l6aW5nLlxuICovXG5leHBvcnQgdHlwZSBBdXRvU2l6aW5nID0geyB0eXBlOiAnYXV0byc7IGluZGV4OiBudW1iZXIgfTtcblxuLyoqXG4gKiBXaGVuIGFkZGluZyBvciByZW1vdmluZyB2aWV3cywgYXNzdW1lIHRoZSB2aWV3IGlzIGludmlzaWJsZS5cbiAqL1xuZXhwb3J0IHR5cGUgSW52aXNpYmxlU2l6aW5nID0geyB0eXBlOiAnaW52aXNpYmxlJzsgY2FjaGVkVmlzaWJsZVNpemU6IG51bWJlciB9O1xuXG4vKipcbiAqIFdoZW4gYWRkaW5nIG9yIHJlbW92aW5nIHZpZXdzLCB0aGUgc2l6aW5nIHByb3ZpZGVzIGZpbmUgZ3JhaW5lZFxuICogY29udHJvbCBvdmVyIGhvdyBvdGhlciB2aWV3cyBnZXQgcmVzaXplZC5cbiAqL1xuZXhwb3J0IHR5cGUgU2l6aW5nID0gRGlzdHJpYnV0ZVNpemluZyB8IFNwbGl0U2l6aW5nIHwgQXV0b1NpemluZyB8IEludmlzaWJsZVNpemluZztcblxuZXhwb3J0IG5hbWVzcGFjZSBTaXppbmcge1xuXG5cdC8qKlxuXHQgKiBXaGVuIGFkZGluZyBvciByZW1vdmluZyB2aWV3cywgZGlzdHJpYnV0ZSB0aGUgZGVsdGEgc3BhY2UgYW1vbmdcblx0ICogYWxsIG90aGVyIHZpZXdzLlxuXHQgKi9cblx0ZXhwb3J0IGNvbnN0IERpc3RyaWJ1dGU6IERpc3RyaWJ1dGVTaXppbmcgPSB7IHR5cGU6ICdkaXN0cmlidXRlJyB9O1xuXG5cdC8qKlxuXHQgKiBXaGVuIGFkZGluZyBvciByZW1vdmluZyB2aWV3cywgc3BsaXQgdGhlIGRlbHRhIHNwYWNlIHdpdGggYW5vdGhlclxuXHQgKiBzcGVjaWZpYyB2aWV3LCBpbmRleGVkIGJ5IHRoZSBwcm92aWRlZCBgaW5kZXhgLlxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIFNwbGl0KGluZGV4OiBudW1iZXIpOiBTcGxpdFNpemluZyB7IHJldHVybiB7IHR5cGU6ICdzcGxpdCcsIGluZGV4IH07IH1cblxuXHQvKipcblx0ICogV2hlbiBhZGRpbmcgYSB2aWV3LCB1c2UgRGlzdHJpYnV0ZVNpemluZyB3aGVuIGFsbCBwcmUtZXhpc3Rpbmcgdmlld3MgYXJlXG5cdCAqIGRpc3RyaWJ1dGVkIGV2ZW5seSwgb3RoZXJ3aXNlIHVzZSBTcGxpdFNpemluZy5cblx0ICovXG5cdGV4cG9ydCBmdW5jdGlvbiBBdXRvKGluZGV4OiBudW1iZXIpOiBBdXRvU2l6aW5nIHsgcmV0dXJuIHsgdHlwZTogJ2F1dG8nLCBpbmRleCB9OyB9XG5cblx0LyoqXG5cdCAqIFdoZW4gYWRkaW5nIG9yIHJlbW92aW5nIHZpZXdzLCBhc3N1bWUgdGhlIHZpZXcgaXMgaW52aXNpYmxlLlxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIEludmlzaWJsZShjYWNoZWRWaXNpYmxlU2l6ZTogbnVtYmVyKTogSW52aXNpYmxlU2l6aW5nIHsgcmV0dXJuIHsgdHlwZTogJ2ludmlzaWJsZScsIGNhY2hlZFZpc2libGVTaXplIH07IH1cbn1cblxuLyoqXG4gKiBUaGUge0BsaW5rIFNwbGl0Vmlld30gaXMgdGhlIFVJIGNvbXBvbmVudCB3aGljaCBpbXBsZW1lbnRzIGEgb25lIGRpbWVuc2lvbmFsXG4gKiBmbGV4LWxpa2UgbGF5b3V0IGFsZ29yaXRobSBmb3IgYSBjb2xsZWN0aW9uIG9mIHtAbGluayBJVmlld30gaW5zdGFuY2VzLCB3aGljaFxuICogYXJlIGVzc2VudGlhbGx5IEhUTUxFbGVtZW50IGluc3RhbmNlcyB3aXRoIHRoZSBmb2xsb3dpbmcgc2l6ZSBjb25zdHJhaW50czpcbiAqXG4gKiAtIHtAbGluayBJVmlldy5taW5pbXVtU2l6ZX1cbiAqIC0ge0BsaW5rIElWaWV3Lm1heGltdW1TaXplfVxuICogLSB7QGxpbmsgSVZpZXcucHJpb3JpdHl9XG4gKiAtIHtAbGluayBJVmlldy5zbmFwfVxuICpcbiAqIEluIGNhc2UgdGhlIFNwbGl0VmlldyBkb2Vzbid0IGhhdmUgZW5vdWdoIHNpemUgdG8gZml0IGFsbCB2aWV3cywgaXQgd2lsbCBvdmVyZmxvd1xuICogaXRzIGNvbnRlbnQgd2l0aCBhIHNjcm9sbGJhci5cbiAqXG4gKiBJbiBiZXR3ZWVuIGVhY2ggcGFpciBvZiB2aWV3cyB0aGVyZSB3aWxsIGJlIGEge0BsaW5rIFNhc2h9IGFsbG93aW5nIHRoZSB1c2VyXG4gKiB0byByZXNpemUgdGhlIHZpZXdzLCBtYWtpbmcgc3VyZSB0aGUgY29uc3RyYWludHMgYXJlIHJlc3BlY3RlZC5cbiAqXG4gKiBBbiBvcHRpb25hbCB7QGxpbmsgVExheW91dENvbnRleHQgbGF5b3V0IGNvbnRleHQgdHlwZX0gbWF5IGJlIHVzZWQgaW4gb3JkZXIgdG9cbiAqIHBhc3MgYWxvbmcgbGF5b3V0IGNvbnRleHR1YWwgZGF0YSBmcm9tIHRoZSB7QGxpbmsgU3BsaXRWaWV3LmxheW91dH0gbWV0aG9kIGRvd25cbiAqIHRvIGVhY2ggdmlldydzIHtAbGluayBJVmlldy5sYXlvdXR9IGNhbGxzLlxuICpcbiAqIEZlYXR1cmVzOlxuICogLSBGbGV4LWxpa2UgbGF5b3V0IGFsZ29yaXRobVxuICogLSBTbmFwIHN1cHBvcnRcbiAqIC0gT3J0aG9nb25hbCBzYXNoIHN1cHBvcnQsIGZvciBjb3JuZXIgc2FzaGVzXG4gKiAtIFZpZXcgaGlkZS9zaG93IHN1cHBvcnRcbiAqIC0gVmlldyBzd2FwL21vdmUgc3VwcG9ydFxuICogLSBBbHQga2V5IG1vZGlmaWVyIGJlaGF2aW9yLCBtYWNPUyBzdHlsZVxuICovXG5leHBvcnQgY2xhc3MgU3BsaXRWaWV3PFRMYXlvdXRDb250ZXh0ID0gdW5kZWZpbmVkLCBUVmlldyBleHRlbmRzIElWaWV3PFRMYXlvdXRDb250ZXh0PiA9IElWaWV3PFRMYXlvdXRDb250ZXh0Pj4gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHQvKipcblx0ICogVGhpcyB7QGxpbmsgU3BsaXRWaWV3fSdzIG9yaWVudGF0aW9uLlxuXHQgKi9cblx0cmVhZG9ubHkgb3JpZW50YXRpb246IE9yaWVudGF0aW9uO1xuXG5cdC8qKlxuXHQgKiBUaGUgRE9NIGVsZW1lbnQgcmVwcmVzZW50aW5nIHRoaXMge0BsaW5rIFNwbGl0Vmlld30uXG5cdCAqL1xuXHRyZWFkb25seSBlbDogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSBzYXNoQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSB2aWV3Q29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzY3JvbGxhYmxlOiBTY3JvbGxhYmxlO1xuXHRwcml2YXRlIHNjcm9sbGFibGVFbGVtZW50OiBTbW9vdGhTY3JvbGxhYmxlRWxlbWVudDtcblx0cHJpdmF0ZSBzaXplID0gMDtcblx0cHJpdmF0ZSBsYXlvdXRDb250ZXh0OiBUTGF5b3V0Q29udGV4dCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY29udGVudFNpemUgPSAwO1xuXHRwcml2YXRlIHByb3BvcnRpb25zOiAobnVtYmVyIHwgdW5kZWZpbmVkKVtdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIHZpZXdJdGVtczogVmlld0l0ZW08VExheW91dENvbnRleHQsIFRWaWV3PltdID0gW107XG5cdHNhc2hJdGVtczogSVNhc2hJdGVtW10gPSBbXTsgLy8gdXNlZCBpbiB0ZXN0c1xuXHRwcml2YXRlIHNhc2hEcmFnU3RhdGU6IElTYXNoRHJhZ1N0YXRlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHN0YXRlOiBTdGF0ZSA9IFN0YXRlLklkbGU7XG5cdHByaXZhdGUgaW52ZXJzZUFsdEJlaGF2aW9yOiBib29sZWFuO1xuXHRwcml2YXRlIHByb3BvcnRpb25hbExheW91dDogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBnZXRTYXNoT3J0aG9nb25hbFNpemU6IHsgKCk6IG51bWJlciB9IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX29uRGlkU2FzaENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdHByaXZhdGUgX29uRGlkU2FzaFJlc2V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0cHJpdmF0ZSBfb3J0aG9nb25hbFN0YXJ0U2FzaDogU2FzaCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfb3J0aG9nb25hbEVuZFNhc2g6IFNhc2ggfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3N0YXJ0U25hcHBpbmdFbmFibGVkID0gdHJ1ZTtcblx0cHJpdmF0ZSBfZW5kU25hcHBpbmdFbmFibGVkID0gdHJ1ZTtcblxuXHQvKipcblx0ICogVGhlIHN1bSBvZiBhbGwgdmlld3MnIHNpemVzLlxuXHQgKi9cblx0Z2V0IGNvbnRlbnRTaXplKCk6IG51bWJlciB7IHJldHVybiB0aGlzLl9jb250ZW50U2l6ZTsgfVxuXG5cdC8qKlxuXHQgKiBGaXJlcyB3aGVuZXZlciB0aGUgdXNlciByZXNpemVzIGEge0BsaW5rIFNhc2ggc2FzaH0uXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZFNhc2hDaGFuZ2UgPSB0aGlzLl9vbkRpZFNhc2hDaGFuZ2UuZXZlbnQ7XG5cblx0LyoqXG5cdCAqIEZpcmVzIHdoZW5ldmVyIHRoZSB1c2VyIGRvdWJsZSBjbGlja3MgYSB7QGxpbmsgU2FzaCBzYXNofS5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkU2FzaFJlc2V0ID0gdGhpcy5fb25EaWRTYXNoUmVzZXQuZXZlbnQ7XG5cblx0LyoqXG5cdCAqIEZpcmVzIHdoZW5ldmVyIHRoZSBzcGxpdCB2aWV3IGlzIHNjcm9sbGVkLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRTY3JvbGw6IEV2ZW50PFNjcm9sbEV2ZW50PjtcblxuXHQvKipcblx0ICogVGhlIGFtb3VudCBvZiB2aWV3cyBpbiB0aGlzIHtAbGluayBTcGxpdFZpZXd9LlxuXHQgKi9cblx0Z2V0IGxlbmd0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnZpZXdJdGVtcy5sZW5ndGg7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIG1pbmltdW0gc2l6ZSBvZiB0aGlzIHtAbGluayBTcGxpdFZpZXd9LlxuXHQgKi9cblx0Z2V0IG1pbmltdW1TaXplKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMudmlld0l0ZW1zLnJlZHVjZSgociwgaXRlbSkgPT4gciArIGl0ZW0ubWluaW11bVNpemUsIDApO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBtYXhpbXVtIHNpemUgb2YgdGhpcyB7QGxpbmsgU3BsaXRWaWV3fS5cblx0ICovXG5cdGdldCBtYXhpbXVtU2l6ZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmxlbmd0aCA9PT0gMCA/IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSA6IHRoaXMudmlld0l0ZW1zLnJlZHVjZSgociwgaXRlbSkgPT4gciArIGl0ZW0ubWF4aW11bVNpemUsIDApO1xuXHR9XG5cblx0Z2V0IG9ydGhvZ29uYWxTdGFydFNhc2goKTogU2FzaCB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9vcnRob2dvbmFsU3RhcnRTYXNoOyB9XG5cdGdldCBvcnRob2dvbmFsRW5kU2FzaCgpOiBTYXNoIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX29ydGhvZ29uYWxFbmRTYXNoOyB9XG5cdGdldCBzdGFydFNuYXBwaW5nRW5hYmxlZCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX3N0YXJ0U25hcHBpbmdFbmFibGVkOyB9XG5cdGdldCBlbmRTbmFwcGluZ0VuYWJsZWQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9lbmRTbmFwcGluZ0VuYWJsZWQ7IH1cblxuXHQvKipcblx0ICogQSByZWZlcmVuY2UgdG8gYSBzYXNoLCBwZXJwZW5kaWN1bGFyIHRvIGFsbCBzYXNoZXMgaW4gdGhpcyB7QGxpbmsgU3BsaXRWaWV3fSxcblx0ICogbG9jYXRlZCBhdCB0aGUgbGVmdC0gb3IgdG9wLW1vc3Qgc2lkZSBvZiB0aGUgU3BsaXRWaWV3LlxuXHQgKiBDb3JuZXIgc2FzaGVzIHdpbGwgYmUgY3JlYXRlZCBhdXRvbWF0aWNhbGx5IGF0IHRoZSBpbnRlcnNlY3Rpb25zLlxuXHQgKi9cblx0c2V0IG9ydGhvZ29uYWxTdGFydFNhc2goc2FzaDogU2FzaCB8IHVuZGVmaW5lZCkge1xuXHRcdGZvciAoY29uc3Qgc2FzaEl0ZW0gb2YgdGhpcy5zYXNoSXRlbXMpIHtcblx0XHRcdHNhc2hJdGVtLnNhc2gub3J0aG9nb25hbFN0YXJ0U2FzaCA9IHNhc2g7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb3J0aG9nb25hbFN0YXJ0U2FzaCA9IHNhc2g7XG5cdH1cblxuXHQvKipcblx0ICogQSByZWZlcmVuY2UgdG8gYSBzYXNoLCBwZXJwZW5kaWN1bGFyIHRvIGFsbCBzYXNoZXMgaW4gdGhpcyB7QGxpbmsgU3BsaXRWaWV3fSxcblx0ICogbG9jYXRlZCBhdCB0aGUgcmlnaHQtIG9yIGJvdHRvbS1tb3N0IHNpZGUgb2YgdGhlIFNwbGl0Vmlldy5cblx0ICogQ29ybmVyIHNhc2hlcyB3aWxsIGJlIGNyZWF0ZWQgYXV0b21hdGljYWxseSBhdCB0aGUgaW50ZXJzZWN0aW9ucy5cblx0ICovXG5cdHNldCBvcnRob2dvbmFsRW5kU2FzaChzYXNoOiBTYXNoIHwgdW5kZWZpbmVkKSB7XG5cdFx0Zm9yIChjb25zdCBzYXNoSXRlbSBvZiB0aGlzLnNhc2hJdGVtcykge1xuXHRcdFx0c2FzaEl0ZW0uc2FzaC5vcnRob2dvbmFsRW5kU2FzaCA9IHNhc2g7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb3J0aG9nb25hbEVuZFNhc2ggPSBzYXNoO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBpbnRlcm5hbCBzYXNoZXMgd2l0aGluIHRoaXMge0BsaW5rIFNwbGl0Vmlld30uXG5cdCAqL1xuXHRnZXQgc2FzaGVzKCk6IHJlYWRvbmx5IFNhc2hbXSB7XG5cdFx0cmV0dXJuIHRoaXMuc2FzaEl0ZW1zLm1hcChzID0+IHMuc2FzaCk7XG5cdH1cblxuXHQvKipcblx0ICogRW5hYmxlL2Rpc2FibGUgc25hcHBpbmcgYXQgdGhlIGJlZ2lubmluZyBvZiB0aGlzIHtAbGluayBTcGxpdFZpZXd9LlxuXHQgKi9cblx0c2V0IHN0YXJ0U25hcHBpbmdFbmFibGVkKHN0YXJ0U25hcHBpbmdFbmFibGVkOiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMuX3N0YXJ0U25hcHBpbmdFbmFibGVkID09PSBzdGFydFNuYXBwaW5nRW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3N0YXJ0U25hcHBpbmdFbmFibGVkID0gc3RhcnRTbmFwcGluZ0VuYWJsZWQ7XG5cdFx0dGhpcy51cGRhdGVTYXNoRW5hYmxlbWVudCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEVuYWJsZS9kaXNhYmxlIHNuYXBwaW5nIGF0IHRoZSBlbmQgb2YgdGhpcyB7QGxpbmsgU3BsaXRWaWV3fS5cblx0ICovXG5cdHNldCBlbmRTbmFwcGluZ0VuYWJsZWQoZW5kU25hcHBpbmdFbmFibGVkOiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMuX2VuZFNuYXBwaW5nRW5hYmxlZCA9PT0gZW5kU25hcHBpbmdFbmFibGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fZW5kU25hcHBpbmdFbmFibGVkID0gZW5kU25hcHBpbmdFbmFibGVkO1xuXHRcdHRoaXMudXBkYXRlU2FzaEVuYWJsZW1lbnQoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGUgYSBuZXcge0BsaW5rIFNwbGl0Vmlld30gaW5zdGFuY2UuXG5cdCAqL1xuXHRjb25zdHJ1Y3Rvcihjb250YWluZXI6IEhUTUxFbGVtZW50LCBvcHRpb25zOiBJU3BsaXRWaWV3T3B0aW9uczxUTGF5b3V0Q29udGV4dCwgVFZpZXc+ID0ge30pIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5vcmllbnRhdGlvbiA9IG9wdGlvbnMub3JpZW50YXRpb24gPz8gT3JpZW50YXRpb24uVkVSVElDQUw7XG5cdFx0dGhpcy5pbnZlcnNlQWx0QmVoYXZpb3IgPSBvcHRpb25zLmludmVyc2VBbHRCZWhhdmlvciA/PyBmYWxzZTtcblx0XHR0aGlzLnByb3BvcnRpb25hbExheW91dCA9IG9wdGlvbnMucHJvcG9ydGlvbmFsTGF5b3V0ID8/IHRydWU7XG5cdFx0dGhpcy5nZXRTYXNoT3J0aG9nb25hbFNpemUgPSBvcHRpb25zLmdldFNhc2hPcnRob2dvbmFsU2l6ZTtcblxuXHRcdHRoaXMuZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLmVsLmNsYXNzTGlzdC5hZGQoJ21vbmFjby1zcGxpdC12aWV3MicpO1xuXHRcdHRoaXMuZWwuY2xhc3NMaXN0LmFkZCh0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5WRVJUSUNBTCA/ICd2ZXJ0aWNhbCcgOiAnaG9yaXpvbnRhbCcpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmVsKTtcblxuXHRcdHRoaXMuc2FzaENvbnRhaW5lciA9IGFwcGVuZCh0aGlzLmVsLCAkKCcuc2FzaC1jb250YWluZXInKSk7XG5cdFx0dGhpcy52aWV3Q29udGFpbmVyID0gJCgnLnNwbGl0LXZpZXctY29udGFpbmVyJyk7XG5cblx0XHR0aGlzLnNjcm9sbGFibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgU2Nyb2xsYWJsZSh7XG5cdFx0XHRmb3JjZUludGVnZXJWYWx1ZXM6IHRydWUsXG5cdFx0XHRzbW9vdGhTY3JvbGxEdXJhdGlvbjogMTI1LFxuXHRcdFx0c2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZTogY2FsbGJhY2sgPT4gc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShnZXRXaW5kb3codGhpcy5lbCksIGNhbGxiYWNrKSxcblx0XHR9KSk7XG5cdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTbW9vdGhTY3JvbGxhYmxlRWxlbWVudCh0aGlzLnZpZXdDb250YWluZXIsIHtcblx0XHRcdHZlcnRpY2FsOiB0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5WRVJUSUNBTCA/IChvcHRpb25zLnNjcm9sbGJhclZpc2liaWxpdHkgPz8gU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvKSA6IFNjcm9sbGJhclZpc2liaWxpdHkuSGlkZGVuLFxuXHRcdFx0aG9yaXpvbnRhbDogdGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IChvcHRpb25zLnNjcm9sbGJhclZpc2liaWxpdHkgPz8gU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvKSA6IFNjcm9sbGJhclZpc2liaWxpdHkuSGlkZGVuXG5cdFx0fSwgdGhpcy5zY3JvbGxhYmxlKSk7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTU3NzM3XG5cdFx0Y29uc3Qgb25EaWRTY3JvbGxWaWV3Q29udGFpbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERvbUVtaXR0ZXIodGhpcy52aWV3Q29udGFpbmVyLCAnc2Nyb2xsJykpLmV2ZW50O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG9uRGlkU2Nyb2xsVmlld0NvbnRhaW5lcihfID0+IHtcblx0XHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5zY3JvbGxhYmxlRWxlbWVudC5nZXRTY3JvbGxQb3NpdGlvbigpO1xuXHRcdFx0Y29uc3Qgc2Nyb2xsTGVmdCA9IE1hdGguYWJzKHRoaXMudmlld0NvbnRhaW5lci5zY3JvbGxMZWZ0IC0gcG9zaXRpb24uc2Nyb2xsTGVmdCkgPD0gMSA/IHVuZGVmaW5lZCA6IHRoaXMudmlld0NvbnRhaW5lci5zY3JvbGxMZWZ0O1xuXHRcdFx0Y29uc3Qgc2Nyb2xsVG9wID0gTWF0aC5hYnModGhpcy52aWV3Q29udGFpbmVyLnNjcm9sbFRvcCAtIHBvc2l0aW9uLnNjcm9sbFRvcCkgPD0gMSA/IHVuZGVmaW5lZCA6IHRoaXMudmlld0NvbnRhaW5lci5zY3JvbGxUb3A7XG5cblx0XHRcdGlmIChzY3JvbGxMZWZ0ICE9PSB1bmRlZmluZWQgfHwgc2Nyb2xsVG9wICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudC5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbExlZnQsIHNjcm9sbFRvcCB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLm9uRGlkU2Nyb2xsID0gdGhpcy5zY3JvbGxhYmxlRWxlbWVudC5vblNjcm9sbDtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkU2Nyb2xsKGUgPT4ge1xuXHRcdFx0aWYgKGUuc2Nyb2xsVG9wQ2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLnZpZXdDb250YWluZXIuc2Nyb2xsVG9wID0gZS5zY3JvbGxUb3A7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLnNjcm9sbExlZnRDaGFuZ2VkKSB7XG5cdFx0XHRcdHRoaXMudmlld0NvbnRhaW5lci5zY3JvbGxMZWZ0ID0gZS5zY3JvbGxMZWZ0O1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGFwcGVuZCh0aGlzLmVsLCB0aGlzLnNjcm9sbGFibGVFbGVtZW50LmdldERvbU5vZGUoKSk7XG5cblx0XHR0aGlzLnN0eWxlKG9wdGlvbnMuc3R5bGVzIHx8IGRlZmF1bHRTdHlsZXMpO1xuXG5cdFx0Ly8gV2UgaGF2ZSBhbiBleGlzdGluZyBzZXQgb2YgdmlldywgYWRkIHRoZW0gbm93XG5cdFx0aWYgKG9wdGlvbnMuZGVzY3JpcHRvcikge1xuXHRcdFx0dGhpcy5zaXplID0gb3B0aW9ucy5kZXNjcmlwdG9yLnNpemU7XG5cdFx0XHRvcHRpb25zLmRlc2NyaXB0b3Iudmlld3MuZm9yRWFjaCgodmlld0Rlc2NyaXB0b3IsIGluZGV4KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNpemluZyA9IHR5cGVzLmlzVW5kZWZpbmVkKHZpZXdEZXNjcmlwdG9yLnZpc2libGUpIHx8IHZpZXdEZXNjcmlwdG9yLnZpc2libGUgPyB2aWV3RGVzY3JpcHRvci5zaXplIDogeyB0eXBlOiAnaW52aXNpYmxlJywgY2FjaGVkVmlzaWJsZVNpemU6IHZpZXdEZXNjcmlwdG9yLnNpemUgfSBzYXRpc2ZpZXMgSW52aXNpYmxlU2l6aW5nO1xuXG5cdFx0XHRcdGNvbnN0IHZpZXcgPSB2aWV3RGVzY3JpcHRvci52aWV3O1xuXHRcdFx0XHR0aGlzLmRvQWRkVmlldyh2aWV3LCBzaXppbmcsIGluZGV4LCB0cnVlKTtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBJbml0aWFsaXplIGNvbnRlbnQgc2l6ZSBhbmQgcHJvcG9ydGlvbnMgZm9yIGZpcnN0IGxheW91dFxuXHRcdFx0dGhpcy5fY29udGVudFNpemUgPSB0aGlzLnZpZXdJdGVtcy5yZWR1Y2UoKHIsIGkpID0+IHIgKyBpLnNpemUsIDApO1xuXHRcdFx0dGhpcy5zYXZlUHJvcG9ydGlvbnMoKTtcblx0XHR9XG5cdH1cblxuXHRzdHlsZShzdHlsZXM6IElTcGxpdFZpZXdTdHlsZXMpOiB2b2lkIHtcblx0XHRpZiAoc3R5bGVzLnNlcGFyYXRvckJvcmRlci5pc1RyYW5zcGFyZW50KCkpIHtcblx0XHRcdHRoaXMuZWwuY2xhc3NMaXN0LnJlbW92ZSgnc2VwYXJhdG9yLWJvcmRlcicpO1xuXHRcdFx0dGhpcy5lbC5zdHlsZS5yZW1vdmVQcm9wZXJ0eSgnLS1zZXBhcmF0b3ItYm9yZGVyJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZWwuY2xhc3NMaXN0LmFkZCgnc2VwYXJhdG9yLWJvcmRlcicpO1xuXHRcdFx0dGhpcy5lbC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1zZXBhcmF0b3ItYm9yZGVyJywgc3R5bGVzLnNlcGFyYXRvckJvcmRlci50b1N0cmluZygpKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQWRkIGEge0BsaW5rIElWaWV3IHZpZXd9IHRvIHRoaXMge0BsaW5rIFNwbGl0Vmlld30uXG5cdCAqXG5cdCAqIEBwYXJhbSB2aWV3IFRoZSB2aWV3IHRvIGFkZC5cblx0ICogQHBhcmFtIHNpemUgRWl0aGVyIGEgZml4ZWQgc2l6ZSwgb3IgYSBkeW5hbWljIHtAbGluayBTaXppbmd9IHN0cmF0ZWd5LlxuXHQgKiBAcGFyYW0gaW5kZXggVGhlIGluZGV4IHRvIGluc2VydCB0aGUgdmlldyBvbi5cblx0ICogQHBhcmFtIHNraXBMYXlvdXQgV2hldGhlciBsYXlvdXQgc2hvdWxkIGJlIHNraXBwZWQuXG5cdCAqL1xuXHRhZGRWaWV3KHZpZXc6IFRWaWV3LCBzaXplOiBudW1iZXIgfCBTaXppbmcsIGluZGV4ID0gdGhpcy52aWV3SXRlbXMubGVuZ3RoLCBza2lwTGF5b3V0PzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuZG9BZGRWaWV3KHZpZXcsIHNpemUsIGluZGV4LCBza2lwTGF5b3V0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW1vdmUgYSB7QGxpbmsgSVZpZXcgdmlld30gZnJvbSB0aGlzIHtAbGluayBTcGxpdFZpZXd9LlxuXHQgKlxuXHQgKiBAcGFyYW0gaW5kZXggVGhlIGluZGV4IHdoZXJlIHRoZSB7QGxpbmsgSVZpZXcgdmlld30gaXMgbG9jYXRlZC5cblx0ICogQHBhcmFtIHNpemluZyBXaGV0aGVyIHRvIGRpc3RyaWJ1dGUgb3RoZXIge0BsaW5rIElWaWV3IHZpZXd9J3Mgc2l6ZXMuXG5cdCAqL1xuXHRyZW1vdmVWaWV3KGluZGV4OiBudW1iZXIsIHNpemluZz86IFNpemluZyk6IFRWaWV3IHtcblx0XHRpZiAoaW5kZXggPCAwIHx8IGluZGV4ID49IHRoaXMudmlld0l0ZW1zLmxlbmd0aCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbmRleCBvdXQgb2YgYm91bmRzJyk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc3RhdGUgIT09IFN0YXRlLklkbGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2FudCBtb2RpZnkgc3BsaXR2aWV3Jyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zdGF0ZSA9IFN0YXRlLkJ1c3k7XG5cblx0XHR0cnkge1xuXHRcdFx0aWYgKHNpemluZz8udHlwZSA9PT0gJ2F1dG8nKSB7XG5cdFx0XHRcdGlmICh0aGlzLmFyZVZpZXdzRGlzdHJpYnV0ZWQoKSkge1xuXHRcdFx0XHRcdHNpemluZyA9IHsgdHlwZTogJ2Rpc3RyaWJ1dGUnIH07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c2l6aW5nID0geyB0eXBlOiAnc3BsaXQnLCBpbmRleDogc2l6aW5nLmluZGV4IH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gU2F2ZSByZWZlcmVuZSB2aWV3LCBpbiBjYXNlIG9mIGBzcGxpdGAgc2l6aW5nXG5cdFx0XHRjb25zdCByZWZlcmVuY2VWaWV3SXRlbSA9IHNpemluZz8udHlwZSA9PT0gJ3NwbGl0JyA/IHRoaXMudmlld0l0ZW1zW3NpemluZy5pbmRleF0gOiB1bmRlZmluZWQ7XG5cblx0XHRcdC8vIFJlbW92ZSB2aWV3XG5cdFx0XHRjb25zdCB2aWV3SXRlbVRvUmVtb3ZlID0gdGhpcy52aWV3SXRlbXMuc3BsaWNlKGluZGV4LCAxKVswXTtcblxuXHRcdFx0Ly8gUmVzaXplIHJlZmVyZW5jZSB2aWV3LCBpbiBjYXNlIG9mIGBzcGxpdGAgc2l6aW5nXG5cdFx0XHRpZiAocmVmZXJlbmNlVmlld0l0ZW0pIHtcblx0XHRcdFx0cmVmZXJlbmNlVmlld0l0ZW0uc2l6ZSArPSB2aWV3SXRlbVRvUmVtb3ZlLnNpemU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlbW92ZSBzYXNoXG5cdFx0XHRpZiAodGhpcy52aWV3SXRlbXMubGVuZ3RoID49IDEpIHtcblx0XHRcdFx0Y29uc3Qgc2FzaEluZGV4ID0gTWF0aC5tYXgoaW5kZXggLSAxLCAwKTtcblx0XHRcdFx0Y29uc3Qgc2FzaEl0ZW0gPSB0aGlzLnNhc2hJdGVtcy5zcGxpY2Uoc2FzaEluZGV4LCAxKVswXTtcblx0XHRcdFx0c2FzaEl0ZW0uZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMucmVsYXlvdXQoKTtcblxuXHRcdFx0aWYgKHNpemluZz8udHlwZSA9PT0gJ2Rpc3RyaWJ1dGUnKSB7XG5cdFx0XHRcdHRoaXMuZGlzdHJpYnV0ZVZpZXdTaXplcygpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB2aWV3SXRlbVRvUmVtb3ZlLnZpZXc7XG5cdFx0XHR2aWV3SXRlbVRvUmVtb3ZlLmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5zdGF0ZSA9IFN0YXRlLklkbGU7XG5cdFx0fVxuXHR9XG5cblx0cmVtb3ZlQWxsVmlld3MoKTogVFZpZXdbXSB7XG5cdFx0aWYgKHRoaXMuc3RhdGUgIT09IFN0YXRlLklkbGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2FudCBtb2RpZnkgc3BsaXR2aWV3Jyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zdGF0ZSA9IFN0YXRlLkJ1c3k7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgdmlld0l0ZW1zID0gdGhpcy52aWV3SXRlbXMuc3BsaWNlKDAsIHRoaXMudmlld0l0ZW1zLmxlbmd0aCk7XG5cblx0XHRcdGZvciAoY29uc3Qgdmlld0l0ZW0gb2Ygdmlld0l0ZW1zKSB7XG5cdFx0XHRcdHZpZXdJdGVtLmRpc3Bvc2UoKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2FzaEl0ZW1zID0gdGhpcy5zYXNoSXRlbXMuc3BsaWNlKDAsIHRoaXMuc2FzaEl0ZW1zLmxlbmd0aCk7XG5cblx0XHRcdGZvciAoY29uc3Qgc2FzaEl0ZW0gb2Ygc2FzaEl0ZW1zKSB7XG5cdFx0XHRcdHNhc2hJdGVtLmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnJlbGF5b3V0KCk7XG5cdFx0XHRyZXR1cm4gdmlld0l0ZW1zLm1hcChpID0+IGkudmlldyk7XG5cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5zdGF0ZSA9IFN0YXRlLklkbGU7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIE1vdmUgYSB7QGxpbmsgSVZpZXcgdmlld30gdG8gYSBkaWZmZXJlbnQgaW5kZXguXG5cdCAqXG5cdCAqIEBwYXJhbSBmcm9tIFRoZSBzb3VyY2UgaW5kZXguXG5cdCAqIEBwYXJhbSB0byBUaGUgdGFyZ2V0IGluZGV4LlxuXHQgKi9cblx0bW92ZVZpZXcoZnJvbTogbnVtYmVyLCB0bzogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuc3RhdGUgIT09IFN0YXRlLklkbGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2FudCBtb2RpZnkgc3BsaXR2aWV3Jyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FjaGVkVmlzaWJsZVNpemUgPSB0aGlzLmdldFZpZXdDYWNoZWRWaXNpYmxlU2l6ZShmcm9tKTtcblx0XHRjb25zdCBzaXppbmcgPSB0eXBlb2YgY2FjaGVkVmlzaWJsZVNpemUgPT09ICd1bmRlZmluZWQnID8gdGhpcy5nZXRWaWV3U2l6ZShmcm9tKSA6IFNpemluZy5JbnZpc2libGUoY2FjaGVkVmlzaWJsZVNpemUpO1xuXHRcdGNvbnN0IHZpZXcgPSB0aGlzLnJlbW92ZVZpZXcoZnJvbSk7XG5cdFx0dGhpcy5hZGRWaWV3KHZpZXcsIHNpemluZywgdG8pO1xuXHR9XG5cblxuXHQvKipcblx0ICogU3dhcCB0d28ge0BsaW5rIElWaWV3IHZpZXdzfS5cblx0ICpcblx0ICogQHBhcmFtIGZyb20gVGhlIHNvdXJjZSBpbmRleC5cblx0ICogQHBhcmFtIHRvIFRoZSB0YXJnZXQgaW5kZXguXG5cdCAqL1xuXHRzd2FwVmlld3MoZnJvbTogbnVtYmVyLCB0bzogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuc3RhdGUgIT09IFN0YXRlLklkbGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2FudCBtb2RpZnkgc3BsaXR2aWV3Jyk7XG5cdFx0fVxuXG5cdFx0aWYgKGZyb20gPiB0bykge1xuXHRcdFx0cmV0dXJuIHRoaXMuc3dhcFZpZXdzKHRvLCBmcm9tKTtcblx0XHR9XG5cblx0XHRjb25zdCBmcm9tU2l6ZSA9IHRoaXMuZ2V0Vmlld1NpemUoZnJvbSk7XG5cdFx0Y29uc3QgdG9TaXplID0gdGhpcy5nZXRWaWV3U2l6ZSh0byk7XG5cdFx0Y29uc3QgdG9WaWV3ID0gdGhpcy5yZW1vdmVWaWV3KHRvKTtcblx0XHRjb25zdCBmcm9tVmlldyA9IHRoaXMucmVtb3ZlVmlldyhmcm9tKTtcblxuXHRcdHRoaXMuYWRkVmlldyh0b1ZpZXcsIGZyb21TaXplLCBmcm9tKTtcblx0XHR0aGlzLmFkZFZpZXcoZnJvbVZpZXcsIHRvU2l6ZSwgdG8pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgd2hldGhlciB0aGUge0BsaW5rIElWaWV3IHZpZXd9IGlzIHZpc2libGUuXG5cdCAqXG5cdCAqIEBwYXJhbSBpbmRleCBUaGUge0BsaW5rIElWaWV3IHZpZXd9IGluZGV4LlxuXHQgKi9cblx0aXNWaWV3VmlzaWJsZShpbmRleDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0aWYgKGluZGV4IDwgMCB8fCBpbmRleCA+PSB0aGlzLnZpZXdJdGVtcy5sZW5ndGgpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW5kZXggb3V0IG9mIGJvdW5kcycpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdJdGVtID0gdGhpcy52aWV3SXRlbXNbaW5kZXhdO1xuXHRcdHJldHVybiB2aWV3SXRlbS52aXNpYmxlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldCBhIHtAbGluayBJVmlldyB2aWV3fSdzIHZpc2liaWxpdHkuXG5cdCAqXG5cdCAqIEBwYXJhbSBpbmRleCBUaGUge0BsaW5rIElWaWV3IHZpZXd9IGluZGV4LlxuXHQgKiBAcGFyYW0gdmlzaWJsZSBXaGV0aGVyIHRoZSB7QGxpbmsgSVZpZXcgdmlld30gc2hvdWxkIGJlIHZpc2libGUuXG5cdCAqL1xuXHRzZXRWaWV3VmlzaWJsZShpbmRleDogbnVtYmVyLCB2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGluZGV4IDwgMCB8fCBpbmRleCA+PSB0aGlzLnZpZXdJdGVtcy5sZW5ndGgpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW5kZXggb3V0IG9mIGJvdW5kcycpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdJdGVtID0gdGhpcy52aWV3SXRlbXNbaW5kZXhdO1xuXHRcdHZpZXdJdGVtLnNldFZpc2libGUodmlzaWJsZSk7XG5cblx0XHR0aGlzLmRpc3RyaWJ1dGVFbXB0eVNwYWNlKGluZGV4KTtcblx0XHR0aGlzLmxheW91dFZpZXdzKCk7XG5cdFx0dGhpcy5zYXZlUHJvcG9ydGlvbnMoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSB7QGxpbmsgSVZpZXcgdmlld30ncyBzaXplIHByZXZpb3VzbHkgdG8gYmVpbmcgaGlkZGVuLlxuXHQgKlxuXHQgKiBAcGFyYW0gaW5kZXggVGhlIHtAbGluayBJVmlldyB2aWV3fSBpbmRleC5cblx0ICovXG5cdGdldFZpZXdDYWNoZWRWaXNpYmxlU2l6ZShpbmRleDogbnVtYmVyKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoaW5kZXggPCAwIHx8IGluZGV4ID49IHRoaXMudmlld0l0ZW1zLmxlbmd0aCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbmRleCBvdXQgb2YgYm91bmRzJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgdmlld0l0ZW0gPSB0aGlzLnZpZXdJdGVtc1tpbmRleF07XG5cdFx0cmV0dXJuIHZpZXdJdGVtLmNhY2hlZFZpc2libGVTaXplO1xuXHR9XG5cblx0LyoqXG5cdCAqIExheW91dCB0aGUge0BsaW5rIFNwbGl0Vmlld30uXG5cdCAqXG5cdCAqIEBwYXJhbSBzaXplIFRoZSBlbnRpcmUgc2l6ZSBvZiB0aGUge0BsaW5rIFNwbGl0Vmlld30uXG5cdCAqIEBwYXJhbSBsYXlvdXRDb250ZXh0IEFuIG9wdGlvbmFsIGxheW91dCBjb250ZXh0IHRvIHBhc3MgYWxvbmcgdG8ge0BsaW5rIElWaWV3IHZpZXdzfS5cblx0ICovXG5cdGxheW91dChzaXplOiBudW1iZXIsIGxheW91dENvbnRleHQ/OiBUTGF5b3V0Q29udGV4dCk6IHZvaWQge1xuXHRcdGNvbnN0IHByZXZpb3VzU2l6ZSA9IE1hdGgubWF4KHRoaXMuc2l6ZSwgdGhpcy5fY29udGVudFNpemUpO1xuXHRcdHRoaXMuc2l6ZSA9IHNpemU7XG5cdFx0dGhpcy5sYXlvdXRDb250ZXh0ID0gbGF5b3V0Q29udGV4dDtcblxuXHRcdGlmICghdGhpcy5wcm9wb3J0aW9ucykge1xuXHRcdFx0Y29uc3QgaW5kZXhlcyA9IHJhbmdlKHRoaXMudmlld0l0ZW1zLmxlbmd0aCk7XG5cdFx0XHRjb25zdCBsb3dQcmlvcml0eUluZGV4ZXMgPSBpbmRleGVzLmZpbHRlcihpID0+IHRoaXMudmlld0l0ZW1zW2ldLnByaW9yaXR5ID09PSBMYXlvdXRQcmlvcml0eS5Mb3cpO1xuXHRcdFx0Y29uc3QgaGlnaFByaW9yaXR5SW5kZXhlcyA9IGluZGV4ZXMuZmlsdGVyKGkgPT4gdGhpcy52aWV3SXRlbXNbaV0ucHJpb3JpdHkgPT09IExheW91dFByaW9yaXR5LkhpZ2gpO1xuXG5cdFx0XHR0aGlzLnJlc2l6ZSh0aGlzLnZpZXdJdGVtcy5sZW5ndGggLSAxLCBzaXplIC0gcHJldmlvdXNTaXplLCB1bmRlZmluZWQsIGxvd1ByaW9yaXR5SW5kZXhlcywgaGlnaFByaW9yaXR5SW5kZXhlcyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxldCB0b3RhbCA9IDA7XG5cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy52aWV3SXRlbXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgaXRlbSA9IHRoaXMudmlld0l0ZW1zW2ldO1xuXHRcdFx0XHRjb25zdCBwcm9wb3J0aW9uID0gdGhpcy5wcm9wb3J0aW9uc1tpXTtcblxuXHRcdFx0XHRpZiAodHlwZW9mIHByb3BvcnRpb24gPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0dG90YWwgKz0gcHJvcG9ydGlvbjtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzaXplIC09IGl0ZW0uc2l6ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMudmlld0l0ZW1zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLnZpZXdJdGVtc1tpXTtcblx0XHRcdFx0Y29uc3QgcHJvcG9ydGlvbiA9IHRoaXMucHJvcG9ydGlvbnNbaV07XG5cblx0XHRcdFx0aWYgKHR5cGVvZiBwcm9wb3J0aW9uID09PSAnbnVtYmVyJyAmJiB0b3RhbCA+IDApIHtcblx0XHRcdFx0XHRpdGVtLnNpemUgPSBjbGFtcChNYXRoLnJvdW5kKHByb3BvcnRpb24gKiBzaXplIC8gdG90YWwpLCBpdGVtLm1pbmltdW1TaXplLCBpdGVtLm1heGltdW1TaXplKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuZGlzdHJpYnV0ZUVtcHR5U3BhY2UoKTtcblx0XHR0aGlzLmxheW91dFZpZXdzKCk7XG5cdH1cblxuXHRwcml2YXRlIHNhdmVQcm9wb3J0aW9ucygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5wcm9wb3J0aW9uYWxMYXlvdXQgJiYgdGhpcy5fY29udGVudFNpemUgPiAwKSB7XG5cdFx0XHR0aGlzLnByb3BvcnRpb25zID0gdGhpcy52aWV3SXRlbXMubWFwKHYgPT4gdi5wcm9wb3J0aW9uYWxMYXlvdXQgJiYgdi52aXNpYmxlID8gdi5zaXplIC8gdGhpcy5fY29udGVudFNpemUgOiB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25TYXNoU3RhcnQoeyBzYXNoLCBzdGFydCwgYWx0IH06IElTYXNoRXZlbnQpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdGhpcy52aWV3SXRlbXMpIHtcblx0XHRcdGl0ZW0uZW5hYmxlZCA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5zYXNoSXRlbXMuZmluZEluZGV4KGl0ZW0gPT4gaXRlbS5zYXNoID09PSBzYXNoKTtcblxuXHRcdC8vIFRoaXMgd2F5LCB3ZSBjYW4gcHJlc3MgQWx0IHdoaWxlIHdlIHJlc2l6ZSBhIHNhc2gsIG1hY09TIHN0eWxlIVxuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBjb21iaW5lZERpc3Bvc2FibGUoXG5cdFx0XHRhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbC5vd25lckRvY3VtZW50LmJvZHksICdrZXlkb3duJywgZSA9PiByZXNldFNhc2hEcmFnU3RhdGUodGhpcy5zYXNoRHJhZ1N0YXRlIS5jdXJyZW50LCBlLmFsdEtleSkpLFxuXHRcdFx0YWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWwub3duZXJEb2N1bWVudC5ib2R5LCAna2V5dXAnLCAoKSA9PiByZXNldFNhc2hEcmFnU3RhdGUodGhpcy5zYXNoRHJhZ1N0YXRlIS5jdXJyZW50LCBmYWxzZSkpXG5cdFx0KTtcblxuXHRcdGNvbnN0IHJlc2V0U2FzaERyYWdTdGF0ZSA9IChzdGFydDogbnVtYmVyLCBhbHQ6IGJvb2xlYW4pID0+IHtcblx0XHRcdGNvbnN0IHNpemVzID0gdGhpcy52aWV3SXRlbXMubWFwKGkgPT4gaS5zaXplKTtcblx0XHRcdGxldCBtaW5EZWx0YSA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcblx0XHRcdGxldCBtYXhEZWx0YSA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcblxuXHRcdFx0aWYgKHRoaXMuaW52ZXJzZUFsdEJlaGF2aW9yKSB7XG5cdFx0XHRcdGFsdCA9ICFhbHQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhbHQpIHtcblx0XHRcdFx0Ly8gV2hlbiB3ZSdyZSB1c2luZyB0aGUgbGFzdCBzYXNoIHdpdGggQWx0LCB3ZSdyZSByZXNpemluZ1xuXHRcdFx0XHQvLyB0aGUgdmlldyB0byB0aGUgbGVmdC91cCwgaW5zdGVhZCBvZiByaWdodC9kb3duIGFzIHVzdWFsXG5cdFx0XHRcdC8vIFRodXMsIHdlIG11c3QgZG8gdGhlIGludmVyc2Ugb2YgdGhlIHVzdWFsXG5cdFx0XHRcdGNvbnN0IGlzTGFzdFNhc2ggPSBpbmRleCA9PT0gdGhpcy5zYXNoSXRlbXMubGVuZ3RoIC0gMTtcblxuXHRcdFx0XHRpZiAoaXNMYXN0U2FzaCkge1xuXHRcdFx0XHRcdGNvbnN0IHZpZXdJdGVtID0gdGhpcy52aWV3SXRlbXNbaW5kZXhdO1xuXHRcdFx0XHRcdG1pbkRlbHRhID0gKHZpZXdJdGVtLm1pbmltdW1TaXplIC0gdmlld0l0ZW0uc2l6ZSkgLyAyO1xuXHRcdFx0XHRcdG1heERlbHRhID0gKHZpZXdJdGVtLm1heGltdW1TaXplIC0gdmlld0l0ZW0uc2l6ZSkgLyAyO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IHZpZXdJdGVtID0gdGhpcy52aWV3SXRlbXNbaW5kZXggKyAxXTtcblx0XHRcdFx0XHRtaW5EZWx0YSA9ICh2aWV3SXRlbS5zaXplIC0gdmlld0l0ZW0ubWF4aW11bVNpemUpIC8gMjtcblx0XHRcdFx0XHRtYXhEZWx0YSA9ICh2aWV3SXRlbS5zaXplIC0gdmlld0l0ZW0ubWluaW11bVNpemUpIC8gMjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRsZXQgc25hcEJlZm9yZTogSVNhc2hEcmFnU25hcFN0YXRlIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IHNuYXBBZnRlcjogSVNhc2hEcmFnU25hcFN0YXRlIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRpZiAoIWFsdCkge1xuXHRcdFx0XHRjb25zdCB1cEluZGV4ZXMgPSByYW5nZShpbmRleCwgLTEpO1xuXHRcdFx0XHRjb25zdCBkb3duSW5kZXhlcyA9IHJhbmdlKGluZGV4ICsgMSwgdGhpcy52aWV3SXRlbXMubGVuZ3RoKTtcblx0XHRcdFx0Y29uc3QgbWluRGVsdGFVcCA9IHVwSW5kZXhlcy5yZWR1Y2UoKHIsIGkpID0+IHIgKyAodGhpcy52aWV3SXRlbXNbaV0ubWluaW11bVNpemUgLSBzaXplc1tpXSksIDApO1xuXHRcdFx0XHRjb25zdCBtYXhEZWx0YVVwID0gdXBJbmRleGVzLnJlZHVjZSgociwgaSkgPT4gciArICh0aGlzLnZpZXdJdGVtc1tpXS52aWV3TWF4aW11bVNpemUgLSBzaXplc1tpXSksIDApO1xuXHRcdFx0XHRjb25zdCBtYXhEZWx0YURvd24gPSBkb3duSW5kZXhlcy5sZW5ndGggPT09IDAgPyBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFkgOiBkb3duSW5kZXhlcy5yZWR1Y2UoKHIsIGkpID0+IHIgKyAoc2l6ZXNbaV0gLSB0aGlzLnZpZXdJdGVtc1tpXS5taW5pbXVtU2l6ZSksIDApO1xuXHRcdFx0XHRjb25zdCBtaW5EZWx0YURvd24gPSBkb3duSW5kZXhlcy5sZW5ndGggPT09IDAgPyBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFkgOiBkb3duSW5kZXhlcy5yZWR1Y2UoKHIsIGkpID0+IHIgKyAoc2l6ZXNbaV0gLSB0aGlzLnZpZXdJdGVtc1tpXS52aWV3TWF4aW11bVNpemUpLCAwKTtcblx0XHRcdFx0Y29uc3QgbWluRGVsdGEgPSBNYXRoLm1heChtaW5EZWx0YVVwLCBtaW5EZWx0YURvd24pO1xuXHRcdFx0XHRjb25zdCBtYXhEZWx0YSA9IE1hdGgubWluKG1heERlbHRhRG93biwgbWF4RGVsdGFVcCk7XG5cdFx0XHRcdGNvbnN0IHNuYXBCZWZvcmVJbmRleCA9IHRoaXMuZmluZEZpcnN0U25hcEluZGV4KHVwSW5kZXhlcyk7XG5cdFx0XHRcdGNvbnN0IHNuYXBBZnRlckluZGV4ID0gdGhpcy5maW5kRmlyc3RTbmFwSW5kZXgoZG93bkluZGV4ZXMpO1xuXG5cdFx0XHRcdGlmICh0eXBlb2Ygc25hcEJlZm9yZUluZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdGNvbnN0IHZpZXdJdGVtID0gdGhpcy52aWV3SXRlbXNbc25hcEJlZm9yZUluZGV4XTtcblx0XHRcdFx0XHRjb25zdCBoYWxmU2l6ZSA9IE1hdGguZmxvb3Iodmlld0l0ZW0udmlld01pbmltdW1TaXplIC8gMik7XG5cblx0XHRcdFx0XHRzbmFwQmVmb3JlID0ge1xuXHRcdFx0XHRcdFx0aW5kZXg6IHNuYXBCZWZvcmVJbmRleCxcblx0XHRcdFx0XHRcdGxpbWl0RGVsdGE6IHZpZXdJdGVtLnZpc2libGUgPyBtaW5EZWx0YSAtIGhhbGZTaXplIDogbWluRGVsdGEgKyBoYWxmU2l6ZSxcblx0XHRcdFx0XHRcdHNpemU6IHZpZXdJdGVtLnNpemVcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHR5cGVvZiBzbmFwQWZ0ZXJJbmRleCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRjb25zdCB2aWV3SXRlbSA9IHRoaXMudmlld0l0ZW1zW3NuYXBBZnRlckluZGV4XTtcblx0XHRcdFx0XHRjb25zdCBoYWxmU2l6ZSA9IE1hdGguZmxvb3Iodmlld0l0ZW0udmlld01pbmltdW1TaXplIC8gMik7XG5cblx0XHRcdFx0XHRzbmFwQWZ0ZXIgPSB7XG5cdFx0XHRcdFx0XHRpbmRleDogc25hcEFmdGVySW5kZXgsXG5cdFx0XHRcdFx0XHRsaW1pdERlbHRhOiB2aWV3SXRlbS52aXNpYmxlID8gbWF4RGVsdGEgKyBoYWxmU2l6ZSA6IG1heERlbHRhIC0gaGFsZlNpemUsXG5cdFx0XHRcdFx0XHRzaXplOiB2aWV3SXRlbS5zaXplXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnNhc2hEcmFnU3RhdGUgPSB7IHN0YXJ0LCBjdXJyZW50OiBzdGFydCwgaW5kZXgsIHNpemVzLCBtaW5EZWx0YSwgbWF4RGVsdGEsIGFsdCwgc25hcEJlZm9yZSwgc25hcEFmdGVyLCBkaXNwb3NhYmxlIH07XG5cdFx0fTtcblxuXHRcdHJlc2V0U2FzaERyYWdTdGF0ZShzdGFydCwgYWx0KTtcblx0fVxuXG5cdHByaXZhdGUgb25TYXNoQ2hhbmdlKHsgY3VycmVudCB9OiBJU2FzaEV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgeyBpbmRleCwgc3RhcnQsIHNpemVzLCBhbHQsIG1pbkRlbHRhLCBtYXhEZWx0YSwgc25hcEJlZm9yZSwgc25hcEFmdGVyIH0gPSB0aGlzLnNhc2hEcmFnU3RhdGUhO1xuXHRcdHRoaXMuc2FzaERyYWdTdGF0ZSEuY3VycmVudCA9IGN1cnJlbnQ7XG5cblx0XHRjb25zdCBkZWx0YSA9IGN1cnJlbnQgLSBzdGFydDtcblx0XHRjb25zdCBuZXdEZWx0YSA9IHRoaXMucmVzaXplKGluZGV4LCBkZWx0YSwgc2l6ZXMsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBtaW5EZWx0YSwgbWF4RGVsdGEsIHNuYXBCZWZvcmUsIHNuYXBBZnRlcik7XG5cblx0XHRpZiAoYWx0KSB7XG5cdFx0XHRjb25zdCBpc0xhc3RTYXNoID0gaW5kZXggPT09IHRoaXMuc2FzaEl0ZW1zLmxlbmd0aCAtIDE7XG5cdFx0XHRjb25zdCBuZXdTaXplcyA9IHRoaXMudmlld0l0ZW1zLm1hcChpID0+IGkuc2l6ZSk7XG5cdFx0XHRjb25zdCB2aWV3SXRlbUluZGV4ID0gaXNMYXN0U2FzaCA/IGluZGV4IDogaW5kZXggKyAxO1xuXHRcdFx0Y29uc3Qgdmlld0l0ZW0gPSB0aGlzLnZpZXdJdGVtc1t2aWV3SXRlbUluZGV4XTtcblx0XHRcdGNvbnN0IG5ld01pbkRlbHRhID0gdmlld0l0ZW0uc2l6ZSAtIHZpZXdJdGVtLm1heGltdW1TaXplO1xuXHRcdFx0Y29uc3QgbmV3TWF4RGVsdGEgPSB2aWV3SXRlbS5zaXplIC0gdmlld0l0ZW0ubWluaW11bVNpemU7XG5cdFx0XHRjb25zdCByZXNpemVJbmRleCA9IGlzTGFzdFNhc2ggPyBpbmRleCAtIDEgOiBpbmRleCArIDE7XG5cblx0XHRcdHRoaXMucmVzaXplKHJlc2l6ZUluZGV4LCAtbmV3RGVsdGEsIG5ld1NpemVzLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgbmV3TWluRGVsdGEsIG5ld01heERlbHRhKTtcblx0XHR9XG5cblx0XHR0aGlzLmRpc3RyaWJ1dGVFbXB0eVNwYWNlKCk7XG5cdFx0dGhpcy5sYXlvdXRWaWV3cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBvblNhc2hFbmQoaW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkU2FzaENoYW5nZS5maXJlKGluZGV4KTtcblx0XHR0aGlzLnNhc2hEcmFnU3RhdGUhLmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuc2F2ZVByb3BvcnRpb25zKCk7XG5cblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdGhpcy52aWV3SXRlbXMpIHtcblx0XHRcdGl0ZW0uZW5hYmxlZCA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblZpZXdDaGFuZ2UoaXRlbTogVmlld0l0ZW08VExheW91dENvbnRleHQsIFRWaWV3Piwgc2l6ZTogbnVtYmVyIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLnZpZXdJdGVtcy5pbmRleE9mKGl0ZW0pO1xuXG5cdFx0aWYgKGluZGV4IDwgMCB8fCBpbmRleCA+PSB0aGlzLnZpZXdJdGVtcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRzaXplID0gdHlwZW9mIHNpemUgPT09ICdudW1iZXInID8gc2l6ZSA6IGl0ZW0uc2l6ZTtcblx0XHRzaXplID0gY2xhbXAoc2l6ZSwgaXRlbS5taW5pbXVtU2l6ZSwgaXRlbS5tYXhpbXVtU2l6ZSk7XG5cblx0XHRpZiAodGhpcy5pbnZlcnNlQWx0QmVoYXZpb3IgJiYgaW5kZXggPiAwKSB7XG5cdFx0XHQvLyBJbiB0aGlzIGNhc2UsIHdlIHdhbnQgdGhlIHZpZXcgdG8gZ3JvdyBvciBzaHJpbmsgYm90aCBzaWRlcyBlcXVhbGx5XG5cdFx0XHQvLyBzbyB3ZSBqdXN0IHJlc2l6ZSB0aGUgXCJsZWZ0XCIgc2lkZSBieSBoYWxmIGFuZCBsZXQgYHJlc2l6ZWAgZG8gdGhlIGNsYW1waW5nIG1hZ2ljXG5cdFx0XHR0aGlzLnJlc2l6ZShpbmRleCAtIDEsIE1hdGguZmxvb3IoKGl0ZW0uc2l6ZSAtIHNpemUpIC8gMikpO1xuXHRcdFx0dGhpcy5kaXN0cmlidXRlRW1wdHlTcGFjZSgpO1xuXHRcdFx0dGhpcy5sYXlvdXRWaWV3cygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpdGVtLnNpemUgPSBzaXplO1xuXHRcdFx0dGhpcy5yZWxheW91dChbaW5kZXhdLCB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNpemUgYSB7QGxpbmsgSVZpZXcgdmlld30gd2l0aGluIHRoZSB7QGxpbmsgU3BsaXRWaWV3fS5cblx0ICpcblx0ICogQHBhcmFtIGluZGV4IFRoZSB7QGxpbmsgSVZpZXcgdmlld30gaW5kZXguXG5cdCAqIEBwYXJhbSBzaXplIFRoZSB7QGxpbmsgSVZpZXcgdmlld30gc2l6ZS5cblx0ICovXG5cdHJlc2l6ZVZpZXcoaW5kZXg6IG51bWJlciwgc2l6ZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKGluZGV4IDwgMCB8fCBpbmRleCA+PSB0aGlzLnZpZXdJdGVtcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5zdGF0ZSAhPT0gU3RhdGUuSWRsZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW50IG1vZGlmeSBzcGxpdHZpZXcnKTtcblx0XHR9XG5cblx0XHR0aGlzLnN0YXRlID0gU3RhdGUuQnVzeTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBpbmRleGVzID0gcmFuZ2UodGhpcy52aWV3SXRlbXMubGVuZ3RoKS5maWx0ZXIoaSA9PiBpICE9PSBpbmRleCk7XG5cdFx0XHRjb25zdCBsb3dQcmlvcml0eUluZGV4ZXMgPSBbLi4uaW5kZXhlcy5maWx0ZXIoaSA9PiB0aGlzLnZpZXdJdGVtc1tpXS5wcmlvcml0eSA9PT0gTGF5b3V0UHJpb3JpdHkuTG93KSwgaW5kZXhdO1xuXHRcdFx0Y29uc3QgaGlnaFByaW9yaXR5SW5kZXhlcyA9IGluZGV4ZXMuZmlsdGVyKGkgPT4gdGhpcy52aWV3SXRlbXNbaV0ucHJpb3JpdHkgPT09IExheW91dFByaW9yaXR5LkhpZ2gpO1xuXG5cdFx0XHRjb25zdCBpdGVtID0gdGhpcy52aWV3SXRlbXNbaW5kZXhdO1xuXHRcdFx0c2l6ZSA9IE1hdGgucm91bmQoc2l6ZSk7XG5cdFx0XHRzaXplID0gY2xhbXAoc2l6ZSwgaXRlbS5taW5pbXVtU2l6ZSwgTWF0aC5taW4oaXRlbS5tYXhpbXVtU2l6ZSwgdGhpcy5zaXplKSk7XG5cblx0XHRcdGl0ZW0uc2l6ZSA9IHNpemU7XG5cdFx0XHR0aGlzLnJlbGF5b3V0KGxvd1ByaW9yaXR5SW5kZXhlcywgaGlnaFByaW9yaXR5SW5kZXhlcyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuc3RhdGUgPSBTdGF0ZS5JZGxlO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgYWxsIG90aGVyIHtAbGluayBJVmlldyB2aWV3c30gYXJlIGF0IHRoZWlyIG1pbmltdW0gc2l6ZS5cblx0ICovXG5cdGlzVmlld0V4cGFuZGVkKGluZGV4OiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRpZiAoaW5kZXggPCAwIHx8IGluZGV4ID49IHRoaXMudmlld0l0ZW1zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiB0aGlzLnZpZXdJdGVtcykge1xuXHRcdFx0aWYgKGl0ZW0gIT09IHRoaXMudmlld0l0ZW1zW2luZGV4XSAmJiBpdGVtLnNpemUgPiBpdGVtLm1pbmltdW1TaXplKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEaXN0cmlidXRlIHRoZSBlbnRpcmUge0BsaW5rIFNwbGl0Vmlld30gc2l6ZSBhbW9uZyBhbGwge0BsaW5rIElWaWV3IHZpZXdzfS5cblx0ICovXG5cdGRpc3RyaWJ1dGVWaWV3U2l6ZXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgZmxleGlibGVWaWV3SXRlbXM6IFZpZXdJdGVtPFRMYXlvdXRDb250ZXh0LCBUVmlldz5bXSA9IFtdO1xuXHRcdGxldCBmbGV4aWJsZVNpemUgPSAwO1xuXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIHRoaXMudmlld0l0ZW1zKSB7XG5cdFx0XHRpZiAoaXRlbS5tYXhpbXVtU2l6ZSAtIGl0ZW0ubWluaW11bVNpemUgPiAwKSB7XG5cdFx0XHRcdGZsZXhpYmxlVmlld0l0ZW1zLnB1c2goaXRlbSk7XG5cdFx0XHRcdGZsZXhpYmxlU2l6ZSArPSBpdGVtLnNpemU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2l6ZSA9IE1hdGguZmxvb3IoZmxleGlibGVTaXplIC8gZmxleGlibGVWaWV3SXRlbXMubGVuZ3RoKTtcblxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBmbGV4aWJsZVZpZXdJdGVtcykge1xuXHRcdFx0aXRlbS5zaXplID0gY2xhbXAoc2l6ZSwgaXRlbS5taW5pbXVtU2l6ZSwgaXRlbS5tYXhpbXVtU2l6ZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5kZXhlcyA9IHJhbmdlKHRoaXMudmlld0l0ZW1zLmxlbmd0aCk7XG5cdFx0Y29uc3QgbG93UHJpb3JpdHlJbmRleGVzID0gaW5kZXhlcy5maWx0ZXIoaSA9PiB0aGlzLnZpZXdJdGVtc1tpXS5wcmlvcml0eSA9PT0gTGF5b3V0UHJpb3JpdHkuTG93KTtcblx0XHRjb25zdCBoaWdoUHJpb3JpdHlJbmRleGVzID0gaW5kZXhlcy5maWx0ZXIoaSA9PiB0aGlzLnZpZXdJdGVtc1tpXS5wcmlvcml0eSA9PT0gTGF5b3V0UHJpb3JpdHkuSGlnaCk7XG5cblx0XHR0aGlzLnJlbGF5b3V0KGxvd1ByaW9yaXR5SW5kZXhlcywgaGlnaFByaW9yaXR5SW5kZXhlcyk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgc2l6ZSBvZiBhIHtAbGluayBJVmlldyB2aWV3fS5cblx0ICovXG5cdGdldFZpZXdTaXplKGluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gdGhpcy52aWV3SXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMudmlld0l0ZW1zW2luZGV4XS5zaXplO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0FkZFZpZXcodmlldzogVFZpZXcsIHNpemU6IG51bWJlciB8IFNpemluZywgaW5kZXggPSB0aGlzLnZpZXdJdGVtcy5sZW5ndGgsIHNraXBMYXlvdXQ/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuc3RhdGUgIT09IFN0YXRlLklkbGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2FudCBtb2RpZnkgc3BsaXR2aWV3Jyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zdGF0ZSA9IFN0YXRlLkJ1c3k7XG5cblx0XHR0cnkge1xuXHRcdFx0Ly8gQWRkIHZpZXdcblx0XHRcdGNvbnN0IGNvbnRhaW5lciA9ICQoJy5zcGxpdC12aWV3LXZpZXcnKTtcblxuXHRcdFx0aWYgKGluZGV4ID09PSB0aGlzLnZpZXdJdGVtcy5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy52aWV3Q29udGFpbmVyLmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnZpZXdDb250YWluZXIuaW5zZXJ0QmVmb3JlKGNvbnRhaW5lciwgdGhpcy52aWV3Q29udGFpbmVyLmNoaWxkcmVuLml0ZW0oaW5kZXgpKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgb25DaGFuZ2VEaXNwb3NhYmxlID0gdmlldy5vbkRpZENoYW5nZShzaXplID0+IHRoaXMub25WaWV3Q2hhbmdlKGl0ZW0sIHNpemUpKTtcblx0XHRcdGNvbnN0IGNvbnRhaW5lckRpc3Bvc2FibGUgPSB0b0Rpc3Bvc2FibGUoKCkgPT4gY29udGFpbmVyLnJlbW92ZSgpKTtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBjb21iaW5lZERpc3Bvc2FibGUob25DaGFuZ2VEaXNwb3NhYmxlLCBjb250YWluZXJEaXNwb3NhYmxlKTtcblxuXHRcdFx0bGV0IHZpZXdTaXplOiBWaWV3SXRlbVNpemU7XG5cblx0XHRcdGlmICh0eXBlb2Ygc2l6ZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0dmlld1NpemUgPSBzaXplO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKHNpemUudHlwZSA9PT0gJ2F1dG8nKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuYXJlVmlld3NEaXN0cmlidXRlZCgpKSB7XG5cdFx0XHRcdFx0XHRzaXplID0geyB0eXBlOiAnZGlzdHJpYnV0ZScgfTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0c2l6ZSA9IHsgdHlwZTogJ3NwbGl0JywgaW5kZXg6IHNpemUuaW5kZXggfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoc2l6ZS50eXBlID09PSAnc3BsaXQnKSB7XG5cdFx0XHRcdFx0dmlld1NpemUgPSB0aGlzLmdldFZpZXdTaXplKHNpemUuaW5kZXgpIC8gMjtcblx0XHRcdFx0fSBlbHNlIGlmIChzaXplLnR5cGUgPT09ICdpbnZpc2libGUnKSB7XG5cdFx0XHRcdFx0dmlld1NpemUgPSB7IGNhY2hlZFZpc2libGVTaXplOiBzaXplLmNhY2hlZFZpc2libGVTaXplIH07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dmlld1NpemUgPSB2aWV3Lm1pbmltdW1TaXplO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5WRVJUSUNBTFxuXHRcdFx0XHQ/IG5ldyBWZXJ0aWNhbFZpZXdJdGVtKGNvbnRhaW5lciwgdmlldywgdmlld1NpemUsIGRpc3Bvc2FibGUpXG5cdFx0XHRcdDogbmV3IEhvcml6b250YWxWaWV3SXRlbShjb250YWluZXIsIHZpZXcsIHZpZXdTaXplLCBkaXNwb3NhYmxlKTtcblxuXHRcdFx0dGhpcy52aWV3SXRlbXMuc3BsaWNlKGluZGV4LCAwLCBpdGVtKTtcblxuXHRcdFx0Ly8gQWRkIHNhc2hcblx0XHRcdGlmICh0aGlzLnZpZXdJdGVtcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdGNvbnN0IG9wdHMgPSB7IG9ydGhvZ29uYWxTdGFydFNhc2g6IHRoaXMub3J0aG9nb25hbFN0YXJ0U2FzaCwgb3J0aG9nb25hbEVuZFNhc2g6IHRoaXMub3J0aG9nb25hbEVuZFNhc2ggfTtcblxuXHRcdFx0XHRjb25zdCBzYXNoID0gdGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uVkVSVElDQUxcblx0XHRcdFx0XHQ/IG5ldyBTYXNoKHRoaXMuc2FzaENvbnRhaW5lciwgeyBnZXRIb3Jpem9udGFsU2FzaFRvcDogcyA9PiB0aGlzLmdldFNhc2hQb3NpdGlvbihzKSwgZ2V0SG9yaXpvbnRhbFNhc2hXaWR0aDogdGhpcy5nZXRTYXNoT3J0aG9nb25hbFNpemUgfSwgeyAuLi5vcHRzLCBvcmllbnRhdGlvbjogT3JpZW50YXRpb24uSE9SSVpPTlRBTCB9KVxuXHRcdFx0XHRcdDogbmV3IFNhc2godGhpcy5zYXNoQ29udGFpbmVyLCB7IGdldFZlcnRpY2FsU2FzaExlZnQ6IHMgPT4gdGhpcy5nZXRTYXNoUG9zaXRpb24ocyksIGdldFZlcnRpY2FsU2FzaEhlaWdodDogdGhpcy5nZXRTYXNoT3J0aG9nb25hbFNpemUgfSwgeyAuLi5vcHRzLCBvcmllbnRhdGlvbjogT3JpZW50YXRpb24uVkVSVElDQUwgfSk7XG5cblx0XHRcdFx0Y29uc3Qgc2FzaEV2ZW50TWFwcGVyID0gdGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uVkVSVElDQUxcblx0XHRcdFx0XHQ/IChlOiBJQmFzZVNhc2hFdmVudCkgPT4gKHsgc2FzaCwgc3RhcnQ6IGUuc3RhcnRZLCBjdXJyZW50OiBlLmN1cnJlbnRZLCBhbHQ6IGUuYWx0S2V5IH0pXG5cdFx0XHRcdFx0OiAoZTogSUJhc2VTYXNoRXZlbnQpID0+ICh7IHNhc2gsIHN0YXJ0OiBlLnN0YXJ0WCwgY3VycmVudDogZS5jdXJyZW50WCwgYWx0OiBlLmFsdEtleSB9KTtcblxuXHRcdFx0XHRjb25zdCBvblN0YXJ0ID0gRXZlbnQubWFwKHNhc2gub25EaWRTdGFydCwgc2FzaEV2ZW50TWFwcGVyKTtcblx0XHRcdFx0Y29uc3Qgb25TdGFydERpc3Bvc2FibGUgPSBvblN0YXJ0KHRoaXMub25TYXNoU3RhcnQsIHRoaXMpO1xuXHRcdFx0XHRjb25zdCBvbkNoYW5nZSA9IEV2ZW50Lm1hcChzYXNoLm9uRGlkQ2hhbmdlLCBzYXNoRXZlbnRNYXBwZXIpO1xuXHRcdFx0XHRjb25zdCBvbkNoYW5nZURpc3Bvc2FibGUgPSBvbkNoYW5nZSh0aGlzLm9uU2FzaENoYW5nZSwgdGhpcyk7XG5cdFx0XHRcdGNvbnN0IG9uRW5kID0gRXZlbnQubWFwKHNhc2gub25EaWRFbmQsICgpID0+IHRoaXMuc2FzaEl0ZW1zLmZpbmRJbmRleChpdGVtID0+IGl0ZW0uc2FzaCA9PT0gc2FzaCkpO1xuXHRcdFx0XHRjb25zdCBvbkVuZERpc3Bvc2FibGUgPSBvbkVuZCh0aGlzLm9uU2FzaEVuZCwgdGhpcyk7XG5cblx0XHRcdFx0Y29uc3Qgb25EaWRSZXNldERpc3Bvc2FibGUgPSBzYXNoLm9uRGlkUmVzZXQoKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5zYXNoSXRlbXMuZmluZEluZGV4KGl0ZW0gPT4gaXRlbS5zYXNoID09PSBzYXNoKTtcblx0XHRcdFx0XHRjb25zdCB1cEluZGV4ZXMgPSByYW5nZShpbmRleCwgLTEpO1xuXHRcdFx0XHRcdGNvbnN0IGRvd25JbmRleGVzID0gcmFuZ2UoaW5kZXggKyAxLCB0aGlzLnZpZXdJdGVtcy5sZW5ndGgpO1xuXHRcdFx0XHRcdGNvbnN0IHNuYXBCZWZvcmVJbmRleCA9IHRoaXMuZmluZEZpcnN0U25hcEluZGV4KHVwSW5kZXhlcyk7XG5cdFx0XHRcdFx0Y29uc3Qgc25hcEFmdGVySW5kZXggPSB0aGlzLmZpbmRGaXJzdFNuYXBJbmRleChkb3duSW5kZXhlcyk7XG5cblx0XHRcdFx0XHRpZiAodHlwZW9mIHNuYXBCZWZvcmVJbmRleCA9PT0gJ251bWJlcicgJiYgIXRoaXMudmlld0l0ZW1zW3NuYXBCZWZvcmVJbmRleF0udmlzaWJsZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICh0eXBlb2Ygc25hcEFmdGVySW5kZXggPT09ICdudW1iZXInICYmICF0aGlzLnZpZXdJdGVtc1tzbmFwQWZ0ZXJJbmRleF0udmlzaWJsZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMuX29uRGlkU2FzaFJlc2V0LmZpcmUoaW5kZXgpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gY29tYmluZWREaXNwb3NhYmxlKG9uU3RhcnREaXNwb3NhYmxlLCBvbkNoYW5nZURpc3Bvc2FibGUsIG9uRW5kRGlzcG9zYWJsZSwgb25EaWRSZXNldERpc3Bvc2FibGUsIHNhc2gpO1xuXHRcdFx0XHRjb25zdCBzYXNoSXRlbTogSVNhc2hJdGVtID0geyBzYXNoLCBkaXNwb3NhYmxlIH07XG5cblx0XHRcdFx0dGhpcy5zYXNoSXRlbXMuc3BsaWNlKGluZGV4IC0gMSwgMCwgc2FzaEl0ZW0pO1xuXHRcdFx0fVxuXG5cdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodmlldy5lbGVtZW50KTtcblxuXHRcdFx0bGV0IGhpZ2hQcmlvcml0eUluZGV4ZXM6IG51bWJlcltdIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRpZiAodHlwZW9mIHNpemUgIT09ICdudW1iZXInICYmIHNpemUudHlwZSA9PT0gJ3NwbGl0Jykge1xuXHRcdFx0XHRoaWdoUHJpb3JpdHlJbmRleGVzID0gW3NpemUuaW5kZXhdO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXNraXBMYXlvdXQpIHtcblx0XHRcdFx0dGhpcy5yZWxheW91dChbaW5kZXhdLCBoaWdoUHJpb3JpdHlJbmRleGVzKTtcblx0XHRcdH1cblxuXG5cdFx0XHRpZiAoIXNraXBMYXlvdXQgJiYgdHlwZW9mIHNpemUgIT09ICdudW1iZXInICYmIHNpemUudHlwZSA9PT0gJ2Rpc3RyaWJ1dGUnKSB7XG5cdFx0XHRcdHRoaXMuZGlzdHJpYnV0ZVZpZXdTaXplcygpO1xuXHRcdFx0fVxuXG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuc3RhdGUgPSBTdGF0ZS5JZGxlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVsYXlvdXQobG93UHJpb3JpdHlJbmRleGVzPzogbnVtYmVyW10sIGhpZ2hQcmlvcml0eUluZGV4ZXM/OiBudW1iZXJbXSk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRlbnRTaXplID0gdGhpcy52aWV3SXRlbXMucmVkdWNlKChyLCBpKSA9PiByICsgaS5zaXplLCAwKTtcblxuXHRcdHRoaXMucmVzaXplKHRoaXMudmlld0l0ZW1zLmxlbmd0aCAtIDEsIHRoaXMuc2l6ZSAtIGNvbnRlbnRTaXplLCB1bmRlZmluZWQsIGxvd1ByaW9yaXR5SW5kZXhlcywgaGlnaFByaW9yaXR5SW5kZXhlcyk7XG5cdFx0dGhpcy5kaXN0cmlidXRlRW1wdHlTcGFjZSgpO1xuXHRcdHRoaXMubGF5b3V0Vmlld3MoKTtcblx0XHR0aGlzLnNhdmVQcm9wb3J0aW9ucygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNpemUoXG5cdFx0aW5kZXg6IG51bWJlcixcblx0XHRkZWx0YTogbnVtYmVyLFxuXHRcdHNpemVzID0gdGhpcy52aWV3SXRlbXMubWFwKGkgPT4gaS5zaXplKSxcblx0XHRsb3dQcmlvcml0eUluZGV4ZXM/OiBudW1iZXJbXSxcblx0XHRoaWdoUHJpb3JpdHlJbmRleGVzPzogbnVtYmVyW10sXG5cdFx0b3ZlcmxvYWRNaW5EZWx0YTogbnVtYmVyID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZLFxuXHRcdG92ZXJsb2FkTWF4RGVsdGE6IG51bWJlciA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSxcblx0XHRzbmFwQmVmb3JlPzogSVNhc2hEcmFnU25hcFN0YXRlLFxuXHRcdHNuYXBBZnRlcj86IElTYXNoRHJhZ1NuYXBTdGF0ZVxuXHQpOiBudW1iZXIge1xuXHRcdGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gdGhpcy52aWV3SXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cblx0XHRjb25zdCB1cEluZGV4ZXMgPSByYW5nZShpbmRleCwgLTEpO1xuXHRcdGNvbnN0IGRvd25JbmRleGVzID0gcmFuZ2UoaW5kZXggKyAxLCB0aGlzLnZpZXdJdGVtcy5sZW5ndGgpO1xuXG5cdFx0aWYgKGhpZ2hQcmlvcml0eUluZGV4ZXMpIHtcblx0XHRcdGZvciAoY29uc3QgaW5kZXggb2YgaGlnaFByaW9yaXR5SW5kZXhlcykge1xuXHRcdFx0XHRwdXNoVG9TdGFydCh1cEluZGV4ZXMsIGluZGV4KTtcblx0XHRcdFx0cHVzaFRvU3RhcnQoZG93bkluZGV4ZXMsIGluZGV4KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobG93UHJpb3JpdHlJbmRleGVzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGluZGV4IG9mIGxvd1ByaW9yaXR5SW5kZXhlcykge1xuXHRcdFx0XHRwdXNoVG9FbmQodXBJbmRleGVzLCBpbmRleCk7XG5cdFx0XHRcdHB1c2hUb0VuZChkb3duSW5kZXhlcywgaW5kZXgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHVwSXRlbXMgPSB1cEluZGV4ZXMubWFwKGkgPT4gdGhpcy52aWV3SXRlbXNbaV0pO1xuXHRcdGNvbnN0IHVwU2l6ZXMgPSB1cEluZGV4ZXMubWFwKGkgPT4gc2l6ZXNbaV0pO1xuXG5cdFx0Y29uc3QgZG93bkl0ZW1zID0gZG93bkluZGV4ZXMubWFwKGkgPT4gdGhpcy52aWV3SXRlbXNbaV0pO1xuXHRcdGNvbnN0IGRvd25TaXplcyA9IGRvd25JbmRleGVzLm1hcChpID0+IHNpemVzW2ldKTtcblxuXHRcdGNvbnN0IG1pbkRlbHRhVXAgPSB1cEluZGV4ZXMucmVkdWNlKChyLCBpKSA9PiByICsgKHRoaXMudmlld0l0ZW1zW2ldLm1pbmltdW1TaXplIC0gc2l6ZXNbaV0pLCAwKTtcblx0XHRjb25zdCBtYXhEZWx0YVVwID0gdXBJbmRleGVzLnJlZHVjZSgociwgaSkgPT4gciArICh0aGlzLnZpZXdJdGVtc1tpXS5tYXhpbXVtU2l6ZSAtIHNpemVzW2ldKSwgMCk7XG5cdFx0Y29uc3QgbWF4RGVsdGFEb3duID0gZG93bkluZGV4ZXMubGVuZ3RoID09PSAwID8gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZIDogZG93bkluZGV4ZXMucmVkdWNlKChyLCBpKSA9PiByICsgKHNpemVzW2ldIC0gdGhpcy52aWV3SXRlbXNbaV0ubWluaW11bVNpemUpLCAwKTtcblx0XHRjb25zdCBtaW5EZWx0YURvd24gPSBkb3duSW5kZXhlcy5sZW5ndGggPT09IDAgPyBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFkgOiBkb3duSW5kZXhlcy5yZWR1Y2UoKHIsIGkpID0+IHIgKyAoc2l6ZXNbaV0gLSB0aGlzLnZpZXdJdGVtc1tpXS5tYXhpbXVtU2l6ZSksIDApO1xuXHRcdGNvbnN0IG1pbkRlbHRhID0gTWF0aC5tYXgobWluRGVsdGFVcCwgbWluRGVsdGFEb3duLCBvdmVybG9hZE1pbkRlbHRhKTtcblx0XHRjb25zdCBtYXhEZWx0YSA9IE1hdGgubWluKG1heERlbHRhRG93biwgbWF4RGVsdGFVcCwgb3ZlcmxvYWRNYXhEZWx0YSk7XG5cblx0XHRsZXQgc25hcHBlZCA9IGZhbHNlO1xuXG5cdFx0aWYgKHNuYXBCZWZvcmUpIHtcblx0XHRcdGNvbnN0IHNuYXBWaWV3ID0gdGhpcy52aWV3SXRlbXNbc25hcEJlZm9yZS5pbmRleF07XG5cdFx0XHRjb25zdCB2aXNpYmxlID0gZGVsdGEgPj0gc25hcEJlZm9yZS5saW1pdERlbHRhO1xuXHRcdFx0c25hcHBlZCA9IHZpc2libGUgIT09IHNuYXBWaWV3LnZpc2libGU7XG5cdFx0XHRzbmFwVmlldy5zZXRWaXNpYmxlKHZpc2libGUsIHNuYXBCZWZvcmUuc2l6ZSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFzbmFwcGVkICYmIHNuYXBBZnRlcikge1xuXHRcdFx0Y29uc3Qgc25hcFZpZXcgPSB0aGlzLnZpZXdJdGVtc1tzbmFwQWZ0ZXIuaW5kZXhdO1xuXHRcdFx0Y29uc3QgdmlzaWJsZSA9IGRlbHRhIDwgc25hcEFmdGVyLmxpbWl0RGVsdGE7XG5cdFx0XHRzbmFwcGVkID0gdmlzaWJsZSAhPT0gc25hcFZpZXcudmlzaWJsZTtcblx0XHRcdHNuYXBWaWV3LnNldFZpc2libGUodmlzaWJsZSwgc25hcEFmdGVyLnNpemUpO1xuXHRcdH1cblxuXHRcdGlmIChzbmFwcGVkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZXNpemUoaW5kZXgsIGRlbHRhLCBzaXplcywgbG93UHJpb3JpdHlJbmRleGVzLCBoaWdoUHJpb3JpdHlJbmRleGVzLCBvdmVybG9hZE1pbkRlbHRhLCBvdmVybG9hZE1heERlbHRhKTtcblx0XHR9XG5cblx0XHRkZWx0YSA9IGNsYW1wKGRlbHRhLCBtaW5EZWx0YSwgbWF4RGVsdGEpO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGRlbHRhVXAgPSBkZWx0YTsgaSA8IHVwSXRlbXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGl0ZW0gPSB1cEl0ZW1zW2ldO1xuXHRcdFx0Y29uc3Qgc2l6ZSA9IGNsYW1wKHVwU2l6ZXNbaV0gKyBkZWx0YVVwLCBpdGVtLm1pbmltdW1TaXplLCBpdGVtLm1heGltdW1TaXplKTtcblx0XHRcdGNvbnN0IHZpZXdEZWx0YSA9IHNpemUgLSB1cFNpemVzW2ldO1xuXG5cdFx0XHRkZWx0YVVwIC09IHZpZXdEZWx0YTtcblx0XHRcdGl0ZW0uc2l6ZSA9IHNpemU7XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGRlbHRhRG93biA9IGRlbHRhOyBpIDwgZG93bkl0ZW1zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gZG93bkl0ZW1zW2ldO1xuXHRcdFx0Y29uc3Qgc2l6ZSA9IGNsYW1wKGRvd25TaXplc1tpXSAtIGRlbHRhRG93biwgaXRlbS5taW5pbXVtU2l6ZSwgaXRlbS5tYXhpbXVtU2l6ZSk7XG5cdFx0XHRjb25zdCB2aWV3RGVsdGEgPSBzaXplIC0gZG93blNpemVzW2ldO1xuXG5cdFx0XHRkZWx0YURvd24gKz0gdmlld0RlbHRhO1xuXHRcdFx0aXRlbS5zaXplID0gc2l6ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZGVsdGE7XG5cdH1cblxuXHRwcml2YXRlIGRpc3RyaWJ1dGVFbXB0eVNwYWNlKGxvd1ByaW9yaXR5SW5kZXg/OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBjb250ZW50U2l6ZSA9IHRoaXMudmlld0l0ZW1zLnJlZHVjZSgociwgaSkgPT4gciArIGkuc2l6ZSwgMCk7XG5cdFx0bGV0IGVtcHR5RGVsdGEgPSB0aGlzLnNpemUgLSBjb250ZW50U2l6ZTtcblxuXHRcdGNvbnN0IGluZGV4ZXMgPSByYW5nZSh0aGlzLnZpZXdJdGVtcy5sZW5ndGggLSAxLCAtMSk7XG5cdFx0Y29uc3QgbG93UHJpb3JpdHlJbmRleGVzID0gaW5kZXhlcy5maWx0ZXIoaSA9PiB0aGlzLnZpZXdJdGVtc1tpXS5wcmlvcml0eSA9PT0gTGF5b3V0UHJpb3JpdHkuTG93KTtcblx0XHRjb25zdCBoaWdoUHJpb3JpdHlJbmRleGVzID0gaW5kZXhlcy5maWx0ZXIoaSA9PiB0aGlzLnZpZXdJdGVtc1tpXS5wcmlvcml0eSA9PT0gTGF5b3V0UHJpb3JpdHkuSGlnaCk7XG5cblx0XHRmb3IgKGNvbnN0IGluZGV4IG9mIGhpZ2hQcmlvcml0eUluZGV4ZXMpIHtcblx0XHRcdHB1c2hUb1N0YXJ0KGluZGV4ZXMsIGluZGV4KTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGluZGV4IG9mIGxvd1ByaW9yaXR5SW5kZXhlcykge1xuXHRcdFx0cHVzaFRvRW5kKGluZGV4ZXMsIGluZGV4KTtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIGxvd1ByaW9yaXR5SW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHRwdXNoVG9FbmQoaW5kZXhlcywgbG93UHJpb3JpdHlJbmRleCk7XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGVtcHR5RGVsdGEgIT09IDAgJiYgaSA8IGluZGV4ZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLnZpZXdJdGVtc1tpbmRleGVzW2ldXTtcblx0XHRcdGNvbnN0IHNpemUgPSBjbGFtcChpdGVtLnNpemUgKyBlbXB0eURlbHRhLCBpdGVtLm1pbmltdW1TaXplLCBpdGVtLm1heGltdW1TaXplKTtcblx0XHRcdGNvbnN0IHZpZXdEZWx0YSA9IHNpemUgLSBpdGVtLnNpemU7XG5cblx0XHRcdGVtcHR5RGVsdGEgLT0gdmlld0RlbHRhO1xuXHRcdFx0aXRlbS5zaXplID0gc2l6ZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGxheW91dFZpZXdzKCk6IHZvaWQge1xuXHRcdC8vIFNhdmUgbmV3IGNvbnRlbnQgc2l6ZVxuXHRcdHRoaXMuX2NvbnRlbnRTaXplID0gdGhpcy52aWV3SXRlbXMucmVkdWNlKChyLCBpKSA9PiByICsgaS5zaXplLCAwKTtcblxuXHRcdC8vIExheW91dCB2aWV3c1xuXHRcdGxldCBvZmZzZXQgPSAwO1xuXG5cdFx0Zm9yIChjb25zdCB2aWV3SXRlbSBvZiB0aGlzLnZpZXdJdGVtcykge1xuXHRcdFx0dmlld0l0ZW0ubGF5b3V0KG9mZnNldCwgdGhpcy5sYXlvdXRDb250ZXh0KTtcblx0XHRcdG9mZnNldCArPSB2aWV3SXRlbS5zaXplO1xuXHRcdH1cblxuXHRcdC8vIExheW91dCBzYXNoZXNcblx0XHR0aGlzLnNhc2hJdGVtcy5mb3JFYWNoKGl0ZW0gPT4gaXRlbS5zYXNoLmxheW91dCgpKTtcblx0XHR0aGlzLnVwZGF0ZVNhc2hFbmFibGVtZW50KCk7XG5cdFx0dGhpcy51cGRhdGVTY3JvbGxhYmxlRWxlbWVudCgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTY3JvbGxhYmxlRWxlbWVudCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uVkVSVElDQUwpIHtcblx0XHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuc2V0U2Nyb2xsRGltZW5zaW9ucyh7XG5cdFx0XHRcdGhlaWdodDogdGhpcy5zaXplLFxuXHRcdFx0XHRzY3JvbGxIZWlnaHQ6IHRoaXMuX2NvbnRlbnRTaXplXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudC5zZXRTY3JvbGxEaW1lbnNpb25zKHtcblx0XHRcdFx0d2lkdGg6IHRoaXMuc2l6ZSxcblx0XHRcdFx0c2Nyb2xsV2lkdGg6IHRoaXMuX2NvbnRlbnRTaXplXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVNhc2hFbmFibGVtZW50KCk6IHZvaWQge1xuXHRcdGxldCBwcmV2aW91cyA9IGZhbHNlO1xuXHRcdGNvbnN0IGNvbGxhcHNlc0Rvd24gPSB0aGlzLnZpZXdJdGVtcy5tYXAoaSA9PiBwcmV2aW91cyA9IChpLnNpemUgLSBpLm1pbmltdW1TaXplID4gMCkgfHwgcHJldmlvdXMpO1xuXG5cdFx0cHJldmlvdXMgPSBmYWxzZTtcblx0XHRjb25zdCBleHBhbmRzRG93biA9IHRoaXMudmlld0l0ZW1zLm1hcChpID0+IHByZXZpb3VzID0gKGkubWF4aW11bVNpemUgLSBpLnNpemUgPiAwKSB8fCBwcmV2aW91cyk7XG5cblx0XHRjb25zdCByZXZlcnNlVmlld3MgPSBbLi4udGhpcy52aWV3SXRlbXNdLnJldmVyc2UoKTtcblx0XHRwcmV2aW91cyA9IGZhbHNlO1xuXHRcdGNvbnN0IGNvbGxhcHNlc1VwID0gcmV2ZXJzZVZpZXdzLm1hcChpID0+IHByZXZpb3VzID0gKGkuc2l6ZSAtIGkubWluaW11bVNpemUgPiAwKSB8fCBwcmV2aW91cykucmV2ZXJzZSgpO1xuXG5cdFx0cHJldmlvdXMgPSBmYWxzZTtcblx0XHRjb25zdCBleHBhbmRzVXAgPSByZXZlcnNlVmlld3MubWFwKGkgPT4gcHJldmlvdXMgPSAoaS5tYXhpbXVtU2l6ZSAtIGkuc2l6ZSA+IDApIHx8IHByZXZpb3VzKS5yZXZlcnNlKCk7XG5cblx0XHRsZXQgcG9zaXRpb24gPSAwO1xuXHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCB0aGlzLnNhc2hJdGVtcy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRcdGNvbnN0IHsgc2FzaCB9ID0gdGhpcy5zYXNoSXRlbXNbaW5kZXhdO1xuXHRcdFx0Y29uc3Qgdmlld0l0ZW0gPSB0aGlzLnZpZXdJdGVtc1tpbmRleF07XG5cdFx0XHRwb3NpdGlvbiArPSB2aWV3SXRlbS5zaXplO1xuXG5cdFx0XHRjb25zdCBtaW4gPSAhKGNvbGxhcHNlc0Rvd25baW5kZXhdICYmIGV4cGFuZHNVcFtpbmRleCArIDFdKTtcblx0XHRcdGNvbnN0IG1heCA9ICEoZXhwYW5kc0Rvd25baW5kZXhdICYmIGNvbGxhcHNlc1VwW2luZGV4ICsgMV0pO1xuXG5cdFx0XHRpZiAobWluICYmIG1heCkge1xuXHRcdFx0XHRjb25zdCB1cEluZGV4ZXMgPSByYW5nZShpbmRleCwgLTEpO1xuXHRcdFx0XHRjb25zdCBkb3duSW5kZXhlcyA9IHJhbmdlKGluZGV4ICsgMSwgdGhpcy52aWV3SXRlbXMubGVuZ3RoKTtcblx0XHRcdFx0Y29uc3Qgc25hcEJlZm9yZUluZGV4ID0gdGhpcy5maW5kRmlyc3RTbmFwSW5kZXgodXBJbmRleGVzKTtcblx0XHRcdFx0Y29uc3Qgc25hcEFmdGVySW5kZXggPSB0aGlzLmZpbmRGaXJzdFNuYXBJbmRleChkb3duSW5kZXhlcyk7XG5cblx0XHRcdFx0Y29uc3Qgc25hcHBlZEJlZm9yZSA9IHR5cGVvZiBzbmFwQmVmb3JlSW5kZXggPT09ICdudW1iZXInICYmICF0aGlzLnZpZXdJdGVtc1tzbmFwQmVmb3JlSW5kZXhdLnZpc2libGU7XG5cdFx0XHRcdGNvbnN0IHNuYXBwZWRBZnRlciA9IHR5cGVvZiBzbmFwQWZ0ZXJJbmRleCA9PT0gJ251bWJlcicgJiYgIXRoaXMudmlld0l0ZW1zW3NuYXBBZnRlckluZGV4XS52aXNpYmxlO1xuXG5cdFx0XHRcdGlmIChzbmFwcGVkQmVmb3JlICYmIGNvbGxhcHNlc1VwW2luZGV4XSAmJiAocG9zaXRpb24gPiAwIHx8IHRoaXMuc3RhcnRTbmFwcGluZ0VuYWJsZWQpKSB7XG5cdFx0XHRcdFx0c2FzaC5zdGF0ZSA9IFNhc2hTdGF0ZS5BdE1pbmltdW07XG5cdFx0XHRcdH0gZWxzZSBpZiAoc25hcHBlZEFmdGVyICYmIGNvbGxhcHNlc0Rvd25baW5kZXhdICYmIChwb3NpdGlvbiA8IHRoaXMuX2NvbnRlbnRTaXplIHx8IHRoaXMuZW5kU25hcHBpbmdFbmFibGVkKSkge1xuXHRcdFx0XHRcdHNhc2guc3RhdGUgPSBTYXNoU3RhdGUuQXRNYXhpbXVtO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNhc2guc3RhdGUgPSBTYXNoU3RhdGUuRGlzYWJsZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAobWluICYmICFtYXgpIHtcblx0XHRcdFx0c2FzaC5zdGF0ZSA9IFNhc2hTdGF0ZS5BdE1pbmltdW07XG5cdFx0XHR9IGVsc2UgaWYgKCFtaW4gJiYgbWF4KSB7XG5cdFx0XHRcdHNhc2guc3RhdGUgPSBTYXNoU3RhdGUuQXRNYXhpbXVtO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2FzaC5zdGF0ZSA9IFNhc2hTdGF0ZS5FbmFibGVkO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0U2FzaFBvc2l0aW9uKHNhc2g6IFNhc2gpOiBudW1iZXIge1xuXHRcdGxldCBwb3NpdGlvbiA9IDA7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuc2FzaEl0ZW1zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRwb3NpdGlvbiArPSB0aGlzLnZpZXdJdGVtc1tpXS5zaXplO1xuXG5cdFx0XHRpZiAodGhpcy5zYXNoSXRlbXNbaV0uc2FzaCA9PT0gc2FzaCkge1xuXHRcdFx0XHRyZXR1cm4gcG9zaXRpb247XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRwcml2YXRlIGZpbmRGaXJzdFNuYXBJbmRleChpbmRleGVzOiBudW1iZXJbXSk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gdmlzaWJsZSB2aWV3cyBmaXJzdFxuXHRcdGZvciAoY29uc3QgaW5kZXggb2YgaW5kZXhlcykge1xuXHRcdFx0Y29uc3Qgdmlld0l0ZW0gPSB0aGlzLnZpZXdJdGVtc1tpbmRleF07XG5cblx0XHRcdGlmICghdmlld0l0ZW0udmlzaWJsZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHZpZXdJdGVtLnNuYXApIHtcblx0XHRcdFx0cmV0dXJuIGluZGV4O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHRoZW4sIGhpZGRlbiB2aWV3c1xuXHRcdGZvciAoY29uc3QgaW5kZXggb2YgaW5kZXhlcykge1xuXHRcdFx0Y29uc3Qgdmlld0l0ZW0gPSB0aGlzLnZpZXdJdGVtc1tpbmRleF07XG5cblx0XHRcdGlmICh2aWV3SXRlbS52aXNpYmxlICYmIHZpZXdJdGVtLm1heGltdW1TaXplIC0gdmlld0l0ZW0ubWluaW11bVNpemUgPiAwKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdmlld0l0ZW0udmlzaWJsZSAmJiB2aWV3SXRlbS5zbmFwKSB7XG5cdFx0XHRcdHJldHVybiBpbmRleDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhcmVWaWV3c0Rpc3RyaWJ1dGVkKCkge1xuXHRcdGxldCBtaW4gPSB1bmRlZmluZWQsIG1heCA9IHVuZGVmaW5lZDtcblxuXHRcdGZvciAoY29uc3QgdmlldyBvZiB0aGlzLnZpZXdJdGVtcykge1xuXHRcdFx0bWluID0gbWluID09PSB1bmRlZmluZWQgPyB2aWV3LnNpemUgOiBNYXRoLm1pbihtaW4sIHZpZXcuc2l6ZSk7XG5cdFx0XHRtYXggPSBtYXggPT09IHVuZGVmaW5lZCA/IHZpZXcuc2l6ZSA6IE1hdGgubWF4KG1heCwgdmlldy5zaXplKTtcblxuXHRcdFx0aWYgKG1heCAtIG1pbiA+IDIpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLnNhc2hEcmFnU3RhdGU/LmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXG5cdFx0ZGlzcG9zZSh0aGlzLnZpZXdJdGVtcyk7XG5cdFx0dGhpcy52aWV3SXRlbXMgPSBbXTtcblxuXHRcdHRoaXMuc2FzaEl0ZW1zLmZvckVhY2goaSA9PiBpLmRpc3Bvc2FibGUuZGlzcG9zZSgpKTtcblx0XHR0aGlzLnNhc2hJdGVtcyA9IFtdO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLEdBQUcsdUJBQXVCLFFBQVEsV0FBVyxvQ0FBb0M7QUFDMUYsU0FBUyxrQkFBa0I7QUFDM0IsU0FBdUMsYUFBYSxNQUFNLGlCQUFpQjtBQUMzRSxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLFdBQVcsYUFBYSxhQUFhO0FBQzlDLFNBQVMsYUFBYTtBQUN0QixTQUFTLFNBQVMsYUFB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VUFBSSxTQUFTLE1BQU07QUFDbEIsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBR0EsZUFBVyxTQUFTLFNBQVM7QUFDNUIsWUFBTSxXQUFXLEtBQUssVUFBVSxLQUFLO0FBRXJDLFVBQUksU0FBUyxXQUFXLFNBQVMsY0FBYyxTQUFTLGNBQWMsR0FBRztBQUN4RSxlQUFPO0FBQUEsTUFDUjtBQUVBLFVBQUksQ0FBQyxTQUFTLFdBQVcsU0FBUyxNQUFNO0FBQ3ZDLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxzQkFBc0I7QUFDN0IsUUFBSSxNQUFNLFFBQVcsTUFBTTtBQUUzQixlQUFXLFFBQVEsS0FBSyxXQUFXO0FBQ2xDLFlBQU0sUUFBUSxTQUFZLEtBQUssT0FBTyxLQUFLLElBQUksS0FBSyxLQUFLLElBQUk7QUFDN0QsWUFBTSxRQUFRLFNBQVksS0FBSyxPQUFPLEtBQUssSUFBSSxLQUFLLEtBQUssSUFBSTtBQUU3RCxVQUFJLE1BQU0sTUFBTSxHQUFHO0FBQ2xCLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixTQUFLLGVBQWUsV0FBVyxRQUFRO0FBRXZDLFlBQVEsS0FBSyxTQUFTO0FBQ3RCLFNBQUssWUFBWSxDQUFDO0FBRWxCLFNBQUssVUFBVSxRQUFRLE9BQUssRUFBRSxXQUFXLFFBQVEsQ0FBQztBQUNsRCxTQUFLLFlBQVksQ0FBQztBQUVsQixVQUFNLFFBQVE7QUFBQSxFQUNmO0FBQ0Q7IiwKICAibmFtZXMiOiBbIk9yaWVudGF0aW9uIiwgIkxheW91dFByaW9yaXR5IiwgIlN0YXRlIiwgIlNpemluZyIsICJzdGFydCIsICJhbHQiLCAibWluRGVsdGEiLCAibWF4RGVsdGEiLCAic2l6ZSIsICJvbkNoYW5nZURpc3Bvc2FibGUiLCAiaXRlbSIsICJpbmRleCIsICJkaXNwb3NhYmxlIl0KfQo=
