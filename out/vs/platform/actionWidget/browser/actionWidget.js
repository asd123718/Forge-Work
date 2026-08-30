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
import * as dom from "../../../base/browser/dom.js";
import { ActionBar } from "../../../base/browser/ui/actionbar/actionbar.js";
import { disposableTimeout } from "../../../base/common/async.js";
import { KeyCode, KeyMod } from "../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import "./actionWidget.css";
import { localize, localize2 } from "../../../nls.js";
import { acceptSelectedActionCommand, ActionList, previewSelectedActionCommand } from "./actionList.js";
import { Action2, registerAction2 } from "../../actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../contextkey/common/contextkey.js";
import { IContextViewService } from "../../contextview/browser/contextView.js";
import { InstantiationType, registerSingleton } from "../../instantiation/common/extensions.js";
import { createDecorator, IInstantiationService } from "../../instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../keybinding/common/keybindingsRegistry.js";
import { inputActiveOptionBackground, registerColor } from "../../theme/common/colorRegistry.js";
registerColor(
  "actionBar.toggledBackground",
  inputActiveOptionBackground,
  localize("actionBar.toggledBackground", "Background color for toggled action items in action bar.")
);
const ACTION_WIDGET_CLOSE_START_OPACITY_VARIABLE = "--action-widget-close-start-opacity";
const ACTION_WIDGET_CLOSE_START_TRANSFORM_VARIABLE = "--action-widget-close-start-transform";
const ActionWidgetContextKeys = {
  Visible: new RawContextKey("codeActionMenuVisible", false, localize("codeActionMenuVisible", "Whether the action widget list is visible")),
  FilterFocused: new RawContextKey("codeActionMenuFilterFocused", false, localize("codeActionMenuFilterFocused", "Whether the action widget filter input is focused"))
};
const IActionWidgetService = createDecorator("actionWidgetService");
let ActionWidgetService = class extends Disposable {
  constructor(_contextViewService, _contextKeyService, _instantiationService) {
    super();
    this._contextViewService = _contextViewService;
    this._contextKeyService = _contextKeyService;
    this._instantiationService = _instantiationService;
    this._list = this._register(new MutableDisposable());
    this._closeAnimation = this._register(new MutableDisposable());
  }
  get isVisible() {
    return ActionWidgetContextKeys.Visible.getValue(this._contextKeyService) || false;
  }
  show(user, supportsPreview, items, delegate, anchor, container, actionBarActions, accessibilityProvider, listOptions) {
    const visibleContext = ActionWidgetContextKeys.Visible.bindTo(this._contextKeyService);
    const list = this._instantiationService.createInstance(ActionList, user, supportsPreview, items, delegate, accessibilityProvider, listOptions, anchor);
    this._contextViewService.showContextView({
      getAnchor: () => anchor,
      render: (container2) => {
        visibleContext.set(true);
        return this._renderWidget(container2, list, actionBarActions ?? []);
      },
      onHide: (didCancel) => {
        visibleContext.reset();
        this._onWidgetClosed(didCancel);
      },
      get anchorPosition() {
        return list.anchorPosition;
      }
    }, container, false);
  }
  acceptSelected(preview) {
    this._list.value?.acceptSelected(preview);
  }
  updateItems(items, focusItemId) {
    this._list.value?.updateItems(items, focusItemId);
  }
  focusItemById(itemId) {
    this._list.value?.focusItemById(itemId);
  }
  focusPrevious() {
    this._list?.value?.focusPrevious();
  }
  focusNext() {
    this._list?.value?.focusNext();
  }
  collapseSection() {
    this._list?.value?.collapseFocusedSection();
  }
  expandSection() {
    this._list?.value?.expandFocusedSection();
  }
  toggleSection() {
    return this._list?.value?.toggleFocusedSection() ?? false;
  }
  clearFilter() {
    return this._list?.value?.clearFilter() ?? false;
  }
  hide(didCancel) {
    const list = this._list.value;
    const widget = this._widgetElement;
    if (!list || this._closingList === list) {
      return;
    }
    const closeAnimation = list.closeAnimation;
    if (!widget || !closeAnimation || closeAnimation.duration <= 0 || !this._hasRequiredAncestorClasses(widget, closeAnimation.requiredAncestorClasses)) {
      this._closingList = list;
      list.hide(didCancel);
      return;
    }
    this._closingList = list;
    const computedStyle = dom.getWindow(widget).getComputedStyle(widget);
    widget.style.setProperty(ACTION_WIDGET_CLOSE_START_OPACITY_VARIABLE, computedStyle.opacity);
    widget.style.setProperty(ACTION_WIDGET_CLOSE_START_TRANSFORM_VARIABLE, computedStyle.transform);
    widget.classList.add(closeAnimation.className);
    list.hide(didCancel, false);
    this._closeAnimation.value = disposableTimeout(() => {
      if (this._list.value === list) {
        this._contextViewService.hideContextView(didCancel);
      }
    }, closeAnimation.duration);
  }
  clear() {
    this._closeAnimation.clear();
    this._closingList = void 0;
    this._widgetElement?.style.removeProperty(ACTION_WIDGET_CLOSE_START_OPACITY_VARIABLE);
    this._widgetElement?.style.removeProperty(ACTION_WIDGET_CLOSE_START_TRANSFORM_VARIABLE);
    this._widgetElement = void 0;
    this._list.clear();
  }
  _renderWidget(element, list, actionBarActions) {
    const widget = document.createElement("div");
    widget.classList.add("action-widget");
    const widgetClassNames = list.widgetClassName?.split(/\s+/).filter(Boolean);
    if (widgetClassNames?.length) {
      widget.classList.add(...widgetClassNames);
    }
    element.appendChild(widget);
    this._widgetElement = widget;
    this._list.value = list;
    if (this._list.value) {
      if (this._list.value.headerContainer) {
        widget.appendChild(this._list.value.headerContainer);
      }
      if (this._list.value.filterContainer) {
        widget.appendChild(this._list.value.filterContainer);
      }
      widget.appendChild(this._list.value.domNode);
      if (this._list.value.footerContainer) {
        widget.appendChild(this._list.value.footerContainer);
      }
    } else {
      throw new Error("List has no value");
    }
    const renderDisposables = new DisposableStore();
    const headerContainer = this._list.value.headerContainer;
    if (headerContainer) {
      renderDisposables.add(dom.addDisposableGenericMouseDownListener(headerContainer, (e) => e.preventDefault()));
    }
    const menuBlock = document.createElement("div");
    const block = element.appendChild(menuBlock);
    block.classList.add("context-view-block");
    renderDisposables.add(dom.addDisposableGenericMouseDownListener(block, (e) => e.stopPropagation()));
    const pointerBlockDiv = document.createElement("div");
    const pointerBlock = element.appendChild(pointerBlockDiv);
    pointerBlock.classList.add("context-view-pointerBlock");
    renderDisposables.add(dom.addDisposableListener(pointerBlock, dom.EventType.POINTER_MOVE, () => pointerBlock.remove()));
    renderDisposables.add(dom.addDisposableGenericMouseDownListener(pointerBlock, () => pointerBlock.remove()));
    let actionBarWidth = 0;
    if (actionBarActions.length) {
      const actionBar = this._createActionBar(".action-widget-action-bar", actionBarActions);
      if (actionBar) {
        widget.appendChild(actionBar.getContainer().parentElement);
        renderDisposables.add(actionBar);
        actionBarWidth = actionBar.getContainer().offsetWidth;
      }
    }
    const width = this._list.value?.layout(actionBarWidth);
    widget.style.width = `${width}px`;
    this._list.value?.focus();
    const filterFocusedContext = ActionWidgetContextKeys.FilterFocused.bindTo(this._contextKeyService);
    renderDisposables.add({ dispose: () => filterFocusedContext.reset() });
    if (this._list.value?.filterInput) {
      const filterInput = this._list.value.filterInput;
      renderDisposables.add(dom.addDisposableListener(filterInput, "focus", () => filterFocusedContext.set(true)));
      renderDisposables.add(dom.addDisposableListener(filterInput, "blur", () => filterFocusedContext.set(false)));
    }
    const focusTracker = renderDisposables.add(dom.trackFocus(element));
    renderDisposables.add(focusTracker.onDidBlur(() => {
      const activeElement = dom.getActiveElement();
      if (activeElement?.closest(".action-widget-hover") || activeElement?.closest(".action-list-submenu-panel")) {
        return;
      }
      this.hide(true);
    }));
    return renderDisposables;
  }
  _createActionBar(className, actions) {
    if (!actions.length) {
      return void 0;
    }
    const container = dom.$(className);
    const actionBar = new ActionBar(container);
    actionBar.push(actions, { icon: false, label: true });
    return actionBar;
  }
  _hasRequiredAncestorClasses(element, classNames) {
    if (!classNames?.length) {
      return true;
    }
    for (let candidate = element; candidate; candidate = candidate.parentElement) {
      if (classNames.every((className) => candidate.classList.contains(className))) {
        return true;
      }
    }
    return false;
  }
  _onWidgetClosed(didCancel) {
    if (this._closingList === this._list.value) {
      this.clear();
      return;
    }
    this._closeAnimation.clear();
    this._closingList = void 0;
    this._widgetElement = void 0;
    this._list.value?.hide(didCancel);
  }
};
ActionWidgetService = __decorateClass([
  __decorateParam(0, IContextViewService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IInstantiationService)
], ActionWidgetService);
registerSingleton(IActionWidgetService, ActionWidgetService, InstantiationType.Delayed);
const weight = KeybindingWeight.EditorContrib + 1e3;
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "hideCodeActionWidget",
      title: localize2("hideCodeActionWidget.title", "Hide action widget"),
      precondition: ActionWidgetContextKeys.Visible,
      keybinding: {
        weight,
        primary: KeyCode.Escape,
        secondary: [KeyMod.Shift | KeyCode.Escape]
      }
    });
  }
  run(accessor) {
    accessor.get(IActionWidgetService).hide(true);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "clearFilterCodeActionWidget",
      title: localize2("clearFilterCodeActionWidget.title", "Clear action widget filter"),
      precondition: ContextKeyExpr.and(ActionWidgetContextKeys.Visible, ActionWidgetContextKeys.FilterFocused),
      keybinding: {
        weight: weight + 1,
        primary: KeyCode.Escape
      }
    });
  }
  run(accessor) {
    const widgetService = accessor.get(IActionWidgetService);
    if (widgetService instanceof ActionWidgetService) {
      if (!widgetService.clearFilter()) {
        widgetService.hide(true);
      }
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "selectPrevCodeAction",
      title: localize2("selectPrevCodeAction.title", "Select previous action"),
      precondition: ActionWidgetContextKeys.Visible,
      keybinding: {
        weight,
        primary: KeyCode.UpArrow,
        secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow],
        mac: { primary: KeyCode.UpArrow, secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow, KeyMod.WinCtrl | KeyCode.KeyP] }
      }
    });
  }
  run(accessor) {
    const widgetService = accessor.get(IActionWidgetService);
    if (widgetService instanceof ActionWidgetService) {
      widgetService.focusPrevious();
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "selectNextCodeAction",
      title: localize2("selectNextCodeAction.title", "Select next action"),
      precondition: ActionWidgetContextKeys.Visible,
      keybinding: {
        weight,
        primary: KeyCode.DownArrow,
        secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow],
        mac: { primary: KeyCode.DownArrow, secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow, KeyMod.WinCtrl | KeyCode.KeyN] }
      }
    });
  }
  run(accessor) {
    const widgetService = accessor.get(IActionWidgetService);
    if (widgetService instanceof ActionWidgetService) {
      widgetService.focusNext();
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "collapseSectionCodeAction",
      title: localize2("collapseSectionCodeAction.title", "Collapse section"),
      precondition: ContextKeyExpr.and(ActionWidgetContextKeys.Visible, ActionWidgetContextKeys.FilterFocused.negate()),
      keybinding: {
        weight,
        primary: KeyCode.LeftArrow
      }
    });
  }
  run(accessor) {
    const widgetService = accessor.get(IActionWidgetService);
    if (widgetService instanceof ActionWidgetService) {
      widgetService.collapseSection();
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "expandSectionCodeAction",
      title: localize2("expandSectionCodeAction.title", "Expand section"),
      precondition: ContextKeyExpr.and(ActionWidgetContextKeys.Visible, ActionWidgetContextKeys.FilterFocused.negate()),
      keybinding: {
        weight,
        primary: KeyCode.RightArrow
      }
    });
  }
  run(accessor) {
    const widgetService = accessor.get(IActionWidgetService);
    if (widgetService instanceof ActionWidgetService) {
      widgetService.expandSection();
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "toggleSectionCodeAction",
      title: localize2("toggleSectionCodeAction.title", "Toggle section"),
      precondition: ContextKeyExpr.and(ActionWidgetContextKeys.Visible, ActionWidgetContextKeys.FilterFocused.negate()),
      keybinding: {
        weight,
        primary: KeyCode.Space
      }
    });
  }
  run(accessor) {
    const widgetService = accessor.get(IActionWidgetService);
    if (widgetService instanceof ActionWidgetService) {
      if (!widgetService.toggleSection()) {
        widgetService.acceptSelected();
      }
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: acceptSelectedActionCommand,
      title: localize2("acceptSelected.title", "Accept selected action"),
      precondition: ActionWidgetContextKeys.Visible,
      keybinding: {
        weight,
        primary: KeyCode.Enter,
        secondary: [KeyMod.CtrlCmd | KeyCode.Period]
      }
    });
  }
  run(accessor) {
    const widgetService = accessor.get(IActionWidgetService);
    if (widgetService instanceof ActionWidgetService) {
      widgetService.acceptSelected();
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: previewSelectedActionCommand,
      title: localize2("previewSelected.title", "Preview selected action"),
      precondition: ActionWidgetContextKeys.Visible,
      keybinding: {
        weight,
        primary: KeyMod.CtrlCmd | KeyCode.Enter
      }
    });
  }
  run(accessor) {
    const widgetService = accessor.get(IActionWidgetService);
    if (widgetService instanceof ActionWidgetService) {
      widgetService.acceptSelected(true);
    }
  }
});
export {
  IActionWidgetService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWN0aW9uV2lkZ2V0XFxicm93c2VyXFxhY3Rpb25XaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgSUFuY2hvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb250ZXh0dmlldy9jb250ZXh0dmlldy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAnLi9hY3Rpb25XaWRnZXQuY3NzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgYWNjZXB0U2VsZWN0ZWRBY3Rpb25Db21tYW5kLCBBY3Rpb25MaXN0LCBJQWN0aW9uTGlzdERlbGVnYXRlLCBJQWN0aW9uTGlzdEl0ZW0sIElBY3Rpb25MaXN0T3B0aW9ucywgcHJldmlld1NlbGVjdGVkQWN0aW9uQ29tbWFuZCB9IGZyb20gJy4vYWN0aW9uTGlzdC5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yLCBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGlucHV0QWN0aXZlT3B0aW9uQmFja2dyb3VuZCwgcmVnaXN0ZXJDb2xvciB9IGZyb20gJy4uLy4uL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5cbnJlZ2lzdGVyQ29sb3IoXG5cdCdhY3Rpb25CYXIudG9nZ2xlZEJhY2tncm91bmQnLFxuXHRpbnB1dEFjdGl2ZU9wdGlvbkJhY2tncm91bmQsXG5cdGxvY2FsaXplKCdhY3Rpb25CYXIudG9nZ2xlZEJhY2tncm91bmQnLCAnQmFja2dyb3VuZCBjb2xvciBmb3IgdG9nZ2xlZCBhY3Rpb24gaXRlbXMgaW4gYWN0aW9uIGJhci4nKVxuKTtcblxuY29uc3QgQUNUSU9OX1dJREdFVF9DTE9TRV9TVEFSVF9PUEFDSVRZX1ZBUklBQkxFID0gJy0tYWN0aW9uLXdpZGdldC1jbG9zZS1zdGFydC1vcGFjaXR5JztcbmNvbnN0IEFDVElPTl9XSURHRVRfQ0xPU0VfU1RBUlRfVFJBTlNGT1JNX1ZBUklBQkxFID0gJy0tYWN0aW9uLXdpZGdldC1jbG9zZS1zdGFydC10cmFuc2Zvcm0nO1xuXG5jb25zdCBBY3Rpb25XaWRnZXRDb250ZXh0S2V5cyA9IHtcblx0VmlzaWJsZTogbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2NvZGVBY3Rpb25NZW51VmlzaWJsZScsIGZhbHNlLCBsb2NhbGl6ZSgnY29kZUFjdGlvbk1lbnVWaXNpYmxlJywgXCJXaGV0aGVyIHRoZSBhY3Rpb24gd2lkZ2V0IGxpc3QgaXMgdmlzaWJsZVwiKSksXG5cdEZpbHRlckZvY3VzZWQ6IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdjb2RlQWN0aW9uTWVudUZpbHRlckZvY3VzZWQnLCBmYWxzZSwgbG9jYWxpemUoJ2NvZGVBY3Rpb25NZW51RmlsdGVyRm9jdXNlZCcsIFwiV2hldGhlciB0aGUgYWN0aW9uIHdpZGdldCBmaWx0ZXIgaW5wdXQgaXMgZm9jdXNlZFwiKSksXG59O1xuXG5leHBvcnQgY29uc3QgSUFjdGlvbldpZGdldFNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUFjdGlvbldpZGdldFNlcnZpY2U+KCdhY3Rpb25XaWRnZXRTZXJ2aWNlJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFjdGlvbldpZGdldFNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0c2hvdzxUPih1c2VyOiBzdHJpbmcsIHN1cHBvcnRzUHJldmlldzogYm9vbGVhbiwgaXRlbXM6IHJlYWRvbmx5IElBY3Rpb25MaXN0SXRlbTxUPltdLCBkZWxlZ2F0ZTogSUFjdGlvbkxpc3REZWxlZ2F0ZTxUPiwgYW5jaG9yOiBIVE1MRWxlbWVudCB8IFN0YW5kYXJkTW91c2VFdmVudCB8IElBbmNob3IsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQsIGFjdGlvbkJhckFjdGlvbnM/OiByZWFkb25seSBJQWN0aW9uW10sIGFjY2Vzc2liaWxpdHlQcm92aWRlcj86IFBhcnRpYWw8SUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8SUFjdGlvbkxpc3RJdGVtPFQ+Pj4sIGxpc3RPcHRpb25zPzogSUFjdGlvbkxpc3RPcHRpb25zKTogdm9pZDtcblxuXHQvKipcblx0ICogUmVwbGFjZXMgdGhlIGl0ZW1zIG9mIHRoZSBjdXJyZW50bHkgc2hvd24gd2lkZ2V0IGluIHBsYWNlLCB3aXRob3V0IGNsb3Npbmdcblx0ICogb3IgcmVwb3NpdGlvbmluZyBpdC4gUHJlc2VydmVzIHRoZSBjdXJyZW50IGZpbHRlci4gV2hlbiBgZm9jdXNJdGVtSWRgIGlzXG5cdCAqIHByb3ZpZGVkLCBmb2N1c2VzIHRoYXQgaXRlbTsgb3RoZXJ3aXNlIHByZXNlcnZlcyB0aGUgZm9jdXNlZCBpdGVtLlxuXHQgKi9cblx0dXBkYXRlSXRlbXM8VD4oaXRlbXM6IHJlYWRvbmx5IElBY3Rpb25MaXN0SXRlbTxUPltdLCBmb2N1c0l0ZW1JZD86IHN0cmluZyk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIEZvY3VzZXMgdGhlIGl0ZW0gd2l0aCB0aGUgZ2l2ZW4gaWQgaW4gdGhlIGN1cnJlbnRseSBzaG93biB3aWRnZXQsIHdpdGhvdXRcblx0ICogcmVidWlsZGluZyB0aGUgbGlzdC5cblx0ICovXG5cdGZvY3VzSXRlbUJ5SWQoaXRlbUlkOiBzdHJpbmcpOiB2b2lkO1xuXG5cdGhpZGUoZGlkQ2FuY2VsPzogYm9vbGVhbik6IHZvaWQ7XG5cblx0cmVhZG9ubHkgaXNWaXNpYmxlOiBib29sZWFuO1xufVxuXG5jbGFzcyBBY3Rpb25XaWRnZXRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBY3Rpb25XaWRnZXRTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Z2V0IGlzVmlzaWJsZSgpIHtcblx0XHRyZXR1cm4gQWN0aW9uV2lkZ2V0Q29udGV4dEtleXMuVmlzaWJsZS5nZXRWYWx1ZSh0aGlzLl9jb250ZXh0S2V5U2VydmljZSkgfHwgZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9saXN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPEFjdGlvbkxpc3Q8dW5rbm93bj4+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jbG9zZUFuaW1hdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cdHByaXZhdGUgX3dpZGdldEVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jbG9zaW5nTGlzdDogQWN0aW9uTGlzdDx1bmtub3duPiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0c2hvdzxUPih1c2VyOiBzdHJpbmcsIHN1cHBvcnRzUHJldmlldzogYm9vbGVhbiwgaXRlbXM6IHJlYWRvbmx5IElBY3Rpb25MaXN0SXRlbTxUPltdLCBkZWxlZ2F0ZTogSUFjdGlvbkxpc3REZWxlZ2F0ZTxUPiwgYW5jaG9yOiBIVE1MRWxlbWVudCB8IFN0YW5kYXJkTW91c2VFdmVudCB8IElBbmNob3IsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQsIGFjdGlvbkJhckFjdGlvbnM/OiByZWFkb25seSBJQWN0aW9uW10sIGFjY2Vzc2liaWxpdHlQcm92aWRlcj86IFBhcnRpYWw8SUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8SUFjdGlvbkxpc3RJdGVtPFQ+Pj4sIGxpc3RPcHRpb25zPzogSUFjdGlvbkxpc3RPcHRpb25zKTogdm9pZCB7XG5cdFx0Y29uc3QgdmlzaWJsZUNvbnRleHQgPSBBY3Rpb25XaWRnZXRDb250ZXh0S2V5cy5WaXNpYmxlLmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRjb25zdCBsaXN0ID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWN0aW9uTGlzdCwgdXNlciwgc3VwcG9ydHNQcmV2aWV3LCBpdGVtcywgZGVsZWdhdGUsIGFjY2Vzc2liaWxpdHlQcm92aWRlciwgbGlzdE9wdGlvbnMsIGFuY2hvcik7XG5cdFx0dGhpcy5fY29udGV4dFZpZXdTZXJ2aWNlLnNob3dDb250ZXh0Vmlldyh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGFuY2hvcixcblx0XHRcdHJlbmRlcjogKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpID0+IHtcblx0XHRcdFx0dmlzaWJsZUNvbnRleHQuc2V0KHRydWUpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyV2lkZ2V0KGNvbnRhaW5lciwgbGlzdCwgYWN0aW9uQmFyQWN0aW9ucyA/PyBbXSk7XG5cdFx0XHR9LFxuXHRcdFx0b25IaWRlOiAoZGlkQ2FuY2VsKSA9PiB7XG5cdFx0XHRcdHZpc2libGVDb250ZXh0LnJlc2V0KCk7XG5cdFx0XHRcdHRoaXMuX29uV2lkZ2V0Q2xvc2VkKGRpZENhbmNlbCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGFuY2hvclBvc2l0aW9uKCkgeyByZXR1cm4gbGlzdC5hbmNob3JQb3NpdGlvbjsgfSxcblx0XHR9LCBjb250YWluZXIsIGZhbHNlKTtcblx0fVxuXG5cdGFjY2VwdFNlbGVjdGVkKHByZXZpZXc/OiBib29sZWFuKSB7XG5cdFx0dGhpcy5fbGlzdC52YWx1ZT8uYWNjZXB0U2VsZWN0ZWQocHJldmlldyk7XG5cdH1cblxuXHR1cGRhdGVJdGVtczxUPihpdGVtczogcmVhZG9ubHkgSUFjdGlvbkxpc3RJdGVtPFQ+W10sIGZvY3VzSXRlbUlkPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0KHRoaXMuX2xpc3QudmFsdWUgYXMgQWN0aW9uTGlzdDxUPiB8IHVuZGVmaW5lZCk/LnVwZGF0ZUl0ZW1zKGl0ZW1zLCBmb2N1c0l0ZW1JZCk7XG5cdH1cblxuXHRmb2N1c0l0ZW1CeUlkKGl0ZW1JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbGlzdC52YWx1ZT8uZm9jdXNJdGVtQnlJZChpdGVtSWQpO1xuXHR9XG5cblx0Zm9jdXNQcmV2aW91cygpIHtcblx0XHR0aGlzLl9saXN0Py52YWx1ZT8uZm9jdXNQcmV2aW91cygpO1xuXHR9XG5cblx0Zm9jdXNOZXh0KCkge1xuXHRcdHRoaXMuX2xpc3Q/LnZhbHVlPy5mb2N1c05leHQoKTtcblx0fVxuXG5cdGNvbGxhcHNlU2VjdGlvbigpIHtcblx0XHR0aGlzLl9saXN0Py52YWx1ZT8uY29sbGFwc2VGb2N1c2VkU2VjdGlvbigpO1xuXHR9XG5cblx0ZXhwYW5kU2VjdGlvbigpIHtcblx0XHR0aGlzLl9saXN0Py52YWx1ZT8uZXhwYW5kRm9jdXNlZFNlY3Rpb24oKTtcblx0fVxuXG5cdHRvZ2dsZVNlY3Rpb24oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpc3Q/LnZhbHVlPy50b2dnbGVGb2N1c2VkU2VjdGlvbigpID8/IGZhbHNlO1xuXHR9XG5cblx0Y2xlYXJGaWx0ZXIoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpc3Q/LnZhbHVlPy5jbGVhckZpbHRlcigpID8/IGZhbHNlO1xuXHR9XG5cblx0aGlkZShkaWRDYW5jZWw/OiBib29sZWFuKSB7XG5cdFx0Y29uc3QgbGlzdCA9IHRoaXMuX2xpc3QudmFsdWU7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5fd2lkZ2V0RWxlbWVudDtcblx0XHRpZiAoIWxpc3QgfHwgdGhpcy5fY2xvc2luZ0xpc3QgPT09IGxpc3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjbG9zZUFuaW1hdGlvbiA9IGxpc3QuY2xvc2VBbmltYXRpb247XG5cdFx0aWYgKCF3aWRnZXQgfHwgIWNsb3NlQW5pbWF0aW9uIHx8IGNsb3NlQW5pbWF0aW9uLmR1cmF0aW9uIDw9IDAgfHwgIXRoaXMuX2hhc1JlcXVpcmVkQW5jZXN0b3JDbGFzc2VzKHdpZGdldCwgY2xvc2VBbmltYXRpb24ucmVxdWlyZWRBbmNlc3RvckNsYXNzZXMpKSB7XG5cdFx0XHR0aGlzLl9jbG9zaW5nTGlzdCA9IGxpc3Q7XG5cdFx0XHRsaXN0LmhpZGUoZGlkQ2FuY2VsKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9jbG9zaW5nTGlzdCA9IGxpc3Q7XG5cdFx0Y29uc3QgY29tcHV0ZWRTdHlsZSA9IGRvbS5nZXRXaW5kb3cod2lkZ2V0KS5nZXRDb21wdXRlZFN0eWxlKHdpZGdldCk7XG5cdFx0d2lkZ2V0LnN0eWxlLnNldFByb3BlcnR5KEFDVElPTl9XSURHRVRfQ0xPU0VfU1RBUlRfT1BBQ0lUWV9WQVJJQUJMRSwgY29tcHV0ZWRTdHlsZS5vcGFjaXR5KTtcblx0XHR3aWRnZXQuc3R5bGUuc2V0UHJvcGVydHkoQUNUSU9OX1dJREdFVF9DTE9TRV9TVEFSVF9UUkFOU0ZPUk1fVkFSSUFCTEUsIGNvbXB1dGVkU3R5bGUudHJhbnNmb3JtKTtcblx0XHR3aWRnZXQuY2xhc3NMaXN0LmFkZChjbG9zZUFuaW1hdGlvbi5jbGFzc05hbWUpO1xuXHRcdGxpc3QuaGlkZShkaWRDYW5jZWwsIGZhbHNlKTtcblx0XHR0aGlzLl9jbG9zZUFuaW1hdGlvbi52YWx1ZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9saXN0LnZhbHVlID09PSBsaXN0KSB7XG5cdFx0XHRcdHRoaXMuX2NvbnRleHRWaWV3U2VydmljZS5oaWRlQ29udGV4dFZpZXcoZGlkQ2FuY2VsKTtcblx0XHRcdH1cblx0XHR9LCBjbG9zZUFuaW1hdGlvbi5kdXJhdGlvbik7XG5cdH1cblxuXHRjbGVhcigpIHtcblx0XHR0aGlzLl9jbG9zZUFuaW1hdGlvbi5jbGVhcigpO1xuXHRcdHRoaXMuX2Nsb3NpbmdMaXN0ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3dpZGdldEVsZW1lbnQ/LnN0eWxlLnJlbW92ZVByb3BlcnR5KEFDVElPTl9XSURHRVRfQ0xPU0VfU1RBUlRfT1BBQ0lUWV9WQVJJQUJMRSk7XG5cdFx0dGhpcy5fd2lkZ2V0RWxlbWVudD8uc3R5bGUucmVtb3ZlUHJvcGVydHkoQUNUSU9OX1dJREdFVF9DTE9TRV9TVEFSVF9UUkFOU0ZPUk1fVkFSSUFCTEUpO1xuXHRcdHRoaXMuX3dpZGdldEVsZW1lbnQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fbGlzdC5jbGVhcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyV2lkZ2V0KGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBsaXN0OiBBY3Rpb25MaXN0PHVua25vd24+LCBhY3Rpb25CYXJBY3Rpb25zOiByZWFkb25seSBJQWN0aW9uW10pOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0d2lkZ2V0LmNsYXNzTGlzdC5hZGQoJ2FjdGlvbi13aWRnZXQnKTtcblx0XHRjb25zdCB3aWRnZXRDbGFzc05hbWVzID0gbGlzdC53aWRnZXRDbGFzc05hbWU/LnNwbGl0KC9cXHMrLykuZmlsdGVyKEJvb2xlYW4pO1xuXHRcdGlmICh3aWRnZXRDbGFzc05hbWVzPy5sZW5ndGgpIHtcblx0XHRcdHdpZGdldC5jbGFzc0xpc3QuYWRkKC4uLndpZGdldENsYXNzTmFtZXMpO1xuXHRcdH1cblx0XHRlbGVtZW50LmFwcGVuZENoaWxkKHdpZGdldCk7XG5cdFx0dGhpcy5fd2lkZ2V0RWxlbWVudCA9IHdpZGdldDtcblxuXHRcdHRoaXMuX2xpc3QudmFsdWUgPSBsaXN0O1xuXHRcdGlmICh0aGlzLl9saXN0LnZhbHVlKSB7XG5cdFx0XHRpZiAodGhpcy5fbGlzdC52YWx1ZS5oZWFkZXJDb250YWluZXIpIHtcblx0XHRcdFx0d2lkZ2V0LmFwcGVuZENoaWxkKHRoaXMuX2xpc3QudmFsdWUuaGVhZGVyQ29udGFpbmVyKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9saXN0LnZhbHVlLmZpbHRlckNvbnRhaW5lcikge1xuXHRcdFx0XHR3aWRnZXQuYXBwZW5kQ2hpbGQodGhpcy5fbGlzdC52YWx1ZS5maWx0ZXJDb250YWluZXIpO1xuXHRcdFx0fVxuXHRcdFx0d2lkZ2V0LmFwcGVuZENoaWxkKHRoaXMuX2xpc3QudmFsdWUuZG9tTm9kZSk7XG5cdFx0XHRpZiAodGhpcy5fbGlzdC52YWx1ZS5mb290ZXJDb250YWluZXIpIHtcblx0XHRcdFx0d2lkZ2V0LmFwcGVuZENoaWxkKHRoaXMuX2xpc3QudmFsdWUuZm9vdGVyQ29udGFpbmVyKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdMaXN0IGhhcyBubyB2YWx1ZScpO1xuXHRcdH1cblx0XHRjb25zdCByZW5kZXJEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdC8vIENsaWNraW5nIHRoZSBoZWFkZXIgYmFubmVyIG11c3Qgbm90IG1vdmUgZm9jdXMgb3V0IG9mIHRoZSBsaXN0LCB3aGljaFxuXHRcdC8vIHdvdWxkIGJsdXIgdGhlIHdpZGdldCBhbmQgZGlzbWlzcyBpdC5cblx0XHRjb25zdCBoZWFkZXJDb250YWluZXIgPSB0aGlzLl9saXN0LnZhbHVlLmhlYWRlckNvbnRhaW5lcjtcblx0XHRpZiAoaGVhZGVyQ29udGFpbmVyKSB7XG5cdFx0XHRyZW5kZXJEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VEb3duTGlzdGVuZXIoaGVhZGVyQ29udGFpbmVyLCBlID0+IGUucHJldmVudERlZmF1bHQoKSkpO1xuXHRcdH1cblxuXHRcdC8vIEludmlzaWJsZSBkaXYgdG8gYmxvY2sgbW91c2UgaW50ZXJhY3Rpb24gaW4gdGhlIHJlc3Qgb2YgdGhlIFVJXG5cdFx0Y29uc3QgbWVudUJsb2NrID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y29uc3QgYmxvY2sgPSBlbGVtZW50LmFwcGVuZENoaWxkKG1lbnVCbG9jayk7XG5cdFx0YmxvY2suY2xhc3NMaXN0LmFkZCgnY29udGV4dC12aWV3LWJsb2NrJyk7XG5cdFx0cmVuZGVyRGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlRG93bkxpc3RlbmVyKGJsb2NrLCBlID0+IGUuc3RvcFByb3BhZ2F0aW9uKCkpKTtcblxuXHRcdC8vIEludmlzaWJsZSBkaXYgdG8gYmxvY2sgbW91c2UgaW50ZXJhY3Rpb24gd2l0aCB0aGUgbWVudVxuXHRcdGNvbnN0IHBvaW50ZXJCbG9ja0RpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnN0IHBvaW50ZXJCbG9jayA9IGVsZW1lbnQuYXBwZW5kQ2hpbGQocG9pbnRlckJsb2NrRGl2KTtcblx0XHRwb2ludGVyQmxvY2suY2xhc3NMaXN0LmFkZCgnY29udGV4dC12aWV3LXBvaW50ZXJCbG9jaycpO1xuXG5cdFx0Ly8gUmVtb3ZlcyBibG9jayBvbiBjbGljayBJTlNJREUgd2lkZ2V0IG9yIEFOWSBtb3VzZSBtb3ZlbWVudFxuXHRcdHJlbmRlckRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHBvaW50ZXJCbG9jaywgZG9tLkV2ZW50VHlwZS5QT0lOVEVSX01PVkUsICgpID0+IHBvaW50ZXJCbG9jay5yZW1vdmUoKSkpO1xuXHRcdHJlbmRlckRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZURvd25MaXN0ZW5lcihwb2ludGVyQmxvY2ssICgpID0+IHBvaW50ZXJCbG9jay5yZW1vdmUoKSkpO1xuXG5cdFx0Ly8gQWN0aW9uIGJhclxuXHRcdGxldCBhY3Rpb25CYXJXaWR0aCA9IDA7XG5cdFx0aWYgKGFjdGlvbkJhckFjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBhY3Rpb25CYXIgPSB0aGlzLl9jcmVhdGVBY3Rpb25CYXIoJy5hY3Rpb24td2lkZ2V0LWFjdGlvbi1iYXInLCBhY3Rpb25CYXJBY3Rpb25zKTtcblx0XHRcdGlmIChhY3Rpb25CYXIpIHtcblx0XHRcdFx0d2lkZ2V0LmFwcGVuZENoaWxkKGFjdGlvbkJhci5nZXRDb250YWluZXIoKS5wYXJlbnRFbGVtZW50ISk7XG5cdFx0XHRcdHJlbmRlckRpc3Bvc2FibGVzLmFkZChhY3Rpb25CYXIpO1xuXHRcdFx0XHRhY3Rpb25CYXJXaWR0aCA9IGFjdGlvbkJhci5nZXRDb250YWluZXIoKS5vZmZzZXRXaWR0aDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB3aWR0aCA9IHRoaXMuX2xpc3QudmFsdWU/LmxheW91dChhY3Rpb25CYXJXaWR0aCk7XG5cdFx0d2lkZ2V0LnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuXG5cdFx0dGhpcy5fbGlzdC52YWx1ZT8uZm9jdXMoKTtcblxuXHRcdC8vIFRyYWNrIGZpbHRlciBpbnB1dCBmb2N1cyBzdGF0ZVxuXHRcdGNvbnN0IGZpbHRlckZvY3VzZWRDb250ZXh0ID0gQWN0aW9uV2lkZ2V0Q29udGV4dEtleXMuRmlsdGVyRm9jdXNlZC5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHJlbmRlckRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IGZpbHRlckZvY3VzZWRDb250ZXh0LnJlc2V0KCkgfSk7XG5cdFx0aWYgKHRoaXMuX2xpc3QudmFsdWU/LmZpbHRlcklucHV0KSB7XG5cdFx0XHRjb25zdCBmaWx0ZXJJbnB1dCA9IHRoaXMuX2xpc3QudmFsdWUuZmlsdGVySW5wdXQ7XG5cdFx0XHRyZW5kZXJEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihmaWx0ZXJJbnB1dCwgJ2ZvY3VzJywgKCkgPT4gZmlsdGVyRm9jdXNlZENvbnRleHQuc2V0KHRydWUpKSk7XG5cdFx0XHRyZW5kZXJEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihmaWx0ZXJJbnB1dCwgJ2JsdXInLCAoKSA9PiBmaWx0ZXJGb2N1c2VkQ29udGV4dC5zZXQoZmFsc2UpKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9jdXNUcmFja2VyID0gcmVuZGVyRGlzcG9zYWJsZXMuYWRkKGRvbS50cmFja0ZvY3VzKGVsZW1lbnQpKTtcblx0XHRyZW5kZXJEaXNwb3NhYmxlcy5hZGQoZm9jdXNUcmFja2VyLm9uRGlkQmx1cigoKSA9PiB7XG5cdFx0XHQvLyBEb24ndCBoaWRlIGlmIGZvY3VzIG1vdmVkIHRvIGEgaG92ZXIgb3Igc3VibWVudSB0aGF0IGJlbG9uZ3MgdG8gdGhpcyBhY3Rpb24gd2lkZ2V0XG5cdFx0XHRjb25zdCBhY3RpdmVFbGVtZW50ID0gZG9tLmdldEFjdGl2ZUVsZW1lbnQoKTtcblx0XHRcdGlmIChhY3RpdmVFbGVtZW50Py5jbG9zZXN0KCcuYWN0aW9uLXdpZGdldC1ob3ZlcicpIHx8IGFjdGl2ZUVsZW1lbnQ/LmNsb3Nlc3QoJy5hY3Rpb24tbGlzdC1zdWJtZW51LXBhbmVsJykpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5oaWRlKHRydWUpO1xuXHRcdH0pKTtcblxuXHRcdHJldHVybiByZW5kZXJEaXNwb3NhYmxlcztcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUFjdGlvbkJhcihjbGFzc05hbWU6IHN0cmluZywgYWN0aW9uczogcmVhZG9ubHkgSUFjdGlvbltdKTogQWN0aW9uQmFyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWFjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvbS4kKGNsYXNzTmFtZSk7XG5cdFx0Y29uc3QgYWN0aW9uQmFyID0gbmV3IEFjdGlvbkJhcihjb250YWluZXIpO1xuXHRcdGFjdGlvbkJhci5wdXNoKGFjdGlvbnMsIHsgaWNvbjogZmFsc2UsIGxhYmVsOiB0cnVlIH0pO1xuXHRcdHJldHVybiBhY3Rpb25CYXI7XG5cdH1cblxuXHRwcml2YXRlIF9oYXNSZXF1aXJlZEFuY2VzdG9yQ2xhc3NlcyhlbGVtZW50OiBIVE1MRWxlbWVudCwgY2xhc3NOYW1lczogcmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAoIWNsYXNzTmFtZXM/Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGZvciAobGV0IGNhbmRpZGF0ZTogSFRNTEVsZW1lbnQgfCBudWxsID0gZWxlbWVudDsgY2FuZGlkYXRlOyBjYW5kaWRhdGUgPSBjYW5kaWRhdGUucGFyZW50RWxlbWVudCkge1xuXHRcdFx0aWYgKGNsYXNzTmFtZXMuZXZlcnkoY2xhc3NOYW1lID0+IGNhbmRpZGF0ZS5jbGFzc0xpc3QuY29udGFpbnMoY2xhc3NOYW1lKSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX29uV2lkZ2V0Q2xvc2VkKGRpZENhbmNlbD86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY2xvc2luZ0xpc3QgPT09IHRoaXMuX2xpc3QudmFsdWUpIHtcblx0XHRcdHRoaXMuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fY2xvc2VBbmltYXRpb24uY2xlYXIoKTtcblx0XHR0aGlzLl9jbG9zaW5nTGlzdCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl93aWRnZXRFbGVtZW50ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2xpc3QudmFsdWU/LmhpZGUoZGlkQ2FuY2VsKTtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJQWN0aW9uV2lkZ2V0U2VydmljZSwgQWN0aW9uV2lkZ2V0U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5cbmNvbnN0IHdlaWdodCA9IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiArIDEwMDA7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2hpZGVDb2RlQWN0aW9uV2lkZ2V0Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2hpZGVDb2RlQWN0aW9uV2lkZ2V0LnRpdGxlJywgXCJIaWRlIGFjdGlvbiB3aWRnZXRcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEFjdGlvbldpZGdldENvbnRleHRLZXlzLlZpc2libGUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodCxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdFx0XHRcdHNlY29uZGFyeTogW0tleU1vZC5TaGlmdCB8IEtleUNvZGUuRXNjYXBlXVxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGFjY2Vzc29yLmdldChJQWN0aW9uV2lkZ2V0U2VydmljZSkuaGlkZSh0cnVlKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2NsZWFyRmlsdGVyQ29kZUFjdGlvbldpZGdldCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjbGVhckZpbHRlckNvZGVBY3Rpb25XaWRnZXQudGl0bGUnLCBcIkNsZWFyIGFjdGlvbiB3aWRnZXQgZmlsdGVyXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQWN0aW9uV2lkZ2V0Q29udGV4dEtleXMuVmlzaWJsZSwgQWN0aW9uV2lkZ2V0Q29udGV4dEtleXMuRmlsdGVyRm9jdXNlZCksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogd2VpZ2h0ICsgMSxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBY3Rpb25XaWRnZXRTZXJ2aWNlKTtcblx0XHRpZiAod2lkZ2V0U2VydmljZSBpbnN0YW5jZW9mIEFjdGlvbldpZGdldFNlcnZpY2UpIHtcblx0XHRcdGlmICghd2lkZ2V0U2VydmljZS5jbGVhckZpbHRlcigpKSB7XG5cdFx0XHRcdHdpZGdldFNlcnZpY2UuaGlkZSh0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZWxlY3RQcmV2Q29kZUFjdGlvbicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzZWxlY3RQcmV2Q29kZUFjdGlvbi50aXRsZScsIFwiU2VsZWN0IHByZXZpb3VzIGFjdGlvblwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQWN0aW9uV2lkZ2V0Q29udGV4dEtleXMuVmlzaWJsZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0LFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLlVwQXJyb3csXG5cdFx0XHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5VcEFycm93XSxcblx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleUNvZGUuVXBBcnJvdywgc2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlVwQXJyb3csIEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5LZXlQXSB9LFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQWN0aW9uV2lkZ2V0U2VydmljZSk7XG5cdFx0aWYgKHdpZGdldFNlcnZpY2UgaW5zdGFuY2VvZiBBY3Rpb25XaWRnZXRTZXJ2aWNlKSB7XG5cdFx0XHR3aWRnZXRTZXJ2aWNlLmZvY3VzUHJldmlvdXMoKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZWxlY3ROZXh0Q29kZUFjdGlvbicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzZWxlY3ROZXh0Q29kZUFjdGlvbi50aXRsZScsIFwiU2VsZWN0IG5leHQgYWN0aW9uXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBBY3Rpb25XaWRnZXRDb250ZXh0S2V5cy5WaXNpYmxlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRG93bkFycm93LFxuXHRcdFx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRG93bkFycm93XSxcblx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleUNvZGUuRG93bkFycm93LCBzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRG93bkFycm93LCBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuS2V5Tl0gfVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQWN0aW9uV2lkZ2V0U2VydmljZSk7XG5cdFx0aWYgKHdpZGdldFNlcnZpY2UgaW5zdGFuY2VvZiBBY3Rpb25XaWRnZXRTZXJ2aWNlKSB7XG5cdFx0XHR3aWRnZXRTZXJ2aWNlLmZvY3VzTmV4dCgpO1xuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2NvbGxhcHNlU2VjdGlvbkNvZGVBY3Rpb24nLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY29sbGFwc2VTZWN0aW9uQ29kZUFjdGlvbi50aXRsZScsIFwiQ29sbGFwc2Ugc2VjdGlvblwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKEFjdGlvbldpZGdldENvbnRleHRLZXlzLlZpc2libGUsIEFjdGlvbldpZGdldENvbnRleHRLZXlzLkZpbHRlckZvY3VzZWQubmVnYXRlKCkpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuTGVmdEFycm93LFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQWN0aW9uV2lkZ2V0U2VydmljZSk7XG5cdFx0aWYgKHdpZGdldFNlcnZpY2UgaW5zdGFuY2VvZiBBY3Rpb25XaWRnZXRTZXJ2aWNlKSB7XG5cdFx0XHR3aWRnZXRTZXJ2aWNlLmNvbGxhcHNlU2VjdGlvbigpO1xuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2V4cGFuZFNlY3Rpb25Db2RlQWN0aW9uJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2V4cGFuZFNlY3Rpb25Db2RlQWN0aW9uLnRpdGxlJywgXCJFeHBhbmQgc2VjdGlvblwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKEFjdGlvbldpZGdldENvbnRleHRLZXlzLlZpc2libGUsIEFjdGlvbldpZGdldENvbnRleHRLZXlzLkZpbHRlckZvY3VzZWQubmVnYXRlKCkpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuUmlnaHRBcnJvdyxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFjdGlvbldpZGdldFNlcnZpY2UpO1xuXHRcdGlmICh3aWRnZXRTZXJ2aWNlIGluc3RhbmNlb2YgQWN0aW9uV2lkZ2V0U2VydmljZSkge1xuXHRcdFx0d2lkZ2V0U2VydmljZS5leHBhbmRTZWN0aW9uKCk7XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAndG9nZ2xlU2VjdGlvbkNvZGVBY3Rpb24nLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndG9nZ2xlU2VjdGlvbkNvZGVBY3Rpb24udGl0bGUnLCBcIlRvZ2dsZSBzZWN0aW9uXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQWN0aW9uV2lkZ2V0Q29udGV4dEtleXMuVmlzaWJsZSwgQWN0aW9uV2lkZ2V0Q29udGV4dEtleXMuRmlsdGVyRm9jdXNlZC5uZWdhdGUoKSksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodCxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5TcGFjZSxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFjdGlvbldpZGdldFNlcnZpY2UpO1xuXHRcdGlmICh3aWRnZXRTZXJ2aWNlIGluc3RhbmNlb2YgQWN0aW9uV2lkZ2V0U2VydmljZSkge1xuXHRcdFx0aWYgKCF3aWRnZXRTZXJ2aWNlLnRvZ2dsZVNlY3Rpb24oKSkge1xuXHRcdFx0XHR3aWRnZXRTZXJ2aWNlLmFjY2VwdFNlbGVjdGVkKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBhY2NlcHRTZWxlY3RlZEFjdGlvbkNvbW1hbmQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdhY2NlcHRTZWxlY3RlZC50aXRsZScsIFwiQWNjZXB0IHNlbGVjdGVkIGFjdGlvblwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQWN0aW9uV2lkZ2V0Q29udGV4dEtleXMuVmlzaWJsZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0LFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyLFxuXHRcdFx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuUGVyaW9kXSxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFjdGlvbldpZGdldFNlcnZpY2UpO1xuXHRcdGlmICh3aWRnZXRTZXJ2aWNlIGluc3RhbmNlb2YgQWN0aW9uV2lkZ2V0U2VydmljZSkge1xuXHRcdFx0d2lkZ2V0U2VydmljZS5hY2NlcHRTZWxlY3RlZCgpO1xuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogcHJldmlld1NlbGVjdGVkQWN0aW9uQ29tbWFuZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3ByZXZpZXdTZWxlY3RlZC50aXRsZScsIFwiUHJldmlldyBzZWxlY3RlZCBhY3Rpb25cIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEFjdGlvbldpZGdldENvbnRleHRLZXlzLlZpc2libGUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodCxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkVudGVyLFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQWN0aW9uV2lkZ2V0U2VydmljZSk7XG5cdFx0aWYgKHdpZGdldFNlcnZpY2UgaW5zdGFuY2VvZiBBY3Rpb25XaWRnZXRTZXJ2aWNlKSB7XG5cdFx0XHR3aWRnZXRTZXJ2aWNlLmFjY2VwdFNlbGVjdGVkKHRydWUpO1xuXHRcdH1cblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUlBLFlBQVksU0FBUztBQUNyQixTQUFTLGlCQUFpQjtBQUcxQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLFlBQVksaUJBQThCLHlCQUF5QjtBQUM1RSxPQUFPO0FBQ1AsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLDZCQUE2QixZQUFzRSxvQ0FBb0M7QUFDaEosU0FBUyxTQUFTLHVCQUF1QjtBQUN6QyxTQUFTLGdCQUFnQixvQkFBb0IscUJBQXFCO0FBQ2xFLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLGlCQUFpQiw2QkFBK0M7QUFDekUsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw2QkFBNkIscUJBQXFCO0FBSTNEO0FBQUEsRUFDQztBQUFBLEVBQ0E7QUFBQSxFQUNBLFNBQVMsK0JBQStCLDBEQUEwRDtBQUNuRztBQUVBLE1BQU0sNkNBQTZDO0FBQ25ELE1BQU0sK0NBQStDO0FBRXJELE1BQU0sMEJBQTBCO0FBQUEsRUFDL0IsU0FBUyxJQUFJLGNBQXVCLHlCQUF5QixPQUFPLFNBQVMseUJBQXlCLDJDQUEyQyxDQUFDO0FBQUEsRUFDbEosZUFBZSxJQUFJLGNBQXVCLCtCQUErQixPQUFPLFNBQVMsK0JBQStCLG1EQUFtRCxDQUFDO0FBQzdLO0FBRU8sTUFBTSx1QkFBdUIsZ0JBQXNDLHFCQUFxQjtBQXlCL0YsSUFBTSxzQkFBTixjQUFrQyxXQUEyQztB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RCxRQUFJLHlCQUF5QixxQkFBcUI7QUFDakQsb0JBQWMsY0FBYztBQUFBLElBQzdCO0FBQUEsRUFDRDtBQUNELENBQUM7QUFFRCxnQkFBZ0IsY0FBYyxRQUFRO0FBQUEsRUFDckMsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sVUFBVSxpQ0FBaUMsZ0JBQWdCO0FBQUEsTUFDbEUsY0FBYyxlQUFlLElBQUksd0JBQXdCLFNBQVMsd0JBQXdCLGNBQWMsT0FBTyxDQUFDO0FBQUEsTUFDaEgsWUFBWTtBQUFBLFFBQ1g7QUFBQSxRQUNBLFNBQVMsUUFBUTtBQUFBLE1BQ2xCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsSUFBSSxVQUFrQztBQUNyQyxVQUFNLGdCQUFnQixTQUFTLElBQUksb0JBQW9CO0FBQ3ZELFFBQUkseUJBQXlCLHFCQUFxQjtBQUNqRCxVQUFJLENBQUMsY0FBYyxjQUFjLEdBQUc7QUFDbkMsc0JBQWMsZUFBZTtBQUFBLE1BQzlCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRCxDQUFDO0FBRUQsZ0JBQWdCLGNBQWMsUUFBUTtBQUFBLEVBQ3JDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUsd0JBQXdCLHdCQUF3QjtBQUFBLE1BQ2pFLGNBQWMsd0JBQXdCO0FBQUEsTUFDdEMsWUFBWTtBQUFBLFFBQ1g7QUFBQSxRQUNBLFNBQVMsUUFBUTtBQUFBLFFBQ2pCLFdBQVcsQ0FBQyxPQUFPLFVBQVUsUUFBUSxNQUFNO0FBQUEsTUFDNUM7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxJQUFJLFVBQWtDO0FBQ3JDLFVBQU0sZ0JBQWdCLFNBQVMsSUFBSSxvQkFBb0I7QUFDdkQsUUFBSSx5QkFBeUIscUJBQXFCO0FBQ2pELG9CQUFjLGVBQWU7QUFBQSxJQUM5QjtBQUFBLEVBQ0Q7QUFDRCxDQUFDO0FBRUQsZ0JBQWdCLGNBQWMsUUFBUTtBQUFBLEVBQ3JDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUseUJBQXlCLHlCQUF5QjtBQUFBLE1BQ25FLGNBQWMsd0JBQXdCO0FBQUEsTUFDdEMsWUFBWTtBQUFBLFFBQ1g7QUFBQSxRQUNBLFNBQVMsT0FBTyxVQUFVLFFBQVE7QUFBQSxNQUNuQztBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLElBQUksVUFBa0M7QUFDckMsVUFBTSxnQkFBZ0IsU0FBUyxJQUFJLG9CQUFvQjtBQUN2RCxRQUFJLHlCQUF5QixxQkFBcUI7QUFDakQsb0JBQWMsZUFBZSxJQUFJO0FBQUEsSUFDbEM7QUFBQSxFQUNEO0FBQ0QsQ0FBQzsiLAogICJuYW1lcyI6IFsiY29udGFpbmVyIl0KfQo=
