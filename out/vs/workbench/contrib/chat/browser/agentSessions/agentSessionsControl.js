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
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchCompressibleAsyncDataTree } from "../../../../../platform/list/browser/listService.js";
import { $, append, EventHelper, addDisposableListener, EventType, getWindow, hide, setVisibility } from "../../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../../base/browser/keyboardEvent.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { localize } from "../../../../../nls.js";
import { AgentSessionSection, getAgentSessionPullRequestContextValue, isAgentSession, isAgentSessionSection, isAgentSessionShowLess, isAgentSessionShowMore } from "./agentSessionsModel.js";
import { AgentSessionRenderer, AgentSessionsAccessibilityProvider, AgentSessionsCompressionDelegate, AgentSessionsDataSource, AgentSessionsDragAndDrop, AgentSessionsIdentityProvider, AgentSessionsKeyboardNavigationLabelProvider, AgentSessionsListDelegate, AgentSessionSectionRenderer, AgentSessionSectionLabels, AgentSessionShowLessRenderer, AgentSessionShowMoreRenderer, AgentSessionsSorter, getRepositoryName } from "./agentSessionsViewer.js";
import { AgentSessionsGrouping, AgentSessionsSorting } from "./agentSessionsFilter.js";
import { AgentSessionApprovalModel } from "./agentSessionApprovalModel.js";
import { IMenuService, MenuId } from "../../../../../platform/actions/common/actions.js";
import { IChatSessionsService } from "../../common/chatSessionsService.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { ACTION_ID_NEW_CHAT } from "../actions/chatActions.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { Throttler } from "../../../../../base/common/async.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { MarshalledId } from "../../../../../base/common/marshallingIds.js";
import { Separator } from "../../../../../base/common/actions.js";
import { RenderIndentGuides, TreeFindMode } from "../../../../../base/browser/ui/tree/abstractTree.js";
import { IAgentSessionsService } from "./agentSessionsService.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { openSession } from "./agentSessionsOpener.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { ChatEditorInput } from "../widgetHosts/editor/chatEditorInput.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { LayoutSettings } from "../../../../services/layout/browser/layoutService.js";
let AgentSessionsControl = class extends Disposable {
  constructor(container, options, contextMenuService, contextKeyService, instantiationService, chatSessionsService, commandService, menuService, agentSessionsService, telemetryService, editorService, storageService, accessibilityService, configurationService) {
    super();
    this.container = container;
    this.options = options;
    this.contextMenuService = contextMenuService;
    this.contextKeyService = contextKeyService;
    this.instantiationService = instantiationService;
    this.chatSessionsService = chatSessionsService;
    this.commandService = commandService;
    this.menuService = menuService;
    this.agentSessionsService = agentSessionsService;
    this.telemetryService = telemetryService;
    this.editorService = editorService;
    this.storageService = storageService;
    this.accessibilityService = accessibilityService;
    this.configurationService = configurationService;
    this.sessionsListFindIsOpen = false;
    this._isProgrammaticCollapseChange = false;
    this._recentRepositoryLabels = /* @__PURE__ */ new Set();
    this.updateSessionsListThrottler = this._register(new Throttler());
    this._onDidUpdate = this._register(new Emitter());
    this.onDidUpdate = this._onDidUpdate.event;
    this.visible = true;
    this.hasPendingUpdate = false;
    this.focusedAgentSessionArchivedContextKey = ChatContextKeys.isArchivedAgentSession.bindTo(this.contextKeyService);
    this.focusedAgentSessionPinnedContextKey = ChatContextKeys.isPinnedAgentSession.bindTo(this.contextKeyService);
    this.focusedAgentSessionReadContextKey = ChatContextKeys.isReadAgentSession.bindTo(this.contextKeyService);
    this.focusedAgentSessionTypeContextKey = ChatContextKeys.agentSessionType.bindTo(this.contextKeyService);
    this.hasMultipleAgentSessionsSelectedContextKey = ChatContextKeys.hasMultipleAgentSessionsSelected.bindTo(this.contextKeyService);
    this.create(this.container);
    this.registerListeners();
  }
  get element() {
    return this.sessionsContainer;
  }
  registerListeners() {
    this._register(this.editorService.onDidActiveEditorChange(() => this.revealAndFocusActiveEditorSession()));
  }
  revealAndFocusActiveEditorSession() {
    if (!this.options.trackActiveEditorSession() || !this.visible) {
      return;
    }
    const input = this.editorService.activeEditor;
    const resource = input instanceof ChatEditorInput ? input.sessionResource : input?.resource;
    if (!resource) {
      return;
    }
    const matchingSession = this.agentSessionsService.model.getSession(resource);
    if (matchingSession && this.sessionsList?.hasNode(matchingSession)) {
      if (this.sessionsList.getRelativeTop(matchingSession) === null) {
        this.sessionsList.reveal(matchingSession, 0.5);
      }
      this.sessionsList.setFocus([matchingSession]);
      this.sessionsList.setSelection([matchingSession]);
    }
  }
  create(container) {
    this.sessionsContainer = append(container, $(".agent-sessions-viewer"));
    this.createEmptyFilterMessage(this.sessionsContainer);
    this.createList(this.sessionsContainer);
  }
  createEmptyFilterMessage(container) {
    this.emptyFilterMessage = append(container, $(".agent-sessions-empty-filter-message"));
    hide(this.emptyFilterMessage);
    const span = append(this.emptyFilterMessage, $("span"));
    span.textContent = `${localize("agentSessions.noFilterResults", "No matching sessions")} - `;
    const link = append(this.emptyFilterMessage, $("span.reset-filter-link"));
    link.textContent = localize("agentSessions.resetFilter", "Reset Filter");
    link.tabIndex = 0;
    link.setAttribute("role", "button");
    this._register(addDisposableListener(link, EventType.CLICK, () => this.options.filter.reset()));
    this._register(addDisposableListener(link, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.keyCode === KeyCode.Enter || event.keyCode === KeyCode.Space) {
        EventHelper.stop(e, true);
        this.options.filter.reset();
      }
    }));
  }
  getSavedCollapseState(section) {
    const raw = this.storageService.get(AgentSessionsControl.SECTION_COLLAPSE_STATE_KEY, StorageScope.PROFILE);
    if (raw) {
      try {
        const state = JSON.parse(raw);
        if (typeof state[section] === "boolean") {
          return state[section];
        }
      } catch {
      }
    }
    return void 0;
  }
  saveSectionCollapseState(section, collapsed) {
    let state = {};
    const raw = this.storageService.get(AgentSessionsControl.SECTION_COLLAPSE_STATE_KEY, StorageScope.PROFILE);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          state = parsed;
        }
      } catch {
      }
    }
    state[section] = collapsed;
    this.storageService.store(AgentSessionsControl.SECTION_COLLAPSE_STATE_KEY, JSON.stringify(state), StorageScope.PROFILE, StorageTarget.USER);
  }
  resetSectionCollapseState() {
    this.storageService.remove(AgentSessionsControl.SECTION_COLLAPSE_STATE_KEY, StorageScope.PROFILE);
  }
  createList(container) {
    const collapseByDefault = (element) => {
      if (isAgentSessionSection(element)) {
        const saved = this.getSavedCollapseState(element.section);
        if (saved !== void 0) {
          return saved;
        }
        if (element.section === AgentSessionSection.More && !this.options.filter.getExcludes().read) {
          return true;
        }
        if (element.section === AgentSessionSection.Archived && this.options.filter.getExcludes().archived) {
          return true;
        }
        if (this.options.collapseOlderSections?.()) {
          const olderSections = [AgentSessionSection.Week, AgentSessionSection.Older, AgentSessionSection.Archived];
          if (olderSections.includes(element.section)) {
            return true;
          }
          if (element.section === AgentSessionSection.Yesterday && this.hasTodaySessions()) {
            return true;
          }
          if (element.section === AgentSessionSection.Repository && !this._recentRepositoryLabels.has(element.label)) {
            return true;
          }
        }
      }
      return false;
    };
    const sorter = new AgentSessionsSorter(() => this.options.filter.sortResults?.() ?? AgentSessionsSorting.Created);
    const approvalModel = this.options.enableApprovalRow ? this._register(this.instantiationService.createInstance(AgentSessionApprovalModel)) : void 0;
    const activeSessionResource = observableValue(this, void 0);
    const sessionRenderer = this._register(this.instantiationService.createInstance(AgentSessionRenderer, {
      ...this.options,
      isGroupedByRepository: () => this.options.filter.groupResults?.() === AgentSessionsGrouping.Repository,
      isSortedByUpdated: () => this.options.filter.sortResults?.() === AgentSessionsSorting.Updated,
      pauseSessionUpdates: () => this.pauseUpdates()
    }, approvalModel, activeSessionResource));
    const compact = this.options.compactShowMore;
    const sessionDataSource = this.sessionsDataSource = this._register(new AgentSessionsDataSource(this.options.filter, sorter, this.options.repositoryGroupLimit));
    const listDelegate = new AgentSessionsListDelegate(
      approvalModel,
      this.options.compactShowMore,
      () => this.options.itemHeight ?? (this.configurationService.getValue(LayoutSettings.MODERN_UI) === true ? AgentSessionsListDelegate.COMPACT_ITEM_HEIGHT : AgentSessionsListDelegate.ITEM_HEIGHT),
      () => this.options.sectionHeight ?? (this.configurationService.getValue(LayoutSettings.MODERN_UI) === true ? AgentSessionsListDelegate.SPACED_SECTION_HEIGHT : AgentSessionsListDelegate.SECTION_HEIGHT)
    );
    const list = this.sessionsList = this._register(this.instantiationService.createInstance(
      WorkbenchCompressibleAsyncDataTree,
      "AgentSessionsView",
      container,
      listDelegate,
      new AgentSessionsCompressionDelegate(),
      [
        sessionRenderer,
        this.instantiationService.createInstance(AgentSessionSectionRenderer, { hideSectionCount: this.options.hideSectionCount }),
        new AgentSessionShowMoreRenderer({ compactLabel: this.options.compactShowMore }),
        new AgentSessionShowLessRenderer()
      ],
      sessionDataSource,
      {
        accessibilityProvider: new AgentSessionsAccessibilityProvider(),
        dnd: this.instantiationService.createInstance(AgentSessionsDragAndDrop),
        identityProvider: new AgentSessionsIdentityProvider(),
        horizontalScrolling: false,
        multipleSelectionSupport: true,
        findWidgetEnabled: true,
        defaultFindMode: TreeFindMode.Filter,
        keyboardNavigationLabelProvider: new AgentSessionsKeyboardNavigationLabelProvider(),
        overrideStyles: this.options.overrideStyles,
        twistieAdditionalCssClass: () => "force-no-twistie",
        collapseByDefault: (element) => collapseByDefault(element),
        renderIndentGuides: RenderIndentGuides.None
      }
    ));
    ChatContextKeys.agentSessionsViewerFocused.bindTo(list.contextKeyService);
    this._register(this.configurationService.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration(LayoutSettings.MODERN_UI)) {
        return;
      }
      const nodes = [...list.getNode().children];
      while (nodes.length > 0) {
        const node = nodes.pop();
        if (isAgentSession(node.element) || isAgentSessionSection(node.element)) {
          list.updateElementHeight(node.element, listDelegate.getHeight(node.element));
        }
        nodes.push(...node.children);
      }
    }));
    this._register(sessionRenderer.onDidChangeItemHeight((session) => {
      if (list.hasNode(session)) {
        list.updateElementHeight(session, void 0);
      }
    }));
    if (compact) {
      let expandedShowMoreElement;
      let expandedSectionLabel;
      let currentAnimatedHeight = AgentSessionShowMoreRenderer.COLLAPSED_HEIGHT;
      const sectionToShowMore = /* @__PURE__ */ new Map();
      const rebuildSectionMap = () => {
        sectionToShowMore.clear();
        try {
          const rootNode = list.getNode();
          for (const sectionNode of rootNode.children) {
            if (isAgentSessionSection(sectionNode.element)) {
              const label = sectionNode.element.label;
              for (const child of sectionNode.children) {
                if (isAgentSessionShowMore(child.element) || isAgentSessionShowLess(child.element)) {
                  sectionToShowMore.set(label, child.element);
                }
              }
            }
          }
        } catch {
        }
      };
      let expandAnimationId;
      let collapseAnimationId;
      const targetWindow = getWindow(container);
      this._register({
        dispose: () => {
          if (expandAnimationId) {
            targetWindow.cancelAnimationFrame(expandAnimationId);
          }
          if (collapseAnimationId) {
            targetWindow.cancelAnimationFrame(collapseAnimationId);
          }
        }
      });
      const animateHeight = (element, from, to, onComplete) => {
        if (this.accessibilityService.isMotionReduced()) {
          if (list.hasNode(element)) {
            isUpdatingHeight = true;
            try {
              list.updateElementHeight(element, to);
            } finally {
              isUpdatingHeight = false;
            }
            currentAnimatedHeight = to;
          }
          onComplete?.();
          return void 0;
        }
        const duration = 150;
        const start = Date.now();
        const step = () => {
          const elapsed = Date.now() - start;
          const progress = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 2);
          const height = Math.round(from + (to - from) * eased);
          if (list.hasNode(element)) {
            isUpdatingHeight = true;
            try {
              list.updateElementHeight(element, height);
            } finally {
              isUpdatingHeight = false;
            }
            currentAnimatedHeight = height;
          }
          if (progress < 1) {
            return targetWindow.requestAnimationFrame(step);
          }
          onComplete?.();
          return void 0;
        };
        return targetWindow.requestAnimationFrame(step);
      };
      const collapseCurrentShowMore = () => {
        if (collapseAnimationId) {
          targetWindow.cancelAnimationFrame(collapseAnimationId);
          collapseAnimationId = void 0;
        }
        if (expandAnimationId) {
          targetWindow.cancelAnimationFrame(expandAnimationId);
          expandAnimationId = void 0;
        }
        if (expandedShowMoreElement && expandedSectionLabel) {
          if (list.hasNode(expandedShowMoreElement)) {
            collapseAnimationId = animateHeight(
              expandedShowMoreElement,
              currentAnimatedHeight,
              AgentSessionShowMoreRenderer.COLLAPSED_HEIGHT,
              () => {
                collapseAnimationId = void 0;
              }
            );
          }
        }
        expandedShowMoreElement = void 0;
        expandedSectionLabel = void 0;
      };
      const expandShowMore = (sectionLabel) => {
        if (expandedSectionLabel === sectionLabel) {
          return;
        }
        collapseCurrentShowMore();
        const showMoreItem = sectionToShowMore.get(sectionLabel);
        if (!showMoreItem || !list.hasNode(showMoreItem)) {
          return;
        }
        expandedShowMoreElement = showMoreItem;
        expandedSectionLabel = sectionLabel;
        currentAnimatedHeight = AgentSessionShowMoreRenderer.COLLAPSED_HEIGHT;
        expandAnimationId = animateHeight(
          showMoreItem,
          AgentSessionShowMoreRenderer.COLLAPSED_HEIGHT,
          AgentSessionShowMoreRenderer.HEIGHT,
          () => {
            expandAnimationId = void 0;
          }
        );
      };
      let isUpdatingHeight = false;
      this._register(list.onDidChangeModel(() => {
        if (isUpdatingHeight) {
          return;
        }
        expandedShowMoreElement = void 0;
        expandedSectionLabel = void 0;
        currentAnimatedHeight = AgentSessionShowMoreRenderer.COLLAPSED_HEIGHT;
        rebuildSectionMap();
      }));
      this._register(addDisposableListener(container, "mouseover", (e) => {
        const target = e.target;
        const row = target.closest(".monaco-list-row");
        if (!row) {
          return;
        }
        let sectionLabel;
        const sectionHeaderEl = row.querySelector(".agent-session-section-label");
        if (sectionHeaderEl) {
          sectionLabel = sectionHeaderEl.textContent ?? void 0;
        }
        if (!sectionLabel) {
          const showMoreEl = row.querySelector(".agent-session-show-more");
          if (showMoreEl) {
            sectionLabel = showMoreEl.getAttribute("data-section-label") ?? void 0;
          }
        }
        if (!sectionLabel) {
          const sessionItem = row.querySelector(".agent-session-item[data-section-label]");
          if (sessionItem) {
            sectionLabel = sessionItem.getAttribute("data-section-label") ?? void 0;
          }
        }
        if (!sectionLabel) {
          if (row.querySelector(".agent-session-item")) {
            return;
          }
          collapseCurrentShowMore();
          return;
        }
        if (!sectionToShowMore.has(sectionLabel)) {
          collapseCurrentShowMore();
          return;
        }
        expandShowMore(sectionLabel);
      }));
      this._register(addDisposableListener(container, "mouseleave", () => {
        collapseCurrentShowMore();
      }));
      rebuildSectionMap();
    }
    this._register(sessionDataSource.onDidGetChildren((count) => {
      this.updateEmpty(count === 0);
    }));
    this._register(sessionDataSource.onDidExpandRepositoryGroup(() => {
      this.update();
    }));
    const model = this.agentSessionsService.model;
    this._register(this.options.filter.onDidChange(async () => {
      if (this.visible) {
        this.updateSectionCollapseStates();
        this.update();
      }
    }));
    this._register(model.onDidChangeSessions(() => {
      if (this.visible) {
        this.update();
      }
    }));
    this.computeRecentRepositoryLabels();
    list.setInput(model);
    this._register(list.onDidOpen((e) => this.openAgentSession(e)));
    this._register(list.onContextMenu((e) => this.showContextMenu(e)));
    this._register(list.onMouseDblClick(({ element }) => {
      if (element === null) {
        this.commandService.executeCommand(ACTION_ID_NEW_CHAT);
      }
    }));
    this._register(Event.any(list.onDidChangeFocus, list.onDidChangeSelection, model.onDidChangeSessions)(() => {
      const focused = list.getFocus().at(0);
      if (focused && isAgentSession(focused)) {
        this.focusedAgentSessionArchivedContextKey.set(focused.isArchived());
        this.focusedAgentSessionPinnedContextKey.set(focused.isPinned());
        this.focusedAgentSessionReadContextKey.set(focused.isRead());
        this.focusedAgentSessionTypeContextKey.set(focused.providerType);
        activeSessionResource.set(focused.resource, void 0);
      } else {
        this.focusedAgentSessionArchivedContextKey.reset();
        this.focusedAgentSessionPinnedContextKey.reset();
        this.focusedAgentSessionReadContextKey.reset();
        this.focusedAgentSessionTypeContextKey.reset();
        activeSessionResource.set(void 0, void 0);
      }
      const selection = list.getSelection().filter(isAgentSession);
      this.hasMultipleAgentSessionsSelectedContextKey.set(selection.length > 1);
    }));
    this._register(list.onDidChangeFindOpenState((open) => {
      this.sessionsListFindIsOpen = open;
      this.updateSectionCollapseStates();
    }));
    this._register(list.onDidChangeCollapseState((e) => {
      if (this._isProgrammaticCollapseChange) {
        return;
      }
      const element = e.node.element?.element;
      if (element && isAgentSessionSection(element)) {
        this.saveSectionCollapseState(element.section, e.node.collapsed);
      }
    }));
  }
  updateEmpty(isEmpty) {
    if (!this.emptyFilterMessage || !this.sessionsList) {
      return;
    }
    const model = this.agentSessionsService.model;
    const hasSessionsInModel = model.sessions.length > 0;
    const isFilterActive = !this.options.filter.isDefault();
    const showEmpty = hasSessionsInModel && isEmpty && isFilterActive;
    setVisibility(showEmpty, this.emptyFilterMessage);
    setVisibility(!showEmpty, this.sessionsList.getHTMLElement());
  }
  hasTodaySessions() {
    const startOfToday = (/* @__PURE__ */ new Date()).setHours(0, 0, 0, 0);
    return this.agentSessionsService.model.sessions.some(
      (session) => !session.isArchived() && session.timing.created >= startOfToday
    );
  }
  computeRecentRepositoryLabels() {
    this._recentRepositoryLabels.clear();
    const sessions = this.agentSessionsService.model.sessions.filter((s) => !s.isArchived() && !s.isPinned()).sort((a, b) => b.timing.created - a.timing.created).slice(0, AgentSessionsControl.RECENT_SESSIONS_FOR_EXPAND);
    for (const session of sessions) {
      const name = getRepositoryName(session);
      this._recentRepositoryLabels.add(name ?? AgentSessionSectionLabels[AgentSessionSection.Repository]);
    }
  }
  async openAgentSession(e) {
    const element = e.element;
    if (!element || isAgentSessionSection(element)) {
      return;
    }
    if (isAgentSessionShowMore(element)) {
      this.sessionsDataSource?.expandRepositoryGroup(element.sectionLabel);
      return;
    }
    if (isAgentSessionShowLess(element)) {
      this.sessionsDataSource?.collapseRepositoryGroup(element.sectionLabel);
      return;
    }
    this.telemetryService.publicLog2("agentSessionOpened", {
      providerType: element.providerType,
      source: this.options.source
    });
    const options = this.options.overrideSessionOpenOptions?.(e) ?? e;
    if (this.options.overrideSessionOpen) {
      await this.options.overrideSessionOpen(element.resource, options);
    } else {
      const widget = await this.instantiationService.invokeFunction(openSession, element, options);
      if (widget) {
        this.options.notifySessionOpened?.(element.resource, widget);
      }
    }
  }
  async showContextMenu({ element, anchor, browserEvent }) {
    if (!element || isAgentSessionShowMore(element) || isAgentSessionShowLess(element)) {
      return;
    }
    EventHelper.stop(browserEvent, true);
    if (isAgentSessionSection(element)) {
      this.showAgentSessionSectionContextMenu(element, anchor);
    } else {
      this.showAgentSessionContextMenu(element, anchor);
    }
  }
  async showAgentSessionSectionContextMenu(section, anchor) {
    const contextOverlay = [];
    contextOverlay.push([ChatContextKeys.agentSessionSection.key, section.section]);
    const menu = this.menuService.createMenu(MenuId.AgentSessionSectionContext, this.contextKeyService.createOverlay(contextOverlay));
    this.contextMenuService.showContextMenu({
      getActions: () => Separator.join(...menu.getActions({ arg: section, shouldForwardArgs: true }).map(([, actions]) => actions)),
      getAnchor: () => anchor,
      getActionsContext: () => this
    });
    menu.dispose();
  }
  async showAgentSessionContextMenu(session, anchor) {
    this.chatSessionsService.activateChatSessionItemProvider(session.providerType);
    const contextOverlay = [];
    contextOverlay.push([ChatContextKeys.isArchivedAgentSession.key, session.isArchived()]);
    contextOverlay.push([ChatContextKeys.isPinnedAgentSession.key, session.isPinned()]);
    contextOverlay.push([ChatContextKeys.isReadAgentSession.key, session.isRead()]);
    contextOverlay.push([ChatContextKeys.agentSessionType.key, session.providerType]);
    contextOverlay.push([ChatContextKeys.agentSessionPullRequest.key, getAgentSessionPullRequestContextValue(session)]);
    const menu = this.menuService.createMenu(MenuId.AgentSessionsContext, this.contextKeyService.createOverlay(contextOverlay));
    const selection = this.sessionsList?.getSelection().filter(isAgentSession) ?? [];
    const marshalledContext = {
      session,
      sessions: selection.length > 1 && selection.includes(session) ? selection : [session],
      $mid: MarshalledId.AgentSessionContext
    };
    this.contextMenuService.showContextMenu({
      getActions: () => Separator.join(...menu.getActions({ arg: marshalledContext, shouldForwardArgs: true }).map(([, actions]) => actions)),
      getAnchor: () => anchor,
      getActionsContext: () => marshalledContext
    });
    menu.dispose();
  }
  openFind() {
    this.sessionsList?.openFind();
  }
  updateSectionCollapseStates() {
    if (!this.sessionsList) {
      return;
    }
    this._isProgrammaticCollapseChange = true;
    try {
      this._updateSectionCollapseStatesCore();
    } finally {
      this._isProgrammaticCollapseChange = false;
    }
  }
  _updateSectionCollapseStatesCore() {
    if (!this.sessionsList) {
      return;
    }
    const model = this.agentSessionsService.model;
    for (const child of this.sessionsList.getNode(model).children) {
      if (!isAgentSessionSection(child.element)) {
        continue;
      }
      switch (child.element.section) {
        case AgentSessionSection.Archived: {
          const shouldCollapseArchived = !this.sessionsListFindIsOpen && // always expand when find is open
          this.options.filter.getExcludes().archived;
          if (shouldCollapseArchived && !child.collapsed) {
            this.sessionsList.collapse(child.element);
          } else if (!shouldCollapseArchived && child.collapsed) {
            this.sessionsList.expand(child.element);
          }
          break;
        }
        case AgentSessionSection.More: {
          if (child.collapsed && this.sessionsListFindIsOpen) {
            this.sessionsList.expand(child.element);
          }
          break;
        }
      }
    }
  }
  refresh() {
    return this.agentSessionsService.model.resolve(void 0);
  }
  collapseAllSections() {
    if (!this.sessionsList) {
      return;
    }
    const model = this.agentSessionsService.model;
    for (const child of this.sessionsList.getNode(model).children) {
      if (isAgentSessionSection(child.element) && !child.collapsed) {
        this.sessionsList.collapse(child.element);
      }
    }
  }
  async update() {
    if (this.updatePauseOwner) {
      this.hasPendingUpdate = true;
      return false;
    }
    return this.updateSessionsListThrottler.queue(async () => {
      if (this.updatePauseOwner) {
        this.hasPendingUpdate = true;
        return false;
      }
      this.hasPendingUpdate = false;
      this.computeRecentRepositoryLabels();
      await this.sessionsList?.updateChildren();
      this._onDidUpdate.fire();
      return true;
    });
  }
  pauseUpdates() {
    const owner = {};
    this.updatePauseOwner = owner;
    return toDisposable(() => {
      if (this.updatePauseOwner !== owner) {
        return;
      }
      this.updatePauseOwner = void 0;
      if (this.hasPendingUpdate && this.visible) {
        this.update();
      }
    });
  }
  setVisible(visible) {
    if (this.visible === visible) {
      return;
    }
    this.visible = visible;
    if (this.visible) {
      this.update();
    }
  }
  layout(height, width) {
    this.sessionsList?.layout(height, width);
  }
  focus() {
    this.sessionsList?.domFocus();
    try {
      if ((this.sessionsList?.getFocus().length ?? 0) === 0) {
        this.sessionsList?.focusFirst();
      }
    } catch {
    }
  }
  clearFocus() {
    this.sessionsList?.setFocus([]);
    this.sessionsList?.setSelection([]);
  }
  hasFocusOrSelection() {
    return (this.sessionsList?.getFocus().length ?? 0) > 0 || (this.sessionsList?.getSelection().length ?? 0) > 0;
  }
  scrollToTop() {
    if (this.sessionsList) {
      this.sessionsList.scrollTop = 0;
    }
  }
  getFocus() {
    const focused = this.sessionsList?.getFocus() ?? [];
    return focused.filter((e) => isAgentSession(e));
  }
  reveal(sessionResource) {
    if (!this.sessionsList) {
      return false;
    }
    const session = this.agentSessionsService.model.getSession(sessionResource);
    if (!session || !this.sessionsList.hasNode(session)) {
      return false;
    }
    try {
      if (this.sessionsList.getRelativeTop(session) === null) {
        this.sessionsList.reveal(session, 0.5);
      }
    } catch {
      return false;
    }
    this.sessionsList.setFocus([session]);
    this.sessionsList.setSelection([session]);
    return true;
  }
};
AgentSessionsControl.RECENT_SESSIONS_FOR_EXPAND = 5;
AgentSessionsControl.SECTION_COLLAPSE_STATE_KEY = "agentSessions.sectionCollapseState";
AgentSessionsControl = __decorateClass([
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IChatSessionsService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, IMenuService),
  __decorateParam(8, IAgentSessionsService),
  __decorateParam(9, ITelemetryService),
  __decorateParam(10, IEditorService),
  __decorateParam(11, IStorageService),
  __decorateParam(12, IAccessibilityService),
  __decorateParam(13, IConfigurationService)
], AgentSessionsControl);
export {
  AgentSessionsControl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50U2Vzc2lvbnNDb250cm9sLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5FdmVudCwgV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyAkLCBhcHBlbmQsIEV2ZW50SGVscGVyLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIEV2ZW50VHlwZSwgZ2V0V2luZG93LCBoaWRlLCBzZXRWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uU2VjdGlvbiwgZ2V0QWdlbnRTZXNzaW9uUHVsbFJlcXVlc3RDb250ZXh0VmFsdWUsIElBZ2VudFNlc3Npb24sIElBZ2VudFNlc3Npb25TZWN0aW9uLCBJQWdlbnRTZXNzaW9uc01vZGVsLCBJTWFyc2hhbGxlZEFnZW50U2Vzc2lvbkNvbnRleHQsIGlzQWdlbnRTZXNzaW9uLCBpc0FnZW50U2Vzc2lvblNlY3Rpb24sIGlzQWdlbnRTZXNzaW9uU2hvd0xlc3MsIGlzQWdlbnRTZXNzaW9uU2hvd01vcmUgfSBmcm9tICcuL2FnZW50U2Vzc2lvbnNNb2RlbC5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25MaXN0SXRlbSwgQWdlbnRTZXNzaW9uUmVuZGVyZXIsIEFnZW50U2Vzc2lvbnNBY2Nlc3NpYmlsaXR5UHJvdmlkZXIsIEFnZW50U2Vzc2lvbnNDb21wcmVzc2lvbkRlbGVnYXRlLCBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZSwgQWdlbnRTZXNzaW9uc0RyYWdBbmREcm9wLCBBZ2VudFNlc3Npb25zSWRlbnRpdHlQcm92aWRlciwgQWdlbnRTZXNzaW9uc0tleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIsIEFnZW50U2Vzc2lvbnNMaXN0RGVsZWdhdGUsIEFnZW50U2Vzc2lvblNlY3Rpb25SZW5kZXJlciwgQWdlbnRTZXNzaW9uU2VjdGlvbkxhYmVscywgQWdlbnRTZXNzaW9uU2hvd0xlc3NSZW5kZXJlciwgQWdlbnRTZXNzaW9uU2hvd01vcmVSZW5kZXJlciwgQWdlbnRTZXNzaW9uc1NvcnRlciwgZ2V0UmVwb3NpdG9yeU5hbWUsIElBZ2VudFNlc3Npb25zRmlsdGVyIH0gZnJvbSAnLi9hZ2VudFNlc3Npb25zVmlld2VyLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbnNHcm91cGluZywgQWdlbnRTZXNzaW9uc1NvcnRpbmcgfSBmcm9tICcuL2FnZW50U2Vzc2lvbnNGaWx0ZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbCB9IGZyb20gJy4vYWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbC5qcyc7XG5pbXBvcnQgeyBGdXp6eVNjb3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQUNUSU9OX0lEX05FV19DSEFUIH0gZnJvbSAnLi4vYWN0aW9ucy9jaGF0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGhyb3R0bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJVHJlZUNvbnRleHRNZW51RXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IE1hcnNoYWxsZWRJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nSWRzLmpzJztcbmltcG9ydCB7IFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgUmVuZGVySW5kZW50R3VpZGVzLCBUcmVlRmluZE1vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9hYnN0cmFjdFRyZWUuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElMaXN0U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJU3R5bGVPdmVycmlkZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTZXNzaW9uc0NvbnRyb2wgfSBmcm9tICcuL2FnZW50U2Vzc2lvbnMuanMnO1xuaW1wb3J0IHsgSG92ZXJQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlcldpZGdldC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25PcGVuT3B0aW9ucywgb3BlblNlc3Npb24gfSBmcm9tICcuL2FnZW50U2Vzc2lvbnNPcGVuZXIuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRvcklucHV0IH0gZnJvbSAnLi4vd2lkZ2V0SG9zdHMvZWRpdG9yL2NoYXRFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0IH0gZnJvbSAnLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IExheW91dFNldHRpbmdzIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50U2Vzc2lvbnNDb250cm9sT3B0aW9ucyB7XG5cdHJlYWRvbmx5IG92ZXJyaWRlU3R5bGVzOiBJU3R5bGVPdmVycmlkZTxJTGlzdFN0eWxlcz47XG5cdHJlYWRvbmx5IGZpbHRlcjogSUFnZW50U2Vzc2lvbnNGaWx0ZXI7XG5cdHJlYWRvbmx5IHNvdXJjZTogc3RyaW5nO1xuXHRyZWFkb25seSBkaXNhYmxlSG92ZXI/OiBib29sZWFuO1xuXHRyZWFkb25seSBlbmFibGVBcHByb3ZhbFJvdz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHJlcG9zaXRvcnlHcm91cExpbWl0PzogbnVtYmVyO1xuXHRyZWFkb25seSBoaWRlU2VjdGlvbkNvdW50PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaGlkZVNlc3Npb25CYWRnZT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHVzZVN0YXR1c09ubHlJY29ucz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGNvbXBhY3RTaG93TW9yZT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGl0ZW1IZWlnaHQ/OiBudW1iZXI7XG5cdHJlYWRvbmx5IHNlY3Rpb25IZWlnaHQ/OiBudW1iZXI7XG5cblx0Z2V0SG92ZXJQb3NpdGlvbigpOiBIb3ZlclBvc2l0aW9uO1xuXHR0cmFja0FjdGl2ZUVkaXRvclNlc3Npb24oKTogYm9vbGVhbjtcblx0Y29sbGFwc2VPbGRlclNlY3Rpb25zPygpOiBib29sZWFuO1xuXG5cdG92ZXJyaWRlU2Vzc2lvbk9wZW5PcHRpb25zPyhvcGVuRXZlbnQ6IElPcGVuRXZlbnQ8QWdlbnRTZXNzaW9uTGlzdEl0ZW0gfCB1bmRlZmluZWQ+KTogSVNlc3Npb25PcGVuT3B0aW9ucztcblx0b3ZlcnJpZGVTZXNzaW9uT3Blbj8ocmVzb3VyY2U6IFVSSSwgb3Blbk9wdGlvbnM/OiBJU2Vzc2lvbk9wZW5PcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcblx0bm90aWZ5U2Vzc2lvbk9wZW5lZD8ocmVzb3VyY2U6IFVSSSwgd2lkZ2V0OiBJQ2hhdFdpZGdldCk6IHZvaWQ7XG59XG5cbnR5cGUgQWdlbnRTZXNzaW9uT3BlbmVkQ2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAnYnBhc2Vybyc7XG5cdHByb3ZpZGVyVHlwZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBwcm92aWRlciB0eXBlIG9mIHRoZSBvcGVuZWQgYWdlbnQgc2Vzc2lvbi4nIH07XG5cdHNvdXJjZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBzb3VyY2Ugb2YgdGhlIG9wZW5lZCBhZ2VudCBzZXNzaW9uLicgfTtcblx0Y29tbWVudDogJ0V2ZW50IGZpcmVkIHdoZW4gYSBhZ2VudCBzZXNzaW9uIGlzIG9wZW5lZCBmcm9tIHRoZSBhZ2VudCBzZXNzaW9ucyBjb250cm9sLic7XG59O1xuXG50eXBlIEFnZW50U2Vzc2lvbk9wZW5lZEV2ZW50ID0ge1xuXHRwcm92aWRlclR5cGU6IHN0cmluZztcblx0c291cmNlOiBzdHJpbmc7XG59O1xuXG5leHBvcnQgY2xhc3MgQWdlbnRTZXNzaW9uc0NvbnRyb2wgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFnZW50U2Vzc2lvbnNDb250cm9sIHtcblxuXHRwcml2YXRlIHNlc3Npb25zQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0Z2V0IGVsZW1lbnQoKTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5zZXNzaW9uc0NvbnRhaW5lcjsgfVxuXG5cdHByaXZhdGUgZW1wdHlGaWx0ZXJNZXNzYWdlOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHNlc3Npb25zTGlzdDogV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZTxJQWdlbnRTZXNzaW9uc01vZGVsLCBBZ2VudFNlc3Npb25MaXN0SXRlbSwgRnV6enlTY29yZT4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc2Vzc2lvbnNEYXRhU291cmNlOiBBZ2VudFNlc3Npb25zRGF0YVNvdXJjZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUkVDRU5UX1NFU1NJT05TX0ZPUl9FWFBBTkQgPSA1O1xuXG5cdHByaXZhdGUgc2Vzc2lvbnNMaXN0RmluZElzT3BlbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9pc1Byb2dyYW1tYXRpY0NvbGxhcHNlQ2hhbmdlID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlY2VudFJlcG9zaXRvcnlMYWJlbHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHVwZGF0ZVNlc3Npb25zTGlzdFRocm90dGxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaHJvdHRsZXIoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRVcGRhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRVcGRhdGU6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRVcGRhdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSB2aXNpYmxlOiBib29sZWFuID0gdHJ1ZTtcblxuXHRwcml2YXRlIGZvY3VzZWRBZ2VudFNlc3Npb25BcmNoaXZlZENvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGZvY3VzZWRBZ2VudFNlc3Npb25QaW5uZWRDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBmb2N1c2VkQWdlbnRTZXNzaW9uUmVhZENvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGZvY3VzZWRBZ2VudFNlc3Npb25UeXBlQ29udGV4dEtleTogSUNvbnRleHRLZXk8c3RyaW5nPjtcblx0cHJpdmF0ZSBoYXNNdWx0aXBsZUFnZW50U2Vzc2lvbnNTZWxlY3RlZENvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM6IElBZ2VudFNlc3Npb25zQ29udHJvbE9wdGlvbnMsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlc3Npb25zU2VydmljZTogSUNoYXRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElBZ2VudFNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFnZW50U2Vzc2lvbnNTZXJ2aWNlOiBJQWdlbnRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmZvY3VzZWRBZ2VudFNlc3Npb25BcmNoaXZlZENvbnRleHRLZXkgPSBDaGF0Q29udGV4dEtleXMuaXNBcmNoaXZlZEFnZW50U2Vzc2lvbi5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5mb2N1c2VkQWdlbnRTZXNzaW9uUGlubmVkQ29udGV4dEtleSA9IENoYXRDb250ZXh0S2V5cy5pc1Bpbm5lZEFnZW50U2Vzc2lvbi5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5mb2N1c2VkQWdlbnRTZXNzaW9uUmVhZENvbnRleHRLZXkgPSBDaGF0Q29udGV4dEtleXMuaXNSZWFkQWdlbnRTZXNzaW9uLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmZvY3VzZWRBZ2VudFNlc3Npb25UeXBlQ29udGV4dEtleSA9IENoYXRDb250ZXh0S2V5cy5hZ2VudFNlc3Npb25UeXBlLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmhhc011bHRpcGxlQWdlbnRTZXNzaW9uc1NlbGVjdGVkQ29udGV4dEtleSA9IENoYXRDb250ZXh0S2V5cy5oYXNNdWx0aXBsZUFnZW50U2Vzc2lvbnNTZWxlY3RlZC5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLmNyZWF0ZSh0aGlzLmNvbnRhaW5lcik7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgoKSA9PiB0aGlzLnJldmVhbEFuZEZvY3VzQWN0aXZlRWRpdG9yU2Vzc2lvbigpKSk7XG5cdH1cblxuXHRwcml2YXRlIHJldmVhbEFuZEZvY3VzQWN0aXZlRWRpdG9yU2Vzc2lvbigpOiB2b2lkIHtcblx0XHRpZiAoXG5cdFx0XHQhdGhpcy5vcHRpb25zLnRyYWNrQWN0aXZlRWRpdG9yU2Vzc2lvbigpIHx8XG5cdFx0XHQhdGhpcy52aXNpYmxlXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5wdXQgPSB0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yO1xuXHRcdGNvbnN0IHJlc291cmNlID0gKGlucHV0IGluc3RhbmNlb2YgQ2hhdEVkaXRvcklucHV0KSA/IGlucHV0LnNlc3Npb25SZXNvdXJjZSA6IGlucHV0Py5yZXNvdXJjZTtcblx0XHRpZiAoIXJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWF0Y2hpbmdTZXNzaW9uID0gdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5nZXRTZXNzaW9uKHJlc291cmNlKTtcblx0XHRpZiAobWF0Y2hpbmdTZXNzaW9uICYmIHRoaXMuc2Vzc2lvbnNMaXN0Py5oYXNOb2RlKG1hdGNoaW5nU2Vzc2lvbikpIHtcblx0XHRcdGlmICh0aGlzLnNlc3Npb25zTGlzdC5nZXRSZWxhdGl2ZVRvcChtYXRjaGluZ1Nlc3Npb24pID09PSBudWxsKSB7XG5cdFx0XHRcdHRoaXMuc2Vzc2lvbnNMaXN0LnJldmVhbChtYXRjaGluZ1Nlc3Npb24sIDAuNSk7IC8vIG9ubHkgcmV2ZWFsIHdoZW4gbm90IGFscmVhZHkgdmlzaWJsZVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnNlc3Npb25zTGlzdC5zZXRGb2N1cyhbbWF0Y2hpbmdTZXNzaW9uXSk7XG5cdFx0XHR0aGlzLnNlc3Npb25zTGlzdC5zZXRTZWxlY3Rpb24oW21hdGNoaW5nU2Vzc2lvbl0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLnNlc3Npb25zQ29udGFpbmVyID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmFnZW50LXNlc3Npb25zLXZpZXdlcicpKTtcblxuXHRcdHRoaXMuY3JlYXRlRW1wdHlGaWx0ZXJNZXNzYWdlKHRoaXMuc2Vzc2lvbnNDb250YWluZXIpO1xuXHRcdHRoaXMuY3JlYXRlTGlzdCh0aGlzLnNlc3Npb25zQ29udGFpbmVyKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRW1wdHlGaWx0ZXJNZXNzYWdlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLmVtcHR5RmlsdGVyTWVzc2FnZSA9IGFwcGVuZChjb250YWluZXIsICQoJy5hZ2VudC1zZXNzaW9ucy1lbXB0eS1maWx0ZXItbWVzc2FnZScpKTtcblx0XHRoaWRlKHRoaXMuZW1wdHlGaWx0ZXJNZXNzYWdlKTtcblxuXHRcdGNvbnN0IHNwYW4gPSBhcHBlbmQodGhpcy5lbXB0eUZpbHRlck1lc3NhZ2UsICQoJ3NwYW4nKSk7XG5cdFx0c3Bhbi50ZXh0Q29udGVudCA9IGAke2xvY2FsaXplKCdhZ2VudFNlc3Npb25zLm5vRmlsdGVyUmVzdWx0cycsIFwiTm8gbWF0Y2hpbmcgc2Vzc2lvbnNcIil9IC0gYDtcblxuXHRcdGNvbnN0IGxpbmsgPSBhcHBlbmQodGhpcy5lbXB0eUZpbHRlck1lc3NhZ2UsICQoJ3NwYW4ucmVzZXQtZmlsdGVyLWxpbmsnKSk7XG5cdFx0bGluay50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdhZ2VudFNlc3Npb25zLnJlc2V0RmlsdGVyJywgXCJSZXNldCBGaWx0ZXJcIik7XG5cdFx0bGluay50YWJJbmRleCA9IDA7XG5cdFx0bGluay5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGxpbmssIEV2ZW50VHlwZS5DTElDSywgKCkgPT4gdGhpcy5vcHRpb25zLmZpbHRlci5yZXNldCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGxpbmssIEV2ZW50VHlwZS5LRVlfRE9XTiwgKGUpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkVudGVyIHx8IGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuU3BhY2UpIHtcblx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5vcHRpb25zLmZpbHRlci5yZXNldCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNFQ1RJT05fQ09MTEFQU0VfU1RBVEVfS0VZID0gJ2FnZW50U2Vzc2lvbnMuc2VjdGlvbkNvbGxhcHNlU3RhdGUnO1xuXG5cdHByaXZhdGUgZ2V0U2F2ZWRDb2xsYXBzZVN0YXRlKHNlY3Rpb246IEFnZW50U2Vzc2lvblNlY3Rpb24pOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByYXcgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChBZ2VudFNlc3Npb25zQ29udHJvbC5TRUNUSU9OX0NPTExBUFNFX1NUQVRFX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdGlmIChyYXcpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHN0YXRlOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPiA9IEpTT04ucGFyc2UocmF3KTtcblx0XHRcdFx0aWYgKHR5cGVvZiBzdGF0ZVtzZWN0aW9uXSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHN0YXRlW3NlY3Rpb25dO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gaWdub3JlIGNvcnJ1cHQgZGF0YVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBzYXZlU2VjdGlvbkNvbGxhcHNlU3RhdGUoc2VjdGlvbjogQWdlbnRTZXNzaW9uU2VjdGlvbiwgY29sbGFwc2VkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0bGV0IHN0YXRlOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPiA9IHt9O1xuXHRcdGNvbnN0IHJhdyA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KEFnZW50U2Vzc2lvbnNDb250cm9sLlNFQ1RJT05fQ09MTEFQU0VfU1RBVEVfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0aWYgKHJhdykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpO1xuXHRcdFx0XHRpZiAodHlwZW9mIHBhcnNlZCA9PT0gJ29iamVjdCcgJiYgcGFyc2VkICE9PSBudWxsICYmICFBcnJheS5pc0FycmF5KHBhcnNlZCkpIHtcblx0XHRcdFx0XHRzdGF0ZSA9IHBhcnNlZDtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZSBjb3JydXB0IGRhdGFcblx0XHRcdH1cblx0XHR9XG5cdFx0c3RhdGVbc2VjdGlvbl0gPSBjb2xsYXBzZWQ7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShBZ2VudFNlc3Npb25zQ29udHJvbC5TRUNUSU9OX0NPTExBUFNFX1NUQVRFX0tFWSwgSlNPTi5zdHJpbmdpZnkoc3RhdGUpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0fVxuXG5cdHJlc2V0U2VjdGlvbkNvbGxhcHNlU3RhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoQWdlbnRTZXNzaW9uc0NvbnRyb2wuU0VDVElPTl9DT0xMQVBTRV9TVEFURV9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlTGlzdChjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgY29sbGFwc2VCeURlZmF1bHQgPSAoZWxlbWVudDogdW5rbm93bikgPT4ge1xuXHRcdFx0aWYgKGlzQWdlbnRTZXNzaW9uU2VjdGlvbihlbGVtZW50KSkge1xuXHRcdFx0XHQvLyBDaGVjayBmb3IgcGVyc2lzdGVkIHVzZXIgcHJlZmVyZW5jZSBmaXJzdFxuXHRcdFx0XHRjb25zdCBzYXZlZCA9IHRoaXMuZ2V0U2F2ZWRDb2xsYXBzZVN0YXRlKGVsZW1lbnQuc2VjdGlvbik7XG5cdFx0XHRcdGlmIChzYXZlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHNhdmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGVsZW1lbnQuc2VjdGlvbiA9PT0gQWdlbnRTZXNzaW9uU2VjdGlvbi5Nb3JlICYmICF0aGlzLm9wdGlvbnMuZmlsdGVyLmdldEV4Y2x1ZGVzKCkucmVhZCkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlOyAvLyBNb3JlIHNlY3Rpb24gaXMgYWx3YXlzIGNvbGxhcHNlZCB1bmxlc3Mgb25seSBzaG93aW5nIHVucmVhZFxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlbGVtZW50LnNlY3Rpb24gPT09IEFnZW50U2Vzc2lvblNlY3Rpb24uQXJjaGl2ZWQgJiYgdGhpcy5vcHRpb25zLmZpbHRlci5nZXRFeGNsdWRlcygpLmFyY2hpdmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7IC8vIEFyY2hpdmVkIHNlY3Rpb24gaXMgY29sbGFwc2VkIHdoZW4gYXJjaGl2ZWQgYXJlIGV4Y2x1ZGVkXG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMub3B0aW9ucy5jb2xsYXBzZU9sZGVyU2VjdGlvbnM/LigpKSB7XG5cdFx0XHRcdFx0Y29uc3Qgb2xkZXJTZWN0aW9ucyA9IFtBZ2VudFNlc3Npb25TZWN0aW9uLldlZWssIEFnZW50U2Vzc2lvblNlY3Rpb24uT2xkZXIsIEFnZW50U2Vzc2lvblNlY3Rpb24uQXJjaGl2ZWRdO1xuXHRcdFx0XHRcdGlmIChvbGRlclNlY3Rpb25zLmluY2x1ZGVzKGVsZW1lbnQuc2VjdGlvbikpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlOyAvLyBDb2xsYXBzZSBvbGRlciB0aW1lIHNlY3Rpb25zIGlmIG9wdGlvbiBpcyBlbmFibGVkXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChlbGVtZW50LnNlY3Rpb24gPT09IEFnZW50U2Vzc2lvblNlY3Rpb24uWWVzdGVyZGF5ICYmIHRoaXMuaGFzVG9kYXlTZXNzaW9ucygpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gQWxzbyBjb2xsYXBzZSBZZXN0ZXJkYXkgd2hlbiB0aGVyZSBhcmUgc2Vzc2lvbnMgZnJvbSBUb2RheVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZWxlbWVudC5zZWN0aW9uID09PSBBZ2VudFNlc3Npb25TZWN0aW9uLlJlcG9zaXRvcnkgJiYgIXRoaXMuX3JlY2VudFJlcG9zaXRvcnlMYWJlbHMuaGFzKGVsZW1lbnQubGFiZWwpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gQ29sbGFwc2UgcmVwb3NpdG9yeSBzZWN0aW9ucyB0aGF0IGRvbid0IGNvbnRhaW4gcmVjZW50IHNlc3Npb25zXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc29ydGVyID0gbmV3IEFnZW50U2Vzc2lvbnNTb3J0ZXIoKCkgPT4gdGhpcy5vcHRpb25zLmZpbHRlci5zb3J0UmVzdWx0cz8uKCkgPz8gQWdlbnRTZXNzaW9uc1NvcnRpbmcuQ3JlYXRlZCk7XG5cdFx0Y29uc3QgYXBwcm92YWxNb2RlbCA9IHRoaXMub3B0aW9ucy5lbmFibGVBcHByb3ZhbFJvdyA/IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbCkpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb25SZXNvdXJjZSA9IG9ic2VydmFibGVWYWx1ZTxVUkkgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlbmRlcmVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25SZW5kZXJlciwge1xuXHRcdFx0Li4udGhpcy5vcHRpb25zLFxuXHRcdFx0aXNHcm91cGVkQnlSZXBvc2l0b3J5OiAoKSA9PiB0aGlzLm9wdGlvbnMuZmlsdGVyLmdyb3VwUmVzdWx0cz8uKCkgPT09IEFnZW50U2Vzc2lvbnNHcm91cGluZy5SZXBvc2l0b3J5LFxuXHRcdFx0aXNTb3J0ZWRCeVVwZGF0ZWQ6ICgpID0+IHRoaXMub3B0aW9ucy5maWx0ZXIuc29ydFJlc3VsdHM/LigpID09PSBBZ2VudFNlc3Npb25zU29ydGluZy5VcGRhdGVkLFxuXHRcdFx0cGF1c2VTZXNzaW9uVXBkYXRlczogKCkgPT4gdGhpcy5wYXVzZVVwZGF0ZXMoKSxcblx0XHR9LCBhcHByb3ZhbE1vZGVsLCBhY3RpdmVTZXNzaW9uUmVzb3VyY2UpKTtcblx0XHRjb25zdCBjb21wYWN0ID0gdGhpcy5vcHRpb25zLmNvbXBhY3RTaG93TW9yZTtcblx0XHRjb25zdCBzZXNzaW9uRGF0YVNvdXJjZSA9IHRoaXMuc2Vzc2lvbnNEYXRhU291cmNlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFnZW50U2Vzc2lvbnNEYXRhU291cmNlKHRoaXMub3B0aW9ucy5maWx0ZXIsIHNvcnRlciwgdGhpcy5vcHRpb25zLnJlcG9zaXRvcnlHcm91cExpbWl0KSk7XG5cdFx0Y29uc3QgbGlzdERlbGVnYXRlID0gbmV3IEFnZW50U2Vzc2lvbnNMaXN0RGVsZWdhdGUoXG5cdFx0XHRhcHByb3ZhbE1vZGVsLFxuXHRcdFx0dGhpcy5vcHRpb25zLmNvbXBhY3RTaG93TW9yZSxcblx0XHRcdCgpID0+IHRoaXMub3B0aW9ucy5pdGVtSGVpZ2h0ID8/ICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KExheW91dFNldHRpbmdzLk1PREVSTl9VSSkgPT09IHRydWUgPyBBZ2VudFNlc3Npb25zTGlzdERlbGVnYXRlLkNPTVBBQ1RfSVRFTV9IRUlHSFQgOiBBZ2VudFNlc3Npb25zTGlzdERlbGVnYXRlLklURU1fSEVJR0hUKSxcblx0XHRcdCgpID0+IHRoaXMub3B0aW9ucy5zZWN0aW9uSGVpZ2h0ID8/ICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KExheW91dFNldHRpbmdzLk1PREVSTl9VSSkgPT09IHRydWUgPyBBZ2VudFNlc3Npb25zTGlzdERlbGVnYXRlLlNQQUNFRF9TRUNUSU9OX0hFSUdIVCA6IEFnZW50U2Vzc2lvbnNMaXN0RGVsZWdhdGUuU0VDVElPTl9IRUlHSFQpLFxuXHRcdCk7XG5cdFx0Y29uc3QgbGlzdCA9IHRoaXMuc2Vzc2lvbnNMaXN0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hDb21wcmVzc2libGVBc3luY0RhdGFUcmVlLFxuXHRcdFx0J0FnZW50U2Vzc2lvbnNWaWV3Jyxcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdGxpc3REZWxlZ2F0ZSxcblx0XHRcdG5ldyBBZ2VudFNlc3Npb25zQ29tcHJlc3Npb25EZWxlZ2F0ZSgpLFxuXHRcdFx0W1xuXHRcdFx0XHRzZXNzaW9uUmVuZGVyZXIsXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uU2VjdGlvblJlbmRlcmVyLCB7IGhpZGVTZWN0aW9uQ291bnQ6IHRoaXMub3B0aW9ucy5oaWRlU2VjdGlvbkNvdW50IH0pLFxuXHRcdFx0XHRuZXcgQWdlbnRTZXNzaW9uU2hvd01vcmVSZW5kZXJlcih7IGNvbXBhY3RMYWJlbDogdGhpcy5vcHRpb25zLmNvbXBhY3RTaG93TW9yZSB9KSxcblx0XHRcdFx0bmV3IEFnZW50U2Vzc2lvblNob3dMZXNzUmVuZGVyZXIoKSxcblx0XHRcdF0sXG5cdFx0XHRzZXNzaW9uRGF0YVNvdXJjZSxcblx0XHRcdHtcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBuZXcgQWdlbnRTZXNzaW9uc0FjY2Vzc2liaWxpdHlQcm92aWRlcigpLFxuXHRcdFx0XHRkbmQ6IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc0RyYWdBbmREcm9wKSxcblx0XHRcdFx0aWRlbnRpdHlQcm92aWRlcjogbmV3IEFnZW50U2Vzc2lvbnNJZGVudGl0eVByb3ZpZGVyKCksXG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IHRydWUsXG5cdFx0XHRcdGZpbmRXaWRnZXRFbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRkZWZhdWx0RmluZE1vZGU6IFRyZWVGaW5kTW9kZS5GaWx0ZXIsXG5cdFx0XHRcdGtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXI6IG5ldyBBZ2VudFNlc3Npb25zS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcigpLFxuXHRcdFx0XHRvdmVycmlkZVN0eWxlczogdGhpcy5vcHRpb25zLm92ZXJyaWRlU3R5bGVzLFxuXHRcdFx0XHR0d2lzdGllQWRkaXRpb25hbENzc0NsYXNzOiAoKSA9PiAnZm9yY2Utbm8tdHdpc3RpZScsXG5cdFx0XHRcdGNvbGxhcHNlQnlEZWZhdWx0OiAoZWxlbWVudDogdW5rbm93bikgPT4gY29sbGFwc2VCeURlZmF1bHQoZWxlbWVudCksXG5cdFx0XHRcdHJlbmRlckluZGVudEd1aWRlczogUmVuZGVySW5kZW50R3VpZGVzLk5vbmUsXG5cdFx0XHR9XG5cdFx0KSkgYXMgV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZTxJQWdlbnRTZXNzaW9uc01vZGVsLCBBZ2VudFNlc3Npb25MaXN0SXRlbSwgRnV6enlTY29yZT47XG5cblx0XHRDaGF0Q29udGV4dEtleXMuYWdlbnRTZXNzaW9uc1ZpZXdlckZvY3VzZWQuYmluZFRvKGxpc3QuY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZXZlbnQgPT4ge1xuXHRcdFx0aWYgKCFldmVudC5hZmZlY3RzQ29uZmlndXJhdGlvbihMYXlvdXRTZXR0aW5ncy5NT0RFUk5fVUkpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgbm9kZXMgPSBbLi4ubGlzdC5nZXROb2RlKCkuY2hpbGRyZW5dO1xuXHRcdFx0d2hpbGUgKG5vZGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3Qgbm9kZSA9IG5vZGVzLnBvcCgpITtcblx0XHRcdFx0aWYgKGlzQWdlbnRTZXNzaW9uKG5vZGUuZWxlbWVudCkgfHwgaXNBZ2VudFNlc3Npb25TZWN0aW9uKG5vZGUuZWxlbWVudCkpIHtcblx0XHRcdFx0XHRsaXN0LnVwZGF0ZUVsZW1lbnRIZWlnaHQobm9kZS5lbGVtZW50LCBsaXN0RGVsZWdhdGUuZ2V0SGVpZ2h0KG5vZGUuZWxlbWVudCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG5vZGVzLnB1c2goLi4ubm9kZS5jaGlsZHJlbik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2Vzc2lvblJlbmRlcmVyLm9uRGlkQ2hhbmdlSXRlbUhlaWdodChzZXNzaW9uID0+IHtcblx0XHRcdGlmIChsaXN0Lmhhc05vZGUoc2Vzc2lvbikpIHtcblx0XHRcdFx0bGlzdC51cGRhdGVFbGVtZW50SGVpZ2h0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSW4gY29tcGFjdCBtb2RlLCBleHBhbmQgc2hvdy1tb3JlL3Nob3ctbGVzcyB3aGVuIGhvdmVyaW5nIGFueSBpdGVtIGluIHRoZSBzYW1lIGdyb3VwXG5cdFx0aWYgKGNvbXBhY3QpIHtcblx0XHRcdGxldCBleHBhbmRlZFNob3dNb3JlRWxlbWVudDogQWdlbnRTZXNzaW9uTGlzdEl0ZW0gfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgZXhwYW5kZWRTZWN0aW9uTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCBjdXJyZW50QW5pbWF0ZWRIZWlnaHQgPSBBZ2VudFNlc3Npb25TaG93TW9yZVJlbmRlcmVyLkNPTExBUFNFRF9IRUlHSFQ7XG5cblx0XHRcdGNvbnN0IHNlY3Rpb25Ub1Nob3dNb3JlID0gbmV3IE1hcDxzdHJpbmcsIEFnZW50U2Vzc2lvbkxpc3RJdGVtPigpO1xuXG5cdFx0XHRjb25zdCByZWJ1aWxkU2VjdGlvbk1hcCA9ICgpID0+IHtcblx0XHRcdFx0c2VjdGlvblRvU2hvd01vcmUuY2xlYXIoKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCByb290Tm9kZSA9IGxpc3QuZ2V0Tm9kZSgpO1xuXHRcdFx0XHRcdGZvciAoY29uc3Qgc2VjdGlvbk5vZGUgb2Ygcm9vdE5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRcdGlmIChpc0FnZW50U2Vzc2lvblNlY3Rpb24oc2VjdGlvbk5vZGUuZWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbGFiZWwgPSBzZWN0aW9uTm9kZS5lbGVtZW50LmxhYmVsO1xuXHRcdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHNlY3Rpb25Ob2RlLmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGlzQWdlbnRTZXNzaW9uU2hvd01vcmUoY2hpbGQuZWxlbWVudCkgfHwgaXNBZ2VudFNlc3Npb25TaG93TGVzcyhjaGlsZC5lbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0c2VjdGlvblRvU2hvd01vcmUuc2V0KGxhYmVsLCBjaGlsZC5lbGVtZW50KTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdC8vIFRyZWUgbWF5IG5vdCBiZSBpbml0aWFsaXplZCB5ZXRcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0bGV0IGV4cGFuZEFuaW1hdGlvbklkOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgY29sbGFwc2VBbmltYXRpb25JZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZ2V0V2luZG93KGNvbnRhaW5lcik7XG5cblx0XHRcdC8vIENhbmNlbCBwZW5kaW5nIGFuaW1hdGlvbnMgb24gZGlzcG9zZSB0byBhdm9pZCBjYWxsaW5nIGludG8gYSBkaXNwb3NlZCB0cmVlXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih7XG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0XHRpZiAoZXhwYW5kQW5pbWF0aW9uSWQpIHsgdGFyZ2V0V2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKGV4cGFuZEFuaW1hdGlvbklkKTsgfVxuXHRcdFx0XHRcdGlmIChjb2xsYXBzZUFuaW1hdGlvbklkKSB7IHRhcmdldFdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZShjb2xsYXBzZUFuaW1hdGlvbklkKTsgfVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgYW5pbWF0ZUhlaWdodCA9IChlbGVtZW50OiBBZ2VudFNlc3Npb25MaXN0SXRlbSwgZnJvbTogbnVtYmVyLCB0bzogbnVtYmVyLCBvbkNvbXBsZXRlPzogKCkgPT4gdm9pZCkgPT4ge1xuXHRcdFx0XHQvLyBSZXNwZWN0IHByZWZlcnMtcmVkdWNlZC1tb3Rpb25cblx0XHRcdFx0aWYgKHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNNb3Rpb25SZWR1Y2VkKCkpIHtcblx0XHRcdFx0XHRpZiAobGlzdC5oYXNOb2RlKGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRpc1VwZGF0aW5nSGVpZ2h0ID0gdHJ1ZTtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGxpc3QudXBkYXRlRWxlbWVudEhlaWdodChlbGVtZW50LCB0byk7XG5cdFx0XHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdFx0XHRpc1VwZGF0aW5nSGVpZ2h0ID0gZmFsc2U7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjdXJyZW50QW5pbWF0ZWRIZWlnaHQgPSB0bztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0b25Db21wbGV0ZT8uKCk7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGR1cmF0aW9uID0gMTUwO1xuXHRcdFx0XHRjb25zdCBzdGFydCA9IERhdGUubm93KCk7XG5cdFx0XHRcdGNvbnN0IHN0ZXAgPSAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZWxhcHNlZCA9IERhdGUubm93KCkgLSBzdGFydDtcblx0XHRcdFx0XHRjb25zdCBwcm9ncmVzcyA9IE1hdGgubWluKGVsYXBzZWQgLyBkdXJhdGlvbiwgMSk7XG5cdFx0XHRcdFx0Y29uc3QgZWFzZWQgPSAxIC0gTWF0aC5wb3coMSAtIHByb2dyZXNzLCAyKTtcblx0XHRcdFx0XHRjb25zdCBoZWlnaHQgPSBNYXRoLnJvdW5kKGZyb20gKyAodG8gLSBmcm9tKSAqIGVhc2VkKTtcblx0XHRcdFx0XHRpZiAobGlzdC5oYXNOb2RlKGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRpc1VwZGF0aW5nSGVpZ2h0ID0gdHJ1ZTtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGxpc3QudXBkYXRlRWxlbWVudEhlaWdodChlbGVtZW50LCBoZWlnaHQpO1xuXHRcdFx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRcdFx0aXNVcGRhdGluZ0hlaWdodCA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y3VycmVudEFuaW1hdGVkSGVpZ2h0ID0gaGVpZ2h0O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAocHJvZ3Jlc3MgPCAxKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGFyZ2V0V2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZShzdGVwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0b25Db21wbGV0ZT8uKCk7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fTtcblx0XHRcdFx0cmV0dXJuIHRhcmdldFdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoc3RlcCk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBjb2xsYXBzZUN1cnJlbnRTaG93TW9yZSA9ICgpID0+IHtcblx0XHRcdFx0aWYgKGNvbGxhcHNlQW5pbWF0aW9uSWQpIHtcblx0XHRcdFx0XHR0YXJnZXRXaW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUoY29sbGFwc2VBbmltYXRpb25JZCk7XG5cdFx0XHRcdFx0Y29sbGFwc2VBbmltYXRpb25JZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXhwYW5kQW5pbWF0aW9uSWQpIHtcblx0XHRcdFx0XHR0YXJnZXRXaW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUoZXhwYW5kQW5pbWF0aW9uSWQpO1xuXHRcdFx0XHRcdGV4cGFuZEFuaW1hdGlvbklkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChleHBhbmRlZFNob3dNb3JlRWxlbWVudCAmJiBleHBhbmRlZFNlY3Rpb25MYWJlbCkge1xuXHRcdFx0XHRcdGlmIChsaXN0Lmhhc05vZGUoZXhwYW5kZWRTaG93TW9yZUVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRjb2xsYXBzZUFuaW1hdGlvbklkID0gYW5pbWF0ZUhlaWdodChcblx0XHRcdFx0XHRcdFx0ZXhwYW5kZWRTaG93TW9yZUVsZW1lbnQsXG5cdFx0XHRcdFx0XHRcdGN1cnJlbnRBbmltYXRlZEhlaWdodCxcblx0XHRcdFx0XHRcdFx0QWdlbnRTZXNzaW9uU2hvd01vcmVSZW5kZXJlci5DT0xMQVBTRURfSEVJR0hULFxuXHRcdFx0XHRcdFx0XHQoKSA9PiB7IGNvbGxhcHNlQW5pbWF0aW9uSWQgPSB1bmRlZmluZWQ7IH1cblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGV4cGFuZGVkU2hvd01vcmVFbGVtZW50ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRleHBhbmRlZFNlY3Rpb25MYWJlbCA9IHVuZGVmaW5lZDtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGV4cGFuZFNob3dNb3JlID0gKHNlY3Rpb25MYWJlbDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGlmIChleHBhbmRlZFNlY3Rpb25MYWJlbCA9PT0gc2VjdGlvbkxhYmVsKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29sbGFwc2VDdXJyZW50U2hvd01vcmUoKTtcblxuXHRcdFx0XHRjb25zdCBzaG93TW9yZUl0ZW0gPSBzZWN0aW9uVG9TaG93TW9yZS5nZXQoc2VjdGlvbkxhYmVsKTtcblx0XHRcdFx0aWYgKCFzaG93TW9yZUl0ZW0gfHwgIWxpc3QuaGFzTm9kZShzaG93TW9yZUl0ZW0pKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZXhwYW5kZWRTaG93TW9yZUVsZW1lbnQgPSBzaG93TW9yZUl0ZW07XG5cdFx0XHRcdGV4cGFuZGVkU2VjdGlvbkxhYmVsID0gc2VjdGlvbkxhYmVsO1xuXHRcdFx0XHRjdXJyZW50QW5pbWF0ZWRIZWlnaHQgPSBBZ2VudFNlc3Npb25TaG93TW9yZVJlbmRlcmVyLkNPTExBUFNFRF9IRUlHSFQ7XG5cdFx0XHRcdGV4cGFuZEFuaW1hdGlvbklkID0gYW5pbWF0ZUhlaWdodChcblx0XHRcdFx0XHRzaG93TW9yZUl0ZW0sXG5cdFx0XHRcdFx0QWdlbnRTZXNzaW9uU2hvd01vcmVSZW5kZXJlci5DT0xMQVBTRURfSEVJR0hULFxuXHRcdFx0XHRcdEFnZW50U2Vzc2lvblNob3dNb3JlUmVuZGVyZXIuSEVJR0hULFxuXHRcdFx0XHRcdCgpID0+IHsgZXhwYW5kQW5pbWF0aW9uSWQgPSB1bmRlZmluZWQ7IH1cblx0XHRcdFx0KTtcblx0XHRcdH07XG5cblx0XHRcdC8vIExpc3RlbiB0byB0cmVlIG1vZGVsIGNoYW5nZXMgXHUyMDE0IHJlYnVpbGQgdGhlIHNlY3Rpb24gbWFwLlxuXHRcdFx0Ly8gVXNlIGEgZmxhZyB0byBhdm9pZCByZS1lbnRyYW5jeSBzaW5jZSB1cGRhdGVFbGVtZW50SGVpZ2h0XG5cdFx0XHQvLyB0cmlnZ2VycyBtb2RlbCBjaGFuZ2VzLlxuXHRcdFx0bGV0IGlzVXBkYXRpbmdIZWlnaHQgPSBmYWxzZTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGxpc3Qub25EaWRDaGFuZ2VNb2RlbCgoKSA9PiB7XG5cdFx0XHRcdGlmIChpc1VwZGF0aW5nSGVpZ2h0KSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGV4cGFuZGVkU2hvd01vcmVFbGVtZW50ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRleHBhbmRlZFNlY3Rpb25MYWJlbCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0Y3VycmVudEFuaW1hdGVkSGVpZ2h0ID0gQWdlbnRTZXNzaW9uU2hvd01vcmVSZW5kZXJlci5DT0xMQVBTRURfSEVJR0hUO1xuXHRcdFx0XHRyZWJ1aWxkU2VjdGlvbk1hcCgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBPbiBtb3VzZW92ZXIsIGRldGVybWluZSBzZWN0aW9uIGZyb20gdGhlIGhvdmVyZWQgZWxlbWVudFxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNvbnRhaW5lciwgJ21vdXNlb3ZlcicsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuXHRcdFx0XHRjb25zdCByb3cgPSB0YXJnZXQuY2xvc2VzdCgnLm1vbmFjby1saXN0LXJvdycpO1xuXHRcdFx0XHRpZiAoIXJvdykge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBzZWN0aW9uTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRcdFx0XHQvLyBTZWN0aW9uIGhlYWRlciBcdTIwMTQgcXVlcnlTZWxlY3RvciBpcyBuZWVkZWQgdG8gaWRlbnRpZnkgZWxlbWVudHMgd2l0aGluIHZpcnR1YWxpemVkIGxpc3Qgcm93c1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdFx0Y29uc3Qgc2VjdGlvbkhlYWRlckVsID0gcm93LnF1ZXJ5U2VsZWN0b3IoJy5hZ2VudC1zZXNzaW9uLXNlY3Rpb24tbGFiZWwnKTtcblx0XHRcdFx0aWYgKHNlY3Rpb25IZWFkZXJFbCkge1xuXHRcdFx0XHRcdHNlY3Rpb25MYWJlbCA9IHNlY3Rpb25IZWFkZXJFbC50ZXh0Q29udGVudCA/PyB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBTaG93LW1vcmUgZWxlbWVudFxuXHRcdFx0XHRpZiAoIXNlY3Rpb25MYWJlbCkge1xuXHRcdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0XHRcdGNvbnN0IHNob3dNb3JlRWwgPSByb3cucXVlcnlTZWxlY3RvcignLmFnZW50LXNlc3Npb24tc2hvdy1tb3JlJyk7XG5cdFx0XHRcdFx0aWYgKHNob3dNb3JlRWwpIHtcblx0XHRcdFx0XHRcdHNlY3Rpb25MYWJlbCA9IHNob3dNb3JlRWwuZ2V0QXR0cmlidXRlKCdkYXRhLXNlY3Rpb24tbGFiZWwnKSA/PyB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gU2Vzc2lvbiBpdGVtIFx1MjAxNCB1c2UgZGF0YS1zZWN0aW9uLWxhYmVsIGF0dHJpYnV0ZVxuXHRcdFx0XHRpZiAoIXNlY3Rpb25MYWJlbCkge1xuXHRcdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0XHRcdGNvbnN0IHNlc3Npb25JdGVtID0gcm93LnF1ZXJ5U2VsZWN0b3IoJy5hZ2VudC1zZXNzaW9uLWl0ZW1bZGF0YS1zZWN0aW9uLWxhYmVsXScpO1xuXHRcdFx0XHRcdGlmIChzZXNzaW9uSXRlbSkge1xuXHRcdFx0XHRcdFx0c2VjdGlvbkxhYmVsID0gc2Vzc2lvbkl0ZW0uZ2V0QXR0cmlidXRlKCdkYXRhLXNlY3Rpb24tbGFiZWwnKSA/PyB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSWYgd2UgY291bGRuJ3QgZGV0ZXJtaW5lIHRoZSBzZWN0aW9uIGJ1dCBhcmUgc3RpbGwgaG92ZXJpbmdcblx0XHRcdFx0Ly8gaW5zaWRlIGEgcm93IHdpdGggYSBzZXNzaW9uIGl0ZW0sIGtlZXAgdGhlIGN1cnJlbnQgc3RhdGVcblx0XHRcdFx0Ly8gKHByZXZlbnRzIGNvbGxhcHNlIHdoZW4gaG92ZXJpbmcgdG9vbGJhciBpY29ucywgZGlmZiBzdGF0cywgZXRjLilcblx0XHRcdFx0aWYgKCFzZWN0aW9uTGFiZWwpIHtcblx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdFx0XHRpZiAocm93LnF1ZXJ5U2VsZWN0b3IoJy5hZ2VudC1zZXNzaW9uLWl0ZW0nKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb2xsYXBzZUN1cnJlbnRTaG93TW9yZSgpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghc2VjdGlvblRvU2hvd01vcmUuaGFzKHNlY3Rpb25MYWJlbCkpIHtcblx0XHRcdFx0XHRjb2xsYXBzZUN1cnJlbnRTaG93TW9yZSgpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGV4cGFuZFNob3dNb3JlKHNlY3Rpb25MYWJlbCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb250YWluZXIsICdtb3VzZWxlYXZlJywgKCkgPT4ge1xuXHRcdFx0XHRjb2xsYXBzZUN1cnJlbnRTaG93TW9yZSgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRyZWJ1aWxkU2VjdGlvbk1hcCgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHNlc3Npb25EYXRhU291cmNlLm9uRGlkR2V0Q2hpbGRyZW4oY291bnQgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGVFbXB0eShjb3VudCA9PT0gMCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2Vzc2lvbkRhdGFTb3VyY2Uub25EaWRFeHBhbmRSZXBvc2l0b3J5R3JvdXAoKCkgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWw7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9wdGlvbnMuZmlsdGVyLm9uRGlkQ2hhbmdlKGFzeW5jICgpID0+IHtcblx0XHRcdGlmICh0aGlzLnZpc2libGUpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVTZWN0aW9uQ29sbGFwc2VTdGF0ZXMoKTtcblx0XHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihtb2RlbC5vbkRpZENoYW5nZVNlc3Npb25zKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLnZpc2libGUpIHtcblx0XHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLmNvbXB1dGVSZWNlbnRSZXBvc2l0b3J5TGFiZWxzKCk7XG5cdFx0bGlzdC5zZXRJbnB1dChtb2RlbCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihsaXN0Lm9uRGlkT3BlbihlID0+IHRoaXMub3BlbkFnZW50U2Vzc2lvbihlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGxpc3Qub25Db250ZXh0TWVudShlID0+IHRoaXMuc2hvd0NvbnRleHRNZW51KGUpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihsaXN0Lm9uTW91c2VEYmxDbGljaygoeyBlbGVtZW50IH0pID0+IHtcblx0XHRcdGlmIChlbGVtZW50ID09PSBudWxsKSB7XG5cdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQUNUSU9OX0lEX05FV19DSEFUKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hbnkobGlzdC5vbkRpZENoYW5nZUZvY3VzLCBsaXN0Lm9uRGlkQ2hhbmdlU2VsZWN0aW9uLCBtb2RlbC5vbkRpZENoYW5nZVNlc3Npb25zKSgoKSA9PiB7XG5cdFx0XHRjb25zdCBmb2N1c2VkID0gbGlzdC5nZXRGb2N1cygpLmF0KDApO1xuXHRcdFx0aWYgKGZvY3VzZWQgJiYgaXNBZ2VudFNlc3Npb24oZm9jdXNlZCkpIHtcblx0XHRcdFx0dGhpcy5mb2N1c2VkQWdlbnRTZXNzaW9uQXJjaGl2ZWRDb250ZXh0S2V5LnNldChmb2N1c2VkLmlzQXJjaGl2ZWQoKSk7XG5cdFx0XHRcdHRoaXMuZm9jdXNlZEFnZW50U2Vzc2lvblBpbm5lZENvbnRleHRLZXkuc2V0KGZvY3VzZWQuaXNQaW5uZWQoKSk7XG5cdFx0XHRcdHRoaXMuZm9jdXNlZEFnZW50U2Vzc2lvblJlYWRDb250ZXh0S2V5LnNldChmb2N1c2VkLmlzUmVhZCgpKTtcblx0XHRcdFx0dGhpcy5mb2N1c2VkQWdlbnRTZXNzaW9uVHlwZUNvbnRleHRLZXkuc2V0KGZvY3VzZWQucHJvdmlkZXJUeXBlKTtcblx0XHRcdFx0YWN0aXZlU2Vzc2lvblJlc291cmNlLnNldChmb2N1c2VkLnJlc291cmNlLCB1bmRlZmluZWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5mb2N1c2VkQWdlbnRTZXNzaW9uQXJjaGl2ZWRDb250ZXh0S2V5LnJlc2V0KCk7XG5cdFx0XHRcdHRoaXMuZm9jdXNlZEFnZW50U2Vzc2lvblBpbm5lZENvbnRleHRLZXkucmVzZXQoKTtcblx0XHRcdFx0dGhpcy5mb2N1c2VkQWdlbnRTZXNzaW9uUmVhZENvbnRleHRLZXkucmVzZXQoKTtcblx0XHRcdFx0dGhpcy5mb2N1c2VkQWdlbnRTZXNzaW9uVHlwZUNvbnRleHRLZXkucmVzZXQoKTtcblx0XHRcdFx0YWN0aXZlU2Vzc2lvblJlc291cmNlLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IGxpc3QuZ2V0U2VsZWN0aW9uKCkuZmlsdGVyKGlzQWdlbnRTZXNzaW9uKTtcblx0XHRcdHRoaXMuaGFzTXVsdGlwbGVBZ2VudFNlc3Npb25zU2VsZWN0ZWRDb250ZXh0S2V5LnNldChzZWxlY3Rpb24ubGVuZ3RoID4gMSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIobGlzdC5vbkRpZENoYW5nZUZpbmRPcGVuU3RhdGUob3BlbiA9PiB7XG5cdFx0XHR0aGlzLnNlc3Npb25zTGlzdEZpbmRJc09wZW4gPSBvcGVuO1xuXG5cdFx0XHR0aGlzLnVwZGF0ZVNlY3Rpb25Db2xsYXBzZVN0YXRlcygpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGxpc3Qub25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlKGUgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2lzUHJvZ3JhbW1hdGljQ29sbGFwc2VDaGFuZ2UpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZWxlbWVudCA9IGUubm9kZS5lbGVtZW50Py5lbGVtZW50O1xuXHRcdFx0aWYgKGVsZW1lbnQgJiYgaXNBZ2VudFNlc3Npb25TZWN0aW9uKGVsZW1lbnQpKSB7XG5cdFx0XHRcdHRoaXMuc2F2ZVNlY3Rpb25Db2xsYXBzZVN0YXRlKGVsZW1lbnQuc2VjdGlvbiwgZS5ub2RlLmNvbGxhcHNlZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFbXB0eShpc0VtcHR5OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmVtcHR5RmlsdGVyTWVzc2FnZSB8fCAhdGhpcy5zZXNzaW9uc0xpc3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWw7XG5cdFx0Y29uc3QgaGFzU2Vzc2lvbnNJbk1vZGVsID0gbW9kZWwuc2Vzc2lvbnMubGVuZ3RoID4gMDtcblx0XHRjb25zdCBpc0ZpbHRlckFjdGl2ZSA9ICF0aGlzLm9wdGlvbnMuZmlsdGVyLmlzRGVmYXVsdCgpO1xuXG5cdFx0Y29uc3Qgc2hvd0VtcHR5ID0gaGFzU2Vzc2lvbnNJbk1vZGVsICYmIGlzRW1wdHkgJiYgaXNGaWx0ZXJBY3RpdmU7XG5cdFx0c2V0VmlzaWJpbGl0eShzaG93RW1wdHksIHRoaXMuZW1wdHlGaWx0ZXJNZXNzYWdlKTtcblx0XHRzZXRWaXNpYmlsaXR5KCFzaG93RW1wdHksIHRoaXMuc2Vzc2lvbnNMaXN0LmdldEhUTUxFbGVtZW50KCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYXNUb2RheVNlc3Npb25zKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHN0YXJ0T2ZUb2RheSA9IG5ldyBEYXRlKCkuc2V0SG91cnMoMCwgMCwgMCwgMCk7XG5cblx0XHRyZXR1cm4gdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5zZXNzaW9ucy5zb21lKHNlc3Npb24gPT5cblx0XHRcdCFzZXNzaW9uLmlzQXJjaGl2ZWQoKSAmJlxuXHRcdFx0c2Vzc2lvbi50aW1pbmcuY3JlYXRlZCA+PSBzdGFydE9mVG9kYXlcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBjb21wdXRlUmVjZW50UmVwb3NpdG9yeUxhYmVscygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWNlbnRSZXBvc2l0b3J5TGFiZWxzLmNsZWFyKCk7XG5cblx0XHRjb25zdCBzZXNzaW9ucyA9IHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWwuc2Vzc2lvbnNcblx0XHRcdC5maWx0ZXIocyA9PiAhcy5pc0FyY2hpdmVkKCkgJiYgIXMuaXNQaW5uZWQoKSlcblx0XHRcdC5zb3J0KChhLCBiKSA9PiBiLnRpbWluZy5jcmVhdGVkIC0gYS50aW1pbmcuY3JlYXRlZClcblx0XHRcdC5zbGljZSgwLCBBZ2VudFNlc3Npb25zQ29udHJvbC5SRUNFTlRfU0VTU0lPTlNfRk9SX0VYUEFORCk7XG5cblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdGNvbnN0IG5hbWUgPSBnZXRSZXBvc2l0b3J5TmFtZShzZXNzaW9uKTtcblx0XHRcdHRoaXMuX3JlY2VudFJlcG9zaXRvcnlMYWJlbHMuYWRkKG5hbWUgPz8gQWdlbnRTZXNzaW9uU2VjdGlvbkxhYmVsc1tBZ2VudFNlc3Npb25TZWN0aW9uLlJlcG9zaXRvcnldKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5BZ2VudFNlc3Npb24oZTogSU9wZW5FdmVudDxBZ2VudFNlc3Npb25MaXN0SXRlbSB8IHVuZGVmaW5lZD4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlbGVtZW50ID0gZS5lbGVtZW50O1xuXHRcdGlmICghZWxlbWVudCB8fCBpc0FnZW50U2Vzc2lvblNlY3Rpb24oZWxlbWVudCkpIHtcblx0XHRcdHJldHVybjsgLy8gU2VjdGlvbiBoZWFkZXJzIGFyZSBub3Qgb3BlbmFibGVcblx0XHR9XG5cblx0XHRpZiAoaXNBZ2VudFNlc3Npb25TaG93TW9yZShlbGVtZW50KSkge1xuXHRcdFx0dGhpcy5zZXNzaW9uc0RhdGFTb3VyY2U/LmV4cGFuZFJlcG9zaXRvcnlHcm91cChlbGVtZW50LnNlY3Rpb25MYWJlbCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGlzQWdlbnRTZXNzaW9uU2hvd0xlc3MoZWxlbWVudCkpIHtcblx0XHRcdHRoaXMuc2Vzc2lvbnNEYXRhU291cmNlPy5jb2xsYXBzZVJlcG9zaXRvcnlHcm91cChlbGVtZW50LnNlY3Rpb25MYWJlbCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8QWdlbnRTZXNzaW9uT3BlbmVkRXZlbnQsIEFnZW50U2Vzc2lvbk9wZW5lZENsYXNzaWZpY2F0aW9uPignYWdlbnRTZXNzaW9uT3BlbmVkJywge1xuXHRcdFx0cHJvdmlkZXJUeXBlOiBlbGVtZW50LnByb3ZpZGVyVHlwZSxcblx0XHRcdHNvdXJjZTogdGhpcy5vcHRpb25zLnNvdXJjZVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMub3B0aW9ucy5vdmVycmlkZVNlc3Npb25PcGVuT3B0aW9ucz8uKGUpID8/IGU7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5vdmVycmlkZVNlc3Npb25PcGVuKSB7XG5cdFx0XHRhd2FpdCB0aGlzLm9wdGlvbnMub3ZlcnJpZGVTZXNzaW9uT3BlbihlbGVtZW50LnJlc291cmNlLCBvcHRpb25zKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0gYXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihvcGVuU2Vzc2lvbiwgZWxlbWVudCwgb3B0aW9ucyk7XG5cdFx0XHRpZiAod2lkZ2V0KSB7XG5cdFx0XHRcdHRoaXMub3B0aW9ucy5ub3RpZnlTZXNzaW9uT3BlbmVkPy4oZWxlbWVudC5yZXNvdXJjZSwgd2lkZ2V0KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNob3dDb250ZXh0TWVudSh7IGVsZW1lbnQsIGFuY2hvciwgYnJvd3NlckV2ZW50IH06IElUcmVlQ29udGV4dE1lbnVFdmVudDxBZ2VudFNlc3Npb25MaXN0SXRlbT4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWVsZW1lbnQgfHwgaXNBZ2VudFNlc3Npb25TaG93TW9yZShlbGVtZW50KSB8fCBpc0FnZW50U2Vzc2lvblNob3dMZXNzKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0RXZlbnRIZWxwZXIuc3RvcChicm93c2VyRXZlbnQsIHRydWUpO1xuXG5cdFx0aWYgKGlzQWdlbnRTZXNzaW9uU2VjdGlvbihlbGVtZW50KSkge1xuXHRcdFx0dGhpcy5zaG93QWdlbnRTZXNzaW9uU2VjdGlvbkNvbnRleHRNZW51KGVsZW1lbnQsIGFuY2hvcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2hvd0FnZW50U2Vzc2lvbkNvbnRleHRNZW51KGVsZW1lbnQsIGFuY2hvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzaG93QWdlbnRTZXNzaW9uU2VjdGlvbkNvbnRleHRNZW51KHNlY3Rpb246IElBZ2VudFNlc3Npb25TZWN0aW9uLCBhbmNob3I6IEhUTUxFbGVtZW50IHwgSU1vdXNlRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250ZXh0T3ZlcmxheTogQXJyYXk8W3N0cmluZywgYm9vbGVhbiB8IHN0cmluZ10+ID0gW107XG5cdFx0Y29udGV4dE92ZXJsYXkucHVzaChbQ2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvblNlY3Rpb24ua2V5LCBzZWN0aW9uLnNlY3Rpb25dKTtcblxuXHRcdGNvbnN0IG1lbnUgPSB0aGlzLm1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoTWVudUlkLkFnZW50U2Vzc2lvblNlY3Rpb25Db250ZXh0LCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZU92ZXJsYXkoY29udGV4dE92ZXJsYXkpKTtcblxuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBTZXBhcmF0b3Iuam9pbiguLi5tZW51LmdldEFjdGlvbnMoeyBhcmc6IHNlY3Rpb24sIHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pLm1hcCgoWywgYWN0aW9uc10pID0+IGFjdGlvbnMpKSxcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gYW5jaG9yLFxuXHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpID0+IHRoaXMsXG5cdFx0fSk7XG5cblx0XHRtZW51LmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2hvd0FnZW50U2Vzc2lvbkNvbnRleHRNZW51KHNlc3Npb246IElBZ2VudFNlc3Npb24sIGFuY2hvcjogSFRNTEVsZW1lbnQgfCBJTW91c2VFdmVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5hY3RpdmF0ZUNoYXRTZXNzaW9uSXRlbVByb3ZpZGVyKHNlc3Npb24ucHJvdmlkZXJUeXBlKTtcblxuXHRcdGNvbnN0IGNvbnRleHRPdmVybGF5OiBBcnJheTxbc3RyaW5nLCBib29sZWFuIHwgc3RyaW5nXT4gPSBbXTtcblx0XHRjb250ZXh0T3ZlcmxheS5wdXNoKFtDaGF0Q29udGV4dEtleXMuaXNBcmNoaXZlZEFnZW50U2Vzc2lvbi5rZXksIHNlc3Npb24uaXNBcmNoaXZlZCgpXSk7XG5cdFx0Y29udGV4dE92ZXJsYXkucHVzaChbQ2hhdENvbnRleHRLZXlzLmlzUGlubmVkQWdlbnRTZXNzaW9uLmtleSwgc2Vzc2lvbi5pc1Bpbm5lZCgpXSk7XG5cdFx0Y29udGV4dE92ZXJsYXkucHVzaChbQ2hhdENvbnRleHRLZXlzLmlzUmVhZEFnZW50U2Vzc2lvbi5rZXksIHNlc3Npb24uaXNSZWFkKCldKTtcblx0XHRjb250ZXh0T3ZlcmxheS5wdXNoKFtDaGF0Q29udGV4dEtleXMuYWdlbnRTZXNzaW9uVHlwZS5rZXksIHNlc3Npb24ucHJvdmlkZXJUeXBlXSk7XG5cdFx0Y29udGV4dE92ZXJsYXkucHVzaChbQ2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvblB1bGxSZXF1ZXN0LmtleSwgZ2V0QWdlbnRTZXNzaW9uUHVsbFJlcXVlc3RDb250ZXh0VmFsdWUoc2Vzc2lvbildKTtcblxuXHRcdGNvbnN0IG1lbnUgPSB0aGlzLm1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoTWVudUlkLkFnZW50U2Vzc2lvbnNDb250ZXh0LCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZU92ZXJsYXkoY29udGV4dE92ZXJsYXkpKTtcblxuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMuc2Vzc2lvbnNMaXN0Py5nZXRTZWxlY3Rpb24oKS5maWx0ZXIoaXNBZ2VudFNlc3Npb24pID8/IFtdO1xuXHRcdGNvbnN0IG1hcnNoYWxsZWRDb250ZXh0OiBJTWFyc2hhbGxlZEFnZW50U2Vzc2lvbkNvbnRleHQgPSB7XG5cdFx0XHRzZXNzaW9uLFxuXHRcdFx0c2Vzc2lvbnM6IHNlbGVjdGlvbi5sZW5ndGggPiAxICYmIHNlbGVjdGlvbi5pbmNsdWRlcyhzZXNzaW9uKSA/IHNlbGVjdGlvbiA6IFtzZXNzaW9uXSxcblx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5BZ2VudFNlc3Npb25Db250ZXh0XG5cdFx0fTtcblxuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBTZXBhcmF0b3Iuam9pbiguLi5tZW51LmdldEFjdGlvbnMoeyBhcmc6IG1hcnNoYWxsZWRDb250ZXh0LCBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9KS5tYXAoKFssIGFjdGlvbnNdKSA9PiBhY3Rpb25zKSksXG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGFuY2hvcixcblx0XHRcdGdldEFjdGlvbnNDb250ZXh0OiAoKSA9PiBtYXJzaGFsbGVkQ29udGV4dCxcblx0XHR9KTtcblxuXHRcdG1lbnUuZGlzcG9zZSgpO1xuXHR9XG5cblx0b3BlbkZpbmQoKTogdm9pZCB7XG5cdFx0dGhpcy5zZXNzaW9uc0xpc3Q/Lm9wZW5GaW5kKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVNlY3Rpb25Db2xsYXBzZVN0YXRlcygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuc2Vzc2lvbnNMaXN0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5faXNQcm9ncmFtbWF0aWNDb2xsYXBzZUNoYW5nZSA9IHRydWU7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX3VwZGF0ZVNlY3Rpb25Db2xsYXBzZVN0YXRlc0NvcmUoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5faXNQcm9ncmFtbWF0aWNDb2xsYXBzZUNoYW5nZSA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVNlY3Rpb25Db2xsYXBzZVN0YXRlc0NvcmUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnNlc3Npb25zTGlzdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbDtcblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMuc2Vzc2lvbnNMaXN0LmdldE5vZGUobW9kZWwpLmNoaWxkcmVuKSB7XG5cdFx0XHRpZiAoIWlzQWdlbnRTZXNzaW9uU2VjdGlvbihjaGlsZC5lbGVtZW50KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0c3dpdGNoIChjaGlsZC5lbGVtZW50LnNlY3Rpb24pIHtcblx0XHRcdFx0Y2FzZSBBZ2VudFNlc3Npb25TZWN0aW9uLkFyY2hpdmVkOiB7XG5cdFx0XHRcdFx0Y29uc3Qgc2hvdWxkQ29sbGFwc2VBcmNoaXZlZCA9XG5cdFx0XHRcdFx0XHQhdGhpcy5zZXNzaW9uc0xpc3RGaW5kSXNPcGVuICYmXHRcdFx0XHQvLyBhbHdheXMgZXhwYW5kIHdoZW4gZmluZCBpcyBvcGVuXG5cdFx0XHRcdFx0XHR0aGlzLm9wdGlvbnMuZmlsdGVyLmdldEV4Y2x1ZGVzKCkuYXJjaGl2ZWQ7XHQvLyBvbmx5IGNvbGxhcHNlIHdoZW4gYXJjaGl2ZWQgYXJlIGV4Y2x1ZGVkIGZyb20gZmlsdGVyXG5cblx0XHRcdFx0XHRpZiAoc2hvdWxkQ29sbGFwc2VBcmNoaXZlZCAmJiAhY2hpbGQuY29sbGFwc2VkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnNlc3Npb25zTGlzdC5jb2xsYXBzZShjaGlsZC5lbGVtZW50KTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKCFzaG91bGRDb2xsYXBzZUFyY2hpdmVkICYmIGNoaWxkLmNvbGxhcHNlZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5zZXNzaW9uc0xpc3QuZXhwYW5kKGNoaWxkLmVsZW1lbnQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIEFnZW50U2Vzc2lvblNlY3Rpb24uTW9yZToge1xuXHRcdFx0XHRcdGlmIChjaGlsZC5jb2xsYXBzZWQgJiYgdGhpcy5zZXNzaW9uc0xpc3RGaW5kSXNPcGVuKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnNlc3Npb25zTGlzdC5leHBhbmQoY2hpbGQuZWxlbWVudCk7IC8vIGFsd2F5cyBleHBhbmQgd2hlbiBmaW5kIGlzIG9wZW5cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRyZWZyZXNoKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLm1vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdGNvbGxhcHNlQWxsU2VjdGlvbnMoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnNlc3Npb25zTGlzdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbDtcblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMuc2Vzc2lvbnNMaXN0LmdldE5vZGUobW9kZWwpLmNoaWxkcmVuKSB7XG5cdFx0XHRpZiAoaXNBZ2VudFNlc3Npb25TZWN0aW9uKGNoaWxkLmVsZW1lbnQpICYmICFjaGlsZC5jb2xsYXBzZWQpIHtcblx0XHRcdFx0dGhpcy5zZXNzaW9uc0xpc3QuY29sbGFwc2UoY2hpbGQuZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgdXBkYXRlKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh0aGlzLnVwZGF0ZVBhdXNlT3duZXIpIHtcblx0XHRcdC8vIFdoaWxlIHVwZGF0ZXMgYXJlIHBhdXNlZCAoZS5nLiBhIHNlc3Npb24gaG92ZXIgaXMgb3BlbiksIGF2b2lkIHJlLXNvcnRpbmcgdGhlIGxpc3Qgc28gaXRlbXMgZG9uJ3QganVtcFxuXHRcdFx0Ly8gYXJvdW5kIHVuZGVyIHRoZSB1c2VyJ3MgY3Vyc29yLiBSZW1lbWJlciB0aGF0IGFuIHVwZGF0ZSBpcyBwZW5kaW5nIGFuZCBydW4gaXQgb25jZSB1cGRhdGVzIGFyZSByZXN1bWVkLlxuXHRcdFx0dGhpcy5oYXNQZW5kaW5nVXBkYXRlID0gdHJ1ZTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy51cGRhdGVTZXNzaW9uc0xpc3RUaHJvdHRsZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMudXBkYXRlUGF1c2VPd25lcikge1xuXHRcdFx0XHR0aGlzLmhhc1BlbmRpbmdVcGRhdGUgPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuaGFzUGVuZGluZ1VwZGF0ZSA9IGZhbHNlO1xuXHRcdFx0dGhpcy5jb21wdXRlUmVjZW50UmVwb3NpdG9yeUxhYmVscygpO1xuXHRcdFx0YXdhaXQgdGhpcy5zZXNzaW9uc0xpc3Q/LnVwZGF0ZUNoaWxkcmVuKCk7XG5cblx0XHRcdHRoaXMuX29uRGlkVXBkYXRlLmZpcmUoKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVQYXVzZU93bmVyOiBvYmplY3QgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaGFzUGVuZGluZ1VwZGF0ZSA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcGF1c2VVcGRhdGVzKCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBvd25lciA9IHt9O1xuXHRcdHRoaXMudXBkYXRlUGF1c2VPd25lciA9IG93bmVyO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMudXBkYXRlUGF1c2VPd25lciAhPT0gb3duZXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy51cGRhdGVQYXVzZU93bmVyID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHRoaXMuaGFzUGVuZGluZ1VwZGF0ZSAmJiB0aGlzLnZpc2libGUpIHtcblx0XHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHNldFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLnZpc2libGUgPT09IHZpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnZpc2libGUgPSB2aXNpYmxlO1xuXG5cdFx0aWYgKHRoaXMudmlzaWJsZSkge1xuXHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHR9XG5cdH1cblxuXHRsYXlvdXQoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLnNlc3Npb25zTGlzdD8ubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXHR9XG5cblx0Zm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5zZXNzaW9uc0xpc3Q/LmRvbUZvY3VzKCk7XG5cblx0XHR0cnkge1xuXHRcdFx0aWYgKCh0aGlzLnNlc3Npb25zTGlzdD8uZ2V0Rm9jdXMoKS5sZW5ndGggPz8gMCkgPT09IDApIHtcblx0XHRcdFx0dGhpcy5zZXNzaW9uc0xpc3Q/LmZvY3VzRmlyc3QoKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIFRyZWUgbW9kZWwgbWF5IGJlIHRlbXBvcmFyaWx5IGluY29uc2lzdGVudCBkdXJpbmcgYXN5bmMgcmVmcmVzaC5cblx0XHR9XG5cdH1cblxuXHRjbGVhckZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuc2Vzc2lvbnNMaXN0Py5zZXRGb2N1cyhbXSk7XG5cdFx0dGhpcy5zZXNzaW9uc0xpc3Q/LnNldFNlbGVjdGlvbihbXSk7XG5cdH1cblxuXHRoYXNGb2N1c09yU2VsZWN0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAodGhpcy5zZXNzaW9uc0xpc3Q/LmdldEZvY3VzKCkubGVuZ3RoID8/IDApID4gMCB8fCAodGhpcy5zZXNzaW9uc0xpc3Q/LmdldFNlbGVjdGlvbigpLmxlbmd0aCA/PyAwKSA+IDA7XG5cdH1cblxuXHRzY3JvbGxUb1RvcCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5zZXNzaW9uc0xpc3QpIHtcblx0XHRcdHRoaXMuc2Vzc2lvbnNMaXN0LnNjcm9sbFRvcCA9IDA7XG5cdFx0fVxuXHR9XG5cblx0Z2V0Rm9jdXMoKTogSUFnZW50U2Vzc2lvbltdIHtcblx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy5zZXNzaW9uc0xpc3Q/LmdldEZvY3VzKCkgPz8gW107XG5cblx0XHRyZXR1cm4gZm9jdXNlZC5maWx0ZXIoZSA9PiBpc0FnZW50U2Vzc2lvbihlKSk7XG5cdH1cblxuXHRyZXZlYWwoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuc2Vzc2lvbnNMaXN0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWwuZ2V0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghc2Vzc2lvbiB8fCAhdGhpcy5zZXNzaW9uc0xpc3QuaGFzTm9kZShzZXNzaW9uKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRpZiAodGhpcy5zZXNzaW9uc0xpc3QuZ2V0UmVsYXRpdmVUb3Aoc2Vzc2lvbikgPT09IG51bGwpIHtcblx0XHRcdFx0dGhpcy5zZXNzaW9uc0xpc3QucmV2ZWFsKHNlc3Npb24sIDAuNSk7IC8vIG9ubHkgcmV2ZWFsIHdoZW4gbm90IGFscmVhZHkgdmlzaWJsZVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gVHJlZSBtb2RlbCBtYXkgYmUgdGVtcG9yYXJpbHkgaW5jb25zaXN0ZW50IGR1cmluZyBhc3luYyByZWZyZXNoLlxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMuc2Vzc2lvbnNMaXN0LnNldEZvY3VzKFtzZXNzaW9uXSk7XG5cdFx0dGhpcy5zZXNzaW9uc0xpc3Quc2V0U2VsZWN0aW9uKFtzZXNzaW9uXSk7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBcUIsMENBQTBDO0FBQy9ELFNBQVMsR0FBRyxRQUFRLGFBQWEsdUJBQXVCLFdBQVcsV0FBVyxNQUFNLHFCQUFxQjtBQUN6RyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFB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
