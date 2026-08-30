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
import "./media/chatGroupDropTarget.css";
import { $, addDisposableListener, DragAndDropObserver, EventHelper, EventType, getWindow } from "../../../base/browser/dom.js";
import { RunOnceScheduler } from "../../../base/common/async.js";
import { toDisposable } from "../../../base/common/lifecycle.js";
import { assertReturnsDefined } from "../../../base/common/types.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { activeContrastBorder } from "../../../platform/theme/common/colorRegistry.js";
import { IThemeService, Themable } from "../../../platform/theme/common/themeService.js";
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from "../../../workbench/common/theme.js";
import { getSessionChatDragData } from "../dnd.js";
const EDGE_THRESHOLD = 0.25;
let ChatGroupDropOverlay = class extends Themable {
  constructor(targetGroupId, _targetElement, _onDrop, _isChatDrag, themeService) {
    super(themeService);
    this.targetGroupId = targetGroupId;
    this._targetElement = _targetElement;
    this._onDrop = _onDrop;
    this._isChatDrag = _isChatDrag;
    this._disposed = false;
    this._cleanupOverlayScheduler = this._register(new RunOnceScheduler(() => this.dispose(), 300));
    this._create();
  }
  get disposed() {
    return this._disposed;
  }
  _create() {
    const container = this._container = $("div", { id: ChatGroupDropOverlay.OVERLAY_ID });
    this._targetElement.appendChild(container);
    this._targetElement.classList.add("chat-group-dragged-over");
    this._register(toDisposable(() => {
      container.remove();
      this._targetElement.classList.remove("chat-group-dragged-over");
    }));
    this._overlay = $(".chat-group-drop-overlay-indicator");
    container.appendChild(this._overlay);
    this._registerListeners(container);
    this.updateStyles();
  }
  updateStyles() {
    const overlay = assertReturnsDefined(this._overlay);
    overlay.style.backgroundColor = this.getColor(EDITOR_DRAG_AND_DROP_BACKGROUND) || "";
    const activeContrastBorderColor = this.getColor(activeContrastBorder);
    overlay.style.outlineColor = activeContrastBorderColor || "";
    overlay.style.outlineOffset = activeContrastBorderColor ? "-2px" : "";
    overlay.style.outlineStyle = activeContrastBorderColor ? "dashed" : "";
    overlay.style.outlineWidth = activeContrastBorderColor ? "2px" : "";
  }
  _registerListeners(container) {
    this._register(new DragAndDropObserver(container, {
      onDragOver: (e) => {
        if (!this._isChatDrag(e)) {
          this._hideOverlay();
          return;
        }
        this._positionOverlay(e.offsetX, e.offsetY);
        if (this._cleanupOverlayScheduler.isScheduled()) {
          this._cleanupOverlayScheduler.cancel();
        }
      },
      onDragLeave: () => this.dispose(),
      onDragEnd: () => this.dispose(),
      onDrop: (e) => {
        EventHelper.stop(e, true);
        const zone = this._currentZone;
        const data = getSessionChatDragData(e);
        this.dispose();
        if (zone) {
          this._onDrop(this.targetGroupId, zone, data);
        }
      }
    }));
    this._register(addDisposableListener(container, EventType.MOUSE_OVER, () => {
      if (!this._cleanupOverlayScheduler.isScheduled()) {
        this._cleanupOverlayScheduler.schedule();
      }
    }));
  }
  _positionOverlay(mousePosX, mousePosY) {
    const width = this._targetElement.clientWidth;
    const height = this._targetElement.clientHeight;
    const zone = this._computeZone(mousePosX, mousePosY, width, height);
    switch (zone) {
      case "left":
        this._doPositionOverlay({ left: "0", top: "0", width: "50%", height: "100%" });
        break;
      case "right":
        this._doPositionOverlay({ left: "50%", top: "0", width: "50%", height: "100%" });
        break;
      case "top":
        this._doPositionOverlay({ left: "0", top: "0", width: "100%", height: "50%" });
        break;
      case "bottom":
        this._doPositionOverlay({ left: "0", top: "50%", width: "100%", height: "50%" });
        break;
      case "center":
        this._doPositionOverlay({ left: "0", top: "0", width: "100%", height: "100%" });
        break;
    }
    const overlay = assertReturnsDefined(this._overlay);
    overlay.style.opacity = "1";
    this._currentZone = zone;
  }
  _computeZone(x, y, width, height) {
    const edgeX = width * EDGE_THRESHOLD;
    const edgeY = height * EDGE_THRESHOLD;
    const distLeft = x;
    const distRight = width - x;
    const distTop = y;
    const distBottom = height - y;
    const inLeft = distLeft <= edgeX;
    const inRight = distRight <= edgeX;
    const inTop = distTop <= edgeY;
    const inBottom = distBottom <= edgeY;
    if (!inLeft && !inRight && !inTop && !inBottom) {
      return "center";
    }
    const candidates = [];
    if (inLeft) {
      candidates.push({ zone: "left", ratio: distLeft / edgeX });
    }
    if (inRight) {
      candidates.push({ zone: "right", ratio: distRight / edgeX });
    }
    if (inTop) {
      candidates.push({ zone: "top", ratio: distTop / edgeY });
    }
    if (inBottom) {
      candidates.push({ zone: "bottom", ratio: distBottom / edgeY });
    }
    candidates.sort((a, b) => a.ratio - b.ratio);
    return candidates[0].zone;
  }
  _doPositionOverlay(options) {
    const container = assertReturnsDefined(this._container);
    const overlay = assertReturnsDefined(this._overlay);
    container.style.height = "100%";
    overlay.style.left = options.left;
    overlay.style.top = options.top;
    overlay.style.width = options.width;
    overlay.style.height = options.height;
  }
  _hideOverlay() {
    const overlay = assertReturnsDefined(this._overlay);
    this._doPositionOverlay({ left: "0", top: "0", width: "100%", height: "100%" });
    overlay.style.opacity = "0";
    this._currentZone = void 0;
  }
  contains(element) {
    return element === this._container || element === this._overlay;
  }
  dispose() {
    super.dispose();
    this._disposed = true;
  }
};
ChatGroupDropOverlay.OVERLAY_ID = "monaco-workbench-chat-group-drop-overlay";
ChatGroupDropOverlay = __decorateClass([
  __decorateParam(4, IThemeService)
], ChatGroupDropOverlay);
let ChatGroupDropTarget = class extends Themable {
  constructor(_container, _delegate, themeService, _instantiationService) {
    super(themeService);
    this._container = _container;
    this._delegate = _delegate;
    this._instantiationService = _instantiationService;
    this._counter = 0;
    this._registerListeners();
  }
  get overlay() {
    if (this._overlay && !this._overlay.disposed) {
      return this._overlay;
    }
    return void 0;
  }
  _registerListeners() {
    this._register(addDisposableListener(this._container, EventType.DRAG_ENTER, (e) => this._onDragEnter(e)));
    this._register(addDisposableListener(this._container, EventType.DRAG_LEAVE, () => this._onDragLeave()));
    for (const target of [this._container, getWindow(this._container)]) {
      this._register(addDisposableListener(target, EventType.DRAG_END, () => this._onDragEnd()));
    }
  }
  _onDragEnter(event) {
    this._counter++;
    if (!this._delegate.isChatDrag(event)) {
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "none";
      }
      return;
    }
    this._updateContainer(true);
    const target = event.target;
    if (!target) {
      return;
    }
    if (this.overlay && !this.overlay.contains(target)) {
      this._disposeOverlay();
    }
    if (this.overlay) {
      return;
    }
    const targetGroup = this._delegate.findTargetGroup(target);
    if (!targetGroup) {
      return;
    }
    this._overlay = this._instantiationService.createInstance(
      ChatGroupDropOverlay,
      targetGroup.id,
      targetGroup.element,
      (groupId, zone, data) => this._delegate.onChatDrop(groupId, zone, data),
      (event2) => this._delegate.isChatDrag(event2)
    );
  }
  _onDragLeave() {
    this._counter--;
    if (this._counter === 0) {
      this._updateContainer(false);
    }
  }
  _onDragEnd() {
    this._counter = 0;
    this._updateContainer(false);
    this._disposeOverlay();
  }
  _updateContainer(isDraggedOver) {
    this._container.classList.toggle("chat-groups-dragged-over", isDraggedOver);
  }
  dispose() {
    super.dispose();
    this._disposeOverlay();
  }
  _disposeOverlay() {
    if (this._overlay) {
      this._overlay.dispose();
      this._overlay = void 0;
    }
  }
};
ChatGroupDropTarget = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, IInstantiationService)
], ChatGroupDropTarget);
export {
  ChatGroupDropTarget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcYnJvd3NlclxccGFydHNcXGNoYXRHcm91cERyb3BUYXJnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvY2hhdEdyb3VwRHJvcFRhcmdldC5jc3MnO1xuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBEcmFnQW5kRHJvcE9ic2VydmVyLCBFdmVudEhlbHBlciwgRXZlbnRUeXBlLCBnZXRXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IGFjdGl2ZUNvbnRyYXN0Qm9yZGVyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSwgVGhlbWFibGUgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVESVRPUl9EUkFHX0FORF9EUk9QX0JBQ0tHUk9VTkQgfSBmcm9tICcuLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IGdldFNlc3Npb25DaGF0RHJhZ0RhdGEsIElEcmFnZ2VkU2Vzc2lvbkNoYXQgfSBmcm9tICcuLi9kbmQuanMnO1xuXG4vKiogWm9uZSBvZiBhIHRhcmdldCBncm91cCB3aGVyZSBhIGRyYWdnZWQgY2hhdCBjYW4gYmUgZHJvcHBlZC4gKi9cbmV4cG9ydCB0eXBlIENoYXREcm9wWm9uZSA9ICdsZWZ0JyB8ICdyaWdodCcgfCAndG9wJyB8ICdib3R0b20nIHwgJ2NlbnRlcic7XG5cbi8qKlxuICogUmVzb2x2ZXMgYW4gZWxlbWVudCB1bmRlciB0aGUgZ3JvdXBzIGNvbnRhaW5lciB0byB0aGUgY2hhdCBncm91cCBpdCBiZWxvbmdzXG4gKiB0bywgYW5kIHJlY2VpdmVzIGRyb3Agbm90aWZpY2F0aW9ucy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ2hhdEdyb3VwRHJvcFRhcmdldERlbGVnYXRlIHtcblxuXHQvKiogV2hldGhlciB0aGUgZHJhZyBjYW4gYmUgYWNjZXB0ZWQgYnkgdGhpcyBzZXNzaW9uJ3MgZ3JpZC4gKi9cblx0aXNDaGF0RHJhZyhldmVudDogRHJhZ0V2ZW50KTogYm9vbGVhbjtcblxuXHQvKiogUmVzb2x2ZSBhIGNoaWxkIGVsZW1lbnQgdG8gaXRzIG93bmluZyBjaGF0IGdyb3VwIGlkICsgcm9vdCBlbGVtZW50LiAqL1xuXHRmaW5kVGFyZ2V0R3JvdXAoY2hpbGQ6IEhUTUxFbGVtZW50KTogeyByZWFkb25seSBpZDogbnVtYmVyOyByZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudCB9IHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBIYW5kbGUgYSBjaGF0IGJlaW5nIGRyb3BwZWQgb250byB0aGUgZ2l2ZW4gZ3JvdXAgaW4gdGhlIGdpdmVuIHpvbmUuICovXG5cdG9uQ2hhdERyb3AodGFyZ2V0R3JvdXBJZDogbnVtYmVyLCB6b25lOiBDaGF0RHJvcFpvbmUsIGRhdGE6IElEcmFnZ2VkU2Vzc2lvbkNoYXQgfCB1bmRlZmluZWQpOiB2b2lkO1xufVxuXG4vKiogRnJhY3Rpb24gb2YgdGhlIHRhcmdldCdzIHdpZHRoL2hlaWdodCB0aGF0IHRoZSBlZGdlIHpvbmVzIG9jY3VweS4gKi9cbmNvbnN0IEVER0VfVEhSRVNIT0xEID0gMC4yNTtcblxuY2xhc3MgQ2hhdEdyb3VwRHJvcE92ZXJsYXkgZXh0ZW5kcyBUaGVtYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgT1ZFUkxBWV9JRCA9ICdtb25hY28td29ya2JlbmNoLWNoYXQtZ3JvdXAtZHJvcC1vdmVybGF5JztcblxuXHRwcml2YXRlIF9jb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9vdmVybGF5OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9jdXJyZW50Wm9uZTogQ2hhdERyb3Bab25lIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2Rpc3Bvc2VkID0gZmFsc2U7XG5cdGdldCBkaXNwb3NlZCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2Rpc3Bvc2VkOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2xlYW51cE92ZXJsYXlTY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgdGFyZ2V0R3JvdXBJZDogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RhcmdldEVsZW1lbnQ6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uRHJvcDogKGdyb3VwSWQ6IG51bWJlciwgem9uZTogQ2hhdERyb3Bab25lLCBkYXRhOiBJRHJhZ2dlZFNlc3Npb25DaGF0IHwgdW5kZWZpbmVkKSA9PiB2b2lkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2lzQ2hhdERyYWc6IChldmVudDogRHJhZ0V2ZW50KSA9PiBib29sZWFuLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIodGhlbWVTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX2NsZWFudXBPdmVybGF5U2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5kaXNwb3NlKCksIDMwMCkpO1xuXG5cdFx0dGhpcy5fY3JlYXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy5fY29udGFpbmVyID0gJCgnZGl2JywgeyBpZDogQ2hhdEdyb3VwRHJvcE92ZXJsYXkuT1ZFUkxBWV9JRCB9KTtcblxuXHRcdHRoaXMuX3RhcmdldEVsZW1lbnQuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcblx0XHR0aGlzLl90YXJnZXRFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtZ3JvdXAtZHJhZ2dlZC1vdmVyJyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGNvbnRhaW5lci5yZW1vdmUoKTtcblx0XHRcdHRoaXMuX3RhcmdldEVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnY2hhdC1ncm91cC1kcmFnZ2VkLW92ZXInKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9vdmVybGF5ID0gJCgnLmNoYXQtZ3JvdXAtZHJvcC1vdmVybGF5LWluZGljYXRvcicpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl9vdmVybGF5KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyTGlzdGVuZXJzKGNvbnRhaW5lcik7XG5cdFx0dGhpcy51cGRhdGVTdHlsZXMoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZVN0eWxlcygpOiB2b2lkIHtcblx0XHRjb25zdCBvdmVybGF5ID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5fb3ZlcmxheSk7XG5cblx0XHRvdmVybGF5LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IHRoaXMuZ2V0Q29sb3IoRURJVE9SX0RSQUdfQU5EX0RST1BfQkFDS0dST1VORCkgfHwgJyc7XG5cblx0XHRjb25zdCBhY3RpdmVDb250cmFzdEJvcmRlckNvbG9yID0gdGhpcy5nZXRDb2xvcihhY3RpdmVDb250cmFzdEJvcmRlcik7XG5cdFx0b3ZlcmxheS5zdHlsZS5vdXRsaW5lQ29sb3IgPSBhY3RpdmVDb250cmFzdEJvcmRlckNvbG9yIHx8ICcnO1xuXHRcdG92ZXJsYXkuc3R5bGUub3V0bGluZU9mZnNldCA9IGFjdGl2ZUNvbnRyYXN0Qm9yZGVyQ29sb3IgPyAnLTJweCcgOiAnJztcblx0XHRvdmVybGF5LnN0eWxlLm91dGxpbmVTdHlsZSA9IGFjdGl2ZUNvbnRyYXN0Qm9yZGVyQ29sb3IgPyAnZGFzaGVkJyA6ICcnO1xuXHRcdG92ZXJsYXkuc3R5bGUub3V0bGluZVdpZHRoID0gYWN0aXZlQ29udHJhc3RCb3JkZXJDb2xvciA/ICcycHgnIDogJyc7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3Rlckxpc3RlbmVycyhjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobmV3IERyYWdBbmREcm9wT2JzZXJ2ZXIoY29udGFpbmVyLCB7XG5cdFx0XHRvbkRyYWdPdmVyOiBlID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLl9pc0NoYXREcmFnKGUpKSB7XG5cdFx0XHRcdFx0dGhpcy5faGlkZU92ZXJsYXkoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9wb3NpdGlvbk92ZXJsYXkoZS5vZmZzZXRYLCBlLm9mZnNldFkpO1xuXG5cdFx0XHRcdGlmICh0aGlzLl9jbGVhbnVwT3ZlcmxheVNjaGVkdWxlci5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRcdFx0dGhpcy5fY2xlYW51cE92ZXJsYXlTY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cblx0XHRcdG9uRHJhZ0xlYXZlOiAoKSA9PiB0aGlzLmRpc3Bvc2UoKSxcblx0XHRcdG9uRHJhZ0VuZDogKCkgPT4gdGhpcy5kaXNwb3NlKCksXG5cblx0XHRcdG9uRHJvcDogZSA9PiB7XG5cdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cblx0XHRcdFx0Y29uc3Qgem9uZSA9IHRoaXMuX2N1cnJlbnRab25lO1xuXHRcdFx0XHRjb25zdCBkYXRhID0gZ2V0U2Vzc2lvbkNoYXREcmFnRGF0YShlKTtcblx0XHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cblx0XHRcdFx0aWYgKHpvbmUpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRyb3AodGhpcy50YXJnZXRHcm91cElkLCB6b25lLCBkYXRhKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb250YWluZXIsIEV2ZW50VHlwZS5NT1VTRV9PVkVSLCAoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2NsZWFudXBPdmVybGF5U2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0dGhpcy5fY2xlYW51cE92ZXJsYXlTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9wb3NpdGlvbk92ZXJsYXkobW91c2VQb3NYOiBudW1iZXIsIG1vdXNlUG9zWTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2lkdGggPSB0aGlzLl90YXJnZXRFbGVtZW50LmNsaWVudFdpZHRoO1xuXHRcdGNvbnN0IGhlaWdodCA9IHRoaXMuX3RhcmdldEVsZW1lbnQuY2xpZW50SGVpZ2h0O1xuXG5cdFx0Y29uc3Qgem9uZSA9IHRoaXMuX2NvbXB1dGVab25lKG1vdXNlUG9zWCwgbW91c2VQb3NZLCB3aWR0aCwgaGVpZ2h0KTtcblxuXHRcdHN3aXRjaCAoem9uZSkge1xuXHRcdFx0Y2FzZSAnbGVmdCc6XG5cdFx0XHRcdHRoaXMuX2RvUG9zaXRpb25PdmVybGF5KHsgbGVmdDogJzAnLCB0b3A6ICcwJywgd2lkdGg6ICc1MCUnLCBoZWlnaHQ6ICcxMDAlJyB9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdyaWdodCc6XG5cdFx0XHRcdHRoaXMuX2RvUG9zaXRpb25PdmVybGF5KHsgbGVmdDogJzUwJScsIHRvcDogJzAnLCB3aWR0aDogJzUwJScsIGhlaWdodDogJzEwMCUnIH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3RvcCc6XG5cdFx0XHRcdHRoaXMuX2RvUG9zaXRpb25PdmVybGF5KHsgbGVmdDogJzAnLCB0b3A6ICcwJywgd2lkdGg6ICcxMDAlJywgaGVpZ2h0OiAnNTAlJyB9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdib3R0b20nOlxuXHRcdFx0XHR0aGlzLl9kb1Bvc2l0aW9uT3ZlcmxheSh7IGxlZnQ6ICcwJywgdG9wOiAnNTAlJywgd2lkdGg6ICcxMDAlJywgaGVpZ2h0OiAnNTAlJyB9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdjZW50ZXInOlxuXHRcdFx0XHR0aGlzLl9kb1Bvc2l0aW9uT3ZlcmxheSh7IGxlZnQ6ICcwJywgdG9wOiAnMCcsIHdpZHRoOiAnMTAwJScsIGhlaWdodDogJzEwMCUnIH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRjb25zdCBvdmVybGF5ID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5fb3ZlcmxheSk7XG5cdFx0b3ZlcmxheS5zdHlsZS5vcGFjaXR5ID0gJzEnO1xuXG5cdFx0dGhpcy5fY3VycmVudFpvbmUgPSB6b25lO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29tcHV0ZVpvbmUoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogQ2hhdERyb3Bab25lIHtcblx0XHRjb25zdCBlZGdlWCA9IHdpZHRoICogRURHRV9USFJFU0hPTEQ7XG5cdFx0Y29uc3QgZWRnZVkgPSBoZWlnaHQgKiBFREdFX1RIUkVTSE9MRDtcblxuXHRcdC8vIEVkZ2Ugem9uZXMgdGFrZSBwcmVjZWRlbmNlOyB0aGUgY2xvc2VzdCBlZGdlIChyZWxhdGl2ZSB0byBpdHMgdGhyZXNob2xkKSB3aW5zLlxuXHRcdGNvbnN0IGRpc3RMZWZ0ID0geDtcblx0XHRjb25zdCBkaXN0UmlnaHQgPSB3aWR0aCAtIHg7XG5cdFx0Y29uc3QgZGlzdFRvcCA9IHk7XG5cdFx0Y29uc3QgZGlzdEJvdHRvbSA9IGhlaWdodCAtIHk7XG5cblx0XHRjb25zdCBpbkxlZnQgPSBkaXN0TGVmdCA8PSBlZGdlWDtcblx0XHRjb25zdCBpblJpZ2h0ID0gZGlzdFJpZ2h0IDw9IGVkZ2VYO1xuXHRcdGNvbnN0IGluVG9wID0gZGlzdFRvcCA8PSBlZGdlWTtcblx0XHRjb25zdCBpbkJvdHRvbSA9IGRpc3RCb3R0b20gPD0gZWRnZVk7XG5cblx0XHRpZiAoIWluTGVmdCAmJiAhaW5SaWdodCAmJiAhaW5Ub3AgJiYgIWluQm90dG9tKSB7XG5cdFx0XHRyZXR1cm4gJ2NlbnRlcic7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FuZGlkYXRlczogeyB6b25lOiBDaGF0RHJvcFpvbmU7IHJhdGlvOiBudW1iZXIgfVtdID0gW107XG5cdFx0aWYgKGluTGVmdCkgeyBjYW5kaWRhdGVzLnB1c2goeyB6b25lOiAnbGVmdCcsIHJhdGlvOiBkaXN0TGVmdCAvIGVkZ2VYIH0pOyB9XG5cdFx0aWYgKGluUmlnaHQpIHsgY2FuZGlkYXRlcy5wdXNoKHsgem9uZTogJ3JpZ2h0JywgcmF0aW86IGRpc3RSaWdodCAvIGVkZ2VYIH0pOyB9XG5cdFx0aWYgKGluVG9wKSB7IGNhbmRpZGF0ZXMucHVzaCh7IHpvbmU6ICd0b3AnLCByYXRpbzogZGlzdFRvcCAvIGVkZ2VZIH0pOyB9XG5cdFx0aWYgKGluQm90dG9tKSB7IGNhbmRpZGF0ZXMucHVzaCh7IHpvbmU6ICdib3R0b20nLCByYXRpbzogZGlzdEJvdHRvbSAvIGVkZ2VZIH0pOyB9XG5cblx0XHRjYW5kaWRhdGVzLnNvcnQoKGEsIGIpID0+IGEucmF0aW8gLSBiLnJhdGlvKTtcblx0XHRyZXR1cm4gY2FuZGlkYXRlc1swXS56b25lO1xuXHR9XG5cblx0cHJpdmF0ZSBfZG9Qb3NpdGlvbk92ZXJsYXkob3B0aW9uczogeyBsZWZ0OiBzdHJpbmc7IHRvcDogc3RyaW5nOyB3aWR0aDogc3RyaW5nOyBoZWlnaHQ6IHN0cmluZyB9KTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5fY29udGFpbmVyKTtcblx0XHRjb25zdCBvdmVybGF5ID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5fb3ZlcmxheSk7XG5cdFx0Y29udGFpbmVyLnN0eWxlLmhlaWdodCA9ICcxMDAlJztcblx0XHRvdmVybGF5LnN0eWxlLmxlZnQgPSBvcHRpb25zLmxlZnQ7XG5cdFx0b3ZlcmxheS5zdHlsZS50b3AgPSBvcHRpb25zLnRvcDtcblx0XHRvdmVybGF5LnN0eWxlLndpZHRoID0gb3B0aW9ucy53aWR0aDtcblx0XHRvdmVybGF5LnN0eWxlLmhlaWdodCA9IG9wdGlvbnMuaGVpZ2h0O1xuXHR9XG5cblx0cHJpdmF0ZSBfaGlkZU92ZXJsYXkoKTogdm9pZCB7XG5cdFx0Y29uc3Qgb3ZlcmxheSA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuX292ZXJsYXkpO1xuXG5cdFx0dGhpcy5fZG9Qb3NpdGlvbk92ZXJsYXkoeyBsZWZ0OiAnMCcsIHRvcDogJzAnLCB3aWR0aDogJzEwMCUnLCBoZWlnaHQ6ICcxMDAlJyB9KTtcblx0XHRvdmVybGF5LnN0eWxlLm9wYWNpdHkgPSAnMCc7XG5cblx0XHR0aGlzLl9jdXJyZW50Wm9uZSA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnRhaW5zKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGVsZW1lbnQgPT09IHRoaXMuX2NvbnRhaW5lciB8fCBlbGVtZW50ID09PSB0aGlzLl9vdmVybGF5O1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLl9kaXNwb3NlZCA9IHRydWU7XG5cdH1cbn1cblxuLyoqXG4gKiBEcm9wIHRhcmdldCBmb3IgdGhlIGNoYXRzIGdyaWQgd2l0aGluIGEgc2Vzc2lvbi4gTGlzdGVucyBmb3IgY2hhdC10YWIgZHJhZ3NcbiAqIG92ZXIgdGhlIGdyb3VwcyBjb250YWluZXIsIGRpc3BsYXlzIGEgNS16b25lIG92ZXJsYXkgb24gd2hpY2hldmVyIGdyb3VwIGlzXG4gKiBiZWluZyBob3ZlcmVkLCBhbmQgY2FsbHMgYmFjayBpbnRvIHRoZSBvd25pbmcge0BsaW5rIENoYXRHcm91cHNWaWV3fSB0byBtb3ZlXG4gKiB0aGUgY2hhdCBpbnRvIGFuIGV4aXN0aW5nIGdyb3VwIChjZW50ZXIpIG9yIHNwbGl0IGl0IGludG8gYSBuZXcgZ3JvdXAgKGVkZ2UpLlxuICovXG5leHBvcnQgY2xhc3MgQ2hhdEdyb3VwRHJvcFRhcmdldCBleHRlbmRzIFRoZW1hYmxlIHtcblxuXHRwcml2YXRlIF9vdmVybGF5PzogQ2hhdEdyb3VwRHJvcE92ZXJsYXk7XG5cblx0cHJpdmF0ZSBfY291bnRlciA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kZWxlZ2F0ZTogSUNoYXRHcm91cERyb3BUYXJnZXREZWxlZ2F0ZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih0aGVtZVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IG92ZXJsYXkoKTogQ2hhdEdyb3VwRHJvcE92ZXJsYXkgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9vdmVybGF5ICYmICF0aGlzLl9vdmVybGF5LmRpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fb3ZlcmxheTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9jb250YWluZXIsIEV2ZW50VHlwZS5EUkFHX0VOVEVSLCBlID0+IHRoaXMuX29uRHJhZ0VudGVyKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2NvbnRhaW5lciwgRXZlbnRUeXBlLkRSQUdfTEVBVkUsICgpID0+IHRoaXMuX29uRHJhZ0xlYXZlKCkpKTtcblx0XHRmb3IgKGNvbnN0IHRhcmdldCBvZiBbdGhpcy5fY29udGFpbmVyLCBnZXRXaW5kb3codGhpcy5fY29udGFpbmVyKV0pIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YXJnZXQsIEV2ZW50VHlwZS5EUkFHX0VORCwgKCkgPT4gdGhpcy5fb25EcmFnRW5kKCkpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9vbkRyYWdFbnRlcihldmVudDogRHJhZ0V2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fY291bnRlcisrO1xuXG5cdFx0aWYgKCF0aGlzLl9kZWxlZ2F0ZS5pc0NoYXREcmFnKGV2ZW50KSkge1xuXHRcdFx0aWYgKGV2ZW50LmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0XHRldmVudC5kYXRhVHJhbnNmZXIuZHJvcEVmZmVjdCA9ICdub25lJztcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl91cGRhdGVDb250YWluZXIodHJ1ZSk7XG5cblx0XHRjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5vdmVybGF5ICYmICF0aGlzLm92ZXJsYXkuY29udGFpbnModGFyZ2V0KSkge1xuXHRcdFx0dGhpcy5fZGlzcG9zZU92ZXJsYXkoKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5vdmVybGF5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0R3JvdXAgPSB0aGlzLl9kZWxlZ2F0ZS5maW5kVGFyZ2V0R3JvdXAodGFyZ2V0KTtcblx0XHRpZiAoIXRhcmdldEdyb3VwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fb3ZlcmxheSA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdEdyb3VwRHJvcE92ZXJsYXksXG5cdFx0XHR0YXJnZXRHcm91cC5pZCxcblx0XHRcdHRhcmdldEdyb3VwLmVsZW1lbnQsXG5cdFx0XHQoZ3JvdXBJZDogbnVtYmVyLCB6b25lOiBDaGF0RHJvcFpvbmUsIGRhdGE6IElEcmFnZ2VkU2Vzc2lvbkNoYXQgfCB1bmRlZmluZWQpID0+IHRoaXMuX2RlbGVnYXRlLm9uQ2hhdERyb3AoZ3JvdXBJZCwgem9uZSwgZGF0YSksXG5cdFx0XHRldmVudCA9PiB0aGlzLl9kZWxlZ2F0ZS5pc0NoYXREcmFnKGV2ZW50KSxcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25EcmFnTGVhdmUoKTogdm9pZCB7XG5cdFx0dGhpcy5fY291bnRlci0tO1xuXG5cdFx0aWYgKHRoaXMuX2NvdW50ZXIgPT09IDApIHtcblx0XHRcdHRoaXMuX3VwZGF0ZUNvbnRhaW5lcihmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb25EcmFnRW5kKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvdW50ZXIgPSAwO1xuXG5cdFx0dGhpcy5fdXBkYXRlQ29udGFpbmVyKGZhbHNlKTtcblx0XHR0aGlzLl9kaXNwb3NlT3ZlcmxheSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ29udGFpbmVyKGlzRHJhZ2dlZE92ZXI6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC1ncm91cHMtZHJhZ2dlZC1vdmVyJywgaXNEcmFnZ2VkT3Zlcik7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9kaXNwb3NlT3ZlcmxheSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGlzcG9zZU92ZXJsYXkoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX292ZXJsYXkpIHtcblx0XHRcdHRoaXMuX292ZXJsYXkuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fb3ZlcmxheSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsR0FBRyx1QkFBdUIscUJBQXFCLGFBQWEsV0FBVyxpQkFBaUI7QUFDakcsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxlQUFlLGdCQUFnQjtBQUN4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
