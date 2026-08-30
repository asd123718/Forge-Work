import * as browser from "./browser.js";
import { BrowserFeatures } from "./canIUse.js";
import { hasModifierKeys, StandardKeyboardEvent } from "./keyboardEvent.js";
import { StandardMouseEvent } from "./mouseEvent.js";
import { AbstractIdleValue, IntervalTimer, TimeoutTimer, _runWhenIdle } from "../common/async.js";
import { BugIndicatingError, onUnexpectedError } from "../common/errors.js";
import * as event from "../common/event.js";
import { KeyCode } from "../common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../common/lifecycle.js";
import { RemoteAuthorities } from "../common/network.js";
import * as platform from "../common/platform.js";
import { URI } from "../common/uri.js";
import { hash } from "../common/hash.js";
import { ensureCodeWindow, mainWindow } from "./window.js";
import { isPointWithinTriangle } from "../common/numbers.js";
import { derived, derivedOpts, observableValue, isObservable } from "../common/observable.js";
const {
  registerWindow,
  getWindow,
  getDocument,
  getWindows,
  getWindowsCount,
  getWindowId,
  getWindowById,
  hasWindow,
  onDidRegisterWindow,
  onWillUnregisterWindow,
  onDidUnregisterWindow
} = (function() {
  const windows = /* @__PURE__ */ new Map();
  ensureCodeWindow(mainWindow, 1);
  const mainWindowRegistration = { window: mainWindow, disposables: new DisposableStore() };
  windows.set(mainWindow.vscodeWindowId, mainWindowRegistration);
  const onDidRegisterWindow2 = new event.Emitter();
  const onDidUnregisterWindow2 = new event.Emitter();
  const onWillUnregisterWindow2 = new event.Emitter();
  function getWindowById2(windowId, fallbackToMain) {
    const window = typeof windowId === "number" ? windows.get(windowId) : void 0;
    return window ?? (fallbackToMain ? mainWindowRegistration : void 0);
  }
  return {
    onDidRegisterWindow: onDidRegisterWindow2.event,
    onWillUnregisterWindow: onWillUnregisterWindow2.event,
    onDidUnregisterWindow: onDidUnregisterWindow2.event,
    registerWindow(window) {
      if (windows.has(window.vscodeWindowId)) {
        return Disposable.None;
      }
      const disposables = new DisposableStore();
      const registeredWindow = {
        window,
        disposables: disposables.add(new DisposableStore())
      };
      windows.set(window.vscodeWindowId, registeredWindow);
      disposables.add(toDisposable(() => {
        windows.delete(window.vscodeWindowId);
        onDidUnregisterWindow2.fire(window);
      }));
      disposables.add(addDisposableListener(window, EventType.BEFORE_UNLOAD, () => {
        onWillUnregisterWindow2.fire(window);
      }));
      onDidRegisterWindow2.fire(registeredWindow);
      return disposables;
    },
    getWindows() {
      return windows.values();
    },
    getWindowsCount() {
      return windows.size;
    },
    getWindowId(targetWindow) {
      return targetWindow.vscodeWindowId;
    },
    hasWindow(windowId) {
      return windows.has(windowId);
    },
    getWindowById: getWindowById2,
    getWindow(e) {
      const candidateNode = e;
      if (candidateNode?.ownerDocument?.defaultView) {
        return candidateNode.ownerDocument.defaultView.window;
      }
      const candidateEvent = e;
      if (candidateEvent?.view) {
        return candidateEvent.view.window;
      }
      return mainWindow;
    },
    getDocument(e) {
      const candidateNode = e;
      return getWindow(candidateNode).document;
    }
  };
})();
const externalFocusCheckers = /* @__PURE__ */ new Set();
function registerExternalFocusChecker(checker) {
  externalFocusCheckers.add(checker);
  return toDisposable(() => {
    externalFocusCheckers.delete(checker);
  });
}
function hasExternalFocus() {
  for (const checker of externalFocusCheckers) {
    if (checker().hasFocus) {
      return true;
    }
  }
  return false;
}
function getExternalFocusWindow() {
  for (const checker of externalFocusCheckers) {
    const info = checker();
    if (info.hasFocus && info.window) {
      return info.window;
    }
  }
  return void 0;
}
function hasAppFocus() {
  for (const { window } of getWindows()) {
    if (window.document.hasFocus()) {
      return true;
    }
  }
  if (hasExternalFocus()) {
    return true;
  }
  return false;
}
function clearNode(node) {
  while (node.firstChild) {
    node.firstChild.remove();
  }
}
class DomListener {
  constructor(node, type, handler, options) {
    this._node = node;
    this._type = type;
    this._handler = handler;
    this._options = options || false;
    this._node.addEventListener(this._type, this._handler, this._options);
  }
  dispose() {
    if (!this._handler) {
      return;
    }
    this._node.removeEventListener(this._type, this._handler, this._options);
    this._node = null;
    this._handler = null;
  }
}
function addDisposableListener(node, type, handler, useCaptureOrOptions) {
  return new DomListener(node, type, handler, useCaptureOrOptions);
}
function _wrapAsStandardMouseEvent(targetWindow, handler) {
  return function(e) {
    return handler(new StandardMouseEvent(targetWindow, e));
  };
}
function _wrapAsStandardKeyboardEvent(handler) {
  return function(e) {
    return handler(new StandardKeyboardEvent(e));
  };
}
const addStandardDisposableListener = function addStandardDisposableListener2(node, type, handler, useCapture) {
  let wrapHandler = handler;
  if (type === "click" || type === "mousedown" || type === "contextmenu") {
    wrapHandler = _wrapAsStandardMouseEvent(getWindow(node), handler);
  } else if (type === "keydown" || type === "keypress" || type === "keyup") {
    wrapHandler = _wrapAsStandardKeyboardEvent(handler);
  }
  return addDisposableListener(node, type, wrapHandler, useCapture);
};
const addStandardDisposableGenericMouseDownListener = function addStandardDisposableListener3(node, handler, useCapture) {
  const wrapHandler = _wrapAsStandardMouseEvent(getWindow(node), handler);
  return addDisposableGenericMouseDownListener(node, wrapHandler, useCapture);
};
const addStandardDisposableGenericMouseUpListener = function addStandardDisposableListener4(node, handler, useCapture) {
  const wrapHandler = _wrapAsStandardMouseEvent(getWindow(node), handler);
  return addDisposableGenericMouseUpListener(node, wrapHandler, useCapture);
};
function addDisposableGenericMouseDownListener(node, handler, useCapture) {
  return addDisposableListener(node, platform.isIOS && BrowserFeatures.pointerEvents ? EventType.POINTER_DOWN : EventType.MOUSE_DOWN, handler, useCapture);
}
function addDisposableGenericMouseMoveListener(node, handler, useCapture) {
  return addDisposableListener(node, platform.isIOS && BrowserFeatures.pointerEvents ? EventType.POINTER_MOVE : EventType.MOUSE_MOVE, handler, useCapture);
}
function addDisposableGenericMouseUpListener(node, handler, useCapture) {
  return addDisposableListener(node, platform.isIOS && BrowserFeatures.pointerEvents ? EventType.POINTER_UP : EventType.MOUSE_UP, handler, useCapture);
}
function runWhenWindowIdle(targetWindow, callback, timeout) {
  return _runWhenIdle(targetWindow, callback, timeout);
}
class WindowIdleValue extends AbstractIdleValue {
  constructor(targetWindow, executor) {
    super(targetWindow, executor);
  }
}
let runAtThisOrScheduleAtNextAnimationFrame;
let scheduleAtNextAnimationFrame;
function disposableWindowInterval(targetWindow, handler, interval, iterations) {
  let iteration = 0;
  const timer = targetWindow.setInterval(() => {
    iteration++;
    if (typeof iterations === "number" && iteration >= iterations || handler() === true) {
      disposable.dispose();
    }
  }, interval);
  const disposable = toDisposable(() => {
    targetWindow.clearInterval(timer);
  });
  return disposable;
}
class WindowIntervalTimer extends IntervalTimer {
  /**
   *
   * @param node The optional node from which the target window is determined
   */
  constructor(node) {
    super();
    this.defaultTarget = node && getWindow(node);
  }
  cancelAndSet(runner, interval, targetWindow) {
    return super.cancelAndSet(runner, interval, targetWindow ?? this.defaultTarget);
  }
}
class AnimationFrameQueueItem {
  constructor(runner, priority = 0) {
    this._runner = runner;
    this.priority = priority;
    this._canceled = false;
  }
  dispose() {
    this._canceled = true;
  }
  execute() {
    if (this._canceled) {
      return;
    }
    try {
      this._runner();
    } catch (e) {
      onUnexpectedError(e);
    }
  }
  // Sort by priority (largest to lowest)
  static sort(a, b) {
    return b.priority - a.priority;
  }
}
(function() {
  const NEXT_QUEUE = /* @__PURE__ */ new Map();
  const CURRENT_QUEUE = /* @__PURE__ */ new Map();
  const animFrameRequested = /* @__PURE__ */ new Map();
  const inAnimationFrameRunner = /* @__PURE__ */ new Map();
  const animationFrameRunner = (targetWindowId) => {
    animFrameRequested.set(targetWindowId, false);
    const currentQueue = NEXT_QUEUE.get(targetWindowId) ?? [];
    CURRENT_QUEUE.set(targetWindowId, currentQueue);
    NEXT_QUEUE.set(targetWindowId, []);
    inAnimationFrameRunner.set(targetWindowId, true);
    while (currentQueue.length > 0) {
      currentQueue.sort(AnimationFrameQueueItem.sort);
      const top = currentQueue.shift();
      top.execute();
    }
    inAnimationFrameRunner.set(targetWindowId, false);
  };
  scheduleAtNextAnimationFrame = (targetWindow, runner, priority = 0) => {
    const targetWindowId = getWindowId(targetWindow);
    const item = new AnimationFrameQueueItem(runner, priority);
    let nextQueue = NEXT_QUEUE.get(targetWindowId);
    if (!nextQueue) {
      nextQueue = [];
      NEXT_QUEUE.set(targetWindowId, nextQueue);
    }
    nextQueue.push(item);
    if (!animFrameRequested.get(targetWindowId)) {
      animFrameRequested.set(targetWindowId, true);
      targetWindow.requestAnimationFrame(() => animationFrameRunner(targetWindowId));
    }
    return item;
  };
  runAtThisOrScheduleAtNextAnimationFrame = (targetWindow, runner, priority) => {
    const targetWindowId = getWindowId(targetWindow);
    if (inAnimationFrameRunner.get(targetWindowId)) {
      const item = new AnimationFrameQueueItem(runner, priority);
      let currentQueue = CURRENT_QUEUE.get(targetWindowId);
      if (!currentQueue) {
        currentQueue = [];
        CURRENT_QUEUE.set(targetWindowId, currentQueue);
      }
      currentQueue.push(item);
      return item;
    } else {
      return scheduleAtNextAnimationFrame(targetWindow, runner, priority);
    }
  };
})();
function measure(targetWindow, callback) {
  return scheduleAtNextAnimationFrame(
    targetWindow,
    callback,
    1e4
    /* must be early */
  );
}
function modify(targetWindow, callback) {
  return scheduleAtNextAnimationFrame(
    targetWindow,
    callback,
    -1e4
    /* must be late */
  );
}
class AnimationFrameScheduler {
  constructor(node, runner) {
    this.pendingRunner = new MutableDisposable();
    this.node = node;
    this.runner = runner;
  }
  dispose() {
    this.pendingRunner.dispose();
  }
  /**
   * Cancel the currently scheduled runner (if any).
   */
  cancel() {
    this.pendingRunner.clear();
  }
  /**
   * Schedule the runner to execute at the next animation frame.
   * If already scheduled, this is a no-op (the existing schedule is kept).
   * If currently in an animation frame, the runner will execute immediately.
   */
  schedule() {
    if (this.pendingRunner.value) {
      return;
    }
    this.pendingRunner.value = runAtThisOrScheduleAtNextAnimationFrame(getWindow(this.node), () => {
      this.pendingRunner.clear();
      this.runner();
    });
  }
  /**
   * Returns true if a runner is scheduled.
   */
  isScheduled() {
    return this.pendingRunner.value !== void 0;
  }
}
const MINIMUM_TIME_MS = 8;
function DEFAULT_EVENT_MERGER(_lastEvent, currentEvent) {
  return currentEvent;
}
class TimeoutThrottledDomListener extends Disposable {
  constructor(node, type, handler, eventMerger = DEFAULT_EVENT_MERGER, minimumTimeMs = MINIMUM_TIME_MS) {
    super();
    let lastEvent = null;
    let lastHandlerTime = 0;
    const timeout = this._register(new TimeoutTimer());
    const invokeHandler = () => {
      lastHandlerTime = (/* @__PURE__ */ new Date()).getTime();
      handler(lastEvent);
      lastEvent = null;
    };
    this._register(addDisposableListener(node, type, (e) => {
      lastEvent = eventMerger(lastEvent, e);
      const elapsedTime = (/* @__PURE__ */ new Date()).getTime() - lastHandlerTime;
      if (elapsedTime >= minimumTimeMs) {
        timeout.cancel();
        invokeHandler();
      } else {
        timeout.setIfNotSet(invokeHandler, minimumTimeMs - elapsedTime);
      }
    }));
  }
}
function addDisposableThrottledListener(node, type, handler, eventMerger, minimumTimeMs) {
  return new TimeoutThrottledDomListener(node, type, handler, eventMerger, minimumTimeMs);
}
function getComputedStyle(el) {
  return getWindow(el).getComputedStyle(el, null);
}
function getClientArea(element, defaultValue, fallbackElement) {
  const elWindow = getWindow(element);
  const elDocument = elWindow.document;
  if (element !== elDocument.body) {
    return new Dimension(element.clientWidth, element.clientHeight);
  }
  if (platform.isIOS && elWindow?.visualViewport) {
    return new Dimension(elWindow.visualViewport.width, elWindow.visualViewport.height);
  }
  if (elWindow?.innerWidth && elWindow.innerHeight) {
    return new Dimension(elWindow.innerWidth, elWindow.innerHeight);
  }
  if (elDocument.body && elDocument.body.clientWidth && elDocument.body.clientHeight) {
    return new Dimension(elDocument.body.clientWidth, elDocument.body.clientHeight);
  }
  if (elDocument.documentElement && elDocument.documentElement.clientWidth && elDocument.documentElement.clientHeight) {
    return new Dimension(elDocument.documentElement.clientWidth, elDocument.documentElement.clientHeight);
  }
  if (fallbackElement) {
    return getClientArea(fallbackElement, defaultValue);
  }
  if (defaultValue) {
    return defaultValue;
  }
  throw new Error("Unable to figure out browser width and height");
}
class SizeUtils {
  // Adapted from WinJS
  // Converts a CSS positioning string for the specified element to pixels.
  static convertToPixels(element, value) {
    return parseFloat(value) || 0;
  }
  static getDimension(element, cssPropertyName) {
    const computedStyle = getComputedStyle(element);
    const value = computedStyle ? computedStyle.getPropertyValue(cssPropertyName) : "0";
    return SizeUtils.convertToPixels(element, value);
  }
  static getBorderLeftWidth(element) {
    return SizeUtils.getDimension(element, "border-left-width");
  }
  static getBorderRightWidth(element) {
    return SizeUtils.getDimension(element, "border-right-width");
  }
  static getBorderTopWidth(element) {
    return SizeUtils.getDimension(element, "border-top-width");
  }
  static getBorderBottomWidth(element) {
    return SizeUtils.getDimension(element, "border-bottom-width");
  }
  static getPaddingLeft(element) {
    return SizeUtils.getDimension(element, "padding-left");
  }
  static getPaddingRight(element) {
    return SizeUtils.getDimension(element, "padding-right");
  }
  static getPaddingTop(element) {
    return SizeUtils.getDimension(element, "padding-top");
  }
  static getPaddingBottom(element) {
    return SizeUtils.getDimension(element, "padding-bottom");
  }
  static getMarginLeft(element) {
    return SizeUtils.getDimension(element, "margin-left");
  }
  static getMarginTop(element) {
    return SizeUtils.getDimension(element, "margin-top");
  }
  static getMarginRight(element) {
    return SizeUtils.getDimension(element, "margin-right");
  }
  static getMarginBottom(element) {
    return SizeUtils.getDimension(element, "margin-bottom");
  }
}
const _Dimension = class _Dimension {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }
  with(width = this.width, height = this.height) {
    if (width !== this.width || height !== this.height) {
      return new _Dimension(width, height);
    } else {
      return this;
    }
  }
  static is(obj) {
    return typeof obj === "object" && typeof obj.height === "number" && typeof obj.width === "number";
  }
  static lift(obj) {
    if (obj instanceof _Dimension) {
      return obj;
    } else {
      return new _Dimension(obj.width, obj.height);
    }
  }
  static equals(a, b) {
    if (a === b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    return a.width === b.width && a.height === b.height;
  }
};
_Dimension.None = new _Dimension(0, 0);
let Dimension = _Dimension;
function getTopLeftOffset(element) {
  let offsetParent = element.offsetParent;
  let top = element.offsetTop;
  let left = element.offsetLeft;
  while ((element = element.parentNode) !== null && element !== element.ownerDocument.body && element !== element.ownerDocument.documentElement) {
    top -= element.scrollTop;
    const c = isShadowRoot(element) ? null : getComputedStyle(element);
    if (c) {
      left -= c.direction !== "rtl" ? element.scrollLeft : -element.scrollLeft;
    }
    if (element === offsetParent) {
      left += SizeUtils.getBorderLeftWidth(element);
      top += SizeUtils.getBorderTopWidth(element);
      top += element.offsetTop;
      left += element.offsetLeft;
      offsetParent = element.offsetParent;
    }
  }
  return {
    left,
    top
  };
}
function size(element, width, height) {
  if (typeof width === "number") {
    element.style.width = `${width}px`;
  }
  if (typeof height === "number") {
    element.style.height = `${height}px`;
  }
}
function position(element, top, right, bottom, left, position2 = "absolute") {
  if (typeof top === "number") {
    element.style.top = `${top}px`;
  }
  if (typeof right === "number") {
    element.style.right = `${right}px`;
  }
  if (typeof bottom === "number") {
    element.style.bottom = `${bottom}px`;
  }
  if (typeof left === "number") {
    element.style.left = `${left}px`;
  }
  element.style.position = position2;
}
function getDomNodePagePosition(domNode) {
  const bb = domNode.getBoundingClientRect();
  const window = getWindow(domNode);
  return {
    left: bb.left + window.scrollX,
    top: bb.top + window.scrollY,
    width: bb.width,
    height: bb.height
  };
}
function getDomNodeZoomLevel(domNode) {
  let testElement = domNode;
  let zoom = 1;
  do {
    const elementZoomLevel = getComputedStyle(testElement).zoom;
    if (elementZoomLevel !== null && elementZoomLevel !== void 0 && elementZoomLevel !== "1") {
      zoom *= elementZoomLevel;
    }
    testElement = testElement.parentElement;
  } while (testElement !== null && testElement !== testElement.ownerDocument.documentElement);
  return zoom;
}
function getTotalWidth(element) {
  const margin = SizeUtils.getMarginLeft(element) + SizeUtils.getMarginRight(element);
  return element.offsetWidth + margin;
}
function getContentWidth(element) {
  const border = SizeUtils.getBorderLeftWidth(element) + SizeUtils.getBorderRightWidth(element);
  const padding = SizeUtils.getPaddingLeft(element) + SizeUtils.getPaddingRight(element);
  return element.offsetWidth - border - padding;
}
function getTotalScrollWidth(element) {
  const margin = SizeUtils.getMarginLeft(element) + SizeUtils.getMarginRight(element);
  return element.scrollWidth + margin;
}
function getContentHeight(element) {
  const border = SizeUtils.getBorderTopWidth(element) + SizeUtils.getBorderBottomWidth(element);
  const padding = SizeUtils.getPaddingTop(element) + SizeUtils.getPaddingBottom(element);
  return element.offsetHeight - border - padding;
}
function getTotalHeight(element) {
  const margin = SizeUtils.getMarginTop(element) + SizeUtils.getMarginBottom(element);
  return element.offsetHeight + margin;
}
function getRelativeLeft(element, parent) {
  if (element === null) {
    return 0;
  }
  const elementPosition = getTopLeftOffset(element);
  const parentPosition = getTopLeftOffset(parent);
  return elementPosition.left - parentPosition.left;
}
function getLargestChildWidth(parent, children) {
  const childWidths = children.map((child) => {
    return Math.max(getTotalScrollWidth(child), getTotalWidth(child)) + getRelativeLeft(child, parent) || 0;
  });
  const maxWidth = Math.max(...childWidths);
  return maxWidth;
}
function isAncestor(testChild, testAncestor) {
  return Boolean(testAncestor?.contains(testChild));
}
const parentFlowToDataKey = "parentFlowToElementId";
function setParentFlowTo(fromChildElement, toParentElement) {
  fromChildElement.dataset[parentFlowToDataKey] = toParentElement.id;
}
function getParentFlowToElement(node) {
  const flowToParentId = node.dataset[parentFlowToDataKey];
  if (typeof flowToParentId === "string") {
    return node.ownerDocument.getElementById(flowToParentId);
  }
  return null;
}
function isAncestorUsingFlowTo(testChild, testAncestor) {
  let node = testChild;
  while (node) {
    if (node === testAncestor) {
      return true;
    }
    if (isHTMLElement(node)) {
      const flowToParentElement = getParentFlowToElement(node);
      if (flowToParentElement) {
        node = flowToParentElement;
        continue;
      }
    }
    node = node.parentNode;
  }
  return false;
}
function findParentWithClass(node, clazz, stopAtClazzOrNode) {
  while (node && node.nodeType === node.ELEMENT_NODE) {
    if (typeof clazz === "string" ? node.classList.contains(clazz) : clazz.every((candidate) => node.classList.contains(candidate))) {
      return node;
    }
    if (stopAtClazzOrNode) {
      if (typeof stopAtClazzOrNode === "string") {
        if (node.classList.contains(stopAtClazzOrNode)) {
          return null;
        }
      } else {
        if (node === stopAtClazzOrNode) {
          return null;
        }
      }
    }
    node = node.parentNode;
  }
  return null;
}
function hasParentWithClass(node, clazz, stopAtClazzOrNode) {
  return !!findParentWithClass(node, clazz, stopAtClazzOrNode);
}
function isShadowRoot(node) {
  return node && !!node.host && !!node.mode;
}
function isInShadowDOM(domNode) {
  return !!getShadowRoot(domNode);
}
function getShadowRoot(domNode) {
  while (domNode.parentNode) {
    if (domNode === domNode.ownerDocument?.body) {
      return null;
    }
    domNode = domNode.parentNode;
  }
  return isShadowRoot(domNode) ? domNode : null;
}
function getActiveElement() {
  let result = getActiveDocument().activeElement;
  while (result?.shadowRoot) {
    result = result.shadowRoot.activeElement;
  }
  return result;
}
function isActiveElement(element) {
  return getActiveElement() === element;
}
function isAncestorOfActiveElement(ancestor) {
  return isAncestor(getActiveElement(), ancestor);
}
function isActiveDocument(element) {
  return element.ownerDocument === getActiveDocument();
}
function getActiveDocument() {
  if (getWindowsCount() <= 1) {
    return mainWindow.document;
  }
  const documents = Array.from(getWindows()).map(({ window }) => window.document);
  const focusedDoc = documents.find((doc) => doc.hasFocus());
  if (focusedDoc) {
    return focusedDoc;
  }
  const externalWindow = getExternalFocusWindow();
  if (externalWindow) {
    return externalWindow.document;
  }
  return mainWindow.document;
}
function getActiveWindow() {
  const document2 = getActiveDocument();
  return document2.defaultView?.window ?? mainWindow;
}
const sharedMutationObserver = new class {
  constructor() {
    this.mutationObservers = /* @__PURE__ */ new Map();
  }
  observe(target, disposables, options) {
    let mutationObserversPerTarget = this.mutationObservers.get(target);
    if (!mutationObserversPerTarget) {
      mutationObserversPerTarget = /* @__PURE__ */ new Map();
      this.mutationObservers.set(target, mutationObserversPerTarget);
    }
    const optionsHash = hash(options);
    let mutationObserverPerOptions = mutationObserversPerTarget.get(optionsHash);
    if (!mutationObserverPerOptions) {
      const onDidMutate = new event.Emitter();
      const observer = new MutationObserver((mutations) => onDidMutate.fire(mutations));
      observer.observe(target, options);
      const resolvedMutationObserverPerOptions = mutationObserverPerOptions = {
        users: 1,
        observer,
        onDidMutate: onDidMutate.event
      };
      disposables.add(toDisposable(() => {
        resolvedMutationObserverPerOptions.users -= 1;
        if (resolvedMutationObserverPerOptions.users === 0) {
          onDidMutate.dispose();
          observer.disconnect();
          mutationObserversPerTarget?.delete(optionsHash);
          if (mutationObserversPerTarget?.size === 0) {
            this.mutationObservers.delete(target);
          }
        }
      }));
      mutationObserversPerTarget.set(optionsHash, mutationObserverPerOptions);
    } else {
      mutationObserverPerOptions.users += 1;
    }
    return mutationObserverPerOptions.onDidMutate;
  }
}();
function createMetaElement(container = mainWindow.document.head) {
  return createHeadElement("meta", container);
}
function createLinkElement(container = mainWindow.document.head) {
  return createHeadElement("link", container);
}
function createHeadElement(tagName, container = mainWindow.document.head) {
  const element = document.createElement(tagName);
  container.appendChild(element);
  return element;
}
function isHTMLElement(e) {
  return e instanceof HTMLElement || e instanceof getWindow(e).HTMLElement;
}
function isHTMLAnchorElement(e) {
  return e instanceof HTMLAnchorElement || e instanceof getWindow(e).HTMLAnchorElement;
}
function isHTMLSpanElement(e) {
  return e instanceof HTMLSpanElement || e instanceof getWindow(e).HTMLSpanElement;
}
function isHTMLTextAreaElement(e) {
  return e instanceof HTMLTextAreaElement || e instanceof getWindow(e).HTMLTextAreaElement;
}
function isHTMLInputElement(e) {
  return e instanceof HTMLInputElement || e instanceof getWindow(e).HTMLInputElement;
}
function isHTMLButtonElement(e) {
  return e instanceof HTMLButtonElement || e instanceof getWindow(e).HTMLButtonElement;
}
function isHTMLDivElement(e) {
  return e instanceof HTMLDivElement || e instanceof getWindow(e).HTMLDivElement;
}
function isSVGElement(e) {
  return e instanceof SVGElement || e instanceof getWindow(e).SVGElement;
}
function isMouseEvent(e) {
  return e instanceof MouseEvent || e instanceof getWindow(e).MouseEvent;
}
function isKeyboardEvent(e) {
  return e instanceof KeyboardEvent || e instanceof getWindow(e).KeyboardEvent;
}
function isPointerEvent(e) {
  return e instanceof PointerEvent || e instanceof getWindow(e).PointerEvent;
}
function isDragEvent(e) {
  return e instanceof DragEvent || e instanceof getWindow(e).DragEvent;
}
const EventType = {
  // Mouse
  CLICK: "click",
  AUXCLICK: "auxclick",
  DBLCLICK: "dblclick",
  MOUSE_UP: "mouseup",
  MOUSE_DOWN: "mousedown",
  MOUSE_OVER: "mouseover",
  MOUSE_MOVE: "mousemove",
  MOUSE_OUT: "mouseout",
  MOUSE_ENTER: "mouseenter",
  MOUSE_LEAVE: "mouseleave",
  MOUSE_WHEEL: "wheel",
  POINTER_UP: "pointerup",
  POINTER_DOWN: "pointerdown",
  POINTER_MOVE: "pointermove",
  POINTER_LEAVE: "pointerleave",
  CONTEXT_MENU: "contextmenu",
  WHEEL: "wheel",
  // Keyboard
  KEY_DOWN: "keydown",
  KEY_PRESS: "keypress",
  KEY_UP: "keyup",
  // HTML Document
  LOAD: "load",
  BEFORE_UNLOAD: "beforeunload",
  UNLOAD: "unload",
  PAGE_SHOW: "pageshow",
  PAGE_HIDE: "pagehide",
  PASTE: "paste",
  ABORT: "abort",
  ERROR: "error",
  RESIZE: "resize",
  SCROLL: "scroll",
  FULLSCREEN_CHANGE: "fullscreenchange",
  WK_FULLSCREEN_CHANGE: "webkitfullscreenchange",
  // Form
  SELECT: "select",
  CHANGE: "change",
  SUBMIT: "submit",
  RESET: "reset",
  FOCUS: "focus",
  FOCUS_IN: "focusin",
  FOCUS_OUT: "focusout",
  BLUR: "blur",
  INPUT: "input",
  // Local Storage
  STORAGE: "storage",
  // Drag
  DRAG_START: "dragstart",
  DRAG: "drag",
  DRAG_ENTER: "dragenter",
  DRAG_LEAVE: "dragleave",
  DRAG_OVER: "dragover",
  DROP: "drop",
  DRAG_END: "dragend",
  // Animation
  ANIMATION_START: browser.isWebKit ? "webkitAnimationStart" : "animationstart",
  ANIMATION_END: browser.isWebKit ? "webkitAnimationEnd" : "animationend",
  ANIMATION_ITERATION: browser.isWebKit ? "webkitAnimationIteration" : "animationiteration"
};
function isEventLike(obj) {
  const candidate = obj;
  return !!(candidate && typeof candidate.preventDefault === "function" && typeof candidate.stopPropagation === "function");
}
const EventHelper = {
  stop: (e, cancelBubble) => {
    e.preventDefault();
    if (cancelBubble) {
      e.stopPropagation();
    }
    return e;
  }
};
function saveParentsScrollTop(node) {
  const r = [];
  for (let i = 0; node && node.nodeType === node.ELEMENT_NODE; i++) {
    r[i] = node.scrollTop;
    node = node.parentNode;
  }
  return r;
}
function restoreParentsScrollTop(node, state) {
  for (let i = 0; node && node.nodeType === node.ELEMENT_NODE; i++) {
    if (node.scrollTop !== state[i]) {
      node.scrollTop = state[i];
    }
    node = node.parentNode;
  }
}
class FocusTracker extends Disposable {
  constructor(element) {
    super();
    this._onDidFocus = this._register(new event.Emitter());
    this._onDidBlur = this._register(new event.Emitter());
    let hasFocus = FocusTracker.hasFocusWithin(element);
    let loosingFocus = false;
    const onFocus = () => {
      loosingFocus = false;
      if (!hasFocus) {
        hasFocus = true;
        this._onDidFocus.fire();
      }
    };
    const onBlur = () => {
      if (hasFocus) {
        loosingFocus = true;
        (isHTMLElement(element) ? getWindow(element) : element).setTimeout(() => {
          if (loosingFocus) {
            loosingFocus = false;
            hasFocus = false;
            this._onDidBlur.fire();
          }
        }, 0);
      }
    };
    this._refreshStateHandler = () => {
      const currentNodeHasFocus = FocusTracker.hasFocusWithin(element);
      if (currentNodeHasFocus !== hasFocus) {
        if (hasFocus) {
          onBlur();
        } else {
          onFocus();
        }
      }
    };
    this._register(addDisposableListener(element, EventType.FOCUS, onFocus, true));
    this._register(addDisposableListener(element, EventType.BLUR, onBlur, true));
    if (isHTMLElement(element)) {
      this._register(addDisposableListener(element, EventType.FOCUS_IN, () => this._refreshStateHandler()));
      this._register(addDisposableListener(element, EventType.FOCUS_OUT, () => this._refreshStateHandler()));
    }
  }
  get onDidFocus() {
    return this._onDidFocus.event;
  }
  get onDidBlur() {
    return this._onDidBlur.event;
  }
  static hasFocusWithin(element) {
    if (isHTMLElement(element)) {
      const shadowRoot = getShadowRoot(element);
      const activeElement = shadowRoot ? shadowRoot.activeElement : element.ownerDocument.activeElement;
      return isAncestor(activeElement, element);
    } else {
      const window = element;
      return isAncestor(window.document.activeElement, window.document);
    }
  }
  refreshState() {
    this._refreshStateHandler();
  }
}
function trackFocus(element) {
  return new FocusTracker(element);
}
function after(sibling, child) {
  sibling.after(child);
  return child;
}
function append(parent, ...children) {
  parent.append(...children);
  if (children.length === 1 && typeof children[0] !== "string") {
    return children[0];
  }
}
function prepend(parent, child) {
  parent.insertBefore(child, parent.firstChild);
  return child;
}
function reset(parent, ...children) {
  parent.textContent = "";
  append(parent, ...children);
}
const SELECTOR_REGEX = /([\w\-]+)?(#([\w\-]+))?((\.([\w\-]+))*)/;
var Namespace = /* @__PURE__ */ ((Namespace2) => {
  Namespace2["HTML"] = "http://www.w3.org/1999/xhtml";
  Namespace2["SVG"] = "http://www.w3.org/2000/svg";
  return Namespace2;
})(Namespace || {});
function _$(namespace, description, attrs, ...children) {
  const match = SELECTOR_REGEX.exec(description);
  if (!match) {
    throw new Error("Bad use of emmet");
  }
  const tagName = match[1] || "div";
  let result;
  if (namespace !== "http://www.w3.org/1999/xhtml" /* HTML */) {
    result = document.createElementNS(namespace, tagName);
  } else {
    result = document.createElement(tagName);
  }
  if (match[3]) {
    result.id = match[3];
  }
  if (match[4]) {
    result.className = match[4].replace(/\./g, " ").trim();
  }
  if (attrs) {
    Object.entries(attrs).forEach(([name, value]) => {
      if (typeof value === "undefined") {
        return;
      }
      if (/^on\w+$/.test(name)) {
        result[name] = value;
      } else if (name === "selected") {
        if (value) {
          result.setAttribute(name, "true");
        }
      } else {
        result.setAttribute(name, value);
      }
    });
  }
  result.append(...children);
  return result;
}
function $(description, attrs, ...children) {
  return _$("http://www.w3.org/1999/xhtml" /* HTML */, description, attrs, ...children);
}
$.SVG = function(description, attrs, ...children) {
  return _$("http://www.w3.org/2000/svg" /* SVG */, description, attrs, ...children);
};
function join(nodes, separator) {
  const result = [];
  nodes.forEach((node, index) => {
    if (index > 0) {
      if (separator instanceof Node) {
        result.push(separator.cloneNode());
      } else {
        result.push(document.createTextNode(separator));
      }
    }
    result.push(node);
  });
  return result;
}
function setVisibility(visible, ...elements) {
  if (visible) {
    show(...elements);
  } else {
    hide(...elements);
  }
}
function show(...elements) {
  for (const element of elements) {
    element.style.display = "";
    element.removeAttribute("aria-hidden");
  }
}
function hide(...elements) {
  for (const element of elements) {
    element.style.display = "none";
    element.setAttribute("aria-hidden", "true");
  }
}
function findParentWithAttribute(node, attribute) {
  while (node && node.nodeType === node.ELEMENT_NODE) {
    if (isHTMLElement(node) && node.hasAttribute(attribute)) {
      return node;
    }
    node = node.parentNode;
  }
  return null;
}
function removeTabIndexAndUpdateFocus(node) {
  if (!node || !node.hasAttribute("tabIndex")) {
    return;
  }
  if (node.ownerDocument.activeElement === node) {
    const parentFocusable = findParentWithAttribute(node.parentElement, "tabIndex");
    parentFocusable?.focus();
  }
  node.removeAttribute("tabindex");
}
function finalHandler(fn) {
  return (e) => {
    e.preventDefault();
    e.stopPropagation();
    fn(e);
  };
}
function domContentLoaded(targetWindow) {
  return new Promise((resolve2) => {
    const readyState = targetWindow.document.readyState;
    if (readyState === "complete" || targetWindow.document && targetWindow.document.body !== null) {
      resolve2(void 0);
    } else {
      const listener = () => {
        targetWindow.window.removeEventListener("DOMContentLoaded", listener, false);
        resolve2();
      };
      targetWindow.window.addEventListener("DOMContentLoaded", listener, false);
    }
  });
}
function computeScreenAwareSize(window, cssPx) {
  const screenPx = window.devicePixelRatio * cssPx;
  return Math.max(1, Math.floor(screenPx)) / window.devicePixelRatio;
}
function windowOpenNoOpener(url) {
  mainWindow.open(url, "_blank", "noopener");
}
const popupWidth = 780, popupHeight = 640;
function windowOpenPopup(url) {
  const left = Math.floor(mainWindow.screenLeft + mainWindow.innerWidth / 2 - popupWidth / 2);
  const top = Math.floor(mainWindow.screenTop + mainWindow.innerHeight / 2 - popupHeight / 2);
  mainWindow.open(
    url,
    "_blank",
    `width=${popupWidth},height=${popupHeight},top=${top},left=${left}`
  );
}
function windowOpenWithSuccess(url, noOpener = true) {
  const newTab = mainWindow.open();
  if (newTab) {
    if (noOpener) {
      newTab.opener = null;
    }
    newTab.location.href = url;
    return true;
  }
  return false;
}
function animate(targetWindow, fn) {
  const step = () => {
    fn();
    stepDisposable = scheduleAtNextAnimationFrame(targetWindow, step);
  };
  let stepDisposable = scheduleAtNextAnimationFrame(targetWindow, step);
  return toDisposable(() => stepDisposable.dispose());
}
RemoteAuthorities.setPreferredWebSchema(/^https:/.test(mainWindow.location.href) ? "https" : "http");
function triggerDownload(dataOrUri, name) {
  let url;
  if (URI.isUri(dataOrUri)) {
    url = dataOrUri.toString(true);
  } else {
    const blob = new Blob([dataOrUri]);
    url = URL.createObjectURL(blob);
    setTimeout(() => URL.revokeObjectURL(url));
  }
  const activeWindow = getActiveWindow();
  const anchor = document.createElement("a");
  activeWindow.document.body.appendChild(anchor);
  anchor.download = name;
  anchor.href = url;
  anchor.click();
  setTimeout(() => anchor.remove());
}
function triggerUpload() {
  return new Promise((resolve2) => {
    const activeWindow = getActiveWindow();
    const input = document.createElement("input");
    activeWindow.document.body.appendChild(input);
    input.type = "file";
    input.multiple = true;
    event.Event.once(event.Event.fromDOMEventEmitter(input, "input"))(() => {
      resolve2(input.files ?? void 0);
    });
    input.click();
    setTimeout(() => input.remove());
  });
}
var DetectedFullscreenMode = /* @__PURE__ */ ((DetectedFullscreenMode2) => {
  DetectedFullscreenMode2[DetectedFullscreenMode2["DOCUMENT"] = 1] = "DOCUMENT";
  DetectedFullscreenMode2[DetectedFullscreenMode2["BROWSER"] = 2] = "BROWSER";
  return DetectedFullscreenMode2;
})(DetectedFullscreenMode || {});
function detectFullscreen(targetWindow) {
  if (targetWindow.document.fullscreenElement || targetWindow.document.webkitFullscreenElement || targetWindow.document.webkitIsFullScreen) {
    return { mode: 1 /* DOCUMENT */, guess: false };
  }
  if (targetWindow.innerHeight === targetWindow.screen.height) {
    return { mode: 2 /* BROWSER */, guess: false };
  }
  if (platform.isMacintosh || platform.isLinux) {
    if (targetWindow.outerHeight === targetWindow.screen.height && targetWindow.outerWidth === targetWindow.screen.width) {
      return { mode: 2 /* BROWSER */, guess: true };
    }
  }
  return null;
}
class ModifierKeyEmitter extends event.Emitter {
  constructor() {
    super();
    this._subscriptions = new DisposableStore();
    this._keyStatus = {
      altKey: false,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false
    };
    this._subscriptions.add(event.Event.runAndSubscribe(onDidRegisterWindow, ({ window, disposables }) => this.registerListeners(window, disposables), { window: mainWindow, disposables: this._subscriptions }));
  }
  registerListeners(window, disposables) {
    disposables.add(addDisposableListener(window, "keydown", (e) => {
      if (e.defaultPrevented) {
        return;
      }
      const event2 = new StandardKeyboardEvent(e);
      if (event2.keyCode === KeyCode.Alt && e.repeat) {
        return;
      }
      if (e.altKey && !this._keyStatus.altKey) {
        this._keyStatus.lastKeyPressed = "alt";
      } else if (e.ctrlKey && !this._keyStatus.ctrlKey) {
        this._keyStatus.lastKeyPressed = "ctrl";
      } else if (e.metaKey && !this._keyStatus.metaKey) {
        this._keyStatus.lastKeyPressed = "meta";
      } else if (e.shiftKey && !this._keyStatus.shiftKey) {
        this._keyStatus.lastKeyPressed = "shift";
      } else if (event2.keyCode !== KeyCode.Alt) {
        this._keyStatus.lastKeyPressed = void 0;
      } else {
        return;
      }
      this._keyStatus.altKey = e.altKey;
      this._keyStatus.ctrlKey = e.ctrlKey;
      this._keyStatus.metaKey = e.metaKey;
      this._keyStatus.shiftKey = e.shiftKey;
      if (this._keyStatus.lastKeyPressed) {
        this._keyStatus.event = e;
        this.fire(this._keyStatus);
      }
    }, true));
    disposables.add(addDisposableListener(window, "keyup", (e) => {
      if (e.defaultPrevented) {
        return;
      }
      if (!e.altKey && this._keyStatus.altKey) {
        this._keyStatus.lastKeyReleased = "alt";
      } else if (!e.ctrlKey && this._keyStatus.ctrlKey) {
        this._keyStatus.lastKeyReleased = "ctrl";
      } else if (!e.metaKey && this._keyStatus.metaKey) {
        this._keyStatus.lastKeyReleased = "meta";
      } else if (!e.shiftKey && this._keyStatus.shiftKey) {
        this._keyStatus.lastKeyReleased = "shift";
      } else {
        this._keyStatus.lastKeyReleased = void 0;
      }
      if (this._keyStatus.lastKeyPressed !== this._keyStatus.lastKeyReleased) {
        this._keyStatus.lastKeyPressed = void 0;
      }
      this._keyStatus.altKey = e.altKey;
      this._keyStatus.ctrlKey = e.ctrlKey;
      this._keyStatus.metaKey = e.metaKey;
      this._keyStatus.shiftKey = e.shiftKey;
      if (this._keyStatus.lastKeyReleased) {
        this._keyStatus.event = e;
        this.fire(this._keyStatus);
      }
    }, true));
    disposables.add(addDisposableListener(window.document.body, "mousedown", () => {
      this._keyStatus.lastKeyPressed = void 0;
    }, true));
    disposables.add(addDisposableListener(window.document.body, "mouseup", () => {
      this._keyStatus.lastKeyPressed = void 0;
    }, true));
    disposables.add(addDisposableListener(window.document.body, "mousemove", (e) => {
      if (e.buttons) {
        this._keyStatus.lastKeyPressed = void 0;
      }
    }, true));
    disposables.add(addDisposableListener(window, "blur", () => {
      this.resetKeyStatus();
    }));
  }
  get keyStatus() {
    return this._keyStatus;
  }
  get isModifierPressed() {
    return hasModifierKeys(this._keyStatus);
  }
  /**
   * Allows to explicitly reset the key status based on more knowledge (#109062)
   */
  resetKeyStatus() {
    this.doResetKeyStatus();
    this.fire(this._keyStatus);
  }
  doResetKeyStatus() {
    this._keyStatus = {
      altKey: false,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false
    };
  }
  static getInstance() {
    if (!ModifierKeyEmitter.instance) {
      ModifierKeyEmitter.instance = new ModifierKeyEmitter();
    }
    return ModifierKeyEmitter.instance;
  }
  static disposeInstance() {
    if (ModifierKeyEmitter.instance) {
      ModifierKeyEmitter.instance.dispose();
      ModifierKeyEmitter.instance = void 0;
    }
  }
  dispose() {
    super.dispose();
    this._subscriptions.dispose();
  }
}
function getCookieValue(name) {
  const match = document.cookie.match("(^|[^;]+)\\s*" + name + "\\s*=\\s*([^;]+)");
  return match ? match.pop() : void 0;
}
class DragAndDropObserver extends Disposable {
  constructor(element, callbacks) {
    super();
    this.element = element;
    this.callbacks = callbacks;
    // A helper to fix issues with repeated DRAG_ENTER / DRAG_LEAVE
    // calls see https://github.com/microsoft/vscode/issues/14470
    // when the element has child elements where the events are fired
    // repeadedly.
    this.counter = 0;
    // Allows to measure the duration of the drag operation.
    this.dragStartTime = 0;
    this.registerListeners();
  }
  registerListeners() {
    if (this.callbacks.onDragStart) {
      this._register(addDisposableListener(this.element, EventType.DRAG_START, (e) => {
        this.callbacks.onDragStart?.(e);
      }));
    }
    if (this.callbacks.onDrag) {
      this._register(addDisposableListener(this.element, EventType.DRAG, (e) => {
        this.callbacks.onDrag?.(e);
      }));
    }
    this._register(addDisposableListener(this.element, EventType.DRAG_ENTER, (e) => {
      this.counter++;
      this.dragStartTime = e.timeStamp;
      this.callbacks.onDragEnter?.(e);
    }));
    this._register(addDisposableListener(this.element, EventType.DRAG_OVER, (e) => {
      e.preventDefault();
      this.callbacks.onDragOver?.(e, e.timeStamp - this.dragStartTime);
    }));
    this._register(addDisposableListener(this.element, EventType.DRAG_LEAVE, (e) => {
      this.counter--;
      if (this.counter === 0) {
        this.dragStartTime = 0;
        this.callbacks.onDragLeave?.(e);
      }
    }));
    this._register(addDisposableListener(this.element, EventType.DRAG_END, (e) => {
      this.counter = 0;
      this.dragStartTime = 0;
      this.callbacks.onDragEnd?.(e);
    }));
    this._register(addDisposableListener(this.element, EventType.DROP, (e) => {
      this.counter = 0;
      this.dragStartTime = 0;
      this.callbacks.onDrop?.(e);
    }));
  }
}
class DisposableResizeObserver extends Disposable {
  constructor(name, callback, targetWindow = mainWindow, options) {
    super();
    this.name = name;
    const ctor = options?.resizeObserverCtor ?? targetWindow.ResizeObserver;
    this.observer = new ctor((entries, observer) => {
      recordDisposableResizeObserverInvocation(targetWindow, this.name);
      try {
        callback(entries, observer);
      } catch (e) {
        onUnexpectedError(e);
      }
    });
    this._register(toDisposable(() => this.observer.disconnect()));
  }
  observe(target, options) {
    this.observer.observe(target, options);
    return toDisposable(() => this.observer.unobserve(target));
  }
}
const maxRecentDisposableResizeObservers = 8;
const recentDisposableResizeObserverContexts = /* @__PURE__ */ new WeakMap();
function recordDisposableResizeObserverInvocation(targetWindow, name) {
  let context = recentDisposableResizeObserverContexts.get(targetWindow);
  if (!context) {
    context = { names: /* @__PURE__ */ new Set(), overflow: false };
    recentDisposableResizeObserverContexts.set(targetWindow, context);
    targetWindow.requestAnimationFrame(() => recentDisposableResizeObserverContexts.delete(targetWindow));
  }
  if (context.names.has(name)) {
    return;
  }
  if (context.names.size < maxRecentDisposableResizeObservers) {
    context.names.add(name);
  } else {
    context.overflow = true;
    const largestName = Array.from(context.names).sort().at(-1);
    if (name < largestName) {
      context.names.delete(largestName);
      context.names.add(name);
    }
  }
}
function getRecentDisposableResizeObserverContextForLoopError(message, targetWindow = mainWindow) {
  if (typeof message !== "string" || !message.includes("ResizeObserver loop")) {
    return void 0;
  }
  const context = recentDisposableResizeObserverContexts.get(targetWindow);
  if (!context) {
    return void 0;
  }
  const names = Array.from(context.names).sort();
  if (context.overflow) {
    names.push("<overflow>");
  }
  return `[ResizeObserverLoopContext(${names.join(",")})] ${message}`;
}
const H_REGEX = /(?<tag>[\w\-]+)?(?:#(?<id>[\w\-]+))?(?<class>(?:\.(?:[\w\-]+))*)(?:@(?<name>(?:[\w\_])+))?/;
function h(tag, ...args) {
  let attributes;
  let children;
  if (Array.isArray(args[0])) {
    attributes = {};
    children = args[0];
  } else {
    attributes = args[0] || {};
    children = args[1];
  }
  const match = H_REGEX.exec(tag);
  if (!match || !match.groups) {
    throw new Error("Bad use of h");
  }
  const tagName = match.groups["tag"] || "div";
  const el = document.createElement(tagName);
  if (match.groups["id"]) {
    el.id = match.groups["id"];
  }
  const classNames = [];
  if (match.groups["class"]) {
    for (const className of match.groups["class"].split(".")) {
      if (className !== "") {
        classNames.push(className);
      }
    }
  }
  if (attributes.className !== void 0) {
    for (const className of attributes.className.split(".")) {
      if (className !== "") {
        classNames.push(className);
      }
    }
  }
  if (classNames.length > 0) {
    el.className = classNames.join(" ");
  }
  const result = {};
  if (match.groups["name"]) {
    result[match.groups["name"]] = el;
  }
  if (children) {
    for (const c of children) {
      if (isHTMLElement(c)) {
        el.appendChild(c);
      } else if (typeof c === "string") {
        el.append(c);
      } else if ("root" in c) {
        Object.assign(result, c);
        el.appendChild(c.root);
      }
    }
  }
  for (const [key, value] of Object.entries(attributes)) {
    if (key === "className") {
      continue;
    } else if (key === "style") {
      for (const [cssKey, cssValue] of Object.entries(value)) {
        el.style.setProperty(
          camelCaseToHyphenCase(cssKey),
          typeof cssValue === "number" ? cssValue + "px" : "" + cssValue
        );
      }
    } else if (key === "tabIndex") {
      el.tabIndex = value;
    } else {
      el.setAttribute(camelCaseToHyphenCase(key), value.toString());
    }
  }
  result["root"] = el;
  return result;
}
function svgElem(tag, ...args) {
  let attributes;
  let children;
  if (Array.isArray(args[0])) {
    attributes = {};
    children = args[0];
  } else {
    attributes = args[0] || {};
    children = args[1];
  }
  const match = H_REGEX.exec(tag);
  if (!match || !match.groups) {
    throw new Error("Bad use of h");
  }
  const tagName = match.groups["tag"] || "div";
  const el = document.createElementNS("http://www.w3.org/2000/svg", tagName);
  if (match.groups["id"]) {
    el.id = match.groups["id"];
  }
  const classNames = [];
  if (match.groups["class"]) {
    for (const className of match.groups["class"].split(".")) {
      if (className !== "") {
        classNames.push(className);
      }
    }
  }
  if (attributes.className !== void 0) {
    for (const className of attributes.className.split(".")) {
      if (className !== "") {
        classNames.push(className);
      }
    }
  }
  if (classNames.length > 0) {
    el.className = classNames.join(" ");
  }
  const result = {};
  if (match.groups["name"]) {
    result[match.groups["name"]] = el;
  }
  if (children) {
    for (const c of children) {
      if (isHTMLElement(c)) {
        el.appendChild(c);
      } else if (typeof c === "string") {
        el.append(c);
      } else if ("root" in c) {
        Object.assign(result, c);
        el.appendChild(c.root);
      }
    }
  }
  for (const [key, value] of Object.entries(attributes)) {
    if (key === "className") {
      continue;
    } else if (key === "style") {
      for (const [cssKey, cssValue] of Object.entries(value)) {
        el.style.setProperty(
          camelCaseToHyphenCase(cssKey),
          typeof cssValue === "number" ? cssValue + "px" : "" + cssValue
        );
      }
    } else if (key === "tabIndex") {
      el.tabIndex = value;
    } else {
      el.setAttribute(camelCaseToHyphenCase(key), value.toString());
    }
  }
  result["root"] = el;
  return result;
}
function camelCaseToHyphenCase(str) {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}
function copyAttributes(from, to, filter) {
  for (const { name, value } of from.attributes) {
    if (!filter || filter.includes(name)) {
      to.setAttribute(name, value);
    }
  }
}
function copyAttribute(from, to, name) {
  const value = from.getAttribute(name);
  if (value) {
    to.setAttribute(name, value);
  } else {
    to.removeAttribute(name);
  }
}
function trackAttributes(from, to, filter) {
  copyAttributes(from, to, filter);
  const disposables = new DisposableStore();
  disposables.add(sharedMutationObserver.observe(from, disposables, { attributes: true, attributeFilter: filter })((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.attributeName) {
        copyAttribute(from, to, mutation.attributeName);
      }
    }
  }));
  return disposables;
}
function isEditableElement(element) {
  return element.tagName.toLowerCase() === "input" || element.tagName.toLowerCase() === "textarea" || isHTMLElement(element) && !!element.editContext;
}
class SafeTriangle {
  constructor(originX, originY, target) {
    this.originX = originX;
    this.originY = originY;
    // 4 points (x, y), 8 length
    this.points = new Int16Array(8);
    const { top, left, right, bottom } = target.getBoundingClientRect();
    const t = this.points;
    let i = 0;
    t[i++] = left;
    t[i++] = top;
    t[i++] = right;
    t[i++] = top;
    t[i++] = left;
    t[i++] = bottom;
    t[i++] = right;
    t[i++] = bottom;
  }
  contains(x, y) {
    const { points, originX, originY } = this;
    for (let i = 0; i < 4; i++) {
      const p1 = 2 * i;
      const p2 = 2 * ((i + 1) % 4);
      if (isPointWithinTriangle(x, y, originX, originY, points[p1], points[p1 + 1], points[p2], points[p2 + 1])) {
        return true;
      }
    }
    return false;
  }
}
var n;
((n2) => {
  function nodeNs(elementNs = void 0) {
    return (tag, attributes, children) => {
      const className = attributes.class;
      delete attributes.class;
      const ref2 = attributes.ref;
      delete attributes.ref;
      const obsRef = attributes.obsRef;
      delete attributes.obsRef;
      return new ObserverNodeWithElement(tag, ref2, obsRef, elementNs, className, attributes, children);
    };
  }
  function node(tag, elementNs = void 0) {
    const f = nodeNs(elementNs);
    return (attributes, children) => {
      return f(tag, attributes, children);
    };
  }
  n2.div = node("div");
  n2.elem = nodeNs(void 0);
  n2.svg = node("svg", "http://www.w3.org/2000/svg");
  n2.svgElem = nodeNs("http://www.w3.org/2000/svg");
  function ref() {
    let value = void 0;
    const result = function(val) {
      value = val;
    };
    Object.defineProperty(result, "element", {
      get() {
        if (!value) {
          throw new BugIndicatingError("Make sure the ref is set before accessing the element. Maybe wrong initialization order?");
        }
        return value;
      }
    });
    return result;
  }
  n2.ref = ref;
})(n || (n = {}));
class ObserverNode {
  constructor(tag, ref, obsRef, ns, className, attributes, children) {
    this._deriveds = [];
    this._isHovered = void 0;
    this._didMouseMoveDuringHover = void 0;
    this._element = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
    if (ref) {
      ref(this._element);
    }
    if (obsRef) {
      this._deriveds.push(derived((_reader) => {
        obsRef(this);
        _reader.store.add({
          dispose: () => {
            obsRef(null);
          }
        });
      }));
    }
    if (className) {
      if (hasObservable(className)) {
        this._deriveds.push(derived(this, (reader) => {
          setClassName(this._element, getClassName(className, reader));
        }));
      } else {
        setClassName(this._element, getClassName(className, void 0));
      }
    }
    for (const [key, value] of Object.entries(attributes)) {
      if (key === "style") {
        for (const [cssKey, cssValue] of Object.entries(value)) {
          const key2 = camelCaseToHyphenCase(cssKey);
          if (isObservable(cssValue)) {
            this._deriveds.push(derivedOpts({ owner: this, debugName: () => `set.style.${key2}` }, (reader) => {
              this._element.style.setProperty(key2, convertCssValue(cssValue.read(reader)));
            }));
          } else {
            this._element.style.setProperty(key2, convertCssValue(cssValue));
          }
        }
      } else if (key === "tabIndex") {
        if (isObservable(value)) {
          this._deriveds.push(derived(this, (reader) => {
            this._element.tabIndex = value.read(reader);
          }));
        } else {
          this._element.tabIndex = value;
        }
      } else if (key.startsWith("on")) {
        this._element[key] = value;
      } else {
        if (isObservable(value)) {
          this._deriveds.push(derivedOpts({ owner: this, debugName: () => `set.${key}` }, (reader) => {
            setOrRemoveAttribute(this._element, key, value.read(reader));
          }));
        } else {
          setOrRemoveAttribute(this._element, key, value);
        }
      }
    }
    if (children) {
      let getChildren2 = function(reader, children2) {
        if (isObservable(children2)) {
          return getChildren2(reader, children2.read(reader));
        }
        if (Array.isArray(children2)) {
          return children2.flatMap((c) => getChildren2(reader, c));
        }
        if (children2 instanceof ObserverNode) {
          if (reader) {
            children2.readEffect(reader);
          }
          return [children2._element];
        }
        if (children2) {
          return [children2];
        }
        return [];
      };
      var getChildren = getChildren2;
      const d = derived(this, (reader) => {
        this._element.replaceChildren(...getChildren2(reader, children));
      });
      this._deriveds.push(d);
      if (!childrenIsObservable(children)) {
        d.get();
      }
    }
  }
  readEffect(reader) {
    for (const d of this._deriveds) {
      d.read(reader);
    }
  }
  keepUpdated(store) {
    derived((reader) => {
      this.readEffect(reader);
    }).recomputeInitiallyAndOnChange(store);
    return this;
  }
  /**
   * Creates a live element that will keep the element updated as long as the returned object is not disposed.
  */
  toDisposableLiveElement() {
    const store = new DisposableStore();
    this.keepUpdated(store);
    return new LiveElement(this._element, store);
  }
  get isHovered() {
    if (!this._isHovered) {
      const hovered = observableValue("hovered", false);
      this._element.addEventListener("mouseenter", (_e) => hovered.set(true, void 0));
      this._element.addEventListener("mouseleave", (_e) => hovered.set(false, void 0));
      this._isHovered = hovered;
    }
    return this._isHovered;
  }
  get didMouseMoveDuringHover() {
    if (!this._didMouseMoveDuringHover) {
      let _hovering = false;
      const hovered = observableValue("didMouseMoveDuringHover", false);
      this._element.addEventListener("mouseenter", (_e) => {
        _hovering = true;
      });
      this._element.addEventListener("mousemove", (_e) => {
        if (_hovering) {
          hovered.set(true, void 0);
        }
      });
      this._element.addEventListener("mouseleave", (_e) => {
        _hovering = false;
        hovered.set(false, void 0);
      });
      this._didMouseMoveDuringHover = hovered;
    }
    return this._didMouseMoveDuringHover;
  }
}
function setClassName(domNode, className) {
  if (isSVGElement(domNode)) {
    domNode.setAttribute("class", className);
  } else {
    domNode.className = className;
  }
}
function resolve(value, reader, cb) {
  if (isObservable(value)) {
    cb(value.read(reader));
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) {
      resolve(v, reader, cb);
    }
    return;
  }
  cb(value);
}
function getClassName(className, reader) {
  let result = "";
  resolve(className, reader, (val) => {
    if (val) {
      if (result.length === 0) {
        result = val;
      } else {
        result += " " + val;
      }
    }
  });
  return result;
}
function hasObservable(value) {
  if (isObservable(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some((v) => hasObservable(v));
  }
  return false;
}
function convertCssValue(value) {
  if (typeof value === "number") {
    return value + "px";
  }
  return value;
}
function childrenIsObservable(children) {
  if (isObservable(children)) {
    return true;
  }
  if (Array.isArray(children)) {
    return children.some((c) => childrenIsObservable(c));
  }
  return false;
}
class LiveElement {
  constructor(element, _disposable) {
    this.element = element;
    this._disposable = _disposable;
  }
  dispose() {
    this._disposable.dispose();
  }
}
class ObserverNodeWithElement extends ObserverNode {
  get element() {
    return this._element;
  }
}
function setOrRemoveAttribute(element, key, value) {
  if (value === null || value === void 0) {
    element.removeAttribute(camelCaseToHyphenCase(key));
  } else {
    element.setAttribute(camelCaseToHyphenCase(key), String(value));
  }
}
class ConnectionObserverElement extends HTMLElement {
  disconnectedCallback() {
    this.onDidDisconnect?.();
  }
  connectedCallback() {
    this.onDidConnect?.();
  }
}
if (!customElements.get("connection-observer")) {
  customElements.define("connection-observer", ConnectionObserverElement);
}
export {
  $,
  AnimationFrameScheduler,
  ConnectionObserverElement,
  DetectedFullscreenMode,
  Dimension,
  DisposableResizeObserver,
  DragAndDropObserver,
  EventHelper,
  EventType,
  LiveElement,
  ModifierKeyEmitter,
  Namespace,
  ObserverNode,
  ObserverNodeWithElement,
  SafeTriangle,
  WindowIdleValue,
  WindowIntervalTimer,
  addDisposableGenericMouseDownListener,
  addDisposableGenericMouseMoveListener,
  addDisposableGenericMouseUpListener,
  addDisposableListener,
  addDisposableThrottledListener,
  addStandardDisposableGenericMouseDownListener,
  addStandardDisposableGenericMouseUpListener,
  addStandardDisposableListener,
  after,
  animate,
  append,
  clearNode,
  computeScreenAwareSize,
  copyAttributes,
  createLinkElement,
  createMetaElement,
  detectFullscreen,
  disposableWindowInterval,
  domContentLoaded,
  finalHandler,
  findParentWithClass,
  getActiveDocument,
  getActiveElement,
  getActiveWindow,
  getClientArea,
  getComputedStyle,
  getContentHeight,
  getContentWidth,
  getCookieValue,
  getDocument,
  getDomNodePagePosition,
  getDomNodeZoomLevel,
  getExternalFocusWindow,
  getLargestChildWidth,
  getRecentDisposableResizeObserverContextForLoopError,
  getShadowRoot,
  getTopLeftOffset,
  getTotalHeight,
  getTotalScrollWidth,
  getTotalWidth,
  getWindow,
  getWindowById,
  getWindowId,
  getWindows,
  getWindowsCount,
  h,
  hasAppFocus,
  hasExternalFocus,
  hasParentWithClass,
  hasWindow,
  hide,
  isActiveDocument,
  isActiveElement,
  isAncestor,
  isAncestorOfActiveElement,
  isAncestorUsingFlowTo,
  isDragEvent,
  isEditableElement,
  isEventLike,
  isHTMLAnchorElement,
  isHTMLButtonElement,
  isHTMLDivElement,
  isHTMLElement,
  isHTMLInputElement,
  isHTMLSpanElement,
  isHTMLTextAreaElement,
  isInShadowDOM,
  isKeyboardEvent,
  isMouseEvent,
  isPointerEvent,
  isSVGElement,
  isShadowRoot,
  join,
  measure,
  modify,
  n,
  onDidRegisterWindow,
  onDidUnregisterWindow,
  onWillUnregisterWindow,
  position,
  prepend,
  registerExternalFocusChecker,
  registerWindow,
  removeTabIndexAndUpdateFocus,
  reset,
  restoreParentsScrollTop,
  runAtThisOrScheduleAtNextAnimationFrame,
  runWhenWindowIdle,
  saveParentsScrollTop,
  scheduleAtNextAnimationFrame,
  setParentFlowTo,
  setVisibility,
  sharedMutationObserver,
  show,
  size,
  svgElem,
  trackAttributes,
  trackFocus,
  triggerDownload,
  triggerUpload,
  windowOpenNoOpener,
  windowOpenPopup,
  windowOpenWithSuccess
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFxkb20udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBicm93c2VyIGZyb20gJy4vYnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBCcm93c2VyRmVhdHVyZXMgfSBmcm9tICcuL2NhbklVc2UuanMnO1xuaW1wb3J0IHsgaGFzTW9kaWZpZXJLZXlzLCBJS2V5Ym9hcmRFdmVudCwgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IElNb3VzZUV2ZW50LCBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RJZGxlVmFsdWUsIEludGVydmFsVGltZXIsIFRpbWVvdXRUaW1lciwgX3J1bldoZW5JZGxlLCBJZGxlRGVhZGxpbmUgfSBmcm9tICcuLi9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQnVnSW5kaWNhdGluZ0Vycm9yLCBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0ICogYXMgZXZlbnQgZnJvbSAnLi4vY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVtb3RlQXV0aG9yaXRpZXMgfSBmcm9tICcuLi9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgKiBhcyBwbGF0Zm9ybSBmcm9tICcuLi9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBoYXNoIH0gZnJvbSAnLi4vY29tbW9uL2hhc2guanMnO1xuaW1wb3J0IHsgQ29kZVdpbmRvdywgZW5zdXJlQ29kZVdpbmRvdywgbWFpbldpbmRvdyB9IGZyb20gJy4vd2luZG93LmpzJztcbmltcG9ydCB7IGlzUG9pbnRXaXRoaW5UcmlhbmdsZSB9IGZyb20gJy4uL2NvbW1vbi9udW1iZXJzLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBkZXJpdmVkLCBkZXJpdmVkT3B0cywgSVJlYWRlciwgb2JzZXJ2YWJsZVZhbHVlLCBpc09ic2VydmFibGUgfSBmcm9tICcuLi9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlZ2lzdGVyZWRDb2RlV2luZG93IHtcblx0cmVhZG9ubHkgd2luZG93OiBDb2RlV2luZG93O1xuXHRyZWFkb25seSBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG4vLyMgcmVnaW9uIE11bHRpLVdpbmRvdyBTdXBwb3J0IFV0aWxpdGllc1xuXG5leHBvcnQgY29uc3Qge1xuXHRyZWdpc3RlcldpbmRvdyxcblx0Z2V0V2luZG93LFxuXHRnZXREb2N1bWVudCxcblx0Z2V0V2luZG93cyxcblx0Z2V0V2luZG93c0NvdW50LFxuXHRnZXRXaW5kb3dJZCxcblx0Z2V0V2luZG93QnlJZCxcblx0aGFzV2luZG93LFxuXHRvbkRpZFJlZ2lzdGVyV2luZG93LFxuXHRvbldpbGxVbnJlZ2lzdGVyV2luZG93LFxuXHRvbkRpZFVucmVnaXN0ZXJXaW5kb3dcbn0gPSAoZnVuY3Rpb24gKCkge1xuXHRjb25zdCB3aW5kb3dzID0gbmV3IE1hcDxudW1iZXIsIElSZWdpc3RlcmVkQ29kZVdpbmRvdz4oKTtcblxuXHRlbnN1cmVDb2RlV2luZG93KG1haW5XaW5kb3csIDEpO1xuXHRjb25zdCBtYWluV2luZG93UmVnaXN0cmF0aW9uID0geyB3aW5kb3c6IG1haW5XaW5kb3csIGRpc3Bvc2FibGVzOiBuZXcgRGlzcG9zYWJsZVN0b3JlKCkgfTtcblx0d2luZG93cy5zZXQobWFpbldpbmRvdy52c2NvZGVXaW5kb3dJZCwgbWFpbldpbmRvd1JlZ2lzdHJhdGlvbik7XG5cblx0Y29uc3Qgb25EaWRSZWdpc3RlcldpbmRvdyA9IG5ldyBldmVudC5FbWl0dGVyPElSZWdpc3RlcmVkQ29kZVdpbmRvdz4oKTtcblx0Y29uc3Qgb25EaWRVbnJlZ2lzdGVyV2luZG93ID0gbmV3IGV2ZW50LkVtaXR0ZXI8Q29kZVdpbmRvdz4oKTtcblx0Y29uc3Qgb25XaWxsVW5yZWdpc3RlcldpbmRvdyA9IG5ldyBldmVudC5FbWl0dGVyPENvZGVXaW5kb3c+KCk7XG5cblx0ZnVuY3Rpb24gZ2V0V2luZG93QnlJZCh3aW5kb3dJZDogbnVtYmVyKTogSVJlZ2lzdGVyZWRDb2RlV2luZG93IHwgdW5kZWZpbmVkO1xuXHRmdW5jdGlvbiBnZXRXaW5kb3dCeUlkKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIGZhbGxiYWNrVG9NYWluOiB0cnVlKTogSVJlZ2lzdGVyZWRDb2RlV2luZG93O1xuXHRmdW5jdGlvbiBnZXRXaW5kb3dCeUlkKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIGZhbGxiYWNrVG9NYWluPzogYm9vbGVhbik6IElSZWdpc3RlcmVkQ29kZVdpbmRvdyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdHlwZW9mIHdpbmRvd0lkID09PSAnbnVtYmVyJyA/IHdpbmRvd3MuZ2V0KHdpbmRvd0lkKSA6IHVuZGVmaW5lZDtcblxuXHRcdHJldHVybiB3aW5kb3cgPz8gKGZhbGxiYWNrVG9NYWluID8gbWFpbldpbmRvd1JlZ2lzdHJhdGlvbiA6IHVuZGVmaW5lZCk7XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdG9uRGlkUmVnaXN0ZXJXaW5kb3c6IG9uRGlkUmVnaXN0ZXJXaW5kb3cuZXZlbnQsXG5cdFx0b25XaWxsVW5yZWdpc3RlcldpbmRvdzogb25XaWxsVW5yZWdpc3RlcldpbmRvdy5ldmVudCxcblx0XHRvbkRpZFVucmVnaXN0ZXJXaW5kb3c6IG9uRGlkVW5yZWdpc3RlcldpbmRvdy5ldmVudCxcblx0XHRyZWdpc3RlcldpbmRvdyh3aW5kb3c6IENvZGVXaW5kb3cpOiBJRGlzcG9zYWJsZSB7XG5cdFx0XHRpZiAod2luZG93cy5oYXMod2luZG93LnZzY29kZVdpbmRvd0lkKSkge1xuXHRcdFx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0Y29uc3QgcmVnaXN0ZXJlZFdpbmRvdyA9IHtcblx0XHRcdFx0d2luZG93LFxuXHRcdFx0XHRkaXNwb3NhYmxlczogZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSlcblx0XHRcdH07XG5cdFx0XHR3aW5kb3dzLnNldCh3aW5kb3cudnNjb2RlV2luZG93SWQsIHJlZ2lzdGVyZWRXaW5kb3cpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0d2luZG93cy5kZWxldGUod2luZG93LnZzY29kZVdpbmRvd0lkKTtcblx0XHRcdFx0b25EaWRVbnJlZ2lzdGVyV2luZG93LmZpcmUod2luZG93KTtcblx0XHRcdH0pKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih3aW5kb3csIEV2ZW50VHlwZS5CRUZPUkVfVU5MT0FELCAoKSA9PiB7XG5cdFx0XHRcdG9uV2lsbFVucmVnaXN0ZXJXaW5kb3cuZmlyZSh3aW5kb3cpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRvbkRpZFJlZ2lzdGVyV2luZG93LmZpcmUocmVnaXN0ZXJlZFdpbmRvdyk7XG5cblx0XHRcdHJldHVybiBkaXNwb3NhYmxlcztcblx0XHR9LFxuXHRcdGdldFdpbmRvd3MoKTogSXRlcmFibGU8SVJlZ2lzdGVyZWRDb2RlV2luZG93PiB7XG5cdFx0XHRyZXR1cm4gd2luZG93cy52YWx1ZXMoKTtcblx0XHR9LFxuXHRcdGdldFdpbmRvd3NDb3VudCgpOiBudW1iZXIge1xuXHRcdFx0cmV0dXJuIHdpbmRvd3Muc2l6ZTtcblx0XHR9LFxuXHRcdGdldFdpbmRvd0lkKHRhcmdldFdpbmRvdzogV2luZG93KTogbnVtYmVyIHtcblx0XHRcdHJldHVybiAodGFyZ2V0V2luZG93IGFzIENvZGVXaW5kb3cpLnZzY29kZVdpbmRvd0lkO1xuXHRcdH0sXG5cdFx0aGFzV2luZG93KHdpbmRvd0lkOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRcdHJldHVybiB3aW5kb3dzLmhhcyh3aW5kb3dJZCk7XG5cdFx0fSxcblx0XHRnZXRXaW5kb3dCeUlkLFxuXHRcdGdldFdpbmRvdyhlOiBOb2RlIHwgVUlFdmVudCB8IHVuZGVmaW5lZCB8IG51bGwpOiBDb2RlV2luZG93IHtcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZU5vZGUgPSBlIGFzIE5vZGUgfCB1bmRlZmluZWQgfCBudWxsO1xuXHRcdFx0aWYgKGNhbmRpZGF0ZU5vZGU/Lm93bmVyRG9jdW1lbnQ/LmRlZmF1bHRWaWV3KSB7XG5cdFx0XHRcdHJldHVybiBjYW5kaWRhdGVOb2RlLm93bmVyRG9jdW1lbnQuZGVmYXVsdFZpZXcud2luZG93IGFzIENvZGVXaW5kb3c7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNhbmRpZGF0ZUV2ZW50ID0gZSBhcyBVSUV2ZW50IHwgdW5kZWZpbmVkIHwgbnVsbDtcblx0XHRcdGlmIChjYW5kaWRhdGVFdmVudD8udmlldykge1xuXHRcdFx0XHRyZXR1cm4gY2FuZGlkYXRlRXZlbnQudmlldy53aW5kb3cgYXMgQ29kZVdpbmRvdztcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIG1haW5XaW5kb3c7XG5cdFx0fSxcblx0XHRnZXREb2N1bWVudChlOiBOb2RlIHwgVUlFdmVudCB8IHVuZGVmaW5lZCB8IG51bGwpOiBEb2N1bWVudCB7XG5cdFx0XHRjb25zdCBjYW5kaWRhdGVOb2RlID0gZSBhcyBOb2RlIHwgdW5kZWZpbmVkIHwgbnVsbDtcblx0XHRcdHJldHVybiBnZXRXaW5kb3coY2FuZGlkYXRlTm9kZSkuZG9jdW1lbnQ7XG5cdFx0fVxuXHR9O1xufSkoKTtcblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBFeHRlcm5hbCBGb2N1cyBUcmFja2luZ1xuXG4vKipcbiAqIEluZm9ybWF0aW9uIGFib3V0IGV4dGVybmFsIGZvY3VzIHN0YXRlLCBpbmNsdWRpbmcgdGhlIGFzc29jaWF0ZWQgd2luZG93LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElFeHRlcm5hbEZvY3VzSW5mbyB7XG5cdHJlYWRvbmx5IGhhc0ZvY3VzOiBib29sZWFuO1xuXHRyZWFkb25seSB3aW5kb3c/OiBDb2RlV2luZG93O1xufVxuXG4vKipcbiAqIEEgZnVuY3Rpb24gdGhhdCBjaGVja3MgaWYgYSBjb21wb25lbnQgb3V0c2lkZSB0aGUgbm9ybWFsIERPTSB0cmVlIGhhcyBmb2N1cy5cbiAqIFJldHVybnMgZm9jdXMgaW5mbyBpbmNsdWRpbmcgd2hpY2ggd2luZG93IHRoZSBjb21wb25lbnQgaXMgYXNzb2NpYXRlZCB3aXRoLlxuICovXG5leHBvcnQgdHlwZSBFeHRlcm5hbEZvY3VzQ2hlY2tlciA9ICgpID0+IElFeHRlcm5hbEZvY3VzSW5mbztcblxuLyoqXG4gKiBBIHJlZ2lzdHJ5IGZvciBmdW5jdGlvbnMgdGhhdCBjaGVjayBpZiBhIGNvbXBvbmVudCBvdXRzaWRlIHRoZSBub3JtYWwgRE9NIHRyZWUgaGFzIGZvY3VzLlxuICogVGhpcyBpcyB1c2VkIHRvIGV4dGVuZCB0aGUgY29uY2VwdCBvZiBcIndpbmRvdyBoYXMgZm9jdXNcIiB0byBpbmNsdWRlIHRoaW5ncyBsaWtlXG4gKiBFbGVjdHJvbiBXZWJDb250ZW50c1ZpZXdzIChicm93c2VyIHZpZXdzKSB0aGF0IGV4aXN0IG91dHNpZGUgdGhlIHdvcmtiZW5jaCBET00uXG4gKi9cbmNvbnN0IGV4dGVybmFsRm9jdXNDaGVja2VycyA9IG5ldyBTZXQ8RXh0ZXJuYWxGb2N1c0NoZWNrZXI+KCk7XG5cbi8qKlxuICogUmVnaXN0ZXIgYSBmdW5jdGlvbiB0aGF0IGNoZWNrcyBpZiBhIGNvbXBvbmVudCBvdXRzaWRlIHRoZSBET00gaGFzIGZvY3VzLlxuICogVGhpcyBhbGxvd3MgYGhhc0V4dGVybmFsRm9jdXNgIHRvIGRldGVjdCB3aGVuIGZvY3VzIGlzIGluIGNvbXBvbmVudHMgbGlrZSBicm93c2VyIHZpZXdzLFxuICogYW5kIGBnZXRFeHRlcm5hbEZvY3VzV2luZG93YCB0byBkZXRlcm1pbmUgd2hpY2ggd2luZG93IHRoZSBmb2N1c2VkIGNvbXBvbmVudCBiZWxvbmdzIHRvLlxuICpcbiAqIEBwYXJhbSBjaGVja2VyIEEgZnVuY3Rpb24gdGhhdCByZXR1cm5zIGZvY3VzIGluZm8gZm9yIHRoZSBjb21wb25lbnRcbiAqIEByZXR1cm5zIEEgZGlzcG9zYWJsZSB0byB1bnJlZ2lzdGVyIHRoZSBjaGVja2VyXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckV4dGVybmFsRm9jdXNDaGVja2VyKGNoZWNrZXI6IEV4dGVybmFsRm9jdXNDaGVja2VyKTogSURpc3Bvc2FibGUge1xuXHRleHRlcm5hbEZvY3VzQ2hlY2tlcnMuYWRkKGNoZWNrZXIpO1xuXG5cdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdGV4dGVybmFsRm9jdXNDaGVja2Vycy5kZWxldGUoY2hlY2tlcik7XG5cdH0pO1xufVxuXG4vKipcbiAqIENoZWNrIGlmIGFueSByZWdpc3RlcmVkIGV4dGVybmFsIGNvbXBvbmVudCBoYXMgZm9jdXMuXG4gKiBUaGlzIGlzIHVzZWQgdG8gZXh0ZW5kIGZvY3VzIGRldGVjdGlvbiBiZXlvbmQgdGhlIG5vcm1hbCBET00gdG8gaW5jbHVkZVxuICogY29tcG9uZW50cyBsaWtlIEVsZWN0cm9uIFdlYkNvbnRlbnRzVmlld3MuXG4gKlxuICogQHJldHVybnMgdHJ1ZSBpZiBhbnkgcmVnaXN0ZXJlZCBleHRlcm5hbCBjb21wb25lbnQgaGFzIGZvY3VzXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoYXNFeHRlcm5hbEZvY3VzKCk6IGJvb2xlYW4ge1xuXHRmb3IgKGNvbnN0IGNoZWNrZXIgb2YgZXh0ZXJuYWxGb2N1c0NoZWNrZXJzKSB7XG5cdFx0aWYgKGNoZWNrZXIoKS5oYXNGb2N1cykge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBmYWxzZTtcbn1cblxuLyoqXG4gKiBHZXQgdGhlIHdpbmRvdyBhc3NvY2lhdGVkIHdpdGggYSBmb2N1c2VkIGV4dGVybmFsIGNvbXBvbmVudC5cbiAqIFRoaXMgaXMgdXNlZCB0byBkZXRlcm1pbmUgd2hpY2ggd2luZG93IHNob3VsZCByZWNlaXZlIFVJIGxpa2UgZGlhbG9nc1xuICogd2hlbiBhbiBleHRlcm5hbCBjb21wb25lbnQgKGxpa2UgYSBicm93c2VyIHZpZXcpIGhhcyBmb2N1cy5cbiAqXG4gKiBAcmV0dXJucyBUaGUgd2luZG93IG9mIHRoZSBmb2N1c2VkIGV4dGVybmFsIGNvbXBvbmVudCwgb3IgdW5kZWZpbmVkIGlmIG5vbmVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEV4dGVybmFsRm9jdXNXaW5kb3coKTogQ29kZVdpbmRvdyB8IHVuZGVmaW5lZCB7XG5cdGZvciAoY29uc3QgY2hlY2tlciBvZiBleHRlcm5hbEZvY3VzQ2hlY2tlcnMpIHtcblx0XHRjb25zdCBpbmZvID0gY2hlY2tlcigpO1xuXHRcdGlmIChpbmZvLmhhc0ZvY3VzICYmIGluZm8ud2luZG93KSB7XG5cdFx0XHRyZXR1cm4gaW5mby53aW5kb3c7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogQ2hlY2sgaWYgdGhlIGFwcGxpY2F0aW9uIGhhcyBmb2N1cyBpbiBhbnkgd2luZG93LCBlaXRoZXIgdmlhIHRoZSBub3JtYWwgRE9NIG9yIHZpYSBhblxuICogZXh0ZXJuYWwgY29tcG9uZW50IGxpa2UgYSBicm93c2VyIHZpZXcgKHdoaWNoIGV4aXN0cyBvdXRzaWRlIHRoZSBkb2N1bWVudCB0cmVlKS5cbiAqXG4gKiBAcmV0dXJucyB0cnVlIGlmIHRoZSBhcHBsaWNhdGlvbiBvd25zIHRoZSBjdXJyZW50IGZvY3VzXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoYXNBcHBGb2N1cygpOiBib29sZWFuIHtcblx0Zm9yIChjb25zdCB7IHdpbmRvdyB9IG9mIGdldFdpbmRvd3MoKSkge1xuXHRcdGlmICh3aW5kb3cuZG9jdW1lbnQuaGFzRm9jdXMoKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9XG5cdGlmIChoYXNFeHRlcm5hbEZvY3VzKCkpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbi8vI2VuZHJlZ2lvblxuXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJOb2RlKG5vZGU6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdHdoaWxlIChub2RlLmZpcnN0Q2hpbGQpIHtcblx0XHRub2RlLmZpcnN0Q2hpbGQucmVtb3ZlKCk7XG5cdH1cbn1cblxuY2xhc3MgRG9tTGlzdGVuZXIgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBfaGFuZGxlcjogKGU6IGFueSkgPT4gdm9pZDtcblx0cHJpdmF0ZSBfbm9kZTogRXZlbnRUYXJnZXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3R5cGU6IHN0cmluZztcblx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogYm9vbGVhbiB8IEFkZEV2ZW50TGlzdGVuZXJPcHRpb25zO1xuXG5cdGNvbnN0cnVjdG9yKG5vZGU6IEV2ZW50VGFyZ2V0LCB0eXBlOiBzdHJpbmcsIGhhbmRsZXI6IChlOiBhbnkpID0+IHZvaWQsIG9wdGlvbnM/OiBib29sZWFuIHwgQWRkRXZlbnRMaXN0ZW5lck9wdGlvbnMpIHtcblx0XHR0aGlzLl9ub2RlID0gbm9kZTtcblx0XHR0aGlzLl90eXBlID0gdHlwZTtcblx0XHR0aGlzLl9oYW5kbGVyID0gaGFuZGxlcjtcblx0XHR0aGlzLl9vcHRpb25zID0gKG9wdGlvbnMgfHwgZmFsc2UpO1xuXHRcdHRoaXMuX25vZGUuYWRkRXZlbnRMaXN0ZW5lcih0aGlzLl90eXBlLCB0aGlzLl9oYW5kbGVyLCB0aGlzLl9vcHRpb25zKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9oYW5kbGVyKSB7XG5cdFx0XHQvLyBBbHJlYWR5IGRpc3Bvc2VkXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fbm9kZS5yZW1vdmVFdmVudExpc3RlbmVyKHRoaXMuX3R5cGUsIHRoaXMuX2hhbmRsZXIsIHRoaXMuX29wdGlvbnMpO1xuXG5cdFx0Ly8gUHJldmVudCBsZWFrZXJzIGZyb20gaG9sZGluZyBvbiB0byB0aGUgZG9tIG9yIGhhbmRsZXIgZnVuY1xuXHRcdHRoaXMuX25vZGUgPSBudWxsITtcblx0XHR0aGlzLl9oYW5kbGVyID0gbnVsbCE7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZERpc3Bvc2FibGVMaXN0ZW5lcjxLIGV4dGVuZHMga2V5b2YgR2xvYmFsRXZlbnRIYW5kbGVyc0V2ZW50TWFwPihub2RlOiBFdmVudFRhcmdldCwgdHlwZTogSywgaGFuZGxlcjogKGV2ZW50OiBHbG9iYWxFdmVudEhhbmRsZXJzRXZlbnRNYXBbS10pID0+IHZvaWQsIHVzZUNhcHR1cmU/OiBib29sZWFuKTogSURpc3Bvc2FibGU7XG5leHBvcnQgZnVuY3Rpb24gYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG5vZGU6IEV2ZW50VGFyZ2V0LCB0eXBlOiBzdHJpbmcsIGhhbmRsZXI6IChldmVudDogYW55KSA9PiB2b2lkLCB1c2VDYXB0dXJlPzogYm9vbGVhbik6IElEaXNwb3NhYmxlO1xuZXhwb3J0IGZ1bmN0aW9uIGFkZERpc3Bvc2FibGVMaXN0ZW5lcihub2RlOiBFdmVudFRhcmdldCwgdHlwZTogc3RyaW5nLCBoYW5kbGVyOiAoZXZlbnQ6IGFueSkgPT4gdm9pZCwgb3B0aW9uczogQWRkRXZlbnRMaXN0ZW5lck9wdGlvbnMpOiBJRGlzcG9zYWJsZTtcbmV4cG9ydCBmdW5jdGlvbiBhZGREaXNwb3NhYmxlTGlzdGVuZXIobm9kZTogRXZlbnRUYXJnZXQsIHR5cGU6IHN0cmluZywgaGFuZGxlcjogKGV2ZW50OiBhbnkpID0+IHZvaWQsIHVzZUNhcHR1cmVPck9wdGlvbnM/OiBib29sZWFuIHwgQWRkRXZlbnRMaXN0ZW5lck9wdGlvbnMpOiBJRGlzcG9zYWJsZSB7XG5cdHJldHVybiBuZXcgRG9tTGlzdGVuZXIobm9kZSwgdHlwZSwgaGFuZGxlciwgdXNlQ2FwdHVyZU9yT3B0aW9ucyk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyU2lnbmF0dXJlIHtcblx0KG5vZGU6IEhUTUxFbGVtZW50IHwgRWxlbWVudCB8IERvY3VtZW50LCB0eXBlOiAnY2xpY2snLCBoYW5kbGVyOiAoZXZlbnQ6IElNb3VzZUV2ZW50KSA9PiB2b2lkLCB1c2VDYXB0dXJlPzogYm9vbGVhbik6IElEaXNwb3NhYmxlO1xuXHQobm9kZTogSFRNTEVsZW1lbnQgfCBFbGVtZW50IHwgRG9jdW1lbnQsIHR5cGU6ICdtb3VzZWRvd24nLCBoYW5kbGVyOiAoZXZlbnQ6IElNb3VzZUV2ZW50KSA9PiB2b2lkLCB1c2VDYXB0dXJlPzogYm9vbGVhbik6IElEaXNwb3NhYmxlO1xuXHQobm9kZTogSFRNTEVsZW1lbnQgfCBFbGVtZW50IHwgRG9jdW1lbnQsIHR5cGU6ICdrZXlkb3duJywgaGFuZGxlcjogKGV2ZW50OiBJS2V5Ym9hcmRFdmVudCkgPT4gdm9pZCwgdXNlQ2FwdHVyZT86IGJvb2xlYW4pOiBJRGlzcG9zYWJsZTtcblx0KG5vZGU6IEhUTUxFbGVtZW50IHwgRWxlbWVudCB8IERvY3VtZW50LCB0eXBlOiAna2V5cHJlc3MnLCBoYW5kbGVyOiAoZXZlbnQ6IElLZXlib2FyZEV2ZW50KSA9PiB2b2lkLCB1c2VDYXB0dXJlPzogYm9vbGVhbik6IElEaXNwb3NhYmxlO1xuXHQobm9kZTogSFRNTEVsZW1lbnQgfCBFbGVtZW50IHwgRG9jdW1lbnQsIHR5cGU6ICdrZXl1cCcsIGhhbmRsZXI6IChldmVudDogSUtleWJvYXJkRXZlbnQpID0+IHZvaWQsIHVzZUNhcHR1cmU/OiBib29sZWFuKTogSURpc3Bvc2FibGU7XG5cdChub2RlOiBIVE1MRWxlbWVudCB8IEVsZW1lbnQgfCBEb2N1bWVudCwgdHlwZTogJ3BvaW50ZXJkb3duJywgaGFuZGxlcjogKGV2ZW50OiBQb2ludGVyRXZlbnQpID0+IHZvaWQsIHVzZUNhcHR1cmU/OiBib29sZWFuKTogSURpc3Bvc2FibGU7XG5cdChub2RlOiBIVE1MRWxlbWVudCB8IEVsZW1lbnQgfCBEb2N1bWVudCwgdHlwZTogJ3BvaW50ZXJtb3ZlJywgaGFuZGxlcjogKGV2ZW50OiBQb2ludGVyRXZlbnQpID0+IHZvaWQsIHVzZUNhcHR1cmU/OiBib29sZWFuKTogSURpc3Bvc2FibGU7XG5cdChub2RlOiBIVE1MRWxlbWVudCB8IEVsZW1lbnQgfCBEb2N1bWVudCwgdHlwZTogJ3BvaW50ZXJ1cCcsIGhhbmRsZXI6IChldmVudDogUG9pbnRlckV2ZW50KSA9PiB2b2lkLCB1c2VDYXB0dXJlPzogYm9vbGVhbik6IElEaXNwb3NhYmxlO1xuXHQobm9kZTogSFRNTEVsZW1lbnQgfCBFbGVtZW50IHwgRG9jdW1lbnQsIHR5cGU6IHN0cmluZywgaGFuZGxlcjogKGV2ZW50OiBhbnkpID0+IHZvaWQsIHVzZUNhcHR1cmU/OiBib29sZWFuKTogSURpc3Bvc2FibGU7XG59XG5mdW5jdGlvbiBfd3JhcEFzU3RhbmRhcmRNb3VzZUV2ZW50KHRhcmdldFdpbmRvdzogV2luZG93LCBoYW5kbGVyOiAoZTogSU1vdXNlRXZlbnQpID0+IHZvaWQpOiAoZTogTW91c2VFdmVudCkgPT4gdm9pZCB7XG5cdHJldHVybiBmdW5jdGlvbiAoZTogTW91c2VFdmVudCkge1xuXHRcdHJldHVybiBoYW5kbGVyKG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQodGFyZ2V0V2luZG93LCBlKSk7XG5cdH07XG59XG5mdW5jdGlvbiBfd3JhcEFzU3RhbmRhcmRLZXlib2FyZEV2ZW50KGhhbmRsZXI6IChlOiBJS2V5Ym9hcmRFdmVudCkgPT4gdm9pZCk6IChlOiBLZXlib2FyZEV2ZW50KSA9PiB2b2lkIHtcblx0cmV0dXJuIGZ1bmN0aW9uIChlOiBLZXlib2FyZEV2ZW50KSB7XG5cdFx0cmV0dXJuIGhhbmRsZXIobmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKSk7XG5cdH07XG59XG5leHBvcnQgY29uc3QgYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXI6IElBZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lclNpZ25hdHVyZSA9IGZ1bmN0aW9uIGFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKG5vZGU6IEhUTUxFbGVtZW50IHwgRWxlbWVudCB8IERvY3VtZW50LCB0eXBlOiBzdHJpbmcsIGhhbmRsZXI6IChldmVudDogYW55KSA9PiB2b2lkLCB1c2VDYXB0dXJlPzogYm9vbGVhbik6IElEaXNwb3NhYmxlIHtcblx0bGV0IHdyYXBIYW5kbGVyID0gaGFuZGxlcjtcblxuXHRpZiAodHlwZSA9PT0gJ2NsaWNrJyB8fCB0eXBlID09PSAnbW91c2Vkb3duJyB8fCB0eXBlID09PSAnY29udGV4dG1lbnUnKSB7XG5cdFx0d3JhcEhhbmRsZXIgPSBfd3JhcEFzU3RhbmRhcmRNb3VzZUV2ZW50KGdldFdpbmRvdyhub2RlKSwgaGFuZGxlcik7XG5cdH0gZWxzZSBpZiAodHlwZSA9PT0gJ2tleWRvd24nIHx8IHR5cGUgPT09ICdrZXlwcmVzcycgfHwgdHlwZSA9PT0gJ2tleXVwJykge1xuXHRcdHdyYXBIYW5kbGVyID0gX3dyYXBBc1N0YW5kYXJkS2V5Ym9hcmRFdmVudChoYW5kbGVyKTtcblx0fVxuXG5cdHJldHVybiBhZGREaXNwb3NhYmxlTGlzdGVuZXIobm9kZSwgdHlwZSwgd3JhcEhhbmRsZXIsIHVzZUNhcHR1cmUpO1xufTtcblxuZXhwb3J0IGNvbnN0IGFkZFN0YW5kYXJkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZURvd25MaXN0ZW5lciA9IGZ1bmN0aW9uIGFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKG5vZGU6IEhUTUxFbGVtZW50LCBoYW5kbGVyOiAoZXZlbnQ6IGFueSkgPT4gdm9pZCwgdXNlQ2FwdHVyZT86IGJvb2xlYW4pOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IHdyYXBIYW5kbGVyID0gX3dyYXBBc1N0YW5kYXJkTW91c2VFdmVudChnZXRXaW5kb3cobm9kZSksIGhhbmRsZXIpO1xuXG5cdHJldHVybiBhZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlRG93bkxpc3RlbmVyKG5vZGUsIHdyYXBIYW5kbGVyLCB1c2VDYXB0dXJlKTtcbn07XG5cbmV4cG9ydCBjb25zdCBhZGRTdGFuZGFyZERpc3Bvc2FibGVHZW5lcmljTW91c2VVcExpc3RlbmVyID0gZnVuY3Rpb24gYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIobm9kZTogSFRNTEVsZW1lbnQsIGhhbmRsZXI6IChldmVudDogYW55KSA9PiB2b2lkLCB1c2VDYXB0dXJlPzogYm9vbGVhbik6IElEaXNwb3NhYmxlIHtcblx0Y29uc3Qgd3JhcEhhbmRsZXIgPSBfd3JhcEFzU3RhbmRhcmRNb3VzZUV2ZW50KGdldFdpbmRvdyhub2RlKSwgaGFuZGxlcik7XG5cblx0cmV0dXJuIGFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VVcExpc3RlbmVyKG5vZGUsIHdyYXBIYW5kbGVyLCB1c2VDYXB0dXJlKTtcbn07XG5leHBvcnQgZnVuY3Rpb24gYWRkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZURvd25MaXN0ZW5lcihub2RlOiBFdmVudFRhcmdldCwgaGFuZGxlcjogKGV2ZW50OiBhbnkpID0+IHZvaWQsIHVzZUNhcHR1cmU/OiBib29sZWFuKTogSURpc3Bvc2FibGUge1xuXHRyZXR1cm4gYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG5vZGUsIHBsYXRmb3JtLmlzSU9TICYmIEJyb3dzZXJGZWF0dXJlcy5wb2ludGVyRXZlbnRzID8gRXZlbnRUeXBlLlBPSU5URVJfRE9XTiA6IEV2ZW50VHlwZS5NT1VTRV9ET1dOLCBoYW5kbGVyLCB1c2VDYXB0dXJlKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VNb3ZlTGlzdGVuZXIobm9kZTogRXZlbnRUYXJnZXQsIGhhbmRsZXI6IChldmVudDogYW55KSA9PiB2b2lkLCB1c2VDYXB0dXJlPzogYm9vbGVhbik6IElEaXNwb3NhYmxlIHtcblx0cmV0dXJuIGFkZERpc3Bvc2FibGVMaXN0ZW5lcihub2RlLCBwbGF0Zm9ybS5pc0lPUyAmJiBCcm93c2VyRmVhdHVyZXMucG9pbnRlckV2ZW50cyA/IEV2ZW50VHlwZS5QT0lOVEVSX01PVkUgOiBFdmVudFR5cGUuTU9VU0VfTU9WRSwgaGFuZGxlciwgdXNlQ2FwdHVyZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlVXBMaXN0ZW5lcihub2RlOiBFdmVudFRhcmdldCwgaGFuZGxlcjogKGV2ZW50OiBhbnkpID0+IHZvaWQsIHVzZUNhcHR1cmU/OiBib29sZWFuKTogSURpc3Bvc2FibGUge1xuXHRyZXR1cm4gYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG5vZGUsIHBsYXRmb3JtLmlzSU9TICYmIEJyb3dzZXJGZWF0dXJlcy5wb2ludGVyRXZlbnRzID8gRXZlbnRUeXBlLlBPSU5URVJfVVAgOiBFdmVudFR5cGUuTU9VU0VfVVAsIGhhbmRsZXIsIHVzZUNhcHR1cmUpO1xufVxuXG4vKipcbiAqIEV4ZWN1dGUgdGhlIGNhbGxiYWNrIHRoZSBuZXh0IHRpbWUgdGhlIGJyb3dzZXIgaXMgaWRsZSwgcmV0dXJuaW5nIGFuXG4gKiB7QGxpbmsgSURpc3Bvc2FibGV9IHRoYXQgd2lsbCBjYW5jZWwgdGhlIGNhbGxiYWNrIHdoZW4gZGlzcG9zZWQuIFRoaXMgd3JhcHNcbiAqIFtyZXF1ZXN0SWRsZUNhbGxiYWNrXSBzbyBpdCB3aWxsIGZhbGxiYWNrIHRvIFtzZXRUaW1lb3V0XSBpZiB0aGUgZW52aXJvbm1lbnRcbiAqIGRvZXNuJ3Qgc3VwcG9ydCBpdC5cbiAqXG4gKiBAcGFyYW0gdGFyZ2V0V2luZG93IFRoZSB3aW5kb3cgZm9yIHdoaWNoIHRvIHJ1biB0aGUgaWRsZSBjYWxsYmFja1xuICogQHBhcmFtIGNhbGxiYWNrIFRoZSBjYWxsYmFjayB0byBydW4gd2hlbiBpZGxlLCB0aGlzIGluY2x1ZGVzIGFuXG4gKiBbSWRsZURlYWRsaW5lXSB0aGF0IHByb3ZpZGVzIHRoZSB0aW1lIGFsbG90ZWQgZm9yIHRoZSBpZGxlIGNhbGxiYWNrIGJ5IHRoZVxuICogYnJvd3Nlci4gTm90IHJlc3BlY3RpbmcgdGhpcyBkZWFkbGluZSB3aWxsIHJlc3VsdCBpbiBhIGRlZ3JhZGVkIHVzZXJcbiAqIGV4cGVyaWVuY2UuXG4gKiBAcGFyYW0gdGltZW91dCBBIHRpbWVvdXQgYXQgd2hpY2ggcG9pbnQgdG8gcXVldWUgbm8gbG9uZ2VyIHdhaXQgZm9yIGFuIGlkbGVcbiAqIGNhbGxiYWNrIGJ1dCBxdWV1ZSBpdCBvbiB0aGUgcmVndWxhciBldmVudCBsb29wIChsaWtlIHNldFRpbWVvdXQpLiBUeXBpY2FsbHlcbiAqIHRoaXMgc2hvdWxkIG5vdCBiZSB1c2VkLlxuICpcbiAqIFtJZGxlRGVhZGxpbmVdOiBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvSWRsZURlYWRsaW5lXG4gKiBbcmVxdWVzdElkbGVDYWxsYmFja106IGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9XaW5kb3cvcmVxdWVzdElkbGVDYWxsYmFja1xuICogW3NldFRpbWVvdXRdOiBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvV2luZG93L3NldFRpbWVvdXRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJ1bldoZW5XaW5kb3dJZGxlKHRhcmdldFdpbmRvdzogV2luZG93IHwgdHlwZW9mIGdsb2JhbFRoaXMsIGNhbGxiYWNrOiAoaWRsZTogSWRsZURlYWRsaW5lKSA9PiB2b2lkLCB0aW1lb3V0PzogbnVtYmVyKTogSURpc3Bvc2FibGUge1xuXHRyZXR1cm4gX3J1bldoZW5JZGxlKHRhcmdldFdpbmRvdywgY2FsbGJhY2ssIHRpbWVvdXQpO1xufVxuXG4vKipcbiAqIEFuIGltcGxlbWVudGF0aW9uIG9mIHRoZSBcImlkbGUtdW50aWwtdXJnZW50XCItc3RyYXRlZ3kgYXMgaW50cm9kdWNlZFxuICogaGVyZTogaHR0cHM6Ly9waGlsaXB3YWx0b24uY29tL2FydGljbGVzL2lkbGUtdW50aWwtdXJnZW50L1xuICovXG5leHBvcnQgY2xhc3MgV2luZG93SWRsZVZhbHVlPFQ+IGV4dGVuZHMgQWJzdHJhY3RJZGxlVmFsdWU8VD4ge1xuXHRjb25zdHJ1Y3Rvcih0YXJnZXRXaW5kb3c6IFdpbmRvdyB8IHR5cGVvZiBnbG9iYWxUaGlzLCBleGVjdXRvcjogKCkgPT4gVCkge1xuXHRcdHN1cGVyKHRhcmdldFdpbmRvdywgZXhlY3V0b3IpO1xuXHR9XG59XG5cbi8qKlxuICogU2NoZWR1bGUgYSBjYWxsYmFjayB0byBiZSBydW4gYXQgdGhlIG5leHQgYW5pbWF0aW9uIGZyYW1lLlxuICogVGhpcyBhbGxvd3MgbXVsdGlwbGUgcGFydGllcyB0byByZWdpc3RlciBjYWxsYmFja3MgdGhhdCBzaG91bGQgcnVuIGF0IHRoZSBuZXh0IGFuaW1hdGlvbiBmcmFtZS5cbiAqIElmIGN1cnJlbnRseSBpbiBhbiBhbmltYXRpb24gZnJhbWUsIGBydW5uZXJgIHdpbGwgYmUgZXhlY3V0ZWQgaW1tZWRpYXRlbHkuXG4gKiBAcmV0dXJuIHRva2VuIHRoYXQgY2FuIGJlIHVzZWQgdG8gY2FuY2VsIHRoZSBzY2hlZHVsZWQgcnVubmVyIChvbmx5IGlmIGBydW5uZXJgIHdhcyBub3QgZXhlY3V0ZWQgaW1tZWRpYXRlbHkpLlxuICovXG5leHBvcnQgbGV0IHJ1bkF0VGhpc09yU2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZTogKHRhcmdldFdpbmRvdzogV2luZG93LCBydW5uZXI6ICgpID0+IHZvaWQsIHByaW9yaXR5PzogbnVtYmVyKSA9PiBJRGlzcG9zYWJsZTtcbi8qKlxuICogU2NoZWR1bGUgYSBjYWxsYmFjayB0byBiZSBydW4gYXQgdGhlIG5leHQgYW5pbWF0aW9uIGZyYW1lLlxuICogVGhpcyBhbGxvd3MgbXVsdGlwbGUgcGFydGllcyB0byByZWdpc3RlciBjYWxsYmFja3MgdGhhdCBzaG91bGQgcnVuIGF0IHRoZSBuZXh0IGFuaW1hdGlvbiBmcmFtZS5cbiAqIElmIGN1cnJlbnRseSBpbiBhbiBhbmltYXRpb24gZnJhbWUsIGBydW5uZXJgIHdpbGwgYmUgZXhlY3V0ZWQgYXQgdGhlIG5leHQgYW5pbWF0aW9uIGZyYW1lLlxuICogQHJldHVybiB0b2tlbiB0aGF0IGNhbiBiZSB1c2VkIHRvIGNhbmNlbCB0aGUgc2NoZWR1bGVkIHJ1bm5lci5cbiAqL1xuZXhwb3J0IGxldCBzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lOiAodGFyZ2V0V2luZG93OiBXaW5kb3csIHJ1bm5lcjogKCkgPT4gdm9pZCwgcHJpb3JpdHk/OiBudW1iZXIpID0+IElEaXNwb3NhYmxlO1xuXG5leHBvcnQgZnVuY3Rpb24gZGlzcG9zYWJsZVdpbmRvd0ludGVydmFsKHRhcmdldFdpbmRvdzogV2luZG93LCBoYW5kbGVyOiAoKSA9PiB2b2lkIHwgYm9vbGVhbiAvKiBzdG9wIGludGVydmFsICovIHwgUHJvbWlzZTx1bmtub3duPiwgaW50ZXJ2YWw6IG51bWJlciwgaXRlcmF0aW9ucz86IG51bWJlcik6IElEaXNwb3NhYmxlIHtcblx0bGV0IGl0ZXJhdGlvbiA9IDA7XG5cdGNvbnN0IHRpbWVyID0gdGFyZ2V0V2luZG93LnNldEludGVydmFsKCgpID0+IHtcblx0XHRpdGVyYXRpb24rKztcblx0XHRpZiAoKHR5cGVvZiBpdGVyYXRpb25zID09PSAnbnVtYmVyJyAmJiBpdGVyYXRpb24gPj0gaXRlcmF0aW9ucykgfHwgaGFuZGxlcigpID09PSB0cnVlKSB7XG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0sIGludGVydmFsKTtcblx0Y29uc3QgZGlzcG9zYWJsZSA9IHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0dGFyZ2V0V2luZG93LmNsZWFySW50ZXJ2YWwodGltZXIpO1xuXHR9KTtcblx0cmV0dXJuIGRpc3Bvc2FibGU7XG59XG5cbmV4cG9ydCBjbGFzcyBXaW5kb3dJbnRlcnZhbFRpbWVyIGV4dGVuZHMgSW50ZXJ2YWxUaW1lciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkZWZhdWx0VGFyZ2V0PzogV2luZG93ICYgdHlwZW9mIGdsb2JhbFRoaXM7XG5cblx0LyoqXG5cdCAqXG5cdCAqIEBwYXJhbSBub2RlIFRoZSBvcHRpb25hbCBub2RlIGZyb20gd2hpY2ggdGhlIHRhcmdldCB3aW5kb3cgaXMgZGV0ZXJtaW5lZFxuXHQgKi9cblx0Y29uc3RydWN0b3Iobm9kZT86IE5vZGUpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuZGVmYXVsdFRhcmdldCA9IG5vZGUgJiYgZ2V0V2luZG93KG5vZGUpO1xuXHR9XG5cblx0b3ZlcnJpZGUgY2FuY2VsQW5kU2V0KHJ1bm5lcjogKCkgPT4gdm9pZCwgaW50ZXJ2YWw6IG51bWJlciwgdGFyZ2V0V2luZG93PzogV2luZG93ICYgdHlwZW9mIGdsb2JhbFRoaXMpOiB2b2lkIHtcblx0XHRyZXR1cm4gc3VwZXIuY2FuY2VsQW5kU2V0KHJ1bm5lciwgaW50ZXJ2YWwsIHRhcmdldFdpbmRvdyA/PyB0aGlzLmRlZmF1bHRUYXJnZXQpO1xuXHR9XG59XG5cbmNsYXNzIEFuaW1hdGlvbkZyYW1lUXVldWVJdGVtIGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgX3J1bm5lcjogKCkgPT4gdm9pZDtcblx0cHVibGljIHByaW9yaXR5OiBudW1iZXI7XG5cdHByaXZhdGUgX2NhbmNlbGVkOiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKHJ1bm5lcjogKCkgPT4gdm9pZCwgcHJpb3JpdHk6IG51bWJlciA9IDApIHtcblx0XHR0aGlzLl9ydW5uZXIgPSBydW5uZXI7XG5cdFx0dGhpcy5wcmlvcml0eSA9IHByaW9yaXR5O1xuXHRcdHRoaXMuX2NhbmNlbGVkID0gZmFsc2U7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NhbmNlbGVkID0gdHJ1ZTtcblx0fVxuXG5cdGV4ZWN1dGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NhbmNlbGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX3J1bm5lcigpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGUpO1xuXHRcdH1cblx0fVxuXG5cdC8vIFNvcnQgYnkgcHJpb3JpdHkgKGxhcmdlc3QgdG8gbG93ZXN0KVxuXHRzdGF0aWMgc29ydChhOiBBbmltYXRpb25GcmFtZVF1ZXVlSXRlbSwgYjogQW5pbWF0aW9uRnJhbWVRdWV1ZUl0ZW0pOiBudW1iZXIge1xuXHRcdHJldHVybiBiLnByaW9yaXR5IC0gYS5wcmlvcml0eTtcblx0fVxufVxuXG4oZnVuY3Rpb24gKCkge1xuXHQvKipcblx0ICogVGhlIHJ1bm5lcnMgc2NoZWR1bGVkIGF0IHRoZSBuZXh0IGFuaW1hdGlvbiBmcmFtZVxuXHQgKi9cblx0Y29uc3QgTkVYVF9RVUVVRSA9IG5ldyBNYXA8bnVtYmVyIC8qIHdpbmRvdyBJRCAqLywgQW5pbWF0aW9uRnJhbWVRdWV1ZUl0ZW1bXT4oKTtcblx0LyoqXG5cdCAqIFRoZSBydW5uZXJzIHNjaGVkdWxlZCBhdCB0aGUgY3VycmVudCBhbmltYXRpb24gZnJhbWVcblx0ICovXG5cdGNvbnN0IENVUlJFTlRfUVVFVUUgPSBuZXcgTWFwPG51bWJlciAvKiB3aW5kb3cgSUQgKi8sIEFuaW1hdGlvbkZyYW1lUXVldWVJdGVtW10+KCk7XG5cdC8qKlxuXHQgKiBBIGZsYWcgdG8ga2VlcCB0cmFjayBpZiB0aGUgbmF0aXZlIHJlcXVlc3RBbmltYXRpb25GcmFtZSB3YXMgYWxyZWFkeSBjYWxsZWRcblx0ICovXG5cdGNvbnN0IGFuaW1GcmFtZVJlcXVlc3RlZCA9IG5ldyBNYXA8bnVtYmVyIC8qIHdpbmRvdyBJRCAqLywgYm9vbGVhbj4oKTtcblx0LyoqXG5cdCAqIEEgZmxhZyB0byBpbmRpY2F0ZSBpZiBjdXJyZW50bHkgaGFuZGxpbmcgYSBuYXRpdmUgcmVxdWVzdEFuaW1hdGlvbkZyYW1lIGNhbGxiYWNrXG5cdCAqL1xuXHRjb25zdCBpbkFuaW1hdGlvbkZyYW1lUnVubmVyID0gbmV3IE1hcDxudW1iZXIgLyogd2luZG93IElEICovLCBib29sZWFuPigpO1xuXG5cdGNvbnN0IGFuaW1hdGlvbkZyYW1lUnVubmVyID0gKHRhcmdldFdpbmRvd0lkOiBudW1iZXIpID0+IHtcblx0XHRhbmltRnJhbWVSZXF1ZXN0ZWQuc2V0KHRhcmdldFdpbmRvd0lkLCBmYWxzZSk7XG5cblx0XHRjb25zdCBjdXJyZW50UXVldWUgPSBORVhUX1FVRVVFLmdldCh0YXJnZXRXaW5kb3dJZCkgPz8gW107XG5cdFx0Q1VSUkVOVF9RVUVVRS5zZXQodGFyZ2V0V2luZG93SWQsIGN1cnJlbnRRdWV1ZSk7XG5cdFx0TkVYVF9RVUVVRS5zZXQodGFyZ2V0V2luZG93SWQsIFtdKTtcblxuXHRcdGluQW5pbWF0aW9uRnJhbWVSdW5uZXIuc2V0KHRhcmdldFdpbmRvd0lkLCB0cnVlKTtcblx0XHR3aGlsZSAoY3VycmVudFF1ZXVlLmxlbmd0aCA+IDApIHtcblx0XHRcdGN1cnJlbnRRdWV1ZS5zb3J0KEFuaW1hdGlvbkZyYW1lUXVldWVJdGVtLnNvcnQpO1xuXHRcdFx0Y29uc3QgdG9wID0gY3VycmVudFF1ZXVlLnNoaWZ0KCkhO1xuXHRcdFx0dG9wLmV4ZWN1dGUoKTtcblx0XHR9XG5cdFx0aW5BbmltYXRpb25GcmFtZVJ1bm5lci5zZXQodGFyZ2V0V2luZG93SWQsIGZhbHNlKTtcblx0fTtcblxuXHRzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lID0gKHRhcmdldFdpbmRvdzogV2luZG93LCBydW5uZXI6ICgpID0+IHZvaWQsIHByaW9yaXR5OiBudW1iZXIgPSAwKSA9PiB7XG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93SWQgPSBnZXRXaW5kb3dJZCh0YXJnZXRXaW5kb3cpO1xuXHRcdGNvbnN0IGl0ZW0gPSBuZXcgQW5pbWF0aW9uRnJhbWVRdWV1ZUl0ZW0ocnVubmVyLCBwcmlvcml0eSk7XG5cblx0XHRsZXQgbmV4dFF1ZXVlID0gTkVYVF9RVUVVRS5nZXQodGFyZ2V0V2luZG93SWQpO1xuXHRcdGlmICghbmV4dFF1ZXVlKSB7XG5cdFx0XHRuZXh0UXVldWUgPSBbXTtcblx0XHRcdE5FWFRfUVVFVUUuc2V0KHRhcmdldFdpbmRvd0lkLCBuZXh0UXVldWUpO1xuXHRcdH1cblx0XHRuZXh0UXVldWUucHVzaChpdGVtKTtcblxuXHRcdGlmICghYW5pbUZyYW1lUmVxdWVzdGVkLmdldCh0YXJnZXRXaW5kb3dJZCkpIHtcblx0XHRcdGFuaW1GcmFtZVJlcXVlc3RlZC5zZXQodGFyZ2V0V2luZG93SWQsIHRydWUpO1xuXHRcdFx0dGFyZ2V0V2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiBhbmltYXRpb25GcmFtZVJ1bm5lcih0YXJnZXRXaW5kb3dJZCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBpdGVtO1xuXHR9O1xuXG5cdHJ1bkF0VGhpc09yU2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZSA9ICh0YXJnZXRXaW5kb3c6IFdpbmRvdywgcnVubmVyOiAoKSA9PiB2b2lkLCBwcmlvcml0eT86IG51bWJlcikgPT4ge1xuXHRcdGNvbnN0IHRhcmdldFdpbmRvd0lkID0gZ2V0V2luZG93SWQodGFyZ2V0V2luZG93KTtcblx0XHRpZiAoaW5BbmltYXRpb25GcmFtZVJ1bm5lci5nZXQodGFyZ2V0V2luZG93SWQpKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gbmV3IEFuaW1hdGlvbkZyYW1lUXVldWVJdGVtKHJ1bm5lciwgcHJpb3JpdHkpO1xuXHRcdFx0bGV0IGN1cnJlbnRRdWV1ZSA9IENVUlJFTlRfUVVFVUUuZ2V0KHRhcmdldFdpbmRvd0lkKTtcblx0XHRcdGlmICghY3VycmVudFF1ZXVlKSB7XG5cdFx0XHRcdGN1cnJlbnRRdWV1ZSA9IFtdO1xuXHRcdFx0XHRDVVJSRU5UX1FVRVVFLnNldCh0YXJnZXRXaW5kb3dJZCwgY3VycmVudFF1ZXVlKTtcblx0XHRcdH1cblx0XHRcdGN1cnJlbnRRdWV1ZS5wdXNoKGl0ZW0pO1xuXHRcdFx0cmV0dXJuIGl0ZW07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKHRhcmdldFdpbmRvdywgcnVubmVyLCBwcmlvcml0eSk7XG5cdFx0fVxuXHR9O1xufSkoKTtcblxuZXhwb3J0IGZ1bmN0aW9uIG1lYXN1cmUodGFyZ2V0V2luZG93OiBXaW5kb3csIGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogSURpc3Bvc2FibGUge1xuXHRyZXR1cm4gc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZSh0YXJnZXRXaW5kb3csIGNhbGxiYWNrLCAxMDAwMCAvKiBtdXN0IGJlIGVhcmx5ICovKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vZGlmeSh0YXJnZXRXaW5kb3c6IFdpbmRvdywgY2FsbGJhY2s6ICgpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdHJldHVybiBzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKHRhcmdldFdpbmRvdywgY2FsbGJhY2ssIC0xMDAwMCAvKiBtdXN0IGJlIGxhdGUgKi8pO1xufVxuXG4vKipcbiAqIEEgc2NoZWR1bGVyIHRoYXQgY29hbGVzY2VzIG11bHRpcGxlIGBzY2hlZHVsZSgpYCBjYWxscyBpbnRvIGEgc2luZ2xlIGNhbGxiYWNrXG4gKiBhdCB0aGUgbmV4dCBhbmltYXRpb24gZnJhbWUuIFNpbWlsYXIgdG8gYFJ1bk9uY2VTY2hlZHVsZXJgIGJ1dCB1c2VzIGFuaW1hdGlvbiBmcmFtZXNcbiAqIGluc3RlYWQgb2YgdGltZW91dHMuXG4gKi9cbmV4cG9ydCBjbGFzcyBBbmltYXRpb25GcmFtZVNjaGVkdWxlciBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHJ1bm5lcjogKCkgPT4gdm9pZDtcblx0cHJpdmF0ZSByZWFkb25seSBub2RlOiBOb2RlO1xuXHRwcml2YXRlIHJlYWRvbmx5IHBlbmRpbmdSdW5uZXIgPSBuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCk7XG5cblx0Y29uc3RydWN0b3Iobm9kZTogTm9kZSwgcnVubmVyOiAoKSA9PiB2b2lkKSB7XG5cdFx0dGhpcy5ub2RlID0gbm9kZTtcblx0XHR0aGlzLnJ1bm5lciA9IHJ1bm5lcjtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5wZW5kaW5nUnVubmVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDYW5jZWwgdGhlIGN1cnJlbnRseSBzY2hlZHVsZWQgcnVubmVyIChpZiBhbnkpLlxuXHQgKi9cblx0Y2FuY2VsKCk6IHZvaWQge1xuXHRcdHRoaXMucGVuZGluZ1J1bm5lci5jbGVhcigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNjaGVkdWxlIHRoZSBydW5uZXIgdG8gZXhlY3V0ZSBhdCB0aGUgbmV4dCBhbmltYXRpb24gZnJhbWUuXG5cdCAqIElmIGFscmVhZHkgc2NoZWR1bGVkLCB0aGlzIGlzIGEgbm8tb3AgKHRoZSBleGlzdGluZyBzY2hlZHVsZSBpcyBrZXB0KS5cblx0ICogSWYgY3VycmVudGx5IGluIGFuIGFuaW1hdGlvbiBmcmFtZSwgdGhlIHJ1bm5lciB3aWxsIGV4ZWN1dGUgaW1tZWRpYXRlbHkuXG5cdCAqL1xuXHRzY2hlZHVsZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5wZW5kaW5nUnVubmVyLnZhbHVlKSB7XG5cdFx0XHRyZXR1cm47IC8vIEFscmVhZHkgc2NoZWR1bGVkXG5cdFx0fVxuXG5cdFx0dGhpcy5wZW5kaW5nUnVubmVyLnZhbHVlID0gcnVuQXRUaGlzT3JTY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGdldFdpbmRvdyh0aGlzLm5vZGUpLCAoKSA9PiB7XG5cdFx0XHR0aGlzLnBlbmRpbmdSdW5uZXIuY2xlYXIoKTtcblx0XHRcdHRoaXMucnVubmVyKCk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIGlmIGEgcnVubmVyIGlzIHNjaGVkdWxlZC5cblx0ICovXG5cdGlzU2NoZWR1bGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnBlbmRpbmdSdW5uZXIudmFsdWUgIT09IHVuZGVmaW5lZDtcblx0fVxufVxuXG4vKipcbiAqIEFkZCBhIHRocm90dGxlZCBsaXN0ZW5lci4gYGhhbmRsZXJgIGlzIGZpcmVkIGF0IG1vc3QgZXZlcnkgOC4zMzMzM21zIG9yIHdpdGggdGhlIG5leHQgYW5pbWF0aW9uIGZyYW1lIChpZiBicm93c2VyIHN1cHBvcnRzIGl0KS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJRXZlbnRNZXJnZXI8UiwgRT4ge1xuXHQobGFzdEV2ZW50OiBSIHwgbnVsbCwgY3VycmVudEV2ZW50OiBFKTogUjtcbn1cblxuY29uc3QgTUlOSU1VTV9USU1FX01TID0gODtcbmZ1bmN0aW9uIERFRkFVTFRfRVZFTlRfTUVSR0VSPFQ+KF9sYXN0RXZlbnQ6IHVua25vd24sIGN1cnJlbnRFdmVudDogVCkge1xuXHRyZXR1cm4gY3VycmVudEV2ZW50O1xufVxuXG5jbGFzcyBUaW1lb3V0VGhyb3R0bGVkRG9tTGlzdGVuZXI8UiwgRSBleHRlbmRzIEV2ZW50PiBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdGNvbnN0cnVjdG9yKG5vZGU6IE5vZGUsIHR5cGU6IHN0cmluZywgaGFuZGxlcjogKGV2ZW50OiBSKSA9PiB2b2lkLCBldmVudE1lcmdlcjogSUV2ZW50TWVyZ2VyPFIsIEU+ID0gREVGQVVMVF9FVkVOVF9NRVJHRVIgYXMgSUV2ZW50TWVyZ2VyPFIsIEU+LCBtaW5pbXVtVGltZU1zOiBudW1iZXIgPSBNSU5JTVVNX1RJTUVfTVMpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0bGV0IGxhc3RFdmVudDogUiB8IG51bGwgPSBudWxsO1xuXHRcdGxldCBsYXN0SGFuZGxlclRpbWUgPSAwO1xuXHRcdGNvbnN0IHRpbWVvdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGltZW91dFRpbWVyKCkpO1xuXG5cdFx0Y29uc3QgaW52b2tlSGFuZGxlciA9ICgpID0+IHtcblx0XHRcdGxhc3RIYW5kbGVyVGltZSA9IChuZXcgRGF0ZSgpKS5nZXRUaW1lKCk7XG5cdFx0XHRoYW5kbGVyKDxSPmxhc3RFdmVudCk7XG5cdFx0XHRsYXN0RXZlbnQgPSBudWxsO1xuXHRcdH07XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIobm9kZSwgdHlwZSwgKGUpID0+IHtcblxuXHRcdFx0bGFzdEV2ZW50ID0gZXZlbnRNZXJnZXIobGFzdEV2ZW50LCBlKTtcblx0XHRcdGNvbnN0IGVsYXBzZWRUaW1lID0gKG5ldyBEYXRlKCkpLmdldFRpbWUoKSAtIGxhc3RIYW5kbGVyVGltZTtcblxuXHRcdFx0aWYgKGVsYXBzZWRUaW1lID49IG1pbmltdW1UaW1lTXMpIHtcblx0XHRcdFx0dGltZW91dC5jYW5jZWwoKTtcblx0XHRcdFx0aW52b2tlSGFuZGxlcigpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGltZW91dC5zZXRJZk5vdFNldChpbnZva2VIYW5kbGVyLCBtaW5pbXVtVGltZU1zIC0gZWxhcHNlZFRpbWUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkRGlzcG9zYWJsZVRocm90dGxlZExpc3RlbmVyPFIsIEUgZXh0ZW5kcyBFdmVudCA9IEV2ZW50Pihub2RlOiBhbnksIHR5cGU6IHN0cmluZywgaGFuZGxlcjogKGV2ZW50OiBSKSA9PiB2b2lkLCBldmVudE1lcmdlcj86IElFdmVudE1lcmdlcjxSLCBFPiwgbWluaW11bVRpbWVNcz86IG51bWJlcik6IElEaXNwb3NhYmxlIHtcblx0cmV0dXJuIG5ldyBUaW1lb3V0VGhyb3R0bGVkRG9tTGlzdGVuZXI8UiwgRT4obm9kZSwgdHlwZSwgaGFuZGxlciwgZXZlbnRNZXJnZXIsIG1pbmltdW1UaW1lTXMpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29tcHV0ZWRTdHlsZShlbDogSFRNTEVsZW1lbnQpOiBDU1NTdHlsZURlY2xhcmF0aW9uIHtcblx0cmV0dXJuIGdldFdpbmRvdyhlbCkuZ2V0Q29tcHV0ZWRTdHlsZShlbCwgbnVsbCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDbGllbnRBcmVhKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBkZWZhdWx0VmFsdWU/OiBEaW1lbnNpb24sIGZhbGxiYWNrRWxlbWVudD86IEhUTUxFbGVtZW50KTogRGltZW5zaW9uIHtcblx0Y29uc3QgZWxXaW5kb3cgPSBnZXRXaW5kb3coZWxlbWVudCk7XG5cdGNvbnN0IGVsRG9jdW1lbnQgPSBlbFdpbmRvdy5kb2N1bWVudDtcblxuXHQvLyBUcnkgd2l0aCBET00gY2xpZW50V2lkdGggLyBjbGllbnRIZWlnaHRcblx0aWYgKGVsZW1lbnQgIT09IGVsRG9jdW1lbnQuYm9keSkge1xuXHRcdHJldHVybiBuZXcgRGltZW5zaW9uKGVsZW1lbnQuY2xpZW50V2lkdGgsIGVsZW1lbnQuY2xpZW50SGVpZ2h0KTtcblx0fVxuXG5cdC8vIElmIHZpc3VhbCB2aWV3IHBvcnQgZXhpdHMgYW5kIGl0J3Mgb24gbW9iaWxlLCBpdCBzaG91bGQgYmUgdXNlZCBpbnN0ZWFkIG9mIHdpbmRvdyBpbm5lcldpZHRoIC8gaW5uZXJIZWlnaHQsIG9yIGRvY3VtZW50LmJvZHkuY2xpZW50V2lkdGggLyBkb2N1bWVudC5ib2R5LmNsaWVudEhlaWdodFxuXHRpZiAocGxhdGZvcm0uaXNJT1MgJiYgZWxXaW5kb3c/LnZpc3VhbFZpZXdwb3J0KSB7XG5cdFx0cmV0dXJuIG5ldyBEaW1lbnNpb24oZWxXaW5kb3cudmlzdWFsVmlld3BvcnQud2lkdGgsIGVsV2luZG93LnZpc3VhbFZpZXdwb3J0LmhlaWdodCk7XG5cdH1cblxuXHQvLyBUcnkgaW5uZXJXaWR0aCAvIGlubmVySGVpZ2h0XG5cdGlmIChlbFdpbmRvdz8uaW5uZXJXaWR0aCAmJiBlbFdpbmRvdy5pbm5lckhlaWdodCkge1xuXHRcdHJldHVybiBuZXcgRGltZW5zaW9uKGVsV2luZG93LmlubmVyV2lkdGgsIGVsV2luZG93LmlubmVySGVpZ2h0KTtcblx0fVxuXG5cdC8vIFRyeSB3aXRoIGRvY3VtZW50LmJvZHkuY2xpZW50V2lkdGggLyBkb2N1bWVudC5ib2R5LmNsaWVudEhlaWdodFxuXHRpZiAoZWxEb2N1bWVudC5ib2R5ICYmIGVsRG9jdW1lbnQuYm9keS5jbGllbnRXaWR0aCAmJiBlbERvY3VtZW50LmJvZHkuY2xpZW50SGVpZ2h0KSB7XG5cdFx0cmV0dXJuIG5ldyBEaW1lbnNpb24oZWxEb2N1bWVudC5ib2R5LmNsaWVudFdpZHRoLCBlbERvY3VtZW50LmJvZHkuY2xpZW50SGVpZ2h0KTtcblx0fVxuXG5cdC8vIFRyeSB3aXRoIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5jbGllbnRXaWR0aCAvIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5jbGllbnRIZWlnaHRcblx0aWYgKGVsRG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50ICYmIGVsRG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsaWVudFdpZHRoICYmIGVsRG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsaWVudEhlaWdodCkge1xuXHRcdHJldHVybiBuZXcgRGltZW5zaW9uKGVsRG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsaWVudFdpZHRoLCBlbERvY3VtZW50LmRvY3VtZW50RWxlbWVudC5jbGllbnRIZWlnaHQpO1xuXHR9XG5cblx0aWYgKGZhbGxiYWNrRWxlbWVudCkge1xuXHRcdHJldHVybiBnZXRDbGllbnRBcmVhKGZhbGxiYWNrRWxlbWVudCwgZGVmYXVsdFZhbHVlKTtcblx0fVxuXG5cdGlmIChkZWZhdWx0VmFsdWUpIHtcblx0XHRyZXR1cm4gZGVmYXVsdFZhbHVlO1xuXHR9XG5cblx0dGhyb3cgbmV3IEVycm9yKCdVbmFibGUgdG8gZmlndXJlIG91dCBicm93c2VyIHdpZHRoIGFuZCBoZWlnaHQnKTtcbn1cblxuY2xhc3MgU2l6ZVV0aWxzIHtcblx0Ly8gQWRhcHRlZCBmcm9tIFdpbkpTXG5cdC8vIENvbnZlcnRzIGEgQ1NTIHBvc2l0aW9uaW5nIHN0cmluZyBmb3IgdGhlIHNwZWNpZmllZCBlbGVtZW50IHRvIHBpeGVscy5cblx0cHJpdmF0ZSBzdGF0aWMgY29udmVydFRvUGl4ZWxzKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCB2YWx1ZTogc3RyaW5nKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gcGFyc2VGbG9hdCh2YWx1ZSkgfHwgMDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIGdldERpbWVuc2lvbihlbGVtZW50OiBIVE1MRWxlbWVudCwgY3NzUHJvcGVydHlOYW1lOiBzdHJpbmcpOiBudW1iZXIge1xuXHRcdGNvbnN0IGNvbXB1dGVkU3R5bGUgPSBnZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpO1xuXHRcdGNvbnN0IHZhbHVlID0gY29tcHV0ZWRTdHlsZSA/IGNvbXB1dGVkU3R5bGUuZ2V0UHJvcGVydHlWYWx1ZShjc3NQcm9wZXJ0eU5hbWUpIDogJzAnO1xuXHRcdHJldHVybiBTaXplVXRpbHMuY29udmVydFRvUGl4ZWxzKGVsZW1lbnQsIHZhbHVlKTtcblx0fVxuXG5cdHN0YXRpYyBnZXRCb3JkZXJMZWZ0V2lkdGgoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBudW1iZXIge1xuXHRcdHJldHVybiBTaXplVXRpbHMuZ2V0RGltZW5zaW9uKGVsZW1lbnQsICdib3JkZXItbGVmdC13aWR0aCcpO1xuXHR9XG5cdHN0YXRpYyBnZXRCb3JkZXJSaWdodFdpZHRoKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogbnVtYmVyIHtcblx0XHRyZXR1cm4gU2l6ZVV0aWxzLmdldERpbWVuc2lvbihlbGVtZW50LCAnYm9yZGVyLXJpZ2h0LXdpZHRoJyk7XG5cdH1cblx0c3RhdGljIGdldEJvcmRlclRvcFdpZHRoKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogbnVtYmVyIHtcblx0XHRyZXR1cm4gU2l6ZVV0aWxzLmdldERpbWVuc2lvbihlbGVtZW50LCAnYm9yZGVyLXRvcC13aWR0aCcpO1xuXHR9XG5cdHN0YXRpYyBnZXRCb3JkZXJCb3R0b21XaWR0aChlbGVtZW50OiBIVE1MRWxlbWVudCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIFNpemVVdGlscy5nZXREaW1lbnNpb24oZWxlbWVudCwgJ2JvcmRlci1ib3R0b20td2lkdGgnKTtcblx0fVxuXG5cdHN0YXRpYyBnZXRQYWRkaW5nTGVmdChlbGVtZW50OiBIVE1MRWxlbWVudCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIFNpemVVdGlscy5nZXREaW1lbnNpb24oZWxlbWVudCwgJ3BhZGRpbmctbGVmdCcpO1xuXHR9XG5cdHN0YXRpYyBnZXRQYWRkaW5nUmlnaHQoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBudW1iZXIge1xuXHRcdHJldHVybiBTaXplVXRpbHMuZ2V0RGltZW5zaW9uKGVsZW1lbnQsICdwYWRkaW5nLXJpZ2h0Jyk7XG5cdH1cblx0c3RhdGljIGdldFBhZGRpbmdUb3AoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBudW1iZXIge1xuXHRcdHJldHVybiBTaXplVXRpbHMuZ2V0RGltZW5zaW9uKGVsZW1lbnQsICdwYWRkaW5nLXRvcCcpO1xuXHR9XG5cdHN0YXRpYyBnZXRQYWRkaW5nQm90dG9tKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogbnVtYmVyIHtcblx0XHRyZXR1cm4gU2l6ZVV0aWxzLmdldERpbWVuc2lvbihlbGVtZW50LCAncGFkZGluZy1ib3R0b20nKTtcblx0fVxuXG5cdHN0YXRpYyBnZXRNYXJnaW5MZWZ0KGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogbnVtYmVyIHtcblx0XHRyZXR1cm4gU2l6ZVV0aWxzLmdldERpbWVuc2lvbihlbGVtZW50LCAnbWFyZ2luLWxlZnQnKTtcblx0fVxuXHRzdGF0aWMgZ2V0TWFyZ2luVG9wKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogbnVtYmVyIHtcblx0XHRyZXR1cm4gU2l6ZVV0aWxzLmdldERpbWVuc2lvbihlbGVtZW50LCAnbWFyZ2luLXRvcCcpO1xuXHR9XG5cdHN0YXRpYyBnZXRNYXJnaW5SaWdodChlbGVtZW50OiBIVE1MRWxlbWVudCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIFNpemVVdGlscy5nZXREaW1lbnNpb24oZWxlbWVudCwgJ21hcmdpbi1yaWdodCcpO1xuXHR9XG5cdHN0YXRpYyBnZXRNYXJnaW5Cb3R0b20oZWxlbWVudDogSFRNTEVsZW1lbnQpOiBudW1iZXIge1xuXHRcdHJldHVybiBTaXplVXRpbHMuZ2V0RGltZW5zaW9uKGVsZW1lbnQsICdtYXJnaW4tYm90dG9tJyk7XG5cdH1cbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gUG9zaXRpb24gJiBEaW1lbnNpb25cblxuZXhwb3J0IGludGVyZmFjZSBJRGltZW5zaW9uIHtcblx0cmVhZG9ubHkgd2lkdGg6IG51bWJlcjtcblx0cmVhZG9ubHkgaGVpZ2h0OiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBEaW1lbnNpb24gaW1wbGVtZW50cyBJRGltZW5zaW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgTm9uZSA9IG5ldyBEaW1lbnNpb24oMCwgMCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgd2lkdGg6IG51bWJlcixcblx0XHRyZWFkb25seSBoZWlnaHQ6IG51bWJlcixcblx0KSB7IH1cblxuXHR3aXRoKHdpZHRoOiBudW1iZXIgPSB0aGlzLndpZHRoLCBoZWlnaHQ6IG51bWJlciA9IHRoaXMuaGVpZ2h0KTogRGltZW5zaW9uIHtcblx0XHRpZiAod2lkdGggIT09IHRoaXMud2lkdGggfHwgaGVpZ2h0ICE9PSB0aGlzLmhlaWdodCkge1xuXHRcdFx0cmV0dXJuIG5ldyBEaW1lbnNpb24od2lkdGgsIGhlaWdodCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblx0fVxuXG5cdHN0YXRpYyBpcyhvYmo6IHVua25vd24pOiBvYmogaXMgSURpbWVuc2lvbiB7XG5cdFx0cmV0dXJuIHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmIHR5cGVvZiAoPElEaW1lbnNpb24+b2JqKS5oZWlnaHQgPT09ICdudW1iZXInICYmIHR5cGVvZiAoPElEaW1lbnNpb24+b2JqKS53aWR0aCA9PT0gJ251bWJlcic7XG5cdH1cblxuXHRzdGF0aWMgbGlmdChvYmo6IElEaW1lbnNpb24pOiBEaW1lbnNpb24ge1xuXHRcdGlmIChvYmogaW5zdGFuY2VvZiBEaW1lbnNpb24pIHtcblx0XHRcdHJldHVybiBvYmo7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBuZXcgRGltZW5zaW9uKG9iai53aWR0aCwgb2JqLmhlaWdodCk7XG5cdFx0fVxuXHR9XG5cblx0c3RhdGljIGVxdWFscyhhOiBEaW1lbnNpb24gfCB1bmRlZmluZWQsIGI6IERpbWVuc2lvbiB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGlmIChhID09PSBiKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKCFhIHx8ICFiKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBhLndpZHRoID09PSBiLndpZHRoICYmIGEuaGVpZ2h0ID09PSBiLmhlaWdodDtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEb21Qb3NpdGlvbiB7XG5cdHJlYWRvbmx5IGxlZnQ6IG51bWJlcjtcblx0cmVhZG9ubHkgdG9wOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUb3BMZWZ0T2Zmc2V0KGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogSURvbVBvc2l0aW9uIHtcblx0Ly8gQWRhcHRlZCBmcm9tIFdpbkpTLlV0aWxpdGllcy5nZXRQb3NpdGlvblxuXHQvLyBhbmQgYWRkZWQgYm9yZGVycyB0byB0aGUgbWl4XG5cblx0bGV0IG9mZnNldFBhcmVudCA9IGVsZW1lbnQub2Zmc2V0UGFyZW50O1xuXHRsZXQgdG9wID0gZWxlbWVudC5vZmZzZXRUb3A7XG5cdGxldCBsZWZ0ID0gZWxlbWVudC5vZmZzZXRMZWZ0O1xuXG5cdHdoaWxlIChcblx0XHQoZWxlbWVudCA9IDxIVE1MRWxlbWVudD5lbGVtZW50LnBhcmVudE5vZGUpICE9PSBudWxsXG5cdFx0JiYgZWxlbWVudCAhPT0gZWxlbWVudC5vd25lckRvY3VtZW50LmJvZHlcblx0XHQmJiBlbGVtZW50ICE9PSBlbGVtZW50Lm93bmVyRG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50XG5cdCkge1xuXHRcdHRvcCAtPSBlbGVtZW50LnNjcm9sbFRvcDtcblx0XHRjb25zdCBjID0gaXNTaGFkb3dSb290KGVsZW1lbnQpID8gbnVsbCA6IGdldENvbXB1dGVkU3R5bGUoZWxlbWVudCk7XG5cdFx0aWYgKGMpIHtcblx0XHRcdGxlZnQgLT0gYy5kaXJlY3Rpb24gIT09ICdydGwnID8gZWxlbWVudC5zY3JvbGxMZWZ0IDogLWVsZW1lbnQuc2Nyb2xsTGVmdDtcblx0XHR9XG5cblx0XHRpZiAoZWxlbWVudCA9PT0gb2Zmc2V0UGFyZW50KSB7XG5cdFx0XHRsZWZ0ICs9IFNpemVVdGlscy5nZXRCb3JkZXJMZWZ0V2lkdGgoZWxlbWVudCk7XG5cdFx0XHR0b3AgKz0gU2l6ZVV0aWxzLmdldEJvcmRlclRvcFdpZHRoKGVsZW1lbnQpO1xuXHRcdFx0dG9wICs9IGVsZW1lbnQub2Zmc2V0VG9wO1xuXHRcdFx0bGVmdCArPSBlbGVtZW50Lm9mZnNldExlZnQ7XG5cdFx0XHRvZmZzZXRQYXJlbnQgPSBlbGVtZW50Lm9mZnNldFBhcmVudDtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdGxlZnQ6IGxlZnQsXG5cdFx0dG9wOiB0b3Bcblx0fTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRG9tTm9kZVBhZ2VQb3NpdGlvbiB7XG5cdGxlZnQ6IG51bWJlcjtcblx0dG9wOiBudW1iZXI7XG5cdHdpZHRoOiBudW1iZXI7XG5cdGhlaWdodDogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2l6ZShlbGVtZW50OiBIVE1MRWxlbWVudCwgd2lkdGg6IG51bWJlciB8IG51bGwsIGhlaWdodDogbnVtYmVyIHwgbnVsbCk6IHZvaWQge1xuXHRpZiAodHlwZW9mIHdpZHRoID09PSAnbnVtYmVyJykge1xuXHRcdGVsZW1lbnQuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG5cdH1cblxuXHRpZiAodHlwZW9mIGhlaWdodCA9PT0gJ251bWJlcicpIHtcblx0XHRlbGVtZW50LnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBvc2l0aW9uKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCB0b3A6IG51bWJlciwgcmlnaHQ/OiBudW1iZXIsIGJvdHRvbT86IG51bWJlciwgbGVmdD86IG51bWJlciwgcG9zaXRpb246IHN0cmluZyA9ICdhYnNvbHV0ZScpOiB2b2lkIHtcblx0aWYgKHR5cGVvZiB0b3AgPT09ICdudW1iZXInKSB7XG5cdFx0ZWxlbWVudC5zdHlsZS50b3AgPSBgJHt0b3B9cHhgO1xuXHR9XG5cblx0aWYgKHR5cGVvZiByaWdodCA9PT0gJ251bWJlcicpIHtcblx0XHRlbGVtZW50LnN0eWxlLnJpZ2h0ID0gYCR7cmlnaHR9cHhgO1xuXHR9XG5cblx0aWYgKHR5cGVvZiBib3R0b20gPT09ICdudW1iZXInKSB7XG5cdFx0ZWxlbWVudC5zdHlsZS5ib3R0b20gPSBgJHtib3R0b219cHhgO1xuXHR9XG5cblx0aWYgKHR5cGVvZiBsZWZ0ID09PSAnbnVtYmVyJykge1xuXHRcdGVsZW1lbnQuc3R5bGUubGVmdCA9IGAke2xlZnR9cHhgO1xuXHR9XG5cblx0ZWxlbWVudC5zdHlsZS5wb3NpdGlvbiA9IHBvc2l0aW9uO1xufVxuXG4vKipcbiAqIFJldHVybnMgdGhlIHBvc2l0aW9uIG9mIGEgZG9tIG5vZGUgcmVsYXRpdmUgdG8gdGhlIGVudGlyZSBwYWdlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbihkb21Ob2RlOiBIVE1MRWxlbWVudCk6IElEb21Ob2RlUGFnZVBvc2l0aW9uIHtcblx0Y29uc3QgYmIgPSBkb21Ob2RlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRjb25zdCB3aW5kb3cgPSBnZXRXaW5kb3coZG9tTm9kZSk7XG5cdHJldHVybiB7XG5cdFx0bGVmdDogYmIubGVmdCArIHdpbmRvdy5zY3JvbGxYLFxuXHRcdHRvcDogYmIudG9wICsgd2luZG93LnNjcm9sbFksXG5cdFx0d2lkdGg6IGJiLndpZHRoLFxuXHRcdGhlaWdodDogYmIuaGVpZ2h0XG5cdH07XG59XG5cbi8qKlxuICogUmV0dXJucyB0aGUgZWZmZWN0aXZlIHpvb20gb24gYSBnaXZlbiBlbGVtZW50IGJlZm9yZSB3aW5kb3cgem9vbSBsZXZlbCBpcyBhcHBsaWVkXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXREb21Ob2RlWm9vbUxldmVsKGRvbU5vZGU6IEhUTUxFbGVtZW50KTogbnVtYmVyIHtcblx0bGV0IHRlc3RFbGVtZW50OiBIVE1MRWxlbWVudCB8IG51bGwgPSBkb21Ob2RlO1xuXHRsZXQgem9vbSA9IDEuMDtcblx0ZG8ge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbnN0IGVsZW1lbnRab29tTGV2ZWwgPSAoZ2V0Q29tcHV0ZWRTdHlsZSh0ZXN0RWxlbWVudCkgYXMgYW55KS56b29tO1xuXHRcdGlmIChlbGVtZW50Wm9vbUxldmVsICE9PSBudWxsICYmIGVsZW1lbnRab29tTGV2ZWwgIT09IHVuZGVmaW5lZCAmJiBlbGVtZW50Wm9vbUxldmVsICE9PSAnMScpIHtcblx0XHRcdHpvb20gKj0gZWxlbWVudFpvb21MZXZlbDtcblx0XHR9XG5cblx0XHR0ZXN0RWxlbWVudCA9IHRlc3RFbGVtZW50LnBhcmVudEVsZW1lbnQ7XG5cdH0gd2hpbGUgKHRlc3RFbGVtZW50ICE9PSBudWxsICYmIHRlc3RFbGVtZW50ICE9PSB0ZXN0RWxlbWVudC5vd25lckRvY3VtZW50LmRvY3VtZW50RWxlbWVudCk7XG5cblx0cmV0dXJuIHpvb207XG59XG5cblxuLy8gQWRhcHRlZCBmcm9tIFdpbkpTXG4vLyBHZXRzIHRoZSB3aWR0aCBvZiB0aGUgZWxlbWVudCwgaW5jbHVkaW5nIG1hcmdpbnMuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VG90YWxXaWR0aChlbGVtZW50OiBIVE1MRWxlbWVudCk6IG51bWJlciB7XG5cdGNvbnN0IG1hcmdpbiA9IFNpemVVdGlscy5nZXRNYXJnaW5MZWZ0KGVsZW1lbnQpICsgU2l6ZVV0aWxzLmdldE1hcmdpblJpZ2h0KGVsZW1lbnQpO1xuXHRyZXR1cm4gZWxlbWVudC5vZmZzZXRXaWR0aCArIG1hcmdpbjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENvbnRlbnRXaWR0aChlbGVtZW50OiBIVE1MRWxlbWVudCk6IG51bWJlciB7XG5cdGNvbnN0IGJvcmRlciA9IFNpemVVdGlscy5nZXRCb3JkZXJMZWZ0V2lkdGgoZWxlbWVudCkgKyBTaXplVXRpbHMuZ2V0Qm9yZGVyUmlnaHRXaWR0aChlbGVtZW50KTtcblx0Y29uc3QgcGFkZGluZyA9IFNpemVVdGlscy5nZXRQYWRkaW5nTGVmdChlbGVtZW50KSArIFNpemVVdGlscy5nZXRQYWRkaW5nUmlnaHQoZWxlbWVudCk7XG5cdHJldHVybiBlbGVtZW50Lm9mZnNldFdpZHRoIC0gYm9yZGVyIC0gcGFkZGluZztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFRvdGFsU2Nyb2xsV2lkdGgoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBudW1iZXIge1xuXHRjb25zdCBtYXJnaW4gPSBTaXplVXRpbHMuZ2V0TWFyZ2luTGVmdChlbGVtZW50KSArIFNpemVVdGlscy5nZXRNYXJnaW5SaWdodChlbGVtZW50KTtcblx0cmV0dXJuIGVsZW1lbnQuc2Nyb2xsV2lkdGggKyBtYXJnaW47XG59XG5cbi8vIEFkYXB0ZWQgZnJvbSBXaW5KU1xuLy8gR2V0cyB0aGUgaGVpZ2h0IG9mIHRoZSBjb250ZW50IG9mIHRoZSBzcGVjaWZpZWQgZWxlbWVudC4gVGhlIGNvbnRlbnQgaGVpZ2h0IGRvZXMgbm90IGluY2x1ZGUgYm9yZGVycyBvciBwYWRkaW5nLlxuZXhwb3J0IGZ1bmN0aW9uIGdldENvbnRlbnRIZWlnaHQoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBudW1iZXIge1xuXHRjb25zdCBib3JkZXIgPSBTaXplVXRpbHMuZ2V0Qm9yZGVyVG9wV2lkdGgoZWxlbWVudCkgKyBTaXplVXRpbHMuZ2V0Qm9yZGVyQm90dG9tV2lkdGgoZWxlbWVudCk7XG5cdGNvbnN0IHBhZGRpbmcgPSBTaXplVXRpbHMuZ2V0UGFkZGluZ1RvcChlbGVtZW50KSArIFNpemVVdGlscy5nZXRQYWRkaW5nQm90dG9tKGVsZW1lbnQpO1xuXHRyZXR1cm4gZWxlbWVudC5vZmZzZXRIZWlnaHQgLSBib3JkZXIgLSBwYWRkaW5nO1xufVxuXG4vLyBBZGFwdGVkIGZyb20gV2luSlNcbi8vIEdldHMgdGhlIGhlaWdodCBvZiB0aGUgZWxlbWVudCwgaW5jbHVkaW5nIGl0cyBtYXJnaW5zLlxuZXhwb3J0IGZ1bmN0aW9uIGdldFRvdGFsSGVpZ2h0KGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogbnVtYmVyIHtcblx0Y29uc3QgbWFyZ2luID0gU2l6ZVV0aWxzLmdldE1hcmdpblRvcChlbGVtZW50KSArIFNpemVVdGlscy5nZXRNYXJnaW5Cb3R0b20oZWxlbWVudCk7XG5cdHJldHVybiBlbGVtZW50Lm9mZnNldEhlaWdodCArIG1hcmdpbjtcbn1cblxuLy8gR2V0cyB0aGUgbGVmdCBjb29yZGluYXRlIG9mIHRoZSBzcGVjaWZpZWQgZWxlbWVudCByZWxhdGl2ZSB0byB0aGUgc3BlY2lmaWVkIHBhcmVudC5cbmZ1bmN0aW9uIGdldFJlbGF0aXZlTGVmdChlbGVtZW50OiBIVE1MRWxlbWVudCwgcGFyZW50OiBIVE1MRWxlbWVudCk6IG51bWJlciB7XG5cdGlmIChlbGVtZW50ID09PSBudWxsKSB7XG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRjb25zdCBlbGVtZW50UG9zaXRpb24gPSBnZXRUb3BMZWZ0T2Zmc2V0KGVsZW1lbnQpO1xuXHRjb25zdCBwYXJlbnRQb3NpdGlvbiA9IGdldFRvcExlZnRPZmZzZXQocGFyZW50KTtcblx0cmV0dXJuIGVsZW1lbnRQb3NpdGlvbi5sZWZ0IC0gcGFyZW50UG9zaXRpb24ubGVmdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldExhcmdlc3RDaGlsZFdpZHRoKHBhcmVudDogSFRNTEVsZW1lbnQsIGNoaWxkcmVuOiBIVE1MRWxlbWVudFtdKTogbnVtYmVyIHtcblx0Y29uc3QgY2hpbGRXaWR0aHMgPSBjaGlsZHJlbi5tYXAoKGNoaWxkKSA9PiB7XG5cdFx0cmV0dXJuIE1hdGgubWF4KGdldFRvdGFsU2Nyb2xsV2lkdGgoY2hpbGQpLCBnZXRUb3RhbFdpZHRoKGNoaWxkKSkgKyBnZXRSZWxhdGl2ZUxlZnQoY2hpbGQsIHBhcmVudCkgfHwgMDtcblx0fSk7XG5cdGNvbnN0IG1heFdpZHRoID0gTWF0aC5tYXgoLi4uY2hpbGRXaWR0aHMpO1xuXHRyZXR1cm4gbWF4V2lkdGg7XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQW5jZXN0b3IodGVzdENoaWxkOiBOb2RlIHwgbnVsbCwgdGVzdEFuY2VzdG9yOiBOb2RlIHwgbnVsbCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gQm9vbGVhbih0ZXN0QW5jZXN0b3I/LmNvbnRhaW5zKHRlc3RDaGlsZCkpO1xufVxuXG5jb25zdCBwYXJlbnRGbG93VG9EYXRhS2V5ID0gJ3BhcmVudEZsb3dUb0VsZW1lbnRJZCc7XG5cbi8qKlxuICogU2V0IGFuIGV4cGxpY2l0IHBhcmVudCB0byB1c2UgZm9yIG5vZGVzIHRoYXQgYXJlIG5vdCBwYXJ0IG9mIHRoZVxuICogcmVndWxhciBkb20gc3RydWN0dXJlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0UGFyZW50Rmxvd1RvKGZyb21DaGlsZEVsZW1lbnQ6IEhUTUxFbGVtZW50LCB0b1BhcmVudEVsZW1lbnQ6IEVsZW1lbnQpOiB2b2lkIHtcblx0ZnJvbUNoaWxkRWxlbWVudC5kYXRhc2V0W3BhcmVudEZsb3dUb0RhdGFLZXldID0gdG9QYXJlbnRFbGVtZW50LmlkO1xufVxuXG5mdW5jdGlvbiBnZXRQYXJlbnRGbG93VG9FbGVtZW50KG5vZGU6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQgfCBudWxsIHtcblx0Y29uc3QgZmxvd1RvUGFyZW50SWQgPSBub2RlLmRhdGFzZXRbcGFyZW50Rmxvd1RvRGF0YUtleV07XG5cdGlmICh0eXBlb2YgZmxvd1RvUGFyZW50SWQgPT09ICdzdHJpbmcnKSB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0cmV0dXJuIG5vZGUub3duZXJEb2N1bWVudC5nZXRFbGVtZW50QnlJZChmbG93VG9QYXJlbnRJZCk7XG5cdH1cblx0cmV0dXJuIG51bGw7XG59XG5cbi8qKlxuICogQ2hlY2sgaWYgYHRlc3RBbmNlc3RvcmAgaXMgYW4gYW5jZXN0b3Igb2YgYHRlc3RDaGlsZGAsIG9ic2VydmluZyB0aGUgZXhwbGljaXRcbiAqIHBhcmVudHMgc2V0IGJ5IGBzZXRQYXJlbnRGbG93VG9gLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNBbmNlc3RvclVzaW5nRmxvd1RvKHRlc3RDaGlsZDogTm9kZSwgdGVzdEFuY2VzdG9yOiBOb2RlKTogYm9vbGVhbiB7XG5cdGxldCBub2RlOiBOb2RlIHwgbnVsbCA9IHRlc3RDaGlsZDtcblx0d2hpbGUgKG5vZGUpIHtcblx0XHRpZiAobm9kZSA9PT0gdGVzdEFuY2VzdG9yKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoaXNIVE1MRWxlbWVudChub2RlKSkge1xuXHRcdFx0Y29uc3QgZmxvd1RvUGFyZW50RWxlbWVudCA9IGdldFBhcmVudEZsb3dUb0VsZW1lbnQobm9kZSk7XG5cdFx0XHRpZiAoZmxvd1RvUGFyZW50RWxlbWVudCkge1xuXHRcdFx0XHRub2RlID0gZmxvd1RvUGFyZW50RWxlbWVudDtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdG5vZGUgPSBub2RlLnBhcmVudE5vZGU7XG5cdH1cblxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmaW5kUGFyZW50V2l0aENsYXNzKG5vZGU6IEhUTUxFbGVtZW50LCBjbGF6ejogc3RyaW5nIHwgcmVhZG9ubHkgc3RyaW5nW10sIHN0b3BBdENsYXp6T3JOb2RlPzogc3RyaW5nIHwgSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB8IG51bGwge1xuXHR3aGlsZSAobm9kZSAmJiBub2RlLm5vZGVUeXBlID09PSBub2RlLkVMRU1FTlRfTk9ERSkge1xuXHRcdGlmICh0eXBlb2YgY2xhenogPT09ICdzdHJpbmcnID8gbm9kZS5jbGFzc0xpc3QuY29udGFpbnMoY2xhenopIDogY2xhenouZXZlcnkoY2FuZGlkYXRlID0+IG5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKGNhbmRpZGF0ZSkpKSB7XG5cdFx0XHRyZXR1cm4gbm9kZTtcblx0XHR9XG5cblx0XHRpZiAoc3RvcEF0Q2xhenpPck5vZGUpIHtcblx0XHRcdGlmICh0eXBlb2Ygc3RvcEF0Q2xhenpPck5vZGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGlmIChub2RlLmNsYXNzTGlzdC5jb250YWlucyhzdG9wQXRDbGF6ek9yTm9kZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKG5vZGUgPT09IHN0b3BBdENsYXp6T3JOb2RlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRub2RlID0gPEhUTUxFbGVtZW50Pm5vZGUucGFyZW50Tm9kZTtcblx0fVxuXG5cdHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFzUGFyZW50V2l0aENsYXNzKG5vZGU6IEhUTUxFbGVtZW50LCBjbGF6ejogc3RyaW5nIHwgcmVhZG9ubHkgc3RyaW5nW10sIHN0b3BBdENsYXp6T3JOb2RlPzogc3RyaW5nIHwgSFRNTEVsZW1lbnQpOiBib29sZWFuIHtcblx0cmV0dXJuICEhZmluZFBhcmVudFdpdGhDbGFzcyhub2RlLCBjbGF6eiwgc3RvcEF0Q2xhenpPck5vZGUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTaGFkb3dSb290KG5vZGU6IE5vZGUpOiBub2RlIGlzIFNoYWRvd1Jvb3Qge1xuXHRyZXR1cm4gKFxuXHRcdG5vZGUgJiYgISEoPFNoYWRvd1Jvb3Q+bm9kZSkuaG9zdCAmJiAhISg8U2hhZG93Um9vdD5ub2RlKS5tb2RlXG5cdCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0luU2hhZG93RE9NKGRvbU5vZGU6IE5vZGUpOiBib29sZWFuIHtcblx0cmV0dXJuICEhZ2V0U2hhZG93Um9vdChkb21Ob2RlKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFNoYWRvd1Jvb3QoZG9tTm9kZTogTm9kZSk6IFNoYWRvd1Jvb3QgfCBudWxsIHtcblx0d2hpbGUgKGRvbU5vZGUucGFyZW50Tm9kZSkge1xuXHRcdGlmIChkb21Ob2RlID09PSBkb21Ob2RlLm93bmVyRG9jdW1lbnQ/LmJvZHkpIHtcblx0XHRcdC8vIHJlYWNoZWQgdGhlIGJvZHlcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRkb21Ob2RlID0gZG9tTm9kZS5wYXJlbnROb2RlO1xuXHR9XG5cdHJldHVybiBpc1NoYWRvd1Jvb3QoZG9tTm9kZSkgPyBkb21Ob2RlIDogbnVsbDtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBhY3RpdmUgZWxlbWVudCBhY3Jvc3MgYWxsIGNoaWxkIHdpbmRvd3NcbiAqIGJhc2VkIG9uIGRvY3VtZW50IGZvY3VzLiBGYWxscyBiYWNrIHRvIHRoZSBtYWluXG4gKiB3aW5kb3cgaWYgbm8gd2luZG93IGhhcyBmb2N1cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEFjdGl2ZUVsZW1lbnQoKTogRWxlbWVudCB8IG51bGwge1xuXHRsZXQgcmVzdWx0ID0gZ2V0QWN0aXZlRG9jdW1lbnQoKS5hY3RpdmVFbGVtZW50O1xuXG5cdHdoaWxlIChyZXN1bHQ/LnNoYWRvd1Jvb3QpIHtcblx0XHRyZXN1bHQgPSByZXN1bHQuc2hhZG93Um9vdC5hY3RpdmVFbGVtZW50O1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgdGhlIGZvY3VzZWQgd2luZG93IGFjdGl2ZSBlbGVtZW50IG1hdGNoZXNcbiAqIHRoZSBwcm92aWRlZCBlbGVtZW50LiBGYWxscyBiYWNrIHRvIHRoZSBtYWluIHdpbmRvdyBpZiBub1xuICogd2luZG93IGhhcyBmb2N1cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzQWN0aXZlRWxlbWVudChlbGVtZW50OiBFbGVtZW50KTogYm9vbGVhbiB7XG5cdHJldHVybiBnZXRBY3RpdmVFbGVtZW50KCkgPT09IGVsZW1lbnQ7XG59XG5cbi8qKlxuICogUmV0dXJucyB0cnVlIGlmIHRoZSBmb2N1c2VkIHdpbmRvdyBhY3RpdmUgZWxlbWVudCBpcyBjb250YWluZWQgaW5cbiAqIGBhbmNlc3RvcmAuIEZhbGxzIGJhY2sgdG8gdGhlIG1haW4gd2luZG93IGlmIG5vIHdpbmRvdyBoYXMgZm9jdXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50KGFuY2VzdG9yOiBFbGVtZW50KTogYm9vbGVhbiB7XG5cdHJldHVybiBpc0FuY2VzdG9yKGdldEFjdGl2ZUVsZW1lbnQoKSwgYW5jZXN0b3IpO1xufVxuXG4vKipcbiAqIFJldHVybnMgd2hldGhlciB0aGUgZWxlbWVudCBpcyBpbiB0aGUgYWN0aXZlIGBkb2N1bWVudGAuIFRoZSBhY3RpdmVcbiAqIGRvY3VtZW50IGhhcyBmb2N1cyBvciB3aWxsIGJlIHRoZSBtYWluIHdpbmRvd3MgZG9jdW1lbnQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0FjdGl2ZURvY3VtZW50KGVsZW1lbnQ6IEVsZW1lbnQpOiBib29sZWFuIHtcblx0cmV0dXJuIGVsZW1lbnQub3duZXJEb2N1bWVudCA9PT0gZ2V0QWN0aXZlRG9jdW1lbnQoKTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBhY3RpdmUgZG9jdW1lbnQgYWNyb3NzIG1haW4gYW5kIGNoaWxkIHdpbmRvd3MuXG4gKiBQcmVmZXJzIHRoZSB3aW5kb3cgd2l0aCBmb2N1cyAoaW5jbHVkaW5nIGV4dGVybmFsIGNvbXBvbmVudHMgbGlrZSBicm93c2VyIHZpZXdzKSxcbiAqIG90aGVyd2lzZSBmYWxscyBiYWNrIHRvIHRoZSBtYWluIHdpbmRvd3MgZG9jdW1lbnQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRBY3RpdmVEb2N1bWVudCgpOiBEb2N1bWVudCB7XG5cdGlmIChnZXRXaW5kb3dzQ291bnQoKSA8PSAxKSB7XG5cdFx0cmV0dXJuIG1haW5XaW5kb3cuZG9jdW1lbnQ7XG5cdH1cblxuXHRjb25zdCBkb2N1bWVudHMgPSBBcnJheS5mcm9tKGdldFdpbmRvd3MoKSkubWFwKCh7IHdpbmRvdyB9KSA9PiB3aW5kb3cuZG9jdW1lbnQpO1xuXHRjb25zdCBmb2N1c2VkRG9jID0gZG9jdW1lbnRzLmZpbmQoZG9jID0+IGRvYy5oYXNGb2N1cygpKTtcblx0aWYgKGZvY3VzZWREb2MpIHtcblx0XHRyZXR1cm4gZm9jdXNlZERvYztcblx0fVxuXG5cdC8vIENoZWNrIGlmIGFuIGV4dGVybmFsIGNvbXBvbmVudCAobGlrZSBicm93c2VyIHZpZXcpIGhhcyBmb2N1c1xuXHRjb25zdCBleHRlcm5hbFdpbmRvdyA9IGdldEV4dGVybmFsRm9jdXNXaW5kb3coKTtcblx0aWYgKGV4dGVybmFsV2luZG93KSB7XG5cdFx0cmV0dXJuIGV4dGVybmFsV2luZG93LmRvY3VtZW50O1xuXHR9XG5cblx0cmV0dXJuIG1haW5XaW5kb3cuZG9jdW1lbnQ7XG59XG5cbi8qKlxuICogUmV0dXJucyB0aGUgYWN0aXZlIHdpbmRvdyBhY3Jvc3MgbWFpbiBhbmQgY2hpbGQgd2luZG93cy5cbiAqIFByZWZlcnMgdGhlIHdpbmRvdyB3aXRoIGZvY3VzLCBvdGhlcndpc2UgZmFsbHMgYmFjayB0b1xuICogdGhlIG1haW4gd2luZG93LlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0QWN0aXZlV2luZG93KCk6IENvZGVXaW5kb3cge1xuXHRjb25zdCBkb2N1bWVudCA9IGdldEFjdGl2ZURvY3VtZW50KCk7XG5cdHJldHVybiAoZG9jdW1lbnQuZGVmYXVsdFZpZXc/LndpbmRvdyA/PyBtYWluV2luZG93KSBhcyBDb2RlV2luZG93O1xufVxuXG5pbnRlcmZhY2UgSU11dGF0aW9uT2JzZXJ2ZXIge1xuXHR1c2VyczogbnVtYmVyO1xuXHRyZWFkb25seSBvYnNlcnZlcjogTXV0YXRpb25PYnNlcnZlcjtcblx0cmVhZG9ubHkgb25EaWRNdXRhdGU6IGV2ZW50LkV2ZW50PE11dGF0aW9uUmVjb3JkW10+O1xufVxuXG5leHBvcnQgY29uc3Qgc2hhcmVkTXV0YXRpb25PYnNlcnZlciA9IG5ldyBjbGFzcyB7XG5cblx0cmVhZG9ubHkgbXV0YXRpb25PYnNlcnZlcnMgPSBuZXcgTWFwPE5vZGUsIE1hcDxudW1iZXIsIElNdXRhdGlvbk9ic2VydmVyPj4oKTtcblxuXHRvYnNlcnZlKHRhcmdldDogTm9kZSwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgb3B0aW9ucz86IE11dGF0aW9uT2JzZXJ2ZXJJbml0KTogZXZlbnQuRXZlbnQ8TXV0YXRpb25SZWNvcmRbXT4ge1xuXHRcdGxldCBtdXRhdGlvbk9ic2VydmVyc1BlclRhcmdldCA9IHRoaXMubXV0YXRpb25PYnNlcnZlcnMuZ2V0KHRhcmdldCk7XG5cdFx0aWYgKCFtdXRhdGlvbk9ic2VydmVyc1BlclRhcmdldCkge1xuXHRcdFx0bXV0YXRpb25PYnNlcnZlcnNQZXJUYXJnZXQgPSBuZXcgTWFwPG51bWJlciwgSU11dGF0aW9uT2JzZXJ2ZXI+KCk7XG5cdFx0XHR0aGlzLm11dGF0aW9uT2JzZXJ2ZXJzLnNldCh0YXJnZXQsIG11dGF0aW9uT2JzZXJ2ZXJzUGVyVGFyZ2V0KTtcblx0XHR9XG5cblx0XHRjb25zdCBvcHRpb25zSGFzaCA9IGhhc2gob3B0aW9ucyk7XG5cdFx0bGV0IG11dGF0aW9uT2JzZXJ2ZXJQZXJPcHRpb25zID0gbXV0YXRpb25PYnNlcnZlcnNQZXJUYXJnZXQuZ2V0KG9wdGlvbnNIYXNoKTtcblx0XHRpZiAoIW11dGF0aW9uT2JzZXJ2ZXJQZXJPcHRpb25zKSB7XG5cdFx0XHRjb25zdCBvbkRpZE11dGF0ZSA9IG5ldyBldmVudC5FbWl0dGVyPE11dGF0aW9uUmVjb3JkW10+KCk7XG5cdFx0XHRjb25zdCBvYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKG11dGF0aW9ucyA9PiBvbkRpZE11dGF0ZS5maXJlKG11dGF0aW9ucykpO1xuXHRcdFx0b2JzZXJ2ZXIub2JzZXJ2ZSh0YXJnZXQsIG9wdGlvbnMpO1xuXG5cdFx0XHRjb25zdCByZXNvbHZlZE11dGF0aW9uT2JzZXJ2ZXJQZXJPcHRpb25zID0gbXV0YXRpb25PYnNlcnZlclBlck9wdGlvbnMgPSB7XG5cdFx0XHRcdHVzZXJzOiAxLFxuXHRcdFx0XHRvYnNlcnZlcixcblx0XHRcdFx0b25EaWRNdXRhdGU6IG9uRGlkTXV0YXRlLmV2ZW50XG5cdFx0XHR9O1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0cmVzb2x2ZWRNdXRhdGlvbk9ic2VydmVyUGVyT3B0aW9ucy51c2VycyAtPSAxO1xuXG5cdFx0XHRcdGlmIChyZXNvbHZlZE11dGF0aW9uT2JzZXJ2ZXJQZXJPcHRpb25zLnVzZXJzID09PSAwKSB7XG5cdFx0XHRcdFx0b25EaWRNdXRhdGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdG9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcblxuXHRcdFx0XHRcdG11dGF0aW9uT2JzZXJ2ZXJzUGVyVGFyZ2V0Py5kZWxldGUob3B0aW9uc0hhc2gpO1xuXHRcdFx0XHRcdGlmIChtdXRhdGlvbk9ic2VydmVyc1BlclRhcmdldD8uc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHRcdFx0dGhpcy5tdXRhdGlvbk9ic2VydmVycy5kZWxldGUodGFyZ2V0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0bXV0YXRpb25PYnNlcnZlcnNQZXJUYXJnZXQuc2V0KG9wdGlvbnNIYXNoLCBtdXRhdGlvbk9ic2VydmVyUGVyT3B0aW9ucyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG11dGF0aW9uT2JzZXJ2ZXJQZXJPcHRpb25zLnVzZXJzICs9IDE7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG11dGF0aW9uT2JzZXJ2ZXJQZXJPcHRpb25zLm9uRGlkTXV0YXRlO1xuXHR9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTWV0YUVsZW1lbnQoY29udGFpbmVyOiBIVE1MRWxlbWVudCA9IG1haW5XaW5kb3cuZG9jdW1lbnQuaGVhZCk6IEhUTUxNZXRhRWxlbWVudCB7XG5cdHJldHVybiBjcmVhdGVIZWFkRWxlbWVudCgnbWV0YScsIGNvbnRhaW5lcik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVMaW5rRWxlbWVudChjb250YWluZXI6IEhUTUxFbGVtZW50ID0gbWFpbldpbmRvdy5kb2N1bWVudC5oZWFkKTogSFRNTExpbmtFbGVtZW50IHtcblx0cmV0dXJuIGNyZWF0ZUhlYWRFbGVtZW50KCdsaW5rJywgY29udGFpbmVyKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlSGVhZEVsZW1lbnQ8SyBleHRlbmRzIGtleW9mIEhUTUxFbGVtZW50VGFnTmFtZU1hcD4odGFnTmFtZTogSywgY29udGFpbmVyOiBIVE1MRWxlbWVudCA9IG1haW5XaW5kb3cuZG9jdW1lbnQuaGVhZCk6IEhUTUxFbGVtZW50VGFnTmFtZU1hcFtLXSB7XG5cdGNvbnN0IGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KHRhZ05hbWUpO1xuXHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZWxlbWVudCk7XG5cdHJldHVybiBlbGVtZW50O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNIVE1MRWxlbWVudChlOiB1bmtub3duKTogZSBpcyBIVE1MRWxlbWVudCB7XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRyZXR1cm4gZSBpbnN0YW5jZW9mIEhUTUxFbGVtZW50IHx8IGUgaW5zdGFuY2VvZiBnZXRXaW5kb3coZSBhcyBOb2RlKS5IVE1MRWxlbWVudDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzSFRNTEFuY2hvckVsZW1lbnQoZTogdW5rbm93bik6IGUgaXMgSFRNTEFuY2hvckVsZW1lbnQge1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0cmV0dXJuIGUgaW5zdGFuY2VvZiBIVE1MQW5jaG9yRWxlbWVudCB8fCBlIGluc3RhbmNlb2YgZ2V0V2luZG93KGUgYXMgTm9kZSkuSFRNTEFuY2hvckVsZW1lbnQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0hUTUxTcGFuRWxlbWVudChlOiB1bmtub3duKTogZSBpcyBIVE1MU3BhbkVsZW1lbnQge1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0cmV0dXJuIGUgaW5zdGFuY2VvZiBIVE1MU3BhbkVsZW1lbnQgfHwgZSBpbnN0YW5jZW9mIGdldFdpbmRvdyhlIGFzIE5vZGUpLkhUTUxTcGFuRWxlbWVudDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzSFRNTFRleHRBcmVhRWxlbWVudChlOiB1bmtub3duKTogZSBpcyBIVE1MVGV4dEFyZWFFbGVtZW50IHtcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdHJldHVybiBlIGluc3RhbmNlb2YgSFRNTFRleHRBcmVhRWxlbWVudCB8fCBlIGluc3RhbmNlb2YgZ2V0V2luZG93KGUgYXMgTm9kZSkuSFRNTFRleHRBcmVhRWxlbWVudDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzSFRNTElucHV0RWxlbWVudChlOiB1bmtub3duKTogZSBpcyBIVE1MSW5wdXRFbGVtZW50IHtcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdHJldHVybiBlIGluc3RhbmNlb2YgSFRNTElucHV0RWxlbWVudCB8fCBlIGluc3RhbmNlb2YgZ2V0V2luZG93KGUgYXMgTm9kZSkuSFRNTElucHV0RWxlbWVudDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzSFRNTEJ1dHRvbkVsZW1lbnQoZTogdW5rbm93bik6IGUgaXMgSFRNTEJ1dHRvbkVsZW1lbnQge1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0cmV0dXJuIGUgaW5zdGFuY2VvZiBIVE1MQnV0dG9uRWxlbWVudCB8fCBlIGluc3RhbmNlb2YgZ2V0V2luZG93KGUgYXMgTm9kZSkuSFRNTEJ1dHRvbkVsZW1lbnQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0hUTUxEaXZFbGVtZW50KGU6IHVua25vd24pOiBlIGlzIEhUTUxEaXZFbGVtZW50IHtcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdHJldHVybiBlIGluc3RhbmNlb2YgSFRNTERpdkVsZW1lbnQgfHwgZSBpbnN0YW5jZW9mIGdldFdpbmRvdyhlIGFzIE5vZGUpLkhUTUxEaXZFbGVtZW50O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTVkdFbGVtZW50KGU6IHVua25vd24pOiBlIGlzIFNWR0VsZW1lbnQge1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0cmV0dXJuIGUgaW5zdGFuY2VvZiBTVkdFbGVtZW50IHx8IGUgaW5zdGFuY2VvZiBnZXRXaW5kb3coZSBhcyBOb2RlKS5TVkdFbGVtZW50O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNNb3VzZUV2ZW50KGU6IHVua25vd24pOiBlIGlzIE1vdXNlRXZlbnQge1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0cmV0dXJuIGUgaW5zdGFuY2VvZiBNb3VzZUV2ZW50IHx8IGUgaW5zdGFuY2VvZiBnZXRXaW5kb3coZSBhcyBVSUV2ZW50KS5Nb3VzZUV2ZW50O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNLZXlib2FyZEV2ZW50KGU6IHVua25vd24pOiBlIGlzIEtleWJvYXJkRXZlbnQge1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0cmV0dXJuIGUgaW5zdGFuY2VvZiBLZXlib2FyZEV2ZW50IHx8IGUgaW5zdGFuY2VvZiBnZXRXaW5kb3coZSBhcyBVSUV2ZW50KS5LZXlib2FyZEV2ZW50O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNQb2ludGVyRXZlbnQoZTogdW5rbm93bik6IGUgaXMgUG9pbnRlckV2ZW50IHtcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdHJldHVybiBlIGluc3RhbmNlb2YgUG9pbnRlckV2ZW50IHx8IGUgaW5zdGFuY2VvZiBnZXRXaW5kb3coZSBhcyBVSUV2ZW50KS5Qb2ludGVyRXZlbnQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0RyYWdFdmVudChlOiB1bmtub3duKTogZSBpcyBEcmFnRXZlbnQge1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0cmV0dXJuIGUgaW5zdGFuY2VvZiBEcmFnRXZlbnQgfHwgZSBpbnN0YW5jZW9mIGdldFdpbmRvdyhlIGFzIFVJRXZlbnQpLkRyYWdFdmVudDtcbn1cblxuZXhwb3J0IGNvbnN0IEV2ZW50VHlwZSA9IHtcblx0Ly8gTW91c2Vcblx0Q0xJQ0s6ICdjbGljaycsXG5cdEFVWENMSUNLOiAnYXV4Y2xpY2snLFxuXHREQkxDTElDSzogJ2RibGNsaWNrJyxcblx0TU9VU0VfVVA6ICdtb3VzZXVwJyxcblx0TU9VU0VfRE9XTjogJ21vdXNlZG93bicsXG5cdE1PVVNFX09WRVI6ICdtb3VzZW92ZXInLFxuXHRNT1VTRV9NT1ZFOiAnbW91c2Vtb3ZlJyxcblx0TU9VU0VfT1VUOiAnbW91c2VvdXQnLFxuXHRNT1VTRV9FTlRFUjogJ21vdXNlZW50ZXInLFxuXHRNT1VTRV9MRUFWRTogJ21vdXNlbGVhdmUnLFxuXHRNT1VTRV9XSEVFTDogJ3doZWVsJyxcblx0UE9JTlRFUl9VUDogJ3BvaW50ZXJ1cCcsXG5cdFBPSU5URVJfRE9XTjogJ3BvaW50ZXJkb3duJyxcblx0UE9JTlRFUl9NT1ZFOiAncG9pbnRlcm1vdmUnLFxuXHRQT0lOVEVSX0xFQVZFOiAncG9pbnRlcmxlYXZlJyxcblx0Q09OVEVYVF9NRU5VOiAnY29udGV4dG1lbnUnLFxuXHRXSEVFTDogJ3doZWVsJyxcblx0Ly8gS2V5Ym9hcmRcblx0S0VZX0RPV046ICdrZXlkb3duJyxcblx0S0VZX1BSRVNTOiAna2V5cHJlc3MnLFxuXHRLRVlfVVA6ICdrZXl1cCcsXG5cdC8vIEhUTUwgRG9jdW1lbnRcblx0TE9BRDogJ2xvYWQnLFxuXHRCRUZPUkVfVU5MT0FEOiAnYmVmb3JldW5sb2FkJyxcblx0VU5MT0FEOiAndW5sb2FkJyxcblx0UEFHRV9TSE9XOiAncGFnZXNob3cnLFxuXHRQQUdFX0hJREU6ICdwYWdlaGlkZScsXG5cdFBBU1RFOiAncGFzdGUnLFxuXHRBQk9SVDogJ2Fib3J0Jyxcblx0RVJST1I6ICdlcnJvcicsXG5cdFJFU0laRTogJ3Jlc2l6ZScsXG5cdFNDUk9MTDogJ3Njcm9sbCcsXG5cdEZVTExTQ1JFRU5fQ0hBTkdFOiAnZnVsbHNjcmVlbmNoYW5nZScsXG5cdFdLX0ZVTExTQ1JFRU5fQ0hBTkdFOiAnd2Via2l0ZnVsbHNjcmVlbmNoYW5nZScsXG5cdC8vIEZvcm1cblx0U0VMRUNUOiAnc2VsZWN0Jyxcblx0Q0hBTkdFOiAnY2hhbmdlJyxcblx0U1VCTUlUOiAnc3VibWl0Jyxcblx0UkVTRVQ6ICdyZXNldCcsXG5cdEZPQ1VTOiAnZm9jdXMnLFxuXHRGT0NVU19JTjogJ2ZvY3VzaW4nLFxuXHRGT0NVU19PVVQ6ICdmb2N1c291dCcsXG5cdEJMVVI6ICdibHVyJyxcblx0SU5QVVQ6ICdpbnB1dCcsXG5cdC8vIExvY2FsIFN0b3JhZ2Vcblx0U1RPUkFHRTogJ3N0b3JhZ2UnLFxuXHQvLyBEcmFnXG5cdERSQUdfU1RBUlQ6ICdkcmFnc3RhcnQnLFxuXHREUkFHOiAnZHJhZycsXG5cdERSQUdfRU5URVI6ICdkcmFnZW50ZXInLFxuXHREUkFHX0xFQVZFOiAnZHJhZ2xlYXZlJyxcblx0RFJBR19PVkVSOiAnZHJhZ292ZXInLFxuXHREUk9QOiAnZHJvcCcsXG5cdERSQUdfRU5EOiAnZHJhZ2VuZCcsXG5cdC8vIEFuaW1hdGlvblxuXHRBTklNQVRJT05fU1RBUlQ6IGJyb3dzZXIuaXNXZWJLaXQgPyAnd2Via2l0QW5pbWF0aW9uU3RhcnQnIDogJ2FuaW1hdGlvbnN0YXJ0Jyxcblx0QU5JTUFUSU9OX0VORDogYnJvd3Nlci5pc1dlYktpdCA/ICd3ZWJraXRBbmltYXRpb25FbmQnIDogJ2FuaW1hdGlvbmVuZCcsXG5cdEFOSU1BVElPTl9JVEVSQVRJT046IGJyb3dzZXIuaXNXZWJLaXQgPyAnd2Via2l0QW5pbWF0aW9uSXRlcmF0aW9uJyA6ICdhbmltYXRpb25pdGVyYXRpb24nXG59IGFzIGNvbnN0O1xuXG5leHBvcnQgaW50ZXJmYWNlIEV2ZW50TGlrZSB7XG5cdHByZXZlbnREZWZhdWx0KCk6IHZvaWQ7XG5cdHN0b3BQcm9wYWdhdGlvbigpOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNFdmVudExpa2Uob2JqOiB1bmtub3duKTogb2JqIGlzIEV2ZW50TGlrZSB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IG9iaiBhcyBFdmVudExpa2UgfCB1bmRlZmluZWQ7XG5cblx0cmV0dXJuICEhKGNhbmRpZGF0ZSAmJiB0eXBlb2YgY2FuZGlkYXRlLnByZXZlbnREZWZhdWx0ID09PSAnZnVuY3Rpb24nICYmIHR5cGVvZiBjYW5kaWRhdGUuc3RvcFByb3BhZ2F0aW9uID09PSAnZnVuY3Rpb24nKTtcbn1cblxuZXhwb3J0IGNvbnN0IEV2ZW50SGVscGVyID0ge1xuXHRzdG9wOiA8VCBleHRlbmRzIEV2ZW50TGlrZT4oZTogVCwgY2FuY2VsQnViYmxlPzogYm9vbGVhbik6IFQgPT4ge1xuXHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRpZiAoY2FuY2VsQnViYmxlKSB7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdH1cblx0XHRyZXR1cm4gZTtcblx0fVxufTtcblxuZXhwb3J0IGludGVyZmFjZSBJRm9jdXNUcmFja2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IG9uRGlkRm9jdXM6IGV2ZW50LkV2ZW50PHZvaWQ+O1xuXHRyZWFkb25seSBvbkRpZEJsdXI6IGV2ZW50LkV2ZW50PHZvaWQ+O1xuXHRyZWZyZXNoU3RhdGUoKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNhdmVQYXJlbnRzU2Nyb2xsVG9wKG5vZGU6IEVsZW1lbnQpOiBudW1iZXJbXSB7XG5cdGNvbnN0IHI6IG51bWJlcltdID0gW107XG5cdGZvciAobGV0IGkgPSAwOyBub2RlICYmIG5vZGUubm9kZVR5cGUgPT09IG5vZGUuRUxFTUVOVF9OT0RFOyBpKyspIHtcblx0XHRyW2ldID0gbm9kZS5zY3JvbGxUb3A7XG5cdFx0bm9kZSA9IDxFbGVtZW50Pm5vZGUucGFyZW50Tm9kZTtcblx0fVxuXHRyZXR1cm4gcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc3RvcmVQYXJlbnRzU2Nyb2xsVG9wKG5vZGU6IEVsZW1lbnQsIHN0YXRlOiBudW1iZXJbXSk6IHZvaWQge1xuXHRmb3IgKGxldCBpID0gMDsgbm9kZSAmJiBub2RlLm5vZGVUeXBlID09PSBub2RlLkVMRU1FTlRfTk9ERTsgaSsrKSB7XG5cdFx0aWYgKG5vZGUuc2Nyb2xsVG9wICE9PSBzdGF0ZVtpXSkge1xuXHRcdFx0bm9kZS5zY3JvbGxUb3AgPSBzdGF0ZVtpXTtcblx0XHR9XG5cdFx0bm9kZSA9IDxFbGVtZW50Pm5vZGUucGFyZW50Tm9kZTtcblx0fVxufVxuXG5jbGFzcyBGb2N1c1RyYWNrZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUZvY3VzVHJhY2tlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRGb2N1cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBldmVudC5FbWl0dGVyPHZvaWQ+KCkpO1xuXHRnZXQgb25EaWRGb2N1cygpIHsgcmV0dXJuIHRoaXMuX29uRGlkRm9jdXMuZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEJsdXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgZXZlbnQuRW1pdHRlcjx2b2lkPigpKTtcblx0Z2V0IG9uRGlkQmx1cigpIHsgcmV0dXJuIHRoaXMuX29uRGlkQmx1ci5ldmVudDsgfVxuXG5cdHByaXZhdGUgX3JlZnJlc2hTdGF0ZUhhbmRsZXI6ICgpID0+IHZvaWQ7XG5cblx0cHJpdmF0ZSBzdGF0aWMgaGFzRm9jdXNXaXRoaW4oZWxlbWVudDogSFRNTEVsZW1lbnQgfCBXaW5kb3cpOiBib29sZWFuIHtcblx0XHRpZiAoaXNIVE1MRWxlbWVudChlbGVtZW50KSkge1xuXHRcdFx0Y29uc3Qgc2hhZG93Um9vdCA9IGdldFNoYWRvd1Jvb3QoZWxlbWVudCk7XG5cdFx0XHRjb25zdCBhY3RpdmVFbGVtZW50ID0gKHNoYWRvd1Jvb3QgPyBzaGFkb3dSb290LmFjdGl2ZUVsZW1lbnQgOiBlbGVtZW50Lm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudCk7XG5cdFx0XHRyZXR1cm4gaXNBbmNlc3RvcihhY3RpdmVFbGVtZW50LCBlbGVtZW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgd2luZG93ID0gZWxlbWVudDtcblx0XHRcdHJldHVybiBpc0FuY2VzdG9yKHdpbmRvdy5kb2N1bWVudC5hY3RpdmVFbGVtZW50LCB3aW5kb3cuZG9jdW1lbnQpO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0cnVjdG9yKGVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgV2luZG93KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRsZXQgaGFzRm9jdXMgPSBGb2N1c1RyYWNrZXIuaGFzRm9jdXNXaXRoaW4oZWxlbWVudCk7XG5cdFx0bGV0IGxvb3NpbmdGb2N1cyA9IGZhbHNlO1xuXG5cdFx0Y29uc3Qgb25Gb2N1cyA9ICgpID0+IHtcblx0XHRcdGxvb3NpbmdGb2N1cyA9IGZhbHNlO1xuXHRcdFx0aWYgKCFoYXNGb2N1cykge1xuXHRcdFx0XHRoYXNGb2N1cyA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX29uRGlkRm9jdXMuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBvbkJsdXIgPSAoKSA9PiB7XG5cdFx0XHRpZiAoaGFzRm9jdXMpIHtcblx0XHRcdFx0bG9vc2luZ0ZvY3VzID0gdHJ1ZTtcblx0XHRcdFx0KGlzSFRNTEVsZW1lbnQoZWxlbWVudCkgPyBnZXRXaW5kb3coZWxlbWVudCkgOiBlbGVtZW50KS5zZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRpZiAobG9vc2luZ0ZvY3VzKSB7XG5cdFx0XHRcdFx0XHRsb29zaW5nRm9jdXMgPSBmYWxzZTtcblx0XHRcdFx0XHRcdGhhc0ZvY3VzID0gZmFsc2U7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkRpZEJsdXIuZmlyZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgMCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZnJlc2hTdGF0ZUhhbmRsZXIgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50Tm9kZUhhc0ZvY3VzID0gRm9jdXNUcmFja2VyLmhhc0ZvY3VzV2l0aGluKDxIVE1MRWxlbWVudD5lbGVtZW50KTtcblx0XHRcdGlmIChjdXJyZW50Tm9kZUhhc0ZvY3VzICE9PSBoYXNGb2N1cykge1xuXHRcdFx0XHRpZiAoaGFzRm9jdXMpIHtcblx0XHRcdFx0XHRvbkJsdXIoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRvbkZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsIEV2ZW50VHlwZS5GT0NVUywgb25Gb2N1cywgdHJ1ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihlbGVtZW50LCBFdmVudFR5cGUuQkxVUiwgb25CbHVyLCB0cnVlKSk7XG5cdFx0aWYgKGlzSFRNTEVsZW1lbnQoZWxlbWVudCkpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihlbGVtZW50LCBFdmVudFR5cGUuRk9DVVNfSU4sICgpID0+IHRoaXMuX3JlZnJlc2hTdGF0ZUhhbmRsZXIoKSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsIEV2ZW50VHlwZS5GT0NVU19PVVQsICgpID0+IHRoaXMuX3JlZnJlc2hTdGF0ZUhhbmRsZXIoKSkpO1xuXHRcdH1cblxuXHR9XG5cblx0cmVmcmVzaFN0YXRlKCkge1xuXHRcdHRoaXMuX3JlZnJlc2hTdGF0ZUhhbmRsZXIoKTtcblx0fVxufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgYElGb2N1c1RyYWNrZXJgIGluc3RhbmNlIHRoYXQgdHJhY2tzIGZvY3VzIGNoYW5nZXMgb24gdGhlIGdpdmVuIGBlbGVtZW50YCBhbmQgaXRzIGRlc2NlbmRhbnRzLlxuICpcbiAqIEBwYXJhbSBlbGVtZW50IFRoZSBgSFRNTEVsZW1lbnRgIG9yIGBXaW5kb3dgIHRvIHRyYWNrIGZvY3VzIGNoYW5nZXMgb24uXG4gKiBAcmV0dXJucyBBbiBgSUZvY3VzVHJhY2tlcmAgaW5zdGFuY2UuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0cmFja0ZvY3VzKGVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgV2luZG93KTogSUZvY3VzVHJhY2tlciB7XG5cdHJldHVybiBuZXcgRm9jdXNUcmFja2VyKGVsZW1lbnQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWZ0ZXI8VCBleHRlbmRzIE5vZGU+KHNpYmxpbmc6IEhUTUxFbGVtZW50LCBjaGlsZDogVCk6IFQge1xuXHRzaWJsaW5nLmFmdGVyKGNoaWxkKTtcblx0cmV0dXJuIGNoaWxkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwZW5kPFQgZXh0ZW5kcyBOb2RlPihwYXJlbnQ6IEhUTUxFbGVtZW50LCBjaGlsZDogVCk6IFQ7XG5leHBvcnQgZnVuY3Rpb24gYXBwZW5kPFQgZXh0ZW5kcyBOb2RlPihwYXJlbnQ6IEhUTUxFbGVtZW50LCAuLi5jaGlsZHJlbjogKFQgfCBzdHJpbmcpW10pOiB2b2lkO1xuZXhwb3J0IGZ1bmN0aW9uIGFwcGVuZDxUIGV4dGVuZHMgTm9kZT4ocGFyZW50OiBIVE1MRWxlbWVudCwgLi4uY2hpbGRyZW46IChUIHwgc3RyaW5nKVtdKTogVCB8IHZvaWQge1xuXHRwYXJlbnQuYXBwZW5kKC4uLmNoaWxkcmVuKTtcblx0aWYgKGNoaWxkcmVuLmxlbmd0aCA9PT0gMSAmJiB0eXBlb2YgY2hpbGRyZW5bMF0gIT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIGNoaWxkcmVuWzBdO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcmVwZW5kPFQgZXh0ZW5kcyBOb2RlPihwYXJlbnQ6IEhUTUxFbGVtZW50LCBjaGlsZDogVCk6IFQge1xuXHRwYXJlbnQuaW5zZXJ0QmVmb3JlKGNoaWxkLCBwYXJlbnQuZmlyc3RDaGlsZCk7XG5cdHJldHVybiBjaGlsZDtcbn1cblxuLyoqXG4gKiBSZW1vdmVzIGFsbCBjaGlsZHJlbiBmcm9tIGBwYXJlbnRgIGFuZCBhcHBlbmRzIGBjaGlsZHJlbmBcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc2V0KHBhcmVudDogSFRNTEVsZW1lbnQsIC4uLmNoaWxkcmVuOiBBcnJheTxOb2RlIHwgc3RyaW5nPik6IHZvaWQge1xuXHRwYXJlbnQudGV4dENvbnRlbnQgPSAnJztcblx0YXBwZW5kKHBhcmVudCwgLi4uY2hpbGRyZW4pO1xufVxuXG5jb25zdCBTRUxFQ1RPUl9SRUdFWCA9IC8oW1xcd1xcLV0rKT8oIyhbXFx3XFwtXSspKT8oKFxcLihbXFx3XFwtXSspKSopLztcblxuZXhwb3J0IGVudW0gTmFtZXNwYWNlIHtcblx0SFRNTCA9ICdodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hodG1sJyxcblx0U1ZHID0gJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJ1xufVxuXG5mdW5jdGlvbiBfJDxUIGV4dGVuZHMgRWxlbWVudD4obmFtZXNwYWNlOiBOYW1lc3BhY2UsIGRlc2NyaXB0aW9uOiBzdHJpbmcsIGF0dHJzPzogeyBba2V5OiBzdHJpbmddOiBhbnkgfSwgLi4uY2hpbGRyZW46IEFycmF5PE5vZGUgfCBzdHJpbmc+KTogVCB7XG5cdGNvbnN0IG1hdGNoID0gU0VMRUNUT1JfUkVHRVguZXhlYyhkZXNjcmlwdGlvbik7XG5cblx0aWYgKCFtYXRjaCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignQmFkIHVzZSBvZiBlbW1ldCcpO1xuXHR9XG5cblx0Y29uc3QgdGFnTmFtZSA9IG1hdGNoWzFdIHx8ICdkaXYnO1xuXHRsZXQgcmVzdWx0OiBUO1xuXG5cdGlmIChuYW1lc3BhY2UgIT09IE5hbWVzcGFjZS5IVE1MKSB7XG5cdFx0cmVzdWx0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKG5hbWVzcGFjZSBhcyBzdHJpbmcsIHRhZ05hbWUpIGFzIFQ7XG5cdH0gZWxzZSB7XG5cdFx0cmVzdWx0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0YWdOYW1lKSBhcyB1bmtub3duIGFzIFQ7XG5cdH1cblxuXHRpZiAobWF0Y2hbM10pIHtcblx0XHRyZXN1bHQuaWQgPSBtYXRjaFszXTtcblx0fVxuXHRpZiAobWF0Y2hbNF0pIHtcblx0XHRyZXN1bHQuY2xhc3NOYW1lID0gbWF0Y2hbNF0ucmVwbGFjZSgvXFwuL2csICcgJykudHJpbSgpO1xuXHR9XG5cblx0aWYgKGF0dHJzKSB7XG5cdFx0T2JqZWN0LmVudHJpZXMoYXR0cnMpLmZvckVhY2goKFtuYW1lLCB2YWx1ZV0pID0+IHtcblx0XHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKC9eb25cXHcrJC8udGVzdChuYW1lKSkge1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0KDxhbnk+cmVzdWx0KVtuYW1lXSA9IHZhbHVlO1xuXHRcdFx0fSBlbHNlIGlmIChuYW1lID09PSAnc2VsZWN0ZWQnKSB7XG5cdFx0XHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0XHRcdHJlc3VsdC5zZXRBdHRyaWJ1dGUobmFtZSwgJ3RydWUnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXN1bHQuc2V0QXR0cmlidXRlKG5hbWUsIHZhbHVlKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJlc3VsdC5hcHBlbmQoLi4uY2hpbGRyZW4pO1xuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiAkPFQgZXh0ZW5kcyBIVE1MRWxlbWVudD4oZGVzY3JpcHRpb246IHN0cmluZywgYXR0cnM/OiB7IFtrZXk6IHN0cmluZ106IGFueSB9LCAuLi5jaGlsZHJlbjogQXJyYXk8Tm9kZSB8IHN0cmluZz4pOiBUIHtcblx0cmV0dXJuIF8kKE5hbWVzcGFjZS5IVE1MLCBkZXNjcmlwdGlvbiwgYXR0cnMsIC4uLmNoaWxkcmVuKTtcbn1cblxuJC5TVkcgPSBmdW5jdGlvbiA8VCBleHRlbmRzIFNWR0VsZW1lbnQ+KGRlc2NyaXB0aW9uOiBzdHJpbmcsIGF0dHJzPzogeyBba2V5OiBzdHJpbmddOiBhbnkgfSwgLi4uY2hpbGRyZW46IEFycmF5PE5vZGUgfCBzdHJpbmc+KTogVCB7XG5cdHJldHVybiBfJChOYW1lc3BhY2UuU1ZHLCBkZXNjcmlwdGlvbiwgYXR0cnMsIC4uLmNoaWxkcmVuKTtcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBqb2luKG5vZGVzOiBOb2RlW10sIHNlcGFyYXRvcjogTm9kZSB8IHN0cmluZyk6IE5vZGVbXSB7XG5cdGNvbnN0IHJlc3VsdDogTm9kZVtdID0gW107XG5cblx0bm9kZXMuZm9yRWFjaCgobm9kZSwgaW5kZXgpID0+IHtcblx0XHRpZiAoaW5kZXggPiAwKSB7XG5cdFx0XHRpZiAoc2VwYXJhdG9yIGluc3RhbmNlb2YgTm9kZSkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChzZXBhcmF0b3IuY2xvbmVOb2RlKCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoc2VwYXJhdG9yKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmVzdWx0LnB1c2gobm9kZSk7XG5cdH0pO1xuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRWaXNpYmlsaXR5KHZpc2libGU6IGJvb2xlYW4sIC4uLmVsZW1lbnRzOiBIVE1MRWxlbWVudFtdKTogdm9pZCB7XG5cdGlmICh2aXNpYmxlKSB7XG5cdFx0c2hvdyguLi5lbGVtZW50cyk7XG5cdH0gZWxzZSB7XG5cdFx0aGlkZSguLi5lbGVtZW50cyk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNob3coLi4uZWxlbWVudHM6IEhUTUxFbGVtZW50W10pOiB2b2lkIHtcblx0Zm9yIChjb25zdCBlbGVtZW50IG9mIGVsZW1lbnRzKSB7XG5cdFx0ZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0ZWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJyk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhpZGUoLi4uZWxlbWVudHM6IEhUTUxFbGVtZW50W10pOiB2b2lkIHtcblx0Zm9yIChjb25zdCBlbGVtZW50IG9mIGVsZW1lbnRzKSB7XG5cdFx0ZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdGVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZmluZFBhcmVudFdpdGhBdHRyaWJ1dGUobm9kZTogTm9kZSB8IG51bGwsIGF0dHJpYnV0ZTogc3RyaW5nKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcblx0d2hpbGUgKG5vZGUgJiYgbm9kZS5ub2RlVHlwZSA9PT0gbm9kZS5FTEVNRU5UX05PREUpIHtcblx0XHRpZiAoaXNIVE1MRWxlbWVudChub2RlKSAmJiBub2RlLmhhc0F0dHJpYnV0ZShhdHRyaWJ1dGUpKSB7XG5cdFx0XHRyZXR1cm4gbm9kZTtcblx0XHR9XG5cblx0XHRub2RlID0gbm9kZS5wYXJlbnROb2RlO1xuXHR9XG5cblx0cmV0dXJuIG51bGw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVUYWJJbmRleEFuZFVwZGF0ZUZvY3VzKG5vZGU6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdGlmICghbm9kZSB8fCAhbm9kZS5oYXNBdHRyaWJ1dGUoJ3RhYkluZGV4JykpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHQvLyBJZiB3ZSBhcmUgdGhlIGN1cnJlbnRseSBmb2N1c2VkIGVsZW1lbnQgYW5kIHRhYkluZGV4IGlzIHJlbW92ZWQsXG5cdC8vIHN0YW5kYXJkIERPTSBiZWhhdmlvciBpcyB0byBtb3ZlIGZvY3VzIHRvIHRoZSA8Ym9keT4gZWxlbWVudC4gV2Vcblx0Ly8gdHlwaWNhbGx5IG5ldmVyIHdhbnQgdGhhdCwgcmF0aGVyIHB1dCBmb2N1cyB0byB0aGUgY2xvc2VzdCBlbGVtZW50XG5cdC8vIGluIHRoZSBoaWVyYXJjaHkgb2YgdGhlIHBhcmVudCBET00gbm9kZXMuXG5cdGlmIChub2RlLm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudCA9PT0gbm9kZSkge1xuXHRcdGNvbnN0IHBhcmVudEZvY3VzYWJsZSA9IGZpbmRQYXJlbnRXaXRoQXR0cmlidXRlKG5vZGUucGFyZW50RWxlbWVudCwgJ3RhYkluZGV4Jyk7XG5cdFx0cGFyZW50Rm9jdXNhYmxlPy5mb2N1cygpO1xuXHR9XG5cblx0bm9kZS5yZW1vdmVBdHRyaWJ1dGUoJ3RhYmluZGV4Jyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmaW5hbEhhbmRsZXI8VCBleHRlbmRzIEV2ZW50PihmbjogKGV2ZW50OiBUKSA9PiB1bmtub3duKTogKGV2ZW50OiBUKSA9PiB1bmtub3duIHtcblx0cmV0dXJuIGUgPT4ge1xuXHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdGZuKGUpO1xuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZG9tQ29udGVudExvYWRlZCh0YXJnZXRXaW5kb3c6IFdpbmRvdyk6IFByb21pc2U8dm9pZD4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0Y29uc3QgcmVhZHlTdGF0ZSA9IHRhcmdldFdpbmRvdy5kb2N1bWVudC5yZWFkeVN0YXRlO1xuXHRcdGlmIChyZWFkeVN0YXRlID09PSAnY29tcGxldGUnIHx8ICh0YXJnZXRXaW5kb3cuZG9jdW1lbnQgJiYgdGFyZ2V0V2luZG93LmRvY3VtZW50LmJvZHkgIT09IG51bGwpKSB7XG5cdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGxpc3RlbmVyID0gKCkgPT4ge1xuXHRcdFx0XHR0YXJnZXRXaW5kb3cud2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCBsaXN0ZW5lciwgZmFsc2UpO1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHR9O1xuXG5cdFx0XHR0YXJnZXRXaW5kb3cud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCBsaXN0ZW5lciwgZmFsc2UpO1xuXHRcdH1cblx0fSk7XG59XG5cbi8qKlxuICogRmluZCBhIHZhbHVlIHVzYWJsZSBmb3IgYSBkb20gbm9kZSBzaXplIHN1Y2ggdGhhdCB0aGUgbGlrZWxpaG9vZCB0aGF0IGl0IHdvdWxkIGJlXG4gKiBkaXNwbGF5ZWQgd2l0aCBjb25zdGFudCBzY3JlZW4gcGl4ZWxzIHNpemUgaXMgYXMgaGlnaCBhcyBwb3NzaWJsZS5cbiAqXG4gKiBlLmcuIFdlIHdvdWxkIGRlc2lyZSBmb3IgdGhlIGN1cnNvcnMgdG8gYmUgMnB4IChDU1MgcHgpIHdpZGUuIFVuZGVyIGEgZGV2aWNlUGl4ZWxSYXRpb1xuICogb2YgMS4yNSwgdGhlIGN1cnNvciB3aWxsIGJlIDIuNSBzY3JlZW4gcGl4ZWxzIHdpZGUuIERlcGVuZGluZyBvbiBob3cgdGhlIGRvbSBub2RlIGFsaWducy9cInNuYXBzXCJcbiAqIHdpdGggdGhlIHNjcmVlbiBwaXhlbHMsIGl0IHdpbGwgc29tZXRpbWVzIGJlIHJlbmRlcmVkIHdpdGggMiBzY3JlZW4gcGl4ZWxzLCBhbmQgc29tZXRpbWVzIHdpdGggMyBzY3JlZW4gcGl4ZWxzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY29tcHV0ZVNjcmVlbkF3YXJlU2l6ZSh3aW5kb3c6IFdpbmRvdywgY3NzUHg6IG51bWJlcik6IG51bWJlciB7XG5cdGNvbnN0IHNjcmVlblB4ID0gd2luZG93LmRldmljZVBpeGVsUmF0aW8gKiBjc3NQeDtcblx0cmV0dXJuIE1hdGgubWF4KDEsIE1hdGguZmxvb3Ioc2NyZWVuUHgpKSAvIHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvO1xufVxuXG4vKipcbiAqIE9wZW4gc2FmZWx5IGEgbmV3IHdpbmRvdy4gVGhpcyBpcyB0aGUgYmVzdCB3YXkgdG8gZG8gc28sIGJ1dCB5b3UgY2Fubm90IHRlbGxcbiAqIGlmIHRoZSB3aW5kb3cgd2FzIG9wZW5lZCBvciBpZiBpdCB3YXMgYmxvY2tlZCBieSB0aGUgYnJvd3NlcidzIHBvcHVwIGJsb2NrZXIuXG4gKiBJZiB5b3Ugd2FudCB0byB0ZWxsIGlmIHRoZSBicm93c2VyIGJsb2NrZWQgdGhlIG5ldyB3aW5kb3csIHVzZSB7QGxpbmsgd2luZG93T3BlbldpdGhTdWNjZXNzfS5cbiAqXG4gKiBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC9tb25hY28tZWRpdG9yL2lzc3Vlcy82MDFcbiAqIFRvIHByb3RlY3QgYWdhaW5zdCBtYWxpY2lvdXMgY29kZSBpbiB0aGUgbGlua2VkIHNpdGUsIHBhcnRpY3VsYXJseSBwaGlzaGluZyBhdHRlbXB0cyxcbiAqIHRoZSB3aW5kb3cub3BlbmVyIHNob3VsZCBiZSBzZXQgdG8gbnVsbCB0byBwcmV2ZW50IHRoZSBsaW5rZWQgc2l0ZSBmcm9tIGhhdmluZyBhY2Nlc3NcbiAqIHRvIGNoYW5nZSB0aGUgbG9jYXRpb24gb2YgdGhlIGN1cnJlbnQgcGFnZS5cbiAqIFNlZSBodHRwczovL21hdGhpYXNieW5lbnMuZ2l0aHViLmlvL3JlbC1ub29wZW5lci9cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdpbmRvd09wZW5Ob09wZW5lcih1cmw6IHN0cmluZyk6IHZvaWQge1xuXHQvLyBCeSB1c2luZyAnbm9vcGVuZXInIGluIHRoZSBgd2luZG93RmVhdHVyZXNgIGFyZ3VtZW50LCB0aGUgbmV3bHkgY3JlYXRlZCB3aW5kb3cgd2lsbFxuXHQvLyBub3QgYmUgYWJsZSB0byB1c2UgYHdpbmRvdy5vcGVuZXJgIHRvIHJlYWNoIGJhY2sgdG8gdGhlIGN1cnJlbnQgcGFnZS5cblx0Ly8gU2VlIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS80Njk1ODczMVxuXHQvLyBTZWUgaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL1dpbmRvdy9vcGVuI25vb3BlbmVyXG5cdC8vIEhvd2V2ZXIsIHRoaXMgYWxzbyBkb2Vzbid0IGFsbG93IHVzIHRvIHJlYWxpemUgaWYgdGhlIGJyb3dzZXIgYmxvY2tlZFxuXHQvLyB0aGUgY3JlYXRpb24gb2YgdGhlIHdpbmRvdy5cblx0bWFpbldpbmRvdy5vcGVuKHVybCwgJ19ibGFuaycsICdub29wZW5lcicpO1xufVxuXG4vKipcbiAqIE9wZW4gYSBuZXcgd2luZG93IGluIGEgcG9wdXAuIFRoaXMgaXMgdGhlIGJlc3Qgd2F5IHRvIGRvIHNvLCBidXQgeW91IGNhbm5vdCB0ZWxsXG4gKiBpZiB0aGUgd2luZG93IHdhcyBvcGVuZWQgb3IgaWYgaXQgd2FzIGJsb2NrZWQgYnkgdGhlIGJyb3dzZXIncyBwb3B1cCBibG9ja2VyLlxuICogSWYgeW91IHdhbnQgdG8gdGVsbCBpZiB0aGUgYnJvd3NlciBibG9ja2VkIHRoZSBuZXcgd2luZG93LCB1c2Uge0BsaW5rIHdpbmRvd09wZW5XaXRoU3VjY2Vzc30uXG4gKlxuICogTm90ZTogdGhpcyBkb2VzIG5vdCBzZXQge0BsaW5rIHdpbmRvdy5vcGVuZXJ9IHRvIG51bGwuIFRoaXMgaXMgdG8gYWxsb3cgdGhlIG9wZW5lZCBwb3B1cCB0b1xuICogYmUgYWJsZSB0byB1c2Uge0BsaW5rIHdpbmRvdy5jbG9zZX0gdG8gY2xvc2UgaXRzZWxmLiBCZWNhdXNlIG9mIHRoaXMsIHlvdSBzaG91bGQgb25seSB1c2VcbiAqIHRoaXMgZnVuY3Rpb24gb24gdXJscyB0aGF0IHlvdSB0cnVzdC5cbiAqXG4gKiBJbiBvdGhlcndvcmRzLCB5b3Ugc2hvdWxkIGFsbW9zdCBhbHdheXMgdXNlIHtAbGluayB3aW5kb3dPcGVuTm9PcGVuZXJ9IGluc3RlYWQgb2YgdGhpcyBmdW5jdGlvbi5cbiAqL1xuY29uc3QgcG9wdXBXaWR0aCA9IDc4MCwgcG9wdXBIZWlnaHQgPSA2NDA7XG5leHBvcnQgZnVuY3Rpb24gd2luZG93T3BlblBvcHVwKHVybDogc3RyaW5nKTogdm9pZCB7XG5cdGNvbnN0IGxlZnQgPSBNYXRoLmZsb29yKG1haW5XaW5kb3cuc2NyZWVuTGVmdCArIG1haW5XaW5kb3cuaW5uZXJXaWR0aCAvIDIgLSBwb3B1cFdpZHRoIC8gMik7XG5cdGNvbnN0IHRvcCA9IE1hdGguZmxvb3IobWFpbldpbmRvdy5zY3JlZW5Ub3AgKyBtYWluV2luZG93LmlubmVySGVpZ2h0IC8gMiAtIHBvcHVwSGVpZ2h0IC8gMik7XG5cdG1haW5XaW5kb3cub3Blbihcblx0XHR1cmwsXG5cdFx0J19ibGFuaycsXG5cdFx0YHdpZHRoPSR7cG9wdXBXaWR0aH0saGVpZ2h0PSR7cG9wdXBIZWlnaHR9LHRvcD0ke3RvcH0sbGVmdD0ke2xlZnR9YFxuXHQpO1xufVxuXG4vKipcbiAqIEF0dGVtcHRzIHRvIG9wZW4gYSB3aW5kb3cgYW5kIHJldHVybnMgd2hldGhlciBpdCBzdWNjZWVkZWQuIFRoaXMgdGVjaG5pcXVlIGlzXG4gKiBub3QgYXBwcm9wcmlhdGUgaW4gY2VydGFpbiBjb250ZXh0cywgbGlrZSBmb3IgZXhhbXBsZSB3aGVuIHRoZSBKUyBjb250ZXh0IGlzXG4gKiBleGVjdXRpbmcgaW5zaWRlIGEgc2FuZGJveGVkIGlmcmFtZS4gSWYgaXQgaXMgbm90IG5lY2Vzc2FyeSB0byBrbm93IGlmIHRoZVxuICogYnJvd3NlciBibG9ja2VkIHRoZSBuZXcgd2luZG93LCB1c2Uge0BsaW5rIHdpbmRvd09wZW5Ob09wZW5lcn0uXG4gKlxuICogU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvbW9uYWNvLWVkaXRvci9pc3N1ZXMvNjAxXG4gKiBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC9tb25hY28tZWRpdG9yL2lzc3Vlcy8yNDc0XG4gKiBTZWUgaHR0cHM6Ly9tYXRoaWFzYnluZW5zLmdpdGh1Yi5pby9yZWwtbm9vcGVuZXIvXG4gKlxuICogQHBhcmFtIHVybCB0aGUgdXJsIHRvIG9wZW5cbiAqIEBwYXJhbSBub09wZW5lciB3aGV0aGVyIG9yIG5vdCB0byBzZXQgdGhlIHtAbGluayB3aW5kb3cub3BlbmVyfSB0byBudWxsLiBZb3Ugc2hvdWxkIGxlYXZlIHRoZSBkZWZhdWx0XG4gKiAodHJ1ZSkgdW5sZXNzIHlvdSB0cnVzdCB0aGUgdXJsIHRoYXQgaXMgYmVpbmcgb3BlbmVkLlxuICogQHJldHVybnMgYm9vbGVhbiBpbmRpY2F0aW5nIGlmIHRoZSB7QGxpbmsgd2luZG93Lm9wZW59IGNhbGwgc3VjY2VlZGVkXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3aW5kb3dPcGVuV2l0aFN1Y2Nlc3ModXJsOiBzdHJpbmcsIG5vT3BlbmVyID0gdHJ1ZSk6IGJvb2xlYW4ge1xuXHRjb25zdCBuZXdUYWIgPSBtYWluV2luZG93Lm9wZW4oKTtcblx0aWYgKG5ld1RhYikge1xuXHRcdGlmIChub09wZW5lcikge1xuXHRcdFx0Ly8gc2VlIGB3aW5kb3dPcGVuTm9PcGVuZXJgIGZvciBkZXRhaWxzIG9uIHdoeSB0aGlzIGlzIGltcG9ydGFudFxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHQobmV3VGFiIGFzIGFueSkub3BlbmVyID0gbnVsbDtcblx0XHR9XG5cdFx0bmV3VGFiLmxvY2F0aW9uLmhyZWYgPSB1cmw7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYW5pbWF0ZSh0YXJnZXRXaW5kb3c6IFdpbmRvdywgZm46ICgpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IHN0ZXAgPSAoKSA9PiB7XG5cdFx0Zm4oKTtcblx0XHRzdGVwRGlzcG9zYWJsZSA9IHNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUodGFyZ2V0V2luZG93LCBzdGVwKTtcblx0fTtcblxuXHRsZXQgc3RlcERpc3Bvc2FibGUgPSBzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKHRhcmdldFdpbmRvdywgc3RlcCk7XG5cdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4gc3RlcERpc3Bvc2FibGUuZGlzcG9zZSgpKTtcbn1cblxuUmVtb3RlQXV0aG9yaXRpZXMuc2V0UHJlZmVycmVkV2ViU2NoZW1hKC9eaHR0cHM6Ly50ZXN0KG1haW5XaW5kb3cubG9jYXRpb24uaHJlZikgPyAnaHR0cHMnIDogJ2h0dHAnKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHRyaWdnZXJEb3dubG9hZChkYXRhT3JVcmk6IFVpbnQ4QXJyYXkgfCBVUkksIG5hbWU6IHN0cmluZyk6IHZvaWQge1xuXG5cdC8vIElmIHRoZSBkYXRhIGlzIHByb3ZpZGVkIGFzIEJ1ZmZlciwgd2UgY3JlYXRlIGFcblx0Ly8gYmxvYiBVUkwgb3V0IG9mIGl0IHRvIHByb2R1Y2UgYSB2YWxpZCBsaW5rXG5cdGxldCB1cmw6IHN0cmluZztcblx0aWYgKFVSSS5pc1VyaShkYXRhT3JVcmkpKSB7XG5cdFx0dXJsID0gZGF0YU9yVXJpLnRvU3RyaW5nKHRydWUpO1xuXHR9IGVsc2Uge1xuXHRcdGNvbnN0IGJsb2IgPSBuZXcgQmxvYihbZGF0YU9yVXJpIGFzIFVpbnQ4QXJyYXk8QXJyYXlCdWZmZXI+XSk7XG5cdFx0dXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcblxuXHRcdC8vIEVuc3VyZSB0byBmcmVlIHRoZSBkYXRhIGZyb20gRE9NIGV2ZW50dWFsbHlcblx0XHRzZXRUaW1lb3V0KCgpID0+IFVSTC5yZXZva2VPYmplY3RVUkwodXJsKSk7XG5cdH1cblxuXHQvLyBJbiBvcmRlciB0byBkb3dubG9hZCBmcm9tIHRoZSBicm93c2VyLCB0aGUgb25seSB3YXkgc2VlbXNcblx0Ly8gdG8gYmUgY3JlYXRpbmcgYSA8YT4gZWxlbWVudCB3aXRoIGRvd25sb2FkIGF0dHJpYnV0ZSB0aGF0XG5cdC8vIHBvaW50cyB0byB0aGUgZmlsZSB0byBkb3dubG9hZC5cblx0Ly8gU2VlIGFsc28gaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vd2ViL3VwZGF0ZXMvMjAxMS8wOC9Eb3dubG9hZGluZy1yZXNvdXJjZXMtaW4tSFRNTDUtYS1kb3dubG9hZFxuXHRjb25zdCBhY3RpdmVXaW5kb3cgPSBnZXRBY3RpdmVXaW5kb3coKTtcblx0Y29uc3QgYW5jaG9yID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuXHRhY3RpdmVXaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChhbmNob3IpO1xuXHRhbmNob3IuZG93bmxvYWQgPSBuYW1lO1xuXHRhbmNob3IuaHJlZiA9IHVybDtcblx0YW5jaG9yLmNsaWNrKCk7XG5cblx0Ly8gRW5zdXJlIHRvIHJlbW92ZSB0aGUgZWxlbWVudCBmcm9tIERPTSBldmVudHVhbGx5XG5cdHNldFRpbWVvdXQoKCkgPT4gYW5jaG9yLnJlbW92ZSgpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRyaWdnZXJVcGxvYWQoKTogUHJvbWlzZTxGaWxlTGlzdCB8IHVuZGVmaW5lZD4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2U8RmlsZUxpc3QgfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXG5cdFx0Ly8gSW4gb3JkZXIgdG8gdXBsb2FkIHRvIHRoZSBicm93c2VyLCBjcmVhdGUgYVxuXHRcdC8vIGlucHV0IGVsZW1lbnQgb2YgdHlwZSBgZmlsZWAgYW5kIGNsaWNrIGl0XG5cdFx0Ly8gdG8gZ2F0aGVyIHRoZSBzZWxlY3RlZCBmaWxlc1xuXHRcdGNvbnN0IGFjdGl2ZVdpbmRvdyA9IGdldEFjdGl2ZVdpbmRvdygpO1xuXHRcdGNvbnN0IGlucHV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaW5wdXQnKTtcblx0XHRhY3RpdmVXaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChpbnB1dCk7XG5cdFx0aW5wdXQudHlwZSA9ICdmaWxlJztcblx0XHRpbnB1dC5tdWx0aXBsZSA9IHRydWU7XG5cblx0XHQvLyBSZXNvbHZlIG9uY2UgdGhlIGlucHV0IGV2ZW50IGhhcyBmaXJlZCBvbmNlXG5cdFx0ZXZlbnQuRXZlbnQub25jZShldmVudC5FdmVudC5mcm9tRE9NRXZlbnRFbWl0dGVyKGlucHV0LCAnaW5wdXQnKSkoKCkgPT4ge1xuXHRcdFx0cmVzb2x2ZShpbnB1dC5maWxlcyA/PyB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0aW5wdXQuY2xpY2soKTtcblxuXHRcdC8vIEVuc3VyZSB0byByZW1vdmUgdGhlIGVsZW1lbnQgZnJvbSBET00gZXZlbnR1YWxseVxuXHRcdHNldFRpbWVvdXQoKCkgPT4gaW5wdXQucmVtb3ZlKCkpO1xuXHR9KTtcbn1cblxuZXhwb3J0IGVudW0gRGV0ZWN0ZWRGdWxsc2NyZWVuTW9kZSB7XG5cblx0LyoqXG5cdCAqIFRoZSBkb2N1bWVudCBpcyBmdWxsc2NyZWVuLCBlLmcuIGJlY2F1c2UgYW4gZWxlbWVudFxuXHQgKiBpbiB0aGUgZG9jdW1lbnQgcmVxdWVzdGVkIHRvIGJlIGZ1bGxzY3JlZW4uXG5cdCAqL1xuXHRET0NVTUVOVCA9IDEsXG5cblx0LyoqXG5cdCAqIFRoZSBicm93c2VyIGlzIGZ1bGxzY3JlZW4sIGUuZy4gYmVjYXVzZSB0aGUgdXNlciBlbmFibGVkXG5cdCAqIG5hdGl2ZSB3aW5kb3cgZnVsbHNjcmVlbiBmb3IgaXQuXG5cdCAqL1xuXHRCUk9XU0VSXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURldGVjdGVkRnVsbHNjcmVlbiB7XG5cblx0LyoqXG5cdCAqIEZpZ3VyZSBvdXQgaWYgdGhlIGRvY3VtZW50IGlzIGZ1bGxzY3JlZW4gb3IgdGhlIGJyb3dzZXIuXG5cdCAqL1xuXHRtb2RlOiBEZXRlY3RlZEZ1bGxzY3JlZW5Nb2RlO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHdlIGtub3cgZm9yIHN1cmUgdGhhdCB3ZSBhcmUgaW4gZnVsbHNjcmVlbiBtb2RlIG9yXG5cdCAqIGl0IGlzIGEgZ3Vlc3MuXG5cdCAqL1xuXHRndWVzczogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRldGVjdEZ1bGxzY3JlZW4odGFyZ2V0V2luZG93OiBXaW5kb3cpOiBJRGV0ZWN0ZWRGdWxsc2NyZWVuIHwgbnVsbCB7XG5cblx0Ly8gQnJvd3NlciBmdWxsc2NyZWVuOiB1c2UgRE9NIEFQSXMgdG8gZGV0ZWN0XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRpZiAodGFyZ2V0V2luZG93LmRvY3VtZW50LmZ1bGxzY3JlZW5FbGVtZW50IHx8ICg8YW55PnRhcmdldFdpbmRvdy5kb2N1bWVudCkud2Via2l0RnVsbHNjcmVlbkVsZW1lbnQgfHwgKDxhbnk+dGFyZ2V0V2luZG93LmRvY3VtZW50KS53ZWJraXRJc0Z1bGxTY3JlZW4pIHtcblx0XHRyZXR1cm4geyBtb2RlOiBEZXRlY3RlZEZ1bGxzY3JlZW5Nb2RlLkRPQ1VNRU5ULCBndWVzczogZmFsc2UgfTtcblx0fVxuXG5cdC8vIFRoZXJlIGlzIG5vIHN0YW5kYXJkIHdheSB0byBmaWd1cmUgb3V0IGlmIHRoZSBicm93c2VyXG5cdC8vIGlzIHVzaW5nIG5hdGl2ZSBmdWxsc2NyZWVuLiBWaWEgY2hlY2tpbmcgb24gc2NyZWVuXG5cdC8vIGhlaWdodCBhbmQgY29tcGFyaW5nIHRoYXQgdG8gd2luZG93IGhlaWdodCwgd2UgY2FuIGd1ZXNzXG5cdC8vIGl0IHRob3VnaC5cblxuXHRpZiAodGFyZ2V0V2luZG93LmlubmVySGVpZ2h0ID09PSB0YXJnZXRXaW5kb3cuc2NyZWVuLmhlaWdodCkge1xuXHRcdC8vIGlmIHRoZSBoZWlnaHQgb2YgdGhlIHdpbmRvdyBtYXRjaGVzIHRoZSBzY3JlZW4gaGVpZ2h0LCB3ZSBjYW5cblx0XHQvLyBzYWZlbHkgYXNzdW1lIHRoYXQgdGhlIGJyb3dzZXIgaXMgZnVsbHNjcmVlbiBiZWNhdXNlIG5vIGJyb3dzZXJcblx0XHQvLyBjaHJvbWUgaXMgdGFraW5nIGhlaWdodCBhd2F5IChlLmcuIGxpa2UgdG9vbGJhcnMpLlxuXHRcdHJldHVybiB7IG1vZGU6IERldGVjdGVkRnVsbHNjcmVlbk1vZGUuQlJPV1NFUiwgZ3Vlc3M6IGZhbHNlIH07XG5cdH1cblxuXHRpZiAocGxhdGZvcm0uaXNNYWNpbnRvc2ggfHwgcGxhdGZvcm0uaXNMaW51eCkge1xuXHRcdC8vIG1hY09TIGFuZCBMaW51eCBkbyBub3QgcHJvcGVybHkgcmVwb3J0IGBpbm5lckhlaWdodGAsIG9ubHkgV2luZG93cyBkb2VzXG5cdFx0aWYgKHRhcmdldFdpbmRvdy5vdXRlckhlaWdodCA9PT0gdGFyZ2V0V2luZG93LnNjcmVlbi5oZWlnaHQgJiYgdGFyZ2V0V2luZG93Lm91dGVyV2lkdGggPT09IHRhcmdldFdpbmRvdy5zY3JlZW4ud2lkdGgpIHtcblx0XHRcdC8vIGlmIHRoZSBoZWlnaHQgb2YgdGhlIGJyb3dzZXIgbWF0Y2hlcyB0aGUgc2NyZWVuIGhlaWdodCwgd2UgY2FuXG5cdFx0XHQvLyBvbmx5IGd1ZXNzIHRoYXQgd2UgYXJlIGluIGZ1bGxzY3JlZW4uIEl0IGlzIGFsc28gcG9zc2libGUgdGhhdFxuXHRcdFx0Ly8gdGhlIHVzZXIgaGFzIHR1cm5lZCBvZmYgdGFza2JhcnMgaW4gdGhlIE9TIGFuZCB0aGUgYnJvd3NlciBpc1xuXHRcdFx0Ly8gc2ltcGx5IGFibGUgdG8gc3BhbiB0aGUgZW50aXJlIHNpemUgb2YgdGhlIHNjcmVlbi5cblx0XHRcdHJldHVybiB7IG1vZGU6IERldGVjdGVkRnVsbHNjcmVlbk1vZGUuQlJPV1NFUiwgZ3Vlc3M6IHRydWUgfTtcblx0XHR9XG5cdH1cblxuXHQvLyBOb3QgaW4gZnVsbHNjcmVlblxuXHRyZXR1cm4gbnVsbDtcbn1cblxudHlwZSBNb2RpZmllcktleSA9ICdhbHQnIHwgJ2N0cmwnIHwgJ3NoaWZ0JyB8ICdtZXRhJztcblxuZXhwb3J0IGludGVyZmFjZSBJTW9kaWZpZXJLZXlTdGF0dXMge1xuXHRhbHRLZXk6IGJvb2xlYW47XG5cdHNoaWZ0S2V5OiBib29sZWFuO1xuXHRjdHJsS2V5OiBib29sZWFuO1xuXHRtZXRhS2V5OiBib29sZWFuO1xuXHRsYXN0S2V5UHJlc3NlZD86IE1vZGlmaWVyS2V5O1xuXHRsYXN0S2V5UmVsZWFzZWQ/OiBNb2RpZmllcktleTtcblx0ZXZlbnQ/OiBLZXlib2FyZEV2ZW50O1xufVxuXG5leHBvcnQgY2xhc3MgTW9kaWZpZXJLZXlFbWl0dGVyIGV4dGVuZHMgZXZlbnQuRW1pdHRlcjxJTW9kaWZpZXJLZXlTdGF0dXM+IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdWJzY3JpcHRpb25zID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIF9rZXlTdGF0dXM6IElNb2RpZmllcktleVN0YXR1cztcblx0cHJpdmF0ZSBzdGF0aWMgaW5zdGFuY2U6IE1vZGlmaWVyS2V5RW1pdHRlciB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9rZXlTdGF0dXMgPSB7XG5cdFx0XHRhbHRLZXk6IGZhbHNlLFxuXHRcdFx0c2hpZnRLZXk6IGZhbHNlLFxuXHRcdFx0Y3RybEtleTogZmFsc2UsXG5cdFx0XHRtZXRhS2V5OiBmYWxzZVxuXHRcdH07XG5cblx0XHR0aGlzLl9zdWJzY3JpcHRpb25zLmFkZChldmVudC5FdmVudC5ydW5BbmRTdWJzY3JpYmUob25EaWRSZWdpc3RlcldpbmRvdywgKHsgd2luZG93LCBkaXNwb3NhYmxlcyB9KSA9PiB0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKHdpbmRvdywgZGlzcG9zYWJsZXMpLCB7IHdpbmRvdzogbWFpbldpbmRvdywgZGlzcG9zYWJsZXM6IHRoaXMuX3N1YnNjcmlwdGlvbnMgfSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycyh3aW5kb3c6IFdpbmRvdywgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IHZvaWQge1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIod2luZG93LCAna2V5ZG93bicsIGUgPT4ge1xuXHRcdFx0aWYgKGUuZGVmYXVsdFByZXZlbnRlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdC8vIElmIEFsdC1rZXkga2V5ZG93biBldmVudCBpcyByZXBlYXRlZCwgaWdub3JlIGl0ICMxMTIzNDdcblx0XHRcdC8vIE9ubHkga25vd24gdG8gYmUgbmVjZXNzYXJ5IGZvciBBbHQtS2V5IGF0IHRoZSBtb21lbnQgIzExNTgxMFxuXHRcdFx0aWYgKGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuQWx0ICYmIGUucmVwZWF0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGUuYWx0S2V5ICYmICF0aGlzLl9rZXlTdGF0dXMuYWx0S2V5KSB7XG5cdFx0XHRcdHRoaXMuX2tleVN0YXR1cy5sYXN0S2V5UHJlc3NlZCA9ICdhbHQnO1xuXHRcdFx0fSBlbHNlIGlmIChlLmN0cmxLZXkgJiYgIXRoaXMuX2tleVN0YXR1cy5jdHJsS2V5KSB7XG5cdFx0XHRcdHRoaXMuX2tleVN0YXR1cy5sYXN0S2V5UHJlc3NlZCA9ICdjdHJsJztcblx0XHRcdH0gZWxzZSBpZiAoZS5tZXRhS2V5ICYmICF0aGlzLl9rZXlTdGF0dXMubWV0YUtleSkge1xuXHRcdFx0XHR0aGlzLl9rZXlTdGF0dXMubGFzdEtleVByZXNzZWQgPSAnbWV0YSc7XG5cdFx0XHR9IGVsc2UgaWYgKGUuc2hpZnRLZXkgJiYgIXRoaXMuX2tleVN0YXR1cy5zaGlmdEtleSkge1xuXHRcdFx0XHR0aGlzLl9rZXlTdGF0dXMubGFzdEtleVByZXNzZWQgPSAnc2hpZnQnO1xuXHRcdFx0fSBlbHNlIGlmIChldmVudC5rZXlDb2RlICE9PSBLZXlDb2RlLkFsdCkge1xuXHRcdFx0XHR0aGlzLl9rZXlTdGF0dXMubGFzdEtleVByZXNzZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2tleVN0YXR1cy5hbHRLZXkgPSBlLmFsdEtleTtcblx0XHRcdHRoaXMuX2tleVN0YXR1cy5jdHJsS2V5ID0gZS5jdHJsS2V5O1xuXHRcdFx0dGhpcy5fa2V5U3RhdHVzLm1ldGFLZXkgPSBlLm1ldGFLZXk7XG5cdFx0XHR0aGlzLl9rZXlTdGF0dXMuc2hpZnRLZXkgPSBlLnNoaWZ0S2V5O1xuXG5cdFx0XHRpZiAodGhpcy5fa2V5U3RhdHVzLmxhc3RLZXlQcmVzc2VkKSB7XG5cdFx0XHRcdHRoaXMuX2tleVN0YXR1cy5ldmVudCA9IGU7XG5cdFx0XHRcdHRoaXMuZmlyZSh0aGlzLl9rZXlTdGF0dXMpO1xuXHRcdFx0fVxuXHRcdH0sIHRydWUpKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIod2luZG93LCAna2V5dXAnLCBlID0+IHtcblx0XHRcdGlmIChlLmRlZmF1bHRQcmV2ZW50ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWUuYWx0S2V5ICYmIHRoaXMuX2tleVN0YXR1cy5hbHRLZXkpIHtcblx0XHRcdFx0dGhpcy5fa2V5U3RhdHVzLmxhc3RLZXlSZWxlYXNlZCA9ICdhbHQnO1xuXHRcdFx0fSBlbHNlIGlmICghZS5jdHJsS2V5ICYmIHRoaXMuX2tleVN0YXR1cy5jdHJsS2V5KSB7XG5cdFx0XHRcdHRoaXMuX2tleVN0YXR1cy5sYXN0S2V5UmVsZWFzZWQgPSAnY3RybCc7XG5cdFx0XHR9IGVsc2UgaWYgKCFlLm1ldGFLZXkgJiYgdGhpcy5fa2V5U3RhdHVzLm1ldGFLZXkpIHtcblx0XHRcdFx0dGhpcy5fa2V5U3RhdHVzLmxhc3RLZXlSZWxlYXNlZCA9ICdtZXRhJztcblx0XHRcdH0gZWxzZSBpZiAoIWUuc2hpZnRLZXkgJiYgdGhpcy5fa2V5U3RhdHVzLnNoaWZ0S2V5KSB7XG5cdFx0XHRcdHRoaXMuX2tleVN0YXR1cy5sYXN0S2V5UmVsZWFzZWQgPSAnc2hpZnQnO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fa2V5U3RhdHVzLmxhc3RLZXlSZWxlYXNlZCA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuX2tleVN0YXR1cy5sYXN0S2V5UHJlc3NlZCAhPT0gdGhpcy5fa2V5U3RhdHVzLmxhc3RLZXlSZWxlYXNlZCkge1xuXHRcdFx0XHR0aGlzLl9rZXlTdGF0dXMubGFzdEtleVByZXNzZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2tleVN0YXR1cy5hbHRLZXkgPSBlLmFsdEtleTtcblx0XHRcdHRoaXMuX2tleVN0YXR1cy5jdHJsS2V5ID0gZS5jdHJsS2V5O1xuXHRcdFx0dGhpcy5fa2V5U3RhdHVzLm1ldGFLZXkgPSBlLm1ldGFLZXk7XG5cdFx0XHR0aGlzLl9rZXlTdGF0dXMuc2hpZnRLZXkgPSBlLnNoaWZ0S2V5O1xuXG5cdFx0XHRpZiAodGhpcy5fa2V5U3RhdHVzLmxhc3RLZXlSZWxlYXNlZCkge1xuXHRcdFx0XHR0aGlzLl9rZXlTdGF0dXMuZXZlbnQgPSBlO1xuXHRcdFx0XHR0aGlzLmZpcmUodGhpcy5fa2V5U3RhdHVzKTtcblx0XHRcdH1cblx0XHR9LCB0cnVlKSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHdpbmRvdy5kb2N1bWVudC5ib2R5LCAnbW91c2Vkb3duJywgKCkgPT4ge1xuXHRcdFx0dGhpcy5fa2V5U3RhdHVzLmxhc3RLZXlQcmVzc2VkID0gdW5kZWZpbmVkO1xuXHRcdH0sIHRydWUpKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIod2luZG93LmRvY3VtZW50LmJvZHksICdtb3VzZXVwJywgKCkgPT4ge1xuXHRcdFx0dGhpcy5fa2V5U3RhdHVzLmxhc3RLZXlQcmVzc2VkID0gdW5kZWZpbmVkO1xuXHRcdH0sIHRydWUpKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIod2luZG93LmRvY3VtZW50LmJvZHksICdtb3VzZW1vdmUnLCBlID0+IHtcblx0XHRcdGlmIChlLmJ1dHRvbnMpIHtcblx0XHRcdFx0dGhpcy5fa2V5U3RhdHVzLmxhc3RLZXlQcmVzc2VkID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0sIHRydWUpKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIod2luZG93LCAnYmx1cicsICgpID0+IHtcblx0XHRcdHRoaXMucmVzZXRLZXlTdGF0dXMoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRnZXQga2V5U3RhdHVzKCk6IElNb2RpZmllcktleVN0YXR1cyB7XG5cdFx0cmV0dXJuIHRoaXMuX2tleVN0YXR1cztcblx0fVxuXG5cdGdldCBpc01vZGlmaWVyUHJlc3NlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaGFzTW9kaWZpZXJLZXlzKHRoaXMuX2tleVN0YXR1cyk7XG5cdH1cblxuXHQvKipcblx0ICogQWxsb3dzIHRvIGV4cGxpY2l0bHkgcmVzZXQgdGhlIGtleSBzdGF0dXMgYmFzZWQgb24gbW9yZSBrbm93bGVkZ2UgKCMxMDkwNjIpXG5cdCAqL1xuXHRyZXNldEtleVN0YXR1cygpOiB2b2lkIHtcblx0XHR0aGlzLmRvUmVzZXRLZXlTdGF0dXMoKTtcblx0XHR0aGlzLmZpcmUodGhpcy5fa2V5U3RhdHVzKTtcblx0fVxuXG5cdHByaXZhdGUgZG9SZXNldEtleVN0YXR1cygpOiB2b2lkIHtcblx0XHR0aGlzLl9rZXlTdGF0dXMgPSB7XG5cdFx0XHRhbHRLZXk6IGZhbHNlLFxuXHRcdFx0c2hpZnRLZXk6IGZhbHNlLFxuXHRcdFx0Y3RybEtleTogZmFsc2UsXG5cdFx0XHRtZXRhS2V5OiBmYWxzZVxuXHRcdH07XG5cdH1cblxuXHRzdGF0aWMgZ2V0SW5zdGFuY2UoKSB7XG5cdFx0aWYgKCFNb2RpZmllcktleUVtaXR0ZXIuaW5zdGFuY2UpIHtcblx0XHRcdE1vZGlmaWVyS2V5RW1pdHRlci5pbnN0YW5jZSA9IG5ldyBNb2RpZmllcktleUVtaXR0ZXIoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gTW9kaWZpZXJLZXlFbWl0dGVyLmluc3RhbmNlO1xuXHR9XG5cblx0c3RhdGljIGRpc3Bvc2VJbnN0YW5jZSgpIHtcblx0XHRpZiAoTW9kaWZpZXJLZXlFbWl0dGVyLmluc3RhbmNlKSB7XG5cdFx0XHRNb2RpZmllcktleUVtaXR0ZXIuaW5zdGFuY2UuZGlzcG9zZSgpO1xuXHRcdFx0TW9kaWZpZXJLZXlFbWl0dGVyLmluc3RhbmNlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3N1YnNjcmlwdGlvbnMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDb29raWVWYWx1ZShuYW1lOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBtYXRjaCA9IGRvY3VtZW50LmNvb2tpZS5tYXRjaCgnKF58W147XSspXFxcXHMqJyArIG5hbWUgKyAnXFxcXHMqPVxcXFxzKihbXjtdKyknKTsgLy8gU2VlIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8yNTQ5MDUzMVxuXG5cdHJldHVybiBtYXRjaCA/IG1hdGNoLnBvcCgpIDogdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEcmFnQW5kRHJvcE9ic2VydmVyQ2FsbGJhY2tzIHtcblx0cmVhZG9ubHkgb25EcmFnRW50ZXI/OiAoZTogRHJhZ0V2ZW50KSA9PiB2b2lkO1xuXHRyZWFkb25seSBvbkRyYWdMZWF2ZT86IChlOiBEcmFnRXZlbnQpID0+IHZvaWQ7XG5cdHJlYWRvbmx5IG9uRHJvcD86IChlOiBEcmFnRXZlbnQpID0+IHZvaWQ7XG5cdHJlYWRvbmx5IG9uRHJhZ0VuZD86IChlOiBEcmFnRXZlbnQpID0+IHZvaWQ7XG5cdHJlYWRvbmx5IG9uRHJhZ1N0YXJ0PzogKGU6IERyYWdFdmVudCkgPT4gdm9pZDtcblx0cmVhZG9ubHkgb25EcmFnPzogKGU6IERyYWdFdmVudCkgPT4gdm9pZDtcblx0cmVhZG9ubHkgb25EcmFnT3Zlcj86IChlOiBEcmFnRXZlbnQsIGRyYWdEdXJhdGlvbjogbnVtYmVyKSA9PiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgRHJhZ0FuZERyb3BPYnNlcnZlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdC8vIEEgaGVscGVyIHRvIGZpeCBpc3N1ZXMgd2l0aCByZXBlYXRlZCBEUkFHX0VOVEVSIC8gRFJBR19MRUFWRVxuXHQvLyBjYWxscyBzZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE0NDcwXG5cdC8vIHdoZW4gdGhlIGVsZW1lbnQgaGFzIGNoaWxkIGVsZW1lbnRzIHdoZXJlIHRoZSBldmVudHMgYXJlIGZpcmVkXG5cdC8vIHJlcGVhZGVkbHkuXG5cdHByaXZhdGUgY291bnRlcjogbnVtYmVyID0gMDtcblxuXHQvLyBBbGxvd3MgdG8gbWVhc3VyZSB0aGUgZHVyYXRpb24gb2YgdGhlIGRyYWcgb3BlcmF0aW9uLlxuXHRwcml2YXRlIGRyYWdTdGFydFRpbWUgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQsIHByaXZhdGUgcmVhZG9ubHkgY2FsbGJhY2tzOiBJRHJhZ0FuZERyb3BPYnNlcnZlckNhbGxiYWNrcykge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNhbGxiYWNrcy5vbkRyYWdTdGFydCkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudCwgRXZlbnRUeXBlLkRSQUdfU1RBUlQsIChlOiBEcmFnRXZlbnQpID0+IHtcblx0XHRcdFx0dGhpcy5jYWxsYmFja3Mub25EcmFnU3RhcnQ/LihlKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jYWxsYmFja3Mub25EcmFnKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbGVtZW50LCBFdmVudFR5cGUuRFJBRywgKGU6IERyYWdFdmVudCkgPT4ge1xuXHRcdFx0XHR0aGlzLmNhbGxiYWNrcy5vbkRyYWc/LihlKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbGVtZW50LCBFdmVudFR5cGUuRFJBR19FTlRFUiwgKGU6IERyYWdFdmVudCkgPT4ge1xuXHRcdFx0dGhpcy5jb3VudGVyKys7XG5cdFx0XHR0aGlzLmRyYWdTdGFydFRpbWUgPSBlLnRpbWVTdGFtcDtcblxuXHRcdFx0dGhpcy5jYWxsYmFja3Mub25EcmFnRW50ZXI/LihlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbGVtZW50LCBFdmVudFR5cGUuRFJBR19PVkVSLCAoZTogRHJhZ0V2ZW50KSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7IC8vIG5lZWRlZCBzbyB0aGF0IHRoZSBkcm9wIGV2ZW50IGZpcmVzIChodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy8yMTMzOTkyNC9kcm9wLWV2ZW50LW5vdC1maXJpbmctaW4tY2hyb21lKVxuXG5cdFx0XHR0aGlzLmNhbGxiYWNrcy5vbkRyYWdPdmVyPy4oZSwgZS50aW1lU3RhbXAgLSB0aGlzLmRyYWdTdGFydFRpbWUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmVsZW1lbnQsIEV2ZW50VHlwZS5EUkFHX0xFQVZFLCAoZTogRHJhZ0V2ZW50KSA9PiB7XG5cdFx0XHR0aGlzLmNvdW50ZXItLTtcblxuXHRcdFx0aWYgKHRoaXMuY291bnRlciA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLmRyYWdTdGFydFRpbWUgPSAwO1xuXG5cdFx0XHRcdHRoaXMuY2FsbGJhY2tzLm9uRHJhZ0xlYXZlPy4oZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudCwgRXZlbnRUeXBlLkRSQUdfRU5ELCAoZTogRHJhZ0V2ZW50KSA9PiB7XG5cdFx0XHR0aGlzLmNvdW50ZXIgPSAwO1xuXHRcdFx0dGhpcy5kcmFnU3RhcnRUaW1lID0gMDtcblxuXHRcdFx0dGhpcy5jYWxsYmFja3Mub25EcmFnRW5kPy4oZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudCwgRXZlbnRUeXBlLkRST1AsIChlOiBEcmFnRXZlbnQpID0+IHtcblx0XHRcdHRoaXMuY291bnRlciA9IDA7XG5cdFx0XHR0aGlzLmRyYWdTdGFydFRpbWUgPSAwO1xuXG5cdFx0XHR0aGlzLmNhbGxiYWNrcy5vbkRyb3A/LihlKTtcblx0XHR9KSk7XG5cdH1cbn1cblxuLyoqXG4gKiBBIHdyYXBwZXIgYXJvdW5kIGBSZXNpemVPYnNlcnZlcmAgdGhhdCBpcyBkaXNwb3NhYmxlLlxuICpcbiAqIEJlaGF2aW9yIGlzIGludGVudGlvbmFsbHkgaWRlbnRpY2FsIHRvIHVzaW5nIGBuZXcgUmVzaXplT2JzZXJ2ZXIoY2FsbGJhY2spYFxuICogZGlyZWN0bHk6IHRoZSB1c2VyLXN1cHBsaWVkIGNhbGxiYWNrIHJ1bnMgc3luY2hyb25vdXNseSBpbnNpZGUgdGhlXG4gKiBicm93c2VyJ3MgcmVzaXplLW9ic2VydmF0aW9uIHBoYXNlLCB3aXRoIHRoZSBlbnRyaWVzIHRoZSBicm93c2VyIGRlbGl2ZXJlZC5cbiAqIFRoZSB3cmFwcGVyIGFkZHMgdGhyZWUgdGhpbmdzIG9uIHRvcDpcbiAqXG4gKiAxLiBMaWZldGltZSBtYW5hZ2VtZW50OiBgZGlzcG9zZSgpYCBkaXNjb25uZWN0cyB0aGUgdW5kZXJseWluZyBvYnNlcnZlci5cbiAqIDIuIEF1eGlsaWFyeS13aW5kb3cgc3VwcG9ydDogcGFzcyBgdGFyZ2V0V2luZG93YCBzbyB0aGUgb2JzZXJ2ZXIgaXNcbiAqICAgIGNvbnN0cnVjdGVkIGluIHRoZSByZWFsbSBvZiB0aGUgZWxlbWVudCBiZWluZyBvYnNlcnZlZC5cbiAqIDMuIENvbnRleHQgZm9yIHRoZVxuICogICAgYFJlc2l6ZU9ic2VydmVyIGxvb3AgY29tcGxldGVkIHdpdGggdW5kZWxpdmVyZWQgbm90aWZpY2F0aW9uc2Agd2FybmluZzpcbiAqICAgIGVhY2ggaW5zdGFuY2UgY2FycmllcyBhIHN0YWJsZSBgbmFtZWAsIGFuZCBqdXN0IGJlZm9yZSBpbnZva2luZyB0aGUgdXNlclxuICogICAgY2FsbGJhY2sgd2UgYWRkIHRoYXQgbmFtZSB0byBhIGJvdW5kZWQsIHBlci13aW5kb3cgc2V0IHRoYXQgaXMgY2xlYXJlZFxuICogICAgYXQgdGhlIG5leHQgYW5pbWF0aW9uIGZyYW1lLiBUaGUgd2FybmluZyBpcyBkZWxpdmVyZWQgYXMgYSBzdGFja2xlc3NcbiAqICAgIGBFcnJvckV2ZW50YCBvbiBgd2luZG93YCBhZnRlciBjYWxsYmFja3MgcnVuLCBzbyBlcnJvciB0ZWxlbWV0cnkgY2FuXG4gKiAgICBpbmNsdWRlIHRoZSB3cmFwcGVkIG9ic2VydmVycyB0aGF0IHJlY2VudGx5IHJhbiBpbiB0aGF0IHdpbmRvdyAoc2VlXG4gKiAgICB7QGxpbmsgZ2V0UmVjZW50RGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyQ29udGV4dEZvckxvb3BFcnJvcn0pLiBUaGlzIGlzXG4gKiAgICBkZWxpdmVyeSBjb250ZXh0LCBub3QgY2F1c2FsIGF0dHJpYnV0aW9uOiB0aGUgYnJvd3NlciBkb2VzIG5vdCBleHBvc2VcbiAqICAgIHdoaWNoIG9ic2VydmVyIG9yIHNraXBwZWQgdGFyZ2V0IGNhdXNlZCB0aGUgd2FybmluZy5cbiAqXG4gKiBAcGFyYW0gbmFtZSBTdGFibGUgaWRlbnRpZmllciB1c2VkIGluIGxvb3Atd2FybmluZyBjb250ZXh0LiBQcmVmZXIgb25lIHRoYXRcbiAqIHN1cnZpdmVzIG1pbmlmaWNhdGlvbiBhbmQgcmVmYWN0b3JzIChlLmcuIHRoZSBjb25zdW1lciBjbGFzcyArIHB1cnBvc2UpXG4gKiBzaW5jZSBjYWxsc3RhY2tzIGNoYW5nZSBhY3Jvc3MgcmVsZWFzZXMuXG4gKiBAcGFyYW0gY2FsbGJhY2sgSW52b2tlZCBzeW5jaHJvbm91c2x5IHdoZW4gdGhlIGJyb3dzZXIgZGVsaXZlcnMgcmVzaXplXG4gKiBub3RpZmljYXRpb25zLCB3aXRoIHRoZSBzYW1lIGVudHJpZXMgdGhlIG5hdGl2ZSBgUmVzaXplT2JzZXJ2ZXJgIHdvdWxkXG4gKiBoYXZlIGRlbGl2ZXJlZC5cbiAqIEBwYXJhbSB0YXJnZXRXaW5kb3cgVGhlIHdpbmRvdyB3aG9zZSBgUmVzaXplT2JzZXJ2ZXJgIGNvbnN0cnVjdG9yIHNob3VsZFxuICogYmUgdXNlZC4gRGVmYXVsdHMgdG8gYG1haW5XaW5kb3dgLiBQYXNzIHRoZSBjb250YWluaW5nIHdpbmRvdyB3aGVuXG4gKiBjcmVhdGluZyBhbiBvYnNlcnZlciBmb3IgZWxlbWVudHMgdGhhdCBsaXZlIGluIGFuIGF1eGlsaWFyeSB3aW5kb3cuXG4gKiBAcGFyYW0gb3B0aW9ucyBPcHRpb25hbCBjb25maWd1cmF0aW9uLiBgcmVzaXplT2JzZXJ2ZXJDdG9yYCBpcyBhIHRlc3RcbiAqIHNlYW0gdGhhdCBkZWZhdWx0cyB0byBgdGFyZ2V0V2luZG93LlJlc2l6ZU9ic2VydmVyYC5cbiAqL1xuZXhwb3J0IGNsYXNzIERpc3Bvc2FibGVSZXNpemVPYnNlcnZlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgb2JzZXJ2ZXI6IFJlc2l6ZU9ic2VydmVyO1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bmFtZTogc3RyaW5nLFxuXHRcdGNhbGxiYWNrOiBSZXNpemVPYnNlcnZlckNhbGxiYWNrLFxuXHRcdHRhcmdldFdpbmRvdzogQ29kZVdpbmRvdyA9IG1haW5XaW5kb3csXG5cdFx0b3B0aW9ucz86IHsgcmVzaXplT2JzZXJ2ZXJDdG9yPzogdHlwZW9mIFJlc2l6ZU9ic2VydmVyIH0sXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5uYW1lID0gbmFtZTtcblx0XHRjb25zdCBjdG9yID0gb3B0aW9ucz8ucmVzaXplT2JzZXJ2ZXJDdG9yID8/IHRhcmdldFdpbmRvdy5SZXNpemVPYnNlcnZlcjtcblx0XHR0aGlzLm9ic2VydmVyID0gbmV3IGN0b3IoKGVudHJpZXM6IFJlc2l6ZU9ic2VydmVyRW50cnlbXSwgb2JzZXJ2ZXIpID0+IHtcblx0XHRcdHJlY29yZERpc3Bvc2FibGVSZXNpemVPYnNlcnZlckludm9jYXRpb24odGFyZ2V0V2luZG93LCB0aGlzLm5hbWUpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y2FsbGJhY2soZW50cmllcywgb2JzZXJ2ZXIpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5vYnNlcnZlci5kaXNjb25uZWN0KCkpKTtcblx0fVxuXG5cdG9ic2VydmUodGFyZ2V0OiBFbGVtZW50LCBvcHRpb25zPzogUmVzaXplT2JzZXJ2ZXJPcHRpb25zKTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMub2JzZXJ2ZXIub2JzZXJ2ZSh0YXJnZXQsIG9wdGlvbnMpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5vYnNlcnZlci51bm9ic2VydmUodGFyZ2V0KSk7XG5cdH1cbn1cblxuLyoqXG4gKiBLZWVwIHRoZSBjb250ZXh0IGJvdW5kZWQgc28gYSBsYXJnZSBkZWxpdmVyeSBwaGFzZSBjYW5ub3QgY3JlYXRlIGFuXG4gKiB1bmJvdW5kZWQgdGVsZW1ldHJ5IHZhbHVlLiBOYW1lcyBhcmUgc3RhdGljIGNvbXBvbmVudCBpZGVudGlmaWVycywgYW5kIGFyZVxuICogc29ydGVkIHdoZW4gcmVhZCBzbyBlcXVpdmFsZW50IHBoYXNlcyBzaGFyZSBhIHN0YWJsZSBidWNrZXQuXG4gKi9cbmNvbnN0IG1heFJlY2VudERpc3Bvc2FibGVSZXNpemVPYnNlcnZlcnMgPSA4O1xuXG4vKipcbiAqIFdyYXBwZWQgb2JzZXJ2ZXJzIHRoYXQgcmFuIHJlY2VudGx5IGluIG9uZSB3aW5kb3cuIFRoaXMgaXMgZGVsaWJlcmF0ZWx5XG4gKiBzY29wZWQgYnkgd2luZG93IGJlY2F1c2UgYXV4aWxpYXJ5IHdpbmRvd3MgaGF2ZSBpbmRlcGVuZGVudCBkb2N1bWVudHMgYW5kXG4gKiByZXNpemUtb2JzZXJ2YXRpb24gZGVsaXZlcnkgbG9vcHMuXG4gKi9cbmludGVyZmFjZSBJUmVjZW50RGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyQ29udGV4dCB7XG5cdHJlYWRvbmx5IG5hbWVzOiBTZXQ8c3RyaW5nPjtcblx0b3ZlcmZsb3c6IGJvb2xlYW47XG59XG5cbmNvbnN0IHJlY2VudERpc3Bvc2FibGVSZXNpemVPYnNlcnZlckNvbnRleHRzID0gbmV3IFdlYWtNYXA8Q29kZVdpbmRvdywgSVJlY2VudERpc3Bvc2FibGVSZXNpemVPYnNlcnZlckNvbnRleHQ+KCk7XG5cbmZ1bmN0aW9uIHJlY29yZERpc3Bvc2FibGVSZXNpemVPYnNlcnZlckludm9jYXRpb24odGFyZ2V0V2luZG93OiBDb2RlV2luZG93LCBuYW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0bGV0IGNvbnRleHQgPSByZWNlbnREaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXJDb250ZXh0cy5nZXQodGFyZ2V0V2luZG93KTtcblx0aWYgKCFjb250ZXh0KSB7XG5cdFx0Y29udGV4dCA9IHsgbmFtZXM6IG5ldyBTZXQoKSwgb3ZlcmZsb3c6IGZhbHNlIH07XG5cdFx0cmVjZW50RGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyQ29udGV4dHMuc2V0KHRhcmdldFdpbmRvdywgY29udGV4dCk7XG5cblx0XHQvLyBSZXNpemVPYnNlcnZlciBjYWxsYmFja3MgYW5kIHRoZSBzeW50aGV0aWMgbG9vcCBlcnJvciBhcmUgZGVsaXZlcmVkXG5cdFx0Ly8gYWZ0ZXIgcmVxdWVzdEFuaW1hdGlvbkZyYW1lIGNhbGxiYWNrcyBpbiB0aGUgcmVuZGVyaW5nIHVwZGF0ZS4gQVxuXHRcdC8vIHJlcXVlc3QgbWFkZSBoZXJlIHRoZXJlZm9yZSBjbGVhcnMgdGhpcyBjb250ZXh0IGF0IHRoZSBuZXh0IGZyYW1lLFxuXHRcdC8vIGFmdGVyIHRlbGVtZXRyeSBoYXMgb2JzZXJ2ZWQgYW55IHdhcm5pbmcgZnJvbSB0aGUgY3VycmVudCB1cGRhdGUuXG5cdFx0dGFyZ2V0V2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiByZWNlbnREaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXJDb250ZXh0cy5kZWxldGUodGFyZ2V0V2luZG93KSk7XG5cdH1cblxuXHRpZiAoY29udGV4dC5uYW1lcy5oYXMobmFtZSkpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0aWYgKGNvbnRleHQubmFtZXMuc2l6ZSA8IG1heFJlY2VudERpc3Bvc2FibGVSZXNpemVPYnNlcnZlcnMpIHtcblx0XHRjb250ZXh0Lm5hbWVzLmFkZChuYW1lKTtcblx0fSBlbHNlIHtcblx0XHRjb250ZXh0Lm92ZXJmbG93ID0gdHJ1ZTtcblx0XHRjb25zdCBsYXJnZXN0TmFtZSA9IEFycmF5LmZyb20oY29udGV4dC5uYW1lcykuc29ydCgpLmF0KC0xKSE7XG5cdFx0aWYgKG5hbWUgPCBsYXJnZXN0TmFtZSkge1xuXHRcdFx0Y29udGV4dC5uYW1lcy5kZWxldGUobGFyZ2VzdE5hbWUpO1xuXHRcdFx0Y29udGV4dC5uYW1lcy5hZGQobmFtZSk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogSWYgYG1lc3NhZ2VgIGxvb2tzIGxpa2UgdGhlIFJlc2l6ZU9ic2VydmVyIGxvb3Agd2FybmluZywgcmV0dXJuIGEgc3RhYmxlXG4gKiBjb250ZXh0IHN0cmluZyBjb250YWluaW5nIHRoZSB3cmFwcGVkIG9ic2VydmVycyB0aGF0IHJhbiByZWNlbnRseSBpblxuICogYHRhcmdldFdpbmRvd2AuIFRoZSBuYW1lcyBhcmUgZGVsaXZlcnkgY29udGV4dCBvbmx5OyB0aGUgYnJvd3NlciBkb2VzIG5vdFxuICogZXhwb3NlIHRoZSBvYnNlcnZlciBvciBza2lwcGVkIHRhcmdldCB0aGF0IGNhdXNlZCB0aGUgd2FybmluZy4gUmV0dXJuc1xuICogYHVuZGVmaW5lZGAgZm9yIHVucmVsYXRlZCBtZXNzYWdlcyBvciB3aGVuIG5vIHdyYXBwZWQgb2JzZXJ2ZXIgaGFzIGZpcmVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVjZW50RGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyQ29udGV4dEZvckxvb3BFcnJvcihcblx0bWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkIHwgbnVsbCxcblx0dGFyZ2V0V2luZG93OiBDb2RlV2luZG93ID0gbWFpbldpbmRvdyxcbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICh0eXBlb2YgbWVzc2FnZSAhPT0gJ3N0cmluZycgfHwgIW1lc3NhZ2UuaW5jbHVkZXMoJ1Jlc2l6ZU9ic2VydmVyIGxvb3AnKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgY29udGV4dCA9IHJlY2VudERpc3Bvc2FibGVSZXNpemVPYnNlcnZlckNvbnRleHRzLmdldCh0YXJnZXRXaW5kb3cpO1xuXHRpZiAoIWNvbnRleHQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IG5hbWVzID0gQXJyYXkuZnJvbShjb250ZXh0Lm5hbWVzKS5zb3J0KCk7XG5cdGlmIChjb250ZXh0Lm92ZXJmbG93KSB7XG5cdFx0bmFtZXMucHVzaCgnPG92ZXJmbG93PicpO1xuXHR9XG5cdHJldHVybiBgW1Jlc2l6ZU9ic2VydmVyTG9vcENvbnRleHQoJHtuYW1lcy5qb2luKCcsJyl9KV0gJHttZXNzYWdlfWA7XG59XG5cbnR5cGUgSFRNTEVsZW1lbnRBdHRyaWJ1dGVLZXlzPFQ+ID0gUGFydGlhbDx7IFtLIGluIGtleW9mIFRdOiBUW0tdIGV4dGVuZHMgRnVuY3Rpb24gPyBuZXZlciA6IFRbS10gZXh0ZW5kcyBvYmplY3QgPyBIVE1MRWxlbWVudEF0dHJpYnV0ZUtleXM8VFtLXT4gOiBUW0tdIH0+O1xudHlwZSBFbGVtZW50QXR0cmlidXRlczxUPiA9IEhUTUxFbGVtZW50QXR0cmlidXRlS2V5czxUPiAmIFJlY29yZDxzdHJpbmcsIGFueT47XG50eXBlIFJlbW92ZUhUTUxFbGVtZW50PFQ+ID0gVCBleHRlbmRzIEhUTUxFbGVtZW50ID8gbmV2ZXIgOiBUO1xudHlwZSBVbmlvblRvSW50ZXJzZWN0aW9uPFU+ID0gKFUgZXh0ZW5kcyBhbnkgPyAoazogVSkgPT4gdm9pZCA6IG5ldmVyKSBleHRlbmRzICgoazogaW5mZXIgSSkgPT4gdm9pZCkgPyBJIDogbmV2ZXI7XG50eXBlIEFycmF5VG9PYmo8VCBleHRlbmRzIHJlYWRvbmx5IGFueVtdPiA9IFVuaW9uVG9JbnRlcnNlY3Rpb248UmVtb3ZlSFRNTEVsZW1lbnQ8VFtudW1iZXJdPj47XG50eXBlIEhIVE1MRWxlbWVudFRhZ05hbWVNYXAgPSBIVE1MRWxlbWVudFRhZ05hbWVNYXAgJiB7ICcnOiBIVE1MRGl2RWxlbWVudCB9O1xuXG50eXBlIFRhZ1RvRWxlbWVudDxUPiA9IFQgZXh0ZW5kcyBgJHtpbmZlciBUU3RhcnR9IyR7c3RyaW5nfWBcblx0PyBUU3RhcnQgZXh0ZW5kcyBrZXlvZiBISFRNTEVsZW1lbnRUYWdOYW1lTWFwXG5cdD8gSEhUTUxFbGVtZW50VGFnTmFtZU1hcFtUU3RhcnRdXG5cdDogSFRNTEVsZW1lbnRcblx0OiBUIGV4dGVuZHMgYCR7aW5mZXIgVFN0YXJ0fS4ke3N0cmluZ31gXG5cdD8gVFN0YXJ0IGV4dGVuZHMga2V5b2YgSEhUTUxFbGVtZW50VGFnTmFtZU1hcFxuXHQ/IEhIVE1MRWxlbWVudFRhZ05hbWVNYXBbVFN0YXJ0XVxuXHQ6IEhUTUxFbGVtZW50XG5cdDogVCBleHRlbmRzIGtleW9mIEhUTUxFbGVtZW50VGFnTmFtZU1hcFxuXHQ/IEhUTUxFbGVtZW50VGFnTmFtZU1hcFtUXVxuXHQ6IEhUTUxFbGVtZW50O1xuXG50eXBlIFRhZ1RvRWxlbWVudEFuZElkPFRUYWc+ID0gVFRhZyBleHRlbmRzIGAke2luZmVyIFRUYWd9QCR7aW5mZXIgVElkfWBcblx0PyB7IGVsZW1lbnQ6IFRhZ1RvRWxlbWVudDxUVGFnPjsgaWQ6IFRJZCB9XG5cdDogeyBlbGVtZW50OiBUYWdUb0VsZW1lbnQ8VFRhZz47IGlkOiAncm9vdCcgfTtcblxudHlwZSBUYWdUb1JlY29yZDxUVGFnPiA9IFRhZ1RvRWxlbWVudEFuZElkPFRUYWc+IGV4dGVuZHMgeyBlbGVtZW50OiBpbmZlciBURWxlbWVudDsgaWQ6IGluZmVyIFRJZCB9XG5cdD8gUmVjb3JkPChUSWQgZXh0ZW5kcyBzdHJpbmcgPyBUSWQgOiBuZXZlcikgfCAncm9vdCcsIFRFbGVtZW50PlxuXHQ6IG5ldmVyO1xuXG50eXBlIENoaWxkID0gSFRNTEVsZW1lbnQgfCBzdHJpbmcgfCBSZWNvcmQ8c3RyaW5nLCBIVE1MRWxlbWVudD47XG5cbmNvbnN0IEhfUkVHRVggPSAvKD88dGFnPltcXHdcXC1dKyk/KD86Iyg/PGlkPltcXHdcXC1dKykpPyg/PGNsYXNzPig/OlxcLig/OltcXHdcXC1dKykpKikoPzpAKD88bmFtZT4oPzpbXFx3XFxfXSkrKSk/LztcblxuLyoqXG4gKiBBIGhlbHBlciBmdW5jdGlvbiB0byBjcmVhdGUgbmVzdGVkIGRvbSBub2Rlcy5cbiAqXG4gKlxuICogYGBgdHNcbiAqIGNvbnN0IGVsZW1lbnRzID0gaCgnZGl2LmNvZGUtdmlldycsIFtcbiAqIFx0aCgnZGl2LnRpdGxlQHRpdGxlJyksXG4gKiBcdGgoJ2Rpdi5jb250YWluZXInLCBbXG4gKiBcdFx0aCgnZGl2Lmd1dHRlckBndXR0ZXJEaXYnKSxcbiAqIFx0XHRoKCdkaXZAZWRpdG9yJyksXG4gKiBcdF0pLFxuICogXSk7XG4gKiBjb25zdCBlZGl0b3IgPSBjcmVhdGVFZGl0b3IoZWxlbWVudHMuZWRpdG9yKTtcbiAqIGBgYFxuKi9cbmV4cG9ydCBmdW5jdGlvbiBoPFRUYWcgZXh0ZW5kcyBzdHJpbmc+XG5cdCh0YWc6IFRUYWcpOlxuXHRUYWdUb1JlY29yZDxUVGFnPiBleHRlbmRzIGluZmVyIFkgPyB7IFtUS2V5IGluIGtleW9mIFldOiBZW1RLZXldIH0gOiBuZXZlcjtcblxuZXhwb3J0IGZ1bmN0aW9uIGg8VFRhZyBleHRlbmRzIHN0cmluZywgVCBleHRlbmRzIENoaWxkW10+XG5cdCh0YWc6IFRUYWcsIGNoaWxkcmVuOiBbLi4uVF0pOlxuXHQoQXJyYXlUb09iajxUPiAmIFRhZ1RvUmVjb3JkPFRUYWc+KSBleHRlbmRzIGluZmVyIFkgPyB7IFtUS2V5IGluIGtleW9mIFldOiBZW1RLZXldIH0gOiBuZXZlcjtcblxuZXhwb3J0IGZ1bmN0aW9uIGg8VFRhZyBleHRlbmRzIHN0cmluZz5cblx0KHRhZzogVFRhZywgYXR0cmlidXRlczogUGFydGlhbDxFbGVtZW50QXR0cmlidXRlczxUYWdUb0VsZW1lbnQ8VFRhZz4+Pik6XG5cdFRhZ1RvUmVjb3JkPFRUYWc+IGV4dGVuZHMgaW5mZXIgWSA/IHsgW1RLZXkgaW4ga2V5b2YgWV06IFlbVEtleV0gfSA6IG5ldmVyO1xuXG5leHBvcnQgZnVuY3Rpb24gaDxUVGFnIGV4dGVuZHMgc3RyaW5nLCBUIGV4dGVuZHMgQ2hpbGRbXT5cblx0KHRhZzogVFRhZywgYXR0cmlidXRlczogUGFydGlhbDxFbGVtZW50QXR0cmlidXRlczxUYWdUb0VsZW1lbnQ8VFRhZz4+PiwgY2hpbGRyZW46IFsuLi5UXSk6XG5cdChBcnJheVRvT2JqPFQ+ICYgVGFnVG9SZWNvcmQ8VFRhZz4pIGV4dGVuZHMgaW5mZXIgWSA/IHsgW1RLZXkgaW4ga2V5b2YgWV06IFlbVEtleV0gfSA6IG5ldmVyO1xuXG5leHBvcnQgZnVuY3Rpb24gaCh0YWc6IHN0cmluZywgLi4uYXJnczogW10gfCBbYXR0cmlidXRlczogeyAkOiBzdHJpbmcgfSAmIFBhcnRpYWw8RWxlbWVudEF0dHJpYnV0ZXM8SFRNTEVsZW1lbnQ+PiB8IFJlY29yZDxzdHJpbmcsIGFueT4sIGNoaWxkcmVuPzogYW55W11dIHwgW2NoaWxkcmVuOiBhbnlbXV0pOiBSZWNvcmQ8c3RyaW5nLCBIVE1MRWxlbWVudD4ge1xuXHRsZXQgYXR0cmlidXRlczogeyAkPzogc3RyaW5nIH0gJiBQYXJ0aWFsPEVsZW1lbnRBdHRyaWJ1dGVzPEhUTUxFbGVtZW50Pj47XG5cdGxldCBjaGlsZHJlbjogKFJlY29yZDxzdHJpbmcsIEhUTUxFbGVtZW50PiB8IEhUTUxFbGVtZW50KVtdIHwgdW5kZWZpbmVkO1xuXG5cdGlmIChBcnJheS5pc0FycmF5KGFyZ3NbMF0pKSB7XG5cdFx0YXR0cmlidXRlcyA9IHt9O1xuXHRcdGNoaWxkcmVuID0gYXJnc1swXTtcblx0fSBlbHNlIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRhdHRyaWJ1dGVzID0gYXJnc1swXSBhcyBhbnkgfHwge307XG5cdFx0Y2hpbGRyZW4gPSBhcmdzWzFdO1xuXHR9XG5cblx0Y29uc3QgbWF0Y2ggPSBIX1JFR0VYLmV4ZWModGFnKTtcblxuXHRpZiAoIW1hdGNoIHx8ICFtYXRjaC5ncm91cHMpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0JhZCB1c2Ugb2YgaCcpO1xuXHR9XG5cblx0Y29uc3QgdGFnTmFtZSA9IG1hdGNoLmdyb3Vwc1sndGFnJ10gfHwgJ2Rpdic7XG5cdGNvbnN0IGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0YWdOYW1lKTtcblxuXHRpZiAobWF0Y2guZ3JvdXBzWydpZCddKSB7XG5cdFx0ZWwuaWQgPSBtYXRjaC5ncm91cHNbJ2lkJ107XG5cdH1cblxuXHRjb25zdCBjbGFzc05hbWVzID0gW107XG5cdGlmIChtYXRjaC5ncm91cHNbJ2NsYXNzJ10pIHtcblx0XHRmb3IgKGNvbnN0IGNsYXNzTmFtZSBvZiBtYXRjaC5ncm91cHNbJ2NsYXNzJ10uc3BsaXQoJy4nKSkge1xuXHRcdFx0aWYgKGNsYXNzTmFtZSAhPT0gJycpIHtcblx0XHRcdFx0Y2xhc3NOYW1lcy5wdXNoKGNsYXNzTmFtZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdGlmIChhdHRyaWJ1dGVzLmNsYXNzTmFtZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0Zm9yIChjb25zdCBjbGFzc05hbWUgb2YgYXR0cmlidXRlcy5jbGFzc05hbWUuc3BsaXQoJy4nKSkge1xuXHRcdFx0aWYgKGNsYXNzTmFtZSAhPT0gJycpIHtcblx0XHRcdFx0Y2xhc3NOYW1lcy5wdXNoKGNsYXNzTmFtZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdGlmIChjbGFzc05hbWVzLmxlbmd0aCA+IDApIHtcblx0XHRlbC5jbGFzc05hbWUgPSBjbGFzc05hbWVzLmpvaW4oJyAnKTtcblx0fVxuXG5cdGNvbnN0IHJlc3VsdDogUmVjb3JkPHN0cmluZywgSFRNTEVsZW1lbnQ+ID0ge307XG5cblx0aWYgKG1hdGNoLmdyb3Vwc1snbmFtZSddKSB7XG5cdFx0cmVzdWx0W21hdGNoLmdyb3Vwc1snbmFtZSddXSA9IGVsO1xuXHR9XG5cblx0aWYgKGNoaWxkcmVuKSB7XG5cdFx0Zm9yIChjb25zdCBjIG9mIGNoaWxkcmVuKSB7XG5cdFx0XHRpZiAoaXNIVE1MRWxlbWVudChjKSkge1xuXHRcdFx0XHRlbC5hcHBlbmRDaGlsZChjKTtcblx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIGMgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGVsLmFwcGVuZChjKTtcblx0XHRcdH0gZWxzZSBpZiAoJ3Jvb3QnIGluIGMpIHtcblx0XHRcdFx0T2JqZWN0LmFzc2lnbihyZXN1bHQsIGMpO1xuXHRcdFx0XHRlbC5hcHBlbmRDaGlsZChjLnJvb3QpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGF0dHJpYnV0ZXMpKSB7XG5cdFx0aWYgKGtleSA9PT0gJ2NsYXNzTmFtZScpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH0gZWxzZSBpZiAoa2V5ID09PSAnc3R5bGUnKSB7XG5cdFx0XHRmb3IgKGNvbnN0IFtjc3NLZXksIGNzc1ZhbHVlXSBvZiBPYmplY3QuZW50cmllcyh2YWx1ZSkpIHtcblx0XHRcdFx0ZWwuc3R5bGUuc2V0UHJvcGVydHkoXG5cdFx0XHRcdFx0Y2FtZWxDYXNlVG9IeXBoZW5DYXNlKGNzc0tleSksXG5cdFx0XHRcdFx0dHlwZW9mIGNzc1ZhbHVlID09PSAnbnVtYmVyJyA/IGNzc1ZhbHVlICsgJ3B4JyA6ICcnICsgY3NzVmFsdWVcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGtleSA9PT0gJ3RhYkluZGV4Jykge1xuXHRcdFx0ZWwudGFiSW5kZXggPSB2YWx1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZWwuc2V0QXR0cmlidXRlKGNhbWVsQ2FzZVRvSHlwaGVuQ2FzZShrZXkpLCB2YWx1ZS50b1N0cmluZygpKTtcblx0XHR9XG5cdH1cblxuXHRyZXN1bHRbJ3Jvb3QnXSA9IGVsO1xuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8qKiBAZGVwcmVjYXRlZCBUaGlzIGlzIGEgZHVwbGljYXRpb24gb2YgdGhlIGggZnVuY3Rpb24uIE5lZWRzIGNsZWFudXAuICovXG5leHBvcnQgZnVuY3Rpb24gc3ZnRWxlbTxUVGFnIGV4dGVuZHMgc3RyaW5nPlxuXHQodGFnOiBUVGFnKTpcblx0VGFnVG9SZWNvcmQ8VFRhZz4gZXh0ZW5kcyBpbmZlciBZID8geyBbVEtleSBpbiBrZXlvZiBZXTogWVtUS2V5XSB9IDogbmV2ZXI7XG4vKiogQGRlcHJlY2F0ZWQgVGhpcyBpcyBhIGR1cGxpY2F0aW9uIG9mIHRoZSBoIGZ1bmN0aW9uLiBOZWVkcyBjbGVhbnVwLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN2Z0VsZW08VFRhZyBleHRlbmRzIHN0cmluZywgVCBleHRlbmRzIENoaWxkW10+XG5cdCh0YWc6IFRUYWcsIGNoaWxkcmVuOiBbLi4uVF0pOlxuXHQoQXJyYXlUb09iajxUPiAmIFRhZ1RvUmVjb3JkPFRUYWc+KSBleHRlbmRzIGluZmVyIFkgPyB7IFtUS2V5IGluIGtleW9mIFldOiBZW1RLZXldIH0gOiBuZXZlcjtcbi8qKiBAZGVwcmVjYXRlZCBUaGlzIGlzIGEgZHVwbGljYXRpb24gb2YgdGhlIGggZnVuY3Rpb24uIE5lZWRzIGNsZWFudXAuICovXG5leHBvcnQgZnVuY3Rpb24gc3ZnRWxlbTxUVGFnIGV4dGVuZHMgc3RyaW5nPlxuXHQodGFnOiBUVGFnLCBhdHRyaWJ1dGVzOiBQYXJ0aWFsPEVsZW1lbnRBdHRyaWJ1dGVzPFRhZ1RvRWxlbWVudDxUVGFnPj4+KTpcblx0VGFnVG9SZWNvcmQ8VFRhZz4gZXh0ZW5kcyBpbmZlciBZID8geyBbVEtleSBpbiBrZXlvZiBZXTogWVtUS2V5XSB9IDogbmV2ZXI7XG4vKiogQGRlcHJlY2F0ZWQgVGhpcyBpcyBhIGR1cGxpY2F0aW9uIG9mIHRoZSBoIGZ1bmN0aW9uLiBOZWVkcyBjbGVhbnVwLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN2Z0VsZW08VFRhZyBleHRlbmRzIHN0cmluZywgVCBleHRlbmRzIENoaWxkW10+XG5cdCh0YWc6IFRUYWcsIGF0dHJpYnV0ZXM6IFBhcnRpYWw8RWxlbWVudEF0dHJpYnV0ZXM8VGFnVG9FbGVtZW50PFRUYWc+Pj4sIGNoaWxkcmVuOiBbLi4uVF0pOlxuXHQoQXJyYXlUb09iajxUPiAmIFRhZ1RvUmVjb3JkPFRUYWc+KSBleHRlbmRzIGluZmVyIFkgPyB7IFtUS2V5IGluIGtleW9mIFldOiBZW1RLZXldIH0gOiBuZXZlcjtcbi8qKiBAZGVwcmVjYXRlZCBUaGlzIGlzIGEgZHVwbGljYXRpb24gb2YgdGhlIGggZnVuY3Rpb24uIE5lZWRzIGNsZWFudXAuICovXG5leHBvcnQgZnVuY3Rpb24gc3ZnRWxlbSh0YWc6IHN0cmluZywgLi4uYXJnczogW10gfCBbYXR0cmlidXRlczogeyAkOiBzdHJpbmcgfSAmIFBhcnRpYWw8RWxlbWVudEF0dHJpYnV0ZXM8SFRNTEVsZW1lbnQ+PiB8IFJlY29yZDxzdHJpbmcsIGFueT4sIGNoaWxkcmVuPzogYW55W11dIHwgW2NoaWxkcmVuOiBhbnlbXV0pOiBSZWNvcmQ8c3RyaW5nLCBIVE1MRWxlbWVudD4ge1xuXHRsZXQgYXR0cmlidXRlczogeyAkPzogc3RyaW5nIH0gJiBQYXJ0aWFsPEVsZW1lbnRBdHRyaWJ1dGVzPEhUTUxFbGVtZW50Pj47XG5cdGxldCBjaGlsZHJlbjogKFJlY29yZDxzdHJpbmcsIEhUTUxFbGVtZW50PiB8IEhUTUxFbGVtZW50KVtdIHwgdW5kZWZpbmVkO1xuXG5cdGlmIChBcnJheS5pc0FycmF5KGFyZ3NbMF0pKSB7XG5cdFx0YXR0cmlidXRlcyA9IHt9O1xuXHRcdGNoaWxkcmVuID0gYXJnc1swXTtcblx0fSBlbHNlIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRhdHRyaWJ1dGVzID0gYXJnc1swXSBhcyBhbnkgfHwge307XG5cdFx0Y2hpbGRyZW4gPSBhcmdzWzFdO1xuXHR9XG5cblx0Y29uc3QgbWF0Y2ggPSBIX1JFR0VYLmV4ZWModGFnKTtcblxuXHRpZiAoIW1hdGNoIHx8ICFtYXRjaC5ncm91cHMpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0JhZCB1c2Ugb2YgaCcpO1xuXHR9XG5cblx0Y29uc3QgdGFnTmFtZSA9IG1hdGNoLmdyb3Vwc1sndGFnJ10gfHwgJ2Rpdic7XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRjb25zdCBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCB0YWdOYW1lKSBhcyBhbnkgYXMgSFRNTEVsZW1lbnQ7XG5cblx0aWYgKG1hdGNoLmdyb3Vwc1snaWQnXSkge1xuXHRcdGVsLmlkID0gbWF0Y2guZ3JvdXBzWydpZCddO1xuXHR9XG5cblx0Y29uc3QgY2xhc3NOYW1lcyA9IFtdO1xuXHRpZiAobWF0Y2guZ3JvdXBzWydjbGFzcyddKSB7XG5cdFx0Zm9yIChjb25zdCBjbGFzc05hbWUgb2YgbWF0Y2guZ3JvdXBzWydjbGFzcyddLnNwbGl0KCcuJykpIHtcblx0XHRcdGlmIChjbGFzc05hbWUgIT09ICcnKSB7XG5cdFx0XHRcdGNsYXNzTmFtZXMucHVzaChjbGFzc05hbWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRpZiAoYXR0cmlidXRlcy5jbGFzc05hbWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdGZvciAoY29uc3QgY2xhc3NOYW1lIG9mIGF0dHJpYnV0ZXMuY2xhc3NOYW1lLnNwbGl0KCcuJykpIHtcblx0XHRcdGlmIChjbGFzc05hbWUgIT09ICcnKSB7XG5cdFx0XHRcdGNsYXNzTmFtZXMucHVzaChjbGFzc05hbWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRpZiAoY2xhc3NOYW1lcy5sZW5ndGggPiAwKSB7XG5cdFx0ZWwuY2xhc3NOYW1lID0gY2xhc3NOYW1lcy5qb2luKCcgJyk7XG5cdH1cblxuXHRjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIEhUTUxFbGVtZW50PiA9IHt9O1xuXG5cdGlmIChtYXRjaC5ncm91cHNbJ25hbWUnXSkge1xuXHRcdHJlc3VsdFttYXRjaC5ncm91cHNbJ25hbWUnXV0gPSBlbDtcblx0fVxuXG5cdGlmIChjaGlsZHJlbikge1xuXHRcdGZvciAoY29uc3QgYyBvZiBjaGlsZHJlbikge1xuXHRcdFx0aWYgKGlzSFRNTEVsZW1lbnQoYykpIHtcblx0XHRcdFx0ZWwuYXBwZW5kQ2hpbGQoYyk7XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBjID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRlbC5hcHBlbmQoYyk7XG5cdFx0XHR9IGVsc2UgaWYgKCdyb290JyBpbiBjKSB7XG5cdFx0XHRcdE9iamVjdC5hc3NpZ24ocmVzdWx0LCBjKTtcblx0XHRcdFx0ZWwuYXBwZW5kQ2hpbGQoYy5yb290KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhhdHRyaWJ1dGVzKSkge1xuXHRcdGlmIChrZXkgPT09ICdjbGFzc05hbWUnKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9IGVsc2UgaWYgKGtleSA9PT0gJ3N0eWxlJykge1xuXHRcdFx0Zm9yIChjb25zdCBbY3NzS2V5LCBjc3NWYWx1ZV0gb2YgT2JqZWN0LmVudHJpZXModmFsdWUpKSB7XG5cdFx0XHRcdGVsLnN0eWxlLnNldFByb3BlcnR5KFxuXHRcdFx0XHRcdGNhbWVsQ2FzZVRvSHlwaGVuQ2FzZShjc3NLZXkpLFxuXHRcdFx0XHRcdHR5cGVvZiBjc3NWYWx1ZSA9PT0gJ251bWJlcicgPyBjc3NWYWx1ZSArICdweCcgOiAnJyArIGNzc1ZhbHVlXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChrZXkgPT09ICd0YWJJbmRleCcpIHtcblx0XHRcdGVsLnRhYkluZGV4ID0gdmFsdWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGVsLnNldEF0dHJpYnV0ZShjYW1lbENhc2VUb0h5cGhlbkNhc2Uoa2V5KSwgdmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0fVxuXHR9XG5cblx0cmVzdWx0Wydyb290J10gPSBlbDtcblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBjYW1lbENhc2VUb0h5cGhlbkNhc2Uoc3RyOiBzdHJpbmcpIHtcblx0cmV0dXJuIHN0ci5yZXBsYWNlKC8oW2Etel0pKFtBLVpdKS9nLCAnJDEtJDInKS50b0xvd2VyQ2FzZSgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29weUF0dHJpYnV0ZXMoZnJvbTogRWxlbWVudCwgdG86IEVsZW1lbnQsIGZpbHRlcj86IHN0cmluZ1tdKTogdm9pZCB7XG5cdGZvciAoY29uc3QgeyBuYW1lLCB2YWx1ZSB9IG9mIGZyb20uYXR0cmlidXRlcykge1xuXHRcdGlmICghZmlsdGVyIHx8IGZpbHRlci5pbmNsdWRlcyhuYW1lKSkge1xuXHRcdFx0dG8uc2V0QXR0cmlidXRlKG5hbWUsIHZhbHVlKTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gY29weUF0dHJpYnV0ZShmcm9tOiBFbGVtZW50LCB0bzogRWxlbWVudCwgbmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdGNvbnN0IHZhbHVlID0gZnJvbS5nZXRBdHRyaWJ1dGUobmFtZSk7XG5cdGlmICh2YWx1ZSkge1xuXHRcdHRvLnNldEF0dHJpYnV0ZShuYW1lLCB2YWx1ZSk7XG5cdH0gZWxzZSB7XG5cdFx0dG8ucmVtb3ZlQXR0cmlidXRlKG5hbWUpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0cmFja0F0dHJpYnV0ZXMoZnJvbTogRWxlbWVudCwgdG86IEVsZW1lbnQsIGZpbHRlcj86IHN0cmluZ1tdKTogSURpc3Bvc2FibGUge1xuXHRjb3B5QXR0cmlidXRlcyhmcm9tLCB0bywgZmlsdGVyKTtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRkaXNwb3NhYmxlcy5hZGQoc2hhcmVkTXV0YXRpb25PYnNlcnZlci5vYnNlcnZlKGZyb20sIGRpc3Bvc2FibGVzLCB7IGF0dHJpYnV0ZXM6IHRydWUsIGF0dHJpYnV0ZUZpbHRlcjogZmlsdGVyIH0pKG11dGF0aW9ucyA9PiB7XG5cdFx0Zm9yIChjb25zdCBtdXRhdGlvbiBvZiBtdXRhdGlvbnMpIHtcblx0XHRcdGlmIChtdXRhdGlvbi50eXBlID09PSAnYXR0cmlidXRlcycgJiYgbXV0YXRpb24uYXR0cmlidXRlTmFtZSkge1xuXHRcdFx0XHRjb3B5QXR0cmlidXRlKGZyb20sIHRvLCBtdXRhdGlvbi5hdHRyaWJ1dGVOYW1lKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pKTtcblxuXHRyZXR1cm4gZGlzcG9zYWJsZXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0VkaXRhYmxlRWxlbWVudChlbGVtZW50OiBFbGVtZW50KTogYm9vbGVhbiB7XG5cdHJldHVybiBlbGVtZW50LnRhZ05hbWUudG9Mb3dlckNhc2UoKSA9PT0gJ2lucHV0JyB8fCBlbGVtZW50LnRhZ05hbWUudG9Mb3dlckNhc2UoKSA9PT0gJ3RleHRhcmVhJyB8fCBpc0hUTUxFbGVtZW50KGVsZW1lbnQpICYmICEhZWxlbWVudC5lZGl0Q29udGV4dDtcbn1cblxuLyoqXG4gKiBIZWxwZXIgZm9yIGNhbGN1bGF0aW5nIHRoZSBcInNhZmUgdHJpYW5nbGVcIiBvY2NsdWRlZCBieSBob3ZlcnMgdG8gYXZvaWQgZWFybHkgZGlzbWlzc2FsLlxuICogQHNlZSBodHRwczovL3d3dy5zbWFzaGluZ21hZ2F6aW5lLmNvbS8yMDIzLzA4L2JldHRlci1jb250ZXh0LW1lbnVzLXNhZmUtdHJpYW5nbGVzLyBmb3IgZXhhbXBsZVxuICovXG5leHBvcnQgY2xhc3MgU2FmZVRyaWFuZ2xlIHtcblx0Ly8gNCBwb2ludHMgKHgsIHkpLCA4IGxlbmd0aFxuXHRwcml2YXRlIHBvaW50cyA9IG5ldyBJbnQxNkFycmF5KDgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3JpZ2luWDogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3JpZ2luWTogbnVtYmVyLFxuXHRcdHRhcmdldDogSFRNTEVsZW1lbnRcblx0KSB7XG5cdFx0Y29uc3QgeyB0b3AsIGxlZnQsIHJpZ2h0LCBib3R0b20gfSA9IHRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRjb25zdCB0ID0gdGhpcy5wb2ludHM7XG5cdFx0bGV0IGkgPSAwO1xuXG5cdFx0dFtpKytdID0gbGVmdDtcblx0XHR0W2krK10gPSB0b3A7XG5cblx0XHR0W2krK10gPSByaWdodDtcblx0XHR0W2krK10gPSB0b3A7XG5cblx0XHR0W2krK10gPSBsZWZ0O1xuXHRcdHRbaSsrXSA9IGJvdHRvbTtcblxuXHRcdHRbaSsrXSA9IHJpZ2h0O1xuXHRcdHRbaSsrXSA9IGJvdHRvbTtcblx0fVxuXG5cdHB1YmxpYyBjb250YWlucyh4OiBudW1iZXIsIHk6IG51bWJlcikge1xuXHRcdGNvbnN0IHsgcG9pbnRzLCBvcmlnaW5YLCBvcmlnaW5ZIH0gPSB0aGlzO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgNDsgaSsrKSB7XG5cdFx0XHRjb25zdCBwMSA9IDIgKiBpO1xuXHRcdFx0Y29uc3QgcDIgPSAyICogKChpICsgMSkgJSA0KTtcblx0XHRcdGlmIChpc1BvaW50V2l0aGluVHJpYW5nbGUoeCwgeSwgb3JpZ2luWCwgb3JpZ2luWSwgcG9pbnRzW3AxXSwgcG9pbnRzW3AxICsgMV0sIHBvaW50c1twMl0sIHBvaW50c1twMiArIDFdKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuXG5leHBvcnQgbmFtZXNwYWNlIG4ge1xuXHRmdW5jdGlvbiBub2RlTnM8VE1hcCBleHRlbmRzIFJlY29yZDxzdHJpbmcsIGFueT4+KGVsZW1lbnROczogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkKTogRG9tVGFnQ3JlYXRlRm48VE1hcD4ge1xuXHRcdHJldHVybiAodGFnLCBhdHRyaWJ1dGVzLCBjaGlsZHJlbikgPT4ge1xuXHRcdFx0Y29uc3QgY2xhc3NOYW1lID0gYXR0cmlidXRlcy5jbGFzcztcblx0XHRcdGRlbGV0ZSBhdHRyaWJ1dGVzLmNsYXNzO1xuXHRcdFx0Y29uc3QgcmVmID0gYXR0cmlidXRlcy5yZWY7XG5cdFx0XHRkZWxldGUgYXR0cmlidXRlcy5yZWY7XG5cdFx0XHRjb25zdCBvYnNSZWYgPSBhdHRyaWJ1dGVzLm9ic1JlZjtcblx0XHRcdGRlbGV0ZSBhdHRyaWJ1dGVzLm9ic1JlZjtcblxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRyZXR1cm4gbmV3IE9ic2VydmVyTm9kZVdpdGhFbGVtZW50KHRhZyBhcyBhbnksIHJlZiwgb2JzUmVmLCBlbGVtZW50TnMsIGNsYXNzTmFtZSwgYXR0cmlidXRlcywgY2hpbGRyZW4pO1xuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBub2RlPFRNYXAgZXh0ZW5kcyBSZWNvcmQ8c3RyaW5nLCBhbnk+LCBUS2V5IGV4dGVuZHMga2V5b2YgVE1hcD4odGFnOiBUS2V5LCBlbGVtZW50TnM6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCk6IERvbUNyZWF0ZUZuPFRNYXBbVEtleV0sIFRNYXBbVEtleV0+IHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRjb25zdCBmID0gbm9kZU5zKGVsZW1lbnROcykgYXMgYW55O1xuXHRcdHJldHVybiAoYXR0cmlidXRlcywgY2hpbGRyZW4pID0+IHtcblx0XHRcdHJldHVybiBmKHRhZywgYXR0cmlidXRlcywgY2hpbGRyZW4pO1xuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgY29uc3QgZGl2OiBEb21DcmVhdGVGbjxIVE1MRGl2RWxlbWVudCwgSFRNTERpdkVsZW1lbnQ+ID0gbm9kZTxIVE1MRWxlbWVudFRhZ05hbWVNYXAsICdkaXYnPignZGl2Jyk7XG5cblx0ZXhwb3J0IGNvbnN0IGVsZW0gPSBub2RlTnM8SFRNTEVsZW1lbnRUYWdOYW1lTWFwPih1bmRlZmluZWQpO1xuXG5cdGV4cG9ydCBjb25zdCBzdmc6IERvbUNyZWF0ZUZuPFNWR0VsZW1lbnRUYWdOYW1lTWFwMlsnc3ZnJ10sIFNWR0VsZW1lbnQ+ID0gbm9kZTxTVkdFbGVtZW50VGFnTmFtZU1hcDIsICdzdmcnPignc3ZnJywgJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJyk7XG5cblx0ZXhwb3J0IGNvbnN0IHN2Z0VsZW0gPSBub2RlTnM8U1ZHRWxlbWVudFRhZ05hbWVNYXAyPignaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnKTtcblxuXHRleHBvcnQgZnVuY3Rpb24gcmVmPFQgPSBIVE1MT3JTVkdFbGVtZW50PigpOiBJUmVmV2l0aFZhbDxUPiB7XG5cdFx0bGV0IHZhbHVlOiBUIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJlc3VsdDogSVJlZjxUPiA9IGZ1bmN0aW9uICh2YWw6IFQpIHtcblx0XHRcdHZhbHVlID0gdmFsO1xuXHRcdH07XG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KHJlc3VsdCwgJ2VsZW1lbnQnLCB7XG5cdFx0XHRnZXQoKSB7XG5cdFx0XHRcdGlmICghdmFsdWUpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdNYWtlIHN1cmUgdGhlIHJlZiBpcyBzZXQgYmVmb3JlIGFjY2Vzc2luZyB0aGUgZWxlbWVudC4gTWF5YmUgd3JvbmcgaW5pdGlhbGl6YXRpb24gb3JkZXI/Jyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHJldHVybiByZXN1bHQgYXMgYW55O1xuXHR9XG59XG50eXBlIFZhbHVlPFQ+ID0gVCB8IElPYnNlcnZhYmxlPFQ+O1xudHlwZSBWYWx1ZU9yTGlzdDxUPiA9IFZhbHVlPFQ+IHwgVmFsdWVPckxpc3Q8VD5bXTtcbnR5cGUgVmFsdWVPckxpc3QyPFQ+ID0gVmFsdWVPckxpc3Q8VD4gfCBWYWx1ZU9yTGlzdDxWYWx1ZU9yTGlzdDxUPj47XG50eXBlIEhUTUxPclNWR0VsZW1lbnQgPSBIVE1MRWxlbWVudCB8IFNWR0VsZW1lbnQ7XG50eXBlIFNWR0VsZW1lbnRUYWdOYW1lTWFwMiA9IHtcblx0c3ZnOiBTVkdFbGVtZW50ICYge1xuXHRcdHdpZHRoOiBudW1iZXI7XG5cdFx0aGVpZ2h0OiBudW1iZXI7XG5cdFx0dHJhbnNmb3JtOiBzdHJpbmc7XG5cdFx0dmlld0JveDogc3RyaW5nO1xuXHRcdGZpbGw6IHN0cmluZztcblx0fTtcblx0cGF0aDogU1ZHRWxlbWVudCAmIHtcblx0XHRkOiBzdHJpbmc7XG5cdFx0c3Ryb2tlOiBzdHJpbmc7XG5cdFx0ZmlsbDogc3RyaW5nO1xuXHR9O1xuXHRsaW5lYXJHcmFkaWVudDogU1ZHRWxlbWVudCAmIHtcblx0XHRpZDogc3RyaW5nO1xuXHRcdHgxOiBzdHJpbmcgfCBudW1iZXI7XG5cdFx0eDI6IHN0cmluZyB8IG51bWJlcjtcblx0fTtcblx0c3RvcDogU1ZHRWxlbWVudCAmIHtcblx0XHRvZmZzZXQ6IHN0cmluZztcblx0fTtcblx0cmVjdDogU1ZHRWxlbWVudCAmIHtcblx0XHR4OiBudW1iZXI7XG5cdFx0eTogbnVtYmVyO1xuXHRcdHdpZHRoOiBudW1iZXI7XG5cdFx0aGVpZ2h0OiBudW1iZXI7XG5cdFx0ZmlsbDogc3RyaW5nO1xuXHR9O1xuXHRkZWZzOiBTVkdFbGVtZW50O1xufTtcbnR5cGUgRG9tVGFnQ3JlYXRlRm48VE1hcCBleHRlbmRzIFJlY29yZDxzdHJpbmcsIGFueT4+ID0gPFRUYWcgZXh0ZW5kcyBrZXlvZiBUTWFwPihcblx0dGFnOiBUVGFnLFxuXHRhdHRyaWJ1dGVzOiBFbGVtZW50QXR0cmlidXRlS2V5czxUTWFwW1RUYWddPiAmIHsgY2xhc3M/OiBWYWx1ZU9yTGlzdDxzdHJpbmcgfCBmYWxzZSB8IHVuZGVmaW5lZD47IHJlZj86IElSZWY8VE1hcFtUVGFnXT47IG9ic1JlZj86IElSZWY8T2JzZXJ2ZXJOb2RlV2l0aEVsZW1lbnQ8VE1hcFtUVGFnXT4gfCBudWxsPiB9LFxuXHRjaGlsZHJlbj86IENoaWxkTm9kZVxuKSA9PiBPYnNlcnZlck5vZGU8VE1hcFtUVGFnXT47XG50eXBlIERvbUNyZWF0ZUZuPFRBdHRyaWJ1dGVzLCBUUmVzdWx0IGV4dGVuZHMgSFRNTE9yU1ZHRWxlbWVudD4gPSAoXG5cdGF0dHJpYnV0ZXM6IEVsZW1lbnRBdHRyaWJ1dGVLZXlzPFRBdHRyaWJ1dGVzPiAmIHsgY2xhc3M/OiBWYWx1ZU9yTGlzdDxzdHJpbmcgfCBmYWxzZSB8IHVuZGVmaW5lZD47IHJlZj86IElSZWY8VFJlc3VsdD47IG9ic1JlZj86IElSZWY8T2JzZXJ2ZXJOb2RlV2l0aEVsZW1lbnQ8VFJlc3VsdD4gfCBudWxsPiB9LFxuXHRjaGlsZHJlbj86IENoaWxkTm9kZVxuKSA9PiBPYnNlcnZlck5vZGU8VFJlc3VsdD47XG5cbmV4cG9ydCB0eXBlIENoaWxkTm9kZSA9IFZhbHVlT3JMaXN0MjxIVE1MT3JTVkdFbGVtZW50IHwgc3RyaW5nIHwgT2JzZXJ2ZXJOb2RlIHwgdW5kZWZpbmVkPjtcblxuZXhwb3J0IHR5cGUgSVJlZjxUPiA9ICh2YWx1ZTogVCkgPT4gdm9pZDtcblxuZXhwb3J0IGludGVyZmFjZSBJUmVmV2l0aFZhbDxUPiBleHRlbmRzIElSZWY8VD4ge1xuXHRyZWFkb25seSBlbGVtZW50OiBUO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgT2JzZXJ2ZXJOb2RlPFQgZXh0ZW5kcyBIVE1MT3JTVkdFbGVtZW50ID0gSFRNTE9yU1ZHRWxlbWVudD4ge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZXJpdmVkczogKElPYnNlcnZhYmxlPGFueT4pW10gPSBbXTtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2VsZW1lbnQ6IFQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dGFnOiBzdHJpbmcsXG5cdFx0cmVmOiBJUmVmPFQ+IHwgdW5kZWZpbmVkLFxuXHRcdG9ic1JlZjogSVJlZjxPYnNlcnZlck5vZGVXaXRoRWxlbWVudDxUPiB8IG51bGw+IHwgdW5kZWZpbmVkLFxuXHRcdG5zOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0Y2xhc3NOYW1lOiBWYWx1ZU9yTGlzdDxzdHJpbmcgfCB1bmRlZmluZWQgfCBmYWxzZT4gfCB1bmRlZmluZWQsXG5cdFx0YXR0cmlidXRlczogRWxlbWVudEF0dHJpYnV0ZUtleXM8VD4sXG5cdFx0Y2hpbGRyZW46IENoaWxkTm9kZVxuXHQpIHtcblx0XHR0aGlzLl9lbGVtZW50ID0gKG5zID8gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKG5zLCB0YWcpIDogZG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0YWcpKSBhcyB1bmtub3duIGFzIFQ7XG5cdFx0aWYgKHJlZikge1xuXHRcdFx0cmVmKHRoaXMuX2VsZW1lbnQpO1xuXHRcdH1cblx0XHRpZiAob2JzUmVmKSB7XG5cdFx0XHR0aGlzLl9kZXJpdmVkcy5wdXNoKGRlcml2ZWQoKF9yZWFkZXIpID0+IHtcblx0XHRcdFx0b2JzUmVmKHRoaXMgYXMgdW5rbm93biBhcyBPYnNlcnZlck5vZGVXaXRoRWxlbWVudDxUPik7XG5cdFx0XHRcdF9yZWFkZXIuc3RvcmUuYWRkKHtcblx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRvYnNSZWYobnVsbCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRpZiAoY2xhc3NOYW1lKSB7XG5cdFx0XHRpZiAoaGFzT2JzZXJ2YWJsZShjbGFzc05hbWUpKSB7XG5cdFx0XHRcdHRoaXMuX2Rlcml2ZWRzLnB1c2goZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0XHRcdC8qKiBAZGVzY3JpcHRpb24gc2V0LmNsYXNzICovXG5cdFx0XHRcdFx0c2V0Q2xhc3NOYW1lKHRoaXMuX2VsZW1lbnQsIGdldENsYXNzTmFtZShjbGFzc05hbWUsIHJlYWRlcikpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzZXRDbGFzc05hbWUodGhpcy5fZWxlbWVudCwgZ2V0Q2xhc3NOYW1lKGNsYXNzTmFtZSwgdW5kZWZpbmVkKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoYXR0cmlidXRlcykpIHtcblx0XHRcdGlmIChrZXkgPT09ICdzdHlsZScpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBbY3NzS2V5LCBjc3NWYWx1ZV0gb2YgT2JqZWN0LmVudHJpZXModmFsdWUpKSB7XG5cdFx0XHRcdFx0Y29uc3Qga2V5ID0gY2FtZWxDYXNlVG9IeXBoZW5DYXNlKGNzc0tleSk7XG5cdFx0XHRcdFx0aWYgKGlzT2JzZXJ2YWJsZShjc3NWYWx1ZSkpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2Rlcml2ZWRzLnB1c2goZGVyaXZlZE9wdHMoeyBvd25lcjogdGhpcywgZGVidWdOYW1lOiAoKSA9PiBgc2V0LnN0eWxlLiR7a2V5fWAgfSwgcmVhZGVyID0+IHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fZWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eShrZXksIGNvbnZlcnRDc3NWYWx1ZShjc3NWYWx1ZS5yZWFkKHJlYWRlcikpKTtcblx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5fZWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eShrZXksIGNvbnZlcnRDc3NWYWx1ZShjc3NWYWx1ZSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChrZXkgPT09ICd0YWJJbmRleCcpIHtcblx0XHRcdFx0aWYgKGlzT2JzZXJ2YWJsZSh2YWx1ZSkpIHtcblx0XHRcdFx0XHR0aGlzLl9kZXJpdmVkcy5wdXNoKGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdFx0XHRcdC8qKiBAZGVzY3JpcHRpb24gc2V0LnRhYkluZGV4ICovXG5cdFx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0XHRcdHRoaXMuX2VsZW1lbnQudGFiSW5kZXggPSB2YWx1ZS5yZWFkKHJlYWRlcikgYXMgYW55O1xuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9lbGVtZW50LnRhYkluZGV4ID0gdmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoa2V5LnN0YXJ0c1dpdGgoJ29uJykpIHtcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdCh0aGlzLl9lbGVtZW50IGFzIGFueSlba2V5XSA9IHZhbHVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKGlzT2JzZXJ2YWJsZSh2YWx1ZSkpIHtcblx0XHRcdFx0XHR0aGlzLl9kZXJpdmVkcy5wdXNoKGRlcml2ZWRPcHRzKHsgb3duZXI6IHRoaXMsIGRlYnVnTmFtZTogKCkgPT4gYHNldC4ke2tleX1gIH0sIHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0XHRzZXRPclJlbW92ZUF0dHJpYnV0ZSh0aGlzLl9lbGVtZW50LCBrZXksIHZhbHVlLnJlYWQocmVhZGVyKSk7XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNldE9yUmVtb3ZlQXR0cmlidXRlKHRoaXMuX2VsZW1lbnQsIGtleSwgdmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGNoaWxkcmVuKSB7XG5cdFx0XHRmdW5jdGlvbiBnZXRDaGlsZHJlbihyZWFkZXI6IElSZWFkZXIgfCB1bmRlZmluZWQsIGNoaWxkcmVuOiBWYWx1ZU9yTGlzdDI8SFRNTE9yU1ZHRWxlbWVudCB8IHN0cmluZyB8IE9ic2VydmVyTm9kZSB8IHVuZGVmaW5lZD4pOiAoSFRNTE9yU1ZHRWxlbWVudCB8IHN0cmluZylbXSB7XG5cdFx0XHRcdGlmIChpc09ic2VydmFibGUoY2hpbGRyZW4pKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGdldENoaWxkcmVuKHJlYWRlciwgY2hpbGRyZW4ucmVhZChyZWFkZXIpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShjaGlsZHJlbikpIHtcblx0XHRcdFx0XHRyZXR1cm4gY2hpbGRyZW4uZmxhdE1hcChjID0+IGdldENoaWxkcmVuKHJlYWRlciwgYykpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjaGlsZHJlbiBpbnN0YW5jZW9mIE9ic2VydmVyTm9kZSkge1xuXHRcdFx0XHRcdGlmIChyZWFkZXIpIHtcblx0XHRcdFx0XHRcdGNoaWxkcmVuLnJlYWRFZmZlY3QocmVhZGVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIFtjaGlsZHJlbi5fZWxlbWVudF07XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtjaGlsZHJlbl07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIHNldC5jaGlsZHJlbiAqL1xuXHRcdFx0XHR0aGlzLl9lbGVtZW50LnJlcGxhY2VDaGlsZHJlbiguLi5nZXRDaGlsZHJlbihyZWFkZXIsIGNoaWxkcmVuKSk7XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX2Rlcml2ZWRzLnB1c2goZCk7XG5cdFx0XHRpZiAoIWNoaWxkcmVuSXNPYnNlcnZhYmxlKGNoaWxkcmVuKSkge1xuXHRcdFx0XHRkLmdldCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJlYWRFZmZlY3QocmVhZGVyOiBJUmVhZGVyIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBkIG9mIHRoaXMuX2Rlcml2ZWRzKSB7XG5cdFx0XHRkLnJlYWQocmVhZGVyKTtcblx0XHR9XG5cdH1cblxuXHRrZWVwVXBkYXRlZChzdG9yZTogRGlzcG9zYWJsZVN0b3JlKTogT2JzZXJ2ZXJOb2RlV2l0aEVsZW1lbnQ8VD4ge1xuXHRcdGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdC8qKiB1cGRhdGUgKi9cblx0XHRcdHRoaXMucmVhZEVmZmVjdChyZWFkZXIpO1xuXHRcdH0pLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHN0b3JlKTtcblx0XHRyZXR1cm4gdGhpcyBhcyB1bmtub3duIGFzIE9ic2VydmVyTm9kZVdpdGhFbGVtZW50PFQ+O1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBsaXZlIGVsZW1lbnQgdGhhdCB3aWxsIGtlZXAgdGhlIGVsZW1lbnQgdXBkYXRlZCBhcyBsb25nIGFzIHRoZSByZXR1cm5lZCBvYmplY3QgaXMgbm90IGRpc3Bvc2VkLlxuXHQqL1xuXHR0b0Rpc3Bvc2FibGVMaXZlRWxlbWVudCgpIHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLmtlZXBVcGRhdGVkKHN0b3JlKTtcblx0XHRyZXR1cm4gbmV3IExpdmVFbGVtZW50KHRoaXMuX2VsZW1lbnQsIHN0b3JlKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzSG92ZXJlZDogSU9ic2VydmFibGU8Ym9vbGVhbj4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0Z2V0IGlzSG92ZXJlZCgpOiBJT2JzZXJ2YWJsZTxib29sZWFuPiB7XG5cdFx0aWYgKCF0aGlzLl9pc0hvdmVyZWQpIHtcblx0XHRcdGNvbnN0IGhvdmVyZWQgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4oJ2hvdmVyZWQnLCBmYWxzZSk7XG5cdFx0XHR0aGlzLl9lbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCAoX2UpID0+IGhvdmVyZWQuc2V0KHRydWUsIHVuZGVmaW5lZCkpO1xuXHRcdFx0dGhpcy5fZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgKF9lKSA9PiBob3ZlcmVkLnNldChmYWxzZSwgdW5kZWZpbmVkKSk7XG5cdFx0XHR0aGlzLl9pc0hvdmVyZWQgPSBob3ZlcmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5faXNIb3ZlcmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGlkTW91c2VNb3ZlRHVyaW5nSG92ZXI6IElPYnNlcnZhYmxlPGJvb2xlYW4+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGdldCBkaWRNb3VzZU1vdmVEdXJpbmdIb3ZlcigpOiBJT2JzZXJ2YWJsZTxib29sZWFuPiB7XG5cdFx0aWYgKCF0aGlzLl9kaWRNb3VzZU1vdmVEdXJpbmdIb3Zlcikge1xuXHRcdFx0bGV0IF9ob3ZlcmluZyA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgaG92ZXJlZCA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPignZGlkTW91c2VNb3ZlRHVyaW5nSG92ZXInLCBmYWxzZSk7XG5cdFx0XHR0aGlzLl9lbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCAoX2UpID0+IHtcblx0XHRcdFx0X2hvdmVyaW5nID0gdHJ1ZTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCAoX2UpID0+IHtcblx0XHRcdFx0aWYgKF9ob3ZlcmluZykge1xuXHRcdFx0XHRcdGhvdmVyZWQuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgKF9lKSA9PiB7XG5cdFx0XHRcdF9ob3ZlcmluZyA9IGZhbHNlO1xuXHRcdFx0XHRob3ZlcmVkLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fZGlkTW91c2VNb3ZlRHVyaW5nSG92ZXIgPSBob3ZlcmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZGlkTW91c2VNb3ZlRHVyaW5nSG92ZXI7XG5cdH1cbn1cblxuZnVuY3Rpb24gc2V0Q2xhc3NOYW1lKGRvbU5vZGU6IEhUTUxPclNWR0VsZW1lbnQsIGNsYXNzTmFtZTogc3RyaW5nKSB7XG5cdGlmIChpc1NWR0VsZW1lbnQoZG9tTm9kZSkpIHtcblx0XHRkb21Ob2RlLnNldEF0dHJpYnV0ZSgnY2xhc3MnLCBjbGFzc05hbWUpO1xuXHR9IGVsc2Uge1xuXHRcdGRvbU5vZGUuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJlc29sdmU8VD4odmFsdWU6IFZhbHVlT3JMaXN0PFQ+LCByZWFkZXI6IElSZWFkZXIgfCB1bmRlZmluZWQsIGNiOiAodmFsOiBUKSA9PiB2b2lkKTogdm9pZCB7XG5cdGlmIChpc09ic2VydmFibGUodmFsdWUpKSB7XG5cdFx0Y2IodmFsdWUucmVhZChyZWFkZXIpKTtcblx0XHRyZXR1cm47XG5cdH1cblx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0Zm9yIChjb25zdCB2IG9mIHZhbHVlKSB7XG5cdFx0XHRyZXNvbHZlKHYsIHJlYWRlciwgY2IpO1xuXHRcdH1cblx0XHRyZXR1cm47XG5cdH1cblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdGNiKHZhbHVlIGFzIGFueSk7XG59XG5mdW5jdGlvbiBnZXRDbGFzc05hbWUoY2xhc3NOYW1lOiBWYWx1ZU9yTGlzdDxzdHJpbmcgfCB1bmRlZmluZWQgfCBmYWxzZT4gfCB1bmRlZmluZWQsIHJlYWRlcjogSVJlYWRlciB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdGxldCByZXN1bHQgPSAnJztcblx0cmVzb2x2ZShjbGFzc05hbWUsIHJlYWRlciwgdmFsID0+IHtcblx0XHRpZiAodmFsKSB7XG5cdFx0XHRpZiAocmVzdWx0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXN1bHQgPSB2YWw7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXN1bHQgKz0gJyAnICsgdmFsO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cdHJldHVybiByZXN1bHQ7XG59XG5mdW5jdGlvbiBoYXNPYnNlcnZhYmxlKHZhbHVlOiBWYWx1ZU9yTGlzdDx1bmtub3duPik6IGJvb2xlYW4ge1xuXHRpZiAoaXNPYnNlcnZhYmxlKHZhbHVlKSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdHJldHVybiB2YWx1ZS5zb21lKHYgPT4gaGFzT2JzZXJ2YWJsZSh2KSk7XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufVxuZnVuY3Rpb24gY29udmVydENzc1ZhbHVlKHZhbHVlOiBhbnkpOiBzdHJpbmcge1xuXHRpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJykge1xuXHRcdHJldHVybiB2YWx1ZSArICdweCc7XG5cdH1cblx0cmV0dXJuIHZhbHVlO1xufVxuZnVuY3Rpb24gY2hpbGRyZW5Jc09ic2VydmFibGUoY2hpbGRyZW46IFZhbHVlT3JMaXN0MjxIVE1MT3JTVkdFbGVtZW50IHwgc3RyaW5nIHwgT2JzZXJ2ZXJOb2RlIHwgdW5kZWZpbmVkPik6IGJvb2xlYW4ge1xuXHRpZiAoaXNPYnNlcnZhYmxlKGNoaWxkcmVuKSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGlmIChBcnJheS5pc0FycmF5KGNoaWxkcmVuKSkge1xuXHRcdHJldHVybiBjaGlsZHJlbi5zb21lKGMgPT4gY2hpbGRyZW5Jc09ic2VydmFibGUoYykpO1xuXHR9XG5cdHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0IGNsYXNzIExpdmVFbGVtZW50PFQgZXh0ZW5kcyBIVE1MT3JTVkdFbGVtZW50ID0gSFRNTEVsZW1lbnQ+IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGVsZW1lbnQ6IFQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZTogSURpc3Bvc2FibGVcblx0KSB7IH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPYnNlcnZlck5vZGVXaXRoRWxlbWVudDxUIGV4dGVuZHMgSFRNTE9yU1ZHRWxlbWVudCA9IEhUTUxPclNWR0VsZW1lbnQ+IGV4dGVuZHMgT2JzZXJ2ZXJOb2RlPFQ+IHtcblx0cHVibGljIGdldCBlbGVtZW50KCkge1xuXHRcdHJldHVybiB0aGlzLl9lbGVtZW50O1xuXHR9XG59XG5mdW5jdGlvbiBzZXRPclJlbW92ZUF0dHJpYnV0ZShlbGVtZW50OiBIVE1MT3JTVkdFbGVtZW50LCBrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24pIHtcblx0aWYgKHZhbHVlID09PSBudWxsIHx8IHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRlbGVtZW50LnJlbW92ZUF0dHJpYnV0ZShjYW1lbENhc2VUb0h5cGhlbkNhc2Uoa2V5KSk7XG5cdH0gZWxzZSB7XG5cdFx0ZWxlbWVudC5zZXRBdHRyaWJ1dGUoY2FtZWxDYXNlVG9IeXBoZW5DYXNlKGtleSksIFN0cmluZyh2YWx1ZSkpO1xuXHR9XG59XG5cbnR5cGUgRWxlbWVudEF0dHJpYnV0ZUtleXM8VD4gPSBQYXJ0aWFsPHtcblx0W0sgaW4ga2V5b2YgVF06IFRbS10gZXh0ZW5kcyBGdW5jdGlvbiA/IG5ldmVyIDogVFtLXSBleHRlbmRzIG9iamVjdCA/IEVsZW1lbnRBdHRyaWJ1dGVLZXlzPFRbS10+IDogVmFsdWU8bnVtYmVyIHwgVFtLXSB8IHVuZGVmaW5lZCB8IG51bGw+O1xufT47XG5cbi8qKlxuICogQSBjdXN0b20gZWxlbWVudCB0aGF0IGZpcmVzIGNhbGxiYWNrcyB3aGVuIGNvbm5lY3RlZCB0byBvciBkaXNjb25uZWN0ZWQgZnJvbSB0aGUgRE9NLlxuICogVXNlZnVsIGZvciB0cmFja2luZyB3aGV0aGVyIGEgdGVtcGxhdGUgb3IgY29tcG9uZW50IGlzIGN1cnJlbnRseSBtb3VudGVkLCBlc3BlY2lhbGx5XG4gKiB3aXRoIGlmcmFtZXMvd2Vidmlld3MgdGhhdCBhcmUgc2Vuc2l0aXZlIHRvIG1vdmVtZW50LlxuICpcbiAqIEBleGFtcGxlXG4gKiBgYGB0c1xuICogY29uc3Qgb2JzZXJ2ZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjb25uZWN0aW9uLW9ic2VydmVyJykgYXMgQ29ubmVjdGlvbk9ic2VydmVyRWxlbWVudDtcbiAqIG9ic2VydmVyLm9uRGlkQ29ubmVjdCA9ICgpID0+IGNvbnNvbGUubG9nKCdtb3VudGVkJyk7XG4gKiBvYnNlcnZlci5vbkRpZERpc2Nvbm5lY3QgPSAoKSA9PiBjb25zb2xlLmxvZygndW5tb3VudGVkJyk7XG4gKiBjb250YWluZXIuYXBwZW5kQ2hpbGQob2JzZXJ2ZXIpO1xuICogYGBgXG4gKi9cbmV4cG9ydCBjbGFzcyBDb25uZWN0aW9uT2JzZXJ2ZXJFbGVtZW50IGV4dGVuZHMgSFRNTEVsZW1lbnQge1xuXHRwdWJsaWMgb25EaWRDb25uZWN0PzogKCkgPT4gdm9pZDtcblx0cHVibGljIG9uRGlkRGlzY29ubmVjdD86ICgpID0+IHZvaWQ7XG5cblx0ZGlzY29ubmVjdGVkQ2FsbGJhY2soKSB7XG5cdFx0dGhpcy5vbkRpZERpc2Nvbm5lY3Q/LigpO1xuXHR9XG5cblx0Y29ubmVjdGVkQ2FsbGJhY2soKSB7XG5cdFx0dGhpcy5vbkRpZENvbm5lY3Q/LigpO1xuXHR9XG59XG5cbmlmICghY3VzdG9tRWxlbWVudHMuZ2V0KCdjb25uZWN0aW9uLW9ic2VydmVyJykpIHtcblx0Y3VzdG9tRWxlbWVudHMuZGVmaW5lKCdjb25uZWN0aW9uLW9ic2VydmVyJywgQ29ubmVjdGlvbk9ic2VydmVyRWxlbWVudCk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLGFBQWE7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxpQkFBaUMsNkJBQTZCO0FBQ3ZFLFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFTLG1CQUFtQixlQUFlLGNBQWMsb0JBQWtDO0FBQzNGLFNBQVMsb0JBQW9CLHlCQUF5QjtBQUN0RCxZQUFZLFdBQVc7QUFDdkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSxpQkFBOEIsbUJBQW1CLG9CQUFvQjtBQUMxRixTQUFTLHlCQUF5QjtBQUNsQyxZQUFZLGNBQWM7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsWUFBWTtBQUNyQixTQUFxQixrQkFBa0Isa0JBQWtCO0FBQ3pELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXNCLFNBQVMsYUFBc0IsaUJBQWlCLG9CQUFvQjtBQVNuRixNQUFNO0FBQUEsRUFDWjtBQUFBLEVBQ0E7QUFBQSxF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QUFHLEdBQUcsT0FBTyxLQUFLLENBQUM7QUFBQSxFQUMvRDtBQUNEO0FBbUJPLE1BQU0sa0NBQWtDLFlBQVk7QUFBQSxFQUkxRCx1QkFBdUI7QUFDdEIsU0FBSyxrQkFBa0I7QUFBQSxFQUN4QjtBQUFBLEVBRUEsb0JBQW9CO0FBQ25CLFNBQUssZUFBZTtBQUFBLEVBQ3JCO0FBQ0Q7QUFFQSxJQUFJLENBQUMsZUFBZSxJQUFJLHFCQUFxQixHQUFHO0FBQy9DLGlCQUFlLE9BQU8sdUJBQXVCLHlCQUF5QjtBQUN2RTsiLAogICJuYW1lcyI6IFsib25EaWRSZWdpc3RlcldpbmRvdyIsICJvbkRpZFVucmVnaXN0ZXJXaW5kb3ciLCAib25XaWxsVW5yZWdpc3RlcldpbmRvdyIsICJnZXRXaW5kb3dCeUlkIiwgImFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyIiwgInBvc2l0aW9uIiwgImRvY3VtZW50IiwgIk5hbWVzcGFjZSIsICJyZXNvbHZlIiwgIkRldGVjdGVkRnVsbHNjcmVlbk1vZGUiLCAiZXZlbnQiLCAibiIsICJyZWYiLCAia2V5IiwgImdldENoaWxkcmVuIiwgImNoaWxkcmVuIl0KfQo=
