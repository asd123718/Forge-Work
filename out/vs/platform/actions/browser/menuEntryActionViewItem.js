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
import { asCSSUrl } from "../../../base/browser/cssValue.js";
import { $, addDisposableListener, append, EventType, ModifierKeyEmitter, prepend } from "../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../base/browser/keyboardEvent.js";
import { ActionViewItem, BaseActionViewItem, SelectActionViewItem } from "../../../base/browser/ui/actionbar/actionViewItems.js";
import { DropdownMenuActionViewItem } from "../../../base/browser/ui/dropdown/dropdownActionViewItem.js";
import { SeparatorSelectOption } from "../../../base/browser/ui/selectBox/selectBox.js";
import { ActionRunner, Separator, SubmenuAction } from "../../../base/common/actions.js";
import { UILabelProvider } from "../../../base/common/keybindingLabels.js";
import { KeyCode } from "../../../base/common/keyCodes.js";
import { combinedDisposable, DisposableStore, MutableDisposable, toDisposable } from "../../../base/common/lifecycle.js";
import { isLinux, isWindows, OS } from "../../../base/common/platform.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { assertType } from "../../../base/common/types.js";
import { localize } from "../../../nls.js";
import { IAccessibilityService } from "../../accessibility/common/accessibility.js";
import { isICommandActionToggleInfo } from "../../action/common/action.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { ICommandService } from "../../commands/common/commands.js";
import { IContextKeyService } from "../../contextkey/common/contextkey.js";
import { IContextMenuService, IContextViewService } from "../../contextview/browser/contextView.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { IKeybindingService } from "../../keybinding/common/keybinding.js";
import { INotificationService } from "../../notification/common/notification.js";
import { IStorageService, StorageScope, StorageTarget } from "../../storage/common/storage.js";
import { defaultSelectBoxStyles } from "../../theme/browser/defaultStyles.js";
import { asCssVariable, selectBorder } from "../../theme/common/colorRegistry.js";
import { triggerClickAnimation } from "../../../base/browser/ui/animations/animations.js";
import { isDark } from "../../theme/common/theme.js";
import { IThemeService } from "../../theme/common/themeService.js";
import { hasNativeContextMenu } from "../../window/common/window.js";
import { IMenuService, MenuItemAction, SubmenuItemAction } from "../common/actions.js";
import "./menuEntryActionViewItem.css";
function getContextMenuActions(groups, primaryGroup) {
  const target = { primary: [], secondary: [] };
  getContextMenuActionsImpl(groups, target, primaryGroup);
  return target;
}
function getFlatContextMenuActions(groups, primaryGroup) {
  const target = [];
  getContextMenuActionsImpl(groups, target, primaryGroup);
  return target;
}
function getContextMenuActionsImpl(groups, target, primaryGroup) {
  const modifierKeyEmitter = ModifierKeyEmitter.getInstance();
  const useAlternativeActions = modifierKeyEmitter.keyStatus.altKey || (isWindows || isLinux) && modifierKeyEmitter.keyStatus.shiftKey;
  fillInActions(groups, target, useAlternativeActions, primaryGroup ? (actionGroup) => actionGroup === primaryGroup : (actionGroup) => actionGroup === "navigation");
}
function getActionBarActions(groups, primaryGroup, shouldInlineSubmenu, useSeparatorsInPrimaryActions) {
  const target = { primary: [], secondary: [] };
  fillInActionBarActions(groups, target, primaryGroup, shouldInlineSubmenu, useSeparatorsInPrimaryActions);
  return target;
}
function getFlatActionBarActions(groups, primaryGroup, shouldInlineSubmenu, useSeparatorsInPrimaryActions) {
  const target = [];
  fillInActionBarActions(groups, target, primaryGroup, shouldInlineSubmenu, useSeparatorsInPrimaryActions);
  return target;
}
function fillInActionBarActions(groups, target, primaryGroup, shouldInlineSubmenu, useSeparatorsInPrimaryActions) {
  const isPrimaryAction = typeof primaryGroup === "string" ? (actionGroup) => actionGroup === primaryGroup : primaryGroup;
  fillInActions(groups, target, false, isPrimaryAction, shouldInlineSubmenu, useSeparatorsInPrimaryActions);
}
function fillInActions(groups, target, useAlternativeActions, isPrimaryAction = (actionGroup) => actionGroup === "navigation", shouldInlineSubmenu = () => false, useSeparatorsInPrimaryActions = false) {
  let primaryBucket;
  let secondaryBucket;
  if (Array.isArray(target)) {
    primaryBucket = target;
    secondaryBucket = target;
  } else {
    primaryBucket = target.primary;
    secondaryBucket = target.secondary;
  }
  const submenuInfo = /* @__PURE__ */ new Set();
  for (const [group, actions] of groups) {
    let target2;
    if (isPrimaryAction(group)) {
      target2 = primaryBucket;
      if (target2.length > 0 && useSeparatorsInPrimaryActions) {
        target2.push(new Separator());
      }
    } else {
      target2 = secondaryBucket;
      if (target2.length > 0) {
        target2.push(new Separator());
      }
    }
    for (let action of actions) {
      if (useAlternativeActions) {
        action = action instanceof MenuItemAction && action.alt ? action.alt : action;
      }
      const newLen = target2.push(action);
      if (action instanceof SubmenuAction) {
        submenuInfo.add({ group, action, index: newLen - 1 });
      }
    }
  }
  for (const { group, action, index } of submenuInfo) {
    const target2 = isPrimaryAction(group) ? primaryBucket : secondaryBucket;
    const submenuActions = action.actions;
    if (shouldInlineSubmenu(action, group, target2.length)) {
      target2.splice(index, 1, ...submenuActions);
    }
  }
}
let MenuEntryActionViewItem = class extends ActionViewItem {
  constructor(action, _options, _keybindingService, _notificationService, _contextKeyService, _themeService, _contextMenuService, _accessibilityService) {
    super(void 0, action, { icon: !!(action.class || action.item.icon), label: !action.class && !action.item.icon, draggable: _options?.draggable, keybinding: _options?.keybinding, hoverDelegate: _options?.hoverDelegate, keybindingNotRenderedWithLabel: _options?.keybindingNotRenderedWithLabel });
    this._options = _options;
    this._keybindingService = _keybindingService;
    this._notificationService = _notificationService;
    this._contextKeyService = _contextKeyService;
    this._themeService = _themeService;
    this._contextMenuService = _contextMenuService;
    this._accessibilityService = _accessibilityService;
    this._wantsAltCommand = false;
    this._itemClassDispose = this._register(new MutableDisposable());
    this._altKey = ModifierKeyEmitter.getInstance();
  }
  get _menuItemAction() {
    return this._action;
  }
  get _commandAction() {
    return this._wantsAltCommand && this._menuItemAction.alt || this._menuItemAction;
  }
  async onClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (this._options?.onClickAnimation && this.element && !this._accessibilityService.isMotionReduced()) {
      const icon = this._menuItemAction.item.icon;
      triggerClickAnimation(this.element, this._options.onClickAnimation, ThemeIcon.isThemeIcon(icon) ? icon : void 0);
    }
    try {
      await this.actionRunner.run(this._commandAction, this._context);
    } catch (err) {
      this._notificationService.error(err);
    }
  }
  render(container) {
    super.render(container);
    container.classList.add("menu-entry");
    if (this.options.icon) {
      this._updateItemClass(this._menuItemAction.item);
    }
    if (this._menuItemAction.alt) {
      let isMouseOver = false;
      const updateAltState = () => {
        const wantsAltCommand = !!this._menuItemAction.alt?.enabled && (!this._accessibilityService.isMotionReduced() || isMouseOver) && (this._altKey.keyStatus.altKey || this._altKey.keyStatus.shiftKey && isMouseOver);
        if (wantsAltCommand !== this._wantsAltCommand) {
          this._wantsAltCommand = wantsAltCommand;
          this.updateLabel();
          this.updateTooltip();
          this.updateClass();
        }
      };
      this._register(this._altKey.event(updateAltState));
      this._register(addDisposableListener(container, "mouseleave", (_) => {
        isMouseOver = false;
        updateAltState();
      }));
      this._register(addDisposableListener(container, "mouseenter", (_) => {
        isMouseOver = true;
        updateAltState();
      }));
      updateAltState();
    }
  }
  updateLabel() {
    if (this.options.label && this.label) {
      this.label.textContent = this._commandAction.label;
    }
  }
  getTooltip() {
    const tooltip = this._commandAction.tooltip || this._commandAction.label;
    let title = this._keybindingService.appendKeybinding(tooltip, this._commandAction.id, this._contextKeyService);
    if (!this._wantsAltCommand && this._menuItemAction.alt?.enabled) {
      const altTooltip = this._menuItemAction.alt.tooltip || this._menuItemAction.alt.label;
      const altTitleSection = this._keybindingService.appendKeybinding(altTooltip, this._menuItemAction.alt.id, this._contextKeyService);
      title = localize("titleAndKbAndAlt", "{0}\n[{1}] {2}", title, UILabelProvider.modifierLabels[OS].altKey, altTitleSection);
    }
    return title;
  }
  updateClass() {
    if (this.options.icon) {
      if (this._commandAction !== this._menuItemAction) {
        if (this._menuItemAction.alt) {
          this._updateItemClass(this._menuItemAction.alt.item);
        }
      } else {
        this._updateItemClass(this._menuItemAction.item);
      }
    }
  }
  _updateItemClass(item) {
    this._itemClassDispose.value = void 0;
    const { element, label } = this;
    if (!element || !label) {
      return;
    }
    const icon = this._commandAction.checked && isICommandActionToggleInfo(item.toggled) && item.toggled.icon ? item.toggled.icon : item.icon;
    if (!icon) {
      return;
    }
    if (ThemeIcon.isThemeIcon(icon)) {
      const iconClasses = ThemeIcon.asClassNameArray(icon);
      label.classList.add(...iconClasses);
      this._itemClassDispose.value = toDisposable(() => {
        label.classList.remove(...iconClasses);
      });
    } else {
      label.style.backgroundImage = isDark(this._themeService.getColorTheme().type) ? asCSSUrl(icon.dark) : asCSSUrl(icon.light);
      label.classList.add("icon");
      this._itemClassDispose.value = combinedDisposable(
        toDisposable(() => {
          label.style.backgroundImage = "";
          label.classList.remove("icon");
        }),
        this._themeService.onDidColorThemeChange(() => {
          this.updateClass();
        })
      );
    }
  }
};
MenuEntryActionViewItem = __decorateClass([
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IAccessibilityService)
], MenuEntryActionViewItem);
class TextOnlyMenuEntryActionViewItem extends MenuEntryActionViewItem {
  render(container) {
    this.options.label = true;
    this.options.icon = false;
    super.render(container);
    container.classList.add("text-only");
    container.classList.toggle("use-comma", this._options?.useComma ?? false);
  }
  updateLabel() {
    const kb = this._keybindingService.lookupKeybinding(this._action.id, this._contextKeyService);
    if (!kb) {
      return super.updateLabel();
    }
    if (this.label) {
      const kb2 = TextOnlyMenuEntryActionViewItem._symbolPrintEnter(kb);
      if (this._options?.conversational) {
        this.label.textContent = localize({ key: "content2", comment: ['A label with keybindg like "ESC to dismiss"'] }, "{1} to {0}", this._action.label, kb2);
      } else {
        this.label.textContent = localize({ key: "content", comment: ["A label", "A keybinding"] }, "{0} ({1})", this._action.label, kb2);
      }
    }
  }
  static _symbolPrintEnter(kb) {
    return kb.getLabel()?.replace(/\benter\b/gi, "\u23CE").replace(/\bEscape\b/gi, "Esc");
  }
}
let SubmenuEntryActionViewItem = class extends DropdownMenuActionViewItem {
  constructor(action, options, _keybindingService, _contextMenuService, _themeService) {
    const dropdownOptions = {
      ...options,
      menuAsChild: options?.menuAsChild ?? false,
      classNames: options?.classNames ?? (ThemeIcon.isThemeIcon(action.item.icon) ? ThemeIcon.asClassName(action.item.icon) : void 0),
      keybindingProvider: options?.keybindingProvider ?? ((action2) => _keybindingService.lookupKeybinding(action2.id))
    };
    super(action, { getActions: () => action.actions }, _contextMenuService, dropdownOptions);
    this._keybindingService = _keybindingService;
    this._contextMenuService = _contextMenuService;
    this._themeService = _themeService;
  }
  render(container) {
    super.render(container);
    assertType(this.element);
    container.classList.add("menu-entry");
    const action = this._action;
    const { icon } = action.item;
    if (icon && !ThemeIcon.isThemeIcon(icon)) {
      this.element.classList.add("icon");
      const setBackgroundImage = () => {
        if (this.element) {
          this.element.style.backgroundImage = isDark(this._themeService.getColorTheme().type) ? asCSSUrl(icon.dark) : asCSSUrl(icon.light);
        }
      };
      setBackgroundImage();
      this._register(this._themeService.onDidColorThemeChange(() => {
        setBackgroundImage();
      }));
    }
  }
};
SubmenuEntryActionViewItem = __decorateClass([
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IThemeService)
], SubmenuEntryActionViewItem);
let DropdownWithDefaultActionViewItem = class extends BaseActionViewItem {
  constructor(submenuAction, options, _keybindingService, _notificationService, _contextMenuService, _menuService, _instaService, _storageService, _commandService) {
    super(null, submenuAction);
    this._keybindingService = _keybindingService;
    this._notificationService = _notificationService;
    this._contextMenuService = _contextMenuService;
    this._menuService = _menuService;
    this._instaService = _instaService;
    this._storageService = _storageService;
    this._commandService = _commandService;
    this._defaultActionDisposables = this._register(new DisposableStore());
    this._container = null;
    this._primaryActionListener = this._register(new MutableDisposable());
    this._options = options;
    this._storageKey = `${submenuAction.item.submenu.id}_lastActionId`;
    let defaultAction;
    const defaultActionId = options?.togglePrimaryAction ? _storageService.get(this._storageKey, StorageScope.WORKSPACE) : void 0;
    if (defaultActionId) {
      defaultAction = submenuAction.actions.find((a) => defaultActionId === a.id && this._canBePrimaryAction(a));
    }
    if (!defaultAction) {
      defaultAction = submenuAction.actions.find((action) => this._canBePrimaryAction(action)) ?? submenuAction.actions[0];
    }
    this._defaultAction = this._defaultActionDisposables.add(this._instaService.createInstance(MenuEntryActionViewItem, defaultAction, { keybinding: this._getDefaultActionKeybindingLabel(defaultAction), hoverDelegate: options?.hoverDelegate }));
    const dropdownOptions = {
      keybindingProvider: (action) => this._keybindingService.lookupKeybinding(action.id),
      ...options,
      menuAsChild: options?.menuAsChild ?? true,
      classNames: options?.classNames ?? ["codicon", "codicon-chevron-down"],
      actionRunner: options?.actionRunner ?? this._register(new ActionRunner())
    };
    this._dropdown = this._register(new DropdownMenuActionViewItem(submenuAction, submenuAction.actions, this._contextMenuService, dropdownOptions));
    if (options?.togglePrimaryAction) {
      this.registerTogglePrimaryActionListener();
    }
  }
  get onDidChangeDropdownVisibility() {
    return this._dropdown.onDidChangeVisibility;
  }
  registerTogglePrimaryActionListener() {
    this._primaryActionListener.value = this._options?.primaryActionIds?.length ? this._commandService.onDidExecuteCommand((event) => {
      const action = this._action.actions.find((action2) => action2.id === event.commandId);
      if (action instanceof MenuItemAction && this._canBePrimaryAction(action)) {
        this.update(action);
      }
    }) : this._dropdown.actionRunner.onDidRun((e) => {
      if (e.action instanceof MenuItemAction) {
        this.update(e.action);
      }
    });
  }
  update(lastAction) {
    if (!this._canBePrimaryAction(lastAction)) {
      return;
    }
    if (this._options?.togglePrimaryAction) {
      if (this._storageService.get(this._storageKey, StorageScope.WORKSPACE) !== lastAction.id) {
        this._storageService.store(this._storageKey, lastAction.id, StorageScope.WORKSPACE, StorageTarget.MACHINE);
      }
    }
    if (this._defaultAction.action.id === lastAction.id) {
      return;
    }
    this._defaultActionDisposables.clear();
    this._defaultAction = this._defaultActionDisposables.add(this._instaService.createInstance(MenuEntryActionViewItem, lastAction, { keybinding: this._getDefaultActionKeybindingLabel(lastAction), hoverDelegate: this._options?.hoverDelegate }));
    this._defaultAction.actionRunner = this._defaultActionDisposables.add(new class extends ActionRunner {
      async runAction(action, context) {
        await action.run(void 0);
      }
    }());
    if (this._container) {
      this._defaultAction.render(prepend(this._container, $(".action-container")));
    }
  }
  _canBePrimaryAction(action) {
    return !this._options?.primaryActionIds?.length || this._options.primaryActionIds.includes(action.id);
  }
  _getDefaultActionKeybindingLabel(defaultAction) {
    let defaultActionKeybinding;
    if (this._options?.renderKeybindingWithDefaultActionLabel) {
      const kb = this._keybindingService.lookupKeybinding(defaultAction.id);
      if (kb) {
        defaultActionKeybinding = `(${kb.getLabel()})`;
      }
    }
    return defaultActionKeybinding;
  }
  setActionContext(newContext) {
    super.setActionContext(newContext);
    this._defaultAction.setActionContext(newContext);
    this._dropdown.setActionContext(newContext);
  }
  set actionRunner(actionRunner) {
    super.actionRunner = actionRunner;
    this._defaultAction.actionRunner = actionRunner;
    if (!this._options?.togglePrimaryAction || this._options.primaryActionIds?.length) {
      this._dropdown.actionRunner = actionRunner;
    }
  }
  get actionRunner() {
    return super.actionRunner;
  }
  render(container) {
    this._container = container;
    super.render(this._container);
    this._container.classList.add("monaco-dropdown-with-default");
    const primaryContainer = $(".action-container");
    this._defaultAction.render(append(this._container, primaryContainer));
    this._register(addDisposableListener(primaryContainer, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.RightArrow)) {
        this._defaultAction.element.tabIndex = -1;
        this._dropdown.focus();
        event.stopPropagation();
      }
    }));
    const dropdownContainer = $(".dropdown-action-container");
    this._dropdown.render(append(this._container, dropdownContainer));
    this._register(addDisposableListener(dropdownContainer, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.LeftArrow)) {
        this._defaultAction.element.tabIndex = 0;
        this._dropdown.setFocusable(false);
        this._defaultAction.element?.focus();
        event.stopPropagation();
      }
    }));
  }
  focus(fromRight) {
    if (fromRight) {
      this._dropdown.focus();
    } else {
      this._defaultAction.element.tabIndex = 0;
      this._defaultAction.element.focus();
    }
  }
  blur() {
    this._defaultAction.element.tabIndex = -1;
    this._dropdown.blur();
    this._container.blur();
  }
  setFocusable(focusable) {
    if (focusable) {
      this._defaultAction.element.tabIndex = 0;
    } else {
      this._defaultAction.element.tabIndex = -1;
      this._dropdown.setFocusable(false);
    }
  }
};
DropdownWithDefaultActionViewItem = __decorateClass([
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IMenuService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, ICommandService)
], DropdownWithDefaultActionViewItem);
let SubmenuEntrySelectActionViewItem = class extends SelectActionViewItem {
  constructor(action, contextViewService, configurationService) {
    super(null, action, action.actions.map((a) => a.id === Separator.ID ? SeparatorSelectOption : { text: a.label, isDisabled: !a.enabled }), 0, contextViewService, defaultSelectBoxStyles, { ariaLabel: action.tooltip || action.label, optionsAsChildren: true, useCustomDrawn: !hasNativeContextMenu(configurationService) });
    this.select(Math.max(0, action.actions.findIndex((a) => a.checked)));
  }
  render(container) {
    super.render(container);
    container.style.borderColor = asCssVariable(selectBorder);
  }
  runAction(option, index) {
    const action = this.action.actions[index];
    if (action) {
      this.actionRunner.run(action);
    }
  }
};
SubmenuEntrySelectActionViewItem = __decorateClass([
  __decorateParam(1, IContextViewService),
  __decorateParam(2, IConfigurationService)
], SubmenuEntrySelectActionViewItem);
function createActionViewItem(instaService, action, options) {
  if (action instanceof MenuItemAction) {
    return instaService.createInstance(MenuEntryActionViewItem, action, options);
  } else if (action instanceof SubmenuItemAction) {
    if (action.item.isSelection) {
      return instaService.createInstance(SubmenuEntrySelectActionViewItem, action);
    } else if (action.item.isSplitButton) {
      return instaService.createInstance(DropdownWithDefaultActionViewItem, action, {
        ...options,
        togglePrimaryAction: typeof action.item.isSplitButton !== "boolean" ? action.item.isSplitButton.togglePrimaryAction : false,
        primaryActionIds: typeof action.item.isSplitButton !== "boolean" ? action.item.isSplitButton.primaryActionIds : void 0
      });
    } else {
      return instaService.createInstance(SubmenuEntryActionViewItem, action, options);
    }
  } else {
    return void 0;
  }
}
export {
  DropdownWithDefaultActionViewItem,
  MenuEntryActionViewItem,
  SubmenuEntryActionViewItem,
  TextOnlyMenuEntryActionViewItem,
  createActionViewItem,
  fillInActionBarActions,
  getActionBarActions,
  getContextMenuActions,
  getFlatActionBarActions,
  getFlatContextMenuActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWN0aW9uc1xcYnJvd3NlclxcbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBhc0NTU1VybCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9jc3NWYWx1ZS5qcyc7XG5pbXBvcnQgeyAkLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGFwcGVuZCwgRXZlbnRUeXBlLCBNb2RpZmllcktleUVtaXR0ZXIsIHByZXBlbmQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IEFjdGlvblZpZXdJdGVtLCBCYXNlQWN0aW9uVmlld0l0ZW0sIFNlbGVjdEFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0sIElEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZHJvcGRvd24vZHJvcGRvd25BY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlLmpzJztcbmltcG9ydCB7IFNlcGFyYXRvclNlbGVjdE9wdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zZWxlY3RCb3gvc2VsZWN0Qm94LmpzJztcbmltcG9ydCB7IEFjdGlvblJ1bm5lciwgSUFjdGlvbiwgSUFjdGlvblJ1bm5lciwgSVJ1bkV2ZW50LCBTZXBhcmF0b3IsIFN1Ym1lbnVBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgVUlMYWJlbFByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24va2V5YmluZGluZ0xhYmVscy5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEtleWJpbmRpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXliaW5kaW5ncy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgY29tYmluZWREaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNMaW51eCwgaXNXaW5kb3dzLCBPUyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZEFjdGlvbiwgaXNJQ29tbWFuZEFjdGlvblRvZ2dsZUluZm8gfSBmcm9tICcuLi8uLi9hY3Rpb24vY29tbW9uL2FjdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UsIElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0U2VsZWN0Qm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IGFzQ3NzVmFyaWFibGUsIHNlbGVjdEJvcmRlciB9IGZyb20gJy4uLy4uL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENsaWNrQW5pbWF0aW9uLCB0cmlnZ2VyQ2xpY2tBbmltYXRpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYW5pbWF0aW9ucy9hbmltYXRpb25zLmpzJztcbmltcG9ydCB7IGlzRGFyayB9IGZyb20gJy4uLy4uL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBoYXNOYXRpdmVDb250ZXh0TWVudSB9IGZyb20gJy4uLy4uL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IElNZW51U2VydmljZSwgTWVudUl0ZW1BY3Rpb24sIFN1Ym1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0ICcuL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmNzcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJpbWFyeUFuZFNlY29uZGFyeUFjdGlvbnMge1xuXHRwcmltYXJ5OiBJQWN0aW9uW107XG5cdHNlY29uZGFyeTogSUFjdGlvbltdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29udGV4dE1lbnVBY3Rpb25zKFxuXHRncm91cHM6IFJlYWRvbmx5QXJyYXk8W3N0cmluZywgUmVhZG9ubHlBcnJheTxNZW51SXRlbUFjdGlvbiB8IFN1Ym1lbnVJdGVtQWN0aW9uPl0+LFxuXHRwcmltYXJ5R3JvdXA/OiBzdHJpbmdcbik6IFByaW1hcnlBbmRTZWNvbmRhcnlBY3Rpb25zIHtcblx0Y29uc3QgdGFyZ2V0OiBQcmltYXJ5QW5kU2Vjb25kYXJ5QWN0aW9ucyA9IHsgcHJpbWFyeTogW10sIHNlY29uZGFyeTogW10gfTtcblx0Z2V0Q29udGV4dE1lbnVBY3Rpb25zSW1wbChncm91cHMsIHRhcmdldCwgcHJpbWFyeUdyb3VwKTtcblx0cmV0dXJuIHRhcmdldDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZsYXRDb250ZXh0TWVudUFjdGlvbnMoXG5cdGdyb3VwczogUmVhZG9ubHlBcnJheTxbc3RyaW5nLCBSZWFkb25seUFycmF5PE1lbnVJdGVtQWN0aW9uIHwgU3VibWVudUl0ZW1BY3Rpb24+XT4sXG5cdHByaW1hcnlHcm91cD86IHN0cmluZ1xuKTogSUFjdGlvbltdIHtcblx0Y29uc3QgdGFyZ2V0OiBJQWN0aW9uW10gPSBbXTtcblx0Z2V0Q29udGV4dE1lbnVBY3Rpb25zSW1wbChncm91cHMsIHRhcmdldCwgcHJpbWFyeUdyb3VwKTtcblx0cmV0dXJuIHRhcmdldDtcbn1cblxuZnVuY3Rpb24gZ2V0Q29udGV4dE1lbnVBY3Rpb25zSW1wbChcblx0Z3JvdXBzOiBSZWFkb25seUFycmF5PFtzdHJpbmcsIFJlYWRvbmx5QXJyYXk8TWVudUl0ZW1BY3Rpb24gfCBTdWJtZW51SXRlbUFjdGlvbj5dPixcblx0dGFyZ2V0OiBJQWN0aW9uW10gfCBQcmltYXJ5QW5kU2Vjb25kYXJ5QWN0aW9ucyxcblx0cHJpbWFyeUdyb3VwPzogc3RyaW5nXG4pIHtcblx0Y29uc3QgbW9kaWZpZXJLZXlFbWl0dGVyID0gTW9kaWZpZXJLZXlFbWl0dGVyLmdldEluc3RhbmNlKCk7XG5cdGNvbnN0IHVzZUFsdGVybmF0aXZlQWN0aW9ucyA9IG1vZGlmaWVyS2V5RW1pdHRlci5rZXlTdGF0dXMuYWx0S2V5IHx8ICgoaXNXaW5kb3dzIHx8IGlzTGludXgpICYmIG1vZGlmaWVyS2V5RW1pdHRlci5rZXlTdGF0dXMuc2hpZnRLZXkpO1xuXHRmaWxsSW5BY3Rpb25zKGdyb3VwcywgdGFyZ2V0LCB1c2VBbHRlcm5hdGl2ZUFjdGlvbnMsIHByaW1hcnlHcm91cCA/IGFjdGlvbkdyb3VwID0+IGFjdGlvbkdyb3VwID09PSBwcmltYXJ5R3JvdXAgOiBhY3Rpb25Hcm91cCA9PiBhY3Rpb25Hcm91cCA9PT0gJ25hdmlnYXRpb24nKTtcbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0QWN0aW9uQmFyQWN0aW9ucyhcblx0Z3JvdXBzOiBbc3RyaW5nLCBBcnJheTxNZW51SXRlbUFjdGlvbiB8IFN1Ym1lbnVJdGVtQWN0aW9uPl1bXSxcblx0cHJpbWFyeUdyb3VwPzogc3RyaW5nIHwgKChhY3Rpb25Hcm91cDogc3RyaW5nKSA9PiBib29sZWFuKSxcblx0c2hvdWxkSW5saW5lU3VibWVudT86IChhY3Rpb246IFN1Ym1lbnVBY3Rpb24sIGdyb3VwOiBzdHJpbmcsIGdyb3VwU2l6ZTogbnVtYmVyKSA9PiBib29sZWFuLFxuXHR1c2VTZXBhcmF0b3JzSW5QcmltYXJ5QWN0aW9ucz86IGJvb2xlYW5cbik6IFByaW1hcnlBbmRTZWNvbmRhcnlBY3Rpb25zIHtcblx0Y29uc3QgdGFyZ2V0OiBQcmltYXJ5QW5kU2Vjb25kYXJ5QWN0aW9ucyA9IHsgcHJpbWFyeTogW10sIHNlY29uZGFyeTogW10gfTtcblx0ZmlsbEluQWN0aW9uQmFyQWN0aW9ucyhncm91cHMsIHRhcmdldCwgcHJpbWFyeUdyb3VwLCBzaG91bGRJbmxpbmVTdWJtZW51LCB1c2VTZXBhcmF0b3JzSW5QcmltYXJ5QWN0aW9ucyk7XG5cdHJldHVybiB0YXJnZXQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRGbGF0QWN0aW9uQmFyQWN0aW9ucyhcblx0Z3JvdXBzOiBbc3RyaW5nLCBBcnJheTxNZW51SXRlbUFjdGlvbiB8IFN1Ym1lbnVJdGVtQWN0aW9uPl1bXSxcblx0cHJpbWFyeUdyb3VwPzogc3RyaW5nIHwgKChhY3Rpb25Hcm91cDogc3RyaW5nKSA9PiBib29sZWFuKSxcblx0c2hvdWxkSW5saW5lU3VibWVudT86IChhY3Rpb246IFN1Ym1lbnVBY3Rpb24sIGdyb3VwOiBzdHJpbmcsIGdyb3VwU2l6ZTogbnVtYmVyKSA9PiBib29sZWFuLFxuXHR1c2VTZXBhcmF0b3JzSW5QcmltYXJ5QWN0aW9ucz86IGJvb2xlYW5cbik6IElBY3Rpb25bXSB7XG5cdGNvbnN0IHRhcmdldDogSUFjdGlvbltdID0gW107XG5cdGZpbGxJbkFjdGlvbkJhckFjdGlvbnMoZ3JvdXBzLCB0YXJnZXQsIHByaW1hcnlHcm91cCwgc2hvdWxkSW5saW5lU3VibWVudSwgdXNlU2VwYXJhdG9yc0luUHJpbWFyeUFjdGlvbnMpO1xuXHRyZXR1cm4gdGFyZ2V0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmlsbEluQWN0aW9uQmFyQWN0aW9ucyhcblx0Z3JvdXBzOiBbc3RyaW5nLCBBcnJheTxNZW51SXRlbUFjdGlvbiB8IFN1Ym1lbnVJdGVtQWN0aW9uPl1bXSxcblx0dGFyZ2V0OiBJQWN0aW9uW10gfCBQcmltYXJ5QW5kU2Vjb25kYXJ5QWN0aW9ucyxcblx0cHJpbWFyeUdyb3VwPzogc3RyaW5nIHwgKChhY3Rpb25Hcm91cDogc3RyaW5nKSA9PiBib29sZWFuKSxcblx0c2hvdWxkSW5saW5lU3VibWVudT86IChhY3Rpb246IFN1Ym1lbnVBY3Rpb24sIGdyb3VwOiBzdHJpbmcsIGdyb3VwU2l6ZTogbnVtYmVyKSA9PiBib29sZWFuLFxuXHR1c2VTZXBhcmF0b3JzSW5QcmltYXJ5QWN0aW9ucz86IGJvb2xlYW5cbik6IHZvaWQge1xuXHRjb25zdCBpc1ByaW1hcnlBY3Rpb24gPSB0eXBlb2YgcHJpbWFyeUdyb3VwID09PSAnc3RyaW5nJyA/IChhY3Rpb25Hcm91cDogc3RyaW5nKSA9PiBhY3Rpb25Hcm91cCA9PT0gcHJpbWFyeUdyb3VwIDogcHJpbWFyeUdyb3VwO1xuXG5cdC8vIEFjdGlvbiBiYXJzIGhhbmRsZSBhbHRlcm5hdGl2ZSBhY3Rpb25zIG9uIHRoZWlyIG93biBzbyB0aGUgYWx0ZXJuYXRpdmUgYWN0aW9ucyBzaG91bGQgYmUgaWdub3JlZFxuXHRmaWxsSW5BY3Rpb25zKGdyb3VwcywgdGFyZ2V0LCBmYWxzZSwgaXNQcmltYXJ5QWN0aW9uLCBzaG91bGRJbmxpbmVTdWJtZW51LCB1c2VTZXBhcmF0b3JzSW5QcmltYXJ5QWN0aW9ucyk7XG59XG5cbmZ1bmN0aW9uIGZpbGxJbkFjdGlvbnMoXG5cdGdyb3VwczogUmVhZG9ubHlBcnJheTxbc3RyaW5nLCBSZWFkb25seUFycmF5PE1lbnVJdGVtQWN0aW9uIHwgU3VibWVudUl0ZW1BY3Rpb24+XT4sXG5cdHRhcmdldDogSUFjdGlvbltdIHwgUHJpbWFyeUFuZFNlY29uZGFyeUFjdGlvbnMsXG5cdHVzZUFsdGVybmF0aXZlQWN0aW9uczogYm9vbGVhbixcblx0aXNQcmltYXJ5QWN0aW9uOiAoYWN0aW9uR3JvdXA6IHN0cmluZykgPT4gYm9vbGVhbiA9IGFjdGlvbkdyb3VwID0+IGFjdGlvbkdyb3VwID09PSAnbmF2aWdhdGlvbicsXG5cdHNob3VsZElubGluZVN1Ym1lbnU6IChhY3Rpb246IFN1Ym1lbnVBY3Rpb24sIGdyb3VwOiBzdHJpbmcsIGdyb3VwU2l6ZTogbnVtYmVyKSA9PiBib29sZWFuID0gKCkgPT4gZmFsc2UsXG5cdHVzZVNlcGFyYXRvcnNJblByaW1hcnlBY3Rpb25zOiBib29sZWFuID0gZmFsc2Vcbik6IHZvaWQge1xuXG5cdGxldCBwcmltYXJ5QnVja2V0OiBJQWN0aW9uW107XG5cdGxldCBzZWNvbmRhcnlCdWNrZXQ6IElBY3Rpb25bXTtcblx0aWYgKEFycmF5LmlzQXJyYXkodGFyZ2V0KSkge1xuXHRcdHByaW1hcnlCdWNrZXQgPSB0YXJnZXQ7XG5cdFx0c2Vjb25kYXJ5QnVja2V0ID0gdGFyZ2V0O1xuXHR9IGVsc2Uge1xuXHRcdHByaW1hcnlCdWNrZXQgPSB0YXJnZXQucHJpbWFyeTtcblx0XHRzZWNvbmRhcnlCdWNrZXQgPSB0YXJnZXQuc2Vjb25kYXJ5O1xuXHR9XG5cblx0Y29uc3Qgc3VibWVudUluZm8gPSBuZXcgU2V0PHsgZ3JvdXA6IHN0cmluZzsgYWN0aW9uOiBTdWJtZW51QWN0aW9uOyBpbmRleDogbnVtYmVyIH0+KCk7XG5cblx0Zm9yIChjb25zdCBbZ3JvdXAsIGFjdGlvbnNdIG9mIGdyb3Vwcykge1xuXG5cdFx0bGV0IHRhcmdldDogSUFjdGlvbltdO1xuXHRcdGlmIChpc1ByaW1hcnlBY3Rpb24oZ3JvdXApKSB7XG5cdFx0XHR0YXJnZXQgPSBwcmltYXJ5QnVja2V0O1xuXHRcdFx0aWYgKHRhcmdldC5sZW5ndGggPiAwICYmIHVzZVNlcGFyYXRvcnNJblByaW1hcnlBY3Rpb25zKSB7XG5cdFx0XHRcdHRhcmdldC5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRhcmdldCA9IHNlY29uZGFyeUJ1Y2tldDtcblx0XHRcdGlmICh0YXJnZXQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0YXJnZXQucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAobGV0IGFjdGlvbiBvZiBhY3Rpb25zKSB7XG5cdFx0XHRpZiAodXNlQWx0ZXJuYXRpdmVBY3Rpb25zKSB7XG5cdFx0XHRcdGFjdGlvbiA9IGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uICYmIGFjdGlvbi5hbHQgPyBhY3Rpb24uYWx0IDogYWN0aW9uO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbmV3TGVuID0gdGFyZ2V0LnB1c2goYWN0aW9uKTtcblx0XHRcdC8vIGtlZXAgc3VibWVudSBpbmZvIGZvciBsYXRlciBpbmxpbmluZ1xuXHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIFN1Ym1lbnVBY3Rpb24pIHtcblx0XHRcdFx0c3VibWVudUluZm8uYWRkKHsgZ3JvdXAsIGFjdGlvbiwgaW5kZXg6IG5ld0xlbiAtIDEgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8gYXNrIHRoZSBvdXRzaWRlIGlmIHN1Ym1lbnUgc2hvdWxkIGJlIGlubGluZWQgb3Igbm90LiBvbmx5IGFzayB3aGVuXG5cdC8vIHRoZXJlIHdvdWxkIGJlIGVub3VnaCBzcGFjZVxuXHRmb3IgKGNvbnN0IHsgZ3JvdXAsIGFjdGlvbiwgaW5kZXggfSBvZiBzdWJtZW51SW5mbykge1xuXHRcdGNvbnN0IHRhcmdldCA9IGlzUHJpbWFyeUFjdGlvbihncm91cCkgPyBwcmltYXJ5QnVja2V0IDogc2Vjb25kYXJ5QnVja2V0O1xuXG5cdFx0Ly8gaW5saW5pbmcgc3VibWVudXMgd2l0aCBsZW5ndGggMCBvciAxIGlzIGVhc3ksXG5cdFx0Ly8gbGFyZ2VyIHN1Ym1lbnVzIG5lZWQgdG8gYmUgY2hlY2tlZCB3aXRoIHRoZSBvdmVyYWxsIGxpbWl0XG5cdFx0Y29uc3Qgc3VibWVudUFjdGlvbnMgPSBhY3Rpb24uYWN0aW9ucztcblx0XHRpZiAoc2hvdWxkSW5saW5lU3VibWVudShhY3Rpb24sIGdyb3VwLCB0YXJnZXQubGVuZ3RoKSkge1xuXHRcdFx0dGFyZ2V0LnNwbGljZShpbmRleCwgMSwgLi4uc3VibWVudUFjdGlvbnMpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElNZW51RW50cnlBY3Rpb25WaWV3SXRlbU9wdGlvbnMge1xuXHRyZWFkb25seSBkcmFnZ2FibGU/OiBib29sZWFuO1xuXHRyZWFkb25seSBrZXliaW5kaW5nPzogc3RyaW5nIHwgbnVsbDtcblx0cmVhZG9ubHkgaG92ZXJEZWxlZ2F0ZT86IElIb3ZlckRlbGVnYXRlO1xuXHRyZWFkb25seSBrZXliaW5kaW5nTm90UmVuZGVyZWRXaXRoTGFiZWw/OiBib29sZWFuO1xuXHRyZWFkb25seSBvbkNsaWNrQW5pbWF0aW9uPzogQ2xpY2tBbmltYXRpb247XG59XG5cbmV4cG9ydCBjbGFzcyBNZW51RW50cnlBY3Rpb25WaWV3SXRlbTxUIGV4dGVuZHMgSU1lbnVFbnRyeUFjdGlvblZpZXdJdGVtT3B0aW9ucyA9IElNZW51RW50cnlBY3Rpb25WaWV3SXRlbU9wdGlvbnM+IGV4dGVuZHMgQWN0aW9uVmlld0l0ZW0ge1xuXG5cdHByaXZhdGUgX3dhbnRzQWx0Q29tbWFuZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pdGVtQ2xhc3NEaXNwb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hbHRLZXk6IE1vZGlmaWVyS2V5RW1pdHRlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IE1lbnVJdGVtQWN0aW9uLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBfb3B0aW9uczogVCB8IHVuZGVmaW5lZCxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2NvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIodW5kZWZpbmVkLCBhY3Rpb24sIHsgaWNvbjogISEoYWN0aW9uLmNsYXNzIHx8IGFjdGlvbi5pdGVtLmljb24pLCBsYWJlbDogIWFjdGlvbi5jbGFzcyAmJiAhYWN0aW9uLml0ZW0uaWNvbiwgZHJhZ2dhYmxlOiBfb3B0aW9ucz8uZHJhZ2dhYmxlLCBrZXliaW5kaW5nOiBfb3B0aW9ucz8ua2V5YmluZGluZywgaG92ZXJEZWxlZ2F0ZTogX29wdGlvbnM/LmhvdmVyRGVsZWdhdGUsIGtleWJpbmRpbmdOb3RSZW5kZXJlZFdpdGhMYWJlbDogX29wdGlvbnM/LmtleWJpbmRpbmdOb3RSZW5kZXJlZFdpdGhMYWJlbCB9KTtcblx0XHR0aGlzLl9hbHRLZXkgPSBNb2RpZmllcktleUVtaXR0ZXIuZ2V0SW5zdGFuY2UoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXQgX21lbnVJdGVtQWN0aW9uKCk6IE1lbnVJdGVtQWN0aW9uIHtcblx0XHRyZXR1cm4gPE1lbnVJdGVtQWN0aW9uPnRoaXMuX2FjdGlvbjtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXQgX2NvbW1hbmRBY3Rpb24oKTogTWVudUl0ZW1BY3Rpb24ge1xuXHRcdHJldHVybiB0aGlzLl93YW50c0FsdENvbW1hbmQgJiYgdGhpcy5fbWVudUl0ZW1BY3Rpb24uYWx0IHx8IHRoaXMuX21lbnVJdGVtQWN0aW9uO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgb25DbGljayhldmVudDogTW91c2VFdmVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cblx0XHRpZiAodGhpcy5fb3B0aW9ucz8ub25DbGlja0FuaW1hdGlvbiAmJiB0aGlzLmVsZW1lbnQgJiYgIXRoaXMuX2FjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzTW90aW9uUmVkdWNlZCgpKSB7XG5cdFx0XHRjb25zdCBpY29uID0gdGhpcy5fbWVudUl0ZW1BY3Rpb24uaXRlbS5pY29uO1xuXHRcdFx0dHJpZ2dlckNsaWNrQW5pbWF0aW9uKHRoaXMuZWxlbWVudCwgdGhpcy5fb3B0aW9ucy5vbkNsaWNrQW5pbWF0aW9uLCBUaGVtZUljb24uaXNUaGVtZUljb24oaWNvbikgPyBpY29uIDogdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5hY3Rpb25SdW5uZXIucnVuKHRoaXMuX2NvbW1hbmRBY3Rpb24sIHRoaXMuX2NvbnRleHQpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ21lbnUtZW50cnknKTtcblxuXHRcdGlmICh0aGlzLm9wdGlvbnMuaWNvbikge1xuXHRcdFx0dGhpcy5fdXBkYXRlSXRlbUNsYXNzKHRoaXMuX21lbnVJdGVtQWN0aW9uLml0ZW0pO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9tZW51SXRlbUFjdGlvbi5hbHQpIHtcblx0XHRcdGxldCBpc01vdXNlT3ZlciA9IGZhbHNlO1xuXG5cdFx0XHRjb25zdCB1cGRhdGVBbHRTdGF0ZSA9ICgpID0+IHtcblx0XHRcdFx0Y29uc3Qgd2FudHNBbHRDb21tYW5kID0gISF0aGlzLl9tZW51SXRlbUFjdGlvbi5hbHQ/LmVuYWJsZWQgJiZcblx0XHRcdFx0XHQoIXRoaXMuX2FjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzTW90aW9uUmVkdWNlZCgpIHx8IGlzTW91c2VPdmVyKSAmJiAoXG5cdFx0XHRcdFx0XHR0aGlzLl9hbHRLZXkua2V5U3RhdHVzLmFsdEtleSB8fFxuXHRcdFx0XHRcdFx0KHRoaXMuX2FsdEtleS5rZXlTdGF0dXMuc2hpZnRLZXkgJiYgaXNNb3VzZU92ZXIpXG5cdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRpZiAod2FudHNBbHRDb21tYW5kICE9PSB0aGlzLl93YW50c0FsdENvbW1hbmQpIHtcblx0XHRcdFx0XHR0aGlzLl93YW50c0FsdENvbW1hbmQgPSB3YW50c0FsdENvbW1hbmQ7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVMYWJlbCgpO1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlVG9vbHRpcCgpO1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlQ2xhc3MoKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYWx0S2V5LmV2ZW50KHVwZGF0ZUFsdFN0YXRlKSk7XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb250YWluZXIsICdtb3VzZWxlYXZlJywgXyA9PiB7XG5cdFx0XHRcdGlzTW91c2VPdmVyID0gZmFsc2U7XG5cdFx0XHRcdHVwZGF0ZUFsdFN0YXRlKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb250YWluZXIsICdtb3VzZWVudGVyJywgXyA9PiB7XG5cdFx0XHRcdGlzTW91c2VPdmVyID0gdHJ1ZTtcblx0XHRcdFx0dXBkYXRlQWx0U3RhdGUoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dXBkYXRlQWx0U3RhdGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlTGFiZWwoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5sYWJlbCAmJiB0aGlzLmxhYmVsKSB7XG5cdFx0XHR0aGlzLmxhYmVsLnRleHRDb250ZW50ID0gdGhpcy5fY29tbWFuZEFjdGlvbi5sYWJlbDtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0VG9vbHRpcCgpIHtcblx0XHRjb25zdCB0b29sdGlwID0gdGhpcy5fY29tbWFuZEFjdGlvbi50b29sdGlwIHx8IHRoaXMuX2NvbW1hbmRBY3Rpb24ubGFiZWw7XG5cdFx0bGV0IHRpdGxlID0gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UuYXBwZW5kS2V5YmluZGluZyh0b29sdGlwLCB0aGlzLl9jb21tYW5kQWN0aW9uLmlkLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0aWYgKCF0aGlzLl93YW50c0FsdENvbW1hbmQgJiYgdGhpcy5fbWVudUl0ZW1BY3Rpb24uYWx0Py5lbmFibGVkKSB7XG5cdFx0XHRjb25zdCBhbHRUb29sdGlwID0gdGhpcy5fbWVudUl0ZW1BY3Rpb24uYWx0LnRvb2x0aXAgfHwgdGhpcy5fbWVudUl0ZW1BY3Rpb24uYWx0LmxhYmVsO1xuXHRcdFx0Y29uc3QgYWx0VGl0bGVTZWN0aW9uID0gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UuYXBwZW5kS2V5YmluZGluZyhhbHRUb29sdGlwLCB0aGlzLl9tZW51SXRlbUFjdGlvbi5hbHQuaWQsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdFx0dGl0bGUgPSBsb2NhbGl6ZSgndGl0bGVBbmRLYkFuZEFsdCcsIFwiezB9XFxuW3sxfV0gezJ9XCIsIHRpdGxlLCBVSUxhYmVsUHJvdmlkZXIubW9kaWZpZXJMYWJlbHNbT1NdLmFsdEtleSwgYWx0VGl0bGVTZWN0aW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRpdGxlO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZUNsYXNzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLm9wdGlvbnMuaWNvbikge1xuXHRcdFx0aWYgKHRoaXMuX2NvbW1hbmRBY3Rpb24gIT09IHRoaXMuX21lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9tZW51SXRlbUFjdGlvbi5hbHQpIHtcblx0XHRcdFx0XHR0aGlzLl91cGRhdGVJdGVtQ2xhc3ModGhpcy5fbWVudUl0ZW1BY3Rpb24uYWx0Lml0ZW0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVJdGVtQ2xhc3ModGhpcy5fbWVudUl0ZW1BY3Rpb24uaXRlbSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlSXRlbUNsYXNzKGl0ZW06IElDb21tYW5kQWN0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5faXRlbUNsYXNzRGlzcG9zZS52YWx1ZSA9IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHsgZWxlbWVudCwgbGFiZWwgfSA9IHRoaXM7XG5cdFx0aWYgKCFlbGVtZW50IHx8ICFsYWJlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGljb24gPSB0aGlzLl9jb21tYW5kQWN0aW9uLmNoZWNrZWQgJiYgaXNJQ29tbWFuZEFjdGlvblRvZ2dsZUluZm8oaXRlbS50b2dnbGVkKSAmJiBpdGVtLnRvZ2dsZWQuaWNvbiA/IGl0ZW0udG9nZ2xlZC5pY29uIDogaXRlbS5pY29uO1xuXG5cdFx0aWYgKCFpY29uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKFRoZW1lSWNvbi5pc1RoZW1lSWNvbihpY29uKSkge1xuXHRcdFx0Ly8gdGhlbWUgaWNvbnNcblx0XHRcdGNvbnN0IGljb25DbGFzc2VzID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoaWNvbik7XG5cdFx0XHRsYWJlbC5jbGFzc0xpc3QuYWRkKC4uLmljb25DbGFzc2VzKTtcblx0XHRcdHRoaXMuX2l0ZW1DbGFzc0Rpc3Bvc2UudmFsdWUgPSB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHRsYWJlbC5jbGFzc0xpc3QucmVtb3ZlKC4uLmljb25DbGFzc2VzKTtcblx0XHRcdH0pO1xuXG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGljb24gcGF0aC91cmxcblx0XHRcdGxhYmVsLnN0eWxlLmJhY2tncm91bmRJbWFnZSA9IChcblx0XHRcdFx0aXNEYXJrKHRoaXMuX3RoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkudHlwZSlcblx0XHRcdFx0XHQ/IGFzQ1NTVXJsKGljb24uZGFyaylcblx0XHRcdFx0XHQ6IGFzQ1NTVXJsKGljb24ubGlnaHQpXG5cdFx0XHQpO1xuXHRcdFx0bGFiZWwuY2xhc3NMaXN0LmFkZCgnaWNvbicpO1xuXHRcdFx0dGhpcy5faXRlbUNsYXNzRGlzcG9zZS52YWx1ZSA9IGNvbWJpbmVkRGlzcG9zYWJsZShcblx0XHRcdFx0dG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0XHRsYWJlbC5zdHlsZS5iYWNrZ3JvdW5kSW1hZ2UgPSAnJztcblx0XHRcdFx0XHRsYWJlbC5jbGFzc0xpc3QucmVtb3ZlKCdpY29uJyk7XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHR0aGlzLl90aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0XHQvLyByZWZyZXNoIHdoZW4gdGhlIHRoZW1lIGNoYW5nZXMgaW4gY2FzZSB3ZSBnbyBiZXR3ZWVuIGRhcmsgPC0+IGxpZ2h0XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVDbGFzcygpO1xuXHRcdFx0XHR9KVxuXHRcdFx0KTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGV4dE9ubHlNZW51RW50cnlBY3Rpb25WaWV3SXRlbU9wdGlvbnMgZXh0ZW5kcyBJTWVudUVudHJ5QWN0aW9uVmlld0l0ZW1PcHRpb25zIHtcblx0cmVhZG9ubHkgY29udmVyc2F0aW9uYWw/OiBib29sZWFuO1xuXHRyZWFkb25seSB1c2VDb21tYT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBUZXh0T25seU1lbnVFbnRyeUFjdGlvblZpZXdJdGVtIGV4dGVuZHMgTWVudUVudHJ5QWN0aW9uVmlld0l0ZW08SVRleHRPbmx5TWVudUVudHJ5QWN0aW9uVmlld0l0ZW1PcHRpb25zPiB7XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLm9wdGlvbnMubGFiZWwgPSB0cnVlO1xuXHRcdHRoaXMub3B0aW9ucy5pY29uID0gZmFsc2U7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3RleHQtb25seScpO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCd1c2UtY29tbWEnLCB0aGlzLl9vcHRpb25zPy51c2VDb21tYSA/PyBmYWxzZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlTGFiZWwoKSB7XG5cdFx0Y29uc3Qga2IgPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKHRoaXMuX2FjdGlvbi5pZCwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGlmICgha2IpIHtcblx0XHRcdHJldHVybiBzdXBlci51cGRhdGVMYWJlbCgpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5sYWJlbCkge1xuXHRcdFx0Y29uc3Qga2IyID0gVGV4dE9ubHlNZW51RW50cnlBY3Rpb25WaWV3SXRlbS5fc3ltYm9sUHJpbnRFbnRlcihrYik7XG5cblx0XHRcdGlmICh0aGlzLl9vcHRpb25zPy5jb252ZXJzYXRpb25hbCkge1xuXHRcdFx0XHR0aGlzLmxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoeyBrZXk6ICdjb250ZW50MicsIGNvbW1lbnQ6IFsnQSBsYWJlbCB3aXRoIGtleWJpbmRnIGxpa2UgXCJFU0MgdG8gZGlzbWlzc1wiJ10gfSwgJ3sxfSB0byB7MH0nLCB0aGlzLl9hY3Rpb24ubGFiZWwsIGtiMik7XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSh7IGtleTogJ2NvbnRlbnQnLCBjb21tZW50OiBbJ0EgbGFiZWwnLCAnQSBrZXliaW5kaW5nJ10gfSwgJ3swfSAoezF9KScsIHRoaXMuX2FjdGlvbi5sYWJlbCwga2IyKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfc3ltYm9sUHJpbnRFbnRlcihrYjogUmVzb2x2ZWRLZXliaW5kaW5nKSB7XG5cdFx0cmV0dXJuIGtiLmdldExhYmVsKClcblx0XHRcdD8ucmVwbGFjZSgvXFxiZW50ZXJcXGIvZ2ksICdcXHUyM0NFJylcblx0XHRcdC5yZXBsYWNlKC9cXGJFc2NhcGVcXGIvZ2ksICdFc2MnKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3VibWVudUVudHJ5QWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YWN0aW9uOiBTdWJtZW51SXRlbUFjdGlvbixcblx0XHRvcHRpb25zOiBJRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW1PcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJvdGVjdGVkIF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByb3RlY3RlZCBfY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByb3RlY3RlZCBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlXG5cdCkge1xuXHRcdGNvbnN0IGRyb3Bkb3duT3B0aW9uczogSURyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtT3B0aW9ucyA9IHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRtZW51QXNDaGlsZDogb3B0aW9ucz8ubWVudUFzQ2hpbGQgPz8gZmFsc2UsXG5cdFx0XHRjbGFzc05hbWVzOiBvcHRpb25zPy5jbGFzc05hbWVzID8/IChUaGVtZUljb24uaXNUaGVtZUljb24oYWN0aW9uLml0ZW0uaWNvbikgPyBUaGVtZUljb24uYXNDbGFzc05hbWUoYWN0aW9uLml0ZW0uaWNvbikgOiB1bmRlZmluZWQpLFxuXHRcdFx0a2V5YmluZGluZ1Byb3ZpZGVyOiBvcHRpb25zPy5rZXliaW5kaW5nUHJvdmlkZXIgPz8gKGFjdGlvbiA9PiBfa2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhhY3Rpb24uaWQpKVxuXHRcdH07XG5cblx0XHRzdXBlcihhY3Rpb24sIHsgZ2V0QWN0aW9uczogKCkgPT4gYWN0aW9uLmFjdGlvbnMgfSwgX2NvbnRleHRNZW51U2VydmljZSwgZHJvcGRvd25PcHRpb25zKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0YXNzZXJ0VHlwZSh0aGlzLmVsZW1lbnQpO1xuXG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ21lbnUtZW50cnknKTtcblx0XHRjb25zdCBhY3Rpb24gPSA8U3VibWVudUl0ZW1BY3Rpb24+dGhpcy5fYWN0aW9uO1xuXHRcdGNvbnN0IHsgaWNvbiB9ID0gYWN0aW9uLml0ZW07XG5cdFx0aWYgKGljb24gJiYgIVRoZW1lSWNvbi5pc1RoZW1lSWNvbihpY29uKSkge1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2ljb24nKTtcblx0XHRcdGNvbnN0IHNldEJhY2tncm91bmRJbWFnZSA9ICgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5iYWNrZ3JvdW5kSW1hZ2UgPSAoXG5cdFx0XHRcdFx0XHRpc0RhcmsodGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS50eXBlKVxuXHRcdFx0XHRcdFx0XHQ/IGFzQ1NTVXJsKGljb24uZGFyaylcblx0XHRcdFx0XHRcdFx0OiBhc0NTU1VybChpY29uLmxpZ2h0KVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRzZXRCYWNrZ3JvdW5kSW1hZ2UoKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHQvLyByZWZyZXNoIHdoZW4gdGhlIHRoZW1lIGNoYW5nZXMgaW4gY2FzZSB3ZSBnbyBiZXR3ZWVuIGRhcmsgPC0+IGxpZ2h0XG5cdFx0XHRcdHNldEJhY2tncm91bmRJbWFnZSgpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEcm9wZG93bldpdGhEZWZhdWx0QWN0aW9uVmlld0l0ZW1PcHRpb25zIGV4dGVuZHMgSURyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtT3B0aW9ucyB7XG5cdHJlbmRlcktleWJpbmRpbmdXaXRoRGVmYXVsdEFjdGlvbkxhYmVsPzogYm9vbGVhbjtcblx0dG9nZ2xlUHJpbWFyeUFjdGlvbj86IGJvb2xlYW47XG5cdHByaW1hcnlBY3Rpb25JZHM/OiByZWFkb25seSBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGNsYXNzIERyb3Bkb3duV2l0aERlZmF1bHRBY3Rpb25WaWV3SXRlbSBleHRlbmRzIEJhc2VBY3Rpb25WaWV3SXRlbSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29wdGlvbnM6IElEcm9wZG93bldpdGhEZWZhdWx0QWN0aW9uVmlld0l0ZW1PcHRpb25zIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9kZWZhdWx0QWN0aW9uOiBBY3Rpb25WaWV3SXRlbTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVmYXVsdEFjdGlvbkRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZHJvcGRvd246IERyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtO1xuXHRwcml2YXRlIF9jb250YWluZXI6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VLZXk6IHN0cmluZztcblx0cHJpdmF0ZSByZWFkb25seSBfcHJpbWFyeUFjdGlvbkxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdGdldCBvbkRpZENoYW5nZURyb3Bkb3duVmlzaWJpbGl0eSgpOiBFdmVudDxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2Ryb3Bkb3duLm9uRGlkQ2hhbmdlVmlzaWJpbGl0eTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHN1Ym1lbnVBY3Rpb246IFN1Ym1lbnVJdGVtQWN0aW9uLFxuXHRcdG9wdGlvbnM6IElEcm9wZG93bldpdGhEZWZhdWx0QWN0aW9uVmlld0l0ZW1PcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcm90ZWN0ZWQgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByb3RlY3RlZCBfY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJvdGVjdGVkIF9tZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJvdGVjdGVkIF9pbnN0YVNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByb3RlY3RlZCBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByb3RlY3RlZCBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIobnVsbCwgc3VibWVudUFjdGlvbik7XG5cdFx0dGhpcy5fb3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0dGhpcy5fc3RvcmFnZUtleSA9IGAke3N1Ym1lbnVBY3Rpb24uaXRlbS5zdWJtZW51LmlkfV9sYXN0QWN0aW9uSWRgO1xuXG5cdFx0Ly8gZGV0ZXJtaW5lIGRlZmF1bHQgYWN0aW9uXG5cdFx0bGV0IGRlZmF1bHRBY3Rpb246IElBY3Rpb24gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZGVmYXVsdEFjdGlvbklkID0gb3B0aW9ucz8udG9nZ2xlUHJpbWFyeUFjdGlvbiA/IF9zdG9yYWdlU2VydmljZS5nZXQodGhpcy5fc3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGRlZmF1bHRBY3Rpb25JZCkge1xuXHRcdFx0ZGVmYXVsdEFjdGlvbiA9IHN1Ym1lbnVBY3Rpb24uYWN0aW9ucy5maW5kKGEgPT4gZGVmYXVsdEFjdGlvbklkID09PSBhLmlkICYmIHRoaXMuX2NhbkJlUHJpbWFyeUFjdGlvbihhKSk7XG5cdFx0fVxuXHRcdGlmICghZGVmYXVsdEFjdGlvbikge1xuXHRcdFx0ZGVmYXVsdEFjdGlvbiA9IHN1Ym1lbnVBY3Rpb24uYWN0aW9ucy5maW5kKGFjdGlvbiA9PiB0aGlzLl9jYW5CZVByaW1hcnlBY3Rpb24oYWN0aW9uKSkgPz8gc3VibWVudUFjdGlvbi5hY3Rpb25zWzBdO1xuXHRcdH1cblxuXHRcdHRoaXMuX2RlZmF1bHRBY3Rpb24gPSB0aGlzLl9kZWZhdWx0QWN0aW9uRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2luc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51RW50cnlBY3Rpb25WaWV3SXRlbSwgPE1lbnVJdGVtQWN0aW9uPmRlZmF1bHRBY3Rpb24sIHsga2V5YmluZGluZzogdGhpcy5fZ2V0RGVmYXVsdEFjdGlvbktleWJpbmRpbmdMYWJlbChkZWZhdWx0QWN0aW9uKSwgaG92ZXJEZWxlZ2F0ZTogb3B0aW9ucz8uaG92ZXJEZWxlZ2F0ZSB9KSk7XG5cblx0XHRjb25zdCBkcm9wZG93bk9wdGlvbnM6IElEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbU9wdGlvbnMgPSB7XG5cdFx0XHRrZXliaW5kaW5nUHJvdmlkZXI6IGFjdGlvbiA9PiB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5pZCksXG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0bWVudUFzQ2hpbGQ6IG9wdGlvbnM/Lm1lbnVBc0NoaWxkID8/IHRydWUsXG5cdFx0XHRjbGFzc05hbWVzOiBvcHRpb25zPy5jbGFzc05hbWVzID8/IFsnY29kaWNvbicsICdjb2RpY29uLWNoZXZyb24tZG93biddLFxuXHRcdFx0YWN0aW9uUnVubmVyOiBvcHRpb25zPy5hY3Rpb25SdW5uZXIgPz8gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvblJ1bm5lcigpKSxcblx0XHR9O1xuXG5cdFx0dGhpcy5fZHJvcGRvd24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0oc3VibWVudUFjdGlvbiwgc3VibWVudUFjdGlvbi5hY3Rpb25zLCB0aGlzLl9jb250ZXh0TWVudVNlcnZpY2UsIGRyb3Bkb3duT3B0aW9ucykpO1xuXHRcdGlmIChvcHRpb25zPy50b2dnbGVQcmltYXJ5QWN0aW9uKSB7XG5cdFx0XHR0aGlzLnJlZ2lzdGVyVG9nZ2xlUHJpbWFyeUFjdGlvbkxpc3RlbmVyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclRvZ2dsZVByaW1hcnlBY3Rpb25MaXN0ZW5lcigpOiB2b2lkIHtcblx0XHR0aGlzLl9wcmltYXJ5QWN0aW9uTGlzdGVuZXIudmFsdWUgPSB0aGlzLl9vcHRpb25zPy5wcmltYXJ5QWN0aW9uSWRzPy5sZW5ndGhcblx0XHRcdD8gdGhpcy5fY29tbWFuZFNlcnZpY2Uub25EaWRFeGVjdXRlQ29tbWFuZChldmVudCA9PiB7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9ICg8U3VibWVudUl0ZW1BY3Rpb24+dGhpcy5fYWN0aW9uKS5hY3Rpb25zLmZpbmQoYWN0aW9uID0+IGFjdGlvbi5pZCA9PT0gZXZlbnQuY29tbWFuZElkKTtcblx0XHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uICYmIHRoaXMuX2NhbkJlUHJpbWFyeUFjdGlvbihhY3Rpb24pKSB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGUoYWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHRcdDogdGhpcy5fZHJvcGRvd24uYWN0aW9uUnVubmVyLm9uRGlkUnVuKChlOiBJUnVuRXZlbnQpID0+IHtcblx0XHRcdFx0aWYgKGUuYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZShlLmFjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGUobGFzdEFjdGlvbjogTWVudUl0ZW1BY3Rpb24pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2NhbkJlUHJpbWFyeUFjdGlvbihsYXN0QWN0aW9uKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fb3B0aW9ucz8udG9nZ2xlUHJpbWFyeUFjdGlvbikge1xuXHRcdFx0aWYgKHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldCh0aGlzLl9zdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKSAhPT0gbGFzdEFjdGlvbi5pZCkge1xuXHRcdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZSh0aGlzLl9zdG9yYWdlS2V5LCBsYXN0QWN0aW9uLmlkLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGhpcy5fZGVmYXVsdEFjdGlvbi5hY3Rpb24uaWQgPT09IGxhc3RBY3Rpb24uaWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9kZWZhdWx0QWN0aW9uRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9kZWZhdWx0QWN0aW9uID0gdGhpcy5fZGVmYXVsdEFjdGlvbkRpc3Bvc2FibGVzLmFkZCh0aGlzLl9pbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudUVudHJ5QWN0aW9uVmlld0l0ZW0sIGxhc3RBY3Rpb24sIHsga2V5YmluZGluZzogdGhpcy5fZ2V0RGVmYXVsdEFjdGlvbktleWJpbmRpbmdMYWJlbChsYXN0QWN0aW9uKSwgaG92ZXJEZWxlZ2F0ZTogdGhpcy5fb3B0aW9ucz8uaG92ZXJEZWxlZ2F0ZSB9KSk7XG5cdFx0dGhpcy5fZGVmYXVsdEFjdGlvbi5hY3Rpb25SdW5uZXIgPSB0aGlzLl9kZWZhdWx0QWN0aW9uRGlzcG9zYWJsZXMuYWRkKG5ldyBjbGFzcyBleHRlbmRzIEFjdGlvblJ1bm5lciB7XG5cdFx0XHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgcnVuQWN0aW9uKGFjdGlvbjogSUFjdGlvbiwgY29udGV4dD86IHVua25vd24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0YXdhaXQgYWN0aW9uLnJ1bih1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH0oKSk7XG5cblx0XHRpZiAodGhpcy5fY29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLl9kZWZhdWx0QWN0aW9uLnJlbmRlcihwcmVwZW5kKHRoaXMuX2NvbnRhaW5lciwgJCgnLmFjdGlvbi1jb250YWluZXInKSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NhbkJlUHJpbWFyeUFjdGlvbihhY3Rpb246IElBY3Rpb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIXRoaXMuX29wdGlvbnM/LnByaW1hcnlBY3Rpb25JZHM/Lmxlbmd0aCB8fCB0aGlzLl9vcHRpb25zLnByaW1hcnlBY3Rpb25JZHMuaW5jbHVkZXMoYWN0aW9uLmlkKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldERlZmF1bHRBY3Rpb25LZXliaW5kaW5nTGFiZWwoZGVmYXVsdEFjdGlvbjogSUFjdGlvbikge1xuXHRcdGxldCBkZWZhdWx0QWN0aW9uS2V5YmluZGluZzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLl9vcHRpb25zPy5yZW5kZXJLZXliaW5kaW5nV2l0aERlZmF1bHRBY3Rpb25MYWJlbCkge1xuXHRcdFx0Y29uc3Qga2IgPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGRlZmF1bHRBY3Rpb24uaWQpO1xuXHRcdFx0aWYgKGtiKSB7XG5cdFx0XHRcdGRlZmF1bHRBY3Rpb25LZXliaW5kaW5nID0gYCgke2tiLmdldExhYmVsKCl9KWA7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBkZWZhdWx0QWN0aW9uS2V5YmluZGluZztcblx0fVxuXG5cdG92ZXJyaWRlIHNldEFjdGlvbkNvbnRleHQobmV3Q29udGV4dDogdW5rbm93bik6IHZvaWQge1xuXHRcdHN1cGVyLnNldEFjdGlvbkNvbnRleHQobmV3Q29udGV4dCk7XG5cdFx0dGhpcy5fZGVmYXVsdEFjdGlvbi5zZXRBY3Rpb25Db250ZXh0KG5ld0NvbnRleHQpO1xuXHRcdHRoaXMuX2Ryb3Bkb3duLnNldEFjdGlvbkNvbnRleHQobmV3Q29udGV4dCk7XG5cdH1cblxuXHRvdmVycmlkZSBzZXQgYWN0aW9uUnVubmVyKGFjdGlvblJ1bm5lcjogSUFjdGlvblJ1bm5lcikge1xuXHRcdHN1cGVyLmFjdGlvblJ1bm5lciA9IGFjdGlvblJ1bm5lcjtcblxuXHRcdHRoaXMuX2RlZmF1bHRBY3Rpb24uYWN0aW9uUnVubmVyID0gYWN0aW9uUnVubmVyO1xuXHRcdC8vIFdpdGhvdXQgYW4gYWxsb3dsaXN0LCByZXRhaW4gdGhlIHByaXZhdGUgcnVubmVyIHNvIG9ubHkgZHJvcGRvd24gZXhlY3V0aW9ucyBiZWNvbWUgcHJpbWFyeS5cblx0XHRpZiAoIXRoaXMuX29wdGlvbnM/LnRvZ2dsZVByaW1hcnlBY3Rpb24gfHwgdGhpcy5fb3B0aW9ucy5wcmltYXJ5QWN0aW9uSWRzPy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX2Ryb3Bkb3duLmFjdGlvblJ1bm5lciA9IGFjdGlvblJ1bm5lcjtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgYWN0aW9uUnVubmVyKCk6IElBY3Rpb25SdW5uZXIge1xuXHRcdHJldHVybiBzdXBlci5hY3Rpb25SdW5uZXI7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRhaW5lciA9IGNvbnRhaW5lcjtcblx0XHRzdXBlci5yZW5kZXIodGhpcy5fY29udGFpbmVyKTtcblxuXHRcdHRoaXMuX2NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdtb25hY28tZHJvcGRvd24td2l0aC1kZWZhdWx0Jyk7XG5cblx0XHRjb25zdCBwcmltYXJ5Q29udGFpbmVyID0gJCgnLmFjdGlvbi1jb250YWluZXInKTtcblx0XHR0aGlzLl9kZWZhdWx0QWN0aW9uLnJlbmRlcihhcHBlbmQodGhpcy5fY29udGFpbmVyLCBwcmltYXJ5Q29udGFpbmVyKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHByaW1hcnlDb250YWluZXIsIEV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5SaWdodEFycm93KSkge1xuXHRcdFx0XHR0aGlzLl9kZWZhdWx0QWN0aW9uLmVsZW1lbnQhLnRhYkluZGV4ID0gLTE7XG5cdFx0XHRcdHRoaXMuX2Ryb3Bkb3duLmZvY3VzKCk7XG5cdFx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRyb3Bkb3duQ29udGFpbmVyID0gJCgnLmRyb3Bkb3duLWFjdGlvbi1jb250YWluZXInKTtcblx0XHR0aGlzLl9kcm9wZG93bi5yZW5kZXIoYXBwZW5kKHRoaXMuX2NvbnRhaW5lciwgZHJvcGRvd25Db250YWluZXIpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIoZHJvcGRvd25Db250YWluZXIsIEV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5MZWZ0QXJyb3cpKSB7XG5cdFx0XHRcdHRoaXMuX2RlZmF1bHRBY3Rpb24uZWxlbWVudCEudGFiSW5kZXggPSAwO1xuXHRcdFx0XHR0aGlzLl9kcm9wZG93bi5zZXRGb2N1c2FibGUoZmFsc2UpO1xuXHRcdFx0XHR0aGlzLl9kZWZhdWx0QWN0aW9uLmVsZW1lbnQ/LmZvY3VzKCk7XG5cdFx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKGZyb21SaWdodD86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoZnJvbVJpZ2h0KSB7XG5cdFx0XHR0aGlzLl9kcm9wZG93bi5mb2N1cygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9kZWZhdWx0QWN0aW9uLmVsZW1lbnQhLnRhYkluZGV4ID0gMDtcblx0XHRcdHRoaXMuX2RlZmF1bHRBY3Rpb24uZWxlbWVudCEuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBibHVyKCk6IHZvaWQge1xuXHRcdHRoaXMuX2RlZmF1bHRBY3Rpb24uZWxlbWVudCEudGFiSW5kZXggPSAtMTtcblx0XHR0aGlzLl9kcm9wZG93bi5ibHVyKCk7XG5cdFx0dGhpcy5fY29udGFpbmVyIS5ibHVyKCk7XG5cdH1cblxuXHRvdmVycmlkZSBzZXRGb2N1c2FibGUoZm9jdXNhYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGZvY3VzYWJsZSkge1xuXHRcdFx0dGhpcy5fZGVmYXVsdEFjdGlvbi5lbGVtZW50IS50YWJJbmRleCA9IDA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2RlZmF1bHRBY3Rpb24uZWxlbWVudCEudGFiSW5kZXggPSAtMTtcblx0XHRcdHRoaXMuX2Ryb3Bkb3duLnNldEZvY3VzYWJsZShmYWxzZSk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFN1Ym1lbnVFbnRyeVNlbGVjdEFjdGlvblZpZXdJdGVtIGV4dGVuZHMgU2VsZWN0QWN0aW9uVmlld0l0ZW0ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogU3VibWVudUl0ZW1BY3Rpb24sXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIobnVsbCwgYWN0aW9uLCBhY3Rpb24uYWN0aW9ucy5tYXAoYSA9PiAoYS5pZCA9PT0gU2VwYXJhdG9yLklEID8gU2VwYXJhdG9yU2VsZWN0T3B0aW9uIDogeyB0ZXh0OiBhLmxhYmVsLCBpc0Rpc2FibGVkOiAhYS5lbmFibGVkLCB9KSksIDAsIGNvbnRleHRWaWV3U2VydmljZSwgZGVmYXVsdFNlbGVjdEJveFN0eWxlcywgeyBhcmlhTGFiZWw6IGFjdGlvbi50b29sdGlwIHx8IGFjdGlvbi5sYWJlbCwgb3B0aW9uc0FzQ2hpbGRyZW46IHRydWUsIHVzZUN1c3RvbURyYXduOiAhaGFzTmF0aXZlQ29udGV4dE1lbnUoY29uZmlndXJhdGlvblNlcnZpY2UpIH0pO1xuXHRcdHRoaXMuc2VsZWN0KE1hdGgubWF4KDAsIGFjdGlvbi5hY3Rpb25zLmZpbmRJbmRleChhID0+IGEuY2hlY2tlZCkpKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0Y29udGFpbmVyLnN0eWxlLmJvcmRlckNvbG9yID0gYXNDc3NWYXJpYWJsZShzZWxlY3RCb3JkZXIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJ1bkFjdGlvbihvcHRpb246IHN0cmluZywgaW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGlvbiA9ICh0aGlzLmFjdGlvbiBhcyBTdWJtZW51SXRlbUFjdGlvbikuYWN0aW9uc1tpbmRleF07XG5cdFx0aWYgKGFjdGlvbikge1xuXHRcdFx0dGhpcy5hY3Rpb25SdW5uZXIucnVuKGFjdGlvbik7XG5cdFx0fVxuXHR9XG5cbn1cblxuLyoqXG4gKiBDcmVhdGVzIGFjdGlvbiB2aWV3IGl0ZW1zIGZvciBtZW51IGFjdGlvbnMgb3Igc3VibWVudSBhY3Rpb25zLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQWN0aW9uVmlld0l0ZW0oaW5zdGFTZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsIGFjdGlvbjogSUFjdGlvbiwgb3B0aW9uczogSURyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtT3B0aW9ucyB8IElNZW51RW50cnlBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfCB1bmRlZmluZWQpOiB1bmRlZmluZWQgfCBNZW51RW50cnlBY3Rpb25WaWV3SXRlbSB8IFN1Ym1lbnVFbnRyeUFjdGlvblZpZXdJdGVtIHwgQmFzZUFjdGlvblZpZXdJdGVtIHtcblx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0cmV0dXJuIGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51RW50cnlBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCBvcHRpb25zKTtcblx0fSBlbHNlIGlmIChhY3Rpb24gaW5zdGFuY2VvZiBTdWJtZW51SXRlbUFjdGlvbikge1xuXHRcdGlmIChhY3Rpb24uaXRlbS5pc1NlbGVjdGlvbikge1xuXHRcdFx0cmV0dXJuIGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShTdWJtZW51RW50cnlTZWxlY3RBY3Rpb25WaWV3SXRlbSwgYWN0aW9uKTtcblx0XHR9IGVsc2UgaWYgKGFjdGlvbi5pdGVtLmlzU3BsaXRCdXR0b24pIHtcblx0XHRcdHJldHVybiBpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRHJvcGRvd25XaXRoRGVmYXVsdEFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIHtcblx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0dG9nZ2xlUHJpbWFyeUFjdGlvbjogdHlwZW9mIGFjdGlvbi5pdGVtLmlzU3BsaXRCdXR0b24gIT09ICdib29sZWFuJyA/IGFjdGlvbi5pdGVtLmlzU3BsaXRCdXR0b24udG9nZ2xlUHJpbWFyeUFjdGlvbiA6IGZhbHNlLFxuXHRcdFx0XHRwcmltYXJ5QWN0aW9uSWRzOiB0eXBlb2YgYWN0aW9uLml0ZW0uaXNTcGxpdEJ1dHRvbiAhPT0gJ2Jvb2xlYW4nID8gYWN0aW9uLml0ZW0uaXNTcGxpdEJ1dHRvbi5wcmltYXJ5QWN0aW9uSWRzIDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3VibWVudUVudHJ5QWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxHQUFHLHVCQUF1QixRQUFRLFdBQVcsb0JBQW9CLGVBQWU7QUFDekYsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQkFBZ0Isb0JBQW9CLDRCQUE0QjtBQUN6RSxTQUFTLGtDQUFzRTtBQUUvRSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGNBQWlELFdBQVcscUJBQXFCO0FBRTFGLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsZUFBZTtBQUN4QixTQUFTLG9CQUFvQixpQkFBaUIsbUJBQW1CLG9CQUFvQjtBQUNyRixTQUFTLFNBQVMsV0FBVyxVQUFVO0FBQ3ZDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXlCLGtDQUFrQztBQUMzRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHFCQUFxQiwyQkFBMkI7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LFVBQVUsYUFBYSxLQUFLO0FBQUEsSUFDbEM7QUFBQSxFQUNEO0FBQ0Q7QUF2TGEsb0NBQU47QUFBQSxFQWdCSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBdEJVO0FBeUxiLElBQU0sbUNBQU4sY0FBK0MscUJBQXFCO0FBQUEsRUFFbkUsWUFDQyxRQUNxQixvQkFDRSxzQkFDdEI7QUFDRCxVQUFNLE1BQU0sUUFBUSxPQUFPLFFBQVEsSUFBSSxPQUFNLEVBQUUsT0FBTyxVQUFVLEtBQUssd0JBQXdCLEVBQUUsTUFBTSxFQUFFLE9BQU8sWUFBWSxDQUFDLEVBQUUsUUFBUyxDQUFFLEdBQUcsR0FBRyxvQkFBb0Isd0JBQXdCLEVBQUUsV0FBVyxPQUFPLFdBQVcsT0FBTyxPQUFPLG1CQUFtQixNQUFNLGdCQUFnQixDQUFDLHFCQUFxQixvQkFBb0IsRUFBRSxDQUFDO0FBQzdULFNBQUssT0FBTyxLQUFLLElBQUksR0FBRyxPQUFPLFFBQVEsVUFBVSxPQUFLLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFBQSxFQUNsRTtBQUFBLEVBRVMsT0FBTyxXQUE4QjtBQUM3QyxVQUFNLE9BQU8sU0FBUztBQUN0QixjQUFVLE1BQU0sY0FBYyxjQUFjLFlBQVk7QUFBQSxFQUN6RDtBQUFBLEVBRW1CLFVBQVUsUUFBZ0IsT0FBcUI7QUFDakUsVUFBTSxTQUFVLEtBQUssT0FBNkIsUUFBUSxLQUFLO0FBQy9ELFFBQUksUUFBUTtBQUNYLFdBQUssYUFBYSxJQUFJLE1BQU07QUFBQSxJQUM3QjtBQUFBLEVBQ0Q7QUFFRDtBQXZCTSxtQ0FBTjtBQUFBLEVBSUc7QUFBQSxFQUNBO0FBQUEsR0FMRztBQTRCQyxTQUFTLHFCQUFxQixjQUFxQyxRQUFpQixTQUFrTDtBQUM1USxNQUFJLGtCQUFrQixnQkFBZ0I7QUFDckMsV0FBTyxhQUFhLGVBQWUseUJBQXlCLFFBQVEsT0FBTztBQUFBLEVBQzVFLFdBQVcsa0JBQWtCLG1CQUFtQjtBQUMvQyxRQUFJLE9BQU8sS0FBSyxhQUFhO0FBQzVCLGFBQU8sYUFBYSxlQUFlLGtDQUFrQyxNQUFNO0FBQUEsSUFDNUUsV0FBVyxPQUFPLEtBQUssZUFBZTtBQUNyQyxhQUFPLGFBQWEsZUFBZSxtQ0FBbUMsUUFBUTtBQUFBLFFBQzdFLEdBQUc7QUFBQSxRQUNILHFCQUFxQixPQUFPLE9BQU8sS0FBSyxrQkFBa0IsWUFBWSxPQUFPLEtBQUssY0FBYyxzQkFBc0I7QUFBQSxRQUN0SCxrQkFBa0IsT0FBTyxPQUFPLEtBQUssa0JBQWtCLFlBQVksT0FBTyxLQUFLLGNBQWMsbUJBQW1CO0FBQUEsTUFDakgsQ0FBQztBQUFBLElBQ0YsT0FBTztBQUNOLGFBQU8sYUFBYSxlQUFlLDRCQUE0QixRQUFRLE9BQU87QUFBQSxJQUMvRTtBQUFBLEVBQ0QsT0FBTztBQUNOLFdBQU87QUFBQSxFQUNSO0FBQ0Q7IiwKICAibmFtZXMiOiBbInRhcmdldCIsICJhY3Rpb24iXQp9Cg==
