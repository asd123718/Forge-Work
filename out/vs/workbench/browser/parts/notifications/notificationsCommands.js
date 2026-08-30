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
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { isNotificationViewItem, NotificationsPosition, NotificationsSettings } from "../../../common/notifications.js";
import { Action2, MenuRegistry, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { localize, localize2 } from "../../../../nls.js";
import { IListService, WorkbenchList } from "../../../../platform/list/browser/listService.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { NotificationFocusedContext, NotificationsCenterVisibleContext, NotificationsToastsVisibleContext } from "../../../common/contextkeys.js";
import { INotificationService, NotificationsFilter } from "../../../../platform/notification/common/notification.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ActionRunner } from "../../../../base/common/actions.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from "../../../../platform/accessibility/common/accessibility.js";
const SHOW_NOTIFICATIONS_CENTER = "notifications.showList";
const HIDE_NOTIFICATIONS_CENTER = "notifications.hideList";
const TOGGLE_NOTIFICATIONS_CENTER = "notifications.toggleList";
const HIDE_NOTIFICATION_TOAST = "notifications.hideToasts";
const FOCUS_NOTIFICATION_TOAST = "notifications.focusToasts";
const FOCUS_NEXT_NOTIFICATION_TOAST = "notifications.focusNextToast";
const FOCUS_PREVIOUS_NOTIFICATION_TOAST = "notifications.focusPreviousToast";
const FOCUS_FIRST_NOTIFICATION_TOAST = "notifications.focusFirstToast";
const FOCUS_LAST_NOTIFICATION_TOAST = "notifications.focusLastToast";
const COLLAPSE_NOTIFICATION = "notification.collapse";
const EXPAND_NOTIFICATION = "notification.expand";
const ACCEPT_PRIMARY_ACTION_NOTIFICATION = "notification.acceptPrimaryAction";
const TOGGLE_NOTIFICATION = "notification.toggle";
const CLEAR_NOTIFICATION = "notification.clear";
const CLEAR_ALL_NOTIFICATIONS = "notifications.clearAll";
const TOGGLE_DO_NOT_DISTURB_MODE = "notifications.toggleDoNotDisturbMode";
const TOGGLE_DO_NOT_DISTURB_MODE_BY_SOURCE = "notifications.toggleDoNotDisturbModeBySource";
function getNotificationFromContext(listService, context) {
  if (isNotificationViewItem(context)) {
    return context;
  }
  const list = listService.lastFocusedList;
  if (list instanceof WorkbenchList) {
    let element = list.getFocusedElements()[0];
    if (!isNotificationViewItem(element)) {
      if (list.isDOMFocused()) {
        element = list.element(0);
      }
    }
    if (isNotificationViewItem(element)) {
      return element;
    }
  }
  return void 0;
}
function registerNotificationCommands(center, toasts, model) {
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: SHOW_NOTIFICATIONS_CENTER,
    weight: KeybindingWeight.WorkbenchContrib,
    primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyN),
    handler: () => {
      toasts.hide();
      center.show();
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: HIDE_NOTIFICATIONS_CENTER,
    weight: KeybindingWeight.WorkbenchContrib + 50,
    when: NotificationsCenterVisibleContext,
    primary: KeyCode.Escape,
    handler: () => center.hide()
  });
  CommandsRegistry.registerCommand(TOGGLE_NOTIFICATIONS_CENTER, () => {
    if (center.isVisible) {
      center.hide();
    } else {
      toasts.hide();
      center.show();
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: CLEAR_NOTIFICATION,
    weight: KeybindingWeight.WorkbenchContrib,
    when: NotificationFocusedContext,
    primary: KeyCode.Delete,
    mac: {
      primary: KeyMod.CtrlCmd | KeyCode.Backspace
    },
    handler: (accessor, args) => {
      const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
      const notification = getNotificationFromContext(accessor.get(IListService), args);
      if (notification && !notification.hasProgress) {
        notification.close();
        accessibilitySignalService.playSignal(AccessibilitySignal.clear);
      }
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: EXPAND_NOTIFICATION,
    weight: KeybindingWeight.WorkbenchContrib,
    when: NotificationFocusedContext,
    primary: KeyCode.RightArrow,
    handler: (accessor, args) => {
      const notification = getNotificationFromContext(accessor.get(IListService), args);
      notification?.expand();
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: ACCEPT_PRIMARY_ACTION_NOTIFICATION,
    weight: KeybindingWeight.WorkbenchContrib + 1,
    when: ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, ContextKeyExpr.or(NotificationFocusedContext, NotificationsToastsVisibleContext)),
    primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA,
    handler: (accessor) => {
      const actionRunner = accessor.get(IInstantiationService).createInstance(NotificationActionRunner);
      const notification = getNotificationFromContext(accessor.get(IListService)) || model.notifications.at(0);
      if (!notification) {
        return;
      }
      const primaryAction = notification.actions?.primary ? notification.actions.primary.at(0) : void 0;
      if (!primaryAction) {
        return;
      }
      actionRunner.run(primaryAction, notification);
      notification.close();
      actionRunner.dispose();
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: COLLAPSE_NOTIFICATION,
    weight: KeybindingWeight.WorkbenchContrib,
    when: NotificationFocusedContext,
    primary: KeyCode.LeftArrow,
    handler: (accessor, args) => {
      const notification = getNotificationFromContext(accessor.get(IListService), args);
      notification?.collapse();
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: TOGGLE_NOTIFICATION,
    weight: KeybindingWeight.WorkbenchContrib,
    when: NotificationFocusedContext,
    primary: KeyCode.Space,
    secondary: [KeyCode.Enter],
    handler: (accessor) => {
      const notification = getNotificationFromContext(accessor.get(IListService));
      notification?.toggle();
    }
  });
  CommandsRegistry.registerCommand(HIDE_NOTIFICATION_TOAST, (accessor) => {
    toasts.hide();
  });
  KeybindingsRegistry.registerKeybindingRule({
    id: HIDE_NOTIFICATION_TOAST,
    weight: KeybindingWeight.WorkbenchContrib - 50,
    // lower when not focused (e.g. let editor suggest win over this command)
    when: NotificationsToastsVisibleContext,
    primary: KeyCode.Escape
  });
  KeybindingsRegistry.registerKeybindingRule({
    id: HIDE_NOTIFICATION_TOAST,
    weight: KeybindingWeight.WorkbenchContrib + 100,
    // higher when focused
    when: ContextKeyExpr.and(NotificationsToastsVisibleContext, NotificationFocusedContext),
    primary: KeyCode.Escape
  });
  CommandsRegistry.registerCommand(FOCUS_NOTIFICATION_TOAST, () => toasts.focus());
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: FOCUS_NEXT_NOTIFICATION_TOAST,
    weight: KeybindingWeight.WorkbenchContrib,
    when: ContextKeyExpr.and(NotificationFocusedContext, NotificationsToastsVisibleContext),
    primary: KeyCode.DownArrow,
    handler: () => {
      toasts.focusNext();
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: FOCUS_PREVIOUS_NOTIFICATION_TOAST,
    weight: KeybindingWeight.WorkbenchContrib,
    when: ContextKeyExpr.and(NotificationFocusedContext, NotificationsToastsVisibleContext),
    primary: KeyCode.UpArrow,
    handler: () => {
      toasts.focusPrevious();
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: FOCUS_FIRST_NOTIFICATION_TOAST,
    weight: KeybindingWeight.WorkbenchContrib,
    when: ContextKeyExpr.and(NotificationFocusedContext, NotificationsToastsVisibleContext),
    primary: KeyCode.PageUp,
    secondary: [KeyCode.Home],
    handler: () => {
      toasts.focusFirst();
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: FOCUS_LAST_NOTIFICATION_TOAST,
    weight: KeybindingWeight.WorkbenchContrib,
    when: ContextKeyExpr.and(NotificationFocusedContext, NotificationsToastsVisibleContext),
    primary: KeyCode.PageDown,
    secondary: [KeyCode.End],
    handler: () => {
      toasts.focusLast();
    }
  });
  CommandsRegistry.registerCommand(CLEAR_ALL_NOTIFICATIONS, () => center.clearAll());
  CommandsRegistry.registerCommand(TOGGLE_DO_NOT_DISTURB_MODE, (accessor) => {
    const notificationService = accessor.get(INotificationService);
    notificationService.setFilter(notificationService.getFilter() === NotificationsFilter.ERROR ? NotificationsFilter.OFF : NotificationsFilter.ERROR);
  });
  CommandsRegistry.registerCommand(TOGGLE_DO_NOT_DISTURB_MODE_BY_SOURCE, (accessor) => {
    const notificationService = accessor.get(INotificationService);
    const quickInputService = accessor.get(IQuickInputService);
    const sortedFilters = notificationService.getFilters().sort((a, b) => a.label.localeCompare(b.label));
    const disposables = new DisposableStore();
    const picker = disposables.add(quickInputService.createQuickPick());
    picker.items = sortedFilters.map((source) => ({
      id: source.id,
      label: source.label,
      tooltip: `${source.label} (${source.id})`,
      filter: source.filter
    }));
    picker.canSelectMany = true;
    picker.placeholder = localize("selectSources", "Select sources to enable all notifications from");
    picker.selectedItems = picker.items.filter((item) => item.filter === NotificationsFilter.OFF);
    picker.show();
    disposables.add(picker.onDidAccept(async () => {
      for (const item of picker.items) {
        notificationService.setFilter({
          id: item.id,
          label: item.label,
          filter: picker.selectedItems.includes(item) ? NotificationsFilter.OFF : NotificationsFilter.ERROR
        });
      }
      picker.hide();
    }));
    disposables.add(picker.onDidHide(() => disposables.dispose()));
  });
  const category = localize2("notifications", "Notifications");
  MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: SHOW_NOTIFICATIONS_CENTER, title: localize2("showNotifications", "Show Notifications"), category } });
  MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: HIDE_NOTIFICATIONS_CENTER, title: localize2("hideNotifications", "Hide Notifications"), category }, when: NotificationsCenterVisibleContext });
  MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLEAR_ALL_NOTIFICATIONS, title: localize2("clearAllNotifications", "Clear All Notifications"), category } });
  MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: ACCEPT_PRIMARY_ACTION_NOTIFICATION, title: localize2("acceptNotificationPrimaryAction", "Accept Notification Primary Action"), category } });
  MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: TOGGLE_DO_NOT_DISTURB_MODE, title: localize2("toggleDoNotDisturbMode", "Toggle Do Not Disturb Mode"), category } });
  MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: TOGGLE_DO_NOT_DISTURB_MODE_BY_SOURCE, title: localize2("toggleDoNotDisturbModeBySource", "Toggle Do Not Disturb Mode By Source..."), category } });
  MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: FOCUS_NOTIFICATION_TOAST, title: localize2("focusNotificationToasts", "Focus Notification Toast"), category }, when: NotificationsToastsVisibleContext });
  MenuRegistry.appendMenuItem(MenuId.TitleBar, {
    command: {
      id: TOGGLE_NOTIFICATIONS_CENTER,
      title: localize("toggleNotifications", "Toggle Notifications"),
      icon: Codicon.bell
    },
    group: "navigation",
    order: 1e4,
    when: ContextKeyExpr.and(
      ContextKeyExpr.equals(`config.${NotificationsSettings.NOTIFICATIONS_POSITION}`, NotificationsPosition.TOP_RIGHT),
      ContextKeyExpr.equals(`config.${NotificationsSettings.NOTIFICATIONS_BUTTON}`, true)
    )
  });
}
registerAction2(class SetNotificationsPositionBottomRight extends Action2 {
  constructor() {
    super({
      id: "workbench.action.setNotificationsPosition.bottomRight",
      title: localize2("positionBottomRight", "Bottom Right"),
      toggled: ContextKeyExpr.equals(`config.${NotificationsSettings.NOTIFICATIONS_POSITION}`, NotificationsPosition.BOTTOM_RIGHT),
      menu: {
        id: MenuId.NotificationsCenterPositionMenu,
        order: 1
      }
    });
  }
  run(accessor) {
    accessor.get(IConfigurationService).updateValue(NotificationsSettings.NOTIFICATIONS_POSITION, NotificationsPosition.BOTTOM_RIGHT);
  }
});
registerAction2(class SetNotificationsPositionBottomLeft extends Action2 {
  constructor() {
    super({
      id: "workbench.action.setNotificationsPosition.bottomLeft",
      title: localize2("positionBottomLeft", "Bottom Left"),
      toggled: ContextKeyExpr.equals(`config.${NotificationsSettings.NOTIFICATIONS_POSITION}`, NotificationsPosition.BOTTOM_LEFT),
      menu: {
        id: MenuId.NotificationsCenterPositionMenu,
        order: 2
      }
    });
  }
  run(accessor) {
    accessor.get(IConfigurationService).updateValue(NotificationsSettings.NOTIFICATIONS_POSITION, NotificationsPosition.BOTTOM_LEFT);
  }
});
registerAction2(class SetNotificationsPositionTopRight extends Action2 {
  constructor() {
    super({
      id: "workbench.action.setNotificationsPosition.topRight",
      title: localize2("positionTopRight", "Top Right"),
      toggled: ContextKeyExpr.equals(`config.${NotificationsSettings.NOTIFICATIONS_POSITION}`, NotificationsPosition.TOP_RIGHT),
      menu: {
        id: MenuId.NotificationsCenterPositionMenu,
        order: 3
      }
    });
  }
  run(accessor) {
    accessor.get(IConfigurationService).updateValue(NotificationsSettings.NOTIFICATIONS_POSITION, NotificationsPosition.TOP_RIGHT);
  }
});
let NotificationActionRunner = class extends ActionRunner {
  constructor(telemetryService, notificationService) {
    super();
    this.telemetryService = telemetryService;
    this.notificationService = notificationService;
  }
  async runAction(action, context) {
    this.telemetryService.publicLog2("workbenchActionExecuted", { id: action.id, from: "message" });
    try {
      await super.runAction(action, context);
    } catch (error) {
      this.notificationService.error(error);
    }
  }
};
NotificationActionRunner = __decorateClass([
  __decorateParam(0, ITelemetryService),
  __decorateParam(1, INotificationService)
], NotificationActionRunner);
export {
  ACCEPT_PRIMARY_ACTION_NOTIFICATION,
  CLEAR_ALL_NOTIFICATIONS,
  CLEAR_NOTIFICATION,
  COLLAPSE_NOTIFICATION,
  EXPAND_NOTIFICATION,
  HIDE_NOTIFICATIONS_CENTER,
  HIDE_NOTIFICATION_TOAST,
  NotificationActionRunner,
  SHOW_NOTIFICATIONS_CENTER,
  TOGGLE_DO_NOT_DISTURB_MODE,
  TOGGLE_DO_NOT_DISTURB_MODE_BY_SOURCE,
  getNotificationFromContext,
  registerNotificationCommands
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxub3RpZmljYXRpb25zXFxub3RpZmljYXRpb25zQ29tbWFuZHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nc1JlZ2lzdHJ5LCBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBLZXlDaG9yZCwgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblZpZXdJdGVtLCBpc05vdGlmaWNhdGlvblZpZXdJdGVtLCBOb3RpZmljYXRpb25zTW9kZWwsIE5vdGlmaWNhdGlvbnNQb3NpdGlvbiwgTm90aWZpY2F0aW9uc1NldHRpbmdzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGlmaWNhdGlvbnMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudVJlZ2lzdHJ5LCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UsIFdvcmtiZW5jaExpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBOb3RpZmljYXRpb25Gb2N1c2VkQ29udGV4dCwgTm90aWZpY2F0aW9uc0NlbnRlclZpc2libGVDb250ZXh0LCBOb3RpZmljYXRpb25zVG9hc3RzVmlzaWJsZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIElOb3RpZmljYXRpb25Tb3VyY2VGaWx0ZXIsIE5vdGlmaWNhdGlvbnNGaWx0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEFjdGlvblJ1bm5lciwgSUFjdGlvbiwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlTaWduYWwsIElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVEIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5cbi8vIENlbnRlclxuZXhwb3J0IGNvbnN0IFNIT1dfTk9USUZJQ0FUSU9OU19DRU5URVIgPSAnbm90aWZpY2F0aW9ucy5zaG93TGlzdCc7XG5leHBvcnQgY29uc3QgSElERV9OT1RJRklDQVRJT05TX0NFTlRFUiA9ICdub3RpZmljYXRpb25zLmhpZGVMaXN0JztcbmNvbnN0IFRPR0dMRV9OT1RJRklDQVRJT05TX0NFTlRFUiA9ICdub3RpZmljYXRpb25zLnRvZ2dsZUxpc3QnO1xuXG4vLyBUb2FzdHNcbmV4cG9ydCBjb25zdCBISURFX05PVElGSUNBVElPTl9UT0FTVCA9ICdub3RpZmljYXRpb25zLmhpZGVUb2FzdHMnO1xuY29uc3QgRk9DVVNfTk9USUZJQ0FUSU9OX1RPQVNUID0gJ25vdGlmaWNhdGlvbnMuZm9jdXNUb2FzdHMnO1xuY29uc3QgRk9DVVNfTkVYVF9OT1RJRklDQVRJT05fVE9BU1QgPSAnbm90aWZpY2F0aW9ucy5mb2N1c05leHRUb2FzdCc7XG5jb25zdCBGT0NVU19QUkVWSU9VU19OT1RJRklDQVRJT05fVE9BU1QgPSAnbm90aWZpY2F0aW9ucy5mb2N1c1ByZXZpb3VzVG9hc3QnO1xuY29uc3QgRk9DVVNfRklSU1RfTk9USUZJQ0FUSU9OX1RPQVNUID0gJ25vdGlmaWNhdGlvbnMuZm9jdXNGaXJzdFRvYXN0JztcbmNvbnN0IEZPQ1VTX0xBU1RfTk9USUZJQ0FUSU9OX1RPQVNUID0gJ25vdGlmaWNhdGlvbnMuZm9jdXNMYXN0VG9hc3QnO1xuXG4vLyBOb3RpZmljYXRpb25cbmV4cG9ydCBjb25zdCBDT0xMQVBTRV9OT1RJRklDQVRJT04gPSAnbm90aWZpY2F0aW9uLmNvbGxhcHNlJztcbmV4cG9ydCBjb25zdCBFWFBBTkRfTk9USUZJQ0FUSU9OID0gJ25vdGlmaWNhdGlvbi5leHBhbmQnO1xuZXhwb3J0IGNvbnN0IEFDQ0VQVF9QUklNQVJZX0FDVElPTl9OT1RJRklDQVRJT04gPSAnbm90aWZpY2F0aW9uLmFjY2VwdFByaW1hcnlBY3Rpb24nO1xuY29uc3QgVE9HR0xFX05PVElGSUNBVElPTiA9ICdub3RpZmljYXRpb24udG9nZ2xlJztcbmV4cG9ydCBjb25zdCBDTEVBUl9OT1RJRklDQVRJT04gPSAnbm90aWZpY2F0aW9uLmNsZWFyJztcbmV4cG9ydCBjb25zdCBDTEVBUl9BTExfTk9USUZJQ0FUSU9OUyA9ICdub3RpZmljYXRpb25zLmNsZWFyQWxsJztcbmV4cG9ydCBjb25zdCBUT0dHTEVfRE9fTk9UX0RJU1RVUkJfTU9ERSA9ICdub3RpZmljYXRpb25zLnRvZ2dsZURvTm90RGlzdHVyYk1vZGUnO1xuZXhwb3J0IGNvbnN0IFRPR0dMRV9ET19OT1RfRElTVFVSQl9NT0RFX0JZX1NPVVJDRSA9ICdub3RpZmljYXRpb25zLnRvZ2dsZURvTm90RGlzdHVyYk1vZGVCeVNvdXJjZSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5vdGlmaWNhdGlvbnNDZW50ZXJDb250cm9sbGVyIHtcblx0cmVhZG9ubHkgaXNWaXNpYmxlOiBib29sZWFuO1xuXG5cdHNob3coKTogdm9pZDtcblx0aGlkZSgpOiB2b2lkO1xuXG5cdGNsZWFyQWxsKCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5vdGlmaWNhdGlvbnNUb2FzdENvbnRyb2xsZXIge1xuXHRmb2N1cygpOiB2b2lkO1xuXHRmb2N1c05leHQoKTogdm9pZDtcblx0Zm9jdXNQcmV2aW91cygpOiB2b2lkO1xuXHRmb2N1c0ZpcnN0KCk6IHZvaWQ7XG5cdGZvY3VzTGFzdCgpOiB2b2lkO1xuXG5cdGhpZGUoKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldE5vdGlmaWNhdGlvbkZyb21Db250ZXh0KGxpc3RTZXJ2aWNlOiBJTGlzdFNlcnZpY2UsIGNvbnRleHQ/OiB1bmtub3duKTogSU5vdGlmaWNhdGlvblZpZXdJdGVtIHwgdW5kZWZpbmVkIHtcblx0aWYgKGlzTm90aWZpY2F0aW9uVmlld0l0ZW0oY29udGV4dCkpIHtcblx0XHRyZXR1cm4gY29udGV4dDtcblx0fVxuXG5cdGNvbnN0IGxpc3QgPSBsaXN0U2VydmljZS5sYXN0Rm9jdXNlZExpc3Q7XG5cdGlmIChsaXN0IGluc3RhbmNlb2YgV29ya2JlbmNoTGlzdCkge1xuXHRcdGxldCBlbGVtZW50ID0gbGlzdC5nZXRGb2N1c2VkRWxlbWVudHMoKVswXTtcblx0XHRpZiAoIWlzTm90aWZpY2F0aW9uVmlld0l0ZW0oZWxlbWVudCkpIHtcblx0XHRcdGlmIChsaXN0LmlzRE9NRm9jdXNlZCgpKSB7XG5cdFx0XHRcdC8vIHRoZSBub3RpZmljYXRpb24gbGlzdCBtaWdodCBoYXZlIHJlY2VpdmVkIGZvY3VzXG5cdFx0XHRcdC8vIHZpYSBrZXlib2FyZCBhbmQgbWlnaHQgbm90IGhhdmUgYSBmb2N1c2VkIGVsZW1lbnQuXG5cdFx0XHRcdC8vIGluIHRoYXQgY2FzZSBqdXN0IHJldHVybiB0aGUgZmlyc3QgZWxlbWVudFxuXHRcdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTkxNzA1XG5cdFx0XHRcdGVsZW1lbnQgPSBsaXN0LmVsZW1lbnQoMCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGlzTm90aWZpY2F0aW9uVmlld0l0ZW0oZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBlbGVtZW50O1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3Rlck5vdGlmaWNhdGlvbkNvbW1hbmRzKGNlbnRlcjogSU5vdGlmaWNhdGlvbnNDZW50ZXJDb250cm9sbGVyLCB0b2FzdHM6IElOb3RpZmljYXRpb25zVG9hc3RDb250cm9sbGVyLCBtb2RlbDogTm90aWZpY2F0aW9uc01vZGVsKTogdm9pZCB7XG5cblx0Ly8gU2hvdyBOb3RpZmljYXRpb25zIENuZXRlclxuXHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRpZDogU0hPV19OT1RJRklDQVRJT05TX0NFTlRFUixcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleU4pLFxuXHRcdGhhbmRsZXI6ICgpID0+IHtcblx0XHRcdHRvYXN0cy5oaWRlKCk7XG5cdFx0XHRjZW50ZXIuc2hvdygpO1xuXHRcdH1cblx0fSk7XG5cblx0Ly8gSGlkZSBOb3RpZmljYXRpb25zIENlbnRlclxuXHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRpZDogSElERV9OT1RJRklDQVRJT05TX0NFTlRFUixcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDUwLFxuXHRcdHdoZW46IE5vdGlmaWNhdGlvbnNDZW50ZXJWaXNpYmxlQ29udGV4dCxcblx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZSxcblx0XHRoYW5kbGVyOiAoKSA9PiBjZW50ZXIuaGlkZSgpXG5cdH0pO1xuXG5cdC8vIFRvZ2dsZSBOb3RpZmljYXRpb25zIENlbnRlclxuXHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChUT0dHTEVfTk9USUZJQ0FUSU9OU19DRU5URVIsICgpID0+IHtcblx0XHRpZiAoY2VudGVyLmlzVmlzaWJsZSkge1xuXHRcdFx0Y2VudGVyLmhpZGUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dG9hc3RzLmhpZGUoKTtcblx0XHRcdGNlbnRlci5zaG93KCk7XG5cdFx0fVxuXHR9KTtcblxuXHQvLyBDbGVhciBOb3RpZmljYXRpb25cblx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0aWQ6IENMRUFSX05PVElGSUNBVElPTixcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHR3aGVuOiBOb3RpZmljYXRpb25Gb2N1c2VkQ29udGV4dCxcblx0XHRwcmltYXJ5OiBLZXlDb2RlLkRlbGV0ZSxcblx0XHRtYWM6IHtcblx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5CYWNrc3BhY2Vcblx0XHR9LFxuXHRcdGhhbmRsZXI6IChhY2Nlc3NvciwgYXJncz8pID0+IHtcblx0XHRcdGNvbnN0IGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSk7XG5cdFx0XHRjb25zdCBub3RpZmljYXRpb24gPSBnZXROb3RpZmljYXRpb25Gcm9tQ29udGV4dChhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKSwgYXJncyk7XG5cdFx0XHRpZiAobm90aWZpY2F0aW9uICYmICFub3RpZmljYXRpb24uaGFzUHJvZ3Jlc3MpIHtcblx0XHRcdFx0bm90aWZpY2F0aW9uLmNsb3NlKCk7XG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC5jbGVhcik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHQvLyBFeHBhbmQgTm90aWZpY2F0aW9uXG5cdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdGlkOiBFWFBBTkRfTk9USUZJQ0FUSU9OLFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdHdoZW46IE5vdGlmaWNhdGlvbkZvY3VzZWRDb250ZXh0LFxuXHRcdHByaW1hcnk6IEtleUNvZGUuUmlnaHRBcnJvdyxcblx0XHRoYW5kbGVyOiAoYWNjZXNzb3IsIGFyZ3M/KSA9PiB7XG5cdFx0XHRjb25zdCBub3RpZmljYXRpb24gPSBnZXROb3RpZmljYXRpb25Gcm9tQ29udGV4dChhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKSwgYXJncyk7XG5cdFx0XHRub3RpZmljYXRpb24/LmV4cGFuZCgpO1xuXHRcdH1cblx0fSk7XG5cblx0Ly8gQWNjZXB0IFByaW1hcnkgQWN0aW9uXG5cdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdGlkOiBBQ0NFUFRfUFJJTUFSWV9BQ1RJT05fTk9USUZJQ0FUSU9OLFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMSxcblx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9BQ0NFU1NJQklMSVRZX01PREVfRU5BQkxFRCwgQ29udGV4dEtleUV4cHIub3IoTm90aWZpY2F0aW9uRm9jdXNlZENvbnRleHQsIE5vdGlmaWNhdGlvbnNUb2FzdHNWaXNpYmxlQ29udGV4dCkpLFxuXHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlBLFxuXHRcdGhhbmRsZXI6IChhY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aW9uUnVubmVyID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSkuY3JlYXRlSW5zdGFuY2UoTm90aWZpY2F0aW9uQWN0aW9uUnVubmVyKTtcblx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvbiA9IGdldE5vdGlmaWNhdGlvbkZyb21Db250ZXh0KGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpKSB8fCBtb2RlbC5ub3RpZmljYXRpb25zLmF0KDApO1xuXHRcdFx0aWYgKCFub3RpZmljYXRpb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcHJpbWFyeUFjdGlvbiA9IG5vdGlmaWNhdGlvbi5hY3Rpb25zPy5wcmltYXJ5ID8gbm90aWZpY2F0aW9uLmFjdGlvbnMucHJpbWFyeS5hdCgwKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmICghcHJpbWFyeUFjdGlvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRhY3Rpb25SdW5uZXIucnVuKHByaW1hcnlBY3Rpb24sIG5vdGlmaWNhdGlvbik7XG5cdFx0XHRub3RpZmljYXRpb24uY2xvc2UoKTtcblx0XHRcdGFjdGlvblJ1bm5lci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHQvLyBDb2xsYXBzZSBOb3RpZmljYXRpb25cblx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0aWQ6IENPTExBUFNFX05PVElGSUNBVElPTixcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHR3aGVuOiBOb3RpZmljYXRpb25Gb2N1c2VkQ29udGV4dCxcblx0XHRwcmltYXJ5OiBLZXlDb2RlLkxlZnRBcnJvdyxcblx0XHRoYW5kbGVyOiAoYWNjZXNzb3IsIGFyZ3M/KSA9PiB7XG5cdFx0XHRjb25zdCBub3RpZmljYXRpb24gPSBnZXROb3RpZmljYXRpb25Gcm9tQ29udGV4dChhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKSwgYXJncyk7XG5cdFx0XHRub3RpZmljYXRpb24/LmNvbGxhcHNlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHQvLyBUb2dnbGUgTm90aWZpY2F0aW9uXG5cdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdGlkOiBUT0dHTEVfTk9USUZJQ0FUSU9OLFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdHdoZW46IE5vdGlmaWNhdGlvbkZvY3VzZWRDb250ZXh0LFxuXHRcdHByaW1hcnk6IEtleUNvZGUuU3BhY2UsXG5cdFx0c2Vjb25kYXJ5OiBbS2V5Q29kZS5FbnRlcl0sXG5cdFx0aGFuZGxlcjogYWNjZXNzb3IgPT4ge1xuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uID0gZ2V0Tm90aWZpY2F0aW9uRnJvbUNvbnRleHQoYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkpO1xuXHRcdFx0bm90aWZpY2F0aW9uPy50b2dnbGUoKTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vIEhpZGUgVG9hc3RzXG5cdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKEhJREVfTk9USUZJQ0FUSU9OX1RPQVNULCBhY2Nlc3NvciA9PiB7XG5cdFx0dG9hc3RzLmhpZGUoKTtcblx0fSk7XG5cblx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlcktleWJpbmRpbmdSdWxlKHtcblx0XHRpZDogSElERV9OT1RJRklDQVRJT05fVE9BU1QsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgLSA1MCwgLy8gbG93ZXIgd2hlbiBub3QgZm9jdXNlZCAoZS5nLiBsZXQgZWRpdG9yIHN1Z2dlc3Qgd2luIG92ZXIgdGhpcyBjb21tYW5kKVxuXHRcdHdoZW46IE5vdGlmaWNhdGlvbnNUb2FzdHNWaXNpYmxlQ29udGV4dCxcblx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZVxuXHR9KTtcblxuXHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyS2V5YmluZGluZ1J1bGUoe1xuXHRcdGlkOiBISURFX05PVElGSUNBVElPTl9UT0FTVCxcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEwMCwgLy8gaGlnaGVyIHdoZW4gZm9jdXNlZFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOb3RpZmljYXRpb25zVG9hc3RzVmlzaWJsZUNvbnRleHQsIE5vdGlmaWNhdGlvbkZvY3VzZWRDb250ZXh0KSxcblx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZVxuXHR9KTtcblxuXHQvLyBGb2N1cyBUb2FzdHNcblx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoRk9DVVNfTk9USUZJQ0FUSU9OX1RPQVNULCAoKSA9PiB0b2FzdHMuZm9jdXMoKSk7XG5cblx0Ly8gRm9jdXMgTmV4dCBUb2FzdFxuXHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRpZDogRk9DVVNfTkVYVF9OT1RJRklDQVRJT05fVE9BU1QsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5vdGlmaWNhdGlvbkZvY3VzZWRDb250ZXh0LCBOb3RpZmljYXRpb25zVG9hc3RzVmlzaWJsZUNvbnRleHQpLFxuXHRcdHByaW1hcnk6IEtleUNvZGUuRG93bkFycm93LFxuXHRcdGhhbmRsZXI6ICgpID0+IHtcblx0XHRcdHRvYXN0cy5mb2N1c05leHQoKTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vIEZvY3VzIFByZXZpb3VzIFRvYXN0XG5cdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdGlkOiBGT0NVU19QUkVWSU9VU19OT1RJRklDQVRJT05fVE9BU1QsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5vdGlmaWNhdGlvbkZvY3VzZWRDb250ZXh0LCBOb3RpZmljYXRpb25zVG9hc3RzVmlzaWJsZUNvbnRleHQpLFxuXHRcdHByaW1hcnk6IEtleUNvZGUuVXBBcnJvdyxcblx0XHRoYW5kbGVyOiAoKSA9PiB7XG5cdFx0XHR0b2FzdHMuZm9jdXNQcmV2aW91cygpO1xuXHRcdH1cblx0fSk7XG5cblx0Ly8gRm9jdXMgRmlyc3QgVG9hc3Rcblx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0aWQ6IEZPQ1VTX0ZJUlNUX05PVElGSUNBVElPTl9UT0FTVCxcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoTm90aWZpY2F0aW9uRm9jdXNlZENvbnRleHQsIE5vdGlmaWNhdGlvbnNUb2FzdHNWaXNpYmxlQ29udGV4dCksXG5cdFx0cHJpbWFyeTogS2V5Q29kZS5QYWdlVXAsXG5cdFx0c2Vjb25kYXJ5OiBbS2V5Q29kZS5Ib21lXSxcblx0XHRoYW5kbGVyOiAoKSA9PiB7XG5cdFx0XHR0b2FzdHMuZm9jdXNGaXJzdCgpO1xuXHRcdH1cblx0fSk7XG5cblx0Ly8gRm9jdXMgTGFzdCBUb2FzdFxuXHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRpZDogRk9DVVNfTEFTVF9OT1RJRklDQVRJT05fVE9BU1QsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5vdGlmaWNhdGlvbkZvY3VzZWRDb250ZXh0LCBOb3RpZmljYXRpb25zVG9hc3RzVmlzaWJsZUNvbnRleHQpLFxuXHRcdHByaW1hcnk6IEtleUNvZGUuUGFnZURvd24sXG5cdFx0c2Vjb25kYXJ5OiBbS2V5Q29kZS5FbmRdLFxuXHRcdGhhbmRsZXI6ICgpID0+IHtcblx0XHRcdHRvYXN0cy5mb2N1c0xhc3QoKTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vIENsZWFyIEFsbCBOb3RpZmljYXRpb25zXG5cdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKENMRUFSX0FMTF9OT1RJRklDQVRJT05TLCAoKSA9PiBjZW50ZXIuY2xlYXJBbGwoKSk7XG5cblx0Ly8gVG9nZ2xlIERvIE5vdCBEaXN0dXJiIE1vZGVcblx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoVE9HR0xFX0RPX05PVF9ESVNUVVJCX01PREUsIGFjY2Vzc29yID0+IHtcblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblxuXHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uuc2V0RmlsdGVyKG5vdGlmaWNhdGlvblNlcnZpY2UuZ2V0RmlsdGVyKCkgPT09IE5vdGlmaWNhdGlvbnNGaWx0ZXIuRVJST1IgPyBOb3RpZmljYXRpb25zRmlsdGVyLk9GRiA6IE5vdGlmaWNhdGlvbnNGaWx0ZXIuRVJST1IpO1xuXHR9KTtcblxuXHQvLyBDb25maWd1cmUgRG8gTm90IERpc3R1cmIgYnkgU291cmNlXG5cdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKFRPR0dMRV9ET19OT1RfRElTVFVSQl9NT0RFX0JZX1NPVVJDRSwgYWNjZXNzb3IgPT4ge1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cblx0XHRjb25zdCBzb3J0ZWRGaWx0ZXJzID0gbm90aWZpY2F0aW9uU2VydmljZS5nZXRGaWx0ZXJzKCkuc29ydCgoYSwgYikgPT4gYS5sYWJlbC5sb2NhbGVDb21wYXJlKGIubGFiZWwpKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHBpY2tlciA9IGRpc3Bvc2FibGVzLmFkZChxdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0gJiBJTm90aWZpY2F0aW9uU291cmNlRmlsdGVyPigpKTtcblxuXHRcdHBpY2tlci5pdGVtcyA9IHNvcnRlZEZpbHRlcnMubWFwKHNvdXJjZSA9PiAoe1xuXHRcdFx0aWQ6IHNvdXJjZS5pZCxcblx0XHRcdGxhYmVsOiBzb3VyY2UubGFiZWwsXG5cdFx0XHR0b29sdGlwOiBgJHtzb3VyY2UubGFiZWx9ICgke3NvdXJjZS5pZH0pYCxcblx0XHRcdGZpbHRlcjogc291cmNlLmZpbHRlclxuXHRcdH0pKTtcblxuXHRcdHBpY2tlci5jYW5TZWxlY3RNYW55ID0gdHJ1ZTtcblx0XHRwaWNrZXIucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnc2VsZWN0U291cmNlcycsIFwiU2VsZWN0IHNvdXJjZXMgdG8gZW5hYmxlIGFsbCBub3RpZmljYXRpb25zIGZyb21cIik7XG5cdFx0cGlja2VyLnNlbGVjdGVkSXRlbXMgPSBwaWNrZXIuaXRlbXMuZmlsdGVyKGl0ZW0gPT4gaXRlbS5maWx0ZXIgPT09IE5vdGlmaWNhdGlvbnNGaWx0ZXIuT0ZGKTtcblxuXHRcdHBpY2tlci5zaG93KCk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkQWNjZXB0KGFzeW5jICgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBwaWNrZXIuaXRlbXMpIHtcblx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5zZXRGaWx0ZXIoe1xuXHRcdFx0XHRcdGlkOiBpdGVtLmlkLFxuXHRcdFx0XHRcdGxhYmVsOiBpdGVtLmxhYmVsLFxuXHRcdFx0XHRcdGZpbHRlcjogcGlja2VyLnNlbGVjdGVkSXRlbXMuaW5jbHVkZXMoaXRlbSkgPyBOb3RpZmljYXRpb25zRmlsdGVyLk9GRiA6IE5vdGlmaWNhdGlvbnNGaWx0ZXIuRVJST1Jcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHBpY2tlci5oaWRlKCk7XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZEhpZGUoKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKSk7XG5cdH0pO1xuXG5cdC8vIENvbW1hbmRzIGZvciBDb21tYW5kIFBhbGV0dGVcblx0Y29uc3QgY2F0ZWdvcnkgPSBsb2NhbGl6ZTIoJ25vdGlmaWNhdGlvbnMnLCAnTm90aWZpY2F0aW9ucycpO1xuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7IGNvbW1hbmQ6IHsgaWQ6IFNIT1dfTk9USUZJQ0FUSU9OU19DRU5URVIsIHRpdGxlOiBsb2NhbGl6ZTIoJ3Nob3dOb3RpZmljYXRpb25zJywgJ1Nob3cgTm90aWZpY2F0aW9ucycpLCBjYXRlZ29yeSB9IH0pO1xuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7IGNvbW1hbmQ6IHsgaWQ6IEhJREVfTk9USUZJQ0FUSU9OU19DRU5URVIsIHRpdGxlOiBsb2NhbGl6ZTIoJ2hpZGVOb3RpZmljYXRpb25zJywgJ0hpZGUgTm90aWZpY2F0aW9ucycpLCBjYXRlZ29yeSB9LCB3aGVuOiBOb3RpZmljYXRpb25zQ2VudGVyVmlzaWJsZUNvbnRleHQgfSk7XG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHsgY29tbWFuZDogeyBpZDogQ0xFQVJfQUxMX05PVElGSUNBVElPTlMsIHRpdGxlOiBsb2NhbGl6ZTIoJ2NsZWFyQWxsTm90aWZpY2F0aW9ucycsICdDbGVhciBBbGwgTm90aWZpY2F0aW9ucycpLCBjYXRlZ29yeSB9IH0pO1xuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7IGNvbW1hbmQ6IHsgaWQ6IEFDQ0VQVF9QUklNQVJZX0FDVElPTl9OT1RJRklDQVRJT04sIHRpdGxlOiBsb2NhbGl6ZTIoJ2FjY2VwdE5vdGlmaWNhdGlvblByaW1hcnlBY3Rpb24nLCAnQWNjZXB0IE5vdGlmaWNhdGlvbiBQcmltYXJ5IEFjdGlvbicpLCBjYXRlZ29yeSB9IH0pO1xuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7IGNvbW1hbmQ6IHsgaWQ6IFRPR0dMRV9ET19OT1RfRElTVFVSQl9NT0RFLCB0aXRsZTogbG9jYWxpemUyKCd0b2dnbGVEb05vdERpc3R1cmJNb2RlJywgJ1RvZ2dsZSBEbyBOb3QgRGlzdHVyYiBNb2RlJyksIGNhdGVnb3J5IH0gfSk7XG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHsgY29tbWFuZDogeyBpZDogVE9HR0xFX0RPX05PVF9ESVNUVVJCX01PREVfQllfU09VUkNFLCB0aXRsZTogbG9jYWxpemUyKCd0b2dnbGVEb05vdERpc3R1cmJNb2RlQnlTb3VyY2UnLCAnVG9nZ2xlIERvIE5vdCBEaXN0dXJiIE1vZGUgQnkgU291cmNlLi4uJyksIGNhdGVnb3J5IH0gfSk7XG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHsgY29tbWFuZDogeyBpZDogRk9DVVNfTk9USUZJQ0FUSU9OX1RPQVNULCB0aXRsZTogbG9jYWxpemUyKCdmb2N1c05vdGlmaWNhdGlvblRvYXN0cycsICdGb2N1cyBOb3RpZmljYXRpb24gVG9hc3QnKSwgY2F0ZWdvcnkgfSwgd2hlbjogTm90aWZpY2F0aW9uc1RvYXN0c1Zpc2libGVDb250ZXh0IH0pO1xuXG5cdC8vIEJlbGwgaWNvbiBpbiB0aGUgdGl0bGUgYmFyICh3aGVuIG5vdGlmaWNhdGlvbnMgYXJlIHBvc2l0aW9uZWQgYXQgdG9wLXJpZ2h0KVxuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlRpdGxlQmFyLCB7XG5cdFx0Y29tbWFuZDoge1xuXHRcdFx0aWQ6IFRPR0dMRV9OT1RJRklDQVRJT05TX0NFTlRFUixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgndG9nZ2xlTm90aWZpY2F0aW9ucycsIFwiVG9nZ2xlIE5vdGlmaWNhdGlvbnNcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmJlbGwsXG5cdFx0fSxcblx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdG9yZGVyOiAxMDAwMCxcblx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke05vdGlmaWNhdGlvbnNTZXR0aW5ncy5OT1RJRklDQVRJT05TX1BPU0lUSU9OfWAsIE5vdGlmaWNhdGlvbnNQb3NpdGlvbi5UT1BfUklHSFQpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtOb3RpZmljYXRpb25zU2V0dGluZ3MuTk9USUZJQ0FUSU9OU19CVVRUT059YCwgdHJ1ZSlcblx0XHQpXG5cdH0pO1xufVxuXG4vLyBOb3RpZmljYXRpb24gUG9zaXRpb24gQWN0aW9uc1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgU2V0Tm90aWZpY2F0aW9uc1Bvc2l0aW9uQm90dG9tUmlnaHQgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnNldE5vdGlmaWNhdGlvbnNQb3NpdGlvbi5ib3R0b21SaWdodCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdwb3NpdGlvbkJvdHRvbVJpZ2h0JywgJ0JvdHRvbSBSaWdodCcpLFxuXHRcdFx0dG9nZ2xlZDogQ29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtOb3RpZmljYXRpb25zU2V0dGluZ3MuTk9USUZJQ0FUSU9OU19QT1NJVElPTn1gLCBOb3RpZmljYXRpb25zUG9zaXRpb24uQk9UVE9NX1JJR0hUKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RpZmljYXRpb25zQ2VudGVyUG9zaXRpb25NZW51LFxuXHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpLnVwZGF0ZVZhbHVlKE5vdGlmaWNhdGlvbnNTZXR0aW5ncy5OT1RJRklDQVRJT05TX1BPU0lUSU9OLCBOb3RpZmljYXRpb25zUG9zaXRpb24uQk9UVE9NX1JJR0hUKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBTZXROb3RpZmljYXRpb25zUG9zaXRpb25Cb3R0b21MZWZ0IGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5zZXROb3RpZmljYXRpb25zUG9zaXRpb24uYm90dG9tTGVmdCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdwb3NpdGlvbkJvdHRvbUxlZnQnLCAnQm90dG9tIExlZnQnKSxcblx0XHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7Tm90aWZpY2F0aW9uc1NldHRpbmdzLk5PVElGSUNBVElPTlNfUE9TSVRJT059YCwgTm90aWZpY2F0aW9uc1Bvc2l0aW9uLkJPVFRPTV9MRUZUKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RpZmljYXRpb25zQ2VudGVyUG9zaXRpb25NZW51LFxuXHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpLnVwZGF0ZVZhbHVlKE5vdGlmaWNhdGlvbnNTZXR0aW5ncy5OT1RJRklDQVRJT05TX1BPU0lUSU9OLCBOb3RpZmljYXRpb25zUG9zaXRpb24uQk9UVE9NX0xFRlQpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFNldE5vdGlmaWNhdGlvbnNQb3NpdGlvblRvcFJpZ2h0IGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5zZXROb3RpZmljYXRpb25zUG9zaXRpb24udG9wUmlnaHQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncG9zaXRpb25Ub3BSaWdodCcsICdUb3AgUmlnaHQnKSxcblx0XHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7Tm90aWZpY2F0aW9uc1NldHRpbmdzLk5PVElGSUNBVElPTlNfUE9TSVRJT059YCwgTm90aWZpY2F0aW9uc1Bvc2l0aW9uLlRPUF9SSUdIVCksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTm90aWZpY2F0aW9uc0NlbnRlclBvc2l0aW9uTWVudSxcblx0XHRcdFx0b3JkZXI6IDNcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKS51cGRhdGVWYWx1ZShOb3RpZmljYXRpb25zU2V0dGluZ3MuTk9USUZJQ0FUSU9OU19QT1NJVElPTiwgTm90aWZpY2F0aW9uc1Bvc2l0aW9uLlRPUF9SSUdIVCk7XG5cdH1cbn0pO1xuXG5cbmV4cG9ydCBjbGFzcyBOb3RpZmljYXRpb25BY3Rpb25SdW5uZXIgZXh0ZW5kcyBBY3Rpb25SdW5uZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgcnVuQWN0aW9uKGFjdGlvbjogSUFjdGlvbiwgY29udGV4dDogdW5rbm93bik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24+KCd3b3JrYmVuY2hBY3Rpb25FeGVjdXRlZCcsIHsgaWQ6IGFjdGlvbi5pZCwgZnJvbTogJ21lc3NhZ2UnIH0pO1xuXG5cdFx0Ly8gUnVuIGFuZCBtYWtlIHN1cmUgdG8gbm90aWZ5IG9uIGFueSBlcnJvciBhZ2FpblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzdXBlci5ydW5BY3Rpb24oYWN0aW9uLCBjb250ZXh0KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxxQkFBcUIsd0JBQXdCO0FBQ3RELFNBQVMsVUFBVSxTQUFTLGNBQWM7QUFDMUMsU0FBZ0Msd0JBQTRDLHVCQUF1Qiw2QkFBNkI7QUFDaEksU0FBUyxTQUFTLGNBQWMsUUFBUSx1QkFBdUI7QUFDL0QsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLGNBQWMscUJBQXFCO0FBQzVDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNEJBQTRCLG1DQUFtQyx5Q0FBeUM7QUFDakgsU0FBUyxzQkFBaUQsMkJBQTJCO0FBQ3JGLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMsb0JBQWtHO0FBQzNHLFNBQVMsMEJBQTBDO0FBQ25ELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMscUJBQXFCLG1DQUFtQztBQUNqRSxTQUFTLGVBQWU7QUFDeEIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQ0FBMEM7QUFHNUMsTUFBTSw0QkFBNEI7QUFDbEMsTUFBTSw0QkFBNEI7QUFDekMsTUFBTSw4QkFBOEI7QUFHN0IsTUFBTSwwQkFBMEI7QUFDdkMsTUFBTSwyQkFBMkI7QUFDakMsTUFBTSxnQ0FBZ0M7QUFDdEMsTUFBTSxvQ0FBb0M7QUFDMUMsTUFBTSxpQ0FBaUM7QUFDdkMsTUFBTSxnQ0FBZ0M7QUFHL0IsTUFBTSx3QkFBd0I7QUFDOUIsTUFBTSxzQkFBc0I7QUFDNUIsTUFBTSxxQ0FBcUM7QUFDbEQsTUFBTSxzQkFBc0I7QUFDckIsTUFBTSxxQkFBcUI7QUFDM0IsTUFBTSwwQkFBMEI7QUFDaEMsTUFBTSw2QkFBNkI7QUFDbkMsTUFBTSx1Q0FBdUM7QUFxQjdDLFNBQVMsMkJBQTJCLGFBQTJCLFNBQXNEO0FBQzNILE1BQUksdUJBQXVCLE9BQU8sR0FBRztBQUNwQyxX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
