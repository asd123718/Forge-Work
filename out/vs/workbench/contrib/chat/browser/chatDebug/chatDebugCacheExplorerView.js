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
import { Orientation, Sash, SashState } from "../../../../../base/browser/ui/sash/sash.js";
import { BreadcrumbsWidget } from "../../../../../base/browser/ui/breadcrumbs/breadcrumbsWidget.js";
import { Separator, toAction } from "../../../../../base/common/actions.js";
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { safeIntl } from "../../../../../base/common/date.js";
import { equals } from "../../../../../base/common/objects.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../nls.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { defaultBreadcrumbsWidgetStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { linesDiffComputers } from "../../../../../editor/common/diff/linesDiffComputers.js";
import { IChatDebugService } from "../../common/chatDebugService.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { LocalChatSessionUri } from "../../common/model/chatUri.js";
import { appendSystemDrift, appendToolsDrift, CacheDiffKind, diffPromptSignature, parseInputMessages } from "./chatDebugCacheDiff.js";
import { analyzeStringDivergence, buildSessionCacheReport, CacheBreakCategory, cacheBreakCategoryLabel, CacheInsightSeverity, categorizeCacheBreak, computeCacheInsights, describeStringDivergence, maxInsightSeverity, primaryInsight } from "./chatDebugCacheInsights.js";
import { setupBreadcrumbKeyboardNavigation, TextBreadcrumbItem } from "./chatDebugTypes.js";
const $ = DOM.$;
const numberFormatter = safeIntl.NumberFormat();
const timeFormatter = safeIntl.DateTimeFormat(void 0, { hour: "numeric", minute: "2-digit", second: "2-digit" });
const RAIL_DEFAULT_WIDTH = 280;
const RAIL_MIN_WIDTH = 180;
const RAIL_MAX_WIDTH = 600;
const CURRENT_CONTINUATION_DELTA_COMPONENT = "current continuation delta";
const TTL_GAP_MINUTES = 5;
const DEFAULT_AGENT_KEY = "panel/editAgent";
var CacheExplorerNavigation = /* @__PURE__ */ ((CacheExplorerNavigation2) => {
  CacheExplorerNavigation2["Home"] = "home";
  CacheExplorerNavigation2["Overview"] = "overview";
  return CacheExplorerNavigation2;
})(CacheExplorerNavigation || {});
let ChatDebugCacheExplorerView = class extends Disposable {
  constructor(parent, chatService, chatDebugService, contextMenuService) {
    super();
    this.chatService = chatService;
    this.chatDebugService = chatDebugService;
    this.contextMenuService = contextMenuService;
    this._onNavigate = this._register(new Emitter());
    this.onNavigate = this._onNavigate.event;
    this.railWidth = RAIL_DEFAULT_WIDTH;
    /** Disposables for the left rail (toolbar + turn rows). Cleared on every full render. */
    this.railDisposables = this._register(new DisposableStore());
    /** Disposables for the right content panel. Cleared whenever the content is re-rendered. */
    this.contentDisposables = this._register(new DisposableStore());
    /** All model turns for the session, before the agent filter is applied. */
    this.allModelTurns = [];
    /** Model turns after the agent filter — the list the rail and diff operate on. */
    this.modelTurns = [];
    /** Selected turn (B side). A is computed as `selectedIndex - 1`. -1 = no explicit selection yet. */
    this.selectedIndex = -1;
    /** Whether the per-chunk signature breakdown table is expanded. */
    this.sigBreakdownOpen = false;
    /** Rail turn-row elements by turn index, for in-place selection updates without rebuilding the rail. */
    this.railRowsByIndex = /* @__PURE__ */ new Map();
    /**
     * Component accordion entries by component name (`system`, `tools`,
     * `messages[i]`), so findings and signature segments can reveal the
     * matching entry. We track both the outer item (for the open/flash
     * classes and scroll target) and the inner header (the focus target).
     * Rebuilt on every content render.
     */
    this.componentElements = /* @__PURE__ */ new Map();
    /** Selection index the breaking component was last auto-expanded for. */
    this.autoOpenedForIndex = -1;
    /**
     * Monotonically-increasing render token. Each call to {@link render}
     * captures the current value, then re-checks it after each await; if a
     * newer render has started in the meantime, the older one bails out
     * before mutating the DOM. Avoids races where a slow model-turn
     * resolve from one session writes into another's panel.
     */
    this.renderToken = 0;
    /** Cache of resolved model-turn content keyed by event id. */
    this.resolvedCache = /* @__PURE__ */ new Map();
    /** Components currently expanded (by component name). */
    this.openComponents = /* @__PURE__ */ new Set(["system", "tools"]);
    /** Rail groups currently collapsed (by group key — the parent event id). */
    this.collapsedGroups = /* @__PURE__ */ new Set();
    this.container = DOM.append(parent, $(".chat-debug-cache"));
    DOM.hide(this.container);
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
        } else if (idx === 1) {
          this._onNavigate.fire("overview" /* Overview */);
        }
      }
    }));
    const body = DOM.append(this.container, $(".chat-debug-cache-body"));
    this.rail = DOM.append(body, $(".chat-debug-cache-rail"));
    this.rail.style.width = `${this.railWidth}px`;
    this.railToolbar = DOM.append(this.rail, $(".chat-debug-cache-rail-toolbar"));
    this.railList = DOM.append(this.rail, $(".chat-debug-cache-rail-list"));
    this.content = DOM.append(body, $(".chat-debug-cache-content"));
    this.sash = this._register(new Sash(body, {
      getVerticalSashLeft: () => this.railWidth
    }, { orientation: Orientation.VERTICAL }));
    this.sash.state = SashState.Enabled;
    let sashStartWidth;
    this._register(this.sash.onDidStart(() => sashStartWidth = this.railWidth));
    this._register(this.sash.onDidEnd(() => {
      sashStartWidth = void 0;
      this.sash.layout();
    }));
    this._register(this.sash.onDidChange((e) => {
      if (sashStartWidth === void 0) {
        return;
      }
      const delta = e.currentX - e.startX;
      const next = Math.max(RAIL_MIN_WIDTH, Math.min(RAIL_MAX_WIDTH, sashStartWidth + delta));
      this.railWidth = next;
      this.rail.style.width = `${next}px`;
      this.sash.layout();
    }));
    this.refreshScheduler = this._register(new RunOnceScheduler(() => this.render(), 50));
  }
  setSession(sessionResource) {
    if (!this.currentSessionResource || this.currentSessionResource.toString() !== sessionResource.toString()) {
      this.resolvedCache.clear();
      this.collapsedGroups.clear();
      this.openComponents.clear();
      this.openComponents.add("system");
      this.openComponents.add("tools");
      this.selectedIndex = -1;
      this.selectedAgents = void 0;
      this.pendingSelectTurn = void 0;
      this.sigBreakdownOpen = false;
      this.autoOpenedForIndex = -1;
      this.sessionReportCache = void 0;
    }
    this.currentSessionResource = sessionResource;
  }
  show() {
    DOM.show(this.container);
    this.render();
  }
  hide() {
    DOM.hide(this.container);
    this.refreshScheduler.cancel();
  }
  refresh() {
    if (this.container.style.display !== "none" && !this.refreshScheduler.isScheduled()) {
      this.refreshScheduler.schedule();
    }
  }
  updateBreadcrumb() {
    if (!this.currentSessionResource) {
      return;
    }
    const sessionTitle = this.chatService.getSessionTitle(this.currentSessionResource) || LocalChatSessionUri.parseLocalSessionId(this.currentSessionResource) || this.currentSessionResource.toString();
    this.breadcrumbWidget.setItems([
      new TextBreadcrumbItem(localize("chatDebug.title", "Agent Debug Logs"), true),
      new TextBreadcrumbItem(sessionTitle, true),
      new TextBreadcrumbItem(localize("chatDebug.cacheExplorer", "Cache Explorer"))
    ]);
  }
  async render() {
    const token = ++this.renderToken;
    const isCurrent = () => token === this.renderToken;
    const railScrollTop = this.railList.scrollTop;
    this.updateBreadcrumb();
    this.railDisposables.clear();
    DOM.clearNode(this.railToolbar);
    DOM.clearNode(this.railList);
    this.railRowsByIndex.clear();
    if (!this.currentSessionResource) {
      this.contentDisposables.clear();
      DOM.clearNode(this.content);
      return;
    }
    const events = this.chatDebugService.getEvents(this.currentSessionResource);
    this.allModelTurns = events.filter((e) => e.kind === "modelTurn");
    const userMessages = events.filter((e) => e.kind === "userMessage");
    if (this.allModelTurns.length === 0) {
      this.contentDisposables.clear();
      DOM.clearNode(this.content);
      const empty = DOM.append(this.content, $(".chat-debug-cache-empty"));
      empty.textContent = localize("chatDebug.cache.noTurns", "No model turns recorded for this session yet.");
      return;
    }
    const agentCounts = computeAgentCounts(this.allModelTurns);
    if (this.selectedAgents === void 0) {
      this.selectedAgents = defaultAgentSelection(agentCounts);
    }
    this.renderRailToolbar(agentCounts);
    this.modelTurns = this.allModelTurns.filter((t) => this.selectedAgents.has(agentKey(t)));
    if (this.modelTurns.length === 0) {
      this.contentDisposables.clear();
      DOM.clearNode(this.content);
      const empty = DOM.append(this.content, $(".chat-debug-cache-empty"));
      empty.textContent = localize("chatDebug.cache.noTurnsForAgents", "No model turns match the selected agent filter.");
      return;
    }
    if (this.pendingSelectTurn) {
      this.selectedIndex = resolveFilteredSelectionIndex(this.modelTurns, this.pendingSelectTurn);
      this.pendingSelectTurn = void 0;
    }
    if (this.selectedIndex < 0 || this.selectedIndex >= this.modelTurns.length) {
      this.selectedIndex = this.modelTurns.length - 1;
    }
    this.renderRail(buildTurnGroups(this.modelTurns, userMessages));
    this.railList.scrollTop = railScrollTop;
    await this.renderContentInner(token, isCurrent);
  }
  /**
   * Render the right-hand content panel (summary, signature, options,
   * components) for the current selection. Split out of {@link render} so a
   * selection change can refresh just the content without rebuilding the
   * rail \u2014 which is what keeps keyboard focus and scroll position stable
   * while navigating turns.
   *
   * @param preserveScroll keep the content scroll position (used for zoom
   * and breakdown toggles where the selection is unchanged).
   */
  async renderContentInner(token, isCurrent, preserveScroll = false) {
    const prevScroll = preserveScroll ? this.content.scrollTop : 0;
    const bEvent = this.modelTurns[this.selectedIndex];
    const aEvent = this.selectedIndex > 0 ? this.modelTurns[this.selectedIndex - 1] : void 0;
    const report = await this.ensureSessionReport();
    if (!isCurrent()) {
      return;
    }
    if (!aEvent) {
      const b2 = await this.resolveSide(bEvent);
      if (!isCurrent()) {
        return;
      }
      this.contentDisposables.clear();
      DOM.clearNode(this.content);
      this.renderTitleRow();
      this.renderSingleSummary(b2);
      if (preserveScroll) {
        this.content.scrollTop = prevScroll;
      }
      return;
    }
    const [a, b] = await Promise.all([this.resolveSide(aEvent), this.resolveSide(bEvent)]);
    if (!isCurrent()) {
      return;
    }
    this.contentDisposables.clear();
    DOM.clearNode(this.content);
    this.renderTitleRow();
    if (report && report.pairCount > 0) {
      this.renderSessionHealth(DOM.append(this.content, $(".chat-debug-cache-session-health")), report);
    }
    const hasSignatureData = !!(a.system || a.tools || a.inputMessages.length || b.system || b.tools || b.inputMessages.length);
    if (!hasSignatureData) {
      this.renderTokenOnlySummary(a, b);
      if (preserveScroll) {
        this.content.scrollTop = prevScroll;
      }
      return;
    }
    const compareInputMessages = shouldCompareInputMessages(a, b);
    const diff = compareInputMessages ? diffPromptSignature(a.inputMessages, b.inputMessages) : diffPromptSignature([], []);
    const drift = appendToolsDrift(appendSystemDrift([...diff.drift], a.system, b.system), a.tools, b.tools);
    const { insights, optionsDiff } = this.buildInsights(a, b, diff, compareInputMessages);
    if (this.autoOpenedForIndex !== this.selectedIndex) {
      this.autoOpenedForIndex = this.selectedIndex;
      const target = primaryInsight(insights)?.component;
      if (target) {
        this.openComponents.add(target);
      }
    }
    this.renderSummary(a, b, diff, compareInputMessages, insights, optionsDiff);
    this.renderSignature(a, b, diff, compareInputMessages);
    this.renderRequestOptions(a, b);
    this.renderComponents(drift, a, b, compareInputMessages, diff.counts.identical);
    if (preserveScroll) {
      this.content.scrollTop = prevScroll;
    }
  }
  /**
   * Build the findings list for an A→B pair. Shared between the per-turn
   * content panel and the cross-turn session report.
   */
  buildInsights(a, b, diff, compareInputMessages) {
    const optionsDiff = computeOptionsDiff(a, b);
    const minutesSincePrevious = (b.event.created.getTime() - a.event.created.getTime()) / 6e4;
    const insights = computeCacheInsights({
      aModel: a.event.model,
      bModel: b.event.model,
      aSystem: a.system,
      bSystem: b.system,
      aTools: a.tools,
      bTools: b.tools,
      aMessages: a.inputMessages,
      bMessages: b.inputMessages,
      diff,
      optionsDiff: optionsDiff.map((d) => ({ key: d.key, previousLabel: formatOptionValue(d.previous), currentLabel: formatOptionValue(d.current) })),
      hitPct: computeCacheHit(b.event),
      inputTokens: b.event.inputTokens ?? 0,
      minutesSincePrevious: Number.isFinite(minutesSincePrevious) && minutesSincePrevious >= 0 ? minutesSincePrevious : void 0,
      isContinuation: b.requestShape.isContinuation,
      previousIsContinuation: a.requestShape.isContinuation,
      compareInputMessages
    });
    return { insights, optionsDiff };
  }
  /**
   * Memoization key for the session report. The report is scoped to the
   * turns up to (and including) the selected one, so it is stable while
   * later requests stream in. Undefined when there is nothing to report
   * (no session, or fewer than two turns in scope).
   *
   * Every in-scope turn contributes its identity AND token counts to the
   * key — endpoints alone would miss a middle turn replaced in place, and
   * token counts live on the event (not the id-cached resolved content),
   * so a usage update arriving after the first render must invalidate the
   * memoized report or the overall hit rate stays stale.
   */
  sessionReportKey() {
    if (!this.currentSessionResource || this.selectedIndex < 1) {
      return void 0;
    }
    const parts = [
      this.currentSessionResource.toString(),
      [...this.selectedAgents ?? []].sort().join(",")
    ];
    for (let i = 0; i <= this.selectedIndex; i++) {
      const turn = this.modelTurns[i];
      parts.push(`${turn.id ?? turn.created.getTime()}:${turn.inputTokens ?? ""}:${turn.cachedTokens ?? ""}`);
    }
    return parts.join("|");
  }
  /**
   * Run the insights engine over every consecutive turn pair up to the
   * selected turn and aggregate the outcome. Memoized per (session,
   * selection prefix, agent filter) — per-turn resolution is cached in
   * {@link resolvedCache}, so even a cold run is one pass over in-memory
   * events.
   */
  async ensureSessionReport() {
    const key = this.sessionReportKey();
    if (key === void 0) {
      return void 0;
    }
    const cached = this.sessionReportCache?.key === key ? this.sessionReportCache.report : void 0;
    if (cached) {
      return cached;
    }
    const scopedTurns = this.modelTurns.slice(0, this.selectedIndex + 1);
    const sides = await Promise.all(scopedTurns.map((t) => this.resolveSide(t)));
    const pairs = [];
    for (let i = 1; i < sides.length; i++) {
      const a = sides[i - 1];
      const b = sides[i];
      const compare = shouldCompareInputMessages(a, b);
      const diff = compare ? diffPromptSignature(a.inputMessages, b.inputMessages) : diffPromptSignature([], []);
      const { insights } = this.buildInsights(a, b, diff, compare);
      const inputTokens = b.event.inputTokens ?? 0;
      const cachedTokens = b.event.cachedTokens ?? 0;
      pairs.push({
        turnIndex: i,
        category: categorizeCacheBreak(insights),
        lostTokens: Math.max(0, inputTokens - cachedTokens)
      });
    }
    const turnTokens = scopedTurns.map((t) => ({ inputTokens: t.inputTokens ?? 0, cachedTokens: t.cachedTokens ?? 0 }));
    const report = buildSessionCacheReport(pairs, turnTokens);
    this.sessionReportCache = { key, report };
    return report;
  }
  /** Render the session-level cache health card from the cross-turn report. */
  renderSessionHealth(container, report) {
    DOM.append(container, $(".chat-debug-cache-card-h", void 0, localize("chatDebug.cache.sessionHealth", "Session cache health")));
    if (report.overall) {
      const headline = DOM.append(container, $(".chat-debug-cache-card-headline"));
      headline.textContent = localize("chatDebug.cache.sessionOverallHit", "{0}% overall cache hit", formatCachePct(report.overall.hitPct));
      const sub = DOM.append(container, $(".chat-debug-cache-card-sub"));
      sub.textContent = localize(
        "chatDebug.cache.sessionOverallSub",
        "{0} of {1} input tokens served from cache across {2} requests (token-weighted)",
        numberFormatter.value.format(report.overall.cachedTokens),
        numberFormatter.value.format(report.overall.inputTokens),
        report.overall.turnCount
      );
    }
    const statsLine = DOM.append(container, $(".chat-debug-cache-session-health-stats"));
    statsLine.textContent = report.avoidableLostTokens > 0 ? localize(
      "chatDebug.cache.sessionHealthStatsLost",
      "{0} of {1} request pairs healthy \xB7 ~{2} tokens recomputed avoidably",
      report.healthyCount,
      report.pairCount,
      numberFormatter.value.format(report.avoidableLostTokens)
    ) : localize(
      "chatDebug.cache.sessionHealthStats",
      "{0} of {1} request pairs healthy",
      report.healthyCount,
      report.pairCount
    );
    if (report.byCategory.length > 0) {
      const chips = DOM.append(container, $(".chat-debug-cache-session-health-chips"));
      for (const stat of report.byCategory) {
        const chip = DOM.append(chips, $(`span.chat-debug-cache-session-health-chip.cause-${stat.category}`));
        DOM.append(chip, $(`span.codicon.codicon-${categoryIcon(stat.category)}`, { "aria-hidden": "true" }));
        DOM.append(chip, $("span", void 0, localize("chatDebug.cache.sessionHealthChip", "{0} \xD7{1} \xB7 {2} tok", cacheBreakCategoryLabel(stat.category), stat.count, numberFormatter.value.format(stat.lostTokens))));
      }
    }
    if (report.findings.length > 0) {
      const list = DOM.append(container, $(".chat-debug-cache-findings"));
      for (const finding of report.findings) {
        this.renderFinding(list, finding);
      }
    }
  }
  /**
   * Select a turn (the B side of the diff) and refresh only the content
   * panel. The rail is updated in place \u2014 just the selected classes move \u2014
   * so clicking or arrowing through turns never rebuilds the list, keeping
   * focus and scroll position stable.
   */
  selectTurn(index, focusOptions) {
    if (index < 0 || index >= this.modelTurns.length || index === this.selectedIndex) {
      return;
    }
    const prevRow = this.railRowsByIndex.get(this.selectedIndex);
    if (prevRow) {
      prevRow.classList.remove("is-selected");
      prevRow.removeAttribute("aria-current");
    }
    this.selectedIndex = index;
    const nextRow = this.railRowsByIndex.get(index);
    if (nextRow) {
      nextRow.classList.add("is-selected");
      nextRow.setAttribute("aria-current", "true");
      if (focusOptions) {
        nextRow.focus(focusOptions);
      }
    }
    const token = ++this.renderToken;
    void this.renderContentInner(token, () => token === this.renderToken);
  }
  /** Move the selection to the previous/next visible turn row (arrow keys). */
  moveSelection(delta) {
    const indices = [...this.railRowsByIndex.keys()];
    if (indices.length === 0) {
      return;
    }
    const pos = indices.indexOf(this.selectedIndex);
    const nextPos = pos === -1 ? delta > 0 ? 0 : indices.length - 1 : Math.min(indices.length - 1, Math.max(0, pos + delta));
    this.selectTurn(indices[nextPos], { preventScroll: false });
  }
  /**
   * Render the agent filter dropdown at the top of the rail. Hidden when a
   * session only used a single agent (nothing to filter).
   */
  renderRailToolbar(agentCounts) {
    const agents = [...agentCounts.keys()];
    if (agents.length <= 1) {
      DOM.hide(this.railToolbar);
      return;
    }
    DOM.show(this.railToolbar);
    const selected = this.selectedAgents ?? new Set(agents);
    const selectedCount = agents.filter((a) => selected.has(a)).length;
    const label = DOM.append(this.railToolbar, $("span.chat-debug-cache-filter-label"));
    label.textContent = localize("chatDebug.cache.filterAgentsLabel", "Agent");
    const button = DOM.append(this.railToolbar, $("button.chat-debug-cache-filter-button"));
    button.setAttribute("aria-haspopup", "menu");
    const summary = selectedCount === agents.length ? localize("chatDebug.cache.filterAll", "All agents ({0})", agents.length) : selectedCount === 1 ? agents.find((a) => selected.has(a)) ?? "" : localize("chatDebug.cache.filterSome", "{0} of {1} agents", selectedCount, agents.length);
    const text = DOM.append(button, $("span.chat-debug-cache-filter-button-text"));
    text.textContent = summary;
    text.title = summary;
    DOM.append(button, $("span.codicon.codicon-chevron-down.chat-debug-cache-filter-chevron", { "aria-hidden": "true" }));
    this.railDisposables.add(DOM.addDisposableListener(button, DOM.EventType.CLICK, () => this.showAgentFilterMenu(button, agentCounts)));
  }
  showAgentFilterMenu(anchor, agentCounts) {
    const agents = [...agentCounts.keys()].sort((a, b) => a.localeCompare(b));
    const selected = this.selectedAgents ?? new Set(agents);
    const agentActions = agents.map((agent) => toAction({
      id: `chatDebug.cache.agent.${agent}`,
      label: localize("chatDebug.cache.agentItem", "{0} ({1})", agent, agentCounts.get(agent) ?? 0),
      checked: selected.has(agent),
      run: () => this.toggleAgent(agent)
    }));
    const selectAll = toAction({
      id: "chatDebug.cache.agentSelectAll",
      label: localize("chatDebug.cache.selectAllAgents", "Show All Agents"),
      run: () => this.setAgentSelection(new Set(agents))
    });
    this.contextMenuService.showContextMenu({
      getAnchor: () => anchor,
      getActions: () => [selectAll, new Separator(), ...agentActions]
    });
  }
  /** Toggle a single agent on/off. Never leaves the selection empty. */
  toggleAgent(agent) {
    const agents = [...computeAgentCounts(this.allModelTurns).keys()];
    const next = new Set(this.selectedAgents ?? agents);
    if (next.has(agent)) {
      next.delete(agent);
    } else {
      next.add(agent);
    }
    this.setAgentSelection(next.size === 0 ? new Set(agents) : next);
  }
  setAgentSelection(agents) {
    this.pendingSelectTurn = this.modelTurns[this.selectedIndex];
    this.selectedAgents = agents;
    this.render();
  }
  /**
   * Render a collapsible per-chunk breakdown table. Lists every signature
   * chunk (including identical ones the bar may hide) with its exact char
   * count on each side and its share of the current request \u2014 i.e. where the
   * bytes are allocated.
   */
  renderChunkBreakdown(section, rows, totalA, totalB, bTokensPerChar) {
    const wrap = DOM.append(section, $(".chat-debug-cache-sig-breakdown"));
    if (this.sigBreakdownOpen) {
      wrap.classList.add("open");
    }
    const toggle = DOM.append(wrap, $("button.chat-debug-cache-sig-breakdown-toggle"));
    toggle.setAttribute("aria-expanded", this.sigBreakdownOpen ? "true" : "false");
    DOM.append(toggle, $("span.codicon.codicon-chevron-right.chat-debug-cache-sig-breakdown-chev", { "aria-hidden": "true" }));
    DOM.append(toggle, $("span", void 0, localize("chatDebug.cache.chunkBreakdown", "Chunk breakdown")));
    this.contentDisposables.add(DOM.addDisposableListener(toggle, DOM.EventType.CLICK, () => {
      this.sigBreakdownOpen = !this.sigBreakdownOpen;
      const token = ++this.renderToken;
      void this.renderContentInner(token, () => token === this.renderToken, true);
    }));
    if (!this.sigBreakdownOpen) {
      return;
    }
    const table = DOM.append(wrap, $(".chat-debug-cache-sig-breakdown-table", { role: "table" }));
    const head = DOM.append(table, $(".chat-debug-cache-sig-breakdown-row.head", { role: "row" }));
    DOM.append(head, $(".cell.idx", { role: "columnheader" }, localize("chatDebug.cache.chunkIdxCol", "#")));
    DOM.append(head, $(".cell.chunk", { role: "columnheader" }, localize("chatDebug.cache.chunkCol", "Chunk")));
    DOM.append(head, $(".cell.num", { role: "columnheader" }, localize("chatDebug.cache.prevCol", "Previous")));
    DOM.append(head, $(".cell.num", { role: "columnheader" }, localize("chatDebug.cache.currCol", "Current")));
    DOM.append(head, $(".cell.num", { role: "columnheader" }, localize("chatDebug.cache.tokCol", "\u2248 tok")));
    DOM.append(head, $(".cell.num", { role: "columnheader" }, localize("chatDebug.cache.pctCol", "% of current")));
    rows.forEach((r, i) => {
      const row = DOM.append(table, $(".chat-debug-cache-sig-breakdown-row", { role: "row" }));
      if (r.drift) {
        row.classList.add("is-drift");
      }
      DOM.append(row, $(".cell.idx", { role: "cell" }, String(i)));
      const chunk = DOM.append(row, $(".cell.chunk", { role: "cell" }));
      DOM.append(chunk, $(`span.chat-debug-cache-sig-swatch.role-${roleClass(r.role)}`, { "aria-hidden": "true" }));
      DOM.append(chunk, $("span.chat-debug-cache-sig-breakdown-chunk-label", void 0, r.label));
      DOM.append(row, $(".cell.num", { role: "cell" }, r.aChars !== void 0 ? numberFormatter.value.format(r.aChars) : "\u2014"));
      DOM.append(row, $(".cell.num", { role: "cell" }, r.bChars !== void 0 ? numberFormatter.value.format(r.bChars) : "\u2014"));
      const tok = r.bChars !== void 0 && bTokensPerChar !== void 0 ? Math.round(r.bChars * bTokensPerChar) : void 0;
      DOM.append(row, $(".cell.num", { role: "cell" }, tok !== void 0 ? numberFormatter.value.format(tok) : "\u2014"));
      const pct = r.bChars !== void 0 && totalB > 0 ? r.bChars / totalB * 100 : void 0;
      DOM.append(row, $(".cell.num", { role: "cell" }, pct !== void 0 ? localize("chatDebug.cache.pctValue", "{0}%", pct.toFixed(1)) : "\u2014"));
    });
    const totals = DOM.append(table, $(".chat-debug-cache-sig-breakdown-row.total", { role: "row" }));
    DOM.append(totals, $(".cell.idx", { role: "cell" }, ""));
    DOM.append(totals, $(".cell.chunk", { role: "cell" }, localize("chatDebug.cache.totalRow", "Total")));
    DOM.append(totals, $(".cell.num", { role: "cell" }, numberFormatter.value.format(totalA)));
    DOM.append(totals, $(".cell.num", { role: "cell" }, numberFormatter.value.format(totalB)));
    DOM.append(totals, $(".cell.num", { role: "cell" }, bTokensPerChar !== void 0 ? numberFormatter.value.format(Math.round(totalB * bTokensPerChar)) : "\u2014"));
    DOM.append(totals, $(".cell.num", { role: "cell" }, localize("chatDebug.cache.pctValue", "{0}%", "100")));
  }
  async resolveSide(event) {
    let content;
    if (event.id) {
      if (this.resolvedCache.has(event.id)) {
        content = this.resolvedCache.get(event.id);
      } else {
        const r = await this.chatDebugService.resolveEvent(event.id);
        content = r && r.kind === "modelTurn" ? r : void 0;
        this.resolvedCache.set(event.id, content);
      }
    }
    const system = findSection(content?.sections, "System");
    const tools = findSection(content?.sections, "Tools");
    const requestShapeJson = findSection(content?.sections, "Request Shape");
    const inputMessagesJson = findSection(content?.sections, "Input Messages");
    const rawMessages = parseInputMessages(inputMessagesJson);
    let stripFrom = 0;
    if (system) {
      while (stripFrom < rawMessages.length && rawMessages[stripFrom].role === "system") {
        stripFrom++;
      }
    }
    const inputMessages = stripFrom > 0 ? rawMessages.slice(stripFrom) : rawMessages;
    return { event, content, system, tools, inputMessages, requestShape: describeRequestShape(inputMessages, requestShapeJson) };
  }
  renderRail(groups) {
    const gapBefore = (turnIndex) => {
      if (turnIndex <= 0) {
        return void 0;
      }
      const prev = this.modelTurns[turnIndex - 1];
      const curr = this.modelTurns[turnIndex];
      const prevEnd = prev.created.getTime() + (prev.durationInMillis ?? 0);
      const gapMinutes = (curr.created.getTime() - prevEnd) / 6e4;
      return gapMinutes >= TTL_GAP_MINUTES ? gapMinutes : void 0;
    };
    const appendGapMarker = (gapMinutes) => {
      const gap = DOM.append(this.railList, $(".chat-debug-cache-rail-gap"));
      DOM.append(gap, $("span.codicon.codicon-clock", { "aria-hidden": "true" }));
      DOM.append(gap, $("span", void 0, localize("chatDebug.cache.railGap", "{0} min idle \xB7 cache likely expired", gapMinutes.toFixed(1))));
    };
    for (const group of groups) {
      const collapsed = this.collapsedGroups.has(group.key);
      const groupGap = group.turns.length > 0 ? gapBefore(group.turns[0].index) : void 0;
      if (groupGap !== void 0) {
        appendGapMarker(groupGap);
      }
      const header = DOM.append(this.railList, $(".chat-debug-cache-group-header"));
      if (collapsed) {
        header.classList.add("is-collapsed");
      }
      header.tabIndex = 0;
      header.setAttribute("role", "button");
      header.setAttribute("aria-expanded", collapsed ? "false" : "true");
      header.title = localize("chatDebug.cache.toggleGroup", "Toggle group");
      const topLine = DOM.append(header, $(".chat-debug-cache-group-top"));
      DOM.append(topLine, $("span.chat-debug-cache-group-chev"));
      const headerLine = DOM.append(topLine, $(".chat-debug-cache-group-prompt"));
      headerLine.textContent = group.userMessage?.message?.trim() || localize("chatDebug.cache.unknownPrompt", "(no prompt captured)");
      const countBadge = DOM.append(topLine, $("span.chat-debug-cache-group-count"));
      countBadge.textContent = String(group.turns.length);
      const headerMeta = DOM.append(header, $(".chat-debug-cache-group-meta"));
      headerMeta.textContent = group.key;
      headerMeta.title = localize("chatDebug.cache.requestIdTooltip", "Request id: {0}", group.key);
      const toggle = () => {
        if (this.collapsedGroups.has(group.key)) {
          this.collapsedGroups.delete(group.key);
        } else {
          this.collapsedGroups.add(group.key);
        }
        this.refresh();
      };
      this.railDisposables.add(DOM.addDisposableListener(header, DOM.EventType.CLICK, toggle));
      this.railDisposables.add(DOM.addDisposableListener(header, DOM.EventType.KEY_DOWN, (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }));
      if (collapsed) {
        continue;
      }
      for (const [posInGroup, { turn: evt, index: i }] of group.turns.entries()) {
        if (posInGroup > 0) {
          const gap = gapBefore(i);
          if (gap !== void 0) {
            appendGapMarker(gap);
          }
        }
        const row = DOM.append(this.railList, $(".chat-debug-cache-turn"));
        this.railRowsByIndex.set(i, row);
        if (i === this.selectedIndex) {
          row.classList.add("is-selected");
        }
        const idx = DOM.append(row, $(".chat-debug-cache-turn-idx"));
        idx.textContent = String(i).padStart(2, " ");
        const main = DOM.append(row, $(".chat-debug-cache-turn-main"));
        const top = DOM.append(main, $(".chat-debug-cache-turn-top"));
        const source = DOM.append(top, $("span.chat-debug-cache-turn-source"));
        source.textContent = evt.requestName || localize("chatDebug.cache.modelTurn", "Model Turn");
        if (evt.inputTokens) {
          const hit = computeCacheHit(evt);
          const hitChip = DOM.append(top, $(
            "span.chat-debug-cache-turn-chip.chat-debug-cache-turn-hit",
            void 0,
            localize("chatDebug.cache.hitChip", "[cache {0}%]", formatCachePctInt(hit))
          ));
          if (hit < 90) {
            hitChip.classList.add("is-bad");
          }
        }
        if (evt.durationInMillis !== void 0) {
          DOM.append(top, $("span.chat-debug-cache-turn-chip", void 0, localize("chatDebug.cache.msChip", "[{0}ms]", numberFormatter.value.format(Math.round(evt.durationInMillis)))));
        }
        DOM.append(top, $("span.chat-debug-cache-turn-chip", void 0, `[${timeFormatter.value.format(evt.created)}]`));
        if (evt.model) {
          const sub = DOM.append(main, $(".chat-debug-cache-turn-sub"));
          sub.textContent = evt.model;
        }
        row.title = localize("chatDebug.cache.turnHelp", "Click to compare this request against the previous one");
        row.tabIndex = 0;
        row.setAttribute("role", "button");
        if (i === this.selectedIndex) {
          row.setAttribute("aria-current", "true");
        }
        row.setAttribute("aria-label", localize("chatDebug.cache.turnAria", "Turn {0}: {1}", i, evt.requestName ?? evt.model ?? localize("chatDebug.cache.modelTurn", "Model Turn")));
        this.railDisposables.add(DOM.addDisposableListener(row, DOM.EventType.CLICK, () => this.selectTurn(i, { preventScroll: true })));
        this.railDisposables.add(DOM.addDisposableListener(row, DOM.EventType.KEY_DOWN, (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            this.selectTurn(i, { preventScroll: true });
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            this.moveSelection(1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            this.moveSelection(-1);
          }
        }));
      }
    }
  }
  renderTitleRow() {
    const titleRow = DOM.append(this.content, $(".chat-debug-cache-title-row"));
    const title = DOM.append(titleRow, $("h2.chat-debug-cache-title"));
    title.textContent = localize("chatDebug.cacheExplorer.title", "Cache Explorer \u2014 Prefix Diff");
  }
  renderSummary(a, b, diff, compareInputMessages, insights, optionsDiff) {
    const row = DOM.append(this.content, $(".chat-debug-cache-summary"));
    row.appendChild(this.renderSideCard(a, localize("chatDebug.cache.previousRequest", "Previous request")));
    row.appendChild(this.renderSideCard(b, localize("chatDebug.cache.requestTitle", "Request")));
    const hit = computeCacheHit(b.event);
    const breakCard = DOM.append(row, $(".chat-debug-cache-card.break"));
    breakCard.classList.add(`is-${maxInsightSeverity(insights)}`);
    DOM.append(breakCard, $(".chat-debug-cache-card-h", void 0, localize("chatDebug.cache.performance", "Cache performance")));
    const primary = primaryInsight(insights);
    const headline = DOM.append(breakCard, $(".chat-debug-cache-card-headline"));
    headline.textContent = primary ? localize("chatDebug.cache.hitHeadlineVerdict", "{0}% cache hit \u2014 {1}", formatCachePct(hit), primary.title) : localize("chatDebug.cache.hitHeadline", "{0}% cache hit", formatCachePct(hit));
    this.appendTokensReusedLine(breakCard, b.event);
    if (b.requestShape.description) {
      const shapeLine = DOM.append(breakCard, $(".chat-debug-cache-perf-line.chat-debug-cache-request-shape-note"));
      shapeLine.textContent = b.requestShape.description;
    }
    DOM.append(breakCard, $(".chat-debug-cache-perf-rule"));
    DOM.append(breakCard, $(".chat-debug-cache-perf-section-h", void 0, localize("chatDebug.cache.findings", "Findings")));
    const list = DOM.append(breakCard, $(".chat-debug-cache-findings"));
    if (insights.length === 0) {
      DOM.append(list, $(".chat-debug-cache-finding-detail", void 0, localize("chatDebug.cache.noFindings", "No findings for this request pair.")));
    }
    for (const insight of insights) {
      this.renderFinding(list, insight);
    }
    if (compareInputMessages) {
      DOM.append(breakCard, $(".chat-debug-cache-perf-rule"));
      DOM.append(breakCard, $(".chat-debug-cache-perf-section-h", void 0, localize("chatDebug.cache.diffSummary", "Diff summary")));
      const summaryLine = DOM.append(breakCard, $(".chat-debug-cache-perf-line"));
      const inPlaceChanged = diff.counts.contentDrift + diff.counts.lengthChange;
      const addedInB = diff.counts.onlyInB;
      const droppedFromA = diff.counts.onlyInA;
      const parts = [
        localize("chatDebug.cache.summaryIdentical", "{0} identical", diff.counts.identical),
        localize("chatDebug.cache.summaryChanged", "{0} in-place changed", inPlaceChanged)
      ];
      if (addedInB > 0) {
        parts.push(localize("chatDebug.cache.summaryAdded", "{0} added in this request", addedInB));
      }
      if (droppedFromA > 0) {
        parts.push(localize("chatDebug.cache.summaryDropped", "{0} dropped from previous", droppedFromA));
      }
      summaryLine.textContent = parts.join(" \xB7 ");
    }
    if (optionsDiff.length > 0) {
      const optsLine = DOM.append(this.content, $(".chat-debug-cache-options-banner"));
      optsLine.textContent = localize(
        "chatDebug.cache.optionsBanner",
        "Options changed: {0}",
        optionsDiff.map((d) => `${d.key} (${formatOptionValue(d.previous)} \u2192 ${formatOptionValue(d.current)})`).join(", ")
      );
    }
  }
  /**
   * Render one finding row: severity icon, title, evidence, and hint.
   * Findings that point at a Components entry render as a button that
   * reveals (scrolls to, expands, and flashes) that component.
   */
  renderFinding(list, insight) {
    const isLink = !!insight.component;
    const row = DOM.append(list, isLink ? $("button.chat-debug-cache-finding.is-clickable", { type: "button" }) : $(".chat-debug-cache-finding"));
    DOM.append(row, $(`span.codicon.codicon-${findingIcon(insight.severity)}.chat-debug-cache-finding-icon.is-${insight.severity}`, { "aria-hidden": "true" }));
    const body = DOM.append(row, $(".chat-debug-cache-finding-body"));
    DOM.append(body, $(".chat-debug-cache-finding-title", void 0, insight.title));
    if (insight.detail) {
      DOM.append(body, $(".chat-debug-cache-finding-detail", void 0, insight.detail));
    }
    if (insight.hint) {
      DOM.append(body, $(".chat-debug-cache-finding-hint", void 0, insight.hint));
    }
    if (isLink) {
      row.title = localize("chatDebug.cache.findingJump", "Reveal {0} in Components", insight.component);
      this.contentDisposables.add(DOM.addDisposableListener(row, DOM.EventType.CLICK, () => this.revealComponent(insight.component)));
    }
  }
  /**
   * Scroll the named Components entry into view, expand it, and flash it so
   * the eye lands on the right place. No-op when the component isn't part
   * of the current drift list (e.g. an identical message).
   */
  revealComponent(name) {
    const entry = this.componentElements.get(name);
    if (!entry) {
      return;
    }
    const { item, head } = entry;
    if (!this.openComponents.has(name)) {
      this.openComponents.add(name);
      item.classList.add("open");
      head.setAttribute("aria-expanded", "true");
    }
    item.scrollIntoView({ behavior: "smooth", block: "start" });
    item.classList.remove("flash");
    void item.offsetWidth;
    item.classList.add("flash");
    head.focus({ preventScroll: true });
  }
  renderSideCard(data, title) {
    const card = $(".chat-debug-cache-card");
    if (title) {
      DOM.append(card, $(".chat-debug-cache-card-h", void 0, title));
    }
    this.appendKv(card, localize("chatDebug.cache.model", "model"), data.event.model ?? "\u2014");
    this.appendKv(card, localize("chatDebug.cache.inputTok", "input tok"), formatTokens(data.event.inputTokens));
    this.appendKv(card, localize("chatDebug.cache.cachedTok", "cached tok"), formatTokens(data.event.cachedTokens));
    this.appendKv(card, localize("chatDebug.cache.cacheHit", "cache hit"), `${formatCachePct(computeCacheHit(data.event))}%`);
    this.appendKv(card, localize("chatDebug.cache.requestShape", "shape"), data.requestShape.label);
    const startTime = data.event.created;
    const endTime = data.event.durationInMillis !== void 0 ? new Date(startTime.getTime() + data.event.durationInMillis) : void 0;
    this.appendKv(card, localize("chatDebug.cache.startTime", "startTime"), startTime.toISOString(), true);
    if (endTime) {
      this.appendKv(card, localize("chatDebug.cache.endTime", "endTime"), endTime.toISOString(), true);
    }
    if (data.event.durationInMillis !== void 0) {
      this.appendKv(card, localize("chatDebug.cache.duration", "duration"), `${numberFormatter.value.format(Math.round(data.event.durationInMillis))}ms`);
    }
    const ttft = data.content?.timeToFirstTokenInMillis;
    if (ttft !== void 0) {
      this.appendKv(card, localize("chatDebug.cache.ttft", "timeToFirstToken"), `${numberFormatter.value.format(Math.round(ttft))}ms`);
    }
    const requestId = data.content?.requestId ?? data.event.parentEventId ?? data.event.id;
    if (requestId) {
      this.appendKv(card, localize("chatDebug.cache.requestId", "requestId"), requestId, true);
    }
    return card;
  }
  /**
   * Render the summary cards alone when there is no prior turn to diff
   * against (e.g. the first request in a brand-new session). The OTel-
   * reported cache hit is still useful here — the system prompt and tool
   * definitions can already be cached from previous sessions.
   */
  renderSingleSummary(b) {
    const row = DOM.append(this.content, $(".chat-debug-cache-summary"));
    row.appendChild(this.renderSideCard(b, localize("chatDebug.cache.requestTitle", "Request")));
    const note = DOM.append(row, $(".chat-debug-cache-card.break"));
    DOM.append(note, $(".chat-debug-cache-card-h", void 0, localize("chatDebug.cache.firstRequest", "First request in session")));
    const headline = DOM.append(note, $(".chat-debug-cache-card-headline"));
    headline.textContent = `${formatCachePct(computeCacheHit(b.event))}%`;
    const sub = DOM.append(note, $(".chat-debug-cache-card-sub"));
    sub.textContent = localize("chatDebug.cache.firstRequestNote", "OTel-reported cache hit. Nothing earlier in this session to diff against \u2014 the system prompt and tools may still match a previous session's cache.");
    if (b.requestShape.description) {
      const shapeLine = DOM.append(note, $(".chat-debug-cache-perf-line.chat-debug-cache-request-shape-note"));
      shapeLine.textContent = b.requestShape.description;
    }
  }
  /**
   * Render the token-based cache performance for a request pair when the
   * request-side prompt signature (system, tools, input messages) was not
   * captured for the session — e.g. agent-host (Copilot CLI) sessions, whose
   * log records the model's output but not the request sent to it. The reported
   * cache-hit numbers are still accurate, but there is nothing to diff, so the
   * divergence-based root-cause analysis is deliberately skipped.
   */
  renderTokenOnlySummary(a, b) {
    const row = DOM.append(this.content, $(".chat-debug-cache-summary"));
    row.appendChild(this.renderSideCard(a, localize("chatDebug.cache.previousRequest", "Previous request")));
    row.appendChild(this.renderSideCard(b, localize("chatDebug.cache.requestTitle", "Request")));
    const card = DOM.append(row, $(".chat-debug-cache-card.break"));
    DOM.append(card, $(".chat-debug-cache-card-h", void 0, localize("chatDebug.cache.performance", "Cache performance")));
    const headline = DOM.append(card, $(".chat-debug-cache-card-headline"));
    headline.textContent = localize("chatDebug.cache.hitHeadline", "{0}% cache hit", formatCachePct(computeCacheHit(b.event)));
    this.appendTokensReusedLine(card, b.event);
    DOM.append(card, $(".chat-debug-cache-perf-rule"));
    const note = DOM.append(card, $(".chat-debug-cache-perf-line.chat-debug-cache-request-shape-note"));
    note.textContent = localize("chatDebug.cache.noSignatureNote", "The request-side prompt (system instructions, tool catalog, and input messages) was not captured for this session, so the prompt-signature diff and root-cause findings are unavailable. The cache-hit numbers above come from reported token usage.");
  }
  /** Appends the "{cached} of {input} input tokens reused" sub-line for a request. */
  appendTokensReusedLine(parent, event) {
    const inputTokens = event.inputTokens ?? 0;
    const cachedTokens = event.cachedTokens ?? 0;
    const lostTokens = Math.max(0, inputTokens - cachedTokens);
    const line = DOM.append(parent, $(".chat-debug-cache-card-sub"));
    line.textContent = lostTokens > 0 && inputTokens > 0 ? localize(
      "chatDebug.cache.tokensReusedLost",
      "{0} of {1} input tokens reused \xB7 {2} uncached ({3}%)",
      numberFormatter.value.format(cachedTokens),
      numberFormatter.value.format(inputTokens),
      numberFormatter.value.format(lostTokens),
      formatCachePct(lostTokens / inputTokens * 100)
    ) : localize(
      "chatDebug.cache.tokensReused",
      "{0} of {1} input tokens reused",
      numberFormatter.value.format(cachedTokens),
      numberFormatter.value.format(inputTokens)
    );
  }
  appendKv(parent, key, value, copyable = false) {
    const row = DOM.append(parent, $(".chat-debug-cache-kv"));
    DOM.append(row, $("span.k", void 0, key));
    const valueEl = DOM.append(row, $("span.v", void 0, value));
    if (copyable) {
      valueEl.classList.add("chat-debug-cache-request-id");
      valueEl.title = value;
    }
  }
  renderSignature(a, b, diff, compareInputMessages) {
    const continuationComparison = b.requestShape.isContinuation;
    const section = DOM.append(this.content, $(".chat-debug-cache-section"));
    const heading = DOM.append(section, $("h3.chat-debug-cache-section-h"));
    heading.textContent = continuationComparison ? localize("chatDebug.cache.visibleSignatureHeading", "Visible Request Signature") : localize("chatDebug.cache.signatureHeading", "Prompt Signature");
    if (continuationComparison) {
      const note = DOM.append(section, $(".chat-debug-cache-sig-summary.chat-debug-cache-request-shape-note"));
      note.textContent = localize("chatDebug.cache.visibleSignatureNote", "For Responses API continuations, this shows the captured request inputs: system instructions, tools sent on this request, and the visible input delta. Earlier conversation state is referenced by previous response id and is not expanded here.");
    }
    const legend = DOM.append(section, $(".chat-debug-cache-sig-legend"));
    for (const role of ["system", "user", "assistant", "tool", "tool_search", "tools"]) {
      const entry = DOM.append(legend, $("span.chat-debug-cache-sig-legend-entry"));
      DOM.append(entry, $(`span.chat-debug-cache-sig-swatch.role-${roleClass(role)}`));
      DOM.append(entry, DOM.$("span", void 0, role === "tools" ? localize("chatDebug.cache.legend.tools", "tools (catalog)") : role === "tool_search" ? localize("chatDebug.cache.legend.toolSearch", "tool search") : role));
    }
    const driftEntry = DOM.append(legend, $("span.chat-debug-cache-sig-legend-entry"));
    DOM.append(driftEntry, $("span.chat-debug-cache-sig-swatch.role-drift"));
    DOM.append(driftEntry, DOM.$("span", void 0, localize("chatDebug.cache.driftLegend", "drift")));
    const groupEntry = DOM.append(legend, $("span.chat-debug-cache-sig-legend-entry"));
    DOM.append(groupEntry, $("span.chat-debug-cache-sig-swatch.role-coalesced"));
    DOM.append(groupEntry, DOM.$("span", void 0, localize("chatDebug.cache.groupLegend", "small messages (grouped)")));
    const toSegments = (side, isA) => {
      const segs = [];
      const sys = side.system;
      if (sys) {
        const other = isA ? b.system : a.system;
        segs.push({ role: "system", chars: sys.length, drift: sys !== (other ?? ""), label: "system", synthetic: true, component: "system" });
      }
      const tools = side.tools;
      if (tools) {
        const other = isA ? b.tools : a.tools;
        segs.push({ role: "tools", chars: tools.length, drift: tools !== (other ?? ""), label: "tools", synthetic: true, component: "tools" });
      }
      side.inputMessages.forEach((m, i) => {
        const tok = diff.signature[i];
        const kind = tok?.kind;
        const drift = compareInputMessages && (kind === CacheDiffKind.ContentDrift || kind === CacheDiffKind.LengthChange || isA && kind === CacheDiffKind.OnlyInA || !isA && kind === CacheDiffKind.OnlyInB);
        segs.push({ role: m.role, chars: m.charLength, drift, label: m.name ? `${m.role}-${m.name}` : m.role, synthetic: false, component: `messages[${i}]` });
      });
      return segs;
    };
    const aSegs = toSegments(a, true);
    const bSegs = toSegments(b, false);
    const totalA = aSegs.reduce((s, x) => s + x.chars, 0);
    const totalB = bSegs.reduce((s, x) => s + x.chars, 0);
    const max = Math.max(totalA, totalB, 1);
    const breakCharPos = (segs) => {
      if (!diff.break) {
        return void 0;
      }
      let cumulative = 0;
      let idx = 0;
      for (const s of segs) {
        if (s.synthetic) {
          cumulative += s.chars;
          continue;
        }
        if (idx === diff.break.index) {
          return cumulative;
        }
        cumulative += s.chars;
        idx++;
      }
      return void 0;
    };
    const aTokensPerChar = a.event.inputTokens && totalA > 0 ? a.event.inputTokens / totalA : void 0;
    const bTokensPerChar = b.event.inputTokens && totalB > 0 ? b.event.inputTokens / totalB : void 0;
    const buildLane = (label, segs, breakPos, tokensPerChar) => {
      const row = $(".chat-debug-cache-sig-lane-row");
      DOM.append(row, $(".chat-debug-cache-sig-lane-label", void 0, label));
      const bar = DOM.append(row, $(".chat-debug-cache-sig-bar"));
      const sideTotal = segs.reduce((sum, s) => sum + s.chars, 0);
      const sizeText = (chars) => tokensPerChar !== void 0 ? localize("chatDebug.cache.segSizeTokens", "{0} chars (\u2248 {1} tok)", numberFormatter.value.format(chars), numberFormatter.value.format(Math.round(chars * tokensPerChar))) : localize("chatDebug.cache.segSizeChars", "{0} chars", numberFormatter.value.format(chars));
      const renderSegment = (s) => {
        const seg = DOM.append(bar, $(`span.chat-debug-cache-sig-seg.role-${roleClass(s.role)}`));
        if (s.drift) {
          seg.classList.add("is-drift");
          seg.classList.add("is-clickable");
          seg.setAttribute("role", "button");
          seg.tabIndex = 0;
          const reveal = () => this.revealComponent(s.component);
          this.contentDisposables.add(DOM.addDisposableListener(seg, DOM.EventType.CLICK, reveal));
          this.contentDisposables.add(DOM.addDisposableListener(seg, DOM.EventType.KEY_DOWN, (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              reveal();
            }
          }));
        }
        seg.style.width = `${s.chars / max * 100}%`;
        seg.title = s.drift ? localize("chatDebug.cache.segDriftTooltip", "{0} ({1}): {2} \u2014 drifted. Click to inspect.", s.component, s.label, sizeText(s.chars)) : localize("chatDebug.cache.segTooltip", "{0} ({1}): {2}", s.component, s.label, sizeText(s.chars));
        if (s.drift) {
          seg.setAttribute("aria-label", seg.title);
        }
        if (s.chars > max * 0.06) {
          seg.textContent = numberFormatter.value.format(s.chars);
        }
      };
      const renderGroup = (group) => {
        if (group.length === 1) {
          renderSegment(group[0]);
          return;
        }
        const chars = group.reduce((sum, s) => sum + s.chars, 0);
        const seg = DOM.append(bar, $("span.chat-debug-cache-sig-seg.role-coalesced"));
        seg.style.width = `${chars / max * 100}%`;
        seg.title = localize("chatDebug.cache.segGroupTooltip", "{0} \u2026 {1}: {2} small messages, {3}", group[0].component, group[group.length - 1].component, group.length, sizeText(chars));
      };
      const COALESCE_THRESHOLD = max * 0.015;
      let pending = [];
      for (const s of segs) {
        if (s.chars <= 0) {
          continue;
        }
        if (!s.synthetic && !s.drift && s.chars < COALESCE_THRESHOLD) {
          pending.push(s);
          continue;
        }
        if (pending.length) {
          renderGroup(pending);
          pending = [];
        }
        renderSegment(s);
      }
      if (pending.length) {
        renderGroup(pending);
      }
      if (sideTotal < max) {
        const pad = DOM.append(bar, $("span.chat-debug-cache-sig-seg.role-empty"));
        pad.style.width = `${(max - sideTotal) / max * 100}%`;
      }
      if (breakPos !== void 0 && diff.break) {
        const line = DOM.append(bar, $(".chat-debug-cache-sig-break"));
        line.style.left = `${breakPos / max * 100}%`;
        line.title = localize("chatDebug.cache.breakLineTooltip", "Cache break at messages[{0}]", diff.break.index);
      }
      DOM.append(row, $(".chat-debug-cache-sig-lane-total", void 0, localize("chatDebug.cache.charsTotal", "{0} chars", numberFormatter.value.format(sideTotal))));
      return row;
    };
    const lanes = DOM.append(section, $(".chat-debug-cache-sig-lanes"));
    lanes.appendChild(buildLane(localize("chatDebug.cache.lanePrevious", "Previous"), aSegs, breakCharPos(aSegs), aTokensPerChar));
    lanes.appendChild(buildLane(localize("chatDebug.cache.laneCurrent", "Current"), bSegs, breakCharPos(bSegs), bTokensPerChar));
    if (compareInputMessages && totalB > 0) {
      let reused = 0;
      let sawDrift = false;
      for (const s of bSegs) {
        if (s.drift) {
          sawDrift = true;
          break;
        }
        reused += s.chars;
      }
      if (!sawDrift) {
        reused = totalB;
      }
      const railRow = DOM.append(lanes, $(".chat-debug-cache-sig-lane-row.reuse"));
      DOM.append(railRow, $(".chat-debug-cache-sig-lane-label", void 0, localize("chatDebug.cache.reuseLane", "Match")));
      const rail = DOM.append(railRow, $(".chat-debug-cache-sig-reuse-rail"));
      if (reused > 0) {
        const ok = DOM.append(rail, $("span.chat-debug-cache-sig-reuse-seg.is-reused"));
        ok.style.width = `${reused / max * 100}%`;
        ok.title = localize("chatDebug.cache.reusedTooltip", "Byte-identical to the previous request: {0} chars can be served from cache", numberFormatter.value.format(reused));
      }
      if (totalB - reused > 0) {
        const bad = DOM.append(rail, $("span.chat-debug-cache-sig-reuse-seg.is-recomputed"));
        bad.style.width = `${(totalB - reused) / max * 100}%`;
        bad.title = localize("chatDebug.cache.recomputedTooltip", "Diverges from the previous request: {0} chars are recomputed", numberFormatter.value.format(totalB - reused));
      }
      DOM.append(railRow, $(".chat-debug-cache-sig-lane-total", void 0, localize("chatDebug.cache.reusePct", "{0}% match", String(Math.floor(reused / totalB * 100)))));
    }
    this.renderChunkBreakdown(section, alignSignatureChunks(aSegs, bSegs), totalA, totalB, bTokensPerChar);
    let shared = 0;
    let firstDrift;
    if (a.system || b.system) {
      if ((a.system ?? "") === (b.system ?? "")) {
        shared += b.system?.length ?? 0;
      } else {
        firstDrift = localize("chatDebug.cache.systemComponent", "system");
      }
    }
    if (!firstDrift && (a.tools || b.tools)) {
      if ((a.tools ?? "") === (b.tools ?? "")) {
        shared += b.tools?.length ?? 0;
      } else {
        firstDrift = localize("chatDebug.cache.toolsComponent", "tools catalog");
      }
    }
    if (!firstDrift) {
      for (const tok of diff.signature) {
        if (tok.kind === CacheDiffKind.Identical) {
          shared += tok.bCharLength ?? 0;
        } else {
          firstDrift = `messages[${tok.index}]`;
          break;
        }
      }
    }
    const summary = DOM.append(section, $(".chat-debug-cache-sig-summary"));
    if (firstDrift) {
      summary.textContent = continuationComparison ? localize("chatDebug.cache.visibleSignatureSummaryBreak", "{0} of {1} captured request chars match before first captured drift: {2}", numberFormatter.value.format(shared), numberFormatter.value.format(totalB), firstDrift) : localize("chatDebug.cache.signatureSummaryBreakComponent", "{0} of {1} chars reused \xB7 break at {2}", numberFormatter.value.format(shared), numberFormatter.value.format(totalB), firstDrift);
    } else {
      summary.textContent = continuationComparison ? localize("chatDebug.cache.visibleSignatureSummaryClean", "{0} of {1} captured request chars match \xB7 no captured divergence detected", numberFormatter.value.format(shared), numberFormatter.value.format(totalB)) : localize("chatDebug.cache.signatureSummaryClean", "{0} of {1} chars reused \xB7 no divergence detected", numberFormatter.value.format(shared), numberFormatter.value.format(totalB));
    }
  }
  /**
   * Render the per-key request-options table. Shows every cache-keying
   * option captured from the model provider request body, with a column
   * for the previous turn and one for the current turn. Rows whose
   * values differ are highlighted.
   */
  renderRequestOptions(a, b) {
    const prev = sideOptions(a);
    const curr = sideOptions(b);
    const keys = /* @__PURE__ */ new Set([...Object.keys(prev), ...Object.keys(curr)]);
    if (keys.size === 0) {
      return;
    }
    const section = DOM.append(this.content, $(".chat-debug-cache-section"));
    DOM.append(section, $("h3.chat-debug-cache-section-h", void 0, localize("chatDebug.cache.requestOptionsHeading", "Request Options")));
    const table = DOM.append(section, $(".chat-debug-cache-options-table"));
    const head = DOM.append(table, $(".chat-debug-cache-options-row.head"));
    DOM.append(head, $(".chat-debug-cache-options-cell.key", void 0, localize("chatDebug.cache.optionsKey", "Option")));
    DOM.append(head, $(".chat-debug-cache-options-cell", void 0, localize("chatDebug.cache.optionsPrev", "Previous")));
    DOM.append(head, $(".chat-debug-cache-options-cell", void 0, localize("chatDebug.cache.optionsCurr", "Current")));
    const sortedKeys = [...keys].sort((x, y) => x.localeCompare(y));
    for (const key of sortedKeys) {
      const row = DOM.append(table, $(".chat-debug-cache-options-row"));
      const av = prev[key];
      const bv = curr[key];
      const changed = !equals(av, bv);
      if (changed) {
        row.classList.add("changed");
      }
      DOM.append(row, $(".chat-debug-cache-options-cell.key", void 0, key));
      DOM.append(row, $(".chat-debug-cache-options-cell", void 0, formatOptionValue(av)));
      DOM.append(row, $(".chat-debug-cache-options-cell", void 0, formatOptionValue(bv)));
    }
  }
  renderComponents(drift, a, b, compareInputMessages, identicalCount) {
    this.componentElements.clear();
    const section = DOM.append(this.content, $(".chat-debug-cache-section"));
    DOM.append(section, $("h3.chat-debug-cache-section-h", void 0, localize("chatDebug.cache.componentsHeading", "Components")));
    if (!compareInputMessages && b.requestShape.isContinuation) {
      const note = DOM.append(section, $(".chat-debug-cache-sig-summary.chat-debug-cache-request-shape-note"));
      note.textContent = localize("chatDebug.cache.continuationComponentsNote", "This request uses previous_response_id, so input messages are not positionally diffed against the previous request. Components below show cache-key shape changes; the current continuation delta is shown separately.");
    }
    const acc = DOM.append(section, $(".chat-debug-cache-acc"));
    const effectiveDrift = !compareInputMessages && b.requestShape.isContinuation && b.inputMessages.length > 0 ? [...drift, currentDeltaComponent(b)] : drift;
    if (effectiveDrift.length === 0) {
      const empty = DOM.append(acc, $(".chat-debug-cache-acc-empty"));
      empty.textContent = localize("chatDebug.cache.allComponentsIdentical", "All components are identical between A and B.");
      return;
    }
    for (const c of effectiveDrift) {
      const item = DOM.append(acc, $(".chat-debug-cache-acc-item"));
      item.classList.add(c.status);
      const isOpen = this.openComponents.has(c.name);
      if (isOpen) {
        item.classList.add("open");
      }
      const head = DOM.append(item, $(".chat-debug-cache-acc-head"));
      this.componentElements.set(c.name, { item, head });
      head.tabIndex = 0;
      head.setAttribute("role", "button");
      head.setAttribute("aria-expanded", isOpen ? "true" : "false");
      DOM.append(head, $("span.chat-debug-cache-chev"));
      const name = DOM.append(head, $(".chat-debug-cache-acc-name"));
      const swatchRole = c.role ?? (c.name === "system" || c.name === "tools" ? c.name : void 0);
      if (swatchRole) {
        DOM.append(name, $(`span.chat-debug-cache-sig-swatch.role-${roleClass(swatchRole)}`, { "aria-hidden": "true" }));
      }
      if (c.role) {
        DOM.append(name, $("span.role", void 0, c.role));
      }
      DOM.append(name, DOM.$("span", void 0, c.name));
      const badge = DOM.append(head, $(`span.chat-debug-cache-acc-badge.${c.status}`));
      badge.textContent = badgeLabel(c.status);
      const sizes = DOM.append(head, $("span.chat-debug-cache-acc-sizes"));
      sizes.textContent = localize("chatDebug.cache.componentSizes", "{0} \u2192 {1} chars", formatTokens(c.aSize), formatTokens(c.bSize));
      const body = DOM.append(item, $(".chat-debug-cache-acc-body"));
      const aText = c.name === CURRENT_CONTINUATION_DELTA_COMPONENT ? "" : textForComponent(c, a);
      const bText = c.name === CURRENT_CONTINUATION_DELTA_COMPONENT ? continuationDeltaText(b) : textForComponent(c, b);
      const truncationNote = describeTruncation(aText, bText);
      if (truncationNote) {
        const note = DOM.append(item, $(".chat-debug-cache-acc-truncated"));
        note.textContent = truncationNote;
        note.title = truncationNote;
        head.title = truncationNote;
      }
      if (aText && bText && aText !== bText) {
        const dv = analyzeStringDivergence(aText, bText);
        if (dv) {
          const changeNote = DOM.append(body, $(".chat-debug-cache-acc-change-note"));
          changeNote.textContent = localize("chatDebug.cache.changeNote", "What changed: {0}", describeStringDivergence(dv));
        }
      }
      body.appendChild(this.renderComponentDiff(aText, bText, c.aSize, c.bSize));
      const toggle = () => {
        if (this.openComponents.has(c.name)) {
          this.openComponents.delete(c.name);
          item.classList.remove("open");
          head.setAttribute("aria-expanded", "false");
        } else {
          this.openComponents.add(c.name);
          item.classList.add("open");
          head.setAttribute("aria-expanded", "true");
        }
      };
      this.contentDisposables.add(DOM.addDisposableListener(head, DOM.EventType.CLICK, toggle));
      this.contentDisposables.add(DOM.addDisposableListener(head, DOM.EventType.KEY_DOWN, (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }));
    }
    if (compareInputMessages && identicalCount > 0) {
      const note = DOM.append(section, $(".chat-debug-cache-acc-identical-note"));
      note.textContent = localize("chatDebug.cache.identicalNote", "{0} identical message(s) not shown \u2014 they extend the shared, cache-servable prefix.", identicalCount);
    }
  }
  renderComponentDiff(aText, bText, aSize, bSize) {
    const grid = $(".chat-debug-cache-diff");
    const colA = DOM.append(grid, $(".chat-debug-cache-diff-col"));
    DOM.append(colA, $("h4", void 0, localize("chatDebug.cache.diffSideA", "Previous \xB7 {0} chars", numberFormatter.value.format(aSize))));
    const aBody = DOM.append(colA, $(".chat-debug-cache-diff-body"));
    const colB = DOM.append(grid, $(".chat-debug-cache-diff-col"));
    DOM.append(colB, $("h4", void 0, localize("chatDebug.cache.diffSideB", "Current \xB7 {0} chars", numberFormatter.value.format(bSize))));
    const bBody = DOM.append(colB, $(".chat-debug-cache-diff-body"));
    if (!aText && !bText) {
      aBody.textContent = localize("chatDebug.cache.notPresent", "(not present)");
      bBody.textContent = localize("chatDebug.cache.notPresent", "(not present)");
      return grid;
    }
    renderInlineDiff(aBody, bBody, aText, bText);
    return grid;
  }
};
ChatDebugCacheExplorerView = __decorateClass([
  __decorateParam(1, IChatService),
  __decorateParam(2, IChatDebugService),
  __decorateParam(3, IContextMenuService)
], ChatDebugCacheExplorerView);
function findSection(sections, name) {
  if (!sections) {
    return void 0;
  }
  for (const s of sections) {
    if (s.name === name) {
      return s.content;
    }
  }
  return void 0;
}
function alignSignatureChunks(aSegs, bSegs) {
  const rows = [];
  const toRow = (aS, bS) => {
    const ref = bS ?? aS;
    return {
      role: ref.role,
      label: ref.label,
      aChars: aS?.chars,
      bChars: bS?.chars,
      // A row drifts if either side flags drift (e.g. OnlyInA marks only
      // the A segment) or the chunk is present on just one side.
      drift: (aS?.drift ?? false) || (bS?.drift ?? false) || !!aS !== !!bS
    };
  };
  for (const role of ["system", "tools"]) {
    const aS = aSegs.find((s) => s.synthetic && s.role === role);
    const bS = bSegs.find((s) => s.synthetic && s.role === role);
    if (aS || bS) {
      rows.push(toRow(aS, bS));
    }
  }
  const aMsgs = aSegs.filter((s) => !s.synthetic);
  const bMsgs = bSegs.filter((s) => !s.synthetic);
  const count = Math.max(aMsgs.length, bMsgs.length);
  for (let i = 0; i < count; i++) {
    rows.push(toRow(aMsgs[i], bMsgs[i]));
  }
  return rows;
}
function agentKey(turn) {
  return turn.requestName?.trim() || localize("chatDebug.cache.unnamedAgent", "(unnamed)");
}
function computeAgentCounts(turns) {
  const counts = /* @__PURE__ */ new Map();
  for (const turn of turns) {
    const key = agentKey(turn);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
function defaultAgentSelection(agentCounts) {
  if (agentCounts.has(DEFAULT_AGENT_KEY)) {
    return /* @__PURE__ */ new Set([DEFAULT_AGENT_KEY]);
  }
  return new Set(agentCounts.keys());
}
function isSameModelTurn(a, b) {
  if (a === b) {
    return true;
  }
  return a.id !== void 0 && b.id !== void 0 && a.id === b.id;
}
function isSimilarNoIdModelTurn(a, b) {
  return a.id === void 0 && b.id === void 0 && a.created.getTime() === b.created.getTime() && a.parentEventId === b.parentEventId && a.requestName === b.requestName && a.model === b.model;
}
function resolveFilteredSelectionIndex(turns, previous) {
  if (previous) {
    const exact = turns.findIndex((t) => isSameModelTurn(t, previous));
    if (exact >= 0) {
      return exact;
    }
    const similar = turns.findIndex((t) => isSimilarNoIdModelTurn(t, previous));
    if (similar >= 0) {
      return similar;
    }
  }
  return turns.length - 1;
}
function buildTurnGroups(turns, userMessages) {
  const userById = /* @__PURE__ */ new Map();
  for (const um of userMessages) {
    if (!um.id) {
      continue;
    }
    userById.set(um.id, um);
    const stripped = um.id.startsWith("user-msg-") ? um.id.slice("user-msg-".length) : um.id;
    userById.set(stripped, um);
  }
  const groups = /* @__PURE__ */ new Map();
  const order = [];
  turns.forEach((turn, index) => {
    const key = turn.parentEventId ?? turn.id ?? `turn-${index}`;
    let entry = groups.get(key);
    if (!entry) {
      entry = { userMessage: userById.get(key) ?? userById.get(`user-msg-${key}`), turns: [] };
      groups.set(key, entry);
      order.push(key);
    }
    entry.turns.push({ turn, index });
  });
  return order.map((key) => ({ key, userMessage: groups.get(key).userMessage, turns: groups.get(key).turns }));
}
function textForComponent(c, side) {
  if (c.name === "system") {
    return side.system ?? "";
  }
  if (c.name === "tools") {
    return side.tools ?? "";
  }
  if (c.name === CURRENT_CONTINUATION_DELTA_COMPONENT) {
    return continuationDeltaText(side);
  }
  const m = /^messages\[(\d+)\]$/.exec(c.name);
  if (m) {
    const idx = parseInt(m[1], 10);
    return side.inputMessages[idx]?.text ?? "";
  }
  return "";
}
function continuationDeltaText(side) {
  return side.requestShape.isContinuation ? side.inputMessages.map((m, index) => `input[${index}] ${m.role}
${m.text}`).join("\n\n") : "";
}
function currentDeltaComponent(side) {
  const size = side.inputMessages.reduce((sum, m) => sum + m.charLength, 0);
  return {
    name: CURRENT_CONTINUATION_DELTA_COMPONENT,
    role: side.requestShape.inputItemTypes.join(", ") || side.inputMessages.map((m) => m.role).join(", ") || void 0,
    status: CacheDiffKind.OnlyInB,
    aSize: 0,
    bSize: size
  };
}
function categoryIcon(category) {
  switch (category) {
    case CacheBreakCategory.Healthy:
      return "check";
    case CacheBreakCategory.Expiration:
      return "clock";
    case CacheBreakCategory.Model:
      return "hubot";
    case CacheBreakCategory.Tools:
      return "tools";
    case CacheBreakCategory.System:
      return "gear";
    case CacheBreakCategory.Options:
      return "symbol-parameter";
    case CacheBreakCategory.History:
      return "history";
    case CacheBreakCategory.Unknown:
      return "question";
  }
}
function findingIcon(severity) {
  switch (severity) {
    case CacheInsightSeverity.Ok:
      return "check";
    case CacheInsightSeverity.Info:
      return "info";
    case CacheInsightSeverity.Warning:
      return "warning";
    case CacheInsightSeverity.Critical:
      return "error";
  }
}
function badgeLabel(status) {
  switch (status) {
    case CacheDiffKind.Identical:
      return localize("chatDebug.cache.badge.identical", "identical");
    case CacheDiffKind.ContentDrift:
      return localize("chatDebug.cache.badge.contentDrift", "content drift");
    case CacheDiffKind.LengthChange:
      return localize("chatDebug.cache.badge.lengthChange", "length change");
    case CacheDiffKind.OnlyInA:
      return localize("chatDebug.cache.badge.onlyA", "only in A");
    case CacheDiffKind.OnlyInB:
      return localize("chatDebug.cache.badge.onlyB", "only in B");
  }
}
function describeTruncation(aText, bText) {
  const re = /\.\.\.\[truncated, original (\d+) chars\]$/;
  const aMatch = re.exec(aText);
  const bMatch = re.exec(bText);
  if (!aMatch && !bMatch) {
    return void 0;
  }
  if (aMatch && bMatch) {
    return localize(
      "chatDebug.cache.truncatedBoth",
      "Both sides truncated by the OTel attribute cap (originals were {0} and {1} chars) \u2014 diff may be partial.",
      numberFormatter.value.format(parseInt(aMatch[1], 10)),
      numberFormatter.value.format(parseInt(bMatch[1], 10))
    );
  }
  const match = aMatch ?? bMatch;
  const side = aMatch ? localize("chatDebug.cache.truncatedSidePrev", "Previous") : localize("chatDebug.cache.truncatedSideCurr", "Current");
  return localize(
    "chatDebug.cache.truncatedOne",
    "{0} side truncated by the OTel attribute cap (original was {1} chars) \u2014 diff may be partial.",
    side,
    numberFormatter.value.format(parseInt(match[1], 10))
  );
}
function computeCacheHit(event) {
  if (!event.inputTokens || event.cachedTokens === void 0) {
    return 0;
  }
  return Math.min(100, event.cachedTokens / event.inputTokens * 100);
}
function shouldCompareInputMessages(a, b) {
  return !a.requestShape.isContinuation && !b.requestShape.isContinuation;
}
function describeRequestShape(inputMessages, requestShapeJson) {
  const metadata = parseRequestShapeMetadata(requestShapeJson);
  const inputItemTypes = Array.isArray(metadata?.inputItemTypes) ? metadata.inputItemTypes.filter((x) => typeof x === "string") : [];
  const common = { api: typeof metadata?.api === "string" ? metadata.api : void 0, inputItemTypes };
  const hasPreviousResponseId = metadata?.hasPreviousResponseId === true;
  const hasToolSearchOutput = inputItemTypes.includes("tool_search_output") || inputMessages.some((m) => m.role === "tool_search");
  const hasOnlyToolOutput = inputMessages.length > 0 && inputMessages.every((m) => m.role === "tool");
  if (hasPreviousResponseId && hasToolSearchOutput) {
    return {
      label: localize("chatDebug.cache.requestShape.toolSearch", "tool_search_output continuation"),
      description: localize("chatDebug.cache.requestShape.toolSearchDescription", "Responses API continuation: the displayed input is only the tool-search delta sent over the wire. The provider reconstructs prior context from the previous response id."),
      isContinuation: true,
      ...common
    };
  }
  if (hasPreviousResponseId && hasOnlyToolOutput) {
    return {
      label: localize("chatDebug.cache.requestShape.toolOutput", "tool output continuation"),
      description: localize("chatDebug.cache.requestShape.toolOutputDescription", "Responses API continuation: the displayed input is only the tool-output delta sent over the wire. The provider reconstructs prior context from the previous response id."),
      isContinuation: true,
      ...common
    };
  }
  if (hasPreviousResponseId) {
    return {
      label: localize("chatDebug.cache.requestShape.continuation", "Responses API continuation"),
      description: localize("chatDebug.cache.requestShape.continuationDescription", "Responses API continuation: the displayed input is only the delta sent over the wire. The provider reconstructs prior context from the previous response id."),
      isContinuation: true,
      ...common
    };
  }
  if (hasToolSearchOutput) {
    return {
      label: localize("chatDebug.cache.requestShape.toolSearchRequest", "tool_search_output request"),
      description: localize("chatDebug.cache.requestShape.toolSearchRequestDescription", "This request contains a Responses API tool_search_output item. No previous-response continuation marker was captured, so the displayed input may be a full or history-sliced request rather than only a continuation delta."),
      isContinuation: false,
      ...common
    };
  }
  if (hasOnlyToolOutput) {
    return {
      label: localize("chatDebug.cache.requestShape.toolOutputRequest", "tool output request"),
      description: void 0,
      isContinuation: false,
      ...common
    };
  }
  return {
    label: localize("chatDebug.cache.requestShape.fullInput", "full input request"),
    description: void 0,
    isContinuation: false,
    ...common
  };
}
function parseRequestShapeMetadata(requestShapeJson) {
  if (!requestShapeJson) {
    return void 0;
  }
  try {
    const parsed = JSON.parse(requestShapeJson);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
  }
  return void 0;
}
function roleClass(role) {
  switch (role) {
    case "system":
    case "tools":
    case "user":
    case "assistant":
    case "tool":
      return role;
    case "tool_search":
      return "tool-search";
    default:
      return "tool";
  }
}
function formatCachePct(pct) {
  const truncated = Math.floor(pct * 100) / 100;
  return truncated.toFixed(2);
}
function formatCachePctInt(pct) {
  return String(Math.floor(pct));
}
function formatTokens(value) {
  if (value === void 0) {
    return "\u2014";
  }
  return numberFormatter.value.format(value);
}
function sideOptions(side) {
  const out = {};
  if (side.event.model !== void 0) {
    out.model = side.event.model;
  }
  Object.assign(out, parseOptions(side.content?.requestOptions));
  const hasEffort = out["output_config.effort"] !== void 0 || out["reasoning.effort"] !== void 0 || out["reasoning_effort"] !== void 0;
  const hasThinking = Object.keys(out).some((k) => k === "thinking" || k.startsWith("thinking."));
  if (!hasEffort && hasThinking) {
    out["output_config.effort"] = localize("chatDebug.cache.effortNotSent", "(not sent \u2014 provider default)");
  }
  return out;
}
function computeOptionsDiff(a, b) {
  const prev = sideOptions(a);
  const curr = sideOptions(b);
  const keys = /* @__PURE__ */ new Set([...Object.keys(prev), ...Object.keys(curr)]);
  const out = [];
  for (const key of keys) {
    const av = prev[key];
    const bv = curr[key];
    if (!equals(av, bv)) {
      out.push({ key, previous: av, current: bv });
    }
  }
  out.sort((x, y) => x.key.localeCompare(y.key));
  return out;
}
function parseOptions(blob) {
  if (!blob) {
    return {};
  }
  let parsed;
  try {
    parsed = JSON.parse(blob);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const flat = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [nk, nv] of Object.entries(v)) {
        flat[`${k}.${nk}`] = nv;
      }
    } else {
      flat[k] = v;
    }
  }
  return flat;
}
function formatOptionValue(value) {
  if (value === void 0) {
    return "\u2014";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
const DIFF_OPTIONS = {
  ignoreTrimWhitespace: false,
  maxComputationTimeMs: 200,
  computeMoves: false
};
function renderInlineDiff(prevHost, currHost, prev, curr) {
  const prevLines = prev.split(/\r?\n/);
  const currLines = curr.split(/\r?\n/);
  const result = linesDiffComputers.getDefault().computeDiff(prevLines, currLines, DIFF_OPTIONS);
  let prevIdx = 0;
  let currIdx = 0;
  for (const change of result.changes) {
    const origStart = change.original.startLineNumber;
    const origEnd = change.original.endLineNumberExclusive;
    const modStart = change.modified.startLineNumber;
    const modEnd = change.modified.endLineNumberExclusive;
    while (prevIdx + 1 < origStart && currIdx + 1 < modStart) {
      appendLine(prevHost, prevLines[prevIdx], "context");
      appendLine(currHost, currLines[currIdx], "context");
      prevIdx++;
      currIdx++;
    }
    const innerByOrig = groupInnerChangesByLine(
      change.innerChanges,
      /* original */
      true
    );
    const innerByMod = groupInnerChangesByLine(
      change.innerChanges,
      /* original */
      false
    );
    for (let line = origStart; line < origEnd; line++) {
      const lineText = prevLines[line - 1] ?? "";
      appendChangedLine(prevHost, lineText, innerByOrig.get(line), "remove");
    }
    prevIdx = origEnd - 1;
    for (let line = modStart; line < modEnd; line++) {
      const lineText = currLines[line - 1] ?? "";
      appendChangedLine(currHost, lineText, innerByMod.get(line), "add");
    }
    currIdx = modEnd - 1;
  }
  while (prevIdx < prevLines.length && currIdx < currLines.length) {
    appendLine(prevHost, prevLines[prevIdx], "context");
    appendLine(currHost, currLines[currIdx], "context");
    prevIdx++;
    currIdx++;
  }
}
function appendLine(host, text, kind) {
  const line = DOM.append(host, $(`.chat-debug-cache-diff-line.${kind}`));
  line.textContent = text === "" ? "\xA0" : text;
}
function appendChangedLine(host, text, ranges, kind) {
  const line = DOM.append(host, $(`.chat-debug-cache-diff-line.${kind}`));
  if (!ranges || ranges.length === 0) {
    line.textContent = text === "" ? "\xA0" : text;
    return;
  }
  let cursor = 1;
  const sorted = [...ranges].sort((a, b) => a.startColumn - b.startColumn);
  for (const r of sorted) {
    if (r.startColumn > cursor) {
      DOM.append(line, document.createTextNode(text.substring(cursor - 1, r.startColumn - 1)));
    }
    const span = DOM.append(line, $("span.chat-debug-cache-diff-inner"));
    span.textContent = text.substring(r.startColumn - 1, r.endColumn - 1);
    cursor = r.endColumn;
  }
  if (cursor - 1 < text.length) {
    DOM.append(line, document.createTextNode(text.substring(cursor - 1)));
  }
}
function groupInnerChangesByLine(innerChanges, useOriginal) {
  const out = /* @__PURE__ */ new Map();
  if (!innerChanges) {
    return out;
  }
  for (const r of innerChanges) {
    const range = useOriginal ? r.originalRange : r.modifiedRange;
    if (range.startLineNumber !== range.endLineNumber) {
      continue;
    }
    const list = out.get(range.startLineNumber) ?? [];
    list.push({ startColumn: range.startColumn, endColumn: range.endColumn });
    out.set(range.startLineNumber, list);
  }
  return out;
}
export {
  CacheExplorerNavigation,
  ChatDebugCacheExplorerView,
  agentKey,
  alignSignatureChunks,
  computeAgentCounts,
  defaultAgentSelection,
  isSameModelTurn,
  resolveFilteredSelectionIndex
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXREZWJ1Z1xcY2hhdERlYnVnQ2FjaGVFeHBsb3JlclZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBPcmllbnRhdGlvbiwgU2FzaCwgU2FzaFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Nhc2gvc2FzaC5qcyc7XG5pbXBvcnQgeyBCcmVhZGNydW1ic1dpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9icmVhZGNydW1icy9icmVhZGNydW1ic1dpZGdldC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCBTZXBhcmF0b3IsIHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IHNhZmVJbnRsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGF0ZS5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IGRlZmF1bHRCcmVhZGNydW1ic1dpZGdldFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBsaW5lc0RpZmZDb21wdXRlcnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2RpZmYvbGluZXNEaWZmQ29tcHV0ZXJzLmpzJztcbmltcG9ydCB7IFJhbmdlTWFwcGluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZGlmZi9yYW5nZU1hcHBpbmcuanMnO1xuaW1wb3J0IHsgSUNoYXREZWJ1Z0V2ZW50TW9kZWxUdXJuQ29udGVudCwgSUNoYXREZWJ1Z01lc3NhZ2VTZWN0aW9uLCBJQ2hhdERlYnVnTW9kZWxUdXJuRXZlbnQsIElDaGF0RGVidWdTZXJ2aWNlLCBJQ2hhdERlYnVnVXNlck1lc3NhZ2VFdmVudCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0RGVidWdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBMb2NhbENoYXRTZXNzaW9uVXJpIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgYXBwZW5kU3lzdGVtRHJpZnQsIGFwcGVuZFRvb2xzRHJpZnQsIENhY2hlRGlmZktpbmQsIGRpZmZQcm9tcHRTaWduYXR1cmUsIElDYWNoZURpZmZSZXN1bHQsIElDb21wb25lbnREcmlmdCwgSU5vcm1hbGl6ZWRNZXNzYWdlLCBwYXJzZUlucHV0TWVzc2FnZXMgfSBmcm9tICcuL2NoYXREZWJ1Z0NhY2hlRGlmZi5qcyc7XG5pbXBvcnQgeyBhbmFseXplU3RyaW5nRGl2ZXJnZW5jZSwgYnVpbGRTZXNzaW9uQ2FjaGVSZXBvcnQsIENhY2hlQnJlYWtDYXRlZ29yeSwgY2FjaGVCcmVha0NhdGVnb3J5TGFiZWwsIENhY2hlSW5zaWdodFNldmVyaXR5LCBjYXRlZ29yaXplQ2FjaGVCcmVhaywgY29tcHV0ZUNhY2hlSW5zaWdodHMsIGRlc2NyaWJlU3RyaW5nRGl2ZXJnZW5jZSwgSUNhY2hlSW5zaWdodCwgSVNlc3Npb25DYWNoZVJlcG9ydCwgSVNlc3Npb25QYWlyT3V0Y29tZSwgbWF4SW5zaWdodFNldmVyaXR5LCBwcmltYXJ5SW5zaWdodCB9IGZyb20gJy4vY2hhdERlYnVnQ2FjaGVJbnNpZ2h0cy5qcyc7XG5pbXBvcnQgeyBzZXR1cEJyZWFkY3J1bWJLZXlib2FyZE5hdmlnYXRpb24sIFRleHRCcmVhZGNydW1iSXRlbSB9IGZyb20gJy4vY2hhdERlYnVnVHlwZXMuanMnO1xuXG5jb25zdCAkID0gRE9NLiQ7XG5jb25zdCBudW1iZXJGb3JtYXR0ZXIgPSBzYWZlSW50bC5OdW1iZXJGb3JtYXQoKTtcbmNvbnN0IHRpbWVGb3JtYXR0ZXIgPSBzYWZlSW50bC5EYXRlVGltZUZvcm1hdCh1bmRlZmluZWQsIHsgaG91cjogJ251bWVyaWMnLCBtaW51dGU6ICcyLWRpZ2l0Jywgc2Vjb25kOiAnMi1kaWdpdCcgfSk7XG5cbi8qKiBEZWZhdWx0IHJhaWwgd2lkdGggaW4gcGl4ZWxzLiAqL1xuY29uc3QgUkFJTF9ERUZBVUxUX1dJRFRIID0gMjgwO1xuY29uc3QgUkFJTF9NSU5fV0lEVEggPSAxODA7XG5jb25zdCBSQUlMX01BWF9XSURUSCA9IDYwMDtcbmNvbnN0IENVUlJFTlRfQ09OVElOVUFUSU9OX0RFTFRBX0NPTVBPTkVOVCA9ICdjdXJyZW50IGNvbnRpbnVhdGlvbiBkZWx0YSc7XG5cbi8qKiBJZGxlIGdhcHMgYXQgb3IgYWJvdmUgdGhpcyBtYW55IG1pbnV0ZXMgZ2V0IGEgVFRMIG1hcmtlciBpbiB0aGUgcmFpbC4gKi9cbmNvbnN0IFRUTF9HQVBfTUlOVVRFUyA9IDU7XG5cbi8qKiBUaGUgbWFpbiBwYW5lbCBlZGl0IGFnZW50LCBzZWxlY3RlZCBieSBkZWZhdWx0IGluIHRoZSBhZ2VudCBmaWx0ZXIuICovXG5jb25zdCBERUZBVUxUX0FHRU5UX0tFWSA9ICdwYW5lbC9lZGl0QWdlbnQnO1xuXG4vKipcbiAqIE5hdmlnYXRpb24gZXZlbnRzIGZpcmVkIGJ5IHRoZSBDYWNoZSBFeHBsb3JlciBicmVhZGNydW1iLlxuICovXG5leHBvcnQgY29uc3QgZW51bSBDYWNoZUV4cGxvcmVyTmF2aWdhdGlvbiB7XG5cdEhvbWUgPSAnaG9tZScsXG5cdE92ZXJ2aWV3ID0gJ292ZXJ2aWV3Jyxcbn1cblxuLyoqIFJlc29sdmVkIGRhdGEgZm9yIG9uZSBBIG9yIEIgc2lkZS4gKi9cbmludGVyZmFjZSBJU2lkZURhdGEge1xuXHRyZWFkb25seSBldmVudDogSUNoYXREZWJ1Z01vZGVsVHVybkV2ZW50O1xuXHRyZWFkb25seSBjb250ZW50OiBJQ2hhdERlYnVnRXZlbnRNb2RlbFR1cm5Db250ZW50IHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBzeXN0ZW06IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgdG9vbHM6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgaW5wdXRNZXNzYWdlczogcmVhZG9ubHkgSU5vcm1hbGl6ZWRNZXNzYWdlW107XG5cdHJlYWRvbmx5IHJlcXVlc3RTaGFwZTogSVJlcXVlc3RTaGFwZUluZm87XG59XG5cbmludGVyZmFjZSBJUmVxdWVzdFNoYXBlSW5mbyB7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGlzQ29udGludWF0aW9uOiBib29sZWFuO1xuXHRyZWFkb25seSBhcGk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgaW5wdXRJdGVtVHlwZXM6IHJlYWRvbmx5IHN0cmluZ1tdO1xufVxuXG4vKiogQSBncm91cGluZyBvZiBtb2RlbCB0dXJucyBzaGFyaW5nIHRoZSBzYW1lIHBhcmVudCAob25lIHVzZXIgcmVxdWVzdCkuICovXG5pbnRlcmZhY2UgSVR1cm5Hcm91cCB7XG5cdHJlYWRvbmx5IGtleTogc3RyaW5nO1xuXHRyZWFkb25seSB1c2VyTWVzc2FnZTogSUNoYXREZWJ1Z1VzZXJNZXNzYWdlRXZlbnQgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHR1cm5zOiByZWFkb25seSB7IHJlYWRvbmx5IHR1cm46IElDaGF0RGVidWdNb2RlbFR1cm5FdmVudDsgcmVhZG9ubHkgaW5kZXg6IG51bWJlciB9W107XG59XG5cbi8qKlxuICogQ2FjaGUgRXhwbG9yZXIgdmlldyBcdTIwMTQgdGhlIHRoaXJkIGVudHJ5IHVuZGVyIFwiRXhwbG9yZSBUcmFjZSBEYXRhXCIuIFNob3dzIGFcbiAqIGxlZnQgcmFpbCBvZiBtb2RlbCB0dXJucyB3aXRoIHRoZWlyIGNhY2hlIGhpdCAlLCBwbHVzIGEgc2lkZS1ieS1zaWRlIHByb21wdFxuICogc2lnbmF0dXJlIGRpZmYgdGhhdCBwaW5wb2ludHMgd2hlcmUgdGhlIHByZWZpeCBicmVha3MuXG4gKlxuICogdjEgcmVhZHMge0BsaW5rIElDaGF0RGVidWdFdmVudE1vZGVsVHVybkNvbnRlbnR9IGZyb20gdGhlIGluLW1lbW9yeSBjaGF0XG4gKiBkZWJ1ZyBzZXJ2aWNlIHZpYSB7QGxpbmsgSUNoYXREZWJ1Z1NlcnZpY2UucmVzb2x2ZUV2ZW50fS4gQ29udGVudCBtYXkgYmVcbiAqIHRydW5jYXRlZCBieSB0aGUgT1RlbCBhdHRyaWJ1dGUgY2FwOyB0aGUgZmlsZS1sb2dnZXIgYmFja2VkIGZ1bGwtZmlkZWxpdHlcbiAqIHByb3ZpZGVyIGlzIGEgZm9sbG93LXVwLlxuICovXG5leHBvcnQgY2xhc3MgQ2hhdERlYnVnQ2FjaGVFeHBsb3JlclZpZXcgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk5hdmlnYXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Q2FjaGVFeHBsb3Jlck5hdmlnYXRpb24+KCkpO1xuXHRyZWFkb25seSBvbk5hdmlnYXRlID0gdGhpcy5fb25OYXZpZ2F0ZS5ldmVudDtcblxuXHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGJyZWFkY3J1bWJXaWRnZXQ6IEJyZWFkY3J1bWJzV2lkZ2V0O1xuXHRwcml2YXRlIHJlYWRvbmx5IHJhaWw6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IHJhaWxUb29sYmFyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSByYWlsTGlzdDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29udGVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2FzaDogU2FzaDtcblx0cHJpdmF0ZSByYWlsV2lkdGggPSBSQUlMX0RFRkFVTFRfV0lEVEg7XG5cdC8qKiBEaXNwb3NhYmxlcyBmb3IgdGhlIGxlZnQgcmFpbCAodG9vbGJhciArIHR1cm4gcm93cykuIENsZWFyZWQgb24gZXZlcnkgZnVsbCByZW5kZXIuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgcmFpbERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0LyoqIERpc3Bvc2FibGVzIGZvciB0aGUgcmlnaHQgY29udGVudCBwYW5lbC4gQ2xlYXJlZCB3aGVuZXZlciB0aGUgY29udGVudCBpcyByZS1yZW5kZXJlZC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBjb250ZW50RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlZnJlc2hTY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cblx0cHJpdmF0ZSBjdXJyZW50U2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cdC8qKiBBbGwgbW9kZWwgdHVybnMgZm9yIHRoZSBzZXNzaW9uLCBiZWZvcmUgdGhlIGFnZW50IGZpbHRlciBpcyBhcHBsaWVkLiAqL1xuXHRwcml2YXRlIGFsbE1vZGVsVHVybnM6IElDaGF0RGVidWdNb2RlbFR1cm5FdmVudFtdID0gW107XG5cdC8qKiBNb2RlbCB0dXJucyBhZnRlciB0aGUgYWdlbnQgZmlsdGVyIFx1MjAxNCB0aGUgbGlzdCB0aGUgcmFpbCBhbmQgZGlmZiBvcGVyYXRlIG9uLiAqL1xuXHRwcml2YXRlIG1vZGVsVHVybnM6IElDaGF0RGVidWdNb2RlbFR1cm5FdmVudFtdID0gW107XG5cdC8qKiBTZWxlY3RlZCB0dXJuIChCIHNpZGUpLiBBIGlzIGNvbXB1dGVkIGFzIGBzZWxlY3RlZEluZGV4IC0gMWAuIC0xID0gbm8gZXhwbGljaXQgc2VsZWN0aW9uIHlldC4gKi9cblx0cHJpdmF0ZSBzZWxlY3RlZEluZGV4ID0gLTE7XG5cdC8qKlxuXHQgKiBTZWxlY3RlZCBhZ2VudCBuYW1lcyAoa2V5ZWQgYnkge0BsaW5rIGFnZW50S2V5fSkuIGB1bmRlZmluZWRgIHVudGlsIHRoZVxuXHQgKiBmaXJzdCByZW5kZXIgYXBwbGllcyB0aGUgZGVmYXVsdCBzZWxlY3Rpb24uIEFuIGVtcHR5IHNldCBpcyBuZXZlciBzdG9yZWQgXHUyMDE0XG5cdCAqIGNsZWFyaW5nIHRoZSBsYXN0IGFnZW50IGZhbGxzIGJhY2sgdG8gXCJhbGxcIi5cblx0ICovXG5cdHByaXZhdGUgc2VsZWN0ZWRBZ2VudHM6IFNldDxzdHJpbmc+IHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogVHVybiB0byByZS1zZWxlY3QgYWZ0ZXIgdGhlIG5leHQgcmVuZGVyLCB1c2VkIHRvIGtlZXAgdGhlIHVzZXIncyBwbGFjZVxuXHQgKiB3aGVuIHRoZSBhZ2VudCBmaWx0ZXIgY2hhbmdlcy4gU3RvcmVkIGFzIHRoZSBldmVudCBvYmplY3QgcmF0aGVyIHRoYW4gaXRzXG5cdCAqIGlkIGJlY2F1c2Uge0BsaW5rIElDaGF0RGVidWdNb2RlbFR1cm5FdmVudC5pZH0gaXMgb3B0aW9uYWw7IG1hdGNoaW5nIGZhbGxzXG5cdCAqIGJhY2sgdG8gb2JqZWN0IHJlZmVyZW5jZSBhbmQgYSBjb21wb3NpdGUgaWRlbnRpdHkgZm9yIHR1cm5zIHdpdGhvdXQgYW4gaWQuXG5cdCAqL1xuXHRwcml2YXRlIHBlbmRpbmdTZWxlY3RUdXJuOiBJQ2hhdERlYnVnTW9kZWxUdXJuRXZlbnQgfCB1bmRlZmluZWQ7XG5cdC8qKiBXaGV0aGVyIHRoZSBwZXItY2h1bmsgc2lnbmF0dXJlIGJyZWFrZG93biB0YWJsZSBpcyBleHBhbmRlZC4gKi9cblx0cHJpdmF0ZSBzaWdCcmVha2Rvd25PcGVuID0gZmFsc2U7XG5cdC8qKiBSYWlsIHR1cm4tcm93IGVsZW1lbnRzIGJ5IHR1cm4gaW5kZXgsIGZvciBpbi1wbGFjZSBzZWxlY3Rpb24gdXBkYXRlcyB3aXRob3V0IHJlYnVpbGRpbmcgdGhlIHJhaWwuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgcmFpbFJvd3NCeUluZGV4ID0gbmV3IE1hcDxudW1iZXIsIEhUTUxFbGVtZW50PigpO1xuXHQvKipcblx0ICogQ29tcG9uZW50IGFjY29yZGlvbiBlbnRyaWVzIGJ5IGNvbXBvbmVudCBuYW1lIChgc3lzdGVtYCwgYHRvb2xzYCxcblx0ICogYG1lc3NhZ2VzW2ldYCksIHNvIGZpbmRpbmdzIGFuZCBzaWduYXR1cmUgc2VnbWVudHMgY2FuIHJldmVhbCB0aGVcblx0ICogbWF0Y2hpbmcgZW50cnkuIFdlIHRyYWNrIGJvdGggdGhlIG91dGVyIGl0ZW0gKGZvciB0aGUgb3Blbi9mbGFzaFxuXHQgKiBjbGFzc2VzIGFuZCBzY3JvbGwgdGFyZ2V0KSBhbmQgdGhlIGlubmVyIGhlYWRlciAodGhlIGZvY3VzIHRhcmdldCkuXG5cdCAqIFJlYnVpbHQgb24gZXZlcnkgY29udGVudCByZW5kZXIuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbXBvbmVudEVsZW1lbnRzID0gbmV3IE1hcDxzdHJpbmcsIHsgaXRlbTogSFRNTEVsZW1lbnQ7IGhlYWQ6IEhUTUxFbGVtZW50IH0+KCk7XG5cdC8qKiBTZWxlY3Rpb24gaW5kZXggdGhlIGJyZWFraW5nIGNvbXBvbmVudCB3YXMgbGFzdCBhdXRvLWV4cGFuZGVkIGZvci4gKi9cblx0cHJpdmF0ZSBhdXRvT3BlbmVkRm9ySW5kZXggPSAtMTtcblx0LyoqXG5cdCAqIE1lbW9pemVkIGNyb3NzLXR1cm4gc2Vzc2lvbiByZXBvcnQuIEtleWVkIG9uIHRoZSBzZXNzaW9uICsgZmlsdGVyZWRcblx0ICogdHVybiBsaXN0IHNvIGJhY2tncm91bmQgcmVmcmVzaGVzIHdpdGggbmV3IGV2ZW50cyByZWNvbXB1dGUgaXQgd2hpbGVcblx0ICogcGxhaW4gc2VsZWN0aW9uIGNoYW5nZXMgcmV1c2UgaXQuXG5cdCAqL1xuXHRwcml2YXRlIHNlc3Npb25SZXBvcnRDYWNoZTogeyBrZXk6IHN0cmluZzsgcmVwb3J0OiBJU2Vzc2lvbkNhY2hlUmVwb3J0IH0gfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIE1vbm90b25pY2FsbHktaW5jcmVhc2luZyByZW5kZXIgdG9rZW4uIEVhY2ggY2FsbCB0byB7QGxpbmsgcmVuZGVyfVxuXHQgKiBjYXB0dXJlcyB0aGUgY3VycmVudCB2YWx1ZSwgdGhlbiByZS1jaGVja3MgaXQgYWZ0ZXIgZWFjaCBhd2FpdDsgaWYgYVxuXHQgKiBuZXdlciByZW5kZXIgaGFzIHN0YXJ0ZWQgaW4gdGhlIG1lYW50aW1lLCB0aGUgb2xkZXIgb25lIGJhaWxzIG91dFxuXHQgKiBiZWZvcmUgbXV0YXRpbmcgdGhlIERPTS4gQXZvaWRzIHJhY2VzIHdoZXJlIGEgc2xvdyBtb2RlbC10dXJuXG5cdCAqIHJlc29sdmUgZnJvbSBvbmUgc2Vzc2lvbiB3cml0ZXMgaW50byBhbm90aGVyJ3MgcGFuZWwuXG5cdCAqL1xuXHRwcml2YXRlIHJlbmRlclRva2VuID0gMDtcblxuXHQvKiogQ2FjaGUgb2YgcmVzb2x2ZWQgbW9kZWwtdHVybiBjb250ZW50IGtleWVkIGJ5IGV2ZW50IGlkLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlc29sdmVkQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgSUNoYXREZWJ1Z0V2ZW50TW9kZWxUdXJuQ29udGVudCB8IHVuZGVmaW5lZD4oKTtcblxuXHQvKiogQ29tcG9uZW50cyBjdXJyZW50bHkgZXhwYW5kZWQgKGJ5IGNvbXBvbmVudCBuYW1lKS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBvcGVuQ29tcG9uZW50cyA9IG5ldyBTZXQ8c3RyaW5nPihbJ3N5c3RlbScsICd0b29scyddKTtcblxuXHQvKiogUmFpbCBncm91cHMgY3VycmVudGx5IGNvbGxhcHNlZCAoYnkgZ3JvdXAga2V5IFx1MjAxNCB0aGUgcGFyZW50IGV2ZW50IGlkKS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBjb2xsYXBzZWRHcm91cHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwYXJlbnQ6IEhUTUxFbGVtZW50LFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJQ2hhdERlYnVnU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXREZWJ1Z1NlcnZpY2U6IElDaGF0RGVidWdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuY29udGFpbmVyID0gRE9NLmFwcGVuZChwYXJlbnQsICQoJy5jaGF0LWRlYnVnLWNhY2hlJykpO1xuXHRcdERPTS5oaWRlKHRoaXMuY29udGFpbmVyKTtcblxuXHRcdC8vIEJyZWFkY3J1bWJcblx0XHRjb25zdCBicmVhZGNydW1iQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnLmNoYXQtZGVidWctYnJlYWRjcnVtYicpKTtcblx0XHR0aGlzLmJyZWFkY3J1bWJXaWRnZXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgQnJlYWRjcnVtYnNXaWRnZXQoYnJlYWRjcnVtYkNvbnRhaW5lciwgMywgdW5kZWZpbmVkLCBDb2RpY29uLmNoZXZyb25SaWdodCwgZGVmYXVsdEJyZWFkY3J1bWJzV2lkZ2V0U3R5bGVzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2V0dXBCcmVhZGNydW1iS2V5Ym9hcmROYXZpZ2F0aW9uKGJyZWFkY3J1bWJDb250YWluZXIsIHRoaXMuYnJlYWRjcnVtYldpZGdldCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYnJlYWRjcnVtYldpZGdldC5vbkRpZFNlbGVjdEl0ZW0oZSA9PiB7XG5cdFx0XHRpZiAoZS50eXBlID09PSAnc2VsZWN0JyAmJiBlLml0ZW0gaW5zdGFuY2VvZiBUZXh0QnJlYWRjcnVtYkl0ZW0pIHtcblx0XHRcdFx0dGhpcy5icmVhZGNydW1iV2lkZ2V0LnNldFNlbGVjdGlvbih1bmRlZmluZWQpO1xuXHRcdFx0XHRjb25zdCBpdGVtcyA9IHRoaXMuYnJlYWRjcnVtYldpZGdldC5nZXRJdGVtcygpO1xuXHRcdFx0XHRjb25zdCBpZHggPSBpdGVtcy5pbmRleE9mKGUuaXRlbSk7XG5cdFx0XHRcdGlmIChpZHggPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLl9vbk5hdmlnYXRlLmZpcmUoQ2FjaGVFeHBsb3Jlck5hdmlnYXRpb24uSG9tZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaWR4ID09PSAxKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25OYXZpZ2F0ZS5maXJlKENhY2hlRXhwbG9yZXJOYXZpZ2F0aW9uLk92ZXJ2aWV3KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEJvZHk6IDItY29sdW1uIHNwbGl0IHdpdGggcmVzaXphYmxlIHJhaWxcblx0XHRjb25zdCBib2R5ID0gRE9NLmFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnLmNoYXQtZGVidWctY2FjaGUtYm9keScpKTtcblx0XHR0aGlzLnJhaWwgPSBET00uYXBwZW5kKGJvZHksICQoJy5jaGF0LWRlYnVnLWNhY2hlLXJhaWwnKSk7XG5cdFx0dGhpcy5yYWlsLnN0eWxlLndpZHRoID0gYCR7dGhpcy5yYWlsV2lkdGh9cHhgO1xuXHRcdHRoaXMucmFpbFRvb2xiYXIgPSBET00uYXBwZW5kKHRoaXMucmFpbCwgJCgnLmNoYXQtZGVidWctY2FjaGUtcmFpbC10b29sYmFyJykpO1xuXHRcdHRoaXMucmFpbExpc3QgPSBET00uYXBwZW5kKHRoaXMucmFpbCwgJCgnLmNoYXQtZGVidWctY2FjaGUtcmFpbC1saXN0JykpO1xuXHRcdHRoaXMuY29udGVudCA9IERPTS5hcHBlbmQoYm9keSwgJCgnLmNoYXQtZGVidWctY2FjaGUtY29udGVudCcpKTtcblxuXHRcdHRoaXMuc2FzaCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTYXNoKGJvZHksIHtcblx0XHRcdGdldFZlcnRpY2FsU2FzaExlZnQ6ICgpID0+IHRoaXMucmFpbFdpZHRoLFxuXHRcdH0sIHsgb3JpZW50YXRpb246IE9yaWVudGF0aW9uLlZFUlRJQ0FMIH0pKTtcblx0XHR0aGlzLnNhc2guc3RhdGUgPSBTYXNoU3RhdGUuRW5hYmxlZDtcblx0XHRsZXQgc2FzaFN0YXJ0V2lkdGg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNhc2gub25EaWRTdGFydCgoKSA9PiBzYXNoU3RhcnRXaWR0aCA9IHRoaXMucmFpbFdpZHRoKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zYXNoLm9uRGlkRW5kKCgpID0+IHtcblx0XHRcdHNhc2hTdGFydFdpZHRoID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5zYXNoLmxheW91dCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNhc2gub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoc2FzaFN0YXJ0V2lkdGggPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkZWx0YSA9IGUuY3VycmVudFggLSBlLnN0YXJ0WDtcblx0XHRcdGNvbnN0IG5leHQgPSBNYXRoLm1heChSQUlMX01JTl9XSURUSCwgTWF0aC5taW4oUkFJTF9NQVhfV0lEVEgsIHNhc2hTdGFydFdpZHRoICsgZGVsdGEpKTtcblx0XHRcdHRoaXMucmFpbFdpZHRoID0gbmV4dDtcblx0XHRcdHRoaXMucmFpbC5zdHlsZS53aWR0aCA9IGAke25leHR9cHhgO1xuXHRcdFx0dGhpcy5zYXNoLmxheW91dCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMucmVmcmVzaFNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMucmVuZGVyKCksIDUwKSk7XG5cdH1cblxuXHRzZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UgfHwgdGhpcy5jdXJyZW50U2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkgIT09IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHR0aGlzLnJlc29sdmVkQ2FjaGUuY2xlYXIoKTtcblx0XHRcdHRoaXMuY29sbGFwc2VkR3JvdXBzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLm9wZW5Db21wb25lbnRzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLm9wZW5Db21wb25lbnRzLmFkZCgnc3lzdGVtJyk7XG5cdFx0XHR0aGlzLm9wZW5Db21wb25lbnRzLmFkZCgndG9vbHMnKTtcblx0XHRcdHRoaXMuc2VsZWN0ZWRJbmRleCA9IC0xO1xuXHRcdFx0dGhpcy5zZWxlY3RlZEFnZW50cyA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMucGVuZGluZ1NlbGVjdFR1cm4gPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnNpZ0JyZWFrZG93bk9wZW4gPSBmYWxzZTtcblx0XHRcdHRoaXMuYXV0b09wZW5lZEZvckluZGV4ID0gLTE7XG5cdFx0XHR0aGlzLnNlc3Npb25SZXBvcnRDYWNoZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5jdXJyZW50U2Vzc2lvblJlc291cmNlID0gc2Vzc2lvblJlc291cmNlO1xuXHR9XG5cblx0c2hvdygpOiB2b2lkIHtcblx0XHRET00uc2hvdyh0aGlzLmNvbnRhaW5lcik7XG5cdFx0dGhpcy5yZW5kZXIoKTtcblx0fVxuXG5cdGhpZGUoKTogdm9pZCB7XG5cdFx0RE9NLmhpZGUodGhpcy5jb250YWluZXIpO1xuXHRcdHRoaXMucmVmcmVzaFNjaGVkdWxlci5jYW5jZWwoKTtcblx0fVxuXG5cdHJlZnJlc2goKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY29udGFpbmVyLnN0eWxlLmRpc3BsYXkgIT09ICdub25lJyAmJiAhdGhpcy5yZWZyZXNoU2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdHRoaXMucmVmcmVzaFNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdH1cblx0fVxuXG5cdHVwZGF0ZUJyZWFkY3J1bWIoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvblRpdGxlID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uVGl0bGUodGhpcy5jdXJyZW50U2Vzc2lvblJlc291cmNlKSB8fCBMb2NhbENoYXRTZXNzaW9uVXJpLnBhcnNlTG9jYWxTZXNzaW9uSWQodGhpcy5jdXJyZW50U2Vzc2lvblJlc291cmNlKSB8fCB0aGlzLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHR0aGlzLmJyZWFkY3J1bWJXaWRnZXQuc2V0SXRlbXMoW1xuXHRcdFx0bmV3IFRleHRCcmVhZGNydW1iSXRlbShsb2NhbGl6ZSgnY2hhdERlYnVnLnRpdGxlJywgXCJBZ2VudCBEZWJ1ZyBMb2dzXCIpLCB0cnVlKSxcblx0XHRcdG5ldyBUZXh0QnJlYWRjcnVtYkl0ZW0oc2Vzc2lvblRpdGxlLCB0cnVlKSxcblx0XHRcdG5ldyBUZXh0QnJlYWRjcnVtYkl0ZW0obG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZUV4cGxvcmVyJywgXCJDYWNoZSBFeHBsb3JlclwiKSksXG5cdFx0XSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlbmRlcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBNb25vdG9uaWNhbGx5LWluY3JlYXNpbmcgdG9rZW4uIENhcHR1cmVkIGF0IHRoZSBzdGFydCBvZiBldmVyeVxuXHRcdC8vIHJlbmRlcigpIGFuZCByZS1jaGVja2VkIGFmdGVyIGVhY2ggYXdhaXQgc28gYW4gaW4tZmxpZ2h0IHJlc29sdmVcblx0XHQvLyB0aGF0J3MgYmVlbiBzdXBlcnNlZGVkIGJ5IGEgbmV3ZXIgcmVuZGVyIGJhaWxzIG91dCBiZWZvcmVcblx0XHQvLyB0b3VjaGluZyB0aGUgRE9NLlxuXHRcdGNvbnN0IHRva2VuID0gKyt0aGlzLnJlbmRlclRva2VuO1xuXHRcdGNvbnN0IGlzQ3VycmVudCA9ICgpID0+IHRva2VuID09PSB0aGlzLnJlbmRlclRva2VuO1xuXG5cdFx0Ly8gUHJlc2VydmUgdGhlIHJhaWwgc2Nyb2xsIHBvc2l0aW9uIGFjcm9zcyBhIGZ1bGwgcmVidWlsZCBzbyBhXG5cdFx0Ly8gYmFja2dyb3VuZCByZWZyZXNoIChuZXcgZXZlbnRzKSBkb2Vzbid0IHlhbmsgdGhlIGxpc3Qgd2hpbGUgdGhlXG5cdFx0Ly8gdXNlciBpcyByZWFkaW5nIGl0LlxuXHRcdGNvbnN0IHJhaWxTY3JvbGxUb3AgPSB0aGlzLnJhaWxMaXN0LnNjcm9sbFRvcDtcblxuXHRcdHRoaXMudXBkYXRlQnJlYWRjcnVtYigpO1xuXHRcdHRoaXMucmFpbERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0RE9NLmNsZWFyTm9kZSh0aGlzLnJhaWxUb29sYmFyKTtcblx0XHRET00uY2xlYXJOb2RlKHRoaXMucmFpbExpc3QpO1xuXHRcdHRoaXMucmFpbFJvd3NCeUluZGV4LmNsZWFyKCk7XG5cblx0XHRpZiAoIXRoaXMuY3VycmVudFNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdERPTS5jbGVhck5vZGUodGhpcy5jb250ZW50KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBldmVudHMgPSB0aGlzLmNoYXREZWJ1Z1NlcnZpY2UuZ2V0RXZlbnRzKHRoaXMuY3VycmVudFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0dGhpcy5hbGxNb2RlbFR1cm5zID0gZXZlbnRzLmZpbHRlcigoZSk6IGUgaXMgSUNoYXREZWJ1Z01vZGVsVHVybkV2ZW50ID0+IGUua2luZCA9PT0gJ21vZGVsVHVybicpO1xuXHRcdGNvbnN0IHVzZXJNZXNzYWdlcyA9IGV2ZW50cy5maWx0ZXIoKGUpOiBlIGlzIElDaGF0RGVidWdVc2VyTWVzc2FnZUV2ZW50ID0+IGUua2luZCA9PT0gJ3VzZXJNZXNzYWdlJyk7XG5cblx0XHRpZiAodGhpcy5hbGxNb2RlbFR1cm5zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdERPTS5jbGVhck5vZGUodGhpcy5jb250ZW50KTtcblx0XHRcdGNvbnN0IGVtcHR5ID0gRE9NLmFwcGVuZCh0aGlzLmNvbnRlbnQsICQoJy5jaGF0LWRlYnVnLWNhY2hlLWVtcHR5JykpO1xuXHRcdFx0ZW1wdHkudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLm5vVHVybnMnLCBcIk5vIG1vZGVsIHR1cm5zIHJlY29yZGVkIGZvciB0aGlzIHNlc3Npb24geWV0LlwiKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBBZ2VudCBmaWx0ZXI6IGRlcml2ZSB0aGUgZGlzdGluY3QgYWdlbnRzIGFuZCBhcHBseSB0aGUgZGVmYXVsdFxuXHRcdC8vIHNlbGVjdGlvbiAodGhlIG1haW4gcGFuZWwgZWRpdCBhZ2VudCkgdGhlIGZpcnN0IHRpbWUgd2UgcmVuZGVyIGFcblx0XHQvLyBzZXNzaW9uLiBUaGUgdG9vbGJhciBsZXRzIHRoZSB1c2VyIHJldmVhbCB0aGUgb3RoZXIgYWdlbnRzLlxuXHRcdGNvbnN0IGFnZW50Q291bnRzID0gY29tcHV0ZUFnZW50Q291bnRzKHRoaXMuYWxsTW9kZWxUdXJucyk7XG5cdFx0aWYgKHRoaXMuc2VsZWN0ZWRBZ2VudHMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5zZWxlY3RlZEFnZW50cyA9IGRlZmF1bHRBZ2VudFNlbGVjdGlvbihhZ2VudENvdW50cyk7XG5cdFx0fVxuXHRcdHRoaXMucmVuZGVyUmFpbFRvb2xiYXIoYWdlbnRDb3VudHMpO1xuXG5cdFx0dGhpcy5tb2RlbFR1cm5zID0gdGhpcy5hbGxNb2RlbFR1cm5zLmZpbHRlcih0ID0+IHRoaXMuc2VsZWN0ZWRBZ2VudHMhLmhhcyhhZ2VudEtleSh0KSkpO1xuXG5cdFx0aWYgKHRoaXMubW9kZWxUdXJucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRET00uY2xlYXJOb2RlKHRoaXMuY29udGVudCk7XG5cdFx0XHRjb25zdCBlbXB0eSA9IERPTS5hcHBlbmQodGhpcy5jb250ZW50LCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1lbXB0eScpKTtcblx0XHRcdGVtcHR5LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5ub1R1cm5zRm9yQWdlbnRzJywgXCJObyBtb2RlbCB0dXJucyBtYXRjaCB0aGUgc2VsZWN0ZWQgYWdlbnQgZmlsdGVyLlwiKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBSZXN0b3JlIHRoZSBwcmV2aW91c2x5LXNlbGVjdGVkIHR1cm4gd2hlbiB0aGUgZmlsdGVyIGNoYW5nZXMsIHNvXG5cdFx0Ly8gdG9nZ2xpbmcgYWdlbnRzIGtlZXBzIHRoZSB1c2VyIG9uIHRoZSBzYW1lIHJlcXVlc3Qgd2hlbiBwb3NzaWJsZS5cblx0XHQvLyBXaGVuIHRoYXQgdHVybiBubyBsb25nZXIgc3Vydml2ZXMgdGhlIGZpbHRlciwgZmFsbCBiYWNrIHRvIHRoZSBtb3N0XG5cdFx0Ly8gcmVjZW50IHR1cm4gcmF0aGVyIHRoYW4gbGVhdmluZyB0aGUgc3RhbGUgb3JkaW5hbCBpbmRleCBwb2ludGluZyBhdFxuXHRcdC8vIGFuIHVucmVsYXRlZCB0dXJuLlxuXHRcdGlmICh0aGlzLnBlbmRpbmdTZWxlY3RUdXJuKSB7XG5cdFx0XHR0aGlzLnNlbGVjdGVkSW5kZXggPSByZXNvbHZlRmlsdGVyZWRTZWxlY3Rpb25JbmRleCh0aGlzLm1vZGVsVHVybnMsIHRoaXMucGVuZGluZ1NlbGVjdFR1cm4pO1xuXHRcdFx0dGhpcy5wZW5kaW5nU2VsZWN0VHVybiA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBEZWZhdWx0IHRvIHRoZSBtb3N0IHJlY2VudCB0dXJuIG9uIGZpcnN0IGRpc3BsYXksIGFuZCBzaWxlbnRseVxuXHRcdC8vIGZhbGwgYmFjayB0byB0aGUgbW9zdCByZWNlbnQgdHVybiB3aGVuIHN3aXRjaGluZyB0byBhIHNlc3Npb25cblx0XHQvLyB0aGF0IGhhcyBmZXdlciB0dXJucyB0aGFuIHRoZSBwcmV2aW91cyBzZWxlY3Rpb24gXFx1MjAxNCB0aGUgcmFpbFxuXHRcdC8vIHJlLXJlbmRlcnMgc28gdGhlIG5ldyBzZWxlY3Rpb24gaXMgc3RpbGwgdmlzaWJsZS5cblx0XHRpZiAodGhpcy5zZWxlY3RlZEluZGV4IDwgMCB8fCB0aGlzLnNlbGVjdGVkSW5kZXggPj0gdGhpcy5tb2RlbFR1cm5zLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5zZWxlY3RlZEluZGV4ID0gdGhpcy5tb2RlbFR1cm5zLmxlbmd0aCAtIDE7XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW5kZXJSYWlsKGJ1aWxkVHVybkdyb3Vwcyh0aGlzLm1vZGVsVHVybnMsIHVzZXJNZXNzYWdlcykpO1xuXHRcdHRoaXMucmFpbExpc3Quc2Nyb2xsVG9wID0gcmFpbFNjcm9sbFRvcDtcblxuXHRcdGF3YWl0IHRoaXMucmVuZGVyQ29udGVudElubmVyKHRva2VuLCBpc0N1cnJlbnQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbmRlciB0aGUgcmlnaHQtaGFuZCBjb250ZW50IHBhbmVsIChzdW1tYXJ5LCBzaWduYXR1cmUsIG9wdGlvbnMsXG5cdCAqIGNvbXBvbmVudHMpIGZvciB0aGUgY3VycmVudCBzZWxlY3Rpb24uIFNwbGl0IG91dCBvZiB7QGxpbmsgcmVuZGVyfSBzbyBhXG5cdCAqIHNlbGVjdGlvbiBjaGFuZ2UgY2FuIHJlZnJlc2gganVzdCB0aGUgY29udGVudCB3aXRob3V0IHJlYnVpbGRpbmcgdGhlXG5cdCAqIHJhaWwgXFx1MjAxNCB3aGljaCBpcyB3aGF0IGtlZXBzIGtleWJvYXJkIGZvY3VzIGFuZCBzY3JvbGwgcG9zaXRpb24gc3RhYmxlXG5cdCAqIHdoaWxlIG5hdmlnYXRpbmcgdHVybnMuXG5cdCAqXG5cdCAqIEBwYXJhbSBwcmVzZXJ2ZVNjcm9sbCBrZWVwIHRoZSBjb250ZW50IHNjcm9sbCBwb3NpdGlvbiAodXNlZCBmb3Igem9vbVxuXHQgKiBhbmQgYnJlYWtkb3duIHRvZ2dsZXMgd2hlcmUgdGhlIHNlbGVjdGlvbiBpcyB1bmNoYW5nZWQpLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyByZW5kZXJDb250ZW50SW5uZXIodG9rZW46IG51bWJlciwgaXNDdXJyZW50OiAoKSA9PiBib29sZWFuLCBwcmVzZXJ2ZVNjcm9sbCA9IGZhbHNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcHJldlNjcm9sbCA9IHByZXNlcnZlU2Nyb2xsID8gdGhpcy5jb250ZW50LnNjcm9sbFRvcCA6IDA7XG5cblx0XHRjb25zdCBiRXZlbnQgPSB0aGlzLm1vZGVsVHVybnNbdGhpcy5zZWxlY3RlZEluZGV4XTtcblx0XHRjb25zdCBhRXZlbnQgPSB0aGlzLnNlbGVjdGVkSW5kZXggPiAwID8gdGhpcy5tb2RlbFR1cm5zW3RoaXMuc2VsZWN0ZWRJbmRleCAtIDFdIDogdW5kZWZpbmVkO1xuXG5cdFx0Ly8gUmVzb2x2ZSBldmVyeXRoaW5nIFx1MjAxNCBib3RoIHNpZGVzIEFORCB0aGUgc2Vzc2lvbiByZXBvcnQgXHUyMDE0ICpiZWZvcmUqXG5cdFx0Ly8gdG91Y2hpbmcgdGhlIERPTSwgdGhlbiBidWlsZCB0aGUgcGFuZWwgaW4gb25lIHN5bmNocm9ub3VzIHBhc3MuXG5cdFx0Ly8gTm90aGluZyBtdXRhdGVzIHRoZSBsYXlvdXQgYWZ0ZXIgaXQgaXMgc2hvd24sIHNvIGl0IG5ldmVyIGp1bXBzLlxuXHRcdC8vIFRoZSByZXBvcnQgaXMgc2NvcGVkIHRvIHRoZSB0dXJucyB1cCB0byB0aGUgc2VsZWN0ZWQgb25lLCB3aGljaFxuXHRcdC8vIGFsc28gbWFrZXMgaXQgaW1tdW5lIHRvIG5ldyByZXF1ZXN0cyBzdHJlYW1pbmcgaW46IHNlbGVjdGluZyB0aGVcblx0XHQvLyBsYXN0IHJlcXVlc3Qgc2hvd3MgdGhlIHdob2xlIGNvbnZlcnNhdGlvbi5cblx0XHRjb25zdCByZXBvcnQgPSBhd2FpdCB0aGlzLmVuc3VyZVNlc3Npb25SZXBvcnQoKTtcblx0XHRpZiAoIWlzQ3VycmVudCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFhRXZlbnQpIHtcblx0XHRcdC8vIE5vIHByaW9yIHR1cm4gdG8gZGlmZiBhZ2FpbnN0IFx1MjAxNCBzdGlsbCBzdXJmYWNlIE9UZWwtcmVwb3J0ZWQgY2FjaGUgaGl0XG5cdFx0XHQvLyBhbmQgcmVxdWVzdCBtZXRhZGF0YSBmb3IgdGhlIGZpcnN0IHR1cm4gb2YgYSBzZXNzaW9uLlxuXHRcdFx0Y29uc3QgYiA9IGF3YWl0IHRoaXMucmVzb2x2ZVNpZGUoYkV2ZW50KTtcblx0XHRcdGlmICghaXNDdXJyZW50KCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdERPTS5jbGVhck5vZGUodGhpcy5jb250ZW50KTtcblx0XHRcdHRoaXMucmVuZGVyVGl0bGVSb3coKTtcblx0XHRcdHRoaXMucmVuZGVyU2luZ2xlU3VtbWFyeShiKTtcblx0XHRcdGlmIChwcmVzZXJ2ZVNjcm9sbCkge1xuXHRcdFx0XHR0aGlzLmNvbnRlbnQuc2Nyb2xsVG9wID0gcHJldlNjcm9sbDtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBbYSwgYl0gPSBhd2FpdCBQcm9taXNlLmFsbChbdGhpcy5yZXNvbHZlU2lkZShhRXZlbnQpLCB0aGlzLnJlc29sdmVTaWRlKGJFdmVudCldKTtcblx0XHQvLyBJZiBhIG5ld2VyIHJlbmRlciBzdGFydGVkIHdoaWxlIHdlIHdlcmUgcmVzb2x2aW5nLCBkcm9wIHRoaXMgb25lLlxuXHRcdGlmICghaXNDdXJyZW50KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdERPTS5jbGVhck5vZGUodGhpcy5jb250ZW50KTtcblx0XHR0aGlzLnJlbmRlclRpdGxlUm93KCk7XG5cdFx0aWYgKHJlcG9ydCAmJiByZXBvcnQucGFpckNvdW50ID4gMCkge1xuXHRcdFx0dGhpcy5yZW5kZXJTZXNzaW9uSGVhbHRoKERPTS5hcHBlbmQodGhpcy5jb250ZW50LCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1zZXNzaW9uLWhlYWx0aCcpKSwgcmVwb3J0KTtcblx0XHR9XG5cblx0XHQvLyBXaGVuIHRoZSByZXF1ZXN0LXNpZGUgcHJvbXB0IHdhcyBub3QgY2FwdHVyZWQgKGUuZy4gYWdlbnQtaG9zdCAvXG5cdFx0Ly8gQ29waWxvdCBDTEkgc2Vzc2lvbnMsIHdob3NlIGxvZyByZWNvcmRzIHRoZSBtb2RlbCdzIG91dHB1dCBidXQgbm90IHRoZVxuXHRcdC8vIHJlcXVlc3Qgc2VudCB0byBpdCksIHRoZSByZXBvcnRlZCBjYWNoZS1oaXQgbnVtYmVycyBhcmUgc3RpbGwgYWNjdXJhdGVcblx0XHQvLyBidXQgdGhlcmUgaXMgbm90aGluZyB0byBkaWZmLiBTaG93IHRoZSB0b2tlbi1iYXNlZCBwZXJmb3JtYW5jZSBvbmx5IGFuZFxuXHRcdC8vIHNraXAgdGhlIGRpdmVyZ2VuY2UgYW5hbHlzaXMgXHUyMDE0IHJ1bm5pbmcgaXQgYWdhaW5zdCBhYnNlbnQgZGF0YSB3b3VsZFxuXHRcdC8vIGZhYnJpY2F0ZSBhIFwic3RhYmxlIHByZWZpeFwiIC8gXCJjYWNoZSBleHBpcmF0aW9uXCIgdmVyZGljdC5cblx0XHRjb25zdCBoYXNTaWduYXR1cmVEYXRhID0gISEoYS5zeXN0ZW0gfHwgYS50b29scyB8fCBhLmlucHV0TWVzc2FnZXMubGVuZ3RoIHx8IGIuc3lzdGVtIHx8IGIudG9vbHMgfHwgYi5pbnB1dE1lc3NhZ2VzLmxlbmd0aCk7XG5cdFx0aWYgKCFoYXNTaWduYXR1cmVEYXRhKSB7XG5cdFx0XHR0aGlzLnJlbmRlclRva2VuT25seVN1bW1hcnkoYSwgYik7XG5cdFx0XHRpZiAocHJlc2VydmVTY3JvbGwpIHtcblx0XHRcdFx0dGhpcy5jb250ZW50LnNjcm9sbFRvcCA9IHByZXZTY3JvbGw7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29tcGFyZUlucHV0TWVzc2FnZXMgPSBzaG91bGRDb21wYXJlSW5wdXRNZXNzYWdlcyhhLCBiKTtcblx0XHRjb25zdCBkaWZmID0gY29tcGFyZUlucHV0TWVzc2FnZXNcblx0XHRcdD8gZGlmZlByb21wdFNpZ25hdHVyZShhLmlucHV0TWVzc2FnZXMsIGIuaW5wdXRNZXNzYWdlcylcblx0XHRcdDogZGlmZlByb21wdFNpZ25hdHVyZShbXSwgW10pO1xuXHRcdGNvbnN0IGRyaWZ0ID0gYXBwZW5kVG9vbHNEcmlmdChhcHBlbmRTeXN0ZW1EcmlmdChbLi4uZGlmZi5kcmlmdF0sIGEuc3lzdGVtLCBiLnN5c3RlbSksIGEudG9vbHMsIGIudG9vbHMpO1xuXHRcdGNvbnN0IHsgaW5zaWdodHMsIG9wdGlvbnNEaWZmIH0gPSB0aGlzLmJ1aWxkSW5zaWdodHMoYSwgYiwgZGlmZiwgY29tcGFyZUlucHV0TWVzc2FnZXMpO1xuXG5cdFx0Ly8gQXV0by1leHBhbmQgdGhlIGJyZWFraW5nIGNvbXBvbmVudCBvbmNlIHBlciBzZWxlY3Rpb24gc28gdGhlXG5cdFx0Ly8gZXZpZGVuY2UgaXMgb25lIHNjcm9sbCBhd2F5LCB3aGlsZSByZXNwZWN0aW5nIGEgZGVsaWJlcmF0ZVxuXHRcdC8vIGNvbGxhcHNlIG9uIHN1YnNlcXVlbnQgcmUtcmVuZGVycyBvZiB0aGUgc2FtZSBzZWxlY3Rpb24uXG5cdFx0aWYgKHRoaXMuYXV0b09wZW5lZEZvckluZGV4ICE9PSB0aGlzLnNlbGVjdGVkSW5kZXgpIHtcblx0XHRcdHRoaXMuYXV0b09wZW5lZEZvckluZGV4ID0gdGhpcy5zZWxlY3RlZEluZGV4O1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gcHJpbWFyeUluc2lnaHQoaW5zaWdodHMpPy5jb21wb25lbnQ7XG5cdFx0XHRpZiAodGFyZ2V0KSB7XG5cdFx0XHRcdHRoaXMub3BlbkNvbXBvbmVudHMuYWRkKHRhcmdldCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW5kZXJTdW1tYXJ5KGEsIGIsIGRpZmYsIGNvbXBhcmVJbnB1dE1lc3NhZ2VzLCBpbnNpZ2h0cywgb3B0aW9uc0RpZmYpO1xuXHRcdHRoaXMucmVuZGVyU2lnbmF0dXJlKGEsIGIsIGRpZmYsIGNvbXBhcmVJbnB1dE1lc3NhZ2VzKTtcblx0XHR0aGlzLnJlbmRlclJlcXVlc3RPcHRpb25zKGEsIGIpO1xuXHRcdHRoaXMucmVuZGVyQ29tcG9uZW50cyhkcmlmdCwgYSwgYiwgY29tcGFyZUlucHV0TWVzc2FnZXMsIGRpZmYuY291bnRzLmlkZW50aWNhbCk7XG5cdFx0aWYgKHByZXNlcnZlU2Nyb2xsKSB7XG5cdFx0XHR0aGlzLmNvbnRlbnQuc2Nyb2xsVG9wID0gcHJldlNjcm9sbDtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGQgdGhlIGZpbmRpbmdzIGxpc3QgZm9yIGFuIEFcdTIxOTJCIHBhaXIuIFNoYXJlZCBiZXR3ZWVuIHRoZSBwZXItdHVyblxuXHQgKiBjb250ZW50IHBhbmVsIGFuZCB0aGUgY3Jvc3MtdHVybiBzZXNzaW9uIHJlcG9ydC5cblx0ICovXG5cdHByaXZhdGUgYnVpbGRJbnNpZ2h0cyhhOiBJU2lkZURhdGEsIGI6IElTaWRlRGF0YSwgZGlmZjogSUNhY2hlRGlmZlJlc3VsdCwgY29tcGFyZUlucHV0TWVzc2FnZXM6IGJvb2xlYW4pOiB7IGluc2lnaHRzOiBJQ2FjaGVJbnNpZ2h0W107IG9wdGlvbnNEaWZmOiByZWFkb25seSBJT3B0aW9uRGVsdGFbXSB9IHtcblx0XHRjb25zdCBvcHRpb25zRGlmZiA9IGNvbXB1dGVPcHRpb25zRGlmZihhLCBiKTtcblx0XHRjb25zdCBtaW51dGVzU2luY2VQcmV2aW91cyA9IChiLmV2ZW50LmNyZWF0ZWQuZ2V0VGltZSgpIC0gYS5ldmVudC5jcmVhdGVkLmdldFRpbWUoKSkgLyA2MF8wMDA7XG5cdFx0Y29uc3QgaW5zaWdodHMgPSBjb21wdXRlQ2FjaGVJbnNpZ2h0cyh7XG5cdFx0XHRhTW9kZWw6IGEuZXZlbnQubW9kZWwsXG5cdFx0XHRiTW9kZWw6IGIuZXZlbnQubW9kZWwsXG5cdFx0XHRhU3lzdGVtOiBhLnN5c3RlbSxcblx0XHRcdGJTeXN0ZW06IGIuc3lzdGVtLFxuXHRcdFx0YVRvb2xzOiBhLnRvb2xzLFxuXHRcdFx0YlRvb2xzOiBiLnRvb2xzLFxuXHRcdFx0YU1lc3NhZ2VzOiBhLmlucHV0TWVzc2FnZXMsXG5cdFx0XHRiTWVzc2FnZXM6IGIuaW5wdXRNZXNzYWdlcyxcblx0XHRcdGRpZmYsXG5cdFx0XHRvcHRpb25zRGlmZjogb3B0aW9uc0RpZmYubWFwKGQgPT4gKHsga2V5OiBkLmtleSwgcHJldmlvdXNMYWJlbDogZm9ybWF0T3B0aW9uVmFsdWUoZC5wcmV2aW91cyksIGN1cnJlbnRMYWJlbDogZm9ybWF0T3B0aW9uVmFsdWUoZC5jdXJyZW50KSB9KSksXG5cdFx0XHRoaXRQY3Q6IGNvbXB1dGVDYWNoZUhpdChiLmV2ZW50KSxcblx0XHRcdGlucHV0VG9rZW5zOiBiLmV2ZW50LmlucHV0VG9rZW5zID8/IDAsXG5cdFx0XHRtaW51dGVzU2luY2VQcmV2aW91czogTnVtYmVyLmlzRmluaXRlKG1pbnV0ZXNTaW5jZVByZXZpb3VzKSAmJiBtaW51dGVzU2luY2VQcmV2aW91cyA+PSAwID8gbWludXRlc1NpbmNlUHJldmlvdXMgOiB1bmRlZmluZWQsXG5cdFx0XHRpc0NvbnRpbnVhdGlvbjogYi5yZXF1ZXN0U2hhcGUuaXNDb250aW51YXRpb24sXG5cdFx0XHRwcmV2aW91c0lzQ29udGludWF0aW9uOiBhLnJlcXVlc3RTaGFwZS5pc0NvbnRpbnVhdGlvbixcblx0XHRcdGNvbXBhcmVJbnB1dE1lc3NhZ2VzLFxuXHRcdH0pO1xuXHRcdHJldHVybiB7IGluc2lnaHRzLCBvcHRpb25zRGlmZiB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIE1lbW9pemF0aW9uIGtleSBmb3IgdGhlIHNlc3Npb24gcmVwb3J0LiBUaGUgcmVwb3J0IGlzIHNjb3BlZCB0byB0aGVcblx0ICogdHVybnMgdXAgdG8gKGFuZCBpbmNsdWRpbmcpIHRoZSBzZWxlY3RlZCBvbmUsIHNvIGl0IGlzIHN0YWJsZSB3aGlsZVxuXHQgKiBsYXRlciByZXF1ZXN0cyBzdHJlYW0gaW4uIFVuZGVmaW5lZCB3aGVuIHRoZXJlIGlzIG5vdGhpbmcgdG8gcmVwb3J0XG5cdCAqIChubyBzZXNzaW9uLCBvciBmZXdlciB0aGFuIHR3byB0dXJucyBpbiBzY29wZSkuXG5cdCAqXG5cdCAqIEV2ZXJ5IGluLXNjb3BlIHR1cm4gY29udHJpYnV0ZXMgaXRzIGlkZW50aXR5IEFORCB0b2tlbiBjb3VudHMgdG8gdGhlXG5cdCAqIGtleSBcdTIwMTQgZW5kcG9pbnRzIGFsb25lIHdvdWxkIG1pc3MgYSBtaWRkbGUgdHVybiByZXBsYWNlZCBpbiBwbGFjZSwgYW5kXG5cdCAqIHRva2VuIGNvdW50cyBsaXZlIG9uIHRoZSBldmVudCAobm90IHRoZSBpZC1jYWNoZWQgcmVzb2x2ZWQgY29udGVudCksXG5cdCAqIHNvIGEgdXNhZ2UgdXBkYXRlIGFycml2aW5nIGFmdGVyIHRoZSBmaXJzdCByZW5kZXIgbXVzdCBpbnZhbGlkYXRlIHRoZVxuXHQgKiBtZW1vaXplZCByZXBvcnQgb3IgdGhlIG92ZXJhbGwgaGl0IHJhdGUgc3RheXMgc3RhbGUuXG5cdCAqL1xuXHRwcml2YXRlIHNlc3Npb25SZXBvcnRLZXkoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuY3VycmVudFNlc3Npb25SZXNvdXJjZSB8fCB0aGlzLnNlbGVjdGVkSW5kZXggPCAxKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXG5cdFx0XHR0aGlzLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFsuLi4odGhpcy5zZWxlY3RlZEFnZW50cyA/PyBbXSldLnNvcnQoKS5qb2luKCcsJyksXG5cdFx0XTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8PSB0aGlzLnNlbGVjdGVkSW5kZXg7IGkrKykge1xuXHRcdFx0Y29uc3QgdHVybiA9IHRoaXMubW9kZWxUdXJuc1tpXTtcblx0XHRcdHBhcnRzLnB1c2goYCR7dHVybi5pZCA/PyB0dXJuLmNyZWF0ZWQuZ2V0VGltZSgpfToke3R1cm4uaW5wdXRUb2tlbnMgPz8gJyd9OiR7dHVybi5jYWNoZWRUb2tlbnMgPz8gJyd9YCk7XG5cdFx0fVxuXHRcdHJldHVybiBwYXJ0cy5qb2luKCd8Jyk7XG5cdH1cblxuXHQvKipcblx0ICogUnVuIHRoZSBpbnNpZ2h0cyBlbmdpbmUgb3ZlciBldmVyeSBjb25zZWN1dGl2ZSB0dXJuIHBhaXIgdXAgdG8gdGhlXG5cdCAqIHNlbGVjdGVkIHR1cm4gYW5kIGFnZ3JlZ2F0ZSB0aGUgb3V0Y29tZS4gTWVtb2l6ZWQgcGVyIChzZXNzaW9uLFxuXHQgKiBzZWxlY3Rpb24gcHJlZml4LCBhZ2VudCBmaWx0ZXIpIFx1MjAxNCBwZXItdHVybiByZXNvbHV0aW9uIGlzIGNhY2hlZCBpblxuXHQgKiB7QGxpbmsgcmVzb2x2ZWRDYWNoZX0sIHNvIGV2ZW4gYSBjb2xkIHJ1biBpcyBvbmUgcGFzcyBvdmVyIGluLW1lbW9yeVxuXHQgKiBldmVudHMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIGVuc3VyZVNlc3Npb25SZXBvcnQoKTogUHJvbWlzZTxJU2Vzc2lvbkNhY2hlUmVwb3J0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5zZXNzaW9uUmVwb3J0S2V5KCk7XG5cdFx0aWYgKGtleSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLnNlc3Npb25SZXBvcnRDYWNoZT8ua2V5ID09PSBrZXkgPyB0aGlzLnNlc3Npb25SZXBvcnRDYWNoZS5yZXBvcnQgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGNhY2hlZCkge1xuXHRcdFx0cmV0dXJuIGNhY2hlZDtcblx0XHR9XG5cdFx0Y29uc3Qgc2NvcGVkVHVybnMgPSB0aGlzLm1vZGVsVHVybnMuc2xpY2UoMCwgdGhpcy5zZWxlY3RlZEluZGV4ICsgMSk7XG5cdFx0Y29uc3Qgc2lkZXMgPSBhd2FpdCBQcm9taXNlLmFsbChzY29wZWRUdXJucy5tYXAodCA9PiB0aGlzLnJlc29sdmVTaWRlKHQpKSk7XG5cdFx0Y29uc3QgcGFpcnM6IElTZXNzaW9uUGFpck91dGNvbWVbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgc2lkZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGEgPSBzaWRlc1tpIC0gMV07XG5cdFx0XHRjb25zdCBiID0gc2lkZXNbaV07XG5cdFx0XHRjb25zdCBjb21wYXJlID0gc2hvdWxkQ29tcGFyZUlucHV0TWVzc2FnZXMoYSwgYik7XG5cdFx0XHRjb25zdCBkaWZmID0gY29tcGFyZSA/IGRpZmZQcm9tcHRTaWduYXR1cmUoYS5pbnB1dE1lc3NhZ2VzLCBiLmlucHV0TWVzc2FnZXMpIDogZGlmZlByb21wdFNpZ25hdHVyZShbXSwgW10pO1xuXHRcdFx0Y29uc3QgeyBpbnNpZ2h0cyB9ID0gdGhpcy5idWlsZEluc2lnaHRzKGEsIGIsIGRpZmYsIGNvbXBhcmUpO1xuXHRcdFx0Y29uc3QgaW5wdXRUb2tlbnMgPSBiLmV2ZW50LmlucHV0VG9rZW5zID8/IDA7XG5cdFx0XHRjb25zdCBjYWNoZWRUb2tlbnMgPSBiLmV2ZW50LmNhY2hlZFRva2VucyA/PyAwO1xuXHRcdFx0cGFpcnMucHVzaCh7XG5cdFx0XHRcdHR1cm5JbmRleDogaSxcblx0XHRcdFx0Y2F0ZWdvcnk6IGNhdGVnb3JpemVDYWNoZUJyZWFrKGluc2lnaHRzKSxcblx0XHRcdFx0bG9zdFRva2VuczogTWF0aC5tYXgoMCwgaW5wdXRUb2tlbnMgLSBjYWNoZWRUb2tlbnMpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdC8vIEFsbCBpbi1zY29wZSB0dXJucyAoaW5jbHVkaW5nIHRoZSBmaXJzdCwgd2hpY2ggaGFzIG5vIHBhaXIpIGZlZWRcblx0XHQvLyB0aGUgdG9rZW4td2VpZ2h0ZWQgb3ZlcmFsbCBoaXQgcmF0ZS5cblx0XHRjb25zdCB0dXJuVG9rZW5zID0gc2NvcGVkVHVybnMubWFwKHQgPT4gKHsgaW5wdXRUb2tlbnM6IHQuaW5wdXRUb2tlbnMgPz8gMCwgY2FjaGVkVG9rZW5zOiB0LmNhY2hlZFRva2VucyA/PyAwIH0pKTtcblx0XHRjb25zdCByZXBvcnQgPSBidWlsZFNlc3Npb25DYWNoZVJlcG9ydChwYWlycywgdHVyblRva2Vucyk7XG5cdFx0dGhpcy5zZXNzaW9uUmVwb3J0Q2FjaGUgPSB7IGtleSwgcmVwb3J0IH07XG5cdFx0cmV0dXJuIHJlcG9ydDtcblx0fVxuXG5cdC8qKiBSZW5kZXIgdGhlIHNlc3Npb24tbGV2ZWwgY2FjaGUgaGVhbHRoIGNhcmQgZnJvbSB0aGUgY3Jvc3MtdHVybiByZXBvcnQuICovXG5cdHByaXZhdGUgcmVuZGVyU2Vzc2lvbkhlYWx0aChjb250YWluZXI6IEhUTUxFbGVtZW50LCByZXBvcnQ6IElTZXNzaW9uQ2FjaGVSZXBvcnQpOiB2b2lkIHtcblx0XHRET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNoYXQtZGVidWctY2FjaGUtY2FyZC1oJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLnNlc3Npb25IZWFsdGgnLCBcIlNlc3Npb24gY2FjaGUgaGVhbHRoXCIpKSk7XG5cdFx0Ly8gVG9rZW4td2VpZ2h0ZWQgb3ZlcmFsbCBoaXQ6IHBlci1yZXF1ZXN0IHBlcmNlbnRhZ2VzIG92ZXJ3ZWlnaHRcblx0XHQvLyBzbWFsbCB1dGlsaXR5IGNhbGxzICh0aXRsZXMsIHN1bW1hcmllcyk7IHdlaWdodGluZyBieSBpbnB1dCB0b2tlbnNcblx0XHQvLyBzaG93cyB3aGF0IHRoZSBzZXNzaW9uIGFjdHVhbGx5IGNvc3QuXG5cdFx0aWYgKHJlcG9ydC5vdmVyYWxsKSB7XG5cdFx0XHRjb25zdCBoZWFkbGluZSA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1jYXJkLWhlYWRsaW5lJykpO1xuXHRcdFx0aGVhZGxpbmUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLnNlc3Npb25PdmVyYWxsSGl0JywgXCJ7MH0lIG92ZXJhbGwgY2FjaGUgaGl0XCIsIGZvcm1hdENhY2hlUGN0KHJlcG9ydC5vdmVyYWxsLmhpdFBjdCkpO1xuXHRcdFx0Y29uc3Qgc3ViID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5jaGF0LWRlYnVnLWNhY2hlLWNhcmQtc3ViJykpO1xuXHRcdFx0c3ViLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5zZXNzaW9uT3ZlcmFsbFN1YicsXG5cdFx0XHRcdFwiezB9IG9mIHsxfSBpbnB1dCB0b2tlbnMgc2VydmVkIGZyb20gY2FjaGUgYWNyb3NzIHsyfSByZXF1ZXN0cyAodG9rZW4td2VpZ2h0ZWQpXCIsXG5cdFx0XHRcdG51bWJlckZvcm1hdHRlci52YWx1ZS5mb3JtYXQocmVwb3J0Lm92ZXJhbGwuY2FjaGVkVG9rZW5zKSxcblx0XHRcdFx0bnVtYmVyRm9ybWF0dGVyLnZhbHVlLmZvcm1hdChyZXBvcnQub3ZlcmFsbC5pbnB1dFRva2VucyksXG5cdFx0XHRcdHJlcG9ydC5vdmVyYWxsLnR1cm5Db3VudCk7XG5cdFx0fVxuXHRcdGNvbnN0IHN0YXRzTGluZSA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1zZXNzaW9uLWhlYWx0aC1zdGF0cycpKTtcblx0XHRzdGF0c0xpbmUudGV4dENvbnRlbnQgPSByZXBvcnQuYXZvaWRhYmxlTG9zdFRva2VucyA+IDBcblx0XHRcdD8gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5zZXNzaW9uSGVhbHRoU3RhdHNMb3N0Jyxcblx0XHRcdFx0XCJ7MH0gb2YgezF9IHJlcXVlc3QgcGFpcnMgaGVhbHRoeSBcdTAwQjcgfnsyfSB0b2tlbnMgcmVjb21wdXRlZCBhdm9pZGFibHlcIixcblx0XHRcdFx0cmVwb3J0LmhlYWx0aHlDb3VudCwgcmVwb3J0LnBhaXJDb3VudCwgbnVtYmVyRm9ybWF0dGVyLnZhbHVlLmZvcm1hdChyZXBvcnQuYXZvaWRhYmxlTG9zdFRva2VucykpXG5cdFx0XHQ6IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuc2Vzc2lvbkhlYWx0aFN0YXRzJyxcblx0XHRcdFx0XCJ7MH0gb2YgezF9IHJlcXVlc3QgcGFpcnMgaGVhbHRoeVwiLFxuXHRcdFx0XHRyZXBvcnQuaGVhbHRoeUNvdW50LCByZXBvcnQucGFpckNvdW50KTtcblxuXHRcdGlmIChyZXBvcnQuYnlDYXRlZ29yeS5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBjaGlwcyA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1zZXNzaW9uLWhlYWx0aC1jaGlwcycpKTtcblx0XHRcdGZvciAoY29uc3Qgc3RhdCBvZiByZXBvcnQuYnlDYXRlZ29yeSkge1xuXHRcdFx0XHRjb25zdCBjaGlwID0gRE9NLmFwcGVuZChjaGlwcywgJChgc3Bhbi5jaGF0LWRlYnVnLWNhY2hlLXNlc3Npb24taGVhbHRoLWNoaXAuY2F1c2UtJHtzdGF0LmNhdGVnb3J5fWApKTtcblx0XHRcdFx0RE9NLmFwcGVuZChjaGlwLCAkKGBzcGFuLmNvZGljb24uY29kaWNvbi0ke2NhdGVnb3J5SWNvbihzdGF0LmNhdGVnb3J5KX1gLCB7ICdhcmlhLWhpZGRlbic6ICd0cnVlJyB9KSk7XG5cdFx0XHRcdERPTS5hcHBlbmQoY2hpcCwgJCgnc3BhbicsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5zZXNzaW9uSGVhbHRoQ2hpcCcsIFwiezB9IFx1MDBEN3sxfSBcdTAwQjcgezJ9IHRva1wiLCBjYWNoZUJyZWFrQ2F0ZWdvcnlMYWJlbChzdGF0LmNhdGVnb3J5KSwgc3RhdC5jb3VudCwgbnVtYmVyRm9ybWF0dGVyLnZhbHVlLmZvcm1hdChzdGF0Lmxvc3RUb2tlbnMpKSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChyZXBvcnQuZmluZGluZ3MubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgbGlzdCA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1maW5kaW5ncycpKTtcblx0XHRcdGZvciAoY29uc3QgZmluZGluZyBvZiByZXBvcnQuZmluZGluZ3MpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJGaW5kaW5nKGxpc3QsIGZpbmRpbmcpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cblx0LyoqXG5cdCAqIFNlbGVjdCBhIHR1cm4gKHRoZSBCIHNpZGUgb2YgdGhlIGRpZmYpIGFuZCByZWZyZXNoIG9ubHkgdGhlIGNvbnRlbnRcblx0ICogcGFuZWwuIFRoZSByYWlsIGlzIHVwZGF0ZWQgaW4gcGxhY2UgXFx1MjAxNCBqdXN0IHRoZSBzZWxlY3RlZCBjbGFzc2VzIG1vdmUgXFx1MjAxNFxuXHQgKiBzbyBjbGlja2luZyBvciBhcnJvd2luZyB0aHJvdWdoIHR1cm5zIG5ldmVyIHJlYnVpbGRzIHRoZSBsaXN0LCBrZWVwaW5nXG5cdCAqIGZvY3VzIGFuZCBzY3JvbGwgcG9zaXRpb24gc3RhYmxlLlxuXHQgKi9cblx0cHJpdmF0ZSBzZWxlY3RUdXJuKGluZGV4OiBudW1iZXIsIGZvY3VzT3B0aW9ucz86IEZvY3VzT3B0aW9ucyk6IHZvaWQge1xuXHRcdGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gdGhpcy5tb2RlbFR1cm5zLmxlbmd0aCB8fCBpbmRleCA9PT0gdGhpcy5zZWxlY3RlZEluZGV4KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHByZXZSb3cgPSB0aGlzLnJhaWxSb3dzQnlJbmRleC5nZXQodGhpcy5zZWxlY3RlZEluZGV4KTtcblx0XHRpZiAocHJldlJvdykge1xuXHRcdFx0cHJldlJvdy5jbGFzc0xpc3QucmVtb3ZlKCdpcy1zZWxlY3RlZCcpO1xuXHRcdFx0cHJldlJvdy5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtY3VycmVudCcpO1xuXHRcdH1cblx0XHR0aGlzLnNlbGVjdGVkSW5kZXggPSBpbmRleDtcblx0XHRjb25zdCBuZXh0Um93ID0gdGhpcy5yYWlsUm93c0J5SW5kZXguZ2V0KGluZGV4KTtcblx0XHRpZiAobmV4dFJvdykge1xuXHRcdFx0bmV4dFJvdy5jbGFzc0xpc3QuYWRkKCdpcy1zZWxlY3RlZCcpO1xuXHRcdFx0bmV4dFJvdy5zZXRBdHRyaWJ1dGUoJ2FyaWEtY3VycmVudCcsICd0cnVlJyk7XG5cdFx0XHRpZiAoZm9jdXNPcHRpb25zKSB7XG5cdFx0XHRcdG5leHRSb3cuZm9jdXMoZm9jdXNPcHRpb25zKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgdG9rZW4gPSArK3RoaXMucmVuZGVyVG9rZW47XG5cdFx0dm9pZCB0aGlzLnJlbmRlckNvbnRlbnRJbm5lcih0b2tlbiwgKCkgPT4gdG9rZW4gPT09IHRoaXMucmVuZGVyVG9rZW4pO1xuXHR9XG5cblx0LyoqIE1vdmUgdGhlIHNlbGVjdGlvbiB0byB0aGUgcHJldmlvdXMvbmV4dCB2aXNpYmxlIHR1cm4gcm93IChhcnJvdyBrZXlzKS4gKi9cblx0cHJpdmF0ZSBtb3ZlU2VsZWN0aW9uKGRlbHRhOiBudW1iZXIpOiB2b2lkIHtcblx0XHQvLyBgcmFpbFJvd3NCeUluZGV4YCBpcyBwb3B1bGF0ZWQgaW4gcmVuZGVyICh2aXN1YWwpIG9yZGVyIGFuZCBgTWFwYFxuXHRcdC8vIGl0ZXJhdGlvbiBwcmVzZXJ2ZXMgaW5zZXJ0aW9uIG9yZGVyLCBzbyB0aGUga2V5cyBhbHJlYWR5IG1hdGNoIHRoZVxuXHRcdC8vIG9yZGVyIHJvd3MgYXBwZWFyIGluIHRoZSByYWlsIFx1MjAxNCBubyBuZWVkIHRvIHNvcnQgb24gZXZlcnkga2V5cHJlc3MuXG5cdFx0Y29uc3QgaW5kaWNlcyA9IFsuLi50aGlzLnJhaWxSb3dzQnlJbmRleC5rZXlzKCldO1xuXHRcdGlmIChpbmRpY2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwb3MgPSBpbmRpY2VzLmluZGV4T2YodGhpcy5zZWxlY3RlZEluZGV4KTtcblx0XHRjb25zdCBuZXh0UG9zID0gcG9zID09PSAtMVxuXHRcdFx0PyAoZGVsdGEgPiAwID8gMCA6IGluZGljZXMubGVuZ3RoIC0gMSlcblx0XHRcdDogTWF0aC5taW4oaW5kaWNlcy5sZW5ndGggLSAxLCBNYXRoLm1heCgwLCBwb3MgKyBkZWx0YSkpO1xuXHRcdHRoaXMuc2VsZWN0VHVybihpbmRpY2VzW25leHRQb3NdLCB7IHByZXZlbnRTY3JvbGw6IGZhbHNlIH0pO1xuXHR9XG5cblxuXHQvKipcblx0ICogUmVuZGVyIHRoZSBhZ2VudCBmaWx0ZXIgZHJvcGRvd24gYXQgdGhlIHRvcCBvZiB0aGUgcmFpbC4gSGlkZGVuIHdoZW4gYVxuXHQgKiBzZXNzaW9uIG9ubHkgdXNlZCBhIHNpbmdsZSBhZ2VudCAobm90aGluZyB0byBmaWx0ZXIpLlxuXHQgKi9cblx0cHJpdmF0ZSByZW5kZXJSYWlsVG9vbGJhcihhZ2VudENvdW50czogTWFwPHN0cmluZywgbnVtYmVyPik6IHZvaWQge1xuXHRcdGNvbnN0IGFnZW50cyA9IFsuLi5hZ2VudENvdW50cy5rZXlzKCldO1xuXHRcdGlmIChhZ2VudHMubGVuZ3RoIDw9IDEpIHtcblx0XHRcdERPTS5oaWRlKHRoaXMucmFpbFRvb2xiYXIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRET00uc2hvdyh0aGlzLnJhaWxUb29sYmFyKTtcblxuXHRcdGNvbnN0IHNlbGVjdGVkID0gdGhpcy5zZWxlY3RlZEFnZW50cyA/PyBuZXcgU2V0KGFnZW50cyk7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRDb3VudCA9IGFnZW50cy5maWx0ZXIoYSA9PiBzZWxlY3RlZC5oYXMoYSkpLmxlbmd0aDtcblxuXHRcdGNvbnN0IGxhYmVsID0gRE9NLmFwcGVuZCh0aGlzLnJhaWxUb29sYmFyLCAkKCdzcGFuLmNoYXQtZGVidWctY2FjaGUtZmlsdGVyLWxhYmVsJykpO1xuXHRcdGxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5maWx0ZXJBZ2VudHNMYWJlbCcsIFwiQWdlbnRcIik7XG5cblx0XHRjb25zdCBidXR0b24gPSBET00uYXBwZW5kKHRoaXMucmFpbFRvb2xiYXIsICQoJ2J1dHRvbi5jaGF0LWRlYnVnLWNhY2hlLWZpbHRlci1idXR0b24nKSk7XG5cdFx0YnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1oYXNwb3B1cCcsICdtZW51Jyk7XG5cdFx0Y29uc3Qgc3VtbWFyeSA9IHNlbGVjdGVkQ291bnQgPT09IGFnZW50cy5sZW5ndGhcblx0XHRcdD8gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5maWx0ZXJBbGwnLCBcIkFsbCBhZ2VudHMgKHswfSlcIiwgYWdlbnRzLmxlbmd0aClcblx0XHRcdDogc2VsZWN0ZWRDb3VudCA9PT0gMVxuXHRcdFx0XHQ/IGFnZW50cy5maW5kKGEgPT4gc2VsZWN0ZWQuaGFzKGEpKSA/PyAnJ1xuXHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuZmlsdGVyU29tZScsIFwiezB9IG9mIHsxfSBhZ2VudHNcIiwgc2VsZWN0ZWRDb3VudCwgYWdlbnRzLmxlbmd0aCk7XG5cdFx0Y29uc3QgdGV4dCA9IERPTS5hcHBlbmQoYnV0dG9uLCAkKCdzcGFuLmNoYXQtZGVidWctY2FjaGUtZmlsdGVyLWJ1dHRvbi10ZXh0JykpO1xuXHRcdHRleHQudGV4dENvbnRlbnQgPSBzdW1tYXJ5O1xuXHRcdHRleHQudGl0bGUgPSBzdW1tYXJ5O1xuXHRcdERPTS5hcHBlbmQoYnV0dG9uLCAkKCdzcGFuLmNvZGljb24uY29kaWNvbi1jaGV2cm9uLWRvd24uY2hhdC1kZWJ1Zy1jYWNoZS1maWx0ZXItY2hldnJvbicsIHsgJ2FyaWEtaGlkZGVuJzogJ3RydWUnIH0pKTtcblxuXHRcdHRoaXMucmFpbERpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGJ1dHRvbiwgRE9NLkV2ZW50VHlwZS5DTElDSywgKCkgPT4gdGhpcy5zaG93QWdlbnRGaWx0ZXJNZW51KGJ1dHRvbiwgYWdlbnRDb3VudHMpKSk7XG5cdH1cblxuXHRwcml2YXRlIHNob3dBZ2VudEZpbHRlck1lbnUoYW5jaG9yOiBIVE1MRWxlbWVudCwgYWdlbnRDb3VudHM6IE1hcDxzdHJpbmcsIG51bWJlcj4pOiB2b2lkIHtcblx0XHRjb25zdCBhZ2VudHMgPSBbLi4uYWdlbnRDb3VudHMua2V5cygpXS5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpO1xuXHRcdGNvbnN0IHNlbGVjdGVkID0gdGhpcy5zZWxlY3RlZEFnZW50cyA/PyBuZXcgU2V0KGFnZW50cyk7XG5cdFx0Y29uc3QgYWdlbnRBY3Rpb25zOiBJQWN0aW9uW10gPSBhZ2VudHMubWFwKGFnZW50ID0+IHRvQWN0aW9uKHtcblx0XHRcdGlkOiBgY2hhdERlYnVnLmNhY2hlLmFnZW50LiR7YWdlbnR9YCxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmFnZW50SXRlbScsIFwiezB9ICh7MX0pXCIsIGFnZW50LCBhZ2VudENvdW50cy5nZXQoYWdlbnQpID8/IDApLFxuXHRcdFx0Y2hlY2tlZDogc2VsZWN0ZWQuaGFzKGFnZW50KSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy50b2dnbGVBZ2VudChhZ2VudCksXG5cdFx0fSkpO1xuXHRcdGNvbnN0IHNlbGVjdEFsbCA9IHRvQWN0aW9uKHtcblx0XHRcdGlkOiAnY2hhdERlYnVnLmNhY2hlLmFnZW50U2VsZWN0QWxsJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLnNlbGVjdEFsbEFnZW50cycsIFwiU2hvdyBBbGwgQWdlbnRzXCIpLFxuXHRcdFx0cnVuOiAoKSA9PiB0aGlzLnNldEFnZW50U2VsZWN0aW9uKG5ldyBTZXQoYWdlbnRzKSksXG5cdFx0fSk7XG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gYW5jaG9yLFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gW3NlbGVjdEFsbCwgbmV3IFNlcGFyYXRvcigpLCAuLi5hZ2VudEFjdGlvbnNdLFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqIFRvZ2dsZSBhIHNpbmdsZSBhZ2VudCBvbi9vZmYuIE5ldmVyIGxlYXZlcyB0aGUgc2VsZWN0aW9uIGVtcHR5LiAqL1xuXHRwcml2YXRlIHRvZ2dsZUFnZW50KGFnZW50OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBhZ2VudHMgPSBbLi4uY29tcHV0ZUFnZW50Q291bnRzKHRoaXMuYWxsTW9kZWxUdXJucykua2V5cygpXTtcblx0XHRjb25zdCBuZXh0ID0gbmV3IFNldCh0aGlzLnNlbGVjdGVkQWdlbnRzID8/IGFnZW50cyk7XG5cdFx0aWYgKG5leHQuaGFzKGFnZW50KSkge1xuXHRcdFx0bmV4dC5kZWxldGUoYWdlbnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRuZXh0LmFkZChhZ2VudCk7XG5cdFx0fVxuXHRcdHRoaXMuc2V0QWdlbnRTZWxlY3Rpb24obmV4dC5zaXplID09PSAwID8gbmV3IFNldChhZ2VudHMpIDogbmV4dCk7XG5cdH1cblxuXHRwcml2YXRlIHNldEFnZW50U2VsZWN0aW9uKGFnZW50czogU2V0PHN0cmluZz4pOiB2b2lkIHtcblx0XHQvLyBSZW1lbWJlciB0aGUgY3VycmVudCB0dXJuIHNvIHdlIGNhbiBrZWVwIHRoZSB1c2VyIG9uIGl0IGFmdGVyIHRoZVxuXHRcdC8vIGxpc3QgaXMgcmVmaWx0ZXJlZCAoaWYgaXQgc3Vydml2ZXMgdGhlIG5ldyBmaWx0ZXIpLlxuXHRcdHRoaXMucGVuZGluZ1NlbGVjdFR1cm4gPSB0aGlzLm1vZGVsVHVybnNbdGhpcy5zZWxlY3RlZEluZGV4XTtcblx0XHR0aGlzLnNlbGVjdGVkQWdlbnRzID0gYWdlbnRzO1xuXHRcdHRoaXMucmVuZGVyKCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVuZGVyIGEgY29sbGFwc2libGUgcGVyLWNodW5rIGJyZWFrZG93biB0YWJsZS4gTGlzdHMgZXZlcnkgc2lnbmF0dXJlXG5cdCAqIGNodW5rIChpbmNsdWRpbmcgaWRlbnRpY2FsIG9uZXMgdGhlIGJhciBtYXkgaGlkZSkgd2l0aCBpdHMgZXhhY3QgY2hhclxuXHQgKiBjb3VudCBvbiBlYWNoIHNpZGUgYW5kIGl0cyBzaGFyZSBvZiB0aGUgY3VycmVudCByZXF1ZXN0IFxcdTIwMTQgaS5lLiB3aGVyZSB0aGVcblx0ICogYnl0ZXMgYXJlIGFsbG9jYXRlZC5cblx0ICovXG5cdHByaXZhdGUgcmVuZGVyQ2h1bmtCcmVha2Rvd24oXG5cdFx0c2VjdGlvbjogSFRNTEVsZW1lbnQsXG5cdFx0cm93czogcmVhZG9ubHkgSUNodW5rQnJlYWtkb3duUm93W10sXG5cdFx0dG90YWxBOiBudW1iZXIsXG5cdFx0dG90YWxCOiBudW1iZXIsXG5cdFx0YlRva2Vuc1BlckNoYXI6IG51bWJlciB8IHVuZGVmaW5lZCxcblx0KTogdm9pZCB7XG5cdFx0Y29uc3Qgd3JhcCA9IERPTS5hcHBlbmQoc2VjdGlvbiwgJCgnLmNoYXQtZGVidWctY2FjaGUtc2lnLWJyZWFrZG93bicpKTtcblx0XHRpZiAodGhpcy5zaWdCcmVha2Rvd25PcGVuKSB7XG5cdFx0XHR3cmFwLmNsYXNzTGlzdC5hZGQoJ29wZW4nKTtcblx0XHR9XG5cdFx0Y29uc3QgdG9nZ2xlID0gRE9NLmFwcGVuZCh3cmFwLCAkKCdidXR0b24uY2hhdC1kZWJ1Zy1jYWNoZS1zaWctYnJlYWtkb3duLXRvZ2dsZScpKTtcblx0XHR0b2dnbGUuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgdGhpcy5zaWdCcmVha2Rvd25PcGVuID8gJ3RydWUnIDogJ2ZhbHNlJyk7XG5cdFx0RE9NLmFwcGVuZCh0b2dnbGUsICQoJ3NwYW4uY29kaWNvbi5jb2RpY29uLWNoZXZyb24tcmlnaHQuY2hhdC1kZWJ1Zy1jYWNoZS1zaWctYnJlYWtkb3duLWNoZXYnLCB7ICdhcmlhLWhpZGRlbic6ICd0cnVlJyB9KSk7XG5cdFx0RE9NLmFwcGVuZCh0b2dnbGUsICQoJ3NwYW4nLCB1bmRlZmluZWQsIGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuY2h1bmtCcmVha2Rvd24nLCBcIkNodW5rIGJyZWFrZG93blwiKSkpO1xuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRvZ2dsZSwgRE9NLkV2ZW50VHlwZS5DTElDSywgKCkgPT4ge1xuXHRcdFx0dGhpcy5zaWdCcmVha2Rvd25PcGVuID0gIXRoaXMuc2lnQnJlYWtkb3duT3Blbjtcblx0XHRcdGNvbnN0IHRva2VuID0gKyt0aGlzLnJlbmRlclRva2VuO1xuXHRcdFx0dm9pZCB0aGlzLnJlbmRlckNvbnRlbnRJbm5lcih0b2tlbiwgKCkgPT4gdG9rZW4gPT09IHRoaXMucmVuZGVyVG9rZW4sIHRydWUpO1xuXHRcdH0pKTtcblx0XHRpZiAoIXRoaXMuc2lnQnJlYWtkb3duT3Blbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhYmxlID0gRE9NLmFwcGVuZCh3cmFwLCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1zaWctYnJlYWtkb3duLXRhYmxlJywgeyByb2xlOiAndGFibGUnIH0pKTtcblx0XHRjb25zdCBoZWFkID0gRE9NLmFwcGVuZCh0YWJsZSwgJCgnLmNoYXQtZGVidWctY2FjaGUtc2lnLWJyZWFrZG93bi1yb3cuaGVhZCcsIHsgcm9sZTogJ3JvdycgfSkpO1xuXHRcdERPTS5hcHBlbmQoaGVhZCwgJCgnLmNlbGwuaWR4JywgeyByb2xlOiAnY29sdW1uaGVhZGVyJyB9LCBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmNodW5rSWR4Q29sJywgXCIjXCIpKSk7XG5cdFx0RE9NLmFwcGVuZChoZWFkLCAkKCcuY2VsbC5jaHVuaycsIHsgcm9sZTogJ2NvbHVtbmhlYWRlcicgfSwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5jaHVua0NvbCcsIFwiQ2h1bmtcIikpKTtcblx0XHRET00uYXBwZW5kKGhlYWQsICQoJy5jZWxsLm51bScsIHsgcm9sZTogJ2NvbHVtbmhlYWRlcicgfSwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5wcmV2Q29sJywgXCJQcmV2aW91c1wiKSkpO1xuXHRcdERPTS5hcHBlbmQoaGVhZCwgJCgnLmNlbGwubnVtJywgeyByb2xlOiAnY29sdW1uaGVhZGVyJyB9LCBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmN1cnJDb2wnLCBcIkN1cnJlbnRcIikpKTtcblx0XHRET00uYXBwZW5kKGhlYWQsICQoJy5jZWxsLm51bScsIHsgcm9sZTogJ2NvbHVtbmhlYWRlcicgfSwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS50b2tDb2wnLCBcIlxcdTIyNDggdG9rXCIpKSk7XG5cdFx0RE9NLmFwcGVuZChoZWFkLCAkKCcuY2VsbC5udW0nLCB7IHJvbGU6ICdjb2x1bW5oZWFkZXInIH0sIGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUucGN0Q29sJywgXCIlIG9mIGN1cnJlbnRcIikpKTtcblxuXHRcdHJvd3MuZm9yRWFjaCgociwgaSkgPT4ge1xuXHRcdFx0Y29uc3Qgcm93ID0gRE9NLmFwcGVuZCh0YWJsZSwgJCgnLmNoYXQtZGVidWctY2FjaGUtc2lnLWJyZWFrZG93bi1yb3cnLCB7IHJvbGU6ICdyb3cnIH0pKTtcblx0XHRcdGlmIChyLmRyaWZ0KSB7XG5cdFx0XHRcdHJvdy5jbGFzc0xpc3QuYWRkKCdpcy1kcmlmdCcpO1xuXHRcdFx0fVxuXHRcdFx0RE9NLmFwcGVuZChyb3csICQoJy5jZWxsLmlkeCcsIHsgcm9sZTogJ2NlbGwnIH0sIFN0cmluZyhpKSkpO1xuXHRcdFx0Y29uc3QgY2h1bmsgPSBET00uYXBwZW5kKHJvdywgJCgnLmNlbGwuY2h1bmsnLCB7IHJvbGU6ICdjZWxsJyB9KSk7XG5cdFx0XHRET00uYXBwZW5kKGNodW5rLCAkKGBzcGFuLmNoYXQtZGVidWctY2FjaGUtc2lnLXN3YXRjaC5yb2xlLSR7cm9sZUNsYXNzKHIucm9sZSl9YCwgeyAnYXJpYS1oaWRkZW4nOiAndHJ1ZScgfSkpO1xuXHRcdFx0RE9NLmFwcGVuZChjaHVuaywgJCgnc3Bhbi5jaGF0LWRlYnVnLWNhY2hlLXNpZy1icmVha2Rvd24tY2h1bmstbGFiZWwnLCB1bmRlZmluZWQsIHIubGFiZWwpKTtcblx0XHRcdERPTS5hcHBlbmQocm93LCAkKCcuY2VsbC5udW0nLCB7IHJvbGU6ICdjZWxsJyB9LCByLmFDaGFycyAhPT0gdW5kZWZpbmVkID8gbnVtYmVyRm9ybWF0dGVyLnZhbHVlLmZvcm1hdChyLmFDaGFycykgOiAnXFx1MjAxNCcpKTtcblx0XHRcdERPTS5hcHBlbmQocm93LCAkKCcuY2VsbC5udW0nLCB7IHJvbGU6ICdjZWxsJyB9LCByLmJDaGFycyAhPT0gdW5kZWZpbmVkID8gbnVtYmVyRm9ybWF0dGVyLnZhbHVlLmZvcm1hdChyLmJDaGFycykgOiAnXFx1MjAxNCcpKTtcblx0XHRcdC8vIFRva2VuIGVzdGltYXRlIGZvciB0aGUgY3VycmVudCBzaWRlLCBjYWxpYnJhdGVkIGFnYWluc3QgdGhlXG5cdFx0XHQvLyByZXF1ZXN0J3MgcmVwb3J0ZWQgaW5wdXQgdG9rZW5zIChjaGFycyBcXHUwMGQ3IHRva2Vucy1wZXItY2hhcikuXG5cdFx0XHRjb25zdCB0b2sgPSByLmJDaGFycyAhPT0gdW5kZWZpbmVkICYmIGJUb2tlbnNQZXJDaGFyICE9PSB1bmRlZmluZWQgPyBNYXRoLnJvdW5kKHIuYkNoYXJzICogYlRva2Vuc1BlckNoYXIpIDogdW5kZWZpbmVkO1xuXHRcdFx0RE9NLmFwcGVuZChyb3csICQoJy5jZWxsLm51bScsIHsgcm9sZTogJ2NlbGwnIH0sIHRvayAhPT0gdW5kZWZpbmVkID8gbnVtYmVyRm9ybWF0dGVyLnZhbHVlLmZvcm1hdCh0b2spIDogJ1xcdTIwMTQnKSk7XG5cdFx0XHRjb25zdCBwY3QgPSByLmJDaGFycyAhPT0gdW5kZWZpbmVkICYmIHRvdGFsQiA+IDAgPyAoci5iQ2hhcnMgLyB0b3RhbEIpICogMTAwIDogdW5kZWZpbmVkO1xuXHRcdFx0RE9NLmFwcGVuZChyb3csICQoJy5jZWxsLm51bScsIHsgcm9sZTogJ2NlbGwnIH0sIHBjdCAhPT0gdW5kZWZpbmVkID8gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5wY3RWYWx1ZScsIFwiezB9JVwiLCBwY3QudG9GaXhlZCgxKSkgOiAnXFx1MjAxNCcpKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRvdGFscyA9IERPTS5hcHBlbmQodGFibGUsICQoJy5jaGF0LWRlYnVnLWNhY2hlLXNpZy1icmVha2Rvd24tcm93LnRvdGFsJywgeyByb2xlOiAncm93JyB9KSk7XG5cdFx0RE9NLmFwcGVuZCh0b3RhbHMsICQoJy5jZWxsLmlkeCcsIHsgcm9sZTogJ2NlbGwnIH0sICcnKSk7XG5cdFx0RE9NLmFwcGVuZCh0b3RhbHMsICQoJy5jZWxsLmNodW5rJywgeyByb2xlOiAnY2VsbCcgfSwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS50b3RhbFJvdycsIFwiVG90YWxcIikpKTtcblx0XHRET00uYXBwZW5kKHRvdGFscywgJCgnLmNlbGwubnVtJywgeyByb2xlOiAnY2VsbCcgfSwgbnVtYmVyRm9ybWF0dGVyLnZhbHVlLmZvcm1hdCh0b3RhbEEpKSk7XG5cdFx0RE9NLmFwcGVuZCh0b3RhbHMsICQoJy5jZWxsLm51bScsIHsgcm9sZTogJ2NlbGwnIH0sIG51bWJlckZvcm1hdHRlci52YWx1ZS5mb3JtYXQodG90YWxCKSkpO1xuXHRcdERPTS5hcHBlbmQodG90YWxzLCAkKCcuY2VsbC5udW0nLCB7IHJvbGU6ICdjZWxsJyB9LCBiVG9rZW5zUGVyQ2hhciAhPT0gdW5kZWZpbmVkID8gbnVtYmVyRm9ybWF0dGVyLnZhbHVlLmZvcm1hdChNYXRoLnJvdW5kKHRvdGFsQiAqIGJUb2tlbnNQZXJDaGFyKSkgOiAnXFx1MjAxNCcpKTtcblx0XHRET00uYXBwZW5kKHRvdGFscywgJCgnLmNlbGwubnVtJywgeyByb2xlOiAnY2VsbCcgfSwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5wY3RWYWx1ZScsIFwiezB9JVwiLCAnMTAwJykpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZVNpZGUoZXZlbnQ6IElDaGF0RGVidWdNb2RlbFR1cm5FdmVudCk6IFByb21pc2U8SVNpZGVEYXRhPiB7XG5cdFx0bGV0IGNvbnRlbnQ6IElDaGF0RGVidWdFdmVudE1vZGVsVHVybkNvbnRlbnQgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGV2ZW50LmlkKSB7XG5cdFx0XHRpZiAodGhpcy5yZXNvbHZlZENhY2hlLmhhcyhldmVudC5pZCkpIHtcblx0XHRcdFx0Y29udGVudCA9IHRoaXMucmVzb2x2ZWRDYWNoZS5nZXQoZXZlbnQuaWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgciA9IGF3YWl0IHRoaXMuY2hhdERlYnVnU2VydmljZS5yZXNvbHZlRXZlbnQoZXZlbnQuaWQpO1xuXHRcdFx0XHRjb250ZW50ID0gciAmJiByLmtpbmQgPT09ICdtb2RlbFR1cm4nID8gciA6IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5yZXNvbHZlZENhY2hlLnNldChldmVudC5pZCwgY29udGVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHN5c3RlbSA9IGZpbmRTZWN0aW9uKGNvbnRlbnQ/LnNlY3Rpb25zLCAnU3lzdGVtJyk7XG5cdFx0Y29uc3QgdG9vbHMgPSBmaW5kU2VjdGlvbihjb250ZW50Py5zZWN0aW9ucywgJ1Rvb2xzJyk7XG5cdFx0Y29uc3QgcmVxdWVzdFNoYXBlSnNvbiA9IGZpbmRTZWN0aW9uKGNvbnRlbnQ/LnNlY3Rpb25zLCAnUmVxdWVzdCBTaGFwZScpO1xuXHRcdGNvbnN0IGlucHV0TWVzc2FnZXNKc29uID0gZmluZFNlY3Rpb24oY29udGVudD8uc2VjdGlvbnMsICdJbnB1dCBNZXNzYWdlcycpO1xuXHRcdGNvbnN0IHJhd01lc3NhZ2VzID0gcGFyc2VJbnB1dE1lc3NhZ2VzKGlucHV0TWVzc2FnZXNKc29uKTtcblx0XHQvLyBgY2hhdE1MRmV0Y2hlci50c2AgZXh0cmFjdHMgdGhlIHN5c3RlbSBwcm9tcHQgZnJvbSB0aGUgbWVzc2FnZXNcblx0XHQvLyBhcnJheSBBTkQgZW1pdHMgaXQgc2VwYXJhdGVseSBhcyBgZ2VuX2FpLnN5c3RlbV9pbnN0cnVjdGlvbnNgLlxuXHRcdC8vIFRoYXQgZG91YmxlLWNvdW50cyB0aGUgc3lzdGVtIHByb21wdDogb25jZSBhcyB0aGUgc3ludGhldGljXG5cdFx0Ly8gYHN5c3RlbWAgc2VnbWVudCB3ZSBhbHJlYWR5IHJlbmRlciwgYW5kIGEgc2Vjb25kIHRpbWUgYXNcblx0XHQvLyBtZXNzYWdlc1swXS4gU3RyaXAgbGVhZGluZyBzeXN0ZW0tcm9sZSBtZXNzYWdlcyBoZXJlIHNvIHRoZVxuXHRcdC8vIHNpZ25hdHVyZSBsYW5lIHJlYWRzIGBbc3lzdGVtLCB0b29scywgLi4udXNlck1lc3NhZ2VzXWBcblx0XHQvLyByZWdhcmRsZXNzIG9mIGhvdyB0aGUgcHJvdmlkZXIgY2hvc2UgdG8gZmVycnkgdGhlIHN5c3RlbSBwcm9tcHRcblx0XHQvLyAoaW4tYmFuZCBhcyBtZXNzYWdlc1swXSwgb3Igb3V0LW9mLWJhbmQgdmlhIGBpbnN0cnVjdGlvbnNgIC9cblx0XHQvLyB0b3AtbGV2ZWwgYHN5c3RlbWApLiBUaGUgc3ludGhldGljIGBzeXN0ZW1gIGNvbXBvbmVudCBzdGlsbFxuXHRcdC8vIGRpZmZzIHRoZSBzeXN0ZW0gY29udGVudCBmYWl0aGZ1bGx5IGJlY2F1c2UgYm90aCBzaWRlcyBnb1xuXHRcdC8vIHRocm91Z2ggdGhlIHNhbWUgZGVkdXAuXG5cdFx0Ly8gU3RyaXAgbGVhZGluZyBzeXN0ZW0tcm9sZSBtZXNzYWdlcyBoZXJlIHNvIHRoZSBzaWduYXR1cmUgbGFuZSByZWFkc1xuXHRcdC8vIGBbc3lzdGVtLCB0b29scywgLi4udXNlck1lc3NhZ2VzXWAgcmVnYXJkbGVzcyBvZiBob3cgdGhlIHByb3ZpZGVyXG5cdFx0Ly8gY2hvc2UgdG8gZmVycnkgdGhlIHN5c3RlbSBwcm9tcHQgKGluLWJhbmQgYXMgbWVzc2FnZXNbMF0sIG9yXG5cdFx0Ly8gb3V0LW9mLWJhbmQgdmlhIGBpbnN0cnVjdGlvbnNgIC8gdG9wLWxldmVsIGBzeXN0ZW1gKS4gTG9vcCBpbiBjYXNlIGFcblx0XHQvLyBwcm92aWRlciBwcmVwZW5kcyBtdWx0aXBsZSBzeXN0ZW0tcm9sZSBtZXNzYWdlczsgdGhlIHN5bnRoZXRpY1xuXHRcdC8vIGBzeXN0ZW1gIGNvbXBvbmVudCBzdGlsbCBkaWZmcyB0aGUgc3lzdGVtIGNvbnRlbnQgZmFpdGhmdWxseSBiZWNhdXNlXG5cdFx0Ly8gYm90aCBzaWRlcyBnbyB0aHJvdWdoIHRoZSBzYW1lIGRlZHVwLlxuXHRcdGxldCBzdHJpcEZyb20gPSAwO1xuXHRcdGlmIChzeXN0ZW0pIHtcblx0XHRcdHdoaWxlIChzdHJpcEZyb20gPCByYXdNZXNzYWdlcy5sZW5ndGggJiYgcmF3TWVzc2FnZXNbc3RyaXBGcm9tXS5yb2xlID09PSAnc3lzdGVtJykge1xuXHRcdFx0XHRzdHJpcEZyb20rKztcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgaW5wdXRNZXNzYWdlcyA9IHN0cmlwRnJvbSA+IDAgPyByYXdNZXNzYWdlcy5zbGljZShzdHJpcEZyb20pIDogcmF3TWVzc2FnZXM7XG5cdFx0cmV0dXJuIHsgZXZlbnQsIGNvbnRlbnQsIHN5c3RlbSwgdG9vbHMsIGlucHV0TWVzc2FnZXMsIHJlcXVlc3RTaGFwZTogZGVzY3JpYmVSZXF1ZXN0U2hhcGUoaW5wdXRNZXNzYWdlcywgcmVxdWVzdFNoYXBlSnNvbikgfTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyUmFpbChncm91cHM6IHJlYWRvbmx5IElUdXJuR3JvdXBbXSk6IHZvaWQge1xuXHRcdC8vIElkbGUtZ2FwIG1hcmtlcnM6IGEgZ2FwIGF0IG9yIGFib3ZlIHRoZSB0eXBpY2FsIGNhY2hlIFRUTCBiZXR3ZWVuXG5cdFx0Ly8gdHdvIGNvbnNlY3V0aXZlIHR1cm5zIG1lYW5zIHRoZSBjYWNoZWQgcHJlZml4IGxpa2VseSBleHBpcmVkIGluXG5cdFx0Ly8gYmV0d2VlbiBcdTIwMTQgbWFrZSB0aGF0IHZpc2libGUgaW4gdGhlIHJhaWwgYmVmb3JlIGFueW9uZSBjbGlja3MuXG5cdFx0Y29uc3QgZ2FwQmVmb3JlID0gKHR1cm5JbmRleDogbnVtYmVyKTogbnVtYmVyIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdGlmICh0dXJuSW5kZXggPD0gMCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcHJldiA9IHRoaXMubW9kZWxUdXJuc1t0dXJuSW5kZXggLSAxXTtcblx0XHRcdGNvbnN0IGN1cnIgPSB0aGlzLm1vZGVsVHVybnNbdHVybkluZGV4XTtcblx0XHRcdGNvbnN0IHByZXZFbmQgPSBwcmV2LmNyZWF0ZWQuZ2V0VGltZSgpICsgKHByZXYuZHVyYXRpb25Jbk1pbGxpcyA/PyAwKTtcblx0XHRcdGNvbnN0IGdhcE1pbnV0ZXMgPSAoY3Vyci5jcmVhdGVkLmdldFRpbWUoKSAtIHByZXZFbmQpIC8gNjBfMDAwO1xuXHRcdFx0cmV0dXJuIGdhcE1pbnV0ZXMgPj0gVFRMX0dBUF9NSU5VVEVTID8gZ2FwTWludXRlcyA6IHVuZGVmaW5lZDtcblx0XHR9O1xuXHRcdGNvbnN0IGFwcGVuZEdhcE1hcmtlciA9IChnYXBNaW51dGVzOiBudW1iZXIpOiB2b2lkID0+IHtcblx0XHRcdGNvbnN0IGdhcCA9IERPTS5hcHBlbmQodGhpcy5yYWlsTGlzdCwgJCgnLmNoYXQtZGVidWctY2FjaGUtcmFpbC1nYXAnKSk7XG5cdFx0XHRET00uYXBwZW5kKGdhcCwgJCgnc3Bhbi5jb2RpY29uLmNvZGljb24tY2xvY2snLCB7ICdhcmlhLWhpZGRlbic6ICd0cnVlJyB9KSk7XG5cdFx0XHRET00uYXBwZW5kKGdhcCwgJCgnc3BhbicsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5yYWlsR2FwJywgXCJ7MH0gbWluIGlkbGUgXHUwMEI3IGNhY2hlIGxpa2VseSBleHBpcmVkXCIsIGdhcE1pbnV0ZXMudG9GaXhlZCgxKSkpKTtcblx0XHR9O1xuXG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHtcblx0XHRcdGNvbnN0IGNvbGxhcHNlZCA9IHRoaXMuY29sbGFwc2VkR3JvdXBzLmhhcyhncm91cC5rZXkpO1xuXHRcdFx0Y29uc3QgZ3JvdXBHYXAgPSBncm91cC50dXJucy5sZW5ndGggPiAwID8gZ2FwQmVmb3JlKGdyb3VwLnR1cm5zWzBdLmluZGV4KSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChncm91cEdhcCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGFwcGVuZEdhcE1hcmtlcihncm91cEdhcCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBoZWFkZXIgPSBET00uYXBwZW5kKHRoaXMucmFpbExpc3QsICQoJy5jaGF0LWRlYnVnLWNhY2hlLWdyb3VwLWhlYWRlcicpKTtcblx0XHRcdGlmIChjb2xsYXBzZWQpIHtcblx0XHRcdFx0aGVhZGVyLmNsYXNzTGlzdC5hZGQoJ2lzLWNvbGxhcHNlZCcpO1xuXHRcdFx0fVxuXHRcdFx0aGVhZGVyLnRhYkluZGV4ID0gMDtcblx0XHRcdGhlYWRlci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0XHRoZWFkZXIuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgY29sbGFwc2VkID8gJ2ZhbHNlJyA6ICd0cnVlJyk7XG5cdFx0XHRoZWFkZXIudGl0bGUgPSBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLnRvZ2dsZUdyb3VwJywgXCJUb2dnbGUgZ3JvdXBcIik7XG5cblx0XHRcdGNvbnN0IHRvcExpbmUgPSBET00uYXBwZW5kKGhlYWRlciwgJCgnLmNoYXQtZGVidWctY2FjaGUtZ3JvdXAtdG9wJykpO1xuXHRcdFx0RE9NLmFwcGVuZCh0b3BMaW5lLCAkKCdzcGFuLmNoYXQtZGVidWctY2FjaGUtZ3JvdXAtY2hldicpKTtcblx0XHRcdGNvbnN0IGhlYWRlckxpbmUgPSBET00uYXBwZW5kKHRvcExpbmUsICQoJy5jaGF0LWRlYnVnLWNhY2hlLWdyb3VwLXByb21wdCcpKTtcblx0XHRcdGhlYWRlckxpbmUudGV4dENvbnRlbnQgPSBncm91cC51c2VyTWVzc2FnZT8ubWVzc2FnZT8udHJpbSgpIHx8IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUudW5rbm93blByb21wdCcsIFwiKG5vIHByb21wdCBjYXB0dXJlZClcIik7XG5cdFx0XHRjb25zdCBjb3VudEJhZGdlID0gRE9NLmFwcGVuZCh0b3BMaW5lLCAkKCdzcGFuLmNoYXQtZGVidWctY2FjaGUtZ3JvdXAtY291bnQnKSk7XG5cdFx0XHRjb3VudEJhZGdlLnRleHRDb250ZW50ID0gU3RyaW5nKGdyb3VwLnR1cm5zLmxlbmd0aCk7XG5cblx0XHRcdGNvbnN0IGhlYWRlck1ldGEgPSBET00uYXBwZW5kKGhlYWRlciwgJCgnLmNoYXQtZGVidWctY2FjaGUtZ3JvdXAtbWV0YScpKTtcblx0XHRcdGhlYWRlck1ldGEudGV4dENvbnRlbnQgPSBncm91cC5rZXk7XG5cdFx0XHRoZWFkZXJNZXRhLnRpdGxlID0gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5yZXF1ZXN0SWRUb29sdGlwJywgXCJSZXF1ZXN0IGlkOiB7MH1cIiwgZ3JvdXAua2V5KTtcblxuXHRcdFx0Y29uc3QgdG9nZ2xlID0gKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5jb2xsYXBzZWRHcm91cHMuaGFzKGdyb3VwLmtleSkpIHtcblx0XHRcdFx0XHR0aGlzLmNvbGxhcHNlZEdyb3Vwcy5kZWxldGUoZ3JvdXAua2V5KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmNvbGxhcHNlZEdyb3Vwcy5hZGQoZ3JvdXAua2V5KTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnJlZnJlc2goKTtcblx0XHRcdH07XG5cdFx0XHR0aGlzLnJhaWxEaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihoZWFkZXIsIERPTS5FdmVudFR5cGUuQ0xJQ0ssIHRvZ2dsZSkpO1xuXHRcdFx0dGhpcy5yYWlsRGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoaGVhZGVyLCBET00uRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHR0b2dnbGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRpZiAoY29sbGFwc2VkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IFtwb3NJbkdyb3VwLCB7IHR1cm46IGV2dCwgaW5kZXg6IGkgfV0gb2YgZ3JvdXAudHVybnMuZW50cmllcygpKSB7XG5cdFx0XHRcdC8vIEdhcHMgYmVmb3JlIHRoZSBmaXJzdCB0dXJuIG9mIGEgZ3JvdXAgcmVuZGVyIGJlZm9yZSB0aGVcblx0XHRcdFx0Ly8gZ3JvdXAgaGVhZGVyIGFib3ZlOyBvbmx5IGludHJhLWdyb3VwIGdhcHMgcmVuZGVyIGhlcmUuXG5cdFx0XHRcdGlmIChwb3NJbkdyb3VwID4gMCkge1xuXHRcdFx0XHRcdGNvbnN0IGdhcCA9IGdhcEJlZm9yZShpKTtcblx0XHRcdFx0XHRpZiAoZ2FwICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGFwcGVuZEdhcE1hcmtlcihnYXApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCByb3cgPSBET00uYXBwZW5kKHRoaXMucmFpbExpc3QsICQoJy5jaGF0LWRlYnVnLWNhY2hlLXR1cm4nKSk7XG5cdFx0XHRcdHRoaXMucmFpbFJvd3NCeUluZGV4LnNldChpLCByb3cpO1xuXHRcdFx0XHRpZiAoaSA9PT0gdGhpcy5zZWxlY3RlZEluZGV4KSB7IHJvdy5jbGFzc0xpc3QuYWRkKCdpcy1zZWxlY3RlZCcpOyB9XG5cdFx0XHRcdGNvbnN0IGlkeCA9IERPTS5hcHBlbmQocm93LCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS10dXJuLWlkeCcpKTtcblx0XHRcdFx0aWR4LnRleHRDb250ZW50ID0gU3RyaW5nKGkpLnBhZFN0YXJ0KDIsICcgJyk7XG5cblx0XHRcdFx0Y29uc3QgbWFpbiA9IERPTS5hcHBlbmQocm93LCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS10dXJuLW1haW4nKSk7XG5cblx0XHRcdFx0Ly8gVG9wIGxpbmU6IGFnZW50IHNvdXJjZSB3aXRoIGJyYWNrZXRlZCBjYWNoZSBoaXQsIGR1cmF0aW9uLCBhbmQgdGltZXN0YW1wXG5cdFx0XHRcdGNvbnN0IHRvcCA9IERPTS5hcHBlbmQobWFpbiwgJCgnLmNoYXQtZGVidWctY2FjaGUtdHVybi10b3AnKSk7XG5cdFx0XHRcdGNvbnN0IHNvdXJjZSA9IERPTS5hcHBlbmQodG9wLCAkKCdzcGFuLmNoYXQtZGVidWctY2FjaGUtdHVybi1zb3VyY2UnKSk7XG5cdFx0XHRcdHNvdXJjZS50ZXh0Q29udGVudCA9IGV2dC5yZXF1ZXN0TmFtZSB8fCBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLm1vZGVsVHVybicsIFwiTW9kZWwgVHVyblwiKTtcblx0XHRcdFx0aWYgKGV2dC5pbnB1dFRva2Vucykge1xuXHRcdFx0XHRcdGNvbnN0IGhpdCA9IGNvbXB1dGVDYWNoZUhpdChldnQpO1xuXHRcdFx0XHRcdGNvbnN0IGhpdENoaXAgPSBET00uYXBwZW5kKHRvcCwgJCgnc3Bhbi5jaGF0LWRlYnVnLWNhY2hlLXR1cm4tY2hpcC5jaGF0LWRlYnVnLWNhY2hlLXR1cm4taGl0JywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5oaXRDaGlwJywgXCJbY2FjaGUgezB9JV1cIiwgZm9ybWF0Q2FjaGVQY3RJbnQoaGl0KSkpKTtcblx0XHRcdFx0XHRpZiAoaGl0IDwgOTApIHtcblx0XHRcdFx0XHRcdGhpdENoaXAuY2xhc3NMaXN0LmFkZCgnaXMtYmFkJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChldnQuZHVyYXRpb25Jbk1pbGxpcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0RE9NLmFwcGVuZCh0b3AsICQoJ3NwYW4uY2hhdC1kZWJ1Zy1jYWNoZS10dXJuLWNoaXAnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUubXNDaGlwJywgXCJbezB9bXNdXCIsIG51bWJlckZvcm1hdHRlci52YWx1ZS5mb3JtYXQoTWF0aC5yb3VuZChldnQuZHVyYXRpb25Jbk1pbGxpcykpKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdERPTS5hcHBlbmQodG9wLCAkKCdzcGFuLmNoYXQtZGVidWctY2FjaGUtdHVybi1jaGlwJywgdW5kZWZpbmVkLCBgWyR7dGltZUZvcm1hdHRlci52YWx1ZS5mb3JtYXQoZXZ0LmNyZWF0ZWQpfV1gKSk7XG5cblx0XHRcdFx0Ly8gQm90dG9tIGxpbmU6IG1vZGVsIG5hbWVcblx0XHRcdFx0aWYgKGV2dC5tb2RlbCkge1xuXHRcdFx0XHRcdGNvbnN0IHN1YiA9IERPTS5hcHBlbmQobWFpbiwgJCgnLmNoYXQtZGVidWctY2FjaGUtdHVybi1zdWInKSk7XG5cdFx0XHRcdFx0c3ViLnRleHRDb250ZW50ID0gZXZ0Lm1vZGVsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cm93LnRpdGxlID0gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS50dXJuSGVscCcsIFwiQ2xpY2sgdG8gY29tcGFyZSB0aGlzIHJlcXVlc3QgYWdhaW5zdCB0aGUgcHJldmlvdXMgb25lXCIpO1xuXHRcdFx0XHRyb3cudGFiSW5kZXggPSAwO1xuXHRcdFx0XHRyb3cuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdFx0XHRpZiAoaSA9PT0gdGhpcy5zZWxlY3RlZEluZGV4KSB7XG5cdFx0XHRcdFx0cm93LnNldEF0dHJpYnV0ZSgnYXJpYS1jdXJyZW50JywgJ3RydWUnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyb3cuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS50dXJuQXJpYScsIFwiVHVybiB7MH06IHsxfVwiLCBpLCBldnQucmVxdWVzdE5hbWUgPz8gZXZ0Lm1vZGVsID8/IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUubW9kZWxUdXJuJywgXCJNb2RlbCBUdXJuXCIpKSk7XG5cdFx0XHRcdHRoaXMucmFpbERpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHJvdywgRE9NLkV2ZW50VHlwZS5DTElDSywgKCkgPT4gdGhpcy5zZWxlY3RUdXJuKGksIHsgcHJldmVudFNjcm9sbDogdHJ1ZSB9KSkpO1xuXHRcdFx0XHR0aGlzLnJhaWxEaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihyb3csIERPTS5FdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRcdHRoaXMuc2VsZWN0VHVybihpLCB7IHByZXZlbnRTY3JvbGw6IHRydWUgfSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChlLmtleSA9PT0gJ0Fycm93RG93bicpIHtcblx0XHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRcdHRoaXMubW92ZVNlbGVjdGlvbigxKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGUua2V5ID09PSAnQXJyb3dVcCcpIHtcblx0XHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRcdHRoaXMubW92ZVNlbGVjdGlvbigtMSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJUaXRsZVJvdygpOiB2b2lkIHtcblx0XHRjb25zdCB0aXRsZVJvdyA9IERPTS5hcHBlbmQodGhpcy5jb250ZW50LCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS10aXRsZS1yb3cnKSk7XG5cdFx0Y29uc3QgdGl0bGUgPSBET00uYXBwZW5kKHRpdGxlUm93LCAkKCdoMi5jaGF0LWRlYnVnLWNhY2hlLXRpdGxlJykpO1xuXHRcdHRpdGxlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZUV4cGxvcmVyLnRpdGxlJywgXCJDYWNoZSBFeHBsb3JlciBcdTIwMTQgUHJlZml4IERpZmZcIik7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclN1bW1hcnkoYTogSVNpZGVEYXRhLCBiOiBJU2lkZURhdGEsIGRpZmY6IElDYWNoZURpZmZSZXN1bHQsIGNvbXBhcmVJbnB1dE1lc3NhZ2VzOiBib29sZWFuLCBpbnNpZ2h0czogcmVhZG9ubHkgSUNhY2hlSW5zaWdodFtdLCBvcHRpb25zRGlmZjogcmVhZG9ubHkgSU9wdGlvbkRlbHRhW10pOiB2b2lkIHtcblx0XHRjb25zdCByb3cgPSBET00uYXBwZW5kKHRoaXMuY29udGVudCwgJCgnLmNoYXQtZGVidWctY2FjaGUtc3VtbWFyeScpKTtcblx0XHRyb3cuYXBwZW5kQ2hpbGQodGhpcy5yZW5kZXJTaWRlQ2FyZChhLCBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLnByZXZpb3VzUmVxdWVzdCcsIFwiUHJldmlvdXMgcmVxdWVzdFwiKSkpO1xuXHRcdHJvdy5hcHBlbmRDaGlsZCh0aGlzLnJlbmRlclNpZGVDYXJkKGIsIGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUucmVxdWVzdFRpdGxlJywgXCJSZXF1ZXN0XCIpKSk7XG5cblx0XHRjb25zdCBoaXQgPSBjb21wdXRlQ2FjaGVIaXQoYi5ldmVudCk7XG5cblx0XHQvLyBDYXJkIGJvcmRlciBjb2xvciB0cmFja3MgdGhlIHdvcnN0IGZpbmRpbmcgXFx1MjAxNCBncmVlbi9uZXV0cmFsIHdoZW4gdGhlXG5cdFx0Ly8gbG9zcyBpcyBleHBlY3RlZCBncm93dGgsIHJlZCBvbmx5IGZvciBhbiBhdm9pZGFibGUgYnJlYWsuXG5cdFx0Y29uc3QgYnJlYWtDYXJkID0gRE9NLmFwcGVuZChyb3csICQoJy5jaGF0LWRlYnVnLWNhY2hlLWNhcmQuYnJlYWsnKSk7XG5cdFx0YnJlYWtDYXJkLmNsYXNzTGlzdC5hZGQoYGlzLSR7bWF4SW5zaWdodFNldmVyaXR5KGluc2lnaHRzKX1gKTtcblx0XHRET00uYXBwZW5kKGJyZWFrQ2FyZCwgJCgnLmNoYXQtZGVidWctY2FjaGUtY2FyZC1oJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLnBlcmZvcm1hbmNlJywgXCJDYWNoZSBwZXJmb3JtYW5jZVwiKSkpO1xuXG5cdFx0Ly8gSGVhZGxpbmU6IGhpdCAlICsgdGhlIHZlcmRpY3QgKHRoZSBmaXJzdCB3YXJuaW5nLW9yLXdvcnNlIGZpbmRpbmcpLlxuXHRcdGNvbnN0IHByaW1hcnkgPSBwcmltYXJ5SW5zaWdodChpbnNpZ2h0cyk7XG5cdFx0Y29uc3QgaGVhZGxpbmUgPSBET00uYXBwZW5kKGJyZWFrQ2FyZCwgJCgnLmNoYXQtZGVidWctY2FjaGUtY2FyZC1oZWFkbGluZScpKTtcblx0XHRoZWFkbGluZS50ZXh0Q29udGVudCA9IHByaW1hcnlcblx0XHRcdD8gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5oaXRIZWFkbGluZVZlcmRpY3QnLCBcInswfSUgY2FjaGUgaGl0IFxcdTIwMTQgezF9XCIsIGZvcm1hdENhY2hlUGN0KGhpdCksIHByaW1hcnkudGl0bGUpXG5cdFx0XHQ6IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuaGl0SGVhZGxpbmUnLCBcInswfSUgY2FjaGUgaGl0XCIsIGZvcm1hdENhY2hlUGN0KGhpdCkpO1xuXHRcdHRoaXMuYXBwZW5kVG9rZW5zUmV1c2VkTGluZShicmVha0NhcmQsIGIuZXZlbnQpO1xuXHRcdGlmIChiLnJlcXVlc3RTaGFwZS5kZXNjcmlwdGlvbikge1xuXHRcdFx0Y29uc3Qgc2hhcGVMaW5lID0gRE9NLmFwcGVuZChicmVha0NhcmQsICQoJy5jaGF0LWRlYnVnLWNhY2hlLXBlcmYtbGluZS5jaGF0LWRlYnVnLWNhY2hlLXJlcXVlc3Qtc2hhcGUtbm90ZScpKTtcblx0XHRcdHNoYXBlTGluZS50ZXh0Q29udGVudCA9IGIucmVxdWVzdFNoYXBlLmRlc2NyaXB0aW9uO1xuXHRcdH1cblxuXHRcdC8vIEZpbmRpbmdzOiBlYWNoIGRldGVjdGVkIGNhdXNlIGluIGNhY2hlLWtleSBvcmRlciAobW9kZWwsIHRvb2xzLFxuXHRcdC8vIHN5c3RlbSwgb3B0aW9ucywgbWVzc2FnZXMpIFxcdTIwMTQgdGhlIGZpcnN0IGNyaXRpY2FsIG9uZSBpcyB0aGUgZWFybGllc3Rcblx0XHQvLyBieXRlIGNoYW5nZSBhbmQgdGhlcmVmb3JlIHRoZSBhY3R1YWwgY2FjaGUgYnJlYWtlci5cblx0XHRET00uYXBwZW5kKGJyZWFrQ2FyZCwgJCgnLmNoYXQtZGVidWctY2FjaGUtcGVyZi1ydWxlJykpO1xuXHRcdERPTS5hcHBlbmQoYnJlYWtDYXJkLCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1wZXJmLXNlY3Rpb24taCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5maW5kaW5ncycsIFwiRmluZGluZ3NcIikpKTtcblx0XHRjb25zdCBsaXN0ID0gRE9NLmFwcGVuZChicmVha0NhcmQsICQoJy5jaGF0LWRlYnVnLWNhY2hlLWZpbmRpbmdzJykpO1xuXHRcdGlmIChpbnNpZ2h0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdERPTS5hcHBlbmQobGlzdCwgJCgnLmNoYXQtZGVidWctY2FjaGUtZmluZGluZy1kZXRhaWwnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUubm9GaW5kaW5ncycsIFwiTm8gZmluZGluZ3MgZm9yIHRoaXMgcmVxdWVzdCBwYWlyLlwiKSkpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGluc2lnaHQgb2YgaW5zaWdodHMpIHtcblx0XHRcdHRoaXMucmVuZGVyRmluZGluZyhsaXN0LCBpbnNpZ2h0KTtcblx0XHR9XG5cblx0XHQvLyBTdHJ1Y3R1cmFsIGRpZmYgc3VtbWFyeSBcXHUyMDE0IG9ubHkgbWVhbmluZ2Z1bCB3aGVuIG1lc3NhZ2VzIHdlcmVcblx0XHQvLyBwb3NpdGlvbmFsbHkgY29tcGFyZWQgKHRoZSBjb3VudHMgYXJlIGVtcHR5IGZvciBjb250aW51YXRpb25zKS5cblx0XHRpZiAoY29tcGFyZUlucHV0TWVzc2FnZXMpIHtcblx0XHRcdERPTS5hcHBlbmQoYnJlYWtDYXJkLCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1wZXJmLXJ1bGUnKSk7XG5cdFx0XHRET00uYXBwZW5kKGJyZWFrQ2FyZCwgJCgnLmNoYXQtZGVidWctY2FjaGUtcGVyZi1zZWN0aW9uLWgnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuZGlmZlN1bW1hcnknLCBcIkRpZmYgc3VtbWFyeVwiKSkpO1xuXHRcdFx0Y29uc3Qgc3VtbWFyeUxpbmUgPSBET00uYXBwZW5kKGJyZWFrQ2FyZCwgJCgnLmNoYXQtZGVidWctY2FjaGUtcGVyZi1saW5lJykpO1xuXHRcdFx0Y29uc3QgaW5QbGFjZUNoYW5nZWQgPSBkaWZmLmNvdW50cy5jb250ZW50RHJpZnQgKyBkaWZmLmNvdW50cy5sZW5ndGhDaGFuZ2U7XG5cdFx0XHRjb25zdCBhZGRlZEluQiA9IGRpZmYuY291bnRzLm9ubHlJbkI7XG5cdFx0XHRjb25zdCBkcm9wcGVkRnJvbUEgPSBkaWZmLmNvdW50cy5vbmx5SW5BO1xuXHRcdFx0Y29uc3QgcGFydHM6IHN0cmluZ1tdID0gW1xuXHRcdFx0XHRsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLnN1bW1hcnlJZGVudGljYWwnLCBcInswfSBpZGVudGljYWxcIiwgZGlmZi5jb3VudHMuaWRlbnRpY2FsKSxcblx0XHRcdFx0bG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5zdW1tYXJ5Q2hhbmdlZCcsIFwiezB9IGluLXBsYWNlIGNoYW5nZWRcIiwgaW5QbGFjZUNoYW5nZWQpLFxuXHRcdFx0XTtcblx0XHRcdGlmIChhZGRlZEluQiA+IDApIHtcblx0XHRcdFx0cGFydHMucHVzaChsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLnN1bW1hcnlBZGRlZCcsIFwiezB9IGFkZGVkIGluIHRoaXMgcmVxdWVzdFwiLCBhZGRlZEluQikpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGRyb3BwZWRGcm9tQSA+IDApIHtcblx0XHRcdFx0cGFydHMucHVzaChsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLnN1bW1hcnlEcm9wcGVkJywgXCJ7MH0gZHJvcHBlZCBmcm9tIHByZXZpb3VzXCIsIGRyb3BwZWRGcm9tQSkpO1xuXHRcdFx0fVxuXHRcdFx0c3VtbWFyeUxpbmUudGV4dENvbnRlbnQgPSBwYXJ0cy5qb2luKCcgXFx1MDBiNyAnKTtcblx0XHR9XG5cblx0XHQvLyBJbmxpbmUgb25lLWxpbmVyOiBzdXJmYWNlIHJlcXVlc3Qtb3B0aW9uIGRyaWZ0IHJpZ2h0IHVuZGVyIHRoZVxuXHRcdC8vIHN1bW1hcnkgY2FyZHMgc28gaXQgaXMgdmlzaWJsZSByZWdhcmRsZXNzIG9mIHdoaWNoIGNhcmQgdGhlIHVzZXJcblx0XHQvLyBzY2FucyBmaXJzdC4gVGhlIGRldGFpbGVkIFJlcXVlc3Qgb3B0aW9ucyBjYXJkIGxpdmVzIGluIHRoZVxuXHRcdC8vIENvbXBvbmVudHMgcm93LlxuXHRcdGlmIChvcHRpb25zRGlmZi5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBvcHRzTGluZSA9IERPTS5hcHBlbmQodGhpcy5jb250ZW50LCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1vcHRpb25zLWJhbm5lcicpKTtcblx0XHRcdG9wdHNMaW5lLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5vcHRpb25zQmFubmVyJyxcblx0XHRcdFx0XCJPcHRpb25zIGNoYW5nZWQ6IHswfVwiLFxuXHRcdFx0XHRvcHRpb25zRGlmZi5tYXAoZCA9PiBgJHtkLmtleX0gKCR7Zm9ybWF0T3B0aW9uVmFsdWUoZC5wcmV2aW91cyl9IFxcdTIxOTIgJHtmb3JtYXRPcHRpb25WYWx1ZShkLmN1cnJlbnQpfSlgKS5qb2luKCcsICcpLFxuXHRcdFx0KTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVuZGVyIG9uZSBmaW5kaW5nIHJvdzogc2V2ZXJpdHkgaWNvbiwgdGl0bGUsIGV2aWRlbmNlLCBhbmQgaGludC5cblx0ICogRmluZGluZ3MgdGhhdCBwb2ludCBhdCBhIENvbXBvbmVudHMgZW50cnkgcmVuZGVyIGFzIGEgYnV0dG9uIHRoYXRcblx0ICogcmV2ZWFscyAoc2Nyb2xscyB0bywgZXhwYW5kcywgYW5kIGZsYXNoZXMpIHRoYXQgY29tcG9uZW50LlxuXHQgKi9cblx0cHJpdmF0ZSByZW5kZXJGaW5kaW5nKGxpc3Q6IEhUTUxFbGVtZW50LCBpbnNpZ2h0OiBJQ2FjaGVJbnNpZ2h0KTogdm9pZCB7XG5cdFx0Y29uc3QgaXNMaW5rID0gISFpbnNpZ2h0LmNvbXBvbmVudDtcblx0XHQvLyBFeHBsaWNpdCBgdHlwZT1cImJ1dHRvblwiYCBrZWVwcyB0aGUgcm93IGZyb20gYmVpbmcgdHJlYXRlZCBhcyBhXG5cdFx0Ly8gc3VibWl0IGJ1dHRvbiBpZiBhIGZ1dHVyZSBhbmNlc3RvciBgPGZvcm0+YCBpcyBldmVyIGludHJvZHVjZWQuXG5cdFx0Y29uc3Qgcm93ID0gRE9NLmFwcGVuZChsaXN0LCBpc0xpbmsgPyAkKCdidXR0b24uY2hhdC1kZWJ1Zy1jYWNoZS1maW5kaW5nLmlzLWNsaWNrYWJsZScsIHsgdHlwZTogJ2J1dHRvbicgfSkgOiAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1maW5kaW5nJykpO1xuXHRcdERPTS5hcHBlbmQocm93LCAkKGBzcGFuLmNvZGljb24uY29kaWNvbi0ke2ZpbmRpbmdJY29uKGluc2lnaHQuc2V2ZXJpdHkpfS5jaGF0LWRlYnVnLWNhY2hlLWZpbmRpbmctaWNvbi5pcy0ke2luc2lnaHQuc2V2ZXJpdHl9YCwgeyAnYXJpYS1oaWRkZW4nOiAndHJ1ZScgfSkpO1xuXHRcdGNvbnN0IGJvZHkgPSBET00uYXBwZW5kKHJvdywgJCgnLmNoYXQtZGVidWctY2FjaGUtZmluZGluZy1ib2R5JykpO1xuXHRcdERPTS5hcHBlbmQoYm9keSwgJCgnLmNoYXQtZGVidWctY2FjaGUtZmluZGluZy10aXRsZScsIHVuZGVmaW5lZCwgaW5zaWdodC50aXRsZSkpO1xuXHRcdGlmIChpbnNpZ2h0LmRldGFpbCkge1xuXHRcdFx0RE9NLmFwcGVuZChib2R5LCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1maW5kaW5nLWRldGFpbCcsIHVuZGVmaW5lZCwgaW5zaWdodC5kZXRhaWwpKTtcblx0XHR9XG5cdFx0aWYgKGluc2lnaHQuaGludCkge1xuXHRcdFx0RE9NLmFwcGVuZChib2R5LCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1maW5kaW5nLWhpbnQnLCB1bmRlZmluZWQsIGluc2lnaHQuaGludCkpO1xuXHRcdH1cblx0XHRpZiAoaXNMaW5rKSB7XG5cdFx0XHRyb3cudGl0bGUgPSBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmZpbmRpbmdKdW1wJywgXCJSZXZlYWwgezB9IGluIENvbXBvbmVudHNcIiwgaW5zaWdodC5jb21wb25lbnQpO1xuXHRcdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIocm93LCBET00uRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB0aGlzLnJldmVhbENvbXBvbmVudChpbnNpZ2h0LmNvbXBvbmVudCEpKSk7XG5cdFx0fVxuXHR9XG5cblxuXHQvKipcblx0ICogU2Nyb2xsIHRoZSBuYW1lZCBDb21wb25lbnRzIGVudHJ5IGludG8gdmlldywgZXhwYW5kIGl0LCBhbmQgZmxhc2ggaXQgc29cblx0ICogdGhlIGV5ZSBsYW5kcyBvbiB0aGUgcmlnaHQgcGxhY2UuIE5vLW9wIHdoZW4gdGhlIGNvbXBvbmVudCBpc24ndCBwYXJ0XG5cdCAqIG9mIHRoZSBjdXJyZW50IGRyaWZ0IGxpc3QgKGUuZy4gYW4gaWRlbnRpY2FsIG1lc3NhZ2UpLlxuXHQgKi9cblx0cHJpdmF0ZSByZXZlYWxDb21wb25lbnQobmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLmNvbXBvbmVudEVsZW1lbnRzLmdldChuYW1lKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHsgaXRlbSwgaGVhZCB9ID0gZW50cnk7XG5cdFx0aWYgKCF0aGlzLm9wZW5Db21wb25lbnRzLmhhcyhuYW1lKSkge1xuXHRcdFx0dGhpcy5vcGVuQ29tcG9uZW50cy5hZGQobmFtZSk7XG5cdFx0XHRpdGVtLmNsYXNzTGlzdC5hZGQoJ29wZW4nKTtcblx0XHRcdGhlYWQuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ3RydWUnKTtcblx0XHR9XG5cdFx0aXRlbS5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiAnc21vb3RoJywgYmxvY2s6ICdzdGFydCcgfSk7XG5cdFx0Ly8gUmVtb3ZlICsgcmVmbG93ICsgcmUtYWRkIHNvIGEgc2Vjb25kIGNsaWNrIHJlc3RhcnRzIHRoZSBhbmltYXRpb24uXG5cdFx0aXRlbS5jbGFzc0xpc3QucmVtb3ZlKCdmbGFzaCcpO1xuXHRcdHZvaWQgaXRlbS5vZmZzZXRXaWR0aDtcblx0XHRpdGVtLmNsYXNzTGlzdC5hZGQoJ2ZsYXNoJyk7XG5cdFx0Ly8gTW92ZSBmb2N1cyB0byB0aGUgcmV2ZWFsZWQgaGVhZGVyIHNvIGtleWJvYXJkIC8gc2NyZWVuIHJlYWRlciB1c2Vyc1xuXHRcdC8vIGtub3cgd2hlcmUgdGhlIGFjdGl2YXRpb24gbGFuZGVkLiBwcmV2ZW50U2Nyb2xsIGJlY2F1c2Ugd2UgYWxyZWFkeVxuXHRcdC8vIGRpZCB0aGUgc21vb3RoLXNjcm9sbCBhYm92ZSBhbmQgZG9uJ3Qgd2FudCBmb2N1cyB0byBqdW1wLXNuYXAgb24gdG9wLlxuXHRcdGhlYWQuZm9jdXMoeyBwcmV2ZW50U2Nyb2xsOiB0cnVlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJTaWRlQ2FyZChkYXRhOiBJU2lkZURhdGEsIHRpdGxlPzogc3RyaW5nKTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IGNhcmQgPSAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1jYXJkJyk7XG5cdFx0aWYgKHRpdGxlKSB7XG5cdFx0XHRET00uYXBwZW5kKGNhcmQsICQoJy5jaGF0LWRlYnVnLWNhY2hlLWNhcmQtaCcsIHVuZGVmaW5lZCwgdGl0bGUpKTtcblx0XHR9XG5cdFx0dGhpcy5hcHBlbmRLdihjYXJkLCBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLm1vZGVsJywgXCJtb2RlbFwiKSwgZGF0YS5ldmVudC5tb2RlbCA/PyAnXFx1MjAxNCcpO1xuXHRcdHRoaXMuYXBwZW5kS3YoY2FyZCwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5pbnB1dFRvaycsIFwiaW5wdXQgdG9rXCIpLCBmb3JtYXRUb2tlbnMoZGF0YS5ldmVudC5pbnB1dFRva2VucykpO1xuXHRcdHRoaXMuYXBwZW5kS3YoY2FyZCwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5jYWNoZWRUb2snLCBcImNhY2hlZCB0b2tcIiksIGZvcm1hdFRva2VucyhkYXRhLmV2ZW50LmNhY2hlZFRva2VucykpO1xuXHRcdHRoaXMuYXBwZW5kS3YoY2FyZCwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5jYWNoZUhpdCcsIFwiY2FjaGUgaGl0XCIpLCBgJHtmb3JtYXRDYWNoZVBjdChjb21wdXRlQ2FjaGVIaXQoZGF0YS5ldmVudCkpfSVgKTtcblx0XHR0aGlzLmFwcGVuZEt2KGNhcmQsIGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUucmVxdWVzdFNoYXBlJywgXCJzaGFwZVwiKSwgZGF0YS5yZXF1ZXN0U2hhcGUubGFiZWwpO1xuXG5cdFx0Y29uc3Qgc3RhcnRUaW1lID0gZGF0YS5ldmVudC5jcmVhdGVkO1xuXHRcdGNvbnN0IGVuZFRpbWUgPSBkYXRhLmV2ZW50LmR1cmF0aW9uSW5NaWxsaXMgIT09IHVuZGVmaW5lZFxuXHRcdFx0PyBuZXcgRGF0ZShzdGFydFRpbWUuZ2V0VGltZSgpICsgZGF0YS5ldmVudC5kdXJhdGlvbkluTWlsbGlzKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5hcHBlbmRLdihjYXJkLCBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLnN0YXJ0VGltZScsIFwic3RhcnRUaW1lXCIpLCBzdGFydFRpbWUudG9JU09TdHJpbmcoKSwgdHJ1ZSk7XG5cdFx0aWYgKGVuZFRpbWUpIHtcblx0XHRcdHRoaXMuYXBwZW5kS3YoY2FyZCwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5lbmRUaW1lJywgXCJlbmRUaW1lXCIpLCBlbmRUaW1lLnRvSVNPU3RyaW5nKCksIHRydWUpO1xuXHRcdH1cblx0XHRpZiAoZGF0YS5ldmVudC5kdXJhdGlvbkluTWlsbGlzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuYXBwZW5kS3YoY2FyZCwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5kdXJhdGlvbicsIFwiZHVyYXRpb25cIiksIGAke251bWJlckZvcm1hdHRlci52YWx1ZS5mb3JtYXQoTWF0aC5yb3VuZChkYXRhLmV2ZW50LmR1cmF0aW9uSW5NaWxsaXMpKX1tc2ApO1xuXHRcdH1cblx0XHRjb25zdCB0dGZ0ID0gZGF0YS5jb250ZW50Py50aW1lVG9GaXJzdFRva2VuSW5NaWxsaXM7XG5cdFx0aWYgKHR0ZnQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5hcHBlbmRLdihjYXJkLCBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLnR0ZnQnLCBcInRpbWVUb0ZpcnN0VG9rZW5cIiksIGAke251bWJlckZvcm1hdHRlci52YWx1ZS5mb3JtYXQoTWF0aC5yb3VuZCh0dGZ0KSl9bXNgKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVxdWVzdElkID0gZGF0YS5jb250ZW50Py5yZXF1ZXN0SWQgPz8gZGF0YS5ldmVudC5wYXJlbnRFdmVudElkID8/IGRhdGEuZXZlbnQuaWQ7XG5cdFx0aWYgKHJlcXVlc3RJZCkge1xuXHRcdFx0dGhpcy5hcHBlbmRLdihjYXJkLCBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLnJlcXVlc3RJZCcsIFwicmVxdWVzdElkXCIpLCByZXF1ZXN0SWQsIHRydWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gY2FyZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW5kZXIgdGhlIHN1bW1hcnkgY2FyZHMgYWxvbmUgd2hlbiB0aGVyZSBpcyBubyBwcmlvciB0dXJuIHRvIGRpZmZcblx0ICogYWdhaW5zdCAoZS5nLiB0aGUgZmlyc3QgcmVxdWVzdCBpbiBhIGJyYW5kLW5ldyBzZXNzaW9uKS4gVGhlIE9UZWwtXG5cdCAqIHJlcG9ydGVkIGNhY2hlIGhpdCBpcyBzdGlsbCB1c2VmdWwgaGVyZSBcdTIwMTQgdGhlIHN5c3RlbSBwcm9tcHQgYW5kIHRvb2xcblx0ICogZGVmaW5pdGlvbnMgY2FuIGFscmVhZHkgYmUgY2FjaGVkIGZyb20gcHJldmlvdXMgc2Vzc2lvbnMuXG5cdCAqL1xuXHRwcml2YXRlIHJlbmRlclNpbmdsZVN1bW1hcnkoYjogSVNpZGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3Qgcm93ID0gRE9NLmFwcGVuZCh0aGlzLmNvbnRlbnQsICQoJy5jaGF0LWRlYnVnLWNhY2hlLXN1bW1hcnknKSk7XG5cdFx0cm93LmFwcGVuZENoaWxkKHRoaXMucmVuZGVyU2lkZUNhcmQoYiwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5yZXF1ZXN0VGl0bGUnLCBcIlJlcXVlc3RcIikpKTtcblxuXHRcdGNvbnN0IG5vdGUgPSBET00uYXBwZW5kKHJvdywgJCgnLmNoYXQtZGVidWctY2FjaGUtY2FyZC5icmVhaycpKTtcblx0XHRET00uYXBwZW5kKG5vdGUsICQoJy5jaGF0LWRlYnVnLWNhY2hlLWNhcmQtaCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5maXJzdFJlcXVlc3QnLCBcIkZpcnN0IHJlcXVlc3QgaW4gc2Vzc2lvblwiKSkpO1xuXHRcdGNvbnN0IGhlYWRsaW5lID0gRE9NLmFwcGVuZChub3RlLCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1jYXJkLWhlYWRsaW5lJykpO1xuXHRcdGhlYWRsaW5lLnRleHRDb250ZW50ID0gYCR7Zm9ybWF0Q2FjaGVQY3QoY29tcHV0ZUNhY2hlSGl0KGIuZXZlbnQpKX0lYDtcblx0XHRjb25zdCBzdWIgPSBET00uYXBwZW5kKG5vdGUsICQoJy5jaGF0LWRlYnVnLWNhY2hlLWNhcmQtc3ViJykpO1xuXHRcdHN1Yi50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuZmlyc3RSZXF1ZXN0Tm90ZScsIFwiT1RlbC1yZXBvcnRlZCBjYWNoZSBoaXQuIE5vdGhpbmcgZWFybGllciBpbiB0aGlzIHNlc3Npb24gdG8gZGlmZiBhZ2FpbnN0IFxcdTIwMTQgdGhlIHN5c3RlbSBwcm9tcHQgYW5kIHRvb2xzIG1heSBzdGlsbCBtYXRjaCBhIHByZXZpb3VzIHNlc3Npb24ncyBjYWNoZS5cIik7XG5cdFx0aWYgKGIucmVxdWVzdFNoYXBlLmRlc2NyaXB0aW9uKSB7XG5cdFx0XHRjb25zdCBzaGFwZUxpbmUgPSBET00uYXBwZW5kKG5vdGUsICQoJy5jaGF0LWRlYnVnLWNhY2hlLXBlcmYtbGluZS5jaGF0LWRlYnVnLWNhY2hlLXJlcXVlc3Qtc2hhcGUtbm90ZScpKTtcblx0XHRcdHNoYXBlTGluZS50ZXh0Q29udGVudCA9IGIucmVxdWVzdFNoYXBlLmRlc2NyaXB0aW9uO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZW5kZXIgdGhlIHRva2VuLWJhc2VkIGNhY2hlIHBlcmZvcm1hbmNlIGZvciBhIHJlcXVlc3QgcGFpciB3aGVuIHRoZVxuXHQgKiByZXF1ZXN0LXNpZGUgcHJvbXB0IHNpZ25hdHVyZSAoc3lzdGVtLCB0b29scywgaW5wdXQgbWVzc2FnZXMpIHdhcyBub3Rcblx0ICogY2FwdHVyZWQgZm9yIHRoZSBzZXNzaW9uIFx1MjAxNCBlLmcuIGFnZW50LWhvc3QgKENvcGlsb3QgQ0xJKSBzZXNzaW9ucywgd2hvc2Vcblx0ICogbG9nIHJlY29yZHMgdGhlIG1vZGVsJ3Mgb3V0cHV0IGJ1dCBub3QgdGhlIHJlcXVlc3Qgc2VudCB0byBpdC4gVGhlIHJlcG9ydGVkXG5cdCAqIGNhY2hlLWhpdCBudW1iZXJzIGFyZSBzdGlsbCBhY2N1cmF0ZSwgYnV0IHRoZXJlIGlzIG5vdGhpbmcgdG8gZGlmZiwgc28gdGhlXG5cdCAqIGRpdmVyZ2VuY2UtYmFzZWQgcm9vdC1jYXVzZSBhbmFseXNpcyBpcyBkZWxpYmVyYXRlbHkgc2tpcHBlZC5cblx0ICovXG5cdHByaXZhdGUgcmVuZGVyVG9rZW5Pbmx5U3VtbWFyeShhOiBJU2lkZURhdGEsIGI6IElTaWRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IHJvdyA9IERPTS5hcHBlbmQodGhpcy5jb250ZW50LCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1zdW1tYXJ5JykpO1xuXHRcdHJvdy5hcHBlbmRDaGlsZCh0aGlzLnJlbmRlclNpZGVDYXJkKGEsIGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUucHJldmlvdXNSZXF1ZXN0JywgXCJQcmV2aW91cyByZXF1ZXN0XCIpKSk7XG5cdFx0cm93LmFwcGVuZENoaWxkKHRoaXMucmVuZGVyU2lkZUNhcmQoYiwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5yZXF1ZXN0VGl0bGUnLCBcIlJlcXVlc3RcIikpKTtcblxuXHRcdGNvbnN0IGNhcmQgPSBET00uYXBwZW5kKHJvdywgJCgnLmNoYXQtZGVidWctY2FjaGUtY2FyZC5icmVhaycpKTtcblx0XHRET00uYXBwZW5kKGNhcmQsICQoJy5jaGF0LWRlYnVnLWNhY2hlLWNhcmQtaCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5wZXJmb3JtYW5jZScsIFwiQ2FjaGUgcGVyZm9ybWFuY2VcIikpKTtcblx0XHRjb25zdCBoZWFkbGluZSA9IERPTS5hcHBlbmQoY2FyZCwgJCgnLmNoYXQtZGVidWctY2FjaGUtY2FyZC1oZWFkbGluZScpKTtcblx0XHRoZWFkbGluZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuaGl0SGVhZGxpbmUnLCBcInswfSUgY2FjaGUgaGl0XCIsIGZvcm1hdENhY2hlUGN0KGNvbXB1dGVDYWNoZUhpdChiLmV2ZW50KSkpO1xuXHRcdHRoaXMuYXBwZW5kVG9rZW5zUmV1c2VkTGluZShjYXJkLCBiLmV2ZW50KTtcblx0XHRET00uYXBwZW5kKGNhcmQsICQoJy5jaGF0LWRlYnVnLWNhY2hlLXBlcmYtcnVsZScpKTtcblx0XHRjb25zdCBub3RlID0gRE9NLmFwcGVuZChjYXJkLCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1wZXJmLWxpbmUuY2hhdC1kZWJ1Zy1jYWNoZS1yZXF1ZXN0LXNoYXBlLW5vdGUnKSk7XG5cdFx0bm90ZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUubm9TaWduYXR1cmVOb3RlJywgXCJUaGUgcmVxdWVzdC1zaWRlIHByb21wdCAoc3lzdGVtIGluc3RydWN0aW9ucywgdG9vbCBjYXRhbG9nLCBhbmQgaW5wdXQgbWVzc2FnZXMpIHdhcyBub3QgY2FwdHVyZWQgZm9yIHRoaXMgc2Vzc2lvbiwgc28gdGhlIHByb21wdC1zaWduYXR1cmUgZGlmZiBhbmQgcm9vdC1jYXVzZSBmaW5kaW5ncyBhcmUgdW5hdmFpbGFibGUuIFRoZSBjYWNoZS1oaXQgbnVtYmVycyBhYm92ZSBjb21lIGZyb20gcmVwb3J0ZWQgdG9rZW4gdXNhZ2UuXCIpO1xuXHR9XG5cblx0LyoqIEFwcGVuZHMgdGhlIFwie2NhY2hlZH0gb2Yge2lucHV0fSBpbnB1dCB0b2tlbnMgcmV1c2VkXCIgc3ViLWxpbmUgZm9yIGEgcmVxdWVzdC4gKi9cblx0cHJpdmF0ZSBhcHBlbmRUb2tlbnNSZXVzZWRMaW5lKHBhcmVudDogSFRNTEVsZW1lbnQsIGV2ZW50OiBJQ2hhdERlYnVnTW9kZWxUdXJuRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCBpbnB1dFRva2VucyA9IGV2ZW50LmlucHV0VG9rZW5zID8/IDA7XG5cdFx0Y29uc3QgY2FjaGVkVG9rZW5zID0gZXZlbnQuY2FjaGVkVG9rZW5zID8/IDA7XG5cdFx0Y29uc3QgbG9zdFRva2VucyA9IE1hdGgubWF4KDAsIGlucHV0VG9rZW5zIC0gY2FjaGVkVG9rZW5zKTtcblx0XHRjb25zdCBsaW5lID0gRE9NLmFwcGVuZChwYXJlbnQsICQoJy5jaGF0LWRlYnVnLWNhY2hlLWNhcmQtc3ViJykpO1xuXHRcdGxpbmUudGV4dENvbnRlbnQgPSBsb3N0VG9rZW5zID4gMCAmJiBpbnB1dFRva2VucyA+IDBcblx0XHRcdD8gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS50b2tlbnNSZXVzZWRMb3N0Jyxcblx0XHRcdFx0XCJ7MH0gb2YgezF9IGlucHV0IHRva2VucyByZXVzZWQgXFx1MDBiNyB7Mn0gdW5jYWNoZWQgKHszfSUpXCIsXG5cdFx0XHRcdG51bWJlckZvcm1hdHRlci52YWx1ZS5mb3JtYXQoY2FjaGVkVG9rZW5zKSxcblx0XHRcdFx0bnVtYmVyRm9ybWF0dGVyLnZhbHVlLmZvcm1hdChpbnB1dFRva2VucyksXG5cdFx0XHRcdG51bWJlckZvcm1hdHRlci52YWx1ZS5mb3JtYXQobG9zdFRva2VucyksXG5cdFx0XHRcdGZvcm1hdENhY2hlUGN0KChsb3N0VG9rZW5zIC8gaW5wdXRUb2tlbnMpICogMTAwKSxcblx0XHRcdClcblx0XHRcdDogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS50b2tlbnNSZXVzZWQnLFxuXHRcdFx0XHRcInswfSBvZiB7MX0gaW5wdXQgdG9rZW5zIHJldXNlZFwiLFxuXHRcdFx0XHRudW1iZXJGb3JtYXR0ZXIudmFsdWUuZm9ybWF0KGNhY2hlZFRva2VucyksXG5cdFx0XHRcdG51bWJlckZvcm1hdHRlci52YWx1ZS5mb3JtYXQoaW5wdXRUb2tlbnMpLFxuXHRcdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgYXBwZW5kS3YocGFyZW50OiBIVE1MRWxlbWVudCwga2V5OiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcsIGNvcHlhYmxlOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHRjb25zdCByb3cgPSBET00uYXBwZW5kKHBhcmVudCwgJCgnLmNoYXQtZGVidWctY2FjaGUta3YnKSk7XG5cdFx0RE9NLmFwcGVuZChyb3csICQoJ3NwYW4uaycsIHVuZGVmaW5lZCwga2V5KSk7XG5cdFx0Y29uc3QgdmFsdWVFbCA9IERPTS5hcHBlbmQocm93LCAkKCdzcGFuLnYnLCB1bmRlZmluZWQsIHZhbHVlKSk7XG5cdFx0aWYgKGNvcHlhYmxlKSB7XG5cdFx0XHR2YWx1ZUVsLmNsYXNzTGlzdC5hZGQoJ2NoYXQtZGVidWctY2FjaGUtcmVxdWVzdC1pZCcpO1xuXHRcdFx0dmFsdWVFbC50aXRsZSA9IHZhbHVlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyU2lnbmF0dXJlKGE6IElTaWRlRGF0YSwgYjogSVNpZGVEYXRhLCBkaWZmOiBJQ2FjaGVEaWZmUmVzdWx0LCBjb21wYXJlSW5wdXRNZXNzYWdlczogYm9vbGVhbik6IHZvaWQge1xuXHRcdC8vIFNlZSBub3RlIG5leHQgdG8gYGNvbnRpbnVhdGlvbkNvbXBhcmlzb25gIGluIGByZW5kZXJTdW1tYXJ5YDogb25seSB0aGVcblx0XHQvLyBjdXJyZW50IHJlcXVlc3QncyBzaGFwZSBkZXRlcm1pbmVzIHdoZXRoZXIgdGhpcyBpcyBhIGNvbnRpbnVhdGlvbiB2aWV3LlxuXHRcdGNvbnN0IGNvbnRpbnVhdGlvbkNvbXBhcmlzb24gPSBiLnJlcXVlc3RTaGFwZS5pc0NvbnRpbnVhdGlvbjtcblx0XHRjb25zdCBzZWN0aW9uID0gRE9NLmFwcGVuZCh0aGlzLmNvbnRlbnQsICQoJy5jaGF0LWRlYnVnLWNhY2hlLXNlY3Rpb24nKSk7XG5cdFx0Y29uc3QgaGVhZGluZyA9IERPTS5hcHBlbmQoc2VjdGlvbiwgJCgnaDMuY2hhdC1kZWJ1Zy1jYWNoZS1zZWN0aW9uLWgnKSk7XG5cdFx0aGVhZGluZy50ZXh0Q29udGVudCA9IGNvbnRpbnVhdGlvbkNvbXBhcmlzb25cblx0XHRcdD8gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS52aXNpYmxlU2lnbmF0dXJlSGVhZGluZycsIFwiVmlzaWJsZSBSZXF1ZXN0IFNpZ25hdHVyZVwiKVxuXHRcdFx0OiBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLnNpZ25hdHVyZUhlYWRpbmcnLCBcIlByb21wdCBTaWduYXR1cmVcIik7XG5cdFx0aWYgKGNvbnRpbnVhdGlvbkNvbXBhcmlzb24pIHtcblx0XHRcdGNvbnN0IG5vdGUgPSBET00uYXBwZW5kKHNlY3Rpb24sICQoJy5jaGF0LWRlYnVnLWNhY2hlLXNpZy1zdW1tYXJ5LmNoYXQtZGVidWctY2FjaGUtcmVxdWVzdC1zaGFwZS1ub3RlJykpO1xuXHRcdFx0bm90ZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUudmlzaWJsZVNpZ25hdHVyZU5vdGUnLCBcIkZvciBSZXNwb25zZXMgQVBJIGNvbnRpbnVhdGlvbnMsIHRoaXMgc2hvd3MgdGhlIGNhcHR1cmVkIHJlcXVlc3QgaW5wdXRzOiBzeXN0ZW0gaW5zdHJ1Y3Rpb25zLCB0b29scyBzZW50IG9uIHRoaXMgcmVxdWVzdCwgYW5kIHRoZSB2aXNpYmxlIGlucHV0IGRlbHRhLiBFYXJsaWVyIGNvbnZlcnNhdGlvbiBzdGF0ZSBpcyByZWZlcmVuY2VkIGJ5IHByZXZpb3VzIHJlc3BvbnNlIGlkIGFuZCBpcyBub3QgZXhwYW5kZWQgaGVyZS5cIik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGVnZW5kID0gRE9NLmFwcGVuZChzZWN0aW9uLCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1zaWctbGVnZW5kJykpO1xuXHRcdC8vIE9yZGVyIG1hdHRlcnM6IGtlZXAgYHRvb2xzYCAob3JhbmdlLCB0aGUgY2F0YWxvZyBvZiBhdmFpbGFibGUgdG9vbHMpXG5cdFx0Ly8gZmFyIGZyb20gYHRvb2xgICh5ZWxsb3csIGluZGl2aWR1YWwgdG9vbCByZXN1bHQgbWVzc2FnZXMpIHNvIHRoZXlcblx0XHQvLyBhcmVuJ3QgcmVhZCBhcyB0aGUgc2FtZSB0aGluZy5cblx0XHRmb3IgKGNvbnN0IHJvbGUgb2YgWydzeXN0ZW0nLCAndXNlcicsICdhc3Npc3RhbnQnLCAndG9vbCcsICd0b29sX3NlYXJjaCcsICd0b29scyddKSB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IERPTS5hcHBlbmQobGVnZW5kLCAkKCdzcGFuLmNoYXQtZGVidWctY2FjaGUtc2lnLWxlZ2VuZC1lbnRyeScpKTtcblx0XHRcdERPTS5hcHBlbmQoZW50cnksICQoYHNwYW4uY2hhdC1kZWJ1Zy1jYWNoZS1zaWctc3dhdGNoLnJvbGUtJHtyb2xlQ2xhc3Mocm9sZSl9YCkpO1xuXHRcdFx0RE9NLmFwcGVuZChlbnRyeSwgRE9NLiQoJ3NwYW4nLCB1bmRlZmluZWQsIHJvbGUgPT09ICd0b29scydcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmxlZ2VuZC50b29scycsIFwidG9vbHMgKGNhdGFsb2cpXCIpXG5cdFx0XHRcdDogcm9sZSA9PT0gJ3Rvb2xfc2VhcmNoJ1xuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5sZWdlbmQudG9vbFNlYXJjaCcsIFwidG9vbCBzZWFyY2hcIilcblx0XHRcdFx0XHQ6IHJvbGUpKTtcblx0XHR9XG5cdFx0Y29uc3QgZHJpZnRFbnRyeSA9IERPTS5hcHBlbmQobGVnZW5kLCAkKCdzcGFuLmNoYXQtZGVidWctY2FjaGUtc2lnLWxlZ2VuZC1lbnRyeScpKTtcblx0XHRET00uYXBwZW5kKGRyaWZ0RW50cnksICQoJ3NwYW4uY2hhdC1kZWJ1Zy1jYWNoZS1zaWctc3dhdGNoLnJvbGUtZHJpZnQnKSk7XG5cdFx0RE9NLmFwcGVuZChkcmlmdEVudHJ5LCBET00uJCgnc3BhbicsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5kcmlmdExlZ2VuZCcsIFwiZHJpZnRcIikpKTtcblx0XHRjb25zdCBncm91cEVudHJ5ID0gRE9NLmFwcGVuZChsZWdlbmQsICQoJ3NwYW4uY2hhdC1kZWJ1Zy1jYWNoZS1zaWctbGVnZW5kLWVudHJ5JykpO1xuXHRcdERPTS5hcHBlbmQoZ3JvdXBFbnRyeSwgJCgnc3Bhbi5jaGF0LWRlYnVnLWNhY2hlLXNpZy1zd2F0Y2gucm9sZS1jb2FsZXNjZWQnKSk7XG5cdFx0RE9NLmFwcGVuZChncm91cEVudHJ5LCBET00uJCgnc3BhbicsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5ncm91cExlZ2VuZCcsIFwic21hbGwgbWVzc2FnZXMgKGdyb3VwZWQpXCIpKSk7XG5cblx0XHQvLyBQZXItc2lkZSBjaGFyLWxlbmd0aCBzZXF1ZW5jZXMuIFdlIHByZXBlbmQgc3ludGhldGljICdzeXN0ZW0nIGFuZFxuXHRcdC8vICd0b29scycgc2VnbWVudHMgKHdoZW4gcHJlc2VudCkgc28gdGhleSBzaG93IHVwIGluIHRoZSBiYXIgZXZlblxuXHRcdC8vIHRob3VnaCB0aGV5IGFyZSBub3QgcGFydCBvZiB0aGUgaW5wdXRNZXNzYWdlcyBhcnJheS4gVGhlIHN5bnRoZXRpY1xuXHRcdC8vIHNlZ21lbnRzIHNoYXJlIHRoZSBjYWNoZS1rZXkgcm9sZSB3aXRoIHRoZSBtZXNzYWdlczogYSBjaGFuZ2UgaW5cblx0XHQvLyBlaXRoZXIgYWxzbyBicmVha3MgdGhlIHByZWZpeC5cblx0XHRpbnRlcmZhY2UgSVNlZ21lbnQge1xuXHRcdFx0cmVhZG9ubHkgcm9sZTogc3RyaW5nO1xuXHRcdFx0cmVhZG9ubHkgY2hhcnM6IG51bWJlcjtcblx0XHRcdHJlYWRvbmx5IGRyaWZ0OiBib29sZWFuO1xuXHRcdFx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0XHRcdC8qKiBUcnVlIGlmIHRoaXMgaXMgb25lIG9mIHRoZSBzeW50aGV0aWMgcHJlZml4IHNlZ21lbnRzIChzeXN0ZW0vdG9vbHMpLiAqL1xuXHRcdFx0cmVhZG9ubHkgc3ludGhldGljOiBib29sZWFuO1xuXHRcdFx0LyoqIENvbXBvbmVudHMtc2VjdGlvbiBhbmNob3IgZm9yIHRoaXMgc2VnbWVudCAoZS5nLiBgbWVzc2FnZXNbM11gKS4gKi9cblx0XHRcdHJlYWRvbmx5IGNvbXBvbmVudDogc3RyaW5nO1xuXHRcdH1cblx0XHRjb25zdCB0b1NlZ21lbnRzID0gKHNpZGU6IElTaWRlRGF0YSwgaXNBOiBib29sZWFuKTogSVNlZ21lbnRbXSA9PiB7XG5cdFx0XHRjb25zdCBzZWdzOiBJU2VnbWVudFtdID0gW107XG5cdFx0XHRjb25zdCBzeXMgPSBzaWRlLnN5c3RlbTtcblx0XHRcdGlmIChzeXMpIHtcblx0XHRcdFx0Y29uc3Qgb3RoZXIgPSBpc0EgPyBiLnN5c3RlbSA6IGEuc3lzdGVtO1xuXHRcdFx0XHRzZWdzLnB1c2goeyByb2xlOiAnc3lzdGVtJywgY2hhcnM6IHN5cy5sZW5ndGgsIGRyaWZ0OiBzeXMgIT09IChvdGhlciA/PyAnJyksIGxhYmVsOiAnc3lzdGVtJywgc3ludGhldGljOiB0cnVlLCBjb21wb25lbnQ6ICdzeXN0ZW0nIH0pO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdG9vbHMgPSBzaWRlLnRvb2xzO1xuXHRcdFx0aWYgKHRvb2xzKSB7XG5cdFx0XHRcdGNvbnN0IG90aGVyID0gaXNBID8gYi50b29scyA6IGEudG9vbHM7XG5cdFx0XHRcdHNlZ3MucHVzaCh7IHJvbGU6ICd0b29scycsIGNoYXJzOiB0b29scy5sZW5ndGgsIGRyaWZ0OiB0b29scyAhPT0gKG90aGVyID8/ICcnKSwgbGFiZWw6ICd0b29scycsIHN5bnRoZXRpYzogdHJ1ZSwgY29tcG9uZW50OiAndG9vbHMnIH0pO1xuXHRcdFx0fVxuXHRcdFx0c2lkZS5pbnB1dE1lc3NhZ2VzLmZvckVhY2goKG0sIGkpID0+IHtcblx0XHRcdFx0Y29uc3QgdG9rID0gZGlmZi5zaWduYXR1cmVbaV07XG5cdFx0XHRcdGNvbnN0IGtpbmQgPSB0b2s/LmtpbmQ7XG5cdFx0XHRcdGNvbnN0IGRyaWZ0ID0gY29tcGFyZUlucHV0TWVzc2FnZXMgJiYgKGtpbmQgPT09IENhY2hlRGlmZktpbmQuQ29udGVudERyaWZ0XG5cdFx0XHRcdFx0fHwga2luZCA9PT0gQ2FjaGVEaWZmS2luZC5MZW5ndGhDaGFuZ2Vcblx0XHRcdFx0XHR8fCAoaXNBICYmIGtpbmQgPT09IENhY2hlRGlmZktpbmQuT25seUluQSlcblx0XHRcdFx0XHR8fCAoIWlzQSAmJiBraW5kID09PSBDYWNoZURpZmZLaW5kLk9ubHlJbkIpKTtcblx0XHRcdFx0c2Vncy5wdXNoKHsgcm9sZTogbS5yb2xlLCBjaGFyczogbS5jaGFyTGVuZ3RoLCBkcmlmdCwgbGFiZWw6IG0ubmFtZSA/IGAke20ucm9sZX0tJHttLm5hbWV9YCA6IG0ucm9sZSwgc3ludGhldGljOiBmYWxzZSwgY29tcG9uZW50OiBgbWVzc2FnZXNbJHtpfV1gIH0pO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gc2Vncztcblx0XHR9O1xuXG5cdFx0Y29uc3QgYVNlZ3MgPSB0b1NlZ21lbnRzKGEsIHRydWUpO1xuXHRcdGNvbnN0IGJTZWdzID0gdG9TZWdtZW50cyhiLCBmYWxzZSk7XG5cdFx0Y29uc3QgdG90YWxBID0gYVNlZ3MucmVkdWNlKChzLCB4KSA9PiBzICsgeC5jaGFycywgMCk7XG5cdFx0Y29uc3QgdG90YWxCID0gYlNlZ3MucmVkdWNlKChzLCB4KSA9PiBzICsgeC5jaGFycywgMCk7XG5cdFx0Y29uc3QgbWF4ID0gTWF0aC5tYXgodG90YWxBLCB0b3RhbEIsIDEpO1xuXG5cdFx0Ly8gQ29tcHV0ZSBjaGFyIHBvc2l0aW9uIG9mIGNhY2hlIGJyZWFrIGluc2lkZSBlYWNoIHNpZGUncyBiYXIuXG5cdFx0Ly8gUmV0dXJucyB1bmRlZmluZWQgaWYgdGhlIGJyZWFrIGluZGV4IGZhbGxzIG91dHNpZGUgdGhlIHNpZGUnc1xuXHRcdC8vIHNlZ21lbnQgbGlzdCAoZS5nLiBicmVhayBpcyBhdCBtZXNzYWdlc1tOXSBidXQgQiBoYXMgZmV3ZXJcblx0XHQvLyBtZXNzYWdlcyk7IHJlbmRlcmluZyB0aGF0IGFzIHRoZSByaWdodCBlZGdlIG9mIHRoZSBiYXIgd291bGRcblx0XHQvLyBtaXNsZWFkaW5nbHkgc3VnZ2VzdCBcInRoZSBjYWNoZSBicm9rZSBhdCB0aGUgZW5kXCIuXG5cdFx0Y29uc3QgYnJlYWtDaGFyUG9zID0gKHNlZ3M6IHJlYWRvbmx5IElTZWdtZW50W10pOiBudW1iZXIgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0aWYgKCFkaWZmLmJyZWFrKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHQvLyBTa2lwIHRoZSBzeW50aGV0aWMgc3lzdGVtIC8gdG9vbHMgc2VnbWVudHMgd2hlbiBtYXRjaGluZ1xuXHRcdFx0Ly8gZGlmZi5icmVhay5pbmRleCwgd2hpY2ggaXMgYW4gaW5kZXggaW50byB0aGUgbWVzc2FnZXMgYXJyYXkuXG5cdFx0XHRsZXQgY3VtdWxhdGl2ZSA9IDA7XG5cdFx0XHRsZXQgaWR4ID0gMDtcblx0XHRcdGZvciAoY29uc3QgcyBvZiBzZWdzKSB7XG5cdFx0XHRcdGlmIChzLnN5bnRoZXRpYykge1xuXHRcdFx0XHRcdGN1bXVsYXRpdmUgKz0gcy5jaGFycztcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaWR4ID09PSBkaWZmLmJyZWFrLmluZGV4KSB7XG5cdFx0XHRcdFx0cmV0dXJuIGN1bXVsYXRpdmU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y3VtdWxhdGl2ZSArPSBzLmNoYXJzO1xuXHRcdFx0XHRpZHgrKztcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fTtcblxuXHRcdC8vIEVzdGltYXRlZCB0b2tlbnMgcGVyIGNoYXIsIGNhbGlicmF0ZWQgYWdhaW5zdCB0aGUgT1RlbC1yZXBvcnRlZFxuXHRcdC8vIGlucHV0IHRva2VuIGNvdW50IGZvciBlYWNoIHNpZGUuIExpbmVhciwgc28gaXQgZG9lc24ndCBjaGFuZ2UgdGhlXG5cdFx0Ly8gYmFyIHByb3BvcnRpb25zIFx1MjAxNCBpdCB0dXJucyBjaGFyIGNvdW50cyBpbnRvIHRoZSB1bml0IHRoYXQncyBiaWxsZWQuXG5cdFx0Y29uc3QgYVRva2Vuc1BlckNoYXIgPSBhLmV2ZW50LmlucHV0VG9rZW5zICYmIHRvdGFsQSA+IDAgPyBhLmV2ZW50LmlucHV0VG9rZW5zIC8gdG90YWxBIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGJUb2tlbnNQZXJDaGFyID0gYi5ldmVudC5pbnB1dFRva2VucyAmJiB0b3RhbEIgPiAwID8gYi5ldmVudC5pbnB1dFRva2VucyAvIHRvdGFsQiA6IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGJ1aWxkTGFuZSA9IChsYWJlbDogc3RyaW5nLCBzZWdzOiByZWFkb25seSBJU2VnbWVudFtdLCBicmVha1BvczogbnVtYmVyIHwgdW5kZWZpbmVkLCB0b2tlbnNQZXJDaGFyOiBudW1iZXIgfCB1bmRlZmluZWQpOiBIVE1MRWxlbWVudCA9PiB7XG5cdFx0XHRjb25zdCByb3cgPSAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1zaWctbGFuZS1yb3cnKTtcblx0XHRcdERPTS5hcHBlbmQocm93LCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1zaWctbGFuZS1sYWJlbCcsIHVuZGVmaW5lZCwgbGFiZWwpKTtcblx0XHRcdGNvbnN0IGJhciA9IERPTS5hcHBlbmQocm93LCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1zaWctYmFyJykpO1xuXHRcdFx0Y29uc3Qgc2lkZVRvdGFsID0gc2Vncy5yZWR1Y2UoKHN1bSwgcykgPT4gc3VtICsgcy5jaGFycywgMCk7XG5cblx0XHRcdGNvbnN0IHNpemVUZXh0ID0gKGNoYXJzOiBudW1iZXIpID0+IHRva2Vuc1BlckNoYXIgIT09IHVuZGVmaW5lZFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuc2VnU2l6ZVRva2VucycsIFwiezB9IGNoYXJzIChcXHUyMjQ4IHsxfSB0b2spXCIsIG51bWJlckZvcm1hdHRlci52YWx1ZS5mb3JtYXQoY2hhcnMpLCBudW1iZXJGb3JtYXR0ZXIudmFsdWUuZm9ybWF0KE1hdGgucm91bmQoY2hhcnMgKiB0b2tlbnNQZXJDaGFyKSkpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5zZWdTaXplQ2hhcnMnLCBcInswfSBjaGFyc1wiLCBudW1iZXJGb3JtYXR0ZXIudmFsdWUuZm9ybWF0KGNoYXJzKSk7XG5cblx0XHRcdGNvbnN0IHJlbmRlclNlZ21lbnQgPSAoczogSVNlZ21lbnQpID0+IHtcblx0XHRcdFx0Y29uc3Qgc2VnID0gRE9NLmFwcGVuZChiYXIsICQoYHNwYW4uY2hhdC1kZWJ1Zy1jYWNoZS1zaWctc2VnLnJvbGUtJHtyb2xlQ2xhc3Mocy5yb2xlKX1gKSk7XG5cdFx0XHRcdGlmIChzLmRyaWZ0KSB7XG5cdFx0XHRcdFx0c2VnLmNsYXNzTGlzdC5hZGQoJ2lzLWRyaWZ0Jyk7XG5cdFx0XHRcdFx0Ly8gRHJpZnRpbmcgc2VnbWVudHMgaGF2ZSBhIG1hdGNoaW5nIENvbXBvbmVudHMgZW50cnkgXFx1MjAxNCBtYWtlXG5cdFx0XHRcdFx0Ly8gdGhlbSBjbGlja2FibGUgc28gYSByZWQgbWFyayBpbiB0aGUgYmFyIGNhbiBiZSBpbnNwZWN0ZWRcblx0XHRcdFx0XHQvLyBkaXJlY3RseSBpbnN0ZWFkIG9mIGh1bnRpbmcgZm9yIGl0IGluIHRoZSBhY2NvcmRpb24uXG5cdFx0XHRcdFx0c2VnLmNsYXNzTGlzdC5hZGQoJ2lzLWNsaWNrYWJsZScpO1xuXHRcdFx0XHRcdHNlZy5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0XHRcdFx0c2VnLnRhYkluZGV4ID0gMDtcblx0XHRcdFx0XHRjb25zdCByZXZlYWwgPSAoKSA9PiB0aGlzLnJldmVhbENvbXBvbmVudChzLmNvbXBvbmVudCk7XG5cdFx0XHRcdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoc2VnLCBET00uRXZlbnRUeXBlLkNMSUNLLCByZXZlYWwpKTtcblx0XHRcdFx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihzZWcsIERPTS5FdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0XHRcdHJldmVhbCgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzZWcuc3R5bGUud2lkdGggPSBgJHsocy5jaGFycyAvIG1heCkgKiAxMDB9JWA7XG5cdFx0XHRcdHNlZy50aXRsZSA9IHMuZHJpZnRcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuc2VnRHJpZnRUb29sdGlwJywgXCJ7MH0gKHsxfSk6IHsyfSBcXHUyMDE0IGRyaWZ0ZWQuIENsaWNrIHRvIGluc3BlY3QuXCIsIHMuY29tcG9uZW50LCBzLmxhYmVsLCBzaXplVGV4dChzLmNoYXJzKSlcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuc2VnVG9vbHRpcCcsIFwiezB9ICh7MX0pOiB7Mn1cIiwgcy5jb21wb25lbnQsIHMubGFiZWwsIHNpemVUZXh0KHMuY2hhcnMpKTtcblx0XHRcdFx0Ly8gTWlycm9yIHRoZSB0b29sdGlwIGludG8gYW4gYWNjZXNzaWJsZSBuYW1lIHNvIHNjcmVlbiByZWFkZXJzXG5cdFx0XHRcdC8vIGFubm91bmNlIHdoYXQgdGhlIGJ1dHRvbi1yb2xlIHNwYW4gZG9lcy4gT25seSBkcmlmdCBzZWdtZW50c1xuXHRcdFx0XHQvLyBhcmUgZm9jdXNhYmxlLCBzbyBub24tZHJpZnQgc2xpdmVycyBkb24ndCBuZWVkIG9uZS5cblx0XHRcdFx0aWYgKHMuZHJpZnQpIHtcblx0XHRcdFx0XHRzZWcuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgc2VnLnRpdGxlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBJbi1iYXIgdGV4dCBpcyB0aGUgY2hhciBjb3VudCBhbG9uZSBcXHUyMDE0IHRoZSByb2xlIGlzIGFscmVhZHlcblx0XHRcdFx0Ly8gY29sb3ItY29kZWQsIGFuZCBwYXJ0aWFsIGxhYmVscyAoXCJ1c2VyOjI0LDlcXHUyMDI2XCIpIHJlYWQgd29yc2Vcblx0XHRcdFx0Ly8gdGhhbiBub25lLiBPbmx5IHNlZ21lbnRzIHdpZGUgZW5vdWdoIGZvciB0aGUgZGlnaXRzIGdldCB0ZXh0LlxuXHRcdFx0XHRpZiAocy5jaGFycyA+IG1heCAqIDAuMDYpIHtcblx0XHRcdFx0XHRzZWcudGV4dENvbnRlbnQgPSBudW1iZXJGb3JtYXR0ZXIudmFsdWUuZm9ybWF0KHMuY2hhcnMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBSdW5zIG9mIHNtYWxsIHNhbWUta2luZCBtZXNzYWdlcyByZW5kZXIgYXMgb25lIG11dGVkIGdyb3VwIHNvXG5cdFx0XHQvLyBkb3plbnMgb2YgdGlueSB0b29sL2Fzc2lzdGFudCBzbGl2ZXJzIGRvbid0IHR1cm4gdGhlIGJhciBpbnRvXG5cdFx0XHQvLyBub2lzZS4gRHJpZnQgYW5kIHN5bnRoZXRpYyAoc3lzdGVtL3Rvb2xzKSBzZWdtZW50cyBhbHdheXMgcmVuZGVyXG5cdFx0XHQvLyBpbmRpdmlkdWFsbHk7IGEgXCJydW5cIiBvZiBvbmUga2VlcHMgaXRzIG93biBjb2xvcnMgdG9vLlxuXHRcdFx0Y29uc3QgcmVuZGVyR3JvdXAgPSAoZ3JvdXA6IElTZWdtZW50W10pID0+IHtcblx0XHRcdFx0aWYgKGdyb3VwLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdHJlbmRlclNlZ21lbnQoZ3JvdXBbMF0pO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjaGFycyA9IGdyb3VwLnJlZHVjZSgoc3VtLCBzKSA9PiBzdW0gKyBzLmNoYXJzLCAwKTtcblx0XHRcdFx0Y29uc3Qgc2VnID0gRE9NLmFwcGVuZChiYXIsICQoJ3NwYW4uY2hhdC1kZWJ1Zy1jYWNoZS1zaWctc2VnLnJvbGUtY29hbGVzY2VkJykpO1xuXHRcdFx0XHRzZWcuc3R5bGUud2lkdGggPSBgJHsoY2hhcnMgLyBtYXgpICogMTAwfSVgO1xuXHRcdFx0XHRzZWcudGl0bGUgPSBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLnNlZ0dyb3VwVG9vbHRpcCcsIFwiezB9IFxcdTIwMjYgezF9OiB7Mn0gc21hbGwgbWVzc2FnZXMsIHszfVwiLCBncm91cFswXS5jb21wb25lbnQsIGdyb3VwW2dyb3VwLmxlbmd0aCAtIDFdLmNvbXBvbmVudCwgZ3JvdXAubGVuZ3RoLCBzaXplVGV4dChjaGFycykpO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgQ09BTEVTQ0VfVEhSRVNIT0xEID0gbWF4ICogMC4wMTU7XG5cdFx0XHRsZXQgcGVuZGluZzogSVNlZ21lbnRbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBzIG9mIHNlZ3MpIHtcblx0XHRcdFx0aWYgKHMuY2hhcnMgPD0gMCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghcy5zeW50aGV0aWMgJiYgIXMuZHJpZnQgJiYgcy5jaGFycyA8IENPQUxFU0NFX1RIUkVTSE9MRCkge1xuXHRcdFx0XHRcdHBlbmRpbmcucHVzaChzKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocGVuZGluZy5sZW5ndGgpIHtcblx0XHRcdFx0XHRyZW5kZXJHcm91cChwZW5kaW5nKTtcblx0XHRcdFx0XHRwZW5kaW5nID0gW107XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVuZGVyU2VnbWVudChzKTtcblx0XHRcdH1cblx0XHRcdGlmIChwZW5kaW5nLmxlbmd0aCkge1xuXHRcdFx0XHRyZW5kZXJHcm91cChwZW5kaW5nKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUGFkIHRoZSBsYW5lIHNvIGJvdGggc2lkZXMgc2hhcmUgdGhlIHNhbWUgeCBzY2FsZS5cblx0XHRcdGlmIChzaWRlVG90YWwgPCBtYXgpIHtcblx0XHRcdFx0Y29uc3QgcGFkID0gRE9NLmFwcGVuZChiYXIsICQoJ3NwYW4uY2hhdC1kZWJ1Zy1jYWNoZS1zaWctc2VnLnJvbGUtZW1wdHknKSk7XG5cdFx0XHRcdHBhZC5zdHlsZS53aWR0aCA9IGAkeygobWF4IC0gc2lkZVRvdGFsKSAvIG1heCkgKiAxMDB9JWA7XG5cdFx0XHR9XG5cdFx0XHRpZiAoYnJlYWtQb3MgIT09IHVuZGVmaW5lZCAmJiBkaWZmLmJyZWFrKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmUgPSBET00uYXBwZW5kKGJhciwgJCgnLmNoYXQtZGVidWctY2FjaGUtc2lnLWJyZWFrJykpO1xuXHRcdFx0XHRsaW5lLnN0eWxlLmxlZnQgPSBgJHsoYnJlYWtQb3MgLyBtYXgpICogMTAwfSVgO1xuXHRcdFx0XHRsaW5lLnRpdGxlID0gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5icmVha0xpbmVUb29sdGlwJywgXCJDYWNoZSBicmVhayBhdCBtZXNzYWdlc1t7MH1dXCIsIGRpZmYuYnJlYWsuaW5kZXgpO1xuXHRcdFx0fVxuXHRcdFx0RE9NLmFwcGVuZChyb3csICQoJy5jaGF0LWRlYnVnLWNhY2hlLXNpZy1sYW5lLXRvdGFsJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmNoYXJzVG90YWwnLCBcInswfSBjaGFyc1wiLCBudW1iZXJGb3JtYXR0ZXIudmFsdWUuZm9ybWF0KHNpZGVUb3RhbCkpKSk7XG5cdFx0XHRyZXR1cm4gcm93O1xuXHRcdH07XG5cblx0XHRjb25zdCBsYW5lcyA9IERPTS5hcHBlbmQoc2VjdGlvbiwgJCgnLmNoYXQtZGVidWctY2FjaGUtc2lnLWxhbmVzJykpO1xuXHRcdGxhbmVzLmFwcGVuZENoaWxkKGJ1aWxkTGFuZShsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmxhbmVQcmV2aW91cycsIFwiUHJldmlvdXNcIiksIGFTZWdzLCBicmVha0NoYXJQb3MoYVNlZ3MpLCBhVG9rZW5zUGVyQ2hhcikpO1xuXHRcdGxhbmVzLmFwcGVuZENoaWxkKGJ1aWxkTGFuZShsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmxhbmVDdXJyZW50JywgXCJDdXJyZW50XCIpLCBiU2VncywgYnJlYWtDaGFyUG9zKGJTZWdzKSwgYlRva2Vuc1BlckNoYXIpKTtcblxuXHRcdC8vIFByZWZpeC1tYXRjaCByYWlsOiBhIHRoaW4gYmFyIHVuZGVyIHRoZSBsYW5lcyBzcGxpdHRpbmcgdGhlIGN1cnJlbnRcblx0XHQvLyByZXF1ZXN0IGludG8gdGhlIHNwYW4gdGhhdCBieXRlLW1hdGNoZXMgdGhlIHByZXZpb3VzIHJlcXVlc3QgKGNhY2hlLVxuXHRcdC8vIHNlcnZhYmxlKSBhbmQgdGhlIHNwYW4gYWZ0ZXIgdGhlIGZpcnN0IGRyaWZ0IChyZWNvbXB1dGVkKS4gV2Fsa3MgdGhlXG5cdFx0Ly8gY3VycmVudCBzaWRlJ3Mgc2VnbWVudHMgaW4gcmVuZGVyIG9yZGVyIFx1MjAxNCBzeXN0ZW0sIHRvb2xzLCBtZXNzYWdlcyBcdTIwMTRcblx0XHQvLyBzbyBhIHRvb2xzL3N5c3RlbSBjaGFuZ2UgY29ycmVjdGx5IHB1bGxzIHRoZSBib3VuZGFyeSB0byB0aGUgZnJvbnQuXG5cdFx0aWYgKGNvbXBhcmVJbnB1dE1lc3NhZ2VzICYmIHRvdGFsQiA+IDApIHtcblx0XHRcdGxldCByZXVzZWQgPSAwO1xuXHRcdFx0bGV0IHNhd0RyaWZ0ID0gZmFsc2U7XG5cdFx0XHRmb3IgKGNvbnN0IHMgb2YgYlNlZ3MpIHtcblx0XHRcdFx0aWYgKHMuZHJpZnQpIHtcblx0XHRcdFx0XHRzYXdEcmlmdCA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV1c2VkICs9IHMuY2hhcnM7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXNhd0RyaWZ0KSB7XG5cdFx0XHRcdHJldXNlZCA9IHRvdGFsQjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJhaWxSb3cgPSBET00uYXBwZW5kKGxhbmVzLCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1zaWctbGFuZS1yb3cucmV1c2UnKSk7XG5cdFx0XHRET00uYXBwZW5kKHJhaWxSb3csICQoJy5jaGF0LWRlYnVnLWNhY2hlLXNpZy1sYW5lLWxhYmVsJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLnJldXNlTGFuZScsIFwiTWF0Y2hcIikpKTtcblx0XHRcdGNvbnN0IHJhaWwgPSBET00uYXBwZW5kKHJhaWxSb3csICQoJy5jaGF0LWRlYnVnLWNhY2hlLXNpZy1yZXVzZS1yYWlsJykpO1xuXHRcdFx0aWYgKHJldXNlZCA+IDApIHtcblx0XHRcdFx0Y29uc3Qgb2sgPSBET00uYXBwZW5kKHJhaWwsICQoJ3NwYW4uY2hhdC1kZWJ1Zy1jYWNoZS1zaWctcmV1c2Utc2VnLmlzLXJldXNlZCcpKTtcblx0XHRcdFx0b2suc3R5bGUud2lkdGggPSBgJHsocmV1c2VkIC8gbWF4KSAqIDEwMH0lYDtcblx0XHRcdFx0b2sudGl0bGUgPSBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLnJldXNlZFRvb2x0aXAnLCBcIkJ5dGUtaWRlbnRpY2FsIHRvIHRoZSBwcmV2aW91cyByZXF1ZXN0OiB7MH0gY2hhcnMgY2FuIGJlIHNlcnZlZCBmcm9tIGNhY2hlXCIsIG51bWJlckZvcm1hdHRlci52YWx1ZS5mb3JtYXQocmV1c2VkKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodG90YWxCIC0gcmV1c2VkID4gMCkge1xuXHRcdFx0XHRjb25zdCBiYWQgPSBET00uYXBwZW5kKHJhaWwsICQoJ3NwYW4uY2hhdC1kZWJ1Zy1jYWNoZS1zaWctcmV1c2Utc2VnLmlzLXJlY29tcHV0ZWQnKSk7XG5cdFx0XHRcdGJhZC5zdHlsZS53aWR0aCA9IGAkeygodG90YWxCIC0gcmV1c2VkKSAvIG1heCkgKiAxMDB9JWA7XG5cdFx0XHRcdGJhZC50aXRsZSA9IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUucmVjb21wdXRlZFRvb2x0aXAnLCBcIkRpdmVyZ2VzIGZyb20gdGhlIHByZXZpb3VzIHJlcXVlc3Q6IHswfSBjaGFycyBhcmUgcmVjb21wdXRlZFwiLCBudW1iZXJGb3JtYXR0ZXIudmFsdWUuZm9ybWF0KHRvdGFsQiAtIHJldXNlZCkpO1xuXHRcdFx0fVxuXHRcdFx0RE9NLmFwcGVuZChyYWlsUm93LCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1zaWctbGFuZS10b3RhbCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5yZXVzZVBjdCcsIFwiezB9JSBtYXRjaFwiLCBTdHJpbmcoTWF0aC5mbG9vcigocmV1c2VkIC8gdG90YWxCKSAqIDEwMCkpKSkpO1xuXHRcdH1cblxuXHRcdC8vIFBlci1jaHVuayBicmVha2Rvd246IGFuIGV4YWN0LCBzY2FubmFibGUgdGFibGUgb2Ygd2hlcmUgdGhlIGJ5dGVzIGdvIG9uXG5cdFx0Ly8gZWFjaCBzaWRlLiBDb21wbGVtZW50cyB0aGUgYmFyICh3aGljaCBoaWRlcyBzbWFsbCBjaHVua3MpIGFuZCB0aGVcblx0XHQvLyBDb21wb25lbnRzIHNlY3Rpb24gKHdoaWNoIG9ubHkgbGlzdHMgZHJpZnRpbmcgY29tcG9uZW50cykuXG5cdFx0dGhpcy5yZW5kZXJDaHVua0JyZWFrZG93bihzZWN0aW9uLCBhbGlnblNpZ25hdHVyZUNodW5rcyhhU2VncywgYlNlZ3MpLCB0b3RhbEEsIHRvdGFsQiwgYlRva2Vuc1BlckNoYXIpO1xuXG5cdFx0Ly8gU2luZ2xlLWxpbmUgdGV4dCBzdW1tYXJ5IGJlbG93IHRoZSBiYXJzLiBDb21wdXRlIHRoaXMgaW4gdGhlXG5cdFx0Ly8gc2FtZSBvcmRlciB0aGUgcHJvdmlkZXIgc2VlcyBjYWNoZS1rZXlpbmcgaW5wdXRzOiBzeXN0ZW0sIHRvb2xzLFxuXHRcdC8vIHRoZW4gY2FwdHVyZWQgaW5wdXQgbWVzc2FnZXMuIFRoaXMgYXZvaWRzIHJlcG9ydGluZyBtZXNzYWdlc1swXSBhc1xuXHRcdC8vIHRoZSBmaXJzdCBicmVhayB3aGVuIHRoZSB0b29sIGNhdGFsb2cgY2hhbmdlZCBlYXJsaWVyLlxuXHRcdGxldCBzaGFyZWQgPSAwO1xuXHRcdGxldCBmaXJzdERyaWZ0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGEuc3lzdGVtIHx8IGIuc3lzdGVtKSB7XG5cdFx0XHRpZiAoKGEuc3lzdGVtID8/ICcnKSA9PT0gKGIuc3lzdGVtID8/ICcnKSkge1xuXHRcdFx0XHRzaGFyZWQgKz0gYi5zeXN0ZW0/Lmxlbmd0aCA/PyAwO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Zmlyc3REcmlmdCA9IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuc3lzdGVtQ29tcG9uZW50JywgXCJzeXN0ZW1cIik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghZmlyc3REcmlmdCAmJiAoYS50b29scyB8fCBiLnRvb2xzKSkge1xuXHRcdFx0aWYgKChhLnRvb2xzID8/ICcnKSA9PT0gKGIudG9vbHMgPz8gJycpKSB7XG5cdFx0XHRcdHNoYXJlZCArPSBiLnRvb2xzPy5sZW5ndGggPz8gMDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGZpcnN0RHJpZnQgPSBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLnRvb2xzQ29tcG9uZW50JywgXCJ0b29scyBjYXRhbG9nXCIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIWZpcnN0RHJpZnQpIHtcblx0XHRcdGZvciAoY29uc3QgdG9rIG9mIGRpZmYuc2lnbmF0dXJlKSB7XG5cdFx0XHRcdGlmICh0b2sua2luZCA9PT0gQ2FjaGVEaWZmS2luZC5JZGVudGljYWwpIHtcblx0XHRcdFx0XHRzaGFyZWQgKz0gdG9rLmJDaGFyTGVuZ3RoID8/IDA7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Zmlyc3REcmlmdCA9IGBtZXNzYWdlc1ske3Rvay5pbmRleH1dYDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBzdW1tYXJ5ID0gRE9NLmFwcGVuZChzZWN0aW9uLCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1zaWctc3VtbWFyeScpKTtcblx0XHRpZiAoZmlyc3REcmlmdCkge1xuXHRcdFx0c3VtbWFyeS50ZXh0Q29udGVudCA9IGNvbnRpbnVhdGlvbkNvbXBhcmlzb25cblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLnZpc2libGVTaWduYXR1cmVTdW1tYXJ5QnJlYWsnLCBcInswfSBvZiB7MX0gY2FwdHVyZWQgcmVxdWVzdCBjaGFycyBtYXRjaCBiZWZvcmUgZmlyc3QgY2FwdHVyZWQgZHJpZnQ6IHsyfVwiLCBudW1iZXJGb3JtYXR0ZXIudmFsdWUuZm9ybWF0KHNoYXJlZCksIG51bWJlckZvcm1hdHRlci52YWx1ZS5mb3JtYXQodG90YWxCKSwgZmlyc3REcmlmdClcblx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLnNpZ25hdHVyZVN1bW1hcnlCcmVha0NvbXBvbmVudCcsIFwiezB9IG9mIHsxfSBjaGFycyByZXVzZWQgXHUwMEI3IGJyZWFrIGF0IHsyfVwiLCBudW1iZXJGb3JtYXR0ZXIudmFsdWUuZm9ybWF0KHNoYXJlZCksIG51bWJlckZvcm1hdHRlci52YWx1ZS5mb3JtYXQodG90YWxCKSwgZmlyc3REcmlmdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN1bW1hcnkudGV4dENvbnRlbnQgPSBjb250aW51YXRpb25Db21wYXJpc29uXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS52aXNpYmxlU2lnbmF0dXJlU3VtbWFyeUNsZWFuJywgXCJ7MH0gb2YgezF9IGNhcHR1cmVkIHJlcXVlc3QgY2hhcnMgbWF0Y2ggXHUwMEI3IG5vIGNhcHR1cmVkIGRpdmVyZ2VuY2UgZGV0ZWN0ZWRcIiwgbnVtYmVyRm9ybWF0dGVyLnZhbHVlLmZvcm1hdChzaGFyZWQpLCBudW1iZXJGb3JtYXR0ZXIudmFsdWUuZm9ybWF0KHRvdGFsQikpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5zaWduYXR1cmVTdW1tYXJ5Q2xlYW4nLCBcInswfSBvZiB7MX0gY2hhcnMgcmV1c2VkIFx1MDBCNyBubyBkaXZlcmdlbmNlIGRldGVjdGVkXCIsIG51bWJlckZvcm1hdHRlci52YWx1ZS5mb3JtYXQoc2hhcmVkKSwgbnVtYmVyRm9ybWF0dGVyLnZhbHVlLmZvcm1hdCh0b3RhbEIpKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVuZGVyIHRoZSBwZXIta2V5IHJlcXVlc3Qtb3B0aW9ucyB0YWJsZS4gU2hvd3MgZXZlcnkgY2FjaGUta2V5aW5nXG5cdCAqIG9wdGlvbiBjYXB0dXJlZCBmcm9tIHRoZSBtb2RlbCBwcm92aWRlciByZXF1ZXN0IGJvZHksIHdpdGggYSBjb2x1bW5cblx0ICogZm9yIHRoZSBwcmV2aW91cyB0dXJuIGFuZCBvbmUgZm9yIHRoZSBjdXJyZW50IHR1cm4uIFJvd3Mgd2hvc2Vcblx0ICogdmFsdWVzIGRpZmZlciBhcmUgaGlnaGxpZ2h0ZWQuXG5cdCAqL1xuXHRwcml2YXRlIHJlbmRlclJlcXVlc3RPcHRpb25zKGE6IElTaWRlRGF0YSwgYjogSVNpZGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldiA9IHNpZGVPcHRpb25zKGEpO1xuXHRcdGNvbnN0IGN1cnIgPSBzaWRlT3B0aW9ucyhiKTtcblx0XHRjb25zdCBrZXlzID0gbmV3IFNldDxzdHJpbmc+KFsuLi5PYmplY3Qua2V5cyhwcmV2KSwgLi4uT2JqZWN0LmtleXMoY3VycildKTtcblx0XHRpZiAoa2V5cy5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VjdGlvbiA9IERPTS5hcHBlbmQodGhpcy5jb250ZW50LCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1zZWN0aW9uJykpO1xuXHRcdERPTS5hcHBlbmQoc2VjdGlvbiwgJCgnaDMuY2hhdC1kZWJ1Zy1jYWNoZS1zZWN0aW9uLWgnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUucmVxdWVzdE9wdGlvbnNIZWFkaW5nJywgXCJSZXF1ZXN0IE9wdGlvbnNcIikpKTtcblxuXHRcdGNvbnN0IHRhYmxlID0gRE9NLmFwcGVuZChzZWN0aW9uLCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1vcHRpb25zLXRhYmxlJykpO1xuXHRcdGNvbnN0IGhlYWQgPSBET00uYXBwZW5kKHRhYmxlLCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1vcHRpb25zLXJvdy5oZWFkJykpO1xuXHRcdERPTS5hcHBlbmQoaGVhZCwgJCgnLmNoYXQtZGVidWctY2FjaGUtb3B0aW9ucy1jZWxsLmtleScsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5vcHRpb25zS2V5JywgXCJPcHRpb25cIikpKTtcblx0XHRET00uYXBwZW5kKGhlYWQsICQoJy5jaGF0LWRlYnVnLWNhY2hlLW9wdGlvbnMtY2VsbCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5vcHRpb25zUHJldicsIFwiUHJldmlvdXNcIikpKTtcblx0XHRET00uYXBwZW5kKGhlYWQsICQoJy5jaGF0LWRlYnVnLWNhY2hlLW9wdGlvbnMtY2VsbCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5vcHRpb25zQ3VycicsIFwiQ3VycmVudFwiKSkpO1xuXG5cdFx0Y29uc3Qgc29ydGVkS2V5cyA9IFsuLi5rZXlzXS5zb3J0KCh4LCB5KSA9PiB4LmxvY2FsZUNvbXBhcmUoeSkpO1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIHNvcnRlZEtleXMpIHtcblx0XHRcdGNvbnN0IHJvdyA9IERPTS5hcHBlbmQodGFibGUsICQoJy5jaGF0LWRlYnVnLWNhY2hlLW9wdGlvbnMtcm93JykpO1xuXHRcdFx0Y29uc3QgYXYgPSBwcmV2W2tleV07XG5cdFx0XHRjb25zdCBidiA9IGN1cnJba2V5XTtcblx0XHRcdGNvbnN0IGNoYW5nZWQgPSAhZXF1YWxzKGF2LCBidik7XG5cdFx0XHRpZiAoY2hhbmdlZCkge1xuXHRcdFx0XHRyb3cuY2xhc3NMaXN0LmFkZCgnY2hhbmdlZCcpO1xuXHRcdFx0fVxuXHRcdFx0RE9NLmFwcGVuZChyb3csICQoJy5jaGF0LWRlYnVnLWNhY2hlLW9wdGlvbnMtY2VsbC5rZXknLCB1bmRlZmluZWQsIGtleSkpO1xuXHRcdFx0RE9NLmFwcGVuZChyb3csICQoJy5jaGF0LWRlYnVnLWNhY2hlLW9wdGlvbnMtY2VsbCcsIHVuZGVmaW5lZCwgZm9ybWF0T3B0aW9uVmFsdWUoYXYpKSk7XG5cdFx0XHRET00uYXBwZW5kKHJvdywgJCgnLmNoYXQtZGVidWctY2FjaGUtb3B0aW9ucy1jZWxsJywgdW5kZWZpbmVkLCBmb3JtYXRPcHRpb25WYWx1ZShidikpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNvbXBvbmVudHMoZHJpZnQ6IHJlYWRvbmx5IElDb21wb25lbnREcmlmdFtdLCBhOiBJU2lkZURhdGEsIGI6IElTaWRlRGF0YSwgY29tcGFyZUlucHV0TWVzc2FnZXM6IGJvb2xlYW4sIGlkZW50aWNhbENvdW50OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmNvbXBvbmVudEVsZW1lbnRzLmNsZWFyKCk7XG5cdFx0Y29uc3Qgc2VjdGlvbiA9IERPTS5hcHBlbmQodGhpcy5jb250ZW50LCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1zZWN0aW9uJykpO1xuXHRcdERPTS5hcHBlbmQoc2VjdGlvbiwgJCgnaDMuY2hhdC1kZWJ1Zy1jYWNoZS1zZWN0aW9uLWgnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuY29tcG9uZW50c0hlYWRpbmcnLCBcIkNvbXBvbmVudHNcIikpKTtcblx0XHRpZiAoIWNvbXBhcmVJbnB1dE1lc3NhZ2VzICYmIGIucmVxdWVzdFNoYXBlLmlzQ29udGludWF0aW9uKSB7XG5cdFx0XHRjb25zdCBub3RlID0gRE9NLmFwcGVuZChzZWN0aW9uLCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1zaWctc3VtbWFyeS5jaGF0LWRlYnVnLWNhY2hlLXJlcXVlc3Qtc2hhcGUtbm90ZScpKTtcblx0XHRcdG5vdGUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmNvbnRpbnVhdGlvbkNvbXBvbmVudHNOb3RlJywgXCJUaGlzIHJlcXVlc3QgdXNlcyBwcmV2aW91c19yZXNwb25zZV9pZCwgc28gaW5wdXQgbWVzc2FnZXMgYXJlIG5vdCBwb3NpdGlvbmFsbHkgZGlmZmVkIGFnYWluc3QgdGhlIHByZXZpb3VzIHJlcXVlc3QuIENvbXBvbmVudHMgYmVsb3cgc2hvdyBjYWNoZS1rZXkgc2hhcGUgY2hhbmdlczsgdGhlIGN1cnJlbnQgY29udGludWF0aW9uIGRlbHRhIGlzIHNob3duIHNlcGFyYXRlbHkuXCIpO1xuXHRcdH1cblx0XHRjb25zdCBhY2MgPSBET00uYXBwZW5kKHNlY3Rpb24sICQoJy5jaGF0LWRlYnVnLWNhY2hlLWFjYycpKTtcblxuXHRcdGNvbnN0IGVmZmVjdGl2ZURyaWZ0ID0gIWNvbXBhcmVJbnB1dE1lc3NhZ2VzICYmIGIucmVxdWVzdFNoYXBlLmlzQ29udGludWF0aW9uICYmIGIuaW5wdXRNZXNzYWdlcy5sZW5ndGggPiAwXG5cdFx0XHQ/IFsuLi5kcmlmdCwgY3VycmVudERlbHRhQ29tcG9uZW50KGIpXVxuXHRcdFx0OiBkcmlmdDtcblxuXHRcdGlmIChlZmZlY3RpdmVEcmlmdC5sZW5ndGggPT09IDApIHtcblx0XHRcdGNvbnN0IGVtcHR5ID0gRE9NLmFwcGVuZChhY2MsICQoJy5jaGF0LWRlYnVnLWNhY2hlLWFjYy1lbXB0eScpKTtcblx0XHRcdGVtcHR5LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5hbGxDb21wb25lbnRzSWRlbnRpY2FsJywgXCJBbGwgY29tcG9uZW50cyBhcmUgaWRlbnRpY2FsIGJldHdlZW4gQSBhbmQgQi5cIik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBjIG9mIGVmZmVjdGl2ZURyaWZ0KSB7XG5cdFx0XHRjb25zdCBpdGVtID0gRE9NLmFwcGVuZChhY2MsICQoJy5jaGF0LWRlYnVnLWNhY2hlLWFjYy1pdGVtJykpO1xuXHRcdFx0aXRlbS5jbGFzc0xpc3QuYWRkKGMuc3RhdHVzKTtcblx0XHRcdGNvbnN0IGlzT3BlbiA9IHRoaXMub3BlbkNvbXBvbmVudHMuaGFzKGMubmFtZSk7XG5cdFx0XHRpZiAoaXNPcGVuKSB7IGl0ZW0uY2xhc3NMaXN0LmFkZCgnb3BlbicpOyB9XG5cdFx0XHRjb25zdCBoZWFkID0gRE9NLmFwcGVuZChpdGVtLCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1hY2MtaGVhZCcpKTtcblx0XHRcdHRoaXMuY29tcG9uZW50RWxlbWVudHMuc2V0KGMubmFtZSwgeyBpdGVtLCBoZWFkIH0pO1xuXHRcdFx0Ly8gRXhwb3NlIHRoZSBoZWFkZXIgYXMgYW4gZXhwYW5kL2NvbGxhcHNlIGJ1dHRvbiBzbyBrZXlib2FyZCBhbmRcblx0XHRcdC8vIHNjcmVlbiByZWFkZXIgdXNlcnMgY2FuIG9wZXJhdGUgaXQgdGhlIHNhbWUgd2F5IG1vdXNlIHVzZXJzIGNhbi5cblx0XHRcdGhlYWQudGFiSW5kZXggPSAwO1xuXHRcdFx0aGVhZC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0XHRoZWFkLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsIGlzT3BlbiA/ICd0cnVlJyA6ICdmYWxzZScpO1xuXHRcdFx0RE9NLmFwcGVuZChoZWFkLCAkKCdzcGFuLmNoYXQtZGVidWctY2FjaGUtY2hldicpKTtcblx0XHRcdGNvbnN0IG5hbWUgPSBET00uYXBwZW5kKGhlYWQsICQoJy5jaGF0LWRlYnVnLWNhY2hlLWFjYy1uYW1lJykpO1xuXHRcdFx0Ly8gTGVhZCB3aXRoIHRoZSBzYW1lIHJvbGUgc3dhdGNoIHRoZSBzaWduYXR1cmUgYmFyIHVzZXMgc28gYVxuXHRcdFx0Ly8gY29tcG9uZW50IHJlYWRzIGFzIFwib25lIG9mIHRob3NlIGNvbG9yZWQgcGllY2VzXCIsIG5vdCBhblxuXHRcdFx0Ly8gYW5vbnltb3VzIGRpZmYgcm93LlxuXHRcdFx0Y29uc3Qgc3dhdGNoUm9sZSA9IGMucm9sZSA/PyAoYy5uYW1lID09PSAnc3lzdGVtJyB8fCBjLm5hbWUgPT09ICd0b29scycgPyBjLm5hbWUgOiB1bmRlZmluZWQpO1xuXHRcdFx0aWYgKHN3YXRjaFJvbGUpIHtcblx0XHRcdFx0RE9NLmFwcGVuZChuYW1lLCAkKGBzcGFuLmNoYXQtZGVidWctY2FjaGUtc2lnLXN3YXRjaC5yb2xlLSR7cm9sZUNsYXNzKHN3YXRjaFJvbGUpfWAsIHsgJ2FyaWEtaGlkZGVuJzogJ3RydWUnIH0pKTtcblx0XHRcdH1cblx0XHRcdGlmIChjLnJvbGUpIHsgRE9NLmFwcGVuZChuYW1lLCAkKCdzcGFuLnJvbGUnLCB1bmRlZmluZWQsIGMucm9sZSkpOyB9XG5cdFx0XHRET00uYXBwZW5kKG5hbWUsIERPTS4kKCdzcGFuJywgdW5kZWZpbmVkLCBjLm5hbWUpKTtcblx0XHRcdGNvbnN0IGJhZGdlID0gRE9NLmFwcGVuZChoZWFkLCAkKGBzcGFuLmNoYXQtZGVidWctY2FjaGUtYWNjLWJhZGdlLiR7Yy5zdGF0dXN9YCkpO1xuXHRcdFx0YmFkZ2UudGV4dENvbnRlbnQgPSBiYWRnZUxhYmVsKGMuc3RhdHVzKTtcblx0XHRcdGNvbnN0IHNpemVzID0gRE9NLmFwcGVuZChoZWFkLCAkKCdzcGFuLmNoYXQtZGVidWctY2FjaGUtYWNjLXNpemVzJykpO1xuXHRcdFx0c2l6ZXMudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmNvbXBvbmVudFNpemVzJywgXCJ7MH0gXHUyMTkyIHsxfSBjaGFyc1wiLCBmb3JtYXRUb2tlbnMoYy5hU2l6ZSksIGZvcm1hdFRva2VucyhjLmJTaXplKSk7XG5cblx0XHRcdGNvbnN0IGJvZHkgPSBET00uYXBwZW5kKGl0ZW0sICQoJy5jaGF0LWRlYnVnLWNhY2hlLWFjYy1ib2R5JykpO1xuXHRcdFx0Y29uc3QgYVRleHQgPSBjLm5hbWUgPT09IENVUlJFTlRfQ09OVElOVUFUSU9OX0RFTFRBX0NPTVBPTkVOVCA/ICcnIDogdGV4dEZvckNvbXBvbmVudChjLCBhKTtcblx0XHRcdGNvbnN0IGJUZXh0ID0gYy5uYW1lID09PSBDVVJSRU5UX0NPTlRJTlVBVElPTl9ERUxUQV9DT01QT05FTlQgPyBjb250aW51YXRpb25EZWx0YVRleHQoYikgOiB0ZXh0Rm9yQ29tcG9uZW50KGMsIGIpO1xuXHRcdFx0Ly8gU3VyZmFjZSBPVGVsLXNpZGUgdHJ1bmNhdGlvbjogd2hlbiBlaXRoZXIgc2lkZSBlbmRzIHdpdGggdGhlXG5cdFx0XHQvLyB0cnVuY2F0aW9uIG1hcmtlciBlbWl0dGVkIGJ5IGB0cnVuY2F0ZUZvck9UZWxgLCB0aGUgZGlmZiBiZWxvd1xuXHRcdFx0Ly8gd2lsbCBvbmx5IHJlZmxlY3QgdGhlIHN1cnZpdmluZyBwcmVmaXguIE1vc3QgbGlrZWx5IG9uIGB0b29sc2Bcblx0XHRcdC8vIChsYXJnZSBNQ1AgY2F0YWxvZ3MpIGFuZCB2ZXJ5IGxvbmcgbWVzc2FnZXMuXG5cdFx0XHRjb25zdCB0cnVuY2F0aW9uTm90ZSA9IGRlc2NyaWJlVHJ1bmNhdGlvbihhVGV4dCwgYlRleHQpO1xuXHRcdFx0aWYgKHRydW5jYXRpb25Ob3RlKSB7XG5cdFx0XHRcdGNvbnN0IG5vdGUgPSBET00uYXBwZW5kKGl0ZW0sICQoJy5jaGF0LWRlYnVnLWNhY2hlLWFjYy10cnVuY2F0ZWQnKSk7XG5cdFx0XHRcdG5vdGUudGV4dENvbnRlbnQgPSB0cnVuY2F0aW9uTm90ZTtcblx0XHRcdFx0bm90ZS50aXRsZSA9IHRydW5jYXRpb25Ob3RlO1xuXHRcdFx0XHRoZWFkLnRpdGxlID0gdHJ1bmNhdGlvbk5vdGU7XG5cdFx0XHR9XG5cdFx0XHQvLyBPbmUtbGluZSBzdHJ1Y3R1cmFsIHN1bW1hcnkgb2YgdGhlIGNoYW5nZSBcdTIwMTQgXCJmaXJzdCAxMzAgY2hhcnNcblx0XHRcdC8vIHJlbW92ZWRcIiwgXCJlZGl0ZWQgaW4gcGxhY2UgYXQgY2hhciBOXCIgXHUyMDE0IHNvIHRoZSByZWQvZ3JlZW4gZGlmZlxuXHRcdFx0Ly8gYmVsb3cgaGFzIGEgY29uY2x1c2lvbiB0byB2ZXJpZnkgcmF0aGVyIHRoYW4gYmVpbmcgdGhlIG9ubHlcblx0XHRcdC8vIHdheSB0byB1bmRlcnN0YW5kIHdoYXQgaGFwcGVuZWQuXG5cdFx0XHRpZiAoYVRleHQgJiYgYlRleHQgJiYgYVRleHQgIT09IGJUZXh0KSB7XG5cdFx0XHRcdGNvbnN0IGR2ID0gYW5hbHl6ZVN0cmluZ0RpdmVyZ2VuY2UoYVRleHQsIGJUZXh0KTtcblx0XHRcdFx0aWYgKGR2KSB7XG5cdFx0XHRcdFx0Y29uc3QgY2hhbmdlTm90ZSA9IERPTS5hcHBlbmQoYm9keSwgJCgnLmNoYXQtZGVidWctY2FjaGUtYWNjLWNoYW5nZS1ub3RlJykpO1xuXHRcdFx0XHRcdGNoYW5nZU5vdGUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmNoYW5nZU5vdGUnLCBcIldoYXQgY2hhbmdlZDogezB9XCIsIGRlc2NyaWJlU3RyaW5nRGl2ZXJnZW5jZShkdikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRib2R5LmFwcGVuZENoaWxkKHRoaXMucmVuZGVyQ29tcG9uZW50RGlmZihhVGV4dCwgYlRleHQsIGMuYVNpemUsIGMuYlNpemUpKTtcblxuXHRcdFx0Y29uc3QgdG9nZ2xlID0gKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5vcGVuQ29tcG9uZW50cy5oYXMoYy5uYW1lKSkge1xuXHRcdFx0XHRcdHRoaXMub3BlbkNvbXBvbmVudHMuZGVsZXRlKGMubmFtZSk7XG5cdFx0XHRcdFx0aXRlbS5jbGFzc0xpc3QucmVtb3ZlKCdvcGVuJyk7XG5cdFx0XHRcdFx0aGVhZC5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAnZmFsc2UnKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLm9wZW5Db21wb25lbnRzLmFkZChjLm5hbWUpO1xuXHRcdFx0XHRcdGl0ZW0uY2xhc3NMaXN0LmFkZCgnb3BlbicpO1xuXHRcdFx0XHRcdGhlYWQuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ3RydWUnKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGhlYWQsIERPTS5FdmVudFR5cGUuQ0xJQ0ssIHRvZ2dsZSkpO1xuXHRcdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoaGVhZCwgRE9NLkV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0dG9nZ2xlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBUaGUgYWNjb3JkaW9uIG9ubHkgbGlzdHMgZHJpZnRpbmcgY29tcG9uZW50czsgc2F5IGhvdyBtdWNoIG9mIHRoZVxuXHRcdC8vIHByb21wdCB3YXMgaWRlbnRpY2FsIHNvIFwiMiBlbnRyaWVzXCIgaXNuJ3QgbWlzcmVhZCBhcyBcInRoZSByZXF1ZXN0XG5cdFx0Ly8gb25seSBoYWQgMiBtZXNzYWdlc1wiLlxuXHRcdGlmIChjb21wYXJlSW5wdXRNZXNzYWdlcyAmJiBpZGVudGljYWxDb3VudCA+IDApIHtcblx0XHRcdGNvbnN0IG5vdGUgPSBET00uYXBwZW5kKHNlY3Rpb24sICQoJy5jaGF0LWRlYnVnLWNhY2hlLWFjYy1pZGVudGljYWwtbm90ZScpKTtcblx0XHRcdG5vdGUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmlkZW50aWNhbE5vdGUnLCBcInswfSBpZGVudGljYWwgbWVzc2FnZShzKSBub3Qgc2hvd24gXHUyMDE0IHRoZXkgZXh0ZW5kIHRoZSBzaGFyZWQsIGNhY2hlLXNlcnZhYmxlIHByZWZpeC5cIiwgaWRlbnRpY2FsQ291bnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQ29tcG9uZW50RGlmZihhVGV4dDogc3RyaW5nLCBiVGV4dDogc3RyaW5nLCBhU2l6ZTogbnVtYmVyLCBiU2l6ZTogbnVtYmVyKTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IGdyaWQgPSAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1kaWZmJyk7XG5cdFx0Y29uc3QgY29sQSA9IERPTS5hcHBlbmQoZ3JpZCwgJCgnLmNoYXQtZGVidWctY2FjaGUtZGlmZi1jb2wnKSk7XG5cdFx0RE9NLmFwcGVuZChjb2xBLCAkKCdoNCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5kaWZmU2lkZUEnLCBcIlByZXZpb3VzIFxcdTAwYjcgezB9IGNoYXJzXCIsIG51bWJlckZvcm1hdHRlci52YWx1ZS5mb3JtYXQoYVNpemUpKSkpO1xuXHRcdGNvbnN0IGFCb2R5ID0gRE9NLmFwcGVuZChjb2xBLCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1kaWZmLWJvZHknKSk7XG5cblx0XHRjb25zdCBjb2xCID0gRE9NLmFwcGVuZChncmlkLCAkKCcuY2hhdC1kZWJ1Zy1jYWNoZS1kaWZmLWNvbCcpKTtcblx0XHRET00uYXBwZW5kKGNvbEIsICQoJ2g0JywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmRpZmZTaWRlQicsIFwiQ3VycmVudCBcXHUwMGI3IHswfSBjaGFyc1wiLCBudW1iZXJGb3JtYXR0ZXIudmFsdWUuZm9ybWF0KGJTaXplKSkpKTtcblx0XHRjb25zdCBiQm9keSA9IERPTS5hcHBlbmQoY29sQiwgJCgnLmNoYXQtZGVidWctY2FjaGUtZGlmZi1ib2R5JykpO1xuXG5cdFx0aWYgKCFhVGV4dCAmJiAhYlRleHQpIHtcblx0XHRcdGFCb2R5LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5ub3RQcmVzZW50JywgXCIobm90IHByZXNlbnQpXCIpO1xuXHRcdFx0YkJvZHkudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLm5vdFByZXNlbnQnLCBcIihub3QgcHJlc2VudClcIik7XG5cdFx0XHRyZXR1cm4gZ3JpZDtcblx0XHR9XG5cblx0XHRyZW5kZXJJbmxpbmVEaWZmKGFCb2R5LCBiQm9keSwgYVRleHQsIGJUZXh0KTtcblx0XHRyZXR1cm4gZ3JpZDtcblx0fVxufVxuXG5mdW5jdGlvbiBmaW5kU2VjdGlvbihzZWN0aW9uczogcmVhZG9ubHkgSUNoYXREZWJ1Z01lc3NhZ2VTZWN0aW9uW10gfCB1bmRlZmluZWQsIG5hbWU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICghc2VjdGlvbnMpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGZvciAoY29uc3QgcyBvZiBzZWN0aW9ucykge1xuXHRcdGlmIChzLm5hbWUgPT09IG5hbWUpIHtcblx0XHRcdHJldHVybiBzLmNvbnRlbnQ7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKiBBIHByb21wdC1zaWduYXR1cmUgc2VnbWVudDogYSBzeW50aGV0aWMgcHJlZml4IChzeXN0ZW0vdG9vbHMpIG9yIGFuIGlucHV0IG1lc3NhZ2UuICovXG5leHBvcnQgaW50ZXJmYWNlIElTaWduYXR1cmVTZWdtZW50IHtcblx0cmVhZG9ubHkgcm9sZTogc3RyaW5nO1xuXHRyZWFkb25seSBjaGFyczogbnVtYmVyO1xuXHRyZWFkb25seSBkcmlmdDogYm9vbGVhbjtcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0LyoqIFRydWUgZm9yIHRoZSBzeW50aGV0aWMgc3lzdGVtL3Rvb2xzIHByZWZpeCBzZWdtZW50cywgZmFsc2UgZm9yIGlucHV0IG1lc3NhZ2VzLiAqL1xuXHRyZWFkb25seSBzeW50aGV0aWM6IGJvb2xlYW47XG59XG5cbi8qKiBPbmUgYWxpZ25lZCByb3cgb2YgdGhlIGNodW5rIGJyZWFrZG93biBcdTIwMTQgYSBjaHVuayBwcmVzZW50IG9uIGVpdGhlciBvciBib3RoIHNpZGVzLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ2h1bmtCcmVha2Rvd25Sb3cge1xuXHRyZWFkb25seSByb2xlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFDaGFyczogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBiQ2hhcnM6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZHJpZnQ6IGJvb2xlYW47XG59XG5cbi8qKlxuICogQWxpZ24gdGhlIHByZXZpb3VzIChBKSBhbmQgY3VycmVudCAoQikgc2lnbmF0dXJlIHNlZ21lbnRzIGludG8gY29tcGFyYWJsZVxuICogcm93cyBmb3IgdGhlIGNodW5rIGJyZWFrZG93biB0YWJsZS5cbiAqXG4gKiBTeW50aGV0aWMgcHJlZml4IHNlZ21lbnRzIChzeXN0ZW0sIHRvb2xzKSBhcmUgbWF0Y2hlZCBieSBpZGVudGl0eSBzbyB0aGF0IGFcbiAqIHRvb2wgY2F0YWxvZyBvciBzeXN0ZW0gcHJvbXB0IHByZXNlbnQgb24gb25seSBvbmUgc2lkZSBkb2VzIG5vdCBzaGlmdCBldmVyeVxuICogbGF0ZXIgbWVzc2FnZSByb3cuIElucHV0IG1lc3NhZ2VzIGFyZSBtYXRjaGVkIHBvc2l0aW9uYWxseSwgY29uc2lzdGVudCB3aXRoXG4gKiB0aGUgcG9zaXRpb25hbCBwcm9tcHQtc2lnbmF0dXJlIGRpZmYgdXNlZCBlbHNld2hlcmUgaW4gdGhpcyB2aWV3LlxuICovXG5leHBvcnQgZnVuY3Rpb24gYWxpZ25TaWduYXR1cmVDaHVua3MoYVNlZ3M6IHJlYWRvbmx5IElTaWduYXR1cmVTZWdtZW50W10sIGJTZWdzOiByZWFkb25seSBJU2lnbmF0dXJlU2VnbWVudFtdKTogSUNodW5rQnJlYWtkb3duUm93W10ge1xuXHRjb25zdCByb3dzOiBJQ2h1bmtCcmVha2Rvd25Sb3dbXSA9IFtdO1xuXHRjb25zdCB0b1JvdyA9IChhUzogSVNpZ25hdHVyZVNlZ21lbnQgfCB1bmRlZmluZWQsIGJTOiBJU2lnbmF0dXJlU2VnbWVudCB8IHVuZGVmaW5lZCk6IElDaHVua0JyZWFrZG93blJvdyA9PiB7XG5cdFx0Y29uc3QgcmVmID0gYlMgPz8gYVMhO1xuXHRcdHJldHVybiB7XG5cdFx0XHRyb2xlOiByZWYucm9sZSxcblx0XHRcdGxhYmVsOiByZWYubGFiZWwsXG5cdFx0XHRhQ2hhcnM6IGFTPy5jaGFycyxcblx0XHRcdGJDaGFyczogYlM/LmNoYXJzLFxuXHRcdFx0Ly8gQSByb3cgZHJpZnRzIGlmIGVpdGhlciBzaWRlIGZsYWdzIGRyaWZ0IChlLmcuIE9ubHlJbkEgbWFya3Mgb25seVxuXHRcdFx0Ly8gdGhlIEEgc2VnbWVudCkgb3IgdGhlIGNodW5rIGlzIHByZXNlbnQgb24ganVzdCBvbmUgc2lkZS5cblx0XHRcdGRyaWZ0OiAoYVM/LmRyaWZ0ID8/IGZhbHNlKSB8fCAoYlM/LmRyaWZ0ID8/IGZhbHNlKSB8fCAoISFhUyAhPT0gISFiUyksXG5cdFx0fTtcblx0fTtcblxuXHQvLyBTeW50aGV0aWMgcHJlZml4ZXMgZmlyc3QsIG1hdGNoZWQgYnkgcm9sZSBzbyBwcmVzZW5jZSBhc3ltbWV0cnkgaXMgc2hvd25cblx0Ly8gYXMgYW4gYWRkZWQvcmVtb3ZlZCByb3cgcmF0aGVyIHRoYW4ga25vY2tpbmcgdGhlIG1lc3NhZ2Ugcm93cyBvdXQgb2Ygc3luYy5cblx0Zm9yIChjb25zdCByb2xlIG9mIFsnc3lzdGVtJywgJ3Rvb2xzJ10pIHtcblx0XHRjb25zdCBhUyA9IGFTZWdzLmZpbmQocyA9PiBzLnN5bnRoZXRpYyAmJiBzLnJvbGUgPT09IHJvbGUpO1xuXHRcdGNvbnN0IGJTID0gYlNlZ3MuZmluZChzID0+IHMuc3ludGhldGljICYmIHMucm9sZSA9PT0gcm9sZSk7XG5cdFx0aWYgKGFTIHx8IGJTKSB7XG5cdFx0XHRyb3dzLnB1c2godG9Sb3coYVMsIGJTKSk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgYU1zZ3MgPSBhU2Vncy5maWx0ZXIocyA9PiAhcy5zeW50aGV0aWMpO1xuXHRjb25zdCBiTXNncyA9IGJTZWdzLmZpbHRlcihzID0+ICFzLnN5bnRoZXRpYyk7XG5cdGNvbnN0IGNvdW50ID0gTWF0aC5tYXgoYU1zZ3MubGVuZ3RoLCBiTXNncy5sZW5ndGgpO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcblx0XHRyb3dzLnB1c2godG9Sb3coYU1zZ3NbaV0sIGJNc2dzW2ldKSk7XG5cdH1cblx0cmV0dXJuIHJvd3M7XG59XG5cbi8qKlxuICogVGhlIGFnZW50IGEgbW9kZWwgdHVybiBiZWxvbmdzIHRvLiBgcmVxdWVzdE5hbWVgIGNhcnJpZXMgdGhlIGRlYnVnL2FnZW50XG4gKiBuYW1lIHRoZSBwcm9kdWNlciB0YWdnZWQgdGhlIHJlcXVlc3Qgd2l0aCAoZS5nLiBgcGFuZWwvZWRpdEFnZW50YCxcbiAqIGBiYWNrZ3JvdW5kVG9kb0FnZW50YCwgb3IgYSB1dGlsaXR5IG5hbWUgc3VjaCBhcyBgdGl0bGVgKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFnZW50S2V5KHR1cm46IElDaGF0RGVidWdNb2RlbFR1cm5FdmVudCk6IHN0cmluZyB7XG5cdHJldHVybiB0dXJuLnJlcXVlc3ROYW1lPy50cmltKCkgfHwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS51bm5hbWVkQWdlbnQnLCBcIih1bm5hbWVkKVwiKTtcbn1cblxuLyoqIENvdW50IG1vZGVsIHR1cm5zIHBlciBhZ2VudCwgcHJlc2VydmluZyBmaXJzdC1zZWVuIG9yZGVyLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXB1dGVBZ2VudENvdW50cyh0dXJuczogcmVhZG9ubHkgSUNoYXREZWJ1Z01vZGVsVHVybkV2ZW50W10pOiBNYXA8c3RyaW5nLCBudW1iZXI+IHtcblx0Y29uc3QgY291bnRzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0Zm9yIChjb25zdCB0dXJuIG9mIHR1cm5zKSB7XG5cdFx0Y29uc3Qga2V5ID0gYWdlbnRLZXkodHVybik7XG5cdFx0Y291bnRzLnNldChrZXksIChjb3VudHMuZ2V0KGtleSkgPz8gMCkgKyAxKTtcblx0fVxuXHRyZXR1cm4gY291bnRzO1xufVxuXG4vKipcbiAqIERlZmF1bHQgYWdlbnQgc2VsZWN0aW9uOiBmb2N1cyBvbiB0aGUgbWFpbiBwYW5lbCBlZGl0IGFnZW50IHdoZW4gcHJlc2VudCBzb1xuICogYmFja2dyb3VuZCBhbmQgdXRpbGl0eSBjYWxscyBkb24ndCBjbHV0dGVyIHRoZSByYWlsLiBGYWxscyBiYWNrIHRvIGFsbCBhZ2VudHNcbiAqIHdoZW4gdGhlIGVkaXQgYWdlbnQgaXNuJ3QgcGFydCBvZiB0aGUgc2Vzc2lvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRlZmF1bHRBZ2VudFNlbGVjdGlvbihhZ2VudENvdW50czogTWFwPHN0cmluZywgbnVtYmVyPik6IFNldDxzdHJpbmc+IHtcblx0aWYgKGFnZW50Q291bnRzLmhhcyhERUZBVUxUX0FHRU5UX0tFWSkpIHtcblx0XHRyZXR1cm4gbmV3IFNldChbREVGQVVMVF9BR0VOVF9LRVldKTtcblx0fVxuXHRyZXR1cm4gbmV3IFNldChhZ2VudENvdW50cy5rZXlzKCkpO1xufVxuXG4vKipcbiAqIFdoZXRoZXIgdHdvIG1vZGVsLXR1cm4gZXZlbnRzIHJlZmVyIHRvIHRoZSAqZXhhY3Qgc2FtZSogdHVybi4gVGhpcyBpcyB0aGVcbiAqIHByZWNpc2UgaWRlbnRpdHkgdGVzdDogdGhlIHNhbWUgb2JqZWN0IHJlZmVyZW5jZSwgb3IgdGhlIHNhbWUgc3RhYmxlIHNwYW5cbiAqIGBpZGAgd2hlbiBib3RoIGV2ZW50cyBjYXJyeSBvbmUuIEl0IG5ldmVyIHJlcG9ydHMgdHdvIGRpc3RpbmN0IHR1cm5zIGFzIGVxdWFsLFxuICogc28gaXQgaXMgc2FmZSB0byBzY2FuIGEgbGlzdCB3aXRoIGl0IGV2ZW4gd2hlbiBzZXZlcmFsIHR1cm5zIGxvb2sgYWxpa2UuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc1NhbWVNb2RlbFR1cm4oYTogSUNoYXREZWJ1Z01vZGVsVHVybkV2ZW50LCBiOiBJQ2hhdERlYnVnTW9kZWxUdXJuRXZlbnQpOiBib29sZWFuIHtcblx0aWYgKGEgPT09IGIpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHQvLyBEaXN0aW5jdCBvYmplY3RzOiBvbmx5IGEgc3RhYmxlIHNwYW4gaWQgY2FuIHByb3ZlIHRoZXkgYXJlIHRoZSBzYW1lIHR1cm4uXG5cdHJldHVybiBhLmlkICE9PSB1bmRlZmluZWQgJiYgYi5pZCAhPT0gdW5kZWZpbmVkICYmIGEuaWQgPT09IGIuaWQ7XG59XG5cbi8qKlxuICogQmVzdC1lZmZvcnQgaWRlbnRpdHkgZm9yIGEgdHVybiB0aGF0IGNhcnJpZXMgbm8gYGlkYCwgdXNlZCBvbmx5IHdoZW4gdGhlXG4gKiBleGFjdCBvYmplY3QgY2FuIG5vIGxvbmdlciBiZSBmb3VuZCAoZS5nLiBldmVudHMgd2VyZSByZS1mZXRjaGVkIGFzIGZyZXNoXG4gKiBpbnN0YW5jZXMpLiBCb3RoIHNpZGVzIG11c3QgbGFjayBhbiBgaWRgOyBhIHR1cm4gd2l0aCBhbiBpZCBpcyBtYXRjaGVkXG4gKiBwcmVjaXNlbHkgYnkge0BsaW5rIGlzU2FtZU1vZGVsVHVybn0gaW5zdGVhZC4gVGhpcyBjYW4gbWF0Y2ggdHdvIGRpc3RpbmN0XG4gKiB0dXJucyB0aGF0IGhhcHBlbiB0byBzaGFyZSBldmVyeSBmaWVsZCwgc28gaXQgaXMgb25seSBjb25zdWx0ZWQgYXMgYVxuICogZmFsbGJhY2sgYWZ0ZXIgdGhlIHByZWNpc2UgcGFzcyBmYWlscy5cbiAqL1xuZnVuY3Rpb24gaXNTaW1pbGFyTm9JZE1vZGVsVHVybihhOiBJQ2hhdERlYnVnTW9kZWxUdXJuRXZlbnQsIGI6IElDaGF0RGVidWdNb2RlbFR1cm5FdmVudCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gYS5pZCA9PT0gdW5kZWZpbmVkICYmIGIuaWQgPT09IHVuZGVmaW5lZFxuXHRcdCYmIGEuY3JlYXRlZC5nZXRUaW1lKCkgPT09IGIuY3JlYXRlZC5nZXRUaW1lKClcblx0XHQmJiBhLnBhcmVudEV2ZW50SWQgPT09IGIucGFyZW50RXZlbnRJZFxuXHRcdCYmIGEucmVxdWVzdE5hbWUgPT09IGIucmVxdWVzdE5hbWVcblx0XHQmJiBhLm1vZGVsID09PSBiLm1vZGVsO1xufVxuXG4vKipcbiAqIFJlc29sdmUgd2hpY2ggdHVybiBpbmRleCB0byBzZWxlY3QgYWZ0ZXIgdGhlIGFnZW50IGZpbHRlciBjaGFuZ2VzLiBQcmVmZXJzXG4gKiB0aGUgcHJldmlvdXNseS1zZWxlY3RlZCB0dXJuOyB3aGVuIHRoYXQgdHVybiBubyBsb25nZXIgc3Vydml2ZXMgdGhlIGZpbHRlciBcdTIwMTRcbiAqIG9yIHRoZXJlIHdhcyBubyBwcmlvciBzZWxlY3Rpb24gXHUyMDE0IGZhbGxzIGJhY2sgdG8gdGhlIG1vc3QgcmVjZW50IHR1cm4gc28gdGhlXG4gKiBzZWxlY3Rpb24gbmV2ZXIgbGFuZHMgb24gYW4gdW5yZWxhdGVkIHR1cm4gdGhhdCBoYXBwZW5zIHRvIG9jY3VweSB0aGUgb2xkXG4gKiBvcmRpbmFsIHBvc2l0aW9uLiBSZXR1cm5zIC0xIHdoZW4gdGhlcmUgYXJlIG5vIHR1cm5zIHRvIHNlbGVjdC5cbiAqXG4gKiBNYXRjaGluZyBydW5zIGluIHR3byBwYXNzZXMgc28gdGhlIGV4YWN0IHR1cm4gYWx3YXlzIHdpbnM6IGZpcnN0IHRoZSBwcmVjaXNlXG4gKiBpZC9yZWZlcmVuY2UgaWRlbnRpdHkgKHtAbGluayBpc1NhbWVNb2RlbFR1cm59KSwgdGhlbiBhIGJlc3QtZWZmb3J0IGNvbXBvc2l0ZVxuICogbWF0Y2ggZm9yIGlkLWxlc3MgdHVybnMgKHtAbGluayBpc1NpbWlsYXJOb0lkTW9kZWxUdXJufSkuIFdpdGhvdXQgdGhlIHNwbGl0LFxuICogYW4gZWFybGllciBsb29rLWFsaWtlIHR1cm4gY291bGQgYmUgcGlja2VkIGJ5IGBmaW5kSW5kZXhgIGJlZm9yZSB0aGUgcmVhbFxuICogb2JqZWN0IGlzIHJlYWNoZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlRmlsdGVyZWRTZWxlY3Rpb25JbmRleCh0dXJuczogcmVhZG9ubHkgSUNoYXREZWJ1Z01vZGVsVHVybkV2ZW50W10sIHByZXZpb3VzOiBJQ2hhdERlYnVnTW9kZWxUdXJuRXZlbnQgfCB1bmRlZmluZWQpOiBudW1iZXIge1xuXHRpZiAocHJldmlvdXMpIHtcblx0XHRjb25zdCBleGFjdCA9IHR1cm5zLmZpbmRJbmRleCh0ID0+IGlzU2FtZU1vZGVsVHVybih0LCBwcmV2aW91cykpO1xuXHRcdGlmIChleGFjdCA+PSAwKSB7XG5cdFx0XHRyZXR1cm4gZXhhY3Q7XG5cdFx0fVxuXHRcdGNvbnN0IHNpbWlsYXIgPSB0dXJucy5maW5kSW5kZXgodCA9PiBpc1NpbWlsYXJOb0lkTW9kZWxUdXJuKHQsIHByZXZpb3VzKSk7XG5cdFx0aWYgKHNpbWlsYXIgPj0gMCkge1xuXHRcdFx0cmV0dXJuIHNpbWlsYXI7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB0dXJucy5sZW5ndGggLSAxO1xufVxuXG4vKipcbiAqIEdyb3VwIG1vZGVsIHR1cm5zIGJ5IHJlcXVlc3QgXHUyMDE0IHR1cm5zIHRoYXQgc2hhcmUgdGhlIHNhbWUgYHBhcmVudEV2ZW50SWRgXG4gKiBiZWxvbmcgdG8gdGhlIHNhbWUgYWdlbnQgaW52b2NhdGlvbiAob25lIHVzZXIgcHJvbXB0KS4gVGhlIGdyb3VwIGtleSBpc1xuICogdXNlZCBhcyB0aGUgcmVxdWVzdCBpZCBzdXJmYWNlZCBpbiB0aGUgcmFpbCBoZWFkZXIuXG4gKi9cbmZ1bmN0aW9uIGJ1aWxkVHVybkdyb3Vwcyh0dXJuczogcmVhZG9ubHkgSUNoYXREZWJ1Z01vZGVsVHVybkV2ZW50W10sIHVzZXJNZXNzYWdlczogcmVhZG9ubHkgSUNoYXREZWJ1Z1VzZXJNZXNzYWdlRXZlbnRbXSk6IHJlYWRvbmx5IElUdXJuR3JvdXBbXSB7XG5cdC8vIEluZGV4IHVzZXIgbWVzc2FnZXMgYnkgdGhlaXIgc3BhbiBpZCAoYW5kIHRoZSBsaXZlIGB1c2VyLW1zZy1gIHByZWZpeGVkIHZhcmlhbnQpLlxuXHRjb25zdCB1c2VyQnlJZCA9IG5ldyBNYXA8c3RyaW5nLCBJQ2hhdERlYnVnVXNlck1lc3NhZ2VFdmVudD4oKTtcblx0Zm9yIChjb25zdCB1bSBvZiB1c2VyTWVzc2FnZXMpIHtcblx0XHRpZiAoIXVtLmlkKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0dXNlckJ5SWQuc2V0KHVtLmlkLCB1bSk7XG5cdFx0Y29uc3Qgc3RyaXBwZWQgPSB1bS5pZC5zdGFydHNXaXRoKCd1c2VyLW1zZy0nKSA/IHVtLmlkLnNsaWNlKCd1c2VyLW1zZy0nLmxlbmd0aCkgOiB1bS5pZDtcblx0XHR1c2VyQnlJZC5zZXQoc3RyaXBwZWQsIHVtKTtcblx0fVxuXG5cdGNvbnN0IGdyb3VwcyA9IG5ldyBNYXA8c3RyaW5nLCB7IHVzZXJNZXNzYWdlOiBJQ2hhdERlYnVnVXNlck1lc3NhZ2VFdmVudCB8IHVuZGVmaW5lZDsgdHVybnM6IHsgdHVybjogSUNoYXREZWJ1Z01vZGVsVHVybkV2ZW50OyBpbmRleDogbnVtYmVyIH1bXSB9PigpO1xuXHRjb25zdCBvcmRlcjogc3RyaW5nW10gPSBbXTtcblx0dHVybnMuZm9yRWFjaCgodHVybiwgaW5kZXgpID0+IHtcblx0XHRjb25zdCBrZXkgPSB0dXJuLnBhcmVudEV2ZW50SWQgPz8gdHVybi5pZCA/PyBgdHVybi0ke2luZGV4fWA7XG5cdFx0bGV0IGVudHJ5ID0gZ3JvdXBzLmdldChrZXkpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdGVudHJ5ID0geyB1c2VyTWVzc2FnZTogdXNlckJ5SWQuZ2V0KGtleSkgPz8gdXNlckJ5SWQuZ2V0KGB1c2VyLW1zZy0ke2tleX1gKSwgdHVybnM6IFtdIH07XG5cdFx0XHRncm91cHMuc2V0KGtleSwgZW50cnkpO1xuXHRcdFx0b3JkZXIucHVzaChrZXkpO1xuXHRcdH1cblx0XHRlbnRyeS50dXJucy5wdXNoKHsgdHVybiwgaW5kZXggfSk7XG5cdH0pO1xuXHRyZXR1cm4gb3JkZXIubWFwKGtleSA9PiAoeyBrZXksIHVzZXJNZXNzYWdlOiBncm91cHMuZ2V0KGtleSkhLnVzZXJNZXNzYWdlLCB0dXJuczogZ3JvdXBzLmdldChrZXkpIS50dXJucyB9KSk7XG59XG5cbmZ1bmN0aW9uIHRleHRGb3JDb21wb25lbnQoYzogSUNvbXBvbmVudERyaWZ0LCBzaWRlOiBJU2lkZURhdGEpOiBzdHJpbmcge1xuXHRpZiAoYy5uYW1lID09PSAnc3lzdGVtJykge1xuXHRcdHJldHVybiBzaWRlLnN5c3RlbSA/PyAnJztcblx0fVxuXHRpZiAoYy5uYW1lID09PSAndG9vbHMnKSB7XG5cdFx0cmV0dXJuIHNpZGUudG9vbHMgPz8gJyc7XG5cdH1cblx0aWYgKGMubmFtZSA9PT0gQ1VSUkVOVF9DT05USU5VQVRJT05fREVMVEFfQ09NUE9ORU5UKSB7XG5cdFx0cmV0dXJuIGNvbnRpbnVhdGlvbkRlbHRhVGV4dChzaWRlKTtcblx0fVxuXHRjb25zdCBtID0gL15tZXNzYWdlc1xcWyhcXGQrKVxcXSQvLmV4ZWMoYy5uYW1lKTtcblx0aWYgKG0pIHtcblx0XHRjb25zdCBpZHggPSBwYXJzZUludChtWzFdLCAxMCk7XG5cdFx0cmV0dXJuIHNpZGUuaW5wdXRNZXNzYWdlc1tpZHhdPy50ZXh0ID8/ICcnO1xuXHR9XG5cdHJldHVybiAnJztcbn1cblxuZnVuY3Rpb24gY29udGludWF0aW9uRGVsdGFUZXh0KHNpZGU6IElTaWRlRGF0YSk6IHN0cmluZyB7XG5cdHJldHVybiBzaWRlLnJlcXVlc3RTaGFwZS5pc0NvbnRpbnVhdGlvblxuXHRcdD8gc2lkZS5pbnB1dE1lc3NhZ2VzLm1hcCgobSwgaW5kZXgpID0+IGBpbnB1dFske2luZGV4fV0gJHttLnJvbGV9XFxuJHttLnRleHR9YCkuam9pbignXFxuXFxuJylcblx0XHQ6ICcnO1xufVxuXG5mdW5jdGlvbiBjdXJyZW50RGVsdGFDb21wb25lbnQoc2lkZTogSVNpZGVEYXRhKTogSUNvbXBvbmVudERyaWZ0IHtcblx0Y29uc3Qgc2l6ZSA9IHNpZGUuaW5wdXRNZXNzYWdlcy5yZWR1Y2UoKHN1bSwgbSkgPT4gc3VtICsgbS5jaGFyTGVuZ3RoLCAwKTtcblx0cmV0dXJuIHtcblx0XHRuYW1lOiBDVVJSRU5UX0NPTlRJTlVBVElPTl9ERUxUQV9DT01QT05FTlQsXG5cdFx0cm9sZTogc2lkZS5yZXF1ZXN0U2hhcGUuaW5wdXRJdGVtVHlwZXMuam9pbignLCAnKSB8fCBzaWRlLmlucHV0TWVzc2FnZXMubWFwKG0gPT4gbS5yb2xlKS5qb2luKCcsICcpIHx8IHVuZGVmaW5lZCxcblx0XHRzdGF0dXM6IENhY2hlRGlmZktpbmQuT25seUluQixcblx0XHRhU2l6ZTogMCxcblx0XHRiU2l6ZTogc2l6ZSxcblx0fTtcbn1cblxuLyoqIENvZGljb24gbmFtZSBmb3IgYSBicmVhay1jYXVzZSBjYXRlZ29yeSAocmFpbCBjaGlwcywgaGVhbHRoIGNhcmQpLiAqL1xuZnVuY3Rpb24gY2F0ZWdvcnlJY29uKGNhdGVnb3J5OiBDYWNoZUJyZWFrQ2F0ZWdvcnkpOiBzdHJpbmcge1xuXHRzd2l0Y2ggKGNhdGVnb3J5KSB7XG5cdFx0Y2FzZSBDYWNoZUJyZWFrQ2F0ZWdvcnkuSGVhbHRoeTogcmV0dXJuICdjaGVjayc7XG5cdFx0Y2FzZSBDYWNoZUJyZWFrQ2F0ZWdvcnkuRXhwaXJhdGlvbjogcmV0dXJuICdjbG9jayc7XG5cdFx0Y2FzZSBDYWNoZUJyZWFrQ2F0ZWdvcnkuTW9kZWw6IHJldHVybiAnaHVib3QnO1xuXHRcdGNhc2UgQ2FjaGVCcmVha0NhdGVnb3J5LlRvb2xzOiByZXR1cm4gJ3Rvb2xzJztcblx0XHRjYXNlIENhY2hlQnJlYWtDYXRlZ29yeS5TeXN0ZW06IHJldHVybiAnZ2Vhcic7XG5cdFx0Y2FzZSBDYWNoZUJyZWFrQ2F0ZWdvcnkuT3B0aW9uczogcmV0dXJuICdzeW1ib2wtcGFyYW1ldGVyJztcblx0XHRjYXNlIENhY2hlQnJlYWtDYXRlZ29yeS5IaXN0b3J5OiByZXR1cm4gJ2hpc3RvcnknO1xuXHRcdGNhc2UgQ2FjaGVCcmVha0NhdGVnb3J5LlVua25vd246IHJldHVybiAncXVlc3Rpb24nO1xuXHR9XG59XG5cbi8qKiBDb2RpY29uIG5hbWUgZm9yIGEgZmluZGluZyBzZXZlcml0eS4gKi9cbmZ1bmN0aW9uIGZpbmRpbmdJY29uKHNldmVyaXR5OiBDYWNoZUluc2lnaHRTZXZlcml0eSk6IHN0cmluZyB7XG5cdHN3aXRjaCAoc2V2ZXJpdHkpIHtcblx0XHRjYXNlIENhY2hlSW5zaWdodFNldmVyaXR5Lk9rOiByZXR1cm4gJ2NoZWNrJztcblx0XHRjYXNlIENhY2hlSW5zaWdodFNldmVyaXR5LkluZm86IHJldHVybiAnaW5mbyc7XG5cdFx0Y2FzZSBDYWNoZUluc2lnaHRTZXZlcml0eS5XYXJuaW5nOiByZXR1cm4gJ3dhcm5pbmcnO1xuXHRcdGNhc2UgQ2FjaGVJbnNpZ2h0U2V2ZXJpdHkuQ3JpdGljYWw6IHJldHVybiAnZXJyb3InO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGJhZGdlTGFiZWwoc3RhdHVzOiBDYWNoZURpZmZLaW5kKTogc3RyaW5nIHtcblx0c3dpdGNoIChzdGF0dXMpIHtcblx0XHRjYXNlIENhY2hlRGlmZktpbmQuSWRlbnRpY2FsOiByZXR1cm4gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5iYWRnZS5pZGVudGljYWwnLCBcImlkZW50aWNhbFwiKTtcblx0XHRjYXNlIENhY2hlRGlmZktpbmQuQ29udGVudERyaWZ0OiByZXR1cm4gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5iYWRnZS5jb250ZW50RHJpZnQnLCBcImNvbnRlbnQgZHJpZnRcIik7XG5cdFx0Y2FzZSBDYWNoZURpZmZLaW5kLkxlbmd0aENoYW5nZTogcmV0dXJuIGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUuYmFkZ2UubGVuZ3RoQ2hhbmdlJywgXCJsZW5ndGggY2hhbmdlXCIpO1xuXHRcdGNhc2UgQ2FjaGVEaWZmS2luZC5Pbmx5SW5BOiByZXR1cm4gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5iYWRnZS5vbmx5QScsIFwib25seSBpbiBBXCIpO1xuXHRcdGNhc2UgQ2FjaGVEaWZmS2luZC5Pbmx5SW5COiByZXR1cm4gbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5iYWRnZS5vbmx5QicsIFwib25seSBpbiBCXCIpO1xuXHR9XG59XG5cbi8qKlxuICogRGV0ZWN0IHRoZSBPVGVsIHRydW5jYXRpb24gbWFya2VyIHRoYXQgYHRydW5jYXRlRm9yT1RlbGAgYXBwZW5kcyB0byBsYXJnZVxuICogYXR0cmlidXRlIHZhbHVlczogYC4uLlt0cnVuY2F0ZWQsIG9yaWdpbmFsIE4gY2hhcnNdYC4gV2hlbiBlaXRoZXIgc2lkZSBvZlxuICogYSBjb21wb25lbnQgY2FycmllcyBpdCwgdGhlIGRpZmYgYmVsb3cgb25seSByZWZsZWN0cyB0aGUgc3Vydml2aW5nXG4gKiBwcmVmaXggXFx1MjAxNCBkaWZmZXJlbmNlcyBwYXN0IHRoZSBjYXAgYXJlIGludmlzaWJsZS4gV2Ugc3VyZmFjZSB0aGF0IGFzIGFcbiAqIG9uZS1saW5lIG5vdGUgYWJvdmUgdGhlIGRpZmYgc28gdXNlcnMgZG9uJ3QgcmVhZCBhIHBhcnRpYWwgZGlmZiBhc1xuICogYXV0aG9yaXRhdGl2ZS5cbiAqXG4gKiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gbmVpdGhlciBzaWRlIGlzIHRydW5jYXRlZC5cbiAqL1xuZnVuY3Rpb24gZGVzY3JpYmVUcnVuY2F0aW9uKGFUZXh0OiBzdHJpbmcsIGJUZXh0OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCByZSA9IC9cXC5cXC5cXC5cXFt0cnVuY2F0ZWQsIG9yaWdpbmFsIChcXGQrKSBjaGFyc1xcXSQvO1xuXHRjb25zdCBhTWF0Y2ggPSByZS5leGVjKGFUZXh0KTtcblx0Y29uc3QgYk1hdGNoID0gcmUuZXhlYyhiVGV4dCk7XG5cdGlmICghYU1hdGNoICYmICFiTWF0Y2gpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmIChhTWF0Y2ggJiYgYk1hdGNoKSB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUudHJ1bmNhdGVkQm90aCcsXG5cdFx0XHRcIkJvdGggc2lkZXMgdHJ1bmNhdGVkIGJ5IHRoZSBPVGVsIGF0dHJpYnV0ZSBjYXAgKG9yaWdpbmFscyB3ZXJlIHswfSBhbmQgezF9IGNoYXJzKSBcXHUyMDE0IGRpZmYgbWF5IGJlIHBhcnRpYWwuXCIsXG5cdFx0XHRudW1iZXJGb3JtYXR0ZXIudmFsdWUuZm9ybWF0KHBhcnNlSW50KGFNYXRjaFsxXSwgMTApKSxcblx0XHRcdG51bWJlckZvcm1hdHRlci52YWx1ZS5mb3JtYXQocGFyc2VJbnQoYk1hdGNoWzFdLCAxMCkpLFxuXHRcdCk7XG5cdH1cblx0Y29uc3QgbWF0Y2ggPSAoYU1hdGNoID8/IGJNYXRjaCkhO1xuXHRjb25zdCBzaWRlID0gYU1hdGNoXG5cdFx0PyBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLnRydW5jYXRlZFNpZGVQcmV2JywgXCJQcmV2aW91c1wiKVxuXHRcdDogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS50cnVuY2F0ZWRTaWRlQ3VycicsIFwiQ3VycmVudFwiKTtcblx0cmV0dXJuIGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUudHJ1bmNhdGVkT25lJyxcblx0XHRcInswfSBzaWRlIHRydW5jYXRlZCBieSB0aGUgT1RlbCBhdHRyaWJ1dGUgY2FwIChvcmlnaW5hbCB3YXMgezF9IGNoYXJzKSBcXHUyMDE0IGRpZmYgbWF5IGJlIHBhcnRpYWwuXCIsXG5cdFx0c2lkZSxcblx0XHRudW1iZXJGb3JtYXR0ZXIudmFsdWUuZm9ybWF0KHBhcnNlSW50KG1hdGNoWzFdLCAxMCkpLFxuXHQpO1xufVxuXG5mdW5jdGlvbiBjb21wdXRlQ2FjaGVIaXQoZXZlbnQ6IElDaGF0RGVidWdNb2RlbFR1cm5FdmVudCk6IG51bWJlciB7XG5cdGlmICghZXZlbnQuaW5wdXRUb2tlbnMgfHwgZXZlbnQuY2FjaGVkVG9rZW5zID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gMDtcblx0fVxuXHRyZXR1cm4gTWF0aC5taW4oMTAwLCAoZXZlbnQuY2FjaGVkVG9rZW5zIC8gZXZlbnQuaW5wdXRUb2tlbnMpICogMTAwKTtcbn1cblxuZnVuY3Rpb24gc2hvdWxkQ29tcGFyZUlucHV0TWVzc2FnZXMoYTogSVNpZGVEYXRhLCBiOiBJU2lkZURhdGEpOiBib29sZWFuIHtcblx0Ly8gQSBSZXNwb25zZXMgQVBJIGNvbnRpbnVhdGlvbiAoYHByZXZpb3VzX3Jlc3BvbnNlX2lkYCkgc2VuZHMgb25seSB0aGVcblx0Ly8gY3VycmVudCB3aXJlIGRlbHRhLiBQb3NpdGlvbmFsbHkgZGlmZmluZyB0aGF0IGRlbHRhIGFnYWluc3QgdGhlIG90aGVyXG5cdC8vIHNpZGUncyBpbnB1dCBhcnJheSBtYWtlcyBpdCBsb29rIGFzIGlmIHByZXZpb3VzIGNvbnRleHQgZGlzYXBwZWFyZWQsXG5cdC8vIHdoZW4gaXQgaXMgYWN0dWFsbHkgcHJvdmlkZXItc2lkZSBzdGF0ZS4gU3VwcHJlc3MgbWVzc2FnZS1sZXZlbCBkaWZmaW5nXG5cdC8vIHdoZW4gKmVpdGhlciogc2lkZSBpcyBhIGNvbnRpbnVhdGlvbiBcdTIwMTQgdGhlIGNvbXBhcmlzb24gd291bGQgYmVcblx0Ly8gYXN5bW1ldHJpYyAoZGVsdGEgdnMuIGZ1bGwgaW5wdXQpLiBTdGlsbCBjb21wYXJlIHN5c3RlbS90b29scyBhbmRcblx0Ly8gcmVxdWVzdCBvcHRpb25zOyBzaG93IHRoZSBjdXJyZW50IGRlbHRhIGFzIGEgc2VwYXJhdGUgY29tcG9uZW50LlxuXHRyZXR1cm4gIWEucmVxdWVzdFNoYXBlLmlzQ29udGludWF0aW9uICYmICFiLnJlcXVlc3RTaGFwZS5pc0NvbnRpbnVhdGlvbjtcbn1cblxuaW50ZXJmYWNlIElSZXF1ZXN0U2hhcGVNZXRhZGF0YSB7XG5cdHJlYWRvbmx5IGFwaT86IHN0cmluZztcblx0cmVhZG9ubHkgaGFzUHJldmlvdXNSZXNwb25zZUlkPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaW5wdXRJdGVtVHlwZXM/OiByZWFkb25seSBzdHJpbmdbXTtcbn1cblxuZnVuY3Rpb24gZGVzY3JpYmVSZXF1ZXN0U2hhcGUoaW5wdXRNZXNzYWdlczogcmVhZG9ubHkgSU5vcm1hbGl6ZWRNZXNzYWdlW10sIHJlcXVlc3RTaGFwZUpzb246IHN0cmluZyB8IHVuZGVmaW5lZCk6IElSZXF1ZXN0U2hhcGVJbmZvIHtcblx0Y29uc3QgbWV0YWRhdGEgPSBwYXJzZVJlcXVlc3RTaGFwZU1ldGFkYXRhKHJlcXVlc3RTaGFwZUpzb24pO1xuXHQvLyBEZWZlbnNpdmU6IGEgbWFsZm9ybWVkIGxvZyBlbnRyeSBjb3VsZCBkZXNlcmlhbGl6ZSBgaW5wdXRJdGVtVHlwZXNgIGFzXG5cdC8vIHNvbWV0aGluZyBvdGhlciB0aGFuIGFuIGFycmF5LCB3aGljaCB3b3VsZCBjcmFzaCBgLmluY2x1ZGVzKC4uLilgIGJlbG93LlxuXHRjb25zdCBpbnB1dEl0ZW1UeXBlcyA9IEFycmF5LmlzQXJyYXkobWV0YWRhdGE/LmlucHV0SXRlbVR5cGVzKVxuXHRcdD8gbWV0YWRhdGEuaW5wdXRJdGVtVHlwZXMuZmlsdGVyKCh4KTogeCBpcyBzdHJpbmcgPT4gdHlwZW9mIHggPT09ICdzdHJpbmcnKVxuXHRcdDogW107XG5cdGNvbnN0IGNvbW1vbiA9IHsgYXBpOiB0eXBlb2YgbWV0YWRhdGE/LmFwaSA9PT0gJ3N0cmluZycgPyBtZXRhZGF0YS5hcGkgOiB1bmRlZmluZWQsIGlucHV0SXRlbVR5cGVzIH07XG5cdGNvbnN0IGhhc1ByZXZpb3VzUmVzcG9uc2VJZCA9IG1ldGFkYXRhPy5oYXNQcmV2aW91c1Jlc3BvbnNlSWQgPT09IHRydWU7XG5cdGNvbnN0IGhhc1Rvb2xTZWFyY2hPdXRwdXQgPSBpbnB1dEl0ZW1UeXBlcy5pbmNsdWRlcygndG9vbF9zZWFyY2hfb3V0cHV0JykgfHwgaW5wdXRNZXNzYWdlcy5zb21lKG0gPT4gbS5yb2xlID09PSAndG9vbF9zZWFyY2gnKTtcblx0Y29uc3QgaGFzT25seVRvb2xPdXRwdXQgPSBpbnB1dE1lc3NhZ2VzLmxlbmd0aCA+IDAgJiYgaW5wdXRNZXNzYWdlcy5ldmVyeShtID0+IG0ucm9sZSA9PT0gJ3Rvb2wnKTtcblxuXHRpZiAoaGFzUHJldmlvdXNSZXNwb25zZUlkICYmIGhhc1Rvb2xTZWFyY2hPdXRwdXQpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUucmVxdWVzdFNoYXBlLnRvb2xTZWFyY2gnLCBcInRvb2xfc2VhcmNoX291dHB1dCBjb250aW51YXRpb25cIiksXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5yZXF1ZXN0U2hhcGUudG9vbFNlYXJjaERlc2NyaXB0aW9uJywgXCJSZXNwb25zZXMgQVBJIGNvbnRpbnVhdGlvbjogdGhlIGRpc3BsYXllZCBpbnB1dCBpcyBvbmx5IHRoZSB0b29sLXNlYXJjaCBkZWx0YSBzZW50IG92ZXIgdGhlIHdpcmUuIFRoZSBwcm92aWRlciByZWNvbnN0cnVjdHMgcHJpb3IgY29udGV4dCBmcm9tIHRoZSBwcmV2aW91cyByZXNwb25zZSBpZC5cIiksXG5cdFx0XHRpc0NvbnRpbnVhdGlvbjogdHJ1ZSxcblx0XHRcdC4uLmNvbW1vbixcblx0XHR9O1xuXHR9XG5cdGlmIChoYXNQcmV2aW91c1Jlc3BvbnNlSWQgJiYgaGFzT25seVRvb2xPdXRwdXQpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUucmVxdWVzdFNoYXBlLnRvb2xPdXRwdXQnLCBcInRvb2wgb3V0cHV0IGNvbnRpbnVhdGlvblwiKSxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLnJlcXVlc3RTaGFwZS50b29sT3V0cHV0RGVzY3JpcHRpb24nLCBcIlJlc3BvbnNlcyBBUEkgY29udGludWF0aW9uOiB0aGUgZGlzcGxheWVkIGlucHV0IGlzIG9ubHkgdGhlIHRvb2wtb3V0cHV0IGRlbHRhIHNlbnQgb3ZlciB0aGUgd2lyZS4gVGhlIHByb3ZpZGVyIHJlY29uc3RydWN0cyBwcmlvciBjb250ZXh0IGZyb20gdGhlIHByZXZpb3VzIHJlc3BvbnNlIGlkLlwiKSxcblx0XHRcdGlzQ29udGludWF0aW9uOiB0cnVlLFxuXHRcdFx0Li4uY29tbW9uLFxuXHRcdH07XG5cdH1cblx0aWYgKGhhc1ByZXZpb3VzUmVzcG9uc2VJZCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5yZXF1ZXN0U2hhcGUuY29udGludWF0aW9uJywgXCJSZXNwb25zZXMgQVBJIGNvbnRpbnVhdGlvblwiKSxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLnJlcXVlc3RTaGFwZS5jb250aW51YXRpb25EZXNjcmlwdGlvbicsIFwiUmVzcG9uc2VzIEFQSSBjb250aW51YXRpb246IHRoZSBkaXNwbGF5ZWQgaW5wdXQgaXMgb25seSB0aGUgZGVsdGEgc2VudCBvdmVyIHRoZSB3aXJlLiBUaGUgcHJvdmlkZXIgcmVjb25zdHJ1Y3RzIHByaW9yIGNvbnRleHQgZnJvbSB0aGUgcHJldmlvdXMgcmVzcG9uc2UgaWQuXCIpLFxuXHRcdFx0aXNDb250aW51YXRpb246IHRydWUsXG5cdFx0XHQuLi5jb21tb24sXG5cdFx0fTtcblx0fVxuXHRpZiAoaGFzVG9vbFNlYXJjaE91dHB1dCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5yZXF1ZXN0U2hhcGUudG9vbFNlYXJjaFJlcXVlc3QnLCBcInRvb2xfc2VhcmNoX291dHB1dCByZXF1ZXN0XCIpLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0RGVidWcuY2FjaGUucmVxdWVzdFNoYXBlLnRvb2xTZWFyY2hSZXF1ZXN0RGVzY3JpcHRpb24nLCBcIlRoaXMgcmVxdWVzdCBjb250YWlucyBhIFJlc3BvbnNlcyBBUEkgdG9vbF9zZWFyY2hfb3V0cHV0IGl0ZW0uIE5vIHByZXZpb3VzLXJlc3BvbnNlIGNvbnRpbnVhdGlvbiBtYXJrZXIgd2FzIGNhcHR1cmVkLCBzbyB0aGUgZGlzcGxheWVkIGlucHV0IG1heSBiZSBhIGZ1bGwgb3IgaGlzdG9yeS1zbGljZWQgcmVxdWVzdCByYXRoZXIgdGhhbiBvbmx5IGEgY29udGludWF0aW9uIGRlbHRhLlwiKSxcblx0XHRcdGlzQ29udGludWF0aW9uOiBmYWxzZSxcblx0XHRcdC4uLmNvbW1vbixcblx0XHR9O1xuXHR9XG5cdGlmIChoYXNPbmx5VG9vbE91dHB1dCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5yZXF1ZXN0U2hhcGUudG9vbE91dHB1dFJlcXVlc3QnLCBcInRvb2wgb3V0cHV0IHJlcXVlc3RcIiksXG5cdFx0XHRkZXNjcmlwdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0aXNDb250aW51YXRpb246IGZhbHNlLFxuXHRcdFx0Li4uY29tbW9uLFxuXHRcdH07XG5cdH1cblx0cmV0dXJuIHtcblx0XHRsYWJlbDogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jYWNoZS5yZXF1ZXN0U2hhcGUuZnVsbElucHV0JywgXCJmdWxsIGlucHV0IHJlcXVlc3RcIiksXG5cdFx0ZGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHRpc0NvbnRpbnVhdGlvbjogZmFsc2UsXG5cdFx0Li4uY29tbW9uLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBwYXJzZVJlcXVlc3RTaGFwZU1ldGFkYXRhKHJlcXVlc3RTaGFwZUpzb246IHN0cmluZyB8IHVuZGVmaW5lZCk6IElSZXF1ZXN0U2hhcGVNZXRhZGF0YSB8IHVuZGVmaW5lZCB7XG5cdGlmICghcmVxdWVzdFNoYXBlSnNvbikge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0dHJ5IHtcblx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJlcXVlc3RTaGFwZUpzb24pIGFzIElSZXF1ZXN0U2hhcGVNZXRhZGF0YTtcblx0XHRpZiAocGFyc2VkICYmIHR5cGVvZiBwYXJzZWQgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gcGFyc2VkO1xuXHRcdH1cblx0fSBjYXRjaCB7XG5cdFx0Ly8gSWdub3JlIG1hbGZvcm1lZCBtZXRhZGF0YS4gVGhlIGlucHV0LW1lc3NhZ2Ugcm9sZSBmYWxsYmFjayBzdGlsbFxuXHRcdC8vIHByb3ZpZGVzIGEgY29uc2VydmF0aXZlIGxhYmVsIGZvciBvbGRlciBvciBwYXJ0aWFsbHkgY2FwdHVyZWQgbG9ncy5cblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIE1hcHMgYSBub3JtYWxpemVkIG1lc3NhZ2Ugcm9sZSBvbnRvIHRoZSBzbWFsbCBzZXQgb2YgQ1NTIGNvbG9yIGNsYXNzZXNcbiAqIHRoZSBwcm9tcHQtc2lnbmF0dXJlIHZpc3VhbGl6YXRpb24gcmVjb2duaXplcy4gVW5rbm93biByb2xlcyBmYWxsIHRocm91Z2hcbiAqIHRvIGB0b29sYCBzbyB0aGV5IHN0aWxsIGdldCBhIHN3YXRjaC5cbiAqL1xuZnVuY3Rpb24gcm9sZUNsYXNzKHJvbGU6IHN0cmluZyk6IHN0cmluZyB7XG5cdHN3aXRjaCAocm9sZSkge1xuXHRcdGNhc2UgJ3N5c3RlbSc6XG5cdFx0Y2FzZSAndG9vbHMnOlxuXHRcdGNhc2UgJ3VzZXInOlxuXHRcdGNhc2UgJ2Fzc2lzdGFudCc6XG5cdFx0Y2FzZSAndG9vbCc6XG5cdFx0XHRyZXR1cm4gcm9sZTtcblx0XHRjYXNlICd0b29sX3NlYXJjaCc6XG5cdFx0XHQvLyBVc2UgYSBoeXBoZW5hdGVkIENTUyBjbGFzcyBmb3IgY29uc2lzdGVuY3kgd2l0aCB0aGUgcmVzdCBvZiB0aGVcblx0XHRcdC8vIGByb2xlLSpgIHN3YXRjaC9zZWdtZW50IGNsYXNzZXM7IHRoZSB1bmRlcmx5aW5nIGRhdGEgcm9sZSBrZWVwc1xuXHRcdFx0Ly8gYHRvb2xfc2VhcmNoYCB0byBtYXRjaCB0aGUgT1RlbC1lbWl0dGVkIHJvbGUgc3RyaW5nLlxuXHRcdFx0cmV0dXJuICd0b29sLXNlYXJjaCc7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiAndG9vbCc7XG5cdH1cbn1cblxuLyoqXG4gKiBGb3JtYXQgYSBjYWNoZSBoaXQgcGVyY2VudGFnZSB3aXRoIDItZGVjaW1hbCBwcmVjaXNpb24sIHRydW5jYXRpbmcgcmF0aGVyXG4gKiB0aGFuIHJvdW5kaW5nIHNvIGEgdmFsdWUgbGlrZSA5OS45OTglIGRvZXMgbm90IGRpc3BsYXkgYXMgMTAwJS4gV2Ugb25seVxuICogcmVwb3J0IGEgbGl0ZXJhbCBgMTAwJWAgd2hlbiB0aGUgcmF0aW8gaXMgZXhhY3RseSAxLlxuICovXG5mdW5jdGlvbiBmb3JtYXRDYWNoZVBjdChwY3Q6IG51bWJlcik6IHN0cmluZyB7XG5cdGNvbnN0IHRydW5jYXRlZCA9IE1hdGguZmxvb3IocGN0ICogMTAwKSAvIDEwMDtcblx0cmV0dXJuIHRydW5jYXRlZC50b0ZpeGVkKDIpO1xufVxuXG4vKipcbiAqIEludGVnZXItcHJlY2lzaW9uIHZhcmlhbnQgb2Yge0BsaW5rIGZvcm1hdENhY2hlUGN0fSBmb3IgdGhlIHJhaWwgY2hpcC5cbiAqL1xuZnVuY3Rpb24gZm9ybWF0Q2FjaGVQY3RJbnQocGN0OiBudW1iZXIpOiBzdHJpbmcge1xuXHRyZXR1cm4gU3RyaW5nKE1hdGguZmxvb3IocGN0KSk7XG59XG5cbmZ1bmN0aW9uIGZvcm1hdFRva2Vucyh2YWx1ZTogbnVtYmVyIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gJ1xcdTIwMTQnO1xuXHR9XG5cdHJldHVybiBudW1iZXJGb3JtYXR0ZXIudmFsdWUuZm9ybWF0KHZhbHVlKTtcbn1cblxuaW50ZXJmYWNlIElPcHRpb25EZWx0YSB7XG5cdHJlYWRvbmx5IGtleTogc3RyaW5nO1xuXHRyZWFkb25seSBwcmV2aW91czogdW5rbm93bjtcblx0cmVhZG9ubHkgY3VycmVudDogdW5rbm93bjtcbn1cblxuLyoqXG4gKiBCdWlsZCB0aGUgY2FjaGUtcmVsZXZhbnQgb3B0aW9ucyB0YWJsZSBmb3Igb25lIHNpZGUuIENvbWJpbmVzIHRoZVxuICogcmVxdWVzdCBib2R5J3MgYHJlcXVlc3Rfb3B0aW9uc2AgYmxvYiB3aXRoIHRoZSBtb2RlbCBpZCBzdXJmYWNlZCBvblxuICogdGhlIE9UZWwgY2hhdCBzcGFuLCBzaW5jZSBzd2l0Y2hpbmcgbW9kZWxzIGlzIHRoZSBtb3N0IGFnZ3Jlc3NpdmVcbiAqIGNhY2hlIGludmFsaWRhdG9yIGFuZCB1c2VycyBleHBlY3QgdG8gc2VlIGl0IGhlcmUuXG4gKi9cbmZ1bmN0aW9uIHNpZGVPcHRpb25zKHNpZGU6IElTaWRlRGF0YSk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcblx0Y29uc3Qgb3V0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9O1xuXHRpZiAoc2lkZS5ldmVudC5tb2RlbCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0b3V0Lm1vZGVsID0gc2lkZS5ldmVudC5tb2RlbDtcblx0fVxuXHRPYmplY3QuYXNzaWduKG91dCwgcGFyc2VPcHRpb25zKHNpZGUuY29udGVudD8ucmVxdWVzdE9wdGlvbnMpKTtcblx0Ly8gRWZmb3J0IGlzIGEgZmlyc3QtY2xhc3MgY29zdC9sYXRlbmN5IGxldmVyLCBidXQgYSB0aGlua2luZy1jYXBhYmxlXG5cdC8vIHJlcXVlc3QgdGhhdCBkb2Vzbid0IHNlbmQgb25lIGZhbGxzIGJhY2sgdG8gdGhlIHByb3ZpZGVyJ3Mgc2VydmVyLXNpZGVcblx0Ly8gZGVmYXVsdCB3aXRoIG5vdGhpbmcgb24gdGhlIHdpcmUuIFN1cmZhY2UgdGhhdCBleHBsaWNpdGx5IHNvIHRoZSB0YWJsZVxuXHQvLyBhbnN3ZXJzIFwid2hhdCBlZmZvcnQgcmFuP1wiIGluc3RlYWQgb2Ygc2lsZW50bHkgb21pdHRpbmcgdGhlIHJvdyBcXHUyMDE0IGFuZFxuXHQvLyBzbyBhIHJlcXVlc3QgdGhhdCAqc3RvcHMqIHNlbmRpbmcgZWZmb3J0IHNob3dzIHVwIGFzIGFuIG9wdGlvbiBjaGFuZ2UuXG5cdGNvbnN0IGhhc0VmZm9ydCA9IG91dFsnb3V0cHV0X2NvbmZpZy5lZmZvcnQnXSAhPT0gdW5kZWZpbmVkXG5cdFx0fHwgb3V0WydyZWFzb25pbmcuZWZmb3J0J10gIT09IHVuZGVmaW5lZFxuXHRcdHx8IG91dFsncmVhc29uaW5nX2VmZm9ydCddICE9PSB1bmRlZmluZWQ7XG5cdGNvbnN0IGhhc1RoaW5raW5nID0gT2JqZWN0LmtleXMob3V0KS5zb21lKGsgPT4gayA9PT0gJ3RoaW5raW5nJyB8fCBrLnN0YXJ0c1dpdGgoJ3RoaW5raW5nLicpKTtcblx0aWYgKCFoYXNFZmZvcnQgJiYgaGFzVGhpbmtpbmcpIHtcblx0XHRvdXRbJ291dHB1dF9jb25maWcuZWZmb3J0J10gPSBsb2NhbGl6ZSgnY2hhdERlYnVnLmNhY2hlLmVmZm9ydE5vdFNlbnQnLCBcIihub3Qgc2VudCBcXHUyMDE0IHByb3ZpZGVyIGRlZmF1bHQpXCIpO1xuXHR9XG5cdHJldHVybiBvdXQ7XG59XG5cbi8qKlxuICogQ29tcHV0ZSB0aGUgcGVyLWtleSBkZWx0YSBiZXR3ZWVuIHR3byByZXF1ZXN0cycgb3B0aW9uIHRhYmxlcy5cbiAqIEtleXMgYXJlIGZsYXR0ZW5lZCBvbmUgbGV2ZWwgZGVlcCBzbyBuZXN0ZWQgb2JqZWN0cyAoZS5nLlxuICogYHJlYXNvbmluZy5lZmZvcnRgKSBzaG93IHVwIHdpdGggdGhlaXIgb3duIHJvdyBpbnN0ZWFkIG9mIGR1bXBpbmcgdGhlXG4gKiBmdWxsIG9iamVjdCBvbnRvIG9uZSBsaW5lLiBUaGUgcmVzdWx0IGlzIHNvcnRlZCBieSBrZXkgZm9yIHN0YWJsZVxuICogcmVuZGVyaW5nLlxuICovXG5mdW5jdGlvbiBjb21wdXRlT3B0aW9uc0RpZmYoYTogSVNpZGVEYXRhLCBiOiBJU2lkZURhdGEpOiByZWFkb25seSBJT3B0aW9uRGVsdGFbXSB7XG5cdGNvbnN0IHByZXYgPSBzaWRlT3B0aW9ucyhhKTtcblx0Y29uc3QgY3VyciA9IHNpZGVPcHRpb25zKGIpO1xuXHRjb25zdCBrZXlzID0gbmV3IFNldDxzdHJpbmc+KFsuLi5PYmplY3Qua2V5cyhwcmV2KSwgLi4uT2JqZWN0LmtleXMoY3VycildKTtcblx0Y29uc3Qgb3V0OiBJT3B0aW9uRGVsdGFbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG5cdFx0Y29uc3QgYXYgPSBwcmV2W2tleV07XG5cdFx0Y29uc3QgYnYgPSBjdXJyW2tleV07XG5cdFx0aWYgKCFlcXVhbHMoYXYsIGJ2KSkge1xuXHRcdFx0b3V0LnB1c2goeyBrZXksIHByZXZpb3VzOiBhdiwgY3VycmVudDogYnYgfSk7XG5cdFx0fVxuXHR9XG5cdG91dC5zb3J0KCh4LCB5KSA9PiB4LmtleS5sb2NhbGVDb21wYXJlKHkua2V5KSk7XG5cdHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIHBhcnNlT3B0aW9ucyhibG9iOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XG5cdGlmICghYmxvYikge1xuXHRcdHJldHVybiB7fTtcblx0fVxuXHRsZXQgcGFyc2VkOiB1bmtub3duO1xuXHR0cnkge1xuXHRcdHBhcnNlZCA9IEpTT04ucGFyc2UoYmxvYik7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB7fTtcblx0fVxuXHRpZiAoIXBhcnNlZCB8fCB0eXBlb2YgcGFyc2VkICE9PSAnb2JqZWN0JyB8fCBBcnJheS5pc0FycmF5KHBhcnNlZCkpIHtcblx0XHRyZXR1cm4ge307XG5cdH1cblx0Y29uc3QgZmxhdDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fTtcblx0Zm9yIChjb25zdCBbaywgdl0gb2YgT2JqZWN0LmVudHJpZXMocGFyc2VkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KSkge1xuXHRcdGlmICh2ICYmIHR5cGVvZiB2ID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheSh2KSkge1xuXHRcdFx0Zm9yIChjb25zdCBbbmssIG52XSBvZiBPYmplY3QuZW50cmllcyh2IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KSkge1xuXHRcdFx0XHRmbGF0W2Ake2t9LiR7bmt9YF0gPSBudjtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0ZmxhdFtrXSA9IHY7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBmbGF0O1xufVxuXG5mdW5jdGlvbiBmb3JtYXRPcHRpb25WYWx1ZSh2YWx1ZTogdW5rbm93bik6IHN0cmluZyB7XG5cdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuICdcXHUyMDE0Jztcblx0fVxuXHRpZiAodmFsdWUgPT09IG51bGwpIHtcblx0XHRyZXR1cm4gJ251bGwnO1xuXHR9XG5cdGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cdGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInIHx8IHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0cmV0dXJuIFN0cmluZyh2YWx1ZSk7XG5cdH1cblx0dHJ5IHtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gU3RyaW5nKHZhbHVlKTtcblx0fVxufVxuXG5jb25zdCBESUZGX09QVElPTlMgPSB7XG5cdGlnbm9yZVRyaW1XaGl0ZXNwYWNlOiBmYWxzZSxcblx0bWF4Q29tcHV0YXRpb25UaW1lTXM6IDIwMCxcblx0Y29tcHV0ZU1vdmVzOiBmYWxzZSxcbn0gYXMgY29uc3Q7XG5cbi8qKlxuICogUmVuZGVyIGEgc2lkZS1ieS1zaWRlIGxpbmUgKyBjaGFyYWN0ZXIgZGlmZiBpbnRvIHRoZSB0d28gYm9keSBlbGVtZW50cy5cbiAqXG4gKiBVc2VzIHtAbGluayBsaW5lc0RpZmZDb21wdXRlcnMuZ2V0RGVmYXVsdCgpfSB0byBjb21wdXRlIGEgbGluZS1sZXZlbCBkaWZmXG4gKiB3aXRoIGlubmVyIGNoYXJhY3Rlci1sZXZlbCBtYXBwaW5ncywgdGhlbiB3YWxrcyB0aGUgcmVzdWx0IHRvIGVtaXQgb25lXG4gKiBkaXYgcGVyIGxpbmUuIExpbmVzIGJlbG9uZ2luZyB0byBhIHJlbW92ZWQgcmFuZ2UgYXJlIHN0eWxlZCB3aXRoIHRoZVxuICogXCJyZW1vdmVcIiBjbGFzcyBvbiB0aGUgcHJldmlvdXMgc2lkZTsgYWRkZWQgcmFuZ2VzIHdpdGggdGhlIFwiYWRkXCIgY2xhc3NcbiAqIG9uIHRoZSBjdXJyZW50IHNpZGU7IG1vZGlmaWVkIHJhbmdlcyBhcHBlYXIgb24gYm90aCBzaWRlcyB3aXRoIGNoYXJhY3RlclxuICogc3BhbnMgaGlnaGxpZ2h0ZWQgd2l0aGluLiBJZGVudGljYWwgbGluZXMgYXJlIHBsYWNlZCBvbiBib3RoIHNpZGVzIGFzXG4gKiBjb250ZXh0LlxuICovXG5mdW5jdGlvbiByZW5kZXJJbmxpbmVEaWZmKHByZXZIb3N0OiBIVE1MRWxlbWVudCwgY3Vyckhvc3Q6IEhUTUxFbGVtZW50LCBwcmV2OiBzdHJpbmcsIGN1cnI6IHN0cmluZyk6IHZvaWQge1xuXHRjb25zdCBwcmV2TGluZXMgPSBwcmV2LnNwbGl0KC9cXHI/XFxuLyk7XG5cdGNvbnN0IGN1cnJMaW5lcyA9IGN1cnIuc3BsaXQoL1xccj9cXG4vKTtcblx0Y29uc3QgcmVzdWx0ID0gbGluZXNEaWZmQ29tcHV0ZXJzLmdldERlZmF1bHQoKS5jb21wdXRlRGlmZihwcmV2TGluZXMsIGN1cnJMaW5lcywgRElGRl9PUFRJT05TKTtcblxuXHRsZXQgcHJldklkeCA9IDA7XG5cdGxldCBjdXJySWR4ID0gMDtcblx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgcmVzdWx0LmNoYW5nZXMpIHtcblx0XHRjb25zdCBvcmlnU3RhcnQgPSBjaGFuZ2Uub3JpZ2luYWwuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IG9yaWdFbmQgPSBjaGFuZ2Uub3JpZ2luYWwuZW5kTGluZU51bWJlckV4Y2x1c2l2ZTtcblx0XHRjb25zdCBtb2RTdGFydCA9IGNoYW5nZS5tb2RpZmllZC5zdGFydExpbmVOdW1iZXI7XG5cdFx0Y29uc3QgbW9kRW5kID0gY2hhbmdlLm1vZGlmaWVkLmVuZExpbmVOdW1iZXJFeGNsdXNpdmU7XG5cblx0XHQvLyBFbWl0IGlkZW50aWNhbCBjb250ZXh0IGxpbmVzIHVwIHRvIHRoaXMgY2hhbmdlLlxuXHRcdHdoaWxlIChwcmV2SWR4ICsgMSA8IG9yaWdTdGFydCAmJiBjdXJySWR4ICsgMSA8IG1vZFN0YXJ0KSB7XG5cdFx0XHRhcHBlbmRMaW5lKHByZXZIb3N0LCBwcmV2TGluZXNbcHJldklkeF0sICdjb250ZXh0Jyk7XG5cdFx0XHRhcHBlbmRMaW5lKGN1cnJIb3N0LCBjdXJyTGluZXNbY3VycklkeF0sICdjb250ZXh0Jyk7XG5cdFx0XHRwcmV2SWR4Kys7XG5cdFx0XHRjdXJySWR4Kys7XG5cdFx0fVxuXG5cdFx0Ly8gRW1pdCBjaGFuZ2VkIGxpbmVzIG9uIGVhY2ggc2lkZS4gSW5uZXIgcmFuZ2UgbWFwcGluZ3MgZ2l2ZSB1c1xuXHRcdC8vIGNoYXJhY3Rlci1sZXZlbCBzcGFuczsgd2UgYXBwbHkgdGhlbSBwZXIgbGluZS5cblx0XHRjb25zdCBpbm5lckJ5T3JpZyA9IGdyb3VwSW5uZXJDaGFuZ2VzQnlMaW5lKGNoYW5nZS5pbm5lckNoYW5nZXMsIC8qIG9yaWdpbmFsICovIHRydWUpO1xuXHRcdGNvbnN0IGlubmVyQnlNb2QgPSBncm91cElubmVyQ2hhbmdlc0J5TGluZShjaGFuZ2UuaW5uZXJDaGFuZ2VzLCAvKiBvcmlnaW5hbCAqLyBmYWxzZSk7XG5cblx0XHRmb3IgKGxldCBsaW5lID0gb3JpZ1N0YXJ0OyBsaW5lIDwgb3JpZ0VuZDsgbGluZSsrKSB7XG5cdFx0XHRjb25zdCBsaW5lVGV4dCA9IHByZXZMaW5lc1tsaW5lIC0gMV0gPz8gJyc7XG5cdFx0XHRhcHBlbmRDaGFuZ2VkTGluZShwcmV2SG9zdCwgbGluZVRleHQsIGlubmVyQnlPcmlnLmdldChsaW5lKSwgJ3JlbW92ZScpO1xuXHRcdH1cblx0XHRwcmV2SWR4ID0gb3JpZ0VuZCAtIDE7XG5cblx0XHRmb3IgKGxldCBsaW5lID0gbW9kU3RhcnQ7IGxpbmUgPCBtb2RFbmQ7IGxpbmUrKykge1xuXHRcdFx0Y29uc3QgbGluZVRleHQgPSBjdXJyTGluZXNbbGluZSAtIDFdID8/ICcnO1xuXHRcdFx0YXBwZW5kQ2hhbmdlZExpbmUoY3Vyckhvc3QsIGxpbmVUZXh0LCBpbm5lckJ5TW9kLmdldChsaW5lKSwgJ2FkZCcpO1xuXHRcdH1cblx0XHRjdXJySWR4ID0gbW9kRW5kIC0gMTtcblx0fVxuXG5cdC8vIEVtaXQgYW55IHRyYWlsaW5nIGlkZW50aWNhbCBjb250ZXh0LiBUaGUgbGluZS1sZXZlbCBkaWZmIGd1YXJhbnRlZXNcblx0Ly8gZXZlcnkgY2hhbmdlIHJhbmdlIGlzIHJlcG9ydGVkLCBzbyBhbnl0aGluZyBsZWZ0IG92ZXIgb24gYm90aCBzaWRlc1xuXHQvLyBhZnRlciB0aGUgbGFzdCBjaGFuZ2UgaXMgaWRlbnRpY2FsIGNvbnRleHQgXHUyMDE0IHRoZSBgJiZgIGlzIGludGVudGlvbmFsOlxuXHQvLyBpZiBvbmUgc2lkZSBoYXMgbW9yZSBsaW5lcyB0aGFuIHRoZSBvdGhlciBhdCB0aGlzIHBvaW50IHRoZSBvdmVyZmxvd1xuXHQvLyBpcyBhbHJlYWR5IGNvdmVyZWQgYnkgdGhlIGNoYW5nZSByYW5nZXMgYWJvdmUgKG90aGVyd2lzZSB3ZSdkIGhhdmUgYVxuXHQvLyBidWcgaW4gdGhlIGRpZmYgY29tcHV0ZXIpLlxuXHR3aGlsZSAocHJldklkeCA8IHByZXZMaW5lcy5sZW5ndGggJiYgY3VycklkeCA8IGN1cnJMaW5lcy5sZW5ndGgpIHtcblx0XHRhcHBlbmRMaW5lKHByZXZIb3N0LCBwcmV2TGluZXNbcHJldklkeF0sICdjb250ZXh0Jyk7XG5cdFx0YXBwZW5kTGluZShjdXJySG9zdCwgY3VyckxpbmVzW2N1cnJJZHhdLCAnY29udGV4dCcpO1xuXHRcdHByZXZJZHgrKztcblx0XHRjdXJySWR4Kys7XG5cdH1cbn1cblxuZnVuY3Rpb24gYXBwZW5kTGluZShob3N0OiBIVE1MRWxlbWVudCwgdGV4dDogc3RyaW5nLCBraW5kOiAnY29udGV4dCcgfCAnYWRkJyB8ICdyZW1vdmUnKTogdm9pZCB7XG5cdGNvbnN0IGxpbmUgPSBET00uYXBwZW5kKGhvc3QsICQoYC5jaGF0LWRlYnVnLWNhY2hlLWRpZmYtbGluZS4ke2tpbmR9YCkpO1xuXHRsaW5lLnRleHRDb250ZW50ID0gdGV4dCA9PT0gJycgPyAnXFx1MDBhMCcgOiB0ZXh0O1xufVxuXG5pbnRlcmZhY2UgSUlubmVyQ2hhbmdlUmFuZ2Uge1xuXHRyZWFkb25seSBzdGFydENvbHVtbjogbnVtYmVyO1xuXHRyZWFkb25seSBlbmRDb2x1bW46IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gYXBwZW5kQ2hhbmdlZExpbmUoaG9zdDogSFRNTEVsZW1lbnQsIHRleHQ6IHN0cmluZywgcmFuZ2VzOiByZWFkb25seSBJSW5uZXJDaGFuZ2VSYW5nZVtdIHwgdW5kZWZpbmVkLCBraW5kOiAnYWRkJyB8ICdyZW1vdmUnKTogdm9pZCB7XG5cdGNvbnN0IGxpbmUgPSBET00uYXBwZW5kKGhvc3QsICQoYC5jaGF0LWRlYnVnLWNhY2hlLWRpZmYtbGluZS4ke2tpbmR9YCkpO1xuXHRpZiAoIXJhbmdlcyB8fCByYW5nZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0bGluZS50ZXh0Q29udGVudCA9IHRleHQgPT09ICcnID8gJ1xcdTAwYTAnIDogdGV4dDtcblx0XHRyZXR1cm47XG5cdH1cblx0bGV0IGN1cnNvciA9IDE7IC8vIDEtYmFzZWQgY29sdW1uIGluZGV4XG5cdGNvbnN0IHNvcnRlZCA9IFsuLi5yYW5nZXNdLnNvcnQoKGEsIGIpID0+IGEuc3RhcnRDb2x1bW4gLSBiLnN0YXJ0Q29sdW1uKTtcblx0Zm9yIChjb25zdCByIG9mIHNvcnRlZCkge1xuXHRcdGlmIChyLnN0YXJ0Q29sdW1uID4gY3Vyc29yKSB7XG5cdFx0XHRET00uYXBwZW5kKGxpbmUsIGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKHRleHQuc3Vic3RyaW5nKGN1cnNvciAtIDEsIHIuc3RhcnRDb2x1bW4gLSAxKSkpO1xuXHRcdH1cblx0XHRjb25zdCBzcGFuID0gRE9NLmFwcGVuZChsaW5lLCAkKCdzcGFuLmNoYXQtZGVidWctY2FjaGUtZGlmZi1pbm5lcicpKTtcblx0XHRzcGFuLnRleHRDb250ZW50ID0gdGV4dC5zdWJzdHJpbmcoci5zdGFydENvbHVtbiAtIDEsIHIuZW5kQ29sdW1uIC0gMSk7XG5cdFx0Y3Vyc29yID0gci5lbmRDb2x1bW47XG5cdH1cblx0aWYgKGN1cnNvciAtIDEgPCB0ZXh0Lmxlbmd0aCkge1xuXHRcdERPTS5hcHBlbmQobGluZSwgZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUodGV4dC5zdWJzdHJpbmcoY3Vyc29yIC0gMSkpKTtcblx0fVxufVxuXG4vKipcbiAqIEdyb3VwIHtAbGluayBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcuaW5uZXJDaGFuZ2VzfSBieSBsaW5lIHNvIHRoZSBkaWZmXG4gKiByZW5kZXJlciBjYW4gbG9vayB1cCBjaGFyYWN0ZXIgcmFuZ2VzIHBlciBsaW5lLiBNdWx0aS1saW5lIHJhbmdlXG4gKiBtYXBwaW5ncyBvbmx5IGNvbnRyaWJ1dGUgYSBwYXJ0aWFsIHJhbmdlIHRvIHRoZWlyIGZpcnN0L2xhc3QgbGluZTsgd2VcbiAqIGFwcHJveGltYXRlIGJ5IGNsYW1waW5nIHRvIHRoZSBsaW5lIGJvdW5kcy5cbiAqL1xuZnVuY3Rpb24gZ3JvdXBJbm5lckNoYW5nZXNCeUxpbmUoXG5cdGlubmVyQ2hhbmdlczogcmVhZG9ubHkgUmFuZ2VNYXBwaW5nW10gfCB1bmRlZmluZWQsXG5cdHVzZU9yaWdpbmFsOiBib29sZWFuLFxuKTogTWFwPG51bWJlciwgSUlubmVyQ2hhbmdlUmFuZ2VbXT4ge1xuXHRjb25zdCBvdXQgPSBuZXcgTWFwPG51bWJlciwgSUlubmVyQ2hhbmdlUmFuZ2VbXT4oKTtcblx0aWYgKCFpbm5lckNoYW5nZXMpIHtcblx0XHRyZXR1cm4gb3V0O1xuXHR9XG5cdGZvciAoY29uc3QgciBvZiBpbm5lckNoYW5nZXMpIHtcblx0XHRjb25zdCByYW5nZSA9IHVzZU9yaWdpbmFsID8gci5vcmlnaW5hbFJhbmdlIDogci5tb2RpZmllZFJhbmdlO1xuXHRcdC8vIE9ubHkgaGFuZGxlIHNpbmdsZS1saW5lIGlubmVyIHJhbmdlcyBmb3IgdjEuIE11bHRpLWxpbmUgc3BhbnNcblx0XHQvLyBhcmUgZmxhZ2dlZCBhdCB0aGUgbGluZSBsZXZlbCB2aWEgdGhlIHN1cnJvdW5kaW5nIGFkZC9yZW1vdmVcblx0XHQvLyBzdHlsaW5nLCBzbyB3ZSBkb24ndCBuZWVkIHBpeGVsLXBlcmZlY3QgY29sdW1uIGhpZ2hsaWdodHMuXG5cdFx0aWYgKHJhbmdlLnN0YXJ0TGluZU51bWJlciAhPT0gcmFuZ2UuZW5kTGluZU51bWJlcikge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IGxpc3QgPSBvdXQuZ2V0KHJhbmdlLnN0YXJ0TGluZU51bWJlcikgPz8gW107XG5cdFx0bGlzdC5wdXNoKHsgc3RhcnRDb2x1bW46IHJhbmdlLnN0YXJ0Q29sdW1uLCBlbmRDb2x1bW46IHJhbmdlLmVuZENvbHVtbiB9KTtcblx0XHRvdXQuc2V0KHJhbmdlLnN0YXJ0TGluZU51bWJlciwgbGlzdCk7XG5cdH1cblx0cmV0dXJuIG91dDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsYUFBYSxNQUFNLGlCQUFpQjtBQUM3QyxTQUFT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QUNBLGNBQVUsU0FBUztBQUFBLEVBQ3BCO0FBUUEsU0FBTyxVQUFVLFVBQVUsVUFBVSxVQUFVLFVBQVUsUUFBUTtBQUNoRSxlQUFXLFVBQVUsVUFBVSxPQUFPLEdBQUcsU0FBUztBQUNsRCxlQUFXLFVBQVUsVUFBVSxPQUFPLEdBQUcsU0FBUztBQUNsRDtBQUNBO0FBQUEsRUFDRDtBQUNEO0FBRUEsU0FBUyxXQUFXLE1BQW1CLE1BQWMsTUFBMEM7QUFDOUYsUUFBTSxPQUFPLElBQUksT0FBTyxNQUFNLEVBQUUsK0JBQStCLElBQUksRUFBRSxDQUFDO0FBQ3RFLE9BQUssY0FBYyxTQUFTLEtBQUssU0FBVztBQUM3QztBQU9BLFNBQVMsa0JBQWtCLE1BQW1CLE1BQWMsUUFBa0QsTUFBOEI7QUFDM0ksUUFBTSxPQUFPLElBQUksT0FBTyxNQUFNLEVBQUUsK0JBQStCLElBQUksRUFBRSxDQUFDO0FBQ3RFLE1BQUksQ0FBQyxVQUFVLE9BQU8sV0FBVyxHQUFHO0FBQ25DLFNBQUssY0FBYyxTQUFTLEtBQUssU0FBVztBQUM1QztBQUFBLEVBQ0Q7QUFDQSxNQUFJLFNBQVM7QUFDYixRQUFNLFNBQVMsQ0FBQyxHQUFHLE1BQU0sRUFBRSxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsY0FBYyxFQUFFLFdBQVc7QUFDdkUsYUFBVyxLQUFLLFFBQVE7QUFDdkIsUUFBSSxFQUFFLGNBQWMsUUFBUTtBQUMzQixVQUFJLE9BQU8sTUFBTSxTQUFTLGVBQWUsS0FBSyxVQUFVLFNBQVMsR0FBRyxFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUM7QUFBQSxJQUN4RjtBQUNBLFVBQU0sT0FBTyxJQUFJLE9BQU8sTUFBTSxFQUFFLGtDQUFrQyxDQUFDO0FBQ25FLFNBQUssY0FBYyxLQUFLLFVBQVUsRUFBRSxjQUFjLEdBQUcsRUFBRSxZQUFZLENBQUM7QUFDcEUsYUFBUyxFQUFFO0FBQUEsRUFDWjtBQUNBLE1BQUksU0FBUyxJQUFJLEtBQUssUUFBUTtBQUM3QixRQUFJLE9BQU8sTUFBTSxTQUFTLGVBQWUsS0FBSyxVQUFVLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFBQSxFQUNyRTtBQUNEO0FBUUEsU0FBUyx3QkFDUixjQUNBLGFBQ21DO0FBQ25DLFFBQU0sTUFBTSxvQkFBSSxJQUFpQztBQUNqRCxNQUFJLENBQUMsY0FBYztBQUNsQixXQUFPO0FBQUEsRUFDUjtBQUNBLGFBQVcsS0FBSyxjQUFjO0FBQzdCLFVBQU0sUUFBUSxjQUFjLEVBQUUsZ0JBQWdCLEVBQUU7QUFJaEQsUUFBSSxNQUFNLG9CQUFvQixNQUFNLGVBQWU7QUFDbEQ7QUFBQSxJQUNEO0FBQ0EsVUFBTSxPQUFPLElBQUksSUFBSSxNQUFNLGVBQWUsS0FBSyxDQUFDO0FBQ2hELFNBQUssS0FBSyxFQUFFLGFBQWEsTUFBTSxhQUFhLFdBQVcsTUFBTSxVQUFVLENBQUM7QUFDeEUsUUFBSSxJQUFJLE1BQU0saUJBQWlCLElBQUk7QUFBQSxFQUNwQztBQUNBLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFsiQ2FjaGVFeHBsb3Jlck5hdmlnYXRpb24iLCAiYiJdCn0K
