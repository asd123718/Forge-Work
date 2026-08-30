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
import * as DOM from "../../../../../base/browser/dom.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { isUUID } from "../../../../../base/common/uuid.js";
import { localize } from "../../../../../nls.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { defaultButtonStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { IChatDebugService } from "../../common/chatDebugService.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { AgentHostAgentDebugLogEnabledSettingId, AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING } from "../../common/promptSyntax/promptTypes.js";
import { getChatSessionType, isUntitledChatSession, LocalChatSessionUri } from "../../common/model/chatUri.js";
import { IChatWidgetService } from "../chat.js";
import { IAgentSessionsService } from "../agentSessions/agentSessionsService.js";
import { IPreferencesService } from "../../../../services/preferences/common/preferences.js";
const $ = DOM.$;
const PAGE_SIZE = 5;
let ChatDebugHomeView = class extends Disposable {
  constructor(parent, chatService, chatDebugService, chatWidgetService, agentSessionsService, configurationService, preferencesService) {
    super();
    this.chatService = chatService;
    this.chatDebugService = chatDebugService;
    this.chatWidgetService = chatWidgetService;
    this.agentSessionsService = agentSessionsService;
    this.configurationService = configurationService;
    this.preferencesService = preferencesService;
    this._onNavigateToSession = this._register(new Emitter());
    this.onNavigateToSession = this._onNavigateToSession.event;
    this.renderDisposables = this._register(new DisposableStore());
    /** Number of sessions currently visible (grows on "Show More"). */
    this._visibleCount = PAGE_SIZE;
    /** Tracks the number of known sessions so we can detect new ones. */
    this._lastKnownSessionCount = 0;
    this.container = DOM.append(parent, $(".chat-debug-home"));
    this.scrollContent = DOM.append(this.container, $("div.chat-debug-home-content"));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING) || e.affectsConfiguration(AgentHostAgentDebugLogEnabledSettingId)) {
        this.render();
      }
    }));
    this._register(this.chatDebugService.onDidAddEvent((e) => {
      const currentCount = this.chatDebugService.getSessionResources().length;
      if (currentCount !== this._lastKnownSessionCount) {
        this._lastKnownSessionCount = currentCount;
        if (this.container.style.display !== "none") {
          this.render();
        }
      }
    }));
    this._register(this.chatDebugService.onDidChangeAvailableSessionResources(() => {
      if (this.container.style.display !== "none") {
        this.render();
      }
    }));
  }
  show() {
    this.container.style.display = "";
    this.render();
  }
  hide() {
    this.container.style.display = "none";
  }
  render() {
    const isEnabled = this._isDebugEnabled();
    this._lastKnownSessionCount = this.chatDebugService.getSessionResources().length;
    const sessionResources = isEnabled ? this._getFilteredSessionResources(this.chatDebugService.getAvailableSessionResources()) : [];
    this._renderWithSessions(sessionResources);
  }
  /**
   * The panel is enabled when either local file logging or agent-host (Copilot
   * CLI) debug logging is on; each provider self-gates on its own setting, so
   * the aggregated session list only contains the sources that are enabled.
   */
  _isDebugEnabled() {
    return this.configurationService.getValue(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING) || this.configurationService.getValue(AgentHostAgentDebugLogEnabledSettingId);
  }
  _getFilteredSessionResources(resources) {
    const cliSessionTypes = /* @__PURE__ */ new Set(["copilotcli"]);
    return [...resources].filter((r) => !cliSessionTypes.has(getChatSessionType(r)) || !isUntitledChatSession(r));
  }
  _renderWithSessions(sessionResources) {
    DOM.clearNode(this.scrollContent);
    this.renderDisposables.clear();
    DOM.append(this.scrollContent, $("h2.chat-debug-home-title", void 0, localize("chatDebug.title", "Agent Debug Logs")));
    const isEnabled = this._isDebugEnabled();
    if (!isEnabled) {
      DOM.append(this.scrollContent, $(
        "p.chat-debug-home-subtitle",
        void 0,
        localize("chatDebug.disabled", "Enable to view debug logs and investigate chat issues with /troubleshoot.")
      ));
      const enableButton = this.renderDisposables.add(new Button(this.scrollContent, { ...defaultButtonStyles, secondary: true }));
      enableButton.element.style.width = "auto";
      enableButton.label = localize("chatDebug.openSetting", "Enable in Settings");
      this.renderDisposables.add(enableButton.onDidClick(() => {
        this.preferencesService.openSettings({ jsonEditor: false, query: "agentDebugLog" });
      }));
      return;
    }
    const activeWidget = this.chatWidgetService.lastFocusedWidget;
    const activeSessionResource = activeWidget?.viewModel?.sessionResource;
    const bubbleToTop = (resource) => {
      if (!resource) {
        return;
      }
      const idx = sessionResources.findIndex((r) => r.toString() === resource.toString());
      if (idx > 0) {
        sessionResources.splice(idx, 1);
        sessionResources.unshift(resource);
      }
    };
    bubbleToTop(this._lastOpenedSessionResource);
    bubbleToTop(activeSessionResource);
    DOM.append(this.scrollContent, $(
      "p.chat-debug-home-subtitle",
      void 0,
      sessionResources.length > 0 ? localize("chatDebug.homeSubtitle", "Select a chat session to debug") : localize("chatDebug.noSessions", "Send a chat message to get started")
    ));
    if (sessionResources.length > 0) {
      const visibleSessions = sessionResources.slice(0, this._visibleCount);
      const sessionList = DOM.append(this.scrollContent, $(".chat-debug-home-session-list"));
      sessionList.setAttribute("role", "list");
      sessionList.setAttribute("aria-label", localize("chatDebug.sessionList", "Chat sessions"));
      const items = [];
      for (const sessionResource of visibleSessions) {
        const agentSession = this.agentSessionsService.model.getSession(sessionResource);
        const rawTitle = agentSession?.label ?? this.chatService.getSessionTitle(sessionResource);
        const importedTitle = this.chatDebugService.getImportedSessionTitle(sessionResource);
        const historicalTitle = this.chatDebugService.getHistoricalSessionTitle(sessionResource);
        let sessionTitle;
        if (rawTitle && !isUUID(rawTitle)) {
          sessionTitle = rawTitle;
        } else if (historicalTitle) {
          sessionTitle = historicalTitle;
        } else if (importedTitle) {
          sessionTitle = localize("chatDebug.importedSession", "Imported: {0}", importedTitle);
        } else if (LocalChatSessionUri.isLocalSession(sessionResource)) {
          sessionTitle = localize("chatDebug.newSession", "New Chat");
        } else if (getChatSessionType(sessionResource) === "copilotcli") {
          const pathId = sessionResource.path.replace(/^\//, "").split("-")[0];
          const shortId = pathId || sessionResource.authority || sessionResource.toString();
          sessionTitle = localize("chatDebug.copilotCliSessionWithId", "Copilot CLI: {0}", shortId);
        } else {
          sessionTitle = localize("chatDebug.newSession", "New Chat");
        }
        const isActive = activeSessionResource !== void 0 && sessionResource.toString() === activeSessionResource.toString();
        const item = DOM.append(sessionList, $("button.chat-debug-home-session-item"));
        item.setAttribute("role", "listitem");
        if (isActive) {
          item.classList.add("chat-debug-home-session-item-active");
          item.setAttribute("aria-current", "true");
        }
        DOM.append(item, $(`span${ThemeIcon.asCSSSelector(Codicon.comment)}`));
        const titleSpan = DOM.append(item, $("span.chat-debug-home-session-item-title"));
        titleSpan.textContent = sessionTitle;
        const ariaLabel = isActive ? localize("chatDebug.sessionItemActive", "{0} (active)", sessionTitle) : sessionTitle;
        item.setAttribute("aria-label", ariaLabel);
        if (isActive) {
          DOM.append(item, $("span.chat-debug-home-session-badge", void 0, localize("chatDebug.active", "Active")));
        }
        this.renderDisposables.add(DOM.addDisposableListener(item, DOM.EventType.CLICK, () => {
          this._lastOpenedSessionResource = sessionResource;
          this._onNavigateToSession.fire(sessionResource);
        }));
        items.push(item);
      }
      if (sessionResources.length > this._visibleCount) {
        const remaining = sessionResources.length - this._visibleCount;
        const showMoreButton = this.renderDisposables.add(new Button(this.scrollContent, { ...defaultButtonStyles, secondary: true }));
        showMoreButton.element.classList.add("chat-debug-home-show-more");
        showMoreButton.label = localize("chatDebug.showMore", "Show More ({0})", remaining);
        this.renderDisposables.add(showMoreButton.onDidClick(() => {
          this._visibleCount += PAGE_SIZE;
          this.render();
        }));
      }
      this.renderDisposables.add(DOM.addDisposableListener(sessionList, DOM.EventType.KEY_DOWN, (e) => {
        if (items.length === 0) {
          return;
        }
        const focused = DOM.getActiveElement();
        const idx = items.indexOf(focused);
        if (idx === -1) {
          return;
        }
        let nextIdx;
        switch (e.key) {
          case "ArrowDown":
            nextIdx = idx + 1 < items.length ? idx + 1 : idx;
            break;
          case "ArrowUp":
            nextIdx = idx - 1 >= 0 ? idx - 1 : idx;
            break;
          case "Home":
            nextIdx = 0;
            break;
          case "End":
            nextIdx = items.length - 1;
            break;
        }
        if (nextIdx !== void 0) {
          e.preventDefault();
          items[nextIdx].focus();
        }
      }));
    }
  }
};
ChatDebugHomeView = __decorateClass([
  __decorateParam(1, IChatService),
  __decorateParam(2, IChatDebugService),
  __decorateParam(3, IChatWidgetService),
  __decorateParam(4, IAgentSessionsService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IPreferencesService)
], ChatDebugHomeView);
export {
  ChatDebugHomeView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXREZWJ1Z1xcY2hhdERlYnVnSG9tZVZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGlzVVVJRCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IElDaGF0RGVidWdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXREZWJ1Z1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEFnZW50RGVidWdMb2dFbmFibGVkU2V0dGluZ0lkLCBBR0VOVF9ERUJVR19MT0dfRklMRV9MT0dHSU5HX0VOQUJMRURfU0VUVElORyB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlLCBpc1VudGl0bGVkQ2hhdFNlc3Npb24sIExvY2FsQ2hhdFNlc3Npb25VcmkgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi9jaGF0LmpzJztcbmltcG9ydCB7IElBZ2VudFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5cbmNvbnN0ICQgPSBET00uJDtcblxuY29uc3QgUEFHRV9TSVpFID0gNTtcblxuZXhwb3J0IGNsYXNzIENoYXREZWJ1Z0hvbWVWaWV3IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25OYXZpZ2F0ZVRvU2Vzc2lvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFVSST4oKSk7XG5cdHJlYWRvbmx5IG9uTmF2aWdhdGVUb1Nlc3Npb24gPSB0aGlzLl9vbk5hdmlnYXRlVG9TZXNzaW9uLmV2ZW50O1xuXG5cdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2Nyb2xsQ29udGVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgcmVuZGVyRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdC8qKiBOdW1iZXIgb2Ygc2Vzc2lvbnMgY3VycmVudGx5IHZpc2libGUgKGdyb3dzIG9uIFwiU2hvdyBNb3JlXCIpLiAqL1xuXHRwcml2YXRlIF92aXNpYmxlQ291bnQgPSBQQUdFX1NJWkU7XG5cblx0LyoqIFNlc3Npb24gcmVzb3VyY2UgdGhhdCB0aGUgdXNlciBsYXN0IG5hdmlnYXRlZCB0byBmcm9tIHRoZSBob21lIHZpZXcuICovXG5cdHByaXZhdGUgX2xhc3RPcGVuZWRTZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblxuXHQvKiogVHJhY2tzIHRoZSBudW1iZXIgb2Yga25vd24gc2Vzc2lvbnMgc28gd2UgY2FuIGRldGVjdCBuZXcgb25lcy4gKi9cblx0cHJpdmF0ZSBfbGFzdEtub3duU2Vzc2lvbkNvdW50ID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwYXJlbnQ6IEhUTUxFbGVtZW50LFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJQ2hhdERlYnVnU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXREZWJ1Z1NlcnZpY2U6IElDaGF0RGVidWdTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhZ2VudFNlc3Npb25zU2VydmljZTogSUFnZW50U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJlZmVyZW5jZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJlZmVyZW5jZXNTZXJ2aWNlOiBJUHJlZmVyZW5jZXNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuY29udGFpbmVyID0gRE9NLmFwcGVuZChwYXJlbnQsICQoJy5jaGF0LWRlYnVnLWhvbWUnKSk7XG5cdFx0dGhpcy5zY3JvbGxDb250ZW50ID0gRE9NLmFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnZGl2LmNoYXQtZGVidWctaG9tZS1jb250ZW50JykpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihBR0VOVF9ERUJVR19MT0dfRklMRV9MT0dHSU5HX0VOQUJMRURfU0VUVElORykgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihBZ2VudEhvc3RBZ2VudERlYnVnTG9nRW5hYmxlZFNldHRpbmdJZCkpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZS1yZW5kZXIgd2hlbiBhIG5ldyBzZXNzaW9uIGFwcGVhcnMgc28gaXQgc3VyZmFjZXMgYXQgdGhlIHRvcC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXREZWJ1Z1NlcnZpY2Uub25EaWRBZGRFdmVudChlID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnRDb3VudCA9IHRoaXMuY2hhdERlYnVnU2VydmljZS5nZXRTZXNzaW9uUmVzb3VyY2VzKCkubGVuZ3RoO1xuXHRcdFx0aWYgKGN1cnJlbnRDb3VudCAhPT0gdGhpcy5fbGFzdEtub3duU2Vzc2lvbkNvdW50KSB7XG5cdFx0XHRcdHRoaXMuX2xhc3RLbm93blNlc3Npb25Db3VudCA9IGN1cnJlbnRDb3VudDtcblx0XHRcdFx0aWYgKHRoaXMuY29udGFpbmVyLnN0eWxlLmRpc3BsYXkgIT09ICdub25lJykge1xuXHRcdFx0XHRcdHRoaXMucmVuZGVyKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZS1yZW5kZXIgd2hlbiBoaXN0b3JpY2FsIHNlc3Npb25zIGFyZSBkaXNjb3ZlcmVkIGZyb20gZGlzay5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXREZWJ1Z1NlcnZpY2Uub25EaWRDaGFuZ2VBdmFpbGFibGVTZXNzaW9uUmVzb3VyY2VzKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ICE9PSAnbm9uZScpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRzaG93KCk6IHZvaWQge1xuXHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR0aGlzLnJlbmRlcigpO1xuXHR9XG5cblx0aGlkZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHR9XG5cblx0cmVuZGVyKCk6IHZvaWQge1xuXHRcdGNvbnN0IGlzRW5hYmxlZCA9IHRoaXMuX2lzRGVidWdFbmFibGVkKCk7XG5cdFx0dGhpcy5fbGFzdEtub3duU2Vzc2lvbkNvdW50ID0gdGhpcy5jaGF0RGVidWdTZXJ2aWNlLmdldFNlc3Npb25SZXNvdXJjZXMoKS5sZW5ndGg7XG5cblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2VzID0gaXNFbmFibGVkXG5cdFx0XHQ/IHRoaXMuX2dldEZpbHRlcmVkU2Vzc2lvblJlc291cmNlcyh0aGlzLmNoYXREZWJ1Z1NlcnZpY2UuZ2V0QXZhaWxhYmxlU2Vzc2lvblJlc291cmNlcygpKVxuXHRcdFx0OiBbXTtcblx0XHR0aGlzLl9yZW5kZXJXaXRoU2Vzc2lvbnMoc2Vzc2lvblJlc291cmNlcyk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHBhbmVsIGlzIGVuYWJsZWQgd2hlbiBlaXRoZXIgbG9jYWwgZmlsZSBsb2dnaW5nIG9yIGFnZW50LWhvc3QgKENvcGlsb3Rcblx0ICogQ0xJKSBkZWJ1ZyBsb2dnaW5nIGlzIG9uOyBlYWNoIHByb3ZpZGVyIHNlbGYtZ2F0ZXMgb24gaXRzIG93biBzZXR0aW5nLCBzb1xuXHQgKiB0aGUgYWdncmVnYXRlZCBzZXNzaW9uIGxpc3Qgb25seSBjb250YWlucyB0aGUgc291cmNlcyB0aGF0IGFyZSBlbmFibGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfaXNEZWJ1Z0VuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQUdFTlRfREVCVUdfTE9HX0ZJTEVfTE9HR0lOR19FTkFCTEVEX1NFVFRJTkcpXG5cdFx0XHR8fCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KEFnZW50SG9zdEFnZW50RGVidWdMb2dFbmFibGVkU2V0dGluZ0lkKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEZpbHRlcmVkU2Vzc2lvblJlc291cmNlcyhyZXNvdXJjZXM6IHJlYWRvbmx5IFVSSVtdKTogVVJJW10ge1xuXHRcdGNvbnN0IGNsaVNlc3Npb25UeXBlcyA9IG5ldyBTZXQoWydjb3BpbG90Y2xpJ10pO1xuXHRcdHJldHVybiBbLi4ucmVzb3VyY2VzXVxuXHRcdFx0LmZpbHRlcihyID0+ICFjbGlTZXNzaW9uVHlwZXMuaGFzKGdldENoYXRTZXNzaW9uVHlwZShyKSkgfHwgIWlzVW50aXRsZWRDaGF0U2Vzc2lvbihyKSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJXaXRoU2Vzc2lvbnMoc2Vzc2lvblJlc291cmNlczogVVJJW10pOiB2b2lkIHtcblx0XHRET00uY2xlYXJOb2RlKHRoaXMuc2Nyb2xsQ29udGVudCk7XG5cdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0RE9NLmFwcGVuZCh0aGlzLnNjcm9sbENvbnRlbnQsICQoJ2gyLmNoYXQtZGVidWctaG9tZS10aXRsZScsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2NoYXREZWJ1Zy50aXRsZScsIFwiQWdlbnQgRGVidWcgTG9nc1wiKSkpO1xuXG5cdFx0Y29uc3QgaXNFbmFibGVkID0gdGhpcy5faXNEZWJ1Z0VuYWJsZWQoKTtcblx0XHRpZiAoIWlzRW5hYmxlZCkge1xuXHRcdFx0RE9NLmFwcGVuZCh0aGlzLnNjcm9sbENvbnRlbnQsICQoJ3AuY2hhdC1kZWJ1Zy1ob21lLXN1YnRpdGxlJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRsb2NhbGl6ZSgnY2hhdERlYnVnLmRpc2FibGVkJywgXCJFbmFibGUgdG8gdmlldyBkZWJ1ZyBsb2dzIGFuZCBpbnZlc3RpZ2F0ZSBjaGF0IGlzc3VlcyB3aXRoIC90cm91Ymxlc2hvb3QuXCIpXG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3QgZW5hYmxlQnV0dG9uID0gdGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbih0aGlzLnNjcm9sbENvbnRlbnQsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlIH0pKTtcblx0XHRcdGVuYWJsZUJ1dHRvbi5lbGVtZW50LnN0eWxlLndpZHRoID0gJ2F1dG8nO1xuXHRcdFx0ZW5hYmxlQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ2NoYXREZWJ1Zy5vcGVuU2V0dGluZycsIFwiRW5hYmxlIGluIFNldHRpbmdzXCIpO1xuXHRcdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQoZW5hYmxlQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnByZWZlcmVuY2VzU2VydmljZS5vcGVuU2V0dGluZ3MoeyBqc29uRWRpdG9yOiBmYWxzZSwgcXVlcnk6ICdhZ2VudERlYnVnTG9nJyB9KTtcblx0XHRcdH0pKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBEZXRlcm1pbmUgdGhlIGFjdGl2ZSBzZXNzaW9uIHJlc291cmNlXG5cdFx0Y29uc3QgYWN0aXZlV2lkZ2V0ID0gdGhpcy5jaGF0V2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldDtcblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uUmVzb3VyY2UgPSBhY3RpdmVXaWRnZXQ/LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlO1xuXG5cdFx0Ly8gQnViYmxlIGFjdGl2ZSBzZXNzaW9ucyB0byB0b3Bcblx0XHRjb25zdCBidWJibGVUb1RvcCA9IChyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRpZiAoIXJlc291cmNlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGlkeCA9IHNlc3Npb25SZXNvdXJjZXMuZmluZEluZGV4KHIgPT4gci50b1N0cmluZygpID09PSByZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdGlmIChpZHggPiAwKSB7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZXMuc3BsaWNlKGlkeCwgMSk7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZXMudW5zaGlmdChyZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRidWJibGVUb1RvcCh0aGlzLl9sYXN0T3BlbmVkU2Vzc2lvblJlc291cmNlKTtcblx0XHRidWJibGVUb1RvcChhY3RpdmVTZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0RE9NLmFwcGVuZCh0aGlzLnNjcm9sbENvbnRlbnQsICQoJ3AuY2hhdC1kZWJ1Zy1ob21lLXN1YnRpdGxlJywgdW5kZWZpbmVkLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlcy5sZW5ndGggPiAwXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXREZWJ1Zy5ob21lU3VidGl0bGUnLCBcIlNlbGVjdCBhIGNoYXQgc2Vzc2lvbiB0byBkZWJ1Z1wiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0RGVidWcubm9TZXNzaW9ucycsIFwiU2VuZCBhIGNoYXQgbWVzc2FnZSB0byBnZXQgc3RhcnRlZFwiKVxuXHRcdCkpO1xuXG5cdFx0aWYgKHNlc3Npb25SZXNvdXJjZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgdmlzaWJsZVNlc3Npb25zID0gc2Vzc2lvblJlc291cmNlcy5zbGljZSgwLCB0aGlzLl92aXNpYmxlQ291bnQpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uTGlzdCA9IERPTS5hcHBlbmQodGhpcy5zY3JvbGxDb250ZW50LCAkKCcuY2hhdC1kZWJ1Zy1ob21lLXNlc3Npb24tbGlzdCcpKTtcblx0XHRcdHNlc3Npb25MaXN0LnNldEF0dHJpYnV0ZSgncm9sZScsICdsaXN0Jyk7XG5cdFx0XHRzZXNzaW9uTGlzdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnY2hhdERlYnVnLnNlc3Npb25MaXN0JywgXCJDaGF0IHNlc3Npb25zXCIpKTtcblxuXHRcdFx0Y29uc3QgaXRlbXM6IEhUTUxCdXR0b25FbGVtZW50W10gPSBbXTtcblxuXHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uUmVzb3VyY2Ugb2YgdmlzaWJsZVNlc3Npb25zKSB7XG5cdFx0XHRcdC8vIFJlc29sdmUgdGl0bGU6IGFnZW50IHNlc3Npb25zIG1vZGVsIChzYW1lIGFzIHNpZGViYXIpIFx1MjE5MiBjaGF0IHNlcnZpY2UgXHUyMTkyIGhpc3RvcmljYWwgZnJvbSBKU09OTCBcdTIxOTIgZmFsbGJhY2tcblx0XHRcdFx0Y29uc3QgYWdlbnRTZXNzaW9uID0gdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5nZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdGNvbnN0IHJhd1RpdGxlID0gYWdlbnRTZXNzaW9uPy5sYWJlbCA/PyB0aGlzLmNoYXRTZXJ2aWNlLmdldFNlc3Npb25UaXRsZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRjb25zdCBpbXBvcnRlZFRpdGxlID0gdGhpcy5jaGF0RGVidWdTZXJ2aWNlLmdldEltcG9ydGVkU2Vzc2lvblRpdGxlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdGNvbnN0IGhpc3RvcmljYWxUaXRsZSA9IHRoaXMuY2hhdERlYnVnU2VydmljZS5nZXRIaXN0b3JpY2FsU2Vzc2lvblRpdGxlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdGxldCBzZXNzaW9uVGl0bGU6IHN0cmluZztcblx0XHRcdFx0aWYgKHJhd1RpdGxlICYmICFpc1VVSUQocmF3VGl0bGUpKSB7XG5cdFx0XHRcdFx0c2Vzc2lvblRpdGxlID0gcmF3VGl0bGU7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaGlzdG9yaWNhbFRpdGxlKSB7XG5cdFx0XHRcdFx0c2Vzc2lvblRpdGxlID0gaGlzdG9yaWNhbFRpdGxlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGltcG9ydGVkVGl0bGUpIHtcblx0XHRcdFx0XHRzZXNzaW9uVGl0bGUgPSBsb2NhbGl6ZSgnY2hhdERlYnVnLmltcG9ydGVkU2Vzc2lvbicsIFwiSW1wb3J0ZWQ6IHswfVwiLCBpbXBvcnRlZFRpdGxlKTtcblx0XHRcdFx0fSBlbHNlIGlmIChMb2NhbENoYXRTZXNzaW9uVXJpLmlzTG9jYWxTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRzZXNzaW9uVGl0bGUgPSBsb2NhbGl6ZSgnY2hhdERlYnVnLm5ld1Nlc3Npb24nLCBcIk5ldyBDaGF0XCIpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpID09PSAnY29waWxvdGNsaScpIHtcblx0XHRcdFx0XHRjb25zdCBwYXRoSWQgPSBzZXNzaW9uUmVzb3VyY2UucGF0aC5yZXBsYWNlKC9eXFwvLywgJycpLnNwbGl0KCctJylbMF07XG5cdFx0XHRcdFx0Y29uc3Qgc2hvcnRJZCA9IHBhdGhJZCB8fCBzZXNzaW9uUmVzb3VyY2UuYXV0aG9yaXR5IHx8IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0XHRcdHNlc3Npb25UaXRsZSA9IGxvY2FsaXplKCdjaGF0RGVidWcuY29waWxvdENsaVNlc3Npb25XaXRoSWQnLCBcIkNvcGlsb3QgQ0xJOiB7MH1cIiwgc2hvcnRJZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c2Vzc2lvblRpdGxlID0gbG9jYWxpemUoJ2NoYXREZWJ1Zy5uZXdTZXNzaW9uJywgXCJOZXcgQ2hhdFwiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBpc0FjdGl2ZSA9IGFjdGl2ZVNlc3Npb25SZXNvdXJjZSAhPT0gdW5kZWZpbmVkICYmIHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpID09PSBhY3RpdmVTZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblxuXHRcdFx0XHRjb25zdCBpdGVtID0gRE9NLmFwcGVuZChzZXNzaW9uTGlzdCwgJDxIVE1MQnV0dG9uRWxlbWVudD4oJ2J1dHRvbi5jaGF0LWRlYnVnLWhvbWUtc2Vzc2lvbi1pdGVtJykpO1xuXHRcdFx0XHRpdGVtLnNldEF0dHJpYnV0ZSgncm9sZScsICdsaXN0aXRlbScpO1xuXHRcdFx0XHRpZiAoaXNBY3RpdmUpIHtcblx0XHRcdFx0XHRpdGVtLmNsYXNzTGlzdC5hZGQoJ2NoYXQtZGVidWctaG9tZS1zZXNzaW9uLWl0ZW0tYWN0aXZlJyk7XG5cdFx0XHRcdFx0aXRlbS5zZXRBdHRyaWJ1dGUoJ2FyaWEtY3VycmVudCcsICd0cnVlJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRET00uYXBwZW5kKGl0ZW0sICQoYHNwYW4ke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKENvZGljb24uY29tbWVudCl9YCkpO1xuXG5cdFx0XHRcdGNvbnN0IHRpdGxlU3BhbiA9IERPTS5hcHBlbmQoaXRlbSwgJCgnc3Bhbi5jaGF0LWRlYnVnLWhvbWUtc2Vzc2lvbi1pdGVtLXRpdGxlJykpO1xuXHRcdFx0XHR0aXRsZVNwYW4udGV4dENvbnRlbnQgPSBzZXNzaW9uVGl0bGU7XG5cdFx0XHRcdGNvbnN0IGFyaWFMYWJlbCA9IGlzQWN0aXZlXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdERlYnVnLnNlc3Npb25JdGVtQWN0aXZlJywgXCJ7MH0gKGFjdGl2ZSlcIiwgc2Vzc2lvblRpdGxlKVxuXHRcdFx0XHRcdDogc2Vzc2lvblRpdGxlO1xuXHRcdFx0XHRpdGVtLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGFyaWFMYWJlbCk7XG5cblx0XHRcdFx0aWYgKGlzQWN0aXZlKSB7XG5cdFx0XHRcdFx0RE9NLmFwcGVuZChpdGVtLCAkKCdzcGFuLmNoYXQtZGVidWctaG9tZS1zZXNzaW9uLWJhZGdlJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnY2hhdERlYnVnLmFjdGl2ZScsIFwiQWN0aXZlXCIpKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGl0ZW0sIERPTS5FdmVudFR5cGUuQ0xJQ0ssICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9sYXN0T3BlbmVkU2Vzc2lvblJlc291cmNlID0gc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0XHRcdHRoaXMuX29uTmF2aWdhdGVUb1Nlc3Npb24uZmlyZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGl0ZW1zLnB1c2goaXRlbSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFwiU2hvdyBNb3JlXCIgYnV0dG9uIHdoZW4gdGhlcmUgYXJlIG1vcmUgc2Vzc2lvbnMgdG8gZGlzcGxheVxuXHRcdFx0aWYgKHNlc3Npb25SZXNvdXJjZXMubGVuZ3RoID4gdGhpcy5fdmlzaWJsZUNvdW50KSB7XG5cdFx0XHRcdGNvbnN0IHJlbWFpbmluZyA9IHNlc3Npb25SZXNvdXJjZXMubGVuZ3RoIC0gdGhpcy5fdmlzaWJsZUNvdW50O1xuXHRcdFx0XHRjb25zdCBzaG93TW9yZUJ1dHRvbiA9IHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24odGhpcy5zY3JvbGxDb250ZW50LCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSB9KSk7XG5cdFx0XHRcdHNob3dNb3JlQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC1kZWJ1Zy1ob21lLXNob3ctbW9yZScpO1xuXHRcdFx0XHRzaG93TW9yZUJ1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCdjaGF0RGVidWcuc2hvd01vcmUnLCBcIlNob3cgTW9yZSAoezB9KVwiLCByZW1haW5pbmcpO1xuXHRcdFx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZChzaG93TW9yZUJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl92aXNpYmxlQ291bnQgKz0gUEFHRV9TSVpFO1xuXHRcdFx0XHRcdHRoaXMucmVuZGVyKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQXJyb3cga2V5IG5hdmlnYXRpb24gYmV0d2VlbiBzZXNzaW9uIGl0ZW1zXG5cdFx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHNlc3Npb25MaXN0LCBET00uRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGZvY3VzZWQgPSBET00uZ2V0QWN0aXZlRWxlbWVudCgpIGFzIEhUTUxFbGVtZW50O1xuXHRcdFx0XHRjb25zdCBpZHggPSBpdGVtcy5pbmRleE9mKGZvY3VzZWQgYXMgSFRNTEJ1dHRvbkVsZW1lbnQpO1xuXHRcdFx0XHRpZiAoaWR4ID09PSAtMSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRsZXQgbmV4dElkeDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRzd2l0Y2ggKGUua2V5KSB7XG5cdFx0XHRcdFx0Y2FzZSAnQXJyb3dEb3duJzpcblx0XHRcdFx0XHRcdG5leHRJZHggPSBpZHggKyAxIDwgaXRlbXMubGVuZ3RoID8gaWR4ICsgMSA6IGlkeDtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ0Fycm93VXAnOlxuXHRcdFx0XHRcdFx0bmV4dElkeCA9IGlkeCAtIDEgPj0gMCA/IGlkeCAtIDEgOiBpZHg7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdIb21lJzpcblx0XHRcdFx0XHRcdG5leHRJZHggPSAwO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnRW5kJzpcblx0XHRcdFx0XHRcdG5leHRJZHggPSBpdGVtcy5sZW5ndGggLSAxO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG5leHRJZHggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRpdGVtc1tuZXh0SWR4XS5mb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7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
