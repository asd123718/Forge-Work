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
import { BreadcrumbsWidget } from "../../../../../base/browser/ui/breadcrumbs/breadcrumbsWidget.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { localize } from "../../../../../nls.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { defaultBreadcrumbsWidgetStyles, defaultButtonStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { ChatDebugLogLevel, IChatDebugService } from "../../common/chatDebugService.js";
import { safeIntl } from "../../../../../base/common/date.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { ChatAgentLocation } from "../../common/constants.js";
import { IChatSessionsService, localChatSessionType } from "../../common/chatSessionsService.js";
import { getChatSessionType, LocalChatSessionUri } from "../../common/model/chatUri.js";
import { IChatWidgetService } from "../chat.js";
import { IPreferencesService } from "../../../../services/preferences/common/preferences.js";
import { isAgentHostSession } from "./agentHostLogSources.js";
import { isChatDebugLoggingEnabledForSession, renderChatDebugLoggingDisabledMessage } from "./chatDebugEnablement.js";
import { setupBreadcrumbKeyboardNavigation, TextBreadcrumbItem } from "./chatDebugTypes.js";
const $ = DOM.$;
const numberFormatter = safeIntl.NumberFormat();
const aicFormatter = safeIntl.NumberFormat(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NANO_AIU_PER_AIC = 1e9;
var OverviewNavigation = /* @__PURE__ */ ((OverviewNavigation2) => {
  OverviewNavigation2["Home"] = "home";
  OverviewNavigation2["Logs"] = "logs";
  OverviewNavigation2["FlowChart"] = "flowchart";
  OverviewNavigation2["CacheExplorer"] = "cache";
  OverviewNavigation2["WireLog"] = "wirelog";
  return OverviewNavigation2;
})(OverviewNavigation || {});
let ChatDebugOverviewView = class extends Disposable {
  constructor(parent, chatService, chatDebugService, chatWidgetService, chatSessionsService, configurationService, preferencesService) {
    super();
    this.chatService = chatService;
    this.chatDebugService = chatDebugService;
    this.chatWidgetService = chatWidgetService;
    this.chatSessionsService = chatSessionsService;
    this.configurationService = configurationService;
    this.preferencesService = preferencesService;
    this._onNavigate = this._register(new Emitter());
    this.onNavigate = this._onNavigate.event;
    this.loadDisposables = this._register(new DisposableStore());
    this.isFirstLoad = true;
    this.container = DOM.append(parent, $(".chat-debug-overview"));
    DOM.hide(this.container);
    this.refreshScheduler = this._register(new RunOnceScheduler(() => this.doRefresh(), 100));
    const breadcrumbContainer = DOM.append(this.container, $(".chat-debug-breadcrumb"));
    this.breadcrumbWidget = this._register(new BreadcrumbsWidget(breadcrumbContainer, 3, void 0, Codicon.chevronRight, defaultBreadcrumbsWidgetStyles));
    this._register(setupBreadcrumbKeyboardNavigation(breadcrumbContainer, this.breadcrumbWidget));
    this._register(this.breadcrumbWidget.onDidSelectItem((e) => {
      if (e.type === "select" && e.item instanceof TextBreadcrumbItem) {
        this.breadcrumbWidget.setSelection(void 0);
        const items = this.breadcrumbWidget.getItems();
        const idx = items.indexOf(e.item);
        if (idx === 0) {
          this._onNavigate.fire("home" /* Home */);
        }
      }
    }));
    this.content = DOM.append(this.container, $(".chat-debug-overview-content"));
  }
  setSession(sessionResource) {
    this.currentSessionResource = sessionResource;
    this.isFirstLoad = true;
  }
  show() {
    DOM.show(this.container);
    this.load();
  }
  hide() {
    DOM.hide(this.container);
    this.refreshScheduler.cancel();
  }
  refresh() {
    if (this.container.style.display !== "none") {
      if (!this.refreshScheduler.isScheduled()) {
        this.refreshScheduler.schedule();
      }
    }
  }
  doRefresh() {
    if (this.metricsContainer && this.currentSessionResource) {
      DOM.clearNode(this.metricsContainer);
      const events = this.chatDebugService.getEvents(this.currentSessionResource);
      this.renderMetricsContent(this.metricsContainer, events);
      this.isFirstLoad = false;
    } else {
      this.load();
    }
  }
  updateBreadcrumb() {
    if (!this.currentSessionResource) {
      return;
    }
    const sessionTitle = this.chatService.getSessionTitle(this.currentSessionResource) || LocalChatSessionUri.parseLocalSessionId(this.currentSessionResource) || this.currentSessionResource.toString();
    this.breadcrumbWidget.setItems([
      new TextBreadcrumbItem(localize("chatDebug.title", "Agent Debug Logs"), true),
      new TextBreadcrumbItem(sessionTitle)
    ]);
  }
  load() {
    DOM.clearNode(this.content);
    this.loadDisposables.clear();
    this.updateBreadcrumb();
    if (!this.currentSessionResource) {
      return;
    }
    const sessionTitle = this.chatService.getSessionTitle(this.currentSessionResource) || LocalChatSessionUri.parseLocalSessionId(this.currentSessionResource) || this.currentSessionResource.toString();
    const titleRow = DOM.append(this.content, $(".chat-debug-overview-title-row"));
    const titleEl = DOM.append(titleRow, $("h2.chat-debug-overview-title"));
    DOM.append(titleEl, $(`span${ThemeIcon.asCSSSelector(Codicon.comment)}`));
    titleEl.append(sessionTitle);
    const titleActions = DOM.append(titleRow, $(".chat-debug-overview-title-actions"));
    const revealSessionBtn = this.loadDisposables.add(new Button(titleActions, { ariaLabel: localize("chatDebug.revealChatSession", "Reveal Chat Session"), title: localize("chatDebug.revealChatSession", "Reveal Chat Session") }));
    revealSessionBtn.element.classList.add("chat-debug-icon-button");
    revealSessionBtn.icon = Codicon.goToFile;
    this.loadDisposables.add(revealSessionBtn.onDidClick(() => {
      if (this.currentSessionResource) {
        this.chatWidgetService.openSession(this.currentSessionResource);
      }
    }));
    this.renderSessionDetails(this.currentSessionResource);
    const events = this.chatDebugService.getEvents(this.currentSessionResource);
    this.renderDerivedOverview(events, this.isFirstLoad && events.length === 0);
    this.isFirstLoad = false;
  }
  renderSessionDetails(sessionUri) {
    const model = this.chatService.getSession(sessionUri);
    const details = [];
    const sessionType = getChatSessionType(sessionUri);
    const contribution = this.chatSessionsService.getChatSessionContribution(sessionType);
    const sessionTypeName = contribution?.displayName || (sessionType === localChatSessionType ? localize("chatDebug.sessionType.local", "Local") : sessionType);
    details.push({ label: localize("chatDebug.detail.sessionType", "Session Type"), value: sessionTypeName });
    if (model) {
      const locationLabel = this.getLocationLabel(model.initialLocation);
      details.push({ label: localize("chatDebug.detail.location", "Location"), value: locationLabel });
      const inProgress = model.requestInProgress.get();
      const statusLabel = inProgress ? localize("chatDebug.status.inProgress", "In Progress") : localize("chatDebug.status.idle", "Idle");
      details.push({ label: localize("chatDebug.detail.status", "Status"), value: statusLabel });
      const timing = model.timing;
      details.push({ label: localize("chatDebug.detail.created", "Created"), value: new Date(timing.created).toLocaleString() });
      if (timing.lastRequestEnded) {
        details.push({ label: localize("chatDebug.detail.lastActivity", "Last Activity"), value: new Date(timing.lastRequestEnded).toLocaleString() });
      } else if (timing.lastRequestStarted) {
        details.push({ label: localize("chatDebug.detail.lastActivity", "Last Activity"), value: new Date(timing.lastRequestStarted).toLocaleString() });
      }
    }
    if (details.length > 0) {
      const section = DOM.append(this.content, $(".chat-debug-overview-section"));
      DOM.append(section, $("h3.chat-debug-overview-section-label", void 0, localize("chatDebug.sessionDetails", "Session Details")));
      const detailsGrid = DOM.append(section, $(".chat-debug-overview-details"));
      for (const detail of details) {
        const row = DOM.append(detailsGrid, $(".chat-debug-overview-detail-row"));
        DOM.append(row, $("span.chat-debug-overview-detail-label", void 0, detail.label));
        DOM.append(row, $("span.chat-debug-overview-detail-value", void 0, detail.value));
      }
    }
  }
  getLocationLabel(location) {
    switch (location) {
      case ChatAgentLocation.Chat:
        return localize("chatDebug.location.chat", "Chat Panel");
      case ChatAgentLocation.Terminal:
        return localize("chatDebug.location.terminal", "Terminal");
      case ChatAgentLocation.Notebook:
        return localize("chatDebug.location.notebook", "Notebook");
      case ChatAgentLocation.EditorInline:
        return localize("chatDebug.location.editor", "Editor Inline");
      default:
        return String(location);
    }
  }
  renderDerivedOverview(events, showShimmer) {
    if (!isChatDebugLoggingEnabledForSession(this.configurationService, this.currentSessionResource)) {
      this.metricsContainer = void 0;
      const disabledSection = DOM.append(this.content, $(".chat-debug-overview-section"));
      renderChatDebugLoggingDisabledMessage(disabledSection, this.currentSessionResource, this.preferencesService, this.loadDisposables);
    } else {
      const metricsSection = DOM.append(this.content, $(".chat-debug-overview-section"));
      DOM.append(metricsSection, $("h3.chat-debug-overview-section-label", void 0, localize("chatDebug.summary", "Summary")));
      this.metricsContainer = DOM.append(metricsSection, $(".chat-debug-overview-metrics"));
      if (showShimmer) {
        this.renderMetricsShimmer(this.metricsContainer);
      } else {
        this.renderMetricsContent(this.metricsContainer, events);
      }
    }
    const actionsSection = DOM.append(this.content, $(".chat-debug-overview-section"));
    DOM.append(actionsSection, $("h3.chat-debug-overview-section-label", void 0, localize("chatDebug.exploreTraceData", "Explore Trace Data")));
    const row = DOM.append(actionsSection, $(".chat-debug-overview-actions"));
    const viewLogsBtn = this.loadDisposables.add(new Button(row, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: localize("chatDebug.viewLogs", "View Logs") }));
    viewLogsBtn.element.classList.add("chat-debug-overview-action-button");
    viewLogsBtn.label = `$(list-flat) ${localize("chatDebug.viewLogs", "View Logs")}`;
    this.loadDisposables.add(viewLogsBtn.onDidClick(() => {
      this._onNavigate.fire("logs" /* Logs */);
    }));
    const flowChartBtn = this.loadDisposables.add(new Button(row, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: localize("chatDebug.agentFlowChart", "Agent Flow Chart") }));
    flowChartBtn.element.classList.add("chat-debug-overview-action-button");
    flowChartBtn.label = `$(type-hierarchy) ${localize("chatDebug.agentFlowChart", "Agent Flow Chart")}`;
    this.loadDisposables.add(flowChartBtn.onDidClick(() => {
      this._onNavigate.fire("flowchart" /* FlowChart */);
    }));
    const cacheBtn = this.loadDisposables.add(new Button(row, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: localize("chatDebug.cacheExplorer", "Cache Explorer") }));
    cacheBtn.element.classList.add("chat-debug-overview-action-button");
    cacheBtn.label = `$(database) ${localize("chatDebug.cacheExplorer", "Cache Explorer")}`;
    this.loadDisposables.add(cacheBtn.onDidClick(() => {
      this._onNavigate.fire("cache" /* CacheExplorer */);
    }));
    if (isAgentHostSession(this.currentSessionResource)) {
      const wireLogBtn = this.loadDisposables.add(new Button(row, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: localize("chatDebug.ahpLog", "AHP Log") }));
      wireLogBtn.element.classList.add("chat-debug-overview-action-button");
      wireLogBtn.label = `$(arrow-swap) ${localize("chatDebug.ahpLog", "AHP Log")}`;
      this.loadDisposables.add(wireLogBtn.onDidClick(() => {
        this._onNavigate.fire("wirelog" /* WireLog */);
      }));
    }
  }
  renderMetricsShimmer(container) {
    const placeholderLabels = [
      localize("chatDebug.metric.modelTurns", "Model Turns"),
      localize("chatDebug.metric.toolCalls", "Tool Calls"),
      localize("chatDebug.metric.totalInputTokens", "Total Input Tokens"),
      localize("chatDebug.metric.totalOutputTokens", "Total Output Tokens"),
      localize("chatDebug.metric.totalCachedInputTokens", "Total Cached Input Tokens"),
      localize("chatDebug.metric.totalTokens", "Total Tokens"),
      localize("chatDebug.metric.errors", "Errors")
    ];
    for (const label of placeholderLabels) {
      const card = DOM.append(container, $(".chat-debug-overview-metric-card"));
      DOM.append(card, $("div.chat-debug-overview-metric-label", void 0, label));
      const valueEl = DOM.append(card, $("div.chat-debug-overview-metric-value"));
      const shimmer = DOM.append(valueEl, $("span.chat-debug-overview-metric-shimmer"));
      shimmer.textContent = "\xA0";
    }
  }
  renderMetricsContent(container, events) {
    const modelTurns = events.filter((e) => e.kind === "modelTurn");
    const toolCalls = events.filter((e) => e.kind === "toolCall");
    const errors = events.filter(
      (e) => e.kind === "generic" && e.level === ChatDebugLogLevel.Error || e.kind === "toolCall" && e.result === "error"
    );
    const fmt = numberFormatter.value;
    const totalInputTokens = modelTurns.reduce((sum, e) => sum + (e.inputTokens ?? 0), 0);
    const totalOutputTokens = modelTurns.reduce((sum, e) => sum + (e.outputTokens ?? 0), 0);
    const totalCachedTokens = modelTurns.reduce((sum, e) => sum + (e.cachedTokens ?? 0), 0);
    const totalTokens = modelTurns.reduce((sum, e) => sum + (e.totalTokens ?? 0), 0);
    const totalCopilotUsageNanoAiu = modelTurns.reduce((sum, e) => sum + (e.copilotUsageNanoAiu ?? 0), 0);
    const metrics = [
      { label: localize("chatDebug.metric.modelTurns", "Model Turns"), value: fmt.format(modelTurns.length) },
      { label: localize("chatDebug.metric.toolCalls", "Tool Calls"), value: fmt.format(toolCalls.length) },
      { label: localize("chatDebug.metric.totalInputTokens", "Total Input Tokens"), value: fmt.format(totalInputTokens) },
      { label: localize("chatDebug.metric.totalOutputTokens", "Total Output Tokens"), value: fmt.format(totalOutputTokens) },
      { label: localize("chatDebug.metric.totalCachedInputTokens", "Total Cached Input Tokens"), value: fmt.format(totalCachedTokens) },
      { label: localize("chatDebug.metric.totalTokens", "Total Tokens"), value: fmt.format(totalTokens) },
      { label: localize("chatDebug.metric.errors", "Errors"), value: fmt.format(errors.length) }
    ];
    if (totalCopilotUsageNanoAiu > 0) {
      const aic = totalCopilotUsageNanoAiu / NANO_AIU_PER_AIC;
      metrics.push({ label: localize("chatDebug.metric.copilotUsage", "Copilot Usage (AIC)"), value: aicFormatter.value.format(aic) });
    }
    for (const metric of metrics) {
      const card = DOM.append(container, $(".chat-debug-overview-metric-card"));
      DOM.append(card, $("div.chat-debug-overview-metric-label", void 0, metric.label));
      DOM.append(card, $("div.chat-debug-overview-metric-value", void 0, metric.value));
    }
  }
};
ChatDebugOverviewView = __decorateClass([
  __decorateParam(1, IChatService),
  __decorateParam(2, IChatDebugService),
  __decorateParam(3, IChatWidgetService),
  __decorateParam(4, IChatSessionsService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IPreferencesService)
], ChatDebugOverviewView);
export {
  ChatDebugOverviewView,
  OverviewNavigation
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXREZWJ1Z1xcY2hhdERlYnVnT3ZlcnZpZXdWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQnJlYWRjcnVtYnNXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnJlYWRjcnVtYnMvYnJlYWRjcnVtYnNXaWRnZXQuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnJlYWRjcnVtYnNXaWRnZXRTdHlsZXMsIGRlZmF1bHRCdXR0b25TdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgQ2hhdERlYnVnTG9nTGV2ZWwsIElDaGF0RGVidWdFdmVudCwgSUNoYXREZWJ1Z1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdERlYnVnU2VydmljZS5qcyc7XG5pbXBvcnQgeyBzYWZlSW50bCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGUuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0U2Vzc2lvblR5cGUsIExvY2FsQ2hhdFNlc3Npb25VcmkgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi9jaGF0LmpzJztcbmltcG9ydCB7IElQcmVmZXJlbmNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgaXNBZ2VudEhvc3RTZXNzaW9uIH0gZnJvbSAnLi9hZ2VudEhvc3RMb2dTb3VyY2VzLmpzJztcbmltcG9ydCB7IGlzQ2hhdERlYnVnTG9nZ2luZ0VuYWJsZWRGb3JTZXNzaW9uLCByZW5kZXJDaGF0RGVidWdMb2dnaW5nRGlzYWJsZWRNZXNzYWdlIH0gZnJvbSAnLi9jaGF0RGVidWdFbmFibGVtZW50LmpzJztcbmltcG9ydCB7IHNldHVwQnJlYWRjcnVtYktleWJvYXJkTmF2aWdhdGlvbiwgVGV4dEJyZWFkY3J1bWJJdGVtIH0gZnJvbSAnLi9jaGF0RGVidWdUeXBlcy5qcyc7XG5cbmNvbnN0ICQgPSBET00uJDtcbmNvbnN0IG51bWJlckZvcm1hdHRlciA9IHNhZmVJbnRsLk51bWJlckZvcm1hdCgpO1xuY29uc3QgYWljRm9ybWF0dGVyID0gc2FmZUludGwuTnVtYmVyRm9ybWF0KHVuZGVmaW5lZCwgeyBtaW5pbXVtRnJhY3Rpb25EaWdpdHM6IDIsIG1heGltdW1GcmFjdGlvbkRpZ2l0czogMiB9KTtcbmNvbnN0IE5BTk9fQUlVX1BFUl9BSUMgPSAxXzAwMF8wMDBfMDAwO1xuXG5leHBvcnQgY29uc3QgZW51bSBPdmVydmlld05hdmlnYXRpb24ge1xuXHRIb21lID0gJ2hvbWUnLFxuXHRMb2dzID0gJ2xvZ3MnLFxuXHRGbG93Q2hhcnQgPSAnZmxvd2NoYXJ0Jyxcblx0Q2FjaGVFeHBsb3JlciA9ICdjYWNoZScsXG5cdFdpcmVMb2cgPSAnd2lyZWxvZycsXG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0RGVidWdPdmVydmlld1ZpZXcgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk5hdmlnYXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8T3ZlcnZpZXdOYXZpZ2F0aW9uPigpKTtcblx0cmVhZG9ubHkgb25OYXZpZ2F0ZSA9IHRoaXMuX29uTmF2aWdhdGUuZXZlbnQ7XG5cblx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBjb250ZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBicmVhZGNydW1iV2lkZ2V0OiBCcmVhZGNydW1ic1dpZGdldDtcblx0cHJpdmF0ZSByZWFkb25seSBsb2FkRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdHByaXZhdGUgY3VycmVudFNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIG1ldHJpY3NDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGlzRmlyc3RMb2FkOiBib29sZWFuID0gdHJ1ZTtcblx0cHJpdmF0ZSByZWFkb25seSByZWZyZXNoU2NoZWR1bGVyOiBSdW5PbmNlU2NoZWR1bGVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHBhcmVudDogSFRNTEVsZW1lbnQsXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElDaGF0RGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdERlYnVnU2VydmljZTogSUNoYXREZWJ1Z1NlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElDaGF0U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlc3Npb25zU2VydmljZTogSUNoYXRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElQcmVmZXJlbmNlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcmVmZXJlbmNlc1NlcnZpY2U6IElQcmVmZXJlbmNlc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5jb250YWluZXIgPSBET00uYXBwZW5kKHBhcmVudCwgJCgnLmNoYXQtZGVidWctb3ZlcnZpZXcnKSk7XG5cdFx0RE9NLmhpZGUodGhpcy5jb250YWluZXIpO1xuXG5cdFx0dGhpcy5yZWZyZXNoU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5kb1JlZnJlc2goKSwgMTAwKSk7XG5cblx0XHQvLyBCcmVhZGNydW1iXG5cdFx0Y29uc3QgYnJlYWRjcnVtYkNvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5jb250YWluZXIsICQoJy5jaGF0LWRlYnVnLWJyZWFkY3J1bWInKSk7XG5cdFx0dGhpcy5icmVhZGNydW1iV2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJyZWFkY3J1bWJzV2lkZ2V0KGJyZWFkY3J1bWJDb250YWluZXIsIDMsIHVuZGVmaW5lZCwgQ29kaWNvbi5jaGV2cm9uUmlnaHQsIGRlZmF1bHRCcmVhZGNydW1ic1dpZGdldFN0eWxlcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHNldHVwQnJlYWRjcnVtYktleWJvYXJkTmF2aWdhdGlvbihicmVhZGNydW1iQ29udGFpbmVyLCB0aGlzLmJyZWFkY3J1bWJXaWRnZXQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmJyZWFkY3J1bWJXaWRnZXQub25EaWRTZWxlY3RJdGVtKGUgPT4ge1xuXHRcdFx0aWYgKGUudHlwZSA9PT0gJ3NlbGVjdCcgJiYgZS5pdGVtIGluc3RhbmNlb2YgVGV4dEJyZWFkY3J1bWJJdGVtKSB7XG5cdFx0XHRcdHRoaXMuYnJlYWRjcnVtYldpZGdldC5zZXRTZWxlY3Rpb24odW5kZWZpbmVkKTtcblx0XHRcdFx0Y29uc3QgaXRlbXMgPSB0aGlzLmJyZWFkY3J1bWJXaWRnZXQuZ2V0SXRlbXMoKTtcblx0XHRcdFx0Y29uc3QgaWR4ID0gaXRlbXMuaW5kZXhPZihlLml0ZW0pO1xuXHRcdFx0XHRpZiAoaWR4ID09PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25OYXZpZ2F0ZS5maXJlKE92ZXJ2aWV3TmF2aWdhdGlvbi5Ib21lKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuY29udGVudCA9IERPTS5hcHBlbmQodGhpcy5jb250YWluZXIsICQoJy5jaGF0LWRlYnVnLW92ZXJ2aWV3LWNvbnRlbnQnKSk7XG5cdH1cblxuXHRzZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5jdXJyZW50U2Vzc2lvblJlc291cmNlID0gc2Vzc2lvblJlc291cmNlO1xuXHRcdHRoaXMuaXNGaXJzdExvYWQgPSB0cnVlO1xuXHR9XG5cblx0c2hvdygpOiB2b2lkIHtcblx0XHRET00uc2hvdyh0aGlzLmNvbnRhaW5lcik7XG5cdFx0dGhpcy5sb2FkKCk7XG5cdH1cblxuXHRoaWRlKCk6IHZvaWQge1xuXHRcdERPTS5oaWRlKHRoaXMuY29udGFpbmVyKTtcblx0XHR0aGlzLnJlZnJlc2hTY2hlZHVsZXIuY2FuY2VsKCk7XG5cdH1cblxuXHRyZWZyZXNoKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ICE9PSAnbm9uZScpIHtcblx0XHRcdGlmICghdGhpcy5yZWZyZXNoU2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0dGhpcy5yZWZyZXNoU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb1JlZnJlc2goKTogdm9pZCB7XG5cdFx0Ly8gT24gcmVmcmVzaCwgb25seSB1cGRhdGUgdGhlIG1ldHJpY3Mgc2VjdGlvbiBpbi1wbGFjZVxuXHRcdGlmICh0aGlzLm1ldHJpY3NDb250YWluZXIgJiYgdGhpcy5jdXJyZW50U2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRET00uY2xlYXJOb2RlKHRoaXMubWV0cmljc0NvbnRhaW5lcik7XG5cdFx0XHRjb25zdCBldmVudHMgPSB0aGlzLmNoYXREZWJ1Z1NlcnZpY2UuZ2V0RXZlbnRzKHRoaXMuY3VycmVudFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHR0aGlzLnJlbmRlck1ldHJpY3NDb250ZW50KHRoaXMubWV0cmljc0NvbnRhaW5lciwgZXZlbnRzKTtcblx0XHRcdHRoaXMuaXNGaXJzdExvYWQgPSBmYWxzZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5sb2FkKCk7XG5cdFx0fVxuXHR9XG5cblx0dXBkYXRlQnJlYWRjcnVtYigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY3VycmVudFNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uVGl0bGUgPSB0aGlzLmNoYXRTZXJ2aWNlLmdldFNlc3Npb25UaXRsZSh0aGlzLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UpIHx8IExvY2FsQ2hhdFNlc3Npb25VcmkucGFyc2VMb2NhbFNlc3Npb25JZCh0aGlzLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UpIHx8IHRoaXMuY3VycmVudFNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdHRoaXMuYnJlYWRjcnVtYldpZGdldC5zZXRJdGVtcyhbXG5cdFx0XHRuZXcgVGV4dEJyZWFkY3J1bWJJdGVtKGxvY2FsaXplKCdjaGF0RGVidWcudGl0bGUnLCBcIkFnZW50IERlYnVnIExvZ3NcIiksIHRydWUpLFxuXHRcdFx0bmV3IFRleHRCcmVhZGNydW1iSXRlbShzZXNzaW9uVGl0bGUpLFxuXHRcdF0pO1xuXHR9XG5cblx0cHJpdmF0ZSBsb2FkKCk6IHZvaWQge1xuXHRcdERPTS5jbGVhck5vZGUodGhpcy5jb250ZW50KTtcblx0XHR0aGlzLmxvYWREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMudXBkYXRlQnJlYWRjcnVtYigpO1xuXG5cdFx0aWYgKCF0aGlzLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uVGl0bGUgPSB0aGlzLmNoYXRTZXJ2aWNlLmdldFNlc3Npb25UaXRsZSh0aGlzLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UpIHx8IExvY2FsQ2hhdFNlc3Npb25VcmkucGFyc2VMb2NhbFNlc3Npb25JZCh0aGlzLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UpIHx8IHRoaXMuY3VycmVudFNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXG5cdFx0Y29uc3QgdGl0bGVSb3cgPSBET00uYXBwZW5kKHRoaXMuY29udGVudCwgJCgnLmNoYXQtZGVidWctb3ZlcnZpZXctdGl0bGUtcm93JykpO1xuXHRcdGNvbnN0IHRpdGxlRWwgPSBET00uYXBwZW5kKHRpdGxlUm93LCAkKCdoMi5jaGF0LWRlYnVnLW92ZXJ2aWV3LXRpdGxlJykpO1xuXHRcdERPTS5hcHBlbmQodGl0bGVFbCwgJChgc3BhbiR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoQ29kaWNvbi5jb21tZW50KX1gKSk7XG5cdFx0dGl0bGVFbC5hcHBlbmQoc2Vzc2lvblRpdGxlKTtcblxuXHRcdGNvbnN0IHRpdGxlQWN0aW9ucyA9IERPTS5hcHBlbmQodGl0bGVSb3csICQoJy5jaGF0LWRlYnVnLW92ZXJ2aWV3LXRpdGxlLWFjdGlvbnMnKSk7XG5cblx0XHRjb25zdCByZXZlYWxTZXNzaW9uQnRuID0gdGhpcy5sb2FkRGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24odGl0bGVBY3Rpb25zLCB7IGFyaWFMYWJlbDogbG9jYWxpemUoJ2NoYXREZWJ1Zy5yZXZlYWxDaGF0U2Vzc2lvbicsIFwiUmV2ZWFsIENoYXQgU2Vzc2lvblwiKSwgdGl0bGU6IGxvY2FsaXplKCdjaGF0RGVidWcucmV2ZWFsQ2hhdFNlc3Npb24nLCBcIlJldmVhbCBDaGF0IFNlc3Npb25cIikgfSkpO1xuXHRcdHJldmVhbFNlc3Npb25CdG4uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LWRlYnVnLWljb24tYnV0dG9uJyk7XG5cdFx0cmV2ZWFsU2Vzc2lvbkJ0bi5pY29uID0gQ29kaWNvbi5nb1RvRmlsZTtcblx0XHR0aGlzLmxvYWREaXNwb3NhYmxlcy5hZGQocmV2ZWFsU2Vzc2lvbkJ0bi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdFx0dGhpcy5jaGF0V2lkZ2V0U2VydmljZS5vcGVuU2Vzc2lvbih0aGlzLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFNlc3Npb24gZGV0YWlscyBzZWN0aW9uXG5cdFx0dGhpcy5yZW5kZXJTZXNzaW9uRGV0YWlscyh0aGlzLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0Ly8gRGVyaXZlZCBvdmVydmlldyBtZXRyaWNzIFx1MjAxNCBzaG93IHNoaW1tZXIgb25seSBvbiB0aGUgdmVyeSBmaXJzdCBsb2FkXG5cdFx0Ly8gQU5EIHdoZW4gdGhlcmUgYXJlIG5vIGV2ZW50cyB5ZXQuIElmIGV2ZW50cyB3ZXJlIGFscmVhZHkgc3RyZWFtZWRcblx0XHQvLyAoZS5nLiB3aGlsZSB2aWV3aW5nIGxvZ3MpLCByZW5kZXIgdGhlbSBpbW1lZGlhdGVseSBzbyB0aGUgc2hpbW1lclxuXHRcdC8vIGRvZXNuJ3QgZ2V0IHN0dWNrIGZvcmV2ZXIgd2FpdGluZyBmb3IgYW4gZXZlbnQgdGhhdCBhbHJlYWR5IGZpcmVkLlxuXHRcdGNvbnN0IGV2ZW50cyA9IHRoaXMuY2hhdERlYnVnU2VydmljZS5nZXRFdmVudHModGhpcy5jdXJyZW50U2Vzc2lvblJlc291cmNlKTtcblx0XHR0aGlzLnJlbmRlckRlcml2ZWRPdmVydmlldyhldmVudHMsIHRoaXMuaXNGaXJzdExvYWQgJiYgZXZlbnRzLmxlbmd0aCA9PT0gMCk7XG5cdFx0dGhpcy5pc0ZpcnN0TG9hZCA9IGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJTZXNzaW9uRGV0YWlscyhzZXNzaW9uVXJpOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uVXJpKTtcblxuXHRcdGludGVyZmFjZSBEZXRhaWxJdGVtIHsgbGFiZWw6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9XG5cdFx0Y29uc3QgZGV0YWlsczogRGV0YWlsSXRlbVtdID0gW107XG5cblx0XHQvLyBTZXNzaW9uIHR5cGVcblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uVXJpKTtcblx0XHRjb25zdCBjb250cmlidXRpb24gPSB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0Q2hhdFNlc3Npb25Db250cmlidXRpb24oc2Vzc2lvblR5cGUpO1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlTmFtZSA9IGNvbnRyaWJ1dGlvbj8uZGlzcGxheU5hbWUgfHwgKHNlc3Npb25UeXBlID09PSBsb2NhbENoYXRTZXNzaW9uVHlwZVxuXHRcdFx0PyBsb2NhbGl6ZSgnY2hhdERlYnVnLnNlc3Npb25UeXBlLmxvY2FsJywgXCJMb2NhbFwiKVxuXHRcdFx0OiBzZXNzaW9uVHlwZSk7XG5cdFx0ZGV0YWlscy5wdXNoKHsgbGFiZWw6IGxvY2FsaXplKCdjaGF0RGVidWcuZGV0YWlsLnNlc3Npb25UeXBlJywgXCJTZXNzaW9uIFR5cGVcIiksIHZhbHVlOiBzZXNzaW9uVHlwZU5hbWUgfSk7XG5cblx0XHRpZiAobW9kZWwpIHtcblx0XHRcdGNvbnN0IGxvY2F0aW9uTGFiZWwgPSB0aGlzLmdldExvY2F0aW9uTGFiZWwobW9kZWwuaW5pdGlhbExvY2F0aW9uKTtcblx0XHRcdGRldGFpbHMucHVzaCh7IGxhYmVsOiBsb2NhbGl6ZSgnY2hhdERlYnVnLmRldGFpbC5sb2NhdGlvbicsIFwiTG9jYXRpb25cIiksIHZhbHVlOiBsb2NhdGlvbkxhYmVsIH0pO1xuXG5cdFx0XHRjb25zdCBpblByb2dyZXNzID0gbW9kZWwucmVxdWVzdEluUHJvZ3Jlc3MuZ2V0KCk7XG5cdFx0XHRjb25zdCBzdGF0dXNMYWJlbCA9IGluUHJvZ3Jlc3Ncblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdERlYnVnLnN0YXR1cy5pblByb2dyZXNzJywgXCJJbiBQcm9ncmVzc1wiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0RGVidWcuc3RhdHVzLmlkbGUnLCBcIklkbGVcIik7XG5cdFx0XHRkZXRhaWxzLnB1c2goeyBsYWJlbDogbG9jYWxpemUoJ2NoYXREZWJ1Zy5kZXRhaWwuc3RhdHVzJywgXCJTdGF0dXNcIiksIHZhbHVlOiBzdGF0dXNMYWJlbCB9KTtcblxuXHRcdFx0Y29uc3QgdGltaW5nID0gbW9kZWwudGltaW5nO1xuXHRcdFx0ZGV0YWlscy5wdXNoKHsgbGFiZWw6IGxvY2FsaXplKCdjaGF0RGVidWcuZGV0YWlsLmNyZWF0ZWQnLCBcIkNyZWF0ZWRcIiksIHZhbHVlOiBuZXcgRGF0ZSh0aW1pbmcuY3JlYXRlZCkudG9Mb2NhbGVTdHJpbmcoKSB9KTtcblxuXHRcdFx0aWYgKHRpbWluZy5sYXN0UmVxdWVzdEVuZGVkKSB7XG5cdFx0XHRcdGRldGFpbHMucHVzaCh7IGxhYmVsOiBsb2NhbGl6ZSgnY2hhdERlYnVnLmRldGFpbC5sYXN0QWN0aXZpdHknLCBcIkxhc3QgQWN0aXZpdHlcIiksIHZhbHVlOiBuZXcgRGF0ZSh0aW1pbmcubGFzdFJlcXVlc3RFbmRlZCkudG9Mb2NhbGVTdHJpbmcoKSB9KTtcblx0XHRcdH0gZWxzZSBpZiAodGltaW5nLmxhc3RSZXF1ZXN0U3RhcnRlZCkge1xuXHRcdFx0XHRkZXRhaWxzLnB1c2goeyBsYWJlbDogbG9jYWxpemUoJ2NoYXREZWJ1Zy5kZXRhaWwubGFzdEFjdGl2aXR5JywgXCJMYXN0IEFjdGl2aXR5XCIpLCB2YWx1ZTogbmV3IERhdGUodGltaW5nLmxhc3RSZXF1ZXN0U3RhcnRlZCkudG9Mb2NhbGVTdHJpbmcoKSB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZGV0YWlscy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBzZWN0aW9uID0gRE9NLmFwcGVuZCh0aGlzLmNvbnRlbnQsICQoJy5jaGF0LWRlYnVnLW92ZXJ2aWV3LXNlY3Rpb24nKSk7XG5cdFx0XHRET00uYXBwZW5kKHNlY3Rpb24sICQoJ2gzLmNoYXQtZGVidWctb3ZlcnZpZXctc2VjdGlvbi1sYWJlbCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5zZXNzaW9uRGV0YWlscycsIFwiU2Vzc2lvbiBEZXRhaWxzXCIpKSk7XG5cblx0XHRcdGNvbnN0IGRldGFpbHNHcmlkID0gRE9NLmFwcGVuZChzZWN0aW9uLCAkKCcuY2hhdC1kZWJ1Zy1vdmVydmlldy1kZXRhaWxzJykpO1xuXHRcdFx0Zm9yIChjb25zdCBkZXRhaWwgb2YgZGV0YWlscykge1xuXHRcdFx0XHRjb25zdCByb3cgPSBET00uYXBwZW5kKGRldGFpbHNHcmlkLCAkKCcuY2hhdC1kZWJ1Zy1vdmVydmlldy1kZXRhaWwtcm93JykpO1xuXHRcdFx0XHRET00uYXBwZW5kKHJvdywgJCgnc3Bhbi5jaGF0LWRlYnVnLW92ZXJ2aWV3LWRldGFpbC1sYWJlbCcsIHVuZGVmaW5lZCwgZGV0YWlsLmxhYmVsKSk7XG5cdFx0XHRcdERPTS5hcHBlbmQocm93LCAkKCdzcGFuLmNoYXQtZGVidWctb3ZlcnZpZXctZGV0YWlsLXZhbHVlJywgdW5kZWZpbmVkLCBkZXRhaWwudmFsdWUpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldExvY2F0aW9uTGFiZWwobG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uKTogc3RyaW5nIHtcblx0XHRzd2l0Y2ggKGxvY2F0aW9uKSB7XG5cdFx0XHRjYXNlIENoYXRBZ2VudExvY2F0aW9uLkNoYXQ6IHJldHVybiBsb2NhbGl6ZSgnY2hhdERlYnVnLmxvY2F0aW9uLmNoYXQnLCBcIkNoYXQgUGFuZWxcIik7XG5cdFx0XHRjYXNlIENoYXRBZ2VudExvY2F0aW9uLlRlcm1pbmFsOiByZXR1cm4gbG9jYWxpemUoJ2NoYXREZWJ1Zy5sb2NhdGlvbi50ZXJtaW5hbCcsIFwiVGVybWluYWxcIik7XG5cdFx0XHRjYXNlIENoYXRBZ2VudExvY2F0aW9uLk5vdGVib29rOiByZXR1cm4gbG9jYWxpemUoJ2NoYXREZWJ1Zy5sb2NhdGlvbi5ub3RlYm9vaycsIFwiTm90ZWJvb2tcIik7XG5cdFx0XHRjYXNlIENoYXRBZ2VudExvY2F0aW9uLkVkaXRvcklubGluZTogcmV0dXJuIGxvY2FsaXplKCdjaGF0RGVidWcubG9jYXRpb24uZWRpdG9yJywgXCJFZGl0b3IgSW5saW5lXCIpO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuIFN0cmluZyhsb2NhdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJEZXJpdmVkT3ZlcnZpZXcoZXZlbnRzOiByZWFkb25seSBJQ2hhdERlYnVnRXZlbnRbXSwgc2hvd1NoaW1tZXI6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHQvLyBXaGVuIGFnZW50IGRlYnVnIGxvZ2dpbmcgaXMgZGlzYWJsZWQgZm9yIHRoaXMgc2Vzc2lvbiwgbm8gbWV0cmljcyBhcmVcblx0XHQvLyBjYXB0dXJlZC4gU3VyZmFjZSBhIGhpbnQgdG8gZW5hYmxlIHRoZSBzZXR0aW5nIGluc3RlYWQgb2YgYW4gZW1wdHlcblx0XHQvLyBzdW1tYXJ5LCB3aGlsZSBzdGlsbCBrZWVwaW5nIHRoZSBuYXZpZ2F0aW9uIGJ1dHRvbnMgYmVsb3cuXG5cdFx0aWYgKCFpc0NoYXREZWJ1Z0xvZ2dpbmdFbmFibGVkRm9yU2Vzc2lvbih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHR0aGlzLm1ldHJpY3NDb250YWluZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBkaXNhYmxlZFNlY3Rpb24gPSBET00uYXBwZW5kKHRoaXMuY29udGVudCwgJCgnLmNoYXQtZGVidWctb3ZlcnZpZXctc2VjdGlvbicpKTtcblx0XHRcdHJlbmRlckNoYXREZWJ1Z0xvZ2dpbmdEaXNhYmxlZE1lc3NhZ2UoZGlzYWJsZWRTZWN0aW9uLCB0aGlzLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UsIHRoaXMucHJlZmVyZW5jZXNTZXJ2aWNlLCB0aGlzLmxvYWREaXNwb3NhYmxlcyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IG1ldHJpY3NTZWN0aW9uID0gRE9NLmFwcGVuZCh0aGlzLmNvbnRlbnQsICQoJy5jaGF0LWRlYnVnLW92ZXJ2aWV3LXNlY3Rpb24nKSk7XG5cdFx0XHRET00uYXBwZW5kKG1ldHJpY3NTZWN0aW9uLCAkKCdoMy5jaGF0LWRlYnVnLW92ZXJ2aWV3LXNlY3Rpb24tbGFiZWwnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdjaGF0RGVidWcuc3VtbWFyeScsIFwiU3VtbWFyeVwiKSkpO1xuXG5cdFx0XHR0aGlzLm1ldHJpY3NDb250YWluZXIgPSBET00uYXBwZW5kKG1ldHJpY3NTZWN0aW9uLCAkKCcuY2hhdC1kZWJ1Zy1vdmVydmlldy1tZXRyaWNzJykpO1xuXG5cdFx0XHRpZiAoc2hvd1NoaW1tZXIpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJNZXRyaWNzU2hpbW1lcih0aGlzLm1ldHJpY3NDb250YWluZXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJNZXRyaWNzQ29udGVudCh0aGlzLm1ldHJpY3NDb250YWluZXIsIGV2ZW50cyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRXhwbG9yZSBhY3Rpb25zXG5cdFx0Y29uc3QgYWN0aW9uc1NlY3Rpb24gPSBET00uYXBwZW5kKHRoaXMuY29udGVudCwgJCgnLmNoYXQtZGVidWctb3ZlcnZpZXctc2VjdGlvbicpKTtcblx0XHRET00uYXBwZW5kKGFjdGlvbnNTZWN0aW9uLCAkKCdoMy5jaGF0LWRlYnVnLW92ZXJ2aWV3LXNlY3Rpb24tbGFiZWwnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdjaGF0RGVidWcuZXhwbG9yZVRyYWNlRGF0YScsIFwiRXhwbG9yZSBUcmFjZSBEYXRhXCIpKSk7XG5cblx0XHRjb25zdCByb3cgPSBET00uYXBwZW5kKGFjdGlvbnNTZWN0aW9uLCAkKCcuY2hhdC1kZWJ1Zy1vdmVydmlldy1hY3Rpb25zJykpO1xuXG5cdFx0Y29uc3Qgdmlld0xvZ3NCdG4gPSB0aGlzLmxvYWREaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbihyb3csIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlLCBzdXBwb3J0SWNvbnM6IHRydWUsIHRpdGxlOiBsb2NhbGl6ZSgnY2hhdERlYnVnLnZpZXdMb2dzJywgXCJWaWV3IExvZ3NcIikgfSkpO1xuXHRcdHZpZXdMb2dzQnRuLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC1kZWJ1Zy1vdmVydmlldy1hY3Rpb24tYnV0dG9uJyk7XG5cdFx0dmlld0xvZ3NCdG4ubGFiZWwgPSBgJChsaXN0LWZsYXQpICR7bG9jYWxpemUoJ2NoYXREZWJ1Zy52aWV3TG9ncycsIFwiVmlldyBMb2dzXCIpfWA7XG5cdFx0dGhpcy5sb2FkRGlzcG9zYWJsZXMuYWRkKHZpZXdMb2dzQnRuLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25OYXZpZ2F0ZS5maXJlKE92ZXJ2aWV3TmF2aWdhdGlvbi5Mb2dzKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBmbG93Q2hhcnRCdG4gPSB0aGlzLmxvYWREaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbihyb3csIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlLCBzdXBwb3J0SWNvbnM6IHRydWUsIHRpdGxlOiBsb2NhbGl6ZSgnY2hhdERlYnVnLmFnZW50Rmxvd0NoYXJ0JywgXCJBZ2VudCBGbG93IENoYXJ0XCIpIH0pKTtcblx0XHRmbG93Q2hhcnRCdG4uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LWRlYnVnLW92ZXJ2aWV3LWFjdGlvbi1idXR0b24nKTtcblx0XHRmbG93Q2hhcnRCdG4ubGFiZWwgPSBgJCh0eXBlLWhpZXJhcmNoeSkgJHtsb2NhbGl6ZSgnY2hhdERlYnVnLmFnZW50Rmxvd0NoYXJ0JywgXCJBZ2VudCBGbG93IENoYXJ0XCIpfWA7XG5cdFx0dGhpcy5sb2FkRGlzcG9zYWJsZXMuYWRkKGZsb3dDaGFydEJ0bi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdHRoaXMuX29uTmF2aWdhdGUuZmlyZShPdmVydmlld05hdmlnYXRpb24uRmxvd0NoYXJ0KTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBjYWNoZUJ0biA9IHRoaXMubG9hZERpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKHJvdywgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUsIHN1cHBvcnRJY29uczogdHJ1ZSwgdGl0bGU6IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGVFeHBsb3JlcicsIFwiQ2FjaGUgRXhwbG9yZXJcIikgfSkpO1xuXHRcdGNhY2hlQnRuLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC1kZWJ1Zy1vdmVydmlldy1hY3Rpb24tYnV0dG9uJyk7XG5cdFx0Y2FjaGVCdG4ubGFiZWwgPSBgJChkYXRhYmFzZSkgJHtsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlRXhwbG9yZXInLCBcIkNhY2hlIEV4cGxvcmVyXCIpfWA7XG5cdFx0dGhpcy5sb2FkRGlzcG9zYWJsZXMuYWRkKGNhY2hlQnRuLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25OYXZpZ2F0ZS5maXJlKE92ZXJ2aWV3TmF2aWdhdGlvbi5DYWNoZUV4cGxvcmVyKTtcblx0XHR9KSk7XG5cblx0XHQvLyBUaGUgQUhQIGxvZyBpcyBvbmx5IG1lYW5pbmdmdWwgZm9yIEFnZW50IEhvc3Qgc2Vzc2lvbnMuXG5cdFx0aWYgKGlzQWdlbnRIb3N0U2Vzc2lvbih0aGlzLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRjb25zdCB3aXJlTG9nQnRuID0gdGhpcy5sb2FkRGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24ocm93LCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSwgc3VwcG9ydEljb25zOiB0cnVlLCB0aXRsZTogbG9jYWxpemUoJ2NoYXREZWJ1Zy5haHBMb2cnLCBcIkFIUCBMb2dcIikgfSkpO1xuXHRcdFx0d2lyZUxvZ0J0bi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtZGVidWctb3ZlcnZpZXctYWN0aW9uLWJ1dHRvbicpO1xuXHRcdFx0d2lyZUxvZ0J0bi5sYWJlbCA9IGAkKGFycm93LXN3YXApICR7bG9jYWxpemUoJ2NoYXREZWJ1Zy5haHBMb2cnLCBcIkFIUCBMb2dcIil9YDtcblx0XHRcdHRoaXMubG9hZERpc3Bvc2FibGVzLmFkZCh3aXJlTG9nQnRuLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9vbk5hdmlnYXRlLmZpcmUoT3ZlcnZpZXdOYXZpZ2F0aW9uLldpcmVMb2cpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJNZXRyaWNzU2hpbW1lcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Ly8gU2hvdyBwbGFjZWhvbGRlciBzaGltbWVyIGNhcmRzIHdoaWxlIHByb3ZpZGVyIGRhdGEgaXMgbG9hZGluZ1xuXHRcdGNvbnN0IHBsYWNlaG9sZGVyTGFiZWxzID0gW1xuXHRcdFx0bG9jYWxpemUoJ2NoYXREZWJ1Zy5tZXRyaWMubW9kZWxUdXJucycsIFwiTW9kZWwgVHVybnNcIiksXG5cdFx0XHRsb2NhbGl6ZSgnY2hhdERlYnVnLm1ldHJpYy50b29sQ2FsbHMnLCBcIlRvb2wgQ2FsbHNcIiksXG5cdFx0XHRsb2NhbGl6ZSgnY2hhdERlYnVnLm1ldHJpYy50b3RhbElucHV0VG9rZW5zJywgXCJUb3RhbCBJbnB1dCBUb2tlbnNcIiksXG5cdFx0XHRsb2NhbGl6ZSgnY2hhdERlYnVnLm1ldHJpYy50b3RhbE91dHB1dFRva2VucycsIFwiVG90YWwgT3V0cHV0IFRva2Vuc1wiKSxcblx0XHRcdGxvY2FsaXplKCdjaGF0RGVidWcubWV0cmljLnRvdGFsQ2FjaGVkSW5wdXRUb2tlbnMnLCBcIlRvdGFsIENhY2hlZCBJbnB1dCBUb2tlbnNcIiksXG5cdFx0XHRsb2NhbGl6ZSgnY2hhdERlYnVnLm1ldHJpYy50b3RhbFRva2VucycsIFwiVG90YWwgVG9rZW5zXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2NoYXREZWJ1Zy5tZXRyaWMuZXJyb3JzJywgXCJFcnJvcnNcIiksXG5cdFx0XTtcblx0XHRmb3IgKGNvbnN0IGxhYmVsIG9mIHBsYWNlaG9sZGVyTGFiZWxzKSB7XG5cdFx0XHRjb25zdCBjYXJkID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5jaGF0LWRlYnVnLW92ZXJ2aWV3LW1ldHJpYy1jYXJkJykpO1xuXHRcdFx0RE9NLmFwcGVuZChjYXJkLCAkKCdkaXYuY2hhdC1kZWJ1Zy1vdmVydmlldy1tZXRyaWMtbGFiZWwnLCB1bmRlZmluZWQsIGxhYmVsKSk7XG5cdFx0XHRjb25zdCB2YWx1ZUVsID0gRE9NLmFwcGVuZChjYXJkLCAkKCdkaXYuY2hhdC1kZWJ1Zy1vdmVydmlldy1tZXRyaWMtdmFsdWUnKSk7XG5cdFx0XHRjb25zdCBzaGltbWVyID0gRE9NLmFwcGVuZCh2YWx1ZUVsLCAkKCdzcGFuLmNoYXQtZGVidWctb3ZlcnZpZXctbWV0cmljLXNoaW1tZXInKSk7XG5cdFx0XHRzaGltbWVyLnRleHRDb250ZW50ID0gJ1xcdTAwQTAnOyAvLyBub24tYnJlYWtpbmcgc3BhY2UgZm9yIGhlaWdodFxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyTWV0cmljc0NvbnRlbnQoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZXZlbnRzOiByZWFkb25seSBJQ2hhdERlYnVnRXZlbnRbXSk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsVHVybnMgPSBldmVudHMuZmlsdGVyKGUgPT4gZS5raW5kID09PSAnbW9kZWxUdXJuJyk7XG5cdFx0Y29uc3QgdG9vbENhbGxzID0gZXZlbnRzLmZpbHRlcihlID0+IGUua2luZCA9PT0gJ3Rvb2xDYWxsJyk7XG5cdFx0Y29uc3QgZXJyb3JzID0gZXZlbnRzLmZpbHRlcihlID0+XG5cdFx0XHQoZS5raW5kID09PSAnZ2VuZXJpYycgJiYgZS5sZXZlbCA9PT0gQ2hhdERlYnVnTG9nTGV2ZWwuRXJyb3IpIHx8XG5cdFx0XHQoZS5raW5kID09PSAndG9vbENhbGwnICYmIGUucmVzdWx0ID09PSAnZXJyb3InKVxuXHRcdCk7XG5cblx0XHRjb25zdCBmbXQgPSBudW1iZXJGb3JtYXR0ZXIudmFsdWU7XG5cdFx0Y29uc3QgdG90YWxJbnB1dFRva2VucyA9IG1vZGVsVHVybnMucmVkdWNlKChzdW0sIGUpID0+IHN1bSArIChlLmlucHV0VG9rZW5zID8/IDApLCAwKTtcblx0XHRjb25zdCB0b3RhbE91dHB1dFRva2VucyA9IG1vZGVsVHVybnMucmVkdWNlKChzdW0sIGUpID0+IHN1bSArIChlLm91dHB1dFRva2VucyA/PyAwKSwgMCk7XG5cdFx0Y29uc3QgdG90YWxDYWNoZWRUb2tlbnMgPSBtb2RlbFR1cm5zLnJlZHVjZSgoc3VtLCBlKSA9PiBzdW0gKyAoZS5jYWNoZWRUb2tlbnMgPz8gMCksIDApO1xuXHRcdGNvbnN0IHRvdGFsVG9rZW5zID0gbW9kZWxUdXJucy5yZWR1Y2UoKHN1bSwgZSkgPT4gc3VtICsgKGUudG90YWxUb2tlbnMgPz8gMCksIDApO1xuXHRcdGNvbnN0IHRvdGFsQ29waWxvdFVzYWdlTmFub0FpdSA9IG1vZGVsVHVybnMucmVkdWNlKChzdW0sIGUpID0+IHN1bSArIChlLmNvcGlsb3RVc2FnZU5hbm9BaXUgPz8gMCksIDApO1xuXG5cdFx0aW50ZXJmYWNlIE92ZXJ2aWV3TWV0cmljIHsgbGFiZWw6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9XG5cdFx0Y29uc3QgbWV0cmljczogT3ZlcnZpZXdNZXRyaWNbXSA9IFtcblx0XHRcdHsgbGFiZWw6IGxvY2FsaXplKCdjaGF0RGVidWcubWV0cmljLm1vZGVsVHVybnMnLCBcIk1vZGVsIFR1cm5zXCIpLCB2YWx1ZTogZm10LmZvcm1hdChtb2RlbFR1cm5zLmxlbmd0aCkgfSxcblx0XHRcdHsgbGFiZWw6IGxvY2FsaXplKCdjaGF0RGVidWcubWV0cmljLnRvb2xDYWxscycsIFwiVG9vbCBDYWxsc1wiKSwgdmFsdWU6IGZtdC5mb3JtYXQodG9vbENhbGxzLmxlbmd0aCkgfSxcblx0XHRcdHsgbGFiZWw6IGxvY2FsaXplKCdjaGF0RGVidWcubWV0cmljLnRvdGFsSW5wdXRUb2tlbnMnLCBcIlRvdGFsIElucHV0IFRva2Vuc1wiKSwgdmFsdWU6IGZtdC5mb3JtYXQodG90YWxJbnB1dFRva2VucykgfSxcblx0XHRcdHsgbGFiZWw6IGxvY2FsaXplKCdjaGF0RGVidWcubWV0cmljLnRvdGFsT3V0cHV0VG9rZW5zJywgXCJUb3RhbCBPdXRwdXQgVG9rZW5zXCIpLCB2YWx1ZTogZm10LmZvcm1hdCh0b3RhbE91dHB1dFRva2VucykgfSxcblx0XHRcdHsgbGFiZWw6IGxvY2FsaXplKCdjaGF0RGVidWcubWV0cmljLnRvdGFsQ2FjaGVkSW5wdXRUb2tlbnMnLCBcIlRvdGFsIENhY2hlZCBJbnB1dCBUb2tlbnNcIiksIHZhbHVlOiBmbXQuZm9ybWF0KHRvdGFsQ2FjaGVkVG9rZW5zKSB9LFxuXHRcdFx0eyBsYWJlbDogbG9jYWxpemUoJ2NoYXREZWJ1Zy5tZXRyaWMudG90YWxUb2tlbnMnLCBcIlRvdGFsIFRva2Vuc1wiKSwgdmFsdWU6IGZtdC5mb3JtYXQodG90YWxUb2tlbnMpIH0sXG5cdFx0XHR7IGxhYmVsOiBsb2NhbGl6ZSgnY2hhdERlYnVnLm1ldHJpYy5lcnJvcnMnLCBcIkVycm9yc1wiKSwgdmFsdWU6IGZtdC5mb3JtYXQoZXJyb3JzLmxlbmd0aCkgfSxcblx0XHRdO1xuXG5cdFx0aWYgKHRvdGFsQ29waWxvdFVzYWdlTmFub0FpdSA+IDApIHtcblx0XHRcdGNvbnN0IGFpYyA9IHRvdGFsQ29waWxvdFVzYWdlTmFub0FpdSAvIE5BTk9fQUlVX1BFUl9BSUM7XG5cdFx0XHRtZXRyaWNzLnB1c2goeyBsYWJlbDogbG9jYWxpemUoJ2NoYXREZWJ1Zy5tZXRyaWMuY29waWxvdFVzYWdlJywgXCJDb3BpbG90IFVzYWdlIChBSUMpXCIpLCB2YWx1ZTogYWljRm9ybWF0dGVyLnZhbHVlLmZvcm1hdChhaWMpIH0pO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgbWV0cmljIG9mIG1ldHJpY3MpIHtcblx0XHRcdGNvbnN0IGNhcmQgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNoYXQtZGVidWctb3ZlcnZpZXctbWV0cmljLWNhcmQnKSk7XG5cdFx0XHRET00uYXBwZW5kKGNhcmQsICQoJ2Rpdi5jaGF0LWRlYnVnLW92ZXJ2aWV3LW1ldHJpYy1sYWJlbCcsIHVuZGVmaW5lZCwgbWV0cmljLmxhYmVsKSk7XG5cdFx0XHRET00uYXBwZW5kKGNhcmQsICQoJ2Rpdi5jaGF0LWRlYnVnLW92ZXJ2aWV3LW1ldHJpYy12YWx1ZScsIHVuZGVmaW5lZCwgbWV0cmljLnZhbHVlKSk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDLDJCQUEyQjtBQUNwRSxTQUFTLG1CQUFv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
