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
import * as DomUtils from "./dom.js";
import { mainWindow } from "./window.js";
import { memoize } from "../common/decorators.js";
import { Event as EventUtils } from "../common/event.js";
import { Disposable, markAsSingleton, toDisposable } from "../common/lifecycle.js";
import { LinkedList } from "../common/linkedList.js";
var EventType;
((EventType2) => {
  EventType2.Tap = "-monaco-gesturetap";
  EventType2.Change = "-monaco-gesturechange";
  EventType2.Start = "-monaco-gesturestart";
  EventType2.End = "-monaco-gesturesend";
  EventType2.Contextmenu = "-monaco-gesturecontextmenu";
})(EventType || (EventType = {}));
const _Gesture = class _Gesture extends Disposable {
  // ms
  constructor() {
    super();
    this.dispatched = false;
    this.targets = new LinkedList();
    this.ignoreTargets = new LinkedList();
    this.activeTouches = {};
    this.handle = null;
    this._lastSetTapCountTime = 0;
    this._register(EventUtils.runAndSubscribe(DomUtils.onDidRegisterWindow, ({ window, disposables }) => {
      disposables.add(DomUtils.addDisposableListener(window.document, "touchstart", (e) => this.onTouchStart(e), { passive: false }));
      disposables.add(DomUtils.addDisposableListener(window.document, "touchend", (e) => this.onTouchEnd(window, e)));
      disposables.add(DomUtils.addDisposableListener(window.document, "touchmove", (e) => this.onTouchMove(e), { passive: false }));
    }, { window: mainWindow, disposables: this._store }));
  }
  static addTarget(element) {
    if (!_Gesture.isTouchDevice()) {
      return Disposable.None;
    }
    if (!_Gesture.INSTANCE) {
      _Gesture.INSTANCE = markAsSingleton(new _Gesture());
    }
    const remove = _Gesture.INSTANCE.targets.push(element);
    return toDisposable(remove);
  }
  static ignoreTarget(element) {
    if (!_Gesture.isTouchDevice()) {
      return Disposable.None;
    }
    if (!_Gesture.INSTANCE) {
      _Gesture.INSTANCE = markAsSingleton(new _Gesture());
    }
    const remove = _Gesture.INSTANCE.ignoreTargets.push(element);
    return toDisposable(remove);
  }
  static isTouchDevice() {
    return "ontouchstart" in mainWindow || navigator.maxTouchPoints > 0;
  }
  static isHoverDevice() {
    return mainWindow.matchMedia("(hover: hover)").matches;
  }
  dispose() {
    if (this.handle) {
      this.handle.dispose();
      this.handle = null;
    }
    super.dispose();
  }
  onTouchStart(e) {
    const timestamp = Date.now();
    if (this.handle) {
      this.handle.dispose();
      this.handle = null;
    }
    for (let i = 0, len = e.targetTouches.length; i < len; i++) {
      const touch = e.targetTouches.item(i);
      this.activeTouches[touch.identifier] = {
        id: touch.identifier,
        initialTarget: touch.target,
        initialTimeStamp: timestamp,
        initialPageX: touch.pageX,
        initialPageY: touch.pageY,
        rollingTimestamps: [timestamp],
        rollingPageX: [touch.pageX],
        rollingPageY: [touch.pageY]
      };
      const evt = this.newGestureEvent(EventType.Start, touch.target);
      evt.pageX = touch.pageX;
      evt.pageY = touch.pageY;
      this.dispatchEvent(evt);
    }
    if (this.dispatched) {
      e.preventDefault();
      e.stopPropagation();
      this.dispatched = false;
    }
  }
  onTouchEnd(targetWindow, e) {
    const timestamp = Date.now();
    const activeTouchCount = Object.keys(this.activeTouches).length;
    for (let i = 0, len = e.changedTouches.length; i < len; i++) {
      const touch = e.changedTouches.item(i);
      if (!this.activeTouches.hasOwnProperty(String(touch.identifier))) {
        console.warn("move of an UNKNOWN touch", touch);
        continue;
      }
      const data = this.activeTouches[touch.identifier], holdTime = Date.now() - data.initialTimeStamp;
      if (holdTime < _Gesture.HOLD_DELAY && Math.abs(data.initialPageX - data.rollingPageX.at(-1)) < 30 && Math.abs(data.initialPageY - data.rollingPageY.at(-1)) < 30) {
        const evt = this.newGestureEvent(EventType.Tap, data.initialTarget);
        evt.pageX = data.rollingPageX.at(-1);
        evt.pageY = data.rollingPageY.at(-1);
        this.dispatchEvent(evt);
      } else if (holdTime >= _Gesture.HOLD_DELAY && Math.abs(data.initialPageX - data.rollingPageX.at(-1)) < 30 && Math.abs(data.initialPageY - data.rollingPageY.at(-1)) < 30) {
        const evt = this.newGestureEvent(EventType.Contextmenu, data.initialTarget);
        evt.pageX = data.rollingPageX.at(-1);
        evt.pageY = data.rollingPageY.at(-1);
        this.dispatchEvent(evt);
      } else if (activeTouchCount === 1) {
        const finalX = data.rollingPageX.at(-1);
        const finalY = data.rollingPageY.at(-1);
        const deltaT = data.rollingTimestamps.at(-1) - data.rollingTimestamps[0];
        const deltaX = finalX - data.rollingPageX[0];
        const deltaY = finalY - data.rollingPageY[0];
        const dispatchTo = [...this.targets].filter((t) => data.initialTarget instanceof Node && t.contains(data.initialTarget));
        this.inertia(
          targetWindow,
          dispatchTo,
          timestamp,
          // time now
          Math.abs(deltaX) / deltaT,
          // speed
          deltaX > 0 ? 1 : -1,
          // x direction
          finalX,
          // x now
          Math.abs(deltaY) / deltaT,
          // y speed
          deltaY > 0 ? 1 : -1,
          // y direction
          finalY
          // y now
        );
      }
      this.dispatchEvent(this.newGestureEvent(EventType.End, data.initialTarget));
      delete this.activeTouches[touch.identifier];
    }
    if (this.dispatched) {
      e.preventDefault();
      e.stopPropagation();
      this.dispatched = false;
    }
  }
  newGestureEvent(type, initialTarget) {
    const event = document.createEvent("CustomEvent");
    event.initEvent(type, false, true);
    event.initialTarget = initialTarget;
    event.tapCount = 0;
    return event;
  }
  dispatchEvent(event) {
    if (event.type === EventType.Tap) {
      const currentTime = (/* @__PURE__ */ new Date()).getTime();
      let setTapCount = 0;
      if (currentTime - this._lastSetTapCountTime > _Gesture.CLEAR_TAP_COUNT_TIME) {
        setTapCount = 1;
      } else {
        setTapCount = 2;
      }
      this._lastSetTapCountTime = currentTime;
      event.tapCount = setTapCount;
    } else if (event.type === EventType.Change || event.type === EventType.Contextmenu) {
      this._lastSetTapCountTime = 0;
    }
    if (event.initialTarget instanceof Node) {
      for (const ignoreTarget of this.ignoreTargets) {
        if (ignoreTarget.contains(event.initialTarget)) {
          return;
        }
      }
      const targets = [];
      for (const target of this.targets) {
        if (target.contains(event.initialTarget)) {
          let depth = 0;
          let now = event.initialTarget;
          while (now && now !== target) {
            depth++;
            now = now.parentElement;
          }
          targets.push([depth, target]);
        }
      }
      targets.sort((a, b) => a[0] - b[0]);
      for (const [_, target] of targets) {
        target.dispatchEvent(event);
        this.dispatched = true;
      }
    }
  }
  inertia(targetWindow, dispatchTo, t1, vX, dirX, x, vY, dirY, y) {
    this.handle = DomUtils.scheduleAtNextAnimationFrame(targetWindow, () => {
      const now = Date.now();
      const deltaT = now - t1;
      let delta_pos_x = 0, delta_pos_y = 0;
      let stopped = true;
      vX += _Gesture.SCROLL_FRICTION * deltaT;
      vY += _Gesture.SCROLL_FRICTION * deltaT;
      if (vX > 0) {
        stopped = false;
        delta_pos_x = dirX * vX * deltaT;
      }
      if (vY > 0) {
        stopped = false;
        delta_pos_y = dirY * vY * deltaT;
      }
      const evt = this.newGestureEvent(EventType.Change);
      evt.translationX = delta_pos_x;
      evt.translationY = delta_pos_y;
      dispatchTo.forEach((d) => d.dispatchEvent(evt));
      if (!stopped) {
        this.inertia(targetWindow, dispatchTo, now, vX, dirX, x + delta_pos_x, vY, dirY, y + delta_pos_y);
      }
    });
  }
  onTouchMove(e) {
    const timestamp = Date.now();
    for (let i = 0, len = e.changedTouches.length; i < len; i++) {
      const touch = e.changedTouches.item(i);
      if (!this.activeTouches.hasOwnProperty(String(touch.identifier))) {
        console.warn("end of an UNKNOWN touch", touch);
        continue;
      }
      const data = this.activeTouches[touch.identifier];
      const evt = this.newGestureEvent(EventType.Change, data.initialTarget);
      evt.translationX = touch.pageX - data.rollingPageX.at(-1);
      evt.translationY = touch.pageY - data.rollingPageY.at(-1);
      evt.pageX = touch.pageX;
      evt.pageY = touch.pageY;
      this.dispatchEvent(evt);
      if (data.rollingPageX.length > 3) {
        data.rollingPageX.shift();
        data.rollingPageY.shift();
        data.rollingTimestamps.shift();
      }
      data.rollingPageX.push(touch.pageX);
      data.rollingPageY.push(touch.pageY);
      data.rollingTimestamps.push(timestamp);
    }
    if (this.dispatched) {
      e.preventDefault();
      e.stopPropagation();
      this.dispatched = false;
    }
  }
};
_Gesture.SCROLL_FRICTION = -5e-3;
_Gesture.HOLD_DELAY = 700;
_Gesture.CLEAR_TAP_COUNT_TIME = 400;
__decorateClass([
  memoize
], _Gesture, "isTouchDevice", 1);
__decorateClass([
  memoize
], _Gesture, "isHoverDevice", 1);
let Gesture = _Gesture;
export {
  EventType,
  Gesture
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFx0b3VjaC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIERvbVV0aWxzIGZyb20gJy4vZG9tLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBtZW1vaXplIH0gZnJvbSAnLi4vY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgYXMgRXZlbnRVdGlscyB9IGZyb20gJy4uL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgbWFya0FzU2luZ2xldG9uLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IExpbmtlZExpc3QgfSBmcm9tICcuLi9jb21tb24vbGlua2VkTGlzdC5qcyc7XG5cbmV4cG9ydCBuYW1lc3BhY2UgRXZlbnRUeXBlIHtcblx0ZXhwb3J0IGNvbnN0IFRhcCA9ICctbW9uYWNvLWdlc3R1cmV0YXAnO1xuXHRleHBvcnQgY29uc3QgQ2hhbmdlID0gJy1tb25hY28tZ2VzdHVyZWNoYW5nZSc7XG5cdGV4cG9ydCBjb25zdCBTdGFydCA9ICctbW9uYWNvLWdlc3R1cmVzdGFydCc7XG5cdGV4cG9ydCBjb25zdCBFbmQgPSAnLW1vbmFjby1nZXN0dXJlc2VuZCc7XG5cdGV4cG9ydCBjb25zdCBDb250ZXh0bWVudSA9ICctbW9uYWNvLWdlc3R1cmVjb250ZXh0bWVudSc7XG59XG5cbmludGVyZmFjZSBUb3VjaERhdGEge1xuXHRpZDogbnVtYmVyO1xuXHRpbml0aWFsVGFyZ2V0OiBFdmVudFRhcmdldDtcblx0aW5pdGlhbFRpbWVTdGFtcDogbnVtYmVyO1xuXHRpbml0aWFsUGFnZVg6IG51bWJlcjtcblx0aW5pdGlhbFBhZ2VZOiBudW1iZXI7XG5cdHJvbGxpbmdUaW1lc3RhbXBzOiBudW1iZXJbXTtcblx0cm9sbGluZ1BhZ2VYOiBudW1iZXJbXTtcblx0cm9sbGluZ1BhZ2VZOiBudW1iZXJbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBHZXN0dXJlRXZlbnQgZXh0ZW5kcyBNb3VzZUV2ZW50IHtcblx0aW5pdGlhbFRhcmdldDogRXZlbnRUYXJnZXQgfCB1bmRlZmluZWQ7XG5cdHRyYW5zbGF0aW9uWDogbnVtYmVyO1xuXHR0cmFuc2xhdGlvblk6IG51bWJlcjtcblx0cGFnZVg6IG51bWJlcjtcblx0cGFnZVk6IG51bWJlcjtcblx0dGFwQ291bnQ6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFRvdWNoIHtcblx0aWRlbnRpZmllcjogbnVtYmVyO1xuXHRzY3JlZW5YOiBudW1iZXI7XG5cdHNjcmVlblk6IG51bWJlcjtcblx0Y2xpZW50WDogbnVtYmVyO1xuXHRjbGllbnRZOiBudW1iZXI7XG5cdHBhZ2VYOiBudW1iZXI7XG5cdHBhZ2VZOiBudW1iZXI7XG5cdHJhZGl1c1g6IG51bWJlcjtcblx0cmFkaXVzWTogbnVtYmVyO1xuXHRyb3RhdGlvbkFuZ2xlOiBudW1iZXI7XG5cdGZvcmNlOiBudW1iZXI7XG5cdHRhcmdldDogRWxlbWVudDtcbn1cblxuaW50ZXJmYWNlIFRvdWNoTGlzdCB7XG5cdFtpOiBudW1iZXJdOiBUb3VjaDtcblx0bGVuZ3RoOiBudW1iZXI7XG5cdGl0ZW0oaW5kZXg6IG51bWJlcik6IFRvdWNoO1xuXHRpZGVudGlmaWVkVG91Y2goaWQ6IG51bWJlcik6IFRvdWNoO1xufVxuXG5pbnRlcmZhY2UgVG91Y2hFdmVudCBleHRlbmRzIEV2ZW50IHtcblx0dG91Y2hlczogVG91Y2hMaXN0O1xuXHR0YXJnZXRUb3VjaGVzOiBUb3VjaExpc3Q7XG5cdGNoYW5nZWRUb3VjaGVzOiBUb3VjaExpc3Q7XG59XG5cbmV4cG9ydCBjbGFzcyBHZXN0dXJlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0NST0xMX0ZSSUNUSU9OID0gLTAuMDA1O1xuXHRwcml2YXRlIHN0YXRpYyBJTlNUQU5DRTogR2VzdHVyZTtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSE9MRF9ERUxBWSA9IDcwMDtcblxuXHRwcml2YXRlIGRpc3BhdGNoZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSB0YXJnZXRzID0gbmV3IExpbmtlZExpc3Q8SFRNTEVsZW1lbnQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgaWdub3JlVGFyZ2V0cyA9IG5ldyBMaW5rZWRMaXN0PEhUTUxFbGVtZW50PigpO1xuXHRwcml2YXRlIGhhbmRsZTogSURpc3Bvc2FibGUgfCBudWxsO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgYWN0aXZlVG91Y2hlczogeyBbaWQ6IG51bWJlcl06IFRvdWNoRGF0YSB9O1xuXG5cdHByaXZhdGUgX2xhc3RTZXRUYXBDb3VudFRpbWU6IG51bWJlcjtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBDTEVBUl9UQVBfQ09VTlRfVElNRSA9IDQwMDsgLy8gbXNcblxuXG5cdHByaXZhdGUgY29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuYWN0aXZlVG91Y2hlcyA9IHt9O1xuXHRcdHRoaXMuaGFuZGxlID0gbnVsbDtcblx0XHR0aGlzLl9sYXN0U2V0VGFwQ291bnRUaW1lID0gMDtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50VXRpbHMucnVuQW5kU3Vic2NyaWJlKERvbVV0aWxzLm9uRGlkUmVnaXN0ZXJXaW5kb3csICh7IHdpbmRvdywgZGlzcG9zYWJsZXMgfSkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKERvbVV0aWxzLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih3aW5kb3cuZG9jdW1lbnQsICd0b3VjaHN0YXJ0JywgKGU6IFRvdWNoRXZlbnQpID0+IHRoaXMub25Ub3VjaFN0YXJ0KGUpLCB7IHBhc3NpdmU6IGZhbHNlIH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChEb21VdGlscy5hZGREaXNwb3NhYmxlTGlzdGVuZXIod2luZG93LmRvY3VtZW50LCAndG91Y2hlbmQnLCAoZTogVG91Y2hFdmVudCkgPT4gdGhpcy5vblRvdWNoRW5kKHdpbmRvdywgZSkpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChEb21VdGlscy5hZGREaXNwb3NhYmxlTGlzdGVuZXIod2luZG93LmRvY3VtZW50LCAndG91Y2htb3ZlJywgKGU6IFRvdWNoRXZlbnQpID0+IHRoaXMub25Ub3VjaE1vdmUoZSksIHsgcGFzc2l2ZTogZmFsc2UgfSkpO1xuXHRcdH0sIHsgd2luZG93OiBtYWluV2luZG93LCBkaXNwb3NhYmxlczogdGhpcy5fc3RvcmUgfSkpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBhZGRUYXJnZXQoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0aWYgKCFHZXN0dXJlLmlzVG91Y2hEZXZpY2UoKSkge1xuXHRcdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0XHR9XG5cdFx0aWYgKCFHZXN0dXJlLklOU1RBTkNFKSB7XG5cdFx0XHRHZXN0dXJlLklOU1RBTkNFID0gbWFya0FzU2luZ2xldG9uKG5ldyBHZXN0dXJlKCkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlbW92ZSA9IEdlc3R1cmUuSU5TVEFOQ0UudGFyZ2V0cy5wdXNoKGVsZW1lbnQpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUocmVtb3ZlKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgaWdub3JlVGFyZ2V0KGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogSURpc3Bvc2FibGUge1xuXHRcdGlmICghR2VzdHVyZS5pc1RvdWNoRGV2aWNlKCkpIHtcblx0XHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdFx0fVxuXHRcdGlmICghR2VzdHVyZS5JTlNUQU5DRSkge1xuXHRcdFx0R2VzdHVyZS5JTlNUQU5DRSA9IG1hcmtBc1NpbmdsZXRvbihuZXcgR2VzdHVyZSgpKTtcblx0XHR9XG5cblx0XHRjb25zdCByZW1vdmUgPSBHZXN0dXJlLklOU1RBTkNFLmlnbm9yZVRhcmdldHMucHVzaChlbGVtZW50KTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKHJlbW92ZSk7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgZGV2aWNlIGlzIGFibGUgdG8gcmVwcmVzZW50IHRvdWNoIGV2ZW50cy5cblx0ICovXG5cdEBtZW1vaXplXG5cdHN0YXRpYyBpc1RvdWNoRGV2aWNlKCk6IGJvb2xlYW4ge1xuXHRcdC8vIGAnb250b3VjaHN0YXJ0JyBpbiB3aW5kb3dgIGFsd2F5cyBldmFsdWF0ZXMgdG8gdHJ1ZSB3aXRoIHR5cGVzY3JpcHQncyBtb2Rlcm4gdHlwaW5ncy4gVGhpcyBjYXVzZXMgYHdpbmRvd2AgdG8gYmVcblx0XHQvLyBgbmV2ZXJgIGxhdGVyIGluIGB3aW5kb3cubmF2aWdhdG9yYC4gVGhhdCdzIHdoeSB3ZSBuZWVkIHRoZSBleHBsaWNpdCBgd2luZG93IGFzIFdpbmRvd2AgY2FzdFxuXHRcdHJldHVybiAnb250b3VjaHN0YXJ0JyBpbiBtYWluV2luZG93IHx8IG5hdmlnYXRvci5tYXhUb3VjaFBvaW50cyA+IDA7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgZGV2aWNlJ3MgcHJpbWFyeSBpbnB1dCBpcyBhYmxlIHRvIGhvdmVyLlxuXHQgKi9cblx0QG1lbW9pemVcblx0c3RhdGljIGlzSG92ZXJEZXZpY2UoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIG1haW5XaW5kb3cubWF0Y2hNZWRpYSgnKGhvdmVyOiBob3ZlciknKS5tYXRjaGVzO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaGFuZGxlKSB7XG5cdFx0XHR0aGlzLmhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLmhhbmRsZSA9IG51bGw7XG5cdFx0fVxuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBvblRvdWNoU3RhcnQoZTogVG91Y2hFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHRpbWVzdGFtcCA9IERhdGUubm93KCk7IC8vIHVzZSBEYXRlLm5vdygpIGJlY2F1c2Ugb24gRkYgZS50aW1lU3RhbXAgaXMgbm90IGVwb2NoIGJhc2VkLlxuXG5cdFx0aWYgKHRoaXMuaGFuZGxlKSB7XG5cdFx0XHR0aGlzLmhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLmhhbmRsZSA9IG51bGw7XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGUudGFyZ2V0VG91Y2hlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgdG91Y2ggPSBlLnRhcmdldFRvdWNoZXMuaXRlbShpKTtcblxuXHRcdFx0dGhpcy5hY3RpdmVUb3VjaGVzW3RvdWNoLmlkZW50aWZpZXJdID0ge1xuXHRcdFx0XHRpZDogdG91Y2guaWRlbnRpZmllcixcblx0XHRcdFx0aW5pdGlhbFRhcmdldDogdG91Y2gudGFyZ2V0LFxuXHRcdFx0XHRpbml0aWFsVGltZVN0YW1wOiB0aW1lc3RhbXAsXG5cdFx0XHRcdGluaXRpYWxQYWdlWDogdG91Y2gucGFnZVgsXG5cdFx0XHRcdGluaXRpYWxQYWdlWTogdG91Y2gucGFnZVksXG5cdFx0XHRcdHJvbGxpbmdUaW1lc3RhbXBzOiBbdGltZXN0YW1wXSxcblx0XHRcdFx0cm9sbGluZ1BhZ2VYOiBbdG91Y2gucGFnZVhdLFxuXHRcdFx0XHRyb2xsaW5nUGFnZVk6IFt0b3VjaC5wYWdlWV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGV2dCA9IHRoaXMubmV3R2VzdHVyZUV2ZW50KEV2ZW50VHlwZS5TdGFydCwgdG91Y2gudGFyZ2V0KTtcblx0XHRcdGV2dC5wYWdlWCA9IHRvdWNoLnBhZ2VYO1xuXHRcdFx0ZXZ0LnBhZ2VZID0gdG91Y2gucGFnZVk7XG5cdFx0XHR0aGlzLmRpc3BhdGNoRXZlbnQoZXZ0KTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5kaXNwYXRjaGVkKSB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0dGhpcy5kaXNwYXRjaGVkID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblRvdWNoRW5kKHRhcmdldFdpbmRvdzogV2luZG93LCBlOiBUb3VjaEV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgdGltZXN0YW1wID0gRGF0ZS5ub3coKTsgLy8gdXNlIERhdGUubm93KCkgYmVjYXVzZSBvbiBGRiBlLnRpbWVTdGFtcCBpcyBub3QgZXBvY2ggYmFzZWQuXG5cblx0XHRjb25zdCBhY3RpdmVUb3VjaENvdW50ID0gT2JqZWN0LmtleXModGhpcy5hY3RpdmVUb3VjaGVzKS5sZW5ndGg7XG5cblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gZS5jaGFuZ2VkVG91Y2hlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXG5cdFx0XHRjb25zdCB0b3VjaCA9IGUuY2hhbmdlZFRvdWNoZXMuaXRlbShpKTtcblxuXHRcdFx0aWYgKCF0aGlzLmFjdGl2ZVRvdWNoZXMuaGFzT3duUHJvcGVydHkoU3RyaW5nKHRvdWNoLmlkZW50aWZpZXIpKSkge1xuXHRcdFx0XHRjb25zb2xlLndhcm4oJ21vdmUgb2YgYW4gVU5LTk9XTiB0b3VjaCcsIHRvdWNoKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLmFjdGl2ZVRvdWNoZXNbdG91Y2guaWRlbnRpZmllcl0sXG5cdFx0XHRcdGhvbGRUaW1lID0gRGF0ZS5ub3coKSAtIGRhdGEuaW5pdGlhbFRpbWVTdGFtcDtcblxuXHRcdFx0aWYgKGhvbGRUaW1lIDwgR2VzdHVyZS5IT0xEX0RFTEFZXG5cdFx0XHRcdCYmIE1hdGguYWJzKGRhdGEuaW5pdGlhbFBhZ2VYIC0gZGF0YS5yb2xsaW5nUGFnZVguYXQoLTEpISkgPCAzMFxuXHRcdFx0XHQmJiBNYXRoLmFicyhkYXRhLmluaXRpYWxQYWdlWSAtIGRhdGEucm9sbGluZ1BhZ2VZLmF0KC0xKSEpIDwgMzApIHtcblxuXHRcdFx0XHRjb25zdCBldnQgPSB0aGlzLm5ld0dlc3R1cmVFdmVudChFdmVudFR5cGUuVGFwLCBkYXRhLmluaXRpYWxUYXJnZXQpO1xuXHRcdFx0XHRldnQucGFnZVggPSBkYXRhLnJvbGxpbmdQYWdlWC5hdCgtMSkhO1xuXHRcdFx0XHRldnQucGFnZVkgPSBkYXRhLnJvbGxpbmdQYWdlWS5hdCgtMSkhO1xuXHRcdFx0XHR0aGlzLmRpc3BhdGNoRXZlbnQoZXZ0KTtcblxuXHRcdFx0fSBlbHNlIGlmIChob2xkVGltZSA+PSBHZXN0dXJlLkhPTERfREVMQVlcblx0XHRcdFx0JiYgTWF0aC5hYnMoZGF0YS5pbml0aWFsUGFnZVggLSBkYXRhLnJvbGxpbmdQYWdlWC5hdCgtMSkhKSA8IDMwXG5cdFx0XHRcdCYmIE1hdGguYWJzKGRhdGEuaW5pdGlhbFBhZ2VZIC0gZGF0YS5yb2xsaW5nUGFnZVkuYXQoLTEpISkgPCAzMCkge1xuXG5cdFx0XHRcdGNvbnN0IGV2dCA9IHRoaXMubmV3R2VzdHVyZUV2ZW50KEV2ZW50VHlwZS5Db250ZXh0bWVudSwgZGF0YS5pbml0aWFsVGFyZ2V0KTtcblx0XHRcdFx0ZXZ0LnBhZ2VYID0gZGF0YS5yb2xsaW5nUGFnZVguYXQoLTEpITtcblx0XHRcdFx0ZXZ0LnBhZ2VZID0gZGF0YS5yb2xsaW5nUGFnZVkuYXQoLTEpITtcblx0XHRcdFx0dGhpcy5kaXNwYXRjaEV2ZW50KGV2dCk7XG5cblx0XHRcdH0gZWxzZSBpZiAoYWN0aXZlVG91Y2hDb3VudCA9PT0gMSkge1xuXHRcdFx0XHRjb25zdCBmaW5hbFggPSBkYXRhLnJvbGxpbmdQYWdlWC5hdCgtMSkhO1xuXHRcdFx0XHRjb25zdCBmaW5hbFkgPSBkYXRhLnJvbGxpbmdQYWdlWS5hdCgtMSkhO1xuXG5cdFx0XHRcdGNvbnN0IGRlbHRhVCA9IGRhdGEucm9sbGluZ1RpbWVzdGFtcHMuYXQoLTEpISAtIGRhdGEucm9sbGluZ1RpbWVzdGFtcHNbMF07XG5cdFx0XHRcdGNvbnN0IGRlbHRhWCA9IGZpbmFsWCAtIGRhdGEucm9sbGluZ1BhZ2VYWzBdO1xuXHRcdFx0XHRjb25zdCBkZWx0YVkgPSBmaW5hbFkgLSBkYXRhLnJvbGxpbmdQYWdlWVswXTtcblxuXHRcdFx0XHQvLyBXZSBuZWVkIHRvIGdldCBhbGwgdGhlIGRpc3BhdGNoIHRhcmdldHMgb24gdGhlIHN0YXJ0IG9mIHRoZSBpbmVydGlhIGV2ZW50XG5cdFx0XHRcdGNvbnN0IGRpc3BhdGNoVG8gPSBbLi4udGhpcy50YXJnZXRzXS5maWx0ZXIodCA9PiBkYXRhLmluaXRpYWxUYXJnZXQgaW5zdGFuY2VvZiBOb2RlICYmIHQuY29udGFpbnMoZGF0YS5pbml0aWFsVGFyZ2V0KSk7XG5cdFx0XHRcdHRoaXMuaW5lcnRpYSh0YXJnZXRXaW5kb3csIGRpc3BhdGNoVG8sIHRpbWVzdGFtcCxcdC8vIHRpbWUgbm93XG5cdFx0XHRcdFx0TWF0aC5hYnMoZGVsdGFYKSAvIGRlbHRhVCxcdFx0XHRcdFx0XHQvLyBzcGVlZFxuXHRcdFx0XHRcdGRlbHRhWCA+IDAgPyAxIDogLTEsXHRcdFx0XHRcdFx0XHQvLyB4IGRpcmVjdGlvblxuXHRcdFx0XHRcdGZpbmFsWCxcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Ly8geCBub3dcblx0XHRcdFx0XHRNYXRoLmFicyhkZWx0YVkpIC8gZGVsdGFULCAgXHRcdFx0XHRcdC8vIHkgc3BlZWRcblx0XHRcdFx0XHRkZWx0YVkgPiAwID8gMSA6IC0xLFx0XHRcdFx0XHRcdFx0Ly8geSBkaXJlY3Rpb25cblx0XHRcdFx0XHRmaW5hbFlcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Ly8geSBub3dcblx0XHRcdFx0KTtcblx0XHRcdH1cblxuXG5cdFx0XHR0aGlzLmRpc3BhdGNoRXZlbnQodGhpcy5uZXdHZXN0dXJlRXZlbnQoRXZlbnRUeXBlLkVuZCwgZGF0YS5pbml0aWFsVGFyZ2V0KSk7XG5cdFx0XHQvLyBmb3JnZXQgYWJvdXQgdGhpcyB0b3VjaFxuXHRcdFx0ZGVsZXRlIHRoaXMuYWN0aXZlVG91Y2hlc1t0b3VjaC5pZGVudGlmaWVyXTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5kaXNwYXRjaGVkKSB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0dGhpcy5kaXNwYXRjaGVkID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBuZXdHZXN0dXJlRXZlbnQodHlwZTogc3RyaW5nLCBpbml0aWFsVGFyZ2V0PzogRXZlbnRUYXJnZXQpOiBHZXN0dXJlRXZlbnQge1xuXHRcdGNvbnN0IGV2ZW50ID0gZG9jdW1lbnQuY3JlYXRlRXZlbnQoJ0N1c3RvbUV2ZW50JykgYXMgdW5rbm93biBhcyBHZXN0dXJlRXZlbnQ7XG5cdFx0ZXZlbnQuaW5pdEV2ZW50KHR5cGUsIGZhbHNlLCB0cnVlKTtcblx0XHRldmVudC5pbml0aWFsVGFyZ2V0ID0gaW5pdGlhbFRhcmdldDtcblx0XHRldmVudC50YXBDb3VudCA9IDA7XG5cdFx0cmV0dXJuIGV2ZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBkaXNwYXRjaEV2ZW50KGV2ZW50OiBHZXN0dXJlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoZXZlbnQudHlwZSA9PT0gRXZlbnRUeXBlLlRhcCkge1xuXHRcdFx0Y29uc3QgY3VycmVudFRpbWUgPSAobmV3IERhdGUoKSkuZ2V0VGltZSgpO1xuXHRcdFx0bGV0IHNldFRhcENvdW50ID0gMDtcblx0XHRcdGlmIChjdXJyZW50VGltZSAtIHRoaXMuX2xhc3RTZXRUYXBDb3VudFRpbWUgPiBHZXN0dXJlLkNMRUFSX1RBUF9DT1VOVF9USU1FKSB7XG5cdFx0XHRcdHNldFRhcENvdW50ID0gMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNldFRhcENvdW50ID0gMjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fbGFzdFNldFRhcENvdW50VGltZSA9IGN1cnJlbnRUaW1lO1xuXHRcdFx0ZXZlbnQudGFwQ291bnQgPSBzZXRUYXBDb3VudDtcblx0XHR9IGVsc2UgaWYgKGV2ZW50LnR5cGUgPT09IEV2ZW50VHlwZS5DaGFuZ2UgfHwgZXZlbnQudHlwZSA9PT0gRXZlbnRUeXBlLkNvbnRleHRtZW51KSB7XG5cdFx0XHQvLyB0YXAgaXMgY2FuY2VsZWQgYnkgc2Nyb2xsaW5nIG9yIGNvbnRleHQgbWVudVxuXHRcdFx0dGhpcy5fbGFzdFNldFRhcENvdW50VGltZSA9IDA7XG5cdFx0fVxuXG5cdFx0aWYgKGV2ZW50LmluaXRpYWxUYXJnZXQgaW5zdGFuY2VvZiBOb2RlKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGlnbm9yZVRhcmdldCBvZiB0aGlzLmlnbm9yZVRhcmdldHMpIHtcblx0XHRcdFx0aWYgKGlnbm9yZVRhcmdldC5jb250YWlucyhldmVudC5pbml0aWFsVGFyZ2V0KSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0YXJnZXRzOiBbbnVtYmVyLCBIVE1MRWxlbWVudF1bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCB0YXJnZXQgb2YgdGhpcy50YXJnZXRzKSB7XG5cdFx0XHRcdGlmICh0YXJnZXQuY29udGFpbnMoZXZlbnQuaW5pdGlhbFRhcmdldCkpIHtcblx0XHRcdFx0XHRsZXQgZGVwdGggPSAwO1xuXHRcdFx0XHRcdGxldCBub3c6IE5vZGUgfCBudWxsID0gZXZlbnQuaW5pdGlhbFRhcmdldDtcblx0XHRcdFx0XHR3aGlsZSAobm93ICYmIG5vdyAhPT0gdGFyZ2V0KSB7XG5cdFx0XHRcdFx0XHRkZXB0aCsrO1xuXHRcdFx0XHRcdFx0bm93ID0gbm93LnBhcmVudEVsZW1lbnQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRhcmdldHMucHVzaChbZGVwdGgsIHRhcmdldF0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRhcmdldHMuc29ydCgoYSwgYikgPT4gYVswXSAtIGJbMF0pO1xuXG5cdFx0XHRmb3IgKGNvbnN0IFtfLCB0YXJnZXRdIG9mIHRhcmdldHMpIHtcblx0XHRcdFx0dGFyZ2V0LmRpc3BhdGNoRXZlbnQoZXZlbnQpO1xuXHRcdFx0XHR0aGlzLmRpc3BhdGNoZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaW5lcnRpYSh0YXJnZXRXaW5kb3c6IFdpbmRvdywgZGlzcGF0Y2hUbzogcmVhZG9ubHkgRXZlbnRUYXJnZXRbXSwgdDE6IG51bWJlciwgdlg6IG51bWJlciwgZGlyWDogbnVtYmVyLCB4OiBudW1iZXIsIHZZOiBudW1iZXIsIGRpclk6IG51bWJlciwgeTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5oYW5kbGUgPSBEb21VdGlscy5zY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKHRhcmdldFdpbmRvdywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblxuXHRcdFx0Ly8gdmVsb2NpdHk6IG9sZCBzcGVlZCArIGFjY2VsX292ZXJfdGltZVxuXHRcdFx0Y29uc3QgZGVsdGFUID0gbm93IC0gdDE7XG5cdFx0XHRsZXQgZGVsdGFfcG9zX3ggPSAwLCBkZWx0YV9wb3NfeSA9IDA7XG5cdFx0XHRsZXQgc3RvcHBlZCA9IHRydWU7XG5cblx0XHRcdHZYICs9IEdlc3R1cmUuU0NST0xMX0ZSSUNUSU9OICogZGVsdGFUO1xuXHRcdFx0dlkgKz0gR2VzdHVyZS5TQ1JPTExfRlJJQ1RJT04gKiBkZWx0YVQ7XG5cblx0XHRcdGlmICh2WCA+IDApIHtcblx0XHRcdFx0c3RvcHBlZCA9IGZhbHNlO1xuXHRcdFx0XHRkZWx0YV9wb3NfeCA9IGRpclggKiB2WCAqIGRlbHRhVDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHZZID4gMCkge1xuXHRcdFx0XHRzdG9wcGVkID0gZmFsc2U7XG5cdFx0XHRcdGRlbHRhX3Bvc195ID0gZGlyWSAqIHZZICogZGVsdGFUO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBkaXNwYXRjaCB0cmFuc2xhdGlvbiBldmVudFxuXHRcdFx0Y29uc3QgZXZ0ID0gdGhpcy5uZXdHZXN0dXJlRXZlbnQoRXZlbnRUeXBlLkNoYW5nZSk7XG5cdFx0XHRldnQudHJhbnNsYXRpb25YID0gZGVsdGFfcG9zX3g7XG5cdFx0XHRldnQudHJhbnNsYXRpb25ZID0gZGVsdGFfcG9zX3k7XG5cdFx0XHRkaXNwYXRjaFRvLmZvckVhY2goZCA9PiBkLmRpc3BhdGNoRXZlbnQoZXZ0KSk7XG5cblx0XHRcdGlmICghc3RvcHBlZCkge1xuXHRcdFx0XHR0aGlzLmluZXJ0aWEodGFyZ2V0V2luZG93LCBkaXNwYXRjaFRvLCBub3csIHZYLCBkaXJYLCB4ICsgZGVsdGFfcG9zX3gsIHZZLCBkaXJZLCB5ICsgZGVsdGFfcG9zX3kpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBvblRvdWNoTW92ZShlOiBUb3VjaEV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgdGltZXN0YW1wID0gRGF0ZS5ub3coKTsgLy8gdXNlIERhdGUubm93KCkgYmVjYXVzZSBvbiBGRiBlLnRpbWVTdGFtcCBpcyBub3QgZXBvY2ggYmFzZWQuXG5cblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gZS5jaGFuZ2VkVG91Y2hlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXG5cdFx0XHRjb25zdCB0b3VjaCA9IGUuY2hhbmdlZFRvdWNoZXMuaXRlbShpKTtcblxuXHRcdFx0aWYgKCF0aGlzLmFjdGl2ZVRvdWNoZXMuaGFzT3duUHJvcGVydHkoU3RyaW5nKHRvdWNoLmlkZW50aWZpZXIpKSkge1xuXHRcdFx0XHRjb25zb2xlLndhcm4oJ2VuZCBvZiBhbiBVTktOT1dOIHRvdWNoJywgdG91Y2gpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMuYWN0aXZlVG91Y2hlc1t0b3VjaC5pZGVudGlmaWVyXTtcblxuXHRcdFx0Y29uc3QgZXZ0ID0gdGhpcy5uZXdHZXN0dXJlRXZlbnQoRXZlbnRUeXBlLkNoYW5nZSwgZGF0YS5pbml0aWFsVGFyZ2V0KTtcblx0XHRcdGV2dC50cmFuc2xhdGlvblggPSB0b3VjaC5wYWdlWCAtIGRhdGEucm9sbGluZ1BhZ2VYLmF0KC0xKSE7XG5cdFx0XHRldnQudHJhbnNsYXRpb25ZID0gdG91Y2gucGFnZVkgLSBkYXRhLnJvbGxpbmdQYWdlWS5hdCgtMSkhO1xuXHRcdFx0ZXZ0LnBhZ2VYID0gdG91Y2gucGFnZVg7XG5cdFx0XHRldnQucGFnZVkgPSB0b3VjaC5wYWdlWTtcblx0XHRcdHRoaXMuZGlzcGF0Y2hFdmVudChldnQpO1xuXG5cdFx0XHQvLyBvbmx5IGtlZXAgYSBmZXcgZGF0YSBwb2ludHMsIHRvIGF2ZXJhZ2UgdGhlIGZpbmFsIHNwZWVkXG5cdFx0XHRpZiAoZGF0YS5yb2xsaW5nUGFnZVgubGVuZ3RoID4gMykge1xuXHRcdFx0XHRkYXRhLnJvbGxpbmdQYWdlWC5zaGlmdCgpO1xuXHRcdFx0XHRkYXRhLnJvbGxpbmdQYWdlWS5zaGlmdCgpO1xuXHRcdFx0XHRkYXRhLnJvbGxpbmdUaW1lc3RhbXBzLnNoaWZ0KCk7XG5cdFx0XHR9XG5cblx0XHRcdGRhdGEucm9sbGluZ1BhZ2VYLnB1c2godG91Y2gucGFnZVgpO1xuXHRcdFx0ZGF0YS5yb2xsaW5nUGFnZVkucHVzaCh0b3VjaC5wYWdlWSk7XG5cdFx0XHRkYXRhLnJvbGxpbmdUaW1lc3RhbXBzLnB1c2godGltZXN0YW1wKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5kaXNwYXRjaGVkKSB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0dGhpcy5kaXNwYXRjaGVkID0gZmFsc2U7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7O0FBS0EsWUFBWSxjQUFjO0FBQzFCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFNBQVMsa0JBQWtCO0FBQ3BDLFNBQVMsWUFBeUIsaUJBQWlCLG9CQUFvQjtBQUN2RSxTQUFTLGtCQUFrQjtBQUVwQixJQUFVO0FBQUEsQ0FBVixDQUFVQSxlQUFWO0FBQ0MsRUFBTUEsV0FBQSxNQUFNO0FBQ1osRUFBTUEsV0FBQSxTQUFTO0FBQ2YsRUFBTUEsV0FBQSxRQUFRO0FBQ2QsRUFBTUEsV0FBQSxNQUFNO0FBQ1osRUFBTUEsV0FBQSxjQUFjO0FBQUEsR0FMWDtBQXdEVixNQUFNLFdBQU4sTUFBTSxpQkFBZ0IsV0FBVztBQUFBO0FBQUEsRUFrQi9CLGNBQWM7QUFDckIsVUFBTTtBQWJQLFNBQVEsYUFBYTtBQUNyQixTQUFpQixVQUFVLElBQUksV0FBd0I7QUFDdkQsU0FBaUIsZ0JBQWdCLElBQUksV0FBd0I7QUFhNUQsU0FBSyxnQkFBZ0IsQ0FBQztBQUN0QixTQUFLLFNBQVM7QUFDZCxTQUFLLHVCQUF1QjtBQUU1QixTQUFLLFVBQVUsV0FBVyxnQkFBZ0IsU0FBUyxxQkFBcUIsQ0FBQyxFQUFFLFFBQVEsWUFBWSxNQUFNO0FBQ3BHLGtCQUFZLElBQUksU0FBUyxzQkFBc0IsT0FBTyxVQUFVLGNBQWMsQ0FBQyxNQUFrQixLQUFLLGFBQWEsQ0FBQyxHQUFHLEVBQUUsU0FBUyxNQUFNLENBQUMsQ0FBQztBQUMxSSxrQkFBWSxJQUFJLFNBQVMsc0JBQXNCLE9BQU8sVUFBVSxZQUFZLENBQUMsTUFBa0IsS0FBSyxXQUFXLFFBQVEsQ0FBQyxDQUFDLENBQUM7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QU8sS0FBSztBQUFBLE1BQzNCO0FBR0EsWUFBTSxNQUFNLEtBQUssZ0JBQWdCLFVBQVUsTUFBTTtBQUNqRCxVQUFJLGVBQWU7QUFDbkIsVUFBSSxlQUFlO0FBQ25CLGlCQUFXLFFBQVEsT0FBSyxFQUFFLGNBQWMsR0FBRyxDQUFDO0FBRTVDLFVBQUksQ0FBQyxTQUFTO0FBQ2IsYUFBSyxRQUFRLGNBQWMsWUFBWSxLQUFLLElBQUksTUFBTSxJQUFJLGFBQWEsSUFBSSxNQUFNLElBQUksV0FBVztBQUFBLE1BQ2pHO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsWUFBWSxHQUFxQjtBQUN4QyxVQUFNLFlBQVksS0FBSyxJQUFJO0FBRTNCLGFBQVMsSUFBSSxHQUFHLE1BQU0sRUFBRSxlQUFlLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFFNUQsWUFBTSxRQUFRLEVBQUUsZUFBZSxLQUFLLENBQUM7QUFFckMsVUFBSSxDQUFDLEtBQUssY0FBYyxlQUFlLE9BQU8sTUFBTSxVQUFVLENBQUMsR0FBRztBQUNqRSxnQkFBUSxLQUFLLDJCQUEyQixLQUFLO0FBQzdDO0FBQUEsTUFDRDtBQUVBLFlBQU0sT0FBTyxLQUFLLGNBQWMsTUFBTSxVQUFVO0FBRWhELFlBQU0sTUFBTSxLQUFLLGdCQUFnQixVQUFVLFFBQVEsS0FBSyxhQUFhO0FBQ3JFLFVBQUksZUFBZSxNQUFNLFFBQVEsS0FBSyxhQUFhLEdBQUcsRUFBRTtBQUN4RCxVQUFJLGVBQWUsTUFBTSxRQUFRLEtBQUssYUFBYSxHQUFHLEVBQUU7QUFDeEQsVUFBSSxRQUFRLE1BQU07QUFDbEIsVUFBSSxRQUFRLE1BQU07QUFDbEIsV0FBSyxjQUFjLEdBQUc7QUFHdEIsVUFBSSxLQUFLLGFBQWEsU0FBUyxHQUFHO0FBQ2pDLGFBQUssYUFBYSxNQUFNO0FBQ3hCLGFBQUssYUFBYSxNQUFNO0FBQ3hCLGFBQUssa0JBQWtCLE1BQU07QUFBQSxNQUM5QjtBQUVBLFdBQUssYUFBYSxLQUFLLE1BQU0sS0FBSztBQUNsQyxXQUFLLGFBQWEsS0FBSyxNQUFNLEtBQUs7QUFDbEMsV0FBSyxrQkFBa0IsS0FBSyxTQUFTO0FBQUEsSUFDdEM7QUFFQSxRQUFJLEtBQUssWUFBWTtBQUNwQixRQUFFLGVBQWU7QUFDakIsUUFBRSxnQkFBZ0I7QUFDbEIsV0FBSyxhQUFhO0FBQUEsSUFDbkI7QUFBQSxFQUNEO0FBQ0Q7QUF6VGEsU0FFWSxrQkFBa0I7QUFGOUIsU0FJWSxhQUFhO0FBSnpCLFNBZVksdUJBQXVCO0FBNkN4QztBQUFBLEVBRE47QUFBQSxHQTNEVyxVQTRETDtBQVVBO0FBQUEsRUFETjtBQUFBLEdBckVXLFVBc0VMO0FBdEVELElBQU0sVUFBTjsiLAogICJuYW1lcyI6IFsiRXZlbnRUeXBlIl0KfQo=
