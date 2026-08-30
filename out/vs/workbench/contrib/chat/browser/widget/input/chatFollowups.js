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
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../../nls.js";
import { IChatAgentService } from "../../../common/participants/chatAgents.js";
import { formatChatQuestion } from "../../../common/requestParser/chatParserTypes.js";
const $ = dom.$;
let ChatFollowups = class extends Disposable {
  constructor(container, followups, location, options, clickHandler, chatAgentService) {
    super();
    this.location = location;
    this.options = options;
    this.clickHandler = clickHandler;
    this.chatAgentService = chatAgentService;
    const followupsContainer = dom.append(container, $(".interactive-session-followups"));
    followups.forEach((followup) => this.renderFollowup(followupsContainer, followup));
  }
  renderFollowup(container, followup) {
    if (!this.chatAgentService.getDefaultAgent(this.location)) {
      return;
    }
    const tooltipPrefix = formatChatQuestion(this.chatAgentService, this.location, "", followup.agentId, followup.subCommand);
    if (tooltipPrefix === void 0) {
      return;
    }
    const baseTitle = followup.kind === "reply" ? followup.title || followup.message : followup.title;
    const message = followup.kind === "reply" ? followup.message : followup.title;
    const tooltip = (tooltipPrefix + (followup.tooltip || message)).trim();
    const button = this._register(new Button(container, { ...this.options, title: tooltip }));
    if (followup.kind === "reply") {
      button.element.classList.add("interactive-followup-reply");
    } else if (followup.kind === "command") {
      button.element.classList.add("interactive-followup-command");
    }
    button.element.ariaLabel = localize("followUpAriaLabel", "Follow up question: {0}", baseTitle);
    button.label = new MarkdownString(baseTitle);
    this._register(button.onDidClick(() => this.clickHandler(followup)));
  }
};
ChatFollowups = __decorateClass([
  __decorateParam(5, IChatAgentService)
], ChatFollowups);
export {
  ChatFollowups
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXGNoYXRGb2xsb3d1cHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBCdXR0b24sIElCdXR0b25TdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGFydGljaXBhbnRzL2NoYXRBZ2VudHMuanMnO1xuaW1wb3J0IHsgZm9ybWF0Q2hhdFF1ZXN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3JlcXVlc3RQYXJzZXIvY2hhdFBhcnNlclR5cGVzLmpzJztcbmltcG9ydCB7IElDaGF0Rm9sbG93dXAgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcblxuY29uc3QgJCA9IGRvbS4kO1xuXG5leHBvcnQgY2xhc3MgQ2hhdEZvbGxvd3VwczxUIGV4dGVuZHMgSUNoYXRGb2xsb3d1cD4gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRmb2xsb3d1cHM6IFRbXSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM6IElCdXR0b25TdHlsZXMgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjbGlja0hhbmRsZXI6IChmb2xsb3d1cDogVCkgPT4gdm9pZCxcblx0XHRASUNoYXRBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0QWdlbnRTZXJ2aWNlOiBJQ2hhdEFnZW50U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgZm9sbG93dXBzQ29udGFpbmVyID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5pbnRlcmFjdGl2ZS1zZXNzaW9uLWZvbGxvd3VwcycpKTtcblx0XHRmb2xsb3d1cHMuZm9yRWFjaChmb2xsb3d1cCA9PiB0aGlzLnJlbmRlckZvbGxvd3VwKGZvbGxvd3Vwc0NvbnRhaW5lciwgZm9sbG93dXApKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRm9sbG93dXAoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZm9sbG93dXA6IFQpOiB2b2lkIHtcblxuXHRcdGlmICghdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldERlZmF1bHRBZ2VudCh0aGlzLmxvY2F0aW9uKSkge1xuXHRcdFx0Ly8gTm8gZGVmYXVsdCBhZ2VudCB5ZXQsIHdoaWNoIGFmZmVjdHMgaG93IGZvbGxvd3VwcyBhcmUgcmVuZGVyZWQsIHNvIGNhbid0IHJlbmRlciB0aGlzIHlldFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRvb2x0aXBQcmVmaXggPSBmb3JtYXRDaGF0UXVlc3Rpb24odGhpcy5jaGF0QWdlbnRTZXJ2aWNlLCB0aGlzLmxvY2F0aW9uLCAnJywgZm9sbG93dXAuYWdlbnRJZCwgZm9sbG93dXAuc3ViQ29tbWFuZCk7XG5cdFx0aWYgKHRvb2x0aXBQcmVmaXggPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGJhc2VUaXRsZSA9IGZvbGxvd3VwLmtpbmQgPT09ICdyZXBseScgP1xuXHRcdFx0KGZvbGxvd3VwLnRpdGxlIHx8IGZvbGxvd3VwLm1lc3NhZ2UpXG5cdFx0XHQ6IGZvbGxvd3VwLnRpdGxlO1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSBmb2xsb3d1cC5raW5kID09PSAncmVwbHknID8gZm9sbG93dXAubWVzc2FnZSA6IGZvbGxvd3VwLnRpdGxlO1xuXHRcdGNvbnN0IHRvb2x0aXAgPSAodG9vbHRpcFByZWZpeCArXG5cdFx0XHQoZm9sbG93dXAudG9vbHRpcCB8fCBtZXNzYWdlKSkudHJpbSgpO1xuXHRcdGNvbnN0IGJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24oY29udGFpbmVyLCB7IC4uLnRoaXMub3B0aW9ucywgdGl0bGU6IHRvb2x0aXAgfSkpO1xuXHRcdGlmIChmb2xsb3d1cC5raW5kID09PSAncmVwbHknKSB7XG5cdFx0XHRidXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdpbnRlcmFjdGl2ZS1mb2xsb3d1cC1yZXBseScpO1xuXHRcdH0gZWxzZSBpZiAoZm9sbG93dXAua2luZCA9PT0gJ2NvbW1hbmQnKSB7XG5cdFx0XHRidXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdpbnRlcmFjdGl2ZS1mb2xsb3d1cC1jb21tYW5kJyk7XG5cdFx0fVxuXHRcdGJ1dHRvbi5lbGVtZW50LmFyaWFMYWJlbCA9IGxvY2FsaXplKCdmb2xsb3dVcEFyaWFMYWJlbCcsIFwiRm9sbG93IHVwIHF1ZXN0aW9uOiB7MH1cIiwgYmFzZVRpdGxlKTtcblx0XHRidXR0b24ubGFiZWwgPSBuZXcgTWFya2Rvd25TdHJpbmcoYmFzZVRpdGxlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMuY2xpY2tIYW5kbGVyKGZvbGxvd3VwKSkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGNBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMEJBQTBCO0FBSW5DLE1BQU0sSUFBSSxJQUFJO0FBRVAsSUFBTSxnQkFBTixjQUFxRCxXQUFXO0FBQUEsRUFDdEUsWUFDQyxXQUNBLFdBQ2lCLFVBQ0EsU0FDQSxjQUNtQixrQkFDbkM7QUFDRCxVQUFNO0FBTFc7QUFDQTtBQUNBO0FBQ21CO0FBSXBDLFVBQU0scUJBQXFCLElBQUksT0FBTyxXQUFXLEVBQUUsZ0NBQWdDLENBQUM7QUFDcEYsY0FBVSxRQUFRLGNBQVksS0FBSyxlQUFlLG9CQUFvQixRQUFRLENBQUM7QUFBQSxFQUNoRjtBQUFBLEVBRVEsZUFBZSxXQUF3QixVQUFtQjtBQUVqRSxRQUFJLENBQUMsS0FBSyxpQkFBaUIsZ0JBQWdCLEtBQUssUUFBUSxHQUFHO0FBRTFEO0FBQUEsSUFDRDtBQUVBLFVBQU0sZ0JBQWdCLG1CQUFtQixLQUFLLGtCQUFrQixLQUFLLFVBQVUsSUFBSSxTQUFTLFNBQVMsU0FBUyxVQUFVO0FBQ3hILFFBQUksa0JBQWtCLFFBQVc7QUFDaEM7QUFBQSxJQUNEO0FBRUEsVUFBTSxZQUFZLFNBQVMsU0FBUyxVQUNsQyxTQUFTLFNBQVMsU0FBUyxVQUMxQixTQUFTO0FBQ1osVUFBTSxVQUFVLFNBQVMsU0FBUyxVQUFVLFNBQVMsVUFBVSxTQUFTO0FBQ3hFLFVBQU0sV0FBVyxpQkFDZixTQUFTLFdBQVcsVUFBVSxLQUFLO0FBQ3JDLFVBQU0sU0FBUyxLQUFLLFVBQVUsSUFBSSxPQUFPLFdBQVcsRUFBRSxHQUFHLEtBQUssU0FBUyxPQUFPLFFBQVEsQ0FBQyxDQUFDO0FBQ3hGLFFBQUksU0FBUyxTQUFTLFNBQVM7QUFDOUIsYUFBTyxRQUFRLFVBQVUsSUFBSSw0QkFBNEI7QUFBQSxJQUMxRCxXQUFXLFNBQVMsU0FBUyxXQUFXO0FBQ3ZDLGFBQU8sUUFBUSxVQUFVLElBQUksOEJBQThCO0FBQUEsSUFDNUQ7QUFDQSxXQUFPLFFBQVEsWUFBWSxTQUFTLHFCQUFxQiwyQkFBMkIsU0FBUztBQUM3RixXQUFPLFFBQVEsSUFBSSxlQUFlLFNBQVM7QUFFM0MsU0FBSyxVQUFVLE9BQU8sV0FBVyxNQUFNLEtBQUssYUFBYSxRQUFRLENBQUMsQ0FBQztBQUFBLEVBQ3BFO0FBQ0Q7QUE1Q2EsZ0JBQU47QUFBQSxFQU9KO0FBQUEsR0FQVTsiLAogICJuYW1lcyI6IFtdCn0K
