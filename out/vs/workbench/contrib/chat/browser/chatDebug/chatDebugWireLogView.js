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
import { DomScrollableElement } from "../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { BreadcrumbsWidget } from "../../../../../base/browser/ui/breadcrumbs/breadcrumbsWidget.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { SelectBox } from "../../../../../base/browser/ui/selectBox/selectBox.js";
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { ScrollbarVisibility } from "../../../../../base/common/scrollable.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { IContextViewService } from "../../../../../platform/contextview/browser/contextView.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IEnvironmentService } from "../../../../../platform/environment/common/environment.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { defaultBreadcrumbsWidgetStyles, defaultButtonStyles, defaultSelectBoxStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { AgentHostAhpJsonlLoggingSettingId, IAgentHostService } from "../../../../../platform/agentHost/common/agentService.js";
import { ActionType } from "../../../../../platform/agentHost/common/state/sessionActions.js";
import { IRemoteAgentHostService } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IOutputService } from "../../../../services/output/common/output.js";
import { IPathService } from "../../../../services/path/common/pathService.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { LocalChatSessionUri } from "../../common/model/chatUri.js";
import { AgentHostLogSourceKind, enumerateAgentHostLogSources, isAgentHostSession, readAgentHostLogSourceContent } from "./agentHostLogSources.js";
import { setupBreadcrumbKeyboardNavigation, TextBreadcrumbItem } from "./chatDebugTypes.js";
const $ = DOM.$;
const LIVE_REFRESH_DELAY = 400;
const FILTER_DEBOUNCE_DELAY = 150;
const PAGE_SIZE = 1e3;
const MAX_DETAIL_JSON = 2e4;
var WireLogNavigation = /* @__PURE__ */ ((WireLogNavigation2) => {
  WireLogNavigation2["Home"] = "home";
  WireLogNavigation2["Overview"] = "overview";
  return WireLogNavigation2;
})(WireLogNavigation || {});
let ChatDebugWireLogView = class extends Disposable {
  constructor(parent, chatService, contextViewService, editorService, configurationService, pathService, agentHostService, remoteAgentHostService, outputService, fileService, textModelService, environmentService, productService, logService) {
    super();
    this.chatService = chatService;
    this.contextViewService = contextViewService;
    this.editorService = editorService;
    this.configurationService = configurationService;
    this.pathService = pathService;
    this.agentHostService = agentHostService;
    this.remoteAgentHostService = remoteAgentHostService;
    this.outputService = outputService;
    this.fileService = fileService;
    this.textModelService = textModelService;
    this.environmentService = environmentService;
    this.productService = productService;
    this.logService = logService;
    this._onNavigate = this._register(new Emitter());
    this.onNavigate = this._onNavigate.event;
    this.headerDisposables = this._register(new DisposableStore());
    this.contentDisposables = this._register(new DisposableStore());
    /** Watches the currently-shown wire log for live updates. */
    this.liveWatch = this._register(new MutableDisposable());
    this.sources = [];
    this.entries = [];
    /** The filtered entries currently rendered in the list, in order. */
    this.renderedVisible = [];
    /** Row DOM nodes parallel to {@link renderedVisible}. */
    this.rowElements = [];
    /** Per-row disposables parallel to {@link renderedVisible}. */
    this.rowStores = [];
    /** True while the list is showing a status message instead of rows. */
    this.listShowingMessage = false;
    this.filterText = "";
    /** Monotonic token guarding against out-of-order async loads. */
    this.loadGeneration = 0;
    /** Max number of (filtered) frames rendered at once; grows via "Load more". */
    this.visibleLimit = PAGE_SIZE;
    this.loadMoreDisposables = this._register(new DisposableStore());
    this.loadMoreVisible = false;
    this.container = DOM.append(parent, $(".chat-debug-wirelog"));
    DOM.hide(this.container);
    this.refreshScheduler = this._register(new RunOnceScheduler(() => this.liveRefresh(), LIVE_REFRESH_DELAY));
    this.filterScheduler = this._register(new RunOnceScheduler(() => this.applyFilter(), FILTER_DEBOUNCE_DELAY));
    const breadcrumbContainer = DOM.append(this.container, $(".chat-debug-breadcrumb"));
    this.breadcrumbWidget = this._register(new BreadcrumbsWidget(breadcrumbContainer, 3, void 0, Codicon.chevronRight, defaultBreadcrumbsWidgetStyles));
    this._register(setupBreadcrumbKeyboardNavigation(breadcrumbContainer, this.breadcrumbWidget));
    this._register(this.breadcrumbWidget.onDidSelectItem((e) => {
      if (e.type === "select" && e.item instanceof TextBreadcrumbItem) {
        this.breadcrumbWidget.setSelection(void 0);
        const idx = this.breadcrumbWidget.getItems().indexOf(e.item);
        if (idx === 0) {
          this._onNavigate.fire("home" /* Home */);
        } else if (idx === 1) {
          this._onNavigate.fire("overview" /* Overview */);
        }
      }
    }));
    this.hintBar = DOM.append(this.container, $(".chat-debug-wirelog-hint"));
    DOM.hide(this.hintBar);
    this.toolbar = DOM.append(this.container, $(".chat-debug-wirelog-toolbar"));
    this.selectHost = DOM.append(this.toolbar, $(".chat-debug-wirelog-select"));
    this.filterInput = DOM.append(this.toolbar, $("input.chat-debug-wirelog-filter"));
    this.filterInput.type = "text";
    this.filterInput.placeholder = localize("chatDebug.wireLog.filterPlaceholder", "Filter by method, type, or id");
    this.filterInput.setAttribute("aria-label", localize("chatDebug.wireLog.filterAria", "Filter AHP log frames"));
    this._register(DOM.addDisposableListener(this.filterInput, DOM.EventType.INPUT, () => {
      this.filterScheduler.schedule();
    }));
    this.summary = DOM.append(this.container, $(".chat-debug-wirelog-summary"));
    DOM.hide(this.summary);
    this.body = DOM.append(this.container, $(".chat-debug-wirelog-body"));
    this.list = $(".chat-debug-wirelog-list");
    this.scrollable = this._register(new DomScrollableElement(this.list, {
      horizontal: ScrollbarVisibility.Auto,
      vertical: ScrollbarVisibility.Auto
    }));
    DOM.append(this.body, this.scrollable.getDomNode());
    this.loadMoreContainer = DOM.append(this.container, $(".chat-debug-wirelog-loadmore"));
    DOM.hide(this.loadMoreContainer);
    this.footer = DOM.append(this.container, $(".chat-debug-wirelog-footer"));
  }
  setSession(sessionResource) {
    this.currentSessionResource = sessionResource;
    this.selectedSourceId = void 0;
    this.visibleLimit = PAGE_SIZE;
  }
  show() {
    DOM.show(this.container);
    this.load();
  }
  hide() {
    DOM.hide(this.container);
    this.refreshScheduler.cancel();
    this.filterScheduler.cancel();
    this.liveWatch.clear();
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
      new TextBreadcrumbItem(localize("chatDebug.ahpLog", "AHP Log"))
    ]);
  }
  focus() {
    this.selectBox?.focus();
  }
  layout() {
    const height = this.body.clientHeight;
    if (height > 0) {
      this.list.style.height = `${height}px`;
    }
    this.scrollable.scanDomNode();
  }
  get logSourceServices() {
    return {
      pathService: this.pathService,
      agentHostService: this.agentHostService,
      remoteAgentHostService: this.remoteAgentHostService,
      outputService: this.outputService,
      fileService: this.fileService,
      textModelService: this.textModelService,
      configurationService: this.configurationService,
      environmentService: this.environmentService,
      productService: this.productService,
      logService: this.logService
    };
  }
  async load() {
    this.updateBreadcrumb();
    this.headerDisposables.clear();
    this.liveWatch.clear();
    DOM.clearNode(this.selectHost);
    this.selectBox = void 0;
    const wireLoggingEnabled = this.configurationService.getValue(AgentHostAhpJsonlLoggingSettingId);
    DOM.clearNode(this.hintBar);
    if (!wireLoggingEnabled) {
      DOM.show(this.hintBar);
      DOM.append(this.hintBar, $(`span${ThemeIcon.asCSSSelector(Codicon.info)}`));
      DOM.append(this.hintBar, $("span", void 0, localize("chatDebug.wireLog.disabledHint", "AHP logging is disabled \u2014 enable {0} and reproduce to capture client\u2194host protocol frames.", AgentHostAhpJsonlLoggingSettingId)));
    } else {
      DOM.hide(this.hintBar);
    }
    if (!isAgentHostSession(this.currentSessionResource)) {
      this.renderMessage(localize("chatDebug.wireLog.notAgentHost", "The AHP Log is available for Agent Host sessions."));
      return;
    }
    const allSources = await enumerateAgentHostLogSources(this.logSourceServices, this.currentSessionResource);
    this.sources = allSources.filter((source) => source.kind === AgentHostLogSourceKind.WireLog);
    if (this.sources.length === 0) {
      this.renderMessage(wireLoggingEnabled ? localize("chatDebug.wireLog.noFrames", "No AHP log was found yet for this session. Interact with the agent to capture protocol frames.") : localize("chatDebug.wireLog.enableToCapture", "No AHP log is available. Enable {0} and reproduce the issue to capture protocol frames.", AgentHostAhpJsonlLoggingSettingId));
      return;
    }
    if (this.sources.length > 1) {
      DOM.show(this.selectHost);
      const options = this.sources.map((source) => ({ text: source.label }));
      let selectedIndex2 = this.sources.findIndex((source) => source.id === this.selectedSourceId);
      if (selectedIndex2 < 0) {
        selectedIndex2 = 0;
      }
      const selectBox = this.headerDisposables.add(new SelectBox(options, selectedIndex2, this.contextViewService, defaultSelectBoxStyles, {
        ariaLabel: localize("chatDebug.wireLog.sourceLabel", "AHP log file")
      }));
      selectBox.render(this.selectHost);
      this.headerDisposables.add(selectBox.onDidSelect((e) => this.loadSource(e.index)));
      this.selectBox = selectBox;
    } else {
      DOM.hide(this.selectHost);
    }
    const openBtn = this.headerDisposables.add(new Button(this.toolbar, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: localize("chatDebug.wireLog.openFile", "Open Full File") }));
    openBtn.element.classList.add("chat-debug-wirelog-action");
    openBtn.label = `$(go-to-file) ${localize("chatDebug.wireLog.openFile", "Open Full File")}`;
    this.headerDisposables.add(openBtn.onDidClick(() => this.openCurrentFile()));
    const refreshBtn = this.headerDisposables.add(new Button(this.toolbar, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: localize("chatDebug.wireLog.refresh", "Refresh") }));
    refreshBtn.element.classList.add("chat-debug-wirelog-action");
    refreshBtn.label = `$(refresh) ${localize("chatDebug.wireLog.refresh", "Refresh")}`;
    this.headerDisposables.add(refreshBtn.onDidClick(() => this.reloadCurrentSource()));
    let selectedIndex = this.sources.findIndex((source) => source.id === this.selectedSourceId);
    if (selectedIndex < 0) {
      selectedIndex = 0;
    }
    await this.loadSource(selectedIndex);
  }
  async loadSource(index) {
    const source = this.sources[index];
    if (!source) {
      return;
    }
    this.selectedSourceId = source.id;
    this.liveWatch.clear();
    this.currentFileResource = void 0;
    this.visibleLimit = PAGE_SIZE;
    const generation = ++this.loadGeneration;
    this.renderMessage(localize("chatDebug.wireLog.loading", "Loading\u2026"));
    let content;
    try {
      content = await readAgentHostLogSourceContent(source, this.logSourceServices);
    } catch (error) {
      if (generation !== this.loadGeneration) {
        return;
      }
      this.renderMessage(localize("chatDebug.wireLog.error", "Failed to read AHP log: {0}", error instanceof Error ? error.message : String(error)));
      return;
    }
    if (generation !== this.loadGeneration) {
      return;
    }
    if (!content) {
      this.renderMessage(localize("chatDebug.wireLog.unavailable", "This AHP log is unavailable."));
      return;
    }
    this.currentFileResource = content.fileResource;
    this.entries = buildWireEntries(parseWireFrames(content.text));
    this.renderList();
    this.renderFooter(source, content.truncated);
    this.setupLiveWatch(source);
  }
  reloadCurrentSource() {
    const index = this.sources.findIndex((source) => source.id === this.selectedSourceId);
    if (index >= 0) {
      this.loadSource(index);
    }
  }
  setupLiveWatch(source) {
    const store = new DisposableStore();
    if (source.resource?.scheme === Schemas.file) {
      const watcher = store.add(this.fileService.createWatcher(source.resource, { recursive: false, excludes: [] }));
      store.add(watcher.onDidChange(() => this.refresh()));
    }
    this.liveWatch.value = store;
  }
  openCurrentFile() {
    if (this.currentFileResource) {
      this.editorService.openEditor({ resource: this.currentFileResource, options: { pinned: true } });
    }
  }
  renderMessage(message) {
    this.contentDisposables.clear();
    this.rowElements = [];
    this.rowStores = [];
    this.renderedVisible = [];
    this.listShowingMessage = true;
    DOM.hide(this.summary);
    DOM.clearNode(this.list);
    this.list.classList.add("chat-debug-wirelog-message");
    this.list.textContent = message;
    this.scrollable.scanDomNode();
    DOM.clearNode(this.footer);
    if (this.loadMoreVisible) {
      DOM.hide(this.loadMoreContainer);
      this.loadMoreVisible = false;
    }
  }
  renderSummary() {
    DOM.clearNode(this.summary);
    let requests = 0;
    let errors = 0;
    let pending = 0;
    let longest = 0;
    for (const entry of this.entries) {
      if (entry.frame.kind === "request") {
        requests++;
        if (!entry.response) {
          pending++;
        } else {
          const duration = entry.response.ts - entry.frame.ts;
          if (duration > longest) {
            longest = duration;
          }
        }
      }
      if (isErrorEntry(entry)) {
        errors++;
      }
    }
    DOM.show(this.summary);
    this.appendChip(localize("chatDebug.wireLog.chip.frames", "{0} frames", this.entries.length));
    this.appendChip(localize("chatDebug.wireLog.chip.requests", "{0} requests", requests));
    if (errors > 0) {
      this.appendChip(localize("chatDebug.wireLog.chip.errors", "{0} errors", errors), "error");
    }
    if (pending > 0) {
      this.appendChip(localize("chatDebug.wireLog.chip.pending", "{0} pending", pending), "pending");
    }
    if (longest > 0) {
      this.appendChip(localize("chatDebug.wireLog.chip.slowest", "slowest {0}", formatDuration(longest)));
    }
  }
  appendChip(text, tone) {
    const chip = DOM.append(this.summary, $("span.chat-debug-wirelog-chip", void 0, text));
    if (tone) {
      chip.classList.add(`chat-debug-wirelog-chip-${tone}`);
    }
  }
  /**
   * Applies the current filter box value and re-renders the list. Invoked
   * (debounced) from the filter input's INPUT handler; skips work when the
   * effective filter text has not changed.
   */
  applyFilter() {
    const next = this.filterInput.value.trim().toLowerCase();
    if (next === this.filterText) {
      return;
    }
    this.filterText = next;
    this.visibleLimit = PAGE_SIZE;
    this.renderList();
  }
  renderList() {
    this.contentDisposables.clear();
    DOM.clearNode(this.list);
    this.rowElements = [];
    this.rowStores = [];
    this.renderedVisible = [];
    this.listShowingMessage = false;
    if (this.entries.length === 0) {
      this.renderMessage(localize("chatDebug.wireLog.empty", "The AHP log is empty."));
      return;
    }
    this.renderSummary();
    const { filtered, display } = this.computeVisible(this.entries);
    if (display.length === 0) {
      const empty = DOM.append(this.list, $(".chat-debug-wirelog-noresults"));
      empty.textContent = localize("chatDebug.wireLog.noMatches", "No frames match '{0}'.", this.filterText);
      this.updateLoadMore(0);
      this.scrollable.scanDomNode();
      return;
    }
    for (const entry of display) {
      this.appendRow(entry);
    }
    this.renderedVisible = display;
    this.updateLoadMore(filtered.length);
    this.scrollable.scanDomNode();
  }
  /**
   * Re-reads the current wire log and updates the list in place — appending
   * newly-captured frames and refreshing rows whose state changed (e.g. a
   * response arriving for a pending request) — instead of rebuilding the
   * whole view. Used for live refreshes so the panel does not flash back to
   * "Loading…" and lose scroll position on every turn.
   */
  async liveRefresh() {
    const index = this.sources.findIndex((source2) => source2.id === this.selectedSourceId);
    const source = this.sources[index];
    if (!source) {
      return;
    }
    const generation = ++this.loadGeneration;
    let content;
    try {
      content = await readAgentHostLogSourceContent(source, this.logSourceServices);
    } catch {
      return;
    }
    if (generation !== this.loadGeneration || !content) {
      return;
    }
    this.currentFileResource = content.fileResource;
    this.applyEntries(buildWireEntries(parseWireFrames(content.text)));
    this.renderFooter(source, content.truncated);
  }
  /**
   * Applies a freshly-parsed set of entries to the list. When the previously
   * rendered rows are still a prefix of the new (filtered) set, only the
   * changed and newly-appended rows are touched; otherwise a full render is
   * performed (e.g. after a filter change or log rotation).
   */
  applyEntries(newEntries) {
    const { filtered, display } = this.computeVisible(newEntries);
    const canReconcile = !this.listShowingMessage && this.renderedVisible.length > 0 && display.length >= this.renderedVisible.length && this.renderedVisible.every((entry, i) => baseEntryKey(entry) === baseEntryKey(display[i]));
    this.entries = newEntries;
    if (!canReconcile) {
      this.renderList();
      return;
    }
    const wasAtBottom = this.isScrolledToBottom();
    this.renderSummary();
    for (let i = 0; i < this.renderedVisible.length; i++) {
      if (entryStateKey(this.renderedVisible[i]) !== entryStateKey(display[i])) {
        this.replaceRow(i, display[i]);
      }
    }
    for (let i = this.renderedVisible.length; i < display.length; i++) {
      this.appendRow(display[i]);
    }
    this.renderedVisible = display;
    this.updateLoadMore(filtered.length);
    this.scrollable.scanDomNode();
    if (wasAtBottom) {
      this.scrollToBottom();
    }
  }
  /**
   * Computes the filtered entries and the (paginated) subset currently
   * displayed. Only the first {@link visibleLimit} matching frames are shown;
   * the rest are revealed via the "Load more" button.
   */
  computeVisible(entries) {
    const filter = this.filterText;
    const filtered = filter ? entries.filter((entry) => matchesFilter(entry, filter)) : entries;
    const display = filtered.length > this.visibleLimit ? filtered.slice(0, this.visibleLimit) : filtered;
    return { filtered, display };
  }
  /**
   * Shows or hides the "Load more" affordance and updates its status label.
   */
  updateLoadMore(totalFiltered) {
    if (totalFiltered <= this.visibleLimit) {
      if (this.loadMoreVisible) {
        DOM.hide(this.loadMoreContainer);
        this.loadMoreVisible = false;
        this.layout();
      }
      return;
    }
    if (!this.loadMoreStatus) {
      this.loadMoreStatus = DOM.append(this.loadMoreContainer, $("span.chat-debug-wirelog-loadmore-status"));
    }
    if (!this.loadMoreBtn) {
      this.loadMoreBtn = this.loadMoreDisposables.add(new Button(this.loadMoreContainer, { ...defaultButtonStyles, secondary: true, title: localize("chatDebug.wireLog.loadMoreTitle", "Load more frames") }));
      this.loadMoreDisposables.add(this.loadMoreBtn.onDidClick(() => {
        this.visibleLimit += PAGE_SIZE;
        this.renderList();
      }));
    }
    const shown = Math.min(this.visibleLimit, totalFiltered);
    const remaining = totalFiltered - shown;
    this.loadMoreStatus.textContent = localize("chatDebug.wireLog.showingCount", "Showing {0} of {1} frames", shown, totalFiltered);
    this.loadMoreBtn.label = localize("chatDebug.wireLog.loadMore", "Load More ({0})", remaining);
    if (!this.loadMoreVisible) {
      DOM.show(this.loadMoreContainer);
      this.loadMoreVisible = true;
      this.layout();
    }
  }
  appendRow(entry) {
    const { row, store } = this.buildRow(entry);
    this.contentDisposables.add(store);
    this.rowElements.push(row);
    this.rowStores.push(store);
    this.list.appendChild(row);
  }
  replaceRow(index, entry) {
    const { row, store } = this.buildRow(entry);
    this.contentDisposables.add(store);
    const oldRow = this.rowElements[index];
    this.list.replaceChild(row, oldRow);
    this.rowStores[index].dispose();
    this.rowElements[index] = row;
    this.rowStores[index] = store;
  }
  isScrolledToBottom() {
    const dimensions = this.scrollable.getScrollDimensions();
    const position = this.scrollable.getScrollPosition();
    return position.scrollTop + dimensions.height >= dimensions.scrollHeight - 4;
  }
  scrollToBottom() {
    this.scrollable.setScrollPosition({ scrollTop: this.scrollable.getScrollDimensions().scrollHeight });
  }
  buildRow(entry) {
    const store = new DisposableStore();
    const frame = entry.frame;
    const isError = isErrorEntry(entry);
    const isPending = frame.kind === "request" && !entry.response;
    const row = $(".chat-debug-wirelog-row");
    if (isError) {
      row.classList.add("chat-debug-wirelog-row-error");
    }
    const header = DOM.append(row, $(".chat-debug-wirelog-row-header"));
    header.tabIndex = 0;
    header.setAttribute("role", "button");
    const chevron = DOM.append(header, $(`span.chat-debug-wirelog-chevron${ThemeIcon.asCSSSelector(Codicon.chevronRight)}`));
    chevron.setAttribute("aria-hidden", "true");
    const outbound = frame.dir === "c2s";
    const dirIcon = outbound ? Codicon.arrowRight : Codicon.arrowLeft;
    const dirEl = DOM.append(header, $(`span.chat-debug-wirelog-dir${ThemeIcon.asCSSSelector(dirIcon)}`));
    dirEl.title = outbound ? localize("chatDebug.wireLog.outbound", "VS Code \u2192 Agent Host") : localize("chatDebug.wireLog.inbound", "Agent Host \u2192 VS Code");
    const label = frame.method ?? localize("chatDebug.wireLog.responseLabel", "(response)");
    DOM.append(header, $("span.chat-debug-wirelog-method", void 0, label));
    if (frame.actionType) {
      DOM.append(header, $("span.chat-debug-wirelog-type", void 0, frame.actionType));
    }
    const badgeText = frame.kind === "request" ? localize("chatDebug.wireLog.badge.request", "request") : frame.kind === "notification" ? localize("chatDebug.wireLog.badge.notification", "notify") : localize("chatDebug.wireLog.badge.response", "response");
    DOM.append(header, $("span.chat-debug-wirelog-badge", void 0, badgeText));
    const status = DOM.append(header, $("span.chat-debug-wirelog-status"));
    if (isError) {
      status.classList.add("chat-debug-wirelog-status-error");
      const code = entry.response?.error?.code ?? frame.error?.code;
      status.textContent = code !== void 0 ? localize("chatDebug.wireLog.statusErrorCode", "error {0}", code) : localize("chatDebug.wireLog.statusError", "error");
    } else if (isPending) {
      status.classList.add("chat-debug-wirelog-status-pending");
      status.textContent = localize("chatDebug.wireLog.statusPending", "pending");
    } else if (entry.response) {
      status.classList.add("chat-debug-wirelog-status-ok");
      status.textContent = formatDuration(entry.response.ts - frame.ts);
    }
    const time = DOM.append(header, $("span.chat-debug-wirelog-time"));
    time.textContent = formatClock(frame.ts);
    if (frame.id !== void 0) {
      time.title = localize("chatDebug.wireLog.frameId", "id: {0}", frame.id);
    }
    const details = DOM.append(row, $(".chat-debug-wirelog-row-details"));
    let detailsRendered = false;
    let expanded = false;
    const setExpanded = (value, scan) => {
      expanded = value;
      if (expanded && !detailsRendered) {
        this.renderDetails(details, entry);
        detailsRendered = true;
      }
      row.classList.toggle("chat-debug-wirelog-row-expanded", expanded);
      chevron.classList.toggle("codicon-chevron-down", expanded);
      chevron.classList.toggle("codicon-chevron-right", !expanded);
      header.setAttribute("aria-expanded", String(expanded));
      if (scan) {
        this.scrollable.scanDomNode();
      }
    };
    setExpanded(isError, false);
    store.add(DOM.addDisposableListener(header, DOM.EventType.CLICK, () => setExpanded(!expanded, true)));
    store.add(DOM.addDisposableListener(header, DOM.EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setExpanded(!expanded, true);
      }
    }));
    return { row, store };
  }
  renderDetails(container, entry) {
    const frame = entry.frame;
    if (frame.payload !== void 0) {
      this.appendJsonSection(container, frame.kind === "response" ? localize("chatDebug.wireLog.section.result", "Result") : localize("chatDebug.wireLog.section.params", "Params"), frame.payload);
    }
    if (frame.error) {
      this.appendJsonSection(container, localize("chatDebug.wireLog.section.error", "Error"), frame.error, true);
    }
    if (entry.response) {
      if (entry.response.error) {
        this.appendJsonSection(container, localize("chatDebug.wireLog.section.responseError", "Response Error"), entry.response.error, true);
      } else if (entry.response.payload !== void 0) {
        this.appendJsonSection(container, localize("chatDebug.wireLog.section.result", "Result"), entry.response.payload);
      }
    }
    if (frame.truncated || entry.response?.truncated) {
      DOM.append(container, $(".chat-debug-wirelog-detail-note", void 0, localize("chatDebug.wireLog.truncatedFrame", "Large payload values were elided in the log. Open the full file for complete data.")));
    }
  }
  appendJsonSection(container, title, value, isError = false) {
    const section = DOM.append(container, $(".chat-debug-wirelog-detail-section"));
    DOM.append(section, $(".chat-debug-wirelog-detail-title", void 0, title));
    const pre = DOM.append(section, $("pre.chat-debug-wirelog-detail-json"));
    if (isError) {
      pre.classList.add("chat-debug-wirelog-detail-json-error");
    }
    pre.textContent = stringifyBounded(value);
  }
  renderFooter(source, truncated) {
    DOM.clearNode(this.footer);
    const parts = [];
    if (truncated) {
      parts.push(localize("chatDebug.wireLog.footerTail", "Showing the most recent frames"));
    }
    if (source.isRemote) {
      parts.push(localize("chatDebug.wireLog.footerRemote", "remote"));
    }
    this.footer.textContent = parts.join(" \xB7 ");
  }
};
ChatDebugWireLogView = __decorateClass([
  __decorateParam(1, IChatService),
  __decorateParam(2, IContextViewService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IPathService),
  __decorateParam(6, IAgentHostService),
  __decorateParam(7, IRemoteAgentHostService),
  __decorateParam(8, IOutputService),
  __decorateParam(9, IFileService),
  __decorateParam(10, ITextModelService),
  __decorateParam(11, IEnvironmentService),
  __decorateParam(12, IProductService),
  __decorateParam(13, ILogService)
], ChatDebugWireLogView);
function extractActionType(method, payload) {
  switch (method) {
    case "notification":
      return typeStringOf(getProp(payload, "notification"));
    case "dispatchAction":
      return typeStringOf(Array.isArray(payload) ? payload[1] : void 0);
    case "createSession":
      return uriStringOf(getProp(Array.isArray(payload) ? payload[0] : void 0, "session"));
    default:
      return typeStringOf(getProp(payload, "action"));
  }
}
function getProp(value, key) {
  return value && typeof value === "object" ? value[key] : void 0;
}
function typeStringOf(value) {
  const type = getProp(value, "type");
  return typeof type === "string" ? type : void 0;
}
function uriStringOf(value) {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    const external = value.external;
    if (typeof external === "string") {
      return external;
    }
    if (typeof value.scheme === "string") {
      try {
        return URI.revive(value).toString(true);
      } catch {
        return void 0;
      }
    }
  }
  return void 0;
}
function parseWireFrames(text) {
  const frames = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    let record;
    try {
      record = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const meta = record._ahpLog;
    if (!meta) {
      continue;
    }
    const dir = meta.dir === "s2c" ? "s2c" : "c2s";
    const ts = typeof meta.ts === "string" ? Date.parse(meta.ts) : NaN;
    const id = record.id !== void 0 && record.id !== null ? String(record.id) : void 0;
    const method = typeof record.method === "string" ? record.method : void 0;
    const hasResult = Object.prototype.hasOwnProperty.call(record, "result");
    const errorValue = record.error;
    const kind = method ? id !== void 0 ? "request" : "notification" : "response";
    const payload = method ? record.params : hasResult ? record.result : void 0;
    frames.push({
      ts: Number.isNaN(ts) ? 0 : ts,
      dir,
      truncated: meta.truncated === true,
      byteLength: typeof meta.byteLength === "number" ? meta.byteLength : void 0,
      id,
      method,
      actionType: extractActionType(method, payload),
      payload,
      error: errorValue && typeof errorValue === "object" ? errorValue : void 0,
      kind
    });
  }
  return frames;
}
function buildWireEntries(frames) {
  const entries = [];
  const pendingByKey = /* @__PURE__ */ new Map();
  const pendingKey = (dir, id) => `${dir}|${id}`;
  for (const frame of frames) {
    if (frame.kind === "response" && frame.id !== void 0) {
      const requestDir = frame.dir === "c2s" ? "s2c" : "c2s";
      const key = pendingKey(requestDir, frame.id);
      const request = pendingByKey.get(key);
      if (request) {
        request.response = frame;
        pendingByKey.delete(key);
        continue;
      }
    }
    const entry = { frame, response: void 0 };
    entries.push(entry);
    if (frame.kind === "request" && frame.id !== void 0) {
      pendingByKey.set(pendingKey(frame.dir, frame.id), entry);
    }
  }
  return entries;
}
function isErrorEntry(entry) {
  const frame = entry.frame;
  return !!entry.response?.error || frame.kind === "response" && !!frame.error || frame.actionType === ActionType.ChatError;
}
function matchesFilter(entry, filter) {
  const frame = entry.frame;
  if (frame.method?.toLowerCase().includes(filter)) {
    return true;
  }
  if (frame.actionType?.toLowerCase().includes(filter)) {
    return true;
  }
  if (frame.id !== void 0 && frame.id.toLowerCase().includes(filter)) {
    return true;
  }
  const errorMessage = entry.response?.error?.message ?? frame.error?.message;
  return !!errorMessage && errorMessage.toLowerCase().includes(filter);
}
function baseEntryKey(entry) {
  const frame = entry.frame;
  return `${frame.dir}|${frame.kind}|${frame.id ?? ""}|${frame.ts}|${frame.method ?? ""}`;
}
function entryStateKey(entry) {
  const response = entry.response;
  const responseKey = response ? `R${response.ts}${response.error ? "E" : ""}` : "P";
  return `${baseEntryKey(entry)}|${responseKey}`;
}
function stringifyBounded(value) {
  let text;
  try {
    text = JSON.stringify(value, void 0, 2) ?? String(value);
  } catch {
    text = String(value);
  }
  if (text.length > MAX_DETAIL_JSON) {
    return `${text.slice(0, MAX_DETAIL_JSON)}\u2026`;
  }
  return text;
}
function formatDuration(millis) {
  if (millis < 1e3) {
    return localize("chatDebug.wireLog.ms", "{0} ms", Math.round(millis));
  }
  return localize("chatDebug.wireLog.s", "{0} s", (millis / 1e3).toFixed(millis < 1e4 ? 1 : 0));
}
function formatClock(ts) {
  if (!ts) {
    return "";
  }
  const date = new Date(ts);
  const pad = (value, length = 2) => String(value).padStart(length, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}
export {
  ChatDebugWireLogView,
  WireLogNavigation
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXREZWJ1Z1xcY2hhdERlYnVnV2lyZUxvZ1ZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBEb21TY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgQnJlYWRjcnVtYnNXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnJlYWRjcnVtYnMvYnJlYWRjcnVtYnNXaWRnZXQuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgU2VsZWN0Qm94LCBJU2VsZWN0T3B0aW9uSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zZWxlY3RCb3gvc2VsZWN0Qm94LmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFNjcm9sbGJhclZpc2liaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zY3JvbGxhYmxlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJyZWFkY3J1bWJzV2lkZ2V0U3R5bGVzLCBkZWZhdWx0QnV0dG9uU3R5bGVzLCBkZWZhdWx0U2VsZWN0Qm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0QWhwSnNvbmxMb2dnaW5nU2V0dGluZ0lkLCBJQWdlbnRIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElPdXRwdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvb3V0cHV0L2NvbW1vbi9vdXRwdXQuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IExvY2FsQ2hhdFNlc3Npb25VcmkgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RMb2dTb3VyY2VLaW5kLCBlbnVtZXJhdGVBZ2VudEhvc3RMb2dTb3VyY2VzLCBJQWdlbnRIb3N0TG9nU291cmNlLCBJQWdlbnRIb3N0TG9nU291cmNlU2VydmljZXMsIGlzQWdlbnRIb3N0U2Vzc2lvbiwgcmVhZEFnZW50SG9zdExvZ1NvdXJjZUNvbnRlbnQgfSBmcm9tICcuL2FnZW50SG9zdExvZ1NvdXJjZXMuanMnO1xuaW1wb3J0IHsgc2V0dXBCcmVhZGNydW1iS2V5Ym9hcmROYXZpZ2F0aW9uLCBUZXh0QnJlYWRjcnVtYkl0ZW0gfSBmcm9tICcuL2NoYXREZWJ1Z1R5cGVzLmpzJztcblxuY29uc3QgJCA9IERPTS4kO1xuXG4vKiogRGVib3VuY2UgZm9yIGxpdmUgcmUtcmVhZHMgb2YgdGhlIGN1cnJlbnRseS1zaG93biB3aXJlIGxvZy4gKi9cbmNvbnN0IExJVkVfUkVGUkVTSF9ERUxBWSA9IDQwMDtcblxuLyoqIERlYm91bmNlIGZvciByZS1yZW5kZXJpbmcgdGhlIGxpc3QgYXMgdGhlIHVzZXIgdHlwZXMgaW4gdGhlIGZpbHRlciBib3guICovXG5jb25zdCBGSUxURVJfREVCT1VOQ0VfREVMQVkgPSAxNTA7XG5cbi8qKiBOdW1iZXIgb2YgZnJhbWVzIHJlbmRlcmVkIHBlciBwYWdlOyBncm93cyB2aWEgdGhlIFwiTG9hZCBtb3JlXCIgYnV0dG9uLiAqL1xuY29uc3QgUEFHRV9TSVpFID0gMTAwMDtcblxuLyoqIENhcCB0aGUgcHJldHR5LXByaW50ZWQgSlNPTiBzaG93biBwZXIgZnJhbWUgdG8ga2VlcCB0aGUgRE9NIGxpZ2h0LiAqL1xuY29uc3QgTUFYX0RFVEFJTF9KU09OID0gMjAwMDA7XG5cbi8qKlxuICogTmF2aWdhdGlvbiBldmVudHMgZmlyZWQgYnkgdGhlIFdpcmUgTG9nIGJyZWFkY3J1bWIuXG4gKi9cbmV4cG9ydCBjb25zdCBlbnVtIFdpcmVMb2dOYXZpZ2F0aW9uIHtcblx0SG9tZSA9ICdob21lJyxcblx0T3ZlcnZpZXcgPSAnb3ZlcnZpZXcnLFxufVxuXG50eXBlIFdpcmVMb2dEaXJlY3Rpb24gPSAnYzJzJyB8ICdzMmMnO1xuXG4vKipcbiAqIEEgc2luZ2xlIHBhcnNlZCBKU09OLVJQQyBmcmFtZSBmcm9tIHRoZSBBSFAgd2lyZSBsb2csIHRvZ2V0aGVyIHdpdGggaXRzXG4gKiBgX2FocExvZ2AgdHJhbnNwb3J0IG1ldGFkYXRhLlxuICovXG5pbnRlcmZhY2UgSVdpcmVGcmFtZSB7XG5cdHJlYWRvbmx5IHRzOiBudW1iZXI7XG5cdHJlYWRvbmx5IGRpcjogV2lyZUxvZ0RpcmVjdGlvbjtcblx0cmVhZG9ubHkgdHJ1bmNhdGVkOiBib29sZWFuO1xuXHRyZWFkb25seSBieXRlTGVuZ3RoOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG1ldGhvZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogQSBzaG9ydCBpZGVudGlmeWluZyBsYWJlbCBzdXJmYWNlZCBpbmxpbmUgaW4gdGhlIHJvdzogdGhlIGRpc3BhdGNoZWRcblx0ICogYWN0aW9uJ3MgYHR5cGVgIChmb3IgYGFjdGlvbmAgLyBgZGlzcGF0Y2hBY3Rpb25gIC8gYG5vdGlmaWNhdGlvbmAgZnJhbWVzKVxuXHQgKiBvciB0aGUgdGFyZ2V0IHNlc3Npb24gKGZvciBgY3JlYXRlU2Vzc2lvbmAgZnJhbWVzKS5cblx0ICovXG5cdHJlYWRvbmx5IGFjdGlvblR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcGF5bG9hZDogdW5rbm93bjtcblx0cmVhZG9ubHkgZXJyb3I6IHsgcmVhZG9ubHkgY29kZT86IG51bWJlcjsgcmVhZG9ubHkgbWVzc2FnZT86IHN0cmluZzsgcmVhZG9ubHkgZGF0YT86IHVua25vd24gfSB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkga2luZDogJ3JlcXVlc3QnIHwgJ25vdGlmaWNhdGlvbicgfCAncmVzcG9uc2UnO1xufVxuXG4vKipcbiAqIEEgcmVxdWVzdCAob3Igbm90aWZpY2F0aW9uKSBmcmFtZSwgcGFpcmVkIHdpdGggaXRzIG1hdGNoaW5nIHJlc3BvbnNlIGZyYW1lXG4gKiB3aGVuIG9uZSBpcyBwcmVzZW50IGluIHRoZSBsb2FkZWQgd2luZG93LlxuICovXG5pbnRlcmZhY2UgSVdpcmVFbnRyeSB7XG5cdHJlYWRvbmx5IGZyYW1lOiBJV2lyZUZyYW1lO1xuXHRyZXNwb25zZTogSVdpcmVGcmFtZSB8IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBBSFAgTG9nIHZpZXcgXHUyMDE0IGEgdXNlci1mcmllbmRseSByZW5kZXJpbmcgb2YgdGhlIGNsaWVudFx1MjE5NGhvc3QgQUhQIEpTT04tUlBDXG4gKiBwcm90b2NvbCBmcmFtZXMuIEluc3RlYWQgb2YgcmF3IEpTT05MLCBpdCBwYWlycyByZXF1ZXN0cyB3aXRoIHRoZWlyXG4gKiByZXNwb25zZXMsIHN1cmZhY2VzIGRpcmVjdGlvbiwgbGF0ZW5jeSwgZXJyb3JzIGFuZCB1bmFuc3dlcmVkIChcInBlbmRpbmdcIilcbiAqIGNhbGxzLCBhbmQgbGV0cyBlYWNoIGZyYW1lJ3MgcGF5bG9hZCBiZSBleHBhbmRlZC4gQmFja2VkIGJ5IHRoZSByYXcgQUhQIGxvZ1xuICogZmlsZTsgZnVsbCBmaWRlbGl0eSBpcyBhIGNsaWNrIGF3YXkgdmlhIFwiT3BlbiBGdWxsIEZpbGVcIi5cbiAqL1xuZXhwb3J0IGNsYXNzIENoYXREZWJ1Z1dpcmVMb2dWaWV3IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25OYXZpZ2F0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFdpcmVMb2dOYXZpZ2F0aW9uPigpKTtcblx0cmVhZG9ubHkgb25OYXZpZ2F0ZSA9IHRoaXMuX29uTmF2aWdhdGUuZXZlbnQ7XG5cblx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBicmVhZGNydW1iV2lkZ2V0OiBCcmVhZGNydW1ic1dpZGdldDtcblx0cHJpdmF0ZSByZWFkb25seSBoaW50QmFyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSB0b29sYmFyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBzZWxlY3RIb3N0OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBmaWx0ZXJJbnB1dDogSFRNTElucHV0RWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBzdW1tYXJ5OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBib2R5OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBsaXN0OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBmb290ZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IHNjcm9sbGFibGU6IERvbVNjcm9sbGFibGVFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaGVhZGVyRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbnRlbnREaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdC8qKiBXYXRjaGVzIHRoZSBjdXJyZW50bHktc2hvd24gd2lyZSBsb2cgZm9yIGxpdmUgdXBkYXRlcy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBsaXZlV2F0Y2ggPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSByZWZyZXNoU2NoZWR1bGVyOiBSdW5PbmNlU2NoZWR1bGVyO1xuXHQvKiogRGVib3VuY2VzIGxpc3QgcmUtcmVuZGVycyB3aGlsZSB0aGUgdXNlciB0eXBlcyBpbiB0aGUgZmlsdGVyIGJveC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBmaWx0ZXJTY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cblx0cHJpdmF0ZSBzZWxlY3RCb3g6IFNlbGVjdEJveCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjdXJyZW50U2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc291cmNlczogSUFnZW50SG9zdExvZ1NvdXJjZVtdID0gW107XG5cdHByaXZhdGUgc2VsZWN0ZWRTb3VyY2VJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGN1cnJlbnRGaWxlUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBlbnRyaWVzOiBJV2lyZUVudHJ5W10gPSBbXTtcblx0LyoqIFRoZSBmaWx0ZXJlZCBlbnRyaWVzIGN1cnJlbnRseSByZW5kZXJlZCBpbiB0aGUgbGlzdCwgaW4gb3JkZXIuICovXG5cdHByaXZhdGUgcmVuZGVyZWRWaXNpYmxlOiBJV2lyZUVudHJ5W10gPSBbXTtcblx0LyoqIFJvdyBET00gbm9kZXMgcGFyYWxsZWwgdG8ge0BsaW5rIHJlbmRlcmVkVmlzaWJsZX0uICovXG5cdHByaXZhdGUgcm93RWxlbWVudHM6IEhUTUxFbGVtZW50W10gPSBbXTtcblx0LyoqIFBlci1yb3cgZGlzcG9zYWJsZXMgcGFyYWxsZWwgdG8ge0BsaW5rIHJlbmRlcmVkVmlzaWJsZX0uICovXG5cdHByaXZhdGUgcm93U3RvcmVzOiBEaXNwb3NhYmxlU3RvcmVbXSA9IFtdO1xuXHQvKiogVHJ1ZSB3aGlsZSB0aGUgbGlzdCBpcyBzaG93aW5nIGEgc3RhdHVzIG1lc3NhZ2UgaW5zdGVhZCBvZiByb3dzLiAqL1xuXHRwcml2YXRlIGxpc3RTaG93aW5nTWVzc2FnZSA9IGZhbHNlO1xuXHRwcml2YXRlIGZpbHRlclRleHQgPSAnJztcblx0LyoqIE1vbm90b25pYyB0b2tlbiBndWFyZGluZyBhZ2FpbnN0IG91dC1vZi1vcmRlciBhc3luYyBsb2Fkcy4gKi9cblx0cHJpdmF0ZSBsb2FkR2VuZXJhdGlvbiA9IDA7XG5cdC8qKiBNYXggbnVtYmVyIG9mIChmaWx0ZXJlZCkgZnJhbWVzIHJlbmRlcmVkIGF0IG9uY2U7IGdyb3dzIHZpYSBcIkxvYWQgbW9yZVwiLiAqL1xuXHRwcml2YXRlIHZpc2libGVMaW1pdCA9IFBBR0VfU0laRTtcblx0cHJpdmF0ZSByZWFkb25seSBsb2FkTW9yZUNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgbG9hZE1vcmVEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgbG9hZE1vcmVCdG46IEJ1dHRvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBsb2FkTW9yZVN0YXR1czogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbG9hZE1vcmVWaXNpYmxlID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cGFyZW50OiBIVE1MRWxlbWVudCxcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVBhdGhTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRASUFnZW50SG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhZ2VudEhvc3RTZXJ2aWNlOiBJQWdlbnRIb3N0U2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50SG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlOiBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSxcblx0XHRASU91dHB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvdXRwdXRTZXJ2aWNlOiBJT3V0cHV0U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmNvbnRhaW5lciA9IERPTS5hcHBlbmQocGFyZW50LCAkKCcuY2hhdC1kZWJ1Zy13aXJlbG9nJykpO1xuXHRcdERPTS5oaWRlKHRoaXMuY29udGFpbmVyKTtcblxuXHRcdHRoaXMucmVmcmVzaFNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMubGl2ZVJlZnJlc2goKSwgTElWRV9SRUZSRVNIX0RFTEFZKSk7XG5cdFx0dGhpcy5maWx0ZXJTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLmFwcGx5RmlsdGVyKCksIEZJTFRFUl9ERUJPVU5DRV9ERUxBWSkpO1xuXG5cdFx0Ly8gQnJlYWRjcnVtYlxuXHRcdGNvbnN0IGJyZWFkY3J1bWJDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKCcuY2hhdC1kZWJ1Zy1icmVhZGNydW1iJykpO1xuXHRcdHRoaXMuYnJlYWRjcnVtYldpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCcmVhZGNydW1ic1dpZGdldChicmVhZGNydW1iQ29udGFpbmVyLCAzLCB1bmRlZmluZWQsIENvZGljb24uY2hldnJvblJpZ2h0LCBkZWZhdWx0QnJlYWRjcnVtYnNXaWRnZXRTdHlsZXMpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihzZXR1cEJyZWFkY3J1bWJLZXlib2FyZE5hdmlnYXRpb24oYnJlYWRjcnVtYkNvbnRhaW5lciwgdGhpcy5icmVhZGNydW1iV2lkZ2V0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5icmVhZGNydW1iV2lkZ2V0Lm9uRGlkU2VsZWN0SXRlbShlID0+IHtcblx0XHRcdGlmIChlLnR5cGUgPT09ICdzZWxlY3QnICYmIGUuaXRlbSBpbnN0YW5jZW9mIFRleHRCcmVhZGNydW1iSXRlbSkge1xuXHRcdFx0XHR0aGlzLmJyZWFkY3J1bWJXaWRnZXQuc2V0U2VsZWN0aW9uKHVuZGVmaW5lZCk7XG5cdFx0XHRcdGNvbnN0IGlkeCA9IHRoaXMuYnJlYWRjcnVtYldpZGdldC5nZXRJdGVtcygpLmluZGV4T2YoZS5pdGVtKTtcblx0XHRcdFx0aWYgKGlkeCA9PT0gMCkge1xuXHRcdFx0XHRcdHRoaXMuX29uTmF2aWdhdGUuZmlyZShXaXJlTG9nTmF2aWdhdGlvbi5Ib21lKTtcblx0XHRcdFx0fSBlbHNlIGlmIChpZHggPT09IDEpIHtcblx0XHRcdFx0XHR0aGlzLl9vbk5hdmlnYXRlLmZpcmUoV2lyZUxvZ05hdmlnYXRpb24uT3ZlcnZpZXcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSGludCBzaG93biB3aGVuIHdpcmUgbG9nZ2luZyBpcyBkaXNhYmxlZC5cblx0XHR0aGlzLmhpbnRCYXIgPSBET00uYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKCcuY2hhdC1kZWJ1Zy13aXJlbG9nLWhpbnQnKSk7XG5cdFx0RE9NLmhpZGUodGhpcy5oaW50QmFyKTtcblxuXHRcdC8vIFRvb2xiYXI6IHNvdXJjZSBwaWNrZXIgKyBmaWx0ZXIgKyBhY3Rpb25zLlxuXHRcdHRoaXMudG9vbGJhciA9IERPTS5hcHBlbmQodGhpcy5jb250YWluZXIsICQoJy5jaGF0LWRlYnVnLXdpcmVsb2ctdG9vbGJhcicpKTtcblx0XHR0aGlzLnNlbGVjdEhvc3QgPSBET00uYXBwZW5kKHRoaXMudG9vbGJhciwgJCgnLmNoYXQtZGVidWctd2lyZWxvZy1zZWxlY3QnKSk7XG5cdFx0dGhpcy5maWx0ZXJJbnB1dCA9IERPTS5hcHBlbmQodGhpcy50b29sYmFyLCAkKCdpbnB1dC5jaGF0LWRlYnVnLXdpcmVsb2ctZmlsdGVyJykpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG5cdFx0dGhpcy5maWx0ZXJJbnB1dC50eXBlID0gJ3RleHQnO1xuXHRcdHRoaXMuZmlsdGVySW5wdXQucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnY2hhdERlYnVnLndpcmVMb2cuZmlsdGVyUGxhY2Vob2xkZXInLCBcIkZpbHRlciBieSBtZXRob2QsIHR5cGUsIG9yIGlkXCIpO1xuXHRcdHRoaXMuZmlsdGVySW5wdXQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2NoYXREZWJ1Zy53aXJlTG9nLmZpbHRlckFyaWEnLCBcIkZpbHRlciBBSFAgbG9nIGZyYW1lc1wiKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmZpbHRlcklucHV0LCBET00uRXZlbnRUeXBlLklOUFVULCAoKSA9PiB7XG5cdFx0XHQvLyBEZWJvdW5jZSBzbyBlYWNoIGtleXN0cm9rZSBkb2VzIG5vdCB0cmlnZ2VyIGEgZnVsbCBzeW5jaHJvbm91c1xuXHRcdFx0Ly8gcmVidWlsZCBvZiB0aGUgbGlzdCwgd2hpY2gga2VlcHMgdHlwaW5nIHJlc3BvbnNpdmUuXG5cdFx0XHR0aGlzLmZpbHRlclNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFN1bW1hcnkgY2hpcHMuXG5cdFx0dGhpcy5zdW1tYXJ5ID0gRE9NLmFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnLmNoYXQtZGVidWctd2lyZWxvZy1zdW1tYXJ5JykpO1xuXHRcdERPTS5oaWRlKHRoaXMuc3VtbWFyeSk7XG5cblx0XHQvLyBCb2R5OiBzY3JvbGxhYmxlIGxpc3Qgb2YgZnJhbWVzLlxuXHRcdHRoaXMuYm9keSA9IERPTS5hcHBlbmQodGhpcy5jb250YWluZXIsICQoJy5jaGF0LWRlYnVnLXdpcmVsb2ctYm9keScpKTtcblx0XHR0aGlzLmxpc3QgPSAkKCcuY2hhdC1kZWJ1Zy13aXJlbG9nLWxpc3QnKTtcblx0XHR0aGlzLnNjcm9sbGFibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQodGhpcy5saXN0LCB7XG5cdFx0XHRob3Jpem9udGFsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG8sXG5cdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRcdH0pKTtcblx0XHRET00uYXBwZW5kKHRoaXMuYm9keSwgdGhpcy5zY3JvbGxhYmxlLmdldERvbU5vZGUoKSk7XG5cblx0XHQvLyBcIkxvYWQgbW9yZVwiIGFmZm9yZGFuY2Ugc2hvd24gd2hlbiBmcmFtZXMgYXJlIHBhZ2luYXRlZC5cblx0XHR0aGlzLmxvYWRNb3JlQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnLmNoYXQtZGVidWctd2lyZWxvZy1sb2FkbW9yZScpKTtcblx0XHRET00uaGlkZSh0aGlzLmxvYWRNb3JlQ29udGFpbmVyKTtcblxuXHRcdHRoaXMuZm9vdGVyID0gRE9NLmFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnLmNoYXQtZGVidWctd2lyZWxvZy1mb290ZXInKSk7XG5cdH1cblxuXHRzZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5jdXJyZW50U2Vzc2lvblJlc291cmNlID0gc2Vzc2lvblJlc291cmNlO1xuXHRcdHRoaXMuc2VsZWN0ZWRTb3VyY2VJZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnZpc2libGVMaW1pdCA9IFBBR0VfU0laRTtcblx0fVxuXG5cdHNob3coKTogdm9pZCB7XG5cdFx0RE9NLnNob3codGhpcy5jb250YWluZXIpO1xuXHRcdHRoaXMubG9hZCgpO1xuXHR9XG5cblx0aGlkZSgpOiB2b2lkIHtcblx0XHRET00uaGlkZSh0aGlzLmNvbnRhaW5lcik7XG5cdFx0dGhpcy5yZWZyZXNoU2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdHRoaXMuZmlsdGVyU2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdHRoaXMubGl2ZVdhdGNoLmNsZWFyKCk7XG5cdH1cblxuXHRyZWZyZXNoKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ICE9PSAnbm9uZScgJiYgIXRoaXMucmVmcmVzaFNjaGVkdWxlci5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHR0aGlzLnJlZnJlc2hTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHR9XG5cdH1cblxuXHR1cGRhdGVCcmVhZGNydW1iKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jdXJyZW50U2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25UaXRsZSA9IHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvblRpdGxlKHRoaXMuY3VycmVudFNlc3Npb25SZXNvdXJjZSkgfHwgTG9jYWxDaGF0U2Vzc2lvblVyaS5wYXJzZUxvY2FsU2Vzc2lvbklkKHRoaXMuY3VycmVudFNlc3Npb25SZXNvdXJjZSkgfHwgdGhpcy5jdXJyZW50U2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0dGhpcy5icmVhZGNydW1iV2lkZ2V0LnNldEl0ZW1zKFtcblx0XHRcdG5ldyBUZXh0QnJlYWRjcnVtYkl0ZW0obG9jYWxpemUoJ2NoYXREZWJ1Zy50aXRsZScsIFwiQWdlbnQgRGVidWcgTG9nc1wiKSwgdHJ1ZSksXG5cdFx0XHRuZXcgVGV4dEJyZWFkY3J1bWJJdGVtKHNlc3Npb25UaXRsZSwgdHJ1ZSksXG5cdFx0XHRuZXcgVGV4dEJyZWFkY3J1bWJJdGVtKGxvY2FsaXplKCdjaGF0RGVidWcuYWhwTG9nJywgXCJBSFAgTG9nXCIpKSxcblx0XHRdKTtcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuc2VsZWN0Qm94Py5mb2N1cygpO1xuXHR9XG5cblx0bGF5b3V0KCk6IHZvaWQge1xuXHRcdC8vIEdpdmUgdGhlIHNjcm9sbGFibGUgY29udGVudCBhbiBleHBsaWNpdCBoZWlnaHQgc28gdGhlIGxpc3QgY2FuXG5cdFx0Ly8gb3ZlcmZsb3cgKGFuZCB0aHVzIHNjcm9sbCkgaW5zdGVhZCBvZiBncm93aW5nIHRoZSB3aG9sZSB2aWV3LiBUaGVcblx0XHQvLyBib2R5IGlzIHRoZSBmbGV4LXNpemVkIHJlZ2lvbiBiZXR3ZWVuIHRoZSB0b29sYmFyL3N1bW1hcnkgYW5kIHRoZVxuXHRcdC8vIGZvb3Rlci5cblx0XHRjb25zdCBoZWlnaHQgPSB0aGlzLmJvZHkuY2xpZW50SGVpZ2h0O1xuXHRcdGlmIChoZWlnaHQgPiAwKSB7XG5cdFx0XHR0aGlzLmxpc3Quc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblx0XHR9XG5cdFx0dGhpcy5zY3JvbGxhYmxlLnNjYW5Eb21Ob2RlKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldCBsb2dTb3VyY2VTZXJ2aWNlcygpOiBJQWdlbnRIb3N0TG9nU291cmNlU2VydmljZXMge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwYXRoU2VydmljZTogdGhpcy5wYXRoU2VydmljZSxcblx0XHRcdGFnZW50SG9zdFNlcnZpY2U6IHRoaXMuYWdlbnRIb3N0U2VydmljZSxcblx0XHRcdHJlbW90ZUFnZW50SG9zdFNlcnZpY2U6IHRoaXMucmVtb3RlQWdlbnRIb3N0U2VydmljZSxcblx0XHRcdG91dHB1dFNlcnZpY2U6IHRoaXMub3V0cHV0U2VydmljZSxcblx0XHRcdGZpbGVTZXJ2aWNlOiB0aGlzLmZpbGVTZXJ2aWNlLFxuXHRcdFx0dGV4dE1vZGVsU2VydmljZTogdGhpcy50ZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRlbnZpcm9ubWVudFNlcnZpY2U6IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdFx0cHJvZHVjdFNlcnZpY2U6IHRoaXMucHJvZHVjdFNlcnZpY2UsXG5cdFx0XHRsb2dTZXJ2aWNlOiB0aGlzLmxvZ1NlcnZpY2UsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbG9hZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnVwZGF0ZUJyZWFkY3J1bWIoKTtcblx0XHR0aGlzLmhlYWRlckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5saXZlV2F0Y2guY2xlYXIoKTtcblx0XHRET00uY2xlYXJOb2RlKHRoaXMuc2VsZWN0SG9zdCk7XG5cdFx0dGhpcy5zZWxlY3RCb3ggPSB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCB3aXJlTG9nZ2luZ0VuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KEFnZW50SG9zdEFocEpzb25sTG9nZ2luZ1NldHRpbmdJZCk7XG5cdFx0RE9NLmNsZWFyTm9kZSh0aGlzLmhpbnRCYXIpO1xuXHRcdGlmICghd2lyZUxvZ2dpbmdFbmFibGVkKSB7XG5cdFx0XHRET00uc2hvdyh0aGlzLmhpbnRCYXIpO1xuXHRcdFx0RE9NLmFwcGVuZCh0aGlzLmhpbnRCYXIsICQoYHNwYW4ke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKENvZGljb24uaW5mbyl9YCkpO1xuXHRcdFx0RE9NLmFwcGVuZCh0aGlzLmhpbnRCYXIsICQoJ3NwYW4nLCB1bmRlZmluZWQsIGxvY2FsaXplKCdjaGF0RGVidWcud2lyZUxvZy5kaXNhYmxlZEhpbnQnLCBcIkFIUCBsb2dnaW5nIGlzIGRpc2FibGVkIFx1MjAxNCBlbmFibGUgezB9IGFuZCByZXByb2R1Y2UgdG8gY2FwdHVyZSBjbGllbnRcdTIxOTRob3N0IHByb3RvY29sIGZyYW1lcy5cIiwgQWdlbnRIb3N0QWhwSnNvbmxMb2dnaW5nU2V0dGluZ0lkKSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRET00uaGlkZSh0aGlzLmhpbnRCYXIpO1xuXHRcdH1cblxuXHRcdGlmICghaXNBZ2VudEhvc3RTZXNzaW9uKHRoaXMuY3VycmVudFNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdHRoaXMucmVuZGVyTWVzc2FnZShsb2NhbGl6ZSgnY2hhdERlYnVnLndpcmVMb2cubm90QWdlbnRIb3N0JywgXCJUaGUgQUhQIExvZyBpcyBhdmFpbGFibGUgZm9yIEFnZW50IEhvc3Qgc2Vzc2lvbnMuXCIpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhbGxTb3VyY2VzID0gYXdhaXQgZW51bWVyYXRlQWdlbnRIb3N0TG9nU291cmNlcyh0aGlzLmxvZ1NvdXJjZVNlcnZpY2VzLCB0aGlzLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHRoaXMuc291cmNlcyA9IGFsbFNvdXJjZXMuZmlsdGVyKHNvdXJjZSA9PiBzb3VyY2Uua2luZCA9PT0gQWdlbnRIb3N0TG9nU291cmNlS2luZC5XaXJlTG9nKTtcblx0XHRpZiAodGhpcy5zb3VyY2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5yZW5kZXJNZXNzYWdlKHdpcmVMb2dnaW5nRW5hYmxlZFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0RGVidWcud2lyZUxvZy5ub0ZyYW1lcycsIFwiTm8gQUhQIGxvZyB3YXMgZm91bmQgeWV0IGZvciB0aGlzIHNlc3Npb24uIEludGVyYWN0IHdpdGggdGhlIGFnZW50IHRvIGNhcHR1cmUgcHJvdG9jb2wgZnJhbWVzLlwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0RGVidWcud2lyZUxvZy5lbmFibGVUb0NhcHR1cmUnLCBcIk5vIEFIUCBsb2cgaXMgYXZhaWxhYmxlLiBFbmFibGUgezB9IGFuZCByZXByb2R1Y2UgdGhlIGlzc3VlIHRvIGNhcHR1cmUgcHJvdG9jb2wgZnJhbWVzLlwiLCBBZ2VudEhvc3RBaHBKc29ubExvZ2dpbmdTZXR0aW5nSWQpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTb3VyY2UgcGlja2VyIChvbmx5IHdoZW4gbW9yZSB0aGFuIG9uZSByb3RhdGVkIHdpcmUgbG9nIGV4aXN0cykuXG5cdFx0aWYgKHRoaXMuc291cmNlcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRET00uc2hvdyh0aGlzLnNlbGVjdEhvc3QpO1xuXHRcdFx0Y29uc3Qgb3B0aW9uczogSVNlbGVjdE9wdGlvbkl0ZW1bXSA9IHRoaXMuc291cmNlcy5tYXAoc291cmNlID0+ICh7IHRleHQ6IHNvdXJjZS5sYWJlbCB9KSk7XG5cdFx0XHRsZXQgc2VsZWN0ZWRJbmRleCA9IHRoaXMuc291cmNlcy5maW5kSW5kZXgoc291cmNlID0+IHNvdXJjZS5pZCA9PT0gdGhpcy5zZWxlY3RlZFNvdXJjZUlkKTtcblx0XHRcdGlmIChzZWxlY3RlZEluZGV4IDwgMCkge1xuXHRcdFx0XHRzZWxlY3RlZEluZGV4ID0gMDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNlbGVjdEJveCA9IHRoaXMuaGVhZGVyRGlzcG9zYWJsZXMuYWRkKG5ldyBTZWxlY3RCb3gob3B0aW9ucywgc2VsZWN0ZWRJbmRleCwgdGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsIGRlZmF1bHRTZWxlY3RCb3hTdHlsZXMsIHtcblx0XHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnY2hhdERlYnVnLndpcmVMb2cuc291cmNlTGFiZWwnLCBcIkFIUCBsb2cgZmlsZVwiKSxcblx0XHRcdH0pKTtcblx0XHRcdHNlbGVjdEJveC5yZW5kZXIodGhpcy5zZWxlY3RIb3N0KTtcblx0XHRcdHRoaXMuaGVhZGVyRGlzcG9zYWJsZXMuYWRkKHNlbGVjdEJveC5vbkRpZFNlbGVjdChlID0+IHRoaXMubG9hZFNvdXJjZShlLmluZGV4KSkpO1xuXHRcdFx0dGhpcy5zZWxlY3RCb3ggPSBzZWxlY3RCb3g7XG5cdFx0fSBlbHNlIHtcblx0XHRcdERPTS5oaWRlKHRoaXMuc2VsZWN0SG9zdCk7XG5cdFx0fVxuXG5cdFx0Ly8gQWN0aW9ucy5cblx0XHRjb25zdCBvcGVuQnRuID0gdGhpcy5oZWFkZXJEaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbih0aGlzLnRvb2xiYXIsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlLCBzdXBwb3J0SWNvbnM6IHRydWUsIHRpdGxlOiBsb2NhbGl6ZSgnY2hhdERlYnVnLndpcmVMb2cub3BlbkZpbGUnLCBcIk9wZW4gRnVsbCBGaWxlXCIpIH0pKTtcblx0XHRvcGVuQnRuLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC1kZWJ1Zy13aXJlbG9nLWFjdGlvbicpO1xuXHRcdG9wZW5CdG4ubGFiZWwgPSBgJChnby10by1maWxlKSAke2xvY2FsaXplKCdjaGF0RGVidWcud2lyZUxvZy5vcGVuRmlsZScsIFwiT3BlbiBGdWxsIEZpbGVcIil9YDtcblx0XHR0aGlzLmhlYWRlckRpc3Bvc2FibGVzLmFkZChvcGVuQnRuLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5vcGVuQ3VycmVudEZpbGUoKSkpO1xuXG5cdFx0Y29uc3QgcmVmcmVzaEJ0biA9IHRoaXMuaGVhZGVyRGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24odGhpcy50b29sYmFyLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSwgc3VwcG9ydEljb25zOiB0cnVlLCB0aXRsZTogbG9jYWxpemUoJ2NoYXREZWJ1Zy53aXJlTG9nLnJlZnJlc2gnLCBcIlJlZnJlc2hcIikgfSkpO1xuXHRcdHJlZnJlc2hCdG4uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LWRlYnVnLXdpcmVsb2ctYWN0aW9uJyk7XG5cdFx0cmVmcmVzaEJ0bi5sYWJlbCA9IGAkKHJlZnJlc2gpICR7bG9jYWxpemUoJ2NoYXREZWJ1Zy53aXJlTG9nLnJlZnJlc2gnLCBcIlJlZnJlc2hcIil9YDtcblx0XHR0aGlzLmhlYWRlckRpc3Bvc2FibGVzLmFkZChyZWZyZXNoQnRuLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5yZWxvYWRDdXJyZW50U291cmNlKCkpKTtcblxuXHRcdGxldCBzZWxlY3RlZEluZGV4ID0gdGhpcy5zb3VyY2VzLmZpbmRJbmRleChzb3VyY2UgPT4gc291cmNlLmlkID09PSB0aGlzLnNlbGVjdGVkU291cmNlSWQpO1xuXHRcdGlmIChzZWxlY3RlZEluZGV4IDwgMCkge1xuXHRcdFx0c2VsZWN0ZWRJbmRleCA9IDA7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMubG9hZFNvdXJjZShzZWxlY3RlZEluZGV4KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbG9hZFNvdXJjZShpbmRleDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc291cmNlID0gdGhpcy5zb3VyY2VzW2luZGV4XTtcblx0XHRpZiAoIXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnNlbGVjdGVkU291cmNlSWQgPSBzb3VyY2UuaWQ7XG5cdFx0dGhpcy5saXZlV2F0Y2guY2xlYXIoKTtcblx0XHR0aGlzLmN1cnJlbnRGaWxlUmVzb3VyY2UgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy52aXNpYmxlTGltaXQgPSBQQUdFX1NJWkU7XG5cblx0XHRjb25zdCBnZW5lcmF0aW9uID0gKyt0aGlzLmxvYWRHZW5lcmF0aW9uO1xuXHRcdHRoaXMucmVuZGVyTWVzc2FnZShsb2NhbGl6ZSgnY2hhdERlYnVnLndpcmVMb2cubG9hZGluZycsIFwiTG9hZGluZ1x1MjAyNlwiKSk7XG5cblx0XHRsZXQgY29udGVudDtcblx0XHR0cnkge1xuXHRcdFx0Y29udGVudCA9IGF3YWl0IHJlYWRBZ2VudEhvc3RMb2dTb3VyY2VDb250ZW50KHNvdXJjZSwgdGhpcy5sb2dTb3VyY2VTZXJ2aWNlcyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChnZW5lcmF0aW9uICE9PSB0aGlzLmxvYWRHZW5lcmF0aW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMucmVuZGVyTWVzc2FnZShsb2NhbGl6ZSgnY2hhdERlYnVnLndpcmVMb2cuZXJyb3InLCBcIkZhaWxlZCB0byByZWFkIEFIUCBsb2c6IHswfVwiLCBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcikpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGdlbmVyYXRpb24gIT09IHRoaXMubG9hZEdlbmVyYXRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIWNvbnRlbnQpIHtcblx0XHRcdHRoaXMucmVuZGVyTWVzc2FnZShsb2NhbGl6ZSgnY2hhdERlYnVnLndpcmVMb2cudW5hdmFpbGFibGUnLCBcIlRoaXMgQUhQIGxvZyBpcyB1bmF2YWlsYWJsZS5cIikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuY3VycmVudEZpbGVSZXNvdXJjZSA9IGNvbnRlbnQuZmlsZVJlc291cmNlO1xuXHRcdHRoaXMuZW50cmllcyA9IGJ1aWxkV2lyZUVudHJpZXMocGFyc2VXaXJlRnJhbWVzKGNvbnRlbnQudGV4dCkpO1xuXHRcdHRoaXMucmVuZGVyTGlzdCgpO1xuXHRcdHRoaXMucmVuZGVyRm9vdGVyKHNvdXJjZSwgY29udGVudC50cnVuY2F0ZWQpO1xuXHRcdHRoaXMuc2V0dXBMaXZlV2F0Y2goc291cmNlKTtcblx0fVxuXG5cdHByaXZhdGUgcmVsb2FkQ3VycmVudFNvdXJjZSgpOiB2b2lkIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuc291cmNlcy5maW5kSW5kZXgoc291cmNlID0+IHNvdXJjZS5pZCA9PT0gdGhpcy5zZWxlY3RlZFNvdXJjZUlkKTtcblx0XHRpZiAoaW5kZXggPj0gMCkge1xuXHRcdFx0dGhpcy5sb2FkU291cmNlKGluZGV4KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNldHVwTGl2ZVdhdGNoKHNvdXJjZTogSUFnZW50SG9zdExvZ1NvdXJjZSk6IHZvaWQge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGlmIChzb3VyY2UucmVzb3VyY2U/LnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRjb25zdCB3YXRjaGVyID0gc3RvcmUuYWRkKHRoaXMuZmlsZVNlcnZpY2UuY3JlYXRlV2F0Y2hlcihzb3VyY2UucmVzb3VyY2UsIHsgcmVjdXJzaXZlOiBmYWxzZSwgZXhjbHVkZXM6IFtdIH0pKTtcblx0XHRcdHN0b3JlLmFkZCh3YXRjaGVyLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMucmVmcmVzaCgpKSk7XG5cdFx0fVxuXHRcdHRoaXMubGl2ZVdhdGNoLnZhbHVlID0gc3RvcmU7XG5cdH1cblxuXHRwcml2YXRlIG9wZW5DdXJyZW50RmlsZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jdXJyZW50RmlsZVJlc291cmNlKSB7XG5cdFx0XHR0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiB0aGlzLmN1cnJlbnRGaWxlUmVzb3VyY2UsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJNZXNzYWdlKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5yb3dFbGVtZW50cyA9IFtdO1xuXHRcdHRoaXMucm93U3RvcmVzID0gW107XG5cdFx0dGhpcy5yZW5kZXJlZFZpc2libGUgPSBbXTtcblx0XHR0aGlzLmxpc3RTaG93aW5nTWVzc2FnZSA9IHRydWU7XG5cdFx0RE9NLmhpZGUodGhpcy5zdW1tYXJ5KTtcblx0XHRET00uY2xlYXJOb2RlKHRoaXMubGlzdCk7XG5cdFx0dGhpcy5saXN0LmNsYXNzTGlzdC5hZGQoJ2NoYXQtZGVidWctd2lyZWxvZy1tZXNzYWdlJyk7XG5cdFx0dGhpcy5saXN0LnRleHRDb250ZW50ID0gbWVzc2FnZTtcblx0XHR0aGlzLnNjcm9sbGFibGUuc2NhbkRvbU5vZGUoKTtcblx0XHRET00uY2xlYXJOb2RlKHRoaXMuZm9vdGVyKTtcblx0XHRpZiAodGhpcy5sb2FkTW9yZVZpc2libGUpIHtcblx0XHRcdERPTS5oaWRlKHRoaXMubG9hZE1vcmVDb250YWluZXIpO1xuXHRcdFx0dGhpcy5sb2FkTW9yZVZpc2libGUgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclN1bW1hcnkoKTogdm9pZCB7XG5cdFx0RE9NLmNsZWFyTm9kZSh0aGlzLnN1bW1hcnkpO1xuXHRcdGxldCByZXF1ZXN0cyA9IDA7XG5cdFx0bGV0IGVycm9ycyA9IDA7XG5cdFx0bGV0IHBlbmRpbmcgPSAwO1xuXHRcdGxldCBsb25nZXN0ID0gMDtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuZW50cmllcykge1xuXHRcdFx0aWYgKGVudHJ5LmZyYW1lLmtpbmQgPT09ICdyZXF1ZXN0Jykge1xuXHRcdFx0XHRyZXF1ZXN0cysrO1xuXHRcdFx0XHRpZiAoIWVudHJ5LnJlc3BvbnNlKSB7XG5cdFx0XHRcdFx0cGVuZGluZysrO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGR1cmF0aW9uID0gZW50cnkucmVzcG9uc2UudHMgLSBlbnRyeS5mcmFtZS50cztcblx0XHRcdFx0XHRpZiAoZHVyYXRpb24gPiBsb25nZXN0KSB7XG5cdFx0XHRcdFx0XHRsb25nZXN0ID0gZHVyYXRpb247XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNFcnJvckVudHJ5KGVudHJ5KSkge1xuXHRcdFx0XHRlcnJvcnMrKztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRET00uc2hvdyh0aGlzLnN1bW1hcnkpO1xuXHRcdHRoaXMuYXBwZW5kQ2hpcChsb2NhbGl6ZSgnY2hhdERlYnVnLndpcmVMb2cuY2hpcC5mcmFtZXMnLCBcInswfSBmcmFtZXNcIiwgdGhpcy5lbnRyaWVzLmxlbmd0aCkpO1xuXHRcdHRoaXMuYXBwZW5kQ2hpcChsb2NhbGl6ZSgnY2hhdERlYnVnLndpcmVMb2cuY2hpcC5yZXF1ZXN0cycsIFwiezB9IHJlcXVlc3RzXCIsIHJlcXVlc3RzKSk7XG5cdFx0aWYgKGVycm9ycyA+IDApIHtcblx0XHRcdHRoaXMuYXBwZW5kQ2hpcChsb2NhbGl6ZSgnY2hhdERlYnVnLndpcmVMb2cuY2hpcC5lcnJvcnMnLCBcInswfSBlcnJvcnNcIiwgZXJyb3JzKSwgJ2Vycm9yJyk7XG5cdFx0fVxuXHRcdGlmIChwZW5kaW5nID4gMCkge1xuXHRcdFx0dGhpcy5hcHBlbmRDaGlwKGxvY2FsaXplKCdjaGF0RGVidWcud2lyZUxvZy5jaGlwLnBlbmRpbmcnLCBcInswfSBwZW5kaW5nXCIsIHBlbmRpbmcpLCAncGVuZGluZycpO1xuXHRcdH1cblx0XHRpZiAobG9uZ2VzdCA+IDApIHtcblx0XHRcdHRoaXMuYXBwZW5kQ2hpcChsb2NhbGl6ZSgnY2hhdERlYnVnLndpcmVMb2cuY2hpcC5zbG93ZXN0JywgXCJzbG93ZXN0IHswfVwiLCBmb3JtYXREdXJhdGlvbihsb25nZXN0KSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXBwZW5kQ2hpcCh0ZXh0OiBzdHJpbmcsIHRvbmU/OiAnZXJyb3InIHwgJ3BlbmRpbmcnKTogdm9pZCB7XG5cdFx0Y29uc3QgY2hpcCA9IERPTS5hcHBlbmQodGhpcy5zdW1tYXJ5LCAkKCdzcGFuLmNoYXQtZGVidWctd2lyZWxvZy1jaGlwJywgdW5kZWZpbmVkLCB0ZXh0KSk7XG5cdFx0aWYgKHRvbmUpIHtcblx0XHRcdGNoaXAuY2xhc3NMaXN0LmFkZChgY2hhdC1kZWJ1Zy13aXJlbG9nLWNoaXAtJHt0b25lfWApO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBsaWVzIHRoZSBjdXJyZW50IGZpbHRlciBib3ggdmFsdWUgYW5kIHJlLXJlbmRlcnMgdGhlIGxpc3QuIEludm9rZWRcblx0ICogKGRlYm91bmNlZCkgZnJvbSB0aGUgZmlsdGVyIGlucHV0J3MgSU5QVVQgaGFuZGxlcjsgc2tpcHMgd29yayB3aGVuIHRoZVxuXHQgKiBlZmZlY3RpdmUgZmlsdGVyIHRleHQgaGFzIG5vdCBjaGFuZ2VkLlxuXHQgKi9cblx0cHJpdmF0ZSBhcHBseUZpbHRlcigpOiB2b2lkIHtcblx0XHRjb25zdCBuZXh0ID0gdGhpcy5maWx0ZXJJbnB1dC52YWx1ZS50cmltKCkudG9Mb3dlckNhc2UoKTtcblx0XHRpZiAobmV4dCA9PT0gdGhpcy5maWx0ZXJUZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuZmlsdGVyVGV4dCA9IG5leHQ7XG5cdFx0dGhpcy52aXNpYmxlTGltaXQgPSBQQUdFX1NJWkU7XG5cdFx0dGhpcy5yZW5kZXJMaXN0KCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckxpc3QoKTogdm9pZCB7XG5cdFx0Ly8gRGlzcG9zZSB0aGUgcHJldmlvdXMgcm93cycgc3RvcmVzIChjbGljayBsaXN0ZW5lcnMgZXRjLikgYmVmb3JlXG5cdFx0Ly8gY2xlYXJpbmcgYW5kIHJlYnVpbGRpbmc7IG90aGVyd2lzZSB0aGV5IGFjY3VtdWxhdGUgb24gZXZlcnkgZmlsdGVyXG5cdFx0Ly8gY2hhbmdlLCBcIkxvYWQgbW9yZVwiLCBvciBmdWxsIGxpdmUgcmVmcmVzaC5cblx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdERPTS5jbGVhck5vZGUodGhpcy5saXN0KTtcblx0XHR0aGlzLnJvd0VsZW1lbnRzID0gW107XG5cdFx0dGhpcy5yb3dTdG9yZXMgPSBbXTtcblx0XHR0aGlzLnJlbmRlcmVkVmlzaWJsZSA9IFtdO1xuXHRcdHRoaXMubGlzdFNob3dpbmdNZXNzYWdlID0gZmFsc2U7XG5cblx0XHRpZiAodGhpcy5lbnRyaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5yZW5kZXJNZXNzYWdlKGxvY2FsaXplKCdjaGF0RGVidWcud2lyZUxvZy5lbXB0eScsIFwiVGhlIEFIUCBsb2cgaXMgZW1wdHkuXCIpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnJlbmRlclN1bW1hcnkoKTtcblxuXHRcdGNvbnN0IHsgZmlsdGVyZWQsIGRpc3BsYXkgfSA9IHRoaXMuY29tcHV0ZVZpc2libGUodGhpcy5lbnRyaWVzKTtcblxuXHRcdGlmIChkaXNwbGF5Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Y29uc3QgZW1wdHkgPSBET00uYXBwZW5kKHRoaXMubGlzdCwgJCgnLmNoYXQtZGVidWctd2lyZWxvZy1ub3Jlc3VsdHMnKSk7XG5cdFx0XHRlbXB0eS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0RGVidWcud2lyZUxvZy5ub01hdGNoZXMnLCBcIk5vIGZyYW1lcyBtYXRjaCAnezB9Jy5cIiwgdGhpcy5maWx0ZXJUZXh0KTtcblx0XHRcdHRoaXMudXBkYXRlTG9hZE1vcmUoMCk7XG5cdFx0XHR0aGlzLnNjcm9sbGFibGUuc2NhbkRvbU5vZGUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGRpc3BsYXkpIHtcblx0XHRcdHRoaXMuYXBwZW5kUm93KGVudHJ5KTtcblx0XHR9XG5cdFx0dGhpcy5yZW5kZXJlZFZpc2libGUgPSBkaXNwbGF5O1xuXHRcdHRoaXMudXBkYXRlTG9hZE1vcmUoZmlsdGVyZWQubGVuZ3RoKTtcblxuXHRcdHRoaXMuc2Nyb2xsYWJsZS5zY2FuRG9tTm9kZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlLXJlYWRzIHRoZSBjdXJyZW50IHdpcmUgbG9nIGFuZCB1cGRhdGVzIHRoZSBsaXN0IGluIHBsYWNlIFx1MjAxNCBhcHBlbmRpbmdcblx0ICogbmV3bHktY2FwdHVyZWQgZnJhbWVzIGFuZCByZWZyZXNoaW5nIHJvd3Mgd2hvc2Ugc3RhdGUgY2hhbmdlZCAoZS5nLiBhXG5cdCAqIHJlc3BvbnNlIGFycml2aW5nIGZvciBhIHBlbmRpbmcgcmVxdWVzdCkgXHUyMDE0IGluc3RlYWQgb2YgcmVidWlsZGluZyB0aGVcblx0ICogd2hvbGUgdmlldy4gVXNlZCBmb3IgbGl2ZSByZWZyZXNoZXMgc28gdGhlIHBhbmVsIGRvZXMgbm90IGZsYXNoIGJhY2sgdG9cblx0ICogXCJMb2FkaW5nXHUyMDI2XCIgYW5kIGxvc2Ugc2Nyb2xsIHBvc2l0aW9uIG9uIGV2ZXJ5IHR1cm4uXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIGxpdmVSZWZyZXNoKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5zb3VyY2VzLmZpbmRJbmRleChzb3VyY2UgPT4gc291cmNlLmlkID09PSB0aGlzLnNlbGVjdGVkU291cmNlSWQpO1xuXHRcdGNvbnN0IHNvdXJjZSA9IHRoaXMuc291cmNlc1tpbmRleF07XG5cdFx0aWYgKCFzb3VyY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBnZW5lcmF0aW9uID0gKyt0aGlzLmxvYWRHZW5lcmF0aW9uO1xuXHRcdGxldCBjb250ZW50O1xuXHRcdHRyeSB7XG5cdFx0XHRjb250ZW50ID0gYXdhaXQgcmVhZEFnZW50SG9zdExvZ1NvdXJjZUNvbnRlbnQoc291cmNlLCB0aGlzLmxvZ1NvdXJjZVNlcnZpY2VzKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybjsgLy8ga2VlcCBzaG93aW5nIHRoZSBjdXJyZW50IGNvbnRlbnQgb24gYSB0cmFuc2llbnQgcmVhZCBlcnJvclxuXHRcdH1cblx0XHRpZiAoZ2VuZXJhdGlvbiAhPT0gdGhpcy5sb2FkR2VuZXJhdGlvbiB8fCAhY29udGVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuY3VycmVudEZpbGVSZXNvdXJjZSA9IGNvbnRlbnQuZmlsZVJlc291cmNlO1xuXHRcdHRoaXMuYXBwbHlFbnRyaWVzKGJ1aWxkV2lyZUVudHJpZXMocGFyc2VXaXJlRnJhbWVzKGNvbnRlbnQudGV4dCkpKTtcblx0XHR0aGlzLnJlbmRlckZvb3Rlcihzb3VyY2UsIGNvbnRlbnQudHJ1bmNhdGVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBsaWVzIGEgZnJlc2hseS1wYXJzZWQgc2V0IG9mIGVudHJpZXMgdG8gdGhlIGxpc3QuIFdoZW4gdGhlIHByZXZpb3VzbHlcblx0ICogcmVuZGVyZWQgcm93cyBhcmUgc3RpbGwgYSBwcmVmaXggb2YgdGhlIG5ldyAoZmlsdGVyZWQpIHNldCwgb25seSB0aGVcblx0ICogY2hhbmdlZCBhbmQgbmV3bHktYXBwZW5kZWQgcm93cyBhcmUgdG91Y2hlZDsgb3RoZXJ3aXNlIGEgZnVsbCByZW5kZXIgaXNcblx0ICogcGVyZm9ybWVkIChlLmcuIGFmdGVyIGEgZmlsdGVyIGNoYW5nZSBvciBsb2cgcm90YXRpb24pLlxuXHQgKi9cblx0cHJpdmF0ZSBhcHBseUVudHJpZXMobmV3RW50cmllczogSVdpcmVFbnRyeVtdKTogdm9pZCB7XG5cdFx0Y29uc3QgeyBmaWx0ZXJlZCwgZGlzcGxheSB9ID0gdGhpcy5jb21wdXRlVmlzaWJsZShuZXdFbnRyaWVzKTtcblxuXHRcdGNvbnN0IGNhblJlY29uY2lsZSA9ICF0aGlzLmxpc3RTaG93aW5nTWVzc2FnZVxuXHRcdFx0JiYgdGhpcy5yZW5kZXJlZFZpc2libGUubGVuZ3RoID4gMFxuXHRcdFx0JiYgZGlzcGxheS5sZW5ndGggPj0gdGhpcy5yZW5kZXJlZFZpc2libGUubGVuZ3RoXG5cdFx0XHQmJiB0aGlzLnJlbmRlcmVkVmlzaWJsZS5ldmVyeSgoZW50cnksIGkpID0+IGJhc2VFbnRyeUtleShlbnRyeSkgPT09IGJhc2VFbnRyeUtleShkaXNwbGF5W2ldKSk7XG5cblx0XHR0aGlzLmVudHJpZXMgPSBuZXdFbnRyaWVzO1xuXG5cdFx0aWYgKCFjYW5SZWNvbmNpbGUpIHtcblx0XHRcdHRoaXMucmVuZGVyTGlzdCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdhc0F0Qm90dG9tID0gdGhpcy5pc1Njcm9sbGVkVG9Cb3R0b20oKTtcblxuXHRcdC8vIFN1bW1hcnkgY2hpcHMgbGl2ZSBvdXRzaWRlIHRoZSBzY3JvbGwgbGlzdDsgY2hlYXAgdG8gcmVidWlsZC5cblx0XHR0aGlzLnJlbmRlclN1bW1hcnkoKTtcblxuXHRcdC8vIFJlZnJlc2ggcm93cyB3aG9zZSBzdGF0ZSBjaGFuZ2VkIChlLmcuIGEgcmVzcG9uc2UgYXJyaXZlZCkuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnJlbmRlcmVkVmlzaWJsZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKGVudHJ5U3RhdGVLZXkodGhpcy5yZW5kZXJlZFZpc2libGVbaV0pICE9PSBlbnRyeVN0YXRlS2V5KGRpc3BsYXlbaV0pKSB7XG5cdFx0XHRcdHRoaXMucmVwbGFjZVJvdyhpLCBkaXNwbGF5W2ldKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBcHBlbmQgcm93cyBmb3IgbmV3bHktY2FwdHVyZWQgZnJhbWVzICh1cCB0byB0aGUgY3VycmVudCBwYWdlIGxpbWl0KS5cblx0XHRmb3IgKGxldCBpID0gdGhpcy5yZW5kZXJlZFZpc2libGUubGVuZ3RoOyBpIDwgZGlzcGxheS5sZW5ndGg7IGkrKykge1xuXHRcdFx0dGhpcy5hcHBlbmRSb3coZGlzcGxheVtpXSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW5kZXJlZFZpc2libGUgPSBkaXNwbGF5O1xuXHRcdHRoaXMudXBkYXRlTG9hZE1vcmUoZmlsdGVyZWQubGVuZ3RoKTtcblx0XHR0aGlzLnNjcm9sbGFibGUuc2NhbkRvbU5vZGUoKTtcblx0XHRpZiAod2FzQXRCb3R0b20pIHtcblx0XHRcdHRoaXMuc2Nyb2xsVG9Cb3R0b20oKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ29tcHV0ZXMgdGhlIGZpbHRlcmVkIGVudHJpZXMgYW5kIHRoZSAocGFnaW5hdGVkKSBzdWJzZXQgY3VycmVudGx5XG5cdCAqIGRpc3BsYXllZC4gT25seSB0aGUgZmlyc3Qge0BsaW5rIHZpc2libGVMaW1pdH0gbWF0Y2hpbmcgZnJhbWVzIGFyZSBzaG93bjtcblx0ICogdGhlIHJlc3QgYXJlIHJldmVhbGVkIHZpYSB0aGUgXCJMb2FkIG1vcmVcIiBidXR0b24uXG5cdCAqL1xuXHRwcml2YXRlIGNvbXB1dGVWaXNpYmxlKGVudHJpZXM6IElXaXJlRW50cnlbXSk6IHsgZmlsdGVyZWQ6IElXaXJlRW50cnlbXTsgZGlzcGxheTogSVdpcmVFbnRyeVtdIH0ge1xuXHRcdGNvbnN0IGZpbHRlciA9IHRoaXMuZmlsdGVyVGV4dDtcblx0XHRjb25zdCBmaWx0ZXJlZCA9IGZpbHRlciA/IGVudHJpZXMuZmlsdGVyKGVudHJ5ID0+IG1hdGNoZXNGaWx0ZXIoZW50cnksIGZpbHRlcikpIDogZW50cmllcztcblx0XHRjb25zdCBkaXNwbGF5ID0gZmlsdGVyZWQubGVuZ3RoID4gdGhpcy52aXNpYmxlTGltaXQgPyBmaWx0ZXJlZC5zbGljZSgwLCB0aGlzLnZpc2libGVMaW1pdCkgOiBmaWx0ZXJlZDtcblx0XHRyZXR1cm4geyBmaWx0ZXJlZCwgZGlzcGxheSB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFNob3dzIG9yIGhpZGVzIHRoZSBcIkxvYWQgbW9yZVwiIGFmZm9yZGFuY2UgYW5kIHVwZGF0ZXMgaXRzIHN0YXR1cyBsYWJlbC5cblx0ICovXG5cdHByaXZhdGUgdXBkYXRlTG9hZE1vcmUodG90YWxGaWx0ZXJlZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRvdGFsRmlsdGVyZWQgPD0gdGhpcy52aXNpYmxlTGltaXQpIHtcblx0XHRcdGlmICh0aGlzLmxvYWRNb3JlVmlzaWJsZSkge1xuXHRcdFx0XHRET00uaGlkZSh0aGlzLmxvYWRNb3JlQ29udGFpbmVyKTtcblx0XHRcdFx0dGhpcy5sb2FkTW9yZVZpc2libGUgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5sYXlvdXQoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMubG9hZE1vcmVTdGF0dXMpIHtcblx0XHRcdHRoaXMubG9hZE1vcmVTdGF0dXMgPSBET00uYXBwZW5kKHRoaXMubG9hZE1vcmVDb250YWluZXIsICQoJ3NwYW4uY2hhdC1kZWJ1Zy13aXJlbG9nLWxvYWRtb3JlLXN0YXR1cycpKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmxvYWRNb3JlQnRuKSB7XG5cdFx0XHR0aGlzLmxvYWRNb3JlQnRuID0gdGhpcy5sb2FkTW9yZURpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKHRoaXMubG9hZE1vcmVDb250YWluZXIsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlLCB0aXRsZTogbG9jYWxpemUoJ2NoYXREZWJ1Zy53aXJlTG9nLmxvYWRNb3JlVGl0bGUnLCBcIkxvYWQgbW9yZSBmcmFtZXNcIikgfSkpO1xuXHRcdFx0dGhpcy5sb2FkTW9yZURpc3Bvc2FibGVzLmFkZCh0aGlzLmxvYWRNb3JlQnRuLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnZpc2libGVMaW1pdCArPSBQQUdFX1NJWkU7XG5cdFx0XHRcdHRoaXMucmVuZGVyTGlzdCgpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNob3duID0gTWF0aC5taW4odGhpcy52aXNpYmxlTGltaXQsIHRvdGFsRmlsdGVyZWQpO1xuXHRcdGNvbnN0IHJlbWFpbmluZyA9IHRvdGFsRmlsdGVyZWQgLSBzaG93bjtcblx0XHR0aGlzLmxvYWRNb3JlU3RhdHVzLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2NoYXREZWJ1Zy53aXJlTG9nLnNob3dpbmdDb3VudCcsIFwiU2hvd2luZyB7MH0gb2YgezF9IGZyYW1lc1wiLCBzaG93biwgdG90YWxGaWx0ZXJlZCk7XG5cdFx0dGhpcy5sb2FkTW9yZUJ0bi5sYWJlbCA9IGxvY2FsaXplKCdjaGF0RGVidWcud2lyZUxvZy5sb2FkTW9yZScsIFwiTG9hZCBNb3JlICh7MH0pXCIsIHJlbWFpbmluZyk7XG5cblx0XHRpZiAoIXRoaXMubG9hZE1vcmVWaXNpYmxlKSB7XG5cdFx0XHRET00uc2hvdyh0aGlzLmxvYWRNb3JlQ29udGFpbmVyKTtcblx0XHRcdHRoaXMubG9hZE1vcmVWaXNpYmxlID0gdHJ1ZTtcblx0XHRcdHRoaXMubGF5b3V0KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhcHBlbmRSb3coZW50cnk6IElXaXJlRW50cnkpOiB2b2lkIHtcblx0XHRjb25zdCB7IHJvdywgc3RvcmUgfSA9IHRoaXMuYnVpbGRSb3coZW50cnkpO1xuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZChzdG9yZSk7XG5cdFx0dGhpcy5yb3dFbGVtZW50cy5wdXNoKHJvdyk7XG5cdFx0dGhpcy5yb3dTdG9yZXMucHVzaChzdG9yZSk7XG5cdFx0dGhpcy5saXN0LmFwcGVuZENoaWxkKHJvdyk7XG5cdH1cblxuXHRwcml2YXRlIHJlcGxhY2VSb3coaW5kZXg6IG51bWJlciwgZW50cnk6IElXaXJlRW50cnkpOiB2b2lkIHtcblx0XHRjb25zdCB7IHJvdywgc3RvcmUgfSA9IHRoaXMuYnVpbGRSb3coZW50cnkpO1xuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZChzdG9yZSk7XG5cdFx0Y29uc3Qgb2xkUm93ID0gdGhpcy5yb3dFbGVtZW50c1tpbmRleF07XG5cdFx0dGhpcy5saXN0LnJlcGxhY2VDaGlsZChyb3csIG9sZFJvdyk7XG5cdFx0dGhpcy5yb3dTdG9yZXNbaW5kZXhdLmRpc3Bvc2UoKTtcblx0XHR0aGlzLnJvd0VsZW1lbnRzW2luZGV4XSA9IHJvdztcblx0XHR0aGlzLnJvd1N0b3Jlc1tpbmRleF0gPSBzdG9yZTtcblx0fVxuXG5cdHByaXZhdGUgaXNTY3JvbGxlZFRvQm90dG9tKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGRpbWVuc2lvbnMgPSB0aGlzLnNjcm9sbGFibGUuZ2V0U2Nyb2xsRGltZW5zaW9ucygpO1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5zY3JvbGxhYmxlLmdldFNjcm9sbFBvc2l0aW9uKCk7XG5cdFx0cmV0dXJuIHBvc2l0aW9uLnNjcm9sbFRvcCArIGRpbWVuc2lvbnMuaGVpZ2h0ID49IGRpbWVuc2lvbnMuc2Nyb2xsSGVpZ2h0IC0gNDtcblx0fVxuXG5cdHByaXZhdGUgc2Nyb2xsVG9Cb3R0b20oKTogdm9pZCB7XG5cdFx0dGhpcy5zY3JvbGxhYmxlLnNldFNjcm9sbFBvc2l0aW9uKHsgc2Nyb2xsVG9wOiB0aGlzLnNjcm9sbGFibGUuZ2V0U2Nyb2xsRGltZW5zaW9ucygpLnNjcm9sbEhlaWdodCB9KTtcblx0fVxuXG5cdHByaXZhdGUgYnVpbGRSb3coZW50cnk6IElXaXJlRW50cnkpOiB7IHJvdzogSFRNTEVsZW1lbnQ7IHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUgfSB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZnJhbWUgPSBlbnRyeS5mcmFtZTtcblx0XHRjb25zdCBpc0Vycm9yID0gaXNFcnJvckVudHJ5KGVudHJ5KTtcblx0XHRjb25zdCBpc1BlbmRpbmcgPSBmcmFtZS5raW5kID09PSAncmVxdWVzdCcgJiYgIWVudHJ5LnJlc3BvbnNlO1xuXG5cdFx0Y29uc3Qgcm93ID0gJCgnLmNoYXQtZGVidWctd2lyZWxvZy1yb3cnKTtcblx0XHRpZiAoaXNFcnJvcikge1xuXHRcdFx0cm93LmNsYXNzTGlzdC5hZGQoJ2NoYXQtZGVidWctd2lyZWxvZy1yb3ctZXJyb3InKTtcblx0XHR9XG5cblx0XHRjb25zdCBoZWFkZXIgPSBET00uYXBwZW5kKHJvdywgJCgnLmNoYXQtZGVidWctd2lyZWxvZy1yb3ctaGVhZGVyJykpO1xuXHRcdC8vIEFjY2Vzc2liaWxpdHk6IHRoZSBoZWFkZXIgaXMgYW4gZXhwYW5kL2NvbGxhcHNlIHRvZ2dsZS4gTWFrZSBpdFxuXHRcdC8vIGtleWJvYXJkLWZvY3VzYWJsZSwgZXhwb3NlIGJ1dHRvbiBzZW1hbnRpY3MgKyBleHBhbmRlZCBzdGF0ZSwgYW5kXG5cdFx0Ly8gaGlkZSB0aGUgcHVyZWx5LWRlY29yYXRpdmUgY2hldnJvbiBmcm9tIGFzc2lzdGl2ZSB0ZWNobm9sb2d5LlxuXHRcdGhlYWRlci50YWJJbmRleCA9IDA7XG5cdFx0aGVhZGVyLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblxuXHRcdC8vIEV4cGFuc2lvbiBjaGV2cm9uLlxuXHRcdGNvbnN0IGNoZXZyb24gPSBET00uYXBwZW5kKGhlYWRlciwgJChgc3Bhbi5jaGF0LWRlYnVnLXdpcmVsb2ctY2hldnJvbiR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoQ29kaWNvbi5jaGV2cm9uUmlnaHQpfWApKTtcblx0XHRjaGV2cm9uLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXG5cdFx0Ly8gRGlyZWN0aW9uIGluZGljYXRvci5cblx0XHRjb25zdCBvdXRib3VuZCA9IGZyYW1lLmRpciA9PT0gJ2Mycyc7XG5cdFx0Y29uc3QgZGlySWNvbiA9IG91dGJvdW5kID8gQ29kaWNvbi5hcnJvd1JpZ2h0IDogQ29kaWNvbi5hcnJvd0xlZnQ7XG5cdFx0Y29uc3QgZGlyRWwgPSBET00uYXBwZW5kKGhlYWRlciwgJChgc3Bhbi5jaGF0LWRlYnVnLXdpcmVsb2ctZGlyJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihkaXJJY29uKX1gKSk7XG5cdFx0ZGlyRWwudGl0bGUgPSBvdXRib3VuZFxuXHRcdFx0PyBsb2NhbGl6ZSgnY2hhdERlYnVnLndpcmVMb2cub3V0Ym91bmQnLCBcIlZTIENvZGUgXHUyMTkyIEFnZW50IEhvc3RcIilcblx0XHRcdDogbG9jYWxpemUoJ2NoYXREZWJ1Zy53aXJlTG9nLmluYm91bmQnLCBcIkFnZW50IEhvc3QgXHUyMTkyIFZTIENvZGVcIik7XG5cblx0XHQvLyBNZXRob2QgLyByZXNwb25zZSBsYWJlbC5cblx0XHRjb25zdCBsYWJlbCA9IGZyYW1lLm1ldGhvZCA/PyBsb2NhbGl6ZSgnY2hhdERlYnVnLndpcmVMb2cucmVzcG9uc2VMYWJlbCcsIFwiKHJlc3BvbnNlKVwiKTtcblx0XHRET00uYXBwZW5kKGhlYWRlciwgJCgnc3Bhbi5jaGF0LWRlYnVnLXdpcmVsb2ctbWV0aG9kJywgdW5kZWZpbmVkLCBsYWJlbCkpO1xuXG5cdFx0Ly8gSW5saW5lIHR5cGUgLyBzZXNzaW9uIGxhYmVsIChhY3Rpb24gLyBkaXNwYXRjaEFjdGlvbiAvIG5vdGlmaWNhdGlvbiAvIGNyZWF0ZVNlc3Npb24pLlxuXHRcdGlmIChmcmFtZS5hY3Rpb25UeXBlKSB7XG5cdFx0XHRET00uYXBwZW5kKGhlYWRlciwgJCgnc3Bhbi5jaGF0LWRlYnVnLXdpcmVsb2ctdHlwZScsIHVuZGVmaW5lZCwgZnJhbWUuYWN0aW9uVHlwZSkpO1xuXHRcdH1cblx0XHQvLyBLaW5kIGJhZGdlLlxuXHRcdGNvbnN0IGJhZGdlVGV4dCA9IGZyYW1lLmtpbmQgPT09ICdyZXF1ZXN0J1xuXHRcdFx0PyBsb2NhbGl6ZSgnY2hhdERlYnVnLndpcmVMb2cuYmFkZ2UucmVxdWVzdCcsIFwicmVxdWVzdFwiKVxuXHRcdFx0OiBmcmFtZS5raW5kID09PSAnbm90aWZpY2F0aW9uJ1xuXHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0RGVidWcud2lyZUxvZy5iYWRnZS5ub3RpZmljYXRpb24nLCBcIm5vdGlmeVwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0RGVidWcud2lyZUxvZy5iYWRnZS5yZXNwb25zZScsIFwicmVzcG9uc2VcIik7XG5cdFx0RE9NLmFwcGVuZChoZWFkZXIsICQoJ3NwYW4uY2hhdC1kZWJ1Zy13aXJlbG9nLWJhZGdlJywgdW5kZWZpbmVkLCBiYWRnZVRleHQpKTtcblxuXHRcdC8vIFN0YXR1cy5cblx0XHRjb25zdCBzdGF0dXMgPSBET00uYXBwZW5kKGhlYWRlciwgJCgnc3Bhbi5jaGF0LWRlYnVnLXdpcmVsb2ctc3RhdHVzJykpO1xuXHRcdGlmIChpc0Vycm9yKSB7XG5cdFx0XHRzdGF0dXMuY2xhc3NMaXN0LmFkZCgnY2hhdC1kZWJ1Zy13aXJlbG9nLXN0YXR1cy1lcnJvcicpO1xuXHRcdFx0Y29uc3QgY29kZSA9IGVudHJ5LnJlc3BvbnNlPy5lcnJvcj8uY29kZSA/PyBmcmFtZS5lcnJvcj8uY29kZTtcblx0XHRcdHN0YXR1cy50ZXh0Q29udGVudCA9IGNvZGUgIT09IHVuZGVmaW5lZFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0RGVidWcud2lyZUxvZy5zdGF0dXNFcnJvckNvZGUnLCBcImVycm9yIHswfVwiLCBjb2RlKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0RGVidWcud2lyZUxvZy5zdGF0dXNFcnJvcicsIFwiZXJyb3JcIik7XG5cdFx0fSBlbHNlIGlmIChpc1BlbmRpbmcpIHtcblx0XHRcdHN0YXR1cy5jbGFzc0xpc3QuYWRkKCdjaGF0LWRlYnVnLXdpcmVsb2ctc3RhdHVzLXBlbmRpbmcnKTtcblx0XHRcdHN0YXR1cy50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0RGVidWcud2lyZUxvZy5zdGF0dXNQZW5kaW5nJywgXCJwZW5kaW5nXCIpO1xuXHRcdH0gZWxzZSBpZiAoZW50cnkucmVzcG9uc2UpIHtcblx0XHRcdHN0YXR1cy5jbGFzc0xpc3QuYWRkKCdjaGF0LWRlYnVnLXdpcmVsb2ctc3RhdHVzLW9rJyk7XG5cdFx0XHRzdGF0dXMudGV4dENvbnRlbnQgPSBmb3JtYXREdXJhdGlvbihlbnRyeS5yZXNwb25zZS50cyAtIGZyYW1lLnRzKTtcblx0XHR9XG5cblx0XHQvLyBUaW1lc3RhbXAgKHJpZ2h0LWFsaWduZWQpLlxuXHRcdGNvbnN0IHRpbWUgPSBET00uYXBwZW5kKGhlYWRlciwgJCgnc3Bhbi5jaGF0LWRlYnVnLXdpcmVsb2ctdGltZScpKTtcblx0XHR0aW1lLnRleHRDb250ZW50ID0gZm9ybWF0Q2xvY2soZnJhbWUudHMpO1xuXHRcdGlmIChmcmFtZS5pZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aW1lLnRpdGxlID0gbG9jYWxpemUoJ2NoYXREZWJ1Zy53aXJlTG9nLmZyYW1lSWQnLCBcImlkOiB7MH1cIiwgZnJhbWUuaWQpO1xuXHRcdH1cblxuXHRcdC8vIERldGFpbHMgYXJlIHJlbmRlcmVkIGxhemlseSBvbiBmaXJzdCBleHBhbmQ6IHByZXR0eS1wcmludGluZyBldmVyeVxuXHRcdC8vIGZyYW1lJ3MgSlNPTiB1cC1mcm9udCBkb21pbmF0ZXMgcmVuZGVyIHRpbWUsIHNvIGNvbGxhcHNlZCByb3dzICh0aGVcblx0XHQvLyBjb21tb24gY2FzZSkgbmV2ZXIgcGF5IHRoYXQgY29zdC5cblx0XHRjb25zdCBkZXRhaWxzID0gRE9NLmFwcGVuZChyb3csICQoJy5jaGF0LWRlYnVnLXdpcmVsb2ctcm93LWRldGFpbHMnKSk7XG5cdFx0bGV0IGRldGFpbHNSZW5kZXJlZCA9IGZhbHNlO1xuXG5cdFx0bGV0IGV4cGFuZGVkID0gZmFsc2U7XG5cdFx0Y29uc3Qgc2V0RXhwYW5kZWQgPSAodmFsdWU6IGJvb2xlYW4sIHNjYW46IGJvb2xlYW4pID0+IHtcblx0XHRcdGV4cGFuZGVkID0gdmFsdWU7XG5cdFx0XHRpZiAoZXhwYW5kZWQgJiYgIWRldGFpbHNSZW5kZXJlZCkge1xuXHRcdFx0XHR0aGlzLnJlbmRlckRldGFpbHMoZGV0YWlscywgZW50cnkpO1xuXHRcdFx0XHRkZXRhaWxzUmVuZGVyZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cm93LmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtZGVidWctd2lyZWxvZy1yb3ctZXhwYW5kZWQnLCBleHBhbmRlZCk7XG5cdFx0XHRjaGV2cm9uLmNsYXNzTGlzdC50b2dnbGUoJ2NvZGljb24tY2hldnJvbi1kb3duJywgZXhwYW5kZWQpO1xuXHRcdFx0Y2hldnJvbi5jbGFzc0xpc3QudG9nZ2xlKCdjb2RpY29uLWNoZXZyb24tcmlnaHQnLCAhZXhwYW5kZWQpO1xuXHRcdFx0aGVhZGVyLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsIFN0cmluZyhleHBhbmRlZCkpO1xuXHRcdFx0aWYgKHNjYW4pIHtcblx0XHRcdFx0dGhpcy5zY3JvbGxhYmxlLnNjYW5Eb21Ob2RlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHQvLyBBcHBseSB0aGUgaW5pdGlhbCAoYXV0by1leHBhbmRlZCBmb3IgZXJyb3JzKSBzdGF0ZSB3aXRob3V0IHNjYW5uaW5nOlxuXHRcdC8vIHJlbmRlckxpc3Qgc2NhbnMgb25jZSBhZnRlciBhbGwgcm93cyBhcmUgYXBwZW5kZWQsIHNvIHNjYW5uaW5nIHBlclxuXHRcdC8vIHJvdyBoZXJlIHdvdWxkIHRocmFzaCBsYXlvdXQgZHVyaW5nIHRoZSBidWlsZC5cblx0XHRzZXRFeHBhbmRlZChpc0Vycm9yLCBmYWxzZSk7XG5cblx0XHRzdG9yZS5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihoZWFkZXIsIERPTS5FdmVudFR5cGUuQ0xJQ0ssICgpID0+IHNldEV4cGFuZGVkKCFleHBhbmRlZCwgdHJ1ZSkpKTtcblx0XHRzdG9yZS5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihoZWFkZXIsIERPTS5FdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHNldEV4cGFuZGVkKCFleHBhbmRlZCwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHJldHVybiB7IHJvdywgc3RvcmUgfTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRGV0YWlscyhjb250YWluZXI6IEhUTUxFbGVtZW50LCBlbnRyeTogSVdpcmVFbnRyeSk6IHZvaWQge1xuXHRcdGNvbnN0IGZyYW1lID0gZW50cnkuZnJhbWU7XG5cblx0XHQvLyBSZXF1ZXN0IC8gbm90aWZpY2F0aW9uIHBheWxvYWQuXG5cdFx0aWYgKGZyYW1lLnBheWxvYWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5hcHBlbmRKc29uU2VjdGlvbihjb250YWluZXIsIGZyYW1lLmtpbmQgPT09ICdyZXNwb25zZSdcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdERlYnVnLndpcmVMb2cuc2VjdGlvbi5yZXN1bHQnLCBcIlJlc3VsdFwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0RGVidWcud2lyZUxvZy5zZWN0aW9uLnBhcmFtcycsIFwiUGFyYW1zXCIpLCBmcmFtZS5wYXlsb2FkKTtcblx0XHR9XG5cdFx0aWYgKGZyYW1lLmVycm9yKSB7XG5cdFx0XHR0aGlzLmFwcGVuZEpzb25TZWN0aW9uKGNvbnRhaW5lciwgbG9jYWxpemUoJ2NoYXREZWJ1Zy53aXJlTG9nLnNlY3Rpb24uZXJyb3InLCBcIkVycm9yXCIpLCBmcmFtZS5lcnJvciwgdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0Ly8gTWF0Y2hlZCByZXNwb25zZSBwYXlsb2FkIC8gZXJyb3IuXG5cdFx0aWYgKGVudHJ5LnJlc3BvbnNlKSB7XG5cdFx0XHRpZiAoZW50cnkucmVzcG9uc2UuZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5hcHBlbmRKc29uU2VjdGlvbihjb250YWluZXIsIGxvY2FsaXplKCdjaGF0RGVidWcud2lyZUxvZy5zZWN0aW9uLnJlc3BvbnNlRXJyb3InLCBcIlJlc3BvbnNlIEVycm9yXCIpLCBlbnRyeS5yZXNwb25zZS5lcnJvciwgdHJ1ZSk7XG5cdFx0XHR9IGVsc2UgaWYgKGVudHJ5LnJlc3BvbnNlLnBheWxvYWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLmFwcGVuZEpzb25TZWN0aW9uKGNvbnRhaW5lciwgbG9jYWxpemUoJ2NoYXREZWJ1Zy53aXJlTG9nLnNlY3Rpb24ucmVzdWx0JywgXCJSZXN1bHRcIiksIGVudHJ5LnJlc3BvbnNlLnBheWxvYWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChmcmFtZS50cnVuY2F0ZWQgfHwgZW50cnkucmVzcG9uc2U/LnRydW5jYXRlZCkge1xuXHRcdFx0RE9NLmFwcGVuZChjb250YWluZXIsICQoJy5jaGF0LWRlYnVnLXdpcmVsb2ctZGV0YWlsLW5vdGUnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdjaGF0RGVidWcud2lyZUxvZy50cnVuY2F0ZWRGcmFtZScsIFwiTGFyZ2UgcGF5bG9hZCB2YWx1ZXMgd2VyZSBlbGlkZWQgaW4gdGhlIGxvZy4gT3BlbiB0aGUgZnVsbCBmaWxlIGZvciBjb21wbGV0ZSBkYXRhLlwiKSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXBwZW5kSnNvblNlY3Rpb24oY29udGFpbmVyOiBIVE1MRWxlbWVudCwgdGl0bGU6IHN0cmluZywgdmFsdWU6IHVua25vd24sIGlzRXJyb3IgPSBmYWxzZSk6IHZvaWQge1xuXHRcdGNvbnN0IHNlY3Rpb24gPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNoYXQtZGVidWctd2lyZWxvZy1kZXRhaWwtc2VjdGlvbicpKTtcblx0XHRET00uYXBwZW5kKHNlY3Rpb24sICQoJy5jaGF0LWRlYnVnLXdpcmVsb2ctZGV0YWlsLXRpdGxlJywgdW5kZWZpbmVkLCB0aXRsZSkpO1xuXHRcdGNvbnN0IHByZSA9IERPTS5hcHBlbmQoc2VjdGlvbiwgJCgncHJlLmNoYXQtZGVidWctd2lyZWxvZy1kZXRhaWwtanNvbicpKTtcblx0XHRpZiAoaXNFcnJvcikge1xuXHRcdFx0cHJlLmNsYXNzTGlzdC5hZGQoJ2NoYXQtZGVidWctd2lyZWxvZy1kZXRhaWwtanNvbi1lcnJvcicpO1xuXHRcdH1cblx0XHRwcmUudGV4dENvbnRlbnQgPSBzdHJpbmdpZnlCb3VuZGVkKHZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRm9vdGVyKHNvdXJjZTogSUFnZW50SG9zdExvZ1NvdXJjZSwgdHJ1bmNhdGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0RE9NLmNsZWFyTm9kZSh0aGlzLmZvb3Rlcik7XG5cdFx0Y29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG5cdFx0aWYgKHRydW5jYXRlZCkge1xuXHRcdFx0cGFydHMucHVzaChsb2NhbGl6ZSgnY2hhdERlYnVnLndpcmVMb2cuZm9vdGVyVGFpbCcsIFwiU2hvd2luZyB0aGUgbW9zdCByZWNlbnQgZnJhbWVzXCIpKTtcblx0XHR9XG5cdFx0aWYgKHNvdXJjZS5pc1JlbW90ZSkge1xuXHRcdFx0cGFydHMucHVzaChsb2NhbGl6ZSgnY2hhdERlYnVnLndpcmVMb2cuZm9vdGVyUmVtb3RlJywgXCJyZW1vdGVcIikpO1xuXHRcdH1cblx0XHR0aGlzLmZvb3Rlci50ZXh0Q29udGVudCA9IHBhcnRzLmpvaW4oJyBcdTAwQjcgJyk7XG5cdH1cbn1cblxuLyoqXG4gKiBFeHRyYWN0cyBhIHNob3J0IGlkZW50aWZ5aW5nIGxhYmVsIGZvciBhIGZyYW1lIGZyb20gaXRzIHBheWxvYWQsIHN1cmZhY2VkXG4gKiBpbmxpbmUgaW4gdGhlIHJvdyBuZXh0IHRvIHRoZSBtZXRob2Q6XG4gKiAtIGBhY3Rpb25gIGZyYW1lcyBjYXJyeSB0aGUgZGlzcGF0Y2hlZCBhY3Rpb24gdW5kZXIgYHBhcmFtcy5hY3Rpb25gO1xuICogLSBgbm90aWZpY2F0aW9uYCBmcmFtZXMgY2FycnkgaXQgdW5kZXIgYHBhcmFtcy5ub3RpZmljYXRpb25gO1xuICogLSBgZGlzcGF0Y2hBY3Rpb25gIGZyYW1lcyBwYXNzIHBvc2l0aW9uYWwgYXJncyBgW2NoYW5uZWwsIGFjdGlvbiwgXHUyMDI2XWAsIHNvIHRoZVxuICogICBhY3Rpb24gaXMgdGhlIHNlY29uZCBhcmd1bWVudDtcbiAqIC0gYGNyZWF0ZVNlc3Npb25gIGZyYW1lcyBwYXNzIGBbY29uZmlnXWAsIHdob3NlIGBzZXNzaW9uYCBmaWVsZCAoYSBVUkkpXG4gKiAgIGlkZW50aWZpZXMgdGhlIHNlc3Npb24gYmVpbmcgcmVzdW1lZCBvciBmb3JrZWQuXG4gKi9cbmZ1bmN0aW9uIGV4dHJhY3RBY3Rpb25UeXBlKG1ldGhvZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBwYXlsb2FkOiB1bmtub3duKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0c3dpdGNoIChtZXRob2QpIHtcblx0XHRjYXNlICdub3RpZmljYXRpb24nOlxuXHRcdFx0cmV0dXJuIHR5cGVTdHJpbmdPZihnZXRQcm9wKHBheWxvYWQsICdub3RpZmljYXRpb24nKSk7XG5cdFx0Y2FzZSAnZGlzcGF0Y2hBY3Rpb24nOlxuXHRcdFx0cmV0dXJuIHR5cGVTdHJpbmdPZihBcnJheS5pc0FycmF5KHBheWxvYWQpID8gcGF5bG9hZFsxXSA6IHVuZGVmaW5lZCk7XG5cdFx0Y2FzZSAnY3JlYXRlU2Vzc2lvbic6XG5cdFx0XHRyZXR1cm4gdXJpU3RyaW5nT2YoZ2V0UHJvcChBcnJheS5pc0FycmF5KHBheWxvYWQpID8gcGF5bG9hZFswXSA6IHVuZGVmaW5lZCwgJ3Nlc3Npb24nKSk7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiB0eXBlU3RyaW5nT2YoZ2V0UHJvcChwYXlsb2FkLCAnYWN0aW9uJykpO1xuXHR9XG59XG5cbi8qKiBSZWFkcyBhIHByb3BlcnR5IG9mZiBhIHZhbHVlIG9ubHkgd2hlbiBpdCBpcyBhIG5vbi1udWxsIG9iamVjdC4gKi9cbmZ1bmN0aW9uIGdldFByb3AodmFsdWU6IHVua25vd24sIGtleTogc3RyaW5nKTogdW5rbm93biB7XG5cdHJldHVybiB2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnID8gKHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtrZXldIDogdW5kZWZpbmVkO1xufVxuXG4vKiogUmV0dXJucyB0aGUgYHR5cGVgIHN0cmluZyBvZiBhbiBhY3Rpb24tbGlrZSB2YWx1ZSwgd2hlbiBwcmVzZW50LiAqL1xuZnVuY3Rpb24gdHlwZVN0cmluZ09mKHZhbHVlOiB1bmtub3duKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgdHlwZSA9IGdldFByb3AodmFsdWUsICd0eXBlJyk7XG5cdHJldHVybiB0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycgPyB0eXBlIDogdW5kZWZpbmVkO1xufVxuXG4vKiogUmVuZGVycyBhIGxvZ2dlZCBVUkkgdmFsdWUgKHN0cmluZyBvciBzZXJpYWxpemVkIGNvbXBvbmVudHMpIGFzIHRleHQuICovXG5mdW5jdGlvbiB1cmlTdHJpbmdPZih2YWx1ZTogdW5rbm93bik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cdGlmICh2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG5cdFx0Y29uc3QgZXh0ZXJuYWwgPSAodmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLmV4dGVybmFsO1xuXHRcdGlmICh0eXBlb2YgZXh0ZXJuYWwgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gZXh0ZXJuYWw7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgKHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KS5zY2hlbWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gVVJJLnJldml2ZSh2YWx1ZSBhcyBVcmlDb21wb25lbnRzKS50b1N0cmluZyh0cnVlKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vKiogUGFyc2VzIG5ld2xpbmUtZGVsaW1pdGVkIEFIUCBmcmFtZXMsIHNraXBwaW5nIGFueSB1bnBhcnNlYWJsZSBsaW5lcy4gKi9cbmZ1bmN0aW9uIHBhcnNlV2lyZUZyYW1lcyh0ZXh0OiBzdHJpbmcpOiBJV2lyZUZyYW1lW10ge1xuXHRjb25zdCBmcmFtZXM6IElXaXJlRnJhbWVbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGxpbmUgb2YgdGV4dC5zcGxpdCgnXFxuJykpIHtcblx0XHRjb25zdCB0cmltbWVkID0gbGluZS50cmltKCk7XG5cdFx0aWYgKCF0cmltbWVkKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0bGV0IHJlY29yZDogUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0dHJ5IHtcblx0XHRcdHJlY29yZCA9IEpTT04ucGFyc2UodHJpbW1lZCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBBIHRydW5jYXRlZCB0YWlsIGNhbiBsZWF2ZSBhIHBhcnRpYWwgZmlyc3QgbGluZTsgc2tpcCBpdC5cblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRjb25zdCBtZXRhID0gcmVjb3JkLl9haHBMb2cgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKCFtZXRhKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgZGlyOiBXaXJlTG9nRGlyZWN0aW9uID0gbWV0YS5kaXIgPT09ICdzMmMnID8gJ3MyYycgOiAnYzJzJztcblx0XHRjb25zdCB0cyA9IHR5cGVvZiBtZXRhLnRzID09PSAnc3RyaW5nJyA/IERhdGUucGFyc2UobWV0YS50cykgOiBOYU47XG5cdFx0Y29uc3QgaWQgPSByZWNvcmQuaWQgIT09IHVuZGVmaW5lZCAmJiByZWNvcmQuaWQgIT09IG51bGwgPyBTdHJpbmcocmVjb3JkLmlkKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBtZXRob2QgPSB0eXBlb2YgcmVjb3JkLm1ldGhvZCA9PT0gJ3N0cmluZycgPyByZWNvcmQubWV0aG9kIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGhhc1Jlc3VsdCA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZWNvcmQsICdyZXN1bHQnKTtcblx0XHRjb25zdCBlcnJvclZhbHVlID0gcmVjb3JkLmVycm9yIGFzIHsgY29kZT86IG51bWJlcjsgbWVzc2FnZT86IHN0cmluZzsgZGF0YT86IHVua25vd24gfSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBraW5kOiBJV2lyZUZyYW1lWydraW5kJ10gPSBtZXRob2Rcblx0XHRcdD8gKGlkICE9PSB1bmRlZmluZWQgPyAncmVxdWVzdCcgOiAnbm90aWZpY2F0aW9uJylcblx0XHRcdDogJ3Jlc3BvbnNlJztcblx0XHRjb25zdCBwYXlsb2FkID0gbWV0aG9kID8gcmVjb3JkLnBhcmFtcyA6IChoYXNSZXN1bHQgPyByZWNvcmQucmVzdWx0IDogdW5kZWZpbmVkKTtcblx0XHRmcmFtZXMucHVzaCh7XG5cdFx0XHR0czogTnVtYmVyLmlzTmFOKHRzKSA/IDAgOiB0cyxcblx0XHRcdGRpcixcblx0XHRcdHRydW5jYXRlZDogbWV0YS50cnVuY2F0ZWQgPT09IHRydWUsXG5cdFx0XHRieXRlTGVuZ3RoOiB0eXBlb2YgbWV0YS5ieXRlTGVuZ3RoID09PSAnbnVtYmVyJyA/IG1ldGEuYnl0ZUxlbmd0aCA6IHVuZGVmaW5lZCxcblx0XHRcdGlkLFxuXHRcdFx0bWV0aG9kLFxuXHRcdFx0YWN0aW9uVHlwZTogZXh0cmFjdEFjdGlvblR5cGUobWV0aG9kLCBwYXlsb2FkKSxcblx0XHRcdHBheWxvYWQsXG5cdFx0XHRlcnJvcjogZXJyb3JWYWx1ZSAmJiB0eXBlb2YgZXJyb3JWYWx1ZSA9PT0gJ29iamVjdCcgPyBlcnJvclZhbHVlIDogdW5kZWZpbmVkLFxuXHRcdFx0a2luZCxcblx0XHR9KTtcblx0fVxuXHRyZXR1cm4gZnJhbWVzO1xufVxuXG4vKipcbiAqIEZvbGRzIHJlc3BvbnNlIGZyYW1lcyBpbnRvIHRoZSByZXF1ZXN0IHRoZXkgYW5zd2VyIChtYXRjaGVkIGJ5IGlkIGluXG4gKiBjaHJvbm9sb2dpY2FsIG9yZGVyKSwgbGVhdmluZyBub3RpZmljYXRpb25zIGFuZCB1bm1hdGNoZWQgZnJhbWVzIGFzXG4gKiBzdGFuZGFsb25lIGVudHJpZXMuXG4gKlxuICogQUhQIGlzIGJpZGlyZWN0aW9uYWw6IGJvdGggY2xpZW50IGFuZCBob3N0IGNhbiBvcmlnaW5hdGUgcmVxdWVzdHMsIGFuZCB0aGVpclxuICogaWQgbmFtZXNwYWNlcyBhcmUgaW5kZXBlbmRlbnQuIEEgcmVzcG9uc2UgdGhlcmVmb3JlIGFuc3dlcnMgYSByZXF1ZXN0IGZyb21cbiAqIHRoZSBvcHBvc2l0ZSBkaXJlY3Rpb24gKGEgYzJzIHJlcXVlc3QgaXMgYW5zd2VyZWQgYnkgYW4gczJjIHJlc3BvbnNlIGFuZCB2aWNlXG4gKiB2ZXJzYSksIHNvIHBlbmRpbmcgcmVxdWVzdHMgYXJlIGtleWVkIGJ5IGRpcmVjdGlvbiArIGlkIHRvIGF2b2lkIHBhaXJpbmcgYVxuICogcmVzcG9uc2Ugd2l0aCBhIHNhbWUtaWQgcmVxdWVzdCBmcm9tIHRoZSBvdGhlciBkaXJlY3Rpb24uXG4gKi9cbmZ1bmN0aW9uIGJ1aWxkV2lyZUVudHJpZXMoZnJhbWVzOiBJV2lyZUZyYW1lW10pOiBJV2lyZUVudHJ5W10ge1xuXHRjb25zdCBlbnRyaWVzOiBJV2lyZUVudHJ5W10gPSBbXTtcblx0Y29uc3QgcGVuZGluZ0J5S2V5ID0gbmV3IE1hcDxzdHJpbmcsIElXaXJlRW50cnk+KCk7XG5cdGNvbnN0IHBlbmRpbmdLZXkgPSAoZGlyOiBXaXJlTG9nRGlyZWN0aW9uLCBpZDogc3RyaW5nKSA9PiBgJHtkaXJ9fCR7aWR9YDtcblx0Zm9yIChjb25zdCBmcmFtZSBvZiBmcmFtZXMpIHtcblx0XHRpZiAoZnJhbWUua2luZCA9PT0gJ3Jlc3BvbnNlJyAmJiBmcmFtZS5pZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHQvLyBBIHJlc3BvbnNlIGFuc3dlcnMgYSByZXF1ZXN0IHRyYXZlbGxpbmcgaW4gdGhlIG9wcG9zaXRlIGRpcmVjdGlvbi5cblx0XHRcdGNvbnN0IHJlcXVlc3REaXI6IFdpcmVMb2dEaXJlY3Rpb24gPSBmcmFtZS5kaXIgPT09ICdjMnMnID8gJ3MyYycgOiAnYzJzJztcblx0XHRcdGNvbnN0IGtleSA9IHBlbmRpbmdLZXkocmVxdWVzdERpciwgZnJhbWUuaWQpO1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IHBlbmRpbmdCeUtleS5nZXQoa2V5KTtcblx0XHRcdGlmIChyZXF1ZXN0KSB7XG5cdFx0XHRcdHJlcXVlc3QucmVzcG9uc2UgPSBmcmFtZTtcblx0XHRcdFx0cGVuZGluZ0J5S2V5LmRlbGV0ZShrZXkpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgZW50cnk6IElXaXJlRW50cnkgPSB7IGZyYW1lLCByZXNwb25zZTogdW5kZWZpbmVkIH07XG5cdFx0ZW50cmllcy5wdXNoKGVudHJ5KTtcblx0XHRpZiAoZnJhbWUua2luZCA9PT0gJ3JlcXVlc3QnICYmIGZyYW1lLmlkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHBlbmRpbmdCeUtleS5zZXQocGVuZGluZ0tleShmcmFtZS5kaXIsIGZyYW1lLmlkKSwgZW50cnkpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gZW50cmllcztcbn1cblxuLyoqXG4gKiBUcnVlIHdoZW4gYW4gZW50cnkgcmVwcmVzZW50cyBhIHByb3RvY29sIGVycm9yLCB3aGV0aGVyIGl0IGlzIGEgSlNPTi1SUENcbiAqIGVycm9yIHJlc3BvbnNlIG9yIGFuIGFnZW50LWVtaXR0ZWQgYGNoYXQvZXJyb3JgIGFjdGlvbi9ub3RpZmljYXRpb24gZnJhbWUuXG4gKiBVc2VkIHRvIGNvbG9yIHRoZSByb3cgYW5kIGNvdW50IGVycm9ycyBpbiB0aGUgc3VtbWFyeS5cbiAqL1xuZnVuY3Rpb24gaXNFcnJvckVudHJ5KGVudHJ5OiBJV2lyZUVudHJ5KTogYm9vbGVhbiB7XG5cdGNvbnN0IGZyYW1lID0gZW50cnkuZnJhbWU7XG5cdHJldHVybiAhIWVudHJ5LnJlc3BvbnNlPy5lcnJvclxuXHRcdHx8IChmcmFtZS5raW5kID09PSAncmVzcG9uc2UnICYmICEhZnJhbWUuZXJyb3IpXG5cdFx0fHwgZnJhbWUuYWN0aW9uVHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0RXJyb3I7XG59XG5cbi8qKiBUcnVlIHdoZW4gYW4gZW50cnkncyBtZXRob2QsIGFjdGlvbiB0eXBlLCBpZCwgb3IgcmVzcG9uc2UgZXJyb3IgbWF0Y2hlcyB0aGUgZmlsdGVyLiAqL1xuZnVuY3Rpb24gbWF0Y2hlc0ZpbHRlcihlbnRyeTogSVdpcmVFbnRyeSwgZmlsdGVyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0Y29uc3QgZnJhbWUgPSBlbnRyeS5mcmFtZTtcblx0aWYgKGZyYW1lLm1ldGhvZD8udG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhmaWx0ZXIpKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0aWYgKGZyYW1lLmFjdGlvblR5cGU/LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoZmlsdGVyKSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGlmIChmcmFtZS5pZCAhPT0gdW5kZWZpbmVkICYmIGZyYW1lLmlkLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoZmlsdGVyKSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGNvbnN0IGVycm9yTWVzc2FnZSA9IGVudHJ5LnJlc3BvbnNlPy5lcnJvcj8ubWVzc2FnZSA/PyBmcmFtZS5lcnJvcj8ubWVzc2FnZTtcblx0cmV0dXJuICEhZXJyb3JNZXNzYWdlICYmIGVycm9yTWVzc2FnZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKGZpbHRlcik7XG59XG5cbi8qKlxuICogQSBzdGFibGUga2V5IGZvciBhbiBlbnRyeSdzIHJlcXVlc3Qvbm90aWZpY2F0aW9uIGZyYW1lIChpZ25vcmluZyBpdHNcbiAqIHJlc3BvbnNlKS4gVXNlZCB0byB0ZXN0IHdoZXRoZXIgcHJldmlvdXNseS1yZW5kZXJlZCByb3dzIHN0aWxsIGxpbmUgdXAgd2l0aCBhXG4gKiBmcmVzaGx5LXBhcnNlZCBzZXQgc28gYSBsaXZlIHJlZnJlc2ggY2FuIHJlY29uY2lsZSBpbiBwbGFjZS5cbiAqL1xuZnVuY3Rpb24gYmFzZUVudHJ5S2V5KGVudHJ5OiBJV2lyZUVudHJ5KTogc3RyaW5nIHtcblx0Y29uc3QgZnJhbWUgPSBlbnRyeS5mcmFtZTtcblx0cmV0dXJuIGAke2ZyYW1lLmRpcn18JHtmcmFtZS5raW5kfXwke2ZyYW1lLmlkID8/ICcnfXwke2ZyYW1lLnRzfXwke2ZyYW1lLm1ldGhvZCA/PyAnJ31gO1xufVxuXG4vKipcbiAqIEEga2V5IGNhcHR1cmluZyBhbiBlbnRyeSdzIGZ1bGwgcmVuZGVyLXJlbGV2YW50IHN0YXRlLCBpbmNsdWRpbmcgd2hldGhlciAoYW5kXG4gKiBob3cpIGl0cyByZXNwb25zZSBoYXMgYXJyaXZlZCwgc28gYSByb3cgY2FuIGJlIHJlLXJlbmRlcmVkIG9ubHkgd2hlbiBuZWVkZWQuXG4gKi9cbmZ1bmN0aW9uIGVudHJ5U3RhdGVLZXkoZW50cnk6IElXaXJlRW50cnkpOiBzdHJpbmcge1xuXHRjb25zdCByZXNwb25zZSA9IGVudHJ5LnJlc3BvbnNlO1xuXHRjb25zdCByZXNwb25zZUtleSA9IHJlc3BvbnNlID8gYFIke3Jlc3BvbnNlLnRzfSR7cmVzcG9uc2UuZXJyb3IgPyAnRScgOiAnJ31gIDogJ1AnO1xuXHRyZXR1cm4gYCR7YmFzZUVudHJ5S2V5KGVudHJ5KX18JHtyZXNwb25zZUtleX1gO1xufVxuXG4vKiogUHJldHR5LXByaW50cyBhIEpTT04gdmFsdWUsIGJvdW5kZWQgdG8ga2VlcCB0aGUgRE9NIGxpZ2h0LiAqL1xuZnVuY3Rpb24gc3RyaW5naWZ5Qm91bmRlZCh2YWx1ZTogdW5rbm93bik6IHN0cmluZyB7XG5cdGxldCB0ZXh0OiBzdHJpbmc7XG5cdHRyeSB7XG5cdFx0dGV4dCA9IEpTT04uc3RyaW5naWZ5KHZhbHVlLCB1bmRlZmluZWQsIDIpID8/IFN0cmluZyh2YWx1ZSk7XG5cdH0gY2F0Y2gge1xuXHRcdHRleHQgPSBTdHJpbmcodmFsdWUpO1xuXHR9XG5cdGlmICh0ZXh0Lmxlbmd0aCA+IE1BWF9ERVRBSUxfSlNPTikge1xuXHRcdHJldHVybiBgJHt0ZXh0LnNsaWNlKDAsIE1BWF9ERVRBSUxfSlNPTil9XHUyMDI2YDtcblx0fVxuXHRyZXR1cm4gdGV4dDtcbn1cblxuLyoqIEZvcm1hdHMgYSBtaWxsaXNlY29uZCBkdXJhdGlvbiBpbnRvIGEgY29tcGFjdCBodW1hbiBzdHJpbmcuICovXG5mdW5jdGlvbiBmb3JtYXREdXJhdGlvbihtaWxsaXM6IG51bWJlcik6IHN0cmluZyB7XG5cdGlmIChtaWxsaXMgPCAxMDAwKSB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdjaGF0RGVidWcud2lyZUxvZy5tcycsIFwiezB9IG1zXCIsIE1hdGgucm91bmQobWlsbGlzKSk7XG5cdH1cblx0cmV0dXJuIGxvY2FsaXplKCdjaGF0RGVidWcud2lyZUxvZy5zJywgXCJ7MH0gc1wiLCAobWlsbGlzIC8gMTAwMCkudG9GaXhlZChtaWxsaXMgPCAxMDAwMCA/IDEgOiAwKSk7XG59XG5cbi8qKiBGb3JtYXRzIGEgdGltZXN0YW1wIGludG8gYW4gSEg6TU06U1MubW1tIGNsb2NrIGxhYmVsLiAqL1xuZnVuY3Rpb24gZm9ybWF0Q2xvY2sodHM6IG51bWJlcik6IHN0cmluZyB7XG5cdGlmICghdHMpIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblx0Y29uc3QgZGF0ZSA9IG5ldyBEYXRlKHRzKTtcblx0Y29uc3QgcGFkID0gKHZhbHVlOiBudW1iZXIsIGxlbmd0aCA9IDIpID0+IFN0cmluZyh2YWx1ZSkucGFkU3RhcnQobGVuZ3RoLCAnMCcpO1xuXHRyZXR1cm4gYCR7cGFkKGRhdGUuZ2V0SG91cnMoKSl9OiR7cGFkKGRhdGUuZ2V0TWludXRlcygpKX06JHtwYWQoZGF0ZS5nZXRTZWNvbmRzKCkpfS4ke3BhZChkYXRlLmdldE1pbGxpc2Vjb25kcygpLCAzKX1gO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx5QkFBeUI7QUFD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
