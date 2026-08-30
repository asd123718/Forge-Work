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
import * as dom from "../../../../../../base/browser/dom.js";
import { Button } from "../../../../../../base/browser/ui/button/button.js";
import { getDefaultHoverDelegate } from "../../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { isMarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { localize } from "../../../../../../nls.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { IMarkdownRendererService } from "../../../../../../platform/markdown/browser/markdownRenderer.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { defaultButtonStyles } from "../../../../../../platform/theme/browser/defaultStyles.js";
import { ChatInputNoticeVariant, ChatInputNoticeWidget } from "./chatInputNoticeWidget.js";
import { ChatInputStackSlot, setChatInputStackSlot } from "./chatInputStack.js";
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotificationService, isChatInputNotificationApplicableToSession } from "./chatInputNotificationService.js";
import "./media/chatInputNotificationWidget.css";
const $ = dom.$;
const severityToClass = {
  [ChatInputNotificationSeverity.Info]: "severity-info",
  [ChatInputNotificationSeverity.Warning]: "severity-warning",
  [ChatInputNotificationSeverity.Error]: "severity-error"
};
const severityToIcon = {
  [ChatInputNotificationSeverity.Info]: Codicon.info,
  [ChatInputNotificationSeverity.Warning]: Codicon.warning,
  [ChatInputNotificationSeverity.Error]: Codicon.error
};
let ChatInputNotificationWidget = class extends Disposable {
  constructor(_delegate, _notificationService, _commandService, _telemetryService, _markdownRendererService, _hoverService, _logService) {
    super();
    this._delegate = _delegate;
    this._notificationService = _notificationService;
    this._commandService = _commandService;
    this._telemetryService = _telemetryService;
    this._markdownRendererService = _markdownRendererService;
    this._hoverService = _hoverService;
    this._logService = _logService;
    this._contentDisposables = this._register(new DisposableStore());
    this._deferredNotificationsEnabled = true;
    this._visible = false;
    this._notice = this._register(new ChatInputNoticeWidget({
      variant: ChatInputNoticeVariant.Notification,
      className: "chat-input-notification-widget",
      ariaRoleDescription: localize("chatInputNotificationRoleDescription", "notification")
    }));
    this._notice.setVisible(false);
    this._register(this._notificationService.onDidChange(() => this._render()));
    this._register(autorun((reader) => {
      this._modelTargetChatSessionType = this._delegate?.modelTargetChatSessionType?.read(reader);
      this._sessionResource = this._delegate?.sessionResource?.read(reader);
      this._deferredNotificationsEnabled = this._delegate?.deferredNotificationsEnabled?.read(reader) ?? true;
      this._render();
    }));
  }
  get domNode() {
    return this._notice.domNode;
  }
  _render() {
    const hadFocus = this.hasFocus();
    this._contentDisposables.clear();
    dom.clearNode(this.domNode);
    this.domNode.classList.remove(...Object.values(severityToClass));
    const notification = this._notificationService.getActiveNotification((n) => this._matchesSession(n));
    this._setVisible(!!notification);
    this._notificationService.announceRendered(notification);
    if (!notification) {
      setChatInputStackSlot(this._slot, ChatInputStackSlot.Empty);
      this._lastShownTelemetryData = void 0;
      if (hadFocus) {
        this._delegate?.focusInput?.();
      }
      return;
    }
    setChatInputStackSlot(this._slot, ChatInputStackSlot.Docked);
    this._renderNotification(notification);
    this._logShownTelemetry(notification);
    if (hadFocus) {
      this.focus();
    }
  }
  _setVisible(visible) {
    if (this._visible === visible) {
      return;
    }
    this._visible = visible;
    this._notice.setVisible(visible);
    this._delegate?.onDidChangeVisibility?.(visible, this);
  }
  hasFocus() {
    return this._notice.hasFocus();
  }
  /**
   * Add the notification to its slot and report what the slot is showing.
   *
   * The widget is built detached and renders in its constructor, so an already
   * active notification has no slot to report to at that point. Owners add it
   * through here so the slot cannot end up marked empty while it has content.
   */
  attachTo(slot) {
    this._slot = slot;
    slot.appendChild(this.domNode);
    setChatInputStackSlot(slot, this._visible ? ChatInputStackSlot.Docked : ChatInputStackSlot.Empty);
  }
  focus() {
    this._notice.focus();
  }
  _matchesSession(notification) {
    return (!notification.deferForNewUsers || this._deferredNotificationsEnabled) && isChatInputNotificationApplicableToSession(notification, this._modelTargetChatSessionType, this._sessionResource);
  }
  _renderNotification(notification) {
    const container = this.domNode;
    container.classList.add(severityToClass[notification.severity]);
    const headerRow = dom.append(container, $(".chat-input-notification-header"));
    const iconElement = dom.append(headerRow, $(".chat-input-notification-icon"));
    iconElement.appendChild(dom.$(ThemeIcon.asCSSSelector(severityToIcon[notification.severity])));
    const titleElement = dom.append(headerRow, $(".chat-input-notification-title"));
    if (isMarkdownString(notification.message)) {
      const rendered = this._contentDisposables.add(this._markdownRendererService.render(notification.message));
      rendered.element.classList.add("chat-input-notification-title-markdown");
      titleElement.appendChild(rendered.element);
    } else {
      titleElement.textContent = notification.message;
    }
    const ariaTitle = isMarkdownString(notification.message) ? notification.message.value : notification.message;
    this._notice.setAriaLabel(ariaTitle);
    if (notification.mute) {
      const mute = notification.mute;
      const muteButton = this._notice.addAction({
        ariaLabel: mute.tooltip,
        icon: Codicon.bellSlash,
        parent: headerRow,
        store: this._contentDisposables,
        onActivate: () => queueMicrotask(() => {
          this._telemetryService.publicLog2("workbenchActionExecuted", {
            id: mute.commandId,
            from: "chatInputNotification"
          });
          this._commandService.executeCommand(mute.commandId, ...mute.commandArgs ?? []);
        })
      });
      this._contentDisposables.add(this._hoverService.setupManagedHover(getDefaultHoverDelegate("element"), muteButton, mute.tooltip));
    }
    if (notification.dismissible) {
      this._notice.addDismissAction({
        className: "chat-input-notification-dismiss",
        ariaLabel: localize("dismissNotification", "Dismiss notification"),
        parent: headerRow,
        store: this._contentDisposables,
        onActivate: () => queueMicrotask(() => {
          this._telemetryService.publicLog2("chatInputNotificationDismissed", this._getTelemetryData(notification));
          this._notificationService.dismissNotification(notification.id);
        })
      });
    }
    const actions = notification.actions.filter((action) => this._supportsAction(action));
    const hasBody = notification.description || actions.length > 0;
    if (hasBody) {
      const bodyRow = dom.append(container, $(".chat-input-notification-body"));
      if (notification.description) {
        const descriptionElement = dom.append(bodyRow, $(".chat-input-notification-description"));
        if (isMarkdownString(notification.description)) {
          const rendered = this._contentDisposables.add(this._markdownRendererService.render(notification.description));
          rendered.element.classList.add("chat-input-notification-description-markdown");
          descriptionElement.appendChild(rendered.element);
        } else {
          descriptionElement.textContent = notification.description;
        }
      }
      if (actions.length > 0) {
        const actionsContainer = dom.append(bodyRow, $(".chat-input-notification-actions"));
        for (let i = 0; i < actions.length; i++) {
          const action = actions[i];
          const isLast = i === actions.length - 1;
          const button = this._contentDisposables.add(new Button(actionsContainer, {
            ...defaultButtonStyles,
            ...!isLast ? {
              buttonBackground: void 0,
              buttonHoverBackground: void 0,
              buttonForeground: void 0,
              buttonSecondaryBackground: void 0,
              buttonSecondaryHoverBackground: void 0,
              buttonSecondaryForeground: void 0,
              buttonSecondaryBorder: void 0
            } : {},
            supportIcons: true,
            secondary: !isLast
          }));
          button.element.classList.add("chat-input-notification-action-button");
          button.label = action.label;
          button.element.ariaLabel = `${ariaTitle} ${action.label}`;
          this._contentDisposables.add(button.onDidClick(() => {
            void this._executeAction(notification, action);
          }));
        }
      }
    }
  }
  _supportsAction(action) {
    switch (action.kind) {
      case ChatInputNotificationActionKind.Command:
        return true;
      case ChatInputNotificationActionKind.OpenModelPicker:
        return !!this._delegate?.openModelPicker;
      case ChatInputNotificationActionKind.SwitchToModel:
        return !!this._delegate?.switchToModel;
    }
  }
  async _executeAction(notification, action) {
    this._telemetryService.publicLog2("chatInputNotificationAction", {
      ...this._getTelemetryData(notification),
      actionKind: action.kind
    });
    switch (action.kind) {
      case ChatInputNotificationActionKind.Command:
        try {
          await this._executeCommandAction(action);
        } catch (error) {
          this._logActionError(error);
        }
        break;
      case ChatInputNotificationActionKind.OpenModelPicker:
        this._openModelPicker();
        break;
      case ChatInputNotificationActionKind.SwitchToModel:
        this._switchToModel(action.modelIdentifier);
        break;
    }
    if (!action.keepOpen) {
      this._notificationService.dismissNotification(notification.id);
    }
  }
  _switchToModel(modelIdentifier) {
    let switched = false;
    try {
      switched = this._delegate?.switchToModel?.(modelIdentifier) ?? false;
    } catch (error) {
      this._logActionError(error);
    }
    if (!switched) {
      this._openModelPicker();
    }
  }
  _openModelPicker() {
    try {
      this._delegate?.openModelPicker?.();
    } catch (error) {
      this._logActionError(error);
    }
  }
  _logActionError(error) {
    this._logService.error("[ChatInputNotificationWidget] Failed to execute notification action", error);
  }
  async _executeCommandAction(action) {
    this._telemetryService.publicLog2("workbenchActionExecuted", {
      id: action.commandId,
      from: "chatInputNotification"
    });
    await this._commandService.executeCommand(action.commandId, ...action.commandArgs ?? []);
  }
  _logShownTelemetry(notification) {
    const data = this._getTelemetryData(notification);
    if (this._lastShownTelemetryData?.id === data.id && this._lastShownTelemetryData.telemetryId === data.telemetryId) {
      return;
    }
    this._lastShownTelemetryData = data;
    this._telemetryService.publicLog2("chatInputNotificationShown", data);
  }
  _getTelemetryData(notification) {
    return {
      id: notification.id,
      telemetryId: notification.telemetryId
    };
  }
};
ChatInputNotificationWidget = __decorateClass([
  __decorateParam(1, IChatInputNotificationService),
  __decorateParam(2, ICommandService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IMarkdownRendererService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, ILogService)
], ChatInputNotificationWidget);
export {
  ChatInputNotificationWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXGNoYXRJbnB1dE5vdGlmaWNhdGlvbldpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24sIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBpc01hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIElPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGRlZmF1bHRCdXR0b25TdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRJbnB1dE5vdGljZUZvY3VzVGFyZ2V0IH0gZnJvbSAnLi9jaGF0SW5wdXROb3RpY2VIb3N0LmpzJztcbmltcG9ydCB7IENoYXRJbnB1dE5vdGljZVZhcmlhbnQsIENoYXRJbnB1dE5vdGljZVdpZGdldCB9IGZyb20gJy4vY2hhdElucHV0Tm90aWNlV2lkZ2V0LmpzJztcbmltcG9ydCB7IENoYXRJbnB1dFN0YWNrU2xvdCwgc2V0Q2hhdElucHV0U3RhY2tTbG90IH0gZnJvbSAnLi9jaGF0SW5wdXRTdGFjay5qcyc7XG5pbXBvcnQgeyBDaGF0SW5wdXROb3RpZmljYXRpb25BY3Rpb25LaW5kLCBDaGF0SW5wdXROb3RpZmljYXRpb25TZXZlcml0eSwgSUNoYXRJbnB1dE5vdGlmaWNhdGlvbiwgSUNoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbiwgSUNoYXRJbnB1dE5vdGlmaWNhdGlvbkNvbW1hbmRBY3Rpb24sIElDaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlLCBpc0NoYXRJbnB1dE5vdGlmaWNhdGlvbkFwcGxpY2FibGVUb1Nlc3Npb24gfSBmcm9tICcuL2NoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0ICcuL21lZGlhL2NoYXRJbnB1dE5vdGlmaWNhdGlvbldpZGdldC5jc3MnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5cbnR5cGUgQ2hhdElucHV0Tm90aWZpY2F0aW9uVGVsZW1ldHJ5RXZlbnQgPSB7XG5cdGlkOiBzdHJpbmc7XG5cdHRlbGVtZXRyeUlkPzogc3RyaW5nO1xufTtcblxudHlwZSBDaGF0SW5wdXROb3RpZmljYXRpb25UZWxlbWV0cnlDbGFzc2lmaWNhdGlvbiA9IHtcblx0aWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgaWRlbnRpZmllciBvZiB0aGUgY2hhdCBpbnB1dCBub3RpZmljYXRpb24uJyB9O1xuXHR0ZWxlbWV0cnlJZD86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgZmVhdHVyZS1wcm92aWRlZCBpZGVudGlmaWVyIGZvciB0aGUgbm90aWZpY2F0aW9uIG1lc3NhZ2UgdGhhdCB3YXMgc2hvd24gb3IgZGlzbWlzc2VkLicgfTtcblx0b3duZXI6ICdyZmVsdGlzJztcblx0Y29tbWVudDogJ1RyYWNrcyBjaGF0IGlucHV0IG5vdGlmaWNhdGlvbiB2aXNpYmlsaXR5IGFuZCB1c2VyIGRpc21pc3NhbHMuJztcbn07XG5cbnR5cGUgQ2hhdElucHV0Tm90aWZpY2F0aW9uQWN0aW9uVGVsZW1ldHJ5RXZlbnQgPSBDaGF0SW5wdXROb3RpZmljYXRpb25UZWxlbWV0cnlFdmVudCAmIHtcblx0YWN0aW9uS2luZDogQ2hhdElucHV0Tm90aWZpY2F0aW9uQWN0aW9uS2luZDtcbn07XG5cbnR5cGUgQ2hhdElucHV0Tm90aWZpY2F0aW9uQWN0aW9uVGVsZW1ldHJ5Q2xhc3NpZmljYXRpb24gPSB7XG5cdGlkOiBDaGF0SW5wdXROb3RpZmljYXRpb25UZWxlbWV0cnlDbGFzc2lmaWNhdGlvblsnaWQnXTtcblx0dGVsZW1ldHJ5SWQ/OiBDaGF0SW5wdXROb3RpZmljYXRpb25UZWxlbWV0cnlDbGFzc2lmaWNhdGlvblsndGVsZW1ldHJ5SWQnXTtcblx0YWN0aW9uS2luZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBraW5kIG9mIG5vdGlmaWNhdGlvbiBhY3Rpb24gc2VsZWN0ZWQgYnkgdGhlIHVzZXIuJyB9O1xuXHRvd25lcjogJ3JmZWx0aXMnO1xuXHRjb21tZW50OiAnVHJhY2tzIGFjdGlvbnMgc2VsZWN0ZWQgZnJvbSBjaGF0IGlucHV0IG5vdGlmaWNhdGlvbnMuJztcbn07XG5cbmNvbnN0IHNldmVyaXR5VG9DbGFzczogUmVjb3JkPENoYXRJbnB1dE5vdGlmaWNhdGlvblNldmVyaXR5LCBzdHJpbmc+ID0ge1xuXHRbQ2hhdElucHV0Tm90aWZpY2F0aW9uU2V2ZXJpdHkuSW5mb106ICdzZXZlcml0eS1pbmZvJyxcblx0W0NoYXRJbnB1dE5vdGlmaWNhdGlvblNldmVyaXR5Lldhcm5pbmddOiAnc2V2ZXJpdHktd2FybmluZycsXG5cdFtDaGF0SW5wdXROb3RpZmljYXRpb25TZXZlcml0eS5FcnJvcl06ICdzZXZlcml0eS1lcnJvcicsXG59O1xuXG5jb25zdCBzZXZlcml0eVRvSWNvbjogUmVjb3JkPENoYXRJbnB1dE5vdGlmaWNhdGlvblNldmVyaXR5LCBUaGVtZUljb24+ID0ge1xuXHRbQ2hhdElucHV0Tm90aWZpY2F0aW9uU2V2ZXJpdHkuSW5mb106IENvZGljb24uaW5mbyxcblx0W0NoYXRJbnB1dE5vdGlmaWNhdGlvblNldmVyaXR5Lldhcm5pbmddOiBDb2RpY29uLndhcm5pbmcsXG5cdFtDaGF0SW5wdXROb3RpZmljYXRpb25TZXZlcml0eS5FcnJvcl06IENvZGljb24uZXJyb3IsXG59O1xuXG4vKiogSW5wdXQtbG9jYWwgY2FwYWJpbGl0aWVzIHVzZWQgdG8gZmlsdGVyIGFuZCBleGVjdXRlIHNlbWFudGljIG5vdGlmaWNhdGlvbiBhY3Rpb25zLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ2hhdElucHV0Tm90aWZpY2F0aW9uRGVsZWdhdGUge1xuXHRyZWFkb25seSBtb2RlbFRhcmdldENoYXRTZXNzaW9uVHlwZT86IElPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZT86IElPYnNlcnZhYmxlPFVSSSB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IGRlZmVycmVkTm90aWZpY2F0aW9uc0VuYWJsZWQ/OiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cmVhZG9ubHkgb3Blbk1vZGVsUGlja2VyPzogKCkgPT4gdm9pZDtcblx0LyoqIFJldHVybnMgZmFsc2UgdG8gb3BlbiB0aGlzIGlucHV0J3MgbW9kZWwgcGlja2VyIGFzIGEgZmFsbGJhY2suICovXG5cdHJlYWRvbmx5IHN3aXRjaFRvTW9kZWw/OiAobW9kZWxJZGVudGlmaWVyOiBzdHJpbmcpID0+IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBSZXBvcnRzIHdoZXRoZXIgYSBub3RpZmljYXRpb24gaXMgcmVuZGVyZWQuIGBmb2N1c1RhcmdldGAgaXMgdGhlIHdpZGdldFxuXHQgKiBpdHNlbGYsIHNvIGEgaG9zdCBjYW4gcm91dGUgbm90aWNlLWZvY3VzIGNvbW1hbmRzIGludG8gaXQgd2hpbGUgaXQgc2hvd3MuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZpc2liaWxpdHk/OiAodmlzaWJsZTogYm9vbGVhbiwgZm9jdXNUYXJnZXQ6IElDaGF0SW5wdXROb3RpY2VGb2N1c1RhcmdldCkgPT4gdm9pZDtcblx0LyoqXG5cdCAqIEhhbmRzIGZvY3VzIGJhY2sgdG8gdGhlIGlucHV0LiBDYWxsZWQgd2hlbiBhIG5vdGlmaWNhdGlvbiB0aGF0IGhhZCBrZXlib2FyZFxuXHQgKiBmb2N1cyBnb2VzIGF3YXksIHNvIGZvY3VzIGlzIG5vdCBzdHJhbmRlZCBvbiBgPGJvZHk+YC5cblx0ICovXG5cdHJlYWRvbmx5IGZvY3VzSW5wdXQ/OiAoKSA9PiB2b2lkO1xufVxuXG4vKipcbiAqIFdpZGdldCB0aGF0IHJlbmRlcnMgYSBzaW5nbGUgbm90aWZpY2F0aW9uIGJhbm5lciBhYm92ZSB0aGUgY2hhdCBpbnB1dCBhcmVhLlxuICogU3Vic2NyaWJlcyB0byB7QGxpbmsgSUNoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2V9IGFuZCBzaG93cyB0aGUgaGlnaGVzdC1zZXZlcml0eVxuICogYWN0aXZlIG5vdGlmaWNhdGlvbiB3aXRoIHNldmVyaXR5LWNvbG9yZWQgYm9yZGVycywgYWN0aW9uIGJ1dHRvbnMsIGFuZCBhIGRpc21pc3MgYnV0dG9uLlxuICovXG5leHBvcnQgY2xhc3MgQ2hhdElucHV0Tm90aWZpY2F0aW9uV2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0SW5wdXROb3RpY2VGb2N1c1RhcmdldCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbm90aWNlOiBDaGF0SW5wdXROb3RpY2VXaWRnZXQ7XG5cblx0Z2V0IGRvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9ub3RpY2UuZG9tTm9kZTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRlbnREaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgX2xhc3RTaG93blRlbGVtZXRyeURhdGE6IENoYXRJbnB1dE5vdGlmaWNhdGlvblRlbGVtZXRyeUV2ZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9tb2RlbFRhcmdldENoYXRTZXNzaW9uVHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGVmZXJyZWROb3RpZmljYXRpb25zRW5hYmxlZCA9IHRydWU7XG5cdHByaXZhdGUgX3Zpc2libGUgPSBmYWxzZTtcblx0cHJpdmF0ZSBfc2xvdDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGVsZWdhdGU6IElDaGF0SW5wdXROb3RpZmljYXRpb25EZWxlZ2F0ZSB8IHVuZGVmaW5lZCxcblx0XHRASUNoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90aWZpY2F0aW9uU2VydmljZTogSUNoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIEJ1aWx0IGRldGFjaGVkOiB0aGUgaW5wdXQgcGFydCBwYXJlbnRzIHRoaXMgd2lkZ2V0IGl0c2VsZiwgaW50byB0aGUgbGFuZVxuXHRcdC8vIGl0IGxheXMgb3V0IGFib3ZlIHRoZSBpbnB1dC5cblx0XHR0aGlzLl9ub3RpY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2hhdElucHV0Tm90aWNlV2lkZ2V0KHtcblx0XHRcdHZhcmlhbnQ6IENoYXRJbnB1dE5vdGljZVZhcmlhbnQuTm90aWZpY2F0aW9uLFxuXHRcdFx0Y2xhc3NOYW1lOiAnY2hhdC1pbnB1dC1ub3RpZmljYXRpb24td2lkZ2V0Jyxcblx0XHRcdGFyaWFSb2xlRGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0SW5wdXROb3RpZmljYXRpb25Sb2xlRGVzY3JpcHRpb24nLCBcIm5vdGlmaWNhdGlvblwiKSxcblx0XHR9KSk7XG5cdFx0dGhpcy5fbm90aWNlLnNldFZpc2libGUoZmFsc2UpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLl9yZW5kZXIoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMuX21vZGVsVGFyZ2V0Q2hhdFNlc3Npb25UeXBlID0gdGhpcy5fZGVsZWdhdGU/Lm1vZGVsVGFyZ2V0Q2hhdFNlc3Npb25UeXBlPy5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9zZXNzaW9uUmVzb3VyY2UgPSB0aGlzLl9kZWxlZ2F0ZT8uc2Vzc2lvblJlc291cmNlPy5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9kZWZlcnJlZE5vdGlmaWNhdGlvbnNFbmFibGVkID0gdGhpcy5fZGVsZWdhdGU/LmRlZmVycmVkTm90aWZpY2F0aW9uc0VuYWJsZWQ/LnJlYWQocmVhZGVyKSA/PyB0cnVlO1xuXHRcdFx0dGhpcy5fcmVuZGVyKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyKCk6IHZvaWQge1xuXHRcdC8vIFRlYXJpbmcgdGhlIGNvbnRlbnQgZG93biB3b3VsZCBzdHJhbmQga2V5Ym9hcmQgZm9jdXMgb24gPGJvZHk+LCB3aGljaCBhbHNvXG5cdFx0Ly8gZHJvcHMgdGhlIGNvbnRleHQga2V5cyB0aGUgY2hhdCBrZXliaW5kaW5ncyBkZXBlbmQgb24uIEhhbmQgaXQgYmFjayB0byB0aGVcblx0XHQvLyBpbnB1dCBpbnN0ZWFkLCB0aGUgc2FtZSB3YXkgYW4gb25ib2FyZGluZyBjYXJkIGRvZXMgd2hlbiBpdCBzdGFuZHMgZG93bi5cblx0XHRjb25zdCBoYWRGb2N1cyA9IHRoaXMuaGFzRm9jdXMoKTtcblx0XHR0aGlzLl9jb250ZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuZG9tTm9kZSk7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoLi4uT2JqZWN0LnZhbHVlcyhzZXZlcml0eVRvQ2xhc3MpKTtcblxuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbiA9IHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuZ2V0QWN0aXZlTm90aWZpY2F0aW9uKG4gPT4gdGhpcy5fbWF0Y2hlc1Nlc3Npb24obikpO1xuXHRcdHRoaXMuX3NldFZpc2libGUoISFub3RpZmljYXRpb24pO1xuXHRcdC8vIEFubm91bmNlIHdoYXQgdGhpcyBjaGF0IGlucHV0IGFjdHVhbGx5IHJlbmRlcnMsIHNvIHNlc3Npb24tc2NvcGVkXG5cdFx0Ly8gbm90aWZpY2F0aW9ucyBhcmUgb25seSBzcG9rZW4gaW4gYSBtYXRjaGluZyBzZXNzaW9uIChkZS1kdXBlZCBieSB0aGUgc2VydmljZSkuXG5cdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5hbm5vdW5jZVJlbmRlcmVkKG5vdGlmaWNhdGlvbik7XG5cdFx0aWYgKCFub3RpZmljYXRpb24pIHtcblx0XHRcdHNldENoYXRJbnB1dFN0YWNrU2xvdCh0aGlzLl9zbG90LCBDaGF0SW5wdXRTdGFja1Nsb3QuRW1wdHkpO1xuXHRcdFx0dGhpcy5fbGFzdFNob3duVGVsZW1ldHJ5RGF0YSA9IHVuZGVmaW5lZDtcblx0XHRcdGlmIChoYWRGb2N1cykge1xuXHRcdFx0XHR0aGlzLl9kZWxlZ2F0ZT8uZm9jdXNJbnB1dD8uKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0c2V0Q2hhdElucHV0U3RhY2tTbG90KHRoaXMuX3Nsb3QsIENoYXRJbnB1dFN0YWNrU2xvdC5Eb2NrZWQpO1xuXHRcdHRoaXMuX3JlbmRlck5vdGlmaWNhdGlvbihub3RpZmljYXRpb24pO1xuXHRcdHRoaXMuX2xvZ1Nob3duVGVsZW1ldHJ5KG5vdGlmaWNhdGlvbik7XG5cdFx0aWYgKGhhZEZvY3VzKSB7XG5cdFx0XHQvLyBUaGUgcmVnaW9uIGlzIHJlYnVpbHQgb24gZXZlcnkgcmVuZGVyOyBrZWVwIGZvY3VzIGluc2lkZSBpdC5cblx0XHRcdHRoaXMuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZXRWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdmlzaWJsZSA9PT0gdmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Zpc2libGUgPSB2aXNpYmxlO1xuXHRcdHRoaXMuX25vdGljZS5zZXRWaXNpYmxlKHZpc2libGUpO1xuXHRcdHRoaXMuX2RlbGVnYXRlPy5vbkRpZENoYW5nZVZpc2liaWxpdHk/Lih2aXNpYmxlLCB0aGlzKTtcblx0fVxuXG5cdGhhc0ZvY3VzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9ub3RpY2UuaGFzRm9jdXMoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBZGQgdGhlIG5vdGlmaWNhdGlvbiB0byBpdHMgc2xvdCBhbmQgcmVwb3J0IHdoYXQgdGhlIHNsb3QgaXMgc2hvd2luZy5cblx0ICpcblx0ICogVGhlIHdpZGdldCBpcyBidWlsdCBkZXRhY2hlZCBhbmQgcmVuZGVycyBpbiBpdHMgY29uc3RydWN0b3IsIHNvIGFuIGFscmVhZHlcblx0ICogYWN0aXZlIG5vdGlmaWNhdGlvbiBoYXMgbm8gc2xvdCB0byByZXBvcnQgdG8gYXQgdGhhdCBwb2ludC4gT3duZXJzIGFkZCBpdFxuXHQgKiB0aHJvdWdoIGhlcmUgc28gdGhlIHNsb3QgY2Fubm90IGVuZCB1cCBtYXJrZWQgZW1wdHkgd2hpbGUgaXQgaGFzIGNvbnRlbnQuXG5cdCAqL1xuXHRhdHRhY2hUbyhzbG90OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX3Nsb3QgPSBzbG90O1xuXHRcdHNsb3QuYXBwZW5kQ2hpbGQodGhpcy5kb21Ob2RlKTtcblx0XHRzZXRDaGF0SW5wdXRTdGFja1Nsb3Qoc2xvdCwgdGhpcy5fdmlzaWJsZSA/IENoYXRJbnB1dFN0YWNrU2xvdC5Eb2NrZWQgOiBDaGF0SW5wdXRTdGFja1Nsb3QuRW1wdHkpO1xuXHR9XG5cblx0Zm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fbm90aWNlLmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9tYXRjaGVzU2Vzc2lvbihub3RpZmljYXRpb246IElDaGF0SW5wdXROb3RpZmljYXRpb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKCFub3RpZmljYXRpb24uZGVmZXJGb3JOZXdVc2VycyB8fCB0aGlzLl9kZWZlcnJlZE5vdGlmaWNhdGlvbnNFbmFibGVkKVxuXHRcdFx0JiYgaXNDaGF0SW5wdXROb3RpZmljYXRpb25BcHBsaWNhYmxlVG9TZXNzaW9uKG5vdGlmaWNhdGlvbiwgdGhpcy5fbW9kZWxUYXJnZXRDaGF0U2Vzc2lvblR5cGUsIHRoaXMuX3Nlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJOb3RpZmljYXRpb24obm90aWZpY2F0aW9uOiBJQ2hhdElucHV0Tm90aWZpY2F0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy5kb21Ob2RlO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKHNldmVyaXR5VG9DbGFzc1tub3RpZmljYXRpb24uc2V2ZXJpdHldKTtcblxuXHRcdC8vIEhlYWRlciByb3c6IGljb24gKyB0aXRsZSArIG11dGUgKyBkaXNtaXNzXG5cdFx0Y29uc3QgaGVhZGVyUm93ID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5jaGF0LWlucHV0LW5vdGlmaWNhdGlvbi1oZWFkZXInKSk7XG5cblx0XHQvLyBTZXZlcml0eSBpY29uXG5cdFx0Y29uc3QgaWNvbkVsZW1lbnQgPSBkb20uYXBwZW5kKGhlYWRlclJvdywgJCgnLmNoYXQtaW5wdXQtbm90aWZpY2F0aW9uLWljb24nKSk7XG5cdFx0aWNvbkVsZW1lbnQuYXBwZW5kQ2hpbGQoZG9tLiQoVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3Ioc2V2ZXJpdHlUb0ljb25bbm90aWZpY2F0aW9uLnNldmVyaXR5XSkpKTtcblxuXHRcdC8vIFRpdGxlXG5cdFx0Y29uc3QgdGl0bGVFbGVtZW50ID0gZG9tLmFwcGVuZChoZWFkZXJSb3csICQoJy5jaGF0LWlucHV0LW5vdGlmaWNhdGlvbi10aXRsZScpKTtcblx0XHRpZiAoaXNNYXJrZG93blN0cmluZyhub3RpZmljYXRpb24ubWVzc2FnZSkpIHtcblx0XHRcdGNvbnN0IHJlbmRlcmVkID0gdGhpcy5fY29udGVudERpc3Bvc2FibGVzLmFkZCh0aGlzLl9tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIobm90aWZpY2F0aW9uLm1lc3NhZ2UpKTtcblx0XHRcdHJlbmRlcmVkLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC1pbnB1dC1ub3RpZmljYXRpb24tdGl0bGUtbWFya2Rvd24nKTtcblx0XHRcdHRpdGxlRWxlbWVudC5hcHBlbmRDaGlsZChyZW5kZXJlZC5lbGVtZW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGl0bGVFbGVtZW50LnRleHRDb250ZW50ID0gbm90aWZpY2F0aW9uLm1lc3NhZ2U7XG5cdFx0fVxuXHRcdGNvbnN0IGFyaWFUaXRsZSA9IGlzTWFya2Rvd25TdHJpbmcobm90aWZpY2F0aW9uLm1lc3NhZ2UpID8gbm90aWZpY2F0aW9uLm1lc3NhZ2UudmFsdWUgOiBub3RpZmljYXRpb24ubWVzc2FnZTtcblx0XHQvLyBOYW1lcyB0aGUgZm9jdXNhYmxlIHJlZ2lvbjogYGFyaWEtcm9sZWRlc2NyaXB0aW9uYCBhbG9uZSB3b3VsZCBoYXZlIGZvY3VzXG5cdFx0Ly8gbGFuZCBvbiBzb21ldGhpbmcgYW5ub3VuY2VkIG9ubHkgYXMgXCJub3RpZmljYXRpb25cIi5cblx0XHR0aGlzLl9ub3RpY2Uuc2V0QXJpYUxhYmVsKGFyaWFUaXRsZSk7XG5cblx0XHRpZiAobm90aWZpY2F0aW9uLm11dGUpIHtcblx0XHRcdGNvbnN0IG11dGUgPSBub3RpZmljYXRpb24ubXV0ZTtcblxuXHRcdFx0Ly8gRGVmZXIgdG8gYSBtaWNyb3Rhc2sgZm9yIHRoZSBzYW1lIHJlYXNvbiBhcyB0aGUgZGlzbWlzcyBidXR0b246XG5cdFx0XHQvLyB0aGUgY29tbWFuZCBzeW5jaHJvbm91c2x5IHRlYXJzIGRvd24gdGhlIG5vdGlmaWNhdGlvbiwgYW5kIHRoZVxuXHRcdFx0Ly8gcmVzdWx0aW5nIHJlLXJlbmRlciBtdXN0IGhhcHBlbiBhZnRlciB0aGUgY2xpY2sgaGFzIHByb3BhZ2F0ZWQuXG5cdFx0XHRjb25zdCBtdXRlQnV0dG9uID0gdGhpcy5fbm90aWNlLmFkZEFjdGlvbih7XG5cdFx0XHRcdGFyaWFMYWJlbDogbXV0ZS50b29sdGlwLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmJlbGxTbGFzaCxcblx0XHRcdFx0cGFyZW50OiBoZWFkZXJSb3csXG5cdFx0XHRcdHN0b3JlOiB0aGlzLl9jb250ZW50RGlzcG9zYWJsZXMsXG5cdFx0XHRcdG9uQWN0aXZhdGU6ICgpID0+IHF1ZXVlTWljcm90YXNrKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJywge1xuXHRcdFx0XHRcdFx0aWQ6IG11dGUuY29tbWFuZElkLFxuXHRcdFx0XHRcdFx0ZnJvbTogJ2NoYXRJbnB1dE5vdGlmaWNhdGlvbicsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0dGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQobXV0ZS5jb21tYW5kSWQsIC4uLihtdXRlLmNvbW1hbmRBcmdzID8/IFtdKSk7XG5cdFx0XHRcdH0pLFxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9jb250ZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpLCBtdXRlQnV0dG9uLCBtdXRlLnRvb2x0aXApKTtcblx0XHR9XG5cblx0XHQvLyBEaXNtaXNzIGJ1dHRvbiAoaW4gaGVhZGVyIHJvdywgcHVzaGVkIHRvIHRoZSByaWdodClcblx0XHRpZiAobm90aWZpY2F0aW9uLmRpc21pc3NpYmxlKSB7XG5cdFx0XHQvLyBEZWZlciB0aGUgZGlzbWlzcyB0byBhIG1pY3JvdGFzayBzbyB0aGUgc3luY2hyb25vdXMgcmUtcmVuZGVyXG5cdFx0XHQvLyAod2hpY2ggY2xlYXJzIGFsbCBjaGlsZHJlbiBvZiB0aGUgd2lkZ2V0KSBoYXBwZW5zIGFmdGVyIHRoZVxuXHRcdFx0Ly8gYnJvd3NlciBoYXMgZmluaXNoZWQgcHJvcGFnYXRpbmcgdGhlIGNsaWNrIGV2ZW50LiBPdGhlcndpc2Vcblx0XHRcdC8vIGJsdXIgaGFuZGxlcnMgZmlyZWQgYnkgcmVtb3ZpbmcgdGhlIGJ1dHRvbiBmcm9tIGZvY3VzIGNhblxuXHRcdFx0Ly8gbW92ZS9yZW1vdmUgbm9kZXMgdGhhdCBgY2xlYXJOb2RlYCB0aGVuIHRyaXBzIG92ZXIuXG5cdFx0XHR0aGlzLl9ub3RpY2UuYWRkRGlzbWlzc0FjdGlvbih7XG5cdFx0XHRcdGNsYXNzTmFtZTogJ2NoYXQtaW5wdXQtbm90aWZpY2F0aW9uLWRpc21pc3MnLFxuXHRcdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdkaXNtaXNzTm90aWZpY2F0aW9uJywgXCJEaXNtaXNzIG5vdGlmaWNhdGlvblwiKSxcblx0XHRcdFx0cGFyZW50OiBoZWFkZXJSb3csXG5cdFx0XHRcdHN0b3JlOiB0aGlzLl9jb250ZW50RGlzcG9zYWJsZXMsXG5cdFx0XHRcdG9uQWN0aXZhdGU6ICgpID0+IHF1ZXVlTWljcm90YXNrKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q2hhdElucHV0Tm90aWZpY2F0aW9uVGVsZW1ldHJ5RXZlbnQsIENoYXRJbnB1dE5vdGlmaWNhdGlvblRlbGVtZXRyeUNsYXNzaWZpY2F0aW9uPignY2hhdElucHV0Tm90aWZpY2F0aW9uRGlzbWlzc2VkJywgdGhpcy5fZ2V0VGVsZW1ldHJ5RGF0YShub3RpZmljYXRpb24pKTtcblx0XHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmRpc21pc3NOb3RpZmljYXRpb24obm90aWZpY2F0aW9uLmlkKTtcblx0XHRcdFx0fSksXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBCb2R5IHJvdzogZGVzY3JpcHRpb24gKyBhY3Rpb25zIG9uIHRoZSBzYW1lIGxpbmVcblx0XHRjb25zdCBhY3Rpb25zID0gbm90aWZpY2F0aW9uLmFjdGlvbnMuZmlsdGVyKGFjdGlvbiA9PiB0aGlzLl9zdXBwb3J0c0FjdGlvbihhY3Rpb24pKTtcblx0XHRjb25zdCBoYXNCb2R5ID0gbm90aWZpY2F0aW9uLmRlc2NyaXB0aW9uIHx8IGFjdGlvbnMubGVuZ3RoID4gMDtcblx0XHRpZiAoaGFzQm9keSkge1xuXHRcdFx0Y29uc3QgYm9keVJvdyA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCcuY2hhdC1pbnB1dC1ub3RpZmljYXRpb24tYm9keScpKTtcblxuXHRcdFx0aWYgKG5vdGlmaWNhdGlvbi5kZXNjcmlwdGlvbikge1xuXHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbkVsZW1lbnQgPSBkb20uYXBwZW5kKGJvZHlSb3csICQoJy5jaGF0LWlucHV0LW5vdGlmaWNhdGlvbi1kZXNjcmlwdGlvbicpKTtcblx0XHRcdFx0aWYgKGlzTWFya2Rvd25TdHJpbmcobm90aWZpY2F0aW9uLmRlc2NyaXB0aW9uKSkge1xuXHRcdFx0XHRcdGNvbnN0IHJlbmRlcmVkID0gdGhpcy5fY29udGVudERpc3Bvc2FibGVzLmFkZCh0aGlzLl9tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIobm90aWZpY2F0aW9uLmRlc2NyaXB0aW9uKSk7XG5cdFx0XHRcdFx0cmVuZGVyZWQuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LWlucHV0LW5vdGlmaWNhdGlvbi1kZXNjcmlwdGlvbi1tYXJrZG93bicpO1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uRWxlbWVudC5hcHBlbmRDaGlsZChyZW5kZXJlZC5lbGVtZW50KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbkVsZW1lbnQudGV4dENvbnRlbnQgPSBub3RpZmljYXRpb24uZGVzY3JpcHRpb247XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGFjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBhY3Rpb25zQ29udGFpbmVyID0gZG9tLmFwcGVuZChib2R5Um93LCAkKCcuY2hhdC1pbnB1dC1ub3RpZmljYXRpb24tYWN0aW9ucycpKTtcblxuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGFjdGlvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRjb25zdCBhY3Rpb24gPSBhY3Rpb25zW2ldO1xuXHRcdFx0XHRcdGNvbnN0IGlzTGFzdCA9IGkgPT09IGFjdGlvbnMubGVuZ3RoIC0gMTtcblxuXHRcdFx0XHRcdGNvbnN0IGJ1dHRvbiA9IHRoaXMuX2NvbnRlbnREaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbihhY3Rpb25zQ29udGFpbmVyLCB7XG5cdFx0XHRcdFx0XHQuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLFxuXHRcdFx0XHRcdFx0Li4uKCFpc0xhc3QgPyB7XG5cdFx0XHRcdFx0XHRcdGJ1dHRvbkJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0YnV0dG9uSG92ZXJCYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGJ1dHRvbkZvcmVncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0YnV0dG9uU2Vjb25kYXJ5QmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRidXR0b25TZWNvbmRhcnlIb3ZlckJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0YnV0dG9uU2Vjb25kYXJ5Rm9yZWdyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRidXR0b25TZWNvbmRhcnlCb3JkZXI6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdH0gOiB7fSksXG5cdFx0XHRcdFx0XHRzdXBwb3J0SWNvbnM6IHRydWUsXG5cdFx0XHRcdFx0XHRzZWNvbmRhcnk6ICFpc0xhc3QsXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdGJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtaW5wdXQtbm90aWZpY2F0aW9uLWFjdGlvbi1idXR0b24nKTtcblx0XHRcdFx0XHRidXR0b24ubGFiZWwgPSBhY3Rpb24ubGFiZWw7XG5cdFx0XHRcdFx0YnV0dG9uLmVsZW1lbnQuYXJpYUxhYmVsID0gYCR7YXJpYVRpdGxlfSAke2FjdGlvbi5sYWJlbH1gO1xuXG5cdFx0XHRcdFx0dGhpcy5fY29udGVudERpc3Bvc2FibGVzLmFkZChidXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHRcdFx0XHR2b2lkIHRoaXMuX2V4ZWN1dGVBY3Rpb24obm90aWZpY2F0aW9uLCBhY3Rpb24pO1xuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3N1cHBvcnRzQWN0aW9uKGFjdGlvbjogSUNoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbik6IGJvb2xlYW4ge1xuXHRcdHN3aXRjaCAoYWN0aW9uLmtpbmQpIHtcblx0XHRcdGNhc2UgQ2hhdElucHV0Tm90aWZpY2F0aW9uQWN0aW9uS2luZC5Db21tYW5kOlxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgQ2hhdElucHV0Tm90aWZpY2F0aW9uQWN0aW9uS2luZC5PcGVuTW9kZWxQaWNrZXI6XG5cdFx0XHRcdHJldHVybiAhIXRoaXMuX2RlbGVnYXRlPy5vcGVuTW9kZWxQaWNrZXI7XG5cdFx0XHRjYXNlIENoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbktpbmQuU3dpdGNoVG9Nb2RlbDpcblx0XHRcdFx0cmV0dXJuICEhdGhpcy5fZGVsZWdhdGU/LnN3aXRjaFRvTW9kZWw7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZXhlY3V0ZUFjdGlvbihub3RpZmljYXRpb246IElDaGF0SW5wdXROb3RpZmljYXRpb24sIGFjdGlvbjogSUNoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0SW5wdXROb3RpZmljYXRpb25BY3Rpb25UZWxlbWV0cnlFdmVudCwgQ2hhdElucHV0Tm90aWZpY2F0aW9uQWN0aW9uVGVsZW1ldHJ5Q2xhc3NpZmljYXRpb24+KCdjaGF0SW5wdXROb3RpZmljYXRpb25BY3Rpb24nLCB7XG5cdFx0XHQuLi50aGlzLl9nZXRUZWxlbWV0cnlEYXRhKG5vdGlmaWNhdGlvbiksXG5cdFx0XHRhY3Rpb25LaW5kOiBhY3Rpb24ua2luZCxcblx0XHR9KTtcblx0XHRzd2l0Y2ggKGFjdGlvbi5raW5kKSB7XG5cdFx0XHRjYXNlIENoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbktpbmQuQ29tbWFuZDpcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9leGVjdXRlQ29tbWFuZEFjdGlvbihhY3Rpb24pO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ0FjdGlvbkVycm9yKGVycm9yKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQ2hhdElucHV0Tm90aWZpY2F0aW9uQWN0aW9uS2luZC5PcGVuTW9kZWxQaWNrZXI6XG5cdFx0XHRcdHRoaXMuX29wZW5Nb2RlbFBpY2tlcigpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQ2hhdElucHV0Tm90aWZpY2F0aW9uQWN0aW9uS2luZC5Td2l0Y2hUb01vZGVsOlxuXHRcdFx0XHR0aGlzLl9zd2l0Y2hUb01vZGVsKGFjdGlvbi5tb2RlbElkZW50aWZpZXIpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdFx0aWYgKCFhY3Rpb24ua2VlcE9wZW4pIHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuZGlzbWlzc05vdGlmaWNhdGlvbihub3RpZmljYXRpb24uaWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3N3aXRjaFRvTW9kZWwobW9kZWxJZGVudGlmaWVyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRsZXQgc3dpdGNoZWQgPSBmYWxzZTtcblx0XHR0cnkge1xuXHRcdFx0c3dpdGNoZWQgPSB0aGlzLl9kZWxlZ2F0ZT8uc3dpdGNoVG9Nb2RlbD8uKG1vZGVsSWRlbnRpZmllcikgPz8gZmFsc2U7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ0FjdGlvbkVycm9yKGVycm9yKTtcblx0XHR9XG5cdFx0aWYgKCFzd2l0Y2hlZCkge1xuXHRcdFx0dGhpcy5fb3Blbk1vZGVsUGlja2VyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb3Blbk1vZGVsUGlja2VyKCk6IHZvaWQge1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9kZWxlZ2F0ZT8ub3Blbk1vZGVsUGlja2VyPy4oKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fbG9nQWN0aW9uRXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2xvZ0FjdGlvbkVycm9yKGVycm9yOiB1bmtub3duKTogdm9pZCB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW0NoYXRJbnB1dE5vdGlmaWNhdGlvbldpZGdldF0gRmFpbGVkIHRvIGV4ZWN1dGUgbm90aWZpY2F0aW9uIGFjdGlvbicsIGVycm9yKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2V4ZWN1dGVDb21tYW5kQWN0aW9uKGFjdGlvbjogSUNoYXRJbnB1dE5vdGlmaWNhdGlvbkNvbW1hbmRBY3Rpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJywge1xuXHRcdFx0aWQ6IGFjdGlvbi5jb21tYW5kSWQsXG5cdFx0XHRmcm9tOiAnY2hhdElucHV0Tm90aWZpY2F0aW9uJyxcblx0XHR9KTtcblx0XHRhd2FpdCB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChhY3Rpb24uY29tbWFuZElkLCAuLi4oYWN0aW9uLmNvbW1hbmRBcmdzID8/IFtdKSk7XG5cdH1cblxuXHRwcml2YXRlIF9sb2dTaG93blRlbGVtZXRyeShub3RpZmljYXRpb246IElDaGF0SW5wdXROb3RpZmljYXRpb24pOiB2b2lkIHtcblx0XHRjb25zdCBkYXRhID0gdGhpcy5fZ2V0VGVsZW1ldHJ5RGF0YShub3RpZmljYXRpb24pO1xuXHRcdGlmICh0aGlzLl9sYXN0U2hvd25UZWxlbWV0cnlEYXRhPy5pZCA9PT0gZGF0YS5pZCAmJiB0aGlzLl9sYXN0U2hvd25UZWxlbWV0cnlEYXRhLnRlbGVtZXRyeUlkID09PSBkYXRhLnRlbGVtZXRyeUlkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2xhc3RTaG93blRlbGVtZXRyeURhdGEgPSBkYXRhO1xuXHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0SW5wdXROb3RpZmljYXRpb25UZWxlbWV0cnlFdmVudCwgQ2hhdElucHV0Tm90aWZpY2F0aW9uVGVsZW1ldHJ5Q2xhc3NpZmljYXRpb24+KCdjaGF0SW5wdXROb3RpZmljYXRpb25TaG93bicsIGRhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VGVsZW1ldHJ5RGF0YShub3RpZmljYXRpb246IElDaGF0SW5wdXROb3RpZmljYXRpb24pOiBDaGF0SW5wdXROb3RpZmljYXRpb25UZWxlbWV0cnlFdmVudCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiBub3RpZmljYXRpb24uaWQsXG5cdFx0XHR0ZWxlbWV0cnlJZDogbm90aWZpY2F0aW9uLnRlbGVtZXRyeUlkLFxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5n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LE1BQ0QsS0FBSyxnQ0FBZ0M7QUFDcEMsYUFBSyxlQUFlLE9BQU8sZUFBZTtBQUMxQztBQUFBLElBQ0Y7QUFDQSxRQUFJLENBQUMsT0FBTyxVQUFVO0FBQ3JCLFdBQUsscUJBQXFCLG9CQUFvQixhQUFhLEVBQUU7QUFBQSxJQUM5RDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGVBQWUsaUJBQStCO0FBQ3JELFFBQUksV0FBVztBQUNmLFFBQUk7QUFDSCxpQkFBVyxLQUFLLFdBQVcsZ0JBQWdCLGVBQWUsS0FBSztBQUFBLElBQ2hFLFNBQVMsT0FBTztBQUNmLFdBQUssZ0JBQWdCLEtBQUs7QUFBQSxJQUMzQjtBQUNBLFFBQUksQ0FBQyxVQUFVO0FBQ2QsV0FBSyxpQkFBaUI7QUFBQSxJQUN2QjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLG1CQUF5QjtBQUNoQyxRQUFJO0FBQ0gsV0FBSyxXQUFXLGtCQUFrQjtBQUFBLElBQ25DLFNBQVMsT0FBTztBQUNmLFdBQUssZ0JBQWdCLEtBQUs7QUFBQSxJQUMzQjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGdCQUFnQixPQUFzQjtBQUM3QyxTQUFLLFlBQVksTUFBTSx1RUFBdUUsS0FBSztBQUFBLEVBQ3BHO0FBQUEsRUFFQSxNQUFjLHNCQUFzQixRQUE0RDtBQUMvRixTQUFLLGtCQUFrQixXQUFnRiwyQkFBMkI7QUFBQSxNQUNqSSxJQUFJLE9BQU87QUFBQSxNQUNYLE1BQU07QUFBQSxJQUNQLENBQUM7QUFDRCxVQUFNLEtBQUssZ0JBQWdCLGVBQWUsT0FBTyxXQUFXLEdBQUksT0FBTyxlQUFlLENBQUMsQ0FBRTtBQUFBLEVBQzFGO0FBQUEsRUFFUSxtQkFBbUIsY0FBNEM7QUFDdEUsVUFBTSxPQUFPLEtBQUssa0JBQWtCLFlBQVk7QUFDaEQsUUFBSSxLQUFLLHlCQUF5QixPQUFPLEtBQUssTUFBTSxLQUFLLHdCQUF3QixnQkFBZ0IsS0FBSyxhQUFhO0FBQ2xIO0FBQUEsSUFDRDtBQUNBLFNBQUssMEJBQTBCO0FBQy9CLFNBQUssa0JBQWtCLFdBQThGLDhCQUE4QixJQUFJO0FBQUEsRUFDeEo7QUFBQSxFQUVRLGtCQUFrQixjQUEyRTtBQUNwRyxXQUFPO0FBQUEsTUFDTixJQUFJLGFBQWE7QUFBQSxNQUNqQixhQUFhLGFBQWE7QUFBQSxJQUMzQjtBQUFBLEVBQ0Q7QUFDRDtBQXhUYSw4QkFBTjtBQUFBLEVBa0JKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXZCVTsiLAogICJuYW1lcyI6IFtdCn0K
