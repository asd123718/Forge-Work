import { isFirefox } from "../../browser.js";
import { DataTransfers } from "../../dnd.js";
import { addDisposableListener, EventHelper, EventType } from "../../dom.js";
import { EventType as TouchEventType, Gesture } from "../../touch.js";
import { getDefaultHoverDelegate } from "../hover/hoverDelegateFactory.js";
import { SelectBox } from "../selectBox/selectBox.js";
import { Action, ActionRunner, Separator } from "../../../common/actions.js";
import { Disposable } from "../../../common/lifecycle.js";
import * as platform from "../../../common/platform.js";
import * as types from "../../../common/types.js";
import "./actionbar.css";
import * as nls from "../../../../nls.js";
import { getBaseLayerHoverDelegate } from "../hover/hoverDelegate2.js";
class BaseActionViewItem extends Disposable {
  constructor(context, action, options = {}) {
    super();
    this.options = options;
    this._context = context || this;
    this._action = action;
    if (action instanceof Action) {
      this._register(action.onDidChange((event) => {
        if (!this.element) {
          return;
        }
        this.handleActionChangeEvent(event);
      }));
    }
  }
  get action() {
    return this._action;
  }
  handleActionChangeEvent(event) {
    if (event.enabled !== void 0) {
      this.updateEnabled();
    }
    if (event.checked !== void 0) {
      this.updateChecked();
    }
    if (event.class !== void 0) {
      this.updateClass();
    }
    if (event.label !== void 0) {
      this.updateLabel();
      this.updateTooltip();
    }
    if (event.tooltip !== void 0) {
      this.updateTooltip();
    }
  }
  get actionRunner() {
    if (!this._actionRunner) {
      this._actionRunner = this._register(new ActionRunner());
    }
    return this._actionRunner;
  }
  set actionRunner(actionRunner) {
    this._actionRunner = actionRunner;
  }
  isEnabled() {
    return this._action.enabled;
  }
  setActionContext(newContext) {
    this._context = newContext;
  }
  render(container) {
    const element = this.element = container;
    this._register(Gesture.addTarget(container));
    const enableDragging = this.options && this.options.draggable;
    if (enableDragging) {
      container.draggable = true;
      if (isFirefox) {
        this._register(addDisposableListener(container, EventType.DRAG_START, (e) => e.dataTransfer?.setData(DataTransfers.TEXT, this._action.label)));
      }
    }
    this._register(addDisposableListener(element, TouchEventType.Tap, (e) => this.onClick(e, true)));
    this._register(addDisposableListener(element, EventType.MOUSE_DOWN, (e) => {
      if (!enableDragging) {
        EventHelper.stop(e, true);
      }
      if (this._action.enabled && e.button === 0) {
        element.classList.add("active");
      }
    }));
    if (platform.isMacintosh) {
      this._register(addDisposableListener(element, EventType.CONTEXT_MENU, (e) => {
        if (e.button === 0 && e.ctrlKey === true) {
          this.onClick(e);
        }
      }));
    }
    this._register(addDisposableListener(element, EventType.CLICK, (e) => {
      EventHelper.stop(e, true);
      if (!(this.options && this.options.isMenu)) {
        this.onClick(e);
      }
    }));
    this._register(addDisposableListener(element, EventType.DBLCLICK, (e) => {
      EventHelper.stop(e, true);
    }));
    [EventType.MOUSE_UP, EventType.MOUSE_OUT].forEach((event) => {
      this._register(addDisposableListener(element, event, (e) => {
        EventHelper.stop(e);
        element.classList.remove("active");
      }));
    });
  }
  onClick(event, preserveFocus = false) {
    EventHelper.stop(event, true);
    const context = types.isUndefinedOrNull(this._context) ? this.options?.useEventAsContext ? event : { preserveFocus } : this._context;
    this.actionRunner.run(this._action, context);
  }
  // Only set the tabIndex on the element once it is about to get focused
  // That way this element wont be a tab stop when it is not needed #106441
  focus() {
    if (this.element) {
      this.element.tabIndex = 0;
      this.element.focus();
      this.element.classList.add("focused");
    }
  }
  isFocused() {
    return !!this.element?.classList.contains("focused");
  }
  blur() {
    if (this.element) {
      this.element.blur();
      this.element.tabIndex = -1;
      this.element.classList.remove("focused");
    }
  }
  setFocusable(focusable) {
    if (this.element) {
      this.element.tabIndex = focusable ? 0 : -1;
    }
  }
  get trapsArrowNavigation() {
    return false;
  }
  updateEnabled() {
  }
  updateLabel() {
  }
  getClass() {
    return this.action.class;
  }
  getTooltip() {
    return this.action.tooltip;
  }
  getHoverContents() {
    return this.getTooltip();
  }
  getHoverOptions() {
    return void 0;
  }
  updateTooltip() {
    if (!this.element) {
      return;
    }
    const title = this.getHoverContents() ?? "";
    this.updateAriaLabel();
    if (!this.customHover && title !== "") {
      const hoverDelegate = this.options.hoverDelegate ?? getDefaultHoverDelegate("element");
      this.customHover = this._store.add(getBaseLayerHoverDelegate().setupManagedHover(hoverDelegate, this.element, title, this.getHoverOptions()));
    } else if (this.customHover) {
      this.customHover.update(title, this.getHoverOptions());
    }
  }
  updateAriaLabel() {
    if (this.element) {
      const title = this.getTooltip() ?? "";
      this.element.setAttribute("aria-label", title);
    }
  }
  updateClass() {
  }
  updateChecked() {
  }
  dispose() {
    if (this.element) {
      this.element.remove();
      this.element = void 0;
    }
    this._context = void 0;
    super.dispose();
  }
}
class ActionViewItem extends BaseActionViewItem {
  constructor(context, action, options) {
    options = {
      ...options,
      icon: options.icon !== void 0 ? options.icon : false,
      label: options.label !== void 0 ? options.label : true
    };
    super(context, action, options);
    this.options = options;
    this.cssClass = "";
  }
  render(container) {
    super.render(container);
    types.assertType(this.element);
    const label = document.createElement("a");
    label.classList.add("action-label");
    label.setAttribute("role", this.getDefaultAriaRole());
    this.label = label;
    this.element.appendChild(label);
    if (this.options.label && this.options.keybinding && !this.options.keybindingNotRenderedWithLabel) {
      const kbLabel = document.createElement("span");
      kbLabel.classList.add("keybinding");
      kbLabel.textContent = this.options.keybinding;
      this.element.appendChild(kbLabel);
    }
    this.updateClass();
    this.updateLabel();
    this.updateTooltip();
    this.updateEnabled();
    this.updateChecked();
  }
  getDefaultAriaRole() {
    if (this._action.id === Separator.ID) {
      return "presentation";
    } else {
      if (this.options.isMenu) {
        return "menuitem";
      } else if (this.options.isTabList) {
        return "tab";
      } else {
        return "button";
      }
    }
  }
  // Only set the tabIndex on the element once it is about to get focused
  // That way this element wont be a tab stop when it is not needed #106441
  focus() {
    if (this.label) {
      this.label.tabIndex = 0;
      this.label.focus();
    }
  }
  isFocused() {
    return !!this.label && this.label?.tabIndex === 0;
  }
  blur() {
    if (this.label) {
      this.label.tabIndex = -1;
    }
  }
  setFocusable(focusable) {
    if (this.label) {
      this.label.tabIndex = focusable ? 0 : -1;
    }
  }
  updateLabel() {
    if (this.options.label && this.label) {
      this.label.textContent = this.action.label;
    }
  }
  getTooltip() {
    let title = null;
    if (this.action.tooltip) {
      title = this.action.tooltip;
    } else if (this.action.label) {
      title = this.action.label;
      if (this.options.keybinding) {
        title = nls.localize({ key: "titleLabel", comment: ["action title", "action keybinding"] }, "{0} ({1})", title, this.options.keybinding);
      }
    }
    return title ?? void 0;
  }
  updateClass() {
    if (this.cssClass && this.label) {
      this.label.classList.remove(...this.cssClass.split(" "));
    }
    if (this.action.id === Separator.ID && this.action.class) {
      this.label?.classList.add(this.action.class);
    } else if (this.options.icon) {
      this.cssClass = this.getClass();
      if (this.label) {
        this.label.classList.add("codicon");
        if (this.cssClass) {
          this.label.classList.add(...this.cssClass.split(" "));
        }
      }
      this.updateEnabled();
    } else {
      this.label?.classList.remove("codicon");
    }
  }
  updateEnabled() {
    if (this.action.enabled) {
      if (this.label) {
        this.label.removeAttribute("aria-disabled");
        this.label.classList.remove("disabled");
      }
      this.element?.classList.remove("disabled");
    } else {
      if (this.label) {
        this.label.setAttribute("aria-disabled", "true");
        this.label.classList.add("disabled");
      }
      this.element?.classList.add("disabled");
    }
  }
  updateAriaLabel() {
    if (this.label) {
      const title = this.getTooltip() ?? "";
      this.label.setAttribute("aria-label", title);
    }
  }
  updateChecked() {
    if (this.label) {
      if (this.action.checked !== void 0) {
        this.label.classList.toggle("checked", this.action.checked);
        if (this.options.isTabList) {
          this.label.setAttribute("aria-selected", this.action.checked ? "true" : "false");
        } else {
          this.label.setAttribute("aria-pressed", this.action.checked ? "true" : "false");
          this.label.setAttribute("role", "button");
        }
      } else {
        this.label.classList.remove("checked");
        this.label.removeAttribute(this.options.isTabList ? "aria-selected" : "aria-pressed");
        this.label.setAttribute("role", this.getDefaultAriaRole());
      }
    }
  }
}
class SelectActionViewItem extends BaseActionViewItem {
  constructor(ctx, action, options, selected, contextViewProvider, styles, selectBoxOptions) {
    super(ctx, action);
    this.selectBox = new SelectBox(options, selected, contextViewProvider, styles, selectBoxOptions);
    this.selectBox.setFocusable(false);
    this._register(this.selectBox);
    this.registerListeners();
  }
  setOptions(options, selected) {
    this.selectBox.setOptions(options, selected);
  }
  select(index) {
    this.selectBox.select(index);
  }
  registerListeners() {
    this._register(this.selectBox.onDidSelect((e) => this.runAction(e.selected, e.index)));
  }
  runAction(option, index) {
    this.actionRunner.run(this._action, this.getActionContext(option, index));
  }
  getActionContext(option, index) {
    return option;
  }
  setFocusable(focusable) {
    this.selectBox.setFocusable(focusable);
  }
  focus() {
    this.selectBox?.focus();
  }
  blur() {
    this.selectBox?.blur();
  }
  render(container) {
    this.selectBox.render(container);
  }
}
export {
  ActionViewItem,
  BaseActionViewItem,
  SelectActionViewItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFx1aVxcYWN0aW9uYmFyXFxhY3Rpb25WaWV3SXRlbXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBpc0ZpcmVmb3ggfSBmcm9tICcuLi8uLi9icm93c2VyLmpzJztcbmltcG9ydCB7IERhdGFUcmFuc2ZlcnMgfSBmcm9tICcuLi8uLi9kbmQuanMnO1xuaW1wb3J0IHsgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBFdmVudEhlbHBlciwgRXZlbnRMaWtlLCBFdmVudFR5cGUgfSBmcm9tICcuLi8uLi9kb20uanMnO1xuaW1wb3J0IHsgRXZlbnRUeXBlIGFzIFRvdWNoRXZlbnRUeXBlLCBHZXN0dXJlIH0gZnJvbSAnLi4vLi4vdG91Y2guanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRWaWV3UHJvdmlkZXIgfSBmcm9tICcuLi9jb250ZXh0dmlldy9jb250ZXh0dmlldy5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IElIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vaG92ZXIvaG92ZXJEZWxlZ2F0ZS5qcyc7XG5pbXBvcnQgeyBJU2VsZWN0Qm94T3B0aW9ucywgSVNlbGVjdEJveFN0eWxlcywgSVNlbGVjdE9wdGlvbkl0ZW0sIFNlbGVjdEJveCB9IGZyb20gJy4uL3NlbGVjdEJveC9zZWxlY3RCb3guanMnO1xuaW1wb3J0IHsgSVRvZ2dsZVN0eWxlcyB9IGZyb20gJy4uL3RvZ2dsZS90b2dnbGUuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBBY3Rpb25SdW5uZXIsIElBY3Rpb24sIElBY3Rpb25DaGFuZ2VFdmVudCwgSUFjdGlvblJ1bm5lciwgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCAqIGFzIHR5cGVzIGZyb20gJy4uLy4uLy4uL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgJy4vYWN0aW9uYmFyLmNzcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB0eXBlIHsgSU1hbmFnZWRIb3ZlciwgSU1hbmFnZWRIb3ZlckNvbnRlbnQsIElNYW5hZ2VkSG92ZXJPcHRpb25zIH0gZnJvbSAnLi4vaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgZ2V0QmFzZUxheWVySG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uL2hvdmVyL2hvdmVyRGVsZWdhdGUyLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGRyYWdnYWJsZT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzTWVudT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzVGFiTGlzdD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHVzZUV2ZW50QXNDb250ZXh0PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaG92ZXJEZWxlZ2F0ZT86IElIb3ZlckRlbGVnYXRlO1xufVxuXG5leHBvcnQgY2xhc3MgQmFzZUFjdGlvblZpZXdJdGVtIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBY3Rpb25WaWV3SXRlbSB7XG5cblx0ZWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0X2NvbnRleHQ6IHVua25vd247XG5cdHJlYWRvbmx5IF9hY3Rpb246IElBY3Rpb247XG5cblx0cHJpdmF0ZSBjdXN0b21Ib3Zlcj86IElNYW5hZ2VkSG92ZXI7XG5cblx0Z2V0IGFjdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWN0aW9uUnVubmVyOiBJQWN0aW9uUnVubmVyIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRleHQ6IHVua25vd24sXG5cdFx0YWN0aW9uOiBJQWN0aW9uLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBvcHRpb25zOiBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyA9IHt9XG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9jb250ZXh0ID0gY29udGV4dCB8fCB0aGlzO1xuXHRcdHRoaXMuX2FjdGlvbiA9IGFjdGlvbjtcblxuXHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBBY3Rpb24pIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvbi5vbkRpZENoYW5nZShldmVudCA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5lbGVtZW50KSB7XG5cdFx0XHRcdFx0Ly8gd2UgaGF2ZSBub3QgYmVlbiByZW5kZXJlZCB5ZXQsIHNvIHRoZXJlXG5cdFx0XHRcdFx0Ly8gaXMgbm8gcG9pbnQgaW4gdXBkYXRpbmcgdGhlIFVJXG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5oYW5kbGVBY3Rpb25DaGFuZ2VFdmVudChldmVudCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVBY3Rpb25DaGFuZ2VFdmVudChldmVudDogSUFjdGlvbkNoYW5nZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKGV2ZW50LmVuYWJsZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy51cGRhdGVFbmFibGVkKCk7XG5cdFx0fVxuXG5cdFx0aWYgKGV2ZW50LmNoZWNrZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy51cGRhdGVDaGVja2VkKCk7XG5cdFx0fVxuXG5cdFx0aWYgKGV2ZW50LmNsYXNzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMudXBkYXRlQ2xhc3MoKTtcblx0XHR9XG5cblx0XHRpZiAoZXZlbnQubGFiZWwgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy51cGRhdGVMYWJlbCgpO1xuXHRcdFx0dGhpcy51cGRhdGVUb29sdGlwKCk7XG5cdFx0fVxuXG5cdFx0aWYgKGV2ZW50LnRvb2x0aXAgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy51cGRhdGVUb29sdGlwKCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGFjdGlvblJ1bm5lcigpOiBJQWN0aW9uUnVubmVyIHtcblx0XHRpZiAoIXRoaXMuX2FjdGlvblJ1bm5lcikge1xuXHRcdFx0dGhpcy5fYWN0aW9uUnVubmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvblJ1bm5lcigpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fYWN0aW9uUnVubmVyO1xuXHR9XG5cblx0c2V0IGFjdGlvblJ1bm5lcihhY3Rpb25SdW5uZXI6IElBY3Rpb25SdW5uZXIpIHtcblx0XHR0aGlzLl9hY3Rpb25SdW5uZXIgPSBhY3Rpb25SdW5uZXI7XG5cdH1cblxuXHRpc0VuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdGlvbi5lbmFibGVkO1xuXHR9XG5cblx0c2V0QWN0aW9uQ29udGV4dChuZXdDb250ZXh0OiB1bmtub3duKTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGV4dCA9IG5ld0NvbnRleHQ7XG5cdH1cblxuXHRyZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLmVsZW1lbnQgPSBjb250YWluZXI7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoR2VzdHVyZS5hZGRUYXJnZXQoY29udGFpbmVyKSk7XG5cblx0XHRjb25zdCBlbmFibGVEcmFnZ2luZyA9IHRoaXMub3B0aW9ucyAmJiB0aGlzLm9wdGlvbnMuZHJhZ2dhYmxlO1xuXHRcdGlmIChlbmFibGVEcmFnZ2luZykge1xuXHRcdFx0Y29udGFpbmVyLmRyYWdnYWJsZSA9IHRydWU7XG5cblx0XHRcdGlmIChpc0ZpcmVmb3gpIHtcblx0XHRcdFx0Ly8gRmlyZWZveDogcmVxdWlyZXMgdG8gc2V0IGEgdGV4dCBkYXRhIHRyYW5zZmVyIHRvIGdldCBnb2luZ1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIoY29udGFpbmVyLCBFdmVudFR5cGUuRFJBR19TVEFSVCwgZSA9PiBlLmRhdGFUcmFuc2Zlcj8uc2V0RGF0YShEYXRhVHJhbnNmZXJzLlRFWFQsIHRoaXMuX2FjdGlvbi5sYWJlbCkpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIoZWxlbWVudCwgVG91Y2hFdmVudFR5cGUuVGFwLCBlID0+IHRoaXMub25DbGljayhlLCB0cnVlKSkpOyAvLyBQcmVzZXJ2ZSBmb2N1cyBvbiB0YXAgIzEyNTQ3MFxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsIEV2ZW50VHlwZS5NT1VTRV9ET1dOLCBlID0+IHtcblx0XHRcdGlmICghZW5hYmxlRHJhZ2dpbmcpIHtcblx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTsgLy8gZG8gbm90IHJ1biB3aGVuIGRyYWdnaW5nIGlzIG9uIGJlY2F1c2UgdGhhdCB3b3VsZCBkaXNhYmxlIGl0XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9hY3Rpb24uZW5hYmxlZCAmJiBlLmJ1dHRvbiA9PT0gMCkge1xuXHRcdFx0XHRlbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmIChwbGF0Zm9ybS5pc01hY2ludG9zaCkge1xuXHRcdFx0Ly8gbWFjT1M6IGFsbG93IHRvIHRyaWdnZXIgdGhlIGJ1dHRvbiB3aGVuIGhvbGRpbmcgQ3RybCtrZXkgYW5kIHByZXNzaW5nIHRoZVxuXHRcdFx0Ly8gbWFpbiBtb3VzZSBidXR0b24uIFRoaXMgaXMgZm9yIHNjZW5hcmlvcyB3aGVyZSBlLmcuIHNvbWUgaW50ZXJhY3Rpb24gZm9yY2VzXG5cdFx0XHQvLyB0aGUgQ3RybCtrZXkgdG8gYmUgcHJlc3NlZCBhbmQgaG9sZCBidXQgdGhlIHVzZXIgc3RpbGwgd2FudHMgdG8gaW50ZXJhY3Rcblx0XHRcdC8vIHdpdGggdGhlIGFjdGlvbnMgKGZvciBleGFtcGxlIHF1aWNrIGFjY2VzcyBpbiBxdWljayBuYXZpZ2F0aW9uIG1vZGUpLlxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsIEV2ZW50VHlwZS5DT05URVhUX01FTlUsIGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5idXR0b24gPT09IDAgJiYgZS5jdHJsS2V5ID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0dGhpcy5vbkNsaWNrKGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsIEV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0XHRFdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXG5cdFx0XHQvLyBtZW51cyBkbyBub3QgdXNlIHRoZSBjbGljayBldmVudFxuXHRcdFx0aWYgKCEodGhpcy5vcHRpb25zICYmIHRoaXMub3B0aW9ucy5pc01lbnUpKSB7XG5cdFx0XHRcdHRoaXMub25DbGljayhlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIoZWxlbWVudCwgRXZlbnRUeXBlLkRCTENMSUNLLCBlID0+IHtcblx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0fSkpO1xuXG5cdFx0W0V2ZW50VHlwZS5NT1VTRV9VUCwgRXZlbnRUeXBlLk1PVVNFX09VVF0uZm9yRWFjaChldmVudCA9PiB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIoZWxlbWVudCwgZXZlbnQsIGUgPT4ge1xuXHRcdFx0XHRFdmVudEhlbHBlci5zdG9wKGUpO1xuXHRcdFx0XHRlbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpO1xuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXHR9XG5cblx0b25DbGljayhldmVudDogRXZlbnRMaWtlLCBwcmVzZXJ2ZUZvY3VzID0gZmFsc2UpOiB2b2lkIHtcblx0XHRFdmVudEhlbHBlci5zdG9wKGV2ZW50LCB0cnVlKTtcblxuXHRcdGNvbnN0IGNvbnRleHQgPSB0eXBlcy5pc1VuZGVmaW5lZE9yTnVsbCh0aGlzLl9jb250ZXh0KSA/IHRoaXMub3B0aW9ucz8udXNlRXZlbnRBc0NvbnRleHQgPyBldmVudCA6IHsgcHJlc2VydmVGb2N1cyB9IDogdGhpcy5fY29udGV4dDtcblx0XHR0aGlzLmFjdGlvblJ1bm5lci5ydW4odGhpcy5fYWN0aW9uLCBjb250ZXh0KTtcblx0fVxuXG5cdC8vIE9ubHkgc2V0IHRoZSB0YWJJbmRleCBvbiB0aGUgZWxlbWVudCBvbmNlIGl0IGlzIGFib3V0IHRvIGdldCBmb2N1c2VkXG5cdC8vIFRoYXQgd2F5IHRoaXMgZWxlbWVudCB3b250IGJlIGEgdGFiIHN0b3Agd2hlbiBpdCBpcyBub3QgbmVlZGVkICMxMDY0NDFcblx0Zm9jdXMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0dGhpcy5lbGVtZW50LnRhYkluZGV4ID0gMDtcblx0XHRcdHRoaXMuZWxlbWVudC5mb2N1cygpO1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2ZvY3VzZWQnKTtcblx0XHR9XG5cdH1cblxuXHRpc0ZvY3VzZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5lbGVtZW50Py5jbGFzc0xpc3QuY29udGFpbnMoJ2ZvY3VzZWQnKTtcblx0fVxuXG5cdGJsdXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0dGhpcy5lbGVtZW50LmJsdXIoKTtcblx0XHRcdHRoaXMuZWxlbWVudC50YWJJbmRleCA9IC0xO1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2ZvY3VzZWQnKTtcblx0XHR9XG5cdH1cblxuXHRzZXRGb2N1c2FibGUoZm9jdXNhYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0dGhpcy5lbGVtZW50LnRhYkluZGV4ID0gZm9jdXNhYmxlID8gMCA6IC0xO1xuXHRcdH1cblx0fVxuXG5cdGdldCB0cmFwc0Fycm93TmF2aWdhdGlvbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcm90ZWN0ZWQgdXBkYXRlRW5hYmxlZCgpOiB2b2lkIHtcblx0XHQvLyBpbXBsZW1lbnQgaW4gc3ViY2xhc3Ncblx0fVxuXG5cdHByb3RlY3RlZCB1cGRhdGVMYWJlbCgpOiB2b2lkIHtcblx0XHQvLyBpbXBsZW1lbnQgaW4gc3ViY2xhc3Ncblx0fVxuXG5cdHByb3RlY3RlZCBnZXRDbGFzcygpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmFjdGlvbi5jbGFzcztcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRUb29sdGlwKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuYWN0aW9uLnRvb2x0aXA7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0SG92ZXJDb250ZW50cygpOiBJTWFuYWdlZEhvdmVyQ29udGVudCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0VG9vbHRpcCgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldEhvdmVyT3B0aW9ucygpOiBJTWFuYWdlZEhvdmVyT3B0aW9ucyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByb3RlY3RlZCB1cGRhdGVUb29sdGlwKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5lbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRpdGxlID0gdGhpcy5nZXRIb3ZlckNvbnRlbnRzKCkgPz8gJyc7XG5cdFx0dGhpcy51cGRhdGVBcmlhTGFiZWwoKTtcblxuXHRcdGlmICghdGhpcy5jdXN0b21Ib3ZlciAmJiB0aXRsZSAhPT0gJycpIHtcblx0XHRcdGNvbnN0IGhvdmVyRGVsZWdhdGUgPSB0aGlzLm9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSA/PyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpO1xuXHRcdFx0dGhpcy5jdXN0b21Ib3ZlciA9IHRoaXMuX3N0b3JlLmFkZChnZXRCYXNlTGF5ZXJIb3ZlckRlbGVnYXRlKCkuc2V0dXBNYW5hZ2VkSG92ZXIoaG92ZXJEZWxlZ2F0ZSwgdGhpcy5lbGVtZW50LCB0aXRsZSwgdGhpcy5nZXRIb3Zlck9wdGlvbnMoKSkpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5jdXN0b21Ib3Zlcikge1xuXHRcdFx0dGhpcy5jdXN0b21Ib3Zlci51cGRhdGUodGl0bGUsIHRoaXMuZ2V0SG92ZXJPcHRpb25zKCkpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCB1cGRhdGVBcmlhTGFiZWwoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0Y29uc3QgdGl0bGUgPSB0aGlzLmdldFRvb2x0aXAoKSA/PyAnJztcblx0XHRcdHRoaXMuZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB0aXRsZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIHVwZGF0ZUNsYXNzKCk6IHZvaWQge1xuXHRcdC8vIGltcGxlbWVudCBpbiBzdWJjbGFzc1xuXHR9XG5cblx0cHJvdGVjdGVkIHVwZGF0ZUNoZWNrZWQoKTogdm9pZCB7XG5cdFx0Ly8gaW1wbGVtZW50IGluIHN1YmNsYXNzXG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmVsZW1lbnQpIHtcblx0XHRcdHRoaXMuZWxlbWVudC5yZW1vdmUoKTtcblx0XHRcdHRoaXMuZWxlbWVudCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fY29udGV4dCA9IHVuZGVmaW5lZDtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWN0aW9uVmlld0l0ZW1PcHRpb25zIGV4dGVuZHMgSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMge1xuXHRpY29uPzogYm9vbGVhbjtcblx0bGFiZWw/OiBib29sZWFuO1xuXHRyZWFkb25seSBrZXliaW5kaW5nPzogc3RyaW5nIHwgbnVsbDtcblx0cmVhZG9ubHkga2V5YmluZGluZ05vdFJlbmRlcmVkV2l0aExhYmVsPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgdG9nZ2xlU3R5bGVzPzogSVRvZ2dsZVN0eWxlcztcbn1cblxuZXhwb3J0IGNsYXNzIEFjdGlvblZpZXdJdGVtIGV4dGVuZHMgQmFzZUFjdGlvblZpZXdJdGVtIHtcblxuXHRwcm90ZWN0ZWQgbGFiZWw6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVhZG9ubHkgb3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucztcblxuXHRwcml2YXRlIGNzc0NsYXNzPzogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKGNvbnRleHQ6IHVua25vd24sIGFjdGlvbjogSUFjdGlvbiwgb3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucykge1xuXHRcdG9wdGlvbnMgPSB7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0aWNvbjogb3B0aW9ucy5pY29uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmljb24gOiBmYWxzZSxcblx0XHRcdGxhYmVsOiBvcHRpb25zLmxhYmVsICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmxhYmVsIDogdHJ1ZSxcblx0XHR9O1xuXHRcdHN1cGVyKGNvbnRleHQsIGFjdGlvbiwgb3B0aW9ucyk7XG5cblx0XHR0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdHRoaXMuY3NzQ2xhc3MgPSAnJztcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0dHlwZXMuYXNzZXJ0VHlwZSh0aGlzLmVsZW1lbnQpO1xuXG5cdFx0Y29uc3QgbGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG5cdFx0bGFiZWwuY2xhc3NMaXN0LmFkZCgnYWN0aW9uLWxhYmVsJyk7XG5cdFx0bGFiZWwuc2V0QXR0cmlidXRlKCdyb2xlJywgdGhpcy5nZXREZWZhdWx0QXJpYVJvbGUoKSk7XG5cblx0XHR0aGlzLmxhYmVsID0gbGFiZWw7XG5cdFx0dGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKGxhYmVsKTtcblxuXHRcdGlmICh0aGlzLm9wdGlvbnMubGFiZWwgJiYgdGhpcy5vcHRpb25zLmtleWJpbmRpbmcgJiYgIXRoaXMub3B0aW9ucy5rZXliaW5kaW5nTm90UmVuZGVyZWRXaXRoTGFiZWwpIHtcblx0XHRcdGNvbnN0IGtiTGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0XHRrYkxhYmVsLmNsYXNzTGlzdC5hZGQoJ2tleWJpbmRpbmcnKTtcblx0XHRcdGtiTGFiZWwudGV4dENvbnRlbnQgPSB0aGlzLm9wdGlvbnMua2V5YmluZGluZztcblx0XHRcdHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZChrYkxhYmVsKTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZUNsYXNzKCk7XG5cdFx0dGhpcy51cGRhdGVMYWJlbCgpO1xuXHRcdHRoaXMudXBkYXRlVG9vbHRpcCgpO1xuXHRcdHRoaXMudXBkYXRlRW5hYmxlZCgpO1xuXHRcdHRoaXMudXBkYXRlQ2hlY2tlZCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXREZWZhdWx0QXJpYVJvbGUoKTogJ3ByZXNlbnRhdGlvbicgfCAnbWVudWl0ZW0nIHwgJ3RhYicgfCAnYnV0dG9uJyB7XG5cdFx0aWYgKHRoaXMuX2FjdGlvbi5pZCA9PT0gU2VwYXJhdG9yLklEKSB7XG5cdFx0XHRyZXR1cm4gJ3ByZXNlbnRhdGlvbic7IC8vIEEgc2VwYXJhdG9yIGlzIGEgcHJlc2VudGF0aW9uIGl0ZW1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy5pc01lbnUpIHtcblx0XHRcdFx0cmV0dXJuICdtZW51aXRlbSc7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMub3B0aW9ucy5pc1RhYkxpc3QpIHtcblx0XHRcdFx0cmV0dXJuICd0YWInO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuICdidXR0b24nO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIE9ubHkgc2V0IHRoZSB0YWJJbmRleCBvbiB0aGUgZWxlbWVudCBvbmNlIGl0IGlzIGFib3V0IHRvIGdldCBmb2N1c2VkXG5cdC8vIFRoYXQgd2F5IHRoaXMgZWxlbWVudCB3b250IGJlIGEgdGFiIHN0b3Agd2hlbiBpdCBpcyBub3QgbmVlZGVkICMxMDY0NDFcblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubGFiZWwpIHtcblx0XHRcdHRoaXMubGFiZWwudGFiSW5kZXggPSAwO1xuXHRcdFx0dGhpcy5sYWJlbC5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGlzRm9jdXNlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLmxhYmVsICYmIHRoaXMubGFiZWw/LnRhYkluZGV4ID09PSAwO1xuXHR9XG5cblx0b3ZlcnJpZGUgYmx1cigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5sYWJlbCkge1xuXHRcdFx0dGhpcy5sYWJlbC50YWJJbmRleCA9IC0xO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIHNldEZvY3VzYWJsZShmb2N1c2FibGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5sYWJlbCkge1xuXHRcdFx0dGhpcy5sYWJlbC50YWJJbmRleCA9IGZvY3VzYWJsZSA/IDAgOiAtMTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlTGFiZWwoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5sYWJlbCAmJiB0aGlzLmxhYmVsKSB7XG5cdFx0XHR0aGlzLmxhYmVsLnRleHRDb250ZW50ID0gdGhpcy5hY3Rpb24ubGFiZWw7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldFRvb2x0aXAoKSB7XG5cdFx0bGV0IHRpdGxlOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblxuXHRcdGlmICh0aGlzLmFjdGlvbi50b29sdGlwKSB7XG5cdFx0XHR0aXRsZSA9IHRoaXMuYWN0aW9uLnRvb2x0aXA7XG5cblx0XHR9IGVsc2UgaWYgKHRoaXMuYWN0aW9uLmxhYmVsKSB7XG5cdFx0XHR0aXRsZSA9IHRoaXMuYWN0aW9uLmxhYmVsO1xuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy5rZXliaW5kaW5nKSB7XG5cdFx0XHRcdHRpdGxlID0gbmxzLmxvY2FsaXplKHsga2V5OiAndGl0bGVMYWJlbCcsIGNvbW1lbnQ6IFsnYWN0aW9uIHRpdGxlJywgJ2FjdGlvbiBrZXliaW5kaW5nJ10gfSwgXCJ7MH0gKHsxfSlcIiwgdGl0bGUsIHRoaXMub3B0aW9ucy5rZXliaW5kaW5nKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRpdGxlID8/IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVDbGFzcygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jc3NDbGFzcyAmJiB0aGlzLmxhYmVsKSB7XG5cdFx0XHR0aGlzLmxhYmVsLmNsYXNzTGlzdC5yZW1vdmUoLi4udGhpcy5jc3NDbGFzcy5zcGxpdCgnICcpKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuYWN0aW9uLmlkID09PSBTZXBhcmF0b3IuSUQgJiYgdGhpcy5hY3Rpb24uY2xhc3MpIHtcblx0XHRcdHRoaXMubGFiZWw/LmNsYXNzTGlzdC5hZGQodGhpcy5hY3Rpb24uY2xhc3MpO1xuXG5cdFx0fSBlbHNlIGlmICh0aGlzLm9wdGlvbnMuaWNvbikge1xuXHRcdFx0dGhpcy5jc3NDbGFzcyA9IHRoaXMuZ2V0Q2xhc3MoKTtcblxuXHRcdFx0aWYgKHRoaXMubGFiZWwpIHtcblx0XHRcdFx0dGhpcy5sYWJlbC5jbGFzc0xpc3QuYWRkKCdjb2RpY29uJyk7XG5cdFx0XHRcdGlmICh0aGlzLmNzc0NsYXNzKSB7XG5cdFx0XHRcdFx0dGhpcy5sYWJlbC5jbGFzc0xpc3QuYWRkKC4uLnRoaXMuY3NzQ2xhc3Muc3BsaXQoJyAnKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy51cGRhdGVFbmFibGVkKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubGFiZWw/LmNsYXNzTGlzdC5yZW1vdmUoJ2NvZGljb24nKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlRW5hYmxlZCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5hY3Rpb24uZW5hYmxlZCkge1xuXHRcdFx0aWYgKHRoaXMubGFiZWwpIHtcblx0XHRcdFx0dGhpcy5sYWJlbC5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnKTtcblx0XHRcdFx0dGhpcy5sYWJlbC5jbGFzc0xpc3QucmVtb3ZlKCdkaXNhYmxlZCcpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmVsZW1lbnQ/LmNsYXNzTGlzdC5yZW1vdmUoJ2Rpc2FibGVkJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh0aGlzLmxhYmVsKSB7XG5cdFx0XHRcdHRoaXMubGFiZWwuc2V0QXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJywgJ3RydWUnKTtcblx0XHRcdFx0dGhpcy5sYWJlbC5jbGFzc0xpc3QuYWRkKCdkaXNhYmxlZCcpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmVsZW1lbnQ/LmNsYXNzTGlzdC5hZGQoJ2Rpc2FibGVkJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZUFyaWFMYWJlbCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5sYWJlbCkge1xuXHRcdFx0Y29uc3QgdGl0bGUgPSB0aGlzLmdldFRvb2x0aXAoKSA/PyAnJztcblx0XHRcdHRoaXMubGFiZWwuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGl0bGUpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVDaGVja2VkKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmxhYmVsKSB7XG5cdFx0XHRpZiAodGhpcy5hY3Rpb24uY2hlY2tlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMubGFiZWwuY2xhc3NMaXN0LnRvZ2dsZSgnY2hlY2tlZCcsIHRoaXMuYWN0aW9uLmNoZWNrZWQpO1xuXHRcdFx0XHRpZiAodGhpcy5vcHRpb25zLmlzVGFiTGlzdCkge1xuXHRcdFx0XHRcdHRoaXMubGFiZWwuc2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJywgdGhpcy5hY3Rpb24uY2hlY2tlZCA/ICd0cnVlJyA6ICdmYWxzZScpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMubGFiZWwuc2V0QXR0cmlidXRlKCdhcmlhLXByZXNzZWQnLCB0aGlzLmFjdGlvbi5jaGVja2VkID8gJ3RydWUnIDogJ2ZhbHNlJyk7XG5cdFx0XHRcdFx0dGhpcy5sYWJlbC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubGFiZWwuY2xhc3NMaXN0LnJlbW92ZSgnY2hlY2tlZCcpO1xuXHRcdFx0XHR0aGlzLmxhYmVsLnJlbW92ZUF0dHJpYnV0ZSh0aGlzLm9wdGlvbnMuaXNUYWJMaXN0ID8gJ2FyaWEtc2VsZWN0ZWQnIDogJ2FyaWEtcHJlc3NlZCcpO1xuXHRcdFx0XHR0aGlzLmxhYmVsLnNldEF0dHJpYnV0ZSgncm9sZScsIHRoaXMuZ2V0RGVmYXVsdEFyaWFSb2xlKCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2VsZWN0QWN0aW9uVmlld0l0ZW08VCA9IHN0cmluZz4gZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXHRwcm90ZWN0ZWQgc2VsZWN0Qm94OiBTZWxlY3RCb3g7XG5cblx0Y29uc3RydWN0b3IoY3R4OiB1bmtub3duLCBhY3Rpb246IElBY3Rpb24sIG9wdGlvbnM6IElTZWxlY3RPcHRpb25JdGVtW10sIHNlbGVjdGVkOiBudW1iZXIsIGNvbnRleHRWaWV3UHJvdmlkZXI6IElDb250ZXh0Vmlld1Byb3ZpZGVyLCBzdHlsZXM6IElTZWxlY3RCb3hTdHlsZXMsIHNlbGVjdEJveE9wdGlvbnM/OiBJU2VsZWN0Qm94T3B0aW9ucykge1xuXHRcdHN1cGVyKGN0eCwgYWN0aW9uKTtcblxuXHRcdHRoaXMuc2VsZWN0Qm94ID0gbmV3IFNlbGVjdEJveChvcHRpb25zLCBzZWxlY3RlZCwgY29udGV4dFZpZXdQcm92aWRlciwgc3R5bGVzLCBzZWxlY3RCb3hPcHRpb25zKTtcblx0XHR0aGlzLnNlbGVjdEJveC5zZXRGb2N1c2FibGUoZmFsc2UpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWxlY3RCb3gpO1xuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHNldE9wdGlvbnMob3B0aW9uczogSVNlbGVjdE9wdGlvbkl0ZW1bXSwgc2VsZWN0ZWQ/OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLnNlbGVjdEJveC5zZXRPcHRpb25zKG9wdGlvbnMsIHNlbGVjdGVkKTtcblx0fVxuXG5cdHNlbGVjdChpbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5zZWxlY3RCb3guc2VsZWN0KGluZGV4KTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWxlY3RCb3gub25EaWRTZWxlY3QoZSA9PiB0aGlzLnJ1bkFjdGlvbihlLnNlbGVjdGVkLCBlLmluZGV4KSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJ1bkFjdGlvbihvcHRpb246IHN0cmluZywgaW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuYWN0aW9uUnVubmVyLnJ1bih0aGlzLl9hY3Rpb24sIHRoaXMuZ2V0QWN0aW9uQ29udGV4dChvcHRpb24sIGluZGV4KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0QWN0aW9uQ29udGV4dChvcHRpb246IHN0cmluZywgaW5kZXg6IG51bWJlcik6IFQgfCBzdHJpbmcge1xuXHRcdHJldHVybiBvcHRpb247XG5cdH1cblxuXHRvdmVycmlkZSBzZXRGb2N1c2FibGUoZm9jdXNhYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5zZWxlY3RCb3guc2V0Rm9jdXNhYmxlKGZvY3VzYWJsZSk7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLnNlbGVjdEJveD8uZm9jdXMoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGJsdXIoKTogdm9pZCB7XG5cdFx0dGhpcy5zZWxlY3RCb3g/LmJsdXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5zZWxlY3RCb3gucmVuZGVyKGNvbnRhaW5lcik7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsdUJBQXVCLGFBQXdCLGlCQUFpQjtBQUN6RSxTQUFTLGFBQWEsZ0JBQWdCLGVBQWU7QUFHckQsU0FBUywrQkFBK0I7QUFFeEMsU0FBaUUsaUJBQWlCO0FBRWxGLFNBQVMsUUFBUSxjQUEwRCxpQkFBaUI7QUFDNUYsU0FBUyxrQkFBa0I7QUFDM0IsWUFBWSxjQUFjO0FBQzFCLFlBQVksV0FBVztBQUN2QixPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBRXJCLFNBQVMsaUNBQWlDO0FBVW5DLE1BQU0sMkJBQTJCLFdBQXNDO0FBQUEsRUFlN0UsWUFDQyxTQUNBLFFBQ21CLFVBQXNDLENBQUMsR0FDekQ7QUFDRCxVQUFNO0FBRmE7QUFJbkIsU0FBSyxXQUFXLFdBQVc7QUFDM0IsU0FBSyxVQUFVO0FBRWYsUUFBSSxrQkFBa0IsUUFBUTtBQUM3QixXQUFLLFVBQVUsT0FBTyxZQUFZLFdBQVM7QUFDMUMsWUFBSSxDQUFDLEtBQUssU0FBUztBQUdsQjtBQUFBLFFBQ0Q7QUFFQSxhQUFLLHdCQUF3QixLQUFLO0FBQUEsTUFDbkMsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUFBLEVBQ0Q7QUFBQSxFQTNCQSxJQUFJLFNBQVM7QUFDWixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUEyQlEsd0JBQXdCLE9BQWlDO0FBQ2hFLFFBQUksTUFBTSxZQUFZLFFBQVc7QUFDaEMsV0FBSyxjQUFjO0FBQUEsSUFDcEI7QUFFQSxRQUFJLE1BQU0sWUFBWSxRQUFXO0FBQ2hDLFdBQUssY0FBYztBQUFBLElBQ3BCO0FBRUEsUUFBSSxNQUFNLFVBQVUsUUFBVztBQUM5QixXQUFLLFlBQVk7QUFBQSxJQUNsQjtBQUVBLFFBQUks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
