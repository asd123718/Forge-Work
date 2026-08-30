import * as dom from "../../dom.js";
import * as cssJs from "../../cssValue.js";
import { DomEmitter } from "../../event.js";
import { renderFormattedText, renderText } from "../../formattedTextRenderer.js";
import { ActionBar } from "../actionbar/actionbar.js";
import * as aria from "../aria/aria.js";
import { AnchorAlignment } from "../contextview/contextview.js";
import { getBaseLayerHoverDelegate } from "../hover/hoverDelegate2.js";
import { ScrollableElement } from "../scrollbar/scrollableElement.js";
import { Widget } from "../widget.js";
import { Emitter, Event } from "../../../common/event.js";
import { HistoryNavigator } from "../../../common/history.js";
import { equals } from "../../../common/objects.js";
import { ScrollbarVisibility } from "../../../common/scrollable.js";
import "./inputBox.css";
import * as nls from "../../../../nls.js";
import { MutableDisposable } from "../../../common/lifecycle.js";
const $ = dom.$;
var MessageType = /* @__PURE__ */ ((MessageType2) => {
  MessageType2[MessageType2["INFO"] = 1] = "INFO";
  MessageType2[MessageType2["WARNING"] = 2] = "WARNING";
  MessageType2[MessageType2["ERROR"] = 3] = "ERROR";
  return MessageType2;
})(MessageType || {});
const unthemedInboxStyles = {
  inputBackground: "#3C3C3C",
  inputForeground: "#CCCCCC",
  inputValidationInfoBorder: "#55AAFF",
  inputValidationInfoBackground: "#063B49",
  inputValidationWarningBorder: "#B89500",
  inputValidationWarningBackground: "#352A05",
  inputValidationErrorBorder: "#BE1100",
  inputValidationErrorBackground: "#5A1D1D",
  inputBorder: void 0,
  inputValidationErrorForeground: void 0,
  inputValidationInfoForeground: void 0,
  inputValidationWarningForeground: void 0
};
class InputBox extends Widget {
  constructor(container, contextViewProvider, options) {
    super();
    this.state = "idle";
    this.maxHeight = Number.POSITIVE_INFINITY;
    this.hover = this._register(new MutableDisposable());
    this.messageResizeObserver = this._register(new MutableDisposable());
    this._onDidChange = this._register(new Emitter());
    this._onDidHeightChange = this._register(new Emitter());
    this.contextViewProvider = contextViewProvider;
    this.options = options;
    this.message = null;
    this.placeholder = this.options.placeholder || "";
    this.tooltip = this.options.tooltip ?? (this.placeholder || "");
    this.ariaLabel = this.options.ariaLabel || "";
    if (this.options.validationOptions) {
      this.validation = this.options.validationOptions.validation;
    }
    this.element = dom.append(container, $(".monaco-inputbox.idle"));
    const tagName = this.options.flexibleHeight ? "textarea" : "input";
    const wrapper = dom.append(this.element, $(".ibwrapper"));
    this.input = dom.append(wrapper, $(tagName + ".input.empty"));
    this.input.setAttribute("autocorrect", "off");
    this.input.setAttribute("autocapitalize", "off");
    this.input.setAttribute("spellcheck", "false");
    this.onfocus(this.input, () => this.element.classList.add("synthetic-focus"));
    this.onblur(this.input, () => this.element.classList.remove("synthetic-focus"));
    if (this.options.flexibleHeight) {
      this.maxHeight = typeof this.options.flexibleMaxHeight === "number" ? this.options.flexibleMaxHeight : Number.POSITIVE_INFINITY;
      this.mirror = dom.append(wrapper, $("div.mirror"));
      this.mirror.innerText = "\xA0";
      this.scrollableElement = new ScrollableElement(this.element, { vertical: ScrollbarVisibility.Auto });
      if (this.options.flexibleWidth) {
        this.input.setAttribute("wrap", "off");
        this.mirror.style.whiteSpace = "pre";
        this.mirror.style.wordWrap = "initial";
      }
      dom.append(container, this.scrollableElement.getDomNode());
      this._register(this.scrollableElement);
      this._register(this.scrollableElement.onScroll((e) => this.input.scrollTop = e.scrollTop));
      const onSelectionChange = this._register(new DomEmitter(container.ownerDocument, "selectionchange"));
      const onAnchoredSelectionChange = Event.filter(onSelectionChange.event, () => {
        const selection = container.ownerDocument.getSelection();
        return selection?.anchorNode === wrapper;
      });
      this._register(onAnchoredSelectionChange(this.updateScrollDimensions, this));
      this._register(this.onDidHeightChange(this.updateScrollDimensions, this));
    } else {
      this.input.type = this.options.type || "text";
      this.input.setAttribute("wrap", "off");
    }
    if (this.ariaLabel) {
      this.input.setAttribute("aria-label", this.ariaLabel);
    }
    if (this.placeholder && !this.options.showPlaceholderOnFocus) {
      this.setPlaceHolder(this.placeholder);
    }
    if (this.tooltip) {
      this.setTooltip(this.tooltip);
    }
    this.oninput(this.input, () => this.onValueChange());
    this.onblur(this.input, () => this.onBlur());
    this.onfocus(this.input, () => this.onFocus());
    this._register(this.ignoreGesture(this.input));
    setTimeout(() => this.updateMirror(), 0);
    if (this.options.actions) {
      this.actionbar = this._register(new ActionBar(this.element, {
        actionViewItemProvider: this.options.actionViewItemProvider
      }));
      this.actionbar.push(this.options.actions, { icon: true, label: false });
    }
    this.applyStyles();
  }
  get onDidChange() {
    return this._onDidChange.event;
  }
  get onDidHeightChange() {
    return this._onDidHeightChange.event;
  }
  setActions(actions, actionViewItemProvider) {
    if (this.actionbar) {
      this.actionbar.clear();
      if (actions) {
        this.actionbar.push(actions, { icon: true, label: false });
      }
    } else if (actions) {
      this.actionbar = this._register(new ActionBar(this.element, {
        actionViewItemProvider: actionViewItemProvider ?? this.options.actionViewItemProvider
      }));
      this.actionbar.push(actions, { icon: true, label: false });
    }
  }
  get actionsWidth() {
    return this.actionbar?.getContainer().offsetWidth ?? 0;
  }
  onBlur() {
    this._hideMessage();
    if (this.options.showPlaceholderOnFocus) {
      this.input.setAttribute("placeholder", "");
    }
  }
  onFocus() {
    this._showMessage();
    if (this.options.showPlaceholderOnFocus) {
      this.input.setAttribute("placeholder", this.placeholder || "");
    }
  }
  setPlaceHolder(placeHolder) {
    this.placeholder = placeHolder;
    this.input.setAttribute("placeholder", placeHolder);
  }
  setTooltip(tooltip) {
    this.tooltip = tooltip;
    if (!this.hover.value) {
      this.hover.value = this._register(getBaseLayerHoverDelegate().setupDelayedHoverAtMouse(this.input, () => ({
        content: this.tooltip,
        appearance: {
          compact: true
        }
      })));
    }
  }
  setAriaLabel(label) {
    this.ariaLabel = label;
    if (label) {
      this.input.setAttribute("aria-label", this.ariaLabel);
    } else {
      this.input.removeAttribute("aria-label");
    }
  }
  getAriaLabel() {
    return this.ariaLabel;
  }
  get mirrorElement() {
    return this.mirror;
  }
  get inputElement() {
    return this.input;
  }
  get value() {
    return this.input.value;
  }
  set value(newValue) {
    if (this.input.value !== newValue) {
      this.input.value = newValue;
      this.onValueChange();
    }
  }
  get step() {
    return this.input.step;
  }
  set step(newValue) {
    this.input.step = newValue;
  }
  get height() {
    return typeof this.cachedHeight === "number" ? this.cachedHeight : dom.getTotalHeight(this.element);
  }
  focus() {
    this.input.focus();
  }
  blur() {
    this.input.blur();
  }
  hasFocus() {
    return dom.isActiveElement(this.input);
  }
  select(range = null) {
    this.input.select();
    if (range) {
      this.input.setSelectionRange(range.start, range.end);
      if (range.end === this.input.value.length) {
        this.input.scrollLeft = this.input.scrollWidth;
      }
    }
  }
  isSelectionAtEnd() {
    return this.input.selectionEnd === this.input.value.length && this.input.selectionStart === this.input.selectionEnd;
  }
  getSelection() {
    const selectionStart = this.input.selectionStart;
    if (selectionStart === null) {
      return null;
    }
    const selectionEnd = this.input.selectionEnd ?? selectionStart;
    return {
      start: selectionStart,
      end: selectionEnd
    };
  }
  enable() {
    this.input.removeAttribute("disabled");
  }
  disable() {
    this.blur();
    this.input.disabled = true;
    this._hideMessage();
  }
  setEnabled(enabled) {
    if (enabled) {
      this.enable();
    } else {
      this.disable();
    }
  }
  get width() {
    return dom.getTotalWidth(this.input);
  }
  set width(width) {
    if (this.options.flexibleHeight && this.options.flexibleWidth) {
      let horizontalPadding = 0;
      if (this.mirror) {
        const paddingLeft = parseFloat(this.mirror.style.paddingLeft || "") || 0;
        const paddingRight = parseFloat(this.mirror.style.paddingRight || "") || 0;
        horizontalPadding = paddingLeft + paddingRight;
      }
      this.input.style.width = width - horizontalPadding + "px";
    } else {
      this.input.style.width = width + "px";
    }
    if (this.mirror) {
      this.mirror.style.width = width + "px";
    }
  }
  set paddingRight(paddingRight) {
    this.input.style.width = `calc(100% - ${paddingRight}px)`;
    if (this.mirror) {
      this.mirror.style.paddingRight = paddingRight + "px";
    }
  }
  updateScrollDimensions() {
    if (typeof this.cachedContentHeight !== "number" || typeof this.cachedHeight !== "number" || !this.scrollableElement) {
      return;
    }
    const scrollHeight = this.cachedContentHeight;
    const height = this.cachedHeight;
    const scrollTop = this.input.scrollTop;
    this.scrollableElement.setScrollDimensions({ scrollHeight, height });
    this.scrollableElement.setScrollPosition({ scrollTop });
  }
  showMessage(message, force) {
    if (this.state === "open" && equals(this.message, message)) {
      return;
    }
    this.message = message;
    this.element.classList.remove("idle");
    this.element.classList.remove("info");
    this.element.classList.remove("warning");
    this.element.classList.remove("error");
    this.element.classList.add(this.classForType(message.type));
    const styles = this.stylesForType(this.message.type);
    this.element.style.border = `1px solid ${cssJs.asCssValueWithDefault(styles.border, "transparent")}`;
    if (this.message.content && (this.hasFocus() || force)) {
      this._showMessage();
    }
  }
  hideMessage() {
    this.message = null;
    this.element.classList.remove("info");
    this.element.classList.remove("warning");
    this.element.classList.remove("error");
    this.element.classList.add("idle");
    this._hideMessage();
    this.applyStyles();
  }
  isInputValid() {
    return !!this.validation && !this.validation(this.value);
  }
  validate() {
    let errorMsg = null;
    if (this.validation) {
      errorMsg = this.validation(this.value);
      if (errorMsg) {
        this.inputElement.setAttribute("aria-invalid", "true");
        this.showMessage(errorMsg);
      } else if (this.inputElement.hasAttribute("aria-invalid")) {
        this.inputElement.removeAttribute("aria-invalid");
        this.hideMessage();
      }
    }
    return errorMsg?.type;
  }
  stylesForType(type) {
    const styles = this.options.inputBoxStyles;
    switch (type) {
      case 1 /* INFO */:
        return { border: styles.inputValidationInfoBorder, background: styles.inputValidationInfoBackground, foreground: styles.inputValidationInfoForeground };
      case 2 /* WARNING */:
        return { border: styles.inputValidationWarningBorder, background: styles.inputValidationWarningBackground, foreground: styles.inputValidationWarningForeground };
      default:
        return { border: styles.inputValidationErrorBorder, background: styles.inputValidationErrorBackground, foreground: styles.inputValidationErrorForeground };
    }
  }
  classForType(type) {
    switch (type) {
      case 1 /* INFO */:
        return "info";
      case 2 /* WARNING */:
        return "warning";
      default:
        return "error";
    }
  }
  _showMessage() {
    if (!this.contextViewProvider || !this.message) {
      return;
    }
    let div;
    const layout = () => div.style.width = dom.getTotalWidth(this.element) + "px";
    this.contextViewProvider.showContextView({
      getAnchor: () => this.element,
      anchorAlignment: AnchorAlignment.RIGHT,
      render: (container) => {
        if (!this.message) {
          return null;
        }
        div = dom.append(container, $(".monaco-inputbox-container"));
        layout();
        const spanElement = $("span.monaco-inputbox-message");
        if (this.message.formatContent) {
          renderFormattedText(this.message.content, void 0, spanElement);
        } else {
          renderText(this.message.content, void 0, spanElement);
        }
        spanElement.classList.add(this.classForType(this.message.type));
        const styles = this.stylesForType(this.message.type);
        spanElement.style.backgroundColor = styles.background ?? "";
        spanElement.style.color = styles.foreground ?? "";
        spanElement.style.border = styles.border ? `1px solid ${styles.border}` : "";
        dom.append(div, spanElement);
        return null;
      },
      onHide: () => {
        this.state = "closed";
        this.messageResizeObserver.clear();
      },
      layout
    });
    this.observeElementResize();
    let alertText;
    if (this.message.type === 3 /* ERROR */) {
      alertText = nls.localize("alertErrorMessage", "Error: {0}", this.message.content);
    } else if (this.message.type === 2 /* WARNING */) {
      alertText = nls.localize("alertWarningMessage", "Warning: {0}", this.message.content);
    } else {
      alertText = nls.localize("alertInfoMessage", "Info: {0}", this.message.content);
    }
    aria.alert(alertText);
    this.state = "open";
  }
  _hideMessage() {
    if (!this.contextViewProvider) {
      return;
    }
    if (this.state === "open") {
      this.contextViewProvider.hideContextView();
    }
    this.messageResizeObserver.clear();
    this.state = "idle";
  }
  /**
   * Keeps the validation message sized and anchored to the input while the
   * message is showing and the input itself is resized, e.g. because the
   * containing view was resized.
   */
  observeElementResize() {
    const observer = new dom.DisposableResizeObserver("InputBox.validationMessage", () => {
      if (this.element.isConnected && dom.getTotalWidth(this.element) > 0) {
        this.layoutMessage();
      }
    }, dom.getWindow(this.element));
    observer.observe(this.element);
    this.messageResizeObserver.value = observer;
  }
  layoutMessage() {
    if (this.state === "open" && this.contextViewProvider) {
      this.contextViewProvider.layout();
    }
  }
  onValueChange() {
    this._onDidChange.fire(this.value);
    this.validate();
    this.updateMirror();
    this.input.classList.toggle("empty", !this.value);
    if (this.state === "open" && this.contextViewProvider) {
      this.contextViewProvider.layout();
    }
    if (this.options.hideHoverOnValueChange) {
      getBaseLayerHoverDelegate().hideHover();
    }
  }
  updateMirror() {
    if (!this.mirror) {
      return;
    }
    const value = this.value;
    const lastCharCode = value.charCodeAt(value.length - 1);
    const suffix = lastCharCode === 10 ? " " : "";
    const mirrorTextContent = (value + suffix).replace(/\u000c/g, "");
    if (mirrorTextContent) {
      this.mirror.textContent = value + suffix;
    } else {
      this.mirror.innerText = "\xA0";
    }
    this.layout();
  }
  applyStyles() {
    const styles = this.options.inputBoxStyles;
    const background = styles.inputBackground ?? "";
    const foreground = styles.inputForeground ?? "";
    const border = styles.inputBorder ?? "";
    this.element.style.backgroundColor = background;
    this.element.style.color = foreground;
    this.input.style.backgroundColor = "inherit";
    this.input.style.color = foreground;
    this.element.style.border = `1px solid ${cssJs.asCssValueWithDefault(border, "transparent")}`;
  }
  layout() {
    if (!this.mirror) {
      this.layoutMessage();
      return;
    }
    const previousHeight = this.cachedContentHeight;
    this.cachedContentHeight = dom.getTotalHeight(this.mirror);
    if (previousHeight !== this.cachedContentHeight) {
      this.cachedHeight = Math.min(this.cachedContentHeight, this.maxHeight);
      this.input.style.height = this.cachedHeight + "px";
      this._onDidHeightChange.fire(this.cachedContentHeight);
    }
    this.layoutMessage();
  }
  insertAtCursor(text) {
    const inputElement = this.inputElement;
    const start = inputElement.selectionStart;
    const end = inputElement.selectionEnd;
    const content = inputElement.value;
    if (start !== null && end !== null) {
      this.value = content.substr(0, start) + text + content.substr(end);
      inputElement.setSelectionRange(start + 1, start + 1);
      this.layout();
    }
  }
  dispose() {
    this._hideMessage();
    this.message = null;
    this.actionbar?.dispose();
    super.dispose();
  }
}
class HistoryInputBox extends InputBox {
  constructor(container, contextViewProvider, options) {
    const NLS_PLACEHOLDER_HISTORY_HINT_SUFFIX_NO_PARENS = nls.localize({
      key: "history.inputbox.hint.suffix.noparens",
      comment: ['Text is the suffix of an input field placeholder coming after the action the input field performs, this will be used when the input field ends in a closing parenthesis ")", for example "Filter (e.g. text, !exclude)". The character inserted into the final string is \u21C5 to represent the up and down arrow keys.']
    }, " or {0} for history", `\u21C5`);
    const NLS_PLACEHOLDER_HISTORY_HINT_SUFFIX_IN_PARENS = nls.localize({
      key: "history.inputbox.hint.suffix.inparens",
      comment: ['Text is the suffix of an input field placeholder coming after the action the input field performs, this will be used when the input field does NOT end in a closing parenthesis (eg. "Find"). The character inserted into the final string is \u21C5 to represent the up and down arrow keys.']
    }, " ({0} for history)", `\u21C5`);
    super(container, contextViewProvider, options);
    this._onDidFocus = this._register(new Emitter());
    this.onDidFocus = this._onDidFocus.event;
    this._onDidBlur = this._register(new Emitter());
    this.onDidBlur = this._onDidBlur.event;
    this.history = this._register(new HistoryNavigator(options.history, 100));
    const addSuffix = () => {
      if (options.showHistoryHint && options.showHistoryHint() && !this.placeholder.endsWith(NLS_PLACEHOLDER_HISTORY_HINT_SUFFIX_NO_PARENS) && !this.placeholder.endsWith(NLS_PLACEHOLDER_HISTORY_HINT_SUFFIX_IN_PARENS) && this.history.getHistory().length) {
        const suffix = this.placeholder.endsWith(")") ? NLS_PLACEHOLDER_HISTORY_HINT_SUFFIX_NO_PARENS : NLS_PLACEHOLDER_HISTORY_HINT_SUFFIX_IN_PARENS;
        const suffixedPlaceholder = this.placeholder + suffix;
        if (options.showPlaceholderOnFocus && !dom.isActiveElement(this.input)) {
          this.placeholder = suffixedPlaceholder;
        } else {
          this.setPlaceHolder(suffixedPlaceholder);
        }
      }
    };
    this.observer = new MutationObserver((mutationList, observer) => {
      mutationList.forEach((mutation) => {
        if (!mutation.target.textContent) {
          addSuffix();
        }
      });
    });
    this.observer.observe(this.input, { attributeFilter: ["class"] });
    this.onfocus(this.input, () => addSuffix());
    this.onblur(this.input, () => {
      const resetPlaceholder = (historyHint) => {
        if (!this.placeholder.endsWith(historyHint)) {
          return false;
        } else {
          const revertedPlaceholder = this.placeholder.slice(0, this.placeholder.length - historyHint.length);
          if (options.showPlaceholderOnFocus) {
            this.placeholder = revertedPlaceholder;
          } else {
            this.setPlaceHolder(revertedPlaceholder);
          }
          return true;
        }
      };
      if (!resetPlaceholder(NLS_PLACEHOLDER_HISTORY_HINT_SUFFIX_IN_PARENS)) {
        resetPlaceholder(NLS_PLACEHOLDER_HISTORY_HINT_SUFFIX_NO_PARENS);
      }
    });
  }
  dispose() {
    super.dispose();
    if (this.observer) {
      this.observer.disconnect();
      this.observer = void 0;
    }
  }
  addToHistory(always) {
    if (this.value && (always || this.value !== this.getCurrentValue())) {
      this.history.add(this.value);
    }
  }
  prependHistory(restoredHistory) {
    const newHistory = this.getHistory();
    this.clearHistory();
    restoredHistory.forEach((item) => {
      this.history.add(item);
    });
    newHistory.forEach((item) => {
      this.history.add(item);
    });
  }
  getHistory() {
    return this.history.getHistory();
  }
  isAtFirstInHistory() {
    return this.history.isFirst();
  }
  isAtLastInHistory() {
    return this.history.isLast();
  }
  isNowhereInHistory() {
    return this.history.isNowhere();
  }
  showNextValue() {
    if (!this.history.has(this.value)) {
      this.addToHistory();
    }
    let next = this.getNextValue();
    if (next) {
      next = next === this.value ? this.getNextValue() : next;
    }
    this.value = next ?? "";
    aria.status(this.value ? this.value : nls.localize("clearedInput", "Cleared Input"));
  }
  showPreviousValue() {
    if (!this.history.has(this.value)) {
      this.addToHistory();
    }
    let previous = this.getPreviousValue();
    if (previous) {
      previous = previous === this.value ? this.getPreviousValue() : previous;
    }
    if (previous) {
      this.value = previous;
      aria.status(this.value);
    }
  }
  clearHistory() {
    this.history.clear();
  }
  setPlaceHolder(placeHolder) {
    super.setPlaceHolder(placeHolder);
    this.setTooltip(placeHolder);
  }
  onBlur() {
    super.onBlur();
    this._onDidBlur.fire();
  }
  onFocus() {
    super.onFocus();
    this._onDidFocus.fire();
  }
  getCurrentValue() {
    let currentValue = this.history.current();
    if (!currentValue) {
      currentValue = this.history.last();
      this.history.next();
    }
    return currentValue;
  }
  getPreviousValue() {
    return this.history.previous() || this.history.first();
  }
  getNextValue() {
    return this.history.next();
  }
}
export {
  HistoryInputBox,
  InputBox,
  MessageType,
  unthemedInboxStyles
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFx1aVxcaW5wdXRib3hcXGlucHV0Qm94LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uL2RvbS5qcyc7XG5pbXBvcnQgKiBhcyBjc3NKcyBmcm9tICcuLi8uLi9jc3NWYWx1ZS5qcyc7XG5pbXBvcnQgeyBEb21FbWl0dGVyIH0gZnJvbSAnLi4vLi4vZXZlbnQuanMnO1xuaW1wb3J0IHsgcmVuZGVyRm9ybWF0dGVkVGV4dCwgcmVuZGVyVGV4dCB9IGZyb20gJy4uLy4uL2Zvcm1hdHRlZFRleHRSZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJSGlzdG9yeU5hdmlnYXRpb25XaWRnZXQgfSBmcm9tICcuLi8uLi9oaXN0b3J5LmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciwgSUFjdGlvblZpZXdJdGVtUHJvdmlkZXIgfSBmcm9tICcuLi9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCAqIGFzIGFyaWEgZnJvbSAnLi4vYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IEFuY2hvckFsaWdubWVudCwgSUNvbnRleHRWaWV3UHJvdmlkZXIgfSBmcm9tICcuLi9jb250ZXh0dmlldy9jb250ZXh0dmlldy5qcyc7XG5pbXBvcnQgeyBnZXRCYXNlTGF5ZXJIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vaG92ZXIvaG92ZXJEZWxlZ2F0ZTIuanMnO1xuaW1wb3J0IHsgU2Nyb2xsYWJsZUVsZW1lbnQgfSBmcm9tICcuLi9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgV2lkZ2V0IH0gZnJvbSAnLi4vd2lkZ2V0LmpzJztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBIaXN0b3J5TmF2aWdhdG9yLCBJSGlzdG9yeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9oaXN0b3J5LmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IFNjcm9sbGJhclZpc2liaWxpdHkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgJy4vaW5wdXRCb3guY3NzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTXV0YWJsZURpc3Bvc2FibGUsIHR5cGUgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuXG5jb25zdCAkID0gZG9tLiQ7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUlucHV0T3B0aW9ucyB7XG5cdHJlYWRvbmx5IHBsYWNlaG9sZGVyPzogc3RyaW5nO1xuXHRyZWFkb25seSBzaG93UGxhY2Vob2xkZXJPbkZvY3VzPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgdG9vbHRpcD86IHN0cmluZztcblx0cmVhZG9ubHkgYXJpYUxhYmVsPzogc3RyaW5nO1xuXHRyZWFkb25seSB0eXBlPzogc3RyaW5nO1xuXHRyZWFkb25seSB2YWxpZGF0aW9uT3B0aW9ucz86IElJbnB1dFZhbGlkYXRpb25PcHRpb25zO1xuXHRyZWFkb25seSBmbGV4aWJsZUhlaWdodD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGZsZXhpYmxlV2lkdGg/OiBib29sZWFuO1xuXHRyZWFkb25seSBmbGV4aWJsZU1heEhlaWdodD86IG51bWJlcjtcblx0cmVhZG9ubHkgYWN0aW9ucz86IFJlYWRvbmx5QXJyYXk8SUFjdGlvbj47XG5cdHJlYWRvbmx5IGFjdGlvblZpZXdJdGVtUHJvdmlkZXI/OiBJQWN0aW9uVmlld0l0ZW1Qcm92aWRlcjtcblx0cmVhZG9ubHkgaW5wdXRCb3hTdHlsZXM6IElJbnB1dEJveFN0eWxlcztcblx0cmVhZG9ubHkgaGlzdG9yeT86IElIaXN0b3J5PHN0cmluZz47XG5cdHJlYWRvbmx5IGhpZGVIb3Zlck9uVmFsdWVDaGFuZ2U/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElJbnB1dEJveFN0eWxlcyB7XG5cdHJlYWRvbmx5IGlucHV0QmFja2dyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBpbnB1dEZvcmVncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgaW5wdXRCb3JkZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgaW5wdXRWYWxpZGF0aW9uSW5mb0JvcmRlcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBpbnB1dFZhbGlkYXRpb25JbmZvQmFja2dyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBpbnB1dFZhbGlkYXRpb25JbmZvRm9yZWdyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBpbnB1dFZhbGlkYXRpb25XYXJuaW5nQm9yZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGlucHV0VmFsaWRhdGlvbldhcm5pbmdCYWNrZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGlucHV0VmFsaWRhdGlvbldhcm5pbmdGb3JlZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGlucHV0VmFsaWRhdGlvbkVycm9yQm9yZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGlucHV0VmFsaWRhdGlvbkVycm9yQmFja2dyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBpbnB1dFZhbGlkYXRpb25FcnJvckZvcmVncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJSW5wdXRWYWxpZGF0b3Ige1xuXHQodmFsdWU6IHN0cmluZyk6IElNZXNzYWdlIHwgbnVsbDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTWVzc2FnZSB7XG5cdHJlYWRvbmx5IGNvbnRlbnQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGZvcm1hdENvbnRlbnQ/OiBib29sZWFuOyAvLyBkZWZhdWx0cyB0byBmYWxzZVxuXHRyZWFkb25seSB0eXBlPzogTWVzc2FnZVR5cGU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUlucHV0VmFsaWRhdGlvbk9wdGlvbnMge1xuXHR2YWxpZGF0aW9uPzogSUlucHV0VmFsaWRhdG9yO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBNZXNzYWdlVHlwZSB7XG5cdElORk8gPSAxLFxuXHRXQVJOSU5HID0gMixcblx0RVJST1IgPSAzXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJhbmdlIHtcblx0c3RhcnQ6IG51bWJlcjtcblx0ZW5kOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCB1bnRoZW1lZEluYm94U3R5bGVzOiBJSW5wdXRCb3hTdHlsZXMgPSB7XG5cdGlucHV0QmFja2dyb3VuZDogJyMzQzNDM0MnLFxuXHRpbnB1dEZvcmVncm91bmQ6ICcjQ0NDQ0NDJyxcblx0aW5wdXRWYWxpZGF0aW9uSW5mb0JvcmRlcjogJyM1NUFBRkYnLFxuXHRpbnB1dFZhbGlkYXRpb25JbmZvQmFja2dyb3VuZDogJyMwNjNCNDknLFxuXHRpbnB1dFZhbGlkYXRpb25XYXJuaW5nQm9yZGVyOiAnI0I4OTUwMCcsXG5cdGlucHV0VmFsaWRhdGlvbldhcm5pbmdCYWNrZ3JvdW5kOiAnIzM1MkEwNScsXG5cdGlucHV0VmFsaWRhdGlvbkVycm9yQm9yZGVyOiAnI0JFMTEwMCcsXG5cdGlucHV0VmFsaWRhdGlvbkVycm9yQmFja2dyb3VuZDogJyM1QTFEMUQnLFxuXHRpbnB1dEJvcmRlcjogdW5kZWZpbmVkLFxuXHRpbnB1dFZhbGlkYXRpb25FcnJvckZvcmVncm91bmQ6IHVuZGVmaW5lZCxcblx0aW5wdXRWYWxpZGF0aW9uSW5mb0ZvcmVncm91bmQ6IHVuZGVmaW5lZCxcblx0aW5wdXRWYWxpZGF0aW9uV2FybmluZ0ZvcmVncm91bmQ6IHVuZGVmaW5lZFxufTtcblxuZXhwb3J0IGNsYXNzIElucHV0Qm94IGV4dGVuZHMgV2lkZ2V0IHtcblx0cHJpdmF0ZSBjb250ZXh0Vmlld1Byb3ZpZGVyPzogSUNvbnRleHRWaWV3UHJvdmlkZXI7XG5cdGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRwcm90ZWN0ZWQgaW5wdXQ6IEhUTUxJbnB1dEVsZW1lbnQ7XG5cdHByaXZhdGUgYWN0aW9uYmFyPzogQWN0aW9uQmFyO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM6IElJbnB1dE9wdGlvbnM7XG5cdHByaXZhdGUgbWVzc2FnZTogSU1lc3NhZ2UgfCBudWxsO1xuXHRwcm90ZWN0ZWQgcGxhY2Vob2xkZXI6IHN0cmluZztcblx0cHJpdmF0ZSB0b29sdGlwOiBzdHJpbmc7XG5cdHByaXZhdGUgYXJpYUxhYmVsOiBzdHJpbmc7XG5cdHByaXZhdGUgdmFsaWRhdGlvbj86IElJbnB1dFZhbGlkYXRvcjtcblx0cHJpdmF0ZSBzdGF0ZTogJ2lkbGUnIHwgJ29wZW4nIHwgJ2Nsb3NlZCcgPSAnaWRsZSc7XG5cblx0cHJpdmF0ZSBtaXJyb3I6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNhY2hlZEhlaWdodDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNhY2hlZENvbnRlbnRIZWlnaHQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBtYXhIZWlnaHQ6IG51bWJlciA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcblx0cHJpdmF0ZSBzY3JvbGxhYmxlRWxlbWVudDogU2Nyb2xsYWJsZUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgaG92ZXI6IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBtZXNzYWdlUmVzaXplT2JzZXJ2ZXI6IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHB1YmxpYyBnZXQgb25EaWRDaGFuZ2UoKTogRXZlbnQ8c3RyaW5nPiB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDsgfVxuXG5cdHByaXZhdGUgX29uRGlkSGVpZ2h0Q2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0cHVibGljIGdldCBvbkRpZEhlaWdodENoYW5nZSgpOiBFdmVudDxudW1iZXI+IHsgcmV0dXJuIHRoaXMuX29uRGlkSGVpZ2h0Q2hhbmdlLmV2ZW50OyB9XG5cblx0Y29uc3RydWN0b3IoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgY29udGV4dFZpZXdQcm92aWRlcjogSUNvbnRleHRWaWV3UHJvdmlkZXIgfCB1bmRlZmluZWQsIG9wdGlvbnM6IElJbnB1dE9wdGlvbnMpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5jb250ZXh0Vmlld1Byb3ZpZGVyID0gY29udGV4dFZpZXdQcm92aWRlcjtcblx0XHR0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuXG5cdFx0dGhpcy5tZXNzYWdlID0gbnVsbDtcblx0XHR0aGlzLnBsYWNlaG9sZGVyID0gdGhpcy5vcHRpb25zLnBsYWNlaG9sZGVyIHx8ICcnO1xuXHRcdHRoaXMudG9vbHRpcCA9IHRoaXMub3B0aW9ucy50b29sdGlwID8/ICh0aGlzLnBsYWNlaG9sZGVyIHx8ICcnKTtcblx0XHR0aGlzLmFyaWFMYWJlbCA9IHRoaXMub3B0aW9ucy5hcmlhTGFiZWwgfHwgJyc7XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLnZhbGlkYXRpb25PcHRpb25zKSB7XG5cdFx0XHR0aGlzLnZhbGlkYXRpb24gPSB0aGlzLm9wdGlvbnMudmFsaWRhdGlvbk9wdGlvbnMudmFsaWRhdGlvbjtcblx0XHR9XG5cblx0XHR0aGlzLmVsZW1lbnQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLm1vbmFjby1pbnB1dGJveC5pZGxlJykpO1xuXG5cdFx0Y29uc3QgdGFnTmFtZSA9IHRoaXMub3B0aW9ucy5mbGV4aWJsZUhlaWdodCA/ICd0ZXh0YXJlYScgOiAnaW5wdXQnO1xuXG5cdFx0Y29uc3Qgd3JhcHBlciA9IGRvbS5hcHBlbmQodGhpcy5lbGVtZW50LCAkKCcuaWJ3cmFwcGVyJykpO1xuXHRcdHRoaXMuaW5wdXQgPSBkb20uYXBwZW5kKHdyYXBwZXIsICQodGFnTmFtZSArICcuaW5wdXQuZW1wdHknKSk7XG5cdFx0dGhpcy5pbnB1dC5zZXRBdHRyaWJ1dGUoJ2F1dG9jb3JyZWN0JywgJ29mZicpO1xuXHRcdHRoaXMuaW5wdXQuc2V0QXR0cmlidXRlKCdhdXRvY2FwaXRhbGl6ZScsICdvZmYnKTtcblx0XHR0aGlzLmlucHV0LnNldEF0dHJpYnV0ZSgnc3BlbGxjaGVjaycsICdmYWxzZScpO1xuXG5cdFx0dGhpcy5vbmZvY3VzKHRoaXMuaW5wdXQsICgpID0+IHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdzeW50aGV0aWMtZm9jdXMnKSk7XG5cdFx0dGhpcy5vbmJsdXIodGhpcy5pbnB1dCwgKCkgPT4gdGhpcy5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ3N5bnRoZXRpYy1mb2N1cycpKTtcblxuXHRcdGlmICh0aGlzLm9wdGlvbnMuZmxleGlibGVIZWlnaHQpIHtcblx0XHRcdHRoaXMubWF4SGVpZ2h0ID0gdHlwZW9mIHRoaXMub3B0aW9ucy5mbGV4aWJsZU1heEhlaWdodCA9PT0gJ251bWJlcicgPyB0aGlzLm9wdGlvbnMuZmxleGlibGVNYXhIZWlnaHQgOiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG5cblx0XHRcdHRoaXMubWlycm9yID0gZG9tLmFwcGVuZCh3cmFwcGVyLCAkKCdkaXYubWlycm9yJykpO1xuXHRcdFx0dGhpcy5taXJyb3IuaW5uZXJUZXh0ID0gJ1xcdTAwYTAnO1xuXG5cdFx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50ID0gbmV3IFNjcm9sbGFibGVFbGVtZW50KHRoaXMuZWxlbWVudCwgeyB2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvIH0pO1xuXG5cdFx0XHRpZiAodGhpcy5vcHRpb25zLmZsZXhpYmxlV2lkdGgpIHtcblx0XHRcdFx0dGhpcy5pbnB1dC5zZXRBdHRyaWJ1dGUoJ3dyYXAnLCAnb2ZmJyk7XG5cdFx0XHRcdHRoaXMubWlycm9yLnN0eWxlLndoaXRlU3BhY2UgPSAncHJlJztcblx0XHRcdFx0dGhpcy5taXJyb3Iuc3R5bGUud29yZFdyYXAgPSAnaW5pdGlhbCc7XG5cdFx0XHR9XG5cblx0XHRcdGRvbS5hcHBlbmQoY29udGFpbmVyLCB0aGlzLnNjcm9sbGFibGVFbGVtZW50LmdldERvbU5vZGUoKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNjcm9sbGFibGVFbGVtZW50KTtcblxuXHRcdFx0Ly8gZnJvbSBTY3JvbGxhYmxlRWxlbWVudCB0byBET01cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQub25TY3JvbGwoZSA9PiB0aGlzLmlucHV0LnNjcm9sbFRvcCA9IGUuc2Nyb2xsVG9wKSk7XG5cblx0XHRcdGNvbnN0IG9uU2VsZWN0aW9uQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERvbUVtaXR0ZXIoY29udGFpbmVyLm93bmVyRG9jdW1lbnQsICdzZWxlY3Rpb25jaGFuZ2UnKSk7XG5cdFx0XHRjb25zdCBvbkFuY2hvcmVkU2VsZWN0aW9uQ2hhbmdlID0gRXZlbnQuZmlsdGVyKG9uU2VsZWN0aW9uQ2hhbmdlLmV2ZW50LCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IGNvbnRhaW5lci5vd25lckRvY3VtZW50LmdldFNlbGVjdGlvbigpO1xuXHRcdFx0XHRyZXR1cm4gc2VsZWN0aW9uPy5hbmNob3JOb2RlID09PSB3cmFwcGVyO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIGZyb20gRE9NIHRvIFNjcm9sbGFibGVFbGVtZW50XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihvbkFuY2hvcmVkU2VsZWN0aW9uQ2hhbmdlKHRoaXMudXBkYXRlU2Nyb2xsRGltZW5zaW9ucywgdGhpcykpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZEhlaWdodENoYW5nZSh0aGlzLnVwZGF0ZVNjcm9sbERpbWVuc2lvbnMsIHRoaXMpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5pbnB1dC50eXBlID0gdGhpcy5vcHRpb25zLnR5cGUgfHwgJ3RleHQnO1xuXHRcdFx0dGhpcy5pbnB1dC5zZXRBdHRyaWJ1dGUoJ3dyYXAnLCAnb2ZmJyk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuYXJpYUxhYmVsKSB7XG5cdFx0XHR0aGlzLmlucHV0LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRoaXMuYXJpYUxhYmVsKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5wbGFjZWhvbGRlciAmJiAhdGhpcy5vcHRpb25zLnNob3dQbGFjZWhvbGRlck9uRm9jdXMpIHtcblx0XHRcdHRoaXMuc2V0UGxhY2VIb2xkZXIodGhpcy5wbGFjZWhvbGRlcik7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMudG9vbHRpcCkge1xuXHRcdFx0dGhpcy5zZXRUb29sdGlwKHRoaXMudG9vbHRpcCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5vbmlucHV0KHRoaXMuaW5wdXQsICgpID0+IHRoaXMub25WYWx1ZUNoYW5nZSgpKTtcblx0XHR0aGlzLm9uYmx1cih0aGlzLmlucHV0LCAoKSA9PiB0aGlzLm9uQmx1cigpKTtcblx0XHR0aGlzLm9uZm9jdXModGhpcy5pbnB1dCwgKCkgPT4gdGhpcy5vbkZvY3VzKCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pZ25vcmVHZXN0dXJlKHRoaXMuaW5wdXQpKTtcblxuXHRcdHNldFRpbWVvdXQoKCkgPT4gdGhpcy51cGRhdGVNaXJyb3IoKSwgMCk7XG5cblx0XHQvLyBTdXBwb3J0IGFjdGlvbnNcblx0XHRpZiAodGhpcy5vcHRpb25zLmFjdGlvbnMpIHtcblx0XHRcdHRoaXMuYWN0aW9uYmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbkJhcih0aGlzLmVsZW1lbnQsIHtcblx0XHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogdGhpcy5vcHRpb25zLmFjdGlvblZpZXdJdGVtUHJvdmlkZXJcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuYWN0aW9uYmFyLnB1c2godGhpcy5vcHRpb25zLmFjdGlvbnMsIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuYXBwbHlTdHlsZXMoKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRBY3Rpb25zKGFjdGlvbnM6IFJlYWRvbmx5QXJyYXk8SUFjdGlvbj4gfCB1bmRlZmluZWQsIGFjdGlvblZpZXdJdGVtUHJvdmlkZXI/OiBJQWN0aW9uVmlld0l0ZW1Qcm92aWRlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmFjdGlvbmJhcikge1xuXHRcdFx0dGhpcy5hY3Rpb25iYXIuY2xlYXIoKTtcblx0XHRcdGlmIChhY3Rpb25zKSB7XG5cdFx0XHRcdHRoaXMuYWN0aW9uYmFyLnB1c2goYWN0aW9ucywgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChhY3Rpb25zKSB7XG5cdFx0XHR0aGlzLmFjdGlvbmJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb25CYXIodGhpcy5lbGVtZW50LCB7XG5cdFx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IGFjdGlvblZpZXdJdGVtUHJvdmlkZXIgPz8gdGhpcy5vcHRpb25zLmFjdGlvblZpZXdJdGVtUHJvdmlkZXJcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuYWN0aW9uYmFyLnB1c2goYWN0aW9ucywgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldCBhY3Rpb25zV2lkdGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5hY3Rpb25iYXI/LmdldENvbnRhaW5lcigpLm9mZnNldFdpZHRoID8/IDA7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb25CbHVyKCk6IHZvaWQge1xuXHRcdHRoaXMuX2hpZGVNZXNzYWdlKCk7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5zaG93UGxhY2Vob2xkZXJPbkZvY3VzKSB7XG5cdFx0XHR0aGlzLmlucHV0LnNldEF0dHJpYnV0ZSgncGxhY2Vob2xkZXInLCAnJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG9uRm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2hvd01lc3NhZ2UoKTtcblx0XHRpZiAodGhpcy5vcHRpb25zLnNob3dQbGFjZWhvbGRlck9uRm9jdXMpIHtcblx0XHRcdHRoaXMuaW5wdXQuc2V0QXR0cmlidXRlKCdwbGFjZWhvbGRlcicsIHRoaXMucGxhY2Vob2xkZXIgfHwgJycpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzZXRQbGFjZUhvbGRlcihwbGFjZUhvbGRlcjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5wbGFjZWhvbGRlciA9IHBsYWNlSG9sZGVyO1xuXHRcdHRoaXMuaW5wdXQuc2V0QXR0cmlidXRlKCdwbGFjZWhvbGRlcicsIHBsYWNlSG9sZGVyKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRUb29sdGlwKHRvb2x0aXA6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMudG9vbHRpcCA9IHRvb2x0aXA7XG5cdFx0aWYgKCF0aGlzLmhvdmVyLnZhbHVlKSB7XG5cdFx0XHR0aGlzLmhvdmVyLnZhbHVlID0gdGhpcy5fcmVnaXN0ZXIoZ2V0QmFzZUxheWVySG92ZXJEZWxlZ2F0ZSgpLnNldHVwRGVsYXllZEhvdmVyQXRNb3VzZSh0aGlzLmlucHV0LCAoKSA9PiAoe1xuXHRcdFx0XHRjb250ZW50OiB0aGlzLnRvb2x0aXAsXG5cdFx0XHRcdGFwcGVhcmFuY2U6IHtcblx0XHRcdFx0XHRjb21wYWN0OiB0cnVlLFxuXHRcdFx0XHR9XG5cdFx0XHR9KSkpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzZXRBcmlhTGFiZWwobGFiZWw6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuYXJpYUxhYmVsID0gbGFiZWw7XG5cblx0XHRpZiAobGFiZWwpIHtcblx0XHRcdHRoaXMuaW5wdXQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGhpcy5hcmlhTGFiZWwpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmlucHV0LnJlbW92ZUF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5hcmlhTGFiZWw7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG1pcnJvckVsZW1lbnQoKTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLm1pcnJvcjtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaW5wdXRFbGVtZW50KCk6IEhUTUxJbnB1dEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLmlucHV0O1xuXHR9XG5cblx0cHVibGljIGdldCB2YWx1ZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmlucHV0LnZhbHVlO1xuXHR9XG5cblx0cHVibGljIHNldCB2YWx1ZShuZXdWYWx1ZTogc3RyaW5nKSB7XG5cdFx0aWYgKHRoaXMuaW5wdXQudmFsdWUgIT09IG5ld1ZhbHVlKSB7XG5cdFx0XHR0aGlzLmlucHV0LnZhbHVlID0gbmV3VmFsdWU7XG5cdFx0XHR0aGlzLm9uVmFsdWVDaGFuZ2UoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHN0ZXAoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5pbnB1dC5zdGVwO1xuXHR9XG5cblx0cHVibGljIHNldCBzdGVwKG5ld1ZhbHVlOiBzdHJpbmcpIHtcblx0XHR0aGlzLmlucHV0LnN0ZXAgPSBuZXdWYWx1ZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHR5cGVvZiB0aGlzLmNhY2hlZEhlaWdodCA9PT0gJ251bWJlcicgPyB0aGlzLmNhY2hlZEhlaWdodCA6IGRvbS5nZXRUb3RhbEhlaWdodCh0aGlzLmVsZW1lbnQpO1xuXHR9XG5cblx0cHVibGljIGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuaW5wdXQuZm9jdXMoKTtcblx0fVxuXG5cdHB1YmxpYyBibHVyKCk6IHZvaWQge1xuXHRcdHRoaXMuaW5wdXQuYmx1cigpO1xuXHR9XG5cblx0cHVibGljIGhhc0ZvY3VzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBkb20uaXNBY3RpdmVFbGVtZW50KHRoaXMuaW5wdXQpO1xuXHR9XG5cblx0cHVibGljIHNlbGVjdChyYW5nZTogSVJhbmdlIHwgbnVsbCA9IG51bGwpOiB2b2lkIHtcblx0XHR0aGlzLmlucHV0LnNlbGVjdCgpO1xuXG5cdFx0aWYgKHJhbmdlKSB7XG5cdFx0XHR0aGlzLmlucHV0LnNldFNlbGVjdGlvblJhbmdlKHJhbmdlLnN0YXJ0LCByYW5nZS5lbmQpO1xuXHRcdFx0aWYgKHJhbmdlLmVuZCA9PT0gdGhpcy5pbnB1dC52YWx1ZS5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5pbnB1dC5zY3JvbGxMZWZ0ID0gdGhpcy5pbnB1dC5zY3JvbGxXaWR0aDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgaXNTZWxlY3Rpb25BdEVuZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5pbnB1dC5zZWxlY3Rpb25FbmQgPT09IHRoaXMuaW5wdXQudmFsdWUubGVuZ3RoICYmIHRoaXMuaW5wdXQuc2VsZWN0aW9uU3RhcnQgPT09IHRoaXMuaW5wdXQuc2VsZWN0aW9uRW5kO1xuXHR9XG5cblx0cHVibGljIGdldFNlbGVjdGlvbigpOiBJUmFuZ2UgfCBudWxsIHtcblx0XHRjb25zdCBzZWxlY3Rpb25TdGFydCA9IHRoaXMuaW5wdXQuc2VsZWN0aW9uU3RhcnQ7XG5cdFx0aWYgKHNlbGVjdGlvblN0YXJ0ID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3Qgc2VsZWN0aW9uRW5kID0gdGhpcy5pbnB1dC5zZWxlY3Rpb25FbmQgPz8gc2VsZWN0aW9uU3RhcnQ7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHN0YXJ0OiBzZWxlY3Rpb25TdGFydCxcblx0XHRcdGVuZDogc2VsZWN0aW9uRW5kLFxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgZW5hYmxlKCk6IHZvaWQge1xuXHRcdHRoaXMuaW5wdXQucmVtb3ZlQXR0cmlidXRlKCdkaXNhYmxlZCcpO1xuXHR9XG5cblx0cHVibGljIGRpc2FibGUoKTogdm9pZCB7XG5cdFx0dGhpcy5ibHVyKCk7XG5cdFx0dGhpcy5pbnB1dC5kaXNhYmxlZCA9IHRydWU7XG5cdFx0dGhpcy5faGlkZU1lc3NhZ2UoKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRFbmFibGVkKGVuYWJsZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoZW5hYmxlZCkge1xuXHRcdFx0dGhpcy5lbmFibGUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kaXNhYmxlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldCB3aWR0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiBkb20uZ2V0VG90YWxXaWR0aCh0aGlzLmlucHV0KTtcblx0fVxuXG5cdHB1YmxpYyBzZXQgd2lkdGgod2lkdGg6IG51bWJlcikge1xuXHRcdGlmICh0aGlzLm9wdGlvbnMuZmxleGlibGVIZWlnaHQgJiYgdGhpcy5vcHRpb25zLmZsZXhpYmxlV2lkdGgpIHtcblx0XHRcdC8vIHRleHRhcmVhIHdpdGggaG9yaXpvbnRhbCBzY3JvbGxpbmdcblx0XHRcdGxldCBob3Jpem9udGFsUGFkZGluZyA9IDA7XG5cdFx0XHRpZiAodGhpcy5taXJyb3IpIHtcblx0XHRcdFx0Y29uc3QgcGFkZGluZ0xlZnQgPSBwYXJzZUZsb2F0KHRoaXMubWlycm9yLnN0eWxlLnBhZGRpbmdMZWZ0IHx8ICcnKSB8fCAwO1xuXHRcdFx0XHRjb25zdCBwYWRkaW5nUmlnaHQgPSBwYXJzZUZsb2F0KHRoaXMubWlycm9yLnN0eWxlLnBhZGRpbmdSaWdodCB8fCAnJykgfHwgMDtcblx0XHRcdFx0aG9yaXpvbnRhbFBhZGRpbmcgPSBwYWRkaW5nTGVmdCArIHBhZGRpbmdSaWdodDtcblx0XHRcdH1cblx0XHRcdHRoaXMuaW5wdXQuc3R5bGUud2lkdGggPSAod2lkdGggLSBob3Jpem9udGFsUGFkZGluZykgKyAncHgnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmlucHV0LnN0eWxlLndpZHRoID0gd2lkdGggKyAncHgnO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLm1pcnJvcikge1xuXHRcdFx0dGhpcy5taXJyb3Iuc3R5bGUud2lkdGggPSB3aWR0aCArICdweCc7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNldCBwYWRkaW5nUmlnaHQocGFkZGluZ1JpZ2h0OiBudW1iZXIpIHtcblx0XHQvLyBTZXQgd2lkdGggdG8gYXZvaWQgaGludCB0ZXh0IG92ZXJsYXBwaW5nIGJ1dHRvbnNcblx0XHR0aGlzLmlucHV0LnN0eWxlLndpZHRoID0gYGNhbGMoMTAwJSAtICR7cGFkZGluZ1JpZ2h0fXB4KWA7XG5cblx0XHRpZiAodGhpcy5taXJyb3IpIHtcblx0XHRcdHRoaXMubWlycm9yLnN0eWxlLnBhZGRpbmdSaWdodCA9IHBhZGRpbmdSaWdodCArICdweCc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTY3JvbGxEaW1lbnNpb25zKCk6IHZvaWQge1xuXHRcdGlmICh0eXBlb2YgdGhpcy5jYWNoZWRDb250ZW50SGVpZ2h0ICE9PSAnbnVtYmVyJyB8fCB0eXBlb2YgdGhpcy5jYWNoZWRIZWlnaHQgIT09ICdudW1iZXInIHx8ICF0aGlzLnNjcm9sbGFibGVFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Nyb2xsSGVpZ2h0ID0gdGhpcy5jYWNoZWRDb250ZW50SGVpZ2h0O1xuXHRcdGNvbnN0IGhlaWdodCA9IHRoaXMuY2FjaGVkSGVpZ2h0O1xuXHRcdGNvbnN0IHNjcm9sbFRvcCA9IHRoaXMuaW5wdXQuc2Nyb2xsVG9wO1xuXG5cdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudC5zZXRTY3JvbGxEaW1lbnNpb25zKHsgc2Nyb2xsSGVpZ2h0LCBoZWlnaHQgfSk7XG5cdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudC5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbFRvcCB9KTtcblx0fVxuXG5cdHB1YmxpYyBzaG93TWVzc2FnZShtZXNzYWdlOiBJTWVzc2FnZSwgZm9yY2U/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuc3RhdGUgPT09ICdvcGVuJyAmJiBlcXVhbHModGhpcy5tZXNzYWdlLCBtZXNzYWdlKSkge1xuXHRcdFx0Ly8gQWxyZWFkeSBzaG93aW5nXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5tZXNzYWdlID0gbWVzc2FnZTtcblxuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdpZGxlJyk7XG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2luZm8nKTtcblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnd2FybmluZycpO1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdlcnJvcicpO1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKHRoaXMuY2xhc3NGb3JUeXBlKG1lc3NhZ2UudHlwZSkpO1xuXG5cdFx0Y29uc3Qgc3R5bGVzID0gdGhpcy5zdHlsZXNGb3JUeXBlKHRoaXMubWVzc2FnZS50eXBlKTtcblx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuYm9yZGVyID0gYDFweCBzb2xpZCAke2Nzc0pzLmFzQ3NzVmFsdWVXaXRoRGVmYXVsdChzdHlsZXMuYm9yZGVyLCAndHJhbnNwYXJlbnQnKX1gO1xuXG5cdFx0aWYgKHRoaXMubWVzc2FnZS5jb250ZW50ICYmICh0aGlzLmhhc0ZvY3VzKCkgfHwgZm9yY2UpKSB7XG5cdFx0XHR0aGlzLl9zaG93TWVzc2FnZSgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBoaWRlTWVzc2FnZSgpOiB2b2lkIHtcblx0XHR0aGlzLm1lc3NhZ2UgPSBudWxsO1xuXG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2luZm8nKTtcblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnd2FybmluZycpO1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdlcnJvcicpO1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdpZGxlJyk7XG5cblx0XHR0aGlzLl9oaWRlTWVzc2FnZSgpO1xuXHRcdHRoaXMuYXBwbHlTdHlsZXMoKTtcblx0fVxuXG5cdHB1YmxpYyBpc0lucHV0VmFsaWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy52YWxpZGF0aW9uICYmICF0aGlzLnZhbGlkYXRpb24odGhpcy52YWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGUoKTogTWVzc2FnZVR5cGUgfCB1bmRlZmluZWQge1xuXHRcdGxldCBlcnJvck1zZzogSU1lc3NhZ2UgfCBudWxsID0gbnVsbDtcblxuXHRcdGlmICh0aGlzLnZhbGlkYXRpb24pIHtcblx0XHRcdGVycm9yTXNnID0gdGhpcy52YWxpZGF0aW9uKHRoaXMudmFsdWUpO1xuXG5cdFx0XHRpZiAoZXJyb3JNc2cpIHtcblx0XHRcdFx0dGhpcy5pbnB1dEVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWludmFsaWQnLCAndHJ1ZScpO1xuXHRcdFx0XHR0aGlzLnNob3dNZXNzYWdlKGVycm9yTXNnKTtcblx0XHRcdH1cblx0XHRcdGVsc2UgaWYgKHRoaXMuaW5wdXRFbGVtZW50Lmhhc0F0dHJpYnV0ZSgnYXJpYS1pbnZhbGlkJykpIHtcblx0XHRcdFx0dGhpcy5pbnB1dEVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKCdhcmlhLWludmFsaWQnKTtcblx0XHRcdFx0dGhpcy5oaWRlTWVzc2FnZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBlcnJvck1zZz8udHlwZTtcblx0fVxuXG5cdHB1YmxpYyBzdHlsZXNGb3JUeXBlKHR5cGU6IE1lc3NhZ2VUeXBlIHwgdW5kZWZpbmVkKTogeyBib3JkZXI6IHN0cmluZyB8IHVuZGVmaW5lZDsgYmFja2dyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkOyBmb3JlZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQgfSB7XG5cdFx0Y29uc3Qgc3R5bGVzID0gdGhpcy5vcHRpb25zLmlucHV0Qm94U3R5bGVzO1xuXHRcdHN3aXRjaCAodHlwZSkge1xuXHRcdFx0Y2FzZSBNZXNzYWdlVHlwZS5JTkZPOiByZXR1cm4geyBib3JkZXI6IHN0eWxlcy5pbnB1dFZhbGlkYXRpb25JbmZvQm9yZGVyLCBiYWNrZ3JvdW5kOiBzdHlsZXMuaW5wdXRWYWxpZGF0aW9uSW5mb0JhY2tncm91bmQsIGZvcmVncm91bmQ6IHN0eWxlcy5pbnB1dFZhbGlkYXRpb25JbmZvRm9yZWdyb3VuZCB9O1xuXHRcdFx0Y2FzZSBNZXNzYWdlVHlwZS5XQVJOSU5HOiByZXR1cm4geyBib3JkZXI6IHN0eWxlcy5pbnB1dFZhbGlkYXRpb25XYXJuaW5nQm9yZGVyLCBiYWNrZ3JvdW5kOiBzdHlsZXMuaW5wdXRWYWxpZGF0aW9uV2FybmluZ0JhY2tncm91bmQsIGZvcmVncm91bmQ6IHN0eWxlcy5pbnB1dFZhbGlkYXRpb25XYXJuaW5nRm9yZWdyb3VuZCB9O1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuIHsgYm9yZGVyOiBzdHlsZXMuaW5wdXRWYWxpZGF0aW9uRXJyb3JCb3JkZXIsIGJhY2tncm91bmQ6IHN0eWxlcy5pbnB1dFZhbGlkYXRpb25FcnJvckJhY2tncm91bmQsIGZvcmVncm91bmQ6IHN0eWxlcy5pbnB1dFZhbGlkYXRpb25FcnJvckZvcmVncm91bmQgfTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNsYXNzRm9yVHlwZSh0eXBlOiBNZXNzYWdlVHlwZSB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0c3dpdGNoICh0eXBlKSB7XG5cdFx0XHRjYXNlIE1lc3NhZ2VUeXBlLklORk86IHJldHVybiAnaW5mbyc7XG5cdFx0XHRjYXNlIE1lc3NhZ2VUeXBlLldBUk5JTkc6IHJldHVybiAnd2FybmluZyc7XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gJ2Vycm9yJztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zaG93TWVzc2FnZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY29udGV4dFZpZXdQcm92aWRlciB8fCAhdGhpcy5tZXNzYWdlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGRpdjogSFRNTEVsZW1lbnQ7XG5cdFx0Y29uc3QgbGF5b3V0ID0gKCkgPT4gZGl2LnN0eWxlLndpZHRoID0gZG9tLmdldFRvdGFsV2lkdGgodGhpcy5lbGVtZW50KSArICdweCc7XG5cblx0XHR0aGlzLmNvbnRleHRWaWV3UHJvdmlkZXIuc2hvd0NvbnRleHRWaWV3KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gdGhpcy5lbGVtZW50LFxuXHRcdFx0YW5jaG9yQWxpZ25tZW50OiBBbmNob3JBbGlnbm1lbnQuUklHSFQsXG5cdFx0XHRyZW5kZXI6IChjb250YWluZXI6IEhUTUxFbGVtZW50KSA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5tZXNzYWdlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRkaXYgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLm1vbmFjby1pbnB1dGJveC1jb250YWluZXInKSk7XG5cdFx0XHRcdGxheW91dCgpO1xuXG5cblx0XHRcdFx0Y29uc3Qgc3BhbkVsZW1lbnQgPSAkKCdzcGFuLm1vbmFjby1pbnB1dGJveC1tZXNzYWdlJyk7XG5cdFx0XHRcdGlmICh0aGlzLm1lc3NhZ2UuZm9ybWF0Q29udGVudCkge1xuXHRcdFx0XHRcdHJlbmRlckZvcm1hdHRlZFRleHQodGhpcy5tZXNzYWdlLmNvbnRlbnQhLCB1bmRlZmluZWQsIHNwYW5FbGVtZW50KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZW5kZXJUZXh0KHRoaXMubWVzc2FnZS5jb250ZW50ISwgdW5kZWZpbmVkLCBzcGFuRWxlbWVudCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzcGFuRWxlbWVudC5jbGFzc0xpc3QuYWRkKHRoaXMuY2xhc3NGb3JUeXBlKHRoaXMubWVzc2FnZS50eXBlKSk7XG5cblx0XHRcdFx0Y29uc3Qgc3R5bGVzID0gdGhpcy5zdHlsZXNGb3JUeXBlKHRoaXMubWVzc2FnZS50eXBlKTtcblx0XHRcdFx0c3BhbkVsZW1lbnQuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gc3R5bGVzLmJhY2tncm91bmQgPz8gJyc7XG5cdFx0XHRcdHNwYW5FbGVtZW50LnN0eWxlLmNvbG9yID0gc3R5bGVzLmZvcmVncm91bmQgPz8gJyc7XG5cdFx0XHRcdHNwYW5FbGVtZW50LnN0eWxlLmJvcmRlciA9IHN0eWxlcy5ib3JkZXIgPyBgMXB4IHNvbGlkICR7c3R5bGVzLmJvcmRlcn1gIDogJyc7XG5cblx0XHRcdFx0ZG9tLmFwcGVuZChkaXYsIHNwYW5FbGVtZW50KTtcblxuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH0sXG5cdFx0XHRvbkhpZGU6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5zdGF0ZSA9ICdjbG9zZWQnO1xuXHRcdFx0XHR0aGlzLm1lc3NhZ2VSZXNpemVPYnNlcnZlci5jbGVhcigpO1xuXHRcdFx0fSxcblx0XHRcdGxheW91dDogbGF5b3V0XG5cdFx0fSk7XG5cblx0XHR0aGlzLm9ic2VydmVFbGVtZW50UmVzaXplKCk7XG5cblx0XHQvLyBBUklBIFN1cHBvcnRcblx0XHRsZXQgYWxlcnRUZXh0OiBzdHJpbmc7XG5cdFx0aWYgKHRoaXMubWVzc2FnZS50eXBlID09PSBNZXNzYWdlVHlwZS5FUlJPUikge1xuXHRcdFx0YWxlcnRUZXh0ID0gbmxzLmxvY2FsaXplKCdhbGVydEVycm9yTWVzc2FnZScsIFwiRXJyb3I6IHswfVwiLCB0aGlzLm1lc3NhZ2UuY29udGVudCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLm1lc3NhZ2UudHlwZSA9PT0gTWVzc2FnZVR5cGUuV0FSTklORykge1xuXHRcdFx0YWxlcnRUZXh0ID0gbmxzLmxvY2FsaXplKCdhbGVydFdhcm5pbmdNZXNzYWdlJywgXCJXYXJuaW5nOiB7MH1cIiwgdGhpcy5tZXNzYWdlLmNvbnRlbnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhbGVydFRleHQgPSBubHMubG9jYWxpemUoJ2FsZXJ0SW5mb01lc3NhZ2UnLCBcIkluZm86IHswfVwiLCB0aGlzLm1lc3NhZ2UuY29udGVudCk7XG5cdFx0fVxuXG5cdFx0YXJpYS5hbGVydChhbGVydFRleHQpO1xuXG5cdFx0dGhpcy5zdGF0ZSA9ICdvcGVuJztcblx0fVxuXG5cdHByaXZhdGUgX2hpZGVNZXNzYWdlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jb250ZXh0Vmlld1Byb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc3RhdGUgPT09ICdvcGVuJykge1xuXHRcdFx0dGhpcy5jb250ZXh0Vmlld1Byb3ZpZGVyLmhpZGVDb250ZXh0VmlldygpO1xuXHRcdH1cblxuXHRcdHRoaXMubWVzc2FnZVJlc2l6ZU9ic2VydmVyLmNsZWFyKCk7XG5cdFx0dGhpcy5zdGF0ZSA9ICdpZGxlJztcblx0fVxuXG5cdC8qKlxuXHQgKiBLZWVwcyB0aGUgdmFsaWRhdGlvbiBtZXNzYWdlIHNpemVkIGFuZCBhbmNob3JlZCB0byB0aGUgaW5wdXQgd2hpbGUgdGhlXG5cdCAqIG1lc3NhZ2UgaXMgc2hvd2luZyBhbmQgdGhlIGlucHV0IGl0c2VsZiBpcyByZXNpemVkLCBlLmcuIGJlY2F1c2UgdGhlXG5cdCAqIGNvbnRhaW5pbmcgdmlldyB3YXMgcmVzaXplZC5cblx0ICovXG5cdHByaXZhdGUgb2JzZXJ2ZUVsZW1lbnRSZXNpemUoKTogdm9pZCB7XG5cdFx0Y29uc3Qgb2JzZXJ2ZXIgPSBuZXcgZG9tLkRpc3Bvc2FibGVSZXNpemVPYnNlcnZlcignSW5wdXRCb3gudmFsaWRhdGlvbk1lc3NhZ2UnLCAoKSA9PiB7XG5cdFx0XHQvLyBJZ25vcmUgbm90aWZpY2F0aW9ucyBmb3IgYSBoaWRkZW4gb3IgZGV0YWNoZWQgaW5wdXQsIGxheWluZyBvdXRcblx0XHRcdC8vIGFnYWluc3QgYSBkZWdlbmVyYXRlIGFuY2hvciB3b3VsZCBtb3ZlIHRoZSBtZXNzYWdlIHRvIHRoZSBjb3JuZXIuXG5cdFx0XHRpZiAodGhpcy5lbGVtZW50LmlzQ29ubmVjdGVkICYmIGRvbS5nZXRUb3RhbFdpZHRoKHRoaXMuZWxlbWVudCkgPiAwKSB7XG5cdFx0XHRcdHRoaXMubGF5b3V0TWVzc2FnZSgpO1xuXHRcdFx0fVxuXHRcdH0sIGRvbS5nZXRXaW5kb3codGhpcy5lbGVtZW50KSk7XG5cdFx0b2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLmVsZW1lbnQpO1xuXHRcdHRoaXMubWVzc2FnZVJlc2l6ZU9ic2VydmVyLnZhbHVlID0gb2JzZXJ2ZXI7XG5cdH1cblxuXHRwcml2YXRlIGxheW91dE1lc3NhZ2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuc3RhdGUgPT09ICdvcGVuJyAmJiB0aGlzLmNvbnRleHRWaWV3UHJvdmlkZXIpIHtcblx0XHRcdHRoaXMuY29udGV4dFZpZXdQcm92aWRlci5sYXlvdXQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uVmFsdWVDaGFuZ2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh0aGlzLnZhbHVlKTtcblxuXHRcdHRoaXMudmFsaWRhdGUoKTtcblx0XHR0aGlzLnVwZGF0ZU1pcnJvcigpO1xuXHRcdHRoaXMuaW5wdXQuY2xhc3NMaXN0LnRvZ2dsZSgnZW1wdHknLCAhdGhpcy52YWx1ZSk7XG5cblx0XHRpZiAodGhpcy5zdGF0ZSA9PT0gJ29wZW4nICYmIHRoaXMuY29udGV4dFZpZXdQcm92aWRlcikge1xuXHRcdFx0dGhpcy5jb250ZXh0Vmlld1Byb3ZpZGVyLmxheW91dCgpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLm9wdGlvbnMuaGlkZUhvdmVyT25WYWx1ZUNoYW5nZSkge1xuXHRcdFx0Z2V0QmFzZUxheWVySG92ZXJEZWxlZ2F0ZSgpLmhpZGVIb3ZlcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTWlycm9yKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5taXJyb3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMudmFsdWU7XG5cdFx0Y29uc3QgbGFzdENoYXJDb2RlID0gdmFsdWUuY2hhckNvZGVBdCh2YWx1ZS5sZW5ndGggLSAxKTtcblx0XHRjb25zdCBzdWZmaXggPSBsYXN0Q2hhckNvZGUgPT09IDEwID8gJyAnIDogJyc7XG5cdFx0Y29uc3QgbWlycm9yVGV4dENvbnRlbnQgPSAodmFsdWUgKyBzdWZmaXgpXG5cdFx0XHQucmVwbGFjZSgvXFx1MDAwYy9nLCAnJyk7IC8vIERvbid0IG1lYXN1cmUgd2l0aCB0aGUgZm9ybSBmZWVkIGNoYXJhY3Rlciwgd2hpY2ggbWVzc2VzIHVwIHNpemluZ1xuXG5cdFx0aWYgKG1pcnJvclRleHRDb250ZW50KSB7XG5cdFx0XHR0aGlzLm1pcnJvci50ZXh0Q29udGVudCA9IHZhbHVlICsgc3VmZml4O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm1pcnJvci5pbm5lclRleHQgPSAnXFx1MDBhMCc7XG5cdFx0fVxuXG5cdFx0dGhpcy5sYXlvdXQoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhcHBseVN0eWxlcygpOiB2b2lkIHtcblx0XHRjb25zdCBzdHlsZXMgPSB0aGlzLm9wdGlvbnMuaW5wdXRCb3hTdHlsZXM7XG5cblx0XHRjb25zdCBiYWNrZ3JvdW5kID0gc3R5bGVzLmlucHV0QmFja2dyb3VuZCA/PyAnJztcblx0XHRjb25zdCBmb3JlZ3JvdW5kID0gc3R5bGVzLmlucHV0Rm9yZWdyb3VuZCA/PyAnJztcblx0XHRjb25zdCBib3JkZXIgPSBzdHlsZXMuaW5wdXRCb3JkZXIgPz8gJyc7XG5cblx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gYmFja2dyb3VuZDtcblx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuY29sb3IgPSBmb3JlZ3JvdW5kO1xuXHRcdHRoaXMuaW5wdXQuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gJ2luaGVyaXQnO1xuXHRcdHRoaXMuaW5wdXQuc3R5bGUuY29sb3IgPSBmb3JlZ3JvdW5kO1xuXG5cdFx0Ly8gdGhlcmUncyBhbHdheXMgYSBib3JkZXIsIGV2ZW4gaWYgdGhlIGNvbG9yIGlzIG5vdCBzZXQuXG5cdFx0dGhpcy5lbGVtZW50LnN0eWxlLmJvcmRlciA9IGAxcHggc29saWQgJHtjc3NKcy5hc0Nzc1ZhbHVlV2l0aERlZmF1bHQoYm9yZGVyLCAndHJhbnNwYXJlbnQnKX1gO1xuXHR9XG5cblx0cHVibGljIGxheW91dCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubWlycm9yKSB7XG5cdFx0XHR0aGlzLmxheW91dE1lc3NhZ2UoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcmV2aW91c0hlaWdodCA9IHRoaXMuY2FjaGVkQ29udGVudEhlaWdodDtcblx0XHR0aGlzLmNhY2hlZENvbnRlbnRIZWlnaHQgPSBkb20uZ2V0VG90YWxIZWlnaHQodGhpcy5taXJyb3IpO1xuXG5cdFx0aWYgKHByZXZpb3VzSGVpZ2h0ICE9PSB0aGlzLmNhY2hlZENvbnRlbnRIZWlnaHQpIHtcblx0XHRcdHRoaXMuY2FjaGVkSGVpZ2h0ID0gTWF0aC5taW4odGhpcy5jYWNoZWRDb250ZW50SGVpZ2h0LCB0aGlzLm1heEhlaWdodCk7XG5cdFx0XHR0aGlzLmlucHV0LnN0eWxlLmhlaWdodCA9IHRoaXMuY2FjaGVkSGVpZ2h0ICsgJ3B4Jztcblx0XHRcdHRoaXMuX29uRGlkSGVpZ2h0Q2hhbmdlLmZpcmUodGhpcy5jYWNoZWRDb250ZW50SGVpZ2h0KTtcblx0XHR9XG5cblx0XHR0aGlzLmxheW91dE1lc3NhZ2UoKTtcblx0fVxuXG5cdHB1YmxpYyBpbnNlcnRBdEN1cnNvcih0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBpbnB1dEVsZW1lbnQgPSB0aGlzLmlucHV0RWxlbWVudDtcblx0XHRjb25zdCBzdGFydCA9IGlucHV0RWxlbWVudC5zZWxlY3Rpb25TdGFydDtcblx0XHRjb25zdCBlbmQgPSBpbnB1dEVsZW1lbnQuc2VsZWN0aW9uRW5kO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBpbnB1dEVsZW1lbnQudmFsdWU7XG5cblx0XHRpZiAoc3RhcnQgIT09IG51bGwgJiYgZW5kICE9PSBudWxsKSB7XG5cdFx0XHR0aGlzLnZhbHVlID0gY29udGVudC5zdWJzdHIoMCwgc3RhcnQpICsgdGV4dCArIGNvbnRlbnQuc3Vic3RyKGVuZCk7XG5cdFx0XHRpbnB1dEVsZW1lbnQuc2V0U2VsZWN0aW9uUmFuZ2Uoc3RhcnQgKyAxLCBzdGFydCArIDEpO1xuXHRcdFx0dGhpcy5sYXlvdXQoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9oaWRlTWVzc2FnZSgpO1xuXG5cdFx0dGhpcy5tZXNzYWdlID0gbnVsbDtcblxuXHRcdHRoaXMuYWN0aW9uYmFyPy5kaXNwb3NlKCk7XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJSGlzdG9yeUlucHV0T3B0aW9ucyBleHRlbmRzIElJbnB1dE9wdGlvbnMge1xuXHRyZWFkb25seSBzaG93SGlzdG9yeUhpbnQ/OiAoKSA9PiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgSGlzdG9yeUlucHV0Qm94IGV4dGVuZHMgSW5wdXRCb3ggaW1wbGVtZW50cyBJSGlzdG9yeU5hdmlnYXRpb25XaWRnZXQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaGlzdG9yeTogSGlzdG9yeU5hdmlnYXRvcjxzdHJpbmc+O1xuXHRwcml2YXRlIG9ic2VydmVyOiBNdXRhdGlvbk9ic2VydmVyIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRm9jdXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRGb2N1cyA9IHRoaXMuX29uRGlkRm9jdXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRCbHVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQmx1ciA9IHRoaXMuX29uRGlkQmx1ci5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihjb250YWluZXI6IEhUTUxFbGVtZW50LCBjb250ZXh0Vmlld1Byb3ZpZGVyOiBJQ29udGV4dFZpZXdQcm92aWRlciB8IHVuZGVmaW5lZCwgb3B0aW9uczogSUhpc3RvcnlJbnB1dE9wdGlvbnMpIHtcblx0XHRjb25zdCBOTFNfUExBQ0VIT0xERVJfSElTVE9SWV9ISU5UX1NVRkZJWF9OT19QQVJFTlMgPSBubHMubG9jYWxpemUoe1xuXHRcdFx0a2V5OiAnaGlzdG9yeS5pbnB1dGJveC5oaW50LnN1ZmZpeC5ub3BhcmVucycsXG5cdFx0XHRjb21tZW50OiBbJ1RleHQgaXMgdGhlIHN1ZmZpeCBvZiBhbiBpbnB1dCBmaWVsZCBwbGFjZWhvbGRlciBjb21pbmcgYWZ0ZXIgdGhlIGFjdGlvbiB0aGUgaW5wdXQgZmllbGQgcGVyZm9ybXMsIHRoaXMgd2lsbCBiZSB1c2VkIHdoZW4gdGhlIGlucHV0IGZpZWxkIGVuZHMgaW4gYSBjbG9zaW5nIHBhcmVudGhlc2lzIFwiKVwiLCBmb3IgZXhhbXBsZSBcIkZpbHRlciAoZS5nLiB0ZXh0LCAhZXhjbHVkZSlcIi4gVGhlIGNoYXJhY3RlciBpbnNlcnRlZCBpbnRvIHRoZSBmaW5hbCBzdHJpbmcgaXMgXFx1MjFDNSB0byByZXByZXNlbnQgdGhlIHVwIGFuZCBkb3duIGFycm93IGtleXMuJ11cblx0XHR9LCAnIG9yIHswfSBmb3IgaGlzdG9yeScsIGBcXHUyMUM1YCk7XG5cdFx0Y29uc3QgTkxTX1BMQUNFSE9MREVSX0hJU1RPUllfSElOVF9TVUZGSVhfSU5fUEFSRU5TID0gbmxzLmxvY2FsaXplKHtcblx0XHRcdGtleTogJ2hpc3RvcnkuaW5wdXRib3guaGludC5zdWZmaXguaW5wYXJlbnMnLFxuXHRcdFx0Y29tbWVudDogWydUZXh0IGlzIHRoZSBzdWZmaXggb2YgYW4gaW5wdXQgZmllbGQgcGxhY2Vob2xkZXIgY29taW5nIGFmdGVyIHRoZSBhY3Rpb24gdGhlIGlucHV0IGZpZWxkIHBlcmZvcm1zLCB0aGlzIHdpbGwgYmUgdXNlZCB3aGVuIHRoZSBpbnB1dCBmaWVsZCBkb2VzIE5PVCBlbmQgaW4gYSBjbG9zaW5nIHBhcmVudGhlc2lzIChlZy4gXCJGaW5kXCIpLiBUaGUgY2hhcmFjdGVyIGluc2VydGVkIGludG8gdGhlIGZpbmFsIHN0cmluZyBpcyBcXHUyMUM1IHRvIHJlcHJlc2VudCB0aGUgdXAgYW5kIGRvd24gYXJyb3cga2V5cy4nXVxuXHRcdH0sICcgKHswfSBmb3IgaGlzdG9yeSknLCBgXFx1MjFDNWApO1xuXG5cdFx0c3VwZXIoY29udGFpbmVyLCBjb250ZXh0Vmlld1Byb3ZpZGVyLCBvcHRpb25zKTtcblx0XHR0aGlzLmhpc3RvcnkgPSB0aGlzLl9yZWdpc3RlcihuZXcgSGlzdG9yeU5hdmlnYXRvcjxzdHJpbmc+KG9wdGlvbnMuaGlzdG9yeSwgMTAwKSk7XG5cblx0XHQvLyBGdW5jdGlvbiB0byBhcHBlbmQgdGhlIGhpc3Rvcnkgc3VmZml4IHRvIHRoZSBwbGFjZWhvbGRlciBpZiBuZWNlc3Nhcnlcblx0XHRjb25zdCBhZGRTdWZmaXggPSAoKSA9PiB7XG5cdFx0XHRpZiAob3B0aW9ucy5zaG93SGlzdG9yeUhpbnQgJiYgb3B0aW9ucy5zaG93SGlzdG9yeUhpbnQoKSAmJiAhdGhpcy5wbGFjZWhvbGRlci5lbmRzV2l0aChOTFNfUExBQ0VIT0xERVJfSElTVE9SWV9ISU5UX1NVRkZJWF9OT19QQVJFTlMpICYmICF0aGlzLnBsYWNlaG9sZGVyLmVuZHNXaXRoKE5MU19QTEFDRUhPTERFUl9ISVNUT1JZX0hJTlRfU1VGRklYX0lOX1BBUkVOUykgJiYgdGhpcy5oaXN0b3J5LmdldEhpc3RvcnkoKS5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc3Qgc3VmZml4ID0gdGhpcy5wbGFjZWhvbGRlci5lbmRzV2l0aCgnKScpID8gTkxTX1BMQUNFSE9MREVSX0hJU1RPUllfSElOVF9TVUZGSVhfTk9fUEFSRU5TIDogTkxTX1BMQUNFSE9MREVSX0hJU1RPUllfSElOVF9TVUZGSVhfSU5fUEFSRU5TO1xuXHRcdFx0XHRjb25zdCBzdWZmaXhlZFBsYWNlaG9sZGVyID0gdGhpcy5wbGFjZWhvbGRlciArIHN1ZmZpeDtcblx0XHRcdFx0aWYgKG9wdGlvbnMuc2hvd1BsYWNlaG9sZGVyT25Gb2N1cyAmJiAhZG9tLmlzQWN0aXZlRWxlbWVudCh0aGlzLmlucHV0KSkge1xuXHRcdFx0XHRcdHRoaXMucGxhY2Vob2xkZXIgPSBzdWZmaXhlZFBsYWNlaG9sZGVyO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuc2V0UGxhY2VIb2xkZXIoc3VmZml4ZWRQbGFjZWhvbGRlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gU3BvdCB0aGUgY2hhbmdlIHRvIHRoZSB0ZXh0YXJlYSBjbGFzcyBhdHRyaWJ1dGUgd2hpY2ggb2NjdXJzIHdoZW4gaXQgY2hhbmdlcyBiZXR3ZWVuIG5vbi1lbXB0eSBhbmQgZW1wdHksXG5cdFx0Ly8gYW5kIGFkZCB0aGUgaGlzdG9yeSBzdWZmaXggdG8gdGhlIHBsYWNlaG9sZGVyIGlmIG5vdCB5ZXQgcHJlc2VudFxuXHRcdHRoaXMub2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigobXV0YXRpb25MaXN0OiBNdXRhdGlvblJlY29yZFtdLCBvYnNlcnZlcjogTXV0YXRpb25PYnNlcnZlcikgPT4ge1xuXHRcdFx0bXV0YXRpb25MaXN0LmZvckVhY2goKG11dGF0aW9uOiBNdXRhdGlvblJlY29yZCkgPT4ge1xuXHRcdFx0XHRpZiAoIW11dGF0aW9uLnRhcmdldC50ZXh0Q29udGVudCkge1xuXHRcdFx0XHRcdGFkZFN1ZmZpeCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHR0aGlzLm9ic2VydmVyLm9ic2VydmUodGhpcy5pbnB1dCwgeyBhdHRyaWJ1dGVGaWx0ZXI6IFsnY2xhc3MnXSB9KTtcblxuXHRcdHRoaXMub25mb2N1cyh0aGlzLmlucHV0LCAoKSA9PiBhZGRTdWZmaXgoKSk7XG5cdFx0dGhpcy5vbmJsdXIodGhpcy5pbnB1dCwgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzZXRQbGFjZWhvbGRlciA9IChoaXN0b3J5SGludDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5wbGFjZWhvbGRlci5lbmRzV2l0aChoaXN0b3J5SGludCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgcmV2ZXJ0ZWRQbGFjZWhvbGRlciA9IHRoaXMucGxhY2Vob2xkZXIuc2xpY2UoMCwgdGhpcy5wbGFjZWhvbGRlci5sZW5ndGggLSBoaXN0b3J5SGludC5sZW5ndGgpO1xuXHRcdFx0XHRcdGlmIChvcHRpb25zLnNob3dQbGFjZWhvbGRlck9uRm9jdXMpIHtcblx0XHRcdFx0XHRcdHRoaXMucGxhY2Vob2xkZXIgPSByZXZlcnRlZFBsYWNlaG9sZGVyO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuc2V0UGxhY2VIb2xkZXIocmV2ZXJ0ZWRQbGFjZWhvbGRlcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0aWYgKCFyZXNldFBsYWNlaG9sZGVyKE5MU19QTEFDRUhPTERFUl9ISVNUT1JZX0hJTlRfU1VGRklYX0lOX1BBUkVOUykpIHtcblx0XHRcdFx0cmVzZXRQbGFjZWhvbGRlcihOTFNfUExBQ0VIT0xERVJfSElTVE9SWV9ISU5UX1NVRkZJWF9OT19QQVJFTlMpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0aWYgKHRoaXMub2JzZXJ2ZXIpIHtcblx0XHRcdHRoaXMub2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuXHRcdFx0dGhpcy5vYnNlcnZlciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYWRkVG9IaXN0b3J5KGFsd2F5cz86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy52YWx1ZSAmJiAoYWx3YXlzIHx8IHRoaXMudmFsdWUgIT09IHRoaXMuZ2V0Q3VycmVudFZhbHVlKCkpKSB7XG5cdFx0XHR0aGlzLmhpc3RvcnkuYWRkKHRoaXMudmFsdWUpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBwcmVwZW5kSGlzdG9yeShyZXN0b3JlZEhpc3Rvcnk6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0Y29uc3QgbmV3SGlzdG9yeSA9IHRoaXMuZ2V0SGlzdG9yeSgpO1xuXHRcdHRoaXMuY2xlYXJIaXN0b3J5KCk7XG5cblx0XHRyZXN0b3JlZEhpc3RvcnkuZm9yRWFjaCgoaXRlbSkgPT4ge1xuXHRcdFx0dGhpcy5oaXN0b3J5LmFkZChpdGVtKTtcblx0XHR9KTtcblxuXHRcdG5ld0hpc3RvcnkuZm9yRWFjaChpdGVtID0+IHtcblx0XHRcdHRoaXMuaGlzdG9yeS5hZGQoaXRlbSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0SGlzdG9yeSgpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuaGlzdG9yeS5nZXRIaXN0b3J5KCk7XG5cdH1cblxuXHRwdWJsaWMgaXNBdEZpcnN0SW5IaXN0b3J5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmhpc3RvcnkuaXNGaXJzdCgpO1xuXHR9XG5cblx0cHVibGljIGlzQXRMYXN0SW5IaXN0b3J5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmhpc3RvcnkuaXNMYXN0KCk7XG5cdH1cblxuXHRwdWJsaWMgaXNOb3doZXJlSW5IaXN0b3J5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmhpc3RvcnkuaXNOb3doZXJlKCk7XG5cdH1cblxuXHRwdWJsaWMgc2hvd05leHRWYWx1ZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaGlzdG9yeS5oYXModGhpcy52YWx1ZSkpIHtcblx0XHRcdHRoaXMuYWRkVG9IaXN0b3J5KCk7XG5cdFx0fVxuXG5cdFx0bGV0IG5leHQgPSB0aGlzLmdldE5leHRWYWx1ZSgpO1xuXHRcdGlmIChuZXh0KSB7XG5cdFx0XHRuZXh0ID0gbmV4dCA9PT0gdGhpcy52YWx1ZSA/IHRoaXMuZ2V0TmV4dFZhbHVlKCkgOiBuZXh0O1xuXHRcdH1cblxuXHRcdHRoaXMudmFsdWUgPSBuZXh0ID8/ICcnO1xuXHRcdGFyaWEuc3RhdHVzKHRoaXMudmFsdWUgPyB0aGlzLnZhbHVlIDogbmxzLmxvY2FsaXplKCdjbGVhcmVkSW5wdXQnLCBcIkNsZWFyZWQgSW5wdXRcIikpO1xuXHR9XG5cblx0cHVibGljIHNob3dQcmV2aW91c1ZhbHVlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5oaXN0b3J5Lmhhcyh0aGlzLnZhbHVlKSkge1xuXHRcdFx0dGhpcy5hZGRUb0hpc3RvcnkoKTtcblx0XHR9XG5cblx0XHRsZXQgcHJldmlvdXMgPSB0aGlzLmdldFByZXZpb3VzVmFsdWUoKTtcblx0XHRpZiAocHJldmlvdXMpIHtcblx0XHRcdHByZXZpb3VzID0gcHJldmlvdXMgPT09IHRoaXMudmFsdWUgPyB0aGlzLmdldFByZXZpb3VzVmFsdWUoKSA6IHByZXZpb3VzO1xuXHRcdH1cblxuXHRcdGlmIChwcmV2aW91cykge1xuXHRcdFx0dGhpcy52YWx1ZSA9IHByZXZpb3VzO1xuXHRcdFx0YXJpYS5zdGF0dXModGhpcy52YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGNsZWFySGlzdG9yeSgpOiB2b2lkIHtcblx0XHR0aGlzLmhpc3RvcnkuY2xlYXIoKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBzZXRQbGFjZUhvbGRlcihwbGFjZUhvbGRlcjogc3RyaW5nKTogdm9pZCB7XG5cdFx0c3VwZXIuc2V0UGxhY2VIb2xkZXIocGxhY2VIb2xkZXIpO1xuXHRcdHRoaXMuc2V0VG9vbHRpcChwbGFjZUhvbGRlcik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgb25CbHVyKCk6IHZvaWQge1xuXHRcdHN1cGVyLm9uQmx1cigpO1xuXHRcdHRoaXMuX29uRGlkQmx1ci5maXJlKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgb25Gb2N1cygpOiB2b2lkIHtcblx0XHRzdXBlci5vbkZvY3VzKCk7XG5cdFx0dGhpcy5fb25EaWRGb2N1cy5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldEN1cnJlbnRWYWx1ZSgpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRsZXQgY3VycmVudFZhbHVlID0gdGhpcy5oaXN0b3J5LmN1cnJlbnQoKTtcblx0XHRpZiAoIWN1cnJlbnRWYWx1ZSkge1xuXHRcdFx0Y3VycmVudFZhbHVlID0gdGhpcy5oaXN0b3J5Lmxhc3QoKTtcblx0XHRcdHRoaXMuaGlzdG9yeS5uZXh0KCk7XG5cdFx0fVxuXHRcdHJldHVybiBjdXJyZW50VmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIGdldFByZXZpb3VzVmFsdWUoKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuaGlzdG9yeS5wcmV2aW91cygpIHx8IHRoaXMuaGlzdG9yeS5maXJzdCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXROZXh0VmFsdWUoKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuaGlzdG9yeS5uZXh0KCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUNyQixZQUFZLFdBQVc7QUFDdkIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxxQkFBcUIsa0JBQWtCO0FBRWhELFNBQVMsaUJBQTBDO0FBQ25ELFlBQVksVUFBVTtBQUN0QixTQUFTLHVCQUE2QztBQUN0RCxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGNBQWM7QUFFdkIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyx3QkFBa0M7QUFDM0MsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsMkJBQTJCO0FBQ3BDLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsU0FBUyx5QkFBMkM7QUFHcEQsTUFBTSxJQUFJLElBQUk7QUFnRFAsSUFBVyxjQUFYLGtCQUFXQSxpQkFBWDtBQUNOLEVBQUFBLDBCQUFBLFVBQU8sS0FBUDtBQUNBLEVBQUFBLDBCQUFBLGFBQVUsS0FBVjtBQUNBLEVBQUFBLDBCQUFBLFdBQVEsS0FBUjtBQUhpQixTQUFBQTtBQUFBLEdBQUE7QUFXWCxNQUFNLHNCQUF1QztBQUFBLEVBQ25ELGlCQUFpQjtBQUFBLEVBQ2pCLGlCQUFpQjtBQUFBLEVBQ2pCLDJC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
