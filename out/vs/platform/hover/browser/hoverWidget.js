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
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import "./hover.css";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../base/common/lifecycle.js";
import { Emitter } from "../../../base/common/event.js";
import * as dom from "../../../base/browser/dom.js";
import { IKeybindingService } from "../../keybinding/common/keybinding.js";
import { KeyCode } from "../../../base/common/keyCodes.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { HoverAction, HoverPosition, HoverWidget as BaseHoverWidget, getHoverAccessibleViewHint } from "../../../base/browser/ui/hover/hoverWidget.js";
import { Widget } from "../../../base/browser/ui/widget.js";
import { AnchorAlignment, AnchorPosition } from "../../../base/browser/ui/contextview/contextview.js";
import { IMarkdownRendererService } from "../../markdown/browser/markdownRenderer.js";
import { isMarkdownString } from "../../../base/common/htmlContent.js";
import { localize } from "../../../nls.js";
import { isMacintosh } from "../../../base/common/platform.js";
import { IAccessibilityService } from "../../accessibility/common/accessibility.js";
import { status } from "../../../base/browser/ui/aria/aria.js";
import { HoverStyle } from "../../../base/browser/ui/hover/hover.js";
import { TimeoutTimer } from "../../../base/common/async.js";
import { isNumber } from "../../../base/common/types.js";
const $ = dom.$;
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["PointerSize"] = 3] = "PointerSize";
  Constants2[Constants2["HoverBorderWidth"] = 2] = "HoverBorderWidth";
  Constants2[Constants2["HoverWindowEdgeMargin"] = 2] = "HoverWindowEdgeMargin";
  return Constants2;
})(Constants || {});
let HoverWidget = class extends Widget {
  constructor(options, _keybindingService, _configurationService, _markdownRenderer, _accessibilityService) {
    super();
    this._keybindingService = _keybindingService;
    this._configurationService = _configurationService;
    this._markdownRenderer = _markdownRenderer;
    this._accessibilityService = _accessibilityService;
    this._messageListeners = new DisposableStore();
    this._isDisposed = false;
    this._forcePosition = false;
    this._x = 0;
    this._y = 0;
    this._isLocked = false;
    this._enableFocusTraps = false;
    this._addedFocusTrap = false;
    this._maxHeightRatioRelativeToWindow = 0.5;
    this._onDispose = this._register(new Emitter());
    this._onRequestLayout = this._register(new Emitter());
    this._linkHandler = options.linkHandler;
    this._target = "targetElements" in options.target ? options.target : new ElementHoverTarget(options.target);
    this._anchorAlignment = options.position?.anchorAlignment ?? AnchorAlignment.LEFT;
    if (options.style) {
      switch (options.style) {
        case HoverStyle.Pointer: {
          options.appearance ??= {};
          options.appearance.compact ??= true;
          options.appearance.showPointer ??= true;
          break;
        }
        case HoverStyle.Mouse: {
          options.appearance ??= {};
          options.appearance.compact ??= true;
          break;
        }
      }
    }
    this._hoverPointer = options.appearance?.showPointer ? $("div.workbench-hover-pointer") : void 0;
    this._hover = this._register(new BaseHoverWidget(!options.appearance?.skipFadeInAnimation));
    this._hover.containerDomNode.classList.add("workbench-hover");
    if (options.appearance?.compact) {
      this._hover.containerDomNode.classList.add("workbench-hover", "compact");
    }
    if (this._hoverPointer) {
      this._hover.containerDomNode.classList.add("with-pointer");
    }
    if (options.additionalClasses) {
      this._hover.containerDomNode.classList.add(...options.additionalClasses);
    }
    if (options.position?.forcePosition) {
      this._forcePosition = true;
    }
    if (options.trapFocus) {
      this._enableFocusTraps = true;
    }
    const maxHeightRatio = options.appearance?.maxHeightRatio;
    if (maxHeightRatio !== void 0 && maxHeightRatio > 0 && maxHeightRatio <= 1) {
      this._maxHeightRatioRelativeToWindow = maxHeightRatio;
    }
    this._hoverPosition = options.position?.hoverPosition === void 0 ? HoverPosition.ABOVE : isNumber(options.position.hoverPosition) ? options.position.hoverPosition : HoverPosition.BELOW;
    this.onmousedown(this._hover.containerDomNode, (e) => e.stopPropagation());
    this.onkeydown(this._hover.containerDomNode, (e) => {
      if (e.equals(KeyCode.Escape)) {
        this.dispose();
      }
    });
    this._register(dom.addDisposableListener(this._targetWindow, "blur", () => this.dispose()));
    const rowElement = $("div.hover-row.markdown-hover");
    const contentsElement = $("div.hover-contents");
    if (typeof options.content === "string") {
      contentsElement.textContent = options.content;
      contentsElement.style.whiteSpace = "pre-wrap";
    } else if (dom.isHTMLElement(options.content)) {
      contentsElement.appendChild(options.content);
      contentsElement.classList.add("html-hover-contents");
      const resizeObserver = new ResizeObserver(() => {
        this.layout();
        this._onRequestLayout.fire();
      });
      resizeObserver.observe(contentsElement);
      this._register(toDisposable(() => resizeObserver.disconnect()));
    } else {
      const markdown = options.content;
      const { element } = this._register(this._markdownRenderer.render(markdown, {
        actionHandler: this._linkHandler,
        asyncRenderCallback: () => {
          contentsElement.classList.add("code-hover-contents");
          this.layout();
          this._onRequestLayout.fire();
        }
      }));
      contentsElement.appendChild(element);
    }
    rowElement.appendChild(contentsElement);
    this._hover.contentsDomNode.appendChild(rowElement);
    if (options.actions && options.actions.length > 0) {
      const statusBarElement = $("div.hover-row.status-bar");
      const actionsElement = $("div.actions");
      options.actions.forEach((action) => {
        const keybinding = this._keybindingService.lookupKeybinding(action.commandId);
        const keybindingLabel = keybinding ? keybinding.getLabel() : null;
        this._register(HoverAction.render(actionsElement, {
          label: action.label,
          commandId: action.commandId,
          run: (e) => {
            action.run(e);
            this.dispose();
          },
          iconClass: action.iconClass
        }, keybindingLabel));
      });
      statusBarElement.appendChild(actionsElement);
      this._hover.containerDomNode.appendChild(statusBarElement);
    }
    this._hoverContainer = $("div.workbench-hover-container");
    if (this._hoverPointer) {
      this._hoverContainer.appendChild(this._hoverPointer);
    }
    this._hoverContainer.appendChild(this._hover.containerDomNode);
    let hideOnHover;
    if (options.actions && options.actions.length > 0) {
      hideOnHover = false;
    } else {
      if (options.persistence?.hideOnHover === void 0) {
        hideOnHover = typeof options.content === "string" || isMarkdownString(options.content) && !options.content.value.includes("](") && !options.content.value.includes("</a>");
      } else {
        hideOnHover = options.persistence.hideOnHover;
      }
    }
    if (options.appearance?.showHoverHint) {
      const statusBarElement = $("div.hover-row.status-bar");
      const infoElement = $("div.info");
      infoElement.textContent = localize("hoverhint", "Hold {0} key to mouse over", isMacintosh ? "Option" : "Alt");
      statusBarElement.appendChild(infoElement);
      this._hover.containerDomNode.appendChild(statusBarElement);
    }
    const mouseTrackerTargets = [...this._target.targetElements];
    if (!hideOnHover) {
      mouseTrackerTargets.push(this._hoverContainer);
    }
    const mouseTracker = this._mouseTracker = this._register(new CompositeMouseTracker(mouseTrackerTargets));
    this._register(mouseTracker.onMouseOut(() => {
      if (!this._isLocked) {
        this.dispose();
      }
    }));
    if (hideOnHover) {
      const mouseTracker2Targets = [...this._target.targetElements, this._hoverContainer];
      this._lockMouseTracker = this._register(new CompositeMouseTracker(mouseTracker2Targets));
      this._register(this._lockMouseTracker.onMouseOut(() => {
        if (!this._isLocked) {
          this.dispose();
        }
      }));
    } else {
      this._lockMouseTracker = mouseTracker;
    }
  }
  get _targetWindow() {
    return dom.getWindow(this._target.targetElements[0]);
  }
  get _targetDocumentElement() {
    return dom.getWindow(this._target.targetElements[0]).document.documentElement;
  }
  get isDisposed() {
    return this._isDisposed;
  }
  get isMouseIn() {
    return this._lockMouseTracker.isMouseIn;
  }
  get domNode() {
    return this._hover.containerDomNode;
  }
  get onDispose() {
    return this._onDispose.event;
  }
  get onRequestLayout() {
    return this._onRequestLayout.event;
  }
  get anchor() {
    return this._hoverPosition === HoverPosition.BELOW ? AnchorPosition.BELOW : AnchorPosition.ABOVE;
  }
  get x() {
    return this._x;
  }
  get y() {
    return this._y;
  }
  /**
   * Whether the hover is "locked" by holding the alt/option key. When locked, the hover will not
   * hide and can be hovered regardless of whether the `hideOnHover` hover option is set.
   */
  get isLocked() {
    return this._isLocked;
  }
  set isLocked(value) {
    if (this._isLocked === value) {
      return;
    }
    this._isLocked = value;
    this._hoverContainer.classList.toggle("locked", this._isLocked);
  }
  /**
   * Adds an element to be tracked by this hover's mouse tracker. Mouse events on
   * this element will be considered as being "inside" the hover, preventing it
   * from closing. This is used for nested hovers where the child hover's container
   * should be treated as part of the parent hover.
   */
  addMouseTrackingElement(element) {
    return this._lockMouseTracker.addElement(element);
  }
  addFocusTrap() {
    if (!this._enableFocusTraps || this._addedFocusTrap) {
      return;
    }
    this._addedFocusTrap = true;
    const firstContainerFocusElement = this._hover.containerDomNode;
    const lastContainerFocusElement = this.findLastFocusableChild(this._hover.containerDomNode);
    if (lastContainerFocusElement) {
      const beforeContainerFocusElement = dom.prepend(this._hoverContainer, $("div"));
      const afterContainerFocusElement = dom.append(this._hoverContainer, $("div"));
      beforeContainerFocusElement.tabIndex = 0;
      afterContainerFocusElement.tabIndex = 0;
      this._register(dom.addDisposableListener(afterContainerFocusElement, "focus", (e) => {
        firstContainerFocusElement.focus();
        e.preventDefault();
      }));
      this._register(dom.addDisposableListener(beforeContainerFocusElement, "focus", (e) => {
        lastContainerFocusElement.focus();
        e.preventDefault();
      }));
    }
  }
  findLastFocusableChild(root) {
    if (root.hasChildNodes()) {
      for (let i = 0; i < root.childNodes.length; i++) {
        const node = root.childNodes.item(root.childNodes.length - i - 1);
        if (node.nodeType === node.ELEMENT_NODE) {
          const parsedNode = node;
          if (typeof parsedNode.tabIndex === "number" && parsedNode.tabIndex >= 0) {
            return parsedNode;
          }
        }
        const recursivelyFoundElement = this.findLastFocusableChild(node);
        if (recursivelyFoundElement) {
          return recursivelyFoundElement;
        }
      }
    }
    return void 0;
  }
  render(container) {
    container.appendChild(this._hoverContainer);
    const hoverFocused = this._hoverContainer.contains(this._hoverContainer.ownerDocument.activeElement);
    const accessibleViewHint = hoverFocused && getHoverAccessibleViewHint(this._configurationService.getValue("accessibility.verbosity.hover") === true && this._accessibilityService.isScreenReaderOptimized(), this._keybindingService.lookupKeybinding("editor.action.accessibleView")?.getAriaLabel());
    if (accessibleViewHint) {
      status(accessibleViewHint);
    }
    this.layout();
    this.addFocusTrap();
  }
  layout() {
    this._mouseTracker?.suppressPendingMouseOut();
    if (this._lockMouseTracker !== this._mouseTracker) {
      this._lockMouseTracker?.suppressPendingMouseOut();
    }
    this._hover.containerDomNode.classList.remove("right-aligned");
    this._hover.contentsDomNode.style.maxHeight = "";
    this._hover.containerDomNode.style.maxWidth = "";
    const getZoomAccountedBoundingClientRect = (e) => {
      const zoom = dom.getDomNodeZoomLevel(e);
      const boundingRect = e.getBoundingClientRect();
      return {
        top: boundingRect.top * zoom,
        bottom: boundingRect.bottom * zoom,
        right: boundingRect.right * zoom,
        left: boundingRect.left * zoom
      };
    };
    const targetBounds = this._target.targetElements.map((e) => getZoomAccountedBoundingClientRect(e));
    const { top, right, bottom, left } = targetBounds[0];
    const width = right - left;
    const height = bottom - top;
    const targetRect = {
      top,
      right,
      bottom,
      left,
      width,
      height,
      center: {
        x: left + width / 2,
        y: top + height / 2
      }
    };
    this.adjustHorizontalHoverPosition(targetRect);
    this.adjustVerticalHoverPosition(targetRect);
    this.adjustHoverMaxHeight(targetRect);
    this._hoverContainer.style.padding = "";
    this._hoverContainer.style.margin = "";
    if (this._hoverPointer) {
      switch (this._hoverPosition) {
        case HoverPosition.RIGHT:
          targetRect.left += 3 /* PointerSize */;
          targetRect.right += 3 /* PointerSize */;
          this._hoverContainer.style.paddingLeft = `${3 /* PointerSize */}px`;
          this._hoverContainer.style.marginLeft = `${-3}px`;
          break;
        case HoverPosition.LEFT:
          targetRect.left -= 3 /* PointerSize */;
          targetRect.right -= 3 /* PointerSize */;
          this._hoverContainer.style.paddingRight = `${3 /* PointerSize */}px`;
          this._hoverContainer.style.marginRight = `${-3}px`;
          break;
        case HoverPosition.BELOW:
          targetRect.top += 3 /* PointerSize */;
          targetRect.bottom += 3 /* PointerSize */;
          this._hoverContainer.style.paddingTop = `${3 /* PointerSize */}px`;
          this._hoverContainer.style.marginTop = `${-3}px`;
          break;
        case HoverPosition.ABOVE:
          targetRect.top -= 3 /* PointerSize */;
          targetRect.bottom -= 3 /* PointerSize */;
          this._hoverContainer.style.paddingBottom = `${3 /* PointerSize */}px`;
          this._hoverContainer.style.marginBottom = `${-3}px`;
          break;
      }
      targetRect.center.x = targetRect.left + width / 2;
      targetRect.center.y = targetRect.top + height / 2;
    }
    this.computeXCordinate(targetRect);
    this.computeYCordinate(targetRect);
    if (this._hoverPointer) {
      this._hoverPointer.classList.remove("top");
      this._hoverPointer.classList.remove("left");
      this._hoverPointer.classList.remove("right");
      this._hoverPointer.classList.remove("bottom");
      this.setHoverPointerPosition(targetRect);
    }
    this._hover.onContentsChanged();
  }
  computeXCordinate(target) {
    const hoverWidth = this._hover.containerDomNode.clientWidth + 2 /* HoverBorderWidth */;
    if (this._target.x !== void 0) {
      this._x = this._target.x;
    } else if (this._hoverPosition === HoverPosition.RIGHT) {
      this._x = target.right;
    } else if (this._hoverPosition === HoverPosition.LEFT) {
      this._x = target.left - hoverWidth;
    } else {
      if (this._anchorAlignment === AnchorAlignment.RIGHT) {
        this._x = target.right - hoverWidth;
      } else if (this._hoverPointer) {
        this._x = target.center.x - this._hover.containerDomNode.clientWidth / 2;
      } else {
        this._x = target.left;
      }
      if (this._x + hoverWidth >= this._targetDocumentElement.clientWidth) {
        this._hover.containerDomNode.classList.add("right-aligned");
        this._x = Math.max(this._targetDocumentElement.clientWidth - hoverWidth - 2 /* HoverWindowEdgeMargin */, this._targetDocumentElement.clientLeft);
      }
    }
    if (this._x < this._targetDocumentElement.clientLeft) {
      this._x = target.left + 2 /* HoverWindowEdgeMargin */;
    }
  }
  computeYCordinate(target) {
    if (this._target.y !== void 0) {
      this._y = this._target.y;
    } else if (this._hoverPosition === HoverPosition.ABOVE) {
      this._y = target.top;
    } else if (this._hoverPosition === HoverPosition.BELOW) {
      this._y = target.bottom - 2;
    } else {
      if (this._hoverPointer) {
        this._y = target.center.y + this._hover.containerDomNode.clientHeight / 2;
      } else {
        this._y = target.bottom;
      }
    }
    if (this._y > this._targetWindow.innerHeight) {
      this._y = target.bottom;
    }
  }
  adjustHorizontalHoverPosition(target) {
    if (this._target.x !== void 0) {
      return;
    }
    if (this._anchorAlignment === AnchorAlignment.RIGHT && (this._hoverPosition === HoverPosition.ABOVE || this._hoverPosition === HoverPosition.BELOW)) {
      const availableWidth = target.right - this._targetDocumentElement.clientLeft - 2 /* HoverWindowEdgeMargin */ - 2 /* HoverBorderWidth */;
      if (this._hover.containerDomNode.clientWidth > availableWidth) {
        this._hover.containerDomNode.style.maxWidth = `${Math.max(availableWidth, 0)}px`;
      }
      return;
    }
    const hoverPointerOffset = this._hoverPointer ? 3 /* PointerSize */ : 0;
    if (this._forcePosition) {
      const padding = hoverPointerOffset + 2 /* HoverBorderWidth */;
      if (this._hoverPosition === HoverPosition.RIGHT) {
        this._hover.containerDomNode.style.maxWidth = `${this._targetDocumentElement.clientWidth - target.right - padding}px`;
      } else if (this._hoverPosition === HoverPosition.LEFT) {
        this._hover.containerDomNode.style.maxWidth = `${target.left - padding}px`;
      }
      return;
    }
    if (this._hoverPosition === HoverPosition.RIGHT) {
      const roomOnRight = this._targetDocumentElement.clientWidth - target.right;
      if (roomOnRight < this._hover.containerDomNode.clientWidth + hoverPointerOffset) {
        const roomOnLeft = target.left;
        if (roomOnLeft >= this._hover.containerDomNode.clientWidth + hoverPointerOffset) {
          this._hoverPosition = HoverPosition.LEFT;
        } else {
          this._hoverPosition = HoverPosition.BELOW;
        }
      }
    } else if (this._hoverPosition === HoverPosition.LEFT) {
      const roomOnLeft = target.left;
      if (roomOnLeft < this._hover.containerDomNode.clientWidth + hoverPointerOffset) {
        const roomOnRight = this._targetDocumentElement.clientWidth - target.right;
        if (roomOnRight >= this._hover.containerDomNode.clientWidth + hoverPointerOffset) {
          this._hoverPosition = HoverPosition.RIGHT;
        } else {
          this._hoverPosition = HoverPosition.BELOW;
        }
      }
      if (target.left - this._hover.containerDomNode.clientWidth - hoverPointerOffset <= this._targetDocumentElement.clientLeft) {
        this._hoverPosition = HoverPosition.RIGHT;
      }
    }
  }
  adjustVerticalHoverPosition(target) {
    if (this._target.y !== void 0 || this._forcePosition) {
      return;
    }
    const hoverPointerOffset = this._hoverPointer ? 3 /* PointerSize */ : 0;
    if (this._hoverPosition === HoverPosition.ABOVE) {
      if (target.top - this._hover.containerDomNode.clientHeight - hoverPointerOffset < 0) {
        this._hoverPosition = HoverPosition.BELOW;
      }
    } else if (this._hoverPosition === HoverPosition.BELOW) {
      if (target.bottom + this._hover.containerDomNode.offsetHeight + hoverPointerOffset > this._targetWindow.innerHeight) {
        this._hoverPosition = HoverPosition.ABOVE;
      }
    }
  }
  adjustHoverMaxHeight(target) {
    let maxHeight = this._targetWindow.innerHeight * this._maxHeightRatioRelativeToWindow;
    if (this._forcePosition) {
      const padding = (this._hoverPointer ? 3 /* PointerSize */ : 0) + 2 /* HoverBorderWidth */;
      if (this._hoverPosition === HoverPosition.ABOVE) {
        maxHeight = Math.min(maxHeight, target.top - padding);
      } else if (this._hoverPosition === HoverPosition.BELOW) {
        maxHeight = Math.min(maxHeight, this._targetWindow.innerHeight - target.bottom - padding);
      }
    }
    this._hover.containerDomNode.style.maxHeight = `${maxHeight}px`;
    if (this._hover.contentsDomNode.clientHeight < this._hover.contentsDomNode.scrollHeight) {
      const extraRightPadding = `${this._hover.scrollbar.options.verticalScrollbarSize}px`;
      if (this._hover.contentsDomNode.style.paddingRight !== extraRightPadding) {
        this._hover.contentsDomNode.style.paddingRight = extraRightPadding;
      }
    }
  }
  setHoverPointerPosition(target) {
    if (!this._hoverPointer) {
      return;
    }
    switch (this._hoverPosition) {
      case HoverPosition.LEFT:
      case HoverPosition.RIGHT: {
        this._hoverPointer.classList.add(this._hoverPosition === HoverPosition.LEFT ? "right" : "left");
        const hoverHeight = this._hover.containerDomNode.clientHeight;
        if (hoverHeight > target.height) {
          this._hoverPointer.style.top = `${target.center.y - (this._y - hoverHeight) - 3 /* PointerSize */}px`;
        } else {
          this._hoverPointer.style.top = `${Math.round(hoverHeight / 2) - 3 /* PointerSize */}px`;
        }
        break;
      }
      case HoverPosition.ABOVE:
      case HoverPosition.BELOW: {
        this._hoverPointer.classList.add(this._hoverPosition === HoverPosition.ABOVE ? "bottom" : "top");
        const hoverWidth = this._hover.containerDomNode.clientWidth;
        let pointerLeftPosition = Math.round(hoverWidth / 2) - 3 /* PointerSize */;
        const pointerX = this._x + pointerLeftPosition;
        if (pointerX < target.left || pointerX > target.right) {
          pointerLeftPosition = target.center.x - this._x - 3 /* PointerSize */;
        }
        this._hoverPointer.style.left = `${pointerLeftPosition}px`;
        break;
      }
    }
  }
  focus() {
    this._hover.containerDomNode.focus();
  }
  hide() {
    this.dispose();
  }
  dispose() {
    if (!this._isDisposed) {
      this._onDispose.fire();
      this._target.dispose?.();
      this._hoverContainer.remove();
      this._messageListeners.dispose();
      super.dispose();
    }
    this._isDisposed = true;
  }
};
HoverWidget = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IMarkdownRendererService),
  __decorateParam(4, IAccessibilityService)
], HoverWidget);
class CompositeMouseTracker extends Widget {
  /**
   * @param _elements The target elements to track mouse in/out events on.
   * @param _eventDebounceDelay The delay in ms to debounce the event firing. This is used to
   * allow a short period for the mouse to move into the hover or a nearby target element. For
   * example hovering a scroll bar will not hide the hover immediately.
   */
  constructor(_elements, _eventDebounceDelay = 200) {
    super();
    this._elements = _elements;
    this._eventDebounceDelay = _eventDebounceDelay;
    this._isMouseIn = true;
    this._suppressNextMouseOut = false;
    this._mouseTimer = this._register(new MutableDisposable());
    this._onMouseOut = this._register(new Emitter());
    for (const element of this._elements) {
      this.onmouseover(element, () => this._onTargetMouseOver());
      this.onmouseleave(element, () => this._onTargetMouseLeave());
    }
  }
  get onMouseOut() {
    return this._onMouseOut.event;
  }
  get isMouseIn() {
    return this._isMouseIn;
  }
  _onTargetMouseOver() {
    this._isMouseIn = true;
    this._suppressNextMouseOut = false;
    this._mouseTimer.clear();
  }
  _onTargetMouseLeave() {
    this._isMouseIn = false;
    this._mouseTimer.value = new TimeoutTimer(() => this._fireIfMouseOutside(), this._eventDebounceDelay);
  }
  _fireIfMouseOutside() {
    if (!this._isMouseIn && !this._suppressNextMouseOut) {
      this._onMouseOut.fire();
    }
  }
  /**
   * Suppresses the next pending mouseout dismissal. Call this when tracked
   * elements are being resized or repositioned to avoid spurious dismissals
   * caused by the element shrinking away from the cursor. The suppression
   * is cleared when the mouse next enters a tracked element.
   */
  suppressPendingMouseOut() {
    if (!this._isMouseIn) {
      this._suppressNextMouseOut = true;
    }
  }
  /**
   * Adds an element to be tracked by this mouse tracker. Mouse events on this
   * element will be considered as being "inside" the tracked area.
   */
  addElement(element) {
    if (this._elements.includes(element)) {
      return Disposable.None;
    }
    this._elements.push(element);
    const store = new DisposableStore();
    store.add(dom.addDisposableListener(element, dom.EventType.MOUSE_OVER, () => this._onTargetMouseOver()));
    store.add(dom.addDisposableListener(element, dom.EventType.MOUSE_LEAVE, () => this._onTargetMouseLeave()));
    store.add(toDisposable(() => {
      const index = this._elements.indexOf(element);
      if (index >= 0) {
        this._elements.splice(index, 1);
      }
    }));
    return store;
  }
}
class ElementHoverTarget {
  constructor(_element) {
    this._element = _element;
    this.targetElements = [this._element];
  }
  dispose() {
  }
}
export {
  HoverWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcaG92ZXJcXGJyb3dzZXJcXGhvdmVyV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL2hvdmVyLmNzcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBIb3ZlckFjdGlvbiwgSG92ZXJQb3NpdGlvbiwgSG92ZXJXaWRnZXQgYXMgQmFzZUhvdmVyV2lkZ2V0LCBnZXRIb3ZlckFjY2Vzc2libGVWaWV3SGludCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlcldpZGdldC5qcyc7XG5pbXBvcnQgeyBXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvd2lkZ2V0LmpzJztcbmltcG9ydCB7IEFuY2hvckFsaWdubWVudCwgQW5jaG9yUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY29udGV4dHZpZXcvY29udGV4dHZpZXcuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IGlzTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgc3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBIb3ZlclN0eWxlLCB0eXBlIElIb3Zlck9wdGlvbnMsIHR5cGUgSUhvdmVyVGFyZ2V0LCB0eXBlIElIb3ZlcldpZGdldCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBUaW1lb3V0VGltZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBpc051bWJlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuY29uc3QgJCA9IGRvbS4kO1xudHlwZSBUYXJnZXRSZWN0ID0ge1xuXHRsZWZ0OiBudW1iZXI7XG5cdHJpZ2h0OiBudW1iZXI7XG5cdHRvcDogbnVtYmVyO1xuXHRib3R0b206IG51bWJlcjtcblx0d2lkdGg6IG51bWJlcjtcblx0aGVpZ2h0OiBudW1iZXI7XG5cdGNlbnRlcjogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9O1xufTtcblxuY29uc3QgZW51bSBDb25zdGFudHMge1xuXHRQb2ludGVyU2l6ZSA9IDMsXG5cdEhvdmVyQm9yZGVyV2lkdGggPSAyLFxuXHRIb3ZlcldpbmRvd0VkZ2VNYXJnaW4gPSAyLFxufVxuXG5leHBvcnQgY2xhc3MgSG92ZXJXaWRnZXQgZXh0ZW5kcyBXaWRnZXQgaW1wbGVtZW50cyBJSG92ZXJXaWRnZXQge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tZXNzYWdlTGlzdGVuZXJzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2NrTW91c2VUcmFja2VyOiBDb21wb3NpdGVNb3VzZVRyYWNrZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaG92ZXI6IEJhc2VIb3ZlcldpZGdldDtcblx0cHJpdmF0ZSByZWFkb25seSBfaG92ZXJQb2ludGVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfaG92ZXJDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF90YXJnZXQ6IElIb3ZlclRhcmdldDtcblx0cHJpdmF0ZSByZWFkb25seSBfYW5jaG9yQWxpZ25tZW50OiBBbmNob3JBbGlnbm1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpbmtIYW5kbGVyOiAoKHVybDogc3RyaW5nKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2hvdmVyUG9zaXRpb246IEhvdmVyUG9zaXRpb247XG5cdHByaXZhdGUgX2ZvcmNlUG9zaXRpb246IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfeDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBfeTogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBfaXNMb2NrZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfZW5hYmxlRm9jdXNUcmFwczogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9hZGRlZEZvY3VzVHJhcDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9tYXhIZWlnaHRSYXRpb1JlbGF0aXZlVG9XaW5kb3c6IG51bWJlciA9IDAuNTtcblx0cHJpdmF0ZSBfbW91c2VUcmFja2VyOiBDb21wb3NpdGVNb3VzZVRyYWNrZXIgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBnZXQgX3RhcmdldFdpbmRvdygpOiBXaW5kb3cge1xuXHRcdHJldHVybiBkb20uZ2V0V2luZG93KHRoaXMuX3RhcmdldC50YXJnZXRFbGVtZW50c1swXSk7XG5cdH1cblx0cHJpdmF0ZSBnZXQgX3RhcmdldERvY3VtZW50RWxlbWVudCgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIGRvbS5nZXRXaW5kb3codGhpcy5fdGFyZ2V0LnRhcmdldEVsZW1lbnRzWzBdKS5kb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XG5cdH1cblxuXHRnZXQgaXNEaXNwb3NlZCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2lzRGlzcG9zZWQ7IH1cblx0Z2V0IGlzTW91c2VJbigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2xvY2tNb3VzZVRyYWNrZXIuaXNNb3VzZUluOyB9XG5cdGdldCBkb21Ob2RlKCk6IEhUTUxFbGVtZW50IHsgcmV0dXJuIHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGU7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpc3Bvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0Z2V0IG9uRGlzcG9zZSgpOiBFdmVudDx2b2lkPiB7IHJldHVybiB0aGlzLl9vbkRpc3Bvc2UuZXZlbnQ7IH1cblx0cHJpdmF0ZSByZWFkb25seSBfb25SZXF1ZXN0TGF5b3V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdGdldCBvblJlcXVlc3RMYXlvdXQoKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gdGhpcy5fb25SZXF1ZXN0TGF5b3V0LmV2ZW50OyB9XG5cblx0Z2V0IGFuY2hvcigpOiBBbmNob3JQb3NpdGlvbiB7IHJldHVybiB0aGlzLl9ob3ZlclBvc2l0aW9uID09PSBIb3ZlclBvc2l0aW9uLkJFTE9XID8gQW5jaG9yUG9zaXRpb24uQkVMT1cgOiBBbmNob3JQb3NpdGlvbi5BQk9WRTsgfVxuXHRnZXQgeCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5feDsgfVxuXHRnZXQgeSgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5feTsgfVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBob3ZlciBpcyBcImxvY2tlZFwiIGJ5IGhvbGRpbmcgdGhlIGFsdC9vcHRpb24ga2V5LiBXaGVuIGxvY2tlZCwgdGhlIGhvdmVyIHdpbGwgbm90XG5cdCAqIGhpZGUgYW5kIGNhbiBiZSBob3ZlcmVkIHJlZ2FyZGxlc3Mgb2Ygd2hldGhlciB0aGUgYGhpZGVPbkhvdmVyYCBob3ZlciBvcHRpb24gaXMgc2V0LlxuXHQgKi9cblx0Z2V0IGlzTG9ja2VkKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5faXNMb2NrZWQ7IH1cblx0c2V0IGlzTG9ja2VkKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMuX2lzTG9ja2VkID09PSB2YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9pc0xvY2tlZCA9IHZhbHVlO1xuXHRcdHRoaXMuX2hvdmVyQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2xvY2tlZCcsIHRoaXMuX2lzTG9ja2VkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBZGRzIGFuIGVsZW1lbnQgdG8gYmUgdHJhY2tlZCBieSB0aGlzIGhvdmVyJ3MgbW91c2UgdHJhY2tlci4gTW91c2UgZXZlbnRzIG9uXG5cdCAqIHRoaXMgZWxlbWVudCB3aWxsIGJlIGNvbnNpZGVyZWQgYXMgYmVpbmcgXCJpbnNpZGVcIiB0aGUgaG92ZXIsIHByZXZlbnRpbmcgaXRcblx0ICogZnJvbSBjbG9zaW5nLiBUaGlzIGlzIHVzZWQgZm9yIG5lc3RlZCBob3ZlcnMgd2hlcmUgdGhlIGNoaWxkIGhvdmVyJ3MgY29udGFpbmVyXG5cdCAqIHNob3VsZCBiZSB0cmVhdGVkIGFzIHBhcnQgb2YgdGhlIHBhcmVudCBob3Zlci5cblx0ICovXG5cdGFkZE1vdXNlVHJhY2tpbmdFbGVtZW50KGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiB0aGlzLl9sb2NrTW91c2VUcmFja2VyLmFkZEVsZW1lbnQoZWxlbWVudCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJSG92ZXJPcHRpb25zLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tYXJrZG93blJlbmRlcmVyOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9saW5rSGFuZGxlciA9IG9wdGlvbnMubGlua0hhbmRsZXI7XG5cblx0XHR0aGlzLl90YXJnZXQgPSAndGFyZ2V0RWxlbWVudHMnIGluIG9wdGlvbnMudGFyZ2V0ID8gb3B0aW9ucy50YXJnZXQgOiBuZXcgRWxlbWVudEhvdmVyVGFyZ2V0KG9wdGlvbnMudGFyZ2V0KTtcblx0XHR0aGlzLl9hbmNob3JBbGlnbm1lbnQgPSBvcHRpb25zLnBvc2l0aW9uPy5hbmNob3JBbGlnbm1lbnQgPz8gQW5jaG9yQWxpZ25tZW50LkxFRlQ7XG5cblx0XHRpZiAob3B0aW9ucy5zdHlsZSkge1xuXHRcdFx0c3dpdGNoIChvcHRpb25zLnN0eWxlKSB7XG5cdFx0XHRcdGNhc2UgSG92ZXJTdHlsZS5Qb2ludGVyOiB7XG5cdFx0XHRcdFx0b3B0aW9ucy5hcHBlYXJhbmNlID8/PSB7fTtcblx0XHRcdFx0XHRvcHRpb25zLmFwcGVhcmFuY2UuY29tcGFjdCA/Pz0gdHJ1ZTtcblx0XHRcdFx0XHRvcHRpb25zLmFwcGVhcmFuY2Uuc2hvd1BvaW50ZXIgPz89IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSBIb3ZlclN0eWxlLk1vdXNlOiB7XG5cdFx0XHRcdFx0b3B0aW9ucy5hcHBlYXJhbmNlID8/PSB7fTtcblx0XHRcdFx0XHRvcHRpb25zLmFwcGVhcmFuY2UuY29tcGFjdCA/Pz0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2hvdmVyUG9pbnRlciA9IG9wdGlvbnMuYXBwZWFyYW5jZT8uc2hvd1BvaW50ZXIgPyAkKCdkaXYud29ya2JlbmNoLWhvdmVyLXBvaW50ZXInKSA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9ob3ZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCYXNlSG92ZXJXaWRnZXQoIW9wdGlvbnMuYXBwZWFyYW5jZT8uc2tpcEZhZGVJbkFuaW1hdGlvbikpO1xuXHRcdHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnd29ya2JlbmNoLWhvdmVyJyk7XG5cdFx0aWYgKG9wdGlvbnMuYXBwZWFyYW5jZT8uY29tcGFjdCkge1xuXHRcdFx0dGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZS5jbGFzc0xpc3QuYWRkKCd3b3JrYmVuY2gtaG92ZXInLCAnY29tcGFjdCcpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5faG92ZXJQb2ludGVyKSB7XG5cdFx0XHR0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ3dpdGgtcG9pbnRlcicpO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucy5hZGRpdGlvbmFsQ2xhc3Nlcykge1xuXHRcdFx0dGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZS5jbGFzc0xpc3QuYWRkKC4uLm9wdGlvbnMuYWRkaXRpb25hbENsYXNzZXMpO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucy5wb3NpdGlvbj8uZm9yY2VQb3NpdGlvbikge1xuXHRcdFx0dGhpcy5fZm9yY2VQb3NpdGlvbiA9IHRydWU7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zLnRyYXBGb2N1cykge1xuXHRcdFx0dGhpcy5fZW5hYmxlRm9jdXNUcmFwcyA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWF4SGVpZ2h0UmF0aW8gPSBvcHRpb25zLmFwcGVhcmFuY2U/Lm1heEhlaWdodFJhdGlvO1xuXHRcdGlmIChtYXhIZWlnaHRSYXRpbyAhPT0gdW5kZWZpbmVkICYmIG1heEhlaWdodFJhdGlvID4gMCAmJiBtYXhIZWlnaHRSYXRpbyA8PSAxKSB7XG5cdFx0XHR0aGlzLl9tYXhIZWlnaHRSYXRpb1JlbGF0aXZlVG9XaW5kb3cgPSBtYXhIZWlnaHRSYXRpbztcblx0XHR9XG5cblx0XHQvLyBEZWZhdWx0IHRvIHBvc2l0aW9uIGFib3ZlIHdoZW4gdGhlIHBvc2l0aW9uIGlzIHVuc3BlY2lmaWVkIG9yIGEgbW91c2UgZXZlbnRcblx0XHR0aGlzLl9ob3ZlclBvc2l0aW9uID0gb3B0aW9ucy5wb3NpdGlvbj8uaG92ZXJQb3NpdGlvbiA9PT0gdW5kZWZpbmVkXG5cdFx0XHQ/IEhvdmVyUG9zaXRpb24uQUJPVkVcblx0XHRcdDogaXNOdW1iZXIob3B0aW9ucy5wb3NpdGlvbi5ob3ZlclBvc2l0aW9uKVxuXHRcdFx0XHQ/IG9wdGlvbnMucG9zaXRpb24uaG92ZXJQb3NpdGlvblxuXHRcdFx0XHQ6IEhvdmVyUG9zaXRpb24uQkVMT1c7XG5cblx0XHQvLyBEb24ndCBhbGxvdyBtb3VzZWRvd24gb3V0IG9mIHRoZSB3aWRnZXQsIG90aGVyd2lzZSBwcmV2ZW50RGVmYXVsdCB3aWxsIGNhbGwgYW5kIHRleHQgd2lsbFxuXHRcdC8vIG5vdCBiZSBzZWxlY3RlZC5cblx0XHR0aGlzLm9ubW91c2Vkb3duKHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUsIGUgPT4gZS5zdG9wUHJvcGFnYXRpb24oKSk7XG5cblx0XHQvLyBIaWRlIGhvdmVyIG9uIGVzY2FwZVxuXHRcdHRoaXMub25rZXlkb3duKHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUsIGUgPT4ge1xuXHRcdFx0aWYgKGUuZXF1YWxzKEtleUNvZGUuRXNjYXBlKSkge1xuXHRcdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIEhpZGUgd2hlbiB0aGUgd2luZG93IGxvc2VzIGZvY3VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl90YXJnZXRXaW5kb3csICdibHVyJywgKCkgPT4gdGhpcy5kaXNwb3NlKCkpKTtcblxuXHRcdGNvbnN0IHJvd0VsZW1lbnQgPSAkKCdkaXYuaG92ZXItcm93Lm1hcmtkb3duLWhvdmVyJyk7XG5cdFx0Y29uc3QgY29udGVudHNFbGVtZW50ID0gJCgnZGl2LmhvdmVyLWNvbnRlbnRzJyk7XG5cdFx0aWYgKHR5cGVvZiBvcHRpb25zLmNvbnRlbnQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjb250ZW50c0VsZW1lbnQudGV4dENvbnRlbnQgPSBvcHRpb25zLmNvbnRlbnQ7XG5cdFx0XHRjb250ZW50c0VsZW1lbnQuc3R5bGUud2hpdGVTcGFjZSA9ICdwcmUtd3JhcCc7XG5cblx0XHR9IGVsc2UgaWYgKGRvbS5pc0hUTUxFbGVtZW50KG9wdGlvbnMuY29udGVudCkpIHtcblx0XHRcdGNvbnRlbnRzRWxlbWVudC5hcHBlbmRDaGlsZChvcHRpb25zLmNvbnRlbnQpO1xuXHRcdFx0Y29udGVudHNFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2h0bWwtaG92ZXItY29udGVudHMnKTtcblxuXHRcdFx0Ly8gV2F0Y2ggZm9yIHNpemUgY2hhbmdlcyBmcm9tIGR5bmFtaWMgSFRNTCBjb250ZW50IChlLmcuIGNvbGxhcHNpYmxlIHJlZ2lvbnMpLlxuXHRcdFx0Y29uc3QgcmVzaXplT2JzZXJ2ZXIgPSBuZXcgUmVzaXplT2JzZXJ2ZXIoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmxheW91dCgpO1xuXHRcdFx0XHR0aGlzLl9vblJlcXVlc3RMYXlvdXQuZmlyZSgpO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXNpemVPYnNlcnZlci5vYnNlcnZlKGNvbnRlbnRzRWxlbWVudCk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gcmVzaXplT2JzZXJ2ZXIuZGlzY29ubmVjdCgpKSk7XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSBvcHRpb25zLmNvbnRlbnQ7XG5cblx0XHRcdGNvbnN0IHsgZWxlbWVudCB9ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5fbWFya2Rvd25SZW5kZXJlci5yZW5kZXIobWFya2Rvd24sIHtcblx0XHRcdFx0YWN0aW9uSGFuZGxlcjogdGhpcy5fbGlua0hhbmRsZXIsXG5cdFx0XHRcdGFzeW5jUmVuZGVyQ2FsbGJhY2s6ICgpID0+IHtcblx0XHRcdFx0XHRjb250ZW50c0VsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY29kZS1ob3Zlci1jb250ZW50cycpO1xuXHRcdFx0XHRcdHRoaXMubGF5b3V0KCk7XG5cdFx0XHRcdFx0Ly8gVGhpcyBjaGFuZ2VzIHRoZSBkaW1lbnNpb25zIG9mIHRoZSBob3ZlciBzbyB0cmlnZ2VyIGEgbGF5b3V0XG5cdFx0XHRcdFx0dGhpcy5fb25SZXF1ZXN0TGF5b3V0LmZpcmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0Y29udGVudHNFbGVtZW50LmFwcGVuZENoaWxkKGVsZW1lbnQpO1xuXHRcdH1cblx0XHRyb3dFbGVtZW50LmFwcGVuZENoaWxkKGNvbnRlbnRzRWxlbWVudCk7XG5cdFx0dGhpcy5faG92ZXIuY29udGVudHNEb21Ob2RlLmFwcGVuZENoaWxkKHJvd0VsZW1lbnQpO1xuXG5cdFx0aWYgKG9wdGlvbnMuYWN0aW9ucyAmJiBvcHRpb25zLmFjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3Qgc3RhdHVzQmFyRWxlbWVudCA9ICQoJ2Rpdi5ob3Zlci1yb3cuc3RhdHVzLWJhcicpO1xuXHRcdFx0Y29uc3QgYWN0aW9uc0VsZW1lbnQgPSAkKCdkaXYuYWN0aW9ucycpO1xuXHRcdFx0b3B0aW9ucy5hY3Rpb25zLmZvckVhY2goYWN0aW9uID0+IHtcblx0XHRcdFx0Y29uc3Qga2V5YmluZGluZyA9IHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLmNvbW1hbmRJZCk7XG5cdFx0XHRcdGNvbnN0IGtleWJpbmRpbmdMYWJlbCA9IGtleWJpbmRpbmcgPyBrZXliaW5kaW5nLmdldExhYmVsKCkgOiBudWxsO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihIb3ZlckFjdGlvbi5yZW5kZXIoYWN0aW9uc0VsZW1lbnQsIHtcblx0XHRcdFx0XHRsYWJlbDogYWN0aW9uLmxhYmVsLFxuXHRcdFx0XHRcdGNvbW1hbmRJZDogYWN0aW9uLmNvbW1hbmRJZCxcblx0XHRcdFx0XHRydW46IGUgPT4ge1xuXHRcdFx0XHRcdFx0YWN0aW9uLnJ1bihlKTtcblx0XHRcdFx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0aWNvbkNsYXNzOiBhY3Rpb24uaWNvbkNsYXNzXG5cdFx0XHRcdH0sIGtleWJpbmRpbmdMYWJlbCkpO1xuXHRcdFx0fSk7XG5cdFx0XHRzdGF0dXNCYXJFbGVtZW50LmFwcGVuZENoaWxkKGFjdGlvbnNFbGVtZW50KTtcblx0XHRcdHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUuYXBwZW5kQ2hpbGQoc3RhdHVzQmFyRWxlbWVudCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5faG92ZXJDb250YWluZXIgPSAkKCdkaXYud29ya2JlbmNoLWhvdmVyLWNvbnRhaW5lcicpO1xuXHRcdGlmICh0aGlzLl9ob3ZlclBvaW50ZXIpIHtcblx0XHRcdHRoaXMuX2hvdmVyQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX2hvdmVyUG9pbnRlcik7XG5cdFx0fVxuXHRcdHRoaXMuX2hvdmVyQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUpO1xuXG5cdFx0Ly8gRGV0ZXJtaW5lIHdoZXRoZXIgdG8gaGlkZSBvbiBob3ZlclxuXHRcdGxldCBoaWRlT25Ib3ZlcjogYm9vbGVhbjtcblx0XHRpZiAob3B0aW9ucy5hY3Rpb25zICYmIG9wdGlvbnMuYWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHQvLyBJZiB0aGVyZSBhcmUgYWN0aW9ucywgcmVxdWlyZSBob3ZlciBzbyB0aGV5IGNhbiBiZSBhY2Nlc3NlZFxuXHRcdFx0aGlkZU9uSG92ZXIgPSBmYWxzZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKG9wdGlvbnMucGVyc2lzdGVuY2U/LmhpZGVPbkhvdmVyID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Ly8gV2hlbiB1bnNldCwgd2lsbCBkZWZhdWx0IHRvIHRydWUgd2hlbiBpdCdzIGEgc3RyaW5nIG9yIHdoZW4gaXQncyBtYXJrZG93biB0aGF0XG5cdFx0XHRcdC8vIGFwcGVhcnMgdG8gaGF2ZSBhIGxpbmsgdXNpbmcgYSBuYWl2ZSBjaGVjayBmb3IgJ10oJyBhbmQgJzwvYT4nXG5cdFx0XHRcdGhpZGVPbkhvdmVyID0gdHlwZW9mIG9wdGlvbnMuY29udGVudCA9PT0gJ3N0cmluZycgfHxcblx0XHRcdFx0XHRpc01hcmtkb3duU3RyaW5nKG9wdGlvbnMuY29udGVudCkgJiYgIW9wdGlvbnMuY29udGVudC52YWx1ZS5pbmNsdWRlcygnXSgnKSAmJiAhb3B0aW9ucy5jb250ZW50LnZhbHVlLmluY2x1ZGVzKCc8L2E+Jyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBJdCdzIHNldCBleHBsaWNpdGx5XG5cdFx0XHRcdGhpZGVPbkhvdmVyID0gb3B0aW9ucy5wZXJzaXN0ZW5jZS5oaWRlT25Ib3Zlcjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTaG93IHRoZSBob3ZlciBoaW50IGlmIG5lZWRlZFxuXHRcdGlmIChvcHRpb25zLmFwcGVhcmFuY2U/LnNob3dIb3ZlckhpbnQpIHtcblx0XHRcdGNvbnN0IHN0YXR1c0JhckVsZW1lbnQgPSAkKCdkaXYuaG92ZXItcm93LnN0YXR1cy1iYXInKTtcblx0XHRcdGNvbnN0IGluZm9FbGVtZW50ID0gJCgnZGl2LmluZm8nKTtcblx0XHRcdGluZm9FbGVtZW50LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2hvdmVyaGludCcsICdIb2xkIHswfSBrZXkgdG8gbW91c2Ugb3ZlcicsIGlzTWFjaW50b3NoID8gJ09wdGlvbicgOiAnQWx0Jyk7XG5cdFx0XHRzdGF0dXNCYXJFbGVtZW50LmFwcGVuZENoaWxkKGluZm9FbGVtZW50KTtcblx0XHRcdHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUuYXBwZW5kQ2hpbGQoc3RhdHVzQmFyRWxlbWVudCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW91c2VUcmFja2VyVGFyZ2V0cyA9IFsuLi50aGlzLl90YXJnZXQudGFyZ2V0RWxlbWVudHNdO1xuXHRcdGlmICghaGlkZU9uSG92ZXIpIHtcblx0XHRcdG1vdXNlVHJhY2tlclRhcmdldHMucHVzaCh0aGlzLl9ob3ZlckNvbnRhaW5lcik7XG5cdFx0fVxuXHRcdGNvbnN0IG1vdXNlVHJhY2tlciA9IHRoaXMuX21vdXNlVHJhY2tlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDb21wb3NpdGVNb3VzZVRyYWNrZXIobW91c2VUcmFja2VyVGFyZ2V0cykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG1vdXNlVHJhY2tlci5vbk1vdXNlT3V0KCgpID0+IHtcblx0XHRcdGlmICghdGhpcy5faXNMb2NrZWQpIHtcblx0XHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gU2V0dXAgYW5vdGhlciBtb3VzZSB0cmFja2VyIHdoZW4gaGlkZU9uSG92ZXIgaXMgc2V0IGluIG9yZGVyIHRvIHRyYWNrIHRoZSBob3ZlciBhcyB3ZWxsXG5cdFx0Ly8gd2hlbiBpdCBpcyBsb2NrZWQuIFRoaXMgZW5zdXJlcyB0aGUgaG92ZXIgd2lsbCBoaWRlIG9uIG1vdXNlb3V0IGFmdGVyIGFsdCBoYXMgYmVlblxuXHRcdC8vIHJlbGVhc2VkIHRvIHVubG9jayB0aGUgZWxlbWVudC5cblx0XHRpZiAoaGlkZU9uSG92ZXIpIHtcblx0XHRcdGNvbnN0IG1vdXNlVHJhY2tlcjJUYXJnZXRzID0gWy4uLnRoaXMuX3RhcmdldC50YXJnZXRFbGVtZW50cywgdGhpcy5faG92ZXJDb250YWluZXJdO1xuXHRcdFx0dGhpcy5fbG9ja01vdXNlVHJhY2tlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDb21wb3NpdGVNb3VzZVRyYWNrZXIobW91c2VUcmFja2VyMlRhcmdldHMpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xvY2tNb3VzZVRyYWNrZXIub25Nb3VzZU91dCgoKSA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5faXNMb2NrZWQpIHtcblx0XHRcdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9sb2NrTW91c2VUcmFja2VyID0gbW91c2VUcmFja2VyO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYWRkRm9jdXNUcmFwKCkge1xuXHRcdGlmICghdGhpcy5fZW5hYmxlRm9jdXNUcmFwcyB8fCB0aGlzLl9hZGRlZEZvY3VzVHJhcCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9hZGRlZEZvY3VzVHJhcCA9IHRydWU7XG5cblx0XHQvLyBBZGQgYSBob3ZlciB0YWIgbG9vcCBpZiB0aGUgaG92ZXIgaGFzIGF0IGxlYXN0IG9uZSBlbGVtZW50IHdpdGggYSB2YWxpZCB0YWJJbmRleFxuXHRcdGNvbnN0IGZpcnN0Q29udGFpbmVyRm9jdXNFbGVtZW50ID0gdGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZTtcblx0XHRjb25zdCBsYXN0Q29udGFpbmVyRm9jdXNFbGVtZW50ID0gdGhpcy5maW5kTGFzdEZvY3VzYWJsZUNoaWxkKHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUpO1xuXHRcdGlmIChsYXN0Q29udGFpbmVyRm9jdXNFbGVtZW50KSB7XG5cdFx0XHRjb25zdCBiZWZvcmVDb250YWluZXJGb2N1c0VsZW1lbnQgPSBkb20ucHJlcGVuZCh0aGlzLl9ob3ZlckNvbnRhaW5lciwgJCgnZGl2JykpO1xuXHRcdFx0Y29uc3QgYWZ0ZXJDb250YWluZXJGb2N1c0VsZW1lbnQgPSBkb20uYXBwZW5kKHRoaXMuX2hvdmVyQ29udGFpbmVyLCAkKCdkaXYnKSk7XG5cdFx0XHRiZWZvcmVDb250YWluZXJGb2N1c0VsZW1lbnQudGFiSW5kZXggPSAwO1xuXHRcdFx0YWZ0ZXJDb250YWluZXJGb2N1c0VsZW1lbnQudGFiSW5kZXggPSAwO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihhZnRlckNvbnRhaW5lckZvY3VzRWxlbWVudCwgJ2ZvY3VzJywgKGUpID0+IHtcblx0XHRcdFx0Zmlyc3RDb250YWluZXJGb2N1c0VsZW1lbnQuZm9jdXMoKTtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihiZWZvcmVDb250YWluZXJGb2N1c0VsZW1lbnQsICdmb2N1cycsIChlKSA9PiB7XG5cdFx0XHRcdGxhc3RDb250YWluZXJGb2N1c0VsZW1lbnQuZm9jdXMoKTtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZmluZExhc3RGb2N1c2FibGVDaGlsZChyb290OiBOb2RlKTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdGlmIChyb290Lmhhc0NoaWxkTm9kZXMoKSkge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCByb290LmNoaWxkTm9kZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3Qgbm9kZSA9IHJvb3QuY2hpbGROb2Rlcy5pdGVtKHJvb3QuY2hpbGROb2Rlcy5sZW5ndGggLSBpIC0gMSk7XG5cdFx0XHRcdGlmIChub2RlLm5vZGVUeXBlID09PSBub2RlLkVMRU1FTlRfTk9ERSkge1xuXHRcdFx0XHRcdGNvbnN0IHBhcnNlZE5vZGUgPSBub2RlIGFzIEhUTUxFbGVtZW50O1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgcGFyc2VkTm9kZS50YWJJbmRleCA9PT0gJ251bWJlcicgJiYgcGFyc2VkTm9kZS50YWJJbmRleCA+PSAwKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcGFyc2VkTm9kZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcmVjdXJzaXZlbHlGb3VuZEVsZW1lbnQgPSB0aGlzLmZpbmRMYXN0Rm9jdXNhYmxlQ2hpbGQobm9kZSk7XG5cdFx0XHRcdGlmIChyZWN1cnNpdmVseUZvdW5kRWxlbWVudCkge1xuXHRcdFx0XHRcdHJldHVybiByZWN1cnNpdmVseUZvdW5kRWxlbWVudDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHVibGljIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX2hvdmVyQ29udGFpbmVyKTtcblx0XHRjb25zdCBob3ZlckZvY3VzZWQgPSB0aGlzLl9ob3ZlckNvbnRhaW5lci5jb250YWlucyh0aGlzLl9ob3ZlckNvbnRhaW5lci5vd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQpO1xuXHRcdGNvbnN0IGFjY2Vzc2libGVWaWV3SGludCA9IGhvdmVyRm9jdXNlZCAmJiBnZXRIb3ZlckFjY2Vzc2libGVWaWV3SGludCh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnYWNjZXNzaWJpbGl0eS52ZXJib3NpdHkuaG92ZXInKSA9PT0gdHJ1ZSAmJiB0aGlzLl9hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpLCB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKCdlZGl0b3IuYWN0aW9uLmFjY2Vzc2libGVWaWV3Jyk/LmdldEFyaWFMYWJlbCgpKTtcblx0XHRpZiAoYWNjZXNzaWJsZVZpZXdIaW50KSB7XG5cblx0XHRcdHN0YXR1cyhhY2Nlc3NpYmxlVmlld0hpbnQpO1xuXHRcdH1cblx0XHR0aGlzLmxheW91dCgpO1xuXHRcdHRoaXMuYWRkRm9jdXNUcmFwKCk7XG5cdH1cblxuXHRwdWJsaWMgbGF5b3V0KCkge1xuXHRcdC8vIENhbmNlbCBhbnkgcGVuZGluZyBtb3VzZW91dCB0aW1lcnMgc2luY2UgdGhlIGhvdmVyIGlzIGJlaW5nXG5cdFx0Ly8gcmVwb3NpdGlvbmVkIChlLmcuIGR1ZSB0byBjb250ZW50IHJlc2l6ZSBmcm9tIGNvbGxhcHNpYmxlIHNlY3Rpb25zKS5cblx0XHQvLyBUaGUgbW91c2UgbWF5IGVuZCB1cCBiYWNrIGluc2lkZSB0aGUgaG92ZXIgYWZ0ZXIgdGhlIGxheW91dC5cblx0XHR0aGlzLl9tb3VzZVRyYWNrZXI/LnN1cHByZXNzUGVuZGluZ01vdXNlT3V0KCk7XG5cdFx0aWYgKHRoaXMuX2xvY2tNb3VzZVRyYWNrZXIgIT09IHRoaXMuX21vdXNlVHJhY2tlcikge1xuXHRcdFx0dGhpcy5fbG9ja01vdXNlVHJhY2tlcj8uc3VwcHJlc3NQZW5kaW5nTW91c2VPdXQoKTtcblx0XHR9XG5cblx0XHR0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ3JpZ2h0LWFsaWduZWQnKTtcblx0XHR0aGlzLl9ob3Zlci5jb250ZW50c0RvbU5vZGUuc3R5bGUubWF4SGVpZ2h0ID0gJyc7XG5cdFx0dGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZS5zdHlsZS5tYXhXaWR0aCA9ICcnO1xuXG5cdFx0Y29uc3QgZ2V0Wm9vbUFjY291bnRlZEJvdW5kaW5nQ2xpZW50UmVjdCA9IChlOiBIVE1MRWxlbWVudCkgPT4ge1xuXHRcdFx0Y29uc3Qgem9vbSA9IGRvbS5nZXREb21Ob2RlWm9vbUxldmVsKGUpO1xuXG5cdFx0XHRjb25zdCBib3VuZGluZ1JlY3QgPSBlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dG9wOiBib3VuZGluZ1JlY3QudG9wICogem9vbSxcblx0XHRcdFx0Ym90dG9tOiBib3VuZGluZ1JlY3QuYm90dG9tICogem9vbSxcblx0XHRcdFx0cmlnaHQ6IGJvdW5kaW5nUmVjdC5yaWdodCAqIHpvb20sXG5cdFx0XHRcdGxlZnQ6IGJvdW5kaW5nUmVjdC5sZWZ0ICogem9vbSxcblx0XHRcdH07XG5cdFx0fTtcblxuXHRcdGNvbnN0IHRhcmdldEJvdW5kcyA9IHRoaXMuX3RhcmdldC50YXJnZXRFbGVtZW50cy5tYXAoZSA9PiBnZXRab29tQWNjb3VudGVkQm91bmRpbmdDbGllbnRSZWN0KGUpKTtcblx0XHRjb25zdCB7IHRvcCwgcmlnaHQsIGJvdHRvbSwgbGVmdCB9ID0gdGFyZ2V0Qm91bmRzWzBdO1xuXHRcdGNvbnN0IHdpZHRoID0gcmlnaHQgLSBsZWZ0O1xuXHRcdGNvbnN0IGhlaWdodCA9IGJvdHRvbSAtIHRvcDtcblxuXHRcdGNvbnN0IHRhcmdldFJlY3Q6IFRhcmdldFJlY3QgPSB7XG5cdFx0XHR0b3AsIHJpZ2h0LCBib3R0b20sIGxlZnQsIHdpZHRoLCBoZWlnaHQsXG5cdFx0XHRjZW50ZXI6IHtcblx0XHRcdFx0eDogbGVmdCArICh3aWR0aCAvIDIpLFxuXHRcdFx0XHR5OiB0b3AgKyAoaGVpZ2h0IC8gMilcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gVGhlc2UgY2FsbHMgYWRqdXN0IHRoZSBwb3NpdGlvbiBkZXBlbmRpbmcgb24gc3BhY2luZy5cblx0XHR0aGlzLmFkanVzdEhvcml6b250YWxIb3ZlclBvc2l0aW9uKHRhcmdldFJlY3QpO1xuXHRcdHRoaXMuYWRqdXN0VmVydGljYWxIb3ZlclBvc2l0aW9uKHRhcmdldFJlY3QpO1xuXHRcdC8vIFRoaXMgY2FsbCBsaW1pdHMgdGhlIG1heGltdW0gaGVpZ2h0IG9mIHRoZSBob3Zlci5cblx0XHR0aGlzLmFkanVzdEhvdmVyTWF4SGVpZ2h0KHRhcmdldFJlY3QpO1xuXG5cdFx0Ly8gT2Zmc2V0IHRoZSBob3ZlciBwb3NpdGlvbiBpZiB0aGVyZSBpcyBhIHBvaW50ZXIgc28gaXQgYWxpZ25zIHdpdGggdGhlIHRhcmdldCBlbGVtZW50XG5cdFx0dGhpcy5faG92ZXJDb250YWluZXIuc3R5bGUucGFkZGluZyA9ICcnO1xuXHRcdHRoaXMuX2hvdmVyQ29udGFpbmVyLnN0eWxlLm1hcmdpbiA9ICcnO1xuXHRcdGlmICh0aGlzLl9ob3ZlclBvaW50ZXIpIHtcblx0XHRcdHN3aXRjaCAodGhpcy5faG92ZXJQb3NpdGlvbikge1xuXHRcdFx0XHRjYXNlIEhvdmVyUG9zaXRpb24uUklHSFQ6XG5cdFx0XHRcdFx0dGFyZ2V0UmVjdC5sZWZ0ICs9IENvbnN0YW50cy5Qb2ludGVyU2l6ZTtcblx0XHRcdFx0XHR0YXJnZXRSZWN0LnJpZ2h0ICs9IENvbnN0YW50cy5Qb2ludGVyU2l6ZTtcblx0XHRcdFx0XHR0aGlzLl9ob3ZlckNvbnRhaW5lci5zdHlsZS5wYWRkaW5nTGVmdCA9IGAke0NvbnN0YW50cy5Qb2ludGVyU2l6ZX1weGA7XG5cdFx0XHRcdFx0dGhpcy5faG92ZXJDb250YWluZXIuc3R5bGUubWFyZ2luTGVmdCA9IGAkey1Db25zdGFudHMuUG9pbnRlclNpemV9cHhgO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEhvdmVyUG9zaXRpb24uTEVGVDpcblx0XHRcdFx0XHR0YXJnZXRSZWN0LmxlZnQgLT0gQ29uc3RhbnRzLlBvaW50ZXJTaXplO1xuXHRcdFx0XHRcdHRhcmdldFJlY3QucmlnaHQgLT0gQ29uc3RhbnRzLlBvaW50ZXJTaXplO1xuXHRcdFx0XHRcdHRoaXMuX2hvdmVyQ29udGFpbmVyLnN0eWxlLnBhZGRpbmdSaWdodCA9IGAke0NvbnN0YW50cy5Qb2ludGVyU2l6ZX1weGA7XG5cdFx0XHRcdFx0dGhpcy5faG92ZXJDb250YWluZXIuc3R5bGUubWFyZ2luUmlnaHQgPSBgJHstQ29uc3RhbnRzLlBvaW50ZXJTaXplfXB4YDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBIb3ZlclBvc2l0aW9uLkJFTE9XOlxuXHRcdFx0XHRcdHRhcmdldFJlY3QudG9wICs9IENvbnN0YW50cy5Qb2ludGVyU2l6ZTtcblx0XHRcdFx0XHR0YXJnZXRSZWN0LmJvdHRvbSArPSBDb25zdGFudHMuUG9pbnRlclNpemU7XG5cdFx0XHRcdFx0dGhpcy5faG92ZXJDb250YWluZXIuc3R5bGUucGFkZGluZ1RvcCA9IGAke0NvbnN0YW50cy5Qb2ludGVyU2l6ZX1weGA7XG5cdFx0XHRcdFx0dGhpcy5faG92ZXJDb250YWluZXIuc3R5bGUubWFyZ2luVG9wID0gYCR7LUNvbnN0YW50cy5Qb2ludGVyU2l6ZX1weGA7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgSG92ZXJQb3NpdGlvbi5BQk9WRTpcblx0XHRcdFx0XHR0YXJnZXRSZWN0LnRvcCAtPSBDb25zdGFudHMuUG9pbnRlclNpemU7XG5cdFx0XHRcdFx0dGFyZ2V0UmVjdC5ib3R0b20gLT0gQ29uc3RhbnRzLlBvaW50ZXJTaXplO1xuXHRcdFx0XHRcdHRoaXMuX2hvdmVyQ29udGFpbmVyLnN0eWxlLnBhZGRpbmdCb3R0b20gPSBgJHtDb25zdGFudHMuUG9pbnRlclNpemV9cHhgO1xuXHRcdFx0XHRcdHRoaXMuX2hvdmVyQ29udGFpbmVyLnN0eWxlLm1hcmdpbkJvdHRvbSA9IGAkey1Db25zdGFudHMuUG9pbnRlclNpemV9cHhgO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHR0YXJnZXRSZWN0LmNlbnRlci54ID0gdGFyZ2V0UmVjdC5sZWZ0ICsgKHdpZHRoIC8gMik7XG5cdFx0XHR0YXJnZXRSZWN0LmNlbnRlci55ID0gdGFyZ2V0UmVjdC50b3AgKyAoaGVpZ2h0IC8gMik7XG5cdFx0fVxuXG5cdFx0dGhpcy5jb21wdXRlWENvcmRpbmF0ZSh0YXJnZXRSZWN0KTtcblx0XHR0aGlzLmNvbXB1dGVZQ29yZGluYXRlKHRhcmdldFJlY3QpO1xuXG5cdFx0aWYgKHRoaXMuX2hvdmVyUG9pbnRlcikge1xuXHRcdFx0Ly8gcmVzZXRcblx0XHRcdHRoaXMuX2hvdmVyUG9pbnRlci5jbGFzc0xpc3QucmVtb3ZlKCd0b3AnKTtcblx0XHRcdHRoaXMuX2hvdmVyUG9pbnRlci5jbGFzc0xpc3QucmVtb3ZlKCdsZWZ0Jyk7XG5cdFx0XHR0aGlzLl9ob3ZlclBvaW50ZXIuY2xhc3NMaXN0LnJlbW92ZSgncmlnaHQnKTtcblx0XHRcdHRoaXMuX2hvdmVyUG9pbnRlci5jbGFzc0xpc3QucmVtb3ZlKCdib3R0b20nKTtcblxuXHRcdFx0dGhpcy5zZXRIb3ZlclBvaW50ZXJQb3NpdGlvbih0YXJnZXRSZWN0KTtcblx0XHR9XG5cdFx0dGhpcy5faG92ZXIub25Db250ZW50c0NoYW5nZWQoKTtcblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZVhDb3JkaW5hdGUodGFyZ2V0OiBUYXJnZXRSZWN0KTogdm9pZCB7XG5cdFx0Y29uc3QgaG92ZXJXaWR0aCA9IHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUuY2xpZW50V2lkdGggKyBDb25zdGFudHMuSG92ZXJCb3JkZXJXaWR0aDtcblxuXHRcdGlmICh0aGlzLl90YXJnZXQueCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl94ID0gdGhpcy5fdGFyZ2V0Lng7XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAodGhpcy5faG92ZXJQb3NpdGlvbiA9PT0gSG92ZXJQb3NpdGlvbi5SSUdIVCkge1xuXHRcdFx0dGhpcy5feCA9IHRhcmdldC5yaWdodDtcblx0XHR9XG5cblx0XHRlbHNlIGlmICh0aGlzLl9ob3ZlclBvc2l0aW9uID09PSBIb3ZlclBvc2l0aW9uLkxFRlQpIHtcblx0XHRcdHRoaXMuX3ggPSB0YXJnZXQubGVmdCAtIGhvdmVyV2lkdGg7XG5cdFx0fVxuXG5cdFx0ZWxzZSB7XG5cdFx0XHRpZiAodGhpcy5fYW5jaG9yQWxpZ25tZW50ID09PSBBbmNob3JBbGlnbm1lbnQuUklHSFQpIHtcblx0XHRcdFx0dGhpcy5feCA9IHRhcmdldC5yaWdodCAtIGhvdmVyV2lkdGg7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuX2hvdmVyUG9pbnRlcikge1xuXHRcdFx0XHR0aGlzLl94ID0gdGFyZ2V0LmNlbnRlci54IC0gKHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUuY2xpZW50V2lkdGggLyAyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3ggPSB0YXJnZXQubGVmdDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSG92ZXIgaXMgZ29pbmcgYmV5b25kIHdpbmRvdyB0b3dhcmRzIHJpZ2h0IGVuZFxuXHRcdFx0aWYgKHRoaXMuX3ggKyBob3ZlcldpZHRoID49IHRoaXMuX3RhcmdldERvY3VtZW50RWxlbWVudC5jbGllbnRXaWR0aCkge1xuXHRcdFx0XHR0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ3JpZ2h0LWFsaWduZWQnKTtcblx0XHRcdFx0dGhpcy5feCA9IE1hdGgubWF4KHRoaXMuX3RhcmdldERvY3VtZW50RWxlbWVudC5jbGllbnRXaWR0aCAtIGhvdmVyV2lkdGggLSBDb25zdGFudHMuSG92ZXJXaW5kb3dFZGdlTWFyZ2luLCB0aGlzLl90YXJnZXREb2N1bWVudEVsZW1lbnQuY2xpZW50TGVmdCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSG92ZXIgaXMgZ29pbmcgYmV5b25kIHdpbmRvdyB0b3dhcmRzIGxlZnQgZW5kXG5cdFx0aWYgKHRoaXMuX3ggPCB0aGlzLl90YXJnZXREb2N1bWVudEVsZW1lbnQuY2xpZW50TGVmdCkge1xuXHRcdFx0dGhpcy5feCA9IHRhcmdldC5sZWZ0ICsgQ29uc3RhbnRzLkhvdmVyV2luZG93RWRnZU1hcmdpbjtcblx0XHR9XG5cblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZVlDb3JkaW5hdGUodGFyZ2V0OiBUYXJnZXRSZWN0KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3RhcmdldC55ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3kgPSB0aGlzLl90YXJnZXQueTtcblx0XHR9XG5cblx0XHRlbHNlIGlmICh0aGlzLl9ob3ZlclBvc2l0aW9uID09PSBIb3ZlclBvc2l0aW9uLkFCT1ZFKSB7XG5cdFx0XHR0aGlzLl95ID0gdGFyZ2V0LnRvcDtcblx0XHR9XG5cblx0XHRlbHNlIGlmICh0aGlzLl9ob3ZlclBvc2l0aW9uID09PSBIb3ZlclBvc2l0aW9uLkJFTE9XKSB7XG5cdFx0XHR0aGlzLl95ID0gdGFyZ2V0LmJvdHRvbSAtIDI7XG5cdFx0fVxuXG5cdFx0ZWxzZSB7XG5cdFx0XHRpZiAodGhpcy5faG92ZXJQb2ludGVyKSB7XG5cdFx0XHRcdHRoaXMuX3kgPSB0YXJnZXQuY2VudGVyLnkgKyAodGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZS5jbGllbnRIZWlnaHQgLyAyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3kgPSB0YXJnZXQuYm90dG9tO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEhvdmVyIG9uIGJvdHRvbSBpcyBnb2luZyBiZXlvbmQgd2luZG93XG5cdFx0aWYgKHRoaXMuX3kgPiB0aGlzLl90YXJnZXRXaW5kb3cuaW5uZXJIZWlnaHQpIHtcblx0XHRcdHRoaXMuX3kgPSB0YXJnZXQuYm90dG9tO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYWRqdXN0SG9yaXpvbnRhbEhvdmVyUG9zaXRpb24odGFyZ2V0OiBUYXJnZXRSZWN0KTogdm9pZCB7XG5cdFx0Ly8gRG8gbm90IGFkanVzdCBob3Jpem9udGFsIGhvdmVyIHBvc2l0aW9uIGlmIHggY29yZGlhbnRlIGlzIHByb3ZpZGVkXG5cdFx0aWYgKHRoaXMuX3RhcmdldC54ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fYW5jaG9yQWxpZ25tZW50ID09PSBBbmNob3JBbGlnbm1lbnQuUklHSFQgJiYgKHRoaXMuX2hvdmVyUG9zaXRpb24gPT09IEhvdmVyUG9zaXRpb24uQUJPVkUgfHwgdGhpcy5faG92ZXJQb3NpdGlvbiA9PT0gSG92ZXJQb3NpdGlvbi5CRUxPVykpIHtcblx0XHRcdGNvbnN0IGF2YWlsYWJsZVdpZHRoID0gdGFyZ2V0LnJpZ2h0IC0gdGhpcy5fdGFyZ2V0RG9jdW1lbnRFbGVtZW50LmNsaWVudExlZnQgLSBDb25zdGFudHMuSG92ZXJXaW5kb3dFZGdlTWFyZ2luIC0gQ29uc3RhbnRzLkhvdmVyQm9yZGVyV2lkdGg7XG5cdFx0XHRpZiAodGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZS5jbGllbnRXaWR0aCA+IGF2YWlsYWJsZVdpZHRoKSB7XG5cdFx0XHRcdHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUuc3R5bGUubWF4V2lkdGggPSBgJHtNYXRoLm1heChhdmFpbGFibGVXaWR0aCwgMCl9cHhgO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhvdmVyUG9pbnRlck9mZnNldCA9ICh0aGlzLl9ob3ZlclBvaW50ZXIgPyBDb25zdGFudHMuUG9pbnRlclNpemUgOiAwKTtcblxuXHRcdC8vIFdoZW4gZm9yY2UgcG9zaXRpb24gaXMgZW5hYmxlZCwgcmVzdHJpY3QgbWF4IHdpZHRoXG5cdFx0aWYgKHRoaXMuX2ZvcmNlUG9zaXRpb24pIHtcblx0XHRcdGNvbnN0IHBhZGRpbmcgPSBob3ZlclBvaW50ZXJPZmZzZXQgKyBDb25zdGFudHMuSG92ZXJCb3JkZXJXaWR0aDtcblx0XHRcdGlmICh0aGlzLl9ob3ZlclBvc2l0aW9uID09PSBIb3ZlclBvc2l0aW9uLlJJR0hUKSB7XG5cdFx0XHRcdHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUuc3R5bGUubWF4V2lkdGggPSBgJHt0aGlzLl90YXJnZXREb2N1bWVudEVsZW1lbnQuY2xpZW50V2lkdGggLSB0YXJnZXQucmlnaHQgLSBwYWRkaW5nfXB4YDtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5faG92ZXJQb3NpdGlvbiA9PT0gSG92ZXJQb3NpdGlvbi5MRUZUKSB7XG5cdFx0XHRcdHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUuc3R5bGUubWF4V2lkdGggPSBgJHt0YXJnZXQubGVmdCAtIHBhZGRpbmd9cHhgO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFBvc2l0aW9uIGhvdmVyIG9uIHJpZ2h0IHRvIHRhcmdldFxuXHRcdGlmICh0aGlzLl9ob3ZlclBvc2l0aW9uID09PSBIb3ZlclBvc2l0aW9uLlJJR0hUKSB7XG5cdFx0XHRjb25zdCByb29tT25SaWdodCA9IHRoaXMuX3RhcmdldERvY3VtZW50RWxlbWVudC5jbGllbnRXaWR0aCAtIHRhcmdldC5yaWdodDtcblx0XHRcdC8vIEhvdmVyIG9uIHRoZSByaWdodCBpcyBnb2luZyBiZXlvbmQgd2luZG93LlxuXHRcdFx0aWYgKHJvb21PblJpZ2h0IDwgdGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZS5jbGllbnRXaWR0aCArIGhvdmVyUG9pbnRlck9mZnNldCkge1xuXHRcdFx0XHRjb25zdCByb29tT25MZWZ0ID0gdGFyZ2V0LmxlZnQ7XG5cdFx0XHRcdC8vIFRoZXJlJ3MgZW5vdWdoIHJvb20gb24gdGhlIGxlZnQsIGZsaXAgdGhlIGhvdmVyIHBvc2l0aW9uXG5cdFx0XHRcdGlmIChyb29tT25MZWZ0ID49IHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUuY2xpZW50V2lkdGggKyBob3ZlclBvaW50ZXJPZmZzZXQpIHtcblx0XHRcdFx0XHR0aGlzLl9ob3ZlclBvc2l0aW9uID0gSG92ZXJQb3NpdGlvbi5MRUZUO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEhvdmVyIG9uIHRoZSBsZWZ0IHdvdWxkIGdvIGJleW9uZCB3aW5kb3cgdG9vXG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2hvdmVyUG9zaXRpb24gPSBIb3ZlclBvc2l0aW9uLkJFTE9XO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIFBvc2l0aW9uIGhvdmVyIG9uIGxlZnQgdG8gdGFyZ2V0XG5cdFx0ZWxzZSBpZiAodGhpcy5faG92ZXJQb3NpdGlvbiA9PT0gSG92ZXJQb3NpdGlvbi5MRUZUKSB7XG5cblx0XHRcdGNvbnN0IHJvb21PbkxlZnQgPSB0YXJnZXQubGVmdDtcblx0XHRcdC8vIEhvdmVyIG9uIHRoZSBsZWZ0IGlzIGdvaW5nIGJleW9uZCB3aW5kb3cuXG5cdFx0XHRpZiAocm9vbU9uTGVmdCA8IHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUuY2xpZW50V2lkdGggKyBob3ZlclBvaW50ZXJPZmZzZXQpIHtcblx0XHRcdFx0Y29uc3Qgcm9vbU9uUmlnaHQgPSB0aGlzLl90YXJnZXREb2N1bWVudEVsZW1lbnQuY2xpZW50V2lkdGggLSB0YXJnZXQucmlnaHQ7XG5cdFx0XHRcdC8vIFRoZXJlJ3MgZW5vdWdoIHJvb20gb24gdGhlIHJpZ2h0LCBmbGlwIHRoZSBob3ZlciBwb3NpdGlvblxuXHRcdFx0XHRpZiAocm9vbU9uUmlnaHQgPj0gdGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZS5jbGllbnRXaWR0aCArIGhvdmVyUG9pbnRlck9mZnNldCkge1xuXHRcdFx0XHRcdHRoaXMuX2hvdmVyUG9zaXRpb24gPSBIb3ZlclBvc2l0aW9uLlJJR0hUO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEhvdmVyIG9uIHRoZSByaWdodCB3b3VsZCBnbyBiZXlvbmQgd2luZG93IHRvb1xuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9ob3ZlclBvc2l0aW9uID0gSG92ZXJQb3NpdGlvbi5CRUxPVztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gSG92ZXIgb24gdGhlIGxlZnQgaXMgZ29pbmcgYmV5b25kIHdpbmRvdy5cblx0XHRcdGlmICh0YXJnZXQubGVmdCAtIHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUuY2xpZW50V2lkdGggLSBob3ZlclBvaW50ZXJPZmZzZXQgPD0gdGhpcy5fdGFyZ2V0RG9jdW1lbnRFbGVtZW50LmNsaWVudExlZnQpIHtcblx0XHRcdFx0dGhpcy5faG92ZXJQb3NpdGlvbiA9IEhvdmVyUG9zaXRpb24uUklHSFQ7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhZGp1c3RWZXJ0aWNhbEhvdmVyUG9zaXRpb24odGFyZ2V0OiBUYXJnZXRSZWN0KTogdm9pZCB7XG5cdFx0Ly8gRG8gbm90IGFkanVzdCB2ZXJ0aWNhbCBob3ZlciBwb3NpdGlvbiBpZiB0aGUgeSBjb29yZGluYXRlIGlzIHByb3ZpZGVkXG5cdFx0Ly8gb3IgdGhlIHBvc2l0aW9uIGlzIGZvcmNlZFxuXHRcdGlmICh0aGlzLl90YXJnZXQueSAhPT0gdW5kZWZpbmVkIHx8IHRoaXMuX2ZvcmNlUG9zaXRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBob3ZlclBvaW50ZXJPZmZzZXQgPSAodGhpcy5faG92ZXJQb2ludGVyID8gQ29uc3RhbnRzLlBvaW50ZXJTaXplIDogMCk7XG5cblx0XHQvLyBQb3NpdGlvbiBob3ZlciBvbiB0b3Agb2YgdGhlIHRhcmdldFxuXHRcdGlmICh0aGlzLl9ob3ZlclBvc2l0aW9uID09PSBIb3ZlclBvc2l0aW9uLkFCT1ZFKSB7XG5cdFx0XHQvLyBIb3ZlciBvbiB0b3AgaXMgZ29pbmcgYmV5b25kIHdpbmRvd1xuXHRcdFx0aWYgKHRhcmdldC50b3AgLSB0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlLmNsaWVudEhlaWdodCAtIGhvdmVyUG9pbnRlck9mZnNldCA8IDApIHtcblx0XHRcdFx0dGhpcy5faG92ZXJQb3NpdGlvbiA9IEhvdmVyUG9zaXRpb24uQkVMT1c7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUG9zaXRpb24gaG92ZXIgYmVsb3cgdGhlIHRhcmdldFxuXHRcdGVsc2UgaWYgKHRoaXMuX2hvdmVyUG9zaXRpb24gPT09IEhvdmVyUG9zaXRpb24uQkVMT1cpIHtcblx0XHRcdC8vIEhvdmVyIG9uIGJvdHRvbSBpcyBnb2luZyBiZXlvbmQgd2luZG93XG5cdFx0XHRpZiAodGFyZ2V0LmJvdHRvbSArIHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUub2Zmc2V0SGVpZ2h0ICsgaG92ZXJQb2ludGVyT2Zmc2V0ID4gdGhpcy5fdGFyZ2V0V2luZG93LmlubmVySGVpZ2h0KSB7XG5cdFx0XHRcdHRoaXMuX2hvdmVyUG9zaXRpb24gPSBIb3ZlclBvc2l0aW9uLkFCT1ZFO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYWRqdXN0SG92ZXJNYXhIZWlnaHQodGFyZ2V0OiBUYXJnZXRSZWN0KTogdm9pZCB7XG5cdFx0bGV0IG1heEhlaWdodCA9IHRoaXMuX3RhcmdldFdpbmRvdy5pbm5lckhlaWdodCAqIHRoaXMuX21heEhlaWdodFJhdGlvUmVsYXRpdmVUb1dpbmRvdztcblxuXHRcdC8vIFdoZW4gZm9yY2UgcG9zaXRpb24gaXMgZW5hYmxlZCwgcmVzdHJpY3QgbWF4IGhlaWdodFxuXHRcdGlmICh0aGlzLl9mb3JjZVBvc2l0aW9uKSB7XG5cdFx0XHRjb25zdCBwYWRkaW5nID0gKHRoaXMuX2hvdmVyUG9pbnRlciA/IENvbnN0YW50cy5Qb2ludGVyU2l6ZSA6IDApICsgQ29uc3RhbnRzLkhvdmVyQm9yZGVyV2lkdGg7XG5cdFx0XHRpZiAodGhpcy5faG92ZXJQb3NpdGlvbiA9PT0gSG92ZXJQb3NpdGlvbi5BQk9WRSkge1xuXHRcdFx0XHRtYXhIZWlnaHQgPSBNYXRoLm1pbihtYXhIZWlnaHQsIHRhcmdldC50b3AgLSBwYWRkaW5nKTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5faG92ZXJQb3NpdGlvbiA9PT0gSG92ZXJQb3NpdGlvbi5CRUxPVykge1xuXHRcdFx0XHRtYXhIZWlnaHQgPSBNYXRoLm1pbihtYXhIZWlnaHQsIHRoaXMuX3RhcmdldFdpbmRvdy5pbm5lckhlaWdodCAtIHRhcmdldC5ib3R0b20gLSBwYWRkaW5nKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlLnN0eWxlLm1heEhlaWdodCA9IGAke21heEhlaWdodH1weGA7XG5cdFx0aWYgKHRoaXMuX2hvdmVyLmNvbnRlbnRzRG9tTm9kZS5jbGllbnRIZWlnaHQgPCB0aGlzLl9ob3Zlci5jb250ZW50c0RvbU5vZGUuc2Nyb2xsSGVpZ2h0KSB7XG5cdFx0XHQvLyBBZGQgcGFkZGluZyBmb3IgYSB2ZXJ0aWNhbCBzY3JvbGxiYXJcblx0XHRcdGNvbnN0IGV4dHJhUmlnaHRQYWRkaW5nID0gYCR7dGhpcy5faG92ZXIuc2Nyb2xsYmFyLm9wdGlvbnMudmVydGljYWxTY3JvbGxiYXJTaXplfXB4YDtcblx0XHRcdGlmICh0aGlzLl9ob3Zlci5jb250ZW50c0RvbU5vZGUuc3R5bGUucGFkZGluZ1JpZ2h0ICE9PSBleHRyYVJpZ2h0UGFkZGluZykge1xuXHRcdFx0XHR0aGlzLl9ob3Zlci5jb250ZW50c0RvbU5vZGUuc3R5bGUucGFkZGluZ1JpZ2h0ID0gZXh0cmFSaWdodFBhZGRpbmc7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXRIb3ZlclBvaW50ZXJQb3NpdGlvbih0YXJnZXQ6IFRhcmdldFJlY3QpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2hvdmVyUG9pbnRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAodGhpcy5faG92ZXJQb3NpdGlvbikge1xuXHRcdFx0Y2FzZSBIb3ZlclBvc2l0aW9uLkxFRlQ6XG5cdFx0XHRjYXNlIEhvdmVyUG9zaXRpb24uUklHSFQ6IHtcblx0XHRcdFx0dGhpcy5faG92ZXJQb2ludGVyLmNsYXNzTGlzdC5hZGQodGhpcy5faG92ZXJQb3NpdGlvbiA9PT0gSG92ZXJQb3NpdGlvbi5MRUZUID8gJ3JpZ2h0JyA6ICdsZWZ0Jyk7XG5cdFx0XHRcdGNvbnN0IGhvdmVySGVpZ2h0ID0gdGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZS5jbGllbnRIZWlnaHQ7XG5cblx0XHRcdFx0Ly8gSWYgaG92ZXIgaXMgdGFsbGVyIHRoYW4gdGFyZ2V0LCB0aGVuIHNob3cgdGhlIHBvaW50ZXIgYXQgdGhlIGNlbnRlciBvZiB0YXJnZXRcblx0XHRcdFx0aWYgKGhvdmVySGVpZ2h0ID4gdGFyZ2V0LmhlaWdodCkge1xuXHRcdFx0XHRcdHRoaXMuX2hvdmVyUG9pbnRlci5zdHlsZS50b3AgPSBgJHt0YXJnZXQuY2VudGVyLnkgLSAodGhpcy5feSAtIGhvdmVySGVpZ2h0KSAtIENvbnN0YW50cy5Qb2ludGVyU2l6ZX1weGA7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBPdGhlcndpc2Ugc2hvdyB0aGUgcG9pbnRlciBhdCB0aGUgY2VudGVyIG9mIGhvdmVyXG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2hvdmVyUG9pbnRlci5zdHlsZS50b3AgPSBgJHtNYXRoLnJvdW5kKChob3ZlckhlaWdodCAvIDIpKSAtIENvbnN0YW50cy5Qb2ludGVyU2l6ZX1weGA7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgSG92ZXJQb3NpdGlvbi5BQk9WRTpcblx0XHRcdGNhc2UgSG92ZXJQb3NpdGlvbi5CRUxPVzoge1xuXHRcdFx0XHR0aGlzLl9ob3ZlclBvaW50ZXIuY2xhc3NMaXN0LmFkZCh0aGlzLl9ob3ZlclBvc2l0aW9uID09PSBIb3ZlclBvc2l0aW9uLkFCT1ZFID8gJ2JvdHRvbScgOiAndG9wJyk7XG5cdFx0XHRcdGNvbnN0IGhvdmVyV2lkdGggPSB0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlLmNsaWVudFdpZHRoO1xuXG5cdFx0XHRcdC8vIFBvc2l0aW9uIHBvaW50ZXIgYXQgdGhlIGNlbnRlciBvZiB0aGUgaG92ZXJcblx0XHRcdFx0bGV0IHBvaW50ZXJMZWZ0UG9zaXRpb24gPSBNYXRoLnJvdW5kKChob3ZlcldpZHRoIC8gMikpIC0gQ29uc3RhbnRzLlBvaW50ZXJTaXplO1xuXG5cdFx0XHRcdC8vIElmIHBvaW50ZXIgZ29lcyBiZXlvbmQgdGFyZ2V0IHRoZW4gcG9zaXRpb24gaXQgYXQgdGhlIGNlbnRlciBvZiB0aGUgdGFyZ2V0XG5cdFx0XHRcdGNvbnN0IHBvaW50ZXJYID0gdGhpcy5feCArIHBvaW50ZXJMZWZ0UG9zaXRpb247XG5cdFx0XHRcdGlmIChwb2ludGVyWCA8IHRhcmdldC5sZWZ0IHx8IHBvaW50ZXJYID4gdGFyZ2V0LnJpZ2h0KSB7XG5cdFx0XHRcdFx0cG9pbnRlckxlZnRQb3NpdGlvbiA9IHRhcmdldC5jZW50ZXIueCAtIHRoaXMuX3ggLSBDb25zdGFudHMuUG9pbnRlclNpemU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9ob3ZlclBvaW50ZXIuc3R5bGUubGVmdCA9IGAke3BvaW50ZXJMZWZ0UG9zaXRpb259cHhgO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZm9jdXMoKSB7XG5cdFx0dGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZS5mb2N1cygpO1xuXHR9XG5cblx0cHVibGljIGhpZGUoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdHRoaXMuX29uRGlzcG9zZS5maXJlKCk7XG5cdFx0XHR0aGlzLl90YXJnZXQuZGlzcG9zZT8uKCk7XG5cdFx0XHR0aGlzLl9ob3ZlckNvbnRhaW5lci5yZW1vdmUoKTtcblx0XHRcdHRoaXMuX21lc3NhZ2VMaXN0ZW5lcnMuZGlzcG9zZSgpO1xuXHRcdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0fVxufVxuXG5jbGFzcyBDb21wb3NpdGVNb3VzZVRyYWNrZXIgZXh0ZW5kcyBXaWRnZXQge1xuXHRwcml2YXRlIF9pc01vdXNlSW46IGJvb2xlYW4gPSB0cnVlO1xuXHRwcml2YXRlIF9zdXBwcmVzc05leHRNb3VzZU91dDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb3VzZVRpbWVyOiBNdXRhYmxlRGlzcG9zYWJsZTxUaW1lb3V0VGltZXI+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTW91c2VPdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0Z2V0IG9uTW91c2VPdXQoKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gdGhpcy5fb25Nb3VzZU91dC5ldmVudDsgfVxuXG5cdGdldCBpc01vdXNlSW4oKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9pc01vdXNlSW47IH1cblxuXHQvKipcblx0ICogQHBhcmFtIF9lbGVtZW50cyBUaGUgdGFyZ2V0IGVsZW1lbnRzIHRvIHRyYWNrIG1vdXNlIGluL291dCBldmVudHMgb24uXG5cdCAqIEBwYXJhbSBfZXZlbnREZWJvdW5jZURlbGF5IFRoZSBkZWxheSBpbiBtcyB0byBkZWJvdW5jZSB0aGUgZXZlbnQgZmlyaW5nLiBUaGlzIGlzIHVzZWQgdG9cblx0ICogYWxsb3cgYSBzaG9ydCBwZXJpb2QgZm9yIHRoZSBtb3VzZSB0byBtb3ZlIGludG8gdGhlIGhvdmVyIG9yIGEgbmVhcmJ5IHRhcmdldCBlbGVtZW50LiBGb3Jcblx0ICogZXhhbXBsZSBob3ZlcmluZyBhIHNjcm9sbCBiYXIgd2lsbCBub3QgaGlkZSB0aGUgaG92ZXIgaW1tZWRpYXRlbHkuXG5cdCAqL1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIF9lbGVtZW50czogSFRNTEVsZW1lbnRbXSxcblx0XHRwcml2YXRlIF9ldmVudERlYm91bmNlRGVsYXk6IG51bWJlciA9IDIwMFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIHRoaXMuX2VsZW1lbnRzKSB7XG5cdFx0XHR0aGlzLm9ubW91c2VvdmVyKGVsZW1lbnQsICgpID0+IHRoaXMuX29uVGFyZ2V0TW91c2VPdmVyKCkpO1xuXHRcdFx0dGhpcy5vbm1vdXNlbGVhdmUoZWxlbWVudCwgKCkgPT4gdGhpcy5fb25UYXJnZXRNb3VzZUxlYXZlKCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX29uVGFyZ2V0TW91c2VPdmVyKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzTW91c2VJbiA9IHRydWU7XG5cdFx0dGhpcy5fc3VwcHJlc3NOZXh0TW91c2VPdXQgPSBmYWxzZTtcblx0XHR0aGlzLl9tb3VzZVRpbWVyLmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIF9vblRhcmdldE1vdXNlTGVhdmUoKTogdm9pZCB7XG5cdFx0dGhpcy5faXNNb3VzZUluID0gZmFsc2U7XG5cdFx0Ly8gRXZhbHVhdGUgd2hldGhlciB0aGUgbW91c2UgaXMgc3RpbGwgb3V0c2lkZSBhc3luY2hyb25vdXNseSBzdWNoIHRoYXQgb3RoZXIgbW91c2UgdGFyZ2V0c1xuXHRcdC8vIGhhdmUgdGhlIG9wcG9ydHVuaXR5IHRvIGZpcnN0IHRoZWlyIG1vdXNlIGluIGV2ZW50LlxuXHRcdHRoaXMuX21vdXNlVGltZXIudmFsdWUgPSBuZXcgVGltZW91dFRpbWVyKCgpID0+IHRoaXMuX2ZpcmVJZk1vdXNlT3V0c2lkZSgpLCB0aGlzLl9ldmVudERlYm91bmNlRGVsYXkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmlyZUlmTW91c2VPdXRzaWRlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faXNNb3VzZUluICYmICF0aGlzLl9zdXBwcmVzc05leHRNb3VzZU91dCkge1xuXHRcdFx0dGhpcy5fb25Nb3VzZU91dC5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFN1cHByZXNzZXMgdGhlIG5leHQgcGVuZGluZyBtb3VzZW91dCBkaXNtaXNzYWwuIENhbGwgdGhpcyB3aGVuIHRyYWNrZWRcblx0ICogZWxlbWVudHMgYXJlIGJlaW5nIHJlc2l6ZWQgb3IgcmVwb3NpdGlvbmVkIHRvIGF2b2lkIHNwdXJpb3VzIGRpc21pc3NhbHNcblx0ICogY2F1c2VkIGJ5IHRoZSBlbGVtZW50IHNocmlua2luZyBhd2F5IGZyb20gdGhlIGN1cnNvci4gVGhlIHN1cHByZXNzaW9uXG5cdCAqIGlzIGNsZWFyZWQgd2hlbiB0aGUgbW91c2UgbmV4dCBlbnRlcnMgYSB0cmFja2VkIGVsZW1lbnQuXG5cdCAqL1xuXHRzdXBwcmVzc1BlbmRpbmdNb3VzZU91dCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzTW91c2VJbikge1xuXHRcdFx0dGhpcy5fc3VwcHJlc3NOZXh0TW91c2VPdXQgPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBBZGRzIGFuIGVsZW1lbnQgdG8gYmUgdHJhY2tlZCBieSB0aGlzIG1vdXNlIHRyYWNrZXIuIE1vdXNlIGV2ZW50cyBvbiB0aGlzXG5cdCAqIGVsZW1lbnQgd2lsbCBiZSBjb25zaWRlcmVkIGFzIGJlaW5nIFwiaW5zaWRlXCIgdGhlIHRyYWNrZWQgYXJlYS5cblx0ICovXG5cdGFkZEVsZW1lbnQoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0aWYgKHRoaXMuX2VsZW1lbnRzLmluY2x1ZGVzKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHRcdH1cblx0XHR0aGlzLl9lbGVtZW50cy5wdXNoKGVsZW1lbnQpO1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsIGRvbS5FdmVudFR5cGUuTU9VU0VfT1ZFUiwgKCkgPT4gdGhpcy5fb25UYXJnZXRNb3VzZU92ZXIoKSkpO1xuXHRcdHN0b3JlLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsIGRvbS5FdmVudFR5cGUuTU9VU0VfTEVBVkUsICgpID0+IHRoaXMuX29uVGFyZ2V0TW91c2VMZWF2ZSgpKSk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuX2VsZW1lbnRzLmluZGV4T2YoZWxlbWVudCk7XG5cdFx0XHRpZiAoaW5kZXggPj0gMCkge1xuXHRcdFx0XHR0aGlzLl9lbGVtZW50cy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRyZXR1cm4gc3RvcmU7XG5cdH1cbn1cblxuY2xhc3MgRWxlbWVudEhvdmVyVGFyZ2V0IGltcGxlbWVudHMgSUhvdmVyVGFyZ2V0IHtcblx0cmVhZG9ubHkgdGFyZ2V0RWxlbWVudHM6IHJlYWRvbmx5IEhUTUxFbGVtZW50W107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfZWxlbWVudDogSFRNTEVsZW1lbnRcblx0KSB7XG5cdFx0dGhpcy50YXJnZXRFbGVtZW50cyA9IFt0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b0IsQ0FBQztBQUFBLElBQzVEO0FBQUEsRUFDRDtBQUFBLEVBcEJBLElBQUksYUFBMEI7QUFBRSxXQUFPLEtBQUssWUFBWTtBQUFBLEVBQU87QUFBQSxFQUUvRCxJQUFJLFlBQXFCO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBWTtBQUFBLEVBb0IzQyxxQkFBMkI7QUFDbEMsU0FBSyxhQUFhO0FBQ2xCLFNBQUssd0JBQXdCO0FBQzdCLFNBQUssWUFBWSxNQUFNO0FBQUEsRUFDeEI7QUFBQSxFQUVRLHNCQUE0QjtBQUNuQyxTQUFLLGFBQWE7QUFHbEIsU0FBSyxZQUFZLFFBQVEsSUFBSSxhQUFhLE1BQU0sS0FBSyxvQkFBb0IsR0FBRyxLQUFLLG1CQUFtQjtBQUFBLEVBQ3JHO0FBQUEsRUFFUSxzQkFBNEI7QUFDbkMsUUFBSSxDQUFDLEtBQUssY0FBYyxDQUFDLEtBQUssdUJBQXVCO0FBQ3BELFdBQUssWUFBWSxLQUFLO0FBQUEsSUFDdkI7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRQSwwQkFBZ0M7QUFDL0IsUUFBSSxDQUFDLEtBQUssWUFBWTtBQUNyQixXQUFLLHdCQUF3QjtBQUFBLElBQzlCO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNQSxXQUFXLFNBQW1DO0FBQzdDLFFBQUksS0FBSyxVQUFVLFNBQVMsT0FBTyxHQUFHO0FBQ3JDLGFBQU8sV0FBVztBQUFBLElBQ25CO0FBQ0EsU0FBSyxVQUFVLEtBQUssT0FBTztBQUMzQixVQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsVUFBTSxJQUFJLElBQUksc0JBQXNCLFNBQVMsSUFBSSxVQUFVLFlBQVksTUFBTSxLQUFLLG1CQUFtQixDQUFDLENBQUM7QUFDdkcsVUFBTSxJQUFJLElBQUksc0JBQXNCLFNBQVMsSUFBSSxVQUFVLGFBQWEsTUFBTSxLQUFLLG9CQUFvQixDQUFDLENBQUM7QUFDekcsVUFBTSxJQUFJLGFBQWEsTUFBTTtBQUM1QixZQUFNLFFBQVEsS0FBSyxVQUFVLFFBQVEsT0FBTztBQUM1QyxVQUFJLFNBQVMsR0FBRztBQUNmLGFBQUssVUFBVSxPQUFPLE9BQU8sQ0FBQztBQUFBLE1BQy9CO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixXQUFPO0FBQUEsRUFDUjtBQUNEO0FBRUEsTUFBTSxtQkFBMkM7QUFBQSxFQUdoRCxZQUNTLFVBQ1A7QUFETztBQUVSLFNBQUssaUJBQWlCLENBQUMsS0FBSyxRQUFRO0FBQUEsRUFDckM7QUFBQSxFQUVBLFVBQWdCO0FBQUEsRUFDaEI7QUFDRDsiLAogICJuYW1lcyI6IFsiQ29uc3RhbnRzIl0KfQo=
