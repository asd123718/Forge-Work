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
import * as dom from "../../../../../base/browser/dom.js";
import { renderIcon } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { FileAccess } from "../../../../../base/common/network.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { getFullyQualifiedId, IChatAgentNameService, IChatAgentService } from "../../common/participants/chatAgents.js";
import { showExtensionsWithIdsCommandId } from "../../../extensions/browser/extensionsActions.js";
import { IExtensionsWorkbenchService } from "../../../extensions/common/extensions.js";
import { verifiedPublisherIcon } from "../../../../services/extensionManagement/common/extensionsIcons.js";
let ChatAgentHover = class extends Disposable {
  constructor(chatAgentService, extensionService, chatAgentNameService) {
    super();
    this.chatAgentService = chatAgentService;
    this.extensionService = extensionService;
    this.chatAgentNameService = chatAgentNameService;
    this._onDidChangeContents = this._register(new Emitter());
    this.onDidChangeContents = this._onDidChangeContents.event;
    const hoverElement = dom.h(
      ".chat-agent-hover@root",
      [
        dom.h(".chat-agent-hover-header", [
          dom.h(".chat-agent-hover-icon@icon"),
          dom.h(".chat-agent-hover-details", [
            dom.h(".chat-agent-hover-name@name"),
            dom.h(".chat-agent-hover-extension", [
              dom.h(".chat-agent-hover-extension-name@extensionName"),
              dom.h(".chat-agent-hover-separator@separator"),
              dom.h(".chat-agent-hover-publisher@publisher")
            ])
          ])
        ]),
        dom.h(".chat-agent-hover-warning@warning"),
        dom.h("span.chat-agent-hover-description@description")
      ]
    );
    this.domNode = hoverElement.root;
    this.icon = hoverElement.icon;
    this.name = hoverElement.name;
    this.extensionName = hoverElement.extensionName;
    this.description = hoverElement.description;
    hoverElement.separator.textContent = "|";
    const verifiedBadge = dom.$("span.extension-verified-publisher", void 0, renderIcon(verifiedPublisherIcon));
    this.publisherName = dom.$("span.chat-agent-hover-publisher-name");
    dom.append(
      hoverElement.publisher,
      verifiedBadge,
      this.publisherName
    );
    hoverElement.warning.appendChild(renderIcon(Codicon.warning));
    hoverElement.warning.appendChild(dom.$("span", void 0, localize("reservedName", "This chat extension is using a reserved name.")));
  }
  setAgent(id) {
    const agent = this.chatAgentService.getAgent(id);
    if (agent.metadata.icon instanceof URI) {
      const avatarIcon = dom.$("img.icon");
      avatarIcon.src = FileAccess.uriToBrowserUri(agent.metadata.icon).toString(true);
      this.icon.replaceChildren(dom.$(".avatar", void 0, avatarIcon));
    } else if (agent.metadata.themeIcon) {
      const avatarIcon = dom.$(ThemeIcon.asCSSSelector(agent.metadata.themeIcon));
      this.icon.replaceChildren(dom.$(".avatar.codicon-avatar", void 0, avatarIcon));
    }
    this.domNode.classList.toggle("noExtensionName", !!agent.isDynamic);
    const isAllowed = this.chatAgentNameService.getAgentNameRestriction(agent);
    this.name.textContent = isAllowed ? `@${agent.name}` : getFullyQualifiedId(agent);
    this.extensionName.textContent = agent.extensionDisplayName;
    this.publisherName.textContent = agent.publisherDisplayName ?? agent.extensionPublisherId;
    let description = agent.description ?? "";
    if (description) {
      if (!description.match(/[\.\?\!] *$/)) {
        description += ".";
      }
    }
    this.description.textContent = description;
    this.domNode.classList.toggle("allowedName", isAllowed);
    this.domNode.classList.toggle("verifiedPublisher", false);
    if (!agent.isDynamic) {
      const cancel = this._register(new CancellationTokenSource());
      this.extensionService.getExtensions([{ id: agent.extensionId.value }], cancel.token).then((extensions) => {
        cancel.dispose();
        const extension = extensions[0];
        if (extension?.publisherDomain?.verified) {
          this.domNode.classList.toggle("verifiedPublisher", true);
          this._onDidChangeContents.fire();
        }
      });
    }
  }
};
ChatAgentHover = __decorateClass([
  __decorateParam(0, IChatAgentService),
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IChatAgentNameService)
], ChatAgentHover);
function getChatAgentHoverOptions(getAgent, commandService) {
  const viewExtensionAction = {
    commandId: showExtensionsWithIdsCommandId,
    label: localize("viewExtensionLabel", "View Extension"),
    run: () => {
      const agent = getAgent();
      if (agent) {
        commandService.executeCommand(showExtensionsWithIdsCommandId, [agent.extensionId.value]);
      }
    }
  };
  return {
    get actions() {
      return getAgent()?.isCore ? [] : [viewExtensionAction];
    }
  };
}
export {
  ChatAgentHover,
  getChatAgentHoverOptions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdEFnZW50SG92ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJBY3Rpb24sIElNYW5hZ2VkSG92ZXJPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBnZXRGdWxseVF1YWxpZmllZElkLCBJQ2hhdEFnZW50RGF0YSwgSUNoYXRBZ2VudE5hbWVTZXJ2aWNlLCBJQ2hhdEFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBzaG93RXh0ZW5zaW9uc1dpdGhJZHNDb21tYW5kSWQgfSBmcm9tICcuLi8uLi8uLi9leHRlbnNpb25zL2Jyb3dzZXIvZXh0ZW5zaW9uc0FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyB2ZXJpZmllZFB1Ymxpc2hlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25zSWNvbnMuanMnO1xuXG5leHBvcnQgY2xhc3MgQ2hhdEFnZW50SG92ZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHVibGljIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaWNvbjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgbmFtZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTmFtZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgcHVibGlzaGVyTmFtZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGVzY3JpcHRpb246IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29udGVudHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29udGVudHM6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VDb250ZW50cy5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0QWdlbnRTZXJ2aWNlOiBJQ2hhdEFnZW50U2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJQ2hhdEFnZW50TmFtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0QWdlbnROYW1lU2VydmljZTogSUNoYXRBZ2VudE5hbWVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgaG92ZXJFbGVtZW50ID0gZG9tLmgoXG5cdFx0XHQnLmNoYXQtYWdlbnQtaG92ZXJAcm9vdCcsXG5cdFx0XHRbXG5cdFx0XHRcdGRvbS5oKCcuY2hhdC1hZ2VudC1ob3Zlci1oZWFkZXInLCBbXG5cdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LWFnZW50LWhvdmVyLWljb25AaWNvbicpLFxuXHRcdFx0XHRcdGRvbS5oKCcuY2hhdC1hZ2VudC1ob3Zlci1kZXRhaWxzJywgW1xuXHRcdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LWFnZW50LWhvdmVyLW5hbWVAbmFtZScpLFxuXHRcdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LWFnZW50LWhvdmVyLWV4dGVuc2lvbicsIFtcblx0XHRcdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LWFnZW50LWhvdmVyLWV4dGVuc2lvbi1uYW1lQGV4dGVuc2lvbk5hbWUnKSxcblx0XHRcdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LWFnZW50LWhvdmVyLXNlcGFyYXRvckBzZXBhcmF0b3InKSxcblx0XHRcdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LWFnZW50LWhvdmVyLXB1Ymxpc2hlckBwdWJsaXNoZXInKSxcblx0XHRcdFx0XHRcdF0pLFxuXHRcdFx0XHRcdF0pLFxuXHRcdFx0XHRdKSxcblx0XHRcdFx0ZG9tLmgoJy5jaGF0LWFnZW50LWhvdmVyLXdhcm5pbmdAd2FybmluZycpLFxuXHRcdFx0XHRkb20uaCgnc3Bhbi5jaGF0LWFnZW50LWhvdmVyLWRlc2NyaXB0aW9uQGRlc2NyaXB0aW9uJyksXG5cdFx0XHRdKTtcblx0XHR0aGlzLmRvbU5vZGUgPSBob3ZlckVsZW1lbnQucm9vdDtcblxuXHRcdHRoaXMuaWNvbiA9IGhvdmVyRWxlbWVudC5pY29uO1xuXHRcdHRoaXMubmFtZSA9IGhvdmVyRWxlbWVudC5uYW1lO1xuXHRcdHRoaXMuZXh0ZW5zaW9uTmFtZSA9IGhvdmVyRWxlbWVudC5leHRlbnNpb25OYW1lO1xuXHRcdHRoaXMuZGVzY3JpcHRpb24gPSBob3ZlckVsZW1lbnQuZGVzY3JpcHRpb247XG5cblx0XHRob3ZlckVsZW1lbnQuc2VwYXJhdG9yLnRleHRDb250ZW50ID0gJ3wnO1xuXG5cdFx0Y29uc3QgdmVyaWZpZWRCYWRnZSA9IGRvbS4kKCdzcGFuLmV4dGVuc2lvbi12ZXJpZmllZC1wdWJsaXNoZXInLCB1bmRlZmluZWQsIHJlbmRlckljb24odmVyaWZpZWRQdWJsaXNoZXJJY29uKSk7XG5cblx0XHR0aGlzLnB1Ymxpc2hlck5hbWUgPSBkb20uJCgnc3Bhbi5jaGF0LWFnZW50LWhvdmVyLXB1Ymxpc2hlci1uYW1lJyk7XG5cdFx0ZG9tLmFwcGVuZChcblx0XHRcdGhvdmVyRWxlbWVudC5wdWJsaXNoZXIsXG5cdFx0XHR2ZXJpZmllZEJhZGdlLFxuXHRcdFx0dGhpcy5wdWJsaXNoZXJOYW1lKTtcblxuXHRcdGhvdmVyRWxlbWVudC53YXJuaW5nLmFwcGVuZENoaWxkKHJlbmRlckljb24oQ29kaWNvbi53YXJuaW5nKSk7XG5cdFx0aG92ZXJFbGVtZW50Lndhcm5pbmcuYXBwZW5kQ2hpbGQoZG9tLiQoJ3NwYW4nLCB1bmRlZmluZWQsIGxvY2FsaXplKCdyZXNlcnZlZE5hbWUnLCBcIlRoaXMgY2hhdCBleHRlbnNpb24gaXMgdXNpbmcgYSByZXNlcnZlZCBuYW1lLlwiKSkpO1xuXHR9XG5cblx0c2V0QWdlbnQoaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGFnZW50ID0gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldEFnZW50KGlkKSE7XG5cdFx0aWYgKGFnZW50Lm1ldGFkYXRhLmljb24gaW5zdGFuY2VvZiBVUkkpIHtcblx0XHRcdGNvbnN0IGF2YXRhckljb24gPSBkb20uJDxIVE1MSW1hZ2VFbGVtZW50PignaW1nLmljb24nKTtcblx0XHRcdGF2YXRhckljb24uc3JjID0gRmlsZUFjY2Vzcy51cmlUb0Jyb3dzZXJVcmkoYWdlbnQubWV0YWRhdGEuaWNvbikudG9TdHJpbmcodHJ1ZSk7XG5cdFx0XHR0aGlzLmljb24ucmVwbGFjZUNoaWxkcmVuKGRvbS4kKCcuYXZhdGFyJywgdW5kZWZpbmVkLCBhdmF0YXJJY29uKSk7XG5cdFx0fSBlbHNlIGlmIChhZ2VudC5tZXRhZGF0YS50aGVtZUljb24pIHtcblx0XHRcdGNvbnN0IGF2YXRhckljb24gPSBkb20uJChUaGVtZUljb24uYXNDU1NTZWxlY3RvcihhZ2VudC5tZXRhZGF0YS50aGVtZUljb24pKTtcblx0XHRcdHRoaXMuaWNvbi5yZXBsYWNlQ2hpbGRyZW4oZG9tLiQoJy5hdmF0YXIuY29kaWNvbi1hdmF0YXInLCB1bmRlZmluZWQsIGF2YXRhckljb24pKTtcblx0XHR9XG5cblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnbm9FeHRlbnNpb25OYW1lJywgISFhZ2VudC5pc0R5bmFtaWMpO1xuXG5cdFx0Y29uc3QgaXNBbGxvd2VkID0gdGhpcy5jaGF0QWdlbnROYW1lU2VydmljZS5nZXRBZ2VudE5hbWVSZXN0cmljdGlvbihhZ2VudCk7XG5cdFx0dGhpcy5uYW1lLnRleHRDb250ZW50ID0gaXNBbGxvd2VkID8gYEAke2FnZW50Lm5hbWV9YCA6IGdldEZ1bGx5UXVhbGlmaWVkSWQoYWdlbnQpO1xuXHRcdHRoaXMuZXh0ZW5zaW9uTmFtZS50ZXh0Q29udGVudCA9IGFnZW50LmV4dGVuc2lvbkRpc3BsYXlOYW1lO1xuXHRcdHRoaXMucHVibGlzaGVyTmFtZS50ZXh0Q29udGVudCA9IGFnZW50LnB1Ymxpc2hlckRpc3BsYXlOYW1lID8/IGFnZW50LmV4dGVuc2lvblB1Ymxpc2hlcklkO1xuXG5cdFx0bGV0IGRlc2NyaXB0aW9uID0gYWdlbnQuZGVzY3JpcHRpb24gPz8gJyc7XG5cdFx0aWYgKGRlc2NyaXB0aW9uKSB7XG5cdFx0XHRpZiAoIWRlc2NyaXB0aW9uLm1hdGNoKC9bXFwuXFw/XFwhXSAqJC8pKSB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uICs9ICcuJztcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmRlc2NyaXB0aW9uLnRleHRDb250ZW50ID0gZGVzY3JpcHRpb247XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2FsbG93ZWROYW1lJywgaXNBbGxvd2VkKTtcblxuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCd2ZXJpZmllZFB1Ymxpc2hlcicsIGZhbHNlKTtcblx0XHRpZiAoIWFnZW50LmlzRHluYW1pYykge1xuXHRcdFx0Y29uc3QgY2FuY2VsID0gdGhpcy5fcmVnaXN0ZXIobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXHRcdFx0dGhpcy5leHRlbnNpb25TZXJ2aWNlLmdldEV4dGVuc2lvbnMoW3sgaWQ6IGFnZW50LmV4dGVuc2lvbklkLnZhbHVlIH1dLCBjYW5jZWwudG9rZW4pLnRoZW4oZXh0ZW5zaW9ucyA9PiB7XG5cdFx0XHRcdGNhbmNlbC5kaXNwb3NlKCk7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IGV4dGVuc2lvbnNbMF07XG5cdFx0XHRcdGlmIChleHRlbnNpb24/LnB1Ymxpc2hlckRvbWFpbj8udmVyaWZpZWQpIHtcblx0XHRcdFx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgndmVyaWZpZWRQdWJsaXNoZXInLCB0cnVlKTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnRzLmZpcmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDaGF0QWdlbnRIb3Zlck9wdGlvbnMoZ2V0QWdlbnQ6ICgpID0+IElDaGF0QWdlbnREYXRhIHwgdW5kZWZpbmVkLCBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlKTogSU1hbmFnZWRIb3Zlck9wdGlvbnMge1xuXHRjb25zdCB2aWV3RXh0ZW5zaW9uQWN0aW9uOiBJSG92ZXJBY3Rpb24gPSB7XG5cdFx0Y29tbWFuZElkOiBzaG93RXh0ZW5zaW9uc1dpdGhJZHNDb21tYW5kSWQsXG5cdFx0bGFiZWw6IGxvY2FsaXplKCd2aWV3RXh0ZW5zaW9uTGFiZWwnLCBcIlZpZXcgRXh0ZW5zaW9uXCIpLFxuXHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBnZXRBZ2VudCgpO1xuXHRcdFx0aWYgKGFnZW50KSB7XG5cdFx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKHNob3dFeHRlbnNpb25zV2l0aElkc0NvbW1hbmRJZCwgW2FnZW50LmV4dGVuc2lvbklkLnZhbHVlXSk7XG5cdFx0XHR9XG5cdFx0fSxcblx0fTtcblxuXHQvLyBgYWN0aW9uc2AgaXMgYSBnZXR0ZXIgc28gdGhlIGFnZW50IGlzIG9ubHkgcmVzb2x2ZWQgYXQgaG92ZXItc2hvdyB0aW1lLlxuXHQvLyBTb21lIGNhbGxlcnMgKGUuZy4gY2hhdExpc3RSZW5kZXJlcikgY29uc3RydWN0IHRoZXNlIG9wdGlvbnMgYmVmb3JlIHRoZVxuXHQvLyBzdXJyb3VuZGluZyB0ZW1wbGF0ZSBpcyBpbml0aWFsaXplZCwgc28gY2FsbGluZyBgZ2V0QWdlbnQoKWAgZWFnZXJseSBoZXJlXG5cdC8vIHdvdWxkIGhpdCBhIFREWiBvbiB0aGUgY2FwdHVyZWQgYHRlbXBsYXRlYCB2YXJpYWJsZS5cblx0Ly8gQ29yZSBhZ2VudHMgKGUuZy4gYWdlbnQgaG9zdCkgaGF2ZSBhIHBsYWNlaG9sZGVyIGV4dGVuc2lvbiBpZCBhbmQgbm8gcmVhbFxuXHQvLyBleHRlbnNpb24gdG8gdmlldywgc28gd2Ugb21pdCB0aGUgYWN0aW9uIGZvciB0aGVtLlxuXHRyZXR1cm4ge1xuXHRcdGdldCBhY3Rpb25zKCkge1xuXHRcdFx0cmV0dXJuIGdldEFnZW50KCk/LmlzQ29yZSA/IFtdIDogW3ZpZXdFeHRlbnNpb25BY3Rpb25dO1xuXHRcdH1cblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBRXJCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLHFCQUFxQyx1QkFBdUIseUJB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
