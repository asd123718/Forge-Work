import "./media/mobileOverlayViews.css";
import "./media/mobileMultiDiffView.css";
import * as DOM from "../../../../../base/browser/dom.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Gesture, EventType as TouchEventType } from "../../../../../base/browser/touch.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { localize } from "../../../../../nls.js";
import { basename, dirname } from "../../../../../base/common/resources.js";
import { TokenizationRegistry } from "../../../../../editor/common/languages.js";
import { generateTokensCSSForColorMap } from "../../../../../editor/common/languages/supports/tokenization.js";
import { computeUnifiedDiff, hasMultipleTokenClasses, regexTokenizeLines, resolveMobileDiffLanguageId, tokenizeFileLines } from "./mobileDiffHelpers.js";
import { computeMobileMultiDiffItemHeight, computeMobileMultiDiffVirtualLayout } from "./mobileMultiDiffVirtualizer.js";
const $ = DOM.$;
const VIRTUALIZER_METRICS = {
  fileHeaderHeight: 44,
  hunkHeaderHeight: 26,
  rowHeight: 18,
  bodyVerticalPadding: 0,
  placeholderHeight: 76
};
const MAX_CONCURRENT_FILE_LOADS = 2;
const MAX_CONCURRENT_PREFETCH_LOADS = 1;
const MIN_PREFETCH_DISTANCE = 2400;
const PREFETCH_VIEWPORT_MULTIPLIER = 4;
class MobileMultiDiffView extends Disposable {
  constructor(workbenchContainer, data, textFileService, fileService, languageService) {
    super();
    this.data = data;
    this.textFileService = textFileService;
    this.fileService = fileService;
    this.languageService = languageService;
    this._onDidDispose = this._register(new Emitter());
    this.onDidDispose = this._onDidDispose.event;
    this.viewStore = this._register(new DisposableStore());
    this.disposed = false;
    this.renderGeneration = 0;
    this.mountedIndexes = /* @__PURE__ */ new Set();
    this.fileStates = data.diffs.map((diff, index) => ({
      index,
      diff,
      section: void 0,
      content: void 0,
      sectionStore: void 0,
      collapsed: false,
      loadState: "idle",
      loadKind: void 0,
      loadRequestId: 0,
      estimatedHunkCount: diff.identical || diff.added + diff.removed === 0 ? 0 : 1,
      estimatedRowCount: diff.added + diff.removed,
      hunkCount: 0,
      rowCount: 0,
      renderData: void 0,
      bodyScrollTop: 0,
      bodyViewportHeight: 0,
      fileMessage: void 0,
      bodyInner: void 0,
      renderedBodyRows: /* @__PURE__ */ new Map(),
      renderedBodyStartIndex: void 0,
      renderedBodyEndIndex: void 0
    }));
    this.render(workbenchContainer);
    this.renderGeneration++;
    this.updateVirtualLayout();
    this.scrollToInitialIndex();
    this.scheduleLoadVisibleFiles();
  }
  render(workbenchContainer) {
    const overlay = DOM.append(workbenchContainer, $("div.mobile-overlay-view.mobile-multi-diff-view"));
    this.viewStore.add(DOM.addDisposableListener(overlay, DOM.EventType.CONTEXT_MENU, (e) => e.preventDefault()));
    this.viewStore.add(toDisposable(() => overlay.remove()));
    const topBar = DOM.append(overlay, $("div.mobile-multi-diff-topbar"));
    const backBtn = DOM.append(topBar, $("button.mobile-overlay-back-btn", { type: "button" }));
    backBtn.setAttribute("aria-label", localize("multiDiffView.back", "Back"));
    DOM.append(backBtn, $("span")).classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronLeft));
    this.viewStore.add(Gesture.addTarget(backBtn));
    this.viewStore.add(DOM.addDisposableListener(backBtn, DOM.EventType.CLICK, () => this.dispose()));
    this.viewStore.add(DOM.addDisposableListener(backBtn, TouchEventType.Tap, () => this.dispose()));
    const fileCount = DOM.append(topBar, $("span.mobile-multi-diff-file-count"));
    fileCount.textContent = localize(
      "multiDiffView.fileCount",
      "{0} {1}",
      this.data.diffs.length,
      this.data.diffs.length === 1 ? localize("multiDiffView.file", "file") : localize("multiDiffView.files", "files")
    );
    const body = DOM.append(overlay, $("div.mobile-overlay-body"));
    this.scrollWrapper = DOM.append(body, $("div.mobile-overlay-scroll"));
    this.virtualContent = DOM.append(this.scrollWrapper, $("div.mobile-multi-diff-virtual-content"));
    this.viewStore.add(DOM.addDisposableListener(this.scrollWrapper, DOM.EventType.SCROLL, () => this.scheduleVirtualLayout(), { passive: true }));
  }
  scrollToInitialIndex() {
    if (this.data.initialIndex === void 0 || this.data.initialIndex <= 0) {
      return;
    }
    DOM.getWindow(this.scrollWrapper).requestAnimationFrame(() => {
      if (this.disposed) {
        return;
      }
      this.scrollWrapper.scrollTop = this.computeVirtualTop(this.data.initialIndex);
      this.updateVirtualLayout();
      this.scheduleLoadVisibleFiles();
    });
  }
  formatDirSegment(uri) {
    const parent = dirname(uri);
    const parentPath = parent.path.replace(/^\/+/, "");
    if (!parentPath || parentPath === ".") {
      return "";
    }
    const segments = parentPath.split("/").filter((s) => s.length > 0);
    if (segments.length === 0) {
      return "";
    }
    const tail = segments.slice(-2).join("/");
    const prefix = segments.length > 2 ? "\u2026/" : "";
    return `${prefix}${tail}/`;
  }
  renderFileSection(state) {
    const diff = state.diff;
    const store = new DisposableStore();
    const section = $("div.mobile-multi-diff-file-section");
    section.dataset.index = String(state.index);
    const header = DOM.append(section, $("div.mobile-multi-diff-file-header"));
    const fileNameUri = diff.modifiedURI ?? diff.originalURI;
    const fileName = fileNameUri ? basename(fileNameUri) : "";
    const dirPath = fileNameUri ? this.formatDirSegment(fileNameUri) : "";
    const chevronEl = DOM.append(header, $("span.mobile-multi-diff-file-chevron", {
      role: "button",
      tabindex: "0",
      "aria-expanded": "true"
    }));
    chevronEl.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronDown));
    chevronEl.setAttribute("aria-label", localize("multiDiffView.toggleFile", "Toggle {0}", fileName || localize("multiDiffView.fileFallback", "file")));
    const nameEl = DOM.append(header, $("span.mobile-multi-diff-file-name"));
    if (dirPath) {
      DOM.append(nameEl, $("span.mobile-multi-diff-file-dir")).textContent = dirPath;
    }
    DOM.append(nameEl, $("span.mobile-multi-diff-file-base")).textContent = fileName;
    const statsEl = DOM.append(header, $("span.mobile-multi-diff-file-stats"));
    if (!diff.identical) {
      if (diff.added) {
        DOM.append(statsEl, $("span.mobile-multi-diff-stat-added")).textContent = `+${diff.added}`;
      }
      if (diff.removed) {
        DOM.append(statsEl, $("span.mobile-multi-diff-stat-removed")).textContent = `-${diff.removed}`;
      }
    }
    const content = DOM.append(section, $("div.mobile-multi-diff-file-content"));
    const loadingEl = DOM.append(content, $("div.mobile-diff-empty-state"));
    loadingEl.textContent = localize("multiDiffView.loading", "Loading\u2026");
    const toggle = (e) => {
      e.stopPropagation();
      state.collapsed = !state.collapsed;
      section.classList.toggle("collapsed", state.collapsed);
      chevronEl.setAttribute("aria-expanded", state.collapsed ? "false" : "true");
      chevronEl.classList.remove(...ThemeIcon.asClassNameArray(state.collapsed ? Codicon.chevronDown : Codicon.chevronRight));
      chevronEl.classList.add(...ThemeIcon.asClassNameArray(state.collapsed ? Codicon.chevronRight : Codicon.chevronDown));
      this.scheduleVirtualLayout();
      if (!state.collapsed) {
        this.scheduleLoadVisibleFiles();
      }
    };
    store.add(Gesture.addTarget(header));
    store.add(DOM.addDisposableListener(header, DOM.EventType.CLICK, toggle));
    store.add(DOM.addDisposableListener(header, TouchEventType.Tap, (e) => {
      e.preventDefault();
      toggle(e);
    }));
    store.add(DOM.addDisposableListener(chevronEl, DOM.EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle(e);
      }
    }));
    return { section, content, store };
  }
  ensureFileSection(state) {
    if (!state.section || !state.content) {
      const { section, content, store } = this.renderFileSection(state);
      state.section = section;
      state.content = content;
      state.sectionStore = store;
      this.renderCurrentFileContent(state);
    }
    return state.section;
  }
  disposeFileSection(state) {
    state.sectionStore?.dispose();
    state.sectionStore = void 0;
    state.section?.remove();
    state.section = void 0;
    state.content = void 0;
    this.resetBodyRenderState(state);
  }
  scheduleVirtualLayout() {
    if (this.disposed) {
      return;
    }
    if (this.layoutAnimationFrame !== void 0) {
      return;
    }
    const targetWindow = DOM.getWindow(this.scrollWrapper);
    this.layoutAnimationFrame = targetWindow.requestAnimationFrame(() => {
      this.layoutAnimationFrame = void 0;
      this.updateVirtualLayout();
    });
  }
  updateVirtualLayout() {
    if (this.disposed) {
      return;
    }
    const layout = this.computeCurrentVirtualLayout();
    this.currentLayout = layout;
    this.virtualContent.style.height = `${layout.totalHeight}px`;
    const visibleIndexes = new Set(layout.items.map((item) => item.index));
    this.abandonOffscreenLoads(visibleIndexes);
    for (const index of Array.from(this.mountedIndexes)) {
      if (!visibleIndexes.has(index)) {
        this.disposeFileSection(this.fileStates[index]);
        this.mountedIndexes.delete(index);
      }
    }
    let previousSection;
    for (const item of layout.items) {
      const state = this.fileStates[item.index];
      const section = this.ensureFileSection(state);
      this.applyVirtualLayout(section, state, item);
      if (!this.mountedIndexes.has(item.index)) {
        this.mountedIndexes.add(item.index);
      }
      this.ensureFileSectionDomOrder(section, previousSection);
      previousSection = section;
    }
    this.scheduleLoadVisibleFiles();
  }
  ensureFileSectionDomOrder(section, previousSection) {
    const referenceNode = previousSection ? previousSection.nextSibling : this.virtualContent.firstChild;
    if (section !== referenceNode) {
      this.virtualContent.insertBefore(section, referenceNode);
    }
  }
  applyVirtualLayout(section, state, item) {
    section.style.top = `${item.renderTop}px`;
    section.style.height = `${item.renderHeight}px`;
    const bodyOffset = Math.max(0, item.innerOffset - VIRTUALIZER_METRICS.fileHeaderHeight);
    state.bodyScrollTop = bodyOffset;
    state.bodyViewportHeight = Math.max(0, this.scrollWrapper.clientHeight - VIRTUALIZER_METRICS.fileHeaderHeight);
    const content = state.content;
    content.classList.toggle("mobile-multi-diff-file-content-placeholder", state.loadState !== "loaded");
    if (state.loadState === "loaded") {
      content.style.height = "";
      content.style.transform = "";
      this.renderLoadedFileContent(state);
    } else {
      const bodyHeight = Math.max(0, item.renderHeight - VIRTUALIZER_METRICS.fileHeaderHeight);
      const placeholderHeight = Math.min(
        bodyHeight || VIRTUALIZER_METRICS.placeholderHeight,
        Math.max(VIRTUALIZER_METRICS.placeholderHeight, state.bodyViewportHeight)
      );
      content.style.height = `${bodyHeight}px`;
      content.style.transform = "";
      this.updateFileMessageHeight(state, placeholderHeight);
    }
  }
  renderCurrentFileContent(state) {
    if (!state.content) {
      return;
    }
    switch (state.loadState) {
      case "loaded":
        this.renderLoadedFileContent(state);
        break;
      case "empty":
        this.renderFileMessage(state, localize("multiDiffView.noChanges", "No changes in this file."));
        break;
      case "error":
        this.renderFileMessage(state, localize("multiDiffView.loadError", "Unable to load changes in this file."));
        break;
      case "idle":
      case "loading":
        this.renderFileMessage(state, localize("multiDiffView.loading", "Loading\u2026"));
        break;
    }
  }
  renderFileMessage(state, message) {
    if (!state.content) {
      return;
    }
    DOM.clearNode(state.content);
    this.resetBodyRenderState(state);
    const empty = DOM.append(state.content, $("div.mobile-diff-empty-state"));
    state.fileMessage = empty;
    empty.textContent = message;
    this.updateFileMessageHeight(state);
  }
  updateFileMessageHeight(state, placeholderHeight) {
    if (!state.content) {
      return;
    }
    const empty = state.fileMessage;
    if (!empty || empty.parentElement !== state.content) {
      return;
    }
    const bodyHeight = Number.parseFloat(state.content.style.height) || VIRTUALIZER_METRICS.placeholderHeight;
    const visibleHeight = placeholderHeight ?? Math.min(
      bodyHeight,
      Math.max(VIRTUALIZER_METRICS.placeholderHeight, state.bodyViewportHeight)
    );
    empty.style.height = `${visibleHeight}px`;
  }
  renderLoadedFileContent(state) {
    if (!state.content || !state.renderData) {
      return;
    }
    const bodyOverscan = Math.max(this.scrollWrapper.clientHeight, 480);
    const visibleTop = Math.max(0, state.bodyScrollTop - bodyOverscan);
    const visibleBottom = Math.min(
      state.renderData.bodyHeight,
      state.bodyScrollTop + state.bodyViewportHeight + bodyOverscan
    );
    const { startIndex, endIndex } = this.computeVisibleBodyEntryRange(state.renderData.bodyEntries, visibleTop, visibleBottom);
    const inner = this.ensureBodyInner(state);
    if (state.renderedBodyStartIndex === startIndex && state.renderedBodyEndIndex === endIndex) {
      return;
    }
    inner.style.height = `${state.renderData.bodyHeight}px`;
    inner.style.minWidth = `calc(${state.renderData.maxLineCharacterCount + 8}ch + 64px)`;
    this.reconcileBodyEntries(state, startIndex, endIndex);
    state.renderedBodyStartIndex = startIndex;
    state.renderedBodyEndIndex = endIndex;
  }
  toVirtualItem(state) {
    return {
      collapsed: state.collapsed,
      state: state.loadState === "idle" ? "unloaded" : state.loadState,
      estimatedHunkCount: state.estimatedHunkCount,
      estimatedRowCount: state.estimatedRowCount,
      hunkCount: state.hunkCount,
      rowCount: state.rowCount
    };
  }
  computeCurrentVirtualLayout() {
    return computeMobileMultiDiffVirtualLayout(this.fileStates.map((state) => this.toVirtualItem(state)), {
      viewportHeight: this.scrollWrapper.clientHeight,
      scrollTop: this.scrollWrapper.scrollTop,
      overscan: Math.max(this.scrollWrapper.clientHeight, 480),
      metrics: VIRTUALIZER_METRICS
    });
  }
  computeVirtualTop(index) {
    let top = 0;
    const end = Math.min(index, this.fileStates.length);
    for (let i = 0; i < end; i++) {
      top += computeMobileMultiDiffItemHeight(this.toVirtualItem(this.fileStates[i]), VIRTUALIZER_METRICS);
    }
    return top;
  }
  scheduleLoadVisibleFiles() {
    if (this.disposed || this.loadVisibleAnimationFrame !== void 0) {
      return;
    }
    const targetWindow = DOM.getWindow(this.scrollWrapper);
    this.loadVisibleAnimationFrame = targetWindow.requestAnimationFrame(() => {
      this.loadVisibleAnimationFrame = void 0;
      this.loadVisibleFiles();
      this.schedulePrefetchFile();
    });
  }
  cancelScheduledLoadVisibleFiles() {
    if (this.loadVisibleAnimationFrame !== void 0) {
      DOM.getWindow(this.scrollWrapper).cancelAnimationFrame(this.loadVisibleAnimationFrame);
      this.loadVisibleAnimationFrame = void 0;
    }
  }
  schedulePrefetchFile() {
    if (this.disposed || this.prefetchAnimationFrame !== void 0) {
      return;
    }
    const targetWindow = DOM.getWindow(this.scrollWrapper);
    this.prefetchAnimationFrame = targetWindow.requestAnimationFrame(() => {
      this.prefetchAnimationFrame = void 0;
      this.prefetchNearFile();
    });
  }
  cancelScheduledPrefetchFile() {
    if (this.prefetchAnimationFrame !== void 0) {
      DOM.getWindow(this.scrollWrapper).cancelAnimationFrame(this.prefetchAnimationFrame);
      this.prefetchAnimationFrame = void 0;
    }
  }
  loadVisibleFiles() {
    if (this.disposed) {
      return;
    }
    const loadingCount = this.fileStates.reduce((count, state) => count + (state.loadState === "loading" ? 1 : 0), 0);
    if (loadingCount >= MAX_CONCURRENT_FILE_LOADS) {
      return;
    }
    const layout = this.currentLayout;
    if (!layout) {
      return;
    }
    const viewportTop = this.scrollWrapper.scrollTop;
    const viewportBottom = viewportTop + this.scrollWrapper.clientHeight;
    let nextState;
    let nextDistance = Number.POSITIVE_INFINITY;
    for (const item of layout.items) {
      const state = this.fileStates[item.index];
      if (state.loadState !== "idle" || state.collapsed) {
        continue;
      }
      const itemTop = item.virtualTop;
      const itemBottom = item.virtualTop + item.virtualHeight;
      const distance = itemBottom < viewportTop ? viewportTop - itemBottom : itemTop > viewportBottom ? itemTop - viewportBottom : 0;
      if (distance < nextDistance) {
        nextState = state;
        nextDistance = distance;
      }
    }
    if (nextState) {
      this.ensureFileLoaded(nextState, "visible");
    }
  }
  prefetchNearFile() {
    if (this.disposed) {
      return;
    }
    const layout = this.currentLayout;
    if (!layout) {
      return;
    }
    const mountedIndexes = new Set(layout.items.map((item) => item.index));
    if (layout.items.some((item) => {
      const state = this.fileStates[item.index];
      return !state.collapsed && state.loadState === "idle";
    })) {
      return;
    }
    const loadingCount = this.fileStates.reduce((count, state) => count + (state.loadState === "loading" ? 1 : 0), 0);
    const prefetchLoadingCount = this.fileStates.reduce((count, state) => count + (state.loadState === "loading" && state.loadKind === "prefetch" ? 1 : 0), 0);
    if (loadingCount >= MAX_CONCURRENT_FILE_LOADS || prefetchLoadingCount >= MAX_CONCURRENT_PREFETCH_LOADS) {
      return;
    }
    const viewportTop = this.scrollWrapper.scrollTop;
    const viewportBottom = viewportTop + this.scrollWrapper.clientHeight;
    const prefetchDistance = Math.max(MIN_PREFETCH_DISTANCE, this.scrollWrapper.clientHeight * PREFETCH_VIEWPORT_MULTIPLIER);
    let virtualTop = 0;
    let nextState;
    let nextDistance = Number.POSITIVE_INFINITY;
    for (const state of this.fileStates) {
      const virtualHeight = computeMobileMultiDiffItemHeight(this.toVirtualItem(state), VIRTUALIZER_METRICS);
      const virtualBottom = virtualTop + virtualHeight;
      if (!mountedIndexes.has(state.index) && !state.collapsed && state.loadState === "idle") {
        const distance = virtualBottom < viewportTop ? viewportTop - virtualBottom : virtualTop > viewportBottom ? virtualTop - viewportBottom : 0;
        if (distance <= prefetchDistance && distance < nextDistance) {
          nextState = state;
          nextDistance = distance;
        }
      }
      virtualTop = virtualBottom;
    }
    if (nextState) {
      this.ensureFileLoaded(nextState, "prefetch");
    }
  }
  ensureFileLoaded(state, loadKind) {
    if (state.loadState !== "idle") {
      return;
    }
    state.loadState = "loading";
    state.loadKind = loadKind;
    state.loadRequestId++;
    this.renderCurrentFileContent(state);
    const generation = this.renderGeneration;
    const loadRequestId = state.loadRequestId;
    void this.loadFileContent(state, generation, loadRequestId).catch(() => {
      if (!this.isActiveFileLoad(state, generation, loadRequestId)) {
        return;
      }
      state.loadState = "error";
      state.loadKind = void 0;
      this.renderCurrentFileContent(state);
    }).finally(() => {
      if (!this.disposed && generation === this.renderGeneration && state.loadRequestId === loadRequestId) {
        this.scheduleVirtualLayout();
      }
    });
  }
  isActiveFileLoad(state, generation, loadRequestId) {
    return !this.disposed && generation === this.renderGeneration && state.loadRequestId === loadRequestId && state.loadState === "loading";
  }
  abandonOffscreenLoads(visibleIndexes) {
    for (const state of this.fileStates) {
      if (state.loadState !== "loading" || state.loadKind === "prefetch" || visibleIndexes.has(state.index)) {
        continue;
      }
      state.loadRequestId++;
      state.loadState = "idle";
      state.loadKind = void 0;
      state.renderData = void 0;
      state.hunkCount = 0;
      state.rowCount = 0;
      this.resetBodyRenderState(state);
      this.renderCurrentFileContent(state);
    }
  }
  async loadFileContent(state, generation, loadRequestId) {
    const diff = state.diff;
    if (diff.identical) {
      if (!this.isActiveFileLoad(state, generation, loadRequestId)) {
        return;
      }
      state.loadState = "empty";
      state.loadKind = void 0;
      state.renderData = void 0;
      state.hunkCount = 0;
      state.rowCount = 0;
      this.renderCurrentFileContent(state);
      return;
    }
    const languageId = resolveMobileDiffLanguageId(this.languageService, diff);
    const [originalText, modifiedText] = await Promise.all([
      this.readTextContent(diff.originalURI),
      this.readTextContent(diff.modifiedURI)
    ]);
    if (!this.isActiveFileLoad(state, generation, loadRequestId)) {
      return;
    }
    const hunks = await (this.data.computeDiff?.(originalText, modifiedText) ?? Promise.resolve(computeUnifiedDiff(originalText, modifiedText)));
    if (!this.isActiveFileLoad(state, generation, loadRequestId)) {
      return;
    }
    if (hunks.length === 0) {
      state.loadState = "empty";
      state.loadKind = void 0;
      state.renderData = void 0;
      state.hunkCount = 0;
      state.rowCount = 0;
      this.renderCurrentFileContent(state);
      return;
    }
    const [origLineHtml, modLineHtml] = await Promise.all([
      tokenizeFileLines(this.languageService, originalText, languageId),
      tokenizeFileLines(this.languageService, modifiedText, languageId)
    ]);
    if (!this.isActiveFileLoad(state, generation, loadRequestId)) {
      return;
    }
    const hasRealTokens = hasMultipleTokenClasses(origLineHtml) || hasMultipleTokenClasses(modLineHtml);
    const origLines = hasRealTokens ? origLineHtml : regexTokenizeLines(originalText, languageId);
    const modLines = hasRealTokens ? modLineHtml : regexTokenizeLines(modifiedText, languageId);
    if (!this.isActiveFileLoad(state, generation, loadRequestId)) {
      return;
    }
    state.loadState = "loaded";
    state.loadKind = void 0;
    state.hunkCount = hunks.length;
    state.rowCount = hunks.reduce((count, hunk) => count + hunk.lines.length, 0);
    const { bodyEntries, bodyHeight, maxLineCharacterCount } = this.createBodyEntries(hunks);
    state.renderData = { bodyEntries, bodyHeight, maxLineCharacterCount, origLines, modLines, hasRealTokens };
    this.resetBodyRenderState(state);
    this.renderCurrentFileContent(state);
  }
  async readTextContent(resource) {
    if (!resource) {
      return "";
    }
    try {
      const model = await this.textFileService.read(resource, { acceptTextOnly: true });
      return model.value;
    } catch {
      try {
        const file = await this.fileService.readFile(resource);
        return file.value.toString();
      } catch {
        return "";
      }
    }
  }
  createBodyEntries(hunks) {
    const bodyEntries = [];
    let top = 0;
    let maxLineCharacterCount = 0;
    for (const hunk of hunks) {
      bodyEntries.push({
        type: "hunk",
        header: hunk.header,
        top,
        height: VIRTUALIZER_METRICS.hunkHeaderHeight
      });
      top += VIRTUALIZER_METRICS.hunkHeaderHeight;
      for (const line of hunk.lines) {
        maxLineCharacterCount = Math.max(maxLineCharacterCount, line.text.length);
        bodyEntries.push({
          type: "line",
          line,
          top,
          height: VIRTUALIZER_METRICS.rowHeight
        });
        top += VIRTUALIZER_METRICS.rowHeight;
      }
    }
    return { bodyEntries, bodyHeight: top, maxLineCharacterCount };
  }
  computeVisibleBodyEntryRange(entries, visibleTop, visibleBottom) {
    if (entries.length === 0 || visibleBottom <= visibleTop) {
      return { startIndex: 0, endIndex: 0 };
    }
    const startIndex = this.findFirstBodyEntryEndingAfter(entries, visibleTop);
    const endIndex = this.findFirstBodyEntryStartingAtOrAfter(entries, visibleBottom);
    return { startIndex, endIndex: Math.max(startIndex, endIndex) };
  }
  findFirstBodyEntryEndingAfter(entries, offset) {
    let low = 0;
    let high = entries.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (entries[mid].top + entries[mid].height <= offset) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }
  findFirstBodyEntryStartingAtOrAfter(entries, offset) {
    let low = 0;
    let high = entries.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (entries[mid].top < offset) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }
  ensureBodyInner(state) {
    if (state.bodyInner && state.bodyInner.parentElement === state.content) {
      return state.bodyInner;
    }
    if (!state.content || !state.renderData) {
      throw new Error("Cannot render a loaded mobile diff body without content and render data.");
    }
    DOM.clearNode(state.content);
    this.resetBodyRenderState(state);
    const inner = DOM.append(state.content, $("div.mobile-multi-diff-file-content-inner"));
    inner.style.height = `${state.renderData.bodyHeight}px`;
    inner.style.minWidth = `calc(${state.renderData.maxLineCharacterCount + 8}ch + 64px)`;
    const colorMap = TokenizationRegistry.getColorMap();
    if (colorMap && state.renderData.hasRealTokens) {
      const styleEl = document.createElement("style");
      styleEl.textContent = generateTokensCSSForColorMap(colorMap);
      inner.appendChild(styleEl);
    }
    state.bodyInner = inner;
    return inner;
  }
  resetBodyRenderState(state) {
    state.fileMessage = void 0;
    state.bodyInner = void 0;
    state.renderedBodyRows.clear();
    state.renderedBodyStartIndex = void 0;
    state.renderedBodyEndIndex = void 0;
  }
  reconcileBodyEntries(state, startIndex, endIndex) {
    if (!state.bodyInner || !state.renderData) {
      return;
    }
    for (const [index, element] of Array.from(state.renderedBodyRows)) {
      if (index < startIndex || index >= endIndex) {
        element.remove();
        state.renderedBodyRows.delete(index);
      }
    }
    let runStart;
    let runEnd = startIndex;
    for (let index = startIndex; index < endIndex; index++) {
      if (state.renderedBodyRows.has(index)) {
        if (runStart !== void 0) {
          this.insertBodyEntryRun(state, runStart, runEnd);
          runStart = void 0;
        }
        continue;
      }
      runStart ??= index;
      runEnd = index + 1;
    }
    if (runStart !== void 0) {
      this.insertBodyEntryRun(state, runStart, runEnd);
    }
  }
  insertBodyEntryRun(state, startIndex, endIndex) {
    if (!state.bodyInner || !state.renderData) {
      return;
    }
    const htmlParts = [];
    for (let index = startIndex; index < endIndex; index++) {
      htmlParts.push(this.renderBodyEntryHtml(index, state.renderData.bodyEntries[index], state.renderData.origLines, state.renderData.modLines));
    }
    const template = document.createElement("template");
    template.innerHTML = htmlParts.join("");
    const insertedElements = Array.from(template.content.children);
    for (const element of insertedElements) {
      const index = Number(element.dataset.entryIndex);
      if (Number.isFinite(index)) {
        state.renderedBodyRows.set(index, element);
      }
    }
    state.bodyInner.insertBefore(template.content, this.findNextRenderedBodyRow(state, endIndex));
  }
  findNextRenderedBodyRow(state, startIndex) {
    for (let index = startIndex; index < state.renderData.bodyEntries.length; index++) {
      const element = state.renderedBodyRows.get(index);
      if (element) {
        return element;
      }
    }
    return null;
  }
  renderBodyEntryHtml(index, entry, origLineHtml, modLineHtml) {
    const style = `top:${entry.top}px;height:${entry.height}px;`;
    if (entry.type === "hunk") {
      return `<div class="mobile-diff-hunk-header mobile-multi-diff-body-entry" data-entry-index="${index}" style="${style}">${this.escapeHtml(entry.header)}</div>`;
    }
    const line = entry.line;
    const lineNumber = line.lineNum !== void 0 ? String(line.lineNum) : "";
    const gutter = line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";
    const content = this.getLineHtml(line, origLineHtml, modLineHtml);
    return [
      `<div class="mobile-diff-line mobile-multi-diff-body-entry ${line.type}" data-entry-index="${index}" style="${style}">`,
      `<span class="mobile-diff-line-num">${this.escapeHtml(lineNumber)}</span>`,
      `<span class="mobile-diff-gutter">${this.escapeHtml(gutter)}</span>`,
      `<span class="mobile-diff-content">${content}</span>`,
      "</div>"
    ].join("");
  }
  getLineHtml(line, origLineHtml, modLineHtml) {
    if (line.lineNum !== void 0) {
      const source = line.type === "added" ? modLineHtml : origLineHtml;
      const html = source[line.lineNum - 1];
      if (html !== void 0) {
        return html;
      }
    }
    return this.escapeHtml(line.text);
  }
  escapeHtml(value) {
    return value.replace(/[&<>"']/g, (char) => {
      switch (char) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        case "'":
          return "&#39;";
        default:
          return char;
      }
    });
  }
  dispose() {
    this.disposed = true;
    if (this.layoutAnimationFrame !== void 0) {
      DOM.getWindow(this.scrollWrapper).cancelAnimationFrame(this.layoutAnimationFrame);
      this.layoutAnimationFrame = void 0;
    }
    if (this.loadVisibleAnimationFrame !== void 0) {
      this.cancelScheduledLoadVisibleFiles();
    }
    if (this.prefetchAnimationFrame !== void 0) {
      this.cancelScheduledPrefetchFile();
    }
    for (const state of this.fileStates) {
      this.disposeFileSection(state);
    }
    this.mountedIndexes.clear();
    this._onDidDispose.fire();
    this.viewStore.dispose();
    super.dispose();
  }
}
export {
  MobileMultiDiffView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcYnJvd3NlclxccGFydHNcXG1vYmlsZVxcY29udHJpYnV0aW9uc1xcbW9iaWxlTXVsdGlEaWZmVmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9tb2JpbGVPdmVybGF5Vmlld3MuY3NzJztcbmltcG9ydCAnLi9tZWRpYS9tb2JpbGVNdWx0aURpZmZWaWV3LmNzcyc7XG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEdlc3R1cmUsIEV2ZW50VHlwZSBhcyBUb3VjaEV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90b3VjaC5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBUb2tlbml6YXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVG9rZW5zQ1NTRm9yQ29sb3JNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9zdXBwb3J0cy90b2tlbml6YXRpb24uanMnO1xuaW1wb3J0IHsgSUZpbGVEaWZmVmlld0RhdGEgfSBmcm9tICcuL21vYmlsZURpZmZWaWV3LmpzJztcbmltcG9ydCB7IGNvbXB1dGVVbmlmaWVkRGlmZiwgaGFzTXVsdGlwbGVUb2tlbkNsYXNzZXMsIHR5cGUgSURpZmZIdW5rLCB0eXBlIElEaWZmTGluZSwgcmVnZXhUb2tlbml6ZUxpbmVzLCByZXNvbHZlTW9iaWxlRGlmZkxhbmd1YWdlSWQsIHRva2VuaXplRmlsZUxpbmVzIH0gZnJvbSAnLi9tb2JpbGVEaWZmSGVscGVycy5qcyc7XG5pbXBvcnQgeyBjb21wdXRlTW9iaWxlTXVsdGlEaWZmSXRlbUhlaWdodCwgY29tcHV0ZU1vYmlsZU11bHRpRGlmZlZpcnR1YWxMYXlvdXQsIHR5cGUgSU1vYmlsZU11bHRpRGlmZlZpcnR1YWxJdGVtLCB0eXBlIElNb2JpbGVNdWx0aURpZmZWaXJ0dWFsSXRlbUxheW91dCwgdHlwZSBJTW9iaWxlTXVsdGlEaWZmVmlydHVhbGl6ZXJNZXRyaWNzIH0gZnJvbSAnLi9tb2JpbGVNdWx0aURpZmZWaXJ0dWFsaXplci5qcyc7XG5cbmNvbnN0ICQgPSBET00uJDtcblxuY29uc3QgVklSVFVBTElaRVJfTUVUUklDUzogSU1vYmlsZU11bHRpRGlmZlZpcnR1YWxpemVyTWV0cmljcyA9IHtcblx0ZmlsZUhlYWRlckhlaWdodDogNDQsXG5cdGh1bmtIZWFkZXJIZWlnaHQ6IDI2LFxuXHRyb3dIZWlnaHQ6IDE4LFxuXHRib2R5VmVydGljYWxQYWRkaW5nOiAwLFxuXHRwbGFjZWhvbGRlckhlaWdodDogNzYsXG59O1xuY29uc3QgTUFYX0NPTkNVUlJFTlRfRklMRV9MT0FEUyA9IDI7XG5jb25zdCBNQVhfQ09OQ1VSUkVOVF9QUkVGRVRDSF9MT0FEUyA9IDE7XG5jb25zdCBNSU5fUFJFRkVUQ0hfRElTVEFOQ0UgPSAyNDAwO1xuY29uc3QgUFJFRkVUQ0hfVklFV1BPUlRfTVVMVElQTElFUiA9IDQ7XG5cbi8qKlxuICogRGF0YSBwYXNzZWQgdG8ge0BsaW5rIE1vYmlsZU11bHRpRGlmZlZpZXd9LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElNb2JpbGVNdWx0aURpZmZWaWV3RGF0YSB7XG5cdHJlYWRvbmx5IGRpZmZzOiByZWFkb25seSBJRmlsZURpZmZWaWV3RGF0YVtdO1xuXHQvKiogSW5kZXggb2YgdGhlIGZpbGUgdG8gc2Nyb2xsIHRvIGluaXRpYWxseS4gKi9cblx0cmVhZG9ubHkgaW5pdGlhbEluZGV4PzogbnVtYmVyO1xuXHQvKiogT3B0aW9uYWwgYXN5bmMgZGlmZiBjb21wdXRhdGlvbiBvdmVycmlkZSwgdXNlZCBieSB0ZXN0L2RlbW8gaG9zdHMgdGhhdCBjYW4gY29tcHV0ZSBkaWZmcyBvZmYgdGhlIFVJIHRocmVhZC4gKi9cblx0cmVhZG9ubHkgY29tcHV0ZURpZmY/OiAob3JpZ2luYWxUZXh0OiBzdHJpbmcsIG1vZGlmaWVkVGV4dDogc3RyaW5nKSA9PiBQcm9taXNlPHJlYWRvbmx5IElEaWZmSHVua1tdPjtcbn1cblxudHlwZSBNb2JpbGVNdWx0aURpZmZGaWxlTG9hZFN0YXRlID0gJ2lkbGUnIHwgJ2xvYWRpbmcnIHwgJ2xvYWRlZCcgfCAnZW1wdHknIHwgJ2Vycm9yJztcbnR5cGUgTW9iaWxlTXVsdGlEaWZmRmlsZUxvYWRLaW5kID0gJ3Zpc2libGUnIHwgJ3ByZWZldGNoJztcblxudHlwZSBNb2JpbGVNdWx0aURpZmZCb2R5RW50cnkgPSBJTW9iaWxlTXVsdGlEaWZmQm9keUh1bmtFbnRyeSB8IElNb2JpbGVNdWx0aURpZmZCb2R5TGluZUVudHJ5O1xuXG5pbnRlcmZhY2UgSU1vYmlsZU11bHRpRGlmZkJvZHlCYXNlRW50cnkge1xuXHRyZWFkb25seSB0b3A6IG51bWJlcjtcblx0cmVhZG9ubHkgaGVpZ2h0OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBJTW9iaWxlTXVsdGlEaWZmQm9keUh1bmtFbnRyeSBleHRlbmRzIElNb2JpbGVNdWx0aURpZmZCb2R5QmFzZUVudHJ5IHtcblx0cmVhZG9ubHkgdHlwZTogJ2h1bmsnO1xuXHRyZWFkb25seSBoZWFkZXI6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElNb2JpbGVNdWx0aURpZmZCb2R5TGluZUVudHJ5IGV4dGVuZHMgSU1vYmlsZU11bHRpRGlmZkJvZHlCYXNlRW50cnkge1xuXHRyZWFkb25seSB0eXBlOiAnbGluZSc7XG5cdHJlYWRvbmx5IGxpbmU6IElEaWZmTGluZTtcbn1cblxuaW50ZXJmYWNlIElNb2JpbGVNdWx0aURpZmZGaWxlUmVuZGVyRGF0YSB7XG5cdHJlYWRvbmx5IGJvZHlFbnRyaWVzOiByZWFkb25seSBNb2JpbGVNdWx0aURpZmZCb2R5RW50cnlbXTtcblx0cmVhZG9ubHkgYm9keUhlaWdodDogbnVtYmVyO1xuXHRyZWFkb25seSBtYXhMaW5lQ2hhcmFjdGVyQ291bnQ6IG51bWJlcjtcblx0cmVhZG9ubHkgb3JpZ0xpbmVzOiByZWFkb25seSBzdHJpbmdbXTtcblx0cmVhZG9ubHkgbW9kTGluZXM6IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRyZWFkb25seSBoYXNSZWFsVG9rZW5zOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgSU1vYmlsZU11bHRpRGlmZkZpbGVTdGF0ZSB7XG5cdHJlYWRvbmx5IGluZGV4OiBudW1iZXI7XG5cdHJlYWRvbmx5IGRpZmY6IElGaWxlRGlmZlZpZXdEYXRhO1xuXHRzZWN0aW9uOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0Y29udGVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHNlY3Rpb25TdG9yZTogRGlzcG9zYWJsZVN0b3JlIHwgdW5kZWZpbmVkO1xuXHRjb2xsYXBzZWQ6IGJvb2xlYW47XG5cdGxvYWRTdGF0ZTogTW9iaWxlTXVsdGlEaWZmRmlsZUxvYWRTdGF0ZTtcblx0bG9hZEtpbmQ6IE1vYmlsZU11bHRpRGlmZkZpbGVMb2FkS2luZCB8IHVuZGVmaW5lZDtcblx0bG9hZFJlcXVlc3RJZDogbnVtYmVyO1xuXHRyZWFkb25seSBlc3RpbWF0ZWRIdW5rQ291bnQ6IG51bWJlcjtcblx0cmVhZG9ubHkgZXN0aW1hdGVkUm93Q291bnQ6IG51bWJlcjtcblx0aHVua0NvdW50OiBudW1iZXI7XG5cdHJvd0NvdW50OiBudW1iZXI7XG5cdHJlbmRlckRhdGE6IElNb2JpbGVNdWx0aURpZmZGaWxlUmVuZGVyRGF0YSB8IHVuZGVmaW5lZDtcblx0Ym9keVNjcm9sbFRvcDogbnVtYmVyO1xuXHRib2R5Vmlld3BvcnRIZWlnaHQ6IG51bWJlcjtcblx0ZmlsZU1lc3NhZ2U6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRib2R5SW5uZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSByZW5kZXJlZEJvZHlSb3dzOiBNYXA8bnVtYmVyLCBIVE1MRWxlbWVudD47XG5cdHJlbmRlcmVkQm9keVN0YXJ0SW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cmVuZGVyZWRCb2R5RW5kSW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBGdWxsLXNjcmVlbiBvdmVybGF5IGZvciB2aWV3aW5nICoqbXVsdGlwbGUqKiBmaWxlIGRpZmZzIHByb2R1Y2VkIGJ5IGFcbiAqIGNvZGluZyBhZ2VudCBzZXNzaW9uIG9uIHBob25lIHZpZXdwb3J0cy5cbiAqXG4gKiBGaWxlcyBhcmUgcmVwcmVzZW50ZWQgaW4gYSBzaW5nbGUgdmlydHVhbCBzY3JvbGwgcmFuZ2UuIE9ubHkgdmlzaWJsZVxuICogZmlsZSBzZWN0aW9ucyBhcmUgbW91bnRlZCB3aGlsZSB0aGUgdXNlciBzY3JvbGxzIGNvbnRpbnVvdXNseSB0aHJvdWdoXG4gKiB0aGUgZnVsbCBzZXQgb2YgY2hhbmdlcy5cbiAqL1xuZXhwb3J0IGNsYXNzIE1vYmlsZU11bHRpRGlmZlZpZXcgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERpc3Bvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWREaXNwb3NlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkRGlzcG9zZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHZpZXdTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0cHJpdmF0ZSBkaXNwb3NlZCA9IGZhbHNlO1xuXHRwcml2YXRlIHJlbmRlckdlbmVyYXRpb24gPSAwO1xuXG5cdHByaXZhdGUgc2Nyb2xsV3JhcHBlciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHZpcnR1YWxDb250ZW50ITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgbGF5b3V0QW5pbWF0aW9uRnJhbWU6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBsb2FkVmlzaWJsZUFuaW1hdGlvbkZyYW1lOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcHJlZmV0Y2hBbmltYXRpb25GcmFtZTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGN1cnJlbnRMYXlvdXQ6IFJldHVyblR5cGU8dHlwZW9mIGNvbXB1dGVNb2JpbGVNdWx0aURpZmZWaXJ0dWFsTGF5b3V0PiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBtb3VudGVkSW5kZXhlcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGZpbGVTdGF0ZXM6IElNb2JpbGVNdWx0aURpZmZGaWxlU3RhdGVbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR3b3JrYmVuY2hDb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZGF0YTogSU1vYmlsZU11bHRpRGlmZlZpZXdEYXRhLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmZpbGVTdGF0ZXMgPSBkYXRhLmRpZmZzLm1hcCgoZGlmZiwgaW5kZXgpID0+ICh7XG5cdFx0XHRpbmRleCxcblx0XHRcdGRpZmYsXG5cdFx0XHRzZWN0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRjb250ZW50OiB1bmRlZmluZWQsXG5cdFx0XHRzZWN0aW9uU3RvcmU6IHVuZGVmaW5lZCxcblx0XHRcdGNvbGxhcHNlZDogZmFsc2UsXG5cdFx0XHRsb2FkU3RhdGU6ICdpZGxlJyxcblx0XHRcdGxvYWRLaW5kOiB1bmRlZmluZWQsXG5cdFx0XHRsb2FkUmVxdWVzdElkOiAwLFxuXHRcdFx0ZXN0aW1hdGVkSHVua0NvdW50OiBkaWZmLmlkZW50aWNhbCB8fCBkaWZmLmFkZGVkICsgZGlmZi5yZW1vdmVkID09PSAwID8gMCA6IDEsXG5cdFx0XHRlc3RpbWF0ZWRSb3dDb3VudDogZGlmZi5hZGRlZCArIGRpZmYucmVtb3ZlZCxcblx0XHRcdGh1bmtDb3VudDogMCxcblx0XHRcdHJvd0NvdW50OiAwLFxuXHRcdFx0cmVuZGVyRGF0YTogdW5kZWZpbmVkLFxuXHRcdFx0Ym9keVNjcm9sbFRvcDogMCxcblx0XHRcdGJvZHlWaWV3cG9ydEhlaWdodDogMCxcblx0XHRcdGZpbGVNZXNzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRib2R5SW5uZXI6IHVuZGVmaW5lZCxcblx0XHRcdHJlbmRlcmVkQm9keVJvd3M6IG5ldyBNYXAoKSxcblx0XHRcdHJlbmRlcmVkQm9keVN0YXJ0SW5kZXg6IHVuZGVmaW5lZCxcblx0XHRcdHJlbmRlcmVkQm9keUVuZEluZGV4OiB1bmRlZmluZWQsXG5cdFx0fSkpO1xuXHRcdHRoaXMucmVuZGVyKHdvcmtiZW5jaENvbnRhaW5lcik7XG5cdFx0dGhpcy5yZW5kZXJHZW5lcmF0aW9uKys7XG5cdFx0dGhpcy51cGRhdGVWaXJ0dWFsTGF5b3V0KCk7XG5cdFx0dGhpcy5zY3JvbGxUb0luaXRpYWxJbmRleCgpO1xuXHRcdHRoaXMuc2NoZWR1bGVMb2FkVmlzaWJsZUZpbGVzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlcih3b3JrYmVuY2hDb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Ly8gLS0gUm9vdCBvdmVybGF5XG5cdFx0Y29uc3Qgb3ZlcmxheSA9IERPTS5hcHBlbmQod29ya2JlbmNoQ29udGFpbmVyLCAkKCdkaXYubW9iaWxlLW92ZXJsYXktdmlldy5tb2JpbGUtbXVsdGktZGlmZi12aWV3JykpO1xuXHRcdHRoaXMudmlld1N0b3JlLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG92ZXJsYXksIERPTS5FdmVudFR5cGUuQ09OVEVYVF9NRU5VLCBlID0+IGUucHJldmVudERlZmF1bHQoKSkpO1xuXHRcdHRoaXMudmlld1N0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gb3ZlcmxheS5yZW1vdmUoKSkpO1xuXG5cdFx0Ly8gLS0gVG9wIGJhciAoZml4ZWQpXG5cdFx0Y29uc3QgdG9wQmFyID0gRE9NLmFwcGVuZChvdmVybGF5LCAkKCdkaXYubW9iaWxlLW11bHRpLWRpZmYtdG9wYmFyJykpO1xuXG5cdFx0Y29uc3QgYmFja0J0biA9IERPTS5hcHBlbmQodG9wQmFyLCAkKCdidXR0b24ubW9iaWxlLW92ZXJsYXktYmFjay1idG4nLCB7IHR5cGU6ICdidXR0b24nIH0pKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblx0XHRiYWNrQnRuLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdtdWx0aURpZmZWaWV3LmJhY2snLCBcIkJhY2tcIikpO1xuXHRcdERPTS5hcHBlbmQoYmFja0J0biwgJCgnc3BhbicpKS5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uY2hldnJvbkxlZnQpKTtcblx0XHR0aGlzLnZpZXdTdG9yZS5hZGQoR2VzdHVyZS5hZGRUYXJnZXQoYmFja0J0bikpO1xuXHRcdHRoaXMudmlld1N0b3JlLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGJhY2tCdG4sIERPTS5FdmVudFR5cGUuQ0xJQ0ssICgpID0+IHRoaXMuZGlzcG9zZSgpKSk7XG5cdFx0dGhpcy52aWV3U3RvcmUuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYmFja0J0biwgVG91Y2hFdmVudFR5cGUuVGFwLCAoKSA9PiB0aGlzLmRpc3Bvc2UoKSkpO1xuXG5cdFx0Y29uc3QgZmlsZUNvdW50ID0gRE9NLmFwcGVuZCh0b3BCYXIsICQoJ3NwYW4ubW9iaWxlLW11bHRpLWRpZmYtZmlsZS1jb3VudCcpKTtcblx0XHRmaWxlQ291bnQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZShcblx0XHRcdCdtdWx0aURpZmZWaWV3LmZpbGVDb3VudCcsXG5cdFx0XHRcInswfSB7MX1cIixcblx0XHRcdHRoaXMuZGF0YS5kaWZmcy5sZW5ndGgsXG5cdFx0XHR0aGlzLmRhdGEuZGlmZnMubGVuZ3RoID09PSAxID8gbG9jYWxpemUoJ211bHRpRGlmZlZpZXcuZmlsZScsIFwiZmlsZVwiKSA6IGxvY2FsaXplKCdtdWx0aURpZmZWaWV3LmZpbGVzJywgXCJmaWxlc1wiKSxcblx0XHQpO1xuXG5cdFx0Ly8gLS0gU2Nyb2xsIGJvZHlcblx0XHRjb25zdCBib2R5ID0gRE9NLmFwcGVuZChvdmVybGF5LCAkKCdkaXYubW9iaWxlLW92ZXJsYXktYm9keScpKTtcblx0XHR0aGlzLnNjcm9sbFdyYXBwZXIgPSBET00uYXBwZW5kKGJvZHksICQoJ2Rpdi5tb2JpbGUtb3ZlcmxheS1zY3JvbGwnKSk7XG5cdFx0dGhpcy52aXJ0dWFsQ29udGVudCA9IERPTS5hcHBlbmQodGhpcy5zY3JvbGxXcmFwcGVyLCAkKCdkaXYubW9iaWxlLW11bHRpLWRpZmYtdmlydHVhbC1jb250ZW50JykpO1xuXHRcdHRoaXMudmlld1N0b3JlLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuc2Nyb2xsV3JhcHBlciwgRE9NLkV2ZW50VHlwZS5TQ1JPTEwsICgpID0+IHRoaXMuc2NoZWR1bGVWaXJ0dWFsTGF5b3V0KCksIHsgcGFzc2l2ZTogdHJ1ZSB9KSk7XG5cdH1cblxuXHRwcml2YXRlIHNjcm9sbFRvSW5pdGlhbEluZGV4KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmRhdGEuaW5pdGlhbEluZGV4ID09PSB1bmRlZmluZWQgfHwgdGhpcy5kYXRhLmluaXRpYWxJbmRleCA8PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0RE9NLmdldFdpbmRvdyh0aGlzLnNjcm9sbFdyYXBwZXIpLnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5kaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnNjcm9sbFdyYXBwZXIuc2Nyb2xsVG9wID0gdGhpcy5jb21wdXRlVmlydHVhbFRvcCh0aGlzLmRhdGEuaW5pdGlhbEluZGV4ISk7XG5cdFx0XHR0aGlzLnVwZGF0ZVZpcnR1YWxMYXlvdXQoKTtcblx0XHRcdHRoaXMuc2NoZWR1bGVMb2FkVmlzaWJsZUZpbGVzKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGZvcm1hdERpclNlZ21lbnQodXJpOiBVUkkpOiBzdHJpbmcge1xuXHRcdC8vIFRha2UgdGhlIGxhc3QgMiBkaXJlY3Rvcnkgc2VnbWVudHMgb2YgdGhlIHBhcmVudCBwYXRoIHRvIHByb3ZpZGVcblx0XHQvLyBjb250ZXh0IHdpdGhvdXQgb3ZlcndoZWxtaW5nIHRoZSBoZWFkZXIgb24gbmFycm93IHBob25lIHdpZHRocy5cblx0XHRjb25zdCBwYXJlbnQgPSBkaXJuYW1lKHVyaSk7XG5cdFx0Y29uc3QgcGFyZW50UGF0aCA9IHBhcmVudC5wYXRoLnJlcGxhY2UoL15cXC8rLywgJycpO1xuXHRcdGlmICghcGFyZW50UGF0aCB8fCBwYXJlbnRQYXRoID09PSAnLicpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0Y29uc3Qgc2VnbWVudHMgPSBwYXJlbnRQYXRoLnNwbGl0KCcvJykuZmlsdGVyKHMgPT4gcy5sZW5ndGggPiAwKTtcblx0XHRpZiAoc2VnbWVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdGNvbnN0IHRhaWwgPSBzZWdtZW50cy5zbGljZSgtMikuam9pbignLycpO1xuXHRcdGNvbnN0IHByZWZpeCA9IHNlZ21lbnRzLmxlbmd0aCA+IDIgPyAnXHUyMDI2LycgOiAnJztcblx0XHRyZXR1cm4gYCR7cHJlZml4fSR7dGFpbH0vYDtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRmlsZVNlY3Rpb24oc3RhdGU6IElNb2JpbGVNdWx0aURpZmZGaWxlU3RhdGUpOiB7IHNlY3Rpb246IEhUTUxFbGVtZW50OyBjb250ZW50OiBIVE1MRWxlbWVudDsgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSB9IHtcblx0XHRjb25zdCBkaWZmID0gc3RhdGUuZGlmZjtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBzZWN0aW9uID0gJCgnZGl2Lm1vYmlsZS1tdWx0aS1kaWZmLWZpbGUtc2VjdGlvbicpO1xuXHRcdHNlY3Rpb24uZGF0YXNldC5pbmRleCA9IFN0cmluZyhzdGF0ZS5pbmRleCk7XG5cblx0XHRjb25zdCBoZWFkZXIgPSBET00uYXBwZW5kKHNlY3Rpb24sICQoJ2Rpdi5tb2JpbGUtbXVsdGktZGlmZi1maWxlLWhlYWRlcicpKTtcblxuXHRcdGNvbnN0IGZpbGVOYW1lVXJpID0gZGlmZi5tb2RpZmllZFVSSSA/PyBkaWZmLm9yaWdpbmFsVVJJO1xuXHRcdGNvbnN0IGZpbGVOYW1lID0gZmlsZU5hbWVVcmkgPyBiYXNlbmFtZShmaWxlTmFtZVVyaSkgOiAnJztcblx0XHRjb25zdCBkaXJQYXRoID0gZmlsZU5hbWVVcmkgPyB0aGlzLmZvcm1hdERpclNlZ21lbnQoZmlsZU5hbWVVcmkpIDogJyc7XG5cblx0XHQvLyBDaGV2cm9uIGFjdHMgYXMgdGhlIGZvbGQgdG9nZ2xlLlxuXHRcdGNvbnN0IGNoZXZyb25FbCA9IERPTS5hcHBlbmQoaGVhZGVyLCAkKCdzcGFuLm1vYmlsZS1tdWx0aS1kaWZmLWZpbGUtY2hldnJvbicsIHtcblx0XHRcdHJvbGU6ICdidXR0b24nLFxuXHRcdFx0dGFiaW5kZXg6ICcwJyxcblx0XHRcdCdhcmlhLWV4cGFuZGVkJzogJ3RydWUnLFxuXHRcdH0pKTtcblx0XHRjaGV2cm9uRWwuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmNoZXZyb25Eb3duKSk7XG5cdFx0Y2hldnJvbkVsLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdtdWx0aURpZmZWaWV3LnRvZ2dsZUZpbGUnLCBcIlRvZ2dsZSB7MH1cIiwgZmlsZU5hbWUgfHwgbG9jYWxpemUoJ211bHRpRGlmZlZpZXcuZmlsZUZhbGxiYWNrJywgXCJmaWxlXCIpKSk7XG5cblx0XHRjb25zdCBuYW1lRWwgPSBET00uYXBwZW5kKGhlYWRlciwgJCgnc3Bhbi5tb2JpbGUtbXVsdGktZGlmZi1maWxlLW5hbWUnKSk7XG5cdFx0aWYgKGRpclBhdGgpIHtcblx0XHRcdERPTS5hcHBlbmQobmFtZUVsLCAkKCdzcGFuLm1vYmlsZS1tdWx0aS1kaWZmLWZpbGUtZGlyJykpLnRleHRDb250ZW50ID0gZGlyUGF0aDtcblx0XHR9XG5cdFx0RE9NLmFwcGVuZChuYW1lRWwsICQoJ3NwYW4ubW9iaWxlLW11bHRpLWRpZmYtZmlsZS1iYXNlJykpLnRleHRDb250ZW50ID0gZmlsZU5hbWU7XG5cblx0XHRjb25zdCBzdGF0c0VsID0gRE9NLmFwcGVuZChoZWFkZXIsICQoJ3NwYW4ubW9iaWxlLW11bHRpLWRpZmYtZmlsZS1zdGF0cycpKTtcblx0XHRpZiAoIWRpZmYuaWRlbnRpY2FsKSB7XG5cdFx0XHRpZiAoZGlmZi5hZGRlZCkge1xuXHRcdFx0XHRET00uYXBwZW5kKHN0YXRzRWwsICQoJ3NwYW4ubW9iaWxlLW11bHRpLWRpZmYtc3RhdC1hZGRlZCcpKS50ZXh0Q29udGVudCA9IGArJHtkaWZmLmFkZGVkfWA7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZGlmZi5yZW1vdmVkKSB7XG5cdFx0XHRcdERPTS5hcHBlbmQoc3RhdHNFbCwgJCgnc3Bhbi5tb2JpbGUtbXVsdGktZGlmZi1zdGF0LXJlbW92ZWQnKSkudGV4dENvbnRlbnQgPSBgLSR7ZGlmZi5yZW1vdmVkfWA7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ29udGVudCBhcmVhICh3aWxsIGJlIHBvcHVsYXRlZCBhc3luYylcblx0XHRjb25zdCBjb250ZW50ID0gRE9NLmFwcGVuZChzZWN0aW9uLCAkKCdkaXYubW9iaWxlLW11bHRpLWRpZmYtZmlsZS1jb250ZW50JykpO1xuXG5cdFx0Ly8gTG9hZGluZyBwbGFjZWhvbGRlclxuXHRcdGNvbnN0IGxvYWRpbmdFbCA9IERPTS5hcHBlbmQoY29udGVudCwgJCgnZGl2Lm1vYmlsZS1kaWZmLWVtcHR5LXN0YXRlJykpO1xuXHRcdGxvYWRpbmdFbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdtdWx0aURpZmZWaWV3LmxvYWRpbmcnLCBcIkxvYWRpbmdcdTIwMjZcIik7XG5cblx0XHRjb25zdCB0b2dnbGUgPSAoZTogVUlFdmVudCkgPT4ge1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdHN0YXRlLmNvbGxhcHNlZCA9ICFzdGF0ZS5jb2xsYXBzZWQ7XG5cdFx0XHRzZWN0aW9uLmNsYXNzTGlzdC50b2dnbGUoJ2NvbGxhcHNlZCcsIHN0YXRlLmNvbGxhcHNlZCk7XG5cdFx0XHRjaGV2cm9uRWwuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgc3RhdGUuY29sbGFwc2VkID8gJ2ZhbHNlJyA6ICd0cnVlJyk7XG5cdFx0XHRjaGV2cm9uRWwuY2xhc3NMaXN0LnJlbW92ZSguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShzdGF0ZS5jb2xsYXBzZWQgPyBDb2RpY29uLmNoZXZyb25Eb3duIDogQ29kaWNvbi5jaGV2cm9uUmlnaHQpKTtcblx0XHRcdGNoZXZyb25FbC5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KHN0YXRlLmNvbGxhcHNlZCA/IENvZGljb24uY2hldnJvblJpZ2h0IDogQ29kaWNvbi5jaGV2cm9uRG93bikpO1xuXHRcdFx0dGhpcy5zY2hlZHVsZVZpcnR1YWxMYXlvdXQoKTtcblx0XHRcdGlmICghc3RhdGUuY29sbGFwc2VkKSB7XG5cdFx0XHRcdHRoaXMuc2NoZWR1bGVMb2FkVmlzaWJsZUZpbGVzKCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRzdG9yZS5hZGQoR2VzdHVyZS5hZGRUYXJnZXQoaGVhZGVyKSk7XG5cdFx0c3RvcmUuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoaGVhZGVyLCBET00uRXZlbnRUeXBlLkNMSUNLLCB0b2dnbGUpKTtcblx0XHRzdG9yZS5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihoZWFkZXIsIFRvdWNoRXZlbnRUeXBlLlRhcCwgZSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgdG9nZ2xlKGUpOyB9KSk7XG5cdFx0c3RvcmUuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoY2hldnJvbkVsLCBET00uRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHR0b2dnbGUoZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHsgc2VjdGlvbiwgY29udGVudCwgc3RvcmUgfTtcblx0fVxuXG5cdHByaXZhdGUgZW5zdXJlRmlsZVNlY3Rpb24oc3RhdGU6IElNb2JpbGVNdWx0aURpZmZGaWxlU3RhdGUpOiBIVE1MRWxlbWVudCB7XG5cdFx0aWYgKCFzdGF0ZS5zZWN0aW9uIHx8ICFzdGF0ZS5jb250ZW50KSB7XG5cdFx0XHRjb25zdCB7IHNlY3Rpb24sIGNvbnRlbnQsIHN0b3JlIH0gPSB0aGlzLnJlbmRlckZpbGVTZWN0aW9uKHN0YXRlKTtcblx0XHRcdHN0YXRlLnNlY3Rpb24gPSBzZWN0aW9uO1xuXHRcdFx0c3RhdGUuY29udGVudCA9IGNvbnRlbnQ7XG5cdFx0XHRzdGF0ZS5zZWN0aW9uU3RvcmUgPSBzdG9yZTtcblx0XHRcdHRoaXMucmVuZGVyQ3VycmVudEZpbGVDb250ZW50KHN0YXRlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3RhdGUuc2VjdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgZGlzcG9zZUZpbGVTZWN0aW9uKHN0YXRlOiBJTW9iaWxlTXVsdGlEaWZmRmlsZVN0YXRlKTogdm9pZCB7XG5cdFx0c3RhdGUuc2VjdGlvblN0b3JlPy5kaXNwb3NlKCk7XG5cdFx0c3RhdGUuc2VjdGlvblN0b3JlID0gdW5kZWZpbmVkO1xuXHRcdHN0YXRlLnNlY3Rpb24/LnJlbW92ZSgpO1xuXHRcdHN0YXRlLnNlY3Rpb24gPSB1bmRlZmluZWQ7XG5cdFx0c3RhdGUuY29udGVudCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnJlc2V0Qm9keVJlbmRlclN0YXRlKHN0YXRlKTtcblx0fVxuXG5cdHByaXZhdGUgc2NoZWR1bGVWaXJ0dWFsTGF5b3V0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmRpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMubGF5b3V0QW5pbWF0aW9uRnJhbWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IERPTS5nZXRXaW5kb3codGhpcy5zY3JvbGxXcmFwcGVyKTtcblx0XHR0aGlzLmxheW91dEFuaW1hdGlvbkZyYW1lID0gdGFyZ2V0V2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG5cdFx0XHR0aGlzLmxheW91dEFuaW1hdGlvbkZyYW1lID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy51cGRhdGVWaXJ0dWFsTGF5b3V0KCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVZpcnR1YWxMYXlvdXQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBsYXlvdXQgPSB0aGlzLmNvbXB1dGVDdXJyZW50VmlydHVhbExheW91dCgpO1xuXHRcdHRoaXMuY3VycmVudExheW91dCA9IGxheW91dDtcblx0XHR0aGlzLnZpcnR1YWxDb250ZW50LnN0eWxlLmhlaWdodCA9IGAke2xheW91dC50b3RhbEhlaWdodH1weGA7XG5cblx0XHRjb25zdCB2aXNpYmxlSW5kZXhlcyA9IG5ldyBTZXQobGF5b3V0Lml0ZW1zLm1hcChpdGVtID0+IGl0ZW0uaW5kZXgpKTtcblx0XHR0aGlzLmFiYW5kb25PZmZzY3JlZW5Mb2Fkcyh2aXNpYmxlSW5kZXhlcyk7XG5cdFx0Zm9yIChjb25zdCBpbmRleCBvZiBBcnJheS5mcm9tKHRoaXMubW91bnRlZEluZGV4ZXMpKSB7XG5cdFx0XHRpZiAoIXZpc2libGVJbmRleGVzLmhhcyhpbmRleCkpIHtcblx0XHRcdFx0dGhpcy5kaXNwb3NlRmlsZVNlY3Rpb24odGhpcy5maWxlU3RhdGVzW2luZGV4XSk7XG5cdFx0XHRcdHRoaXMubW91bnRlZEluZGV4ZXMuZGVsZXRlKGluZGV4KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgcHJldmlvdXNTZWN0aW9uOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgbGF5b3V0Lml0ZW1zKSB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuZmlsZVN0YXRlc1tpdGVtLmluZGV4XTtcblx0XHRcdGNvbnN0IHNlY3Rpb24gPSB0aGlzLmVuc3VyZUZpbGVTZWN0aW9uKHN0YXRlKTtcblx0XHRcdHRoaXMuYXBwbHlWaXJ0dWFsTGF5b3V0KHNlY3Rpb24sIHN0YXRlLCBpdGVtKTtcblx0XHRcdGlmICghdGhpcy5tb3VudGVkSW5kZXhlcy5oYXMoaXRlbS5pbmRleCkpIHtcblx0XHRcdFx0dGhpcy5tb3VudGVkSW5kZXhlcy5hZGQoaXRlbS5pbmRleCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmVuc3VyZUZpbGVTZWN0aW9uRG9tT3JkZXIoc2VjdGlvbiwgcHJldmlvdXNTZWN0aW9uKTtcblx0XHRcdHByZXZpb3VzU2VjdGlvbiA9IHNlY3Rpb247XG5cdFx0fVxuXG5cdFx0dGhpcy5zY2hlZHVsZUxvYWRWaXNpYmxlRmlsZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgZW5zdXJlRmlsZVNlY3Rpb25Eb21PcmRlcihzZWN0aW9uOiBIVE1MRWxlbWVudCwgcHJldmlvdXNTZWN0aW9uOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlZmVyZW5jZU5vZGUgPSBwcmV2aW91c1NlY3Rpb24gPyBwcmV2aW91c1NlY3Rpb24ubmV4dFNpYmxpbmcgOiB0aGlzLnZpcnR1YWxDb250ZW50LmZpcnN0Q2hpbGQ7XG5cdFx0aWYgKHNlY3Rpb24gIT09IHJlZmVyZW5jZU5vZGUpIHtcblx0XHRcdHRoaXMudmlydHVhbENvbnRlbnQuaW5zZXJ0QmVmb3JlKHNlY3Rpb24sIHJlZmVyZW5jZU5vZGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXBwbHlWaXJ0dWFsTGF5b3V0KHNlY3Rpb246IEhUTUxFbGVtZW50LCBzdGF0ZTogSU1vYmlsZU11bHRpRGlmZkZpbGVTdGF0ZSwgaXRlbTogSU1vYmlsZU11bHRpRGlmZlZpcnR1YWxJdGVtTGF5b3V0KTogdm9pZCB7XG5cdFx0c2VjdGlvbi5zdHlsZS50b3AgPSBgJHtpdGVtLnJlbmRlclRvcH1weGA7XG5cdFx0c2VjdGlvbi5zdHlsZS5oZWlnaHQgPSBgJHtpdGVtLnJlbmRlckhlaWdodH1weGA7XG5cdFx0Y29uc3QgYm9keU9mZnNldCA9IE1hdGgubWF4KDAsIGl0ZW0uaW5uZXJPZmZzZXQgLSBWSVJUVUFMSVpFUl9NRVRSSUNTLmZpbGVIZWFkZXJIZWlnaHQpO1xuXHRcdHN0YXRlLmJvZHlTY3JvbGxUb3AgPSBib2R5T2Zmc2V0O1xuXHRcdHN0YXRlLmJvZHlWaWV3cG9ydEhlaWdodCA9IE1hdGgubWF4KDAsIHRoaXMuc2Nyb2xsV3JhcHBlci5jbGllbnRIZWlnaHQgLSBWSVJUVUFMSVpFUl9NRVRSSUNTLmZpbGVIZWFkZXJIZWlnaHQpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBzdGF0ZS5jb250ZW50ITtcblx0XHRjb250ZW50LmNsYXNzTGlzdC50b2dnbGUoJ21vYmlsZS1tdWx0aS1kaWZmLWZpbGUtY29udGVudC1wbGFjZWhvbGRlcicsIHN0YXRlLmxvYWRTdGF0ZSAhPT0gJ2xvYWRlZCcpO1xuXHRcdGlmIChzdGF0ZS5sb2FkU3RhdGUgPT09ICdsb2FkZWQnKSB7XG5cdFx0XHRjb250ZW50LnN0eWxlLmhlaWdodCA9ICcnO1xuXHRcdFx0Y29udGVudC5zdHlsZS50cmFuc2Zvcm0gPSAnJztcblx0XHRcdHRoaXMucmVuZGVyTG9hZGVkRmlsZUNvbnRlbnQoc3RhdGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBib2R5SGVpZ2h0ID0gTWF0aC5tYXgoMCwgaXRlbS5yZW5kZXJIZWlnaHQgLSBWSVJUVUFMSVpFUl9NRVRSSUNTLmZpbGVIZWFkZXJIZWlnaHQpO1xuXHRcdFx0Y29uc3QgcGxhY2Vob2xkZXJIZWlnaHQgPSBNYXRoLm1pbihcblx0XHRcdFx0Ym9keUhlaWdodCB8fCBWSVJUVUFMSVpFUl9NRVRSSUNTLnBsYWNlaG9sZGVySGVpZ2h0LFxuXHRcdFx0XHRNYXRoLm1heChWSVJUVUFMSVpFUl9NRVRSSUNTLnBsYWNlaG9sZGVySGVpZ2h0LCBzdGF0ZS5ib2R5Vmlld3BvcnRIZWlnaHQpLFxuXHRcdFx0KTtcblx0XHRcdGNvbnRlbnQuc3R5bGUuaGVpZ2h0ID0gYCR7Ym9keUhlaWdodH1weGA7XG5cdFx0XHRjb250ZW50LnN0eWxlLnRyYW5zZm9ybSA9ICcnO1xuXHRcdFx0dGhpcy51cGRhdGVGaWxlTWVzc2FnZUhlaWdodChzdGF0ZSwgcGxhY2Vob2xkZXJIZWlnaHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQ3VycmVudEZpbGVDb250ZW50KHN0YXRlOiBJTW9iaWxlTXVsdGlEaWZmRmlsZVN0YXRlKTogdm9pZCB7XG5cdFx0aWYgKCFzdGF0ZS5jb250ZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0c3dpdGNoIChzdGF0ZS5sb2FkU3RhdGUpIHtcblx0XHRcdGNhc2UgJ2xvYWRlZCc6XG5cdFx0XHRcdHRoaXMucmVuZGVyTG9hZGVkRmlsZUNvbnRlbnQoc3RhdGUpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2VtcHR5Jzpcblx0XHRcdFx0dGhpcy5yZW5kZXJGaWxlTWVzc2FnZShzdGF0ZSwgbG9jYWxpemUoJ211bHRpRGlmZlZpZXcubm9DaGFuZ2VzJywgXCJObyBjaGFuZ2VzIGluIHRoaXMgZmlsZS5cIikpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2Vycm9yJzpcblx0XHRcdFx0dGhpcy5yZW5kZXJGaWxlTWVzc2FnZShzdGF0ZSwgbG9jYWxpemUoJ211bHRpRGlmZlZpZXcubG9hZEVycm9yJywgXCJVbmFibGUgdG8gbG9hZCBjaGFuZ2VzIGluIHRoaXMgZmlsZS5cIikpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2lkbGUnOlxuXHRcdFx0Y2FzZSAnbG9hZGluZyc6XG5cdFx0XHRcdHRoaXMucmVuZGVyRmlsZU1lc3NhZ2Uoc3RhdGUsIGxvY2FsaXplKCdtdWx0aURpZmZWaWV3LmxvYWRpbmcnLCBcIkxvYWRpbmdcdTIwMjZcIikpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckZpbGVNZXNzYWdlKHN0YXRlOiBJTW9iaWxlTXVsdGlEaWZmRmlsZVN0YXRlLCBtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIXN0YXRlLmNvbnRlbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRET00uY2xlYXJOb2RlKHN0YXRlLmNvbnRlbnQpO1xuXHRcdHRoaXMucmVzZXRCb2R5UmVuZGVyU3RhdGUoc3RhdGUpO1xuXHRcdGNvbnN0IGVtcHR5ID0gRE9NLmFwcGVuZChzdGF0ZS5jb250ZW50LCAkKCdkaXYubW9iaWxlLWRpZmYtZW1wdHktc3RhdGUnKSk7XG5cdFx0c3RhdGUuZmlsZU1lc3NhZ2UgPSBlbXB0eTtcblx0XHRlbXB0eS50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG5cdFx0dGhpcy51cGRhdGVGaWxlTWVzc2FnZUhlaWdodChzdGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUZpbGVNZXNzYWdlSGVpZ2h0KHN0YXRlOiBJTW9iaWxlTXVsdGlEaWZmRmlsZVN0YXRlLCBwbGFjZWhvbGRlckhlaWdodD86IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghc3RhdGUuY29udGVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVtcHR5ID0gc3RhdGUuZmlsZU1lc3NhZ2U7XG5cdFx0aWYgKCFlbXB0eSB8fCBlbXB0eS5wYXJlbnRFbGVtZW50ICE9PSBzdGF0ZS5jb250ZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYm9keUhlaWdodCA9IE51bWJlci5wYXJzZUZsb2F0KHN0YXRlLmNvbnRlbnQuc3R5bGUuaGVpZ2h0KSB8fCBWSVJUVUFMSVpFUl9NRVRSSUNTLnBsYWNlaG9sZGVySGVpZ2h0O1xuXHRcdGNvbnN0IHZpc2libGVIZWlnaHQgPSBwbGFjZWhvbGRlckhlaWdodCA/PyBNYXRoLm1pbihcblx0XHRcdGJvZHlIZWlnaHQsXG5cdFx0XHRNYXRoLm1heChWSVJUVUFMSVpFUl9NRVRSSUNTLnBsYWNlaG9sZGVySGVpZ2h0LCBzdGF0ZS5ib2R5Vmlld3BvcnRIZWlnaHQpLFxuXHRcdCk7XG5cdFx0ZW1wdHkuc3R5bGUuaGVpZ2h0ID0gYCR7dmlzaWJsZUhlaWdodH1weGA7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckxvYWRlZEZpbGVDb250ZW50KHN0YXRlOiBJTW9iaWxlTXVsdGlEaWZmRmlsZVN0YXRlKTogdm9pZCB7XG5cdFx0aWYgKCFzdGF0ZS5jb250ZW50IHx8ICFzdGF0ZS5yZW5kZXJEYXRhKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYm9keU92ZXJzY2FuID0gTWF0aC5tYXgodGhpcy5zY3JvbGxXcmFwcGVyLmNsaWVudEhlaWdodCwgNDgwKTtcblx0XHRjb25zdCB2aXNpYmxlVG9wID0gTWF0aC5tYXgoMCwgc3RhdGUuYm9keVNjcm9sbFRvcCAtIGJvZHlPdmVyc2Nhbik7XG5cdFx0Y29uc3QgdmlzaWJsZUJvdHRvbSA9IE1hdGgubWluKFxuXHRcdFx0c3RhdGUucmVuZGVyRGF0YS5ib2R5SGVpZ2h0LFxuXHRcdFx0c3RhdGUuYm9keVNjcm9sbFRvcCArIHN0YXRlLmJvZHlWaWV3cG9ydEhlaWdodCArIGJvZHlPdmVyc2Nhbixcblx0XHQpO1xuXHRcdGNvbnN0IHsgc3RhcnRJbmRleCwgZW5kSW5kZXggfSA9IHRoaXMuY29tcHV0ZVZpc2libGVCb2R5RW50cnlSYW5nZShzdGF0ZS5yZW5kZXJEYXRhLmJvZHlFbnRyaWVzLCB2aXNpYmxlVG9wLCB2aXNpYmxlQm90dG9tKTtcblx0XHRjb25zdCBpbm5lciA9IHRoaXMuZW5zdXJlQm9keUlubmVyKHN0YXRlKTtcblx0XHRpZiAoc3RhdGUucmVuZGVyZWRCb2R5U3RhcnRJbmRleCA9PT0gc3RhcnRJbmRleCAmJiBzdGF0ZS5yZW5kZXJlZEJvZHlFbmRJbmRleCA9PT0gZW5kSW5kZXgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpbm5lci5zdHlsZS5oZWlnaHQgPSBgJHtzdGF0ZS5yZW5kZXJEYXRhLmJvZHlIZWlnaHR9cHhgO1xuXHRcdGlubmVyLnN0eWxlLm1pbldpZHRoID0gYGNhbGMoJHtzdGF0ZS5yZW5kZXJEYXRhLm1heExpbmVDaGFyYWN0ZXJDb3VudCArIDh9Y2ggKyA2NHB4KWA7XG5cblx0XHR0aGlzLnJlY29uY2lsZUJvZHlFbnRyaWVzKHN0YXRlLCBzdGFydEluZGV4LCBlbmRJbmRleCk7XG5cdFx0c3RhdGUucmVuZGVyZWRCb2R5U3RhcnRJbmRleCA9IHN0YXJ0SW5kZXg7XG5cdFx0c3RhdGUucmVuZGVyZWRCb2R5RW5kSW5kZXggPSBlbmRJbmRleDtcblx0fVxuXG5cdHByaXZhdGUgdG9WaXJ0dWFsSXRlbShzdGF0ZTogSU1vYmlsZU11bHRpRGlmZkZpbGVTdGF0ZSk6IElNb2JpbGVNdWx0aURpZmZWaXJ0dWFsSXRlbSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbGxhcHNlZDogc3RhdGUuY29sbGFwc2VkLFxuXHRcdFx0c3RhdGU6IHN0YXRlLmxvYWRTdGF0ZSA9PT0gJ2lkbGUnID8gJ3VubG9hZGVkJyA6IHN0YXRlLmxvYWRTdGF0ZSxcblx0XHRcdGVzdGltYXRlZEh1bmtDb3VudDogc3RhdGUuZXN0aW1hdGVkSHVua0NvdW50LFxuXHRcdFx0ZXN0aW1hdGVkUm93Q291bnQ6IHN0YXRlLmVzdGltYXRlZFJvd0NvdW50LFxuXHRcdFx0aHVua0NvdW50OiBzdGF0ZS5odW5rQ291bnQsXG5cdFx0XHRyb3dDb3VudDogc3RhdGUucm93Q291bnQsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZUN1cnJlbnRWaXJ0dWFsTGF5b3V0KCk6IFJldHVyblR5cGU8dHlwZW9mIGNvbXB1dGVNb2JpbGVNdWx0aURpZmZWaXJ0dWFsTGF5b3V0PiB7XG5cdFx0cmV0dXJuIGNvbXB1dGVNb2JpbGVNdWx0aURpZmZWaXJ0dWFsTGF5b3V0KHRoaXMuZmlsZVN0YXRlcy5tYXAoc3RhdGUgPT4gdGhpcy50b1ZpcnR1YWxJdGVtKHN0YXRlKSksIHtcblx0XHRcdHZpZXdwb3J0SGVpZ2h0OiB0aGlzLnNjcm9sbFdyYXBwZXIuY2xpZW50SGVpZ2h0LFxuXHRcdFx0c2Nyb2xsVG9wOiB0aGlzLnNjcm9sbFdyYXBwZXIuc2Nyb2xsVG9wLFxuXHRcdFx0b3ZlcnNjYW46IE1hdGgubWF4KHRoaXMuc2Nyb2xsV3JhcHBlci5jbGllbnRIZWlnaHQsIDQ4MCksXG5cdFx0XHRtZXRyaWNzOiBWSVJUVUFMSVpFUl9NRVRSSUNTLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBjb21wdXRlVmlydHVhbFRvcChpbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRsZXQgdG9wID0gMDtcblx0XHRjb25zdCBlbmQgPSBNYXRoLm1pbihpbmRleCwgdGhpcy5maWxlU3RhdGVzLmxlbmd0aCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBlbmQ7IGkrKykge1xuXHRcdFx0dG9wICs9IGNvbXB1dGVNb2JpbGVNdWx0aURpZmZJdGVtSGVpZ2h0KHRoaXMudG9WaXJ0dWFsSXRlbSh0aGlzLmZpbGVTdGF0ZXNbaV0pLCBWSVJUVUFMSVpFUl9NRVRSSUNTKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRvcDtcblx0fVxuXG5cdHByaXZhdGUgc2NoZWR1bGVMb2FkVmlzaWJsZUZpbGVzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmRpc3Bvc2VkIHx8IHRoaXMubG9hZFZpc2libGVBbmltYXRpb25GcmFtZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gRE9NLmdldFdpbmRvdyh0aGlzLnNjcm9sbFdyYXBwZXIpO1xuXHRcdHRoaXMubG9hZFZpc2libGVBbmltYXRpb25GcmFtZSA9IHRhcmdldFdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuXHRcdFx0dGhpcy5sb2FkVmlzaWJsZUFuaW1hdGlvbkZyYW1lID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5sb2FkVmlzaWJsZUZpbGVzKCk7XG5cdFx0XHR0aGlzLnNjaGVkdWxlUHJlZmV0Y2hGaWxlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGNhbmNlbFNjaGVkdWxlZExvYWRWaXNpYmxlRmlsZXMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubG9hZFZpc2libGVBbmltYXRpb25GcmFtZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRET00uZ2V0V2luZG93KHRoaXMuc2Nyb2xsV3JhcHBlcikuY2FuY2VsQW5pbWF0aW9uRnJhbWUodGhpcy5sb2FkVmlzaWJsZUFuaW1hdGlvbkZyYW1lKTtcblx0XHRcdHRoaXMubG9hZFZpc2libGVBbmltYXRpb25GcmFtZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNjaGVkdWxlUHJlZmV0Y2hGaWxlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmRpc3Bvc2VkIHx8IHRoaXMucHJlZmV0Y2hBbmltYXRpb25GcmFtZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gRE9NLmdldFdpbmRvdyh0aGlzLnNjcm9sbFdyYXBwZXIpO1xuXHRcdHRoaXMucHJlZmV0Y2hBbmltYXRpb25GcmFtZSA9IHRhcmdldFdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuXHRcdFx0dGhpcy5wcmVmZXRjaEFuaW1hdGlvbkZyYW1lID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5wcmVmZXRjaE5lYXJGaWxlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGNhbmNlbFNjaGVkdWxlZFByZWZldGNoRmlsZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5wcmVmZXRjaEFuaW1hdGlvbkZyYW1lICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdERPTS5nZXRXaW5kb3codGhpcy5zY3JvbGxXcmFwcGVyKS5jYW5jZWxBbmltYXRpb25GcmFtZSh0aGlzLnByZWZldGNoQW5pbWF0aW9uRnJhbWUpO1xuXHRcdFx0dGhpcy5wcmVmZXRjaEFuaW1hdGlvbkZyYW1lID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgbG9hZFZpc2libGVGaWxlcygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxvYWRpbmdDb3VudCA9IHRoaXMuZmlsZVN0YXRlcy5yZWR1Y2UoKGNvdW50LCBzdGF0ZSkgPT4gY291bnQgKyAoc3RhdGUubG9hZFN0YXRlID09PSAnbG9hZGluZycgPyAxIDogMCksIDApO1xuXHRcdGlmIChsb2FkaW5nQ291bnQgPj0gTUFYX0NPTkNVUlJFTlRfRklMRV9MT0FEUykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxheW91dCA9IHRoaXMuY3VycmVudExheW91dDtcblx0XHRpZiAoIWxheW91dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdwb3J0VG9wID0gdGhpcy5zY3JvbGxXcmFwcGVyLnNjcm9sbFRvcDtcblx0XHRjb25zdCB2aWV3cG9ydEJvdHRvbSA9IHZpZXdwb3J0VG9wICsgdGhpcy5zY3JvbGxXcmFwcGVyLmNsaWVudEhlaWdodDtcblxuXHRcdGxldCBuZXh0U3RhdGU6IElNb2JpbGVNdWx0aURpZmZGaWxlU3RhdGUgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IG5leHREaXN0YW5jZSA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcblxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBsYXlvdXQuaXRlbXMpIHtcblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5maWxlU3RhdGVzW2l0ZW0uaW5kZXhdO1xuXHRcdFx0aWYgKHN0YXRlLmxvYWRTdGF0ZSAhPT0gJ2lkbGUnIHx8IHN0YXRlLmNvbGxhcHNlZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGl0ZW1Ub3AgPSBpdGVtLnZpcnR1YWxUb3A7XG5cdFx0XHRjb25zdCBpdGVtQm90dG9tID0gaXRlbS52aXJ0dWFsVG9wICsgaXRlbS52aXJ0dWFsSGVpZ2h0O1xuXG5cdFx0XHRjb25zdCBkaXN0YW5jZSA9IGl0ZW1Cb3R0b20gPCB2aWV3cG9ydFRvcFxuXHRcdFx0XHQ/IHZpZXdwb3J0VG9wIC0gaXRlbUJvdHRvbVxuXHRcdFx0XHQ6IGl0ZW1Ub3AgPiB2aWV3cG9ydEJvdHRvbVxuXHRcdFx0XHRcdD8gaXRlbVRvcCAtIHZpZXdwb3J0Qm90dG9tXG5cdFx0XHRcdFx0OiAwO1xuXG5cdFx0XHRpZiAoZGlzdGFuY2UgPCBuZXh0RGlzdGFuY2UpIHtcblx0XHRcdFx0bmV4dFN0YXRlID0gc3RhdGU7XG5cdFx0XHRcdG5leHREaXN0YW5jZSA9IGRpc3RhbmNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChuZXh0U3RhdGUpIHtcblx0XHRcdHRoaXMuZW5zdXJlRmlsZUxvYWRlZChuZXh0U3RhdGUsICd2aXNpYmxlJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBwcmVmZXRjaE5lYXJGaWxlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmRpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGF5b3V0ID0gdGhpcy5jdXJyZW50TGF5b3V0O1xuXHRcdGlmICghbGF5b3V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW91bnRlZEluZGV4ZXMgPSBuZXcgU2V0KGxheW91dC5pdGVtcy5tYXAoaXRlbSA9PiBpdGVtLmluZGV4KSk7XG5cdFx0aWYgKGxheW91dC5pdGVtcy5zb21lKGl0ZW0gPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLmZpbGVTdGF0ZXNbaXRlbS5pbmRleF07XG5cdFx0XHRyZXR1cm4gIXN0YXRlLmNvbGxhcHNlZCAmJiBzdGF0ZS5sb2FkU3RhdGUgPT09ICdpZGxlJztcblx0XHR9KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxvYWRpbmdDb3VudCA9IHRoaXMuZmlsZVN0YXRlcy5yZWR1Y2UoKGNvdW50LCBzdGF0ZSkgPT4gY291bnQgKyAoc3RhdGUubG9hZFN0YXRlID09PSAnbG9hZGluZycgPyAxIDogMCksIDApO1xuXHRcdGNvbnN0IHByZWZldGNoTG9hZGluZ0NvdW50ID0gdGhpcy5maWxlU3RhdGVzLnJlZHVjZSgoY291bnQsIHN0YXRlKSA9PiBjb3VudCArIChzdGF0ZS5sb2FkU3RhdGUgPT09ICdsb2FkaW5nJyAmJiBzdGF0ZS5sb2FkS2luZCA9PT0gJ3ByZWZldGNoJyA/IDEgOiAwKSwgMCk7XG5cdFx0aWYgKGxvYWRpbmdDb3VudCA+PSBNQVhfQ09OQ1VSUkVOVF9GSUxFX0xPQURTIHx8IHByZWZldGNoTG9hZGluZ0NvdW50ID49IE1BWF9DT05DVVJSRU5UX1BSRUZFVENIX0xPQURTKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgdmlld3BvcnRUb3AgPSB0aGlzLnNjcm9sbFdyYXBwZXIuc2Nyb2xsVG9wO1xuXHRcdGNvbnN0IHZpZXdwb3J0Qm90dG9tID0gdmlld3BvcnRUb3AgKyB0aGlzLnNjcm9sbFdyYXBwZXIuY2xpZW50SGVpZ2h0O1xuXHRcdGNvbnN0IHByZWZldGNoRGlzdGFuY2UgPSBNYXRoLm1heChNSU5fUFJFRkVUQ0hfRElTVEFOQ0UsIHRoaXMuc2Nyb2xsV3JhcHBlci5jbGllbnRIZWlnaHQgKiBQUkVGRVRDSF9WSUVXUE9SVF9NVUxUSVBMSUVSKTtcblx0XHRsZXQgdmlydHVhbFRvcCA9IDA7XG5cdFx0bGV0IG5leHRTdGF0ZTogSU1vYmlsZU11bHRpRGlmZkZpbGVTdGF0ZSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgbmV4dERpc3RhbmNlID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuXG5cdFx0Zm9yIChjb25zdCBzdGF0ZSBvZiB0aGlzLmZpbGVTdGF0ZXMpIHtcblx0XHRcdGNvbnN0IHZpcnR1YWxIZWlnaHQgPSBjb21wdXRlTW9iaWxlTXVsdGlEaWZmSXRlbUhlaWdodCh0aGlzLnRvVmlydHVhbEl0ZW0oc3RhdGUpLCBWSVJUVUFMSVpFUl9NRVRSSUNTKTtcblx0XHRcdGNvbnN0IHZpcnR1YWxCb3R0b20gPSB2aXJ0dWFsVG9wICsgdmlydHVhbEhlaWdodDtcblx0XHRcdGlmICghbW91bnRlZEluZGV4ZXMuaGFzKHN0YXRlLmluZGV4KSAmJiAhc3RhdGUuY29sbGFwc2VkICYmIHN0YXRlLmxvYWRTdGF0ZSA9PT0gJ2lkbGUnKSB7XG5cdFx0XHRcdGNvbnN0IGRpc3RhbmNlID0gdmlydHVhbEJvdHRvbSA8IHZpZXdwb3J0VG9wXG5cdFx0XHRcdFx0PyB2aWV3cG9ydFRvcCAtIHZpcnR1YWxCb3R0b21cblx0XHRcdFx0XHQ6IHZpcnR1YWxUb3AgPiB2aWV3cG9ydEJvdHRvbVxuXHRcdFx0XHRcdFx0PyB2aXJ0dWFsVG9wIC0gdmlld3BvcnRCb3R0b21cblx0XHRcdFx0XHRcdDogMDtcblxuXHRcdFx0XHRpZiAoZGlzdGFuY2UgPD0gcHJlZmV0Y2hEaXN0YW5jZSAmJiBkaXN0YW5jZSA8IG5leHREaXN0YW5jZSkge1xuXHRcdFx0XHRcdG5leHRTdGF0ZSA9IHN0YXRlO1xuXHRcdFx0XHRcdG5leHREaXN0YW5jZSA9IGRpc3RhbmNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHZpcnR1YWxUb3AgPSB2aXJ0dWFsQm90dG9tO1xuXHRcdH1cblxuXHRcdGlmIChuZXh0U3RhdGUpIHtcblx0XHRcdHRoaXMuZW5zdXJlRmlsZUxvYWRlZChuZXh0U3RhdGUsICdwcmVmZXRjaCcpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZW5zdXJlRmlsZUxvYWRlZChzdGF0ZTogSU1vYmlsZU11bHRpRGlmZkZpbGVTdGF0ZSwgbG9hZEtpbmQ6IE1vYmlsZU11bHRpRGlmZkZpbGVMb2FkS2luZCk6IHZvaWQge1xuXHRcdGlmIChzdGF0ZS5sb2FkU3RhdGUgIT09ICdpZGxlJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRzdGF0ZS5sb2FkU3RhdGUgPSAnbG9hZGluZyc7XG5cdFx0c3RhdGUubG9hZEtpbmQgPSBsb2FkS2luZDtcblx0XHRzdGF0ZS5sb2FkUmVxdWVzdElkKys7XG5cdFx0dGhpcy5yZW5kZXJDdXJyZW50RmlsZUNvbnRlbnQoc3RhdGUpO1xuXHRcdGNvbnN0IGdlbmVyYXRpb24gPSB0aGlzLnJlbmRlckdlbmVyYXRpb247XG5cdFx0Y29uc3QgbG9hZFJlcXVlc3RJZCA9IHN0YXRlLmxvYWRSZXF1ZXN0SWQ7XG5cdFx0dm9pZCB0aGlzLmxvYWRGaWxlQ29udGVudChzdGF0ZSwgZ2VuZXJhdGlvbiwgbG9hZFJlcXVlc3RJZCkuY2F0Y2goKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLmlzQWN0aXZlRmlsZUxvYWQoc3RhdGUsIGdlbmVyYXRpb24sIGxvYWRSZXF1ZXN0SWQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHN0YXRlLmxvYWRTdGF0ZSA9ICdlcnJvcic7XG5cdFx0XHRzdGF0ZS5sb2FkS2luZCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMucmVuZGVyQ3VycmVudEZpbGVDb250ZW50KHN0YXRlKTtcblx0XHR9KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdGlmICghdGhpcy5kaXNwb3NlZCAmJiBnZW5lcmF0aW9uID09PSB0aGlzLnJlbmRlckdlbmVyYXRpb24gJiYgc3RhdGUubG9hZFJlcXVlc3RJZCA9PT0gbG9hZFJlcXVlc3RJZCkge1xuXHRcdFx0XHR0aGlzLnNjaGVkdWxlVmlydHVhbExheW91dCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0FjdGl2ZUZpbGVMb2FkKHN0YXRlOiBJTW9iaWxlTXVsdGlEaWZmRmlsZVN0YXRlLCBnZW5lcmF0aW9uOiBudW1iZXIsIGxvYWRSZXF1ZXN0SWQ6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5kaXNwb3NlZFxuXHRcdFx0JiYgZ2VuZXJhdGlvbiA9PT0gdGhpcy5yZW5kZXJHZW5lcmF0aW9uXG5cdFx0XHQmJiBzdGF0ZS5sb2FkUmVxdWVzdElkID09PSBsb2FkUmVxdWVzdElkXG5cdFx0XHQmJiBzdGF0ZS5sb2FkU3RhdGUgPT09ICdsb2FkaW5nJztcblx0fVxuXG5cdHByaXZhdGUgYWJhbmRvbk9mZnNjcmVlbkxvYWRzKHZpc2libGVJbmRleGVzOiBSZWFkb25seVNldDxudW1iZXI+KTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBzdGF0ZSBvZiB0aGlzLmZpbGVTdGF0ZXMpIHtcblx0XHRcdGlmIChzdGF0ZS5sb2FkU3RhdGUgIT09ICdsb2FkaW5nJyB8fCBzdGF0ZS5sb2FkS2luZCA9PT0gJ3ByZWZldGNoJyB8fCB2aXNpYmxlSW5kZXhlcy5oYXMoc3RhdGUuaW5kZXgpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRzdGF0ZS5sb2FkUmVxdWVzdElkKys7XG5cdFx0XHRzdGF0ZS5sb2FkU3RhdGUgPSAnaWRsZSc7XG5cdFx0XHRzdGF0ZS5sb2FkS2luZCA9IHVuZGVmaW5lZDtcblx0XHRcdHN0YXRlLnJlbmRlckRhdGEgPSB1bmRlZmluZWQ7XG5cdFx0XHRzdGF0ZS5odW5rQ291bnQgPSAwO1xuXHRcdFx0c3RhdGUucm93Q291bnQgPSAwO1xuXHRcdFx0dGhpcy5yZXNldEJvZHlSZW5kZXJTdGF0ZShzdGF0ZSk7XG5cdFx0XHR0aGlzLnJlbmRlckN1cnJlbnRGaWxlQ29udGVudChzdGF0ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBsb2FkRmlsZUNvbnRlbnQoc3RhdGU6IElNb2JpbGVNdWx0aURpZmZGaWxlU3RhdGUsIGdlbmVyYXRpb246IG51bWJlciwgbG9hZFJlcXVlc3RJZDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGlmZiA9IHN0YXRlLmRpZmY7XG5cdFx0aWYgKGRpZmYuaWRlbnRpY2FsKSB7XG5cdFx0XHRpZiAoIXRoaXMuaXNBY3RpdmVGaWxlTG9hZChzdGF0ZSwgZ2VuZXJhdGlvbiwgbG9hZFJlcXVlc3RJZCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0c3RhdGUubG9hZFN0YXRlID0gJ2VtcHR5Jztcblx0XHRcdHN0YXRlLmxvYWRLaW5kID0gdW5kZWZpbmVkO1xuXHRcdFx0c3RhdGUucmVuZGVyRGF0YSA9IHVuZGVmaW5lZDtcblx0XHRcdHN0YXRlLmh1bmtDb3VudCA9IDA7XG5cdFx0XHRzdGF0ZS5yb3dDb3VudCA9IDA7XG5cdFx0XHR0aGlzLnJlbmRlckN1cnJlbnRGaWxlQ29udGVudChzdGF0ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IHJlc29sdmVNb2JpbGVEaWZmTGFuZ3VhZ2VJZCh0aGlzLmxhbmd1YWdlU2VydmljZSwgZGlmZik7XG5cblx0XHRjb25zdCBbb3JpZ2luYWxUZXh0LCBtb2RpZmllZFRleHRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0dGhpcy5yZWFkVGV4dENvbnRlbnQoZGlmZi5vcmlnaW5hbFVSSSksXG5cdFx0XHR0aGlzLnJlYWRUZXh0Q29udGVudChkaWZmLm1vZGlmaWVkVVJJKSxcblx0XHRdKTtcblxuXHRcdGlmICghdGhpcy5pc0FjdGl2ZUZpbGVMb2FkKHN0YXRlLCBnZW5lcmF0aW9uLCBsb2FkUmVxdWVzdElkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGh1bmtzID0gYXdhaXQgKHRoaXMuZGF0YS5jb21wdXRlRGlmZj8uKG9yaWdpbmFsVGV4dCwgbW9kaWZpZWRUZXh0KSA/PyBQcm9taXNlLnJlc29sdmUoY29tcHV0ZVVuaWZpZWREaWZmKG9yaWdpbmFsVGV4dCwgbW9kaWZpZWRUZXh0KSkpO1xuXHRcdGlmICghdGhpcy5pc0FjdGl2ZUZpbGVMb2FkKHN0YXRlLCBnZW5lcmF0aW9uLCBsb2FkUmVxdWVzdElkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChodW5rcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHN0YXRlLmxvYWRTdGF0ZSA9ICdlbXB0eSc7XG5cdFx0XHRzdGF0ZS5sb2FkS2luZCA9IHVuZGVmaW5lZDtcblx0XHRcdHN0YXRlLnJlbmRlckRhdGEgPSB1bmRlZmluZWQ7XG5cdFx0XHRzdGF0ZS5odW5rQ291bnQgPSAwO1xuXHRcdFx0c3RhdGUucm93Q291bnQgPSAwO1xuXHRcdFx0dGhpcy5yZW5kZXJDdXJyZW50RmlsZUNvbnRlbnQoc3RhdGUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IFtvcmlnTGluZUh0bWwsIG1vZExpbmVIdG1sXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHRva2VuaXplRmlsZUxpbmVzKHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLCBvcmlnaW5hbFRleHQsIGxhbmd1YWdlSWQpLFxuXHRcdFx0dG9rZW5pemVGaWxlTGluZXModGhpcy5sYW5ndWFnZVNlcnZpY2UsIG1vZGlmaWVkVGV4dCwgbGFuZ3VhZ2VJZCksXG5cdFx0XSk7XG5cblx0XHRpZiAoIXRoaXMuaXNBY3RpdmVGaWxlTG9hZChzdGF0ZSwgZ2VuZXJhdGlvbiwgbG9hZFJlcXVlc3RJZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBoYXNSZWFsVG9rZW5zID0gaGFzTXVsdGlwbGVUb2tlbkNsYXNzZXMob3JpZ0xpbmVIdG1sKSB8fCBoYXNNdWx0aXBsZVRva2VuQ2xhc3Nlcyhtb2RMaW5lSHRtbCk7XG5cdFx0Y29uc3Qgb3JpZ0xpbmVzID0gaGFzUmVhbFRva2VucyA/IG9yaWdMaW5lSHRtbCA6IHJlZ2V4VG9rZW5pemVMaW5lcyhvcmlnaW5hbFRleHQsIGxhbmd1YWdlSWQpO1xuXHRcdGNvbnN0IG1vZExpbmVzID0gaGFzUmVhbFRva2VucyA/IG1vZExpbmVIdG1sIDogcmVnZXhUb2tlbml6ZUxpbmVzKG1vZGlmaWVkVGV4dCwgbGFuZ3VhZ2VJZCk7XG5cblx0XHRpZiAoIXRoaXMuaXNBY3RpdmVGaWxlTG9hZChzdGF0ZSwgZ2VuZXJhdGlvbiwgbG9hZFJlcXVlc3RJZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRzdGF0ZS5sb2FkU3RhdGUgPSAnbG9hZGVkJztcblx0XHRzdGF0ZS5sb2FkS2luZCA9IHVuZGVmaW5lZDtcblx0XHRzdGF0ZS5odW5rQ291bnQgPSBodW5rcy5sZW5ndGg7XG5cdFx0c3RhdGUucm93Q291bnQgPSBodW5rcy5yZWR1Y2UoKGNvdW50LCBodW5rKSA9PiBjb3VudCArIGh1bmsubGluZXMubGVuZ3RoLCAwKTtcblx0XHRjb25zdCB7IGJvZHlFbnRyaWVzLCBib2R5SGVpZ2h0LCBtYXhMaW5lQ2hhcmFjdGVyQ291bnQgfSA9IHRoaXMuY3JlYXRlQm9keUVudHJpZXMoaHVua3MpO1xuXHRcdHN0YXRlLnJlbmRlckRhdGEgPSB7IGJvZHlFbnRyaWVzLCBib2R5SGVpZ2h0LCBtYXhMaW5lQ2hhcmFjdGVyQ291bnQsIG9yaWdMaW5lcywgbW9kTGluZXMsIGhhc1JlYWxUb2tlbnMgfTtcblx0XHR0aGlzLnJlc2V0Qm9keVJlbmRlclN0YXRlKHN0YXRlKTtcblx0XHR0aGlzLnJlbmRlckN1cnJlbnRGaWxlQ29udGVudChzdGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlYWRUZXh0Q29udGVudChyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRpZiAoIXJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy50ZXh0RmlsZVNlcnZpY2UucmVhZChyZXNvdXJjZSwgeyBhY2NlcHRUZXh0T25seTogdHJ1ZSB9KTtcblx0XHRcdHJldHVybiBtb2RlbC52YWx1ZTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGZpbGUgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlKTtcblx0XHRcdFx0cmV0dXJuIGZpbGUudmFsdWUudG9TdHJpbmcoKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVCb2R5RW50cmllcyhodW5rczogcmVhZG9ubHkgSURpZmZIdW5rW10pOiB7IGJvZHlFbnRyaWVzOiBNb2JpbGVNdWx0aURpZmZCb2R5RW50cnlbXTsgYm9keUhlaWdodDogbnVtYmVyOyBtYXhMaW5lQ2hhcmFjdGVyQ291bnQ6IG51bWJlciB9IHtcblx0XHRjb25zdCBib2R5RW50cmllczogTW9iaWxlTXVsdGlEaWZmQm9keUVudHJ5W10gPSBbXTtcblx0XHRsZXQgdG9wID0gMDtcblx0XHRsZXQgbWF4TGluZUNoYXJhY3RlckNvdW50ID0gMDtcblxuXHRcdGZvciAoY29uc3QgaHVuayBvZiBodW5rcykge1xuXHRcdFx0Ym9keUVudHJpZXMucHVzaCh7XG5cdFx0XHRcdHR5cGU6ICdodW5rJyxcblx0XHRcdFx0aGVhZGVyOiBodW5rLmhlYWRlcixcblx0XHRcdFx0dG9wLFxuXHRcdFx0XHRoZWlnaHQ6IFZJUlRVQUxJWkVSX01FVFJJQ1MuaHVua0hlYWRlckhlaWdodCxcblx0XHRcdH0pO1xuXHRcdFx0dG9wICs9IFZJUlRVQUxJWkVSX01FVFJJQ1MuaHVua0hlYWRlckhlaWdodDtcblxuXHRcdFx0Zm9yIChjb25zdCBsaW5lIG9mIGh1bmsubGluZXMpIHtcblx0XHRcdFx0bWF4TGluZUNoYXJhY3RlckNvdW50ID0gTWF0aC5tYXgobWF4TGluZUNoYXJhY3RlckNvdW50LCBsaW5lLnRleHQubGVuZ3RoKTtcblx0XHRcdFx0Ym9keUVudHJpZXMucHVzaCh7XG5cdFx0XHRcdFx0dHlwZTogJ2xpbmUnLFxuXHRcdFx0XHRcdGxpbmUsXG5cdFx0XHRcdFx0dG9wLFxuXHRcdFx0XHRcdGhlaWdodDogVklSVFVBTElaRVJfTUVUUklDUy5yb3dIZWlnaHQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0b3AgKz0gVklSVFVBTElaRVJfTUVUUklDUy5yb3dIZWlnaHQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgYm9keUVudHJpZXMsIGJvZHlIZWlnaHQ6IHRvcCwgbWF4TGluZUNoYXJhY3RlckNvdW50IH07XG5cdH1cblxuXHRwcml2YXRlIGNvbXB1dGVWaXNpYmxlQm9keUVudHJ5UmFuZ2UoXG5cdFx0ZW50cmllczogcmVhZG9ubHkgTW9iaWxlTXVsdGlEaWZmQm9keUVudHJ5W10sXG5cdFx0dmlzaWJsZVRvcDogbnVtYmVyLFxuXHRcdHZpc2libGVCb3R0b206IG51bWJlcixcblx0KTogeyBzdGFydEluZGV4OiBudW1iZXI7IGVuZEluZGV4OiBudW1iZXIgfSB7XG5cdFx0aWYgKGVudHJpZXMubGVuZ3RoID09PSAwIHx8IHZpc2libGVCb3R0b20gPD0gdmlzaWJsZVRvcCkge1xuXHRcdFx0cmV0dXJuIHsgc3RhcnRJbmRleDogMCwgZW5kSW5kZXg6IDAgfTtcblx0XHR9XG5cblx0XHRjb25zdCBzdGFydEluZGV4ID0gdGhpcy5maW5kRmlyc3RCb2R5RW50cnlFbmRpbmdBZnRlcihlbnRyaWVzLCB2aXNpYmxlVG9wKTtcblx0XHRjb25zdCBlbmRJbmRleCA9IHRoaXMuZmluZEZpcnN0Qm9keUVudHJ5U3RhcnRpbmdBdE9yQWZ0ZXIoZW50cmllcywgdmlzaWJsZUJvdHRvbSk7XG5cdFx0cmV0dXJuIHsgc3RhcnRJbmRleCwgZW5kSW5kZXg6IE1hdGgubWF4KHN0YXJ0SW5kZXgsIGVuZEluZGV4KSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBmaW5kRmlyc3RCb2R5RW50cnlFbmRpbmdBZnRlcihlbnRyaWVzOiByZWFkb25seSBNb2JpbGVNdWx0aURpZmZCb2R5RW50cnlbXSwgb2Zmc2V0OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGxldCBsb3cgPSAwO1xuXHRcdGxldCBoaWdoID0gZW50cmllcy5sZW5ndGg7XG5cdFx0d2hpbGUgKGxvdyA8IGhpZ2gpIHtcblx0XHRcdGNvbnN0IG1pZCA9IE1hdGguZmxvb3IoKGxvdyArIGhpZ2gpIC8gMik7XG5cdFx0XHRpZiAoZW50cmllc1ttaWRdLnRvcCArIGVudHJpZXNbbWlkXS5oZWlnaHQgPD0gb2Zmc2V0KSB7XG5cdFx0XHRcdGxvdyA9IG1pZCArIDE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRoaWdoID0gbWlkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbG93O1xuXHR9XG5cblx0cHJpdmF0ZSBmaW5kRmlyc3RCb2R5RW50cnlTdGFydGluZ0F0T3JBZnRlcihlbnRyaWVzOiByZWFkb25seSBNb2JpbGVNdWx0aURpZmZCb2R5RW50cnlbXSwgb2Zmc2V0OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGxldCBsb3cgPSAwO1xuXHRcdGxldCBoaWdoID0gZW50cmllcy5sZW5ndGg7XG5cdFx0d2hpbGUgKGxvdyA8IGhpZ2gpIHtcblx0XHRcdGNvbnN0IG1pZCA9IE1hdGguZmxvb3IoKGxvdyArIGhpZ2gpIC8gMik7XG5cdFx0XHRpZiAoZW50cmllc1ttaWRdLnRvcCA8IG9mZnNldCkge1xuXHRcdFx0XHRsb3cgPSBtaWQgKyAxO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aGlnaCA9IG1pZDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGxvdztcblx0fVxuXG5cdHByaXZhdGUgZW5zdXJlQm9keUlubmVyKHN0YXRlOiBJTW9iaWxlTXVsdGlEaWZmRmlsZVN0YXRlKTogSFRNTEVsZW1lbnQge1xuXHRcdGlmIChzdGF0ZS5ib2R5SW5uZXIgJiYgc3RhdGUuYm9keUlubmVyLnBhcmVudEVsZW1lbnQgPT09IHN0YXRlLmNvbnRlbnQpIHtcblx0XHRcdHJldHVybiBzdGF0ZS5ib2R5SW5uZXI7XG5cdFx0fVxuXG5cdFx0aWYgKCFzdGF0ZS5jb250ZW50IHx8ICFzdGF0ZS5yZW5kZXJEYXRhKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCByZW5kZXIgYSBsb2FkZWQgbW9iaWxlIGRpZmYgYm9keSB3aXRob3V0IGNvbnRlbnQgYW5kIHJlbmRlciBkYXRhLicpO1xuXHRcdH1cblxuXHRcdERPTS5jbGVhck5vZGUoc3RhdGUuY29udGVudCk7XG5cdFx0dGhpcy5yZXNldEJvZHlSZW5kZXJTdGF0ZShzdGF0ZSk7XG5cdFx0Y29uc3QgaW5uZXIgPSBET00uYXBwZW5kKHN0YXRlLmNvbnRlbnQsICQoJ2Rpdi5tb2JpbGUtbXVsdGktZGlmZi1maWxlLWNvbnRlbnQtaW5uZXInKSk7XG5cdFx0aW5uZXIuc3R5bGUuaGVpZ2h0ID0gYCR7c3RhdGUucmVuZGVyRGF0YS5ib2R5SGVpZ2h0fXB4YDtcblx0XHRpbm5lci5zdHlsZS5taW5XaWR0aCA9IGBjYWxjKCR7c3RhdGUucmVuZGVyRGF0YS5tYXhMaW5lQ2hhcmFjdGVyQ291bnQgKyA4fWNoICsgNjRweClgO1xuXG5cdFx0Y29uc3QgY29sb3JNYXAgPSBUb2tlbml6YXRpb25SZWdpc3RyeS5nZXRDb2xvck1hcCgpO1xuXHRcdGlmIChjb2xvck1hcCAmJiBzdGF0ZS5yZW5kZXJEYXRhLmhhc1JlYWxUb2tlbnMpIHtcblx0XHRcdGNvbnN0IHN0eWxlRWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuXHRcdFx0c3R5bGVFbC50ZXh0Q29udGVudCA9IGdlbmVyYXRlVG9rZW5zQ1NTRm9yQ29sb3JNYXAoY29sb3JNYXApO1xuXHRcdFx0aW5uZXIuYXBwZW5kQ2hpbGQoc3R5bGVFbCk7XG5cdFx0fVxuXG5cdFx0c3RhdGUuYm9keUlubmVyID0gaW5uZXI7XG5cdFx0cmV0dXJuIGlubmVyO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNldEJvZHlSZW5kZXJTdGF0ZShzdGF0ZTogSU1vYmlsZU11bHRpRGlmZkZpbGVTdGF0ZSk6IHZvaWQge1xuXHRcdHN0YXRlLmZpbGVNZXNzYWdlID0gdW5kZWZpbmVkO1xuXHRcdHN0YXRlLmJvZHlJbm5lciA9IHVuZGVmaW5lZDtcblx0XHRzdGF0ZS5yZW5kZXJlZEJvZHlSb3dzLmNsZWFyKCk7XG5cdFx0c3RhdGUucmVuZGVyZWRCb2R5U3RhcnRJbmRleCA9IHVuZGVmaW5lZDtcblx0XHRzdGF0ZS5yZW5kZXJlZEJvZHlFbmRJbmRleCA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgcmVjb25jaWxlQm9keUVudHJpZXMoc3RhdGU6IElNb2JpbGVNdWx0aURpZmZGaWxlU3RhdGUsIHN0YXJ0SW5kZXg6IG51bWJlciwgZW5kSW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghc3RhdGUuYm9keUlubmVyIHx8ICFzdGF0ZS5yZW5kZXJEYXRhKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBbaW5kZXgsIGVsZW1lbnRdIG9mIEFycmF5LmZyb20oc3RhdGUucmVuZGVyZWRCb2R5Um93cykpIHtcblx0XHRcdGlmIChpbmRleCA8IHN0YXJ0SW5kZXggfHwgaW5kZXggPj0gZW5kSW5kZXgpIHtcblx0XHRcdFx0ZWxlbWVudC5yZW1vdmUoKTtcblx0XHRcdFx0c3RhdGUucmVuZGVyZWRCb2R5Um93cy5kZWxldGUoaW5kZXgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBydW5TdGFydDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBydW5FbmQgPSBzdGFydEluZGV4O1xuXHRcdGZvciAobGV0IGluZGV4ID0gc3RhcnRJbmRleDsgaW5kZXggPCBlbmRJbmRleDsgaW5kZXgrKykge1xuXHRcdFx0aWYgKHN0YXRlLnJlbmRlcmVkQm9keVJvd3MuaGFzKGluZGV4KSkge1xuXHRcdFx0XHRpZiAocnVuU3RhcnQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRoaXMuaW5zZXJ0Qm9keUVudHJ5UnVuKHN0YXRlLCBydW5TdGFydCwgcnVuRW5kKTtcblx0XHRcdFx0XHRydW5TdGFydCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0cnVuU3RhcnQgPz89IGluZGV4O1xuXHRcdFx0cnVuRW5kID0gaW5kZXggKyAxO1xuXHRcdH1cblxuXHRcdGlmIChydW5TdGFydCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmluc2VydEJvZHlFbnRyeVJ1bihzdGF0ZSwgcnVuU3RhcnQsIHJ1bkVuZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBpbnNlcnRCb2R5RW50cnlSdW4oc3RhdGU6IElNb2JpbGVNdWx0aURpZmZGaWxlU3RhdGUsIHN0YXJ0SW5kZXg6IG51bWJlciwgZW5kSW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghc3RhdGUuYm9keUlubmVyIHx8ICFzdGF0ZS5yZW5kZXJEYXRhKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaHRtbFBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAobGV0IGluZGV4ID0gc3RhcnRJbmRleDsgaW5kZXggPCBlbmRJbmRleDsgaW5kZXgrKykge1xuXHRcdFx0aHRtbFBhcnRzLnB1c2godGhpcy5yZW5kZXJCb2R5RW50cnlIdG1sKGluZGV4LCBzdGF0ZS5yZW5kZXJEYXRhLmJvZHlFbnRyaWVzW2luZGV4XSwgc3RhdGUucmVuZGVyRGF0YS5vcmlnTGluZXMsIHN0YXRlLnJlbmRlckRhdGEubW9kTGluZXMpKTtcblx0XHR9XG5cblx0XHRjb25zdCB0ZW1wbGF0ZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RlbXBsYXRlJyk7XG5cdFx0dGVtcGxhdGUuaW5uZXJIVE1MID0gaHRtbFBhcnRzLmpvaW4oJycpO1xuXHRcdGNvbnN0IGluc2VydGVkRWxlbWVudHMgPSBBcnJheS5mcm9tKHRlbXBsYXRlLmNvbnRlbnQuY2hpbGRyZW4pIGFzIEhUTUxFbGVtZW50W107XG5cdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIGluc2VydGVkRWxlbWVudHMpIHtcblx0XHRcdGNvbnN0IGluZGV4ID0gTnVtYmVyKGVsZW1lbnQuZGF0YXNldC5lbnRyeUluZGV4KTtcblx0XHRcdGlmIChOdW1iZXIuaXNGaW5pdGUoaW5kZXgpKSB7XG5cdFx0XHRcdHN0YXRlLnJlbmRlcmVkQm9keVJvd3Muc2V0KGluZGV4LCBlbGVtZW50KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRzdGF0ZS5ib2R5SW5uZXIuaW5zZXJ0QmVmb3JlKHRlbXBsYXRlLmNvbnRlbnQsIHRoaXMuZmluZE5leHRSZW5kZXJlZEJvZHlSb3coc3RhdGUsIGVuZEluZGV4KSk7XG5cdH1cblxuXHRwcml2YXRlIGZpbmROZXh0UmVuZGVyZWRCb2R5Um93KHN0YXRlOiBJTW9iaWxlTXVsdGlEaWZmRmlsZVN0YXRlLCBzdGFydEluZGV4OiBudW1iZXIpOiBIVE1MRWxlbWVudCB8IG51bGwge1xuXHRcdGZvciAobGV0IGluZGV4ID0gc3RhcnRJbmRleDsgaW5kZXggPCBzdGF0ZS5yZW5kZXJEYXRhIS5ib2R5RW50cmllcy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSBzdGF0ZS5yZW5kZXJlZEJvZHlSb3dzLmdldChpbmRleCk7XG5cdFx0XHRpZiAoZWxlbWVudCkge1xuXHRcdFx0XHRyZXR1cm4gZWxlbWVudDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckJvZHlFbnRyeUh0bWwoXG5cdFx0aW5kZXg6IG51bWJlcixcblx0XHRlbnRyeTogTW9iaWxlTXVsdGlEaWZmQm9keUVudHJ5LFxuXHRcdG9yaWdMaW5lSHRtbDogcmVhZG9ubHkgc3RyaW5nW10sXG5cdFx0bW9kTGluZUh0bWw6IHJlYWRvbmx5IHN0cmluZ1tdLFxuXHQpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHN0eWxlID0gYHRvcDoke2VudHJ5LnRvcH1weDtoZWlnaHQ6JHtlbnRyeS5oZWlnaHR9cHg7YDtcblx0XHRpZiAoZW50cnkudHlwZSA9PT0gJ2h1bmsnKSB7XG5cdFx0XHRyZXR1cm4gYDxkaXYgY2xhc3M9XCJtb2JpbGUtZGlmZi1odW5rLWhlYWRlciBtb2JpbGUtbXVsdGktZGlmZi1ib2R5LWVudHJ5XCIgZGF0YS1lbnRyeS1pbmRleD1cIiR7aW5kZXh9XCIgc3R5bGU9XCIke3N0eWxlfVwiPiR7dGhpcy5lc2NhcGVIdG1sKGVudHJ5LmhlYWRlcil9PC9kaXY+YDtcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lID0gZW50cnkubGluZTtcblx0XHRjb25zdCBsaW5lTnVtYmVyID0gbGluZS5saW5lTnVtICE9PSB1bmRlZmluZWQgPyBTdHJpbmcobGluZS5saW5lTnVtKSA6ICcnO1xuXHRcdGNvbnN0IGd1dHRlciA9IGxpbmUudHlwZSA9PT0gJ2FkZGVkJyA/ICcrJyA6IGxpbmUudHlwZSA9PT0gJ3JlbW92ZWQnID8gJy0nIDogJyAnO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSB0aGlzLmdldExpbmVIdG1sKGxpbmUsIG9yaWdMaW5lSHRtbCwgbW9kTGluZUh0bWwpO1xuXG5cdFx0cmV0dXJuIFtcblx0XHRcdGA8ZGl2IGNsYXNzPVwibW9iaWxlLWRpZmYtbGluZSBtb2JpbGUtbXVsdGktZGlmZi1ib2R5LWVudHJ5ICR7bGluZS50eXBlfVwiIGRhdGEtZW50cnktaW5kZXg9XCIke2luZGV4fVwiIHN0eWxlPVwiJHtzdHlsZX1cIj5gLFxuXHRcdFx0YDxzcGFuIGNsYXNzPVwibW9iaWxlLWRpZmYtbGluZS1udW1cIj4ke3RoaXMuZXNjYXBlSHRtbChsaW5lTnVtYmVyKX08L3NwYW4+YCxcblx0XHRcdGA8c3BhbiBjbGFzcz1cIm1vYmlsZS1kaWZmLWd1dHRlclwiPiR7dGhpcy5lc2NhcGVIdG1sKGd1dHRlcil9PC9zcGFuPmAsXG5cdFx0XHRgPHNwYW4gY2xhc3M9XCJtb2JpbGUtZGlmZi1jb250ZW50XCI+JHtjb250ZW50fTwvc3Bhbj5gLFxuXHRcdFx0JzwvZGl2PicsXG5cdFx0XS5qb2luKCcnKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TGluZUh0bWwobGluZTogSURpZmZMaW5lLCBvcmlnTGluZUh0bWw6IHJlYWRvbmx5IHN0cmluZ1tdLCBtb2RMaW5lSHRtbDogcmVhZG9ubHkgc3RyaW5nW10pOiBzdHJpbmcge1xuXHRcdGlmIChsaW5lLmxpbmVOdW0gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3Qgc291cmNlID0gbGluZS50eXBlID09PSAnYWRkZWQnID8gbW9kTGluZUh0bWwgOiBvcmlnTGluZUh0bWw7XG5cdFx0XHRjb25zdCBodG1sID0gc291cmNlW2xpbmUubGluZU51bSAtIDFdO1xuXHRcdFx0aWYgKGh0bWwgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gaHRtbDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZXNjYXBlSHRtbChsaW5lLnRleHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBlc2NhcGVIdG1sKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiB2YWx1ZS5yZXBsYWNlKC9bJjw+XCInXS9nLCBjaGFyID0+IHtcblx0XHRcdHN3aXRjaCAoY2hhcikge1xuXHRcdFx0XHRjYXNlICcmJzogcmV0dXJuICcmYW1wOyc7XG5cdFx0XHRcdGNhc2UgJzwnOiByZXR1cm4gJyZsdDsnO1xuXHRcdFx0XHRjYXNlICc+JzogcmV0dXJuICcmZ3Q7Jztcblx0XHRcdFx0Y2FzZSAnXCInOiByZXR1cm4gJyZxdW90Oyc7XG5cdFx0XHRcdGNhc2UgJ1xcJyc6IHJldHVybiAnJiMzOTsnO1xuXHRcdFx0XHRkZWZhdWx0OiByZXR1cm4gY2hhcjtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NlZCA9IHRydWU7XG5cdFx0aWYgKHRoaXMubGF5b3V0QW5pbWF0aW9uRnJhbWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0RE9NLmdldFdpbmRvdyh0aGlzLnNjcm9sbFdyYXBwZXIpLmNhbmNlbEFuaW1hdGlvbkZyYW1lKHRoaXMubGF5b3V0QW5pbWF0aW9uRnJhbWUpO1xuXHRcdFx0dGhpcy5sYXlvdXRBbmltYXRpb25GcmFtZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHRoaXMubG9hZFZpc2libGVBbmltYXRpb25GcmFtZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmNhbmNlbFNjaGVkdWxlZExvYWRWaXNpYmxlRmlsZXMoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMucHJlZmV0Y2hBbmltYXRpb25GcmFtZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmNhbmNlbFNjaGVkdWxlZFByZWZldGNoRmlsZSgpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHN0YXRlIG9mIHRoaXMuZmlsZVN0YXRlcykge1xuXHRcdFx0dGhpcy5kaXNwb3NlRmlsZVNlY3Rpb24oc3RhdGUpO1xuXHRcdH1cblx0XHR0aGlzLm1vdW50ZWRJbmRleGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fb25EaWREaXNwb3NlLmZpcmUoKTtcblx0XHR0aGlzLnZpZXdTdG9yZS5kaXNwb3NlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPO0FB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
