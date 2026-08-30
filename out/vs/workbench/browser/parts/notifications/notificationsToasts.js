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
import "./media/notificationsToasts.css";
import { localize } from "../../../../nls.js";
import { NotificationChangeType, NotificationViewItemContentChangeKind, NotificationsSettings, NotificationsPosition, getNotificationsPosition } from "../../../common/notifications.js";
import { dispose, toDisposable } from "../../../../base/common/lifecycle.js";
import { addDisposableListener, EventType, Dimension, scheduleAtNextAnimationFrame, isAncestorOfActiveElement, getWindow, $, isHTMLElement, isEditableElement, getActiveElement, getDomNodePagePosition, getClientArea } from "../../../../base/browser/dom.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { NotificationsList } from "./notificationsList.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { IWorkbenchLayoutService, Parts } from "../../../services/layout/browser/layoutService.js";
import { NOTIFICATIONS_TOAST_BORDER, NOTIFICATIONS_BACKGROUND } from "../../../common/theme.js";
import { IThemeService, Themable } from "../../../../platform/theme/common/themeService.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { Severity, NotificationsFilter, NotificationPriority, withSeverityPrefix } from "../../../../platform/notification/common/notification.js";
import { ScrollbarVisibility } from "../../../../base/common/scrollable.js";
import { ILifecycleService, LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IntervalCounter } from "../../../../base/common/async.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { NotificationsToastsVisibleContext } from "../../../common/contextkeys.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { DEFAULT_CUSTOM_TITLEBAR_HEIGHT } from "../../../../platform/window/common/window.js";
import { PendingNotificationToasts } from "./pendingNotificationToasts.js";
import { onDidChangeNotificationRowHeight } from "./notificationsViewer.js";
var ToastVisibility = /* @__PURE__ */ ((ToastVisibility2) => {
  ToastVisibility2[ToastVisibility2["HIDDEN_OR_VISIBLE"] = 0] = "HIDDEN_OR_VISIBLE";
  ToastVisibility2[ToastVisibility2["HIDDEN"] = 1] = "HIDDEN";
  ToastVisibility2[ToastVisibility2["VISIBLE"] = 2] = "VISIBLE";
  return ToastVisibility2;
})(ToastVisibility || {});
let NotificationsToasts = class extends Themable {
  constructor(container, model, instantiationService, layoutService, themeService, editorGroupService, contextKeyService, lifecycleService, hostService, environmentService, configurationService) {
    super(themeService);
    this.container = container;
    this.model = model;
    this.instantiationService = instantiationService;
    this.layoutService = layoutService;
    this.editorGroupService = editorGroupService;
    this.lifecycleService = lifecycleService;
    this.hostService = hostService;
    this.environmentService = environmentService;
    this.configurationService = configurationService;
    this._onDidChangeVisibility = this._register(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    this._isVisible = false;
    this.mapNotificationToToast = /* @__PURE__ */ new Map();
    this.mapNotificationToDisposable = /* @__PURE__ */ new Map();
    this.addedToastsIntervalCounter = new IntervalCounter(NotificationsToasts.SPAM_PROTECTION.interval);
    this.notificationsToastsVisibleContextKey = NotificationsToastsVisibleContext.bindTo(contextKeyService);
    this.pendingToasts = this._register(new PendingNotificationToasts(
      (item) => this.model.notifications.includes(item),
      (item, other) => item.equals(other),
      (callback) => scheduleAtNextAnimationFrame(getWindow(this.container), callback)
    ));
    this._register(toDisposable(() => this.removeToasts()));
    this._register(onDidChangeNotificationRowHeight(() => this.updateNotificationHeights()));
    this.registerListeners();
  }
  get isVisible() {
    return !!this._isVisible;
  }
  updateNotificationHeights() {
    this.mapNotificationToToast.forEach(({ list }) => list.updateNotificationHeights());
    const maxDimensions = this.computeMaxDimensions();
    if (maxDimensions.height) {
      this.layoutContainer(maxDimensions.height);
    }
  }
  registerListeners() {
    this._register(this.layoutService.onDidLayoutMainContainer((dimension) => this.layout(Dimension.lift(dimension))));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(NotificationsSettings.NOTIFICATIONS_POSITION)) {
        this.updateNotificationPosition();
      }
    }));
    this.lifecycleService.when(LifecyclePhase.Restored).then(() => {
      this.model.notifications.forEach((notification) => this.addToast(notification));
      this._register(this.model.onDidChangeNotification((e) => this.onDidChangeNotification(e)));
    });
    this._register(this.model.onDidChangeFilter(({ global, sources }) => {
      if (global === NotificationsFilter.ERROR) {
        this.hide();
      } else if (sources) {
        for (const [notification] of this.mapNotificationToToast) {
          if (typeof notification.sourceId === "string" && sources.get(notification.sourceId) === NotificationsFilter.ERROR && notification.severity !== Severity.Error && notification.priority !== NotificationPriority.URGENT) {
            this.removeToast(notification);
          }
        }
      }
    }));
  }
  updateNotificationPosition() {
    if (!this.notificationsToastsContainer) {
      return;
    }
    const position = getNotificationsPosition(this.configurationService);
    this.notificationsToastsContainer.classList.remove("bottom-right", "bottom-left", "top-right");
    this.notificationsToastsContainer.classList.add(position);
    this.updateTopOffset();
  }
  updateTopOffset() {
    if (!this.notificationsToastsContainer) {
      return;
    }
    const position = getNotificationsPosition(this.configurationService);
    if (position === NotificationsPosition.TOP_RIGHT) {
      let topOffset = 3;
      if (this.layoutService.isVisible(Parts.TITLEBAR_PART, mainWindow)) {
        topOffset += DEFAULT_CUSTOM_TITLEBAR_HEIGHT;
      }
      this.notificationsToastsContainer.style.top = `${topOffset}px`;
    } else {
      this.notificationsToastsContainer.style.top = "";
    }
  }
  onDidChangeNotification(e) {
    switch (e.kind) {
      case NotificationChangeType.ADD:
        return this.addToast(e.item);
      case NotificationChangeType.REMOVE:
        return this.removeToast(e.item);
    }
  }
  addToast(item) {
    if (this.isNotificationsCenterVisible) {
      return;
    }
    if (this.environmentService.enableSmokeTestDriver) {
      return;
    }
    if (item.priority === NotificationPriority.SILENT) {
      return;
    }
    if (item.priority === NotificationPriority.OPTIONAL) {
      const activeElement = getActiveElement();
      if (isHTMLElement(activeElement) && isEditableElement(activeElement) && this.isElementInNotificationQuarter(activeElement)) {
        return;
      }
    }
    if (this.pendingToasts.tryReplace(item)) {
      return;
    }
    if (this.addedToastsIntervalCounter.increment() > NotificationsToasts.SPAM_PROTECTION.limit) {
      return;
    }
    this.pendingToasts.add(item, (pendingItem, itemDisposables) => {
      this.mapNotificationToDisposable.set(pendingItem, itemDisposables);
      this.doAddToast(pendingItem, itemDisposables);
    });
  }
  isElementInNotificationQuarter(element) {
    const position = getNotificationsPosition(this.configurationService);
    const domPosition = getDomNodePagePosition(element);
    const clientArea = getClientArea(this.layoutService.mainContainer);
    switch (position) {
      case NotificationsPosition.BOTTOM_LEFT:
        return domPosition.left < clientArea.width / 2 && domPosition.top > clientArea.height / 2;
      case NotificationsPosition.TOP_RIGHT:
        return domPosition.left > clientArea.width / 2 && domPosition.top < clientArea.height / 2;
      case NotificationsPosition.BOTTOM_RIGHT:
      default:
        return domPosition.left > clientArea.width / 2 && domPosition.top > clientArea.height / 2;
    }
  }
  doAddToast(item, itemDisposables) {
    let notificationsToastsContainer = this.notificationsToastsContainer;
    if (!notificationsToastsContainer) {
      notificationsToastsContainer = this.notificationsToastsContainer = $(".notifications-toasts");
      this.container.appendChild(notificationsToastsContainer);
    }
    this.updateNotificationPosition();
    notificationsToastsContainer.classList.add("visible");
    const notificationToastContainer = $(".notification-toast-container");
    const firstToast = notificationsToastsContainer.firstChild;
    if (firstToast) {
      notificationsToastsContainer.insertBefore(notificationToastContainer, firstToast);
    } else {
      notificationsToastsContainer.appendChild(notificationToastContainer);
    }
    const notificationToast = $(".notification-toast");
    notificationToastContainer.appendChild(notificationToast);
    const notificationList = this.instantiationService.createInstance(NotificationsList, notificationToast, {
      verticalScrollMode: ScrollbarVisibility.Hidden,
      widgetAriaLabel: (() => {
        if (!item.source) {
          return withSeverityPrefix(localize("notificationAriaLabel", "{0}, notification", item.message.raw), item.severity);
        }
        return withSeverityPrefix(localize("notificationWithSourceAriaLabel", "{0}, source: {1}, notification", item.message.raw, item.source), item.severity);
      })()
    });
    itemDisposables.add(notificationList);
    const toast = { item, list: notificationList, container: notificationToastContainer, toast: notificationToast };
    this.mapNotificationToToast.set(item, toast);
    itemDisposables.add(toDisposable(() => this.updateToastVisibility(toast, false)));
    notificationList.show();
    const maxDimensions = this.computeMaxDimensions();
    this.layoutLists(maxDimensions.width);
    notificationList.updateNotificationsList(0, 0, [item]);
    this.layoutContainer(maxDimensions.height);
    itemDisposables.add(item.onDidChangeExpansion(() => {
      notificationList.updateNotificationsList(0, 1, [item]);
    }));
    itemDisposables.add(item.onDidChangeContent((e) => {
      switch (e.kind) {
        case NotificationViewItemContentChangeKind.ACTIONS:
          notificationList.updateNotificationsList(0, 1, [item]);
          break;
        case NotificationViewItemContentChangeKind.MESSAGE:
          if (item.expanded) {
            notificationList.updateNotificationHeight(item);
          }
          break;
      }
    }));
    Event.once(item.onDidClose)(() => {
      this.removeToast(item);
    });
    this.purgeNotification(item, notificationToastContainer, notificationList, itemDisposables);
    this.updateStyles();
    this.notificationsToastsVisibleContextKey.set(true);
    notificationToast.classList.add("notification-fade-in");
    itemDisposables.add(addDisposableListener(notificationToast, "transitionend", () => {
      notificationToast.classList.remove("notification-fade-in");
      notificationToast.classList.add("notification-fade-in-done");
    }));
    item.updateVisibility(true);
    if (!this._isVisible) {
      this._isVisible = true;
      this._onDidChangeVisibility.fire();
    }
  }
  purgeNotification(item, notificationToastContainer, notificationList, disposables) {
    let isMouseOverToast = false;
    disposables.add(addDisposableListener(notificationToastContainer, EventType.MOUSE_OVER, () => isMouseOverToast = true));
    disposables.add(addDisposableListener(notificationToastContainer, EventType.MOUSE_OUT, () => isMouseOverToast = false));
    let purgeTimeoutHandle;
    let listener;
    const hideAfterTimeout = () => {
      purgeTimeoutHandle = setTimeout(() => {
        if (!this.hostService.hasFocus) {
          if (!listener) {
            listener = this.hostService.onDidChangeFocus((focus) => {
              if (focus) {
                hideAfterTimeout();
              }
            });
            disposables.add(listener);
          }
        } else if (item.sticky || // never hide sticky notifications
        notificationList.hasFocus() || // never hide notifications with focus
        isMouseOverToast) {
          hideAfterTimeout();
        } else {
          this.removeToast(item);
        }
      }, NotificationsToasts.PURGE_TIMEOUT[item.severity]);
    };
    hideAfterTimeout();
    disposables.add(toDisposable(() => clearTimeout(purgeTimeoutHandle)));
  }
  removeToast(item) {
    let focusEditor = false;
    this.pendingToasts.remove(item);
    const notificationToast = this.mapNotificationToToast.get(item);
    if (notificationToast) {
      const toastHasDOMFocus = isAncestorOfActiveElement(notificationToast.container);
      if (toastHasDOMFocus) {
        focusEditor = !(this.focusNext() || this.focusPrevious());
      }
      this.mapNotificationToToast.delete(item);
    }
    const notificationDisposables = this.mapNotificationToDisposable.get(item);
    if (notificationDisposables) {
      dispose(notificationDisposables);
      this.mapNotificationToDisposable.delete(item);
    }
    if (this.mapNotificationToToast.size > 0) {
      this.layout(this.workbenchDimensions);
    } else {
      this.doHide();
      if (focusEditor) {
        this.editorGroupService.activeGroup.focus();
      }
    }
  }
  removeToasts() {
    this.pendingToasts.clear();
    this.mapNotificationToToast.clear();
    this.mapNotificationToDisposable.forEach((disposable) => dispose(disposable));
    this.mapNotificationToDisposable.clear();
    this.doHide();
  }
  doHide() {
    this.notificationsToastsContainer?.classList.remove("visible");
    this.notificationsToastsVisibleContextKey.set(false);
    if (this._isVisible) {
      this._isVisible = false;
      this._onDidChangeVisibility.fire();
    }
  }
  hide() {
    const focusEditor = this.notificationsToastsContainer ? isAncestorOfActiveElement(this.notificationsToastsContainer) : false;
    this.removeToasts();
    if (focusEditor) {
      this.editorGroupService.activeGroup.focus();
    }
  }
  focus() {
    const toasts = this.getToasts(2 /* VISIBLE */);
    if (toasts.length > 0) {
      toasts[0].list.focusFirst();
      return true;
    }
    return false;
  }
  focusNext() {
    const toasts = this.getToasts(2 /* VISIBLE */);
    for (let i = 0; i < toasts.length; i++) {
      const toast = toasts[i];
      if (toast.list.hasFocus()) {
        const nextToast = toasts[i + 1];
        if (nextToast) {
          nextToast.list.focusFirst();
          return true;
        }
        break;
      }
    }
    return false;
  }
  focusPrevious() {
    const toasts = this.getToasts(2 /* VISIBLE */);
    for (let i = 0; i < toasts.length; i++) {
      const toast = toasts[i];
      if (toast.list.hasFocus()) {
        const previousToast = toasts[i - 1];
        if (previousToast) {
          previousToast.list.focusFirst();
          return true;
        }
        break;
      }
    }
    return false;
  }
  focusFirst() {
    const toast = this.getToasts(2 /* VISIBLE */)[0];
    if (toast) {
      toast.list.focusFirst();
      return true;
    }
    return false;
  }
  focusLast() {
    const toasts = this.getToasts(2 /* VISIBLE */);
    if (toasts.length > 0) {
      toasts[toasts.length - 1].list.focusFirst();
      return true;
    }
    return false;
  }
  update(isCenterVisible) {
    if (this.isNotificationsCenterVisible !== isCenterVisible) {
      this.isNotificationsCenterVisible = isCenterVisible;
      if (this.isNotificationsCenterVisible) {
        this.removeToasts();
      }
    }
  }
  updateStyles() {
    this.mapNotificationToToast.forEach(({ toast }) => {
      const backgroundColor = this.getColor(NOTIFICATIONS_BACKGROUND);
      toast.style.background = backgroundColor ? backgroundColor : "";
      const borderColor = this.getColor(NOTIFICATIONS_TOAST_BORDER);
      toast.style.border = borderColor ? `1px solid ${borderColor}` : "";
    });
  }
  getToasts(state) {
    const notificationToasts = [];
    this.mapNotificationToToast.forEach((toast) => {
      switch (state) {
        case 0 /* HIDDEN_OR_VISIBLE */:
          notificationToasts.push(toast);
          break;
        case 1 /* HIDDEN */:
          if (!this.isToastInDOM(toast)) {
            notificationToasts.push(toast);
          }
          break;
        case 2 /* VISIBLE */:
          if (this.isToastInDOM(toast)) {
            notificationToasts.push(toast);
          }
          break;
      }
    });
    return notificationToasts.reverse();
  }
  layout(dimension) {
    this.workbenchDimensions = dimension;
    const maxDimensions = this.computeMaxDimensions();
    this.updateTopOffset();
    if (maxDimensions.height) {
      this.layoutContainer(maxDimensions.height);
    }
    this.layoutLists(maxDimensions.width);
  }
  computeMaxDimensions() {
    const maxWidth = NotificationsToasts.MAX_WIDTH;
    let availableWidth = maxWidth;
    let availableHeight;
    if (this.workbenchDimensions) {
      availableWidth = this.workbenchDimensions.width;
      availableWidth -= 2 * 8;
      availableHeight = this.workbenchDimensions.height;
      if (this.layoutService.isVisible(Parts.STATUSBAR_PART, mainWindow)) {
        availableHeight -= 22;
      }
      if (this.layoutService.isVisible(Parts.TITLEBAR_PART, mainWindow)) {
        availableHeight -= 22;
      }
      availableHeight -= 2 * 12;
    }
    return new Dimension(Math.min(maxWidth, availableWidth), availableHeight ?? 0);
  }
  layoutLists(width) {
    this.mapNotificationToToast.forEach(({ list }) => list.layout(width));
  }
  layoutContainer(heightToGive) {
    let singleToastHeightToGive = heightToGive;
    let multipleToastsHeightToGive = Math.round(heightToGive * 0.618);
    let visibleToasts = 0;
    for (const toast of this.getToasts(0 /* HIDDEN_OR_VISIBLE */)) {
      toast.container.style.opacity = "0";
      this.updateToastVisibility(toast, true);
      singleToastHeightToGive -= toast.container.offsetHeight;
      multipleToastsHeightToGive -= toast.container.offsetHeight;
      let makeVisible = false;
      if (visibleToasts === NotificationsToasts.MAX_NOTIFICATIONS) {
        makeVisible = false;
      } else if (visibleToasts === 0 && singleToastHeightToGive >= 0 || visibleToasts > 0 && multipleToastsHeightToGive >= 0) {
        makeVisible = true;
      }
      this.updateToastVisibility(toast, makeVisible);
      toast.container.style.opacity = "";
      if (makeVisible) {
        visibleToasts++;
      }
    }
  }
  updateToastVisibility(toast, visible) {
    if (this.isToastInDOM(toast) === visible) {
      return;
    }
    const notificationsToastsContainer = assertReturnsDefined(this.notificationsToastsContainer);
    if (visible) {
      notificationsToastsContainer.appendChild(toast.container);
    } else {
      toast.container.remove();
    }
    toast.item.updateVisibility(visible);
  }
  isToastInDOM(toast) {
    return !!toast.container.parentElement;
  }
};
NotificationsToasts.MAX_WIDTH = 450;
NotificationsToasts.MAX_NOTIFICATIONS = 3;
NotificationsToasts.PURGE_TIMEOUT = {
  [Severity.Info]: 1e4,
  [Severity.Warning]: 12e3,
  [Severity.Error]: 15e3
};
NotificationsToasts.SPAM_PROTECTION = {
  // Count for the number of notifications over 800ms...
  interval: 800,
  // ...and ensure we are not showing more than MAX_NOTIFICATIONS
  limit: NotificationsToasts.MAX_NOTIFICATIONS
};
NotificationsToasts = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IWorkbenchLayoutService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, IEditorGroupsService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, ILifecycleService),
  __decorateParam(8, IHostService),
  __decorateParam(9, IWorkbenchEnvironmentService),
  __decorateParam(10, IConfigurationService)
], NotificationsToasts);
export {
  NotificationsToasts
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxub3RpZmljYXRpb25zXFxub3RpZmljYXRpb25zVG9hc3RzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL25vdGlmaWNhdGlvbnNUb2FzdHMuY3NzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25zTW9kZWwsIE5vdGlmaWNhdGlvbkNoYW5nZVR5cGUsIElOb3RpZmljYXRpb25DaGFuZ2VFdmVudCwgSU5vdGlmaWNhdGlvblZpZXdJdGVtLCBOb3RpZmljYXRpb25WaWV3SXRlbUNvbnRlbnRDaGFuZ2VLaW5kLCBOb3RpZmljYXRpb25zU2V0dGluZ3MsIE5vdGlmaWNhdGlvbnNQb3NpdGlvbiwgZ2V0Tm90aWZpY2F0aW9uc1Bvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGlmaWNhdGlvbnMuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIGRpc3Bvc2UsIHRvRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRXZlbnRUeXBlLCBEaW1lbnNpb24sIHNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUsIGlzQW5jZXN0b3JPZkFjdGl2ZUVsZW1lbnQsIGdldFdpbmRvdywgJCwgaXNIVE1MRWxlbWVudCwgaXNFZGl0YWJsZUVsZW1lbnQsIGdldEFjdGl2ZUVsZW1lbnQsIGdldERvbU5vZGVQYWdlUG9zaXRpb24sIGdldENsaWVudEFyZWEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgTm90aWZpY2F0aW9uc0xpc3QgfSBmcm9tICcuL25vdGlmaWNhdGlvbnNMaXN0LmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIFBhcnRzIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBOT1RJRklDQVRJT05TX1RPQVNUX0JPUkRFUiwgTk9USUZJQ0FUSU9OU19CQUNLR1JPVU5EIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UsIFRoZW1hYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uc1RvYXN0Q29udHJvbGxlciB9IGZyb20gJy4vbm90aWZpY2F0aW9uc0NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFNldmVyaXR5LCBOb3RpZmljYXRpb25zRmlsdGVyLCBOb3RpZmljYXRpb25Qcmlvcml0eSwgd2l0aFNldmVyaXR5UHJlZml4IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgU2Nyb2xsYmFyVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UsIExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSW50ZXJ2YWxDb3VudGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBOb3RpZmljYXRpb25zVG9hc3RzVmlzaWJsZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0NVU1RPTV9USVRMRUJBUl9IRUlHSFQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBQZW5kaW5nTm90aWZpY2F0aW9uVG9hc3RzIH0gZnJvbSAnLi9wZW5kaW5nTm90aWZpY2F0aW9uVG9hc3RzLmpzJztcbmltcG9ydCB7IG9uRGlkQ2hhbmdlTm90aWZpY2F0aW9uUm93SGVpZ2h0IH0gZnJvbSAnLi9ub3RpZmljYXRpb25zVmlld2VyLmpzJztcblxuaW50ZXJmYWNlIElOb3RpZmljYXRpb25Ub2FzdCB7XG5cdHJlYWRvbmx5IGl0ZW06IElOb3RpZmljYXRpb25WaWV3SXRlbTtcblx0cmVhZG9ubHkgbGlzdDogTm90aWZpY2F0aW9uc0xpc3Q7XG5cdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHRvYXN0OiBIVE1MRWxlbWVudDtcbn1cblxuZW51bSBUb2FzdFZpc2liaWxpdHkge1xuXHRISURERU5fT1JfVklTSUJMRSxcblx0SElEREVOLFxuXHRWSVNJQkxFXG59XG5cbmV4cG9ydCBjbGFzcyBOb3RpZmljYXRpb25zVG9hc3RzIGV4dGVuZHMgVGhlbWFibGUgaW1wbGVtZW50cyBJTm90aWZpY2F0aW9uc1RvYXN0Q29udHJvbGxlciB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFYX1dJRFRIID0gNDUwO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfTk9USUZJQ0FUSU9OUyA9IDM7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUFVSR0VfVElNRU9VVDogeyBbc2V2ZXJpdHk6IG51bWJlcl06IG51bWJlciB9ID0ge1xuXHRcdFtTZXZlcml0eS5JbmZvXTogMTAwMDAsXG5cdFx0W1NldmVyaXR5Lldhcm5pbmddOiAxMjAwMCxcblx0XHRbU2V2ZXJpdHkuRXJyb3JdOiAxNTAwMFxuXHR9O1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNQQU1fUFJPVEVDVElPTiA9IHtcblx0XHQvLyBDb3VudCBmb3IgdGhlIG51bWJlciBvZiBub3RpZmljYXRpb25zIG92ZXIgODAwbXMuLi5cblx0XHRpbnRlcnZhbDogODAwLFxuXHRcdC8vIC4uLmFuZCBlbnN1cmUgd2UgYXJlIG5vdCBzaG93aW5nIG1vcmUgdGhhbiBNQVhfTk9USUZJQ0FUSU9OU1xuXHRcdGxpbWl0OiB0aGlzLk1BWF9OT1RJRklDQVRJT05TXG5cdH07XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VWaXNpYmlsaXR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlzaWJpbGl0eSA9IHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5ldmVudDtcblxuXHRwcml2YXRlIF9pc1Zpc2libGUgPSBmYWxzZTtcblx0Z2V0IGlzVmlzaWJsZSgpOiBib29sZWFuIHsgcmV0dXJuICEhdGhpcy5faXNWaXNpYmxlOyB9XG5cblx0cHJpdmF0ZSBub3RpZmljYXRpb25zVG9hc3RzQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB3b3JrYmVuY2hEaW1lbnNpb25zOiBEaW1lbnNpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaXNOb3RpZmljYXRpb25zQ2VudGVyVmlzaWJsZTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG1hcE5vdGlmaWNhdGlvblRvVG9hc3QgPSBuZXcgTWFwPElOb3RpZmljYXRpb25WaWV3SXRlbSwgSU5vdGlmaWNhdGlvblRvYXN0PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1hcE5vdGlmaWNhdGlvblRvRGlzcG9zYWJsZSA9IG5ldyBNYXA8SU5vdGlmaWNhdGlvblZpZXdJdGVtLCBJRGlzcG9zYWJsZT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBwZW5kaW5nVG9hc3RzOiBQZW5kaW5nTm90aWZpY2F0aW9uVG9hc3RzPElOb3RpZmljYXRpb25WaWV3SXRlbT47XG5cblx0cHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25zVG9hc3RzVmlzaWJsZUNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgYWRkZWRUb2FzdHNJbnRlcnZhbENvdW50ZXIgPSBuZXcgSW50ZXJ2YWxDb3VudGVyKE5vdGlmaWNhdGlvbnNUb2FzdHMuU1BBTV9QUk9URUNUSU9OLmludGVydmFsKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtb2RlbDogSU5vdGlmaWNhdGlvbnNNb2RlbCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIodGhlbWVTZXJ2aWNlKTtcblxuXHRcdHRoaXMubm90aWZpY2F0aW9uc1RvYXN0c1Zpc2libGVDb250ZXh0S2V5ID0gTm90aWZpY2F0aW9uc1RvYXN0c1Zpc2libGVDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5wZW5kaW5nVG9hc3RzID0gdGhpcy5fcmVnaXN0ZXIobmV3IFBlbmRpbmdOb3RpZmljYXRpb25Ub2FzdHMoXG5cdFx0XHRpdGVtID0+IHRoaXMubW9kZWwubm90aWZpY2F0aW9ucy5pbmNsdWRlcyhpdGVtKSxcblx0XHRcdChpdGVtLCBvdGhlcikgPT4gaXRlbS5lcXVhbHMob3RoZXIpLFxuXHRcdFx0Y2FsbGJhY2sgPT4gc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShnZXRXaW5kb3codGhpcy5jb250YWluZXIpLCBjYWxsYmFjaylcblx0XHQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5yZW1vdmVUb2FzdHMoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG9uRGlkQ2hhbmdlTm90aWZpY2F0aW9uUm93SGVpZ2h0KCgpID0+IHRoaXMudXBkYXRlTm90aWZpY2F0aW9uSGVpZ2h0cygpKSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZU5vdGlmaWNhdGlvbkhlaWdodHMoKTogdm9pZCB7XG5cdFx0dGhpcy5tYXBOb3RpZmljYXRpb25Ub1RvYXN0LmZvckVhY2goKHsgbGlzdCB9KSA9PiBsaXN0LnVwZGF0ZU5vdGlmaWNhdGlvbkhlaWdodHMoKSk7XG5cblx0XHRjb25zdCBtYXhEaW1lbnNpb25zID0gdGhpcy5jb21wdXRlTWF4RGltZW5zaW9ucygpO1xuXHRcdGlmIChtYXhEaW1lbnNpb25zLmhlaWdodCkge1xuXHRcdFx0dGhpcy5sYXlvdXRDb250YWluZXIobWF4RGltZW5zaW9ucy5oZWlnaHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cblx0XHQvLyBMYXlvdXRcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxheW91dFNlcnZpY2Uub25EaWRMYXlvdXRNYWluQ29udGFpbmVyKGRpbWVuc2lvbiA9PiB0aGlzLmxheW91dChEaW1lbnNpb24ubGlmdChkaW1lbnNpb24pKSkpO1xuXG5cdFx0Ly8gUG9zaXRpb24gY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90aWZpY2F0aW9uc1NldHRpbmdzLk5PVElGSUNBVElPTlNfUE9TSVRJT04pKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlTm90aWZpY2F0aW9uUG9zaXRpb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBEZWxheSBzb21lIHRhc2tzIHVudGlsIGFmdGVyIHdlIGhhdmUgcmVzdG9yZWRcblx0XHQvLyB0byByZWR1Y2UgVUkgcHJlc3N1cmUgZnJvbSB0aGUgc3RhcnR1cCBwaGFzZVxuXHRcdHRoaXMubGlmZWN5Y2xlU2VydmljZS53aGVuKExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKS50aGVuKCgpID0+IHtcblxuXHRcdFx0Ly8gU2hvdyB0b2FzdCBmb3IgaW5pdGlhbCBub3RpZmljYXRpb25zIGlmIGFueVxuXHRcdFx0dGhpcy5tb2RlbC5ub3RpZmljYXRpb25zLmZvckVhY2gobm90aWZpY2F0aW9uID0+IHRoaXMuYWRkVG9hc3Qobm90aWZpY2F0aW9uKSk7XG5cblx0XHRcdC8vIFVwZGF0ZSB0b2FzdHMgb24gbm90aWZpY2F0aW9uIGNoYW5nZXNcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubW9kZWwub25EaWRDaGFuZ2VOb3RpZmljYXRpb24oZSA9PiB0aGlzLm9uRGlkQ2hhbmdlTm90aWZpY2F0aW9uKGUpKSk7XG5cdFx0fSk7XG5cblx0XHQvLyBGaWx0ZXJcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1vZGVsLm9uRGlkQ2hhbmdlRmlsdGVyKCh7IGdsb2JhbCwgc291cmNlcyB9KSA9PiB7XG5cdFx0XHRpZiAoZ2xvYmFsID09PSBOb3RpZmljYXRpb25zRmlsdGVyLkVSUk9SKSB7XG5cdFx0XHRcdHRoaXMuaGlkZSgpO1xuXHRcdFx0fSBlbHNlIGlmIChzb3VyY2VzKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgW25vdGlmaWNhdGlvbl0gb2YgdGhpcy5tYXBOb3RpZmljYXRpb25Ub1RvYXN0KSB7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBub3RpZmljYXRpb24uc291cmNlSWQgPT09ICdzdHJpbmcnICYmIHNvdXJjZXMuZ2V0KG5vdGlmaWNhdGlvbi5zb3VyY2VJZCkgPT09IE5vdGlmaWNhdGlvbnNGaWx0ZXIuRVJST1IgJiYgbm90aWZpY2F0aW9uLnNldmVyaXR5ICE9PSBTZXZlcml0eS5FcnJvciAmJiBub3RpZmljYXRpb24ucHJpb3JpdHkgIT09IE5vdGlmaWNhdGlvblByaW9yaXR5LlVSR0VOVCkge1xuXHRcdFx0XHRcdFx0dGhpcy5yZW1vdmVUb2FzdChub3RpZmljYXRpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTm90aWZpY2F0aW9uUG9zaXRpb24oKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm5vdGlmaWNhdGlvbnNUb2FzdHNDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwb3NpdGlvbiA9IGdldE5vdGlmaWNhdGlvbnNQb3NpdGlvbih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLm5vdGlmaWNhdGlvbnNUb2FzdHNDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnYm90dG9tLXJpZ2h0JywgJ2JvdHRvbS1sZWZ0JywgJ3RvcC1yaWdodCcpO1xuXHRcdHRoaXMubm90aWZpY2F0aW9uc1RvYXN0c0NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKHBvc2l0aW9uKTtcblxuXHRcdHRoaXMudXBkYXRlVG9wT2Zmc2V0KCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVRvcE9mZnNldCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubm90aWZpY2F0aW9uc1RvYXN0c0NvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBvc2l0aW9uID0gZ2V0Tm90aWZpY2F0aW9uc1Bvc2l0aW9uKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGlmIChwb3NpdGlvbiA9PT0gTm90aWZpY2F0aW9uc1Bvc2l0aW9uLlRPUF9SSUdIVCkge1xuXHRcdFx0bGV0IHRvcE9mZnNldCA9IDM7XG5cdFx0XHRpZiAodGhpcy5sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5USVRMRUJBUl9QQVJULCBtYWluV2luZG93KSkge1xuXHRcdFx0XHR0b3BPZmZzZXQgKz0gREVGQVVMVF9DVVNUT01fVElUTEVCQVJfSEVJR0hUO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25zVG9hc3RzQ29udGFpbmVyLnN0eWxlLnRvcCA9IGAke3RvcE9mZnNldH1weGA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uc1RvYXN0c0NvbnRhaW5lci5zdHlsZS50b3AgPSAnJztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlTm90aWZpY2F0aW9uKGU6IElOb3RpZmljYXRpb25DaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdHN3aXRjaCAoZS5raW5kKSB7XG5cdFx0XHRjYXNlIE5vdGlmaWNhdGlvbkNoYW5nZVR5cGUuQUREOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5hZGRUb2FzdChlLml0ZW0pO1xuXHRcdFx0Y2FzZSBOb3RpZmljYXRpb25DaGFuZ2VUeXBlLlJFTU9WRTpcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVtb3ZlVG9hc3QoZS5pdGVtKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFkZFRvYXN0KGl0ZW06IElOb3RpZmljYXRpb25WaWV3SXRlbSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzTm90aWZpY2F0aW9uc0NlbnRlclZpc2libGUpIHtcblx0XHRcdHJldHVybjsgLy8gZG8gbm90IHNob3cgdG9hc3RzIHdoaWxlIG5vdGlmaWNhdGlvbiBjZW50ZXIgaXMgdmlzaWJsZVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5lbmFibGVTbW9rZVRlc3REcml2ZXIpIHtcblx0XHRcdHJldHVybjsgLy8gZGlzYWJsZSBpbiBzbW9rZSB0ZXN0cyB0byBwcmV2ZW50IGNvdmVyaW5nIGVsZW1lbnRzXG5cdFx0fVxuXG5cdFx0aWYgKGl0ZW0ucHJpb3JpdHkgPT09IE5vdGlmaWNhdGlvblByaW9yaXR5LlNJTEVOVCkge1xuXHRcdFx0cmV0dXJuOyAvLyBkbyBub3Qgc2hvdyB0b2FzdHMgZm9yIHNpbGVuY2VkIG5vdGlmaWNhdGlvbnNcblx0XHR9XG5cblx0XHRpZiAoaXRlbS5wcmlvcml0eSA9PT0gTm90aWZpY2F0aW9uUHJpb3JpdHkuT1BUSU9OQUwpIHtcblx0XHRcdGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBnZXRBY3RpdmVFbGVtZW50KCk7XG5cdFx0XHRpZiAoaXNIVE1MRWxlbWVudChhY3RpdmVFbGVtZW50KSAmJiBpc0VkaXRhYmxlRWxlbWVudChhY3RpdmVFbGVtZW50KSAmJiB0aGlzLmlzRWxlbWVudEluTm90aWZpY2F0aW9uUXVhcnRlcihhY3RpdmVFbGVtZW50KSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIHNraXAgc2hvd2luZyBvcHRpb25hbCB0b2FzdCB0aGF0IHBvdGVudGlhbGx5IGNvdmVycyBpbnB1dCBmaWVsZHNcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5wZW5kaW5nVG9hc3RzLnRyeVJlcGxhY2UoaXRlbSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBPcHRpbWl6YXRpb246IGl0IGlzIHBvc3NpYmxlIHRoYXQgYSBsb3Qgb2Ygbm90aWZpY2F0aW9ucyBhcmUgYmVpbmdcblx0XHQvLyBhZGRlZCBpbiBhIHZlcnkgc2hvcnQgdGltZS4gVG8gcHJldmVudCB0aGlzIGtpbmQgb2Ygc3BhbSwgd2UgcHJvdGVjdFxuXHRcdC8vIGFnYWluc3Qgc2hvd2luZyB0b28gbWFueSBub3RpZmljYXRpb25zIGF0IG9uY2UuIFNpbmNlIHRoZXkgY2FuIGFsd2F5c1xuXHRcdC8vIGJlIGFjY2Vzc2VkIGZyb20gdGhlIG5vdGlmaWNhdGlvbiBjZW50ZXIsIGEgdXNlciBjYW4gYWx3YXlzIGdldCB0b1xuXHRcdC8vIHRoZW0gbGF0ZXIgb24uXG5cdFx0Ly8gKHNlZSBhbHNvIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMDc5MzUpXG5cdFx0aWYgKHRoaXMuYWRkZWRUb2FzdHNJbnRlcnZhbENvdW50ZXIuaW5jcmVtZW50KCkgPiBOb3RpZmljYXRpb25zVG9hc3RzLlNQQU1fUFJPVEVDVElPTi5saW1pdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMucGVuZGluZ1RvYXN0cy5hZGQoaXRlbSwgKHBlbmRpbmdJdGVtLCBpdGVtRGlzcG9zYWJsZXMpID0+IHtcblx0XHRcdHRoaXMubWFwTm90aWZpY2F0aW9uVG9EaXNwb3NhYmxlLnNldChwZW5kaW5nSXRlbSwgaXRlbURpc3Bvc2FibGVzKTtcblx0XHRcdHRoaXMuZG9BZGRUb2FzdChwZW5kaW5nSXRlbSwgaXRlbURpc3Bvc2FibGVzKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgaXNFbGVtZW50SW5Ob3RpZmljYXRpb25RdWFydGVyKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSBnZXROb3RpZmljYXRpb25zUG9zaXRpb24odGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgZG9tUG9zaXRpb24gPSBnZXREb21Ob2RlUGFnZVBvc2l0aW9uKGVsZW1lbnQpO1xuXHRcdGNvbnN0IGNsaWVudEFyZWEgPSBnZXRDbGllbnRBcmVhKHRoaXMubGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyKTtcblxuXHRcdHN3aXRjaCAocG9zaXRpb24pIHtcblx0XHRcdGNhc2UgTm90aWZpY2F0aW9uc1Bvc2l0aW9uLkJPVFRPTV9MRUZUOlxuXHRcdFx0XHRyZXR1cm4gZG9tUG9zaXRpb24ubGVmdCA8IGNsaWVudEFyZWEud2lkdGggLyAyICYmIGRvbVBvc2l0aW9uLnRvcCA+IGNsaWVudEFyZWEuaGVpZ2h0IC8gMjtcblx0XHRcdGNhc2UgTm90aWZpY2F0aW9uc1Bvc2l0aW9uLlRPUF9SSUdIVDpcblx0XHRcdFx0cmV0dXJuIGRvbVBvc2l0aW9uLmxlZnQgPiBjbGllbnRBcmVhLndpZHRoIC8gMiAmJiBkb21Qb3NpdGlvbi50b3AgPCBjbGllbnRBcmVhLmhlaWdodCAvIDI7XG5cdFx0XHRjYXNlIE5vdGlmaWNhdGlvbnNQb3NpdGlvbi5CT1RUT01fUklHSFQ6XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gZG9tUG9zaXRpb24ubGVmdCA+IGNsaWVudEFyZWEud2lkdGggLyAyICYmIGRvbVBvc2l0aW9uLnRvcCA+IGNsaWVudEFyZWEuaGVpZ2h0IC8gMjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRvQWRkVG9hc3QoaXRlbTogSU5vdGlmaWNhdGlvblZpZXdJdGVtLCBpdGVtRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IHZvaWQge1xuXG5cdFx0Ly8gTGF6aWx5IGNyZWF0ZSB0b2FzdHMgY29udGFpbmVyc1xuXHRcdGxldCBub3RpZmljYXRpb25zVG9hc3RzQ29udGFpbmVyID0gdGhpcy5ub3RpZmljYXRpb25zVG9hc3RzQ29udGFpbmVyO1xuXHRcdGlmICghbm90aWZpY2F0aW9uc1RvYXN0c0NvbnRhaW5lcikge1xuXHRcdFx0bm90aWZpY2F0aW9uc1RvYXN0c0NvbnRhaW5lciA9IHRoaXMubm90aWZpY2F0aW9uc1RvYXN0c0NvbnRhaW5lciA9ICQoJy5ub3RpZmljYXRpb25zLXRvYXN0cycpO1xuXG5cdFx0XHR0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZChub3RpZmljYXRpb25zVG9hc3RzQ29udGFpbmVyKTtcblx0XHR9XG5cblx0XHQvLyBBcHBseSBwb3NpdGlvbiBjbGFzc1xuXHRcdHRoaXMudXBkYXRlTm90aWZpY2F0aW9uUG9zaXRpb24oKTtcblxuXHRcdC8vIE1ha2UgVmlzaWJsZVxuXHRcdG5vdGlmaWNhdGlvbnNUb2FzdHNDb250YWluZXIuY2xhc3NMaXN0LmFkZCgndmlzaWJsZScpO1xuXG5cdFx0Ly8gQ29udGFpbmVyXG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uVG9hc3RDb250YWluZXIgPSAkKCcubm90aWZpY2F0aW9uLXRvYXN0LWNvbnRhaW5lcicpO1xuXG5cdFx0Y29uc3QgZmlyc3RUb2FzdCA9IG5vdGlmaWNhdGlvbnNUb2FzdHNDb250YWluZXIuZmlyc3RDaGlsZDtcblx0XHRpZiAoZmlyc3RUb2FzdCkge1xuXHRcdFx0bm90aWZpY2F0aW9uc1RvYXN0c0NvbnRhaW5lci5pbnNlcnRCZWZvcmUobm90aWZpY2F0aW9uVG9hc3RDb250YWluZXIsIGZpcnN0VG9hc3QpOyAvLyBhbHdheXMgZmlyc3Rcblx0XHR9IGVsc2Uge1xuXHRcdFx0bm90aWZpY2F0aW9uc1RvYXN0c0NvbnRhaW5lci5hcHBlbmRDaGlsZChub3RpZmljYXRpb25Ub2FzdENvbnRhaW5lcik7XG5cdFx0fVxuXG5cdFx0Ly8gVG9hc3Rcblx0XHRjb25zdCBub3RpZmljYXRpb25Ub2FzdCA9ICQoJy5ub3RpZmljYXRpb24tdG9hc3QnKTtcblx0XHRub3RpZmljYXRpb25Ub2FzdENvbnRhaW5lci5hcHBlbmRDaGlsZChub3RpZmljYXRpb25Ub2FzdCk7XG5cblx0XHQvLyBDcmVhdGUgdG9hc3Qgd2l0aCBpdGVtIGFuZCBzaG93XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uTGlzdCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90aWZpY2F0aW9uc0xpc3QsIG5vdGlmaWNhdGlvblRvYXN0LCB7XG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbE1vZGU6IFNjcm9sbGJhclZpc2liaWxpdHkuSGlkZGVuLFxuXHRcdFx0d2lkZ2V0QXJpYUxhYmVsOiAoKCkgPT4ge1xuXHRcdFx0XHRpZiAoIWl0ZW0uc291cmNlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHdpdGhTZXZlcml0eVByZWZpeChsb2NhbGl6ZSgnbm90aWZpY2F0aW9uQXJpYUxhYmVsJywgXCJ7MH0sIG5vdGlmaWNhdGlvblwiLCBpdGVtLm1lc3NhZ2UucmF3KSwgaXRlbS5zZXZlcml0eSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gd2l0aFNldmVyaXR5UHJlZml4KGxvY2FsaXplKCdub3RpZmljYXRpb25XaXRoU291cmNlQXJpYUxhYmVsJywgXCJ7MH0sIHNvdXJjZTogezF9LCBub3RpZmljYXRpb25cIiwgaXRlbS5tZXNzYWdlLnJhdywgaXRlbS5zb3VyY2UpLCBpdGVtLnNldmVyaXR5KTtcblx0XHRcdH0pKClcblx0XHR9KTtcblx0XHRpdGVtRGlzcG9zYWJsZXMuYWRkKG5vdGlmaWNhdGlvbkxpc3QpO1xuXG5cdFx0Y29uc3QgdG9hc3Q6IElOb3RpZmljYXRpb25Ub2FzdCA9IHsgaXRlbSwgbGlzdDogbm90aWZpY2F0aW9uTGlzdCwgY29udGFpbmVyOiBub3RpZmljYXRpb25Ub2FzdENvbnRhaW5lciwgdG9hc3Q6IG5vdGlmaWNhdGlvblRvYXN0IH07XG5cdFx0dGhpcy5tYXBOb3RpZmljYXRpb25Ub1RvYXN0LnNldChpdGVtLCB0b2FzdCk7XG5cblx0XHQvLyBXaGVuIGRpc3Bvc2VkLCByZW1vdmUgYXMgdmlzaWJsZVxuXHRcdGl0ZW1EaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMudXBkYXRlVG9hc3RWaXNpYmlsaXR5KHRvYXN0LCBmYWxzZSkpKTtcblxuXHRcdC8vIE1ha2UgdmlzaWJsZVxuXHRcdG5vdGlmaWNhdGlvbkxpc3Quc2hvdygpO1xuXG5cdFx0Ly8gTGF5b3V0IGxpc3RzXG5cdFx0Y29uc3QgbWF4RGltZW5zaW9ucyA9IHRoaXMuY29tcHV0ZU1heERpbWVuc2lvbnMoKTtcblx0XHR0aGlzLmxheW91dExpc3RzKG1heERpbWVuc2lvbnMud2lkdGgpO1xuXG5cdFx0Ly8gU2hvdyBub3RpZmljYXRpb25cblx0XHRub3RpZmljYXRpb25MaXN0LnVwZGF0ZU5vdGlmaWNhdGlvbnNMaXN0KDAsIDAsIFtpdGVtXSk7XG5cblx0XHQvLyBMYXlvdXQgY29udGFpbmVyOiBvbmx5IGFmdGVyIHdlIHNob3cgdGhlIG5vdGlmaWNhdGlvbiB0byBlbnN1cmUgdGhhdFxuXHRcdC8vIHRoZSBoZWlnaHQgY29tcHV0YXRpb24gdGFrZXMgdGhlIGNvbnRlbnQgb2YgaXQgaW50byBhY2NvdW50IVxuXHRcdHRoaXMubGF5b3V0Q29udGFpbmVyKG1heERpbWVuc2lvbnMuaGVpZ2h0KTtcblxuXHRcdC8vIFJlLWRyYXcgZW50aXJlIGl0ZW0gd2hlbiBleHBhbnNpb24gY2hhbmdlcyB0byByZXZlYWwgb3IgaGlkZSBkZXRhaWxzXG5cdFx0aXRlbURpc3Bvc2FibGVzLmFkZChpdGVtLm9uRGlkQ2hhbmdlRXhwYW5zaW9uKCgpID0+IHtcblx0XHRcdG5vdGlmaWNhdGlvbkxpc3QudXBkYXRlTm90aWZpY2F0aW9uc0xpc3QoMCwgMSwgW2l0ZW1dKTtcblx0XHR9KSk7XG5cblx0XHQvLyBIYW5kbGUgY29udGVudCBjaGFuZ2VzXG5cdFx0Ly8gLSBhY3Rpb25zOiByZS1kcmF3IHRvIHByb3Blcmx5IHNob3cgdGhlbVxuXHRcdC8vIC0gbWVzc2FnZTogdXBkYXRlIG5vdGlmaWNhdGlvbiBoZWlnaHQgdW5sZXNzIGNvbGxhcHNlZFxuXHRcdGl0ZW1EaXNwb3NhYmxlcy5hZGQoaXRlbS5vbkRpZENoYW5nZUNvbnRlbnQoZSA9PiB7XG5cdFx0XHRzd2l0Y2ggKGUua2luZCkge1xuXHRcdFx0XHRjYXNlIE5vdGlmaWNhdGlvblZpZXdJdGVtQ29udGVudENoYW5nZUtpbmQuQUNUSU9OUzpcblx0XHRcdFx0XHRub3RpZmljYXRpb25MaXN0LnVwZGF0ZU5vdGlmaWNhdGlvbnNMaXN0KDAsIDEsIFtpdGVtXSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgTm90aWZpY2F0aW9uVmlld0l0ZW1Db250ZW50Q2hhbmdlS2luZC5NRVNTQUdFOlxuXHRcdFx0XHRcdGlmIChpdGVtLmV4cGFuZGVkKSB7XG5cdFx0XHRcdFx0XHRub3RpZmljYXRpb25MaXN0LnVwZGF0ZU5vdGlmaWNhdGlvbkhlaWdodChpdGVtKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVtb3ZlIHdoZW4gaXRlbSBnZXRzIGNsb3NlZFxuXHRcdEV2ZW50Lm9uY2UoaXRlbS5vbkRpZENsb3NlKSgoKSA9PiB7XG5cdFx0XHR0aGlzLnJlbW92ZVRvYXN0KGl0ZW0pO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQXV0b21hdGljYWxseSBwdXJnZSBub24tc3RpY2t5IG5vdGlmaWNhdGlvbnNcblx0XHR0aGlzLnB1cmdlTm90aWZpY2F0aW9uKGl0ZW0sIG5vdGlmaWNhdGlvblRvYXN0Q29udGFpbmVyLCBub3RpZmljYXRpb25MaXN0LCBpdGVtRGlzcG9zYWJsZXMpO1xuXG5cdFx0Ly8gVGhlbWluZ1xuXHRcdHRoaXMudXBkYXRlU3R5bGVzKCk7XG5cblx0XHQvLyBDb250ZXh0IEtleVxuXHRcdHRoaXMubm90aWZpY2F0aW9uc1RvYXN0c1Zpc2libGVDb250ZXh0S2V5LnNldCh0cnVlKTtcblxuXHRcdC8vIEFuaW1hdGUgaW5cblx0XHRub3RpZmljYXRpb25Ub2FzdC5jbGFzc0xpc3QuYWRkKCdub3RpZmljYXRpb24tZmFkZS1pbicpO1xuXHRcdGl0ZW1EaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG5vdGlmaWNhdGlvblRvYXN0LCAndHJhbnNpdGlvbmVuZCcsICgpID0+IHtcblx0XHRcdG5vdGlmaWNhdGlvblRvYXN0LmNsYXNzTGlzdC5yZW1vdmUoJ25vdGlmaWNhdGlvbi1mYWRlLWluJyk7XG5cdFx0XHRub3RpZmljYXRpb25Ub2FzdC5jbGFzc0xpc3QuYWRkKCdub3RpZmljYXRpb24tZmFkZS1pbi1kb25lJyk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTWFyayBhcyB2aXNpYmxlXG5cdFx0aXRlbS51cGRhdGVWaXNpYmlsaXR5KHRydWUpO1xuXG5cdFx0Ly8gRXZlbnRzXG5cdFx0aWYgKCF0aGlzLl9pc1Zpc2libGUpIHtcblx0XHRcdHRoaXMuX2lzVmlzaWJsZSA9IHRydWU7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVZpc2liaWxpdHkuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcHVyZ2VOb3RpZmljYXRpb24oaXRlbTogSU5vdGlmaWNhdGlvblZpZXdJdGVtLCBub3RpZmljYXRpb25Ub2FzdENvbnRhaW5lcjogSFRNTEVsZW1lbnQsIG5vdGlmaWNhdGlvbkxpc3Q6IE5vdGlmaWNhdGlvbnNMaXN0LCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogdm9pZCB7XG5cblx0XHQvLyBUcmFjayBtb3VzZSBvdmVyIGl0ZW1cblx0XHRsZXQgaXNNb3VzZU92ZXJUb2FzdCA9IGZhbHNlO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIobm90aWZpY2F0aW9uVG9hc3RDb250YWluZXIsIEV2ZW50VHlwZS5NT1VTRV9PVkVSLCAoKSA9PiBpc01vdXNlT3ZlclRvYXN0ID0gdHJ1ZSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIobm90aWZpY2F0aW9uVG9hc3RDb250YWluZXIsIEV2ZW50VHlwZS5NT1VTRV9PVVQsICgpID0+IGlzTW91c2VPdmVyVG9hc3QgPSBmYWxzZSkpO1xuXG5cdFx0Ly8gSW5zdGFsbCBUaW1lcnMgdG8gUHVyZ2UgTm90aWZpY2F0aW9uXG5cdFx0bGV0IHB1cmdlVGltZW91dEhhbmRsZTogVGltZW91dDtcblx0XHRsZXQgbGlzdGVuZXI6IElEaXNwb3NhYmxlO1xuXG5cdFx0Y29uc3QgaGlkZUFmdGVyVGltZW91dCA9ICgpID0+IHtcblxuXHRcdFx0cHVyZ2VUaW1lb3V0SGFuZGxlID0gc2V0VGltZW91dCgoKSA9PiB7XG5cblx0XHRcdFx0Ly8gSWYgdGhlIHdpbmRvdyBkb2VzIG5vdCBoYXZlIGZvY3VzLCB3ZSB3YWl0IGZvciB0aGUgd2luZG93IHRvIGdhaW4gZm9jdXNcblx0XHRcdFx0Ly8gYWdhaW4gYmVmb3JlIHRyaWdnZXJpbmcgdGhlIHRpbWVvdXQgYWdhaW4uIFRoaXMgcHJldmVudHMgYW4gaXNzdWUgd2hlcmVcblx0XHRcdFx0Ly8gZm9jdXNzaW5nIHRoZSB3aW5kb3cgY291bGQgaW1tZWRpYXRlbHkgaGlkZSB0aGUgbm90aWZpY2F0aW9uIGJlY2F1c2UgdGhlXG5cdFx0XHRcdC8vIHRpbWVvdXQgd2FzIHRyaWdnZXJlZCBhZ2Fpbi5cblx0XHRcdFx0aWYgKCF0aGlzLmhvc3RTZXJ2aWNlLmhhc0ZvY3VzKSB7XG5cdFx0XHRcdFx0aWYgKCFsaXN0ZW5lcikge1xuXHRcdFx0XHRcdFx0bGlzdGVuZXIgPSB0aGlzLmhvc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9jdXMoZm9jdXMgPT4ge1xuXHRcdFx0XHRcdFx0XHRpZiAoZm9jdXMpIHtcblx0XHRcdFx0XHRcdFx0XHRoaWRlQWZ0ZXJUaW1lb3V0KCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxpc3RlbmVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBPdGhlcndpc2UuLi5cblx0XHRcdFx0ZWxzZSBpZiAoXG5cdFx0XHRcdFx0aXRlbS5zdGlja3kgfHxcdFx0XHRcdFx0XHRcdFx0Ly8gbmV2ZXIgaGlkZSBzdGlja3kgbm90aWZpY2F0aW9uc1xuXHRcdFx0XHRcdG5vdGlmaWNhdGlvbkxpc3QuaGFzRm9jdXMoKSB8fFx0XHRcdFx0Ly8gbmV2ZXIgaGlkZSBub3RpZmljYXRpb25zIHdpdGggZm9jdXNcblx0XHRcdFx0XHRpc01vdXNlT3ZlclRvYXN0XHRcdFx0XHRcdFx0XHQvLyBuZXZlciBoaWRlIG5vdGlmaWNhdGlvbnMgdW5kZXIgbW91c2Vcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0aGlkZUFmdGVyVGltZW91dCgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMucmVtb3ZlVG9hc3QoaXRlbSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIE5vdGlmaWNhdGlvbnNUb2FzdHMuUFVSR0VfVElNRU9VVFtpdGVtLnNldmVyaXR5XSk7XG5cdFx0fTtcblxuXHRcdGhpZGVBZnRlclRpbWVvdXQoKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY2xlYXJUaW1lb3V0KHB1cmdlVGltZW91dEhhbmRsZSkpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlVG9hc3QoaXRlbTogSU5vdGlmaWNhdGlvblZpZXdJdGVtKTogdm9pZCB7XG5cdFx0bGV0IGZvY3VzRWRpdG9yID0gZmFsc2U7XG5cblx0XHR0aGlzLnBlbmRpbmdUb2FzdHMucmVtb3ZlKGl0ZW0pO1xuXG5cdFx0Ly8gVUlcblx0XHRjb25zdCBub3RpZmljYXRpb25Ub2FzdCA9IHRoaXMubWFwTm90aWZpY2F0aW9uVG9Ub2FzdC5nZXQoaXRlbSk7XG5cdFx0aWYgKG5vdGlmaWNhdGlvblRvYXN0KSB7XG5cdFx0XHRjb25zdCB0b2FzdEhhc0RPTUZvY3VzID0gaXNBbmNlc3Rvck9mQWN0aXZlRWxlbWVudChub3RpZmljYXRpb25Ub2FzdC5jb250YWluZXIpO1xuXHRcdFx0aWYgKHRvYXN0SGFzRE9NRm9jdXMpIHtcblx0XHRcdFx0Zm9jdXNFZGl0b3IgPSAhKHRoaXMuZm9jdXNOZXh0KCkgfHwgdGhpcy5mb2N1c1ByZXZpb3VzKCkpOyAvLyBmb2N1cyBuZXh0IGlmIGFueSwgb3RoZXJ3aXNlIGZvY3VzIGVkaXRvclxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLm1hcE5vdGlmaWNhdGlvblRvVG9hc3QuZGVsZXRlKGl0ZW0pO1xuXHRcdH1cblxuXHRcdC8vIERpc3Bvc2FibGVzXG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uRGlzcG9zYWJsZXMgPSB0aGlzLm1hcE5vdGlmaWNhdGlvblRvRGlzcG9zYWJsZS5nZXQoaXRlbSk7XG5cdFx0aWYgKG5vdGlmaWNhdGlvbkRpc3Bvc2FibGVzKSB7XG5cdFx0XHRkaXNwb3NlKG5vdGlmaWNhdGlvbkRpc3Bvc2FibGVzKTtcblxuXHRcdFx0dGhpcy5tYXBOb3RpZmljYXRpb25Ub0Rpc3Bvc2FibGUuZGVsZXRlKGl0ZW0pO1xuXHRcdH1cblxuXHRcdC8vIExheW91dCBpZiB3ZSBzdGlsbCBoYXZlIHRvYXN0c1xuXHRcdGlmICh0aGlzLm1hcE5vdGlmaWNhdGlvblRvVG9hc3Quc2l6ZSA+IDApIHtcblx0XHRcdHRoaXMubGF5b3V0KHRoaXMud29ya2JlbmNoRGltZW5zaW9ucyk7XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlIGhpZGUgaWYgbm8gbW9yZSB0b2FzdHMgdG8gc2hvd1xuXHRcdGVsc2Uge1xuXHRcdFx0dGhpcy5kb0hpZGUoKTtcblxuXHRcdFx0Ly8gTW92ZSBmb2N1cyBiYWNrIHRvIGVkaXRvciBncm91cCBhcyBuZWVkZWRcblx0XHRcdGlmIChmb2N1c0VkaXRvcikge1xuXHRcdFx0XHR0aGlzLmVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cC5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlVG9hc3RzKCk6IHZvaWQge1xuXG5cdFx0Ly8gUGVuZGluZ1xuXHRcdHRoaXMucGVuZGluZ1RvYXN0cy5jbGVhcigpO1xuXG5cdFx0Ly8gVG9hc3Rcblx0XHR0aGlzLm1hcE5vdGlmaWNhdGlvblRvVG9hc3QuY2xlYXIoKTtcblxuXHRcdC8vIERpc3Bvc2FibGVzXG5cdFx0dGhpcy5tYXBOb3RpZmljYXRpb25Ub0Rpc3Bvc2FibGUuZm9yRWFjaChkaXNwb3NhYmxlID0+IGRpc3Bvc2UoZGlzcG9zYWJsZSkpO1xuXHRcdHRoaXMubWFwTm90aWZpY2F0aW9uVG9EaXNwb3NhYmxlLmNsZWFyKCk7XG5cblx0XHR0aGlzLmRvSGlkZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0hpZGUoKTogdm9pZCB7XG5cdFx0dGhpcy5ub3RpZmljYXRpb25zVG9hc3RzQ29udGFpbmVyPy5jbGFzc0xpc3QucmVtb3ZlKCd2aXNpYmxlJyk7XG5cblx0XHQvLyBDb250ZXh0IEtleVxuXHRcdHRoaXMubm90aWZpY2F0aW9uc1RvYXN0c1Zpc2libGVDb250ZXh0S2V5LnNldChmYWxzZSk7XG5cblx0XHQvLyBFdmVudHNcblx0XHRpZiAodGhpcy5faXNWaXNpYmxlKSB7XG5cdFx0XHR0aGlzLl9pc1Zpc2libGUgPSBmYWxzZTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0aGlkZSgpOiB2b2lkIHtcblx0XHRjb25zdCBmb2N1c0VkaXRvciA9IHRoaXMubm90aWZpY2F0aW9uc1RvYXN0c0NvbnRhaW5lciA/IGlzQW5jZXN0b3JPZkFjdGl2ZUVsZW1lbnQodGhpcy5ub3RpZmljYXRpb25zVG9hc3RzQ29udGFpbmVyKSA6IGZhbHNlO1xuXG5cdFx0dGhpcy5yZW1vdmVUb2FzdHMoKTtcblxuXHRcdGlmIChmb2N1c0VkaXRvcikge1xuXHRcdFx0dGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuYWN0aXZlR3JvdXAuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRmb2N1cygpOiBib29sZWFuIHtcblx0XHRjb25zdCB0b2FzdHMgPSB0aGlzLmdldFRvYXN0cyhUb2FzdFZpc2liaWxpdHkuVklTSUJMRSk7XG5cdFx0aWYgKHRvYXN0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0b2FzdHNbMF0ubGlzdC5mb2N1c0ZpcnN0KCk7XG5cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGZvY3VzTmV4dCgpOiBib29sZWFuIHtcblx0XHRjb25zdCB0b2FzdHMgPSB0aGlzLmdldFRvYXN0cyhUb2FzdFZpc2liaWxpdHkuVklTSUJMRSk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0b2FzdHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHRvYXN0ID0gdG9hc3RzW2ldO1xuXHRcdFx0aWYgKHRvYXN0Lmxpc3QuaGFzRm9jdXMoKSkge1xuXHRcdFx0XHRjb25zdCBuZXh0VG9hc3QgPSB0b2FzdHNbaSArIDFdO1xuXHRcdFx0XHRpZiAobmV4dFRvYXN0KSB7XG5cdFx0XHRcdFx0bmV4dFRvYXN0Lmxpc3QuZm9jdXNGaXJzdCgpO1xuXG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRmb2N1c1ByZXZpb3VzKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHRvYXN0cyA9IHRoaXMuZ2V0VG9hc3RzKFRvYXN0VmlzaWJpbGl0eS5WSVNJQkxFKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRvYXN0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgdG9hc3QgPSB0b2FzdHNbaV07XG5cdFx0XHRpZiAodG9hc3QubGlzdC5oYXNGb2N1cygpKSB7XG5cdFx0XHRcdGNvbnN0IHByZXZpb3VzVG9hc3QgPSB0b2FzdHNbaSAtIDFdO1xuXHRcdFx0XHRpZiAocHJldmlvdXNUb2FzdCkge1xuXHRcdFx0XHRcdHByZXZpb3VzVG9hc3QubGlzdC5mb2N1c0ZpcnN0KCk7XG5cblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGZvY3VzRmlyc3QoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgdG9hc3QgPSB0aGlzLmdldFRvYXN0cyhUb2FzdFZpc2liaWxpdHkuVklTSUJMRSlbMF07XG5cdFx0aWYgKHRvYXN0KSB7XG5cdFx0XHR0b2FzdC5saXN0LmZvY3VzRmlyc3QoKTtcblxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Zm9jdXNMYXN0KCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHRvYXN0cyA9IHRoaXMuZ2V0VG9hc3RzKFRvYXN0VmlzaWJpbGl0eS5WSVNJQkxFKTtcblx0XHRpZiAodG9hc3RzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRvYXN0c1t0b2FzdHMubGVuZ3RoIC0gMV0ubGlzdC5mb2N1c0ZpcnN0KCk7XG5cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHVwZGF0ZShpc0NlbnRlclZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5pc05vdGlmaWNhdGlvbnNDZW50ZXJWaXNpYmxlICE9PSBpc0NlbnRlclZpc2libGUpIHtcblx0XHRcdHRoaXMuaXNOb3RpZmljYXRpb25zQ2VudGVyVmlzaWJsZSA9IGlzQ2VudGVyVmlzaWJsZTtcblxuXHRcdFx0Ly8gSGlkZSBhbGwgdG9hc3RzIHdoZW4gdGhlIG5vdGlmaWNhdGlvbmNlbnRlciBnZXRzIHZpc2libGVcblx0XHRcdGlmICh0aGlzLmlzTm90aWZpY2F0aW9uc0NlbnRlclZpc2libGUpIHtcblx0XHRcdFx0dGhpcy5yZW1vdmVUb2FzdHMoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVTdHlsZXMoKTogdm9pZCB7XG5cdFx0dGhpcy5tYXBOb3RpZmljYXRpb25Ub1RvYXN0LmZvckVhY2goKHsgdG9hc3QgfSkgPT4ge1xuXHRcdFx0Y29uc3QgYmFja2dyb3VuZENvbG9yID0gdGhpcy5nZXRDb2xvcihOT1RJRklDQVRJT05TX0JBQ0tHUk9VTkQpO1xuXHRcdFx0dG9hc3Quc3R5bGUuYmFja2dyb3VuZCA9IGJhY2tncm91bmRDb2xvciA/IGJhY2tncm91bmRDb2xvciA6ICcnO1xuXG5cdFx0XHRjb25zdCBib3JkZXJDb2xvciA9IHRoaXMuZ2V0Q29sb3IoTk9USUZJQ0FUSU9OU19UT0FTVF9CT1JERVIpO1xuXHRcdFx0dG9hc3Quc3R5bGUuYm9yZGVyID0gYm9yZGVyQ29sb3IgPyBgMXB4IHNvbGlkICR7Ym9yZGVyQ29sb3J9YCA6ICcnO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRUb2FzdHMoc3RhdGU6IFRvYXN0VmlzaWJpbGl0eSk6IElOb3RpZmljYXRpb25Ub2FzdFtdIHtcblx0XHRjb25zdCBub3RpZmljYXRpb25Ub2FzdHM6IElOb3RpZmljYXRpb25Ub2FzdFtdID0gW107XG5cblx0XHR0aGlzLm1hcE5vdGlmaWNhdGlvblRvVG9hc3QuZm9yRWFjaCh0b2FzdCA9PiB7XG5cdFx0XHRzd2l0Y2ggKHN0YXRlKSB7XG5cdFx0XHRcdGNhc2UgVG9hc3RWaXNpYmlsaXR5LkhJRERFTl9PUl9WSVNJQkxFOlxuXHRcdFx0XHRcdG5vdGlmaWNhdGlvblRvYXN0cy5wdXNoKHRvYXN0KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBUb2FzdFZpc2liaWxpdHkuSElEREVOOlxuXHRcdFx0XHRcdGlmICghdGhpcy5pc1RvYXN0SW5ET00odG9hc3QpKSB7XG5cdFx0XHRcdFx0XHRub3RpZmljYXRpb25Ub2FzdHMucHVzaCh0b2FzdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFRvYXN0VmlzaWJpbGl0eS5WSVNJQkxFOlxuXHRcdFx0XHRcdGlmICh0aGlzLmlzVG9hc3RJbkRPTSh0b2FzdCkpIHtcblx0XHRcdFx0XHRcdG5vdGlmaWNhdGlvblRvYXN0cy5wdXNoKHRvYXN0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gbm90aWZpY2F0aW9uVG9hc3RzLnJldmVyc2UoKTsgLy8gZnJvbSBuZXdlc3QgdG8gb2xkZXN0XG5cdH1cblxuXHRsYXlvdXQoZGltZW5zaW9uOiBEaW1lbnNpb24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLndvcmtiZW5jaERpbWVuc2lvbnMgPSBkaW1lbnNpb247XG5cblx0XHRjb25zdCBtYXhEaW1lbnNpb25zID0gdGhpcy5jb21wdXRlTWF4RGltZW5zaW9ucygpO1xuXG5cdFx0Ly8gVXBkYXRlIHBvc2l0aW9uIG9mZnNldFxuXHRcdHRoaXMudXBkYXRlVG9wT2Zmc2V0KCk7XG5cblx0XHQvLyBIaWRlIHRvYXN0cyB0aGF0IGV4Y2VlZCBoZWlnaHRcblx0XHRpZiAobWF4RGltZW5zaW9ucy5oZWlnaHQpIHtcblx0XHRcdHRoaXMubGF5b3V0Q29udGFpbmVyKG1heERpbWVuc2lvbnMuaGVpZ2h0KTtcblx0XHR9XG5cblx0XHQvLyBMYXlvdXQgYWxsIGxpc3RzIG9mIHRvYXN0c1xuXHRcdHRoaXMubGF5b3V0TGlzdHMobWF4RGltZW5zaW9ucy53aWR0aCk7XG5cdH1cblxuXHRwcml2YXRlIGNvbXB1dGVNYXhEaW1lbnNpb25zKCk6IERpbWVuc2lvbiB7XG5cdFx0Y29uc3QgbWF4V2lkdGggPSBOb3RpZmljYXRpb25zVG9hc3RzLk1BWF9XSURUSDtcblxuXHRcdGxldCBhdmFpbGFibGVXaWR0aCA9IG1heFdpZHRoO1xuXHRcdGxldCBhdmFpbGFibGVIZWlnaHQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRcdGlmICh0aGlzLndvcmtiZW5jaERpbWVuc2lvbnMpIHtcblxuXHRcdFx0Ly8gTWFrZSBzdXJlIG5vdGlmaWNhdGlvbnMgYXJlIG5vdCBleGNlZGluZyBhdmFpbGFibGUgd2lkdGhcblx0XHRcdGF2YWlsYWJsZVdpZHRoID0gdGhpcy53b3JrYmVuY2hEaW1lbnNpb25zLndpZHRoO1xuXHRcdFx0YXZhaWxhYmxlV2lkdGggLT0gKDIgKiA4KTsgLy8gYWRqdXN0IGZvciBwYWRkaW5ncyBsZWZ0IGFuZCByaWdodFxuXG5cdFx0XHQvLyBNYWtlIHN1cmUgbm90aWZpY2F0aW9ucyBhcmUgbm90IGV4Y2VlZGluZyBhdmFpbGFibGUgaGVpZ2h0XG5cdFx0XHRhdmFpbGFibGVIZWlnaHQgPSB0aGlzLndvcmtiZW5jaERpbWVuc2lvbnMuaGVpZ2h0O1xuXHRcdFx0aWYgKHRoaXMubGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuU1RBVFVTQkFSX1BBUlQsIG1haW5XaW5kb3cpKSB7XG5cdFx0XHRcdGF2YWlsYWJsZUhlaWdodCAtPSAyMjsgLy8gYWRqdXN0IGZvciBzdGF0dXMgYmFyXG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLmxheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLlRJVExFQkFSX1BBUlQsIG1haW5XaW5kb3cpKSB7XG5cdFx0XHRcdGF2YWlsYWJsZUhlaWdodCAtPSAyMjsgLy8gYWRqdXN0IGZvciB0aXRsZSBiYXJcblx0XHRcdH1cblxuXHRcdFx0YXZhaWxhYmxlSGVpZ2h0IC09ICgyICogMTIpOyAvLyBhZGp1c3QgZm9yIHBhZGRpbmdzIHRvcCBhbmQgYm90dG9tXG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBEaW1lbnNpb24oTWF0aC5taW4obWF4V2lkdGgsIGF2YWlsYWJsZVdpZHRoKSwgYXZhaWxhYmxlSGVpZ2h0ID8/IDApO1xuXHR9XG5cblx0cHJpdmF0ZSBsYXlvdXRMaXN0cyh3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5tYXBOb3RpZmljYXRpb25Ub1RvYXN0LmZvckVhY2goKHsgbGlzdCB9KSA9PiBsaXN0LmxheW91dCh3aWR0aCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBsYXlvdXRDb250YWluZXIoaGVpZ2h0VG9HaXZlOiBudW1iZXIpOiB2b2lkIHtcblxuXHRcdC8vIEFsbG93IHRoZSBmdWxsIGhlaWdodCBmb3IgMSB0b2FzdCBidXQgYWRqdXN0IGZvciBtdWx0aXBsZSB0b2FzdHNcblx0XHQvLyBzbyB0aGF0IGEgc3RhY2sgb2Ygbm90aWZpY2F0aW9ucyBkb2VzIG5vdCBleGNlZWQgYWxsIHRoZSB3YXkgdXBcblxuXHRcdGxldCBzaW5nbGVUb2FzdEhlaWdodFRvR2l2ZSA9IGhlaWdodFRvR2l2ZTtcblx0XHRsZXQgbXVsdGlwbGVUb2FzdHNIZWlnaHRUb0dpdmUgPSBNYXRoLnJvdW5kKGhlaWdodFRvR2l2ZSAqIDAuNjE4KTtcblxuXHRcdGxldCB2aXNpYmxlVG9hc3RzID0gMDtcblx0XHRmb3IgKGNvbnN0IHRvYXN0IG9mIHRoaXMuZ2V0VG9hc3RzKFRvYXN0VmlzaWJpbGl0eS5ISURERU5fT1JfVklTSUJMRSkpIHtcblxuXHRcdFx0Ly8gSW4gb3JkZXIgdG8gbWVhc3VyZSB0aGUgY2xpZW50IGhlaWdodCwgdGhlIGVsZW1lbnQgY2Fubm90IGhhdmUgZGlzcGxheTogbm9uZVxuXHRcdFx0dG9hc3QuY29udGFpbmVyLnN0eWxlLm9wYWNpdHkgPSAnMCc7XG5cdFx0XHR0aGlzLnVwZGF0ZVRvYXN0VmlzaWJpbGl0eSh0b2FzdCwgdHJ1ZSk7XG5cblx0XHRcdHNpbmdsZVRvYXN0SGVpZ2h0VG9HaXZlIC09IHRvYXN0LmNvbnRhaW5lci5vZmZzZXRIZWlnaHQ7XG5cdFx0XHRtdWx0aXBsZVRvYXN0c0hlaWdodFRvR2l2ZSAtPSB0b2FzdC5jb250YWluZXIub2Zmc2V0SGVpZ2h0O1xuXG5cdFx0XHRsZXQgbWFrZVZpc2libGUgPSBmYWxzZTtcblx0XHRcdGlmICh2aXNpYmxlVG9hc3RzID09PSBOb3RpZmljYXRpb25zVG9hc3RzLk1BWF9OT1RJRklDQVRJT05TKSB7XG5cdFx0XHRcdG1ha2VWaXNpYmxlID0gZmFsc2U7IC8vIG5ldmVyIHNob3cgbW9yZSB0aGFuIE1BWF9OT1RJRklDQVRJT05TXG5cdFx0XHR9IGVsc2UgaWYgKCh2aXNpYmxlVG9hc3RzID09PSAwICYmIHNpbmdsZVRvYXN0SGVpZ2h0VG9HaXZlID49IDApIHx8ICh2aXNpYmxlVG9hc3RzID4gMCAmJiBtdWx0aXBsZVRvYXN0c0hlaWdodFRvR2l2ZSA+PSAwKSkge1xuXHRcdFx0XHRtYWtlVmlzaWJsZSA9IHRydWU7IC8vIGhpZGUgdG9hc3QgaWYgYXZhaWxhYmxlIGhlaWdodCBpcyB0b28gbGl0dGxlXG5cdFx0XHR9XG5cblx0XHRcdC8vIEhpZGUgb3Igc2hvdyB0b2FzdCBiYXNlZCBvbiBjb250ZXh0XG5cdFx0XHR0aGlzLnVwZGF0ZVRvYXN0VmlzaWJpbGl0eSh0b2FzdCwgbWFrZVZpc2libGUpO1xuXHRcdFx0dG9hc3QuY29udGFpbmVyLnN0eWxlLm9wYWNpdHkgPSAnJztcblxuXHRcdFx0aWYgKG1ha2VWaXNpYmxlKSB7XG5cdFx0XHRcdHZpc2libGVUb2FzdHMrKztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVRvYXN0VmlzaWJpbGl0eSh0b2FzdDogSU5vdGlmaWNhdGlvblRvYXN0LCB2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNUb2FzdEluRE9NKHRvYXN0KSA9PT0gdmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSB2aXNpYmlsaXR5IGluIERPTVxuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbnNUb2FzdHNDb250YWluZXIgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLm5vdGlmaWNhdGlvbnNUb2FzdHNDb250YWluZXIpO1xuXHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHRub3RpZmljYXRpb25zVG9hc3RzQ29udGFpbmVyLmFwcGVuZENoaWxkKHRvYXN0LmNvbnRhaW5lcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRvYXN0LmNvbnRhaW5lci5yZW1vdmUoKTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgdmlzaWJpbGl0eSBpbiBtb2RlbFxuXHRcdHRvYXN0Lml0ZW0udXBkYXRlVmlzaWJpbGl0eSh2aXNpYmxlKTtcblx0fVxuXG5cdHByaXZhdGUgaXNUb2FzdEluRE9NKHRvYXN0OiBJTm90aWZpY2F0aW9uVG9hc3QpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0b2FzdC5jb250YWluZXIucGFyZW50RWxlbWVudDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxnQkFBZ0I7QUFDekIsU0FBOEIsd0JBQXlFLHVDQUF1Qyx1QkFBdUIsdUJBQXVCLGdDQUFnQztBQUM1TixTQUFzQixTQUFTLG9CQUFxQztBQUNwRSxTQUFTLHVCQUF1QixXQUFXLFdBQVcsOEJBQThCLDJCQUEyQixXQUFXLEdBQUcsZUFBZSxtQkFBbUIsa0JBQWtCLHdCQUF3QixxQkFBcUI7QUFDOU4sU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxPQUFPLGVBQWU7QUFDL0IsU0FBUyx5QkFBeUIsYUFBYTtBQUMvQyxTQUFTLDRCQUE0QixnQ0FBZ0M7QUFDckUsU0FBUyxlQUFlLGdCQUFnQjtBQUN4QyxTQUFTLDRCQUE0QjtBQUVyQyxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyxVQUFVLHFCQUFxQixzQkFBc0IsMEJBQTBCO0FBQ3hGLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsbUJBQW1CLHNCQUFzQjtBQUNsRCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDRC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
