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
import { Action } from "../../../../../../base/common/actions.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { localize } from "../../../../../../nls.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { ChatContextKeys } from "../../../common/actions/chatContextKeys.js";
import { ChatConfiguration } from "../../../common/constants.js";
import { IChatSessionsService } from "../../../common/chatSessionsService.js";
import { getAgentCanContinueIn, getAgentSessionProvider, getAgentSessionProviderIcon, getAgentSessionProviderName } from "../../agentSessions/agentSessions.js";
let ChatSuggestNextWidget = class extends Disposable {
  constructor(configurationService, contextMenuService, chatSessionsService, contextKeyService) {
    super();
    this.configurationService = configurationService;
    this.contextMenuService = contextMenuService;
    this.chatSessionsService = chatSessionsService;
    this.contextKeyService = contextKeyService;
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    this._onDidSelectPrompt = this._register(new Emitter());
    this.onDidSelectPrompt = this._onDidSelectPrompt.event;
    this.buttonDisposables = /* @__PURE__ */ new Map();
    this.domNode = this.createSuggestNextWidget();
  }
  get height() {
    return this.domNode.style.display === "none" ? 0 : this.domNode.offsetHeight;
  }
  getCurrentMode() {
    return this._currentMode;
  }
  createSuggestNextWidget() {
    const container = dom.$(".chat-suggest-next-widget.chat-welcome-view-suggested-prompts");
    container.style.display = "none";
    this.titleElement = dom.append(container, dom.$(".chat-welcome-view-suggested-prompts-title"));
    this.promptsContainer = container;
    return container;
  }
  render(mode) {
    const handoffs = mode.handOffs?.get();
    if (!handoffs || handoffs.length === 0) {
      this.hide();
      return;
    }
    this._currentMode = mode;
    const modeName = mode.name.get() || mode.label.get() || localize("chat.currentMode", "current mode");
    this.titleElement.textContent = localize("chat.proceedFrom", "Proceed from {0}", modeName);
    const childrenToRemove = [];
    for (let i = 1; i < this.promptsContainer.children.length; i++) {
      childrenToRemove.push(this.promptsContainer.children[i]);
    }
    for (const child of childrenToRemove) {
      const disposables = this.buttonDisposables.get(child);
      if (disposables) {
        disposables.dispose();
        this.buttonDisposables.delete(child);
      }
      this.promptsContainer.removeChild(child);
    }
    const isAutopilotPolicyRestricted = this.configurationService.inspect(ChatConfiguration.GlobalAutoApprove).policyValue === false;
    const firstAutoSendHandoff = !isAutopilotPolicyRestricted ? handoffs.find((h) => h.send) : void 0;
    for (const handoff of handoffs) {
      const promptButton = this.createPromptButton(handoff);
      this.promptsContainer.appendChild(promptButton);
      if (handoff === firstAutoSendHandoff) {
        const autopilotButton = this.createAutopilotButton(handoff);
        this.promptsContainer.appendChild(autopilotButton);
      }
    }
    this.domNode.style.display = "flex";
    this._onDidChangeHeight.fire();
  }
  createPromptButton(handoff) {
    const disposables = new DisposableStore();
    const handoffLabel = handoff.label;
    const getCurrentHandoff = () => {
      const currentHandoffs = this._currentMode?.handOffs?.get();
      return currentHandoffs?.find((h) => h.label === handoffLabel) ?? handoff;
    };
    const button = dom.$(".chat-welcome-view-suggested-prompt");
    button.setAttribute("tabindex", "0");
    button.setAttribute("role", "button");
    button.setAttribute("aria-label", localize("chat.suggestNext.item", "{0}", handoff.label));
    const titleElement = dom.append(button, dom.$(".chat-welcome-view-suggested-prompt-title"));
    titleElement.textContent = handoff.label;
    const showContinueOn = handoff.showContinueOn ?? true;
    const currentSessionType = this.contextKeyService.getContextKeyValue(ChatContextKeys.chatSessionType.key);
    const contributions = this.chatSessionsService.getAllChatSessionContributions();
    const availableContributions = contributions.filter((c) => {
      if (!c.canDelegate) {
        return false;
      }
      if (c.type === currentSessionType) {
        return false;
      }
      const provider = getAgentSessionProvider(c.type);
      return provider !== void 0 && getAgentCanContinueIn(provider);
    });
    if (showContinueOn && availableContributions.length > 0) {
      button.classList.add("chat-suggest-next-has-dropdown");
      const dropdownContainer = dom.append(button, dom.$(".chat-suggest-next-dropdown"));
      dropdownContainer.setAttribute("tabindex", "0");
      dropdownContainer.setAttribute("role", "button");
      dropdownContainer.setAttribute("aria-label", localize("chat.suggestNext.moreOptions", "More options for {0}", handoff.label));
      dropdownContainer.setAttribute("aria-haspopup", "true");
      const separator = dom.append(dropdownContainer, dom.$(".chat-suggest-next-separator"));
      separator.setAttribute("aria-hidden", "true");
      const chevron = dom.append(dropdownContainer, dom.$(".codicon.codicon-chevron-down.dropdown-chevron"));
      chevron.setAttribute("aria-hidden", "true");
      const showContextMenu = (e, anchor) => {
        e.preventDefault();
        e.stopPropagation();
        const actions = availableContributions.map((contrib) => {
          const provider = getAgentSessionProvider(contrib.type);
          const icon = getAgentSessionProviderIcon(provider);
          const name = getAgentSessionProviderName(provider);
          return new Action(
            contrib.type,
            localize("continueIn", "Continue in {0}", name),
            ThemeIcon.isThemeIcon(icon) ? ThemeIcon.asClassName(icon) : void 0,
            true,
            () => {
              const currentHandoff = getCurrentHandoff();
              if (currentHandoff) {
                this._onDidSelectPrompt.fire({ handoff: currentHandoff, agentId: contrib.name });
              }
            }
          );
        });
        this.contextMenuService.showContextMenu({
          getAnchor: () => anchor || dropdownContainer,
          getActions: () => actions,
          autoSelectFirstItem: true
        });
      };
      disposables.add(dom.addDisposableListener(dropdownContainer, "click", (e) => {
        showContextMenu(e, dropdownContainer);
      }));
      disposables.add(dom.addDisposableListener(dropdownContainer, "keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          showContextMenu(e, dropdownContainer);
        }
      }));
      disposables.add(dom.addDisposableListener(button, "click", (e) => {
        if (dom.isHTMLElement(e.target) && e.target.closest(".chat-suggest-next-dropdown")) {
          return;
        }
        const currentHandoff = getCurrentHandoff();
        if (currentHandoff) {
          this._onDidSelectPrompt.fire({ handoff: currentHandoff });
        }
      }));
    } else {
      disposables.add(dom.addDisposableListener(button, "click", () => {
        const currentHandoff = getCurrentHandoff();
        if (currentHandoff) {
          this._onDidSelectPrompt.fire({ handoff: currentHandoff });
        }
      }));
    }
    disposables.add(dom.addDisposableListener(button, "keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const currentHandoff = getCurrentHandoff();
        if (currentHandoff) {
          this._onDidSelectPrompt.fire({ handoff: currentHandoff });
        }
      }
    }));
    this.buttonDisposables.set(button, disposables);
    return button;
  }
  createAutopilotButton(handoff) {
    const disposables = new DisposableStore();
    const handoffLabel = handoff.label;
    const getCurrentHandoff = () => {
      const currentHandoffs = this._currentMode?.handOffs?.get();
      return currentHandoffs?.find((h) => h.label === handoffLabel) ?? handoff;
    };
    const label = localize("chat.suggestNext.startWithAutopilot", "Start with Autopilot");
    const button = dom.$(".chat-welcome-view-suggested-prompt");
    button.setAttribute("tabindex", "0");
    button.setAttribute("role", "button");
    button.setAttribute("aria-label", label);
    const titleElement = dom.append(button, dom.$(".chat-welcome-view-suggested-prompt-title"));
    titleElement.textContent = label;
    disposables.add(dom.addDisposableListener(button, "click", () => {
      const currentHandoff = getCurrentHandoff();
      if (currentHandoff) {
        this._onDidSelectPrompt.fire({ handoff: currentHandoff, withAutopilot: true });
      }
    }));
    disposables.add(dom.addDisposableListener(button, "keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const currentHandoff = getCurrentHandoff();
        if (currentHandoff) {
          this._onDidSelectPrompt.fire({ handoff: currentHandoff, withAutopilot: true });
        }
      }
    }));
    this.buttonDisposables.set(button, disposables);
    return button;
  }
  hide() {
    if (this.domNode.style.display !== "none") {
      this._currentMode = void 0;
      this.domNode.style.display = "none";
      this._onDidChangeHeight.fire();
    }
  }
  dispose() {
    for (const disposables of this.buttonDisposables.values()) {
      disposables.dispose();
    }
    this.buttonDisposables.clear();
    super.dispose();
  }
};
ChatSuggestNextWidget = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IChatSessionsService),
  __decorateParam(3, IContextKeyService)
], ChatSuggestNextWidget);
export {
  ChatSuggestNextWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdFN1Z2dlc3ROZXh0V2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRNb2Rlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIYW5kT2ZmIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRGaWxlUGFyc2VyLmpzJztcbmltcG9ydCB7IGdldEFnZW50Q2FuQ29udGludWVJbiwgZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXIsIGdldEFnZW50U2Vzc2lvblByb3ZpZGVySWNvbiwgZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJOYW1lIH0gZnJvbSAnLi4vLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJTmV4dFByb21wdFNlbGVjdGlvbiB7XG5cdHJlYWRvbmx5IGhhbmRvZmY6IElIYW5kT2ZmO1xuXHRyZWFkb25seSBhZ2VudElkPzogc3RyaW5nO1xuXHRyZWFkb25seSB3aXRoQXV0b3BpbG90PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRTdWdnZXN0TmV4dFdpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwdWJsaWMgcmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VIZWlnaHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlSGVpZ2h0OiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2VsZWN0UHJvbXB0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SU5leHRQcm9tcHRTZWxlY3Rpb24+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRTZWxlY3RQcm9tcHQ6IEV2ZW50PElOZXh0UHJvbXB0U2VsZWN0aW9uPiA9IHRoaXMuX29uRGlkU2VsZWN0UHJvbXB0LmV2ZW50O1xuXG5cdHByaXZhdGUgcHJvbXB0c0NvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHRpdGxlRWxlbWVudCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9jdXJyZW50TW9kZTogSUNoYXRNb2RlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGJ1dHRvbkRpc3Bvc2FibGVzID0gbmV3IE1hcDxIVE1MRWxlbWVudCwgRGlzcG9zYWJsZVN0b3JlPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXNzaW9uc1NlcnZpY2U6IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuZG9tTm9kZSA9IHRoaXMuY3JlYXRlU3VnZ2VzdE5leHRXaWRnZXQoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID09PSAnbm9uZScgPyAwIDogdGhpcy5kb21Ob2RlLm9mZnNldEhlaWdodDtcblx0fVxuXG5cdHB1YmxpYyBnZXRDdXJyZW50TW9kZSgpOiBJQ2hhdE1vZGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jdXJyZW50TW9kZTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlU3VnZ2VzdE5leHRXaWRnZXQoKTogSFRNTEVsZW1lbnQge1xuXHRcdC8vIFJldXNlIHdlbGNvbWUgdmlldyBjbGFzc2VzIGZvciBjb25zaXN0ZW50IHN0eWxpbmdcblx0XHRjb25zdCBjb250YWluZXIgPSBkb20uJCgnLmNoYXQtc3VnZ2VzdC1uZXh0LXdpZGdldC5jaGF0LXdlbGNvbWUtdmlldy1zdWdnZXN0ZWQtcHJvbXB0cycpO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG5cdFx0Ly8gVGl0bGUgZWxlbWVudCB1c2luZyB3ZWxjb21lIHZpZXcgY2xhc3Ncblx0XHR0aGlzLnRpdGxlRWxlbWVudCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLmNoYXQtd2VsY29tZS12aWV3LXN1Z2dlc3RlZC1wcm9tcHRzLXRpdGxlJykpO1xuXG5cdFx0Ly8gQ29udGFpbmVyIGZvciBwcm9tcHQgYnV0dG9uc1xuXHRcdHRoaXMucHJvbXB0c0NvbnRhaW5lciA9IGNvbnRhaW5lcjtcblxuXHRcdHJldHVybiBjb250YWluZXI7XG5cdH1cblxuXHRwdWJsaWMgcmVuZGVyKG1vZGU6IElDaGF0TW9kZSk6IHZvaWQge1xuXHRcdGNvbnN0IGhhbmRvZmZzID0gbW9kZS5oYW5kT2Zmcz8uZ2V0KCk7XG5cblx0XHRpZiAoIWhhbmRvZmZzIHx8IGhhbmRvZmZzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5oaWRlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fY3VycmVudE1vZGUgPSBtb2RlO1xuXG5cdFx0Ly8gVXBkYXRlIHRpdGxlIHdpdGggbW9kZSBuYW1lOiBcIlByb2NlZWQgZnJvbSB7TW9kZX1cIlxuXHRcdGNvbnN0IG1vZGVOYW1lID0gbW9kZS5uYW1lLmdldCgpIHx8IG1vZGUubGFiZWwuZ2V0KCkgfHwgbG9jYWxpemUoJ2NoYXQuY3VycmVudE1vZGUnLCAnY3VycmVudCBtb2RlJyk7XG5cdFx0dGhpcy50aXRsZUVsZW1lbnQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdC5wcm9jZWVkRnJvbScsICdQcm9jZWVkIGZyb20gezB9JywgbW9kZU5hbWUpO1xuXG5cdFx0Ly8gQ2xlYXIgZXhpc3RpbmcgcHJvbXB0IGJ1dHRvbnMgKGtlZXAgdGl0bGUgd2hpY2ggaXMgZmlyc3QgY2hpbGQpXG5cdFx0Y29uc3QgY2hpbGRyZW5Ub1JlbW92ZTogSFRNTEVsZW1lbnRbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgdGhpcy5wcm9tcHRzQ29udGFpbmVyLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjaGlsZHJlblRvUmVtb3ZlLnB1c2godGhpcy5wcm9tcHRzQ29udGFpbmVyLmNoaWxkcmVuW2ldIGFzIEhUTUxFbGVtZW50KTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlblRvUmVtb3ZlKSB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IHRoaXMuYnV0dG9uRGlzcG9zYWJsZXMuZ2V0KGNoaWxkKTtcblx0XHRcdGlmIChkaXNwb3NhYmxlcykge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuYnV0dG9uRGlzcG9zYWJsZXMuZGVsZXRlKGNoaWxkKTtcblx0XHRcdH1cblx0XHRcdHRoaXMucHJvbXB0c0NvbnRhaW5lci5yZW1vdmVDaGlsZChjaGlsZCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNBdXRvcGlsb3RQb2xpY3lSZXN0cmljdGVkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkdsb2JhbEF1dG9BcHByb3ZlKS5wb2xpY3lWYWx1ZSA9PT0gZmFsc2U7XG5cdFx0Y29uc3QgZmlyc3RBdXRvU2VuZEhhbmRvZmYgPSAhaXNBdXRvcGlsb3RQb2xpY3lSZXN0cmljdGVkID8gaGFuZG9mZnMuZmluZChoID0+IGguc2VuZCkgOiB1bmRlZmluZWQ7XG5cblx0XHRmb3IgKGNvbnN0IGhhbmRvZmYgb2YgaGFuZG9mZnMpIHtcblx0XHRcdGNvbnN0IHByb21wdEJ1dHRvbiA9IHRoaXMuY3JlYXRlUHJvbXB0QnV0dG9uKGhhbmRvZmYpO1xuXHRcdFx0dGhpcy5wcm9tcHRzQ29udGFpbmVyLmFwcGVuZENoaWxkKHByb21wdEJ1dHRvbik7XG5cblx0XHRcdGlmIChoYW5kb2ZmID09PSBmaXJzdEF1dG9TZW5kSGFuZG9mZikge1xuXHRcdFx0XHRjb25zdCBhdXRvcGlsb3RCdXR0b24gPSB0aGlzLmNyZWF0ZUF1dG9waWxvdEJ1dHRvbihoYW5kb2ZmKTtcblx0XHRcdFx0dGhpcy5wcm9tcHRzQ29udGFpbmVyLmFwcGVuZENoaWxkKGF1dG9waWxvdEJ1dHRvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVQcm9tcHRCdXR0b24oaGFuZG9mZjogSUhhbmRPZmYpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHQvLyBDYXB0dXJlIHRoZSBsYWJlbCB0byBsb29rIHVwIHRoZSBjdXJyZW50IGhhbmRvZmYgYXQgY2xpY2sgdGltZVxuXHRcdC8vIFRoaXMgZW5zdXJlcyB3ZSBnZXQgdGhlIGxhdGVzdCBoYW5kb2ZmIGRhdGEgKGUuZy4sIHVwZGF0ZWQgbW9kZWwgZnJvbSBzZXR0aW5ncylcblx0XHRjb25zdCBoYW5kb2ZmTGFiZWwgPSBoYW5kb2ZmLmxhYmVsO1xuXHRcdGNvbnN0IGdldEN1cnJlbnRIYW5kb2ZmID0gKCk6IElIYW5kT2ZmIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnRIYW5kb2ZmcyA9IHRoaXMuX2N1cnJlbnRNb2RlPy5oYW5kT2Zmcz8uZ2V0KCk7XG5cdFx0XHRyZXR1cm4gY3VycmVudEhhbmRvZmZzPy5maW5kKGggPT4gaC5sYWJlbCA9PT0gaGFuZG9mZkxhYmVsKSA/PyBoYW5kb2ZmO1xuXHRcdH07XG5cblx0XHRjb25zdCBidXR0b24gPSBkb20uJCgnLmNoYXQtd2VsY29tZS12aWV3LXN1Z2dlc3RlZC1wcm9tcHQnKTtcblx0XHRidXR0b24uc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICcwJyk7XG5cdFx0YnV0dG9uLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRidXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2NoYXQuc3VnZ2VzdE5leHQuaXRlbScsICd7MH0nLCBoYW5kb2ZmLmxhYmVsKSk7XG5cblx0XHRjb25zdCB0aXRsZUVsZW1lbnQgPSBkb20uYXBwZW5kKGJ1dHRvbiwgZG9tLiQoJy5jaGF0LXdlbGNvbWUtdmlldy1zdWdnZXN0ZWQtcHJvbXB0LXRpdGxlJykpO1xuXHRcdHRpdGxlRWxlbWVudC50ZXh0Q29udGVudCA9IGhhbmRvZmYubGFiZWw7XG5cblx0XHQvLyBPcHRpb25hbCBzaG93Q29udGludWVPbiBiZWhhdmVzIGxpa2Ugc2VuZDogb25seSBwcmVzZW50IGlmIHNwZWNpZmllZFxuXHRcdGNvbnN0IHNob3dDb250aW51ZU9uID0gaGFuZG9mZi5zaG93Q29udGludWVPbiA/PyB0cnVlO1xuXG5cdFx0Ly8gR2V0IGNoYXQgc2Vzc2lvbiBjb250cmlidXRpb25zIHRvIHNob3cgaW4gY2hldnJvbiBkcm9wZG93blxuXHRcdC8vIEZpbHRlciB0byBvbmx5IGZpcnN0LXBhcnR5IHByb3ZpZGVycyB0aGF0IHN1cHBvcnQgXCJjb250aW51ZSBpblwiLlxuXHRcdC8vIFRPRE86IEV4cGFuZCBsYXRlciB0byBhbnkgYWdlbnQgd2l0aCBgY2FuRGVsZWdhdGVgID09PSB0cnVlLlxuXHRcdGNvbnN0IGN1cnJlbnRTZXNzaW9uVHlwZSA9IHRoaXMuY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlPHN0cmluZz4oQ2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uVHlwZS5rZXkpO1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbnMgPSB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0QWxsQ2hhdFNlc3Npb25Db250cmlidXRpb25zKCk7XG5cdFx0Y29uc3QgYXZhaWxhYmxlQ29udHJpYnV0aW9ucyA9IGNvbnRyaWJ1dGlvbnMuZmlsdGVyKGMgPT4ge1xuXHRcdFx0aWYgKCFjLmNhbkRlbGVnYXRlKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChjLnR5cGUgPT09IGN1cnJlbnRTZXNzaW9uVHlwZSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGdldEFnZW50U2Vzc2lvblByb3ZpZGVyKGMudHlwZSk7XG5cdFx0XHRyZXR1cm4gcHJvdmlkZXIgIT09IHVuZGVmaW5lZCAmJiBnZXRBZ2VudENhbkNvbnRpbnVlSW4ocHJvdmlkZXIpO1xuXHRcdH0pO1xuXG5cdFx0aWYgKHNob3dDb250aW51ZU9uICYmIGF2YWlsYWJsZUNvbnRyaWJ1dGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0YnV0dG9uLmNsYXNzTGlzdC5hZGQoJ2NoYXQtc3VnZ2VzdC1uZXh0LWhhcy1kcm9wZG93bicpO1xuXHRcdFx0Ly8gQ3JlYXRlIGEgZHJvcGRvd24gY29udGFpbmVyIHRoYXQgd3JhcHMgc2VwYXJhdG9yIGFuZCBjaGV2cm9uIGZvciBhIGxhcmdlciBoaXQgYXJlYVxuXHRcdFx0Y29uc3QgZHJvcGRvd25Db250YWluZXIgPSBkb20uYXBwZW5kKGJ1dHRvbiwgZG9tLiQoJy5jaGF0LXN1Z2dlc3QtbmV4dC1kcm9wZG93bicpKTtcblx0XHRcdGRyb3Bkb3duQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCAnMCcpO1xuXHRcdFx0ZHJvcGRvd25Db250YWluZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdFx0ZHJvcGRvd25Db250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2NoYXQuc3VnZ2VzdE5leHQubW9yZU9wdGlvbnMnLCAnTW9yZSBvcHRpb25zIGZvciB7MH0nLCBoYW5kb2ZmLmxhYmVsKSk7XG5cdFx0XHRkcm9wZG93bkNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGFzcG9wdXAnLCAndHJ1ZScpO1xuXG5cdFx0XHRjb25zdCBzZXBhcmF0b3IgPSBkb20uYXBwZW5kKGRyb3Bkb3duQ29udGFpbmVyLCBkb20uJCgnLmNoYXQtc3VnZ2VzdC1uZXh0LXNlcGFyYXRvcicpKTtcblx0XHRcdHNlcGFyYXRvci5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRcdGNvbnN0IGNoZXZyb24gPSBkb20uYXBwZW5kKGRyb3Bkb3duQ29udGFpbmVyLCBkb20uJCgnLmNvZGljb24uY29kaWNvbi1jaGV2cm9uLWRvd24uZHJvcGRvd24tY2hldnJvbicpKTtcblx0XHRcdGNoZXZyb24uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cblx0XHRcdGNvbnN0IHNob3dDb250ZXh0TWVudSA9IChlOiBNb3VzZUV2ZW50IHwgS2V5Ym9hcmRFdmVudCwgYW5jaG9yPzogSFRNTEVsZW1lbnQpID0+IHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXG5cdFx0XHRcdGNvbnN0IGFjdGlvbnMgPSBhdmFpbGFibGVDb250cmlidXRpb25zLm1hcChjb250cmliID0+IHtcblx0XHRcdFx0XHRjb25zdCBwcm92aWRlciA9IGdldEFnZW50U2Vzc2lvblByb3ZpZGVyKGNvbnRyaWIudHlwZSkhO1xuXHRcdFx0XHRcdGNvbnN0IGljb24gPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlckljb24ocHJvdmlkZXIpO1xuXHRcdFx0XHRcdGNvbnN0IG5hbWUgPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlck5hbWUocHJvdmlkZXIpO1xuXHRcdFx0XHRcdHJldHVybiBuZXcgQWN0aW9uKFxuXHRcdFx0XHRcdFx0Y29udHJpYi50eXBlLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ2NvbnRpbnVlSW4nLCBcIkNvbnRpbnVlIGluIHswfVwiLCBuYW1lKSxcblx0XHRcdFx0XHRcdFRoZW1lSWNvbi5pc1RoZW1lSWNvbihpY29uKSA/IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShpY29uKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHRydWUsXG5cdFx0XHRcdFx0XHQoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRIYW5kb2ZmID0gZ2V0Q3VycmVudEhhbmRvZmYoKTtcblx0XHRcdFx0XHRcdFx0aWYgKGN1cnJlbnRIYW5kb2ZmKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fb25EaWRTZWxlY3RQcm9tcHQuZmlyZSh7IGhhbmRvZmY6IGN1cnJlbnRIYW5kb2ZmLCBhZ2VudElkOiBjb250cmliLm5hbWUgfSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gYW5jaG9yIHx8IGRyb3Bkb3duQ29udGFpbmVyLFxuXHRcdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbnMsXG5cdFx0XHRcdFx0YXV0b1NlbGVjdEZpcnN0SXRlbTogdHJ1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9O1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihkcm9wZG93bkNvbnRhaW5lciwgJ2NsaWNrJywgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdFx0c2hvd0NvbnRleHRNZW51KGUsIGRyb3Bkb3duQ29udGFpbmVyKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZHJvcGRvd25Db250YWluZXIsICdrZXlkb3duJywgKGUpID0+IHtcblx0XHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0XHRzaG93Q29udGV4dE1lbnUoZSwgZHJvcGRvd25Db250YWluZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihidXR0b24sICdjbGljaycsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRcdGlmIChkb20uaXNIVE1MRWxlbWVudChlLnRhcmdldCkgJiYgZS50YXJnZXQuY2xvc2VzdCgnLmNoYXQtc3VnZ2VzdC1uZXh0LWRyb3Bkb3duJykpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY3VycmVudEhhbmRvZmYgPSBnZXRDdXJyZW50SGFuZG9mZigpO1xuXHRcdFx0XHRpZiAoY3VycmVudEhhbmRvZmYpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFNlbGVjdFByb21wdC5maXJlKHsgaGFuZG9mZjogY3VycmVudEhhbmRvZmYgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYnV0dG9uLCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRIYW5kb2ZmID0gZ2V0Q3VycmVudEhhbmRvZmYoKTtcblx0XHRcdFx0aWYgKGN1cnJlbnRIYW5kb2ZmKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRTZWxlY3RQcm9tcHQuZmlyZSh7IGhhbmRvZmY6IGN1cnJlbnRIYW5kb2ZmIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYnV0dG9uLCAna2V5ZG93bicsIChlKSA9PiB7XG5cdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRIYW5kb2ZmID0gZ2V0Q3VycmVudEhhbmRvZmYoKTtcblx0XHRcdFx0aWYgKGN1cnJlbnRIYW5kb2ZmKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRTZWxlY3RQcm9tcHQuZmlyZSh7IGhhbmRvZmY6IGN1cnJlbnRIYW5kb2ZmIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gU3RvcmUgZGlzcG9zYWJsZXMgZm9yIHRoaXMgYnV0dG9uIHNvIHRoZXkgY2FuIGJlIGRpc3Bvc2VkIHdoZW4gdGhlIGJ1dHRvbiBpcyByZW1vdmVkXG5cdFx0dGhpcy5idXR0b25EaXNwb3NhYmxlcy5zZXQoYnV0dG9uLCBkaXNwb3NhYmxlcyk7XG5cblx0XHRyZXR1cm4gYnV0dG9uO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVBdXRvcGlsb3RCdXR0b24oaGFuZG9mZjogSUhhbmRPZmYpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBoYW5kb2ZmTGFiZWwgPSBoYW5kb2ZmLmxhYmVsO1xuXHRcdGNvbnN0IGdldEN1cnJlbnRIYW5kb2ZmID0gKCk6IElIYW5kT2ZmIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnRIYW5kb2ZmcyA9IHRoaXMuX2N1cnJlbnRNb2RlPy5oYW5kT2Zmcz8uZ2V0KCk7XG5cdFx0XHRyZXR1cm4gY3VycmVudEhhbmRvZmZzPy5maW5kKGggPT4gaC5sYWJlbCA9PT0gaGFuZG9mZkxhYmVsKSA/PyBoYW5kb2ZmO1xuXHRcdH07XG5cblx0XHRjb25zdCBsYWJlbCA9IGxvY2FsaXplKCdjaGF0LnN1Z2dlc3ROZXh0LnN0YXJ0V2l0aEF1dG9waWxvdCcsIFwiU3RhcnQgd2l0aCBBdXRvcGlsb3RcIik7XG5cdFx0Y29uc3QgYnV0dG9uID0gZG9tLiQoJy5jaGF0LXdlbGNvbWUtdmlldy1zdWdnZXN0ZWQtcHJvbXB0Jyk7XG5cdFx0YnV0dG9uLnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCAnMCcpO1xuXHRcdGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0YnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxhYmVsKTtcblxuXHRcdGNvbnN0IHRpdGxlRWxlbWVudCA9IGRvbS5hcHBlbmQoYnV0dG9uLCBkb20uJCgnLmNoYXQtd2VsY29tZS12aWV3LXN1Z2dlc3RlZC1wcm9tcHQtdGl0bGUnKSk7XG5cdFx0dGl0bGVFbGVtZW50LnRleHRDb250ZW50ID0gbGFiZWw7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihidXR0b24sICdjbGljaycsICgpID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnRIYW5kb2ZmID0gZ2V0Q3VycmVudEhhbmRvZmYoKTtcblx0XHRcdGlmIChjdXJyZW50SGFuZG9mZikge1xuXHRcdFx0XHR0aGlzLl9vbkRpZFNlbGVjdFByb21wdC5maXJlKHsgaGFuZG9mZjogY3VycmVudEhhbmRvZmYsIHdpdGhBdXRvcGlsb3Q6IHRydWUgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYnV0dG9uLCAna2V5ZG93bicsIGUgPT4ge1xuXHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRjb25zdCBjdXJyZW50SGFuZG9mZiA9IGdldEN1cnJlbnRIYW5kb2ZmKCk7XG5cdFx0XHRcdGlmIChjdXJyZW50SGFuZG9mZikge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkU2VsZWN0UHJvbXB0LmZpcmUoeyBoYW5kb2ZmOiBjdXJyZW50SGFuZG9mZiwgd2l0aEF1dG9waWxvdDogdHJ1ZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuYnV0dG9uRGlzcG9zYWJsZXMuc2V0KGJ1dHRvbiwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0cmV0dXJuIGJ1dHRvbjtcblx0fVxuXG5cdHB1YmxpYyBoaWRlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmRvbU5vZGUuc3R5bGUuZGlzcGxheSAhPT0gJ25vbmUnKSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50TW9kZSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdC8vIERpc3Bvc2UgYWxsIGJ1dHRvbiBkaXNwb3NhYmxlc1xuXHRcdGZvciAoY29uc3QgZGlzcG9zYWJsZXMgb2YgdGhpcy5idXR0b25EaXNwb3NhYmxlcy52YWx1ZXMoKSkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLmJ1dHRvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGNBQWM7QUFDdkIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsNEJBQTRCO0FBRXJDLFNBQVMsdUJBQXVCLHlCQUF5Qiw2QkFBNkIsbUNBQW1DO0FBUWxILElBQU0sd0JBQU4sY0FBb0MsV0FBVztBQUFBLEVBY3JELFlBQ3lDLHNCQUNGLG9CQUNDLHFCQUNGLG1CQUNwQztBQUNELFVBQU07QUFMa0M7QUFDRjtBQUNDO0FBQ0Y7QUFmdEMsU0FBaUIscUJBQXFCLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUN4RSxTQUFnQixvQkFBaUMsS0FBSyxtQkFBbUI7QUFFekUsU0FBaUIscUJBQXFCLEtBQUssVUFBVSxJQUFJLFFBQThCLENBQUM7QUFDeEYsU0FBZ0Isb0JBQWlELEtBQUssbUJBQW1CO0FBS3pGLFNBQVEsb0JBQW9CLG9CQUFJLElBQWtDO0FBU2pFLFNBQUssVUFBVSxLQUFLLHdCQUF3QjtBQUFBLEVBQzdDO0FBQUEsRUFFQSxJQUFXLFNBQWlCO0FBQzNCLFdBQU8sS0FBSyxRQUFRLE1BQU0sWUFBWSxTQUFTLElBQUksS0FBSyxRQUFRO0FBQUEsRUFDakU7QUFBQSxFQUVPLGlCQUF3QztBQUM5QyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFUSwwQkFBdUM7QUFFOUMsVUFBTSxZQUFZLElBQUksRUFBRSwrREFBK0Q7QUFDdkYsY0FBVSxNQUFNLFVBQVU7QUFHMUIsU0FBSyxlQUFlLElBQUksT0FBTyxXQUFXLElBQUksRUFBRSw0Q0FBNEMsQ0FBQztBQUc3RixTQUFLLG1CQUFtQjtBQUV4QixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRU8sT0FBTyxNQUF1QjtBQUNwQyxVQUFNLFdBQVcsS0FBSyxVQUFVLElBQUk7QUFFcEMsUUFBSSxDQUFDLFlBQVksU0FBUyxXQUFXLEdBQUc7QUFDdkMsV0FBSyxLQUFLO0FBQ1Y7QUFBQSxJQUNEO0FBRUEsU0FBSyxlQUFlO0FBR3BCLFVBQU0sV0FBVyxLQUFLLEtBQUssSUFBSSxLQUFLLEtBQUssTUFBTSxJQUFJLEtBQUssU0FBUyxvQkFBb0IsY0FBYztBQUNuRyxTQUFLLGFBQWEsY0FBYyxTQUFTLG9CQUFvQixvQkFBb0IsUUFBUTtBQUd6RixVQUFNLG1CQUFrQyxDQUFDO0FBQ3pDLGFBQVMsSUFBSSxHQUFHLElBQUksS0FBSyxpQkFBaUIsU0FBUyxRQUFRLEtBQUs7QUFDL0QsdUJBQWlCLEtBQUssS0FBSyxpQkFBaUIsU0FBUyxDQUFDLENBQWdCO0FBQUEsSUFDdkU7QUFDQSxlQUFXLFNBQVMsa0JBQWtCO0FBQ3JDLFlBQU0sY0FBYyxLQUFLLGtCQUFrQixJQUFJLEtBQUs7QUFDcEQsVUFBSSxhQUFhO0FBQ2hCLG9CQUFZLFFBQVE7QUFDcEIsYUFBSyxrQkFBa0IsT0FBTyxLQUFLO0FBQUEsTUFDcEM7QUFDQSxXQUFLLGlCQUFpQixZQUFZLEtBQUs7QUFBQSxJQUN4QztBQUVBLFVBQU0sOEJBQThCLEtBQUsscUJBQXFCLFFBQWlCLGtCQUFrQixpQkFBaUIsRUFBRSxnQkFBZ0I7QUFDcEksVUFBTSx1QkFBdUIsQ0FBQyw4QkFBOEIsU0FBUyxLQUFLLE9BQUssRUFBRSxJQUFJLElBQUk7QUFFekYsZUFBVyxXQUFXLFVBQVU7QUFDL0IsWUFBTSxlQUFlLEtBQUssbUJBQW1CLE9BQU87QUFDcEQsV0FBSyxpQkFBaUIsWUFBWSxZQUFZO0FBRTlDLFVBQUksWUFBWSxzQkFBc0I7QUFDckMsY0FBTSxrQkFBa0IsS0FBSyxzQkFBc0IsT0FBTztBQUMxRCxhQUFLLGlCQUFpQixZQUFZLGVBQWU7QUFBQSxNQUNsRDtBQUFBLElBQ0Q7QUFFQSxTQUFLLFFBQVEsTUFBTSxVQUFVO0FBQzdCLFNBQUssbUJBQW1CLEtBQUs7QUFBQSxFQUM5QjtBQUFBLEVBRVEsbUJBQW1CLFNBQWdDO0FBQzFELFVBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUl4QyxVQUFNLGVBQWUsUUFBUTtBQUM3QixVQUFNLG9CQUFvQixNQUE0QjtBQUNyRCxZQUFNLGtCQUFrQixLQUFLLGNBQWMsVUFBVSxJQUFJO0FBQ3pELGFBQU8saUJBQWlCLEtBQUssT0FBSyxFQUFFLFVBQVUsWUFBWSxLQUFLO0FBQUEsSUFDaEU7QUFFQSxVQUFNLFNBQVMsSUFBSSxFQUFFLHFDQUFxQztBQUMxRCxXQUFPLGFBQWEsWUFBWSxHQUFHO0FBQ25DLFdBQU8sYUFBYSxRQUFRLFFBQVE7QUFDcEMsV0FBTyxhQUFhLGNBQWMsU0FBUyx5QkFBeUIsT0FBTyxRQUFRLEtBQUssQ0FBQztBQUV6RixVQUFNLGVBQWUsSUFBSSxPQUFPLFFBQVEsSUFBSSxFQUFFLDJDQUEyQyxDQUFDO0FBQzFGLGlCQUFhLGNBQWMsUUFBUTtBQUduQyxVQUFNLGlCQUFpQixRQUFRLGtCQUFrQjtBQUtqRCxVQUFNLHFCQUFxQixLQUFLLGtCQUFrQixtQkFBMkIsZ0JBQWdCLGdCQUFnQixHQUFHO0FBQ2hILFVBQU0sZ0JBQWdCLEtBQUssb0JBQW9CLCtCQUErQjtBQUM5RSxVQUFNLHlCQUF5QixjQUFjLE9BQU8sT0FBSztBQUN4RCxVQUFJLENBQUMsRUFBRSxhQUFhO0FBQ25CLGVBQU87QUFBQSxNQUNSO0FBQ0EsVUFBSSxFQUFFLFNBQVMsb0JBQW9CO0FBQ2xDLGVBQU87QUFBQSxNQUNSO0FBQ0EsWUFBTSxXQUFXLHdCQUF3QixFQUFFLElBQUk7QUFDL0MsYUFBTyxhQUFhLFVBQWEsc0JBQXNCLFFBQVE7QUFBQSxJQUNoRSxDQUFDO0FBRUQsUUFBSSxrQkFBa0IsdUJBQXVCLFNBQVMsR0FBRztBQUN4RCxhQUFPLFVBQVUsSUFBSSxnQ0FBZ0M7QUFFckQsWUFBTSxvQkFBb0IsSUFBSSxPQUFPLFFBQVEsSUFBSSxFQUFFLDZCQUE2QixDQUFDO0FBQ2pGLHdCQUFrQixhQUFhLFlBQVksR0FBRztBQUM5Qyx3QkFBa0IsYUFBYSxRQUFRLFFBQVE7QUFDL0Msd0JBQWtCLGFBQWEsY0FBYyxTQUFTLGdDQUFnQyx3QkFBd0IsUUFBUSxLQUFLLENBQUM7QUFDNUgsd0JBQWtCLGFBQWEsaUJBQWlCLE1BQU07QUFFdEQsWUFBTSxZQUFZLElBQUksT0FBTyxtQkFBbUIsSUFBSSxFQUFFLDhCQUE4QixDQUFDO0FBQ3JGLGdCQUFVLGFBQWEsZUFBZSxNQUFNO0FBQzVDLFlBQU0sVUFBVSxJQUFJLE9BQU8sbUJBQW1CLElBQUksRUFBRSxnREFBZ0QsQ0FBQztBQUNyRyxjQUFRLGFBQWEsZUFBZSxNQUFNO0FBRTFDLFlBQU0sa0JBQWtCLENBQUMsR0FBK0IsV0FBeUI7QUFDaEYsVUFBRSxlQUFlO0FBQ2pCLFVBQUUsZ0JBQWdCO0FBRWxCLGNBQU0sVUFBVSx1QkFBdUIsSUFBSSxhQUFXO0FBQ3JELGdCQUFNLFdBQVcsd0JBQXdCLFFBQVEsSUFBSTtBQUNyRCxnQkFBTSxPQUFPLDRCQUE0QixRQUFRO0FBQ2pELGdCQUFNLE9BQU8sNEJBQTRCLFFBQVE7QUFDakQsaUJBQU8sSUFBSTtBQUFBLFlBQ1YsUUFBUTtBQUFBLFlBQ1IsU0FBUyxjQUFjLG1CQUFtQixJQUFJO0FBQUEsWUFDOUMsVUFBVSxZQUFZLElBQUksSUFBSSxVQUFVLFlBQVksSUFBSSxJQUFJO0FBQUEsWUFDNUQ7QUFBQSxZQUNBLE1BQU07QUFDTCxvQkFBTSxpQkFBaUIsa0JBQWtCO0FBQ3pDLGtCQUFJLGdCQUFnQjtBQUNuQixxQkFBSyxtQkFBbUIsS0FBSyxFQUFFLFNBQVMsZ0JBQWdCLFNBQVMsUUFBUSxLQUFLLENBQUM7QUFBQSxjQUNoRjtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsUUFDRCxDQUFDO0FBRUQsYUFBSyxtQkFBbUIsZ0JBQWdCO0FBQUEsVUFDdkMsV0FBVyxNQUFNLFVBQVU7QUFBQSxVQUMzQixZQUFZLE1BQU07QUFBQSxVQUNsQixxQkFBcUI7QUFBQSxRQUN0QixDQUFDO0FBQUEsTUFDRjtBQUVBLGtCQUFZLElBQUksSUFBSSxzQkFBc0IsbUJBQW1CLFNBQVMsQ0FBQyxNQUFrQjtBQUN4Rix3QkFBZ0IsR0FBRyxpQkFBaUI7QUFBQSxNQUNyQyxDQUFDLENBQUM7QUFFRixrQkFBWSxJQUFJLElBQUksc0JBQXNCLG1CQUFtQixXQUFXLENBQUMsTUFBTTtBQUM5RSxZQUFJLEVBQUUsUUFBUSxXQUFXLEVBQUUsUUFBUSxLQUFLO0FBQ3ZDLDBCQUFnQixHQUFHLGlCQUFpQjtBQUFBLFFBQ3JDO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFDRixrQkFBWSxJQUFJLElBQUksc0JBQXNCLFFBQVEsU0FBUyxDQUFDLE1BQWtCO0FBQzdFLFlBQUksSUFBSSxjQUFjLEVBQUUsTUFBTSxLQUFLLEVBQUUsT0FBTyxRQUFRLDZCQUE2QixHQUFHO0FBQ25GO0FBQUEsUUFDRDtBQUNBLGNBQU0saUJBQWlCLGtCQUFrQjtBQUN6QyxZQUFJLGdCQUFnQjtBQUNuQixlQUFLLG1CQUFtQixLQUFLLEVBQUUsU0FBUyxlQUFlLENBQUM7QUFBQSxRQUN6RDtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQUEsSUFDSCxPQUFPO0FBQ04sa0JBQVksSUFBSSxJQUFJLHNCQUFzQixRQUFRLFNBQVMsTUFBTTtBQUNoRSxjQUFNLGlCQUFpQixrQkFBa0I7QUFDekMsWUFBSSxnQkFBZ0I7QUFDbkIsZUFBSyxtQkFBbUIsS0FBSyxFQUFFLFNBQVMsZUFBZSxDQUFDO0FBQUEsUUFDekQ7QUFBQSxNQUNELENBQUMsQ0FBQztBQUFBLElBQ0g7QUFFQSxnQkFBWSxJQUFJLElBQUksc0JBQXNCLFFBQVEsV0FBVyxDQUFDLE1BQU07QUFDbkUsVUFBSSxFQUFFLFFBQVEsV0FBVyxFQUFFLFFBQVEsS0FBSztBQUN2QyxVQUFFLGVBQWU7QUFDakIsY0FBTSxpQkFBaUIsa0JBQWtCO0FBQ3pDLFlBQUksZ0JBQWdCO0FBQ25CLGVBQUssbUJBQW1CLEtBQUssRUFBRSxTQUFTLGVBQWUsQ0FBQztBQUFBLFFBQ3pEO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBR0YsU0FBSyxrQkFBa0IsSUFBSSxRQUFRLFdBQVc7QUFFOUMsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLHNCQUFzQixTQUFnQztBQUM3RCxVQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFFeEMsVUFBTSxlQUFlLFFBQVE7QUFDN0IsVUFBTSxvQkFBb0IsTUFBNEI7QUFDckQsWUFBTSxrQkFBa0IsS0FBSyxjQUFjLFVBQVUsSUFBSTtBQUN6RCxhQUFPLGlCQUFpQixLQUFLLE9BQUssRUFBRSxVQUFVLFlBQVksS0FBSztBQUFBLElBQ2hFO0FBRUEsVUFBTSxRQUFRLFNBQVMsdUNBQXVDLHNCQUFzQjtBQUNwRixVQUFNLFNBQVMsSUFBSSxFQUFFLHFDQUFxQztBQUMxRCxXQUFPLGFBQWEsWUFBWSxHQUFHO0FBQ25DLFdBQU8sYUFBYSxRQUFRLFFBQVE7QUFDcEMsV0FBTyxhQUFhLGNBQWMsS0FBSztBQUV2QyxVQUFNLGVBQWUsSUFBSSxPQUFPLFFBQVEsSUFBSSxFQUFFLDJDQUEyQyxDQUFDO0FBQzFGLGlCQUFhLGNBQWM7QUFFM0IsZ0JBQVksSUFBSSxJQUFJLHNCQUFzQixRQUFRLFNBQVMsTUFBTTtBQUNoRSxZQUFNLGlCQUFpQixrQkFBa0I7QUFDekMsVUFBSSxnQkFBZ0I7QUFDbkIsYUFBSyxtQkFBbUIsS0FBSyxFQUFFLFNBQVMsZ0JBQWdCLGVBQWUsS0FBSyxDQUFDO0FBQUEsTUFDOUU7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLGdCQUFZLElBQUksSUFBSSxzQkFBc0IsUUFBUSxXQUFXLE9BQUs7QUFDakUsVUFBSSxFQUFFLFFBQVEsV0FBVyxFQUFFLFFBQVEsS0FBSztBQUN2QyxVQUFFLGVBQWU7QUFDakIsY0FBTSxpQkFBaUIsa0JBQWtCO0FBQ3pDLFlBQUksZ0JBQWdCO0FBQ25CLGVBQUssbUJBQW1CLEtBQUssRUFBRSxTQUFTLGdCQUFnQixlQUFlLEtBQUssQ0FBQztBQUFBLFFBQzlFO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsU0FBSyxrQkFBa0IsSUFBSSxRQUFRLFdBQVc7QUFFOUMsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLE9BQWE7QUFDbkIsUUFBSSxLQUFLLFFBQVEsTUFBTSxZQUFZLFFBQVE7QUFDMUMsV0FBSyxlQUFlO0FBQ3BCLFdBQUssUUFBUSxNQUFNLFVBQVU7QUFDN0IsV0FBSyxtQkFBbUIsS0FBSztBQUFBLElBQzlCO0FBQUEsRUFDRDtBQUFBLEVBRWdCLFVBQWdCO0FBRS9CLGVBQVcsZUFBZSxLQUFLLGtCQUFrQixPQUFPLEdBQUc7QUFDMUQsa0JBQVksUUFBUTtBQUFBLElBQ3JCO0FBQ0EsU0FBSyxrQkFBa0IsTUFBTTtBQUM3QixVQUFNLFFBQVE7QUFBQSxFQUNmO0FBQ0Q7QUEvUWEsd0JBQU47QUFBQSxFQWVKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FsQlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
