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
import "./media/chatTipContent.css";
import * as dom from "../../../../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../../../../base/browser/mouseEvent.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { onUnexpectedError } from "../../../../../../base/common/errors.js";
import { Disposable, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { localize, localize2 } from "../../../../../../nls.js";
import { getFlatContextMenuActions } from "../../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { MenuWorkbenchToolBar } from "../../../../../../platform/actions/browser/toolbar.js";
import { Action2, IMenuService, MenuId, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { openLinkFromMarkdown } from "../../../../../../platform/markdown/browser/markdownRenderer.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { ChatContextKeys } from "../../../common/actions/chatContextKeys.js";
import { CHAT_SETUP_ACTION_ID } from "../../actions/chatActions.js";
import { IChatTipService } from "../../chatTipService.js";
import { ChatEntitlement, IChatEntitlementService } from "../../../../../services/chat/common/chatEntitlementService.js";
import { ChatInputNoticeVariant, ChatInputNoticeWidget } from "../input/chatInputNoticeWidget.js";
const $ = dom.$;
let ChatTipContentPart = class extends Disposable {
  constructor(tip, _renderer, _chatTipService, _contextMenuService, _menuService, _contextKeyService, _instantiationService, _openerService, _commandService, _chatEntitlementService) {
    super();
    this._renderer = _renderer;
    this._chatTipService = _chatTipService;
    this._contextMenuService = _contextMenuService;
    this._menuService = _menuService;
    this._contextKeyService = _contextKeyService;
    this._instantiationService = _instantiationService;
    this._openerService = _openerService;
    this._commandService = _commandService;
    this._chatEntitlementService = _chatEntitlementService;
    this._onDidHide = this._register(new Emitter());
    this.onDidHide = this._onDidHide.event;
    this._renderedContent = this._register(new MutableDisposable());
    this._toolbar = this._register(new MutableDisposable());
    this._notice = this._register(new ChatInputNoticeWidget({
      variant: ChatInputNoticeVariant.Tip,
      className: "chat-tip-widget",
      ariaRoleDescription: localize("chatTipRoleDescription", "tip")
    }));
    this._inChatTipContextKey = ChatContextKeys.inChatTip.bindTo(this._contextKeyService);
    this._multipleChatTipsContextKey = ChatContextKeys.multipleChatTips.bindTo(this._contextKeyService);
    const focusTracker = this._register(dom.trackFocus(this.domNode));
    this._register(focusTracker.onDidFocus(() => this._inChatTipContextKey.set(true)));
    this._register(focusTracker.onDidBlur(() => this._inChatTipContextKey.set(false)));
    this._register({
      dispose: () => {
        this._inChatTipContextKey.reset();
        this._multipleChatTipsContextKey.reset();
      }
    });
    this._renderTip(tip);
    this._register(this._chatTipService.onDidDismissTip(() => {
      this._onDidHide.fire();
    }));
    this._register(this._chatTipService.onDidNavigateTip((tip2) => {
      this._renderTip(tip2);
      dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(this.domNode), () => this.focus());
    }));
    this._register(this._chatTipService.onDidHideTip(() => {
      this._onDidHide.fire();
    }));
    this._register(this._chatTipService.onDidDisableTips(() => {
      this._onDidHide.fire();
    }));
    this._register(dom.addDisposableListener(this.domNode, dom.EventType.CONTEXT_MENU, (e) => {
      dom.EventHelper.stop(e, true);
      const event = new StandardMouseEvent(dom.getWindow(this.domNode), e);
      this._contextMenuService.showContextMenu({
        getAnchor: () => event,
        getActions: () => {
          const menu = this._menuService.getMenuActions(MenuId.ChatTipContext, this._contextKeyService);
          return getFlatContextMenuActions(menu);
        }
      });
    }));
  }
  get domNode() {
    return this._notice.domNode;
  }
  hasFocus() {
    return this._notice.hasFocus();
  }
  focus() {
    this._notice.focus();
  }
  _renderTip(tip) {
    dom.clearNode(this.domNode);
    this._toolbar.clear();
    this._multipleChatTipsContextKey.set(this._chatTipService.hasMultipleTips());
    const markdownContent = this._renderer.render(tip.content, {
      actionHandler: (link, md) => {
        this._handleTipAction(link, md).catch(onUnexpectedError);
      }
    });
    this._renderedContent.value = markdownContent;
    this.domNode.appendChild(markdownContent.element);
    const toolbarContainer = $(".chat-tip-toolbar");
    this._toolbar.value = this._instantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, MenuId.ChatTipToolbar, {
      menuOptions: {
        shouldForwardArgs: true
      }
    });
    this.domNode.appendChild(toolbarContainer);
    const textContent = markdownContent.element.textContent ?? localize("chatTip", "Chat tip");
    const hasLink = /\[.*?\]\(.*?\)/.test(tip.content.value);
    const ariaLabel = hasLink ? localize("chatTipWithAction", "{0} Tab to reach the action.", textContent) : textContent;
    this._notice.setAriaLabel(ariaLabel);
  }
  async _handleTipAction(link, mdStr) {
    if (link.startsWith("command:") && this._shouldTriggerSetup()) {
      const setupSucceeded = await this._commandService.executeCommand(CHAT_SETUP_ACTION_ID);
      if (!setupSucceeded) {
        return;
      }
    }
    await openLinkFromMarkdown(this._openerService, link, mdStr.isTrusted);
  }
  _shouldTriggerSetup() {
    if (this._chatEntitlementService.hasByokModels) {
      return false;
    }
    const sentiment = this._chatEntitlementService.sentiment;
    if (!sentiment?.completed) {
      return true;
    }
    return this._chatEntitlementService.entitlement === ChatEntitlement.Unknown;
  }
};
ChatTipContentPart = __decorateClass([
  __decorateParam(2, IChatTipService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IMenuService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, ICommandService),
  __decorateParam(9, IChatEntitlementService)
], ChatTipContentPart);
registerAction2(class PreviousTipAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.previousTip",
      title: localize2("chatTip.previous", "Previous tip"),
      icon: Codicon.chevronLeft,
      precondition: ChatContextKeys.multipleChatTips,
      f1: false,
      menu: [{
        id: MenuId.ChatTipToolbar,
        group: "navigation",
        order: 1
      }]
    });
  }
  async run(accessor) {
    const chatTipService = accessor.get(IChatTipService);
    chatTipService.navigateToPreviousTip();
  }
});
registerAction2(class NextTipAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.nextTip",
      title: localize2("chatTip.next", "Next tip"),
      icon: Codicon.chevronRight,
      precondition: ChatContextKeys.multipleChatTips,
      f1: false,
      menu: [{
        id: MenuId.ChatTipToolbar,
        group: "navigation",
        order: 2
      }]
    });
  }
  async run(accessor) {
    const chatTipService = accessor.get(IChatTipService);
    chatTipService.navigateToNextTip();
  }
});
registerAction2(class DismissTipToolbarAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.dismissTipToolbar",
      title: localize2("chatTip.dismissButton", "Dismiss tip"),
      icon: Codicon.check,
      f1: false,
      menu: [{
        id: MenuId.ChatTipToolbar,
        group: "navigation",
        order: 3
      }]
    });
  }
  async run(accessor) {
    accessor.get(IChatTipService).dismissTipForSession();
  }
});
registerAction2(class DismissTipAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.dismissTip",
      title: localize2("chatTip.dismiss", "Dismiss this tip"),
      f1: false,
      menu: [{
        id: MenuId.ChatTipContext,
        group: "chatTip",
        order: 1
      }]
    });
  }
  async run(accessor) {
    accessor.get(IChatTipService).dismissTipForSession();
  }
});
registerAction2(class DisableTipsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.disableTips",
      title: localize2("chatTip.disableTips", "Disable tips"),
      icon: Codicon.bellSlash,
      f1: false,
      menu: [{
        id: MenuId.ChatTipContext,
        group: "chatTip",
        order: 2
      }, {
        id: MenuId.ChatTipToolbar,
        group: "navigation",
        order: 5
      }]
    });
  }
  async run(accessor) {
    const chatTipService = accessor.get(IChatTipService);
    const commandService = accessor.get(ICommandService);
    await chatTipService.disableTips();
    await commandService.executeCommand("workbench.action.openSettings", "chat.tips.enabled");
  }
});
registerAction2(class ResetDismissedTipsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.resetDismissedTips",
      title: localize2("chatTip.resetDismissedTips", "Reset Dismissed Tips"),
      f1: true,
      precondition: ChatContextKeys.enabled
    });
  }
  async run(accessor) {
    accessor.get(IChatTipService).clearDismissedTips();
  }
});
export {
  ChatTipContentPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdFRpcENvbnRlbnRQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2NoYXRUaXBDb250ZW50LmNzcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgZ2V0RmxhdENvbnRleHRNZW51QWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBNZW51V29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIElNZW51U2VydmljZSwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyLCBvcGVuTGlua0Zyb21NYXJrZG93biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBDSEFUX1NFVFVQX0FDVElPTl9JRCB9IGZyb20gJy4uLy4uL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRUaXAsIElDaGF0VGlwU2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXRUaXBTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRFbnRpdGxlbWVudCwgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRJbnB1dE5vdGljZVZhcmlhbnQsIENoYXRJbnB1dE5vdGljZVdpZGdldCB9IGZyb20gJy4uL2lucHV0L2NoYXRJbnB1dE5vdGljZVdpZGdldC5qcyc7XG5cbmNvbnN0ICQgPSBkb20uJDtcblxuZXhwb3J0IGNsYXNzIENoYXRUaXBDb250ZW50UGFydCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX25vdGljZTogQ2hhdElucHV0Tm90aWNlV2lkZ2V0O1xuXG5cdHB1YmxpYyBnZXQgZG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX25vdGljZS5kb21Ob2RlO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRIaWRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZEhpZGUgPSB0aGlzLl9vbkRpZEhpZGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVuZGVyZWRDb250ZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90b29sYmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPE1lbnVXb3JrYmVuY2hUb29sQmFyPigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pbkNoYXRUaXBDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfbXVsdGlwbGVDaGF0VGlwc0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHRpcDogSUNoYXRUaXAsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmVuZGVyZXI6IElNYXJrZG93blJlbmRlcmVyLFxuXHRcdEBJQ2hhdFRpcFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFRpcFNlcnZpY2U6IElDaGF0VGlwU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdEVudGl0bGVtZW50U2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBCdWlsdCBkZXRhY2hlZDogdGhlIHByZXNlbnRlciBjb21taXRzIHRoaXMgcGFydCBiZWZvcmUgcGFyZW50aW5nIGl0LCBzb1xuXHRcdC8vIGEgcmUtZW50cmFudCByZW5kZXIgY2Fubm90IGxlYXZlIGEgc2Vjb25kIHRpcCBpbiB0aGUgY29udGFpbmVyLlxuXHRcdHRoaXMuX25vdGljZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDaGF0SW5wdXROb3RpY2VXaWRnZXQoe1xuXHRcdFx0dmFyaWFudDogQ2hhdElucHV0Tm90aWNlVmFyaWFudC5UaXAsXG5cdFx0XHRjbGFzc05hbWU6ICdjaGF0LXRpcC13aWRnZXQnLFxuXHRcdFx0YXJpYVJvbGVEZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRUaXBSb2xlRGVzY3JpcHRpb24nLCBcInRpcFwiKSxcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9pbkNoYXRUaXBDb250ZXh0S2V5ID0gQ2hhdENvbnRleHRLZXlzLmluQ2hhdFRpcC5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX211bHRpcGxlQ2hhdFRpcHNDb250ZXh0S2V5ID0gQ2hhdENvbnRleHRLZXlzLm11bHRpcGxlQ2hhdFRpcHMuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBmb2N1c1RyYWNrZXIgPSB0aGlzLl9yZWdpc3Rlcihkb20udHJhY2tGb2N1cyh0aGlzLmRvbU5vZGUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihmb2N1c1RyYWNrZXIub25EaWRGb2N1cygoKSA9PiB0aGlzLl9pbkNoYXRUaXBDb250ZXh0S2V5LnNldCh0cnVlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGZvY3VzVHJhY2tlci5vbkRpZEJsdXIoKCkgPT4gdGhpcy5faW5DaGF0VGlwQ29udGV4dEtleS5zZXQoZmFsc2UpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoe1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9pbkNoYXRUaXBDb250ZXh0S2V5LnJlc2V0KCk7XG5cdFx0XHRcdHRoaXMuX211bHRpcGxlQ2hhdFRpcHNDb250ZXh0S2V5LnJlc2V0KCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZW5kZXJUaXAodGlwKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NoYXRUaXBTZXJ2aWNlLm9uRGlkRGlzbWlzc1RpcCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZEhpZGUuZmlyZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NoYXRUaXBTZXJ2aWNlLm9uRGlkTmF2aWdhdGVUaXAodGlwID0+IHtcblx0XHRcdHRoaXMuX3JlbmRlclRpcCh0aXApO1xuXHRcdFx0ZG9tLnJ1bkF0VGhpc09yU2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShkb20uZ2V0V2luZG93KHRoaXMuZG9tTm9kZSksICgpID0+IHRoaXMuZm9jdXMoKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2hhdFRpcFNlcnZpY2Uub25EaWRIaWRlVGlwKCgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkSGlkZS5maXJlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2hhdFRpcFNlcnZpY2Uub25EaWREaXNhYmxlVGlwcygoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZEhpZGUuZmlyZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5kb21Ob2RlLCBkb20uRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGRvbS5nZXRXaW5kb3codGhpcy5kb21Ob2RlKSwgZSk7XG5cdFx0XHR0aGlzLl9jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBldmVudCxcblx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IG1lbnUgPSB0aGlzLl9tZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhNZW51SWQuQ2hhdFRpcENvbnRleHQsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdFx0XHRyZXR1cm4gZ2V0RmxhdENvbnRleHRNZW51QWN0aW9ucyhtZW51KTtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdGhhc0ZvY3VzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9ub3RpY2UuaGFzRm9jdXMoKTtcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX25vdGljZS5mb2N1cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyVGlwKHRpcDogSUNoYXRUaXApOiB2b2lkIHtcblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuZG9tTm9kZSk7XG5cdFx0dGhpcy5fdG9vbGJhci5jbGVhcigpO1xuXHRcdHRoaXMuX211bHRpcGxlQ2hhdFRpcHNDb250ZXh0S2V5LnNldCh0aGlzLl9jaGF0VGlwU2VydmljZS5oYXNNdWx0aXBsZVRpcHMoKSk7XG5cblx0XHRjb25zdCBtYXJrZG93bkNvbnRlbnQgPSB0aGlzLl9yZW5kZXJlci5yZW5kZXIodGlwLmNvbnRlbnQsIHtcblx0XHRcdGFjdGlvbkhhbmRsZXI6IChsaW5rLCBtZCkgPT4geyB0aGlzLl9oYW5kbGVUaXBBY3Rpb24obGluaywgbWQpLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTsgfVxuXHRcdH0pO1xuXHRcdHRoaXMuX3JlbmRlcmVkQ29udGVudC52YWx1ZSA9IG1hcmtkb3duQ29udGVudDtcblx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kQ2hpbGQobWFya2Rvd25Db250ZW50LmVsZW1lbnQpO1xuXG5cdFx0Ly8gVG9vbGJhciB3aXRoIHByZXZpb3VzLCBuZXh0LCBhbmQgZGlzbWlzcyBhY3Rpb25zIHZpYSBNZW51V29ya2JlbmNoVG9vbEJhclxuXHRcdGNvbnN0IHRvb2xiYXJDb250YWluZXIgPSAkKCcuY2hhdC10aXAtdG9vbGJhcicpO1xuXHRcdHRoaXMuX3Rvb2xiYXIudmFsdWUgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgdG9vbGJhckNvbnRhaW5lciwgTWVudUlkLkNoYXRUaXBUb29sYmFyLCB7XG5cdFx0XHRtZW51T3B0aW9uczoge1xuXHRcdFx0XHRzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0dGhpcy5kb21Ob2RlLmFwcGVuZENoaWxkKHRvb2xiYXJDb250YWluZXIpO1xuXG5cdFx0Y29uc3QgdGV4dENvbnRlbnQgPSBtYXJrZG93bkNvbnRlbnQuZWxlbWVudC50ZXh0Q29udGVudCA/PyBsb2NhbGl6ZSgnY2hhdFRpcCcsIFwiQ2hhdCB0aXBcIik7XG5cdFx0Y29uc3QgaGFzTGluayA9IC9cXFsuKj9cXF1cXCguKj9cXCkvLnRlc3QodGlwLmNvbnRlbnQudmFsdWUpO1xuXHRcdGNvbnN0IGFyaWFMYWJlbCA9IGhhc0xpbmtcblx0XHRcdD8gbG9jYWxpemUoJ2NoYXRUaXBXaXRoQWN0aW9uJywgXCJ7MH0gVGFiIHRvIHJlYWNoIHRoZSBhY3Rpb24uXCIsIHRleHRDb250ZW50KVxuXHRcdFx0OiB0ZXh0Q29udGVudDtcblx0XHR0aGlzLl9ub3RpY2Uuc2V0QXJpYUxhYmVsKGFyaWFMYWJlbCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVUaXBBY3Rpb24obGluazogc3RyaW5nLCBtZFN0cjogSU1hcmtkb3duU3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGxpbmsuc3RhcnRzV2l0aCgnY29tbWFuZDonKSAmJiB0aGlzLl9zaG91bGRUcmlnZ2VyU2V0dXAoKSkge1xuXHRcdFx0Y29uc3Qgc2V0dXBTdWNjZWVkZWQgPSBhd2FpdCB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxib29sZWFuIHwgdW5kZWZpbmVkPihDSEFUX1NFVFVQX0FDVElPTl9JRCk7XG5cdFx0XHRpZiAoIXNldHVwU3VjY2VlZGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhd2FpdCBvcGVuTGlua0Zyb21NYXJrZG93bih0aGlzLl9vcGVuZXJTZXJ2aWNlLCBsaW5rLCBtZFN0ci5pc1RydXN0ZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvdWxkVHJpZ2dlclNldHVwKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmhhc0J5b2tNb2RlbHMpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBzZW50aW1lbnQgPSB0aGlzLl9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudDtcblx0XHRpZiAoIXNlbnRpbWVudD8uY29tcGxldGVkKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LlVua25vd247XG5cdH1cbn1cblxuLy8jcmVnaW9uIFRpcCB0b29sYmFyIGFjdGlvbnNcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFByZXZpb3VzVGlwQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnByZXZpb3VzVGlwJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXRUaXAucHJldmlvdXMnLCBcIlByZXZpb3VzIHRpcFwiKSxcblx0XHRcdGljb246IENvZGljb24uY2hldnJvbkxlZnQsXG5cdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5tdWx0aXBsZUNoYXRUaXBzLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0VGlwVG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2hhdFRpcFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRUaXBTZXJ2aWNlKTtcblx0XHRjaGF0VGlwU2VydmljZS5uYXZpZ2F0ZVRvUHJldmlvdXNUaXAoKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBOZXh0VGlwQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm5leHRUaXAnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdFRpcC5uZXh0JywgXCJOZXh0IHRpcFwiKSxcblx0XHRcdGljb246IENvZGljb24uY2hldnJvblJpZ2h0LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMubXVsdGlwbGVDaGF0VGlwcyxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdFRpcFRvb2xiYXIsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNoYXRUaXBTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0VGlwU2VydmljZSk7XG5cdFx0Y2hhdFRpcFNlcnZpY2UubmF2aWdhdGVUb05leHRUaXAoKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBEaXNtaXNzVGlwVG9vbGJhckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5kaXNtaXNzVGlwVG9vbGJhcicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0VGlwLmRpc21pc3NCdXR0b24nLCBcIkRpc21pc3MgdGlwXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jaGVjayxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdFRpcFRvb2xiYXIsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAzLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGFjY2Vzc29yLmdldChJQ2hhdFRpcFNlcnZpY2UpLmRpc21pc3NUaXBGb3JTZXNzaW9uKCk7XG5cdH1cbn0pO1xuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIFRpcCBjb250ZXh0IG1lbnUgYWN0aW9uc1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRGlzbWlzc1RpcEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5kaXNtaXNzVGlwJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXRUaXAuZGlzbWlzcycsIFwiRGlzbWlzcyB0aGlzIHRpcFwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdFRpcENvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnY2hhdFRpcCcsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGFjY2Vzc29yLmdldChJQ2hhdFRpcFNlcnZpY2UpLmRpc21pc3NUaXBGb3JTZXNzaW9uKCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRGlzYWJsZVRpcHNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuZGlzYWJsZVRpcHMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdFRpcC5kaXNhYmxlVGlwcycsIFwiRGlzYWJsZSB0aXBzXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5iZWxsU2xhc2gsXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRUaXBDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJ2NoYXRUaXAnLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0VGlwVG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDUsXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2hhdFRpcFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRUaXBTZXJ2aWNlKTtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgY2hhdFRpcFNlcnZpY2UuZGlzYWJsZVRpcHMoKTtcblx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnLCAnY2hhdC50aXBzLmVuYWJsZWQnKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBSZXNldERpc21pc3NlZFRpcHNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQucmVzZXREaXNtaXNzZWRUaXBzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXRUaXAucmVzZXREaXNtaXNzZWRUaXBzJywgXCJSZXNldCBEaXNtaXNzZWQgVGlwc1wiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGFjY2Vzc29yLmdldChJQ2hhdFRpcFNlcnZpY2UpLmNsZWFyRGlzbWlzc2VkVGlwcygpO1xuXHR9XG59KTtcblxuLy8jZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFlBQVkseUJBQXlCO0FBRTlDLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxTQUFTLGNBQWMsUUFBUSx1QkFBdUI7QUFDL0QsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQStDO0FBQ3hELFNBQTRCLDRCQUE0QjtBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFtQix1QkFBdUI7QUFDMUMsU0FBUyxpQkFBaUIsK0JBQStCO0FBQ3pELFNBQVMsd0JBQXdCLDZCQUE2QjtBQUU5RCxNQUFNLElBQUksSUFBSTtBQUVQLElBQU0scUJBQU4sY0FBaUMsV0FBVztBQUFBLEVBaUJsRCxZQUNDLEtBQ2lCLFdBQ2lCLGlCQUNJLHFCQUNQLGNBQ00sb0JBQ0csdUJBQ1AsZ0JBQ0MsaUJBQ1EseUJBQ3pDO0FBQ0QsVUFBTTtBQVZXO0FBQ2lCO0FBQ0k7QUFDUDtBQUNNO0FBQ0c7QUFDUDtBQUNDO0FBQ1E7QUFuQjNDLFNBQWlCLGFBQWEsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ2hFLFNBQWdCLFlBQVksS0FBSyxXQUFXO0FBRTVDLFNBQWlCLG1CQUFtQixLQUFLLFVBQVUsSUFBSSxrQkFBa0IsQ0FBQztBQUMxRSxTQUFpQixXQUFXLEtBQUssVUFBVSxJQUFJLGtCQUF3QyxDQUFDO0FBcUJ2RixTQUFLLFVBQVUs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QSxFQUNGO0FBQUEsRUFFQSxNQUFlLElBQUksVUFBMkM7QUFDN0QsYUFBUyxJQUFJLGVBQWUsRUFBRSxxQkFBcUI7QUFBQSxFQUNwRDtBQUNELENBQUM7QUFNRCxnQkFBZ0IsTUFBTSx5QkFBeUIsUUFBUTtBQUFBLEVBQ3RELGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUsbUJBQW1CLGtCQUFrQjtBQUFBLE1BQ3RELElBQUk7QUFBQSxNQUNKLE1BQU0sQ0FBQztBQUFBLFFBQ04sSUFBSSxPQUFPO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsTUFDUixDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBZSxJQUFJLFVBQTJDO0FBQzdELGFBQVMsSUFBSSxlQUFlLEVBQUUscUJBQXFCO0FBQUEsRUFDcEQ7QUFDRCxDQUFDO0FBRUQsZ0JBQWdCLE1BQU0sMEJBQTBCLFFBQVE7QUFBQSxFQUN2RCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLHVCQUF1QixjQUFjO0FBQUEsTUFDdEQsTUFBTSxRQUFRO0FBQUEsTUFDZCxJQUFJO0FBQUEsTUFDSixNQUFNLENBQUM7QUFBQSxRQUNOLElBQUksT0FBTztBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLE1BQ1IsR0FBRztBQUFBLFFBQ0YsSUFBSSxPQUFPO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsTUFDUixDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBZSxJQUFJLFVBQTJDO0FBQzdELFVBQU0saUJBQWlCLFNBQVMsSUFBSSxlQUFlO0FBQ25ELFVBQU0saUJBQWlCLFNBQVMsSUFBSSxlQUFlO0FBRW5ELFVBQU0sZUFBZSxZQUFZO0FBQ2pDLFVBQU0sZUFBZSxlQUFlLGlDQUFpQyxtQkFBbUI7QUFBQSxFQUN6RjtBQUNELENBQUM7QUFFRCxnQkFBZ0IsTUFBTSxpQ0FBaUMsUUFBUTtBQUFBLEVBQzlELGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUsOEJBQThCLHNCQUFzQjtBQUFBLE1BQ3JFLElBQUk7QUFBQSxNQUNKLGNBQWMsZ0JBQWdCO0FBQUEsSUFDL0IsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWUsSUFBSSxVQUEyQztBQUM3RCxhQUFTLElBQUksZUFBZSxFQUFFLG1CQUFtQjtBQUFBLEVBQ2xEO0FBQ0QsQ0FBQzsiLAogICJuYW1lcyI6IFsidGlwIl0KfQo=
