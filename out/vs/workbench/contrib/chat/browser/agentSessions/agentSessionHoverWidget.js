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
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { fromNow, getDurationString } from "../../../../../base/common/date.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { Disposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { localize } from "../../../../../nls.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { SESSION_META_EHCLI_ADOPTABLE_KEY } from "../../../../../platform/agentHost/common/state/sessionState.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { ChatAgentLocation, ChatModeKind } from "../../common/constants.js";
import { ChatViewModel } from "../../common/model/chatViewModel.js";
import { IChatWidgetService } from "../chat.js";
import { ChatListWidget } from "../widget/chatListWidget.js";
import { AgentSessionProviders, getAgentSessionProvider, getAgentSessionProviderIcon, getAgentSessionProviderName } from "./agentSessions.js";
import { IAgentSessionsService } from "./agentSessionsService.js";
import { AgentSessionStatus, getAgentChangesSummary, hasValidDiff } from "./agentSessionsModel.js";
import "./media/agentSessionHoverWidget.css";
const HEADER_HEIGHT = 60;
const CHAT_LIST_HEIGHT = 240;
const CHAT_HOVER_WIDTH = 500;
let AgentSessionHoverWidget = class extends Disposable {
  constructor(session, chatService, instantiationService, chatWidgetService, agentSessionsService) {
    super();
    this.session = session;
    this.chatService = chatService;
    this.instantiationService = instantiationService;
    this.chatWidgetService = chatWidgetService;
    this.agentSessionsService = agentSessionsService;
    this.domNode = dom.$(".agent-session-hover.interactive-session");
    this.domNode.style.width = `${CHAT_HOVER_WIDTH}px`;
    this.domNode.style.height = `${HEADER_HEIGHT + CHAT_LIST_HEIGHT}px`;
    this.domNode.style.overflow = "hidden";
    this.cts = new CancellationTokenSource();
    this._register(toDisposable(() => this.cts.cancel()));
    this.buildHeader();
    this.contentElement = dom.append(this.domNode, dom.$(".agent-session-hover-content"));
    this.loadingElement = dom.append(this.contentElement, dom.$(".agent-session-hover-loading"));
    dom.append(this.loadingElement, renderIcon(ThemeIcon.modify(Codicon.loading, "spin")));
    this.renderScheduler = this._register(new RunOnceScheduler(() => this.render(), 200));
  }
  onRendered() {
    this.modelRef ??= this.loadModel();
    if (this.listWidget) {
      this.listWidget.layout(CHAT_LIST_HEIGHT, CHAT_HOVER_WIDTH);
      this.listWidget.refresh();
      return;
    }
    this.renderScheduler.schedule();
  }
  onHidden() {
    this.renderScheduler.cancel();
  }
  async loadModel() {
    if (this.session.metadata?.[SESSION_META_EHCLI_ADOPTABLE_KEY] === true) {
      this.loadingElement.remove();
      const tooltip = this.buildFallbackTooltip(this.session);
      this.domNode.textContent = typeof tooltip === "string" ? tooltip : tooltip.value;
      return;
    }
    const modelRef = await this.chatService.acquireOrLoadSession(this.session.resource, ChatAgentLocation.Chat, this.cts.token, "AgentSessionHoverWidget#loadModel");
    if (this._store.isDisposed) {
      modelRef?.dispose();
      return;
    }
    if (!modelRef) {
      this.loadingElement.remove();
      const tooltip = this.buildFallbackTooltip(this.session);
      this.domNode.textContent = typeof tooltip === "string" ? tooltip : tooltip.value;
      return;
    }
    this._register(modelRef);
    return modelRef.object;
  }
  async render() {
    this.modelRef ??= this.loadModel();
    const model = await this.modelRef;
    if (!model || this._store.isDisposed || !this.domNode.isConnected) {
      return;
    }
    if (this.listWidget) {
      this.listWidget.layout(CHAT_LIST_HEIGHT, CHAT_HOVER_WIDTH);
      this.listWidget.refresh();
      return;
    }
    this.loadingElement.remove();
    const viewModel = this._register(this.instantiationService.createInstance(
      ChatViewModel,
      model,
      { maxVisibleItems: 2 }
    ));
    const container = dom.append(this.contentElement, dom.$(".interactive-list"));
    const listWidget = this._register(this.instantiationService.createInstance(
      ChatListWidget,
      container,
      {
        rendererOptions: {
          renderStyle: "compact",
          noHeader: true,
          editable: false
        },
        currentChatMode: () => ChatModeKind.Ask
      }
    ));
    this.listWidget = listWidget;
    listWidget.layout(CHAT_LIST_HEIGHT, CHAT_HOVER_WIDTH);
    listWidget.setScrollLock(true);
    listWidget.setViewModel(viewModel);
    listWidget.refresh();
    const viewModelScheduler = this._register(new RunOnceScheduler(() => {
      if (this.domNode.isConnected) {
        listWidget.refresh();
      }
    }, 500));
    this._register(viewModel.onDidChange(() => {
      if (this.domNode.isConnected && !viewModelScheduler.isScheduled()) {
        viewModelScheduler.schedule();
      }
    }));
    this._register(listWidget.onDidClickFollowup(async (followup) => {
      const widget = await this.chatWidgetService.openSession(model.sessionResource);
      if (widget) {
        widget.acceptInput(followup.message);
      }
    }));
  }
  buildHeader() {
    const session = this.session;
    const header = dom.append(this.domNode, dom.$(".agent-session-hover-header"));
    const titleRow = dom.append(header, dom.$(".agent-session-hover-title"));
    dom.append(titleRow, dom.$("span", void 0, session.label));
    const detailsRow = dom.append(header, dom.$(".agent-session-hover-details"));
    const providerType = getAgentSessionProvider(session.providerType);
    const provider = providerType ?? AgentSessionProviders.Local;
    const providerIcon = getAgentSessionProviderIcon(provider);
    dom.append(detailsRow, renderIcon(providerIcon));
    dom.append(detailsRow, dom.$("span", void 0, getAgentSessionProviderName(provider)));
    dom.append(detailsRow, dom.$("span.separator", void 0, "\u2022"));
    if (session.timing.lastRequestEnded && session.timing.lastRequestStarted) {
      const duration = this.toDuration(session.timing.lastRequestStarted, session.timing.lastRequestEnded, true);
      if (duration) {
        dom.append(detailsRow, dom.$("span", void 0, duration));
      }
    } else {
      const startTime = session.timing.lastRequestStarted ?? session.timing.created;
      dom.append(detailsRow, dom.$("span", void 0, fromNow(startTime, true, true)));
    }
    const diffSeparator = dom.append(detailsRow, dom.$("span.separator", void 0, "\u2022"));
    const diffContainer = dom.append(detailsRow, dom.$(".agent-session-hover-diff"));
    diffSeparator.style.display = "none";
    diffContainer.style.display = "none";
    const observed = this.agentSessionsService.model.observeSession(session.resource);
    this._register(autorun((reader) => {
      const latest = observed.read(reader) ?? session;
      const diff = getAgentChangesSummary(latest.changes);
      dom.clearNode(diffContainer);
      if (diff && hasValidDiff(latest.changes)) {
        diffSeparator.style.display = "";
        diffContainer.style.display = "";
        if (diff.files > 0) {
          dom.append(diffContainer, dom.$("span", void 0, diff.files === 1 ? localize("tooltip.file", "1 file") : localize("tooltip.files", "{0} files", diff.files)));
        }
        if (diff.insertions > 0) {
          dom.append(diffContainer, dom.$("span.insertions", void 0, `+${diff.insertions}`));
        }
        if (diff.deletions > 0) {
          dom.append(diffContainer, dom.$("span.deletions", void 0, `-${diff.deletions}`));
        }
      } else {
        diffSeparator.style.display = "none";
        diffContainer.style.display = "none";
      }
    }));
    if (session.status !== AgentSessionStatus.Completed) {
      dom.append(detailsRow, dom.$("span.separator", void 0, "\u2022"));
      dom.append(detailsRow, dom.$("span", void 0, this.toStatusLabel(session.status)));
    }
    if (session.isArchived()) {
      dom.append(detailsRow, dom.$("span.separator", void 0, "\u2022"));
      dom.append(detailsRow, renderIcon(Codicon.archive));
      dom.append(detailsRow, dom.$("span", void 0, localize("tooltip.archived", "Archived")));
    }
  }
  buildFallbackTooltip(session) {
    const lines = [];
    lines.push(`**${session.label}**`);
    if (session.tooltip) {
      const tooltip = typeof session.tooltip === "string" ? session.tooltip : session.tooltip.value;
      lines.push(tooltip);
    } else {
      if (session.description) {
        const description = typeof session.description === "string" ? session.description : session.description.value;
        lines.push(description);
      }
      if (session.badge) {
        const badge = typeof session.badge === "string" ? session.badge : session.badge.value;
        lines.push(badge);
      }
    }
    const details = [];
    const providerType = getAgentSessionProvider(session.providerType);
    const provider = providerType ?? AgentSessionProviders.Local;
    const providerIcon = getAgentSessionProviderIcon(provider);
    const providerName = getAgentSessionProviderName(provider);
    let timeLabel;
    if (session.timing.lastRequestEnded && session.timing.lastRequestStarted) {
      const duration = this.toDuration(session.timing.lastRequestStarted, session.timing.lastRequestEnded, true);
      timeLabel = duration ?? fromNow(session.timing.lastRequestStarted, true, true);
    } else {
      const startTime = session.timing.lastRequestStarted ?? session.timing.created;
      timeLabel = fromNow(startTime, true, true);
    }
    details.push(`$(${providerIcon.id}) ${providerName} \u2022 ${timeLabel}`);
    const diff = getAgentChangesSummary(session.changes);
    if (diff && hasValidDiff(session.changes)) {
      const diffParts = [];
      if (diff.files > 0) {
        diffParts.push(diff.files === 1 ? localize("tooltip.file", "1 file") : localize("tooltip.files", "{0} files", diff.files));
      }
      if (diff.insertions > 0) {
        diffParts.push(`+${diff.insertions}`);
      }
      if (diff.deletions > 0) {
        diffParts.push(`-${diff.deletions}`);
      }
      if (diffParts.length > 0) {
        details.push(diffParts.join(" "));
      }
    }
    if (session.status !== AgentSessionStatus.Completed) {
      details.push(this.toStatusLabel(session.status));
    }
    lines.push(details.join(" \u2022 "));
    if (session.isArchived()) {
      lines.push(`$(archive) ${localize("tooltip.archived", "Archived")}`);
    }
    return new MarkdownString(lines.join("\n\n"), { supportThemeIcons: true });
  }
  toDuration(startTime, endTime, useFullTimeWords) {
    const elapsed = Math.round((endTime - startTime) / 1e3) * 1e3;
    if (elapsed < 1e3) {
      return void 0;
    }
    return getDurationString(elapsed, useFullTimeWords);
  }
  toStatusLabel(status) {
    let statusLabel;
    switch (status) {
      case AgentSessionStatus.NeedsInput:
        statusLabel = localize("agentSessionNeedsInput", "Needs Input");
        break;
      case AgentSessionStatus.InProgress:
        statusLabel = localize("agentSessionInProgress", "In Progress");
        break;
      case AgentSessionStatus.Failed:
        statusLabel = localize("agentSessionFailed", "Failed");
        break;
      default:
        statusLabel = localize("agentSessionCompleted", "Completed");
    }
    return statusLabel;
  }
};
AgentSessionHoverWidget = __decorateClass([
  __decorateParam(1, IChatService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IChatWidgetService),
  __decorateParam(4, IAgentSessionsService)
], AgentSessionHoverWidget);
export {
  AgentSessionHoverWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50U2Vzc2lvbkhvdmVyV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGZyb21Ob3csIGdldER1cmF0aW9uU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGF0ZS5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcsIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNFU1NJT05fTUVUQV9FSENMSV9BRE9QVEFCTEVfS0VZIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElDaGF0TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IENoYXRWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi9jaGF0LmpzJztcbmltcG9ydCB7IENoYXRMaXN0V2lkZ2V0IH0gZnJvbSAnLi4vd2lkZ2V0L2NoYXRMaXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvblByb3ZpZGVycywgZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXIsIGdldEFnZW50U2Vzc2lvblByb3ZpZGVySWNvbiwgZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJOYW1lIH0gZnJvbSAnLi9hZ2VudFNlc3Npb25zLmpzJztcbmltcG9ydCB7IElBZ2VudFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4vYWdlbnRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uU3RhdHVzLCBnZXRBZ2VudENoYW5nZXNTdW1tYXJ5LCBoYXNWYWxpZERpZmYsIElBZ2VudFNlc3Npb24gfSBmcm9tICcuL2FnZW50U2Vzc2lvbnNNb2RlbC5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvYWdlbnRTZXNzaW9uSG92ZXJXaWRnZXQuY3NzJztcblxuY29uc3QgSEVBREVSX0hFSUdIVCA9IDYwO1xuY29uc3QgQ0hBVF9MSVNUX0hFSUdIVCA9IDI0MDtcbmNvbnN0IENIQVRfSE9WRVJfV0lEVEggPSA1MDA7XG5cbmV4cG9ydCBjbGFzcyBBZ2VudFNlc3Npb25Ib3ZlcldpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIG1vZGVsUmVmPzogUHJvbWlzZTxJQ2hhdE1vZGVsIHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSBsaXN0V2lkZ2V0PzogQ2hhdExpc3RXaWRnZXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29udGVudEVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGxvYWRpbmdFbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSByZW5kZXJTY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgY3RzOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgc2Vzc2lvbjogSUFnZW50U2Vzc2lvbixcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASUFnZW50U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnRTZXNzaW9uc1NlcnZpY2U6IElBZ2VudFNlc3Npb25zU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZG9tTm9kZSA9IGRvbS4kKCcuYWdlbnQtc2Vzc2lvbi1ob3Zlci5pbnRlcmFjdGl2ZS1zZXNzaW9uJyk7XG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLndpZHRoID0gYCR7Q0hBVF9IT1ZFUl9XSURUSH1weGA7XG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmhlaWdodCA9IGAke0hFQURFUl9IRUlHSFQgKyBDSEFUX0xJU1RfSEVJR0hUfXB4YDtcblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUub3ZlcmZsb3cgPSAnaGlkZGVuJztcblxuXHRcdHRoaXMuY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuY3RzLmNhbmNlbCgpKSk7XG5cblx0XHQvLyBCdWlsZCBoZWFkZXIgaW1tZWRpYXRlbHlcblx0XHR0aGlzLmJ1aWxkSGVhZGVyKCk7XG5cblx0XHQvLyBDcmVhdGUgY29udGVudCBjb250YWluZXIgd2l0aCBsb2FkaW5nIHN0YXRlXG5cdFx0dGhpcy5jb250ZW50RWxlbWVudCA9IGRvbS5hcHBlbmQodGhpcy5kb21Ob2RlLCBkb20uJCgnLmFnZW50LXNlc3Npb24taG92ZXItY29udGVudCcpKTtcblx0XHR0aGlzLmxvYWRpbmdFbGVtZW50ID0gZG9tLmFwcGVuZCh0aGlzLmNvbnRlbnRFbGVtZW50LCBkb20uJCgnLmFnZW50LXNlc3Npb24taG92ZXItbG9hZGluZycpKTtcblx0XHRkb20uYXBwZW5kKHRoaXMubG9hZGluZ0VsZW1lbnQsIHJlbmRlckljb24oVGhlbWVJY29uLm1vZGlmeShDb2RpY29uLmxvYWRpbmcsICdzcGluJykpKTtcblxuXHRcdC8vIERlbGF5IHJlbmRlcmluZyBieSAyMDBtcyB0byBhdm9pZCBleHBlbnNpdmUgcmVuZGVyaW5nIGZvciBicmllZiBob3ZlcnNcblx0XHR0aGlzLnJlbmRlclNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMucmVuZGVyKCksIDIwMCkpO1xuXHR9XG5cblx0b25SZW5kZXJlZCgpIHtcblx0XHR0aGlzLm1vZGVsUmVmID8/PSB0aGlzLmxvYWRNb2RlbCgpO1xuXG5cdFx0aWYgKHRoaXMubGlzdFdpZGdldCkge1xuXHRcdFx0dGhpcy5saXN0V2lkZ2V0LmxheW91dChDSEFUX0xJU1RfSEVJR0hULCBDSEFUX0hPVkVSX1dJRFRIKTtcblx0XHRcdHRoaXMubGlzdFdpZGdldC5yZWZyZXNoKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW5kZXJTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0fVxuXG5cdG9uSGlkZGVuKCkge1xuXHRcdHRoaXMucmVuZGVyU2NoZWR1bGVyLmNhbmNlbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBsb2FkTW9kZWwoKSB7XG5cdFx0Ly8gQSBzdXJmYWNlZC1idXQtdW4tYWRvcHRlZCBsZWdhY3kgQ29waWxvdCBDTEkgc2Vzc2lvbiBtdXN0IE5PVCBiZSBsb2FkZWQgaGVyZTpcblx0XHQvLyBsb2FkaW5nIGl0cyBtb2RlbCBzdWJzY3JpYmVzL3Jlc3RvcmVzIGl0IG9uIHRoZSBhZ2VudCBob3N0LCB3aGljaCBhZG9wdHNcblx0XHQvLyAobWlncmF0ZXMpIGl0LiBNaWdyYXRpb24gbXVzdCBoYXBwZW4gb25seSBvbiBleHBsaWNpdCBvcGVuLCBzbyByZW5kZXIgdGhlXG5cdFx0Ly8gZmFsbGJhY2sgdG9vbHRpcCBmcm9tIHRoZSBzdW1tYXJ5IGluc3RlYWQgb2YgbG9hZGluZyB0aGUgbW9kZWwuXG5cdFx0aWYgKHRoaXMuc2Vzc2lvbi5tZXRhZGF0YT8uW1NFU1NJT05fTUVUQV9FSENMSV9BRE9QVEFCTEVfS0VZXSA9PT0gdHJ1ZSkge1xuXHRcdFx0dGhpcy5sb2FkaW5nRWxlbWVudC5yZW1vdmUoKTtcblx0XHRcdGNvbnN0IHRvb2x0aXAgPSB0aGlzLmJ1aWxkRmFsbGJhY2tUb29sdGlwKHRoaXMuc2Vzc2lvbik7XG5cdFx0XHR0aGlzLmRvbU5vZGUudGV4dENvbnRlbnQgPSB0eXBlb2YgdG9vbHRpcCA9PT0gJ3N0cmluZycgPyB0b29sdGlwIDogdG9vbHRpcC52YWx1ZTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWxSZWYgPSBhd2FpdCB0aGlzLmNoYXRTZXJ2aWNlLmFjcXVpcmVPckxvYWRTZXNzaW9uKHRoaXMuc2Vzc2lvbi5yZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgdGhpcy5jdHMudG9rZW4sICdBZ2VudFNlc3Npb25Ib3ZlcldpZGdldCNsb2FkTW9kZWwnKTtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0bW9kZWxSZWY/LmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIW1vZGVsUmVmKSB7XG5cdFx0XHQvLyBTaG93IGZhbGxiYWNrIHRvb2x0aXAgdGV4dFxuXHRcdFx0dGhpcy5sb2FkaW5nRWxlbWVudC5yZW1vdmUoKTtcblx0XHRcdGNvbnN0IHRvb2x0aXAgPSB0aGlzLmJ1aWxkRmFsbGJhY2tUb29sdGlwKHRoaXMuc2Vzc2lvbik7XG5cdFx0XHR0aGlzLmRvbU5vZGUudGV4dENvbnRlbnQgPSB0eXBlb2YgdG9vbHRpcCA9PT0gJ3N0cmluZycgPyB0b29sdGlwIDogdG9vbHRpcC52YWx1ZTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihtb2RlbFJlZik7XG5cdFx0cmV0dXJuIG1vZGVsUmVmLm9iamVjdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVuZGVyKCkge1xuXHRcdHRoaXMubW9kZWxSZWYgPz89IHRoaXMubG9hZE1vZGVsKCk7XG5cdFx0Y29uc3QgbW9kZWwgPSBhd2FpdCB0aGlzLm1vZGVsUmVmO1xuXHRcdGlmICghbW9kZWwgfHwgdGhpcy5fc3RvcmUuaXNEaXNwb3NlZCB8fCAhdGhpcy5kb21Ob2RlLmlzQ29ubmVjdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMubGlzdFdpZGdldCkge1xuXHRcdFx0dGhpcy5saXN0V2lkZ2V0LmxheW91dChDSEFUX0xJU1RfSEVJR0hULCBDSEFUX0hPVkVSX1dJRFRIKTtcblx0XHRcdHRoaXMubGlzdFdpZGdldC5yZWZyZXNoKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIGxvYWRpbmcgc3RhdGVcblx0XHR0aGlzLmxvYWRpbmdFbGVtZW50LnJlbW92ZSgpO1xuXG5cdFx0Ly8gQ3JlYXRlIHZpZXcgbW9kZWwgLSBvbmx5IHNob3cgbGFzdCByZXF1ZXN0K3Jlc3BvbnNlIHBhaXJcblx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdFZpZXdNb2RlbCxcblx0XHRcdG1vZGVsLFxuXHRcdFx0eyBtYXhWaXNpYmxlSXRlbXM6IDIgfVxuXHRcdCkpO1xuXG5cdFx0Ly8gQ3JlYXRlIHRoZSBjaGF0IGxpc3Qgd2lkZ2V0XG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9tLmFwcGVuZCh0aGlzLmNvbnRlbnRFbGVtZW50LCBkb20uJCgnLmludGVyYWN0aXZlLWxpc3QnKSk7XG5cdFx0Y29uc3QgbGlzdFdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0TGlzdFdpZGdldCxcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdHtcblx0XHRcdFx0cmVuZGVyZXJPcHRpb25zOiB7XG5cdFx0XHRcdFx0cmVuZGVyU3R5bGU6ICdjb21wYWN0Jyxcblx0XHRcdFx0XHRub0hlYWRlcjogdHJ1ZSxcblx0XHRcdFx0XHRlZGl0YWJsZTogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGN1cnJlbnRDaGF0TW9kZTogKCkgPT4gQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdH1cblx0XHQpKTtcblx0XHR0aGlzLmxpc3RXaWRnZXQgPSBsaXN0V2lkZ2V0O1xuXHRcdGxpc3RXaWRnZXQubGF5b3V0KENIQVRfTElTVF9IRUlHSFQsIENIQVRfSE9WRVJfV0lEVEgpO1xuXHRcdGxpc3RXaWRnZXQuc2V0U2Nyb2xsTG9jayh0cnVlKTtcblx0XHRsaXN0V2lkZ2V0LnNldFZpZXdNb2RlbCh2aWV3TW9kZWwpO1xuXHRcdGxpc3RXaWRnZXQucmVmcmVzaCgpO1xuXG5cdFx0Y29uc3Qgdmlld01vZGVsU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuZG9tTm9kZS5pc0Nvbm5lY3RlZCkge1xuXHRcdFx0XHRsaXN0V2lkZ2V0LnJlZnJlc2goKTtcblx0XHRcdH1cblx0XHR9LCA1MDApKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih2aWV3TW9kZWwub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuZG9tTm9kZS5pc0Nvbm5lY3RlZCAmJiAhdmlld01vZGVsU2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0dmlld01vZGVsU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSGFuZGxlIGZvbGxvd3VwIGNsaWNrcyAtIG9wZW4gdGhlIHNlc3Npb24gYW5kIGFjY2VwdCBpbnB1dFxuXHRcdHRoaXMuX3JlZ2lzdGVyKGxpc3RXaWRnZXQub25EaWRDbGlja0ZvbGxvd3VwKGFzeW5jIChmb2xsb3d1cCkgPT4ge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0gYXdhaXQgdGhpcy5jaGF0V2lkZ2V0U2VydmljZS5vcGVuU2Vzc2lvbihtb2RlbC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKHdpZGdldCkge1xuXHRcdFx0XHR3aWRnZXQuYWNjZXB0SW5wdXQoZm9sbG93dXAubWVzc2FnZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBidWlsZEhlYWRlcigpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5zZXNzaW9uO1xuXHRcdGNvbnN0IGhlYWRlciA9IGRvbS5hcHBlbmQodGhpcy5kb21Ob2RlLCBkb20uJCgnLmFnZW50LXNlc3Npb24taG92ZXItaGVhZGVyJykpO1xuXG5cdFx0Ly8gVGl0bGUgcm93XG5cdFx0Y29uc3QgdGl0bGVSb3cgPSBkb20uYXBwZW5kKGhlYWRlciwgZG9tLiQoJy5hZ2VudC1zZXNzaW9uLWhvdmVyLXRpdGxlJykpO1xuXHRcdGRvbS5hcHBlbmQodGl0bGVSb3csIGRvbS4kKCdzcGFuJywgdW5kZWZpbmVkLCBzZXNzaW9uLmxhYmVsKSk7XG5cblx0XHQvLyBEZXRhaWxzIHJvdzogUHJvdmlkZXIgaWNvbiArIER1cmF0aW9uL1RpbWUgXHUyMDIyIERpZmYgXHUyMDIyIFN0YXR1cyAoaWYgbm90IGNvbXBsZXRlZClcblx0XHRjb25zdCBkZXRhaWxzUm93ID0gZG9tLmFwcGVuZChoZWFkZXIsIGRvbS4kKCcuYWdlbnQtc2Vzc2lvbi1ob3Zlci1kZXRhaWxzJykpO1xuXG5cdFx0Ly8gUHJvdmlkZXIgaWNvbiArIG5hbWUgKyBEdXJhdGlvbiBvciBzdGFydCB0aW1lXG5cdFx0Y29uc3QgcHJvdmlkZXJUeXBlID0gZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXIoc2Vzc2lvbi5wcm92aWRlclR5cGUpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gcHJvdmlkZXJUeXBlID8/IEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbDtcblx0XHRjb25zdCBwcm92aWRlckljb24gPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlckljb24ocHJvdmlkZXIpO1xuXHRcdGRvbS5hcHBlbmQoZGV0YWlsc1JvdywgcmVuZGVySWNvbihwcm92aWRlckljb24pKTtcblx0XHRkb20uYXBwZW5kKGRldGFpbHNSb3csIGRvbS4kKCdzcGFuJywgdW5kZWZpbmVkLCBnZXRBZ2VudFNlc3Npb25Qcm92aWRlck5hbWUocHJvdmlkZXIpKSk7XG5cdFx0ZG9tLmFwcGVuZChkZXRhaWxzUm93LCBkb20uJCgnc3Bhbi5zZXBhcmF0b3InLCB1bmRlZmluZWQsICdcdTIwMjInKSk7XG5cblx0XHRpZiAoc2Vzc2lvbi50aW1pbmcubGFzdFJlcXVlc3RFbmRlZCAmJiBzZXNzaW9uLnRpbWluZy5sYXN0UmVxdWVzdFN0YXJ0ZWQpIHtcblx0XHRcdGNvbnN0IGR1cmF0aW9uID0gdGhpcy50b0R1cmF0aW9uKHNlc3Npb24udGltaW5nLmxhc3RSZXF1ZXN0U3RhcnRlZCwgc2Vzc2lvbi50aW1pbmcubGFzdFJlcXVlc3RFbmRlZCwgdHJ1ZSk7XG5cdFx0XHRpZiAoZHVyYXRpb24pIHtcblx0XHRcdFx0ZG9tLmFwcGVuZChkZXRhaWxzUm93LCBkb20uJCgnc3BhbicsIHVuZGVmaW5lZCwgZHVyYXRpb24pKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgc3RhcnRUaW1lID0gc2Vzc2lvbi50aW1pbmcubGFzdFJlcXVlc3RTdGFydGVkID8/IHNlc3Npb24udGltaW5nLmNyZWF0ZWQ7XG5cdFx0XHRkb20uYXBwZW5kKGRldGFpbHNSb3csIGRvbS4kKCdzcGFuJywgdW5kZWZpbmVkLCBmcm9tTm93KHN0YXJ0VGltZSwgdHJ1ZSwgdHJ1ZSkpKTtcblx0XHR9XG5cblx0XHQvLyBEaWZmIGluZm9ybWF0aW9uIC0gcmVuZGVyZWQgcmVhY3RpdmVseSBiZWNhdXNlIGBjaGFuZ2VzYCBtYXkgYmUgbGF6aWx5XG5cdFx0Ly8gcmVzb2x2ZWQgYnkgdGhlIHByb3ZpZGVyIChzZWUgSUFnZW50U2Vzc2lvbnNNb2RlbC5vYnNlcnZlU2Vzc2lvbikuIFdlXG5cdFx0Ly8gcmVzZXJ2ZSBhIHNlcGFyYXRvciArIGNvbnRhaW5lciBzbG90IGhlcmUgYW5kIHVwZGF0ZSB0aGVtIHdoZW5ldmVyIHRoZVxuXHRcdC8vIG9ic2VydmVkIHNlc3Npb24gZW1pdHMgYSBmcmVzaCB2YWx1ZS5cblx0XHRjb25zdCBkaWZmU2VwYXJhdG9yID0gZG9tLmFwcGVuZChkZXRhaWxzUm93LCBkb20uJCgnc3Bhbi5zZXBhcmF0b3InLCB1bmRlZmluZWQsICdcdTIwMjInKSk7XG5cdFx0Y29uc3QgZGlmZkNvbnRhaW5lciA9IGRvbS5hcHBlbmQoZGV0YWlsc1JvdywgZG9tLiQoJy5hZ2VudC1zZXNzaW9uLWhvdmVyLWRpZmYnKSk7XG5cdFx0ZGlmZlNlcGFyYXRvci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdGRpZmZDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuXHRcdGNvbnN0IG9ic2VydmVkID0gdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5vYnNlcnZlU2Vzc2lvbihzZXNzaW9uLnJlc291cmNlKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBsYXRlc3QgPSBvYnNlcnZlZC5yZWFkKHJlYWRlcikgPz8gc2Vzc2lvbjtcblx0XHRcdGNvbnN0IGRpZmYgPSBnZXRBZ2VudENoYW5nZXNTdW1tYXJ5KGxhdGVzdC5jaGFuZ2VzKTtcblx0XHRcdGRvbS5jbGVhck5vZGUoZGlmZkNvbnRhaW5lcik7XG5cdFx0XHRpZiAoZGlmZiAmJiBoYXNWYWxpZERpZmYobGF0ZXN0LmNoYW5nZXMpKSB7XG5cdFx0XHRcdGRpZmZTZXBhcmF0b3Iuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0XHRkaWZmQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdFx0aWYgKGRpZmYuZmlsZXMgPiAwKSB7XG5cdFx0XHRcdFx0ZG9tLmFwcGVuZChkaWZmQ29udGFpbmVyLCBkb20uJCgnc3BhbicsIHVuZGVmaW5lZCwgZGlmZi5maWxlcyA9PT0gMSA/IGxvY2FsaXplKCd0b29sdGlwLmZpbGUnLCBcIjEgZmlsZVwiKSA6IGxvY2FsaXplKCd0b29sdGlwLmZpbGVzJywgXCJ7MH0gZmlsZXNcIiwgZGlmZi5maWxlcykpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZGlmZi5pbnNlcnRpb25zID4gMCkge1xuXHRcdFx0XHRcdGRvbS5hcHBlbmQoZGlmZkNvbnRhaW5lciwgZG9tLiQoJ3NwYW4uaW5zZXJ0aW9ucycsIHVuZGVmaW5lZCwgYCske2RpZmYuaW5zZXJ0aW9uc31gKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGRpZmYuZGVsZXRpb25zID4gMCkge1xuXHRcdFx0XHRcdGRvbS5hcHBlbmQoZGlmZkNvbnRhaW5lciwgZG9tLiQoJ3NwYW4uZGVsZXRpb25zJywgdW5kZWZpbmVkLCBgLSR7ZGlmZi5kZWxldGlvbnN9YCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkaWZmU2VwYXJhdG9yLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdGRpZmZDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBTdGF0dXMgKG9ubHkgc2hvdyBpZiBub3QgY29tcGxldGVkKVxuXHRcdGlmIChzZXNzaW9uLnN0YXR1cyAhPT0gQWdlbnRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCkge1xuXHRcdFx0ZG9tLmFwcGVuZChkZXRhaWxzUm93LCBkb20uJCgnc3Bhbi5zZXBhcmF0b3InLCB1bmRlZmluZWQsICdcdTIwMjInKSk7XG5cdFx0XHRkb20uYXBwZW5kKGRldGFpbHNSb3csIGRvbS4kKCdzcGFuJywgdW5kZWZpbmVkLCB0aGlzLnRvU3RhdHVzTGFiZWwoc2Vzc2lvbi5zdGF0dXMpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gQXJjaGl2ZWQgaW5kaWNhdG9yXG5cdFx0aWYgKHNlc3Npb24uaXNBcmNoaXZlZCgpKSB7XG5cdFx0XHRkb20uYXBwZW5kKGRldGFpbHNSb3csIGRvbS4kKCdzcGFuLnNlcGFyYXRvcicsIHVuZGVmaW5lZCwgJ1x1MjAyMicpKTtcblx0XHRcdGRvbS5hcHBlbmQoZGV0YWlsc1JvdywgcmVuZGVySWNvbihDb2RpY29uLmFyY2hpdmUpKTtcblx0XHRcdGRvbS5hcHBlbmQoZGV0YWlsc1JvdywgZG9tLiQoJ3NwYW4nLCB1bmRlZmluZWQsIGxvY2FsaXplKCd0b29sdGlwLmFyY2hpdmVkJywgXCJBcmNoaXZlZFwiKSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYnVpbGRGYWxsYmFja1Rvb2x0aXAoc2Vzc2lvbjogSUFnZW50U2Vzc2lvbik6IElNYXJrZG93blN0cmluZyB7XG5cdFx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cblx0XHQvLyBUaXRsZVxuXHRcdGxpbmVzLnB1c2goYCoqJHtzZXNzaW9uLmxhYmVsfSoqYCk7XG5cblx0XHQvLyBUb29sdGlwIChmcm9tIHByb3ZpZGVyKVxuXHRcdGlmIChzZXNzaW9uLnRvb2x0aXApIHtcblx0XHRcdGNvbnN0IHRvb2x0aXAgPSB0eXBlb2Ygc2Vzc2lvbi50b29sdGlwID09PSAnc3RyaW5nJyA/IHNlc3Npb24udG9vbHRpcCA6IHNlc3Npb24udG9vbHRpcC52YWx1ZTtcblx0XHRcdGxpbmVzLnB1c2godG9vbHRpcCk7XG5cdFx0fSBlbHNlIHtcblxuXHRcdFx0Ly8gRGVzY3JpcHRpb25cblx0XHRcdGlmIChzZXNzaW9uLmRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gdHlwZW9mIHNlc3Npb24uZGVzY3JpcHRpb24gPT09ICdzdHJpbmcnID8gc2Vzc2lvbi5kZXNjcmlwdGlvbiA6IHNlc3Npb24uZGVzY3JpcHRpb24udmFsdWU7XG5cdFx0XHRcdGxpbmVzLnB1c2goZGVzY3JpcHRpb24pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBCYWRnZVxuXHRcdFx0aWYgKHNlc3Npb24uYmFkZ2UpIHtcblx0XHRcdFx0Y29uc3QgYmFkZ2UgPSB0eXBlb2Ygc2Vzc2lvbi5iYWRnZSA9PT0gJ3N0cmluZycgPyBzZXNzaW9uLmJhZGdlIDogc2Vzc2lvbi5iYWRnZS52YWx1ZTtcblx0XHRcdFx0bGluZXMucHVzaChiYWRnZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRGV0YWlscyBsaW5lOiBQcm92aWRlciBpY29uICsgRHVyYXRpb24vVGltZSBcdTIwMjIgRGlmZiBcdTIwMjIgU3RhdHVzIChpZiBub3QgY29tcGxldGVkKVxuXHRcdGNvbnN0IGRldGFpbHM6IHN0cmluZ1tdID0gW107XG5cblx0XHQvLyBQcm92aWRlciBpY29uICsgbmFtZSArIER1cmF0aW9uIG9yIHN0YXJ0IHRpbWVcblx0XHRjb25zdCBwcm92aWRlclR5cGUgPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlcihzZXNzaW9uLnByb3ZpZGVyVHlwZSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBwcm92aWRlclR5cGUgPz8gQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsO1xuXHRcdGNvbnN0IHByb3ZpZGVySWNvbiA9IGdldEFnZW50U2Vzc2lvblByb3ZpZGVySWNvbihwcm92aWRlcik7XG5cdFx0Y29uc3QgcHJvdmlkZXJOYW1lID0gZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJOYW1lKHByb3ZpZGVyKTtcblx0XHRsZXQgdGltZUxhYmVsOiBzdHJpbmc7XG5cdFx0aWYgKHNlc3Npb24udGltaW5nLmxhc3RSZXF1ZXN0RW5kZWQgJiYgc2Vzc2lvbi50aW1pbmcubGFzdFJlcXVlc3RTdGFydGVkKSB7XG5cdFx0XHRjb25zdCBkdXJhdGlvbiA9IHRoaXMudG9EdXJhdGlvbihzZXNzaW9uLnRpbWluZy5sYXN0UmVxdWVzdFN0YXJ0ZWQsIHNlc3Npb24udGltaW5nLmxhc3RSZXF1ZXN0RW5kZWQsIHRydWUpO1xuXHRcdFx0dGltZUxhYmVsID0gZHVyYXRpb24gPz8gZnJvbU5vdyhzZXNzaW9uLnRpbWluZy5sYXN0UmVxdWVzdFN0YXJ0ZWQsIHRydWUsIHRydWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBzdGFydFRpbWUgPSBzZXNzaW9uLnRpbWluZy5sYXN0UmVxdWVzdFN0YXJ0ZWQgPz8gc2Vzc2lvbi50aW1pbmcuY3JlYXRlZDtcblx0XHRcdHRpbWVMYWJlbCA9IGZyb21Ob3coc3RhcnRUaW1lLCB0cnVlLCB0cnVlKTtcblx0XHR9XG5cdFx0ZGV0YWlscy5wdXNoKGAkKCR7cHJvdmlkZXJJY29uLmlkfSkgJHtwcm92aWRlck5hbWV9IFx1MjAyMiAke3RpbWVMYWJlbH1gKTtcblxuXHRcdC8vIERpZmYgaW5mb3JtYXRpb25cblx0XHRjb25zdCBkaWZmID0gZ2V0QWdlbnRDaGFuZ2VzU3VtbWFyeShzZXNzaW9uLmNoYW5nZXMpO1xuXHRcdGlmIChkaWZmICYmIGhhc1ZhbGlkRGlmZihzZXNzaW9uLmNoYW5nZXMpKSB7XG5cdFx0XHRjb25zdCBkaWZmUGFydHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRpZiAoZGlmZi5maWxlcyA+IDApIHtcblx0XHRcdFx0ZGlmZlBhcnRzLnB1c2goZGlmZi5maWxlcyA9PT0gMSA/IGxvY2FsaXplKCd0b29sdGlwLmZpbGUnLCBcIjEgZmlsZVwiKSA6IGxvY2FsaXplKCd0b29sdGlwLmZpbGVzJywgXCJ7MH0gZmlsZXNcIiwgZGlmZi5maWxlcykpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGRpZmYuaW5zZXJ0aW9ucyA+IDApIHtcblx0XHRcdFx0ZGlmZlBhcnRzLnB1c2goYCske2RpZmYuaW5zZXJ0aW9uc31gKTtcblx0XHRcdH1cblx0XHRcdGlmIChkaWZmLmRlbGV0aW9ucyA+IDApIHtcblx0XHRcdFx0ZGlmZlBhcnRzLnB1c2goYC0ke2RpZmYuZGVsZXRpb25zfWApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGRpZmZQYXJ0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGRldGFpbHMucHVzaChkaWZmUGFydHMuam9pbignICcpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTdGF0dXMgKG9ubHkgc2hvdyBpZiBub3QgY29tcGxldGVkKVxuXHRcdGlmIChzZXNzaW9uLnN0YXR1cyAhPT0gQWdlbnRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCkge1xuXHRcdFx0ZGV0YWlscy5wdXNoKHRoaXMudG9TdGF0dXNMYWJlbChzZXNzaW9uLnN0YXR1cykpO1xuXHRcdH1cblxuXHRcdGxpbmVzLnB1c2goZGV0YWlscy5qb2luKCcgXHUyMDIyICcpKTtcblxuXHRcdC8vIEFyY2hpdmVkIHN0YXR1c1xuXHRcdGlmIChzZXNzaW9uLmlzQXJjaGl2ZWQoKSkge1xuXHRcdFx0bGluZXMucHVzaChgJChhcmNoaXZlKSAke2xvY2FsaXplKCd0b29sdGlwLmFyY2hpdmVkJywgXCJBcmNoaXZlZFwiKX1gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKGxpbmVzLmpvaW4oJ1xcblxcbicpLCB7IHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB0b0R1cmF0aW9uKHN0YXJ0VGltZTogbnVtYmVyLCBlbmRUaW1lOiBudW1iZXIsIHVzZUZ1bGxUaW1lV29yZHM6IGJvb2xlYW4pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGVsYXBzZWQgPSBNYXRoLnJvdW5kKChlbmRUaW1lIC0gc3RhcnRUaW1lKSAvIDEwMDApICogMTAwMDtcblx0XHRpZiAoZWxhcHNlZCA8IDEwMDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGdldER1cmF0aW9uU3RyaW5nKGVsYXBzZWQsIHVzZUZ1bGxUaW1lV29yZHMpO1xuXHR9XG5cblx0cHJpdmF0ZSB0b1N0YXR1c0xhYmVsKHN0YXR1czogQWdlbnRTZXNzaW9uU3RhdHVzKTogc3RyaW5nIHtcblx0XHRsZXQgc3RhdHVzTGFiZWw6IHN0cmluZztcblx0XHRzd2l0Y2ggKHN0YXR1cykge1xuXHRcdFx0Y2FzZSBBZ2VudFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dDpcblx0XHRcdFx0c3RhdHVzTGFiZWwgPSBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9uTmVlZHNJbnB1dCcsIFwiTmVlZHMgSW5wdXRcIik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBZ2VudFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzczpcblx0XHRcdFx0c3RhdHVzTGFiZWwgPSBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9uSW5Qcm9ncmVzcycsIFwiSW4gUHJvZ3Jlc3NcIik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBZ2VudFNlc3Npb25TdGF0dXMuRmFpbGVkOlxuXHRcdFx0XHRzdGF0dXNMYWJlbCA9IGxvY2FsaXplKCdhZ2VudFNlc3Npb25GYWlsZWQnLCBcIkZhaWxlZFwiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRzdGF0dXNMYWJlbCA9IGxvY2FsaXplKCdhZ2VudFNlc3Npb25Db21wbGV0ZWQnLCBcIkNvbXBsZXRlZFwiKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3RhdHVzTGFiZWw7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMs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
