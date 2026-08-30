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
import "./media/chatRequestOrigin.css";
import * as dom from "../../../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../../../base/browser/keyboardEvent.js";
import { Gesture, EventType as TouchEventType } from "../../../../../../base/browser/touch.js";
import { getDefaultHoverDelegate } from "../../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { onUnexpectedError } from "../../../../../../base/common/errors.js";
import { KeyCode } from "../../../../../../base/common/keyCodes.js";
import { Disposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { localize } from "../../../../../../nls.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IChatWidgetService } from "../../chat.js";
import { ChatAgentLocation } from "../../../common/constants.js";
import { ChatRequestOriginKind, IChatRequestOriginService } from "../../../common/chatRequestOrigin.js";
import { IChatService } from "../../../common/chatService/chatService.js";
import { IChatSideChatService } from "../../../common/chatSideChatService.js";
let ChatRequestOriginPart = class extends Disposable {
  constructor(sessionResource, requestOrigin, _chatService, _sideChatService, _requestOriginService, _chatWidgetService, hoverService) {
    super();
    this._chatService = _chatService;
    this._sideChatService = _sideChatService;
    this._requestOriginService = _requestOriginService;
    this._chatWidgetService = _chatWidgetService;
    this._disposeCts = new CancellationTokenSource();
    this._renderVersion = 0;
    this._register(toDisposable(() => this._disposeCts.dispose(true)));
    this.domNode = dom.$(".chat-request-origin.hidden");
    this.domNode.tabIndex = 0;
    this.domNode.setAttribute("role", "button");
    this._register(Gesture.addTarget(this.domNode));
    this._register(hoverService.setupManagedHover(
      getDefaultHoverDelegate("element"),
      this.domNode,
      localize("chat.requestOrigin.openSource", "Open source chat")
    ));
    for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
      this._register(dom.addDisposableListener(this.domNode, eventType, () => {
        this._open();
      }));
    }
    this._register(dom.addDisposableListener(this.domNode, dom.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if ((event.keyCode === KeyCode.Enter || event.keyCode === KeyCode.Space) && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        this._open();
      }
    }));
    if (requestOrigin) {
      this._openSource = () => this._openRequestOrigin(requestOrigin);
      this._renderRequestOrigin(requestOrigin);
      return;
    }
    this._openSource = () => this._sideChatService.revealSideChatSource(sessionResource);
    const origin = this._sideChatService.observeSideChatOrigin(sessionResource);
    this._register(autorun((reader) => {
      this._renderSideChatOrigin(origin.read(reader));
    }));
  }
  _renderRequestOrigin(origin) {
    switch (origin.kind) {
      case ChatRequestOriginKind.Delegation:
        this._renderContent(
          localize("chat.requestOrigin.delegation", "Sent by Codex from another chat"),
          void 0,
          localize("chat.requestOrigin.delegationAriaLabel", "Sent by Codex from another chat. Select to open the source chat.")
        );
        break;
    }
  }
  _renderSideChatOrigin(origin) {
    const renderVersion = ++this._renderVersion;
    if (!origin) {
      dom.clearNode(this.domNode);
      this.domNode.classList.add("hidden");
      this.domNode.removeAttribute("aria-label");
      return;
    }
    const title = origin.sourceTitle ?? localize("chat.sideChatOrigin.originalConversation", "Original conversation");
    let quote;
    let shouldLoadSourceSession = false;
    if (origin.selection) {
      quote = this._normalizeQuote(origin.selection.text);
    } else {
      const sourceSession = this._chatService.getSession(origin.sourceSessionResource);
      if (sourceSession) {
        quote = this._getRequestQuote(sourceSession, origin.sourceTurnId);
      } else {
        shouldLoadSourceSession = true;
      }
    }
    this._renderContent(title, quote);
    if (shouldLoadSourceSession) {
      void this._resolveSourceQuote(origin, title, renderVersion);
    }
  }
  async _resolveSourceQuote(origin, title, renderVersion) {
    try {
      const reference = await this._chatService.acquireOrLoadSession(
        origin.sourceSessionResource,
        ChatAgentLocation.Chat,
        this._disposeCts.token,
        "ChatRequestOriginPart#resolveSourceQuote"
      );
      if (!reference) {
        return;
      }
      try {
        if (this._disposeCts.token.isCancellationRequested || this._store.isDisposed || renderVersion !== this._renderVersion) {
          return;
        }
        const quote = this._getRequestQuote(reference.object, origin.sourceTurnId);
        if (quote && renderVersion === this._renderVersion && !this._store.isDisposed) {
          this._renderContent(title, quote);
        }
      } finally {
        reference.dispose();
      }
    } catch (error) {
      if (!this._disposeCts.token.isCancellationRequested) {
        onUnexpectedError(error);
      }
    }
  }
  _getRequestQuote(sourceSession, sourceTurnId) {
    return this._normalizeQuote(sourceSession.getRequests().find((request) => request.id === sourceTurnId)?.message.text);
  }
  _normalizeQuote(text) {
    const quote = text?.replace(/\s+/g, " ").trim();
    return quote || void 0;
  }
  _renderContent(title, quote, ariaLabel) {
    dom.clearNode(this.domNode);
    this.domNode.classList.remove("hidden");
    this.domNode.classList.toggle("has-no-quote", !quote);
    this.domNode.classList.toggle("delegation", ariaLabel !== void 0);
    const header = dom.$(".chat-request-origin-header");
    const icon = dom.$("span.chat-request-origin-icon");
    icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.reply));
    icon.setAttribute("aria-hidden", "true");
    const titleElement = dom.$("span.chat-request-origin-title");
    titleElement.textContent = title;
    header.append(icon, titleElement);
    this.domNode.appendChild(header);
    if (quote) {
      const quoteElement = dom.$("span.chat-request-origin-quote");
      quoteElement.textContent = quote;
      this.domNode.appendChild(quoteElement);
      this.domNode.setAttribute("aria-label", localize(
        "chat.sideChatOrigin.ariaLabel",
        "Side chat about {0}: {1}. Select to show the original message.",
        title,
        quote
      ));
    } else if (ariaLabel) {
      this.domNode.setAttribute("aria-label", ariaLabel);
    } else {
      this.domNode.setAttribute("aria-label", localize(
        "chat.sideChatOrigin.ariaLabelNoQuote",
        "Side chat about {0}. Select to show the original message.",
        title
      ));
    }
  }
  async _openRequestOrigin(origin) {
    if (!await this._requestOriginService.open(origin)) {
      await this._chatWidgetService.openSession(origin.sourceSessionResource);
    }
  }
  _open() {
    void this._openSource?.().catch(onUnexpectedError);
  }
};
ChatRequestOriginPart = __decorateClass([
  __decorateParam(2, IChatService),
  __decorateParam(3, IChatSideChatService),
  __decorateParam(4, IChatRequestOriginService),
  __decorateParam(5, IChatWidgetService),
  __decorateParam(6, IHoverService)
], ChatRequestOriginPart);
export {
  ChatRequestOriginPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdFJlcXVlc3RPcmlnaW5QYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2NoYXRSZXF1ZXN0T3JpZ2luLmNzcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBHZXN0dXJlLCBFdmVudFR5cGUgYXMgVG91Y2hFdmVudFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdG91Y2guanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0UmVxdWVzdE9yaWdpbktpbmQsIElDaGF0UmVxdWVzdE9yaWdpbiwgSUNoYXRSZXF1ZXN0T3JpZ2luU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0UmVxdWVzdE9yaWdpbi5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTaWRlQ2hhdE9yaWdpbiwgSUNoYXRTaWRlQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNpZGVDaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5cbi8qKiBTaG93cyB3aGVyZSBhIHJlcXVlc3Qgb3Igc2lkZSBjaGF0IG9yaWdpbmF0ZWQgYW5kIG9wZW5zIGl0cyBzb3VyY2UuICovXG5leHBvcnQgY2xhc3MgQ2hhdFJlcXVlc3RPcmlnaW5QYXJ0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zZUN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRwcml2YXRlIF9yZW5kZXJWZXJzaW9uID0gMDtcblx0cHJpdmF0ZSBfb3BlblNvdXJjZTogKCgpID0+IFByb21pc2U8dm9pZD4pIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHNlc3Npb25SZXNvdXJjZTogVVJJLFxuXHRcdHJlcXVlc3RPcmlnaW46IElDaGF0UmVxdWVzdE9yaWdpbiB8IHVuZGVmaW5lZCxcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElDaGF0U2lkZUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3NpZGVDaGF0U2VydmljZTogSUNoYXRTaWRlQ2hhdFNlcnZpY2UsXG5cdFx0QElDaGF0UmVxdWVzdE9yaWdpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmVxdWVzdE9yaWdpblNlcnZpY2U6IElDaGF0UmVxdWVzdE9yaWdpblNlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9kaXNwb3NlQ3RzLmRpc3Bvc2UodHJ1ZSkpKTtcblx0XHR0aGlzLmRvbU5vZGUgPSBkb20uJCgnLmNoYXQtcmVxdWVzdC1vcmlnaW4uaGlkZGVuJyk7XG5cdFx0dGhpcy5kb21Ob2RlLnRhYkluZGV4ID0gMDtcblx0XHR0aGlzLmRvbU5vZGUuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEdlc3R1cmUuYWRkVGFyZ2V0KHRoaXMuZG9tTm9kZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3Zlcihcblx0XHRcdGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksXG5cdFx0XHR0aGlzLmRvbU5vZGUsXG5cdFx0XHRsb2NhbGl6ZSgnY2hhdC5yZXF1ZXN0T3JpZ2luLm9wZW5Tb3VyY2UnLCBcIk9wZW4gc291cmNlIGNoYXRcIiksXG5cdFx0KSk7XG5cblx0XHRmb3IgKGNvbnN0IGV2ZW50VHlwZSBvZiBbZG9tLkV2ZW50VHlwZS5DTElDSywgVG91Y2hFdmVudFR5cGUuVGFwXSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRvbU5vZGUsIGV2ZW50VHlwZSwgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9vcGVuKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5kb21Ob2RlLCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmICgoZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlciB8fCBldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLlNwYWNlKSAmJiAhZXZlbnQubWV0YUtleSAmJiAhZXZlbnQuY3RybEtleSAmJiAhZXZlbnQuYWx0S2V5KSB7XG5cdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLl9vcGVuKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0aWYgKHJlcXVlc3RPcmlnaW4pIHtcblx0XHRcdHRoaXMuX29wZW5Tb3VyY2UgPSAoKSA9PiB0aGlzLl9vcGVuUmVxdWVzdE9yaWdpbihyZXF1ZXN0T3JpZ2luKTtcblx0XHRcdHRoaXMuX3JlbmRlclJlcXVlc3RPcmlnaW4ocmVxdWVzdE9yaWdpbik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fb3BlblNvdXJjZSA9ICgpID0+IHRoaXMuX3NpZGVDaGF0U2VydmljZS5yZXZlYWxTaWRlQ2hhdFNvdXJjZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IG9yaWdpbiA9IHRoaXMuX3NpZGVDaGF0U2VydmljZS5vYnNlcnZlU2lkZUNoYXRPcmlnaW4oc2Vzc2lvblJlc291cmNlKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLl9yZW5kZXJTaWRlQ2hhdE9yaWdpbihvcmlnaW4ucmVhZChyZWFkZXIpKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJSZXF1ZXN0T3JpZ2luKG9yaWdpbjogSUNoYXRSZXF1ZXN0T3JpZ2luKTogdm9pZCB7XG5cdFx0c3dpdGNoIChvcmlnaW4ua2luZCkge1xuXHRcdFx0Y2FzZSBDaGF0UmVxdWVzdE9yaWdpbktpbmQuRGVsZWdhdGlvbjpcblx0XHRcdFx0dGhpcy5fcmVuZGVyQ29udGVudChcblx0XHRcdFx0XHRsb2NhbGl6ZSgnY2hhdC5yZXF1ZXN0T3JpZ2luLmRlbGVnYXRpb24nLCBcIlNlbnQgYnkgQ29kZXggZnJvbSBhbm90aGVyIGNoYXRcIiksXG5cdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdGxvY2FsaXplKCdjaGF0LnJlcXVlc3RPcmlnaW4uZGVsZWdhdGlvbkFyaWFMYWJlbCcsIFwiU2VudCBieSBDb2RleCBmcm9tIGFub3RoZXIgY2hhdC4gU2VsZWN0IHRvIG9wZW4gdGhlIHNvdXJjZSBjaGF0LlwiKSxcblx0XHRcdFx0KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyU2lkZUNoYXRPcmlnaW4ob3JpZ2luOiBJQ2hhdFNpZGVDaGF0T3JpZ2luIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVuZGVyVmVyc2lvbiA9ICsrdGhpcy5fcmVuZGVyVmVyc2lvbjtcblxuXHRcdGlmICghb3JpZ2luKSB7XG5cdFx0XHRkb20uY2xlYXJOb2RlKHRoaXMuZG9tTm9kZSk7XG5cdFx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdFx0XHR0aGlzLmRvbU5vZGUucmVtb3ZlQXR0cmlidXRlKCdhcmlhLWxhYmVsJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRpdGxlID0gb3JpZ2luLnNvdXJjZVRpdGxlID8/IGxvY2FsaXplKCdjaGF0LnNpZGVDaGF0T3JpZ2luLm9yaWdpbmFsQ29udmVyc2F0aW9uJywgXCJPcmlnaW5hbCBjb252ZXJzYXRpb25cIik7XG5cdFx0bGV0IHF1b3RlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHNob3VsZExvYWRTb3VyY2VTZXNzaW9uID0gZmFsc2U7XG5cdFx0aWYgKG9yaWdpbi5zZWxlY3Rpb24pIHtcblx0XHRcdHF1b3RlID0gdGhpcy5fbm9ybWFsaXplUXVvdGUob3JpZ2luLnNlbGVjdGlvbi50ZXh0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgc291cmNlU2Vzc2lvbiA9IHRoaXMuX2NoYXRTZXJ2aWNlLmdldFNlc3Npb24ob3JpZ2luLnNvdXJjZVNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoc291cmNlU2Vzc2lvbikge1xuXHRcdFx0XHRxdW90ZSA9IHRoaXMuX2dldFJlcXVlc3RRdW90ZShzb3VyY2VTZXNzaW9uLCBvcmlnaW4uc291cmNlVHVybklkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNob3VsZExvYWRTb3VyY2VTZXNzaW9uID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fcmVuZGVyQ29udGVudCh0aXRsZSwgcXVvdGUpO1xuXG5cdFx0aWYgKHNob3VsZExvYWRTb3VyY2VTZXNzaW9uKSB7XG5cdFx0XHR2b2lkIHRoaXMuX3Jlc29sdmVTb3VyY2VRdW90ZShvcmlnaW4sIHRpdGxlLCByZW5kZXJWZXJzaW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlU291cmNlUXVvdGUob3JpZ2luOiBJQ2hhdFNpZGVDaGF0T3JpZ2luLCB0aXRsZTogc3RyaW5nLCByZW5kZXJWZXJzaW9uOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVmZXJlbmNlID0gYXdhaXQgdGhpcy5fY2hhdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24oXG5cdFx0XHRcdG9yaWdpbi5zb3VyY2VTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRcdHRoaXMuX2Rpc3Bvc2VDdHMudG9rZW4sXG5cdFx0XHRcdCdDaGF0UmVxdWVzdE9yaWdpblBhcnQjcmVzb2x2ZVNvdXJjZVF1b3RlJyxcblx0XHRcdCk7XG5cdFx0XHRpZiAoIXJlZmVyZW5jZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGlmICh0aGlzLl9kaXNwb3NlQ3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8IHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQgfHwgcmVuZGVyVmVyc2lvbiAhPT0gdGhpcy5fcmVuZGVyVmVyc2lvbikge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHF1b3RlID0gdGhpcy5fZ2V0UmVxdWVzdFF1b3RlKHJlZmVyZW5jZS5vYmplY3QsIG9yaWdpbi5zb3VyY2VUdXJuSWQpO1xuXHRcdFx0XHRpZiAocXVvdGUgJiYgcmVuZGVyVmVyc2lvbiA9PT0gdGhpcy5fcmVuZGVyVmVyc2lvbiAmJiAhdGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdHRoaXMuX3JlbmRlckNvbnRlbnQodGl0bGUsIHF1b3RlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0cmVmZXJlbmNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKCF0aGlzLl9kaXNwb3NlQ3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRSZXF1ZXN0UXVvdGUoc291cmNlU2Vzc2lvbjogSUNoYXRNb2RlbCwgc291cmNlVHVybklkOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9ub3JtYWxpemVRdW90ZShzb3VyY2VTZXNzaW9uLmdldFJlcXVlc3RzKCkuZmluZChyZXF1ZXN0ID0+IHJlcXVlc3QuaWQgPT09IHNvdXJjZVR1cm5JZCk/Lm1lc3NhZ2UudGV4dCk7XG5cdH1cblxuXHRwcml2YXRlIF9ub3JtYWxpemVRdW90ZSh0ZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHF1b3RlID0gdGV4dD8ucmVwbGFjZSgvXFxzKy9nLCAnICcpLnRyaW0oKTtcblx0XHRyZXR1cm4gcXVvdGUgfHwgdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyQ29udGVudCh0aXRsZTogc3RyaW5nLCBxdW90ZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBhcmlhTGFiZWw/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuZG9tTm9kZSk7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdoYXMtbm8tcXVvdGUnLCAhcXVvdGUpO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdkZWxlZ2F0aW9uJywgYXJpYUxhYmVsICE9PSB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgaGVhZGVyID0gZG9tLiQoJy5jaGF0LXJlcXVlc3Qtb3JpZ2luLWhlYWRlcicpO1xuXHRcdGNvbnN0IGljb24gPSBkb20uJCgnc3Bhbi5jaGF0LXJlcXVlc3Qtb3JpZ2luLWljb24nKTtcblx0XHRpY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5yZXBseSkpO1xuXHRcdGljb24uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0Y29uc3QgdGl0bGVFbGVtZW50ID0gZG9tLiQoJ3NwYW4uY2hhdC1yZXF1ZXN0LW9yaWdpbi10aXRsZScpO1xuXHRcdHRpdGxlRWxlbWVudC50ZXh0Q29udGVudCA9IHRpdGxlO1xuXHRcdGhlYWRlci5hcHBlbmQoaWNvbiwgdGl0bGVFbGVtZW50KTtcblx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kQ2hpbGQoaGVhZGVyKTtcblxuXHRcdGlmIChxdW90ZSkge1xuXHRcdFx0Y29uc3QgcXVvdGVFbGVtZW50ID0gZG9tLiQoJ3NwYW4uY2hhdC1yZXF1ZXN0LW9yaWdpbi1xdW90ZScpO1xuXHRcdFx0cXVvdGVFbGVtZW50LnRleHRDb250ZW50ID0gcXVvdGU7XG5cdFx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kQ2hpbGQocXVvdGVFbGVtZW50KTtcblx0XHRcdHRoaXMuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZShcblx0XHRcdFx0J2NoYXQuc2lkZUNoYXRPcmlnaW4uYXJpYUxhYmVsJyxcblx0XHRcdFx0XCJTaWRlIGNoYXQgYWJvdXQgezB9OiB7MX0uIFNlbGVjdCB0byBzaG93IHRoZSBvcmlnaW5hbCBtZXNzYWdlLlwiLFxuXHRcdFx0XHR0aXRsZSxcblx0XHRcdFx0cXVvdGUsXG5cdFx0XHQpKTtcblx0XHR9IGVsc2UgaWYgKGFyaWFMYWJlbCkge1xuXHRcdFx0dGhpcy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGFyaWFMYWJlbCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZShcblx0XHRcdFx0J2NoYXQuc2lkZUNoYXRPcmlnaW4uYXJpYUxhYmVsTm9RdW90ZScsXG5cdFx0XHRcdFwiU2lkZSBjaGF0IGFib3V0IHswfS4gU2VsZWN0IHRvIHNob3cgdGhlIG9yaWdpbmFsIG1lc3NhZ2UuXCIsXG5cdFx0XHRcdHRpdGxlLFxuXHRcdFx0KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfb3BlblJlcXVlc3RPcmlnaW4ob3JpZ2luOiBJQ2hhdFJlcXVlc3RPcmlnaW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWF3YWl0IHRoaXMuX3JlcXVlc3RPcmlnaW5TZXJ2aWNlLm9wZW4ob3JpZ2luKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fY2hhdFdpZGdldFNlcnZpY2Uub3BlblNlc3Npb24ob3JpZ2luLnNvdXJjZVNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb3BlbigpOiB2b2lkIHtcblx0XHR2b2lkIHRoaXMuX29wZW5Tb3VyY2U/LigpLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsU0FBUyxhQUFhLHNCQUFzQjtBQUNyRCxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSxvQkFBb0I7QUFDekMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsdUJBQTJDLGlDQUFpQztBQUNyRixTQUFTLG9CQUFvQjtBQUM3QixTQUE4Qiw0QkFBNEI7QUFJbkQsSUFBTSx3QkFBTixjQUFvQyxXQUFXO0FBQUEsRUFRckQsWUFDQyxpQkFDQSxlQUMrQixjQUNRLGtCQUNLLHVCQUNQLG9CQUN0QixjQUNkO0FBQ0QsVUFBTTtBQU55QjtBQUNRO0FBQ0s7QUFDUDtBQVZ0QyxTQUFpQixjQUFjLElBQUksd0JBQXdCO0FBQzNELFNBQVEsaUJBQWlCO0FBY3hCLFNBQUssVUFBVSxhQUFhLE1BQU0sS0FBSyxZQUFZLFFBQVEsSUFBSSxDQUFDLENBQUM7QUFDakUsU0FBSyxVQUFVLElBQUksRUFBRSw2QkFBNkI7QUFDbEQsU0FBSyxRQUFRLFdBQVc7QUFDeEIsU0FBSyxRQUFRLGFBQWEsUUFBUSxRQUFRO0FBQzFD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
