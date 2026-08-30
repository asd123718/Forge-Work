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
import { $, addDisposableListener, append, EventHelper, getWindow, isHTMLElement } from "../../dom.js";
import { createStyleSheet } from "../../domStylesheets.js";
import { DomEmitter } from "../../event.js";
import { EventType, Gesture } from "../../touch.js";
import { Delayer } from "../../../common/async.js";
import { memoize } from "../../../common/decorators.js";
import { Emitter } from "../../../common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../common/lifecycle.js";
import { isMacintosh } from "../../../common/platform.js";
import "./sash.css";
const DEBUG = false;
var OrthogonalEdge = /* @__PURE__ */ ((OrthogonalEdge2) => {
  OrthogonalEdge2["North"] = "north";
  OrthogonalEdge2["South"] = "south";
  OrthogonalEdge2["East"] = "east";
  OrthogonalEdge2["West"] = "west";
  return OrthogonalEdge2;
})(OrthogonalEdge || {});
var Orientation = /* @__PURE__ */ ((Orientation2) => {
  Orientation2[Orientation2["VERTICAL"] = 0] = "VERTICAL";
  Orientation2[Orientation2["HORIZONTAL"] = 1] = "HORIZONTAL";
  return Orientation2;
})(Orientation || {});
var SashState = /* @__PURE__ */ ((SashState2) => {
  SashState2[SashState2["Disabled"] = 0] = "Disabled";
  SashState2[SashState2["AtMinimum"] = 1] = "AtMinimum";
  SashState2[SashState2["AtMaximum"] = 2] = "AtMaximum";
  SashState2[SashState2["Enabled"] = 3] = "Enabled";
  return SashState2;
})(SashState || {});
let globalSize = 4;
const onDidChangeGlobalSize = new Emitter();
function setGlobalSashSize(size) {
  globalSize = size;
  onDidChangeGlobalSize.fire(size);
}
let globalHoverDelay = 300;
const onDidChangeHoverDelay = new Emitter();
function setGlobalHoverDelay(size) {
  globalHoverDelay = size;
  onDidChangeHoverDelay.fire(size);
}
class MouseEventFactory {
  constructor(el) {
    this.el = el;
    this.disposables = new DisposableStore();
  }
  get onPointerMove() {
    return this.disposables.add(new DomEmitter(getWindow(this.el), "mousemove")).event;
  }
  get onPointerUp() {
    return this.disposables.add(new DomEmitter(getWindow(this.el), "mouseup")).event;
  }
  dispose() {
    this.disposables.dispose();
  }
}
__decorateClass([
  memoize
], MouseEventFactory.prototype, "onPointerMove", 1);
__decorateClass([
  memoize
], MouseEventFactory.prototype, "onPointerUp", 1);
class GestureEventFactory {
  constructor(el) {
    this.el = el;
    this.disposables = new DisposableStore();
  }
  get onPointerMove() {
    return this.disposables.add(new DomEmitter(this.el, EventType.Change)).event;
  }
  get onPointerUp() {
    return this.disposables.add(new DomEmitter(this.el, EventType.End)).event;
  }
  dispose() {
    this.disposables.dispose();
  }
}
__decorateClass([
  memoize
], GestureEventFactory.prototype, "onPointerMove", 1);
__decorateClass([
  memoize
], GestureEventFactory.prototype, "onPointerUp", 1);
class OrthogonalPointerEventFactory {
  constructor(factory) {
    this.factory = factory;
  }
  get onPointerMove() {
    return this.factory.onPointerMove;
  }
  get onPointerUp() {
    return this.factory.onPointerUp;
  }
  dispose() {
  }
}
__decorateClass([
  memoize
], OrthogonalPointerEventFactory.prototype, "onPointerMove", 1);
__decorateClass([
  memoize
], OrthogonalPointerEventFactory.prototype, "onPointerUp", 1);
const PointerEventsDisabledCssClass = "pointer-events-disabled";
class Sash extends Disposable {
  constructor(container, layoutProvider, options) {
    super();
    this.hoverDelay = globalHoverDelay;
    this.hoverDelayer = this._register(new Delayer(this.hoverDelay));
    this._state = 3 /* Enabled */;
    this.classNameLeases = /* @__PURE__ */ new Map();
    this.onDidEnablementChange = this._register(new Emitter());
    this._onDidStart = this._register(new Emitter());
    this._onDidChange = this._register(new Emitter());
    this._onDidReset = this._register(new Emitter());
    this._onDidEnd = this._register(new Emitter());
    this.orthogonalStartSashDisposables = this._register(new DisposableStore());
    this.orthogonalStartDragHandleDisposables = this._register(new DisposableStore());
    this.orthogonalEndSashDisposables = this._register(new DisposableStore());
    this.orthogonalEndDragHandleDisposables = this._register(new DisposableStore());
    /**
     * A linked sash will be forwarded the same user interactions and events
     * so it moves exactly the same way as this sash.
     *
     * Useful in 2x2 grids. Not meant for widespread usage.
     */
    this.linkedSash = void 0;
    this.el = append(container, $(".monaco-sash"));
    if (options.orthogonalEdge) {
      this.el.classList.add(`orthogonal-edge-${options.orthogonalEdge}`);
    }
    if (isMacintosh) {
      this.el.classList.add("mac");
    }
    this._register(addDisposableListener(this.el, "mousedown", (e) => this.onPointerStart(e, new MouseEventFactory(container))));
    this._register(addDisposableListener(this.el, "dblclick", (e) => this.onPointerDoublePress(e)));
    this._register(addDisposableListener(this.el, "mouseenter", () => Sash.onMouseEnter(this)));
    this._register(addDisposableListener(this.el, "mouseleave", () => Sash.onMouseLeave(this)));
    this._register(Gesture.addTarget(this.el));
    this._register(addDisposableListener(this.el, EventType.Start, (e) => this.onPointerStart(e, new GestureEventFactory(this.el))));
    let doubleTapTimeout = void 0;
    this._register(addDisposableListener(this.el, EventType.Tap, (event) => {
      if (doubleTapTimeout) {
        clearTimeout(doubleTapTimeout);
        doubleTapTimeout = void 0;
        this.onPointerDoublePress(event);
        return;
      }
      clearTimeout(doubleTapTimeout);
      doubleTapTimeout = setTimeout(() => doubleTapTimeout = void 0, 250);
    }));
    if (typeof options.size === "number") {
      this.size = options.size;
      if (options.orientation === 0 /* VERTICAL */) {
        this.el.style.width = `${this.size}px`;
      } else {
        this.el.style.height = `${this.size}px`;
      }
    } else {
      this.size = globalSize;
      this._register(onDidChangeGlobalSize.event((size) => {
        this.size = size;
        this.layout();
      }));
    }
    this._register(onDidChangeHoverDelay.event((delay) => this.hoverDelay = delay));
    this.layoutProvider = layoutProvider;
    this.orthogonalStartSash = options.orthogonalStartSash;
    this.orthogonalEndSash = options.orthogonalEndSash;
    this.orientation = options.orientation || 0 /* VERTICAL */;
    if (this.orientation === 1 /* HORIZONTAL */) {
      this.el.classList.add("horizontal");
      this.el.classList.remove("vertical");
    } else {
      this.el.classList.remove("horizontal");
      this.el.classList.add("vertical");
    }
    this.el.classList.toggle("debug", DEBUG);
    this.layout();
  }
  get state() {
    return this._state;
  }
  get orthogonalStartSash() {
    return this._orthogonalStartSash;
  }
  get orthogonalEndSash() {
    return this._orthogonalEndSash;
  }
  /**
   * The state of a sash defines whether it can be interacted with by the user
   * as well as what mouse cursor to use, when hovered.
   */
  set state(state) {
    if (this._state === state) {
      return;
    }
    this.el.classList.toggle("disabled", state === 0 /* Disabled */);
    this.el.classList.toggle("minimum", state === 1 /* AtMinimum */);
    this.el.classList.toggle("maximum", state === 2 /* AtMaximum */);
    this._state = state;
    this.onDidEnablementChange.fire(state);
  }
  /**
   * An event which fires whenever the user starts dragging this sash.
   */
  get onDidStart() {
    return this._onDidStart.event;
  }
  /**
   * An event which fires whenever the user moves the mouse while
   * dragging this sash.
   */
  get onDidChange() {
    return this._onDidChange.event;
  }
  /**
   * An event which fires whenever the user double clicks this sash.
   */
  get onDidReset() {
    return this._onDidReset.event;
  }
  /** Adds a CSS class for the lifetime of the returned disposable. */
  addClass(className) {
    const existingLease = this.classNameLeases.get(className);
    if (existingLease) {
      existingLease.count++;
    } else {
      this.classNameLeases.set(className, { count: 1, removeOnRelease: !this.el.classList.contains(className) });
      this.el.classList.add(className);
    }
    return toDisposable(() => {
      const lease = this.classNameLeases.get(className);
      if (lease?.count === 1) {
        this.classNameLeases.delete(className);
        if (lease.removeOnRelease) {
          this.el.classList.remove(className);
        }
      } else if (lease) {
        lease.count--;
      }
    });
  }
  /**
   * An event which fires whenever the user stops dragging this sash.
   */
  get onDidEnd() {
    return this._onDidEnd.event;
  }
  /**
   * A reference to another sash, perpendicular to this one, which
   * aligns at the start of this one. A corner sash will be created
   * automatically at that location.
   *
   * The start of a horizontal sash is its left-most position.
   * The start of a vertical sash is its top-most position.
   */
  set orthogonalStartSash(sash) {
    if (this._orthogonalStartSash === sash) {
      return;
    }
    this.orthogonalStartDragHandleDisposables.clear();
    this.orthogonalStartSashDisposables.clear();
    if (sash) {
      const onChange = (state) => {
        this.orthogonalStartDragHandleDisposables.clear();
        if (state !== 0 /* Disabled */) {
          this._orthogonalStartDragHandle = append(this.el, $(".orthogonal-drag-handle.start"));
          this.orthogonalStartDragHandleDisposables.add(toDisposable(() => this._orthogonalStartDragHandle.remove()));
          this.orthogonalStartDragHandleDisposables.add(addDisposableListener(this._orthogonalStartDragHandle, "mouseenter", () => Sash.onMouseEnter(sash)));
          this.orthogonalStartDragHandleDisposables.add(addDisposableListener(this._orthogonalStartDragHandle, "mouseleave", () => Sash.onMouseLeave(sash)));
        }
      };
      this.orthogonalStartSashDisposables.add(sash.onDidEnablementChange.event(onChange, this));
      onChange(sash.state);
    }
    this._orthogonalStartSash = sash;
  }
  /**
   * A reference to another sash, perpendicular to this one, which
   * aligns at the end of this one. A corner sash will be created
   * automatically at that location.
   *
   * The end of a horizontal sash is its right-most position.
   * The end of a vertical sash is its bottom-most position.
   */
  set orthogonalEndSash(sash) {
    if (this._orthogonalEndSash === sash) {
      return;
    }
    this.orthogonalEndDragHandleDisposables.clear();
    this.orthogonalEndSashDisposables.clear();
    if (sash) {
      const onChange = (state) => {
        this.orthogonalEndDragHandleDisposables.clear();
        if (state !== 0 /* Disabled */) {
          this._orthogonalEndDragHandle = append(this.el, $(".orthogonal-drag-handle.end"));
          this.orthogonalEndDragHandleDisposables.add(toDisposable(() => this._orthogonalEndDragHandle.remove()));
          this.orthogonalEndDragHandleDisposables.add(addDisposableListener(this._orthogonalEndDragHandle, "mouseenter", () => Sash.onMouseEnter(sash)));
          this.orthogonalEndDragHandleDisposables.add(addDisposableListener(this._orthogonalEndDragHandle, "mouseleave", () => Sash.onMouseLeave(sash)));
        }
      };
      this.orthogonalEndSashDisposables.add(sash.onDidEnablementChange.event(onChange, this));
      onChange(sash.state);
    }
    this._orthogonalEndSash = sash;
  }
  onPointerStart(event, pointerEventFactory) {
    EventHelper.stop(event);
    let isMultisashResize = false;
    if (!event.__orthogonalSashEvent) {
      const orthogonalSash = this.getOrthogonalSash(event);
      if (orthogonalSash) {
        isMultisashResize = true;
        event.__orthogonalSashEvent = true;
        orthogonalSash.onPointerStart(event, new OrthogonalPointerEventFactory(pointerEventFactory));
      }
    }
    if (this.linkedSash && !event.__linkedSashEvent) {
      event.__linkedSashEvent = true;
      this.linkedSash.onPointerStart(event, new OrthogonalPointerEventFactory(pointerEventFactory));
    }
    if (!this.state) {
      return;
    }
    const iframes = this.el.ownerDocument.getElementsByTagName("iframe");
    for (const iframe of iframes) {
      iframe.classList.add(PointerEventsDisabledCssClass);
    }
    const startX = event.pageX;
    const startY = event.pageY;
    const altKey = event.altKey;
    const startEvent = { startX, currentX: startX, startY, currentY: startY, altKey };
    this.el.classList.add("active");
    this._onDidStart.fire(startEvent);
    const style = createStyleSheet(this.el);
    const updateStyle = () => {
      let cursor = "";
      if (isMultisashResize) {
        cursor = "all-scroll";
      } else if (this.orientation === 1 /* HORIZONTAL */) {
        if (this.state === 1 /* AtMinimum */) {
          cursor = "s-resize";
        } else if (this.state === 2 /* AtMaximum */) {
          cursor = "n-resize";
        } else {
          cursor = isMacintosh ? "row-resize" : "ns-resize";
        }
      } else {
        if (this.state === 1 /* AtMinimum */) {
          cursor = "e-resize";
        } else if (this.state === 2 /* AtMaximum */) {
          cursor = "w-resize";
        } else {
          cursor = isMacintosh ? "col-resize" : "ew-resize";
        }
      }
      style.textContent = `* { cursor: ${cursor} !important; }`;
    };
    const disposables = new DisposableStore();
    updateStyle();
    if (!isMultisashResize) {
      this.onDidEnablementChange.event(updateStyle, null, disposables);
    }
    const onPointerMove = (e) => {
      EventHelper.stop(e, false);
      const event2 = { startX, currentX: e.pageX, startY, currentY: e.pageY, altKey };
      this._onDidChange.fire(event2);
    };
    const onPointerUp = (e) => {
      EventHelper.stop(e, false);
      style.remove();
      this.el.classList.remove("active");
      this._onDidEnd.fire();
      disposables.dispose();
      for (const iframe of iframes) {
        iframe.classList.remove(PointerEventsDisabledCssClass);
      }
    };
    pointerEventFactory.onPointerMove(onPointerMove, null, disposables);
    pointerEventFactory.onPointerUp(onPointerUp, null, disposables);
    disposables.add(pointerEventFactory);
  }
  onPointerDoublePress(e) {
    const orthogonalSash = this.getOrthogonalSash(e);
    if (orthogonalSash) {
      orthogonalSash._onDidReset.fire();
    }
    if (this.linkedSash) {
      this.linkedSash._onDidReset.fire();
    }
    this._onDidReset.fire();
  }
  static onMouseEnter(sash, fromLinkedSash = false) {
    if (sash.el.classList.contains("active")) {
      sash.hoverDelayer.cancel();
      sash.el.classList.add("hover");
    } else {
      sash.hoverDelayer.trigger(() => sash.el.classList.add("hover"), sash.hoverDelay).then(void 0, () => {
      });
    }
    if (!fromLinkedSash && sash.linkedSash) {
      Sash.onMouseEnter(sash.linkedSash, true);
    }
  }
  static onMouseLeave(sash, fromLinkedSash = false) {
    sash.hoverDelayer.cancel();
    sash.el.classList.remove("hover");
    if (!fromLinkedSash && sash.linkedSash) {
      Sash.onMouseLeave(sash.linkedSash, true);
    }
  }
  /**
   * Forcefully stop any user interactions with this sash.
   * Useful when hiding a parent component, while the user is still
   * interacting with the sash.
   */
  clearSashHoverState() {
    Sash.onMouseLeave(this);
  }
  /**
   * Layout the sash. The sash will size and position itself
   * based on its provided {@link ISashLayoutProvider layout provider}.
   */
  layout() {
    if (this.orientation === 0 /* VERTICAL */) {
      const verticalProvider = this.layoutProvider;
      this.el.style.left = verticalProvider.getVerticalSashLeft(this) - this.size / 2 + "px";
      if (verticalProvider.getVerticalSashTop) {
        this.el.style.top = verticalProvider.getVerticalSashTop(this) + "px";
      }
      if (verticalProvider.getVerticalSashHeight) {
        this.el.style.height = verticalProvider.getVerticalSashHeight(this) + "px";
      }
    } else {
      const horizontalProvider = this.layoutProvider;
      this.el.style.top = horizontalProvider.getHorizontalSashTop(this) - this.size / 2 + "px";
      if (horizontalProvider.getHorizontalSashLeft) {
        this.el.style.left = horizontalProvider.getHorizontalSashLeft(this) + "px";
      }
      if (horizontalProvider.getHorizontalSashWidth) {
        this.el.style.width = horizontalProvider.getHorizontalSashWidth(this) + "px";
      }
    }
  }
  getOrthogonalSash(e) {
    const target = e.initialTarget ?? e.target;
    if (!target || !isHTMLElement(target)) {
      return void 0;
    }
    if (target.classList.contains("orthogonal-drag-handle")) {
      return target.classList.contains("start") ? this.orthogonalStartSash : this.orthogonalEndSash;
    }
    return void 0;
  }
  dispose() {
    super.dispose();
    this.el.remove();
  }
}
export {
  Orientation,
  OrthogonalEdge,
  Sash,
  SashState,
  setGlobalHoverDelay,
  setGlobalSashSize
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFx1aVxcc2FzaFxcc2FzaC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7ICQsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgYXBwZW5kLCBFdmVudEhlbHBlciwgRXZlbnRMaWtlLCBnZXRXaW5kb3csIGlzSFRNTEVsZW1lbnQgfSBmcm9tICcuLi8uLi9kb20uanMnO1xuaW1wb3J0IHsgY3JlYXRlU3R5bGVTaGVldCB9IGZyb20gJy4uLy4uL2RvbVN0eWxlc2hlZXRzLmpzJztcbmltcG9ydCB7IERvbUVtaXR0ZXIgfSBmcm9tICcuLi8uLi9ldmVudC5qcyc7XG5pbXBvcnQgeyBFdmVudFR5cGUsIEdlc3R1cmUgfSBmcm9tICcuLi8uLi90b3VjaC5qcyc7XG5pbXBvcnQgeyBEZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IG1lbW9pemUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCAnLi9zYXNoLmNzcyc7XG5cbi8qKlxuICogQWxsb3cgdGhlIHNhc2hlcyB0byBiZSB2aXNpYmxlIGF0IHJ1bnRpbWUuXG4gKiBAcmVtYXJrIFVzZSBmb3IgZGV2ZWxvcG1lbnQgcHVycG9zZXMgb25seS5cbiAqL1xuY29uc3QgREVCVUcgPSBmYWxzZTtcbi8vIERFQlVHID0gQm9vbGVhbihcInRydWVcIik7IC8vIGRvbmUgXCJ3ZWlyZGx5XCIgc28gdGhhdCBhIGxpbnQgd2FybmluZyBwcmV2ZW50cyB5b3UgZnJvbSBwdXNoaW5nIHRoaXNcblxuLyoqXG4gKiBBIHZlcnRpY2FsIHNhc2ggbGF5b3V0IHByb3ZpZGVyIHByb3ZpZGVzIHBvc2l0aW9uIGFuZCBoZWlnaHQgZm9yIGEgc2FzaC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVmVydGljYWxTYXNoTGF5b3V0UHJvdmlkZXIge1xuXHRnZXRWZXJ0aWNhbFNhc2hMZWZ0KHNhc2g6IFNhc2gpOiBudW1iZXI7XG5cdGdldFZlcnRpY2FsU2FzaFRvcD8oc2FzaDogU2FzaCk6IG51bWJlcjtcblx0Z2V0VmVydGljYWxTYXNoSGVpZ2h0PyhzYXNoOiBTYXNoKTogbnVtYmVyO1xufVxuXG4vKipcbiAqIEEgdmVydGljYWwgc2FzaCBsYXlvdXQgcHJvdmlkZXIgcHJvdmlkZXMgcG9zaXRpb24gYW5kIHdpZHRoIGZvciBhIHNhc2guXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUhvcml6b250YWxTYXNoTGF5b3V0UHJvdmlkZXIge1xuXHRnZXRIb3Jpem9udGFsU2FzaFRvcChzYXNoOiBTYXNoKTogbnVtYmVyO1xuXHRnZXRIb3Jpem9udGFsU2FzaExlZnQ/KHNhc2g6IFNhc2gpOiBudW1iZXI7XG5cdGdldEhvcml6b250YWxTYXNoV2lkdGg/KHNhc2g6IFNhc2gpOiBudW1iZXI7XG59XG5cbnR5cGUgSVNhc2hMYXlvdXRQcm92aWRlciA9IElWZXJ0aWNhbFNhc2hMYXlvdXRQcm92aWRlciB8IElIb3Jpem9udGFsU2FzaExheW91dFByb3ZpZGVyO1xuXG5leHBvcnQgaW50ZXJmYWNlIElTYXNoRXZlbnQge1xuXHRyZWFkb25seSBzdGFydFg6IG51bWJlcjtcblx0cmVhZG9ubHkgY3VycmVudFg6IG51bWJlcjtcblx0cmVhZG9ubHkgc3RhcnRZOiBudW1iZXI7XG5cdHJlYWRvbmx5IGN1cnJlbnRZOiBudW1iZXI7XG5cdHJlYWRvbmx5IGFsdEtleTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGVudW0gT3J0aG9nb25hbEVkZ2Uge1xuXHROb3J0aCA9ICdub3J0aCcsXG5cdFNvdXRoID0gJ3NvdXRoJyxcblx0RWFzdCA9ICdlYXN0Jyxcblx0V2VzdCA9ICd3ZXN0J1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElCb3VuZGFyeVNhc2hlcyB7XG5cdHJlYWRvbmx5IHRvcD86IFNhc2g7XG5cdHJlYWRvbmx5IHJpZ2h0PzogU2FzaDtcblx0cmVhZG9ubHkgYm90dG9tPzogU2FzaDtcblx0cmVhZG9ubHkgbGVmdD86IFNhc2g7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNhc2hPcHRpb25zIHtcblxuXHQvKipcblx0ICogV2hldGhlciBhIHNhc2ggaXMgaG9yaXpvbnRhbCBvciB2ZXJ0aWNhbC5cblx0ICovXG5cdHJlYWRvbmx5IG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbjtcblxuXHQvKipcblx0ICogVGhlIHdpZHRoIG9yIGhlaWdodCBvZiBhIHZlcnRpY2FsIG9yIGhvcml6b250YWwgc2FzaCwgcmVzcGVjdGl2ZWx5LlxuXHQgKi9cblx0cmVhZG9ubHkgc2l6ZT86IG51bWJlcjtcblxuXHQvKipcblx0ICogQSByZWZlcmVuY2UgdG8gYW5vdGhlciBzYXNoLCBwZXJwZW5kaWN1bGFyIHRvIHRoaXMgb25lLCB3aGljaFxuXHQgKiBhbGlnbnMgYXQgdGhlIHN0YXJ0IG9mIHRoaXMgb25lLiBBIGNvcm5lciBzYXNoIHdpbGwgYmUgY3JlYXRlZFxuXHQgKiBhdXRvbWF0aWNhbGx5IGF0IHRoYXQgbG9jYXRpb24uXG5cdCAqXG5cdCAqIFRoZSBzdGFydCBvZiBhIGhvcml6b250YWwgc2FzaCBpcyBpdHMgbGVmdC1tb3N0IHBvc2l0aW9uLlxuXHQgKiBUaGUgc3RhcnQgb2YgYSB2ZXJ0aWNhbCBzYXNoIGlzIGl0cyB0b3AtbW9zdCBwb3NpdGlvbi5cblx0ICovXG5cdHJlYWRvbmx5IG9ydGhvZ29uYWxTdGFydFNhc2g/OiBTYXNoO1xuXG5cdC8qKlxuXHQgKiBBIHJlZmVyZW5jZSB0byBhbm90aGVyIHNhc2gsIHBlcnBlbmRpY3VsYXIgdG8gdGhpcyBvbmUsIHdoaWNoXG5cdCAqIGFsaWducyBhdCB0aGUgZW5kIG9mIHRoaXMgb25lLiBBIGNvcm5lciBzYXNoIHdpbGwgYmUgY3JlYXRlZFxuXHQgKiBhdXRvbWF0aWNhbGx5IGF0IHRoYXQgbG9jYXRpb24uXG5cdCAqXG5cdCAqIFRoZSBlbmQgb2YgYSBob3Jpem9udGFsIHNhc2ggaXMgaXRzIHJpZ2h0LW1vc3QgcG9zaXRpb24uXG5cdCAqIFRoZSBlbmQgb2YgYSB2ZXJ0aWNhbCBzYXNoIGlzIGl0cyBib3R0b20tbW9zdCBwb3NpdGlvbi5cblx0ICovXG5cdHJlYWRvbmx5IG9ydGhvZ29uYWxFbmRTYXNoPzogU2FzaDtcblxuXHQvKipcblx0ICogUHJvdmlkZXMgYSBoaW50IGFzIHRvIHdoYXQgbW91c2UgY3Vyc29yIHRvIHVzZSB3aGVuZXZlciB0aGUgdXNlclxuXHQgKiBob3ZlcnMgb3ZlciBhIGNvcm5lciBzYXNoIHByb3ZpZGVkIGJ5IHRoaXMgYW5kIGFuIG9ydGhvZ29uYWwgc2FzaC5cblx0ICovXG5cdHJlYWRvbmx5IG9ydGhvZ29uYWxFZGdlPzogT3J0aG9nb25hbEVkZ2U7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVZlcnRpY2FsU2FzaE9wdGlvbnMgZXh0ZW5kcyBJU2FzaE9wdGlvbnMge1xuXHRyZWFkb25seSBvcmllbnRhdGlvbjogT3JpZW50YXRpb24uVkVSVElDQUw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUhvcml6b250YWxTYXNoT3B0aW9ucyBleHRlbmRzIElTYXNoT3B0aW9ucyB7XG5cdHJlYWRvbmx5IG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbi5IT1JJWk9OVEFMO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBPcmllbnRhdGlvbiB7XG5cdFZFUlRJQ0FMLFxuXHRIT1JJWk9OVEFMXG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFNhc2hTdGF0ZSB7XG5cblx0LyoqXG5cdCAqIERpc2FibGUgYW55IFVJIGludGVyYWN0aW9uLlxuXHQgKi9cblx0RGlzYWJsZWQsXG5cblx0LyoqXG5cdCAqIEFsbG93IGRyYWdnaW5nIGRvd24gb3IgdG8gdGhlIHJpZ2h0LCBkZXBlbmRpbmcgb24gdGhlIHNhc2ggb3JpZW50YXRpb24uXG5cdCAqXG5cdCAqIFNvbWUgT1NzIGFsbG93IGN1c3RvbWl6aW5nIHRoZSBtb3VzZSBjdXJzb3IgZGlmZmVyZW50bHkgd2hlbmV2ZXJcblx0ICogc29tZSByZXNpemFibGUgY29tcG9uZW50IGNhbid0IGJlIGFueSBzbWFsbGVyLCBidXQgY2FuIGJlIGxhcmdlci5cblx0ICovXG5cdEF0TWluaW11bSxcblxuXHQvKipcblx0ICogQWxsb3cgZHJhZ2dpbmcgdXAgb3IgdG8gdGhlIGxlZnQsIGRlcGVuZGluZyBvbiB0aGUgc2FzaCBvcmllbnRhdGlvbi5cblx0ICpcblx0ICogU29tZSBPU3MgYWxsb3cgY3VzdG9taXppbmcgdGhlIG1vdXNlIGN1cnNvciBkaWZmZXJlbnRseSB3aGVuZXZlclxuXHQgKiBzb21lIHJlc2l6YWJsZSBjb21wb25lbnQgY2FuJ3QgYmUgYW55IGxhcmdlciwgYnV0IGNhbiBiZSBzbWFsbGVyLlxuXHQgKi9cblx0QXRNYXhpbXVtLFxuXG5cdC8qKlxuXHQgKiBFbmFibGUgZHJhZ2dpbmcuXG5cdCAqL1xuXHRFbmFibGVkXG59XG5cbmxldCBnbG9iYWxTaXplID0gNDtcbmNvbnN0IG9uRGlkQ2hhbmdlR2xvYmFsU2l6ZSA9IG5ldyBFbWl0dGVyPG51bWJlcj4oKTtcbmV4cG9ydCBmdW5jdGlvbiBzZXRHbG9iYWxTYXNoU2l6ZShzaXplOiBudW1iZXIpOiB2b2lkIHtcblx0Z2xvYmFsU2l6ZSA9IHNpemU7XG5cdG9uRGlkQ2hhbmdlR2xvYmFsU2l6ZS5maXJlKHNpemUpO1xufVxuXG5sZXQgZ2xvYmFsSG92ZXJEZWxheSA9IDMwMDtcbmNvbnN0IG9uRGlkQ2hhbmdlSG92ZXJEZWxheSA9IG5ldyBFbWl0dGVyPG51bWJlcj4oKTtcbmV4cG9ydCBmdW5jdGlvbiBzZXRHbG9iYWxIb3ZlckRlbGF5KHNpemU6IG51bWJlcik6IHZvaWQge1xuXHRnbG9iYWxIb3ZlckRlbGF5ID0gc2l6ZTtcblx0b25EaWRDaGFuZ2VIb3ZlckRlbGF5LmZpcmUoc2l6ZSk7XG59XG5cbmludGVyZmFjZSBQb2ludGVyRXZlbnQgZXh0ZW5kcyBFdmVudExpa2Uge1xuXHRyZWFkb25seSBwYWdlWDogbnVtYmVyO1xuXHRyZWFkb25seSBwYWdlWTogbnVtYmVyO1xuXHRyZWFkb25seSBhbHRLZXk6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHRhcmdldDogRXZlbnRUYXJnZXQgfCBudWxsO1xuXHRyZWFkb25seSBpbml0aWFsVGFyZ2V0PzogRXZlbnRUYXJnZXQgfCB1bmRlZmluZWQ7XG59XG5cbmludGVyZmFjZSBJUG9pbnRlckV2ZW50RmFjdG9yeSB7XG5cdHJlYWRvbmx5IG9uUG9pbnRlck1vdmU6IEV2ZW50PFBvaW50ZXJFdmVudD47XG5cdHJlYWRvbmx5IG9uUG9pbnRlclVwOiBFdmVudDxQb2ludGVyRXZlbnQ+O1xuXHRkaXNwb3NlKCk6IHZvaWQ7XG59XG5cbmNsYXNzIE1vdXNlRXZlbnRGYWN0b3J5IGltcGxlbWVudHMgSVBvaW50ZXJFdmVudEZhY3Rvcnkge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBlbDogSFRNTEVsZW1lbnQpIHsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCBvblBvaW50ZXJNb3ZlKCk6IEV2ZW50PFBvaW50ZXJFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRG9tRW1pdHRlcihnZXRXaW5kb3codGhpcy5lbCksICdtb3VzZW1vdmUnKSkuZXZlbnQ7XG5cdH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgb25Qb2ludGVyVXAoKTogRXZlbnQ8UG9pbnRlckV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBEb21FbWl0dGVyKGdldFdpbmRvdyh0aGlzLmVsKSwgJ21vdXNldXAnKSkuZXZlbnQ7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIEdlc3R1cmVFdmVudEZhY3RvcnkgaW1wbGVtZW50cyBJUG9pbnRlckV2ZW50RmFjdG9yeSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRAbWVtb2l6ZVxuXHRnZXQgb25Qb2ludGVyTW92ZSgpOiBFdmVudDxQb2ludGVyRXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IERvbUVtaXR0ZXIodGhpcy5lbCwgRXZlbnRUeXBlLkNoYW5nZSkpLmV2ZW50O1xuXHR9XG5cblx0QG1lbW9pemVcblx0Z2V0IG9uUG9pbnRlclVwKCk6IEV2ZW50PFBvaW50ZXJFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRG9tRW1pdHRlcih0aGlzLmVsLCBFdmVudFR5cGUuRW5kKSkuZXZlbnQ7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGVsOiBIVE1MRWxlbWVudCkgeyB9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBPcnRob2dvbmFsUG9pbnRlckV2ZW50RmFjdG9yeSBpbXBsZW1lbnRzIElQb2ludGVyRXZlbnRGYWN0b3J5IHtcblxuXHRAbWVtb2l6ZVxuXHRnZXQgb25Qb2ludGVyTW92ZSgpOiBFdmVudDxQb2ludGVyRXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5mYWN0b3J5Lm9uUG9pbnRlck1vdmU7XG5cdH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgb25Qb2ludGVyVXAoKTogRXZlbnQ8UG9pbnRlckV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuZmFjdG9yeS5vblBvaW50ZXJVcDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgZmFjdG9yeTogSVBvaW50ZXJFdmVudEZhY3RvcnkpIHsgfVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Ly8gbm9vcFxuXHR9XG59XG5cbmNvbnN0IFBvaW50ZXJFdmVudHNEaXNhYmxlZENzc0NsYXNzID0gJ3BvaW50ZXItZXZlbnRzLWRpc2FibGVkJztcblxuLyoqXG4gKiBUaGUge0BsaW5rIFNhc2h9IGlzIHRoZSBVSSBjb21wb25lbnQgd2hpY2ggYWxsb3dzIHRoZSB1c2VyIHRvIHJlc2l6ZSBvdGhlclxuICogY29tcG9uZW50cy4gSXQncyB1c3VhbGx5IGFuIGludmlzaWJsZSBob3Jpem9udGFsIG9yIHZlcnRpY2FsIGxpbmUgd2hpY2gsIHdoZW5cbiAqIGhvdmVyZWQsIGJlY29tZXMgaGlnaGxpZ2h0ZWQgYW5kIGNhbiBiZSBkcmFnZ2VkIGFsb25nIHRoZSBwZXJwZW5kaWN1bGFyIGRpbWVuc2lvblxuICogdG8gaXRzIGRpcmVjdGlvbi5cbiAqXG4gKiBGZWF0dXJlczpcbiAqIC0gVG91Y2ggZXZlbnQgaGFuZGxpbmdcbiAqIC0gQ29ybmVyIHNhc2ggc3VwcG9ydFxuICogLSBIb3ZlciB3aXRoIGRpZmZlcmVudCBtb3VzZSBjdXJzb3Igc3VwcG9ydFxuICogLSBDb25maWd1cmFibGUgaG92ZXIgc2l6ZVxuICogLSBMaW5rZWQgc2FzaCBzdXBwb3J0LCBmb3IgMngyIGNvcm5lciBzYXNoZXNcbiAqL1xuZXhwb3J0IGNsYXNzIFNhc2ggZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIGVsOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBsYXlvdXRQcm92aWRlcjogSVNhc2hMYXlvdXRQcm92aWRlcjtcblx0cHJpdmF0ZSBvcmllbnRhdGlvbjogT3JpZW50YXRpb247XG5cdHByaXZhdGUgc2l6ZTogbnVtYmVyO1xuXHRwcml2YXRlIGhvdmVyRGVsYXkgPSBnbG9iYWxIb3ZlckRlbGF5O1xuXHRwcml2YXRlIGhvdmVyRGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyKHRoaXMuaG92ZXJEZWxheSkpO1xuXG5cdHByaXZhdGUgX3N0YXRlOiBTYXNoU3RhdGUgPSBTYXNoU3RhdGUuRW5hYmxlZDtcblx0cHJpdmF0ZSByZWFkb25seSBjbGFzc05hbWVMZWFzZXMgPSBuZXcgTWFwPHN0cmluZywgeyBjb3VudDogbnVtYmVyOyByZW1vdmVPblJlbGVhc2U6IGJvb2xlYW4gfT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBvbkRpZEVuYWJsZW1lbnRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxTYXNoU3RhdGU+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFN0YXJ0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNhc2hFdmVudD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNhc2hFdmVudD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVzZXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRFbmQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBvcnRob2dvbmFsU3RhcnRTYXNoRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIF9vcnRob2dvbmFsU3RhcnRTYXNoOiBTYXNoIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9ydGhvZ29uYWxTdGFydERyYWdIYW5kbGVEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgX29ydGhvZ29uYWxTdGFydERyYWdIYW5kbGU6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9ydGhvZ29uYWxFbmRTYXNoRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIF9vcnRob2dvbmFsRW5kU2FzaDogU2FzaCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBvcnRob2dvbmFsRW5kRHJhZ0hhbmRsZURpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBfb3J0aG9nb25hbEVuZERyYWdIYW5kbGU6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdGdldCBzdGF0ZSgpOiBTYXNoU3RhdGUgeyByZXR1cm4gdGhpcy5fc3RhdGU7IH1cblx0Z2V0IG9ydGhvZ29uYWxTdGFydFNhc2goKTogU2FzaCB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9vcnRob2dvbmFsU3RhcnRTYXNoOyB9XG5cdGdldCBvcnRob2dvbmFsRW5kU2FzaCgpOiBTYXNoIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX29ydGhvZ29uYWxFbmRTYXNoOyB9XG5cblx0LyoqXG5cdCAqIFRoZSBzdGF0ZSBvZiBhIHNhc2ggZGVmaW5lcyB3aGV0aGVyIGl0IGNhbiBiZSBpbnRlcmFjdGVkIHdpdGggYnkgdGhlIHVzZXJcblx0ICogYXMgd2VsbCBhcyB3aGF0IG1vdXNlIGN1cnNvciB0byB1c2UsIHdoZW4gaG92ZXJlZC5cblx0ICovXG5cdHNldCBzdGF0ZShzdGF0ZTogU2FzaFN0YXRlKSB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlID09PSBzdGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZWwuY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnLCBzdGF0ZSA9PT0gU2FzaFN0YXRlLkRpc2FibGVkKTtcblx0XHR0aGlzLmVsLmNsYXNzTGlzdC50b2dnbGUoJ21pbmltdW0nLCBzdGF0ZSA9PT0gU2FzaFN0YXRlLkF0TWluaW11bSk7XG5cdFx0dGhpcy5lbC5jbGFzc0xpc3QudG9nZ2xlKCdtYXhpbXVtJywgc3RhdGUgPT09IFNhc2hTdGF0ZS5BdE1heGltdW0pO1xuXG5cdFx0dGhpcy5fc3RhdGUgPSBzdGF0ZTtcblx0XHR0aGlzLm9uRGlkRW5hYmxlbWVudENoYW5nZS5maXJlKHN0YXRlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBbiBldmVudCB3aGljaCBmaXJlcyB3aGVuZXZlciB0aGUgdXNlciBzdGFydHMgZHJhZ2dpbmcgdGhpcyBzYXNoLlxuXHQgKi9cblx0Z2V0IG9uRGlkU3RhcnQoKSB7IHJldHVybiB0aGlzLl9vbkRpZFN0YXJ0LmV2ZW50OyB9XG5cblx0LyoqXG5cdCAqIEFuIGV2ZW50IHdoaWNoIGZpcmVzIHdoZW5ldmVyIHRoZSB1c2VyIG1vdmVzIHRoZSBtb3VzZSB3aGlsZVxuXHQgKiBkcmFnZ2luZyB0aGlzIHNhc2guXG5cdCAqL1xuXHRnZXQgb25EaWRDaGFuZ2UoKSB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDsgfVxuXG5cdC8qKlxuXHQgKiBBbiBldmVudCB3aGljaCBmaXJlcyB3aGVuZXZlciB0aGUgdXNlciBkb3VibGUgY2xpY2tzIHRoaXMgc2FzaC5cblx0ICovXG5cdGdldCBvbkRpZFJlc2V0KCkgeyByZXR1cm4gdGhpcy5fb25EaWRSZXNldC5ldmVudDsgfVxuXG5cdC8qKiBBZGRzIGEgQ1NTIGNsYXNzIGZvciB0aGUgbGlmZXRpbWUgb2YgdGhlIHJldHVybmVkIGRpc3Bvc2FibGUuICovXG5cdGFkZENsYXNzKGNsYXNzTmFtZTogc3RyaW5nKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGV4aXN0aW5nTGVhc2UgPSB0aGlzLmNsYXNzTmFtZUxlYXNlcy5nZXQoY2xhc3NOYW1lKTtcblx0XHRpZiAoZXhpc3RpbmdMZWFzZSkge1xuXHRcdFx0ZXhpc3RpbmdMZWFzZS5jb3VudCsrO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmNsYXNzTmFtZUxlYXNlcy5zZXQoY2xhc3NOYW1lLCB7IGNvdW50OiAxLCByZW1vdmVPblJlbGVhc2U6ICF0aGlzLmVsLmNsYXNzTGlzdC5jb250YWlucyhjbGFzc05hbWUpIH0pO1xuXHRcdFx0dGhpcy5lbC5jbGFzc0xpc3QuYWRkKGNsYXNzTmFtZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBsZWFzZSA9IHRoaXMuY2xhc3NOYW1lTGVhc2VzLmdldChjbGFzc05hbWUpO1xuXHRcdFx0aWYgKGxlYXNlPy5jb3VudCA9PT0gMSkge1xuXHRcdFx0XHR0aGlzLmNsYXNzTmFtZUxlYXNlcy5kZWxldGUoY2xhc3NOYW1lKTtcblx0XHRcdFx0aWYgKGxlYXNlLnJlbW92ZU9uUmVsZWFzZSkge1xuXHRcdFx0XHRcdHRoaXMuZWwuY2xhc3NMaXN0LnJlbW92ZShjbGFzc05hbWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGxlYXNlKSB7XG5cdFx0XHRcdGxlYXNlLmNvdW50LS07XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQW4gZXZlbnQgd2hpY2ggZmlyZXMgd2hlbmV2ZXIgdGhlIHVzZXIgc3RvcHMgZHJhZ2dpbmcgdGhpcyBzYXNoLlxuXHQgKi9cblx0Z2V0IG9uRGlkRW5kKCkgeyByZXR1cm4gdGhpcy5fb25EaWRFbmQuZXZlbnQ7IH1cblxuXHQvKipcblx0ICogQSBsaW5rZWQgc2FzaCB3aWxsIGJlIGZvcndhcmRlZCB0aGUgc2FtZSB1c2VyIGludGVyYWN0aW9ucyBhbmQgZXZlbnRzXG5cdCAqIHNvIGl0IG1vdmVzIGV4YWN0bHkgdGhlIHNhbWUgd2F5IGFzIHRoaXMgc2FzaC5cblx0ICpcblx0ICogVXNlZnVsIGluIDJ4MiBncmlkcy4gTm90IG1lYW50IGZvciB3aWRlc3ByZWFkIHVzYWdlLlxuXHQgKi9cblx0bGlua2VkU2FzaDogU2FzaCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogQSByZWZlcmVuY2UgdG8gYW5vdGhlciBzYXNoLCBwZXJwZW5kaWN1bGFyIHRvIHRoaXMgb25lLCB3aGljaFxuXHQgKiBhbGlnbnMgYXQgdGhlIHN0YXJ0IG9mIHRoaXMgb25lLiBBIGNvcm5lciBzYXNoIHdpbGwgYmUgY3JlYXRlZFxuXHQgKiBhdXRvbWF0aWNhbGx5IGF0IHRoYXQgbG9jYXRpb24uXG5cdCAqXG5cdCAqIFRoZSBzdGFydCBvZiBhIGhvcml6b250YWwgc2FzaCBpcyBpdHMgbGVmdC1tb3N0IHBvc2l0aW9uLlxuXHQgKiBUaGUgc3RhcnQgb2YgYSB2ZXJ0aWNhbCBzYXNoIGlzIGl0cyB0b3AtbW9zdCBwb3NpdGlvbi5cblx0ICovXG5cdHNldCBvcnRob2dvbmFsU3RhcnRTYXNoKHNhc2g6IFNhc2ggfCB1bmRlZmluZWQpIHtcblx0XHRpZiAodGhpcy5fb3J0aG9nb25hbFN0YXJ0U2FzaCA9PT0gc2FzaCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMub3J0aG9nb25hbFN0YXJ0RHJhZ0hhbmRsZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5vcnRob2dvbmFsU3RhcnRTYXNoRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGlmIChzYXNoKSB7XG5cdFx0XHRjb25zdCBvbkNoYW5nZSA9IChzdGF0ZTogU2FzaFN0YXRlKSA9PiB7XG5cdFx0XHRcdHRoaXMub3J0aG9nb25hbFN0YXJ0RHJhZ0hhbmRsZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRcdFx0aWYgKHN0YXRlICE9PSBTYXNoU3RhdGUuRGlzYWJsZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9vcnRob2dvbmFsU3RhcnREcmFnSGFuZGxlID0gYXBwZW5kKHRoaXMuZWwsICQoJy5vcnRob2dvbmFsLWRyYWctaGFuZGxlLnN0YXJ0JykpO1xuXHRcdFx0XHRcdHRoaXMub3J0aG9nb25hbFN0YXJ0RHJhZ0hhbmRsZURpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fb3J0aG9nb25hbFN0YXJ0RHJhZ0hhbmRsZSEucmVtb3ZlKCkpKTtcblx0XHRcdFx0XHR0aGlzLm9ydGhvZ29uYWxTdGFydERyYWdIYW5kbGVEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX29ydGhvZ29uYWxTdGFydERyYWdIYW5kbGUsICdtb3VzZWVudGVyJywgKCkgPT4gU2FzaC5vbk1vdXNlRW50ZXIoc2FzaCkpKTtcblx0XHRcdFx0XHR0aGlzLm9ydGhvZ29uYWxTdGFydERyYWdIYW5kbGVEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX29ydGhvZ29uYWxTdGFydERyYWdIYW5kbGUsICdtb3VzZWxlYXZlJywgKCkgPT4gU2FzaC5vbk1vdXNlTGVhdmUoc2FzaCkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5vcnRob2dvbmFsU3RhcnRTYXNoRGlzcG9zYWJsZXMuYWRkKHNhc2gub25EaWRFbmFibGVtZW50Q2hhbmdlLmV2ZW50KG9uQ2hhbmdlLCB0aGlzKSk7XG5cdFx0XHRvbkNoYW5nZShzYXNoLnN0YXRlKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vcnRob2dvbmFsU3RhcnRTYXNoID0gc2FzaDtcblx0fVxuXG5cdC8qKlxuXHQgKiBBIHJlZmVyZW5jZSB0byBhbm90aGVyIHNhc2gsIHBlcnBlbmRpY3VsYXIgdG8gdGhpcyBvbmUsIHdoaWNoXG5cdCAqIGFsaWducyBhdCB0aGUgZW5kIG9mIHRoaXMgb25lLiBBIGNvcm5lciBzYXNoIHdpbGwgYmUgY3JlYXRlZFxuXHQgKiBhdXRvbWF0aWNhbGx5IGF0IHRoYXQgbG9jYXRpb24uXG5cdCAqXG5cdCAqIFRoZSBlbmQgb2YgYSBob3Jpem9udGFsIHNhc2ggaXMgaXRzIHJpZ2h0LW1vc3QgcG9zaXRpb24uXG5cdCAqIFRoZSBlbmQgb2YgYSB2ZXJ0aWNhbCBzYXNoIGlzIGl0cyBib3R0b20tbW9zdCBwb3NpdGlvbi5cblx0ICovXG5cblx0c2V0IG9ydGhvZ29uYWxFbmRTYXNoKHNhc2g6IFNhc2ggfCB1bmRlZmluZWQpIHtcblx0XHRpZiAodGhpcy5fb3J0aG9nb25hbEVuZFNhc2ggPT09IHNhc2gpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLm9ydGhvZ29uYWxFbmREcmFnSGFuZGxlRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLm9ydGhvZ29uYWxFbmRTYXNoRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGlmIChzYXNoKSB7XG5cdFx0XHRjb25zdCBvbkNoYW5nZSA9IChzdGF0ZTogU2FzaFN0YXRlKSA9PiB7XG5cdFx0XHRcdHRoaXMub3J0aG9nb25hbEVuZERyYWdIYW5kbGVEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0XHRcdGlmIChzdGF0ZSAhPT0gU2FzaFN0YXRlLkRpc2FibGVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fb3J0aG9nb25hbEVuZERyYWdIYW5kbGUgPSBhcHBlbmQodGhpcy5lbCwgJCgnLm9ydGhvZ29uYWwtZHJhZy1oYW5kbGUuZW5kJykpO1xuXHRcdFx0XHRcdHRoaXMub3J0aG9nb25hbEVuZERyYWdIYW5kbGVEaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX29ydGhvZ29uYWxFbmREcmFnSGFuZGxlIS5yZW1vdmUoKSkpO1xuXHRcdFx0XHRcdHRoaXMub3J0aG9nb25hbEVuZERyYWdIYW5kbGVEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX29ydGhvZ29uYWxFbmREcmFnSGFuZGxlLCAnbW91c2VlbnRlcicsICgpID0+IFNhc2gub25Nb3VzZUVudGVyKHNhc2gpKSk7XG5cdFx0XHRcdFx0dGhpcy5vcnRob2dvbmFsRW5kRHJhZ0hhbmRsZURpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fb3J0aG9nb25hbEVuZERyYWdIYW5kbGUsICdtb3VzZWxlYXZlJywgKCkgPT4gU2FzaC5vbk1vdXNlTGVhdmUoc2FzaCkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5vcnRob2dvbmFsRW5kU2FzaERpc3Bvc2FibGVzLmFkZChzYXNoLm9uRGlkRW5hYmxlbWVudENoYW5nZS5ldmVudChvbkNoYW5nZSwgdGhpcykpO1xuXHRcdFx0b25DaGFuZ2Uoc2FzaC5zdGF0ZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb3J0aG9nb25hbEVuZFNhc2ggPSBzYXNoO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZSBhIG5ldyB2ZXJ0aWNhbCBzYXNoLlxuXHQgKlxuXHQgKiBAcGFyYW0gY29udGFpbmVyIEEgRE9NIG5vZGUgdG8gYXBwZW5kIHRoZSBzYXNoIHRvLlxuXHQgKiBAcGFyYW0gdmVydGljYWxMYXlvdXRQcm92aWRlciBBIHZlcnRpY2FsIGxheW91dCBwcm92aWRlci5cblx0ICogQHBhcmFtIG9wdGlvbnMgVGhlIG9wdGlvbnMuXG5cdCAqL1xuXHRjb25zdHJ1Y3Rvcihjb250YWluZXI6IEhUTUxFbGVtZW50LCB2ZXJ0aWNhbExheW91dFByb3ZpZGVyOiBJVmVydGljYWxTYXNoTGF5b3V0UHJvdmlkZXIsIG9wdGlvbnM6IElWZXJ0aWNhbFNhc2hPcHRpb25zKTtcblxuXHQvKipcblx0ICogQ3JlYXRlIGEgbmV3IGhvcml6b250YWwgc2FzaC5cblx0ICpcblx0ICogQHBhcmFtIGNvbnRhaW5lciBBIERPTSBub2RlIHRvIGFwcGVuZCB0aGUgc2FzaCB0by5cblx0ICogQHBhcmFtIGhvcml6b250YWxMYXlvdXRQcm92aWRlciBBIGhvcml6b250YWwgbGF5b3V0IHByb3ZpZGVyLlxuXHQgKiBAcGFyYW0gb3B0aW9ucyBUaGUgb3B0aW9ucy5cblx0ICovXG5cdGNvbnN0cnVjdG9yKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGhvcml6b250YWxMYXlvdXRQcm92aWRlcjogSUhvcml6b250YWxTYXNoTGF5b3V0UHJvdmlkZXIsIG9wdGlvbnM6IElIb3Jpem9udGFsU2FzaE9wdGlvbnMpO1xuXHRjb25zdHJ1Y3Rvcihjb250YWluZXI6IEhUTUxFbGVtZW50LCBsYXlvdXRQcm92aWRlcjogSVNhc2hMYXlvdXRQcm92aWRlciwgb3B0aW9uczogSVNhc2hPcHRpb25zKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZWwgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcubW9uYWNvLXNhc2gnKSk7XG5cblx0XHRpZiAob3B0aW9ucy5vcnRob2dvbmFsRWRnZSkge1xuXHRcdFx0dGhpcy5lbC5jbGFzc0xpc3QuYWRkKGBvcnRob2dvbmFsLWVkZ2UtJHtvcHRpb25zLm9ydGhvZ29uYWxFZGdlfWApO1xuXHRcdH1cblxuXHRcdGlmIChpc01hY2ludG9zaCkge1xuXHRcdFx0dGhpcy5lbC5jbGFzc0xpc3QuYWRkKCdtYWMnKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbCwgJ21vdXNlZG93bicsIGUgPT4gdGhpcy5vblBvaW50ZXJTdGFydChlLCBuZXcgTW91c2VFdmVudEZhY3RvcnkoY29udGFpbmVyKSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbCwgJ2RibGNsaWNrJywgZSA9PiB0aGlzLm9uUG9pbnRlckRvdWJsZVByZXNzKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWwsICdtb3VzZWVudGVyJywgKCkgPT4gU2FzaC5vbk1vdXNlRW50ZXIodGhpcykpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbCwgJ21vdXNlbGVhdmUnLCAoKSA9PiBTYXNoLm9uTW91c2VMZWF2ZSh0aGlzKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoR2VzdHVyZS5hZGRUYXJnZXQodGhpcy5lbCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWwsIEV2ZW50VHlwZS5TdGFydCwgZSA9PiB0aGlzLm9uUG9pbnRlclN0YXJ0KGUsIG5ldyBHZXN0dXJlRXZlbnRGYWN0b3J5KHRoaXMuZWwpKSkpO1xuXG5cdFx0bGV0IGRvdWJsZVRhcFRpbWVvdXQ6IFRpbWVvdXQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWwsIEV2ZW50VHlwZS5UYXAsIGV2ZW50ID0+IHtcblx0XHRcdGlmIChkb3VibGVUYXBUaW1lb3V0KSB7XG5cdFx0XHRcdGNsZWFyVGltZW91dChkb3VibGVUYXBUaW1lb3V0KTtcblx0XHRcdFx0ZG91YmxlVGFwVGltZW91dCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5vblBvaW50ZXJEb3VibGVQcmVzcyhldmVudCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y2xlYXJUaW1lb3V0KGRvdWJsZVRhcFRpbWVvdXQpO1xuXHRcdFx0ZG91YmxlVGFwVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4gZG91YmxlVGFwVGltZW91dCA9IHVuZGVmaW5lZCwgMjUwKTtcblx0XHR9KSk7XG5cblx0XHRpZiAodHlwZW9mIG9wdGlvbnMuc2l6ZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdHRoaXMuc2l6ZSA9IG9wdGlvbnMuc2l6ZTtcblxuXHRcdFx0aWYgKG9wdGlvbnMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMKSB7XG5cdFx0XHRcdHRoaXMuZWwuc3R5bGUud2lkdGggPSBgJHt0aGlzLnNpemV9cHhgO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5lbC5zdHlsZS5oZWlnaHQgPSBgJHt0aGlzLnNpemV9cHhgO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnNpemUgPSBnbG9iYWxTaXplO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIob25EaWRDaGFuZ2VHbG9iYWxTaXplLmV2ZW50KHNpemUgPT4ge1xuXHRcdFx0XHR0aGlzLnNpemUgPSBzaXplO1xuXHRcdFx0XHR0aGlzLmxheW91dCgpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG9uRGlkQ2hhbmdlSG92ZXJEZWxheS5ldmVudChkZWxheSA9PiB0aGlzLmhvdmVyRGVsYXkgPSBkZWxheSkpO1xuXG5cdFx0dGhpcy5sYXlvdXRQcm92aWRlciA9IGxheW91dFByb3ZpZGVyO1xuXG5cdFx0dGhpcy5vcnRob2dvbmFsU3RhcnRTYXNoID0gb3B0aW9ucy5vcnRob2dvbmFsU3RhcnRTYXNoO1xuXHRcdHRoaXMub3J0aG9nb25hbEVuZFNhc2ggPSBvcHRpb25zLm9ydGhvZ29uYWxFbmRTYXNoO1xuXG5cdFx0dGhpcy5vcmllbnRhdGlvbiA9IG9wdGlvbnMub3JpZW50YXRpb24gfHwgT3JpZW50YXRpb24uVkVSVElDQUw7XG5cblx0XHRpZiAodGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCkge1xuXHRcdFx0dGhpcy5lbC5jbGFzc0xpc3QuYWRkKCdob3Jpem9udGFsJyk7XG5cdFx0XHR0aGlzLmVsLmNsYXNzTGlzdC5yZW1vdmUoJ3ZlcnRpY2FsJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZWwuY2xhc3NMaXN0LnJlbW92ZSgnaG9yaXpvbnRhbCcpO1xuXHRcdFx0dGhpcy5lbC5jbGFzc0xpc3QuYWRkKCd2ZXJ0aWNhbCcpO1xuXHRcdH1cblxuXHRcdHRoaXMuZWwuY2xhc3NMaXN0LnRvZ2dsZSgnZGVidWcnLCBERUJVRyk7XG5cblx0XHR0aGlzLmxheW91dCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBvblBvaW50ZXJTdGFydChldmVudDogUG9pbnRlckV2ZW50LCBwb2ludGVyRXZlbnRGYWN0b3J5OiBJUG9pbnRlckV2ZW50RmFjdG9yeSk6IHZvaWQge1xuXHRcdEV2ZW50SGVscGVyLnN0b3AoZXZlbnQpO1xuXG5cdFx0bGV0IGlzTXVsdGlzYXNoUmVzaXplID0gZmFsc2U7XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRpZiAoIShldmVudCBhcyBhbnkpLl9fb3J0aG9nb25hbFNhc2hFdmVudCkge1xuXHRcdFx0Y29uc3Qgb3J0aG9nb25hbFNhc2ggPSB0aGlzLmdldE9ydGhvZ29uYWxTYXNoKGV2ZW50KTtcblxuXHRcdFx0aWYgKG9ydGhvZ29uYWxTYXNoKSB7XG5cdFx0XHRcdGlzTXVsdGlzYXNoUmVzaXplID0gdHJ1ZTtcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdChldmVudCBhcyBhbnkpLl9fb3J0aG9nb25hbFNhc2hFdmVudCA9IHRydWU7XG5cdFx0XHRcdG9ydGhvZ29uYWxTYXNoLm9uUG9pbnRlclN0YXJ0KGV2ZW50LCBuZXcgT3J0aG9nb25hbFBvaW50ZXJFdmVudEZhY3RvcnkocG9pbnRlckV2ZW50RmFjdG9yeSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGlmICh0aGlzLmxpbmtlZFNhc2ggJiYgIShldmVudCBhcyBhbnkpLl9fbGlua2VkU2FzaEV2ZW50KSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdChldmVudCBhcyBhbnkpLl9fbGlua2VkU2FzaEV2ZW50ID0gdHJ1ZTtcblx0XHRcdHRoaXMubGlua2VkU2FzaC5vblBvaW50ZXJTdGFydChldmVudCwgbmV3IE9ydGhvZ29uYWxQb2ludGVyRXZlbnRGYWN0b3J5KHBvaW50ZXJFdmVudEZhY3RvcnkpKTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuc3RhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBpZnJhbWVzID0gdGhpcy5lbC5vd25lckRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdpZnJhbWUnKTtcblx0XHRmb3IgKGNvbnN0IGlmcmFtZSBvZiBpZnJhbWVzKSB7XG5cdFx0XHRpZnJhbWUuY2xhc3NMaXN0LmFkZChQb2ludGVyRXZlbnRzRGlzYWJsZWRDc3NDbGFzcyk7IC8vIGRpc2FibGUgbW91c2UgZXZlbnRzIG9uIGlmcmFtZXMgYXMgbG9uZyBhcyB3ZSBkcmFnIHRoZSBzYXNoXG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhcnRYID0gZXZlbnQucGFnZVg7XG5cdFx0Y29uc3Qgc3RhcnRZID0gZXZlbnQucGFnZVk7XG5cdFx0Y29uc3QgYWx0S2V5ID0gZXZlbnQuYWx0S2V5O1xuXHRcdGNvbnN0IHN0YXJ0RXZlbnQ6IElTYXNoRXZlbnQgPSB7IHN0YXJ0WCwgY3VycmVudFg6IHN0YXJ0WCwgc3RhcnRZLCBjdXJyZW50WTogc3RhcnRZLCBhbHRLZXkgfTtcblxuXHRcdHRoaXMuZWwuY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG5cdFx0dGhpcy5fb25EaWRTdGFydC5maXJlKHN0YXJ0RXZlbnQpO1xuXG5cdFx0Ly8gZml4IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMTY3NVxuXHRcdGNvbnN0IHN0eWxlID0gY3JlYXRlU3R5bGVTaGVldCh0aGlzLmVsKTtcblx0XHRjb25zdCB1cGRhdGVTdHlsZSA9ICgpID0+IHtcblx0XHRcdGxldCBjdXJzb3IgPSAnJztcblxuXHRcdFx0aWYgKGlzTXVsdGlzYXNoUmVzaXplKSB7XG5cdFx0XHRcdGN1cnNvciA9ICdhbGwtc2Nyb2xsJztcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCkge1xuXHRcdFx0XHRpZiAodGhpcy5zdGF0ZSA9PT0gU2FzaFN0YXRlLkF0TWluaW11bSkge1xuXHRcdFx0XHRcdGN1cnNvciA9ICdzLXJlc2l6ZSc7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5zdGF0ZSA9PT0gU2FzaFN0YXRlLkF0TWF4aW11bSkge1xuXHRcdFx0XHRcdGN1cnNvciA9ICduLXJlc2l6ZSc7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y3Vyc29yID0gaXNNYWNpbnRvc2ggPyAncm93LXJlc2l6ZScgOiAnbnMtcmVzaXplJztcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKHRoaXMuc3RhdGUgPT09IFNhc2hTdGF0ZS5BdE1pbmltdW0pIHtcblx0XHRcdFx0XHRjdXJzb3IgPSAnZS1yZXNpemUnO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuc3RhdGUgPT09IFNhc2hTdGF0ZS5BdE1heGltdW0pIHtcblx0XHRcdFx0XHRjdXJzb3IgPSAndy1yZXNpemUnO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGN1cnNvciA9IGlzTWFjaW50b3NoID8gJ2NvbC1yZXNpemUnIDogJ2V3LXJlc2l6ZSc7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0c3R5bGUudGV4dENvbnRlbnQgPSBgKiB7IGN1cnNvcjogJHtjdXJzb3J9ICFpbXBvcnRhbnQ7IH1gO1xuXHRcdH07XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdHVwZGF0ZVN0eWxlKCk7XG5cblx0XHRpZiAoIWlzTXVsdGlzYXNoUmVzaXplKSB7XG5cdFx0XHR0aGlzLm9uRGlkRW5hYmxlbWVudENoYW5nZS5ldmVudCh1cGRhdGVTdHlsZSwgbnVsbCwgZGlzcG9zYWJsZXMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9uUG9pbnRlck1vdmUgPSAoZTogUG9pbnRlckV2ZW50KSA9PiB7XG5cdFx0XHRFdmVudEhlbHBlci5zdG9wKGUsIGZhbHNlKTtcblx0XHRcdGNvbnN0IGV2ZW50OiBJU2FzaEV2ZW50ID0geyBzdGFydFgsIGN1cnJlbnRYOiBlLnBhZ2VYLCBzdGFydFksIGN1cnJlbnRZOiBlLnBhZ2VZLCBhbHRLZXkgfTtcblxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShldmVudCk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IG9uUG9pbnRlclVwID0gKGU6IFBvaW50ZXJFdmVudCkgPT4ge1xuXHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCBmYWxzZSk7XG5cblx0XHRcdHN0eWxlLnJlbW92ZSgpO1xuXG5cdFx0XHR0aGlzLmVsLmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpO1xuXHRcdFx0dGhpcy5fb25EaWRFbmQuZmlyZSgpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cblx0XHRcdGZvciAoY29uc3QgaWZyYW1lIG9mIGlmcmFtZXMpIHtcblx0XHRcdFx0aWZyYW1lLmNsYXNzTGlzdC5yZW1vdmUoUG9pbnRlckV2ZW50c0Rpc2FibGVkQ3NzQ2xhc3MpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRwb2ludGVyRXZlbnRGYWN0b3J5Lm9uUG9pbnRlck1vdmUob25Qb2ludGVyTW92ZSwgbnVsbCwgZGlzcG9zYWJsZXMpO1xuXHRcdHBvaW50ZXJFdmVudEZhY3Rvcnkub25Qb2ludGVyVXAob25Qb2ludGVyVXAsIG51bGwsIGRpc3Bvc2FibGVzKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocG9pbnRlckV2ZW50RmFjdG9yeSk7XG5cdH1cblxuXHRwcml2YXRlIG9uUG9pbnRlckRvdWJsZVByZXNzKGU6IE1vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCBvcnRob2dvbmFsU2FzaCA9IHRoaXMuZ2V0T3J0aG9nb25hbFNhc2goZSk7XG5cblx0XHRpZiAob3J0aG9nb25hbFNhc2gpIHtcblx0XHRcdG9ydGhvZ29uYWxTYXNoLl9vbkRpZFJlc2V0LmZpcmUoKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5saW5rZWRTYXNoKSB7XG5cdFx0XHR0aGlzLmxpbmtlZFNhc2guX29uRGlkUmVzZXQuZmlyZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkUmVzZXQuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgb25Nb3VzZUVudGVyKHNhc2g6IFNhc2gsIGZyb21MaW5rZWRTYXNoOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHRpZiAoc2FzaC5lbC5jbGFzc0xpc3QuY29udGFpbnMoJ2FjdGl2ZScpKSB7XG5cdFx0XHRzYXNoLmhvdmVyRGVsYXllci5jYW5jZWwoKTtcblx0XHRcdHNhc2guZWwuY2xhc3NMaXN0LmFkZCgnaG92ZXInKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c2FzaC5ob3ZlckRlbGF5ZXIudHJpZ2dlcigoKSA9PiBzYXNoLmVsLmNsYXNzTGlzdC5hZGQoJ2hvdmVyJyksIHNhc2guaG92ZXJEZWxheSkudGhlbih1bmRlZmluZWQsICgpID0+IHsgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFmcm9tTGlua2VkU2FzaCAmJiBzYXNoLmxpbmtlZFNhc2gpIHtcblx0XHRcdFNhc2gub25Nb3VzZUVudGVyKHNhc2gubGlua2VkU2FzaCwgdHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgb25Nb3VzZUxlYXZlKHNhc2g6IFNhc2gsIGZyb21MaW5rZWRTYXNoOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHRzYXNoLmhvdmVyRGVsYXllci5jYW5jZWwoKTtcblx0XHRzYXNoLmVsLmNsYXNzTGlzdC5yZW1vdmUoJ2hvdmVyJyk7XG5cblx0XHRpZiAoIWZyb21MaW5rZWRTYXNoICYmIHNhc2gubGlua2VkU2FzaCkge1xuXHRcdFx0U2FzaC5vbk1vdXNlTGVhdmUoc2FzaC5saW5rZWRTYXNoLCB0cnVlKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRm9yY2VmdWxseSBzdG9wIGFueSB1c2VyIGludGVyYWN0aW9ucyB3aXRoIHRoaXMgc2FzaC5cblx0ICogVXNlZnVsIHdoZW4gaGlkaW5nIGEgcGFyZW50IGNvbXBvbmVudCwgd2hpbGUgdGhlIHVzZXIgaXMgc3RpbGxcblx0ICogaW50ZXJhY3Rpbmcgd2l0aCB0aGUgc2FzaC5cblx0ICovXG5cdGNsZWFyU2FzaEhvdmVyU3RhdGUoKTogdm9pZCB7XG5cdFx0U2FzaC5vbk1vdXNlTGVhdmUodGhpcyk7XG5cdH1cblxuXHQvKipcblx0ICogTGF5b3V0IHRoZSBzYXNoLiBUaGUgc2FzaCB3aWxsIHNpemUgYW5kIHBvc2l0aW9uIGl0c2VsZlxuXHQgKiBiYXNlZCBvbiBpdHMgcHJvdmlkZWQge0BsaW5rIElTYXNoTGF5b3V0UHJvdmlkZXIgbGF5b3V0IHByb3ZpZGVyfS5cblx0ICovXG5cdGxheW91dCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uVkVSVElDQUwpIHtcblx0XHRcdGNvbnN0IHZlcnRpY2FsUHJvdmlkZXIgPSAoPElWZXJ0aWNhbFNhc2hMYXlvdXRQcm92aWRlcj50aGlzLmxheW91dFByb3ZpZGVyKTtcblx0XHRcdHRoaXMuZWwuc3R5bGUubGVmdCA9IHZlcnRpY2FsUHJvdmlkZXIuZ2V0VmVydGljYWxTYXNoTGVmdCh0aGlzKSAtICh0aGlzLnNpemUgLyAyKSArICdweCc7XG5cblx0XHRcdGlmICh2ZXJ0aWNhbFByb3ZpZGVyLmdldFZlcnRpY2FsU2FzaFRvcCkge1xuXHRcdFx0XHR0aGlzLmVsLnN0eWxlLnRvcCA9IHZlcnRpY2FsUHJvdmlkZXIuZ2V0VmVydGljYWxTYXNoVG9wKHRoaXMpICsgJ3B4Jztcblx0XHRcdH1cblxuXHRcdFx0aWYgKHZlcnRpY2FsUHJvdmlkZXIuZ2V0VmVydGljYWxTYXNoSGVpZ2h0KSB7XG5cdFx0XHRcdHRoaXMuZWwuc3R5bGUuaGVpZ2h0ID0gdmVydGljYWxQcm92aWRlci5nZXRWZXJ0aWNhbFNhc2hIZWlnaHQodGhpcykgKyAncHgnO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBob3Jpem9udGFsUHJvdmlkZXIgPSAoPElIb3Jpem9udGFsU2FzaExheW91dFByb3ZpZGVyPnRoaXMubGF5b3V0UHJvdmlkZXIpO1xuXHRcdFx0dGhpcy5lbC5zdHlsZS50b3AgPSBob3Jpem9udGFsUHJvdmlkZXIuZ2V0SG9yaXpvbnRhbFNhc2hUb3AodGhpcykgLSAodGhpcy5zaXplIC8gMikgKyAncHgnO1xuXG5cdFx0XHRpZiAoaG9yaXpvbnRhbFByb3ZpZGVyLmdldEhvcml6b250YWxTYXNoTGVmdCkge1xuXHRcdFx0XHR0aGlzLmVsLnN0eWxlLmxlZnQgPSBob3Jpem9udGFsUHJvdmlkZXIuZ2V0SG9yaXpvbnRhbFNhc2hMZWZ0KHRoaXMpICsgJ3B4Jztcblx0XHRcdH1cblxuXHRcdFx0aWYgKGhvcml6b250YWxQcm92aWRlci5nZXRIb3Jpem9udGFsU2FzaFdpZHRoKSB7XG5cdFx0XHRcdHRoaXMuZWwuc3R5bGUud2lkdGggPSBob3Jpem9udGFsUHJvdmlkZXIuZ2V0SG9yaXpvbnRhbFNhc2hXaWR0aCh0aGlzKSArICdweCc7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRPcnRob2dvbmFsU2FzaChlOiBQb2ludGVyRXZlbnQpOiBTYXNoIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB0YXJnZXQgPSBlLmluaXRpYWxUYXJnZXQgPz8gZS50YXJnZXQ7XG5cblx0XHRpZiAoIXRhcmdldCB8fCAhKGlzSFRNTEVsZW1lbnQodGFyZ2V0KSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ29ydGhvZ29uYWwtZHJhZy1oYW5kbGUnKSkge1xuXHRcdFx0cmV0dXJuIHRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ3N0YXJ0JykgPyB0aGlzLm9ydGhvZ29uYWxTdGFydFNhc2ggOiB0aGlzLm9ydGhvZ29uYWxFbmRTYXNoO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmVsLnJlbW92ZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7O0FBS0EsU0FBUyxHQUFHLHVCQUF1QixRQUFRLGFBQXdCLFdBQVcscUJBQXFCO0FBQ25HLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsV0FBVyxlQUFlO0FBQ25DLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVksaUJBQThCLG9CQUFvQjtBQUN2RSxTQUFTLG1CQUFtQjtBQUM1QixPQUFPO0FBTVAsTUFBTSxRQUFRO0FBK0JQLElBQUssaUJBQUwsa0JBQUtBLG9CQUFMO0FBQ04sRUFBQUEsZ0JBQUEsV0FBUTtBQUNSLEVBQUFBLGdCQUFBLFdBQVE7QUFDUixFQUFBQSxnQkFBQSxVQUFPO0FBQ1AsRUFBQUEsZ0JBQUEsVUFBTztBQUpJLFNBQUFBO0FBQUEsR0FBQTtBQTZETCxJQUFXLGNBQVgsa0JBQVdDLGlCQUFYO0FBQ04sRUFBQUEsMEJBQUE7QUFDQSxFQUFBQSwwQkFBQTtBQUZpQixTQUFBQTtBQUFBLEdBQUE7QUFLWCxJQUFXLFlBQVgsa0JBQVdDLGVBQVg7QUFLTixFQUFBQSxzQkFBQTtBQVFBLEVBQUFBLHNCQUFBO0FBUUEsRUFBQUEsc0JBQUE7QUFLQSxFQUFBQSxzQkFBQTtBQTFCaUIsU0FB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QUssR0FBRyxNQUFNLFFBQVEsbUJBQW1CLHVCQUF1QixJQUFJLElBQUk7QUFBQSxNQUN6RTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxrQkFBa0IsR0FBbUM7QUFDNUQsVUFBTSxTQUFTLEVBQUUsaUJBQWlCLEVBQUU7QUFFcEMsUUFBSSxDQUFDLFVBQVUsQ0FBRSxjQUFjLE1BQU0sR0FBSTtBQUN4QyxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksT0FBTyxVQUFVLFNBQVMsd0JBQXdCLEdBQUc7QUFDeEQsYUFBTyxPQUFPLFVBQVUsU0FBUyxPQUFPLElBQUksS0FBSyxzQkFBc0IsS0FBSztBQUFBLElBQzdFO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLFVBQU0sUUFBUTtBQUNkLFNBQUssR0FBRyxPQUFPO0FBQUEsRUFDaEI7QUFDRDsiLAogICJuYW1lcyI6IFsiT3J0aG9nb25hbEVkZ2UiLCAiT3JpZW50YXRpb24iLCAiU2FzaFN0YXRlIiwgImV2ZW50Il0KfQo=
