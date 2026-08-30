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
import "./media/sessionsPolicyBlocked.css";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { $, addDisposableGenericMouseDownListener, append, EventType, addDisposableListener, getWindow } from "../../../../base/browser/dom.js";
import { localize } from "../../../../nls.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { defaultButtonStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { URI } from "../../../../base/common/uri.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IWorkbenchLayoutService } from "../../../../workbench/services/layout/browser/layoutService.js";
var SessionsBlockedReason = /* @__PURE__ */ ((SessionsBlockedReason2) => {
  SessionsBlockedReason2["AgentDisabled"] = "agentDisabled";
  SessionsBlockedReason2["Loading"] = "loading";
  SessionsBlockedReason2["AccountPolicyGate"] = "accountPolicyGate";
  return SessionsBlockedReason2;
})(SessionsBlockedReason || {});
let SessionsPolicyBlockedOverlay = class extends Disposable {
  constructor(container, options, commandService, openerService, productService, layoutService) {
    super();
    this.commandService = commandService;
    this.openerService = openerService;
    this.productService = productService;
    this.overlay = append(container, $(".sessions-policy-blocked-overlay"));
    this.overlay.setAttribute("role", "dialog");
    this.overlay.setAttribute("aria-modal", "true");
    this.overlay.tabIndex = -1;
    this.overlay.focus();
    this._register(toDisposable(() => this.overlay.remove()));
    const workbenchRoot = layoutService.mainContainer;
    workbenchRoot.classList.add("sessions-policy-blocked");
    this._register(toDisposable(() => workbenchRoot.classList.remove("sessions-policy-blocked")));
    const card = append(this.overlay, $(".sessions-policy-blocked-card"));
    this._register(addDisposableListener(getWindow(this.overlay), EventType.KEY_DOWN, (e) => {
      if (card.contains(e.target)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    }, true));
    this._register(addDisposableGenericMouseDownListener(this.overlay, (e) => {
      if (e.target === this.overlay) {
        e.preventDefault();
        e.stopPropagation();
      }
    }));
    append(card, $("div.sessions-policy-blocked-logo"));
    switch (options.reason) {
      case "agentDisabled" /* AgentDisabled */:
        this._renderAgentDisabled(card);
        break;
      case "loading" /* Loading */:
        this._renderLoading(card);
        break;
      case "accountPolicyGate" /* AccountPolicyGate */:
        this._renderAccountPolicyGate(card, options);
        break;
    }
  }
  _renderAgentDisabled(card) {
    this.overlay.setAttribute("aria-label", localize("policyBlocked.aria", "Agents disabled by organization policy"));
    append(card, $("h2", void 0, localize("policyBlocked.title", "Agents Disabled")));
    const description = append(card, $("p"));
    append(description, document.createTextNode(localize("policyBlocked.description", "Your organization has disabled Agents via policy.")));
    append(description, document.createTextNode(" "));
    const learnMore = append(description, $("a.sessions-policy-blocked-link"));
    learnMore.textContent = localize("policyBlocked.learnMore", "Learn more");
    learnMore.href = "https://aka.ms/VSCode/Agents/docs";
    this._register(addDisposableListener(learnMore, EventType.CLICK, (e) => {
      e.preventDefault();
      this.openerService.open(URI.parse("https://aka.ms/VSCode/Agents/docs"));
    }));
    const button = this._register(new Button(card, { ...defaultButtonStyles, secondary: true }));
    button.label = localize("policyBlocked.openVSCode", "Open VS Code");
    this._register(button.onDidClick(() => this._openVSCode()));
  }
  _renderLoading(card) {
    this.overlay.setAttribute("aria-label", localize("loading.aria", "Loading"));
    append(card, $(
      "div.sessions-policy-blocked-progress-bar",
      void 0,
      $("div.sessions-policy-blocked-progress-bar-fill")
    ));
  }
  _renderAccountPolicyGate(card, options) {
    this.overlay.setAttribute("aria-label", localize("accountGate.aria", "Sign-in required by your administrator"));
    append(card, $("h2", void 0, localize("accountGate.title", "Sign-In Required")));
    const description = append(card, $("p"));
    if (options.accountName) {
      append(description, document.createTextNode(
        localize("accountGate.descriptionWithAccount", 'The account "{0}" is not a member of an organization that your administrator allows for Agents.', options.accountName)
      ));
    } else {
      append(description, document.createTextNode(
        localize("accountGate.descriptionNoAccount", "Your administrator restricts Agents to members of the organizations below.")
      ));
    }
    const approvedOrgs = options.approvedOrganizations ?? [];
    const hasConcreteOrgs = approvedOrgs.length > 0 && !approvedOrgs.includes("*");
    if (hasConcreteOrgs) {
      const orgSection = append(card, $("div.sessions-policy-blocked-orgs"));
      append(orgSection, $(
        "p.sessions-policy-blocked-orgs-label",
        void 0,
        localize("accountGate.approvedOrgs", "Allowed organizations:")
      ));
      const orgList = append(orgSection, $("ul"));
      for (const org of approvedOrgs) {
        append(orgList, $("li", void 0, org));
      }
    }
    const footer = append(card, $("p.sessions-policy-blocked-footer"));
    append(footer, document.createTextNode(localize("accountGate.contactAdmin", "Contact your administrator for more information.")));
    append(footer, document.createTextNode(" "));
    const learnMore = append(footer, $("a.sessions-policy-blocked-link"));
    learnMore.textContent = localize("accountGate.learnMore", "Learn more");
    learnMore.href = "https://code.visualstudio.com/docs/enterprise/overview";
    this._register(addDisposableListener(learnMore, EventType.CLICK, (e) => {
      e.preventDefault();
      this.openerService.open(URI.parse("https://code.visualstudio.com/docs/enterprise/overview"));
    }));
    const signInButton = this._register(new Button(card, { ...defaultButtonStyles }));
    signInButton.label = localize("accountGate.signIn", "Sign In");
    this._register(signInButton.onDidClick(() => {
      this.commandService.executeCommand("workbench.action.agenticSignIn");
    }));
  }
  _openVSCode() {
    const scheme = this.productService.parentPolicyConfig?.urlProtocol ?? this.productService.urlProtocol;
    this.openerService.open(URI.from({ scheme, query: "windowId=_blank" }), { openExternal: true });
  }
};
SessionsPolicyBlockedOverlay = __decorateClass([
  __decorateParam(2, ICommandService),
  __decorateParam(3, IOpenerService),
  __decorateParam(4, IProductService),
  __decorateParam(5, IWorkbenchLayoutService)
], SessionsPolicyBlockedOverlay);
export {
  SessionsBlockedReason,
  SessionsPolicyBlockedOverlay
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccG9saWN5QmxvY2tlZFxcYnJvd3Nlclxcc2Vzc2lvbnNQb2xpY3lCbG9ja2VkLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL3Nlc3Npb25zUG9saWN5QmxvY2tlZC5jc3MnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7ICQsIGFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VEb3duTGlzdGVuZXIsIGFwcGVuZCwgRXZlbnRUeXBlLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGdldFdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5cbmV4cG9ydCBjb25zdCBlbnVtIFNlc3Npb25zQmxvY2tlZFJlYXNvbiB7XG5cdEFnZW50RGlzYWJsZWQgPSAnYWdlbnREaXNhYmxlZCcsXG5cdC8qKiBUcmFuc2llbnQgbG9hZGluZyBzdGF0ZSBcdTIwMTQgYmxvY2tzIFVJIGJ1dCBzaG93cyBvbmx5IGEgcHJvZ3Jlc3MgYmFyLiAqL1xuXHRMb2FkaW5nID0gJ2xvYWRpbmcnLFxuXHQvKiogU2lnbmVkIGluIGJ1dCBub3QgaW4gYW4gYXBwcm92ZWQgb3JnIFx1MjAxNCBtdXN0IHN3aXRjaCBhY2NvdW50cy4gKi9cblx0QWNjb3VudFBvbGljeUdhdGUgPSAnYWNjb3VudFBvbGljeUdhdGUnLFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uc0Jsb2NrZWRPdmVybGF5T3B0aW9ucyB7XG5cdHJlYWRvbmx5IHJlYXNvbjogU2Vzc2lvbnNCbG9ja2VkUmVhc29uO1xuXHRyZWFkb25seSBhcHByb3ZlZE9yZ2FuaXphdGlvbnM/OiByZWFkb25seSBzdHJpbmdbXTtcblx0cmVhZG9ubHkgYWNjb3VudE5hbWU/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogRnVsbC13aW5kb3cgaW1wYXNzYWJsZSBvdmVybGF5IHNob3duIHdoZW4gdGhlIEFnZW50cyBhcHAgaXMgYmxvY2tlZC5cbiAqL1xuZXhwb3J0IGNsYXNzIFNlc3Npb25zUG9saWN5QmxvY2tlZE92ZXJsYXkgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG92ZXJsYXk6IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0b3B0aW9uczogSVNlc3Npb25zQmxvY2tlZE92ZXJsYXlPcHRpb25zLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMub3ZlcmxheSA9IGFwcGVuZChjb250YWluZXIsICQoJy5zZXNzaW9ucy1wb2xpY3ktYmxvY2tlZC1vdmVybGF5JykpO1xuXHRcdHRoaXMub3ZlcmxheS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnZGlhbG9nJyk7XG5cdFx0dGhpcy5vdmVybGF5LnNldEF0dHJpYnV0ZSgnYXJpYS1tb2RhbCcsICd0cnVlJyk7XG5cdFx0dGhpcy5vdmVybGF5LnRhYkluZGV4ID0gLTE7XG5cdFx0dGhpcy5vdmVybGF5LmZvY3VzKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMub3ZlcmxheS5yZW1vdmUoKSkpO1xuXG5cdFx0Y29uc3Qgd29ya2JlbmNoUm9vdCA9IGxheW91dFNlcnZpY2UubWFpbkNvbnRhaW5lcjtcblx0XHR3b3JrYmVuY2hSb290LmNsYXNzTGlzdC5hZGQoJ3Nlc3Npb25zLXBvbGljeS1ibG9ja2VkJyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHdvcmtiZW5jaFJvb3QuY2xhc3NMaXN0LnJlbW92ZSgnc2Vzc2lvbnMtcG9saWN5LWJsb2NrZWQnKSkpO1xuXG5cdFx0Y29uc3QgY2FyZCA9IGFwcGVuZCh0aGlzLm92ZXJsYXksICQoJy5zZXNzaW9ucy1wb2xpY3ktYmxvY2tlZC1jYXJkJykpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGdldFdpbmRvdyh0aGlzLm92ZXJsYXkpLCBFdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoY2FyZC5jb250YWlucyhlLnRhcmdldCBhcyBOb2RlKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdH0sIHRydWUpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VEb3duTGlzdGVuZXIodGhpcy5vdmVybGF5LCBlID0+IHtcblx0XHRcdGlmIChlLnRhcmdldCA9PT0gdGhpcy5vdmVybGF5KSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhcHBlbmQoY2FyZCwgJCgnZGl2LnNlc3Npb25zLXBvbGljeS1ibG9ja2VkLWxvZ28nKSk7XG5cblx0XHRzd2l0Y2ggKG9wdGlvbnMucmVhc29uKSB7XG5cdFx0XHRjYXNlIFNlc3Npb25zQmxvY2tlZFJlYXNvbi5BZ2VudERpc2FibGVkOlxuXHRcdFx0XHR0aGlzLl9yZW5kZXJBZ2VudERpc2FibGVkKGNhcmQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgU2Vzc2lvbnNCbG9ja2VkUmVhc29uLkxvYWRpbmc6XG5cdFx0XHRcdHRoaXMuX3JlbmRlckxvYWRpbmcoY2FyZCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBTZXNzaW9uc0Jsb2NrZWRSZWFzb24uQWNjb3VudFBvbGljeUdhdGU6XG5cdFx0XHRcdHRoaXMuX3JlbmRlckFjY291bnRQb2xpY3lHYXRlKGNhcmQsIG9wdGlvbnMpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJBZ2VudERpc2FibGVkKGNhcmQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5vdmVybGF5LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdwb2xpY3lCbG9ja2VkLmFyaWEnLCBcIkFnZW50cyBkaXNhYmxlZCBieSBvcmdhbml6YXRpb24gcG9saWN5XCIpKTtcblxuXHRcdGFwcGVuZChjYXJkLCAkKCdoMicsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ3BvbGljeUJsb2NrZWQudGl0bGUnLCBcIkFnZW50cyBEaXNhYmxlZFwiKSkpO1xuXG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBhcHBlbmQoY2FyZCwgJCgncCcpKTtcblx0XHRhcHBlbmQoZGVzY3JpcHRpb24sIGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKGxvY2FsaXplKCdwb2xpY3lCbG9ja2VkLmRlc2NyaXB0aW9uJywgXCJZb3VyIG9yZ2FuaXphdGlvbiBoYXMgZGlzYWJsZWQgQWdlbnRzIHZpYSBwb2xpY3kuXCIpKSk7XG5cdFx0YXBwZW5kKGRlc2NyaXB0aW9uLCBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSgnICcpKTtcblx0XHRjb25zdCBsZWFybk1vcmUgPSBhcHBlbmQoZGVzY3JpcHRpb24sICQoJ2Euc2Vzc2lvbnMtcG9saWN5LWJsb2NrZWQtbGluaycpKSBhcyBIVE1MQW5jaG9yRWxlbWVudDtcblx0XHRsZWFybk1vcmUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgncG9saWN5QmxvY2tlZC5sZWFybk1vcmUnLCBcIkxlYXJuIG1vcmVcIik7XG5cdFx0bGVhcm5Nb3JlLmhyZWYgPSAnaHR0cHM6Ly9ha2EubXMvVlNDb2RlL0FnZW50cy9kb2NzJztcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIobGVhcm5Nb3JlLCBFdmVudFR5cGUuQ0xJQ0ssIChlKSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UoJ2h0dHBzOi8vYWthLm1zL1ZTQ29kZS9BZ2VudHMvZG9jcycpKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBidXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKGNhcmQsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlIH0pKTtcblx0XHRidXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgncG9saWN5QmxvY2tlZC5vcGVuVlNDb2RlJywgXCJPcGVuIFZTIENvZGVcIik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5fb3BlblZTQ29kZSgpKSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJMb2FkaW5nKGNhcmQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5vdmVybGF5LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdsb2FkaW5nLmFyaWEnLCBcIkxvYWRpbmdcIikpO1xuXHRcdGFwcGVuZChjYXJkLCAkKCdkaXYuc2Vzc2lvbnMtcG9saWN5LWJsb2NrZWQtcHJvZ3Jlc3MtYmFyJywgdW5kZWZpbmVkLFxuXHRcdFx0JCgnZGl2LnNlc3Npb25zLXBvbGljeS1ibG9ja2VkLXByb2dyZXNzLWJhci1maWxsJylcblx0XHQpKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckFjY291bnRQb2xpY3lHYXRlKGNhcmQ6IEhUTUxFbGVtZW50LCBvcHRpb25zOiBJU2Vzc2lvbnNCbG9ja2VkT3ZlcmxheU9wdGlvbnMpOiB2b2lkIHtcblx0XHR0aGlzLm92ZXJsYXkuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2FjY291bnRHYXRlLmFyaWEnLCBcIlNpZ24taW4gcmVxdWlyZWQgYnkgeW91ciBhZG1pbmlzdHJhdG9yXCIpKTtcblxuXHRcdGFwcGVuZChjYXJkLCAkKCdoMicsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2FjY291bnRHYXRlLnRpdGxlJywgXCJTaWduLUluIFJlcXVpcmVkXCIpKSk7XG5cblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGFwcGVuZChjYXJkLCAkKCdwJykpO1xuXHRcdGlmIChvcHRpb25zLmFjY291bnROYW1lKSB7XG5cdFx0XHRhcHBlbmQoZGVzY3JpcHRpb24sIGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKFxuXHRcdFx0XHRsb2NhbGl6ZSgnYWNjb3VudEdhdGUuZGVzY3JpcHRpb25XaXRoQWNjb3VudCcsIFwiVGhlIGFjY291bnQgXFxcInswfVxcXCIgaXMgbm90IGEgbWVtYmVyIG9mIGFuIG9yZ2FuaXphdGlvbiB0aGF0IHlvdXIgYWRtaW5pc3RyYXRvciBhbGxvd3MgZm9yIEFnZW50cy5cIiwgb3B0aW9ucy5hY2NvdW50TmFtZSlcblx0XHRcdCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhcHBlbmQoZGVzY3JpcHRpb24sIGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKFxuXHRcdFx0XHRsb2NhbGl6ZSgnYWNjb3VudEdhdGUuZGVzY3JpcHRpb25Ob0FjY291bnQnLCBcIllvdXIgYWRtaW5pc3RyYXRvciByZXN0cmljdHMgQWdlbnRzIHRvIG1lbWJlcnMgb2YgdGhlIG9yZ2FuaXphdGlvbnMgYmVsb3cuXCIpXG5cdFx0XHQpKTtcblx0XHR9XG5cblx0XHRjb25zdCBhcHByb3ZlZE9yZ3MgPSBvcHRpb25zLmFwcHJvdmVkT3JnYW5pemF0aW9ucyA/PyBbXTtcblx0XHRjb25zdCBoYXNDb25jcmV0ZU9yZ3MgPSBhcHByb3ZlZE9yZ3MubGVuZ3RoID4gMCAmJiAhYXBwcm92ZWRPcmdzLmluY2x1ZGVzKCcqJyk7XG5cdFx0aWYgKGhhc0NvbmNyZXRlT3Jncykge1xuXHRcdFx0Y29uc3Qgb3JnU2VjdGlvbiA9IGFwcGVuZChjYXJkLCAkKCdkaXYuc2Vzc2lvbnMtcG9saWN5LWJsb2NrZWQtb3JncycpKTtcblx0XHRcdGFwcGVuZChvcmdTZWN0aW9uLCAkKCdwLnNlc3Npb25zLXBvbGljeS1ibG9ja2VkLW9yZ3MtbGFiZWwnLCB1bmRlZmluZWQsXG5cdFx0XHRcdGxvY2FsaXplKCdhY2NvdW50R2F0ZS5hcHByb3ZlZE9yZ3MnLCBcIkFsbG93ZWQgb3JnYW5pemF0aW9uczpcIilcblx0XHRcdCkpO1xuXHRcdFx0Y29uc3Qgb3JnTGlzdCA9IGFwcGVuZChvcmdTZWN0aW9uLCAkKCd1bCcpKTtcblx0XHRcdGZvciAoY29uc3Qgb3JnIG9mIGFwcHJvdmVkT3Jncykge1xuXHRcdFx0XHRhcHBlbmQob3JnTGlzdCwgJCgnbGknLCB1bmRlZmluZWQsIG9yZykpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGZvb3RlciA9IGFwcGVuZChjYXJkLCAkKCdwLnNlc3Npb25zLXBvbGljeS1ibG9ja2VkLWZvb3RlcicpKTtcblx0XHRhcHBlbmQoZm9vdGVyLCBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShsb2NhbGl6ZSgnYWNjb3VudEdhdGUuY29udGFjdEFkbWluJywgXCJDb250YWN0IHlvdXIgYWRtaW5pc3RyYXRvciBmb3IgbW9yZSBpbmZvcm1hdGlvbi5cIikpKTtcblx0XHRhcHBlbmQoZm9vdGVyLCBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSgnICcpKTtcblx0XHRjb25zdCBsZWFybk1vcmUgPSBhcHBlbmQoZm9vdGVyLCAkKCdhLnNlc3Npb25zLXBvbGljeS1ibG9ja2VkLWxpbmsnKSkgYXMgSFRNTEFuY2hvckVsZW1lbnQ7XG5cdFx0bGVhcm5Nb3JlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2FjY291bnRHYXRlLmxlYXJuTW9yZScsIFwiTGVhcm4gbW9yZVwiKTtcblx0XHRsZWFybk1vcmUuaHJlZiA9ICdodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9kb2NzL2VudGVycHJpc2Uvb3ZlcnZpZXcnO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihsZWFybk1vcmUsIEV2ZW50VHlwZS5DTElDSywgKGUpID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdHRoaXMub3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZSgnaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vZG9jcy9lbnRlcnByaXNlL292ZXJ2aWV3JykpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHNpZ25JbkJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24oY2FyZCwgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzIH0pKTtcblx0XHRzaWduSW5CdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnYWNjb3VudEdhdGUuc2lnbkluJywgXCJTaWduIEluXCIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHNpZ25JbkJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24uYWdlbnRpY1NpZ25JbicpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX29wZW5WU0NvZGUoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2NoZW1lID0gdGhpcy5wcm9kdWN0U2VydmljZS5wYXJlbnRQb2xpY3lDb25maWc/LnVybFByb3RvY29sID8/IHRoaXMucHJvZHVjdFNlcnZpY2UudXJsUHJvdG9jb2w7XG5cdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLmZyb20oeyBzY2hlbWUsIHF1ZXJ5OiAnd2luZG93SWQ9X2JsYW5rJyB9KSwgeyBvcGVuRXh0ZXJuYWw6IHRydWUgfSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsWUFBWSxvQkFBb0I7QUFDekMsU0FBUyxHQUFHLHVDQUF1QyxRQUFRLFdBQVcsdUJBQXVCLGlCQUFpQjtBQUM5RyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGNBQWM7QUFDdkIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0JBQStCO0FBRWpDLElBQVcsd0JBQVgsa0JBQVdBLDJCQUFYO0FBQ04sRUFBQUEsdUJBQUEsbUJBQWdCO0FBRWhCLEVBQUFBLHVCQUFBLGFBQVU7QUFFVixFQUFBQSx1QkFBQSx1QkFBb0I7QUFMSCxTQUFBQTtBQUFBLEdBQUE7QUFpQlgsSUFBTSwrQkFBTixjQUEyQyxXQUFXO0FBQUEsRUFJNUQsWUFDQyxXQUNBLFNBQ2tDLGdCQUNELGVBQ0MsZ0JBQ1QsZUFDeEI7QUFDRCxVQUFNO0FBTDRCO0FBQ0Q7QUFDQztBQUtsQyxTQUFLLFVBQVUsT0FBTyxXQUFXLEVBQUUsa0NBQWtDLENBQUM7QUFDdEUsU0FBSyxRQUFRLGFBQWEsUUFBUSxRQUFRO0FBQzFDLFNBQUssUUFBUSxhQUFhLGNBQWMsTUFBTTtBQUM5QyxTQUFLLFFBQVEsV0FBVztBQUN4QixTQUFLLFFBQVEsTUFBTTtBQUNuQixTQUFLLFVBQVUsYUFBYSxNQUFNLEtBQUssUUFBUSxPQUFPLENBQUMsQ0FBQztBQUV4RCxVQUFNLGdCQUFnQixjQUFjO0FBQ3BDLGtCQUFjLFVBQVUsSUFBSSx5QkFBeUI7QUFDckQsU0FBSyxVQUFVLGFB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QVEseUJBQXlCLENBQUM7QUFDdkQsVUFBTSxrQkFBa0IsYUFBYSxTQUFTLEtBQUssQ0FBQyxhQUFhLFNBQVMsR0FBRztBQUM3RSxRQUFJLGlCQUFpQjtBQUNwQixZQUFNLGFBQWEsT0FBTyxNQUFNLEVBQUUsa0NBQWtDLENBQUM7QUFDckUsYUFBTyxZQUFZO0FBQUEsUUFBRTtBQUFBLFFBQXdDO0FBQUEsUUFDNUQsU0FBUyw0QkFBNEIsd0JBQXdCO0FBQUEsTUFDOUQsQ0FBQztBQUNELFlBQU0sVUFBVSxPQUFPLFlBQVksRUFBRSxJQUFJLENBQUM7QUFDMUMsaUJBQVcsT0FBTyxjQUFjO0FBQy9CLGVBQU8sU0FBUyxFQUFFLE1BQU0sUUFBVyxHQUFHLENBQUM7QUFBQSxNQUN4QztBQUFBLElBQ0Q7QUFFQSxVQUFNLFNBQVMsT0FBTyxNQUFNLEVBQUUsa0NBQWtDLENBQUM7QUFDakUsV0FBTyxRQUFRLFNBQVMsZUFBZSxTQUFTLDRCQUE0QixrREFBa0QsQ0FBQyxDQUFDO0FBQ2hJLFdBQU8sUUFBUSxTQUFTLGVBQWUsR0FBRyxDQUFDO0FBQzNDLFVBQU0sWUFBWSxPQUFPLFFBQVEsRUFBRSxnQ0FBZ0MsQ0FBQztBQUNwRSxjQUFVLGNBQWMsU0FBUyx5QkFBeUIsWUFBWTtBQUN0RSxjQUFVLE9BQU87QUFDakIsU0FBSyxVQUFVLHNCQUFzQixXQUFXLFVBQVUsT0FBTyxDQUFDLE1BQU07QUFDdkUsUUFBRSxlQUFlO0FBQ2pCLFdBQUssY0FBYyxLQUFLLElBQUksTUFBTSx3REFBd0QsQ0FBQztBQUFBLElBQzVGLENBQUMsQ0FBQztBQUVGLFVBQU0sZUFBZSxLQUFLLFVBQVUsSUFBSSxPQUFPLE1BQU0sRUFBRSxHQUFHLG9CQUFvQixDQUFDLENBQUM7QUFDaEYsaUJBQWEsUUFBUSxTQUFTLHNCQUFzQixTQUFTO0FBQzdELFNBQUssVUFBVSxhQUFhLFdBQVcsTUFBTTtBQUM1QyxXQUFLLGVBQWUsZUFBZSxnQ0FBZ0M7QUFBQSxJQUNwRSxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSxjQUFvQjtBQUMzQixVQUFNLFNBQVMsS0FBSyxlQUFlLG9CQUFvQixlQUFlLEtBQUssZUFBZTtBQUMxRixTQUFLLGNBQWMsS0FBSyxJQUFJLEtBQUssRUFBRSxRQUFRLE9BQU8sa0JBQWtCLENBQUMsR0FBRyxFQUFFLGNBQWMsS0FBSyxDQUFDO0FBQUEsRUFDL0Y7QUFDRDtBQXhJYSwrQkFBTjtBQUFBLEVBT0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVZVOyIsCiAgIm5hbWVzIjogWyJTZXNzaW9uc0Jsb2NrZWRSZWFzb24iXQp9Cg==
