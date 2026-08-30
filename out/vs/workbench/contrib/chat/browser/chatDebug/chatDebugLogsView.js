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
import { ProgressBar } from "../../../../../base/browser/ui/progressbar/progressbar.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { combinedDisposable, Disposable, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../base/common/observable.js";
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { localize } from "../../../../../nls.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { WorkbenchList, WorkbenchObjectTree } from "../../../../../platform/list/browser/listService.js";
import { defaultBreadcrumbsWidgetStyles, defaultButtonStyles, defaultProgressBarStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { FilterWidget } from "../../../../browser/parts/views/viewFilter.js";
import { IChatDebugService } from "../../common/chatDebugService.js";
import { debugEventMatchesText } from "../../common/chatDebugEvents.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { LocalChatSessionUri } from "../../common/model/chatUri.js";
import { ChatDebugEventRenderer, ChatDebugEventDelegate, ChatDebugEventTreeRenderer, getEventCreatedText, getEventNameText, getEventDetailsText } from "./chatDebugEventList.js";
import { setupBreadcrumbKeyboardNavigation, TextBreadcrumbItem, LogsViewMode } from "./chatDebugTypes.js";
import { bindFilterContextKeys } from "./chatDebugFilters.js";
import { ChatDebugDetailPanel } from "./chatDebugDetailPanel.js";
import { IClipboardService } from "../../../../../platform/clipboard/common/clipboardService.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { Action, Separator } from "../../../../../base/common/actions.js";
import { StandardMouseEvent } from "../../../../../base/browser/mouseEvent.js";
const $ = DOM.$;
const PAGE_SIZE = 1e3;
var LogsNavigation = /* @__PURE__ */ ((LogsNavigation2) => {
  LogsNavigation2["Home"] = "home";
  LogsNavigation2["Overview"] = "overview";
  return LogsNavigation2;
})(LogsNavigation || {});
let ChatDebugLogsView = class extends Disposable {
  constructor(parent, filterState, chatService, chatDebugService, instantiationService, contextKeyService, clipboardService, contextMenuService) {
    super();
    this.filterState = filterState;
    this.chatService = chatService;
    this.chatDebugService = chatDebugService;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.clipboardService = clipboardService;
    this.contextMenuService = contextMenuService;
    this._onNavigate = this._register(new Emitter());
    this.onNavigate = this._onNavigate.event;
    this.logsViewMode = LogsViewMode.Tree;
    this.events = [];
    this.filteredEvents = [];
    this.filterDirty = true;
    this.cachedIncludeTerms = [];
    this.cachedExcludeTerms = [];
    this.eventListener = this._register(new MutableDisposable());
    this.sessionStateDisposable = this._register(new MutableDisposable());
    this.showMoreDisposables = this._register(new DisposableStore());
    this.showMoreVisible = false;
    this.visibleLimit = PAGE_SIZE;
    this.refreshScheduler = this._register(new RunOnceScheduler(() => this.refreshList(), 50));
    this.container = DOM.append(parent, $(".chat-debug-logs"));
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
    this.headerContainer = DOM.append(this.container, $(".chat-debug-editor-header"));
    const scopedContextKeyService = this._register(this.contextKeyService.createScoped(this.headerContainer));
    const syncContextKeys = bindFilterContextKeys(this.filterState, scopedContextKeyService);
    syncContextKeys();
    const childInstantiationService = this._register(this.instantiationService.createChild(
      new ServiceCollection([IContextKeyService, scopedContextKeyService])
    ));
    this.filterWidget = this._register(childInstantiationService.createInstance(FilterWidget, {
      placeholder: localize("chatDebug.search", "Filter (e.g. text, !exclude, before:YYYY-MM-DDTHH:MM:SS)"),
      ariaLabel: localize("chatDebug.filterAriaLabel", "Filter debug events")
    }));
    this.viewModeToggle = this._register(new Button(this.headerContainer, { ...defaultButtonStyles, secondary: true, title: localize("chatDebug.toggleViewMode", "Toggle between list and tree view") }));
    this.viewModeToggle.element.classList.add("chat-debug-view-mode-toggle", "monaco-text-button");
    this.updateViewModeToggle();
    this._register(this.viewModeToggle.onDidClick(() => {
      this.toggleViewMode();
    }));
    const filterContainer = DOM.append(this.headerContainer, $(".viewpane-filter-container"));
    filterContainer.appendChild(this.filterWidget.element);
    this._register(this.filterWidget.onDidChangeFilterText((text) => {
      this.filterState.setTextFilter(text);
    }));
    this._register(this.filterState.onDidChange(() => {
      syncContextKeys();
      this.updateMoreFiltersChecked();
      this.visibleLimit = PAGE_SIZE;
      this.filterDirty = true;
      this.refreshList();
    }));
    const contentContainer = DOM.append(this.container, $(".chat-debug-logs-content"));
    const mainColumn = DOM.append(contentContainer, $(".chat-debug-logs-main"));
    this.tableHeader = DOM.append(mainColumn, $(".chat-debug-table-header"));
    DOM.append(this.tableHeader, $("span.chat-debug-col-created", void 0, localize("chatDebug.col.created", "Created")));
    DOM.append(this.tableHeader, $("span.chat-debug-col-name", void 0, localize("chatDebug.col.name", "Name")));
    DOM.append(this.tableHeader, $("span.chat-debug-col-details", void 0, localize("chatDebug.col.details", "Details")));
    this.progressBar = this._register(new ProgressBar(mainColumn, {
      ...defaultProgressBarStyles,
      ariaLabel: localize("chatDebug.progressAriaLabel", "Chat debug logs loading progress")
    }));
    this.bodyContainer = DOM.append(mainColumn, $(".chat-debug-logs-body"));
    this.showMoreContainer = DOM.append(mainColumn, $(".chat-debug-logs-show-more"));
    DOM.hide(this.showMoreContainer);
    this.listContainer = DOM.append(this.bodyContainer, $(".chat-debug-list-container"));
    DOM.hide(this.listContainer);
    const accessibilityProvider = {
      getAriaLabel: (e) => {
        switch (e.kind) {
          case "toolCall":
            return localize("chatDebug.aria.toolCall", "Tool call: {0}{1}", e.toolName, e.result ? ` (${e.result})` : "");
          case "modelTurn":
            return localize(
              "chatDebug.aria.modelTurn",
              "Model turn: {0}{1}{2}",
              e.model ?? localize("chatDebug.aria.model", "model"),
              e.totalTokens !== void 0 ? localize("chatDebug.aria.tokenCount", " {0} tokens", e.totalTokens) : "",
              e.cachedTokens !== void 0 ? localize("chatDebug.aria.cachedTokens", " {0} cached", e.cachedTokens) : ""
            );
          case "generic":
            return `${e.category ? e.category + ": " : ""}${e.name}: ${e.details ?? ""}`;
          case "subagentInvocation":
            return localize("chatDebug.aria.subagent", "Subagent: {0}{1}", e.agentName, e.description ? ` - ${e.description}` : "");
          case "userMessage":
            return localize("chatDebug.aria.userMessage", "User message: {0}", e.message);
          case "agentResponse":
            return localize("chatDebug.aria.agentResponse", "Agent response: {0}", e.message);
        }
      },
      getWidgetAriaLabel: () => localize("chatDebug.ariaLabel", "Chat Debug Events")
    };
    let nextFallbackId = 0;
    const fallbackIds = /* @__PURE__ */ new WeakMap();
    const identityProvider = {
      getId: (e) => {
        if (e.id) {
          return e.id;
        }
        let fallback = fallbackIds.get(e);
        if (!fallback) {
          fallback = `_fallback_${nextFallbackId++}`;
          fallbackIds.set(e, fallback);
        }
        return fallback;
      }
    };
    this.list = this._register(this.instantiationService.createInstance(
      WorkbenchList,
      "ChatDebugEvents",
      this.listContainer,
      new ChatDebugEventDelegate(),
      [new ChatDebugEventRenderer()],
      { identityProvider, accessibilityProvider }
    ));
    this.treeContainer = DOM.append(this.bodyContainer, $(".chat-debug-list-container"));
    this.tree = this._register(this.instantiationService.createInstance(
      WorkbenchObjectTree,
      "ChatDebugEventsTree",
      this.treeContainer,
      new ChatDebugEventDelegate(),
      [new ChatDebugEventTreeRenderer()],
      { identityProvider, accessibilityProvider }
    ));
    this.detailPanel = this._register(this.instantiationService.createInstance(ChatDebugDetailPanel, contentContainer));
    this._register(this.detailPanel.onDidChangeWidth(() => {
      if (this.currentDimension) {
        this.layout(this.currentDimension);
      }
    }));
    this._register(this.detailPanel.onDidHide(() => {
      if (this.list.getSelection().length > 0) {
        this.list.setSelection([]);
      }
      if (this.tree.getSelection().length > 0) {
        this.tree.setSelection([]);
      }
      if (this.currentDimension) {
        this.layout(this.currentDimension);
      }
    }));
    this._register(this.list.onContextMenu((e) => {
      if (e.element) {
        this.showEventContextMenu(e.element, e.browserEvent);
      }
    }));
    this._register(this.tree.onContextMenu((e) => {
      if (e.element) {
        this.showEventContextMenu(e.element, e.browserEvent);
      }
    }));
    this._register(this.list.onDidChangeSelection((e) => {
      const selected = e.elements[0];
      if (selected) {
        this.detailPanel.show(selected);
      } else {
        this.detailPanel.hide();
      }
    }));
    this._register(this.tree.onDidChangeSelection((e) => {
      const selected = e.elements[0];
      if (selected) {
        this.detailPanel.show(selected);
      } else {
        this.detailPanel.hide();
      }
    }));
  }
  setSession(sessionResource) {
    if (!this.currentSessionResource || this.currentSessionResource.toString() !== sessionResource.toString()) {
      this.visibleLimit = PAGE_SIZE;
    }
    this.currentSessionResource = sessionResource;
  }
  setFilterText(text) {
    this.filterWidget.setFilterText(text);
  }
  show() {
    DOM.show(this.container);
    this.loadEvents();
    this.refreshList();
  }
  hide() {
    DOM.hide(this.container);
  }
  focus() {
    if (this.logsViewMode === LogsViewMode.Tree) {
      this.tree.domFocus();
    } else {
      this.list.domFocus();
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
      new TextBreadcrumbItem(localize("chatDebug.logs", "Logs"))
    ]);
  }
  layout(dimension) {
    this.currentDimension = dimension;
    const breadcrumbHeight = 22;
    const headerHeight = this.headerContainer.offsetHeight;
    const tableHeaderHeight = this.tableHeader.offsetHeight;
    const showMoreHeight = this.showMoreContainer.offsetHeight;
    const detailVisible = this.detailPanel.isVisible;
    const detailWidth = detailVisible ? this.detailPanel.width : 0;
    const listHeight = dimension.height - breadcrumbHeight - headerHeight - tableHeaderHeight - showMoreHeight;
    const listWidth = dimension.width - detailWidth;
    if (this.logsViewMode === LogsViewMode.Tree) {
      this.tree.layout(listHeight, listWidth);
    } else {
      this.list.layout(listHeight, listWidth);
    }
    if (this.detailPanel.isVisible) {
      this.detailPanel.layout(listHeight);
    }
    this.detailPanel.layoutSash();
  }
  refreshList() {
    if (this.filterDirty) {
      this.filteredEvents = this.events.filter((e) => this.passesCurrentFilter(e));
      this.filterDirty = false;
    }
    const totalFiltered = this.filteredEvents.length;
    const display = totalFiltered > this.visibleLimit ? this.filteredEvents.slice(0, this.visibleLimit) : this.filteredEvents;
    if (this.logsViewMode === LogsViewMode.List) {
      this.list.splice(0, this.list.length, display);
    } else {
      this.refreshTree(display);
    }
    this.updateShowMore(totalFiltered);
    if (this.currentDimension) {
      this.layout(this.currentDimension);
    }
  }
  addEvent(event) {
    this.binaryInsert(this.events, event);
    if (!this.filterDirty && this.passesCurrentFilter(event)) {
      this.binaryInsert(this.filteredEvents, event);
    }
    this.scheduleRefresh();
  }
  binaryInsert(arr, event) {
    const time = event.created.getTime();
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = lo + hi >>> 1;
      if (arr[mid].created.getTime() <= time) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    if (lo === arr.length) {
      arr.push(event);
    } else {
      arr.splice(lo, 0, event);
    }
  }
  /**
   * Tests whether a single event passes the current kind + text + timestamp
   * filters. Used for incremental filtering on each addEvent() call.
   */
  passesCurrentFilter(event) {
    const category = event.kind === "generic" ? event.category : void 0;
    if (!this.filterState.isKindVisible(event.kind, category)) {
      return false;
    }
    if (!this.filterState.isTimestampVisible(event.created)) {
      return false;
    }
    this.ensureCachedTerms();
    if (this.cachedExcludeTerms.length > 0 && this.cachedExcludeTerms.some((term) => debugEventMatchesText(event, term))) {
      return false;
    }
    if (this.cachedIncludeTerms.length > 0 && !this.cachedIncludeTerms.some((term) => debugEventMatchesText(event, term))) {
      return false;
    }
    return true;
  }
  ensureCachedTerms() {
    const textOnly = this.filterState.textFilterWithoutTimestamps;
    if (textOnly === this.cachedTextFilter) {
      return;
    }
    this.cachedTextFilter = textOnly;
    if (!textOnly) {
      this.cachedIncludeTerms = [];
      this.cachedExcludeTerms = [];
      return;
    }
    const terms = textOnly.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
    this.cachedIncludeTerms = terms.filter((t) => !t.startsWith("!"));
    this.cachedExcludeTerms = terms.filter((t) => t.startsWith("!")).map((t) => t.slice(1).trim()).filter((t) => t.length > 0);
  }
  scheduleRefresh() {
    if (!this.refreshScheduler.isScheduled()) {
      this.refreshScheduler.schedule();
    }
  }
  loadEvents() {
    this.events = [...this.chatDebugService.getEvents(this.currentSessionResource || void 0)];
    this.filterDirty = true;
    const addEventDisposable = this.chatDebugService.onDidAddEvent((e) => {
      if (!this.currentSessionResource || e.sessionResource.toString() === this.currentSessionResource.toString()) {
        this.addEvent(e);
      }
    });
    const clearEventsDisposable = this.chatDebugService.onDidClearProviderEvents((sessionResource) => {
      if (!this.currentSessionResource || sessionResource.toString() === this.currentSessionResource.toString()) {
        this.events = [...this.chatDebugService.getEvents(this.currentSessionResource || void 0)];
        this.filterDirty = true;
        this.scheduleRefresh();
      }
    });
    this.eventListener.value = combinedDisposable(addEventDisposable, clearEventsDisposable);
    this.updateBreadcrumb();
    this.trackSessionState();
  }
  trackSessionState() {
    if (!this.currentSessionResource) {
      this.progressBar.stop();
      this.sessionStateDisposable.clear();
      return;
    }
    const model = this.chatService.getSession(this.currentSessionResource);
    if (!model) {
      this.progressBar.stop();
      this.sessionStateDisposable.clear();
      return;
    }
    this.sessionStateDisposable.value = autorun((reader) => {
      const inProgress = model.requestInProgress.read(reader);
      if (inProgress) {
        this.progressBar.infinite();
      } else {
        this.progressBar.stop();
      }
    });
  }
  refreshTree(filtered) {
    const treeElements = this.buildTreeHierarchy(filtered);
    this.tree.setChildren(null, treeElements);
  }
  buildTreeHierarchy(events) {
    const idToEvent = /* @__PURE__ */ new Map();
    const idToChildren = /* @__PURE__ */ new Map();
    const roots = [];
    for (const event of events) {
      if (event.id) {
        idToEvent.set(event.id, event);
      }
    }
    for (const event of events) {
      if (event.parentEventId && idToEvent.has(event.parentEventId)) {
        let children = idToChildren.get(event.parentEventId);
        if (!children) {
          children = [];
          idToChildren.set(event.parentEventId, children);
        }
        children.push(event);
      } else {
        roots.push(event);
      }
    }
    const toTreeElement = (event) => {
      const children = event.id ? idToChildren.get(event.id) : void 0;
      return {
        element: event,
        children: children?.map(toTreeElement),
        collapsible: (children?.length ?? 0) > 0,
        collapsed: false
      };
    };
    return roots.map(toTreeElement);
  }
  updateShowMore(totalFiltered) {
    if (totalFiltered <= this.visibleLimit) {
      if (this.showMoreVisible) {
        DOM.hide(this.showMoreContainer);
        this.showMoreVisible = false;
      }
      return;
    }
    if (!this.showMoreStatusLabel) {
      this.showMoreStatusLabel = DOM.append(this.showMoreContainer, $("span.chat-debug-logs-show-more-status"));
    }
    if (!this.showMoreBtn) {
      this.showMoreBtn = this.showMoreDisposables.add(new Button(this.showMoreContainer, { ...defaultButtonStyles, secondary: true, title: localize("chatDebug.showMoreTitle", "Load more events") }));
      this.showMoreDisposables.add(this.showMoreBtn.onDidClick(() => {
        this.visibleLimit += PAGE_SIZE;
        this.refreshList();
      }));
    }
    const shown = Math.min(this.visibleLimit, totalFiltered);
    const remaining = totalFiltered - shown;
    this.showMoreStatusLabel.textContent = localize("chatDebug.showingCount", "Showing {0} of {1} events", shown, totalFiltered);
    this.showMoreBtn.label = localize("chatDebug.showMore", "Show More ({0})", remaining);
    if (!this.showMoreVisible) {
      DOM.show(this.showMoreContainer);
      this.showMoreVisible = true;
    }
  }
  toggleViewMode() {
    if (this.logsViewMode === LogsViewMode.List) {
      this.logsViewMode = LogsViewMode.Tree;
      DOM.hide(this.listContainer);
      DOM.show(this.treeContainer);
    } else {
      this.logsViewMode = LogsViewMode.List;
      DOM.show(this.listContainer);
      DOM.hide(this.treeContainer);
    }
    this.updateViewModeToggle();
    this.refreshList();
    if (this.currentDimension) {
      this.layout(this.currentDimension);
    }
  }
  updateViewModeToggle() {
    const el = this.viewModeToggle.element;
    DOM.clearNode(el);
    const isTree = this.logsViewMode === LogsViewMode.Tree;
    DOM.append(el, $(`span${ThemeIcon.asCSSSelector(isTree ? Codicon.listTree : Codicon.listFlat)}`));
    const labelContainer = DOM.append(el, $("span.chat-debug-view-mode-labels"));
    const treeLabel = DOM.append(labelContainer, $("span.chat-debug-view-mode-label"));
    treeLabel.textContent = localize("chatDebug.treeView", "Tree View");
    const listLabel = DOM.append(labelContainer, $("span.chat-debug-view-mode-label"));
    listLabel.textContent = localize("chatDebug.listView", "List View");
    if (isTree) {
      listLabel.classList.add("hidden");
    } else {
      treeLabel.classList.add("hidden");
    }
    const activeLabel = isTree ? localize("chatDebug.switchToListView", "Switch to List View") : localize("chatDebug.switchToTreeView", "Switch to Tree View");
    el.setAttribute("aria-label", activeLabel);
    this.viewModeToggle.setTitle(activeLabel);
  }
  updateMoreFiltersChecked() {
    this.filterWidget.checkMoreFilters(!this.filterState.isAllFiltersDefault());
  }
  showEventContextMenu(event, browserEvent) {
    const d = event.created;
    const pad = (n) => String(n).padStart(2, "0");
    const timestamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    const row = [getEventCreatedText(event), getEventNameText(event), getEventDetailsText(event)].filter(Boolean).join("	");
    const name = getEventNameText(event);
    this.contextMenuService.showContextMenu({
      getAnchor: () => DOM.isMouseEvent(browserEvent) ? new StandardMouseEvent(DOM.getWindow(this.container), browserEvent) : this.container,
      getActions: () => [
        new Action("chatDebug.copyTimestamp", localize("chatDebug.copyTimestamp", "Copy Timestamp"), void 0, true, () => this.clipboardService.writeText(timestamp)),
        new Action("chatDebug.copyRow", localize("chatDebug.copyRow", "Copy Row"), void 0, true, () => this.clipboardService.writeText(row)),
        new Separator(),
        new Action("chatDebug.filterBefore", localize("chatDebug.filterBefore", "Filter Before Timestamp"), void 0, true, () => this.applyFilterToken(`before:${timestamp}`)),
        new Action("chatDebug.filterAfter", localize("chatDebug.filterAfter", "Filter After Timestamp"), void 0, true, () => this.applyFilterToken(`after:${timestamp}`)),
        new Action("chatDebug.filterName", localize("chatDebug.filterName", "Filter Name"), void 0, !!name, () => this.applyFilterToken(name))
      ]
    });
  }
  applyFilterToken(token) {
    this.filterWidget.setFilterText(token);
  }
};
ChatDebugLogsView = __decorateClass([
  __decorateParam(2, IChatService),
  __decorateParam(3, IChatDebugService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IClipboardService),
  __decorateParam(7, IContextMenuService)
], ChatDebugLogsView);
export {
  ChatDebugLogsView,
  LogsNavigation
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXREZWJ1Z1xcY2hhdERlYnVnTG9nc1ZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBEaW1lbnNpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEJyZWFkY3J1bWJzV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2JyZWFkY3J1bWJzL2JyZWFkY3J1bWJzV2lkZ2V0LmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IFByb2dyZXNzQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Byb2dyZXNzYmFyL3Byb2dyZXNzYmFyLmpzJztcbmltcG9ydCB7IElPYmplY3RUcmVlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBjb21iaW5lZERpc3Bvc2FibGUsIERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoTGlzdCwgV29ya2JlbmNoT2JqZWN0VHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnJlYWRjcnVtYnNXaWRnZXRTdHlsZXMsIGRlZmF1bHRCdXR0b25TdHlsZXMsIGRlZmF1bHRQcm9ncmVzc0JhclN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBGaWx0ZXJXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdGaWx0ZXIuanMnO1xuaW1wb3J0IHsgSUNoYXREZWJ1Z0V2ZW50LCBJQ2hhdERlYnVnU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0RGVidWdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGRlYnVnRXZlbnRNYXRjaGVzVGV4dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0RGVidWdFdmVudHMuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IExvY2FsQ2hhdFNlc3Npb25VcmkgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBDaGF0RGVidWdFdmVudFJlbmRlcmVyLCBDaGF0RGVidWdFdmVudERlbGVnYXRlLCBDaGF0RGVidWdFdmVudFRyZWVSZW5kZXJlciwgZ2V0RXZlbnRDcmVhdGVkVGV4dCwgZ2V0RXZlbnROYW1lVGV4dCwgZ2V0RXZlbnREZXRhaWxzVGV4dCB9IGZyb20gJy4vY2hhdERlYnVnRXZlbnRMaXN0LmpzJztcbmltcG9ydCB7IHNldHVwQnJlYWRjcnVtYktleWJvYXJkTmF2aWdhdGlvbiwgVGV4dEJyZWFkY3J1bWJJdGVtLCBMb2dzVmlld01vZGUgfSBmcm9tICcuL2NoYXREZWJ1Z1R5cGVzLmpzJztcbmltcG9ydCB7IENoYXREZWJ1Z0ZpbHRlclN0YXRlLCBiaW5kRmlsdGVyQ29udGV4dEtleXMgfSBmcm9tICcuL2NoYXREZWJ1Z0ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgQ2hhdERlYnVnRGV0YWlsUGFuZWwgfSBmcm9tICcuL2NoYXREZWJ1Z0RldGFpbFBhbmVsLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IEFjdGlvbiwgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5cbmNvbnN0ICQgPSBET00uJDtcblxuY29uc3QgUEFHRV9TSVpFID0gMTAwMDtcblxuZXhwb3J0IGNvbnN0IGVudW0gTG9nc05hdmlnYXRpb24ge1xuXHRIb21lID0gJ2hvbWUnLFxuXHRPdmVydmlldyA9ICdvdmVydmlldycsXG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0RGVidWdMb2dzVmlldyBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTmF2aWdhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxMb2dzTmF2aWdhdGlvbj4oKSk7XG5cdHJlYWRvbmx5IG9uTmF2aWdhdGUgPSB0aGlzLl9vbk5hdmlnYXRlLmV2ZW50O1xuXG5cdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgYnJlYWRjcnVtYldpZGdldDogQnJlYWRjcnVtYnNXaWRnZXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgaGVhZGVyQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSB0YWJsZUhlYWRlcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgYm9keUNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgbGlzdENvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgdHJlZUNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGV0YWlsUGFuZWw6IENoYXREZWJ1Z0RldGFpbFBhbmVsO1xuXHRwcml2YXRlIHJlYWRvbmx5IGZpbHRlcldpZGdldDogRmlsdGVyV2lkZ2V0O1xuXHRwcml2YXRlIHJlYWRvbmx5IHZpZXdNb2RlVG9nZ2xlOiBCdXR0b247XG5cblx0cHJpdmF0ZSBsaXN0OiBXb3JrYmVuY2hMaXN0PElDaGF0RGVidWdFdmVudD47XG5cdHByaXZhdGUgdHJlZTogV29ya2JlbmNoT2JqZWN0VHJlZTxJQ2hhdERlYnVnRXZlbnQsIHZvaWQ+O1xuXG5cdHByaXZhdGUgY3VycmVudFNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGxvZ3NWaWV3TW9kZTogTG9nc1ZpZXdNb2RlID0gTG9nc1ZpZXdNb2RlLlRyZWU7XG5cdHByaXZhdGUgZXZlbnRzOiBJQ2hhdERlYnVnRXZlbnRbXSA9IFtdO1xuXHRwcml2YXRlIGZpbHRlcmVkRXZlbnRzOiBJQ2hhdERlYnVnRXZlbnRbXSA9IFtdO1xuXHRwcml2YXRlIGZpbHRlckRpcnR5ID0gdHJ1ZTtcblx0cHJpdmF0ZSBjYWNoZWRJbmNsdWRlVGVybXM6IHN0cmluZ1tdID0gW107XG5cdHByaXZhdGUgY2FjaGVkRXhjbHVkZVRlcm1zOiBzdHJpbmdbXSA9IFtdO1xuXHRwcml2YXRlIGNhY2hlZFRleHRGaWx0ZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjdXJyZW50RGltZW5zaW9uOiBEaW1lbnNpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZXZlbnRMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBzZXNzaW9uU3RhdGVEaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlZnJlc2hTY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvZ3Jlc3NCYXI6IFByb2dyZXNzQmFyO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNob3dNb3JlQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBzaG93TW9yZURpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBzaG93TW9yZVN0YXR1c0xhYmVsOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzaG93TW9yZUJ0bjogQnV0dG9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHNob3dNb3JlVmlzaWJsZSA9IGZhbHNlO1xuXHRwcml2YXRlIHZpc2libGVMaW1pdCA9IFBBR0VfU0laRTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwYXJlbnQ6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZmlsdGVyU3RhdGU6IENoYXREZWJ1Z0ZpbHRlclN0YXRlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJQ2hhdERlYnVnU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXREZWJ1Z1NlcnZpY2U6IElDaGF0RGVidWdTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ2xpcGJvYXJkU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucmVmcmVzaFNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMucmVmcmVzaExpc3QoKSwgNTApKTtcblx0XHR0aGlzLmNvbnRhaW5lciA9IERPTS5hcHBlbmQocGFyZW50LCAkKCcuY2hhdC1kZWJ1Zy1sb2dzJykpO1xuXHRcdERPTS5oaWRlKHRoaXMuY29udGFpbmVyKTtcblxuXHRcdC8vIEJyZWFkY3J1bWJcblx0XHRjb25zdCBicmVhZGNydW1iQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnLmNoYXQtZGVidWctYnJlYWRjcnVtYicpKTtcblx0XHR0aGlzLmJyZWFkY3J1bWJXaWRnZXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgQnJlYWRjcnVtYnNXaWRnZXQoYnJlYWRjcnVtYkNvbnRhaW5lciwgMywgdW5kZWZpbmVkLCBDb2RpY29uLmNoZXZyb25SaWdodCwgZGVmYXVsdEJyZWFkY3J1bWJzV2lkZ2V0U3R5bGVzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2V0dXBCcmVhZGNydW1iS2V5Ym9hcmROYXZpZ2F0aW9uKGJyZWFkY3J1bWJDb250YWluZXIsIHRoaXMuYnJlYWRjcnVtYldpZGdldCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYnJlYWRjcnVtYldpZGdldC5vbkRpZFNlbGVjdEl0ZW0oZSA9PiB7XG5cdFx0XHRpZiAoZS50eXBlID09PSAnc2VsZWN0JyAmJiBlLml0ZW0gaW5zdGFuY2VvZiBUZXh0QnJlYWRjcnVtYkl0ZW0pIHtcblx0XHRcdFx0dGhpcy5icmVhZGNydW1iV2lkZ2V0LnNldFNlbGVjdGlvbih1bmRlZmluZWQpO1xuXHRcdFx0XHRjb25zdCBpdGVtcyA9IHRoaXMuYnJlYWRjcnVtYldpZGdldC5nZXRJdGVtcygpO1xuXHRcdFx0XHRjb25zdCBpZHggPSBpdGVtcy5pbmRleE9mKGUuaXRlbSk7XG5cdFx0XHRcdGlmIChpZHggPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLl9vbk5hdmlnYXRlLmZpcmUoTG9nc05hdmlnYXRpb24uSG9tZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaWR4ID09PSAxKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25OYXZpZ2F0ZS5maXJlKExvZ3NOYXZpZ2F0aW9uLk92ZXJ2aWV3KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEhlYWRlciAoZmlsdGVyKVxuXHRcdHRoaXMuaGVhZGVyQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnLmNoYXQtZGVidWctZWRpdG9yLWhlYWRlcicpKTtcblxuXHRcdC8vIFNjb3BlZCBjb250ZXh0IGtleSBzZXJ2aWNlIGZvciBmaWx0ZXIgbWVudSBpdGVtc1xuXHRcdGNvbnN0IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQodGhpcy5oZWFkZXJDb250YWluZXIpKTtcblx0XHRjb25zdCBzeW5jQ29udGV4dEtleXMgPSBiaW5kRmlsdGVyQ29udGV4dEtleXModGhpcy5maWx0ZXJTdGF0ZSwgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHN5bmNDb250ZXh0S2V5cygpO1xuXG5cdFx0Y29uc3QgY2hpbGRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQoXG5cdFx0XHRuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgc2NvcGVkQ29udGV4dEtleVNlcnZpY2VdKVxuXHRcdCkpO1xuXHRcdHRoaXMuZmlsdGVyV2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIoY2hpbGRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGaWx0ZXJXaWRnZXQsIHtcblx0XHRcdHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnY2hhdERlYnVnLnNlYXJjaCcsIFwiRmlsdGVyIChlLmcuIHRleHQsICFleGNsdWRlLCBiZWZvcmU6WVlZWS1NTS1ERFRISDpNTTpTUylcIiksXG5cdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdjaGF0RGVidWcuZmlsdGVyQXJpYUxhYmVsJywgXCJGaWx0ZXIgZGVidWcgZXZlbnRzXCIpLFxuXHRcdH0pKTtcblxuXHRcdC8vIFZpZXcgbW9kZSB0b2dnbGVcblx0XHR0aGlzLnZpZXdNb2RlVG9nZ2xlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbih0aGlzLmhlYWRlckNvbnRhaW5lciwgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUsIHRpdGxlOiBsb2NhbGl6ZSgnY2hhdERlYnVnLnRvZ2dsZVZpZXdNb2RlJywgXCJUb2dnbGUgYmV0d2VlbiBsaXN0IGFuZCB0cmVlIHZpZXdcIikgfSkpO1xuXHRcdHRoaXMudmlld01vZGVUb2dnbGUuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LWRlYnVnLXZpZXctbW9kZS10b2dnbGUnLCAnbW9uYWNvLXRleHQtYnV0dG9uJyk7XG5cdFx0dGhpcy51cGRhdGVWaWV3TW9kZVRvZ2dsZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudmlld01vZGVUb2dnbGUub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHR0aGlzLnRvZ2dsZVZpZXdNb2RlKCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZmlsdGVyQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLmhlYWRlckNvbnRhaW5lciwgJCgnLnZpZXdwYW5lLWZpbHRlci1jb250YWluZXInKSk7XG5cdFx0ZmlsdGVyQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuZmlsdGVyV2lkZ2V0LmVsZW1lbnQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWx0ZXJXaWRnZXQub25EaWRDaGFuZ2VGaWx0ZXJUZXh0KHRleHQgPT4ge1xuXHRcdFx0dGhpcy5maWx0ZXJTdGF0ZS5zZXRUZXh0RmlsdGVyKHRleHQpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFJlYWN0IHRvIHNoYXJlZCBmaWx0ZXIgc3RhdGUgY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsdGVyU3RhdGUub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0c3luY0NvbnRleHRLZXlzKCk7XG5cdFx0XHR0aGlzLnVwZGF0ZU1vcmVGaWx0ZXJzQ2hlY2tlZCgpO1xuXHRcdFx0dGhpcy52aXNpYmxlTGltaXQgPSBQQUdFX1NJWkU7XG5cdFx0XHR0aGlzLmZpbHRlckRpcnR5ID0gdHJ1ZTtcblx0XHRcdHRoaXMucmVmcmVzaExpc3QoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBDb250ZW50IHdyYXBwZXIgKGZsZXggcm93OiBtYWluIGNvbHVtbiArIGRldGFpbCBwYW5lbClcblx0XHRjb25zdCBjb250ZW50Q29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnLmNoYXQtZGVidWctbG9ncy1jb250ZW50JykpO1xuXG5cdFx0Ly8gTWFpbiBjb2x1bW4gKHRhYmxlIGhlYWRlciArIGxpc3QvdHJlZSBib2R5KVxuXHRcdGNvbnN0IG1haW5Db2x1bW4gPSBET00uYXBwZW5kKGNvbnRlbnRDb250YWluZXIsICQoJy5jaGF0LWRlYnVnLWxvZ3MtbWFpbicpKTtcblxuXHRcdC8vIFRhYmxlIGhlYWRlclxuXHRcdHRoaXMudGFibGVIZWFkZXIgPSBET00uYXBwZW5kKG1haW5Db2x1bW4sICQoJy5jaGF0LWRlYnVnLXRhYmxlLWhlYWRlcicpKTtcblx0XHRET00uYXBwZW5kKHRoaXMudGFibGVIZWFkZXIsICQoJ3NwYW4uY2hhdC1kZWJ1Zy1jb2wtY3JlYXRlZCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2NoYXREZWJ1Zy5jb2wuY3JlYXRlZCcsIFwiQ3JlYXRlZFwiKSkpO1xuXHRcdERPTS5hcHBlbmQodGhpcy50YWJsZUhlYWRlciwgJCgnc3Bhbi5jaGF0LWRlYnVnLWNvbC1uYW1lJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnY2hhdERlYnVnLmNvbC5uYW1lJywgXCJOYW1lXCIpKSk7XG5cdFx0RE9NLmFwcGVuZCh0aGlzLnRhYmxlSGVhZGVyLCAkKCdzcGFuLmNoYXQtZGVidWctY29sLWRldGFpbHMnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdjaGF0RGVidWcuY29sLmRldGFpbHMnLCBcIkRldGFpbHNcIikpKTtcblxuXHRcdC8vIFByb2dyZXNzIGJhciAoc2hvd24gd2hlbiBzZXNzaW9uIGlzIGluIHByb2dyZXNzKVxuXHRcdHRoaXMucHJvZ3Jlc3NCYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUHJvZ3Jlc3NCYXIobWFpbkNvbHVtbiwge1xuXHRcdFx0Li4uZGVmYXVsdFByb2dyZXNzQmFyU3R5bGVzLFxuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnY2hhdERlYnVnLnByb2dyZXNzQXJpYUxhYmVsJywgXCJDaGF0IGRlYnVnIGxvZ3MgbG9hZGluZyBwcm9ncmVzc1wiKVxuXHRcdH0pKTtcblxuXHRcdC8vIEJvZHkgY29udGFpbmVyXG5cdFx0dGhpcy5ib2R5Q29udGFpbmVyID0gRE9NLmFwcGVuZChtYWluQ29sdW1uLCAkKCcuY2hhdC1kZWJ1Zy1sb2dzLWJvZHknKSk7XG5cblx0XHQvLyBcIlNob3cgTW9yZVwiIGNvbnRhaW5lciAoYmVsb3cgdGhlIGJvZHksIHNob3duIHdoZW4gZXZlbnRzIGV4Y2VlZCB0aGUgdmlzaWJsZSBsaW1pdClcblx0XHR0aGlzLnNob3dNb3JlQ29udGFpbmVyID0gRE9NLmFwcGVuZChtYWluQ29sdW1uLCAkKCcuY2hhdC1kZWJ1Zy1sb2dzLXNob3ctbW9yZScpKTtcblx0XHRET00uaGlkZSh0aGlzLnNob3dNb3JlQ29udGFpbmVyKTtcblxuXHRcdC8vIExpc3QgY29udGFpbmVyIChpbml0aWFsbHkgaGlkZGVuIFx1MjAxNCB0cmVlIHZpZXcgaXMgZGVmYXVsdClcblx0XHR0aGlzLmxpc3RDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuYm9keUNvbnRhaW5lciwgJCgnLmNoYXQtZGVidWctbGlzdC1jb250YWluZXInKSk7XG5cdFx0RE9NLmhpZGUodGhpcy5saXN0Q29udGFpbmVyKTtcblxuXHRcdGNvbnN0IGFjY2Vzc2liaWxpdHlQcm92aWRlciA9IHtcblx0XHRcdGdldEFyaWFMYWJlbDogKGU6IElDaGF0RGVidWdFdmVudCkgPT4ge1xuXHRcdFx0XHRzd2l0Y2ggKGUua2luZCkge1xuXHRcdFx0XHRcdGNhc2UgJ3Rvb2xDYWxsJzogcmV0dXJuIGxvY2FsaXplKCdjaGF0RGVidWcuYXJpYS50b29sQ2FsbCcsIFwiVG9vbCBjYWxsOiB7MH17MX1cIiwgZS50b29sTmFtZSwgZS5yZXN1bHQgPyBgICgke2UucmVzdWx0fSlgIDogJycpO1xuXHRcdFx0XHRcdGNhc2UgJ21vZGVsVHVybic6IHJldHVybiBsb2NhbGl6ZSgnY2hhdERlYnVnLmFyaWEubW9kZWxUdXJuJywgXCJNb2RlbCB0dXJuOiB7MH17MX17Mn1cIixcblx0XHRcdFx0XHRcdGUubW9kZWwgPz8gbG9jYWxpemUoJ2NoYXREZWJ1Zy5hcmlhLm1vZGVsJywgXCJtb2RlbFwiKSxcblx0XHRcdFx0XHRcdGUudG90YWxUb2tlbnMgIT09IHVuZGVmaW5lZCA/IGxvY2FsaXplKCdjaGF0RGVidWcuYXJpYS50b2tlbkNvdW50JywgXCIgezB9IHRva2Vuc1wiLCBlLnRvdGFsVG9rZW5zKSA6ICcnLFxuXHRcdFx0XHRcdFx0ZS5jYWNoZWRUb2tlbnMgIT09IHVuZGVmaW5lZCA/IGxvY2FsaXplKCdjaGF0RGVidWcuYXJpYS5jYWNoZWRUb2tlbnMnLCBcIiB7MH0gY2FjaGVkXCIsIGUuY2FjaGVkVG9rZW5zKSA6ICcnKTtcblx0XHRcdFx0XHRjYXNlICdnZW5lcmljJzogcmV0dXJuIGAke2UuY2F0ZWdvcnkgPyBlLmNhdGVnb3J5ICsgJzogJyA6ICcnfSR7ZS5uYW1lfTogJHtlLmRldGFpbHMgPz8gJyd9YDtcblx0XHRcdFx0XHRjYXNlICdzdWJhZ2VudEludm9jYXRpb24nOiByZXR1cm4gbG9jYWxpemUoJ2NoYXREZWJ1Zy5hcmlhLnN1YmFnZW50JywgXCJTdWJhZ2VudDogezB9ezF9XCIsIGUuYWdlbnROYW1lLCBlLmRlc2NyaXB0aW9uID8gYCAtICR7ZS5kZXNjcmlwdGlvbn1gIDogJycpO1xuXHRcdFx0XHRcdGNhc2UgJ3VzZXJNZXNzYWdlJzogcmV0dXJuIGxvY2FsaXplKCdjaGF0RGVidWcuYXJpYS51c2VyTWVzc2FnZScsIFwiVXNlciBtZXNzYWdlOiB7MH1cIiwgZS5tZXNzYWdlKTtcblx0XHRcdFx0XHRjYXNlICdhZ2VudFJlc3BvbnNlJzogcmV0dXJuIGxvY2FsaXplKCdjaGF0RGVidWcuYXJpYS5hZ2VudFJlc3BvbnNlJywgXCJBZ2VudCByZXNwb25zZTogezB9XCIsIGUubWVzc2FnZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWw6ICgpID0+IGxvY2FsaXplKCdjaGF0RGVidWcuYXJpYUxhYmVsJywgXCJDaGF0IERlYnVnIEV2ZW50c1wiKSxcblx0XHR9O1xuXHRcdGxldCBuZXh0RmFsbGJhY2tJZCA9IDA7XG5cdFx0Y29uc3QgZmFsbGJhY2tJZHMgPSBuZXcgV2Vha01hcDxJQ2hhdERlYnVnRXZlbnQsIHN0cmluZz4oKTtcblx0XHRjb25zdCBpZGVudGl0eVByb3ZpZGVyID0ge1xuXHRcdFx0Z2V0SWQ6IChlOiBJQ2hhdERlYnVnRXZlbnQpID0+IHtcblx0XHRcdFx0aWYgKGUuaWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZS5pZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRsZXQgZmFsbGJhY2sgPSBmYWxsYmFja0lkcy5nZXQoZSk7XG5cdFx0XHRcdGlmICghZmFsbGJhY2spIHtcblx0XHRcdFx0XHRmYWxsYmFjayA9IGBfZmFsbGJhY2tfJHtuZXh0RmFsbGJhY2tJZCsrfWA7XG5cdFx0XHRcdFx0ZmFsbGJhY2tJZHMuc2V0KGUsIGZhbGxiYWNrKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZmFsbGJhY2s7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMubGlzdCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hMaXN0PElDaGF0RGVidWdFdmVudD4sXG5cdFx0XHQnQ2hhdERlYnVnRXZlbnRzJyxcblx0XHRcdHRoaXMubGlzdENvbnRhaW5lcixcblx0XHRcdG5ldyBDaGF0RGVidWdFdmVudERlbGVnYXRlKCksXG5cdFx0XHRbbmV3IENoYXREZWJ1Z0V2ZW50UmVuZGVyZXIoKV0sXG5cdFx0XHR7IGlkZW50aXR5UHJvdmlkZXIsIGFjY2Vzc2liaWxpdHlQcm92aWRlciB9XG5cdFx0KSk7XG5cblx0XHQvLyBUcmVlIGNvbnRhaW5lciAoZGVmYXVsdCB2aWV3KVxuXHRcdHRoaXMudHJlZUNvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5ib2R5Q29udGFpbmVyLCAkKCcuY2hhdC1kZWJ1Zy1saXN0LWNvbnRhaW5lcicpKTtcblxuXHRcdHRoaXMudHJlZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hPYmplY3RUcmVlPElDaGF0RGVidWdFdmVudCwgdm9pZD4sXG5cdFx0XHQnQ2hhdERlYnVnRXZlbnRzVHJlZScsXG5cdFx0XHR0aGlzLnRyZWVDb250YWluZXIsXG5cdFx0XHRuZXcgQ2hhdERlYnVnRXZlbnREZWxlZ2F0ZSgpLFxuXHRcdFx0W25ldyBDaGF0RGVidWdFdmVudFRyZWVSZW5kZXJlcigpXSxcblx0XHRcdHsgaWRlbnRpdHlQcm92aWRlciwgYWNjZXNzaWJpbGl0eVByb3ZpZGVyIH1cblx0XHQpKTtcblxuXHRcdC8vIERldGFpbCBwYW5lbCAoc2libGluZyBvZiBtYWluIGNvbHVtbiBzbyBpdCBhbGlnbnMgd2l0aCB0YWJsZSBoZWFkZXIpXG5cdFx0dGhpcy5kZXRhaWxQYW5lbCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdERlYnVnRGV0YWlsUGFuZWwsIGNvbnRlbnRDb250YWluZXIpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRldGFpbFBhbmVsLm9uRGlkQ2hhbmdlV2lkdGgoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuY3VycmVudERpbWVuc2lvbikge1xuXHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLmN1cnJlbnREaW1lbnNpb24pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRldGFpbFBhbmVsLm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5saXN0LmdldFNlbGVjdGlvbigpLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5saXN0LnNldFNlbGVjdGlvbihbXSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy50cmVlLmdldFNlbGVjdGlvbigpLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy50cmVlLnNldFNlbGVjdGlvbihbXSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5jdXJyZW50RGltZW5zaW9uKSB7XG5cdFx0XHRcdHRoaXMubGF5b3V0KHRoaXMuY3VycmVudERpbWVuc2lvbik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ29udGV4dCBtZW51XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saXN0Lm9uQ29udGV4dE1lbnUoZSA9PiB7XG5cdFx0XHRpZiAoZS5lbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMuc2hvd0V2ZW50Q29udGV4dE1lbnUoZS5lbGVtZW50LCBlLmJyb3dzZXJFdmVudCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkNvbnRleHRNZW51KGUgPT4ge1xuXHRcdFx0aWYgKGUuZWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLnNob3dFdmVudENvbnRleHRNZW51KGUuZWxlbWVudCwgZS5icm93c2VyRXZlbnQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlc29sdmUgZXZlbnQgZGV0YWlscyBvbiBzZWxlY3Rpb25cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxpc3Qub25EaWRDaGFuZ2VTZWxlY3Rpb24oZSA9PiB7XG5cdFx0XHRjb25zdCBzZWxlY3RlZCA9IGUuZWxlbWVudHNbMF07XG5cdFx0XHRpZiAoc2VsZWN0ZWQpIHtcblx0XHRcdFx0dGhpcy5kZXRhaWxQYW5lbC5zaG93KHNlbGVjdGVkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuZGV0YWlsUGFuZWwuaGlkZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZENoYW5nZVNlbGVjdGlvbihlID0+IHtcblx0XHRcdGNvbnN0IHNlbGVjdGVkID0gZS5lbGVtZW50c1swXTtcblx0XHRcdGlmIChzZWxlY3RlZCkge1xuXHRcdFx0XHR0aGlzLmRldGFpbFBhbmVsLnNob3coc2VsZWN0ZWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5kZXRhaWxQYW5lbC5oaWRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0c2V0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jdXJyZW50U2Vzc2lvblJlc291cmNlIHx8IHRoaXMuY3VycmVudFNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpICE9PSBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0dGhpcy52aXNpYmxlTGltaXQgPSBQQUdFX1NJWkU7XG5cdFx0fVxuXHRcdHRoaXMuY3VycmVudFNlc3Npb25SZXNvdXJjZSA9IHNlc3Npb25SZXNvdXJjZTtcblx0fVxuXG5cdHNldEZpbHRlclRleHQodGV4dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5maWx0ZXJXaWRnZXQuc2V0RmlsdGVyVGV4dCh0ZXh0KTtcblx0fVxuXG5cdHNob3coKTogdm9pZCB7XG5cdFx0RE9NLnNob3codGhpcy5jb250YWluZXIpO1xuXHRcdHRoaXMubG9hZEV2ZW50cygpO1xuXHRcdHRoaXMucmVmcmVzaExpc3QoKTtcblx0fVxuXG5cdGhpZGUoKTogdm9pZCB7XG5cdFx0RE9NLmhpZGUodGhpcy5jb250YWluZXIpO1xuXHR9XG5cblx0Zm9jdXMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubG9nc1ZpZXdNb2RlID09PSBMb2dzVmlld01vZGUuVHJlZSkge1xuXHRcdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubGlzdC5kb21Gb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdHVwZGF0ZUJyZWFkY3J1bWIoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvblRpdGxlID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uVGl0bGUodGhpcy5jdXJyZW50U2Vzc2lvblJlc291cmNlKSB8fCBMb2NhbENoYXRTZXNzaW9uVXJpLnBhcnNlTG9jYWxTZXNzaW9uSWQodGhpcy5jdXJyZW50U2Vzc2lvblJlc291cmNlKSB8fCB0aGlzLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHR0aGlzLmJyZWFkY3J1bWJXaWRnZXQuc2V0SXRlbXMoW1xuXHRcdFx0bmV3IFRleHRCcmVhZGNydW1iSXRlbShsb2NhbGl6ZSgnY2hhdERlYnVnLnRpdGxlJywgXCJBZ2VudCBEZWJ1ZyBMb2dzXCIpLCB0cnVlKSxcblx0XHRcdG5ldyBUZXh0QnJlYWRjcnVtYkl0ZW0oc2Vzc2lvblRpdGxlLCB0cnVlKSxcblx0XHRcdG5ldyBUZXh0QnJlYWRjcnVtYkl0ZW0obG9jYWxpemUoJ2NoYXREZWJ1Zy5sb2dzJywgXCJMb2dzXCIpKSxcblx0XHRdKTtcblx0fVxuXG5cdGxheW91dChkaW1lbnNpb246IERpbWVuc2lvbik6IHZvaWQge1xuXHRcdHRoaXMuY3VycmVudERpbWVuc2lvbiA9IGRpbWVuc2lvbjtcblx0XHRjb25zdCBicmVhZGNydW1iSGVpZ2h0ID0gMjI7XG5cdFx0Y29uc3QgaGVhZGVySGVpZ2h0ID0gdGhpcy5oZWFkZXJDb250YWluZXIub2Zmc2V0SGVpZ2h0O1xuXHRcdGNvbnN0IHRhYmxlSGVhZGVySGVpZ2h0ID0gdGhpcy50YWJsZUhlYWRlci5vZmZzZXRIZWlnaHQ7XG5cdFx0Y29uc3Qgc2hvd01vcmVIZWlnaHQgPSB0aGlzLnNob3dNb3JlQ29udGFpbmVyLm9mZnNldEhlaWdodDtcblx0XHRjb25zdCBkZXRhaWxWaXNpYmxlID0gdGhpcy5kZXRhaWxQYW5lbC5pc1Zpc2libGU7XG5cdFx0Y29uc3QgZGV0YWlsV2lkdGggPSBkZXRhaWxWaXNpYmxlID8gdGhpcy5kZXRhaWxQYW5lbC53aWR0aCA6IDA7XG5cdFx0Y29uc3QgbGlzdEhlaWdodCA9IGRpbWVuc2lvbi5oZWlnaHQgLSBicmVhZGNydW1iSGVpZ2h0IC0gaGVhZGVySGVpZ2h0IC0gdGFibGVIZWFkZXJIZWlnaHQgLSBzaG93TW9yZUhlaWdodDtcblx0XHRjb25zdCBsaXN0V2lkdGggPSBkaW1lbnNpb24ud2lkdGggLSBkZXRhaWxXaWR0aDtcblx0XHRpZiAodGhpcy5sb2dzVmlld01vZGUgPT09IExvZ3NWaWV3TW9kZS5UcmVlKSB7XG5cdFx0XHR0aGlzLnRyZWUubGF5b3V0KGxpc3RIZWlnaHQsIGxpc3RXaWR0aCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubGlzdC5sYXlvdXQobGlzdEhlaWdodCwgbGlzdFdpZHRoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZGV0YWlsUGFuZWwuaXNWaXNpYmxlKSB7XG5cdFx0XHR0aGlzLmRldGFpbFBhbmVsLmxheW91dChsaXN0SGVpZ2h0KTtcblx0XHR9XG5cdFx0dGhpcy5kZXRhaWxQYW5lbC5sYXlvdXRTYXNoKCk7XG5cdH1cblxuXHRyZWZyZXNoTGlzdCgpOiB2b2lkIHtcblx0XHQvLyBSZWJ1aWxkIHRoZSBmaWx0ZXJlZCBsaXN0IGZyb20gc2NyYXRjaCBvbmx5IHdoZW4gZmlsdGVyIGNyaXRlcmlhXG5cdFx0Ly8gY2hhbmdlZCBvciBldmVudHMgd2VyZSBidWxrLXJlbG9hZGVkLiBEdXJpbmcgc3RyZWFtaW5nIGJhY2tmaWxsXG5cdFx0Ly8gdGhlIGZpbHRlcmVkIGxpc3QgaXMga2VwdCB1cC10by1kYXRlIGluY3JlbWVudGFsbHkgdmlhIGFkZEV2ZW50KCksXG5cdFx0Ly8gbWFraW5nIGVhY2ggcmVmcmVzaCBPKDEpIGluc3RlYWQgb2YgTyhuKS5cblx0XHRpZiAodGhpcy5maWx0ZXJEaXJ0eSkge1xuXHRcdFx0dGhpcy5maWx0ZXJlZEV2ZW50cyA9IHRoaXMuZXZlbnRzLmZpbHRlcihlID0+IHRoaXMucGFzc2VzQ3VycmVudEZpbHRlcihlKSk7XG5cdFx0XHR0aGlzLmZpbHRlckRpcnR5ID0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gUGFnaW5hdGU6IHNob3cgb25seSB0aGUgZmlyc3QgYHZpc2libGVMaW1pdGAgZXZlbnRzIHRvIGtlZXAgdGhlIFVJXG5cdFx0Ly8gcmVzcG9uc2l2ZSBmb3IgbGFyZ2Ugc2Vzc2lvbnMuIFRoZSBcIlNob3cgTW9yZVwiIGJ1dHRvbiBsb2FkcyB0aGVcblx0XHQvLyBuZXh0IHBhZ2UuXG5cdFx0Y29uc3QgdG90YWxGaWx0ZXJlZCA9IHRoaXMuZmlsdGVyZWRFdmVudHMubGVuZ3RoO1xuXHRcdGNvbnN0IGRpc3BsYXkgPSB0b3RhbEZpbHRlcmVkID4gdGhpcy52aXNpYmxlTGltaXQgPyB0aGlzLmZpbHRlcmVkRXZlbnRzLnNsaWNlKDAsIHRoaXMudmlzaWJsZUxpbWl0KSA6IHRoaXMuZmlsdGVyZWRFdmVudHM7XG5cblx0XHRpZiAodGhpcy5sb2dzVmlld01vZGUgPT09IExvZ3NWaWV3TW9kZS5MaXN0KSB7XG5cdFx0XHR0aGlzLmxpc3Quc3BsaWNlKDAsIHRoaXMubGlzdC5sZW5ndGgsIGRpc3BsYXkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnJlZnJlc2hUcmVlKGRpc3BsYXkpO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlU2hvd01vcmUodG90YWxGaWx0ZXJlZCk7XG5cblx0XHQvLyBSZS1sYXlvdXQgd2hlbiBzaG93LW1vcmUgdmlzaWJpbGl0eSBjaGFuZ2VkIHNvIHRoZSBsaXN0L3RyZWVcblx0XHQvLyBoZWlnaHQgYWNjb3VudHMgZm9yIHRoZSBmb290ZXIuXG5cdFx0aWYgKHRoaXMuY3VycmVudERpbWVuc2lvbikge1xuXHRcdFx0dGhpcy5sYXlvdXQodGhpcy5jdXJyZW50RGltZW5zaW9uKTtcblx0XHR9XG5cdH1cblxuXHRhZGRFdmVudChldmVudDogSUNoYXREZWJ1Z0V2ZW50KTogdm9pZCB7XG5cdFx0Ly8gQmluYXJ5LWluc2VydCBpbnRvIHRoZSB1bmZpbHRlcmVkIGFycmF5IHRvIG1haW50YWluIGNocm9ub2xvZ2ljYWxcblx0XHQvLyBvcmRlci4gRXZlbnRzIGFsbW9zdCBhbHdheXMgYXJyaXZlIGluIG9yZGVyLCBzbyB0aGUgaW5zZXJ0aW9uXG5cdFx0Ly8gcG9pbnQgaXMgdHlwaWNhbGx5IGF0IHRoZSBlbmQgKE8obG9nIG4pIGNvbXBhcmlzb24sIE8oMSkgc3BsaWNlKS5cblx0XHR0aGlzLmJpbmFyeUluc2VydCh0aGlzLmV2ZW50cywgZXZlbnQpO1xuXG5cdFx0Ly8gSW5jcmVtZW50YWxseSB1cGRhdGUgdGhlIGZpbHRlcmVkIGxpc3Qgc28gcmVmcmVzaExpc3QoKSBkb2VzIG5vdFxuXHRcdC8vIG5lZWQgdG8gcmUtc2NhbiB0aGUgZW50aXJlIGV2ZW50cyBhcnJheSBvbiBldmVyeSBkZWJvdW5jZWQgdGljay5cblx0XHRpZiAoIXRoaXMuZmlsdGVyRGlydHkgJiYgdGhpcy5wYXNzZXNDdXJyZW50RmlsdGVyKGV2ZW50KSkge1xuXHRcdFx0dGhpcy5iaW5hcnlJbnNlcnQodGhpcy5maWx0ZXJlZEV2ZW50cywgZXZlbnQpO1xuXHRcdH1cblxuXHRcdHRoaXMuc2NoZWR1bGVSZWZyZXNoKCk7XG5cdH1cblxuXHRwcml2YXRlIGJpbmFyeUluc2VydChhcnI6IElDaGF0RGVidWdFdmVudFtdLCBldmVudDogSUNoYXREZWJ1Z0V2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgdGltZSA9IGV2ZW50LmNyZWF0ZWQuZ2V0VGltZSgpO1xuXHRcdGxldCBsbyA9IDA7XG5cdFx0bGV0IGhpID0gYXJyLmxlbmd0aDtcblx0XHR3aGlsZSAobG8gPCBoaSkge1xuXHRcdFx0Y29uc3QgbWlkID0gKGxvICsgaGkpID4+PiAxO1xuXHRcdFx0aWYgKGFyclttaWRdLmNyZWF0ZWQuZ2V0VGltZSgpIDw9IHRpbWUpIHtcblx0XHRcdFx0bG8gPSBtaWQgKyAxO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aGkgPSBtaWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChsbyA9PT0gYXJyLmxlbmd0aCkge1xuXHRcdFx0YXJyLnB1c2goZXZlbnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhcnIuc3BsaWNlKGxvLCAwLCBldmVudCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFRlc3RzIHdoZXRoZXIgYSBzaW5nbGUgZXZlbnQgcGFzc2VzIHRoZSBjdXJyZW50IGtpbmQgKyB0ZXh0ICsgdGltZXN0YW1wXG5cdCAqIGZpbHRlcnMuIFVzZWQgZm9yIGluY3JlbWVudGFsIGZpbHRlcmluZyBvbiBlYWNoIGFkZEV2ZW50KCkgY2FsbC5cblx0ICovXG5cdHByaXZhdGUgcGFzc2VzQ3VycmVudEZpbHRlcihldmVudDogSUNoYXREZWJ1Z0V2ZW50KTogYm9vbGVhbiB7XG5cdFx0Ly8gS2luZCBmaWx0ZXJcblx0XHRjb25zdCBjYXRlZ29yeSA9IGV2ZW50LmtpbmQgPT09ICdnZW5lcmljJyA/IGV2ZW50LmNhdGVnb3J5IDogdW5kZWZpbmVkO1xuXHRcdGlmICghdGhpcy5maWx0ZXJTdGF0ZS5pc0tpbmRWaXNpYmxlKGV2ZW50LmtpbmQsIGNhdGVnb3J5KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIFRpbWVzdGFtcCBmaWx0ZXJcblx0XHRpZiAoIXRoaXMuZmlsdGVyU3RhdGUuaXNUaW1lc3RhbXBWaXNpYmxlKGV2ZW50LmNyZWF0ZWQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gVGV4dCBmaWx0ZXIgXHUyMDE0IHVzZSBjYWNoZWQgcGFyc2VkIHRlcm1zIHRvIGF2b2lkIHJlLXNwbGl0dGluZyBvblxuXHRcdC8vIGV2ZXJ5IGFkZEV2ZW50KCkgY2FsbCBkdXJpbmcgcmFwaWQgYmFja2ZpbGwuXG5cdFx0dGhpcy5lbnN1cmVDYWNoZWRUZXJtcygpO1xuXHRcdGlmICh0aGlzLmNhY2hlZEV4Y2x1ZGVUZXJtcy5sZW5ndGggPiAwICYmIHRoaXMuY2FjaGVkRXhjbHVkZVRlcm1zLnNvbWUodGVybSA9PiBkZWJ1Z0V2ZW50TWF0Y2hlc1RleHQoZXZlbnQsIHRlcm0pKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5jYWNoZWRJbmNsdWRlVGVybXMubGVuZ3RoID4gMCAmJiAhdGhpcy5jYWNoZWRJbmNsdWRlVGVybXMuc29tZSh0ZXJtID0+IGRlYnVnRXZlbnRNYXRjaGVzVGV4dChldmVudCwgdGVybSkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGVuc3VyZUNhY2hlZFRlcm1zKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRleHRPbmx5ID0gdGhpcy5maWx0ZXJTdGF0ZS50ZXh0RmlsdGVyV2l0aG91dFRpbWVzdGFtcHM7XG5cdFx0aWYgKHRleHRPbmx5ID09PSB0aGlzLmNhY2hlZFRleHRGaWx0ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5jYWNoZWRUZXh0RmlsdGVyID0gdGV4dE9ubHk7XG5cdFx0aWYgKCF0ZXh0T25seSkge1xuXHRcdFx0dGhpcy5jYWNoZWRJbmNsdWRlVGVybXMgPSBbXTtcblx0XHRcdHRoaXMuY2FjaGVkRXhjbHVkZVRlcm1zID0gW107XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRlcm1zID0gdGV4dE9ubHkuc3BsaXQoJywnKS5tYXAodCA9PiB0LnRyaW0oKSkuZmlsdGVyKHQgPT4gdC5sZW5ndGggPiAwKTtcblx0XHR0aGlzLmNhY2hlZEluY2x1ZGVUZXJtcyA9IHRlcm1zLmZpbHRlcih0ID0+ICF0LnN0YXJ0c1dpdGgoJyEnKSk7XG5cdFx0dGhpcy5jYWNoZWRFeGNsdWRlVGVybXMgPSB0ZXJtcy5maWx0ZXIodCA9PiB0LnN0YXJ0c1dpdGgoJyEnKSkubWFwKHQgPT4gdC5zbGljZSgxKS50cmltKCkpLmZpbHRlcih0ID0+IHQubGVuZ3RoID4gMCk7XG5cdH1cblxuXHRwcml2YXRlIHNjaGVkdWxlUmVmcmVzaCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMucmVmcmVzaFNjaGVkdWxlci5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHR0aGlzLnJlZnJlc2hTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGxvYWRFdmVudHMoKTogdm9pZCB7XG5cdFx0dGhpcy5ldmVudHMgPSBbLi4udGhpcy5jaGF0RGVidWdTZXJ2aWNlLmdldEV2ZW50cyh0aGlzLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UgfHwgdW5kZWZpbmVkKV07XG5cdFx0dGhpcy5maWx0ZXJEaXJ0eSA9IHRydWU7XG5cblx0XHRjb25zdCBhZGRFdmVudERpc3Bvc2FibGUgPSB0aGlzLmNoYXREZWJ1Z1NlcnZpY2Uub25EaWRBZGRFdmVudChlID0+IHtcblx0XHRcdGlmICghdGhpcy5jdXJyZW50U2Vzc2lvblJlc291cmNlIHx8IGUuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkgPT09IHRoaXMuY3VycmVudFNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHRcdHRoaXMuYWRkRXZlbnQoZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBSZWxvYWQgZXZlbnRzIHdoZW4gcHJvdmlkZXIgZXZlbnRzIGFyZSBjbGVhcmVkIChiZWZvcmUgcmUtaW52b2tpbmcgcHJvdmlkZXJzKVxuXHRcdGNvbnN0IGNsZWFyRXZlbnRzRGlzcG9zYWJsZSA9IHRoaXMuY2hhdERlYnVnU2VydmljZS5vbkRpZENsZWFyUHJvdmlkZXJFdmVudHMoc2Vzc2lvblJlc291cmNlID0+IHtcblx0XHRcdGlmICghdGhpcy5jdXJyZW50U2Vzc2lvblJlc291cmNlIHx8IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpID09PSB0aGlzLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0XHR0aGlzLmV2ZW50cyA9IFsuLi50aGlzLmNoYXREZWJ1Z1NlcnZpY2UuZ2V0RXZlbnRzKHRoaXMuY3VycmVudFNlc3Npb25SZXNvdXJjZSB8fCB1bmRlZmluZWQpXTtcblx0XHRcdFx0dGhpcy5maWx0ZXJEaXJ0eSA9IHRydWU7XG5cdFx0XHRcdC8vIENvYWxlc2NlIHdpdGggdGhlIHJlLWFkZGVkIGV2ZW50cyB0aGF0IGZvbGxvdyBpbiB0aGUgc2FtZVxuXHRcdFx0XHQvLyBpbnZva2VQcm92aWRlcnMoKSBwYXNzIGluc3RlYWQgb2YgcmVmcmVzaGluZyBzeW5jaHJvbm91c2x5OlxuXHRcdFx0XHQvLyBhIHN5bmNocm9ub3VzIHJlZnJlc2ggaGVyZSB3b3VsZCBtb21lbnRhcmlseSBjb2xsYXBzZSB0aGVcblx0XHRcdFx0Ly8gbGlzdCB0byB0aGUgKG5lYXItZW1wdHkpIGNvcmUtb25seSBzZXQgYmVmb3JlIHRoZSBwcm92aWRlclxuXHRcdFx0XHQvLyBldmVudHMgYXJlIHJlLWFkZGVkLCBjYXVzaW5nIGEgdmlzaWJsZSBmbGlja2VyLiBEZWZlcnJpbmdcblx0XHRcdFx0Ly8gbGV0cyB0aGUgZGVib3VuY2VkIHJlZnJlc2ggcmVidWlsZCB0aGUgbGlzdCBvbmNlIHdpdGggdGhlXG5cdFx0XHRcdC8vIGZ1bGwgc2V0LlxuXHRcdFx0XHR0aGlzLnNjaGVkdWxlUmVmcmVzaCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5ldmVudExpc3RlbmVyLnZhbHVlID0gY29tYmluZWREaXNwb3NhYmxlKGFkZEV2ZW50RGlzcG9zYWJsZSwgY2xlYXJFdmVudHNEaXNwb3NhYmxlKTtcblx0XHR0aGlzLnVwZGF0ZUJyZWFkY3J1bWIoKTtcblx0XHR0aGlzLnRyYWNrU2Vzc2lvblN0YXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIHRyYWNrU2Vzc2lvblN0YXRlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jdXJyZW50U2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHR0aGlzLnByb2dyZXNzQmFyLnN0b3AoKTtcblx0XHRcdHRoaXMuc2Vzc2lvblN0YXRlRGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uKHRoaXMuY3VycmVudFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0dGhpcy5wcm9ncmVzc0Jhci5zdG9wKCk7XG5cdFx0XHR0aGlzLnNlc3Npb25TdGF0ZURpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnNlc3Npb25TdGF0ZURpc3Bvc2FibGUudmFsdWUgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBpblByb2dyZXNzID0gbW9kZWwucmVxdWVzdEluUHJvZ3Jlc3MucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGluUHJvZ3Jlc3MpIHtcblx0XHRcdFx0dGhpcy5wcm9ncmVzc0Jhci5pbmZpbml0ZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5wcm9ncmVzc0Jhci5zdG9wKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZnJlc2hUcmVlKGZpbHRlcmVkOiByZWFkb25seSBJQ2hhdERlYnVnRXZlbnRbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHRyZWVFbGVtZW50cyA9IHRoaXMuYnVpbGRUcmVlSGllcmFyY2h5KGZpbHRlcmVkKTtcblx0XHR0aGlzLnRyZWUuc2V0Q2hpbGRyZW4obnVsbCwgdHJlZUVsZW1lbnRzKTtcblx0fVxuXG5cdHByaXZhdGUgYnVpbGRUcmVlSGllcmFyY2h5KGV2ZW50czogcmVhZG9ubHkgSUNoYXREZWJ1Z0V2ZW50W10pOiBJT2JqZWN0VHJlZUVsZW1lbnQ8SUNoYXREZWJ1Z0V2ZW50PltdIHtcblx0XHRjb25zdCBpZFRvRXZlbnQgPSBuZXcgTWFwPHN0cmluZywgSUNoYXREZWJ1Z0V2ZW50PigpO1xuXHRcdGNvbnN0IGlkVG9DaGlsZHJlbiA9IG5ldyBNYXA8c3RyaW5nLCBJQ2hhdERlYnVnRXZlbnRbXT4oKTtcblx0XHRjb25zdCByb290czogSUNoYXREZWJ1Z0V2ZW50W10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgZXZlbnQgb2YgZXZlbnRzKSB7XG5cdFx0XHRpZiAoZXZlbnQuaWQpIHtcblx0XHRcdFx0aWRUb0V2ZW50LnNldChldmVudC5pZCwgZXZlbnQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgZXZlbnQgb2YgZXZlbnRzKSB7XG5cdFx0XHRpZiAoZXZlbnQucGFyZW50RXZlbnRJZCAmJiBpZFRvRXZlbnQuaGFzKGV2ZW50LnBhcmVudEV2ZW50SWQpKSB7XG5cdFx0XHRcdGxldCBjaGlsZHJlbiA9IGlkVG9DaGlsZHJlbi5nZXQoZXZlbnQucGFyZW50RXZlbnRJZCk7XG5cdFx0XHRcdGlmICghY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRjaGlsZHJlbiA9IFtdO1xuXHRcdFx0XHRcdGlkVG9DaGlsZHJlbi5zZXQoZXZlbnQucGFyZW50RXZlbnRJZCwgY2hpbGRyZW4pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNoaWxkcmVuLnB1c2goZXZlbnQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cm9vdHMucHVzaChldmVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9UcmVlRWxlbWVudCA9IChldmVudDogSUNoYXREZWJ1Z0V2ZW50KTogSU9iamVjdFRyZWVFbGVtZW50PElDaGF0RGVidWdFdmVudD4gPT4ge1xuXHRcdFx0Y29uc3QgY2hpbGRyZW4gPSBldmVudC5pZCA/IGlkVG9DaGlsZHJlbi5nZXQoZXZlbnQuaWQpIDogdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZWxlbWVudDogZXZlbnQsXG5cdFx0XHRcdGNoaWxkcmVuOiBjaGlsZHJlbj8ubWFwKHRvVHJlZUVsZW1lbnQpLFxuXHRcdFx0XHRjb2xsYXBzaWJsZTogKGNoaWxkcmVuPy5sZW5ndGggPz8gMCkgPiAwLFxuXHRcdFx0XHRjb2xsYXBzZWQ6IGZhbHNlLFxuXHRcdFx0fTtcblx0XHR9O1xuXG5cdFx0cmV0dXJuIHJvb3RzLm1hcCh0b1RyZWVFbGVtZW50KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU2hvd01vcmUodG90YWxGaWx0ZXJlZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRvdGFsRmlsdGVyZWQgPD0gdGhpcy52aXNpYmxlTGltaXQpIHtcblx0XHRcdGlmICh0aGlzLnNob3dNb3JlVmlzaWJsZSkge1xuXHRcdFx0XHRET00uaGlkZSh0aGlzLnNob3dNb3JlQ29udGFpbmVyKTtcblx0XHRcdFx0dGhpcy5zaG93TW9yZVZpc2libGUgPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgdGhlIHN0YXR1cyBsYWJlbCBhbmQgYnV0dG9uIG9uY2UsIHRoZW4gcmV1c2UuXG5cdFx0aWYgKCF0aGlzLnNob3dNb3JlU3RhdHVzTGFiZWwpIHtcblx0XHRcdHRoaXMuc2hvd01vcmVTdGF0dXNMYWJlbCA9IERPTS5hcHBlbmQodGhpcy5zaG93TW9yZUNvbnRhaW5lciwgJCgnc3Bhbi5jaGF0LWRlYnVnLWxvZ3Mtc2hvdy1tb3JlLXN0YXR1cycpKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLnNob3dNb3JlQnRuKSB7XG5cdFx0XHR0aGlzLnNob3dNb3JlQnRuID0gdGhpcy5zaG93TW9yZURpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKHRoaXMuc2hvd01vcmVDb250YWluZXIsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlLCB0aXRsZTogbG9jYWxpemUoJ2NoYXREZWJ1Zy5zaG93TW9yZVRpdGxlJywgXCJMb2FkIG1vcmUgZXZlbnRzXCIpIH0pKTtcblx0XHRcdHRoaXMuc2hvd01vcmVEaXNwb3NhYmxlcy5hZGQodGhpcy5zaG93TW9yZUJ0bi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdFx0dGhpcy52aXNpYmxlTGltaXQgKz0gUEFHRV9TSVpFO1xuXHRcdFx0XHR0aGlzLnJlZnJlc2hMaXN0KCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2hvd24gPSBNYXRoLm1pbih0aGlzLnZpc2libGVMaW1pdCwgdG90YWxGaWx0ZXJlZCk7XG5cdFx0Y29uc3QgcmVtYWluaW5nID0gdG90YWxGaWx0ZXJlZCAtIHNob3duO1xuXG5cdFx0dGhpcy5zaG93TW9yZVN0YXR1c0xhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2NoYXREZWJ1Zy5zaG93aW5nQ291bnQnLCBcIlNob3dpbmcgezB9IG9mIHsxfSBldmVudHNcIiwgc2hvd24sIHRvdGFsRmlsdGVyZWQpO1xuXHRcdHRoaXMuc2hvd01vcmVCdG4ubGFiZWwgPSBsb2NhbGl6ZSgnY2hhdERlYnVnLnNob3dNb3JlJywgXCJTaG93IE1vcmUgKHswfSlcIiwgcmVtYWluaW5nKTtcblxuXHRcdGlmICghdGhpcy5zaG93TW9yZVZpc2libGUpIHtcblx0XHRcdERPTS5zaG93KHRoaXMuc2hvd01vcmVDb250YWluZXIpO1xuXHRcdFx0dGhpcy5zaG93TW9yZVZpc2libGUgPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdG9nZ2xlVmlld01vZGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubG9nc1ZpZXdNb2RlID09PSBMb2dzVmlld01vZGUuTGlzdCkge1xuXHRcdFx0dGhpcy5sb2dzVmlld01vZGUgPSBMb2dzVmlld01vZGUuVHJlZTtcblx0XHRcdERPTS5oaWRlKHRoaXMubGlzdENvbnRhaW5lcik7XG5cdFx0XHRET00uc2hvdyh0aGlzLnRyZWVDb250YWluZXIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ3NWaWV3TW9kZSA9IExvZ3NWaWV3TW9kZS5MaXN0O1xuXHRcdFx0RE9NLnNob3codGhpcy5saXN0Q29udGFpbmVyKTtcblx0XHRcdERPTS5oaWRlKHRoaXMudHJlZUNvbnRhaW5lcik7XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlVmlld01vZGVUb2dnbGUoKTtcblx0XHR0aGlzLnJlZnJlc2hMaXN0KCk7XG5cdFx0aWYgKHRoaXMuY3VycmVudERpbWVuc2lvbikge1xuXHRcdFx0dGhpcy5sYXlvdXQodGhpcy5jdXJyZW50RGltZW5zaW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVZpZXdNb2RlVG9nZ2xlKCk6IHZvaWQge1xuXHRcdGNvbnN0IGVsID0gdGhpcy52aWV3TW9kZVRvZ2dsZS5lbGVtZW50O1xuXHRcdERPTS5jbGVhck5vZGUoZWwpO1xuXHRcdGNvbnN0IGlzVHJlZSA9IHRoaXMubG9nc1ZpZXdNb2RlID09PSBMb2dzVmlld01vZGUuVHJlZTtcblx0XHRET00uYXBwZW5kKGVsLCAkKGBzcGFuJHtUaGVtZUljb24uYXNDU1NTZWxlY3Rvcihpc1RyZWUgPyBDb2RpY29uLmxpc3RUcmVlIDogQ29kaWNvbi5saXN0RmxhdCl9YCkpO1xuXG5cdFx0Y29uc3QgbGFiZWxDb250YWluZXIgPSBET00uYXBwZW5kKGVsLCAkKCdzcGFuLmNoYXQtZGVidWctdmlldy1tb2RlLWxhYmVscycpKTtcblx0XHRjb25zdCB0cmVlTGFiZWwgPSBET00uYXBwZW5kKGxhYmVsQ29udGFpbmVyLCAkKCdzcGFuLmNoYXQtZGVidWctdmlldy1tb2RlLWxhYmVsJykpO1xuXHRcdHRyZWVMYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0RGVidWcudHJlZVZpZXcnLCBcIlRyZWUgVmlld1wiKTtcblx0XHRjb25zdCBsaXN0TGFiZWwgPSBET00uYXBwZW5kKGxhYmVsQ29udGFpbmVyLCAkKCdzcGFuLmNoYXQtZGVidWctdmlldy1tb2RlLWxhYmVsJykpO1xuXHRcdGxpc3RMYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0RGVidWcubGlzdFZpZXcnLCBcIkxpc3QgVmlld1wiKTtcblxuXHRcdGlmIChpc1RyZWUpIHtcblx0XHRcdGxpc3RMYWJlbC5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dHJlZUxhYmVsLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGl2ZUxhYmVsID0gaXNUcmVlXG5cdFx0XHQ/IGxvY2FsaXplKCdjaGF0RGVidWcuc3dpdGNoVG9MaXN0VmlldycsIFwiU3dpdGNoIHRvIExpc3QgVmlld1wiKVxuXHRcdFx0OiBsb2NhbGl6ZSgnY2hhdERlYnVnLnN3aXRjaFRvVHJlZVZpZXcnLCBcIlN3aXRjaCB0byBUcmVlIFZpZXdcIik7XG5cdFx0ZWwuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgYWN0aXZlTGFiZWwpO1xuXHRcdHRoaXMudmlld01vZGVUb2dnbGUuc2V0VGl0bGUoYWN0aXZlTGFiZWwpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVNb3JlRmlsdGVyc0NoZWNrZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5maWx0ZXJXaWRnZXQuY2hlY2tNb3JlRmlsdGVycyghdGhpcy5maWx0ZXJTdGF0ZS5pc0FsbEZpbHRlcnNEZWZhdWx0KCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG93RXZlbnRDb250ZXh0TWVudShldmVudDogSUNoYXREZWJ1Z0V2ZW50LCBicm93c2VyRXZlbnQ6IFVJRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCBkID0gZXZlbnQuY3JlYXRlZDtcblx0XHRjb25zdCBwYWQgPSAobjogbnVtYmVyKSA9PiBTdHJpbmcobikucGFkU3RhcnQoMiwgJzAnKTtcblx0XHRjb25zdCB0aW1lc3RhbXAgPSBgJHtkLmdldEZ1bGxZZWFyKCl9LSR7cGFkKGQuZ2V0TW9udGgoKSArIDEpfS0ke3BhZChkLmdldERhdGUoKSl9VCR7cGFkKGQuZ2V0SG91cnMoKSl9OiR7cGFkKGQuZ2V0TWludXRlcygpKX06JHtwYWQoZC5nZXRTZWNvbmRzKCkpfWA7XG5cdFx0Y29uc3Qgcm93ID0gW2dldEV2ZW50Q3JlYXRlZFRleHQoZXZlbnQpLCBnZXRFdmVudE5hbWVUZXh0KGV2ZW50KSwgZ2V0RXZlbnREZXRhaWxzVGV4dChldmVudCldLmZpbHRlcihCb29sZWFuKS5qb2luKCdcXHQnKTtcblx0XHRjb25zdCBuYW1lID0gZ2V0RXZlbnROYW1lVGV4dChldmVudCk7XG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gRE9NLmlzTW91c2VFdmVudChicm93c2VyRXZlbnQpXG5cdFx0XHRcdD8gbmV3IFN0YW5kYXJkTW91c2VFdmVudChET00uZ2V0V2luZG93KHRoaXMuY29udGFpbmVyKSwgYnJvd3NlckV2ZW50KVxuXHRcdFx0XHQ6IHRoaXMuY29udGFpbmVyLFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gW1xuXHRcdFx0XHRuZXcgQWN0aW9uKCdjaGF0RGVidWcuY29weVRpbWVzdGFtcCcsIGxvY2FsaXplKCdjaGF0RGVidWcuY29weVRpbWVzdGFtcCcsIFwiQ29weSBUaW1lc3RhbXBcIiksIHVuZGVmaW5lZCwgdHJ1ZSwgKCkgPT4gdGhpcy5jbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dCh0aW1lc3RhbXApKSxcblx0XHRcdFx0bmV3IEFjdGlvbignY2hhdERlYnVnLmNvcHlSb3cnLCBsb2NhbGl6ZSgnY2hhdERlYnVnLmNvcHlSb3cnLCBcIkNvcHkgUm93XCIpLCB1bmRlZmluZWQsIHRydWUsICgpID0+IHRoaXMuY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQocm93KSksXG5cdFx0XHRcdG5ldyBTZXBhcmF0b3IoKSxcblx0XHRcdFx0bmV3IEFjdGlvbignY2hhdERlYnVnLmZpbHRlckJlZm9yZScsIGxvY2FsaXplKCdjaGF0RGVidWcuZmlsdGVyQmVmb3JlJywgXCJGaWx0ZXIgQmVmb3JlIFRpbWVzdGFtcFwiKSwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiB0aGlzLmFwcGx5RmlsdGVyVG9rZW4oYGJlZm9yZToke3RpbWVzdGFtcH1gKSksXG5cdFx0XHRcdG5ldyBBY3Rpb24oJ2NoYXREZWJ1Zy5maWx0ZXJBZnRlcicsIGxvY2FsaXplKCdjaGF0RGVidWcuZmlsdGVyQWZ0ZXInLCBcIkZpbHRlciBBZnRlciBUaW1lc3RhbXBcIiksIHVuZGVmaW5lZCwgdHJ1ZSwgKCkgPT4gdGhpcy5hcHBseUZpbHRlclRva2VuKGBhZnRlcjoke3RpbWVzdGFtcH1gKSksXG5cdFx0XHRcdG5ldyBBY3Rpb24oJ2NoYXREZWJ1Zy5maWx0ZXJOYW1lJywgbG9jYWxpemUoJ2NoYXREZWJ1Zy5maWx0ZXJOYW1lJywgXCJGaWx0ZXIgTmFtZVwiKSwgdW5kZWZpbmVkLCAhIW5hbWUsICgpID0+IHRoaXMuYXBwbHlGaWx0ZXJUb2tlbihuYW1lKSksXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBseUZpbHRlclRva2VuKHRva2VuOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmZpbHRlcldpZGdldC5zZXRGaWx0ZXJUZXh0KHRva2VuKTtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUVyQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLG9CQUFvQixZQUFZLGlCQUFpQix5QkFBeUI7QUFDbkYsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZSwyQkFBMkI7QUFDbkQsU0FBUyxnQ0FBZ0MscUJBQXFCLGdDQUFnQztBQUM5RixTQUFTLG9CQUFvQjtBQUM3QixTQUEwQix5QkFBeUI7QUFDbkQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx3QkFBd0Isd0JBQXdCLDRCQUE0QixxQkFBcUIsa0JBQWtCLDJCQUEyQjtBQUN2SixTQUFTLG1DQUFtQyxvQkFBb0Isb0JBQW9CO0FBQ3BGLFNBQStCLDZCQUE2QjtBQUM1RCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLFFBQVEsaUJBQWlCO0FBQ2xDLFNBQVMsMEJBQTBCO0FBRW5DLE1BQU0sSUFBSSxJQUFJO0FBRWQsTUFBTSxZQUFZO0FBRVgsSUFBVyxpQkFBWCxrQkFBV0Esb0JBQVg7QUFDTixFQUFBQSxnQkFBQSxVQUFPO0FBQ1AsRUFBQUEsZ0JBQUEsY0FBVztBQUZNLFNBQUFBO0FBQUEsR0FBQTtBQUtYLElBQU0sb0JBQU4sY0FBZ0MsV0FBVztBQUFBLEVBdUNqRCxZQUNDLFFBQ2lCLGFBQ2MsYUFDSyxrQkFDSSxzQkFDSCxtQkFDRCxrQkFDRSxvQkFDckM7QUFDRCxVQUFNO0FBUlc7QUFDYztBQUNLO0FBQ0k7QUFDSDtBQUNEO0FBQ0U7QUE3Q3ZDLFNBQWlCLGNBQWMsS0FBSyxVQUFVLElBQUksUUFBd0IsQ0FBQztBQUMzRSxTQUFTLGFBQWEsS0FBSyxZQUFZO0FBaUJ2QyxTQUFRLGVBQTZCLGFBQWE7QUFDbEQsU0FBUSxTQUE0QixDQUFDO0FBQ3JDLFNBQVEsaUJBQW9DLENBQUM7QUFDN0MsU0FBUSxjQUFjO0FBQ3RCLFNBQVEscUJBQStCLENBQUM7QUFDeEMsU0FBUSxxQkFBK0IsQ0FBQztBQUd4QyxTQUFpQixnQkFBZ0IsS0FBSyxVQUFVLElBQUksa0JBQWtCLENBQUM7QUFDdkUsU0FBaUIseUJBQXlCLEtBQUssVUFBVSxJQUFJLGtCQUFrQixDQUFDO0FBSWhGLFNBQWlCLHNCQUFzQixLQUFLLFVBQVUsSUFBSSxnQkFBZ0IsQ0FBQztBQUczRSxTQUFRLGtCQUFrQjtBQUMxQixTQUFRLGVBQWU7QUFhdEIsU0FBSyxtQkFBbUIsS0FBSyxVQUFVLElBQUksaUJBQWlCLE1BQU0sS0FBSyxZQUFZLEdBQUcsRUFBRSxDQUFDO0FBQ3pGLFNBQUssWUFBWSxJQUFJLE9BQU8sUUFBUSxFQUFFLGtCQUFrQixDQUFDO0FBQ3pELFFBQUksS0FBSyxLQUFLLFNBQVM7QUFHdkIsVUFBTSxzQkFBc0IsSUFBSSxPQUFPLEtBQUssV0FBVyxFQUFFLHdCQUF3QixDQUFDO0FBQ2xGLFNBQUssbUJBQW1CLEtBQUssVUFBVSxJQUFJLGtCQUFrQixxQkFBcUIsR0FBRyxRQUFXLFFBQVEsY0FBYyw4QkFBOEIsQ0FBQztBQUNySixTQUFLLFVBQVUsa0NBQWtDLHFCQUFxQixLQUFLLGdCQUFnQixDQUFDO0FBQzVGLFNBQUssVUFBVSxLQUFLLGlCQUFpQixnQkFBZ0IsT0FBSztBQUN6RCxVQUFJLEVBQUUsU0FBUyxZQUFZLEVBQUUsZ0JBQWdCLG9CQUFvQjtBQUNoRSxhQUFLLGlCQUFpQixhQUFhLE1BQVM7QUFDNUMsY0FBTSxRQUFRLEtBQUssaUJBQWlCLFNBQVM7QUFDN0MsY0FBTSxNQUFNLE1BQU0sUUFBUSxFQUFFLElBQUk7QUFDaEMsWUFBSSxRQUFRLEdBQUc7QUFDZCxlQUFLLFlBQVksS0FBSyxpQkFBbUI7QUFBQSxRQUMxQyxXQUFXLFFBQVEsR0FBRztBQUNyQixlQUFLLFlBQVksS0FBSyx5QkFBdUI7QUFBQSxRQUM5QztBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUdGLFNBQUssa0JBQWtCLElBQUksT0FBTyxLQUFLLFdBQVcsRUFBRSwyQkFBMkIsQ0FBQztBQUdoRixVQUFNLDBCQUEwQixLQUFLLFVBQVUsS0FBSyxrQkFBa0IsYUFBYSxLQUFLLGVBQWUsQ0FBQztBQUN4RyxVQUFNLGtCQUFrQixzQkFBc0IsS0FBSyxhQUFhLHVCQUF1QjtBQUN2RixvQkFBZ0I7QUFFaEIsVUFBTSw0QkFBNEIsS0FBSyxVQUFVLEtBQUsscUJBQXFCO0FBQUEsTUFDMUUsSUFBSSxrQkFBa0IsQ0FBQyxvQkFBb0IsdUJBQXVCLENBQUM7QUFBQSxJQUNwRSxDQUFDO0FBQ0QsU0FBSyxlQUFlLEtBQUssVUFBVSwwQkFBMEIsZUFBZSxjQUFjO0FBQUEsTUFDekYsYUFBYSxTQUFTLG9CQUFvQiwwREFBMEQ7QUFBQSxNQUNwRyxXQUFXLFNBQVMsNkJBQTZCLHFCQUFxQjtBQUFBLElBQ3ZFLENBQUMsQ0FBQztBQUdGLFNBQUssaUJBQWlCLEtBQUssVUFBVSxJQUFJLE9BQU8sS0FBSyxpQkFBaUIsRUFBRSxHQUFHLHFCQUFxQixXQUFXLE1BQU0sT0FBTyxTQUFTLDRCQUE0QixtQ0FBbUMsRUFBRSxDQUFDLENBQUM7QUFDcE0sU0FBSyxlQUFlLFFBQVEsVUFBVSxJQUFJLCtCQUErQixvQkFBb0I7QUFDN0YsU0FBSyxxQkFBcUI7QUFDMUIsU0FBSyxVQUFVLEtBQUssZUFBZSxXQUFXLE1BQU07QUFDbkQsV0FBSyxlQUFlO0FBQUEsSUFDckIsQ0FBQyxDQUFDO0FBRUYsVUFBTSxrQkFBa0IsSUFBSSxPQUFPLEtBQUssaUJBQWlCLEVBQUUsNEJBQTRCLENBQUM7QUFDeEYsb0JBQWdCLFlBQVksS0FBSyxhQUFhLE9BQU87QUFFckQsU0FBSyxVQUFVLEtBQUssYUFBYSxzQkFBc0IsVUFBUTtBQUM5RCxXQUFLLFlBQVksY0FBYyxJQUFJO0FBQUEsSUFDcEMsQ0FBQyxDQUFDO0FBR0YsU0FBSyxVQUFVLEtBQUssWUFBWSxZQUFZLE1BQU07QUFDakQsc0JBQWdCO0FBQ2hCLFdBQUsseUJBQXlCO0FBQzlCLFdBQUssZUFBZTtBQUNwQixXQUFLLGNBQWM7QUFDbkIsV0FBSyxZQUFZO0FBQUEsSUFDbEIsQ0FBQyxDQUFDO0FBR0YsVUFBTSxtQkFBbUIsSUFBSSxPQUFPLEtBQUssV0FBVyxFQUFFLDBCQUEwQixDQUFDO0FBR2pGLFVBQU0sYUFBYSxJQUFJLE9BQU8sa0JBQWtCLEVBQUUsdUJBQXVCLENBQUM7QUFHMUUsU0FBSyxjQUFjLElBQUksT0FBTyxZQUFZLEVBQUUsMEJBQTBCLENBQUM7QUFDdkUsUUFBSSxPQUFPLEtBQUssYUFBYSxFQUFFLCtCQUErQixRQUFXLFNBQVMseUJBQXlCLFNBQVMsQ0FBQyxDQUFDO0FBQ3RILFFBQUksT0FBTyxLQUFLLGFBQWEsRUFBRSw0QkFBNEIsUUFBVyxTQUFTLHNCQUFzQixNQUFNLENBQUMsQ0FBQztBQUM3RyxRQUFJLE9BQU8sS0FBSyxhQUFhLEVBQUUsK0JBQStCLFFBQVcsU0FBUyx5QkFBeUIsU0FBUyxDQUFDLENBQUM7QUFHdEgsU0FBSyxjQUFjLEtBQUssVUFBVSxJQUFJLFlBQVksWUFBWTtBQUFBLE1BQzdELEdBQUc7QUFBQSxNQUNILFdBQVcsU0FBUywrQkFBK0Isa0NBQWtDO0FBQUEsSUFDdEYsQ0FBQyxDQUFDO0FBR0YsU0FBSyxnQkFBZ0IsSUFBSSxPQUFPLFlBQVksRUFBRSx1QkFBdUIsQ0FBQztBQUd0RSxTQUFLLG9CQUFvQixJQUFJLE9BQU8sWUFBWSxFQUFFLDRCQUE0QixDQUFDO0FBQy9FLFFBQUksS0FBSyxLQUFLLGlCQUFpQjtBQUcvQixTQUFLLGdCQUFnQixJQUFJLE9BQU8sS0FBSyxlQUFlLEVBQUUsNEJBQTRCLENBQUM7QUFDbkYsUUFBSSxLQUFLLEtBQUssYUFBYTtBQUUzQixVQUFNLHdCQUF3QjtBQUFBLE1BQzdCLGNBQWMsQ0FBQyxNQUF1QjtBQUNyQyxnQkFBUSxFQUFFLE1BQU07QUFBQSxVQUNmLEtBQUs7QUFBWSxtQkFBTyxTQUFTLDJCQUEyQixxQkFBcUIsRUFBRSxVQUFVLEVBQUUsU0FBUyxLQUFLLEVBQUUsTUFBTSxNQUFNLEVBQUU7QUFBQSxVQUM3SCxLQUFLO0FBQWEsbUJBQU87QUFBQSxjQUFTO0FBQUEsY0FBNEI7QUFBQSxjQUM3RCxFQUFFLFNBQVMsU0FBUyx3QkFBd0IsT0FBTztBQUFBLGNBQ25ELEVBQUUsZ0JBQWdCLFNBQVksU0FBUyw2QkFBNkIsZUFBZSxFQUFFLFdBQVcsSUFBSTtBQUFBLGNBQ3BHLEVBQUUsaUJBQWlCLFNBQVksU0FBUywrQkFBK0IsZUFBZSxFQUFFLFlBQVksSUFBSTtBQUFBLFlBQUU7QUFBQSxVQUMzRyxLQUFLO0FBQVcsbUJBQU8sR0FBRyxFQUFFLFdBQVcsRUFBRSxXQUFXLE9BQU8sRUFBRSxHQUFHLEVBQUUsSUFBSSxLQUFLLEVBQUUsV0FBVyxFQUFFO0FBQUEsVUFDMUYsS0FBSztBQUFzQixtQkFBTyxTQUFTLDJCQUEyQixvQkFBb0IsRUFBRSxXQUFXLEVBQUUsY0FBYyxNQUFNLEVBQUUsV0FBVyxLQUFLLEVBQUU7QUFBQSxVQUNqSixLQUFLO0FBQWUsbUJBQU8sU0FBUyw4QkFBOEIscUJBQXFCLEVBQUUsT0FBTztBQUFBLFVBQ2hHLEtBQUs7QUFBaUIsbUJBQU8sU0FBUyxnQ0FBZ0MsdUJBQXVCLEVBQUUsT0FBTztBQUFBLFFBQ3ZHO0FBQUEsTUFDRDtBQUFBLE1BQ0Esb0JBQW9CLE1BQU0sU0FBUyx1QkFBdUIsbUJBQW1CO0FBQUEsSUFDOUU7QUFDQSxRQUFJLGlCQUFpQjtBQUNyQixVQUFNLGNBQWMsb0JBQUksUUFBaUM7QUFDekQsVUFBTSxtQkFBbUI7QUFBQSxNQUN4QixPQUFPLENBQUMsTUFBdUI7QUFDOUIsWUFBSSxFQUFFLElBQUk7QUFDVCxpQkFBTyxFQUFFO0FBQUEsUUFDVjtBQUNBLFlBQUksV0FBVyxZQUFZLElBQUksQ0FBQztBQUNoQyxZQUFJLENBQUMsVUFBVTtBQUNkLHFCQUFXLGFBQWEsZ0JBQWdCO0FBQ3hDLHNCQUFZLElBQUksR0FBRyxRQUFRO0FBQUEsUUFDNUI7QUFDQSxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFFQSxTQUFLLE9BQU8sS0FBSyxVQUFVLEtBQUsscUJBQXFCO0FBQUEsTUFDcEQ7QUFBQSxNQUNBO0FBQUEsTUFDQSxLQUFLO0FBQUEsTUFDTCxJQUFJLHVCQUF1QjtBQUFBLE1BQzNCLENBQUMsSUFBSSx1QkFBdUIsQ0FBQztBQUFBLE1BQzdCLEVBQUUsa0JBQWtCLHNCQUFzQjtBQUFBLElBQzNDLENBQUM7QUFHRCxTQUFLLGdCQUFnQixJQUFJLE9BQU8sS0FBSyxlQUFlLEVBQUUsNEJBQTRCLENBQUM7QUFFbkYsU0FBSyxPQUFPLEtBQUssVUFBVSxLQUFLLHFCQUFxQjtBQUFBLE1BQ3BEO0FBQUEsTUFDQTtBQUFBLE1BQ0EsS0FBSztBQUFBLE1BQ0wsSUFBSSx1QkFBdUI7QUFBQSxNQUMzQixDQUFDLElBQUksMkJBQTJCLENBQUM7QUFBQSxNQUNqQyxFQUFFLGtCQUFrQixzQkFBc0I7QUFBQSxJQUMzQyxDQUFDO0FBR0QsU0FBSyxjQUFjLEtBQUssVUFBVSxLQUFLLHFCQUFxQixlQUFlLHNCQUFzQixnQkFBZ0IsQ0FBQztBQUNsSCxTQUFLLFVBQVUsS0FBSyxZQUFZLGlCQUFpQixNQUFNO0FBQ3RELFVBQUksS0FBSyxrQkFBa0I7QUFDMUIsYUFBSyxPQUFPLEtBQUssZ0JBQWdCO0FBQUEsTUFDbEM7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxLQUFLLFlBQVksVUFBVSxNQUFNO0FBQy9DLFVBQUksS0FBSyxLQUFLLGFBQWEsRUFBRSxTQUFTLEdBQUc7QUFDeEMsYUFBSyxLQUFLLGFBQWEsQ0FBQyxDQUFDO0FBQUEsTUFDMUI7QUFDQSxVQUFJLEtBQUssS0FBSyxhQUFhLEVBQUUsU0FBUyxHQUFHO0FBQ3hDLGFBQUssS0FBSyxhQUFhLENBQUMsQ0FBQztBQUFBLE1BQzFCO0FBQ0EsVUFBSSxLQUFLLGtCQUFrQjtBQUMxQixhQUFLLE9BQU8sS0FBSyxnQkFBZ0I7QUFBQSxNQUNsQztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBR0YsU0FBSyxVQUFVLEtBQUssS0FBSyxjQUFjLE9BQUs7QUFDM0MsVUFBSSxFQUFFLFNBQVM7QUFDZCxhQUFLLHFCQUFxQixFQUFFLFNBQVMsRUFBRSxZQUFZO0FBQUEsTUFDcEQ7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxLQUFLLEtBQUssY0FBYyxPQUFLO0FBQzNDLFVBQUksRUFBRSxTQUFTO0FBQ2QsYUFBSyxxQkFBcUIsRUFBRSxTQUFTLEVBQUUsWUFBWTtBQUFBLE1BQ3BEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFHRixTQUFLLFVBQVUsS0FBSyxLQUFLLHFCQUFxQixPQUFLO0FBQ2xELFlBQU0sV0FBVyxFQUFFLFNBQVMsQ0FBQztBQUM3QixVQUFJLFVBQVU7QUFDYixhQUFLLFlBQVksS0FBSyxRQUFRO0FBQUEsTUFDL0IsT0FBTztBQUNOLGFBQUssWUFBWSxLQUFLO0FBQUEsTUFDdkI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxLQUFLLEtBQUsscUJBQXFCLE9BQUs7QUFDbEQsWUFBTSxXQUFXLEVBQUUsU0FBUyxDQUFDO0FBQzdCLFVBQUksVUFBVTtBQUNiLGFBQUssWUFBWSxLQUFLLFFBQVE7QUFBQSxNQUMvQixPQUFPO0FBQ04sYUFBSyxZQUFZLEtBQUs7QUFBQSxNQUN2QjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsV0FBVyxpQkFBNEI7QUFDdEMsUUFBSSxDQUFDLEtBQUssMEJBQTBCLEtBQUssdUJBQXVCLFNBQVMsTUFBTSxnQkFBZ0IsU0FBUyxHQUFHO0FBQzFHLFdBQUssZUFBZTtBQUFBLElBQ3JCO0FBQ0EsU0FBSyx5QkFBeUI7QUFBQSxFQUMvQjtBQUFBLEVBRUEsY0FBYyxNQUFvQjtBQUNqQyxTQUFLLGFBQWEsY0FBYyxJQUFJO0FBQUEsRUFDckM7QUFBQSxFQUVBLE9BQWE7QUFDWixRQUFJLEtBQUssS0FBSyxTQUFTO0FBQ3ZCLFNBQUssV0FBVztBQUNoQixTQUFLLFlBQVk7QUFBQSxFQUNsQjtBQUFBLEVBRUEsT0FBYTtBQUNaLFFBQUksS0FBSyxLQUFLLFNBQVM7QUFBQSxFQUN4QjtBQUFBLEVBRUEsUUFBYztBQUNiLFFBQUksS0FBSyxpQkFBaUIsYUFBYSxNQUFNO0FBQzVDLFdBQUssS0FBSyxTQUFTO0FBQUEsSUFDcEIsT0FBTztBQUNOLFdBQUssS0FBSyxTQUFTO0FBQUEsSUFDcEI7QUFBQSxFQUNEO0FBQUEsRUFFQSxtQkFBeUI7QUFDeEIsUUFBSSxDQUFDLEtBQUssd0JBQXdCO0FBQ2pDO0FBQUEsSUFDRDtBQUNBLFVBQU0sZUFBZSxLQUFLLFlBQVksZ0JBQWdCLEtBQUssc0JBQXNCLEtBQUssb0JBQW9CLG9CQUFvQixLQUFLLHNCQUFzQixLQUFLLEtBQUssdUJBQXVCLFNBQVM7QUFDbk0sU0FBSyxpQkFBaUIsU0FBUztBQUFBLE1BQzlCLElBQUksbUJBQW1CLFNBQVMsbUJBQW1CLGtCQUFrQixHQUFHLElBQUk7QUFBQSxNQUM1RSxJQUFJLG1CQUFtQixjQUFjLElBQUk7QUFBQSxNQUN6QyxJQUFJLG1CQUFtQixTQUFTLGtCQUFrQixNQUFNLENBQUM7QUFBQSxJQUMxRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsT0FBTyxXQUE0QjtBQUNsQyxTQUFLLG1CQUFtQjtBQUN4QixVQUFNLG1CQUFtQjtBQUN6QixVQUFNLGVBQWUsS0FBSyxnQkFBZ0I7QUFDMUMsVUFBTSxvQkFBb0IsS0FBSyxZQUFZO0FBQzNDLFVBQU0saUJBQWlCLEtBQUssa0JBQWtCO0FBQzlDLFVBQU0sZ0JBQWdCLEtBQUssWUFBWTtBQUN2QyxVQUFNLGNBQWMsZ0JBQWdCLEtBQUssWUFBWSxRQUFRO0FBQzdELFVBQU0sYUFBYSxVQUFVLFNBQVMsbUJBQW1CLGVBQWUsb0JBQW9CO0FBQzVGLFVBQU0sWUFBWSxVQUFVLFFBQVE7QUFDcEMsUUFBSSxLQUFLLGlCQUFpQixhQUFhLE1BQU07QUFDNUMsV0FBSyxLQUFLLE9BQU8sWUFBWSxTQUFTO0FBQUEsSUFDdkMsT0FBTztBQUNOLFdBQUssS0FBSyxPQUFPLFlBQVksU0FBUztBQUFBLElBQ3ZDO0FBQ0EsUUFBSSxLQUFLLFlBQVksV0FBVztBQUMvQixXQUFLLFlBQVksT0FBTyxVQUFVO0FBQUEsSUFDbkM7QUFDQSxTQUFLLFlBQVksV0FBVztBQUFBLEVBQzdCO0FBQUEsRUFFQSxjQUFvQjtBQUtuQixRQUFJLEtBQUssYUFBYTtBQUNyQixXQUFLLGlCQUFpQixLQUFLLE9BQU8sT0FBTyxPQUFLLEtBQUssb0JBQW9CLENBQUMsQ0FBQztBQUN6RSxXQUFLLGNBQWM7QUFBQSxJQUNwQjtBQUtBLFVBQU0sZ0JBQWdCLEtBQUssZUFBZTtBQUMxQyxVQUFNLFVBQVUsZ0JBQWdCLEtBQUssZUFBZSxLQUFLLGVBQWUsTUFBTSxHQUFHLEtBQUssWUFBWSxJQUFJLEtBQUs7QUFFM0csUUFBSSxLQUFLLGlCQUFpQixhQUFhLE1BQU07QUFDNUMsV0FBSyxLQUFLLE9BQU8sR0FBRyxLQUFLLEtBQUssUUFBUSxPQUFPO0FBQUEsSUFDOUMsT0FBTztBQUNOLFdBQUssWUFBWSxPQUFPO0FBQUEsSUFDekI7QUFFQSxTQUFLLGVBQWUsYUFBYTtBQUlqQyxRQUFJLEtBQUssa0JBQWtCO0FBQzFCLFdBQUssT0FBTyxLQUFLLGdCQUFnQjtBQUFBLElBQ2xDO0FBQUEsRUFDRDtBQUFBLEVBRUEsU0FBUyxPQUE4QjtBQUl0QyxTQUFLLGFBQWEsS0FBSyxRQUFRLEtBQUs7QUFJcEMsUUFBSSxDQUFDLEtBQUssZUFBZSxLQUFLLG9CQUFvQixLQUFLLEdBQUc7QUFDekQsV0FBSyxhQUFhLEtBQUssZ0JBQWdCLEtBQUs7QUFBQSxJQUM3QztBQUVBLFNBQUssZ0JBQWdCO0FBQUEsRUFDdEI7QUFBQSxFQUVRLGFBQWEsS0FBd0IsT0FBOEI7QUFDMUUsVUFBTSxPQUFPLE1BQU0sUUFBUSxRQUFRO0FBQ25DLFFBQUksS0FBSztBQUNULFFBQUksS0FBSyxJQUFJO0FBQ2IsV0FBTyxLQUFLLElBQUk7QUFDZixZQUFNLE1BQU8sS0FBSyxPQUFRO0FBQzFCLFVBQUksSUFBSSxHQUFHLEVBQUUsUUFBUSxRQUFRLEtBQUssTUFBTTtBQUN2QyxhQUFLLE1BQU07QUFBQSxNQUNaLE9BQU87QUFDTixhQUFLO0FBQUEsTUFDTjtBQUFBLElBQ0Q7QUFDQSxRQUFJLE9BQU8sSUFBSSxRQUFRO0FBQ3RCLFVBQUksS0FBSyxLQUFLO0FBQUEsSUFDZixPQUFPO0FBQ04sVUFBSSxPQUFPLElBQUksR0FBRyxLQUFLO0FBQUEsSUFDeEI7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1RLG9CQUFvQixPQUFpQztBQUU1RCxVQUFNLFdBQVcsTUFBTSxTQUFTLFlBQVksTUFBTSxXQUFXO0FBQzdELFFBQUksQ0FBQyxLQUFLLFlBQVksY0FBYyxNQUFNLE1BQU0sUUFBUSxHQUFHO0FBQzFELGFBQU87QUFBQSxJQUNSO0FBR0EsUUFBSSxDQUFDLEtBQUssWUFBWSxtQkFBbUIsTUFBTSxPQUFPLEdBQUc7QUFDeEQsYUFBTztBQUFBLElBQ1I7QUFJQSxTQUFLLGtCQUFrQjtBQUN2QixRQUFJLEtBQUssbUJBQW1CLFNBQVMsS0FBSyxLQUFLLG1CQUFtQixLQUFLLFVBQVEsc0JBQXNCLE9BQU8sSUFBSSxDQUFDLEdBQUc7QUFDbkgsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLEtBQUssbUJBQW1CLFNBQVMsS0FBSyxDQUFDLEtBQUssbUJBQW1CLEtBQUssVUFBUSxzQkFBc0IsT0FBTyxJQUFJLENBQUMsR0FBRztBQUNwSCxhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxvQkFBMEI7QUFDakMsVUFBTSxXQUFXLEtBQUssWUFBWTtBQUNsQyxRQUFJLGFBQWEsS0FBSyxrQkFBa0I7QUFDdkM7QUFBQSxJQUNEO0FBQ0EsU0FBSyxtQkFBbUI7QUFDeEIsUUFBSSxDQUFDLFVBQVU7QUFDZCxXQUFLLHFCQUFxQixDQUFDO0FBQzNCLFdBQUsscUJBQXFCLENBQUM7QUFDM0I7QUFBQSxJQUNEO0FBQ0EsVUFBTSxRQUFRLFNBQVMsTUFBTSxHQUFHLEVBQUUsSUFBSSxPQUFLLEVBQUUsS0FBSyxDQUFDLEVBQUUsT0FBTyxPQUFLLEVBQUUsU0FBUyxDQUFDO0FBQzdFLFNBQUsscUJBQXFCLE1BQU0sT0FBTyxPQUFLLENBQUMsRUFBRSxXQUFXLEdBQUcsQ0FBQztBQUM5RCxTQUFLLHFCQUFxQixNQUFNLE9BQU8sT0FBSyxFQUFFLFdBQVcsR0FBRyxDQUFDLEVBQUUsSUFBSSxPQUFLLEVBQUUsTUFBTSxDQUFDLEVBQUUsS0FBSyxDQUFDLEVBQUUsT0FBTyxPQUFLLEVBQUUsU0FBUyxDQUFDO0FBQUEsRUFDcEg7QUFBQSxFQUVRLGtCQUF3QjtBQUMvQixRQUFJLENBQUMsS0FBSyxpQkFBaUIsWUFBWSxHQUFHO0FBQ3pDLFdBQUssaUJBQWlCLFNBQVM7QUFBQSxJQUNoQztBQUFBLEVBQ0Q7QUFBQSxFQUVRLGFBQW1CO0FBQzFCLFNBQUssU0FBUyxDQUFDLEdBQUcsS0FBSyxpQkFBaUIsVUFBVSxLQUFLLDBCQUEwQixNQUFTLENBQUM7QUFDM0YsU0FBSyxjQUFjO0FBRW5CLFVBQU0scUJBQXFCLEtBQUssaUJBQWlCLGNBQWMsT0FBSztBQUNuRSxVQUFJLENBQUMsS0FBSywwQkFBMEIsRUFBRSxnQkFBZ0IsU0FBUyxNQUFNLEtBQUssdUJBQXVCLFNBQVMsR0FBRztBQUM1RyxhQUFLLFNBQVMsQ0FBQztBQUFBLE1BQ2hCO0FBQUEsSUFDRCxDQUFDO0FBR0QsVUFBTSx3QkFBd0IsS0FBSyxpQkFBaUIseUJBQXlCLHFCQUFtQjtBQUMvRixVQUFJLENBQUMsS0FBSywwQkFBMEIsZ0JBQWdCLFNBQVMsTUFBTSxLQUFLLHVCQUF1QixTQUFTLEdBQUc7QUFDMUcsYUFBSyxTQUFTLENBQUMsR0FBRyxLQUFLLGlCQUFpQixVQUFVLEtBQUssMEJBQTBCLE1BQVMsQ0FBQztBQUMzRixhQUFLLGNBQWM7QUFRbkIsYUFBSyxnQkFBZ0I7QUFBQSxNQUN0QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssY0FBYyxRQUFRLG1CQUFtQixvQkFBb0IscUJBQXFCO0FBQ3ZGLFNBQUssaUJBQWlCO0FBQ3RCLFNBQUssa0JBQWtCO0FBQUEsRUFDeEI7QUFBQSxFQUVRLG9CQUEwQjtBQUNqQyxRQUFJLENBQUMsS0FBSyx3QkFBd0I7QUFDakMsV0FBSyxZQUFZLEtBQUs7QUFDdEIsV0FBSyx1QkFBdUIsTUFBTTtBQUNsQztBQUFBLElBQ0Q7QUFFQSxVQUFNLFFBQVEsS0FBSyxZQUFZLFdBQVcsS0FBSyxzQkFBc0I7QUFDckUsUUFBSSxDQUFDLE9BQU87QUFDWCxXQUFLLFlBQVksS0FBSztBQUN0QixXQUFLLHVCQUF1QixNQUFNO0FBQ2xDO0FBQUEsSUFDRDtBQUVBLFNBQUssdUJBQXVCLFFBQVEsUUFBUSxZQUFVO0FBQ3JELFlBQU0sYUFBYSxNQUFNLGtCQUFrQixLQUFLLE1BQU07QUFDdEQsVUFBSSxZQUFZO0FBQ2YsYUFBSyxZQUFZLFNBQVM7QUFBQSxNQUMzQixPQUFPO0FBQ04sYUFBSyxZQUFZLEtBQUs7QUFBQSxNQUN2QjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLFlBQVksVUFBNEM7QUFDL0QsVUFBTSxlQUFlLEtBQUssbUJBQW1CLFFBQVE7QUFDckQsU0FBSyxLQUFLLFlBQVksTUFBTSxZQUFZO0FBQUEsRUFDekM7QUFBQSxFQUVRLG1CQUFtQixRQUEyRTtBQUNyRyxVQUFNLFlBQVksb0JBQUksSUFBNkI7QUFDbkQsVUFBTSxlQUFlLG9CQUFJLElBQStCO0FBQ3hELFVBQU0sUUFBMkIsQ0FBQztBQUVsQyxlQUFXLFNBQVMsUUFBUTtBQUMzQixVQUFJLE1BQU0sSUFBSTtBQUNiLGtCQUFVLElBQUksTUFBTSxJQUFJLEtBQUs7QUFBQSxNQUM5QjtBQUFBLElBQ0Q7QUFFQSxlQUFXLFNBQVMsUUFBUTtBQUMzQixVQUFJLE1BQU0saUJBQWlCLFVBQVUsSUFBSSxNQUFNLGFBQWEsR0FBRztBQUM5RCxZQUFJLFdBQVcsYUFBYSxJQUFJLE1BQU0sYUFBYTtBQUNuRCxZQUFJLENBQUMsVUFBVTtBQUNkLHFCQUFXLENBQUM7QUFDWix1QkFBYSxJQUFJLE1BQU0sZUFBZSxRQUFRO0FBQUEsUUFDL0M7QUFDQSxpQkFBUyxLQUFLLEtBQUs7QUFBQSxNQUNwQixPQUFPO0FBQ04sY0FBTSxLQUFLLEtBQUs7QUFBQSxNQUNqQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLGdCQUFnQixDQUFDLFVBQWdFO0FBQ3RGLFlBQU0sV0FBVyxNQUFNLEtBQUssYUFBYSxJQUFJLE1BQU0sRUFBRSxJQUFJO0FBQ3pELGFBQU87QUFBQSxRQUNOLFNBQVM7QUFBQSxRQUNULFVBQVUsVUFBVSxJQUFJLGFBQWE7QUFBQSxRQUNyQyxjQUFjLFVBQVUsVUFBVSxLQUFLO0FBQUEsUUFDdkMsV0FBVztBQUFBLE1BQ1o7QUFBQSxJQUNEO0FBRUEsV0FBTyxNQUFNLElBQUksYUFBYTtBQUFBLEVBQy9CO0FBQUEsRUFFUSxlQUFlLGVBQTZCO0FBQ25ELFFBQUksaUJBQWlCLEtBQUssY0FBYztBQUN2QyxVQUFJLEtBQUssaUJBQWlCO0FBQ3pCLFlBQUksS0FBSyxLQUFLLGlCQUFpQjtBQUMvQixhQUFLLGtCQUFrQjtBQUFBLE1BQ3hCO0FBQ0E7QUFBQSxJQUNEO0FBR0EsUUFBSSxDQUFDLEtBQUsscUJBQXFCO0FBQzlCLFdBQUssc0JBQXNCLElBQUksT0FBTyxLQUFLLG1CQUFtQixFQUFFLHVDQUF1QyxDQUFDO0FBQUEsSUFDekc7QUFDQSxRQUFJLENBQUMsS0FBSyxhQUFhO0FBQ3RCLFdBQUssY0FBYyxLQUFLLG9CQUFvQixJQUFJLElBQUksT0FBTyxLQUFLLG1CQUFtQixFQUFFLEdBQUcscUJBQXFCLFdBQVcsTUFBTSxPQUFPLFNBQVMsMkJBQTJCLGtCQUFrQixFQUFFLENBQUMsQ0FBQztBQUMvTCxXQUFLLG9CQUFvQixJQUFJLEtBQUssWUFBWSxXQUFXLE1BQU07QUFDOUQsYUFBSyxnQkFBZ0I7QUFDckIsYUFBSyxZQUFZO0FBQUEsTUFDbEIsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUVBLFVBQU0sUUFBUSxLQUFLLElBQUksS0FBSyxjQUFjLGFBQWE7QUFDdkQsVUFBTSxZQUFZLGdCQUFnQjtBQUVsQyxTQUFLLG9CQUFvQixjQUFjLFNBQVMsMEJBQTBCLDZCQUE2QixPQUFPLGFBQWE7QUFDM0gsU0FBSyxZQUFZLFFBQVEsU0FBUyxzQkFBc0IsbUJBQW1CLFNBQVM7QUFFcEYsUUFBSSxDQUFDLEtBQUssaUJBQWlCO0FBQzFCLFVBQUksS0FBSyxLQUFLLGlCQUFpQjtBQUMvQixXQUFLLGtCQUFrQjtBQUFBLElBQ3hCO0FBQUEsRUFDRDtBQUFBLEVBRVEsaUJBQXVCO0FBQzlCLFFBQUksS0FBSyxpQkFBaUIsYUFBYSxNQUFNO0FBQzVDLFdBQUssZUFBZSxhQUFhO0FBQ2pDLFVBQUksS0FBSyxLQUFLLGFBQWE7QUFDM0IsVUFBSSxLQUFLLEtBQUssYUFBYTtBQUFBLElBQzVCLE9BQU87QUFDTixXQUFLLGVBQWUsYUFBYTtBQUNqQyxVQUFJLEtBQUssS0FBSyxhQUFhO0FBQzNCLFVBQUksS0FBSyxLQUFLLGFBQWE7QUFBQSxJQUM1QjtBQUNBLFNBQUsscUJBQXFCO0FBQzFCLFNBQUssWUFBWTtBQUNqQixRQUFJLEtBQUssa0JBQWtCO0FBQzFCLFdBQUssT0FBTyxLQUFLLGdCQUFnQjtBQUFBLElBQ2xDO0FBQUEsRUFDRDtBQUFBLEVBRVEsdUJBQTZCO0FBQ3BDLFVBQU0sS0FBSyxLQUFLLGVBQWU7QUFDL0IsUUFBSSxVQUFVLEVBQUU7QUFDaEIsVUFBTSxTQUFTLEtBQUssaUJBQWlCLGFBQWE7QUFDbEQsUUFBSSxPQUFPLElBQUksRUFBRSxPQUFPLFVBQVUsY0FBYyxTQUFTLFFBQVEsV0FBVyxRQUFRLFFBQVEsQ0FBQyxFQUFFLENBQUM7QUFFaEcsVUFBTSxpQkFBaUIsSUFBSSxPQUFPLElBQUksRUFBRSxrQ0FBa0MsQ0FBQztBQUMzRSxVQUFNLFlBQVksSUFBSSxPQUFPLGdCQUFnQixFQUFFLGlDQUFpQyxDQUFDO0FBQ2pGLGNBQVUsY0FBYyxTQUFTLHNCQUFzQixXQUFXO0FBQ2xFLFVBQU0sWUFBWSxJQUFJLE9BQU8sZ0JBQWdCLEVBQUUsaUNBQWlDLENBQUM7QUFDakYsY0FBVSxjQUFjLFNBQVMsc0JBQXNCLFdBQVc7QUFFbEUsUUFBSSxRQUFRO0FBQ1gsZ0JBQVUsVUFBVSxJQUFJLFFBQVE7QUFBQSxJQUNqQyxPQUFPO0FBQ04sZ0JBQVUsVUFBVSxJQUFJLFFBQVE7QUFBQSxJQUNqQztBQUVBLFVBQU0sY0FBYyxTQUNqQixTQUFTLDhCQUE4QixxQkFBcUIsSUFDNUQsU0FBUyw4QkFBOEIscUJBQXFCO0FBQy9ELE9BQUcsYUFBYSxjQUFjLFdBQVc7QUFDekMsU0FBSyxlQUFlLFNBQVMsV0FBVztBQUFBLEVBQ3pDO0FBQUEsRUFFUSwyQkFBaUM7QUFDeEMsU0FBSyxhQUFhLGlCQUFpQixDQUFDLEtBQUssWUFBWSxvQkFBb0IsQ0FBQztBQUFBLEVBQzNFO0FBQUEsRUFFUSxxQkFBcUIsT0FBd0IsY0FBNkI7QUFDakYsVUFBTSxJQUFJLE1BQU07QUFDaEIsVUFBTSxNQUFNLENBQUMsTUFBYyxPQUFPLENBQUMsRUFBRSxTQUFTLEdBQUcsR0FBRztBQUNwRCxVQUFNLFlBQVksR0FBRyxFQUFFLFlBQVksQ0FBQyxJQUFJLElBQUksRUFBRSxTQUFTLElBQUksQ0FBQyxDQUFDLElBQUksSUFBSSxFQUFFLFFBQVEsQ0FBQyxDQUFDLElBQUksSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDLElBQUksSUFBSSxFQUFFLFdBQVcsQ0FBQyxDQUFDLElBQUksSUFBSSxFQUFFLFdBQVcsQ0FBQyxDQUFDO0FBQ3BKLFVBQU0sTUFBTSxDQUFDLG9CQUFvQixLQUFLLEdBQUcsaUJBQWlCLEtBQUssR0FBRyxvQkFBb0IsS0FBSyxDQUFDLEVBQUUsT0FBTyxPQUFPLEVBQUUsS0FBSyxHQUFJO0FBQ3ZILFVBQU0sT0FBTyxpQkFBaUIsS0FBSztBQUNuQyxTQUFLLG1CQUFtQixnQkFBZ0I7QUFBQSxNQUN2QyxXQUFXLE1BQU0sSUFBSSxhQUFhLFlBQVksSUFDM0MsSUFBSSxtQkFBbUIsSUFBSSxVQUFVLEtBQUssU0FBUyxHQUFHLFlBQVksSUFDbEUsS0FBSztBQUFBLE1BQ1IsWUFBWSxNQUFNO0FBQUEsUUFDakIsSUFBSSxPQUFPLDJCQUEyQixTQUFTLDJCQUEyQixnQkFBZ0IsR0FBRyxRQUFXLE1BQU0sTUFBTSxLQUFLLGlCQUFpQixVQUFVLFNBQVMsQ0FBQztBQUFBLFFBQzlKLElBQUksT0FBTyxxQkFBcUIsU0FBUyxxQkFBcUIsVUFBVSxHQUFHLFFBQVcsTUFBTSxNQUFNLEtBQUssaUJBQWlCLFVBQVUsR0FBRyxDQUFDO0FBQUEsUUFDdEksSUFBSSxVQUFVO0FBQUEsUUFDZCxJQUFJLE9BQU8sMEJBQTBCLFNBQVMsMEJBQTBCLHlCQUF5QixHQUFHLFFBQVcsTUFBTSxNQUFNLEtBQUssaUJBQWlCLFVBQVUsU0FBUyxFQUFFLENBQUM7QUFBQSxRQUN2SyxJQUFJLE9BQU8seUJBQXlCLFNBQVMseUJBQXlCLHdCQUF3QixHQUFHLFFBQVcsTUFBTSxNQUFNLEtBQUssaUJBQWlCLFNBQVMsU0FBUyxFQUFFLENBQUM7QUFBQSxRQUNuSyxJQUFJLE9BQU8sd0JBQXdCLFNBQVMsd0JBQXdCLGFBQWEsR0FBRyxRQUFXLENBQUMsQ0FBQyxNQUFNLE1BQU0sS0FBSyxpQkFBaUIsSUFBSSxDQUFDO0FBQUEsTUFDekk7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSxpQkFBaUIsT0FBcUI7QUFDN0MsU0FBSyxhQUFhLGNBQWMsS0FBSztBQUFBLEVBQ3RDO0FBRUQ7QUEvbUJhLG9CQUFOO0FBQUEsRUEwQ0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBL0NVOyIsCiAgIm5hbWVzIjogWyJMb2dzTmF2aWdhdGlvbiJdCn0K
