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
import { BreadcrumbsWidget } from "../../../../../base/browser/ui/breadcrumbs/breadcrumbsWidget.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { localize } from "../../../../../nls.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { defaultBreadcrumbsWidgetStyles, defaultButtonStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { FilterWidget } from "../../../../browser/parts/views/viewFilter.js";
import { IChatDebugService } from "../../common/chatDebugService.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { LocalChatSessionUri } from "../../common/model/chatUri.js";
import { setupBreadcrumbKeyboardNavigation, TextBreadcrumbItem } from "./chatDebugTypes.js";
import { bindFilterContextKeys } from "./chatDebugFilters.js";
import { buildFlowGraph, filterFlowNodes, sliceFlowNodes, mergeDiscoveryNodes, mergeToolCallNodes, layoutFlowGraph, renderFlowChartSVG } from "./chatDebugFlowChart.js";
import { ChatDebugDetailPanel } from "./chatDebugDetailPanel.js";
const $ = DOM.$;
const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.15;
const WHEEL_ZOOM_FACTOR = 2e-3;
const CLICK_THRESHOLD_SQ = 25;
const PAGE_SIZE = 100;
var FlowChartNavigation = /* @__PURE__ */ ((FlowChartNavigation2) => {
  FlowChartNavigation2["Home"] = "home";
  FlowChartNavigation2["Overview"] = "overview";
  return FlowChartNavigation2;
})(FlowChartNavigation || {});
let ChatDebugFlowChartView = class extends Disposable {
  constructor(parent, filterState, chatService, chatDebugService, contextKeyService, instantiationService) {
    super();
    this.filterState = filterState;
    this.chatService = chatService;
    this.chatDebugService = chatDebugService;
    this.contextKeyService = contextKeyService;
    this.instantiationService = instantiationService;
    this._onNavigate = this._register(new Emitter());
    this.onNavigate = this._onNavigate.event;
    this.loadDisposables = this._register(new DisposableStore());
    // Pan/zoom state
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.isPanning = false;
    this.startX = 0;
    this.startY = 0;
    // Click detection (distinguish click from drag)
    this.mouseDownX = 0;
    this.mouseDownY = 0;
    this.lastEventCount = 0;
    this.hasUserPanned = false;
    // Collapse state — persists across refreshes, resets on session change
    this.collapsedNodeIds = /* @__PURE__ */ new Set();
    // Expanded merged-discovery nodes — persists across refreshes, resets on session change
    this.expandedMergedIds = /* @__PURE__ */ new Set();
    // Pagination state
    this.visibleLimit = PAGE_SIZE;
    this.eventById = /* @__PURE__ */ new Map();
    this.container = DOM.append(parent, $(".chat-debug-flowchart"));
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
    const headerContainer = this.headerContainer;
    const scopedContextKeyService = this._register(this.contextKeyService.createScoped(headerContainer));
    const syncContextKeys = bindFilterContextKeys(this.filterState, scopedContextKeyService);
    syncContextKeys();
    const childInstantiationService = this._register(this.instantiationService.createChild(
      new ServiceCollection([IContextKeyService, scopedContextKeyService])
    ));
    this.filterWidget = this._register(childInstantiationService.createInstance(FilterWidget, {
      placeholder: localize("chatDebug.flowchart.search", "Filter nodes..."),
      ariaLabel: localize("chatDebug.flowchart.filterAriaLabel", "Filter flow chart nodes")
    }));
    const filterContainer = DOM.append(headerContainer, $(".viewpane-filter-container"));
    filterContainer.appendChild(this.filterWidget.element);
    this._register(this.filterWidget.onDidChangeFilterText((text) => {
      this.filterState.setTextFilter(text);
    }));
    this._register(this.filterState.onDidChange(() => {
      syncContextKeys();
      this.filterWidget.checkMoreFilters(!this.filterState.isAllFiltersDefault());
      this.visibleLimit = PAGE_SIZE;
      this.hasUserPanned = false;
      this.lastEventCount = 0;
      this.load();
    }));
    const contentWrapper = DOM.append(this.container, $(".chat-debug-flowchart-content-wrapper"));
    this.content = DOM.append(contentWrapper, $(".chat-debug-flowchart-content"));
    this.detailPanel = this._register(this.instantiationService.createInstance(ChatDebugDetailPanel, contentWrapper));
    this.setupPanZoom();
    this.setupKeyboard();
    this.refreshScheduler = this._register(new RunOnceScheduler(() => this.load(), 100));
  }
  setSession(sessionResource) {
    if (!this.currentSessionResource || this.currentSessionResource.toString() !== sessionResource.toString()) {
      this.scale = 1;
      this.translateX = 0;
      this.translateY = 0;
      this.lastEventCount = 0;
      this.hasUserPanned = false;
      this.focusedElementId = void 0;
      this.collapsedNodeIds.clear();
      this.expandedMergedIds.clear();
      this.visibleLimit = PAGE_SIZE;
      this.detailPanel.hide();
    }
    this.currentSessionResource = sessionResource;
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
  updateBreadcrumb() {
    if (!this.currentSessionResource) {
      return;
    }
    const sessionTitle = this.chatService.getSessionTitle(this.currentSessionResource) || LocalChatSessionUri.parseLocalSessionId(this.currentSessionResource) || this.currentSessionResource.toString();
    this.breadcrumbWidget.setItems([
      new TextBreadcrumbItem(localize("chatDebug.title", "Agent Debug Logs"), true),
      new TextBreadcrumbItem(sessionTitle, true),
      new TextBreadcrumbItem(localize("chatDebug.flowChart", "Agent Flow Chart"))
    ]);
  }
  load() {
    const hadFocus = DOM.isAncestorOfActiveElement(this.content);
    DOM.clearNode(this.content);
    this.loadDisposables.clear();
    this.updateBreadcrumb();
    const events = this.chatDebugService.getEvents(this.currentSessionResource);
    const isFirstLoad = this.lastEventCount === 0;
    this.lastEventCount = events.length;
    this.eventById.clear();
    for (const e of events) {
      if (e.id) {
        this.eventById.set(e.id, e);
      }
    }
    if (events.length === 0) {
      const emptyMsg = DOM.append(this.content, $(".chat-debug-flowchart-empty"));
      emptyMsg.textContent = localize("chatDebug.flowChart.noEvents", "No events recorded for this session.");
      return;
    }
    const flowNodes = buildFlowGraph(events);
    const filtered = filterFlowNodes(flowNodes, {
      isKindVisible: (kind, category) => this.filterState.isKindVisible(kind, category),
      textFilter: this.filterState.textFilter
    });
    if (filtered.length === 0) {
      const emptyMsg = DOM.append(this.content, $(".chat-debug-flowchart-empty"));
      emptyMsg.textContent = localize("chatDebug.flowChart.noMatches", "No nodes match the current filter.");
      return;
    }
    const slice = sliceFlowNodes(filtered, this.visibleLimit);
    const merged = mergeToolCallNodes(mergeDiscoveryNodes(slice.nodes));
    const layout = layoutFlowGraph(merged, { collapsedIds: this.collapsedNodeIds, expandedMergedIds: this.expandedMergedIds });
    this.renderResult = renderFlowChartSVG(layout);
    this.svgWrapper = DOM.append(this.content, $(".chat-debug-flowchart-svg-wrapper"));
    this.svgWrapper.appendChild(this.renderResult.svg);
    this.svgElement = this.renderResult.svg;
    if (slice.shownCount < slice.totalCount) {
      const remaining = slice.totalCount - slice.shownCount;
      const showMoreContainer = DOM.append(this.svgWrapper, $(".chat-debug-flowchart-show-more"));
      const showMoreBtn = this.loadDisposables.add(new Button(showMoreContainer, { ...defaultButtonStyles, secondary: true, title: localize("chatDebug.flowChart.showMoreTitle", "Load more nodes") }));
      showMoreBtn.label = localize("chatDebug.flowChart.showMore", "Show More ({0})", remaining);
      this.loadDisposables.add(showMoreBtn.onDidClick(() => {
        this.visibleLimit += PAGE_SIZE;
        this.load();
      }));
    }
    if (isFirstLoad && !this.hasUserPanned) {
      DOM.getWindow(this.content).requestAnimationFrame(() => {
        this.centerContent();
      });
    } else {
      this.applyTransform();
    }
    if (this.focusedElementId && hadFocus && !DOM.isAncestorOfActiveElement(this.headerContainer)) {
      this.restoreFocus(this.focusedElementId);
    }
  }
  setupPanZoom() {
    this._register(DOM.addDisposableListener(this.content, DOM.EventType.MOUSE_DOWN, (e) => this.handleMouseDown(e)));
    const targetDocument = DOM.getWindow(this.content).document;
    this._register(DOM.addDisposableListener(targetDocument, DOM.EventType.MOUSE_MOVE, (e) => this.handleMouseMove(e)));
    this._register(DOM.addDisposableListener(targetDocument, DOM.EventType.MOUSE_UP, (e) => this.handleMouseUp(e)));
    this._register(DOM.addDisposableListener(this.content, "wheel", (e) => this.handleWheel(e), { passive: false }));
  }
  setupKeyboard() {
    this._register(DOM.addDisposableListener(this.content, DOM.EventType.FOCUS_IN, (e) => {
      const el = e.target;
      if (!el) {
        return;
      }
      const subgraphId = el.getAttribute?.("data-subgraph-id");
      if (subgraphId) {
        this.focusedElementId = `sg:${subgraphId}`;
        return;
      }
      const nodeId = el.getAttribute?.("data-node-id");
      if (nodeId) {
        this.focusedElementId = nodeId;
      }
    }));
    this._register(DOM.addDisposableListener(this.content, DOM.EventType.KEY_DOWN, (e) => {
      const target = e.target;
      if (!target) {
        return;
      }
      const subgraphId = target.getAttribute?.("data-subgraph-id");
      switch (e.key) {
        case "Tab": {
          if (this.focusedElementId) {
            const moved = this.focusAdjacentElement(this.focusedElementId, e.shiftKey ? -1 : 1);
            if (moved) {
              e.preventDefault();
            } else if (!e.shiftKey && this.detailPanel.isVisible) {
              e.preventDefault();
              this.detailPanel.focus();
            }
          } else if (!e.shiftKey) {
            e.preventDefault();
            this.focusFirstElement();
          }
          break;
        }
        case "Enter":
        case " ":
          if (subgraphId) {
            e.preventDefault();
            e.stopPropagation();
            this.detailPanel.hide();
            this.toggleSubgraph(subgraphId);
          } else {
            const nodeId = target.getAttribute?.("data-node-id");
            if (nodeId) {
              e.preventDefault();
              if (target.getAttribute?.("data-is-toggle")) {
                this.detailPanel.hide();
                this.toggleMergedDiscovery(nodeId);
              } else {
                const event = this.eventById.get(nodeId);
                if (event) {
                  this.detailPanel.show(event);
                }
              }
            }
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          if (this.focusedElementId) {
            this.focusEdgeNeighbor(this.focusedElementId, "next");
          } else {
            this.focusFirstElement();
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (this.focusedElementId) {
            if (subgraphId && this.collapsedNodeIds.has(subgraphId)) {
              this.detailPanel.hide();
              this.collapsedNodeIds.delete(subgraphId);
              this.focusedElementId = `sg:${subgraphId}`;
              this.load();
              this.focusFirstChildOf(`sg:${subgraphId}`);
            } else if (target.getAttribute?.("data-is-toggle")) {
              if (!this.expandedMergedIds.has(this.focusedElementId)) {
                this.detailPanel.hide();
                const mergedId = this.focusedElementId;
                this.expandedMergedIds.add(mergedId);
                this.focusedElementId = mergedId;
                this.load();
                this.focusFirstChildOf(mergedId);
              } else {
                this.focusFirstChildOf(this.focusedElementId);
              }
            }
          } else {
            this.focusFirstElement();
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (this.focusedElementId) {
            this.focusEdgeNeighbor(this.focusedElementId, "prev");
          } else {
            this.focusFirstElement();
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (this.focusedElementId) {
            if (subgraphId && !this.collapsedNodeIds.has(subgraphId)) {
              this.detailPanel.hide();
              this.toggleSubgraph(subgraphId);
            } else if (target.getAttribute?.("data-is-toggle") && this.expandedMergedIds.has(this.focusedElementId)) {
              this.detailPanel.hide();
              this.toggleMergedDiscovery(this.focusedElementId);
            } else {
              this.focusEdgeNeighbor(this.focusedElementId, "prev");
            }
          }
          break;
        case "Home":
          e.preventDefault();
          this.focusFirstElement();
          break;
        case "End":
          e.preventDefault();
          this.focusLastElement();
          break;
        case "=":
        case "+":
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            this.zoomBy(ZOOM_STEP);
          }
          break;
        case "-":
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            this.zoomBy(-ZOOM_STEP);
          }
          break;
      }
    }));
  }
  toggleSubgraph(subgraphId) {
    if (this.collapsedNodeIds.has(subgraphId)) {
      this.collapsedNodeIds.delete(subgraphId);
    } else {
      this.collapsedNodeIds.add(subgraphId);
    }
    this.focusedElementId = `sg:${subgraphId}`;
    this.load();
  }
  toggleMergedDiscovery(mergedId) {
    if (this.expandedMergedIds.has(mergedId)) {
      this.expandedMergedIds.delete(mergedId);
    } else {
      this.expandedMergedIds.add(mergedId);
    }
    this.focusedElementId = mergedId;
    this.load();
  }
  focusFirstElement() {
    if (!this.renderResult) {
      return;
    }
    const first = this.renderResult.focusableElements.values().next();
    if (!first.done) {
      first.value.focus();
    }
  }
  focusLastElement() {
    if (!this.renderResult) {
      return;
    }
    const entries = [...this.renderResult.focusableElements.values()];
    if (entries.length > 0) {
      entries[entries.length - 1].focus();
    }
  }
  focusAdjacentElement(currentMapKey, direction) {
    if (!this.renderResult) {
      return false;
    }
    const keys = [...this.renderResult.focusableElements.keys()];
    const idx = keys.indexOf(currentMapKey);
    if (idx === -1) {
      return false;
    }
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= keys.length) {
      return false;
    }
    const el = this.renderResult.focusableElements.get(keys[nextIdx]);
    if (el) {
      el.focus();
      return true;
    }
    return false;
  }
  focusEdgeNeighbor(currentId, direction) {
    if (!this.renderResult) {
      return false;
    }
    const entry = this.renderResult.adjacency.get(currentId);
    const neighbors = entry?.[direction];
    if (!neighbors || neighbors.length === 0) {
      return false;
    }
    for (const id of neighbors) {
      const el = this.renderResult.focusableElements.get(id);
      if (el) {
        el.focus();
        return true;
      }
    }
    return false;
  }
  focusFirstChildOf(parentId) {
    if (!this.renderResult) {
      return;
    }
    const entry = this.renderResult.adjacency.get(parentId);
    if (!entry?.next || entry.next.length === 0) {
      return;
    }
    const parentPos = this.renderResult.positions.get(parentId);
    let bestId;
    for (const id of entry.next) {
      if (!this.renderResult.focusableElements.has(id)) {
        continue;
      }
      if (!bestId) {
        bestId = id;
      }
      if (parentPos) {
        const pos = this.renderResult.positions.get(id);
        if (pos && pos.x > parentPos.x) {
          bestId = id;
          break;
        }
      }
    }
    if (bestId) {
      const el = this.renderResult.focusableElements.get(bestId);
      if (el) {
        this.focusedElementId = bestId;
        el.focus();
      }
    }
  }
  restoreFocus(elementId) {
    const el = this.renderResult?.focusableElements.get(elementId);
    if (el) {
      el.focus();
    }
  }
  zoomBy(delta) {
    const rect = this.content.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * (1 + delta)));
    const scaleFactor = newScale / this.scale;
    this.translateX = centerX - (centerX - this.translateX) * scaleFactor;
    this.translateY = centerY - (centerY - this.translateY) * scaleFactor;
    this.scale = newScale;
    this.hasUserPanned = true;
    this.applyTransform();
  }
  handleMouseDown(e) {
    if (e.button !== 0) {
      return;
    }
    e.preventDefault();
    this.isPanning = true;
    this.hasUserPanned = true;
    this.startX = e.clientX - this.translateX;
    this.startY = e.clientY - this.translateY;
    this.mouseDownX = e.clientX;
    this.mouseDownY = e.clientY;
    this.content.style.cursor = "grabbing";
  }
  handleMouseMove(e) {
    if (!this.isPanning) {
      return;
    }
    if (e.buttons === 0) {
      this.handleMouseUp(e);
      return;
    }
    this.translateX = e.clientX - this.startX;
    this.translateY = e.clientY - this.startY;
    this.applyTransform();
  }
  handleMouseUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      this.content.style.cursor = "grab";
      const dx = e.clientX - this.mouseDownX;
      const dy = e.clientY - this.mouseDownY;
      if (dx * dx + dy * dy < CLICK_THRESHOLD_SQ) {
        this.handleClick(e);
      }
    }
  }
  handleClick(e) {
    let target = e.target;
    while (target && target !== this.content) {
      const mergedId = target.getAttribute?.("data-merged-id");
      if (mergedId) {
        this.detailPanel.hide();
        this.toggleMergedDiscovery(mergedId);
        return;
      }
      const subgraphId = target.getAttribute?.("data-subgraph-id");
      if (subgraphId) {
        this.detailPanel.hide();
        this.toggleSubgraph(subgraphId);
        return;
      }
      const nodeId = target.getAttribute?.("data-node-id");
      if (nodeId) {
        target.focus();
        if (target.getAttribute?.("data-is-toggle")) {
          this.detailPanel.hide();
          this.toggleMergedDiscovery(nodeId);
        } else {
          const event = this.eventById.get(nodeId);
          if (event) {
            this.detailPanel.show(event);
          }
        }
        return;
      }
      target = target.parentElement;
    }
  }
  handleWheel(e) {
    e.preventDefault();
    e.stopPropagation();
    this.hasUserPanned = true;
    const rect = this.content.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta = -e.deltaY * WHEEL_ZOOM_FACTOR;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * (1 + delta)));
    const scaleFactor = newScale / this.scale;
    this.translateX = mouseX - (mouseX - this.translateX) * scaleFactor;
    this.translateY = mouseY - (mouseY - this.translateY) * scaleFactor;
    this.scale = newScale;
    this.applyTransform();
  }
  applyTransform() {
    if (this.svgWrapper) {
      this.svgWrapper.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    }
  }
  centerContent() {
    const containerRect = this.content.getBoundingClientRect();
    if (!this.svgElement) {
      return;
    }
    const svgWidth = parseFloat(this.svgElement.getAttribute("width") || "0");
    const svgHeight = parseFloat(this.svgElement.getAttribute("height") || "0");
    if (svgWidth <= 0 || svgHeight <= 0) {
      return;
    }
    const PADDING = 20;
    this.translateX = Math.max(PADDING, (containerRect.width - svgWidth) / 2);
    this.translateY = PADDING;
    this.applyTransform();
  }
};
ChatDebugFlowChartView = __decorateClass([
  __decorateParam(2, IChatService),
  __decorateParam(3, IChatDebugService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IInstantiationService)
], ChatDebugFlowChartView);
export {
  ChatDebugFlowChartView,
  FlowChartNavigation
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXREZWJ1Z1xcY2hhdERlYnVnRmxvd0NoYXJ0Vmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IEJyZWFkY3J1bWJzV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2JyZWFkY3J1bWJzL2JyZWFkY3J1bWJzV2lkZ2V0LmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJyZWFkY3J1bWJzV2lkZ2V0U3R5bGVzLCBkZWZhdWx0QnV0dG9uU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IEZpbHRlcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld0ZpbHRlci5qcyc7XG5pbXBvcnQgeyBJQ2hhdERlYnVnRXZlbnQsIElDaGF0RGVidWdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXREZWJ1Z1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IExvY2FsQ2hhdFNlc3Npb25VcmkgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBzZXR1cEJyZWFkY3J1bWJLZXlib2FyZE5hdmlnYXRpb24sIFRleHRCcmVhZGNydW1iSXRlbSB9IGZyb20gJy4vY2hhdERlYnVnVHlwZXMuanMnO1xuaW1wb3J0IHsgQ2hhdERlYnVnRmlsdGVyU3RhdGUsIGJpbmRGaWx0ZXJDb250ZXh0S2V5cyB9IGZyb20gJy4vY2hhdERlYnVnRmlsdGVycy5qcyc7XG5pbXBvcnQgeyBidWlsZEZsb3dHcmFwaCwgZmlsdGVyRmxvd05vZGVzLCBzbGljZUZsb3dOb2RlcywgbWVyZ2VEaXNjb3ZlcnlOb2RlcywgbWVyZ2VUb29sQ2FsbE5vZGVzLCBsYXlvdXRGbG93R3JhcGgsIHJlbmRlckZsb3dDaGFydFNWRywgRmxvd0NoYXJ0UmVuZGVyUmVzdWx0IH0gZnJvbSAnLi9jaGF0RGVidWdGbG93Q2hhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdERlYnVnRGV0YWlsUGFuZWwgfSBmcm9tICcuL2NoYXREZWJ1Z0RldGFpbFBhbmVsLmpzJztcblxuY29uc3QgJCA9IERPTS4kO1xuXG5jb25zdCBNSU5fU0NBTEUgPSAwLjE7XG5jb25zdCBNQVhfU0NBTEUgPSA1O1xuY29uc3QgWk9PTV9TVEVQID0gMC4xNTtcbmNvbnN0IFdIRUVMX1pPT01fRkFDVE9SID0gMC4wMDI7XG5jb25zdCBDTElDS19USFJFU0hPTERfU1EgPSAyNTtcbmNvbnN0IFBBR0VfU0laRSA9IDEwMDtcblxuZXhwb3J0IGNvbnN0IGVudW0gRmxvd0NoYXJ0TmF2aWdhdGlvbiB7XG5cdEhvbWUgPSAnaG9tZScsXG5cdE92ZXJ2aWV3ID0gJ292ZXJ2aWV3Jyxcbn1cblxuZXhwb3J0IGNsYXNzIENoYXREZWJ1Z0Zsb3dDaGFydFZpZXcgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk5hdmlnYXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Rmxvd0NoYXJ0TmF2aWdhdGlvbj4oKSk7XG5cdHJlYWRvbmx5IG9uTmF2aWdhdGUgPSB0aGlzLl9vbk5hdmlnYXRlLmV2ZW50O1xuXG5cdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29udGVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgYnJlYWRjcnVtYldpZGdldDogQnJlYWRjcnVtYnNXaWRnZXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZmlsdGVyV2lkZ2V0OiBGaWx0ZXJXaWRnZXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgaGVhZGVyQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBsb2FkRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdC8vIFBhbi96b29tIHN0YXRlXG5cdHByaXZhdGUgc2NhbGUgPSAxO1xuXHRwcml2YXRlIHRyYW5zbGF0ZVggPSAwO1xuXHRwcml2YXRlIHRyYW5zbGF0ZVkgPSAwO1xuXHRwcml2YXRlIGlzUGFubmluZyA9IGZhbHNlO1xuXHRwcml2YXRlIHN0YXJ0WCA9IDA7XG5cdHByaXZhdGUgc3RhcnRZID0gMDtcblxuXHQvLyBDbGljayBkZXRlY3Rpb24gKGRpc3Rpbmd1aXNoIGNsaWNrIGZyb20gZHJhZylcblx0cHJpdmF0ZSBtb3VzZURvd25YID0gMDtcblx0cHJpdmF0ZSBtb3VzZURvd25ZID0gMDtcblxuXHQvLyBEaXJlY3QgZWxlbWVudCByZWZlcmVuY2VzIChhdm9pZCBxdWVyeVNlbGVjdG9yKVxuXHRwcml2YXRlIHN2Z1dyYXBwZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHN2Z0VsZW1lbnQ6IFNWR0VsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVuZGVyUmVzdWx0OiBGbG93Q2hhcnRSZW5kZXJSZXN1bHQgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBjdXJyZW50U2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbGFzdEV2ZW50Q291bnQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgaGFzVXNlclBhbm5lZDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdC8vIEZvY3VzIHN0YXRlIFx1MjAxNCBwcmVzZXJ2ZWQgYWNyb3NzIHJlLXJlbmRlcnNcblx0cHJpdmF0ZSBmb2N1c2VkRWxlbWVudElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0Ly8gQ29sbGFwc2Ugc3RhdGUgXHUyMDE0IHBlcnNpc3RzIGFjcm9zcyByZWZyZXNoZXMsIHJlc2V0cyBvbiBzZXNzaW9uIGNoYW5nZVxuXHRwcml2YXRlIHJlYWRvbmx5IGNvbGxhcHNlZE5vZGVJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHQvLyBFeHBhbmRlZCBtZXJnZWQtZGlzY292ZXJ5IG5vZGVzIFx1MjAxNCBwZXJzaXN0cyBhY3Jvc3MgcmVmcmVzaGVzLCByZXNldHMgb24gc2Vzc2lvbiBjaGFuZ2Vcblx0cHJpdmF0ZSByZWFkb25seSBleHBhbmRlZE1lcmdlZElkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdC8vIFBhZ2luYXRpb24gc3RhdGVcblx0cHJpdmF0ZSB2aXNpYmxlTGltaXQ6IG51bWJlciA9IFBBR0VfU0laRTtcblxuXHQvLyBEZXRhaWwgcGFuZWxcblx0cHJpdmF0ZSByZWFkb25seSBkZXRhaWxQYW5lbDogQ2hhdERlYnVnRGV0YWlsUGFuZWw7XG5cdHByaXZhdGUgZXZlbnRCeUlkID0gbmV3IE1hcDxzdHJpbmcsIElDaGF0RGVidWdFdmVudD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSByZWZyZXNoU2NoZWR1bGVyOiBSdW5PbmNlU2NoZWR1bGVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHBhcmVudDogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBmaWx0ZXJTdGF0ZTogQ2hhdERlYnVnRmlsdGVyU3RhdGUsXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElDaGF0RGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdERlYnVnU2VydmljZTogSUNoYXREZWJ1Z1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5jb250YWluZXIgPSBET00uYXBwZW5kKHBhcmVudCwgJCgnLmNoYXQtZGVidWctZmxvd2NoYXJ0JykpO1xuXHRcdERPTS5oaWRlKHRoaXMuY29udGFpbmVyKTtcblxuXHRcdC8vIEJyZWFkY3J1bWJcblx0XHRjb25zdCBicmVhZGNydW1iQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnLmNoYXQtZGVidWctYnJlYWRjcnVtYicpKTtcblx0XHR0aGlzLmJyZWFkY3J1bWJXaWRnZXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgQnJlYWRjcnVtYnNXaWRnZXQoYnJlYWRjcnVtYkNvbnRhaW5lciwgMywgdW5kZWZpbmVkLCBDb2RpY29uLmNoZXZyb25SaWdodCwgZGVmYXVsdEJyZWFkY3J1bWJzV2lkZ2V0U3R5bGVzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2V0dXBCcmVhZGNydW1iS2V5Ym9hcmROYXZpZ2F0aW9uKGJyZWFkY3J1bWJDb250YWluZXIsIHRoaXMuYnJlYWRjcnVtYldpZGdldCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYnJlYWRjcnVtYldpZGdldC5vbkRpZFNlbGVjdEl0ZW0oZSA9PiB7XG5cdFx0XHRpZiAoZS50eXBlID09PSAnc2VsZWN0JyAmJiBlLml0ZW0gaW5zdGFuY2VvZiBUZXh0QnJlYWRjcnVtYkl0ZW0pIHtcblx0XHRcdFx0dGhpcy5icmVhZGNydW1iV2lkZ2V0LnNldFNlbGVjdGlvbih1bmRlZmluZWQpO1xuXHRcdFx0XHRjb25zdCBpdGVtcyA9IHRoaXMuYnJlYWRjcnVtYldpZGdldC5nZXRJdGVtcygpO1xuXHRcdFx0XHRjb25zdCBpZHggPSBpdGVtcy5pbmRleE9mKGUuaXRlbSk7XG5cdFx0XHRcdGlmIChpZHggPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLl9vbk5hdmlnYXRlLmZpcmUoRmxvd0NoYXJ0TmF2aWdhdGlvbi5Ib21lKTtcblx0XHRcdFx0fSBlbHNlIGlmIChpZHggPT09IDEpIHtcblx0XHRcdFx0XHR0aGlzLl9vbk5hdmlnYXRlLmZpcmUoRmxvd0NoYXJ0TmF2aWdhdGlvbi5PdmVydmlldyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBIZWFkZXIgd2l0aCBGaWx0ZXJXaWRnZXRcblx0XHR0aGlzLmhlYWRlckNvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5jb250YWluZXIsICQoJy5jaGF0LWRlYnVnLWVkaXRvci1oZWFkZXInKSk7XG5cdFx0Y29uc3QgaGVhZGVyQ29udGFpbmVyID0gdGhpcy5oZWFkZXJDb250YWluZXI7XG5cdFx0Y29uc3Qgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZChoZWFkZXJDb250YWluZXIpKTtcblx0XHRjb25zdCBzeW5jQ29udGV4dEtleXMgPSBiaW5kRmlsdGVyQ29udGV4dEtleXModGhpcy5maWx0ZXJTdGF0ZSwgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHN5bmNDb250ZXh0S2V5cygpO1xuXG5cdFx0Y29uc3QgY2hpbGRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQoXG5cdFx0XHRuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgc2NvcGVkQ29udGV4dEtleVNlcnZpY2VdKVxuXHRcdCkpO1xuXHRcdHRoaXMuZmlsdGVyV2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIoY2hpbGRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGaWx0ZXJXaWRnZXQsIHtcblx0XHRcdHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnY2hhdERlYnVnLmZsb3djaGFydC5zZWFyY2gnLCBcIkZpbHRlciBub2Rlcy4uLlwiKSxcblx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ2NoYXREZWJ1Zy5mbG93Y2hhcnQuZmlsdGVyQXJpYUxhYmVsJywgXCJGaWx0ZXIgZmxvdyBjaGFydCBub2Rlc1wiKSxcblx0XHR9KSk7XG5cdFx0Y29uc3QgZmlsdGVyQ29udGFpbmVyID0gRE9NLmFwcGVuZChoZWFkZXJDb250YWluZXIsICQoJy52aWV3cGFuZS1maWx0ZXItY29udGFpbmVyJykpO1xuXHRcdGZpbHRlckNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmZpbHRlcldpZGdldC5lbGVtZW50KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsdGVyV2lkZ2V0Lm9uRGlkQ2hhbmdlRmlsdGVyVGV4dCh0ZXh0ID0+IHtcblx0XHRcdHRoaXMuZmlsdGVyU3RhdGUuc2V0VGV4dEZpbHRlcih0ZXh0KTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZWFjdCB0byBzaGFyZWQgZmlsdGVyIHN0YXRlIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbHRlclN0YXRlLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHN5bmNDb250ZXh0S2V5cygpO1xuXHRcdFx0dGhpcy5maWx0ZXJXaWRnZXQuY2hlY2tNb3JlRmlsdGVycyghdGhpcy5maWx0ZXJTdGF0ZS5pc0FsbEZpbHRlcnNEZWZhdWx0KCkpO1xuXHRcdFx0dGhpcy52aXNpYmxlTGltaXQgPSBQQUdFX1NJWkU7XG5cdFx0XHQvLyBSZXNldCBwYW4vem9vbSBzbyBmaWx0ZXJlZCBjb250ZW50IGlzIHZpc2libGVcblx0XHRcdHRoaXMuaGFzVXNlclBhbm5lZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5sYXN0RXZlbnRDb3VudCA9IDA7XG5cdFx0XHR0aGlzLmxvYWQoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBDb250ZW50IHdyYXBwZXIgKGZsZXggcm93OiBjaGFydCBjYW52YXMgKyBkZXRhaWwgcGFuZWwpXG5cdFx0Y29uc3QgY29udGVudFdyYXBwZXIgPSBET00uYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKCcuY2hhdC1kZWJ1Zy1mbG93Y2hhcnQtY29udGVudC13cmFwcGVyJykpO1xuXHRcdHRoaXMuY29udGVudCA9IERPTS5hcHBlbmQoY29udGVudFdyYXBwZXIsICQoJy5jaGF0LWRlYnVnLWZsb3djaGFydC1jb250ZW50JykpO1xuXG5cdFx0Ly8gRGV0YWlsIHBhbmVsIChzaWJsaW5nIG9mIGNoYXJ0IGNhbnZhcylcblx0XHR0aGlzLmRldGFpbFBhbmVsID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0RGVidWdEZXRhaWxQYW5lbCwgY29udGVudFdyYXBwZXIpKTtcblxuXHRcdC8vIFNldCB1cCBwYW4vem9vbSBldmVudCBsaXN0ZW5lcnMgYW5kIGtleWJvYXJkIGhhbmRsaW5nXG5cdFx0dGhpcy5zZXR1cFBhblpvb20oKTtcblx0XHR0aGlzLnNldHVwS2V5Ym9hcmQoKTtcblxuXHRcdHRoaXMucmVmcmVzaFNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMubG9hZCgpLCAxMDApKTtcblx0fVxuXG5cdHNldFNlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY3VycmVudFNlc3Npb25SZXNvdXJjZSB8fCB0aGlzLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSAhPT0gc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpIHtcblx0XHRcdC8vIFJlc2V0IHBhbi96b29tLCBmb2N1cywgY29sbGFwc2UsIGFuZCBwYWdpbmF0aW9uIHN0YXRlIG9uIHNlc3Npb24gY2hhbmdlXG5cdFx0XHR0aGlzLnNjYWxlID0gMTtcblx0XHRcdHRoaXMudHJhbnNsYXRlWCA9IDA7XG5cdFx0XHR0aGlzLnRyYW5zbGF0ZVkgPSAwO1xuXHRcdFx0dGhpcy5sYXN0RXZlbnRDb3VudCA9IDA7XG5cdFx0XHR0aGlzLmhhc1VzZXJQYW5uZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuZm9jdXNlZEVsZW1lbnRJZCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuY29sbGFwc2VkTm9kZUlkcy5jbGVhcigpO1xuXHRcdFx0dGhpcy5leHBhbmRlZE1lcmdlZElkcy5jbGVhcigpO1xuXHRcdFx0dGhpcy52aXNpYmxlTGltaXQgPSBQQUdFX1NJWkU7XG5cdFx0XHR0aGlzLmRldGFpbFBhbmVsLmhpZGUoKTtcblx0XHR9XG5cdFx0dGhpcy5jdXJyZW50U2Vzc2lvblJlc291cmNlID0gc2Vzc2lvblJlc291cmNlO1xuXHR9XG5cblx0c2hvdygpOiB2b2lkIHtcblx0XHRET00uc2hvdyh0aGlzLmNvbnRhaW5lcik7XG5cdFx0dGhpcy5sb2FkKCk7XG5cdH1cblxuXHRoaWRlKCk6IHZvaWQge1xuXHRcdERPTS5oaWRlKHRoaXMuY29udGFpbmVyKTtcblx0XHR0aGlzLnJlZnJlc2hTY2hlZHVsZXIuY2FuY2VsKCk7XG5cdH1cblxuXHRyZWZyZXNoKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ICE9PSAnbm9uZScpIHtcblx0XHRcdGlmICghdGhpcy5yZWZyZXNoU2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0dGhpcy5yZWZyZXNoU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0dXBkYXRlQnJlYWRjcnVtYigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY3VycmVudFNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uVGl0bGUgPSB0aGlzLmNoYXRTZXJ2aWNlLmdldFNlc3Npb25UaXRsZSh0aGlzLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UpIHx8IExvY2FsQ2hhdFNlc3Npb25VcmkucGFyc2VMb2NhbFNlc3Npb25JZCh0aGlzLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UpIHx8IHRoaXMuY3VycmVudFNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdHRoaXMuYnJlYWRjcnVtYldpZGdldC5zZXRJdGVtcyhbXG5cdFx0XHRuZXcgVGV4dEJyZWFkY3J1bWJJdGVtKGxvY2FsaXplKCdjaGF0RGVidWcudGl0bGUnLCBcIkFnZW50IERlYnVnIExvZ3NcIiksIHRydWUpLFxuXHRcdFx0bmV3IFRleHRCcmVhZGNydW1iSXRlbShzZXNzaW9uVGl0bGUsIHRydWUpLFxuXHRcdFx0bmV3IFRleHRCcmVhZGNydW1iSXRlbShsb2NhbGl6ZSgnY2hhdERlYnVnLmZsb3dDaGFydCcsIFwiQWdlbnQgRmxvdyBDaGFydFwiKSksXG5cdFx0XSk7XG5cdH1cblxuXHRwcml2YXRlIGxvYWQoKTogdm9pZCB7XG5cdFx0Ly8gQ2hlY2sgd2hldGhlciB0aGUgY2hhcnQgY29udGVudCBjdXJyZW50bHkgaGFzIGZvY3VzIGJlZm9yZSBjbGVhcmluZyBpdCxcblx0XHQvLyBzbyB3ZSBvbmx5IHJlc3RvcmUgZm9jdXMgaWYgaXQgd2FzIHRha2VuIGF3YXkgYnkgdGhlIHJlLXJlbmRlci5cblx0XHRjb25zdCBoYWRGb2N1cyA9IERPTS5pc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50KHRoaXMuY29udGVudCk7XG5cblx0XHRET00uY2xlYXJOb2RlKHRoaXMuY29udGVudCk7XG5cdFx0dGhpcy5sb2FkRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLnVwZGF0ZUJyZWFkY3J1bWIoKTtcblxuXHRcdGNvbnN0IGV2ZW50cyA9IHRoaXMuY2hhdERlYnVnU2VydmljZS5nZXRFdmVudHModGhpcy5jdXJyZW50U2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBpc0ZpcnN0TG9hZCA9IHRoaXMubGFzdEV2ZW50Q291bnQgPT09IDA7XG5cdFx0dGhpcy5sYXN0RXZlbnRDb3VudCA9IGV2ZW50cy5sZW5ndGg7XG5cblx0XHQvLyBCdWlsZCBldmVudCBJRCBcdTIxOTIgZXZlbnQgbWFwIGZvciBkZXRhaWwgcGFuZWwgbG9va3Vwc1xuXHRcdHRoaXMuZXZlbnRCeUlkLmNsZWFyKCk7XG5cdFx0Zm9yIChjb25zdCBlIG9mIGV2ZW50cykge1xuXHRcdFx0aWYgKGUuaWQpIHtcblx0XHRcdFx0dGhpcy5ldmVudEJ5SWQuc2V0KGUuaWQsIGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChldmVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRjb25zdCBlbXB0eU1zZyA9IERPTS5hcHBlbmQodGhpcy5jb250ZW50LCAkKCcuY2hhdC1kZWJ1Zy1mbG93Y2hhcnQtZW1wdHknKSk7XG5cdFx0XHRlbXB0eU1zZy50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0RGVidWcuZmxvd0NoYXJ0Lm5vRXZlbnRzJywgXCJObyBldmVudHMgcmVjb3JkZWQgZm9yIHRoaXMgc2Vzc2lvbi5cIik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQnVpbGQsIGZpbHRlciwgc2xpY2UsIGFuZCByZW5kZXIgdGhlIGZsb3cgY2hhcnRcblx0XHRjb25zdCBmbG93Tm9kZXMgPSBidWlsZEZsb3dHcmFwaChldmVudHMpO1xuXHRcdGNvbnN0IGZpbHRlcmVkID0gZmlsdGVyRmxvd05vZGVzKGZsb3dOb2Rlcywge1xuXHRcdFx0aXNLaW5kVmlzaWJsZTogKGtpbmQsIGNhdGVnb3J5KSA9PiB0aGlzLmZpbHRlclN0YXRlLmlzS2luZFZpc2libGUoa2luZCwgY2F0ZWdvcnkpLFxuXHRcdFx0dGV4dEZpbHRlcjogdGhpcy5maWx0ZXJTdGF0ZS50ZXh0RmlsdGVyLFxuXHRcdH0pO1xuXG5cdFx0aWYgKGZpbHRlcmVkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Y29uc3QgZW1wdHlNc2cgPSBET00uYXBwZW5kKHRoaXMuY29udGVudCwgJCgnLmNoYXQtZGVidWctZmxvd2NoYXJ0LWVtcHR5JykpO1xuXHRcdFx0ZW1wdHlNc2cudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdERlYnVnLmZsb3dDaGFydC5ub01hdGNoZXMnLCBcIk5vIG5vZGVzIG1hdGNoIHRoZSBjdXJyZW50IGZpbHRlci5cIik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2xpY2UgPSBzbGljZUZsb3dOb2RlcyhmaWx0ZXJlZCwgdGhpcy52aXNpYmxlTGltaXQpO1xuXHRcdGNvbnN0IG1lcmdlZCA9IG1lcmdlVG9vbENhbGxOb2RlcyhtZXJnZURpc2NvdmVyeU5vZGVzKHNsaWNlLm5vZGVzKSk7XG5cdFx0Y29uc3QgbGF5b3V0ID0gbGF5b3V0Rmxvd0dyYXBoKG1lcmdlZCwgeyBjb2xsYXBzZWRJZHM6IHRoaXMuY29sbGFwc2VkTm9kZUlkcywgZXhwYW5kZWRNZXJnZWRJZHM6IHRoaXMuZXhwYW5kZWRNZXJnZWRJZHMgfSk7XG5cdFx0dGhpcy5yZW5kZXJSZXN1bHQgPSByZW5kZXJGbG93Q2hhcnRTVkcobGF5b3V0KTtcblxuXHRcdHRoaXMuc3ZnV3JhcHBlciA9IERPTS5hcHBlbmQodGhpcy5jb250ZW50LCAkKCcuY2hhdC1kZWJ1Zy1mbG93Y2hhcnQtc3ZnLXdyYXBwZXInKSk7XG5cdFx0dGhpcy5zdmdXcmFwcGVyLmFwcGVuZENoaWxkKHRoaXMucmVuZGVyUmVzdWx0LnN2Zyk7XG5cdFx0dGhpcy5zdmdFbGVtZW50ID0gdGhpcy5yZW5kZXJSZXN1bHQuc3ZnO1xuXG5cdFx0Ly8gU2hvdyBcIlNob3cgTW9yZVwiIGJ1dHRvbiBiZWxvdyB0aGUgY2hhcnQgd2hlbiB0aGVyZSBhcmUgbW9yZSBub2Rlc1xuXHRcdGlmIChzbGljZS5zaG93bkNvdW50IDwgc2xpY2UudG90YWxDb3VudCkge1xuXHRcdFx0Y29uc3QgcmVtYWluaW5nID0gc2xpY2UudG90YWxDb3VudCAtIHNsaWNlLnNob3duQ291bnQ7XG5cdFx0XHRjb25zdCBzaG93TW9yZUNvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5zdmdXcmFwcGVyLCAkKCcuY2hhdC1kZWJ1Zy1mbG93Y2hhcnQtc2hvdy1tb3JlJykpO1xuXHRcdFx0Y29uc3Qgc2hvd01vcmVCdG4gPSB0aGlzLmxvYWREaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbihzaG93TW9yZUNvbnRhaW5lciwgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUsIHRpdGxlOiBsb2NhbGl6ZSgnY2hhdERlYnVnLmZsb3dDaGFydC5zaG93TW9yZVRpdGxlJywgXCJMb2FkIG1vcmUgbm9kZXNcIikgfSkpO1xuXHRcdFx0c2hvd01vcmVCdG4ubGFiZWwgPSBsb2NhbGl6ZSgnY2hhdERlYnVnLmZsb3dDaGFydC5zaG93TW9yZScsIFwiU2hvdyBNb3JlICh7MH0pXCIsIHJlbWFpbmluZyk7XG5cdFx0XHR0aGlzLmxvYWREaXNwb3NhYmxlcy5hZGQoc2hvd01vcmVCdG4ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHRcdHRoaXMudmlzaWJsZUxpbWl0ICs9IFBBR0VfU0laRTtcblx0XHRcdFx0dGhpcy5sb2FkKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gT25seSBjZW50ZXIgb24gZmlyc3QgbG9hZCB3aGVuIHVzZXIgaGFzbid0IHBhbm5lZCB5ZXRcblx0XHRpZiAoaXNGaXJzdExvYWQgJiYgIXRoaXMuaGFzVXNlclBhbm5lZCkge1xuXHRcdFx0RE9NLmdldFdpbmRvdyh0aGlzLmNvbnRlbnQpLnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuY2VudGVyQ29udGVudCgpO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEFwcGx5IGV4aXN0aW5nIHRyYW5zZm9ybSB0byBwcmVzZXJ2ZSBwb3NpdGlvblxuXHRcdFx0dGhpcy5hcHBseVRyYW5zZm9ybSgpO1xuXHRcdH1cblxuXHRcdC8vIFJlc3RvcmUgZm9jdXMgYWZ0ZXIgcmUtcmVuZGVyIG9ubHkgd2hlbiB0aGUgY2hhcnQgaXRzZWxmIGhhZCBmb2N1c1xuXHRcdC8vIGJlZm9yZSBjbGVhck5vZGUgcmVtb3ZlZCBpdCAoZS5nLiBhZnRlciBjb2xsYXBzZSB0b2dnbGUpLiBTa2lwIHdoZW5cblx0XHQvLyBmb2N1cyB3YXMgZWxzZXdoZXJlIChkZXRhaWwgcGFuZWwsIGZpbHRlciwgb3Igb3V0c2lkZSB0aGUgY2hhcnQpXG5cdFx0Ly8gc28gdGhhdCBuZXcgZXZlbnRzIGFycml2aW5nIGRvbid0IHN0ZWFsIGZvY3VzLlxuXHRcdGlmICh0aGlzLmZvY3VzZWRFbGVtZW50SWQgJiYgaGFkRm9jdXMgJiYgIURPTS5pc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50KHRoaXMuaGVhZGVyQ29udGFpbmVyKSkge1xuXHRcdFx0dGhpcy5yZXN0b3JlRm9jdXModGhpcy5mb2N1c2VkRWxlbWVudElkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNldHVwUGFuWm9vbSgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuY29udGVudCwgRE9NLkV2ZW50VHlwZS5NT1VTRV9ET1dOLCBlID0+IHRoaXMuaGFuZGxlTW91c2VEb3duKGUpKSk7XG5cdFx0Y29uc3QgdGFyZ2V0RG9jdW1lbnQgPSBET00uZ2V0V2luZG93KHRoaXMuY29udGVudCkuZG9jdW1lbnQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YXJnZXREb2N1bWVudCwgRE9NLkV2ZW50VHlwZS5NT1VTRV9NT1ZFLCBlID0+IHRoaXMuaGFuZGxlTW91c2VNb3ZlKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YXJnZXREb2N1bWVudCwgRE9NLkV2ZW50VHlwZS5NT1VTRV9VUCwgZSA9PiB0aGlzLmhhbmRsZU1vdXNlVXAoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuY29udGVudCwgJ3doZWVsJywgZSA9PiB0aGlzLmhhbmRsZVdoZWVsKGUpLCB7IHBhc3NpdmU6IGZhbHNlIH0pKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0dXBLZXlib2FyZCgpOiB2b2lkIHtcblx0XHQvLyBUcmFjayB3aGljaCBub2RlL2hlYWRlciBnZXRzIGZvY3VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNvbnRlbnQsIERPTS5FdmVudFR5cGUuRk9DVVNfSU4sIChlOiBGb2N1c0V2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBlbCA9IGUudGFyZ2V0IGFzIEVsZW1lbnQgfCBudWxsO1xuXHRcdFx0aWYgKCFlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBDaGVjayBmb3Igc3ViZ3JhcGggaGVhZGVyIG9yIG5vZGVcblx0XHRcdGNvbnN0IHN1YmdyYXBoSWQgPSBlbC5nZXRBdHRyaWJ1dGU/LignZGF0YS1zdWJncmFwaC1pZCcpO1xuXHRcdFx0aWYgKHN1YmdyYXBoSWQpIHtcblx0XHRcdFx0dGhpcy5mb2N1c2VkRWxlbWVudElkID0gYHNnOiR7c3ViZ3JhcGhJZH1gO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBub2RlSWQgPSBlbC5nZXRBdHRyaWJ1dGU/LignZGF0YS1ub2RlLWlkJyk7XG5cdFx0XHRpZiAobm9kZUlkKSB7XG5cdFx0XHRcdHRoaXMuZm9jdXNlZEVsZW1lbnRJZCA9IG5vZGVJZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBIYW5kbGUga2V5Ym9hcmQgYWN0aW9uc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5jb250ZW50LCBET00uRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgRWxlbWVudCB8IG51bGw7XG5cdFx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzdWJncmFwaElkID0gdGFyZ2V0LmdldEF0dHJpYnV0ZT8uKCdkYXRhLXN1YmdyYXBoLWlkJyk7XG5cblx0XHRcdHN3aXRjaCAoZS5rZXkpIHtcblx0XHRcdFx0Y2FzZSAnVGFiJzoge1xuXHRcdFx0XHRcdC8vIE5hdmlnYXRlIGJldHdlZW4gZmxvdyBjaGFydCBub2Rlcy4gV2hlbiBhdCB0aGUgYm91bmRhcnksXG5cdFx0XHRcdFx0Ly8gZXhwbGljaXRseSBtb3ZlIGZvY3VzIHRvIHRoZSBkZXRhaWwgcGFuZWwgKGZvcndhcmQpIG9yXG5cdFx0XHRcdFx0Ly8gbGV0IGl0IGxlYXZlIHRoZSBjaGFydCAoYmFja3dhcmQpLiBXZSBjYW5ub3QgcmVseSBvblxuXHRcdFx0XHRcdC8vIG5hdHVyYWwgdGFiLW91dCBiZWNhdXNlIERPTSBvcmRlciBvZiBTVkcgZWxlbWVudHMgZG9lc1xuXHRcdFx0XHRcdC8vIG5vdCBtYXRjaCB0aGUgdmlzdWFsIHNvcnRlZCBvcmRlciwgd2hpY2ggd291bGQgY2F1c2Vcblx0XHRcdFx0XHQvLyBmb2N1cyB0byBqdW1wIHRvIGEgcmFuZG9tIGNoYXJ0IG5vZGUgaW5zdGVhZCBvZiBsZWF2aW5nLlxuXHRcdFx0XHRcdGlmICh0aGlzLmZvY3VzZWRFbGVtZW50SWQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG1vdmVkID0gdGhpcy5mb2N1c0FkamFjZW50RWxlbWVudCh0aGlzLmZvY3VzZWRFbGVtZW50SWQsIGUuc2hpZnRLZXkgPyAtMSA6IDEpO1xuXHRcdFx0XHRcdFx0aWYgKG1vdmVkKSB7XG5cdFx0XHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoIWUuc2hpZnRLZXkgJiYgdGhpcy5kZXRhaWxQYW5lbC5pc1Zpc2libGUpIHtcblx0XHRcdFx0XHRcdFx0Ly8gRm9yd2FyZCBUYWIgYXQgZW5kIG9mIGNoYXJ0OiBtb3ZlIHRvIHRoZSBkZXRhaWwgcGFuZWxcblx0XHRcdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLmRldGFpbFBhbmVsLmZvY3VzKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIGlmICghZS5zaGlmdEtleSkge1xuXHRcdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdFx0dGhpcy5mb2N1c0ZpcnN0RWxlbWVudCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdFbnRlcic6XG5cdFx0XHRcdGNhc2UgJyAnOlxuXHRcdFx0XHRcdGlmIChzdWJncmFwaElkKSB7XG5cdFx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdFx0dGhpcy5kZXRhaWxQYW5lbC5oaWRlKCk7XG5cdFx0XHRcdFx0XHR0aGlzLnRvZ2dsZVN1YmdyYXBoKHN1YmdyYXBoSWQpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb25zdCBub2RlSWQgPSB0YXJnZXQuZ2V0QXR0cmlidXRlPy4oJ2RhdGEtbm9kZS1pZCcpO1xuXHRcdFx0XHRcdFx0aWYgKG5vZGVJZCkge1xuXHRcdFx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0XHRcdGlmICh0YXJnZXQuZ2V0QXR0cmlidXRlPy4oJ2RhdGEtaXMtdG9nZ2xlJykpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmRldGFpbFBhbmVsLmhpZGUoKTtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLnRvZ2dsZU1lcmdlZERpc2NvdmVyeShub2RlSWQpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGV2ZW50ID0gdGhpcy5ldmVudEJ5SWQuZ2V0KG5vZGVJZCk7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGV2ZW50KSB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLmRldGFpbFBhbmVsLnNob3coZXZlbnQpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnQXJyb3dEb3duJzpcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0aWYgKHRoaXMuZm9jdXNlZEVsZW1lbnRJZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5mb2N1c0VkZ2VOZWlnaGJvcih0aGlzLmZvY3VzZWRFbGVtZW50SWQsICduZXh0Jyk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuZm9jdXNGaXJzdEVsZW1lbnQoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ0Fycm93UmlnaHQnOlxuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRpZiAodGhpcy5mb2N1c2VkRWxlbWVudElkKSB7XG5cdFx0XHRcdFx0XHQvLyBFeHBhbmQgY29sbGFwc2VkIHN1YmdyYXBoIG9yIG1lcmdlZCBkaXNjb3Zlcnkgbm9kZSxcblx0XHRcdFx0XHRcdC8vIHRoZW4ganVtcCBmb2N1cyB0byB0aGUgZmlyc3QgcmV2ZWFsZWQgY2hpbGQuXG5cdFx0XHRcdFx0XHRpZiAoc3ViZ3JhcGhJZCAmJiB0aGlzLmNvbGxhcHNlZE5vZGVJZHMuaGFzKHN1YmdyYXBoSWQpKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuZGV0YWlsUGFuZWwuaGlkZSgpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLmNvbGxhcHNlZE5vZGVJZHMuZGVsZXRlKHN1YmdyYXBoSWQpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLmZvY3VzZWRFbGVtZW50SWQgPSBgc2c6JHtzdWJncmFwaElkfWA7XG5cdFx0XHRcdFx0XHRcdHRoaXMubG9hZCgpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLmZvY3VzRmlyc3RDaGlsZE9mKGBzZzoke3N1YmdyYXBoSWR9YCk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHRhcmdldC5nZXRBdHRyaWJ1dGU/LignZGF0YS1pcy10b2dnbGUnKSkge1xuXHRcdFx0XHRcdFx0XHRpZiAoIXRoaXMuZXhwYW5kZWRNZXJnZWRJZHMuaGFzKHRoaXMuZm9jdXNlZEVsZW1lbnRJZCkpIHtcblx0XHRcdFx0XHRcdFx0XHQvLyBFeHBhbmQgYW5kIGp1bXAgdG8gdGhlIGZpcnN0IGNoaWxkXG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5kZXRhaWxQYW5lbC5oaWRlKCk7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgbWVyZ2VkSWQgPSB0aGlzLmZvY3VzZWRFbGVtZW50SWQ7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5leHBhbmRlZE1lcmdlZElkcy5hZGQobWVyZ2VkSWQpO1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuZm9jdXNlZEVsZW1lbnRJZCA9IG1lcmdlZElkO1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMubG9hZCgpO1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuZm9jdXNGaXJzdENoaWxkT2YobWVyZ2VkSWQpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdC8vIEFscmVhZHkgZXhwYW5kZWQ6IGp1bXAgdG8gdGhlIGZpcnN0IGNoaWxkXG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5mb2N1c0ZpcnN0Q2hpbGRPZih0aGlzLmZvY3VzZWRFbGVtZW50SWQpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuZm9jdXNGaXJzdEVsZW1lbnQoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ0Fycm93VXAnOlxuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRpZiAodGhpcy5mb2N1c2VkRWxlbWVudElkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmZvY3VzRWRnZU5laWdoYm9yKHRoaXMuZm9jdXNlZEVsZW1lbnRJZCwgJ3ByZXYnKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5mb2N1c0ZpcnN0RWxlbWVudCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnQXJyb3dMZWZ0Jzpcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0aWYgKHRoaXMuZm9jdXNlZEVsZW1lbnRJZCkge1xuXHRcdFx0XHRcdFx0Ly8gQ29sbGFwc2UgZXhwYW5kZWQgc3ViZ3JhcGggb3IgbWVyZ2VkIGRpc2NvdmVyeSBub2RlXG5cdFx0XHRcdFx0XHRpZiAoc3ViZ3JhcGhJZCAmJiAhdGhpcy5jb2xsYXBzZWROb2RlSWRzLmhhcyhzdWJncmFwaElkKSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmRldGFpbFBhbmVsLmhpZGUoKTtcblx0XHRcdFx0XHRcdFx0dGhpcy50b2dnbGVTdWJncmFwaChzdWJncmFwaElkKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAodGFyZ2V0LmdldEF0dHJpYnV0ZT8uKCdkYXRhLWlzLXRvZ2dsZScpICYmIHRoaXMuZXhwYW5kZWRNZXJnZWRJZHMuaGFzKHRoaXMuZm9jdXNlZEVsZW1lbnRJZCkpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5kZXRhaWxQYW5lbC5oaWRlKCk7XG5cdFx0XHRcdFx0XHRcdHRoaXMudG9nZ2xlTWVyZ2VkRGlzY292ZXJ5KHRoaXMuZm9jdXNlZEVsZW1lbnRJZCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHQvLyBOYXZpZ2F0ZSBiYWNrIHRvIHBhcmVudCAoZm9sbG93IGVkZ2UgYmFja3dhcmQpXG5cdFx0XHRcdFx0XHRcdHRoaXMuZm9jdXNFZGdlTmVpZ2hib3IodGhpcy5mb2N1c2VkRWxlbWVudElkLCAncHJldicpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnSG9tZSc6XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdHRoaXMuZm9jdXNGaXJzdEVsZW1lbnQoKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnRW5kJzpcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0dGhpcy5mb2N1c0xhc3RFbGVtZW50KCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJz0nOlxuXHRcdFx0XHRjYXNlICcrJzpcblx0XHRcdFx0XHRpZiAoIWUuY3RybEtleSAmJiAhZS5tZXRhS2V5KSB7XG5cdFx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0XHR0aGlzLnpvb21CeShaT09NX1NURVApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnLSc6XG5cdFx0XHRcdFx0aWYgKCFlLmN0cmxLZXkgJiYgIWUubWV0YUtleSkge1xuXHRcdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdFx0dGhpcy56b29tQnkoLVpPT01fU1RFUCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgdG9nZ2xlU3ViZ3JhcGgoc3ViZ3JhcGhJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY29sbGFwc2VkTm9kZUlkcy5oYXMoc3ViZ3JhcGhJZCkpIHtcblx0XHRcdHRoaXMuY29sbGFwc2VkTm9kZUlkcy5kZWxldGUoc3ViZ3JhcGhJZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY29sbGFwc2VkTm9kZUlkcy5hZGQoc3ViZ3JhcGhJZCk7XG5cdFx0fVxuXHRcdHRoaXMuZm9jdXNlZEVsZW1lbnRJZCA9IGBzZzoke3N1YmdyYXBoSWR9YDtcblx0XHR0aGlzLmxvYWQoKTtcblx0fVxuXG5cdHByaXZhdGUgdG9nZ2xlTWVyZ2VkRGlzY292ZXJ5KG1lcmdlZElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5leHBhbmRlZE1lcmdlZElkcy5oYXMobWVyZ2VkSWQpKSB7XG5cdFx0XHR0aGlzLmV4cGFuZGVkTWVyZ2VkSWRzLmRlbGV0ZShtZXJnZWRJZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZXhwYW5kZWRNZXJnZWRJZHMuYWRkKG1lcmdlZElkKTtcblx0XHR9XG5cdFx0dGhpcy5mb2N1c2VkRWxlbWVudElkID0gbWVyZ2VkSWQ7XG5cdFx0dGhpcy5sb2FkKCk7XG5cdH1cblxuXHRwcml2YXRlIGZvY3VzRmlyc3RFbGVtZW50KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5yZW5kZXJSZXN1bHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZmlyc3QgPSB0aGlzLnJlbmRlclJlc3VsdC5mb2N1c2FibGVFbGVtZW50cy52YWx1ZXMoKS5uZXh0KCk7XG5cdFx0aWYgKCFmaXJzdC5kb25lKSB7XG5cdFx0XHQoZmlyc3QudmFsdWUgYXMgU1ZHRWxlbWVudCkuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGZvY3VzTGFzdEVsZW1lbnQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnJlbmRlclJlc3VsdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBlbnRyaWVzID0gWy4uLnRoaXMucmVuZGVyUmVzdWx0LmZvY3VzYWJsZUVsZW1lbnRzLnZhbHVlcygpXTtcblx0XHRpZiAoZW50cmllcy5sZW5ndGggPiAwKSB7XG5cdFx0XHQoZW50cmllc1tlbnRyaWVzLmxlbmd0aCAtIDFdIGFzIFNWR0VsZW1lbnQpLmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBmb2N1c0FkamFjZW50RWxlbWVudChjdXJyZW50TWFwS2V5OiBzdHJpbmcsIGRpcmVjdGlvbjogMSB8IC0xKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLnJlbmRlclJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBrZXlzID0gWy4uLnRoaXMucmVuZGVyUmVzdWx0LmZvY3VzYWJsZUVsZW1lbnRzLmtleXMoKV07XG5cdFx0Y29uc3QgaWR4ID0ga2V5cy5pbmRleE9mKGN1cnJlbnRNYXBLZXkpO1xuXHRcdGlmIChpZHggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IG5leHRJZHggPSBpZHggKyBkaXJlY3Rpb247XG5cdFx0aWYgKG5leHRJZHggPCAwIHx8IG5leHRJZHggPj0ga2V5cy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgZWwgPSB0aGlzLnJlbmRlclJlc3VsdC5mb2N1c2FibGVFbGVtZW50cy5nZXQoa2V5c1tuZXh0SWR4XSk7XG5cdFx0aWYgKGVsKSB7XG5cdFx0XHQoZWwgYXMgU1ZHRWxlbWVudCkuZm9jdXMoKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGZvY3VzRWRnZU5laWdoYm9yKGN1cnJlbnRJZDogc3RyaW5nLCBkaXJlY3Rpb246ICduZXh0JyB8ICdwcmV2Jyk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5yZW5kZXJSZXN1bHQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLnJlbmRlclJlc3VsdC5hZGphY2VuY3kuZ2V0KGN1cnJlbnRJZCk7XG5cdFx0Y29uc3QgbmVpZ2hib3JzID0gZW50cnk/LltkaXJlY3Rpb25dO1xuXHRcdGlmICghbmVpZ2hib3JzIHx8IG5laWdoYm9ycy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Ly8gRm9jdXMgdGhlIGZpcnN0IG5laWdoYm9yIHRoYXQgaGFzIGEgZm9jdXNhYmxlIGVsZW1lbnRcblx0XHRmb3IgKGNvbnN0IGlkIG9mIG5laWdoYm9ycykge1xuXHRcdFx0Y29uc3QgZWwgPSB0aGlzLnJlbmRlclJlc3VsdC5mb2N1c2FibGVFbGVtZW50cy5nZXQoaWQpO1xuXHRcdFx0aWYgKGVsKSB7XG5cdFx0XHRcdChlbCBhcyBTVkdFbGVtZW50KS5mb2N1cygpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBmb2N1c0ZpcnN0Q2hpbGRPZihwYXJlbnRJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnJlbmRlclJlc3VsdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBlbnRyeSA9IHRoaXMucmVuZGVyUmVzdWx0LmFkamFjZW5jeS5nZXQocGFyZW50SWQpO1xuXHRcdGlmICghZW50cnk/Lm5leHQgfHwgZW50cnkubmV4dC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gUHJlZmVyIGEgbmVpZ2hib3IgcG9zaXRpb25lZCB0byB0aGUgcmlnaHQgb2YgdGhlIHBhcmVudFxuXHRcdC8vIChleHBhbmRlZCBjaGlsZCkgb3ZlciBvbmUgYmVsb3cgKG5leHQgaW4gbWFpbiBmbG93KS5cblx0XHRjb25zdCBwYXJlbnRQb3MgPSB0aGlzLnJlbmRlclJlc3VsdC5wb3NpdGlvbnMuZ2V0KHBhcmVudElkKTtcblx0XHRsZXQgYmVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCBpZCBvZiBlbnRyeS5uZXh0KSB7XG5cdFx0XHRpZiAoIXRoaXMucmVuZGVyUmVzdWx0LmZvY3VzYWJsZUVsZW1lbnRzLmhhcyhpZCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWJlc3RJZCkge1xuXHRcdFx0XHRiZXN0SWQgPSBpZDtcblx0XHRcdH1cblx0XHRcdGlmIChwYXJlbnRQb3MpIHtcblx0XHRcdFx0Y29uc3QgcG9zID0gdGhpcy5yZW5kZXJSZXN1bHQucG9zaXRpb25zLmdldChpZCk7XG5cdFx0XHRcdGlmIChwb3MgJiYgcG9zLnggPiBwYXJlbnRQb3MueCkge1xuXHRcdFx0XHRcdGJlc3RJZCA9IGlkO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChiZXN0SWQpIHtcblx0XHRcdGNvbnN0IGVsID0gdGhpcy5yZW5kZXJSZXN1bHQuZm9jdXNhYmxlRWxlbWVudHMuZ2V0KGJlc3RJZCk7XG5cdFx0XHRpZiAoZWwpIHtcblx0XHRcdFx0dGhpcy5mb2N1c2VkRWxlbWVudElkID0gYmVzdElkO1xuXHRcdFx0XHQoZWwgYXMgU1ZHRWxlbWVudCkuZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlc3RvcmVGb2N1cyhlbGVtZW50SWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGVsID0gdGhpcy5yZW5kZXJSZXN1bHQ/LmZvY3VzYWJsZUVsZW1lbnRzLmdldChlbGVtZW50SWQpO1xuXHRcdGlmIChlbCkge1xuXHRcdFx0ZWwuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHpvb21CeShkZWx0YTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVjdCA9IHRoaXMuY29udGVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRjb25zdCBjZW50ZXJYID0gcmVjdC53aWR0aCAvIDI7XG5cdFx0Y29uc3QgY2VudGVyWSA9IHJlY3QuaGVpZ2h0IC8gMjtcblx0XHRjb25zdCBuZXdTY2FsZSA9IE1hdGgubWluKE1BWF9TQ0FMRSwgTWF0aC5tYXgoTUlOX1NDQUxFLCB0aGlzLnNjYWxlICogKDEgKyBkZWx0YSkpKTtcblx0XHRjb25zdCBzY2FsZUZhY3RvciA9IG5ld1NjYWxlIC8gdGhpcy5zY2FsZTtcblx0XHR0aGlzLnRyYW5zbGF0ZVggPSBjZW50ZXJYIC0gKGNlbnRlclggLSB0aGlzLnRyYW5zbGF0ZVgpICogc2NhbGVGYWN0b3I7XG5cdFx0dGhpcy50cmFuc2xhdGVZID0gY2VudGVyWSAtIChjZW50ZXJZIC0gdGhpcy50cmFuc2xhdGVZKSAqIHNjYWxlRmFjdG9yO1xuXHRcdHRoaXMuc2NhbGUgPSBuZXdTY2FsZTtcblx0XHR0aGlzLmhhc1VzZXJQYW5uZWQgPSB0cnVlO1xuXHRcdHRoaXMuYXBwbHlUcmFuc2Zvcm0oKTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlTW91c2VEb3duKGU6IE1vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoZS5idXR0b24gIT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdHRoaXMuaXNQYW5uaW5nID0gdHJ1ZTtcblx0XHR0aGlzLmhhc1VzZXJQYW5uZWQgPSB0cnVlO1xuXHRcdHRoaXMuc3RhcnRYID0gZS5jbGllbnRYIC0gdGhpcy50cmFuc2xhdGVYO1xuXHRcdHRoaXMuc3RhcnRZID0gZS5jbGllbnRZIC0gdGhpcy50cmFuc2xhdGVZO1xuXHRcdHRoaXMubW91c2VEb3duWCA9IGUuY2xpZW50WDtcblx0XHR0aGlzLm1vdXNlRG93blkgPSBlLmNsaWVudFk7XG5cdFx0dGhpcy5jb250ZW50LnN0eWxlLmN1cnNvciA9ICdncmFiYmluZyc7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZU1vdXNlTW92ZShlOiBNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlzUGFubmluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZS5idXR0b25zID09PSAwKSB7XG5cdFx0XHR0aGlzLmhhbmRsZU1vdXNlVXAoZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMudHJhbnNsYXRlWCA9IGUuY2xpZW50WCAtIHRoaXMuc3RhcnRYO1xuXHRcdHRoaXMudHJhbnNsYXRlWSA9IGUuY2xpZW50WSAtIHRoaXMuc3RhcnRZO1xuXHRcdHRoaXMuYXBwbHlUcmFuc2Zvcm0oKTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlTW91c2VVcChlOiBNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNQYW5uaW5nKSB7XG5cdFx0XHR0aGlzLmlzUGFubmluZyA9IGZhbHNlO1xuXHRcdFx0dGhpcy5jb250ZW50LnN0eWxlLmN1cnNvciA9ICdncmFiJztcblxuXHRcdFx0Ly8gRGV0ZWN0IGNsaWNrIChub3QgYSBkcmFnKSBcdTIwMTQgZGlzdGFuY2UgPCA1cHhcblx0XHRcdGNvbnN0IGR4ID0gZS5jbGllbnRYIC0gdGhpcy5tb3VzZURvd25YO1xuXHRcdFx0Y29uc3QgZHkgPSBlLmNsaWVudFkgLSB0aGlzLm1vdXNlRG93blk7XG5cdFx0XHRpZiAoZHggKiBkeCArIGR5ICogZHkgPCBDTElDS19USFJFU0hPTERfU1EpIHtcblx0XHRcdFx0dGhpcy5oYW5kbGVDbGljayhlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUNsaWNrKGU6IE1vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHQvLyBXYWxrIHVwIGZyb20gdGhlIGNsaWNrIHRhcmdldCB0byBmaW5kIGEgZm9jdXNhYmxlIGVsZW1lbnRcblx0XHRsZXQgdGFyZ2V0ID0gZS50YXJnZXQgYXMgRWxlbWVudCB8IG51bGw7XG5cdFx0d2hpbGUgKHRhcmdldCAmJiB0YXJnZXQgIT09IHRoaXMuY29udGVudCkge1xuXHRcdFx0Ly8gTWVyZ2VkLWRpc2NvdmVyeSBleHBhbmQgdG9nZ2xlXG5cdFx0XHRjb25zdCBtZXJnZWRJZCA9IHRhcmdldC5nZXRBdHRyaWJ1dGU/LignZGF0YS1tZXJnZWQtaWQnKTtcblx0XHRcdGlmIChtZXJnZWRJZCkge1xuXHRcdFx0XHR0aGlzLmRldGFpbFBhbmVsLmhpZGUoKTtcblx0XHRcdFx0dGhpcy50b2dnbGVNZXJnZWREaXNjb3ZlcnkobWVyZ2VkSWQpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzdWJncmFwaElkID0gdGFyZ2V0LmdldEF0dHJpYnV0ZT8uKCdkYXRhLXN1YmdyYXBoLWlkJyk7XG5cdFx0XHRpZiAoc3ViZ3JhcGhJZCkge1xuXHRcdFx0XHR0aGlzLmRldGFpbFBhbmVsLmhpZGUoKTtcblx0XHRcdFx0dGhpcy50b2dnbGVTdWJncmFwaChzdWJncmFwaElkKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgbm9kZUlkID0gdGFyZ2V0LmdldEF0dHJpYnV0ZT8uKCdkYXRhLW5vZGUtaWQnKTtcblx0XHRcdGlmIChub2RlSWQpIHtcblx0XHRcdFx0KHRhcmdldCBhcyBIVE1MRWxlbWVudCkuZm9jdXMoKTtcblx0XHRcdFx0aWYgKHRhcmdldC5nZXRBdHRyaWJ1dGU/LignZGF0YS1pcy10b2dnbGUnKSkge1xuXHRcdFx0XHRcdHRoaXMuZGV0YWlsUGFuZWwuaGlkZSgpO1xuXHRcdFx0XHRcdHRoaXMudG9nZ2xlTWVyZ2VkRGlzY292ZXJ5KG5vZGVJZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgZXZlbnQgPSB0aGlzLmV2ZW50QnlJZC5nZXQobm9kZUlkKTtcblx0XHRcdFx0XHRpZiAoZXZlbnQpIHtcblx0XHRcdFx0XHRcdHRoaXMuZGV0YWlsUGFuZWwuc2hvdyhldmVudCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRhcmdldCA9IHRhcmdldC5wYXJlbnRFbGVtZW50O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlV2hlZWwoZTogV2hlZWxFdmVudCk6IHZvaWQge1xuXHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXG5cdFx0dGhpcy5oYXNVc2VyUGFubmVkID0gdHJ1ZTtcblxuXHRcdGNvbnN0IHJlY3QgPSB0aGlzLmNvbnRlbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0Y29uc3QgbW91c2VYID0gZS5jbGllbnRYIC0gcmVjdC5sZWZ0O1xuXHRcdGNvbnN0IG1vdXNlWSA9IGUuY2xpZW50WSAtIHJlY3QudG9wO1xuXG5cdFx0Y29uc3QgZGVsdGEgPSAtZS5kZWx0YVkgKiBXSEVFTF9aT09NX0ZBQ1RPUjtcblx0XHRjb25zdCBuZXdTY2FsZSA9IE1hdGgubWluKE1BWF9TQ0FMRSwgTWF0aC5tYXgoTUlOX1NDQUxFLCB0aGlzLnNjYWxlICogKDEgKyBkZWx0YSkpKTtcblxuXHRcdGNvbnN0IHNjYWxlRmFjdG9yID0gbmV3U2NhbGUgLyB0aGlzLnNjYWxlO1xuXHRcdHRoaXMudHJhbnNsYXRlWCA9IG1vdXNlWCAtIChtb3VzZVggLSB0aGlzLnRyYW5zbGF0ZVgpICogc2NhbGVGYWN0b3I7XG5cdFx0dGhpcy50cmFuc2xhdGVZID0gbW91c2VZIC0gKG1vdXNlWSAtIHRoaXMudHJhbnNsYXRlWSkgKiBzY2FsZUZhY3Rvcjtcblx0XHR0aGlzLnNjYWxlID0gbmV3U2NhbGU7XG5cblx0XHR0aGlzLmFwcGx5VHJhbnNmb3JtKCk7XG5cdH1cblxuXHRwcml2YXRlIGFwcGx5VHJhbnNmb3JtKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnN2Z1dyYXBwZXIpIHtcblx0XHRcdHRoaXMuc3ZnV3JhcHBlci5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlKCR7dGhpcy50cmFuc2xhdGVYfXB4LCAke3RoaXMudHJhbnNsYXRlWX1weCkgc2NhbGUoJHt0aGlzLnNjYWxlfSlgO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY2VudGVyQ29udGVudCgpOiB2b2lkIHtcblx0XHRjb25zdCBjb250YWluZXJSZWN0ID0gdGhpcy5jb250ZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGlmICghdGhpcy5zdmdFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHN2Z1dpZHRoID0gcGFyc2VGbG9hdCh0aGlzLnN2Z0VsZW1lbnQuZ2V0QXR0cmlidXRlKCd3aWR0aCcpIHx8ICcwJyk7XG5cdFx0Y29uc3Qgc3ZnSGVpZ2h0ID0gcGFyc2VGbG9hdCh0aGlzLnN2Z0VsZW1lbnQuZ2V0QXR0cmlidXRlKCdoZWlnaHQnKSB8fCAnMCcpO1xuXHRcdGlmIChzdmdXaWR0aCA8PSAwIHx8IHN2Z0hlaWdodCA8PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgUEFERElORyA9IDIwO1xuXHRcdC8vIFBpbiB0aGUgdG9wIG9mIHRoZSBkaWFncmFtIG5lYXIgdGhlIHRvcCBvZiB0aGUgdmlld3BvcnQgc28gdGhlIHN0YXJ0XG5cdFx0Ly8gb2YgdGhlIGZsb3cgaXMgaW1tZWRpYXRlbHkgdmlzaWJsZS4gQ2VudGVyIGhvcml6b250YWxseSB3aGVuIHRoZVxuXHRcdC8vIGRpYWdyYW0gZml0czsgb3RoZXJ3aXNlIGFsaWduIHRvIHRoZSBsZWZ0IGVkZ2Ugd2l0aCBwYWRkaW5nIHNvXG5cdFx0Ly8gbm90aGluZyBpcyBjbGlwcGVkIGJlaGluZCBvdmVyZmxvdzpoaWRkZW4uXG5cdFx0dGhpcy50cmFuc2xhdGVYID0gTWF0aC5tYXgoUEFERElORywgKGNvbnRhaW5lclJlY3Qud2lkdGggLSBzdmdXaWR0aCkgLyAyKTtcblx0XHR0aGlzLnRyYW5zbGF0ZVkgPSBQQURESU5HO1xuXHRcdHRoaXMuYXBwbHlUcmFuc2Zvcm0oKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUF5QjtBQUNsQyxT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
