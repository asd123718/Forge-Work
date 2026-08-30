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
import "./media/notificationsCenter.css";
import "./media/notificationsActions.css";
import { NOTIFICATIONS_CENTER_HEADER_FOREGROUND, NOTIFICATIONS_CENTER_HEADER_BACKGROUND, NOTIFICATIONS_CENTER_BORDER } from "../../../common/theme.js";
import { IThemeService, Themable } from "../../../../platform/theme/common/themeService.js";
import { NotificationChangeType, NotificationViewItemContentChangeKind, NotificationsSettings, NotificationsPosition, getNotificationsPosition } from "../../../common/notifications.js";
import { IWorkbenchLayoutService, Parts } from "../../../services/layout/browser/layoutService.js";
import { Emitter } from "../../../../base/common/event.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { NotificationActionRunner } from "./notificationsCommands.js";
import { NotificationsList } from "./notificationsList.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { $, Dimension, isAncestorOfActiveElement } from "../../../../base/browser/dom.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { localize } from "../../../../nls.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { ClearAllNotificationsAction, ConfigureDoNotDisturbAction, ConfigureNotificationsPositionAction, ToggleDoNotDisturbBySourceAction, HideNotificationsCenterAction, ToggleDoNotDisturbAction, hideIcon, hideUpIcon } from "./notificationsActions.js";
import { Separator, toAction } from "../../../../base/common/actions.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { createActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { assertReturnsAllDefined, assertReturnsDefined } from "../../../../base/common/types.js";
import { NotificationsCenterVisibleContext } from "../../../common/contextkeys.js";
import { INotificationService, NotificationsFilter } from "../../../../platform/notification/common/notification.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { DropdownMenuActionViewItem } from "../../../../base/browser/ui/dropdown/dropdownActionViewItem.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { DEFAULT_CUSTOM_TITLEBAR_HEIGHT } from "../../../../platform/window/common/window.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { onDidChangeNotificationRowHeight } from "./notificationsViewer.js";
let NotificationsCenter = class extends Themable {
  constructor(container, model, themeService, instantiationService, layoutService, contextKeyService, editorGroupService, keybindingService, notificationService, accessibilitySignalService, contextMenuService, configurationService, menuService) {
    super(themeService);
    this.container = container;
    this.model = model;
    this.instantiationService = instantiationService;
    this.layoutService = layoutService;
    this.contextKeyService = contextKeyService;
    this.editorGroupService = editorGroupService;
    this.keybindingService = keybindingService;
    this.notificationService = notificationService;
    this.accessibilitySignalService = accessibilitySignalService;
    this.contextMenuService = contextMenuService;
    this.configurationService = configurationService;
    this.menuService = menuService;
    // maximum number of notification sources to show in configure dropdown
    this._onDidChangeVisibility = this._register(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    this.notificationsCenterVisibleContextKey = NotificationsCenterVisibleContext.bindTo(contextKeyService);
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.model.onDidChangeNotification((e) => this.onDidChangeNotification(e)));
    this._register(this.layoutService.onDidLayoutMainContainer((dimension) => this.layout(Dimension.lift(dimension))));
    this._register(this.notificationService.onDidChangeFilter(() => this.onDidChangeFilter()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(NotificationsSettings.NOTIFICATIONS_POSITION)) {
        this.updatePositionClass();
      }
    }));
  }
  updatePositionClass() {
    if (!this.notificationsCenterContainer) {
      return;
    }
    const position = getNotificationsPosition(this.configurationService);
    this.notificationsCenterContainer.classList.remove("bottom-right", "bottom-left", "top-right");
    this.notificationsCenterContainer.classList.add(position);
    this.updateHideActionIcon();
    this.updateTopOffset();
  }
  updateHideActionIcon() {
    if (!this.hideAction) {
      return;
    }
    const position = getNotificationsPosition(this.configurationService);
    this.hideAction.class = ThemeIcon.asClassName(position === NotificationsPosition.TOP_RIGHT ? hideUpIcon : hideIcon);
  }
  updateTopOffset() {
    if (!this.notificationsCenterContainer) {
      return;
    }
    const position = getNotificationsPosition(this.configurationService);
    if (position === NotificationsPosition.TOP_RIGHT) {
      let topOffset = 7;
      if (this.layoutService.isVisible(Parts.TITLEBAR_PART, mainWindow)) {
        topOffset += DEFAULT_CUSTOM_TITLEBAR_HEIGHT;
      }
      this.notificationsCenterContainer.style.top = `${topOffset}px`;
    } else {
      this.notificationsCenterContainer.style.top = "";
    }
  }
  onDidChangeFilter() {
    if (this.notificationService.getFilter() === NotificationsFilter.ERROR) {
      this.hide();
    }
  }
  get isVisible() {
    return !!this._isVisible;
  }
  show() {
    if (this._isVisible) {
      const notificationsList2 = assertReturnsDefined(this.notificationsList);
      notificationsList2.show();
      notificationsList2.focusFirst();
      return;
    }
    if (!this.notificationsCenterContainer) {
      this.create();
    }
    this.updateTitle();
    const [notificationsList, notificationsCenterContainer] = assertReturnsAllDefined(this.notificationsList, this.notificationsCenterContainer);
    this._isVisible = true;
    notificationsCenterContainer.classList.add("visible");
    notificationsList.show();
    this.layout(this.workbenchDimensions);
    notificationsList.updateNotificationsList(0, 0, this.model.notifications);
    notificationsList.focusFirst();
    this.updateStyles();
    this.model.notifications.forEach((notification) => notification.updateVisibility(true));
    this.notificationsCenterVisibleContextKey.set(true);
    this._onDidChangeVisibility.fire();
  }
  updateTitle() {
    const [notificationsCenterTitle, clearAllAction] = assertReturnsAllDefined(this.notificationsCenterTitle, this.clearAllAction);
    if (this.model.notifications.length === 0) {
      notificationsCenterTitle.textContent = localize("notificationsEmpty", "No new notifications");
      clearAllAction.enabled = false;
    } else {
      notificationsCenterTitle.textContent = localize("notifications", "Notifications");
      clearAllAction.enabled = this.model.notifications.some((notification) => !notification.hasProgress);
    }
  }
  create() {
    this.notificationsCenterContainer = $(".notifications-center");
    this.updatePositionClass();
    this.notificationsCenterHeader = $(".notifications-center-header");
    this.notificationsCenterContainer.appendChild(this.notificationsCenterHeader);
    this.notificationsCenterTitle = $("span.notifications-center-header-title");
    this.notificationsCenterHeader.appendChild(this.notificationsCenterTitle);
    const toolbarContainer = $(".notifications-center-header-toolbar");
    this.notificationsCenterHeader.appendChild(toolbarContainer);
    const actionRunner = this._register(this.instantiationService.createInstance(NotificationActionRunner));
    const that = this;
    const notificationsToolBar = this._register(new ActionBar(toolbarContainer, {
      ariaLabel: localize("notificationsToolbar", "Notification Center Actions"),
      actionRunner,
      actionViewItemProvider: (action, options) => {
        if (action.id === ConfigureNotificationsPositionAction.ID) {
          return this._register(this.instantiationService.createInstance(DropdownMenuActionViewItem, action, {
            getActions: () => Separator.join(...this.menuService.getMenuActions(MenuId.NotificationsCenterPositionMenu, this.contextKeyService).map(([, actions]) => actions))
          }, this.contextMenuService, {
            ...options,
            actionRunner,
            classNames: action.class,
            keybindingProvider: (action2) => this.keybindingService.lookupKeybinding(action2.id)
          }));
        }
        if (action.id === ConfigureDoNotDisturbAction.ID) {
          return this._register(this.instantiationService.createInstance(DropdownMenuActionViewItem, action, {
            getActions() {
              const actions = [toAction({
                id: ToggleDoNotDisturbAction.ID,
                label: that.notificationService.getFilter() === NotificationsFilter.OFF ? localize("turnOnNotifications", "Enable Do Not Disturb Mode") : localize("turnOffNotifications", "Disable Do Not Disturb Mode"),
                run: () => that.notificationService.setFilter(that.notificationService.getFilter() === NotificationsFilter.OFF ? NotificationsFilter.ERROR : NotificationsFilter.OFF)
              })];
              const sortedFilters = that.notificationService.getFilters().sort((a, b) => a.label.localeCompare(b.label));
              for (const source of sortedFilters.slice(0, NotificationsCenter.MAX_NOTIFICATION_SOURCES)) {
                if (actions.length === 1) {
                  actions.push(new Separator());
                }
                actions.push(toAction({
                  id: `${ToggleDoNotDisturbAction.ID}.${source.id}`,
                  label: source.label,
                  checked: source.filter !== NotificationsFilter.ERROR,
                  run: () => that.notificationService.setFilter({
                    ...source,
                    filter: source.filter === NotificationsFilter.ERROR ? NotificationsFilter.OFF : NotificationsFilter.ERROR
                  })
                }));
              }
              if (sortedFilters.length > NotificationsCenter.MAX_NOTIFICATION_SOURCES) {
                actions.push(new Separator());
                actions.push(that._register(that.instantiationService.createInstance(ToggleDoNotDisturbBySourceAction, ToggleDoNotDisturbBySourceAction.ID, localize("moreSources", "More\u2026"))));
              }
              return actions;
            }
          }, this.contextMenuService, {
            ...options,
            actionRunner,
            classNames: action.class,
            keybindingProvider: (action2) => this.keybindingService.lookupKeybinding(action2.id)
          }));
        }
        return createActionViewItem(this.instantiationService, action, options);
      }
    }));
    this.clearAllAction = this._register(this.instantiationService.createInstance(ClearAllNotificationsAction, ClearAllNotificationsAction.ID, ClearAllNotificationsAction.LABEL));
    notificationsToolBar.push(this.clearAllAction, { icon: true, label: false, keybinding: this.getKeybindingLabel(this.clearAllAction) });
    this.configureDoNotDisturbAction = this._register(this.instantiationService.createInstance(ConfigureDoNotDisturbAction, ConfigureDoNotDisturbAction.ID, ConfigureDoNotDisturbAction.LABEL));
    notificationsToolBar.push(this.configureDoNotDisturbAction, { icon: true, label: false });
    const configureNotificationsPositionAction = this._register(this.instantiationService.createInstance(ConfigureNotificationsPositionAction, ConfigureNotificationsPositionAction.ID, ConfigureNotificationsPositionAction.LABEL));
    notificationsToolBar.push(configureNotificationsPositionAction, { icon: true, label: false });
    this.hideAction = this._register(this.instantiationService.createInstance(HideNotificationsCenterAction, HideNotificationsCenterAction.ID, HideNotificationsCenterAction.LABEL));
    this.updateHideActionIcon();
    notificationsToolBar.push(this.hideAction, { icon: true, label: false, keybinding: this.getKeybindingLabel(this.hideAction) });
    this.notificationsList = this._register(this.instantiationService.createInstance(NotificationsList, this.notificationsCenterContainer, {
      widgetAriaLabel: localize("notificationsCenterWidgetAriaLabel", "Notifications Center")
    }));
    this._register(onDidChangeNotificationRowHeight(() => this.notificationsList?.updateNotificationHeights()));
    this.container.appendChild(this.notificationsCenterContainer);
  }
  getKeybindingLabel(action) {
    const keybinding = this.keybindingService.lookupKeybinding(action.id);
    return keybinding ? keybinding.getLabel() : null;
  }
  onDidChangeNotification(e) {
    if (!this._isVisible) {
      return;
    }
    let focusEditor = false;
    const [notificationsList, notificationsCenterContainer] = assertReturnsAllDefined(this.notificationsList, this.notificationsCenterContainer);
    switch (e.kind) {
      case NotificationChangeType.ADD:
        notificationsList.updateNotificationsList(e.index, 0, [e.item]);
        e.item.updateVisibility(true);
        break;
      case NotificationChangeType.CHANGE:
        switch (e.detail) {
          case NotificationViewItemContentChangeKind.ACTIONS:
            notificationsList.updateNotificationsList(e.index, 1, [e.item]);
            break;
          case NotificationViewItemContentChangeKind.MESSAGE:
            if (e.item.expanded) {
              notificationsList.updateNotificationHeight(e.item);
            }
            break;
        }
        break;
      case NotificationChangeType.EXPAND_COLLAPSE:
        notificationsList.updateNotificationsList(e.index, 1, [e.item]);
        break;
      case NotificationChangeType.REMOVE:
        focusEditor = isAncestorOfActiveElement(notificationsCenterContainer);
        notificationsList.updateNotificationsList(e.index, 1);
        e.item.updateVisibility(false);
        break;
    }
    this.updateTitle();
    if (this.model.notifications.length === 0) {
      this.hide();
      if (focusEditor) {
        this.editorGroupService.activeGroup.focus();
      }
    }
  }
  hide() {
    if (!this._isVisible || !this.notificationsCenterContainer || !this.notificationsList) {
      return;
    }
    const focusEditor = isAncestorOfActiveElement(this.notificationsCenterContainer);
    this._isVisible = false;
    this.notificationsCenterContainer.classList.remove("visible");
    this.notificationsList.hide();
    this.model.notifications.forEach((notification) => notification.updateVisibility(false));
    this.notificationsCenterVisibleContextKey.set(false);
    this._onDidChangeVisibility.fire();
    if (focusEditor) {
      this.editorGroupService.activeGroup.focus();
    }
  }
  updateStyles() {
    if (this.notificationsCenterContainer && this.notificationsCenterHeader) {
      const borderColor = this.getColor(NOTIFICATIONS_CENTER_BORDER);
      this.notificationsCenterContainer.style.border = borderColor ? `1px solid ${borderColor}` : "";
      const headerForeground = this.getColor(NOTIFICATIONS_CENTER_HEADER_FOREGROUND);
      this.notificationsCenterHeader.style.color = headerForeground ?? "";
      const headerBackground = this.getColor(NOTIFICATIONS_CENTER_HEADER_BACKGROUND);
      this.notificationsCenterHeader.style.background = headerBackground ?? "";
    }
  }
  layout(dimension) {
    this.workbenchDimensions = dimension;
    if (this._isVisible && this.notificationsCenterContainer) {
      const maxWidth = NotificationsCenter.MAX_DIMENSIONS.width;
      const maxHeight = NotificationsCenter.MAX_DIMENSIONS.height;
      let availableWidth = maxWidth;
      let availableHeight = maxHeight;
      if (this.workbenchDimensions) {
        availableWidth = this.workbenchDimensions.width;
        availableWidth -= 2 * 8;
        availableHeight = this.workbenchDimensions.height - 35;
        if (this.layoutService.isVisible(Parts.STATUSBAR_PART, mainWindow)) {
          availableHeight -= 22;
        }
        if (this.layoutService.isVisible(Parts.TITLEBAR_PART, mainWindow)) {
          availableHeight -= 22;
        }
        availableHeight -= 2 * 12;
      }
      this.updateTopOffset();
      const notificationsList = assertReturnsDefined(this.notificationsList);
      notificationsList.layout(Math.min(maxWidth, availableWidth), Math.min(maxHeight, availableHeight));
    }
  }
  clearAll() {
    this.hide();
    for (const notification of [...this.model.notifications]) {
      if (!notification.hasProgress) {
        notification.close();
      }
      this.accessibilitySignalService.playSignal(AccessibilitySignal.clear);
    }
  }
};
NotificationsCenter.MAX_DIMENSIONS = new Dimension(450, 400);
NotificationsCenter.MAX_NOTIFICATION_SOURCES = 10;
NotificationsCenter = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IWorkbenchLayoutService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IEditorGroupsService),
  __decorateParam(7, IKeybindingService),
  __decorateParam(8, INotificationService),
  __decorateParam(9, IAccessibilitySignalService),
  __decorateParam(10, IContextMenuService),
  __decorateParam(11, IConfigurationService),
  __decorateParam(12, IMenuService)
], NotificationsCenter);
export {
  NotificationsCenter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxub3RpZmljYXRpb25zXFxub3RpZmljYXRpb25zQ2VudGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL25vdGlmaWNhdGlvbnNDZW50ZXIuY3NzJztcbmltcG9ydCAnLi9tZWRpYS9ub3RpZmljYXRpb25zQWN0aW9ucy5jc3MnO1xuaW1wb3J0IHsgTk9USUZJQ0FUSU9OU19DRU5URVJfSEVBREVSX0ZPUkVHUk9VTkQsIE5PVElGSUNBVElPTlNfQ0VOVEVSX0hFQURFUl9CQUNLR1JPVU5ELCBOT1RJRklDQVRJT05TX0NFTlRFUl9CT1JERVIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSwgVGhlbWFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25zTW9kZWwsIElOb3RpZmljYXRpb25DaGFuZ2VFdmVudCwgTm90aWZpY2F0aW9uQ2hhbmdlVHlwZSwgTm90aWZpY2F0aW9uVmlld0l0ZW1Db250ZW50Q2hhbmdlS2luZCwgTm90aWZpY2F0aW9uc1NldHRpbmdzLCBOb3RpZmljYXRpb25zUG9zaXRpb24sIGdldE5vdGlmaWNhdGlvbnNQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RpZmljYXRpb25zLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBQYXJ0cyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvbnNDZW50ZXJDb250cm9sbGVyLCBOb3RpZmljYXRpb25BY3Rpb25SdW5uZXIgfSBmcm9tICcuL25vdGlmaWNhdGlvbnNDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBOb3RpZmljYXRpb25zTGlzdCB9IGZyb20gJy4vbm90aWZpY2F0aW9uc0xpc3QuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyAkLCBEaW1lbnNpb24sIGlzQW5jZXN0b3JPZkFjdGl2ZUVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IENsZWFyQWxsTm90aWZpY2F0aW9uc0FjdGlvbiwgQ29uZmlndXJlRG9Ob3REaXN0dXJiQWN0aW9uLCBDb25maWd1cmVOb3RpZmljYXRpb25zUG9zaXRpb25BY3Rpb24sIFRvZ2dsZURvTm90RGlzdHVyYkJ5U291cmNlQWN0aW9uLCBIaWRlTm90aWZpY2F0aW9uc0NlbnRlckFjdGlvbiwgVG9nZ2xlRG9Ob3REaXN0dXJiQWN0aW9uLCBoaWRlSWNvbiwgaGlkZVVwSWNvbiB9IGZyb20gJy4vbm90aWZpY2F0aW9uc0FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgU2VwYXJhdG9yLCB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0FsbERlZmluZWQsIGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgTm90aWZpY2F0aW9uc0NlbnRlclZpc2libGVDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBOb3RpZmljYXRpb25zRmlsdGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZHJvcGRvd24vZHJvcGRvd25BY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5U2lnbmFsLCBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0NVU1RPTV9USVRMRUJBUl9IRUlHSFQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgb25EaWRDaGFuZ2VOb3RpZmljYXRpb25Sb3dIZWlnaHQgfSBmcm9tICcuL25vdGlmaWNhdGlvbnNWaWV3ZXIuanMnO1xuXG5leHBvcnQgY2xhc3MgTm90aWZpY2F0aW9uc0NlbnRlciBleHRlbmRzIFRoZW1hYmxlIGltcGxlbWVudHMgSU5vdGlmaWNhdGlvbnNDZW50ZXJDb250cm9sbGVyIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfRElNRU5TSU9OUyA9IG5ldyBEaW1lbnNpb24oNDUwLCA0MDApO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1BWF9OT1RJRklDQVRJT05fU09VUkNFUyA9IDEwOyAvLyBtYXhpbXVtIG51bWJlciBvZiBub3RpZmljYXRpb24gc291cmNlcyB0byBzaG93IGluIGNvbmZpZ3VyZSBkcm9wZG93blxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVmlzaWJpbGl0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZpc2liaWxpdHkgPSB0aGlzLl9vbkRpZENoYW5nZVZpc2liaWxpdHkuZXZlbnQ7XG5cblx0cHJpdmF0ZSBub3RpZmljYXRpb25zQ2VudGVyQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBub3RpZmljYXRpb25zQ2VudGVySGVhZGVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBub3RpZmljYXRpb25zQ2VudGVyVGl0bGU6IEhUTUxTcGFuRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBub3RpZmljYXRpb25zTGlzdDogTm90aWZpY2F0aW9uc0xpc3QgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2lzVmlzaWJsZTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB3b3JrYmVuY2hEaW1lbnNpb25zOiBEaW1lbnNpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uc0NlbnRlclZpc2libGVDb250ZXh0S2V5O1xuXHRwcml2YXRlIGNsZWFyQWxsQWN0aW9uOiBDbGVhckFsbE5vdGlmaWNhdGlvbnNBY3Rpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY29uZmlndXJlRG9Ob3REaXN0dXJiQWN0aW9uOiBDb25maWd1cmVEb05vdERpc3R1cmJBY3Rpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaGlkZUFjdGlvbjogSGlkZU5vdGlmaWNhdGlvbnNDZW50ZXJBY3Rpb24gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbW9kZWw6IElOb3RpZmljYXRpb25zTW9kZWwsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIodGhlbWVTZXJ2aWNlKTtcblxuXHRcdHRoaXMubm90aWZpY2F0aW9uc0NlbnRlclZpc2libGVDb250ZXh0S2V5ID0gTm90aWZpY2F0aW9uc0NlbnRlclZpc2libGVDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubW9kZWwub25EaWRDaGFuZ2VOb3RpZmljYXRpb24oZSA9PiB0aGlzLm9uRGlkQ2hhbmdlTm90aWZpY2F0aW9uKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYXlvdXRTZXJ2aWNlLm9uRGlkTGF5b3V0TWFpbkNvbnRhaW5lcihkaW1lbnNpb24gPT4gdGhpcy5sYXlvdXQoRGltZW5zaW9uLmxpZnQoZGltZW5zaW9uKSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VGaWx0ZXIoKCkgPT4gdGhpcy5vbkRpZENoYW5nZUZpbHRlcigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RpZmljYXRpb25zU2V0dGluZ3MuTk9USUZJQ0FUSU9OU19QT1NJVElPTikpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVQb3NpdGlvbkNsYXNzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVQb3NpdGlvbkNsYXNzKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5ub3RpZmljYXRpb25zQ2VudGVyQ29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcG9zaXRpb24gPSBnZXROb3RpZmljYXRpb25zUG9zaXRpb24odGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5ub3RpZmljYXRpb25zQ2VudGVyQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2JvdHRvbS1yaWdodCcsICdib3R0b20tbGVmdCcsICd0b3AtcmlnaHQnKTtcblx0XHR0aGlzLm5vdGlmaWNhdGlvbnNDZW50ZXJDb250YWluZXIuY2xhc3NMaXN0LmFkZChwb3NpdGlvbik7XG5cblx0XHR0aGlzLnVwZGF0ZUhpZGVBY3Rpb25JY29uKCk7XG5cdFx0dGhpcy51cGRhdGVUb3BPZmZzZXQoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlSGlkZUFjdGlvbkljb24oKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmhpZGVBY3Rpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwb3NpdGlvbiA9IGdldE5vdGlmaWNhdGlvbnNQb3NpdGlvbih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLmhpZGVBY3Rpb24uY2xhc3MgPSBUaGVtZUljb24uYXNDbGFzc05hbWUocG9zaXRpb24gPT09IE5vdGlmaWNhdGlvbnNQb3NpdGlvbi5UT1BfUklHSFQgPyBoaWRlVXBJY29uIDogaGlkZUljb24pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVUb3BPZmZzZXQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm5vdGlmaWNhdGlvbnNDZW50ZXJDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwb3NpdGlvbiA9IGdldE5vdGlmaWNhdGlvbnNQb3NpdGlvbih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRpZiAocG9zaXRpb24gPT09IE5vdGlmaWNhdGlvbnNQb3NpdGlvbi5UT1BfUklHSFQpIHtcblx0XHRcdGxldCB0b3BPZmZzZXQgPSA3O1xuXHRcdFx0aWYgKHRoaXMubGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuVElUTEVCQVJfUEFSVCwgbWFpbldpbmRvdykpIHtcblx0XHRcdFx0dG9wT2Zmc2V0ICs9IERFRkFVTFRfQ1VTVE9NX1RJVExFQkFSX0hFSUdIVDtcblx0XHRcdH1cblx0XHRcdHRoaXMubm90aWZpY2F0aW9uc0NlbnRlckNvbnRhaW5lci5zdHlsZS50b3AgPSBgJHt0b3BPZmZzZXR9cHhgO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvbnNDZW50ZXJDb250YWluZXIuc3R5bGUudG9wID0gJyc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZUZpbHRlcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmdldEZpbHRlcigpID09PSBOb3RpZmljYXRpb25zRmlsdGVyLkVSUk9SKSB7XG5cdFx0XHR0aGlzLmhpZGUoKTsgLy8gaGlkZSB0aGUgbm90aWZpY2F0aW9uIGNlbnRlciB3aGVuIHdlIGhhdmUgYSBlcnJvciBmaWx0ZXIgZW5hYmxlZFxuXHRcdH1cblx0fVxuXG5cdGdldCBpc1Zpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5faXNWaXNpYmxlO1xuXHR9XG5cblx0c2hvdygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNWaXNpYmxlKSB7XG5cdFx0XHRjb25zdCBub3RpZmljYXRpb25zTGlzdCA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMubm90aWZpY2F0aW9uc0xpc3QpO1xuXG5cdFx0XHQvLyBNYWtlIHZpc2libGVcblx0XHRcdG5vdGlmaWNhdGlvbnNMaXN0LnNob3coKTtcblxuXHRcdFx0Ly8gRm9jdXMgZmlyc3Rcblx0XHRcdG5vdGlmaWNhdGlvbnNMaXN0LmZvY3VzRmlyc3QoKTtcblxuXHRcdFx0cmV0dXJuOyAvLyBhbHJlYWR5IHZpc2libGVcblx0XHR9XG5cblx0XHQvLyBMYXppbHkgY3JlYXRlIGlmIHNob3dpbmcgZm9yIHRoZSBmaXJzdCB0aW1lXG5cdFx0aWYgKCF0aGlzLm5vdGlmaWNhdGlvbnNDZW50ZXJDb250YWluZXIpIHtcblx0XHRcdHRoaXMuY3JlYXRlKCk7XG5cdFx0fVxuXG5cdFx0Ly8gVGl0bGVcblx0XHR0aGlzLnVwZGF0ZVRpdGxlKCk7XG5cblx0XHQvLyBNYWtlIHZpc2libGVcblx0XHRjb25zdCBbbm90aWZpY2F0aW9uc0xpc3QsIG5vdGlmaWNhdGlvbnNDZW50ZXJDb250YWluZXJdID0gYXNzZXJ0UmV0dXJuc0FsbERlZmluZWQodGhpcy5ub3RpZmljYXRpb25zTGlzdCwgdGhpcy5ub3RpZmljYXRpb25zQ2VudGVyQ29udGFpbmVyKTtcblx0XHR0aGlzLl9pc1Zpc2libGUgPSB0cnVlO1xuXHRcdG5vdGlmaWNhdGlvbnNDZW50ZXJDb250YWluZXIuY2xhc3NMaXN0LmFkZCgndmlzaWJsZScpO1xuXHRcdG5vdGlmaWNhdGlvbnNMaXN0LnNob3coKTtcblxuXHRcdC8vIExheW91dFxuXHRcdHRoaXMubGF5b3V0KHRoaXMud29ya2JlbmNoRGltZW5zaW9ucyk7XG5cblx0XHQvLyBTaG93IGFsbCBub3RpZmljYXRpb25zIHRoYXQgYXJlIHByZXNlbnQgbm93XG5cdFx0bm90aWZpY2F0aW9uc0xpc3QudXBkYXRlTm90aWZpY2F0aW9uc0xpc3QoMCwgMCwgdGhpcy5tb2RlbC5ub3RpZmljYXRpb25zKTtcblxuXHRcdC8vIEZvY3VzIGZpcnN0XG5cdFx0bm90aWZpY2F0aW9uc0xpc3QuZm9jdXNGaXJzdCgpO1xuXG5cdFx0Ly8gVGhlbWluZ1xuXHRcdHRoaXMudXBkYXRlU3R5bGVzKCk7XG5cblx0XHQvLyBNYXJrIGFzIHZpc2libGVcblx0XHR0aGlzLm1vZGVsLm5vdGlmaWNhdGlvbnMuZm9yRWFjaChub3RpZmljYXRpb24gPT4gbm90aWZpY2F0aW9uLnVwZGF0ZVZpc2liaWxpdHkodHJ1ZSkpO1xuXG5cdFx0Ly8gQ29udGV4dCBLZXlcblx0XHR0aGlzLm5vdGlmaWNhdGlvbnNDZW50ZXJWaXNpYmxlQ29udGV4dEtleS5zZXQodHJ1ZSk7XG5cblx0XHQvLyBFdmVudFxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVRpdGxlKCk6IHZvaWQge1xuXHRcdGNvbnN0IFtub3RpZmljYXRpb25zQ2VudGVyVGl0bGUsIGNsZWFyQWxsQWN0aW9uXSA9IGFzc2VydFJldHVybnNBbGxEZWZpbmVkKHRoaXMubm90aWZpY2F0aW9uc0NlbnRlclRpdGxlLCB0aGlzLmNsZWFyQWxsQWN0aW9uKTtcblxuXHRcdGlmICh0aGlzLm1vZGVsLm5vdGlmaWNhdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRub3RpZmljYXRpb25zQ2VudGVyVGl0bGUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbm90aWZpY2F0aW9uc0VtcHR5JywgXCJObyBuZXcgbm90aWZpY2F0aW9uc1wiKTtcblx0XHRcdGNsZWFyQWxsQWN0aW9uLmVuYWJsZWQgPSBmYWxzZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bm90aWZpY2F0aW9uc0NlbnRlclRpdGxlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ25vdGlmaWNhdGlvbnMnLCBcIk5vdGlmaWNhdGlvbnNcIik7XG5cdFx0XHRjbGVhckFsbEFjdGlvbi5lbmFibGVkID0gdGhpcy5tb2RlbC5ub3RpZmljYXRpb25zLnNvbWUobm90aWZpY2F0aW9uID0+ICFub3RpZmljYXRpb24uaGFzUHJvZ3Jlc3MpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlKCk6IHZvaWQge1xuXG5cdFx0Ly8gQ29udGFpbmVyXG5cdFx0dGhpcy5ub3RpZmljYXRpb25zQ2VudGVyQ29udGFpbmVyID0gJCgnLm5vdGlmaWNhdGlvbnMtY2VudGVyJyk7XG5cblx0XHQvLyBBcHBseSBwb3NpdGlvbiBjbGFzc1xuXHRcdHRoaXMudXBkYXRlUG9zaXRpb25DbGFzcygpO1xuXG5cdFx0Ly8gSGVhZGVyXG5cdFx0dGhpcy5ub3RpZmljYXRpb25zQ2VudGVySGVhZGVyID0gJCgnLm5vdGlmaWNhdGlvbnMtY2VudGVyLWhlYWRlcicpO1xuXHRcdHRoaXMubm90aWZpY2F0aW9uc0NlbnRlckNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLm5vdGlmaWNhdGlvbnNDZW50ZXJIZWFkZXIpO1xuXG5cdFx0Ly8gSGVhZGVyIFRpdGxlXG5cdFx0dGhpcy5ub3RpZmljYXRpb25zQ2VudGVyVGl0bGUgPSAkKCdzcGFuLm5vdGlmaWNhdGlvbnMtY2VudGVyLWhlYWRlci10aXRsZScpO1xuXHRcdHRoaXMubm90aWZpY2F0aW9uc0NlbnRlckhlYWRlci5hcHBlbmRDaGlsZCh0aGlzLm5vdGlmaWNhdGlvbnNDZW50ZXJUaXRsZSk7XG5cblx0XHQvLyBIZWFkZXIgVG9vbGJhclxuXHRcdGNvbnN0IHRvb2xiYXJDb250YWluZXIgPSAkKCcubm90aWZpY2F0aW9ucy1jZW50ZXItaGVhZGVyLXRvb2xiYXInKTtcblx0XHR0aGlzLm5vdGlmaWNhdGlvbnNDZW50ZXJIZWFkZXIuYXBwZW5kQ2hpbGQodG9vbGJhckNvbnRhaW5lcik7XG5cblx0XHRjb25zdCBhY3Rpb25SdW5uZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGlmaWNhdGlvbkFjdGlvblJ1bm5lcikpO1xuXG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uc1Rvb2xCYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uQmFyKHRvb2xiYXJDb250YWluZXIsIHtcblx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ25vdGlmaWNhdGlvbnNUb29sYmFyJywgXCJOb3RpZmljYXRpb24gQ2VudGVyIEFjdGlvbnNcIiksXG5cdFx0XHRhY3Rpb25SdW5uZXIsXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdGlmIChhY3Rpb24uaWQgPT09IENvbmZpZ3VyZU5vdGlmaWNhdGlvbnNQb3NpdGlvbkFjdGlvbi5JRCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIHtcblx0XHRcdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IFNlcGFyYXRvci5qb2luKC4uLnRoaXMubWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoTWVudUlkLk5vdGlmaWNhdGlvbnNDZW50ZXJQb3NpdGlvbk1lbnUsIHRoaXMuY29udGV4dEtleVNlcnZpY2UpLm1hcCgoWywgYWN0aW9uc10pID0+IGFjdGlvbnMpKSxcblx0XHRcdFx0XHR9LCB0aGlzLmNvbnRleHRNZW51U2VydmljZSwge1xuXHRcdFx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0XHRcdGFjdGlvblJ1bm5lcixcblx0XHRcdFx0XHRcdGNsYXNzTmFtZXM6IGFjdGlvbi5jbGFzcyxcblx0XHRcdFx0XHRcdGtleWJpbmRpbmdQcm92aWRlcjogYWN0aW9uID0+IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhhY3Rpb24uaWQpXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gQ29uZmlndXJlRG9Ob3REaXN0dXJiQWN0aW9uLklEKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwge1xuXHRcdFx0XHRcdFx0Z2V0QWN0aW9ucygpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgYWN0aW9ucyA9IFt0b0FjdGlvbih7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6IFRvZ2dsZURvTm90RGlzdHVyYkFjdGlvbi5JRCxcblx0XHRcdFx0XHRcdFx0XHRsYWJlbDogdGhhdC5ub3RpZmljYXRpb25TZXJ2aWNlLmdldEZpbHRlcigpID09PSBOb3RpZmljYXRpb25zRmlsdGVyLk9GRiA/IGxvY2FsaXplKCd0dXJuT25Ob3RpZmljYXRpb25zJywgXCJFbmFibGUgRG8gTm90IERpc3R1cmIgTW9kZVwiKSA6IGxvY2FsaXplKCd0dXJuT2ZmTm90aWZpY2F0aW9ucycsIFwiRGlzYWJsZSBEbyBOb3QgRGlzdHVyYiBNb2RlXCIpLFxuXHRcdFx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhhdC5ub3RpZmljYXRpb25TZXJ2aWNlLnNldEZpbHRlcih0aGF0Lm5vdGlmaWNhdGlvblNlcnZpY2UuZ2V0RmlsdGVyKCkgPT09IE5vdGlmaWNhdGlvbnNGaWx0ZXIuT0ZGID8gTm90aWZpY2F0aW9uc0ZpbHRlci5FUlJPUiA6IE5vdGlmaWNhdGlvbnNGaWx0ZXIuT0ZGKVxuXHRcdFx0XHRcdFx0XHR9KV07XG5cblx0XHRcdFx0XHRcdFx0Y29uc3Qgc29ydGVkRmlsdGVycyA9IHRoYXQubm90aWZpY2F0aW9uU2VydmljZS5nZXRGaWx0ZXJzKCkuc29ydCgoYSwgYikgPT4gYS5sYWJlbC5sb2NhbGVDb21wYXJlKGIubGFiZWwpKTtcblx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBzb3VyY2Ugb2Ygc29ydGVkRmlsdGVycy5zbGljZSgwLCBOb3RpZmljYXRpb25zQ2VudGVyLk1BWF9OT1RJRklDQVRJT05fU09VUkNFUykpIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoYWN0aW9ucy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRcdGFjdGlvbnMucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZDogYCR7VG9nZ2xlRG9Ob3REaXN0dXJiQWN0aW9uLklEfS4ke3NvdXJjZS5pZH1gLFxuXHRcdFx0XHRcdFx0XHRcdFx0bGFiZWw6IHNvdXJjZS5sYWJlbCxcblx0XHRcdFx0XHRcdFx0XHRcdGNoZWNrZWQ6IHNvdXJjZS5maWx0ZXIgIT09IE5vdGlmaWNhdGlvbnNGaWx0ZXIuRVJST1IsXG5cdFx0XHRcdFx0XHRcdFx0XHRydW46ICgpID0+IHRoYXQubm90aWZpY2F0aW9uU2VydmljZS5zZXRGaWx0ZXIoe1xuXHRcdFx0XHRcdFx0XHRcdFx0XHQuLi5zb3VyY2UsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGZpbHRlcjogc291cmNlLmZpbHRlciA9PT0gTm90aWZpY2F0aW9uc0ZpbHRlci5FUlJPUiA/IE5vdGlmaWNhdGlvbnNGaWx0ZXIuT0ZGIDogTm90aWZpY2F0aW9uc0ZpbHRlci5FUlJPUlxuXHRcdFx0XHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRpZiAoc29ydGVkRmlsdGVycy5sZW5ndGggPiBOb3RpZmljYXRpb25zQ2VudGVyLk1BWF9OT1RJRklDQVRJT05fU09VUkNFUykge1xuXHRcdFx0XHRcdFx0XHRcdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdFx0XHRcdFx0XHRcdGFjdGlvbnMucHVzaCh0aGF0Ll9yZWdpc3Rlcih0aGF0Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRvZ2dsZURvTm90RGlzdHVyYkJ5U291cmNlQWN0aW9uLCBUb2dnbGVEb05vdERpc3R1cmJCeVNvdXJjZUFjdGlvbi5JRCwgbG9jYWxpemUoJ21vcmVTb3VyY2VzJywgXCJNb3JlXHUyMDI2XCIpKSkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0cmV0dXJuIGFjdGlvbnM7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0sIHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLCB7XG5cdFx0XHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHRcdFx0YWN0aW9uUnVubmVyLFxuXHRcdFx0XHRcdFx0Y2xhc3NOYW1lczogYWN0aW9uLmNsYXNzLFxuXHRcdFx0XHRcdFx0a2V5YmluZGluZ1Byb3ZpZGVyOiBhY3Rpb24gPT4gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5pZClcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gY3JlYXRlQWN0aW9uVmlld0l0ZW0odGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgYWN0aW9uLCBvcHRpb25zKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLmNsZWFyQWxsQWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDbGVhckFsbE5vdGlmaWNhdGlvbnNBY3Rpb24sIENsZWFyQWxsTm90aWZpY2F0aW9uc0FjdGlvbi5JRCwgQ2xlYXJBbGxOb3RpZmljYXRpb25zQWN0aW9uLkxBQkVMKSk7XG5cdFx0bm90aWZpY2F0aW9uc1Rvb2xCYXIucHVzaCh0aGlzLmNsZWFyQWxsQWN0aW9uLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSwga2V5YmluZGluZzogdGhpcy5nZXRLZXliaW5kaW5nTGFiZWwodGhpcy5jbGVhckFsbEFjdGlvbikgfSk7XG5cblx0XHR0aGlzLmNvbmZpZ3VyZURvTm90RGlzdHVyYkFjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29uZmlndXJlRG9Ob3REaXN0dXJiQWN0aW9uLCBDb25maWd1cmVEb05vdERpc3R1cmJBY3Rpb24uSUQsIENvbmZpZ3VyZURvTm90RGlzdHVyYkFjdGlvbi5MQUJFTCkpO1xuXHRcdG5vdGlmaWNhdGlvbnNUb29sQmFyLnB1c2godGhpcy5jb25maWd1cmVEb05vdERpc3R1cmJBY3Rpb24sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXG5cdFx0Y29uc3QgY29uZmlndXJlTm90aWZpY2F0aW9uc1Bvc2l0aW9uQWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb25maWd1cmVOb3RpZmljYXRpb25zUG9zaXRpb25BY3Rpb24sIENvbmZpZ3VyZU5vdGlmaWNhdGlvbnNQb3NpdGlvbkFjdGlvbi5JRCwgQ29uZmlndXJlTm90aWZpY2F0aW9uc1Bvc2l0aW9uQWN0aW9uLkxBQkVMKSk7XG5cdFx0bm90aWZpY2F0aW9uc1Rvb2xCYXIucHVzaChjb25maWd1cmVOb3RpZmljYXRpb25zUG9zaXRpb25BY3Rpb24sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXG5cdFx0dGhpcy5oaWRlQWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShIaWRlTm90aWZpY2F0aW9uc0NlbnRlckFjdGlvbiwgSGlkZU5vdGlmaWNhdGlvbnNDZW50ZXJBY3Rpb24uSUQsIEhpZGVOb3RpZmljYXRpb25zQ2VudGVyQWN0aW9uLkxBQkVMKSk7XG5cdFx0dGhpcy51cGRhdGVIaWRlQWN0aW9uSWNvbigpO1xuXHRcdG5vdGlmaWNhdGlvbnNUb29sQmFyLnB1c2godGhpcy5oaWRlQWN0aW9uLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSwga2V5YmluZGluZzogdGhpcy5nZXRLZXliaW5kaW5nTGFiZWwodGhpcy5oaWRlQWN0aW9uKSB9KTtcblxuXHRcdC8vIE5vdGlmaWNhdGlvbnMgTGlzdFxuXHRcdHRoaXMubm90aWZpY2F0aW9uc0xpc3QgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGlmaWNhdGlvbnNMaXN0LCB0aGlzLm5vdGlmaWNhdGlvbnNDZW50ZXJDb250YWluZXIsIHtcblx0XHRcdHdpZGdldEFyaWFMYWJlbDogbG9jYWxpemUoJ25vdGlmaWNhdGlvbnNDZW50ZXJXaWRnZXRBcmlhTGFiZWwnLCBcIk5vdGlmaWNhdGlvbnMgQ2VudGVyXCIpXG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG9uRGlkQ2hhbmdlTm90aWZpY2F0aW9uUm93SGVpZ2h0KCgpID0+IHRoaXMubm90aWZpY2F0aW9uc0xpc3Q/LnVwZGF0ZU5vdGlmaWNhdGlvbkhlaWdodHMoKSkpO1xuXHRcdHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMubm90aWZpY2F0aW9uc0NlbnRlckNvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIGdldEtleWJpbmRpbmdMYWJlbChhY3Rpb246IElBY3Rpb24pOiBzdHJpbmcgfCBudWxsIHtcblx0XHRjb25zdCBrZXliaW5kaW5nID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5pZCk7XG5cblx0XHRyZXR1cm4ga2V5YmluZGluZyA/IGtleWJpbmRpbmcuZ2V0TGFiZWwoKSA6IG51bGw7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlTm90aWZpY2F0aW9uKGU6IElOb3RpZmljYXRpb25DaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faXNWaXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47IC8vIG9ubHkgaWYgdmlzaWJsZVxuXHRcdH1cblxuXHRcdGxldCBmb2N1c0VkaXRvciA9IGZhbHNlO1xuXG5cdFx0Ly8gVXBkYXRlIG5vdGlmaWNhdGlvbnMgbGlzdCBiYXNlZCBvbiBldmVudCBraW5kXG5cdFx0Y29uc3QgW25vdGlmaWNhdGlvbnNMaXN0LCBub3RpZmljYXRpb25zQ2VudGVyQ29udGFpbmVyXSA9IGFzc2VydFJldHVybnNBbGxEZWZpbmVkKHRoaXMubm90aWZpY2F0aW9uc0xpc3QsIHRoaXMubm90aWZpY2F0aW9uc0NlbnRlckNvbnRhaW5lcik7XG5cdFx0c3dpdGNoIChlLmtpbmQpIHtcblx0XHRcdGNhc2UgTm90aWZpY2F0aW9uQ2hhbmdlVHlwZS5BREQ6XG5cdFx0XHRcdG5vdGlmaWNhdGlvbnNMaXN0LnVwZGF0ZU5vdGlmaWNhdGlvbnNMaXN0KGUuaW5kZXgsIDAsIFtlLml0ZW1dKTtcblx0XHRcdFx0ZS5pdGVtLnVwZGF0ZVZpc2liaWxpdHkodHJ1ZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBOb3RpZmljYXRpb25DaGFuZ2VUeXBlLkNIQU5HRTpcblx0XHRcdFx0Ly8gSGFuZGxlIGNvbnRlbnQgY2hhbmdlc1xuXHRcdFx0XHQvLyAtIGFjdGlvbnM6IHJlLWRyYXcgdG8gcHJvcGVybHkgc2hvdyB0aGVtXG5cdFx0XHRcdC8vIC0gbWVzc2FnZTogdXBkYXRlIG5vdGlmaWNhdGlvbiBoZWlnaHQgdW5sZXNzIGNvbGxhcHNlZFxuXHRcdFx0XHRzd2l0Y2ggKGUuZGV0YWlsKSB7XG5cdFx0XHRcdFx0Y2FzZSBOb3RpZmljYXRpb25WaWV3SXRlbUNvbnRlbnRDaGFuZ2VLaW5kLkFDVElPTlM6XG5cdFx0XHRcdFx0XHRub3RpZmljYXRpb25zTGlzdC51cGRhdGVOb3RpZmljYXRpb25zTGlzdChlLmluZGV4LCAxLCBbZS5pdGVtXSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIE5vdGlmaWNhdGlvblZpZXdJdGVtQ29udGVudENoYW5nZUtpbmQuTUVTU0FHRTpcblx0XHRcdFx0XHRcdGlmIChlLml0ZW0uZXhwYW5kZWQpIHtcblx0XHRcdFx0XHRcdFx0bm90aWZpY2F0aW9uc0xpc3QudXBkYXRlTm90aWZpY2F0aW9uSGVpZ2h0KGUuaXRlbSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgTm90aWZpY2F0aW9uQ2hhbmdlVHlwZS5FWFBBTkRfQ09MTEFQU0U6XG5cdFx0XHRcdC8vIFJlLWRyYXcgZW50aXJlIGl0ZW0gd2hlbiBleHBhbnNpb24gY2hhbmdlcyB0byByZXZlYWwgb3IgaGlkZSBkZXRhaWxzXG5cdFx0XHRcdG5vdGlmaWNhdGlvbnNMaXN0LnVwZGF0ZU5vdGlmaWNhdGlvbnNMaXN0KGUuaW5kZXgsIDEsIFtlLml0ZW1dKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIE5vdGlmaWNhdGlvbkNoYW5nZVR5cGUuUkVNT1ZFOlxuXHRcdFx0XHRmb2N1c0VkaXRvciA9IGlzQW5jZXN0b3JPZkFjdGl2ZUVsZW1lbnQobm90aWZpY2F0aW9uc0NlbnRlckNvbnRhaW5lcik7XG5cdFx0XHRcdG5vdGlmaWNhdGlvbnNMaXN0LnVwZGF0ZU5vdGlmaWNhdGlvbnNMaXN0KGUuaW5kZXgsIDEpO1xuXHRcdFx0XHRlLml0ZW0udXBkYXRlVmlzaWJpbGl0eShmYWxzZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSB0aXRsZVxuXHRcdHRoaXMudXBkYXRlVGl0bGUoKTtcblxuXHRcdC8vIEhpZGUgaWYgbm8gbW9yZSBub3RpZmljYXRpb25zIHRvIHNob3dcblx0XHRpZiAodGhpcy5tb2RlbC5ub3RpZmljYXRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5oaWRlKCk7XG5cblx0XHRcdC8vIFJlc3RvcmUgZm9jdXMgdG8gZWRpdG9yIGdyb3VwIGlmIHdlIGhhZCBmb2N1c1xuXHRcdFx0aWYgKGZvY3VzRWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwLmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aGlkZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzVmlzaWJsZSB8fCAhdGhpcy5ub3RpZmljYXRpb25zQ2VudGVyQ29udGFpbmVyIHx8ICF0aGlzLm5vdGlmaWNhdGlvbnNMaXN0KSB7XG5cdFx0XHRyZXR1cm47IC8vIGFscmVhZHkgaGlkZGVuXG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9jdXNFZGl0b3IgPSBpc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50KHRoaXMubm90aWZpY2F0aW9uc0NlbnRlckNvbnRhaW5lcik7XG5cblx0XHQvLyBIaWRlXG5cdFx0dGhpcy5faXNWaXNpYmxlID0gZmFsc2U7XG5cdFx0dGhpcy5ub3RpZmljYXRpb25zQ2VudGVyQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ3Zpc2libGUnKTtcblx0XHR0aGlzLm5vdGlmaWNhdGlvbnNMaXN0LmhpZGUoKTtcblxuXHRcdC8vIE1hcmsgYXMgaGlkZGVuXG5cdFx0dGhpcy5tb2RlbC5ub3RpZmljYXRpb25zLmZvckVhY2gobm90aWZpY2F0aW9uID0+IG5vdGlmaWNhdGlvbi51cGRhdGVWaXNpYmlsaXR5KGZhbHNlKSk7XG5cblx0XHQvLyBDb250ZXh0IEtleVxuXHRcdHRoaXMubm90aWZpY2F0aW9uc0NlbnRlclZpc2libGVDb250ZXh0S2V5LnNldChmYWxzZSk7XG5cblx0XHQvLyBFdmVudFxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5maXJlKCk7XG5cblx0XHQvLyBSZXN0b3JlIGZvY3VzIHRvIGVkaXRvciBncm91cCBpZiB3ZSBoYWQgZm9jdXNcblx0XHRpZiAoZm9jdXNFZGl0b3IpIHtcblx0XHRcdHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwLmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlU3R5bGVzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLm5vdGlmaWNhdGlvbnNDZW50ZXJDb250YWluZXIgJiYgdGhpcy5ub3RpZmljYXRpb25zQ2VudGVySGVhZGVyKSB7XG5cblx0XHRcdGNvbnN0IGJvcmRlckNvbG9yID0gdGhpcy5nZXRDb2xvcihOT1RJRklDQVRJT05TX0NFTlRFUl9CT1JERVIpO1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25zQ2VudGVyQ29udGFpbmVyLnN0eWxlLmJvcmRlciA9IGJvcmRlckNvbG9yID8gYDFweCBzb2xpZCAke2JvcmRlckNvbG9yfWAgOiAnJztcblxuXHRcdFx0Y29uc3QgaGVhZGVyRm9yZWdyb3VuZCA9IHRoaXMuZ2V0Q29sb3IoTk9USUZJQ0FUSU9OU19DRU5URVJfSEVBREVSX0ZPUkVHUk9VTkQpO1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25zQ2VudGVySGVhZGVyLnN0eWxlLmNvbG9yID0gaGVhZGVyRm9yZWdyb3VuZCA/PyAnJztcblxuXHRcdFx0Y29uc3QgaGVhZGVyQmFja2dyb3VuZCA9IHRoaXMuZ2V0Q29sb3IoTk9USUZJQ0FUSU9OU19DRU5URVJfSEVBREVSX0JBQ0tHUk9VTkQpO1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25zQ2VudGVySGVhZGVyLnN0eWxlLmJhY2tncm91bmQgPSBoZWFkZXJCYWNrZ3JvdW5kID8/ICcnO1xuXG5cdFx0fVxuXHR9XG5cblx0bGF5b3V0KGRpbWVuc2lvbjogRGltZW5zaW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy53b3JrYmVuY2hEaW1lbnNpb25zID0gZGltZW5zaW9uO1xuXG5cdFx0aWYgKHRoaXMuX2lzVmlzaWJsZSAmJiB0aGlzLm5vdGlmaWNhdGlvbnNDZW50ZXJDb250YWluZXIpIHtcblx0XHRcdGNvbnN0IG1heFdpZHRoID0gTm90aWZpY2F0aW9uc0NlbnRlci5NQVhfRElNRU5TSU9OUy53aWR0aDtcblx0XHRcdGNvbnN0IG1heEhlaWdodCA9IE5vdGlmaWNhdGlvbnNDZW50ZXIuTUFYX0RJTUVOU0lPTlMuaGVpZ2h0O1xuXG5cdFx0XHRsZXQgYXZhaWxhYmxlV2lkdGggPSBtYXhXaWR0aDtcblx0XHRcdGxldCBhdmFpbGFibGVIZWlnaHQgPSBtYXhIZWlnaHQ7XG5cblx0XHRcdGlmICh0aGlzLndvcmtiZW5jaERpbWVuc2lvbnMpIHtcblxuXHRcdFx0XHQvLyBNYWtlIHN1cmUgbm90aWZpY2F0aW9ucyBhcmUgbm90IGV4Y2VkaW5nIGF2YWlsYWJsZSB3aWR0aFxuXHRcdFx0XHRhdmFpbGFibGVXaWR0aCA9IHRoaXMud29ya2JlbmNoRGltZW5zaW9ucy53aWR0aDtcblx0XHRcdFx0YXZhaWxhYmxlV2lkdGggLT0gKDIgKiA4KTsgLy8gYWRqdXN0IGZvciBwYWRkaW5ncyBsZWZ0IGFuZCByaWdodFxuXG5cdFx0XHRcdC8vIE1ha2Ugc3VyZSBub3RpZmljYXRpb25zIGFyZSBub3QgZXhjZWVkaW5nIGF2YWlsYWJsZSBoZWlnaHRcblx0XHRcdFx0YXZhaWxhYmxlSGVpZ2h0ID0gdGhpcy53b3JrYmVuY2hEaW1lbnNpb25zLmhlaWdodCAtIDM1IC8qIGhlYWRlciAqLztcblx0XHRcdFx0aWYgKHRoaXMubGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuU1RBVFVTQkFSX1BBUlQsIG1haW5XaW5kb3cpKSB7XG5cdFx0XHRcdFx0YXZhaWxhYmxlSGVpZ2h0IC09IDIyOyAvLyBhZGp1c3QgZm9yIHN0YXR1cyBiYXJcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0aGlzLmxheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLlRJVExFQkFSX1BBUlQsIG1haW5XaW5kb3cpKSB7XG5cdFx0XHRcdFx0YXZhaWxhYmxlSGVpZ2h0IC09IDIyOyAvLyBhZGp1c3QgZm9yIHRpdGxlIGJhclxuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXZhaWxhYmxlSGVpZ2h0IC09ICgyICogMTIpOyAvLyBhZGp1c3QgZm9yIHBhZGRpbmdzIHRvcCBhbmQgYm90dG9tXG5cdFx0XHR9XG5cblx0XHRcdC8vIFVwZGF0ZSBwb3NpdGlvbiBvZmZzZXRcblx0XHRcdHRoaXMudXBkYXRlVG9wT2Zmc2V0KCk7XG5cblx0XHRcdC8vIEFwcGx5IHRvIGxpc3Rcblx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvbnNMaXN0ID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5ub3RpZmljYXRpb25zTGlzdCk7XG5cdFx0XHRub3RpZmljYXRpb25zTGlzdC5sYXlvdXQoTWF0aC5taW4obWF4V2lkdGgsIGF2YWlsYWJsZVdpZHRoKSwgTWF0aC5taW4obWF4SGVpZ2h0LCBhdmFpbGFibGVIZWlnaHQpKTtcblx0XHR9XG5cdH1cblxuXHRjbGVhckFsbCgpOiB2b2lkIHtcblxuXHRcdC8vIEhpZGUgbm90aWZpY2F0aW9ucyBjZW50ZXIgZmlyc3Rcblx0XHR0aGlzLmhpZGUoKTtcblxuXHRcdC8vIENsb3NlIGFsbFxuXHRcdGZvciAoY29uc3Qgbm90aWZpY2F0aW9uIG9mIFsuLi50aGlzLm1vZGVsLm5vdGlmaWNhdGlvbnNdIC8qIGNvcHkgYXJyYXkgc2luY2Ugd2UgbW9kaWZ5IGl0IGZyb20gY2xvc2luZyAqLykge1xuXHRcdFx0aWYgKCFub3RpZmljYXRpb24uaGFzUHJvZ3Jlc3MpIHtcblx0XHRcdFx0bm90aWZpY2F0aW9uLmNsb3NlKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC5jbGVhcik7XG5cdFx0fVxuXHR9XG59XG5cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLE9BQU87QUFDUCxTQUFTLHdDQUF3Qyx3Q0FBd0MsbUNBQW1DO0FBQzVILFNBQVMsZUFBZSxnQkFBZ0I7QUFDeEMsU0FBd0Qsd0JBQXdCLHVDQUF1Qyx1QkFBdUIsdUJBQXVCLGdDQUFnQztBQUNyTSxTQUFTLHlCQUF5QixhQUFhO0FBQy9DLFNBQVMsZUFBZTtBQUN4QixTQUFTLDBCQUEwQjtBQUNuQyxTQUF5QyxnQ0FBZ0M7QUFDekUsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxHQUFHLFdBQVcsaUNBQWlDO0FBQ3hELFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsNkJBQTZCLDZCQUE2Qixz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SyxTQUFTLHNDQUFzQztBQUM3RSxXQUFLLDBCQUEwQixNQUFNLFFBQVEsb0JBQW9CO0FBRWpFLFlBQU0sbUJBQW1CLEtBQUssU0FBUyxzQ0FBc0M7QUFDN0UsV0FBSywwQkFBMEIsTUFBTSxhQUFhLG9CQUFvQjtBQUFBLElBRXZFO0FBQUEsRUFDRDtBQUFBLEVBRUEsT0FBTyxXQUF3QztBQUM5QyxTQUFLLHNCQUFzQjtBQUUzQixRQUFJLEtBQUssY0FBYyxLQUFLLDhCQUE4QjtBQUN6RCxZQUFNLFdBQVcsb0JBQW9CLGVBQWU7QUFDcEQsWUFBTSxZQUFZLG9CQUFvQixlQUFlO0FBRXJELFVBQUksaUJBQWlCO0FBQ3JCLFVBQUksa0JBQWtCO0FBRXRCLFVBQUksS0FBSyxxQkFBcUI7QUFHN0IseUJBQWlCLEtBQUssb0JBQW9CO0FBQzFDLDBCQUFtQixJQUFJO0FBR3ZCLDBCQUFrQixLQUFLLG9CQUFvQixTQUFTO0FBQ3BELFlBQUksS0FBSyxjQUFjLFVBQVUsTUFBTSxnQkFBZ0IsVUFBVSxHQUFHO0FBQ25FLDZCQUFtQjtBQUFBLFFBQ3BCO0FBRUEsWUFBSSxLQUFLLGNBQWMsVUFBVSxNQUFNLGVBQWUsVUFBVSxHQUFHO0FBQ2xFLDZCQUFtQjtBQUFBLFFBQ3BCO0FBRUEsMkJBQW9CLElBQUk7QUFBQSxNQUN6QjtBQUdBLFdBQUssZ0JBQWdCO0FBR3JCLFlBQU0sb0JBQW9CLHFCQUFxQixLQUFLLGlCQUFpQjtBQUNyRSx3QkFBa0IsT0FBTyxLQUFLLElBQUksVUFBVSxjQUFjLEdBQUcsS0FBSyxJQUFJLFdBQVcsZUFBZSxDQUFDO0FBQUEsSUFDbEc7QUFBQSxFQUNEO0FBQUEsRUFFQSxXQUFpQjtBQUdoQixTQUFLLEtBQUs7QUFHVixlQUFXLGdCQUFnQixDQUFDLEdBQUcsS0FBSyxNQUFNLGFBQWEsR0FBb0Q7QUFDMUcsVUFBSSxDQUFDLGFBQWEsYUFBYTtBQUM5QixxQkFBYSxNQUFNO0FBQUEsTUFDcEI7QUFDQSxXQUFLLDJCQUEyQixXQUFXLG9CQUFvQixLQUFLO0FBQUEsSUFDckU7QUFBQSxFQUNEO0FBQ0Q7QUFwYWEsb0JBRVksaUJBQWlCLElBQUksVUFBVSxLQUFLLEdBQUc7QUFGbkQsb0JBSVksMkJBQTJCO0FBSnZDLHNCQUFOO0FBQUEsRUF1Qko7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FqQ1U7IiwKICAibmFtZXMiOiBbIm5vdGlmaWNhdGlvbnNMaXN0IiwgImFjdGlvbiJdCn0K
