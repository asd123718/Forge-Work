import { getZoomFactor, isChrome } from "../../browser.js";
import * as dom from "../../dom.js";
import { createFastDomNode } from "../../fastDomNode.js";
import { StandardWheelEvent } from "../../mouseEvent.js";
import { HorizontalScrollbar } from "./horizontalScrollbar.js";
import { VerticalScrollbar } from "./verticalScrollbar.js";
import { Widget } from "../widget.js";
import { TimeoutTimer } from "../../../common/async.js";
import { Emitter } from "../../../common/event.js";
import { dispose } from "../../../common/lifecycle.js";
import * as platform from "../../../common/platform.js";
import { Scrollable, ScrollbarVisibility } from "../../../common/scrollable.js";
import "./media/scrollbars.css";
const HIDE_TIMEOUT = 500;
const SCROLL_WHEEL_SENSITIVITY = 50;
const SCROLL_WHEEL_SMOOTH_SCROLL_ENABLED = true;
const DEFAULT_SCROLLBAR_SIZE = 10;
let globalDefaultScrollbarSize = DEFAULT_SCROLLBAR_SIZE;
const _onDidChangeDefaultScrollbarSizeEmitter = new Emitter();
const onDidChangeDefaultScrollbarSize = _onDidChangeDefaultScrollbarSizeEmitter.event;
function setGlobalDefaultScrollbarSize(size) {
  if (size !== globalDefaultScrollbarSize) {
    globalDefaultScrollbarSize = size;
    _onDidChangeDefaultScrollbarSizeEmitter.fire(size);
  }
}
class MouseWheelClassifierItem {
  constructor(timestamp, deltaX, deltaY) {
    this.timestamp = timestamp;
    this.deltaX = deltaX;
    this.deltaY = deltaY;
    this.score = 0;
  }
}
const _MouseWheelClassifier = class _MouseWheelClassifier {
  constructor() {
    this._capacity = 5;
    this._memory = [];
    this._front = -1;
    this._rear = -1;
  }
  isPhysicalMouseWheel() {
    if (this._front === -1 && this._rear === -1) {
      return false;
    }
    let remainingInfluence = 1;
    let score = 0;
    let iteration = 1;
    let index = this._rear;
    do {
      const influence = index === this._front ? remainingInfluence : Math.pow(2, -iteration);
      remainingInfluence -= influence;
      score += this._memory[index].score * influence;
      if (index === this._front) {
        break;
      }
      index = (this._capacity + index - 1) % this._capacity;
      iteration++;
    } while (true);
    return score <= 0.5;
  }
  acceptStandardWheelEvent(e) {
    if (isChrome) {
      const targetWindow = dom.getWindow(e.browserEvent);
      const pageZoomFactor = getZoomFactor(targetWindow);
      this.accept(Date.now(), e.deltaX * pageZoomFactor, e.deltaY * pageZoomFactor);
    } else {
      this.accept(Date.now(), e.deltaX, e.deltaY);
    }
  }
  accept(timestamp, deltaX, deltaY) {
    let previousItem = null;
    const item = new MouseWheelClassifierItem(timestamp, deltaX, deltaY);
    if (this._front === -1 && this._rear === -1) {
      this._memory[0] = item;
      this._front = 0;
      this._rear = 0;
    } else {
      previousItem = this._memory[this._rear];
      this._rear = (this._rear + 1) % this._capacity;
      if (this._rear === this._front) {
        this._front = (this._front + 1) % this._capacity;
      }
      this._memory[this._rear] = item;
    }
    item.score = this._computeScore(item, previousItem);
  }
  /**
   * A score between 0 and 1 for `item`.
   *  - a score towards 0 indicates that the source appears to be a physical mouse wheel
   *  - a score towards 1 indicates that the source appears to be a touchpad or magic mouse, etc.
   */
  _computeScore(item, previousItem) {
    if (Math.abs(item.deltaX) > 0 && Math.abs(item.deltaY) > 0) {
      return 1;
    }
    let score = 0.5;
    if (!this._isAlmostInt(item.deltaX) || !this._isAlmostInt(item.deltaY)) {
      score += 0.25;
    }
    if (previousItem) {
      const absDeltaX = Math.abs(item.deltaX);
      const absDeltaY = Math.abs(item.deltaY);
      const absPreviousDeltaX = Math.abs(previousItem.deltaX);
      const absPreviousDeltaY = Math.abs(previousItem.deltaY);
      const minDeltaX = Math.max(Math.min(absDeltaX, absPreviousDeltaX), 1);
      const minDeltaY = Math.max(Math.min(absDeltaY, absPreviousDeltaY), 1);
      const maxDeltaX = Math.max(absDeltaX, absPreviousDeltaX);
      const maxDeltaY = Math.max(absDeltaY, absPreviousDeltaY);
      const isSameModulo = maxDeltaX % minDeltaX === 0 && maxDeltaY % minDeltaY === 0;
      if (isSameModulo) {
        score -= 0.5;
      }
    }
    return Math.min(Math.max(score, 0), 1);
  }
  _isAlmostInt(value) {
    const epsilon = Number.EPSILON * 100;
    const delta = Math.abs(Math.round(value) - value);
    return delta < 0.01 + epsilon;
  }
};
_MouseWheelClassifier.INSTANCE = new _MouseWheelClassifier();
let MouseWheelClassifier = _MouseWheelClassifier;
class AbstractScrollableElement extends Widget {
  constructor(element, options, scrollable) {
    super();
    this._inertialTimeout = null;
    this._inertialSpeed = { X: 0, Y: 0 };
    this._onScroll = this._register(new Emitter());
    this._onWillScroll = this._register(new Emitter());
    element.style.overflow = "hidden";
    this._options = resolveOptions(options);
    this._scrollable = scrollable;
    this._register(this._scrollable.onScroll((e) => {
      this._onWillScroll.fire(e);
      this._onDidScroll(e);
      this._onScroll.fire(e);
    }));
    const scrollbarHost = {
      onMouseWheel: (mouseWheelEvent) => this._onMouseWheel(mouseWheelEvent),
      onDragStart: () => this._onDragStart(),
      onDragEnd: () => this._onDragEnd()
    };
    this._verticalScrollbar = this._register(new VerticalScrollbar(this._scrollable, this._options, scrollbarHost));
    this._horizontalScrollbar = this._register(new HorizontalScrollbar(this._scrollable, this._options, scrollbarHost));
    this._domNode = document.createElement("div");
    this._domNode.className = "monaco-scrollable-element " + this._options.className;
    this._domNode.setAttribute("role", "presentation");
    this._domNode.style.position = "relative";
    this._domNode.style.overflow = "hidden";
    this._domNode.appendChild(element);
    this._domNode.appendChild(this._horizontalScrollbar.domNode.domNode);
    this._domNode.appendChild(this._verticalScrollbar.domNode.domNode);
    if (this._options.useShadows) {
      this._leftShadowDomNode = createFastDomNode(document.createElement("div"));
      this._leftShadowDomNode.setClassName("shadow");
      this._domNode.appendChild(this._leftShadowDomNode.domNode);
      this._topShadowDomNode = createFastDomNode(document.createElement("div"));
      this._topShadowDomNode.setClassName("shadow");
      this._domNode.appendChild(this._topShadowDomNode.domNode);
      this._topLeftShadowDomNode = createFastDomNode(document.createElement("div"));
      this._topLeftShadowDomNode.setClassName("shadow");
      this._domNode.appendChild(this._topLeftShadowDomNode.domNode);
    } else {
      this._leftShadowDomNode = null;
      this._topShadowDomNode = null;
      this._topLeftShadowDomNode = null;
    }
    this._listenOnDomNode = this._options.listenOnDomNode || this._domNode;
    this._mouseWheelToDispose = [];
    this._setListeningToMouseWheel(this._options.handleMouseWheel);
    this.onmouseover(this._listenOnDomNode, (e) => this._onMouseOver(e));
    this.onmouseleave(this._listenOnDomNode, (e) => this._onMouseLeave(e));
    this._hideTimeout = this._register(new TimeoutTimer());
    this._isDragging = false;
    this._mouseIsOver = false;
    this._shouldRender = true;
    this._revealOnScroll = true;
    const hSizeExplicit = typeof options.horizontalScrollbarSize !== "undefined";
    const vSizeExplicit = typeof options.verticalScrollbarSize !== "undefined";
    if (!hSizeExplicit || !vSizeExplicit) {
      this._register(onDidChangeDefaultScrollbarSize((newSize) => {
        this.updateOptions({
          ...!hSizeExplicit ? { horizontalScrollbarSize: newSize } : {},
          ...!vSizeExplicit ? { verticalScrollbarSize: newSize } : {}
        });
      }));
    }
  }
  get onScroll() {
    return this._onScroll.event;
  }
  get onWillScroll() {
    return this._onWillScroll.event;
  }
  get options() {
    return this._options;
  }
  dispose() {
    this._mouseWheelToDispose = dispose(this._mouseWheelToDispose);
    if (this._inertialTimeout) {
      this._inertialTimeout.dispose();
      this._inertialTimeout = null;
    }
    super.dispose();
  }
  /**
   * Get the generated 'scrollable' dom node
   */
  getDomNode() {
    return this._domNode;
  }
  getOverviewRulerLayoutInfo() {
    return {
      parent: this._domNode,
      insertBefore: this._verticalScrollbar.domNode.domNode
    };
  }
  /**
   * Delegate a pointer down event to the vertical scrollbar.
   * This is to help with clicking somewhere else and having the scrollbar react.
   */
  delegateVerticalScrollbarPointerDown(browserEvent) {
    this._verticalScrollbar.delegatePointerDown(browserEvent);
  }
  getScrollDimensions() {
    return this._scrollable.getScrollDimensions();
  }
  setScrollDimensions(dimensions) {
    this._scrollable.setScrollDimensions(dimensions, false);
  }
  /**
   * Update the class name of the scrollable element.
   */
  updateClassName(newClassName) {
    this._options.className = newClassName;
    if (platform.isMacintosh) {
      this._options.className += " mac";
    }
    this._domNode.className = "monaco-scrollable-element " + this._options.className;
  }
  /**
   * Update configuration options for the scrollbar.
   */
  updateOptions(newOptions) {
    if (typeof newOptions.handleMouseWheel !== "undefined") {
      this._options.handleMouseWheel = newOptions.handleMouseWheel;
      this._setListeningToMouseWheel(this._options.handleMouseWheel);
    }
    if (typeof newOptions.mouseWheelScrollSensitivity !== "undefined") {
      this._options.mouseWheelScrollSensitivity = newOptions.mouseWheelScrollSensitivity;
    }
    if (typeof newOptions.fastScrollSensitivity !== "undefined") {
      this._options.fastScrollSensitivity = newOptions.fastScrollSensitivity;
    }
    if (typeof newOptions.scrollPredominantAxis !== "undefined") {
      this._options.scrollPredominantAxis = newOptions.scrollPredominantAxis;
    }
    if (typeof newOptions.horizontal !== "undefined") {
      this._options.horizontal = newOptions.horizontal;
    }
    if (typeof newOptions.vertical !== "undefined") {
      this._options.vertical = newOptions.vertical;
    }
    if (typeof newOptions.horizontalScrollbarSize !== "undefined") {
      this._options.horizontalScrollbarSize = newOptions.horizontalScrollbarSize;
    }
    if (typeof newOptions.verticalScrollbarSize !== "undefined") {
      this._options.verticalScrollbarSize = newOptions.verticalScrollbarSize;
    }
    if (typeof newOptions.scrollByPage !== "undefined") {
      this._options.scrollByPage = newOptions.scrollByPage;
    }
    this._horizontalScrollbar.updateOptions(this._options);
    this._verticalScrollbar.updateOptions(this._options);
    if (!this._options.lazyRender) {
      this._render();
    }
  }
  setRevealOnScroll(value) {
    this._revealOnScroll = value;
  }
  delegateScrollFromMouseWheelEvent(browserEvent) {
    this._onMouseWheel(new StandardWheelEvent(browserEvent));
  }
  async _periodicSync() {
    let scheduleAgain = false;
    if (this._inertialSpeed.X !== 0 || this._inertialSpeed.Y !== 0) {
      this._scrollable.setScrollPositionNow({
        scrollTop: this._scrollable.getCurrentScrollPosition().scrollTop - this._inertialSpeed.Y * 100,
        scrollLeft: this._scrollable.getCurrentScrollPosition().scrollLeft - this._inertialSpeed.X * 100
      });
      this._inertialSpeed.X *= 0.9;
      this._inertialSpeed.Y *= 0.9;
      if (Math.abs(this._inertialSpeed.X) < 0.01) {
        this._inertialSpeed.X = 0;
      }
      if (Math.abs(this._inertialSpeed.Y) < 0.01) {
        this._inertialSpeed.Y = 0;
      }
      scheduleAgain = this._inertialSpeed.X !== 0 || this._inertialSpeed.Y !== 0;
    }
    if (scheduleAgain) {
      if (!this._inertialTimeout) {
        this._inertialTimeout = new TimeoutTimer();
      }
      this._inertialTimeout.cancelAndSet(() => this._periodicSync(), 1e3 / 60);
    } else {
      this._inertialTimeout?.dispose();
      this._inertialTimeout = null;
    }
  }
  // -------------------- mouse wheel scrolling --------------------
  _setListeningToMouseWheel(shouldListen) {
    const isListening = this._mouseWheelToDispose.length > 0;
    if (isListening === shouldListen) {
      return;
    }
    this._mouseWheelToDispose = dispose(this._mouseWheelToDispose);
    if (shouldListen) {
      const onMouseWheel = (browserEvent) => {
        this._onMouseWheel(new StandardWheelEvent(browserEvent));
      };
      this._mouseWheelToDispose.push(dom.addDisposableListener(this._listenOnDomNode, dom.EventType.MOUSE_WHEEL, onMouseWheel, { passive: false }));
    }
  }
  _onMouseWheel(e) {
    if (e.browserEvent?.defaultPrevented) {
      return;
    }
    const classifier = MouseWheelClassifier.INSTANCE;
    if (SCROLL_WHEEL_SMOOTH_SCROLL_ENABLED) {
      classifier.acceptStandardWheelEvent(e);
    }
    let didScroll = false;
    if (e.deltaY || e.deltaX) {
      let deltaY = e.deltaY * this._options.mouseWheelScrollSensitivity;
      let deltaX = e.deltaX * this._options.mouseWheelScrollSensitivity;
      if (this._options.scrollPredominantAxis) {
        if (this._options.scrollYToX && deltaX + deltaY === 0) {
          deltaX = deltaY = 0;
        } else if (Math.abs(deltaY) >= Math.abs(deltaX)) {
          deltaX = 0;
        } else {
          deltaY = 0;
        }
      }
      if (this._options.flipAxes) {
        [deltaY, deltaX] = [deltaX, deltaY];
      }
      const shiftConvert = !platform.isMacintosh && e.browserEvent && e.browserEvent.shiftKey;
      if ((this._options.scrollYToX || shiftConvert) && !deltaX) {
        deltaX = deltaY;
        deltaY = 0;
      }
      if (e.browserEvent && e.browserEvent.altKey) {
        deltaX = deltaX * this._options.fastScrollSensitivity;
        deltaY = deltaY * this._options.fastScrollSensitivity;
      }
      const futureScrollPosition = this._scrollable.getFutureScrollPosition();
      let desiredScrollPosition = {};
      if (deltaY) {
        const deltaScrollTop = SCROLL_WHEEL_SENSITIVITY * deltaY;
        const desiredScrollTop = futureScrollPosition.scrollTop - (deltaScrollTop < 0 ? Math.floor(deltaScrollTop) : Math.ceil(deltaScrollTop));
        this._verticalScrollbar.writeScrollPosition(desiredScrollPosition, desiredScrollTop);
      }
      if (deltaX) {
        const deltaScrollLeft = SCROLL_WHEEL_SENSITIVITY * deltaX;
        const desiredScrollLeft = futureScrollPosition.scrollLeft - (deltaScrollLeft < 0 ? Math.floor(deltaScrollLeft) : Math.ceil(deltaScrollLeft));
        this._horizontalScrollbar.writeScrollPosition(desiredScrollPosition, desiredScrollLeft);
      }
      desiredScrollPosition = this._scrollable.validateScrollPosition(desiredScrollPosition);
      if (this._options.inertialScroll && (deltaX || deltaY) && !classifier.isPhysicalMouseWheel()) {
        let startPeriodic = false;
        if (this._inertialSpeed.X === 0 && this._inertialSpeed.Y === 0) {
          startPeriodic = true;
        }
        this._inertialSpeed.Y = (deltaY < 0 ? -1 : 1) * Math.abs(deltaY) ** 1.02;
        this._inertialSpeed.X = (deltaX < 0 ? -1 : 1) * Math.abs(deltaX) ** 1.02;
        if (startPeriodic) {
          this._periodicSync();
        }
      }
      if (futureScrollPosition.scrollLeft !== desiredScrollPosition.scrollLeft || futureScrollPosition.scrollTop !== desiredScrollPosition.scrollTop) {
        const canPerformSmoothScroll = SCROLL_WHEEL_SMOOTH_SCROLL_ENABLED && this._options.mouseWheelSmoothScroll && classifier.isPhysicalMouseWheel();
        if (canPerformSmoothScroll) {
          this._scrollable.setScrollPositionSmooth(desiredScrollPosition);
        } else {
          this._scrollable.setScrollPositionNow(desiredScrollPosition);
        }
        didScroll = true;
      }
    }
    let consumeMouseWheel = didScroll;
    if (!consumeMouseWheel && this._options.alwaysConsumeMouseWheel) {
      consumeMouseWheel = true;
    }
    if (!consumeMouseWheel && this._options.consumeMouseWheelIfScrollbarIsNeeded && (this._verticalScrollbar.isNeeded() || this._horizontalScrollbar.isNeeded())) {
      consumeMouseWheel = true;
    }
    if (consumeMouseWheel) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
  _onDidScroll(e) {
    this._shouldRender = this._horizontalScrollbar.onDidScroll(e) || this._shouldRender;
    this._shouldRender = this._verticalScrollbar.onDidScroll(e) || this._shouldRender;
    if (this._options.useShadows) {
      this._shouldRender = true;
    }
    if (this._revealOnScroll) {
      this._reveal();
    }
    if (!this._options.lazyRender) {
      this._render();
    }
  }
  /**
   * Render / mutate the DOM now.
   * Should be used together with the ctor option `lazyRender`.
   */
  renderNow() {
    if (!this._options.lazyRender) {
      throw new Error("Please use `lazyRender` together with `renderNow`!");
    }
    this._render();
  }
  _render() {
    if (!this._shouldRender) {
      return;
    }
    this._shouldRender = false;
    this._horizontalScrollbar.render();
    this._verticalScrollbar.render();
    if (this._options.useShadows) {
      const scrollState = this._scrollable.getCurrentScrollPosition();
      const enableTop = scrollState.scrollTop > 0;
      const enableLeft = scrollState.scrollLeft > 0;
      const leftClassName = enableLeft ? " left" : "";
      const topClassName = enableTop ? " top" : "";
      const topLeftClassName = enableLeft || enableTop ? " top-left-corner" : "";
      this._leftShadowDomNode.setClassName(`shadow${leftClassName}`);
      this._topShadowDomNode.setClassName(`shadow${topClassName}`);
      this._topLeftShadowDomNode.setClassName(`shadow${topLeftClassName}${topClassName}${leftClassName}`);
    }
  }
  // -------------------- fade in / fade out --------------------
  _onDragStart() {
    this._isDragging = true;
    this._reveal();
  }
  _onDragEnd() {
    this._isDragging = false;
    this._hide();
  }
  _onMouseLeave(e) {
    this._mouseIsOver = false;
    this._hide();
  }
  _onMouseOver(e) {
    this._mouseIsOver = true;
    this._reveal();
  }
  _reveal() {
    this._verticalScrollbar.beginReveal();
    this._horizontalScrollbar.beginReveal();
    this._scheduleHide();
  }
  _hide() {
    if (!this._mouseIsOver && !this._isDragging) {
      this._verticalScrollbar.beginHide();
      this._horizontalScrollbar.beginHide();
    }
  }
  _scheduleHide() {
    if (!this._mouseIsOver && !this._isDragging) {
      this._hideTimeout.cancelAndSet(() => this._hide(), HIDE_TIMEOUT);
    }
  }
}
class ScrollableElement extends AbstractScrollableElement {
  constructor(element, options) {
    options = options || {};
    options.mouseWheelSmoothScroll = false;
    const scrollable = new Scrollable({
      forceIntegerValues: true,
      smoothScrollDuration: 0,
      scheduleAtNextAnimationFrame: (callback) => dom.scheduleAtNextAnimationFrame(dom.getWindow(element), callback)
    });
    super(element, options, scrollable);
    this._register(scrollable);
  }
  setScrollPosition(update) {
    this._scrollable.setScrollPositionNow(update);
  }
  getScrollPosition() {
    return this._scrollable.getCurrentScrollPosition();
  }
}
class SmoothScrollableElement extends AbstractScrollableElement {
  constructor(element, options, scrollable) {
    super(element, options, scrollable);
  }
  setScrollPosition(update) {
    if (update.reuseAnimation) {
      this._scrollable.setScrollPositionSmooth(update, update.reuseAnimation);
    } else {
      this._scrollable.setScrollPositionNow(update);
    }
  }
  getScrollPosition() {
    return this._scrollable.getCurrentScrollPosition();
  }
}
class DomScrollableElement extends AbstractScrollableElement {
  constructor(element, options) {
    options = options || {};
    options.mouseWheelSmoothScroll = false;
    const scrollable = new Scrollable({
      forceIntegerValues: false,
      // See https://github.com/microsoft/vscode/issues/139877
      smoothScrollDuration: 0,
      scheduleAtNextAnimationFrame: (callback) => dom.scheduleAtNextAnimationFrame(dom.getWindow(element), callback)
    });
    super(element, options, scrollable);
    this._register(scrollable);
    this._element = element;
    this._register(this.onScroll((e) => {
      if (e.scrollTopChanged) {
        this._element.scrollTop = e.scrollTop;
      }
      if (e.scrollLeftChanged) {
        this._element.scrollLeft = e.scrollLeft;
      }
    }));
    this.scanDomNode();
  }
  setScrollPosition(update) {
    this._scrollable.setScrollPositionNow(update);
  }
  getScrollPosition() {
    return this._scrollable.getCurrentScrollPosition();
  }
  scanDomNode() {
    this.setScrollDimensions({
      width: this._element.clientWidth,
      scrollWidth: this._element.scrollWidth,
      height: this._element.clientHeight,
      scrollHeight: this._element.scrollHeight
    });
    this.setScrollPosition({
      scrollLeft: this._element.scrollLeft,
      scrollTop: this._element.scrollTop
    });
  }
}
function resolveOptions(opts) {
  const result = {
    lazyRender: typeof opts.lazyRender !== "undefined" ? opts.lazyRender : false,
    className: typeof opts.className !== "undefined" ? opts.className : "",
    useShadows: typeof opts.useShadows !== "undefined" ? opts.useShadows : true,
    handleMouseWheel: typeof opts.handleMouseWheel !== "undefined" ? opts.handleMouseWheel : true,
    flipAxes: typeof opts.flipAxes !== "undefined" ? opts.flipAxes : false,
    consumeMouseWheelIfScrollbarIsNeeded: typeof opts.consumeMouseWheelIfScrollbarIsNeeded !== "undefined" ? opts.consumeMouseWheelIfScrollbarIsNeeded : false,
    alwaysConsumeMouseWheel: typeof opts.alwaysConsumeMouseWheel !== "undefined" ? opts.alwaysConsumeMouseWheel : false,
    scrollYToX: typeof opts.scrollYToX !== "undefined" ? opts.scrollYToX : false,
    mouseWheelScrollSensitivity: typeof opts.mouseWheelScrollSensitivity !== "undefined" ? opts.mouseWheelScrollSensitivity : 1,
    fastScrollSensitivity: typeof opts.fastScrollSensitivity !== "undefined" ? opts.fastScrollSensitivity : 5,
    scrollPredominantAxis: typeof opts.scrollPredominantAxis !== "undefined" ? opts.scrollPredominantAxis : true,
    mouseWheelSmoothScroll: typeof opts.mouseWheelSmoothScroll !== "undefined" ? opts.mouseWheelSmoothScroll : true,
    inertialScroll: typeof opts.inertialScroll !== "undefined" ? opts.inertialScroll : false,
    arrowSize: typeof opts.arrowSize !== "undefined" ? opts.arrowSize : 11,
    listenOnDomNode: typeof opts.listenOnDomNode !== "undefined" ? opts.listenOnDomNode : null,
    horizontal: typeof opts.horizontal !== "undefined" ? opts.horizontal : ScrollbarVisibility.Auto,
    horizontalScrollbarSize: typeof opts.horizontalScrollbarSize !== "undefined" ? opts.horizontalScrollbarSize : globalDefaultScrollbarSize,
    horizontalSliderSize: typeof opts.horizontalSliderSize !== "undefined" ? opts.horizontalSliderSize : 0,
    horizontalHasArrows: typeof opts.horizontalHasArrows !== "undefined" ? opts.horizontalHasArrows : false,
    vertical: typeof opts.vertical !== "undefined" ? opts.vertical : ScrollbarVisibility.Auto,
    verticalScrollbarSize: typeof opts.verticalScrollbarSize !== "undefined" ? opts.verticalScrollbarSize : globalDefaultScrollbarSize,
    verticalHasArrows: typeof opts.verticalHasArrows !== "undefined" ? opts.verticalHasArrows : false,
    verticalSliderSize: typeof opts.verticalSliderSize !== "undefined" ? opts.verticalSliderSize : 0,
    scrollByPage: typeof opts.scrollByPage !== "undefined" ? opts.scrollByPage : false
  };
  result.horizontalSliderSize = typeof opts.horizontalSliderSize !== "undefined" ? opts.horizontalSliderSize : result.horizontalScrollbarSize;
  result.verticalSliderSize = typeof opts.verticalSliderSize !== "undefined" ? opts.verticalSliderSize : result.verticalScrollbarSize;
  if (platform.isMacintosh) {
    result.className += " mac";
  }
  return result;
}
export {
  AbstractScrollableElement,
  DEFAULT_SCROLLBAR_SIZE,
  DomScrollableElement,
  MouseWheelClassifier,
  ScrollableElement,
  SmoothScrollableElement,
  onDidChangeDefaultScrollbarSize,
  setGlobalDefaultScrollbarSize
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFx1aVxcc2Nyb2xsYmFyXFxzY3JvbGxhYmxlRWxlbWVudC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGdldFpvb21GYWN0b3IsIGlzQ2hyb21lIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci5qcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vZG9tLmpzJztcbmltcG9ydCB7IEZhc3REb21Ob2RlLCBjcmVhdGVGYXN0RG9tTm9kZSB9IGZyb20gJy4uLy4uL2Zhc3REb21Ob2RlLmpzJztcbmltcG9ydCB7IElNb3VzZUV2ZW50LCBJTW91c2VXaGVlbEV2ZW50LCBTdGFuZGFyZFdoZWVsRXZlbnQgfSBmcm9tICcuLi8uLi9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IFNjcm9sbGJhckhvc3QgfSBmcm9tICcuL2Fic3RyYWN0U2Nyb2xsYmFyLmpzJztcbmltcG9ydCB7IEhvcml6b250YWxTY3JvbGxiYXIgfSBmcm9tICcuL2hvcml6b250YWxTY3JvbGxiYXIuanMnO1xuaW1wb3J0IHsgU2Nyb2xsYWJsZUVsZW1lbnRDaGFuZ2VPcHRpb25zLCBTY3JvbGxhYmxlRWxlbWVudENyZWF0aW9uT3B0aW9ucywgU2Nyb2xsYWJsZUVsZW1lbnRSZXNvbHZlZE9wdGlvbnMgfSBmcm9tICcuL3Njcm9sbGFibGVFbGVtZW50T3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBWZXJ0aWNhbFNjcm9sbGJhciB9IGZyb20gJy4vdmVydGljYWxTY3JvbGxiYXIuanMnO1xuaW1wb3J0IHsgV2lkZ2V0IH0gZnJvbSAnLi4vd2lkZ2V0LmpzJztcbmltcG9ydCB7IFRpbWVvdXRUaW1lciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgZGlzcG9zZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElOZXdTY3JvbGxEaW1lbnNpb25zLCBJTmV3U2Nyb2xsUG9zaXRpb24sIElTY3JvbGxEaW1lbnNpb25zLCBJU2Nyb2xsUG9zaXRpb24sIFNjcm9sbEV2ZW50LCBTY3JvbGxhYmxlLCBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0ICcuL21lZGlhL3Njcm9sbGJhcnMuY3NzJztcblxuY29uc3QgSElERV9USU1FT1VUID0gNTAwO1xuY29uc3QgU0NST0xMX1dIRUVMX1NFTlNJVElWSVRZID0gNTA7XG5jb25zdCBTQ1JPTExfV0hFRUxfU01PT1RIX1NDUk9MTF9FTkFCTEVEID0gdHJ1ZTtcblxuLyoqIFRoZSBkZWZhdWx0IHNpemUgKHB4KSB1c2VkIHdoZW4gYSBzY3JvbGxiYXIgZWxlbWVudCBkb2VzIG5vdCBwYXNzIGFuIGV4cGxpY2l0IHNpemUuICovXG5leHBvcnQgY29uc3QgREVGQVVMVF9TQ1JPTExCQVJfU0laRSA9IDEwO1xubGV0IGdsb2JhbERlZmF1bHRTY3JvbGxiYXJTaXplID0gREVGQVVMVF9TQ1JPTExCQVJfU0laRTtcbmNvbnN0IF9vbkRpZENoYW5nZURlZmF1bHRTY3JvbGxiYXJTaXplRW1pdHRlciA9IG5ldyBFbWl0dGVyPG51bWJlcj4oKTtcbmV4cG9ydCBjb25zdCBvbkRpZENoYW5nZURlZmF1bHRTY3JvbGxiYXJTaXplOiBFdmVudDxudW1iZXI+ID0gX29uRGlkQ2hhbmdlRGVmYXVsdFNjcm9sbGJhclNpemVFbWl0dGVyLmV2ZW50O1xuXG4vKipcbiAqIFVwZGF0ZSB0aGUgZGVmYXVsdCBzY3JvbGxiYXIgc2l6ZSB1c2VkIGJ5IGFsbCBzY3JvbGxhYmxlIGVsZW1lbnRzIHRoYXQgd2VyZVxuICogY3JlYXRlZCB3aXRob3V0IGFuIGV4cGxpY2l0IGhvcml6b250YWwvdmVydGljYWwgc2Nyb2xsYmFyIHNpemUgb3B0aW9uLlxuICogRWxlbWVudHMgd2l0aCBleHBsaWNpdCBzaXplcyAoZS5nLiB0aGUgZWRpdG9yLCBtZW51cykgYXJlIHVuYWZmZWN0ZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRHbG9iYWxEZWZhdWx0U2Nyb2xsYmFyU2l6ZShzaXplOiBudW1iZXIpOiB2b2lkIHtcblx0aWYgKHNpemUgIT09IGdsb2JhbERlZmF1bHRTY3JvbGxiYXJTaXplKSB7XG5cdFx0Z2xvYmFsRGVmYXVsdFNjcm9sbGJhclNpemUgPSBzaXplO1xuXHRcdF9vbkRpZENoYW5nZURlZmF1bHRTY3JvbGxiYXJTaXplRW1pdHRlci5maXJlKHNpemUpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU92ZXJ2aWV3UnVsZXJMYXlvdXRJbmZvIHtcblx0cGFyZW50OiBIVE1MRWxlbWVudDtcblx0aW5zZXJ0QmVmb3JlOiBIVE1MRWxlbWVudDtcbn1cblxuY2xhc3MgTW91c2VXaGVlbENsYXNzaWZpZXJJdGVtIHtcblx0cHVibGljIHRpbWVzdGFtcDogbnVtYmVyO1xuXHRwdWJsaWMgZGVsdGFYOiBudW1iZXI7XG5cdHB1YmxpYyBkZWx0YVk6IG51bWJlcjtcblx0cHVibGljIHNjb3JlOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IodGltZXN0YW1wOiBudW1iZXIsIGRlbHRhWDogbnVtYmVyLCBkZWx0YVk6IG51bWJlcikge1xuXHRcdHRoaXMudGltZXN0YW1wID0gdGltZXN0YW1wO1xuXHRcdHRoaXMuZGVsdGFYID0gZGVsdGFYO1xuXHRcdHRoaXMuZGVsdGFZID0gZGVsdGFZO1xuXHRcdHRoaXMuc2NvcmUgPSAwO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNb3VzZVdoZWVsQ2xhc3NpZmllciB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJTlNUQU5DRSA9IG5ldyBNb3VzZVdoZWVsQ2xhc3NpZmllcigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhcGFjaXR5OiBudW1iZXI7XG5cdHByaXZhdGUgX21lbW9yeTogTW91c2VXaGVlbENsYXNzaWZpZXJJdGVtW107XG5cdHByaXZhdGUgX2Zyb250OiBudW1iZXI7XG5cdHByaXZhdGUgX3JlYXI6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLl9jYXBhY2l0eSA9IDU7XG5cdFx0dGhpcy5fbWVtb3J5ID0gW107XG5cdFx0dGhpcy5fZnJvbnQgPSAtMTtcblx0XHR0aGlzLl9yZWFyID0gLTE7XG5cdH1cblxuXHRwdWJsaWMgaXNQaHlzaWNhbE1vdXNlV2hlZWwoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX2Zyb250ID09PSAtMSAmJiB0aGlzLl9yZWFyID09PSAtMSkge1xuXHRcdFx0Ly8gbm8gZWxlbWVudHNcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyAwLjUgKiBsYXN0ICsgMC4yNSAqIDJuZCBsYXN0ICsgMC4xMjUgKiAzcmQgbGFzdCArIC4uLlxuXHRcdGxldCByZW1haW5pbmdJbmZsdWVuY2UgPSAxO1xuXHRcdGxldCBzY29yZSA9IDA7XG5cdFx0bGV0IGl0ZXJhdGlvbiA9IDE7XG5cblx0XHRsZXQgaW5kZXggPSB0aGlzLl9yZWFyO1xuXHRcdGRvIHtcblx0XHRcdGNvbnN0IGluZmx1ZW5jZSA9IChpbmRleCA9PT0gdGhpcy5fZnJvbnQgPyByZW1haW5pbmdJbmZsdWVuY2UgOiBNYXRoLnBvdygyLCAtaXRlcmF0aW9uKSk7XG5cdFx0XHRyZW1haW5pbmdJbmZsdWVuY2UgLT0gaW5mbHVlbmNlO1xuXHRcdFx0c2NvcmUgKz0gdGhpcy5fbWVtb3J5W2luZGV4XS5zY29yZSAqIGluZmx1ZW5jZTtcblxuXHRcdFx0aWYgKGluZGV4ID09PSB0aGlzLl9mcm9udCkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0aW5kZXggPSAodGhpcy5fY2FwYWNpdHkgKyBpbmRleCAtIDEpICUgdGhpcy5fY2FwYWNpdHk7XG5cdFx0XHRpdGVyYXRpb24rKztcblx0XHR9IHdoaWxlICh0cnVlKTtcblxuXHRcdHJldHVybiAoc2NvcmUgPD0gMC41KTtcblx0fVxuXG5cdHB1YmxpYyBhY2NlcHRTdGFuZGFyZFdoZWVsRXZlbnQoZTogU3RhbmRhcmRXaGVlbEV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKGlzQ2hyb21lKSB7XG5cdFx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBkb20uZ2V0V2luZG93KGUuYnJvd3NlckV2ZW50KTtcblx0XHRcdGNvbnN0IHBhZ2Vab29tRmFjdG9yID0gZ2V0Wm9vbUZhY3Rvcih0YXJnZXRXaW5kb3cpO1xuXHRcdFx0Ly8gT24gQ2hyb21lLCB0aGUgaW5jb21pbmcgZGVsdGEgZXZlbnRzIGFyZSBtdWx0aXBsaWVkIHdpdGggdGhlIE9TIHpvb20gZmFjdG9yLlxuXHRcdFx0Ly8gVGhlIE9TIHpvb20gZmFjdG9yIGNhbiBiZSByZXZlcnNlIGVuZ2luZWVyZWQgYnkgdXNpbmcgdGhlIGRldmljZSBwaXhlbCByYXRpbyBhbmQgdGhlIGNvbmZpZ3VyZWQgem9vbSBmYWN0b3IgaW50byBhY2NvdW50LlxuXHRcdFx0dGhpcy5hY2NlcHQoRGF0ZS5ub3coKSwgZS5kZWx0YVggKiBwYWdlWm9vbUZhY3RvciwgZS5kZWx0YVkgKiBwYWdlWm9vbUZhY3Rvcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuYWNjZXB0KERhdGUubm93KCksIGUuZGVsdGFYLCBlLmRlbHRhWSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFjY2VwdCh0aW1lc3RhbXA6IG51bWJlciwgZGVsdGFYOiBudW1iZXIsIGRlbHRhWTogbnVtYmVyKTogdm9pZCB7XG5cdFx0bGV0IHByZXZpb3VzSXRlbSA9IG51bGw7XG5cdFx0Y29uc3QgaXRlbSA9IG5ldyBNb3VzZVdoZWVsQ2xhc3NpZmllckl0ZW0odGltZXN0YW1wLCBkZWx0YVgsIGRlbHRhWSk7XG5cblx0XHRpZiAodGhpcy5fZnJvbnQgPT09IC0xICYmIHRoaXMuX3JlYXIgPT09IC0xKSB7XG5cdFx0XHR0aGlzLl9tZW1vcnlbMF0gPSBpdGVtO1xuXHRcdFx0dGhpcy5fZnJvbnQgPSAwO1xuXHRcdFx0dGhpcy5fcmVhciA9IDA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHByZXZpb3VzSXRlbSA9IHRoaXMuX21lbW9yeVt0aGlzLl9yZWFyXTtcblxuXHRcdFx0dGhpcy5fcmVhciA9ICh0aGlzLl9yZWFyICsgMSkgJSB0aGlzLl9jYXBhY2l0eTtcblx0XHRcdGlmICh0aGlzLl9yZWFyID09PSB0aGlzLl9mcm9udCkge1xuXHRcdFx0XHQvLyBEcm9wIG9sZGVzdFxuXHRcdFx0XHR0aGlzLl9mcm9udCA9ICh0aGlzLl9mcm9udCArIDEpICUgdGhpcy5fY2FwYWNpdHk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9tZW1vcnlbdGhpcy5fcmVhcl0gPSBpdGVtO1xuXHRcdH1cblxuXHRcdGl0ZW0uc2NvcmUgPSB0aGlzLl9jb21wdXRlU2NvcmUoaXRlbSwgcHJldmlvdXNJdGVtKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBIHNjb3JlIGJldHdlZW4gMCBhbmQgMSBmb3IgYGl0ZW1gLlxuXHQgKiAgLSBhIHNjb3JlIHRvd2FyZHMgMCBpbmRpY2F0ZXMgdGhhdCB0aGUgc291cmNlIGFwcGVhcnMgdG8gYmUgYSBwaHlzaWNhbCBtb3VzZSB3aGVlbFxuXHQgKiAgLSBhIHNjb3JlIHRvd2FyZHMgMSBpbmRpY2F0ZXMgdGhhdCB0aGUgc291cmNlIGFwcGVhcnMgdG8gYmUgYSB0b3VjaHBhZCBvciBtYWdpYyBtb3VzZSwgZXRjLlxuXHQgKi9cblx0cHJpdmF0ZSBfY29tcHV0ZVNjb3JlKGl0ZW06IE1vdXNlV2hlZWxDbGFzc2lmaWVySXRlbSwgcHJldmlvdXNJdGVtOiBNb3VzZVdoZWVsQ2xhc3NpZmllckl0ZW0gfCBudWxsKTogbnVtYmVyIHtcblxuXHRcdGlmIChNYXRoLmFicyhpdGVtLmRlbHRhWCkgPiAwICYmIE1hdGguYWJzKGl0ZW0uZGVsdGFZKSA+IDApIHtcblx0XHRcdC8vIGJvdGggYXhlcyBleGVyY2lzZWQgPT4gZGVmaW5pdGVseSBub3QgYSBwaHlzaWNhbCBtb3VzZSB3aGVlbFxuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fVxuXG5cdFx0bGV0IHNjb3JlOiBudW1iZXIgPSAwLjU7XG5cblx0XHRpZiAoIXRoaXMuX2lzQWxtb3N0SW50KGl0ZW0uZGVsdGFYKSB8fCAhdGhpcy5faXNBbG1vc3RJbnQoaXRlbS5kZWx0YVkpKSB7XG5cdFx0XHQvLyBub24taW50ZWdlciBkZWx0YXMgPT4gaW5kaWNhdG9yIHRoYXQgdGhpcyBpcyBub3QgYSBwaHlzaWNhbCBtb3VzZSB3aGVlbFxuXHRcdFx0c2NvcmUgKz0gMC4yNTtcblx0XHR9XG5cblx0XHQvLyBOb24tYWNjZWxlcmF0aW5nIHNjcm9sbCA9PiBpbmRpY2F0b3IgdGhhdCB0aGlzIGlzIGEgcGh5c2ljYWwgbW91c2Ugd2hlZWxcblx0XHQvLyBUaGVzZSBjYW4gYmUgaWRlbnRpZmllZCBieSBzZWVpbmcgd2hldGhlciB0aGV5IGFyZSB0aGUgbW9kdWxlIG9mIG9uZSBhbm90aGVyLlxuXHRcdGlmIChwcmV2aW91c0l0ZW0pIHtcblx0XHRcdGNvbnN0IGFic0RlbHRhWCA9IE1hdGguYWJzKGl0ZW0uZGVsdGFYKTtcblx0XHRcdGNvbnN0IGFic0RlbHRhWSA9IE1hdGguYWJzKGl0ZW0uZGVsdGFZKTtcblxuXHRcdFx0Y29uc3QgYWJzUHJldmlvdXNEZWx0YVggPSBNYXRoLmFicyhwcmV2aW91c0l0ZW0uZGVsdGFYKTtcblx0XHRcdGNvbnN0IGFic1ByZXZpb3VzRGVsdGFZID0gTWF0aC5hYnMocHJldmlvdXNJdGVtLmRlbHRhWSk7XG5cblx0XHRcdC8vIE1pbiAxIHRvIGF2b2lkIGRpdmlzaW9uIGJ5IHplcm8sIG1vZHVsZSAxIHdpbGwgc3RpbGwgYmUgMC5cblx0XHRcdGNvbnN0IG1pbkRlbHRhWCA9IE1hdGgubWF4KE1hdGgubWluKGFic0RlbHRhWCwgYWJzUHJldmlvdXNEZWx0YVgpLCAxKTtcblx0XHRcdGNvbnN0IG1pbkRlbHRhWSA9IE1hdGgubWF4KE1hdGgubWluKGFic0RlbHRhWSwgYWJzUHJldmlvdXNEZWx0YVkpLCAxKTtcblxuXHRcdFx0Y29uc3QgbWF4RGVsdGFYID0gTWF0aC5tYXgoYWJzRGVsdGFYLCBhYnNQcmV2aW91c0RlbHRhWCk7XG5cdFx0XHRjb25zdCBtYXhEZWx0YVkgPSBNYXRoLm1heChhYnNEZWx0YVksIGFic1ByZXZpb3VzRGVsdGFZKTtcblxuXHRcdFx0Y29uc3QgaXNTYW1lTW9kdWxvID0gKG1heERlbHRhWCAlIG1pbkRlbHRhWCA9PT0gMCAmJiBtYXhEZWx0YVkgJSBtaW5EZWx0YVkgPT09IDApO1xuXHRcdFx0aWYgKGlzU2FtZU1vZHVsbykge1xuXHRcdFx0XHRzY29yZSAtPSAwLjU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIE1hdGgubWluKE1hdGgubWF4KHNjb3JlLCAwKSwgMSk7XG5cdH1cblxuXHRwcml2YXRlIF9pc0FsbW9zdEludCh2YWx1ZTogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZXBzaWxvbiA9IE51bWJlci5FUFNJTE9OICogMTAwOyAvLyBVc2UgYSBzbWFsbCB0b2xlcmFuY2UgZmFjdG9yIGZvciBmbG9hdGluZy1wb2ludCBlcnJvcnNcblx0XHRjb25zdCBkZWx0YSA9IE1hdGguYWJzKE1hdGgucm91bmQodmFsdWUpIC0gdmFsdWUpO1xuXHRcdHJldHVybiAoZGVsdGEgPCAwLjAxICsgZXBzaWxvbik7XG5cdH1cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0U2Nyb2xsYWJsZUVsZW1lbnQgZXh0ZW5kcyBXaWRnZXQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29wdGlvbnM6IFNjcm9sbGFibGVFbGVtZW50UmVzb2x2ZWRPcHRpb25zO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX3Njcm9sbGFibGU6IFNjcm9sbGFibGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZlcnRpY2FsU2Nyb2xsYmFyOiBWZXJ0aWNhbFNjcm9sbGJhcjtcblx0cHJpdmF0ZSByZWFkb25seSBfaG9yaXpvbnRhbFNjcm9sbGJhcjogSG9yaXpvbnRhbFNjcm9sbGJhcjtcblx0cHJpdmF0ZSByZWFkb25seSBfZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbGVmdFNoYWRvd0RvbU5vZGU6IEZhc3REb21Ob2RlPEhUTUxFbGVtZW50PiB8IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RvcFNoYWRvd0RvbU5vZGU6IEZhc3REb21Ob2RlPEhUTUxFbGVtZW50PiB8IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RvcExlZnRTaGFkb3dEb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD4gfCBudWxsO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpc3Rlbk9uRG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSBfbW91c2VXaGVlbFRvRGlzcG9zZTogSURpc3Bvc2FibGVbXTtcblxuXHRwcml2YXRlIF9pc0RyYWdnaW5nOiBib29sZWFuO1xuXHRwcml2YXRlIF9tb3VzZUlzT3ZlcjogYm9vbGVhbjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9oaWRlVGltZW91dDogVGltZW91dFRpbWVyO1xuXHRwcml2YXRlIF9zaG91bGRSZW5kZXI6IGJvb2xlYW47XG5cblx0cHJpdmF0ZSBfcmV2ZWFsT25TY3JvbGw6IGJvb2xlYW47XG5cblx0cHJpdmF0ZSBfaW5lcnRpYWxUaW1lb3V0OiBUaW1lb3V0VGltZXIgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfaW5lcnRpYWxTcGVlZDogeyBYOiBudW1iZXI7IFk6IG51bWJlciB9ID0geyBYOiAwLCBZOiAwIH07XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25TY3JvbGwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxTY3JvbGxFdmVudD4oKSk7XG5cdHB1YmxpYyBnZXQgb25TY3JvbGwoKTogRXZlbnQ8U2Nyb2xsRXZlbnQ+IHsgcmV0dXJuIHRoaXMuX29uU2Nyb2xsLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsU2Nyb2xsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8U2Nyb2xsRXZlbnQ+KCkpO1xuXHRwdWJsaWMgZ2V0IG9uV2lsbFNjcm9sbCgpOiBFdmVudDxTY3JvbGxFdmVudD4geyByZXR1cm4gdGhpcy5fb25XaWxsU2Nyb2xsLmV2ZW50OyB9XG5cblx0cHVibGljIGdldCBvcHRpb25zKCk6IFJlYWRvbmx5PFNjcm9sbGFibGVFbGVtZW50UmVzb2x2ZWRPcHRpb25zPiB7XG5cdFx0cmV0dXJuIHRoaXMuX29wdGlvbnM7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY29uc3RydWN0b3IoZWxlbWVudDogSFRNTEVsZW1lbnQsIG9wdGlvbnM6IFNjcm9sbGFibGVFbGVtZW50Q3JlYXRpb25PcHRpb25zLCBzY3JvbGxhYmxlOiBTY3JvbGxhYmxlKSB7XG5cdFx0c3VwZXIoKTtcblx0XHRlbGVtZW50LnN0eWxlLm92ZXJmbG93ID0gJ2hpZGRlbic7XG5cdFx0dGhpcy5fb3B0aW9ucyA9IHJlc29sdmVPcHRpb25zKG9wdGlvbnMpO1xuXHRcdHRoaXMuX3Njcm9sbGFibGUgPSBzY3JvbGxhYmxlO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc2Nyb2xsYWJsZS5vblNjcm9sbCgoZSkgPT4ge1xuXHRcdFx0dGhpcy5fb25XaWxsU2Nyb2xsLmZpcmUoZSk7XG5cdFx0XHR0aGlzLl9vbkRpZFNjcm9sbChlKTtcblx0XHRcdHRoaXMuX29uU2Nyb2xsLmZpcmUoZSk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgc2Nyb2xsYmFySG9zdDogU2Nyb2xsYmFySG9zdCA9IHtcblx0XHRcdG9uTW91c2VXaGVlbDogKG1vdXNlV2hlZWxFdmVudDogU3RhbmRhcmRXaGVlbEV2ZW50KSA9PiB0aGlzLl9vbk1vdXNlV2hlZWwobW91c2VXaGVlbEV2ZW50KSxcblx0XHRcdG9uRHJhZ1N0YXJ0OiAoKSA9PiB0aGlzLl9vbkRyYWdTdGFydCgpLFxuXHRcdFx0b25EcmFnRW5kOiAoKSA9PiB0aGlzLl9vbkRyYWdFbmQoKSxcblx0XHR9O1xuXHRcdHRoaXMuX3ZlcnRpY2FsU2Nyb2xsYmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFZlcnRpY2FsU2Nyb2xsYmFyKHRoaXMuX3Njcm9sbGFibGUsIHRoaXMuX29wdGlvbnMsIHNjcm9sbGJhckhvc3QpKTtcblx0XHR0aGlzLl9ob3Jpem9udGFsU2Nyb2xsYmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEhvcml6b250YWxTY3JvbGxiYXIodGhpcy5fc2Nyb2xsYWJsZSwgdGhpcy5fb3B0aW9ucywgc2Nyb2xsYmFySG9zdCkpO1xuXG5cdFx0dGhpcy5fZG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NOYW1lID0gJ21vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgJyArIHRoaXMuX29wdGlvbnMuY2xhc3NOYW1lO1xuXHRcdHRoaXMuX2RvbU5vZGUuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3ByZXNlbnRhdGlvbicpO1xuXHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuXHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUub3ZlcmZsb3cgPSAnaGlkZGVuJztcblx0XHR0aGlzLl9kb21Ob2RlLmFwcGVuZENoaWxkKGVsZW1lbnQpO1xuXHRcdHRoaXMuX2RvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5faG9yaXpvbnRhbFNjcm9sbGJhci5kb21Ob2RlLmRvbU5vZGUpO1xuXHRcdHRoaXMuX2RvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fdmVydGljYWxTY3JvbGxiYXIuZG9tTm9kZS5kb21Ob2RlKTtcblxuXHRcdGlmICh0aGlzLl9vcHRpb25zLnVzZVNoYWRvd3MpIHtcblx0XHRcdHRoaXMuX2xlZnRTaGFkb3dEb21Ob2RlID0gY3JlYXRlRmFzdERvbU5vZGUoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JykpO1xuXHRcdFx0dGhpcy5fbGVmdFNoYWRvd0RvbU5vZGUuc2V0Q2xhc3NOYW1lKCdzaGFkb3cnKTtcblx0XHRcdHRoaXMuX2RvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fbGVmdFNoYWRvd0RvbU5vZGUuZG9tTm9kZSk7XG5cblx0XHRcdHRoaXMuX3RvcFNoYWRvd0RvbU5vZGUgPSBjcmVhdGVGYXN0RG9tTm9kZShkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSk7XG5cdFx0XHR0aGlzLl90b3BTaGFkb3dEb21Ob2RlLnNldENsYXNzTmFtZSgnc2hhZG93Jyk7XG5cdFx0XHR0aGlzLl9kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX3RvcFNoYWRvd0RvbU5vZGUuZG9tTm9kZSk7XG5cblx0XHRcdHRoaXMuX3RvcExlZnRTaGFkb3dEb21Ob2RlID0gY3JlYXRlRmFzdERvbU5vZGUoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JykpO1xuXHRcdFx0dGhpcy5fdG9wTGVmdFNoYWRvd0RvbU5vZGUuc2V0Q2xhc3NOYW1lKCdzaGFkb3cnKTtcblx0XHRcdHRoaXMuX2RvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fdG9wTGVmdFNoYWRvd0RvbU5vZGUuZG9tTm9kZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2xlZnRTaGFkb3dEb21Ob2RlID0gbnVsbDtcblx0XHRcdHRoaXMuX3RvcFNoYWRvd0RvbU5vZGUgPSBudWxsO1xuXHRcdFx0dGhpcy5fdG9wTGVmdFNoYWRvd0RvbU5vZGUgPSBudWxsO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xpc3Rlbk9uRG9tTm9kZSA9IHRoaXMuX29wdGlvbnMubGlzdGVuT25Eb21Ob2RlIHx8IHRoaXMuX2RvbU5vZGU7XG5cblx0XHR0aGlzLl9tb3VzZVdoZWVsVG9EaXNwb3NlID0gW107XG5cdFx0dGhpcy5fc2V0TGlzdGVuaW5nVG9Nb3VzZVdoZWVsKHRoaXMuX29wdGlvbnMuaGFuZGxlTW91c2VXaGVlbCk7XG5cblx0XHR0aGlzLm9ubW91c2VvdmVyKHRoaXMuX2xpc3Rlbk9uRG9tTm9kZSwgKGUpID0+IHRoaXMuX29uTW91c2VPdmVyKGUpKTtcblx0XHR0aGlzLm9ubW91c2VsZWF2ZSh0aGlzLl9saXN0ZW5PbkRvbU5vZGUsIChlKSA9PiB0aGlzLl9vbk1vdXNlTGVhdmUoZSkpO1xuXG5cdFx0dGhpcy5faGlkZVRpbWVvdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGltZW91dFRpbWVyKCkpO1xuXHRcdHRoaXMuX2lzRHJhZ2dpbmcgPSBmYWxzZTtcblx0XHR0aGlzLl9tb3VzZUlzT3ZlciA9IGZhbHNlO1xuXG5cdFx0dGhpcy5fc2hvdWxkUmVuZGVyID0gdHJ1ZTtcblxuXHRcdHRoaXMuX3JldmVhbE9uU2Nyb2xsID0gdHJ1ZTtcblxuXHRcdC8vIFN1YnNjcmliZSB0byBnbG9iYWwgZGVmYXVsdCBzaXplIGNoYW5nZXMsIGJ1dCBvbmx5IGZvciBheGVzIHdob3NlIHNpemVcblx0XHQvLyB3YXMgTk9UIGV4cGxpY2l0bHkgcHJvdmlkZWQuIEVsZW1lbnRzIHdpdGggZXhwbGljaXQgc2l6ZXMgKGVkaXRvcixcblx0XHQvLyBtZW51cywgcGVlaywgY2hhdCBpbnB1dCwgZXRjLikgdXNlIGEgZml4ZWQgc2l6ZSBhbmQgbXVzdCBub3QgYmUgdXBkYXRlZC5cblx0XHRjb25zdCBoU2l6ZUV4cGxpY2l0ID0gdHlwZW9mIG9wdGlvbnMuaG9yaXpvbnRhbFNjcm9sbGJhclNpemUgIT09ICd1bmRlZmluZWQnO1xuXHRcdGNvbnN0IHZTaXplRXhwbGljaXQgPSB0eXBlb2Ygb3B0aW9ucy52ZXJ0aWNhbFNjcm9sbGJhclNpemUgIT09ICd1bmRlZmluZWQnO1xuXHRcdGlmICghaFNpemVFeHBsaWNpdCB8fCAhdlNpemVFeHBsaWNpdCkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIob25EaWRDaGFuZ2VEZWZhdWx0U2Nyb2xsYmFyU2l6ZShuZXdTaXplID0+IHtcblx0XHRcdFx0dGhpcy51cGRhdGVPcHRpb25zKHtcblx0XHRcdFx0XHQuLi4oIWhTaXplRXhwbGljaXQgPyB7IGhvcml6b250YWxTY3JvbGxiYXJTaXplOiBuZXdTaXplIH0gOiB7fSksXG5cdFx0XHRcdFx0Li4uKCF2U2l6ZUV4cGxpY2l0ID8geyB2ZXJ0aWNhbFNjcm9sbGJhclNpemU6IG5ld1NpemUgfSA6IHt9KSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fbW91c2VXaGVlbFRvRGlzcG9zZSA9IGRpc3Bvc2UodGhpcy5fbW91c2VXaGVlbFRvRGlzcG9zZSk7XG5cdFx0aWYgKHRoaXMuX2luZXJ0aWFsVGltZW91dCkge1xuXHRcdFx0dGhpcy5faW5lcnRpYWxUaW1lb3V0LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2luZXJ0aWFsVGltZW91dCA9IG51bGw7XG5cdFx0fVxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIGdlbmVyYXRlZCAnc2Nyb2xsYWJsZScgZG9tIG5vZGVcblx0ICovXG5cdHB1YmxpYyBnZXREb21Ob2RlKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fZG9tTm9kZTtcblx0fVxuXG5cdHB1YmxpYyBnZXRPdmVydmlld1J1bGVyTGF5b3V0SW5mbygpOiBJT3ZlcnZpZXdSdWxlckxheW91dEluZm8ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwYXJlbnQ6IHRoaXMuX2RvbU5vZGUsXG5cdFx0XHRpbnNlcnRCZWZvcmU6IHRoaXMuX3ZlcnRpY2FsU2Nyb2xsYmFyLmRvbU5vZGUuZG9tTm9kZSxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIERlbGVnYXRlIGEgcG9pbnRlciBkb3duIGV2ZW50IHRvIHRoZSB2ZXJ0aWNhbCBzY3JvbGxiYXIuXG5cdCAqIFRoaXMgaXMgdG8gaGVscCB3aXRoIGNsaWNraW5nIHNvbWV3aGVyZSBlbHNlIGFuZCBoYXZpbmcgdGhlIHNjcm9sbGJhciByZWFjdC5cblx0ICovXG5cdHB1YmxpYyBkZWxlZ2F0ZVZlcnRpY2FsU2Nyb2xsYmFyUG9pbnRlckRvd24oYnJvd3NlckV2ZW50OiBQb2ludGVyRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLl92ZXJ0aWNhbFNjcm9sbGJhci5kZWxlZ2F0ZVBvaW50ZXJEb3duKGJyb3dzZXJFdmVudCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U2Nyb2xsRGltZW5zaW9ucygpOiBJU2Nyb2xsRGltZW5zaW9ucyB7XG5cdFx0cmV0dXJuIHRoaXMuX3Njcm9sbGFibGUuZ2V0U2Nyb2xsRGltZW5zaW9ucygpO1xuXHR9XG5cblx0cHVibGljIHNldFNjcm9sbERpbWVuc2lvbnMoZGltZW5zaW9uczogSU5ld1Njcm9sbERpbWVuc2lvbnMpOiB2b2lkIHtcblx0XHR0aGlzLl9zY3JvbGxhYmxlLnNldFNjcm9sbERpbWVuc2lvbnMoZGltZW5zaW9ucywgZmFsc2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZSB0aGUgY2xhc3MgbmFtZSBvZiB0aGUgc2Nyb2xsYWJsZSBlbGVtZW50LlxuXHQgKi9cblx0cHVibGljIHVwZGF0ZUNsYXNzTmFtZShuZXdDbGFzc05hbWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX29wdGlvbnMuY2xhc3NOYW1lID0gbmV3Q2xhc3NOYW1lO1xuXHRcdC8vIERlZmF1bHRzIGFyZSBkaWZmZXJlbnQgb24gTWFjc1xuXHRcdGlmIChwbGF0Zm9ybS5pc01hY2ludG9zaCkge1xuXHRcdFx0dGhpcy5fb3B0aW9ucy5jbGFzc05hbWUgKz0gJyBtYWMnO1xuXHRcdH1cblx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTmFtZSA9ICdtb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ICcgKyB0aGlzLl9vcHRpb25zLmNsYXNzTmFtZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGUgY29uZmlndXJhdGlvbiBvcHRpb25zIGZvciB0aGUgc2Nyb2xsYmFyLlxuXHQgKi9cblx0cHVibGljIHVwZGF0ZU9wdGlvbnMobmV3T3B0aW9uczogU2Nyb2xsYWJsZUVsZW1lbnRDaGFuZ2VPcHRpb25zKTogdm9pZCB7XG5cdFx0aWYgKHR5cGVvZiBuZXdPcHRpb25zLmhhbmRsZU1vdXNlV2hlZWwgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGlzLl9vcHRpb25zLmhhbmRsZU1vdXNlV2hlZWwgPSBuZXdPcHRpb25zLmhhbmRsZU1vdXNlV2hlZWw7XG5cdFx0XHR0aGlzLl9zZXRMaXN0ZW5pbmdUb01vdXNlV2hlZWwodGhpcy5fb3B0aW9ucy5oYW5kbGVNb3VzZVdoZWVsKTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBuZXdPcHRpb25zLm1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eSAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHRoaXMuX29wdGlvbnMubW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5ID0gbmV3T3B0aW9ucy5tb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHk7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgbmV3T3B0aW9ucy5mYXN0U2Nyb2xsU2Vuc2l0aXZpdHkgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGlzLl9vcHRpb25zLmZhc3RTY3JvbGxTZW5zaXRpdml0eSA9IG5ld09wdGlvbnMuZmFzdFNjcm9sbFNlbnNpdGl2aXR5O1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIG5ld09wdGlvbnMuc2Nyb2xsUHJlZG9taW5hbnRBeGlzICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0dGhpcy5fb3B0aW9ucy5zY3JvbGxQcmVkb21pbmFudEF4aXMgPSBuZXdPcHRpb25zLnNjcm9sbFByZWRvbWluYW50QXhpcztcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBuZXdPcHRpb25zLmhvcml6b250YWwgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGlzLl9vcHRpb25zLmhvcml6b250YWwgPSBuZXdPcHRpb25zLmhvcml6b250YWw7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgbmV3T3B0aW9ucy52ZXJ0aWNhbCAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHRoaXMuX29wdGlvbnMudmVydGljYWwgPSBuZXdPcHRpb25zLnZlcnRpY2FsO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIG5ld09wdGlvbnMuaG9yaXpvbnRhbFNjcm9sbGJhclNpemUgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGlzLl9vcHRpb25zLmhvcml6b250YWxTY3JvbGxiYXJTaXplID0gbmV3T3B0aW9ucy5ob3Jpem9udGFsU2Nyb2xsYmFyU2l6ZTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBuZXdPcHRpb25zLnZlcnRpY2FsU2Nyb2xsYmFyU2l6ZSAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHRoaXMuX29wdGlvbnMudmVydGljYWxTY3JvbGxiYXJTaXplID0gbmV3T3B0aW9ucy52ZXJ0aWNhbFNjcm9sbGJhclNpemU7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgbmV3T3B0aW9ucy5zY3JvbGxCeVBhZ2UgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGlzLl9vcHRpb25zLnNjcm9sbEJ5UGFnZSA9IG5ld09wdGlvbnMuc2Nyb2xsQnlQYWdlO1xuXHRcdH1cblx0XHR0aGlzLl9ob3Jpem9udGFsU2Nyb2xsYmFyLnVwZGF0ZU9wdGlvbnModGhpcy5fb3B0aW9ucyk7XG5cdFx0dGhpcy5fdmVydGljYWxTY3JvbGxiYXIudXBkYXRlT3B0aW9ucyh0aGlzLl9vcHRpb25zKTtcblxuXHRcdGlmICghdGhpcy5fb3B0aW9ucy5sYXp5UmVuZGVyKSB7XG5cdFx0XHR0aGlzLl9yZW5kZXIoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2V0UmV2ZWFsT25TY3JvbGwodmFsdWU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9yZXZlYWxPblNjcm9sbCA9IHZhbHVlO1xuXHR9XG5cblx0cHVibGljIGRlbGVnYXRlU2Nyb2xsRnJvbU1vdXNlV2hlZWxFdmVudChicm93c2VyRXZlbnQ6IElNb3VzZVdoZWVsRXZlbnQpIHtcblx0XHR0aGlzLl9vbk1vdXNlV2hlZWwobmV3IFN0YW5kYXJkV2hlZWxFdmVudChicm93c2VyRXZlbnQpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3BlcmlvZGljU3luYygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgc2NoZWR1bGVBZ2FpbiA9IGZhbHNlO1xuXG5cdFx0aWYgKHRoaXMuX2luZXJ0aWFsU3BlZWQuWCAhPT0gMCB8fCB0aGlzLl9pbmVydGlhbFNwZWVkLlkgIT09IDApIHtcblx0XHRcdHRoaXMuX3Njcm9sbGFibGUuc2V0U2Nyb2xsUG9zaXRpb25Ob3coe1xuXHRcdFx0XHRzY3JvbGxUb3A6IHRoaXMuX3Njcm9sbGFibGUuZ2V0Q3VycmVudFNjcm9sbFBvc2l0aW9uKCkuc2Nyb2xsVG9wIC0gdGhpcy5faW5lcnRpYWxTcGVlZC5ZICogMTAwLFxuXHRcdFx0XHRzY3JvbGxMZWZ0OiB0aGlzLl9zY3JvbGxhYmxlLmdldEN1cnJlbnRTY3JvbGxQb3NpdGlvbigpLnNjcm9sbExlZnQgLSB0aGlzLl9pbmVydGlhbFNwZWVkLlggKiAxMDBcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5faW5lcnRpYWxTcGVlZC5YICo9IDAuOTtcblx0XHRcdHRoaXMuX2luZXJ0aWFsU3BlZWQuWSAqPSAwLjk7XG5cdFx0XHRpZiAoTWF0aC5hYnModGhpcy5faW5lcnRpYWxTcGVlZC5YKSA8IDAuMDEpIHtcblx0XHRcdFx0dGhpcy5faW5lcnRpYWxTcGVlZC5YID0gMDtcblx0XHRcdH1cblx0XHRcdGlmIChNYXRoLmFicyh0aGlzLl9pbmVydGlhbFNwZWVkLlkpIDwgMC4wMSkge1xuXHRcdFx0XHR0aGlzLl9pbmVydGlhbFNwZWVkLlkgPSAwO1xuXHRcdFx0fVxuXG5cdFx0XHRzY2hlZHVsZUFnYWluID0gKHRoaXMuX2luZXJ0aWFsU3BlZWQuWCAhPT0gMCB8fCB0aGlzLl9pbmVydGlhbFNwZWVkLlkgIT09IDApO1xuXHRcdH1cblxuXHRcdGlmIChzY2hlZHVsZUFnYWluKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2luZXJ0aWFsVGltZW91dCkge1xuXHRcdFx0XHR0aGlzLl9pbmVydGlhbFRpbWVvdXQgPSBuZXcgVGltZW91dFRpbWVyKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9pbmVydGlhbFRpbWVvdXQuY2FuY2VsQW5kU2V0KCgpID0+IHRoaXMuX3BlcmlvZGljU3luYygpLCAxMDAwIC8gNjApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9pbmVydGlhbFRpbWVvdXQ/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2luZXJ0aWFsVGltZW91dCA9IG51bGw7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0gbW91c2Ugd2hlZWwgc2Nyb2xsaW5nIC0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBfc2V0TGlzdGVuaW5nVG9Nb3VzZVdoZWVsKHNob3VsZExpc3RlbjogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGlzTGlzdGVuaW5nID0gKHRoaXMuX21vdXNlV2hlZWxUb0Rpc3Bvc2UubGVuZ3RoID4gMCk7XG5cblx0XHRpZiAoaXNMaXN0ZW5pbmcgPT09IHNob3VsZExpc3Rlbikge1xuXHRcdFx0Ly8gTm8gY2hhbmdlXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU3RvcCBsaXN0ZW5pbmcgKGlmIG5lY2Vzc2FyeSlcblx0XHR0aGlzLl9tb3VzZVdoZWVsVG9EaXNwb3NlID0gZGlzcG9zZSh0aGlzLl9tb3VzZVdoZWVsVG9EaXNwb3NlKTtcblxuXHRcdC8vIFN0YXJ0IGxpc3RlbmluZyAoaWYgbmVjZXNzYXJ5KVxuXHRcdGlmIChzaG91bGRMaXN0ZW4pIHtcblx0XHRcdGNvbnN0IG9uTW91c2VXaGVlbCA9IChicm93c2VyRXZlbnQ6IElNb3VzZVdoZWVsRXZlbnQpID0+IHtcblx0XHRcdFx0dGhpcy5fb25Nb3VzZVdoZWVsKG5ldyBTdGFuZGFyZFdoZWVsRXZlbnQoYnJvd3NlckV2ZW50KSk7XG5cdFx0XHR9O1xuXG5cdFx0XHR0aGlzLl9tb3VzZVdoZWVsVG9EaXNwb3NlLnB1c2goZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9saXN0ZW5PbkRvbU5vZGUsIGRvbS5FdmVudFR5cGUuTU9VU0VfV0hFRUwsIG9uTW91c2VXaGVlbCwgeyBwYXNzaXZlOiBmYWxzZSB9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb25Nb3VzZVdoZWVsKGU6IFN0YW5kYXJkV2hlZWxFdmVudCk6IHZvaWQge1xuXHRcdGlmIChlLmJyb3dzZXJFdmVudD8uZGVmYXVsdFByZXZlbnRlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNsYXNzaWZpZXIgPSBNb3VzZVdoZWVsQ2xhc3NpZmllci5JTlNUQU5DRTtcblx0XHRpZiAoU0NST0xMX1dIRUVMX1NNT09USF9TQ1JPTExfRU5BQkxFRCkge1xuXHRcdFx0Y2xhc3NpZmllci5hY2NlcHRTdGFuZGFyZFdoZWVsRXZlbnQoZSk7XG5cdFx0fVxuXG5cdFx0Ly8gdXNlZnVsIGZvciBjcmVhdGluZyB1bml0IHRlc3RzOlxuXHRcdC8vIGNvbnNvbGUubG9nKGAke0RhdGUubm93KCl9LCAke2UuZGVsdGFZfSwgJHtlLmRlbHRhWH1gKTtcblxuXHRcdGxldCBkaWRTY3JvbGwgPSBmYWxzZTtcblxuXHRcdGlmIChlLmRlbHRhWSB8fCBlLmRlbHRhWCkge1xuXHRcdFx0bGV0IGRlbHRhWSA9IGUuZGVsdGFZICogdGhpcy5fb3B0aW9ucy5tb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHk7XG5cdFx0XHRsZXQgZGVsdGFYID0gZS5kZWx0YVggKiB0aGlzLl9vcHRpb25zLm1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eTtcblxuXHRcdFx0aWYgKHRoaXMuX29wdGlvbnMuc2Nyb2xsUHJlZG9taW5hbnRBeGlzKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9vcHRpb25zLnNjcm9sbFlUb1ggJiYgZGVsdGFYICsgZGVsdGFZID09PSAwKSB7XG5cdFx0XHRcdFx0Ly8gd2hlbiBjb25maWd1cmVkIHRvIG1hcCBZIHRvIFggYW5kIHdlIGJvdGggc2VlXG5cdFx0XHRcdFx0Ly8gbm8gZG9taW5hbnQgYXhpcyBhbmQgWCBhbmQgWSBhcmUgY29tcGV0aW5nIHdpdGhcblx0XHRcdFx0XHQvLyBpZGVudGljYWwgdmFsdWVzIGludG8gb3Bwb3NpdGUgZGlyZWN0aW9ucywgd2Vcblx0XHRcdFx0XHQvLyBpZ25vcmUgdGhlIGRlbHRhIGFzIHdlIGNhbm5vdCBtYWtlIGEgZGVjaXNpb24gdGhlblxuXHRcdFx0XHRcdGRlbHRhWCA9IGRlbHRhWSA9IDA7XG5cdFx0XHRcdH0gZWxzZSBpZiAoTWF0aC5hYnMoZGVsdGFZKSA+PSBNYXRoLmFicyhkZWx0YVgpKSB7XG5cdFx0XHRcdFx0ZGVsdGFYID0gMDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRkZWx0YVkgPSAwO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9vcHRpb25zLmZsaXBBeGVzKSB7XG5cdFx0XHRcdFtkZWx0YVksIGRlbHRhWF0gPSBbZGVsdGFYLCBkZWx0YVldO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDb252ZXJ0IHZlcnRpY2FsIHNjcm9sbGluZyB0byBob3Jpem9udGFsIGlmIHNoaWZ0IGlzIGhlbGQsIHRoaXNcblx0XHRcdC8vIGlzIGhhbmRsZWQgYXQgYSBoaWdoZXIgbGV2ZWwgb24gTWFjXG5cdFx0XHRjb25zdCBzaGlmdENvbnZlcnQgPSAhcGxhdGZvcm0uaXNNYWNpbnRvc2ggJiYgZS5icm93c2VyRXZlbnQgJiYgZS5icm93c2VyRXZlbnQuc2hpZnRLZXk7XG5cdFx0XHRpZiAoKHRoaXMuX29wdGlvbnMuc2Nyb2xsWVRvWCB8fCBzaGlmdENvbnZlcnQpICYmICFkZWx0YVgpIHtcblx0XHRcdFx0ZGVsdGFYID0gZGVsdGFZO1xuXHRcdFx0XHRkZWx0YVkgPSAwO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5icm93c2VyRXZlbnQgJiYgZS5icm93c2VyRXZlbnQuYWx0S2V5KSB7XG5cdFx0XHRcdC8vIGZhc3RTY3JvbGxpbmdcblx0XHRcdFx0ZGVsdGFYID0gZGVsdGFYICogdGhpcy5fb3B0aW9ucy5mYXN0U2Nyb2xsU2Vuc2l0aXZpdHk7XG5cdFx0XHRcdGRlbHRhWSA9IGRlbHRhWSAqIHRoaXMuX29wdGlvbnMuZmFzdFNjcm9sbFNlbnNpdGl2aXR5O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmdXR1cmVTY3JvbGxQb3NpdGlvbiA9IHRoaXMuX3Njcm9sbGFibGUuZ2V0RnV0dXJlU2Nyb2xsUG9zaXRpb24oKTtcblxuXHRcdFx0bGV0IGRlc2lyZWRTY3JvbGxQb3NpdGlvbjogSU5ld1Njcm9sbFBvc2l0aW9uID0ge307XG5cdFx0XHRpZiAoZGVsdGFZKSB7XG5cdFx0XHRcdGNvbnN0IGRlbHRhU2Nyb2xsVG9wID0gU0NST0xMX1dIRUVMX1NFTlNJVElWSVRZICogZGVsdGFZO1xuXHRcdFx0XHQvLyBIZXJlIHdlIGNvbnZlcnQgdmFsdWVzIHN1Y2ggYXMgLTAuMyB0byAtMSBvciAwLjMgdG8gMSwgb3RoZXJ3aXNlIGxvdyBzcGVlZCBzY3JvbGxpbmcgd2lsbCBuZXZlciBzY3JvbGxcblx0XHRcdFx0Y29uc3QgZGVzaXJlZFNjcm9sbFRvcCA9IGZ1dHVyZVNjcm9sbFBvc2l0aW9uLnNjcm9sbFRvcCAtIChkZWx0YVNjcm9sbFRvcCA8IDAgPyBNYXRoLmZsb29yKGRlbHRhU2Nyb2xsVG9wKSA6IE1hdGguY2VpbChkZWx0YVNjcm9sbFRvcCkpO1xuXHRcdFx0XHR0aGlzLl92ZXJ0aWNhbFNjcm9sbGJhci53cml0ZVNjcm9sbFBvc2l0aW9uKGRlc2lyZWRTY3JvbGxQb3NpdGlvbiwgZGVzaXJlZFNjcm9sbFRvcCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZGVsdGFYKSB7XG5cdFx0XHRcdGNvbnN0IGRlbHRhU2Nyb2xsTGVmdCA9IFNDUk9MTF9XSEVFTF9TRU5TSVRJVklUWSAqIGRlbHRhWDtcblx0XHRcdFx0Ly8gSGVyZSB3ZSBjb252ZXJ0IHZhbHVlcyBzdWNoIGFzIC0wLjMgdG8gLTEgb3IgMC4zIHRvIDEsIG90aGVyd2lzZSBsb3cgc3BlZWQgc2Nyb2xsaW5nIHdpbGwgbmV2ZXIgc2Nyb2xsXG5cdFx0XHRcdGNvbnN0IGRlc2lyZWRTY3JvbGxMZWZ0ID0gZnV0dXJlU2Nyb2xsUG9zaXRpb24uc2Nyb2xsTGVmdCAtIChkZWx0YVNjcm9sbExlZnQgPCAwID8gTWF0aC5mbG9vcihkZWx0YVNjcm9sbExlZnQpIDogTWF0aC5jZWlsKGRlbHRhU2Nyb2xsTGVmdCkpO1xuXHRcdFx0XHR0aGlzLl9ob3Jpem9udGFsU2Nyb2xsYmFyLndyaXRlU2Nyb2xsUG9zaXRpb24oZGVzaXJlZFNjcm9sbFBvc2l0aW9uLCBkZXNpcmVkU2Nyb2xsTGVmdCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENoZWNrIHRoYXQgd2UgYXJlIHNjcm9sbGluZyB0b3dhcmRzIGEgbG9jYXRpb24gd2hpY2ggaXMgdmFsaWRcblx0XHRcdGRlc2lyZWRTY3JvbGxQb3NpdGlvbiA9IHRoaXMuX3Njcm9sbGFibGUudmFsaWRhdGVTY3JvbGxQb3NpdGlvbihkZXNpcmVkU2Nyb2xsUG9zaXRpb24pO1xuXG5cdFx0XHRpZiAodGhpcy5fb3B0aW9ucy5pbmVydGlhbFNjcm9sbCAmJiAoZGVsdGFYIHx8IGRlbHRhWSkgJiYgIWNsYXNzaWZpZXIuaXNQaHlzaWNhbE1vdXNlV2hlZWwoKSkge1xuXHRcdFx0XHRsZXQgc3RhcnRQZXJpb2RpYyA9IGZhbHNlO1xuXHRcdFx0XHQvLyBPbmx5IHN0YXJ0IHBlcmlvZGljIGlmIGl0J3Mgbm90IHJ1bm5pbmdcblx0XHRcdFx0aWYgKHRoaXMuX2luZXJ0aWFsU3BlZWQuWCA9PT0gMCAmJiB0aGlzLl9pbmVydGlhbFNwZWVkLlkgPT09IDApIHtcblx0XHRcdFx0XHRzdGFydFBlcmlvZGljID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9pbmVydGlhbFNwZWVkLlkgPSAoZGVsdGFZIDwgMCA/IC0xIDogMSkgKiAoTWF0aC5hYnMoZGVsdGFZKSAqKiAxLjAyKTtcblx0XHRcdFx0dGhpcy5faW5lcnRpYWxTcGVlZC5YID0gKGRlbHRhWCA8IDAgPyAtMSA6IDEpICogKE1hdGguYWJzKGRlbHRhWCkgKiogMS4wMik7XG5cdFx0XHRcdGlmIChzdGFydFBlcmlvZGljKSB7XG5cdFx0XHRcdFx0dGhpcy5fcGVyaW9kaWNTeW5jKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGZ1dHVyZVNjcm9sbFBvc2l0aW9uLnNjcm9sbExlZnQgIT09IGRlc2lyZWRTY3JvbGxQb3NpdGlvbi5zY3JvbGxMZWZ0IHx8IGZ1dHVyZVNjcm9sbFBvc2l0aW9uLnNjcm9sbFRvcCAhPT0gZGVzaXJlZFNjcm9sbFBvc2l0aW9uLnNjcm9sbFRvcCkge1xuXG5cdFx0XHRcdGNvbnN0IGNhblBlcmZvcm1TbW9vdGhTY3JvbGwgPSAoXG5cdFx0XHRcdFx0U0NST0xMX1dIRUVMX1NNT09USF9TQ1JPTExfRU5BQkxFRFxuXHRcdFx0XHRcdCYmIHRoaXMuX29wdGlvbnMubW91c2VXaGVlbFNtb290aFNjcm9sbFxuXHRcdFx0XHRcdCYmIGNsYXNzaWZpZXIuaXNQaHlzaWNhbE1vdXNlV2hlZWwoKVxuXHRcdFx0XHQpO1xuXG5cdFx0XHRcdGlmIChjYW5QZXJmb3JtU21vb3RoU2Nyb2xsKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2Nyb2xsYWJsZS5zZXRTY3JvbGxQb3NpdGlvblNtb290aChkZXNpcmVkU2Nyb2xsUG9zaXRpb24pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX3Njcm9sbGFibGUuc2V0U2Nyb2xsUG9zaXRpb25Ob3coZGVzaXJlZFNjcm9sbFBvc2l0aW9uKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGRpZFNjcm9sbCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IGNvbnN1bWVNb3VzZVdoZWVsID0gZGlkU2Nyb2xsO1xuXHRcdGlmICghY29uc3VtZU1vdXNlV2hlZWwgJiYgdGhpcy5fb3B0aW9ucy5hbHdheXNDb25zdW1lTW91c2VXaGVlbCkge1xuXHRcdFx0Y29uc3VtZU1vdXNlV2hlZWwgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAoIWNvbnN1bWVNb3VzZVdoZWVsICYmIHRoaXMuX29wdGlvbnMuY29uc3VtZU1vdXNlV2hlZWxJZlNjcm9sbGJhcklzTmVlZGVkICYmICh0aGlzLl92ZXJ0aWNhbFNjcm9sbGJhci5pc05lZWRlZCgpIHx8IHRoaXMuX2hvcml6b250YWxTY3JvbGxiYXIuaXNOZWVkZWQoKSkpIHtcblx0XHRcdGNvbnN1bWVNb3VzZVdoZWVsID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoY29uc3VtZU1vdXNlV2hlZWwpIHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb25EaWRTY3JvbGwoZTogU2Nyb2xsRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9zaG91bGRSZW5kZXIgPSB0aGlzLl9ob3Jpem9udGFsU2Nyb2xsYmFyLm9uRGlkU2Nyb2xsKGUpIHx8IHRoaXMuX3Nob3VsZFJlbmRlcjtcblx0XHR0aGlzLl9zaG91bGRSZW5kZXIgPSB0aGlzLl92ZXJ0aWNhbFNjcm9sbGJhci5vbkRpZFNjcm9sbChlKSB8fCB0aGlzLl9zaG91bGRSZW5kZXI7XG5cblx0XHRpZiAodGhpcy5fb3B0aW9ucy51c2VTaGFkb3dzKSB7XG5cdFx0XHR0aGlzLl9zaG91bGRSZW5kZXIgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9yZXZlYWxPblNjcm9sbCkge1xuXHRcdFx0dGhpcy5fcmV2ZWFsKCk7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9vcHRpb25zLmxhenlSZW5kZXIpIHtcblx0XHRcdHRoaXMuX3JlbmRlcigpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZW5kZXIgLyBtdXRhdGUgdGhlIERPTSBub3cuXG5cdCAqIFNob3VsZCBiZSB1c2VkIHRvZ2V0aGVyIHdpdGggdGhlIGN0b3Igb3B0aW9uIGBsYXp5UmVuZGVyYC5cblx0ICovXG5cdHB1YmxpYyByZW5kZXJOb3coKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9vcHRpb25zLmxhenlSZW5kZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignUGxlYXNlIHVzZSBgbGF6eVJlbmRlcmAgdG9nZXRoZXIgd2l0aCBgcmVuZGVyTm93YCEnKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZW5kZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3Nob3VsZFJlbmRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Nob3VsZFJlbmRlciA9IGZhbHNlO1xuXG5cdFx0dGhpcy5faG9yaXpvbnRhbFNjcm9sbGJhci5yZW5kZXIoKTtcblx0XHR0aGlzLl92ZXJ0aWNhbFNjcm9sbGJhci5yZW5kZXIoKTtcblxuXHRcdGlmICh0aGlzLl9vcHRpb25zLnVzZVNoYWRvd3MpIHtcblx0XHRcdGNvbnN0IHNjcm9sbFN0YXRlID0gdGhpcy5fc2Nyb2xsYWJsZS5nZXRDdXJyZW50U2Nyb2xsUG9zaXRpb24oKTtcblx0XHRcdGNvbnN0IGVuYWJsZVRvcCA9IHNjcm9sbFN0YXRlLnNjcm9sbFRvcCA+IDA7XG5cdFx0XHRjb25zdCBlbmFibGVMZWZ0ID0gc2Nyb2xsU3RhdGUuc2Nyb2xsTGVmdCA+IDA7XG5cblx0XHRcdGNvbnN0IGxlZnRDbGFzc05hbWUgPSAoZW5hYmxlTGVmdCA/ICcgbGVmdCcgOiAnJyk7XG5cdFx0XHRjb25zdCB0b3BDbGFzc05hbWUgPSAoZW5hYmxlVG9wID8gJyB0b3AnIDogJycpO1xuXHRcdFx0Y29uc3QgdG9wTGVmdENsYXNzTmFtZSA9IChlbmFibGVMZWZ0IHx8IGVuYWJsZVRvcCA/ICcgdG9wLWxlZnQtY29ybmVyJyA6ICcnKTtcblx0XHRcdHRoaXMuX2xlZnRTaGFkb3dEb21Ob2RlIS5zZXRDbGFzc05hbWUoYHNoYWRvdyR7bGVmdENsYXNzTmFtZX1gKTtcblx0XHRcdHRoaXMuX3RvcFNoYWRvd0RvbU5vZGUhLnNldENsYXNzTmFtZShgc2hhZG93JHt0b3BDbGFzc05hbWV9YCk7XG5cdFx0XHR0aGlzLl90b3BMZWZ0U2hhZG93RG9tTm9kZSEuc2V0Q2xhc3NOYW1lKGBzaGFkb3cke3RvcExlZnRDbGFzc05hbWV9JHt0b3BDbGFzc05hbWV9JHtsZWZ0Q2xhc3NOYW1lfWApO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tIGZhZGUgaW4gLyBmYWRlIG91dCAtLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgX29uRHJhZ1N0YXJ0KCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzRHJhZ2dpbmcgPSB0cnVlO1xuXHRcdHRoaXMuX3JldmVhbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25EcmFnRW5kKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzRHJhZ2dpbmcgPSBmYWxzZTtcblx0XHR0aGlzLl9oaWRlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9vbk1vdXNlTGVhdmUoZTogSU1vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9tb3VzZUlzT3ZlciA9IGZhbHNlO1xuXHRcdHRoaXMuX2hpZGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX29uTW91c2VPdmVyKGU6IElNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fbW91c2VJc092ZXIgPSB0cnVlO1xuXHRcdHRoaXMuX3JldmVhbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmV2ZWFsKCk6IHZvaWQge1xuXHRcdHRoaXMuX3ZlcnRpY2FsU2Nyb2xsYmFyLmJlZ2luUmV2ZWFsKCk7XG5cdFx0dGhpcy5faG9yaXpvbnRhbFNjcm9sbGJhci5iZWdpblJldmVhbCgpO1xuXHRcdHRoaXMuX3NjaGVkdWxlSGlkZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGlkZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX21vdXNlSXNPdmVyICYmICF0aGlzLl9pc0RyYWdnaW5nKSB7XG5cdFx0XHR0aGlzLl92ZXJ0aWNhbFNjcm9sbGJhci5iZWdpbkhpZGUoKTtcblx0XHRcdHRoaXMuX2hvcml6b250YWxTY3JvbGxiYXIuYmVnaW5IaWRlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2NoZWR1bGVIaWRlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fbW91c2VJc092ZXIgJiYgIXRoaXMuX2lzRHJhZ2dpbmcpIHtcblx0XHRcdHRoaXMuX2hpZGVUaW1lb3V0LmNhbmNlbEFuZFNldCgoKSA9PiB0aGlzLl9oaWRlKCksIEhJREVfVElNRU9VVCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTY3JvbGxhYmxlRWxlbWVudCBleHRlbmRzIEFic3RyYWN0U2Nyb2xsYWJsZUVsZW1lbnQge1xuXG5cdGNvbnN0cnVjdG9yKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBvcHRpb25zOiBTY3JvbGxhYmxlRWxlbWVudENyZWF0aW9uT3B0aW9ucykge1xuXHRcdG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXHRcdG9wdGlvbnMubW91c2VXaGVlbFNtb290aFNjcm9sbCA9IGZhbHNlO1xuXHRcdGNvbnN0IHNjcm9sbGFibGUgPSBuZXcgU2Nyb2xsYWJsZSh7XG5cdFx0XHRmb3JjZUludGVnZXJWYWx1ZXM6IHRydWUsXG5cdFx0XHRzbW9vdGhTY3JvbGxEdXJhdGlvbjogMCxcblx0XHRcdHNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWU6IChjYWxsYmFjaykgPT4gZG9tLnNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZG9tLmdldFdpbmRvdyhlbGVtZW50KSwgY2FsbGJhY2spXG5cdFx0fSk7XG5cdFx0c3VwZXIoZWxlbWVudCwgb3B0aW9ucywgc2Nyb2xsYWJsZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2Nyb2xsYWJsZSk7XG5cdH1cblxuXHRwdWJsaWMgc2V0U2Nyb2xsUG9zaXRpb24odXBkYXRlOiBJTmV3U2Nyb2xsUG9zaXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9zY3JvbGxhYmxlLnNldFNjcm9sbFBvc2l0aW9uTm93KHVwZGF0ZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U2Nyb2xsUG9zaXRpb24oKTogSVNjcm9sbFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5fc2Nyb2xsYWJsZS5nZXRDdXJyZW50U2Nyb2xsUG9zaXRpb24oKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU21vb3RoU2Nyb2xsYWJsZUVsZW1lbnQgZXh0ZW5kcyBBYnN0cmFjdFNjcm9sbGFibGVFbGVtZW50IHtcblxuXHRjb25zdHJ1Y3RvcihlbGVtZW50OiBIVE1MRWxlbWVudCwgb3B0aW9uczogU2Nyb2xsYWJsZUVsZW1lbnRDcmVhdGlvbk9wdGlvbnMsIHNjcm9sbGFibGU6IFNjcm9sbGFibGUpIHtcblx0XHRzdXBlcihlbGVtZW50LCBvcHRpb25zLCBzY3JvbGxhYmxlKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRTY3JvbGxQb3NpdGlvbih1cGRhdGU6IElOZXdTY3JvbGxQb3NpdGlvbiAmIHsgcmV1c2VBbmltYXRpb24/OiBib29sZWFuIH0pOiB2b2lkIHtcblx0XHRpZiAodXBkYXRlLnJldXNlQW5pbWF0aW9uKSB7XG5cdFx0XHR0aGlzLl9zY3JvbGxhYmxlLnNldFNjcm9sbFBvc2l0aW9uU21vb3RoKHVwZGF0ZSwgdXBkYXRlLnJldXNlQW5pbWF0aW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc2Nyb2xsYWJsZS5zZXRTY3JvbGxQb3NpdGlvbk5vdyh1cGRhdGUpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRTY3JvbGxQb3NpdGlvbigpOiBJU2Nyb2xsUG9zaXRpb24ge1xuXHRcdHJldHVybiB0aGlzLl9zY3JvbGxhYmxlLmdldEN1cnJlbnRTY3JvbGxQb3NpdGlvbigpO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIERvbVNjcm9sbGFibGVFbGVtZW50IGV4dGVuZHMgQWJzdHJhY3RTY3JvbGxhYmxlRWxlbWVudCB7XG5cblx0cHJpdmF0ZSBfZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoZWxlbWVudDogSFRNTEVsZW1lbnQsIG9wdGlvbnM6IFNjcm9sbGFibGVFbGVtZW50Q3JlYXRpb25PcHRpb25zKSB7XG5cdFx0b3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cdFx0b3B0aW9ucy5tb3VzZVdoZWVsU21vb3RoU2Nyb2xsID0gZmFsc2U7XG5cdFx0Y29uc3Qgc2Nyb2xsYWJsZSA9IG5ldyBTY3JvbGxhYmxlKHtcblx0XHRcdGZvcmNlSW50ZWdlclZhbHVlczogZmFsc2UsIC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTM5ODc3XG5cdFx0XHRzbW9vdGhTY3JvbGxEdXJhdGlvbjogMCxcblx0XHRcdHNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWU6IChjYWxsYmFjaykgPT4gZG9tLnNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZG9tLmdldFdpbmRvdyhlbGVtZW50KSwgY2FsbGJhY2spXG5cdFx0fSk7XG5cdFx0c3VwZXIoZWxlbWVudCwgb3B0aW9ucywgc2Nyb2xsYWJsZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2Nyb2xsYWJsZSk7XG5cdFx0dGhpcy5fZWxlbWVudCA9IGVsZW1lbnQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vblNjcm9sbCgoZSkgPT4ge1xuXHRcdFx0aWYgKGUuc2Nyb2xsVG9wQ2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLl9lbGVtZW50LnNjcm9sbFRvcCA9IGUuc2Nyb2xsVG9wO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuc2Nyb2xsTGVmdENoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy5fZWxlbWVudC5zY3JvbGxMZWZ0ID0gZS5zY3JvbGxMZWZ0O1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLnNjYW5Eb21Ob2RlKCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0U2Nyb2xsUG9zaXRpb24odXBkYXRlOiBJTmV3U2Nyb2xsUG9zaXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9zY3JvbGxhYmxlLnNldFNjcm9sbFBvc2l0aW9uTm93KHVwZGF0ZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U2Nyb2xsUG9zaXRpb24oKTogSVNjcm9sbFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5fc2Nyb2xsYWJsZS5nZXRDdXJyZW50U2Nyb2xsUG9zaXRpb24oKTtcblx0fVxuXG5cdHB1YmxpYyBzY2FuRG9tTm9kZSgpOiB2b2lkIHtcblx0XHQvLyB3aWR0aCwgc2Nyb2xsTGVmdCwgc2Nyb2xsV2lkdGgsIGhlaWdodCwgc2Nyb2xsVG9wLCBzY3JvbGxIZWlnaHRcblx0XHR0aGlzLnNldFNjcm9sbERpbWVuc2lvbnMoe1xuXHRcdFx0d2lkdGg6IHRoaXMuX2VsZW1lbnQuY2xpZW50V2lkdGgsXG5cdFx0XHRzY3JvbGxXaWR0aDogdGhpcy5fZWxlbWVudC5zY3JvbGxXaWR0aCxcblx0XHRcdGhlaWdodDogdGhpcy5fZWxlbWVudC5jbGllbnRIZWlnaHQsXG5cdFx0XHRzY3JvbGxIZWlnaHQ6IHRoaXMuX2VsZW1lbnQuc2Nyb2xsSGVpZ2h0XG5cdFx0fSk7XG5cdFx0dGhpcy5zZXRTY3JvbGxQb3NpdGlvbih7XG5cdFx0XHRzY3JvbGxMZWZ0OiB0aGlzLl9lbGVtZW50LnNjcm9sbExlZnQsXG5cdFx0XHRzY3JvbGxUb3A6IHRoaXMuX2VsZW1lbnQuc2Nyb2xsVG9wLFxuXHRcdH0pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVPcHRpb25zKG9wdHM6IFNjcm9sbGFibGVFbGVtZW50Q3JlYXRpb25PcHRpb25zKTogU2Nyb2xsYWJsZUVsZW1lbnRSZXNvbHZlZE9wdGlvbnMge1xuXHRjb25zdCByZXN1bHQ6IFNjcm9sbGFibGVFbGVtZW50UmVzb2x2ZWRPcHRpb25zID0ge1xuXHRcdGxhenlSZW5kZXI6ICh0eXBlb2Ygb3B0cy5sYXp5UmVuZGVyICE9PSAndW5kZWZpbmVkJyA/IG9wdHMubGF6eVJlbmRlciA6IGZhbHNlKSxcblx0XHRjbGFzc05hbWU6ICh0eXBlb2Ygb3B0cy5jbGFzc05hbWUgIT09ICd1bmRlZmluZWQnID8gb3B0cy5jbGFzc05hbWUgOiAnJyksXG5cdFx0dXNlU2hhZG93czogKHR5cGVvZiBvcHRzLnVzZVNoYWRvd3MgIT09ICd1bmRlZmluZWQnID8gb3B0cy51c2VTaGFkb3dzIDogdHJ1ZSksXG5cdFx0aGFuZGxlTW91c2VXaGVlbDogKHR5cGVvZiBvcHRzLmhhbmRsZU1vdXNlV2hlZWwgIT09ICd1bmRlZmluZWQnID8gb3B0cy5oYW5kbGVNb3VzZVdoZWVsIDogdHJ1ZSksXG5cdFx0ZmxpcEF4ZXM6ICh0eXBlb2Ygb3B0cy5mbGlwQXhlcyAhPT0gJ3VuZGVmaW5lZCcgPyBvcHRzLmZsaXBBeGVzIDogZmFsc2UpLFxuXHRcdGNvbnN1bWVNb3VzZVdoZWVsSWZTY3JvbGxiYXJJc05lZWRlZDogKHR5cGVvZiBvcHRzLmNvbnN1bWVNb3VzZVdoZWVsSWZTY3JvbGxiYXJJc05lZWRlZCAhPT0gJ3VuZGVmaW5lZCcgPyBvcHRzLmNvbnN1bWVNb3VzZVdoZWVsSWZTY3JvbGxiYXJJc05lZWRlZCA6IGZhbHNlKSxcblx0XHRhbHdheXNDb25zdW1lTW91c2VXaGVlbDogKHR5cGVvZiBvcHRzLmFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsICE9PSAndW5kZWZpbmVkJyA/IG9wdHMuYWx3YXlzQ29uc3VtZU1vdXNlV2hlZWwgOiBmYWxzZSksXG5cdFx0c2Nyb2xsWVRvWDogKHR5cGVvZiBvcHRzLnNjcm9sbFlUb1ggIT09ICd1bmRlZmluZWQnID8gb3B0cy5zY3JvbGxZVG9YIDogZmFsc2UpLFxuXHRcdG1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eTogKHR5cGVvZiBvcHRzLm1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eSAhPT0gJ3VuZGVmaW5lZCcgPyBvcHRzLm1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eSA6IDEpLFxuXHRcdGZhc3RTY3JvbGxTZW5zaXRpdml0eTogKHR5cGVvZiBvcHRzLmZhc3RTY3JvbGxTZW5zaXRpdml0eSAhPT0gJ3VuZGVmaW5lZCcgPyBvcHRzLmZhc3RTY3JvbGxTZW5zaXRpdml0eSA6IDUpLFxuXHRcdHNjcm9sbFByZWRvbWluYW50QXhpczogKHR5cGVvZiBvcHRzLnNjcm9sbFByZWRvbWluYW50QXhpcyAhPT0gJ3VuZGVmaW5lZCcgPyBvcHRzLnNjcm9sbFByZWRvbWluYW50QXhpcyA6IHRydWUpLFxuXHRcdG1vdXNlV2hlZWxTbW9vdGhTY3JvbGw6ICh0eXBlb2Ygb3B0cy5tb3VzZVdoZWVsU21vb3RoU2Nyb2xsICE9PSAndW5kZWZpbmVkJyA/IG9wdHMubW91c2VXaGVlbFNtb290aFNjcm9sbCA6IHRydWUpLFxuXHRcdGluZXJ0aWFsU2Nyb2xsOiAodHlwZW9mIG9wdHMuaW5lcnRpYWxTY3JvbGwgIT09ICd1bmRlZmluZWQnID8gb3B0cy5pbmVydGlhbFNjcm9sbCA6IGZhbHNlKSxcblx0XHRhcnJvd1NpemU6ICh0eXBlb2Ygb3B0cy5hcnJvd1NpemUgIT09ICd1bmRlZmluZWQnID8gb3B0cy5hcnJvd1NpemUgOiAxMSksXG5cblx0XHRsaXN0ZW5PbkRvbU5vZGU6ICh0eXBlb2Ygb3B0cy5saXN0ZW5PbkRvbU5vZGUgIT09ICd1bmRlZmluZWQnID8gb3B0cy5saXN0ZW5PbkRvbU5vZGUgOiBudWxsKSxcblxuXHRcdGhvcml6b250YWw6ICh0eXBlb2Ygb3B0cy5ob3Jpem9udGFsICE9PSAndW5kZWZpbmVkJyA/IG9wdHMuaG9yaXpvbnRhbCA6IFNjcm9sbGJhclZpc2liaWxpdHkuQXV0byksXG5cdFx0aG9yaXpvbnRhbFNjcm9sbGJhclNpemU6ICh0eXBlb2Ygb3B0cy5ob3Jpem9udGFsU2Nyb2xsYmFyU2l6ZSAhPT0gJ3VuZGVmaW5lZCcgPyBvcHRzLmhvcml6b250YWxTY3JvbGxiYXJTaXplIDogZ2xvYmFsRGVmYXVsdFNjcm9sbGJhclNpemUpLFxuXHRcdGhvcml6b250YWxTbGlkZXJTaXplOiAodHlwZW9mIG9wdHMuaG9yaXpvbnRhbFNsaWRlclNpemUgIT09ICd1bmRlZmluZWQnID8gb3B0cy5ob3Jpem9udGFsU2xpZGVyU2l6ZSA6IDApLFxuXHRcdGhvcml6b250YWxIYXNBcnJvd3M6ICh0eXBlb2Ygb3B0cy5ob3Jpem9udGFsSGFzQXJyb3dzICE9PSAndW5kZWZpbmVkJyA/IG9wdHMuaG9yaXpvbnRhbEhhc0Fycm93cyA6IGZhbHNlKSxcblxuXHRcdHZlcnRpY2FsOiAodHlwZW9mIG9wdHMudmVydGljYWwgIT09ICd1bmRlZmluZWQnID8gb3B0cy52ZXJ0aWNhbCA6IFNjcm9sbGJhclZpc2liaWxpdHkuQXV0byksXG5cdFx0dmVydGljYWxTY3JvbGxiYXJTaXplOiAodHlwZW9mIG9wdHMudmVydGljYWxTY3JvbGxiYXJTaXplICE9PSAndW5kZWZpbmVkJyA/IG9wdHMudmVydGljYWxTY3JvbGxiYXJTaXplIDogZ2xvYmFsRGVmYXVsdFNjcm9sbGJhclNpemUpLFxuXHRcdHZlcnRpY2FsSGFzQXJyb3dzOiAodHlwZW9mIG9wdHMudmVydGljYWxIYXNBcnJvd3MgIT09ICd1bmRlZmluZWQnID8gb3B0cy52ZXJ0aWNhbEhhc0Fycm93cyA6IGZhbHNlKSxcblx0XHR2ZXJ0aWNhbFNsaWRlclNpemU6ICh0eXBlb2Ygb3B0cy52ZXJ0aWNhbFNsaWRlclNpemUgIT09ICd1bmRlZmluZWQnID8gb3B0cy52ZXJ0aWNhbFNsaWRlclNpemUgOiAwKSxcblxuXHRcdHNjcm9sbEJ5UGFnZTogKHR5cGVvZiBvcHRzLnNjcm9sbEJ5UGFnZSAhPT0gJ3VuZGVmaW5lZCcgPyBvcHRzLnNjcm9sbEJ5UGFnZSA6IGZhbHNlKVxuXHR9O1xuXG5cdHJlc3VsdC5ob3Jpem9udGFsU2xpZGVyU2l6ZSA9ICh0eXBlb2Ygb3B0cy5ob3Jpem9udGFsU2xpZGVyU2l6ZSAhPT0gJ3VuZGVmaW5lZCcgPyBvcHRzLmhvcml6b250YWxTbGlkZXJTaXplIDogcmVzdWx0Lmhvcml6b250YWxTY3JvbGxiYXJTaXplKTtcblx0cmVzdWx0LnZlcnRpY2FsU2xpZGVyU2l6ZSA9ICh0eXBlb2Ygb3B0cy52ZXJ0aWNhbFNsaWRlclNpemUgIT09ICd1bmRlZmluZWQnID8gb3B0cy52ZXJ0aWNhbFNsaWRlclNpemUgOiByZXN1bHQudmVydGljYWxTY3JvbGxiYXJTaXplKTtcblxuXHQvLyBEZWZhdWx0cyBhcmUgZGlmZmVyZW50IG9uIE1hY3Ncblx0aWYgKHBsYXRmb3JtLmlzTWFjaW50b3NoKSB7XG5cdFx0cmVzdWx0LmNsYXNzTmFtZSArPSAnIG1hYyc7XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxlQUFlLGdCQUFnQjtBQUN4QyxZQUFZLFNBQVM7QUFDckIsU0FBc0IseUJBQXlCO0FBQy9DLFNBQXdDLDBCQUEwQjtBQUVsRSxTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxlQUFzQjtBQUMvQixTQUFzQixlQUFlO0FBQ3JDLFlBQVksY0FBYztBQUMxQixTQUFvRyxZQUFZLDJCQUEyQjtBQUMzSSxPQUFPO0FBRVAsTUFBTSxlQUFlO0FBQ3JCLE1BQU0sMkJBQTJCO0FBQ2pDLE1BQU0scUNBQXFDO0FBR3BDLE1BQU0seUJBQXlCO0FBQ3RDLElBQUksNkJBQTZCO0FBQ2pDLE1BQU0sMENBQTBDLElBQUksUUFBZ0I7QUFDN0QsTUFBTSxrQ0FBaUQsd0NBQXdDO0FBTy9GLFNBQVMsOEJBQThCLE1BQW9CO0FBQ2pFLE1BQUksU0FBUyw0QkFBNEI7QUFDeEMsaUNBQTZCO0FBQzdCLDRDQUF3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
