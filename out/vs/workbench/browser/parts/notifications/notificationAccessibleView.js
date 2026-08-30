import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { IAccessibleViewService, AccessibleViewProviderId, AccessibleViewType, AccessibleContentProvider } from "../../../../platform/accessibility/browser/accessibleView.js";
import { IAccessibilitySignalService, AccessibilitySignal } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IListService, WorkbenchList } from "../../../../platform/list/browser/listService.js";
import { getNotificationFromContext } from "./notificationsCommands.js";
import { NotificationFocusedContext } from "../../../common/contextkeys.js";
import { withSeverityPrefix } from "../../../../platform/notification/common/notification.js";
class NotificationAccessibleView {
  constructor() {
    this.priority = 90;
    this.name = "notifications";
    this.when = NotificationFocusedContext;
    this.type = AccessibleViewType.View;
  }
  getProvider(accessor) {
    const accessibleViewService = accessor.get(IAccessibleViewService);
    const listService = accessor.get(IListService);
    const commandService = accessor.get(ICommandService);
    const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
    function getProvider() {
      const notification = getNotificationFromContext(listService);
      if (!notification) {
        return;
      }
      commandService.executeCommand("notifications.showList");
      let notificationIndex;
      const list = listService.lastFocusedList;
      if (list instanceof WorkbenchList) {
        notificationIndex = list.indexOf(notification);
      }
      if (notificationIndex === void 0) {
        return;
      }
      function focusList() {
        commandService.executeCommand("notifications.showList");
        if (list && notificationIndex !== void 0) {
          list.domFocus();
          try {
            list.setFocus([notificationIndex]);
          } catch {
          }
        }
      }
      function getContentForNotification() {
        const notification2 = getNotificationFromContext(listService);
        const message = notification2?.message.original.toString();
        if (!notification2 || !message) {
          return;
        }
        return withSeverityPrefix(notification2.source ? localize("notification.accessibleViewSrc", "{0} Source: {1}", message, notification2.source) : message, notification2.severity);
      }
      const content = getContentForNotification();
      if (!content) {
        return;
      }
      notification.onDidClose(() => accessibleViewService.next());
      return new AccessibleContentProvider(
        AccessibleViewProviderId.Notification,
        { type: AccessibleViewType.View },
        () => content,
        () => focusList(),
        "accessibility.verbosity.notification",
        void 0,
        getActionsFromNotification(notification, accessibilitySignalService),
        () => {
          if (!list) {
            return;
          }
          focusList();
          list.focusNext();
          return getContentForNotification();
        },
        () => {
          if (!list) {
            return;
          }
          focusList();
          list.focusPrevious();
          return getContentForNotification();
        }
      );
    }
    return getProvider();
  }
}
function getActionsFromNotification(notification, accessibilitySignalService) {
  let actions = void 0;
  if (notification.actions) {
    actions = [];
    if (notification.actions.primary) {
      actions.push(...notification.actions.primary);
    }
    if (notification.actions.secondary) {
      actions.push(...notification.actions.secondary);
    }
  }
  if (actions) {
    for (const action of actions) {
      action.class = ThemeIcon.asClassName(Codicon.bell);
      const initialAction = action.run;
      action.run = () => {
        initialAction();
        notification.close();
      };
    }
  }
  const manageExtension = actions?.find((a) => a.label.includes("Manage Extension"));
  if (manageExtension) {
    manageExtension.class = ThemeIcon.asClassName(Codicon.gear);
  }
  if (actions) {
    actions.push({
      id: "clearNotification",
      label: localize("clearNotification", "Clear Notification"),
      tooltip: localize("clearNotification", "Clear Notification"),
      run: () => {
        notification.close();
        accessibilitySignalService.playSignal(AccessibilitySignal.clear);
      },
      enabled: true,
      class: ThemeIcon.asClassName(Codicon.clearAll)
    });
  }
  return actions;
}
export {
  NotificationAccessibleView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxub3RpZmljYXRpb25zXFxub3RpZmljYXRpb25BY2Nlc3NpYmxlVmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2libGVWaWV3U2VydmljZSwgQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkLCBBY2Nlc3NpYmxlVmlld1R5cGUsIEFjY2Vzc2libGVDb250ZW50UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJsZVZpZXcuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2libGVWaWV3SW1wbGVtZW50YXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJsZVZpZXdSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UsIEFjY2Vzc2liaWxpdHlTaWduYWwgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMaXN0U2VydmljZSwgV29ya2JlbmNoTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXROb3RpZmljYXRpb25Gcm9tQ29udGV4dCB9IGZyb20gJy4vbm90aWZpY2F0aW9uc0NvbW1hbmRzLmpzJztcbmltcG9ydCB7IE5vdGlmaWNhdGlvbkZvY3VzZWRDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RpZmljYXRpb25zLmpzJztcbmltcG9ydCB7IHdpdGhTZXZlcml0eVByZWZpeCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcblxuZXhwb3J0IGNsYXNzIE5vdGlmaWNhdGlvbkFjY2Vzc2libGVWaWV3IGltcGxlbWVudHMgSUFjY2Vzc2libGVWaWV3SW1wbGVtZW50YXRpb24ge1xuXHRyZWFkb25seSBwcmlvcml0eSA9IDkwO1xuXHRyZWFkb25seSBuYW1lID0gJ25vdGlmaWNhdGlvbnMnO1xuXHRyZWFkb25seSB3aGVuID0gTm90aWZpY2F0aW9uRm9jdXNlZENvbnRleHQ7XG5cdHJlYWRvbmx5IHR5cGUgPSBBY2Nlc3NpYmxlVmlld1R5cGUuVmlldztcblx0Z2V0UHJvdmlkZXIoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBhY2Nlc3NpYmxlVmlld1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFjY2Vzc2libGVWaWV3U2VydmljZSk7XG5cdFx0Y29uc3QgbGlzdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKTtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSk7XG5cblx0XHRmdW5jdGlvbiBnZXRQcm92aWRlcigpIHtcblx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvbiA9IGdldE5vdGlmaWNhdGlvbkZyb21Db250ZXh0KGxpc3RTZXJ2aWNlKTtcblx0XHRcdGlmICghbm90aWZpY2F0aW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdub3RpZmljYXRpb25zLnNob3dMaXN0Jyk7XG5cdFx0XHRsZXQgbm90aWZpY2F0aW9uSW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGxpc3QgPSBsaXN0U2VydmljZS5sYXN0Rm9jdXNlZExpc3Q7XG5cdFx0XHRpZiAobGlzdCBpbnN0YW5jZW9mIFdvcmtiZW5jaExpc3QpIHtcblx0XHRcdFx0bm90aWZpY2F0aW9uSW5kZXggPSBsaXN0LmluZGV4T2Yobm90aWZpY2F0aW9uKTtcblx0XHRcdH1cblx0XHRcdGlmIChub3RpZmljYXRpb25JbmRleCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0ZnVuY3Rpb24gZm9jdXNMaXN0KCk6IHZvaWQge1xuXHRcdFx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnbm90aWZpY2F0aW9ucy5zaG93TGlzdCcpO1xuXHRcdFx0XHRpZiAobGlzdCAmJiBub3RpZmljYXRpb25JbmRleCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0bGlzdC5kb21Gb2N1cygpO1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRsaXN0LnNldEZvY3VzKFtub3RpZmljYXRpb25JbmRleF0pO1xuXHRcdFx0XHRcdH0gY2F0Y2ggeyB9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0ZnVuY3Rpb24gZ2V0Q29udGVudEZvck5vdGlmaWNhdGlvbigpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRjb25zdCBub3RpZmljYXRpb24gPSBnZXROb3RpZmljYXRpb25Gcm9tQ29udGV4dChsaXN0U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBub3RpZmljYXRpb24/Lm1lc3NhZ2Uub3JpZ2luYWwudG9TdHJpbmcoKTtcblx0XHRcdFx0aWYgKCFub3RpZmljYXRpb24gfHwgIW1lc3NhZ2UpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHdpdGhTZXZlcml0eVByZWZpeChub3RpZmljYXRpb24uc291cmNlID8gbG9jYWxpemUoJ25vdGlmaWNhdGlvbi5hY2Nlc3NpYmxlVmlld1NyYycsICd7MH0gU291cmNlOiB7MX0nLCBtZXNzYWdlLCBub3RpZmljYXRpb24uc291cmNlKSA6IG1lc3NhZ2UsIG5vdGlmaWNhdGlvbi5zZXZlcml0eSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjb250ZW50ID0gZ2V0Q29udGVudEZvck5vdGlmaWNhdGlvbigpO1xuXHRcdFx0aWYgKCFjb250ZW50KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdG5vdGlmaWNhdGlvbi5vbkRpZENsb3NlKCgpID0+IGFjY2Vzc2libGVWaWV3U2VydmljZS5uZXh0KCkpO1xuXHRcdFx0cmV0dXJuIG5ldyBBY2Nlc3NpYmxlQ29udGVudFByb3ZpZGVyKFxuXHRcdFx0XHRBY2Nlc3NpYmxlVmlld1Byb3ZpZGVySWQuTm90aWZpY2F0aW9uLFxuXHRcdFx0XHR7IHR5cGU6IEFjY2Vzc2libGVWaWV3VHlwZS5WaWV3IH0sXG5cdFx0XHRcdCgpID0+IGNvbnRlbnQsXG5cdFx0XHRcdCgpID0+IGZvY3VzTGlzdCgpLFxuXHRcdFx0XHQnYWNjZXNzaWJpbGl0eS52ZXJib3NpdHkubm90aWZpY2F0aW9uJyxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRnZXRBY3Rpb25zRnJvbU5vdGlmaWNhdGlvbihub3RpZmljYXRpb24sIGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlKSxcblx0XHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRcdGlmICghbGlzdCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRmb2N1c0xpc3QoKTtcblx0XHRcdFx0XHRsaXN0LmZvY3VzTmV4dCgpO1xuXHRcdFx0XHRcdHJldHVybiBnZXRDb250ZW50Rm9yTm90aWZpY2F0aW9uKCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdCgpID0+IHtcblx0XHRcdFx0XHRpZiAoIWxpc3QpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Zm9jdXNMaXN0KCk7XG5cdFx0XHRcdFx0bGlzdC5mb2N1c1ByZXZpb3VzKCk7XG5cdFx0XHRcdFx0cmV0dXJuIGdldENvbnRlbnRGb3JOb3RpZmljYXRpb24oKTtcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cdFx0fVxuXHRcdHJldHVybiBnZXRQcm92aWRlcigpO1xuXHR9XG59XG5cblxuZnVuY3Rpb24gZ2V0QWN0aW9uc0Zyb21Ob3RpZmljYXRpb24obm90aWZpY2F0aW9uOiBJTm90aWZpY2F0aW9uVmlld0l0ZW0sIGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UpOiBJQWN0aW9uW10gfCB1bmRlZmluZWQge1xuXHRsZXQgYWN0aW9ucyA9IHVuZGVmaW5lZDtcblx0aWYgKG5vdGlmaWNhdGlvbi5hY3Rpb25zKSB7XG5cdFx0YWN0aW9ucyA9IFtdO1xuXHRcdGlmIChub3RpZmljYXRpb24uYWN0aW9ucy5wcmltYXJ5KSB7XG5cdFx0XHRhY3Rpb25zLnB1c2goLi4ubm90aWZpY2F0aW9uLmFjdGlvbnMucHJpbWFyeSk7XG5cdFx0fVxuXHRcdGlmIChub3RpZmljYXRpb24uYWN0aW9ucy5zZWNvbmRhcnkpIHtcblx0XHRcdGFjdGlvbnMucHVzaCguLi5ub3RpZmljYXRpb24uYWN0aW9ucy5zZWNvbmRhcnkpO1xuXHRcdH1cblx0fVxuXHRpZiAoYWN0aW9ucykge1xuXHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIGFjdGlvbnMpIHtcblx0XHRcdGFjdGlvbi5jbGFzcyA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmJlbGwpO1xuXHRcdFx0Y29uc3QgaW5pdGlhbEFjdGlvbiA9IGFjdGlvbi5ydW47XG5cdFx0XHRhY3Rpb24ucnVuID0gKCkgPT4ge1xuXHRcdFx0XHRpbml0aWFsQWN0aW9uKCk7XG5cdFx0XHRcdG5vdGlmaWNhdGlvbi5jbG9zZSgpO1xuXHRcdFx0fTtcblx0XHR9XG5cdH1cblx0Y29uc3QgbWFuYWdlRXh0ZW5zaW9uID0gYWN0aW9ucz8uZmluZChhID0+IGEubGFiZWwuaW5jbHVkZXMoJ01hbmFnZSBFeHRlbnNpb24nKSk7XG5cdGlmIChtYW5hZ2VFeHRlbnNpb24pIHtcblx0XHRtYW5hZ2VFeHRlbnNpb24uY2xhc3MgPSBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5nZWFyKTtcblx0fVxuXHRpZiAoYWN0aW9ucykge1xuXHRcdGFjdGlvbnMucHVzaCh7XG5cdFx0XHRpZDogJ2NsZWFyTm90aWZpY2F0aW9uJywgbGFiZWw6IGxvY2FsaXplKCdjbGVhck5vdGlmaWNhdGlvbicsIFwiQ2xlYXIgTm90aWZpY2F0aW9uXCIpLCB0b29sdGlwOiBsb2NhbGl6ZSgnY2xlYXJOb3RpZmljYXRpb24nLCBcIkNsZWFyIE5vdGlmaWNhdGlvblwiKSwgcnVuOiAoKSA9PiB7XG5cdFx0XHRcdG5vdGlmaWNhdGlvbi5jbG9zZSgpO1xuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5wbGF5U2lnbmFsKEFjY2Vzc2liaWxpdHlTaWduYWwuY2xlYXIpO1xuXHRcdFx0fSwgZW5hYmxlZDogdHJ1ZSwgY2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmNsZWFyQWxsKVxuXHRcdH0pO1xuXHR9XG5cdHJldHVybiBhY3Rpb25zO1xufVxuXG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx3QkFBd0IsMEJBQTBCLG9CQUFvQixpQ0FBaUM7QUFFaEgsU0FBUyw2QkFBNkIsMkJBQTJCO0FBQ2pFLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsY0FBYyxxQkFBcUI7QUFDNUMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxrQ0FBa0M7QUFFM0MsU0FBUywwQkFBMEI7QUFFNUIsTUFBTSwyQkFBb0U7QUFBQSxFQUExRTtBQUNOLFNBQVMsV0FBVztBQUNwQixTQUFTLE9BQU87QUFDaEIsU0FBUyxPQUFPO0FBQ2hCLFNBQVMsT0FBTyxtQkFBbUI7QUFBQTtBQUFBLEVBQ25DLFlBQVksVUFBNEI7QUFDdkMsVUFBTSx3QkFBd0IsU0FBUyxJQUFJLHNCQUFzQjtBQUNqRSxVQUFNLGNBQWMsU0FBUyxJQUFJLFlBQVk7QUFDN0MsVUFBTSxpQkFBaUIsU0FBUyxJQUFJLGVBQWU7QUFDbkQsVUFBTSw2QkFBNkIsU0FBUyxJQUFJLDJCQUEyQjtBQUUzRSxhQUFTLGNBQWM7QUFDdEIsWUFBTSxlQUFlLDJCQUEyQixXQUFXO0FBQzNELFVBQUksQ0FBQyxjQUFjO0FBQ2xCO0FBQUEsTUFDRDtBQUNBLHFCQUFlLGVBQWUsd0JBQXdCO0FBQ3RELFVBQUk7QUFDSixZQUFNLE9BQU8sWUFBWTtBQUN6QixVQUFJLGdCQUFnQixlQUFlO0FBQ2xDLDRCQUFvQixLQUFLLFFBQVEsWUFBWTtBQUFBLE1BQzlDO0FBQ0EsVUFBSSxzQkFBc0IsUUFBVztBQUNwQztBQUFBLE1BQ0Q7QUFFQSxlQUFTLFlBQWtCO0FBQzFCLHVCQUFlLGVBQWUsd0JBQXdCO0FBQ3RELFlBQUksUUFBUSxzQkFBc0IsUUFBVztBQUM1QyxlQUFLLFNBQVM7QUFDZCxjQUFJO0FBQ0gsaUJBQUssU0FBUyxDQUFDLGlCQUFpQixDQUFDO0FBQUEsVUFDbEMsUUFBUTtBQUFBLFVBQUU7QUFBQSxRQUNYO0FBQUEsTUFDRDtBQUVBLGVBQVMsNEJBQWdEO0FBQ3hELGNBQU1BLGdCQUFlLDJCQUEyQixXQUFXO0FBQzNELGNBQU0sVUFBVUEsZUFBYyxRQUFRLFNBQVMsU0FBUztBQUN4RCxZQUFJLENBQUNBLGlCQUFnQixDQUFDLFNBQVM7QUFDOUI7QUFBQSxRQUNEO0FBQ0EsZUFBTyxtQkFBbUJBLGNBQWEsU0FBUyxTQUFTLGtDQUFrQyxtQkFBbUIsU0FBU0EsY0FBYSxNQUFNLElBQUksU0FBU0EsY0FBYSxRQUFRO0FBQUEsTUFDN0s7QUFDQSxZQUFNLFVBQVUsMEJBQTBCO0FBQzFDLFVBQUksQ0FBQyxTQUFTO0FBQ2I7QUFBQSxNQUNEO0FBQ0EsbUJBQWEsV0FBVyxNQUFNLHNCQUFzQixLQUFLLENBQUM7QUFDMUQsYUFBTyxJQUFJO0FBQUEsUUFDVix5QkFBeUI7QUFBQSxRQUN6QixFQUFFLE1BQU0sbUJBQW1CLEtBQUs7QUFBQSxRQUNoQyxNQUFNO0FBQUEsUUFDTixNQUFNLFVBQVU7QUFBQSxRQUNoQjtBQUFBLFFBQ0E7QUFBQSxRQUNBLDJCQUEyQixjQUFjLDBCQUEwQjtBQUFBLFFBQ25FLE1BQU07QUFDTCxjQUFJLENBQUMsTUFBTTtBQUNWO0FBQUEsVUFDRDtBQUNBLG9CQUFVO0FBQ1YsZUFBSyxVQUFVO0FBQ2YsaUJBQU8sMEJBQTBCO0FBQUEsUUFDbEM7QUFBQSxRQUNBLE1BQU07QUFDTCxjQUFJLENBQUMsTUFBTTtBQUNWO0FBQUEsVUFDRDtBQUNBLG9CQUFVO0FBQ1YsZUFBSyxjQUFjO0FBQ25CLGlCQUFPLDBCQUEwQjtBQUFBLFFBQ2xDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxXQUFPLFlBQVk7QUFBQSxFQUNwQjtBQUNEO0FBR0EsU0FBUywyQkFBMkIsY0FBcUMsNEJBQWdGO0FBQ3hKLE1BQUksVUFBVTtBQUNkLE1BQUksYUFBYSxTQUFTO0FBQ3pCLGNBQVUsQ0FBQztBQUNYLFFBQUksYUFBYSxRQUFRLFNBQVM7QUFDakMsY0FBUSxLQUFLLEdBQUcsYUFBYSxRQUFRLE9BQU87QUFBQSxJQUM3QztBQUNBLFFBQUksYUFBYSxRQUFRLFdBQVc7QUFDbkMsY0FBUSxLQUFLLEdBQUcsYUFBYSxRQUFRLFNBQVM7QUFBQSxJQUMvQztBQUFBLEVBQ0Q7QUFDQSxNQUFJLFNBQVM7QUFDWixlQUFXLFVBQVUsU0FBUztBQUM3QixhQUFPLFFBQVEsVUFBVSxZQUFZLFFBQVEsSUFBSTtBQUNqRCxZQUFNLGdCQUFnQixPQUFPO0FBQzdCLGFBQU8sTUFBTSxNQUFNO0FBQ2xCLHNCQUFjO0FBQ2QscUJBQWEsTUFBTTtBQUFBLE1BQ3BCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDQSxRQUFNLGtCQUFrQixTQUFTLEtBQUssT0FBSyxFQUFFLE1BQU0sU0FBUyxrQkFBa0IsQ0FBQztBQUMvRSxNQUFJLGlCQUFpQjtBQUNwQixvQkFBZ0IsUUFBUSxVQUFVLFlBQVksUUFBUSxJQUFJO0FBQUEsRUFDM0Q7QUFDQSxNQUFJLFNBQVM7QUFDWixZQUFRLEtBQUs7QUFBQSxNQUNaLElBQUk7QUFBQSxNQUFxQixPQUFPLFNBQVMscUJBQXFCLG9CQUFvQjtBQUFBLE1BQUcsU0FBUyxTQUFTLHFCQUFxQixvQkFBb0I7QUFBQSxNQUFHLEtBQUssTUFBTTtBQUM3SixxQkFBYSxNQUFNO0FBQ25CLG1DQUEyQixXQUFXLG9CQUFvQixLQUFLO0FBQUEsTUFDaEU7QUFBQSxNQUFHLFNBQVM7QUFBQSxNQUFNLE9BQU8sVUFBVSxZQUFZLFFBQVEsUUFBUTtBQUFBLElBQ2hFLENBQUM7QUFBQSxFQUNGO0FBQ0EsU0FBTztBQUNSOyIsCiAgIm5hbWVzIjogWyJub3RpZmljYXRpb24iXQp9Cg==
