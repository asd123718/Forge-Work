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
import "./media/timelinePane.css";
import { localize, localize2 } from "../../../../nls.js";
import * as DOM from "../../../../base/browser/dom.js";
import * as css from "../../../../base/browser/cssValue.js";
import { ActionRunner } from "../../../../base/common/actions.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { fromNow } from "../../../../base/common/date.js";
import { debounce } from "../../../../base/common/decorators.js";
import { Emitter } from "../../../../base/common/event.js";
import { createMatches } from "../../../../base/common/filters.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { DisposableStore, Disposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { escapeRegExpCharacters } from "../../../../base/common/strings.js";
import { URI } from "../../../../base/common/uri.js";
import { IconLabel } from "../../../../base/browser/ui/iconLabel/iconLabel.js";
import { ViewPane } from "../../../browser/parts/views/viewPane.js";
import { WorkbenchObjectTree } from "../../../../platform/list/browser/listService.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ITimelineService } from "../common/timeline.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { SideBySideEditor, EditorResourceAccessor } from "../../../common/editor.js";
import { ICommandService, CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../common/views.js";
import { IProgressService } from "../../../../platform/progress/common/progress.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { getContextMenuActions, createActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId, registerAction2, Action2, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { isDark } from "../../../../platform/theme/common/theme.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { API_OPEN_DIFF_EDITOR_COMMAND_ID, API_OPEN_EDITOR_COMMAND_ID } from "../../../browser/parts/editor/editorCommands.js";
import { MarshalledId } from "../../../../base/common/marshallingIds.js";
import { isString } from "../../../../base/common/types.js";
import { renderAsPlaintext } from "../../../../base/browser/markdownRenderer.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IHoverService, WorkbenchHoverDelegate } from "../../../../platform/hover/browser/hover.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
const ItemHeight = 22;
function isLoadMoreCommand(item) {
  return item instanceof LoadMoreCommand;
}
function isTimelineItem(item) {
  return !!item && !item.handle.startsWith("vscode-command:");
}
function updateRelativeTime(item, lastRelativeTime) {
  item.relativeTime = isTimelineItem(item) ? fromNow(item.timestamp) : void 0;
  item.relativeTimeFullWord = isTimelineItem(item) ? fromNow(item.timestamp, false, true) : void 0;
  if (lastRelativeTime === void 0 || item.relativeTime !== lastRelativeTime) {
    lastRelativeTime = item.relativeTime;
    item.hideRelativeTime = false;
  } else {
    item.hideRelativeTime = true;
  }
  return lastRelativeTime;
}
class TimelineAggregate {
  constructor(timeline) {
    this._stale = false;
    this._requiresReset = false;
    this.source = timeline.source;
    this.items = timeline.items;
    this._cursor = timeline.paging?.cursor;
    this.lastRenderedIndex = -1;
  }
  get cursor() {
    return this._cursor;
  }
  get more() {
    return this._cursor !== void 0;
  }
  get newest() {
    return this.items[0];
  }
  get oldest() {
    return this.items[this.items.length - 1];
  }
  add(timeline, options) {
    let updated = false;
    if (timeline.items.length !== 0 && this.items.length !== 0) {
      updated = true;
      const ids = /* @__PURE__ */ new Set();
      const timestamps = /* @__PURE__ */ new Set();
      for (const item2 of timeline.items) {
        if (item2.id === void 0) {
          timestamps.add(item2.timestamp);
        } else {
          ids.add(item2.id);
        }
      }
      let i = this.items.length;
      let item;
      while (i--) {
        item = this.items[i];
        if (item.id !== void 0 && ids.has(item.id) || timestamps.has(item.timestamp)) {
          this.items.splice(i, 1);
        }
      }
      if ((timeline.items[timeline.items.length - 1]?.timestamp ?? 0) >= (this.newest?.timestamp ?? 0)) {
        this.items.splice(0, 0, ...timeline.items);
      } else {
        this.items.push(...timeline.items);
      }
    } else if (timeline.items.length !== 0) {
      updated = true;
      this.items.push(...timeline.items);
    }
    if (options.cursor !== void 0 || typeof options.limit !== "object") {
      this._cursor = timeline.paging?.cursor;
    }
    if (updated) {
      this.items.sort(
        (a, b) => b.timestamp - a.timestamp || (a.source === void 0 ? b.source === void 0 ? 0 : 1 : b.source === void 0 ? -1 : b.source.localeCompare(a.source, void 0, { numeric: true, sensitivity: "base" }))
      );
    }
    return updated;
  }
  get stale() {
    return this._stale;
  }
  get requiresReset() {
    return this._requiresReset;
  }
  invalidate(requiresReset) {
    this._stale = true;
    this._requiresReset = requiresReset;
  }
}
class LoadMoreCommand {
  constructor(loading) {
    this.handle = "vscode-command:loadMore";
    this.timestamp = 0;
    this.description = void 0;
    this.tooltip = void 0;
    this.contextValue = void 0;
    // Make things easier for duck typing
    this.id = void 0;
    this.icon = void 0;
    this.iconDark = void 0;
    this.source = void 0;
    this.relativeTime = void 0;
    this.relativeTimeFullWord = void 0;
    this.hideRelativeTime = void 0;
    this._loading = false;
    this._loading = loading;
  }
  get loading() {
    return this._loading;
  }
  set loading(value) {
    this._loading = value;
  }
  get ariaLabel() {
    return this.label;
  }
  get label() {
    return this.loading ? localize("timeline.loadingMore", "Loading...") : localize("timeline.loadMore", "Load more");
  }
  get themeIcon() {
    return void 0;
  }
}
const TimelineFollowActiveEditorContext = new RawContextKey("timelineFollowActiveEditor", true, true);
const TimelineExcludeSources = new RawContextKey("timelineExcludeSources", "[]", true);
const TimelineViewFocusedContext = new RawContextKey("timelineFocused", true);
let TimelinePane = class extends ViewPane {
  constructor(options, keybindingService, contextMenuService, contextKeyService, configurationService, storageService, viewDescriptorService, instantiationService, editorService, commandService, progressService, timelineService, openerService, themeService, hoverService, labelService, uriIdentityService, extensionService) {
    super({ ...options, titleMenuId: MenuId.TimelineTitle }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.storageService = storageService;
    this.editorService = editorService;
    this.commandService = commandService;
    this.progressService = progressService;
    this.timelineService = timelineService;
    this.labelService = labelService;
    this.uriIdentityService = uriIdentityService;
    this.extensionService = extensionService;
    this.pendingRequests = /* @__PURE__ */ new Map();
    this.timelinesBySource = /* @__PURE__ */ new Map();
    this._followActiveEditor = true;
    this._isEmpty = true;
    this._maxItemCount = 0;
    this._visibleItemCount = 0;
    this._pendingRefresh = false;
    this.commands = this._register(this.instantiationService.createInstance(TimelinePaneCommands, this));
    this.followActiveEditorContext = TimelineFollowActiveEditorContext.bindTo(this.contextKeyService);
    this.timelineExcludeSourcesContext = TimelineExcludeSources.bindTo(this.contextKeyService);
    const excludedSourcesString = storageService.get("timeline.excludeSources", StorageScope.PROFILE, "[]");
    this.timelineExcludeSourcesContext.set(excludedSourcesString);
    this.excludedSources = new Set(JSON.parse(excludedSourcesString));
    this._register(storageService.onDidChangeValue(StorageScope.PROFILE, "timeline.excludeSources", this._store)(this.onStorageServiceChanged, this));
    this._register(configurationService.onDidChangeConfiguration(this.onConfigurationChanged, this));
    this._register(timelineService.onDidChangeProviders(this.onProvidersChanged, this));
    this._register(timelineService.onDidChangeTimeline(this.onTimelineChanged, this));
    this._register(timelineService.onDidChangeUri((uri) => this.setUri(uri), this));
  }
  get followActiveEditor() {
    return this._followActiveEditor;
  }
  set followActiveEditor(value) {
    if (this._followActiveEditor === value) {
      return;
    }
    this._followActiveEditor = value;
    this.followActiveEditorContext.set(value);
    this.updateFilename(this._filename);
    if (value) {
      this.onActiveEditorChanged();
    }
  }
  get pageOnScroll() {
    if (this._pageOnScroll === void 0) {
      this._pageOnScroll = this.configurationService.getValue("timeline.pageOnScroll") ?? false;
    }
    return this._pageOnScroll;
  }
  get pageSize() {
    let pageSize = this.configurationService.getValue("timeline.pageSize");
    if (pageSize === void 0 || pageSize === null) {
      pageSize = Math.max(20, Math.floor((this.tree?.renderHeight ?? 0) / ItemHeight + (this.pageOnScroll ? 1 : -1)));
    }
    return pageSize;
  }
  reset() {
    this.loadTimeline(true);
  }
  setUri(uri) {
    this.setUriCore(uri, true);
  }
  setUriCore(uri, disableFollowing) {
    if (disableFollowing) {
      this.followActiveEditor = false;
    }
    this.uri = uri;
    this.updateFilename(uri ? this.labelService.getUriBasenameLabel(uri) : void 0);
    this.treeRenderer?.setUri(uri);
    this.loadTimeline(true);
  }
  onStorageServiceChanged() {
    const excludedSourcesString = this.storageService.get("timeline.excludeSources", StorageScope.PROFILE, "[]");
    this.timelineExcludeSourcesContext.set(excludedSourcesString);
    this.excludedSources = new Set(JSON.parse(excludedSourcesString));
    const missing = this.timelineService.getSources().filter(({ id }) => !this.excludedSources.has(id) && !this.timelinesBySource.has(id));
    if (missing.length !== 0) {
      this.loadTimeline(true, missing.map(({ id }) => id));
    } else {
      this.refresh();
    }
  }
  onConfigurationChanged(e) {
    if (e.affectsConfiguration("timeline.pageOnScroll")) {
      this._pageOnScroll = void 0;
    }
  }
  onActiveEditorChanged() {
    if (!this.followActiveEditor || !this.isExpanded()) {
      return;
    }
    const uri = EditorResourceAccessor.getOriginalUri(this.editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
    if (this.uriIdentityService.extUri.isEqual(uri, this.uri) && uri !== void 0 || // Fallback to match on fsPath if we are dealing with files or git schemes
    uri?.fsPath === this.uri?.fsPath && (uri?.scheme === Schemas.file || uri?.scheme === "git") && (this.uri?.scheme === Schemas.file || this.uri?.scheme === "git")) {
      for (const source of this.timelineService.getSources()) {
        if (this.excludedSources.has(source.id)) {
          continue;
        }
        const timeline = this.timelinesBySource.get(source.id);
        if (timeline !== void 0 && !timeline.stale) {
          continue;
        }
        if (timeline !== void 0) {
          this.updateTimeline(timeline, timeline.requiresReset);
        } else {
          this.loadTimelineForSource(source.id, uri, true);
        }
      }
      return;
    }
    this.setUriCore(uri, false);
  }
  onProvidersChanged(e) {
    if (e.removed) {
      for (const source of e.removed) {
        this.timelinesBySource.delete(source);
      }
      this.refresh();
    }
    if (e.added) {
      this.loadTimeline(true, e.added);
    }
  }
  onTimelineChanged(e) {
    if (e?.uri === void 0 || this.uriIdentityService.extUri.isEqual(URI.revive(e.uri), this.uri)) {
      const timeline = this.timelinesBySource.get(e.id);
      if (timeline === void 0) {
        return;
      }
      if (this.isBodyVisible()) {
        this.updateTimeline(timeline, e.reset);
      } else {
        timeline.invalidate(e.reset);
      }
    }
  }
  updateFilename(filename) {
    this._filename = filename;
    if (this.followActiveEditor || !filename) {
      this.updateTitleDescription(filename);
    } else {
      this.updateTitleDescription(`${filename} (pinned)`);
    }
  }
  get message() {
    return this._message;
  }
  set message(message) {
    this._message = message;
    this.updateMessage();
  }
  updateMessage() {
    if (this._message !== void 0) {
      this.showMessage(this._message);
    } else {
      this.hideMessage();
    }
  }
  showMessage(message) {
    if (!this.$message) {
      return;
    }
    this.$message.classList.remove("hide");
    this.resetMessageElement();
    this.$message.textContent = message;
  }
  hideMessage() {
    this.resetMessageElement();
    this.$message.classList.add("hide");
  }
  resetMessageElement() {
    DOM.clearNode(this.$message);
  }
  get hasVisibleItems() {
    return this._visibleItemCount > 0;
  }
  clear(cancelPending) {
    this._visibleItemCount = 0;
    this._maxItemCount = this.pageSize;
    this.timelinesBySource.clear();
    if (cancelPending) {
      for (const pendingRequest of this.pendingRequests.values()) {
        pendingRequest.request.tokenSource.cancel();
        pendingRequest.dispose();
      }
      this.pendingRequests.clear();
      if (!this.isBodyVisible() && this.tree) {
        this.tree.setChildren(null, void 0);
        this._isEmpty = true;
      }
    }
  }
  async loadTimeline(reset, sources) {
    if (sources === void 0) {
      if (reset) {
        this.clear(true);
      }
      if (this.uri?.scheme === Schemas.vscodeSettings || this.uri?.scheme === Schemas.webviewPanel || this.uri?.scheme === Schemas.walkThrough) {
        this.uri = void 0;
        this.clear(false);
        this.refresh();
        return;
      }
      if (this._isEmpty && this.uri !== void 0) {
        this.setLoadingUriMessage();
      }
    }
    if (this.uri === void 0) {
      this.clear(false);
      this.refresh();
      return;
    }
    if (!this.isBodyVisible()) {
      return;
    }
    let hasPendingRequests = false;
    for (const source of sources ?? this.timelineService.getSources().map((s) => s.id)) {
      const requested = this.loadTimelineForSource(source, this.uri, reset);
      if (requested) {
        hasPendingRequests = true;
      }
    }
    if (!hasPendingRequests) {
      this.refresh();
    } else if (this._isEmpty) {
      this.setLoadingUriMessage();
    }
  }
  loadTimelineForSource(source, uri, reset, options) {
    if (this.excludedSources.has(source)) {
      return false;
    }
    const timeline = this.timelinesBySource.get(source);
    if (!reset && options?.cursor !== void 0 && timeline !== void 0 && (!timeline?.more || timeline.items.length > timeline.lastRenderedIndex + this.pageSize)) {
      return false;
    }
    if (options === void 0) {
      if (!reset && timeline !== void 0 && timeline.items.length > 0 && !timeline.more) {
        return false;
      }
      options = { cursor: reset ? void 0 : timeline?.cursor, limit: this.pageSize };
    }
    const pendingRequest = this.pendingRequests.get(source);
    if (pendingRequest !== void 0) {
      options.cursor = pendingRequest.request.options.cursor;
      if (typeof options.limit === "number") {
        if (typeof pendingRequest.request.options.limit === "number") {
          options.limit += pendingRequest.request.options.limit;
        } else {
          options.limit = pendingRequest.request.options.limit;
        }
      }
    }
    pendingRequest?.request?.tokenSource.cancel();
    pendingRequest?.dispose();
    options.cacheResults = true;
    options.resetCache = reset;
    const tokenSource = new CancellationTokenSource();
    const newRequest = this.timelineService.getTimeline(source, uri, options, tokenSource);
    if (newRequest === void 0) {
      tokenSource.dispose();
      return false;
    }
    const disposables = new DisposableStore();
    this.pendingRequests.set(source, { request: newRequest, dispose: () => disposables.dispose() });
    disposables.add(tokenSource);
    disposables.add(tokenSource.token.onCancellationRequested(() => this.pendingRequests.delete(source)));
    this.handleRequest(newRequest);
    return true;
  }
  updateTimeline(timeline, reset) {
    if (reset) {
      this.timelinesBySource.delete(timeline.source);
      const { oldest } = timeline;
      this.loadTimelineForSource(timeline.source, this.uri, true, oldest !== void 0 ? { limit: { timestamp: oldest.timestamp, id: oldest.id } } : void 0);
    } else {
      const { newest } = timeline;
      this.loadTimelineForSource(timeline.source, this.uri, false, newest !== void 0 ? { limit: { timestamp: newest.timestamp, id: newest.id } } : { limit: this.pageSize });
    }
  }
  async handleRequest(request) {
    let response;
    try {
      response = await this.progressService.withProgress({ location: this.id }, () => request.result);
    } catch {
    }
    if (!request.tokenSource.token.isCancellationRequested) {
      this.pendingRequests.get(request.source)?.dispose();
      this.pendingRequests.delete(request.source);
    }
    if (response === void 0 || request.uri !== this.uri) {
      if (this.pendingRequests.size === 0 && this._pendingRefresh) {
        this.refresh();
      }
      return;
    }
    const source = request.source;
    let updated = false;
    const timeline = this.timelinesBySource.get(source);
    if (timeline === void 0) {
      this.timelinesBySource.set(source, new TimelineAggregate(response));
      updated = true;
    } else {
      updated = timeline.add(response, request.options);
    }
    if (updated) {
      this._pendingRefresh = true;
      if (this.hasVisibleItems && this.pendingRequests.size !== 0) {
        this.refreshDebounced();
      } else {
        this.refresh();
      }
    } else if (this.pendingRequests.size === 0) {
      if (this._pendingRefresh) {
        this.refresh();
      } else {
        this.tree.rerender();
      }
    }
  }
  *getItems() {
    let more = false;
    if (this.uri === void 0 || this.timelinesBySource.size === 0) {
      this._visibleItemCount = 0;
      return;
    }
    const maxCount = this._maxItemCount;
    let count = 0;
    if (this.timelinesBySource.size === 1) {
      const [source, timeline] = Iterable.first(this.timelinesBySource);
      timeline.lastRenderedIndex = -1;
      if (this.excludedSources.has(source)) {
        this._visibleItemCount = 0;
        return;
      }
      if (timeline.items.length !== 0) {
        this._visibleItemCount = 1;
      }
      more = timeline.more;
      let lastRelativeTime;
      for (const item of timeline.items) {
        item.relativeTime = void 0;
        item.hideRelativeTime = void 0;
        count++;
        if (count > maxCount) {
          more = true;
          break;
        }
        lastRelativeTime = updateRelativeTime(item, lastRelativeTime);
        yield { element: item };
      }
      timeline.lastRenderedIndex = count - 1;
    } else {
      let getNextMostRecentSource2 = function() {
        return sources.filter((source) => !source.nextItem.done).reduce((previous, current) => previous === void 0 || current.nextItem.value.timestamp >= previous.nextItem.value.timestamp ? current : previous, void 0);
      };
      var getNextMostRecentSource = getNextMostRecentSource2;
      const sources = [];
      let hasAnyItems = false;
      let mostRecentEnd = 0;
      for (const [source, timeline] of this.timelinesBySource) {
        timeline.lastRenderedIndex = -1;
        if (this.excludedSources.has(source) || timeline.stale) {
          continue;
        }
        if (timeline.items.length !== 0) {
          hasAnyItems = true;
        }
        if (timeline.more) {
          more = true;
          const last = timeline.items[Math.min(maxCount, timeline.items.length - 1)];
          if (last.timestamp > mostRecentEnd) {
            mostRecentEnd = last.timestamp;
          }
        }
        const iterator = timeline.items[Symbol.iterator]();
        sources.push({ timeline, iterator, nextItem: iterator.next() });
      }
      this._visibleItemCount = hasAnyItems ? 1 : 0;
      let lastRelativeTime;
      let nextSource;
      while (nextSource = getNextMostRecentSource2()) {
        nextSource.timeline.lastRenderedIndex++;
        const item = nextSource.nextItem.value;
        item.relativeTime = void 0;
        item.hideRelativeTime = void 0;
        if (item.timestamp >= mostRecentEnd) {
          count++;
          if (count > maxCount) {
            more = true;
            break;
          }
          lastRelativeTime = updateRelativeTime(item, lastRelativeTime);
          yield { element: item };
        }
        nextSource.nextItem = nextSource.iterator.next();
      }
    }
    this._visibleItemCount = count;
    if (count > 0) {
      if (more) {
        yield {
          element: new LoadMoreCommand(this.pendingRequests.size !== 0)
        };
      } else if (this.pendingRequests.size !== 0) {
        yield {
          element: new LoadMoreCommand(true)
        };
      }
    }
  }
  refresh() {
    if (!this.isBodyVisible()) {
      return;
    }
    this.tree.setChildren(null, this.getItems());
    this._isEmpty = !this.hasVisibleItems;
    if (this.uri === void 0) {
      this.updateFilename(void 0);
      this.message = localize("timeline.editorCannotProvideTimeline", "The active editor cannot provide timeline information.");
    } else if (this._isEmpty) {
      if (this.pendingRequests.size !== 0) {
        this.setLoadingUriMessage();
      } else {
        this.updateFilename(this.labelService.getUriBasenameLabel(this.uri));
        const scmProviderCount = this.contextKeyService.getContextKeyValue("scm.providerCount");
        if (this.timelineService.getSources().filter(({ id }) => !this.excludedSources.has(id)).length === 0) {
          this.message = localize("timeline.noTimelineSourcesEnabled", "All timeline sources have been filtered out.");
        } else {
          if (this.configurationService.getValue("workbench.localHistory.enabled") && !this.excludedSources.has("timeline.localHistory")) {
            this.message = localize("timeline.noLocalHistoryYet", "Local History will track recent changes as you save them unless the file has been excluded or is too large.");
          } else if (this.excludedSources.size > 0) {
            this.message = localize("timeline.noTimelineInfoFromEnabledSources", "No filtered timeline information was provided.");
          } else {
            this.message = localize("timeline.noTimelineInfo", "No timeline information was provided.");
          }
        }
        if (!scmProviderCount || scmProviderCount === 0) {
          this.message += " " + localize("timeline.noSCM", "Source Control has not been configured.");
        }
      }
    } else {
      this.updateFilename(this.labelService.getUriBasenameLabel(this.uri));
      this.message = void 0;
    }
    this._pendingRefresh = false;
  }
  refreshDebounced() {
    this.refresh();
  }
  focus() {
    super.focus();
    this.tree.domFocus();
  }
  setExpanded(expanded) {
    const changed = super.setExpanded(expanded);
    if (changed && this.isBodyVisible()) {
      if (!this.followActiveEditor) {
        this.setUriCore(this.uri, true);
      } else {
        this.onActiveEditorChanged();
      }
    }
    return changed;
  }
  setVisible(visible) {
    if (visible) {
      this.extensionService.activateByEvent("onView:timeline");
      this.visibilityDisposables?.dispose();
      this.visibilityDisposables = new DisposableStore();
      this.editorService.onDidActiveEditorChange(this.onActiveEditorChanged, this, this.visibilityDisposables);
      this.onDidFocus(() => this.refreshDebounced(), this, this.visibilityDisposables);
      super.setVisible(visible);
      this.onActiveEditorChanged();
    } else {
      this.visibilityDisposables?.dispose();
      super.setVisible(visible);
    }
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.tree.layout(height, width);
  }
  renderHeaderTitle(container) {
    super.renderHeaderTitle(container, this.title);
    container.classList.add("timeline-view");
  }
  renderBody(container) {
    super.renderBody(container);
    this.$container = container;
    container.classList.add("tree-explorer-viewlet-tree-view", "timeline-tree-view");
    this.$message = DOM.append(this.$container, DOM.$(".message"));
    this.$message.classList.add("timeline-subtle");
    this.message = localize("timeline.editorCannotProvideTimeline", "The active editor cannot provide timeline information.");
    this.$tree = document.createElement("div");
    this.$tree.classList.add("customview-tree", "file-icon-themable-tree", "hide-arrows");
    container.appendChild(this.$tree);
    this.treeRenderer = this._register(this.instantiationService.createInstance(TimelineTreeRenderer, this.commands, this.viewDescriptorService.getViewLocationById(this.id)));
    this._register(this.treeRenderer.onDidScrollToEnd((item) => {
      if (this.pageOnScroll) {
        this.loadMore(item);
      }
    }));
    this.tree = this.instantiationService.createInstance(
      WorkbenchObjectTree,
      "TimelinePane",
      this.$tree,
      new TimelineListVirtualDelegate(),
      [this.treeRenderer],
      {
        identityProvider: new TimelineIdentityProvider(),
        accessibilityProvider: {
          getAriaLabel(element) {
            if (isLoadMoreCommand(element)) {
              return element.ariaLabel;
            }
            return element.accessibilityInformation ? element.accessibilityInformation.label : localize("timeline.aria.item", "{0}: {1}", element.relativeTimeFullWord ?? "", element.label);
          },
          getRole(element) {
            if (isLoadMoreCommand(element)) {
              return "treeitem";
            }
            return element.accessibilityInformation && element.accessibilityInformation.role ? element.accessibilityInformation.role : "treeitem";
          },
          getWidgetAriaLabel() {
            return localize("timeline", "Timeline");
          }
        },
        keyboardNavigationLabelProvider: new TimelineKeyboardNavigationLabelProvider(),
        multipleSelectionSupport: false,
        overrideStyles: this.getLocationBasedColors().listOverrideStyles
      }
    );
    TimelineViewFocusedContext.bindTo(this.tree.contextKeyService);
    this._register(this.tree.onContextMenu((e) => this.onContextMenu(this.commands, e)));
    this._register(this.tree.onDidChangeSelection((e) => this.ensureValidItems()));
    this._register(this.tree.onDidOpen((e) => {
      if (!e.browserEvent || !this.ensureValidItems()) {
        return;
      }
      const selection = this.tree.getSelection();
      let item;
      if (selection.length === 1) {
        item = selection[0];
      }
      if (item === null) {
        return;
      }
      if (isTimelineItem(item)) {
        if (item.command) {
          let args = item.command.arguments ?? [];
          if (item.command.id === API_OPEN_EDITOR_COMMAND_ID || item.command.id === API_OPEN_DIFF_EDITOR_COMMAND_ID) {
            args = [...args, e];
          }
          this.commandService.executeCommand(item.command.id, ...args);
        }
      } else if (isLoadMoreCommand(item)) {
        this.loadMore(item);
      }
    }));
  }
  loadMore(item) {
    if (item.loading) {
      return;
    }
    item.loading = true;
    this.tree.rerender(item);
    if (this.pendingRequests.size !== 0) {
      return;
    }
    this._maxItemCount = this._visibleItemCount + this.pageSize;
    this.loadTimeline(false);
  }
  ensureValidItems() {
    if (!this.hasVisibleItems || !this.timelineService.getSources().some(({ id }) => !this.excludedSources.has(id) && this.timelinesBySource.has(id))) {
      this.tree.setChildren(null, void 0);
      this._isEmpty = true;
      this.setLoadingUriMessage();
      return false;
    }
    return true;
  }
  setLoadingUriMessage() {
    const file = this.uri && this.labelService.getUriBasenameLabel(this.uri);
    this.updateFilename(file);
    this.message = file ? localize("timeline.loading", "Loading timeline for {0}...", file) : "";
  }
  onContextMenu(commands, treeEvent) {
    const item = treeEvent.element;
    if (item === null) {
      return;
    }
    const event = treeEvent.browserEvent;
    event.preventDefault();
    event.stopPropagation();
    if (!this.ensureValidItems()) {
      return;
    }
    this.tree.setFocus([item]);
    const actions = commands.getItemContextActions(item);
    if (!actions.length) {
      return;
    }
    this.contextMenuService.showContextMenu({
      getAnchor: () => treeEvent.anchor,
      getActions: () => actions,
      getActionViewItem: (action) => {
        const keybinding = this.keybindingService.lookupKeybinding(action.id);
        if (keybinding) {
          return new ActionViewItem(action, action, { label: true, keybinding: keybinding.getLabel() });
        }
        return void 0;
      },
      onHide: (wasCancelled) => {
        if (wasCancelled) {
          this.tree.domFocus();
        }
      },
      getActionsContext: () => ({ uri: this.uri, item }),
      actionRunner: new TimelineActionRunner()
    });
  }
};
TimelinePane.TITLE = localize2("timeline", "Timeline");
__decorateClass([
  debounce(500)
], TimelinePane.prototype, "refreshDebounced", 1);
TimelinePane = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IViewDescriptorService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IEditorService),
  __decorateParam(9, ICommandService),
  __decorateParam(10, IProgressService),
  __decorateParam(11, ITimelineService),
  __decorateParam(12, IOpenerService),
  __decorateParam(13, IThemeService),
  __decorateParam(14, IHoverService),
  __decorateParam(15, ILabelService),
  __decorateParam(16, IUriIdentityService),
  __decorateParam(17, IExtensionService)
], TimelinePane);
class TimelineElementTemplate {
  constructor(container, actionViewItemProvider, hoverDelegate) {
    container.classList.add("custom-view-tree-node-item");
    this.icon = DOM.append(container, DOM.$(".custom-view-tree-node-item-icon"));
    this.iconLabel = new IconLabel(container, { supportHighlights: true, supportIcons: true, hoverDelegate });
    const timestampContainer = DOM.append(this.iconLabel.element, DOM.$(".timeline-timestamp-container"));
    this.timestamp = DOM.append(timestampContainer, DOM.$("span.timeline-timestamp"));
    const actionsContainer = DOM.append(this.iconLabel.element, DOM.$(".actions"));
    this.actionBar = new ActionBar(actionsContainer, { actionViewItemProvider });
  }
  dispose() {
    this.iconLabel.dispose();
    this.actionBar.dispose();
  }
  reset() {
    this.icon.className = "";
    this.icon.style.backgroundImage = "";
    this.actionBar.clear();
  }
}
TimelineElementTemplate.id = "TimelineElementTemplate";
class TimelineIdentityProvider {
  getId(item) {
    return item.handle;
  }
}
class TimelineActionRunner extends ActionRunner {
  async runAction(action, { uri, item }) {
    if (!isTimelineItem(item)) {
      await action.run();
      return;
    }
    await action.run(
      {
        $mid: MarshalledId.TimelineActionContext,
        handle: item.handle,
        source: item.source,
        uri
      },
      uri,
      item.source
    );
  }
}
class TimelineKeyboardNavigationLabelProvider {
  getKeyboardNavigationLabel(element) {
    return element.label;
  }
}
class TimelineListVirtualDelegate {
  getHeight(_element) {
    return ItemHeight;
  }
  getTemplateId(element) {
    return TimelineElementTemplate.id;
  }
}
let TimelineTreeRenderer = class extends Disposable {
  constructor(commands, viewContainerLocation, instantiationService, themeService) {
    super();
    this.commands = commands;
    this.viewContainerLocation = viewContainerLocation;
    this.instantiationService = instantiationService;
    this.themeService = themeService;
    this._onDidScrollToEnd = this._register(new Emitter());
    this.onDidScrollToEnd = this._onDidScrollToEnd.event;
    this.templateId = TimelineElementTemplate.id;
    this.actionViewItemProvider = createActionViewItem.bind(void 0, this.instantiationService);
    this._hoverDelegate = this.instantiationService.createInstance(
      WorkbenchHoverDelegate,
      this.viewContainerLocation === ViewContainerLocation.Panel ? "mouse" : "element",
      {
        instantHover: this.viewContainerLocation !== ViewContainerLocation.Panel
      },
      {
        position: {
          hoverPosition: HoverPosition.RIGHT
          // Will flip when there's no space
        }
      }
    );
  }
  setUri(uri) {
    this.uri = uri;
  }
  renderTemplate(container) {
    return new TimelineElementTemplate(container, this.actionViewItemProvider, this._hoverDelegate);
  }
  renderElement(node, index, template) {
    template.reset();
    const { element: item } = node;
    const theme = this.themeService.getColorTheme();
    const icon = isDark(theme.type) ? item.iconDark : item.icon;
    const iconUrl = icon ? URI.revive(icon) : null;
    if (iconUrl) {
      template.icon.className = "custom-view-tree-node-item-icon";
      template.icon.style.backgroundImage = css.asCSSUrl(iconUrl);
      template.icon.style.color = "";
    } else if (item.themeIcon) {
      template.icon.className = `custom-view-tree-node-item-icon ${ThemeIcon.asClassName(item.themeIcon)}`;
      if (item.themeIcon.color) {
        template.icon.style.color = theme.getColor(item.themeIcon.color.id)?.toString() ?? "";
      } else {
        template.icon.style.color = "";
      }
      template.icon.style.backgroundImage = "";
    } else {
      template.icon.className = "custom-view-tree-node-item-icon";
      template.icon.style.backgroundImage = "";
      template.icon.style.color = "";
    }
    const tooltip = item.tooltip ? isString(item.tooltip) ? item.tooltip : { markdown: item.tooltip, markdownNotSupportedFallback: renderAsPlaintext(item.tooltip) } : void 0;
    template.iconLabel.setLabel(item.label, item.description, {
      title: tooltip,
      matches: createMatches(node.filterData)
    });
    template.timestamp.textContent = item.relativeTime ?? "";
    template.timestamp.ariaLabel = item.relativeTimeFullWord ?? "";
    template.timestamp.parentElement.classList.toggle("timeline-timestamp--duplicate", isTimelineItem(item) && item.hideRelativeTime);
    template.actionBar.context = { uri: this.uri, item };
    template.actionBar.actionRunner = new TimelineActionRunner();
    template.actionBar.push(this.commands.getItemActions(item), { icon: true, label: false });
    if (isLoadMoreCommand(item)) {
      setTimeout(() => this._onDidScrollToEnd.fire(item), 0);
    }
  }
  disposeElement(element, index, templateData) {
    templateData.actionBar.actionRunner.dispose();
  }
  disposeTemplate(template) {
    template.dispose();
  }
};
TimelineTreeRenderer = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IThemeService)
], TimelineTreeRenderer);
const timelineRefresh = registerIcon("timeline-refresh", Codicon.refresh, localize("timelineRefresh", "Icon for the refresh timeline action."));
const timelinePin = registerIcon("timeline-pin", Codicon.pin, localize("timelinePin", "Icon for the pin timeline action."));
const timelineUnpin = registerIcon("timeline-unpin", Codicon.pinned, localize("timelineUnpin", "Icon for the unpin timeline action."));
let TimelinePaneCommands = class extends Disposable {
  constructor(pane, timelineService, storageService, contextKeyService, menuService) {
    super();
    this.pane = pane;
    this.timelineService = timelineService;
    this.storageService = storageService;
    this.contextKeyService = contextKeyService;
    this.menuService = menuService;
    this._register(this.sourceDisposables = new DisposableStore());
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "timeline.refresh",
          title: localize2("refresh", "Refresh"),
          icon: timelineRefresh,
          category: localize2("timeline", "Timeline"),
          menu: {
            id: MenuId.TimelineTitle,
            group: "navigation",
            order: 99
          }
        });
      }
      run(accessor, ...args) {
        pane.reset();
      }
    }));
    this._register(CommandsRegistry.registerCommand(
      "timeline.toggleFollowActiveEditor",
      (accessor, ...args) => pane.followActiveEditor = !pane.followActiveEditor
    ));
    this._register(MenuRegistry.appendMenuItem(MenuId.TimelineTitle, {
      command: {
        id: "timeline.toggleFollowActiveEditor",
        title: localize2("timeline.toggleFollowActiveEditorCommand.follow", "Pin the Current Timeline"),
        icon: timelinePin,
        category: localize2("timeline", "Timeline")
      },
      group: "navigation",
      order: 98,
      when: TimelineFollowActiveEditorContext
    }));
    this._register(MenuRegistry.appendMenuItem(MenuId.TimelineTitle, {
      command: {
        id: "timeline.toggleFollowActiveEditor",
        title: localize2("timeline.toggleFollowActiveEditorCommand.unfollow", "Unpin the Current Timeline"),
        icon: timelineUnpin,
        category: localize2("timeline", "Timeline")
      },
      group: "navigation",
      order: 98,
      when: TimelineFollowActiveEditorContext.toNegated()
    }));
    this._register(timelineService.onDidChangeProviders(() => this.updateTimelineSourceFilters()));
    this.updateTimelineSourceFilters();
  }
  getItemActions(element) {
    return this.getActions(MenuId.TimelineItemContext, { key: "timelineItem", value: element.contextValue }).primary;
  }
  getItemContextActions(element) {
    return this.getActions(MenuId.TimelineItemContext, { key: "timelineItem", value: element.contextValue }).secondary;
  }
  getActions(menuId, context) {
    const contextKeyService = this.contextKeyService.createOverlay([
      ["view", this.pane.id],
      [context.key, context.value]
    ]);
    const menu = this.menuService.getMenuActions(menuId, contextKeyService, { shouldForwardArgs: true });
    return getContextMenuActions(menu, "inline");
  }
  updateTimelineSourceFilters() {
    this.sourceDisposables.clear();
    const excluded = new Set(JSON.parse(this.storageService.get("timeline.excludeSources", StorageScope.PROFILE, "[]")));
    for (const source of this.timelineService.getSources()) {
      this.sourceDisposables.add(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: `timeline.toggleExcludeSource:${source.id}`,
            title: source.label,
            menu: {
              id: MenuId.TimelineFilterSubMenu,
              group: "navigation"
            },
            toggled: ContextKeyExpr.regex(`timelineExcludeSources`, new RegExp(`\\b${escapeRegExpCharacters(source.id)}\\b`)).negate()
          });
        }
        run(accessor, ...args) {
          if (!excluded.delete(source.id)) {
            excluded.add(source.id);
          }
          const storageService = accessor.get(IStorageService);
          storageService.store("timeline.excludeSources", JSON.stringify([...excluded.keys()]), StorageScope.PROFILE, StorageTarget.USER);
        }
      }));
    }
  }
};
TimelinePaneCommands = __decorateClass([
  __decorateParam(1, ITimelineService),
  __decorateParam(2, IStorageService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IMenuService)
], TimelinePaneCommands);
export {
  TimelineExcludeSources,
  TimelineFollowActiveEditorContext,
  TimelineIdentityProvider,
  TimelineKeyboardNavigationLabelProvider,
  TimelineListVirtualDelegate,
  TimelinePane,
  TimelineViewFocusedContext
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRpbWVsaW5lXFxicm93c2VyXFx0aW1lbGluZVBhbmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvdGltZWxpbmVQYW5lLmNzcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCAqIGFzIGNzcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvY3NzVmFsdWUuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgQWN0aW9uUnVubmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBmcm9tTm93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGF0ZS5qcyc7XG5pbXBvcnQgeyBkZWJvdW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBGdXp6eVNjb3JlLCBjcmVhdGVNYXRjaGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSWNvbkxhYmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWwuanMnO1xuaW1wb3J0IHsgSUxpc3RWaXJ0dWFsRGVsZWdhdGUsIElJZGVudGl0eVByb3ZpZGVyLCBJS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSVRyZWVOb2RlLCBJVHJlZVJlbmRlcmVyLCBJVHJlZUNvbnRleHRNZW51RXZlbnQsIElUcmVlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgVmlld1BhbmUsIElWaWV3UGFuZU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaE9iamVjdFRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5LCBJQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElUaW1lbGluZVNlcnZpY2UsIFRpbWVsaW5lQ2hhbmdlRXZlbnQsIFRpbWVsaW5lSXRlbSwgVGltZWxpbmVPcHRpb25zLCBUaW1lbGluZVByb3ZpZGVyc0NoYW5nZUV2ZW50LCBUaW1lbGluZVJlcXVlc3QsIFRpbWVsaW5lIH0gZnJvbSAnLi4vY29tbW9uL3RpbWVsaW5lLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNpZGVCeVNpZGVFZGl0b3IsIEVkaXRvclJlc291cmNlQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSwgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIsIElBY3Rpb25WaWV3SXRlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgZ2V0Q29udGV4dE1lbnVBY3Rpb25zLCBjcmVhdGVBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yLCBBY3Rpb24yLCBNZW51UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgaXNEYXJrIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEFQSV9PUEVOX0RJRkZfRURJVE9SX0NPTU1BTkRfSUQsIEFQSV9PUEVOX0VESVRPUl9DT01NQU5EX0lEIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmdJZHMuanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyByZW5kZXJBc1BsYWludGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGUuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IEFyaWFSb2xlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBJTG9jYWxpemVkU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb24uanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSwgV29ya2JlbmNoSG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSG92ZXJQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlcldpZGdldC5qcyc7XG5cbmNvbnN0IEl0ZW1IZWlnaHQgPSAyMjtcblxudHlwZSBUcmVlRWxlbWVudCA9IFRpbWVsaW5lSXRlbSB8IExvYWRNb3JlQ29tbWFuZDtcblxuZnVuY3Rpb24gaXNMb2FkTW9yZUNvbW1hbmQoaXRlbTogVHJlZUVsZW1lbnQgfCB1bmRlZmluZWQpOiBpdGVtIGlzIExvYWRNb3JlQ29tbWFuZCB7XG5cdHJldHVybiBpdGVtIGluc3RhbmNlb2YgTG9hZE1vcmVDb21tYW5kO1xufVxuXG5mdW5jdGlvbiBpc1RpbWVsaW5lSXRlbShpdGVtOiBUcmVlRWxlbWVudCB8IHVuZGVmaW5lZCk6IGl0ZW0gaXMgVGltZWxpbmVJdGVtIHtcblx0cmV0dXJuICEhaXRlbSAmJiAhaXRlbS5oYW5kbGUuc3RhcnRzV2l0aCgndnNjb2RlLWNvbW1hbmQ6Jyk7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVJlbGF0aXZlVGltZShpdGVtOiBUaW1lbGluZUl0ZW0sIGxhc3RSZWxhdGl2ZVRpbWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGl0ZW0ucmVsYXRpdmVUaW1lID0gaXNUaW1lbGluZUl0ZW0oaXRlbSkgPyBmcm9tTm93KGl0ZW0udGltZXN0YW1wKSA6IHVuZGVmaW5lZDtcblx0aXRlbS5yZWxhdGl2ZVRpbWVGdWxsV29yZCA9IGlzVGltZWxpbmVJdGVtKGl0ZW0pID8gZnJvbU5vdyhpdGVtLnRpbWVzdGFtcCwgZmFsc2UsIHRydWUpIDogdW5kZWZpbmVkO1xuXHRpZiAobGFzdFJlbGF0aXZlVGltZSA9PT0gdW5kZWZpbmVkIHx8IGl0ZW0ucmVsYXRpdmVUaW1lICE9PSBsYXN0UmVsYXRpdmVUaW1lKSB7XG5cdFx0bGFzdFJlbGF0aXZlVGltZSA9IGl0ZW0ucmVsYXRpdmVUaW1lO1xuXHRcdGl0ZW0uaGlkZVJlbGF0aXZlVGltZSA9IGZhbHNlO1xuXHR9IGVsc2Uge1xuXHRcdGl0ZW0uaGlkZVJlbGF0aXZlVGltZSA9IHRydWU7XG5cdH1cblxuXHRyZXR1cm4gbGFzdFJlbGF0aXZlVGltZTtcbn1cblxuaW50ZXJmYWNlIFRpbWVsaW5lQWN0aW9uQ29udGV4dCB7XG5cdHVyaTogVVJJIHwgdW5kZWZpbmVkO1xuXHRpdGVtOiBUcmVlRWxlbWVudDtcbn1cblxuY2xhc3MgVGltZWxpbmVBZ2dyZWdhdGUge1xuXHRyZWFkb25seSBpdGVtczogVGltZWxpbmVJdGVtW107XG5cdHJlYWRvbmx5IHNvdXJjZTogc3RyaW5nO1xuXG5cdGxhc3RSZW5kZXJlZEluZGV4OiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IodGltZWxpbmU6IFRpbWVsaW5lKSB7XG5cdFx0dGhpcy5zb3VyY2UgPSB0aW1lbGluZS5zb3VyY2U7XG5cdFx0dGhpcy5pdGVtcyA9IHRpbWVsaW5lLml0ZW1zO1xuXHRcdHRoaXMuX2N1cnNvciA9IHRpbWVsaW5lLnBhZ2luZz8uY3Vyc29yO1xuXHRcdHRoaXMubGFzdFJlbmRlcmVkSW5kZXggPSAtMTtcblx0fVxuXG5cdHByaXZhdGUgX2N1cnNvcj86IHN0cmluZztcblx0Z2V0IGN1cnNvcigpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jdXJzb3I7XG5cdH1cblxuXHRnZXQgbW9yZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY3Vyc29yICE9PSB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgbmV3ZXN0KCk6IFRpbWVsaW5lSXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuaXRlbXNbMF07XG5cdH1cblxuXHRnZXQgb2xkZXN0KCk6IFRpbWVsaW5lSXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuaXRlbXNbdGhpcy5pdGVtcy5sZW5ndGggLSAxXTtcblx0fVxuXG5cdGFkZCh0aW1lbGluZTogVGltZWxpbmUsIG9wdGlvbnM6IFRpbWVsaW5lT3B0aW9ucykge1xuXHRcdGxldCB1cGRhdGVkID0gZmFsc2U7XG5cblx0XHRpZiAodGltZWxpbmUuaXRlbXMubGVuZ3RoICE9PSAwICYmIHRoaXMuaXRlbXMubGVuZ3RoICE9PSAwKSB7XG5cdFx0XHR1cGRhdGVkID0gdHJ1ZTtcblxuXHRcdFx0Y29uc3QgaWRzID0gbmV3IFNldCgpO1xuXHRcdFx0Y29uc3QgdGltZXN0YW1wcyA9IG5ldyBTZXQoKTtcblxuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIHRpbWVsaW5lLml0ZW1zKSB7XG5cdFx0XHRcdGlmIChpdGVtLmlkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aW1lc3RhbXBzLmFkZChpdGVtLnRpbWVzdGFtcCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0aWRzLmFkZChpdGVtLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZW1vdmUgYW55IGR1cGxpY2F0ZSBpdGVtc1xuXHRcdFx0bGV0IGkgPSB0aGlzLml0ZW1zLmxlbmd0aDtcblx0XHRcdGxldCBpdGVtO1xuXHRcdFx0d2hpbGUgKGktLSkge1xuXHRcdFx0XHRpdGVtID0gdGhpcy5pdGVtc1tpXTtcblx0XHRcdFx0aWYgKChpdGVtLmlkICE9PSB1bmRlZmluZWQgJiYgaWRzLmhhcyhpdGVtLmlkKSkgfHwgdGltZXN0YW1wcy5oYXMoaXRlbS50aW1lc3RhbXApKSB7XG5cdFx0XHRcdFx0dGhpcy5pdGVtcy5zcGxpY2UoaSwgMSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKCh0aW1lbGluZS5pdGVtc1t0aW1lbGluZS5pdGVtcy5sZW5ndGggLSAxXT8udGltZXN0YW1wID8/IDApID49ICh0aGlzLm5ld2VzdD8udGltZXN0YW1wID8/IDApKSB7XG5cdFx0XHRcdHRoaXMuaXRlbXMuc3BsaWNlKDAsIDAsIC4uLnRpbWVsaW5lLml0ZW1zKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuaXRlbXMucHVzaCguLi50aW1lbGluZS5pdGVtcyk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICh0aW1lbGluZS5pdGVtcy5sZW5ndGggIT09IDApIHtcblx0XHRcdHVwZGF0ZWQgPSB0cnVlO1xuXG5cdFx0XHR0aGlzLml0ZW1zLnB1c2goLi4udGltZWxpbmUuaXRlbXMpO1xuXHRcdH1cblxuXHRcdC8vIElmIHdlIGFyZSBub3QgcmVxdWVzdGluZyBtb3JlIHJlY2VudCBpdGVtcyB0aGFuIHdlIGhhdmUsIHRoZW4gdXBkYXRlIHRoZSBjdXJzb3Jcblx0XHRpZiAob3B0aW9ucy5jdXJzb3IgIT09IHVuZGVmaW5lZCB8fCB0eXBlb2Ygb3B0aW9ucy5saW1pdCAhPT0gJ29iamVjdCcpIHtcblx0XHRcdHRoaXMuX2N1cnNvciA9IHRpbWVsaW5lLnBhZ2luZz8uY3Vyc29yO1xuXHRcdH1cblxuXHRcdGlmICh1cGRhdGVkKSB7XG5cdFx0XHR0aGlzLml0ZW1zLnNvcnQoXG5cdFx0XHRcdChhLCBiKSA9PlxuXHRcdFx0XHRcdChiLnRpbWVzdGFtcCAtIGEudGltZXN0YW1wKSB8fFxuXHRcdFx0XHRcdChhLnNvdXJjZSA9PT0gdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHQ/IGIuc291cmNlID09PSB1bmRlZmluZWQgPyAwIDogMVxuXHRcdFx0XHRcdFx0OiBiLnNvdXJjZSA9PT0gdW5kZWZpbmVkID8gLTEgOiBiLnNvdXJjZS5sb2NhbGVDb21wYXJlKGEuc291cmNlLCB1bmRlZmluZWQsIHsgbnVtZXJpYzogdHJ1ZSwgc2Vuc2l0aXZpdHk6ICdiYXNlJyB9KSlcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVwZGF0ZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9zdGFsZSA9IGZhbHNlO1xuXHRnZXQgc3RhbGUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0YWxlO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVxdWlyZXNSZXNldCA9IGZhbHNlO1xuXHRnZXQgcmVxdWlyZXNSZXNldCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVxdWlyZXNSZXNldDtcblx0fVxuXG5cdGludmFsaWRhdGUocmVxdWlyZXNSZXNldDogYm9vbGVhbikge1xuXHRcdHRoaXMuX3N0YWxlID0gdHJ1ZTtcblx0XHR0aGlzLl9yZXF1aXJlc1Jlc2V0ID0gcmVxdWlyZXNSZXNldDtcblx0fVxufVxuXG5jbGFzcyBMb2FkTW9yZUNvbW1hbmQge1xuXHRyZWFkb25seSBoYW5kbGUgPSAndnNjb2RlLWNvbW1hbmQ6bG9hZE1vcmUnO1xuXHRyZWFkb25seSB0aW1lc3RhbXAgPSAwO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbiA9IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgdG9vbHRpcCA9IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgY29udGV4dFZhbHVlID0gdW5kZWZpbmVkO1xuXHQvLyBNYWtlIHRoaW5ncyBlYXNpZXIgZm9yIGR1Y2sgdHlwaW5nXG5cdHJlYWRvbmx5IGlkID0gdW5kZWZpbmVkO1xuXHRyZWFkb25seSBpY29uID0gdW5kZWZpbmVkO1xuXHRyZWFkb25seSBpY29uRGFyayA9IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgc291cmNlID0gdW5kZWZpbmVkO1xuXHRyZWFkb25seSByZWxhdGl2ZVRpbWUgPSB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHJlbGF0aXZlVGltZUZ1bGxXb3JkID0gdW5kZWZpbmVkO1xuXHRyZWFkb25seSBoaWRlUmVsYXRpdmVUaW1lID0gdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKGxvYWRpbmc6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9sb2FkaW5nID0gbG9hZGluZztcblx0fVxuXHRwcml2YXRlIF9sb2FkaW5nOiBib29sZWFuID0gZmFsc2U7XG5cdGdldCBsb2FkaW5nKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9sb2FkaW5nO1xuXHR9XG5cdHNldCBsb2FkaW5nKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fbG9hZGluZyA9IHZhbHVlO1xuXHR9XG5cblx0Z2V0IGFyaWFMYWJlbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5sYWJlbDtcblx0fVxuXG5cdGdldCBsYWJlbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5sb2FkaW5nID8gbG9jYWxpemUoJ3RpbWVsaW5lLmxvYWRpbmdNb3JlJywgXCJMb2FkaW5nLi4uXCIpIDogbG9jYWxpemUoJ3RpbWVsaW5lLmxvYWRNb3JlJywgXCJMb2FkIG1vcmVcIik7XG5cdH1cblxuXHRnZXQgdGhlbWVJY29uKCk6IFRoZW1lSWNvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgVGltZWxpbmVGb2xsb3dBY3RpdmVFZGl0b3JDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3RpbWVsaW5lRm9sbG93QWN0aXZlRWRpdG9yJywgdHJ1ZSwgdHJ1ZSk7XG5leHBvcnQgY29uc3QgVGltZWxpbmVFeGNsdWRlU291cmNlcyA9IG5ldyBSYXdDb250ZXh0S2V5PHN0cmluZz4oJ3RpbWVsaW5lRXhjbHVkZVNvdXJjZXMnLCAnW10nLCB0cnVlKTtcbmV4cG9ydCBjb25zdCBUaW1lbGluZVZpZXdGb2N1c2VkQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCd0aW1lbGluZUZvY3VzZWQnLCB0cnVlKTtcblxuaW50ZXJmYWNlIElQZW5kaW5nUmVxdWVzdCBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgcmVxdWVzdDogVGltZWxpbmVSZXF1ZXN0O1xufVxuXG5leHBvcnQgY2xhc3MgVGltZWxpbmVQYW5lIGV4dGVuZHMgVmlld1BhbmUge1xuXHRzdGF0aWMgcmVhZG9ubHkgVElUTEU6IElMb2NhbGl6ZWRTdHJpbmcgPSBsb2NhbGl6ZTIoJ3RpbWVsaW5lJywgXCJUaW1lbGluZVwiKTtcblxuXHRwcml2YXRlICRjb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSAkbWVzc2FnZSE6IEhUTUxEaXZFbGVtZW50O1xuXHRwcml2YXRlICR0cmVlITogSFRNTERpdkVsZW1lbnQ7XG5cdHByaXZhdGUgdHJlZSE6IFdvcmtiZW5jaE9iamVjdFRyZWU8VHJlZUVsZW1lbnQsIEZ1enp5U2NvcmU+O1xuXHRwcml2YXRlIHRyZWVSZW5kZXJlcjogVGltZWxpbmVUcmVlUmVuZGVyZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY29tbWFuZHM6IFRpbWVsaW5lUGFuZUNvbW1hbmRzO1xuXHRwcml2YXRlIHZpc2liaWxpdHlEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgZm9sbG93QWN0aXZlRWRpdG9yQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgdGltZWxpbmVFeGNsdWRlU291cmNlc0NvbnRleHQ6IElDb250ZXh0S2V5PHN0cmluZz47XG5cblx0cHJpdmF0ZSBleGNsdWRlZFNvdXJjZXM6IFNldDxzdHJpbmc+O1xuXHRwcml2YXRlIHBlbmRpbmdSZXF1ZXN0cyA9IG5ldyBNYXA8c3RyaW5nLCBJUGVuZGluZ1JlcXVlc3Q+KCk7XG5cdHByaXZhdGUgdGltZWxpbmVzQnlTb3VyY2UgPSBuZXcgTWFwPHN0cmluZywgVGltZWxpbmVBZ2dyZWdhdGU+KCk7XG5cblx0cHJpdmF0ZSB1cmk6IFVSSSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJVmlld1BhbmVPcHRpb25zLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcm90ZWN0ZWQgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcm90ZWN0ZWQgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0XHRASVRpbWVsaW5lU2VydmljZSBwcm90ZWN0ZWQgdGltZWxpbmVTZXJ2aWNlOiBJVGltZWxpbmVTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih7IC4uLm9wdGlvbnMsIHRpdGxlTWVudUlkOiBNZW51SWQuVGltZWxpbmVUaXRsZSB9LCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHZpZXdEZXNjcmlwdG9yU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIHRoZW1lU2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblxuXHRcdHRoaXMuY29tbWFuZHMgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRpbWVsaW5lUGFuZUNvbW1hbmRzLCB0aGlzKSk7XG5cblx0XHR0aGlzLmZvbGxvd0FjdGl2ZUVkaXRvckNvbnRleHQgPSBUaW1lbGluZUZvbGxvd0FjdGl2ZUVkaXRvckNvbnRleHQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMudGltZWxpbmVFeGNsdWRlU291cmNlc0NvbnRleHQgPSBUaW1lbGluZUV4Y2x1ZGVTb3VyY2VzLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGV4Y2x1ZGVkU291cmNlc1N0cmluZyA9IHN0b3JhZ2VTZXJ2aWNlLmdldCgndGltZWxpbmUuZXhjbHVkZVNvdXJjZXMnLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgJ1tdJyk7XG5cdFx0dGhpcy50aW1lbGluZUV4Y2x1ZGVTb3VyY2VzQ29udGV4dC5zZXQoZXhjbHVkZWRTb3VyY2VzU3RyaW5nKTtcblx0XHR0aGlzLmV4Y2x1ZGVkU291cmNlcyA9IG5ldyBTZXQoSlNPTi5wYXJzZShleGNsdWRlZFNvdXJjZXNTdHJpbmcpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHN0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLlBST0ZJTEUsICd0aW1lbGluZS5leGNsdWRlU291cmNlcycsIHRoaXMuX3N0b3JlKSh0aGlzLm9uU3RvcmFnZVNlcnZpY2VDaGFuZ2VkLCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKHRoaXMub25Db25maWd1cmF0aW9uQ2hhbmdlZCwgdGhpcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRpbWVsaW5lU2VydmljZS5vbkRpZENoYW5nZVByb3ZpZGVycyh0aGlzLm9uUHJvdmlkZXJzQ2hhbmdlZCwgdGhpcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRpbWVsaW5lU2VydmljZS5vbkRpZENoYW5nZVRpbWVsaW5lKHRoaXMub25UaW1lbGluZUNoYW5nZWQsIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aW1lbGluZVNlcnZpY2Uub25EaWRDaGFuZ2VVcmkodXJpID0+IHRoaXMuc2V0VXJpKHVyaSksIHRoaXMpKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZvbGxvd0FjdGl2ZUVkaXRvcjogYm9vbGVhbiA9IHRydWU7XG5cdGdldCBmb2xsb3dBY3RpdmVFZGl0b3IoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZvbGxvd0FjdGl2ZUVkaXRvcjtcblx0fVxuXHRzZXQgZm9sbG93QWN0aXZlRWRpdG9yKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMuX2ZvbGxvd0FjdGl2ZUVkaXRvciA9PT0gdmFsdWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9mb2xsb3dBY3RpdmVFZGl0b3IgPSB2YWx1ZTtcblx0XHR0aGlzLmZvbGxvd0FjdGl2ZUVkaXRvckNvbnRleHQuc2V0KHZhbHVlKTtcblxuXHRcdHRoaXMudXBkYXRlRmlsZW5hbWUodGhpcy5fZmlsZW5hbWUpO1xuXG5cdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHR0aGlzLm9uQWN0aXZlRWRpdG9yQ2hhbmdlZCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3BhZ2VPblNjcm9sbDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0Z2V0IHBhZ2VPblNjcm9sbCgpIHtcblx0XHRpZiAodGhpcy5fcGFnZU9uU2Nyb2xsID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3BhZ2VPblNjcm9sbCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbiB8IG51bGwgfCB1bmRlZmluZWQ+KCd0aW1lbGluZS5wYWdlT25TY3JvbGwnKSA/PyBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fcGFnZU9uU2Nyb2xsO1xuXHR9XG5cblx0Z2V0IHBhZ2VTaXplKCkge1xuXHRcdGxldCBwYWdlU2l6ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyIHwgbnVsbCB8IHVuZGVmaW5lZD4oJ3RpbWVsaW5lLnBhZ2VTaXplJyk7XG5cdFx0aWYgKHBhZ2VTaXplID09PSB1bmRlZmluZWQgfHwgcGFnZVNpemUgPT09IG51bGwpIHtcblx0XHRcdC8vIElmIHdlIGFyZSBwYWdpbmcgd2hlbiBzY3JvbGxpbmcsIHRoZW4gYWRkIGFuIGV4dHJhIGl0ZW0gdG8gdGhlIGVuZCB0byBtYWtlIHN1cmUgdGhlIFwiTG9hZCBtb3JlXCIgaXRlbSBpcyBvdXQgb2Ygdmlld1xuXHRcdFx0cGFnZVNpemUgPSBNYXRoLm1heCgyMCwgTWF0aC5mbG9vcigoKHRoaXMudHJlZT8ucmVuZGVySGVpZ2h0ID8/IDApIC8gSXRlbUhlaWdodCkgKyAodGhpcy5wYWdlT25TY3JvbGwgPyAxIDogLTEpKSk7XG5cdFx0fVxuXHRcdHJldHVybiBwYWdlU2l6ZTtcblx0fVxuXG5cdHJlc2V0KCkge1xuXHRcdHRoaXMubG9hZFRpbWVsaW5lKHRydWUpO1xuXHR9XG5cblx0c2V0VXJpKHVyaTogVVJJKSB7XG5cdFx0dGhpcy5zZXRVcmlDb3JlKHVyaSwgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIHNldFVyaUNvcmUodXJpOiBVUkkgfCB1bmRlZmluZWQsIGRpc2FibGVGb2xsb3dpbmc6IGJvb2xlYW4pIHtcblx0XHRpZiAoZGlzYWJsZUZvbGxvd2luZykge1xuXHRcdFx0dGhpcy5mb2xsb3dBY3RpdmVFZGl0b3IgPSBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLnVyaSA9IHVyaTtcblx0XHR0aGlzLnVwZGF0ZUZpbGVuYW1lKHVyaSA/IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUJhc2VuYW1lTGFiZWwodXJpKSA6IHVuZGVmaW5lZCk7XG5cdFx0dGhpcy50cmVlUmVuZGVyZXI/LnNldFVyaSh1cmkpO1xuXHRcdHRoaXMubG9hZFRpbWVsaW5lKHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBvblN0b3JhZ2VTZXJ2aWNlQ2hhbmdlZCgpIHtcblx0XHRjb25zdCBleGNsdWRlZFNvdXJjZXNTdHJpbmcgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldCgndGltZWxpbmUuZXhjbHVkZVNvdXJjZXMnLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgJ1tdJyk7XG5cdFx0dGhpcy50aW1lbGluZUV4Y2x1ZGVTb3VyY2VzQ29udGV4dC5zZXQoZXhjbHVkZWRTb3VyY2VzU3RyaW5nKTtcblx0XHR0aGlzLmV4Y2x1ZGVkU291cmNlcyA9IG5ldyBTZXQoSlNPTi5wYXJzZShleGNsdWRlZFNvdXJjZXNTdHJpbmcpKTtcblxuXHRcdGNvbnN0IG1pc3NpbmcgPSB0aGlzLnRpbWVsaW5lU2VydmljZS5nZXRTb3VyY2VzKClcblx0XHRcdC5maWx0ZXIoKHsgaWQgfSkgPT4gIXRoaXMuZXhjbHVkZWRTb3VyY2VzLmhhcyhpZCkgJiYgIXRoaXMudGltZWxpbmVzQnlTb3VyY2UuaGFzKGlkKSk7XG5cdFx0aWYgKG1pc3NpbmcubGVuZ3RoICE9PSAwKSB7XG5cdFx0XHR0aGlzLmxvYWRUaW1lbGluZSh0cnVlLCBtaXNzaW5nLm1hcCgoeyBpZCB9KSA9PiBpZCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnJlZnJlc2goKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uQ29uZmlndXJhdGlvbkNoYW5nZWQoZTogSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCkge1xuXHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCd0aW1lbGluZS5wYWdlT25TY3JvbGwnKSkge1xuXHRcdFx0dGhpcy5fcGFnZU9uU2Nyb2xsID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25BY3RpdmVFZGl0b3JDaGFuZ2VkKCkge1xuXHRcdGlmICghdGhpcy5mb2xsb3dBY3RpdmVFZGl0b3IgfHwgIXRoaXMuaXNFeHBhbmRlZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXJpID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaSh0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSk7XG5cblx0XHRpZiAoKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHVyaSwgdGhpcy51cmkpICYmIHVyaSAhPT0gdW5kZWZpbmVkKSB8fFxuXHRcdFx0Ly8gRmFsbGJhY2sgdG8gbWF0Y2ggb24gZnNQYXRoIGlmIHdlIGFyZSBkZWFsaW5nIHdpdGggZmlsZXMgb3IgZ2l0IHNjaGVtZXNcblx0XHRcdCh1cmk/LmZzUGF0aCA9PT0gdGhpcy51cmk/LmZzUGF0aCAmJiAodXJpPy5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSB8fCB1cmk/LnNjaGVtZSA9PT0gJ2dpdCcpICYmICh0aGlzLnVyaT8uc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgfHwgdGhpcy51cmk/LnNjaGVtZSA9PT0gJ2dpdCcpKSkge1xuXG5cdFx0XHQvLyBJZiB0aGUgdXJpIGhhc24ndCBjaGFuZ2VkLCBtYWtlIHN1cmUgd2UgaGF2ZSB2YWxpZCBjYWNoZXNcblx0XHRcdGZvciAoY29uc3Qgc291cmNlIG9mIHRoaXMudGltZWxpbmVTZXJ2aWNlLmdldFNvdXJjZXMoKSkge1xuXHRcdFx0XHRpZiAodGhpcy5leGNsdWRlZFNvdXJjZXMuaGFzKHNvdXJjZS5pZCkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHRpbWVsaW5lID0gdGhpcy50aW1lbGluZXNCeVNvdXJjZS5nZXQoc291cmNlLmlkKTtcblx0XHRcdFx0aWYgKHRpbWVsaW5lICE9PSB1bmRlZmluZWQgJiYgIXRpbWVsaW5lLnN0YWxlKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodGltZWxpbmUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlVGltZWxpbmUodGltZWxpbmUsIHRpbWVsaW5lLnJlcXVpcmVzUmVzZXQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMubG9hZFRpbWVsaW5lRm9yU291cmNlKHNvdXJjZS5pZCwgdXJpLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5zZXRVcmlDb3JlKHVyaSwgZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBvblByb3ZpZGVyc0NoYW5nZWQoZTogVGltZWxpbmVQcm92aWRlcnNDaGFuZ2VFdmVudCkge1xuXHRcdGlmIChlLnJlbW92ZWQpIHtcblx0XHRcdGZvciAoY29uc3Qgc291cmNlIG9mIGUucmVtb3ZlZCkge1xuXHRcdFx0XHR0aGlzLnRpbWVsaW5lc0J5U291cmNlLmRlbGV0ZShzb3VyY2UpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnJlZnJlc2goKTtcblx0XHR9XG5cblx0XHRpZiAoZS5hZGRlZCkge1xuXHRcdFx0dGhpcy5sb2FkVGltZWxpbmUodHJ1ZSwgZS5hZGRlZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblRpbWVsaW5lQ2hhbmdlZChlOiBUaW1lbGluZUNoYW5nZUV2ZW50KSB7XG5cdFx0aWYgKGU/LnVyaSA9PT0gdW5kZWZpbmVkIHx8IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKFVSSS5yZXZpdmUoZS51cmkpLCB0aGlzLnVyaSkpIHtcblx0XHRcdGNvbnN0IHRpbWVsaW5lID0gdGhpcy50aW1lbGluZXNCeVNvdXJjZS5nZXQoZS5pZCk7XG5cdFx0XHRpZiAodGltZWxpbmUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLmlzQm9keVZpc2libGUoKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVRpbWVsaW5lKHRpbWVsaW5lLCBlLnJlc2V0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRpbWVsaW5lLmludmFsaWRhdGUoZS5yZXNldCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZmlsZW5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0dXBkYXRlRmlsZW5hbWUoZmlsZW5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX2ZpbGVuYW1lID0gZmlsZW5hbWU7XG5cdFx0aWYgKHRoaXMuZm9sbG93QWN0aXZlRWRpdG9yIHx8ICFmaWxlbmFtZSkge1xuXHRcdFx0dGhpcy51cGRhdGVUaXRsZURlc2NyaXB0aW9uKGZpbGVuYW1lKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy51cGRhdGVUaXRsZURlc2NyaXB0aW9uKGAke2ZpbGVuYW1lfSAocGlubmVkKWApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX21lc3NhZ2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Z2V0IG1lc3NhZ2UoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fbWVzc2FnZTtcblx0fVxuXG5cdHNldCBtZXNzYWdlKG1lc3NhZ2U6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX21lc3NhZ2UgPSBtZXNzYWdlO1xuXHRcdHRoaXMudXBkYXRlTWVzc2FnZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVNZXNzYWdlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9tZXNzYWdlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuc2hvd01lc3NhZ2UodGhpcy5fbWVzc2FnZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuaGlkZU1lc3NhZ2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNob3dNZXNzYWdlKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy4kbWVzc2FnZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLiRtZXNzYWdlLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGUnKTtcblx0XHR0aGlzLnJlc2V0TWVzc2FnZUVsZW1lbnQoKTtcblxuXHRcdHRoaXMuJG1lc3NhZ2UudGV4dENvbnRlbnQgPSBtZXNzYWdlO1xuXHR9XG5cblx0cHJpdmF0ZSBoaWRlTWVzc2FnZSgpOiB2b2lkIHtcblx0XHR0aGlzLnJlc2V0TWVzc2FnZUVsZW1lbnQoKTtcblx0XHR0aGlzLiRtZXNzYWdlLmNsYXNzTGlzdC5hZGQoJ2hpZGUnKTtcblx0fVxuXG5cdHByaXZhdGUgcmVzZXRNZXNzYWdlRWxlbWVudCgpOiB2b2lkIHtcblx0XHRET00uY2xlYXJOb2RlKHRoaXMuJG1lc3NhZ2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNFbXB0eSA9IHRydWU7XG5cdHByaXZhdGUgX21heEl0ZW1Db3VudCA9IDA7XG5cblx0cHJpdmF0ZSBfdmlzaWJsZUl0ZW1Db3VudCA9IDA7XG5cdHByaXZhdGUgZ2V0IGhhc1Zpc2libGVJdGVtcygpIHtcblx0XHRyZXR1cm4gdGhpcy5fdmlzaWJsZUl0ZW1Db3VudCA+IDA7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyKGNhbmNlbFBlbmRpbmc6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl92aXNpYmxlSXRlbUNvdW50ID0gMDtcblx0XHR0aGlzLl9tYXhJdGVtQ291bnQgPSB0aGlzLnBhZ2VTaXplO1xuXHRcdHRoaXMudGltZWxpbmVzQnlTb3VyY2UuY2xlYXIoKTtcblxuXHRcdGlmIChjYW5jZWxQZW5kaW5nKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHBlbmRpbmdSZXF1ZXN0IG9mIHRoaXMucGVuZGluZ1JlcXVlc3RzLnZhbHVlcygpKSB7XG5cdFx0XHRcdHBlbmRpbmdSZXF1ZXN0LnJlcXVlc3QudG9rZW5Tb3VyY2UuY2FuY2VsKCk7XG5cdFx0XHRcdHBlbmRpbmdSZXF1ZXN0LmRpc3Bvc2UoKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5wZW5kaW5nUmVxdWVzdHMuY2xlYXIoKTtcblxuXHRcdFx0aWYgKCF0aGlzLmlzQm9keVZpc2libGUoKSAmJiB0aGlzLnRyZWUpIHtcblx0XHRcdFx0dGhpcy50cmVlLnNldENoaWxkcmVuKG51bGwsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdHRoaXMuX2lzRW1wdHkgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbG9hZFRpbWVsaW5lKHJlc2V0OiBib29sZWFuLCBzb3VyY2VzPzogc3RyaW5nW10pIHtcblx0XHQvLyBJZiB3ZSBoYXZlIG5vIHNvdXJjZSwgd2UgYXJlIHJlc2V0dGluZyBhbGwgc291cmNlcywgc28gY2FuY2VsIGV2ZXJ5dGhpbmcgaW4gZmxpZ2h0IGFuZCByZXNldCBjYWNoZXNcblx0XHRpZiAoc291cmNlcyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRpZiAocmVzZXQpIHtcblx0XHRcdFx0dGhpcy5jbGVhcih0cnVlKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVE9ET0BlYW1vZGlvOiBBcmUgdGhlc2UgdGhlIHJpZ2h0IHRoZSBsaXN0IG9mIHNjaGVtZXMgdG8gZXhjbHVkZT8gSXMgdGhlcmUgYSBiZXR0ZXIgd2F5P1xuXHRcdFx0aWYgKHRoaXMudXJpPy5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlU2V0dGluZ3MgfHwgdGhpcy51cmk/LnNjaGVtZSA9PT0gU2NoZW1hcy53ZWJ2aWV3UGFuZWwgfHwgdGhpcy51cmk/LnNjaGVtZSA9PT0gU2NoZW1hcy53YWxrVGhyb3VnaCkge1xuXHRcdFx0XHR0aGlzLnVyaSA9IHVuZGVmaW5lZDtcblxuXHRcdFx0XHR0aGlzLmNsZWFyKGZhbHNlKTtcblx0XHRcdFx0dGhpcy5yZWZyZXNoKCk7XG5cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5faXNFbXB0eSAmJiB0aGlzLnVyaSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuc2V0TG9hZGluZ1VyaU1lc3NhZ2UoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy51cmkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5jbGVhcihmYWxzZSk7XG5cdFx0XHR0aGlzLnJlZnJlc2goKTtcblxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5pc0JvZHlWaXNpYmxlKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgaGFzUGVuZGluZ1JlcXVlc3RzID0gZmFsc2U7XG5cblx0XHRmb3IgKGNvbnN0IHNvdXJjZSBvZiBzb3VyY2VzID8/IHRoaXMudGltZWxpbmVTZXJ2aWNlLmdldFNvdXJjZXMoKS5tYXAocyA9PiBzLmlkKSkge1xuXHRcdFx0Y29uc3QgcmVxdWVzdGVkID0gdGhpcy5sb2FkVGltZWxpbmVGb3JTb3VyY2Uoc291cmNlLCB0aGlzLnVyaSwgcmVzZXQpO1xuXHRcdFx0aWYgKHJlcXVlc3RlZCkge1xuXHRcdFx0XHRoYXNQZW5kaW5nUmVxdWVzdHMgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghaGFzUGVuZGluZ1JlcXVlc3RzKSB7XG5cdFx0XHR0aGlzLnJlZnJlc2goKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2lzRW1wdHkpIHtcblx0XHRcdHRoaXMuc2V0TG9hZGluZ1VyaU1lc3NhZ2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGxvYWRUaW1lbGluZUZvclNvdXJjZShzb3VyY2U6IHN0cmluZywgdXJpOiBVUkksIHJlc2V0OiBib29sZWFuLCBvcHRpb25zPzogVGltZWxpbmVPcHRpb25zKSB7XG5cdFx0aWYgKHRoaXMuZXhjbHVkZWRTb3VyY2VzLmhhcyhzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGltZWxpbmUgPSB0aGlzLnRpbWVsaW5lc0J5U291cmNlLmdldChzb3VyY2UpO1xuXG5cdFx0Ly8gSWYgd2UgYXJlIHBhZ2luZywgYW5kIHRoZXJlIGFyZSBubyBtb3JlIGl0ZW1zIG9yIHdlIGhhdmUgZW5vdWdoIGNhY2hlZCBpdGVtcyB0byBjb3ZlciB0aGUgbmV4dCBwYWdlLFxuXHRcdC8vIGRvbid0IGJvdGhlciBxdWVyeWluZyBmb3IgbW9yZVxuXHRcdGlmIChcblx0XHRcdCFyZXNldCAmJlxuXHRcdFx0b3B0aW9ucz8uY3Vyc29yICE9PSB1bmRlZmluZWQgJiZcblx0XHRcdHRpbWVsaW5lICE9PSB1bmRlZmluZWQgJiZcblx0XHRcdCghdGltZWxpbmU/Lm1vcmUgfHwgdGltZWxpbmUuaXRlbXMubGVuZ3RoID4gdGltZWxpbmUubGFzdFJlbmRlcmVkSW5kZXggKyB0aGlzLnBhZ2VTaXplKVxuXHRcdCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGlmIChcblx0XHRcdFx0IXJlc2V0ICYmXG5cdFx0XHRcdHRpbWVsaW5lICE9PSB1bmRlZmluZWQgJiZcblx0XHRcdFx0dGltZWxpbmUuaXRlbXMubGVuZ3RoID4gMCAmJlxuXHRcdFx0XHQhdGltZWxpbmUubW9yZVxuXHRcdFx0KSB7XG5cdFx0XHRcdC8vIElmIHdlIGFyZSBub3QgcmVzZXR0aW5nLCBoYXZlIGl0ZW0ocyksIGFuZCBhbHJlYWR5IGtub3cgdGhlcmUgYXJlIG5vIG1vcmUgdG8gZmV0Y2gsIHdlJ3JlIGRvbmUgaGVyZVxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRvcHRpb25zID0geyBjdXJzb3I6IHJlc2V0ID8gdW5kZWZpbmVkIDogdGltZWxpbmU/LmN1cnNvciwgbGltaXQ6IHRoaXMucGFnZVNpemUgfTtcblx0XHR9XG5cblx0XHRjb25zdCBwZW5kaW5nUmVxdWVzdCA9IHRoaXMucGVuZGluZ1JlcXVlc3RzLmdldChzb3VyY2UpO1xuXHRcdGlmIChwZW5kaW5nUmVxdWVzdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRvcHRpb25zLmN1cnNvciA9IHBlbmRpbmdSZXF1ZXN0LnJlcXVlc3Qub3B0aW9ucy5jdXJzb3I7XG5cblx0XHRcdC8vIFRPRE9AZWFtb2RpbyBkZWFsIHdpdGggY29uY3VycmVudCByZXF1ZXN0cyBiZXR0ZXJcblx0XHRcdGlmICh0eXBlb2Ygb3B0aW9ucy5saW1pdCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiBwZW5kaW5nUmVxdWVzdC5yZXF1ZXN0Lm9wdGlvbnMubGltaXQgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0b3B0aW9ucy5saW1pdCArPSBwZW5kaW5nUmVxdWVzdC5yZXF1ZXN0Lm9wdGlvbnMubGltaXQ7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0b3B0aW9ucy5saW1pdCA9IHBlbmRpbmdSZXF1ZXN0LnJlcXVlc3Qub3B0aW9ucy5saW1pdDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRwZW5kaW5nUmVxdWVzdD8ucmVxdWVzdD8udG9rZW5Tb3VyY2UuY2FuY2VsKCk7XG5cdFx0cGVuZGluZ1JlcXVlc3Q/LmRpc3Bvc2UoKTtcblxuXHRcdG9wdGlvbnMuY2FjaGVSZXN1bHRzID0gdHJ1ZTtcblx0XHRvcHRpb25zLnJlc2V0Q2FjaGUgPSByZXNldDtcblx0XHRjb25zdCB0b2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IG5ld1JlcXVlc3QgPSB0aGlzLnRpbWVsaW5lU2VydmljZS5nZXRUaW1lbGluZShzb3VyY2UsIHVyaSwgb3B0aW9ucywgdG9rZW5Tb3VyY2UpO1xuXG5cdFx0aWYgKG5ld1JlcXVlc3QgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dG9rZW5Tb3VyY2UuZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMucGVuZGluZ1JlcXVlc3RzLnNldChzb3VyY2UsIHsgcmVxdWVzdDogbmV3UmVxdWVzdCwgZGlzcG9zZTogKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpIH0pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b2tlblNvdXJjZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRva2VuU291cmNlLnRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHRoaXMucGVuZGluZ1JlcXVlc3RzLmRlbGV0ZShzb3VyY2UpKSk7XG5cblx0XHR0aGlzLmhhbmRsZVJlcXVlc3QobmV3UmVxdWVzdCk7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVGltZWxpbmUodGltZWxpbmU6IFRpbWVsaW5lQWdncmVnYXRlLCByZXNldDogYm9vbGVhbikge1xuXHRcdGlmIChyZXNldCkge1xuXHRcdFx0dGhpcy50aW1lbGluZXNCeVNvdXJjZS5kZWxldGUodGltZWxpbmUuc291cmNlKTtcblx0XHRcdC8vIE92ZXJyaWRlIHRoZSBsaW1pdCwgdG8gcmUtcXVlcnkgZm9yIGFsbCBvdXIgZXhpc3RpbmcgY2FjaGVkIChwb3NzaWJseSB2aXNpYmxlKSBpdGVtcyB0byBrZWVwIHZpc3VhbCBjb250aW51aXR5XG5cdFx0XHRjb25zdCB7IG9sZGVzdCB9ID0gdGltZWxpbmU7XG5cdFx0XHR0aGlzLmxvYWRUaW1lbGluZUZvclNvdXJjZSh0aW1lbGluZS5zb3VyY2UsIHRoaXMudXJpISwgdHJ1ZSwgb2xkZXN0ICE9PSB1bmRlZmluZWQgPyB7IGxpbWl0OiB7IHRpbWVzdGFtcDogb2xkZXN0LnRpbWVzdGFtcCwgaWQ6IG9sZGVzdC5pZCB9IH0gOiB1bmRlZmluZWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBPdmVycmlkZSB0aGUgbGltaXQsIHRvIHF1ZXJ5IGZvciBhbnkgbmV3ZXIgaXRlbXNcblx0XHRcdGNvbnN0IHsgbmV3ZXN0IH0gPSB0aW1lbGluZTtcblx0XHRcdHRoaXMubG9hZFRpbWVsaW5lRm9yU291cmNlKHRpbWVsaW5lLnNvdXJjZSwgdGhpcy51cmkhLCBmYWxzZSwgbmV3ZXN0ICE9PSB1bmRlZmluZWQgPyB7IGxpbWl0OiB7IHRpbWVzdGFtcDogbmV3ZXN0LnRpbWVzdGFtcCwgaWQ6IG5ld2VzdC5pZCB9IH0gOiB7IGxpbWl0OiB0aGlzLnBhZ2VTaXplIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3BlbmRpbmdSZWZyZXNoID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVSZXF1ZXN0KHJlcXVlc3Q6IFRpbWVsaW5lUmVxdWVzdCkge1xuXHRcdGxldCByZXNwb25zZTogVGltZWxpbmUgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdHJlc3BvbnNlID0gYXdhaXQgdGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHsgbG9jYXRpb246IHRoaXMuaWQgfSwgKCkgPT4gcmVxdWVzdC5yZXN1bHQpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gSWdub3JlXG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlIHJlcXVlc3Qgd2FzIGNhbmNlbGxlZCB0aGVuIGl0IHdhcyBhbHJlYWR5IGRlbGV0ZWQgZnJvbSB0aGUgcGVuZGluZ1JlcXVlc3RzIG1hcFxuXHRcdGlmICghcmVxdWVzdC50b2tlblNvdXJjZS50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0dGhpcy5wZW5kaW5nUmVxdWVzdHMuZ2V0KHJlcXVlc3Quc291cmNlKT8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5wZW5kaW5nUmVxdWVzdHMuZGVsZXRlKHJlcXVlc3Quc291cmNlKTtcblx0XHR9XG5cblx0XHRpZiAocmVzcG9uc2UgPT09IHVuZGVmaW5lZCB8fCByZXF1ZXN0LnVyaSAhPT0gdGhpcy51cmkpIHtcblx0XHRcdGlmICh0aGlzLnBlbmRpbmdSZXF1ZXN0cy5zaXplID09PSAwICYmIHRoaXMuX3BlbmRpbmdSZWZyZXNoKSB7XG5cdFx0XHRcdHRoaXMucmVmcmVzaCgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNvdXJjZSA9IHJlcXVlc3Quc291cmNlO1xuXG5cdFx0bGV0IHVwZGF0ZWQgPSBmYWxzZTtcblx0XHRjb25zdCB0aW1lbGluZSA9IHRoaXMudGltZWxpbmVzQnlTb3VyY2UuZ2V0KHNvdXJjZSk7XG5cdFx0aWYgKHRpbWVsaW5lID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMudGltZWxpbmVzQnlTb3VyY2Uuc2V0KHNvdXJjZSwgbmV3IFRpbWVsaW5lQWdncmVnYXRlKHJlc3BvbnNlKSk7XG5cdFx0XHR1cGRhdGVkID0gdHJ1ZTtcblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHR1cGRhdGVkID0gdGltZWxpbmUuYWRkKHJlc3BvbnNlLCByZXF1ZXN0Lm9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdGlmICh1cGRhdGVkKSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nUmVmcmVzaCA9IHRydWU7XG5cblx0XHRcdC8vIElmIHdlIGhhdmUgdmlzaWJsZSBpdGVtcyBhbHJlYWR5IGFuZCB0aGVyZSBhcmUgb3RoZXIgcGVuZGluZyByZXF1ZXN0cywgZGVib3VuY2UgZm9yIGEgYml0IHRvIHdhaXQgZm9yIG90aGVyIHJlcXVlc3RzXG5cdFx0XHRpZiAodGhpcy5oYXNWaXNpYmxlSXRlbXMgJiYgdGhpcy5wZW5kaW5nUmVxdWVzdHMuc2l6ZSAhPT0gMCkge1xuXHRcdFx0XHR0aGlzLnJlZnJlc2hEZWJvdW5jZWQoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMucmVmcmVzaCgpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAodGhpcy5wZW5kaW5nUmVxdWVzdHMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0aWYgKHRoaXMuX3BlbmRpbmdSZWZyZXNoKSB7XG5cdFx0XHRcdHRoaXMucmVmcmVzaCgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy50cmVlLnJlcmVuZGVyKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSAqZ2V0SXRlbXMoKTogR2VuZXJhdG9yPElUcmVlRWxlbWVudDxUcmVlRWxlbWVudD4sIHZvaWQsIHVuZGVmaW5lZD4ge1xuXHRcdGxldCBtb3JlID0gZmFsc2U7XG5cblx0XHRpZiAodGhpcy51cmkgPT09IHVuZGVmaW5lZCB8fCB0aGlzLnRpbWVsaW5lc0J5U291cmNlLnNpemUgPT09IDApIHtcblx0XHRcdHRoaXMuX3Zpc2libGVJdGVtQ291bnQgPSAwO1xuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWF4Q291bnQgPSB0aGlzLl9tYXhJdGVtQ291bnQ7XG5cdFx0bGV0IGNvdW50ID0gMDtcblxuXHRcdGlmICh0aGlzLnRpbWVsaW5lc0J5U291cmNlLnNpemUgPT09IDEpIHtcblx0XHRcdGNvbnN0IFtzb3VyY2UsIHRpbWVsaW5lXSA9IEl0ZXJhYmxlLmZpcnN0KHRoaXMudGltZWxpbmVzQnlTb3VyY2UpITtcblxuXHRcdFx0dGltZWxpbmUubGFzdFJlbmRlcmVkSW5kZXggPSAtMTtcblxuXHRcdFx0aWYgKHRoaXMuZXhjbHVkZWRTb3VyY2VzLmhhcyhzb3VyY2UpKSB7XG5cdFx0XHRcdHRoaXMuX3Zpc2libGVJdGVtQ291bnQgPSAwO1xuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRpbWVsaW5lLml0ZW1zLmxlbmd0aCAhPT0gMCkge1xuXHRcdFx0XHQvLyBJZiB3ZSBoYXZlIGFueSBpdGVtcywganVzdCBzYXkgd2UgaGF2ZSBvbmUgZm9yIG5vdyAtLSB0aGUgcmVhbCBjb3VudCB3aWxsIGJlIHVwZGF0ZWQgYmVsb3dcblx0XHRcdFx0dGhpcy5fdmlzaWJsZUl0ZW1Db3VudCA9IDE7XG5cdFx0XHR9XG5cblx0XHRcdG1vcmUgPSB0aW1lbGluZS5tb3JlO1xuXG5cdFx0XHRsZXQgbGFzdFJlbGF0aXZlVGltZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIHRpbWVsaW5lLml0ZW1zKSB7XG5cdFx0XHRcdGl0ZW0ucmVsYXRpdmVUaW1lID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRpdGVtLmhpZGVSZWxhdGl2ZVRpbWUgPSB1bmRlZmluZWQ7XG5cblx0XHRcdFx0Y291bnQrKztcblx0XHRcdFx0aWYgKGNvdW50ID4gbWF4Q291bnQpIHtcblx0XHRcdFx0XHRtb3JlID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxhc3RSZWxhdGl2ZVRpbWUgPSB1cGRhdGVSZWxhdGl2ZVRpbWUoaXRlbSwgbGFzdFJlbGF0aXZlVGltZSk7XG5cdFx0XHRcdHlpZWxkIHsgZWxlbWVudDogaXRlbSB9O1xuXHRcdFx0fVxuXG5cdFx0XHR0aW1lbGluZS5sYXN0UmVuZGVyZWRJbmRleCA9IGNvdW50IC0gMTtcblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHRjb25zdCBzb3VyY2VzOiB7IHRpbWVsaW5lOiBUaW1lbGluZUFnZ3JlZ2F0ZTsgaXRlcmF0b3I6IEl0ZXJhYmxlSXRlcmF0b3I8VGltZWxpbmVJdGVtPjsgbmV4dEl0ZW06IEl0ZXJhdG9yUmVzdWx0PFRpbWVsaW5lSXRlbSwgdW5kZWZpbmVkPiB9W10gPSBbXTtcblxuXHRcdFx0bGV0IGhhc0FueUl0ZW1zID0gZmFsc2U7XG5cdFx0XHRsZXQgbW9zdFJlY2VudEVuZCA9IDA7XG5cblx0XHRcdGZvciAoY29uc3QgW3NvdXJjZSwgdGltZWxpbmVdIG9mIHRoaXMudGltZWxpbmVzQnlTb3VyY2UpIHtcblx0XHRcdFx0dGltZWxpbmUubGFzdFJlbmRlcmVkSW5kZXggPSAtMTtcblxuXHRcdFx0XHRpZiAodGhpcy5leGNsdWRlZFNvdXJjZXMuaGFzKHNvdXJjZSkgfHwgdGltZWxpbmUuc3RhbGUpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0aW1lbGluZS5pdGVtcy5sZW5ndGggIT09IDApIHtcblx0XHRcdFx0XHRoYXNBbnlJdGVtcyA9IHRydWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodGltZWxpbmUubW9yZSkge1xuXHRcdFx0XHRcdG1vcmUgPSB0cnVlO1xuXG5cdFx0XHRcdFx0Y29uc3QgbGFzdCA9IHRpbWVsaW5lLml0ZW1zW01hdGgubWluKG1heENvdW50LCB0aW1lbGluZS5pdGVtcy5sZW5ndGggLSAxKV07XG5cdFx0XHRcdFx0aWYgKGxhc3QudGltZXN0YW1wID4gbW9zdFJlY2VudEVuZCkge1xuXHRcdFx0XHRcdFx0bW9zdFJlY2VudEVuZCA9IGxhc3QudGltZXN0YW1wO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGl0ZXJhdG9yID0gdGltZWxpbmUuaXRlbXNbU3ltYm9sLml0ZXJhdG9yXSgpO1xuXHRcdFx0XHRzb3VyY2VzLnB1c2goeyB0aW1lbGluZSwgaXRlcmF0b3IsIG5leHRJdGVtOiBpdGVyYXRvci5uZXh0KCkgfSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3Zpc2libGVJdGVtQ291bnQgPSBoYXNBbnlJdGVtcyA/IDEgOiAwO1xuXG5cdFx0XHRmdW5jdGlvbiBnZXROZXh0TW9zdFJlY2VudFNvdXJjZSgpIHtcblx0XHRcdFx0cmV0dXJuIHNvdXJjZXNcblx0XHRcdFx0XHQuZmlsdGVyKHNvdXJjZSA9PiAhc291cmNlLm5leHRJdGVtLmRvbmUpXG5cdFx0XHRcdFx0LnJlZHVjZSgocHJldmlvdXMsIGN1cnJlbnQpID0+IChwcmV2aW91cyA9PT0gdW5kZWZpbmVkIHx8IGN1cnJlbnQubmV4dEl0ZW0udmFsdWUhLnRpbWVzdGFtcCA+PSBwcmV2aW91cy5uZXh0SXRlbS52YWx1ZSEudGltZXN0YW1wKSA/IGN1cnJlbnQgOiBwcmV2aW91cywgdW5kZWZpbmVkISk7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBsYXN0UmVsYXRpdmVUaW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgbmV4dFNvdXJjZTtcblx0XHRcdHdoaWxlIChuZXh0U291cmNlID0gZ2V0TmV4dE1vc3RSZWNlbnRTb3VyY2UoKSkge1xuXHRcdFx0XHRuZXh0U291cmNlLnRpbWVsaW5lLmxhc3RSZW5kZXJlZEluZGV4Kys7XG5cblx0XHRcdFx0Y29uc3QgaXRlbSA9IG5leHRTb3VyY2UubmV4dEl0ZW0udmFsdWUhO1xuXHRcdFx0XHRpdGVtLnJlbGF0aXZlVGltZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0aXRlbS5oaWRlUmVsYXRpdmVUaW1lID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRcdGlmIChpdGVtLnRpbWVzdGFtcCA+PSBtb3N0UmVjZW50RW5kKSB7XG5cdFx0XHRcdFx0Y291bnQrKztcblx0XHRcdFx0XHRpZiAoY291bnQgPiBtYXhDb3VudCkge1xuXHRcdFx0XHRcdFx0bW9yZSA9IHRydWU7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRsYXN0UmVsYXRpdmVUaW1lID0gdXBkYXRlUmVsYXRpdmVUaW1lKGl0ZW0sIGxhc3RSZWxhdGl2ZVRpbWUpO1xuXHRcdFx0XHRcdHlpZWxkIHsgZWxlbWVudDogaXRlbSB9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bmV4dFNvdXJjZS5uZXh0SXRlbSA9IG5leHRTb3VyY2UuaXRlcmF0b3IubmV4dCgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX3Zpc2libGVJdGVtQ291bnQgPSBjb3VudDtcblx0XHRpZiAoY291bnQgPiAwKSB7XG5cdFx0XHRpZiAobW9yZSkge1xuXHRcdFx0XHR5aWVsZCB7XG5cdFx0XHRcdFx0ZWxlbWVudDogbmV3IExvYWRNb3JlQ29tbWFuZCh0aGlzLnBlbmRpbmdSZXF1ZXN0cy5zaXplICE9PSAwKVxuXHRcdFx0XHR9O1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLnBlbmRpbmdSZXF1ZXN0cy5zaXplICE9PSAwKSB7XG5cdFx0XHRcdHlpZWxkIHtcblx0XHRcdFx0XHRlbGVtZW50OiBuZXcgTG9hZE1vcmVDb21tYW5kKHRydWUpXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWZyZXNoKCkge1xuXHRcdGlmICghdGhpcy5pc0JvZHlWaXNpYmxlKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnRyZWUuc2V0Q2hpbGRyZW4obnVsbCwgdGhpcy5nZXRJdGVtcygpKTtcblx0XHR0aGlzLl9pc0VtcHR5ID0gIXRoaXMuaGFzVmlzaWJsZUl0ZW1zO1xuXG5cdFx0aWYgKHRoaXMudXJpID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMudXBkYXRlRmlsZW5hbWUodW5kZWZpbmVkKTtcblx0XHRcdHRoaXMubWVzc2FnZSA9IGxvY2FsaXplKCd0aW1lbGluZS5lZGl0b3JDYW5ub3RQcm92aWRlVGltZWxpbmUnLCBcIlRoZSBhY3RpdmUgZWRpdG9yIGNhbm5vdCBwcm92aWRlIHRpbWVsaW5lIGluZm9ybWF0aW9uLlwiKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2lzRW1wdHkpIHtcblx0XHRcdGlmICh0aGlzLnBlbmRpbmdSZXF1ZXN0cy5zaXplICE9PSAwKSB7XG5cdFx0XHRcdHRoaXMuc2V0TG9hZGluZ1VyaU1lc3NhZ2UoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlRmlsZW5hbWUodGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpQmFzZW5hbWVMYWJlbCh0aGlzLnVyaSkpO1xuXHRcdFx0XHRjb25zdCBzY21Qcm92aWRlckNvdW50ID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8bnVtYmVyPignc2NtLnByb3ZpZGVyQ291bnQnKTtcblx0XHRcdFx0aWYgKHRoaXMudGltZWxpbmVTZXJ2aWNlLmdldFNvdXJjZXMoKS5maWx0ZXIoKHsgaWQgfSkgPT4gIXRoaXMuZXhjbHVkZWRTb3VyY2VzLmhhcyhpZCkpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdHRoaXMubWVzc2FnZSA9IGxvY2FsaXplKCd0aW1lbGluZS5ub1RpbWVsaW5lU291cmNlc0VuYWJsZWQnLCBcIkFsbCB0aW1lbGluZSBzb3VyY2VzIGhhdmUgYmVlbiBmaWx0ZXJlZCBvdXQuXCIpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCd3b3JrYmVuY2gubG9jYWxIaXN0b3J5LmVuYWJsZWQnKSAmJiAhdGhpcy5leGNsdWRlZFNvdXJjZXMuaGFzKCd0aW1lbGluZS5sb2NhbEhpc3RvcnknKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5tZXNzYWdlID0gbG9jYWxpemUoJ3RpbWVsaW5lLm5vTG9jYWxIaXN0b3J5WWV0JywgXCJMb2NhbCBIaXN0b3J5IHdpbGwgdHJhY2sgcmVjZW50IGNoYW5nZXMgYXMgeW91IHNhdmUgdGhlbSB1bmxlc3MgdGhlIGZpbGUgaGFzIGJlZW4gZXhjbHVkZWQgb3IgaXMgdG9vIGxhcmdlLlwiKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuZXhjbHVkZWRTb3VyY2VzLnNpemUgPiAwKSB7XG5cdFx0XHRcdFx0XHR0aGlzLm1lc3NhZ2UgPSBsb2NhbGl6ZSgndGltZWxpbmUubm9UaW1lbGluZUluZm9Gcm9tRW5hYmxlZFNvdXJjZXMnLCBcIk5vIGZpbHRlcmVkIHRpbWVsaW5lIGluZm9ybWF0aW9uIHdhcyBwcm92aWRlZC5cIik7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMubWVzc2FnZSA9IGxvY2FsaXplKCd0aW1lbGluZS5ub1RpbWVsaW5lSW5mbycsIFwiTm8gdGltZWxpbmUgaW5mb3JtYXRpb24gd2FzIHByb3ZpZGVkLlwiKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFzY21Qcm92aWRlckNvdW50IHx8IHNjbVByb3ZpZGVyQ291bnQgPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLm1lc3NhZ2UgKz0gJyAnICsgbG9jYWxpemUoJ3RpbWVsaW5lLm5vU0NNJywgXCJTb3VyY2UgQ29udHJvbCBoYXMgbm90IGJlZW4gY29uZmlndXJlZC5cIik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy51cGRhdGVGaWxlbmFtZSh0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlCYXNlbmFtZUxhYmVsKHRoaXMudXJpKSk7XG5cdFx0XHR0aGlzLm1lc3NhZ2UgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcGVuZGluZ1JlZnJlc2ggPSBmYWxzZTtcblx0fVxuXG5cdEBkZWJvdW5jZSg1MDApXG5cdHByaXZhdGUgcmVmcmVzaERlYm91bmNlZCgpIHtcblx0XHR0aGlzLnJlZnJlc2goKTtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cdH1cblxuXHRvdmVycmlkZSBzZXRFeHBhbmRlZChleHBhbmRlZDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGNoYW5nZWQgPSBzdXBlci5zZXRFeHBhbmRlZChleHBhbmRlZCk7XG5cblx0XHRpZiAoY2hhbmdlZCAmJiB0aGlzLmlzQm9keVZpc2libGUoKSkge1xuXHRcdFx0aWYgKCF0aGlzLmZvbGxvd0FjdGl2ZUVkaXRvcikge1xuXHRcdFx0XHR0aGlzLnNldFVyaUNvcmUodGhpcy51cmksIHRydWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5vbkFjdGl2ZUVkaXRvckNoYW5nZWQoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gY2hhbmdlZDtcblx0fVxuXG5cdG92ZXJyaWRlIHNldFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHR0aGlzLmV4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KCdvblZpZXc6dGltZWxpbmUnKTtcblx0XHRcdHRoaXMudmlzaWJpbGl0eURpc3Bvc2FibGVzPy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLnZpc2liaWxpdHlEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0dGhpcy5lZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKHRoaXMub25BY3RpdmVFZGl0b3JDaGFuZ2VkLCB0aGlzLCB0aGlzLnZpc2liaWxpdHlEaXNwb3NhYmxlcyk7XG5cdFx0XHQvLyBSZWZyZXNoIHRoZSB2aWV3IG9uIGZvY3VzIHRvIHVwZGF0ZSB0aGUgcmVsYXRpdmUgdGltZXN0YW1wc1xuXHRcdFx0dGhpcy5vbkRpZEZvY3VzKCgpID0+IHRoaXMucmVmcmVzaERlYm91bmNlZCgpLCB0aGlzLCB0aGlzLnZpc2liaWxpdHlEaXNwb3NhYmxlcyk7XG5cblx0XHRcdHN1cGVyLnNldFZpc2libGUodmlzaWJsZSk7XG5cblx0XHRcdHRoaXMub25BY3RpdmVFZGl0b3JDaGFuZ2VkKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudmlzaWJpbGl0eURpc3Bvc2FibGVzPy5kaXNwb3NlKCk7XG5cblx0XHRcdHN1cGVyLnNldFZpc2libGUodmlzaWJsZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGxheW91dEJvZHkoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRzdXBlci5sYXlvdXRCb2R5KGhlaWdodCwgd2lkdGgpO1xuXHRcdHRoaXMudHJlZS5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVySGVhZGVyVGl0bGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckhlYWRlclRpdGxlKGNvbnRhaW5lciwgdGhpcy50aXRsZSk7XG5cblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgndGltZWxpbmUtdmlldycpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblxuXHRcdHRoaXMuJGNvbnRhaW5lciA9IGNvbnRhaW5lcjtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgndHJlZS1leHBsb3Jlci12aWV3bGV0LXRyZWUtdmlldycsICd0aW1lbGluZS10cmVlLXZpZXcnKTtcblxuXHRcdHRoaXMuJG1lc3NhZ2UgPSBET00uYXBwZW5kKHRoaXMuJGNvbnRhaW5lciwgRE9NLiQoJy5tZXNzYWdlJykpO1xuXHRcdHRoaXMuJG1lc3NhZ2UuY2xhc3NMaXN0LmFkZCgndGltZWxpbmUtc3VidGxlJyk7XG5cblx0XHR0aGlzLm1lc3NhZ2UgPSBsb2NhbGl6ZSgndGltZWxpbmUuZWRpdG9yQ2Fubm90UHJvdmlkZVRpbWVsaW5lJywgXCJUaGUgYWN0aXZlIGVkaXRvciBjYW5ub3QgcHJvdmlkZSB0aW1lbGluZSBpbmZvcm1hdGlvbi5cIik7XG5cblx0XHR0aGlzLiR0cmVlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy4kdHJlZS5jbGFzc0xpc3QuYWRkKCdjdXN0b212aWV3LXRyZWUnLCAnZmlsZS1pY29uLXRoZW1hYmxlLXRyZWUnLCAnaGlkZS1hcnJvd3MnKTtcblx0XHQvLyB0aGlzLnRyZWVFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3Nob3ctZmlsZS1pY29ucycpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLiR0cmVlKTtcblxuXHRcdHRoaXMudHJlZVJlbmRlcmVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUaW1lbGluZVRyZWVSZW5kZXJlciwgdGhpcy5jb21tYW5kcywgdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0xvY2F0aW9uQnlJZCh0aGlzLmlkKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZVJlbmRlcmVyLm9uRGlkU2Nyb2xsVG9FbmQoaXRlbSA9PiB7XG5cdFx0XHRpZiAodGhpcy5wYWdlT25TY3JvbGwpIHtcblx0XHRcdFx0dGhpcy5sb2FkTW9yZShpdGVtKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnRyZWUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaE9iamVjdFRyZWU8VHJlZUVsZW1lbnQsIEZ1enp5U2NvcmU+LCAnVGltZWxpbmVQYW5lJyxcblx0XHRcdHRoaXMuJHRyZWUsIG5ldyBUaW1lbGluZUxpc3RWaXJ0dWFsRGVsZWdhdGUoKSwgW3RoaXMudHJlZVJlbmRlcmVyXSwge1xuXHRcdFx0aWRlbnRpdHlQcm92aWRlcjogbmV3IFRpbWVsaW5lSWRlbnRpdHlQcm92aWRlcigpLFxuXHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdGdldEFyaWFMYWJlbChlbGVtZW50OiBUcmVlRWxlbWVudCk6IHN0cmluZyB7XG5cdFx0XHRcdFx0aWYgKGlzTG9hZE1vcmVDb21tYW5kKGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5hcmlhTGFiZWw7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBlbGVtZW50LmFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbiA/IGVsZW1lbnQuYWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uLmxhYmVsIDogbG9jYWxpemUoJ3RpbWVsaW5lLmFyaWEuaXRlbScsIFwiezB9OiB7MX1cIiwgZWxlbWVudC5yZWxhdGl2ZVRpbWVGdWxsV29yZCA/PyAnJywgZWxlbWVudC5sYWJlbCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldFJvbGUoZWxlbWVudDogVHJlZUVsZW1lbnQpOiBBcmlhUm9sZSB7XG5cdFx0XHRcdFx0aWYgKGlzTG9hZE1vcmVDb21tYW5kKGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gJ3RyZWVpdGVtJztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQuYWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uICYmIGVsZW1lbnQuYWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uLnJvbGUgPyBlbGVtZW50LmFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbi5yb2xlIDogJ3RyZWVpdGVtJztcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0aW1lbGluZScsIFwiVGltZWxpbmVcIik7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiBuZXcgVGltZWxpbmVLZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyKCksXG5cdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0b3ZlcnJpZGVTdHlsZXM6IHRoaXMuZ2V0TG9jYXRpb25CYXNlZENvbG9ycygpLmxpc3RPdmVycmlkZVN0eWxlcyxcblx0XHR9KTtcblxuXHRcdFRpbWVsaW5lVmlld0ZvY3VzZWRDb250ZXh0LmJpbmRUbyh0aGlzLnRyZWUuY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uQ29udGV4dE1lbnUoZSA9PiB0aGlzLm9uQ29udGV4dE1lbnUodGhpcy5jb21tYW5kcywgZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25EaWRDaGFuZ2VTZWxlY3Rpb24oZSA9PiB0aGlzLmVuc3VyZVZhbGlkSXRlbXMoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZE9wZW4oZSA9PiB7XG5cdFx0XHRpZiAoIWUuYnJvd3NlckV2ZW50IHx8ICF0aGlzLmVuc3VyZVZhbGlkSXRlbXMoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMudHJlZS5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdGxldCBpdGVtO1xuXHRcdFx0aWYgKHNlbGVjdGlvbi5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0aXRlbSA9IHNlbGVjdGlvblswXTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGl0ZW0gPT09IG51bGwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXNUaW1lbGluZUl0ZW0oaXRlbSkpIHtcblx0XHRcdFx0aWYgKGl0ZW0uY29tbWFuZCkge1xuXHRcdFx0XHRcdGxldCBhcmdzID0gaXRlbS5jb21tYW5kLmFyZ3VtZW50cyA/PyBbXTtcblx0XHRcdFx0XHRpZiAoaXRlbS5jb21tYW5kLmlkID09PSBBUElfT1BFTl9FRElUT1JfQ09NTUFORF9JRCB8fCBpdGVtLmNvbW1hbmQuaWQgPT09IEFQSV9PUEVOX0RJRkZfRURJVE9SX0NPTU1BTkRfSUQpIHtcblx0XHRcdFx0XHRcdC8vIFNvbWUgY29tbWFuZHMgb3duZWQgYnkgdXMgc2hvdWxkIHJlY2VpdmUgdGhlXG5cdFx0XHRcdFx0XHQvLyBgSU9wZW5FdmVudGAgYXMgY29udGV4dCB0byBvcGVuIHByb3Blcmx5XG5cdFx0XHRcdFx0XHRhcmdzID0gWy4uLmFyZ3MsIGVdO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoaXRlbS5jb21tYW5kLmlkLCAuLi5hcmdzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZiAoaXNMb2FkTW9yZUNvbW1hbmQoaXRlbSkpIHtcblx0XHRcdFx0dGhpcy5sb2FkTW9yZShpdGVtKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGxvYWRNb3JlKGl0ZW06IExvYWRNb3JlQ29tbWFuZCkge1xuXHRcdGlmIChpdGVtLmxvYWRpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpdGVtLmxvYWRpbmcgPSB0cnVlO1xuXHRcdHRoaXMudHJlZS5yZXJlbmRlcihpdGVtKTtcblxuXHRcdGlmICh0aGlzLnBlbmRpbmdSZXF1ZXN0cy5zaXplICE9PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fbWF4SXRlbUNvdW50ID0gdGhpcy5fdmlzaWJsZUl0ZW1Db3VudCArIHRoaXMucGFnZVNpemU7XG5cdFx0dGhpcy5sb2FkVGltZWxpbmUoZmFsc2UpO1xuXHR9XG5cblx0ZW5zdXJlVmFsaWRJdGVtcygpIHtcblx0XHQvLyBJZiB3ZSBkb24ndCBoYXZlIGFueSBub24tZXhjbHVkZWQgdGltZWxpbmVzLCBjbGVhciB0aGUgdHJlZSBhbmQgc2hvdyB0aGUgbG9hZGluZyBtZXNzYWdlXG5cdFx0aWYgKCF0aGlzLmhhc1Zpc2libGVJdGVtcyB8fCAhdGhpcy50aW1lbGluZVNlcnZpY2UuZ2V0U291cmNlcygpLnNvbWUoKHsgaWQgfSkgPT4gIXRoaXMuZXhjbHVkZWRTb3VyY2VzLmhhcyhpZCkgJiYgdGhpcy50aW1lbGluZXNCeVNvdXJjZS5oYXMoaWQpKSkge1xuXHRcdFx0dGhpcy50cmVlLnNldENoaWxkcmVuKG51bGwsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9pc0VtcHR5ID0gdHJ1ZTtcblxuXHRcdFx0dGhpcy5zZXRMb2FkaW5nVXJpTWVzc2FnZSgpO1xuXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRzZXRMb2FkaW5nVXJpTWVzc2FnZSgpIHtcblx0XHRjb25zdCBmaWxlID0gdGhpcy51cmkgJiYgdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpQmFzZW5hbWVMYWJlbCh0aGlzLnVyaSk7XG5cdFx0dGhpcy51cGRhdGVGaWxlbmFtZShmaWxlKTtcblx0XHR0aGlzLm1lc3NhZ2UgPSBmaWxlID8gbG9jYWxpemUoJ3RpbWVsaW5lLmxvYWRpbmcnLCBcIkxvYWRpbmcgdGltZWxpbmUgZm9yIHswfS4uLlwiLCBmaWxlKSA6ICcnO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkNvbnRleHRNZW51KGNvbW1hbmRzOiBUaW1lbGluZVBhbmVDb21tYW5kcywgdHJlZUV2ZW50OiBJVHJlZUNvbnRleHRNZW51RXZlbnQ8VHJlZUVsZW1lbnQgfCBudWxsPik6IHZvaWQge1xuXHRcdGNvbnN0IGl0ZW0gPSB0cmVlRXZlbnQuZWxlbWVudDtcblx0XHRpZiAoaXRlbSA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBldmVudDogVUlFdmVudCA9IHRyZWVFdmVudC5icm93c2VyRXZlbnQ7XG5cblx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXG5cdFx0aWYgKCF0aGlzLmVuc3VyZVZhbGlkSXRlbXMoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudHJlZS5zZXRGb2N1cyhbaXRlbV0pO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBjb21tYW5kcy5nZXRJdGVtQ29udGV4dEFjdGlvbnMoaXRlbSk7XG5cdFx0aWYgKCFhY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IHRyZWVFdmVudC5hbmNob3IsXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zLFxuXHRcdFx0Z2V0QWN0aW9uVmlld0l0ZW06IChhY3Rpb24pID0+IHtcblx0XHRcdFx0Y29uc3Qga2V5YmluZGluZyA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhhY3Rpb24uaWQpO1xuXHRcdFx0XHRpZiAoa2V5YmluZGluZykge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgQWN0aW9uVmlld0l0ZW0oYWN0aW9uLCBhY3Rpb24sIHsgbGFiZWw6IHRydWUsIGtleWJpbmRpbmc6IGtleWJpbmRpbmcuZ2V0TGFiZWwoKSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdG9uSGlkZTogKHdhc0NhbmNlbGxlZD86IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0aWYgKHdhc0NhbmNlbGxlZCkge1xuXHRcdFx0XHRcdHRoaXMudHJlZS5kb21Gb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpOiBUaW1lbGluZUFjdGlvbkNvbnRleHQgPT4gKHsgdXJpOiB0aGlzLnVyaSwgaXRlbSB9KSxcblx0XHRcdGFjdGlvblJ1bm5lcjogbmV3IFRpbWVsaW5lQWN0aW9uUnVubmVyKClcblx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBUaW1lbGluZUVsZW1lbnRUZW1wbGF0ZSBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblx0c3RhdGljIHJlYWRvbmx5IGlkID0gJ1RpbWVsaW5lRWxlbWVudFRlbXBsYXRlJztcblxuXHRyZWFkb25seSBhY3Rpb25CYXI6IEFjdGlvbkJhcjtcblx0cmVhZG9ubHkgaWNvbjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGljb25MYWJlbDogSWNvbkxhYmVsO1xuXHRyZWFkb25seSB0aW1lc3RhbXA6IEhUTUxTcGFuRWxlbWVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IElBY3Rpb25WaWV3SXRlbVByb3ZpZGVyLFxuXHRcdGhvdmVyRGVsZWdhdGU6IElIb3ZlckRlbGVnYXRlLFxuXHQpIHtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnY3VzdG9tLXZpZXctdHJlZS1ub2RlLWl0ZW0nKTtcblx0XHR0aGlzLmljb24gPSBET00uYXBwZW5kKGNvbnRhaW5lciwgRE9NLiQoJy5jdXN0b20tdmlldy10cmVlLW5vZGUtaXRlbS1pY29uJykpO1xuXG5cdFx0dGhpcy5pY29uTGFiZWwgPSBuZXcgSWNvbkxhYmVsKGNvbnRhaW5lciwgeyBzdXBwb3J0SGlnaGxpZ2h0czogdHJ1ZSwgc3VwcG9ydEljb25zOiB0cnVlLCBob3ZlckRlbGVnYXRlIH0pO1xuXG5cdFx0Y29uc3QgdGltZXN0YW1wQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLmljb25MYWJlbC5lbGVtZW50LCBET00uJCgnLnRpbWVsaW5lLXRpbWVzdGFtcC1jb250YWluZXInKSk7XG5cdFx0dGhpcy50aW1lc3RhbXAgPSBET00uYXBwZW5kKHRpbWVzdGFtcENvbnRhaW5lciwgRE9NLiQoJ3NwYW4udGltZWxpbmUtdGltZXN0YW1wJykpO1xuXG5cdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5pY29uTGFiZWwuZWxlbWVudCwgRE9NLiQoJy5hY3Rpb25zJykpO1xuXHRcdHRoaXMuYWN0aW9uQmFyID0gbmV3IEFjdGlvbkJhcihhY3Rpb25zQ29udGFpbmVyLCB7IGFjdGlvblZpZXdJdGVtUHJvdmlkZXIgfSk7XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuaWNvbkxhYmVsLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmFjdGlvbkJhci5kaXNwb3NlKCk7XG5cdH1cblxuXHRyZXNldCgpIHtcblx0XHR0aGlzLmljb24uY2xhc3NOYW1lID0gJyc7XG5cdFx0dGhpcy5pY29uLnN0eWxlLmJhY2tncm91bmRJbWFnZSA9ICcnO1xuXHRcdHRoaXMuYWN0aW9uQmFyLmNsZWFyKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRpbWVsaW5lSWRlbnRpdHlQcm92aWRlciBpbXBsZW1lbnRzIElJZGVudGl0eVByb3ZpZGVyPFRyZWVFbGVtZW50PiB7XG5cdGdldElkKGl0ZW06IFRyZWVFbGVtZW50KTogeyB0b1N0cmluZygpOiBzdHJpbmcgfSB7XG5cdFx0cmV0dXJuIGl0ZW0uaGFuZGxlO1xuXHR9XG59XG5cbmNsYXNzIFRpbWVsaW5lQWN0aW9uUnVubmVyIGV4dGVuZHMgQWN0aW9uUnVubmVyIHtcblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgcnVuQWN0aW9uKGFjdGlvbjogSUFjdGlvbiwgeyB1cmksIGl0ZW0gfTogVGltZWxpbmVBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFpc1RpbWVsaW5lSXRlbShpdGVtKSkge1xuXHRcdFx0Ly8gVE9ET0BlYW1vZGlvIGRvIHdlIG5lZWQgdG8gZG8gYW55dGhpbmcgZWxzZT9cblx0XHRcdGF3YWl0IGFjdGlvbi5ydW4oKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCBhY3Rpb24ucnVuKFxuXHRcdFx0e1xuXHRcdFx0XHQkbWlkOiBNYXJzaGFsbGVkSWQuVGltZWxpbmVBY3Rpb25Db250ZXh0LFxuXHRcdFx0XHRoYW5kbGU6IGl0ZW0uaGFuZGxlLFxuXHRcdFx0XHRzb3VyY2U6IGl0ZW0uc291cmNlLFxuXHRcdFx0XHR1cmlcblx0XHRcdH0sXG5cdFx0XHR1cmksXG5cdFx0XHRpdGVtLnNvdXJjZSxcblx0XHQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUaW1lbGluZUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIgaW1wbGVtZW50cyBJS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjxUcmVlRWxlbWVudD4ge1xuXHRnZXRLZXlib2FyZE5hdmlnYXRpb25MYWJlbChlbGVtZW50OiBUcmVlRWxlbWVudCk6IHsgdG9TdHJpbmcoKTogc3RyaW5nIH0ge1xuXHRcdHJldHVybiBlbGVtZW50LmxhYmVsO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUaW1lbGluZUxpc3RWaXJ0dWFsRGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxUcmVlRWxlbWVudD4ge1xuXHRnZXRIZWlnaHQoX2VsZW1lbnQ6IFRyZWVFbGVtZW50KTogbnVtYmVyIHtcblx0XHRyZXR1cm4gSXRlbUhlaWdodDtcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoZWxlbWVudDogVHJlZUVsZW1lbnQpOiBzdHJpbmcge1xuXHRcdHJldHVybiBUaW1lbGluZUVsZW1lbnRUZW1wbGF0ZS5pZDtcblx0fVxufVxuXG5jbGFzcyBUaW1lbGluZVRyZWVSZW5kZXJlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFRyZWVFbGVtZW50LCBGdXp6eVNjb3JlLCBUaW1lbGluZUVsZW1lbnRUZW1wbGF0ZT4ge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNjcm9sbFRvRW5kID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8TG9hZE1vcmVDb21tYW5kPigpKTtcblx0cmVhZG9ubHkgb25EaWRTY3JvbGxUb0VuZDogRXZlbnQ8TG9hZE1vcmVDb21tYW5kPiA9IHRoaXMuX29uRGlkU2Nyb2xsVG9FbmQuZXZlbnQ7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogc3RyaW5nID0gVGltZWxpbmVFbGVtZW50VGVtcGxhdGUuaWQ7XG5cblx0cHJpdmF0ZSBfaG92ZXJEZWxlZ2F0ZTogSUhvdmVyRGVsZWdhdGU7XG5cblx0cHJpdmF0ZSBhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiBJQWN0aW9uVmlld0l0ZW1Qcm92aWRlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRzOiBUaW1lbGluZVBhbmVDb21tYW5kcyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHZpZXdDb250YWluZXJMb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uIHwgbnVsbCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5hY3Rpb25WaWV3SXRlbVByb3ZpZGVyID0gY3JlYXRlQWN0aW9uVmlld0l0ZW0uYmluZCh1bmRlZmluZWQsIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0dGhpcy5faG92ZXJEZWxlZ2F0ZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hIb3ZlckRlbGVnYXRlLFxuXHRcdFx0dGhpcy52aWV3Q29udGFpbmVyTG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCA/ICdtb3VzZScgOiAnZWxlbWVudCcsXG5cdFx0XHR7XG5cdFx0XHRcdGluc3RhbnRIb3ZlcjogdGhpcy52aWV3Q29udGFpbmVyTG9jYXRpb24gIT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbFxuXHRcdFx0fSwge1xuXHRcdFx0cG9zaXRpb246IHtcblx0XHRcdFx0aG92ZXJQb3NpdGlvbjogSG92ZXJQb3NpdGlvbi5SSUdIVCAvLyBXaWxsIGZsaXAgd2hlbiB0aGVyZSdzIG5vIHNwYWNlXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHVyaTogVVJJIHwgdW5kZWZpbmVkO1xuXHRzZXRVcmkodXJpOiBVUkkgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLnVyaSA9IHVyaTtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBUaW1lbGluZUVsZW1lbnRUZW1wbGF0ZSB7XG5cdFx0cmV0dXJuIG5ldyBUaW1lbGluZUVsZW1lbnRUZW1wbGF0ZShjb250YWluZXIsIHRoaXMuYWN0aW9uVmlld0l0ZW1Qcm92aWRlciwgdGhpcy5faG92ZXJEZWxlZ2F0ZSk7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KFxuXHRcdG5vZGU6IElUcmVlTm9kZTxUcmVlRWxlbWVudCwgRnV6enlTY29yZT4sXG5cdFx0aW5kZXg6IG51bWJlcixcblx0XHR0ZW1wbGF0ZTogVGltZWxpbmVFbGVtZW50VGVtcGxhdGVcblx0KTogdm9pZCB7XG5cdFx0dGVtcGxhdGUucmVzZXQoKTtcblxuXHRcdGNvbnN0IHsgZWxlbWVudDogaXRlbSB9ID0gbm9kZTtcblxuXHRcdGNvbnN0IHRoZW1lID0gdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpO1xuXHRcdGNvbnN0IGljb24gPSBpc0RhcmsodGhlbWUudHlwZSkgPyBpdGVtLmljb25EYXJrIDogaXRlbS5pY29uO1xuXHRcdGNvbnN0IGljb25VcmwgPSBpY29uID8gVVJJLnJldml2ZShpY29uKSA6IG51bGw7XG5cblx0XHRpZiAoaWNvblVybCkge1xuXHRcdFx0dGVtcGxhdGUuaWNvbi5jbGFzc05hbWUgPSAnY3VzdG9tLXZpZXctdHJlZS1ub2RlLWl0ZW0taWNvbic7XG5cdFx0XHR0ZW1wbGF0ZS5pY29uLnN0eWxlLmJhY2tncm91bmRJbWFnZSA9IGNzcy5hc0NTU1VybChpY29uVXJsKTtcblx0XHRcdHRlbXBsYXRlLmljb24uc3R5bGUuY29sb3IgPSAnJztcblx0XHR9IGVsc2UgaWYgKGl0ZW0udGhlbWVJY29uKSB7XG5cdFx0XHR0ZW1wbGF0ZS5pY29uLmNsYXNzTmFtZSA9IGBjdXN0b20tdmlldy10cmVlLW5vZGUtaXRlbS1pY29uICR7VGhlbWVJY29uLmFzQ2xhc3NOYW1lKGl0ZW0udGhlbWVJY29uKX1gO1xuXHRcdFx0aWYgKGl0ZW0udGhlbWVJY29uLmNvbG9yKSB7XG5cdFx0XHRcdHRlbXBsYXRlLmljb24uc3R5bGUuY29sb3IgPSB0aGVtZS5nZXRDb2xvcihpdGVtLnRoZW1lSWNvbi5jb2xvci5pZCk/LnRvU3RyaW5nKCkgPz8gJyc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0ZW1wbGF0ZS5pY29uLnN0eWxlLmNvbG9yID0gJyc7XG5cdFx0XHR9XG5cdFx0XHR0ZW1wbGF0ZS5pY29uLnN0eWxlLmJhY2tncm91bmRJbWFnZSA9ICcnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZS5pY29uLmNsYXNzTmFtZSA9ICdjdXN0b20tdmlldy10cmVlLW5vZGUtaXRlbS1pY29uJztcblx0XHRcdHRlbXBsYXRlLmljb24uc3R5bGUuYmFja2dyb3VuZEltYWdlID0gJyc7XG5cdFx0XHR0ZW1wbGF0ZS5pY29uLnN0eWxlLmNvbG9yID0gJyc7XG5cdFx0fVxuXHRcdGNvbnN0IHRvb2x0aXAgPSBpdGVtLnRvb2x0aXBcblx0XHRcdD8gaXNTdHJpbmcoaXRlbS50b29sdGlwKVxuXHRcdFx0XHQ/IGl0ZW0udG9vbHRpcFxuXHRcdFx0XHQ6IHsgbWFya2Rvd246IGl0ZW0udG9vbHRpcCwgbWFya2Rvd25Ob3RTdXBwb3J0ZWRGYWxsYmFjazogcmVuZGVyQXNQbGFpbnRleHQoaXRlbS50b29sdGlwKSB9XG5cdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdHRlbXBsYXRlLmljb25MYWJlbC5zZXRMYWJlbChpdGVtLmxhYmVsLCBpdGVtLmRlc2NyaXB0aW9uLCB7XG5cdFx0XHR0aXRsZTogdG9vbHRpcCxcblx0XHRcdG1hdGNoZXM6IGNyZWF0ZU1hdGNoZXMobm9kZS5maWx0ZXJEYXRhKVxuXHRcdH0pO1xuXG5cdFx0dGVtcGxhdGUudGltZXN0YW1wLnRleHRDb250ZW50ID0gaXRlbS5yZWxhdGl2ZVRpbWUgPz8gJyc7XG5cdFx0dGVtcGxhdGUudGltZXN0YW1wLmFyaWFMYWJlbCA9IGl0ZW0ucmVsYXRpdmVUaW1lRnVsbFdvcmQgPz8gJyc7XG5cdFx0dGVtcGxhdGUudGltZXN0YW1wLnBhcmVudEVsZW1lbnQhLmNsYXNzTGlzdC50b2dnbGUoJ3RpbWVsaW5lLXRpbWVzdGFtcC0tZHVwbGljYXRlJywgaXNUaW1lbGluZUl0ZW0oaXRlbSkgJiYgaXRlbS5oaWRlUmVsYXRpdmVUaW1lKTtcblxuXHRcdHRlbXBsYXRlLmFjdGlvbkJhci5jb250ZXh0ID0geyB1cmk6IHRoaXMudXJpLCBpdGVtIH0gc2F0aXNmaWVzIFRpbWVsaW5lQWN0aW9uQ29udGV4dDtcblx0XHR0ZW1wbGF0ZS5hY3Rpb25CYXIuYWN0aW9uUnVubmVyID0gbmV3IFRpbWVsaW5lQWN0aW9uUnVubmVyKCk7XG5cdFx0dGVtcGxhdGUuYWN0aW9uQmFyLnB1c2godGhpcy5jb21tYW5kcy5nZXRJdGVtQWN0aW9ucyhpdGVtKSwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cblx0XHQvLyBJZiB3ZSBhcmUgcmVuZGVyaW5nIHRoZSBsb2FkIG1vcmUgaXRlbSwgd2UndmUgc2Nyb2xsZWQgdG8gdGhlIGVuZCwgc28gdHJpZ2dlciBhbiBldmVudFxuXHRcdGlmIChpc0xvYWRNb3JlQ29tbWFuZChpdGVtKSkge1xuXHRcdFx0c2V0VGltZW91dCgoKSA9PiB0aGlzLl9vbkRpZFNjcm9sbFRvRW5kLmZpcmUoaXRlbSksIDApO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxUcmVlRWxlbWVudCwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogVGltZWxpbmVFbGVtZW50VGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmFjdGlvblJ1bm5lci5kaXNwb3NlKCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGU6IFRpbWVsaW5lRWxlbWVudFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGUuZGlzcG9zZSgpO1xuXHR9XG59XG5cblxuY29uc3QgdGltZWxpbmVSZWZyZXNoID0gcmVnaXN0ZXJJY29uKCd0aW1lbGluZS1yZWZyZXNoJywgQ29kaWNvbi5yZWZyZXNoLCBsb2NhbGl6ZSgndGltZWxpbmVSZWZyZXNoJywgJ0ljb24gZm9yIHRoZSByZWZyZXNoIHRpbWVsaW5lIGFjdGlvbi4nKSk7XG5jb25zdCB0aW1lbGluZVBpbiA9IHJlZ2lzdGVySWNvbigndGltZWxpbmUtcGluJywgQ29kaWNvbi5waW4sIGxvY2FsaXplKCd0aW1lbGluZVBpbicsICdJY29uIGZvciB0aGUgcGluIHRpbWVsaW5lIGFjdGlvbi4nKSk7XG5jb25zdCB0aW1lbGluZVVucGluID0gcmVnaXN0ZXJJY29uKCd0aW1lbGluZS11bnBpbicsIENvZGljb24ucGlubmVkLCBsb2NhbGl6ZSgndGltZWxpbmVVbnBpbicsICdJY29uIGZvciB0aGUgdW5waW4gdGltZWxpbmUgYWN0aW9uLicpKTtcblxuY2xhc3MgVGltZWxpbmVQYW5lQ29tbWFuZHMgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBzb3VyY2VEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcGFuZTogVGltZWxpbmVQYW5lLFxuXHRcdEBJVGltZWxpbmVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGltZWxpbmVTZXJ2aWNlOiBJVGltZWxpbmVTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zb3VyY2VEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd0aW1lbGluZS5yZWZyZXNoJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdyZWZyZXNoJywgXCJSZWZyZXNoXCIpLFxuXHRcdFx0XHRcdGljb246IHRpbWVsaW5lUmVmcmVzaCxcblx0XHRcdFx0XHRjYXRlZ29yeTogbG9jYWxpemUyKCd0aW1lbGluZScsIFwiVGltZWxpbmVcIiksXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5UaW1lbGluZVRpdGxlLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRcdG9yZGVyOiA5OSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRcdFx0cGFuZS5yZXNldCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCd0aW1lbGluZS50b2dnbGVGb2xsb3dBY3RpdmVFZGl0b3InLFxuXHRcdFx0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pID0+IHBhbmUuZm9sbG93QWN0aXZlRWRpdG9yID0gIXBhbmUuZm9sbG93QWN0aXZlRWRpdG9yXG5cdFx0KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlRpbWVsaW5lVGl0bGUsICh7XG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkOiAndGltZWxpbmUudG9nZ2xlRm9sbG93QWN0aXZlRWRpdG9yJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGltZWxpbmUudG9nZ2xlRm9sbG93QWN0aXZlRWRpdG9yQ29tbWFuZC5mb2xsb3cnLCAnUGluIHRoZSBDdXJyZW50IFRpbWVsaW5lJyksXG5cdFx0XHRcdGljb246IHRpbWVsaW5lUGluLFxuXHRcdFx0XHRjYXRlZ29yeTogbG9jYWxpemUyKCd0aW1lbGluZScsIFwiVGltZWxpbmVcIiksXG5cdFx0XHR9LFxuXHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdG9yZGVyOiA5OCxcblx0XHRcdHdoZW46IFRpbWVsaW5lRm9sbG93QWN0aXZlRWRpdG9yQ29udGV4dFxuXHRcdH0pKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlRpbWVsaW5lVGl0bGUsICh7XG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkOiAndGltZWxpbmUudG9nZ2xlRm9sbG93QWN0aXZlRWRpdG9yJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGltZWxpbmUudG9nZ2xlRm9sbG93QWN0aXZlRWRpdG9yQ29tbWFuZC51bmZvbGxvdycsICdVbnBpbiB0aGUgQ3VycmVudCBUaW1lbGluZScpLFxuXHRcdFx0XHRpY29uOiB0aW1lbGluZVVucGluLFxuXHRcdFx0XHRjYXRlZ29yeTogbG9jYWxpemUyKCd0aW1lbGluZScsIFwiVGltZWxpbmVcIiksXG5cdFx0XHR9LFxuXHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdG9yZGVyOiA5OCxcblx0XHRcdHdoZW46IFRpbWVsaW5lRm9sbG93QWN0aXZlRWRpdG9yQ29udGV4dC50b05lZ2F0ZWQoKVxuXHRcdH0pKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aW1lbGluZVNlcnZpY2Uub25EaWRDaGFuZ2VQcm92aWRlcnMoKCkgPT4gdGhpcy51cGRhdGVUaW1lbGluZVNvdXJjZUZpbHRlcnMoKSkpO1xuXHRcdHRoaXMudXBkYXRlVGltZWxpbmVTb3VyY2VGaWx0ZXJzKCk7XG5cdH1cblxuXHRnZXRJdGVtQWN0aW9ucyhlbGVtZW50OiBUcmVlRWxlbWVudCk6IElBY3Rpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0QWN0aW9ucyhNZW51SWQuVGltZWxpbmVJdGVtQ29udGV4dCwgeyBrZXk6ICd0aW1lbGluZUl0ZW0nLCB2YWx1ZTogZWxlbWVudC5jb250ZXh0VmFsdWUgfSkucHJpbWFyeTtcblx0fVxuXG5cdGdldEl0ZW1Db250ZXh0QWN0aW9ucyhlbGVtZW50OiBUcmVlRWxlbWVudCk6IElBY3Rpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0QWN0aW9ucyhNZW51SWQuVGltZWxpbmVJdGVtQ29udGV4dCwgeyBrZXk6ICd0aW1lbGluZUl0ZW0nLCB2YWx1ZTogZWxlbWVudC5jb250ZXh0VmFsdWUgfSkuc2Vjb25kYXJ5O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBY3Rpb25zKG1lbnVJZDogTWVudUlkLCBjb250ZXh0OiB7IGtleTogc3RyaW5nOyB2YWx1ZT86IHN0cmluZyB9KTogeyBwcmltYXJ5OiBJQWN0aW9uW107IHNlY29uZGFyeTogSUFjdGlvbltdIH0ge1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVPdmVybGF5KFtcblx0XHRcdFsndmlldycsIHRoaXMucGFuZS5pZF0sXG5cdFx0XHRbY29udGV4dC5rZXksIGNvbnRleHQudmFsdWVdLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgbWVudSA9IHRoaXMubWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMobWVudUlkLCBjb250ZXh0S2V5U2VydmljZSwgeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9KTtcblx0XHRyZXR1cm4gZ2V0Q29udGV4dE1lbnVBY3Rpb25zKG1lbnUsICdpbmxpbmUnKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVGltZWxpbmVTb3VyY2VGaWx0ZXJzKCkge1xuXHRcdHRoaXMuc291cmNlRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGNvbnN0IGV4Y2x1ZGVkID0gbmV3IFNldChKU09OLnBhcnNlKHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KCd0aW1lbGluZS5leGNsdWRlU291cmNlcycsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCAnW10nKSkpO1xuXHRcdGZvciAoY29uc3Qgc291cmNlIG9mIHRoaXMudGltZWxpbmVTZXJ2aWNlLmdldFNvdXJjZXMoKSkge1xuXHRcdFx0dGhpcy5zb3VyY2VEaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRcdGlkOiBgdGltZWxpbmUudG9nZ2xlRXhjbHVkZVNvdXJjZToke3NvdXJjZS5pZH1gLFxuXHRcdFx0XHRcdFx0dGl0bGU6IHNvdXJjZS5sYWJlbCxcblx0XHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5UaW1lbGluZUZpbHRlclN1Yk1lbnUsXG5cdFx0XHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0dG9nZ2xlZDogQ29udGV4dEtleUV4cHIucmVnZXgoYHRpbWVsaW5lRXhjbHVkZVNvdXJjZXNgLCBuZXcgUmVnRXhwKGBcXFxcYiR7ZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyhzb3VyY2UuaWQpfVxcXFxiYCkpLm5lZ2F0ZSgpXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRcdFx0XHRpZiAoIWV4Y2x1ZGVkLmRlbGV0ZShzb3VyY2UuaWQpKSB7XG5cdFx0XHRcdFx0XHRleGNsdWRlZC5hZGQoc291cmNlLmlkKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRcdFx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCd0aW1lbGluZS5leGNsdWRlU291cmNlcycsIEpTT04uc3RyaW5naWZ5KFsuLi5leGNsdWRlZC5rZXlzKCldKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsWUFBWSxTQUFTO0FBQ3JCLFlBQVksU0FBUztBQUNyQixTQUFrQixvQkFBb0I7QUFDdEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBc0I7QUFDL0IsU0FBcUIscUJBQXFCO0FBQzFDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQThCLGtCQUFrQjtBQUN6RCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsaUJBQWlCO0FBRzFCLFNBQVMsZ0JBQWtDO0FBQzNDLFNBQVMsMkJBQTJC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LE9BQU8sUUFBUSxhQUFhLENBQUMsRUFBRTtBQUFBLEVBQzFHO0FBQUEsRUFFUSxXQUFXLFFBQWdCLFNBQXdGO0FBQzFILFVBQU0sb0JBQW9CLEtBQUssa0JBQWtCLGNBQWM7QUFBQSxNQUM5RCxDQUFDLFFBQVEsS0FBSyxLQUFLLEVBQUU7QUFBQSxNQUNyQixDQUFDLFFBQVEsS0FBSyxRQUFRLEtBQUs7QUFBQSxJQUM1QixDQUFDO0FBRUQsVUFBTSxPQUFPLEtBQUssWUFBWSxlQUFlLFFBQVEsbUJBQW1CLEVBQUUsbUJBQW1CLEtBQUssQ0FBQztBQUNuRyxXQUFPLHNCQUFzQixNQUFNLFFBQVE7QUFBQSxFQUM1QztBQUFBLEVBRVEsOEJBQThCO0FBQ3JDLFNBQUssa0JBQWtCLE1BQU07QUFFN0IsVUFBTSxXQUFXLElBQUksSUFBSSxLQUFLLE1BQU0sS0FBSyxlQUFlLElBQUksMkJBQTJCLGFBQWEsU0FBUyxJQUFJLENBQUMsQ0FBQztBQUNuSCxlQUFXLFVBQVUsS0FBSyxnQkFBZ0IsV0FBVyxHQUFHO0FBQ3ZELFdBQUssa0JBQWtCLElBQUksZ0JBQWdCLGNBQWMsUUFBUTtBQUFBLFFBQ2hFLGNBQWM7QUFDYixnQkFBTTtBQUFBLFlBQ0wsSUFBSSxnQ0FBZ0MsT0FBTyxFQUFFO0FBQUEsWUFDN0MsT0FBTyxPQUFPO0FBQUEsWUFDZCxNQUFNO0FBQUEsY0FDTCxJQUFJLE9BQU87QUFBQSxjQUNYLE9BQU87QUFBQSxZQUNSO0FBQUEsWUFDQSxTQUFTLGVBQWUsTUFBTSwwQkFBMEIsSUFBSSxPQUFPLE1BQU0sdUJBQXVCLE9BQU8sRUFBRSxDQUFDLEtBQUssQ0FBQyxFQUFFLE9BQU87QUFBQSxVQUMxSCxDQUFDO0FBQUEsUUFDRjtBQUFBLFFBQ0EsSUFBSSxhQUErQixNQUFpQjtBQUNuRCxjQUFJLENBQUMsU0FBUyxPQUFPLE9BQU8sRUFBRSxHQUFHO0FBQ2hDLHFCQUFTLElBQUksT0FBTyxFQUFFO0FBQUEsVUFDdkI7QUFFQSxnQkFBTSxpQkFBaUIsU0FBUyxJQUFJLGVBQWU7QUFDbkQseUJBQWUsTUFBTSwyQkFBMkIsS0FBSyxVQUFVLENBQUMsR0FBRyxTQUFTLEtBQUssQ0FBQyxDQUFDLEdBQUcsYUFBYSxTQUFTLGNBQWMsSUFBSTtBQUFBLFFBQy9IO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFBQSxJQUNIO0FBQUEsRUFDRDtBQUNEO0FBL0dNLHVCQUFOO0FBQUEsRUFLRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBUkc7IiwKICAibmFtZXMiOiBbIml0ZW0iLCAiZ2V0TmV4dE1vc3RSZWNlbnRTb3VyY2UiXQp9Cg==
