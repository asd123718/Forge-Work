import * as DOM from "../../dom.js";
import { StandardKeyboardEvent } from "../../keyboardEvent.js";
import { ActionViewItem, BaseActionViewItem } from "./actionViewItems.js";
import { createInstantHoverDelegate } from "../hover/hoverDelegateFactory.js";
import { ActionRunner, Separator } from "../../../common/actions.js";
import { Emitter } from "../../../common/event.js";
import { KeyCode, KeyMod } from "../../../common/keyCodes.js";
import { Disposable, DisposableMap, DisposableStore, dispose } from "../../../common/lifecycle.js";
import * as types from "../../../common/types.js";
import "./actionbar.css";
var ActionsOrientation = /* @__PURE__ */ ((ActionsOrientation2) => {
  ActionsOrientation2[ActionsOrientation2["HORIZONTAL"] = 0] = "HORIZONTAL";
  ActionsOrientation2[ActionsOrientation2["VERTICAL"] = 1] = "VERTICAL";
  return ActionsOrientation2;
})(ActionsOrientation || {});
class ActionBar extends Disposable {
  constructor(container, options = {}) {
    super();
    this._actionRunnerDisposables = this._register(new DisposableStore());
    this.viewItemDisposables = this._register(new DisposableMap());
    // Trigger Key Tracking
    this.triggerKeyDown = false;
    this.focusable = true;
    this._onDidBlur = this._register(new Emitter());
    this._onDidCancel = this._register(new Emitter({ onWillAddFirstListener: () => this.cancelHasListener = true }));
    this.cancelHasListener = false;
    this._onDidRun = this._register(new Emitter());
    this._onWillRun = this._register(new Emitter());
    this.options = options;
    this._context = options.context ?? null;
    this._orientation = this.options.orientation ?? 0 /* HORIZONTAL */;
    this._triggerKeys = {
      keyDown: this.options.triggerKeys?.keyDown ?? false,
      keys: this.options.triggerKeys?.keys ?? [KeyCode.Enter, KeyCode.Space]
    };
    this._hoverDelegate = options.hoverDelegate ?? this._register(createInstantHoverDelegate());
    if (this.options.actionRunner) {
      this._actionRunner = this.options.actionRunner;
    } else {
      this._actionRunner = new ActionRunner();
      this._actionRunnerDisposables.add(this._actionRunner);
    }
    this._actionRunnerDisposables.add(this._actionRunner.onDidRun((e) => this._onDidRun.fire(e)));
    this._actionRunnerDisposables.add(this._actionRunner.onWillRun((e) => this._onWillRun.fire(e)));
    this._viewItems = [];
    this.focusedItem = void 0;
    this.domNode = document.createElement("div");
    this.domNode.className = "monaco-action-bar";
    let previousKeys;
    let nextKeys;
    switch (this._orientation) {
      case 0 /* HORIZONTAL */:
        previousKeys = [KeyCode.LeftArrow];
        nextKeys = [KeyCode.RightArrow];
        break;
      case 1 /* VERTICAL */:
        previousKeys = [KeyCode.UpArrow];
        nextKeys = [KeyCode.DownArrow];
        this.domNode.className += " vertical";
        break;
    }
    this._register(DOM.addDisposableListener(this.domNode, DOM.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      let eventHandled = true;
      const focusedItem = typeof this.focusedItem === "number" ? this.viewItems[this.focusedItem] : void 0;
      if (previousKeys && (event.equals(previousKeys[0]) || event.equals(previousKeys[1]))) {
        eventHandled = this.focusPrevious();
      } else if (nextKeys && (event.equals(nextKeys[0]) || event.equals(nextKeys[1]))) {
        eventHandled = this.focusNext();
      } else if (event.equals(KeyCode.Escape) && this.cancelHasListener) {
        this._onDidCancel.fire();
      } else if (event.equals(KeyCode.Home)) {
        eventHandled = this.focusFirst();
      } else if (event.equals(KeyCode.End)) {
        eventHandled = this.focusLast();
      } else if (event.equals(KeyCode.Tab) && focusedItem instanceof BaseActionViewItem && focusedItem.trapsArrowNavigation) {
        eventHandled = this.focusNext(void 0, true);
      } else if (this.isTriggerKeyEvent(event)) {
        if (this._triggerKeys.keyDown) {
          this.doTrigger(event);
        } else {
          this.triggerKeyDown = true;
        }
      } else {
        eventHandled = false;
      }
      if (eventHandled) {
        event.preventDefault();
        event.stopPropagation();
      }
    }));
    this._register(DOM.addDisposableListener(this.domNode, DOM.EventType.KEY_UP, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (this.isTriggerKeyEvent(event)) {
        if (!this._triggerKeys.keyDown && this.triggerKeyDown) {
          this.triggerKeyDown = false;
          this.doTrigger(event);
        }
        event.preventDefault();
        event.stopPropagation();
      } else if (event.equals(KeyCode.Tab) || event.equals(KeyMod.Shift | KeyCode.Tab) || event.equals(KeyCode.UpArrow) || event.equals(KeyCode.DownArrow) || event.equals(KeyCode.LeftArrow) || event.equals(KeyCode.RightArrow)) {
        this.updateFocusedItem();
      }
    }));
    this.focusTracker = this._register(DOM.trackFocus(this.domNode));
    this._register(this.focusTracker.onDidBlur(() => {
      if (DOM.getActiveElement() === this.domNode || !DOM.isAncestor(DOM.getActiveElement(), this.domNode)) {
        this._onDidBlur.fire();
        this.previouslyFocusedItem = this.focusedItem;
        this.focusedItem = void 0;
        this.triggerKeyDown = false;
      }
    }));
    this._register(this.focusTracker.onDidFocus(() => this.updateFocusedItem()));
    this.actionsList = document.createElement("ul");
    this.actionsList.className = "actions-container";
    if (this.options.highlightToggledItems) {
      this.actionsList.classList.add("highlight-toggled");
    }
    this.actionsList.setAttribute("role", this.options.ariaRole || "toolbar");
    if (this.options.ariaLabel) {
      this.actionsList.setAttribute("aria-label", this.options.ariaLabel);
    }
    this.domNode.appendChild(this.actionsList);
    container.appendChild(this.domNode);
  }
  get viewItems() {
    return this._viewItems;
  }
  get onDidBlur() {
    return this._onDidBlur.event;
  }
  get onDidCancel() {
    return this._onDidCancel.event;
  }
  get onDidRun() {
    return this._onDidRun.event;
  }
  get onWillRun() {
    return this._onWillRun.event;
  }
  refreshRole() {
    if (this.length() >= 1) {
      this.actionsList.setAttribute("role", this.options.ariaRole || "toolbar");
    } else {
      this.actionsList.setAttribute("role", "presentation");
    }
  }
  setAriaLabel(label) {
    if (label) {
      this.actionsList.setAttribute("aria-label", label);
    } else {
      this.actionsList.removeAttribute("aria-label");
    }
  }
  // Some action bars should not be focusable at times
  // When an action bar is not focusable make sure to make all the elements inside it not focusable
  // When an action bar is focusable again, make sure the first item can be focused
  setFocusable(focusable) {
    this.focusable = focusable;
    if (this.focusable) {
      const firstEnabled = this.viewItems.find((vi) => vi instanceof BaseActionViewItem && vi.isEnabled());
      if (firstEnabled instanceof BaseActionViewItem) {
        firstEnabled.setFocusable(true);
      }
    } else {
      this.viewItems.forEach((vi) => {
        if (vi instanceof BaseActionViewItem) {
          vi.setFocusable(false);
        }
      });
    }
  }
  isTriggerKeyEvent(event) {
    let ret = false;
    this._triggerKeys.keys.forEach((keyCode) => {
      ret = ret || event.equals(keyCode);
    });
    return ret;
  }
  updateFocusedItem() {
    for (let i = 0; i < this.actionsList.children.length; i++) {
      const elem = this.actionsList.children[i];
      if (DOM.isAncestor(DOM.getActiveElement(), elem)) {
        this.focusedItem = i;
        this.viewItems[this.focusedItem]?.showHover?.();
        break;
      }
    }
  }
  get context() {
    return this._context;
  }
  set context(context) {
    this._context = context;
    this.viewItems.forEach((i) => i.setActionContext(context));
  }
  get actionRunner() {
    return this._actionRunner;
  }
  set actionRunner(actionRunner) {
    this._actionRunner = actionRunner;
    this._actionRunnerDisposables.clear();
    this._actionRunnerDisposables.add(this._actionRunner.onDidRun((e) => this._onDidRun.fire(e)));
    this._actionRunnerDisposables.add(this._actionRunner.onWillRun((e) => this._onWillRun.fire(e)));
    this.viewItems.forEach((item) => item.actionRunner = actionRunner);
  }
  getContainer() {
    return this.domNode;
  }
  hasAction(action) {
    return this.viewItems.findIndex((candidate) => candidate.action.id === action.id) !== -1;
  }
  getAction(indexOrElement) {
    if (typeof indexOrElement === "number") {
      return this.viewItems[indexOrElement]?.action;
    }
    if (DOM.isHTMLElement(indexOrElement)) {
      while (indexOrElement.parentElement !== this.actionsList) {
        if (!indexOrElement.parentElement) {
          return void 0;
        }
        indexOrElement = indexOrElement.parentElement;
      }
      for (let i = 0; i < this.actionsList.childNodes.length; i++) {
        if (this.actionsList.childNodes[i] === indexOrElement) {
          return this.viewItems[i].action;
        }
      }
    }
    return void 0;
  }
  push(arg, options = {}) {
    const actions = Array.isArray(arg) ? arg : [arg];
    let index = types.isNumber(options.index) ? options.index : null;
    actions.forEach((action) => {
      const actionViewItemElement = document.createElement("li");
      actionViewItemElement.className = "action-item";
      actionViewItemElement.setAttribute("role", "presentation");
      let item;
      const viewItemOptions = { hoverDelegate: this._hoverDelegate, ...options, isTabList: this.options.ariaRole === "tablist" };
      if (this.options.actionViewItemProvider) {
        item = this.options.actionViewItemProvider(action, viewItemOptions);
      }
      if (!item) {
        item = new ActionViewItem(this.context, action, viewItemOptions);
      }
      if (!this.options.allowContextMenu) {
        this.viewItemDisposables.set(item, DOM.addDisposableListener(actionViewItemElement, DOM.EventType.CONTEXT_MENU, (e) => {
          DOM.EventHelper.stop(e, true);
        }));
      }
      item.actionRunner = this._actionRunner;
      item.setActionContext(this.context);
      item.render(actionViewItemElement);
      if (index === null || index < 0 || index >= this.actionsList.children.length) {
        this.actionsList.appendChild(actionViewItemElement);
        this._viewItems.push(item);
      } else {
        this.actionsList.insertBefore(actionViewItemElement, this.actionsList.children[index]);
        this._viewItems.splice(index, 0, item);
        index++;
      }
    });
    if (this.focusable) {
      let didFocus = false;
      for (const item of this.viewItems) {
        if (!(item instanceof BaseActionViewItem)) {
          continue;
        }
        let focus;
        if (didFocus) {
          focus = false;
        } else if (item.action.id === Separator.ID) {
          focus = false;
        } else if (!item.isEnabled() && this.options.focusOnlyEnabledItems) {
          focus = false;
        } else {
          focus = true;
        }
        if (focus) {
          item.setFocusable(true);
          didFocus = true;
        } else {
          item.setFocusable(false);
        }
      }
    }
    if (typeof this.focusedItem === "number") {
      this.focus(this.focusedItem);
    }
    this.refreshRole();
  }
  getWidth(index) {
    return this.actionsList.children.item(index)?.clientWidth ?? 0;
  }
  getHeight(index) {
    return this.actionsList.children.item(index)?.clientHeight ?? 0;
  }
  pull(index) {
    if (index >= 0 && index < this.viewItems.length) {
      this.actionsList.childNodes[index].remove();
      this.viewItemDisposables.deleteAndDispose(this.viewItems[index]);
      dispose(this._viewItems.splice(index, 1));
      this.refreshRole();
    }
  }
  clear() {
    if (this.isEmpty()) {
      return;
    }
    this._viewItems = dispose(this._viewItems);
    this.viewItemDisposables.clearAndDisposeAll();
    DOM.clearNode(this.actionsList);
    this.refreshRole();
  }
  length() {
    return this.viewItems.length;
  }
  isEmpty() {
    return this.viewItems.length === 0;
  }
  isFocused(index) {
    return index === void 0 ? DOM.isAncestor(DOM.getActiveElement(), this.domNode) : DOM.isAncestor(DOM.getActiveElement(), this.actionsList.children[index]);
  }
  focus(arg) {
    let selectFirst = false;
    let index = void 0;
    if (arg === void 0) {
      selectFirst = true;
    } else if (typeof arg === "number") {
      index = arg;
    } else if (typeof arg === "boolean") {
      selectFirst = arg;
    }
    if (selectFirst && typeof this.focusedItem === "undefined") {
      const firstEnabled = this.viewItems.findIndex((item) => item.isEnabled());
      this.focusedItem = firstEnabled === -1 ? void 0 : firstEnabled;
      this.updateFocus(void 0, void 0, true);
    } else {
      if (index !== void 0) {
        this.focusedItem = index;
      }
      this.updateFocus(void 0, void 0, true);
    }
  }
  focusFirst() {
    this.focusedItem = this.length() - 1;
    return this.focusNext(true);
  }
  focusLast() {
    this.focusedItem = 0;
    return this.focusPrevious(true);
  }
  focusNext(forceLoop, forceFocus) {
    if (typeof this.focusedItem === "undefined") {
      this.focusedItem = this.viewItems.length - 1;
    } else if (this.viewItems.length <= 1) {
      return false;
    }
    const startIndex = this.focusedItem;
    let item;
    do {
      if (!forceLoop && this.options.preventLoopNavigation && this.focusedItem + 1 >= this.viewItems.length) {
        this.focusedItem = startIndex;
        return false;
      }
      this.focusedItem = (this.focusedItem + 1) % this.viewItems.length;
      item = this.viewItems[this.focusedItem];
    } while (this.focusedItem !== startIndex && (this.options.focusOnlyEnabledItems && !item.isEnabled() || item.action.id === Separator.ID));
    this.updateFocus(void 0, void 0, forceFocus);
    return true;
  }
  focusPrevious(forceLoop) {
    if (typeof this.focusedItem === "undefined") {
      this.focusedItem = 0;
    } else if (this.viewItems.length <= 1) {
      return false;
    }
    const startIndex = this.focusedItem;
    let item;
    do {
      this.focusedItem = this.focusedItem - 1;
      if (this.focusedItem < 0) {
        if (!forceLoop && this.options.preventLoopNavigation) {
          this.focusedItem = startIndex;
          return false;
        }
        this.focusedItem = this.viewItems.length - 1;
      }
      item = this.viewItems[this.focusedItem];
    } while (this.focusedItem !== startIndex && (this.options.focusOnlyEnabledItems && !item.isEnabled() || item.action.id === Separator.ID));
    this.updateFocus(true);
    return true;
  }
  updateFocus(fromRight, preventScroll, forceFocus = false) {
    if (typeof this.focusedItem === "undefined") {
      this.actionsList.focus({ preventScroll });
    }
    if (this.previouslyFocusedItem !== void 0 && this.previouslyFocusedItem !== this.focusedItem) {
      this.viewItems[this.previouslyFocusedItem]?.blur();
    }
    const actionViewItem = this.focusedItem !== void 0 ? this.viewItems[this.focusedItem] : void 0;
    if (actionViewItem) {
      let focusItem = true;
      if (!types.isFunction(actionViewItem.focus)) {
        focusItem = false;
      }
      if (this.options.focusOnlyEnabledItems && types.isFunction(actionViewItem.isEnabled) && !actionViewItem.isEnabled()) {
        focusItem = false;
      }
      if (actionViewItem.action.id === Separator.ID) {
        focusItem = false;
      }
      if (!focusItem) {
        this.actionsList.focus({ preventScroll });
        this.previouslyFocusedItem = void 0;
      } else if (forceFocus || this.previouslyFocusedItem !== this.focusedItem) {
        actionViewItem.focus(fromRight);
        this.previouslyFocusedItem = this.focusedItem;
      }
      if (focusItem) {
        actionViewItem.showHover?.();
      }
    }
  }
  doTrigger(event) {
    if (typeof this.focusedItem === "undefined") {
      return;
    }
    const actionViewItem = this.viewItems[this.focusedItem];
    if (actionViewItem instanceof BaseActionViewItem) {
      const context = actionViewItem._context === null || actionViewItem._context === void 0 ? event : actionViewItem._context;
      this.run(actionViewItem._action, context);
    }
  }
  async run(action, context) {
    await this._actionRunner.run(action, context);
  }
  dispose() {
    this._context = void 0;
    this._viewItems = dispose(this._viewItems);
    this.getContainer().remove();
    super.dispose();
  }
}
function prepareActions(actions) {
  if (!actions.length) {
    return actions;
  }
  let firstIndexOfAction = -1;
  for (let i = 0; i < actions.length; i++) {
    if (actions[i].id === Separator.ID) {
      continue;
    }
    firstIndexOfAction = i;
    break;
  }
  if (firstIndexOfAction === -1) {
    return [];
  }
  actions = actions.slice(firstIndexOfAction);
  for (let h = actions.length - 1; h >= 0; h--) {
    const isSeparator = actions[h].id === Separator.ID;
    if (isSeparator) {
      actions.splice(h, 1);
    } else {
      break;
    }
  }
  let foundAction = false;
  for (let k = actions.length - 1; k >= 0; k--) {
    const isSeparator = actions[k].id === Separator.ID;
    if (isSeparator && !foundAction) {
      actions.splice(k, 1);
    } else if (!isSeparator) {
      foundAction = true;
    } else if (isSeparator) {
      foundAction = false;
    }
  }
  return actions;
}
export {
  ActionBar,
  ActionsOrientation,
  prepareActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFx1aVxcYWN0aW9uYmFyXFxhY3Rpb25iYXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgQWN0aW9uVmlld0l0ZW0sIEJhc2VBY3Rpb25WaWV3SXRlbSwgSUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4vYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IGNyZWF0ZUluc3RhbnRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSUhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi9ob3Zlci9ob3ZlckRlbGVnYXRlLmpzJztcbmltcG9ydCB7IEFjdGlvblJ1bm5lciwgSUFjdGlvbiwgSUFjdGlvblJ1bm5lciwgSVJ1bkV2ZW50LCBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIGRpc3Bvc2UsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgKiBhcyB0eXBlcyBmcm9tICcuLi8uLi8uLi9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0ICcuL2FjdGlvbmJhci5jc3MnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElBY3Rpb25WaWV3SXRlbSBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0YWN0aW9uOiBJQWN0aW9uO1xuXHRhY3Rpb25SdW5uZXI6IElBY3Rpb25SdW5uZXI7XG5cdHNldEFjdGlvbkNvbnRleHQoY29udGV4dDogdW5rbm93bik6IHZvaWQ7XG5cdHJlbmRlcihlbGVtZW50OiBIVE1MRWxlbWVudCk6IHZvaWQ7XG5cdGlzRW5hYmxlZCgpOiBib29sZWFuO1xuXHRmb2N1cyhmcm9tUmlnaHQ/OiBib29sZWFuKTogdm9pZDsgLy8gVE9ET0Bpc2lkb3JuIHdoYXQgaXMgdGhpcz9cblx0Ymx1cigpOiB2b2lkO1xuXHRzaG93SG92ZXI/KCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFjdGlvblZpZXdJdGVtUHJvdmlkZXIge1xuXHQoYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zKTogSUFjdGlvblZpZXdJdGVtIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBBY3Rpb25zT3JpZW50YXRpb24ge1xuXHRIT1JJWk9OVEFMLFxuXHRWRVJUSUNBTCxcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBY3Rpb25UcmlnZ2VyIHtcblx0a2V5cz86IEtleUNvZGVbXTtcblx0a2V5RG93bjogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWN0aW9uQmFyT3B0aW9ucyB7XG5cdHJlYWRvbmx5IG9yaWVudGF0aW9uPzogQWN0aW9uc09yaWVudGF0aW9uO1xuXHRyZWFkb25seSBjb250ZXh0PzogdW5rbm93bjtcblx0cmVhZG9ubHkgYWN0aW9uVmlld0l0ZW1Qcm92aWRlcj86IElBY3Rpb25WaWV3SXRlbVByb3ZpZGVyO1xuXHRyZWFkb25seSBhY3Rpb25SdW5uZXI/OiBJQWN0aW9uUnVubmVyO1xuXHRyZWFkb25seSBhcmlhTGFiZWw/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFyaWFSb2xlPzogc3RyaW5nO1xuXHRyZWFkb25seSB0cmlnZ2VyS2V5cz86IEFjdGlvblRyaWdnZXI7XG5cdHJlYWRvbmx5IGFsbG93Q29udGV4dE1lbnU/OiBib29sZWFuO1xuXHRyZWFkb25seSBwcmV2ZW50TG9vcE5hdmlnYXRpb24/OiBib29sZWFuO1xuXHRyZWFkb25seSBmb2N1c09ubHlFbmFibGVkSXRlbXM/OiBib29sZWFuO1xuXHRyZWFkb25seSBob3ZlckRlbGVnYXRlPzogSUhvdmVyRGVsZWdhdGU7XG5cdC8qKlxuXHQgKiBJZiB0cnVlLCB0b2dnbGVkIHByaW1hcnkgaXRlbXMgYXJlIGhpZ2hsaWdodGVkIHdpdGggYSBiYWNrZ3JvdW5kIGNvbG9yLlxuXHQgKiBTb21lIGFjdGlvbiBiYXJzIGV4Y2x1c2l2ZWx5IHVzZSBpY29uIHN0YXRlcywgd2UgZG9uJ3Qgd2FudCB0byBlbmFibGUgdGhpcyBmb3IgdGhlbS5cblx0ICogVGh1cywgdGhpcyBpcyBvcHQtaW4uXG5cdCAqL1xuXHRyZWFkb25seSBoaWdobGlnaHRUb2dnbGVkSXRlbXM/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBY3Rpb25PcHRpb25zIGV4dGVuZHMgSUFjdGlvblZpZXdJdGVtT3B0aW9ucyB7XG5cdGluZGV4PzogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgQWN0aW9uQmFyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBY3Rpb25SdW5uZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczogSUFjdGlvbkJhck9wdGlvbnM7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyRGVsZWdhdGU6IElIb3ZlckRlbGVnYXRlO1xuXG5cdHByaXZhdGUgX2FjdGlvblJ1bm5lcjogSUFjdGlvblJ1bm5lcjtcblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aW9uUnVubmVyRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIF9jb250ZXh0OiB1bmtub3duO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vcmllbnRhdGlvbjogQWN0aW9uc09yaWVudGF0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90cmlnZ2VyS2V5czoge1xuXHRcdGtleXM6IEtleUNvZGVbXTtcblx0XHRrZXlEb3duOiBib29sZWFuO1xuXHR9O1xuXG5cdC8vIFZpZXcgSXRlbXNcblx0cHJpdmF0ZSBfdmlld0l0ZW1zOiBJQWN0aW9uVmlld0l0ZW1bXTtcblx0Z2V0IHZpZXdJdGVtcygpOiByZWFkb25seSBJQWN0aW9uVmlld0l0ZW1bXSB7IHJldHVybiB0aGlzLl92aWV3SXRlbXM7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IHZpZXdJdGVtRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxJQWN0aW9uVmlld0l0ZW0+KCkpO1xuXHRwcml2YXRlIHByZXZpb3VzbHlGb2N1c2VkSXRlbT86IG51bWJlcjtcblx0cHJvdGVjdGVkIGZvY3VzZWRJdGVtPzogbnVtYmVyO1xuXHRwcml2YXRlIGZvY3VzVHJhY2tlcjogRE9NLklGb2N1c1RyYWNrZXI7XG5cblx0Ly8gVHJpZ2dlciBLZXkgVHJhY2tpbmdcblx0cHJpdmF0ZSB0cmlnZ2VyS2V5RG93bjogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHByaXZhdGUgZm9jdXNhYmxlOiBib29sZWFuID0gdHJ1ZTtcblxuXHQvLyBFbGVtZW50c1xuXHRyZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IGFjdGlvbnNMaXN0OiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEJsdXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0Z2V0IG9uRGlkQmx1cigpIHsgcmV0dXJuIHRoaXMuX29uRGlkQmx1ci5ldmVudDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2FuY2VsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oeyBvbldpbGxBZGRGaXJzdExpc3RlbmVyOiAoKSA9PiB0aGlzLmNhbmNlbEhhc0xpc3RlbmVyID0gdHJ1ZSB9KSk7XG5cdGdldCBvbkRpZENhbmNlbCgpIHsgcmV0dXJuIHRoaXMuX29uRGlkQ2FuY2VsLmV2ZW50OyB9XG5cdHByaXZhdGUgY2FuY2VsSGFzTGlzdGVuZXIgPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJ1biA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElSdW5FdmVudD4oKSk7XG5cdGdldCBvbkRpZFJ1bigpIHsgcmV0dXJuIHRoaXMuX29uRGlkUnVuLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsUnVuID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVJ1bkV2ZW50PigpKTtcblx0Z2V0IG9uV2lsbFJ1bigpIHsgcmV0dXJuIHRoaXMuX29uV2lsbFJ1bi5ldmVudDsgfVxuXG5cdGNvbnN0cnVjdG9yKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIG9wdGlvbnM6IElBY3Rpb25CYXJPcHRpb25zID0ge30pIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5vcHRpb25zID0gb3B0aW9ucztcblx0XHR0aGlzLl9jb250ZXh0ID0gb3B0aW9ucy5jb250ZXh0ID8/IG51bGw7XG5cdFx0dGhpcy5fb3JpZW50YXRpb24gPSB0aGlzLm9wdGlvbnMub3JpZW50YXRpb24gPz8gQWN0aW9uc09yaWVudGF0aW9uLkhPUklaT05UQUw7XG5cdFx0dGhpcy5fdHJpZ2dlcktleXMgPSB7XG5cdFx0XHRrZXlEb3duOiB0aGlzLm9wdGlvbnMudHJpZ2dlcktleXM/LmtleURvd24gPz8gZmFsc2UsXG5cdFx0XHRrZXlzOiB0aGlzLm9wdGlvbnMudHJpZ2dlcktleXM/LmtleXMgPz8gW0tleUNvZGUuRW50ZXIsIEtleUNvZGUuU3BhY2VdXG5cdFx0fTtcblxuXHRcdHRoaXMuX2hvdmVyRGVsZWdhdGUgPSBvcHRpb25zLmhvdmVyRGVsZWdhdGUgPz8gdGhpcy5fcmVnaXN0ZXIoY3JlYXRlSW5zdGFudEhvdmVyRGVsZWdhdGUoKSk7XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLmFjdGlvblJ1bm5lcikge1xuXHRcdFx0dGhpcy5fYWN0aW9uUnVubmVyID0gdGhpcy5vcHRpb25zLmFjdGlvblJ1bm5lcjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fYWN0aW9uUnVubmVyID0gbmV3IEFjdGlvblJ1bm5lcigpO1xuXHRcdFx0dGhpcy5fYWN0aW9uUnVubmVyRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2FjdGlvblJ1bm5lcik7XG5cdFx0fVxuXG5cdFx0dGhpcy5fYWN0aW9uUnVubmVyRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2FjdGlvblJ1bm5lci5vbkRpZFJ1bihlID0+IHRoaXMuX29uRGlkUnVuLmZpcmUoZSkpKTtcblx0XHR0aGlzLl9hY3Rpb25SdW5uZXJEaXNwb3NhYmxlcy5hZGQodGhpcy5fYWN0aW9uUnVubmVyLm9uV2lsbFJ1bihlID0+IHRoaXMuX29uV2lsbFJ1bi5maXJlKGUpKSk7XG5cblx0XHR0aGlzLl92aWV3SXRlbXMgPSBbXTtcblx0XHR0aGlzLmZvY3VzZWRJdGVtID0gdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5kb21Ob2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTmFtZSA9ICdtb25hY28tYWN0aW9uLWJhcic7XG5cblx0XHRsZXQgcHJldmlvdXNLZXlzOiBLZXlDb2RlW107XG5cdFx0bGV0IG5leHRLZXlzOiBLZXlDb2RlW107XG5cblx0XHRzd2l0Y2ggKHRoaXMuX29yaWVudGF0aW9uKSB7XG5cdFx0XHRjYXNlIEFjdGlvbnNPcmllbnRhdGlvbi5IT1JJWk9OVEFMOlxuXHRcdFx0XHRwcmV2aW91c0tleXMgPSBbS2V5Q29kZS5MZWZ0QXJyb3ddO1xuXHRcdFx0XHRuZXh0S2V5cyA9IFtLZXlDb2RlLlJpZ2h0QXJyb3ddO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQWN0aW9uc09yaWVudGF0aW9uLlZFUlRJQ0FMOlxuXHRcdFx0XHRwcmV2aW91c0tleXMgPSBbS2V5Q29kZS5VcEFycm93XTtcblx0XHRcdFx0bmV4dEtleXMgPSBbS2V5Q29kZS5Eb3duQXJyb3ddO1xuXHRcdFx0XHR0aGlzLmRvbU5vZGUuY2xhc3NOYW1lICs9ICcgdmVydGljYWwnO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZG9tTm9kZSwgRE9NLkV2ZW50VHlwZS5LRVlfRE9XTiwgZSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRsZXQgZXZlbnRIYW5kbGVkID0gdHJ1ZTtcblx0XHRcdGNvbnN0IGZvY3VzZWRJdGVtID0gdHlwZW9mIHRoaXMuZm9jdXNlZEl0ZW0gPT09ICdudW1iZXInID8gdGhpcy52aWV3SXRlbXNbdGhpcy5mb2N1c2VkSXRlbV0gOiB1bmRlZmluZWQ7XG5cblx0XHRcdGlmIChwcmV2aW91c0tleXMgJiYgKGV2ZW50LmVxdWFscyhwcmV2aW91c0tleXNbMF0pIHx8IGV2ZW50LmVxdWFscyhwcmV2aW91c0tleXNbMV0pKSkge1xuXHRcdFx0XHRldmVudEhhbmRsZWQgPSB0aGlzLmZvY3VzUHJldmlvdXMoKTtcblx0XHRcdH0gZWxzZSBpZiAobmV4dEtleXMgJiYgKGV2ZW50LmVxdWFscyhuZXh0S2V5c1swXSkgfHwgZXZlbnQuZXF1YWxzKG5leHRLZXlzWzFdKSkpIHtcblx0XHRcdFx0ZXZlbnRIYW5kbGVkID0gdGhpcy5mb2N1c05leHQoKTtcblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQuZXF1YWxzKEtleUNvZGUuRXNjYXBlKSAmJiB0aGlzLmNhbmNlbEhhc0xpc3RlbmVyKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2FuY2VsLmZpcmUoKTtcblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQuZXF1YWxzKEtleUNvZGUuSG9tZSkpIHtcblx0XHRcdFx0ZXZlbnRIYW5kbGVkID0gdGhpcy5mb2N1c0ZpcnN0KCk7XG5cdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkVuZCkpIHtcblx0XHRcdFx0ZXZlbnRIYW5kbGVkID0gdGhpcy5mb2N1c0xhc3QoKTtcblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQuZXF1YWxzKEtleUNvZGUuVGFiKSAmJiBmb2N1c2VkSXRlbSBpbnN0YW5jZW9mIEJhc2VBY3Rpb25WaWV3SXRlbSAmJiBmb2N1c2VkSXRlbS50cmFwc0Fycm93TmF2aWdhdGlvbikge1xuXHRcdFx0XHQvLyBUYWIsIHNvIGZvcmNpYmx5IGZvY3VzIG5leHQgIzIxOTE5OVxuXHRcdFx0XHRldmVudEhhbmRsZWQgPSB0aGlzLmZvY3VzTmV4dCh1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLmlzVHJpZ2dlcktleUV2ZW50KGV2ZW50KSkge1xuXHRcdFx0XHQvLyBTdGF5aW5nIG91dCBvZiB0aGUgZWxzZSBicmFuY2ggZXZlbiBpZiBub3QgdHJpZ2dlcmVkXG5cdFx0XHRcdGlmICh0aGlzLl90cmlnZ2VyS2V5cy5rZXlEb3duKSB7XG5cdFx0XHRcdFx0dGhpcy5kb1RyaWdnZXIoZXZlbnQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMudHJpZ2dlcktleURvd24gPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRldmVudEhhbmRsZWQgPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGV2ZW50SGFuZGxlZCkge1xuXHRcdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZG9tTm9kZSwgRE9NLkV2ZW50VHlwZS5LRVlfVVAsIGUgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXG5cdFx0XHQvLyBSdW4gYWN0aW9uIG9uIEVudGVyL1NwYWNlXG5cdFx0XHRpZiAodGhpcy5pc1RyaWdnZXJLZXlFdmVudChldmVudCkpIHtcblx0XHRcdFx0aWYgKCF0aGlzLl90cmlnZ2VyS2V5cy5rZXlEb3duICYmIHRoaXMudHJpZ2dlcktleURvd24pIHtcblx0XHRcdFx0XHR0aGlzLnRyaWdnZXJLZXlEb3duID0gZmFsc2U7XG5cdFx0XHRcdFx0dGhpcy5kb1RyaWdnZXIoZXZlbnQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlY29tcHV0ZSBmb2N1c2VkIGl0ZW1cblx0XHRcdGVsc2UgaWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLlRhYikgfHwgZXZlbnQuZXF1YWxzKEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVGFiKSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5VcEFycm93KSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5Eb3duQXJyb3cpIHx8IGV2ZW50LmVxdWFscyhLZXlDb2RlLkxlZnRBcnJvdykgfHwgZXZlbnQuZXF1YWxzKEtleUNvZGUuUmlnaHRBcnJvdykpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVGb2N1c2VkSXRlbSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuZm9jdXNUcmFja2VyID0gdGhpcy5fcmVnaXN0ZXIoRE9NLnRyYWNrRm9jdXModGhpcy5kb21Ob2RlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5mb2N1c1RyYWNrZXIub25EaWRCbHVyKCgpID0+IHtcblx0XHRcdGlmIChET00uZ2V0QWN0aXZlRWxlbWVudCgpID09PSB0aGlzLmRvbU5vZGUgfHwgIURPTS5pc0FuY2VzdG9yKERPTS5nZXRBY3RpdmVFbGVtZW50KCksIHRoaXMuZG9tTm9kZSkpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRCbHVyLmZpcmUoKTtcblx0XHRcdFx0dGhpcy5wcmV2aW91c2x5Rm9jdXNlZEl0ZW0gPSB0aGlzLmZvY3VzZWRJdGVtO1xuXHRcdFx0XHR0aGlzLmZvY3VzZWRJdGVtID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLnRyaWdnZXJLZXlEb3duID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5mb2N1c1RyYWNrZXIub25EaWRGb2N1cygoKSA9PiB0aGlzLnVwZGF0ZUZvY3VzZWRJdGVtKCkpKTtcblxuXHRcdHRoaXMuYWN0aW9uc0xpc3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd1bCcpO1xuXHRcdHRoaXMuYWN0aW9uc0xpc3QuY2xhc3NOYW1lID0gJ2FjdGlvbnMtY29udGFpbmVyJztcblx0XHRpZiAodGhpcy5vcHRpb25zLmhpZ2hsaWdodFRvZ2dsZWRJdGVtcykge1xuXHRcdFx0dGhpcy5hY3Rpb25zTGlzdC5jbGFzc0xpc3QuYWRkKCdoaWdobGlnaHQtdG9nZ2xlZCcpO1xuXHRcdH1cblx0XHR0aGlzLmFjdGlvbnNMaXN0LnNldEF0dHJpYnV0ZSgncm9sZScsIHRoaXMub3B0aW9ucy5hcmlhUm9sZSB8fCAndG9vbGJhcicpO1xuXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5hcmlhTGFiZWwpIHtcblx0XHRcdHRoaXMuYWN0aW9uc0xpc3Quc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGhpcy5vcHRpb25zLmFyaWFMYWJlbCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuYWN0aW9uc0xpc3QpO1xuXG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuZG9tTm9kZSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZnJlc2hSb2xlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmxlbmd0aCgpID49IDEpIHtcblx0XHRcdHRoaXMuYWN0aW9uc0xpc3Quc2V0QXR0cmlidXRlKCdyb2xlJywgdGhpcy5vcHRpb25zLmFyaWFSb2xlIHx8ICd0b29sYmFyJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuYWN0aW9uc0xpc3Quc2V0QXR0cmlidXRlKCdyb2xlJywgJ3ByZXNlbnRhdGlvbicpO1xuXHRcdH1cblx0fVxuXG5cdHNldEFyaWFMYWJlbChsYWJlbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKGxhYmVsKSB7XG5cdFx0XHR0aGlzLmFjdGlvbnNMaXN0LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxhYmVsKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5hY3Rpb25zTGlzdC5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKTtcblx0XHR9XG5cdH1cblxuXHQvLyBTb21lIGFjdGlvbiBiYXJzIHNob3VsZCBub3QgYmUgZm9jdXNhYmxlIGF0IHRpbWVzXG5cdC8vIFdoZW4gYW4gYWN0aW9uIGJhciBpcyBub3QgZm9jdXNhYmxlIG1ha2Ugc3VyZSB0byBtYWtlIGFsbCB0aGUgZWxlbWVudHMgaW5zaWRlIGl0IG5vdCBmb2N1c2FibGVcblx0Ly8gV2hlbiBhbiBhY3Rpb24gYmFyIGlzIGZvY3VzYWJsZSBhZ2FpbiwgbWFrZSBzdXJlIHRoZSBmaXJzdCBpdGVtIGNhbiBiZSBmb2N1c2VkXG5cdHNldEZvY3VzYWJsZShmb2N1c2FibGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmZvY3VzYWJsZSA9IGZvY3VzYWJsZTtcblx0XHRpZiAodGhpcy5mb2N1c2FibGUpIHtcblx0XHRcdGNvbnN0IGZpcnN0RW5hYmxlZCA9IHRoaXMudmlld0l0ZW1zLmZpbmQodmkgPT4gdmkgaW5zdGFuY2VvZiBCYXNlQWN0aW9uVmlld0l0ZW0gJiYgdmkuaXNFbmFibGVkKCkpO1xuXHRcdFx0aWYgKGZpcnN0RW5hYmxlZCBpbnN0YW5jZW9mIEJhc2VBY3Rpb25WaWV3SXRlbSkge1xuXHRcdFx0XHRmaXJzdEVuYWJsZWQuc2V0Rm9jdXNhYmxlKHRydWUpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnZpZXdJdGVtcy5mb3JFYWNoKHZpID0+IHtcblx0XHRcdFx0aWYgKHZpIGluc3RhbmNlb2YgQmFzZUFjdGlvblZpZXdJdGVtKSB7XG5cdFx0XHRcdFx0dmkuc2V0Rm9jdXNhYmxlKGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBpc1RyaWdnZXJLZXlFdmVudChldmVudDogU3RhbmRhcmRLZXlib2FyZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0bGV0IHJldCA9IGZhbHNlO1xuXHRcdHRoaXMuX3RyaWdnZXJLZXlzLmtleXMuZm9yRWFjaChrZXlDb2RlID0+IHtcblx0XHRcdHJldCA9IHJldCB8fCBldmVudC5lcXVhbHMoa2V5Q29kZSk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcmV0O1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVGb2N1c2VkSXRlbSgpOiB2b2lkIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuYWN0aW9uc0xpc3QuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGVsZW0gPSB0aGlzLmFjdGlvbnNMaXN0LmNoaWxkcmVuW2ldO1xuXHRcdFx0aWYgKERPTS5pc0FuY2VzdG9yKERPTS5nZXRBY3RpdmVFbGVtZW50KCksIGVsZW0pKSB7XG5cdFx0XHRcdHRoaXMuZm9jdXNlZEl0ZW0gPSBpO1xuXHRcdFx0XHR0aGlzLnZpZXdJdGVtc1t0aGlzLmZvY3VzZWRJdGVtXT8uc2hvd0hvdmVyPy4oKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGNvbnRleHQoKTogdW5rbm93biB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRleHQ7XG5cdH1cblxuXHRzZXQgY29udGV4dChjb250ZXh0OiB1bmtub3duKSB7XG5cdFx0dGhpcy5fY29udGV4dCA9IGNvbnRleHQ7XG5cdFx0dGhpcy52aWV3SXRlbXMuZm9yRWFjaChpID0+IGkuc2V0QWN0aW9uQ29udGV4dChjb250ZXh0KSk7XG5cdH1cblxuXHRnZXQgYWN0aW9uUnVubmVyKCk6IElBY3Rpb25SdW5uZXIge1xuXHRcdHJldHVybiB0aGlzLl9hY3Rpb25SdW5uZXI7XG5cdH1cblxuXHRzZXQgYWN0aW9uUnVubmVyKGFjdGlvblJ1bm5lcjogSUFjdGlvblJ1bm5lcikge1xuXHRcdHRoaXMuX2FjdGlvblJ1bm5lciA9IGFjdGlvblJ1bm5lcjtcblxuXHRcdC8vIHdoZW4gc2V0dGluZyBhIG5ldyBgSUFjdGlvblJ1bm5lcmAgbWFrZSBzdXJlIHRvIGRpc3Bvc2Ugb2xkIGxpc3RlbmVycyBhbmRcblx0XHQvLyBzdGFydCB0byBmb3J3YXJkIGV2ZW50cyBmcm9tIHRoZSBuZXcgbGlzdGVuZXJcblx0XHR0aGlzLl9hY3Rpb25SdW5uZXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuX2FjdGlvblJ1bm5lckRpc3Bvc2FibGVzLmFkZCh0aGlzLl9hY3Rpb25SdW5uZXIub25EaWRSdW4oZSA9PiB0aGlzLl9vbkRpZFJ1bi5maXJlKGUpKSk7XG5cdFx0dGhpcy5fYWN0aW9uUnVubmVyRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2FjdGlvblJ1bm5lci5vbldpbGxSdW4oZSA9PiB0aGlzLl9vbldpbGxSdW4uZmlyZShlKSkpO1xuXHRcdHRoaXMudmlld0l0ZW1zLmZvckVhY2goaXRlbSA9PiBpdGVtLmFjdGlvblJ1bm5lciA9IGFjdGlvblJ1bm5lcik7XG5cdH1cblxuXHRnZXRDb250YWluZXIoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLmRvbU5vZGU7XG5cdH1cblxuXHRoYXNBY3Rpb24oYWN0aW9uOiBJQWN0aW9uKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMudmlld0l0ZW1zLmZpbmRJbmRleChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLmFjdGlvbi5pZCA9PT0gYWN0aW9uLmlkKSAhPT0gLTE7XG5cdH1cblxuXHRnZXRBY3Rpb24oaW5kZXhPckVsZW1lbnQ6IG51bWJlciB8IEhUTUxFbGVtZW50KTogSUFjdGlvbiB8IHVuZGVmaW5lZCB7XG5cblx0XHQvLyBieSBpbmRleFxuXHRcdGlmICh0eXBlb2YgaW5kZXhPckVsZW1lbnQgPT09ICdudW1iZXInKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy52aWV3SXRlbXNbaW5kZXhPckVsZW1lbnRdPy5hY3Rpb247XG5cdFx0fVxuXG5cdFx0Ly8gYnkgZWxlbWVudFxuXHRcdGlmIChET00uaXNIVE1MRWxlbWVudChpbmRleE9yRWxlbWVudCkpIHtcblx0XHRcdHdoaWxlIChpbmRleE9yRWxlbWVudC5wYXJlbnRFbGVtZW50ICE9PSB0aGlzLmFjdGlvbnNMaXN0KSB7XG5cdFx0XHRcdGlmICghaW5kZXhPckVsZW1lbnQucGFyZW50RWxlbWVudCkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0aW5kZXhPckVsZW1lbnQgPSBpbmRleE9yRWxlbWVudC5wYXJlbnRFbGVtZW50O1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmFjdGlvbnNMaXN0LmNoaWxkTm9kZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aWYgKHRoaXMuYWN0aW9uc0xpc3QuY2hpbGROb2Rlc1tpXSA9PT0gaW5kZXhPckVsZW1lbnQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy52aWV3SXRlbXNbaV0uYWN0aW9uO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1c2goYXJnOiBJQWN0aW9uIHwgUmVhZG9ubHlBcnJheTxJQWN0aW9uPiwgb3B0aW9uczogSUFjdGlvbk9wdGlvbnMgPSB7fSk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGlvbnM6IFJlYWRvbmx5QXJyYXk8SUFjdGlvbj4gPSBBcnJheS5pc0FycmF5KGFyZykgPyBhcmcgOiBbYXJnXTtcblxuXHRcdGxldCBpbmRleCA9IHR5cGVzLmlzTnVtYmVyKG9wdGlvbnMuaW5kZXgpID8gb3B0aW9ucy5pbmRleCA6IG51bGw7XG5cblx0XHRhY3Rpb25zLmZvckVhY2goKGFjdGlvbjogSUFjdGlvbikgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aW9uVmlld0l0ZW1FbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGknKTtcblx0XHRcdGFjdGlvblZpZXdJdGVtRWxlbWVudC5jbGFzc05hbWUgPSAnYWN0aW9uLWl0ZW0nO1xuXHRcdFx0YWN0aW9uVmlld0l0ZW1FbGVtZW50LnNldEF0dHJpYnV0ZSgncm9sZScsICdwcmVzZW50YXRpb24nKTtcblxuXHRcdFx0bGV0IGl0ZW06IElBY3Rpb25WaWV3SXRlbSB8IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3Qgdmlld0l0ZW1PcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zID0geyBob3ZlckRlbGVnYXRlOiB0aGlzLl9ob3ZlckRlbGVnYXRlLCAuLi5vcHRpb25zLCBpc1RhYkxpc3Q6IHRoaXMub3B0aW9ucy5hcmlhUm9sZSA9PT0gJ3RhYmxpc3QnIH07XG5cdFx0XHRpZiAodGhpcy5vcHRpb25zLmFjdGlvblZpZXdJdGVtUHJvdmlkZXIpIHtcblx0XHRcdFx0aXRlbSA9IHRoaXMub3B0aW9ucy5hY3Rpb25WaWV3SXRlbVByb3ZpZGVyKGFjdGlvbiwgdmlld0l0ZW1PcHRpb25zKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHRcdGl0ZW0gPSBuZXcgQWN0aW9uVmlld0l0ZW0odGhpcy5jb250ZXh0LCBhY3Rpb24sIHZpZXdJdGVtT3B0aW9ucyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFByZXZlbnQgbmF0aXZlIGNvbnRleHQgbWVudSBvbiBhY3Rpb25zXG5cdFx0XHRpZiAoIXRoaXMub3B0aW9ucy5hbGxvd0NvbnRleHRNZW51KSB7XG5cdFx0XHRcdHRoaXMudmlld0l0ZW1EaXNwb3NhYmxlcy5zZXQoaXRlbSwgRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihhY3Rpb25WaWV3SXRlbUVsZW1lbnQsIERPTS5FdmVudFR5cGUuQ09OVEVYVF9NRU5VLCAoZTogRE9NLkV2ZW50TGlrZSkgPT4ge1xuXHRcdFx0XHRcdERPTS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cblx0XHRcdGl0ZW0uYWN0aW9uUnVubmVyID0gdGhpcy5fYWN0aW9uUnVubmVyO1xuXHRcdFx0aXRlbS5zZXRBY3Rpb25Db250ZXh0KHRoaXMuY29udGV4dCk7XG5cdFx0XHRpdGVtLnJlbmRlcihhY3Rpb25WaWV3SXRlbUVsZW1lbnQpO1xuXG5cdFx0XHRpZiAoaW5kZXggPT09IG51bGwgfHwgaW5kZXggPCAwIHx8IGluZGV4ID49IHRoaXMuYWN0aW9uc0xpc3QuY2hpbGRyZW4ubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuYWN0aW9uc0xpc3QuYXBwZW5kQ2hpbGQoYWN0aW9uVmlld0l0ZW1FbGVtZW50KTtcblx0XHRcdFx0dGhpcy5fdmlld0l0ZW1zLnB1c2goaXRlbSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmFjdGlvbnNMaXN0Lmluc2VydEJlZm9yZShhY3Rpb25WaWV3SXRlbUVsZW1lbnQsIHRoaXMuYWN0aW9uc0xpc3QuY2hpbGRyZW5baW5kZXhdKTtcblx0XHRcdFx0dGhpcy5fdmlld0l0ZW1zLnNwbGljZShpbmRleCwgMCwgaXRlbSk7XG5cdFx0XHRcdGluZGV4Kys7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBXZSBuZWVkIHRvIGFsbG93IGZvciB0aGUgZmlyc3QgZW5hYmxlZCBpdGVtIHRvIGJlIGZvY3VzZWQgb24gdXNpbmcgdGFiIG5hdmlnYXRpb24gIzEwNjQ0MVxuXHRcdGlmICh0aGlzLmZvY3VzYWJsZSkge1xuXHRcdFx0bGV0IGRpZEZvY3VzID0gZmFsc2U7XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdGhpcy52aWV3SXRlbXMpIHtcblx0XHRcdFx0aWYgKCEoaXRlbSBpbnN0YW5jZW9mIEJhc2VBY3Rpb25WaWV3SXRlbSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBmb2N1czogYm9vbGVhbjtcblx0XHRcdFx0aWYgKGRpZEZvY3VzKSB7XG5cdFx0XHRcdFx0Zm9jdXMgPSBmYWxzZTsgLy8gYWxyZWFkeSBmb2N1c2VkIGFuIGl0ZW1cblx0XHRcdFx0fSBlbHNlIGlmIChpdGVtLmFjdGlvbi5pZCA9PT0gU2VwYXJhdG9yLklEKSB7XG5cdFx0XHRcdFx0Zm9jdXMgPSBmYWxzZTsgLy8gbmV2ZXIgZm9jdXMgYSBzZXBhcmF0b3Jcblx0XHRcdFx0fSBlbHNlIGlmICghaXRlbS5pc0VuYWJsZWQoKSAmJiB0aGlzLm9wdGlvbnMuZm9jdXNPbmx5RW5hYmxlZEl0ZW1zKSB7XG5cdFx0XHRcdFx0Zm9jdXMgPSBmYWxzZTsgLy8gbmV2ZXIgZm9jdXMgYSBkaXNhYmxlZCBpdGVtXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Zm9jdXMgPSB0cnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGZvY3VzKSB7XG5cdFx0XHRcdFx0aXRlbS5zZXRGb2N1c2FibGUodHJ1ZSk7XG5cdFx0XHRcdFx0ZGlkRm9jdXMgPSB0cnVlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGl0ZW0uc2V0Rm9jdXNhYmxlKGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgdGhpcy5mb2N1c2VkSXRlbSA9PT0gJ251bWJlcicpIHtcblx0XHRcdC8vIEFmdGVyIGEgY2xlYXIgYWN0aW9ucyBtaWdodCBiZSByZS1hZGRlZCB0byBzaW1wbHkgdG9nZ2xlIHNvbWUgYWN0aW9ucy4gV2Ugc2hvdWxkIHByZXNlcnZlIGZvY3VzICM5NzEyOFxuXHRcdFx0dGhpcy5mb2N1cyh0aGlzLmZvY3VzZWRJdGVtKTtcblx0XHR9XG5cdFx0dGhpcy5yZWZyZXNoUm9sZSgpO1xuXHR9XG5cblx0Z2V0V2lkdGgoaW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuYWN0aW9uc0xpc3QuY2hpbGRyZW4uaXRlbShpbmRleCk/LmNsaWVudFdpZHRoID8/IDA7XG5cdH1cblxuXHRnZXRIZWlnaHQoaW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuYWN0aW9uc0xpc3QuY2hpbGRyZW4uaXRlbShpbmRleCk/LmNsaWVudEhlaWdodCA/PyAwO1xuXHR9XG5cblx0cHVsbChpbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKGluZGV4ID49IDAgJiYgaW5kZXggPCB0aGlzLnZpZXdJdGVtcy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuYWN0aW9uc0xpc3QuY2hpbGROb2Rlc1tpbmRleF0ucmVtb3ZlKCk7XG5cdFx0XHR0aGlzLnZpZXdJdGVtRGlzcG9zYWJsZXMuZGVsZXRlQW5kRGlzcG9zZSh0aGlzLnZpZXdJdGVtc1tpbmRleF0pO1xuXHRcdFx0ZGlzcG9zZSh0aGlzLl92aWV3SXRlbXMuc3BsaWNlKGluZGV4LCAxKSk7XG5cdFx0XHR0aGlzLnJlZnJlc2hSb2xlKCk7XG5cdFx0fVxuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNFbXB0eSgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fdmlld0l0ZW1zID0gZGlzcG9zZSh0aGlzLl92aWV3SXRlbXMpO1xuXHRcdHRoaXMudmlld0l0ZW1EaXNwb3NhYmxlcy5jbGVhckFuZERpc3Bvc2VBbGwoKTtcblx0XHRET00uY2xlYXJOb2RlKHRoaXMuYWN0aW9uc0xpc3QpO1xuXHRcdHRoaXMucmVmcmVzaFJvbGUoKTtcblx0fVxuXG5cdGxlbmd0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnZpZXdJdGVtcy5sZW5ndGg7XG5cdH1cblxuXHRpc0VtcHR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnZpZXdJdGVtcy5sZW5ndGggPT09IDA7XG5cdH1cblxuXHRpc0ZvY3VzZWQoaW5kZXg/OiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaW5kZXggPT09IHVuZGVmaW5lZFxuXHRcdFx0PyBET00uaXNBbmNlc3RvcihET00uZ2V0QWN0aXZlRWxlbWVudCgpLCB0aGlzLmRvbU5vZGUpXG5cdFx0XHQ6IERPTS5pc0FuY2VzdG9yKERPTS5nZXRBY3RpdmVFbGVtZW50KCksIHRoaXMuYWN0aW9uc0xpc3QuY2hpbGRyZW5baW5kZXhdKTtcblx0fVxuXG5cdGZvY3VzKGluZGV4PzogbnVtYmVyKTogdm9pZDtcblx0Zm9jdXMoc2VsZWN0Rmlyc3Q/OiBib29sZWFuKTogdm9pZDtcblx0Zm9jdXMoYXJnPzogbnVtYmVyIHwgYm9vbGVhbik6IHZvaWQge1xuXHRcdGxldCBzZWxlY3RGaXJzdDogYm9vbGVhbiA9IGZhbHNlO1xuXHRcdGxldCBpbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmIChhcmcgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0c2VsZWN0Rmlyc3QgPSB0cnVlO1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIGFyZyA9PT0gJ251bWJlcicpIHtcblx0XHRcdGluZGV4ID0gYXJnO1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIGFyZyA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRzZWxlY3RGaXJzdCA9IGFyZztcblx0XHR9XG5cblx0XHRpZiAoc2VsZWN0Rmlyc3QgJiYgdHlwZW9mIHRoaXMuZm9jdXNlZEl0ZW0gPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRjb25zdCBmaXJzdEVuYWJsZWQgPSB0aGlzLnZpZXdJdGVtcy5maW5kSW5kZXgoaXRlbSA9PiBpdGVtLmlzRW5hYmxlZCgpKTtcblx0XHRcdC8vIEZvY3VzIHRoZSBmaXJzdCBlbmFibGVkIGl0ZW1cblx0XHRcdHRoaXMuZm9jdXNlZEl0ZW0gPSBmaXJzdEVuYWJsZWQgPT09IC0xID8gdW5kZWZpbmVkIDogZmlyc3RFbmFibGVkO1xuXHRcdFx0dGhpcy51cGRhdGVGb2N1cyh1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChpbmRleCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuZm9jdXNlZEl0ZW0gPSBpbmRleDtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy51cGRhdGVGb2N1cyh1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBmb2N1c0ZpcnN0KCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuZm9jdXNlZEl0ZW0gPSB0aGlzLmxlbmd0aCgpIC0gMTtcblx0XHRyZXR1cm4gdGhpcy5mb2N1c05leHQodHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGZvY3VzTGFzdCgpOiBib29sZWFuIHtcblx0XHR0aGlzLmZvY3VzZWRJdGVtID0gMDtcblx0XHRyZXR1cm4gdGhpcy5mb2N1c1ByZXZpb3VzKHRydWUpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGZvY3VzTmV4dChmb3JjZUxvb3A/OiBib29sZWFuLCBmb3JjZUZvY3VzPzogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGlmICh0eXBlb2YgdGhpcy5mb2N1c2VkSXRlbSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHRoaXMuZm9jdXNlZEl0ZW0gPSB0aGlzLnZpZXdJdGVtcy5sZW5ndGggLSAxO1xuXHRcdH0gZWxzZSBpZiAodGhpcy52aWV3SXRlbXMubGVuZ3RoIDw9IDEpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBzdGFydEluZGV4ID0gdGhpcy5mb2N1c2VkSXRlbTtcblx0XHRsZXQgaXRlbTogSUFjdGlvblZpZXdJdGVtO1xuXHRcdGRvIHtcblxuXHRcdFx0aWYgKCFmb3JjZUxvb3AgJiYgdGhpcy5vcHRpb25zLnByZXZlbnRMb29wTmF2aWdhdGlvbiAmJiB0aGlzLmZvY3VzZWRJdGVtICsgMSA+PSB0aGlzLnZpZXdJdGVtcy5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5mb2N1c2VkSXRlbSA9IHN0YXJ0SW5kZXg7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5mb2N1c2VkSXRlbSA9ICh0aGlzLmZvY3VzZWRJdGVtICsgMSkgJSB0aGlzLnZpZXdJdGVtcy5sZW5ndGg7XG5cdFx0XHRpdGVtID0gdGhpcy52aWV3SXRlbXNbdGhpcy5mb2N1c2VkSXRlbV07XG5cdFx0fSB3aGlsZSAodGhpcy5mb2N1c2VkSXRlbSAhPT0gc3RhcnRJbmRleCAmJiAoKHRoaXMub3B0aW9ucy5mb2N1c09ubHlFbmFibGVkSXRlbXMgJiYgIWl0ZW0uaXNFbmFibGVkKCkpIHx8IGl0ZW0uYWN0aW9uLmlkID09PSBTZXBhcmF0b3IuSUQpKTtcblxuXHRcdHRoaXMudXBkYXRlRm9jdXModW5kZWZpbmVkLCB1bmRlZmluZWQsIGZvcmNlRm9jdXMpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIGZvY3VzUHJldmlvdXMoZm9yY2VMb29wPzogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGlmICh0eXBlb2YgdGhpcy5mb2N1c2VkSXRlbSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHRoaXMuZm9jdXNlZEl0ZW0gPSAwO1xuXHRcdH0gZWxzZSBpZiAodGhpcy52aWV3SXRlbXMubGVuZ3RoIDw9IDEpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBzdGFydEluZGV4ID0gdGhpcy5mb2N1c2VkSXRlbTtcblx0XHRsZXQgaXRlbTogSUFjdGlvblZpZXdJdGVtO1xuXG5cdFx0ZG8ge1xuXHRcdFx0dGhpcy5mb2N1c2VkSXRlbSA9IHRoaXMuZm9jdXNlZEl0ZW0gLSAxO1xuXHRcdFx0aWYgKHRoaXMuZm9jdXNlZEl0ZW0gPCAwKSB7XG5cdFx0XHRcdGlmICghZm9yY2VMb29wICYmIHRoaXMub3B0aW9ucy5wcmV2ZW50TG9vcE5hdmlnYXRpb24pIHtcblx0XHRcdFx0XHR0aGlzLmZvY3VzZWRJdGVtID0gc3RhcnRJbmRleDtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLmZvY3VzZWRJdGVtID0gdGhpcy52aWV3SXRlbXMubGVuZ3RoIC0gMTtcblx0XHRcdH1cblx0XHRcdGl0ZW0gPSB0aGlzLnZpZXdJdGVtc1t0aGlzLmZvY3VzZWRJdGVtXTtcblx0XHR9IHdoaWxlICh0aGlzLmZvY3VzZWRJdGVtICE9PSBzdGFydEluZGV4ICYmICgodGhpcy5vcHRpb25zLmZvY3VzT25seUVuYWJsZWRJdGVtcyAmJiAhaXRlbS5pc0VuYWJsZWQoKSkgfHwgaXRlbS5hY3Rpb24uaWQgPT09IFNlcGFyYXRvci5JRCkpO1xuXG5cblx0XHR0aGlzLnVwZGF0ZUZvY3VzKHRydWUpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIHVwZGF0ZUZvY3VzKGZyb21SaWdodD86IGJvb2xlYW4sIHByZXZlbnRTY3JvbGw/OiBib29sZWFuLCBmb3JjZUZvY3VzOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHRpZiAodHlwZW9mIHRoaXMuZm9jdXNlZEl0ZW0gPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGlzLmFjdGlvbnNMaXN0LmZvY3VzKHsgcHJldmVudFNjcm9sbCB9KTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5wcmV2aW91c2x5Rm9jdXNlZEl0ZW0gIT09IHVuZGVmaW5lZCAmJiB0aGlzLnByZXZpb3VzbHlGb2N1c2VkSXRlbSAhPT0gdGhpcy5mb2N1c2VkSXRlbSkge1xuXHRcdFx0dGhpcy52aWV3SXRlbXNbdGhpcy5wcmV2aW91c2x5Rm9jdXNlZEl0ZW1dPy5ibHVyKCk7XG5cdFx0fVxuXHRcdGNvbnN0IGFjdGlvblZpZXdJdGVtID0gdGhpcy5mb2N1c2VkSXRlbSAhPT0gdW5kZWZpbmVkID8gdGhpcy52aWV3SXRlbXNbdGhpcy5mb2N1c2VkSXRlbV0gOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGFjdGlvblZpZXdJdGVtKSB7XG5cdFx0XHRsZXQgZm9jdXNJdGVtID0gdHJ1ZTtcblxuXHRcdFx0aWYgKCF0eXBlcy5pc0Z1bmN0aW9uKGFjdGlvblZpZXdJdGVtLmZvY3VzKSkge1xuXHRcdFx0XHRmb2N1c0l0ZW0gPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy5mb2N1c09ubHlFbmFibGVkSXRlbXMgJiYgdHlwZXMuaXNGdW5jdGlvbihhY3Rpb25WaWV3SXRlbS5pc0VuYWJsZWQpICYmICFhY3Rpb25WaWV3SXRlbS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0XHRmb2N1c0l0ZW0gPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGFjdGlvblZpZXdJdGVtLmFjdGlvbi5pZCA9PT0gU2VwYXJhdG9yLklEKSB7XG5cdFx0XHRcdGZvY3VzSXRlbSA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFmb2N1c0l0ZW0pIHtcblx0XHRcdFx0dGhpcy5hY3Rpb25zTGlzdC5mb2N1cyh7IHByZXZlbnRTY3JvbGwgfSk7XG5cdFx0XHRcdHRoaXMucHJldmlvdXNseUZvY3VzZWRJdGVtID0gdW5kZWZpbmVkO1xuXHRcdFx0fSBlbHNlIGlmIChmb3JjZUZvY3VzIHx8IHRoaXMucHJldmlvdXNseUZvY3VzZWRJdGVtICE9PSB0aGlzLmZvY3VzZWRJdGVtKSB7XG5cdFx0XHRcdGFjdGlvblZpZXdJdGVtLmZvY3VzKGZyb21SaWdodCk7XG5cdFx0XHRcdHRoaXMucHJldmlvdXNseUZvY3VzZWRJdGVtID0gdGhpcy5mb2N1c2VkSXRlbTtcblx0XHRcdH1cblx0XHRcdGlmIChmb2N1c0l0ZW0pIHtcblx0XHRcdFx0YWN0aW9uVmlld0l0ZW0uc2hvd0hvdmVyPy4oKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRvVHJpZ2dlcihldmVudDogU3RhbmRhcmRLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLmZvY3VzZWRJdGVtID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuOyAvL25vdGhpbmcgdG8gZm9jdXNcblx0XHR9XG5cblx0XHQvLyB0cmlnZ2VyIGFjdGlvblxuXHRcdGNvbnN0IGFjdGlvblZpZXdJdGVtID0gdGhpcy52aWV3SXRlbXNbdGhpcy5mb2N1c2VkSXRlbV07XG5cdFx0aWYgKGFjdGlvblZpZXdJdGVtIGluc3RhbmNlb2YgQmFzZUFjdGlvblZpZXdJdGVtKSB7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gKGFjdGlvblZpZXdJdGVtLl9jb250ZXh0ID09PSBudWxsIHx8IGFjdGlvblZpZXdJdGVtLl9jb250ZXh0ID09PSB1bmRlZmluZWQpID8gZXZlbnQgOiBhY3Rpb25WaWV3SXRlbS5fY29udGV4dDtcblx0XHRcdHRoaXMucnVuKGFjdGlvblZpZXdJdGVtLl9hY3Rpb24sIGNvbnRleHQpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJ1bihhY3Rpb246IElBY3Rpb24sIGNvbnRleHQ/OiB1bmtub3duKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fYWN0aW9uUnVubmVyLnJ1bihhY3Rpb24sIGNvbnRleHQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9jb250ZXh0ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3ZpZXdJdGVtcyA9IGRpc3Bvc2UodGhpcy5fdmlld0l0ZW1zKTtcblx0XHR0aGlzLmdldENvbnRhaW5lcigpLnJlbW92ZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJlcGFyZUFjdGlvbnMoYWN0aW9uczogSUFjdGlvbltdKTogSUFjdGlvbltdIHtcblx0aWYgKCFhY3Rpb25zLmxlbmd0aCkge1xuXHRcdHJldHVybiBhY3Rpb25zO1xuXHR9XG5cblx0Ly8gQ2xlYW4gdXAgbGVhZGluZyBzZXBhcmF0b3JzXG5cdGxldCBmaXJzdEluZGV4T2ZBY3Rpb24gPSAtMTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0aWYgKGFjdGlvbnNbaV0uaWQgPT09IFNlcGFyYXRvci5JRCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Zmlyc3RJbmRleE9mQWN0aW9uID0gaTtcblx0XHRicmVhaztcblx0fVxuXG5cdGlmIChmaXJzdEluZGV4T2ZBY3Rpb24gPT09IC0xKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0YWN0aW9ucyA9IGFjdGlvbnMuc2xpY2UoZmlyc3RJbmRleE9mQWN0aW9uKTtcblxuXHQvLyBDbGVhbiB1cCB0cmFpbGluZyBzZXBhcmF0b3JzXG5cdGZvciAobGV0IGggPSBhY3Rpb25zLmxlbmd0aCAtIDE7IGggPj0gMDsgaC0tKSB7XG5cdFx0Y29uc3QgaXNTZXBhcmF0b3IgPSBhY3Rpb25zW2hdLmlkID09PSBTZXBhcmF0b3IuSUQ7XG5cdFx0aWYgKGlzU2VwYXJhdG9yKSB7XG5cdFx0XHRhY3Rpb25zLnNwbGljZShoLCAxKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0Ly8gQ2xlYW4gdXAgc2VwYXJhdG9yIGR1cGxpY2F0ZXNcblx0bGV0IGZvdW5kQWN0aW9uID0gZmFsc2U7XG5cdGZvciAobGV0IGsgPSBhY3Rpb25zLmxlbmd0aCAtIDE7IGsgPj0gMDsgay0tKSB7XG5cdFx0Y29uc3QgaXNTZXBhcmF0b3IgPSBhY3Rpb25zW2tdLmlkID09PSBTZXBhcmF0b3IuSUQ7XG5cdFx0aWYgKGlzU2VwYXJhdG9yICYmICFmb3VuZEFjdGlvbikge1xuXHRcdFx0YWN0aW9ucy5zcGxpY2UoaywgMSk7XG5cdFx0fSBlbHNlIGlmICghaXNTZXBhcmF0b3IpIHtcblx0XHRcdGZvdW5kQWN0aW9uID0gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKGlzU2VwYXJhdG9yKSB7XG5cdFx0XHRmb3VuZEFjdGlvbiA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBhY3Rpb25zO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0JBQWdCLDBCQUFrRDtBQUMzRSxTQUFTLGtDQUFrQztBQUUzQyxTQUFTLGNBQWlELGlCQUFpQjtBQUMzRSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyxZQUFZLGVBQWUsaUJBQWlCLGVBQTRCO0FBQ2pGLFlBQVksV0FBVztBQUN2QixPQUFPO0FBaUJBLElBQVcscUJBQVgsa0JBQVdBLHdCQUFYO0FBQ04sRUFBQUEsd0NBQUE7QUFDQSxFQUFBQSx3Q0FBQTtBQUZpQixTQUFBQTtBQUFBLEdBQUE7QUFrQ1gsTUFBTSxrQkFBa0IsV0FBb0M7QUFBQSxFQTZDbEUsWUFBWSxXQUF3QixVQUE2QixDQUFDLEdBQUc7QUFDcEUsVUFBTTtBQXhDUCxTQUFpQiwyQkFBMkIsS0FBSyxVQUFVLElBQUksZ0JBQWdCLENBQUM7QUFZaEYsU0FBaUIsc0JBQXNCLEtBQUssVUFBVSxJQUFJLGNBQStCLENBQUM7QUFNMUY7QUFBQSxTQUFRLGlCQUEwQjtBQUVsQyxTQUFRLFlBQXFCO0FBTTdCLFNBQWlCLGFBQWEsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBR2hFLFNBQWlCLGVBQWUsS0FBSyxVQUFVLElBQUksUUFBYyxFQUFFLHdCQUF3QixNQUFNLEtBQUssb0JBQW9CLEtBQUssQ0FBQyxDQUFDO0FBRWpJLFNB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QWE7QUFDNUM7QUFBQSxJQUNEO0FBR0EsVUFBTSxpQkFBaUIsS0FBSyxVQUFVLEtBQUssV0FBVztBQUN0RCxRQUFJLDBCQUEwQixvQkFBb0I7QUFDakQsWUFBTSxVQUFXLGVBQWUsYUFBYSxRQUFRLGVBQWUsYUFBYSxTQUFhLFFBQVEsZUFBZTtBQUNySCxXQUFLLElBQUksZUFBZSxTQUFTLE9BQU87QUFBQSxJQUN6QztBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sSUFBSSxRQUFpQixTQUFrQztBQUM1RCxVQUFNLEtBQUssY0FBYyxJQUFJLFFBQVEsT0FBTztBQUFBLEVBQzdDO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixTQUFLLFdBQVc7QUFDaEIsU0FBSyxhQUFhLFFBQVEsS0FBSyxVQUFVO0FBQ3pDLFNBQUssYUFBYSxFQUFFLE9BQU87QUFDM0IsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUNEO0FBRU8sU0FBUyxlQUFlLFNBQStCO0FBQzdELE1BQUksQ0FBQyxRQUFRLFFBQVE7QUFDcEIsV0FBTztBQUFBLEVBQ1I7QUFHQSxNQUFJLHFCQUFxQjtBQUN6QixXQUFTLElBQUksR0FBRyxJQUFJLFFBQVEsUUFBUSxLQUFLO0FBQ3hDLFFBQUksUUFBUSxDQUFDLEVBQUUsT0FBTyxVQUFVLElBQUk7QUFDbkM7QUFBQSxJQUNEO0FBRUEseUJBQXFCO0FBQ3JCO0FBQUEsRUFDRDtBQUVBLE1BQUksdUJBQXVCLElBQUk7QUFDOUIsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUVBLFlBQVUsUUFBUSxNQUFNLGtCQUFrQjtBQUcxQyxXQUFTLElBQUksUUFBUSxTQUFTLEdBQUcsS0FBSyxHQUFHLEtBQUs7QUFDN0MsVUFBTSxjQUFjLFFBQVEsQ0FBQyxFQUFFLE9BQU8sVUFBVTtBQUNoRCxRQUFJLGFBQWE7QUFDaEIsY0FBUSxPQUFPLEdBQUcsQ0FBQztBQUFBLElBQ3BCLE9BQU87QUFDTjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBR0EsTUFBSSxjQUFjO0FBQ2xCLFdBQVMsSUFBSSxRQUFRLFNBQVMsR0FBRyxLQUFLLEdBQUcsS0FBSztBQUM3QyxVQUFNLGNBQWMsUUFBUSxDQUFDLEVBQUUsT0FBTyxVQUFVO0FBQ2hELFFBQUksZUFBZSxDQUFDLGFBQWE7QUFDaEMsY0FBUSxPQUFPLEdBQUcsQ0FBQztBQUFBLElBQ3BCLFdBQVcsQ0FBQyxhQUFhO0FBQ3hCLG9CQUFjO0FBQUEsSUFDZixXQUFXLGFBQWE7QUFDdkIsb0JBQWM7QUFBQSxJQUNmO0FBQUEsRUFDRDtBQUVBLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFsiQWN0aW9uc09yaWVudGF0aW9uIl0KfQo=
