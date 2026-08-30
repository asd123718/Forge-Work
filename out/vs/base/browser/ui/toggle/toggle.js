import { Codicon } from "../../../common/codicons.js";
import { Emitter } from "../../../common/event.js";
import { isMarkdownString } from "../../../common/htmlContent.js";
import { getCodiconAriaLabel, stripIcons } from "../../../common/iconLabels.js";
import { KeyCode } from "../../../common/keyCodes.js";
import { ThemeIcon } from "../../../common/themables.js";
import { $, addDisposableGenericMouseDownListener, addDisposableListener, EventType, isActiveElement, isHTMLElement } from "../../dom.js";
import { BaseActionViewItem } from "../actionbar/actionViewItems.js";
import { HoverStyle } from "../hover/hover.js";
import { getBaseLayerHoverDelegate } from "../hover/hoverDelegate2.js";
import { Widget } from "../widget.js";
import "./toggle.css";
const unthemedToggleStyles = {
  inputActiveOptionBorder: "#007ACC00",
  inputActiveOptionForeground: "#FFFFFF",
  inputActiveOptionBackground: "#0E639C50"
};
class ToggleActionViewItem extends BaseActionViewItem {
  constructor(context, action, options) {
    super(context, action, options);
    const title = this.options.keybinding ? `${this._action.label} (${this.options.keybinding})` : this._action.label;
    this.toggle = this._register(new Toggle({
      actionClassName: this._action.class,
      isChecked: !!this._action.checked,
      title,
      notFocusable: true,
      inputActiveOptionBackground: options.toggleStyles?.inputActiveOptionBackground,
      inputActiveOptionBorder: options.toggleStyles?.inputActiveOptionBorder,
      inputActiveOptionForeground: options.toggleStyles?.inputActiveOptionForeground
    }));
    this._register(this.toggle.onChange(() => {
      this._action.checked = !!this.toggle && this.toggle.checked;
    }));
  }
  render(container) {
    this.element = container;
    this.element.appendChild(this.toggle.domNode);
    this.updateChecked();
    this.updateEnabled();
  }
  updateEnabled() {
    if (this.toggle) {
      if (this.isEnabled()) {
        this.toggle.enable();
        this.element?.classList.remove("disabled");
      } else {
        this.toggle.disable();
        this.element?.classList.add("disabled");
      }
    }
  }
  updateChecked() {
    this.toggle.checked = !!this._action.checked;
  }
  updateLabel() {
    const title = this.options.keybinding ? `${this._action.label} (${this.options.keybinding})` : this._action.label;
    this.toggle.setTitle(title);
  }
  focus() {
    this.toggle.domNode.tabIndex = 0;
    this.toggle.focus();
  }
  blur() {
    this.toggle.domNode.tabIndex = -1;
    this.toggle.domNode.blur();
  }
  setFocusable(focusable) {
    this.toggle.domNode.tabIndex = focusable ? 0 : -1;
  }
}
class Toggle extends Widget {
  constructor(opts) {
    super();
    this._onChange = this._register(new Emitter());
    this._onKeyDown = this._register(new Emitter());
    this._opts = opts;
    this._title = this._opts.title;
    this._checked = this._opts.isChecked;
    const classes = ["monaco-custom-toggle"];
    if (this._opts.icon) {
      this._icon = this._opts.icon;
      classes.push(...ThemeIcon.asClassNameArray(this._icon));
    }
    if (this._opts.actionClassName) {
      classes.push(...this._opts.actionClassName.split(" "));
    }
    if (this._checked) {
      classes.push("checked");
    }
    this.domNode = document.createElement("div");
    this._register(getBaseLayerHoverDelegate().setupDelayedHover(this.domNode, () => ({
      content: !isMarkdownString(this._title) && !isHTMLElement(this._title) ? stripIcons(this._title) : this._title,
      style: HoverStyle.Pointer
    }), this._opts.hoverLifecycleOptions));
    this.domNode.classList.add(...classes);
    if (!this._opts.notFocusable) {
      this.domNode.tabIndex = 0;
    }
    this.domNode.setAttribute("role", "checkbox");
    this.domNode.setAttribute("aria-checked", String(this._checked));
    this.setTitle(this._opts.title);
    this.applyStyles();
    this.onclick(this.domNode, (ev) => {
      if (this.enabled) {
        this.checked = !this._checked;
        this._onChange.fire(false);
        ev.preventDefault();
        ev.stopPropagation();
      }
    });
    this._register(this.ignoreGesture(this.domNode));
    this.onkeydown(this.domNode, (keyboardEvent) => {
      if (!this.enabled) {
        return;
      }
      if (keyboardEvent.keyCode === KeyCode.Space || keyboardEvent.keyCode === KeyCode.Enter) {
        this.checked = !this._checked;
        this._onChange.fire(true);
        keyboardEvent.preventDefault();
        keyboardEvent.stopPropagation();
        return;
      }
      this._onKeyDown.fire(keyboardEvent);
    });
  }
  get onChange() {
    return this._onChange.event;
  }
  get onKeyDown() {
    return this._onKeyDown.event;
  }
  get enabled() {
    return this.domNode.getAttribute("aria-disabled") !== "true";
  }
  focus() {
    this.domNode.focus();
  }
  get checked() {
    return this._checked;
  }
  set checked(newIsChecked) {
    this._checked = newIsChecked;
    this.domNode.setAttribute("aria-checked", String(this._checked));
    this.domNode.classList.toggle("checked", this._checked);
    this.applyStyles();
  }
  setIcon(icon) {
    if (this._icon) {
      this.domNode.classList.remove(...ThemeIcon.asClassNameArray(this._icon));
    }
    this._icon = icon;
    if (this._icon) {
      this.domNode.classList.add(...ThemeIcon.asClassNameArray(this._icon));
    }
  }
  width() {
    return 2 + 2 + 2 + 16;
  }
  applyStyles() {
    if (this.domNode) {
      this.domNode.style.borderColor = this._checked && this._opts.inputActiveOptionBorder || "";
      this.domNode.style.color = this._checked && this._opts.inputActiveOptionForeground || "inherit";
      this.domNode.style.backgroundColor = this._checked && this._opts.inputActiveOptionBackground || "";
    }
  }
  enable() {
    this.domNode.setAttribute("aria-disabled", String(false));
    this.domNode.classList.remove("disabled");
    if (!this._opts.notFocusable) {
      this.domNode.tabIndex = 0;
    }
  }
  disable() {
    this.domNode.setAttribute("aria-disabled", String(true));
    this.domNode.classList.add("disabled");
    if (!this._opts.notFocusable) {
      this.domNode.tabIndex = -1;
    }
  }
  setTitle(newTitle) {
    this._title = newTitle;
    const ariaLabel = typeof newTitle === "string" ? newTitle : isMarkdownString(newTitle) ? newTitle.value : newTitle.textContent;
    this.domNode.setAttribute("aria-label", getCodiconAriaLabel(ariaLabel));
  }
  set visible(visible) {
    this.domNode.style.display = visible ? "" : "none";
  }
  get visible() {
    return this.domNode.style.display !== "none";
  }
}
class BaseCheckbox extends Widget {
  constructor(checkbox, domNode, styles) {
    super();
    this.checkbox = checkbox;
    this.domNode = domNode;
    this.styles = styles;
    this._onChange = this._register(new Emitter());
    this.onChange = this._onChange.event;
    this.applyStyles();
  }
  get enabled() {
    return this.checkbox.enabled;
  }
  focus() {
    this.domNode.focus();
  }
  hasFocus() {
    return isActiveElement(this.domNode);
  }
  enable() {
    this.checkbox.enable();
    this.applyStyles(true);
  }
  disable() {
    this.checkbox.disable();
    this.applyStyles(false);
  }
  setTitle(newTitle) {
    this.checkbox.setTitle(newTitle);
  }
  applyStyles(enabled = this.enabled) {
    this.domNode.style.color = (enabled ? this.styles.checkboxForeground : this.styles.checkboxDisabledForeground) || "";
    this.domNode.style.backgroundColor = (enabled ? this.styles.checkboxBackground : this.styles.checkboxDisabledBackground) || "";
    this.domNode.style.borderColor = (enabled ? this.styles.checkboxBorder : this.styles.checkboxDisabledBackground) || "";
    const size = this.styles.size || 18;
    this.domNode.style.width = this.domNode.style.height = this.domNode.style.fontSize = `${size}px`;
    this.domNode.style.fontSize = `${size - 2}px`;
  }
}
BaseCheckbox.CLASS_NAME = "monaco-checkbox";
class Checkbox extends BaseCheckbox {
  constructor(title, isChecked, styles) {
    const toggle = new Toggle({ title, isChecked, icon: Codicon.check, actionClassName: BaseCheckbox.CLASS_NAME, hoverLifecycleOptions: styles.hoverLifecycleOptions, ...unthemedToggleStyles });
    super(toggle, toggle.domNode, styles);
    this._register(toggle);
    this._register(this.checkbox.onChange((keyboard) => {
      this.applyStyles();
      this._onChange.fire(keyboard);
    }));
  }
  get checked() {
    return this.checkbox.checked;
  }
  set checked(newIsChecked) {
    this.checkbox.checked = newIsChecked;
    this.applyStyles();
  }
  applyStyles(enabled) {
    if (this.checkbox.checked) {
      this.checkbox.setIcon(Codicon.check);
    } else {
      this.checkbox.setIcon(void 0);
    }
    super.applyStyles(enabled);
  }
}
class TriStateCheckbox extends BaseCheckbox {
  constructor(title, _state, styles) {
    let icon;
    switch (_state) {
      case true:
        icon = Codicon.check;
        break;
      case "mixed":
        icon = Codicon.dash;
        break;
      case false:
        icon = void 0;
        break;
    }
    const checkbox = new Toggle({
      title,
      isChecked: _state === true,
      icon,
      actionClassName: Checkbox.CLASS_NAME,
      hoverLifecycleOptions: styles.hoverLifecycleOptions,
      ...unthemedToggleStyles
    });
    super(
      checkbox,
      checkbox.domNode,
      styles
    );
    this._state = _state;
    this._register(checkbox);
    this._register(this.checkbox.onChange((keyboard) => {
      this._state = this.checkbox.checked;
      this.applyStyles();
      this._onChange.fire(keyboard);
    }));
  }
  get checked() {
    return this._state;
  }
  set checked(newState) {
    if (this._state !== newState) {
      this._state = newState;
      this.checkbox.checked = newState === true;
      this.applyStyles();
    }
  }
  applyStyles(enabled) {
    switch (this._state) {
      case true:
        this.checkbox.setIcon(Codicon.check);
        break;
      case "mixed":
        this.checkbox.setIcon(Codicon.dash);
        break;
      case false:
        this.checkbox.setIcon(void 0);
        break;
    }
    super.applyStyles(enabled);
  }
}
class CheckboxActionViewItem extends BaseActionViewItem {
  constructor(context, action, options) {
    super(context, action, options);
    this.toggle = this._register(new Checkbox(this._action.label, !!this._action.checked, options.checkboxStyles));
    this._register(this.toggle.onChange(() => this.onChange()));
  }
  render(container) {
    this.element = container;
    this.element.classList.add("checkbox-action-item");
    this.element.appendChild(this.toggle.domNode);
    if (this.options.label && this._action.label) {
      const label = this.element.appendChild($("span.checkbox-label", void 0, this._action.label));
      this._register(addDisposableGenericMouseDownListener(label, (e) => {
        e.preventDefault();
        if (this.isEnabled()) {
          this.focus();
        }
      }));
      this._register(addDisposableListener(label, EventType.CLICK, (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (this.isEnabled()) {
          this.toggle.checked = !this.toggle.checked;
          this.onChange();
        }
      }));
    }
    this.updateEnabled();
    this.updateClass();
    this.updateChecked();
    this.updateTooltip();
  }
  onChange() {
    this._action.checked = !!this.toggle && this.toggle.checked;
    this.actionRunner.run(this._action, this._context);
  }
  updateEnabled() {
    if (this.isEnabled()) {
      this.toggle.enable();
    } else {
      this.toggle.disable();
    }
    if (this.action.enabled) {
      this.element?.classList.remove("disabled");
    } else {
      this.element?.classList.add("disabled");
    }
  }
  updateChecked() {
    this.toggle.checked = !!this._action.checked;
  }
  updateClass() {
    if (this.cssClass) {
      this.toggle.domNode.classList.remove(...this.cssClass.split(" "));
    }
    this.cssClass = this.getClass();
    if (this.cssClass) {
      this.toggle.domNode.classList.add(...this.cssClass.split(" "));
    }
  }
  focus() {
    this.toggle.domNode.tabIndex = 0;
    this.toggle.focus();
  }
  blur() {
    this.toggle.domNode.tabIndex = -1;
    this.toggle.domNode.blur();
  }
  setFocusable(focusable) {
    this.toggle.domNode.tabIndex = focusable ? 0 : -1;
  }
}
function createToggleActionViewItemProvider(toggleStyles) {
  return (action, options) => {
    if (action.checked !== void 0) {
      return new ToggleActionViewItem(null, action, { ...options, toggleStyles });
    }
    return void 0;
  };
}
export {
  Checkbox,
  CheckboxActionViewItem,
  Toggle,
  ToggleActionViewItem,
  TriStateCheckbox,
  createToggleActionViewItemProvider,
  unthemedToggleStyles
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFx1aVxcdG9nZ2xlXFx0b2dnbGUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcsIGlzTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgZ2V0Q29kaWNvbkFyaWFMYWJlbCwgc3RyaXBJY29ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyAkLCBhZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlRG93bkxpc3RlbmVyLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIEV2ZW50VHlwZSwgaXNBY3RpdmVFbGVtZW50LCBpc0hUTUxFbGVtZW50IH0gZnJvbSAnLi4vLi4vZG9tLmpzJztcbmltcG9ydCB7IElLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4va2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBCYXNlQWN0aW9uVmlld0l0ZW0sIElBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbVByb3ZpZGVyIH0gZnJvbSAnLi4vYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBIb3ZlclN0eWxlLCBJSG92ZXJMaWZlY3ljbGVPcHRpb25zIH0gZnJvbSAnLi4vaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgZ2V0QmFzZUxheWVySG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uL2hvdmVyL2hvdmVyRGVsZWdhdGUyLmpzJztcbmltcG9ydCB7IFdpZGdldCB9IGZyb20gJy4uL3dpZGdldC5qcyc7XG5pbXBvcnQgJy4vdG9nZ2xlLmNzcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRvZ2dsZU9wdHMgZXh0ZW5kcyBJVG9nZ2xlU3R5bGVzIHtcblx0cmVhZG9ubHkgYWN0aW9uQ2xhc3NOYW1lPzogc3RyaW5nO1xuXHRyZWFkb25seSBpY29uPzogVGhlbWVJY29uO1xuXHRyZWFkb25seSB0aXRsZTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHwgSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGlzQ2hlY2tlZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgbm90Rm9jdXNhYmxlPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaG92ZXJMaWZlY3ljbGVPcHRpb25zPzogSUhvdmVyTGlmZWN5Y2xlT3B0aW9ucztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVG9nZ2xlU3R5bGVzIHtcblx0cmVhZG9ubHkgaW5wdXRBY3RpdmVPcHRpb25Cb3JkZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgaW5wdXRBY3RpdmVPcHRpb25Gb3JlZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGlucHV0QWN0aXZlT3B0aW9uQmFja2dyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGVja2JveFN0eWxlcyB7XG5cdHJlYWRvbmx5IGNoZWNrYm94QmFja2dyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBjaGVja2JveEJvcmRlcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBjaGVja2JveEZvcmVncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgY2hlY2tib3hEaXNhYmxlZEJhY2tncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgY2hlY2tib3hEaXNhYmxlZEZvcmVncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgc2l6ZT86IG51bWJlcjtcblx0cmVhZG9ubHkgaG92ZXJMaWZlY3ljbGVPcHRpb25zPzogSUhvdmVyTGlmZWN5Y2xlT3B0aW9ucztcbn1cblxuZXhwb3J0IGNvbnN0IHVudGhlbWVkVG9nZ2xlU3R5bGVzID0ge1xuXHRpbnB1dEFjdGl2ZU9wdGlvbkJvcmRlcjogJyMwMDdBQ0MwMCcsXG5cdGlucHV0QWN0aXZlT3B0aW9uRm9yZWdyb3VuZDogJyNGRkZGRkYnLFxuXHRpbnB1dEFjdGl2ZU9wdGlvbkJhY2tncm91bmQ6ICcjMEU2MzlDNTAnXG59O1xuXG5leHBvcnQgY2xhc3MgVG9nZ2xlQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXG5cdHByb3RlY3RlZCByZWFkb25seSB0b2dnbGU6IFRvZ2dsZTtcblxuXHRjb25zdHJ1Y3Rvcihjb250ZXh0OiB1bmtub3duLCBhY3Rpb246IElBY3Rpb24sIG9wdGlvbnM6IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMpIHtcblx0XHRzdXBlcihjb250ZXh0LCBhY3Rpb24sIG9wdGlvbnMpO1xuXG5cdFx0Y29uc3QgdGl0bGUgPSAoPElBY3Rpb25WaWV3SXRlbU9wdGlvbnM+dGhpcy5vcHRpb25zKS5rZXliaW5kaW5nID9cblx0XHRcdGAke3RoaXMuX2FjdGlvbi5sYWJlbH0gKCR7KDxJQWN0aW9uVmlld0l0ZW1PcHRpb25zPnRoaXMub3B0aW9ucykua2V5YmluZGluZ30pYCA6IHRoaXMuX2FjdGlvbi5sYWJlbDtcblx0XHR0aGlzLnRvZ2dsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUb2dnbGUoe1xuXHRcdFx0YWN0aW9uQ2xhc3NOYW1lOiB0aGlzLl9hY3Rpb24uY2xhc3MsXG5cdFx0XHRpc0NoZWNrZWQ6ICEhdGhpcy5fYWN0aW9uLmNoZWNrZWQsXG5cdFx0XHR0aXRsZSxcblx0XHRcdG5vdEZvY3VzYWJsZTogdHJ1ZSxcblx0XHRcdGlucHV0QWN0aXZlT3B0aW9uQmFja2dyb3VuZDogb3B0aW9ucy50b2dnbGVTdHlsZXM/LmlucHV0QWN0aXZlT3B0aW9uQmFja2dyb3VuZCxcblx0XHRcdGlucHV0QWN0aXZlT3B0aW9uQm9yZGVyOiBvcHRpb25zLnRvZ2dsZVN0eWxlcz8uaW5wdXRBY3RpdmVPcHRpb25Cb3JkZXIsXG5cdFx0XHRpbnB1dEFjdGl2ZU9wdGlvbkZvcmVncm91bmQ6IG9wdGlvbnMudG9nZ2xlU3R5bGVzPy5pbnB1dEFjdGl2ZU9wdGlvbkZvcmVncm91bmQsXG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudG9nZ2xlLm9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX2FjdGlvbi5jaGVja2VkID0gISF0aGlzLnRvZ2dsZSAmJiB0aGlzLnRvZ2dsZS5jaGVja2VkO1xuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5lbGVtZW50ID0gY29udGFpbmVyO1xuXHRcdHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLnRvZ2dsZS5kb21Ob2RlKTtcblxuXHRcdHRoaXMudXBkYXRlQ2hlY2tlZCgpO1xuXHRcdHRoaXMudXBkYXRlRW5hYmxlZCgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZUVuYWJsZWQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudG9nZ2xlKSB7XG5cdFx0XHRpZiAodGhpcy5pc0VuYWJsZWQoKSkge1xuXHRcdFx0XHR0aGlzLnRvZ2dsZS5lbmFibGUoKTtcblx0XHRcdFx0dGhpcy5lbGVtZW50Py5jbGFzc0xpc3QucmVtb3ZlKCdkaXNhYmxlZCcpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy50b2dnbGUuZGlzYWJsZSgpO1xuXHRcdFx0XHR0aGlzLmVsZW1lbnQ/LmNsYXNzTGlzdC5hZGQoJ2Rpc2FibGVkJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZUNoZWNrZWQoKTogdm9pZCB7XG5cdFx0dGhpcy50b2dnbGUuY2hlY2tlZCA9ICEhdGhpcy5fYWN0aW9uLmNoZWNrZWQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlTGFiZWwoKTogdm9pZCB7XG5cdFx0Y29uc3QgdGl0bGUgPSAoPElBY3Rpb25WaWV3SXRlbU9wdGlvbnM+dGhpcy5vcHRpb25zKS5rZXliaW5kaW5nID9cblx0XHRcdGAke3RoaXMuX2FjdGlvbi5sYWJlbH0gKCR7KDxJQWN0aW9uVmlld0l0ZW1PcHRpb25zPnRoaXMub3B0aW9ucykua2V5YmluZGluZ30pYCA6IHRoaXMuX2FjdGlvbi5sYWJlbDtcblx0XHR0aGlzLnRvZ2dsZS5zZXRUaXRsZSh0aXRsZSk7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLnRvZ2dsZS5kb21Ob2RlLnRhYkluZGV4ID0gMDtcblx0XHR0aGlzLnRvZ2dsZS5mb2N1cygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYmx1cigpOiB2b2lkIHtcblx0XHR0aGlzLnRvZ2dsZS5kb21Ob2RlLnRhYkluZGV4ID0gLTE7XG5cdFx0dGhpcy50b2dnbGUuZG9tTm9kZS5ibHVyKCk7XG5cdH1cblxuXHRvdmVycmlkZSBzZXRGb2N1c2FibGUoZm9jdXNhYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy50b2dnbGUuZG9tTm9kZS50YWJJbmRleCA9IGZvY3VzYWJsZSA/IDAgOiAtMTtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBUb2dnbGUgZXh0ZW5kcyBXaWRnZXQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdGdldCBvbkNoYW5nZSgpOiBFdmVudDxib29sZWFuIC8qIHZpYSBrZXlib2FyZCAqLz4geyByZXR1cm4gdGhpcy5fb25DaGFuZ2UuZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbktleURvd24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJS2V5Ym9hcmRFdmVudD4oKSk7XG5cdGdldCBvbktleURvd24oKTogRXZlbnQ8SUtleWJvYXJkRXZlbnQ+IHsgcmV0dXJuIHRoaXMuX29uS2V5RG93bi5ldmVudDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29wdHM6IElUb2dnbGVPcHRzO1xuXHRwcml2YXRlIF90aXRsZTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHwgSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX2ljb246IFRoZW1lSWNvbiB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSBfY2hlY2tlZDogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3RvcihvcHRzOiBJVG9nZ2xlT3B0cykge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9vcHRzID0gb3B0cztcblx0XHR0aGlzLl90aXRsZSA9IHRoaXMuX29wdHMudGl0bGU7XG5cdFx0dGhpcy5fY2hlY2tlZCA9IHRoaXMuX29wdHMuaXNDaGVja2VkO1xuXG5cdFx0Y29uc3QgY2xhc3NlcyA9IFsnbW9uYWNvLWN1c3RvbS10b2dnbGUnXTtcblx0XHRpZiAodGhpcy5fb3B0cy5pY29uKSB7XG5cdFx0XHR0aGlzLl9pY29uID0gdGhpcy5fb3B0cy5pY29uO1xuXHRcdFx0Y2xhc3Nlcy5wdXNoKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KHRoaXMuX2ljb24pKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX29wdHMuYWN0aW9uQ2xhc3NOYW1lKSB7XG5cdFx0XHRjbGFzc2VzLnB1c2goLi4udGhpcy5fb3B0cy5hY3Rpb25DbGFzc05hbWUuc3BsaXQoJyAnKSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9jaGVja2VkKSB7XG5cdFx0XHRjbGFzc2VzLnB1c2goJ2NoZWNrZWQnKTtcblx0XHR9XG5cblx0XHR0aGlzLmRvbU5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLl9yZWdpc3RlcihnZXRCYXNlTGF5ZXJIb3ZlckRlbGVnYXRlKCkuc2V0dXBEZWxheWVkSG92ZXIodGhpcy5kb21Ob2RlLCAoKSA9PiAoe1xuXHRcdFx0Y29udGVudDogIWlzTWFya2Rvd25TdHJpbmcodGhpcy5fdGl0bGUpICYmICFpc0hUTUxFbGVtZW50KHRoaXMuX3RpdGxlKSA/IHN0cmlwSWNvbnModGhpcy5fdGl0bGUpIDogdGhpcy5fdGl0bGUsXG5cdFx0XHRzdHlsZTogSG92ZXJTdHlsZS5Qb2ludGVyLFxuXHRcdH0pLCB0aGlzLl9vcHRzLmhvdmVyTGlmZWN5Y2xlT3B0aW9ucykpO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKC4uLmNsYXNzZXMpO1xuXHRcdGlmICghdGhpcy5fb3B0cy5ub3RGb2N1c2FibGUpIHtcblx0XHRcdHRoaXMuZG9tTm9kZS50YWJJbmRleCA9IDA7XG5cdFx0fVxuXHRcdHRoaXMuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnY2hlY2tib3gnKTtcblx0XHR0aGlzLmRvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnLCBTdHJpbmcodGhpcy5fY2hlY2tlZCkpO1xuXG5cdFx0dGhpcy5zZXRUaXRsZSh0aGlzLl9vcHRzLnRpdGxlKTtcblx0XHR0aGlzLmFwcGx5U3R5bGVzKCk7XG5cblx0XHR0aGlzLm9uY2xpY2sodGhpcy5kb21Ob2RlLCAoZXYpID0+IHtcblx0XHRcdGlmICh0aGlzLmVuYWJsZWQpIHtcblx0XHRcdFx0dGhpcy5jaGVja2VkID0gIXRoaXMuX2NoZWNrZWQ7XG5cdFx0XHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUoZmFsc2UpO1xuXHRcdFx0XHRldi5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRldi5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaWdub3JlR2VzdHVyZSh0aGlzLmRvbU5vZGUpKTtcblxuXHRcdHRoaXMub25rZXlkb3duKHRoaXMuZG9tTm9kZSwgKGtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGlmICghdGhpcy5lbmFibGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGtleWJvYXJkRXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5TcGFjZSB8fCBrZXlib2FyZEV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuRW50ZXIpIHtcblx0XHRcdFx0dGhpcy5jaGVja2VkID0gIXRoaXMuX2NoZWNrZWQ7XG5cdFx0XHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUodHJ1ZSk7XG5cdFx0XHRcdGtleWJvYXJkRXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0a2V5Ym9hcmRFdmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9vbktleURvd24uZmlyZShrZXlib2FyZEV2ZW50KTtcblx0XHR9KTtcblx0fVxuXG5cdGdldCBlbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmRvbU5vZGUuZ2V0QXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJykgIT09ICd0cnVlJztcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuZG9tTm9kZS5mb2N1cygpO1xuXHR9XG5cblx0Z2V0IGNoZWNrZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoZWNrZWQ7XG5cdH1cblxuXHRzZXQgY2hlY2tlZChuZXdJc0NoZWNrZWQ6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9jaGVja2VkID0gbmV3SXNDaGVja2VkO1xuXG5cdFx0dGhpcy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJywgU3RyaW5nKHRoaXMuX2NoZWNrZWQpKTtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnY2hlY2tlZCcsIHRoaXMuX2NoZWNrZWQpO1xuXG5cdFx0dGhpcy5hcHBseVN0eWxlcygpO1xuXHR9XG5cblx0c2V0SWNvbihpY29uOiBUaGVtZUljb24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faWNvbikge1xuXHRcdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkodGhpcy5faWNvbikpO1xuXHRcdH1cblx0XHR0aGlzLl9pY29uID0gaWNvbjtcblx0XHRpZiAodGhpcy5faWNvbikge1xuXHRcdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkodGhpcy5faWNvbikpO1xuXHRcdH1cblx0fVxuXG5cdHdpZHRoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIDIgLyptYXJnaW4gbGVmdCovICsgMiAvKmJvcmRlciovICsgMiAvKnBhZGRpbmcqLyArIDE2IC8qIGljb24gd2lkdGggKi87XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXBwbHlTdHlsZXMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZG9tTm9kZSkge1xuXHRcdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmJvcmRlckNvbG9yID0gKHRoaXMuX2NoZWNrZWQgJiYgdGhpcy5fb3B0cy5pbnB1dEFjdGl2ZU9wdGlvbkJvcmRlcikgfHwgJyc7XG5cdFx0XHR0aGlzLmRvbU5vZGUuc3R5bGUuY29sb3IgPSAodGhpcy5fY2hlY2tlZCAmJiB0aGlzLl9vcHRzLmlucHV0QWN0aXZlT3B0aW9uRm9yZWdyb3VuZCkgfHwgJ2luaGVyaXQnO1xuXHRcdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICh0aGlzLl9jaGVja2VkICYmIHRoaXMuX29wdHMuaW5wdXRBY3RpdmVPcHRpb25CYWNrZ3JvdW5kKSB8fCAnJztcblx0XHR9XG5cdH1cblxuXHRlbmFibGUoKTogdm9pZCB7XG5cdFx0dGhpcy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1kaXNhYmxlZCcsIFN0cmluZyhmYWxzZSkpO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdkaXNhYmxlZCcpO1xuXHRcdGlmICghdGhpcy5fb3B0cy5ub3RGb2N1c2FibGUpIHtcblx0XHRcdHRoaXMuZG9tTm9kZS50YWJJbmRleCA9IDA7XG5cdFx0fVxuXHR9XG5cblx0ZGlzYWJsZSgpOiB2b2lkIHtcblx0XHR0aGlzLmRvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJywgU3RyaW5nKHRydWUpKTtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnZGlzYWJsZWQnKTtcblx0XHRpZiAoIXRoaXMuX29wdHMubm90Rm9jdXNhYmxlKSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUudGFiSW5kZXggPSAtMTtcblx0XHR9XG5cdH1cblxuXHRzZXRUaXRsZShuZXdUaXRsZTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHwgSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl90aXRsZSA9IG5ld1RpdGxlO1xuXG5cdFx0Y29uc3QgYXJpYUxhYmVsID0gdHlwZW9mIG5ld1RpdGxlID09PSAnc3RyaW5nJyA/IG5ld1RpdGxlIDogaXNNYXJrZG93blN0cmluZyhuZXdUaXRsZSkgPyBuZXdUaXRsZS52YWx1ZSA6IG5ld1RpdGxlLnRleHRDb250ZW50O1xuXG5cdFx0dGhpcy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGdldENvZGljb25BcmlhTGFiZWwoYXJpYUxhYmVsKSk7XG5cdH1cblxuXHRzZXQgdmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmRpc3BsYXkgPSB2aXNpYmxlID8gJycgOiAnbm9uZSc7XG5cdH1cblxuXHRnZXQgdmlzaWJsZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5kb21Ob2RlLnN0eWxlLmRpc3BsYXkgIT09ICdub25lJztcblx0fVxufVxuXG5cbmFic3RyYWN0IGNsYXNzIEJhc2VDaGVja2JveCBleHRlbmRzIFdpZGdldCB7XG5cdHN0YXRpYyByZWFkb25seSBDTEFTU19OQU1FID0gJ21vbmFjby1jaGVja2JveCc7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkNoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvbkNoYW5nZTogRXZlbnQ8Ym9vbGVhbiAvKiB2aWEga2V5Ym9hcmQgKi8+ID0gdGhpcy5fb25DaGFuZ2UuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IGNoZWNrYm94OiBUb2dnbGUsXG5cdFx0cmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IHN0eWxlczogSUNoZWNrYm94U3R5bGVzXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmFwcGx5U3R5bGVzKCk7XG5cdH1cblxuXHRnZXQgZW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jaGVja2JveC5lbmFibGVkO1xuXHR9XG5cblx0Zm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5kb21Ob2RlLmZvY3VzKCk7XG5cdH1cblxuXHRoYXNGb2N1cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaXNBY3RpdmVFbGVtZW50KHRoaXMuZG9tTm9kZSk7XG5cdH1cblxuXHRlbmFibGUoKTogdm9pZCB7XG5cdFx0dGhpcy5jaGVja2JveC5lbmFibGUoKTtcblx0XHR0aGlzLmFwcGx5U3R5bGVzKHRydWUpO1xuXHR9XG5cblx0ZGlzYWJsZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNoZWNrYm94LmRpc2FibGUoKTtcblx0XHR0aGlzLmFwcGx5U3R5bGVzKGZhbHNlKTtcblx0fVxuXG5cdHNldFRpdGxlKG5ld1RpdGxlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmNoZWNrYm94LnNldFRpdGxlKG5ld1RpdGxlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhcHBseVN0eWxlcyhlbmFibGVkID0gdGhpcy5lbmFibGVkKTogdm9pZCB7XG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmNvbG9yID0gKGVuYWJsZWQgPyB0aGlzLnN0eWxlcy5jaGVja2JveEZvcmVncm91bmQgOiB0aGlzLnN0eWxlcy5jaGVja2JveERpc2FibGVkRm9yZWdyb3VuZCkgfHwgJyc7XG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IChlbmFibGVkID8gdGhpcy5zdHlsZXMuY2hlY2tib3hCYWNrZ3JvdW5kIDogdGhpcy5zdHlsZXMuY2hlY2tib3hEaXNhYmxlZEJhY2tncm91bmQpIHx8ICcnO1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5ib3JkZXJDb2xvciA9IChlbmFibGVkID8gdGhpcy5zdHlsZXMuY2hlY2tib3hCb3JkZXIgOiB0aGlzLnN0eWxlcy5jaGVja2JveERpc2FibGVkQmFja2dyb3VuZCkgfHwgJyc7XG5cblx0XHRjb25zdCBzaXplID0gdGhpcy5zdHlsZXMuc2l6ZSB8fCAxODtcblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUud2lkdGggPVxuXHRcdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmhlaWdodCA9XG5cdFx0XHR0aGlzLmRvbU5vZGUuc3R5bGUuZm9udFNpemUgPSBgJHtzaXplfXB4YDtcblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUuZm9udFNpemUgPSBgJHtzaXplIC0gMn1weGA7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoZWNrYm94IGV4dGVuZHMgQmFzZUNoZWNrYm94IHtcblx0Y29uc3RydWN0b3IodGl0bGU6IHN0cmluZywgaXNDaGVja2VkOiBib29sZWFuLCBzdHlsZXM6IElDaGVja2JveFN0eWxlcykge1xuXHRcdGNvbnN0IHRvZ2dsZSA9IG5ldyBUb2dnbGUoeyB0aXRsZSwgaXNDaGVja2VkLCBpY29uOiBDb2RpY29uLmNoZWNrLCBhY3Rpb25DbGFzc05hbWU6IEJhc2VDaGVja2JveC5DTEFTU19OQU1FLCBob3ZlckxpZmVjeWNsZU9wdGlvbnM6IHN0eWxlcy5ob3ZlckxpZmVjeWNsZU9wdGlvbnMsIC4uLnVudGhlbWVkVG9nZ2xlU3R5bGVzIH0pO1xuXHRcdHN1cGVyKHRvZ2dsZSwgdG9nZ2xlLmRvbU5vZGUsIHN0eWxlcyk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b2dnbGUpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hlY2tib3gub25DaGFuZ2Uoa2V5Ym9hcmQgPT4ge1xuXHRcdFx0dGhpcy5hcHBseVN0eWxlcygpO1xuXHRcdFx0dGhpcy5fb25DaGFuZ2UuZmlyZShrZXlib2FyZCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0Z2V0IGNoZWNrZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY2hlY2tib3guY2hlY2tlZDtcblx0fVxuXG5cdHNldCBjaGVja2VkKG5ld0lzQ2hlY2tlZDogYm9vbGVhbikge1xuXHRcdHRoaXMuY2hlY2tib3guY2hlY2tlZCA9IG5ld0lzQ2hlY2tlZDtcblx0XHR0aGlzLmFwcGx5U3R5bGVzKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXBwbHlTdHlsZXMoZW5hYmxlZD86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jaGVja2JveC5jaGVja2VkKSB7XG5cdFx0XHR0aGlzLmNoZWNrYm94LnNldEljb24oQ29kaWNvbi5jaGVjayk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY2hlY2tib3guc2V0SWNvbih1bmRlZmluZWQpO1xuXHRcdH1cblx0XHRzdXBlci5hcHBseVN0eWxlcyhlbmFibGVkKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVHJpU3RhdGVDaGVja2JveCBleHRlbmRzIEJhc2VDaGVja2JveCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHRpdGxlOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSBfc3RhdGU6IGJvb2xlYW4gfCAnbWl4ZWQnLFxuXHRcdHN0eWxlczogSUNoZWNrYm94U3R5bGVzXG5cdCkge1xuXHRcdGxldCBpY29uOiBUaGVtZUljb24gfCB1bmRlZmluZWQ7XG5cdFx0c3dpdGNoIChfc3RhdGUpIHtcblx0XHRcdGNhc2UgdHJ1ZTpcblx0XHRcdFx0aWNvbiA9IENvZGljb24uY2hlY2s7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnbWl4ZWQnOlxuXHRcdFx0XHRpY29uID0gQ29kaWNvbi5kYXNoO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgZmFsc2U6XG5cdFx0XHRcdGljb24gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRjb25zdCBjaGVja2JveCA9IG5ldyBUb2dnbGUoe1xuXHRcdFx0dGl0bGUsXG5cdFx0XHRpc0NoZWNrZWQ6IF9zdGF0ZSA9PT0gdHJ1ZSxcblx0XHRcdGljb24sXG5cdFx0XHRhY3Rpb25DbGFzc05hbWU6IENoZWNrYm94LkNMQVNTX05BTUUsXG5cdFx0XHRob3ZlckxpZmVjeWNsZU9wdGlvbnM6IHN0eWxlcy5ob3ZlckxpZmVjeWNsZU9wdGlvbnMsXG5cdFx0XHQuLi51bnRoZW1lZFRvZ2dsZVN0eWxlc1xuXHRcdH0pO1xuXHRcdHN1cGVyKFxuXHRcdFx0Y2hlY2tib3gsXG5cdFx0XHRjaGVja2JveC5kb21Ob2RlLFxuXHRcdFx0c3R5bGVzXG5cdFx0KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNoZWNrYm94KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoZWNrYm94Lm9uQ2hhbmdlKGtleWJvYXJkID0+IHtcblx0XHRcdHRoaXMuX3N0YXRlID0gdGhpcy5jaGVja2JveC5jaGVja2VkO1xuXHRcdFx0dGhpcy5hcHBseVN0eWxlcygpO1xuXHRcdFx0dGhpcy5fb25DaGFuZ2UuZmlyZShrZXlib2FyZCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0Z2V0IGNoZWNrZWQoKTogYm9vbGVhbiB8ICdtaXhlZCcge1xuXHRcdHJldHVybiB0aGlzLl9zdGF0ZTtcblx0fVxuXG5cdHNldCBjaGVja2VkKG5ld1N0YXRlOiBib29sZWFuIHwgJ21peGVkJykge1xuXHRcdGlmICh0aGlzLl9zdGF0ZSAhPT0gbmV3U3RhdGUpIHtcblx0XHRcdHRoaXMuX3N0YXRlID0gbmV3U3RhdGU7XG5cdFx0XHR0aGlzLmNoZWNrYm94LmNoZWNrZWQgPSBuZXdTdGF0ZSA9PT0gdHJ1ZTtcblx0XHRcdHRoaXMuYXBwbHlTdHlsZXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXBwbHlTdHlsZXMoZW5hYmxlZD86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRzd2l0Y2ggKHRoaXMuX3N0YXRlKSB7XG5cdFx0XHRjYXNlIHRydWU6XG5cdFx0XHRcdHRoaXMuY2hlY2tib3guc2V0SWNvbihDb2RpY29uLmNoZWNrKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdtaXhlZCc6XG5cdFx0XHRcdHRoaXMuY2hlY2tib3guc2V0SWNvbihDb2RpY29uLmRhc2gpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgZmFsc2U6XG5cdFx0XHRcdHRoaXMuY2hlY2tib3guc2V0SWNvbih1bmRlZmluZWQpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdFx0c3VwZXIuYXBwbHlTdHlsZXMoZW5hYmxlZCk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hlY2tib3hBY3Rpb25WaWV3SXRlbU9wdGlvbnMgZXh0ZW5kcyBJQWN0aW9uVmlld0l0ZW1PcHRpb25zIHtcblx0Y2hlY2tib3hTdHlsZXM6IElDaGVja2JveFN0eWxlcztcbn1cblxuZXhwb3J0IGNsYXNzIENoZWNrYm94QWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXG5cdHByb3RlY3RlZCByZWFkb25seSB0b2dnbGU6IENoZWNrYm94O1xuXHRwcml2YXRlIGNzc0NsYXNzPzogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKGNvbnRleHQ6IHVua25vd24sIGFjdGlvbjogSUFjdGlvbiwgb3B0aW9uczogSUNoZWNrYm94QWN0aW9uVmlld0l0ZW1PcHRpb25zKSB7XG5cdFx0c3VwZXIoY29udGV4dCwgYWN0aW9uLCBvcHRpb25zKTtcblxuXHRcdHRoaXMudG9nZ2xlID0gdGhpcy5fcmVnaXN0ZXIobmV3IENoZWNrYm94KHRoaXMuX2FjdGlvbi5sYWJlbCwgISF0aGlzLl9hY3Rpb24uY2hlY2tlZCwgb3B0aW9ucy5jaGVja2JveFN0eWxlcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudG9nZ2xlLm9uQ2hhbmdlKCgpID0+IHRoaXMub25DaGFuZ2UoKSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLmVsZW1lbnQgPSBjb250YWluZXI7XG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoZWNrYm94LWFjdGlvbi1pdGVtJyk7XG5cdFx0dGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKHRoaXMudG9nZ2xlLmRvbU5vZGUpO1xuXHRcdGlmICgoPElBY3Rpb25WaWV3SXRlbU9wdGlvbnM+dGhpcy5vcHRpb25zKS5sYWJlbCAmJiB0aGlzLl9hY3Rpb24ubGFiZWwpIHtcblx0XHRcdGNvbnN0IGxhYmVsID0gdGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKCQoJ3NwYW4uY2hlY2tib3gtbGFiZWwnLCB1bmRlZmluZWQsIHRoaXMuX2FjdGlvbi5sYWJlbCkpO1xuXHRcdFx0Ly8gRm9jdXMgdGhlIGNoZWNrYm94IHdoZW4gdGhlIChub24tZm9jdXNhYmxlKSBsYWJlbCBpcyBjbGlja2VkLCBtaXJyb3Jpbmdcblx0XHRcdC8vIG5hdGl2ZSBgPGxhYmVsPmAgYmVoYXZpb3IuIFRoaXMgaXMgZG9uZSBvbiBtb3VzZWRvd24sIHdpdGggdGhlIGRlZmF1bHRcblx0XHRcdC8vIHByZXZlbnRlZCwgc28gZm9jdXMgZG9lcyBub3QgZmlyc3QgbGFuZCBvbiBhIGZvY3VzYWJsZSBhbmNlc3Rvci5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VEb3duTGlzdGVuZXIobGFiZWwsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblxuXHRcdFx0XHRpZiAodGhpcy5pc0VuYWJsZWQoKSkge1xuXHRcdFx0XHRcdHRoaXMuZm9jdXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGxhYmVsLCBFdmVudFR5cGUuQ0xJQ0ssIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblxuXHRcdFx0XHRpZiAodGhpcy5pc0VuYWJsZWQoKSkge1xuXHRcdFx0XHRcdHRoaXMudG9nZ2xlLmNoZWNrZWQgPSAhdGhpcy50b2dnbGUuY2hlY2tlZDtcblx0XHRcdFx0XHR0aGlzLm9uQ2hhbmdlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZUVuYWJsZWQoKTtcblx0XHR0aGlzLnVwZGF0ZUNsYXNzKCk7XG5cdFx0dGhpcy51cGRhdGVDaGVja2VkKCk7XG5cdFx0dGhpcy51cGRhdGVUb29sdGlwKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uQ2hhbmdlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2FjdGlvbi5jaGVja2VkID0gISF0aGlzLnRvZ2dsZSAmJiB0aGlzLnRvZ2dsZS5jaGVja2VkO1xuXHRcdHRoaXMuYWN0aW9uUnVubmVyLnJ1bih0aGlzLl9hY3Rpb24sIHRoaXMuX2NvbnRleHQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZUVuYWJsZWQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNFbmFibGVkKCkpIHtcblx0XHRcdHRoaXMudG9nZ2xlLmVuYWJsZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnRvZ2dsZS5kaXNhYmxlKCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmFjdGlvbi5lbmFibGVkKSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQ/LmNsYXNzTGlzdC5yZW1vdmUoJ2Rpc2FibGVkJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZWxlbWVudD8uY2xhc3NMaXN0LmFkZCgnZGlzYWJsZWQnKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlQ2hlY2tlZCgpOiB2b2lkIHtcblx0XHR0aGlzLnRvZ2dsZS5jaGVja2VkID0gISF0aGlzLl9hY3Rpb24uY2hlY2tlZDtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVDbGFzcygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jc3NDbGFzcykge1xuXHRcdFx0dGhpcy50b2dnbGUuZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKC4uLnRoaXMuY3NzQ2xhc3Muc3BsaXQoJyAnKSk7XG5cdFx0fVxuXHRcdHRoaXMuY3NzQ2xhc3MgPSB0aGlzLmdldENsYXNzKCk7XG5cdFx0aWYgKHRoaXMuY3NzQ2xhc3MpIHtcblx0XHRcdHRoaXMudG9nZ2xlLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCguLi50aGlzLmNzc0NsYXNzLnNwbGl0KCcgJykpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMudG9nZ2xlLmRvbU5vZGUudGFiSW5kZXggPSAwO1xuXHRcdHRoaXMudG9nZ2xlLmZvY3VzKCk7XG5cdH1cblxuXHRvdmVycmlkZSBibHVyKCk6IHZvaWQge1xuXHRcdHRoaXMudG9nZ2xlLmRvbU5vZGUudGFiSW5kZXggPSAtMTtcblx0XHR0aGlzLnRvZ2dsZS5kb21Ob2RlLmJsdXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNldEZvY3VzYWJsZShmb2N1c2FibGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLnRvZ2dsZS5kb21Ob2RlLnRhYkluZGV4ID0gZm9jdXNhYmxlID8gMCA6IC0xO1xuXHR9XG5cbn1cblxuLyoqXG4gKiBDcmVhdGVzIGFuIGFjdGlvbiB2aWV3IGl0ZW0gcHJvdmlkZXIgdGhhdCByZW5kZXJzIHRvZ2dsZXMgZm9yIGFjdGlvbnMgd2l0aCBhIGNoZWNrZWQgc3RhdGVcbiAqIGFuZCBmYWxscyBiYWNrIHRvIGRlZmF1bHQgYnV0dG9uIHJlbmRlcmluZyBmb3IgcmVndWxhciBhY3Rpb25zLlxuICpcbiAqIEBwYXJhbSB0b2dnbGVTdHlsZXMgLSBPcHRpb25hbCBzdHlsZXMgdG8gYXBwbHkgdG8gdG9nZ2xlIGl0ZW1zXG4gKiBAcmV0dXJucyBBbiBJQWN0aW9uVmlld0l0ZW1Qcm92aWRlciB0aGF0IGNhbiBiZSB1c2VkIHdpdGggQWN0aW9uQmFyXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVUb2dnbGVBY3Rpb25WaWV3SXRlbVByb3ZpZGVyKHRvZ2dsZVN0eWxlcz86IElUb2dnbGVTdHlsZXMpOiBJQWN0aW9uVmlld0l0ZW1Qcm92aWRlciB7XG5cdHJldHVybiAoYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zKSA9PiB7XG5cdFx0Ly8gT25seSByZW5kZXIgYXMgYSB0b2dnbGUgaWYgdGhlIGFjdGlvbiBoYXMgYSBjaGVja2VkIHByb3BlcnR5XG5cdFx0aWYgKGFjdGlvbi5jaGVja2VkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBuZXcgVG9nZ2xlQWN0aW9uVmlld0l0ZW0obnVsbCwgYWN0aW9uLCB7IC4uLm9wdGlvbnMsIHRvZ2dsZVN0eWxlcyB9KTtcblx0XHR9XG5cdFx0Ly8gUmV0dXJuIHVuZGVmaW5lZCB0byBmYWxsIGJhY2sgdG8gZGVmYXVsdCBidXR0b24gcmVuZGVyaW5nXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQXNCO0FBQy9CLFNBQTBCLHdCQUF3QjtBQUNsRCxTQUFTLHFCQUFxQixrQkFBa0I7QUFDaEQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsR0FBRyx1Q0FBdUMsdUJBQXVCLFdBQVcsaUJBQWlCLHFCQUFxQjtBQUUzSCxTQUFTLDBCQUFrRDtBQUUzRCxTQUFTLGtCQUEwQztBQUNuRCxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLGNBQWM7QUFDdkIsT0FBTztBQTJCQSxNQUFNLHVCQUF1QjtBQUFBLEVBQ25DLHlCQUF5QjtBQUFBLEVBQ3pCLDZCQUE2QjtBQUFBLEVBQzdCLDZCQUE2QjtBQUM5QjtBQUVPLE1BQU0sNkJBQTZCLG1CQUFtQjtBQUFBLEVBSTVELFlBQVksU0FBa0IsUUFBaUIsU0FBaUM7QUFDL0UsVUFBTSxTQUFTLFFBQVEsT0FBTztBQUU5QixVQUFNLFFBQWlDLEtBQUssUUFBUyxhQUNwRCxHQUFHLEtBQUssUUFBUSxLQUFLLEtBQThCLEtBQUssUUFBUyxVQUFVLE1BQU0sS0FBSyxRQUFRO0FBQy9GLFNBQUssU0FBUyxLQUFLLFVBQVUsSUFBSSxPQUFPO0FBQUEsTUFDdkMsaUJBQWlCLEtB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
