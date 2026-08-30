import { isFirefox } from "../../browser.js";
import { EventType as TouchEventType, Gesture } from "../../touch.js";
import { $, addDisposableListener, append, clearNode, Dimension, EventHelper, EventType, getActiveElement, getWindow, isAncestor, isInShadowDOM } from "../../dom.js";
import { createStyleSheet } from "../../domStylesheets.js";
import { StandardKeyboardEvent } from "../../keyboardEvent.js";
import { StandardMouseEvent } from "../../mouseEvent.js";
import { ActionBar, ActionsOrientation } from "../actionbar/actionbar.js";
import { ActionViewItem, BaseActionViewItem } from "../actionbar/actionViewItems.js";
import { DomScrollableElement } from "../scrollbar/scrollableElement.js";
import { EmptySubmenuAction, Separator, SubmenuAction } from "../../../common/actions.js";
import { RunOnceScheduler } from "../../../common/async.js";
import { Codicon } from "../../../common/codicons.js";
import { getCodiconFontCharacters } from "../../../common/codiconsUtil.js";
import { ThemeIcon } from "../../../common/themables.js";
import { stripIcons } from "../../../common/iconLabels.js";
import { KeyCode } from "../../../common/keyCodes.js";
import { DisposableStore } from "../../../common/lifecycle.js";
import { isLinux, isMacintosh } from "../../../common/platform.js";
import { ScrollbarVisibility } from "../../../common/scrollable.js";
import * as strings from "../../../common/strings.js";
import { layout, LayoutAnchorPosition } from "../../../common/layout.js";
import { CONTEXT_VIEW_MENU_MOTION_SHADOW_VARIABLE } from "../contextview/contextview.js";
const MENU_MNEMONIC_REGEX = /\(&([^\s&])\)|(^|[^&])&([^\s&])/;
const MENU_ESCAPED_MNEMONIC_REGEX = /(&amp;)?(&amp;)([^\s&])/g;
var HorizontalDirection = /* @__PURE__ */ ((HorizontalDirection2) => {
  HorizontalDirection2[HorizontalDirection2["Right"] = 0] = "Right";
  HorizontalDirection2[HorizontalDirection2["Left"] = 1] = "Left";
  return HorizontalDirection2;
})(HorizontalDirection || {});
var VerticalDirection = /* @__PURE__ */ ((VerticalDirection2) => {
  VerticalDirection2[VerticalDirection2["Above"] = 0] = "Above";
  VerticalDirection2[VerticalDirection2["Below"] = 1] = "Below";
  return VerticalDirection2;
})(VerticalDirection || {});
const unthemedMenuStyles = {
  shadowColor: void 0,
  borderColor: void 0,
  foregroundColor: void 0,
  backgroundColor: void 0,
  selectionForegroundColor: void 0,
  selectionBackgroundColor: void 0,
  selectionBorderColor: void 0,
  separatorColor: void 0,
  scrollbarShadow: void 0,
  scrollbarSliderBackground: void 0,
  scrollbarSliderHoverBackground: void 0,
  scrollbarSliderActiveBackground: void 0
};
class Menu extends ActionBar {
  constructor(container, actions, options, menuStyles) {
    container.classList.add("monaco-menu-container");
    container.setAttribute("role", "presentation");
    const menuElement = document.createElement("div");
    menuElement.classList.add("monaco-menu");
    menuElement.setAttribute("role", "presentation");
    super(menuElement, {
      orientation: ActionsOrientation.VERTICAL,
      actionViewItemProvider: (action) => this.doGetActionViewItem(action, options, parentData),
      context: options.context,
      actionRunner: options.actionRunner,
      ariaLabel: options.ariaLabel,
      ariaRole: "menu",
      focusOnlyEnabledItems: true,
      triggerKeys: { keys: [KeyCode.Enter, ...isMacintosh || isLinux ? [KeyCode.Space] : []], keyDown: true }
    });
    this.menuStyles = menuStyles;
    this.menuElement = menuElement;
    this.actionsList.tabIndex = 0;
    this.initializeOrUpdateStyleSheet(container, menuStyles);
    this._register(Gesture.addTarget(menuElement));
    this._register(addDisposableListener(menuElement, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Tab)) {
        e.preventDefault();
      }
    }));
    if (options.enableMnemonics) {
      this._register(addDisposableListener(menuElement, EventType.KEY_DOWN, (e) => {
        const key = e.key.toLocaleLowerCase();
        const actions2 = this.mnemonics.get(key);
        if (actions2 !== void 0) {
          EventHelper.stop(e, true);
          if (actions2.length === 1) {
            if (actions2[0] instanceof SubmenuMenuActionViewItem && actions2[0].container) {
              this.focusItemByElement(actions2[0].container);
            }
            actions2[0].onClick(e);
          }
          if (actions2.length > 1) {
            const action = actions2.shift();
            if (action && action.container) {
              this.focusItemByElement(action.container);
              actions2.push(action);
            }
            this.mnemonics.set(key, actions2);
          }
        }
      }));
    }
    if (isLinux) {
      this._register(addDisposableListener(menuElement, EventType.KEY_DOWN, (e) => {
        const event = new StandardKeyboardEvent(e);
        if (event.equals(KeyCode.Home) || event.equals(KeyCode.PageUp)) {
          this.focusedItem = this.viewItems.length - 1;
          this.focusNext();
          EventHelper.stop(e, true);
        } else if (event.equals(KeyCode.End) || event.equals(KeyCode.PageDown)) {
          this.focusedItem = 0;
          this.focusPrevious();
          EventHelper.stop(e, true);
        }
      }));
    }
    this._register(addDisposableListener(this.domNode, EventType.MOUSE_OUT, (e) => {
      const relatedTarget = e.relatedTarget;
      if (!isAncestor(relatedTarget, this.domNode)) {
        this.focusedItem = void 0;
        this.updateFocus();
        e.stopPropagation();
      }
    }));
    this._register(addDisposableListener(this.actionsList, EventType.MOUSE_MOVE, (e) => {
      if (e.movementX === 0 && e.movementY === 0) {
        return;
      }
      let target = e.target;
      if (!target || !isAncestor(target, this.actionsList) || target === this.actionsList) {
        return;
      }
      while (target.parentElement !== this.actionsList && target.parentElement !== null) {
        target = target.parentElement;
      }
      if (target.classList.contains("action-item")) {
        const lastFocusedItem = this.focusedItem;
        if (lastFocusedItem !== void 0 && this.actionsList.children[lastFocusedItem] === target) {
          return;
        }
        this.setFocusedItem(target);
        if (lastFocusedItem !== this.focusedItem) {
          this.updateFocus();
        }
      }
    }));
    this._register(Gesture.addTarget(this.actionsList));
    this._register(addDisposableListener(this.actionsList, TouchEventType.Tap, (e) => {
      let target = e.initialTarget;
      if (!target || !isAncestor(target, this.actionsList) || target === this.actionsList) {
        return;
      }
      while (target.parentElement !== this.actionsList && target.parentElement !== null) {
        target = target.parentElement;
      }
      if (target.classList.contains("action-item")) {
        const lastFocusedItem = this.focusedItem;
        this.setFocusedItem(target);
        if (lastFocusedItem !== this.focusedItem) {
          this.updateFocus();
        }
      }
    }));
    const parentData = {
      parent: this
    };
    this.mnemonics = /* @__PURE__ */ new Map();
    this.scrollableElement = this._register(new DomScrollableElement(menuElement, {
      alwaysConsumeMouseWheel: true,
      horizontal: ScrollbarVisibility.Hidden,
      vertical: ScrollbarVisibility.Visible,
      verticalScrollbarSize: 7,
      handleMouseWheel: true,
      useShadows: true
    }));
    const scrollElement = this.scrollableElement.getDomNode();
    scrollElement.style.position = "";
    this.styleScrollElement(scrollElement, menuStyles);
    this._register(addDisposableListener(menuElement, TouchEventType.Change, (e) => {
      EventHelper.stop(e, true);
      const scrollTop = this.scrollableElement.getScrollPosition().scrollTop;
      this.scrollableElement.setScrollPosition({ scrollTop: scrollTop - e.translationY });
    }));
    this._register(addDisposableListener(scrollElement, EventType.MOUSE_UP, (e) => {
      e.preventDefault();
    }));
    const window = getWindow(container);
    menuElement.style.maxHeight = `${Math.max(10, window.innerHeight - container.getBoundingClientRect().top - 35)}px`;
    actions = actions.filter((a, idx) => {
      if (options.submenuIds?.has(a.id)) {
        console.warn(`Found submenu cycle: ${a.id}`);
        return false;
      }
      if (a instanceof Separator) {
        if (idx === actions.length - 1 || idx === 0) {
          return false;
        }
        const prevAction = actions[idx - 1];
        if (prevAction instanceof Separator) {
          return false;
        }
      }
      return true;
    });
    this.push(actions, { icon: true, label: true, isMenu: true });
    container.appendChild(this.scrollableElement.getDomNode());
    this.scrollableElement.scanDomNode();
    this.viewItems.filter((item) => !(item instanceof MenuSeparatorActionViewItem)).forEach((item, index, array) => {
      item.updatePositionInSet(index + 1, array.length);
    });
  }
  initializeOrUpdateStyleSheet(container, style) {
    if (!this.styleSheet) {
      if (isInShadowDOM(container)) {
        this.styleSheet = createStyleSheet(container);
      } else {
        if (!Menu.globalStyleSheet) {
          Menu.globalStyleSheet = createStyleSheet();
        }
        this.styleSheet = Menu.globalStyleSheet;
      }
    }
    this.styleSheet.textContent = getMenuWidgetCSS(style, isInShadowDOM(container));
  }
  styleScrollElement(scrollElement, style) {
    const fgColor = style.foregroundColor ?? "";
    const bgColor = style.backgroundColor ?? "";
    const borderRadius = "var(--vscode-cornerRadius-large)";
    scrollElement.style.borderRadius = borderRadius;
    scrollElement.style.color = fgColor;
    scrollElement.style.backgroundColor = bgColor;
  }
  getContainer() {
    return this.scrollableElement.getDomNode();
  }
  get onScroll() {
    return this.scrollableElement.onScroll;
  }
  get scrollOffset() {
    return this.menuElement.scrollTop;
  }
  trigger(index) {
    if (index <= this.viewItems.length && index >= 0) {
      const item = this.viewItems[index];
      if (item instanceof SubmenuMenuActionViewItem) {
        super.focus(index);
        item.open(true);
      } else if (item instanceof BaseMenuActionViewItem) {
        super.run(item._action, item._context);
      } else {
        return;
      }
    }
  }
  focusItemByElement(element) {
    const lastFocusedItem = this.focusedItem;
    this.setFocusedItem(element);
    if (lastFocusedItem !== this.focusedItem) {
      this.updateFocus();
    }
  }
  setFocusedItem(element) {
    for (let i = 0; i < this.actionsList.children.length; i++) {
      const elem = this.actionsList.children[i];
      if (element === elem) {
        this.focusedItem = i;
        break;
      }
    }
  }
  updateFocus(fromRight) {
    super.updateFocus(fromRight, true, true);
    if (typeof this.focusedItem !== "undefined") {
      this.scrollableElement.setScrollPosition({
        scrollTop: Math.round(this.menuElement.scrollTop)
      });
    }
  }
  doGetActionViewItem(action, options, parentData) {
    if (action instanceof Separator) {
      return new MenuSeparatorActionViewItem(options.context, action, { icon: true }, this.menuStyles);
    } else if (action instanceof SubmenuAction) {
      const menuActionViewItem = new SubmenuMenuActionViewItem(action, action.actions, parentData, { ...options, submenuIds: /* @__PURE__ */ new Set([...options.submenuIds || [], action.id]) }, this.menuStyles);
      if (options.enableMnemonics) {
        const mnemonic = menuActionViewItem.getMnemonic();
        if (mnemonic && menuActionViewItem.isEnabled()) {
          const actionViewItems = this.mnemonics.get(mnemonic);
          if (actionViewItems !== void 0) {
            actionViewItems.push(menuActionViewItem);
          } else {
            this.mnemonics.set(mnemonic, [menuActionViewItem]);
          }
        }
      }
      return menuActionViewItem;
    } else {
      const keybindingLabel = options.getKeyBinding?.(action)?.getLabel();
      const menuItemOptions = {
        enableMnemonics: options.enableMnemonics,
        useEventAsContext: options.useEventAsContext,
        keybinding: keybindingLabel
      };
      const menuActionViewItem = new BaseMenuActionViewItem(options.context, action, menuItemOptions, this.menuStyles);
      if (options.enableMnemonics) {
        const mnemonic = menuActionViewItem.getMnemonic();
        if (mnemonic && menuActionViewItem.isEnabled()) {
          const actionViewItems = this.mnemonics.get(mnemonic);
          if (actionViewItems !== void 0) {
            actionViewItems.push(menuActionViewItem);
          } else {
            this.mnemonics.set(mnemonic, [menuActionViewItem]);
          }
        }
      }
      return menuActionViewItem;
    }
  }
}
class BaseMenuActionViewItem extends BaseActionViewItem {
  constructor(ctx, action, options, menuStyle) {
    options = {
      ...options,
      isMenu: true,
      icon: options.icon !== void 0 ? options.icon : false,
      label: options.label !== void 0 ? options.label : true
    };
    super(action, action, options);
    this.menuStyle = menuStyle;
    this.options = options;
    this.cssClass = "";
    if (this.options.label && options.enableMnemonics) {
      const label = this.action.label;
      if (label) {
        const matches = MENU_MNEMONIC_REGEX.exec(label);
        if (matches) {
          this.mnemonic = (!!matches[1] ? matches[1] : matches[3]).toLocaleLowerCase();
        }
      }
    }
    this.runOnceToEnableMouseUp = new RunOnceScheduler(() => {
      if (!this.element) {
        return;
      }
      this._register(addDisposableListener(this.element, EventType.MOUSE_UP, (e) => {
        EventHelper.stop(e, true);
        if (isFirefox) {
          const mouseEvent = new StandardMouseEvent(getWindow(this.element), e);
          if (mouseEvent.rightButton) {
            return;
          }
          this.onClick(e);
        } else {
          setTimeout(() => {
            this.onClick(e);
          }, 0);
        }
      }));
      this._register(addDisposableListener(this.element, EventType.CONTEXT_MENU, (e) => {
        EventHelper.stop(e, true);
      }));
    }, 100);
    this._register(this.runOnceToEnableMouseUp);
  }
  render(container) {
    super.render(container);
    if (!this.element) {
      return;
    }
    this.container = container;
    this.item = append(this.element, $("a.action-menu-item"));
    if (this._action.id === Separator.ID) {
      this.item.setAttribute("role", "presentation");
    } else {
      this.item.setAttribute("role", "menuitem");
      if (this.mnemonic) {
        this.item.setAttribute("aria-keyshortcuts", `${this.mnemonic}`);
      }
    }
    this.check = append(this.item, $("span.menu-item-check" + ThemeIcon.asCSSSelector(Codicon.menuSelection)));
    this.check.setAttribute("role", "none");
    this.label = append(this.item, $("span.action-label"));
    if (this.options.label && this.options.keybinding) {
      append(this.item, $("span.keybinding")).textContent = this.options.keybinding;
    }
    this.runOnceToEnableMouseUp.schedule();
    this.updateClass();
    this.updateLabel();
    this.updateTooltip();
    this.updateEnabled();
    this.updateChecked();
    this.applyStyle();
  }
  blur() {
    super.blur();
    this.applyStyle();
  }
  focus() {
    super.focus();
    this.item?.focus();
    this.applyStyle();
  }
  updatePositionInSet(pos, setSize) {
    if (this.item) {
      this.item.setAttribute("aria-posinset", `${pos}`);
      this.item.setAttribute("aria-setsize", `${setSize}`);
    }
  }
  updateLabel() {
    if (!this.label) {
      return;
    }
    if (this.options.label) {
      clearNode(this.label);
      let label = stripIcons(this.action.label);
      if (label) {
        const cleanLabel = cleanMnemonic(label);
        if (!this.options.enableMnemonics) {
          label = cleanLabel;
        }
        this.label.setAttribute("aria-label", cleanLabel.replace(/&&/g, "&"));
        const matches = MENU_MNEMONIC_REGEX.exec(label);
        if (matches) {
          label = strings.escape(label);
          MENU_ESCAPED_MNEMONIC_REGEX.lastIndex = 0;
          let escMatch = MENU_ESCAPED_MNEMONIC_REGEX.exec(label);
          while (escMatch && escMatch[1]) {
            escMatch = MENU_ESCAPED_MNEMONIC_REGEX.exec(label);
          }
          const replaceDoubleEscapes = (str) => str.replace(/&amp;&amp;/g, "&amp;");
          if (escMatch) {
            this.label.append(
              strings.ltrim(replaceDoubleEscapes(label.substr(0, escMatch.index)), " "),
              $(
                "u",
                { "aria-hidden": "true" },
                escMatch[3]
              ),
              strings.rtrim(replaceDoubleEscapes(label.substr(escMatch.index + escMatch[0].length)), " ")
            );
          } else {
            this.label.textContent = replaceDoubleEscapes(label).trim();
          }
          this.item?.setAttribute("aria-keyshortcuts", (!!matches[1] ? matches[1] : matches[3]).toLocaleLowerCase());
        } else {
          this.label.textContent = label.replace(/&&/g, "&").trim();
        }
      }
    }
  }
  updateTooltip() {
  }
  updateClass() {
    if (this.cssClass && this.item) {
      this.item.classList.remove(...this.cssClass.split(" "));
    }
    if (this.options.icon && this.label) {
      this.cssClass = this.action.class || "";
      this.label.classList.add("icon");
      if (this.cssClass) {
        this.label.classList.add(...this.cssClass.split(" "));
      }
      this.updateEnabled();
    } else if (this.label) {
      this.label.classList.remove("icon");
    }
  }
  updateEnabled() {
    if (this.action.enabled) {
      if (this.element) {
        this.element.classList.remove("disabled");
        this.element.removeAttribute("aria-disabled");
      }
      if (this.item) {
        this.item.classList.remove("disabled");
        this.item.removeAttribute("aria-disabled");
        this.item.tabIndex = 0;
      }
    } else {
      if (this.element) {
        this.element.classList.add("disabled");
        this.element.setAttribute("aria-disabled", "true");
      }
      if (this.item) {
        this.item.classList.add("disabled");
        this.item.setAttribute("aria-disabled", "true");
      }
    }
  }
  updateChecked() {
    if (!this.item) {
      return;
    }
    const checked = this.action.checked;
    this.item.classList.toggle("checked", !!checked);
    if (checked !== void 0) {
      this.item.setAttribute("role", "menuitemcheckbox");
      this.item.setAttribute("aria-checked", checked ? "true" : "false");
    } else {
      this.item.setAttribute("role", "menuitem");
      this.item.setAttribute("aria-checked", "");
    }
  }
  getMnemonic() {
    return this.mnemonic;
  }
  applyStyle() {
    const isSelected = this.element && this.element.classList.contains("focused");
    const fgColor = isSelected && this.menuStyle.selectionForegroundColor ? this.menuStyle.selectionForegroundColor : this.menuStyle.foregroundColor;
    const bgColor = isSelected && this.menuStyle.selectionBackgroundColor ? this.menuStyle.selectionBackgroundColor : void 0;
    const outline = isSelected && this.menuStyle.selectionBorderColor ? `1px solid ${this.menuStyle.selectionBorderColor}` : "";
    const outlineOffset = isSelected && this.menuStyle.selectionBorderColor ? `-1px` : "";
    if (this.item) {
      this.item.style.color = fgColor ?? "";
      this.item.style.backgroundColor = bgColor ?? "";
      this.item.style.outline = outline;
      this.item.style.outlineOffset = outlineOffset;
    }
    if (this.check) {
      this.check.style.color = fgColor ?? "";
    }
  }
}
class SubmenuMenuActionViewItem extends BaseMenuActionViewItem {
  constructor(action, submenuActions, parentData, submenuOptions, menuStyles) {
    super(action, action, submenuOptions, menuStyles);
    this.submenuActions = submenuActions;
    this.parentData = parentData;
    this.submenuOptions = submenuOptions;
    this.mysubmenu = null;
    this.submenuDisposables = this._register(new DisposableStore());
    this.mouseOver = false;
    this.expandDirection = submenuOptions && submenuOptions.expandDirection !== void 0 ? submenuOptions.expandDirection : { horizontal: 0 /* Right */, vertical: 1 /* Below */ };
    this.showScheduler = new RunOnceScheduler(() => {
      if (this.mouseOver) {
        this.cleanupExistingSubmenu(false);
        this.createSubmenu(false);
      }
    }, 250);
    this.hideScheduler = new RunOnceScheduler(() => {
      if (this.element && (!isAncestor(getActiveElement(), this.element) && this.parentData.submenu === this.mysubmenu)) {
        this.parentData.parent.focus(false);
        this.cleanupExistingSubmenu(true);
      }
    }, 750);
  }
  render(container) {
    super.render(container);
    if (!this.element) {
      return;
    }
    if (this.item) {
      this.item.classList.add("monaco-submenu-item");
      this.item.tabIndex = 0;
      this.item.setAttribute("aria-haspopup", "true");
      this.updateAriaExpanded("false");
      this.submenuIndicator = append(this.item, $("span.submenu-indicator" + ThemeIcon.asCSSSelector(Codicon.menuSubmenu)));
      this.submenuIndicator.setAttribute("aria-hidden", "true");
    }
    this._register(addDisposableListener(this.element, EventType.KEY_UP, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.RightArrow) || event.equals(KeyCode.Enter)) {
        EventHelper.stop(e, true);
        this.createSubmenu(true);
      }
    }));
    this._register(addDisposableListener(this.element, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (getActiveElement() === this.item) {
        if (event.equals(KeyCode.RightArrow) || event.equals(KeyCode.Enter)) {
          EventHelper.stop(e, true);
        }
      }
    }));
    this._register(addDisposableListener(this.element, EventType.MOUSE_MOVE, (e) => {
      if (e.movementX === 0 && e.movementY === 0) {
        return;
      }
      if (!this.mouseOver) {
        this.mouseOver = true;
        this.showScheduler.schedule();
      }
    }));
    this._register(addDisposableListener(this.element, EventType.MOUSE_LEAVE, (e) => {
      this.mouseOver = false;
    }));
    this._register(addDisposableListener(this.element, EventType.FOCUS_OUT, (e) => {
      if (this.element && !isAncestor(getActiveElement(), this.element)) {
        this.hideScheduler.schedule();
      }
    }));
    this._register(this.parentData.parent.onScroll(() => {
      if (this.parentData.submenu === this.mysubmenu) {
        this.parentData.parent.focus(false);
        this.cleanupExistingSubmenu(true);
      }
    }));
  }
  updateEnabled() {
  }
  open(selectFirst) {
    this.cleanupExistingSubmenu(false);
    this.createSubmenu(selectFirst);
  }
  onClick(e) {
    EventHelper.stop(e, true);
    this.cleanupExistingSubmenu(false);
    this.createSubmenu(true);
  }
  cleanupExistingSubmenu(force) {
    if (this.parentData.submenu && (force || this.parentData.submenu !== this.mysubmenu)) {
      try {
        this.parentData.submenu.dispose();
      } catch {
      }
      this.parentData.submenu = void 0;
      this.updateAriaExpanded("false");
      if (this.submenuContainer) {
        this.submenuDisposables.clear();
        this.submenuContainer = void 0;
      }
    }
  }
  calculateSubmenuMenuLayout(windowDimensions, submenu, entry, expandDirection) {
    const ret = { top: 0, left: 0 };
    ret.left = layout(windowDimensions.width, submenu.width, { position: expandDirection.horizontal === 0 /* Right */ ? LayoutAnchorPosition.Before : LayoutAnchorPosition.After, offset: entry.left, size: entry.width }).position;
    if (ret.left >= entry.left && ret.left < entry.left + entry.width) {
      if (entry.left + 10 + submenu.width <= windowDimensions.width) {
        ret.left = entry.left + 10;
      }
      entry.top += 10;
      entry.height = 0;
    }
    ret.top = layout(windowDimensions.height, submenu.height, { position: LayoutAnchorPosition.Before, offset: entry.top, size: 0 }).position;
    if (ret.top + submenu.height === entry.top && ret.top + entry.height + submenu.height <= windowDimensions.height) {
      ret.top += entry.height;
    }
    return ret;
  }
  createSubmenu(selectFirstItem = true) {
    if (!this.element) {
      return;
    }
    if (!this.parentData.submenu) {
      this.updateAriaExpanded("true");
      this.submenuContainer = append(this.element, $("div.monaco-submenu"));
      this.submenuContainer.classList.add("menubar-menu-items-holder", "context-view");
      const computedStyles = getWindow(this.parentData.parent.domNode).getComputedStyle(this.parentData.parent.domNode);
      const paddingTop = parseFloat(computedStyles.paddingTop || "0") || 0;
      this.submenuContainer.style.position = "fixed";
      this.submenuContainer.style.top = "0";
      this.submenuContainer.style.left = "0";
      this.submenuContainer.style.zIndex = "1";
      this.parentData.submenu = new Menu(this.submenuContainer, this.submenuActions.length ? this.submenuActions : [new EmptySubmenuAction()], this.submenuOptions, this.menuStyle);
      const entryBox = this.element.getBoundingClientRect();
      const entryBoxUpdated = {
        top: entryBox.top - paddingTop,
        left: entryBox.left,
        height: entryBox.height + 2 * paddingTop,
        width: entryBox.width
      };
      const viewBox = this.submenuContainer.getBoundingClientRect();
      const window = getWindow(this.element);
      const { top, left } = this.calculateSubmenuMenuLayout(new Dimension(window.innerWidth, window.innerHeight), Dimension.lift(viewBox), entryBoxUpdated, this.expandDirection);
      this.submenuContainer.style.left = `${left - viewBox.left}px`;
      this.submenuContainer.style.top = `${top - viewBox.top}px`;
      this.submenuDisposables.add(addDisposableListener(this.submenuContainer, EventType.KEY_UP, (e) => {
        const event = new StandardKeyboardEvent(e);
        if (event.equals(KeyCode.LeftArrow)) {
          EventHelper.stop(e, true);
          this.parentData.parent.focus();
          this.cleanupExistingSubmenu(true);
        }
      }));
      this.submenuDisposables.add(addDisposableListener(this.submenuContainer, EventType.KEY_DOWN, (e) => {
        const event = new StandardKeyboardEvent(e);
        if (event.equals(KeyCode.LeftArrow)) {
          EventHelper.stop(e, true);
        }
      }));
      this.submenuDisposables.add(this.parentData.submenu.onDidCancel(() => {
        this.parentData.parent.focus();
        this.cleanupExistingSubmenu(true);
      }));
      this.parentData.submenu.focus(selectFirstItem);
      this.mysubmenu = this.parentData.submenu;
    } else {
      this.parentData.submenu.focus(false);
    }
  }
  updateAriaExpanded(value) {
    if (this.item) {
      this.item?.setAttribute("aria-expanded", value);
    }
  }
  applyStyle() {
    super.applyStyle();
    const isSelected = this.element && this.element.classList.contains("focused");
    const fgColor = isSelected && this.menuStyle.selectionForegroundColor ? this.menuStyle.selectionForegroundColor : this.menuStyle.foregroundColor;
    if (this.submenuIndicator) {
      this.submenuIndicator.style.color = fgColor ?? "";
    }
  }
  dispose() {
    super.dispose();
    this.hideScheduler.dispose();
    if (this.mysubmenu) {
      this.mysubmenu.dispose();
      this.mysubmenu = null;
    }
    if (this.submenuContainer) {
      this.submenuContainer = void 0;
    }
  }
}
class MenuSeparatorActionViewItem extends ActionViewItem {
  constructor(context, action, options, menuStyles) {
    super(context, action, options);
    this.menuStyles = menuStyles;
  }
  render(container) {
    super.render(container);
    if (this.label) {
      this.label.style.borderBottomColor = this.menuStyles.separatorColor ? `${this.menuStyles.separatorColor}` : "";
    }
  }
}
function cleanMnemonic(label) {
  const regex = MENU_MNEMONIC_REGEX;
  const matches = regex.exec(label);
  if (!matches) {
    return label;
  }
  const mnemonicInText = !matches[1];
  return label.replace(regex, mnemonicInText ? "$2$3" : "").trim();
}
function formatRule(c) {
  const fontCharacter = getCodiconFontCharacters()[c.id];
  return `.codicon-${c.id}:before { content: '\\${fontCharacter.toString(16)}'; }`;
}
function getMenuWidgetCSS(style, isForShadowDom) {
  const borderColor = style.borderColor ?? "var(--vscode-menu-border)";
  const menuShadow = `var(--vscode-shadow-lg${style.shadowColor ? `, 0 0 12px ${style.shadowColor}` : ""})`;
  let result = (
    /* css */
    `
.monaco-menu {
	font-size: 13px;
	border-radius: var(--vscode-cornerRadius-large);
	border: var(--vscode-strokeThickness) solid ${borderColor};
	min-width: 160px;
}

${formatRule(Codicon.menuSelection)}
${formatRule(Codicon.menuSubmenu)}

.monaco-menu .monaco-action-bar {
	text-align: right;
	overflow: hidden;
	white-space: nowrap;
}

.monaco-menu .monaco-action-bar .actions-container {
	display: flex;
	margin: 0 auto;
	padding: 0;
	width: 100%;
	justify-content: flex-end;
}

.monaco-menu .monaco-action-bar.vertical .actions-container {
	display: inline-block;
}

.monaco-menu .monaco-action-bar.reverse .actions-container {
	flex-direction: row-reverse;
}

.monaco-menu .monaco-action-bar .action-item {
	cursor: pointer;
	display: inline-block;
	transition: transform 50ms ease;
	position: relative;  /* DO NOT REMOVE - this is the key to preventing the ghosting icon bug in Chrome 42 */
}

.monaco-menu .monaco-action-bar .action-item.disabled {
	cursor: default;
}

.monaco-menu .monaco-action-bar .action-item .icon,
.monaco-menu .monaco-action-bar .action-item .codicon {
	display: inline-block;
}

.monaco-menu .monaco-action-bar .action-item .codicon {
	display: flex;
	align-items: center;
}

.monaco-menu .monaco-action-bar .action-label {
	font-size: 11px;
	margin-right: 4px;
}

.monaco-menu .monaco-action-bar .action-item.disabled .action-label,
.monaco-menu .monaco-action-bar .action-item.disabled .action-label:hover {
	color: var(--vscode-disabledForeground);
}

/* Vertical actions */

.monaco-menu .monaco-action-bar.vertical {
	text-align: left;
}

.monaco-menu .monaco-action-bar.vertical .action-item {
	display: block;
}

.monaco-menu .monaco-action-bar.vertical .action-label.separator {
	display: block;
	border-bottom: 1px solid var(--vscode-menu-separatorBackground);
	padding-top: 1px;
	padding: 30px;
}

.monaco-menu .secondary-actions .monaco-action-bar .action-label {
	margin-left: 6px;
}

/* Action Items */
.monaco-menu .monaco-action-bar .action-item.select-container {
	overflow: hidden; /* somehow the dropdown overflows its container, we prevent it here to not push */
	flex: 1;
	max-width: 170px;
	min-width: 60px;
	display: flex;
	align-items: center;
	justify-content: center;
	margin-right: 10px;
}

.monaco-menu .monaco-action-bar.vertical {
	margin-left: 0;
	overflow: visible;
}

.monaco-menu .monaco-action-bar.vertical .actions-container {
	display: block;
}

.monaco-menu .monaco-action-bar.vertical .action-item {
	padding: 0;
	transform: none;
	display: flex;
}

.monaco-menu .monaco-action-bar.vertical .action-item.active {
	transform: none;
}

.monaco-menu .monaco-action-bar.vertical .action-menu-item {
	flex: 1 1 auto;
	display: flex;
	height: 24px;
	align-items: center;
	position: relative;
	margin: 0 4px;
	border-radius: var(--vscode-cornerRadius-medium);
}

.monaco-menu .monaco-action-bar.vertical .action-menu-item:hover .keybinding,
.monaco-menu .monaco-action-bar.vertical .action-menu-item:focus .keybinding {
	opacity: unset;
}

.monaco-menu .monaco-action-bar.vertical .action-label {
	flex: 1 1 auto;
	text-decoration: none;
	padding: 0 1em;
	background: none;
	font-size: 12px;
	line-height: 1;
}

.monaco-menu .monaco-action-bar.vertical .keybinding,
.monaco-menu .monaco-action-bar.vertical .submenu-indicator {
	display: inline-block;
	flex: 2 1 auto;
	padding: 0 1em;
	text-align: right;
	font-size: 12px;
	line-height: 1;
	opacity: 0.7;
}

.monaco-menu .monaco-action-bar.vertical .submenu-indicator {
	height: 100%;
}

.monaco-menu .monaco-action-bar.vertical .submenu-indicator.codicon {
	font-size: 16px !important;
	display: flex;
	align-items: center;
}

.monaco-menu .monaco-action-bar.vertical .submenu-indicator.codicon::before {
	margin-left: auto;
	margin-right: -20px;
}

.monaco-menu .monaco-action-bar.vertical .action-item.disabled .keybinding,
.monaco-menu .monaco-action-bar.vertical .action-item.disabled .submenu-indicator {
	opacity: 0.4;
}

.monaco-menu .monaco-action-bar.vertical .action-label:not(.separator) {
	display: inline-block;
	box-sizing: border-box;
	margin: 0;
}

.monaco-menu .monaco-action-bar.vertical .action-item {
	position: static;
	overflow: visible;
}

.monaco-menu .monaco-action-bar.vertical .action-item .monaco-submenu {
	position: absolute;
}

.monaco-menu .monaco-action-bar.vertical .action-label.separator {
	width: 100%;
	height: 0px !important;
	opacity: 1;
}

.monaco-menu .monaco-action-bar.vertical .action-label.separator.text {
	padding: 0.7em 1em 0.1em 1em;
	font-weight: bold;
	opacity: 1;
}

.monaco-menu .monaco-action-bar.vertical .action-label:hover {
	color: inherit;
}

.monaco-menu .monaco-action-bar.vertical .menu-item-check {
	position: absolute;
	visibility: hidden;
	width: 1em;
	height: 100%;
}

.monaco-menu .monaco-action-bar.vertical .action-menu-item.checked .menu-item-check {
	visibility: visible;
	display: flex;
	align-items: center;
	justify-content: center;
}

/* Context Menu */

.context-view.monaco-menu-container {
	${CONTEXT_VIEW_MENU_MOTION_SHADOW_VARIABLE}: ${menuShadow};
	outline: 0;
	border: none;
	animation: fadeIn 0.083s linear;
	-webkit-app-region: no-drag;
	box-shadow: var(${CONTEXT_VIEW_MENU_MOTION_SHADOW_VARIABLE});
	border-radius: var(--vscode-cornerRadius-large);
	overflow: hidden;
}

.context-view.monaco-menu-container :focus,
.context-view.monaco-menu-container .monaco-action-bar.vertical:focus,
.context-view.monaco-menu-container .monaco-action-bar.vertical :focus {
	outline: 0;
}

.hc-black .context-view.monaco-menu-container,
.hc-light .context-view.monaco-menu-container,
:host-context(.hc-black) .context-view.monaco-menu-container,
:host-context(.hc-light) .context-view.monaco-menu-container {
	${CONTEXT_VIEW_MENU_MOTION_SHADOW_VARIABLE}: none;
	box-shadow: none;
}

.hc-black .monaco-menu .monaco-action-bar.vertical .action-item.focused,
.hc-light .monaco-menu .monaco-action-bar.vertical .action-item.focused,
:host-context(.hc-black) .monaco-menu .monaco-action-bar.vertical .action-item.focused,
:host-context(.hc-light) .monaco-menu .monaco-action-bar.vertical .action-item.focused {
	background: none;
}

/* Show the menu item selection border only for keyboard navigation. Pointer-driven focus typically does not set :focus-visible, so suppress the border in that case. */
.monaco-menu .monaco-action-bar.vertical .action-menu-item:focus:not(:focus-visible) {
	outline: none !important;
	outline-offset: 0 !important;
}

/* High contrast themes always show the selection border to indicate the focused item, regardless of input modality. The duplicated .monaco-menu raises specificity above the keyboard-only suppression rule above so this wins independent of declaration order. */
.hc-black .monaco-menu.monaco-menu .monaco-action-bar.vertical .action-item.focused > .action-menu-item,
.hc-light .monaco-menu.monaco-menu .monaco-action-bar.vertical .action-item.focused > .action-menu-item {
	outline: 1px solid var(--vscode-menu-selectionBorder) !important;
	outline-offset: -1px !important;
}

/* Keep :host-context separate because WebKit otherwise rejects the valid selectors above. */
:host-context(.hc-black) .monaco-menu.monaco-menu .monaco-action-bar.vertical .action-item.focused > .action-menu-item,
:host-context(.hc-light) .monaco-menu.monaco-menu .monaco-action-bar.vertical .action-item.focused > .action-menu-item {
	outline: 1px solid var(--vscode-menu-selectionBorder) !important;
	outline-offset: -1px !important;
}

/* Vertical Action Bar Styles */

.monaco-menu .monaco-action-bar.vertical {
	padding: 4px 0;
}

.monaco-menu .monaco-action-bar.vertical .action-menu-item {
	height: 24px;
}

.monaco-menu .monaco-action-bar.vertical .action-label:not(.separator),
.monaco-menu .monaco-action-bar.vertical .keybinding {
	font-size: inherit;
	padding: 0 2em;
	max-height: 100%;
}

.monaco-menu .monaco-action-bar.vertical .menu-item-check {
	font-size: inherit;
	width: 2em;
}

.monaco-menu .monaco-action-bar.vertical .action-label.separator {
	font-size: inherit;
	margin: 5px 0 !important;
	padding: 0;
	border-radius: 0;
}

.linux .monaco-menu .monaco-action-bar.vertical .action-label.separator,
:host-context(.linux) .monaco-menu .monaco-action-bar.vertical .action-label.separator {
	margin-left: 0;
	margin-right: 0;
}

.monaco-menu .monaco-action-bar.vertical .submenu-indicator {
	font-size: 60%;
	padding: 0 1.8em;
}

.linux .monaco-menu .monaco-action-bar.vertical .submenu-indicator,
:host-context(.linux) .monaco-menu .monaco-action-bar.vertical .submenu-indicator {
	height: 100%;
	mask-size: 10px 10px;
	-webkit-mask-size: 10px 10px;
}

.monaco-menu .action-item {
	cursor: default;
}`
  );
  if (isForShadowDom) {
    result += `
			/* Arrows */
			.monaco-scrollable-element > .scrollbar > .scra {
				cursor: pointer;
				font-size: 11px !important;
			}

			.monaco-scrollable-element > .visible {
				opacity: 1;

				/* Background rule added for IE9 - to allow clicks on dom node */
				background:rgba(0,0,0,0);

				transition: opacity 100ms linear;
			}
			.monaco-scrollable-element > .invisible {
				opacity: 0;
				pointer-events: none;
			}
			.monaco-scrollable-element > .invisible.fade {
				transition: opacity 800ms linear;
			}

			/* Scrollable Content Inset Shadow */
			.monaco-scrollable-element > .shadow {
				position: absolute;
				display: none;
			}
			.monaco-scrollable-element > .shadow.top {
				display: block;
				top: 0;
				left: 3px;
				height: 3px;
				width: 100%;
			}
			.monaco-scrollable-element > .shadow.left {
				display: block;
				top: 3px;
				left: 0;
				height: 100%;
				width: 3px;
			}
			.monaco-scrollable-element > .shadow.top-left-corner {
				display: block;
				top: 0;
				left: 0;
				height: 3px;
				width: 3px;
			}
			/* Fix for https://github.com/microsoft/vscode/issues/103170 */
			.monaco-menu .action-item .monaco-submenu {
				z-index: 1;
			}
		`;
    const scrollbarShadowColor = style.scrollbarShadow;
    if (scrollbarShadowColor) {
      result += `
				.monaco-scrollable-element > .shadow.top {
					box-shadow: ${scrollbarShadowColor} 0 6px 6px -6px inset;
				}

				.monaco-scrollable-element > .shadow.left {
					box-shadow: ${scrollbarShadowColor} 6px 0 6px -6px inset;
				}

				.monaco-scrollable-element > .shadow.top.left {
					box-shadow: ${scrollbarShadowColor} 6px 6px 6px -6px inset;
				}
			`;
    }
    const scrollbarSliderBackgroundColor = style.scrollbarSliderBackground;
    if (scrollbarSliderBackgroundColor) {
      result += `
				.monaco-scrollable-element > .scrollbar > .slider {
					background: ${scrollbarSliderBackgroundColor};
				}
			`;
    }
    const scrollbarSliderHoverBackgroundColor = style.scrollbarSliderHoverBackground;
    if (scrollbarSliderHoverBackgroundColor) {
      result += `
				.monaco-scrollable-element > .scrollbar > .slider:hover {
					background: ${scrollbarSliderHoverBackgroundColor};
				}
			`;
    }
    const scrollbarSliderActiveBackgroundColor = style.scrollbarSliderActiveBackground;
    if (scrollbarSliderActiveBackgroundColor) {
      result += `
				.monaco-scrollable-element > .scrollbar > .slider.active {
					background: ${scrollbarSliderActiveBackgroundColor};
				}
			`;
    }
  }
  return result;
}
export {
  HorizontalDirection,
  MENU_ESCAPED_MNEMONIC_REGEX,
  MENU_MNEMONIC_REGEX,
  Menu,
  VerticalDirection,
  cleanMnemonic,
  formatRule,
  getMenuWidgetCSS,
  unthemedMenuStyles
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFx1aVxcbWVudVxcbWVudS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGlzRmlyZWZveCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgRXZlbnRUeXBlIGFzIFRvdWNoRXZlbnRUeXBlLCBHZXN0dXJlIH0gZnJvbSAnLi4vLi4vdG91Y2guanMnO1xuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBhcHBlbmQsIGNsZWFyTm9kZSwgRGltZW5zaW9uLCBFdmVudEhlbHBlciwgRXZlbnRMaWtlLCBFdmVudFR5cGUsIGdldEFjdGl2ZUVsZW1lbnQsIGdldFdpbmRvdywgSURvbU5vZGVQYWdlUG9zaXRpb24sIGlzQW5jZXN0b3IsIGlzSW5TaGFkb3dET00gfSBmcm9tICcuLi8uLi9kb20uanMnO1xuaW1wb3J0IHsgY3JlYXRlU3R5bGVTaGVldCB9IGZyb20gJy4uLy4uL2RvbVN0eWxlc2hlZXRzLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIsIEFjdGlvbnNPcmllbnRhdGlvbiwgSUFjdGlvblZpZXdJdGVtUHJvdmlkZXIgfSBmcm9tICcuLi9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IEFjdGlvblZpZXdJdGVtLCBCYXNlQWN0aW9uVmlld0l0ZW0sIElBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IERvbVNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vc2Nyb2xsYmFyL3Njcm9sbGFibGVFbGVtZW50LmpzJztcbmltcG9ydCB7IEVtcHR5U3VibWVudUFjdGlvbiwgSUFjdGlvbiwgSUFjdGlvblJ1bm5lciwgU2VwYXJhdG9yLCBTdWJtZW51QWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGdldENvZGljb25Gb250Q2hhcmFjdGVycyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb2RpY29uc1V0aWwuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBzdHJpcEljb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEtleWJpbmRpbmcgfSBmcm9tICcuLi8uLi8uLi9jb21tb24va2V5YmluZGluZ3MuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc0xpbnV4LCBpc01hY2ludG9zaCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBTY3JvbGxiYXJWaXNpYmlsaXR5LCBTY3JvbGxFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zY3JvbGxhYmxlLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgQW5jaG9yQWxpZ25tZW50LCBsYXlvdXQsIExheW91dEFuY2hvclBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xheW91dC5qcyc7XG5pbXBvcnQgeyBDT05URVhUX1ZJRVdfTUVOVV9NT1RJT05fU0hBRE9XX1ZBUklBQkxFIH0gZnJvbSAnLi4vY29udGV4dHZpZXcvY29udGV4dHZpZXcuanMnO1xuXG5leHBvcnQgY29uc3QgTUVOVV9NTkVNT05JQ19SRUdFWCA9IC9cXCgmKFteXFxzJl0pXFwpfChefFteJl0pJihbXlxccyZdKS87XG5leHBvcnQgY29uc3QgTUVOVV9FU0NBUEVEX01ORU1PTklDX1JFR0VYID0gLygmYW1wOyk/KCZhbXA7KShbXlxccyZdKS9nO1xuXG5cblxuZXhwb3J0IGVudW0gSG9yaXpvbnRhbERpcmVjdGlvbiB7XG5cdFJpZ2h0LFxuXHRMZWZ0XG59XG5cbmV4cG9ydCBlbnVtIFZlcnRpY2FsRGlyZWN0aW9uIHtcblx0QWJvdmUsXG5cdEJlbG93XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1lbnVEaXJlY3Rpb24ge1xuXHRob3Jpem9udGFsOiBIb3Jpem9udGFsRGlyZWN0aW9uO1xuXHR2ZXJ0aWNhbDogVmVydGljYWxEaXJlY3Rpb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1lbnVPcHRpb25zIHtcblx0Y29udGV4dD86IHVua25vd247XG5cdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI/OiBJQWN0aW9uVmlld0l0ZW1Qcm92aWRlcjtcblx0YWN0aW9uUnVubmVyPzogSUFjdGlvblJ1bm5lcjtcblx0Z2V0S2V5QmluZGluZz86IChhY3Rpb246IElBY3Rpb24pID0+IFJlc29sdmVkS2V5YmluZGluZyB8IHVuZGVmaW5lZDtcblx0YXJpYUxhYmVsPzogc3RyaW5nO1xuXHRlbmFibGVNbmVtb25pY3M/OiBib29sZWFuO1xuXHRhbmNob3JBbGlnbm1lbnQ/OiBBbmNob3JBbGlnbm1lbnQ7XG5cdGV4cGFuZERpcmVjdGlvbj86IElNZW51RGlyZWN0aW9uO1xuXHR1c2VFdmVudEFzQ29udGV4dD86IGJvb2xlYW47XG5cdHN1Ym1lbnVJZHM/OiBTZXQ8c3RyaW5nPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTWVudVN0eWxlcyB7XG5cdHNoYWRvd0NvbG9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGJvcmRlckNvbG9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGZvcmVncm91bmRDb2xvcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRiYWNrZ3JvdW5kQ29sb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0c2VsZWN0aW9uRm9yZWdyb3VuZENvbG9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHNlbGVjdGlvbkJhY2tncm91bmRDb2xvcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRzZWxlY3Rpb25Cb3JkZXJDb2xvcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRzZXBhcmF0b3JDb2xvcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRzY3JvbGxiYXJTaGFkb3c6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0c2Nyb2xsYmFyU2xpZGVyQmFja2dyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRzY3JvbGxiYXJTbGlkZXJIb3ZlckJhY2tncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0c2Nyb2xsYmFyU2xpZGVyQWN0aXZlQmFja2dyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY29uc3QgdW50aGVtZWRNZW51U3R5bGVzOiBJTWVudVN0eWxlcyA9IHtcblx0c2hhZG93Q29sb3I6IHVuZGVmaW5lZCxcblx0Ym9yZGVyQ29sb3I6IHVuZGVmaW5lZCxcblx0Zm9yZWdyb3VuZENvbG9yOiB1bmRlZmluZWQsXG5cdGJhY2tncm91bmRDb2xvcjogdW5kZWZpbmVkLFxuXHRzZWxlY3Rpb25Gb3JlZ3JvdW5kQ29sb3I6IHVuZGVmaW5lZCxcblx0c2VsZWN0aW9uQmFja2dyb3VuZENvbG9yOiB1bmRlZmluZWQsXG5cdHNlbGVjdGlvbkJvcmRlckNvbG9yOiB1bmRlZmluZWQsXG5cdHNlcGFyYXRvckNvbG9yOiB1bmRlZmluZWQsXG5cdHNjcm9sbGJhclNoYWRvdzogdW5kZWZpbmVkLFxuXHRzY3JvbGxiYXJTbGlkZXJCYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdHNjcm9sbGJhclNsaWRlckhvdmVyQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRzY3JvbGxiYXJTbGlkZXJBY3RpdmVCYWNrZ3JvdW5kOiB1bmRlZmluZWRcbn07XG5cbmludGVyZmFjZSBJU3ViTWVudURhdGEge1xuXHRwYXJlbnQ6IE1lbnU7XG5cdHN1Ym1lbnU/OiBNZW51O1xufVxuXG5leHBvcnQgY2xhc3MgTWVudSBleHRlbmRzIEFjdGlvbkJhciB7XG5cdHByaXZhdGUgbW5lbW9uaWNzOiBNYXA8c3RyaW5nLCBBcnJheTxCYXNlTWVudUFjdGlvblZpZXdJdGVtPj47XG5cdHByaXZhdGUgc2Nyb2xsYWJsZUVsZW1lbnQ6IERvbVNjcm9sbGFibGVFbGVtZW50O1xuXHRwcml2YXRlIG1lbnVFbGVtZW50OiBIVE1MRWxlbWVudDtcblx0c3RhdGljIGdsb2JhbFN0eWxlU2hlZXQ6IEhUTUxTdHlsZUVsZW1lbnQ7XG5cdHByb3RlY3RlZCBzdHlsZVNoZWV0OiBIVE1MU3R5bGVFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGFjdGlvbnM6IFJlYWRvbmx5QXJyYXk8SUFjdGlvbj4sIG9wdGlvbnM6IElNZW51T3B0aW9ucywgcHJpdmF0ZSByZWFkb25seSBtZW51U3R5bGVzOiBJTWVudVN0eWxlcykge1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdtb25hY28tbWVudS1jb250YWluZXInKTtcblx0XHRjb250YWluZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3ByZXNlbnRhdGlvbicpO1xuXHRcdGNvbnN0IG1lbnVFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0bWVudUVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbW9uYWNvLW1lbnUnKTtcblx0XHRtZW51RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAncHJlc2VudGF0aW9uJyk7XG5cblx0XHRzdXBlcihtZW51RWxlbWVudCwge1xuXHRcdFx0b3JpZW50YXRpb246IEFjdGlvbnNPcmllbnRhdGlvbi5WRVJUSUNBTCxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IGFjdGlvbiA9PiB0aGlzLmRvR2V0QWN0aW9uVmlld0l0ZW0oYWN0aW9uLCBvcHRpb25zLCBwYXJlbnREYXRhKSxcblx0XHRcdGNvbnRleHQ6IG9wdGlvbnMuY29udGV4dCxcblx0XHRcdGFjdGlvblJ1bm5lcjogb3B0aW9ucy5hY3Rpb25SdW5uZXIsXG5cdFx0XHRhcmlhTGFiZWw6IG9wdGlvbnMuYXJpYUxhYmVsLFxuXHRcdFx0YXJpYVJvbGU6ICdtZW51Jyxcblx0XHRcdGZvY3VzT25seUVuYWJsZWRJdGVtczogdHJ1ZSxcblx0XHRcdHRyaWdnZXJLZXlzOiB7IGtleXM6IFtLZXlDb2RlLkVudGVyLCAuLi4oaXNNYWNpbnRvc2ggfHwgaXNMaW51eCA/IFtLZXlDb2RlLlNwYWNlXSA6IFtdKV0sIGtleURvd246IHRydWUgfVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5tZW51RWxlbWVudCA9IG1lbnVFbGVtZW50O1xuXG5cdFx0dGhpcy5hY3Rpb25zTGlzdC50YWJJbmRleCA9IDA7XG5cblx0XHR0aGlzLmluaXRpYWxpemVPclVwZGF0ZVN0eWxlU2hlZXQoY29udGFpbmVyLCBtZW51U3R5bGVzKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEdlc3R1cmUuYWRkVGFyZ2V0KG1lbnVFbGVtZW50KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIobWVudUVsZW1lbnQsIEV2ZW50VHlwZS5LRVlfRE9XTiwgKGUpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblxuXHRcdFx0Ly8gU3RvcCB0YWIgbmF2aWdhdGlvbiBvZiBtZW51c1xuXHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLlRhYikpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmIChvcHRpb25zLmVuYWJsZU1uZW1vbmljcykge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG1lbnVFbGVtZW50LCBFdmVudFR5cGUuS0VZX0RPV04sIChlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGtleSA9IGUua2V5LnRvTG9jYWxlTG93ZXJDYXNlKCk7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbnMgPSB0aGlzLm1uZW1vbmljcy5nZXQoa2V5KTtcblx0XHRcdFx0aWYgKGFjdGlvbnMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cblx0XHRcdFx0XHRpZiAoYWN0aW9ucy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRcdGlmIChhY3Rpb25zWzBdIGluc3RhbmNlb2YgU3VibWVudU1lbnVBY3Rpb25WaWV3SXRlbSAmJiBhY3Rpb25zWzBdLmNvbnRhaW5lcikge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmZvY3VzSXRlbUJ5RWxlbWVudChhY3Rpb25zWzBdLmNvbnRhaW5lcik7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGFjdGlvbnNbMF0ub25DbGljayhlKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoYWN0aW9ucy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBhY3Rpb24gPSBhY3Rpb25zLnNoaWZ0KCk7XG5cdFx0XHRcdFx0XHRpZiAoYWN0aW9uICYmIGFjdGlvbi5jb250YWluZXIpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5mb2N1c0l0ZW1CeUVsZW1lbnQoYWN0aW9uLmNvbnRhaW5lcik7XG5cdFx0XHRcdFx0XHRcdGFjdGlvbnMucHVzaChhY3Rpb24pO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHR0aGlzLm1uZW1vbmljcy5zZXQoa2V5LCBhY3Rpb25zKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRpZiAoaXNMaW51eCkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG1lbnVFbGVtZW50LCBFdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cblx0XHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkhvbWUpIHx8IGV2ZW50LmVxdWFscyhLZXlDb2RlLlBhZ2VVcCkpIHtcblx0XHRcdFx0XHR0aGlzLmZvY3VzZWRJdGVtID0gdGhpcy52aWV3SXRlbXMubGVuZ3RoIC0gMTtcblx0XHRcdFx0XHR0aGlzLmZvY3VzTmV4dCgpO1xuXHRcdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZXZlbnQuZXF1YWxzKEtleUNvZGUuRW5kKSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5QYWdlRG93bikpIHtcblx0XHRcdFx0XHR0aGlzLmZvY3VzZWRJdGVtID0gMDtcblx0XHRcdFx0XHR0aGlzLmZvY3VzUHJldmlvdXMoKTtcblx0XHRcdFx0XHRFdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZG9tTm9kZSwgRXZlbnRUeXBlLk1PVVNFX09VVCwgZSA9PiB7XG5cdFx0XHRjb25zdCByZWxhdGVkVGFyZ2V0ID0gZS5yZWxhdGVkVGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuXHRcdFx0aWYgKCFpc0FuY2VzdG9yKHJlbGF0ZWRUYXJnZXQsIHRoaXMuZG9tTm9kZSkpIHtcblx0XHRcdFx0dGhpcy5mb2N1c2VkSXRlbSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy51cGRhdGVGb2N1cygpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmFjdGlvbnNMaXN0LCBFdmVudFR5cGUuTU9VU0VfTU9WRSwgZSA9PiB7XG5cdFx0XHRpZiAoZS5tb3ZlbWVudFggPT09IDAgJiYgZS5tb3ZlbWVudFkgPT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRpZiAoIXRhcmdldCB8fCAhaXNBbmNlc3Rvcih0YXJnZXQsIHRoaXMuYWN0aW9uc0xpc3QpIHx8IHRhcmdldCA9PT0gdGhpcy5hY3Rpb25zTGlzdCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHdoaWxlICh0YXJnZXQucGFyZW50RWxlbWVudCAhPT0gdGhpcy5hY3Rpb25zTGlzdCAmJiB0YXJnZXQucGFyZW50RWxlbWVudCAhPT0gbnVsbCkge1xuXHRcdFx0XHR0YXJnZXQgPSB0YXJnZXQucGFyZW50RWxlbWVudDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ2FjdGlvbi1pdGVtJykpIHtcblx0XHRcdFx0Y29uc3QgbGFzdEZvY3VzZWRJdGVtID0gdGhpcy5mb2N1c2VkSXRlbTtcblx0XHRcdFx0Ly8gTW92aW5nIHdpdGhpbiB0aGUgZm9jdXNlZCBpdGVtIGlzIHRoZSBjb21tb24gY2FzZTsgc2tpcCB0aGUgaXRlbSBsb29rdXAgZm9yIGl0XG5cdFx0XHRcdGlmIChsYXN0Rm9jdXNlZEl0ZW0gIT09IHVuZGVmaW5lZCAmJiB0aGlzLmFjdGlvbnNMaXN0LmNoaWxkcmVuW2xhc3RGb2N1c2VkSXRlbV0gPT09IHRhcmdldCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuc2V0Rm9jdXNlZEl0ZW0odGFyZ2V0KTtcblxuXHRcdFx0XHRpZiAobGFzdEZvY3VzZWRJdGVtICE9PSB0aGlzLmZvY3VzZWRJdGVtKSB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVGb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gU3VwcG9ydCB0b3VjaCBvbiBhY3Rpb25zIGxpc3QgdG8gZm9jdXMgaXRlbXMgKG5lZWRlZCBmb3Igc3VibWVudXMpXG5cdFx0dGhpcy5fcmVnaXN0ZXIoR2VzdHVyZS5hZGRUYXJnZXQodGhpcy5hY3Rpb25zTGlzdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmFjdGlvbnNMaXN0LCBUb3VjaEV2ZW50VHlwZS5UYXAsIGUgPT4ge1xuXHRcdFx0bGV0IHRhcmdldCA9IGUuaW5pdGlhbFRhcmdldCBhcyBIVE1MRWxlbWVudDtcblx0XHRcdGlmICghdGFyZ2V0IHx8ICFpc0FuY2VzdG9yKHRhcmdldCwgdGhpcy5hY3Rpb25zTGlzdCkgfHwgdGFyZ2V0ID09PSB0aGlzLmFjdGlvbnNMaXN0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0d2hpbGUgKHRhcmdldC5wYXJlbnRFbGVtZW50ICE9PSB0aGlzLmFjdGlvbnNMaXN0ICYmIHRhcmdldC5wYXJlbnRFbGVtZW50ICE9PSBudWxsKSB7XG5cdFx0XHRcdHRhcmdldCA9IHRhcmdldC5wYXJlbnRFbGVtZW50O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucygnYWN0aW9uLWl0ZW0nKSkge1xuXHRcdFx0XHRjb25zdCBsYXN0Rm9jdXNlZEl0ZW0gPSB0aGlzLmZvY3VzZWRJdGVtO1xuXHRcdFx0XHR0aGlzLnNldEZvY3VzZWRJdGVtKHRhcmdldCk7XG5cblx0XHRcdFx0aWYgKGxhc3RGb2N1c2VkSXRlbSAhPT0gdGhpcy5mb2N1c2VkSXRlbSkge1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlRm9jdXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXG5cdFx0Y29uc3QgcGFyZW50RGF0YTogSVN1Yk1lbnVEYXRhID0ge1xuXHRcdFx0cGFyZW50OiB0aGlzXG5cdFx0fTtcblxuXHRcdHRoaXMubW5lbW9uaWNzID0gbmV3IE1hcDxzdHJpbmcsIEFycmF5PEJhc2VNZW51QWN0aW9uVmlld0l0ZW0+PigpO1xuXG5cdFx0Ly8gU2Nyb2xsIExvZ2ljXG5cdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEb21TY3JvbGxhYmxlRWxlbWVudChtZW51RWxlbWVudCwge1xuXHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IHRydWUsXG5cdFx0XHRob3Jpem9udGFsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkhpZGRlbixcblx0XHRcdHZlcnRpY2FsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LlZpc2libGUsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhclNpemU6IDcsXG5cdFx0XHRoYW5kbGVNb3VzZVdoZWVsOiB0cnVlLFxuXHRcdFx0dXNlU2hhZG93czogdHJ1ZVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHNjcm9sbEVsZW1lbnQgPSB0aGlzLnNjcm9sbGFibGVFbGVtZW50LmdldERvbU5vZGUoKTtcblx0XHRzY3JvbGxFbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJyc7XG5cblx0XHR0aGlzLnN0eWxlU2Nyb2xsRWxlbWVudChzY3JvbGxFbGVtZW50LCBtZW51U3R5bGVzKTtcblxuXHRcdC8vIFN1cHBvcnQgc2Nyb2xsIG9uIG1lbnUgZHJhZ1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihtZW51RWxlbWVudCwgVG91Y2hFdmVudFR5cGUuQ2hhbmdlLCBlID0+IHtcblx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cblx0XHRcdGNvbnN0IHNjcm9sbFRvcCA9IHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuZ2V0U2Nyb2xsUG9zaXRpb24oKS5zY3JvbGxUb3A7XG5cdFx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50LnNldFNjcm9sbFBvc2l0aW9uKHsgc2Nyb2xsVG9wOiBzY3JvbGxUb3AgLSBlLnRyYW5zbGF0aW9uWSB9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIoc2Nyb2xsRWxlbWVudCwgRXZlbnRUeXBlLk1PVVNFX1VQLCBlID0+IHtcblx0XHRcdC8vIEFic29yYiBjbGlja3MgaW4gbWVudSBkZWFkIHNwYWNlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy82MzU3NVxuXHRcdFx0Ly8gV2UgZG8gdGhpcyBvbiB0aGUgc2Nyb2xsIGVsZW1lbnQgc28gdGhlIHNjcm9sbCBiYXIgZG9lc24ndCBkaXNtaXNzIHRoZSBtZW51IGVpdGhlclxuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHdpbmRvdyA9IGdldFdpbmRvdyhjb250YWluZXIpO1xuXHRcdG1lbnVFbGVtZW50LnN0eWxlLm1heEhlaWdodCA9IGAke01hdGgubWF4KDEwLCB3aW5kb3cuaW5uZXJIZWlnaHQgLSBjb250YWluZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkudG9wIC0gMzUpfXB4YDtcblxuXHRcdGFjdGlvbnMgPSBhY3Rpb25zLmZpbHRlcigoYSwgaWR4KSA9PiB7XG5cdFx0XHRpZiAob3B0aW9ucy5zdWJtZW51SWRzPy5oYXMoYS5pZCkpIHtcblx0XHRcdFx0Y29uc29sZS53YXJuKGBGb3VuZCBzdWJtZW51IGN5Y2xlOiAke2EuaWR9YCk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRmlsdGVyIG91dCBjb25zZWN1dGl2ZSBvciB1c2VsZXNzIHNlcGFyYXRvcnNcblx0XHRcdGlmIChhIGluc3RhbmNlb2YgU2VwYXJhdG9yKSB7XG5cdFx0XHRcdGlmIChpZHggPT09IGFjdGlvbnMubGVuZ3RoIC0gMSB8fCBpZHggPT09IDApIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBwcmV2QWN0aW9uID0gYWN0aW9uc1tpZHggLSAxXTtcblx0XHRcdFx0aWYgKHByZXZBY3Rpb24gaW5zdGFuY2VvZiBTZXBhcmF0b3IpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cblx0XHR0aGlzLnB1c2goYWN0aW9ucywgeyBpY29uOiB0cnVlLCBsYWJlbDogdHJ1ZSwgaXNNZW51OiB0cnVlIH0pO1xuXG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuZ2V0RG9tTm9kZSgpKTtcblx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50LnNjYW5Eb21Ob2RlKCk7XG5cblx0XHR0aGlzLnZpZXdJdGVtcy5maWx0ZXIoaXRlbSA9PiAhKGl0ZW0gaW5zdGFuY2VvZiBNZW51U2VwYXJhdG9yQWN0aW9uVmlld0l0ZW0pKS5mb3JFYWNoKChpdGVtLCBpbmRleCwgYXJyYXkpID0+IHtcblx0XHRcdChpdGVtIGFzIEJhc2VNZW51QWN0aW9uVmlld0l0ZW0pLnVwZGF0ZVBvc2l0aW9uSW5TZXQoaW5kZXggKyAxLCBhcnJheS5sZW5ndGgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBpbml0aWFsaXplT3JVcGRhdGVTdHlsZVNoZWV0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHN0eWxlOiBJTWVudVN0eWxlcyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5zdHlsZVNoZWV0KSB7XG5cdFx0XHRpZiAoaXNJblNoYWRvd0RPTShjb250YWluZXIpKSB7XG5cdFx0XHRcdHRoaXMuc3R5bGVTaGVldCA9IGNyZWF0ZVN0eWxlU2hlZXQoY29udGFpbmVyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICghTWVudS5nbG9iYWxTdHlsZVNoZWV0KSB7XG5cdFx0XHRcdFx0TWVudS5nbG9iYWxTdHlsZVNoZWV0ID0gY3JlYXRlU3R5bGVTaGVldCgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuc3R5bGVTaGVldCA9IE1lbnUuZ2xvYmFsU3R5bGVTaGVldDtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5zdHlsZVNoZWV0LnRleHRDb250ZW50ID0gZ2V0TWVudVdpZGdldENTUyhzdHlsZSwgaXNJblNoYWRvd0RPTShjb250YWluZXIpKTtcblx0fVxuXG5cdHByaXZhdGUgc3R5bGVTY3JvbGxFbGVtZW50KHNjcm9sbEVsZW1lbnQ6IEhUTUxFbGVtZW50LCBzdHlsZTogSU1lbnVTdHlsZXMpOiB2b2lkIHtcblxuXHRcdGNvbnN0IGZnQ29sb3IgPSBzdHlsZS5mb3JlZ3JvdW5kQ29sb3IgPz8gJyc7XG5cdFx0Y29uc3QgYmdDb2xvciA9IHN0eWxlLmJhY2tncm91bmRDb2xvciA/PyAnJztcblx0XHRjb25zdCBib3JkZXJSYWRpdXMgPSAndmFyKC0tdnNjb2RlLWNvcm5lclJhZGl1cy1sYXJnZSknO1xuXG5cdFx0c2Nyb2xsRWxlbWVudC5zdHlsZS5ib3JkZXJSYWRpdXMgPSBib3JkZXJSYWRpdXM7XG5cdFx0c2Nyb2xsRWxlbWVudC5zdHlsZS5jb2xvciA9IGZnQ29sb3I7XG5cdFx0c2Nyb2xsRWxlbWVudC5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBiZ0NvbG9yO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0Q29udGFpbmVyKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5zY3JvbGxhYmxlRWxlbWVudC5nZXREb21Ob2RlKCk7XG5cdH1cblxuXHRnZXQgb25TY3JvbGwoKTogRXZlbnQ8U2Nyb2xsRXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zY3JvbGxhYmxlRWxlbWVudC5vblNjcm9sbDtcblx0fVxuXG5cdGdldCBzY3JvbGxPZmZzZXQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5tZW51RWxlbWVudC5zY3JvbGxUb3A7XG5cdH1cblxuXHR0cmlnZ2VyKGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoaW5kZXggPD0gdGhpcy52aWV3SXRlbXMubGVuZ3RoICYmIGluZGV4ID49IDApIHtcblx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLnZpZXdJdGVtc1tpbmRleF07XG5cdFx0XHRpZiAoaXRlbSBpbnN0YW5jZW9mIFN1Ym1lbnVNZW51QWN0aW9uVmlld0l0ZW0pIHtcblx0XHRcdFx0c3VwZXIuZm9jdXMoaW5kZXgpO1xuXHRcdFx0XHRpdGVtLm9wZW4odHJ1ZSk7XG5cdFx0XHR9IGVsc2UgaWYgKGl0ZW0gaW5zdGFuY2VvZiBCYXNlTWVudUFjdGlvblZpZXdJdGVtKSB7XG5cdFx0XHRcdHN1cGVyLnJ1bihpdGVtLl9hY3Rpb24sIGl0ZW0uX2NvbnRleHQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZm9jdXNJdGVtQnlFbGVtZW50KGVsZW1lbnQ6IEhUTUxFbGVtZW50KSB7XG5cdFx0Y29uc3QgbGFzdEZvY3VzZWRJdGVtID0gdGhpcy5mb2N1c2VkSXRlbTtcblx0XHR0aGlzLnNldEZvY3VzZWRJdGVtKGVsZW1lbnQpO1xuXG5cdFx0aWYgKGxhc3RGb2N1c2VkSXRlbSAhPT0gdGhpcy5mb2N1c2VkSXRlbSkge1xuXHRcdFx0dGhpcy51cGRhdGVGb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0Rm9jdXNlZEl0ZW0oZWxlbWVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuYWN0aW9uc0xpc3QuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGVsZW0gPSB0aGlzLmFjdGlvbnNMaXN0LmNoaWxkcmVuW2ldO1xuXHRcdFx0aWYgKGVsZW1lbnQgPT09IGVsZW0pIHtcblx0XHRcdFx0dGhpcy5mb2N1c2VkSXRlbSA9IGk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVGb2N1cyhmcm9tUmlnaHQ/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0c3VwZXIudXBkYXRlRm9jdXMoZnJvbVJpZ2h0LCB0cnVlLCB0cnVlKTtcblxuXHRcdGlmICh0eXBlb2YgdGhpcy5mb2N1c2VkSXRlbSAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdC8vIFdvcmthcm91bmQgZm9yICM4MDA0NyBjYXVzZWQgYnkgYW4gaXNzdWUgaW4gY2hyb21pdW1cblx0XHRcdC8vIGh0dHBzOi8vYnVncy5jaHJvbWl1bS5vcmcvcC9jaHJvbWl1bS9pc3N1ZXMvZGV0YWlsP2lkPTQxNDI4M1xuXHRcdFx0Ly8gV2hlbiB0aGF0J3MgZml4ZWQsIGp1c3QgY2FsbCB0aGlzLnNjcm9sbGFibGVFbGVtZW50LnNjYW5Eb21Ob2RlKClcblx0XHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuc2V0U2Nyb2xsUG9zaXRpb24oe1xuXHRcdFx0XHRzY3JvbGxUb3A6IE1hdGgucm91bmQodGhpcy5tZW51RWxlbWVudC5zY3JvbGxUb3ApXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRvR2V0QWN0aW9uVmlld0l0ZW0oYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zOiBJTWVudU9wdGlvbnMsIHBhcmVudERhdGE6IElTdWJNZW51RGF0YSk6IEJhc2VBY3Rpb25WaWV3SXRlbSB7XG5cdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIFNlcGFyYXRvcikge1xuXHRcdFx0cmV0dXJuIG5ldyBNZW51U2VwYXJhdG9yQWN0aW9uVmlld0l0ZW0ob3B0aW9ucy5jb250ZXh0LCBhY3Rpb24sIHsgaWNvbjogdHJ1ZSB9LCB0aGlzLm1lbnVTdHlsZXMpO1xuXHRcdH0gZWxzZSBpZiAoYWN0aW9uIGluc3RhbmNlb2YgU3VibWVudUFjdGlvbikge1xuXHRcdFx0Y29uc3QgbWVudUFjdGlvblZpZXdJdGVtID0gbmV3IFN1Ym1lbnVNZW51QWN0aW9uVmlld0l0ZW0oYWN0aW9uLCBhY3Rpb24uYWN0aW9ucywgcGFyZW50RGF0YSwgeyAuLi5vcHRpb25zLCBzdWJtZW51SWRzOiBuZXcgU2V0KFsuLi4ob3B0aW9ucy5zdWJtZW51SWRzIHx8IFtdKSwgYWN0aW9uLmlkXSkgfSwgdGhpcy5tZW51U3R5bGVzKTtcblxuXHRcdFx0aWYgKG9wdGlvbnMuZW5hYmxlTW5lbW9uaWNzKSB7XG5cdFx0XHRcdGNvbnN0IG1uZW1vbmljID0gbWVudUFjdGlvblZpZXdJdGVtLmdldE1uZW1vbmljKCk7XG5cdFx0XHRcdGlmIChtbmVtb25pYyAmJiBtZW51QWN0aW9uVmlld0l0ZW0uaXNFbmFibGVkKCkpIHtcblx0XHRcdFx0XHRjb25zdCBhY3Rpb25WaWV3SXRlbXMgPSB0aGlzLm1uZW1vbmljcy5nZXQobW5lbW9uaWMpO1xuXHRcdFx0XHRcdGlmIChhY3Rpb25WaWV3SXRlbXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0YWN0aW9uVmlld0l0ZW1zLnB1c2gobWVudUFjdGlvblZpZXdJdGVtKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5tbmVtb25pY3Muc2V0KG1uZW1vbmljLCBbbWVudUFjdGlvblZpZXdJdGVtXSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBtZW51QWN0aW9uVmlld0l0ZW07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGtleWJpbmRpbmdMYWJlbCA9IG9wdGlvbnMuZ2V0S2V5QmluZGluZz8uKGFjdGlvbik/LmdldExhYmVsKCk7XG5cdFx0XHRjb25zdCBtZW51SXRlbU9wdGlvbnM6IElNZW51SXRlbU9wdGlvbnMgPSB7XG5cdFx0XHRcdGVuYWJsZU1uZW1vbmljczogb3B0aW9ucy5lbmFibGVNbmVtb25pY3MsXG5cdFx0XHRcdHVzZUV2ZW50QXNDb250ZXh0OiBvcHRpb25zLnVzZUV2ZW50QXNDb250ZXh0LFxuXHRcdFx0XHRrZXliaW5kaW5nOiBrZXliaW5kaW5nTGFiZWwsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBtZW51QWN0aW9uVmlld0l0ZW0gPSBuZXcgQmFzZU1lbnVBY3Rpb25WaWV3SXRlbShvcHRpb25zLmNvbnRleHQsIGFjdGlvbiwgbWVudUl0ZW1PcHRpb25zLCB0aGlzLm1lbnVTdHlsZXMpO1xuXG5cdFx0XHRpZiAob3B0aW9ucy5lbmFibGVNbmVtb25pY3MpIHtcblx0XHRcdFx0Y29uc3QgbW5lbW9uaWMgPSBtZW51QWN0aW9uVmlld0l0ZW0uZ2V0TW5lbW9uaWMoKTtcblx0XHRcdFx0aWYgKG1uZW1vbmljICYmIG1lbnVBY3Rpb25WaWV3SXRlbS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0XHRcdGNvbnN0IGFjdGlvblZpZXdJdGVtcyA9IHRoaXMubW5lbW9uaWNzLmdldChtbmVtb25pYyk7XG5cdFx0XHRcdFx0aWYgKGFjdGlvblZpZXdJdGVtcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRhY3Rpb25WaWV3SXRlbXMucHVzaChtZW51QWN0aW9uVmlld0l0ZW0pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLm1uZW1vbmljcy5zZXQobW5lbW9uaWMsIFttZW51QWN0aW9uVmlld0l0ZW1dKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIG1lbnVBY3Rpb25WaWV3SXRlbTtcblx0XHR9XG5cdH1cbn1cblxuaW50ZXJmYWNlIElNZW51SXRlbU9wdGlvbnMgZXh0ZW5kcyBJQWN0aW9uVmlld0l0ZW1PcHRpb25zIHtcblx0cmVhZG9ubHkgZW5hYmxlTW5lbW9uaWNzPzogYm9vbGVhbjtcbn1cblxuY2xhc3MgQmFzZU1lbnVBY3Rpb25WaWV3SXRlbSBleHRlbmRzIEJhc2VBY3Rpb25WaWV3SXRlbSB7XG5cblx0cHVibGljIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIG9wdGlvbnM6IElNZW51SXRlbU9wdGlvbnM7XG5cdHByb3RlY3RlZCBpdGVtOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJ1bk9uY2VUb0VuYWJsZU1vdXNlVXA6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cdHByaXZhdGUgbGFiZWw6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNoZWNrOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBtbmVtb25pYzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNzc0NsYXNzOiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IoY3R4OiB1bmtub3duLCBhY3Rpb246IElBY3Rpb24sIG9wdGlvbnM6IElNZW51SXRlbU9wdGlvbnMsIHByb3RlY3RlZCByZWFkb25seSBtZW51U3R5bGU6IElNZW51U3R5bGVzKSB7XG5cdFx0b3B0aW9ucyA9IHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRpc01lbnU6IHRydWUsXG5cdFx0XHRpY29uOiBvcHRpb25zLmljb24gIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuaWNvbiA6IGZhbHNlLFxuXHRcdFx0bGFiZWw6IG9wdGlvbnMubGFiZWwgIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMubGFiZWwgOiB0cnVlLFxuXHRcdH07XG5cdFx0c3VwZXIoYWN0aW9uLCBhY3Rpb24sIG9wdGlvbnMpO1xuXG5cdFx0dGhpcy5vcHRpb25zID0gb3B0aW9ucztcblx0XHR0aGlzLmNzc0NsYXNzID0gJyc7XG5cblx0XHQvLyBTZXQgbW5lbW9uaWNcblx0XHRpZiAodGhpcy5vcHRpb25zLmxhYmVsICYmIG9wdGlvbnMuZW5hYmxlTW5lbW9uaWNzKSB7XG5cdFx0XHRjb25zdCBsYWJlbCA9IHRoaXMuYWN0aW9uLmxhYmVsO1xuXHRcdFx0aWYgKGxhYmVsKSB7XG5cdFx0XHRcdGNvbnN0IG1hdGNoZXMgPSBNRU5VX01ORU1PTklDX1JFR0VYLmV4ZWMobGFiZWwpO1xuXHRcdFx0XHRpZiAobWF0Y2hlcykge1xuXHRcdFx0XHRcdHRoaXMubW5lbW9uaWMgPSAoISFtYXRjaGVzWzFdID8gbWF0Y2hlc1sxXSA6IG1hdGNoZXNbM10pLnRvTG9jYWxlTG93ZXJDYXNlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBZGQgbW91c2UgdXAgbGlzdGVuZXIgbGF0ZXIgdG8gYXZvaWQgYWNjaWRlbnRhbCBjbGlja3Ncblx0XHR0aGlzLnJ1bk9uY2VUb0VuYWJsZU1vdXNlVXAgPSBuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuZWxlbWVudCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmVsZW1lbnQsIEV2ZW50VHlwZS5NT1VTRV9VUCwgZSA9PiB7XG5cdFx0XHRcdC8vIHJlbW92ZWQgZGVmYXVsdCBwcmV2ZW50aW9uIGFzIGl0IGNvbmZsaWN0c1xuXHRcdFx0XHQvLyB3aXRoIEJhc2VBY3Rpb25WaWV3SXRlbSAjMTAxNTM3XG5cdFx0XHRcdC8vIGFkZCBiYWNrIGlmIGlzc3VlcyBhcmlzZSBhbmQgbGluayBuZXcgaXNzdWVcblx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblxuXHRcdFx0XHQvLyBTZWUgaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvQWRkLW9ucy9XZWJFeHRlbnNpb25zL0ludGVyYWN0X3dpdGhfdGhlX2NsaXBib2FyZFxuXHRcdFx0XHQvLyA+IFdyaXRpbmcgdG8gdGhlIGNsaXBib2FyZFxuXHRcdFx0XHQvLyA+IFlvdSBjYW4gdXNlIHRoZSBcImN1dFwiIGFuZCBcImNvcHlcIiBjb21tYW5kcyB3aXRob3V0IGFueSBzcGVjaWFsXG5cdFx0XHRcdC8vIHBlcm1pc3Npb24gaWYgeW91IGFyZSB1c2luZyB0aGVtIGluIGEgc2hvcnQtbGl2ZWQgZXZlbnQgaGFuZGxlclxuXHRcdFx0XHQvLyBmb3IgYSB1c2VyIGFjdGlvbiAoZm9yIGV4YW1wbGUsIGEgY2xpY2sgaGFuZGxlcikuXG5cblx0XHRcdFx0Ly8gPT4gdG8gZ2V0IHRoZSBDb3B5IGFuZCBQYXN0ZSBjb250ZXh0IG1lbnUgYWN0aW9ucyB3b3JraW5nIG9uIEZpcmVmb3gsXG5cdFx0XHRcdC8vIHRoZXJlIHNob3VsZCBiZSBubyB0aW1lb3V0IGhlcmVcblx0XHRcdFx0aWYgKGlzRmlyZWZveCkge1xuXHRcdFx0XHRcdGNvbnN0IG1vdXNlRXZlbnQgPSBuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGdldFdpbmRvdyh0aGlzLmVsZW1lbnQpLCBlKTtcblxuXHRcdFx0XHRcdC8vIEFsbG93aW5nIHJpZ2h0IGNsaWNrIHRvIHRyaWdnZXIgdGhlIGV2ZW50IGNhdXNlcyB0aGUgaXNzdWUgZGVzY3JpYmVkIGJlbG93LFxuXHRcdFx0XHRcdC8vIGJ1dCBzaW5jZSB0aGUgc29sdXRpb24gYmVsb3cgZG9lcyBub3Qgd29yayBpbiBGRiwgd2UgbXVzdCBkaXNhYmxlIHJpZ2h0IGNsaWNrXG5cdFx0XHRcdFx0aWYgKG1vdXNlRXZlbnQucmlnaHRCdXR0b24pIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLm9uQ2xpY2soZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBJbiBhbGwgb3RoZXIgY2FzZXMsIHNldCB0aW1lb3V0IHRvIGFsbG93IGNvbnRleHQgbWVudSBjYW5jZWxsYXRpb24gdG8gdHJpZ2dlclxuXHRcdFx0XHQvLyBvdGhlcndpc2UgdGhlIGFjdGlvbiB3aWxsIGRlc3Ryb3kgdGhlIG1lbnUgYW5kIGEgc2Vjb25kIGNvbnRleHQgbWVudVxuXHRcdFx0XHQvLyB3aWxsIHN0aWxsIHRyaWdnZXIgZm9yIHJpZ2h0IGNsaWNrLlxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMub25DbGljayhlKTtcblx0XHRcdFx0XHR9LCAwKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbGVtZW50LCBFdmVudFR5cGUuQ09OVEVYVF9NRU5VLCBlID0+IHtcblx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdH0pKTtcblx0XHR9LCAxMDApO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ydW5PbmNlVG9FbmFibGVNb3VzZVVwKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cblx0XHRpZiAoIXRoaXMuZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuY29udGFpbmVyID0gY29udGFpbmVyO1xuXG5cdFx0dGhpcy5pdGVtID0gYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnYS5hY3Rpb24tbWVudS1pdGVtJykpO1xuXHRcdGlmICh0aGlzLl9hY3Rpb24uaWQgPT09IFNlcGFyYXRvci5JRCkge1xuXHRcdFx0Ly8gQSBzZXBhcmF0b3IgaXMgYSBwcmVzZW50YXRpb24gaXRlbVxuXHRcdFx0dGhpcy5pdGVtLnNldEF0dHJpYnV0ZSgncm9sZScsICdwcmVzZW50YXRpb24nKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5pdGVtLnNldEF0dHJpYnV0ZSgncm9sZScsICdtZW51aXRlbScpO1xuXHRcdFx0aWYgKHRoaXMubW5lbW9uaWMpIHtcblx0XHRcdFx0dGhpcy5pdGVtLnNldEF0dHJpYnV0ZSgnYXJpYS1rZXlzaG9ydGN1dHMnLCBgJHt0aGlzLm1uZW1vbmljfWApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuY2hlY2sgPSBhcHBlbmQodGhpcy5pdGVtLCAkKCdzcGFuLm1lbnUtaXRlbS1jaGVjaycgKyBUaGVtZUljb24uYXNDU1NTZWxlY3RvcihDb2RpY29uLm1lbnVTZWxlY3Rpb24pKSk7XG5cdFx0dGhpcy5jaGVjay5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbm9uZScpO1xuXG5cdFx0dGhpcy5sYWJlbCA9IGFwcGVuZCh0aGlzLml0ZW0sICQoJ3NwYW4uYWN0aW9uLWxhYmVsJykpO1xuXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5sYWJlbCAmJiB0aGlzLm9wdGlvbnMua2V5YmluZGluZykge1xuXHRcdFx0YXBwZW5kKHRoaXMuaXRlbSwgJCgnc3Bhbi5rZXliaW5kaW5nJykpLnRleHRDb250ZW50ID0gdGhpcy5vcHRpb25zLmtleWJpbmRpbmc7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkcyBtb3VzZSB1cCBsaXN0ZW5lciB0byBhY3R1YWxseSBydW4gdGhlIGFjdGlvblxuXHRcdHRoaXMucnVuT25jZVRvRW5hYmxlTW91c2VVcC5zY2hlZHVsZSgpO1xuXG5cdFx0dGhpcy51cGRhdGVDbGFzcygpO1xuXHRcdHRoaXMudXBkYXRlTGFiZWwoKTtcblx0XHR0aGlzLnVwZGF0ZVRvb2x0aXAoKTtcblx0XHR0aGlzLnVwZGF0ZUVuYWJsZWQoKTtcblx0XHR0aGlzLnVwZGF0ZUNoZWNrZWQoKTtcblxuXHRcdHRoaXMuYXBwbHlTdHlsZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYmx1cigpOiB2b2lkIHtcblx0XHRzdXBlci5ibHVyKCk7XG5cdFx0dGhpcy5hcHBseVN0eWxlKCk7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHRzdXBlci5mb2N1cygpO1xuXG5cdFx0dGhpcy5pdGVtPy5mb2N1cygpO1xuXG5cdFx0dGhpcy5hcHBseVN0eWxlKCk7XG5cdH1cblxuXHR1cGRhdGVQb3NpdGlvbkluU2V0KHBvczogbnVtYmVyLCBzZXRTaXplOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5pdGVtKSB7XG5cdFx0XHR0aGlzLml0ZW0uc2V0QXR0cmlidXRlKCdhcmlhLXBvc2luc2V0JywgYCR7cG9zfWApO1xuXHRcdFx0dGhpcy5pdGVtLnNldEF0dHJpYnV0ZSgnYXJpYS1zZXRzaXplJywgYCR7c2V0U2l6ZX1gKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlTGFiZWwoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmxhYmVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5sYWJlbCkge1xuXHRcdFx0Y2xlYXJOb2RlKHRoaXMubGFiZWwpO1xuXG5cdFx0XHRsZXQgbGFiZWwgPSBzdHJpcEljb25zKHRoaXMuYWN0aW9uLmxhYmVsKTtcblx0XHRcdGlmIChsYWJlbCkge1xuXHRcdFx0XHRjb25zdCBjbGVhbkxhYmVsID0gY2xlYW5NbmVtb25pYyhsYWJlbCk7XG5cdFx0XHRcdGlmICghdGhpcy5vcHRpb25zLmVuYWJsZU1uZW1vbmljcykge1xuXHRcdFx0XHRcdGxhYmVsID0gY2xlYW5MYWJlbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMubGFiZWwuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgY2xlYW5MYWJlbC5yZXBsYWNlKC8mJi9nLCAnJicpKTtcblxuXHRcdFx0XHRjb25zdCBtYXRjaGVzID0gTUVOVV9NTkVNT05JQ19SRUdFWC5leGVjKGxhYmVsKTtcblxuXHRcdFx0XHRpZiAobWF0Y2hlcykge1xuXHRcdFx0XHRcdGxhYmVsID0gc3RyaW5ncy5lc2NhcGUobGFiZWwpO1xuXG5cdFx0XHRcdFx0Ly8gVGhpcyBpcyBnbG9iYWwsIHJlc2V0IGl0XG5cdFx0XHRcdFx0TUVOVV9FU0NBUEVEX01ORU1PTklDX1JFR0VYLmxhc3RJbmRleCA9IDA7XG5cdFx0XHRcdFx0bGV0IGVzY01hdGNoID0gTUVOVV9FU0NBUEVEX01ORU1PTklDX1JFR0VYLmV4ZWMobGFiZWwpO1xuXG5cdFx0XHRcdFx0Ly8gV2UgY2FuJ3QgdXNlIG5lZ2F0aXZlIGxvb2tiZWhpbmQgc28gaWYgd2UgbWF0Y2ggb3VyIG5lZ2F0aXZlIGFuZCBza2lwXG5cdFx0XHRcdFx0d2hpbGUgKGVzY01hdGNoICYmIGVzY01hdGNoWzFdKSB7XG5cdFx0XHRcdFx0XHRlc2NNYXRjaCA9IE1FTlVfRVNDQVBFRF9NTkVNT05JQ19SRUdFWC5leGVjKGxhYmVsKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCByZXBsYWNlRG91YmxlRXNjYXBlcyA9IChzdHI6IHN0cmluZykgPT4gc3RyLnJlcGxhY2UoLyZhbXA7JmFtcDsvZywgJyZhbXA7Jyk7XG5cblx0XHRcdFx0XHRpZiAoZXNjTWF0Y2gpIHtcblx0XHRcdFx0XHRcdHRoaXMubGFiZWwuYXBwZW5kKFxuXHRcdFx0XHRcdFx0XHRzdHJpbmdzLmx0cmltKHJlcGxhY2VEb3VibGVFc2NhcGVzKGxhYmVsLnN1YnN0cigwLCBlc2NNYXRjaC5pbmRleCkpLCAnICcpLFxuXHRcdFx0XHRcdFx0XHQkKCd1JywgeyAnYXJpYS1oaWRkZW4nOiAndHJ1ZScgfSxcblx0XHRcdFx0XHRcdFx0XHRlc2NNYXRjaFszXSksXG5cdFx0XHRcdFx0XHRcdHN0cmluZ3MucnRyaW0ocmVwbGFjZURvdWJsZUVzY2FwZXMobGFiZWwuc3Vic3RyKGVzY01hdGNoLmluZGV4ICsgZXNjTWF0Y2hbMF0ubGVuZ3RoKSksICcgJykpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxhYmVsLnRleHRDb250ZW50ID0gcmVwbGFjZURvdWJsZUVzY2FwZXMobGFiZWwpLnRyaW0oKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLml0ZW0/LnNldEF0dHJpYnV0ZSgnYXJpYS1rZXlzaG9ydGN1dHMnLCAoISFtYXRjaGVzWzFdID8gbWF0Y2hlc1sxXSA6IG1hdGNoZXNbM10pLnRvTG9jYWxlTG93ZXJDYXNlKCkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMubGFiZWwudGV4dENvbnRlbnQgPSBsYWJlbC5yZXBsYWNlKC8mJi9nLCAnJicpLnRyaW0oKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVUb29sdGlwKCk6IHZvaWQge1xuXHRcdC8vIG1lbnVzIHNob3VsZCBmdW5jdGlvbiBsaWtlIG5hdGl2ZSBtZW51cyBhbmQgdGhleSBkbyBub3QgaGF2ZSB0b29sdGlwc1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZUNsYXNzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNzc0NsYXNzICYmIHRoaXMuaXRlbSkge1xuXHRcdFx0dGhpcy5pdGVtLmNsYXNzTGlzdC5yZW1vdmUoLi4udGhpcy5jc3NDbGFzcy5zcGxpdCgnICcpKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5pY29uICYmIHRoaXMubGFiZWwpIHtcblx0XHRcdHRoaXMuY3NzQ2xhc3MgPSB0aGlzLmFjdGlvbi5jbGFzcyB8fCAnJztcblx0XHRcdHRoaXMubGFiZWwuY2xhc3NMaXN0LmFkZCgnaWNvbicpO1xuXHRcdFx0aWYgKHRoaXMuY3NzQ2xhc3MpIHtcblx0XHRcdFx0dGhpcy5sYWJlbC5jbGFzc0xpc3QuYWRkKC4uLnRoaXMuY3NzQ2xhc3Muc3BsaXQoJyAnKSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnVwZGF0ZUVuYWJsZWQoKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMubGFiZWwpIHtcblx0XHRcdHRoaXMubGFiZWwuY2xhc3NMaXN0LnJlbW92ZSgnaWNvbicpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVFbmFibGVkKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmFjdGlvbi5lbmFibGVkKSB7XG5cdFx0XHRpZiAodGhpcy5lbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdkaXNhYmxlZCcpO1xuXHRcdFx0XHR0aGlzLmVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJyk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLml0ZW0pIHtcblx0XHRcdFx0dGhpcy5pdGVtLmNsYXNzTGlzdC5yZW1vdmUoJ2Rpc2FibGVkJyk7XG5cdFx0XHRcdHRoaXMuaXRlbS5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnKTtcblx0XHRcdFx0dGhpcy5pdGVtLnRhYkluZGV4ID0gMDtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZGlzYWJsZWQnKTtcblx0XHRcdFx0dGhpcy5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1kaXNhYmxlZCcsICd0cnVlJyk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLml0ZW0pIHtcblx0XHRcdFx0dGhpcy5pdGVtLmNsYXNzTGlzdC5hZGQoJ2Rpc2FibGVkJyk7XG5cdFx0XHRcdHRoaXMuaXRlbS5zZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnLCAndHJ1ZScpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVDaGVja2VkKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5pdGVtKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hlY2tlZCA9IHRoaXMuYWN0aW9uLmNoZWNrZWQ7XG5cdFx0dGhpcy5pdGVtLmNsYXNzTGlzdC50b2dnbGUoJ2NoZWNrZWQnLCAhIWNoZWNrZWQpO1xuXHRcdGlmIChjaGVja2VkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuaXRlbS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbWVudWl0ZW1jaGVja2JveCcpO1xuXHRcdFx0dGhpcy5pdGVtLnNldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJywgY2hlY2tlZCA/ICd0cnVlJyA6ICdmYWxzZScpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLml0ZW0uc2V0QXR0cmlidXRlKCdyb2xlJywgJ21lbnVpdGVtJyk7XG5cdFx0XHR0aGlzLml0ZW0uc2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnLCAnJyk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0TW5lbW9uaWMoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5tbmVtb25pYztcblx0fVxuXG5cdHByb3RlY3RlZCBhcHBseVN0eWxlKCk6IHZvaWQge1xuXHRcdGNvbnN0IGlzU2VsZWN0ZWQgPSB0aGlzLmVsZW1lbnQgJiYgdGhpcy5lbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnZm9jdXNlZCcpO1xuXHRcdGNvbnN0IGZnQ29sb3IgPSBpc1NlbGVjdGVkICYmIHRoaXMubWVudVN0eWxlLnNlbGVjdGlvbkZvcmVncm91bmRDb2xvciA/IHRoaXMubWVudVN0eWxlLnNlbGVjdGlvbkZvcmVncm91bmRDb2xvciA6IHRoaXMubWVudVN0eWxlLmZvcmVncm91bmRDb2xvcjtcblx0XHRjb25zdCBiZ0NvbG9yID0gaXNTZWxlY3RlZCAmJiB0aGlzLm1lbnVTdHlsZS5zZWxlY3Rpb25CYWNrZ3JvdW5kQ29sb3IgPyB0aGlzLm1lbnVTdHlsZS5zZWxlY3Rpb25CYWNrZ3JvdW5kQ29sb3IgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgb3V0bGluZSA9IGlzU2VsZWN0ZWQgJiYgdGhpcy5tZW51U3R5bGUuc2VsZWN0aW9uQm9yZGVyQ29sb3IgPyBgMXB4IHNvbGlkICR7dGhpcy5tZW51U3R5bGUuc2VsZWN0aW9uQm9yZGVyQ29sb3J9YCA6ICcnO1xuXHRcdGNvbnN0IG91dGxpbmVPZmZzZXQgPSBpc1NlbGVjdGVkICYmIHRoaXMubWVudVN0eWxlLnNlbGVjdGlvbkJvcmRlckNvbG9yID8gYC0xcHhgIDogJyc7XG5cblx0XHRpZiAodGhpcy5pdGVtKSB7XG5cdFx0XHR0aGlzLml0ZW0uc3R5bGUuY29sb3IgPSBmZ0NvbG9yID8/ICcnO1xuXHRcdFx0dGhpcy5pdGVtLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IGJnQ29sb3IgPz8gJyc7XG5cdFx0XHR0aGlzLml0ZW0uc3R5bGUub3V0bGluZSA9IG91dGxpbmU7XG5cdFx0XHR0aGlzLml0ZW0uc3R5bGUub3V0bGluZU9mZnNldCA9IG91dGxpbmVPZmZzZXQ7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hlY2spIHtcblx0XHRcdHRoaXMuY2hlY2suc3R5bGUuY29sb3IgPSBmZ0NvbG9yID8/ICcnO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBTdWJtZW51TWVudUFjdGlvblZpZXdJdGVtIGV4dGVuZHMgQmFzZU1lbnVBY3Rpb25WaWV3SXRlbSB7XG5cdHByaXZhdGUgbXlzdWJtZW51OiBNZW51IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgc3VibWVudUNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc3VibWVudUluZGljYXRvcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgc3VibWVudURpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBtb3VzZU92ZXI6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBzaG93U2NoZWR1bGVyOiBSdW5PbmNlU2NoZWR1bGVyO1xuXHRwcml2YXRlIGhpZGVTY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cdHByaXZhdGUgZXhwYW5kRGlyZWN0aW9uOiBJTWVudURpcmVjdGlvbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0cHJpdmF0ZSBzdWJtZW51QWN0aW9uczogUmVhZG9ubHlBcnJheTxJQWN0aW9uPixcblx0XHRwcml2YXRlIHBhcmVudERhdGE6IElTdWJNZW51RGF0YSxcblx0XHRwcml2YXRlIHN1Ym1lbnVPcHRpb25zOiBJTWVudU9wdGlvbnMsXG5cdFx0bWVudVN0eWxlczogSU1lbnVTdHlsZXNcblx0KSB7XG5cdFx0c3VwZXIoYWN0aW9uLCBhY3Rpb24sIHN1Ym1lbnVPcHRpb25zLCBtZW51U3R5bGVzKTtcblxuXHRcdHRoaXMuZXhwYW5kRGlyZWN0aW9uID0gc3VibWVudU9wdGlvbnMgJiYgc3VibWVudU9wdGlvbnMuZXhwYW5kRGlyZWN0aW9uICE9PSB1bmRlZmluZWQgPyBzdWJtZW51T3B0aW9ucy5leHBhbmREaXJlY3Rpb24gOiB7IGhvcml6b250YWw6IEhvcml6b250YWxEaXJlY3Rpb24uUmlnaHQsIHZlcnRpY2FsOiBWZXJ0aWNhbERpcmVjdGlvbi5CZWxvdyB9O1xuXG5cdFx0dGhpcy5zaG93U2NoZWR1bGVyID0gbmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMubW91c2VPdmVyKSB7XG5cdFx0XHRcdHRoaXMuY2xlYW51cEV4aXN0aW5nU3VibWVudShmYWxzZSk7XG5cdFx0XHRcdHRoaXMuY3JlYXRlU3VibWVudShmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fSwgMjUwKTtcblxuXHRcdHRoaXMuaGlkZVNjaGVkdWxlciA9IG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmVsZW1lbnQgJiYgKCFpc0FuY2VzdG9yKGdldEFjdGl2ZUVsZW1lbnQoKSwgdGhpcy5lbGVtZW50KSAmJiB0aGlzLnBhcmVudERhdGEuc3VibWVudSA9PT0gdGhpcy5teXN1Ym1lbnUpKSB7XG5cdFx0XHRcdHRoaXMucGFyZW50RGF0YS5wYXJlbnQuZm9jdXMoZmFsc2UpO1xuXHRcdFx0XHR0aGlzLmNsZWFudXBFeGlzdGluZ1N1Ym1lbnUodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSwgNzUwKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cblx0XHRpZiAoIXRoaXMuZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLml0ZW0pIHtcblx0XHRcdHRoaXMuaXRlbS5jbGFzc0xpc3QuYWRkKCdtb25hY28tc3VibWVudS1pdGVtJyk7XG5cdFx0XHR0aGlzLml0ZW0udGFiSW5kZXggPSAwO1xuXHRcdFx0dGhpcy5pdGVtLnNldEF0dHJpYnV0ZSgnYXJpYS1oYXNwb3B1cCcsICd0cnVlJyk7XG5cdFx0XHR0aGlzLnVwZGF0ZUFyaWFFeHBhbmRlZCgnZmFsc2UnKTtcblx0XHRcdHRoaXMuc3VibWVudUluZGljYXRvciA9IGFwcGVuZCh0aGlzLml0ZW0sICQoJ3NwYW4uc3VibWVudS1pbmRpY2F0b3InICsgVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoQ29kaWNvbi5tZW51U3VibWVudSkpKTtcblx0XHRcdHRoaXMuc3VibWVudUluZGljYXRvci5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbGVtZW50LCBFdmVudFR5cGUuS0VZX1VQLCBlID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5SaWdodEFycm93KSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikpIHtcblx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblxuXHRcdFx0XHR0aGlzLmNyZWF0ZVN1Ym1lbnUodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudCwgRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblxuXHRcdFx0aWYgKGdldEFjdGl2ZUVsZW1lbnQoKSA9PT0gdGhpcy5pdGVtKSB7XG5cdFx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5SaWdodEFycm93KSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikpIHtcblx0XHRcdFx0XHRFdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudCwgRXZlbnRUeXBlLk1PVVNFX01PVkUsIGUgPT4ge1xuXHRcdFx0aWYgKGUubW92ZW1lbnRYID09PSAwICYmIGUubW92ZW1lbnRZID09PSAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLm1vdXNlT3Zlcikge1xuXHRcdFx0XHR0aGlzLm1vdXNlT3ZlciA9IHRydWU7XG5cblx0XHRcdFx0dGhpcy5zaG93U2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudCwgRXZlbnRUeXBlLk1PVVNFX0xFQVZFLCBlID0+IHtcblx0XHRcdHRoaXMubW91c2VPdmVyID0gZmFsc2U7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudCwgRXZlbnRUeXBlLkZPQ1VTX09VVCwgZSA9PiB7XG5cdFx0XHRpZiAodGhpcy5lbGVtZW50ICYmICFpc0FuY2VzdG9yKGdldEFjdGl2ZUVsZW1lbnQoKSwgdGhpcy5lbGVtZW50KSkge1xuXHRcdFx0XHR0aGlzLmhpZGVTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnBhcmVudERhdGEucGFyZW50Lm9uU2Nyb2xsKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLnBhcmVudERhdGEuc3VibWVudSA9PT0gdGhpcy5teXN1Ym1lbnUpIHtcblx0XHRcdFx0dGhpcy5wYXJlbnREYXRhLnBhcmVudC5mb2N1cyhmYWxzZSk7XG5cdFx0XHRcdHRoaXMuY2xlYW51cEV4aXN0aW5nU3VibWVudSh0cnVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlRW5hYmxlZCgpOiB2b2lkIHtcblx0XHQvLyBvdmVycmlkZSBvbiBzdWJtZW51IGVudHJ5XG5cdFx0Ly8gbmF0aXZlIG1lbnVzIGRvIG5vdCBvYnNlcnZlIGVuYWJsZW1lbnQgb24gc3VtYmVudXNcblx0XHQvLyB3ZSBtaW1pYyB0aGF0IGJlaGF2aW9yXG5cdH1cblxuXHRvcGVuKHNlbGVjdEZpcnN0PzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuY2xlYW51cEV4aXN0aW5nU3VibWVudShmYWxzZSk7XG5cdFx0dGhpcy5jcmVhdGVTdWJtZW51KHNlbGVjdEZpcnN0KTtcblx0fVxuXG5cdG92ZXJyaWRlIG9uQ2xpY2soZTogRXZlbnRMaWtlKTogdm9pZCB7XG5cdFx0Ly8gc3RvcCBjbGlja2luZyBmcm9tIHRyeWluZyB0byBydW4gYW4gYWN0aW9uXG5cdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblxuXHRcdHRoaXMuY2xlYW51cEV4aXN0aW5nU3VibWVudShmYWxzZSk7XG5cdFx0dGhpcy5jcmVhdGVTdWJtZW51KHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhbnVwRXhpc3RpbmdTdWJtZW51KGZvcmNlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMucGFyZW50RGF0YS5zdWJtZW51ICYmIChmb3JjZSB8fCAodGhpcy5wYXJlbnREYXRhLnN1Ym1lbnUgIT09IHRoaXMubXlzdWJtZW51KSkpIHtcblxuXHRcdFx0Ly8gZGlzcG9zYWwgbWF5IHRocm93IGlmIHRoZSBzdWJtZW51IGhhcyBhbHJlYWR5IGJlZW4gcmVtb3ZlZFxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5wYXJlbnREYXRhLnN1Ym1lbnUuZGlzcG9zZSgpO1xuXHRcdFx0fSBjYXRjaCB7IH1cblxuXHRcdFx0dGhpcy5wYXJlbnREYXRhLnN1Ym1lbnUgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnVwZGF0ZUFyaWFFeHBhbmRlZCgnZmFsc2UnKTtcblx0XHRcdGlmICh0aGlzLnN1Ym1lbnVDb250YWluZXIpIHtcblx0XHRcdFx0dGhpcy5zdWJtZW51RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdFx0dGhpcy5zdWJtZW51Q29udGFpbmVyID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY2FsY3VsYXRlU3VibWVudU1lbnVMYXlvdXQod2luZG93RGltZW5zaW9uczogRGltZW5zaW9uLCBzdWJtZW51OiBEaW1lbnNpb24sIGVudHJ5OiBJRG9tTm9kZVBhZ2VQb3NpdGlvbiwgZXhwYW5kRGlyZWN0aW9uOiBJTWVudURpcmVjdGlvbik6IHsgdG9wOiBudW1iZXI7IGxlZnQ6IG51bWJlciB9IHtcblx0XHRjb25zdCByZXQgPSB7IHRvcDogMCwgbGVmdDogMCB9O1xuXG5cdFx0Ly8gU3RhcnQgd2l0aCBob3Jpem9udGFsXG5cdFx0cmV0LmxlZnQgPSBsYXlvdXQod2luZG93RGltZW5zaW9ucy53aWR0aCwgc3VibWVudS53aWR0aCwgeyBwb3NpdGlvbjogZXhwYW5kRGlyZWN0aW9uLmhvcml6b250YWwgPT09IEhvcml6b250YWxEaXJlY3Rpb24uUmlnaHQgPyBMYXlvdXRBbmNob3JQb3NpdGlvbi5CZWZvcmUgOiBMYXlvdXRBbmNob3JQb3NpdGlvbi5BZnRlciwgb2Zmc2V0OiBlbnRyeS5sZWZ0LCBzaXplOiBlbnRyeS53aWR0aCB9KS5wb3NpdGlvbjtcblxuXHRcdC8vIFdlIGRvbid0IGhhdmUgZW5vdWdoIHJvb20gdG8gbGF5b3V0IHRoZSBtZW51IGZ1bGx5LCBzbyB3ZSBhcmUgb3ZlcmxhcHBpbmcgdGhlIG1lbnVcblx0XHRpZiAocmV0LmxlZnQgPj0gZW50cnkubGVmdCAmJiByZXQubGVmdCA8IGVudHJ5LmxlZnQgKyBlbnRyeS53aWR0aCkge1xuXHRcdFx0aWYgKGVudHJ5LmxlZnQgKyAxMCArIHN1Ym1lbnUud2lkdGggPD0gd2luZG93RGltZW5zaW9ucy53aWR0aCkge1xuXHRcdFx0XHRyZXQubGVmdCA9IGVudHJ5LmxlZnQgKyAxMDtcblx0XHRcdH1cblxuXHRcdFx0ZW50cnkudG9wICs9IDEwO1xuXHRcdFx0ZW50cnkuaGVpZ2h0ID0gMDtcblx0XHR9XG5cblx0XHQvLyBOb3cgdGhhdCB3ZSBoYXZlIGEgaG9yaXpvbnRhbCBwb3NpdGlvbiwgdHJ5IGxheW91dCB2ZXJ0aWNhbGx5XG5cdFx0cmV0LnRvcCA9IGxheW91dCh3aW5kb3dEaW1lbnNpb25zLmhlaWdodCwgc3VibWVudS5oZWlnaHQsIHsgcG9zaXRpb246IExheW91dEFuY2hvclBvc2l0aW9uLkJlZm9yZSwgb2Zmc2V0OiBlbnRyeS50b3AsIHNpemU6IDAgfSkucG9zaXRpb247XG5cblx0XHQvLyBXZSBkaWRuJ3QgaGF2ZSBlbm91Z2ggcm9vbSBiZWxvdywgYnV0IHdlIGRpZCBhYm92ZSwgc28gd2Ugc2hpZnQgZG93biB0byBhbGlnbiB0aGUgbWVudVxuXHRcdGlmIChyZXQudG9wICsgc3VibWVudS5oZWlnaHQgPT09IGVudHJ5LnRvcCAmJiByZXQudG9wICsgZW50cnkuaGVpZ2h0ICsgc3VibWVudS5oZWlnaHQgPD0gd2luZG93RGltZW5zaW9ucy5oZWlnaHQpIHtcblx0XHRcdHJldC50b3AgKz0gZW50cnkuaGVpZ2h0O1xuXHRcdH1cblxuXHRcdHJldHVybiByZXQ7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVN1Ym1lbnUoc2VsZWN0Rmlyc3RJdGVtID0gdHJ1ZSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5lbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLnBhcmVudERhdGEuc3VibWVudSkge1xuXHRcdFx0dGhpcy51cGRhdGVBcmlhRXhwYW5kZWQoJ3RydWUnKTtcblx0XHRcdHRoaXMuc3VibWVudUNvbnRhaW5lciA9IGFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJ2Rpdi5tb25hY28tc3VibWVudScpKTtcblx0XHRcdHRoaXMuc3VibWVudUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdtZW51YmFyLW1lbnUtaXRlbXMtaG9sZGVyJywgJ2NvbnRleHQtdmlldycpO1xuXG5cdFx0XHQvLyBTZXQgdGhlIHRvcCB2YWx1ZSBvZiB0aGUgbWVudSBjb250YWluZXIgYmVmb3JlIGNvbnN0cnVjdGlvblxuXHRcdFx0Ly8gVGhpcyBhbGxvd3MgdGhlIG1lbnUgY29uc3RydWN0b3IgdG8gY2FsY3VsYXRlIHRoZSBwcm9wZXIgbWF4IGhlaWdodFxuXHRcdFx0Y29uc3QgY29tcHV0ZWRTdHlsZXMgPSBnZXRXaW5kb3codGhpcy5wYXJlbnREYXRhLnBhcmVudC5kb21Ob2RlKS5nZXRDb21wdXRlZFN0eWxlKHRoaXMucGFyZW50RGF0YS5wYXJlbnQuZG9tTm9kZSk7XG5cdFx0XHRjb25zdCBwYWRkaW5nVG9wID0gcGFyc2VGbG9hdChjb21wdXRlZFN0eWxlcy5wYWRkaW5nVG9wIHx8ICcwJykgfHwgMDtcblx0XHRcdHRoaXMuc3VibWVudUNvbnRhaW5lci5zdHlsZS5wb3NpdGlvbiA9ICdmaXhlZCc7XG5cdFx0XHR0aGlzLnN1Ym1lbnVDb250YWluZXIuc3R5bGUudG9wID0gJzAnO1xuXHRcdFx0dGhpcy5zdWJtZW51Q29udGFpbmVyLnN0eWxlLmxlZnQgPSAnMCc7XG5cdFx0XHQvLyBGaXggdG8gIzI2MzU0NiwgZm9yIHN1Ym1lbnUgb2YgdHJlZVZpZXcgdmlldy9pdGVtL2NvbnRleHQgei1pbmRleCBpc3N1ZSAtIGVuc3VyZSBzdWJtZW51IGFwcGVhcnMgYWJvdmUgb3RoZXIgZWxlbWVudHNcblx0XHRcdHRoaXMuc3VibWVudUNvbnRhaW5lci5zdHlsZS56SW5kZXggPSAnMSc7XG5cblx0XHRcdHRoaXMucGFyZW50RGF0YS5zdWJtZW51ID0gbmV3IE1lbnUodGhpcy5zdWJtZW51Q29udGFpbmVyLCB0aGlzLnN1Ym1lbnVBY3Rpb25zLmxlbmd0aCA/IHRoaXMuc3VibWVudUFjdGlvbnMgOiBbbmV3IEVtcHR5U3VibWVudUFjdGlvbigpXSwgdGhpcy5zdWJtZW51T3B0aW9ucywgdGhpcy5tZW51U3R5bGUpO1xuXG5cdFx0XHQvLyBsYXlvdXQgc3VibWVudVxuXHRcdFx0Y29uc3QgZW50cnlCb3ggPSB0aGlzLmVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0XHRjb25zdCBlbnRyeUJveFVwZGF0ZWQgPSB7XG5cdFx0XHRcdHRvcDogZW50cnlCb3gudG9wIC0gcGFkZGluZ1RvcCxcblx0XHRcdFx0bGVmdDogZW50cnlCb3gubGVmdCxcblx0XHRcdFx0aGVpZ2h0OiBlbnRyeUJveC5oZWlnaHQgKyAyICogcGFkZGluZ1RvcCxcblx0XHRcdFx0d2lkdGg6IGVudHJ5Qm94LndpZHRoXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB2aWV3Qm94ID0gdGhpcy5zdWJtZW51Q29udGFpbmVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXG5cdFx0XHRjb25zdCB3aW5kb3cgPSBnZXRXaW5kb3codGhpcy5lbGVtZW50KTtcblx0XHRcdGNvbnN0IHsgdG9wLCBsZWZ0IH0gPSB0aGlzLmNhbGN1bGF0ZVN1Ym1lbnVNZW51TGF5b3V0KG5ldyBEaW1lbnNpb24od2luZG93LmlubmVyV2lkdGgsIHdpbmRvdy5pbm5lckhlaWdodCksIERpbWVuc2lvbi5saWZ0KHZpZXdCb3gpLCBlbnRyeUJveFVwZGF0ZWQsIHRoaXMuZXhwYW5kRGlyZWN0aW9uKTtcblx0XHRcdC8vIHN1YnRyYWN0IG9mZnNldHMgY2F1c2VkIGJ5IHRyYW5zZm9ybSBwYXJlbnRcblx0XHRcdHRoaXMuc3VibWVudUNvbnRhaW5lci5zdHlsZS5sZWZ0ID0gYCR7bGVmdCAtIHZpZXdCb3gubGVmdH1weGA7XG5cdFx0XHR0aGlzLnN1Ym1lbnVDb250YWluZXIuc3R5bGUudG9wID0gYCR7dG9wIC0gdmlld0JveC50b3B9cHhgO1xuXG5cdFx0XHR0aGlzLnN1Ym1lbnVEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuc3VibWVudUNvbnRhaW5lciwgRXZlbnRUeXBlLktFWV9VUCwgZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkxlZnRBcnJvdykpIHtcblx0XHRcdFx0XHRFdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXG5cdFx0XHRcdFx0dGhpcy5wYXJlbnREYXRhLnBhcmVudC5mb2N1cygpO1xuXG5cdFx0XHRcdFx0dGhpcy5jbGVhbnVwRXhpc3RpbmdTdWJtZW51KHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuc3VibWVudURpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5zdWJtZW51Q29udGFpbmVyLCBFdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5MZWZ0QXJyb3cpKSB7XG5cdFx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cblx0XHRcdHRoaXMuc3VibWVudURpc3Bvc2FibGVzLmFkZCh0aGlzLnBhcmVudERhdGEuc3VibWVudS5vbkRpZENhbmNlbCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMucGFyZW50RGF0YS5wYXJlbnQuZm9jdXMoKTtcblxuXHRcdFx0XHR0aGlzLmNsZWFudXBFeGlzdGluZ1N1Ym1lbnUodHJ1ZSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMucGFyZW50RGF0YS5zdWJtZW51LmZvY3VzKHNlbGVjdEZpcnN0SXRlbSk7XG5cblx0XHRcdHRoaXMubXlzdWJtZW51ID0gdGhpcy5wYXJlbnREYXRhLnN1Ym1lbnU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucGFyZW50RGF0YS5zdWJtZW51LmZvY3VzKGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUFyaWFFeHBhbmRlZCh2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXRlbSkge1xuXHRcdFx0dGhpcy5pdGVtPy5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCB2YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFwcGx5U3R5bGUoKTogdm9pZCB7XG5cdFx0c3VwZXIuYXBwbHlTdHlsZSgpO1xuXG5cdFx0Y29uc3QgaXNTZWxlY3RlZCA9IHRoaXMuZWxlbWVudCAmJiB0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdmb2N1c2VkJyk7XG5cdFx0Y29uc3QgZmdDb2xvciA9IGlzU2VsZWN0ZWQgJiYgdGhpcy5tZW51U3R5bGUuc2VsZWN0aW9uRm9yZWdyb3VuZENvbG9yID8gdGhpcy5tZW51U3R5bGUuc2VsZWN0aW9uRm9yZWdyb3VuZENvbG9yIDogdGhpcy5tZW51U3R5bGUuZm9yZWdyb3VuZENvbG9yO1xuXG5cdFx0aWYgKHRoaXMuc3VibWVudUluZGljYXRvcikge1xuXHRcdFx0dGhpcy5zdWJtZW51SW5kaWNhdG9yLnN0eWxlLmNvbG9yID0gZmdDb2xvciA/PyAnJztcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblxuXHRcdHRoaXMuaGlkZVNjaGVkdWxlci5kaXNwb3NlKCk7XG5cblx0XHRpZiAodGhpcy5teXN1Ym1lbnUpIHtcblx0XHRcdHRoaXMubXlzdWJtZW51LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMubXlzdWJtZW51ID0gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5zdWJtZW51Q29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLnN1Ym1lbnVDb250YWluZXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIE1lbnVTZXBhcmF0b3JBY3Rpb25WaWV3SXRlbSBleHRlbmRzIEFjdGlvblZpZXdJdGVtIHtcblx0Y29uc3RydWN0b3IoY29udGV4dDogdW5rbm93biwgYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zLCBwcml2YXRlIHJlYWRvbmx5IG1lbnVTdHlsZXM6IElNZW51U3R5bGVzKSB7XG5cdFx0c3VwZXIoY29udGV4dCwgYWN0aW9uLCBvcHRpb25zKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0aWYgKHRoaXMubGFiZWwpIHtcblx0XHRcdHRoaXMubGFiZWwuc3R5bGUuYm9yZGVyQm90dG9tQ29sb3IgPSB0aGlzLm1lbnVTdHlsZXMuc2VwYXJhdG9yQ29sb3IgPyBgJHt0aGlzLm1lbnVTdHlsZXMuc2VwYXJhdG9yQ29sb3J9YCA6ICcnO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xlYW5NbmVtb25pYyhsYWJlbDogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3QgcmVnZXggPSBNRU5VX01ORU1PTklDX1JFR0VYO1xuXG5cdGNvbnN0IG1hdGNoZXMgPSByZWdleC5leGVjKGxhYmVsKTtcblx0aWYgKCFtYXRjaGVzKSB7XG5cdFx0cmV0dXJuIGxhYmVsO1xuXHR9XG5cblx0Y29uc3QgbW5lbW9uaWNJblRleHQgPSAhbWF0Y2hlc1sxXTtcblxuXHRyZXR1cm4gbGFiZWwucmVwbGFjZShyZWdleCwgbW5lbW9uaWNJblRleHQgPyAnJDIkMycgOiAnJykudHJpbSgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0UnVsZShjOiBUaGVtZUljb24pIHtcblx0Y29uc3QgZm9udENoYXJhY3RlciA9IGdldENvZGljb25Gb250Q2hhcmFjdGVycygpW2MuaWRdO1xuXHRyZXR1cm4gYC5jb2RpY29uLSR7Yy5pZH06YmVmb3JlIHsgY29udGVudDogJ1xcXFwke2ZvbnRDaGFyYWN0ZXIudG9TdHJpbmcoMTYpfSc7IH1gO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TWVudVdpZGdldENTUyhzdHlsZTogSU1lbnVTdHlsZXMsIGlzRm9yU2hhZG93RG9tOiBib29sZWFuKTogc3RyaW5nIHtcblx0Y29uc3QgYm9yZGVyQ29sb3IgPSBzdHlsZS5ib3JkZXJDb2xvciA/PyAndmFyKC0tdnNjb2RlLW1lbnUtYm9yZGVyKSc7XG5cdGNvbnN0IG1lbnVTaGFkb3cgPSBgdmFyKC0tdnNjb2RlLXNoYWRvdy1sZyR7c3R5bGUuc2hhZG93Q29sb3IgPyBgLCAwIDAgMTJweCAke3N0eWxlLnNoYWRvd0NvbG9yfWAgOiAnJ30pYDtcblx0bGV0IHJlc3VsdCA9IC8qIGNzcyAqL2Bcbi5tb25hY28tbWVudSB7XG5cdGZvbnQtc2l6ZTogMTNweDtcblx0Ym9yZGVyLXJhZGl1czogdmFyKC0tdnNjb2RlLWNvcm5lclJhZGl1cy1sYXJnZSk7XG5cdGJvcmRlcjogdmFyKC0tdnNjb2RlLXN0cm9rZVRoaWNrbmVzcykgc29saWQgJHtib3JkZXJDb2xvcn07XG5cdG1pbi13aWR0aDogMTYwcHg7XG59XG5cbiR7Zm9ybWF0UnVsZShDb2RpY29uLm1lbnVTZWxlY3Rpb24pfVxuJHtmb3JtYXRSdWxlKENvZGljb24ubWVudVN1Ym1lbnUpfVxuXG4ubW9uYWNvLW1lbnUgLm1vbmFjby1hY3Rpb24tYmFyIHtcblx0dGV4dC1hbGlnbjogcmlnaHQ7XG5cdG92ZXJmbG93OiBoaWRkZW47XG5cdHdoaXRlLXNwYWNlOiBub3dyYXA7XG59XG5cbi5tb25hY28tbWVudSAubW9uYWNvLWFjdGlvbi1iYXIgLmFjdGlvbnMtY29udGFpbmVyIHtcblx0ZGlzcGxheTogZmxleDtcblx0bWFyZ2luOiAwIGF1dG87XG5cdHBhZGRpbmc6IDA7XG5cdHdpZHRoOiAxMDAlO1xuXHRqdXN0aWZ5LWNvbnRlbnQ6IGZsZXgtZW5kO1xufVxuXG4ubW9uYWNvLW1lbnUgLm1vbmFjby1hY3Rpb24tYmFyLnZlcnRpY2FsIC5hY3Rpb25zLWNvbnRhaW5lciB7XG5cdGRpc3BsYXk6IGlubGluZS1ibG9jaztcbn1cblxuLm1vbmFjby1tZW51IC5tb25hY28tYWN0aW9uLWJhci5yZXZlcnNlIC5hY3Rpb25zLWNvbnRhaW5lciB7XG5cdGZsZXgtZGlyZWN0aW9uOiByb3ctcmV2ZXJzZTtcbn1cblxuLm1vbmFjby1tZW51IC5tb25hY28tYWN0aW9uLWJhciAuYWN0aW9uLWl0ZW0ge1xuXHRjdXJzb3I6IHBvaW50ZXI7XG5cdGRpc3BsYXk6IGlubGluZS1ibG9jaztcblx0dHJhbnNpdGlvbjogdHJhbnNmb3JtIDUwbXMgZWFzZTtcblx0cG9zaXRpb246IHJlbGF0aXZlOyAgLyogRE8gTk9UIFJFTU9WRSAtIHRoaXMgaXMgdGhlIGtleSB0byBwcmV2ZW50aW5nIHRoZSBnaG9zdGluZyBpY29uIGJ1ZyBpbiBDaHJvbWUgNDIgKi9cbn1cblxuLm1vbmFjby1tZW51IC5tb25hY28tYWN0aW9uLWJhciAuYWN0aW9uLWl0ZW0uZGlzYWJsZWQge1xuXHRjdXJzb3I6IGRlZmF1bHQ7XG59XG5cbi5tb25hY28tbWVudSAubW9uYWNvLWFjdGlvbi1iYXIgLmFjdGlvbi1pdGVtIC5pY29uLFxuLm1vbmFjby1tZW51IC5tb25hY28tYWN0aW9uLWJhciAuYWN0aW9uLWl0ZW0gLmNvZGljb24ge1xuXHRkaXNwbGF5OiBpbmxpbmUtYmxvY2s7XG59XG5cbi5tb25hY28tbWVudSAubW9uYWNvLWFjdGlvbi1iYXIgLmFjdGlvbi1pdGVtIC5jb2RpY29uIHtcblx0ZGlzcGxheTogZmxleDtcblx0YWxpZ24taXRlbXM6IGNlbnRlcjtcbn1cblxuLm1vbmFjby1tZW51IC5tb25hY28tYWN0aW9uLWJhciAuYWN0aW9uLWxhYmVsIHtcblx0Zm9udC1zaXplOiAxMXB4O1xuXHRtYXJnaW4tcmlnaHQ6IDRweDtcbn1cblxuLm1vbmFjby1tZW51IC5tb25hY28tYWN0aW9uLWJhciAuYWN0aW9uLWl0ZW0uZGlzYWJsZWQgLmFjdGlvbi1sYWJlbCxcbi5tb25hY28tbWVudSAubW9uYWNvLWFjdGlvbi1iYXIgLmFjdGlvbi1pdGVtLmRpc2FibGVkIC5hY3Rpb24tbGFiZWw6aG92ZXIge1xuXHRjb2xvcjogdmFyKC0tdnNjb2RlLWRpc2FibGVkRm9yZWdyb3VuZCk7XG59XG5cbi8qIFZlcnRpY2FsIGFjdGlvbnMgKi9cblxuLm1vbmFjby1tZW51IC5tb25hY28tYWN0aW9uLWJhci52ZXJ0aWNhbCB7XG5cdHRleHQtYWxpZ246IGxlZnQ7XG59XG5cbi5tb25hY28tbWVudSAubW9uYWNvLWFjdGlvbi1iYXIudmVydGljYWwgLmFjdGlvbi1pdGVtIHtcblx0ZGlzcGxheTogYmxvY2s7XG59XG5cbi5tb25hY28tbWVudSAubW9uYWNvLWFjdGlvbi1iYXIudmVydGljYWwgLmFjdGlvbi1sYWJlbC5zZXBhcmF0b3Ige1xuXHRkaXNwbGF5OiBibG9jaztcblx0Ym9yZGVyLWJvdHRvbTogMXB4IHNvbGlkIHZhcigtLXZzY29kZS1tZW51LXNlcGFyYXRvckJhY2tncm91bmQpO1xuXHRwYWRkaW5nLXRvcDogMXB4O1xuXHRwYWRkaW5nOiAzMHB4O1xufVxuXG4ubW9uYWNvLW1lbnUgLnNlY29uZGFyeS1hY3Rpb25zIC5tb25hY28tYWN0aW9uLWJhciAuYWN0aW9uLWxhYmVsIHtcblx0bWFyZ2luLWxlZnQ6IDZweDtcbn1cblxuLyogQWN0aW9uIEl0ZW1zICovXG4ubW9uYWNvLW1lbnUgLm1vbmFjby1hY3Rpb24tYmFyIC5hY3Rpb24taXRlbS5zZWxlY3QtY29udGFpbmVyIHtcblx0b3ZlcmZsb3c6IGhpZGRlbjsgLyogc29tZWhvdyB0aGUgZHJvcGRvd24gb3ZlcmZsb3dzIGl0cyBjb250YWluZXIsIHdlIHByZXZlbnQgaXQgaGVyZSB0byBub3QgcHVzaCAqL1xuXHRmbGV4OiAxO1xuXHRtYXgtd2lkdGg6IDE3MHB4O1xuXHRtaW4td2lkdGg6IDYwcHg7XG5cdGRpc3BsYXk6IGZsZXg7XG5cdGFsaWduLWl0ZW1zOiBjZW50ZXI7XG5cdGp1c3RpZnktY29udGVudDogY2VudGVyO1xuXHRtYXJnaW4tcmlnaHQ6IDEwcHg7XG59XG5cbi5tb25hY28tbWVudSAubW9uYWNvLWFjdGlvbi1iYXIudmVydGljYWwge1xuXHRtYXJnaW4tbGVmdDogMDtcblx0b3ZlcmZsb3c6IHZpc2libGU7XG59XG5cbi5tb25hY28tbWVudSAubW9uYWNvLWFjdGlvbi1iYXIudmVydGljYWwgLmFjdGlvbnMtY29udGFpbmVyIHtcblx0ZGlzcGxheTogYmxvY2s7XG59XG5cbi5tb25hY28tbWVudSAubW9uYWNvLWFjdGlvbi1iYXIudmVydGljYWwgLmFjdGlvbi1pdGVtIHtcblx0cGFkZGluZzogMDtcblx0dHJhbnNmb3JtOiBub25lO1xuXHRkaXNwbGF5OiBmbGV4O1xufVxuXG4ubW9uYWNvLW1lbnUgLm1vbmFjby1hY3Rpb24tYmFyLnZlcnRpY2FsIC5hY3Rpb24taXRlbS5hY3RpdmUge1xuXHR0cmFuc2Zvcm06IG5vbmU7XG59XG5cbi5tb25hY28tbWVudSAubW9uYWNvLWFjdGlvbi1iYXIudmVydGljYWwgLmFjdGlvbi1tZW51LWl0ZW0ge1xuXHRmbGV4OiAxIDEgYXV0bztcblx0ZGlzcGxheTogZmxleDtcblx0aGVpZ2h0OiAyNHB4O1xuXHRhbGlnbi1pdGVtczogY2VudGVyO1xuXHRwb3NpdGlvbjogcmVsYXRpdmU7XG5cdG1hcmdpbjogMCA0cHg7XG5cdGJvcmRlci1yYWRpdXM6IHZhcigtLXZzY29kZS1jb3JuZXJSYWRpdXMtbWVkaXVtKTtcbn1cblxuLm1vbmFjby1tZW51IC5tb25hY28tYWN0aW9uLWJhci52ZXJ0aWNhbCAuYWN0aW9uLW1lbnUtaXRlbTpob3ZlciAua2V5YmluZGluZyxcbi5tb25hY28tbWVudSAubW9uYWNvLWFjdGlvbi1iYXIudmVydGljYWwgLmFjdGlvbi1tZW51LWl0ZW06Zm9jdXMgLmtleWJpbmRpbmcge1xuXHRvcGFjaXR5OiB1bnNldDtcbn1cblxuLm1vbmFjby1tZW51IC5tb25hY28tYWN0aW9uLWJhci52ZXJ0aWNhbCAuYWN0aW9uLWxhYmVsIHtcblx0ZmxleDogMSAxIGF1dG87XG5cdHRleHQtZGVjb3JhdGlvbjogbm9uZTtcblx0cGFkZGluZzogMCAxZW07XG5cdGJhY2tncm91bmQ6IG5vbmU7XG5cdGZvbnQtc2l6ZTogMTJweDtcblx0bGluZS1oZWlnaHQ6IDE7XG59XG5cbi5tb25hY28tbWVudSAubW9uYWNvLWFjdGlvbi1iYXIudmVydGljYWwgLmtleWJpbmRpbmcsXG4ubW9uYWNvLW1lbnUgLm1vbmFjby1hY3Rpb24tYmFyLnZlcnRpY2FsIC5zdWJtZW51LWluZGljYXRvciB7XG5cdGRpc3BsYXk6IGlubGluZS1ibG9jaztcblx0ZmxleDogMiAxIGF1dG87XG5cdHBhZGRpbmc6IDAgMWVtO1xuXHR0ZXh0LWFsaWduOiByaWdodDtcblx0Zm9udC1zaXplOiAxMnB4O1xuXHRsaW5lLWhlaWdodDogMTtcblx0b3BhY2l0eTogMC43O1xufVxuXG4ubW9uYWNvLW1lbnUgLm1vbmFjby1hY3Rpb24tYmFyLnZlcnRpY2FsIC5zdWJtZW51LWluZGljYXRvciB7XG5cdGhlaWdodDogMTAwJTtcbn1cblxuLm1vbmFjby1tZW51IC5tb25hY28tYWN0aW9uLWJhci52ZXJ0aWNhbCAuc3VibWVudS1pbmRpY2F0b3IuY29kaWNvbiB7XG5cdGZvbnQtc2l6ZTogMTZweCAhaW1wb3J0YW50O1xuXHRkaXNwbGF5OiBmbGV4O1xuXHRhbGlnbi1pdGVtczogY2VudGVyO1xufVxuXG4ubW9uYWNvLW1lbnUgLm1vbmFjby1hY3Rpb24tYmFyLnZlcnRpY2FsIC5zdWJtZW51LWluZGljYXRvci5jb2RpY29uOjpiZWZvcmUge1xuXHRtYXJnaW4tbGVmdDogYXV0bztcblx0bWFyZ2luLXJpZ2h0OiAtMjBweDtcbn1cblxuLm1vbmFjby1tZW51IC5tb25hY28tYWN0aW9uLWJhci52ZXJ0aWNhbCAuYWN0aW9uLWl0ZW0uZGlzYWJsZWQgLmtleWJpbmRpbmcsXG4ubW9uYWNvLW1lbnUgLm1vbmFjby1hY3Rpb24tYmFyLnZlcnRpY2FsIC5hY3Rpb24taXRlbS5kaXNhYmxlZCAuc3VibWVudS1pbmRpY2F0b3Ige1xuXHRvcGFjaXR5OiAwLjQ7XG59XG5cbi5tb25hY28tbWVudSAubW9uYWNvLWFjdGlvbi1iYXIudmVydGljYWwgLmFjdGlvbi1sYWJlbDpub3QoLnNlcGFyYXRvcikge1xuXHRkaXNwbGF5OiBpbmxpbmUtYmxvY2s7XG5cdGJveC1zaXppbmc6IGJvcmRlci1ib3g7XG5cdG1hcmdpbjogMDtcbn1cblxuLm1vbmFjby1tZW51IC5tb25hY28tYWN0aW9uLWJhci52ZXJ0aWNhbCAuYWN0aW9uLWl0ZW0ge1xuXHRwb3NpdGlvbjogc3RhdGljO1xuXHRvdmVyZmxvdzogdmlzaWJsZTtcbn1cblxuLm1vbmFjby1tZW51IC5tb25hY28tYWN0aW9uLWJhci52ZXJ0aWNhbCAuYWN0aW9uLWl0ZW0gLm1vbmFjby1zdWJtZW51IHtcblx0cG9zaXRpb246IGFic29sdXRlO1xufVxuXG4ubW9uYWNvLW1lbnUgLm1vbmFjby1hY3Rpb24tYmFyLnZlcnRpY2FsIC5hY3Rpb24tbGFiZWwuc2VwYXJhdG9yIHtcblx0d2lkdGg6IDEwMCU7XG5cdGhlaWdodDogMHB4ICFpbXBvcnRhbnQ7XG5cdG9wYWNpdHk6IDE7XG59XG5cbi5tb25hY28tbWVudSAubW9uYWNvLWFjdGlvbi1iYXIudmVydGljYWwgLmFjdGlvbi1sYWJlbC5zZXBhcmF0b3IudGV4dCB7XG5cdHBhZGRpbmc6IDAuN2VtIDFlbSAwLjFlbSAxZW07XG5cdGZvbnQtd2VpZ2h0OiBib2xkO1xuXHRvcGFjaXR5OiAxO1xufVxuXG4ubW9uYWNvLW1lbnUgLm1vbmFjby1hY3Rpb24tYmFyLnZlcnRpY2FsIC5hY3Rpb24tbGFiZWw6aG92ZXIge1xuXHRjb2xvcjogaW5oZXJpdDtcbn1cblxuLm1vbmFjby1tZW51IC5tb25hY28tYWN0aW9uLWJhci52ZXJ0aWNhbCAubWVudS1pdGVtLWNoZWNrIHtcblx0cG9zaXRpb246IGFic29sdXRlO1xuXHR2aXNpYmlsaXR5OiBoaWRkZW47XG5cdHdpZHRoOiAxZW07XG5cdGhlaWdodDogMTAwJTtcbn1cblxuLm1vbmFjby1tZW51IC5tb25hY28tYWN0aW9uLWJhci52ZXJ0aWNhbCAuYWN0aW9uLW1lbnUtaXRlbS5jaGVja2VkIC5tZW51LWl0ZW0tY2hlY2sge1xuXHR2aXNpYmlsaXR5OiB2aXNpYmxlO1xuXHRkaXNwbGF5OiBmbGV4O1xuXHRhbGlnbi1pdGVtczogY2VudGVyO1xuXHRqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbn1cblxuLyogQ29udGV4dCBNZW51ICovXG5cbi5jb250ZXh0LXZpZXcubW9uYWNvLW1lbnUtY29udGFpbmVyIHtcblx0JHtDT05URVhUX1ZJRVdfTUVOVV9NT1RJT05fU0hBRE9XX1ZBUklBQkxFfTogJHttZW51U2hhZG93fTtcblx0b3V0bGluZTogMDtcblx0Ym9yZGVyOiBub25lO1xuXHRhbmltYXRpb246IGZhZGVJbiAwLjA4M3MgbGluZWFyO1xuXHQtd2Via2l0LWFwcC1yZWdpb246IG5vLWRyYWc7XG5cdGJveC1zaGFkb3c6IHZhcigke0NPTlRFWFRfVklFV19NRU5VX01PVElPTl9TSEFET1dfVkFSSUFCTEV9KTtcblx0Ym9yZGVyLXJhZGl1czogdmFyKC0tdnNjb2RlLWNvcm5lclJhZGl1cy1sYXJnZSk7XG5cdG92ZXJmbG93OiBoaWRkZW47XG59XG5cbi5jb250ZXh0LXZpZXcubW9uYWNvLW1lbnUtY29udGFpbmVyIDpmb2N1cyxcbi5jb250ZXh0LXZpZXcubW9uYWNvLW1lbnUtY29udGFpbmVyIC5tb25hY28tYWN0aW9uLWJhci52ZXJ0aWNhbDpmb2N1cyxcbi5jb250ZXh0LXZpZXcubW9uYWNvLW1lbnUtY29udGFpbmVyIC5tb25hY28tYWN0aW9uLWJhci52ZXJ0aWNhbCA6Zm9jdXMge1xuXHRvdXRsaW5lOiAwO1xufVxuXG4uaGMtYmxhY2sgLmNvbnRleHQtdmlldy5tb25hY28tbWVudS1jb250YWluZXIsXG4uaGMtbGlnaHQgLmNvbnRleHQtdmlldy5tb25hY28tbWVudS1jb250YWluZXIsXG46aG9zdC1jb250ZXh0KC5oYy1ibGFjaykgLmNvbnRleHQtdmlldy5tb25hY28tbWVudS1jb250YWluZXIsXG46aG9zdC1jb250ZXh0KC5oYy1saWdodCkgLmNvbnRleHQtdmlldy5tb25hY28tbWVudS1jb250YWluZXIge1xuXHQke0NPTlRFWFRfVklFV19NRU5VX01PVElPTl9TSEFET1dfVkFSSUFCTEV9OiBub25lO1xuXHRib3gtc2hhZG93OiBub25lO1xufVxuXG4uaGMtYmxhY2sgLm1vbmFjby1tZW51IC5tb25hY28tYWN0aW9uLWJhci52ZXJ0aWNhbCAuYWN0aW9uLWl0ZW0uZm9jdXNlZCxcbi5oYy1saWdodCAubW9uYWNvLW1lbnUgLm1vbmFjby1hY3Rpb24tYmFyLnZlcnRpY2FsIC5hY3Rpb24taXRlbS5mb2N1c2VkLFxuOmhvc3QtY29udGV4dCguaGMtYmxhY2spIC5tb25hY28tbWVudSAubW9uYWNvLWFjdGlvbi1iYXIudmVydGljYWwgLmFjdGlvbi1pdGVtLmZvY3VzZWQsXG46aG9zdC1jb250ZXh0KC5oYy1saWdodCkgLm1vbmFjby1tZW51IC5tb25hY28tYWN0aW9uLWJhci52ZXJ0aWNhbCAuYWN0aW9uLWl0ZW0uZm9jdXNlZCB7XG5cdGJhY2tncm91bmQ6IG5vbmU7XG59XG5cbi8qIFNob3cgdGhlIG1lbnUgaXRlbSBzZWxlY3Rpb24gYm9yZGVyIG9ubHkgZm9yIGtleWJvYXJkIG5hdmlnYXRpb24uIFBvaW50ZXItZHJpdmVuIGZvY3VzIHR5cGljYWxseSBkb2VzIG5vdCBzZXQgOmZvY3VzLXZpc2libGUsIHNvIHN1cHByZXNzIHRoZSBib3JkZXIgaW4gdGhhdCBjYXNlLiAqL1xuLm1vbmFjby1tZW51IC5tb25hY28tYWN0aW9uLWJhci52ZXJ0aWNhbCAuYWN0aW9uLW1lbnUtaXRlbTpmb2N1czpub3QoOmZvY3VzLXZpc2libGUpIHtcblx0b3V0bGluZTogbm9uZSAhaW1wb3J0YW50O1xuXHRvdXRsaW5lLW9mZnNldDogMCAhaW1wb3J0YW50O1xufVxuXG4vKiBIaWdoIGNvbnRyYXN0IHRoZW1lcyBhbHdheXMgc2hvdyB0aGUgc2VsZWN0aW9uIGJvcmRlciB0byBpbmRpY2F0ZSB0aGUgZm9jdXNlZCBpdGVtLCByZWdhcmRsZXNzIG9mIGlucHV0IG1vZGFsaXR5LiBUaGUgZHVwbGljYXRlZCAubW9uYWNvLW1lbnUgcmFpc2VzIHNwZWNpZmljaXR5IGFib3ZlIHRoZSBrZXlib2FyZC1vbmx5IHN1cHByZXNzaW9uIHJ1bGUgYWJvdmUgc28gdGhpcyB3aW5zIGluZGVwZW5kZW50IG9mIGRlY2xhcmF0aW9uIG9yZGVyLiAqL1xuLmhjLWJsYWNrIC5tb25hY28tbWVudS5tb25hY28tbWVudSAubW9uYWNvLWFjdGlvbi1iYXIudmVydGljYWwgLmFjdGlvbi1pdGVtLmZvY3VzZWQgPiAuYWN0aW9uLW1lbnUtaXRlbSxcbi5oYy1saWdodCAubW9uYWNvLW1lbnUubW9uYWNvLW1lbnUgLm1vbmFjby1hY3Rpb24tYmFyLnZlcnRpY2FsIC5hY3Rpb24taXRlbS5mb2N1c2VkID4gLmFjdGlvbi1tZW51LWl0ZW0ge1xuXHRvdXRsaW5lOiAxcHggc29saWQgdmFyKC0tdnNjb2RlLW1lbnUtc2VsZWN0aW9uQm9yZGVyKSAhaW1wb3J0YW50O1xuXHRvdXRsaW5lLW9mZnNldDogLTFweCAhaW1wb3J0YW50O1xufVxuXG4vKiBLZWVwIDpob3N0LWNvbnRleHQgc2VwYXJhdGUgYmVjYXVzZSBXZWJLaXQgb3RoZXJ3aXNlIHJlamVjdHMgdGhlIHZhbGlkIHNlbGVjdG9ycyBhYm92ZS4gKi9cbjpob3N0LWNvbnRleHQoLmhjLWJsYWNrKSAubW9uYWNvLW1lbnUubW9uYWNvLW1lbnUgLm1vbmFjby1hY3Rpb24tYmFyLnZlcnRpY2FsIC5hY3Rpb24taXRlbS5mb2N1c2VkID4gLmFjdGlvbi1tZW51LWl0ZW0sXG46aG9zdC1jb250ZXh0KC5oYy1saWdodCkgLm1vbmFjby1tZW51Lm1vbmFjby1tZW51IC5tb25hY28tYWN0aW9uLWJhci52ZXJ0aWNhbCAuYWN0aW9uLWl0ZW0uZm9jdXNlZCA+IC5hY3Rpb24tbWVudS1pdGVtIHtcblx0b3V0bGluZTogMXB4IHNvbGlkIHZhcigtLXZzY29kZS1tZW51LXNlbGVjdGlvbkJvcmRlcikgIWltcG9ydGFudDtcblx0b3V0bGluZS1vZmZzZXQ6IC0xcHggIWltcG9ydGFudDtcbn1cblxuLyogVmVydGljYWwgQWN0aW9uIEJhciBTdHlsZXMgKi9cblxuLm1vbmFjby1tZW51IC5tb25hY28tYWN0aW9uLWJhci52ZXJ0aWNhbCB7XG5cdHBhZGRpbmc6IDRweCAwO1xufVxuXG4ubW9uYWNvLW1lbnUgLm1vbmFjby1hY3Rpb24tYmFyLnZlcnRpY2FsIC5hY3Rpb24tbWVudS1pdGVtIHtcblx0aGVpZ2h0OiAyNHB4O1xufVxuXG4ubW9uYWNvLW1lbnUgLm1vbmFjby1hY3Rpb24tYmFyLnZlcnRpY2FsIC5hY3Rpb24tbGFiZWw6bm90KC5zZXBhcmF0b3IpLFxuLm1vbmFjby1tZW51IC5tb25hY28tYWN0aW9uLWJhci52ZXJ0aWNhbCAua2V5YmluZGluZyB7XG5cdGZvbnQtc2l6ZTogaW5oZXJpdDtcblx0cGFkZGluZzogMCAyZW07XG5cdG1heC1oZWlnaHQ6IDEwMCU7XG59XG5cbi5tb25hY28tbWVudSAubW9uYWNvLWFjdGlvbi1iYXIudmVydGljYWwgLm1lbnUtaXRlbS1jaGVjayB7XG5cdGZvbnQtc2l6ZTogaW5oZXJpdDtcblx0d2lkdGg6IDJlbTtcbn1cblxuLm1vbmFjby1tZW51IC5tb25hY28tYWN0aW9uLWJhci52ZXJ0aWNhbCAuYWN0aW9uLWxhYmVsLnNlcGFyYXRvciB7XG5cdGZvbnQtc2l6ZTogaW5oZXJpdDtcblx0bWFyZ2luOiA1cHggMCAhaW1wb3J0YW50O1xuXHRwYWRkaW5nOiAwO1xuXHRib3JkZXItcmFkaXVzOiAwO1xufVxuXG4ubGludXggLm1vbmFjby1tZW51IC5tb25hY28tYWN0aW9uLWJhci52ZXJ0aWNhbCAuYWN0aW9uLWxhYmVsLnNlcGFyYXRvcixcbjpob3N0LWNvbnRleHQoLmxpbnV4KSAubW9uYWNvLW1lbnUgLm1vbmFjby1hY3Rpb24tYmFyLnZlcnRpY2FsIC5hY3Rpb24tbGFiZWwuc2VwYXJhdG9yIHtcblx0bWFyZ2luLWxlZnQ6IDA7XG5cdG1hcmdpbi1yaWdodDogMDtcbn1cblxuLm1vbmFjby1tZW51IC5tb25hY28tYWN0aW9uLWJhci52ZXJ0aWNhbCAuc3VibWVudS1pbmRpY2F0b3Ige1xuXHRmb250LXNpemU6IDYwJTtcblx0cGFkZGluZzogMCAxLjhlbTtcbn1cblxuLmxpbnV4IC5tb25hY28tbWVudSAubW9uYWNvLWFjdGlvbi1iYXIudmVydGljYWwgLnN1Ym1lbnUtaW5kaWNhdG9yLFxuOmhvc3QtY29udGV4dCgubGludXgpIC5tb25hY28tbWVudSAubW9uYWNvLWFjdGlvbi1iYXIudmVydGljYWwgLnN1Ym1lbnUtaW5kaWNhdG9yIHtcblx0aGVpZ2h0OiAxMDAlO1xuXHRtYXNrLXNpemU6IDEwcHggMTBweDtcblx0LXdlYmtpdC1tYXNrLXNpemU6IDEwcHggMTBweDtcbn1cblxuLm1vbmFjby1tZW51IC5hY3Rpb24taXRlbSB7XG5cdGN1cnNvcjogZGVmYXVsdDtcbn1gO1xuXG5cdGlmIChpc0ZvclNoYWRvd0RvbSkge1xuXHRcdC8vIE9ubHkgZGVmaW5lIHNjcm9sbGJhciBzdHlsZXMgd2hlbiB1c2VkIGluc2lkZSBzaGFkb3cgZG9tLFxuXHRcdC8vIG90aGVyd2lzZSBsZWF2ZSB0aGVpciBzdHlsaW5nIHRvIHRoZSBnbG9iYWwgd29ya2JlbmNoIHN0eWxpbmcuXG5cdFx0cmVzdWx0ICs9IGBcblx0XHRcdC8qIEFycm93cyAqL1xuXHRcdFx0Lm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAuc2Nyb2xsYmFyID4gLnNjcmEge1xuXHRcdFx0XHRjdXJzb3I6IHBvaW50ZXI7XG5cdFx0XHRcdGZvbnQtc2l6ZTogMTFweCAhaW1wb3J0YW50O1xuXHRcdFx0fVxuXG5cdFx0XHQubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC52aXNpYmxlIHtcblx0XHRcdFx0b3BhY2l0eTogMTtcblxuXHRcdFx0XHQvKiBCYWNrZ3JvdW5kIHJ1bGUgYWRkZWQgZm9yIElFOSAtIHRvIGFsbG93IGNsaWNrcyBvbiBkb20gbm9kZSAqL1xuXHRcdFx0XHRiYWNrZ3JvdW5kOnJnYmEoMCwwLDAsMCk7XG5cblx0XHRcdFx0dHJhbnNpdGlvbjogb3BhY2l0eSAxMDBtcyBsaW5lYXI7XG5cdFx0XHR9XG5cdFx0XHQubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5pbnZpc2libGUge1xuXHRcdFx0XHRvcGFjaXR5OiAwO1xuXHRcdFx0XHRwb2ludGVyLWV2ZW50czogbm9uZTtcblx0XHRcdH1cblx0XHRcdC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLmludmlzaWJsZS5mYWRlIHtcblx0XHRcdFx0dHJhbnNpdGlvbjogb3BhY2l0eSA4MDBtcyBsaW5lYXI7XG5cdFx0XHR9XG5cblx0XHRcdC8qIFNjcm9sbGFibGUgQ29udGVudCBJbnNldCBTaGFkb3cgKi9cblx0XHRcdC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLnNoYWRvdyB7XG5cdFx0XHRcdHBvc2l0aW9uOiBhYnNvbHV0ZTtcblx0XHRcdFx0ZGlzcGxheTogbm9uZTtcblx0XHRcdH1cblx0XHRcdC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLnNoYWRvdy50b3Age1xuXHRcdFx0XHRkaXNwbGF5OiBibG9jaztcblx0XHRcdFx0dG9wOiAwO1xuXHRcdFx0XHRsZWZ0OiAzcHg7XG5cdFx0XHRcdGhlaWdodDogM3B4O1xuXHRcdFx0XHR3aWR0aDogMTAwJTtcblx0XHRcdH1cblx0XHRcdC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLnNoYWRvdy5sZWZ0IHtcblx0XHRcdFx0ZGlzcGxheTogYmxvY2s7XG5cdFx0XHRcdHRvcDogM3B4O1xuXHRcdFx0XHRsZWZ0OiAwO1xuXHRcdFx0XHRoZWlnaHQ6IDEwMCU7XG5cdFx0XHRcdHdpZHRoOiAzcHg7XG5cdFx0XHR9XG5cdFx0XHQubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5zaGFkb3cudG9wLWxlZnQtY29ybmVyIHtcblx0XHRcdFx0ZGlzcGxheTogYmxvY2s7XG5cdFx0XHRcdHRvcDogMDtcblx0XHRcdFx0bGVmdDogMDtcblx0XHRcdFx0aGVpZ2h0OiAzcHg7XG5cdFx0XHRcdHdpZHRoOiAzcHg7XG5cdFx0XHR9XG5cdFx0XHQvKiBGaXggZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMDMxNzAgKi9cblx0XHRcdC5tb25hY28tbWVudSAuYWN0aW9uLWl0ZW0gLm1vbmFjby1zdWJtZW51IHtcblx0XHRcdFx0ei1pbmRleDogMTtcblx0XHRcdH1cblx0XHRgO1xuXG5cdFx0Ly8gU2Nyb2xsYmFyc1xuXHRcdGNvbnN0IHNjcm9sbGJhclNoYWRvd0NvbG9yID0gc3R5bGUuc2Nyb2xsYmFyU2hhZG93O1xuXHRcdGlmIChzY3JvbGxiYXJTaGFkb3dDb2xvcikge1xuXHRcdFx0cmVzdWx0ICs9IGBcblx0XHRcdFx0Lm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAuc2hhZG93LnRvcCB7XG5cdFx0XHRcdFx0Ym94LXNoYWRvdzogJHtzY3JvbGxiYXJTaGFkb3dDb2xvcn0gMCA2cHggNnB4IC02cHggaW5zZXQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5zaGFkb3cubGVmdCB7XG5cdFx0XHRcdFx0Ym94LXNoYWRvdzogJHtzY3JvbGxiYXJTaGFkb3dDb2xvcn0gNnB4IDAgNnB4IC02cHggaW5zZXQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5zaGFkb3cudG9wLmxlZnQge1xuXHRcdFx0XHRcdGJveC1zaGFkb3c6ICR7c2Nyb2xsYmFyU2hhZG93Q29sb3J9IDZweCA2cHggNnB4IC02cHggaW5zZXQ7XG5cdFx0XHRcdH1cblx0XHRcdGA7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Nyb2xsYmFyU2xpZGVyQmFja2dyb3VuZENvbG9yID0gc3R5bGUuc2Nyb2xsYmFyU2xpZGVyQmFja2dyb3VuZDtcblx0XHRpZiAoc2Nyb2xsYmFyU2xpZGVyQmFja2dyb3VuZENvbG9yKSB7XG5cdFx0XHRyZXN1bHQgKz0gYFxuXHRcdFx0XHQubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5zY3JvbGxiYXIgPiAuc2xpZGVyIHtcblx0XHRcdFx0XHRiYWNrZ3JvdW5kOiAke3Njcm9sbGJhclNsaWRlckJhY2tncm91bmRDb2xvcn07XG5cdFx0XHRcdH1cblx0XHRcdGA7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Nyb2xsYmFyU2xpZGVySG92ZXJCYWNrZ3JvdW5kQ29sb3IgPSBzdHlsZS5zY3JvbGxiYXJTbGlkZXJIb3ZlckJhY2tncm91bmQ7XG5cdFx0aWYgKHNjcm9sbGJhclNsaWRlckhvdmVyQmFja2dyb3VuZENvbG9yKSB7XG5cdFx0XHRyZXN1bHQgKz0gYFxuXHRcdFx0XHQubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5zY3JvbGxiYXIgPiAuc2xpZGVyOmhvdmVyIHtcblx0XHRcdFx0XHRiYWNrZ3JvdW5kOiAke3Njcm9sbGJhclNsaWRlckhvdmVyQmFja2dyb3VuZENvbG9yfTtcblx0XHRcdFx0fVxuXHRcdFx0YDtcblx0XHR9XG5cblx0XHRjb25zdCBzY3JvbGxiYXJTbGlkZXJBY3RpdmVCYWNrZ3JvdW5kQ29sb3IgPSBzdHlsZS5zY3JvbGxiYXJTbGlkZXJBY3RpdmVCYWNrZ3JvdW5kO1xuXHRcdGlmIChzY3JvbGxiYXJTbGlkZXJBY3RpdmVCYWNrZ3JvdW5kQ29sb3IpIHtcblx0XHRcdHJlc3VsdCArPSBgXG5cdFx0XHRcdC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLnNjcm9sbGJhciA+IC5zbGlkZXIuYWN0aXZlIHtcblx0XHRcdFx0XHRiYWNrZ3JvdW5kOiAke3Njcm9sbGJhclNsaWRlckFjdGl2ZUJhY2tncm91bmRDb2xvcn07XG5cdFx0XHRcdH1cblx0XHRcdGA7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsYUFBYSxnQkFBZ0IsZUFBZTtBQUNyRCxTQUFTLEdBQUcsdUJBQXVCLFFBQVEsV0FBVyxXQUFXLGFBQXdCLFdBQVcsa0JBQWtCLFdBQWlDLFlBQVkscUJBQXFCO0FBQ3hMLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsV0FBVywwQkFBbUQ7QUFDdkUsU0FBUyxnQkFBZ0IsMEJBQWtEO0FBQzNFLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsb0JBQTRDLFdBQVcscUJBQXFCO0FBQ3JGLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGlCQUFpQjtBQUUxQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFFeEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxTQUFTLG1CQUFtQjtBQUNyQyxTQUFTLDJCQUF3QztBQUNqRCxZQUFZLGFBQWE7QUFDekIsU0FBMEIsUUFBUSw0QkFBNEI7QUFDOUQsU0FBUyxnREFBZ0Q7QUFFbEQsTUFBTSxzQkFBc0I7QUFDNUIsTUFBTSw4QkFBOEI7QUFJcEMsSUFBSyxzQkFBTCxrQkFBS0EseUJBQUw7QUFDTixFQUFBQSwwQ0FBQTtBQUNBLEVBQUFBLDBDQUFBO0FBRlcsU0FBQUE7QUFBQSxHQUFBO0FBS0wsSUFBSyxvQkFBTCxrQkFBS0MsdUJBQUw7QUFDTixFQUFBQSxz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akMsV0FBVyxRQUFRLFdBQVcsQ0FBQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxHQWtOOUIsd0NBQXdDLEtBQUssVUFBVTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsbUJBS3ZDLHdDQUF3QztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxHQWV4RCx3Q0FBd0M7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFrRjFDLE1BQUksZ0JBQWdCO0FBR25CLGNBQVU7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBd0RWLFVBQU0sdUJBQXVCLE1BQU07QUFDbkMsUUFBSSxzQkFBc0I7QUFDekIsZ0JBQVU7QUFBQTtBQUFBLG1CQUVNLG9CQUFvQjtBQUFBO0FBQUE7QUFBQTtBQUFBLG1CQUlwQixvQkFBb0I7QUFBQTtBQUFBO0FBQUE7QUFBQSxtQkFJcEIsb0JBQW9CO0FBQUE7QUFBQTtBQUFBLElBR3JDO0FBRUEsVUFBTSxpQ0FBaUMsTUFBTTtBQUM3QyxRQUFJLGdDQUFnQztBQUNuQyxnQkFBVTtBQUFBO0FBQUEsbUJBRU0sOEJBQThCO0FBQUE7QUFBQTtBQUFBLElBRy9DO0FBRUEsVUFBTSxzQ0FBc0MsTUFBTTtBQUNsRCxRQUFJLHFDQUFxQztBQUN4QyxnQkFBVTtBQUFBO0FBQUEsbUJBRU0sbUNBQW1DO0FBQUE7QUFBQTtBQUFBLElBR3BEO0FBRUEsVUFBTSx1Q0FBdUMsTUFBTTtBQUNuRCxRQUFJLHNDQUFzQztBQUN6QyxnQkFBVTtBQUFBO0FBQUEsbUJBRU0sb0NBQW9DO0FBQUE7QUFBQTtBQUFBLElBR3JEO0FBQUEsRUFDRDtBQUVBLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFsiSG9yaXpvbnRhbERpcmVjdGlvbiIsICJWZXJ0aWNhbERpcmVjdGlvbiIsICJhY3Rpb25zIl0KfQo=
