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
import { clearNode, addDisposableListener, EventType, EventHelper, $, isEventLike } from "../../../../base/browser/dom.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { ButtonBar } from "../../../../base/browser/ui/button/button.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { ActionRunner, Separator, toAction } from "../../../../base/common/actions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { dispose, DisposableStore, Disposable } from "../../../../base/common/lifecycle.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { NotificationViewItem, NotificationViewItemContentChangeKind, ChoiceAction, NotificationsSettings, getNotificationsPosition } from "../../../common/notifications.js";
import { ClearNotificationAction, ExpandNotificationAction, CollapseNotificationAction, ConfigureNotificationAction, getNotificationExpandIcon, getNotificationCollapseIcon } from "./notificationsActions.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ProgressBar } from "../../../../base/browser/ui/progressbar/progressbar.js";
import { INotificationService, NotificationsFilter, Severity, isNotificationSource } from "../../../../platform/notification/common/notification.js";
import { isNonEmptyArray } from "../../../../base/common/arrays.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { DropdownMenuActionViewItem } from "../../../../base/browser/ui/dropdown/dropdownActionViewItem.js";
import { DomEmitter } from "../../../../base/browser/event.js";
import { Gesture, EventType as GestureEventType } from "../../../../base/browser/touch.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { defaultButtonStyles, defaultProgressBarStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
const DEFAULT_NOTIFICATION_ROW_HEIGHT = 42;
let notificationRowHeight = DEFAULT_NOTIFICATION_ROW_HEIGHT;
const onDidChangeNotificationRowHeightEmitter = new Emitter();
const onDidChangeNotificationRowHeight = onDidChangeNotificationRowHeightEmitter.event;
function setNotificationRowHeight(height) {
  if (height !== notificationRowHeight) {
    notificationRowHeight = height;
    onDidChangeNotificationRowHeightEmitter.fire(height);
  }
}
const _NotificationsListDelegate = class _NotificationsListDelegate {
  static get ROW_HEIGHT() {
    return notificationRowHeight;
  }
  constructor(container) {
    this.offsetHelper = this.createOffsetHelper(container);
  }
  createOffsetHelper(container) {
    return container.appendChild($(".notification-offset-helper"));
  }
  getHeight(notification) {
    if (!notification.expanded) {
      return _NotificationsListDelegate.ROW_HEIGHT;
    }
    let expandedHeight = _NotificationsListDelegate.ROW_HEIGHT;
    const preferredMessageHeight = this.computePreferredHeight(notification);
    const messageOverflows = _NotificationsListDelegate.LINE_HEIGHT < preferredMessageHeight;
    if (messageOverflows) {
      const overflow = preferredMessageHeight - _NotificationsListDelegate.LINE_HEIGHT;
      expandedHeight += overflow;
    }
    if (notification.source || isNonEmptyArray(notification.actions?.primary)) {
      expandedHeight += _NotificationsListDelegate.ROW_HEIGHT;
    }
    if (expandedHeight === _NotificationsListDelegate.ROW_HEIGHT) {
      notification.collapse(
        true
        /* skip events, no change in height */
      );
    }
    return expandedHeight;
  }
  computePreferredHeight(notification) {
    let actions = 0;
    if (!notification.hasProgress) {
      actions++;
    }
    if (notification.canCollapse) {
      actions++;
    }
    if (isNonEmptyArray(notification.actions?.secondary)) {
      actions++;
    }
    this.offsetHelper.style.width = `${450 - (10 + 30 + actions * 30 - Math.max(actions - 1, 0) * 4)}px`;
    const renderedMessage = NotificationMessageRenderer.render(notification.message);
    this.offsetHelper.appendChild(renderedMessage);
    const preferredHeight = Math.max(this.offsetHelper.offsetHeight, this.offsetHelper.scrollHeight);
    clearNode(this.offsetHelper);
    return preferredHeight;
  }
  getTemplateId(element) {
    if (element instanceof NotificationViewItem) {
      return NotificationRenderer.TEMPLATE_ID;
    }
    throw new Error("unknown element type: " + element);
  }
};
_NotificationsListDelegate.LINE_HEIGHT = 22;
let NotificationsListDelegate = _NotificationsListDelegate;
class NotificationMessageRenderer {
  static render(message, actionHandler) {
    const messageContainer = $("span");
    for (const node of message.linkedText.nodes) {
      if (typeof node === "string") {
        messageContainer.appendChild(document.createTextNode(node));
      } else {
        let title = node.title;
        if (!title && node.href.startsWith("command:")) {
          title = localize("executeCommand", "Click to execute command '{0}'", node.href.substr("command:".length));
        } else if (!title) {
          title = node.href;
        }
        const anchor = $("a", { href: node.href, title, tabIndex: 0 }, node.label);
        if (actionHandler) {
          const handleOpen = (e) => {
            if (isEventLike(e)) {
              EventHelper.stop(e, true);
            }
            actionHandler.callback(node.href);
          };
          const onClick = actionHandler.toDispose.add(new DomEmitter(anchor, EventType.CLICK)).event;
          const onKeydown = actionHandler.toDispose.add(new DomEmitter(anchor, EventType.KEY_DOWN)).event;
          const onSpaceOrEnter = Event.chain(onKeydown, ($2) => $2.filter((e) => {
            const event = new StandardKeyboardEvent(e);
            return event.equals(KeyCode.Space) || event.equals(KeyCode.Enter);
          }));
          actionHandler.toDispose.add(Gesture.addTarget(anchor));
          const onTap = actionHandler.toDispose.add(new DomEmitter(anchor, GestureEventType.Tap)).event;
          Event.any(onClick, onTap, onSpaceOrEnter)(handleOpen, null, actionHandler.toDispose);
        }
        messageContainer.appendChild(anchor);
      }
    }
    return messageContainer;
  }
}
let NotificationRenderer = class {
  constructor(actionRunner, contextMenuService, instantiationService, notificationService) {
    this.actionRunner = actionRunner;
    this.contextMenuService = contextMenuService;
    this.instantiationService = instantiationService;
    this.notificationService = notificationService;
  }
  get templateId() {
    return NotificationRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const data = /* @__PURE__ */ Object.create(null);
    data.toDispose = new DisposableStore();
    data.container = $(".notification-list-item");
    data.mainRow = $(".notification-list-item-main-row");
    data.icon = $(".notification-list-item-icon.codicon");
    data.message = $(".notification-list-item-message");
    const that = this;
    const toolbarContainer = $(".notification-list-item-toolbar-container");
    data.toolbar = new ActionBar(
      toolbarContainer,
      {
        ariaLabel: localize("notificationActions", "Notification Actions"),
        actionViewItemProvider: (action, options) => {
          if (action instanceof ConfigureNotificationAction) {
            return data.toDispose.add(new DropdownMenuActionViewItem(action, {
              getActions() {
                const actions = [];
                const source = { id: action.notification.sourceId, label: action.notification.source };
                if (isNotificationSource(source)) {
                  const isSourceFiltered = that.notificationService.getFilter(source) === NotificationsFilter.ERROR;
                  actions.push(toAction({
                    id: source.id,
                    label: isSourceFiltered ? localize("turnOnNotifications", "Turn On All Notifications from '{0}'", source.label) : localize("turnOffNotifications", "Turn Off Info and Warning Notifications from '{0}'", source.label),
                    run: () => that.notificationService.setFilter({ ...source, filter: isSourceFiltered ? NotificationsFilter.OFF : NotificationsFilter.ERROR })
                  }));
                  if (action.notification.actions?.secondary?.length) {
                    actions.push(new Separator());
                  }
                }
                if (Array.isArray(action.notification.actions?.secondary)) {
                  actions.push(...action.notification.actions.secondary);
                }
                return actions;
              }
            }, this.contextMenuService, {
              ...options,
              actionRunner: this.actionRunner,
              classNames: action.class
            }));
          }
          return void 0;
        },
        actionRunner: this.actionRunner
      }
    );
    data.toDispose.add(data.toolbar);
    data.detailsRow = $(".notification-list-item-details-row");
    data.source = $(".notification-list-item-source");
    data.buttonsContainer = $(".notification-list-item-buttons-container");
    container.appendChild(data.container);
    data.container.appendChild(data.detailsRow);
    data.detailsRow.appendChild(data.source);
    data.detailsRow.appendChild(data.buttonsContainer);
    data.container.appendChild(data.mainRow);
    data.mainRow.appendChild(data.icon);
    data.mainRow.appendChild(data.message);
    data.mainRow.appendChild(toolbarContainer);
    data.progress = new ProgressBar(container, defaultProgressBarStyles);
    data.toDispose.add(data.progress);
    data.renderer = this.instantiationService.createInstance(NotificationTemplateRenderer, data, this.actionRunner);
    data.toDispose.add(data.renderer);
    return data;
  }
  renderElement(notification, index, data) {
    data.renderer.setInput(notification);
  }
  disposeTemplate(templateData) {
    dispose(templateData.toDispose);
  }
};
NotificationRenderer.TEMPLATE_ID = "notification";
NotificationRenderer = __decorateClass([
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, INotificationService)
], NotificationRenderer);
let NotificationTemplateRenderer = class extends Disposable {
  constructor(template, actionRunner, openerService, instantiationService, keybindingService, contextMenuService, hoverService, configurationService) {
    super();
    this.template = template;
    this.actionRunner = actionRunner;
    this.openerService = openerService;
    this.instantiationService = instantiationService;
    this.keybindingService = keybindingService;
    this.contextMenuService = contextMenuService;
    this.hoverService = hoverService;
    this.inputDisposables = this._register(new DisposableStore());
    if (!NotificationTemplateRenderer.closeNotificationAction) {
      NotificationTemplateRenderer.closeNotificationAction = instantiationService.createInstance(ClearNotificationAction, ClearNotificationAction.ID, ClearNotificationAction.LABEL);
      NotificationTemplateRenderer.expandNotificationAction = instantiationService.createInstance(ExpandNotificationAction, ExpandNotificationAction.ID, ExpandNotificationAction.LABEL);
      NotificationTemplateRenderer.collapseNotificationAction = instantiationService.createInstance(CollapseNotificationAction, CollapseNotificationAction.ID, CollapseNotificationAction.LABEL);
      NotificationTemplateRenderer.updateExpandCollapseIcons(configurationService);
    }
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(NotificationsSettings.NOTIFICATIONS_POSITION)) {
        NotificationTemplateRenderer.updateExpandCollapseIcons(configurationService);
      }
    }));
  }
  static updateExpandCollapseIcons(configurationService) {
    if (!NotificationTemplateRenderer.expandNotificationAction) {
      return;
    }
    const position = getNotificationsPosition(configurationService);
    NotificationTemplateRenderer.expandNotificationAction.class = ThemeIcon.asClassName(getNotificationExpandIcon(position));
    NotificationTemplateRenderer.collapseNotificationAction.class = ThemeIcon.asClassName(getNotificationCollapseIcon(position));
  }
  setInput(notification) {
    this.inputDisposables.clear();
    this.render(notification);
  }
  render(notification) {
    this.template.container.classList.toggle("expanded", notification.expanded);
    this.inputDisposables.add(addDisposableListener(this.template.container, EventType.MOUSE_UP, (e) => {
      if (e.button === 1) {
        EventHelper.stop(e, true);
      }
    }));
    this.inputDisposables.add(addDisposableListener(this.template.container, EventType.AUXCLICK, (e) => {
      if (!notification.hasProgress && e.button === 1) {
        EventHelper.stop(e, true);
        notification.close();
      }
    }));
    this.renderSeverity(notification);
    const messageCustomHover = this.inputDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.template.message, ""));
    const messageOverflows = this.renderMessage(notification, messageCustomHover);
    this.renderSecondaryActions(notification, messageOverflows);
    const sourceCustomHover = this.inputDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.template.source, ""));
    this.renderSource(notification, sourceCustomHover);
    this.renderButtons(notification);
    this.renderProgress(notification);
    this.inputDisposables.add(notification.onDidChangeContent((event) => {
      switch (event.kind) {
        case NotificationViewItemContentChangeKind.SEVERITY:
          this.renderSeverity(notification);
          break;
        case NotificationViewItemContentChangeKind.PROGRESS:
          this.renderProgress(notification);
          break;
        case NotificationViewItemContentChangeKind.MESSAGE:
          this.renderMessage(notification, messageCustomHover);
          break;
      }
    }));
  }
  renderSeverity(notification) {
    NotificationTemplateRenderer.SEVERITIES.forEach((severity) => {
      if (notification.severity !== severity) {
        this.template.icon.classList.remove(...ThemeIcon.asClassNameArray(this.toSeverityIcon(severity)));
      }
    });
    this.template.icon.classList.add(...ThemeIcon.asClassNameArray(this.toSeverityIcon(notification.severity)));
  }
  renderMessage(notification, customHover) {
    clearNode(this.template.message);
    this.template.message.appendChild(NotificationMessageRenderer.render(notification.message, {
      callback: (link) => this.openerService.open(URI.parse(link), { allowCommands: true }),
      toDispose: this.inputDisposables
    }));
    const messageOverflows = notification.canCollapse && !notification.expanded && this.template.message.scrollWidth > this.template.message.clientWidth;
    customHover.update(messageOverflows ? this.template.message.textContent + "" : "");
    return messageOverflows;
  }
  renderSecondaryActions(notification, messageOverflows) {
    const actions = [];
    if (isNonEmptyArray(notification.actions?.secondary)) {
      const configureNotificationAction = this.instantiationService.createInstance(ConfigureNotificationAction, ConfigureNotificationAction.ID, ConfigureNotificationAction.LABEL, notification);
      actions.push(configureNotificationAction);
      this.inputDisposables.add(configureNotificationAction);
    }
    let showExpandCollapseAction = false;
    if (notification.canCollapse) {
      if (notification.expanded) {
        showExpandCollapseAction = true;
      } else if (notification.source) {
        showExpandCollapseAction = true;
      } else if (messageOverflows) {
        showExpandCollapseAction = true;
      }
    }
    if (showExpandCollapseAction) {
      actions.push(notification.expanded ? NotificationTemplateRenderer.collapseNotificationAction : NotificationTemplateRenderer.expandNotificationAction);
    }
    if (!notification.hasProgress) {
      actions.push(NotificationTemplateRenderer.closeNotificationAction);
    }
    this.template.toolbar.clear();
    this.template.toolbar.context = notification;
    actions.forEach((action) => this.template.toolbar.push(action, { icon: true, label: false, keybinding: this.getKeybindingLabel(action) }));
  }
  renderSource(notification, sourceCustomHover) {
    if (notification.expanded && notification.source) {
      this.template.source.textContent = localize("notificationSource", "Source: {0}", notification.source);
      sourceCustomHover.update(notification.source);
    } else {
      this.template.source.textContent = "";
      sourceCustomHover.update("");
    }
  }
  renderButtons(notification) {
    clearNode(this.template.buttonsContainer);
    const primaryActions = notification.actions ? notification.actions.primary : void 0;
    if (notification.expanded && isNonEmptyArray(primaryActions)) {
      const that = this;
      const actionRunner = this.inputDisposables.add(new class extends ActionRunner {
        async runAction(action) {
          that.actionRunner.run(action, notification);
          if (!(action instanceof ChoiceAction) || !action.keepOpen) {
            notification.close();
          }
        }
      }());
      const buttonToolbar = this.inputDisposables.add(new ButtonBar(this.template.buttonsContainer));
      for (let i = 0; i < primaryActions.length; i++) {
        const action = primaryActions[i];
        const options = {
          title: true,
          // assign titles to buttons in case they overflow
          secondary: i > 0,
          ...defaultButtonStyles
        };
        const dropdownActions = action instanceof ChoiceAction ? action.menu : void 0;
        const button = this.inputDisposables.add(
          dropdownActions ? buttonToolbar.addButtonWithDropdown({
            ...options,
            contextMenuProvider: this.contextMenuService,
            actions: dropdownActions,
            actionRunner
          }) : buttonToolbar.addButton(options)
        );
        button.label = action.label;
        this.inputDisposables.add(button.onDidClick((e) => {
          if (e) {
            EventHelper.stop(e, true);
          }
          actionRunner.run(action);
        }));
      }
    }
  }
  renderProgress(notification) {
    if (!notification.hasProgress) {
      this.template.progress.stop().hide();
      return;
    }
    const state = notification.progress.state;
    if (state.infinite) {
      this.template.progress.infinite().show();
    } else if (typeof state.total === "number" || typeof state.worked === "number") {
      if (typeof state.total === "number" && !this.template.progress.hasTotal()) {
        this.template.progress.total(state.total);
      }
      if (typeof state.worked === "number") {
        this.template.progress.setWorked(state.worked).show();
      }
    } else {
      this.template.progress.done().hide();
    }
  }
  toSeverityIcon(severity) {
    switch (severity) {
      case Severity.Warning:
        return Codicon.warning;
      case Severity.Error:
        return Codicon.error;
    }
    return Codicon.info;
  }
  getKeybindingLabel(action) {
    const keybinding = this.keybindingService.lookupKeybinding(action.id);
    return keybinding ? keybinding.getLabel() : null;
  }
};
NotificationTemplateRenderer.SEVERITIES = [Severity.Info, Severity.Warning, Severity.Error];
NotificationTemplateRenderer = __decorateClass([
  __decorateParam(2, IOpenerService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, IHoverService),
  __decorateParam(7, IConfigurationService)
], NotificationTemplateRenderer);
export {
  DEFAULT_NOTIFICATION_ROW_HEIGHT,
  NotificationRenderer,
  NotificationTemplateRenderer,
  NotificationsListDelegate,
  onDidChangeNotificationRowHeight,
  setNotificationRowHeight
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxub3RpZmljYXRpb25zXFxub3RpZmljYXRpb25zVmlld2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUxpc3RWaXJ0dWFsRGVsZWdhdGUsIElMaXN0UmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IGNsZWFyTm9kZSwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBFdmVudFR5cGUsIEV2ZW50SGVscGVyLCAkLCBpc0V2ZW50TGlrZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQnV0dG9uQmFyLCBJQnV0dG9uT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IEFjdGlvblJ1bm5lciwgSUFjdGlvbiwgSUFjdGlvblJ1bm5lciwgU2VwYXJhdG9yLCB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBkaXNwb3NlLCBEaXNwb3NhYmxlU3RvcmUsIERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblZpZXdJdGVtLCBOb3RpZmljYXRpb25WaWV3SXRlbSwgTm90aWZpY2F0aW9uVmlld0l0ZW1Db250ZW50Q2hhbmdlS2luZCwgSU5vdGlmaWNhdGlvbk1lc3NhZ2UsIENob2ljZUFjdGlvbiwgTm90aWZpY2F0aW9uc1NldHRpbmdzLCBnZXROb3RpZmljYXRpb25zUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90aWZpY2F0aW9ucy5qcyc7XG5pbXBvcnQgeyBDbGVhck5vdGlmaWNhdGlvbkFjdGlvbiwgRXhwYW5kTm90aWZpY2F0aW9uQWN0aW9uLCBDb2xsYXBzZU5vdGlmaWNhdGlvbkFjdGlvbiwgQ29uZmlndXJlTm90aWZpY2F0aW9uQWN0aW9uLCBnZXROb3RpZmljYXRpb25FeHBhbmRJY29uLCBnZXROb3RpZmljYXRpb25Db2xsYXBzZUljb24gfSBmcm9tICcuL25vdGlmaWNhdGlvbnNBY3Rpb25zLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgUHJvZ3Jlc3NCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvcHJvZ3Jlc3NiYXIvcHJvZ3Jlc3NiYXIuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIE5vdGlmaWNhdGlvbnNGaWx0ZXIsIFNldmVyaXR5LCBpc05vdGlmaWNhdGlvblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IGlzTm9uRW1wdHlBcnJheSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IERyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2Ryb3Bkb3duL2Ryb3Bkb3duQWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgRG9tRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9ldmVudC5qcyc7XG5pbXBvcnQgeyBHZXN0dXJlLCBFdmVudFR5cGUgYXMgR2VzdHVyZUV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90b3VjaC5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGRlZmF1bHRCdXR0b25TdHlsZXMsIGRlZmF1bHRQcm9ncmVzc0JhclN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHR5cGUgeyBJTWFuYWdlZEhvdmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuXG4vKiogRGVmYXVsdCBoZWlnaHQgKHB4KSBvZiBhIHNpbmdsZSBub3RpZmljYXRpb24gcm93LiAqL1xuZXhwb3J0IGNvbnN0IERFRkFVTFRfTk9USUZJQ0FUSU9OX1JPV19IRUlHSFQgPSA0MjtcblxuLyoqIEN1cnJlbnQgaGVpZ2h0IChweCkgb2YgYSBzaW5nbGUgbm90aWZpY2F0aW9uIHJvdzsgb3ZlcnJpZGFibGUgdmlhIHtAbGluayBzZXROb3RpZmljYXRpb25Sb3dIZWlnaHR9LiAqL1xubGV0IG5vdGlmaWNhdGlvblJvd0hlaWdodCA9IERFRkFVTFRfTk9USUZJQ0FUSU9OX1JPV19IRUlHSFQ7XG5jb25zdCBvbkRpZENoYW5nZU5vdGlmaWNhdGlvblJvd0hlaWdodEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxudW1iZXI+KCk7XG5leHBvcnQgY29uc3Qgb25EaWRDaGFuZ2VOb3RpZmljYXRpb25Sb3dIZWlnaHQgPSBvbkRpZENoYW5nZU5vdGlmaWNhdGlvblJvd0hlaWdodEVtaXR0ZXIuZXZlbnQ7XG5cbi8qKlxuICogT3ZlcnJpZGVzIHRoZSBoZWlnaHQgKHB4KSBvZiBhIHNpbmdsZSBub3RpZmljYXRpb24gcm93LiBVc2VkIGJ5IHRoZSBNb2Rlcm4gVUlcbiAqIHN0eWxlLW92ZXJyaWRlIGV4cGVyaW1lbnQgdG8gc2hyaW5rIHRoZSBjb2xsYXBzZWQgbm90aWZpY2F0aW9uIGNhcmQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXROb3RpZmljYXRpb25Sb3dIZWlnaHQoaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0aWYgKGhlaWdodCAhPT0gbm90aWZpY2F0aW9uUm93SGVpZ2h0KSB7XG5cdFx0bm90aWZpY2F0aW9uUm93SGVpZ2h0ID0gaGVpZ2h0O1xuXHRcdG9uRGlkQ2hhbmdlTm90aWZpY2F0aW9uUm93SGVpZ2h0RW1pdHRlci5maXJlKGhlaWdodCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5vdGlmaWNhdGlvbnNMaXN0RGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxJTm90aWZpY2F0aW9uVmlld0l0ZW0+IHtcblxuXHRwcml2YXRlIHN0YXRpYyBnZXQgUk9XX0hFSUdIVCgpOiBudW1iZXIgeyByZXR1cm4gbm90aWZpY2F0aW9uUm93SGVpZ2h0OyB9XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IExJTkVfSEVJR0hUID0gMjI7XG5cblx0cHJpdmF0ZSBvZmZzZXRIZWxwZXI6IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcblx0XHR0aGlzLm9mZnNldEhlbHBlciA9IHRoaXMuY3JlYXRlT2Zmc2V0SGVscGVyKGNvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU9mZnNldEhlbHBlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiBjb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnLm5vdGlmaWNhdGlvbi1vZmZzZXQtaGVscGVyJykpO1xuXHR9XG5cblx0Z2V0SGVpZ2h0KG5vdGlmaWNhdGlvbjogSU5vdGlmaWNhdGlvblZpZXdJdGVtKTogbnVtYmVyIHtcblx0XHRpZiAoIW5vdGlmaWNhdGlvbi5leHBhbmRlZCkge1xuXHRcdFx0cmV0dXJuIE5vdGlmaWNhdGlvbnNMaXN0RGVsZWdhdGUuUk9XX0hFSUdIVDsgLy8gcmV0dXJuIGVhcmx5IGlmIHRoZXJlIGFyZSBubyBtb3JlIHJvd3MgdG8gc2hvd1xuXHRcdH1cblxuXHRcdC8vIEZpcnN0IHJvdzogbWVzc2FnZSBhbmQgYWN0aW9uc1xuXHRcdGxldCBleHBhbmRlZEhlaWdodCA9IE5vdGlmaWNhdGlvbnNMaXN0RGVsZWdhdGUuUk9XX0hFSUdIVDtcblxuXHRcdC8vIER5bmFtaWMgaGVpZ2h0OiBpZiBtZXNzYWdlIG92ZXJmbG93c1xuXHRcdGNvbnN0IHByZWZlcnJlZE1lc3NhZ2VIZWlnaHQgPSB0aGlzLmNvbXB1dGVQcmVmZXJyZWRIZWlnaHQobm90aWZpY2F0aW9uKTtcblx0XHRjb25zdCBtZXNzYWdlT3ZlcmZsb3dzID0gTm90aWZpY2F0aW9uc0xpc3REZWxlZ2F0ZS5MSU5FX0hFSUdIVCA8IHByZWZlcnJlZE1lc3NhZ2VIZWlnaHQ7XG5cdFx0aWYgKG1lc3NhZ2VPdmVyZmxvd3MpIHtcblx0XHRcdGNvbnN0IG92ZXJmbG93ID0gcHJlZmVycmVkTWVzc2FnZUhlaWdodCAtIE5vdGlmaWNhdGlvbnNMaXN0RGVsZWdhdGUuTElORV9IRUlHSFQ7XG5cdFx0XHRleHBhbmRlZEhlaWdodCArPSBvdmVyZmxvdztcblx0XHR9XG5cblx0XHQvLyBMYXN0IHJvdzogc291cmNlIGFuZCBidXR0b25zIGlmIHdlIGhhdmUgYW55XG5cdFx0aWYgKG5vdGlmaWNhdGlvbi5zb3VyY2UgfHwgaXNOb25FbXB0eUFycmF5KG5vdGlmaWNhdGlvbi5hY3Rpb25zPy5wcmltYXJ5KSkge1xuXHRcdFx0ZXhwYW5kZWRIZWlnaHQgKz0gTm90aWZpY2F0aW9uc0xpc3REZWxlZ2F0ZS5ST1dfSEVJR0hUO1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZSBleHBhbmRlZCBoZWlnaHQgaXMgc2FtZSBhcyBjb2xsYXBzZWQsIHVuc2V0IHRoZSBleHBhbmRlZCBzdGF0ZVxuXHRcdC8vIGJ1dCBza2lwIGV2ZW50cyBiZWNhdXNlIHRoZXJlIGlzIG5vIGNoYW5nZSB0aGF0IGhhcyB2aXN1YWwgaW1wYWN0XG5cdFx0aWYgKGV4cGFuZGVkSGVpZ2h0ID09PSBOb3RpZmljYXRpb25zTGlzdERlbGVnYXRlLlJPV19IRUlHSFQpIHtcblx0XHRcdG5vdGlmaWNhdGlvbi5jb2xsYXBzZSh0cnVlIC8qIHNraXAgZXZlbnRzLCBubyBjaGFuZ2UgaW4gaGVpZ2h0ICovKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZXhwYW5kZWRIZWlnaHQ7XG5cdH1cblxuXHRwcml2YXRlIGNvbXB1dGVQcmVmZXJyZWRIZWlnaHQobm90aWZpY2F0aW9uOiBJTm90aWZpY2F0aW9uVmlld0l0ZW0pOiBudW1iZXIge1xuXG5cdFx0Ly8gUHJlcGFyZSBvZmZzZXQgaGVscGVyIGRlcGVuZGluZyBvbiB0b29sYmFyIGFjdGlvbnMgY291bnRcblx0XHRsZXQgYWN0aW9ucyA9IDA7XG5cdFx0aWYgKCFub3RpZmljYXRpb24uaGFzUHJvZ3Jlc3MpIHtcblx0XHRcdGFjdGlvbnMrKzsgLy8gY2xvc2Vcblx0XHR9XG5cdFx0aWYgKG5vdGlmaWNhdGlvbi5jYW5Db2xsYXBzZSkge1xuXHRcdFx0YWN0aW9ucysrOyAvLyBleHBhbmQvY29sbGFwc2Vcblx0XHR9XG5cdFx0aWYgKGlzTm9uRW1wdHlBcnJheShub3RpZmljYXRpb24uYWN0aW9ucz8uc2Vjb25kYXJ5KSkge1xuXHRcdFx0YWN0aW9ucysrOyAvLyBzZWNvbmRhcnkgYWN0aW9uc1xuXHRcdH1cblx0XHR0aGlzLm9mZnNldEhlbHBlci5zdHlsZS53aWR0aCA9IGAkezQ1MCAvKiBub3RpZmljYXRpb25zIGNvbnRhaW5lciB3aWR0aCAqLyAtICgxMCAvKiBwYWRkaW5nICovICsgMzAgLyogc2V2ZXJpdHkgaWNvbiAqLyArIChhY3Rpb25zICogMzApIC8qIGFjdGlvbnMgKi8gLSAoTWF0aC5tYXgoYWN0aW9ucyAtIDEsIDApICogNCkgLyogbGVzcyBwYWRkaW5nIGZvciBhY3Rpb25zID4gMSAqLyl9cHhgO1xuXG5cdFx0Ly8gUmVuZGVyIG1lc3NhZ2UgaW50byBvZmZzZXQgaGVscGVyXG5cdFx0Y29uc3QgcmVuZGVyZWRNZXNzYWdlID0gTm90aWZpY2F0aW9uTWVzc2FnZVJlbmRlcmVyLnJlbmRlcihub3RpZmljYXRpb24ubWVzc2FnZSk7XG5cdFx0dGhpcy5vZmZzZXRIZWxwZXIuYXBwZW5kQ2hpbGQocmVuZGVyZWRNZXNzYWdlKTtcblxuXHRcdC8vIENvbXB1dGUgaGVpZ2h0XG5cdFx0Y29uc3QgcHJlZmVycmVkSGVpZ2h0ID0gTWF0aC5tYXgodGhpcy5vZmZzZXRIZWxwZXIub2Zmc2V0SGVpZ2h0LCB0aGlzLm9mZnNldEhlbHBlci5zY3JvbGxIZWlnaHQpO1xuXG5cdFx0Ly8gQWx3YXlzIGNsZWFyIG9mZnNldCBoZWxwZXIgYWZ0ZXIgdXNlXG5cdFx0Y2xlYXJOb2RlKHRoaXMub2Zmc2V0SGVscGVyKTtcblxuXHRcdHJldHVybiBwcmVmZXJyZWRIZWlnaHQ7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKGVsZW1lbnQ6IElOb3RpZmljYXRpb25WaWV3SXRlbSk6IHN0cmluZyB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBOb3RpZmljYXRpb25WaWV3SXRlbSkge1xuXHRcdFx0cmV0dXJuIE5vdGlmaWNhdGlvblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHRcdH1cblxuXHRcdHRocm93IG5ldyBFcnJvcigndW5rbm93biBlbGVtZW50IHR5cGU6ICcgKyBlbGVtZW50KTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElOb3RpZmljYXRpb25UZW1wbGF0ZURhdGEge1xuXHRjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHR0b0Rpc3Bvc2U6IERpc3Bvc2FibGVTdG9yZTtcblxuXHRtYWluUm93OiBIVE1MRWxlbWVudDtcblx0aWNvbjogSFRNTEVsZW1lbnQ7XG5cdG1lc3NhZ2U6IEhUTUxFbGVtZW50O1xuXHR0b29sYmFyOiBBY3Rpb25CYXI7XG5cblx0ZGV0YWlsc1JvdzogSFRNTEVsZW1lbnQ7XG5cdHNvdXJjZTogSFRNTEVsZW1lbnQ7XG5cdGJ1dHRvbnNDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcm9ncmVzczogUHJvZ3Jlc3NCYXI7XG5cblx0cmVuZGVyZXI6IE5vdGlmaWNhdGlvblRlbXBsYXRlUmVuZGVyZXI7XG59XG5cbmludGVyZmFjZSBJTWVzc2FnZUFjdGlvbkhhbmRsZXIge1xuXHRyZWFkb25seSB0b0Rpc3Bvc2U6IERpc3Bvc2FibGVTdG9yZTtcblxuXHRjYWxsYmFjazogKGhyZWY6IHN0cmluZykgPT4gdm9pZDtcbn1cblxuY2xhc3MgTm90aWZpY2F0aW9uTWVzc2FnZVJlbmRlcmVyIHtcblxuXHRzdGF0aWMgcmVuZGVyKG1lc3NhZ2U6IElOb3RpZmljYXRpb25NZXNzYWdlLCBhY3Rpb25IYW5kbGVyPzogSU1lc3NhZ2VBY3Rpb25IYW5kbGVyKTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IG1lc3NhZ2VDb250YWluZXIgPSAkKCdzcGFuJyk7XG5cblx0XHRmb3IgKGNvbnN0IG5vZGUgb2YgbWVzc2FnZS5saW5rZWRUZXh0Lm5vZGVzKSB7XG5cdFx0XHRpZiAodHlwZW9mIG5vZGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdG1lc3NhZ2VDb250YWluZXIuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUobm9kZSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGV0IHRpdGxlID0gbm9kZS50aXRsZTtcblxuXHRcdFx0XHRpZiAoIXRpdGxlICYmIG5vZGUuaHJlZi5zdGFydHNXaXRoKCdjb21tYW5kOicpKSB7XG5cdFx0XHRcdFx0dGl0bGUgPSBsb2NhbGl6ZSgnZXhlY3V0ZUNvbW1hbmQnLCBcIkNsaWNrIHRvIGV4ZWN1dGUgY29tbWFuZCAnezB9J1wiLCBub2RlLmhyZWYuc3Vic3RyKCdjb21tYW5kOicubGVuZ3RoKSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoIXRpdGxlKSB7XG5cdFx0XHRcdFx0dGl0bGUgPSBub2RlLmhyZWY7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBhbmNob3IgPSAkKCdhJywgeyBocmVmOiBub2RlLmhyZWYsIHRpdGxlLCB0YWJJbmRleDogMCB9LCBub2RlLmxhYmVsKTtcblxuXHRcdFx0XHRpZiAoYWN0aW9uSGFuZGxlcikge1xuXHRcdFx0XHRcdGNvbnN0IGhhbmRsZU9wZW4gPSAoZTogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGlzRXZlbnRMaWtlKGUpKSB7XG5cdFx0XHRcdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGFjdGlvbkhhbmRsZXIuY2FsbGJhY2sobm9kZS5ocmVmKTtcblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0Y29uc3Qgb25DbGljayA9IGFjdGlvbkhhbmRsZXIudG9EaXNwb3NlLmFkZChuZXcgRG9tRW1pdHRlcihhbmNob3IsIEV2ZW50VHlwZS5DTElDSykpLmV2ZW50O1xuXG5cdFx0XHRcdFx0Y29uc3Qgb25LZXlkb3duID0gYWN0aW9uSGFuZGxlci50b0Rpc3Bvc2UuYWRkKG5ldyBEb21FbWl0dGVyKGFuY2hvciwgRXZlbnRUeXBlLktFWV9ET1dOKSkuZXZlbnQ7XG5cdFx0XHRcdFx0Y29uc3Qgb25TcGFjZU9yRW50ZXIgPSBFdmVudC5jaGFpbihvbktleWRvd24sICQgPT4gJC5maWx0ZXIoZSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cblx0XHRcdFx0XHRcdHJldHVybiBldmVudC5lcXVhbHMoS2V5Q29kZS5TcGFjZSkgfHwgZXZlbnQuZXF1YWxzKEtleUNvZGUuRW50ZXIpO1xuXHRcdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRcdGFjdGlvbkhhbmRsZXIudG9EaXNwb3NlLmFkZChHZXN0dXJlLmFkZFRhcmdldChhbmNob3IpKTtcblx0XHRcdFx0XHRjb25zdCBvblRhcCA9IGFjdGlvbkhhbmRsZXIudG9EaXNwb3NlLmFkZChuZXcgRG9tRW1pdHRlcihhbmNob3IsIEdlc3R1cmVFdmVudFR5cGUuVGFwKSkuZXZlbnQ7XG5cblx0XHRcdFx0XHRFdmVudC5hbnkob25DbGljaywgb25UYXAsIG9uU3BhY2VPckVudGVyKShoYW5kbGVPcGVuLCBudWxsLCBhY3Rpb25IYW5kbGVyLnRvRGlzcG9zZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRtZXNzYWdlQ29udGFpbmVyLmFwcGVuZENoaWxkKGFuY2hvcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1lc3NhZ2VDb250YWluZXI7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5vdGlmaWNhdGlvblJlbmRlcmVyIGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxJTm90aWZpY2F0aW9uVmlld0l0ZW0sIElOb3RpZmljYXRpb25UZW1wbGF0ZURhdGE+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnbm90aWZpY2F0aW9uJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIGFjdGlvblJ1bm5lcjogSUFjdGlvblJ1bm5lcixcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZVxuXHQpIHtcblx0fVxuXG5cdGdldCB0ZW1wbGF0ZUlkKCkge1xuXHRcdHJldHVybiBOb3RpZmljYXRpb25SZW5kZXJlci5URU1QTEFURV9JRDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJTm90aWZpY2F0aW9uVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBkYXRhOiBJTm90aWZpY2F0aW9uVGVtcGxhdGVEYXRhID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRkYXRhLnRvRGlzcG9zZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdC8vIENvbnRhaW5lclxuXHRcdGRhdGEuY29udGFpbmVyID0gJCgnLm5vdGlmaWNhdGlvbi1saXN0LWl0ZW0nKTtcblxuXHRcdC8vIE1haW4gUm93XG5cdFx0ZGF0YS5tYWluUm93ID0gJCgnLm5vdGlmaWNhdGlvbi1saXN0LWl0ZW0tbWFpbi1yb3cnKTtcblxuXHRcdC8vIEljb25cblx0XHRkYXRhLmljb24gPSAkKCcubm90aWZpY2F0aW9uLWxpc3QtaXRlbS1pY29uLmNvZGljb24nKTtcblxuXHRcdC8vIE1lc3NhZ2Vcblx0XHRkYXRhLm1lc3NhZ2UgPSAkKCcubm90aWZpY2F0aW9uLWxpc3QtaXRlbS1tZXNzYWdlJyk7XG5cblx0XHQvLyBUb29sYmFyXG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0Y29uc3QgdG9vbGJhckNvbnRhaW5lciA9ICQoJy5ub3RpZmljYXRpb24tbGlzdC1pdGVtLXRvb2xiYXItY29udGFpbmVyJyk7XG5cdFx0ZGF0YS50b29sYmFyID0gbmV3IEFjdGlvbkJhcihcblx0XHRcdHRvb2xiYXJDb250YWluZXIsXG5cdFx0XHR7XG5cdFx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ25vdGlmaWNhdGlvbkFjdGlvbnMnLCBcIk5vdGlmaWNhdGlvbiBBY3Rpb25zXCIpLFxuXHRcdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIENvbmZpZ3VyZU5vdGlmaWNhdGlvbkFjdGlvbikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGRhdGEudG9EaXNwb3NlLmFkZChuZXcgRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0oYWN0aW9uLCB7XG5cdFx0XHRcdFx0XHRcdGdldEFjdGlvbnMoKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cblx0XHRcdFx0XHRcdFx0XHRjb25zdCBzb3VyY2UgPSB7IGlkOiBhY3Rpb24ubm90aWZpY2F0aW9uLnNvdXJjZUlkLCBsYWJlbDogYWN0aW9uLm5vdGlmaWNhdGlvbi5zb3VyY2UgfTtcblx0XHRcdFx0XHRcdFx0XHRpZiAoaXNOb3RpZmljYXRpb25Tb3VyY2Uoc291cmNlKSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgaXNTb3VyY2VGaWx0ZXJlZCA9IHRoYXQubm90aWZpY2F0aW9uU2VydmljZS5nZXRGaWx0ZXIoc291cmNlKSA9PT0gTm90aWZpY2F0aW9uc0ZpbHRlci5FUlJPUjtcblx0XHRcdFx0XHRcdFx0XHRcdGFjdGlvbnMucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGlkOiBzb3VyY2UuaWQsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBpc1NvdXJjZUZpbHRlcmVkID8gbG9jYWxpemUoJ3R1cm5Pbk5vdGlmaWNhdGlvbnMnLCBcIlR1cm4gT24gQWxsIE5vdGlmaWNhdGlvbnMgZnJvbSAnezB9J1wiLCBzb3VyY2UubGFiZWwpIDogbG9jYWxpemUoJ3R1cm5PZmZOb3RpZmljYXRpb25zJywgXCJUdXJuIE9mZiBJbmZvIGFuZCBXYXJuaW5nIE5vdGlmaWNhdGlvbnMgZnJvbSAnezB9J1wiLCBzb3VyY2UubGFiZWwpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRydW46ICgpID0+IHRoYXQubm90aWZpY2F0aW9uU2VydmljZS5zZXRGaWx0ZXIoeyAuLi5zb3VyY2UsIGZpbHRlcjogaXNTb3VyY2VGaWx0ZXJlZCA/IE5vdGlmaWNhdGlvbnNGaWx0ZXIuT0ZGIDogTm90aWZpY2F0aW9uc0ZpbHRlci5FUlJPUiB9KVxuXHRcdFx0XHRcdFx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAoYWN0aW9uLm5vdGlmaWNhdGlvbi5hY3Rpb25zPy5zZWNvbmRhcnk/Lmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRhY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShhY3Rpb24ubm90aWZpY2F0aW9uLmFjdGlvbnM/LnNlY29uZGFyeSkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGFjdGlvbnMucHVzaCguLi5hY3Rpb24ubm90aWZpY2F0aW9uLmFjdGlvbnMuc2Vjb25kYXJ5KTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gYWN0aW9ucztcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0sIHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLCB7XG5cdFx0XHRcdFx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRcdFx0XHRcdGFjdGlvblJ1bm5lcjogdGhpcy5hY3Rpb25SdW5uZXIsXG5cdFx0XHRcdFx0XHRcdGNsYXNzTmFtZXM6IGFjdGlvbi5jbGFzc1xuXHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFjdGlvblJ1bm5lcjogdGhpcy5hY3Rpb25SdW5uZXJcblx0XHRcdH1cblx0XHQpO1xuXHRcdGRhdGEudG9EaXNwb3NlLmFkZChkYXRhLnRvb2xiYXIpO1xuXG5cdFx0Ly8gRGV0YWlscyBSb3dcblx0XHRkYXRhLmRldGFpbHNSb3cgPSAkKCcubm90aWZpY2F0aW9uLWxpc3QtaXRlbS1kZXRhaWxzLXJvdycpO1xuXG5cdFx0Ly8gU291cmNlXG5cdFx0ZGF0YS5zb3VyY2UgPSAkKCcubm90aWZpY2F0aW9uLWxpc3QtaXRlbS1zb3VyY2UnKTtcblxuXHRcdC8vIEJ1dHRvbnMgQ29udGFpbmVyXG5cdFx0ZGF0YS5idXR0b25zQ29udGFpbmVyID0gJCgnLm5vdGlmaWNhdGlvbi1saXN0LWl0ZW0tYnV0dG9ucy1jb250YWluZXInKTtcblxuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChkYXRhLmNvbnRhaW5lcik7XG5cblx0XHQvLyB0aGUgZGV0YWlscyByb3cgYXBwZWFycyBmaXJzdCBpbiBvcmRlciBmb3IgYmV0dGVyIGtleWJvYXJkIGFjY2VzcyB0byBub3RpZmljYXRpb24gYnV0dG9uc1xuXHRcdGRhdGEuY29udGFpbmVyLmFwcGVuZENoaWxkKGRhdGEuZGV0YWlsc1Jvdyk7XG5cdFx0ZGF0YS5kZXRhaWxzUm93LmFwcGVuZENoaWxkKGRhdGEuc291cmNlKTtcblx0XHRkYXRhLmRldGFpbHNSb3cuYXBwZW5kQ2hpbGQoZGF0YS5idXR0b25zQ29udGFpbmVyKTtcblxuXHRcdC8vIG1haW4gcm93XG5cdFx0ZGF0YS5jb250YWluZXIuYXBwZW5kQ2hpbGQoZGF0YS5tYWluUm93KTtcblx0XHRkYXRhLm1haW5Sb3cuYXBwZW5kQ2hpbGQoZGF0YS5pY29uKTtcblx0XHRkYXRhLm1haW5Sb3cuYXBwZW5kQ2hpbGQoZGF0YS5tZXNzYWdlKTtcblx0XHRkYXRhLm1haW5Sb3cuYXBwZW5kQ2hpbGQodG9vbGJhckNvbnRhaW5lcik7XG5cblx0XHQvLyBQcm9ncmVzczogYmVsb3cgdGhlIHJvd3MgdG8gc3BhbiB0aGUgZW50aXJlIHdpZHRoIG9mIHRoZSBpdGVtXG5cdFx0ZGF0YS5wcm9ncmVzcyA9IG5ldyBQcm9ncmVzc0Jhcihjb250YWluZXIsIGRlZmF1bHRQcm9ncmVzc0JhclN0eWxlcyk7XG5cdFx0ZGF0YS50b0Rpc3Bvc2UuYWRkKGRhdGEucHJvZ3Jlc3MpO1xuXG5cdFx0Ly8gUmVuZGVyZXJcblx0XHRkYXRhLnJlbmRlcmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RpZmljYXRpb25UZW1wbGF0ZVJlbmRlcmVyLCBkYXRhLCB0aGlzLmFjdGlvblJ1bm5lcik7XG5cdFx0ZGF0YS50b0Rpc3Bvc2UuYWRkKGRhdGEucmVuZGVyZXIpO1xuXG5cdFx0cmV0dXJuIGRhdGE7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vdGlmaWNhdGlvbjogSU5vdGlmaWNhdGlvblZpZXdJdGVtLCBpbmRleDogbnVtYmVyLCBkYXRhOiBJTm90aWZpY2F0aW9uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0ZGF0YS5yZW5kZXJlci5zZXRJbnB1dChub3RpZmljYXRpb24pO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSU5vdGlmaWNhdGlvblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGRpc3Bvc2UodGVtcGxhdGVEYXRhLnRvRGlzcG9zZSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5vdGlmaWNhdGlvblRlbXBsYXRlUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHN0YXRpYyBjbG9zZU5vdGlmaWNhdGlvbkFjdGlvbjogQ2xlYXJOb3RpZmljYXRpb25BY3Rpb247XG5cdHByaXZhdGUgc3RhdGljIGV4cGFuZE5vdGlmaWNhdGlvbkFjdGlvbjogRXhwYW5kTm90aWZpY2F0aW9uQWN0aW9uO1xuXHRwcml2YXRlIHN0YXRpYyBjb2xsYXBzZU5vdGlmaWNhdGlvbkFjdGlvbjogQ29sbGFwc2VOb3RpZmljYXRpb25BY3Rpb247XG5cblx0cHJpdmF0ZSBzdGF0aWMgdXBkYXRlRXhwYW5kQ29sbGFwc2VJY29ucyhjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTogdm9pZCB7XG5cdFx0aWYgKCFOb3RpZmljYXRpb25UZW1wbGF0ZVJlbmRlcmVyLmV4cGFuZE5vdGlmaWNhdGlvbkFjdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBvc2l0aW9uID0gZ2V0Tm90aWZpY2F0aW9uc1Bvc2l0aW9uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHROb3RpZmljYXRpb25UZW1wbGF0ZVJlbmRlcmVyLmV4cGFuZE5vdGlmaWNhdGlvbkFjdGlvbi5jbGFzcyA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShnZXROb3RpZmljYXRpb25FeHBhbmRJY29uKHBvc2l0aW9uKSk7XG5cdFx0Tm90aWZpY2F0aW9uVGVtcGxhdGVSZW5kZXJlci5jb2xsYXBzZU5vdGlmaWNhdGlvbkFjdGlvbi5jbGFzcyA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShnZXROb3RpZmljYXRpb25Db2xsYXBzZUljb24ocG9zaXRpb24pKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNFVkVSSVRJRVMgPSBbU2V2ZXJpdHkuSW5mbywgU2V2ZXJpdHkuV2FybmluZywgU2V2ZXJpdHkuRXJyb3JdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaW5wdXREaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSB0ZW1wbGF0ZTogSU5vdGlmaWNhdGlvblRlbXBsYXRlRGF0YSxcblx0XHRwcml2YXRlIGFjdGlvblJ1bm5lcjogSUFjdGlvblJ1bm5lcixcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRpZiAoIU5vdGlmaWNhdGlvblRlbXBsYXRlUmVuZGVyZXIuY2xvc2VOb3RpZmljYXRpb25BY3Rpb24pIHtcblx0XHRcdE5vdGlmaWNhdGlvblRlbXBsYXRlUmVuZGVyZXIuY2xvc2VOb3RpZmljYXRpb25BY3Rpb24gPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDbGVhck5vdGlmaWNhdGlvbkFjdGlvbiwgQ2xlYXJOb3RpZmljYXRpb25BY3Rpb24uSUQsIENsZWFyTm90aWZpY2F0aW9uQWN0aW9uLkxBQkVMKTtcblx0XHRcdE5vdGlmaWNhdGlvblRlbXBsYXRlUmVuZGVyZXIuZXhwYW5kTm90aWZpY2F0aW9uQWN0aW9uID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXhwYW5kTm90aWZpY2F0aW9uQWN0aW9uLCBFeHBhbmROb3RpZmljYXRpb25BY3Rpb24uSUQsIEV4cGFuZE5vdGlmaWNhdGlvbkFjdGlvbi5MQUJFTCk7XG5cdFx0XHROb3RpZmljYXRpb25UZW1wbGF0ZVJlbmRlcmVyLmNvbGxhcHNlTm90aWZpY2F0aW9uQWN0aW9uID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29sbGFwc2VOb3RpZmljYXRpb25BY3Rpb24sIENvbGxhcHNlTm90aWZpY2F0aW9uQWN0aW9uLklELCBDb2xsYXBzZU5vdGlmaWNhdGlvbkFjdGlvbi5MQUJFTCk7XG5cdFx0XHROb3RpZmljYXRpb25UZW1wbGF0ZVJlbmRlcmVyLnVwZGF0ZUV4cGFuZENvbGxhcHNlSWNvbnMoY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKE5vdGlmaWNhdGlvbnNTZXR0aW5ncy5OT1RJRklDQVRJT05TX1BPU0lUSU9OKSkge1xuXHRcdFx0XHROb3RpZmljYXRpb25UZW1wbGF0ZVJlbmRlcmVyLnVwZGF0ZUV4cGFuZENvbGxhcHNlSWNvbnMoY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHNldElucHV0KG5vdGlmaWNhdGlvbjogSU5vdGlmaWNhdGlvblZpZXdJdGVtKTogdm9pZCB7XG5cdFx0dGhpcy5pbnB1dERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHR0aGlzLnJlbmRlcihub3RpZmljYXRpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXIobm90aWZpY2F0aW9uOiBJTm90aWZpY2F0aW9uVmlld0l0ZW0pOiB2b2lkIHtcblxuXHRcdC8vIENvbnRhaW5lclxuXHRcdHRoaXMudGVtcGxhdGUuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2V4cGFuZGVkJywgbm90aWZpY2F0aW9uLmV4cGFuZGVkKTtcblx0XHR0aGlzLmlucHV0RGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnRlbXBsYXRlLmNvbnRhaW5lciwgRXZlbnRUeXBlLk1PVVNFX1VQLCBlID0+IHtcblx0XHRcdGlmIChlLmJ1dHRvbiA9PT0gMSAvKiBNaWRkbGUgQnV0dG9uICovKSB7XG5cdFx0XHRcdC8vIFByZXZlbnQgZmlyaW5nIHRoZSAncGFzdGUnIGV2ZW50IGluIHRoZSBlZGl0b3IgdGV4dGFyZWEgLSAjMTA5MzIyXG5cdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuaW5wdXREaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMudGVtcGxhdGUuY29udGFpbmVyLCBFdmVudFR5cGUuQVVYQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0aWYgKCFub3RpZmljYXRpb24uaGFzUHJvZ3Jlc3MgJiYgZS5idXR0b24gPT09IDEgLyogTWlkZGxlIEJ1dHRvbiAqLykge1xuXHRcdFx0XHRFdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXG5cdFx0XHRcdG5vdGlmaWNhdGlvbi5jbG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFNldmVyaXR5IEljb25cblx0XHR0aGlzLnJlbmRlclNldmVyaXR5KG5vdGlmaWNhdGlvbik7XG5cblx0XHQvLyBNZXNzYWdlXG5cdFx0Y29uc3QgbWVzc2FnZUN1c3RvbUhvdmVyID0gdGhpcy5pbnB1dERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgdGhpcy50ZW1wbGF0ZS5tZXNzYWdlLCAnJykpO1xuXHRcdGNvbnN0IG1lc3NhZ2VPdmVyZmxvd3MgPSB0aGlzLnJlbmRlck1lc3NhZ2Uobm90aWZpY2F0aW9uLCBtZXNzYWdlQ3VzdG9tSG92ZXIpO1xuXG5cdFx0Ly8gU2Vjb25kYXJ5IEFjdGlvbnNcblx0XHR0aGlzLnJlbmRlclNlY29uZGFyeUFjdGlvbnMobm90aWZpY2F0aW9uLCBtZXNzYWdlT3ZlcmZsb3dzKTtcblxuXHRcdC8vIFNvdXJjZVxuXHRcdGNvbnN0IHNvdXJjZUN1c3RvbUhvdmVyID0gdGhpcy5pbnB1dERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgdGhpcy50ZW1wbGF0ZS5zb3VyY2UsICcnKSk7XG5cdFx0dGhpcy5yZW5kZXJTb3VyY2Uobm90aWZpY2F0aW9uLCBzb3VyY2VDdXN0b21Ib3Zlcik7XG5cblx0XHQvLyBCdXR0b25zXG5cdFx0dGhpcy5yZW5kZXJCdXR0b25zKG5vdGlmaWNhdGlvbik7XG5cblx0XHQvLyBQcm9ncmVzc1xuXHRcdHRoaXMucmVuZGVyUHJvZ3Jlc3Mobm90aWZpY2F0aW9uKTtcblxuXHRcdC8vIExhYmVsIENoYW5nZSBFdmVudHMgdGhhdCB3ZSBjYW4gaGFuZGxlIGRpcmVjdGx5XG5cdFx0Ly8gKGNoYW5nZXMgdG8gYWN0aW9ucyByZXF1aXJlIGFuIGVudGlyZSByZWRyYXcgb2Zcblx0XHQvLyB0aGUgbm90aWZpY2F0aW9uIGJlY2F1c2UgaXQgaGFzIGFuIGltcGFjdCBvblxuXHRcdC8vIGVweGFuc2lvbiBzdGF0ZSlcblx0XHR0aGlzLmlucHV0RGlzcG9zYWJsZXMuYWRkKG5vdGlmaWNhdGlvbi5vbkRpZENoYW5nZUNvbnRlbnQoZXZlbnQgPT4ge1xuXHRcdFx0c3dpdGNoIChldmVudC5raW5kKSB7XG5cdFx0XHRcdGNhc2UgTm90aWZpY2F0aW9uVmlld0l0ZW1Db250ZW50Q2hhbmdlS2luZC5TRVZFUklUWTpcblx0XHRcdFx0XHR0aGlzLnJlbmRlclNldmVyaXR5KG5vdGlmaWNhdGlvbik7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgTm90aWZpY2F0aW9uVmlld0l0ZW1Db250ZW50Q2hhbmdlS2luZC5QUk9HUkVTUzpcblx0XHRcdFx0XHR0aGlzLnJlbmRlclByb2dyZXNzKG5vdGlmaWNhdGlvbik7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgTm90aWZpY2F0aW9uVmlld0l0ZW1Db250ZW50Q2hhbmdlS2luZC5NRVNTQUdFOlxuXHRcdFx0XHRcdHRoaXMucmVuZGVyTWVzc2FnZShub3RpZmljYXRpb24sIG1lc3NhZ2VDdXN0b21Ib3Zlcik7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJTZXZlcml0eShub3RpZmljYXRpb246IElOb3RpZmljYXRpb25WaWV3SXRlbSk6IHZvaWQge1xuXHRcdC8vIGZpcnN0IHJlbW92ZSwgdGhlbiBzZXQgYXMgdGhlIGNvZGljb24gY2xhc3MgbmFtZXMgb3ZlcmxhcFxuXHRcdE5vdGlmaWNhdGlvblRlbXBsYXRlUmVuZGVyZXIuU0VWRVJJVElFUy5mb3JFYWNoKHNldmVyaXR5ID0+IHtcblx0XHRcdGlmIChub3RpZmljYXRpb24uc2V2ZXJpdHkgIT09IHNldmVyaXR5KSB7XG5cdFx0XHRcdHRoaXMudGVtcGxhdGUuaWNvbi5jbGFzc0xpc3QucmVtb3ZlKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KHRoaXMudG9TZXZlcml0eUljb24oc2V2ZXJpdHkpKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy50ZW1wbGF0ZS5pY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkodGhpcy50b1NldmVyaXR5SWNvbihub3RpZmljYXRpb24uc2V2ZXJpdHkpKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlck1lc3NhZ2Uobm90aWZpY2F0aW9uOiBJTm90aWZpY2F0aW9uVmlld0l0ZW0sIGN1c3RvbUhvdmVyOiBJTWFuYWdlZEhvdmVyKTogYm9vbGVhbiB7XG5cdFx0Y2xlYXJOb2RlKHRoaXMudGVtcGxhdGUubWVzc2FnZSk7XG5cdFx0dGhpcy50ZW1wbGF0ZS5tZXNzYWdlLmFwcGVuZENoaWxkKE5vdGlmaWNhdGlvbk1lc3NhZ2VSZW5kZXJlci5yZW5kZXIobm90aWZpY2F0aW9uLm1lc3NhZ2UsIHtcblx0XHRcdGNhbGxiYWNrOiBsaW5rID0+IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZShsaW5rKSwgeyBhbGxvd0NvbW1hbmRzOiB0cnVlIH0pLFxuXHRcdFx0dG9EaXNwb3NlOiB0aGlzLmlucHV0RGlzcG9zYWJsZXNcblx0XHR9KSk7XG5cblx0XHRjb25zdCBtZXNzYWdlT3ZlcmZsb3dzID0gbm90aWZpY2F0aW9uLmNhbkNvbGxhcHNlICYmICFub3RpZmljYXRpb24uZXhwYW5kZWQgJiYgdGhpcy50ZW1wbGF0ZS5tZXNzYWdlLnNjcm9sbFdpZHRoID4gdGhpcy50ZW1wbGF0ZS5tZXNzYWdlLmNsaWVudFdpZHRoO1xuXG5cdFx0Y3VzdG9tSG92ZXIudXBkYXRlKG1lc3NhZ2VPdmVyZmxvd3MgPyB0aGlzLnRlbXBsYXRlLm1lc3NhZ2UudGV4dENvbnRlbnQgKyAnJyA6ICcnKTtcblxuXHRcdHJldHVybiBtZXNzYWdlT3ZlcmZsb3dzO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJTZWNvbmRhcnlBY3Rpb25zKG5vdGlmaWNhdGlvbjogSU5vdGlmaWNhdGlvblZpZXdJdGVtLCBtZXNzYWdlT3ZlcmZsb3dzOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cblx0XHQvLyBTZWNvbmRhcnkgQWN0aW9uc1xuXHRcdGlmIChpc05vbkVtcHR5QXJyYXkobm90aWZpY2F0aW9uLmFjdGlvbnM/LnNlY29uZGFyeSkpIHtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyZU5vdGlmaWNhdGlvbkFjdGlvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29uZmlndXJlTm90aWZpY2F0aW9uQWN0aW9uLCBDb25maWd1cmVOb3RpZmljYXRpb25BY3Rpb24uSUQsIENvbmZpZ3VyZU5vdGlmaWNhdGlvbkFjdGlvbi5MQUJFTCwgbm90aWZpY2F0aW9uKTtcblx0XHRcdGFjdGlvbnMucHVzaChjb25maWd1cmVOb3RpZmljYXRpb25BY3Rpb24pO1xuXHRcdFx0dGhpcy5pbnB1dERpc3Bvc2FibGVzLmFkZChjb25maWd1cmVOb3RpZmljYXRpb25BY3Rpb24pO1xuXHRcdH1cblxuXHRcdC8vIEV4cGFuZCAvIENvbGxhcHNlXG5cdFx0bGV0IHNob3dFeHBhbmRDb2xsYXBzZUFjdGlvbiA9IGZhbHNlO1xuXHRcdGlmIChub3RpZmljYXRpb24uY2FuQ29sbGFwc2UpIHtcblx0XHRcdGlmIChub3RpZmljYXRpb24uZXhwYW5kZWQpIHtcblx0XHRcdFx0c2hvd0V4cGFuZENvbGxhcHNlQWN0aW9uID0gdHJ1ZTsgLy8gYWxsb3cgdG8gY29sbGFwc2UgYW4gZXhwYW5kZWQgbWVzc2FnZVxuXHRcdFx0fSBlbHNlIGlmIChub3RpZmljYXRpb24uc291cmNlKSB7XG5cdFx0XHRcdHNob3dFeHBhbmRDb2xsYXBzZUFjdGlvbiA9IHRydWU7IC8vIGFsbG93IHRvIGV4cGFuZCB0byBkZXRhaWxzIHJvd1xuXHRcdFx0fSBlbHNlIGlmIChtZXNzYWdlT3ZlcmZsb3dzKSB7XG5cdFx0XHRcdHNob3dFeHBhbmRDb2xsYXBzZUFjdGlvbiA9IHRydWU7IC8vIGFsbG93IHRvIGV4cGFuZCBpZiBtZXNzYWdlIG92ZXJmbG93c1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChzaG93RXhwYW5kQ29sbGFwc2VBY3Rpb24pIHtcblx0XHRcdGFjdGlvbnMucHVzaChub3RpZmljYXRpb24uZXhwYW5kZWQgPyBOb3RpZmljYXRpb25UZW1wbGF0ZVJlbmRlcmVyLmNvbGxhcHNlTm90aWZpY2F0aW9uQWN0aW9uIDogTm90aWZpY2F0aW9uVGVtcGxhdGVSZW5kZXJlci5leHBhbmROb3RpZmljYXRpb25BY3Rpb24pO1xuXHRcdH1cblxuXHRcdC8vIENsb3NlICh1bmxlc3MgcHJvZ3Jlc3MgaXMgc2hvd2luZylcblx0XHRpZiAoIW5vdGlmaWNhdGlvbi5oYXNQcm9ncmVzcykge1xuXHRcdFx0YWN0aW9ucy5wdXNoKE5vdGlmaWNhdGlvblRlbXBsYXRlUmVuZGVyZXIuY2xvc2VOb3RpZmljYXRpb25BY3Rpb24pO1xuXHRcdH1cblxuXHRcdHRoaXMudGVtcGxhdGUudG9vbGJhci5jbGVhcigpO1xuXHRcdHRoaXMudGVtcGxhdGUudG9vbGJhci5jb250ZXh0ID0gbm90aWZpY2F0aW9uO1xuXHRcdGFjdGlvbnMuZm9yRWFjaChhY3Rpb24gPT4gdGhpcy50ZW1wbGF0ZS50b29sYmFyLnB1c2goYWN0aW9uLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSwga2V5YmluZGluZzogdGhpcy5nZXRLZXliaW5kaW5nTGFiZWwoYWN0aW9uKSB9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclNvdXJjZShub3RpZmljYXRpb246IElOb3RpZmljYXRpb25WaWV3SXRlbSwgc291cmNlQ3VzdG9tSG92ZXI6IElNYW5hZ2VkSG92ZXIpOiB2b2lkIHtcblx0XHRpZiAobm90aWZpY2F0aW9uLmV4cGFuZGVkICYmIG5vdGlmaWNhdGlvbi5zb3VyY2UpIHtcblx0XHRcdHRoaXMudGVtcGxhdGUuc291cmNlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ25vdGlmaWNhdGlvblNvdXJjZScsIFwiU291cmNlOiB7MH1cIiwgbm90aWZpY2F0aW9uLnNvdXJjZSk7XG5cdFx0XHRzb3VyY2VDdXN0b21Ib3Zlci51cGRhdGUobm90aWZpY2F0aW9uLnNvdXJjZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudGVtcGxhdGUuc291cmNlLnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHRzb3VyY2VDdXN0b21Ib3Zlci51cGRhdGUoJycpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQnV0dG9ucyhub3RpZmljYXRpb246IElOb3RpZmljYXRpb25WaWV3SXRlbSk6IHZvaWQge1xuXHRcdGNsZWFyTm9kZSh0aGlzLnRlbXBsYXRlLmJ1dHRvbnNDb250YWluZXIpO1xuXG5cdFx0Y29uc3QgcHJpbWFyeUFjdGlvbnMgPSBub3RpZmljYXRpb24uYWN0aW9ucyA/IG5vdGlmaWNhdGlvbi5hY3Rpb25zLnByaW1hcnkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKG5vdGlmaWNhdGlvbi5leHBhbmRlZCAmJiBpc05vbkVtcHR5QXJyYXkocHJpbWFyeUFjdGlvbnMpKSB7XG5cdFx0XHRjb25zdCB0aGF0ID0gdGhpcztcblxuXHRcdFx0Y29uc3QgYWN0aW9uUnVubmVyOiBJQWN0aW9uUnVubmVyID0gdGhpcy5pbnB1dERpc3Bvc2FibGVzLmFkZChuZXcgY2xhc3MgZXh0ZW5kcyBBY3Rpb25SdW5uZXIge1xuXHRcdFx0XHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgcnVuQWN0aW9uKGFjdGlvbjogSUFjdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0XHRcdFx0Ly8gUnVuIGFjdGlvblxuXHRcdFx0XHRcdHRoYXQuYWN0aW9uUnVubmVyLnJ1bihhY3Rpb24sIG5vdGlmaWNhdGlvbik7XG5cblx0XHRcdFx0XHQvLyBIaWRlIG5vdGlmaWNhdGlvbiAodW5sZXNzIGV4cGxpY2l0bHkgcHJldmVudGVkKVxuXHRcdFx0XHRcdGlmICghKGFjdGlvbiBpbnN0YW5jZW9mIENob2ljZUFjdGlvbikgfHwgIWFjdGlvbi5rZWVwT3Blbikge1xuXHRcdFx0XHRcdFx0bm90aWZpY2F0aW9uLmNsb3NlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KCkpO1xuXG5cdFx0XHRjb25zdCBidXR0b25Ub29sYmFyID0gdGhpcy5pbnB1dERpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uQmFyKHRoaXMudGVtcGxhdGUuYnV0dG9uc0NvbnRhaW5lcikpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBwcmltYXJ5QWN0aW9ucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBwcmltYXJ5QWN0aW9uc1tpXTtcblxuXHRcdFx0XHRjb25zdCBvcHRpb25zOiBJQnV0dG9uT3B0aW9ucyA9IHtcblx0XHRcdFx0XHR0aXRsZTogdHJ1ZSwgIC8vIGFzc2lnbiB0aXRsZXMgdG8gYnV0dG9ucyBpbiBjYXNlIHRoZXkgb3ZlcmZsb3dcblx0XHRcdFx0XHRzZWNvbmRhcnk6IGkgPiAwLFxuXHRcdFx0XHRcdC4uLmRlZmF1bHRCdXR0b25TdHlsZXNcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCBkcm9wZG93bkFjdGlvbnMgPSBhY3Rpb24gaW5zdGFuY2VvZiBDaG9pY2VBY3Rpb24gPyBhY3Rpb24ubWVudSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgYnV0dG9uID0gdGhpcy5pbnB1dERpc3Bvc2FibGVzLmFkZChkcm9wZG93bkFjdGlvbnMgP1xuXHRcdFx0XHRcdGJ1dHRvblRvb2xiYXIuYWRkQnV0dG9uV2l0aERyb3Bkb3duKHtcblx0XHRcdFx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRcdFx0XHRjb250ZXh0TWVudVByb3ZpZGVyOiB0aGlzLmNvbnRleHRNZW51U2VydmljZSxcblx0XHRcdFx0XHRcdGFjdGlvbnM6IGRyb3Bkb3duQWN0aW9ucyxcblx0XHRcdFx0XHRcdGFjdGlvblJ1bm5lclxuXHRcdFx0XHRcdH0pIDpcblx0XHRcdFx0XHRidXR0b25Ub29sYmFyLmFkZEJ1dHRvbihvcHRpb25zKVxuXHRcdFx0XHQpO1xuXG5cdFx0XHRcdGJ1dHRvbi5sYWJlbCA9IGFjdGlvbi5sYWJlbDtcblxuXHRcdFx0XHR0aGlzLmlucHV0RGlzcG9zYWJsZXMuYWRkKGJ1dHRvbi5vbkRpZENsaWNrKGUgPT4ge1xuXHRcdFx0XHRcdGlmIChlKSB7XG5cdFx0XHRcdFx0XHRFdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGFjdGlvblJ1bm5lci5ydW4oYWN0aW9uKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyUHJvZ3Jlc3Mobm90aWZpY2F0aW9uOiBJTm90aWZpY2F0aW9uVmlld0l0ZW0pOiB2b2lkIHtcblxuXHRcdC8vIFJldHVybiBlYXJseSBpZiB0aGUgaXRlbSBoYXMgbm8gcHJvZ3Jlc3Ncblx0XHRpZiAoIW5vdGlmaWNhdGlvbi5oYXNQcm9ncmVzcykge1xuXHRcdFx0dGhpcy50ZW1wbGF0ZS5wcm9ncmVzcy5zdG9wKCkuaGlkZSgpO1xuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSW5maW5pdGVcblx0XHRjb25zdCBzdGF0ZSA9IG5vdGlmaWNhdGlvbi5wcm9ncmVzcy5zdGF0ZTtcblx0XHRpZiAoc3RhdGUuaW5maW5pdGUpIHtcblx0XHRcdHRoaXMudGVtcGxhdGUucHJvZ3Jlc3MuaW5maW5pdGUoKS5zaG93KCk7XG5cdFx0fVxuXG5cdFx0Ly8gVG90YWwgLyBXb3JrZWRcblx0XHRlbHNlIGlmICh0eXBlb2Ygc3RhdGUudG90YWwgPT09ICdudW1iZXInIHx8IHR5cGVvZiBzdGF0ZS53b3JrZWQgPT09ICdudW1iZXInKSB7XG5cdFx0XHRpZiAodHlwZW9mIHN0YXRlLnRvdGFsID09PSAnbnVtYmVyJyAmJiAhdGhpcy50ZW1wbGF0ZS5wcm9ncmVzcy5oYXNUb3RhbCgpKSB7XG5cdFx0XHRcdHRoaXMudGVtcGxhdGUucHJvZ3Jlc3MudG90YWwoc3RhdGUudG90YWwpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodHlwZW9mIHN0YXRlLndvcmtlZCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0dGhpcy50ZW1wbGF0ZS5wcm9ncmVzcy5zZXRXb3JrZWQoc3RhdGUud29ya2VkKS5zaG93KCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRG9uZVxuXHRcdGVsc2Uge1xuXHRcdFx0dGhpcy50ZW1wbGF0ZS5wcm9ncmVzcy5kb25lKCkuaGlkZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdG9TZXZlcml0eUljb24oc2V2ZXJpdHk6IFNldmVyaXR5KTogVGhlbWVJY29uIHtcblx0XHRzd2l0Y2ggKHNldmVyaXR5KSB7XG5cdFx0XHRjYXNlIFNldmVyaXR5Lldhcm5pbmc6XG5cdFx0XHRcdHJldHVybiBDb2RpY29uLndhcm5pbmc7XG5cdFx0XHRjYXNlIFNldmVyaXR5LkVycm9yOlxuXHRcdFx0XHRyZXR1cm4gQ29kaWNvbi5lcnJvcjtcblx0XHR9XG5cdFx0cmV0dXJuIENvZGljb24uaW5mbztcblx0fVxuXG5cdHByaXZhdGUgZ2V0S2V5YmluZGluZ0xhYmVsKGFjdGlvbjogSUFjdGlvbik6IHN0cmluZyB8IG51bGwge1xuXHRcdGNvbnN0IGtleWJpbmRpbmcgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLmlkKTtcblxuXHRcdHJldHVybiBrZXliaW5kaW5nID8ga2V5YmluZGluZy5nZXRMYWJlbCgpIDogbnVsbDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLFdBQVcsdUJBQXVCLFdBQVcsYUFBYSxHQUFHLG1CQUFtQjtBQUN6RixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUM7QUFDMUMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxjQUFzQyxXQUFXLGdCQUFnQjtBQUMxRSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLFNBQVMsaUJBQWlCLGtCQUFrQjtBQUNyRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFnQyxzQkFBc0IsdUNBQTZELGNBQWMsdUJBQXVCLGdDQUFnQztBQUN4TCxTQUFTLHlCQUF5QiwwQkFBMEIsNEJBQTRCLDZCQUE2QiwyQkFBMkIsbUNBQW1DO0FBQ25MLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsc0JBQXNCLHFCQUFxQixVQUFVLDRCQUE0QjtBQUMxRixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxTQUFTLGFBQWEsd0JBQXdCO0FBQ3ZELFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMscUJBQXFCLGdDQUFnQztBQUM5RCxTQUFTLGVBQWU7QUFDeEIsU0FB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
