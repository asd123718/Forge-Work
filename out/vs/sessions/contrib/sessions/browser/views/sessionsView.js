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
import "../media/sessionsViewPane.css";
import * as DOM from "../../../../../base/browser/dom.js";
import { onUnexpectedError } from "../../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../base/common/observable.js";
import { isWeb } from "../../../../../base/common/platform.js";
import { Orientation } from "../../../../../base/browser/ui/sash/sash.js";
import { Sizing, SplitView } from "../../../../../base/browser/ui/splitview/splitview.js";
import { Color } from "../../../../../base/common/color.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../../platform/contextkey/common/contextkey.js";
import { IsAuxiliaryWindowContext, IsSessionsWindowContext } from "../../../../../workbench/common/contextkeys.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { ViewPane } from "../../../../../workbench/browser/parts/views/viewPane.js";
import { IViewDescriptorService } from "../../../../../workbench/common/views.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ChatSessionArchiveActionWordingSettingId, getChatSessionArchivedSectionLabel, getChatSessionArchiveActionWording } from "../../../../../platform/chat/common/sessionArchiveActions.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { localize } from "../../../../../nls.js";
import { SessionsList, SessionsGrouping, SessionsSorting } from "./sessionsList.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { AICustomizationShortcutsWidget } from "../aiCustomizationShortcutsWidget.js";
import { AgentHostShortcutsWidget } from "../agentHostShortcutsWidget.js";
import { Action2, MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { agentsBackground } from "../../../../common/theme.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IHostService } from "../../../../../workbench/services/host/browser/host.js";
import { IWorkbenchLayoutService, Parts } from "../../../../../workbench/services/layout/browser/layoutService.js";
import { PANEL_SECTION_BORDER } from "../../../../../workbench/common/theme.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../../../platform/actions/browser/toolbar.js";
import { Menus } from "../../../../browser/menus.js";
import { MobileSessionFilterChips } from "../../../../browser/parts/mobile/mobileSessionFilterChips.js";
import { showMobileSortGroupSheet } from "../../../../browser/parts/mobile/mobileSortGroupSheet.js";
import { isPhoneLayout } from "../../../../browser/parts/mobile/mobileLayout.js";
import { IsPhoneLayoutContext } from "../../../../common/contextkeys.js";
const $ = DOM.$;
const SessionsViewId = "sessions.workbench.view.sessionsView";
const GROUPING_STORAGE_KEY = "sessionsViewPane.grouping";
const SORTING_STORAGE_KEY = "sessionsViewPane.sorting";
const CUSTOMIZATIONS_MIN_HEIGHT = 129;
const SESSIONS_SECTION_MIN_HEIGHT = 120;
async function openSessionToTheSide(sessionsService, session, options) {
  const visible = sessionsService.visibleSessions.get();
  const lastVisible = visible[visible.length - 1];
  if (lastVisible && lastVisible.sessionId !== session.sessionId) {
    sessionsService.insertAt(session, lastVisible.sessionId, "right");
  }
  await sessionsService.openSession(session.resource, options);
}
const SessionsViewFilterSubMenu = new MenuId("SessionsViewPaneFilterSubMenu");
const SessionsViewFilterOptionsSubMenu = new MenuId("SessionsViewPaneFilterOptionsSubMenu");
const SessionsViewGroupingContext = new RawContextKey("sessionsViewPane.grouping", SessionsGrouping.Workspace);
const SessionsViewSortingContext = new RawContextKey("sessionsViewPane.sorting", SessionsSorting.Created);
const IsWorkspaceGroupCappedContext = new RawContextKey("sessionsViewPane.workspaceGroupCapped", true);
let SessionsView = class extends ViewPane {
  constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, sessionsManagementService, sessionsService, hostService, layoutService, storageService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.sessionsManagementService = sessionsManagementService;
    this.sessionsService = sessionsService;
    this.hostService = hostService;
    this.layoutService = layoutService;
    this.storageService = storageService;
    this.isFindWidgetOpen = false;
    this.currentGrouping = SessionsGrouping.Workspace;
    this.currentSorting = SessionsSorting.Created;
    this.filterContextKeys = /* @__PURE__ */ new Map();
    this.currentBodyHeight = 0;
    this.currentBodyWidth = 0;
    this.didInitializePaneSizes = false;
    this.registeredFilterTypeIds = /* @__PURE__ */ new Set();
    this.archivedFilterRegistration = this._register(new DisposableStore());
    const storedGrouping = this.storageService.get(GROUPING_STORAGE_KEY, StorageScope.PROFILE);
    if (storedGrouping && Object.values(SessionsGrouping).includes(storedGrouping)) {
      this.currentGrouping = storedGrouping;
    }
    const storedSorting = this.storageService.get(SORTING_STORAGE_KEY, StorageScope.PROFILE);
    if (storedSorting && Object.values(SessionsSorting).includes(storedSorting)) {
      this.currentSorting = storedSorting;
    }
    this.groupingContextKey = SessionsViewGroupingContext.bindTo(contextKeyService);
    this.groupingContextKey.set(this.currentGrouping);
    this.sortingContextKey = SessionsViewSortingContext.bindTo(contextKeyService);
    this.sortingContextKey.set(this.currentSorting);
    this.workspaceGroupCappedContextKey = IsWorkspaceGroupCappedContext.bindTo(contextKeyService);
  }
  renderBody(parent) {
    super.renderBody(parent);
    this.viewPaneContainer = parent;
    this.viewPaneContainer.classList.add("agent-sessions-viewpane");
    this.createControls(parent);
  }
  getLocationBasedColors() {
    const colors = super.getLocationBasedColors();
    return {
      ...colors,
      background: void 0,
      listOverrideStyles: {
        ...colors.listOverrideStyles,
        listBackground: void 0,
        treeStickyScrollBackground: agentsBackground
      }
    };
  }
  createControls(parent) {
    const sessionsContainer = DOM.append(parent, $(".agent-sessions-container"));
    this.sidebarSplitViewContainer = DOM.append(sessionsContainer, $(".agent-sessions-sidebar-splitview-container"));
    const sessionsSection = DOM.append(this.sidebarSplitViewContainer, $(".agent-sessions-section"));
    const sessionsContent = DOM.append(sessionsSection, $(".agent-sessions-content"));
    const headerRow = this.headerRow = DOM.append(sessionsContent, $(".agent-sessions-header-row"));
    const headerLabel = this.headerLabel = DOM.append(headerRow, $(".agent-sessions-header-label"));
    const headerActions = this.headerActions = DOM.append(headerRow, $(".agent-sessions-header-actions"));
    const phoneLayout = isPhoneLayout(this.layoutService);
    if (!phoneLayout) {
      headerLabel.textContent = localize("sessionsHeader", "Sessions");
      const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
      this._register(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, headerActions, Menus.SidebarSessionsHeader, {
        hiddenItemStrategy: HiddenItemStrategy.NoHide,
        telemetrySource: "sessionsView.header",
        toolbarOptions: { primaryGroup: () => true }
      }));
    } else {
      headerRow.classList.add("phone-layout-empty");
    }
    const findWidgetContainer = this.findWidgetContainer = DOM.append(headerRow, $(".agent-sessions-find-widget-container"));
    findWidgetContainer.style.display = "none";
    const filterChipsContainer = isPhoneLayout(this.layoutService) ? DOM.append(sessionsContent, $(".mobile-session-filter-chips-slot")) : void 0;
    this.sessionsControlContainer = DOM.append(sessionsContent, $(".agent-sessions-control-container"));
    const sessionsControl = this.sessionsControl = this._register(this.instantiationService.createInstance(SessionsList, this.sessionsControlContainer, {
      overrideStyles: this.getLocationBasedColors().listOverrideStyles,
      grouping: () => this.currentGrouping,
      sorting: () => this.currentSorting,
      findWidgetContainer,
      onSessionOpen: (resource, preserveFocus, sideBySide) => {
        const onOpened = () => {
          if (isWeb && isPhoneLayout(this.layoutService)) {
            this.layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
          }
        };
        if (sideBySide) {
          const session = this.sessionsManagementService.getSession(resource);
          if (session) {
            openSessionToTheSide(this.sessionsService, session, { preserveFocus }).then(onOpened).catch(onUnexpectedError);
            return;
          }
        }
        this.sessionsService.openSession(resource, { preserveFocus }).then(onOpened).catch(onUnexpectedError);
      }
    }));
    this._register(this.onDidChangeBodyVisibility((visible) => sessionsControl.setVisible(visible)));
    this._register(sessionsControl.onDidChangeFindOpenState((open) => {
      this.isFindWidgetOpen = open;
      findWidgetContainer.style.display = open ? "" : "none";
      this.updateHeaderLayout();
    }));
    this._register(DOM.addDisposableListener(findWidgetContainer, "keydown", (e) => {
      if (e.key === "Escape") {
        sessionsControl.closeFind();
        e.stopPropagation();
      }
    }));
    this.workspaceGroupCappedContextKey?.set(sessionsControl.isWorkspaceGroupCapped());
    this.registerSessionTypeFilters(sessionsControl);
    this._register(this.sessionsManagementService.onDidChangeSessionTypes(() => {
      this.registerSessionTypeFilters(sessionsControl);
    }));
    this.registerStatusFilters(sessionsControl);
    this._register(this.hostService.onDidChangeFocus((hasFocus) => {
      if (hasFocus) {
        sessionsControl.refresh();
      }
    }));
    this._register(sessionsControl.onDidUpdate(() => {
      if (!sessionsControl.hasFocusOrSelection()) {
        this.restoreLastSelectedSession();
      }
    }));
    if (filterChipsContainer) {
      const chips = this._register(new MobileSessionFilterChips(filterChipsContainer, sessionsControl));
      this._register(chips.onDidRequestSortGroup(() => {
        this.openSortGroupSheet();
      }));
      this._register(chips.onDidRequestFind(() => {
        this.openFind();
      }));
    }
    this._register(autorun((reader) => {
      const activeSession = this.sessionsService.activeSession.read(reader);
      if (activeSession) {
        if (!sessionsControl.reveal(activeSession.resource)) {
          sessionsControl.clearFocus();
        }
      } else {
        sessionsControl.clearFocus();
      }
    }));
    const customizationsSection = DOM.append(this.sidebarSplitViewContainer, $(".agent-sessions-customizations-section"));
    const customizationsSizeChange = this._register(new Emitter());
    const customizationsWidget = this._customizationsWidget = this._register(this.instantiationService.createInstance(AICustomizationShortcutsWidget, customizationsSection, {
      onDidChangeLayout: () => {
        customizationsSizeChange.fire();
        this.layoutSidebarSplitView();
      }
    }));
    this.sidebarSplitView = this._register(new SplitView(this.sidebarSplitViewContainer, {
      orientation: Orientation.VERTICAL,
      proportionalLayout: false
    }));
    const sessionsPane = {
      element: sessionsSection,
      minimumSize: SESSIONS_SECTION_MIN_HEIGHT,
      maximumSize: Number.POSITIVE_INFINITY,
      onDidChange: Event.None,
      layout: (height) => {
        sessionsSection.style.height = `${height}px`;
        this.sessionsControl?.layout(this.sessionsControlContainer?.offsetHeight ?? 0, this.currentBodyWidth);
      }
    };
    const customizationsPane = {
      element: customizationsSection,
      get minimumSize() {
        return customizationsWidget.collapsed ? customizationsWidget.collapsedHeight : CUSTOMIZATIONS_MIN_HEIGHT;
      },
      get maximumSize() {
        return customizationsWidget.collapsed ? customizationsWidget.collapsedHeight : Math.max(CUSTOMIZATIONS_MIN_HEIGHT, customizationsWidget.desiredHeight);
      },
      onDidChange: Event.map(Event.any(customizationsWidget.onDidChangeHeight, customizationsSizeChange.event), () => this.getCustomizationsPaneHeight()),
      layout: (height) => {
        customizationsSection.style.height = `${height}px`;
        this._customizationsWidget?.layout(height, this.currentBodyWidth);
      }
    };
    this.sidebarSplitView.addView(sessionsPane, Sizing.Distribute, 0, true);
    this.sidebarSplitView.addView(customizationsPane, this.getCustomizationsPaneHeight(), 1, true);
    let savedCustomizationsPaneHeight = this.getCustomizationsPaneHeight();
    this._register(customizationsWidget.onDidToggleCollapsed((collapsed) => {
      if (!this.sidebarSplitView) {
        return;
      }
      if (collapsed) {
        const currentSize = this.sidebarSplitView.getViewSize(1);
        if (currentSize > customizationsWidget.collapsedHeight) {
          savedCustomizationsPaneHeight = currentSize;
        }
        this.sidebarSplitView.resizeView(1, customizationsWidget.collapsedHeight);
      } else {
        this.sidebarSplitView.resizeView(1, savedCustomizationsPaneHeight);
      }
      this.layoutSidebarSplitView();
    }));
    const updateSplitViewStyles = () => {
      const borderColor = this.themeService.getColorTheme().getColor(PANEL_SECTION_BORDER);
      this.sidebarSplitView?.style({ separatorBorder: borderColor ?? Color.transparent });
    };
    updateSplitViewStyles();
    this._register(this.themeService.onDidColorThemeChange(updateSplitViewStyles));
    if (isWeb && this.scopedContextKeyService.contextMatchesRules(ContextKeyExpr.and(
      IsSessionsWindowContext,
      IsAuxiliaryWindowContext.toNegated(),
      IsPhoneLayoutContext.negate()
    ))) {
      this._register(this.instantiationService.createInstance(AgentHostShortcutsWidget, sessionsContainer, {
        onDidChangeLayout: () => {
          this.layoutSidebarSplitView();
        }
      }));
    }
    this._register(DOM.scheduleAtNextAnimationFrame(DOM.getWindow(parent), () => this.layoutSidebarSplitView()));
  }
  focusCustomizations() {
    this._customizationsWidget?.focus();
  }
  restoreLastSelectedSession() {
    const activeSession = this.sessionsService.activeSession.get();
    if (activeSession && this.sessionsControl) {
      this.sessionsControl.reveal(activeSession.resource);
    }
  }
  registerSessionTypeFilters(sessionsControl) {
    const sessionTypes = this.sessionsManagementService.getAllSessionTypes();
    for (let i = 0; i < sessionTypes.length; i++) {
      const type = sessionTypes[i];
      if (this.registeredFilterTypeIds.has(type.id)) {
        continue;
      }
      this.registeredFilterTypeIds.add(type.id);
      const contextKey = new RawContextKey(`sessionsViewPane.filterType.${type.id}`, !sessionsControl.isSessionTypeExcluded(type.id));
      const contextKeyInstance = contextKey.bindTo(this.scopedContextKeyService);
      this.filterContextKeys.set(contextKey.key, { key: contextKeyInstance, getDefault: () => true });
      this._register(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: `sessionsViewPane.filterType.${type.id}`,
            title: type.label,
            toggled: ContextKeyExpr.equals(contextKey.key, true),
            menu: [{
              id: SessionsViewFilterOptionsSubMenu,
              group: "1_types",
              order: i
            }]
          });
        }
        run() {
          const isExcluded = sessionsControl.isSessionTypeExcluded(type.id);
          sessionsControl.setSessionTypeExcluded(type.id, !isExcluded);
          contextKeyInstance.set(isExcluded);
        }
      }));
    }
  }
  registerStatusFilters(sessionsControl) {
    const statusFilters = [
      { status: SessionStatus.Completed, label: localize("statusCompleted", "Completed") },
      { status: SessionStatus.InProgress, label: localize("statusInProgress", "In Progress") },
      { status: SessionStatus.NeedsInput, label: localize("statusNeedsInput", "Input Needed") },
      { status: SessionStatus.Error, label: localize("statusFailed", "Failed") }
    ];
    for (let i = 0; i < statusFilters.length; i++) {
      const { status, label } = statusFilters[i];
      const contextKey = new RawContextKey(`sessionsViewPane.filterStatus.${status}`, !sessionsControl.isStatusExcluded(status));
      const contextKeyInstance = contextKey.bindTo(this.scopedContextKeyService);
      this.filterContextKeys.set(contextKey.key, { key: contextKeyInstance, getDefault: () => true });
      this._register(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: `sessionsViewPane.filterStatus.${status}`,
            title: label,
            toggled: ContextKeyExpr.equals(contextKey.key, true),
            menu: [{
              id: SessionsViewFilterOptionsSubMenu,
              group: "2_status",
              order: i
            }]
          });
        }
        run() {
          const isExcluded = sessionsControl.isStatusExcluded(status);
          sessionsControl.setStatusExcluded(status, !isExcluded);
          contextKeyInstance.set(isExcluded);
        }
      }));
    }
    const archivedContextKey = new RawContextKey("sessionsViewPane.filter.showArchived", !sessionsControl.isExcludeArchived());
    const archivedContextKeyInstance = archivedContextKey.bindTo(this.scopedContextKeyService);
    this.filterContextKeys.set(archivedContextKey.key, { key: archivedContextKeyInstance, getDefault: () => false });
    const registerArchivedFilter = () => {
      this.archivedFilterRegistration.clear();
      const title = getChatSessionArchivedSectionLabel(getChatSessionArchiveActionWording(this.configurationService));
      this.archivedFilterRegistration.add(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: "sessionsViewPane.filterArchived",
            title,
            toggled: ContextKeyExpr.equals(archivedContextKey.key, true),
            menu: [{
              id: SessionsViewFilterOptionsSubMenu,
              group: "3_props",
              order: 0
            }]
          });
        }
        run() {
          const excluding = sessionsControl.isExcludeArchived();
          sessionsControl.setExcludeArchived(!excluding);
          archivedContextKeyInstance.set(excluding);
        }
      }));
    };
    registerArchivedFilter();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatSessionArchiveActionWordingSettingId)) {
        registerArchivedFilter();
      }
    }));
    const readContextKey = new RawContextKey("sessionsViewPane.filter.showRead", !sessionsControl.isExcludeRead());
    const readContextKeyInstance = readContextKey.bindTo(this.scopedContextKeyService);
    this.filterContextKeys.set(readContextKey.key, { key: readContextKeyInstance, getDefault: () => true });
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "sessionsViewPane.filterRead",
          title: localize("filterRead", "Read"),
          toggled: ContextKeyExpr.equals(readContextKey.key, true),
          menu: [{
            id: SessionsViewFilterOptionsSubMenu,
            group: "3_props",
            order: 1
          }]
        });
      }
      run() {
        const excluding = sessionsControl.isExcludeRead();
        sessionsControl.setExcludeRead(!excluding);
        readContextKeyInstance.set(excluding);
      }
    }));
    const filterContextKeys = this.filterContextKeys;
    const workspaceGroupCappedContextKey = this.workspaceGroupCappedContextKey;
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "sessionsViewPane.resetFilters",
          title: localize("resetFilters", "Reset"),
          menu: [{
            id: SessionsViewFilterOptionsSubMenu,
            group: "4_reset",
            order: 0
          }]
        });
      }
      run() {
        sessionsControl.resetFilters();
        for (const { key, getDefault } of filterContextKeys.values()) {
          key.set(getDefault());
        }
        workspaceGroupCappedContextKey?.set(sessionsControl.isWorkspaceGroupCapped());
      }
    }));
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.currentBodyHeight = height;
    this.currentBodyWidth = width;
    this.updateHeaderLayout();
    this.layoutSidebarSplitView();
    if (this.sidebarSplitView || !this.sessionsControl || !this.sessionsControlContainer) {
      return;
    }
    this.sessionsControl.layout(this.sessionsControlContainer.offsetHeight, width);
  }
  layoutSidebarSplitView() {
    if (!this.sidebarSplitView || !this.sidebarSplitViewContainer) {
      return;
    }
    const height = this.sidebarSplitViewContainer.offsetHeight || this.currentBodyHeight || this.viewPaneContainer?.offsetHeight || 0;
    if (height <= 0) {
      return;
    }
    if (this.sidebarSplitViewContainer.offsetHeight === 0) {
      this.sidebarSplitViewContainer.style.height = `${height}px`;
    }
    this.sidebarSplitView.layout(height);
    if (!this.didInitializePaneSizes) {
      this.didInitializePaneSizes = true;
      this.sidebarSplitView.resizeView(1, this.getCustomizationsPaneHeight());
    }
  }
  getCustomizationsPaneHeight() {
    if (this._customizationsWidget?.collapsed) {
      return this._customizationsWidget.collapsedHeight;
    }
    const desiredHeight = this._customizationsWidget?.desiredHeight ?? 0;
    return Math.max(CUSTOMIZATIONS_MIN_HEIGHT, Number.isFinite(desiredHeight) ? desiredHeight : 0);
  }
  focus() {
    super.focus();
    this.sessionsControl?.focus();
  }
  refresh() {
    this.sessionsControl?.refresh();
  }
  openFind() {
    this.isFindWidgetOpen = true;
    if (this.findWidgetContainer) {
      this.findWidgetContainer.style.display = "";
    }
    this.updateHeaderLayout();
    this.sessionsControl?.openFind();
  }
  updateHeaderLayout() {
    if (!this.headerRow || !this.headerLabel || !this.headerActions) {
      return;
    }
    if (isPhoneLayout(this.layoutService)) {
      this.headerRow.classList.toggle("phone-layout-empty", !this.isFindWidgetOpen);
      return;
    }
    if (this.isFindWidgetOpen) {
      this.headerLabel.style.display = "none";
      this.headerActions.style.display = "none";
      return;
    }
    this.headerLabel.style.display = "";
    this.headerActions.style.display = "";
  }
  /**
   * Phone-only: present a bottom sheet with the four sort/group toggles.
   * Filtering on phone is performed via the status filter chips, so the
   * sheet intentionally omits "Filter", "Show Recent/All Sessions", and
   * "Collapse All Groups" actions found in the desktop submenu.
   */
  openSortGroupSheet() {
    const sortTitle = localize("sortGroupSheet.sort", "Sort");
    const groupTitle = localize("sortGroupSheet.group", "Group");
    const items = [
      {
        id: SessionsSorting.Created,
        label: localize("sortByCreated", "Sort by Created"),
        checked: this.currentSorting === SessionsSorting.Created,
        group: "sort",
        groupTitle: sortTitle
      },
      {
        id: SessionsSorting.Updated,
        label: localize("sortByUpdated", "Sort by Updated"),
        checked: this.currentSorting === SessionsSorting.Updated,
        group: "sort"
      },
      {
        id: SessionsGrouping.Workspace,
        label: localize("groupByWorkspace", "Group by Workspace"),
        checked: this.currentGrouping === SessionsGrouping.Workspace,
        group: "group",
        groupTitle
      },
      {
        id: SessionsGrouping.Date,
        label: localize("groupByTime", "Group by Time"),
        checked: this.currentGrouping === SessionsGrouping.Date,
        group: "group"
      }
    ];
    showMobileSortGroupSheet(this.layoutService.mainContainer, localize("sortGroupSheet.title", "Sort"), items).then((selectedId) => {
      if (!selectedId) {
        return;
      }
      if (selectedId === SessionsSorting.Created || selectedId === SessionsSorting.Updated) {
        this.setSorting(selectedId);
      } else if (selectedId === SessionsGrouping.Workspace || selectedId === SessionsGrouping.Date) {
        this.setGrouping(selectedId);
      }
    });
  }
  setGrouping(grouping) {
    if (this.currentGrouping === grouping) {
      return;
    }
    this.currentGrouping = grouping;
    this.storageService.store(GROUPING_STORAGE_KEY, this.currentGrouping, StorageScope.PROFILE, StorageTarget.USER);
    this.groupingContextKey?.set(this.currentGrouping);
    this.sessionsControl?.resetSectionCollapseState();
    this.sessionsControl?.update(true);
  }
  setSorting(sorting) {
    if (this.currentSorting === sorting) {
      return;
    }
    this.currentSorting = sorting;
    this.storageService.store(SORTING_STORAGE_KEY, this.currentSorting, StorageScope.PROFILE, StorageTarget.USER);
    this.sortingContextKey?.set(this.currentSorting);
    this.sessionsControl?.update();
  }
};
SessionsView = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, ISessionsManagementService),
  __decorateParam(11, ISessionsService),
  __decorateParam(12, IHostService),
  __decorateParam(13, IWorkbenchLayoutService),
  __decorateParam(14, IStorageService)
], SessionsView);
export {
  IsWorkspaceGroupCappedContext,
  SessionsView,
  SessionsViewFilterOptionsSubMenu,
  SessionsViewFilterSubMenu,
  SessionsViewGroupingContext,
  SessionsViewId,
  SessionsViewSortingContext,
  openSessionToTheSide
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcc2Vzc2lvbnNcXGJyb3dzZXJcXHZpZXdzXFxzZXNzaW9uc1ZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4uL21lZGlhL3Nlc3Npb25zVmlld1BhbmUuY3NzJztcbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgT3JpZW50YXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2FzaC9zYXNoLmpzJztcbmltcG9ydCB7IElWaWV3LCBTaXppbmcsIFNwbGl0VmlldyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zcGxpdHZpZXcvc3BsaXR2aWV3LmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElzQXV4aWxpYXJ5V2luZG93Q29udGV4dCwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZpZXdQYW5lT3B0aW9ucywgSVZpZXdQYW5lTG9jYXRpb25Db2xvcnMsIFZpZXdQYW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmUuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nU2V0dGluZ0lkLCBnZXRDaGF0U2Vzc2lvbkFyY2hpdmVkU2VjdGlvbkxhYmVsLCBnZXRDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2hhdC9jb21tb24vc2Vzc2lvbkFyY2hpdmVBY3Rpb25zLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFNlc3Npb25zTGlzdCwgU2Vzc2lvbnNHcm91cGluZywgU2Vzc2lvbnNTb3J0aW5nIH0gZnJvbSAnLi9zZXNzaW9uc0xpc3QuanMnO1xuaW1wb3J0IHsgSVNlc3Npb24sIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25TaG9ydGN1dHNXaWRnZXQgfSBmcm9tICcuLi9haUN1c3RvbWl6YXRpb25TaG9ydGN1dHNXaWRnZXQuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U2hvcnRjdXRzV2lkZ2V0IH0gZnJvbSAnLi4vYWdlbnRIb3N0U2hvcnRjdXRzV2lkZ2V0LmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBhZ2VudHNCYWNrZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIFBhcnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUEFORUxfU0VDVElPTl9CT1JERVIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSGlkZGVuSXRlbVN0cmF0ZWd5LCBNZW51V29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IE1lbnVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9tZW51cy5qcyc7XG5pbXBvcnQgeyBNb2JpbGVTZXNzaW9uRmlsdGVyQ2hpcHMgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL21vYmlsZS9tb2JpbGVTZXNzaW9uRmlsdGVyQ2hpcHMuanMnO1xuaW1wb3J0IHsgSU1vYmlsZVNvcnRHcm91cFNoZWV0SXRlbSwgc2hvd01vYmlsZVNvcnRHcm91cFNoZWV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9tb2JpbGUvbW9iaWxlU29ydEdyb3VwU2hlZXQuanMnO1xuaW1wb3J0IHsgaXNQaG9uZUxheW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvbW9iaWxlL21vYmlsZUxheW91dC5qcyc7XG5pbXBvcnQgeyBJc1Bob25lTGF5b3V0Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5cbmNvbnN0ICQgPSBET00uJDtcbmV4cG9ydCBjb25zdCBTZXNzaW9uc1ZpZXdJZCA9ICdzZXNzaW9ucy53b3JrYmVuY2gudmlldy5zZXNzaW9uc1ZpZXcnO1xuY29uc3QgR1JPVVBJTkdfU1RPUkFHRV9LRVkgPSAnc2Vzc2lvbnNWaWV3UGFuZS5ncm91cGluZyc7XG5jb25zdCBTT1JUSU5HX1NUT1JBR0VfS0VZID0gJ3Nlc3Npb25zVmlld1BhbmUuc29ydGluZyc7XG5jb25zdCBDVVNUT01JWkFUSU9OU19NSU5fSEVJR0hUID0gMTI5O1xuY29uc3QgU0VTU0lPTlNfU0VDVElPTl9NSU5fSEVJR0hUID0gMTIwO1xuXG4vKipcbiAqIFBsYWNlIHRoZSBnaXZlbiBzZXNzaW9uIGluIHRoZSBzZXNzaW9ucyBncmlkIHRvIHRoZSByaWdodCBvZiB0aGUgbGFzdFxuICogY3VycmVudGx5LXZpc2libGUgc2Vzc2lvbiAoYXMgYSBub24tc3RpY2t5IGVudHJ5KSBhbmQgbWFrZSBpdCBhY3RpdmUuIElmXG4gKiB0aGUgc2Vzc2lvbiBpcyBhbHJlYWR5IHRoZSBsYXN0IHZpc2libGUgb25lLCB0aGlzIGlzIGEgbm8tb3AgYXNpZGUgZnJvbVxuICogYWN0aXZhdGlvbi5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG9wZW5TZXNzaW9uVG9UaGVTaWRlKHNlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSwgc2Vzc2lvbjogSVNlc3Npb24sIG9wdGlvbnM/OiB7IHByZXNlcnZlRm9jdXM/OiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3QgdmlzaWJsZSA9IHNlc3Npb25zU2VydmljZS52aXNpYmxlU2Vzc2lvbnMuZ2V0KCk7XG5cdGNvbnN0IGxhc3RWaXNpYmxlID0gdmlzaWJsZVt2aXNpYmxlLmxlbmd0aCAtIDFdO1xuXHRpZiAobGFzdFZpc2libGUgJiYgbGFzdFZpc2libGUuc2Vzc2lvbklkICE9PSBzZXNzaW9uLnNlc3Npb25JZCkge1xuXHRcdHNlc3Npb25zU2VydmljZS5pbnNlcnRBdChzZXNzaW9uLCBsYXN0VmlzaWJsZS5zZXNzaW9uSWQsICdyaWdodCcpO1xuXHR9XG5cdGF3YWl0IHNlc3Npb25zU2VydmljZS5vcGVuU2Vzc2lvbihzZXNzaW9uLnJlc291cmNlLCBvcHRpb25zKTtcbn1cblxuZXhwb3J0IGNvbnN0IFNlc3Npb25zVmlld0ZpbHRlclN1Yk1lbnUgPSBuZXcgTWVudUlkKCdTZXNzaW9uc1ZpZXdQYW5lRmlsdGVyU3ViTWVudScpO1xuZXhwb3J0IGNvbnN0IFNlc3Npb25zVmlld0ZpbHRlck9wdGlvbnNTdWJNZW51ID0gbmV3IE1lbnVJZCgnU2Vzc2lvbnNWaWV3UGFuZUZpbHRlck9wdGlvbnNTdWJNZW51Jyk7XG5leHBvcnQgY29uc3QgU2Vzc2lvbnNWaWV3R3JvdXBpbmdDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8c3RyaW5nPignc2Vzc2lvbnNWaWV3UGFuZS5ncm91cGluZycsIFNlc3Npb25zR3JvdXBpbmcuV29ya3NwYWNlKTtcbmV4cG9ydCBjb25zdCBTZXNzaW9uc1ZpZXdTb3J0aW5nQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PHN0cmluZz4oJ3Nlc3Npb25zVmlld1BhbmUuc29ydGluZycsIFNlc3Npb25zU29ydGluZy5DcmVhdGVkKTtcbmV4cG9ydCBjb25zdCBJc1dvcmtzcGFjZUdyb3VwQ2FwcGVkQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzZXNzaW9uc1ZpZXdQYW5lLndvcmtzcGFjZUdyb3VwQ2FwcGVkJywgdHJ1ZSk7XG5cbmV4cG9ydCBjbGFzcyBTZXNzaW9uc1ZpZXcgZXh0ZW5kcyBWaWV3UGFuZSB7XG5cblx0cHJpdmF0ZSB2aWV3UGFuZUNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc2lkZWJhclNwbGl0Vmlld0NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc2lkZWJhclNwbGl0VmlldzogU3BsaXRWaWV3IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHNlc3Npb25zQ29udHJvbENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZmluZFdpZGdldENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaGVhZGVyUm93OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBoZWFkZXJMYWJlbDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaGVhZGVyQWN0aW9uczogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaXNGaW5kV2lkZ2V0T3BlbiA9IGZhbHNlO1xuXHRzZXNzaW9uc0NvbnRyb2w6IFNlc3Npb25zTGlzdCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY3VzdG9taXphdGlvbnNXaWRnZXQ6IEFJQ3VzdG9taXphdGlvblNob3J0Y3V0c1dpZGdldCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjdXJyZW50R3JvdXBpbmc6IFNlc3Npb25zR3JvdXBpbmcgPSBTZXNzaW9uc0dyb3VwaW5nLldvcmtzcGFjZTtcblx0cHJpdmF0ZSBjdXJyZW50U29ydGluZzogU2Vzc2lvbnNTb3J0aW5nID0gU2Vzc2lvbnNTb3J0aW5nLkNyZWF0ZWQ7XG5cdHByaXZhdGUgZ3JvdXBpbmdDb250ZXh0S2V5OiBJQ29udGV4dEtleSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzb3J0aW5nQ29udGV4dEtleTogSUNvbnRleHRLZXkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgd29ya3NwYWNlR3JvdXBDYXBwZWRDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBmaWx0ZXJDb250ZXh0S2V5cyA9IG5ldyBNYXA8c3RyaW5nLCB7IGtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47IGdldERlZmF1bHQ6ICgpID0+IGJvb2xlYW4gfT4oKTtcblx0cHJpdmF0ZSBjdXJyZW50Qm9keUhlaWdodCA9IDA7XG5cdHByaXZhdGUgY3VycmVudEJvZHlXaWR0aCA9IDA7XG5cdHByaXZhdGUgZGlkSW5pdGlhbGl6ZVBhbmVTaXplcyA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdGlvbnM6IElWaWV3UGFuZU9wdGlvbnMsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZXNzaW9uc1NlcnZpY2U6IElTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKG9wdGlvbnMsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgb3BlbmVyU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXG5cdFx0Ly8gUmVzdG9yZSBwZXJzaXN0ZWQgZ3JvdXBpbmdcblx0XHRjb25zdCBzdG9yZWRHcm91cGluZyA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KEdST1VQSU5HX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0aWYgKHN0b3JlZEdyb3VwaW5nICYmIE9iamVjdC52YWx1ZXMoU2Vzc2lvbnNHcm91cGluZykuaW5jbHVkZXMoc3RvcmVkR3JvdXBpbmcgYXMgU2Vzc2lvbnNHcm91cGluZykpIHtcblx0XHRcdHRoaXMuY3VycmVudEdyb3VwaW5nID0gc3RvcmVkR3JvdXBpbmcgYXMgU2Vzc2lvbnNHcm91cGluZztcblx0XHR9XG5cblx0XHQvLyBSZXN0b3JlIHBlcnNpc3RlZCBzb3J0aW5nXG5cdFx0Y29uc3Qgc3RvcmVkU29ydGluZyA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFNPUlRJTkdfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRpZiAoc3RvcmVkU29ydGluZyAmJiBPYmplY3QudmFsdWVzKFNlc3Npb25zU29ydGluZykuaW5jbHVkZXMoc3RvcmVkU29ydGluZyBhcyBTZXNzaW9uc1NvcnRpbmcpKSB7XG5cdFx0XHR0aGlzLmN1cnJlbnRTb3J0aW5nID0gc3RvcmVkU29ydGluZyBhcyBTZXNzaW9uc1NvcnRpbmc7XG5cdFx0fVxuXG5cdFx0Ly8gRW5zdXJlIGNvbnRleHQga2V5cyByZWZsZWN0IHJlc3RvcmVkIHN0YXRlIGltbWVkaWF0ZWx5XG5cdFx0dGhpcy5ncm91cGluZ0NvbnRleHRLZXkgPSBTZXNzaW9uc1ZpZXdHcm91cGluZ0NvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmdyb3VwaW5nQ29udGV4dEtleS5zZXQodGhpcy5jdXJyZW50R3JvdXBpbmcpO1xuXHRcdHRoaXMuc29ydGluZ0NvbnRleHRLZXkgPSBTZXNzaW9uc1ZpZXdTb3J0aW5nQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc29ydGluZ0NvbnRleHRLZXkuc2V0KHRoaXMuY3VycmVudFNvcnRpbmcpO1xuXG5cdFx0Ly8gQmluZCB3b3Jrc3BhY2UgZ3JvdXAgY2FwcGVkIGNvbnRleHQga2V5ICh3aWxsIGJlIHN5bmNlZCB3aXRoIHBlcnNpc3RlZCBzdGF0ZSBpbiByZW5kZXJCb2R5KVxuXHRcdHRoaXMud29ya3NwYWNlR3JvdXBDYXBwZWRDb250ZXh0S2V5ID0gSXNXb3Jrc3BhY2VHcm91cENhcHBlZENvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJCb2R5KHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJCb2R5KHBhcmVudCk7XG5cblx0XHR0aGlzLnZpZXdQYW5lQ29udGFpbmVyID0gcGFyZW50O1xuXHRcdHRoaXMudmlld1BhbmVDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnYWdlbnQtc2Vzc2lvbnMtdmlld3BhbmUnKTtcblxuXHRcdHRoaXMuY3JlYXRlQ29udHJvbHMocGFyZW50KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRMb2NhdGlvbkJhc2VkQ29sb3JzKCk6IElWaWV3UGFuZUxvY2F0aW9uQ29sb3JzIHtcblx0XHRjb25zdCBjb2xvcnMgPSBzdXBlci5nZXRMb2NhdGlvbkJhc2VkQ29sb3JzKCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmNvbG9ycyxcblx0XHRcdGJhY2tncm91bmQ6IHVuZGVmaW5lZCEsXG5cdFx0XHRsaXN0T3ZlcnJpZGVTdHlsZXM6IHtcblx0XHRcdFx0Li4uY29sb3JzLmxpc3RPdmVycmlkZVN0eWxlcyxcblx0XHRcdFx0bGlzdEJhY2tncm91bmQ6IHVuZGVmaW5lZCEsXG5cdFx0XHRcdHRyZWVTdGlja3lTY3JvbGxCYWNrZ3JvdW5kOiBhZ2VudHNCYWNrZ3JvdW5kLFxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUNvbnRyb2xzKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uc0NvbnRhaW5lciA9IERPTS5hcHBlbmQocGFyZW50LCAkKCcuYWdlbnQtc2Vzc2lvbnMtY29udGFpbmVyJykpO1xuXHRcdHRoaXMuc2lkZWJhclNwbGl0Vmlld0NvbnRhaW5lciA9IERPTS5hcHBlbmQoc2Vzc2lvbnNDb250YWluZXIsICQoJy5hZ2VudC1zZXNzaW9ucy1zaWRlYmFyLXNwbGl0dmlldy1jb250YWluZXInKSk7XG5cblx0XHQvLyBTZXNzaW9ucyBzZWN0aW9uICh0b3AsIGZpbGxzIGF2YWlsYWJsZSBzcGFjZSlcblx0XHRjb25zdCBzZXNzaW9uc1NlY3Rpb24gPSBET00uYXBwZW5kKHRoaXMuc2lkZWJhclNwbGl0Vmlld0NvbnRhaW5lciwgJCgnLmFnZW50LXNlc3Npb25zLXNlY3Rpb24nKSk7XG5cblx0XHQvLyBTZXNzaW9ucyBjb250ZW50IGNvbnRhaW5lclxuXHRcdGNvbnN0IHNlc3Npb25zQ29udGVudCA9IERPTS5hcHBlbmQoc2Vzc2lvbnNTZWN0aW9uLCAkKCcuYWdlbnQtc2Vzc2lvbnMtY29udGVudCcpKTtcblxuXHRcdC8vIEhlYWRlciByb3c6IFwiU2Vzc2lvbnNcIiBsYWJlbCAobGVmdCkgKyBjb21wYWN0IFwiTmV3XCIgYnV0dG9uIChyaWdodClcblx0XHRjb25zdCBoZWFkZXJSb3cgPSB0aGlzLmhlYWRlclJvdyA9IERPTS5hcHBlbmQoc2Vzc2lvbnNDb250ZW50LCAkKCcuYWdlbnQtc2Vzc2lvbnMtaGVhZGVyLXJvdycpKTtcblx0XHRjb25zdCBoZWFkZXJMYWJlbCA9IHRoaXMuaGVhZGVyTGFiZWwgPSBET00uYXBwZW5kKGhlYWRlclJvdywgJCgnLmFnZW50LXNlc3Npb25zLWhlYWRlci1sYWJlbCcpKTtcblxuXHRcdGNvbnN0IGhlYWRlckFjdGlvbnMgPSB0aGlzLmhlYWRlckFjdGlvbnMgPSBET00uYXBwZW5kKGhlYWRlclJvdywgJCgnLmFnZW50LXNlc3Npb25zLWhlYWRlci1hY3Rpb25zJykpO1xuXG5cdFx0Ly8gT24gcGhvbmUsIHRoZSBkZXNrdG9wIGhlYWRlciBjb250ZW50IChsYWJlbCArIG5ldyBidXR0b24gKyBmaWx0ZXIvZmluZCB0b29sYmFyKVxuXHRcdC8vIGlzIGhpZGRlbiBpbiBmYXZvciBvZiB0aGUgbW9iaWxlIGZpbHRlciBjaGlwIHJvdyArIHRoZSAoKykgYnV0dG9uIGluIHRoZVxuXHRcdC8vIE1vYmlsZVRpdGxlYmFyUGFydC4gV2Ugc3RpbGwgY3JlYXRlIHRoZSByb3cgY29udGFpbmVyIGJlY2F1c2UgdGhlIGZpbmRcblx0XHQvLyB3aWRnZXQgbW91bnRzIGluc2lkZSBpdC5cblx0XHRjb25zdCBwaG9uZUxheW91dCA9IGlzUGhvbmVMYXlvdXQodGhpcy5sYXlvdXRTZXJ2aWNlKTtcblx0XHRpZiAoIXBob25lTGF5b3V0KSB7XG5cdFx0XHRoZWFkZXJMYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdzZXNzaW9uc0hlYWRlcicsIFwiU2Vzc2lvbnNcIik7XG5cblx0XHRcdC8vIEhlYWRlciBhY3Rpb25zICh2aXN1YWwgb3JkZXI6IE5ldywgRmlsdGVyLCBTZWFyY2gpLiBUaGUgXCJOZXdcIiBidXR0b24gaXNcblx0XHRcdC8vIGNvbnRyaWJ1dGVkIHRvIE1lbnVzLlNpZGViYXJTZXNzaW9uc0hlYWRlciBhbmQgcmVuZGVyZWQgYXMgYSBjb21wYWN0IHBpbGxcblx0XHRcdC8vIGJ5IE5ld1Nlc3Npb25BY3Rpb25WaWV3SXRlbS5cblx0XHRcdGNvbnN0IHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgdGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZV0pKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgaGVhZGVyQWN0aW9ucywgTWVudXMuU2lkZWJhclNlc3Npb25zSGVhZGVyLCB7XG5cdFx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lk5vSGlkZSxcblx0XHRcdFx0dGVsZW1ldHJ5U291cmNlOiAnc2Vzc2lvbnNWaWV3LmhlYWRlcicsXG5cdFx0XHRcdHRvb2xiYXJPcHRpb25zOiB7IHByaW1hcnlHcm91cDogKCkgPT4gdHJ1ZSB9LFxuXHRcdFx0fSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRoZWFkZXJSb3cuY2xhc3NMaXN0LmFkZCgncGhvbmUtbGF5b3V0LWVtcHR5Jyk7XG5cdFx0fVxuXG5cdFx0Ly8gQ29udGFpbmVyIGZvciB0aGUgdHJlZSdzIGZpbmQgd2lkZ2V0ICh0b2dnbGVkIGJ5IHRoZSB0b29sYmFyJ3MgRmluZCBhY3Rpb24pXG5cdFx0Y29uc3QgZmluZFdpZGdldENvbnRhaW5lciA9IHRoaXMuZmluZFdpZGdldENvbnRhaW5lciA9IERPTS5hcHBlbmQoaGVhZGVyUm93LCAkKCcuYWdlbnQtc2Vzc2lvbnMtZmluZC13aWRnZXQtY29udGFpbmVyJykpO1xuXHRcdGZpbmRXaWRnZXRDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuXHRcdC8vIFJlc2VydmUgRE9NIHNsb3QgZm9yIG1vYmlsZSBmaWx0ZXIgY2hpcHMgKHBob25lIGxheW91dCBvbmx5KS5cblx0XHQvLyBUaGUgYWN0dWFsIHdpZGdldCBpcyBjcmVhdGVkIGFmdGVyIHNlc3Npb25zQ29udHJvbCBpcyBhdmFpbGFibGUuXG5cdFx0Y29uc3QgZmlsdGVyQ2hpcHNDb250YWluZXIgPSBpc1Bob25lTGF5b3V0KHRoaXMubGF5b3V0U2VydmljZSlcblx0XHRcdD8gRE9NLmFwcGVuZChzZXNzaW9uc0NvbnRlbnQsICQoJy5tb2JpbGUtc2Vzc2lvbi1maWx0ZXItY2hpcHMtc2xvdCcpKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHQvLyBTZXNzaW9ucyBMaXN0IENvbnRyb2xcblx0XHR0aGlzLnNlc3Npb25zQ29udHJvbENvbnRhaW5lciA9IERPTS5hcHBlbmQoc2Vzc2lvbnNDb250ZW50LCAkKCcuYWdlbnQtc2Vzc2lvbnMtY29udHJvbC1jb250YWluZXInKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNDb250cm9sID0gdGhpcy5zZXNzaW9uc0NvbnRyb2wgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25zTGlzdCwgdGhpcy5zZXNzaW9uc0NvbnRyb2xDb250YWluZXIsIHtcblx0XHRcdG92ZXJyaWRlU3R5bGVzOiB0aGlzLmdldExvY2F0aW9uQmFzZWRDb2xvcnMoKS5saXN0T3ZlcnJpZGVTdHlsZXMsXG5cdFx0XHRncm91cGluZzogKCkgPT4gdGhpcy5jdXJyZW50R3JvdXBpbmcsXG5cdFx0XHRzb3J0aW5nOiAoKSA9PiB0aGlzLmN1cnJlbnRTb3J0aW5nLFxuXHRcdFx0ZmluZFdpZGdldENvbnRhaW5lcixcblx0XHRcdG9uU2Vzc2lvbk9wZW46IChyZXNvdXJjZSwgcHJlc2VydmVGb2N1cywgc2lkZUJ5U2lkZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBvbk9wZW5lZCA9ICgpID0+IHtcblx0XHRcdFx0XHRpZiAoaXNXZWIgJiYgaXNQaG9uZUxheW91dCh0aGlzLmxheW91dFNlcnZpY2UpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbih0cnVlLCBQYXJ0cy5TSURFQkFSX1BBUlQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdFx0aWYgKHNpZGVCeVNpZGUpIHtcblx0XHRcdFx0XHQvLyBBbHQtY2xpY2s6IG9wZW4gdGhlIHNlc3Npb24gdG8gdGhlIHJpZ2h0IG9mIHRoZSBsYXN0IHZpc2libGUgc2Vzc2lvbiBpbiB0aGUgZ3JpZC5cblx0XHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldFNlc3Npb24ocmVzb3VyY2UpO1xuXHRcdFx0XHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRcdFx0XHRvcGVuU2Vzc2lvblRvVGhlU2lkZSh0aGlzLnNlc3Npb25zU2VydmljZSwgc2Vzc2lvbiwgeyBwcmVzZXJ2ZUZvY3VzIH0pLnRoZW4ob25PcGVuZWQpLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5zZXNzaW9uc1NlcnZpY2Uub3BlblNlc3Npb24ocmVzb3VyY2UsIHsgcHJlc2VydmVGb2N1cyB9KS50aGVuKG9uT3BlbmVkKS5jYXRjaChvblVuZXhwZWN0ZWRFcnJvcik7XG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlQm9keVZpc2liaWxpdHkodmlzaWJsZSA9PiBzZXNzaW9uc0NvbnRyb2wuc2V0VmlzaWJsZSh2aXNpYmxlKSkpO1xuXG5cdFx0Ly8gVG9nZ2xlIGhlYWRlciBsYWJlbC9hY3Rpb25zIHZpc2liaWxpdHkgd2hlbiBmaW5kIHdpZGdldCBvcGVucy9jbG9zZXNcblx0XHR0aGlzLl9yZWdpc3RlcihzZXNzaW9uc0NvbnRyb2wub25EaWRDaGFuZ2VGaW5kT3BlblN0YXRlKG9wZW4gPT4ge1xuXHRcdFx0dGhpcy5pc0ZpbmRXaWRnZXRPcGVuID0gb3Blbjtcblx0XHRcdGZpbmRXaWRnZXRDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IG9wZW4gPyAnJyA6ICdub25lJztcblx0XHRcdHRoaXMudXBkYXRlSGVhZGVyTGF5b3V0KCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ2xvc2UgZmluZCB3aWRnZXQgb24gRXNjYXBlXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihmaW5kV2lkZ2V0Q29udGFpbmVyLCAna2V5ZG93bicsIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZS5rZXkgPT09ICdFc2NhcGUnKSB7XG5cdFx0XHRcdHNlc3Npb25zQ29udHJvbC5jbG9zZUZpbmQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBTeW5jIHdvcmtzcGFjZSBncm91cCBjYXBwZWQgY29udGV4dCBrZXkgd2l0aCBwZXJzaXN0ZWQgc3RhdGVcblx0XHR0aGlzLndvcmtzcGFjZUdyb3VwQ2FwcGVkQ29udGV4dEtleT8uc2V0KHNlc3Npb25zQ29udHJvbC5pc1dvcmtzcGFjZUdyb3VwQ2FwcGVkKCkpO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgc2Vzc2lvbiB0eXBlIGZpbHRlciBhY3Rpb25zIChyZS1yZWdpc3RlciB3aGVuIHNlc3Npb24gdHlwZXMgY2hhbmdlKVxuXHRcdHRoaXMucmVnaXN0ZXJTZXNzaW9uVHlwZUZpbHRlcnMoc2Vzc2lvbnNDb250cm9sKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9uVHlwZXMoKCkgPT4ge1xuXHRcdFx0dGhpcy5yZWdpc3RlclNlc3Npb25UeXBlRmlsdGVycyhzZXNzaW9uc0NvbnRyb2wpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFJlZ2lzdGVyIHN0YXR1cyBmaWx0ZXIgYWN0aW9ucyAoc3RhdGljIHNldCwgcmVnaXN0ZXJlZCBvbmNlKVxuXHRcdHRoaXMucmVnaXN0ZXJTdGF0dXNGaWx0ZXJzKHNlc3Npb25zQ29udHJvbCk7XG5cblx0XHQvLyBSZWZyZXNoIHNlc3Npb25zIHdoZW4gd2luZG93IGdldHMgZm9jdXMgdG8gY29tcGVuc2F0ZSBmb3IgbWlzc2luZyBldmVudHNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9jdXMoaGFzRm9jdXMgPT4ge1xuXHRcdFx0aWYgKGhhc0ZvY3VzKSB7XG5cdFx0XHRcdHNlc3Npb25zQ29udHJvbC5yZWZyZXNoKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTGlzdGVuIHRvIGxpc3QgdXBkYXRlcyBhbmQgcmVzdG9yZSBzZWxlY3Rpb24gaWYgbm90aGluZyBpcyBzZWxlY3RlZFxuXHRcdHRoaXMuX3JlZ2lzdGVyKHNlc3Npb25zQ29udHJvbC5vbkRpZFVwZGF0ZSgoKSA9PiB7XG5cdFx0XHRpZiAoIXNlc3Npb25zQ29udHJvbC5oYXNGb2N1c09yU2VsZWN0aW9uKCkpIHtcblx0XHRcdFx0dGhpcy5yZXN0b3JlTGFzdFNlbGVjdGVkU2Vzc2lvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIE1vYmlsZSBmaWx0ZXIgY2hpcHMgKHBob25lIGxheW91dCBvbmx5KSBcdTIwMTQgY3JlYXRlZCBhZnRlciBzZXNzaW9uc0NvbnRyb2xcblx0XHQvLyBzbyB3ZSBjYW4gd2lyZSBpdCBhcyB0aGUgZmlsdGVyIGhvc3QuXG5cdFx0aWYgKGZpbHRlckNoaXBzQ29udGFpbmVyKSB7XG5cdFx0XHRjb25zdCBjaGlwcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNb2JpbGVTZXNzaW9uRmlsdGVyQ2hpcHMoZmlsdGVyQ2hpcHNDb250YWluZXIsIHNlc3Npb25zQ29udHJvbCkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoY2hpcHMub25EaWRSZXF1ZXN0U29ydEdyb3VwKCgpID0+IHtcblx0XHRcdFx0dGhpcy5vcGVuU29ydEdyb3VwU2hlZXQoKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGNoaXBzLm9uRGlkUmVxdWVzdEZpbmQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLm9wZW5GaW5kKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gV2hlbiB0aGUgYWN0aXZlIHNlc3Npb24gY2hhbmdlcywgcmV2ZWFsIGl0IGluIHRoZSBzZXNzaW9ucyBsaXN0LlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLnNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChhY3RpdmVTZXNzaW9uKSB7XG5cdFx0XHRcdGlmICghc2Vzc2lvbnNDb250cm9sLnJldmVhbChhY3RpdmVTZXNzaW9uLnJlc291cmNlKSkge1xuXHRcdFx0XHRcdHNlc3Npb25zQ29udHJvbC5jbGVhckZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNlc3Npb25zQ29udHJvbC5jbGVhckZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbnNTZWN0aW9uID0gRE9NLmFwcGVuZCh0aGlzLnNpZGViYXJTcGxpdFZpZXdDb250YWluZXIsICQoJy5hZ2VudC1zZXNzaW9ucy1jdXN0b21pemF0aW9ucy1zZWN0aW9uJykpO1xuXHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zU2l6ZUNoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbnNXaWRnZXQgPSB0aGlzLl9jdXN0b21pemF0aW9uc1dpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQUlDdXN0b21pemF0aW9uU2hvcnRjdXRzV2lkZ2V0LCBjdXN0b21pemF0aW9uc1NlY3Rpb24sIHtcblx0XHRcdG9uRGlkQ2hhbmdlTGF5b3V0OiAoKSA9PiB7XG5cdFx0XHRcdGN1c3RvbWl6YXRpb25zU2l6ZUNoYW5nZS5maXJlKCk7XG5cdFx0XHRcdHRoaXMubGF5b3V0U2lkZWJhclNwbGl0VmlldygpO1xuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHR0aGlzLnNpZGViYXJTcGxpdFZpZXcgPSB0aGlzLl9yZWdpc3RlcihuZXcgU3BsaXRWaWV3KHRoaXMuc2lkZWJhclNwbGl0Vmlld0NvbnRhaW5lciwge1xuXHRcdFx0b3JpZW50YXRpb246IE9yaWVudGF0aW9uLlZFUlRJQ0FMLFxuXHRcdFx0cHJvcG9ydGlvbmFsTGF5b3V0OiBmYWxzZSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBzZXNzaW9uc1BhbmU6IElWaWV3ID0ge1xuXHRcdFx0ZWxlbWVudDogc2Vzc2lvbnNTZWN0aW9uLFxuXHRcdFx0bWluaW11bVNpemU6IFNFU1NJT05TX1NFQ1RJT05fTUlOX0hFSUdIVCxcblx0XHRcdG1heGltdW1TaXplOiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksXG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdGxheW91dDogaGVpZ2h0ID0+IHtcblx0XHRcdFx0c2Vzc2lvbnNTZWN0aW9uLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cdFx0XHRcdHRoaXMuc2Vzc2lvbnNDb250cm9sPy5sYXlvdXQodGhpcy5zZXNzaW9uc0NvbnRyb2xDb250YWluZXI/Lm9mZnNldEhlaWdodCA/PyAwLCB0aGlzLmN1cnJlbnRCb2R5V2lkdGgpO1xuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbnNQYW5lOiBJVmlldyA9IHtcblx0XHRcdGVsZW1lbnQ6IGN1c3RvbWl6YXRpb25zU2VjdGlvbixcblx0XHRcdGdldCBtaW5pbXVtU2l6ZSgpIHsgcmV0dXJuIGN1c3RvbWl6YXRpb25zV2lkZ2V0LmNvbGxhcHNlZCA/IGN1c3RvbWl6YXRpb25zV2lkZ2V0LmNvbGxhcHNlZEhlaWdodCA6IENVU1RPTUlaQVRJT05TX01JTl9IRUlHSFQ7IH0sXG5cdFx0XHRnZXQgbWF4aW11bVNpemUoKSB7IHJldHVybiBjdXN0b21pemF0aW9uc1dpZGdldC5jb2xsYXBzZWQgPyBjdXN0b21pemF0aW9uc1dpZGdldC5jb2xsYXBzZWRIZWlnaHQgOiBNYXRoLm1heChDVVNUT01JWkFUSU9OU19NSU5fSEVJR0hULCBjdXN0b21pemF0aW9uc1dpZGdldC5kZXNpcmVkSGVpZ2h0KTsgfSxcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5tYXAoRXZlbnQuYW55KGN1c3RvbWl6YXRpb25zV2lkZ2V0Lm9uRGlkQ2hhbmdlSGVpZ2h0LCBjdXN0b21pemF0aW9uc1NpemVDaGFuZ2UuZXZlbnQpLCAoKSA9PiB0aGlzLmdldEN1c3RvbWl6YXRpb25zUGFuZUhlaWdodCgpKSxcblx0XHRcdGxheW91dDogaGVpZ2h0ID0+IHtcblx0XHRcdFx0Y3VzdG9taXphdGlvbnNTZWN0aW9uLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cdFx0XHRcdHRoaXMuX2N1c3RvbWl6YXRpb25zV2lkZ2V0Py5sYXlvdXQoaGVpZ2h0LCB0aGlzLmN1cnJlbnRCb2R5V2lkdGgpO1xuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0dGhpcy5zaWRlYmFyU3BsaXRWaWV3LmFkZFZpZXcoc2Vzc2lvbnNQYW5lLCBTaXppbmcuRGlzdHJpYnV0ZSwgMCwgdHJ1ZSk7XG5cdFx0dGhpcy5zaWRlYmFyU3BsaXRWaWV3LmFkZFZpZXcoY3VzdG9taXphdGlvbnNQYW5lLCB0aGlzLmdldEN1c3RvbWl6YXRpb25zUGFuZUhlaWdodCgpLCAxLCB0cnVlKTtcblxuXHRcdGxldCBzYXZlZEN1c3RvbWl6YXRpb25zUGFuZUhlaWdodCA9IHRoaXMuZ2V0Q3VzdG9taXphdGlvbnNQYW5lSGVpZ2h0KCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY3VzdG9taXphdGlvbnNXaWRnZXQub25EaWRUb2dnbGVDb2xsYXBzZWQoY29sbGFwc2VkID0+IHtcblx0XHRcdGlmICghdGhpcy5zaWRlYmFyU3BsaXRWaWV3KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChjb2xsYXBzZWQpIHtcblx0XHRcdFx0Y29uc3QgY3VycmVudFNpemUgPSB0aGlzLnNpZGViYXJTcGxpdFZpZXcuZ2V0Vmlld1NpemUoMSk7XG5cdFx0XHRcdGlmIChjdXJyZW50U2l6ZSA+IGN1c3RvbWl6YXRpb25zV2lkZ2V0LmNvbGxhcHNlZEhlaWdodCkge1xuXHRcdFx0XHRcdHNhdmVkQ3VzdG9taXphdGlvbnNQYW5lSGVpZ2h0ID0gY3VycmVudFNpemU7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5zaWRlYmFyU3BsaXRWaWV3LnJlc2l6ZVZpZXcoMSwgY3VzdG9taXphdGlvbnNXaWRnZXQuY29sbGFwc2VkSGVpZ2h0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuc2lkZWJhclNwbGl0Vmlldy5yZXNpemVWaWV3KDEsIHNhdmVkQ3VzdG9taXphdGlvbnNQYW5lSGVpZ2h0KTtcblx0XHRcdH1cblx0XHRcdHRoaXMubGF5b3V0U2lkZWJhclNwbGl0VmlldygpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHVwZGF0ZVNwbGl0Vmlld1N0eWxlcyA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGJvcmRlckNvbG9yID0gdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLmdldENvbG9yKFBBTkVMX1NFQ1RJT05fQk9SREVSKTtcblx0XHRcdHRoaXMuc2lkZWJhclNwbGl0Vmlldz8uc3R5bGUoeyBzZXBhcmF0b3JCb3JkZXI6IGJvcmRlckNvbG9yID8/IENvbG9yLnRyYW5zcGFyZW50IH0pO1xuXHRcdH07XG5cdFx0dXBkYXRlU3BsaXRWaWV3U3R5bGVzKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKHVwZGF0ZVNwbGl0Vmlld1N0eWxlcykpO1xuXG5cdFx0Ly8gQWdlbnQgSG9zdCB0b29sYmFyIChib3R0b20sIGJlbG93IGN1c3RvbWl6YXRpb25zKS4gT25seSByZW5kZXJlZFxuXHRcdC8vIGluIHRoZSBzZXNzaW9ucyB3aW5kb3cgb24gd2ViIGRlc2t0b3AgbGF5b3V0czogZWxlY3Ryb24gaGFzIG5vXG5cdFx0Ly8gaG9zdCBwaWNrZXIgdG9kYXkgKGdhdGVkIG91dCBhdCB0aGUgbWVudSBsZXZlbCksIHBob25lIGxheW91dFxuXHRcdC8vIHVzZXMgdGhlIG1vYmlsZSB0aXRsZWJhciBwaWxsIGluc3RlYWQsIGFuZCBhdXhpbGlhcnkgd2luZG93cyBkb1xuXHRcdC8vIG5vdCBjb250cmlidXRlIGFueSBob3N0IGFjdGlvbnMgXHUyMDE0IHdpdGhvdXQgdGhpcyBnYXRlIHRoZXkgd291bGRcblx0XHQvLyBzaG93IGFuIGVtcHR5IHRvb2xiYXIgc2hlbGwuXG5cdFx0aWYgKGlzV2ViICYmIHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRJc1Nlc3Npb25zV2luZG93Q29udGV4dCxcblx0XHRcdElzQXV4aWxpYXJ5V2luZG93Q29udGV4dC50b05lZ2F0ZWQoKSxcblx0XHRcdElzUGhvbmVMYXlvdXRDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdCkpKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdFNob3J0Y3V0c1dpZGdldCwgc2Vzc2lvbnNDb250YWluZXIsIHtcblx0XHRcdFx0b25EaWRDaGFuZ2VMYXlvdXQ6ICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLmxheW91dFNpZGViYXJTcGxpdFZpZXcoKTtcblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RlcihET00uc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShET00uZ2V0V2luZG93KHBhcmVudCksICgpID0+IHRoaXMubGF5b3V0U2lkZWJhclNwbGl0VmlldygpKSk7XG5cdH1cblxuXHRmb2N1c0N1c3RvbWl6YXRpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuX2N1c3RvbWl6YXRpb25zV2lkZ2V0Py5mb2N1cygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZXN0b3JlTGFzdFNlbGVjdGVkU2Vzc2lvbigpOiB2b2lkIHtcblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoYWN0aXZlU2Vzc2lvbiAmJiB0aGlzLnNlc3Npb25zQ29udHJvbCkge1xuXHRcdFx0dGhpcy5zZXNzaW9uc0NvbnRyb2wucmV2ZWFsKGFjdGl2ZVNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgcmVnaXN0ZXJlZEZpbHRlclR5cGVJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGFyY2hpdmVkRmlsdGVyUmVnaXN0cmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRwcml2YXRlIHJlZ2lzdGVyU2Vzc2lvblR5cGVGaWx0ZXJzKHNlc3Npb25zQ29udHJvbDogU2Vzc2lvbnNMaXN0KTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGVzID0gdGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldEFsbFNlc3Npb25UeXBlcygpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgc2Vzc2lvblR5cGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCB0eXBlID0gc2Vzc2lvblR5cGVzW2ldO1xuXG5cdFx0XHQvLyBTa2lwIGlmIGFscmVhZHkgcmVnaXN0ZXJlZCAoYWN0aW9uIElEcyBhcmUgZ2xvYmFsIGFuZCBjYW4ndCBiZSByZS1yZWdpc3RlcmVkKVxuXHRcdFx0aWYgKHRoaXMucmVnaXN0ZXJlZEZpbHRlclR5cGVJZHMuaGFzKHR5cGUuaWQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5yZWdpc3RlcmVkRmlsdGVyVHlwZUlkcy5hZGQodHlwZS5pZCk7XG5cblx0XHRcdGNvbnN0IGNvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPihgc2Vzc2lvbnNWaWV3UGFuZS5maWx0ZXJUeXBlLiR7dHlwZS5pZH1gLCAhc2Vzc2lvbnNDb250cm9sLmlzU2Vzc2lvblR5cGVFeGNsdWRlZCh0eXBlLmlkKSk7XG5cdFx0XHRjb25zdCBjb250ZXh0S2V5SW5zdGFuY2UgPSBjb250ZXh0S2V5LmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdHRoaXMuZmlsdGVyQ29udGV4dEtleXMuc2V0KGNvbnRleHRLZXkua2V5LCB7IGtleTogY29udGV4dEtleUluc3RhbmNlLCBnZXREZWZhdWx0OiAoKSA9PiB0cnVlIH0pO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdFx0aWQ6IGBzZXNzaW9uc1ZpZXdQYW5lLmZpbHRlclR5cGUuJHt0eXBlLmlkfWAsXG5cdFx0XHRcdFx0XHR0aXRsZTogdHlwZS5sYWJlbCxcblx0XHRcdFx0XHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmVxdWFscyhjb250ZXh0S2V5LmtleSwgdHJ1ZSksXG5cdFx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0XHRpZDogU2Vzc2lvbnNWaWV3RmlsdGVyT3B0aW9uc1N1Yk1lbnUsXG5cdFx0XHRcdFx0XHRcdGdyb3VwOiAnMV90eXBlcycsXG5cdFx0XHRcdFx0XHRcdG9yZGVyOiBpLFxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvdmVycmlkZSBydW4oKSB7XG5cdFx0XHRcdFx0Y29uc3QgaXNFeGNsdWRlZCA9IHNlc3Npb25zQ29udHJvbC5pc1Nlc3Npb25UeXBlRXhjbHVkZWQodHlwZS5pZCk7XG5cdFx0XHRcdFx0c2Vzc2lvbnNDb250cm9sLnNldFNlc3Npb25UeXBlRXhjbHVkZWQodHlwZS5pZCwgIWlzRXhjbHVkZWQpO1xuXHRcdFx0XHRcdGNvbnRleHRLZXlJbnN0YW5jZS5zZXQoaXNFeGNsdWRlZCk7IC8vIHdhcyBleGNsdWRlZCwgbm93IGluY2x1ZGVkICh0b2dnbGUpXG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyU3RhdHVzRmlsdGVycyhzZXNzaW9uc0NvbnRyb2w6IFNlc3Npb25zTGlzdCk6IHZvaWQge1xuXHRcdGNvbnN0IHN0YXR1c0ZpbHRlcnM6IHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzOyBsYWJlbDogc3RyaW5nIH1bXSA9IFtcblx0XHRcdHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgbGFiZWw6IGxvY2FsaXplKCdzdGF0dXNDb21wbGV0ZWQnLCBcIkNvbXBsZXRlZFwiKSB9LFxuXHRcdFx0eyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcywgbGFiZWw6IGxvY2FsaXplKCdzdGF0dXNJblByb2dyZXNzJywgXCJJbiBQcm9ncmVzc1wiKSB9LFxuXHRcdFx0eyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCwgbGFiZWw6IGxvY2FsaXplKCdzdGF0dXNOZWVkc0lucHV0JywgXCJJbnB1dCBOZWVkZWRcIikgfSxcblx0XHRcdHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLkVycm9yLCBsYWJlbDogbG9jYWxpemUoJ3N0YXR1c0ZhaWxlZCcsIFwiRmFpbGVkXCIpIH0sXG5cdFx0XTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHN0YXR1c0ZpbHRlcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHsgc3RhdHVzLCBsYWJlbCB9ID0gc3RhdHVzRmlsdGVyc1tpXTtcblx0XHRcdGNvbnN0IGNvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPihgc2Vzc2lvbnNWaWV3UGFuZS5maWx0ZXJTdGF0dXMuJHtzdGF0dXN9YCwgIXNlc3Npb25zQ29udHJvbC5pc1N0YXR1c0V4Y2x1ZGVkKHN0YXR1cykpO1xuXHRcdFx0Y29uc3QgY29udGV4dEtleUluc3RhbmNlID0gY29udGV4dEtleS5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHR0aGlzLmZpbHRlckNvbnRleHRLZXlzLnNldChjb250ZXh0S2V5LmtleSwgeyBrZXk6IGNvbnRleHRLZXlJbnN0YW5jZSwgZ2V0RGVmYXVsdDogKCkgPT4gdHJ1ZSB9KTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRcdGlkOiBgc2Vzc2lvbnNWaWV3UGFuZS5maWx0ZXJTdGF0dXMuJHtzdGF0dXN9YCxcblx0XHRcdFx0XHRcdHRpdGxlOiBsYWJlbCxcblx0XHRcdFx0XHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmVxdWFscyhjb250ZXh0S2V5LmtleSwgdHJ1ZSksXG5cdFx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0XHRpZDogU2Vzc2lvbnNWaWV3RmlsdGVyT3B0aW9uc1N1Yk1lbnUsXG5cdFx0XHRcdFx0XHRcdGdyb3VwOiAnMl9zdGF0dXMnLFxuXHRcdFx0XHRcdFx0XHRvcmRlcjogaSxcblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0b3ZlcnJpZGUgcnVuKCkge1xuXHRcdFx0XHRcdGNvbnN0IGlzRXhjbHVkZWQgPSBzZXNzaW9uc0NvbnRyb2wuaXNTdGF0dXNFeGNsdWRlZChzdGF0dXMpO1xuXHRcdFx0XHRcdHNlc3Npb25zQ29udHJvbC5zZXRTdGF0dXNFeGNsdWRlZChzdGF0dXMsICFpc0V4Y2x1ZGVkKTtcblx0XHRcdFx0XHRjb250ZXh0S2V5SW5zdGFuY2Uuc2V0KGlzRXhjbHVkZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gQXJjaGl2ZWQgdG9nZ2xlXG5cdFx0Y29uc3QgYXJjaGl2ZWRDb250ZXh0S2V5ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3Nlc3Npb25zVmlld1BhbmUuZmlsdGVyLnNob3dBcmNoaXZlZCcsICFzZXNzaW9uc0NvbnRyb2wuaXNFeGNsdWRlQXJjaGl2ZWQoKSk7XG5cdFx0Y29uc3QgYXJjaGl2ZWRDb250ZXh0S2V5SW5zdGFuY2UgPSBhcmNoaXZlZENvbnRleHRLZXkuYmluZFRvKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuZmlsdGVyQ29udGV4dEtleXMuc2V0KGFyY2hpdmVkQ29udGV4dEtleS5rZXksIHsga2V5OiBhcmNoaXZlZENvbnRleHRLZXlJbnN0YW5jZSwgZ2V0RGVmYXVsdDogKCkgPT4gZmFsc2UgfSk7XG5cblx0XHQvLyBUaGUgYXJjaGl2ZWQgZmlsdGVyIGxhYmVsIGZvbGxvd3MgdGhlIGNvbmZpZ3VyZWQgYXJjaGl2ZSBhY3Rpb24gd29yZGluZyxcblx0XHQvLyBzbyB0aGUgYWN0aW9uIGlzIHJlLXJlZ2lzdGVyZWQgd2hlbmV2ZXIgdGhhdCBzZXR0aW5nIGNoYW5nZXMuXG5cdFx0Y29uc3QgcmVnaXN0ZXJBcmNoaXZlZEZpbHRlciA9ICgpID0+IHtcblx0XHRcdHRoaXMuYXJjaGl2ZWRGaWx0ZXJSZWdpc3RyYXRpb24uY2xlYXIoKTtcblx0XHRcdGNvbnN0IHRpdGxlID0gZ2V0Q2hhdFNlc3Npb25BcmNoaXZlZFNlY3Rpb25MYWJlbChnZXRDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0XHRcdHRoaXMuYXJjaGl2ZWRGaWx0ZXJSZWdpc3RyYXRpb24uYWRkKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0XHRpZDogJ3Nlc3Npb25zVmlld1BhbmUuZmlsdGVyQXJjaGl2ZWQnLFxuXHRcdFx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdFx0XHR0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoYXJjaGl2ZWRDb250ZXh0S2V5LmtleSwgdHJ1ZSksXG5cdFx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0XHRpZDogU2Vzc2lvbnNWaWV3RmlsdGVyT3B0aW9uc1N1Yk1lbnUsXG5cdFx0XHRcdFx0XHRcdGdyb3VwOiAnM19wcm9wcycsXG5cdFx0XHRcdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvdmVycmlkZSBydW4oKSB7XG5cdFx0XHRcdFx0Y29uc3QgZXhjbHVkaW5nID0gc2Vzc2lvbnNDb250cm9sLmlzRXhjbHVkZUFyY2hpdmVkKCk7XG5cdFx0XHRcdFx0c2Vzc2lvbnNDb250cm9sLnNldEV4Y2x1ZGVBcmNoaXZlZCghZXhjbHVkaW5nKTtcblx0XHRcdFx0XHRhcmNoaXZlZENvbnRleHRLZXlJbnN0YW5jZS5zZXQoZXhjbHVkaW5nKTsgLy8gd2FzIGV4Y2x1ZGluZyBcdTIxOTIgbm93IHNob3dpbmdcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH07XG5cdFx0cmVnaXN0ZXJBcmNoaXZlZEZpbHRlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZ1NldHRpbmdJZCkpIHtcblx0XHRcdFx0cmVnaXN0ZXJBcmNoaXZlZEZpbHRlcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlYWQgdG9nZ2xlXG5cdFx0Y29uc3QgcmVhZENvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc2Vzc2lvbnNWaWV3UGFuZS5maWx0ZXIuc2hvd1JlYWQnLCAhc2Vzc2lvbnNDb250cm9sLmlzRXhjbHVkZVJlYWQoKSk7XG5cdFx0Y29uc3QgcmVhZENvbnRleHRLZXlJbnN0YW5jZSA9IHJlYWRDb250ZXh0S2V5LmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmZpbHRlckNvbnRleHRLZXlzLnNldChyZWFkQ29udGV4dEtleS5rZXksIHsga2V5OiByZWFkQ29udGV4dEtleUluc3RhbmNlLCBnZXREZWZhdWx0OiAoKSA9PiB0cnVlIH0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnc2Vzc2lvbnNWaWV3UGFuZS5maWx0ZXJSZWFkJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2ZpbHRlclJlYWQnLCBcIlJlYWRcIiksXG5cdFx0XHRcdFx0dG9nZ2xlZDogQ29udGV4dEtleUV4cHIuZXF1YWxzKHJlYWRDb250ZXh0S2V5LmtleSwgdHJ1ZSksXG5cdFx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRcdGlkOiBTZXNzaW9uc1ZpZXdGaWx0ZXJPcHRpb25zU3ViTWVudSxcblx0XHRcdFx0XHRcdGdyb3VwOiAnM19wcm9wcycsXG5cdFx0XHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIHJ1bigpIHtcblx0XHRcdFx0Y29uc3QgZXhjbHVkaW5nID0gc2Vzc2lvbnNDb250cm9sLmlzRXhjbHVkZVJlYWQoKTtcblx0XHRcdFx0c2Vzc2lvbnNDb250cm9sLnNldEV4Y2x1ZGVSZWFkKCFleGNsdWRpbmcpO1xuXHRcdFx0XHRyZWFkQ29udGV4dEtleUluc3RhbmNlLnNldChleGNsdWRpbmcpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlc2V0IGZpbHRlciBhY3Rpb25cblx0XHRjb25zdCBmaWx0ZXJDb250ZXh0S2V5cyA9IHRoaXMuZmlsdGVyQ29udGV4dEtleXM7XG5cdFx0Y29uc3Qgd29ya3NwYWNlR3JvdXBDYXBwZWRDb250ZXh0S2V5ID0gdGhpcy53b3Jrc3BhY2VHcm91cENhcHBlZENvbnRleHRLZXk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnc2Vzc2lvbnNWaWV3UGFuZS5yZXNldEZpbHRlcnMnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgncmVzZXRGaWx0ZXJzJywgXCJSZXNldFwiKSxcblx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0aWQ6IFNlc3Npb25zVmlld0ZpbHRlck9wdGlvbnNTdWJNZW51LFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICc0X3Jlc2V0Jyxcblx0XHRcdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgcnVuKCkge1xuXHRcdFx0XHRzZXNzaW9uc0NvbnRyb2wucmVzZXRGaWx0ZXJzKCk7XG5cdFx0XHRcdGZvciAoY29uc3QgeyBrZXksIGdldERlZmF1bHQgfSBvZiBmaWx0ZXJDb250ZXh0S2V5cy52YWx1ZXMoKSkge1xuXHRcdFx0XHRcdGtleS5zZXQoZ2V0RGVmYXVsdCgpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR3b3Jrc3BhY2VHcm91cENhcHBlZENvbnRleHRLZXk/LnNldChzZXNzaW9uc0NvbnRyb2wuaXNXb3Jrc3BhY2VHcm91cENhcHBlZCgpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbGF5b3V0Qm9keShoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHN1cGVyLmxheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cblx0XHR0aGlzLmN1cnJlbnRCb2R5SGVpZ2h0ID0gaGVpZ2h0O1xuXHRcdHRoaXMuY3VycmVudEJvZHlXaWR0aCA9IHdpZHRoO1xuXHRcdHRoaXMudXBkYXRlSGVhZGVyTGF5b3V0KCk7XG5cdFx0dGhpcy5sYXlvdXRTaWRlYmFyU3BsaXRWaWV3KCk7XG5cblx0XHRpZiAodGhpcy5zaWRlYmFyU3BsaXRWaWV3IHx8ICF0aGlzLnNlc3Npb25zQ29udHJvbCB8fCAhdGhpcy5zZXNzaW9uc0NvbnRyb2xDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnNlc3Npb25zQ29udHJvbC5sYXlvdXQodGhpcy5zZXNzaW9uc0NvbnRyb2xDb250YWluZXIub2Zmc2V0SGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHRwcml2YXRlIGxheW91dFNpZGViYXJTcGxpdFZpZXcoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnNpZGViYXJTcGxpdFZpZXcgfHwgIXRoaXMuc2lkZWJhclNwbGl0Vmlld0NvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhlaWdodCA9IHRoaXMuc2lkZWJhclNwbGl0Vmlld0NvbnRhaW5lci5vZmZzZXRIZWlnaHQgfHwgdGhpcy5jdXJyZW50Qm9keUhlaWdodCB8fCB0aGlzLnZpZXdQYW5lQ29udGFpbmVyPy5vZmZzZXRIZWlnaHQgfHwgMDtcblx0XHRpZiAoaGVpZ2h0IDw9IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5zaWRlYmFyU3BsaXRWaWV3Q29udGFpbmVyLm9mZnNldEhlaWdodCA9PT0gMCkge1xuXHRcdFx0dGhpcy5zaWRlYmFyU3BsaXRWaWV3Q29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cdFx0fVxuXHRcdHRoaXMuc2lkZWJhclNwbGl0Vmlldy5sYXlvdXQoaGVpZ2h0KTtcblx0XHRpZiAoIXRoaXMuZGlkSW5pdGlhbGl6ZVBhbmVTaXplcykge1xuXHRcdFx0dGhpcy5kaWRJbml0aWFsaXplUGFuZVNpemVzID0gdHJ1ZTtcblx0XHRcdHRoaXMuc2lkZWJhclNwbGl0Vmlldy5yZXNpemVWaWV3KDEsIHRoaXMuZ2V0Q3VzdG9taXphdGlvbnNQYW5lSGVpZ2h0KCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0Q3VzdG9taXphdGlvbnNQYW5lSGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0aWYgKHRoaXMuX2N1c3RvbWl6YXRpb25zV2lkZ2V0Py5jb2xsYXBzZWQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jdXN0b21pemF0aW9uc1dpZGdldC5jb2xsYXBzZWRIZWlnaHQ7XG5cdFx0fVxuXHRcdGNvbnN0IGRlc2lyZWRIZWlnaHQgPSB0aGlzLl9jdXN0b21pemF0aW9uc1dpZGdldD8uZGVzaXJlZEhlaWdodCA/PyAwO1xuXHRcdHJldHVybiBNYXRoLm1heChDVVNUT01JWkFUSU9OU19NSU5fSEVJR0hULCBOdW1iZXIuaXNGaW5pdGUoZGVzaXJlZEhlaWdodCkgPyBkZXNpcmVkSGVpZ2h0IDogMCk7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHRzdXBlci5mb2N1cygpO1xuXG5cdFx0dGhpcy5zZXNzaW9uc0NvbnRyb2w/LmZvY3VzKCk7XG5cdH1cblxuXHRyZWZyZXNoKCk6IHZvaWQge1xuXHRcdHRoaXMuc2Vzc2lvbnNDb250cm9sPy5yZWZyZXNoKCk7XG5cdH1cblxuXHRvcGVuRmluZCgpOiB2b2lkIHtcblx0XHR0aGlzLmlzRmluZFdpZGdldE9wZW4gPSB0cnVlO1xuXHRcdGlmICh0aGlzLmZpbmRXaWRnZXRDb250YWluZXIpIHtcblx0XHRcdC8vIFNob3cgY29udGFpbmVyIGJlZm9yZSBvcGVuaW5nIGZpbmQgc28gdGhlIHdpZGdldCBjYW4gYmUgZm9jdXNlZFxuXHRcdFx0dGhpcy5maW5kV2lkZ2V0Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR9XG5cdFx0dGhpcy51cGRhdGVIZWFkZXJMYXlvdXQoKTtcblx0XHR0aGlzLnNlc3Npb25zQ29udHJvbD8ub3BlbkZpbmQoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlSGVhZGVyTGF5b3V0KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5oZWFkZXJSb3cgfHwgIXRoaXMuaGVhZGVyTGFiZWwgfHwgIXRoaXMuaGVhZGVyQWN0aW9ucykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE9uIHBob25lIHRoZSBkZXNrdG9wIGhlYWRlciBjb250ZW50IGlzIGhpZGRlbjsgdGhlIHJvdyBpcyBvbmx5XG5cdFx0Ly8gdmlzaWJsZSB3aGVuIHRoZSBmaW5kIHdpZGdldCBpcyBvcGVuIChzbyB0aGUgdXNlciBjYW4gc2VhcmNoKS5cblx0XHRpZiAoaXNQaG9uZUxheW91dCh0aGlzLmxheW91dFNlcnZpY2UpKSB7XG5cdFx0XHR0aGlzLmhlYWRlclJvdy5jbGFzc0xpc3QudG9nZ2xlKCdwaG9uZS1sYXlvdXQtZW1wdHknLCAhdGhpcy5pc0ZpbmRXaWRnZXRPcGVuKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pc0ZpbmRXaWRnZXRPcGVuKSB7XG5cdFx0XHR0aGlzLmhlYWRlckxhYmVsLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLmhlYWRlckFjdGlvbnMuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmhlYWRlckxhYmVsLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR0aGlzLmhlYWRlckFjdGlvbnMuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHR9XG5cblx0LyoqXG5cdCAqIFBob25lLW9ubHk6IHByZXNlbnQgYSBib3R0b20gc2hlZXQgd2l0aCB0aGUgZm91ciBzb3J0L2dyb3VwIHRvZ2dsZXMuXG5cdCAqIEZpbHRlcmluZyBvbiBwaG9uZSBpcyBwZXJmb3JtZWQgdmlhIHRoZSBzdGF0dXMgZmlsdGVyIGNoaXBzLCBzbyB0aGVcblx0ICogc2hlZXQgaW50ZW50aW9uYWxseSBvbWl0cyBcIkZpbHRlclwiLCBcIlNob3cgUmVjZW50L0FsbCBTZXNzaW9uc1wiLCBhbmRcblx0ICogXCJDb2xsYXBzZSBBbGwgR3JvdXBzXCIgYWN0aW9ucyBmb3VuZCBpbiB0aGUgZGVza3RvcCBzdWJtZW51LlxuXHQgKi9cblx0cHJpdmF0ZSBvcGVuU29ydEdyb3VwU2hlZXQoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc29ydFRpdGxlID0gbG9jYWxpemUoJ3NvcnRHcm91cFNoZWV0LnNvcnQnLCBcIlNvcnRcIik7XG5cdFx0Y29uc3QgZ3JvdXBUaXRsZSA9IGxvY2FsaXplKCdzb3J0R3JvdXBTaGVldC5ncm91cCcsIFwiR3JvdXBcIik7XG5cblx0XHRjb25zdCBpdGVtczogSU1vYmlsZVNvcnRHcm91cFNoZWV0SXRlbVtdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRpZDogU2Vzc2lvbnNTb3J0aW5nLkNyZWF0ZWQsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc29ydEJ5Q3JlYXRlZCcsIFwiU29ydCBieSBDcmVhdGVkXCIpLFxuXHRcdFx0XHRjaGVja2VkOiB0aGlzLmN1cnJlbnRTb3J0aW5nID09PSBTZXNzaW9uc1NvcnRpbmcuQ3JlYXRlZCxcblx0XHRcdFx0Z3JvdXA6ICdzb3J0Jyxcblx0XHRcdFx0Z3JvdXBUaXRsZTogc29ydFRpdGxlLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IFNlc3Npb25zU29ydGluZy5VcGRhdGVkLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3NvcnRCeVVwZGF0ZWQnLCBcIlNvcnQgYnkgVXBkYXRlZFwiKSxcblx0XHRcdFx0Y2hlY2tlZDogdGhpcy5jdXJyZW50U29ydGluZyA9PT0gU2Vzc2lvbnNTb3J0aW5nLlVwZGF0ZWQsXG5cdFx0XHRcdGdyb3VwOiAnc29ydCcsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogU2Vzc2lvbnNHcm91cGluZy5Xb3Jrc3BhY2UsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZ3JvdXBCeVdvcmtzcGFjZScsIFwiR3JvdXAgYnkgV29ya3NwYWNlXCIpLFxuXHRcdFx0XHRjaGVja2VkOiB0aGlzLmN1cnJlbnRHcm91cGluZyA9PT0gU2Vzc2lvbnNHcm91cGluZy5Xb3Jrc3BhY2UsXG5cdFx0XHRcdGdyb3VwOiAnZ3JvdXAnLFxuXHRcdFx0XHRncm91cFRpdGxlOiBncm91cFRpdGxlLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IFNlc3Npb25zR3JvdXBpbmcuRGF0ZSxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdncm91cEJ5VGltZScsIFwiR3JvdXAgYnkgVGltZVwiKSxcblx0XHRcdFx0Y2hlY2tlZDogdGhpcy5jdXJyZW50R3JvdXBpbmcgPT09IFNlc3Npb25zR3JvdXBpbmcuRGF0ZSxcblx0XHRcdFx0Z3JvdXA6ICdncm91cCcsXG5cdFx0XHR9LFxuXHRcdF07XG5cblx0XHRzaG93TW9iaWxlU29ydEdyb3VwU2hlZXQodGhpcy5sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXIsIGxvY2FsaXplKCdzb3J0R3JvdXBTaGVldC50aXRsZScsIFwiU29ydFwiKSwgaXRlbXMpLnRoZW4oc2VsZWN0ZWRJZCA9PiB7XG5cdFx0XHRpZiAoIXNlbGVjdGVkSWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNlbGVjdGVkSWQgPT09IFNlc3Npb25zU29ydGluZy5DcmVhdGVkIHx8IHNlbGVjdGVkSWQgPT09IFNlc3Npb25zU29ydGluZy5VcGRhdGVkKSB7XG5cdFx0XHRcdHRoaXMuc2V0U29ydGluZyhzZWxlY3RlZElkKTtcblx0XHRcdH0gZWxzZSBpZiAoc2VsZWN0ZWRJZCA9PT0gU2Vzc2lvbnNHcm91cGluZy5Xb3Jrc3BhY2UgfHwgc2VsZWN0ZWRJZCA9PT0gU2Vzc2lvbnNHcm91cGluZy5EYXRlKSB7XG5cdFx0XHRcdHRoaXMuc2V0R3JvdXBpbmcoc2VsZWN0ZWRJZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRzZXRHcm91cGluZyhncm91cGluZzogU2Vzc2lvbnNHcm91cGluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmN1cnJlbnRHcm91cGluZyA9PT0gZ3JvdXBpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmN1cnJlbnRHcm91cGluZyA9IGdyb3VwaW5nO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoR1JPVVBJTkdfU1RPUkFHRV9LRVksIHRoaXMuY3VycmVudEdyb3VwaW5nLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR0aGlzLmdyb3VwaW5nQ29udGV4dEtleT8uc2V0KHRoaXMuY3VycmVudEdyb3VwaW5nKTtcblx0XHR0aGlzLnNlc3Npb25zQ29udHJvbD8ucmVzZXRTZWN0aW9uQ29sbGFwc2VTdGF0ZSgpO1xuXHRcdHRoaXMuc2Vzc2lvbnNDb250cm9sPy51cGRhdGUodHJ1ZSk7XG5cdH1cblxuXHRzZXRTb3J0aW5nKHNvcnRpbmc6IFNlc3Npb25zU29ydGluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmN1cnJlbnRTb3J0aW5nID09PSBzb3J0aW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5jdXJyZW50U29ydGluZyA9IHNvcnRpbmc7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShTT1JUSU5HX1NUT1JBR0VfS0VZLCB0aGlzLmN1cnJlbnRTb3J0aW5nLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR0aGlzLnNvcnRpbmdDb250ZXh0S2V5Py5zZXQodGhpcy5jdXJyZW50U29ydGluZyk7XG5cdFx0dGhpcy5zZXNz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
