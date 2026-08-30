import { addDisposableListener, EventHelper, EventType, isActiveElement, reset, trackFocus, $ } from "../../dom.js";
import { StandardKeyboardEvent } from "../../keyboardEvent.js";
import { renderMarkdown, renderAsPlaintext } from "../../markdownRenderer.js";
import { Gesture, EventType as TouchEventType } from "../../touch.js";
import { createInstantHoverDelegate, getDefaultHoverDelegate } from "../hover/hoverDelegateFactory.js";
import { renderLabelWithIcons } from "../iconLabel/iconLabels.js";
import { toAction } from "../../../common/actions.js";
import { Codicon } from "../../../common/codicons.js";
import { Color } from "../../../common/color.js";
import { Emitter } from "../../../common/event.js";
import { isMarkdownString, markdownStringEqual } from "../../../common/htmlContent.js";
import { KeyCode } from "../../../common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../common/lifecycle.js";
import { ThemeIcon } from "../../../common/themables.js";
import "./button.css";
import { localize } from "../../../../nls.js";
import { getBaseLayerHoverDelegate } from "../hover/hoverDelegate2.js";
import { safeSetInnerHtml } from "../../domSanitize.js";
const unthemedButtonStyles = {
  buttonBackground: "#0E639C",
  buttonHoverBackground: "#006BB3",
  buttonSeparator: Color.white.toString(),
  buttonForeground: Color.white.toString(),
  buttonBorder: void 0,
  buttonSecondaryBackground: void 0,
  buttonSecondaryForeground: void 0,
  buttonSecondaryHoverBackground: void 0,
  buttonSecondaryBorder: void 0
};
const buttonSanitizerConfig = Object.freeze({
  allowedTags: {
    override: ["b", "i", "u", "code", "span"]
  },
  allowedAttributes: {
    override: ["class"]
  }
});
const buttonMarkdownRenderOptions = Object.freeze({
  sanitizerConfig: {
    allowedAttributes: {
      override: ["class"]
    }
  }
});
class Button extends Disposable {
  constructor(container, options) {
    super();
    this._label = "";
    this._onDidClick = this._register(new Emitter());
    this._onDidEscape = this._register(new Emitter());
    this.options = options;
    this._element = document.createElement("a");
    this._element.classList.add("monaco-button");
    this._element.tabIndex = 0;
    this._element.setAttribute("role", "button");
    this._element.classList.toggle("secondary", !!options.secondary);
    this._element.classList.toggle("small", !!options.small);
    const background = options.secondary ? options.buttonSecondaryBackground : options.buttonBackground;
    const foreground = options.secondary ? options.buttonSecondaryForeground : options.buttonForeground;
    const border = options.secondary ? options.buttonSecondaryBorder : options.buttonBorder;
    this._element.style.color = foreground || "";
    this._element.style.backgroundColor = background || "";
    if (border) {
      this._element.style.border = `1px solid ${border}`;
    }
    if (options.supportShortLabel) {
      this._labelShortElement = document.createElement("div");
      this._labelShortElement.classList.add("monaco-button-label-short");
      this._element.appendChild(this._labelShortElement);
      this._labelElement = document.createElement("div");
      this._labelElement.classList.add("monaco-button-label");
      this._element.appendChild(this._labelElement);
      this._element.classList.add("monaco-text-button-with-short-label");
    }
    if (typeof options.title === "string") {
      this.setTitle(options.title);
    }
    if (typeof options.ariaLabel === "string") {
      this._element.setAttribute("aria-label", options.ariaLabel);
    }
    container.appendChild(this._element);
    this.enabled = !options.disabled;
    this._register(Gesture.addTarget(this._element));
    [EventType.CLICK, TouchEventType.Tap].forEach((eventType) => {
      this._register(addDisposableListener(this._element, eventType, (e) => {
        if (!this.enabled) {
          EventHelper.stop(e);
          return;
        }
        this._onDidClick.fire(e);
      }));
    });
    this._register(addDisposableListener(this._element, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      let eventHandled = false;
      if (this.enabled && (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space))) {
        this._onDidClick.fire(e);
        eventHandled = true;
      } else if (event.equals(KeyCode.Escape)) {
        this._onDidEscape.fire(e);
        this._element.blur();
        eventHandled = true;
      }
      if (eventHandled) {
        EventHelper.stop(event, true);
      }
    }));
    this._register(addDisposableListener(this._element, EventType.MOUSE_OVER, (e) => {
      if (!this._element.classList.contains("disabled")) {
        this.updateStyles(true);
      }
    }));
    this._register(addDisposableListener(this._element, EventType.MOUSE_OUT, (e) => {
      this.updateStyles(false);
    }));
    this.focusTracker = this._register(trackFocus(this._element));
    this._register(this.focusTracker.onDidFocus(() => {
      if (this.enabled) {
        this.updateStyles(true);
      }
    }));
    this._register(this.focusTracker.onDidBlur(() => {
      if (this.enabled) {
        this.updateStyles(false);
      }
    }));
  }
  get onDidClick() {
    return this._onDidClick.event;
  }
  get onDidEscape() {
    return this._onDidEscape.event;
  }
  dispose() {
    super.dispose();
    this._element.remove();
  }
  getContentElements(content) {
    const elements = [];
    for (let segment of renderLabelWithIcons(content)) {
      if (typeof segment === "string") {
        segment = segment.trim();
        if (segment === "") {
          continue;
        }
        const node = document.createElement("span");
        node.textContent = segment;
        elements.push(node);
      } else {
        elements.push(segment);
      }
    }
    return elements;
  }
  updateStyles(hover) {
    let background;
    let foreground;
    let border;
    if (this.options.secondary) {
      background = hover ? this.options.buttonSecondaryHoverBackground : this.options.buttonSecondaryBackground;
      foreground = this.options.buttonSecondaryForeground;
      border = this.options.buttonSecondaryBorder;
    } else {
      background = hover ? this.options.buttonHoverBackground : this.options.buttonBackground;
      foreground = this.options.buttonForeground;
      border = this.options.buttonBorder;
    }
    this._element.style.backgroundColor = background || "";
    this._element.style.color = foreground || "";
    this._element.style.border = border ? `1px solid ${border}` : "";
  }
  get element() {
    return this._element;
  }
  set label(value) {
    if (this._label === value) {
      return;
    }
    if (isMarkdownString(this._label) && isMarkdownString(value) && markdownStringEqual(this._label, value)) {
      return;
    }
    this._element.classList.add("monaco-text-button");
    const labelElement = this.options.supportShortLabel ? this._labelElement : this._element;
    if (isMarkdownString(value)) {
      const rendered = renderMarkdown(value, buttonMarkdownRenderOptions, document.createElement("span"));
      rendered.dispose();
      const root = rendered.element.querySelector("p")?.innerHTML;
      if (root) {
        safeSetInnerHtml(labelElement, root, buttonSanitizerConfig);
      } else {
        reset(labelElement);
      }
    } else {
      if (this.options.supportIcons) {
        reset(labelElement, ...this.getContentElements(value));
      } else {
        labelElement.textContent = value;
      }
    }
    let title = "";
    if (typeof this.options.title === "string") {
      title = this.options.title;
    } else if (this.options.title) {
      title = renderAsPlaintext(value);
    }
    this.setTitle(title);
    this._setAriaLabel();
    this._label = value;
  }
  get label() {
    return this._label;
  }
  set labelShort(value) {
    if (!this.options.supportShortLabel || !this._labelShortElement) {
      return;
    }
    if (this.options.supportIcons) {
      reset(this._labelShortElement, ...this.getContentElements(value));
    } else {
      this._labelShortElement.textContent = value;
    }
  }
  _setAriaLabel() {
    if (typeof this.options.ariaLabel === "string") {
      this._element.setAttribute("aria-label", this.options.ariaLabel);
    } else if (typeof this.options.title === "string") {
      this._element.setAttribute("aria-label", this.options.title);
    }
  }
  set icon(icon) {
    this._setAriaLabel();
    const oldIcons = Array.from(this._element.classList).filter((item) => item.startsWith("codicon-"));
    this._element.classList.remove(...oldIcons);
    this._element.classList.add(...ThemeIcon.asClassNameArray(icon));
  }
  set enabled(value) {
    if (value) {
      this._element.classList.remove("disabled");
      this._element.setAttribute("aria-disabled", String(false));
      this._element.tabIndex = 0;
    } else {
      this._element.classList.add("disabled");
      this._element.setAttribute("aria-disabled", String(true));
    }
  }
  get enabled() {
    return !this._element.classList.contains("disabled");
  }
  set secondary(value) {
    this._element.classList.toggle("secondary", value);
    this.options.secondary = value;
    this.updateStyles(false);
  }
  set checked(value) {
    if (value) {
      this._element.classList.add("checked");
      this._element.setAttribute("aria-pressed", "true");
    } else {
      this._element.classList.remove("checked");
      this._element.setAttribute("aria-pressed", "false");
    }
  }
  get checked() {
    return this._element.classList.contains("checked");
  }
  setTitle(title) {
    if (!this._hover && title !== "") {
      this._hover = this._register(getBaseLayerHoverDelegate().setupManagedHover(this.options.hoverDelegate ?? getDefaultHoverDelegate("element"), this._element, title));
    } else if (this._hover) {
      this._hover.update(title);
    }
  }
  setAriaLabel(ariaLabel) {
    this._element.setAttribute("aria-label", ariaLabel);
  }
  focus() {
    this._element.focus();
  }
  hasFocus() {
    return isActiveElement(this._element);
  }
}
class ButtonWithDropdown extends Disposable {
  constructor(container, options) {
    super();
    this._onDidClick = this._register(new Emitter());
    this.onDidClick = this._onDidClick.event;
    this.element = document.createElement("div");
    this.element.classList.add("monaco-button-dropdown");
    container.appendChild(this.element);
    if (!options.hoverDelegate) {
      options = { ...options, hoverDelegate: this._register(createInstantHoverDelegate()) };
    }
    this.primaryButton = this._register(new Button(this.element, options));
    this._register(this.primaryButton.onDidClick((e) => this._onDidClick.fire(e)));
    this.action = toAction({ id: "primaryAction", label: renderAsPlaintext(this.primaryButton.label), run: async () => this._onDidClick.fire(void 0) });
    this.separatorContainer = document.createElement("div");
    this.separatorContainer.classList.add("monaco-button-dropdown-separator");
    this.separator = document.createElement("div");
    this.separatorContainer.appendChild(this.separator);
    this.element.appendChild(this.separatorContainer);
    const border = options.buttonBorder;
    if (border) {
      this.separatorContainer.style.borderTop = "1px solid " + border;
      this.separatorContainer.style.borderBottom = "1px solid " + border;
    }
    const buttonBackground = options.secondary ? options.buttonSecondaryBackground : options.buttonBackground;
    this.separatorContainer.style.backgroundColor = buttonBackground ?? "";
    this.separator.style.backgroundColor = options.buttonSeparator ?? "";
    this.dropdownButton = this._register(new Button(this.element, { ...options, title: localize("button dropdown more actions", "More Actions..."), supportIcons: true }));
    this.dropdownButton.element.setAttribute("aria-haspopup", "true");
    this.dropdownButton.element.setAttribute("aria-expanded", "false");
    this.dropdownButton.element.classList.add("monaco-dropdown-button");
    this.dropdownButton.icon = Codicon.dropDownButton;
    this._register(this.dropdownButton.onDidClick((e) => {
      const actions = Array.isArray(options.actions) ? options.actions : options.actions.getActions();
      options.contextMenuProvider.showContextMenu({
        getAnchor: () => this.dropdownButton.element,
        getActions: () => options.addPrimaryActionToDropdown === false ? [...actions] : [this.action, ...actions],
        actionRunner: options.actionRunner,
        onHide: () => this.dropdownButton.element.setAttribute("aria-expanded", "false"),
        layer: options.dropdownLayer
      });
      this.dropdownButton.element.setAttribute("aria-expanded", "true");
    }));
  }
  dispose() {
    super.dispose();
    this.element.remove();
  }
  set label(value) {
    this.primaryButton.label = value;
    this.action.label = value;
  }
  set icon(icon) {
    this.primaryButton.icon = icon;
  }
  set enabled(enabled) {
    this.primaryButton.enabled = enabled;
    this.dropdownButton.enabled = enabled;
    this.element.classList.toggle("disabled", !enabled);
  }
  get enabled() {
    return this.primaryButton.enabled;
  }
  set checked(value) {
    this.primaryButton.checked = value;
  }
  get checked() {
    return this.primaryButton.checked;
  }
  setTitle(title) {
    this.primaryButton.setTitle(title);
  }
  setAriaLabel(ariaLabel) {
    this.primaryButton.setAriaLabel(ariaLabel);
  }
  focus() {
    this.primaryButton.focus();
  }
  hasFocus() {
    return this.primaryButton.hasFocus() || this.dropdownButton.hasFocus();
  }
}
class ButtonWithDescription {
  constructor(container, options) {
    this.options = options;
    this._element = document.createElement("div");
    this._element.classList.add("monaco-description-button");
    this._button = new Button(this._element, options);
    this._descriptionElement = document.createElement("div");
    this._descriptionElement.classList.add("monaco-button-description");
    this._element.appendChild(this._descriptionElement);
    container.appendChild(this._element);
  }
  get onDidClick() {
    return this._button.onDidClick;
  }
  get element() {
    return this._element;
  }
  set label(value) {
    this._button.label = value;
  }
  set icon(icon) {
    this._button.icon = icon;
  }
  get enabled() {
    return this._button.enabled;
  }
  set enabled(enabled) {
    this._button.enabled = enabled;
  }
  set checked(value) {
    this._button.checked = value;
  }
  get checked() {
    return this._button.checked;
  }
  setTitle(title) {
    this._button.setTitle(title);
  }
  setAriaLabel(ariaLabel) {
    this._button.setAriaLabel(ariaLabel);
  }
  focus() {
    this._button.focus();
  }
  hasFocus() {
    return this._button.hasFocus();
  }
  dispose() {
    this._button.dispose();
  }
  set description(value) {
    if (this.options.supportIcons) {
      reset(this._descriptionElement, ...renderLabelWithIcons(value));
    } else {
      this._descriptionElement.textContent = value;
    }
  }
}
var ButtonBarAlignment = /* @__PURE__ */ ((ButtonBarAlignment2) => {
  ButtonBarAlignment2[ButtonBarAlignment2["Horizontal"] = 0] = "Horizontal";
  ButtonBarAlignment2[ButtonBarAlignment2["Vertical"] = 1] = "Vertical";
  return ButtonBarAlignment2;
})(ButtonBarAlignment || {});
class ButtonBar {
  constructor(container, options) {
    this.container = container;
    this.options = options;
    this._buttons = [];
    this._buttonStore = new DisposableStore();
  }
  dispose() {
    this._buttonStore.dispose();
  }
  get buttons() {
    return this._buttons;
  }
  clear() {
    this._buttonStore.clear();
    this._buttons.length = 0;
  }
  addButton(options) {
    const button = this._buttonStore.add(new Button(this.container, options));
    this.pushButton(button);
    return button;
  }
  addButtonWithDescription(options) {
    const button = this._buttonStore.add(new ButtonWithDescription(this.container, options));
    this.pushButton(button);
    return button;
  }
  addButtonWithDropdown(options) {
    const button = this._buttonStore.add(new ButtonWithDropdown(this.container, options));
    this.pushButton(button);
    return button;
  }
  pushButton(button) {
    this._buttons.push(button);
    const index = this._buttons.length - 1;
    this._buttonStore.add(addDisposableListener(button.element, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      let eventHandled = true;
      let buttonIndexToFocus;
      if (event.equals(this.options?.alignment === 1 /* Vertical */ ? KeyCode.UpArrow : KeyCode.LeftArrow)) {
        buttonIndexToFocus = index > 0 ? index - 1 : this._buttons.length - 1;
      } else if (event.equals(this.options?.alignment === 1 /* Vertical */ ? KeyCode.DownArrow : KeyCode.RightArrow)) {
        buttonIndexToFocus = index === this._buttons.length - 1 ? 0 : index + 1;
      } else {
        eventHandled = false;
      }
      if (eventHandled && typeof buttonIndexToFocus === "number") {
        this._buttons[buttonIndexToFocus].focus();
        EventHelper.stop(e, true);
      }
    }));
  }
}
class ButtonWithIcon extends Button {
  get labelElement() {
    return this._mdlabelElement;
  }
  get iconElement() {
    return this._iconElement;
  }
  constructor(container, options) {
    super(container, options);
    if (options.supportShortLabel) {
      throw new Error("ButtonWithIcon does not support short labels");
    }
    this._element.classList.add("monaco-icon-button");
    this._iconElement = $("");
    this._mdlabelElement = $(".monaco-button-mdlabel");
    this._element.append(this._iconElement, this._mdlabelElement);
  }
  get label() {
    return super.label;
  }
  set label(value) {
    if (this._label === value) {
      return;
    }
    if (isMarkdownString(this._label) && isMarkdownString(value) && markdownStringEqual(this._label, value)) {
      return;
    }
    this._element.classList.add("monaco-text-button");
    if (isMarkdownString(value)) {
      const rendered = renderMarkdown(value, buttonMarkdownRenderOptions, document.createElement("span"));
      rendered.dispose();
      const root = rendered.element.querySelector("p")?.innerHTML;
      if (root) {
        safeSetInnerHtml(this._mdlabelElement, root, buttonSanitizerConfig);
      } else {
        reset(this._mdlabelElement);
      }
    } else {
      if (this.options.supportIcons) {
        reset(this._mdlabelElement, ...this.getContentElements(value));
      } else {
        this._mdlabelElement.textContent = value;
      }
    }
    let title = "";
    if (typeof this.options.title === "string") {
      title = this.options.title;
    } else if (this.options.title) {
      title = renderAsPlaintext(value);
    }
    this.setTitle(title);
    this._setAriaLabel();
    this._label = value;
  }
  get icon() {
    return super.icon;
  }
  set icon(icon) {
    this._iconElement.classList.value = "";
    this._iconElement.classList.add(...ThemeIcon.asClassNameArray(icon));
    this._setAriaLabel();
  }
}
export {
  Button,
  ButtonBar,
  ButtonBarAlignment,
  ButtonWithDescription,
  ButtonWithDropdown,
  ButtonWithIcon,
  unthemedButtonStyles
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFx1aVxcYnV0dG9uXFxidXR0b24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJQ29udGV4dE1lbnVQcm92aWRlciB9IGZyb20gJy4uLy4uL2NvbnRleHRtZW51LmpzJztcbmltcG9ydCB7IGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRXZlbnRIZWxwZXIsIEV2ZW50VHlwZSwgSUZvY3VzVHJhY2tlciwgaXNBY3RpdmVFbGVtZW50LCByZXNldCwgdHJhY2tGb2N1cywgJCB9IGZyb20gJy4uLy4uL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IHJlbmRlck1hcmtkb3duLCByZW5kZXJBc1BsYWludGV4dCB9IGZyb20gJy4uLy4uL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgR2VzdHVyZSwgRXZlbnRUeXBlIGFzIFRvdWNoRXZlbnRUeXBlIH0gZnJvbSAnLi4vLi4vdG91Y2guanMnO1xuaW1wb3J0IHsgY3JlYXRlSW5zdGFudEhvdmVyRGVsZWdhdGUsIGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSUhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi9ob3Zlci9ob3ZlckRlbGVnYXRlLmpzJztcbmltcG9ydCB7IHJlbmRlckxhYmVsV2l0aEljb25zIH0gZnJvbSAnLi4vaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgSUFjdGlvblJ1bm5lciwgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IEV2ZW50IGFzIEJhc2VFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcsIGlzTWFya2Rvd25TdHJpbmcsIG1hcmtkb3duU3RyaW5nRXF1YWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCAnLi9idXR0b24uY3NzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB0eXBlIHsgSU1hbmFnZWRIb3ZlciB9IGZyb20gJy4uL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IGdldEJhc2VMYXllckhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi9ob3Zlci9ob3ZlckRlbGVnYXRlMi5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uUHJvdmlkZXIgfSBmcm9tICcuLi9kcm9wZG93bi9kcm9wZG93bi5qcyc7XG5pbXBvcnQgeyBzYWZlU2V0SW5uZXJIdG1sLCBEb21TYW5pdGl6ZXJDb25maWcgfSBmcm9tICcuLi8uLi9kb21TYW5pdGl6ZS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUJ1dHRvbk9wdGlvbnMgZXh0ZW5kcyBQYXJ0aWFsPElCdXR0b25TdHlsZXM+IHtcblx0cmVhZG9ubHkgdGl0bGU/OiBib29sZWFuIHwgc3RyaW5nO1xuXHQvKipcblx0ICogV2lsbCBmYWxsYmFjayB0byBgdGl0bGVgIGlmIG5vdCBzZXQuXG5cdCAqL1xuXHRyZWFkb25seSBhcmlhTGFiZWw/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN1cHBvcnRJY29ucz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHN1cHBvcnRTaG9ydExhYmVsPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc2Vjb25kYXJ5PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc21hbGw/OiBib29sZWFuO1xuXHRyZWFkb25seSBob3ZlckRlbGVnYXRlPzogSUhvdmVyRGVsZWdhdGU7XG5cdHJlYWRvbmx5IGRpc2FibGVkPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQnV0dG9uU3R5bGVzIHtcblx0cmVhZG9ubHkgYnV0dG9uQmFja2dyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBidXR0b25Ib3ZlckJhY2tncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgYnV0dG9uRm9yZWdyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBidXR0b25TZXBhcmF0b3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgYnV0dG9uU2Vjb25kYXJ5QmFja2dyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBidXR0b25TZWNvbmRhcnlIb3ZlckJhY2tncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgYnV0dG9uU2Vjb25kYXJ5Rm9yZWdyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBidXR0b25TZWNvbmRhcnlCb3JkZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgYnV0dG9uQm9yZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBjb25zdCB1bnRoZW1lZEJ1dHRvblN0eWxlczogSUJ1dHRvblN0eWxlcyA9IHtcblx0YnV0dG9uQmFja2dyb3VuZDogJyMwRTYzOUMnLFxuXHRidXR0b25Ib3ZlckJhY2tncm91bmQ6ICcjMDA2QkIzJyxcblx0YnV0dG9uU2VwYXJhdG9yOiBDb2xvci53aGl0ZS50b1N0cmluZygpLFxuXHRidXR0b25Gb3JlZ3JvdW5kOiBDb2xvci53aGl0ZS50b1N0cmluZygpLFxuXHRidXR0b25Cb3JkZXI6IHVuZGVmaW5lZCxcblx0YnV0dG9uU2Vjb25kYXJ5QmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRidXR0b25TZWNvbmRhcnlGb3JlZ3JvdW5kOiB1bmRlZmluZWQsXG5cdGJ1dHRvblNlY29uZGFyeUhvdmVyQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRidXR0b25TZWNvbmRhcnlCb3JkZXI6IHVuZGVmaW5lZFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBJQnV0dG9uIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgb25EaWRDbGljazogQmFzZUV2ZW50PEV2ZW50IHwgdW5kZWZpbmVkPjtcblxuXHRzZXQgbGFiZWwodmFsdWU6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyk7XG5cdHNldCBpY29uKHZhbHVlOiBUaGVtZUljb24pO1xuXHRzZXQgZW5hYmxlZCh2YWx1ZTogYm9vbGVhbik7XG5cdHNldCBjaGVja2VkKHZhbHVlOiBib29sZWFuKTtcblxuXHRzZXRUaXRsZSh0aXRsZTogc3RyaW5nKTogdm9pZDtcblx0c2V0QXJpYUxhYmVsKGFyaWFMYWJlbDogc3RyaW5nKTogdm9pZDtcblxuXHRmb2N1cygpOiB2b2lkO1xuXHRoYXNGb2N1cygpOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElCdXR0b25XaXRoRGVzY3JpcHRpb24gZXh0ZW5kcyBJQnV0dG9uIHtcblx0ZGVzY3JpcHRpb246IHN0cmluZztcbn1cblxuLy8gT25seSBhbGxvdyBhIHZlcnkgbGltaXRlZCBzZXQgb2YgaW5saW5lIGh0bWwgdGFnc1xuY29uc3QgYnV0dG9uU2FuaXRpemVyQ29uZmlnID0gT2JqZWN0LmZyZWV6ZTxEb21TYW5pdGl6ZXJDb25maWc+KHtcblx0YWxsb3dlZFRhZ3M6IHtcblx0XHRvdmVycmlkZTogWydiJywgJ2knLCAndScsICdjb2RlJywgJ3NwYW4nXSxcblx0fSxcblx0YWxsb3dlZEF0dHJpYnV0ZXM6IHtcblx0XHRvdmVycmlkZTogWydjbGFzcyddLFxuXHR9LFxufSk7XG5cbi8vIE1hcmtkb3duIHJlbmRlciBvcHRpb25zIHRoYXQgYWxsb3cgY2xhc3MgYXR0cmlidXRlcyB0byBwYXNzIHRocm91Z2hcbmNvbnN0IGJ1dHRvbk1hcmtkb3duUmVuZGVyT3B0aW9ucyA9IE9iamVjdC5mcmVlemUoe1xuXHRzYW5pdGl6ZXJDb25maWc6IHtcblx0XHRhbGxvd2VkQXR0cmlidXRlczoge1xuXHRcdFx0b3ZlcnJpZGU6IFsnY2xhc3MnXSxcblx0XHR9XG5cdH1cbn0pO1xuXG5leHBvcnQgY2xhc3MgQnV0dG9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElCdXR0b24ge1xuXG5cdHByb3RlY3RlZCBvcHRpb25zOiBJQnV0dG9uT3B0aW9ucztcblx0cHJvdGVjdGVkIF9lbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJvdGVjdGVkIF9sYWJlbDogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nID0gJyc7XG5cdHByb3RlY3RlZCBfbGFiZWxFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJvdGVjdGVkIF9sYWJlbFNob3J0RWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2hvdmVyOiBJTWFuYWdlZEhvdmVyIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX29uRGlkQ2xpY2sgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxFdmVudD4oKSk7XG5cdGdldCBvbkRpZENsaWNrKCk6IEJhc2VFdmVudDxFdmVudD4geyByZXR1cm4gdGhpcy5fb25EaWRDbGljay5ldmVudDsgfVxuXG5cdHByaXZhdGUgX29uRGlkRXNjYXBlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8RXZlbnQ+KCkpO1xuXHRnZXQgb25EaWRFc2NhcGUoKTogQmFzZUV2ZW50PEV2ZW50PiB7IHJldHVybiB0aGlzLl9vbkRpZEVzY2FwZS5ldmVudDsgfVxuXG5cdHByaXZhdGUgZm9jdXNUcmFja2VyOiBJRm9jdXNUcmFja2VyO1xuXG5cdGNvbnN0cnVjdG9yKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIG9wdGlvbnM6IElCdXR0b25PcHRpb25zKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG5cblx0XHR0aGlzLl9lbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuXHRcdHRoaXMuX2VsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbW9uYWNvLWJ1dHRvbicpO1xuXHRcdHRoaXMuX2VsZW1lbnQudGFiSW5kZXggPSAwO1xuXHRcdHRoaXMuX2VsZW1lbnQuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXG5cdFx0dGhpcy5fZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdzZWNvbmRhcnknLCAhIW9wdGlvbnMuc2Vjb25kYXJ5KTtcblx0XHR0aGlzLl9lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ3NtYWxsJywgISFvcHRpb25zLnNtYWxsKTtcblx0XHRjb25zdCBiYWNrZ3JvdW5kID0gb3B0aW9ucy5zZWNvbmRhcnkgPyBvcHRpb25zLmJ1dHRvblNlY29uZGFyeUJhY2tncm91bmQgOiBvcHRpb25zLmJ1dHRvbkJhY2tncm91bmQ7XG5cdFx0Y29uc3QgZm9yZWdyb3VuZCA9IG9wdGlvbnMuc2Vjb25kYXJ5ID8gb3B0aW9ucy5idXR0b25TZWNvbmRhcnlGb3JlZ3JvdW5kIDogb3B0aW9ucy5idXR0b25Gb3JlZ3JvdW5kO1xuXHRcdGNvbnN0IGJvcmRlciA9IG9wdGlvbnMuc2Vjb25kYXJ5ID8gb3B0aW9ucy5idXR0b25TZWNvbmRhcnlCb3JkZXIgOiBvcHRpb25zLmJ1dHRvbkJvcmRlcjtcblxuXHRcdHRoaXMuX2VsZW1lbnQuc3R5bGUuY29sb3IgPSBmb3JlZ3JvdW5kIHx8ICcnO1xuXHRcdHRoaXMuX2VsZW1lbnQuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gYmFja2dyb3VuZCB8fCAnJztcblx0XHRpZiAoYm9yZGVyKSB7XG5cdFx0XHR0aGlzLl9lbGVtZW50LnN0eWxlLmJvcmRlciA9IGAxcHggc29saWQgJHtib3JkZXJ9YDtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy5zdXBwb3J0U2hvcnRMYWJlbCkge1xuXHRcdFx0dGhpcy5fbGFiZWxTaG9ydEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdHRoaXMuX2xhYmVsU2hvcnRFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ21vbmFjby1idXR0b24tbGFiZWwtc2hvcnQnKTtcblx0XHRcdHRoaXMuX2VsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy5fbGFiZWxTaG9ydEVsZW1lbnQpO1xuXG5cdFx0XHR0aGlzLl9sYWJlbEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdHRoaXMuX2xhYmVsRWxlbWVudC5jbGFzc0xpc3QuYWRkKCdtb25hY28tYnV0dG9uLWxhYmVsJyk7XG5cdFx0XHR0aGlzLl9lbGVtZW50LmFwcGVuZENoaWxkKHRoaXMuX2xhYmVsRWxlbWVudCk7XG5cblx0XHRcdHRoaXMuX2VsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbW9uYWNvLXRleHQtYnV0dG9uLXdpdGgtc2hvcnQtbGFiZWwnKTtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIG9wdGlvbnMudGl0bGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aGlzLnNldFRpdGxlKG9wdGlvbnMudGl0bGUpO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2Ygb3B0aW9ucy5hcmlhTGFiZWwgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aGlzLl9lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIG9wdGlvbnMuYXJpYUxhYmVsKTtcblx0XHR9XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX2VsZW1lbnQpO1xuXHRcdHRoaXMuZW5hYmxlZCA9ICFvcHRpb25zLmRpc2FibGVkO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoR2VzdHVyZS5hZGRUYXJnZXQodGhpcy5fZWxlbWVudCkpO1xuXG5cdFx0W0V2ZW50VHlwZS5DTElDSywgVG91Y2hFdmVudFR5cGUuVGFwXS5mb3JFYWNoKGV2ZW50VHlwZSA9PiB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZWxlbWVudCwgZXZlbnRUeXBlLCBlID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLmVuYWJsZWQpIHtcblx0XHRcdFx0XHRFdmVudEhlbHBlci5zdG9wKGUpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX29uRGlkQ2xpY2suZmlyZShlKTtcblx0XHRcdH0pKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9lbGVtZW50LCBFdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0bGV0IGV2ZW50SGFuZGxlZCA9IGZhbHNlO1xuXHRcdFx0aWYgKHRoaXMuZW5hYmxlZCAmJiAoZXZlbnQuZXF1YWxzKEtleUNvZGUuRW50ZXIpIHx8IGV2ZW50LmVxdWFscyhLZXlDb2RlLlNwYWNlKSkpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDbGljay5maXJlKGUpO1xuXHRcdFx0XHRldmVudEhhbmRsZWQgPSB0cnVlO1xuXHRcdFx0fSBlbHNlIGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5Fc2NhcGUpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkRXNjYXBlLmZpcmUoZSk7XG5cdFx0XHRcdHRoaXMuX2VsZW1lbnQuYmx1cigpO1xuXHRcdFx0XHRldmVudEhhbmRsZWQgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZXZlbnRIYW5kbGVkKSB7XG5cdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZXZlbnQsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9lbGVtZW50LCBFdmVudFR5cGUuTU9VU0VfT1ZFUiwgZSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2VsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdkaXNhYmxlZCcpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlU3R5bGVzKHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9lbGVtZW50LCBFdmVudFR5cGUuTU9VU0VfT1VULCBlID0+IHtcblx0XHRcdHRoaXMudXBkYXRlU3R5bGVzKGZhbHNlKTsgLy8gcmVzdG9yZSBzdGFuZGFyZCBzdHlsZXNcblx0XHR9KSk7XG5cblx0XHQvLyBBbHNvIHNldCBob3ZlciBiYWNrZ3JvdW5kIHdoZW4gYnV0dG9uIGlzIGZvY3VzZWQgZm9yIGZlZWRiYWNrXG5cdFx0dGhpcy5mb2N1c1RyYWNrZXIgPSB0aGlzLl9yZWdpc3Rlcih0cmFja0ZvY3VzKHRoaXMuX2VsZW1lbnQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZvY3VzVHJhY2tlci5vbkRpZEZvY3VzKCgpID0+IHsgaWYgKHRoaXMuZW5hYmxlZCkgeyB0aGlzLnVwZGF0ZVN0eWxlcyh0cnVlKTsgfSB9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5mb2N1c1RyYWNrZXIub25EaWRCbHVyKCgpID0+IHsgaWYgKHRoaXMuZW5hYmxlZCkgeyB0aGlzLnVwZGF0ZVN0eWxlcyhmYWxzZSk7IH0gfSkpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2VsZW1lbnQucmVtb3ZlKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0Q29udGVudEVsZW1lbnRzKGNvbnRlbnQ6IHN0cmluZyk6IEhUTUxFbGVtZW50W10ge1xuXHRcdGNvbnN0IGVsZW1lbnRzOiBIVE1MU3BhbkVsZW1lbnRbXSA9IFtdO1xuXHRcdGZvciAobGV0IHNlZ21lbnQgb2YgcmVuZGVyTGFiZWxXaXRoSWNvbnMoY29udGVudCkpIHtcblx0XHRcdGlmICh0eXBlb2YgKHNlZ21lbnQpID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRzZWdtZW50ID0gc2VnbWVudC50cmltKCk7XG5cblx0XHRcdFx0Ly8gSWdub3JlIGVtcHR5IHNlZ21lbnRcblx0XHRcdFx0aWYgKHNlZ21lbnQgPT09ICcnKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBDb252ZXJ0IHN0cmluZyBzZWdtZW50cyB0byA8c3Bhbj4gbm9kZXNcblx0XHRcdFx0Y29uc3Qgbm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHRcdFx0bm9kZS50ZXh0Q29udGVudCA9IHNlZ21lbnQ7XG5cdFx0XHRcdGVsZW1lbnRzLnB1c2gobm9kZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlbGVtZW50cy5wdXNoKHNlZ21lbnQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBlbGVtZW50cztcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU3R5bGVzKGhvdmVyOiBib29sZWFuKTogdm9pZCB7XG5cdFx0bGV0IGJhY2tncm91bmQ7XG5cdFx0bGV0IGZvcmVncm91bmQ7XG5cdFx0bGV0IGJvcmRlcjtcblx0XHRpZiAodGhpcy5vcHRpb25zLnNlY29uZGFyeSkge1xuXHRcdFx0YmFja2dyb3VuZCA9IGhvdmVyID8gdGhpcy5vcHRpb25zLmJ1dHRvblNlY29uZGFyeUhvdmVyQmFja2dyb3VuZCA6IHRoaXMub3B0aW9ucy5idXR0b25TZWNvbmRhcnlCYWNrZ3JvdW5kO1xuXHRcdFx0Zm9yZWdyb3VuZCA9IHRoaXMub3B0aW9ucy5idXR0b25TZWNvbmRhcnlGb3JlZ3JvdW5kO1xuXHRcdFx0Ym9yZGVyID0gdGhpcy5vcHRpb25zLmJ1dHRvblNlY29uZGFyeUJvcmRlcjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YmFja2dyb3VuZCA9IGhvdmVyID8gdGhpcy5vcHRpb25zLmJ1dHRvbkhvdmVyQmFja2dyb3VuZCA6IHRoaXMub3B0aW9ucy5idXR0b25CYWNrZ3JvdW5kO1xuXHRcdFx0Zm9yZWdyb3VuZCA9IHRoaXMub3B0aW9ucy5idXR0b25Gb3JlZ3JvdW5kO1xuXHRcdFx0Ym9yZGVyID0gdGhpcy5vcHRpb25zLmJ1dHRvbkJvcmRlcjtcblx0XHR9XG5cblx0XHR0aGlzLl9lbGVtZW50LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IGJhY2tncm91bmQgfHwgJyc7XG5cdFx0dGhpcy5fZWxlbWVudC5zdHlsZS5jb2xvciA9IGZvcmVncm91bmQgfHwgJyc7XG5cdFx0dGhpcy5fZWxlbWVudC5zdHlsZS5ib3JkZXIgPSBib3JkZXIgPyBgMXB4IHNvbGlkICR7Ym9yZGVyfWAgOiAnJztcblx0fVxuXG5cdGdldCBlbGVtZW50KCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fZWxlbWVudDtcblx0fVxuXG5cdHNldCBsYWJlbCh2YWx1ZTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nKSB7XG5cdFx0aWYgKHRoaXMuX2xhYmVsID09PSB2YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChpc01hcmtkb3duU3RyaW5nKHRoaXMuX2xhYmVsKSAmJiBpc01hcmtkb3duU3RyaW5nKHZhbHVlKSAmJiBtYXJrZG93blN0cmluZ0VxdWFsKHRoaXMuX2xhYmVsLCB2YWx1ZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ21vbmFjby10ZXh0LWJ1dHRvbicpO1xuXHRcdGNvbnN0IGxhYmVsRWxlbWVudCA9IHRoaXMub3B0aW9ucy5zdXBwb3J0U2hvcnRMYWJlbCA/IHRoaXMuX2xhYmVsRWxlbWVudCEgOiB0aGlzLl9lbGVtZW50O1xuXG5cdFx0aWYgKGlzTWFya2Rvd25TdHJpbmcodmFsdWUpKSB7XG5cdFx0XHRjb25zdCByZW5kZXJlZCA9IHJlbmRlck1hcmtkb3duKHZhbHVlLCBidXR0b25NYXJrZG93blJlbmRlck9wdGlvbnMsIGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKSk7XG5cdFx0XHRyZW5kZXJlZC5kaXNwb3NlKCk7XG5cblx0XHRcdC8vIERvbid0IGluY2x1ZGUgb3V0ZXIgYDxwPmBcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3Qgcm9vdCA9IHJlbmRlcmVkLmVsZW1lbnQucXVlcnlTZWxlY3RvcigncCcpPy5pbm5lckhUTUw7XG5cdFx0XHRpZiAocm9vdCkge1xuXHRcdFx0XHRzYWZlU2V0SW5uZXJIdG1sKGxhYmVsRWxlbWVudCwgcm9vdCwgYnV0dG9uU2FuaXRpemVyQ29uZmlnKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc2V0KGxhYmVsRWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh0aGlzLm9wdGlvbnMuc3VwcG9ydEljb25zKSB7XG5cdFx0XHRcdHJlc2V0KGxhYmVsRWxlbWVudCwgLi4udGhpcy5nZXRDb250ZW50RWxlbWVudHModmFsdWUpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxhYmVsRWxlbWVudC50ZXh0Q29udGVudCA9IHZhbHVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCB0aXRsZTogc3RyaW5nID0gJyc7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLm9wdGlvbnMudGl0bGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aXRsZSA9IHRoaXMub3B0aW9ucy50aXRsZTtcblx0XHR9IGVsc2UgaWYgKHRoaXMub3B0aW9ucy50aXRsZSkge1xuXHRcdFx0dGl0bGUgPSByZW5kZXJBc1BsYWludGV4dCh2YWx1ZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zZXRUaXRsZSh0aXRsZSk7XG5cblx0XHR0aGlzLl9zZXRBcmlhTGFiZWwoKTtcblxuXHRcdHRoaXMuX2xhYmVsID0gdmFsdWU7XG5cdH1cblxuXHRnZXQgbGFiZWwoKTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fbGFiZWw7XG5cdH1cblxuXHRzZXQgbGFiZWxTaG9ydCh2YWx1ZTogc3RyaW5nKSB7XG5cdFx0aWYgKCF0aGlzLm9wdGlvbnMuc3VwcG9ydFNob3J0TGFiZWwgfHwgIXRoaXMuX2xhYmVsU2hvcnRFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5zdXBwb3J0SWNvbnMpIHtcblx0XHRcdHJlc2V0KHRoaXMuX2xhYmVsU2hvcnRFbGVtZW50LCAuLi50aGlzLmdldENvbnRlbnRFbGVtZW50cyh2YWx1ZSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9sYWJlbFNob3J0RWxlbWVudC50ZXh0Q29udGVudCA9IHZhbHVlO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBfc2V0QXJpYUxhYmVsKCk6IHZvaWQge1xuXHRcdGlmICh0eXBlb2YgdGhpcy5vcHRpb25zLmFyaWFMYWJlbCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRoaXMuX2VsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGhpcy5vcHRpb25zLmFyaWFMYWJlbCk7XG5cdFx0fSBlbHNlIGlmICh0eXBlb2YgdGhpcy5vcHRpb25zLnRpdGxlID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGhpcy5fZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB0aGlzLm9wdGlvbnMudGl0bGUpO1xuXHRcdH1cblx0fVxuXG5cdHNldCBpY29uKGljb246IFRoZW1lSWNvbikge1xuXHRcdHRoaXMuX3NldEFyaWFMYWJlbCgpO1xuXG5cdFx0Y29uc3Qgb2xkSWNvbnMgPSBBcnJheS5mcm9tKHRoaXMuX2VsZW1lbnQuY2xhc3NMaXN0KS5maWx0ZXIoaXRlbSA9PiBpdGVtLnN0YXJ0c1dpdGgoJ2NvZGljb24tJykpO1xuXHRcdHRoaXMuX2VsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSguLi5vbGRJY29ucyk7XG5cdFx0dGhpcy5fZWxlbWVudC5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGljb24pKTtcblx0fVxuXG5cdHNldCBlbmFibGVkKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHR0aGlzLl9lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2Rpc2FibGVkJyk7XG5cdFx0XHR0aGlzLl9lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1kaXNhYmxlZCcsIFN0cmluZyhmYWxzZSkpO1xuXHRcdFx0dGhpcy5fZWxlbWVudC50YWJJbmRleCA9IDA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2VsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZGlzYWJsZWQnKTtcblx0XHRcdHRoaXMuX2VsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJywgU3RyaW5nKHRydWUpKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgZW5hYmxlZCgpIHtcblx0XHRyZXR1cm4gIXRoaXMuX2VsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdkaXNhYmxlZCcpO1xuXHR9XG5cblx0c2V0IHNlY29uZGFyeSh2YWx1ZTogYm9vbGVhbikge1xuXHRcdHRoaXMuX2VsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnc2Vjb25kYXJ5JywgdmFsdWUpO1xuXHRcdCh0aGlzLm9wdGlvbnMgYXMgeyBzZWNvbmRhcnk/OiBib29sZWFuIH0pLnNlY29uZGFyeSA9IHZhbHVlO1xuXHRcdHRoaXMudXBkYXRlU3R5bGVzKGZhbHNlKTtcblx0fVxuXG5cdHNldCBjaGVja2VkKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHR0aGlzLl9lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoZWNrZWQnKTtcblx0XHRcdHRoaXMuX2VsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLXByZXNzZWQnLCAndHJ1ZScpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2NoZWNrZWQnKTtcblx0XHRcdHRoaXMuX2VsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLXByZXNzZWQnLCAnZmFsc2UnKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgY2hlY2tlZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2NoZWNrZWQnKTtcblx0fVxuXG5cdHNldFRpdGxlKHRpdGxlOiBzdHJpbmcpIHtcblx0XHRpZiAoIXRoaXMuX2hvdmVyICYmIHRpdGxlICE9PSAnJykge1xuXHRcdFx0dGhpcy5faG92ZXIgPSB0aGlzLl9yZWdpc3RlcihnZXRCYXNlTGF5ZXJIb3ZlckRlbGVnYXRlKCkuc2V0dXBNYW5hZ2VkSG92ZXIodGhpcy5vcHRpb25zLmhvdmVyRGVsZWdhdGUgPz8gZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSwgdGhpcy5fZWxlbWVudCwgdGl0bGUpKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2hvdmVyKSB7XG5cdFx0XHR0aGlzLl9ob3Zlci51cGRhdGUodGl0bGUpO1xuXHRcdH1cblx0fVxuXG5cdHNldEFyaWFMYWJlbChhcmlhTGFiZWw6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2VsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgYXJpYUxhYmVsKTtcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2VsZW1lbnQuZm9jdXMoKTtcblx0fVxuXG5cdGhhc0ZvY3VzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpc0FjdGl2ZUVsZW1lbnQodGhpcy5fZWxlbWVudCk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQnV0dG9uV2l0aERyb3Bkb3duT3B0aW9ucyBleHRlbmRzIElCdXR0b25PcHRpb25zIHtcblx0cmVhZG9ubHkgY29udGV4dE1lbnVQcm92aWRlcjogSUNvbnRleHRNZW51UHJvdmlkZXI7XG5cdHJlYWRvbmx5IGFjdGlvbnM6IHJlYWRvbmx5IElBY3Rpb25bXSB8IElBY3Rpb25Qcm92aWRlcjtcblx0cmVhZG9ubHkgYWN0aW9uUnVubmVyPzogSUFjdGlvblJ1bm5lcjtcblx0cmVhZG9ubHkgYWRkUHJpbWFyeUFjdGlvblRvRHJvcGRvd24/OiBib29sZWFuO1xuXHQvKipcblx0ICogZHJvcGRvd24gbWVudXMgd2l0aCBoaWdoZXIgbGF5ZXJzIGFyZSByZW5kZXJlZCBoaWdoZXIgaW4gei1pbmRleCBvcmRlclxuXHQgKi9cblx0cmVhZG9ubHkgZHJvcGRvd25MYXllcj86IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIEJ1dHRvbldpdGhEcm9wZG93biBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQnV0dG9uIHtcblxuXHRyZWFkb25seSBwcmltYXJ5QnV0dG9uOiBCdXR0b247XG5cdHByaXZhdGUgcmVhZG9ubHkgYWN0aW9uOiBJQWN0aW9uO1xuXHRyZWFkb25seSBkcm9wZG93bkJ1dHRvbjogQnV0dG9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNlcGFyYXRvckNvbnRhaW5lcjogSFRNTERpdkVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2VwYXJhdG9yOiBIVE1MRGl2RWxlbWVudDtcblxuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbGljayA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEV2ZW50IHwgdW5kZWZpbmVkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDbGljayA9IHRoaXMuX29uRGlkQ2xpY2suZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgb3B0aW9uczogSUJ1dHRvbldpdGhEcm9wZG93bk9wdGlvbnMpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5lbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ21vbmFjby1idXR0b24tZHJvcGRvd24nKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5lbGVtZW50KTtcblxuXHRcdGlmICghb3B0aW9ucy5ob3ZlckRlbGVnYXRlKSB7XG5cdFx0XHRvcHRpb25zID0geyAuLi5vcHRpb25zLCBob3ZlckRlbGVnYXRlOiB0aGlzLl9yZWdpc3RlcihjcmVhdGVJbnN0YW50SG92ZXJEZWxlZ2F0ZSgpKSB9O1xuXHRcdH1cblxuXHRcdHRoaXMucHJpbWFyeUJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24odGhpcy5lbGVtZW50LCBvcHRpb25zKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5wcmltYXJ5QnV0dG9uLm9uRGlkQ2xpY2soZSA9PiB0aGlzLl9vbkRpZENsaWNrLmZpcmUoZSkpKTtcblx0XHR0aGlzLmFjdGlvbiA9IHRvQWN0aW9uKHsgaWQ6ICdwcmltYXJ5QWN0aW9uJywgbGFiZWw6IHJlbmRlckFzUGxhaW50ZXh0KHRoaXMucHJpbWFyeUJ1dHRvbi5sYWJlbCksIHJ1bjogYXN5bmMgKCkgPT4gdGhpcy5fb25EaWRDbGljay5maXJlKHVuZGVmaW5lZCkgfSk7XG5cblx0XHR0aGlzLnNlcGFyYXRvckNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuc2VwYXJhdG9yQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ21vbmFjby1idXR0b24tZHJvcGRvd24tc2VwYXJhdG9yJyk7XG5cblx0XHR0aGlzLnNlcGFyYXRvciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuc2VwYXJhdG9yQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuc2VwYXJhdG9yKTtcblx0XHR0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy5zZXBhcmF0b3JDb250YWluZXIpO1xuXG5cdFx0Ly8gU2VwYXJhdG9yIHN0eWxlc1xuXHRcdGNvbnN0IGJvcmRlciA9IG9wdGlvbnMuYnV0dG9uQm9yZGVyO1xuXHRcdGlmIChib3JkZXIpIHtcblx0XHRcdHRoaXMuc2VwYXJhdG9yQ29udGFpbmVyLnN0eWxlLmJvcmRlclRvcCA9ICcxcHggc29saWQgJyArIGJvcmRlcjtcblx0XHRcdHRoaXMuc2VwYXJhdG9yQ29udGFpbmVyLnN0eWxlLmJvcmRlckJvdHRvbSA9ICcxcHggc29saWQgJyArIGJvcmRlcjtcblx0XHR9XG5cblx0XHRjb25zdCBidXR0b25CYWNrZ3JvdW5kID0gb3B0aW9ucy5zZWNvbmRhcnkgPyBvcHRpb25zLmJ1dHRvblNlY29uZGFyeUJhY2tncm91bmQgOiBvcHRpb25zLmJ1dHRvbkJhY2tncm91bmQ7XG5cdFx0dGhpcy5zZXBhcmF0b3JDb250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gYnV0dG9uQmFja2dyb3VuZCA/PyAnJztcblx0XHR0aGlzLnNlcGFyYXRvci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBvcHRpb25zLmJ1dHRvblNlcGFyYXRvciA/PyAnJztcblxuXHRcdHRoaXMuZHJvcGRvd25CdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKHRoaXMuZWxlbWVudCwgeyAuLi5vcHRpb25zLCB0aXRsZTogbG9jYWxpemUoXCJidXR0b24gZHJvcGRvd24gbW9yZSBhY3Rpb25zXCIsICdNb3JlIEFjdGlvbnMuLi4nKSwgc3VwcG9ydEljb25zOiB0cnVlIH0pKTtcblx0XHR0aGlzLmRyb3Bkb3duQnV0dG9uLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWhhc3BvcHVwJywgJ3RydWUnKTtcblx0XHR0aGlzLmRyb3Bkb3duQnV0dG9uLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ2ZhbHNlJyk7XG5cdFx0dGhpcy5kcm9wZG93bkJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ21vbmFjby1kcm9wZG93bi1idXR0b24nKTtcblx0XHR0aGlzLmRyb3Bkb3duQnV0dG9uLmljb24gPSBDb2RpY29uLmRyb3BEb3duQnV0dG9uO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZHJvcGRvd25CdXR0b24ub25EaWRDbGljayhlID0+IHtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBBcnJheS5pc0FycmF5KG9wdGlvbnMuYWN0aW9ucykgPyBvcHRpb25zLmFjdGlvbnMgOiAob3B0aW9ucy5hY3Rpb25zIGFzIElBY3Rpb25Qcm92aWRlcikuZ2V0QWN0aW9ucygpO1xuXHRcdFx0b3B0aW9ucy5jb250ZXh0TWVudVByb3ZpZGVyLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gdGhpcy5kcm9wZG93bkJ1dHRvbi5lbGVtZW50LFxuXHRcdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBvcHRpb25zLmFkZFByaW1hcnlBY3Rpb25Ub0Ryb3Bkb3duID09PSBmYWxzZSA/IFsuLi5hY3Rpb25zXSA6IFt0aGlzLmFjdGlvbiwgLi4uYWN0aW9uc10sXG5cdFx0XHRcdGFjdGlvblJ1bm5lcjogb3B0aW9ucy5hY3Rpb25SdW5uZXIsXG5cdFx0XHRcdG9uSGlkZTogKCkgPT4gdGhpcy5kcm9wZG93bkJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICdmYWxzZScpLFxuXHRcdFx0XHRsYXllcjogb3B0aW9ucy5kcm9wZG93bkxheWVyXG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuZHJvcGRvd25CdXR0b24uZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAndHJ1ZScpO1xuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuZWxlbWVudC5yZW1vdmUoKTtcblx0fVxuXG5cdHNldCBsYWJlbCh2YWx1ZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5wcmltYXJ5QnV0dG9uLmxhYmVsID0gdmFsdWU7XG5cdFx0dGhpcy5hY3Rpb24ubGFiZWwgPSB2YWx1ZTtcblx0fVxuXG5cdHNldCBpY29uKGljb246IFRoZW1lSWNvbikge1xuXHRcdHRoaXMucHJpbWFyeUJ1dHRvbi5pY29uID0gaWNvbjtcblx0fVxuXG5cdHNldCBlbmFibGVkKGVuYWJsZWQ6IGJvb2xlYW4pIHtcblx0XHR0aGlzLnByaW1hcnlCdXR0b24uZW5hYmxlZCA9IGVuYWJsZWQ7XG5cdFx0dGhpcy5kcm9wZG93bkJ1dHRvbi5lbmFibGVkID0gZW5hYmxlZDtcblxuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsICFlbmFibGVkKTtcblx0fVxuXG5cdGdldCBlbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnByaW1hcnlCdXR0b24uZW5hYmxlZDtcblx0fVxuXG5cdHNldCBjaGVja2VkKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5wcmltYXJ5QnV0dG9uLmNoZWNrZWQgPSB2YWx1ZTtcblx0fVxuXG5cdGdldCBjaGVja2VkKCkge1xuXHRcdHJldHVybiB0aGlzLnByaW1hcnlCdXR0b24uY2hlY2tlZDtcblx0fVxuXG5cdHNldFRpdGxlKHRpdGxlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnByaW1hcnlCdXR0b24uc2V0VGl0bGUodGl0bGUpO1xuXHR9XG5cblx0c2V0QXJpYUxhYmVsKGFyaWFMYWJlbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5wcmltYXJ5QnV0dG9uLnNldEFyaWFMYWJlbChhcmlhTGFiZWwpO1xuXHR9XG5cblx0Zm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5wcmltYXJ5QnV0dG9uLmZvY3VzKCk7XG5cdH1cblxuXHRoYXNGb2N1cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5wcmltYXJ5QnV0dG9uLmhhc0ZvY3VzKCkgfHwgdGhpcy5kcm9wZG93bkJ1dHRvbi5oYXNGb2N1cygpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBCdXR0b25XaXRoRGVzY3JpcHRpb24gaW1wbGVtZW50cyBJQnV0dG9uV2l0aERlc2NyaXB0aW9uIHtcblxuXHRwcml2YXRlIF9idXR0b246IEJ1dHRvbjtcblx0cHJpdmF0ZSBfZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX2Rlc2NyaXB0aW9uRWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgcHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiBJQnV0dG9uT3B0aW9ucykge1xuXHRcdHRoaXMuX2VsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLl9lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ21vbmFjby1kZXNjcmlwdGlvbi1idXR0b24nKTtcblx0XHR0aGlzLl9idXR0b24gPSBuZXcgQnV0dG9uKHRoaXMuX2VsZW1lbnQsIG9wdGlvbnMpO1xuXG5cdFx0dGhpcy5fZGVzY3JpcHRpb25FbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5fZGVzY3JpcHRpb25FbGVtZW50LmNsYXNzTGlzdC5hZGQoJ21vbmFjby1idXR0b24tZGVzY3JpcHRpb24nKTtcblx0XHR0aGlzLl9lbGVtZW50LmFwcGVuZENoaWxkKHRoaXMuX2Rlc2NyaXB0aW9uRWxlbWVudCk7XG5cblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5fZWxlbWVudCk7XG5cdH1cblxuXHRnZXQgb25EaWRDbGljaygpOiBCYXNlRXZlbnQ8RXZlbnQgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fYnV0dG9uLm9uRGlkQ2xpY2s7XG5cdH1cblxuXHRnZXQgZWxlbWVudCgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX2VsZW1lbnQ7XG5cdH1cblxuXHRzZXQgbGFiZWwodmFsdWU6IHN0cmluZykge1xuXHRcdHRoaXMuX2J1dHRvbi5sYWJlbCA9IHZhbHVlO1xuXHR9XG5cblx0c2V0IGljb24oaWNvbjogVGhlbWVJY29uKSB7XG5cdFx0dGhpcy5fYnV0dG9uLmljb24gPSBpY29uO1xuXHR9XG5cblx0Z2V0IGVuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2J1dHRvbi5lbmFibGVkO1xuXHR9XG5cblx0c2V0IGVuYWJsZWQoZW5hYmxlZDogYm9vbGVhbikge1xuXHRcdHRoaXMuX2J1dHRvbi5lbmFibGVkID0gZW5hYmxlZDtcblx0fVxuXG5cdHNldCBjaGVja2VkKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fYnV0dG9uLmNoZWNrZWQgPSB2YWx1ZTtcblx0fVxuXG5cdGdldCBjaGVja2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9idXR0b24uY2hlY2tlZDtcblx0fVxuXG5cdHNldFRpdGxlKHRpdGxlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9idXR0b24uc2V0VGl0bGUodGl0bGUpO1xuXHR9XG5cblx0c2V0QXJpYUxhYmVsKGFyaWFMYWJlbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fYnV0dG9uLnNldEFyaWFMYWJlbChhcmlhTGFiZWwpO1xuXHR9XG5cblx0Zm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fYnV0dG9uLmZvY3VzKCk7XG5cdH1cblx0aGFzRm9jdXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2J1dHRvbi5oYXNGb2N1cygpO1xuXHR9XG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fYnV0dG9uLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHNldCBkZXNjcmlwdGlvbih2YWx1ZTogc3RyaW5nKSB7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5zdXBwb3J0SWNvbnMpIHtcblx0XHRcdHJlc2V0KHRoaXMuX2Rlc2NyaXB0aW9uRWxlbWVudCwgLi4ucmVuZGVyTGFiZWxXaXRoSWNvbnModmFsdWUpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZGVzY3JpcHRpb25FbGVtZW50LnRleHRDb250ZW50ID0gdmFsdWU7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBlbnVtIEJ1dHRvbkJhckFsaWdubWVudCB7XG5cdEhvcml6b250YWwgPSAwLFxuXHRWZXJ0aWNhbFxufVxuXG5leHBvcnQgY2xhc3MgQnV0dG9uQmFyIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9idXR0b25zOiBJQnV0dG9uW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfYnV0dG9uU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LCBwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM/OiB7IGFsaWdubWVudD86IEJ1dHRvbkJhckFsaWdubWVudCB9KSB7IH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2J1dHRvblN0b3JlLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGdldCBidXR0b25zKCk6IElCdXR0b25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2J1dHRvbnM7XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLl9idXR0b25TdG9yZS5jbGVhcigpO1xuXHRcdHRoaXMuX2J1dHRvbnMubGVuZ3RoID0gMDtcblx0fVxuXG5cdGFkZEJ1dHRvbihvcHRpb25zOiBJQnV0dG9uT3B0aW9ucyk6IElCdXR0b24ge1xuXHRcdGNvbnN0IGJ1dHRvbiA9IHRoaXMuX2J1dHRvblN0b3JlLmFkZChuZXcgQnV0dG9uKHRoaXMuY29udGFpbmVyLCBvcHRpb25zKSk7XG5cdFx0dGhpcy5wdXNoQnV0dG9uKGJ1dHRvbik7XG5cdFx0cmV0dXJuIGJ1dHRvbjtcblx0fVxuXG5cdGFkZEJ1dHRvbldpdGhEZXNjcmlwdGlvbihvcHRpb25zOiBJQnV0dG9uT3B0aW9ucyk6IElCdXR0b25XaXRoRGVzY3JpcHRpb24ge1xuXHRcdGNvbnN0IGJ1dHRvbiA9IHRoaXMuX2J1dHRvblN0b3JlLmFkZChuZXcgQnV0dG9uV2l0aERlc2NyaXB0aW9uKHRoaXMuY29udGFpbmVyLCBvcHRpb25zKSk7XG5cdFx0dGhpcy5wdXNoQnV0dG9uKGJ1dHRvbik7XG5cdFx0cmV0dXJuIGJ1dHRvbjtcblx0fVxuXG5cdGFkZEJ1dHRvbldpdGhEcm9wZG93bihvcHRpb25zOiBJQnV0dG9uV2l0aERyb3Bkb3duT3B0aW9ucyk6IElCdXR0b24ge1xuXHRcdGNvbnN0IGJ1dHRvbiA9IHRoaXMuX2J1dHRvblN0b3JlLmFkZChuZXcgQnV0dG9uV2l0aERyb3Bkb3duKHRoaXMuY29udGFpbmVyLCBvcHRpb25zKSk7XG5cdFx0dGhpcy5wdXNoQnV0dG9uKGJ1dHRvbik7XG5cdFx0cmV0dXJuIGJ1dHRvbjtcblx0fVxuXG5cdHByaXZhdGUgcHVzaEJ1dHRvbihidXR0b246IElCdXR0b24pOiB2b2lkIHtcblx0XHR0aGlzLl9idXR0b25zLnB1c2goYnV0dG9uKTtcblxuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fYnV0dG9ucy5sZW5ndGggLSAxO1xuXHRcdHRoaXMuX2J1dHRvblN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoYnV0dG9uLmVsZW1lbnQsIEV2ZW50VHlwZS5LRVlfRE9XTiwgZSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRsZXQgZXZlbnRIYW5kbGVkID0gdHJ1ZTtcblxuXHRcdFx0Ly8gTmV4dCAvIFByZXZpb3VzIEJ1dHRvblxuXHRcdFx0bGV0IGJ1dHRvbkluZGV4VG9Gb2N1czogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGV2ZW50LmVxdWFscyh0aGlzLm9wdGlvbnM/LmFsaWdubWVudCA9PT0gQnV0dG9uQmFyQWxpZ25tZW50LlZlcnRpY2FsID8gS2V5Q29kZS5VcEFycm93IDogS2V5Q29kZS5MZWZ0QXJyb3cpKSB7XG5cdFx0XHRcdGJ1dHRvbkluZGV4VG9Gb2N1cyA9IGluZGV4ID4gMCA/IGluZGV4IC0gMSA6IHRoaXMuX2J1dHRvbnMubGVuZ3RoIC0gMTtcblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQuZXF1YWxzKHRoaXMub3B0aW9ucz8uYWxpZ25tZW50ID09PSBCdXR0b25CYXJBbGlnbm1lbnQuVmVydGljYWwgPyBLZXlDb2RlLkRvd25BcnJvdyA6IEtleUNvZGUuUmlnaHRBcnJvdykpIHtcblx0XHRcdFx0YnV0dG9uSW5kZXhUb0ZvY3VzID0gaW5kZXggPT09IHRoaXMuX2J1dHRvbnMubGVuZ3RoIC0gMSA/IDAgOiBpbmRleCArIDE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRldmVudEhhbmRsZWQgPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGV2ZW50SGFuZGxlZCAmJiB0eXBlb2YgYnV0dG9uSW5kZXhUb0ZvY3VzID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHR0aGlzLl9idXR0b25zW2J1dHRvbkluZGV4VG9Gb2N1c10uZm9jdXMoKTtcblx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdH1cblxuXHRcdH0pKTtcblx0fVxufVxuXG4vKipcbiAqIFRoaXMgaXMgYSBCdXR0b24gdGhhdCBzdXBwb3J0cyBhbiBpY29uIHRvIHRoZSBsZWZ0LCBhbmQgbWFya2Rvd24gdG8gdGhlIHJpZ2h0LCB3aXRoIHByb3BlciBzZXBhcmF0aW9uIGFuZCB3cmFwcGluZyB0aGUgbWFya2Rvd24gbGFiZWwsIHdoaWNoIEJ1dHRvbiBkb2Vzbid0IGRvLlxuICovXG5leHBvcnQgY2xhc3MgQnV0dG9uV2l0aEljb24gZXh0ZW5kcyBCdXR0b24ge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pY29uRWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21kbGFiZWxFbGVtZW50OiBIVE1MRWxlbWVudDtcblxuXHRwdWJsaWMgZ2V0IGxhYmVsRWxlbWVudCgpIHsgcmV0dXJuIHRoaXMuX21kbGFiZWxFbGVtZW50OyB9XG5cblx0cHVibGljIGdldCBpY29uRWxlbWVudCgpIHsgcmV0dXJuIHRoaXMuX2ljb25FbGVtZW50OyB9XG5cblx0Y29uc3RydWN0b3IoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgb3B0aW9uczogSUJ1dHRvbk9wdGlvbnMpIHtcblx0XHRzdXBlcihjb250YWluZXIsIG9wdGlvbnMpO1xuXG5cdFx0aWYgKG9wdGlvbnMuc3VwcG9ydFNob3J0TGFiZWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQnV0dG9uV2l0aEljb24gZG9lcyBub3Qgc3VwcG9ydCBzaG9ydCBsYWJlbHMnKTtcblx0XHR9XG5cblx0XHR0aGlzLl9lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ21vbmFjby1pY29uLWJ1dHRvbicpO1xuXHRcdHRoaXMuX2ljb25FbGVtZW50ID0gJCgnJyk7XG5cdFx0dGhpcy5fbWRsYWJlbEVsZW1lbnQgPSAkKCcubW9uYWNvLWJ1dHRvbi1tZGxhYmVsJyk7XG5cdFx0dGhpcy5fZWxlbWVudC5hcHBlbmQodGhpcy5faWNvbkVsZW1lbnQsIHRoaXMuX21kbGFiZWxFbGVtZW50KTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCBsYWJlbCgpOiBJTWFya2Rvd25TdHJpbmcgfCBzdHJpbmcge1xuXHRcdHJldHVybiBzdXBlci5sYWJlbDtcblx0fVxuXG5cdG92ZXJyaWRlIHNldCBsYWJlbCh2YWx1ZTogSU1hcmtkb3duU3RyaW5nIHwgc3RyaW5nKSB7XG5cdFx0aWYgKHRoaXMuX2xhYmVsID09PSB2YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChpc01hcmtkb3duU3RyaW5nKHRoaXMuX2xhYmVsKSAmJiBpc01hcmtkb3duU3RyaW5nKHZhbHVlKSAmJiBtYXJrZG93blN0cmluZ0VxdWFsKHRoaXMuX2xhYmVsLCB2YWx1ZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ21vbmFjby10ZXh0LWJ1dHRvbicpO1xuXHRcdGlmIChpc01hcmtkb3duU3RyaW5nKHZhbHVlKSkge1xuXHRcdFx0Y29uc3QgcmVuZGVyZWQgPSByZW5kZXJNYXJrZG93bih2YWx1ZSwgYnV0dG9uTWFya2Rvd25SZW5kZXJPcHRpb25zLCBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJykpO1xuXHRcdFx0cmVuZGVyZWQuZGlzcG9zZSgpO1xuXG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IHJvb3QgPSByZW5kZXJlZC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ3AnKT8uaW5uZXJIVE1MO1xuXHRcdFx0aWYgKHJvb3QpIHtcblx0XHRcdFx0c2FmZVNldElubmVySHRtbCh0aGlzLl9tZGxhYmVsRWxlbWVudCwgcm9vdCwgYnV0dG9uU2FuaXRpemVyQ29uZmlnKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc2V0KHRoaXMuX21kbGFiZWxFbGVtZW50KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy5zdXBwb3J0SWNvbnMpIHtcblx0XHRcdFx0cmVzZXQodGhpcy5fbWRsYWJlbEVsZW1lbnQsIC4uLnRoaXMuZ2V0Q29udGVudEVsZW1lbnRzKHZhbHVlKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9tZGxhYmVsRWxlbWVudC50ZXh0Q29udGVudCA9IHZhbHVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCB0aXRsZTogc3RyaW5nID0gJyc7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLm9wdGlvbnMudGl0bGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aXRsZSA9IHRoaXMub3B0aW9ucy50aXRsZTtcblx0XHR9IGVsc2UgaWYgKHRoaXMub3B0aW9ucy50aXRsZSkge1xuXHRcdFx0dGl0bGUgPSByZW5kZXJBc1BsYWludGV4dCh2YWx1ZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zZXRUaXRsZSh0aXRsZSk7XG5cdFx0dGhpcy5fc2V0QXJpYUxhYmVsKCk7XG5cdFx0dGhpcy5fbGFiZWwgPSB2YWx1ZTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCBpY29uKCk6IFRoZW1lSWNvbiB7XG5cdFx0cmV0dXJuIHN1cGVyLmljb247XG5cdH1cblxuXHRvdmVycmlkZSBzZXQgaWNvbihpY29uOiBUaGVtZUljb24pIHtcblx0XHR0aGlzLl9pY29uRWxlbWVudC5jbGFzc0xpc3QudmFsdWUgPSAnJztcblx0XHR0aGlzLl9pY29uRWxlbWVudC5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGljb24pKTtcblx0XHR0aGlzLl9zZXRBcmlhTGFiZWwoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyx1QkFBdUIsYUFBYSxXQUEwQixpQkFBaUIsT0FBTyxZQUFZLFNBQVM7QUFDcEgsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQkFBZ0IseUJBQXlCO0FBQ2xELFNBQVMsU0FBUyxhQUFhLHNCQUFzQjtBQUNyRCxTQUFTLDRCQUE0Qiwr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LGNBQWMsS0FBSyxlQUFlO0FBQUEsRUFDN0Q7QUFBQSxFQUVBLElBQWEsUUFBa0M7QUFDOUMsV0FBTyxNQUFNO0FBQUEsRUFDZDtBQUFBLEVBRUEsSUFBYSxNQUFNLE9BQWlDO0FBQ25ELFFBQUksS0FBSyxXQUFXLE9BQU87QUFDMUI7QUFBQSxJQUNEO0FBRUEsUUFBSSxpQkFBaUIsS0FBSyxNQUFNLEtBQUssaUJBQWlCLEtBQUssS0FBSyxvQkFBb0IsS0FBSyxRQUFRLEtBQUssR0FBRztBQUN4RztBQUFBLElBQ0Q7QUFFQSxTQUFLLFNBQVMsVUFBVSxJQUFJLG9CQUFvQjtBQUNoRCxRQUFJLGlCQUFpQixLQUFLLEdBQUc7QUFDNUIsWUFBTSxXQUFXLGVBQWUsT0FBTyw2QkFBNkIsU0FBUyxjQUFjLE1BQU0sQ0FBQztBQUNsRyxlQUFTLFFBQVE7QUFHakIsWUFBTSxPQUFPLFNBQVMsUUFBUSxjQUFjLEdBQUcsR0FBRztBQUNsRCxVQUFJLE1BQU07QUFDVCx5QkFBaUIsS0FBSyxpQkFBaUIsTUFBTSxxQkFBcUI7QUFBQSxNQUNuRSxPQUFPO0FBQ04sY0FBTSxLQUFLLGVBQWU7QUFBQSxNQUMzQjtBQUFBLElBQ0QsT0FBTztBQUNOLFVBQUksS0FBSyxRQUFRLGNBQWM7QUFDOUIsY0FBTSxLQUFLLGlCQUFpQixHQUFHLEtBQUssbUJBQW1CLEtBQUssQ0FBQztBQUFBLE1BQzlELE9BQU87QUFDTixhQUFLLGdCQUFnQixjQUFjO0FBQUEsTUFDcEM7QUFBQSxJQUNEO0FBRUEsUUFBSSxRQUFnQjtBQUNwQixRQUFJLE9BQU8sS0FBSyxRQUFRLFVBQVUsVUFBVTtBQUMzQyxjQUFRLEtBQUssUUFBUTtBQUFBLElBQ3RCLFdBQVcsS0FBSyxRQUFRLE9BQU87QUFDOUIsY0FBUSxrQkFBa0IsS0FBSztBQUFBLElBQ2hDO0FBRUEsU0FBSyxTQUFTLEtBQUs7QUFDbkIsU0FBSyxjQUFjO0FBQ25CLFNBQUssU0FBUztBQUFBLEVBQ2Y7QUFBQSxFQUVBLElBQWEsT0FBa0I7QUFDOUIsV0FBTyxNQUFNO0FBQUEsRUFDZDtBQUFBLEVBRUEsSUFBYSxLQUFLLE1BQWlCO0FBQ2xDLFNBQUssYUFBYSxVQUFVLFFBQVE7QUFDcEMsU0FBSyxhQUFhLFVBQVUsSUFBSSxHQUFHLFVBQVUsaUJBQWlCLElBQUksQ0FBQztBQUNuRSxTQUFLLGNBQWM7QUFBQSxFQUNwQjtBQUNEOyIsCiAgIm5hbWVzIjogWyJCdXR0b25CYXJBbGlnbm1lbnQiXQp9Cg==
