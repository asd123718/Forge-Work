import { localize } from "../../../../nls.js";
import * as arrays from "../../../common/arrays.js";
import { Emitter, Event } from "../../../common/event.js";
import { KeyCode, KeyCodeUtils } from "../../../common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../common/lifecycle.js";
import { isMacintosh } from "../../../common/platform.js";
import { ScrollbarVisibility } from "../../../common/scrollable.js";
import * as cssJs from "../../cssValue.js";
import * as dom from "../../dom.js";
import * as domStylesheetsJs from "../../domStylesheets.js";
import { DomEmitter } from "../../event.js";
import { StandardKeyboardEvent } from "../../keyboardEvent.js";
import { renderMarkdown } from "../../markdownRenderer.js";
import { AnchorPosition } from "../contextview/contextview.js";
import { getBaseLayerHoverDelegate } from "../hover/hoverDelegate2.js";
import { getDefaultHoverDelegate } from "../hover/hoverDelegateFactory.js";
import { List } from "../list/listWidget.js";
import "./selectBoxCustom.css";
const $ = dom.$;
const SELECT_OPTION_ENTRY_TEMPLATE_ID = "selectOption.entry.template";
class SelectListRenderer {
  get templateId() {
    return SELECT_OPTION_ENTRY_TEMPLATE_ID;
  }
  renderTemplate(container) {
    const data = /* @__PURE__ */ Object.create(null);
    data.root = container;
    data.text = dom.append(container, $(".option-text"));
    data.detail = dom.append(container, $(".option-detail"));
    data.decoratorRight = dom.append(container, $(".option-decorator-right"));
    return data;
  }
  renderElement(element, index, templateData) {
    const data = templateData;
    const text = element.text;
    const detail = element.detail;
    const decoratorRight = element.decoratorRight;
    const isDisabled = element.isDisabled;
    data.text.textContent = text;
    data.detail.textContent = !!detail ? detail : "";
    data.decoratorRight.textContent = !!decoratorRight ? decoratorRight : "";
    if (isDisabled) {
      data.root.classList.add("option-disabled");
    } else {
      data.root.classList.remove("option-disabled");
    }
    if (element.isSeparator) {
      data.root.classList.add("option-separator");
      data.root.classList.add("option-disabled");
    } else {
      data.root.classList.remove("option-separator");
    }
  }
  disposeTemplate(_templateData) {
  }
}
const _SelectBoxList = class _SelectBoxList extends Disposable {
  // for dev purposes only
  constructor(options, selected, contextViewProvider, styles, selectBoxOptions) {
    super();
    this.options = [];
    this._currentSelection = 0;
    this._hasDetails = false;
    this._selectionDetailsDisposables = this._register(new DisposableStore());
    this._skipLayout = false;
    this._sticky = false;
    this._isVisible = false;
    this.styles = styles;
    this.selectBoxOptions = selectBoxOptions || /* @__PURE__ */ Object.create(null);
    if (typeof this.selectBoxOptions.minBottomMargin !== "number") {
      this.selectBoxOptions.minBottomMargin = _SelectBoxList.DEFAULT_DROPDOWN_MINIMUM_BOTTOM_MARGIN;
    } else if (this.selectBoxOptions.minBottomMargin < 0) {
      this.selectBoxOptions.minBottomMargin = 0;
    }
    this.selectElement = document.createElement("select");
    this.selectElement.className = "monaco-select-box";
    if (typeof this.selectBoxOptions.ariaLabel === "string") {
      this.selectElement.setAttribute("aria-label", this.selectBoxOptions.ariaLabel);
    }
    if (typeof this.selectBoxOptions.ariaDescription === "string") {
      this.selectElement.setAttribute("aria-description", this.selectBoxOptions.ariaDescription);
    }
    this._onDidSelect = new Emitter();
    this._register(this._onDidSelect);
    this.registerListeners();
    this.constructSelectDropDown(contextViewProvider);
    this.selected = selected || 0;
    if (options) {
      this.setOptions(options, selected);
    }
    this.initStyleSheet();
  }
  setTitle(title) {
    if (!this._hover && title) {
      this._hover = this._register(getBaseLayerHoverDelegate().setupManagedHover(getDefaultHoverDelegate("mouse"), this.selectElement, title));
    } else if (this._hover) {
      this._hover.update(title);
    }
  }
  // IDelegate - List renderer
  getHeight() {
    return 22;
  }
  getTemplateId() {
    return SELECT_OPTION_ENTRY_TEMPLATE_ID;
  }
  constructSelectDropDown(contextViewProvider) {
    this.contextViewProvider = contextViewProvider;
    this.selectDropDownContainer = dom.$(".monaco-select-box-dropdown-container");
    this.selectionDetailsPane = dom.append(this.selectDropDownContainer, $(".select-box-details-pane"));
    const widthControlOuterDiv = dom.append(this.selectDropDownContainer, $(".select-box-dropdown-container-width-control"));
    const widthControlInnerDiv = dom.append(widthControlOuterDiv, $(".width-control-div"));
    this.widthControlElement = document.createElement("span");
    this.widthControlElement.className = "option-text-width-control";
    dom.append(widthControlInnerDiv, this.widthControlElement);
    this._dropDownPosition = AnchorPosition.BELOW;
    this.styleElement = domStylesheetsJs.createStyleSheet(this.selectDropDownContainer);
    this.selectDropDownContainer.setAttribute("draggable", "true");
    this._register(dom.addDisposableListener(this.selectDropDownContainer, dom.EventType.DRAG_START, (e) => {
      dom.EventHelper.stop(e, true);
    }));
  }
  registerListeners() {
    this._register(dom.addStandardDisposableListener(this.selectElement, "change", (e) => {
      this.selected = e.target.selectedIndex;
      this._onDidSelect.fire({
        index: e.target.selectedIndex,
        selected: e.target.value
      });
      if (!!this.options[this.selected] && !!this.options[this.selected].text) {
        this.setTitle(this.options[this.selected].text);
      }
    }));
    this._register(dom.addDisposableListener(this.selectElement, dom.EventType.CLICK, (e) => {
      dom.EventHelper.stop(e);
      if (this._isVisible) {
        this.hideSelectDropDown(true);
      } else {
        this.showSelectDropDown();
      }
    }));
    this._register(dom.addDisposableListener(this.selectElement, dom.EventType.MOUSE_DOWN, (e) => {
      dom.EventHelper.stop(e);
    }));
    let listIsVisibleOnTouchStart;
    this._register(dom.addDisposableListener(this.selectElement, "touchstart", (e) => {
      listIsVisibleOnTouchStart = this._isVisible;
    }));
    this._register(dom.addDisposableListener(this.selectElement, "touchend", (e) => {
      dom.EventHelper.stop(e);
      if (listIsVisibleOnTouchStart) {
        this.hideSelectDropDown(true);
      } else {
        this.showSelectDropDown();
      }
    }));
    this._register(dom.addDisposableListener(this.selectElement, dom.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      let showDropDown = false;
      if (isMacintosh) {
        if (event.keyCode === KeyCode.DownArrow || event.keyCode === KeyCode.UpArrow || event.keyCode === KeyCode.Space || event.keyCode === KeyCode.Enter) {
          showDropDown = true;
        }
      } else {
        if (event.keyCode === KeyCode.DownArrow && event.altKey || event.keyCode === KeyCode.UpArrow && event.altKey || event.keyCode === KeyCode.Space || event.keyCode === KeyCode.Enter) {
          showDropDown = true;
        }
      }
      if (showDropDown) {
        this.showSelectDropDown();
        dom.EventHelper.stop(e, true);
      }
    }));
  }
  get onDidSelect() {
    return this._onDidSelect.event;
  }
  setOptions(options, selected) {
    if (!arrays.equals(this.options, options)) {
      this.options = options;
      this.selectElement.options.length = 0;
      this._hasDetails = false;
      this._cachedMaxDetailsHeight = void 0;
      this.options.forEach((option, index) => {
        this.selectElement.add(this.createOption(option.text, index, option.isDisabled));
        if (typeof option.description === "string") {
          this._hasDetails = true;
        }
      });
    }
    if (selected !== void 0) {
      this.select(selected);
      this._currentSelection = this.selected;
    }
    if (this._isVisible) {
      this.setOptionsList();
      this.layoutSelectDropDown();
    }
  }
  setEnabled(enable) {
    this.selectElement.disabled = !enable;
  }
  setOptionsList() {
    this.selectList?.splice(0, this.selectList.length, this.options);
  }
  select(index) {
    if (index >= 0 && index < this.options.length) {
      this.selected = index;
    } else if (index > this.options.length - 1) {
      this.select(this.options.length - 1);
    } else if (this.selected < 0) {
      this.selected = 0;
    }
    this.selectElement.selectedIndex = this.selected;
    if (!!this.options[this.selected] && !!this.options[this.selected].text) {
      this.setTitle(this.options[this.selected].text);
    }
  }
  setAriaLabel(label) {
    this.selectBoxOptions.ariaLabel = label;
    this.selectElement.setAttribute("aria-label", this.selectBoxOptions.ariaLabel);
  }
  focus() {
    if (this.selectElement) {
      this.selectElement.tabIndex = 0;
      this.selectElement.focus();
    }
  }
  blur() {
    if (this.selectElement) {
      this.selectElement.tabIndex = -1;
      this.selectElement.blur();
    }
  }
  setFocusable(focusable) {
    this.selectElement.tabIndex = focusable ? 0 : -1;
  }
  render(container) {
    this.container = container;
    container.classList.add("select-container");
    container.appendChild(this.selectElement);
    this.styleSelectElement();
  }
  initStyleSheet() {
    const content = [];
    if (this.styles.listFocusBackground) {
      content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row.focused { background-color: ${this.styles.listFocusBackground} !important; }`);
    }
    if (this.styles.listFocusForeground) {
      content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row.focused { color: ${this.styles.listFocusForeground} !important; }`);
    }
    if (this.styles.decoratorRightForeground) {
      content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row:not(.focused) .option-decorator-right { color: ${this.styles.decoratorRightForeground}; }`);
    }
    if (this.styles.selectBackground && this.styles.selectBorder && this.styles.selectBorder !== this.styles.selectBackground) {
      content.push(`.monaco-select-box-dropdown-container { border: 1px solid ${this.styles.selectBorder} } `);
      content.push(`.monaco-select-box-dropdown-container > .select-box-details-pane.border-top { border-top: 1px solid ${this.styles.selectBorder} } `);
      content.push(`.monaco-select-box-dropdown-container > .select-box-details-pane.border-bottom { border-bottom: 1px solid ${this.styles.selectBorder} } `);
    } else if (this.styles.selectListBorder) {
      content.push(`.monaco-select-box-dropdown-container > .select-box-details-pane.border-top { border-top: 1px solid ${this.styles.selectListBorder} } `);
      content.push(`.monaco-select-box-dropdown-container > .select-box-details-pane.border-bottom { border-bottom: 1px solid ${this.styles.selectListBorder} } `);
    }
    if (this.styles.listHoverForeground) {
      content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row:not(.option-disabled):not(.focused):hover { color: ${this.styles.listHoverForeground} !important; }`);
    }
    if (this.styles.listHoverBackground) {
      content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row:not(.option-disabled):not(.focused):hover { background-color: ${this.styles.listHoverBackground} !important; }`);
    }
    if (this.styles.listFocusOutline) {
      content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row.focused { outline: 1px solid ${this.styles.listFocusOutline} !important; outline-offset: -1px !important; }`);
    }
    if (this.styles.listHoverOutline) {
      content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row:not(.option-disabled):not(.focused):hover { outline: 1px solid ${this.styles.listHoverOutline} !important; outline-offset: -1px !important; }`);
    }
    content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row.option-disabled.focused { background-color: transparent !important; color: inherit !important; outline: none !important; }`);
    content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row.option-disabled:hover { background-color: transparent !important; color: inherit !important; outline: none !important; }`);
    this.styleElement.textContent = content.join("\n");
  }
  styleSelectElement() {
    const background = this.styles.selectBackground ?? "";
    const foreground = this.styles.selectForeground ?? "";
    const border = this.styles.selectBorder ?? "";
    this.selectElement.style.backgroundColor = background;
    this.selectElement.style.color = foreground;
    this.selectElement.style.borderColor = border;
  }
  styleList() {
    const background = this.styles.selectBackground ?? "";
    const listBackground = cssJs.asCssValueWithDefault(this.styles.selectListBackground, background);
    this.selectDropDownContainer.style.backgroundColor = listBackground;
    this.selectDropDownListContainer.style.backgroundColor = listBackground;
    this.selectionDetailsPane.style.backgroundColor = listBackground;
    this.selectList.style(this.styles);
  }
  createOption(value, index, disabled) {
    const option = document.createElement("option");
    option.value = value;
    option.text = value;
    option.disabled = !!disabled;
    return option;
  }
  // ContextView dropdown methods
  showSelectDropDown() {
    this.selectionDetailsPane.textContent = "";
    if (!this.contextViewProvider || this._isVisible) {
      return;
    }
    this.createSelectList(this.selectDropDownContainer);
    this.setOptionsList();
    this.contextViewProvider.showContextView({
      getAnchor: () => this.selectElement,
      render: (container) => this.renderSelectDropDown(container, true),
      layout: () => {
        this.layoutSelectDropDown();
      },
      onHide: () => {
        this.selectDropDownContainer.classList.remove("visible");
      },
      anchorPosition: this._dropDownPosition
    }, this.selectBoxOptions.optionsAsChildren ? this.container : void 0);
    this._isVisible = true;
    this.hideSelectDropDown(false);
    this.contextViewProvider.showContextView({
      getAnchor: () => this.selectElement,
      render: (container) => this.renderSelectDropDown(container),
      layout: () => this.layoutSelectDropDown(),
      onHide: () => {
        this.selectDropDownContainer.classList.remove("visible");
      },
      anchorPosition: this._dropDownPosition
    }, this.selectBoxOptions.optionsAsChildren ? this.container : void 0);
    this._currentSelection = this.selected;
    this._isVisible = true;
    this.selectElement.setAttribute("aria-expanded", "true");
  }
  hideSelectDropDown(focusSelect) {
    if (!this.contextViewProvider || !this._isVisible) {
      return;
    }
    this._isVisible = false;
    this.selectElement.setAttribute("aria-expanded", "false");
    if (focusSelect) {
      this.selectElement.focus();
    }
    this.contextViewProvider.hideContextView();
  }
  renderSelectDropDown(container, preLayoutPosition) {
    container.appendChild(this.selectDropDownContainer);
    const computedFontSize = dom.getWindow(this.selectElement).getComputedStyle(this.selectElement).fontSize;
    if (computedFontSize) {
      this.selectDropDownContainer.style.fontSize = computedFontSize;
    }
    this.layoutSelectDropDown(preLayoutPosition);
    return {
      dispose: () => {
        this.selectDropDownContainer.remove();
      }
    };
  }
  // Iterate over detailed descriptions, find max height
  measureMaxDetailsHeight() {
    let maxDetailsPaneHeight = 0;
    this.options.forEach((_option, index) => {
      this.updateDetail(index);
      if (this.selectionDetailsPane.offsetHeight > maxDetailsPaneHeight) {
        maxDetailsPaneHeight = this.selectionDetailsPane.offsetHeight;
      }
    });
    return maxDetailsPaneHeight;
  }
  layoutSelectDropDown(preLayoutPosition) {
    if (this._skipLayout) {
      return false;
    }
    if (this.selectList) {
      this.selectDropDownContainer.classList.add("visible");
      const window = dom.getWindow(this.selectElement);
      const selectPosition = dom.getDomNodePagePosition(this.selectElement);
      const maxSelectDropDownHeightBelow = window.innerHeight - selectPosition.top - selectPosition.height - (this.selectBoxOptions.minBottomMargin || 0);
      const maxSelectDropDownHeightAbove = selectPosition.top - _SelectBoxList.DEFAULT_DROPDOWN_MINIMUM_TOP_MARGIN;
      const selectWidth = this.selectElement.offsetWidth;
      const selectMinWidth = this.setWidthControlElement(this.widthControlElement);
      const selectOptimalWidth = `${Math.max(selectMinWidth, Math.round(selectWidth))}px`;
      this.selectDropDownContainer.style.width = selectOptimalWidth;
      this.selectList.getHTMLElement().style.height = "";
      this.selectList.layout();
      let listHeight = this.selectList.contentHeight;
      if (this._hasDetails && this._cachedMaxDetailsHeight === void 0) {
        this._cachedMaxDetailsHeight = this.measureMaxDetailsHeight();
      }
      const maxDetailsPaneHeight = this._hasDetails ? this._cachedMaxDetailsHeight : 0;
      const minRequiredDropDownHeight = listHeight + maxDetailsPaneHeight;
      const maxVisibleOptionsBelow = Math.floor((maxSelectDropDownHeightBelow - maxDetailsPaneHeight) / this.getHeight());
      const maxVisibleOptionsAbove = Math.floor((maxSelectDropDownHeightAbove - maxDetailsPaneHeight) / this.getHeight());
      if (preLayoutPosition) {
        if (selectPosition.top + selectPosition.height > window.innerHeight - 22 || selectPosition.top < _SelectBoxList.DEFAULT_DROPDOWN_MINIMUM_TOP_MARGIN || maxVisibleOptionsBelow < 1 && maxVisibleOptionsAbove < 1) {
          return false;
        }
        if (maxVisibleOptionsBelow < _SelectBoxList.DEFAULT_MINIMUM_VISIBLE_OPTIONS && maxVisibleOptionsAbove > maxVisibleOptionsBelow && this.options.length > maxVisibleOptionsBelow) {
          this._dropDownPosition = AnchorPosition.ABOVE;
          this.selectDropDownListContainer.remove();
          this.selectionDetailsPane.remove();
          this.selectDropDownContainer.appendChild(this.selectionDetailsPane);
          this.selectDropDownContainer.appendChild(this.selectDropDownListContainer);
          this.selectionDetailsPane.classList.remove("border-top");
          this.selectionDetailsPane.classList.add("border-bottom");
        } else {
          this._dropDownPosition = AnchorPosition.BELOW;
          this.selectDropDownListContainer.remove();
          this.selectionDetailsPane.remove();
          this.selectDropDownContainer.appendChild(this.selectDropDownListContainer);
          this.selectDropDownContainer.appendChild(this.selectionDetailsPane);
          this.selectionDetailsPane.classList.remove("border-bottom");
          this.selectionDetailsPane.classList.add("border-top");
        }
        return true;
      }
      if (selectPosition.top + selectPosition.height > window.innerHeight - 22 || selectPosition.top < _SelectBoxList.DEFAULT_DROPDOWN_MINIMUM_TOP_MARGIN || this._dropDownPosition === AnchorPosition.BELOW && maxVisibleOptionsBelow < 1 || this._dropDownPosition === AnchorPosition.ABOVE && maxVisibleOptionsAbove < 1) {
        this.hideSelectDropDown(true);
        return false;
      }
      if (this._dropDownPosition === AnchorPosition.BELOW) {
        if (this._isVisible && maxVisibleOptionsBelow + maxVisibleOptionsAbove < 1) {
          this.hideSelectDropDown(true);
          return false;
        }
        if (minRequiredDropDownHeight > maxSelectDropDownHeightBelow) {
          listHeight = maxVisibleOptionsBelow * this.getHeight();
        }
      } else {
        if (minRequiredDropDownHeight > maxSelectDropDownHeightAbove) {
          listHeight = maxVisibleOptionsAbove * this.getHeight();
        }
      }
      this.selectList.layout(listHeight);
      this.selectList.domFocus();
      if (this.selectList.length > 0) {
        this.selectList.setFocus([this.selected || 0]);
        this.selectList.reveal(this.selectList.getFocus()[0] || 0);
      }
      if (this._hasDetails) {
        this.selectList.getHTMLElement().style.height = `${listHeight}px`;
        this.selectDropDownContainer.style.height = "";
      } else {
        this.selectDropDownContainer.style.height = `${listHeight}px`;
      }
      this.updateDetail(this.selected);
      this.selectDropDownContainer.style.width = selectOptimalWidth;
      this.selectDropDownListContainer.setAttribute("tabindex", "0");
      return true;
    } else {
      return false;
    }
  }
  setWidthControlElement(container) {
    let elementWidth = 0;
    if (container) {
      let longest = 0;
      let longestLength = 0;
      this.options.forEach((option, index) => {
        const detailLength = !!option.detail ? option.detail.length : 0;
        const rightDecoratorLength = !!option.decoratorRight ? option.decoratorRight.length : 0;
        const len = option.text.length + detailLength + rightDecoratorLength;
        if (len > longestLength) {
          longest = index;
          longestLength = len;
        }
      });
      container.textContent = this.options[longest].text + (!!this.options[longest].decoratorRight ? `${this.options[longest].decoratorRight} ` : "");
      elementWidth = dom.getTotalWidth(container);
    }
    return elementWidth;
  }
  createSelectList(parent) {
    if (this.selectList) {
      return;
    }
    this.selectDropDownListContainer = dom.append(parent, $(".select-box-dropdown-list-container"));
    this.listRenderer = new SelectListRenderer();
    this.selectList = this._register(new List("SelectBoxCustom", this.selectDropDownListContainer, this, [this.listRenderer], {
      useShadows: false,
      verticalScrollMode: ScrollbarVisibility.Visible,
      keyboardSupport: false,
      mouseSupport: false,
      accessibilityProvider: {
        getAriaLabel: (element) => {
          if (element.isSeparator) {
            return localize("selectBoxSeparator", "separator");
          }
          let label = element.text;
          if (element.detail) {
            label += `. ${element.detail}`;
          }
          if (element.decoratorRight) {
            label += `. ${element.decoratorRight}`;
          }
          if (element.description) {
            label += `. ${element.description}`;
          }
          return label;
        },
        getWidgetAriaLabel: () => localize({ key: "selectBox", comment: ["Behave like native select dropdown element."] }, "Select Box"),
        getRole: () => isMacintosh ? "" : "option",
        getWidgetRole: () => "listbox"
      }
    }));
    if (this.selectBoxOptions.ariaLabel) {
      this.selectList.ariaLabel = this.selectBoxOptions.ariaLabel;
    }
    const onKeyDown = this._register(new DomEmitter(this.selectDropDownListContainer, "keydown"));
    const onSelectDropDownKeyDown = Event.chain(
      onKeyDown.event,
      ($2) => $2.filter(() => this.selectList.length > 0).map((e) => new StandardKeyboardEvent(e))
    );
    this._register(Event.chain(onSelectDropDownKeyDown, ($2) => $2.filter((e) => e.keyCode === KeyCode.Enter))(this.onEnter, this));
    this._register(Event.chain(onSelectDropDownKeyDown, ($2) => $2.filter((e) => e.keyCode === KeyCode.Tab))(this.onEnter, this));
    this._register(Event.chain(onSelectDropDownKeyDown, ($2) => $2.filter((e) => e.keyCode === KeyCode.Escape))(this.onEscape, this));
    this._register(Event.chain(onSelectDropDownKeyDown, ($2) => $2.filter((e) => e.keyCode === KeyCode.UpArrow))(this.onUpArrow, this));
    this._register(Event.chain(onSelectDropDownKeyDown, ($2) => $2.filter((e) => e.keyCode === KeyCode.DownArrow))(this.onDownArrow, this));
    this._register(Event.chain(onSelectDropDownKeyDown, ($2) => $2.filter((e) => e.keyCode === KeyCode.PageDown))(this.onPageDown, this));
    this._register(Event.chain(onSelectDropDownKeyDown, ($2) => $2.filter((e) => e.keyCode === KeyCode.PageUp))(this.onPageUp, this));
    this._register(Event.chain(onSelectDropDownKeyDown, ($2) => $2.filter((e) => e.keyCode === KeyCode.Home))(this.onHome, this));
    this._register(Event.chain(onSelectDropDownKeyDown, ($2) => $2.filter((e) => e.keyCode === KeyCode.End))(this.onEnd, this));
    this._register(Event.chain(onSelectDropDownKeyDown, ($2) => $2.filter((e) => e.keyCode >= KeyCode.Digit0 && e.keyCode <= KeyCode.KeyZ || e.keyCode >= KeyCode.Semicolon && e.keyCode <= KeyCode.NumpadDivide))(this.onCharacter, this));
    this._register(dom.addDisposableListener(this.selectList.getHTMLElement(), dom.EventType.POINTER_UP, (e) => this.onPointerUp(e)));
    this._register(this.selectList.onMouseOver((e) => typeof e.index !== "undefined" && !this.options[e.index]?.isDisabled && this.selectList.setFocus([e.index])));
    this._register(this.selectList.onDidChangeFocus((e) => this.onListFocus(e)));
    this._register(dom.addDisposableListener(this.selectDropDownContainer, dom.EventType.FOCUS_OUT, (e) => {
      if (!this._isVisible || dom.isAncestor(e.relatedTarget, this.selectDropDownContainer)) {
        return;
      }
      this.onListBlur();
    }));
    this.selectList.getHTMLElement().setAttribute("aria-label", this.selectBoxOptions.ariaLabel || "");
    this.selectList.getHTMLElement().setAttribute("aria-expanded", "true");
    this.styleList();
  }
  // List methods
  // List mouse controller - active exit, select option, fire onDidSelect if change, return focus to parent select
  // Also takes in touchend events
  onPointerUp(e) {
    if (!this.selectList.length) {
      return;
    }
    dom.EventHelper.stop(e);
    const target = e.target;
    if (!target) {
      return;
    }
    if (target.classList.contains("slider")) {
      return;
    }
    const listRowElement = target.closest(".monaco-list-row");
    if (!listRowElement) {
      return;
    }
    const index = Number(listRowElement.getAttribute("data-index"));
    const disabled = listRowElement.classList.contains("option-disabled");
    if (index >= 0 && index < this.options.length && !disabled) {
      this.selected = index;
      this.select(this.selected);
      this.selectList.setFocus([this.selected]);
      this.selectList.reveal(this.selectList.getFocus()[0]);
      if (this.selected !== this._currentSelection) {
        this._currentSelection = this.selected;
        this._onDidSelect.fire({
          index: this.selectElement.selectedIndex,
          selected: this.options[this.selected].text
        });
        if (!!this.options[this.selected] && !!this.options[this.selected].text) {
          this.setTitle(this.options[this.selected].text);
        }
      }
      this.hideSelectDropDown(true);
    }
  }
  // List Exit - passive - implicit no selection change, hide drop-down
  onListBlur() {
    if (this._sticky) {
      return;
    }
    if (this.selected !== this._currentSelection) {
      this.select(this._currentSelection);
    }
    this.hideSelectDropDown(false);
  }
  renderDescriptionMarkdown(text, actionHandler) {
    const cleanRenderedMarkdown = (element) => {
      for (let i = 0; i < element.childNodes.length; i++) {
        const child = element.childNodes.item(i);
        const tagName = child.tagName && child.tagName.toLowerCase();
        if (tagName === "img") {
          child.remove();
        } else {
          cleanRenderedMarkdown(child);
        }
      }
    };
    const rendered = renderMarkdown({ value: text, supportThemeIcons: true }, { actionHandler });
    rendered.element.classList.add("select-box-description-markdown");
    cleanRenderedMarkdown(rendered.element);
    return rendered;
  }
  // List Focus Change - passive - update details pane with newly focused element's data
  onListFocus(e) {
    if (!this._isVisible || !this._hasDetails) {
      return;
    }
    this.updateDetail(e.indexes[0]);
  }
  updateDetail(selectedIndex) {
    this._selectionDetailsDisposables.clear();
    this.selectionDetailsPane.textContent = "";
    const option = this.options[selectedIndex];
    const description = option?.description ?? "";
    const descriptionIsMarkdown = option?.descriptionIsMarkdown ?? false;
    if (description) {
      if (descriptionIsMarkdown) {
        const actionHandler = option.descriptionMarkdownActionHandler;
        const result = this._selectionDetailsDisposables.add(this.renderDescriptionMarkdown(description, actionHandler));
        this.selectionDetailsPane.appendChild(result.element);
      } else {
        this.selectionDetailsPane.textContent = description;
      }
      this.selectionDetailsPane.style.display = "block";
    } else {
      this.selectionDetailsPane.style.display = "none";
    }
    this._skipLayout = true;
    this.contextViewProvider.layout();
    this._skipLayout = false;
  }
  // List keyboard controller
  // List exit - active - hide ContextView dropdown, reset selection, return focus to parent select
  onEscape(e) {
    dom.EventHelper.stop(e);
    this.select(this._currentSelection);
    this.hideSelectDropDown(true);
  }
  // List exit - active - hide ContextView dropdown, return focus to parent select, fire onDidSelect if change
  onEnter(e) {
    dom.EventHelper.stop(e);
    if (this.options[this.selected]?.isDisabled) {
      this.hideSelectDropDown(true);
      return;
    }
    if (this.selected !== this._currentSelection) {
      this._currentSelection = this.selected;
      this._onDidSelect.fire({
        index: this.selectElement.selectedIndex,
        selected: this.options[this.selected].text
      });
      if (!!this.options[this.selected] && !!this.options[this.selected].text) {
        this.setTitle(this.options[this.selected].text);
      }
    }
    this.hideSelectDropDown(true);
  }
  // List navigation - have to handle disabled options (jump over)
  onDownArrow(e) {
    if (this.selected < this.options.length - 1) {
      dom.EventHelper.stop(e, true);
      let next = this.selected + 1;
      while (next < this.options.length && this.options[next].isDisabled) {
        next++;
      }
      if (next >= this.options.length) {
        return;
      }
      this.selected = next;
      this.select(this.selected);
      this.selectList.setFocus([this.selected]);
      this.selectList.reveal(this.selectList.getFocus()[0]);
    }
  }
  onUpArrow(e) {
    if (this.selected > 0) {
      dom.EventHelper.stop(e, true);
      let prev = this.selected - 1;
      while (prev >= 0 && this.options[prev].isDisabled) {
        prev--;
      }
      if (prev < 0) {
        return;
      }
      this.selected = prev;
      this.select(this.selected);
      this.selectList.setFocus([this.selected]);
      this.selectList.reveal(this.selectList.getFocus()[0]);
    }
  }
  onPageUp(e) {
    dom.EventHelper.stop(e);
    this.selectList.focusPreviousPage();
    setTimeout(() => {
      let candidate = this.selectList.getFocus()[0];
      while (candidate > 0 && this.options[candidate].isDisabled) {
        candidate--;
      }
      if (this.options[candidate].isDisabled) {
        return;
      }
      this.selected = candidate;
      this.selectList.setFocus([this.selected]);
      this.selectList.reveal(this.selected);
      this.select(this.selected);
    }, 1);
  }
  onPageDown(e) {
    dom.EventHelper.stop(e);
    this.selectList.focusNextPage();
    setTimeout(() => {
      let candidate = this.selectList.getFocus()[0];
      while (candidate < this.options.length - 1 && this.options[candidate].isDisabled) {
        candidate++;
      }
      if (this.options[candidate].isDisabled) {
        return;
      }
      this.selected = candidate;
      this.selectList.setFocus([this.selected]);
      this.selectList.reveal(this.selected);
      this.select(this.selected);
    }, 1);
  }
  onHome(e) {
    dom.EventHelper.stop(e);
    if (this.options.length < 2) {
      return;
    }
    let candidate = 0;
    while (candidate < this.options.length - 1 && this.options[candidate].isDisabled) {
      candidate++;
    }
    if (this.options[candidate].isDisabled) {
      return;
    }
    this.selected = candidate;
    this.selectList.setFocus([this.selected]);
    this.selectList.reveal(this.selected);
    this.select(this.selected);
  }
  onEnd(e) {
    dom.EventHelper.stop(e);
    if (this.options.length < 2) {
      return;
    }
    let candidate = this.options.length - 1;
    while (candidate > 0 && this.options[candidate].isDisabled) {
      candidate--;
    }
    if (this.options[candidate].isDisabled) {
      return;
    }
    this.selected = candidate;
    this.selectList.setFocus([this.selected]);
    this.selectList.reveal(this.selected);
    this.select(this.selected);
  }
  // Mimic option first character navigation of native select
  onCharacter(e) {
    const ch = KeyCodeUtils.toString(e.keyCode);
    let optionIndex = -1;
    for (let i = 0; i < this.options.length - 1; i++) {
      optionIndex = (i + this.selected + 1) % this.options.length;
      if (this.options[optionIndex].text.charAt(0).toUpperCase() === ch && !this.options[optionIndex].isDisabled) {
        this.select(optionIndex);
        this.selectList.setFocus([optionIndex]);
        this.selectList.reveal(this.selectList.getFocus()[0]);
        dom.EventHelper.stop(e);
        break;
      }
    }
  }
  dispose() {
    this.hideSelectDropDown(false);
    super.dispose();
  }
};
_SelectBoxList.DEFAULT_DROPDOWN_MINIMUM_BOTTOM_MARGIN = 32;
_SelectBoxList.DEFAULT_DROPDOWN_MINIMUM_TOP_MARGIN = 2;
_SelectBoxList.DEFAULT_MINIMUM_VISIBLE_OPTIONS = 3;
let SelectBoxList = _SelectBoxList;
export {
  SelectBoxList
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFx1aVxcc2VsZWN0Qm94XFxzZWxlY3RCb3hDdXN0b20udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgKiBhcyBhcnJheXMgZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlDb2RlVXRpbHMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNNYWNpbnRvc2ggfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgU2Nyb2xsYmFyVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zY3JvbGxhYmxlLmpzJztcbmltcG9ydCAqIGFzIGNzc0pzIGZyb20gJy4uLy4uL2Nzc1ZhbHVlLmpzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi9kb20uanMnO1xuaW1wb3J0ICogYXMgZG9tU3R5bGVzaGVldHNKcyBmcm9tICcuLi8uLi9kb21TdHlsZXNoZWV0cy5qcyc7XG5pbXBvcnQgeyBEb21FbWl0dGVyIH0gZnJvbSAnLi4vLi4vZXZlbnQuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4va2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBJUmVuZGVyZWRNYXJrZG93biwgTWFya2Rvd25BY3Rpb25IYW5kbGVyLCByZW5kZXJNYXJrZG93biB9IGZyb20gJy4uLy4uL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgQW5jaG9yUG9zaXRpb24sIElDb250ZXh0Vmlld1Byb3ZpZGVyIH0gZnJvbSAnLi4vY29udGV4dHZpZXcvY29udGV4dHZpZXcuanMnO1xuaW1wb3J0IHR5cGUgeyBJTWFuYWdlZEhvdmVyIH0gZnJvbSAnLi4vaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgZ2V0QmFzZUxheWVySG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uL2hvdmVyL2hvdmVyRGVsZWdhdGUyLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSUxpc3RFdmVudCwgSUxpc3RSZW5kZXJlciwgSUxpc3RWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgTGlzdCB9IGZyb20gJy4uL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJU2VsZWN0Qm94RGVsZWdhdGUsIElTZWxlY3RCb3hPcHRpb25zLCBJU2VsZWN0Qm94U3R5bGVzLCBJU2VsZWN0RGF0YSwgSVNlbGVjdE9wdGlvbkl0ZW0gfSBmcm9tICcuL3NlbGVjdEJveC5qcyc7XG5pbXBvcnQgJy4vc2VsZWN0Qm94Q3VzdG9tLmNzcyc7XG5cblxuY29uc3QgJCA9IGRvbS4kO1xuXG5jb25zdCBTRUxFQ1RfT1BUSU9OX0VOVFJZX1RFTVBMQVRFX0lEID0gJ3NlbGVjdE9wdGlvbi5lbnRyeS50ZW1wbGF0ZSc7XG5cbmludGVyZmFjZSBJU2VsZWN0TGlzdFRlbXBsYXRlRGF0YSB7XG5cdHJvb3Q6IEhUTUxFbGVtZW50O1xuXHR0ZXh0OiBIVE1MRWxlbWVudDtcblx0ZGV0YWlsOiBIVE1MRWxlbWVudDtcblx0ZGVjb3JhdG9yUmlnaHQ6IEhUTUxFbGVtZW50O1xufVxuXG5jbGFzcyBTZWxlY3RMaXN0UmVuZGVyZXIgaW1wbGVtZW50cyBJTGlzdFJlbmRlcmVyPElTZWxlY3RPcHRpb25JdGVtLCBJU2VsZWN0TGlzdFRlbXBsYXRlRGF0YT4ge1xuXG5cdGdldCB0ZW1wbGF0ZUlkKCk6IHN0cmluZyB7IHJldHVybiBTRUxFQ1RfT1BUSU9OX0VOVFJZX1RFTVBMQVRFX0lEOyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElTZWxlY3RMaXN0VGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBkYXRhOiBJU2VsZWN0TGlzdFRlbXBsYXRlRGF0YSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0ZGF0YS5yb290ID0gY29udGFpbmVyO1xuXHRcdGRhdGEudGV4dCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCcub3B0aW9uLXRleHQnKSk7XG5cdFx0ZGF0YS5kZXRhaWwgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLm9wdGlvbi1kZXRhaWwnKSk7XG5cdFx0ZGF0YS5kZWNvcmF0b3JSaWdodCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCcub3B0aW9uLWRlY29yYXRvci1yaWdodCcpKTtcblxuXHRcdHJldHVybiBkYXRhO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJU2VsZWN0T3B0aW9uSXRlbSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJU2VsZWN0TGlzdFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGRhdGE6IElTZWxlY3RMaXN0VGVtcGxhdGVEYXRhID0gdGVtcGxhdGVEYXRhO1xuXG5cdFx0Y29uc3QgdGV4dCA9IGVsZW1lbnQudGV4dDtcblx0XHRjb25zdCBkZXRhaWwgPSBlbGVtZW50LmRldGFpbDtcblx0XHRjb25zdCBkZWNvcmF0b3JSaWdodCA9IGVsZW1lbnQuZGVjb3JhdG9yUmlnaHQ7XG5cblx0XHRjb25zdCBpc0Rpc2FibGVkID0gZWxlbWVudC5pc0Rpc2FibGVkO1xuXG5cdFx0ZGF0YS50ZXh0LnRleHRDb250ZW50ID0gdGV4dDtcblx0XHRkYXRhLmRldGFpbC50ZXh0Q29udGVudCA9ICEhZGV0YWlsID8gZGV0YWlsIDogJyc7XG5cdFx0ZGF0YS5kZWNvcmF0b3JSaWdodC50ZXh0Q29udGVudCA9ICEhZGVjb3JhdG9yUmlnaHQgPyBkZWNvcmF0b3JSaWdodCA6ICcnO1xuXG5cdFx0Ly8gcHNldWRvLXNlbGVjdCBkaXNhYmxlZCBvcHRpb25cblx0XHRpZiAoaXNEaXNhYmxlZCkge1xuXHRcdFx0ZGF0YS5yb290LmNsYXNzTGlzdC5hZGQoJ29wdGlvbi1kaXNhYmxlZCcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBNYWtlIHN1cmUgd2UgZG8gY2xhc3MgcmVtb3ZhbCBmcm9tIHByaW9yIHRlbXBsYXRlIHJlbmRlcmluZ1xuXHRcdFx0ZGF0YS5yb290LmNsYXNzTGlzdC5yZW1vdmUoJ29wdGlvbi1kaXNhYmxlZCcpO1xuXHRcdH1cblxuXHRcdC8vIFNlcGFyYXRvciBvcHRpb24gLSBzaG93IGEgQ1NTIGJvcmRlciBpbnN0ZWFkIG9mIHRleHQgY2hhcmFjdGVyc1xuXHRcdGlmIChlbGVtZW50LmlzU2VwYXJhdG9yKSB7XG5cdFx0XHRkYXRhLnJvb3QuY2xhc3NMaXN0LmFkZCgnb3B0aW9uLXNlcGFyYXRvcicpO1xuXHRcdFx0ZGF0YS5yb290LmNsYXNzTGlzdC5hZGQoJ29wdGlvbi1kaXNhYmxlZCcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkYXRhLnJvb3QuY2xhc3NMaXN0LnJlbW92ZSgnb3B0aW9uLXNlcGFyYXRvcicpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZShfdGVtcGxhdGVEYXRhOiBJU2VsZWN0TGlzdFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdC8vIG5vb3Bcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2VsZWN0Qm94TGlzdCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU2VsZWN0Qm94RGVsZWdhdGUsIElMaXN0VmlydHVhbERlbGVnYXRlPElTZWxlY3RPcHRpb25JdGVtPiB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgREVGQVVMVF9EUk9QRE9XTl9NSU5JTVVNX0JPVFRPTV9NQVJHSU4gPSAzMjtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgREVGQVVMVF9EUk9QRE9XTl9NSU5JTVVNX1RPUF9NQVJHSU4gPSAyO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBERUZBVUxUX01JTklNVU1fVklTSUJMRV9PUFRJT05TID0gMztcblxuXHRwcml2YXRlIF9pc1Zpc2libGU6IGJvb2xlYW47XG5cdHByaXZhdGUgc2VsZWN0Qm94T3B0aW9uczogSVNlbGVjdEJveE9wdGlvbnM7XG5cdHByaXZhdGUgc2VsZWN0RWxlbWVudDogSFRNTFNlbGVjdEVsZW1lbnQ7XG5cdHByaXZhdGUgY29udGFpbmVyPzogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgb3B0aW9uczogSVNlbGVjdE9wdGlvbkl0ZW1bXSA9IFtdO1xuXHRwcml2YXRlIHNlbGVjdGVkOiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2VsZWN0OiBFbWl0dGVyPElTZWxlY3REYXRhPjtcblx0cHJpdmF0ZSByZWFkb25seSBzdHlsZXM6IElTZWxlY3RCb3hTdHlsZXM7XG5cdHByaXZhdGUgbGlzdFJlbmRlcmVyITogU2VsZWN0TGlzdFJlbmRlcmVyO1xuXHRwcml2YXRlIGNvbnRleHRWaWV3UHJvdmlkZXIhOiBJQ29udGV4dFZpZXdQcm92aWRlcjtcblx0cHJpdmF0ZSBzZWxlY3REcm9wRG93bkNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHN0eWxlRWxlbWVudCE6IEhUTUxTdHlsZUVsZW1lbnQ7XG5cdHByaXZhdGUgc2VsZWN0TGlzdCE6IExpc3Q8SVNlbGVjdE9wdGlvbkl0ZW0+O1xuXHRwcml2YXRlIHNlbGVjdERyb3BEb3duTGlzdENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHdpZHRoQ29udHJvbEVsZW1lbnQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfY3VycmVudFNlbGVjdGlvbiA9IDA7XG5cdHByaXZhdGUgX2Ryb3BEb3duUG9zaXRpb24hOiBBbmNob3JQb3NpdGlvbjtcblx0cHJpdmF0ZSBfaGFzRGV0YWlsczogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHNlbGVjdGlvbkRldGFpbHNQYW5lITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlbGVjdGlvbkRldGFpbHNEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgX3NraXBMYXlvdXQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfY2FjaGVkTWF4RGV0YWlsc0hlaWdodD86IG51bWJlcjtcblx0cHJpdmF0ZSBfaG92ZXI/OiBJTWFuYWdlZEhvdmVyO1xuXG5cdHByaXZhdGUgX3N0aWNreTogYm9vbGVhbiA9IGZhbHNlOyAvLyBmb3IgZGV2IHB1cnBvc2VzIG9ubHlcblxuXHRjb25zdHJ1Y3RvcihvcHRpb25zOiBJU2VsZWN0T3B0aW9uSXRlbVtdLCBzZWxlY3RlZDogbnVtYmVyLCBjb250ZXh0Vmlld1Byb3ZpZGVyOiBJQ29udGV4dFZpZXdQcm92aWRlciwgc3R5bGVzOiBJU2VsZWN0Qm94U3R5bGVzLCBzZWxlY3RCb3hPcHRpb25zPzogSVNlbGVjdEJveE9wdGlvbnMpIHtcblxuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5faXNWaXNpYmxlID0gZmFsc2U7XG5cdFx0dGhpcy5zdHlsZXMgPSBzdHlsZXM7XG5cblx0XHR0aGlzLnNlbGVjdEJveE9wdGlvbnMgPSBzZWxlY3RCb3hPcHRpb25zIHx8IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cblx0XHRpZiAodHlwZW9mIHRoaXMuc2VsZWN0Qm94T3B0aW9ucy5taW5Cb3R0b21NYXJnaW4gIT09ICdudW1iZXInKSB7XG5cdFx0XHR0aGlzLnNlbGVjdEJveE9wdGlvbnMubWluQm90dG9tTWFyZ2luID0gU2VsZWN0Qm94TGlzdC5ERUZBVUxUX0RST1BET1dOX01JTklNVU1fQk9UVE9NX01BUkdJTjtcblx0XHR9IGVsc2UgaWYgKHRoaXMuc2VsZWN0Qm94T3B0aW9ucy5taW5Cb3R0b21NYXJnaW4gPCAwKSB7XG5cdFx0XHR0aGlzLnNlbGVjdEJveE9wdGlvbnMubWluQm90dG9tTWFyZ2luID0gMDtcblx0XHR9XG5cblx0XHR0aGlzLnNlbGVjdEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzZWxlY3QnKTtcblx0XHR0aGlzLnNlbGVjdEVsZW1lbnQuY2xhc3NOYW1lID0gJ21vbmFjby1zZWxlY3QtYm94JztcblxuXHRcdGlmICh0eXBlb2YgdGhpcy5zZWxlY3RCb3hPcHRpb25zLmFyaWFMYWJlbCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRoaXMuc2VsZWN0RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB0aGlzLnNlbGVjdEJveE9wdGlvbnMuYXJpYUxhYmVsKTtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIHRoaXMuc2VsZWN0Qm94T3B0aW9ucy5hcmlhRGVzY3JpcHRpb24gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aGlzLnNlbGVjdEVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWRlc2NyaXB0aW9uJywgdGhpcy5zZWxlY3RCb3hPcHRpb25zLmFyaWFEZXNjcmlwdGlvbik7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRTZWxlY3QgPSBuZXcgRW1pdHRlcjxJU2VsZWN0RGF0YT4oKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9vbkRpZFNlbGVjdCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdFx0dGhpcy5jb25zdHJ1Y3RTZWxlY3REcm9wRG93bihjb250ZXh0Vmlld1Byb3ZpZGVyKTtcblxuXHRcdHRoaXMuc2VsZWN0ZWQgPSBzZWxlY3RlZCB8fCAwO1xuXG5cdFx0aWYgKG9wdGlvbnMpIHtcblx0XHRcdHRoaXMuc2V0T3B0aW9ucyhvcHRpb25zLCBzZWxlY3RlZCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5pbml0U3R5bGVTaGVldCgpO1xuXG5cdH1cblxuXHRwcml2YXRlIHNldFRpdGxlKHRpdGxlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2hvdmVyICYmIHRpdGxlKSB7XG5cdFx0XHR0aGlzLl9ob3ZlciA9IHRoaXMuX3JlZ2lzdGVyKGdldEJhc2VMYXllckhvdmVyRGVsZWdhdGUoKS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgdGhpcy5zZWxlY3RFbGVtZW50LCB0aXRsZSkpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5faG92ZXIpIHtcblx0XHRcdHRoaXMuX2hvdmVyLnVwZGF0ZSh0aXRsZSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gSURlbGVnYXRlIC0gTGlzdCByZW5kZXJlclxuXG5cdGdldEhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiAyMjtcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gU0VMRUNUX09QVElPTl9FTlRSWV9URU1QTEFURV9JRDtcblx0fVxuXG5cdHByaXZhdGUgY29uc3RydWN0U2VsZWN0RHJvcERvd24oY29udGV4dFZpZXdQcm92aWRlcjogSUNvbnRleHRWaWV3UHJvdmlkZXIpIHtcblxuXHRcdC8vIFNldFVwIENvbnRleHRWaWV3IGNvbnRhaW5lciB0byBob2xkIHNlbGVjdCBEcm9wZG93blxuXHRcdHRoaXMuY29udGV4dFZpZXdQcm92aWRlciA9IGNvbnRleHRWaWV3UHJvdmlkZXI7XG5cdFx0dGhpcy5zZWxlY3REcm9wRG93bkNvbnRhaW5lciA9IGRvbS4kKCcubW9uYWNvLXNlbGVjdC1ib3gtZHJvcGRvd24tY29udGFpbmVyJyk7XG5cblx0XHQvLyBTZXR1cCBjb250YWluZXIgZm9yIHNlbGVjdCBvcHRpb24gZGV0YWlsc1xuXHRcdHRoaXMuc2VsZWN0aW9uRGV0YWlsc1BhbmUgPSBkb20uYXBwZW5kKHRoaXMuc2VsZWN0RHJvcERvd25Db250YWluZXIsICQoJy5zZWxlY3QtYm94LWRldGFpbHMtcGFuZScpKTtcblxuXHRcdC8vIENyZWF0ZSBzcGFuIGZsZXggYm94IGl0ZW0vZGl2IHdlIGNhbiBtZWFzdXJlIGFuZCBjb250cm9sXG5cdFx0Y29uc3Qgd2lkdGhDb250cm9sT3V0ZXJEaXYgPSBkb20uYXBwZW5kKHRoaXMuc2VsZWN0RHJvcERvd25Db250YWluZXIsICQoJy5zZWxlY3QtYm94LWRyb3Bkb3duLWNvbnRhaW5lci13aWR0aC1jb250cm9sJykpO1xuXHRcdGNvbnN0IHdpZHRoQ29udHJvbElubmVyRGl2ID0gZG9tLmFwcGVuZCh3aWR0aENvbnRyb2xPdXRlckRpdiwgJCgnLndpZHRoLWNvbnRyb2wtZGl2JykpO1xuXHRcdHRoaXMud2lkdGhDb250cm9sRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHR0aGlzLndpZHRoQ29udHJvbEVsZW1lbnQuY2xhc3NOYW1lID0gJ29wdGlvbi10ZXh0LXdpZHRoLWNvbnRyb2wnO1xuXHRcdGRvbS5hcHBlbmQod2lkdGhDb250cm9sSW5uZXJEaXYsIHRoaXMud2lkdGhDb250cm9sRWxlbWVudCk7XG5cblx0XHQvLyBBbHdheXMgZGVmYXVsdCB0byBiZWxvdyBwb3NpdGlvblxuXHRcdHRoaXMuX2Ryb3BEb3duUG9zaXRpb24gPSBBbmNob3JQb3NpdGlvbi5CRUxPVztcblxuXHRcdC8vIElubGluZSBzdHlsZXNoZWV0IGZvciB0aGVtZXNcblx0XHR0aGlzLnN0eWxlRWxlbWVudCA9IGRvbVN0eWxlc2hlZXRzSnMuY3JlYXRlU3R5bGVTaGVldCh0aGlzLnNlbGVjdERyb3BEb3duQ29udGFpbmVyKTtcblxuXHRcdC8vIFByZXZlbnQgZHJhZ2dpbmcgb2YgZHJvcGRvd24gIzExNDMyOVxuXHRcdHRoaXMuc2VsZWN0RHJvcERvd25Db250YWluZXIuc2V0QXR0cmlidXRlKCdkcmFnZ2FibGUnLCAndHJ1ZScpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5zZWxlY3REcm9wRG93bkNvbnRhaW5lciwgZG9tLkV2ZW50VHlwZS5EUkFHX1NUQVJULCAoZSkgPT4ge1xuXHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpIHtcblxuXHRcdC8vIFBhcmVudCBuYXRpdmUgc2VsZWN0IGtleWJvYXJkIGxpc3RlbmVyc1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuc2VsZWN0RWxlbWVudCwgJ2NoYW5nZScsIChlKSA9PiB7XG5cdFx0XHR0aGlzLnNlbGVjdGVkID0gZS50YXJnZXQuc2VsZWN0ZWRJbmRleDtcblx0XHRcdHRoaXMuX29uRGlkU2VsZWN0LmZpcmUoe1xuXHRcdFx0XHRpbmRleDogZS50YXJnZXQuc2VsZWN0ZWRJbmRleCxcblx0XHRcdFx0c2VsZWN0ZWQ6IGUudGFyZ2V0LnZhbHVlXG5cdFx0XHR9KTtcblx0XHRcdGlmICghIXRoaXMub3B0aW9uc1t0aGlzLnNlbGVjdGVkXSAmJiAhIXRoaXMub3B0aW9uc1t0aGlzLnNlbGVjdGVkXS50ZXh0KSB7XG5cdFx0XHRcdHRoaXMuc2V0VGl0bGUodGhpcy5vcHRpb25zW3RoaXMuc2VsZWN0ZWRdLnRleHQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEhhdmUgdG8gaW1wbGVtZW50IGJvdGgga2V5Ym9hcmQgYW5kIG1vdXNlIGNvbnRyb2xsZXJzIHRvIGhhbmRsZSBkaXNhYmxlZCBvcHRpb25zXG5cdFx0Ly8gSW50ZXJjZXB0IG1vdXNlIGV2ZW50cyB0byBvdmVycmlkZSBub3JtYWwgc2VsZWN0IGFjdGlvbnMgb24gcGFyZW50c1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnNlbGVjdEVsZW1lbnQsIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIChlKSA9PiB7XG5cdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlKTtcblxuXHRcdFx0aWYgKHRoaXMuX2lzVmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLmhpZGVTZWxlY3REcm9wRG93bih0cnVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuc2hvd1NlbGVjdERyb3BEb3duKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnNlbGVjdEVsZW1lbnQsIGRvbS5FdmVudFR5cGUuTU9VU0VfRE9XTiwgKGUpID0+IHtcblx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEludGVyY2VwdCB0b3VjaCBldmVudHNcblx0XHQvLyBUaGUgZm9sbG93aW5nIGltcGxlbWVudGF0aW9uIGlzIHNsaWdodGx5IGRpZmZlcmVudCBmcm9tIHRoZSBtb3VzZSBldmVudCBoYW5kbGVycyBhYm92ZS5cblx0XHQvLyBVc2UgdGhlIGZvbGxvd2luZyBoZWxwZXIgdmFyaWFibGUsIG90aGVyd2lzZSB0aGUgbGlzdCBmbGlja2Vycy5cblx0XHRsZXQgbGlzdElzVmlzaWJsZU9uVG91Y2hTdGFydDogYm9vbGVhbjtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuc2VsZWN0RWxlbWVudCwgJ3RvdWNoc3RhcnQnLCAoZSkgPT4ge1xuXHRcdFx0bGlzdElzVmlzaWJsZU9uVG91Y2hTdGFydCA9IHRoaXMuX2lzVmlzaWJsZTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnNlbGVjdEVsZW1lbnQsICd0b3VjaGVuZCcsIChlKSA9PiB7XG5cdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlKTtcblxuXHRcdFx0aWYgKGxpc3RJc1Zpc2libGVPblRvdWNoU3RhcnQpIHtcblx0XHRcdFx0dGhpcy5oaWRlU2VsZWN0RHJvcERvd24odHJ1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnNob3dTZWxlY3REcm9wRG93bigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEludGVyY2VwdCBrZXlib2FyZCBoYW5kbGluZ1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnNlbGVjdEVsZW1lbnQsIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRsZXQgc2hvd0Ryb3BEb3duID0gZmFsc2U7XG5cblx0XHRcdC8vIENyZWF0ZSBhbmQgZHJvcCBkb3duIHNlbGVjdCBsaXN0IG9uIGtleWJvYXJkIHNlbGVjdFxuXHRcdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHRcdGlmIChldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkRvd25BcnJvdyB8fCBldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLlVwQXJyb3cgfHwgZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5TcGFjZSB8fCBldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkVudGVyKSB7XG5cdFx0XHRcdFx0c2hvd0Ryb3BEb3duID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuRG93bkFycm93ICYmIGV2ZW50LmFsdEtleSB8fCBldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLlVwQXJyb3cgJiYgZXZlbnQuYWx0S2V5IHx8IGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuU3BhY2UgfHwgZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlcikge1xuXHRcdFx0XHRcdHNob3dEcm9wRG93biA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHNob3dEcm9wRG93bikge1xuXHRcdFx0XHR0aGlzLnNob3dTZWxlY3REcm9wRG93bigpO1xuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9uRGlkU2VsZWN0KCk6IEV2ZW50PElTZWxlY3REYXRhPiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkU2VsZWN0LmV2ZW50O1xuXHR9XG5cblx0cHVibGljIHNldE9wdGlvbnMob3B0aW9uczogSVNlbGVjdE9wdGlvbkl0ZW1bXSwgc2VsZWN0ZWQ/OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoIWFycmF5cy5lcXVhbHModGhpcy5vcHRpb25zLCBvcHRpb25zKSkge1xuXHRcdFx0dGhpcy5vcHRpb25zID0gb3B0aW9ucztcblx0XHRcdHRoaXMuc2VsZWN0RWxlbWVudC5vcHRpb25zLmxlbmd0aCA9IDA7XG5cdFx0XHR0aGlzLl9oYXNEZXRhaWxzID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9jYWNoZWRNYXhEZXRhaWxzSGVpZ2h0ID0gdW5kZWZpbmVkO1xuXG5cdFx0XHR0aGlzLm9wdGlvbnMuZm9yRWFjaCgob3B0aW9uLCBpbmRleCkgPT4ge1xuXHRcdFx0XHR0aGlzLnNlbGVjdEVsZW1lbnQuYWRkKHRoaXMuY3JlYXRlT3B0aW9uKG9wdGlvbi50ZXh0LCBpbmRleCwgb3B0aW9uLmlzRGlzYWJsZWQpKTtcblx0XHRcdFx0aWYgKHR5cGVvZiBvcHRpb24uZGVzY3JpcHRpb24gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0dGhpcy5faGFzRGV0YWlscyA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmIChzZWxlY3RlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLnNlbGVjdChzZWxlY3RlZCk7XG5cdFx0XHQvLyBTZXQgY3VycmVudCA9IHNlbGVjdGVkIHNpbmNlIHRoaXMgaXMgbm90IG5lY2Vzc2FyaWx5IGEgdXNlciBleGl0XG5cdFx0XHR0aGlzLl9jdXJyZW50U2VsZWN0aW9uID0gdGhpcy5zZWxlY3RlZDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5faXNWaXNpYmxlKSB7XG5cdFx0XHR0aGlzLnNldE9wdGlvbnNMaXN0KCk7XG5cdFx0XHR0aGlzLmxheW91dFNlbGVjdERyb3BEb3duKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNldEVuYWJsZWQoZW5hYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5zZWxlY3RFbGVtZW50LmRpc2FibGVkID0gIWVuYWJsZTtcblx0fVxuXG5cdHByaXZhdGUgc2V0T3B0aW9uc0xpc3QoKSB7XG5cblx0XHQvLyBNaXJyb3Igb3B0aW9ucyBpbiBkcm9wLWRvd25cblx0XHQvLyBQb3B1bGF0ZSBzZWxlY3QgbGlzdCBmb3Igbm9uLW5hdGl2ZSBzZWxlY3QgbW9kZVxuXHRcdHRoaXMuc2VsZWN0TGlzdD8uc3BsaWNlKDAsIHRoaXMuc2VsZWN0TGlzdC5sZW5ndGgsIHRoaXMub3B0aW9ucyk7XG5cdH1cblxuXHRwdWJsaWMgc2VsZWN0KGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblxuXHRcdGlmIChpbmRleCA+PSAwICYmIGluZGV4IDwgdGhpcy5vcHRpb25zLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5zZWxlY3RlZCA9IGluZGV4O1xuXHRcdH0gZWxzZSBpZiAoaW5kZXggPiB0aGlzLm9wdGlvbnMubGVuZ3RoIC0gMSkge1xuXHRcdFx0Ly8gQWRqdXN0IGluZGV4IHRvIGVuZCBvZiBsaXN0XG5cdFx0XHQvLyBUaGlzIGNvdWxkIG1ha2UgY2xpZW50IG91dCBvZiBzeW5jIHdpdGggdGhlIHNlbGVjdFxuXHRcdFx0dGhpcy5zZWxlY3QodGhpcy5vcHRpb25zLmxlbmd0aCAtIDEpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5zZWxlY3RlZCA8IDApIHtcblx0XHRcdHRoaXMuc2VsZWN0ZWQgPSAwO1xuXHRcdH1cblxuXHRcdHRoaXMuc2VsZWN0RWxlbWVudC5zZWxlY3RlZEluZGV4ID0gdGhpcy5zZWxlY3RlZDtcblx0XHRpZiAoISF0aGlzLm9wdGlvbnNbdGhpcy5zZWxlY3RlZF0gJiYgISF0aGlzLm9wdGlvbnNbdGhpcy5zZWxlY3RlZF0udGV4dCkge1xuXHRcdFx0dGhpcy5zZXRUaXRsZSh0aGlzLm9wdGlvbnNbdGhpcy5zZWxlY3RlZF0udGV4dCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNldEFyaWFMYWJlbChsYWJlbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5zZWxlY3RCb3hPcHRpb25zLmFyaWFMYWJlbCA9IGxhYmVsO1xuXHRcdHRoaXMuc2VsZWN0RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB0aGlzLnNlbGVjdEJveE9wdGlvbnMuYXJpYUxhYmVsKTtcblx0fVxuXG5cdHB1YmxpYyBmb2N1cygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5zZWxlY3RFbGVtZW50KSB7XG5cdFx0XHR0aGlzLnNlbGVjdEVsZW1lbnQudGFiSW5kZXggPSAwO1xuXHRcdFx0dGhpcy5zZWxlY3RFbGVtZW50LmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGJsdXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuc2VsZWN0RWxlbWVudCkge1xuXHRcdFx0dGhpcy5zZWxlY3RFbGVtZW50LnRhYkluZGV4ID0gLTE7XG5cdFx0XHR0aGlzLnNlbGVjdEVsZW1lbnQuYmx1cigpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzZXRGb2N1c2FibGUoZm9jdXNhYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5zZWxlY3RFbGVtZW50LnRhYkluZGV4ID0gZm9jdXNhYmxlID8gMCA6IC0xO1xuXHR9XG5cblx0cHVibGljIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5jb250YWluZXIgPSBjb250YWluZXI7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3NlbGVjdC1jb250YWluZXInKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5zZWxlY3RFbGVtZW50KTtcblx0XHR0aGlzLnN0eWxlU2VsZWN0RWxlbWVudCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBpbml0U3R5bGVTaGVldCgpOiB2b2lkIHtcblxuXHRcdGNvbnN0IGNvbnRlbnQ6IHN0cmluZ1tdID0gW107XG5cblx0XHQvLyBTdHlsZSBub24tbmF0aXZlIHNlbGVjdCBtb2RlXG5cblx0XHRpZiAodGhpcy5zdHlsZXMubGlzdEZvY3VzQmFja2dyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLXNlbGVjdC1ib3gtZHJvcGRvd24tY29udGFpbmVyID4gLnNlbGVjdC1ib3gtZHJvcGRvd24tbGlzdC1jb250YWluZXIgLm1vbmFjby1saXN0IC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZCB7IGJhY2tncm91bmQtY29sb3I6ICR7dGhpcy5zdHlsZXMubGlzdEZvY3VzQmFja2dyb3VuZH0gIWltcG9ydGFudDsgfWApO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnN0eWxlcy5saXN0Rm9jdXNGb3JlZ3JvdW5kKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tc2VsZWN0LWJveC1kcm9wZG93bi1jb250YWluZXIgPiAuc2VsZWN0LWJveC1kcm9wZG93bi1saXN0LWNvbnRhaW5lciAubW9uYWNvLWxpc3QgLm1vbmFjby1saXN0LXJvdy5mb2N1c2VkIHsgY29sb3I6ICR7dGhpcy5zdHlsZXMubGlzdEZvY3VzRm9yZWdyb3VuZH0gIWltcG9ydGFudDsgfWApO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnN0eWxlcy5kZWNvcmF0b3JSaWdodEZvcmVncm91bmQpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1zZWxlY3QtYm94LWRyb3Bkb3duLWNvbnRhaW5lciA+IC5zZWxlY3QtYm94LWRyb3Bkb3duLWxpc3QtY29udGFpbmVyIC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93Om5vdCguZm9jdXNlZCkgLm9wdGlvbi1kZWNvcmF0b3ItcmlnaHQgeyBjb2xvcjogJHt0aGlzLnN0eWxlcy5kZWNvcmF0b3JSaWdodEZvcmVncm91bmR9OyB9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc3R5bGVzLnNlbGVjdEJhY2tncm91bmQgJiYgdGhpcy5zdHlsZXMuc2VsZWN0Qm9yZGVyICYmIHRoaXMuc3R5bGVzLnNlbGVjdEJvcmRlciAhPT0gdGhpcy5zdHlsZXMuc2VsZWN0QmFja2dyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLXNlbGVjdC1ib3gtZHJvcGRvd24tY29udGFpbmVyIHsgYm9yZGVyOiAxcHggc29saWQgJHt0aGlzLnN0eWxlcy5zZWxlY3RCb3JkZXJ9IH0gYCk7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tc2VsZWN0LWJveC1kcm9wZG93bi1jb250YWluZXIgPiAuc2VsZWN0LWJveC1kZXRhaWxzLXBhbmUuYm9yZGVyLXRvcCB7IGJvcmRlci10b3A6IDFweCBzb2xpZCAke3RoaXMuc3R5bGVzLnNlbGVjdEJvcmRlcn0gfSBgKTtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1zZWxlY3QtYm94LWRyb3Bkb3duLWNvbnRhaW5lciA+IC5zZWxlY3QtYm94LWRldGFpbHMtcGFuZS5ib3JkZXItYm90dG9tIHsgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkICR7dGhpcy5zdHlsZXMuc2VsZWN0Qm9yZGVyfSB9IGApO1xuXG5cdFx0fVxuXHRcdGVsc2UgaWYgKHRoaXMuc3R5bGVzLnNlbGVjdExpc3RCb3JkZXIpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1zZWxlY3QtYm94LWRyb3Bkb3duLWNvbnRhaW5lciA+IC5zZWxlY3QtYm94LWRldGFpbHMtcGFuZS5ib3JkZXItdG9wIHsgYm9yZGVyLXRvcDogMXB4IHNvbGlkICR7dGhpcy5zdHlsZXMuc2VsZWN0TGlzdEJvcmRlcn0gfSBgKTtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1zZWxlY3QtYm94LWRyb3Bkb3duLWNvbnRhaW5lciA+IC5zZWxlY3QtYm94LWRldGFpbHMtcGFuZS5ib3JkZXItYm90dG9tIHsgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkICR7dGhpcy5zdHlsZXMuc2VsZWN0TGlzdEJvcmRlcn0gfSBgKTtcblx0XHR9XG5cblx0XHQvLyBIb3ZlciBmb3JlZ3JvdW5kIC0gaWdub3JlIGZvciBkaXNhYmxlZCBvcHRpb25zXG5cdFx0aWYgKHRoaXMuc3R5bGVzLmxpc3RIb3ZlckZvcmVncm91bmQpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1zZWxlY3QtYm94LWRyb3Bkb3duLWNvbnRhaW5lciA+IC5zZWxlY3QtYm94LWRyb3Bkb3duLWxpc3QtY29udGFpbmVyIC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93Om5vdCgub3B0aW9uLWRpc2FibGVkKTpub3QoLmZvY3VzZWQpOmhvdmVyIHsgY29sb3I6ICR7dGhpcy5zdHlsZXMubGlzdEhvdmVyRm9yZWdyb3VuZH0gIWltcG9ydGFudDsgfWApO1xuXHRcdH1cblxuXHRcdC8vIEhvdmVyIGJhY2tncm91bmQgLSBpZ25vcmUgZm9yIGRpc2FibGVkIG9wdGlvbnNcblx0XHRpZiAodGhpcy5zdHlsZXMubGlzdEhvdmVyQmFja2dyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLXNlbGVjdC1ib3gtZHJvcGRvd24tY29udGFpbmVyID4gLnNlbGVjdC1ib3gtZHJvcGRvd24tbGlzdC1jb250YWluZXIgLm1vbmFjby1saXN0IC5tb25hY28tbGlzdC1yb3c6bm90KC5vcHRpb24tZGlzYWJsZWQpOm5vdCguZm9jdXNlZCk6aG92ZXIgeyBiYWNrZ3JvdW5kLWNvbG9yOiAke3RoaXMuc3R5bGVzLmxpc3RIb3ZlckJhY2tncm91bmR9ICFpbXBvcnRhbnQ7IH1gKTtcblx0XHR9XG5cblx0XHQvLyBNYXRjaCBhY3Rpb24gd2lkZ2V0IG91dGxpbmUgc3R5bGVzIC0gaWdub3JlIGZvciBkaXNhYmxlZCBvcHRpb25zXG5cdFx0aWYgKHRoaXMuc3R5bGVzLmxpc3RGb2N1c091dGxpbmUpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1zZWxlY3QtYm94LWRyb3Bkb3duLWNvbnRhaW5lciA+IC5zZWxlY3QtYm94LWRyb3Bkb3duLWxpc3QtY29udGFpbmVyIC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93LmZvY3VzZWQgeyBvdXRsaW5lOiAxcHggc29saWQgJHt0aGlzLnN0eWxlcy5saXN0Rm9jdXNPdXRsaW5lfSAhaW1wb3J0YW50OyBvdXRsaW5lLW9mZnNldDogLTFweCAhaW1wb3J0YW50OyB9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc3R5bGVzLmxpc3RIb3Zlck91dGxpbmUpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1zZWxlY3QtYm94LWRyb3Bkb3duLWNvbnRhaW5lciA+IC5zZWxlY3QtYm94LWRyb3Bkb3duLWxpc3QtY29udGFpbmVyIC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93Om5vdCgub3B0aW9uLWRpc2FibGVkKTpub3QoLmZvY3VzZWQpOmhvdmVyIHsgb3V0bGluZTogMXB4IHNvbGlkICR7dGhpcy5zdHlsZXMubGlzdEhvdmVyT3V0bGluZX0gIWltcG9ydGFudDsgb3V0bGluZS1vZmZzZXQ6IC0xcHggIWltcG9ydGFudDsgfWApO1xuXHRcdH1cblxuXHRcdC8vIENsZWFyIGxpc3Qgc3R5bGVzIG9uIGZvY3VzIGFuZCBvbiBob3ZlciBmb3IgZGlzYWJsZWQgb3B0aW9uc1xuXHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1zZWxlY3QtYm94LWRyb3Bkb3duLWNvbnRhaW5lciA+IC5zZWxlY3QtYm94LWRyb3Bkb3duLWxpc3QtY29udGFpbmVyIC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93Lm9wdGlvbi1kaXNhYmxlZC5mb2N1c2VkIHsgYmFja2dyb3VuZC1jb2xvcjogdHJhbnNwYXJlbnQgIWltcG9ydGFudDsgY29sb3I6IGluaGVyaXQgIWltcG9ydGFudDsgb3V0bGluZTogbm9uZSAhaW1wb3J0YW50OyB9YCk7XG5cdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLXNlbGVjdC1ib3gtZHJvcGRvd24tY29udGFpbmVyID4gLnNlbGVjdC1ib3gtZHJvcGRvd24tbGlzdC1jb250YWluZXIgLm1vbmFjby1saXN0IC5tb25hY28tbGlzdC1yb3cub3B0aW9uLWRpc2FibGVkOmhvdmVyIHsgYmFja2dyb3VuZC1jb2xvcjogdHJhbnNwYXJlbnQgIWltcG9ydGFudDsgY29sb3I6IGluaGVyaXQgIWltcG9ydGFudDsgb3V0bGluZTogbm9uZSAhaW1wb3J0YW50OyB9YCk7XG5cblx0XHR0aGlzLnN0eWxlRWxlbWVudC50ZXh0Q29udGVudCA9IGNvbnRlbnQuam9pbignXFxuJyk7XG5cdH1cblxuXHRwcml2YXRlIHN0eWxlU2VsZWN0RWxlbWVudCgpOiB2b2lkIHtcblx0XHRjb25zdCBiYWNrZ3JvdW5kID0gdGhpcy5zdHlsZXMuc2VsZWN0QmFja2dyb3VuZCA/PyAnJztcblx0XHRjb25zdCBmb3JlZ3JvdW5kID0gdGhpcy5zdHlsZXMuc2VsZWN0Rm9yZWdyb3VuZCA/PyAnJztcblx0XHRjb25zdCBib3JkZXIgPSB0aGlzLnN0eWxlcy5zZWxlY3RCb3JkZXIgPz8gJyc7XG5cblx0XHR0aGlzLnNlbGVjdEVsZW1lbnQuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gYmFja2dyb3VuZDtcblx0XHR0aGlzLnNlbGVjdEVsZW1lbnQuc3R5bGUuY29sb3IgPSBmb3JlZ3JvdW5kO1xuXHRcdHRoaXMuc2VsZWN0RWxlbWVudC5zdHlsZS5ib3JkZXJDb2xvciA9IGJvcmRlcjtcblx0fVxuXG5cdHByaXZhdGUgc3R5bGVMaXN0KCkge1xuXHRcdGNvbnN0IGJhY2tncm91bmQgPSB0aGlzLnN0eWxlcy5zZWxlY3RCYWNrZ3JvdW5kID8/ICcnO1xuXG5cdFx0Y29uc3QgbGlzdEJhY2tncm91bmQgPSBjc3NKcy5hc0Nzc1ZhbHVlV2l0aERlZmF1bHQodGhpcy5zdHlsZXMuc2VsZWN0TGlzdEJhY2tncm91bmQsIGJhY2tncm91bmQpO1xuXHRcdHRoaXMuc2VsZWN0RHJvcERvd25Db250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gbGlzdEJhY2tncm91bmQ7XG5cdFx0dGhpcy5zZWxlY3REcm9wRG93bkxpc3RDb250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gbGlzdEJhY2tncm91bmQ7XG5cdFx0dGhpcy5zZWxlY3Rpb25EZXRhaWxzUGFuZS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBsaXN0QmFja2dyb3VuZDtcblxuXHRcdHRoaXMuc2VsZWN0TGlzdC5zdHlsZSh0aGlzLnN0eWxlcyk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU9wdGlvbih2YWx1ZTogc3RyaW5nLCBpbmRleDogbnVtYmVyLCBkaXNhYmxlZD86IGJvb2xlYW4pOiBIVE1MT3B0aW9uRWxlbWVudCB7XG5cdFx0Y29uc3Qgb3B0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnb3B0aW9uJyk7XG5cdFx0b3B0aW9uLnZhbHVlID0gdmFsdWU7XG5cdFx0b3B0aW9uLnRleHQgPSB2YWx1ZTtcblx0XHRvcHRpb24uZGlzYWJsZWQgPSAhIWRpc2FibGVkO1xuXG5cdFx0cmV0dXJuIG9wdGlvbjtcblx0fVxuXG5cdC8vIENvbnRleHRWaWV3IGRyb3Bkb3duIG1ldGhvZHNcblxuXHRwcml2YXRlIHNob3dTZWxlY3REcm9wRG93bigpIHtcblx0XHR0aGlzLnNlbGVjdGlvbkRldGFpbHNQYW5lLnRleHRDb250ZW50ID0gJyc7XG5cblx0XHRpZiAoIXRoaXMuY29udGV4dFZpZXdQcm92aWRlciB8fCB0aGlzLl9pc1Zpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBMYXppbHkgY3JlYXRlIGFuZCBwb3B1bGF0ZSBsaXN0IG9ubHkgYXQgb3BlbiwgbW92ZWQgZnJvbSBjb25zdHJ1Y3RvclxuXHRcdHRoaXMuY3JlYXRlU2VsZWN0TGlzdCh0aGlzLnNlbGVjdERyb3BEb3duQ29udGFpbmVyKTtcblx0XHR0aGlzLnNldE9wdGlvbnNMaXN0KCk7XG5cblx0XHQvLyBUaGlzIGFsbG93cyB1cyB0byBmbGlwIHRoZSBwb3NpdGlvbiBiYXNlZCBvbiBtZWFzdXJlbWVudFxuXHRcdC8vIFNldCBkcm9wLWRvd24gcG9zaXRpb24gYWJvdmUvYmVsb3cgZnJvbSByZXF1aXJlZCBoZWlnaHQgYW5kIG1hcmdpbnNcblx0XHQvLyBJZiBwcmUtbGF5b3V0IGNhbm5vdCBmaXQgYXQgbGVhc3Qgb25lIG9wdGlvbiBkbyBub3Qgc2hvdyBkcm9wLWRvd25cblxuXHRcdHRoaXMuY29udGV4dFZpZXdQcm92aWRlci5zaG93Q29udGV4dFZpZXcoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiB0aGlzLnNlbGVjdEVsZW1lbnQsXG5cdFx0XHRyZW5kZXI6IChjb250YWluZXI6IEhUTUxFbGVtZW50KSA9PiB0aGlzLnJlbmRlclNlbGVjdERyb3BEb3duKGNvbnRhaW5lciwgdHJ1ZSksXG5cdFx0XHRsYXlvdXQ6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5sYXlvdXRTZWxlY3REcm9wRG93bigpO1xuXHRcdFx0fSxcblx0XHRcdG9uSGlkZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnNlbGVjdERyb3BEb3duQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ3Zpc2libGUnKTtcblx0XHRcdH0sXG5cdFx0XHRhbmNob3JQb3NpdGlvbjogdGhpcy5fZHJvcERvd25Qb3NpdGlvblxuXHRcdH0sIHRoaXMuc2VsZWN0Qm94T3B0aW9ucy5vcHRpb25zQXNDaGlsZHJlbiA/IHRoaXMuY29udGFpbmVyIDogdW5kZWZpbmVkKTtcblxuXHRcdC8vIEhpZGUgc28gd2UgY2FuIHJlbGF5IG91dFxuXHRcdHRoaXMuX2lzVmlzaWJsZSA9IHRydWU7XG5cdFx0dGhpcy5oaWRlU2VsZWN0RHJvcERvd24oZmFsc2UpO1xuXG5cdFx0dGhpcy5jb250ZXh0Vmlld1Byb3ZpZGVyLnNob3dDb250ZXh0Vmlldyh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IHRoaXMuc2VsZWN0RWxlbWVudCxcblx0XHRcdHJlbmRlcjogKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpID0+IHRoaXMucmVuZGVyU2VsZWN0RHJvcERvd24oY29udGFpbmVyKSxcblx0XHRcdGxheW91dDogKCkgPT4gdGhpcy5sYXlvdXRTZWxlY3REcm9wRG93bigpLFxuXHRcdFx0b25IaWRlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuc2VsZWN0RHJvcERvd25Db250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgndmlzaWJsZScpO1xuXHRcdFx0fSxcblx0XHRcdGFuY2hvclBvc2l0aW9uOiB0aGlzLl9kcm9wRG93blBvc2l0aW9uXG5cdFx0fSwgdGhpcy5zZWxlY3RCb3hPcHRpb25zLm9wdGlvbnNBc0NoaWxkcmVuID8gdGhpcy5jb250YWluZXIgOiB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gVHJhY2sgaW5pdGlhbCBzZWxlY3Rpb24gdGhlIGNhc2UgdXNlciBlc2NhcGUsIGJsdXJcblx0XHR0aGlzLl9jdXJyZW50U2VsZWN0aW9uID0gdGhpcy5zZWxlY3RlZDtcblx0XHR0aGlzLl9pc1Zpc2libGUgPSB0cnVlO1xuXHRcdHRoaXMuc2VsZWN0RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAndHJ1ZScpO1xuXHR9XG5cblx0cHJpdmF0ZSBoaWRlU2VsZWN0RHJvcERvd24oZm9jdXNTZWxlY3Q6IGJvb2xlYW4pIHtcblx0XHRpZiAoIXRoaXMuY29udGV4dFZpZXdQcm92aWRlciB8fCAhdGhpcy5faXNWaXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5faXNWaXNpYmxlID0gZmFsc2U7XG5cdFx0dGhpcy5zZWxlY3RFbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICdmYWxzZScpO1xuXG5cdFx0aWYgKGZvY3VzU2VsZWN0KSB7XG5cdFx0XHR0aGlzLnNlbGVjdEVsZW1lbnQuZm9jdXMoKTtcblx0XHR9XG5cblx0XHR0aGlzLmNvbnRleHRWaWV3UHJvdmlkZXIuaGlkZUNvbnRleHRWaWV3KCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclNlbGVjdERyb3BEb3duKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHByZUxheW91dFBvc2l0aW9uPzogYm9vbGVhbik6IElEaXNwb3NhYmxlIHtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5zZWxlY3REcm9wRG93bkNvbnRhaW5lcik7XG5cblx0XHQvLyBJbmhlcml0IGZvbnQtc2l6ZSBmcm9tIHRoZSBzZWxlY3QgYnV0dG9uIHNvIHRoZSBkcm9wZG93biBtYXRjaGVzXG5cdFx0Y29uc3QgY29tcHV0ZWRGb250U2l6ZSA9IGRvbS5nZXRXaW5kb3codGhpcy5zZWxlY3RFbGVtZW50KS5nZXRDb21wdXRlZFN0eWxlKHRoaXMuc2VsZWN0RWxlbWVudCkuZm9udFNpemU7XG5cdFx0aWYgKGNvbXB1dGVkRm9udFNpemUpIHtcblx0XHRcdHRoaXMuc2VsZWN0RHJvcERvd25Db250YWluZXIuc3R5bGUuZm9udFNpemUgPSBjb21wdXRlZEZvbnRTaXplO1xuXHRcdH1cblxuXHRcdC8vIFByZS1MYXlvdXQgYWxsb3dzIHVzIHRvIGNoYW5nZSBwb3NpdGlvblxuXHRcdHRoaXMubGF5b3V0U2VsZWN0RHJvcERvd24ocHJlTGF5b3V0UG9zaXRpb24pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0Ly8gY29udGV4dFZpZXcgd2lsbCBkaXNwb3NlIGl0c2VsZiBpZiBtb3ZpbmcgZnJvbSBvbmUgVmlldyB0byBhbm90aGVyXG5cdFx0XHRcdHRoaXMuc2VsZWN0RHJvcERvd25Db250YWluZXIucmVtb3ZlKCk7IC8vIHJlbW92ZSB0byB0YWtlIG91dCB0aGUgQ1NTIHJ1bGVzIHdlIGFkZFxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHQvLyBJdGVyYXRlIG92ZXIgZGV0YWlsZWQgZGVzY3JpcHRpb25zLCBmaW5kIG1heCBoZWlnaHRcblx0cHJpdmF0ZSBtZWFzdXJlTWF4RGV0YWlsc0hlaWdodCgpOiBudW1iZXIge1xuXHRcdGxldCBtYXhEZXRhaWxzUGFuZUhlaWdodCA9IDA7XG5cdFx0dGhpcy5vcHRpb25zLmZvckVhY2goKF9vcHRpb24sIGluZGV4KSA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZURldGFpbChpbmRleCk7XG5cblx0XHRcdGlmICh0aGlzLnNlbGVjdGlvbkRldGFpbHNQYW5lLm9mZnNldEhlaWdodCA+IG1heERldGFpbHNQYW5lSGVpZ2h0KSB7XG5cdFx0XHRcdG1heERldGFpbHNQYW5lSGVpZ2h0ID0gdGhpcy5zZWxlY3Rpb25EZXRhaWxzUGFuZS5vZmZzZXRIZWlnaHQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gbWF4RGV0YWlsc1BhbmVIZWlnaHQ7XG5cdH1cblxuXHRwcml2YXRlIGxheW91dFNlbGVjdERyb3BEb3duKHByZUxheW91dFBvc2l0aW9uPzogYm9vbGVhbik6IGJvb2xlYW4ge1xuXG5cdFx0Ly8gQXZvaWQgcmVjdXJzaW9uIGZyb20gbGF5b3V0IGNhbGxlZCBpbiBvbkxpc3RGb2N1c1xuXHRcdGlmICh0aGlzLl9za2lwTGF5b3V0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gTGF5b3V0IENvbnRleHRWaWV3IGRyb3AgZG93biBzZWxlY3QgbGlzdCBhbmQgY29udGFpbmVyXG5cdFx0Ly8gSGF2ZSB0byBtYW5hZ2Ugb3VyIHZlcnRpY2FsIG92ZXJmbG93LCBzaXppbmcsIHBvc2l0aW9uIGJlbG93IG9yIGFib3ZlXG5cdFx0Ly8gUG9zaXRpb24gaGFzIHRvIGJlIGRldGVybWluZWQgYW5kIHNldCBwcmlvciB0byBjb250ZXh0VmlldyBpbnN0YW50aWF0aW9uXG5cblx0XHRpZiAodGhpcy5zZWxlY3RMaXN0KSB7XG5cblx0XHRcdC8vIE1ha2UgdmlzaWJsZSB0byBlbmFibGUgbWVhc3VyZW1lbnRzXG5cdFx0XHR0aGlzLnNlbGVjdERyb3BEb3duQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3Zpc2libGUnKTtcblxuXHRcdFx0Y29uc3Qgd2luZG93ID0gZG9tLmdldFdpbmRvdyh0aGlzLnNlbGVjdEVsZW1lbnQpO1xuXHRcdFx0Y29uc3Qgc2VsZWN0UG9zaXRpb24gPSBkb20uZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbih0aGlzLnNlbGVjdEVsZW1lbnQpO1xuXHRcdFx0Y29uc3QgbWF4U2VsZWN0RHJvcERvd25IZWlnaHRCZWxvdyA9ICh3aW5kb3cuaW5uZXJIZWlnaHQgLSBzZWxlY3RQb3NpdGlvbi50b3AgLSBzZWxlY3RQb3NpdGlvbi5oZWlnaHQgLSAodGhpcy5zZWxlY3RCb3hPcHRpb25zLm1pbkJvdHRvbU1hcmdpbiB8fCAwKSk7XG5cdFx0XHRjb25zdCBtYXhTZWxlY3REcm9wRG93bkhlaWdodEFib3ZlID0gKHNlbGVjdFBvc2l0aW9uLnRvcCAtIFNlbGVjdEJveExpc3QuREVGQVVMVF9EUk9QRE9XTl9NSU5JTVVNX1RPUF9NQVJHSU4pO1xuXG5cdFx0XHQvLyBEZXRlcm1pbmUgb3B0aW1hbCB3aWR0aCAtIG1pbihsb25nZXN0IG9wdGlvbiksIG9wdChwYXJlbnQgc2VsZWN0LCBleGNsdWRpbmcgbWFyZ2lucyksIG1heChDb250ZXh0VmlldyBjb250cm9sbGVkKVxuXHRcdFx0Y29uc3Qgc2VsZWN0V2lkdGggPSB0aGlzLnNlbGVjdEVsZW1lbnQub2Zmc2V0V2lkdGg7XG5cdFx0XHRjb25zdCBzZWxlY3RNaW5XaWR0aCA9IHRoaXMuc2V0V2lkdGhDb250cm9sRWxlbWVudCh0aGlzLndpZHRoQ29udHJvbEVsZW1lbnQpO1xuXHRcdFx0Y29uc3Qgc2VsZWN0T3B0aW1hbFdpZHRoID0gYCR7TWF0aC5tYXgoc2VsZWN0TWluV2lkdGgsIE1hdGgucm91bmQoc2VsZWN0V2lkdGgpKX1weGA7XG5cblx0XHRcdHRoaXMuc2VsZWN0RHJvcERvd25Db250YWluZXIuc3R5bGUud2lkdGggPSBzZWxlY3RPcHRpbWFsV2lkdGg7XG5cblx0XHRcdC8vIEdldCBpbml0aWFsIGxpc3QgaGVpZ2h0IGFuZCBkZXRlcm1pbmUgc3BhY2UgYWJvdmUgYW5kIGJlbG93XG5cdFx0XHR0aGlzLnNlbGVjdExpc3QuZ2V0SFRNTEVsZW1lbnQoKS5zdHlsZS5oZWlnaHQgPSAnJztcblx0XHRcdHRoaXMuc2VsZWN0TGlzdC5sYXlvdXQoKTtcblx0XHRcdGxldCBsaXN0SGVpZ2h0ID0gdGhpcy5zZWxlY3RMaXN0LmNvbnRlbnRIZWlnaHQ7XG5cblx0XHRcdGlmICh0aGlzLl9oYXNEZXRhaWxzICYmIHRoaXMuX2NhY2hlZE1heERldGFpbHNIZWlnaHQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLl9jYWNoZWRNYXhEZXRhaWxzSGVpZ2h0ID0gdGhpcy5tZWFzdXJlTWF4RGV0YWlsc0hlaWdodCgpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbWF4RGV0YWlsc1BhbmVIZWlnaHQgPSB0aGlzLl9oYXNEZXRhaWxzID8gdGhpcy5fY2FjaGVkTWF4RGV0YWlsc0hlaWdodCEgOiAwO1xuXG5cdFx0XHRjb25zdCBtaW5SZXF1aXJlZERyb3BEb3duSGVpZ2h0ID0gbGlzdEhlaWdodCArIG1heERldGFpbHNQYW5lSGVpZ2h0O1xuXHRcdFx0Y29uc3QgbWF4VmlzaWJsZU9wdGlvbnNCZWxvdyA9ICgoTWF0aC5mbG9vcigobWF4U2VsZWN0RHJvcERvd25IZWlnaHRCZWxvdyAtIG1heERldGFpbHNQYW5lSGVpZ2h0KSAvIHRoaXMuZ2V0SGVpZ2h0KCkpKSk7XG5cdFx0XHRjb25zdCBtYXhWaXNpYmxlT3B0aW9uc0Fib3ZlID0gKChNYXRoLmZsb29yKChtYXhTZWxlY3REcm9wRG93bkhlaWdodEFib3ZlIC0gbWF4RGV0YWlsc1BhbmVIZWlnaHQpIC8gdGhpcy5nZXRIZWlnaHQoKSkpKTtcblxuXHRcdFx0Ly8gSWYgd2UgYXJlIG9ubHkgZG9pbmcgcHJlLWxheW91dCBjaGVjay9hZGp1c3QgcG9zaXRpb24gb25seVxuXHRcdFx0Ly8gQ2FsY3VsYXRlIHZlcnRpY2FsIHNwYWNlIGF2YWlsYWJsZSwgZmxpcCB1cCBpZiBpbnN1ZmZpY2llbnRcblx0XHRcdC8vIFVzZSByZWZsZWN0ZWQgcGFkZGluZyBvbiBwYXJlbnQgc2VsZWN0LCBDb250ZXh0VmlldyBzdHlsZVxuXHRcdFx0Ly8gcHJvcGVydGllcyBub3QgYXZhaWxhYmxlIGJlZm9yZSBET00gYXR0YWNobWVudFxuXG5cdFx0XHRpZiAocHJlTGF5b3V0UG9zaXRpb24pIHtcblxuXHRcdFx0XHQvLyBDaGVjayBpZiBzZWxlY3QgbW92ZWQgb3V0IG9mIHZpZXdwb3J0ICwgZG8gbm90IG9wZW5cblx0XHRcdFx0Ly8gSWYgYXQgbGVhc3Qgb25lIG9wdGlvbiBjYW5ub3QgYmUgc2hvd24sIGRvbid0IG9wZW4gdGhlIGRyb3AtZG93biBvciBoaWRlL3JlbW92ZSBpZiBvcGVuXG5cblx0XHRcdFx0aWYgKChzZWxlY3RQb3NpdGlvbi50b3AgKyBzZWxlY3RQb3NpdGlvbi5oZWlnaHQpID4gKHdpbmRvdy5pbm5lckhlaWdodCAtIDIyKVxuXHRcdFx0XHRcdHx8IHNlbGVjdFBvc2l0aW9uLnRvcCA8IFNlbGVjdEJveExpc3QuREVGQVVMVF9EUk9QRE9XTl9NSU5JTVVNX1RPUF9NQVJHSU5cblx0XHRcdFx0XHR8fCAoKG1heFZpc2libGVPcHRpb25zQmVsb3cgPCAxKSAmJiAobWF4VmlzaWJsZU9wdGlvbnNBYm92ZSA8IDEpKSkge1xuXHRcdFx0XHRcdC8vIEluZGljYXRlIHdlIGNhbm5vdCBvcGVuXG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRGV0ZXJtaW5lIGlmIHdlIGhhdmUgdG8gZmxpcCB1cFxuXHRcdFx0XHQvLyBBbHdheXMgc2hvdyBjb21wbGV0ZSBsaXN0IGl0ZW1zIC0gbmV2ZXIgbW9yZSB0aGFuIE1heCBhdmFpbGFibGUgdmVydGljYWwgaGVpZ2h0XG5cdFx0XHRcdGlmIChtYXhWaXNpYmxlT3B0aW9uc0JlbG93IDwgU2VsZWN0Qm94TGlzdC5ERUZBVUxUX01JTklNVU1fVklTSUJMRV9PUFRJT05TXG5cdFx0XHRcdFx0JiYgbWF4VmlzaWJsZU9wdGlvbnNBYm92ZSA+IG1heFZpc2libGVPcHRpb25zQmVsb3dcblx0XHRcdFx0XHQmJiB0aGlzLm9wdGlvbnMubGVuZ3RoID4gbWF4VmlzaWJsZU9wdGlvbnNCZWxvd1xuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHR0aGlzLl9kcm9wRG93blBvc2l0aW9uID0gQW5jaG9yUG9zaXRpb24uQUJPVkU7XG5cdFx0XHRcdFx0dGhpcy5zZWxlY3REcm9wRG93bkxpc3RDb250YWluZXIucmVtb3ZlKCk7XG5cdFx0XHRcdFx0dGhpcy5zZWxlY3Rpb25EZXRhaWxzUGFuZS5yZW1vdmUoKTtcblx0XHRcdFx0XHR0aGlzLnNlbGVjdERyb3BEb3duQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuc2VsZWN0aW9uRGV0YWlsc1BhbmUpO1xuXHRcdFx0XHRcdHRoaXMuc2VsZWN0RHJvcERvd25Db250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5zZWxlY3REcm9wRG93bkxpc3RDb250YWluZXIpO1xuXG5cdFx0XHRcdFx0dGhpcy5zZWxlY3Rpb25EZXRhaWxzUGFuZS5jbGFzc0xpc3QucmVtb3ZlKCdib3JkZXItdG9wJyk7XG5cdFx0XHRcdFx0dGhpcy5zZWxlY3Rpb25EZXRhaWxzUGFuZS5jbGFzc0xpc3QuYWRkKCdib3JkZXItYm90dG9tJyk7XG5cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9kcm9wRG93blBvc2l0aW9uID0gQW5jaG9yUG9zaXRpb24uQkVMT1c7XG5cdFx0XHRcdFx0dGhpcy5zZWxlY3REcm9wRG93bkxpc3RDb250YWluZXIucmVtb3ZlKCk7XG5cdFx0XHRcdFx0dGhpcy5zZWxlY3Rpb25EZXRhaWxzUGFuZS5yZW1vdmUoKTtcblx0XHRcdFx0XHR0aGlzLnNlbGVjdERyb3BEb3duQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuc2VsZWN0RHJvcERvd25MaXN0Q29udGFpbmVyKTtcblx0XHRcdFx0XHR0aGlzLnNlbGVjdERyb3BEb3duQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuc2VsZWN0aW9uRGV0YWlsc1BhbmUpO1xuXG5cdFx0XHRcdFx0dGhpcy5zZWxlY3Rpb25EZXRhaWxzUGFuZS5jbGFzc0xpc3QucmVtb3ZlKCdib3JkZXItYm90dG9tJyk7XG5cdFx0XHRcdFx0dGhpcy5zZWxlY3Rpb25EZXRhaWxzUGFuZS5jbGFzc0xpc3QuYWRkKCdib3JkZXItdG9wJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gRG8gZnVsbCBsYXlvdXQgb24gc2hvd1NlbGVjdERyb3BEb3duIG9ubHlcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENoZWNrIGlmIHNlbGVjdCBvdXQgb2Ygdmlld3BvcnQgb3IgY3V0dGluZyBpbnRvIHN0YXR1cyBiYXJcblx0XHRcdGlmICgoc2VsZWN0UG9zaXRpb24udG9wICsgc2VsZWN0UG9zaXRpb24uaGVpZ2h0KSA+ICh3aW5kb3cuaW5uZXJIZWlnaHQgLSAyMilcblx0XHRcdFx0fHwgc2VsZWN0UG9zaXRpb24udG9wIDwgU2VsZWN0Qm94TGlzdC5ERUZBVUxUX0RST1BET1dOX01JTklNVU1fVE9QX01BUkdJTlxuXHRcdFx0XHR8fCAodGhpcy5fZHJvcERvd25Qb3NpdGlvbiA9PT0gQW5jaG9yUG9zaXRpb24uQkVMT1cgJiYgbWF4VmlzaWJsZU9wdGlvbnNCZWxvdyA8IDEpXG5cdFx0XHRcdHx8ICh0aGlzLl9kcm9wRG93blBvc2l0aW9uID09PSBBbmNob3JQb3NpdGlvbi5BQk9WRSAmJiBtYXhWaXNpYmxlT3B0aW9uc0Fib3ZlIDwgMSkpIHtcblx0XHRcdFx0Ly8gQ2Fubm90IHByb3Blcmx5IGxheW91dCwgY2xvc2UgYW5kIGhpZGVcblx0XHRcdFx0dGhpcy5oaWRlU2VsZWN0RHJvcERvd24odHJ1ZSk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2V0VXAgbGlzdCBkaW1lbnNpb25zIGFuZCBsYXlvdXQgLSBhY2NvdW50IGZvciBjb250YWluZXIgcGFkZGluZ1xuXHRcdFx0Ly8gVXNlIHBvc2l0aW9uIHRvIGNoZWNrIGFib3ZlIG9yIGJlbG93IGF2YWlsYWJsZSBzcGFjZVxuXHRcdFx0aWYgKHRoaXMuX2Ryb3BEb3duUG9zaXRpb24gPT09IEFuY2hvclBvc2l0aW9uLkJFTE9XKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9pc1Zpc2libGUgJiYgbWF4VmlzaWJsZU9wdGlvbnNCZWxvdyArIG1heFZpc2libGVPcHRpb25zQWJvdmUgPCAxKSB7XG5cdFx0XHRcdFx0Ly8gSWYgZHJvcC1kb3duIGlzIHZpc2libGUsIG11c3QgYmUgZG9pbmcgYSBET00gcmUtbGF5b3V0LCBoaWRlIHNpbmNlIHdlIGRvbid0IGZpdFxuXHRcdFx0XHRcdC8vIEhpZGUgZHJvcC1kb3duLCBoaWRlIGNvbnRleHR2aWV3LCBmb2N1cyBvbiBwYXJlbnQgc2VsZWN0XG5cdFx0XHRcdFx0dGhpcy5oaWRlU2VsZWN0RHJvcERvd24odHJ1ZSk7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQWRqdXN0IGxpc3QgaGVpZ2h0IHRvIG1heCBmcm9tIHNlbGVjdCBib3R0b20gdG8gbWFyZ2luIChkZWZhdWx0L21pbkJvdHRvbU1hcmdpbilcblx0XHRcdFx0aWYgKG1pblJlcXVpcmVkRHJvcERvd25IZWlnaHQgPiBtYXhTZWxlY3REcm9wRG93bkhlaWdodEJlbG93KSB7XG5cdFx0XHRcdFx0bGlzdEhlaWdodCA9IChtYXhWaXNpYmxlT3B0aW9uc0JlbG93ICogdGhpcy5nZXRIZWlnaHQoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChtaW5SZXF1aXJlZERyb3BEb3duSGVpZ2h0ID4gbWF4U2VsZWN0RHJvcERvd25IZWlnaHRBYm92ZSkge1xuXHRcdFx0XHRcdGxpc3RIZWlnaHQgPSAobWF4VmlzaWJsZU9wdGlvbnNBYm92ZSAqIHRoaXMuZ2V0SGVpZ2h0KCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNldCBhZGp1c3RlZCBsaXN0IGhlaWdodCBhbmQgcmVsYXlvdXRcblx0XHRcdHRoaXMuc2VsZWN0TGlzdC5sYXlvdXQobGlzdEhlaWdodCk7XG5cdFx0XHR0aGlzLnNlbGVjdExpc3QuZG9tRm9jdXMoKTtcblxuXHRcdFx0Ly8gRmluYWxseSBzZXQgZm9jdXMgb24gc2VsZWN0ZWQgaXRlbVxuXHRcdFx0aWYgKHRoaXMuc2VsZWN0TGlzdC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuc2VsZWN0TGlzdC5zZXRGb2N1cyhbdGhpcy5zZWxlY3RlZCB8fCAwXSk7XG5cdFx0XHRcdHRoaXMuc2VsZWN0TGlzdC5yZXZlYWwodGhpcy5zZWxlY3RMaXN0LmdldEZvY3VzKClbMF0gfHwgMCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9oYXNEZXRhaWxzKSB7XG5cdFx0XHRcdC8vIExlYXZlIHRoZSBzZWxlY3REcm9wRG93bkNvbnRhaW5lciB0byBzaXplIGl0c2VsZiBhY2NvcmRpbmcgdG8gY2hpbGRyZW4gKGxpc3QgKyBkZXRhaWxzKSAtICM1NzQ0N1xuXHRcdFx0XHR0aGlzLnNlbGVjdExpc3QuZ2V0SFRNTEVsZW1lbnQoKS5zdHlsZS5oZWlnaHQgPSBgJHtsaXN0SGVpZ2h0fXB4YDtcblx0XHRcdFx0dGhpcy5zZWxlY3REcm9wRG93bkNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSAnJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuc2VsZWN0RHJvcERvd25Db250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7bGlzdEhlaWdodH1weGA7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudXBkYXRlRGV0YWlsKHRoaXMuc2VsZWN0ZWQpO1xuXG5cdFx0XHR0aGlzLnNlbGVjdERyb3BEb3duQ29udGFpbmVyLnN0eWxlLndpZHRoID0gc2VsZWN0T3B0aW1hbFdpZHRoO1xuXHRcdFx0dGhpcy5zZWxlY3REcm9wRG93bkxpc3RDb250YWluZXIuc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICcwJyk7XG5cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXRXaWR0aENvbnRyb2xFbGVtZW50KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBudW1iZXIge1xuXHRcdGxldCBlbGVtZW50V2lkdGggPSAwO1xuXG5cdFx0aWYgKGNvbnRhaW5lcikge1xuXHRcdFx0bGV0IGxvbmdlc3QgPSAwO1xuXHRcdFx0bGV0IGxvbmdlc3RMZW5ndGggPSAwO1xuXG5cdFx0XHR0aGlzLm9wdGlvbnMuZm9yRWFjaCgob3B0aW9uLCBpbmRleCkgPT4ge1xuXHRcdFx0XHRjb25zdCBkZXRhaWxMZW5ndGggPSAhIW9wdGlvbi5kZXRhaWwgPyBvcHRpb24uZGV0YWlsLmxlbmd0aCA6IDA7XG5cdFx0XHRcdGNvbnN0IHJpZ2h0RGVjb3JhdG9yTGVuZ3RoID0gISFvcHRpb24uZGVjb3JhdG9yUmlnaHQgPyBvcHRpb24uZGVjb3JhdG9yUmlnaHQubGVuZ3RoIDogMDtcblxuXHRcdFx0XHRjb25zdCBsZW4gPSBvcHRpb24udGV4dC5sZW5ndGggKyBkZXRhaWxMZW5ndGggKyByaWdodERlY29yYXRvckxlbmd0aDtcblx0XHRcdFx0aWYgKGxlbiA+IGxvbmdlc3RMZW5ndGgpIHtcblx0XHRcdFx0XHRsb25nZXN0ID0gaW5kZXg7XG5cdFx0XHRcdFx0bG9uZ2VzdExlbmd0aCA9IGxlbjtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblxuXHRcdFx0Y29udGFpbmVyLnRleHRDb250ZW50ID0gdGhpcy5vcHRpb25zW2xvbmdlc3RdLnRleHQgKyAoISF0aGlzLm9wdGlvbnNbbG9uZ2VzdF0uZGVjb3JhdG9yUmlnaHQgPyBgJHt0aGlzLm9wdGlvbnNbbG9uZ2VzdF0uZGVjb3JhdG9yUmlnaHR9IGAgOiAnJyk7XG5cdFx0XHRlbGVtZW50V2lkdGggPSBkb20uZ2V0VG90YWxXaWR0aChjb250YWluZXIpO1xuXHRcdH1cblxuXHRcdHJldHVybiBlbGVtZW50V2lkdGg7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVNlbGVjdExpc3QocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXG5cdFx0Ly8gSWYgd2UgaGF2ZSBhbHJlYWR5IGNvbnN0cnVjdGl2ZSBsaXN0IG9uIG9wZW4sIHNraXBcblx0XHRpZiAodGhpcy5zZWxlY3RMaXN0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU2V0VXAgY29udGFpbmVyIGZvciBsaXN0XG5cdFx0dGhpcy5zZWxlY3REcm9wRG93bkxpc3RDb250YWluZXIgPSBkb20uYXBwZW5kKHBhcmVudCwgJCgnLnNlbGVjdC1ib3gtZHJvcGRvd24tbGlzdC1jb250YWluZXInKSk7XG5cblx0XHR0aGlzLmxpc3RSZW5kZXJlciA9IG5ldyBTZWxlY3RMaXN0UmVuZGVyZXIoKTtcblxuXHRcdHRoaXMuc2VsZWN0TGlzdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBMaXN0KCdTZWxlY3RCb3hDdXN0b20nLCB0aGlzLnNlbGVjdERyb3BEb3duTGlzdENvbnRhaW5lciwgdGhpcywgW3RoaXMubGlzdFJlbmRlcmVyXSwge1xuXHRcdFx0dXNlU2hhZG93czogZmFsc2UsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbE1vZGU6IFNjcm9sbGJhclZpc2liaWxpdHkuVmlzaWJsZSxcblx0XHRcdGtleWJvYXJkU3VwcG9ydDogZmFsc2UsXG5cdFx0XHRtb3VzZVN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdGdldEFyaWFMYWJlbDogZWxlbWVudCA9PiB7XG5cdFx0XHRcdFx0aWYgKGVsZW1lbnQuaXNTZXBhcmF0b3IpIHtcblx0XHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc2VsZWN0Qm94U2VwYXJhdG9yJywgXCJzZXBhcmF0b3JcIik7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0bGV0IGxhYmVsID0gZWxlbWVudC50ZXh0O1xuXHRcdFx0XHRcdGlmIChlbGVtZW50LmRldGFpbCkge1xuXHRcdFx0XHRcdFx0bGFiZWwgKz0gYC4gJHtlbGVtZW50LmRldGFpbH1gO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChlbGVtZW50LmRlY29yYXRvclJpZ2h0KSB7XG5cdFx0XHRcdFx0XHRsYWJlbCArPSBgLiAke2VsZW1lbnQuZGVjb3JhdG9yUmlnaHR9YDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoZWxlbWVudC5kZXNjcmlwdGlvbikge1xuXHRcdFx0XHRcdFx0bGFiZWwgKz0gYC4gJHtlbGVtZW50LmRlc2NyaXB0aW9ufWA7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIGxhYmVsO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWw6ICgpID0+IGxvY2FsaXplKHsga2V5OiAnc2VsZWN0Qm94JywgY29tbWVudDogWydCZWhhdmUgbGlrZSBuYXRpdmUgc2VsZWN0IGRyb3Bkb3duIGVsZW1lbnQuJ10gfSwgXCJTZWxlY3QgQm94XCIpLFxuXHRcdFx0XHRnZXRSb2xlOiAoKSA9PiBpc01hY2ludG9zaCA/ICcnIDogJ29wdGlvbicsXG5cdFx0XHRcdGdldFdpZGdldFJvbGU6ICgpID0+ICdsaXN0Ym94J1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRpZiAodGhpcy5zZWxlY3RCb3hPcHRpb25zLmFyaWFMYWJlbCkge1xuXHRcdFx0dGhpcy5zZWxlY3RMaXN0LmFyaWFMYWJlbCA9IHRoaXMuc2VsZWN0Qm94T3B0aW9ucy5hcmlhTGFiZWw7XG5cdFx0fVxuXG5cdFx0Ly8gU2V0VXAgbGlzdCBrZXlib2FyZCBjb250cm9sbGVyIC0gY29udHJvbCBuYXZpZ2F0aW9uLCBkaXNhYmxlZCBpdGVtcywgZm9jdXNcblx0XHRjb25zdCBvbktleURvd24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRG9tRW1pdHRlcih0aGlzLnNlbGVjdERyb3BEb3duTGlzdENvbnRhaW5lciwgJ2tleWRvd24nKSk7XG5cdFx0Y29uc3Qgb25TZWxlY3REcm9wRG93bktleURvd24gPSBFdmVudC5jaGFpbihvbktleURvd24uZXZlbnQsICQgPT5cblx0XHRcdCQuZmlsdGVyKCgpID0+IHRoaXMuc2VsZWN0TGlzdC5sZW5ndGggPiAwKVxuXHRcdFx0XHQubWFwKGUgPT4gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKSlcblx0XHQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuY2hhaW4ob25TZWxlY3REcm9wRG93bktleURvd24sICQgPT4gJC5maWx0ZXIoZSA9PiBlLmtleUNvZGUgPT09IEtleUNvZGUuRW50ZXIpKSh0aGlzLm9uRW50ZXIsIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5jaGFpbihvblNlbGVjdERyb3BEb3duS2V5RG93biwgJCA9PiAkLmZpbHRlcihlID0+IGUua2V5Q29kZSA9PT0gS2V5Q29kZS5UYWIpKSh0aGlzLm9uRW50ZXIsIHRoaXMpKTsgLy8gVGFiIHNob3VsZCBiZWhhdmUgdGhlIHNhbWUgYXMgZW50ZXIsICM3OTMzOVxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmNoYWluKG9uU2VsZWN0RHJvcERvd25LZXlEb3duLCAkID0+ICQuZmlsdGVyKGUgPT4gZS5rZXlDb2RlID09PSBLZXlDb2RlLkVzY2FwZSkpKHRoaXMub25Fc2NhcGUsIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5jaGFpbihvblNlbGVjdERyb3BEb3duS2V5RG93biwgJCA9PiAkLmZpbHRlcihlID0+IGUua2V5Q29kZSA9PT0gS2V5Q29kZS5VcEFycm93KSkodGhpcy5vblVwQXJyb3csIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5jaGFpbihvblNlbGVjdERyb3BEb3duS2V5RG93biwgJCA9PiAkLmZpbHRlcihlID0+IGUua2V5Q29kZSA9PT0gS2V5Q29kZS5Eb3duQXJyb3cpKSh0aGlzLm9uRG93bkFycm93LCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuY2hhaW4ob25TZWxlY3REcm9wRG93bktleURvd24sICQgPT4gJC5maWx0ZXIoZSA9PiBlLmtleUNvZGUgPT09IEtleUNvZGUuUGFnZURvd24pKSh0aGlzLm9uUGFnZURvd24sIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5jaGFpbihvblNlbGVjdERyb3BEb3duS2V5RG93biwgJCA9PiAkLmZpbHRlcihlID0+IGUua2V5Q29kZSA9PT0gS2V5Q29kZS5QYWdlVXApKSh0aGlzLm9uUGFnZVVwLCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuY2hhaW4ob25TZWxlY3REcm9wRG93bktleURvd24sICQgPT4gJC5maWx0ZXIoZSA9PiBlLmtleUNvZGUgPT09IEtleUNvZGUuSG9tZSkpKHRoaXMub25Ib21lLCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuY2hhaW4ob25TZWxlY3REcm9wRG93bktleURvd24sICQgPT4gJC5maWx0ZXIoZSA9PiBlLmtleUNvZGUgPT09IEtleUNvZGUuRW5kKSkodGhpcy5vbkVuZCwgdGhpcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmNoYWluKG9uU2VsZWN0RHJvcERvd25LZXlEb3duLCAkID0+ICQuZmlsdGVyKGUgPT4gKGUua2V5Q29kZSA+PSBLZXlDb2RlLkRpZ2l0MCAmJiBlLmtleUNvZGUgPD0gS2V5Q29kZS5LZXlaKSB8fCAoZS5rZXlDb2RlID49IEtleUNvZGUuU2VtaWNvbG9uICYmIGUua2V5Q29kZSA8PSBLZXlDb2RlLk51bXBhZERpdmlkZSkpKSh0aGlzLm9uQ2hhcmFjdGVyLCB0aGlzKSk7XG5cblx0XHQvLyBTZXRVcCBsaXN0IG1vdXNlIGNvbnRyb2xsZXIgLSBjb250cm9sIG5hdmlnYXRpb24sIGRpc2FibGVkIGl0ZW1zLCBmb2N1c1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5zZWxlY3RMaXN0LmdldEhUTUxFbGVtZW50KCksIGRvbS5FdmVudFR5cGUuUE9JTlRFUl9VUCwgZSA9PiB0aGlzLm9uUG9pbnRlclVwKGUpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlbGVjdExpc3Qub25Nb3VzZU92ZXIoZSA9PiB0eXBlb2YgZS5pbmRleCAhPT0gJ3VuZGVmaW5lZCcgJiYgIXRoaXMub3B0aW9uc1tlLmluZGV4XT8uaXNEaXNhYmxlZCAmJiB0aGlzLnNlbGVjdExpc3Quc2V0Rm9jdXMoW2UuaW5kZXhdKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2VsZWN0TGlzdC5vbkRpZENoYW5nZUZvY3VzKGUgPT4gdGhpcy5vbkxpc3RGb2N1cyhlKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnNlbGVjdERyb3BEb3duQ29udGFpbmVyLCBkb20uRXZlbnRUeXBlLkZPQ1VTX09VVCwgZSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2lzVmlzaWJsZSB8fCBkb20uaXNBbmNlc3RvcihlLnJlbGF0ZWRUYXJnZXQgYXMgSFRNTEVsZW1lbnQsIHRoaXMuc2VsZWN0RHJvcERvd25Db250YWluZXIpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMub25MaXN0Qmx1cigpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuc2VsZWN0TGlzdC5nZXRIVE1MRWxlbWVudCgpLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRoaXMuc2VsZWN0Qm94T3B0aW9ucy5hcmlhTGFiZWwgfHwgJycpO1xuXHRcdHRoaXMuc2VsZWN0TGlzdC5nZXRIVE1MRWxlbWVudCgpLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICd0cnVlJyk7XG5cblx0XHR0aGlzLnN0eWxlTGlzdCgpO1xuXHR9XG5cblx0Ly8gTGlzdCBtZXRob2RzXG5cblx0Ly8gTGlzdCBtb3VzZSBjb250cm9sbGVyIC0gYWN0aXZlIGV4aXQsIHNlbGVjdCBvcHRpb24sIGZpcmUgb25EaWRTZWxlY3QgaWYgY2hhbmdlLCByZXR1cm4gZm9jdXMgdG8gcGFyZW50IHNlbGVjdFxuXHQvLyBBbHNvIHRha2VzIGluIHRvdWNoZW5kIGV2ZW50c1xuXHRwcml2YXRlIG9uUG9pbnRlclVwKGU6IFBvaW50ZXJFdmVudCk6IHZvaWQge1xuXG5cdFx0aWYgKCF0aGlzLnNlbGVjdExpc3QubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSk7XG5cblx0XHRjb25zdCB0YXJnZXQgPSA8RWxlbWVudD5lLnRhcmdldDtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIG91ciBtb3VzZSBldmVudCBpcyBvbiBhbiBvcHRpb24gKG5vdCBzY3JvbGxiYXIpXG5cdFx0aWYgKHRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ3NsaWRlcicpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGlzdFJvd0VsZW1lbnQgPSB0YXJnZXQuY2xvc2VzdCgnLm1vbmFjby1saXN0LXJvdycpO1xuXG5cdFx0aWYgKCFsaXN0Um93RWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpbmRleCA9IE51bWJlcihsaXN0Um93RWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtaW5kZXgnKSk7XG5cdFx0Y29uc3QgZGlzYWJsZWQgPSBsaXN0Um93RWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ29wdGlvbi1kaXNhYmxlZCcpO1xuXG5cdFx0Ly8gSWdub3JlIG1vdXNlIHNlbGVjdGlvbiBvZiBkaXNhYmxlZCBvcHRpb25zXG5cdFx0aWYgKGluZGV4ID49IDAgJiYgaW5kZXggPCB0aGlzLm9wdGlvbnMubGVuZ3RoICYmICFkaXNhYmxlZCkge1xuXHRcdFx0dGhpcy5zZWxlY3RlZCA9IGluZGV4O1xuXHRcdFx0dGhpcy5zZWxlY3QodGhpcy5zZWxlY3RlZCk7XG5cblx0XHRcdHRoaXMuc2VsZWN0TGlzdC5zZXRGb2N1cyhbdGhpcy5zZWxlY3RlZF0pO1xuXHRcdFx0dGhpcy5zZWxlY3RMaXN0LnJldmVhbCh0aGlzLnNlbGVjdExpc3QuZ2V0Rm9jdXMoKVswXSk7XG5cblx0XHRcdC8vIE9ubHkgZmlyZSBpZiBzZWxlY3Rpb24gY2hhbmdlXG5cdFx0XHRpZiAodGhpcy5zZWxlY3RlZCAhPT0gdGhpcy5fY3VycmVudFNlbGVjdGlvbikge1xuXHRcdFx0XHQvLyBTZXQgY3VycmVudCA9IHNlbGVjdGVkXG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRTZWxlY3Rpb24gPSB0aGlzLnNlbGVjdGVkO1xuXG5cdFx0XHRcdHRoaXMuX29uRGlkU2VsZWN0LmZpcmUoe1xuXHRcdFx0XHRcdGluZGV4OiB0aGlzLnNlbGVjdEVsZW1lbnQuc2VsZWN0ZWRJbmRleCxcblx0XHRcdFx0XHRzZWxlY3RlZDogdGhpcy5vcHRpb25zW3RoaXMuc2VsZWN0ZWRdLnRleHRcblxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKCEhdGhpcy5vcHRpb25zW3RoaXMuc2VsZWN0ZWRdICYmICEhdGhpcy5vcHRpb25zW3RoaXMuc2VsZWN0ZWRdLnRleHQpIHtcblx0XHRcdFx0XHR0aGlzLnNldFRpdGxlKHRoaXMub3B0aW9uc1t0aGlzLnNlbGVjdGVkXS50ZXh0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmhpZGVTZWxlY3REcm9wRG93bih0cnVlKTtcblx0XHR9XG5cdH1cblxuXHQvLyBMaXN0IEV4aXQgLSBwYXNzaXZlIC0gaW1wbGljaXQgbm8gc2VsZWN0aW9uIGNoYW5nZSwgaGlkZSBkcm9wLWRvd25cblx0cHJpdmF0ZSBvbkxpc3RCbHVyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGlja3kpIHsgcmV0dXJuOyB9XG5cdFx0aWYgKHRoaXMuc2VsZWN0ZWQgIT09IHRoaXMuX2N1cnJlbnRTZWxlY3Rpb24pIHtcblx0XHRcdC8vIFJlc2V0IHNlbGVjdGVkIHRvIGN1cnJlbnQgaWYgbm8gY2hhbmdlXG5cdFx0XHR0aGlzLnNlbGVjdCh0aGlzLl9jdXJyZW50U2VsZWN0aW9uKTtcblx0XHR9XG5cblx0XHR0aGlzLmhpZGVTZWxlY3REcm9wRG93bihmYWxzZSk7XG5cdH1cblxuXG5cdHByaXZhdGUgcmVuZGVyRGVzY3JpcHRpb25NYXJrZG93bih0ZXh0OiBzdHJpbmcsIGFjdGlvbkhhbmRsZXI/OiBNYXJrZG93bkFjdGlvbkhhbmRsZXIpOiBJUmVuZGVyZWRNYXJrZG93biB7XG5cdFx0Y29uc3QgY2xlYW5SZW5kZXJlZE1hcmtkb3duID0gKGVsZW1lbnQ6IE5vZGUpID0+IHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZWxlbWVudC5jaGlsZE5vZGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGNoaWxkID0gPEVsZW1lbnQ+ZWxlbWVudC5jaGlsZE5vZGVzLml0ZW0oaSk7XG5cblx0XHRcdFx0Y29uc3QgdGFnTmFtZSA9IGNoaWxkLnRhZ05hbWUgJiYgY2hpbGQudGFnTmFtZS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRpZiAodGFnTmFtZSA9PT0gJ2ltZycpIHtcblx0XHRcdFx0XHRjaGlsZC5yZW1vdmUoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjbGVhblJlbmRlcmVkTWFya2Rvd24oY2hpbGQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlbmRlcmVkID0gcmVuZGVyTWFya2Rvd24oeyB2YWx1ZTogdGV4dCwgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfSwgeyBhY3Rpb25IYW5kbGVyIH0pO1xuXG5cdFx0cmVuZGVyZWQuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdzZWxlY3QtYm94LWRlc2NyaXB0aW9uLW1hcmtkb3duJyk7XG5cdFx0Y2xlYW5SZW5kZXJlZE1hcmtkb3duKHJlbmRlcmVkLmVsZW1lbnQpO1xuXG5cdFx0cmV0dXJuIHJlbmRlcmVkO1xuXHR9XG5cblx0Ly8gTGlzdCBGb2N1cyBDaGFuZ2UgLSBwYXNzaXZlIC0gdXBkYXRlIGRldGFpbHMgcGFuZSB3aXRoIG5ld2x5IGZvY3VzZWQgZWxlbWVudCdzIGRhdGFcblx0cHJpdmF0ZSBvbkxpc3RGb2N1cyhlOiBJTGlzdEV2ZW50PElTZWxlY3RPcHRpb25JdGVtPikge1xuXHRcdC8vIFNraXAgZHVyaW5nIGluaXRpYWwgbGF5b3V0XG5cdFx0aWYgKCF0aGlzLl9pc1Zpc2libGUgfHwgIXRoaXMuX2hhc0RldGFpbHMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZURldGFpbChlLmluZGV4ZXNbMF0pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVEZXRhaWwoc2VsZWN0ZWRJbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Ly8gUmVzZXRcblx0XHR0aGlzLl9zZWxlY3Rpb25EZXRhaWxzRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLnNlbGVjdGlvbkRldGFpbHNQYW5lLnRleHRDb250ZW50ID0gJyc7XG5cblx0XHRjb25zdCBvcHRpb24gPSB0aGlzLm9wdGlvbnNbc2VsZWN0ZWRJbmRleF07XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBvcHRpb24/LmRlc2NyaXB0aW9uID8/ICcnO1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uSXNNYXJrZG93biA9IG9wdGlvbj8uZGVzY3JpcHRpb25Jc01hcmtkb3duID8/IGZhbHNlO1xuXG5cdFx0aWYgKGRlc2NyaXB0aW9uKSB7XG5cdFx0XHRpZiAoZGVzY3JpcHRpb25Jc01hcmtkb3duKSB7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbkhhbmRsZXIgPSBvcHRpb24uZGVzY3JpcHRpb25NYXJrZG93bkFjdGlvbkhhbmRsZXI7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX3NlbGVjdGlvbkRldGFpbHNEaXNwb3NhYmxlcy5hZGQodGhpcy5yZW5kZXJEZXNjcmlwdGlvbk1hcmtkb3duKGRlc2NyaXB0aW9uLCBhY3Rpb25IYW5kbGVyKSk7XG5cdFx0XHRcdHRoaXMuc2VsZWN0aW9uRGV0YWlsc1BhbmUuYXBwZW5kQ2hpbGQocmVzdWx0LmVsZW1lbnQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5zZWxlY3Rpb25EZXRhaWxzUGFuZS50ZXh0Q29udGVudCA9IGRlc2NyaXB0aW9uO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5zZWxlY3Rpb25EZXRhaWxzUGFuZS5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zZWxlY3Rpb25EZXRhaWxzUGFuZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH1cblxuXHRcdC8vIEF2b2lkIHJlY3Vyc2lvblxuXHRcdHRoaXMuX3NraXBMYXlvdXQgPSB0cnVlO1xuXHRcdHRoaXMuY29udGV4dFZpZXdQcm92aWRlci5sYXlvdXQoKTtcblx0XHR0aGlzLl9za2lwTGF5b3V0ID0gZmFsc2U7XG5cdH1cblxuXHQvLyBMaXN0IGtleWJvYXJkIGNvbnRyb2xsZXJcblxuXHQvLyBMaXN0IGV4aXQgLSBhY3RpdmUgLSBoaWRlIENvbnRleHRWaWV3IGRyb3Bkb3duLCByZXNldCBzZWxlY3Rpb24sIHJldHVybiBmb2N1cyB0byBwYXJlbnQgc2VsZWN0XG5cdHByaXZhdGUgb25Fc2NhcGUoZTogU3RhbmRhcmRLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSk7XG5cblx0XHQvLyBSZXNldCBzZWxlY3Rpb24gdG8gdmFsdWUgd2hlbiBvcGVuZWRcblx0XHR0aGlzLnNlbGVjdCh0aGlzLl9jdXJyZW50U2VsZWN0aW9uKTtcblx0XHR0aGlzLmhpZGVTZWxlY3REcm9wRG93bih0cnVlKTtcblx0fVxuXG5cdC8vIExpc3QgZXhpdCAtIGFjdGl2ZSAtIGhpZGUgQ29udGV4dFZpZXcgZHJvcGRvd24sIHJldHVybiBmb2N1cyB0byBwYXJlbnQgc2VsZWN0LCBmaXJlIG9uRGlkU2VsZWN0IGlmIGNoYW5nZVxuXHRwcml2YXRlIG9uRW50ZXIoZTogU3RhbmRhcmRLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSk7XG5cblx0XHQvLyBJZ25vcmUgaWYgY3VycmVudCBzZWxlY3Rpb24gaXMgZGlzYWJsZWQgKGUuZy4gc2VwYXJhdG9yKVxuXHRcdGlmICh0aGlzLm9wdGlvbnNbdGhpcy5zZWxlY3RlZF0/LmlzRGlzYWJsZWQpIHtcblx0XHRcdHRoaXMuaGlkZVNlbGVjdERyb3BEb3duKHRydWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE9ubHkgZmlyZSBpZiBzZWxlY3Rpb24gY2hhbmdlXG5cdFx0aWYgKHRoaXMuc2VsZWN0ZWQgIT09IHRoaXMuX2N1cnJlbnRTZWxlY3Rpb24pIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRTZWxlY3Rpb24gPSB0aGlzLnNlbGVjdGVkO1xuXHRcdFx0dGhpcy5fb25EaWRTZWxlY3QuZmlyZSh7XG5cdFx0XHRcdGluZGV4OiB0aGlzLnNlbGVjdEVsZW1lbnQuc2VsZWN0ZWRJbmRleCxcblx0XHRcdFx0c2VsZWN0ZWQ6IHRoaXMub3B0aW9uc1t0aGlzLnNlbGVjdGVkXS50ZXh0XG5cdFx0XHR9KTtcblx0XHRcdGlmICghIXRoaXMub3B0aW9uc1t0aGlzLnNlbGVjdGVkXSAmJiAhIXRoaXMub3B0aW9uc1t0aGlzLnNlbGVjdGVkXS50ZXh0KSB7XG5cdFx0XHRcdHRoaXMuc2V0VGl0bGUodGhpcy5vcHRpb25zW3RoaXMuc2VsZWN0ZWRdLnRleHQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuaGlkZVNlbGVjdERyb3BEb3duKHRydWUpO1xuXHR9XG5cblx0Ly8gTGlzdCBuYXZpZ2F0aW9uIC0gaGF2ZSB0byBoYW5kbGUgZGlzYWJsZWQgb3B0aW9ucyAoanVtcCBvdmVyKVxuXHRwcml2YXRlIG9uRG93bkFycm93KGU6IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnNlbGVjdGVkIDwgdGhpcy5vcHRpb25zLmxlbmd0aCAtIDEpIHtcblx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXG5cdFx0XHQvLyBTa2lwIG92ZXIgYWxsIGNvbnRpZ3VvdXMgZGlzYWJsZWQgb3B0aW9uc1xuXHRcdFx0bGV0IG5leHQgPSB0aGlzLnNlbGVjdGVkICsgMTtcblx0XHRcdHdoaWxlIChuZXh0IDwgdGhpcy5vcHRpb25zLmxlbmd0aCAmJiB0aGlzLm9wdGlvbnNbbmV4dF0uaXNEaXNhYmxlZCkge1xuXHRcdFx0XHRuZXh0Kys7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChuZXh0ID49IHRoaXMub3B0aW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnNlbGVjdGVkID0gbmV4dDtcblxuXHRcdFx0Ly8gU2V0IGZvY3VzL3NlbGVjdGlvbiAtIG9ubHkgZmlyZSBldmVudCB3aGVuIGNsb3NpbmcgZHJvcC1kb3duIG9yIG9uIGJsdXJcblx0XHRcdHRoaXMuc2VsZWN0KHRoaXMuc2VsZWN0ZWQpO1xuXHRcdFx0dGhpcy5zZWxlY3RMaXN0LnNldEZvY3VzKFt0aGlzLnNlbGVjdGVkXSk7XG5cdFx0XHR0aGlzLnNlbGVjdExpc3QucmV2ZWFsKHRoaXMuc2VsZWN0TGlzdC5nZXRGb2N1cygpWzBdKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uVXBBcnJvdyhlOiBTdGFuZGFyZEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5zZWxlY3RlZCA+IDApIHtcblx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXG5cdFx0XHQvLyBTa2lwIG92ZXIgYWxsIGNvbnRpZ3VvdXMgZGlzYWJsZWQgb3B0aW9uc1xuXHRcdFx0bGV0IHByZXYgPSB0aGlzLnNlbGVjdGVkIC0gMTtcblx0XHRcdHdoaWxlIChwcmV2ID49IDAgJiYgdGhpcy5vcHRpb25zW3ByZXZdLmlzRGlzYWJsZWQpIHtcblx0XHRcdFx0cHJldi0tO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocHJldiA8IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnNlbGVjdGVkID0gcHJldjtcblxuXHRcdFx0Ly8gU2V0IGZvY3VzL3NlbGVjdGlvbiAtIG9ubHkgZmlyZSBldmVudCB3aGVuIGNsb3NpbmcgZHJvcC1kb3duIG9yIG9uIGJsdXJcblx0XHRcdHRoaXMuc2VsZWN0KHRoaXMuc2VsZWN0ZWQpO1xuXHRcdFx0dGhpcy5zZWxlY3RMaXN0LnNldEZvY3VzKFt0aGlzLnNlbGVjdGVkXSk7XG5cdFx0XHR0aGlzLnNlbGVjdExpc3QucmV2ZWFsKHRoaXMuc2VsZWN0TGlzdC5nZXRGb2N1cygpWzBdKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uUGFnZVVwKGU6IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUpO1xuXG5cdFx0dGhpcy5zZWxlY3RMaXN0LmZvY3VzUHJldmlvdXNQYWdlKCk7XG5cblx0XHQvLyBBbGxvdyBzY3JvbGxpbmcgdG8gc2V0dGxlXG5cdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRsZXQgY2FuZGlkYXRlID0gdGhpcy5zZWxlY3RMaXN0LmdldEZvY3VzKClbMF07XG5cblx0XHRcdC8vIFNoaWZ0IHNlbGVjdGlvbiB1cCBpZiB3ZSBsYW5kIG9uIGEgZGlzYWJsZWQgb3B0aW9uXG5cdFx0XHR3aGlsZSAoY2FuZGlkYXRlID4gMCAmJiB0aGlzLm9wdGlvbnNbY2FuZGlkYXRlXS5pc0Rpc2FibGVkKSB7XG5cdFx0XHRcdGNhbmRpZGF0ZS0tO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMub3B0aW9uc1tjYW5kaWRhdGVdLmlzRGlzYWJsZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5zZWxlY3RlZCA9IGNhbmRpZGF0ZTtcblx0XHRcdHRoaXMuc2VsZWN0TGlzdC5zZXRGb2N1cyhbdGhpcy5zZWxlY3RlZF0pO1xuXHRcdFx0dGhpcy5zZWxlY3RMaXN0LnJldmVhbCh0aGlzLnNlbGVjdGVkKTtcblx0XHRcdHRoaXMuc2VsZWN0KHRoaXMuc2VsZWN0ZWQpO1xuXHRcdH0sIDEpO1xuXHR9XG5cblx0cHJpdmF0ZSBvblBhZ2VEb3duKGU6IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUpO1xuXG5cdFx0dGhpcy5zZWxlY3RMaXN0LmZvY3VzTmV4dFBhZ2UoKTtcblxuXHRcdC8vIEFsbG93IHNjcm9sbGluZyB0byBzZXR0bGVcblx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdGxldCBjYW5kaWRhdGUgPSB0aGlzLnNlbGVjdExpc3QuZ2V0Rm9jdXMoKVswXTtcblxuXHRcdFx0Ly8gU2hpZnQgc2VsZWN0aW9uIGRvd24gaWYgd2UgbGFuZCBvbiBhIGRpc2FibGVkIG9wdGlvblxuXHRcdFx0d2hpbGUgKGNhbmRpZGF0ZSA8IHRoaXMub3B0aW9ucy5sZW5ndGggLSAxICYmIHRoaXMub3B0aW9uc1tjYW5kaWRhdGVdLmlzRGlzYWJsZWQpIHtcblx0XHRcdFx0Y2FuZGlkYXRlKys7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5vcHRpb25zW2NhbmRpZGF0ZV0uaXNEaXNhYmxlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnNlbGVjdGVkID0gY2FuZGlkYXRlO1xuXHRcdFx0dGhpcy5zZWxlY3RMaXN0LnNldEZvY3VzKFt0aGlzLnNlbGVjdGVkXSk7XG5cdFx0XHR0aGlzLnNlbGVjdExpc3QucmV2ZWFsKHRoaXMuc2VsZWN0ZWQpO1xuXHRcdFx0dGhpcy5zZWxlY3QodGhpcy5zZWxlY3RlZCk7XG5cdFx0fSwgMSk7XG5cdH1cblxuXHRwcml2YXRlIG9uSG9tZShlOiBTdGFuZGFyZEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcblx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlKTtcblxuXHRcdGlmICh0aGlzLm9wdGlvbnMubGVuZ3RoIDwgMikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgY2FuZGlkYXRlID0gMDtcblx0XHR3aGlsZSAoY2FuZGlkYXRlIDwgdGhpcy5vcHRpb25zLmxlbmd0aCAtIDEgJiYgdGhpcy5vcHRpb25zW2NhbmRpZGF0ZV0uaXNEaXNhYmxlZCkge1xuXHRcdFx0Y2FuZGlkYXRlKys7XG5cdFx0fVxuXHRcdGlmICh0aGlzLm9wdGlvbnNbY2FuZGlkYXRlXS5pc0Rpc2FibGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuc2VsZWN0ZWQgPSBjYW5kaWRhdGU7XG5cdFx0dGhpcy5zZWxlY3RMaXN0LnNldEZvY3VzKFt0aGlzLnNlbGVjdGVkXSk7XG5cdFx0dGhpcy5zZWxlY3RMaXN0LnJldmVhbCh0aGlzLnNlbGVjdGVkKTtcblx0XHR0aGlzLnNlbGVjdCh0aGlzLnNlbGVjdGVkKTtcblx0fVxuXG5cdHByaXZhdGUgb25FbmQoZTogU3RhbmRhcmRLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSk7XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLmxlbmd0aCA8IDIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bGV0IGNhbmRpZGF0ZSA9IHRoaXMub3B0aW9ucy5sZW5ndGggLSAxO1xuXHRcdHdoaWxlIChjYW5kaWRhdGUgPiAwICYmIHRoaXMub3B0aW9uc1tjYW5kaWRhdGVdLmlzRGlzYWJsZWQpIHtcblx0XHRcdGNhbmRpZGF0ZS0tO1xuXHRcdH1cblx0XHRpZiAodGhpcy5vcHRpb25zW2NhbmRpZGF0ZV0uaXNEaXNhYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnNlbGVjdGVkID0gY2FuZGlkYXRlO1xuXHRcdHRoaXMuc2VsZWN0TGlzdC5zZXRGb2N1cyhbdGhpcy5zZWxlY3RlZF0pO1xuXHRcdHRoaXMuc2VsZWN0TGlzdC5yZXZlYWwodGhpcy5zZWxlY3RlZCk7XG5cdFx0dGhpcy5zZWxlY3QodGhpcy5zZWxlY3RlZCk7XG5cdH1cblxuXHQvLyBNaW1pYyBvcHRpb24gZmlyc3QgY2hhcmFjdGVyIG5hdmlnYXRpb24gb2YgbmF0aXZlIHNlbGVjdFxuXHRwcml2YXRlIG9uQ2hhcmFjdGVyKGU6IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGNoID0gS2V5Q29kZVV0aWxzLnRvU3RyaW5nKGUua2V5Q29kZSk7XG5cdFx0bGV0IG9wdGlvbkluZGV4ID0gLTE7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMub3B0aW9ucy5sZW5ndGggLSAxOyBpKyspIHtcblx0XHRcdG9wdGlvbkluZGV4ID0gKGkgKyB0aGlzLnNlbGVjdGVkICsgMSkgJSB0aGlzLm9wdGlvbnMubGVuZ3RoO1xuXHRcdFx0aWYgKHRoaXMub3B0aW9uc1tvcHRpb25JbmRleF0udGV4dC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSA9PT0gY2ggJiYgIXRoaXMub3B0aW9uc1tvcHRpb25JbmRleF0uaXNEaXNhYmxlZCkge1xuXHRcdFx0XHR0aGlzLnNlbGVjdChvcHRpb25JbmRleCk7XG5cdFx0XHRcdHRoaXMuc2VsZWN0TGlzdC5zZXRGb2N1cyhbb3B0aW9uSW5kZXhdKTtcblx0XHRcdFx0dGhpcy5zZWxlY3RMaXN0LnJldmVhbCh0aGlzLnNlbGVjdExpc3QuZ2V0Rm9jdXMoKVswXSk7XG5cdFx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmhpZGVTZWxlY3REcm9wRG93bihmYWxzZSk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUN6QixZQUFZLFlBQVk7QUFDeEIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxTQUFTLG9CQUFvQjtBQUN0QyxTQUFTLFlBQVksdUJBQW9DO0FBQ3pELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsMkJBQTJCO0FBQ3BDLFlBQVksV0FBVztBQUN2QixZQUFZLFNBQVM7QUFDckIsWUFBWSxzQkFBc0I7QUFDbEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBbUQsc0JBQXNCO0FBQ3pFLFNBQVMsc0JBQTRDO0FBRXJELFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsK0JBQStCO0FBRXhDLFNBQVMsWUFBWTtBQUVyQixPQUFPO0FBR1AsTUFBTSxJQUFJLElBQUk7QUFFZCxNQUFNLGtDQUFrQztBQVN4QyxNQUFNLG1CQUF3RjtBQUFBLEVBRTdGLElBQUksYUFBcUI7QUFBRSxXQUFPO0FBQUEsRUFBaUM7QUFBQSxFQUVuRSxlQUFlLFdBQWlEO0FBQy9ELFVBQU0sT0FBZ0MsdUJBQU8sT0FBTyxJQUFJO0FBQ3hELFNBQUssT0FBTztBQUNaLFNBQUssT0FBTyxJQUFJLE9BQU8sV0FBVyxFQUFFLGNBQWMsQ0FBQztBQUNuRCxTQUFLLFNBQVMsSUFBSSxPQUFPLFdBQVcsRUFBRSxnQkFBZ0IsQ0FBQztBQUN2RCxTQUFLLGlCQUFpQixJQUFJLE9BQU8sV0FBVyxFQUFFLHlCQUF5QixDQUFDO0FBRXhFLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxjQUFjLFNBQTRCLE9BQWUsY0FBNkM7QUFDckcsVUFBTSxPQUFnQztBQUV0QyxVQUFNLE9BQU8sUUFBUTtBQUNyQixVQUFNLFNBQVMsUUFBUTtBQUN2QixVQUFNLGlCQUFpQixRQUFRO0FBRS9CLFVBQU0sYUFBYSxRQUFRO0FBRTNCLFNBQUssS0FBSyxj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
