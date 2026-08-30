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
import { DataTransfers } from "../../dnd.js";
import { addDisposableListener, animate, getActiveElement, getContentHeight, getContentWidth, getDocument, getTopLeftOffset, getWindow, isAncestor, isHTMLElement, isSVGElement, scheduleAtNextAnimationFrame } from "../../dom.js";
import { DomEmitter } from "../../event.js";
import { EventType as TouchEventType, Gesture } from "../../touch.js";
import { SmoothScrollableElement } from "../scrollbar/scrollableElement.js";
import { distinct, equals, splice } from "../../../common/arrays.js";
import { Delayer, disposableTimeout } from "../../../common/async.js";
import { memoize } from "../../../common/decorators.js";
import { Emitter, Event } from "../../../common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../common/lifecycle.js";
import { Range } from "../../../common/range.js";
import { Scrollable, ScrollbarVisibility } from "../../../common/scrollable.js";
import { ListDragOverEffectPosition, ListDragOverEffectType } from "./list.js";
import { RangeMap, shift } from "./rangeMap.js";
import { RowCache } from "./rowCache.js";
import { BugIndicatingError } from "../../../common/errors.js";
import { clamp } from "../../../common/numbers.js";
import { applyDragImage } from "../dnd/dnd.js";
const StaticDND = {
  CurrentDragAndDropData: void 0
};
var ListViewTargetSector = /* @__PURE__ */ ((ListViewTargetSector2) => {
  ListViewTargetSector2[ListViewTargetSector2["TOP"] = 0] = "TOP";
  ListViewTargetSector2[ListViewTargetSector2["CENTER_TOP"] = 1] = "CENTER_TOP";
  ListViewTargetSector2[ListViewTargetSector2["CENTER_BOTTOM"] = 2] = "CENTER_BOTTOM";
  ListViewTargetSector2[ListViewTargetSector2["BOTTOM"] = 3] = "BOTTOM";
  return ListViewTargetSector2;
})(ListViewTargetSector || {});
const DefaultOptions = {
  useShadows: true,
  verticalScrollMode: ScrollbarVisibility.Auto,
  setRowLineHeight: true,
  setRowHeight: true,
  supportDynamicHeights: false,
  dnd: {
    getDragElements(e) {
      return [e];
    },
    getDragURI() {
      return null;
    },
    onDragStart() {
    },
    onDragOver() {
      return false;
    },
    drop() {
    },
    dispose() {
    }
  },
  horizontalScrolling: false,
  transformOptimization: true,
  alwaysConsumeMouseWheel: true
};
class ElementsDragAndDropData {
  get context() {
    return this._context;
  }
  set context(value) {
    this._context = value;
  }
  constructor(elements) {
    this.elements = elements;
  }
  update() {
  }
  getData() {
    return this.elements;
  }
}
class ExternalElementsDragAndDropData {
  constructor(elements) {
    this.elements = elements;
  }
  update() {
  }
  getData() {
    return this.elements;
  }
}
class NativeDragAndDropData {
  constructor() {
    this.types = [];
    this.files = [];
  }
  update(dataTransfer) {
    if (dataTransfer.types) {
      this.types.splice(0, this.types.length, ...dataTransfer.types);
    }
    if (dataTransfer.files) {
      this.files.splice(0, this.files.length);
      for (let i = 0; i < dataTransfer.files.length; i++) {
        const file = dataTransfer.files.item(i);
        if (file && (file.size || file.type)) {
          this.files.push(file);
        }
      }
    }
  }
  getData() {
    return {
      types: this.types,
      files: this.files
    };
  }
}
function equalsDragFeedback(f1, f2) {
  if (Array.isArray(f1) && Array.isArray(f2)) {
    return equals(f1, f2);
  }
  return f1 === f2;
}
class ListViewAccessibilityProvider {
  constructor(accessibilityProvider) {
    if (accessibilityProvider?.getSetSize) {
      this.getSetSize = accessibilityProvider.getSetSize.bind(accessibilityProvider);
    } else {
      this.getSetSize = (e, i, l) => l;
    }
    if (accessibilityProvider?.getPosInSet) {
      this.getPosInSet = accessibilityProvider.getPosInSet.bind(accessibilityProvider);
    } else {
      this.getPosInSet = (e, i) => i + 1;
    }
    if (accessibilityProvider?.getRole) {
      this.getRole = accessibilityProvider.getRole.bind(accessibilityProvider);
    } else {
      this.getRole = (_) => "listitem";
    }
    if (accessibilityProvider?.isChecked) {
      this.isChecked = accessibilityProvider.isChecked.bind(accessibilityProvider);
    } else {
      this.isChecked = (_) => void 0;
    }
  }
}
const _ListView = class _ListView {
  constructor(container, virtualDelegate, renderers, options = DefaultOptions) {
    this.virtualDelegate = virtualDelegate;
    this.domId = `list_id_${++_ListView.InstanceCount}`;
    this.renderers = /* @__PURE__ */ new Map();
    this.renderWidth = 0;
    this._scrollHeight = 0;
    this.scrollableElementUpdateDisposable = null;
    this.scrollableElementWidthDelayer = new Delayer(50);
    this.splicing = false;
    this.dragOverAnimationStopDisposable = Disposable.None;
    this.dragOverMouseY = 0;
    this.canDrop = false;
    this.currentDragFeedbackDisposable = Disposable.None;
    this.onDragLeaveTimeout = Disposable.None;
    this.currentSelectionDisposable = Disposable.None;
    this.disposables = new DisposableStore();
    this._onDidChangeContentHeight = this.disposables.add(new Emitter());
    this._onDidChangeContentWidth = this.disposables.add(new Emitter());
    this.onDidChangeContentHeight = Event.latch(this._onDidChangeContentHeight.event, void 0, this.disposables);
    this.onDidChangeContentWidth = Event.latch(this._onDidChangeContentWidth.event, void 0, this.disposables);
    this._horizontalScrolling = false;
    if (options.horizontalScrolling && options.supportDynamicHeights) {
      throw new Error("Horizontal scrolling and dynamic heights not supported simultaneously");
    }
    this.items = [];
    this.itemId = 0;
    this.rangeMap = this.createRangeMap(options.paddingTop ?? 0);
    for (const renderer of renderers) {
      this.renderers.set(renderer.templateId, renderer);
    }
    this.cache = this.disposables.add(new RowCache(this.renderers));
    this.lastRenderTop = 0;
    this.lastRenderHeight = 0;
    this.domNode = document.createElement("div");
    this.domNode.className = "monaco-list";
    this.domNode.classList.add(this.domId);
    this.domNode.tabIndex = 0;
    this.domNode.classList.toggle("mouse-support", typeof options.mouseSupport === "boolean" ? options.mouseSupport : true);
    this._horizontalScrolling = options.horizontalScrolling ?? DefaultOptions.horizontalScrolling;
    this.domNode.classList.toggle("horizontal-scrolling", this._horizontalScrolling);
    this.paddingBottom = typeof options.paddingBottom === "undefined" ? 0 : options.paddingBottom;
    this.accessibilityProvider = new ListViewAccessibilityProvider(options.accessibilityProvider);
    this.rowsContainer = document.createElement("div");
    this.rowsContainer.className = "monaco-list-rows";
    const transformOptimization = options.transformOptimization ?? DefaultOptions.transformOptimization;
    if (transformOptimization) {
      this.rowsContainer.style.transform = "translate3d(0px, 0px, 0px)";
      this.rowsContainer.style.overflow = "hidden";
      this.rowsContainer.style.contain = "strict";
    }
    this.disposables.add(Gesture.addTarget(this.rowsContainer));
    this.scrollable = this.disposables.add(new Scrollable({
      forceIntegerValues: true,
      smoothScrollDuration: options.smoothScrolling ?? false ? 125 : 0,
      scheduleAtNextAnimationFrame: (cb) => scheduleAtNextAnimationFrame(getWindow(this.domNode), cb)
    }));
    this.scrollableElement = this.disposables.add(new SmoothScrollableElement(this.rowsContainer, {
      alwaysConsumeMouseWheel: options.alwaysConsumeMouseWheel ?? DefaultOptions.alwaysConsumeMouseWheel,
      horizontal: ScrollbarVisibility.Auto,
      vertical: options.verticalScrollMode ?? DefaultOptions.verticalScrollMode,
      useShadows: options.useShadows ?? DefaultOptions.useShadows,
      mouseWheelScrollSensitivity: options.mouseWheelScrollSensitivity,
      fastScrollSensitivity: options.fastScrollSensitivity,
      scrollByPage: options.scrollByPage
    }, this.scrollable));
    this.domNode.appendChild(this.scrollableElement.getDomNode());
    container.appendChild(this.domNode);
    this.scrollableElement.onScroll(this.onScroll, this, this.disposables);
    this.disposables.add(addDisposableListener(this.rowsContainer, TouchEventType.Change, (e) => this.onTouchChange(e)));
    this.disposables.add(addDisposableListener(this.scrollableElement.getDomNode(), "scroll", (e) => {
      const element = e.target;
      const scrollValue = element.scrollTop;
      element.scrollTop = 0;
      if (options.scrollToActiveElement) {
        this.setScrollTop(this.scrollTop + scrollValue);
      }
    }));
    this.disposables.add(addDisposableListener(this.domNode, "dragover", (e) => this.onDragOver(this.toDragEvent(e))));
    this.disposables.add(addDisposableListener(this.domNode, "drop", (e) => this.onDrop(this.toDragEvent(e))));
    this.disposables.add(addDisposableListener(this.domNode, "dragleave", (e) => this.onDragLeave(this.toDragEvent(e))));
    this.disposables.add(addDisposableListener(this.domNode, "dragend", (e) => this.onDragEnd(e)));
    if (options.userSelection) {
      if (options.dnd) {
        throw new Error("DND and user selection cannot be used simultaneously");
      }
      this.disposables.add(addDisposableListener(this.domNode, "mousedown", (e) => this.onPotentialSelectionStart(e)));
    }
    this.setRowLineHeight = options.setRowLineHeight ?? DefaultOptions.setRowLineHeight;
    this.setRowHeight = options.setRowHeight ?? DefaultOptions.setRowHeight;
    this.supportDynamicHeights = options.supportDynamicHeights ?? DefaultOptions.supportDynamicHeights;
    this.dnd = options.dnd ?? this.disposables.add(DefaultOptions.dnd);
    this.layout(options.initialSize?.height, options.initialSize?.width);
    if (options.scrollToActiveElement) {
      this._setupFocusObserver(container);
    }
  }
  get contentHeight() {
    return this.rangeMap.size;
  }
  get contentWidth() {
    return this.scrollWidth ?? 0;
  }
  get onDidScroll() {
    return this.scrollableElement.onScroll;
  }
  get onWillScroll() {
    return this.scrollableElement.onWillScroll;
  }
  get containerDomNode() {
    return this.rowsContainer;
  }
  get scrollableElementDomNode() {
    return this.scrollableElement.getDomNode();
  }
  get horizontalScrolling() {
    return this._horizontalScrolling;
  }
  set horizontalScrolling(value) {
    if (value === this._horizontalScrolling) {
      return;
    }
    if (value && this.supportDynamicHeights) {
      throw new Error("Horizontal scrolling and dynamic heights not supported simultaneously");
    }
    this._horizontalScrolling = value;
    this.domNode.classList.toggle("horizontal-scrolling", this._horizontalScrolling);
    if (this._horizontalScrolling) {
      this.measureItemWidths(this.items);
      this.updateScrollWidth();
      this.scrollableElement.setScrollDimensions({ width: getContentWidth(this.domNode) });
      this.rowsContainer.style.width = `${Math.max(this.scrollWidth || 0, this.renderWidth)}px`;
    } else {
      this.scrollableElementWidthDelayer.cancel();
      this.scrollableElement.setScrollDimensions({ width: this.renderWidth, scrollWidth: this.renderWidth });
      this.rowsContainer.style.width = "";
      this.domNode.style.removeProperty("--list-scroll-right-offset");
    }
  }
  _setupFocusObserver(container) {
    this.disposables.add(addDisposableListener(container, "focus", () => {
      const element = getActiveElement();
      if (this.activeElement !== element && element !== null) {
        this.activeElement = element;
        this._scrollToActiveElement(this.activeElement, container);
      }
    }, true));
  }
  _scrollToActiveElement(element, container) {
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const topOffset = elementRect.top - containerRect.top;
    if (topOffset < 0) {
      this.setScrollTop(this.scrollTop + topOffset);
    }
  }
  updateOptions(options) {
    if (options.paddingBottom !== void 0) {
      this.paddingBottom = options.paddingBottom;
      this.scrollableElement.setScrollDimensions({ scrollHeight: this.scrollHeight });
    }
    if (options.smoothScrolling !== void 0) {
      this.scrollable.setSmoothScrollDuration(options.smoothScrolling ? 125 : 0);
    }
    if (options.horizontalScrolling !== void 0) {
      this.horizontalScrolling = options.horizontalScrolling;
    }
    let scrollableOptions;
    if (options.scrollByPage !== void 0) {
      scrollableOptions = { ...scrollableOptions ?? {}, scrollByPage: options.scrollByPage };
    }
    if (options.mouseWheelScrollSensitivity !== void 0) {
      scrollableOptions = { ...scrollableOptions ?? {}, mouseWheelScrollSensitivity: options.mouseWheelScrollSensitivity };
    }
    if (options.fastScrollSensitivity !== void 0) {
      scrollableOptions = { ...scrollableOptions ?? {}, fastScrollSensitivity: options.fastScrollSensitivity };
    }
    if (scrollableOptions) {
      this.scrollableElement.updateOptions(scrollableOptions);
    }
    if (options.paddingTop !== void 0 && options.paddingTop !== this.rangeMap.paddingTop) {
      const lastRenderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
      const offset = options.paddingTop - this.rangeMap.paddingTop;
      this.rangeMap.paddingTop = options.paddingTop;
      this.render(lastRenderRange, Math.max(0, this.lastRenderTop + offset), this.lastRenderHeight, void 0, void 0, true);
      this.setScrollTop(this.lastRenderTop);
      this.eventuallyUpdateScrollDimensions();
      if (this.supportDynamicHeights) {
        this._rerender(this.lastRenderTop, this.lastRenderHeight);
      }
    }
  }
  delegateScrollFromMouseWheelEvent(browserEvent) {
    this.scrollableElement.delegateScrollFromMouseWheelEvent(browserEvent);
  }
  delegateVerticalScrollbarPointerDown(browserEvent) {
    this.scrollableElement.delegateVerticalScrollbarPointerDown(browserEvent);
  }
  updateElementHeight(index, size, anchorIndex) {
    if (index < 0 || index >= this.items.length) {
      return;
    }
    const originalSize = this.items[index].size;
    if (typeof size === "undefined") {
      if (!this.supportDynamicHeights) {
        console.warn("Dynamic heights not supported", new Error().stack);
        return;
      }
      this.items[index].lastDynamicHeightWidth = void 0;
      size = originalSize + this.probeDynamicHeight(index);
    }
    if (originalSize === size) {
      return;
    }
    const lastRenderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
    let heightDiff = 0;
    if (index < lastRenderRange.start) {
      heightDiff = size - originalSize;
    } else {
      if (anchorIndex !== null && anchorIndex > index && anchorIndex < lastRenderRange.end) {
        heightDiff = size - originalSize;
      } else {
        heightDiff = 0;
      }
    }
    this.rangeMap.splice(index, 1, [{ size }]);
    this.items[index].size = size;
    this.render(lastRenderRange, Math.max(0, this.lastRenderTop + heightDiff), this.lastRenderHeight, void 0, void 0, true);
    this.setScrollTop(this.lastRenderTop);
    this.eventuallyUpdateScrollDimensions();
    if (this.supportDynamicHeights) {
      this._rerender(this.lastRenderTop, this.lastRenderHeight);
    } else {
      this._onDidChangeContentHeight.fire(this.contentHeight);
    }
  }
  createRangeMap(paddingTop) {
    return new RangeMap(paddingTop);
  }
  splice(start, deleteCount, elements = []) {
    if (this.splicing) {
      throw new Error("Can't run recursive splices.");
    }
    this.splicing = true;
    try {
      return this._splice(start, deleteCount, elements);
    } finally {
      this.splicing = false;
      this._onDidChangeContentHeight.fire(this.contentHeight);
    }
  }
  _splice(start, deleteCount, elements = []) {
    const previousRenderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
    const deleteRange = { start, end: start + deleteCount };
    const removeRange = Range.intersect(previousRenderRange, deleteRange);
    const rowsToDispose = /* @__PURE__ */ new Map();
    for (let i = removeRange.end - 1; i >= removeRange.start; i--) {
      const item = this.items[i];
      item.dragStartDisposable.dispose();
      item.checkedDisposable.dispose();
      if (item.row) {
        let rows = rowsToDispose.get(item.templateId);
        if (!rows) {
          rows = [];
          rowsToDispose.set(item.templateId, rows);
        }
        const renderer = this.renderers.get(item.templateId);
        if (renderer && renderer.disposeElement) {
          renderer.disposeElement(item.element, i, item.row.templateData, { height: item.size });
        }
        rows.unshift(item.row);
      }
      item.row = null;
      item.stale = true;
    }
    const previousRestRange = { start: start + deleteCount, end: this.items.length };
    const previousRenderedRestRange = Range.intersect(previousRestRange, previousRenderRange);
    const previousUnrenderedRestRanges = Range.relativeComplement(previousRestRange, previousRenderRange);
    const inserted = elements.map((element) => ({
      id: String(this.itemId++),
      element,
      templateId: this.virtualDelegate.getTemplateId(element),
      size: this.virtualDelegate.getHeight(element),
      width: void 0,
      hasDynamicHeight: !!this.virtualDelegate.hasDynamicHeight && this.virtualDelegate.hasDynamicHeight(element),
      lastDynamicHeightWidth: void 0,
      row: null,
      uri: void 0,
      dropTarget: false,
      dragStartDisposable: Disposable.None,
      checkedDisposable: Disposable.None,
      stale: false
    }));
    let deleted;
    if (start === 0 && deleteCount >= this.items.length) {
      this.rangeMap = this.createRangeMap(this.rangeMap.paddingTop);
      this.rangeMap.splice(0, 0, inserted);
      deleted = this.items;
      this.items = inserted;
    } else {
      this.rangeMap.splice(start, deleteCount, inserted);
      deleted = splice(this.items, start, deleteCount, inserted);
    }
    const delta = elements.length - deleteCount;
    const renderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
    const renderedRestRange = shift(previousRenderedRestRange, delta);
    const updateRange = Range.intersect(renderRange, renderedRestRange);
    for (let i = updateRange.start; i < updateRange.end; i++) {
      this.updateItemInDOM(this.items[i], i);
    }
    const removeRanges = Range.relativeComplement(renderedRestRange, renderRange);
    for (const range of removeRanges) {
      for (let i = range.start; i < range.end; i++) {
        this.removeItemFromDOM(i);
      }
    }
    const unrenderedRestRanges = previousUnrenderedRestRanges.map((r) => shift(r, delta));
    const elementsRange = { start, end: start + elements.length };
    const insertRanges = [elementsRange, ...unrenderedRestRanges].map((r) => Range.intersect(renderRange, r)).reverse();
    const insertedItems = [];
    for (const range of insertRanges) {
      for (let i = range.end - 1; i >= range.start; i--) {
        const item = this.items[i];
        const rows = rowsToDispose.get(item.templateId);
        const row = rows?.pop();
        this.insertItemInDOM(i, row);
        insertedItems.push(item);
      }
    }
    for (const rows of rowsToDispose.values()) {
      for (const row of rows) {
        this.cache.release(row);
      }
    }
    if (this.horizontalScrolling && insertedItems.length > 0) {
      this.measureItemWidths(insertedItems);
      this.eventuallyUpdateScrollWidth();
    }
    this.eventuallyUpdateScrollDimensions();
    if (this.supportDynamicHeights) {
      this._rerender(this.scrollTop, this.renderHeight);
    }
    return deleted.map((i) => i.element);
  }
  eventuallyUpdateScrollDimensions() {
    this._scrollHeight = this.contentHeight;
    this.rowsContainer.style.height = `${this._scrollHeight}px`;
    if (!this.scrollableElementUpdateDisposable) {
      this.scrollableElementUpdateDisposable = scheduleAtNextAnimationFrame(getWindow(this.domNode), () => {
        this.scrollableElement.setScrollDimensions({ scrollHeight: this.scrollHeight });
        this.updateScrollWidth();
        this.scrollableElementUpdateDisposable = null;
      });
    }
  }
  eventuallyUpdateScrollWidth() {
    if (!this.horizontalScrolling) {
      this.scrollableElementWidthDelayer.cancel();
      return;
    }
    this.scrollableElementWidthDelayer.trigger(() => this.updateScrollWidth());
  }
  updateScrollWidth() {
    if (!this.horizontalScrolling) {
      return;
    }
    let scrollWidth = 0;
    for (const item of this.items) {
      if (typeof item.width !== "undefined") {
        scrollWidth = Math.max(scrollWidth, item.width);
      }
    }
    this.scrollWidth = scrollWidth;
    this.scrollableElement.setScrollDimensions({ scrollWidth: scrollWidth === 0 ? 0 : scrollWidth + 10 });
    this._onDidChangeContentWidth.fire(this.scrollWidth);
  }
  updateWidth(index) {
    if (!this.horizontalScrolling || typeof this.scrollWidth === "undefined") {
      return;
    }
    const item = this.items[index];
    this.measureItemWidths([item]);
    if (typeof item.width !== "undefined" && item.width > this.scrollWidth) {
      this.scrollWidth = item.width;
      this.scrollableElement.setScrollDimensions({ scrollWidth: this.scrollWidth + 10 });
      this._onDidChangeContentWidth.fire(this.scrollWidth);
    }
  }
  rerender() {
    if (!this.supportDynamicHeights) {
      return;
    }
    for (const item of this.items) {
      item.lastDynamicHeightWidth = void 0;
    }
    this._rerender(this.lastRenderTop, this.lastRenderHeight);
  }
  get length() {
    return this.items.length;
  }
  get renderHeight() {
    const scrollDimensions = this.scrollableElement.getScrollDimensions();
    return scrollDimensions.height;
  }
  get firstVisibleIndex() {
    const range = this.getVisibleRange(this.lastRenderTop, this.lastRenderHeight);
    return range.start;
  }
  get firstMostlyVisibleIndex() {
    const firstVisibleIndex = this.firstVisibleIndex;
    const firstElTop = this.rangeMap.positionAt(firstVisibleIndex);
    const nextElTop = this.rangeMap.positionAt(firstVisibleIndex + 1);
    if (nextElTop !== -1) {
      const firstElMidpoint = (nextElTop - firstElTop) / 2 + firstElTop;
      if (firstElMidpoint < this.scrollTop) {
        return firstVisibleIndex + 1;
      }
    }
    return firstVisibleIndex;
  }
  get lastVisibleIndex() {
    const range = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
    return range.end - 1;
  }
  element(index) {
    return this.items[index].element;
  }
  indexOf(element) {
    return this.items.findIndex((item) => item.element === element);
  }
  domElement(index) {
    const row = this.items[index].row;
    return row && row.domNode;
  }
  elementHeight(index) {
    return this.items[index].size;
  }
  elementTop(index) {
    return this.rangeMap.positionAt(index);
  }
  indexAt(position) {
    return this.rangeMap.indexAt(position);
  }
  indexAfter(position) {
    return this.rangeMap.indexAfter(position);
  }
  layout(height, width) {
    const scrollDimensions = {
      height: typeof height === "number" ? height : getContentHeight(this.domNode)
    };
    if (this.scrollableElementUpdateDisposable) {
      this.scrollableElementUpdateDisposable.dispose();
      this.scrollableElementUpdateDisposable = null;
      scrollDimensions.scrollHeight = this.scrollHeight;
    }
    this.scrollableElement.setScrollDimensions(scrollDimensions);
    if (typeof width !== "undefined") {
      this.renderWidth = width;
      if (this.supportDynamicHeights) {
        this._rerender(this.scrollTop, this.renderHeight);
      }
    }
    if (this.horizontalScrolling) {
      this.scrollableElement.setScrollDimensions({
        width: typeof width === "number" ? width : getContentWidth(this.domNode)
      });
      const scrollPos = this.scrollableElement.getScrollPosition();
      const scrollDims = this.scrollableElement.getScrollDimensions();
      const rightOffset = Math.max(0, scrollDims.scrollWidth - scrollPos.scrollLeft - this.renderWidth);
      this.domNode.style.setProperty("--list-scroll-right-offset", `${Math.max(rightOffset - 12, 0)}px`);
    }
  }
  // Render
  render(previousRenderRange, renderTop, renderHeight, renderLeft, scrollWidth, updateItemsInDOM = false, onScroll = false) {
    const renderRange = this.getRenderRange(renderTop, renderHeight);
    const rangesToInsert = Range.relativeComplement(renderRange, previousRenderRange).reverse();
    const rangesToRemove = Range.relativeComplement(previousRenderRange, renderRange);
    if (updateItemsInDOM) {
      const rangesToUpdate = Range.intersect(previousRenderRange, renderRange);
      for (let i = rangesToUpdate.start; i < rangesToUpdate.end; i++) {
        this.updateItemInDOM(this.items[i], i);
      }
    }
    const insertedItems = [];
    this.cache.transact(() => {
      for (const range of rangesToRemove) {
        for (let i = range.start; i < range.end; i++) {
          this.removeItemFromDOM(i, onScroll);
        }
      }
      for (const range of rangesToInsert) {
        for (let i = range.end - 1; i >= range.start; i--) {
          this.insertItemInDOM(i);
          insertedItems.push(this.items[i]);
        }
      }
    });
    if (this.horizontalScrolling && insertedItems.length > 0) {
      this.measureItemWidths(insertedItems);
      this.eventuallyUpdateScrollWidth();
    }
    if (renderLeft !== void 0) {
      this.rowsContainer.style.left = `-${renderLeft}px`;
    }
    this.rowsContainer.style.top = `-${renderTop}px`;
    if (this.horizontalScrolling && scrollWidth !== void 0) {
      this.rowsContainer.style.width = `${Math.max(scrollWidth, this.renderWidth)}px`;
      const rightOffset = Math.max(0, scrollWidth - (renderLeft ?? 0) - this.renderWidth);
      this.domNode.style.setProperty("--list-scroll-right-offset", `${Math.max(rightOffset - 12, 0)}px`);
    }
    this.lastRenderTop = renderTop;
    this.lastRenderHeight = renderHeight;
  }
  // DOM operations
  insertItemInDOM(index, row) {
    const item = this.items[index];
    if (!item.row) {
      if (row) {
        item.row = row;
        item.stale = true;
      } else {
        const result = this.cache.alloc(item.templateId);
        item.row = result.row;
        item.stale ||= result.isReusingConnectedDomNode;
      }
    }
    const role = this.accessibilityProvider.getRole(item.element) || "listitem";
    item.row.domNode.setAttribute("role", role);
    const checked = this.accessibilityProvider.isChecked(item.element);
    const toAriaState = (value) => value === "mixed" ? "mixed" : String(!!value);
    if (typeof checked === "boolean" || checked === "mixed") {
      item.row.domNode.setAttribute("aria-checked", toAriaState(checked));
    } else if (checked) {
      const update = (value) => item.row.domNode.setAttribute("aria-checked", toAriaState(value));
      update(checked.value);
      item.checkedDisposable = checked.onDidChange(() => update(checked.value));
    }
    if (item.stale || !item.row.domNode.parentElement) {
      const referenceNode = this.items.at(index + 1)?.row?.domNode ?? null;
      if (item.row.domNode.parentElement !== this.rowsContainer || item.row.domNode.nextElementSibling !== referenceNode) {
        this.rowsContainer.insertBefore(item.row.domNode, referenceNode);
      }
      item.stale = false;
    }
    this.updateItemInDOM(item, index);
    const renderer = this.renderers.get(item.templateId);
    if (!renderer) {
      throw new Error(`No renderer found for template id ${item.templateId}`);
    }
    renderer?.renderElement(item.element, index, item.row.templateData, { height: item.size });
    const uri = this.dnd.getDragURI(item.element);
    item.dragStartDisposable.dispose();
    item.row.domNode.draggable = !!uri;
    if (uri) {
      item.dragStartDisposable = addDisposableListener(item.row.domNode, "dragstart", (event) => this.onDragStart(item.element, uri, event));
    }
  }
  measureItemWidths(items) {
    const itemsWithRows = [];
    for (const item of items) {
      if (item.row) {
        itemsWithRows.push({ item, domNode: item.row.domNode });
      }
    }
    for (const { domNode } of itemsWithRows) {
      domNode.style.width = "fit-content";
    }
    for (const { item, domNode } of itemsWithRows) {
      item.width = getContentWidth(domNode);
      const style = getWindow(domNode).getComputedStyle(domNode);
      if (style.paddingLeft) {
        item.width += parseFloat(style.paddingLeft);
      }
      if (style.paddingRight) {
        item.width += parseFloat(style.paddingRight);
      }
    }
    for (const { domNode } of itemsWithRows) {
      domNode.style.width = "";
    }
  }
  updateItemInDOM(item, index) {
    item.row.domNode.style.top = `${this.elementTop(index)}px`;
    if (this.setRowHeight) {
      item.row.domNode.style.height = `${item.size}px`;
    }
    if (this.setRowLineHeight) {
      item.row.domNode.style.lineHeight = `${item.size}px`;
    }
    item.row.domNode.setAttribute("data-index", `${index}`);
    item.row.domNode.setAttribute("data-last-element", index === this.length - 1 ? "true" : "false");
    item.row.domNode.setAttribute("data-parity", index % 2 === 0 ? "even" : "odd");
    item.row.domNode.setAttribute("aria-setsize", String(this.accessibilityProvider.getSetSize(item.element, index, this.length)));
    item.row.domNode.setAttribute("aria-posinset", String(this.accessibilityProvider.getPosInSet(item.element, index)));
    item.row.domNode.setAttribute("id", this.getElementDomId(index));
    item.row.domNode.classList.toggle("drop-target", item.dropTarget);
  }
  removeItemFromDOM(index, onScroll) {
    const item = this.items[index];
    item.dragStartDisposable.dispose();
    item.checkedDisposable.dispose();
    if (item.row) {
      const renderer = this.renderers.get(item.templateId);
      if (renderer && renderer.disposeElement) {
        renderer.disposeElement(item.element, index, item.row.templateData, { height: item.size, onScroll });
      }
      this.cache.release(item.row);
      item.row = null;
    }
    if (this.horizontalScrolling) {
      this.eventuallyUpdateScrollWidth();
    }
  }
  getScrollTop() {
    const scrollPosition = this.scrollableElement.getScrollPosition();
    return scrollPosition.scrollTop;
  }
  setScrollTop(scrollTop, reuseAnimation) {
    if (this.scrollableElementUpdateDisposable) {
      this.scrollableElementUpdateDisposable.dispose();
      this.scrollableElementUpdateDisposable = null;
      this.scrollableElement.setScrollDimensions({ scrollHeight: this.scrollHeight });
    }
    this.scrollableElement.setScrollPosition({ scrollTop, reuseAnimation });
  }
  getScrollLeft() {
    const scrollPosition = this.scrollableElement.getScrollPosition();
    return scrollPosition.scrollLeft;
  }
  setScrollLeft(scrollLeft) {
    if (this.scrollableElementUpdateDisposable) {
      this.scrollableElementUpdateDisposable.dispose();
      this.scrollableElementUpdateDisposable = null;
      this.scrollableElement.setScrollDimensions({ scrollWidth: this.scrollWidth });
    }
    this.scrollableElement.setScrollPosition({ scrollLeft });
  }
  get scrollTop() {
    return this.getScrollTop();
  }
  set scrollTop(scrollTop) {
    this.setScrollTop(scrollTop);
  }
  get scrollHeight() {
    return this._scrollHeight + (this.horizontalScrolling ? 10 : 0) + this.paddingBottom;
  }
  get onMouseClick() {
    return Event.map(this.disposables.add(new DomEmitter(this.domNode, "click")).event, (e) => this.toMouseEvent(e), this.disposables);
  }
  get onMouseDblClick() {
    return Event.map(this.disposables.add(new DomEmitter(this.domNode, "dblclick")).event, (e) => this.toMouseEvent(e), this.disposables);
  }
  get onMouseMiddleClick() {
    return Event.filter(Event.map(this.disposables.add(new DomEmitter(this.domNode, "auxclick")).event, (e) => this.toMouseEvent(e), this.disposables), (e) => e.browserEvent.button === 1, this.disposables);
  }
  get onMouseUp() {
    return Event.map(this.disposables.add(new DomEmitter(this.domNode, "mouseup")).event, (e) => this.toMouseEvent(e), this.disposables);
  }
  get onMouseDown() {
    return Event.map(this.disposables.add(new DomEmitter(this.domNode, "mousedown")).event, (e) => this.toMouseEvent(e), this.disposables);
  }
  get onMouseOver() {
    return Event.map(this.disposables.add(new DomEmitter(this.domNode, "mouseover")).event, (e) => this.toMouseEvent(e), this.disposables);
  }
  get onMouseMove() {
    return Event.map(this.disposables.add(new DomEmitter(this.domNode, "mousemove")).event, (e) => this.toMouseEvent(e), this.disposables);
  }
  get onMouseOut() {
    return Event.map(this.disposables.add(new DomEmitter(this.domNode, "mouseout")).event, (e) => this.toMouseEvent(e), this.disposables);
  }
  get onContextMenu() {
    return Event.any(Event.map(this.disposables.add(new DomEmitter(this.domNode, "contextmenu")).event, (e) => this.toMouseEvent(e), this.disposables), Event.map(this.disposables.add(new DomEmitter(this.domNode, TouchEventType.Contextmenu)).event, (e) => this.toGestureEvent(e), this.disposables));
  }
  get onTouchStart() {
    return Event.map(this.disposables.add(new DomEmitter(this.domNode, "touchstart")).event, (e) => this.toTouchEvent(e), this.disposables);
  }
  get onTap() {
    return Event.map(this.disposables.add(new DomEmitter(this.rowsContainer, TouchEventType.Tap)).event, (e) => this.toGestureEvent(e), this.disposables);
  }
  toMouseEvent(browserEvent) {
    const index = this.getItemIndexFromEventTarget(browserEvent.target || null);
    const item = typeof index === "undefined" ? void 0 : this.items[index];
    const element = item && item.element;
    return { browserEvent, index, element };
  }
  toTouchEvent(browserEvent) {
    const index = this.getItemIndexFromEventTarget(browserEvent.target || null);
    const item = typeof index === "undefined" ? void 0 : this.items[index];
    const element = item && item.element;
    return { browserEvent, index, element };
  }
  toGestureEvent(browserEvent) {
    const index = this.getItemIndexFromEventTarget(browserEvent.initialTarget || null);
    const item = typeof index === "undefined" ? void 0 : this.items[index];
    const element = item && item.element;
    return { browserEvent, index, element };
  }
  toDragEvent(browserEvent) {
    const index = this.getItemIndexFromEventTarget(browserEvent.target || null);
    const item = typeof index === "undefined" ? void 0 : this.items[index];
    const element = item && item.element;
    const sector = this.getTargetSector(browserEvent, index);
    return { browserEvent, index, element, sector };
  }
  onScroll(e) {
    try {
      const previousRenderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
      this.render(previousRenderRange, e.scrollTop, e.height, e.scrollLeft, e.scrollWidth, void 0, true);
      if (this.supportDynamicHeights) {
        this._rerender(e.scrollTop, e.height, e.inSmoothScrolling);
      }
    } catch (err) {
      console.error("Got bad scroll event:", e);
      throw err;
    }
  }
  onTouchChange(event) {
    event.preventDefault();
    event.stopPropagation();
    this.scrollTop -= event.translationY;
  }
  // DND
  onDragStart(element, uri, event) {
    if (!event.dataTransfer) {
      return;
    }
    const elements = this.dnd.getDragElements(element);
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData(DataTransfers.TEXT, uri);
    let label;
    if (this.dnd.getDragLabel) {
      label = this.dnd.getDragLabel(elements, event);
    }
    if (typeof label === "undefined") {
      label = String(elements.length);
    }
    applyDragImage(event, this.domNode, label, [
      this.domId
      /* add domId to get list specific styling */
    ]);
    this.domNode.classList.add("dragging");
    this.currentDragData = new ElementsDragAndDropData(elements);
    StaticDND.CurrentDragAndDropData = new ExternalElementsDragAndDropData(elements);
    this.dnd.onDragStart?.(this.currentDragData, event);
  }
  onPotentialSelectionStart(e) {
    this.currentSelectionDisposable.dispose();
    const doc = getDocument(this.domNode);
    const selectionStore = this.currentSelectionDisposable = new DisposableStore();
    const movementStore = selectionStore.add(new DisposableStore());
    movementStore.add(addDisposableListener(this.domNode, "selectstart", () => {
      movementStore.add(addDisposableListener(doc, "mousemove", (e2) => {
        if (doc.getSelection()?.isCollapsed === false) {
          this.setupDragAndDropScrollTopAnimation(e2);
        }
      }));
      selectionStore.add(toDisposable(() => {
        const previousRenderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
        this.currentSelectionBounds = void 0;
        this.render(previousRenderRange, this.lastRenderTop, this.lastRenderHeight, void 0, void 0);
      }));
      selectionStore.add(addDisposableListener(doc, "selectionchange", () => {
        const selection = doc.getSelection();
        if (!selection || selection.isCollapsed) {
          if (movementStore.isDisposed) {
            selectionStore.dispose();
          }
          return;
        }
        let start = this.getIndexOfListElement(selection.anchorNode);
        let end = this.getIndexOfListElement(selection.focusNode);
        if (start !== void 0 && end !== void 0) {
          if (end < start) {
            [start, end] = [end, start];
          }
          this.currentSelectionBounds = { start, end };
        }
      }));
    }));
    movementStore.add(addDisposableListener(doc, "mouseup", () => {
      movementStore.dispose();
      this.teardownDragAndDropScrollTopAnimation();
      if (doc.getSelection()?.isCollapsed !== false) {
        selectionStore.dispose();
      }
    }));
  }
  getIndexOfListElement(element) {
    if (!element || !this.domNode.contains(element)) {
      return void 0;
    }
    while (element && element !== this.domNode) {
      if (element.dataset?.index) {
        return Number(element.dataset.index);
      }
      element = element.parentElement;
    }
    return void 0;
  }
  onDragOver(event) {
    event.browserEvent.preventDefault();
    this.onDragLeaveTimeout.dispose();
    if (StaticDND.CurrentDragAndDropData && StaticDND.CurrentDragAndDropData.getData() === "vscode-ui") {
      return false;
    }
    this.setupDragAndDropScrollTopAnimation(event.browserEvent);
    if (!event.browserEvent.dataTransfer) {
      return false;
    }
    if (!this.currentDragData) {
      if (StaticDND.CurrentDragAndDropData) {
        this.currentDragData = StaticDND.CurrentDragAndDropData;
      } else {
        if (!event.browserEvent.dataTransfer.types) {
          return false;
        }
        this.currentDragData = new NativeDragAndDropData();
      }
    }
    const result = this.dnd.onDragOver(this.currentDragData, event.element, event.index, event.sector, event.browserEvent);
    this.canDrop = typeof result === "boolean" ? result : result.accept;
    if (!this.canDrop) {
      this.currentDragFeedback = void 0;
      this.currentDragFeedbackDisposable.dispose();
      return false;
    }
    event.browserEvent.dataTransfer.dropEffect = typeof result !== "boolean" && result.effect?.type === ListDragOverEffectType.Copy ? "copy" : "move";
    let feedback;
    if (typeof result !== "boolean" && result.feedback) {
      feedback = result.feedback;
    } else {
      if (typeof event.index === "undefined") {
        feedback = [-1];
      } else {
        feedback = [event.index];
      }
    }
    feedback = distinct(feedback).filter((i) => i >= -1 && i < this.length).sort((a, b) => a - b);
    feedback = feedback[0] === -1 ? [-1] : feedback;
    let dragOverEffectPosition = typeof result !== "boolean" && result.effect && result.effect.position ? result.effect.position : ListDragOverEffectPosition.Over;
    if (equalsDragFeedback(this.currentDragFeedback, feedback) && this.currentDragFeedbackPosition === dragOverEffectPosition) {
      return true;
    }
    this.currentDragFeedback = feedback;
    this.currentDragFeedbackPosition = dragOverEffectPosition;
    this.currentDragFeedbackDisposable.dispose();
    if (feedback[0] === -1) {
      this.domNode.classList.add(dragOverEffectPosition);
      this.rowsContainer.classList.add(dragOverEffectPosition);
      this.currentDragFeedbackDisposable = toDisposable(() => {
        this.domNode.classList.remove(dragOverEffectPosition);
        this.rowsContainer.classList.remove(dragOverEffectPosition);
      });
    } else {
      if (feedback.length > 1 && dragOverEffectPosition !== ListDragOverEffectPosition.Over) {
        throw new Error("Can't use multiple feedbacks with position different than 'over'");
      }
      if (dragOverEffectPosition === ListDragOverEffectPosition.After) {
        if (feedback[0] < this.length - 1) {
          feedback[0] += 1;
          dragOverEffectPosition = ListDragOverEffectPosition.Before;
        }
      }
      for (const index of feedback) {
        const item = this.items[index];
        item.dropTarget = true;
        item.row?.domNode.classList.add(dragOverEffectPosition);
      }
      this.currentDragFeedbackDisposable = toDisposable(() => {
        for (const index of feedback) {
          const item = this.items[index];
          item.dropTarget = false;
          item.row?.domNode.classList.remove(dragOverEffectPosition);
        }
      });
    }
    return true;
  }
  onDragLeave(event) {
    this.onDragLeaveTimeout.dispose();
    this.onDragLeaveTimeout = disposableTimeout(() => this.clearDragOverFeedback(), 100, this.disposables);
    if (this.currentDragData) {
      this.dnd.onDragLeave?.(this.currentDragData, event.element, event.index, event.browserEvent);
    }
  }
  onDrop(event) {
    if (!this.canDrop) {
      return;
    }
    const dragData = this.currentDragData;
    this.teardownDragAndDropScrollTopAnimation();
    this.clearDragOverFeedback();
    this.domNode.classList.remove("dragging");
    this.currentDragData = void 0;
    StaticDND.CurrentDragAndDropData = void 0;
    if (!dragData || !event.browserEvent.dataTransfer) {
      return;
    }
    event.browserEvent.preventDefault();
    dragData.update(event.browserEvent.dataTransfer);
    this.dnd.drop(dragData, event.element, event.index, event.sector, event.browserEvent);
  }
  onDragEnd(event) {
    this.canDrop = false;
    this.teardownDragAndDropScrollTopAnimation();
    this.clearDragOverFeedback();
    this.domNode.classList.remove("dragging");
    this.currentDragData = void 0;
    StaticDND.CurrentDragAndDropData = void 0;
    this.dnd.onDragEnd?.(event);
  }
  clearDragOverFeedback() {
    this.currentDragFeedback = void 0;
    this.currentDragFeedbackPosition = void 0;
    this.currentDragFeedbackDisposable.dispose();
    this.currentDragFeedbackDisposable = Disposable.None;
  }
  // DND scroll top animation
  setupDragAndDropScrollTopAnimation(event) {
    if (!this.dragOverAnimationDisposable) {
      const viewTop = getTopLeftOffset(this.domNode).top;
      this.dragOverAnimationDisposable = animate(getWindow(this.domNode), this.animateDragAndDropScrollTop.bind(this, viewTop));
    }
    this.dragOverAnimationStopDisposable.dispose();
    this.dragOverAnimationStopDisposable = disposableTimeout(() => {
      if (this.dragOverAnimationDisposable) {
        this.dragOverAnimationDisposable.dispose();
        this.dragOverAnimationDisposable = void 0;
      }
    }, 1e3, this.disposables);
    this.dragOverMouseY = event.pageY;
  }
  animateDragAndDropScrollTop(viewTop) {
    if (this.dragOverMouseY === void 0) {
      return;
    }
    const diff = this.dragOverMouseY - viewTop;
    const upperLimit = this.renderHeight - 35;
    if (diff < 35) {
      this.scrollTop += Math.max(-14, Math.floor(0.3 * (diff - 35)));
    } else if (diff > upperLimit) {
      this.scrollTop += Math.min(14, Math.floor(0.3 * (diff - upperLimit)));
    }
  }
  teardownDragAndDropScrollTopAnimation() {
    this.dragOverAnimationStopDisposable.dispose();
    if (this.dragOverAnimationDisposable) {
      this.dragOverAnimationDisposable.dispose();
      this.dragOverAnimationDisposable = void 0;
    }
  }
  // Util
  getTargetSector(browserEvent, targetIndex) {
    if (targetIndex === void 0) {
      return void 0;
    }
    const relativePosition = browserEvent.offsetY / this.items[targetIndex].size;
    const sector = Math.floor(relativePosition / 0.25);
    return clamp(sector, 0, 3);
  }
  getItemIndexFromEventTarget(target) {
    const scrollableElement = this.scrollableElement.getDomNode();
    let element = target;
    while ((isHTMLElement(element) || isSVGElement(element)) && element !== this.rowsContainer && scrollableElement.contains(element)) {
      const rawIndex = element.getAttribute("data-index");
      if (rawIndex) {
        const index = Number(rawIndex);
        if (!isNaN(index)) {
          return index;
        }
      }
      element = element.parentElement;
    }
    return void 0;
  }
  getVisibleRange(renderTop, renderHeight) {
    return {
      start: this.rangeMap.indexAt(renderTop),
      end: this.rangeMap.indexAfter(renderTop + renderHeight - 1)
    };
  }
  getRenderRange(renderTop, renderHeight) {
    const range = this.getVisibleRange(renderTop, renderHeight);
    if (this.currentSelectionBounds) {
      const max = this.rangeMap.count;
      range.start = Math.min(range.start, this.currentSelectionBounds.start, max);
      range.end = Math.min(Math.max(range.end, this.currentSelectionBounds.end + 1), max);
    }
    return range;
  }
  /**
   * Given a stable rendered state, checks every rendered element whether it needs
   * to be probed for dynamic height. Adjusts scroll height and top if necessary.
   */
  _rerender(renderTop, renderHeight, inSmoothScrolling) {
    const previousRenderRange = this.getRenderRange(renderTop, renderHeight);
    let anchorElementIndex;
    let anchorElementTopDelta;
    if (renderTop === this.elementTop(previousRenderRange.start)) {
      anchorElementIndex = previousRenderRange.start;
      anchorElementTopDelta = 0;
    } else if (previousRenderRange.end - previousRenderRange.start > 1) {
      anchorElementIndex = previousRenderRange.start + 1;
      anchorElementTopDelta = this.elementTop(anchorElementIndex) - renderTop;
    }
    let heightDiff = 0;
    while (true) {
      const renderRange = this.getRenderRange(renderTop, renderHeight);
      let didChange = false;
      for (let i = renderRange.start; i < renderRange.end; i++) {
        const diff = this.probeDynamicHeight(i);
        if (diff !== 0) {
          this.rangeMap.splice(i, 1, [this.items[i]]);
        }
        heightDiff += diff;
        didChange = didChange || diff !== 0;
      }
      if (!didChange) {
        if (heightDiff !== 0) {
          this.eventuallyUpdateScrollDimensions();
        }
        const unrenderRanges = Range.relativeComplement(previousRenderRange, renderRange);
        for (const range of unrenderRanges) {
          for (let i = range.start; i < range.end; i++) {
            if (this.items[i].row) {
              this.removeItemFromDOM(i);
            }
          }
        }
        const renderRanges = Range.relativeComplement(renderRange, previousRenderRange).reverse();
        const insertedItems = [];
        for (const range of renderRanges) {
          for (let i = range.end - 1; i >= range.start; i--) {
            this.insertItemInDOM(i);
            insertedItems.push(this.items[i]);
          }
        }
        if (this.horizontalScrolling && insertedItems.length > 0) {
          this.measureItemWidths(insertedItems);
          this.eventuallyUpdateScrollWidth();
        }
        for (let i = renderRange.start; i < renderRange.end; i++) {
          if (this.items[i].row) {
            this.updateItemInDOM(this.items[i], i);
          }
        }
        if (typeof anchorElementIndex === "number") {
          const deltaScrollTop = this.scrollable.getFutureScrollPosition().scrollTop - renderTop;
          const newScrollTop = this.elementTop(anchorElementIndex) - anchorElementTopDelta + deltaScrollTop;
          this.setScrollTop(newScrollTop, inSmoothScrolling);
        }
        this._onDidChangeContentHeight.fire(this.contentHeight);
        return;
      }
    }
  }
  probeDynamicHeight(index) {
    const item = this.items[index];
    return this.probeDynamicHeightForItem(item, index);
  }
  probeDynamicHeightForItem(item, index) {
    if (!!this.virtualDelegate.getDynamicHeight) {
      const newSize = this.virtualDelegate.getDynamicHeight(item.element);
      if (newSize !== null) {
        const size2 = item.size;
        item.size = newSize;
        item.lastDynamicHeightWidth = this.renderWidth;
        this.publishDynamicHeight(item);
        return newSize - size2;
      }
    }
    if (!item.hasDynamicHeight || item.lastDynamicHeightWidth === this.renderWidth) {
      return 0;
    }
    if (!!this.virtualDelegate.hasDynamicHeight && !this.virtualDelegate.hasDynamicHeight(item.element)) {
      return 0;
    }
    const size = item.size;
    if (item.row) {
      item.row.domNode.style.height = "";
      item.size = item.row.domNode.offsetHeight;
      if (item.size === 0) {
        if (!isAncestor(item.row.domNode, getWindow(item.row.domNode).document.body)) {
          console.warn("Measuring item node that is not in DOM! Add ListView to the DOM before measuring row height!", new Error().stack);
        } else {
          console.warn("Measured item node at 0px- ensure that ListView is not display:none before measuring row height!", new Error().stack);
        }
      }
      item.lastDynamicHeightWidth = this.renderWidth;
      this.publishDynamicHeight(item);
      return item.size - size;
    }
    const { row } = this.cache.alloc(item.templateId);
    row.domNode.style.height = "";
    this.rowsContainer.appendChild(row.domNode);
    const renderer = this.renderers.get(item.templateId);
    if (!renderer) {
      throw new BugIndicatingError("Missing renderer for templateId: " + item.templateId);
    }
    renderer.renderElement(item.element, index, row.templateData);
    item.size = row.domNode.offsetHeight;
    renderer.disposeElement?.(item.element, index, row.templateData);
    item.lastDynamicHeightWidth = this.renderWidth;
    this.publishDynamicHeight(item);
    row.domNode.remove();
    this.cache.release(row);
    return item.size - size;
  }
  publishDynamicHeight(item) {
    if (item.size > 0) {
      this.virtualDelegate.setDynamicHeight?.(item.element, item.size);
    }
  }
  getElementDomId(index) {
    return `${this.domId}_${index}`;
  }
  // Dispose
  dispose() {
    for (const item of this.items) {
      item.dragStartDisposable.dispose();
      item.checkedDisposable.dispose();
      if (item.row) {
        const renderer = this.renderers.get(item.row.templateId);
        if (renderer) {
          renderer.disposeElement?.(item.element, -1, item.row.templateData, void 0);
          renderer.disposeTemplate(item.row.templateData);
        }
      }
    }
    this.items = [];
    this.domNode?.remove();
    this.dragOverAnimationDisposable?.dispose();
    this.disposables.dispose();
  }
};
_ListView.InstanceCount = 0;
__decorateClass([
  memoize
], _ListView.prototype, "onMouseClick", 1);
__decorateClass([
  memoize
], _ListView.prototype, "onMouseDblClick", 1);
__decorateClass([
  memoize
], _ListView.prototype, "onMouseMiddleClick", 1);
__decorateClass([
  memoize
], _ListView.prototype, "onMouseUp", 1);
__decorateClass([
  memoize
], _ListView.prototype, "onMouseDown", 1);
__decorateClass([
  memoize
], _ListView.prototype, "onMouseOver", 1);
__decorateClass([
  memoize
], _ListView.prototype, "onMouseMove", 1);
__decorateClass([
  memoize
], _ListView.prototype, "onMouseOut", 1);
__decorateClass([
  memoize
], _ListView.prototype, "onContextMenu", 1);
__decorateClass([
  memoize
], _ListView.prototype, "onTouchStart", 1);
__decorateClass([
  memoize
], _ListView.prototype, "onTap", 1);
let ListView = _ListView;
export {
  ElementsDragAndDropData,
  ExternalElementsDragAndDropData,
  ListView,
  ListViewTargetSector,
  NativeDragAndDropData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFx1aVxcbGlzdFxcbGlzdFZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEYXRhVHJhbnNmZXJzLCBJRHJhZ0FuZERyb3BEYXRhIH0gZnJvbSAnLi4vLi4vZG5kLmpzJztcbmltcG9ydCB7IGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgYW5pbWF0ZSwgRGltZW5zaW9uLCBnZXRBY3RpdmVFbGVtZW50LCBnZXRDb250ZW50SGVpZ2h0LCBnZXRDb250ZW50V2lkdGgsIGdldERvY3VtZW50LCBnZXRUb3BMZWZ0T2Zmc2V0LCBnZXRXaW5kb3csIGlzQW5jZXN0b3IsIGlzSFRNTEVsZW1lbnQsIGlzU1ZHRWxlbWVudCwgc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZSB9IGZyb20gJy4uLy4uL2RvbS5qcyc7XG5pbXBvcnQgeyBEb21FbWl0dGVyIH0gZnJvbSAnLi4vLi4vZXZlbnQuanMnO1xuaW1wb3J0IHsgSU1vdXNlV2hlZWxFdmVudCB9IGZyb20gJy4uLy4uL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgRXZlbnRUeXBlIGFzIFRvdWNoRXZlbnRUeXBlLCBHZXN0dXJlLCBHZXN0dXJlRXZlbnQgfSBmcm9tICcuLi8uLi90b3VjaC5qcyc7XG5pbXBvcnQgeyBTbW9vdGhTY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBkaXN0aW5jdCwgZXF1YWxzLCBzcGxpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IERlbGF5ZXIsIGRpc3Bvc2FibGVUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IG1lbW9pemUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCwgSVZhbHVlV2l0aENoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJTmV3U2Nyb2xsRGltZW5zaW9ucywgU2Nyb2xsYWJsZSwgU2Nyb2xsYmFyVmlzaWJpbGl0eSwgU2Nyb2xsRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgeyBJU3BsaWNlYWJsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXF1ZW5jZS5qcyc7XG5pbXBvcnQgeyBJTGlzdERyYWdBbmREcm9wLCBJTGlzdERyYWdFdmVudCwgSUxpc3RHZXN0dXJlRXZlbnQsIElMaXN0TW91c2VFdmVudCwgSUxpc3RSZW5kZXJlciwgSUxpc3RUb3VjaEV2ZW50LCBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSwgTGlzdERyYWdPdmVyRWZmZWN0UG9zaXRpb24sIExpc3REcmFnT3ZlckVmZmVjdFR5cGUgfSBmcm9tICcuL2xpc3QuanMnO1xuaW1wb3J0IHsgSVJhbmdlTWFwLCBSYW5nZU1hcCwgc2hpZnQgfSBmcm9tICcuL3JhbmdlTWFwLmpzJztcbmltcG9ydCB7IElSb3csIFJvd0NhY2hlIH0gZnJvbSAnLi9yb3dDYWNoZS5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEFyaWFSb2xlIH0gZnJvbSAnLi4vYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IFNjcm9sbGFibGVFbGVtZW50Q2hhbmdlT3B0aW9ucyB9IGZyb20gJy4uL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudE9wdGlvbnMuanMnO1xuaW1wb3J0IHsgY2xhbXAgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbnVtYmVycy5qcyc7XG5pbXBvcnQgeyBhcHBseURyYWdJbWFnZSB9IGZyb20gJy4uL2RuZC9kbmQuanMnO1xuXG5pbnRlcmZhY2UgSUl0ZW08VD4ge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBlbGVtZW50OiBUO1xuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmc7XG5cdHJvdzogSVJvdyB8IG51bGw7XG5cdHNpemU6IG51bWJlcjtcblx0d2lkdGg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0aGFzRHluYW1pY0hlaWdodDogYm9vbGVhbjtcblx0bGFzdER5bmFtaWNIZWlnaHRXaWR0aDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHR1cmk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0ZHJvcFRhcmdldDogYm9vbGVhbjtcblx0ZHJhZ1N0YXJ0RGlzcG9zYWJsZTogSURpc3Bvc2FibGU7XG5cdGNoZWNrZWREaXNwb3NhYmxlOiBJRGlzcG9zYWJsZTtcblx0c3RhbGU6IGJvb2xlYW47XG59XG5cbmNvbnN0IFN0YXRpY0RORCA9IHtcblx0Q3VycmVudERyYWdBbmREcm9wRGF0YTogdW5kZWZpbmVkIGFzIElEcmFnQW5kRHJvcERhdGEgfCB1bmRlZmluZWRcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxpc3RWaWV3RHJhZ0FuZERyb3A8VD4gZXh0ZW5kcyBJTGlzdERyYWdBbmREcm9wPFQ+IHtcblx0Z2V0RHJhZ0VsZW1lbnRzKGVsZW1lbnQ6IFQpOiBUW107XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIExpc3RWaWV3VGFyZ2V0U2VjdG9yIHtcblx0Ly8gZHJvcCBwb3NpdGlvbiByZWxhdGl2ZSB0byB0aGUgdG9wIG9mIHRoZSBpdGVtXG5cdFRPUCA9IDAsIFx0XHRcdFx0Ly8gWzAlLTI1JSlcblx0Q0VOVEVSX1RPUCA9IDEsIFx0XHQvLyBbMjUlLTUwJSlcblx0Q0VOVEVSX0JPVFRPTSA9IDIsIFx0XHQvLyBbNTAlLTc1JSlcblx0Qk9UVE9NID0gM1x0XHRcdFx0Ly8gWzc1JS0xMDAlKVxufVxuXG5leHBvcnQgdHlwZSBDaGVja0JveEFjY2Vzc2libGVTdGF0ZSA9IGJvb2xlYW4gfCAnbWl4ZWQnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElMaXN0Vmlld0FjY2Vzc2liaWxpdHlQcm92aWRlcjxUPiB7XG5cdGdldFNldFNpemU/KGVsZW1lbnQ6IFQsIGluZGV4OiBudW1iZXIsIGxpc3RMZW5ndGg6IG51bWJlcik6IG51bWJlcjtcblx0Z2V0UG9zSW5TZXQ/KGVsZW1lbnQ6IFQsIGluZGV4OiBudW1iZXIpOiBudW1iZXI7XG5cdGdldFJvbGU/KGVsZW1lbnQ6IFQpOiBBcmlhUm9sZSB8IHVuZGVmaW5lZDtcblx0aXNDaGVja2VkPyhlbGVtZW50OiBUKTogQ2hlY2tCb3hBY2Nlc3NpYmxlU3RhdGUgfCBJVmFsdWVXaXRoQ2hhbmdlRXZlbnQ8Q2hlY2tCb3hBY2Nlc3NpYmxlU3RhdGU+IHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElMaXN0Vmlld09wdGlvbnNVcGRhdGUge1xuXHRyZWFkb25seSBzbW9vdGhTY3JvbGxpbmc/OiBib29sZWFuO1xuXHRyZWFkb25seSBob3Jpem9udGFsU2Nyb2xsaW5nPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc2Nyb2xsQnlQYWdlPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgbW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5PzogbnVtYmVyO1xuXHRyZWFkb25seSBmYXN0U2Nyb2xsU2Vuc2l0aXZpdHk/OiBudW1iZXI7XG5cdHJlYWRvbmx5IHBhZGRpbmdUb3A/OiBudW1iZXI7XG5cdHJlYWRvbmx5IHBhZGRpbmdCb3R0b20/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxpc3RWaWV3T3B0aW9uczxUPiBleHRlbmRzIElMaXN0Vmlld09wdGlvbnNVcGRhdGUge1xuXHRyZWFkb25seSBkbmQ/OiBJTGlzdFZpZXdEcmFnQW5kRHJvcDxUPjtcblx0cmVhZG9ubHkgdXNlU2hhZG93cz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHZlcnRpY2FsU2Nyb2xsTW9kZT86IFNjcm9sbGJhclZpc2liaWxpdHk7XG5cdHJlYWRvbmx5IHNldFJvd0xpbmVIZWlnaHQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBzZXRSb3dIZWlnaHQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBzdXBwb3J0RHluYW1pY0hlaWdodHM/OiBib29sZWFuO1xuXHRyZWFkb25seSBtb3VzZVN1cHBvcnQ/OiBib29sZWFuO1xuXHRyZWFkb25seSB1c2VyU2VsZWN0aW9uPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgYWNjZXNzaWJpbGl0eVByb3ZpZGVyPzogSUxpc3RWaWV3QWNjZXNzaWJpbGl0eVByb3ZpZGVyPFQ+O1xuXHRyZWFkb25seSB0cmFuc2Zvcm1PcHRpbWl6YXRpb24/OiBib29sZWFuO1xuXHRyZWFkb25seSBhbHdheXNDb25zdW1lTW91c2VXaGVlbD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGluaXRpYWxTaXplPzogRGltZW5zaW9uO1xuXHRyZWFkb25seSBzY3JvbGxUb0FjdGl2ZUVsZW1lbnQ/OiBib29sZWFuO1xufVxuXG5jb25zdCBEZWZhdWx0T3B0aW9ucyA9IHtcblx0dXNlU2hhZG93czogdHJ1ZSxcblx0dmVydGljYWxTY3JvbGxNb2RlOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG8sXG5cdHNldFJvd0xpbmVIZWlnaHQ6IHRydWUsXG5cdHNldFJvd0hlaWdodDogdHJ1ZSxcblx0c3VwcG9ydER5bmFtaWNIZWlnaHRzOiBmYWxzZSxcblx0ZG5kOiB7XG5cdFx0Z2V0RHJhZ0VsZW1lbnRzPFQ+KGU6IFQpIHsgcmV0dXJuIFtlXTsgfSxcblx0XHRnZXREcmFnVVJJKCkgeyByZXR1cm4gbnVsbDsgfSxcblx0XHRvbkRyYWdTdGFydCgpOiB2b2lkIHsgfSxcblx0XHRvbkRyYWdPdmVyKCkgeyByZXR1cm4gZmFsc2U7IH0sXG5cdFx0ZHJvcCgpIHsgfSxcblx0XHRkaXNwb3NlKCkgeyB9XG5cdH0sXG5cdGhvcml6b250YWxTY3JvbGxpbmc6IGZhbHNlLFxuXHR0cmFuc2Zvcm1PcHRpbWl6YXRpb246IHRydWUsXG5cdGFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsOiB0cnVlLFxufSBzYXRpc2ZpZXMgSUxpc3RWaWV3T3B0aW9uczxhbnk+O1xuXG5leHBvcnQgY2xhc3MgRWxlbWVudHNEcmFnQW5kRHJvcERhdGE8VCwgVENvbnRleHQgPSB2b2lkPiBpbXBsZW1lbnRzIElEcmFnQW5kRHJvcERhdGEge1xuXG5cdHJlYWRvbmx5IGVsZW1lbnRzOiBUW107XG5cblx0cHJpdmF0ZSBfY29udGV4dDogVENvbnRleHQgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBnZXQgY29udGV4dCgpOiBUQ29udGV4dCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRleHQ7XG5cdH1cblx0cHVibGljIHNldCBjb250ZXh0KHZhbHVlOiBUQ29udGV4dCB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX2NvbnRleHQgPSB2YWx1ZTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKGVsZW1lbnRzOiBUW10pIHtcblx0XHR0aGlzLmVsZW1lbnRzID0gZWxlbWVudHM7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7IH1cblxuXHRnZXREYXRhKCk6IFRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZWxlbWVudHM7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVybmFsRWxlbWVudHNEcmFnQW5kRHJvcERhdGE8VD4gaW1wbGVtZW50cyBJRHJhZ0FuZERyb3BEYXRhIHtcblxuXHRyZWFkb25seSBlbGVtZW50czogVFtdO1xuXG5cdGNvbnN0cnVjdG9yKGVsZW1lbnRzOiBUW10pIHtcblx0XHR0aGlzLmVsZW1lbnRzID0gZWxlbWVudHM7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7IH1cblxuXHRnZXREYXRhKCk6IFRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZWxlbWVudHM7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5hdGl2ZURyYWdBbmREcm9wRGF0YSBpbXBsZW1lbnRzIElEcmFnQW5kRHJvcERhdGEge1xuXG5cdHJlYWRvbmx5IHR5cGVzOiB1bmtub3duW107XG5cdHJlYWRvbmx5IGZpbGVzOiB1bmtub3duW107XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy50eXBlcyA9IFtdO1xuXHRcdHRoaXMuZmlsZXMgPSBbXTtcblx0fVxuXG5cdHVwZGF0ZShkYXRhVHJhbnNmZXI6IERhdGFUcmFuc2Zlcik6IHZvaWQge1xuXHRcdGlmIChkYXRhVHJhbnNmZXIudHlwZXMpIHtcblx0XHRcdHRoaXMudHlwZXMuc3BsaWNlKDAsIHRoaXMudHlwZXMubGVuZ3RoLCAuLi5kYXRhVHJhbnNmZXIudHlwZXMpO1xuXHRcdH1cblxuXHRcdGlmIChkYXRhVHJhbnNmZXIuZmlsZXMpIHtcblx0XHRcdHRoaXMuZmlsZXMuc3BsaWNlKDAsIHRoaXMuZmlsZXMubGVuZ3RoKTtcblxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBkYXRhVHJhbnNmZXIuZmlsZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgZmlsZSA9IGRhdGFUcmFuc2Zlci5maWxlcy5pdGVtKGkpO1xuXG5cdFx0XHRcdGlmIChmaWxlICYmIChmaWxlLnNpemUgfHwgZmlsZS50eXBlKSkge1xuXHRcdFx0XHRcdHRoaXMuZmlsZXMucHVzaChmaWxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGdldERhdGEoKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGVzOiB0aGlzLnR5cGVzLFxuXHRcdFx0ZmlsZXM6IHRoaXMuZmlsZXNcblx0XHR9O1xuXHR9XG59XG5cbmZ1bmN0aW9uIGVxdWFsc0RyYWdGZWVkYmFjayhmMTogbnVtYmVyW10gfCB1bmRlZmluZWQsIGYyOiBudW1iZXJbXSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRpZiAoQXJyYXkuaXNBcnJheShmMSkgJiYgQXJyYXkuaXNBcnJheShmMikpIHtcblx0XHRyZXR1cm4gZXF1YWxzKGYxLCBmMik7XG5cdH1cblxuXHRyZXR1cm4gZjEgPT09IGYyO1xufVxuXG5jbGFzcyBMaXN0Vmlld0FjY2Vzc2liaWxpdHlQcm92aWRlcjxUPiBpbXBsZW1lbnRzIFJlcXVpcmVkPElMaXN0Vmlld0FjY2Vzc2liaWxpdHlQcm92aWRlcjxUPj4ge1xuXG5cdHJlYWRvbmx5IGdldFNldFNpemU6IChlbGVtZW50OiBULCBpbmRleDogbnVtYmVyLCBsaXN0TGVuZ3RoOiBudW1iZXIpID0+IG51bWJlcjtcblx0cmVhZG9ubHkgZ2V0UG9zSW5TZXQ6IChlbGVtZW50OiBULCBpbmRleDogbnVtYmVyKSA9PiBudW1iZXI7XG5cdHJlYWRvbmx5IGdldFJvbGU6IChlbGVtZW50OiBUKSA9PiBBcmlhUm9sZSB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgaXNDaGVja2VkOiAoZWxlbWVudDogVCkgPT4gQ2hlY2tCb3hBY2Nlc3NpYmxlU3RhdGUgfCBJVmFsdWVXaXRoQ2hhbmdlRXZlbnQ8Q2hlY2tCb3hBY2Nlc3NpYmxlU3RhdGU+IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKGFjY2Vzc2liaWxpdHlQcm92aWRlcj86IElMaXN0Vmlld0FjY2Vzc2liaWxpdHlQcm92aWRlcjxUPikge1xuXHRcdGlmIChhY2Nlc3NpYmlsaXR5UHJvdmlkZXI/LmdldFNldFNpemUpIHtcblx0XHRcdHRoaXMuZ2V0U2V0U2l6ZSA9IGFjY2Vzc2liaWxpdHlQcm92aWRlci5nZXRTZXRTaXplLmJpbmQoYWNjZXNzaWJpbGl0eVByb3ZpZGVyKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5nZXRTZXRTaXplID0gKGUsIGksIGwpID0+IGw7XG5cdFx0fVxuXG5cdFx0aWYgKGFjY2Vzc2liaWxpdHlQcm92aWRlcj8uZ2V0UG9zSW5TZXQpIHtcblx0XHRcdHRoaXMuZ2V0UG9zSW5TZXQgPSBhY2Nlc3NpYmlsaXR5UHJvdmlkZXIuZ2V0UG9zSW5TZXQuYmluZChhY2Nlc3NpYmlsaXR5UHJvdmlkZXIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmdldFBvc0luU2V0ID0gKGUsIGkpID0+IGkgKyAxO1xuXHRcdH1cblxuXHRcdGlmIChhY2Nlc3NpYmlsaXR5UHJvdmlkZXI/LmdldFJvbGUpIHtcblx0XHRcdHRoaXMuZ2V0Um9sZSA9IGFjY2Vzc2liaWxpdHlQcm92aWRlci5nZXRSb2xlLmJpbmQoYWNjZXNzaWJpbGl0eVByb3ZpZGVyKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5nZXRSb2xlID0gXyA9PiAnbGlzdGl0ZW0nO1xuXHRcdH1cblxuXHRcdGlmIChhY2Nlc3NpYmlsaXR5UHJvdmlkZXI/LmlzQ2hlY2tlZCkge1xuXHRcdFx0dGhpcy5pc0NoZWNrZWQgPSBhY2Nlc3NpYmlsaXR5UHJvdmlkZXIuaXNDaGVja2VkLmJpbmQoYWNjZXNzaWJpbGl0eVByb3ZpZGVyKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5pc0NoZWNrZWQgPSBfID0+IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGlzdFZpZXc8VD4gZXh0ZW5kcyBJU3BsaWNlYWJsZTxUPiwgSURpc3Bvc2FibGUge1xuXHRyZWFkb25seSBkb21JZDogc3RyaW5nO1xuXHRyZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgY29udGFpbmVyRG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHNjcm9sbGFibGVFbGVtZW50RG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGxlbmd0aDogbnVtYmVyO1xuXHRyZWFkb25seSBjb250ZW50SGVpZ2h0OiBudW1iZXI7XG5cdHJlYWRvbmx5IGNvbnRlbnRXaWR0aDogbnVtYmVyO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQ6IEV2ZW50PG51bWJlcj47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29udGVudFdpZHRoOiBFdmVudDxudW1iZXI+O1xuXHRyZWFkb25seSByZW5kZXJIZWlnaHQ6IG51bWJlcjtcblx0cmVhZG9ubHkgc2Nyb2xsSGVpZ2h0OiBudW1iZXI7XG5cdHJlYWRvbmx5IGZpcnN0VmlzaWJsZUluZGV4OiBudW1iZXI7XG5cdHJlYWRvbmx5IGZpcnN0TW9zdGx5VmlzaWJsZUluZGV4OiBudW1iZXI7XG5cdHJlYWRvbmx5IGxhc3RWaXNpYmxlSW5kZXg6IG51bWJlcjtcblx0b25EaWRTY3JvbGw6IEV2ZW50PFNjcm9sbEV2ZW50Pjtcblx0b25XaWxsU2Nyb2xsOiBFdmVudDxTY3JvbGxFdmVudD47XG5cdG9uTW91c2VDbGljazogRXZlbnQ8SUxpc3RNb3VzZUV2ZW50PFQ+Pjtcblx0b25Nb3VzZURibENsaWNrOiBFdmVudDxJTGlzdE1vdXNlRXZlbnQ8VD4+O1xuXHRvbk1vdXNlTWlkZGxlQ2xpY2s6IEV2ZW50PElMaXN0TW91c2VFdmVudDxUPj47XG5cdG9uTW91c2VVcDogRXZlbnQ8SUxpc3RNb3VzZUV2ZW50PFQ+Pjtcblx0b25Nb3VzZURvd246IEV2ZW50PElMaXN0TW91c2VFdmVudDxUPj47XG5cdG9uTW91c2VPdmVyOiBFdmVudDxJTGlzdE1vdXNlRXZlbnQ8VD4+O1xuXHRvbk1vdXNlTW92ZTogRXZlbnQ8SUxpc3RNb3VzZUV2ZW50PFQ+Pjtcblx0b25Nb3VzZU91dDogRXZlbnQ8SUxpc3RNb3VzZUV2ZW50PFQ+Pjtcblx0b25Db250ZXh0TWVudTogRXZlbnQ8SUxpc3RNb3VzZUV2ZW50PFQ+Pjtcblx0b25Ub3VjaFN0YXJ0OiBFdmVudDxJTGlzdFRvdWNoRXZlbnQ8VD4+O1xuXHRvblRhcDogRXZlbnQ8SUxpc3RHZXN0dXJlRXZlbnQ8VD4+O1xuXHRlbGVtZW50KGluZGV4OiBudW1iZXIpOiBUO1xuXHRkb21FbGVtZW50KGluZGV4OiBudW1iZXIpOiBIVE1MRWxlbWVudCB8IG51bGw7XG5cdGdldEVsZW1lbnREb21JZChpbmRleDogbnVtYmVyKTogc3RyaW5nO1xuXHRlbGVtZW50SGVpZ2h0KGluZGV4OiBudW1iZXIpOiBudW1iZXI7XG5cdGVsZW1lbnRUb3AoaW5kZXg6IG51bWJlcik6IG51bWJlcjtcblx0aW5kZXhPZihlbGVtZW50OiBUKTogbnVtYmVyO1xuXHRpbmRleEF0KHBvc2l0aW9uOiBudW1iZXIpOiBudW1iZXI7XG5cdGluZGV4QWZ0ZXIocG9zaXRpb246IG51bWJlcik6IG51bWJlcjtcblx0dXBkYXRlT3B0aW9ucyhvcHRpb25zOiBJTGlzdFZpZXdPcHRpb25zVXBkYXRlKTogdm9pZDtcblx0Z2V0U2Nyb2xsVG9wKCk6IG51bWJlcjtcblx0c2V0U2Nyb2xsVG9wKHNjcm9sbFRvcDogbnVtYmVyLCByZXVzZUFuaW1hdGlvbj86IGJvb2xlYW4pOiB2b2lkO1xuXHRnZXRTY3JvbGxMZWZ0KCk6IG51bWJlcjtcblx0c2V0U2Nyb2xsTGVmdChzY3JvbGxMZWZ0OiBudW1iZXIpOiB2b2lkO1xuXHRkZWxlZ2F0ZVNjcm9sbEZyb21Nb3VzZVdoZWVsRXZlbnQoYnJvd3NlckV2ZW50OiBJTW91c2VXaGVlbEV2ZW50KTogdm9pZDtcblx0ZGVsZWdhdGVWZXJ0aWNhbFNjcm9sbGJhclBvaW50ZXJEb3duKGJyb3dzZXJFdmVudDogUG9pbnRlckV2ZW50KTogdm9pZDtcblx0dXBkYXRlV2lkdGgoaW5kZXg6IG51bWJlcik6IHZvaWQ7XG5cdHVwZGF0ZUVsZW1lbnRIZWlnaHQoaW5kZXg6IG51bWJlciwgc2l6ZTogbnVtYmVyIHwgdW5kZWZpbmVkLCBhbmNob3JJbmRleDogbnVtYmVyIHwgbnVsbCk6IHZvaWQ7XG5cdHJlcmVuZGVyKCk6IHZvaWQ7XG5cdGxheW91dChoZWlnaHQ/OiBudW1iZXIsIHdpZHRoPzogbnVtYmVyKTogdm9pZDtcbn1cblxuLyoqXG4gKiBUaGUge0BsaW5rIExpc3RWaWV3fSBpcyBhIHZpcnR1YWwgc2Nyb2xsaW5nIGVuZ2luZS5cbiAqXG4gKiBHaXZlbiB0aGF0IGl0IG9ubHkgcmVuZGVycyBlbGVtZW50cyB3aXRoaW4gaXRzIHZpZXdwb3J0LCBpdCBjYW4gaG9sZCBsYXJnZVxuICogY29sbGVjdGlvbnMgb2YgZWxlbWVudHMgYW5kIHN0YXkgdmVyeSBwZXJmb3JtYW50LiBUaGUgcGVyZm9ybWFuY2UgYm90dGxlbmVja1xuICogdXN1YWxseSBsaWVzIHdpdGhpbiB0aGUgdXNlcidzIHJlbmRlcmluZyBjb2RlIGZvciBlYWNoIGVsZW1lbnQuXG4gKlxuICogQHJlbWFya3MgSXQgaXMgYSBsb3ctbGV2ZWwgd2lkZ2V0LCBub3QgbWVhbnQgdG8gYmUgdXNlZCBkaXJlY3RseS4gUmVmZXIgdG8gdGhlXG4gKiBMaXN0IHdpZGdldCBpbnN0ZWFkLlxuICovXG5leHBvcnQgY2xhc3MgTGlzdFZpZXc8VD4gaW1wbGVtZW50cyBJTGlzdFZpZXc8VD4ge1xuXG5cdHByaXZhdGUgc3RhdGljIEluc3RhbmNlQ291bnQgPSAwO1xuXHRyZWFkb25seSBkb21JZCA9IGBsaXN0X2lkXyR7KytMaXN0Vmlldy5JbnN0YW5jZUNvdW50fWA7XG5cblx0cmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSBpdGVtczogSUl0ZW08VD5bXTtcblx0cHJpdmF0ZSBpdGVtSWQ6IG51bWJlcjtcblx0cHJvdGVjdGVkIHJhbmdlTWFwOiBJUmFuZ2VNYXA7XG5cdHByaXZhdGUgY2FjaGU6IFJvd0NhY2hlPFQ+O1xuXHRwcml2YXRlIHJlbmRlcmVycyA9IG5ldyBNYXA8c3RyaW5nLCBJTGlzdFJlbmRlcmVyPGFueSAvKiBUT0RPQGpvYW8gKi8sIGFueT4+KCk7XG5cdHByb3RlY3RlZCBsYXN0UmVuZGVyVG9wOiBudW1iZXI7XG5cdHByb3RlY3RlZCBsYXN0UmVuZGVySGVpZ2h0OiBudW1iZXI7XG5cdHByaXZhdGUgcmVuZGVyV2lkdGggPSAwO1xuXHRwcml2YXRlIHJvd3NDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHNjcm9sbGFibGU6IFNjcm9sbGFibGU7XG5cdHByaXZhdGUgc2Nyb2xsYWJsZUVsZW1lbnQ6IFNtb290aFNjcm9sbGFibGVFbGVtZW50O1xuXHRwcml2YXRlIF9zY3JvbGxIZWlnaHQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgc2Nyb2xsYWJsZUVsZW1lbnRVcGRhdGVEaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIHNjcm9sbGFibGVFbGVtZW50V2lkdGhEZWxheWVyID0gbmV3IERlbGF5ZXI8dm9pZD4oNTApO1xuXHRwcml2YXRlIHNwbGljaW5nID0gZmFsc2U7XG5cdHByaXZhdGUgZHJhZ092ZXJBbmltYXRpb25EaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBkcmFnT3ZlckFuaW1hdGlvblN0b3BEaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSA9IERpc3Bvc2FibGUuTm9uZTtcblx0cHJpdmF0ZSBkcmFnT3Zlck1vdXNlWTogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBzZXRSb3dMaW5lSGVpZ2h0OiBib29sZWFuO1xuXHRwcml2YXRlIHNldFJvd0hlaWdodDogYm9vbGVhbjtcblx0cHJpdmF0ZSBzdXBwb3J0RHluYW1pY0hlaWdodHM6IGJvb2xlYW47XG5cdHByaXZhdGUgcGFkZGluZ0JvdHRvbTogbnVtYmVyO1xuXHRwcml2YXRlIGFjY2Vzc2liaWxpdHlQcm92aWRlcjogTGlzdFZpZXdBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8VD47XG5cdHByaXZhdGUgc2Nyb2xsV2lkdGg6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGRuZDogSUxpc3RWaWV3RHJhZ0FuZERyb3A8VD47XG5cdHByaXZhdGUgY2FuRHJvcDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIGN1cnJlbnREcmFnRGF0YTogSURyYWdBbmREcm9wRGF0YSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjdXJyZW50RHJhZ0ZlZWRiYWNrOiBudW1iZXJbXSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjdXJyZW50RHJhZ0ZlZWRiYWNrUG9zaXRpb246IExpc3REcmFnT3ZlckVmZmVjdFBvc2l0aW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGN1cnJlbnREcmFnRmVlZGJhY2tEaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSA9IERpc3Bvc2FibGUuTm9uZTtcblx0cHJpdmF0ZSBvbkRyYWdMZWF2ZVRpbWVvdXQ6IElEaXNwb3NhYmxlID0gRGlzcG9zYWJsZS5Ob25lO1xuXHRwcml2YXRlIGN1cnJlbnRTZWxlY3Rpb25EaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSA9IERpc3Bvc2FibGUuTm9uZTtcblx0cHJpdmF0ZSBjdXJyZW50U2VsZWN0aW9uQm91bmRzOiBJUmFuZ2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYWN0aXZlRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29udGVudEhlaWdodCA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29udGVudFdpZHRoID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0OiBFdmVudDxudW1iZXI+ID0gRXZlbnQubGF0Y2godGhpcy5fb25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0LmV2ZW50LCB1bmRlZmluZWQsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbnRlbnRXaWR0aDogRXZlbnQ8bnVtYmVyPiA9IEV2ZW50LmxhdGNoKHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudFdpZHRoLmV2ZW50LCB1bmRlZmluZWQsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHRnZXQgY29udGVudEhlaWdodCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5yYW5nZU1hcC5zaXplOyB9XG5cdGdldCBjb250ZW50V2lkdGgoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuc2Nyb2xsV2lkdGggPz8gMDsgfVxuXG5cdGdldCBvbkRpZFNjcm9sbCgpOiBFdmVudDxTY3JvbGxFdmVudD4geyByZXR1cm4gdGhpcy5zY3JvbGxhYmxlRWxlbWVudC5vblNjcm9sbDsgfVxuXHRnZXQgb25XaWxsU2Nyb2xsKCk6IEV2ZW50PFNjcm9sbEV2ZW50PiB7IHJldHVybiB0aGlzLnNjcm9sbGFibGVFbGVtZW50Lm9uV2lsbFNjcm9sbDsgfVxuXHRnZXQgY29udGFpbmVyRG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7IHJldHVybiB0aGlzLnJvd3NDb250YWluZXI7IH1cblx0Z2V0IHNjcm9sbGFibGVFbGVtZW50RG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7IHJldHVybiB0aGlzLnNjcm9sbGFibGVFbGVtZW50LmdldERvbU5vZGUoKTsgfVxuXG5cdHByaXZhdGUgX2hvcml6b250YWxTY3JvbGxpbmc6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBnZXQgaG9yaXpvbnRhbFNjcm9sbGluZygpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2hvcml6b250YWxTY3JvbGxpbmc7IH1cblx0cHJpdmF0ZSBzZXQgaG9yaXpvbnRhbFNjcm9sbGluZyh2YWx1ZTogYm9vbGVhbikge1xuXHRcdGlmICh2YWx1ZSA9PT0gdGhpcy5faG9yaXpvbnRhbFNjcm9sbGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh2YWx1ZSAmJiB0aGlzLnN1cHBvcnREeW5hbWljSGVpZ2h0cykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdIb3Jpem9udGFsIHNjcm9sbGluZyBhbmQgZHluYW1pYyBoZWlnaHRzIG5vdCBzdXBwb3J0ZWQgc2ltdWx0YW5lb3VzbHknKTtcblx0XHR9XG5cblx0XHR0aGlzLl9ob3Jpem9udGFsU2Nyb2xsaW5nID0gdmFsdWU7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2hvcml6b250YWwtc2Nyb2xsaW5nJywgdGhpcy5faG9yaXpvbnRhbFNjcm9sbGluZyk7XG5cblx0XHRpZiAodGhpcy5faG9yaXpvbnRhbFNjcm9sbGluZykge1xuXHRcdFx0dGhpcy5tZWFzdXJlSXRlbVdpZHRocyh0aGlzLml0ZW1zKTtcblxuXHRcdFx0dGhpcy51cGRhdGVTY3JvbGxXaWR0aCgpO1xuXHRcdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudC5zZXRTY3JvbGxEaW1lbnNpb25zKHsgd2lkdGg6IGdldENvbnRlbnRXaWR0aCh0aGlzLmRvbU5vZGUpIH0pO1xuXHRcdFx0dGhpcy5yb3dzQ29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7TWF0aC5tYXgodGhpcy5zY3JvbGxXaWR0aCB8fCAwLCB0aGlzLnJlbmRlcldpZHRoKX1weGA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnRXaWR0aERlbGF5ZXIuY2FuY2VsKCk7XG5cdFx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50LnNldFNjcm9sbERpbWVuc2lvbnMoeyB3aWR0aDogdGhpcy5yZW5kZXJXaWR0aCwgc2Nyb2xsV2lkdGg6IHRoaXMucmVuZGVyV2lkdGggfSk7XG5cdFx0XHR0aGlzLnJvd3NDb250YWluZXIuc3R5bGUud2lkdGggPSAnJztcblx0XHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5yZW1vdmVQcm9wZXJ0eSgnLS1saXN0LXNjcm9sbC1yaWdodC1vZmZzZXQnKTtcblx0XHR9XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgdmlydHVhbERlbGVnYXRlOiBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxUPixcblx0XHRyZW5kZXJlcnM6IElMaXN0UmVuZGVyZXI8YW55IC8qIFRPRE9Aam9hbyAqLywgYW55PltdLFxuXHRcdG9wdGlvbnM6IElMaXN0Vmlld09wdGlvbnM8VD4gPSBEZWZhdWx0T3B0aW9uc1xuXHQpIHtcblx0XHRpZiAob3B0aW9ucy5ob3Jpem9udGFsU2Nyb2xsaW5nICYmIG9wdGlvbnMuc3VwcG9ydER5bmFtaWNIZWlnaHRzKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0hvcml6b250YWwgc2Nyb2xsaW5nIGFuZCBkeW5hbWljIGhlaWdodHMgbm90IHN1cHBvcnRlZCBzaW11bHRhbmVvdXNseScpO1xuXHRcdH1cblxuXHRcdHRoaXMuaXRlbXMgPSBbXTtcblx0XHR0aGlzLml0ZW1JZCA9IDA7XG5cdFx0dGhpcy5yYW5nZU1hcCA9IHRoaXMuY3JlYXRlUmFuZ2VNYXAob3B0aW9ucy5wYWRkaW5nVG9wID8/IDApO1xuXG5cdFx0Zm9yIChjb25zdCByZW5kZXJlciBvZiByZW5kZXJlcnMpIHtcblx0XHRcdHRoaXMucmVuZGVyZXJzLnNldChyZW5kZXJlci50ZW1wbGF0ZUlkLCByZW5kZXJlcik7XG5cdFx0fVxuXG5cdFx0dGhpcy5jYWNoZSA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBSb3dDYWNoZSh0aGlzLnJlbmRlcmVycykpO1xuXG5cdFx0dGhpcy5sYXN0UmVuZGVyVG9wID0gMDtcblx0XHR0aGlzLmxhc3RSZW5kZXJIZWlnaHQgPSAwO1xuXG5cdFx0dGhpcy5kb21Ob2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTmFtZSA9ICdtb25hY28tbGlzdCc7XG5cblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCh0aGlzLmRvbUlkKTtcblx0XHR0aGlzLmRvbU5vZGUudGFiSW5kZXggPSAwO1xuXG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ21vdXNlLXN1cHBvcnQnLCB0eXBlb2Ygb3B0aW9ucy5tb3VzZVN1cHBvcnQgPT09ICdib29sZWFuJyA/IG9wdGlvbnMubW91c2VTdXBwb3J0IDogdHJ1ZSk7XG5cblx0XHR0aGlzLl9ob3Jpem9udGFsU2Nyb2xsaW5nID0gb3B0aW9ucy5ob3Jpem9udGFsU2Nyb2xsaW5nID8/IERlZmF1bHRPcHRpb25zLmhvcml6b250YWxTY3JvbGxpbmc7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2hvcml6b250YWwtc2Nyb2xsaW5nJywgdGhpcy5faG9yaXpvbnRhbFNjcm9sbGluZyk7XG5cblx0XHR0aGlzLnBhZGRpbmdCb3R0b20gPSB0eXBlb2Ygb3B0aW9ucy5wYWRkaW5nQm90dG9tID09PSAndW5kZWZpbmVkJyA/IDAgOiBvcHRpb25zLnBhZGRpbmdCb3R0b207XG5cblx0XHR0aGlzLmFjY2Vzc2liaWxpdHlQcm92aWRlciA9IG5ldyBMaXN0Vmlld0FjY2Vzc2liaWxpdHlQcm92aWRlcihvcHRpb25zLmFjY2Vzc2liaWxpdHlQcm92aWRlcik7XG5cblx0XHR0aGlzLnJvd3NDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLnJvd3NDb250YWluZXIuY2xhc3NOYW1lID0gJ21vbmFjby1saXN0LXJvd3MnO1xuXG5cdFx0Y29uc3QgdHJhbnNmb3JtT3B0aW1pemF0aW9uID0gb3B0aW9ucy50cmFuc2Zvcm1PcHRpbWl6YXRpb24gPz8gRGVmYXVsdE9wdGlvbnMudHJhbnNmb3JtT3B0aW1pemF0aW9uO1xuXHRcdGlmICh0cmFuc2Zvcm1PcHRpbWl6YXRpb24pIHtcblx0XHRcdHRoaXMucm93c0NvbnRhaW5lci5zdHlsZS50cmFuc2Zvcm0gPSAndHJhbnNsYXRlM2QoMHB4LCAwcHgsIDBweCknO1xuXHRcdFx0dGhpcy5yb3dzQ29udGFpbmVyLnN0eWxlLm92ZXJmbG93ID0gJ2hpZGRlbic7XG5cdFx0XHR0aGlzLnJvd3NDb250YWluZXIuc3R5bGUuY29udGFpbiA9ICdzdHJpY3QnO1xuXHRcdH1cblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKEdlc3R1cmUuYWRkVGFyZ2V0KHRoaXMucm93c0NvbnRhaW5lcikpO1xuXG5cdFx0dGhpcy5zY3JvbGxhYmxlID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IFNjcm9sbGFibGUoe1xuXHRcdFx0Zm9yY2VJbnRlZ2VyVmFsdWVzOiB0cnVlLFxuXHRcdFx0c21vb3RoU2Nyb2xsRHVyYXRpb246IChvcHRpb25zLnNtb290aFNjcm9sbGluZyA/PyBmYWxzZSkgPyAxMjUgOiAwLFxuXHRcdFx0c2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZTogY2IgPT4gc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShnZXRXaW5kb3codGhpcy5kb21Ob2RlKSwgY2IpXG5cdFx0fSkpO1xuXHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQgPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgU21vb3RoU2Nyb2xsYWJsZUVsZW1lbnQodGhpcy5yb3dzQ29udGFpbmVyLCB7XG5cdFx0XHRhbHdheXNDb25zdW1lTW91c2VXaGVlbDogb3B0aW9ucy5hbHdheXNDb25zdW1lTW91c2VXaGVlbCA/PyBEZWZhdWx0T3B0aW9ucy5hbHdheXNDb25zdW1lTW91c2VXaGVlbCxcblx0XHRcdGhvcml6b250YWw6IFNjcm9sbGJhclZpc2liaWxpdHkuQXV0byxcblx0XHRcdHZlcnRpY2FsOiBvcHRpb25zLnZlcnRpY2FsU2Nyb2xsTW9kZSA/PyBEZWZhdWx0T3B0aW9ucy52ZXJ0aWNhbFNjcm9sbE1vZGUsXG5cdFx0XHR1c2VTaGFkb3dzOiBvcHRpb25zLnVzZVNoYWRvd3MgPz8gRGVmYXVsdE9wdGlvbnMudXNlU2hhZG93cyxcblx0XHRcdG1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eTogb3B0aW9ucy5tb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHksXG5cdFx0XHRmYXN0U2Nyb2xsU2Vuc2l0aXZpdHk6IG9wdGlvbnMuZmFzdFNjcm9sbFNlbnNpdGl2aXR5LFxuXHRcdFx0c2Nyb2xsQnlQYWdlOiBvcHRpb25zLnNjcm9sbEJ5UGFnZVxuXHRcdH0sIHRoaXMuc2Nyb2xsYWJsZSkpO1xuXG5cdFx0dGhpcy5kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuZ2V0RG9tTm9kZSgpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5kb21Ob2RlKTtcblxuXHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQub25TY3JvbGwodGhpcy5vblNjcm9sbCwgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMucm93c0NvbnRhaW5lciwgVG91Y2hFdmVudFR5cGUuQ2hhbmdlLCBlID0+IHRoaXMub25Ub3VjaENoYW5nZShlIGFzIEdlc3R1cmVFdmVudCkpKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnNjcm9sbGFibGVFbGVtZW50LmdldERvbU5vZGUoKSwgJ3Njcm9sbCcsIGUgPT4ge1xuXHRcdFx0Ly8gTWFrZSBzdXJlIHRoZSBhY3RpdmUgZWxlbWVudCBpcyBzY3JvbGxlZCBpbnRvIHZpZXdcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSAoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpO1xuXHRcdFx0Y29uc3Qgc2Nyb2xsVmFsdWUgPSBlbGVtZW50LnNjcm9sbFRvcDtcblx0XHRcdGVsZW1lbnQuc2Nyb2xsVG9wID0gMDtcblx0XHRcdGlmIChvcHRpb25zLnNjcm9sbFRvQWN0aXZlRWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLnNldFNjcm9sbFRvcCh0aGlzLnNjcm9sbFRvcCArIHNjcm9sbFZhbHVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5kb21Ob2RlLCAnZHJhZ292ZXInLCBlID0+IHRoaXMub25EcmFnT3Zlcih0aGlzLnRvRHJhZ0V2ZW50KGUpKSkpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRvbU5vZGUsICdkcm9wJywgZSA9PiB0aGlzLm9uRHJvcCh0aGlzLnRvRHJhZ0V2ZW50KGUpKSkpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRvbU5vZGUsICdkcmFnbGVhdmUnLCBlID0+IHRoaXMub25EcmFnTGVhdmUodGhpcy50b0RyYWdFdmVudChlKSkpKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5kb21Ob2RlLCAnZHJhZ2VuZCcsIGUgPT4gdGhpcy5vbkRyYWdFbmQoZSkpKTtcblx0XHRpZiAob3B0aW9ucy51c2VyU2VsZWN0aW9uKSB7XG5cdFx0XHRpZiAob3B0aW9ucy5kbmQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdETkQgYW5kIHVzZXIgc2VsZWN0aW9uIGNhbm5vdCBiZSB1c2VkIHNpbXVsdGFuZW91c2x5Jyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5kb21Ob2RlLCAnbW91c2Vkb3duJywgZSA9PiB0aGlzLm9uUG90ZW50aWFsU2VsZWN0aW9uU3RhcnQoZSkpKTtcblx0XHR9XG5cblx0XHR0aGlzLnNldFJvd0xpbmVIZWlnaHQgPSBvcHRpb25zLnNldFJvd0xpbmVIZWlnaHQgPz8gRGVmYXVsdE9wdGlvbnMuc2V0Um93TGluZUhlaWdodDtcblx0XHR0aGlzLnNldFJvd0hlaWdodCA9IG9wdGlvbnMuc2V0Um93SGVpZ2h0ID8/IERlZmF1bHRPcHRpb25zLnNldFJvd0hlaWdodDtcblx0XHR0aGlzLnN1cHBvcnREeW5hbWljSGVpZ2h0cyA9IG9wdGlvbnMuc3VwcG9ydER5bmFtaWNIZWlnaHRzID8/IERlZmF1bHRPcHRpb25zLnN1cHBvcnREeW5hbWljSGVpZ2h0cztcblx0XHR0aGlzLmRuZCA9IG9wdGlvbnMuZG5kID8/IHRoaXMuZGlzcG9zYWJsZXMuYWRkKERlZmF1bHRPcHRpb25zLmRuZCk7XG5cblx0XHR0aGlzLmxheW91dChvcHRpb25zLmluaXRpYWxTaXplPy5oZWlnaHQsIG9wdGlvbnMuaW5pdGlhbFNpemU/LndpZHRoKTtcblx0XHRpZiAob3B0aW9ucy5zY3JvbGxUb0FjdGl2ZUVsZW1lbnQpIHtcblx0XHRcdHRoaXMuX3NldHVwRm9jdXNPYnNlcnZlcihjb250YWluZXIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldHVwRm9jdXNPYnNlcnZlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNvbnRhaW5lciwgJ2ZvY3VzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IGdldEFjdGl2ZUVsZW1lbnQoKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG5cdFx0XHRpZiAodGhpcy5hY3RpdmVFbGVtZW50ICE9PSBlbGVtZW50ICYmIGVsZW1lbnQgIT09IG51bGwpIHtcblx0XHRcdFx0dGhpcy5hY3RpdmVFbGVtZW50ID0gZWxlbWVudDtcblx0XHRcdFx0dGhpcy5fc2Nyb2xsVG9BY3RpdmVFbGVtZW50KHRoaXMuYWN0aXZlRWxlbWVudCwgY29udGFpbmVyKTtcblx0XHRcdH1cblx0XHR9LCB0cnVlKSk7XG5cdH1cblxuXHRwcml2YXRlIF9zY3JvbGxUb0FjdGl2ZUVsZW1lbnQoZWxlbWVudDogSFRNTEVsZW1lbnQsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcblx0XHQvLyBUaGUgc2Nyb2xsIGV2ZW50IG9uIHRoZSBsaXN0IG9ubHkgZmlyZXMgd2hlbiBzY3JvbGxpbmcgZG93bi5cblx0XHQvLyBJZiB0aGUgYWN0aXZlIGVsZW1lbnQgaXMgYWJvdmUgdGhlIHZpZXdwb3J0LCB3ZSBuZWVkIHRvIHNjcm9sbCB1cC5cblx0XHRjb25zdCBjb250YWluZXJSZWN0ID0gY29udGFpbmVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IGVsZW1lbnRSZWN0ID0gZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblxuXHRcdGNvbnN0IHRvcE9mZnNldCA9IGVsZW1lbnRSZWN0LnRvcCAtIGNvbnRhaW5lclJlY3QudG9wO1xuXG5cdFx0aWYgKHRvcE9mZnNldCA8IDApIHtcblx0XHRcdC8vIFNjcm9sbCB1cFxuXHRcdFx0dGhpcy5zZXRTY3JvbGxUb3AodGhpcy5zY3JvbGxUb3AgKyB0b3BPZmZzZXQpO1xuXHRcdH1cblx0fVxuXG5cdHVwZGF0ZU9wdGlvbnMob3B0aW9uczogSUxpc3RWaWV3T3B0aW9uc1VwZGF0ZSkge1xuXHRcdGlmIChvcHRpb25zLnBhZGRpbmdCb3R0b20gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5wYWRkaW5nQm90dG9tID0gb3B0aW9ucy5wYWRkaW5nQm90dG9tO1xuXHRcdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudC5zZXRTY3JvbGxEaW1lbnNpb25zKHsgc2Nyb2xsSGVpZ2h0OiB0aGlzLnNjcm9sbEhlaWdodCB9KTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy5zbW9vdGhTY3JvbGxpbmcgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5zY3JvbGxhYmxlLnNldFNtb290aFNjcm9sbER1cmF0aW9uKG9wdGlvbnMuc21vb3RoU2Nyb2xsaW5nID8gMTI1IDogMCk7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMuaG9yaXpvbnRhbFNjcm9sbGluZyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmhvcml6b250YWxTY3JvbGxpbmcgPSBvcHRpb25zLmhvcml6b250YWxTY3JvbGxpbmc7XG5cdFx0fVxuXG5cdFx0bGV0IHNjcm9sbGFibGVPcHRpb25zOiBTY3JvbGxhYmxlRWxlbWVudENoYW5nZU9wdGlvbnMgfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAob3B0aW9ucy5zY3JvbGxCeVBhZ2UgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0c2Nyb2xsYWJsZU9wdGlvbnMgPSB7IC4uLihzY3JvbGxhYmxlT3B0aW9ucyA/PyB7fSksIHNjcm9sbEJ5UGFnZTogb3B0aW9ucy5zY3JvbGxCeVBhZ2UgfTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy5tb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0c2Nyb2xsYWJsZU9wdGlvbnMgPSB7IC4uLihzY3JvbGxhYmxlT3B0aW9ucyA/PyB7fSksIG1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eTogb3B0aW9ucy5tb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHkgfTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy5mYXN0U2Nyb2xsU2Vuc2l0aXZpdHkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0c2Nyb2xsYWJsZU9wdGlvbnMgPSB7IC4uLihzY3JvbGxhYmxlT3B0aW9ucyA/PyB7fSksIGZhc3RTY3JvbGxTZW5zaXRpdml0eTogb3B0aW9ucy5mYXN0U2Nyb2xsU2Vuc2l0aXZpdHkgfTtcblx0XHR9XG5cblx0XHRpZiAoc2Nyb2xsYWJsZU9wdGlvbnMpIHtcblx0XHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQudXBkYXRlT3B0aW9ucyhzY3JvbGxhYmxlT3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMucGFkZGluZ1RvcCAhPT0gdW5kZWZpbmVkICYmIG9wdGlvbnMucGFkZGluZ1RvcCAhPT0gdGhpcy5yYW5nZU1hcC5wYWRkaW5nVG9wKSB7XG5cdFx0XHQvLyB0cmlnZ2VyIGEgcmVyZW5kZXJcblx0XHRcdGNvbnN0IGxhc3RSZW5kZXJSYW5nZSA9IHRoaXMuZ2V0UmVuZGVyUmFuZ2UodGhpcy5sYXN0UmVuZGVyVG9wLCB0aGlzLmxhc3RSZW5kZXJIZWlnaHQpO1xuXHRcdFx0Y29uc3Qgb2Zmc2V0ID0gb3B0aW9ucy5wYWRkaW5nVG9wIC0gdGhpcy5yYW5nZU1hcC5wYWRkaW5nVG9wO1xuXHRcdFx0dGhpcy5yYW5nZU1hcC5wYWRkaW5nVG9wID0gb3B0aW9ucy5wYWRkaW5nVG9wO1xuXG5cdFx0XHR0aGlzLnJlbmRlcihsYXN0UmVuZGVyUmFuZ2UsIE1hdGgubWF4KDAsIHRoaXMubGFzdFJlbmRlclRvcCArIG9mZnNldCksIHRoaXMubGFzdFJlbmRlckhlaWdodCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0dGhpcy5zZXRTY3JvbGxUb3AodGhpcy5sYXN0UmVuZGVyVG9wKTtcblxuXHRcdFx0dGhpcy5ldmVudHVhbGx5VXBkYXRlU2Nyb2xsRGltZW5zaW9ucygpO1xuXG5cdFx0XHRpZiAodGhpcy5zdXBwb3J0RHluYW1pY0hlaWdodHMpIHtcblx0XHRcdFx0dGhpcy5fcmVyZW5kZXIodGhpcy5sYXN0UmVuZGVyVG9wLCB0aGlzLmxhc3RSZW5kZXJIZWlnaHQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGRlbGVnYXRlU2Nyb2xsRnJvbU1vdXNlV2hlZWxFdmVudChicm93c2VyRXZlbnQ6IElNb3VzZVdoZWVsRXZlbnQpIHtcblx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50LmRlbGVnYXRlU2Nyb2xsRnJvbU1vdXNlV2hlZWxFdmVudChicm93c2VyRXZlbnQpO1xuXHR9XG5cblx0ZGVsZWdhdGVWZXJ0aWNhbFNjcm9sbGJhclBvaW50ZXJEb3duKGJyb3dzZXJFdmVudDogUG9pbnRlckV2ZW50KSB7XG5cdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudC5kZWxlZ2F0ZVZlcnRpY2FsU2Nyb2xsYmFyUG9pbnRlckRvd24oYnJvd3NlckV2ZW50KTtcblx0fVxuXG5cdHVwZGF0ZUVsZW1lbnRIZWlnaHQoaW5kZXg6IG51bWJlciwgc2l6ZTogbnVtYmVyIHwgdW5kZWZpbmVkLCBhbmNob3JJbmRleDogbnVtYmVyIHwgbnVsbCk6IHZvaWQge1xuXHRcdGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gdGhpcy5pdGVtcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvcmlnaW5hbFNpemUgPSB0aGlzLml0ZW1zW2luZGV4XS5zaXplO1xuXG5cdFx0aWYgKHR5cGVvZiBzaXplID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0aWYgKCF0aGlzLnN1cHBvcnREeW5hbWljSGVpZ2h0cykge1xuXHRcdFx0XHRjb25zb2xlLndhcm4oJ0R5bmFtaWMgaGVpZ2h0cyBub3Qgc3VwcG9ydGVkJywgbmV3IEVycm9yKCkuc3RhY2spO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuaXRlbXNbaW5kZXhdLmxhc3REeW5hbWljSGVpZ2h0V2lkdGggPSB1bmRlZmluZWQ7XG5cdFx0XHRzaXplID0gb3JpZ2luYWxTaXplICsgdGhpcy5wcm9iZUR5bmFtaWNIZWlnaHQoaW5kZXgpO1xuXHRcdH1cblxuXHRcdGlmIChvcmlnaW5hbFNpemUgPT09IHNpemUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBsYXN0UmVuZGVyUmFuZ2UgPSB0aGlzLmdldFJlbmRlclJhbmdlKHRoaXMubGFzdFJlbmRlclRvcCwgdGhpcy5sYXN0UmVuZGVySGVpZ2h0KTtcblxuXHRcdGxldCBoZWlnaHREaWZmID0gMDtcblxuXHRcdGlmIChpbmRleCA8IGxhc3RSZW5kZXJSYW5nZS5zdGFydCkge1xuXHRcdFx0Ly8gZG8gbm90IHNjcm9sbCB0aGUgdmlld3BvcnQgaWYgcmVzaXplZCBlbGVtZW50IGlzIG91dCBvZiB2aWV3cG9ydFxuXHRcdFx0aGVpZ2h0RGlmZiA9IHNpemUgLSBvcmlnaW5hbFNpemU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChhbmNob3JJbmRleCAhPT0gbnVsbCAmJiBhbmNob3JJbmRleCA+IGluZGV4ICYmIGFuY2hvckluZGV4IDwgbGFzdFJlbmRlclJhbmdlLmVuZCkge1xuXHRcdFx0XHQvLyBhbmNob3IgaW4gdmlld3BvcnRcblx0XHRcdFx0Ly8gcmVzaXplZCBlbGVtZW50IGluIHZpZXdwb3J0IGFuZCBhYm92ZSB0aGUgYW5jaG9yXG5cdFx0XHRcdGhlaWdodERpZmYgPSBzaXplIC0gb3JpZ2luYWxTaXplO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aGVpZ2h0RGlmZiA9IDA7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5yYW5nZU1hcC5zcGxpY2UoaW5kZXgsIDEsIFt7IHNpemU6IHNpemUgfV0pO1xuXHRcdHRoaXMuaXRlbXNbaW5kZXhdLnNpemUgPSBzaXplO1xuXG5cdFx0dGhpcy5yZW5kZXIobGFzdFJlbmRlclJhbmdlLCBNYXRoLm1heCgwLCB0aGlzLmxhc3RSZW5kZXJUb3AgKyBoZWlnaHREaWZmKSwgdGhpcy5sYXN0UmVuZGVySGVpZ2h0LCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0dGhpcy5zZXRTY3JvbGxUb3AodGhpcy5sYXN0UmVuZGVyVG9wKTtcblxuXHRcdHRoaXMuZXZlbnR1YWxseVVwZGF0ZVNjcm9sbERpbWVuc2lvbnMoKTtcblxuXHRcdGlmICh0aGlzLnN1cHBvcnREeW5hbWljSGVpZ2h0cykge1xuXHRcdFx0dGhpcy5fcmVyZW5kZXIodGhpcy5sYXN0UmVuZGVyVG9wLCB0aGlzLmxhc3RSZW5kZXJIZWlnaHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQuZmlyZSh0aGlzLmNvbnRlbnRIZWlnaHQpOyAvLyBvdGhlcndpc2UgZmlyZWQgaW4gX3JlcmVuZGVyKClcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlUmFuZ2VNYXAocGFkZGluZ1RvcDogbnVtYmVyKTogSVJhbmdlTWFwIHtcblx0XHRyZXR1cm4gbmV3IFJhbmdlTWFwKHBhZGRpbmdUb3ApO1xuXHR9XG5cblx0c3BsaWNlKHN0YXJ0OiBudW1iZXIsIGRlbGV0ZUNvdW50OiBudW1iZXIsIGVsZW1lbnRzOiByZWFkb25seSBUW10gPSBbXSk6IFRbXSB7XG5cdFx0aWYgKHRoaXMuc3BsaWNpbmcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2FuXFwndCBydW4gcmVjdXJzaXZlIHNwbGljZXMuJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zcGxpY2luZyA9IHRydWU7XG5cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3NwbGljZShzdGFydCwgZGVsZXRlQ291bnQsIGVsZW1lbnRzKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5zcGxpY2luZyA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0LmZpcmUodGhpcy5jb250ZW50SGVpZ2h0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zcGxpY2Uoc3RhcnQ6IG51bWJlciwgZGVsZXRlQ291bnQ6IG51bWJlciwgZWxlbWVudHM6IHJlYWRvbmx5IFRbXSA9IFtdKTogVFtdIHtcblx0XHRjb25zdCBwcmV2aW91c1JlbmRlclJhbmdlID0gdGhpcy5nZXRSZW5kZXJSYW5nZSh0aGlzLmxhc3RSZW5kZXJUb3AsIHRoaXMubGFzdFJlbmRlckhlaWdodCk7XG5cdFx0Y29uc3QgZGVsZXRlUmFuZ2UgPSB7IHN0YXJ0LCBlbmQ6IHN0YXJ0ICsgZGVsZXRlQ291bnQgfTtcblx0XHRjb25zdCByZW1vdmVSYW5nZSA9IFJhbmdlLmludGVyc2VjdChwcmV2aW91c1JlbmRlclJhbmdlLCBkZWxldGVSYW5nZSk7XG5cblx0XHQvLyB0cnkgdG8gcmV1c2Ugcm93cywgYXZvaWQgcmVtb3ZpbmcgdGhlbSBmcm9tIERPTVxuXHRcdGNvbnN0IHJvd3NUb0Rpc3Bvc2UgPSBuZXcgTWFwPHN0cmluZywgSVJvd1tdPigpO1xuXHRcdGZvciAobGV0IGkgPSByZW1vdmVSYW5nZS5lbmQgLSAxOyBpID49IHJlbW92ZVJhbmdlLnN0YXJ0OyBpLS0pIHtcblx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLml0ZW1zW2ldO1xuXHRcdFx0aXRlbS5kcmFnU3RhcnREaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdGl0ZW0uY2hlY2tlZERpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXG5cdFx0XHRpZiAoaXRlbS5yb3cpIHtcblx0XHRcdFx0bGV0IHJvd3MgPSByb3dzVG9EaXNwb3NlLmdldChpdGVtLnRlbXBsYXRlSWQpO1xuXG5cdFx0XHRcdGlmICghcm93cykge1xuXHRcdFx0XHRcdHJvd3MgPSBbXTtcblx0XHRcdFx0XHRyb3dzVG9EaXNwb3NlLnNldChpdGVtLnRlbXBsYXRlSWQsIHJvd3MpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmVuZGVyZXIgPSB0aGlzLnJlbmRlcmVycy5nZXQoaXRlbS50ZW1wbGF0ZUlkKTtcblxuXHRcdFx0XHRpZiAocmVuZGVyZXIgJiYgcmVuZGVyZXIuZGlzcG9zZUVsZW1lbnQpIHtcblx0XHRcdFx0XHRyZW5kZXJlci5kaXNwb3NlRWxlbWVudChpdGVtLmVsZW1lbnQsIGksIGl0ZW0ucm93LnRlbXBsYXRlRGF0YSwgeyBoZWlnaHQ6IGl0ZW0uc2l6ZSB9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJvd3MudW5zaGlmdChpdGVtLnJvdyk7XG5cdFx0XHR9XG5cblx0XHRcdGl0ZW0ucm93ID0gbnVsbDtcblx0XHRcdGl0ZW0uc3RhbGUgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZXZpb3VzUmVzdFJhbmdlOiBJUmFuZ2UgPSB7IHN0YXJ0OiBzdGFydCArIGRlbGV0ZUNvdW50LCBlbmQ6IHRoaXMuaXRlbXMubGVuZ3RoIH07XG5cdFx0Y29uc3QgcHJldmlvdXNSZW5kZXJlZFJlc3RSYW5nZSA9IFJhbmdlLmludGVyc2VjdChwcmV2aW91c1Jlc3RSYW5nZSwgcHJldmlvdXNSZW5kZXJSYW5nZSk7XG5cdFx0Y29uc3QgcHJldmlvdXNVbnJlbmRlcmVkUmVzdFJhbmdlcyA9IFJhbmdlLnJlbGF0aXZlQ29tcGxlbWVudChwcmV2aW91c1Jlc3RSYW5nZSwgcHJldmlvdXNSZW5kZXJSYW5nZSk7XG5cblx0XHRjb25zdCBpbnNlcnRlZCA9IGVsZW1lbnRzLm1hcDxJSXRlbTxUPj4oZWxlbWVudCA9PiAoe1xuXHRcdFx0aWQ6IFN0cmluZyh0aGlzLml0ZW1JZCsrKSxcblx0XHRcdGVsZW1lbnQsXG5cdFx0XHR0ZW1wbGF0ZUlkOiB0aGlzLnZpcnR1YWxEZWxlZ2F0ZS5nZXRUZW1wbGF0ZUlkKGVsZW1lbnQpLFxuXHRcdFx0c2l6ZTogdGhpcy52aXJ0dWFsRGVsZWdhdGUuZ2V0SGVpZ2h0KGVsZW1lbnQpLFxuXHRcdFx0d2lkdGg6IHVuZGVmaW5lZCxcblx0XHRcdGhhc0R5bmFtaWNIZWlnaHQ6ICEhdGhpcy52aXJ0dWFsRGVsZWdhdGUuaGFzRHluYW1pY0hlaWdodCAmJiB0aGlzLnZpcnR1YWxEZWxlZ2F0ZS5oYXNEeW5hbWljSGVpZ2h0KGVsZW1lbnQpLFxuXHRcdFx0bGFzdER5bmFtaWNIZWlnaHRXaWR0aDogdW5kZWZpbmVkLFxuXHRcdFx0cm93OiBudWxsLFxuXHRcdFx0dXJpOiB1bmRlZmluZWQsXG5cdFx0XHRkcm9wVGFyZ2V0OiBmYWxzZSxcblx0XHRcdGRyYWdTdGFydERpc3Bvc2FibGU6IERpc3Bvc2FibGUuTm9uZSxcblx0XHRcdGNoZWNrZWREaXNwb3NhYmxlOiBEaXNwb3NhYmxlLk5vbmUsXG5cdFx0XHRzdGFsZTogZmFsc2Vcblx0XHR9KSk7XG5cblx0XHRsZXQgZGVsZXRlZDogSUl0ZW08VD5bXTtcblxuXHRcdC8vIFRPRE9Aam9hbzogaW1wcm92ZSB0aGlzIG9wdGltaXphdGlvbiB0byBjYXRjaCBldmVuIG1vcmUgY2FzZXNcblx0XHRpZiAoc3RhcnQgPT09IDAgJiYgZGVsZXRlQ291bnQgPj0gdGhpcy5pdGVtcy5sZW5ndGgpIHtcblx0XHRcdHRoaXMucmFuZ2VNYXAgPSB0aGlzLmNyZWF0ZVJhbmdlTWFwKHRoaXMucmFuZ2VNYXAucGFkZGluZ1RvcCk7XG5cdFx0XHR0aGlzLnJhbmdlTWFwLnNwbGljZSgwLCAwLCBpbnNlcnRlZCk7XG5cdFx0XHRkZWxldGVkID0gdGhpcy5pdGVtcztcblx0XHRcdHRoaXMuaXRlbXMgPSBpbnNlcnRlZDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yYW5nZU1hcC5zcGxpY2Uoc3RhcnQsIGRlbGV0ZUNvdW50LCBpbnNlcnRlZCk7XG5cdFx0XHRkZWxldGVkID0gc3BsaWNlKHRoaXMuaXRlbXMsIHN0YXJ0LCBkZWxldGVDb3VudCwgaW5zZXJ0ZWQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlbHRhID0gZWxlbWVudHMubGVuZ3RoIC0gZGVsZXRlQ291bnQ7XG5cdFx0Y29uc3QgcmVuZGVyUmFuZ2UgPSB0aGlzLmdldFJlbmRlclJhbmdlKHRoaXMubGFzdFJlbmRlclRvcCwgdGhpcy5sYXN0UmVuZGVySGVpZ2h0KTtcblx0XHRjb25zdCByZW5kZXJlZFJlc3RSYW5nZSA9IHNoaWZ0KHByZXZpb3VzUmVuZGVyZWRSZXN0UmFuZ2UsIGRlbHRhKTtcblx0XHRjb25zdCB1cGRhdGVSYW5nZSA9IFJhbmdlLmludGVyc2VjdChyZW5kZXJSYW5nZSwgcmVuZGVyZWRSZXN0UmFuZ2UpO1xuXG5cdFx0Zm9yIChsZXQgaSA9IHVwZGF0ZVJhbmdlLnN0YXJ0OyBpIDwgdXBkYXRlUmFuZ2UuZW5kOyBpKyspIHtcblx0XHRcdHRoaXMudXBkYXRlSXRlbUluRE9NKHRoaXMuaXRlbXNbaV0sIGkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlbW92ZVJhbmdlcyA9IFJhbmdlLnJlbGF0aXZlQ29tcGxlbWVudChyZW5kZXJlZFJlc3RSYW5nZSwgcmVuZGVyUmFuZ2UpO1xuXG5cdFx0Zm9yIChjb25zdCByYW5nZSBvZiByZW1vdmVSYW5nZXMpIHtcblx0XHRcdGZvciAobGV0IGkgPSByYW5nZS5zdGFydDsgaSA8IHJhbmdlLmVuZDsgaSsrKSB7XG5cdFx0XHRcdHRoaXMucmVtb3ZlSXRlbUZyb21ET00oaSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgdW5yZW5kZXJlZFJlc3RSYW5nZXMgPSBwcmV2aW91c1VucmVuZGVyZWRSZXN0UmFuZ2VzLm1hcChyID0+IHNoaWZ0KHIsIGRlbHRhKSk7XG5cdFx0Y29uc3QgZWxlbWVudHNSYW5nZSA9IHsgc3RhcnQsIGVuZDogc3RhcnQgKyBlbGVtZW50cy5sZW5ndGggfTtcblx0XHRjb25zdCBpbnNlcnRSYW5nZXMgPSBbZWxlbWVudHNSYW5nZSwgLi4udW5yZW5kZXJlZFJlc3RSYW5nZXNdLm1hcChyID0+IFJhbmdlLmludGVyc2VjdChyZW5kZXJSYW5nZSwgcikpLnJldmVyc2UoKTtcblx0XHRjb25zdCBpbnNlcnRlZEl0ZW1zOiBJSXRlbTxUPltdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IHJhbmdlIG9mIGluc2VydFJhbmdlcykge1xuXHRcdFx0Zm9yIChsZXQgaSA9IHJhbmdlLmVuZCAtIDE7IGkgPj0gcmFuZ2Uuc3RhcnQ7IGktLSkge1xuXHRcdFx0XHRjb25zdCBpdGVtID0gdGhpcy5pdGVtc1tpXTtcblx0XHRcdFx0Y29uc3Qgcm93cyA9IHJvd3NUb0Rpc3Bvc2UuZ2V0KGl0ZW0udGVtcGxhdGVJZCk7XG5cdFx0XHRcdGNvbnN0IHJvdyA9IHJvd3M/LnBvcCgpO1xuXHRcdFx0XHR0aGlzLmluc2VydEl0ZW1JbkRPTShpLCByb3cpO1xuXHRcdFx0XHRpbnNlcnRlZEl0ZW1zLnB1c2goaXRlbSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCByb3dzIG9mIHJvd3NUb0Rpc3Bvc2UudmFsdWVzKCkpIHtcblx0XHRcdGZvciAoY29uc3Qgcm93IG9mIHJvd3MpIHtcblx0XHRcdFx0dGhpcy5jYWNoZS5yZWxlYXNlKHJvdyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaG9yaXpvbnRhbFNjcm9sbGluZyAmJiBpbnNlcnRlZEl0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMubWVhc3VyZUl0ZW1XaWR0aHMoaW5zZXJ0ZWRJdGVtcyk7XG5cdFx0XHR0aGlzLmV2ZW50dWFsbHlVcGRhdGVTY3JvbGxXaWR0aCgpO1xuXHRcdH1cblxuXHRcdHRoaXMuZXZlbnR1YWxseVVwZGF0ZVNjcm9sbERpbWVuc2lvbnMoKTtcblxuXHRcdGlmICh0aGlzLnN1cHBvcnREeW5hbWljSGVpZ2h0cykge1xuXHRcdFx0dGhpcy5fcmVyZW5kZXIodGhpcy5zY3JvbGxUb3AsIHRoaXMucmVuZGVySGVpZ2h0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZGVsZXRlZC5tYXAoaSA9PiBpLmVsZW1lbnQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGV2ZW50dWFsbHlVcGRhdGVTY3JvbGxEaW1lbnNpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Njcm9sbEhlaWdodCA9IHRoaXMuY29udGVudEhlaWdodDtcblx0XHR0aGlzLnJvd3NDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7dGhpcy5fc2Nyb2xsSGVpZ2h0fXB4YDtcblxuXHRcdGlmICghdGhpcy5zY3JvbGxhYmxlRWxlbWVudFVwZGF0ZURpc3Bvc2FibGUpIHtcblx0XHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnRVcGRhdGVEaXNwb3NhYmxlID0gc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShnZXRXaW5kb3codGhpcy5kb21Ob2RlKSwgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50LnNldFNjcm9sbERpbWVuc2lvbnMoeyBzY3JvbGxIZWlnaHQ6IHRoaXMuc2Nyb2xsSGVpZ2h0IH0pO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVNjcm9sbFdpZHRoKCk7XG5cdFx0XHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnRVcGRhdGVEaXNwb3NhYmxlID0gbnVsbDtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZXZlbnR1YWxseVVwZGF0ZVNjcm9sbFdpZHRoKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5ob3Jpem9udGFsU2Nyb2xsaW5nKSB7XG5cdFx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50V2lkdGhEZWxheWVyLmNhbmNlbCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnRXaWR0aERlbGF5ZXIudHJpZ2dlcigoKSA9PiB0aGlzLnVwZGF0ZVNjcm9sbFdpZHRoKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTY3JvbGxXaWR0aCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaG9yaXpvbnRhbFNjcm9sbGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBzY3JvbGxXaWR0aCA9IDA7XG5cblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdGhpcy5pdGVtcykge1xuXHRcdFx0aWYgKHR5cGVvZiBpdGVtLndpZHRoICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRzY3JvbGxXaWR0aCA9IE1hdGgubWF4KHNjcm9sbFdpZHRoLCBpdGVtLndpZHRoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnNjcm9sbFdpZHRoID0gc2Nyb2xsV2lkdGg7XG5cdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudC5zZXRTY3JvbGxEaW1lbnNpb25zKHsgc2Nyb2xsV2lkdGg6IHNjcm9sbFdpZHRoID09PSAwID8gMCA6IChzY3JvbGxXaWR0aCArIDEwKSB9KTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnRXaWR0aC5maXJlKHRoaXMuc2Nyb2xsV2lkdGgpO1xuXHR9XG5cblx0dXBkYXRlV2lkdGgoaW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5ob3Jpem9udGFsU2Nyb2xsaW5nIHx8IHR5cGVvZiB0aGlzLnNjcm9sbFdpZHRoID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLml0ZW1zW2luZGV4XTtcblx0XHR0aGlzLm1lYXN1cmVJdGVtV2lkdGhzKFtpdGVtXSk7XG5cblx0XHRpZiAodHlwZW9mIGl0ZW0ud2lkdGggIT09ICd1bmRlZmluZWQnICYmIGl0ZW0ud2lkdGggPiB0aGlzLnNjcm9sbFdpZHRoKSB7XG5cdFx0XHR0aGlzLnNjcm9sbFdpZHRoID0gaXRlbS53aWR0aDtcblx0XHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuc2V0U2Nyb2xsRGltZW5zaW9ucyh7IHNjcm9sbFdpZHRoOiB0aGlzLnNjcm9sbFdpZHRoICsgMTAgfSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnRXaWR0aC5maXJlKHRoaXMuc2Nyb2xsV2lkdGgpO1xuXHRcdH1cblx0fVxuXG5cdHJlcmVuZGVyKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5zdXBwb3J0RHluYW1pY0hlaWdodHMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdGhpcy5pdGVtcykge1xuXHRcdFx0aXRlbS5sYXN0RHluYW1pY0hlaWdodFdpZHRoID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlcmVuZGVyKHRoaXMubGFzdFJlbmRlclRvcCwgdGhpcy5sYXN0UmVuZGVySGVpZ2h0KTtcblx0fVxuXG5cdGdldCBsZW5ndGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5pdGVtcy5sZW5ndGg7XG5cdH1cblxuXHRnZXQgcmVuZGVySGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0Y29uc3Qgc2Nyb2xsRGltZW5zaW9ucyA9IHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuZ2V0U2Nyb2xsRGltZW5zaW9ucygpO1xuXHRcdHJldHVybiBzY3JvbGxEaW1lbnNpb25zLmhlaWdodDtcblx0fVxuXG5cdGdldCBmaXJzdFZpc2libGVJbmRleCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IHJhbmdlID0gdGhpcy5nZXRWaXNpYmxlUmFuZ2UodGhpcy5sYXN0UmVuZGVyVG9wLCB0aGlzLmxhc3RSZW5kZXJIZWlnaHQpO1xuXHRcdHJldHVybiByYW5nZS5zdGFydDtcblx0fVxuXG5cdGdldCBmaXJzdE1vc3RseVZpc2libGVJbmRleCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IGZpcnN0VmlzaWJsZUluZGV4ID0gdGhpcy5maXJzdFZpc2libGVJbmRleDtcblx0XHRjb25zdCBmaXJzdEVsVG9wID0gdGhpcy5yYW5nZU1hcC5wb3NpdGlvbkF0KGZpcnN0VmlzaWJsZUluZGV4KTtcblx0XHRjb25zdCBuZXh0RWxUb3AgPSB0aGlzLnJhbmdlTWFwLnBvc2l0aW9uQXQoZmlyc3RWaXNpYmxlSW5kZXggKyAxKTtcblx0XHRpZiAobmV4dEVsVG9wICE9PSAtMSkge1xuXHRcdFx0Y29uc3QgZmlyc3RFbE1pZHBvaW50ID0gKG5leHRFbFRvcCAtIGZpcnN0RWxUb3ApIC8gMiArIGZpcnN0RWxUb3A7XG5cdFx0XHRpZiAoZmlyc3RFbE1pZHBvaW50IDwgdGhpcy5zY3JvbGxUb3ApIHtcblx0XHRcdFx0cmV0dXJuIGZpcnN0VmlzaWJsZUluZGV4ICsgMTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmlyc3RWaXNpYmxlSW5kZXg7XG5cdH1cblxuXHRnZXQgbGFzdFZpc2libGVJbmRleCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IHJhbmdlID0gdGhpcy5nZXRSZW5kZXJSYW5nZSh0aGlzLmxhc3RSZW5kZXJUb3AsIHRoaXMubGFzdFJlbmRlckhlaWdodCk7XG5cdFx0cmV0dXJuIHJhbmdlLmVuZCAtIDE7XG5cdH1cblxuXHRlbGVtZW50KGluZGV4OiBudW1iZXIpOiBUIHtcblx0XHRyZXR1cm4gdGhpcy5pdGVtc1tpbmRleF0uZWxlbWVudDtcblx0fVxuXG5cdGluZGV4T2YoZWxlbWVudDogVCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuaXRlbXMuZmluZEluZGV4KGl0ZW0gPT4gaXRlbS5lbGVtZW50ID09PSBlbGVtZW50KTtcblx0fVxuXG5cdGRvbUVsZW1lbnQoaW5kZXg6IG51bWJlcik6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG5cdFx0Y29uc3Qgcm93ID0gdGhpcy5pdGVtc1tpbmRleF0ucm93O1xuXHRcdHJldHVybiByb3cgJiYgcm93LmRvbU5vZGU7XG5cdH1cblxuXHRlbGVtZW50SGVpZ2h0KGluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLml0ZW1zW2luZGV4XS5zaXplO1xuXHR9XG5cblx0ZWxlbWVudFRvcChpbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5yYW5nZU1hcC5wb3NpdGlvbkF0KGluZGV4KTtcblx0fVxuXG5cdGluZGV4QXQocG9zaXRpb246IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMucmFuZ2VNYXAuaW5kZXhBdChwb3NpdGlvbik7XG5cdH1cblxuXHRpbmRleEFmdGVyKHBvc2l0aW9uOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnJhbmdlTWFwLmluZGV4QWZ0ZXIocG9zaXRpb24pO1xuXHR9XG5cblx0bGF5b3V0KGhlaWdodD86IG51bWJlciwgd2lkdGg/OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBzY3JvbGxEaW1lbnNpb25zOiBJTmV3U2Nyb2xsRGltZW5zaW9ucyA9IHtcblx0XHRcdGhlaWdodDogdHlwZW9mIGhlaWdodCA9PT0gJ251bWJlcicgPyBoZWlnaHQgOiBnZXRDb250ZW50SGVpZ2h0KHRoaXMuZG9tTm9kZSlcblx0XHR9O1xuXG5cdFx0aWYgKHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnRVcGRhdGVEaXNwb3NhYmxlKSB7XG5cdFx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50VXBkYXRlRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50VXBkYXRlRGlzcG9zYWJsZSA9IG51bGw7XG5cdFx0XHRzY3JvbGxEaW1lbnNpb25zLnNjcm9sbEhlaWdodCA9IHRoaXMuc2Nyb2xsSGVpZ2h0O1xuXHRcdH1cblxuXHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuc2V0U2Nyb2xsRGltZW5zaW9ucyhzY3JvbGxEaW1lbnNpb25zKTtcblxuXHRcdGlmICh0eXBlb2Ygd2lkdGggIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGlzLnJlbmRlcldpZHRoID0gd2lkdGg7XG5cblx0XHRcdGlmICh0aGlzLnN1cHBvcnREeW5hbWljSGVpZ2h0cykge1xuXHRcdFx0XHR0aGlzLl9yZXJlbmRlcih0aGlzLnNjcm9sbFRvcCwgdGhpcy5yZW5kZXJIZWlnaHQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmhvcml6b250YWxTY3JvbGxpbmcpIHtcblx0XHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuc2V0U2Nyb2xsRGltZW5zaW9ucyh7XG5cdFx0XHRcdHdpZHRoOiB0eXBlb2Ygd2lkdGggPT09ICdudW1iZXInID8gd2lkdGggOiBnZXRDb250ZW50V2lkdGgodGhpcy5kb21Ob2RlKVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHNjcm9sbFBvcyA9IHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuZ2V0U2Nyb2xsUG9zaXRpb24oKTtcblx0XHRcdGNvbnN0IHNjcm9sbERpbXMgPSB0aGlzLnNjcm9sbGFibGVFbGVtZW50LmdldFNjcm9sbERpbWVuc2lvbnMoKTtcblx0XHRcdGNvbnN0IHJpZ2h0T2Zmc2V0ID0gTWF0aC5tYXgoMCwgc2Nyb2xsRGltcy5zY3JvbGxXaWR0aCAtIHNjcm9sbFBvcy5zY3JvbGxMZWZ0IC0gdGhpcy5yZW5kZXJXaWR0aCk7XG5cdFx0XHR0aGlzLmRvbU5vZGUuc3R5bGUuc2V0UHJvcGVydHkoJy0tbGlzdC1zY3JvbGwtcmlnaHQtb2Zmc2V0JywgYCR7TWF0aC5tYXgocmlnaHRPZmZzZXQgLSAxMiwgMCl9cHhgKTtcblx0XHR9XG5cdH1cblxuXHQvLyBSZW5kZXJcblxuXHRwcm90ZWN0ZWQgcmVuZGVyKHByZXZpb3VzUmVuZGVyUmFuZ2U6IElSYW5nZSwgcmVuZGVyVG9wOiBudW1iZXIsIHJlbmRlckhlaWdodDogbnVtYmVyLCByZW5kZXJMZWZ0OiBudW1iZXIgfCB1bmRlZmluZWQsIHNjcm9sbFdpZHRoOiBudW1iZXIgfCB1bmRlZmluZWQsIHVwZGF0ZUl0ZW1zSW5ET006IGJvb2xlYW4gPSBmYWxzZSwgb25TY3JvbGw6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdGNvbnN0IHJlbmRlclJhbmdlID0gdGhpcy5nZXRSZW5kZXJSYW5nZShyZW5kZXJUb3AsIHJlbmRlckhlaWdodCk7XG5cblx0XHRjb25zdCByYW5nZXNUb0luc2VydCA9IFJhbmdlLnJlbGF0aXZlQ29tcGxlbWVudChyZW5kZXJSYW5nZSwgcHJldmlvdXNSZW5kZXJSYW5nZSkucmV2ZXJzZSgpO1xuXHRcdGNvbnN0IHJhbmdlc1RvUmVtb3ZlID0gUmFuZ2UucmVsYXRpdmVDb21wbGVtZW50KHByZXZpb3VzUmVuZGVyUmFuZ2UsIHJlbmRlclJhbmdlKTtcblxuXHRcdGlmICh1cGRhdGVJdGVtc0luRE9NKSB7XG5cdFx0XHRjb25zdCByYW5nZXNUb1VwZGF0ZSA9IFJhbmdlLmludGVyc2VjdChwcmV2aW91c1JlbmRlclJhbmdlLCByZW5kZXJSYW5nZSk7XG5cblx0XHRcdGZvciAobGV0IGkgPSByYW5nZXNUb1VwZGF0ZS5zdGFydDsgaSA8IHJhbmdlc1RvVXBkYXRlLmVuZDsgaSsrKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlSXRlbUluRE9NKHRoaXMuaXRlbXNbaV0sIGkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGluc2VydGVkSXRlbXM6IElJdGVtPFQ+W10gPSBbXTtcblxuXHRcdHRoaXMuY2FjaGUudHJhbnNhY3QoKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCByYW5nZSBvZiByYW5nZXNUb1JlbW92ZSkge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gcmFuZ2Uuc3RhcnQ7IGkgPCByYW5nZS5lbmQ7IGkrKykge1xuXHRcdFx0XHRcdHRoaXMucmVtb3ZlSXRlbUZyb21ET00oaSwgb25TY3JvbGwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgcmFuZ2Ugb2YgcmFuZ2VzVG9JbnNlcnQpIHtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IHJhbmdlLmVuZCAtIDE7IGkgPj0gcmFuZ2Uuc3RhcnQ7IGktLSkge1xuXHRcdFx0XHRcdHRoaXMuaW5zZXJ0SXRlbUluRE9NKGkpO1xuXHRcdFx0XHRcdGluc2VydGVkSXRlbXMucHVzaCh0aGlzLml0ZW1zW2ldKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKHRoaXMuaG9yaXpvbnRhbFNjcm9sbGluZyAmJiBpbnNlcnRlZEl0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMubWVhc3VyZUl0ZW1XaWR0aHMoaW5zZXJ0ZWRJdGVtcyk7XG5cdFx0XHR0aGlzLmV2ZW50dWFsbHlVcGRhdGVTY3JvbGxXaWR0aCgpO1xuXHRcdH1cblxuXHRcdGlmIChyZW5kZXJMZWZ0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMucm93c0NvbnRhaW5lci5zdHlsZS5sZWZ0ID0gYC0ke3JlbmRlckxlZnR9cHhgO1xuXHRcdH1cblxuXHRcdHRoaXMucm93c0NvbnRhaW5lci5zdHlsZS50b3AgPSBgLSR7cmVuZGVyVG9wfXB4YDtcblxuXHRcdGlmICh0aGlzLmhvcml6b250YWxTY3JvbGxpbmcgJiYgc2Nyb2xsV2lkdGggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5yb3dzQ29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7TWF0aC5tYXgoc2Nyb2xsV2lkdGgsIHRoaXMucmVuZGVyV2lkdGgpfXB4YDtcblx0XHRcdGNvbnN0IHJpZ2h0T2Zmc2V0ID0gTWF0aC5tYXgoMCwgc2Nyb2xsV2lkdGggLSAocmVuZGVyTGVmdCA/PyAwKSAtIHRoaXMucmVuZGVyV2lkdGgpO1xuXHRcdFx0dGhpcy5kb21Ob2RlLnN0eWxlLnNldFByb3BlcnR5KCctLWxpc3Qtc2Nyb2xsLXJpZ2h0LW9mZnNldCcsIGAke01hdGgubWF4KHJpZ2h0T2Zmc2V0IC0gMTIsIDApfXB4YCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5sYXN0UmVuZGVyVG9wID0gcmVuZGVyVG9wO1xuXHRcdHRoaXMubGFzdFJlbmRlckhlaWdodCA9IHJlbmRlckhlaWdodDtcblx0fVxuXG5cdC8vIERPTSBvcGVyYXRpb25zXG5cblx0cHJpdmF0ZSBpbnNlcnRJdGVtSW5ET00oaW5kZXg6IG51bWJlciwgcm93PzogSVJvdyk6IHZvaWQge1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLml0ZW1zW2luZGV4XTtcblxuXHRcdGlmICghaXRlbS5yb3cpIHtcblx0XHRcdGlmIChyb3cpIHtcblx0XHRcdFx0aXRlbS5yb3cgPSByb3c7XG5cdFx0XHRcdGl0ZW0uc3RhbGUgPSB0cnVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5jYWNoZS5hbGxvYyhpdGVtLnRlbXBsYXRlSWQpO1xuXHRcdFx0XHRpdGVtLnJvdyA9IHJlc3VsdC5yb3c7XG5cdFx0XHRcdGl0ZW0uc3RhbGUgfHw9IHJlc3VsdC5pc1JldXNpbmdDb25uZWN0ZWREb21Ob2RlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHJvbGUgPSB0aGlzLmFjY2Vzc2liaWxpdHlQcm92aWRlci5nZXRSb2xlKGl0ZW0uZWxlbWVudCkgfHwgJ2xpc3RpdGVtJztcblx0XHRpdGVtLnJvdy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgncm9sZScsIHJvbGUpO1xuXG5cdFx0Y29uc3QgY2hlY2tlZCA9IHRoaXMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyLmlzQ2hlY2tlZChpdGVtLmVsZW1lbnQpO1xuXHRcdGNvbnN0IHRvQXJpYVN0YXRlID0gKHZhbHVlOiBDaGVja0JveEFjY2Vzc2libGVTdGF0ZSkgPT4gdmFsdWUgPT09ICdtaXhlZCcgPyAnbWl4ZWQnIDogU3RyaW5nKCEhdmFsdWUpO1xuXG5cdFx0aWYgKHR5cGVvZiBjaGVja2VkID09PSAnYm9vbGVhbicgfHwgY2hlY2tlZCA9PT0gJ21peGVkJykge1xuXHRcdFx0aXRlbS5yb3cuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcsIHRvQXJpYVN0YXRlKGNoZWNrZWQpKTtcblx0XHR9IGVsc2UgaWYgKGNoZWNrZWQpIHtcblx0XHRcdGNvbnN0IHVwZGF0ZSA9ICh2YWx1ZTogQ2hlY2tCb3hBY2Nlc3NpYmxlU3RhdGUpID0+IGl0ZW0ucm93IS5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJywgdG9BcmlhU3RhdGUodmFsdWUpKTtcblx0XHRcdHVwZGF0ZShjaGVja2VkLnZhbHVlKTtcblx0XHRcdGl0ZW0uY2hlY2tlZERpc3Bvc2FibGUgPSBjaGVja2VkLm9uRGlkQ2hhbmdlKCgpID0+IHVwZGF0ZShjaGVja2VkLnZhbHVlKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGl0ZW0uc3RhbGUgfHwgIWl0ZW0ucm93LmRvbU5vZGUucGFyZW50RWxlbWVudCkge1xuXHRcdFx0Y29uc3QgcmVmZXJlbmNlTm9kZSA9IHRoaXMuaXRlbXMuYXQoaW5kZXggKyAxKT8ucm93Py5kb21Ob2RlID8/IG51bGw7XG5cdFx0XHRpZiAoaXRlbS5yb3cuZG9tTm9kZS5wYXJlbnRFbGVtZW50ICE9PSB0aGlzLnJvd3NDb250YWluZXIgfHwgaXRlbS5yb3cuZG9tTm9kZS5uZXh0RWxlbWVudFNpYmxpbmcgIT09IHJlZmVyZW5jZU5vZGUpIHtcblx0XHRcdFx0dGhpcy5yb3dzQ29udGFpbmVyLmluc2VydEJlZm9yZShpdGVtLnJvdy5kb21Ob2RlLCByZWZlcmVuY2VOb2RlKTtcblx0XHRcdH1cblx0XHRcdGl0ZW0uc3RhbGUgPSBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZUl0ZW1JbkRPTShpdGVtLCBpbmRleCk7XG5cblx0XHRjb25zdCByZW5kZXJlciA9IHRoaXMucmVuZGVyZXJzLmdldChpdGVtLnRlbXBsYXRlSWQpO1xuXG5cdFx0aWYgKCFyZW5kZXJlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyByZW5kZXJlciBmb3VuZCBmb3IgdGVtcGxhdGUgaWQgJHtpdGVtLnRlbXBsYXRlSWR9YCk7XG5cdFx0fVxuXG5cdFx0cmVuZGVyZXI/LnJlbmRlckVsZW1lbnQoaXRlbS5lbGVtZW50LCBpbmRleCwgaXRlbS5yb3cudGVtcGxhdGVEYXRhLCB7IGhlaWdodDogaXRlbS5zaXplIH0pO1xuXG5cdFx0Y29uc3QgdXJpID0gdGhpcy5kbmQuZ2V0RHJhZ1VSSShpdGVtLmVsZW1lbnQpO1xuXHRcdGl0ZW0uZHJhZ1N0YXJ0RGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0aXRlbS5yb3cuZG9tTm9kZS5kcmFnZ2FibGUgPSAhIXVyaTtcblxuXHRcdGlmICh1cmkpIHtcblx0XHRcdGl0ZW0uZHJhZ1N0YXJ0RGlzcG9zYWJsZSA9IGFkZERpc3Bvc2FibGVMaXN0ZW5lcihpdGVtLnJvdy5kb21Ob2RlLCAnZHJhZ3N0YXJ0JywgZXZlbnQgPT4gdGhpcy5vbkRyYWdTdGFydChpdGVtLmVsZW1lbnQsIHVyaSwgZXZlbnQpKTtcblx0XHR9XG5cblx0fVxuXG5cdHByaXZhdGUgbWVhc3VyZUl0ZW1XaWR0aHMoaXRlbXM6IHJlYWRvbmx5IElJdGVtPFQ+W10pOiB2b2lkIHtcblx0XHRjb25zdCBpdGVtc1dpdGhSb3dzOiB7IGl0ZW06IElJdGVtPFQ+OyBkb21Ob2RlOiBIVE1MRWxlbWVudCB9W10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuXHRcdFx0aWYgKGl0ZW0ucm93KSB7XG5cdFx0XHRcdGl0ZW1zV2l0aFJvd3MucHVzaCh7IGl0ZW0sIGRvbU5vZGU6IGl0ZW0ucm93LmRvbU5vZGUgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCB7IGRvbU5vZGUgfSBvZiBpdGVtc1dpdGhSb3dzKSB7XG5cdFx0XHRkb21Ob2RlLnN0eWxlLndpZHRoID0gJ2ZpdC1jb250ZW50Jztcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHsgaXRlbSwgZG9tTm9kZSB9IG9mIGl0ZW1zV2l0aFJvd3MpIHtcblx0XHRcdGl0ZW0ud2lkdGggPSBnZXRDb250ZW50V2lkdGgoZG9tTm9kZSk7XG5cdFx0XHRjb25zdCBzdHlsZSA9IGdldFdpbmRvdyhkb21Ob2RlKS5nZXRDb21wdXRlZFN0eWxlKGRvbU5vZGUpO1xuXG5cdFx0XHRpZiAoc3R5bGUucGFkZGluZ0xlZnQpIHtcblx0XHRcdFx0aXRlbS53aWR0aCArPSBwYXJzZUZsb2F0KHN0eWxlLnBhZGRpbmdMZWZ0KTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHN0eWxlLnBhZGRpbmdSaWdodCkge1xuXHRcdFx0XHRpdGVtLndpZHRoICs9IHBhcnNlRmxvYXQoc3R5bGUucGFkZGluZ1JpZ2h0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHsgZG9tTm9kZSB9IG9mIGl0ZW1zV2l0aFJvd3MpIHtcblx0XHRcdGRvbU5vZGUuc3R5bGUud2lkdGggPSAnJztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUl0ZW1JbkRPTShpdGVtOiBJSXRlbTxUPiwgaW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdGl0ZW0ucm93IS5kb21Ob2RlLnN0eWxlLnRvcCA9IGAke3RoaXMuZWxlbWVudFRvcChpbmRleCl9cHhgO1xuXG5cdFx0aWYgKHRoaXMuc2V0Um93SGVpZ2h0KSB7XG5cdFx0XHRpdGVtLnJvdyEuZG9tTm9kZS5zdHlsZS5oZWlnaHQgPSBgJHtpdGVtLnNpemV9cHhgO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnNldFJvd0xpbmVIZWlnaHQpIHtcblx0XHRcdGl0ZW0ucm93IS5kb21Ob2RlLnN0eWxlLmxpbmVIZWlnaHQgPSBgJHtpdGVtLnNpemV9cHhgO1xuXHRcdH1cblxuXHRcdGl0ZW0ucm93IS5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnZGF0YS1pbmRleCcsIGAke2luZGV4fWApO1xuXHRcdGl0ZW0ucm93IS5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnZGF0YS1sYXN0LWVsZW1lbnQnLCBpbmRleCA9PT0gdGhpcy5sZW5ndGggLSAxID8gJ3RydWUnIDogJ2ZhbHNlJyk7XG5cdFx0aXRlbS5yb3chLmRvbU5vZGUuc2V0QXR0cmlidXRlKCdkYXRhLXBhcml0eScsIGluZGV4ICUgMiA9PT0gMCA/ICdldmVuJyA6ICdvZGQnKTtcblx0XHRpdGVtLnJvdyEuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtc2V0c2l6ZScsIFN0cmluZyh0aGlzLmFjY2Vzc2liaWxpdHlQcm92aWRlci5nZXRTZXRTaXplKGl0ZW0uZWxlbWVudCwgaW5kZXgsIHRoaXMubGVuZ3RoKSkpO1xuXHRcdGl0ZW0ucm93IS5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1wb3NpbnNldCcsIFN0cmluZyh0aGlzLmFjY2Vzc2liaWxpdHlQcm92aWRlci5nZXRQb3NJblNldChpdGVtLmVsZW1lbnQsIGluZGV4KSkpO1xuXHRcdGl0ZW0ucm93IS5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnaWQnLCB0aGlzLmdldEVsZW1lbnREb21JZChpbmRleCkpO1xuXG5cdFx0aXRlbS5yb3chLmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnZHJvcC10YXJnZXQnLCBpdGVtLmRyb3BUYXJnZXQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW1vdmVJdGVtRnJvbURPTShpbmRleDogbnVtYmVyLCBvblNjcm9sbD86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBpdGVtID0gdGhpcy5pdGVtc1tpbmRleF07XG5cdFx0aXRlbS5kcmFnU3RhcnREaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRpdGVtLmNoZWNrZWREaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblxuXHRcdGlmIChpdGVtLnJvdykge1xuXHRcdFx0Y29uc3QgcmVuZGVyZXIgPSB0aGlzLnJlbmRlcmVycy5nZXQoaXRlbS50ZW1wbGF0ZUlkKTtcblxuXHRcdFx0aWYgKHJlbmRlcmVyICYmIHJlbmRlcmVyLmRpc3Bvc2VFbGVtZW50KSB7XG5cdFx0XHRcdHJlbmRlcmVyLmRpc3Bvc2VFbGVtZW50KGl0ZW0uZWxlbWVudCwgaW5kZXgsIGl0ZW0ucm93LnRlbXBsYXRlRGF0YSwgeyBoZWlnaHQ6IGl0ZW0uc2l6ZSwgb25TY3JvbGwgfSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuY2FjaGUucmVsZWFzZShpdGVtLnJvdyk7XG5cdFx0XHRpdGVtLnJvdyA9IG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaG9yaXpvbnRhbFNjcm9sbGluZykge1xuXHRcdFx0dGhpcy5ldmVudHVhbGx5VXBkYXRlU2Nyb2xsV2lkdGgoKTtcblx0XHR9XG5cdH1cblxuXHRnZXRTY3JvbGxUb3AoKTogbnVtYmVyIHtcblx0XHRjb25zdCBzY3JvbGxQb3NpdGlvbiA9IHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuZ2V0U2Nyb2xsUG9zaXRpb24oKTtcblx0XHRyZXR1cm4gc2Nyb2xsUG9zaXRpb24uc2Nyb2xsVG9wO1xuXHR9XG5cblx0c2V0U2Nyb2xsVG9wKHNjcm9sbFRvcDogbnVtYmVyLCByZXVzZUFuaW1hdGlvbj86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5zY3JvbGxhYmxlRWxlbWVudFVwZGF0ZURpc3Bvc2FibGUpIHtcblx0XHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnRVcGRhdGVEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnRVcGRhdGVEaXNwb3NhYmxlID0gbnVsbDtcblx0XHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuc2V0U2Nyb2xsRGltZW5zaW9ucyh7IHNjcm9sbEhlaWdodDogdGhpcy5zY3JvbGxIZWlnaHQgfSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudC5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbFRvcCwgcmV1c2VBbmltYXRpb24gfSk7XG5cdH1cblxuXHRnZXRTY3JvbGxMZWZ0KCk6IG51bWJlciB7XG5cdFx0Y29uc3Qgc2Nyb2xsUG9zaXRpb24gPSB0aGlzLnNjcm9sbGFibGVFbGVtZW50LmdldFNjcm9sbFBvc2l0aW9uKCk7XG5cdFx0cmV0dXJuIHNjcm9sbFBvc2l0aW9uLnNjcm9sbExlZnQ7XG5cdH1cblxuXHRzZXRTY3JvbGxMZWZ0KHNjcm9sbExlZnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLnNjcm9sbGFibGVFbGVtZW50VXBkYXRlRGlzcG9zYWJsZSkge1xuXHRcdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudFVwZGF0ZURpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudFVwZGF0ZURpc3Bvc2FibGUgPSBudWxsO1xuXHRcdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudC5zZXRTY3JvbGxEaW1lbnNpb25zKHsgc2Nyb2xsV2lkdGg6IHRoaXMuc2Nyb2xsV2lkdGggfSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudC5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbExlZnQgfSk7XG5cdH1cblxuXG5cdGdldCBzY3JvbGxUb3AoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRTY3JvbGxUb3AoKTtcblx0fVxuXG5cdHNldCBzY3JvbGxUb3Aoc2Nyb2xsVG9wOiBudW1iZXIpIHtcblx0XHR0aGlzLnNldFNjcm9sbFRvcChzY3JvbGxUb3ApO1xuXHR9XG5cblx0Z2V0IHNjcm9sbEhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9zY3JvbGxIZWlnaHQgKyAodGhpcy5ob3Jpem9udGFsU2Nyb2xsaW5nID8gMTAgOiAwKSArIHRoaXMucGFkZGluZ0JvdHRvbTtcblx0fVxuXG5cdC8vIEV2ZW50c1xuXG5cdEBtZW1vaXplIGdldCBvbk1vdXNlQ2xpY2soKTogRXZlbnQ8SUxpc3RNb3VzZUV2ZW50PFQ+PiB7IHJldHVybiBFdmVudC5tYXAodGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IERvbUVtaXR0ZXIodGhpcy5kb21Ob2RlLCAnY2xpY2snKSkuZXZlbnQsIGUgPT4gdGhpcy50b01vdXNlRXZlbnQoZSksIHRoaXMuZGlzcG9zYWJsZXMpOyB9XG5cdEBtZW1vaXplIGdldCBvbk1vdXNlRGJsQ2xpY2soKTogRXZlbnQ8SUxpc3RNb3VzZUV2ZW50PFQ+PiB7IHJldHVybiBFdmVudC5tYXAodGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IERvbUVtaXR0ZXIodGhpcy5kb21Ob2RlLCAnZGJsY2xpY2snKSkuZXZlbnQsIGUgPT4gdGhpcy50b01vdXNlRXZlbnQoZSksIHRoaXMuZGlzcG9zYWJsZXMpOyB9XG5cdEBtZW1vaXplIGdldCBvbk1vdXNlTWlkZGxlQ2xpY2soKTogRXZlbnQ8SUxpc3RNb3VzZUV2ZW50PFQ+PiB7IHJldHVybiBFdmVudC5maWx0ZXIoRXZlbnQubWFwKHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBEb21FbWl0dGVyKHRoaXMuZG9tTm9kZSwgJ2F1eGNsaWNrJykpLmV2ZW50LCBlID0+IHRoaXMudG9Nb3VzZUV2ZW50KGUgYXMgTW91c2VFdmVudCksIHRoaXMuZGlzcG9zYWJsZXMpLCBlID0+IGUuYnJvd3NlckV2ZW50LmJ1dHRvbiA9PT0gMSwgdGhpcy5kaXNwb3NhYmxlcyk7IH1cblx0QG1lbW9pemUgZ2V0IG9uTW91c2VVcCgpOiBFdmVudDxJTGlzdE1vdXNlRXZlbnQ8VD4+IHsgcmV0dXJuIEV2ZW50Lm1hcCh0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRG9tRW1pdHRlcih0aGlzLmRvbU5vZGUsICdtb3VzZXVwJykpLmV2ZW50LCBlID0+IHRoaXMudG9Nb3VzZUV2ZW50KGUpLCB0aGlzLmRpc3Bvc2FibGVzKTsgfVxuXHRAbWVtb2l6ZSBnZXQgb25Nb3VzZURvd24oKTogRXZlbnQ8SUxpc3RNb3VzZUV2ZW50PFQ+PiB7IHJldHVybiBFdmVudC5tYXAodGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IERvbUVtaXR0ZXIodGhpcy5kb21Ob2RlLCAnbW91c2Vkb3duJykpLmV2ZW50LCBlID0+IHRoaXMudG9Nb3VzZUV2ZW50KGUpLCB0aGlzLmRpc3Bvc2FibGVzKTsgfVxuXHRAbWVtb2l6ZSBnZXQgb25Nb3VzZU92ZXIoKTogRXZlbnQ8SUxpc3RNb3VzZUV2ZW50PFQ+PiB7IHJldHVybiBFdmVudC5tYXAodGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IERvbUVtaXR0ZXIodGhpcy5kb21Ob2RlLCAnbW91c2VvdmVyJykpLmV2ZW50LCBlID0+IHRoaXMudG9Nb3VzZUV2ZW50KGUpLCB0aGlzLmRpc3Bvc2FibGVzKTsgfVxuXHRAbWVtb2l6ZSBnZXQgb25Nb3VzZU1vdmUoKTogRXZlbnQ8SUxpc3RNb3VzZUV2ZW50PFQ+PiB7IHJldHVybiBFdmVudC5tYXAodGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IERvbUVtaXR0ZXIodGhpcy5kb21Ob2RlLCAnbW91c2Vtb3ZlJykpLmV2ZW50LCBlID0+IHRoaXMudG9Nb3VzZUV2ZW50KGUpLCB0aGlzLmRpc3Bvc2FibGVzKTsgfVxuXHRAbWVtb2l6ZSBnZXQgb25Nb3VzZU91dCgpOiBFdmVudDxJTGlzdE1vdXNlRXZlbnQ8VD4+IHsgcmV0dXJuIEV2ZW50Lm1hcCh0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRG9tRW1pdHRlcih0aGlzLmRvbU5vZGUsICdtb3VzZW91dCcpKS5ldmVudCwgZSA9PiB0aGlzLnRvTW91c2VFdmVudChlKSwgdGhpcy5kaXNwb3NhYmxlcyk7IH1cblx0QG1lbW9pemUgZ2V0IG9uQ29udGV4dE1lbnUoKTogRXZlbnQ8SUxpc3RNb3VzZUV2ZW50PFQ+IHwgSUxpc3RHZXN0dXJlRXZlbnQ8VD4+IHsgcmV0dXJuIEV2ZW50LmFueTxJTGlzdE1vdXNlRXZlbnQ8YW55PiB8IElMaXN0R2VzdHVyZUV2ZW50PGFueT4+KEV2ZW50Lm1hcCh0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRG9tRW1pdHRlcih0aGlzLmRvbU5vZGUsICdjb250ZXh0bWVudScpKS5ldmVudCwgZSA9PiB0aGlzLnRvTW91c2VFdmVudChlKSwgdGhpcy5kaXNwb3NhYmxlcyksIEV2ZW50Lm1hcCh0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRG9tRW1pdHRlcih0aGlzLmRvbU5vZGUsIFRvdWNoRXZlbnRUeXBlLkNvbnRleHRtZW51KSkuZXZlbnQsIGUgPT4gdGhpcy50b0dlc3R1cmVFdmVudChlKSwgdGhpcy5kaXNwb3NhYmxlcykpOyB9XG5cdEBtZW1vaXplIGdldCBvblRvdWNoU3RhcnQoKTogRXZlbnQ8SUxpc3RUb3VjaEV2ZW50PFQ+PiB7IHJldHVybiBFdmVudC5tYXAodGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IERvbUVtaXR0ZXIodGhpcy5kb21Ob2RlLCAndG91Y2hzdGFydCcpKS5ldmVudCwgZSA9PiB0aGlzLnRvVG91Y2hFdmVudChlKSwgdGhpcy5kaXNwb3NhYmxlcyk7IH1cblx0QG1lbW9pemUgZ2V0IG9uVGFwKCk6IEV2ZW50PElMaXN0R2VzdHVyZUV2ZW50PFQ+PiB7IHJldHVybiBFdmVudC5tYXAodGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IERvbUVtaXR0ZXIodGhpcy5yb3dzQ29udGFpbmVyLCBUb3VjaEV2ZW50VHlwZS5UYXApKS5ldmVudCwgZSA9PiB0aGlzLnRvR2VzdHVyZUV2ZW50KGUpLCB0aGlzLmRpc3Bvc2FibGVzKTsgfVxuXG5cdHByaXZhdGUgdG9Nb3VzZUV2ZW50KGJyb3dzZXJFdmVudDogTW91c2VFdmVudCk6IElMaXN0TW91c2VFdmVudDxUPiB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLmdldEl0ZW1JbmRleEZyb21FdmVudFRhcmdldChicm93c2VyRXZlbnQudGFyZ2V0IHx8IG51bGwpO1xuXHRcdGNvbnN0IGl0ZW0gPSB0eXBlb2YgaW5kZXggPT09ICd1bmRlZmluZWQnID8gdW5kZWZpbmVkIDogdGhpcy5pdGVtc1tpbmRleF07XG5cdFx0Y29uc3QgZWxlbWVudCA9IGl0ZW0gJiYgaXRlbS5lbGVtZW50O1xuXHRcdHJldHVybiB7IGJyb3dzZXJFdmVudCwgaW5kZXgsIGVsZW1lbnQgfTtcblx0fVxuXG5cdHByaXZhdGUgdG9Ub3VjaEV2ZW50KGJyb3dzZXJFdmVudDogVG91Y2hFdmVudCk6IElMaXN0VG91Y2hFdmVudDxUPiB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLmdldEl0ZW1JbmRleEZyb21FdmVudFRhcmdldChicm93c2VyRXZlbnQudGFyZ2V0IHx8IG51bGwpO1xuXHRcdGNvbnN0IGl0ZW0gPSB0eXBlb2YgaW5kZXggPT09ICd1bmRlZmluZWQnID8gdW5kZWZpbmVkIDogdGhpcy5pdGVtc1tpbmRleF07XG5cdFx0Y29uc3QgZWxlbWVudCA9IGl0ZW0gJiYgaXRlbS5lbGVtZW50O1xuXHRcdHJldHVybiB7IGJyb3dzZXJFdmVudCwgaW5kZXgsIGVsZW1lbnQgfTtcblx0fVxuXG5cdHByaXZhdGUgdG9HZXN0dXJlRXZlbnQoYnJvd3NlckV2ZW50OiBHZXN0dXJlRXZlbnQpOiBJTGlzdEdlc3R1cmVFdmVudDxUPiB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLmdldEl0ZW1JbmRleEZyb21FdmVudFRhcmdldChicm93c2VyRXZlbnQuaW5pdGlhbFRhcmdldCB8fCBudWxsKTtcblx0XHRjb25zdCBpdGVtID0gdHlwZW9mIGluZGV4ID09PSAndW5kZWZpbmVkJyA/IHVuZGVmaW5lZCA6IHRoaXMuaXRlbXNbaW5kZXhdO1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBpdGVtICYmIGl0ZW0uZWxlbWVudDtcblx0XHRyZXR1cm4geyBicm93c2VyRXZlbnQsIGluZGV4LCBlbGVtZW50IH07XG5cdH1cblxuXHRwcml2YXRlIHRvRHJhZ0V2ZW50KGJyb3dzZXJFdmVudDogRHJhZ0V2ZW50KTogSUxpc3REcmFnRXZlbnQ8VD4ge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5nZXRJdGVtSW5kZXhGcm9tRXZlbnRUYXJnZXQoYnJvd3NlckV2ZW50LnRhcmdldCB8fCBudWxsKTtcblx0XHRjb25zdCBpdGVtID0gdHlwZW9mIGluZGV4ID09PSAndW5kZWZpbmVkJyA/IHVuZGVmaW5lZCA6IHRoaXMuaXRlbXNbaW5kZXhdO1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBpdGVtICYmIGl0ZW0uZWxlbWVudDtcblx0XHRjb25zdCBzZWN0b3IgPSB0aGlzLmdldFRhcmdldFNlY3Rvcihicm93c2VyRXZlbnQsIGluZGV4KTtcblx0XHRyZXR1cm4geyBicm93c2VyRXZlbnQsIGluZGV4LCBlbGVtZW50LCBzZWN0b3IgfTtcblx0fVxuXG5cdHByaXZhdGUgb25TY3JvbGwoZTogU2Nyb2xsRXZlbnQpOiB2b2lkIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcHJldmlvdXNSZW5kZXJSYW5nZSA9IHRoaXMuZ2V0UmVuZGVyUmFuZ2UodGhpcy5sYXN0UmVuZGVyVG9wLCB0aGlzLmxhc3RSZW5kZXJIZWlnaHQpO1xuXHRcdFx0dGhpcy5yZW5kZXIocHJldmlvdXNSZW5kZXJSYW5nZSwgZS5zY3JvbGxUb3AsIGUuaGVpZ2h0LCBlLnNjcm9sbExlZnQsIGUuc2Nyb2xsV2lkdGgsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHRcdGlmICh0aGlzLnN1cHBvcnREeW5hbWljSGVpZ2h0cykge1xuXHRcdFx0XHR0aGlzLl9yZXJlbmRlcihlLnNjcm9sbFRvcCwgZS5oZWlnaHQsIGUuaW5TbW9vdGhTY3JvbGxpbmcpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y29uc29sZS5lcnJvcignR290IGJhZCBzY3JvbGwgZXZlbnQ6JywgZSk7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblRvdWNoQ2hhbmdlKGV2ZW50OiBHZXN0dXJlRXZlbnQpOiB2b2lkIHtcblx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXG5cdFx0dGhpcy5zY3JvbGxUb3AgLT0gZXZlbnQudHJhbnNsYXRpb25ZO1xuXHR9XG5cblx0Ly8gRE5EXG5cblx0cHJpdmF0ZSBvbkRyYWdTdGFydChlbGVtZW50OiBULCB1cmk6IHN0cmluZywgZXZlbnQ6IERyYWdFdmVudCk6IHZvaWQge1xuXHRcdGlmICghZXZlbnQuZGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWxlbWVudHMgPSB0aGlzLmRuZC5nZXREcmFnRWxlbWVudHMoZWxlbWVudCk7XG5cblx0XHRldmVudC5kYXRhVHJhbnNmZXIuZWZmZWN0QWxsb3dlZCA9ICdjb3B5TW92ZSc7XG5cdFx0ZXZlbnQuZGF0YVRyYW5zZmVyLnNldERhdGEoRGF0YVRyYW5zZmVycy5URVhULCB1cmkpO1xuXG5cdFx0bGV0IGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuZG5kLmdldERyYWdMYWJlbCkge1xuXHRcdFx0bGFiZWwgPSB0aGlzLmRuZC5nZXREcmFnTGFiZWwoZWxlbWVudHMsIGV2ZW50KTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBsYWJlbCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdGxhYmVsID0gU3RyaW5nKGVsZW1lbnRzLmxlbmd0aCk7XG5cdFx0fVxuXG5cdFx0YXBwbHlEcmFnSW1hZ2UoZXZlbnQsIHRoaXMuZG9tTm9kZSwgbGFiZWwsIFt0aGlzLmRvbUlkIC8qIGFkZCBkb21JZCB0byBnZXQgbGlzdCBzcGVjaWZpYyBzdHlsaW5nICovXSk7XG5cblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnZHJhZ2dpbmcnKTtcblx0XHR0aGlzLmN1cnJlbnREcmFnRGF0YSA9IG5ldyBFbGVtZW50c0RyYWdBbmREcm9wRGF0YShlbGVtZW50cyk7XG5cdFx0U3RhdGljRE5ELkN1cnJlbnREcmFnQW5kRHJvcERhdGEgPSBuZXcgRXh0ZXJuYWxFbGVtZW50c0RyYWdBbmREcm9wRGF0YShlbGVtZW50cyk7XG5cblx0XHR0aGlzLmRuZC5vbkRyYWdTdGFydD8uKHRoaXMuY3VycmVudERyYWdEYXRhLCBldmVudCk7XG5cdH1cblxuXHRwcml2YXRlIG9uUG90ZW50aWFsU2VsZWN0aW9uU3RhcnQoZTogTW91c2VFdmVudCkge1xuXHRcdHRoaXMuY3VycmVudFNlbGVjdGlvbkRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdGNvbnN0IGRvYyA9IGdldERvY3VtZW50KHRoaXMuZG9tTm9kZSk7XG5cblx0XHQvLyBTZXQgdXAgYm90aCB0aGUgJ21vdmVtZW50IHN0b3JlJyBmb3Igd2F0Y2hpbmcgdGhlIG1vdXNlLCBhbmQgdGhlXG5cdFx0Ly8gJ3NlbGVjdGlvbiBzdG9yZScgd2hpY2ggbGFzdHMgYXMgbG9uZyBhcyB0aGVyZSdzIGEgc2VsZWN0aW9uLCBldmVuXG5cdFx0Ly8gYWZ0ZXIgdGhlIHVzciBoYXMgc3RvcHBlZCBtb2RpZnlpbmcgaXQuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uU3RvcmUgPSB0aGlzLmN1cnJlbnRTZWxlY3Rpb25EaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IG1vdmVtZW50U3RvcmUgPSBzZWxlY3Rpb25TdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRcdC8vIFRoZSBzZWxlY3Rpb24gZXZlbnRzIHdlIGdldCBmcm9tIHRoZSBET00gYXJlIGZhaXJseSBsaW1pdGVkIGFuZCB3ZSBsYWNrIGEgJ3NlbGVjdGlvbiBlbmQnIGV2ZW50LlxuXHRcdC8vIFNlbGVjdGlvbiBldmVudHMgYWxzbyBkb24ndCB0ZWxsIHVzIHdoZXJlIHRoZSBpbnB1dCBkb2luZyB0aGUgc2VsZWN0aW9uIGlzLiBTbywgbWFrZSBhIHBvb3Jcblx0XHQvLyBhc3N1bXB0aW9uIHRoYXQgYSB1c2VyIGlzIHVzaW5nIHRoZSBtb3VzZSwgYW5kIGJhc2Ugb3VyIGV2ZW50cyBvbiB0aGF0LlxuXHRcdG1vdmVtZW50U3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRvbU5vZGUsICdzZWxlY3RzdGFydCcsICgpID0+IHtcblx0XHRcdG1vdmVtZW50U3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihkb2MsICdtb3VzZW1vdmUnLCBlID0+IHtcblx0XHRcdFx0aWYgKGRvYy5nZXRTZWxlY3Rpb24oKT8uaXNDb2xsYXBzZWQgPT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXR1cERyYWdBbmREcm9wU2Nyb2xsVG9wQW5pbWF0aW9uKGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIFRoZSBzZWxlY3Rpb24gaXMgY2xlYXJlZCBlaXRoZXIgb24gbW91c2V1cCBpZiB0aGVyZSdzIG5vIHNlbGVjdGlvbiwgb3Igb24gbmV4dCBtb3VzZWRvd25cblx0XHRcdC8vIHdoZW4gYHRoaXMuY3VycmVudFNlbGVjdGlvbkRpc3Bvc2FibGVgIGlzIHJlc2V0LlxuXHRcdFx0c2VsZWN0aW9uU3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHByZXZpb3VzUmVuZGVyUmFuZ2UgPSB0aGlzLmdldFJlbmRlclJhbmdlKHRoaXMubGFzdFJlbmRlclRvcCwgdGhpcy5sYXN0UmVuZGVySGVpZ2h0KTtcblx0XHRcdFx0dGhpcy5jdXJyZW50U2VsZWN0aW9uQm91bmRzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLnJlbmRlcihwcmV2aW91c1JlbmRlclJhbmdlLCB0aGlzLmxhc3RSZW5kZXJUb3AsIHRoaXMubGFzdFJlbmRlckhlaWdodCwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0fSkpO1xuXHRcdFx0c2VsZWN0aW9uU3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihkb2MsICdzZWxlY3Rpb25jaGFuZ2UnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IGRvYy5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdFx0Ly8gaWYgdGhlIHNlbGVjdGlvbiBjaGFuZ2VkIF9hZnRlcl8gbW91c2V1cCwgaXQncyBmcm9tIGNsZWFyaW5nIHRoZSBsaXN0IG9yIHNpbWlsYXIsIHNvIHRlYXJkb3duXG5cdFx0XHRcdGlmICghc2VsZWN0aW9uIHx8IHNlbGVjdGlvbi5pc0NvbGxhcHNlZCkge1xuXHRcdFx0XHRcdGlmIChtb3ZlbWVudFN0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRcdHNlbGVjdGlvblN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IHN0YXJ0ID0gdGhpcy5nZXRJbmRleE9mTGlzdEVsZW1lbnQoc2VsZWN0aW9uLmFuY2hvck5vZGUgYXMgSFRNTEVsZW1lbnQpO1xuXHRcdFx0XHRsZXQgZW5kID0gdGhpcy5nZXRJbmRleE9mTGlzdEVsZW1lbnQoc2VsZWN0aW9uLmZvY3VzTm9kZSBhcyBIVE1MRWxlbWVudCk7XG5cdFx0XHRcdGlmIChzdGFydCAhPT0gdW5kZWZpbmVkICYmIGVuZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0aWYgKGVuZCA8IHN0YXJ0KSB7XG5cdFx0XHRcdFx0XHRbc3RhcnQsIGVuZF0gPSBbZW5kLCBzdGFydF07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuY3VycmVudFNlbGVjdGlvbkJvdW5kcyA9IHsgc3RhcnQsIGVuZCB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSkpO1xuXG5cdFx0bW92ZW1lbnRTdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGRvYywgJ21vdXNldXAnLCAoKSA9PiB7XG5cdFx0XHRtb3ZlbWVudFN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMudGVhcmRvd25EcmFnQW5kRHJvcFNjcm9sbFRvcEFuaW1hdGlvbigpO1xuXG5cdFx0XHRpZiAoZG9jLmdldFNlbGVjdGlvbigpPy5pc0NvbGxhcHNlZCAhPT0gZmFsc2UpIHtcblx0XHRcdFx0c2VsZWN0aW9uU3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0SW5kZXhPZkxpc3RFbGVtZW50KGVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgbnVsbCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFlbGVtZW50IHx8ICF0aGlzLmRvbU5vZGUuY29udGFpbnMoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0d2hpbGUgKGVsZW1lbnQgJiYgZWxlbWVudCAhPT0gdGhpcy5kb21Ob2RlKSB7XG5cdFx0XHRpZiAoZWxlbWVudC5kYXRhc2V0Py5pbmRleCkge1xuXHRcdFx0XHRyZXR1cm4gTnVtYmVyKGVsZW1lbnQuZGF0YXNldC5pbmRleCk7XG5cdFx0XHR9XG5cblx0XHRcdGVsZW1lbnQgPSBlbGVtZW50LnBhcmVudEVsZW1lbnQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgb25EcmFnT3ZlcihldmVudDogSUxpc3REcmFnRXZlbnQ8VD4pOiBib29sZWFuIHtcblx0XHRldmVudC5icm93c2VyRXZlbnQucHJldmVudERlZmF1bHQoKTsgLy8gbmVlZGVkIHNvIHRoYXQgdGhlIGRyb3AgZXZlbnQgZmlyZXMgKGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vcXVlc3Rpb25zLzIxMzM5OTI0L2Ryb3AtZXZlbnQtbm90LWZpcmluZy1pbi1jaHJvbWUpXG5cblx0XHR0aGlzLm9uRHJhZ0xlYXZlVGltZW91dC5kaXNwb3NlKCk7XG5cblx0XHRpZiAoU3RhdGljRE5ELkN1cnJlbnREcmFnQW5kRHJvcERhdGEgJiYgU3RhdGljRE5ELkN1cnJlbnREcmFnQW5kRHJvcERhdGEuZ2V0RGF0YSgpID09PSAndnNjb2RlLXVpJykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMuc2V0dXBEcmFnQW5kRHJvcFNjcm9sbFRvcEFuaW1hdGlvbihldmVudC5icm93c2VyRXZlbnQpO1xuXG5cdFx0aWYgKCFldmVudC5icm93c2VyRXZlbnQuZGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gRHJhZyBvdmVyIGZyb20gb3V0c2lkZVxuXHRcdGlmICghdGhpcy5jdXJyZW50RHJhZ0RhdGEpIHtcblx0XHRcdGlmIChTdGF0aWNETkQuQ3VycmVudERyYWdBbmREcm9wRGF0YSkge1xuXHRcdFx0XHQvLyBEcmFnIG92ZXIgZnJvbSBhbm90aGVyIGxpc3Rcblx0XHRcdFx0dGhpcy5jdXJyZW50RHJhZ0RhdGEgPSBTdGF0aWNETkQuQ3VycmVudERyYWdBbmREcm9wRGF0YTtcblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gRHJhZyBvdmVyIGZyb20gdGhlIGRlc2t0b3Bcblx0XHRcdFx0aWYgKCFldmVudC5icm93c2VyRXZlbnQuZGF0YVRyYW5zZmVyLnR5cGVzKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5jdXJyZW50RHJhZ0RhdGEgPSBuZXcgTmF0aXZlRHJhZ0FuZERyb3BEYXRhKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5kbmQub25EcmFnT3Zlcih0aGlzLmN1cnJlbnREcmFnRGF0YSwgZXZlbnQuZWxlbWVudCwgZXZlbnQuaW5kZXgsIGV2ZW50LnNlY3RvciwgZXZlbnQuYnJvd3NlckV2ZW50KTtcblx0XHR0aGlzLmNhbkRyb3AgPSB0eXBlb2YgcmVzdWx0ID09PSAnYm9vbGVhbicgPyByZXN1bHQgOiByZXN1bHQuYWNjZXB0O1xuXG5cdFx0aWYgKCF0aGlzLmNhbkRyb3ApIHtcblx0XHRcdHRoaXMuY3VycmVudERyYWdGZWVkYmFjayA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuY3VycmVudERyYWdGZWVkYmFja0Rpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGV2ZW50LmJyb3dzZXJFdmVudC5kYXRhVHJhbnNmZXIuZHJvcEVmZmVjdCA9ICh0eXBlb2YgcmVzdWx0ICE9PSAnYm9vbGVhbicgJiYgcmVzdWx0LmVmZmVjdD8udHlwZSA9PT0gTGlzdERyYWdPdmVyRWZmZWN0VHlwZS5Db3B5KSA/ICdjb3B5JyA6ICdtb3ZlJztcblxuXHRcdGxldCBmZWVkYmFjazogbnVtYmVyW107XG5cblx0XHRpZiAodHlwZW9mIHJlc3VsdCAhPT0gJ2Jvb2xlYW4nICYmIHJlc3VsdC5mZWVkYmFjaykge1xuXHRcdFx0ZmVlZGJhY2sgPSByZXN1bHQuZmVlZGJhY2s7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh0eXBlb2YgZXZlbnQuaW5kZXggPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdGZlZWRiYWNrID0gWy0xXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGZlZWRiYWNrID0gW2V2ZW50LmluZGV4XTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBzYW5pdGl6ZSBmZWVkYmFjayBsaXN0XG5cdFx0ZmVlZGJhY2sgPSBkaXN0aW5jdChmZWVkYmFjaykuZmlsdGVyKGkgPT4gaSA+PSAtMSAmJiBpIDwgdGhpcy5sZW5ndGgpLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcblx0XHRmZWVkYmFjayA9IGZlZWRiYWNrWzBdID09PSAtMSA/IFstMV0gOiBmZWVkYmFjaztcblxuXHRcdGxldCBkcmFnT3ZlckVmZmVjdFBvc2l0aW9uID0gdHlwZW9mIHJlc3VsdCAhPT0gJ2Jvb2xlYW4nICYmIHJlc3VsdC5lZmZlY3QgJiYgcmVzdWx0LmVmZmVjdC5wb3NpdGlvbiA/IHJlc3VsdC5lZmZlY3QucG9zaXRpb24gOiBMaXN0RHJhZ092ZXJFZmZlY3RQb3NpdGlvbi5PdmVyO1xuXG5cdFx0aWYgKGVxdWFsc0RyYWdGZWVkYmFjayh0aGlzLmN1cnJlbnREcmFnRmVlZGJhY2ssIGZlZWRiYWNrKSAmJiB0aGlzLmN1cnJlbnREcmFnRmVlZGJhY2tQb3NpdGlvbiA9PT0gZHJhZ092ZXJFZmZlY3RQb3NpdGlvbikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0dGhpcy5jdXJyZW50RHJhZ0ZlZWRiYWNrID0gZmVlZGJhY2s7XG5cdFx0dGhpcy5jdXJyZW50RHJhZ0ZlZWRiYWNrUG9zaXRpb24gPSBkcmFnT3ZlckVmZmVjdFBvc2l0aW9uO1xuXHRcdHRoaXMuY3VycmVudERyYWdGZWVkYmFja0Rpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXG5cdFx0aWYgKGZlZWRiYWNrWzBdID09PSAtMSkgeyAvLyBlbnRpcmUgbGlzdCBmZWVkYmFja1xuXHRcdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoZHJhZ092ZXJFZmZlY3RQb3NpdGlvbik7XG5cdFx0XHR0aGlzLnJvd3NDb250YWluZXIuY2xhc3NMaXN0LmFkZChkcmFnT3ZlckVmZmVjdFBvc2l0aW9uKTtcblx0XHRcdHRoaXMuY3VycmVudERyYWdGZWVkYmFja0Rpc3Bvc2FibGUgPSB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZShkcmFnT3ZlckVmZmVjdFBvc2l0aW9uKTtcblx0XHRcdFx0dGhpcy5yb3dzQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoZHJhZ092ZXJFZmZlY3RQb3NpdGlvbik7XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXG5cdFx0XHRpZiAoZmVlZGJhY2subGVuZ3RoID4gMSAmJiBkcmFnT3ZlckVmZmVjdFBvc2l0aW9uICE9PSBMaXN0RHJhZ092ZXJFZmZlY3RQb3NpdGlvbi5PdmVyKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ2FuXFwndCB1c2UgbXVsdGlwbGUgZmVlZGJhY2tzIHdpdGggcG9zaXRpb24gZGlmZmVyZW50IHRoYW4gXFwnb3ZlclxcJycpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBNYWtlIHN1cmUgdGhlcmUgaXMgbm8gZmxpY2tlciB3aGVuIG1vdmluZyBiZXR3ZWVuIHR3byBpdGVtc1xuXHRcdFx0Ly8gQWx3YXlzIHVzZSB0aGUgYmVmb3JlIGZlZWRiYWNrIGlmIHBvc3NpYmxlXG5cdFx0XHRpZiAoZHJhZ092ZXJFZmZlY3RQb3NpdGlvbiA9PT0gTGlzdERyYWdPdmVyRWZmZWN0UG9zaXRpb24uQWZ0ZXIpIHtcblx0XHRcdFx0aWYgKGZlZWRiYWNrWzBdIDwgdGhpcy5sZW5ndGggLSAxKSB7XG5cdFx0XHRcdFx0ZmVlZGJhY2tbMF0gKz0gMTtcblx0XHRcdFx0XHRkcmFnT3ZlckVmZmVjdFBvc2l0aW9uID0gTGlzdERyYWdPdmVyRWZmZWN0UG9zaXRpb24uQmVmb3JlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgaW5kZXggb2YgZmVlZGJhY2spIHtcblx0XHRcdFx0Y29uc3QgaXRlbSA9IHRoaXMuaXRlbXNbaW5kZXhdO1xuXHRcdFx0XHRpdGVtLmRyb3BUYXJnZXQgPSB0cnVlO1xuXG5cdFx0XHRcdGl0ZW0ucm93Py5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoZHJhZ092ZXJFZmZlY3RQb3NpdGlvbik7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuY3VycmVudERyYWdGZWVkYmFja0Rpc3Bvc2FibGUgPSB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGluZGV4IG9mIGZlZWRiYWNrKSB7XG5cdFx0XHRcdFx0Y29uc3QgaXRlbSA9IHRoaXMuaXRlbXNbaW5kZXhdO1xuXHRcdFx0XHRcdGl0ZW0uZHJvcFRhcmdldCA9IGZhbHNlO1xuXG5cdFx0XHRcdFx0aXRlbS5yb3c/LmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZShkcmFnT3ZlckVmZmVjdFBvc2l0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIG9uRHJhZ0xlYXZlKGV2ZW50OiBJTGlzdERyYWdFdmVudDxUPik6IHZvaWQge1xuXHRcdHRoaXMub25EcmFnTGVhdmVUaW1lb3V0LmRpc3Bvc2UoKTtcblx0XHR0aGlzLm9uRHJhZ0xlYXZlVGltZW91dCA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHRoaXMuY2xlYXJEcmFnT3ZlckZlZWRiYWNrKCksIDEwMCwgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdFx0aWYgKHRoaXMuY3VycmVudERyYWdEYXRhKSB7XG5cdFx0XHR0aGlzLmRuZC5vbkRyYWdMZWF2ZT8uKHRoaXMuY3VycmVudERyYWdEYXRhLCBldmVudC5lbGVtZW50LCBldmVudC5pbmRleCwgZXZlbnQuYnJvd3NlckV2ZW50KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRHJvcChldmVudDogSUxpc3REcmFnRXZlbnQ8VD4pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY2FuRHJvcCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRyYWdEYXRhID0gdGhpcy5jdXJyZW50RHJhZ0RhdGE7XG5cdFx0dGhpcy50ZWFyZG93bkRyYWdBbmREcm9wU2Nyb2xsVG9wQW5pbWF0aW9uKCk7XG5cdFx0dGhpcy5jbGVhckRyYWdPdmVyRmVlZGJhY2soKTtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnZHJhZ2dpbmcnKTtcblx0XHR0aGlzLmN1cnJlbnREcmFnRGF0YSA9IHVuZGVmaW5lZDtcblx0XHRTdGF0aWNETkQuQ3VycmVudERyYWdBbmREcm9wRGF0YSA9IHVuZGVmaW5lZDtcblxuXHRcdGlmICghZHJhZ0RhdGEgfHwgIWV2ZW50LmJyb3dzZXJFdmVudC5kYXRhVHJhbnNmZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRldmVudC5icm93c2VyRXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRkcmFnRGF0YS51cGRhdGUoZXZlbnQuYnJvd3NlckV2ZW50LmRhdGFUcmFuc2Zlcik7XG5cdFx0dGhpcy5kbmQuZHJvcChkcmFnRGF0YSwgZXZlbnQuZWxlbWVudCwgZXZlbnQuaW5kZXgsIGV2ZW50LnNlY3RvciwgZXZlbnQuYnJvd3NlckV2ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgb25EcmFnRW5kKGV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLmNhbkRyb3AgPSBmYWxzZTtcblx0XHR0aGlzLnRlYXJkb3duRHJhZ0FuZERyb3BTY3JvbGxUb3BBbmltYXRpb24oKTtcblx0XHR0aGlzLmNsZWFyRHJhZ092ZXJGZWVkYmFjaygpO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdkcmFnZ2luZycpO1xuXHRcdHRoaXMuY3VycmVudERyYWdEYXRhID0gdW5kZWZpbmVkO1xuXHRcdFN0YXRpY0RORC5DdXJyZW50RHJhZ0FuZERyb3BEYXRhID0gdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5kbmQub25EcmFnRW5kPy4oZXZlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhckRyYWdPdmVyRmVlZGJhY2soKTogdm9pZCB7XG5cdFx0dGhpcy5jdXJyZW50RHJhZ0ZlZWRiYWNrID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuY3VycmVudERyYWdGZWVkYmFja1Bvc2l0aW9uID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuY3VycmVudERyYWdGZWVkYmFja0Rpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuY3VycmVudERyYWdGZWVkYmFja0Rpc3Bvc2FibGUgPSBEaXNwb3NhYmxlLk5vbmU7XG5cdH1cblxuXHQvLyBETkQgc2Nyb2xsIHRvcCBhbmltYXRpb25cblxuXHRwcml2YXRlIHNldHVwRHJhZ0FuZERyb3BTY3JvbGxUb3BBbmltYXRpb24oZXZlbnQ6IERyYWdFdmVudCB8IE1vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZHJhZ092ZXJBbmltYXRpb25EaXNwb3NhYmxlKSB7XG5cdFx0XHRjb25zdCB2aWV3VG9wID0gZ2V0VG9wTGVmdE9mZnNldCh0aGlzLmRvbU5vZGUpLnRvcDtcblx0XHRcdHRoaXMuZHJhZ092ZXJBbmltYXRpb25EaXNwb3NhYmxlID0gYW5pbWF0ZShnZXRXaW5kb3codGhpcy5kb21Ob2RlKSwgdGhpcy5hbmltYXRlRHJhZ0FuZERyb3BTY3JvbGxUb3AuYmluZCh0aGlzLCB2aWV3VG9wKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5kcmFnT3ZlckFuaW1hdGlvblN0b3BEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmRyYWdPdmVyQW5pbWF0aW9uU3RvcERpc3Bvc2FibGUgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5kcmFnT3ZlckFuaW1hdGlvbkRpc3Bvc2FibGUpIHtcblx0XHRcdFx0dGhpcy5kcmFnT3ZlckFuaW1hdGlvbkRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLmRyYWdPdmVyQW5pbWF0aW9uRGlzcG9zYWJsZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9LCAxMDAwLCB0aGlzLmRpc3Bvc2FibGVzKTtcblxuXHRcdHRoaXMuZHJhZ092ZXJNb3VzZVkgPSBldmVudC5wYWdlWTtcblx0fVxuXG5cdHByaXZhdGUgYW5pbWF0ZURyYWdBbmREcm9wU2Nyb2xsVG9wKHZpZXdUb3A6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmRyYWdPdmVyTW91c2VZID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkaWZmID0gdGhpcy5kcmFnT3Zlck1vdXNlWSAtIHZpZXdUb3A7XG5cdFx0Y29uc3QgdXBwZXJMaW1pdCA9IHRoaXMucmVuZGVySGVpZ2h0IC0gMzU7XG5cblx0XHRpZiAoZGlmZiA8IDM1KSB7XG5cdFx0XHR0aGlzLnNjcm9sbFRvcCArPSBNYXRoLm1heCgtMTQsIE1hdGguZmxvb3IoMC4zICogKGRpZmYgLSAzNSkpKTtcblx0XHR9IGVsc2UgaWYgKGRpZmYgPiB1cHBlckxpbWl0KSB7XG5cdFx0XHR0aGlzLnNjcm9sbFRvcCArPSBNYXRoLm1pbigxNCwgTWF0aC5mbG9vcigwLjMgKiAoZGlmZiAtIHVwcGVyTGltaXQpKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB0ZWFyZG93bkRyYWdBbmREcm9wU2Nyb2xsVG9wQW5pbWF0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuZHJhZ092ZXJBbmltYXRpb25TdG9wRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cblx0XHRpZiAodGhpcy5kcmFnT3ZlckFuaW1hdGlvbkRpc3Bvc2FibGUpIHtcblx0XHRcdHRoaXMuZHJhZ092ZXJBbmltYXRpb25EaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuZHJhZ092ZXJBbmltYXRpb25EaXNwb3NhYmxlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdC8vIFV0aWxcblxuXHRwcml2YXRlIGdldFRhcmdldFNlY3Rvcihicm93c2VyRXZlbnQ6IERyYWdFdmVudCwgdGFyZ2V0SW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCk6IExpc3RWaWV3VGFyZ2V0U2VjdG9yIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGFyZ2V0SW5kZXggPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCByZWxhdGl2ZVBvc2l0aW9uID0gYnJvd3NlckV2ZW50Lm9mZnNldFkgLyB0aGlzLml0ZW1zW3RhcmdldEluZGV4XS5zaXplO1xuXHRcdGNvbnN0IHNlY3RvciA9IE1hdGguZmxvb3IocmVsYXRpdmVQb3NpdGlvbiAvIDAuMjUpO1xuXHRcdHJldHVybiBjbGFtcChzZWN0b3IsIDAsIDMpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRJdGVtSW5kZXhGcm9tRXZlbnRUYXJnZXQodGFyZ2V0OiBFdmVudFRhcmdldCB8IG51bGwpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNjcm9sbGFibGVFbGVtZW50ID0gdGhpcy5zY3JvbGxhYmxlRWxlbWVudC5nZXREb21Ob2RlKCk7XG5cdFx0bGV0IGVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgU1ZHRWxlbWVudCB8IG51bGwgPSB0YXJnZXQgYXMgKEhUTUxFbGVtZW50IHwgU1ZHRWxlbWVudCB8IG51bGwpO1xuXG5cdFx0d2hpbGUgKChpc0hUTUxFbGVtZW50KGVsZW1lbnQpIHx8IGlzU1ZHRWxlbWVudChlbGVtZW50KSkgJiYgZWxlbWVudCAhPT0gdGhpcy5yb3dzQ29udGFpbmVyICYmIHNjcm9sbGFibGVFbGVtZW50LmNvbnRhaW5zKGVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCByYXdJbmRleCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWluZGV4Jyk7XG5cblx0XHRcdGlmIChyYXdJbmRleCkge1xuXHRcdFx0XHRjb25zdCBpbmRleCA9IE51bWJlcihyYXdJbmRleCk7XG5cblx0XHRcdFx0aWYgKCFpc05hTihpbmRleCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gaW5kZXg7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0ZWxlbWVudCA9IGVsZW1lbnQucGFyZW50RWxlbWVudDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRWaXNpYmxlUmFuZ2UocmVuZGVyVG9wOiBudW1iZXIsIHJlbmRlckhlaWdodDogbnVtYmVyKTogSVJhbmdlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c3RhcnQ6IHRoaXMucmFuZ2VNYXAuaW5kZXhBdChyZW5kZXJUb3ApLFxuXHRcdFx0ZW5kOiB0aGlzLnJhbmdlTWFwLmluZGV4QWZ0ZXIocmVuZGVyVG9wICsgcmVuZGVySGVpZ2h0IC0gMSlcblx0XHR9O1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldFJlbmRlclJhbmdlKHJlbmRlclRvcDogbnVtYmVyLCByZW5kZXJIZWlnaHQ6IG51bWJlcik6IElSYW5nZSB7XG5cdFx0Y29uc3QgcmFuZ2UgPSB0aGlzLmdldFZpc2libGVSYW5nZShyZW5kZXJUb3AsIHJlbmRlckhlaWdodCk7XG5cdFx0aWYgKHRoaXMuY3VycmVudFNlbGVjdGlvbkJvdW5kcykge1xuXHRcdFx0Y29uc3QgbWF4ID0gdGhpcy5yYW5nZU1hcC5jb3VudDtcblx0XHRcdHJhbmdlLnN0YXJ0ID0gTWF0aC5taW4ocmFuZ2Uuc3RhcnQsIHRoaXMuY3VycmVudFNlbGVjdGlvbkJvdW5kcy5zdGFydCwgbWF4KTtcblx0XHRcdHJhbmdlLmVuZCA9IE1hdGgubWluKE1hdGgubWF4KHJhbmdlLmVuZCwgdGhpcy5jdXJyZW50U2VsZWN0aW9uQm91bmRzLmVuZCArIDEpLCBtYXgpO1xuXHRcdH1cblxuXHRcdHJldHVybiByYW5nZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHaXZlbiBhIHN0YWJsZSByZW5kZXJlZCBzdGF0ZSwgY2hlY2tzIGV2ZXJ5IHJlbmRlcmVkIGVsZW1lbnQgd2hldGhlciBpdCBuZWVkc1xuXHQgKiB0byBiZSBwcm9iZWQgZm9yIGR5bmFtaWMgaGVpZ2h0LiBBZGp1c3RzIHNjcm9sbCBoZWlnaHQgYW5kIHRvcCBpZiBuZWNlc3NhcnkuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX3JlcmVuZGVyKHJlbmRlclRvcDogbnVtYmVyLCByZW5kZXJIZWlnaHQ6IG51bWJlciwgaW5TbW9vdGhTY3JvbGxpbmc/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldmlvdXNSZW5kZXJSYW5nZSA9IHRoaXMuZ2V0UmVuZGVyUmFuZ2UocmVuZGVyVG9wLCByZW5kZXJIZWlnaHQpO1xuXG5cdFx0Ly8gTGV0J3MgcmVtZW1iZXIgdGhlIHNlY29uZCBlbGVtZW50J3MgcG9zaXRpb24sIHRoaXMgaGVscHMgaW4gc2Nyb2xsaW5nIHVwXG5cdFx0Ly8gYW5kIHByZXNlcnZpbmcgYSBsaW5lYXIgdXB3YXJkcyBzY3JvbGwgbW92ZW1lbnRcblx0XHRsZXQgYW5jaG9yRWxlbWVudEluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGFuY2hvckVsZW1lbnRUb3BEZWx0YTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKHJlbmRlclRvcCA9PT0gdGhpcy5lbGVtZW50VG9wKHByZXZpb3VzUmVuZGVyUmFuZ2Uuc3RhcnQpKSB7XG5cdFx0XHRhbmNob3JFbGVtZW50SW5kZXggPSBwcmV2aW91c1JlbmRlclJhbmdlLnN0YXJ0O1xuXHRcdFx0YW5jaG9yRWxlbWVudFRvcERlbHRhID0gMDtcblx0XHR9IGVsc2UgaWYgKHByZXZpb3VzUmVuZGVyUmFuZ2UuZW5kIC0gcHJldmlvdXNSZW5kZXJSYW5nZS5zdGFydCA+IDEpIHtcblx0XHRcdGFuY2hvckVsZW1lbnRJbmRleCA9IHByZXZpb3VzUmVuZGVyUmFuZ2Uuc3RhcnQgKyAxO1xuXHRcdFx0YW5jaG9yRWxlbWVudFRvcERlbHRhID0gdGhpcy5lbGVtZW50VG9wKGFuY2hvckVsZW1lbnRJbmRleCkgLSByZW5kZXJUb3A7XG5cdFx0fVxuXG5cdFx0bGV0IGhlaWdodERpZmYgPSAwO1xuXG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGNvbnN0IHJlbmRlclJhbmdlID0gdGhpcy5nZXRSZW5kZXJSYW5nZShyZW5kZXJUb3AsIHJlbmRlckhlaWdodCk7XG5cblx0XHRcdGxldCBkaWRDaGFuZ2UgPSBmYWxzZTtcblxuXHRcdFx0Zm9yIChsZXQgaSA9IHJlbmRlclJhbmdlLnN0YXJ0OyBpIDwgcmVuZGVyUmFuZ2UuZW5kOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgZGlmZiA9IHRoaXMucHJvYmVEeW5hbWljSGVpZ2h0KGkpO1xuXG5cdFx0XHRcdGlmIChkaWZmICE9PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5yYW5nZU1hcC5zcGxpY2UoaSwgMSwgW3RoaXMuaXRlbXNbaV1dKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGhlaWdodERpZmYgKz0gZGlmZjtcblx0XHRcdFx0ZGlkQ2hhbmdlID0gZGlkQ2hhbmdlIHx8IGRpZmYgIT09IDA7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghZGlkQ2hhbmdlKSB7XG5cdFx0XHRcdGlmIChoZWlnaHREaWZmICE9PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5ldmVudHVhbGx5VXBkYXRlU2Nyb2xsRGltZW5zaW9ucygpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgdW5yZW5kZXJSYW5nZXMgPSBSYW5nZS5yZWxhdGl2ZUNvbXBsZW1lbnQocHJldmlvdXNSZW5kZXJSYW5nZSwgcmVuZGVyUmFuZ2UpO1xuXG5cdFx0XHRcdGZvciAoY29uc3QgcmFuZ2Ugb2YgdW5yZW5kZXJSYW5nZXMpIHtcblx0XHRcdFx0XHRmb3IgKGxldCBpID0gcmFuZ2Uuc3RhcnQ7IGkgPCByYW5nZS5lbmQ7IGkrKykge1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMuaXRlbXNbaV0ucm93KSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMucmVtb3ZlSXRlbUZyb21ET00oaSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmVuZGVyUmFuZ2VzID0gUmFuZ2UucmVsYXRpdmVDb21wbGVtZW50KHJlbmRlclJhbmdlLCBwcmV2aW91c1JlbmRlclJhbmdlKS5yZXZlcnNlKCk7XG5cdFx0XHRcdGNvbnN0IGluc2VydGVkSXRlbXM6IElJdGVtPFQ+W10gPSBbXTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IHJhbmdlIG9mIHJlbmRlclJhbmdlcykge1xuXHRcdFx0XHRcdGZvciAobGV0IGkgPSByYW5nZS5lbmQgLSAxOyBpID49IHJhbmdlLnN0YXJ0OyBpLS0pIHtcblx0XHRcdFx0XHRcdHRoaXMuaW5zZXJ0SXRlbUluRE9NKGkpO1xuXHRcdFx0XHRcdFx0aW5zZXJ0ZWRJdGVtcy5wdXNoKHRoaXMuaXRlbXNbaV0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0aGlzLmhvcml6b250YWxTY3JvbGxpbmcgJiYgaW5zZXJ0ZWRJdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0dGhpcy5tZWFzdXJlSXRlbVdpZHRocyhpbnNlcnRlZEl0ZW1zKTtcblx0XHRcdFx0XHR0aGlzLmV2ZW50dWFsbHlVcGRhdGVTY3JvbGxXaWR0aCgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Zm9yIChsZXQgaSA9IHJlbmRlclJhbmdlLnN0YXJ0OyBpIDwgcmVuZGVyUmFuZ2UuZW5kOyBpKyspIHtcblx0XHRcdFx0XHRpZiAodGhpcy5pdGVtc1tpXS5yb3cpIHtcblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlSXRlbUluRE9NKHRoaXMuaXRlbXNbaV0sIGkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0eXBlb2YgYW5jaG9yRWxlbWVudEluZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdC8vIFRvIGNvbXB1dGUgYSBkZXN0aW5hdGlvbiBzY3JvbGwgdG9wLCB3ZSBuZWVkIHRvIHRha2UgaW50byBhY2NvdW50IHRoZSBjdXJyZW50IHNtb290aCBzY3JvbGxpbmdcblx0XHRcdFx0XHQvLyBhbmltYXRpb24sIGFuZCB0aGVuIHJldXNlIGl0IHdpdGggYSBuZXcgdGFyZ2V0ICh0byBhdm9pZCBwcm9sb25naW5nIHRoZSBzY3JvbGwpXG5cdFx0XHRcdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMDQxNDRcblx0XHRcdFx0XHQvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xMDQyODRcblx0XHRcdFx0XHQvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEwNzcwNFxuXHRcdFx0XHRcdGNvbnN0IGRlbHRhU2Nyb2xsVG9wID0gdGhpcy5zY3JvbGxhYmxlLmdldEZ1dHVyZVNjcm9sbFBvc2l0aW9uKCkuc2Nyb2xsVG9wIC0gcmVuZGVyVG9wO1xuXHRcdFx0XHRcdGNvbnN0IG5ld1Njcm9sbFRvcCA9IHRoaXMuZWxlbWVudFRvcChhbmNob3JFbGVtZW50SW5kZXgpIC0gYW5jaG9yRWxlbWVudFRvcERlbHRhISArIGRlbHRhU2Nyb2xsVG9wO1xuXHRcdFx0XHRcdHRoaXMuc2V0U2Nyb2xsVG9wKG5ld1Njcm9sbFRvcCwgaW5TbW9vdGhTY3JvbGxpbmcpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0LmZpcmUodGhpcy5jb250ZW50SGVpZ2h0KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcHJvYmVEeW5hbWljSGVpZ2h0KGluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLml0ZW1zW2luZGV4XTtcblx0XHRyZXR1cm4gdGhpcy5wcm9iZUR5bmFtaWNIZWlnaHRGb3JJdGVtKGl0ZW0sIGluZGV4KTtcblx0fVxuXG5cdHByaXZhdGUgcHJvYmVEeW5hbWljSGVpZ2h0Rm9ySXRlbShpdGVtOiBJSXRlbTxUPiwgaW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKCEhdGhpcy52aXJ0dWFsRGVsZWdhdGUuZ2V0RHluYW1pY0hlaWdodCkge1xuXHRcdFx0Y29uc3QgbmV3U2l6ZSA9IHRoaXMudmlydHVhbERlbGVnYXRlLmdldER5bmFtaWNIZWlnaHQoaXRlbS5lbGVtZW50KTtcblx0XHRcdGlmIChuZXdTaXplICE9PSBudWxsKSB7XG5cdFx0XHRcdGNvbnN0IHNpemUgPSBpdGVtLnNpemU7XG5cdFx0XHRcdGl0ZW0uc2l6ZSA9IG5ld1NpemU7XG5cdFx0XHRcdGl0ZW0ubGFzdER5bmFtaWNIZWlnaHRXaWR0aCA9IHRoaXMucmVuZGVyV2lkdGg7XG5cdFx0XHRcdHRoaXMucHVibGlzaER5bmFtaWNIZWlnaHQoaXRlbSk7XG5cdFx0XHRcdHJldHVybiBuZXdTaXplIC0gc2l6ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWl0ZW0uaGFzRHluYW1pY0hlaWdodCB8fCBpdGVtLmxhc3REeW5hbWljSGVpZ2h0V2lkdGggPT09IHRoaXMucmVuZGVyV2lkdGgpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXHRcdGlmICghIXRoaXMudmlydHVhbERlbGVnYXRlLmhhc0R5bmFtaWNIZWlnaHQgJiYgIXRoaXMudmlydHVhbERlbGVnYXRlLmhhc0R5bmFtaWNIZWlnaHQoaXRlbS5lbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2l6ZSA9IGl0ZW0uc2l6ZTtcblxuXHRcdGlmIChpdGVtLnJvdykge1xuXHRcdFx0aXRlbS5yb3cuZG9tTm9kZS5zdHlsZS5oZWlnaHQgPSAnJztcblx0XHRcdGl0ZW0uc2l6ZSA9IGl0ZW0ucm93LmRvbU5vZGUub2Zmc2V0SGVpZ2h0O1xuXHRcdFx0aWYgKGl0ZW0uc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHRpZiAoIWlzQW5jZXN0b3IoaXRlbS5yb3cuZG9tTm9kZSwgZ2V0V2luZG93KGl0ZW0ucm93LmRvbU5vZGUpLmRvY3VtZW50LmJvZHkpKSB7XG5cdFx0XHRcdFx0Y29uc29sZS53YXJuKCdNZWFzdXJpbmcgaXRlbSBub2RlIHRoYXQgaXMgbm90IGluIERPTSEgQWRkIExpc3RWaWV3IHRvIHRoZSBET00gYmVmb3JlIG1lYXN1cmluZyByb3cgaGVpZ2h0IScsIG5ldyBFcnJvcigpLnN0YWNrKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zb2xlLndhcm4oJ01lYXN1cmVkIGl0ZW0gbm9kZSBhdCAwcHgtIGVuc3VyZSB0aGF0IExpc3RWaWV3IGlzIG5vdCBkaXNwbGF5Om5vbmUgYmVmb3JlIG1lYXN1cmluZyByb3cgaGVpZ2h0IScsIG5ldyBFcnJvcigpLnN0YWNrKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aXRlbS5sYXN0RHluYW1pY0hlaWdodFdpZHRoID0gdGhpcy5yZW5kZXJXaWR0aDtcblx0XHRcdHRoaXMucHVibGlzaER5bmFtaWNIZWlnaHQoaXRlbSk7XG5cdFx0XHRyZXR1cm4gaXRlbS5zaXplIC0gc2l6ZTtcblx0XHR9XG5cblx0XHRjb25zdCB7IHJvdyB9ID0gdGhpcy5jYWNoZS5hbGxvYyhpdGVtLnRlbXBsYXRlSWQpO1xuXHRcdHJvdy5kb21Ob2RlLnN0eWxlLmhlaWdodCA9ICcnO1xuXHRcdHRoaXMucm93c0NvbnRhaW5lci5hcHBlbmRDaGlsZChyb3cuZG9tTm9kZSk7XG5cblx0XHRjb25zdCByZW5kZXJlciA9IHRoaXMucmVuZGVyZXJzLmdldChpdGVtLnRlbXBsYXRlSWQpO1xuXG5cdFx0aWYgKCFyZW5kZXJlcikge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignTWlzc2luZyByZW5kZXJlciBmb3IgdGVtcGxhdGVJZDogJyArIGl0ZW0udGVtcGxhdGVJZCk7XG5cdFx0fVxuXG5cdFx0cmVuZGVyZXIucmVuZGVyRWxlbWVudChpdGVtLmVsZW1lbnQsIGluZGV4LCByb3cudGVtcGxhdGVEYXRhKTtcblx0XHRpdGVtLnNpemUgPSByb3cuZG9tTm9kZS5vZmZzZXRIZWlnaHQ7XG5cdFx0cmVuZGVyZXIuZGlzcG9zZUVsZW1lbnQ/LihpdGVtLmVsZW1lbnQsIGluZGV4LCByb3cudGVtcGxhdGVEYXRhKTtcblxuXHRcdGl0ZW0ubGFzdER5bmFtaWNIZWlnaHRXaWR0aCA9IHRoaXMucmVuZGVyV2lkdGg7XG5cdFx0dGhpcy5wdWJsaXNoRHluYW1pY0hlaWdodChpdGVtKTtcblx0XHRyb3cuZG9tTm9kZS5yZW1vdmUoKTtcblx0XHR0aGlzLmNhY2hlLnJlbGVhc2Uocm93KTtcblxuXHRcdHJldHVybiBpdGVtLnNpemUgLSBzaXplO1xuXHR9XG5cblx0cHJpdmF0ZSBwdWJsaXNoRHluYW1pY0hlaWdodChpdGVtOiBJSXRlbTxUPik6IHZvaWQge1xuXHRcdGlmIChpdGVtLnNpemUgPiAwKSB7XG5cdFx0XHR0aGlzLnZpcnR1YWxEZWxlZ2F0ZS5zZXREeW5hbWljSGVpZ2h0Py4oaXRlbS5lbGVtZW50LCBpdGVtLnNpemUpO1xuXHRcdH1cblx0fVxuXG5cdGdldEVsZW1lbnREb21JZChpbmRleDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7dGhpcy5kb21JZH1fJHtpbmRleH1gO1xuXHR9XG5cblx0Ly8gRGlzcG9zZVxuXG5cdGRpc3Bvc2UoKSB7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIHRoaXMuaXRlbXMpIHtcblx0XHRcdGl0ZW0uZHJhZ1N0YXJ0RGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRpdGVtLmNoZWNrZWREaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblxuXHRcdFx0aWYgKGl0ZW0ucm93KSB7XG5cdFx0XHRcdGNvbnN0IHJlbmRlcmVyID0gdGhpcy5yZW5kZXJlcnMuZ2V0KGl0ZW0ucm93LnRlbXBsYXRlSWQpO1xuXHRcdFx0XHRpZiAocmVuZGVyZXIpIHtcblx0XHRcdFx0XHRyZW5kZXJlci5kaXNwb3NlRWxlbWVudD8uKGl0ZW0uZWxlbWVudCwgLTEsIGl0ZW0ucm93LnRlbXBsYXRlRGF0YSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRyZW5kZXJlci5kaXNwb3NlVGVtcGxhdGUoaXRlbS5yb3cudGVtcGxhdGVEYXRhKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuaXRlbXMgPSBbXTtcblxuXHRcdHRoaXMuZG9tTm9kZT8ucmVtb3ZlKCk7XG5cblx0XHR0aGlzLmRyYWdPdmVyQW5pbWF0aW9uRGlzcG9zYWJsZT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7O0FBS0EsU0FBUyxxQkFBdUM7QUFDaEQsU0FBUyx1QkFBdUIsU0FBb0Isa0JBQWtCLGtCQUFrQixpQkFBaUIsYUFBYSxrQkFBa0IsV0FBVyxZQUFZLGVBQWUsY0FBYyxvQ0FBb0M7QUFDaE8sU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxhQUFhLGdCQUFnQixlQUE2QjtBQUNuRSxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLFVBQVUsUUFBUSxjQUFjO0FBQ3pDLFNBQVMsU0FBUyx5QkFBeUI7QUFDM0MsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxhQUFvQztBQUN0RCxTQUFTLFlBQVksaUJBQThCLG9CQUFvQjtBQUN2RSxTQUFpQixhQUFhO0FBQzlCLFNBQStCLFlBQVksMkJBQXdDO0FBRW5GLFNBQXFJLDRCQUE0Qiw4QkFBOEI7QUFDL0wsU0FBb0IsVUFBVSxhQUFhO0FBQzNDLFNBQWUsZ0JBQWdCO0FBQy9CLFNBQVMsMEJBQTBCO0FBR25DLFNBQVMsYUFBYTtBQUN0QixTQUFTLHNCQUFzQjtBQWtCL0IsTUFBTSxZQUFZO0FBQUEsRUFDakIsd0JBQXdCO0FBQ3pCO0FBTU8sSUFBVyx1QkFBWCxrQkFBV0EsMEJBQVg7QUFFTixFQUFBQSw0Q0FBQSxTQUFNLEtBQU47QUFDQSxFQUFBQSw0Q0FBQSxnQkFBYSxLQUFiO0FBQ0EsRUFBQUEsNENBQUEsbUJBQWdCLEtBQWhCO0FBQ0EsRUFBQUEsNENBQUEsWUFBUyxLQUFUO0FBTGlCLFNBQUFBO0FBQUEsR0FBQTtBQTJDbEIsTUFBTSxpQkFBaUI7QUFBQSxFQUN0QixZQUFZO0FBQUEsRUFDWixvQkFBb0Isb0JBQW9CO0FBQUEsRUFD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QUMsVUFBVTtBQUNkLFlBQU0sSUFBSSxtQkFBbUIsc0NBQXNDLEtBQUssVUFBVTtBQUFBLElBQ25GO0FBRUEsYUFBUyxjQUFjLEtBQUssU0FBUyxPQUFPLElBQUksWUFBWTtBQUM1RCxTQUFLLE9BQU8sSUFBSSxRQUFRO0FBQ3hCLGFBQVMsaUJBQWlCLEtBQUssU0FBUyxPQUFPLElBQUksWUFBWTtBQUUvRCxTQUFLLHlCQUF5QixLQUFLO0FBQ25DLFNBQUsscUJBQXFCLElBQUk7QUFDOUIsUUFBSSxRQUFRLE9BQU87QUFDbkIsU0FBSyxNQUFNLFFBQVEsR0FBRztBQUV0QixXQUFPLEtBQUssT0FBTztBQUFBLEVBQ3BCO0FBQUEsRUFFUSxxQkFBcUIsTUFBc0I7QUFDbEQsUUFBSSxLQUFLLE9BQU8sR0FBRztBQUNsQixXQUFLLGdCQUFnQixtQkFBbUIsS0FBSyxTQUFTLEtBQUssSUFBSTtBQUFBLElBQ2hFO0FBQUEsRUFDRDtBQUFBLEVBRUEsZ0JBQWdCLE9BQXVCO0FBQ3RDLFdBQU8sR0FBRyxLQUFLLEtBQUssSUFBSSxLQUFLO0FBQUEsRUFDOUI7QUFBQTtBQUFBLEVBSUEsVUFBVTtBQUNULGVBQVcsUUFBUSxLQUFLLE9BQU87QUFDOUIsV0FBSyxvQkFBb0IsUUFBUTtBQUNqQyxXQUFLLGtCQUFrQixRQUFRO0FBRS9CLFVBQUksS0FBSyxLQUFLO0FBQ2IsY0FBTSxXQUFXLEtBQUssVUFBVSxJQUFJLEtBQUssSUFBSSxVQUFVO0FBQ3ZELFlBQUksVUFBVTtBQUNiLG1CQUFTLGlCQUFpQixLQUFLLFNBQVMsSUFBSSxLQUFLLElBQUksY0FBYyxNQUFTO0FBQzVFLG1CQUFTLGdCQUFnQixLQUFLLElBQUksWUFBWTtBQUFBLFFBQy9DO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxTQUFLLFFBQVEsQ0FBQztBQUVkLFNBQUssU0FBUyxPQUFPO0FBRXJCLFNBQUssNkJBQTZCLFFBQVE7QUFDMUMsU0FBSyxZQUFZLFFBQVE7QUFBQSxFQUMxQjtBQUNEO0FBLzZDYSxVQUVHLGdCQUFnQjtBQWkxQmxCO0FBQUEsRUFBWjtBQUFBLEdBbjFCVyxVQW0xQkM7QUFDQTtBQUFBLEVBQVo7QUFBQSxHQXAxQlcsVUFvMUJDO0FBQ0E7QUFBQSxFQUFaO0FBQUEsR0FyMUJXLFVBcTFCQztBQUNBO0FBQUEsRUFBWjtBQUFBLEdBdDFCVyxVQXMxQkM7QUFDQTtBQUFBLEVBQVo7QUFBQSxHQXYxQlcsVUF1MUJDO0FBQ0E7QUFBQSxFQUFaO0FBQUEsR0F4MUJXLFVBdzFCQztBQUNBO0FBQUEsRUFBWjtBQUFBLEdBejFCVyxVQXkxQkM7QUFDQTtBQUFBLEVBQVo7QUFBQSxHQTExQlcsVUEwMUJDO0FBQ0E7QUFBQSxFQUFaO0FBQUEsR0EzMUJXLFVBMjFCQztBQUNBO0FBQUEsRUFBWjtBQUFBLEdBNTFCVyxVQTQxQkM7QUFDQTtBQUFBLEVBQVo7QUFBQSxHQTcxQlcsVUE2MUJDO0FBNzFCUCxJQUFNLFdBQU47IiwKICAibmFtZXMiOiBbIkxpc3RWaWV3VGFyZ2V0U2VjdG9yIiwgImUiLCAic2l6ZSJdCn0K
