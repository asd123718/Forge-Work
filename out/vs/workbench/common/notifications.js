import { NoOpNotification, Severity, NotificationsFilter, NotificationPriority, isNotificationSource } from "../../platform/notification/common/notification.js";
import { toErrorMessage, isErrorWithActions } from "../../base/common/errorMessage.js";
import { Event, Emitter } from "../../base/common/event.js";
import { Disposable } from "../../base/common/lifecycle.js";
import { isCancellationError } from "../../base/common/errors.js";
import { Action } from "../../base/common/actions.js";
import { equals } from "../../base/common/arrays.js";
import { parseLinkedText } from "../../base/common/linkedText.js";
import { mapsStrictEqualIgnoreOrder } from "../../base/common/map.js";
var NotificationChangeType = /* @__PURE__ */ ((NotificationChangeType2) => {
  NotificationChangeType2[NotificationChangeType2["ADD"] = 0] = "ADD";
  NotificationChangeType2[NotificationChangeType2["CHANGE"] = 1] = "CHANGE";
  NotificationChangeType2[NotificationChangeType2["EXPAND_COLLAPSE"] = 2] = "EXPAND_COLLAPSE";
  NotificationChangeType2[NotificationChangeType2["REMOVE"] = 3] = "REMOVE";
  return NotificationChangeType2;
})(NotificationChangeType || {});
var StatusMessageChangeType = /* @__PURE__ */ ((StatusMessageChangeType2) => {
  StatusMessageChangeType2[StatusMessageChangeType2["ADD"] = 0] = "ADD";
  StatusMessageChangeType2[StatusMessageChangeType2["REMOVE"] = 1] = "REMOVE";
  return StatusMessageChangeType2;
})(StatusMessageChangeType || {});
class NotificationHandle extends Disposable {
  constructor(item, onClose) {
    super();
    this.item = item;
    this.onClose = onClose;
    this._onDidClose = this._register(new Emitter());
    this.onDidClose = this._onDidClose.event;
    this._onDidChangeVisibility = this._register(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.item.onDidChangeVisibility((visible) => this._onDidChangeVisibility.fire(visible)));
    Event.once(this.item.onDidClose)(() => {
      this._onDidClose.fire();
      this.dispose();
    });
  }
  get progress() {
    return this.item.progress;
  }
  updateSeverity(severity) {
    this.item.updateSeverity(severity);
  }
  updateMessage(message) {
    this.item.updateMessage(message);
  }
  updateActions(actions) {
    this.item.updateActions(actions);
  }
  close() {
    this.onClose(this.item);
    this.dispose();
  }
}
const _NotificationsModel = class _NotificationsModel extends Disposable {
  constructor() {
    super(...arguments);
    this._onDidChangeNotification = this._register(new Emitter());
    this.onDidChangeNotification = this._onDidChangeNotification.event;
    this._onDidChangeStatusMessage = this._register(new Emitter());
    this.onDidChangeStatusMessage = this._onDidChangeStatusMessage.event;
    this._onDidChangeFilter = this._register(new Emitter());
    this.onDidChangeFilter = this._onDidChangeFilter.event;
    this._notifications = [];
    this.filter = {
      global: NotificationsFilter.OFF,
      sources: /* @__PURE__ */ new Map()
    };
  }
  get notifications() {
    return this._notifications;
  }
  get statusMessage() {
    return this._statusMessage;
  }
  setFilter(filter) {
    let globalChanged = false;
    if (typeof filter.global === "number") {
      globalChanged = this.filter.global !== filter.global;
      this.filter.global = filter.global;
    }
    let sourcesChanged = false;
    if (filter.sources) {
      sourcesChanged = !mapsStrictEqualIgnoreOrder(this.filter.sources, filter.sources);
      this.filter.sources = filter.sources;
    }
    if (globalChanged || sourcesChanged) {
      this._onDidChangeFilter.fire({
        global: globalChanged ? filter.global : void 0,
        sources: sourcesChanged ? filter.sources : void 0
      });
    }
  }
  addNotification(notification) {
    const item = this.createViewItem(notification);
    if (!item) {
      return _NotificationsModel.NO_OP_NOTIFICATION;
    }
    const duplicate = this.findNotification(item);
    duplicate?.close();
    this._notifications.splice(0, 0, item);
    this._onDidChangeNotification.fire({ item, index: 0, kind: 0 /* ADD */ });
    return new NotificationHandle(item, (item2) => this.onClose(item2));
  }
  onClose(item) {
    const liveItem = this.findNotification(item);
    if (liveItem && liveItem !== item) {
      liveItem.close();
    } else {
      item.close();
    }
  }
  findNotification(item) {
    return this._notifications.find((notification) => notification.equals(item));
  }
  createViewItem(notification) {
    const item = NotificationViewItem.create(notification, this.filter);
    if (!item) {
      return void 0;
    }
    const fireNotificationChangeEvent = (kind, detail) => {
      const index = this._notifications.indexOf(item);
      if (index >= 0) {
        this._onDidChangeNotification.fire({ item, index, kind, detail });
      }
    };
    const itemExpansionChangeListener = item.onDidChangeExpansion(() => fireNotificationChangeEvent(2 /* EXPAND_COLLAPSE */));
    const itemContentChangeListener = item.onDidChangeContent((e) => fireNotificationChangeEvent(1 /* CHANGE */, e.kind));
    Event.once(item.onDidClose)(() => {
      itemExpansionChangeListener.dispose();
      itemContentChangeListener.dispose();
      const index = this._notifications.indexOf(item);
      if (index >= 0) {
        this._notifications.splice(index, 1);
        this._onDidChangeNotification.fire({ item, index, kind: 3 /* REMOVE */ });
      }
    });
    return item;
  }
  showStatusMessage(message, options) {
    const item = StatusMessageViewItem.create(message, options);
    if (!item) {
      return { close: () => {
      } };
    }
    this._statusMessage = item;
    this._onDidChangeStatusMessage.fire({ kind: 0 /* ADD */, item });
    return {
      close: () => {
        if (this._statusMessage === item) {
          this._statusMessage = void 0;
          this._onDidChangeStatusMessage.fire({ kind: 1 /* REMOVE */, item });
        }
      }
    };
  }
};
_NotificationsModel.NO_OP_NOTIFICATION = new NoOpNotification();
let NotificationsModel = _NotificationsModel;
function isNotificationViewItem(obj) {
  return obj instanceof NotificationViewItem;
}
var NotificationViewItemContentChangeKind = /* @__PURE__ */ ((NotificationViewItemContentChangeKind2) => {
  NotificationViewItemContentChangeKind2[NotificationViewItemContentChangeKind2["SEVERITY"] = 0] = "SEVERITY";
  NotificationViewItemContentChangeKind2[NotificationViewItemContentChangeKind2["MESSAGE"] = 1] = "MESSAGE";
  NotificationViewItemContentChangeKind2[NotificationViewItemContentChangeKind2["ACTIONS"] = 2] = "ACTIONS";
  NotificationViewItemContentChangeKind2[NotificationViewItemContentChangeKind2["PROGRESS"] = 3] = "PROGRESS";
  return NotificationViewItemContentChangeKind2;
})(NotificationViewItemContentChangeKind || {});
class NotificationViewItemProgress extends Disposable {
  constructor() {
    super();
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._state = /* @__PURE__ */ Object.create(null);
  }
  get state() {
    return this._state;
  }
  infinite() {
    if (this._state.infinite) {
      return;
    }
    this._state.infinite = true;
    this._state.total = void 0;
    this._state.worked = void 0;
    this._state.done = void 0;
    this._onDidChange.fire();
  }
  done() {
    if (this._state.done) {
      return;
    }
    this._state.done = true;
    this._state.infinite = void 0;
    this._state.total = void 0;
    this._state.worked = void 0;
    this._onDidChange.fire();
  }
  total(value) {
    if (this._state.total === value) {
      return;
    }
    this._state.total = value;
    this._state.infinite = void 0;
    this._state.done = void 0;
    this._onDidChange.fire();
  }
  worked(value) {
    if (typeof this._state.worked === "number") {
      this._state.worked += value;
    } else {
      this._state.worked = value;
    }
    this._state.infinite = void 0;
    this._state.done = void 0;
    this._onDidChange.fire();
  }
}
const _NotificationViewItem = class _NotificationViewItem extends Disposable {
  constructor(id, _severity, _sticky, _priority, _message, _source, progress, actions) {
    super();
    this.id = id;
    this._severity = _severity;
    this._sticky = _sticky;
    this._priority = _priority;
    this._message = _message;
    this._source = _source;
    this._visible = false;
    this._onDidChangeExpansion = this._register(new Emitter());
    this.onDidChangeExpansion = this._onDidChangeExpansion.event;
    this._onDidClose = this._register(new Emitter());
    this.onDidClose = this._onDidClose.event;
    this._onDidChangeContent = this._register(new Emitter());
    this.onDidChangeContent = this._onDidChangeContent.event;
    this._onDidChangeVisibility = this._register(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    if (progress) {
      this.setProgress(progress);
    }
    this.setActions(actions);
  }
  static create(notification, filter) {
    if (!notification?.message || isCancellationError(notification.message)) {
      return void 0;
    }
    let severity;
    if (typeof notification.severity === "number") {
      severity = notification.severity;
    } else {
      severity = Severity.Info;
    }
    const message = _NotificationViewItem.parseNotificationMessage(notification.message);
    if (!message) {
      return void 0;
    }
    let actions;
    if (notification.actions) {
      actions = notification.actions;
    } else if (isErrorWithActions(notification.message)) {
      actions = { primary: notification.message.actions };
    }
    let priority = notification.priority ?? NotificationPriority.DEFAULT;
    if ((priority === NotificationPriority.DEFAULT || priority === NotificationPriority.OPTIONAL) && severity !== Severity.Error) {
      if (filter.global === NotificationsFilter.ERROR) {
        priority = NotificationPriority.SILENT;
      } else if (isNotificationSource(notification.source) && filter.sources.get(notification.source.id) === NotificationsFilter.ERROR) {
        priority = NotificationPriority.SILENT;
      }
    }
    return new _NotificationViewItem(notification.id, severity, notification.sticky, priority, message, notification.source, notification.progress, actions);
  }
  static parseNotificationMessage(input) {
    let message;
    if (input instanceof Error) {
      message = toErrorMessage(input, false);
    } else if (typeof input === "string") {
      message = input;
    }
    if (!message) {
      return void 0;
    }
    const raw = message;
    if (message.length > _NotificationViewItem.MAX_MESSAGE_LENGTH) {
      message = `${message.substr(0, _NotificationViewItem.MAX_MESSAGE_LENGTH)}...`;
    }
    message = message.replace(/(\r\n|\n|\r)/gm, " ").trim();
    const linkedText = parseLinkedText(message);
    return { raw, linkedText, original: input };
  }
  setProgress(progress) {
    if (progress.infinite) {
      this.progress.infinite();
    } else if (progress.total) {
      this.progress.total(progress.total);
      if (progress.worked) {
        this.progress.worked(progress.worked);
      }
    }
  }
  setActions(actions = { primary: [], secondary: [] }) {
    this._actions = {
      primary: Array.isArray(actions.primary) ? actions.primary : [],
      secondary: Array.isArray(actions.secondary) ? actions.secondary : []
    };
    this._expanded = actions.primary && actions.primary.length > 0;
  }
  get canCollapse() {
    return !this.hasActions;
  }
  get expanded() {
    return !!this._expanded;
  }
  get severity() {
    return this._severity;
  }
  get sticky() {
    if (this._sticky) {
      return true;
    }
    const hasActions = this.hasActions;
    if (hasActions && this._severity === Severity.Error || // notification errors with actions are sticky
    !hasActions && this._expanded || // notifications that got expanded are sticky
    this._progress && !this._progress.state.done) {
      return true;
    }
    return false;
  }
  get priority() {
    return this._priority;
  }
  get hasActions() {
    if (!this._actions) {
      return false;
    }
    if (!this._actions.primary) {
      return false;
    }
    return this._actions.primary.length > 0;
  }
  get hasProgress() {
    return !!this._progress;
  }
  get progress() {
    if (!this._progress) {
      this._progress = this._register(new NotificationViewItemProgress());
      this._register(this._progress.onDidChange(() => this._onDidChangeContent.fire({ kind: 3 /* PROGRESS */ })));
    }
    return this._progress;
  }
  get message() {
    return this._message;
  }
  get source() {
    return typeof this._source === "string" ? this._source : this._source ? this._source.label : void 0;
  }
  get sourceId() {
    return this._source && typeof this._source !== "string" && "id" in this._source ? this._source.id : void 0;
  }
  get actions() {
    return this._actions;
  }
  get visible() {
    return this._visible;
  }
  updateSeverity(severity) {
    if (severity === this._severity) {
      return;
    }
    this._severity = severity;
    this._onDidChangeContent.fire({ kind: 0 /* SEVERITY */ });
  }
  updateMessage(input) {
    const message = _NotificationViewItem.parseNotificationMessage(input);
    if (!message || message.raw === this._message.raw) {
      return;
    }
    this._message = message;
    this._onDidChangeContent.fire({ kind: 1 /* MESSAGE */ });
  }
  updateActions(actions) {
    this.setActions(actions);
    this._onDidChangeContent.fire({ kind: 2 /* ACTIONS */ });
  }
  updateVisibility(visible) {
    if (this._visible !== visible) {
      this._visible = visible;
      this._onDidChangeVisibility.fire(visible);
    }
  }
  expand() {
    if (this._expanded || !this.canCollapse) {
      return;
    }
    this._expanded = true;
    this._onDidChangeExpansion.fire();
  }
  collapse(skipEvents) {
    if (!this._expanded || !this.canCollapse) {
      return;
    }
    this._expanded = false;
    if (!skipEvents) {
      this._onDidChangeExpansion.fire();
    }
  }
  toggle() {
    if (this._expanded) {
      this.collapse();
    } else {
      this.expand();
    }
  }
  close() {
    this._onDidClose.fire();
    this.dispose();
  }
  equals(other) {
    if (this.hasProgress || other.hasProgress) {
      return false;
    }
    if (typeof this.id === "string" || typeof other.id === "string") {
      return this.id === other.id;
    }
    if (typeof this._source === "object") {
      if (this._source.label !== other.source || this._source.id !== other.sourceId) {
        return false;
      }
    } else if (this._source !== other.source) {
      return false;
    }
    if (this._message.raw !== other.message.raw) {
      return false;
    }
    const primaryActions = this._actions?.primary || [];
    const otherPrimaryActions = other.actions?.primary || [];
    return equals(primaryActions, otherPrimaryActions, (action, otherAction) => action.id + action.label === otherAction.id + otherAction.label);
  }
};
_NotificationViewItem.MAX_MESSAGE_LENGTH = 1e3;
let NotificationViewItem = _NotificationViewItem;
class ChoiceAction extends Action {
  constructor(id, choice) {
    super(id, choice.label, void 0, true, async () => {
      choice.run();
      this._onDidRun.fire();
    });
    this._onDidRun = this._register(new Emitter());
    this.onDidRun = this._onDidRun.event;
    this._keepOpen = !!choice.keepOpen;
    this._menu = !choice.isSecondary && choice.menu ? choice.menu.map((c, index) => new ChoiceAction(`${id}.${index}`, c)) : void 0;
  }
  get menu() {
    return this._menu;
  }
  get keepOpen() {
    return this._keepOpen;
  }
}
class StatusMessageViewItem {
  static create(notification, options) {
    if (!notification || isCancellationError(notification)) {
      return void 0;
    }
    let message;
    if (notification instanceof Error) {
      message = toErrorMessage(notification, false);
    } else if (typeof notification === "string") {
      message = notification;
    }
    if (!message) {
      return void 0;
    }
    return { message, options };
  }
}
var NotificationsSettings = /* @__PURE__ */ ((NotificationsSettings2) => {
  NotificationsSettings2["NOTIFICATIONS_POSITION"] = "workbench.notifications.position";
  NotificationsSettings2["NOTIFICATIONS_BUTTON"] = "workbench.notifications.showInTitleBar";
  return NotificationsSettings2;
})(NotificationsSettings || {});
var NotificationsPosition = /* @__PURE__ */ ((NotificationsPosition2) => {
  NotificationsPosition2["BOTTOM_RIGHT"] = "bottom-right";
  NotificationsPosition2["BOTTOM_LEFT"] = "bottom-left";
  NotificationsPosition2["TOP_RIGHT"] = "top-right";
  return NotificationsPosition2;
})(NotificationsPosition || {});
function getNotificationsPosition(configurationService) {
  const position = configurationService.getValue("workbench.notifications.position" /* NOTIFICATIONS_POSITION */);
  if (position === "bottom-left" /* BOTTOM_LEFT */ || position === "top-right" /* TOP_RIGHT */) {
    return position;
  }
  return "bottom-right" /* BOTTOM_RIGHT */;
}
export {
  ChoiceAction,
  NotificationChangeType,
  NotificationHandle,
  NotificationViewItem,
  NotificationViewItemContentChangeKind,
  NotificationViewItemProgress,
  NotificationsModel,
  NotificationsPosition,
  NotificationsSettings,
  StatusMessageChangeType,
  getNotificationsPosition,
  isNotificationViewItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbW1vblxcbm90aWZpY2F0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElOb3RpZmljYXRpb24sIElOb3RpZmljYXRpb25IYW5kbGUsIElOb3RpZmljYXRpb25BY3Rpb25zLCBJTm90aWZpY2F0aW9uUHJvZ3Jlc3MsIE5vT3BOb3RpZmljYXRpb24sIFNldmVyaXR5LCBOb3RpZmljYXRpb25NZXNzYWdlLCBJUHJvbXB0Q2hvaWNlLCBJU3RhdHVzTWVzc2FnZU9wdGlvbnMsIE5vdGlmaWNhdGlvbnNGaWx0ZXIsIElOb3RpZmljYXRpb25Qcm9ncmVzc1Byb3BlcnRpZXMsIElQcm9tcHRDaG9pY2VXaXRoTWVudSwgTm90aWZpY2F0aW9uUHJpb3JpdHksIElOb3RpZmljYXRpb25Tb3VyY2UsIGlzTm90aWZpY2F0aW9uU291cmNlLCBJU3RhdHVzSGFuZGxlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UsIGlzRXJyb3JXaXRoQWN0aW9ucyB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24gfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBwYXJzZUxpbmtlZFRleHQsIExpbmtlZFRleHQgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9saW5rZWRUZXh0LmpzJztcbmltcG9ydCB7IG1hcHNTdHJpY3RFcXVhbElnbm9yZU9yZGVyIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElOb3RpZmljYXRpb25zTW9kZWwge1xuXG5cdC8vI3JlZ2lvbiBOb3RpZmljYXRpb25zIGFzIFRvYXN0cy9DZW50ZXJcblxuXHRyZWFkb25seSBub3RpZmljYXRpb25zOiBJTm90aWZpY2F0aW9uVmlld0l0ZW1bXTtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZU5vdGlmaWNhdGlvbjogRXZlbnQ8SU5vdGlmaWNhdGlvbkNoYW5nZUV2ZW50Pjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGaWx0ZXI6IEV2ZW50PFBhcnRpYWw8SU5vdGlmaWNhdGlvbnNGaWx0ZXI+PjtcblxuXHRhZGROb3RpZmljYXRpb24obm90aWZpY2F0aW9uOiBJTm90aWZpY2F0aW9uKTogSU5vdGlmaWNhdGlvbkhhbmRsZTtcblxuXHRzZXRGaWx0ZXIoZmlsdGVyOiBQYXJ0aWFsPElOb3RpZmljYXRpb25zRmlsdGVyPik6IHZvaWQ7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblxuXHQvLyNyZWdpb24gTm90aWZpY2F0aW9ucyBhcyBTdGF0dXNcblxuXHRyZWFkb25seSBzdGF0dXNNZXNzYWdlOiBJU3RhdHVzTWVzc2FnZVZpZXdJdGVtIHwgdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU3RhdHVzTWVzc2FnZTogRXZlbnQ8SVN0YXR1c01lc3NhZ2VDaGFuZ2VFdmVudD47XG5cblx0c2hvd1N0YXR1c01lc3NhZ2UobWVzc2FnZTogTm90aWZpY2F0aW9uTWVzc2FnZSwgb3B0aW9ucz86IElTdGF0dXNNZXNzYWdlT3B0aW9ucyk6IElTdGF0dXNIYW5kbGU7XG5cblx0Ly8jZW5kcmVnaW9uXG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIE5vdGlmaWNhdGlvbkNoYW5nZVR5cGUge1xuXG5cdC8qKlxuXHQgKiBBIG5vdGlmaWNhdGlvbiB3YXMgYWRkZWQuXG5cdCAqL1xuXHRBREQsXG5cblx0LyoqXG5cdCAqIEEgbm90aWZpY2F0aW9uIGNoYW5nZWQuIENoZWNrIGBkZXRhaWxgIHByb3BlcnR5XG5cdCAqIG9uIHRoZSBldmVudCBmb3IgYWRkaXRpb25hbCBpbmZvcm1hdGlvbi5cblx0ICovXG5cdENIQU5HRSxcblxuXHQvKipcblx0ICogQSBub3RpZmljYXRpb24gZXhwYW5kZWQgb3IgY29sbGFwc2VkLlxuXHQgKi9cblx0RVhQQU5EX0NPTExBUFNFLFxuXG5cdC8qKlxuXHQgKiBBIG5vdGlmaWNhdGlvbiB3YXMgcmVtb3ZlZC5cblx0ICovXG5cdFJFTU9WRVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElOb3RpZmljYXRpb25DaGFuZ2VFdmVudCB7XG5cblx0LyoqXG5cdCAqIFRoZSBpbmRleCB0aGlzIG5vdGlmaWNhdGlvbiBoYXMgaW4gdGhlIGxpc3Qgb2Ygbm90aWZpY2F0aW9ucy5cblx0ICovXG5cdGluZGV4OiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIFRoZSBub3RpZmljYXRpb24gdGhpcyBjaGFuZ2UgaXMgYWJvdXQuXG5cdCAqL1xuXHRpdGVtOiBJTm90aWZpY2F0aW9uVmlld0l0ZW07XG5cblx0LyoqXG5cdCAqIFRoZSBraW5kIG9mIG5vdGlmaWNhdGlvbiBjaGFuZ2UuXG5cdCAqL1xuXHRraW5kOiBOb3RpZmljYXRpb25DaGFuZ2VUeXBlO1xuXG5cdC8qKlxuXHQgKiBBZGRpdGlvbmFsIGRldGFpbCBhYm91dCB0aGUgaXRlbSBjaGFuZ2UuIE9ubHkgYXBwbGllcyB0b1xuXHQgKiBgTm90aWZpY2F0aW9uQ2hhbmdlVHlwZS5DSEFOR0VgLlxuXHQgKi9cblx0ZGV0YWlsPzogTm90aWZpY2F0aW9uVmlld0l0ZW1Db250ZW50Q2hhbmdlS2luZDtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gU3RhdHVzTWVzc2FnZUNoYW5nZVR5cGUge1xuXHRBREQsXG5cdFJFTU9WRVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTdGF0dXNNZXNzYWdlVmlld0l0ZW0ge1xuXHRtZXNzYWdlOiBzdHJpbmc7XG5cdG9wdGlvbnM/OiBJU3RhdHVzTWVzc2FnZU9wdGlvbnM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN0YXR1c01lc3NhZ2VDaGFuZ2VFdmVudCB7XG5cblx0LyoqXG5cdCAqIFRoZSBzdGF0dXMgbWVzc2FnZSBpdGVtIHRoaXMgY2hhbmdlIGlzIGFib3V0LlxuXHQgKi9cblx0aXRlbTogSVN0YXR1c01lc3NhZ2VWaWV3SXRlbTtcblxuXHQvKipcblx0ICogVGhlIGtpbmQgb2Ygc3RhdHVzIG1lc3NhZ2UgY2hhbmdlLlxuXHQgKi9cblx0a2luZDogU3RhdHVzTWVzc2FnZUNoYW5nZVR5cGU7XG59XG5cbmV4cG9ydCBjbGFzcyBOb3RpZmljYXRpb25IYW5kbGUgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU5vdGlmaWNhdGlvbkhhbmRsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENsb3NlID0gdGhpcy5fb25EaWRDbG9zZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVZpc2liaWxpdHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWaXNpYmlsaXR5ID0gdGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgaXRlbTogSU5vdGlmaWNhdGlvblZpZXdJdGVtLCBwcml2YXRlIHJlYWRvbmx5IG9uQ2xvc2U6IChpdGVtOiBJTm90aWZpY2F0aW9uVmlld0l0ZW0pID0+IHZvaWQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblxuXHRcdC8vIFZpc2liaWxpdHlcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLml0ZW0ub25EaWRDaGFuZ2VWaXNpYmlsaXR5KHZpc2libGUgPT4gdGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmZpcmUodmlzaWJsZSkpKTtcblxuXHRcdC8vIENsb3Npbmdcblx0XHRFdmVudC5vbmNlKHRoaXMuaXRlbS5vbkRpZENsb3NlKSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENsb3NlLmZpcmUoKTtcblxuXHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRnZXQgcHJvZ3Jlc3MoKTogSU5vdGlmaWNhdGlvblByb2dyZXNzIHtcblx0XHRyZXR1cm4gdGhpcy5pdGVtLnByb2dyZXNzO1xuXHR9XG5cblx0dXBkYXRlU2V2ZXJpdHkoc2V2ZXJpdHk6IFNldmVyaXR5KTogdm9pZCB7XG5cdFx0dGhpcy5pdGVtLnVwZGF0ZVNldmVyaXR5KHNldmVyaXR5KTtcblx0fVxuXG5cdHVwZGF0ZU1lc3NhZ2UobWVzc2FnZTogTm90aWZpY2F0aW9uTWVzc2FnZSk6IHZvaWQge1xuXHRcdHRoaXMuaXRlbS51cGRhdGVNZXNzYWdlKG1lc3NhZ2UpO1xuXHR9XG5cblx0dXBkYXRlQWN0aW9ucyhhY3Rpb25zPzogSU5vdGlmaWNhdGlvbkFjdGlvbnMpOiB2b2lkIHtcblx0XHR0aGlzLml0ZW0udXBkYXRlQWN0aW9ucyhhY3Rpb25zKTtcblx0fVxuXG5cdGNsb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMub25DbG9zZSh0aGlzLml0ZW0pO1xuXG5cdFx0dGhpcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTm90aWZpY2F0aW9uc0ZpbHRlciB7XG5cdHJlYWRvbmx5IGdsb2JhbDogTm90aWZpY2F0aW9uc0ZpbHRlcjtcblx0cmVhZG9ubHkgc291cmNlczogTWFwPHN0cmluZywgTm90aWZpY2F0aW9uc0ZpbHRlcj47XG59XG5cbmV4cG9ydCBjbGFzcyBOb3RpZmljYXRpb25zTW9kZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU5vdGlmaWNhdGlvbnNNb2RlbCB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTk9fT1BfTk9USUZJQ0FUSU9OID0gbmV3IE5vT3BOb3RpZmljYXRpb24oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU5vdGlmaWNhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElOb3RpZmljYXRpb25DaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTm90aWZpY2F0aW9uID0gdGhpcy5fb25EaWRDaGFuZ2VOb3RpZmljYXRpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTdGF0dXNNZXNzYWdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVN0YXR1c01lc3NhZ2VDaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU3RhdHVzTWVzc2FnZSA9IHRoaXMuX29uRGlkQ2hhbmdlU3RhdHVzTWVzc2FnZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUZpbHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFBhcnRpYWw8SU5vdGlmaWNhdGlvbnNGaWx0ZXI+PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGaWx0ZXIgPSB0aGlzLl9vbkRpZENoYW5nZUZpbHRlci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25zOiBJTm90aWZpY2F0aW9uVmlld0l0ZW1bXSA9IFtdO1xuXHRnZXQgbm90aWZpY2F0aW9ucygpOiBJTm90aWZpY2F0aW9uVmlld0l0ZW1bXSB7IHJldHVybiB0aGlzLl9ub3RpZmljYXRpb25zOyB9XG5cblx0cHJpdmF0ZSBfc3RhdHVzTWVzc2FnZTogSVN0YXR1c01lc3NhZ2VWaWV3SXRlbSB8IHVuZGVmaW5lZDtcblx0Z2V0IHN0YXR1c01lc3NhZ2UoKTogSVN0YXR1c01lc3NhZ2VWaWV3SXRlbSB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9zdGF0dXNNZXNzYWdlOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBmaWx0ZXIgPSB7XG5cdFx0Z2xvYmFsOiBOb3RpZmljYXRpb25zRmlsdGVyLk9GRixcblx0XHRzb3VyY2VzOiBuZXcgTWFwPHN0cmluZywgTm90aWZpY2F0aW9uc0ZpbHRlcj4oKVxuXHR9O1xuXG5cdHNldEZpbHRlcihmaWx0ZXI6IFBhcnRpYWw8SU5vdGlmaWNhdGlvbnNGaWx0ZXI+KTogdm9pZCB7XG5cdFx0bGV0IGdsb2JhbENoYW5nZWQgPSBmYWxzZTtcblx0XHRpZiAodHlwZW9mIGZpbHRlci5nbG9iYWwgPT09ICdudW1iZXInKSB7XG5cdFx0XHRnbG9iYWxDaGFuZ2VkID0gdGhpcy5maWx0ZXIuZ2xvYmFsICE9PSBmaWx0ZXIuZ2xvYmFsO1xuXHRcdFx0dGhpcy5maWx0ZXIuZ2xvYmFsID0gZmlsdGVyLmdsb2JhbDtcblx0XHR9XG5cblx0XHRsZXQgc291cmNlc0NoYW5nZWQgPSBmYWxzZTtcblx0XHRpZiAoZmlsdGVyLnNvdXJjZXMpIHtcblx0XHRcdHNvdXJjZXNDaGFuZ2VkID0gIW1hcHNTdHJpY3RFcXVhbElnbm9yZU9yZGVyKHRoaXMuZmlsdGVyLnNvdXJjZXMsIGZpbHRlci5zb3VyY2VzKTtcblx0XHRcdHRoaXMuZmlsdGVyLnNvdXJjZXMgPSBmaWx0ZXIuc291cmNlcztcblx0XHR9XG5cblx0XHRpZiAoZ2xvYmFsQ2hhbmdlZCB8fCBzb3VyY2VzQ2hhbmdlZCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VGaWx0ZXIuZmlyZSh7XG5cdFx0XHRcdGdsb2JhbDogZ2xvYmFsQ2hhbmdlZCA/IGZpbHRlci5nbG9iYWwgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHNvdXJjZXM6IHNvdXJjZXNDaGFuZ2VkID8gZmlsdGVyLnNvdXJjZXMgOiB1bmRlZmluZWRcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdGFkZE5vdGlmaWNhdGlvbihub3RpZmljYXRpb246IElOb3RpZmljYXRpb24pOiBJTm90aWZpY2F0aW9uSGFuZGxlIHtcblx0XHRjb25zdCBpdGVtID0gdGhpcy5jcmVhdGVWaWV3SXRlbShub3RpZmljYXRpb24pO1xuXHRcdGlmICghaXRlbSkge1xuXHRcdFx0cmV0dXJuIE5vdGlmaWNhdGlvbnNNb2RlbC5OT19PUF9OT1RJRklDQVRJT047IC8vIHJldHVybiBlYXJseSBpZiB0aGlzIGlzIGEgbm8tb3Bcblx0XHR9XG5cblx0XHQvLyBEZWR1cGxpY2F0ZVxuXHRcdGNvbnN0IGR1cGxpY2F0ZSA9IHRoaXMuZmluZE5vdGlmaWNhdGlvbihpdGVtKTtcblx0XHRkdXBsaWNhdGU/LmNsb3NlKCk7XG5cblx0XHQvLyBBZGQgdG8gbGlzdCBhcyBmaXJzdCBlbnRyeVxuXHRcdHRoaXMuX25vdGlmaWNhdGlvbnMuc3BsaWNlKDAsIDAsIGl0ZW0pO1xuXG5cdFx0Ly8gRXZlbnRzXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VOb3RpZmljYXRpb24uZmlyZSh7IGl0ZW0sIGluZGV4OiAwLCBraW5kOiBOb3RpZmljYXRpb25DaGFuZ2VUeXBlLkFERCB9KTtcblxuXHRcdC8vIFdyYXAgaW50byBoYW5kbGVcblx0XHRyZXR1cm4gbmV3IE5vdGlmaWNhdGlvbkhhbmRsZShpdGVtLCBpdGVtID0+IHRoaXMub25DbG9zZShpdGVtKSk7XG5cdH1cblxuXHRwcml2YXRlIG9uQ2xvc2UoaXRlbTogSU5vdGlmaWNhdGlvblZpZXdJdGVtKTogdm9pZCB7XG5cdFx0Y29uc3QgbGl2ZUl0ZW0gPSB0aGlzLmZpbmROb3RpZmljYXRpb24oaXRlbSk7XG5cdFx0aWYgKGxpdmVJdGVtICYmIGxpdmVJdGVtICE9PSBpdGVtKSB7XG5cdFx0XHRsaXZlSXRlbS5jbG9zZSgpOyAvLyBpdGVtIGNvdWxkIGhhdmUgYmVlbiByZXBsYWNlZCB3aXRoIGFub3RoZXIgb25lLCBtYWtlIHN1cmUgdG8gY2xvc2UgdGhlIGxpdmUgaXRlbVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpdGVtLmNsb3NlKCk7IC8vIG90aGVyd2lzZSBqdXN0IGNsb3NlIHRoZSBpdGVtIHRoYXQgd2FzIHBhc3NlZCBpblxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZmluZE5vdGlmaWNhdGlvbihpdGVtOiBJTm90aWZpY2F0aW9uVmlld0l0ZW0pOiBJTm90aWZpY2F0aW9uVmlld0l0ZW0gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9ub3RpZmljYXRpb25zLmZpbmQobm90aWZpY2F0aW9uID0+IG5vdGlmaWNhdGlvbi5lcXVhbHMoaXRlbSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVWaWV3SXRlbShub3RpZmljYXRpb246IElOb3RpZmljYXRpb24pOiBJTm90aWZpY2F0aW9uVmlld0l0ZW0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGl0ZW0gPSBOb3RpZmljYXRpb25WaWV3SXRlbS5jcmVhdGUobm90aWZpY2F0aW9uLCB0aGlzLmZpbHRlcik7XG5cdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIEl0ZW0gRXZlbnRzXG5cdFx0Y29uc3QgZmlyZU5vdGlmaWNhdGlvbkNoYW5nZUV2ZW50ID0gKGtpbmQ6IE5vdGlmaWNhdGlvbkNoYW5nZVR5cGUsIGRldGFpbD86IE5vdGlmaWNhdGlvblZpZXdJdGVtQ29udGVudENoYW5nZUtpbmQpID0+IHtcblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fbm90aWZpY2F0aW9ucy5pbmRleE9mKGl0ZW0pO1xuXHRcdFx0aWYgKGluZGV4ID49IDApIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VOb3RpZmljYXRpb24uZmlyZSh7IGl0ZW0sIGluZGV4LCBraW5kLCBkZXRhaWwgfSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGl0ZW1FeHBhbnNpb25DaGFuZ2VMaXN0ZW5lciA9IGl0ZW0ub25EaWRDaGFuZ2VFeHBhbnNpb24oKCkgPT4gZmlyZU5vdGlmaWNhdGlvbkNoYW5nZUV2ZW50KE5vdGlmaWNhdGlvbkNoYW5nZVR5cGUuRVhQQU5EX0NPTExBUFNFKSk7XG5cdFx0Y29uc3QgaXRlbUNvbnRlbnRDaGFuZ2VMaXN0ZW5lciA9IGl0ZW0ub25EaWRDaGFuZ2VDb250ZW50KGUgPT4gZmlyZU5vdGlmaWNhdGlvbkNoYW5nZUV2ZW50KE5vdGlmaWNhdGlvbkNoYW5nZVR5cGUuQ0hBTkdFLCBlLmtpbmQpKTtcblxuXHRcdEV2ZW50Lm9uY2UoaXRlbS5vbkRpZENsb3NlKSgoKSA9PiB7XG5cdFx0XHRpdGVtRXhwYW5zaW9uQ2hhbmdlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0aXRlbUNvbnRlbnRDaGFuZ2VMaXN0ZW5lci5kaXNwb3NlKCk7XG5cblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fbm90aWZpY2F0aW9ucy5pbmRleE9mKGl0ZW0pO1xuXHRcdFx0aWYgKGluZGV4ID49IDApIHtcblx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9ucy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZU5vdGlmaWNhdGlvbi5maXJlKHsgaXRlbSwgaW5kZXgsIGtpbmQ6IE5vdGlmaWNhdGlvbkNoYW5nZVR5cGUuUkVNT1ZFIH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGl0ZW07XG5cdH1cblxuXHRzaG93U3RhdHVzTWVzc2FnZShtZXNzYWdlOiBOb3RpZmljYXRpb25NZXNzYWdlLCBvcHRpb25zPzogSVN0YXR1c01lc3NhZ2VPcHRpb25zKTogSVN0YXR1c0hhbmRsZSB7XG5cdFx0Y29uc3QgaXRlbSA9IFN0YXR1c01lc3NhZ2VWaWV3SXRlbS5jcmVhdGUobWVzc2FnZSwgb3B0aW9ucyk7XG5cdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHRyZXR1cm4geyBjbG9zZTogKCkgPT4geyB9IH07XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3RhdHVzTWVzc2FnZSA9IGl0ZW07XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTdGF0dXNNZXNzYWdlLmZpcmUoeyBraW5kOiBTdGF0dXNNZXNzYWdlQ2hhbmdlVHlwZS5BREQsIGl0ZW0gfSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y2xvc2U6ICgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX3N0YXR1c01lc3NhZ2UgPT09IGl0ZW0pIHtcblx0XHRcdFx0XHR0aGlzLl9zdGF0dXNNZXNzYWdlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdHVzTWVzc2FnZS5maXJlKHsga2luZDogU3RhdHVzTWVzc2FnZUNoYW5nZVR5cGUuUkVNT1ZFLCBpdGVtIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElOb3RpZmljYXRpb25WaWV3SXRlbSB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHNldmVyaXR5OiBTZXZlcml0eTtcblx0cmVhZG9ubHkgc3RpY2t5OiBib29sZWFuO1xuXHRyZWFkb25seSBwcmlvcml0eTogTm90aWZpY2F0aW9uUHJpb3JpdHk7XG5cdHJlYWRvbmx5IG1lc3NhZ2U6IElOb3RpZmljYXRpb25NZXNzYWdlO1xuXHRyZWFkb25seSBzb3VyY2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgc291cmNlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgYWN0aW9uczogSU5vdGlmaWNhdGlvbkFjdGlvbnMgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHByb2dyZXNzOiBJTm90aWZpY2F0aW9uVmlld0l0ZW1Qcm9ncmVzcztcblxuXHRyZWFkb25seSBleHBhbmRlZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgdmlzaWJsZTogYm9vbGVhbjtcblx0cmVhZG9ubHkgY2FuQ29sbGFwc2U6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGhhc1Byb2dyZXNzOiBib29sZWFuO1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRXhwYW5zaW9uOiBFdmVudDx2b2lkPjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWaXNpYmlsaXR5OiBFdmVudDxib29sZWFuPjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb250ZW50OiBFdmVudDxJTm90aWZpY2F0aW9uVmlld0l0ZW1Db250ZW50Q2hhbmdlRXZlbnQ+O1xuXHRyZWFkb25seSBvbkRpZENsb3NlOiBFdmVudDx2b2lkPjtcblxuXHRleHBhbmQoKTogdm9pZDtcblx0Y29sbGFwc2Uoc2tpcEV2ZW50cz86IGJvb2xlYW4pOiB2b2lkO1xuXHR0b2dnbGUoKTogdm9pZDtcblxuXHR1cGRhdGVTZXZlcml0eShzZXZlcml0eTogU2V2ZXJpdHkpOiB2b2lkO1xuXHR1cGRhdGVNZXNzYWdlKG1lc3NhZ2U6IE5vdGlmaWNhdGlvbk1lc3NhZ2UpOiB2b2lkO1xuXHR1cGRhdGVBY3Rpb25zKGFjdGlvbnM/OiBJTm90aWZpY2F0aW9uQWN0aW9ucyk6IHZvaWQ7XG5cblx0dXBkYXRlVmlzaWJpbGl0eSh2aXNpYmxlOiBib29sZWFuKTogdm9pZDtcblxuXHRjbG9zZSgpOiB2b2lkO1xuXG5cdGVxdWFscyhpdGVtOiBJTm90aWZpY2F0aW9uVmlld0l0ZW0pOiBib29sZWFuO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNOb3RpZmljYXRpb25WaWV3SXRlbShvYmo6IHVua25vd24pOiBvYmogaXMgSU5vdGlmaWNhdGlvblZpZXdJdGVtIHtcblx0cmV0dXJuIG9iaiBpbnN0YW5jZW9mIE5vdGlmaWNhdGlvblZpZXdJdGVtO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBOb3RpZmljYXRpb25WaWV3SXRlbUNvbnRlbnRDaGFuZ2VLaW5kIHtcblx0U0VWRVJJVFksXG5cdE1FU1NBR0UsXG5cdEFDVElPTlMsXG5cdFBST0dSRVNTXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5vdGlmaWNhdGlvblZpZXdJdGVtQ29udGVudENoYW5nZUV2ZW50IHtcblx0a2luZDogTm90aWZpY2F0aW9uVmlld0l0ZW1Db250ZW50Q2hhbmdlS2luZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTm90aWZpY2F0aW9uVmlld0l0ZW1Qcm9ncmVzc1N0YXRlIHtcblx0aW5maW5pdGU/OiBib29sZWFuO1xuXHR0b3RhbD86IG51bWJlcjtcblx0d29ya2VkPzogbnVtYmVyO1xuXHRkb25lPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTm90aWZpY2F0aW9uVmlld0l0ZW1Qcm9ncmVzcyBleHRlbmRzIElOb3RpZmljYXRpb25Qcm9ncmVzcyB7XG5cdHJlYWRvbmx5IHN0YXRlOiBJTm90aWZpY2F0aW9uVmlld0l0ZW1Qcm9ncmVzc1N0YXRlO1xuXG5cdGRpc3Bvc2UoKTogdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIE5vdGlmaWNhdGlvblZpZXdJdGVtUHJvZ3Jlc3MgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU5vdGlmaWNhdGlvblZpZXdJdGVtUHJvZ3Jlc3Mge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZTogSU5vdGlmaWNhdGlvblZpZXdJdGVtUHJvZ3Jlc3NTdGF0ZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9zdGF0ZSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdH1cblxuXHRnZXQgc3RhdGUoKTogSU5vdGlmaWNhdGlvblZpZXdJdGVtUHJvZ3Jlc3NTdGF0ZSB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0YXRlO1xuXHR9XG5cblx0aW5maW5pdGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlLmluZmluaXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3RhdGUuaW5maW5pdGUgPSB0cnVlO1xuXG5cdFx0dGhpcy5fc3RhdGUudG90YWwgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fc3RhdGUud29ya2VkID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3N0YXRlLmRvbmUgPSB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdH1cblxuXHRkb25lKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGF0ZS5kb25lKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3RhdGUuZG9uZSA9IHRydWU7XG5cblx0XHR0aGlzLl9zdGF0ZS5pbmZpbml0ZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9zdGF0ZS50b3RhbCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9zdGF0ZS53b3JrZWQgPSB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdH1cblxuXHR0b3RhbCh2YWx1ZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlLnRvdGFsID09PSB2YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3N0YXRlLnRvdGFsID0gdmFsdWU7XG5cblx0XHR0aGlzLl9zdGF0ZS5pbmZpbml0ZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9zdGF0ZS5kb25lID0gdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHR9XG5cblx0d29ya2VkKHZhbHVlOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodHlwZW9mIHRoaXMuX3N0YXRlLndvcmtlZCA9PT0gJ251bWJlcicpIHtcblx0XHRcdHRoaXMuX3N0YXRlLndvcmtlZCArPSB2YWx1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc3RhdGUud29ya2VkID0gdmFsdWU7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3RhdGUuaW5maW5pdGUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fc3RhdGUuZG9uZSA9IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElNZXNzYWdlTGluayB7XG5cdGhyZWY6IHN0cmluZztcblx0bmFtZTogc3RyaW5nO1xuXHR0aXRsZTogc3RyaW5nO1xuXHRvZmZzZXQ6IG51bWJlcjtcblx0bGVuZ3RoOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5vdGlmaWNhdGlvbk1lc3NhZ2Uge1xuXHRyYXc6IHN0cmluZztcblx0b3JpZ2luYWw6IE5vdGlmaWNhdGlvbk1lc3NhZ2U7XG5cdGxpbmtlZFRleHQ6IExpbmtlZFRleHQ7XG59XG5cbmV4cG9ydCBjbGFzcyBOb3RpZmljYXRpb25WaWV3SXRlbSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTm90aWZpY2F0aW9uVmlld0l0ZW0ge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1BWF9NRVNTQUdFX0xFTkdUSCA9IDEwMDA7XG5cblx0cHJpdmF0ZSBfZXhwYW5kZWQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Zpc2libGU6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRwcml2YXRlIF9hY3Rpb25zOiBJTm90aWZpY2F0aW9uQWN0aW9ucyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcHJvZ3Jlc3M6IE5vdGlmaWNhdGlvblZpZXdJdGVtUHJvZ3Jlc3MgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VFeHBhbnNpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VFeHBhbnNpb24gPSB0aGlzLl9vbkRpZENoYW5nZUV4cGFuc2lvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENsb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xvc2UgPSB0aGlzLl9vbkRpZENsb3NlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29udGVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElOb3RpZmljYXRpb25WaWV3SXRlbUNvbnRlbnRDaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29udGVudCA9IHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVZpc2liaWxpdHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWaXNpYmlsaXR5ID0gdGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmV2ZW50O1xuXG5cdHN0YXRpYyBjcmVhdGUobm90aWZpY2F0aW9uOiBJTm90aWZpY2F0aW9uLCBmaWx0ZXI6IElOb3RpZmljYXRpb25zRmlsdGVyKTogSU5vdGlmaWNhdGlvblZpZXdJdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIW5vdGlmaWNhdGlvbj8ubWVzc2FnZSB8fCBpc0NhbmNlbGxhdGlvbkVycm9yKG5vdGlmaWNhdGlvbi5tZXNzYWdlKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gd2UgbmVlZCBhIG1lc3NhZ2UgdG8gc2hvd1xuXHRcdH1cblxuXHRcdGxldCBzZXZlcml0eTogU2V2ZXJpdHk7XG5cdFx0aWYgKHR5cGVvZiBub3RpZmljYXRpb24uc2V2ZXJpdHkgPT09ICdudW1iZXInKSB7XG5cdFx0XHRzZXZlcml0eSA9IG5vdGlmaWNhdGlvbi5zZXZlcml0eTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c2V2ZXJpdHkgPSBTZXZlcml0eS5JbmZvO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1lc3NhZ2UgPSBOb3RpZmljYXRpb25WaWV3SXRlbS5wYXJzZU5vdGlmaWNhdGlvbk1lc3NhZ2Uobm90aWZpY2F0aW9uLm1lc3NhZ2UpO1xuXHRcdGlmICghbWVzc2FnZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gd2UgbmVlZCBhIG1lc3NhZ2UgdG8gc2hvd1xuXHRcdH1cblxuXHRcdGxldCBhY3Rpb25zOiBJTm90aWZpY2F0aW9uQWN0aW9ucyB8IHVuZGVmaW5lZDtcblx0XHRpZiAobm90aWZpY2F0aW9uLmFjdGlvbnMpIHtcblx0XHRcdGFjdGlvbnMgPSBub3RpZmljYXRpb24uYWN0aW9ucztcblx0XHR9IGVsc2UgaWYgKGlzRXJyb3JXaXRoQWN0aW9ucyhub3RpZmljYXRpb24ubWVzc2FnZSkpIHtcblx0XHRcdGFjdGlvbnMgPSB7IHByaW1hcnk6IG5vdGlmaWNhdGlvbi5tZXNzYWdlLmFjdGlvbnMgfTtcblx0XHR9XG5cblx0XHRsZXQgcHJpb3JpdHkgPSBub3RpZmljYXRpb24ucHJpb3JpdHkgPz8gTm90aWZpY2F0aW9uUHJpb3JpdHkuREVGQVVMVDtcblx0XHRpZiAoKHByaW9yaXR5ID09PSBOb3RpZmljYXRpb25Qcmlvcml0eS5ERUZBVUxUIHx8IHByaW9yaXR5ID09PSBOb3RpZmljYXRpb25Qcmlvcml0eS5PUFRJT05BTCkgJiYgc2V2ZXJpdHkgIT09IFNldmVyaXR5LkVycm9yKSB7XG5cdFx0XHRpZiAoZmlsdGVyLmdsb2JhbCA9PT0gTm90aWZpY2F0aW9uc0ZpbHRlci5FUlJPUikge1xuXHRcdFx0XHRwcmlvcml0eSA9IE5vdGlmaWNhdGlvblByaW9yaXR5LlNJTEVOVDsgLy8gZmlsdGVyZWQgZ2xvYmFsbHlcblx0XHRcdH0gZWxzZSBpZiAoaXNOb3RpZmljYXRpb25Tb3VyY2Uobm90aWZpY2F0aW9uLnNvdXJjZSkgJiYgZmlsdGVyLnNvdXJjZXMuZ2V0KG5vdGlmaWNhdGlvbi5zb3VyY2UuaWQpID09PSBOb3RpZmljYXRpb25zRmlsdGVyLkVSUk9SKSB7XG5cdFx0XHRcdHByaW9yaXR5ID0gTm90aWZpY2F0aW9uUHJpb3JpdHkuU0lMRU5UOyAvLyBmaWx0ZXJlZCBieSBzb3VyY2Vcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IE5vdGlmaWNhdGlvblZpZXdJdGVtKG5vdGlmaWNhdGlvbi5pZCwgc2V2ZXJpdHksIG5vdGlmaWNhdGlvbi5zdGlja3ksIHByaW9yaXR5LCBtZXNzYWdlLCBub3RpZmljYXRpb24uc291cmNlLCBub3RpZmljYXRpb24ucHJvZ3Jlc3MsIGFjdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgcGFyc2VOb3RpZmljYXRpb25NZXNzYWdlKGlucHV0OiBOb3RpZmljYXRpb25NZXNzYWdlKTogSU5vdGlmaWNhdGlvbk1lc3NhZ2UgfCB1bmRlZmluZWQge1xuXHRcdGxldCBtZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGlucHV0IGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdG1lc3NhZ2UgPSB0b0Vycm9yTWVzc2FnZShpbnB1dCwgZmFsc2UpO1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIGlucHV0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0bWVzc2FnZSA9IGlucHV0O1xuXHRcdH1cblxuXHRcdGlmICghbWVzc2FnZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gd2UgbmVlZCBhIG1lc3NhZ2UgdG8gc2hvd1xuXHRcdH1cblxuXHRcdGNvbnN0IHJhdyA9IG1lc3NhZ2U7XG5cblx0XHQvLyBNYWtlIHN1cmUgbWVzc2FnZSBpcyBpbiB0aGUgbGltaXRzXG5cdFx0aWYgKG1lc3NhZ2UubGVuZ3RoID4gTm90aWZpY2F0aW9uVmlld0l0ZW0uTUFYX01FU1NBR0VfTEVOR1RIKSB7XG5cdFx0XHRtZXNzYWdlID0gYCR7bWVzc2FnZS5zdWJzdHIoMCwgTm90aWZpY2F0aW9uVmlld0l0ZW0uTUFYX01FU1NBR0VfTEVOR1RIKX0uLi5gO1xuXHRcdH1cblxuXHRcdC8vIFJlbW92ZSBuZXdsaW5lcyBmcm9tIG1lc3NhZ2VzIGFzIHdlIGRvIG5vdCBzdXBwb3J0IHRoYXQgYW5kIGl0IG1ha2VzIGxpbmsgcGFyc2luZyBoYXJkXG5cdFx0bWVzc2FnZSA9IG1lc3NhZ2UucmVwbGFjZSgvKFxcclxcbnxcXG58XFxyKS9nbSwgJyAnKS50cmltKCk7XG5cblx0XHQvLyBQYXJzZSBMaW5rc1xuXHRcdGNvbnN0IGxpbmtlZFRleHQgPSBwYXJzZUxpbmtlZFRleHQobWVzc2FnZSk7XG5cblx0XHRyZXR1cm4geyByYXcsIGxpbmtlZFRleHQsIG9yaWdpbmFsOiBpbnB1dCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBpZDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgX3NldmVyaXR5OiBTZXZlcml0eSxcblx0XHRwcml2YXRlIF9zdGlja3k6IGJvb2xlYW4gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSBfcHJpb3JpdHk6IE5vdGlmaWNhdGlvblByaW9yaXR5LFxuXHRcdHByaXZhdGUgX21lc3NhZ2U6IElOb3RpZmljYXRpb25NZXNzYWdlLFxuXHRcdHByaXZhdGUgX3NvdXJjZTogc3RyaW5nIHwgSU5vdGlmaWNhdGlvblNvdXJjZSB8IHVuZGVmaW5lZCxcblx0XHRwcm9ncmVzczogSU5vdGlmaWNhdGlvblByb2dyZXNzUHJvcGVydGllcyB8IHVuZGVmaW5lZCxcblx0XHRhY3Rpb25zPzogSU5vdGlmaWNhdGlvbkFjdGlvbnNcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGlmIChwcm9ncmVzcykge1xuXHRcdFx0dGhpcy5zZXRQcm9ncmVzcyhwcm9ncmVzcyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zZXRBY3Rpb25zKGFjdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRQcm9ncmVzcyhwcm9ncmVzczogSU5vdGlmaWNhdGlvblByb2dyZXNzUHJvcGVydGllcyk6IHZvaWQge1xuXHRcdGlmIChwcm9ncmVzcy5pbmZpbml0ZSkge1xuXHRcdFx0dGhpcy5wcm9ncmVzcy5pbmZpbml0ZSgpO1xuXHRcdH0gZWxzZSBpZiAocHJvZ3Jlc3MudG90YWwpIHtcblx0XHRcdHRoaXMucHJvZ3Jlc3MudG90YWwocHJvZ3Jlc3MudG90YWwpO1xuXG5cdFx0XHRpZiAocHJvZ3Jlc3Mud29ya2VkKSB7XG5cdFx0XHRcdHRoaXMucHJvZ3Jlc3Mud29ya2VkKHByb2dyZXNzLndvcmtlZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXRBY3Rpb25zKGFjdGlvbnM6IElOb3RpZmljYXRpb25BY3Rpb25zID0geyBwcmltYXJ5OiBbXSwgc2Vjb25kYXJ5OiBbXSB9KTogdm9pZCB7XG5cdFx0dGhpcy5fYWN0aW9ucyA9IHtcblx0XHRcdHByaW1hcnk6IEFycmF5LmlzQXJyYXkoYWN0aW9ucy5wcmltYXJ5KSA/IGFjdGlvbnMucHJpbWFyeSA6IFtdLFxuXHRcdFx0c2Vjb25kYXJ5OiBBcnJheS5pc0FycmF5KGFjdGlvbnMuc2Vjb25kYXJ5KSA/IGFjdGlvbnMuc2Vjb25kYXJ5IDogW11cblx0XHR9O1xuXG5cdFx0dGhpcy5fZXhwYW5kZWQgPSBhY3Rpb25zLnByaW1hcnkgJiYgYWN0aW9ucy5wcmltYXJ5Lmxlbmd0aCA+IDA7XG5cdH1cblxuXHRnZXQgY2FuQ29sbGFwc2UoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLmhhc0FjdGlvbnM7XG5cdH1cblxuXHRnZXQgZXhwYW5kZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5fZXhwYW5kZWQ7XG5cdH1cblxuXHRnZXQgc2V2ZXJpdHkoKTogU2V2ZXJpdHkge1xuXHRcdHJldHVybiB0aGlzLl9zZXZlcml0eTtcblx0fVxuXG5cdGdldCBzdGlja3koKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX3N0aWNreSkge1xuXHRcdFx0cmV0dXJuIHRydWU7IC8vIGV4cGxpY2l0bHkgc3RpY2t5XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFzQWN0aW9ucyA9IHRoaXMuaGFzQWN0aW9ucztcblx0XHRpZiAoXG5cdFx0XHQoaGFzQWN0aW9ucyAmJiB0aGlzLl9zZXZlcml0eSA9PT0gU2V2ZXJpdHkuRXJyb3IpIHx8IC8vIG5vdGlmaWNhdGlvbiBlcnJvcnMgd2l0aCBhY3Rpb25zIGFyZSBzdGlja3lcblx0XHRcdCghaGFzQWN0aW9ucyAmJiB0aGlzLl9leHBhbmRlZCkgfHxcdFx0XHRcdFx0IC8vIG5vdGlmaWNhdGlvbnMgdGhhdCBnb3QgZXhwYW5kZWQgYXJlIHN0aWNreVxuXHRcdFx0KHRoaXMuX3Byb2dyZXNzICYmICF0aGlzLl9wcm9ncmVzcy5zdGF0ZS5kb25lKVx0XHQgLy8gbm90aWZpY2F0aW9ucyB3aXRoIHJ1bm5pbmcgcHJvZ3Jlc3MgYXJlIHN0aWNreVxuXHRcdCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlOyAvLyBub3Qgc3RpY2t5XG5cdH1cblxuXHRnZXQgcHJpb3JpdHkoKTogTm90aWZpY2F0aW9uUHJpb3JpdHkge1xuXHRcdHJldHVybiB0aGlzLl9wcmlvcml0eTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IGhhc0FjdGlvbnMoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9hY3Rpb25zKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9hY3Rpb25zLnByaW1hcnkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fYWN0aW9ucy5wcmltYXJ5Lmxlbmd0aCA+IDA7XG5cdH1cblxuXHRnZXQgaGFzUHJvZ3Jlc3MoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5fcHJvZ3Jlc3M7XG5cdH1cblxuXHRnZXQgcHJvZ3Jlc3MoKTogSU5vdGlmaWNhdGlvblZpZXdJdGVtUHJvZ3Jlc3Mge1xuXHRcdGlmICghdGhpcy5fcHJvZ3Jlc3MpIHtcblx0XHRcdHRoaXMuX3Byb2dyZXNzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE5vdGlmaWNhdGlvblZpZXdJdGVtUHJvZ3Jlc3MoKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9wcm9ncmVzcy5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnQuZmlyZSh7IGtpbmQ6IE5vdGlmaWNhdGlvblZpZXdJdGVtQ29udGVudENoYW5nZUtpbmQuUFJPR1JFU1MgfSkpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fcHJvZ3Jlc3M7XG5cdH1cblxuXHRnZXQgbWVzc2FnZSgpOiBJTm90aWZpY2F0aW9uTWVzc2FnZSB7XG5cdFx0cmV0dXJuIHRoaXMuX21lc3NhZ2U7XG5cdH1cblxuXHRnZXQgc291cmNlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHR5cGVvZiB0aGlzLl9zb3VyY2UgPT09ICdzdHJpbmcnID8gdGhpcy5fc291cmNlIDogKHRoaXMuX3NvdXJjZSA/IHRoaXMuX3NvdXJjZS5sYWJlbCA6IHVuZGVmaW5lZCk7XG5cdH1cblxuXHRnZXQgc291cmNlSWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gKHRoaXMuX3NvdXJjZSAmJiB0eXBlb2YgdGhpcy5fc291cmNlICE9PSAnc3RyaW5nJyAmJiAnaWQnIGluIHRoaXMuX3NvdXJjZSkgPyB0aGlzLl9zb3VyY2UuaWQgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgYWN0aW9ucygpOiBJTm90aWZpY2F0aW9uQWN0aW9ucyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdGlvbnM7XG5cdH1cblxuXHRnZXQgdmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdmlzaWJsZTtcblx0fVxuXG5cdHVwZGF0ZVNldmVyaXR5KHNldmVyaXR5OiBTZXZlcml0eSk6IHZvaWQge1xuXHRcdGlmIChzZXZlcml0eSA9PT0gdGhpcy5fc2V2ZXJpdHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9zZXZlcml0eSA9IHNldmVyaXR5O1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudC5maXJlKHsga2luZDogTm90aWZpY2F0aW9uVmlld0l0ZW1Db250ZW50Q2hhbmdlS2luZC5TRVZFUklUWSB9KTtcblx0fVxuXG5cdHVwZGF0ZU1lc3NhZ2UoaW5wdXQ6IE5vdGlmaWNhdGlvbk1lc3NhZ2UpOiB2b2lkIHtcblx0XHRjb25zdCBtZXNzYWdlID0gTm90aWZpY2F0aW9uVmlld0l0ZW0ucGFyc2VOb3RpZmljYXRpb25NZXNzYWdlKGlucHV0KTtcblx0XHRpZiAoIW1lc3NhZ2UgfHwgbWVzc2FnZS5yYXcgPT09IHRoaXMuX21lc3NhZ2UucmF3KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fbWVzc2FnZSA9IG1lc3NhZ2U7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZW50LmZpcmUoeyBraW5kOiBOb3RpZmljYXRpb25WaWV3SXRlbUNvbnRlbnRDaGFuZ2VLaW5kLk1FU1NBR0UgfSk7XG5cdH1cblxuXHR1cGRhdGVBY3Rpb25zKGFjdGlvbnM/OiBJTm90aWZpY2F0aW9uQWN0aW9ucyk6IHZvaWQge1xuXHRcdHRoaXMuc2V0QWN0aW9ucyhhY3Rpb25zKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnQuZmlyZSh7IGtpbmQ6IE5vdGlmaWNhdGlvblZpZXdJdGVtQ29udGVudENoYW5nZUtpbmQuQUNUSU9OUyB9KTtcblx0fVxuXG5cdHVwZGF0ZVZpc2liaWxpdHkodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl92aXNpYmxlICE9PSB2aXNpYmxlKSB7XG5cdFx0XHR0aGlzLl92aXNpYmxlID0gdmlzaWJsZTtcblxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmZpcmUodmlzaWJsZSk7XG5cdFx0fVxuXHR9XG5cblx0ZXhwYW5kKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9leHBhbmRlZCB8fCAhdGhpcy5jYW5Db2xsYXBzZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2V4cGFuZGVkID0gdHJ1ZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUV4cGFuc2lvbi5maXJlKCk7XG5cdH1cblxuXHRjb2xsYXBzZShza2lwRXZlbnRzPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZXhwYW5kZWQgfHwgIXRoaXMuY2FuQ29sbGFwc2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9leHBhbmRlZCA9IGZhbHNlO1xuXG5cdFx0aWYgKCFza2lwRXZlbnRzKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUV4cGFuc2lvbi5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0dG9nZ2xlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9leHBhbmRlZCkge1xuXHRcdFx0dGhpcy5jb2xsYXBzZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmV4cGFuZCgpO1xuXHRcdH1cblx0fVxuXG5cdGNsb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2xvc2UuZmlyZSgpO1xuXG5cdFx0dGhpcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRlcXVhbHMob3RoZXI6IElOb3RpZmljYXRpb25WaWV3SXRlbSk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmhhc1Byb2dyZXNzIHx8IG90aGVyLmhhc1Byb2dyZXNzKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiB0aGlzLmlkID09PSAnc3RyaW5nJyB8fCB0eXBlb2Ygb3RoZXIuaWQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pZCA9PT0gb3RoZXIuaWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiB0aGlzLl9zb3VyY2UgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRpZiAodGhpcy5fc291cmNlLmxhYmVsICE9PSBvdGhlci5zb3VyY2UgfHwgdGhpcy5fc291cmNlLmlkICE9PSBvdGhlci5zb3VyY2VJZCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9zb3VyY2UgIT09IG90aGVyLnNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9tZXNzYWdlLnJhdyAhPT0gb3RoZXIubWVzc2FnZS5yYXcpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBwcmltYXJ5QWN0aW9ucyA9IHRoaXMuX2FjdGlvbnM/LnByaW1hcnkgfHwgW107XG5cdFx0Y29uc3Qgb3RoZXJQcmltYXJ5QWN0aW9ucyA9IG90aGVyLmFjdGlvbnM/LnByaW1hcnkgfHwgW107XG5cdFx0cmV0dXJuIGVxdWFscyhwcmltYXJ5QWN0aW9ucywgb3RoZXJQcmltYXJ5QWN0aW9ucywgKGFjdGlvbiwgb3RoZXJBY3Rpb24pID0+IChhY3Rpb24uaWQgKyBhY3Rpb24ubGFiZWwpID09PSAob3RoZXJBY3Rpb24uaWQgKyBvdGhlckFjdGlvbi5sYWJlbCkpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaG9pY2VBY3Rpb24gZXh0ZW5kcyBBY3Rpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUnVuID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUnVuID0gdGhpcy5fb25EaWRSdW4uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfa2VlcE9wZW46IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgX21lbnU6IENob2ljZUFjdGlvbltdIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKGlkOiBzdHJpbmcsIGNob2ljZTogSVByb21wdENob2ljZSkge1xuXHRcdHN1cGVyKGlkLCBjaG9pY2UubGFiZWwsIHVuZGVmaW5lZCwgdHJ1ZSwgYXN5bmMgKCkgPT4ge1xuXG5cdFx0XHQvLyBQYXNzIHRvIHJ1bm5lclxuXHRcdFx0Y2hvaWNlLnJ1bigpO1xuXG5cdFx0XHQvLyBFbWl0IEV2ZW50XG5cdFx0XHR0aGlzLl9vbkRpZFJ1bi5maXJlKCk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9rZWVwT3BlbiA9ICEhY2hvaWNlLmtlZXBPcGVuO1xuXHRcdHRoaXMuX21lbnUgPSAhY2hvaWNlLmlzU2Vjb25kYXJ5ICYmICg8SVByb21wdENob2ljZVdpdGhNZW51PmNob2ljZSkubWVudSA/ICg8SVByb21wdENob2ljZVdpdGhNZW51PmNob2ljZSkubWVudS5tYXAoKGMsIGluZGV4KSA9PiBuZXcgQ2hvaWNlQWN0aW9uKGAke2lkfS4ke2luZGV4fWAsIGMpKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldCBtZW51KCk6IENob2ljZUFjdGlvbltdIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fbWVudTtcblx0fVxuXG5cdGdldCBrZWVwT3BlbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fa2VlcE9wZW47XG5cdH1cbn1cblxuY2xhc3MgU3RhdHVzTWVzc2FnZVZpZXdJdGVtIHtcblxuXHRzdGF0aWMgY3JlYXRlKG5vdGlmaWNhdGlvbjogTm90aWZpY2F0aW9uTWVzc2FnZSwgb3B0aW9ucz86IElTdGF0dXNNZXNzYWdlT3B0aW9ucyk6IElTdGF0dXNNZXNzYWdlVmlld0l0ZW0gfCB1bmRlZmluZWQge1xuXHRcdGlmICghbm90aWZpY2F0aW9uIHx8IGlzQ2FuY2VsbGF0aW9uRXJyb3Iobm90aWZpY2F0aW9uKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gd2UgbmVlZCBhIG1lc3NhZ2UgdG8gc2hvd1xuXHRcdH1cblxuXHRcdGxldCBtZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKG5vdGlmaWNhdGlvbiBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHRtZXNzYWdlID0gdG9FcnJvck1lc3NhZ2Uobm90aWZpY2F0aW9uLCBmYWxzZSk7XG5cdFx0fSBlbHNlIGlmICh0eXBlb2Ygbm90aWZpY2F0aW9uID09PSAnc3RyaW5nJykge1xuXHRcdFx0bWVzc2FnZSA9IG5vdGlmaWNhdGlvbjtcblx0XHR9XG5cblx0XHRpZiAoIW1lc3NhZ2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIHdlIG5lZWQgYSBtZXNzYWdlIHRvIHNob3dcblx0XHR9XG5cblx0XHRyZXR1cm4geyBtZXNzYWdlLCBvcHRpb25zIH07XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gTm90aWZpY2F0aW9uc1NldHRpbmdzIHtcblx0Tk9USUZJQ0FUSU9OU19QT1NJVElPTiA9ICd3b3JrYmVuY2gubm90aWZpY2F0aW9ucy5wb3NpdGlvbicsXG5cdE5PVElGSUNBVElPTlNfQlVUVE9OID0gJ3dvcmtiZW5jaC5ub3RpZmljYXRpb25zLnNob3dJblRpdGxlQmFyJ1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBOb3RpZmljYXRpb25zUG9zaXRpb24ge1xuXHRCT1RUT01fUklHSFQgPSAnYm90dG9tLXJpZ2h0Jyxcblx0Qk9UVE9NX0xFRlQgPSAnYm90dG9tLWxlZnQnLFxuXHRUT1BfUklHSFQgPSAndG9wLXJpZ2h0J1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Tm90aWZpY2F0aW9uc1Bvc2l0aW9uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpOiBOb3RpZmljYXRpb25zUG9zaXRpb24ge1xuXHRjb25zdCBwb3NpdGlvbiA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPE5vdGlmaWNhdGlvbnNQb3NpdGlvbj4oTm90aWZpY2F0aW9uc1NldHRpbmdzLk5PVElGSUNBVElPTlNfUE9TSVRJT04pO1xuXG5cdGlmIChwb3NpdGlvbiA9PT0gTm90aWZpY2F0aW9uc1Bvc2l0aW9uLkJPVFRPTV9MRUZUIHx8IHBvc2l0aW9uID09PSBOb3RpZmljYXRpb25zUG9zaXRpb24uVE9QX1JJR0hUKSB7XG5cdFx0cmV0dXJuIHBvc2l0aW9uO1xuXHR9XG5cblx0cmV0dXJuIE5vdGlmaWNhdGlvbnNQb3NpdGlvbi5CT1RUT01fUklHSFQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUEwRixrQkFBa0IsVUFBcUUscUJBQTZFLHNCQUEyQyw0QkFBMkM7QUFDcFYsU0FBUyxnQkFBZ0IsMEJBQTBCO0FBQ25ELFNBQVMsT0FBTyxlQUFlO0FBQy9CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsY0FBYztBQUN2QixTQUFTLGNBQWM7QUFDdkIsU0FBUyx1QkFBbUM7QUFDNUMsU0FBUyxrQ0FBa0M7QUE4QnBDLElBQVcseUJBQVgsa0JBQVdBLDRCQUFYO0FBS04sRUFBQUEsZ0RBQUE7QUFNQSxFQUFBQSxnREFBQTtBQUtBLEVBQUFBLGdEQUFBO0FBS0EsRUFBQUEsZ0RBQUE7QUFyQmlCLFNBQUFBO0FBQUEsR0FBQTtBQWdEWCxJQUFXLDBCQUFYLGtCQUFXQyw2QkFBWDtBQUNOLEVBQUFBLGtEQUFBO0FBQ0EsRUFBQUEsa0RBQUE7QUFGaUIsU0FBQUE7QUFBQSxHQUFBO0FBdUJYLE1BQU0sMkJBQTJCLFdBQTBDO0FBQUEsRUFRakYsWUFBNkIsTUFBOEMsU0FBZ0Q7QUFDMUgsVUFBTTtBQURzQjtBQUE4QztBQU4zRSxTQUFp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Q2IsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLEVBQUUsU0FBUyxRQUFRO0FBQUEsRUFDM0I7QUFDRDtBQUVPLElBQVcsd0JBQVgsa0JBQVdDLDJCQUFYO0FBQ04sRUFBQUEsdUJBQUEsNEJBQXlCO0FBQ3pCLEVBQUFBLHVCQUFBLDBCQUF1QjtBQUZOLFNBQUFBO0FBQUEsR0FBQTtBQUtYLElBQVcsd0JBQVgsa0JBQVdDLDJCQUFYO0FBQ04sRUFBQUEsdUJBQUEsa0JBQWU7QUFDZixFQUFBQSx1QkFBQSxpQkFBYztBQUNkLEVBQUFBLHVCQUFBLGVBQVk7QUFISyxTQUFBQTtBQUFBLEdBQUE7QUFNWCxTQUFTLHlCQUF5QixzQkFBb0U7QUFDNUcsUUFBTSxXQUFXLHFCQUFxQixTQUFnQywrREFBNEM7QUFFbEgsTUFBSSxhQUFhLG1DQUFxQyxhQUFhLDZCQUFpQztBQUNuRyxXQUFPO0FBQUEsRUFDUjtBQUVBLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFsiTm90aWZpY2F0aW9uQ2hhbmdlVHlwZSIsICJTdGF0dXNNZXNzYWdlQ2hhbmdlVHlwZSIsICJpdGVtIiwgIk5vdGlmaWNhdGlvblZpZXdJdGVtQ29udGVudENoYW5nZUtpbmQiLCAiTm90aWZpY2F0aW9uc1NldHRpbmdzIiwgIk5vdGlmaWNhdGlvbnNQb3NpdGlvbiJdCn0K
