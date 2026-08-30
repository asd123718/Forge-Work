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
import "./media/chatReadOnlyBanner.css";
import * as dom from "../../../../../base/browser/dom.js";
import { renderIcon } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../nls.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
const CHAT_READ_ONLY_BANNER_HEIGHT = 26;
let ChatReadOnlyBanner = class extends Disposable {
  constructor(message = localize("chatReadOnlyBanner.archivedMessage", "Archived sessions are read-only."), hoverService) {
    super();
    this._visible = false;
    this.domNode = dom.$(".chat-readonly-banner");
    this.domNode.setAttribute("role", "status");
    const icon = dom.append(this.domNode, dom.$(".chat-readonly-banner-icon"));
    const renderedIcon = renderIcon(Codicon.lock);
    renderedIcon.setAttribute("aria-hidden", "true");
    icon.appendChild(renderedIcon);
    const text = dom.append(this.domNode, dom.$("span.chat-readonly-banner-text"));
    text.textContent = message;
    this._register(hoverService.setupDelayedHover(text, { content: message }));
    this.setVisible(false);
  }
  get visible() {
    return this._visible;
  }
  setVisible(visible) {
    this._visible = visible;
    this.domNode.classList.toggle("hidden", !visible);
  }
};
ChatReadOnlyBanner = __decorateClass([
  __decorateParam(1, IHoverService)
], ChatReadOnlyBanner);
export {
  CHAT_READ_ONLY_BANNER_HEIGHT,
  ChatReadOnlyBanner
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdFJlYWRPbmx5QmFubmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2NoYXRSZWFkT25seUJhbm5lci5jc3MnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5cbmV4cG9ydCBjb25zdCBDSEFUX1JFQURfT05MWV9CQU5ORVJfSEVJR0hUID0gMjY7XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVhZE9ubHlCYW5uZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRyZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIF92aXNpYmxlID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bWVzc2FnZTogc3RyaW5nID0gbG9jYWxpemUoJ2NoYXRSZWFkT25seUJhbm5lci5hcmNoaXZlZE1lc3NhZ2UnLCBcIkFyY2hpdmVkIHNlc3Npb25zIGFyZSByZWFkLW9ubHkuXCIpLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZG9tTm9kZSA9IGRvbS4kKCcuY2hhdC1yZWFkb25seS1iYW5uZXInKTtcblx0XHR0aGlzLmRvbU5vZGUuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3N0YXR1cycpO1xuXG5cdFx0Y29uc3QgaWNvbiA9IGRvbS5hcHBlbmQodGhpcy5kb21Ob2RlLCBkb20uJCgnLmNoYXQtcmVhZG9ubHktYmFubmVyLWljb24nKSk7XG5cdFx0Y29uc3QgcmVuZGVyZWRJY29uID0gcmVuZGVySWNvbihDb2RpY29uLmxvY2spO1xuXHRcdHJlbmRlcmVkSWNvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRpY29uLmFwcGVuZENoaWxkKHJlbmRlcmVkSWNvbik7XG5cblx0XHRjb25zdCB0ZXh0ID0gZG9tLmFwcGVuZCh0aGlzLmRvbU5vZGUsIGRvbS4kKCdzcGFuLmNoYXQtcmVhZG9ubHktYmFubmVyLXRleHQnKSk7XG5cdFx0dGV4dC50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHRleHQsIHsgY29udGVudDogbWVzc2FnZSB9KSk7XG5cblx0XHR0aGlzLnNldFZpc2libGUoZmFsc2UpO1xuXHR9XG5cblx0Z2V0IHZpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Zpc2libGU7XG5cdH1cblxuXHRzZXRWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl92aXNpYmxlID0gdmlzaWJsZTtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgIXZpc2libGUpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCO0FBRXZCLE1BQU0sK0JBQStCO0FBRXJDLElBQU0scUJBQU4sY0FBaUMsV0FBVztBQUFBLEVBTWxELFlBQ0MsVUFBa0IsU0FBUyxzQ0FBc0Msa0NBQWtDLEdBQ3BGLGNBQ2Q7QUFDRCxVQUFNO0FBTlAsU0FBUSxXQUFXO0FBUWxCLFNBQUssVUFBVSxJQUFJLEVBQUUsdUJBQXVCO0FBQzVDLFNBQUssUUFBUSxhQUFhLFFBQVEsUUFBUTtBQUUxQyxVQUFNLE9BQU8sSUFBSSxPQUFPLEtBQUssU0FBUyxJQUFJLEVBQUUsNEJBQTRCLENBQUM7QUFDekUsVUFBTSxlQUFlLFdBQVcsUUFBUSxJQUFJO0FBQzVDLGlCQUFhLGFBQWEsZUFBZSxNQUFNO0FBQy9DLFNBQUssWUFBWSxZQUFZO0FBRTdCLFVBQU0sT0FBTyxJQUFJLE9BQU8sS0FBSyxTQUFTLElBQUksRUFBRSxnQ0FBZ0MsQ0FBQztBQUM3RSxTQUFLLGNBQWM7QUFDbkIsU0FBSyxVQUFVLGFBQWEsa0JBQWtCLE1BQU0sRUFBRSxTQUFTLFFBQVEsQ0FBQyxDQUFDO0FBRXpFLFNBQUssV0FBVyxLQUFLO0FBQUEsRUFDdEI7QUFBQSxFQUVBLElBQUksVUFBbUI7QUFDdEIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsV0FBVyxTQUF3QjtBQUNsQyxTQUFLLFdBQVc7QUFDaEIsU0FBSyxRQUFRLFVBQVUsT0FBTyxVQUFVLENBQUMsT0FBTztBQUFBLEVBQ2pEO0FBQ0Q7QUFuQ2EscUJBQU47QUFBQSxFQVFKO0FBQUEsR0FSVTsiLAogICJuYW1lcyI6IFtdCn0K
