import { Disposable, DisposableMap, DisposableStore, toDisposable } from "../../base/common/lifecycle.js";
import { Event, Emitter } from "../../base/common/event.js";
import { alert } from "../../base/browser/ui/aria/aria.js";
import { EventType, addDisposableListener, getClientArea, size, isAncestorUsingFlowTo, computeScreenAwareSize, getActiveDocument, getWindows, getActiveWindow, isActiveDocument, getWindow, getWindowId, getActiveElement, Dimension } from "../../base/browser/dom.js";
import { onDidChangeFullscreen, isFullscreen, isWCOEnabled } from "../../base/browser/browser.js";
import { isWindows, isLinux, isMacintosh, isWeb, isIOS } from "../../base/common/platform.js";
import { EditorInputCapabilities, isResourceEditorInput, pathsToEditors } from "../common/editor.js";
import { SidebarPart } from "./parts/sidebar/sidebarPart.js";
import { PanelPart } from "./parts/panel/panelPart.js";
import { Position, Parts, PartOpensMaximizedOptions, positionFromString, positionToString, partOpensMaximizedFromString, ActivityBarPosition, LayoutSettings, ZenModeSettings, EditorActionsLocation, shouldShowCustomTitleBar, isHorizontal, isMultiWindowPart, isFloatingTopEdgeExposed } from "../services/layout/browser/layoutService.js";
import { isTemporaryWorkspace, IWorkspaceContextService, WorkbenchState } from "../../platform/workspace/common/workspace.js";
import { IStorageService, StorageScope, StorageTarget } from "../../platform/storage/common/storage.js";
import { IConfigurationService, isConfigured } from "../../platform/configuration/common/configuration.js";
import { ChatAIDisabledSettingId } from "../../platform/chat/common/chatSettings.js";
import { ITitleService } from "../services/title/browser/titleService.js";
import { StartupKind, ILifecycleService } from "../services/lifecycle/common/lifecycle.js";
import { getMenuBarVisibility, hasNativeTitlebar, hasCustomTitlebar, TitleBarSetting, CustomTitleBarVisibility, useWindowControlsOverlay, DEFAULT_EMPTY_WINDOW_SIZE, DEFAULT_WORKSPACE_WINDOW_SIZE, hasNativeMenu, MenuSettings } from "../../platform/window/common/window.js";
import { IHostService } from "../services/host/browser/host.js";
import { IBrowserWorkbenchEnvironmentService } from "../services/environment/browser/environmentService.js";
import { IEditorService } from "../services/editor/common/editorService.js";
import { GroupActivationReason, GroupOrientation, GroupsOrder, IEditorGroupsService } from "../services/editor/common/editorGroupsService.js";
import { SerializableGrid, Orientation, Direction, Sizing } from "../../base/browser/ui/grid/grid.js";
import { Part } from "./part.js";
import { IStatusbarService } from "../services/statusbar/browser/statusbar.js";
import { IFileService } from "../../platform/files/common/files.js";
import { isCodeEditor } from "../../editor/browser/editorBrowser.js";
import { coalesce } from "../../base/common/arrays.js";
import { assertReturnsDefined } from "../../base/common/types.js";
import { INotificationService, NotificationsFilter } from "../../platform/notification/common/notification.js";
import { IThemeService } from "../../platform/theme/common/themeService.js";
import { isHighContrast } from "../../platform/theme/common/theme.js";
import { WINDOW_ACTIVE_BORDER, WINDOW_INACTIVE_BORDER } from "../common/theme.js";
import { URI } from "../../base/common/uri.js";
import { IViewDescriptorService, ViewContainerLocation } from "../common/views.js";
import { DiffEditorInput } from "../common/editor/diffEditorInput.js";
import { mark } from "../../base/common/performance.js";
import { IExtensionService } from "../services/extensions/common/extensions.js";
import { ILogService } from "../../platform/log/common/log.js";
import { DeferredPromise, Promises } from "../../base/common/async.js";
import { IBannerService } from "../services/banner/browser/bannerService.js";
import { IPaneCompositePartService } from "../services/panecomposite/browser/panecomposite.js";
import { AuxiliaryBarPart } from "./parts/auxiliarybar/auxiliaryBarPart.js";
import { ITelemetryService } from "../../platform/telemetry/common/telemetry.js";
import { IAuxiliaryWindowService } from "../services/auxiliaryWindow/browser/auxiliaryWindowService.js";
import { mainWindow } from "../../base/browser/window.js";
import { localize } from "../../nls.js";
var LayoutClasses = /* @__PURE__ */ ((LayoutClasses2) => {
  LayoutClasses2["SIDEBAR_HIDDEN"] = "nosidebar";
  LayoutClasses2["MAIN_EDITOR_AREA_HIDDEN"] = "nomaineditorarea";
  LayoutClasses2["PANEL_HIDDEN"] = "nopanel";
  LayoutClasses2["AUXILIARYBAR_HIDDEN"] = "noauxiliarybar";
  LayoutClasses2["ACTIVITYBAR_HIDDEN"] = "noactivitybar";
  LayoutClasses2["STATUSBAR_HIDDEN"] = "nostatusbar";
  LayoutClasses2["TOP_WINDOW_EDGE"] = "top-window-edge";
  LayoutClasses2["FULLSCREEN"] = "fullscreen";
  LayoutClasses2["MAXIMIZED"] = "maximized";
  LayoutClasses2["WINDOW_BORDER"] = "border";
  LayoutClasses2["NO_SHADOWS"] = "no-shadows";
  LayoutClasses2["FLOATING_PANELS"] = "floating-panels";
  LayoutClasses2["STYLE_OVERRIDE"] = "style-override";
  LayoutClasses2["MODERN_UI_TABS"] = "modern-ui-tabs";
  return LayoutClasses2;
})(LayoutClasses || {});
const COMMAND_CENTER_SETTINGS = [
  "chat.agentsControl.enabled",
  "chat.unifiedAgentsBar.enabled",
  "workbench.navigationControl.enabled",
  "workbench.experimental.share.enabled"
];
const TITLE_BAR_SETTINGS = [
  LayoutSettings.ACTIVITY_BAR_LOCATION,
  LayoutSettings.COMMAND_CENTER,
  ...COMMAND_CENTER_SETTINGS,
  LayoutSettings.EDITOR_ACTIONS_LOCATION,
  LayoutSettings.LAYOUT_ACTIONS,
  MenuSettings.MenuBarVisibility,
  TitleBarSetting.TITLE_BAR_STYLE,
  TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY
];
const DEFAULT_EMPTY_WINDOW_DIMENSIONS = new Dimension(DEFAULT_EMPTY_WINDOW_SIZE.width, DEFAULT_EMPTY_WINDOW_SIZE.height);
const DEFAULT_WORKSPACE_WINDOW_DIMENSIONS = new Dimension(DEFAULT_WORKSPACE_WINDOW_SIZE.width, DEFAULT_WORKSPACE_WINDOW_SIZE.height);
class Layout extends Disposable {
  constructor(parent, layoutOptions) {
    super();
    this.parent = parent;
    this.layoutOptions = layoutOptions;
    //#region Events
    this._onDidChangeZenMode = this._register(new Emitter());
    this.onDidChangeZenMode = this._onDidChangeZenMode.event;
    this._onDidChangeMainEditorCenteredLayout = this._register(new Emitter());
    this.onDidChangeMainEditorCenteredLayout = this._onDidChangeMainEditorCenteredLayout.event;
    this._onDidChangePanelAlignment = this._register(new Emitter());
    this.onDidChangePanelAlignment = this._onDidChangePanelAlignment.event;
    this._onDidChangeWindowMaximized = this._register(new Emitter());
    this.onDidChangeWindowMaximized = this._onDidChangeWindowMaximized.event;
    this._onDidChangePanelPosition = this._register(new Emitter());
    this.onDidChangePanelPosition = this._onDidChangePanelPosition.event;
    this._onDidChangePartVisibility = this._register(new Emitter());
    this.onDidChangePartVisibility = this._onDidChangePartVisibility.event;
    this._onDidChangeNotificationsVisibility = this._register(new Emitter());
    this.onDidChangeNotificationsVisibility = this._onDidChangeNotificationsVisibility.event;
    this._onDidChangeAuxiliaryBarMaximized = this._register(new Emitter());
    this.onDidChangeAuxiliaryBarMaximized = this._onDidChangeAuxiliaryBarMaximized.event;
    this._onDidLayoutMainContainer = this._register(new Emitter());
    this.onDidLayoutMainContainer = this._onDidLayoutMainContainer.event;
    this._onDidLayoutActiveContainer = this._register(new Emitter());
    this.onDidLayoutActiveContainer = this._onDidLayoutActiveContainer.event;
    this._onDidLayoutContainer = this._register(new Emitter());
    this.onDidLayoutContainer = this._onDidLayoutContainer.event;
    this._onDidAddContainer = this._register(new Emitter());
    this.onDidAddContainer = this._onDidAddContainer.event;
    this._onDidChangeActiveContainer = this._register(new Emitter());
    this.onDidChangeActiveContainer = this._onDidChangeActiveContainer.event;
    //#endregion
    //#region Properties
    this.mainContainer = document.createElement("div");
    this.containerStylesLoaded = /* @__PURE__ */ new Map();
    //#endregion
    this.parts = /* @__PURE__ */ new Map();
    this.initialized = false;
    this.disposed = false;
    this._openedDefaultEditors = false;
    this.whenReadyPromise = new DeferredPromise();
    this.whenReady = this.whenReadyPromise.p;
    this.whenRestoredPromise = new DeferredPromise();
    this.whenRestored = this.whenRestoredPromise.p;
    this.restored = false;
    this.inMaximizedAuxiliaryBarTransition = false;
  }
  get activeContainer() {
    return this.getContainerFromDocument(getActiveDocument());
  }
  get containers() {
    const containers = [];
    for (const { window } of getWindows()) {
      containers.push(this.getContainerFromDocument(window.document));
    }
    return containers;
  }
  getContainerFromDocument(targetDocument) {
    if (targetDocument === this.mainContainer.ownerDocument) {
      return this.mainContainer;
    } else {
      return targetDocument.body.getElementsByClassName("monaco-workbench")[0];
    }
  }
  whenContainerStylesLoaded(window) {
    return this.containerStylesLoaded.get(window.vscodeWindowId);
  }
  get mainContainerDimension() {
    return this._mainContainerDimension;
  }
  get activeContainerDimension() {
    return this.getContainerDimension(this.activeContainer);
  }
  getContainerDimension(container) {
    if (container === this.mainContainer) {
      return this.mainContainerDimension;
    } else {
      return getClientArea(container);
    }
  }
  get mainContainerOffset() {
    return this.computeContainerOffset(mainWindow);
  }
  get activeContainerOffset() {
    return this.computeContainerOffset(getWindow(this.activeContainer));
  }
  computeContainerOffset(targetWindow) {
    let top = 0;
    let quickPickTop = 0;
    if (this.isVisible(Parts.BANNER_PART)) {
      top = this.getPart(Parts.BANNER_PART).maximumHeight;
      quickPickTop = top;
    }
    const titlebarVisible = this.isVisible(Parts.TITLEBAR_PART, targetWindow);
    if (titlebarVisible) {
      top += this.getPart(Parts.TITLEBAR_PART).maximumHeight;
      quickPickTop = top;
    }
    const isCommandCenterVisible = titlebarVisible && this.configurationService.getValue(LayoutSettings.COMMAND_CENTER) !== false;
    if (isCommandCenterVisible) {
      quickPickTop = 6;
    }
    return { top, quickPickTop };
  }
  initLayout(accessor) {
    this.environmentService = accessor.get(IBrowserWorkbenchEnvironmentService);
    this.configurationService = accessor.get(IConfigurationService);
    this.hostService = accessor.get(IHostService);
    this.contextService = accessor.get(IWorkspaceContextService);
    this.storageService = accessor.get(IStorageService);
    this.themeService = accessor.get(IThemeService);
    this.extensionService = accessor.get(IExtensionService);
    this.logService = accessor.get(ILogService);
    this.telemetryService = accessor.get(ITelemetryService);
    this.auxiliaryWindowService = accessor.get(IAuxiliaryWindowService);
    this.editorService = accessor.get(IEditorService);
    this.editorGroupService = accessor.get(IEditorGroupsService);
    this.mainPartEditorService = this.editorService.createScoped(this.editorGroupService.mainPart, this._store);
    this.paneCompositeService = accessor.get(IPaneCompositePartService);
    this.viewDescriptorService = accessor.get(IViewDescriptorService);
    this.titleService = accessor.get(ITitleService);
    this.notificationService = accessor.get(INotificationService);
    this.statusBarService = accessor.get(IStatusbarService);
    accessor.get(IBannerService);
    this.registerLayoutListeners();
    this.initLayoutState(accessor.get(ILifecycleService), accessor.get(IFileService));
  }
  registerLayoutListeners() {
    const showEditorIfHidden = (explicitUserAction) => {
      if (this.isVisible(Parts.EDITOR_PART, mainWindow) || // already visible
      this.mainPartEditorService.visibleEditors.length === 0) {
        return;
      }
      if (this.isAuxiliaryBarMaximized()) {
        if (explicitUserAction !== false) {
          this.toggleMaximizedAuxiliaryBar();
        }
      } else {
        this.toggleMaximizedPanel();
      }
    };
    const maybeMaximizeAuxiliaryBar = () => {
      if (this.mainPartEditorService.visibleEditors.length === 0 && this.configurationService.getValue("workbench.secondarySideBar.forceMaximized" /* AUXILIARYBAR_FORCE_MAXIMIZED */) === true) {
        this.setAuxiliaryBarMaximized(true);
        return true;
      }
      return false;
    };
    this.editorGroupService.whenRestored.then(() => {
      this._register(this.mainPartEditorService.onDidVisibleEditorsChange((e) => {
        const handled = maybeMaximizeAuxiliaryBar();
        if (!handled) {
          showEditorIfHidden(e.isExplicit);
        }
      }));
      this._register(this.editorGroupService.mainPart.onDidActivateGroup((e) => {
        if (e.reason !== GroupActivationReason.PART_CLOSE) {
          showEditorIfHidden();
        }
      }));
      this._register(this.mainPartEditorService.onDidActiveEditorChange(() => this.centerMainEditorLayout(this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED))));
    });
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if ([
        ...TITLE_BAR_SETTINGS,
        "workbench.sideBar.location" /* SIDEBAR_POSITION */,
        "workbench.statusBar.visible" /* STATUSBAR_VISIBLE */
      ].some((setting) => e.affectsConfiguration(setting))) {
        const enabledCommandCenterAction = COMMAND_CENTER_SETTINGS.some((setting) => e.affectsConfiguration(setting) && this.configurationService.getValue(setting) === true);
        if (enabledCommandCenterAction) {
          if (this.configurationService.getValue(LayoutSettings.COMMAND_CENTER) === false) {
            this.configurationService.updateValue(LayoutSettings.COMMAND_CENTER, true);
            return;
          }
        }
        const editorActionsMovedToTitlebar = e.affectsConfiguration(LayoutSettings.EDITOR_ACTIONS_LOCATION) && this.configurationService.getValue(LayoutSettings.EDITOR_ACTIONS_LOCATION) === EditorActionsLocation.TITLEBAR;
        const commandCenterEnabled = e.affectsConfiguration(LayoutSettings.COMMAND_CENTER) && this.configurationService.getValue(LayoutSettings.COMMAND_CENTER);
        const layoutControlsEnabled = e.affectsConfiguration(LayoutSettings.LAYOUT_ACTIONS) && this.configurationService.getValue(LayoutSettings.LAYOUT_ACTIONS);
        const activityBarMovedToTopOrBottom = e.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION) && [ActivityBarPosition.TOP, ActivityBarPosition.BOTTOM].includes(this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION));
        if (activityBarMovedToTopOrBottom || editorActionsMovedToTitlebar || commandCenterEnabled || layoutControlsEnabled) {
          if (this.configurationService.getValue(TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY) === CustomTitleBarVisibility.NEVER) {
            this.configurationService.updateValue(TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY, CustomTitleBarVisibility.AUTO);
            return;
          }
        }
        this.doUpdateLayoutConfiguration();
      }
      if (e.affectsConfiguration(LayoutSettings.SHADOWS)) {
        this.updateShadows();
      }
      if (e.affectsConfiguration(LayoutSettings.MODERN_UI)) {
        this.updateFloatingPanels();
      }
      if (e.affectsConfiguration("workbench.secondarySideBar.forceMaximized" /* AUXILIARYBAR_FORCE_MAXIMIZED */)) {
        const forceMaximized = this.configurationService.getValue("workbench.secondarySideBar.forceMaximized" /* AUXILIARYBAR_FORCE_MAXIMIZED */);
        if (forceMaximized === true && this.mainPartEditorService.visibleEditors.length === 0) {
          this.setAuxiliaryBarMaximized(true);
        } else if (forceMaximized === false && this.isAuxiliaryBarMaximized()) {
          this.setAuxiliaryBarMaximized(false);
        }
      }
    }));
    this._register(onDidChangeFullscreen((windowId) => this.onFullscreenChanged(windowId)));
    this._register(this.editorGroupService.mainPart.onDidAddGroup(() => this.centerMainEditorLayout(this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED))));
    this._register(this.editorGroupService.mainPart.onDidRemoveGroup(() => this.centerMainEditorLayout(this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED))));
    this._register(this.editorGroupService.mainPart.onDidChangeGroupMaximized(() => this.centerMainEditorLayout(this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED))));
    this._register(addDisposableListener(this.mainContainer, EventType.SCROLL, () => this.mainContainer.scrollTop = 0));
    const showingCustomMenu = (isWindows || isLinux || isWeb) && !hasNativeTitlebar(this.configurationService);
    if (showingCustomMenu) {
      this._register(this.titleService.onMenubarVisibilityChange((visible) => this.onMenubarToggled(visible)));
    }
    this._register(this.themeService.onDidColorThemeChange(() => this.updateWindowBorder()));
    this._register(this.hostService.onDidChangeFocus((focused) => this.onWindowFocusChanged(focused)));
    this._register(this.hostService.onDidChangeActiveWindow(() => this.onActiveWindowChanged()));
    if (isWeb && typeof navigator.windowControlsOverlay === "object") {
      this._register(addDisposableListener(navigator.windowControlsOverlay, "geometrychange", () => this.onDidChangeWCO()));
    }
    this._register(this.auxiliaryWindowService.onDidOpenAuxiliaryWindow(({ window, disposables }) => {
      const windowId = window.window.vscodeWindowId;
      this.containerStylesLoaded.set(windowId, window.whenStylesHaveLoaded);
      window.whenStylesHaveLoaded.then(() => this.containerStylesLoaded.delete(windowId));
      disposables.add(toDisposable(() => this.containerStylesLoaded.delete(windowId)));
      const eventDisposables = disposables.add(new DisposableStore());
      this._onDidAddContainer.fire({ container: window.container, disposables: eventDisposables });
      disposables.add(window.onDidLayout((dimension) => this.handleContainerDidLayout(window.container, dimension)));
    }));
  }
  onMenubarToggled(visible) {
    if (visible !== this.state.runtime.menuBar.toggled) {
      this.state.runtime.menuBar.toggled = visible;
      const menuBarVisibility = getMenuBarVisibility(this.configurationService);
      if (isWeb && menuBarVisibility === "toggle") {
        this.workbenchGrid.setViewVisible(this.titleBarPartView, shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled));
      } else if (this.state.runtime.mainWindowFullscreen && (menuBarVisibility === "toggle" || menuBarVisibility === "classic")) {
        this.workbenchGrid.setViewVisible(this.titleBarPartView, shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled));
      }
      this.handleContainerDidLayout(this.mainContainer, this._mainContainerDimension);
    }
  }
  handleContainerDidLayout(container, dimension) {
    if (container === this.mainContainer) {
      this._onDidLayoutMainContainer.fire(dimension);
    }
    if (isActiveDocument(container)) {
      this._onDidLayoutActiveContainer.fire(dimension);
    }
    this._onDidLayoutContainer.fire({ container, dimension });
  }
  onFullscreenChanged(windowId) {
    if (windowId !== mainWindow.vscodeWindowId) {
      return;
    }
    this.state.runtime.mainWindowFullscreen = isFullscreen(mainWindow);
    if (this.state.runtime.mainWindowFullscreen) {
      this.mainContainer.classList.add("fullscreen" /* FULLSCREEN */);
    } else {
      this.mainContainer.classList.remove("fullscreen" /* FULLSCREEN */);
      const zenModeExitInfo = this.stateModel.getRuntimeValue(LayoutStateKeys.ZEN_MODE_EXIT_INFO);
      if (zenModeExitInfo.transitionedToFullScreen && this.isZenModeActive()) {
        this.toggleZenMode();
      }
    }
    this.workbenchGrid.edgeSnapping = this.state.runtime.mainWindowFullscreen;
    if (hasCustomTitlebar(this.configurationService)) {
      this.workbenchGrid.setViewVisible(this.titleBarPartView, shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled));
      this.updateWindowBorder(true);
    }
  }
  onActiveWindowChanged() {
    const activeContainerId = this.getActiveContainerId();
    if (this.state.runtime.activeContainerId !== activeContainerId) {
      this.state.runtime.activeContainerId = activeContainerId;
      this.updateWindowBorder();
      this._onDidChangeActiveContainer.fire();
    }
  }
  onWindowFocusChanged(hasFocus) {
    if (this.state.runtime.hasFocus !== hasFocus) {
      this.state.runtime.hasFocus = hasFocus;
      this.updateWindowBorder();
    }
  }
  getActiveContainerId() {
    const activeContainer = this.activeContainer;
    return getWindow(activeContainer).vscodeWindowId;
  }
  doUpdateLayoutConfiguration(skipLayout) {
    this.updateCustomTitleBarVisibility();
    this.updateMenubarVisibility(!!skipLayout);
    this.editorGroupService.whenRestored.then(() => this.centerMainEditorLayout(this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED), skipLayout));
  }
  isShadowsDisabled() {
    return this.configurationService.getValue(LayoutSettings.SHADOWS) === false;
  }
  updateShadows() {
    const noShadows = this.isShadowsDisabled();
    for (const container of Array.from(this.containers)) {
      container.classList.toggle("no-shadows" /* NO_SHADOWS */, noShadows);
    }
  }
  isFloatingPanelsEnabled() {
    return this.configurationService.getValue(LayoutSettings.MODERN_UI) === true;
  }
  updateFloatingPanels() {
    this.mainContainer.classList.toggle("floating-panels" /* FLOATING_PANELS */, this.isFloatingPanelsEnabled());
    this.updateWindowBorder();
  }
  setSideBarPosition(position) {
    const activityBar = this.getPart(Parts.ACTIVITYBAR_PART);
    const sideBar = this.getPart(Parts.SIDEBAR_PART);
    const auxiliaryBar = this.getPart(Parts.AUXILIARYBAR_PART);
    const newPositionValue = position === Position.LEFT ? "left" : "right";
    const oldPositionValue = position === Position.RIGHT ? "left" : "right";
    const panelAlignment = this.getPanelAlignment();
    const panelPosition = this.getPanelPosition();
    this.stateModel.setRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON, position);
    const activityBarContainer = assertReturnsDefined(activityBar.getContainer());
    const sideBarContainer = assertReturnsDefined(sideBar.getContainer());
    const auxiliaryBarContainer = assertReturnsDefined(auxiliaryBar.getContainer());
    activityBarContainer.classList.remove(oldPositionValue);
    sideBarContainer.classList.remove(oldPositionValue);
    activityBarContainer.classList.add(newPositionValue);
    sideBarContainer.classList.add(newPositionValue);
    auxiliaryBarContainer.classList.remove(newPositionValue);
    auxiliaryBarContainer.classList.add(oldPositionValue);
    activityBar.updateStyles();
    sideBar.updateStyles();
    auxiliaryBar.updateStyles();
    this.adjustPartPositions(position, panelAlignment, panelPosition);
  }
  updateWindowBorder(skipLayout = false) {
    const theme = this.themeService.getColorTheme();
    const didHaveMainWindowBorder = this.hasMainWindowBorder();
    const suppressMainWindowBorder = this.isFloatingPanelsEnabled() && !isHighContrast(theme.type);
    if (isWeb || isWindows || // not working well with zooming (border often not visible)
    (isWindows || isLinux) && useWindowControlsOverlay(this.configurationService) || hasNativeTitlebar(this.configurationService)) {
      return;
    }
    const activeBorder = theme.getColor(WINDOW_ACTIVE_BORDER);
    const inactiveBorder = theme.getColor(WINDOW_INACTIVE_BORDER);
    for (const container of this.containers) {
      const isMainContainer = container === this.mainContainer;
      const isActiveContainer = this.activeContainer === container;
      let windowBorder = false;
      if (!(isMainContainer && suppressMainWindowBorder) && !this.state.runtime.mainWindowFullscreen && (activeBorder || inactiveBorder)) {
        windowBorder = true;
        const borderColor = isActiveContainer && this.state.runtime.hasFocus ? activeBorder : inactiveBorder ?? activeBorder;
        container.style.setProperty("--window-border-color", borderColor?.toString() ?? "transparent");
      } else {
        container.style.removeProperty("--window-border-color");
      }
      if (isMainContainer) {
        this.state.runtime.mainWindowBorder = windowBorder;
      }
      container.classList.toggle("border" /* WINDOW_BORDER */, windowBorder);
    }
    if (!skipLayout && didHaveMainWindowBorder !== this.hasMainWindowBorder()) {
      this.layout();
    }
  }
  initLayoutState(lifecycleService, fileService) {
    this._mainContainerDimension = getClientArea(this.parent, this.contextService.getWorkbenchState() === WorkbenchState.EMPTY ? DEFAULT_EMPTY_WINDOW_DIMENSIONS : DEFAULT_WORKSPACE_WINDOW_DIMENSIONS);
    this.stateModel = new LayoutStateModel(this.storageService, this.configurationService, this.contextService, this.environmentService);
    this.stateModel.load({
      mainContainerDimension: this._mainContainerDimension,
      resetLayout: Boolean(this.layoutOptions?.resetLayout)
    });
    this._register(this.stateModel.onDidChangeState((change) => {
      if (change.key === LayoutStateKeys.ACTIVITYBAR_HIDDEN) {
        this.setActivityBarHidden(change.value);
      }
      if (change.key === LayoutStateKeys.STATUSBAR_HIDDEN) {
        this.setStatusBarHidden(change.value);
      }
      if (change.key === LayoutStateKeys.SIDEBAR_POSITON) {
        this.setSideBarPosition(change.value);
      }
      if (change.key === LayoutStateKeys.PANEL_POSITION) {
        this.setPanelPosition(change.value);
      }
      if (change.key === LayoutStateKeys.PANEL_ALIGNMENT) {
        this.setPanelAlignment(change.value);
      }
      this.doUpdateLayoutConfiguration();
    }));
    const initialEditorsState = this.getInitialEditorsState();
    if (initialEditorsState) {
      this.logService.trace("Initial editor state", initialEditorsState);
    }
    const initialLayoutState = {
      layout: {
        editors: initialEditorsState?.layout
      },
      editor: {
        restoreEditors: this.shouldRestoreEditors(this.contextService, initialEditorsState),
        editorsToOpen: this.resolveEditorsToOpen(fileService, initialEditorsState)
      },
      views: {
        defaults: this.getDefaultLayoutViews(this.environmentService, this.storageService),
        containerToRestore: {}
      }
    };
    const layoutRuntimeState = {
      activeContainerId: this.getActiveContainerId(),
      mainWindowFullscreen: isFullscreen(mainWindow),
      hasFocus: this.hostService.hasFocus,
      maximized: /* @__PURE__ */ new Set(),
      mainWindowBorder: false,
      menuBar: {
        toggled: false
      },
      zenMode: {
        transitionDisposables: new DisposableMap()
      }
    };
    this.state = {
      initialization: initialLayoutState,
      runtime: layoutRuntimeState
    };
    if (this.isVisible(Parts.SIDEBAR_PART)) {
      let viewContainerToRestore = this.storageService.get(SidebarPart.activeViewletSettingsKey, StorageScope.WORKSPACE, this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.Sidebar)?.id);
      if (!this.environmentService.isBuilt || lifecycleService.startupKind === StartupKind.ReloadedWindow || this.environmentService.isExtensionDevelopment && !this.environmentService.extensionTestsLocationURI) {
      } else if (viewContainerToRestore !== this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.Sidebar)?.id && viewContainerToRestore !== this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.AuxiliaryBar)?.id) {
        viewContainerToRestore = this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.Sidebar)?.id;
      }
      if (viewContainerToRestore) {
        this.state.initialization.views.containerToRestore.sideBar = viewContainerToRestore;
      } else {
        this.stateModel.setRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN, true);
      }
    }
    if (this.isVisible(Parts.PANEL_PART)) {
      const viewContainerToRestore = this.storageService.get(PanelPart.activePanelSettingsKey, StorageScope.WORKSPACE, this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.Panel)?.id);
      if (viewContainerToRestore) {
        this.state.initialization.views.containerToRestore.panel = viewContainerToRestore;
      } else {
        this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_HIDDEN, true);
      }
    }
    if (this.isVisible(Parts.AUXILIARYBAR_PART)) {
      const viewContainerToRestore = this.storageService.get(AuxiliaryBarPart.activeViewSettingsKey, StorageScope.WORKSPACE, this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.AuxiliaryBar)?.id);
      if (viewContainerToRestore) {
        this.state.initialization.views.containerToRestore.auxiliaryBar = viewContainerToRestore;
      } else {
        this.stateModel.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN, true);
      }
    }
    this.updateWindowBorder(true);
  }
  getDefaultLayoutViews(environmentService, storageService) {
    const defaultLayout = environmentService.options?.defaultLayout;
    if (!defaultLayout) {
      return void 0;
    }
    if (!defaultLayout.force && !storageService.isNew(StorageScope.WORKSPACE)) {
      return void 0;
    }
    const { views } = defaultLayout;
    if (views?.length) {
      return views.map((view) => view.id);
    }
    return void 0;
  }
  shouldRestoreEditors(contextService, initialEditorsState) {
    if (isTemporaryWorkspace(contextService.getWorkspace())) {
      return false;
    }
    if (this.configurationService.getValue("workbench.editor.restoreEditors" /* EDITOR_RESTORE_EDITORS */) === false) {
      return false;
    }
    const forceRestoreEditors = this.configurationService.getValue("window.restoreWindows") === "preserve";
    return !!forceRestoreEditors || initialEditorsState === void 0;
  }
  willRestoreEditors() {
    return this.state.initialization.editor.restoreEditors;
  }
  async resolveEditorsToOpen(fileService, initialEditorsState) {
    if (initialEditorsState) {
      const filesToMerge = coalesce(await pathsToEditors(initialEditorsState.filesToMerge, fileService, this.logService));
      if (filesToMerge.length === 4 && isResourceEditorInput(filesToMerge[0]) && isResourceEditorInput(filesToMerge[1]) && isResourceEditorInput(filesToMerge[2]) && isResourceEditorInput(filesToMerge[3])) {
        return [{
          editor: {
            input1: { resource: filesToMerge[0].resource },
            input2: { resource: filesToMerge[1].resource },
            base: { resource: filesToMerge[2].resource },
            result: { resource: filesToMerge[3].resource },
            options: { pinned: true }
          }
        }];
      }
      const filesToDiff = coalesce(await pathsToEditors(initialEditorsState.filesToDiff, fileService, this.logService));
      if (filesToDiff.length === 2) {
        return [{
          editor: {
            original: { resource: filesToDiff[0].resource },
            modified: { resource: filesToDiff[1].resource },
            options: { pinned: true }
          }
        }];
      }
      const filesToOpenOrCreate = [];
      const resolvedFilesToOpenOrCreate = await pathsToEditors(initialEditorsState.filesToOpenOrCreate, fileService, this.logService);
      for (let i = 0; i < resolvedFilesToOpenOrCreate.length; i++) {
        const resolvedFileToOpenOrCreate = resolvedFilesToOpenOrCreate[i];
        if (resolvedFileToOpenOrCreate) {
          filesToOpenOrCreate.push({
            editor: resolvedFileToOpenOrCreate,
            viewColumn: initialEditorsState.filesToOpenOrCreate?.[i].viewColumn
            // take over `viewColumn` from initial state
          });
        }
      }
      return filesToOpenOrCreate;
    } else if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY && this.configurationService.getValue("workbench.startupEditor") === "newUntitledFile") {
      if (this.editorGroupService.hasRestorableState) {
        return [];
      }
      return [{
        editor: { resource: void 0 }
        // open empty untitled file
      }];
    }
    return [];
  }
  get openedDefaultEditors() {
    return this._openedDefaultEditors;
  }
  getInitialEditorsState() {
    const defaultLayout = this.environmentService.options?.defaultLayout;
    if ((defaultLayout?.editors?.length || defaultLayout?.layout?.editors) && (defaultLayout.force || this.storageService.isNew(StorageScope.WORKSPACE))) {
      this._openedDefaultEditors = true;
      return {
        layout: defaultLayout.layout?.editors,
        filesToOpenOrCreate: defaultLayout?.editors?.map((editor) => {
          return {
            viewColumn: editor.viewColumn,
            fileUri: URI.revive(editor.uri),
            openOnlyIfExists: editor.openOnlyIfExists,
            options: editor.options
          };
        })
      };
    }
    const { filesToOpenOrCreate, filesToDiff, filesToMerge } = this.environmentService;
    if (filesToOpenOrCreate || filesToDiff || filesToMerge) {
      return { filesToOpenOrCreate, filesToDiff, filesToMerge };
    }
    return void 0;
  }
  isRestored() {
    return this.restored;
  }
  restoreParts() {
    const layoutReadyPromises = [];
    const layoutRestoredPromises = [];
    layoutReadyPromises.push((async () => {
      mark("code/willRestoreEditors");
      await this.editorGroupService.whenReady;
      mark("code/restoreEditors/editorGroupsReady");
      if (this.state.initialization.layout?.editors) {
        this.editorGroupService.mainPart.applyLayout(this.state.initialization.layout.editors);
      }
      const editors = await this.state.initialization.editor.editorsToOpen;
      mark("code/restoreEditors/editorsToOpenResolved");
      let openEditorsPromise = void 0;
      if (editors.length) {
        const editorGroupsInVisualOrder = this.editorGroupService.mainPart.getGroups(GroupsOrder.GRID_APPEARANCE);
        const mapEditorsToGroup = /* @__PURE__ */ new Map();
        for (const editor of editors) {
          const group = editorGroupsInVisualOrder[(editor.viewColumn ?? 1) - 1];
          let editorsByGroup = mapEditorsToGroup.get(group.id);
          if (!editorsByGroup) {
            editorsByGroup = /* @__PURE__ */ new Set();
            mapEditorsToGroup.set(group.id, editorsByGroup);
          }
          editorsByGroup.add(editor.editor);
        }
        openEditorsPromise = Promise.all(Array.from(mapEditorsToGroup).map(async ([groupId, editors2]) => {
          try {
            await this.editorService.openEditors(Array.from(editors2), groupId, { validateTrust: true });
          } catch (error) {
            this.logService.error(error);
          }
        }));
      }
      layoutRestoredPromises.push(
        Promise.all([
          openEditorsPromise?.finally(() => mark("code/restoreEditors/editorsOpened")),
          this.editorGroupService.whenRestored.finally(() => mark("code/restoreEditors/editorGroupsRestored"))
        ]).finally(() => {
          mark("code/didRestoreEditors");
        })
      );
    })());
    const restoreDefaultViewsPromise = (async () => {
      if (this.state.initialization.views.defaults?.length) {
        mark("code/willOpenDefaultViews");
        const locationsRestored = [];
        const tryOpenView = (view) => {
          const location = this.viewDescriptorService.getViewLocationById(view.id);
          if (location !== null) {
            const container = this.viewDescriptorService.getViewContainerByViewId(view.id);
            if (container) {
              if (view.order >= (locationsRestored?.[location]?.order ?? 0)) {
                locationsRestored[location] = { id: container.id, order: view.order };
              }
              const containerModel = this.viewDescriptorService.getViewContainerModel(container);
              containerModel.setCollapsed(view.id, false);
              containerModel.setVisible(view.id, true);
              return true;
            }
          }
          return false;
        };
        const defaultViews = [...this.state.initialization.views.defaults].reverse().map((v, index) => ({ id: v, order: index }));
        let i = defaultViews.length;
        while (i) {
          i--;
          if (tryOpenView(defaultViews[i])) {
            defaultViews.splice(i, 1);
          }
        }
        if (defaultViews.length) {
          await this.extensionService.whenInstalledExtensionsRegistered();
          let i2 = defaultViews.length;
          while (i2) {
            i2--;
            if (tryOpenView(defaultViews[i2])) {
              defaultViews.splice(i2, 1);
            }
          }
        }
        if (locationsRestored[ViewContainerLocation.Sidebar]) {
          this.state.initialization.views.containerToRestore.sideBar = locationsRestored[ViewContainerLocation.Sidebar].id;
        }
        if (locationsRestored[ViewContainerLocation.Panel]) {
          this.state.initialization.views.containerToRestore.panel = locationsRestored[ViewContainerLocation.Panel].id;
        }
        if (locationsRestored[ViewContainerLocation.AuxiliaryBar]) {
          this.state.initialization.views.containerToRestore.auxiliaryBar = locationsRestored[ViewContainerLocation.AuxiliaryBar].id;
        }
        mark("code/didOpenDefaultViews");
      }
    })();
    layoutReadyPromises.push(restoreDefaultViewsPromise);
    layoutReadyPromises.push((async () => {
      await restoreDefaultViewsPromise;
      if (!this.state.initialization.views.containerToRestore.sideBar) {
        return;
      }
      mark("code/willRestoreViewlet");
      await this.openViewContainer(ViewContainerLocation.Sidebar, this.state.initialization.views.containerToRestore.sideBar);
      mark("code/didRestoreViewlet");
    })());
    layoutReadyPromises.push((async () => {
      await restoreDefaultViewsPromise;
      if (!this.state.initialization.views.containerToRestore.panel) {
        return;
      }
      mark("code/willRestorePanel");
      await this.openViewContainer(ViewContainerLocation.Panel, this.state.initialization.views.containerToRestore.panel);
      mark("code/didRestorePanel");
    })());
    layoutReadyPromises.push((async () => {
      await restoreDefaultViewsPromise;
      if (!this.state.initialization.views.containerToRestore.auxiliaryBar) {
        return;
      }
      mark("code/willRestoreAuxiliaryBar");
      await this.openViewContainer(ViewContainerLocation.AuxiliaryBar, this.state.initialization.views.containerToRestore.auxiliaryBar);
      mark("code/didRestoreAuxiliaryBar");
    })());
    const zenModeWasActive = this.isZenModeActive();
    const restoreZenMode = getZenModeConfiguration(this.configurationService).restore;
    if (zenModeWasActive) {
      this.setZenModeActive(!restoreZenMode);
      this.toggleZenMode(false, true);
    }
    if (this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED)) {
      this.centerMainEditorLayout(true, true);
    }
    Promises.settled(layoutReadyPromises).finally(() => {
      if (getActiveElement() === mainWindow.document.body && (this.isPanelMaximized() || this.isAuxiliaryBarMaximized())) {
        this.focus();
      }
      this.whenReadyPromise.complete();
      Promises.settled(layoutRestoredPromises).finally(() => {
        if (this.editorService.editors.length === 0 && // no editors opened or restored
        this.isVisible(Parts.AUXILIARYBAR_PART) && // auxiliary bar is visible
        !this.hasFocus(Parts.AUXILIARYBAR_PART) && // auxiliary bar does not have focus yet
        !this.environmentService.enableSmokeTestDriver) {
          this.focusPart(Parts.AUXILIARYBAR_PART);
        }
        this.restored = true;
        this.whenRestoredPromise.complete();
      });
    });
  }
  async openViewContainer(location, id, focus) {
    let viewContainer = await this.paneCompositeService.openPaneComposite(id, location, focus);
    if (viewContainer) {
      return;
    }
    viewContainer = await this.paneCompositeService.openPaneComposite(this.viewDescriptorService.getDefaultViewContainer(location)?.id, location, focus);
    if (viewContainer) {
      return;
    }
    await this.paneCompositeService.openPaneComposite(this.paneCompositeService.getVisiblePaneCompositeIds(location).at(0), location, focus);
  }
  registerPart(part) {
    const id = part.getId();
    this.parts.set(id, part);
    return toDisposable(() => this.parts.delete(id));
  }
  getPart(key) {
    const part = this.parts.get(key);
    if (!part) {
      throw new Error(`Unknown part ${key}`);
    }
    return part;
  }
  registerNotifications(delegate) {
    this._register(delegate.onDidChangeNotificationsVisibility((visible) => this._onDidChangeNotificationsVisibility.fire(visible)));
  }
  hasFocus(part) {
    const container = this.getContainer(getActiveWindow(), part);
    if (!container) {
      return false;
    }
    const activeElement = getActiveElement();
    if (!activeElement) {
      return false;
    }
    return isAncestorUsingFlowTo(activeElement, container);
  }
  _getFocusedPart() {
    for (const part of this.parts.keys()) {
      if (this.hasFocus(part)) {
        return part;
      }
    }
    return void 0;
  }
  focusPart(part, targetWindow = mainWindow) {
    const container = this.getContainer(targetWindow, part) ?? this.mainContainer;
    switch (part) {
      case Parts.EDITOR_PART:
        this.editorGroupService.getPart(container).activeGroup.focus();
        break;
      case Parts.PANEL_PART: {
        this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel)?.focus();
        break;
      }
      case Parts.SIDEBAR_PART: {
        this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar)?.focus();
        break;
      }
      case Parts.AUXILIARYBAR_PART: {
        this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)?.focus();
        break;
      }
      case Parts.ACTIVITYBAR_PART:
        this.getPart(Parts.SIDEBAR_PART).focusActivityBar();
        break;
      case Parts.STATUSBAR_PART:
        this.statusBarService.getPart(container).focus();
        break;
      default: {
        container?.focus();
      }
    }
  }
  getContainer(targetWindow, part) {
    if (typeof part === "undefined") {
      return this.getContainerFromDocument(targetWindow.document);
    }
    if (targetWindow === mainWindow) {
      return this.getPart(part).getContainer();
    }
    let partCandidate;
    if (part === Parts.EDITOR_PART) {
      partCandidate = this.editorGroupService.getPart(this.getContainerFromDocument(targetWindow.document));
    } else if (part === Parts.STATUSBAR_PART) {
      partCandidate = this.statusBarService.getPart(this.getContainerFromDocument(targetWindow.document));
    } else if (part === Parts.TITLEBAR_PART) {
      partCandidate = this.titleService.getPart(this.getContainerFromDocument(targetWindow.document));
    }
    if (partCandidate instanceof Part) {
      return partCandidate.getContainer();
    }
    return void 0;
  }
  isVisible(part, targetWindow = mainWindow) {
    if (targetWindow !== mainWindow && part === Parts.EDITOR_PART) {
      return true;
    }
    switch (part) {
      case Parts.TITLEBAR_PART:
        return this.initialized ? this.workbenchGrid.isViewVisible(this.titleBarPartView) : shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled);
      case Parts.SIDEBAR_PART:
        return !this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN);
      case Parts.PANEL_PART:
        return !this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN);
      case Parts.AUXILIARYBAR_PART:
        return !this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN);
      case Parts.STATUSBAR_PART:
        return !this.stateModel.getRuntimeValue(LayoutStateKeys.STATUSBAR_HIDDEN);
      case Parts.ACTIVITYBAR_PART:
        return !this.stateModel.getRuntimeValue(LayoutStateKeys.ACTIVITYBAR_HIDDEN);
      case Parts.EDITOR_PART:
        return !this.stateModel.getRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN);
      case Parts.BANNER_PART:
        return this.initialized ? this.workbenchGrid.isViewVisible(this.bannerPartView) : false;
      default:
        return false;
    }
  }
  shouldShowBannerFirst() {
    return isWeb && !isWCOEnabled();
  }
  focus() {
    if (this.isPanelMaximized() && this.mainContainer === this.activeContainer) {
      this.focusPart(Parts.PANEL_PART);
    } else if (this.isAuxiliaryBarMaximized() && this.mainContainer === this.activeContainer) {
      this.focusPart(Parts.AUXILIARYBAR_PART);
    } else {
      this.focusPart(Parts.EDITOR_PART, getWindow(this.activeContainer));
    }
  }
  focusPanelOrEditor() {
    const activePanel = this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel);
    if ((this.hasFocus(Parts.PANEL_PART) || !this.isVisible(Parts.EDITOR_PART)) && activePanel) {
      activePanel.focus();
    } else {
      this.focus();
    }
  }
  getMaximumEditorDimensions(container) {
    const targetWindow = getWindow(container);
    const containerDimension = this.getContainerDimension(container);
    if (container === this.mainContainer) {
      const isPanelHorizontal = isHorizontal(this.getPanelPosition());
      const takenWidth = (this.isVisible(Parts.ACTIVITYBAR_PART) ? this.activityBarPartView.minimumWidth : 0) + (this.isVisible(Parts.SIDEBAR_PART) ? this.sideBarPartView.minimumWidth : 0) + (this.isVisible(Parts.PANEL_PART) && !isPanelHorizontal ? this.panelPartView.minimumWidth : 0) + (this.isVisible(Parts.AUXILIARYBAR_PART) ? this.auxiliaryBarPartView.minimumWidth : 0);
      const takenHeight = (this.isVisible(Parts.TITLEBAR_PART, targetWindow) ? this.titleBarPartView.minimumHeight : 0) + (this.isVisible(Parts.STATUSBAR_PART, targetWindow) ? this.statusBarPartView.minimumHeight : 0) + (this.isVisible(Parts.PANEL_PART) && isPanelHorizontal ? this.panelPartView.minimumHeight : 0);
      const availableWidth = containerDimension.width - takenWidth;
      const availableHeight = containerDimension.height - takenHeight;
      return { width: availableWidth, height: availableHeight };
    } else {
      const takenHeight = (this.isVisible(Parts.TITLEBAR_PART, targetWindow) ? this.titleBarPartView.minimumHeight : 0) + (this.isVisible(Parts.STATUSBAR_PART, targetWindow) ? this.statusBarPartView.minimumHeight : 0);
      return { width: containerDimension.width, height: containerDimension.height - takenHeight };
    }
  }
  isZenModeActive() {
    return this.stateModel.getRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE);
  }
  setZenModeActive(active) {
    this.stateModel.setRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE, active);
  }
  toggleZenMode(skipLayout, restoring = false) {
    const focusedPartPreTransition = this._getFocusedPart();
    this.setZenModeActive(!this.isZenModeActive());
    this.state.runtime.zenMode.transitionDisposables.clearAndDisposeAll();
    const setLineNumbers = (lineNumbers) => {
      for (const editor of this.mainPartEditorService.visibleTextEditorControls) {
        if (!lineNumbers && isCodeEditor(editor) && editor.hasModel()) {
          const model = editor.getModel();
          lineNumbers = this.configurationService.getValue("editor.lineNumbers", { resource: model.uri, overrideIdentifier: model.getLanguageId() });
        }
        if (!lineNumbers) {
          lineNumbers = this.configurationService.getValue("editor.lineNumbers");
        }
        editor.updateOptions({ lineNumbers });
      }
    };
    let toggleMainWindowFullScreen = false;
    const config = getZenModeConfiguration(this.configurationService);
    const zenModeExitInfo = this.stateModel.getRuntimeValue(LayoutStateKeys.ZEN_MODE_EXIT_INFO);
    if (this.isZenModeActive()) {
      toggleMainWindowFullScreen = !this.state.runtime.mainWindowFullscreen && config.fullScreen && !isIOS;
      if (!restoring) {
        zenModeExitInfo.transitionedToFullScreen = toggleMainWindowFullScreen;
        zenModeExitInfo.transitionedToCenteredEditorLayout = !this.isMainEditorLayoutCentered() && config.centerLayout;
        zenModeExitInfo.handleNotificationsDoNotDisturbMode = this.notificationService.getFilter() === NotificationsFilter.OFF;
        zenModeExitInfo.wasVisible.sideBar = this.isVisible(Parts.SIDEBAR_PART);
        zenModeExitInfo.wasVisible.panel = this.isVisible(Parts.PANEL_PART);
        zenModeExitInfo.wasVisible.auxiliaryBar = this.isVisible(Parts.AUXILIARYBAR_PART);
        this.stateModel.setRuntimeValue(LayoutStateKeys.ZEN_MODE_EXIT_INFO, zenModeExitInfo);
      }
      this.setPanelHidden(true, true);
      this.setAuxiliaryBarHidden(true, true);
      this.setSideBarHidden(true);
      if (config.hideActivityBar) {
        this.setActivityBarHidden(true);
      }
      if (config.hideStatusBar) {
        this.setStatusBarHidden(true);
      }
      if (config.hideLineNumbers) {
        setLineNumbers("off");
        this.state.runtime.zenMode.transitionDisposables.set(ZenModeSettings.HIDE_LINENUMBERS, this.mainPartEditorService.onDidVisibleEditorsChange(() => setLineNumbers("off")));
      }
      if (config.showTabs !== this.editorGroupService.partOptions.showTabs) {
        this.state.runtime.zenMode.transitionDisposables.set(ZenModeSettings.SHOW_TABS, this.editorGroupService.mainPart.enforcePartOptions({ showTabs: config.showTabs }));
      }
      if (config.silentNotifications && zenModeExitInfo.handleNotificationsDoNotDisturbMode) {
        this.notificationService.setFilter(NotificationsFilter.ERROR);
      }
      if (config.centerLayout) {
        this.centerMainEditorLayout(true, true);
      }
      this.state.runtime.zenMode.transitionDisposables.set("configurationChange", this.configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(ZenModeSettings.HIDE_ACTIVITYBAR) || e.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION)) {
          const zenModeHideActivityBar = this.configurationService.getValue(ZenModeSettings.HIDE_ACTIVITYBAR);
          const activityBarLocation = this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION);
          this.setActivityBarHidden(zenModeHideActivityBar ? true : activityBarLocation === ActivityBarPosition.TOP || activityBarLocation === ActivityBarPosition.BOTTOM);
        }
        if (e.affectsConfiguration(ZenModeSettings.HIDE_STATUSBAR)) {
          const zenModeHideStatusBar = this.configurationService.getValue(ZenModeSettings.HIDE_STATUSBAR);
          this.setStatusBarHidden(zenModeHideStatusBar);
        }
        if (e.affectsConfiguration(ZenModeSettings.CENTER_LAYOUT)) {
          const zenModeCenterLayout = this.configurationService.getValue(ZenModeSettings.CENTER_LAYOUT);
          this.centerMainEditorLayout(zenModeCenterLayout, true);
        }
        if (e.affectsConfiguration(ZenModeSettings.SHOW_TABS)) {
          const zenModeShowTabs = this.configurationService.getValue(ZenModeSettings.SHOW_TABS) ?? "multiple";
          this.state.runtime.zenMode.transitionDisposables.set(ZenModeSettings.SHOW_TABS, this.editorGroupService.mainPart.enforcePartOptions({ showTabs: zenModeShowTabs }));
        }
        if (e.affectsConfiguration(ZenModeSettings.SILENT_NOTIFICATIONS)) {
          const zenModeSilentNotifications = !!this.configurationService.getValue(ZenModeSettings.SILENT_NOTIFICATIONS);
          if (zenModeExitInfo.handleNotificationsDoNotDisturbMode) {
            this.notificationService.setFilter(zenModeSilentNotifications ? NotificationsFilter.ERROR : NotificationsFilter.OFF);
          }
        }
        if (e.affectsConfiguration(ZenModeSettings.HIDE_LINENUMBERS)) {
          const lineNumbersType = this.configurationService.getValue(ZenModeSettings.HIDE_LINENUMBERS) ? "off" : void 0;
          setLineNumbers(lineNumbersType);
          this.state.runtime.zenMode.transitionDisposables.set(ZenModeSettings.HIDE_LINENUMBERS, this.mainPartEditorService.onDidVisibleEditorsChange(() => setLineNumbers(lineNumbersType)));
        }
      }));
    } else {
      if (zenModeExitInfo.wasVisible.panel) {
        this.setPanelHidden(false, true);
      }
      if (zenModeExitInfo.wasVisible.auxiliaryBar) {
        this.setAuxiliaryBarHidden(false, true);
      }
      if (zenModeExitInfo.wasVisible.sideBar) {
        this.setSideBarHidden(false);
      }
      if (!this.stateModel.getRuntimeValue(LayoutStateKeys.ACTIVITYBAR_HIDDEN, true)) {
        this.setActivityBarHidden(false);
      }
      if (!this.stateModel.getRuntimeValue(LayoutStateKeys.STATUSBAR_HIDDEN, true)) {
        this.setStatusBarHidden(false);
      }
      if (zenModeExitInfo.transitionedToCenteredEditorLayout) {
        this.centerMainEditorLayout(false, true);
      }
      if (zenModeExitInfo.handleNotificationsDoNotDisturbMode) {
        this.notificationService.setFilter(NotificationsFilter.OFF);
      }
      setLineNumbers();
      toggleMainWindowFullScreen = zenModeExitInfo.transitionedToFullScreen && this.state.runtime.mainWindowFullscreen;
    }
    if (!skipLayout) {
      this.layout();
    }
    if (toggleMainWindowFullScreen) {
      this.hostService.toggleFullScreen(mainWindow);
    }
    if (focusedPartPreTransition && this.isVisible(focusedPartPreTransition, getWindow(this.activeContainer))) {
      if (isMultiWindowPart(focusedPartPreTransition)) {
        this.focusPart(focusedPartPreTransition, getWindow(this.activeContainer));
      } else {
        this.focusPart(focusedPartPreTransition);
      }
    } else {
      this.focus();
    }
    this._onDidChangeZenMode.fire(this.isZenModeActive());
  }
  setStatusBarHidden(hidden) {
    this.stateModel.setRuntimeValue(LayoutStateKeys.STATUSBAR_HIDDEN, hidden);
    if (hidden) {
      this.mainContainer.classList.add("nostatusbar" /* STATUSBAR_HIDDEN */);
    } else {
      this.mainContainer.classList.remove("nostatusbar" /* STATUSBAR_HIDDEN */);
    }
    this.workbenchGrid.setViewVisible(this.statusBarPartView, !hidden);
  }
  createWorkbenchLayout() {
    const titleBar = this.getPart(Parts.TITLEBAR_PART);
    const bannerPart = this.getPart(Parts.BANNER_PART);
    const editorPart = this.getPart(Parts.EDITOR_PART);
    const activityBar = this.getPart(Parts.ACTIVITYBAR_PART);
    const panelPart = this.getPart(Parts.PANEL_PART);
    const auxiliaryBarPart = this.getPart(Parts.AUXILIARYBAR_PART);
    const sideBar = this.getPart(Parts.SIDEBAR_PART);
    const statusBar = this.getPart(Parts.STATUSBAR_PART);
    this.titleBarPartView = titleBar;
    this.bannerPartView = bannerPart;
    this.sideBarPartView = sideBar;
    this.activityBarPartView = activityBar;
    this.editorPartView = editorPart;
    this.panelPartView = panelPart;
    this.auxiliaryBarPartView = auxiliaryBarPart;
    this.statusBarPartView = statusBar;
    const viewMap = {
      [Parts.ACTIVITYBAR_PART]: this.activityBarPartView,
      [Parts.BANNER_PART]: this.bannerPartView,
      [Parts.TITLEBAR_PART]: this.titleBarPartView,
      [Parts.EDITOR_PART]: this.editorPartView,
      [Parts.PANEL_PART]: this.panelPartView,
      [Parts.SIDEBAR_PART]: this.sideBarPartView,
      [Parts.STATUSBAR_PART]: this.statusBarPartView,
      [Parts.AUXILIARYBAR_PART]: this.auxiliaryBarPartView
    };
    const fromJSON = ({ type }) => viewMap[type];
    const workbenchGrid = SerializableGrid.deserialize(
      this.createGridDescriptor(),
      { fromJSON },
      { proportionalLayout: false }
    );
    this.mainContainer.prepend(workbenchGrid.element);
    this.mainContainer.setAttribute("role", "application");
    this.workbenchGrid = workbenchGrid;
    this.workbenchGrid.edgeSnapping = this.state.runtime.mainWindowFullscreen;
    for (const part of [titleBar, editorPart, activityBar, panelPart, sideBar, statusBar, auxiliaryBarPart, bannerPart]) {
      this._register(part.onDidVisibilityChange((visible) => {
        if (!this.inMaximizedAuxiliaryBarTransition) {
          if (part === sideBar) {
            this.setSideBarHidden(!visible);
          } else if (part === panelPart && this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN) === visible) {
            this.setPanelHidden(!visible, true);
          } else if (part === auxiliaryBarPart) {
            this.setAuxiliaryBarHidden(!visible, true);
          } else if (part === editorPart) {
            this.setEditorHidden(!visible);
          }
        }
        this._onDidChangePartVisibility.fire({ partId: part.getId(), visible });
        this.handleContainerDidLayout(this.mainContainer, this._mainContainerDimension);
      }));
    }
    this._register(this.onDidChangePartVisibility(({ partId }) => {
      if (partId === Parts.TITLEBAR_PART || partId === Parts.BANNER_PART) {
        this.updateTopWindowEdgeClass();
      }
    }));
    this._register(this.storageService.onWillSaveState(() => {
      const sideBarSize = this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN) ? this.workbenchGrid.getViewCachedVisibleSize(this.sideBarPartView) : this.workbenchGrid.getViewSize(this.sideBarPartView).width;
      this.stateModel.setInitializationValue(LayoutStateKeys.SIDEBAR_SIZE, sideBarSize);
      const panelSize = this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN) ? this.workbenchGrid.getViewCachedVisibleSize(this.panelPartView) : isHorizontal(this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_POSITION)) ? this.workbenchGrid.getViewSize(this.panelPartView).height : this.workbenchGrid.getViewSize(this.panelPartView).width;
      this.stateModel.setInitializationValue(LayoutStateKeys.PANEL_SIZE, panelSize);
      const auxiliaryBarSize = this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN) ? this.workbenchGrid.getViewCachedVisibleSize(this.auxiliaryBarPartView) : this.workbenchGrid.getViewSize(this.auxiliaryBarPartView).width;
      this.stateModel.setInitializationValue(LayoutStateKeys.AUXILIARYBAR_SIZE, auxiliaryBarSize);
      this.stateModel.save(true, true);
    }));
    this._register(Event.any(this.paneCompositeService.onDidPaneCompositeOpen, this.paneCompositeService.onDidPaneCompositeClose)(() => {
      this.stateModel.setInitializationValue(LayoutStateKeys.AUXILIARYBAR_EMPTY, this.paneCompositeService.getPaneCompositeIds(ViewContainerLocation.AuxiliaryBar).length === 0);
    }));
  }
  layout() {
    if (!this.disposed) {
      this._mainContainerDimension = getClientArea(
        this.state.runtime.mainWindowFullscreen ? mainWindow.document.body : (
          // in fullscreen mode, make sure to use <body> element because
          this.parent
        ),
        // in that case the workbench will span the entire site
        this.contextService.getWorkbenchState() === WorkbenchState.EMPTY ? DEFAULT_EMPTY_WINDOW_DIMENSIONS : DEFAULT_WORKSPACE_WINDOW_DIMENSIONS
        // running with fallback to ensure no error is thrown (https://github.com/microsoft/vscode/issues/240242)
      );
      this.logService.trace(`Layout#layout, height: ${this._mainContainerDimension.height}, width: ${this._mainContainerDimension.width}`);
      size(this.mainContainer, this._mainContainerDimension.width, this._mainContainerDimension.height);
      this.workbenchGrid.layout(this._mainContainerDimension.width, this._mainContainerDimension.height);
      this.initialized = true;
      this.handleContainerDidLayout(this.mainContainer, this._mainContainerDimension);
    }
  }
  isMainEditorLayoutCentered() {
    return this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED);
  }
  centerMainEditorLayout(active, skipLayout) {
    this.stateModel.setRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED, active);
    const mainVisibleEditors = coalesce(this.editorGroupService.mainPart.groups.map((group) => group.activeEditor));
    const isEditorComplex = mainVisibleEditors.some((editor) => {
      if (editor instanceof DiffEditorInput) {
        return this.configurationService.getValue("diffEditor.renderSideBySide");
      }
      if (editor?.hasCapability(EditorInputCapabilities.MultipleEditors)) {
        return true;
      }
      return false;
    });
    const layout = this.editorGroupService.getLayout();
    let hasMoreThanOneColumn = false;
    if (layout.orientation === GroupOrientation.HORIZONTAL) {
      hasMoreThanOneColumn = layout.groups.length > 1;
    } else {
      hasMoreThanOneColumn = layout.groups.some((group) => group.groups && group.groups.length > 1);
    }
    const isCenteredLayoutAutoResizing = this.configurationService.getValue("workbench.editor.centeredLayoutAutoResize");
    if (isCenteredLayoutAutoResizing && (hasMoreThanOneColumn && !this.editorGroupService.mainPart.hasMaximizedGroup() || isEditorComplex)) {
      active = false;
    }
    if (this.editorGroupService.mainPart.isLayoutCentered() !== active) {
      this.editorGroupService.mainPart.centerLayout(active);
      if (!skipLayout) {
        this.layout();
      }
    }
    this._onDidChangeMainEditorCenteredLayout.fire(this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED));
  }
  getSize(part) {
    return this.workbenchGrid.getViewSize(this.getPart(part));
  }
  setSize(part, size2) {
    this.workbenchGrid.resizeView(this.getPart(part), size2);
  }
  resizePart(part, sizeChangeWidth, sizeChangeHeight) {
    const sizeChangePxWidth = Math.sign(sizeChangeWidth) * computeScreenAwareSize(getActiveWindow(), Math.abs(sizeChangeWidth));
    const sizeChangePxHeight = Math.sign(sizeChangeHeight) * computeScreenAwareSize(getActiveWindow(), Math.abs(sizeChangeHeight));
    let viewSize;
    switch (part) {
      case Parts.SIDEBAR_PART:
        viewSize = this.workbenchGrid.getViewSize(this.sideBarPartView);
        this.workbenchGrid.resizeView(this.sideBarPartView, {
          width: viewSize.width + sizeChangePxWidth,
          height: viewSize.height
        });
        break;
      case Parts.PANEL_PART:
        viewSize = this.workbenchGrid.getViewSize(this.panelPartView);
        this.workbenchGrid.resizeView(this.panelPartView, {
          width: viewSize.width + (isHorizontal(this.getPanelPosition()) ? 0 : sizeChangePxWidth),
          height: viewSize.height + (isHorizontal(this.getPanelPosition()) ? sizeChangePxHeight : 0)
        });
        break;
      case Parts.AUXILIARYBAR_PART:
        viewSize = this.workbenchGrid.getViewSize(this.auxiliaryBarPartView);
        this.workbenchGrid.resizeView(this.auxiliaryBarPartView, {
          width: viewSize.width + sizeChangePxWidth,
          height: viewSize.height
        });
        break;
      case Parts.EDITOR_PART:
        viewSize = this.workbenchGrid.getViewSize(this.editorPartView);
        if (this.editorGroupService.mainPart.count === 1) {
          this.workbenchGrid.resizeView(this.editorPartView, {
            width: viewSize.width + sizeChangePxWidth,
            height: viewSize.height + sizeChangePxHeight
          });
        } else {
          const activeGroup = this.editorGroupService.mainPart.activeGroup;
          const { width, height } = this.editorGroupService.mainPart.getSize(activeGroup);
          this.editorGroupService.mainPart.setSize(activeGroup, { width: width + sizeChangePxWidth, height: height + sizeChangePxHeight });
          const { width: newWidth, height: newHeight } = this.editorGroupService.mainPart.getSize(activeGroup);
          if (sizeChangePxHeight && height === newHeight || sizeChangePxWidth && width === newWidth) {
            this.workbenchGrid.resizeView(this.editorPartView, {
              width: viewSize.width + (sizeChangePxWidth && width === newWidth ? sizeChangePxWidth : 0),
              height: viewSize.height + (sizeChangePxHeight && height === newHeight ? sizeChangePxHeight : 0)
            });
          }
        }
        break;
      default:
        return;
    }
  }
  setActivityBarHidden(hidden) {
    this.stateModel.setRuntimeValue(LayoutStateKeys.ACTIVITYBAR_HIDDEN, hidden);
    this.mainContainer.classList.toggle("noactivitybar" /* ACTIVITYBAR_HIDDEN */, hidden);
    this.workbenchGrid.setViewVisible(this.activityBarPartView, !hidden);
  }
  setBannerHidden(hidden) {
    this.workbenchGrid.setViewVisible(this.bannerPartView, !hidden);
  }
  setEditorHidden(hidden) {
    if (!hidden && this.setAuxiliaryBarMaximized(false) && this.isVisible(Parts.EDITOR_PART)) {
      return;
    }
    this.stateModel.setRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN, hidden);
    if (hidden) {
      this.mainContainer.classList.add("nomaineditorarea" /* MAIN_EDITOR_AREA_HIDDEN */);
    } else {
      this.mainContainer.classList.remove("nomaineditorarea" /* MAIN_EDITOR_AREA_HIDDEN */);
    }
    this.workbenchGrid.setViewVisible(this.editorPartView, !hidden);
    if (hidden && !this.isVisible(Parts.PANEL_PART) && !this.isAuxiliaryBarMaximized()) {
      this.setPanelHidden(false, true);
    }
  }
  getLayoutClasses() {
    return coalesce([
      !this.isVisible(Parts.SIDEBAR_PART) ? "nosidebar" /* SIDEBAR_HIDDEN */ : void 0,
      !this.isVisible(Parts.EDITOR_PART, mainWindow) ? "nomaineditorarea" /* MAIN_EDITOR_AREA_HIDDEN */ : void 0,
      !this.isVisible(Parts.PANEL_PART) ? "nopanel" /* PANEL_HIDDEN */ : void 0,
      !this.isVisible(Parts.AUXILIARYBAR_PART) ? "noauxiliarybar" /* AUXILIARYBAR_HIDDEN */ : void 0,
      !this.isVisible(Parts.ACTIVITYBAR_PART) ? "noactivitybar" /* ACTIVITYBAR_HIDDEN */ : void 0,
      !this.isVisible(Parts.STATUSBAR_PART) ? "nostatusbar" /* STATUSBAR_HIDDEN */ : void 0,
      isFloatingTopEdgeExposed(this, mainWindow) ? "top-window-edge" /* TOP_WINDOW_EDGE */ : void 0,
      this.state.runtime.mainWindowFullscreen ? "fullscreen" /* FULLSCREEN */ : void 0,
      this.isShadowsDisabled() ? "no-shadows" /* NO_SHADOWS */ : void 0,
      this.isFloatingPanelsEnabled() ? "floating-panels" /* FLOATING_PANELS */ : void 0,
      // Also seed the style-override class here (see `LayoutClasses.STYLE_OVERRIDE`).
      this.isFloatingPanelsEnabled() ? "style-override" /* STYLE_OVERRIDE */ : void 0,
      this.isFloatingPanelsEnabled() ? "modern-ui-tabs" /* MODERN_UI_TABS */ : void 0,
      `panel-position-${positionToString(this.getPanelPosition())}`,
      `panel-alignment-${this.getPanelAlignment()}`
    ]);
  }
  setSideBarHidden(hidden) {
    if (!hidden && this.setAuxiliaryBarMaximized(false) && this.isVisible(Parts.SIDEBAR_PART)) {
      return;
    }
    this.stateModel.setRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN, hidden);
    if (hidden) {
      this.mainContainer.classList.add("nosidebar" /* SIDEBAR_HIDDEN */);
    } else {
      this.mainContainer.classList.remove("nosidebar" /* SIDEBAR_HIDDEN */);
    }
    this.workbenchGrid.setViewVisible(this.sideBarPartView, !hidden);
    if (hidden && this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar)) {
      this.paneCompositeService.hideActivePaneComposite(ViewContainerLocation.Sidebar);
      if (!this.isAuxiliaryBarMaximized()) {
        this.focusPanelOrEditor();
      }
    } else if (!hidden && !this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar)) {
      const viewletToOpen = this.paneCompositeService.getLastActivePaneCompositeId(ViewContainerLocation.Sidebar);
      if (viewletToOpen) {
        this.openViewContainer(ViewContainerLocation.Sidebar, viewletToOpen);
      }
    }
  }
  hasViews(id) {
    const viewContainer = this.viewDescriptorService.getViewContainerById(id);
    if (!viewContainer) {
      return false;
    }
    const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
    if (!viewContainerModel) {
      return false;
    }
    return viewContainerModel.activeViewDescriptors.length >= 1;
  }
  adjustPartPositions(sideBarPosition, panelAlignment, panelPosition) {
    const isPanelVertical = !isHorizontal(panelPosition);
    const sideBarSiblingToEditor = isPanelVertical || !(panelAlignment === "center" || sideBarPosition === Position.LEFT && panelAlignment === "right" || sideBarPosition === Position.RIGHT && panelAlignment === "left");
    const auxiliaryBarSiblingToEditor = isPanelVertical || !(panelAlignment === "center" || sideBarPosition === Position.RIGHT && panelAlignment === "right" || sideBarPosition === Position.LEFT && panelAlignment === "left");
    const preMovePanelWidth = !this.isVisible(Parts.PANEL_PART) ? Sizing.Invisible(this.workbenchGrid.getViewCachedVisibleSize(this.panelPartView) ?? this.panelPartView.minimumWidth) : this.workbenchGrid.getViewSize(this.panelPartView).width;
    const preMovePanelHeight = !this.isVisible(Parts.PANEL_PART) ? Sizing.Invisible(this.workbenchGrid.getViewCachedVisibleSize(this.panelPartView) ?? this.panelPartView.minimumHeight) : this.workbenchGrid.getViewSize(this.panelPartView).height;
    const preMoveSideBarSize = !this.isVisible(Parts.SIDEBAR_PART) ? Sizing.Invisible(this.workbenchGrid.getViewCachedVisibleSize(this.sideBarPartView) ?? this.sideBarPartView.minimumWidth) : this.workbenchGrid.getViewSize(this.sideBarPartView).width;
    const preMoveAuxiliaryBarSize = !this.isVisible(Parts.AUXILIARYBAR_PART) ? Sizing.Invisible(this.workbenchGrid.getViewCachedVisibleSize(this.auxiliaryBarPartView) ?? this.auxiliaryBarPartView.minimumWidth) : this.workbenchGrid.getViewSize(this.auxiliaryBarPartView).width;
    const focusedPart = [Parts.PANEL_PART, Parts.SIDEBAR_PART, Parts.AUXILIARYBAR_PART].find((part) => this.hasFocus(part));
    if (sideBarPosition === Position.LEFT) {
      this.workbenchGrid.moveViewTo(this.activityBarPartView, [2, 0]);
      this.workbenchGrid.moveView(this.sideBarPartView, preMoveSideBarSize, sideBarSiblingToEditor ? this.editorPartView : this.activityBarPartView, sideBarSiblingToEditor ? Direction.Left : Direction.Right);
      if (auxiliaryBarSiblingToEditor) {
        this.workbenchGrid.moveView(this.auxiliaryBarPartView, preMoveAuxiliaryBarSize, this.editorPartView, Direction.Right);
      } else {
        this.workbenchGrid.moveViewTo(this.auxiliaryBarPartView, [2, -1]);
      }
    } else {
      this.workbenchGrid.moveViewTo(this.activityBarPartView, [2, -1]);
      this.workbenchGrid.moveView(this.sideBarPartView, preMoveSideBarSize, sideBarSiblingToEditor ? this.editorPartView : this.activityBarPartView, sideBarSiblingToEditor ? Direction.Right : Direction.Left);
      if (auxiliaryBarSiblingToEditor) {
        this.workbenchGrid.moveView(this.auxiliaryBarPartView, preMoveAuxiliaryBarSize, this.editorPartView, Direction.Left);
      } else {
        this.workbenchGrid.moveViewTo(this.auxiliaryBarPartView, [2, 0]);
      }
    }
    if (focusedPart) {
      this.focusPart(focusedPart);
    }
    if (isPanelVertical) {
      this.workbenchGrid.moveView(this.panelPartView, preMovePanelWidth, this.editorPartView, panelPosition === Position.LEFT ? Direction.Left : Direction.Right);
      this.workbenchGrid.resizeView(this.panelPartView, {
        height: preMovePanelHeight,
        width: preMovePanelWidth
      });
    }
    if (this.isVisible(Parts.SIDEBAR_PART)) {
      this.workbenchGrid.resizeView(this.sideBarPartView, {
        height: this.workbenchGrid.getViewSize(this.sideBarPartView).height,
        width: preMoveSideBarSize
      });
    }
    if (this.isVisible(Parts.AUXILIARYBAR_PART)) {
      this.workbenchGrid.resizeView(this.auxiliaryBarPartView, {
        height: this.workbenchGrid.getViewSize(this.auxiliaryBarPartView).height,
        width: preMoveAuxiliaryBarSize
      });
    }
  }
  setPanelAlignment(alignment) {
    if (!isHorizontal(this.getPanelPosition())) {
      this.setPanelPosition(Position.BOTTOM);
    }
    if (alignment !== "center" && this.isPanelMaximized()) {
      this.toggleMaximizedPanel();
    }
    this.setAuxiliaryBarMaximized(false);
    const oldAlignmentValue = this.getPanelAlignment();
    this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_ALIGNMENT, alignment);
    this.mainContainer.classList.remove(`panel-alignment-${oldAlignmentValue}`);
    this.mainContainer.classList.add(`panel-alignment-${alignment}`);
    this.adjustPartPositions(this.getSideBarPosition(), alignment, this.getPanelPosition());
    this._onDidChangePanelAlignment.fire(alignment);
  }
  setPanelHidden(hidden, skipLayout) {
    if (!this.workbenchGrid) {
      return;
    }
    if (!hidden && this.setAuxiliaryBarMaximized(false) && this.isVisible(Parts.PANEL_PART)) {
      return;
    }
    const wasHidden = !this.isVisible(Parts.PANEL_PART);
    const isPanelMaximized = this.isPanelMaximized();
    this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_HIDDEN, hidden);
    const panelOpensMaximized = this.panelOpensMaximized();
    if (hidden) {
      this.mainContainer.classList.add("nopanel" /* PANEL_HIDDEN */);
    } else {
      this.mainContainer.classList.remove("nopanel" /* PANEL_HIDDEN */);
    }
    if (hidden && isPanelMaximized) {
      this.toggleMaximizedPanel();
    }
    this.workbenchGrid.setViewVisible(this.panelPartView, !hidden);
    let focusEditor = false;
    if (hidden && this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel)) {
      this.paneCompositeService.hideActivePaneComposite(ViewContainerLocation.Panel);
      if (!isIOS && // do not auto focus on iOS (https://github.com/microsoft/vscode/issues/127832)
      !this.isAuxiliaryBarMaximized()) {
        focusEditor = true;
      }
    } else if (!hidden && !this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel)) {
      let panelToOpen = this.paneCompositeService.getLastActivePaneCompositeId(ViewContainerLocation.Panel);
      if (!panelToOpen || !this.hasViews(panelToOpen)) {
        panelToOpen = this.viewDescriptorService.getViewContainersByLocation(ViewContainerLocation.Panel).find((viewContainer) => this.hasViews(viewContainer.id))?.id;
      }
      if (panelToOpen) {
        this.openViewContainer(ViewContainerLocation.Panel, panelToOpen, !skipLayout);
      }
    }
    if (wasHidden === hidden) {
      return;
    }
    if (!hidden) {
      if (!skipLayout && isPanelMaximized !== panelOpensMaximized) {
        this.toggleMaximizedPanel();
      }
    } else {
      this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_WAS_LAST_MAXIMIZED, isPanelMaximized);
    }
    if (focusEditor) {
      this.editorGroupService.mainPart.activeGroup.focus();
    }
  }
  isAuxiliaryBarMaximized() {
    return this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_WAS_LAST_MAXIMIZED);
  }
  toggleMaximizedAuxiliaryBar() {
    this.setAuxiliaryBarMaximized(!this.isAuxiliaryBarMaximized());
  }
  setAuxiliaryBarMaximized(maximized) {
    if (this.inMaximizedAuxiliaryBarTransition || // prevent re-entrance
    maximized === this.isAuxiliaryBarMaximized()) {
      return false;
    }
    if (maximized) {
      const state = {
        sideBarVisible: this.isVisible(Parts.SIDEBAR_PART),
        editorVisible: this.isVisible(Parts.EDITOR_PART),
        panelVisible: this.isVisible(Parts.PANEL_PART),
        auxiliaryBarVisible: this.isVisible(Parts.AUXILIARYBAR_PART)
      };
      this.stateModel.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_WAS_LAST_MAXIMIZED, true);
      this.inMaximizedAuxiliaryBarTransition = true;
      try {
        if (!state.auxiliaryBarVisible) {
          this.setAuxiliaryBarHidden(false);
        }
        const size2 = this.workbenchGrid.getViewSize(this.auxiliaryBarPartView).width;
        this.stateModel.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_LAST_NON_MAXIMIZED_SIZE, size2);
        if (state.sideBarVisible) {
          this.setSideBarHidden(true);
        }
        if (state.panelVisible) {
          this.setPanelHidden(true);
        }
        if (state.editorVisible) {
          this.setEditorHidden(true);
        }
        this.stateModel.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_LAST_NON_MAXIMIZED_VISIBILITY, state);
      } finally {
        this.inMaximizedAuxiliaryBarTransition = false;
      }
    } else {
      const state = assertReturnsDefined(this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_LAST_NON_MAXIMIZED_VISIBILITY));
      this.stateModel.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_WAS_LAST_MAXIMIZED, false);
      this.inMaximizedAuxiliaryBarTransition = true;
      try {
        this.setEditorHidden(!state?.editorVisible);
        this.setPanelHidden(!state?.panelVisible);
        this.setSideBarHidden(!state?.sideBarVisible);
        const size2 = this.workbenchGrid.getViewSize(this.auxiliaryBarPartView);
        this.workbenchGrid.resizeView(this.auxiliaryBarPartView, {
          width: this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_LAST_NON_MAXIMIZED_SIZE),
          height: size2.height
        });
      } finally {
        this.inMaximizedAuxiliaryBarTransition = false;
      }
    }
    this.focusPart(Parts.AUXILIARYBAR_PART);
    this._onDidChangeAuxiliaryBarMaximized.fire();
    return true;
  }
  isPanelMaximized() {
    return (this.getPanelAlignment() === "center" || // the workbench grid currently prevents us from supporting panel
    !isHorizontal(this.getPanelPosition())) && !this.isVisible(Parts.EDITOR_PART, mainWindow) && !this.isAuxiliaryBarMaximized();
  }
  toggleMaximizedPanel() {
    const size2 = this.workbenchGrid.getViewSize(this.panelPartView);
    const panelPosition = this.getPanelPosition();
    const maximize = !this.isPanelMaximized();
    if (maximize) {
      if (this.isVisible(Parts.PANEL_PART)) {
        if (isHorizontal(panelPosition)) {
          this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_HEIGHT, size2.height);
        } else {
          this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_WIDTH, size2.width);
        }
      }
      this.setEditorHidden(true);
    } else {
      this.setEditorHidden(false);
      this.workbenchGrid.resizeView(this.panelPartView, {
        width: isHorizontal(panelPosition) ? size2.width : this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_WIDTH),
        height: isHorizontal(panelPosition) ? this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_HEIGHT) : size2.height
      });
    }
    this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_WAS_LAST_MAXIMIZED, maximize);
  }
  panelOpensMaximized() {
    if (this.getPanelAlignment() !== "center" && isHorizontal(this.getPanelPosition())) {
      return false;
    }
    const panelOpensMaximized = partOpensMaximizedFromString(this.configurationService.getValue("workbench.panel.opensMaximized" /* PANEL_OPENS_MAXIMIZED */));
    const panelLastIsMaximized = this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_WAS_LAST_MAXIMIZED);
    return panelOpensMaximized === PartOpensMaximizedOptions.ALWAYS || panelOpensMaximized === PartOpensMaximizedOptions.REMEMBER_LAST && panelLastIsMaximized;
  }
  setAuxiliaryBarHidden(hidden, skipLayout) {
    if (hidden && this.setAuxiliaryBarMaximized(false) && !this.isVisible(Parts.AUXILIARYBAR_PART)) {
      return;
    }
    this.stateModel.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN, hidden);
    if (hidden) {
      this.mainContainer.classList.add("noauxiliarybar" /* AUXILIARYBAR_HIDDEN */);
    } else {
      this.mainContainer.classList.remove("noauxiliarybar" /* AUXILIARYBAR_HIDDEN */);
    }
    this.workbenchGrid.setViewVisible(this.auxiliaryBarPartView, !hidden);
    if (hidden && this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)) {
      this.paneCompositeService.hideActivePaneComposite(ViewContainerLocation.AuxiliaryBar);
      this.focusPanelOrEditor();
    } else if (!hidden && !this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)) {
      let viewletToOpen = this.paneCompositeService.getLastActivePaneCompositeId(ViewContainerLocation.AuxiliaryBar);
      if (!viewletToOpen || !this.hasViews(viewletToOpen)) {
        viewletToOpen = this.viewDescriptorService.getViewContainersByLocation(ViewContainerLocation.AuxiliaryBar).find((viewContainer) => this.hasViews(viewContainer.id))?.id;
      }
      if (viewletToOpen) {
        this.openViewContainer(ViewContainerLocation.AuxiliaryBar, viewletToOpen, !skipLayout);
      }
    }
  }
  setPartHidden(hidden, part) {
    switch (part) {
      case Parts.ACTIVITYBAR_PART:
        return this.setActivityBarHidden(hidden);
      case Parts.SIDEBAR_PART:
        return this.setSideBarHidden(hidden);
      case Parts.EDITOR_PART:
        return this.setEditorHidden(hidden);
      case Parts.BANNER_PART:
        return this.setBannerHidden(hidden);
      case Parts.AUXILIARYBAR_PART:
        return this.setAuxiliaryBarHidden(hidden);
      case Parts.PANEL_PART:
        return this.setPanelHidden(hidden);
    }
  }
  toggleSecondarySideBar() {
    const visible = !this.isSecondarySideBarVisible();
    this.setPartHidden(!visible, Parts.AUXILIARYBAR_PART);
    alert(visible ? localize("auxiliaryBarVisible", "Secondary Side Bar shown") : localize("auxiliaryBarHidden", "Secondary Side Bar hidden"));
  }
  isSecondarySideBarVisible() {
    return this.isVisible(Parts.AUXILIARYBAR_PART);
  }
  hasMainWindowBorder() {
    return this.state.runtime.mainWindowBorder;
  }
  getMainWindowBorderRadius() {
    return this.state.runtime.mainWindowBorder && isMacintosh ? "10px" : void 0;
  }
  getSideBarPosition() {
    return this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON);
  }
  getPanelAlignment() {
    return this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_ALIGNMENT);
  }
  updateMenubarVisibility(skipLayout) {
    const shouldShowTitleBar = shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled);
    if (!skipLayout && this.workbenchGrid && shouldShowTitleBar !== this.isVisible(Parts.TITLEBAR_PART, mainWindow)) {
      this.workbenchGrid.setViewVisible(this.titleBarPartView, shouldShowTitleBar);
    }
  }
  updateCustomTitleBarVisibility() {
    const shouldShowTitleBar = shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled);
    const titlebarVisible = this.isVisible(Parts.TITLEBAR_PART);
    if (shouldShowTitleBar !== titlebarVisible) {
      this.workbenchGrid.setViewVisible(this.titleBarPartView, shouldShowTitleBar);
    }
  }
  updateTopWindowEdgeClass() {
    this.mainContainer.classList.toggle("top-window-edge" /* TOP_WINDOW_EDGE */, isFloatingTopEdgeExposed(this, mainWindow));
  }
  toggleMenuBar() {
    let currentVisibilityValue = getMenuBarVisibility(this.configurationService);
    if (typeof currentVisibilityValue !== "string") {
      currentVisibilityValue = "classic";
    }
    let newVisibilityValue;
    if (currentVisibilityValue === "visible" || currentVisibilityValue === "classic") {
      newVisibilityValue = hasNativeMenu(this.configurationService) ? "toggle" : "compact";
    } else {
      newVisibilityValue = "classic";
    }
    this.configurationService.updateValue(MenuSettings.MenuBarVisibility, newVisibilityValue);
  }
  getPanelPosition() {
    return this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_POSITION);
  }
  setPanelPosition(position) {
    if (!this.isVisible(Parts.PANEL_PART)) {
      this.setPanelHidden(false);
    }
    const panelPart = this.getPart(Parts.PANEL_PART);
    const oldPositionValue = positionToString(this.getPanelPosition());
    const newPositionValue = positionToString(position);
    const panelContainer = assertReturnsDefined(panelPart.getContainer());
    panelContainer.classList.remove(oldPositionValue);
    panelContainer.classList.add(newPositionValue);
    this.mainContainer.classList.remove(`panel-position-${oldPositionValue}`);
    this.mainContainer.classList.add(`panel-position-${newPositionValue}`);
    panelPart.updateStyles();
    const size2 = this.workbenchGrid.getViewSize(this.panelPartView);
    const sideBarSize = this.workbenchGrid.getViewSize(this.sideBarPartView);
    const auxiliaryBarSize = this.workbenchGrid.getViewSize(this.auxiliaryBarPartView);
    let editorHidden = !this.isVisible(Parts.EDITOR_PART, mainWindow);
    if (newPositionValue !== oldPositionValue && !editorHidden) {
      if (isHorizontal(position)) {
        this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_WIDTH, size2.width);
      } else if (isHorizontal(positionFromString(oldPositionValue))) {
        this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_HEIGHT, size2.height);
      }
    }
    if (isHorizontal(position) && this.getPanelAlignment() !== "center" && editorHidden) {
      this.toggleMaximizedPanel();
      editorHidden = false;
    }
    this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_POSITION, position);
    const sideBarVisible = this.isVisible(Parts.SIDEBAR_PART);
    const auxiliaryBarVisible = this.isVisible(Parts.AUXILIARYBAR_PART);
    const hadFocus = this.hasFocus(Parts.PANEL_PART);
    if (position === Position.BOTTOM) {
      this.workbenchGrid.moveView(this.panelPartView, editorHidden ? size2.height : this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_HEIGHT), this.editorPartView, Direction.Down);
    } else if (position === Position.TOP) {
      this.workbenchGrid.moveView(this.panelPartView, editorHidden ? size2.height : this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_HEIGHT), this.editorPartView, Direction.Up);
    } else if (position === Position.RIGHT) {
      this.workbenchGrid.moveView(this.panelPartView, editorHidden ? size2.width : this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_WIDTH), this.editorPartView, Direction.Right);
    } else {
      this.workbenchGrid.moveView(this.panelPartView, editorHidden ? size2.width : this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_WIDTH), this.editorPartView, Direction.Left);
    }
    if (hadFocus) {
      this.focusPart(Parts.PANEL_PART);
    }
    this.workbenchGrid.resizeView(this.sideBarPartView, sideBarSize);
    if (!sideBarVisible) {
      this.setSideBarHidden(true);
    }
    this.workbenchGrid.resizeView(this.auxiliaryBarPartView, auxiliaryBarSize);
    if (!auxiliaryBarVisible) {
      this.setAuxiliaryBarHidden(true);
    }
    if (isHorizontal(position)) {
      this.adjustPartPositions(this.getSideBarPosition(), this.getPanelAlignment(), position);
    }
    this._onDidChangePanelPosition.fire(newPositionValue);
  }
  isWindowMaximized(targetWindow) {
    return this.state.runtime.maximized.has(getWindowId(targetWindow));
  }
  updateWindowMaximizedState(targetWindow, maximized) {
    this.mainContainer.classList.toggle("maximized" /* MAXIMIZED */, maximized);
    const targetWindowId = getWindowId(targetWindow);
    if (maximized === this.state.runtime.maximized.has(targetWindowId)) {
      return;
    }
    if (maximized) {
      this.state.runtime.maximized.add(targetWindowId);
    } else {
      this.state.runtime.maximized.delete(targetWindowId);
    }
    this.updateWindowBorder();
    this._onDidChangeWindowMaximized.fire({ windowId: targetWindowId, maximized });
  }
  getVisibleNeighborPart(part, direction) {
    if (!this.workbenchGrid) {
      return void 0;
    }
    if (!this.isVisible(part, mainWindow)) {
      return void 0;
    }
    const neighborViews = this.workbenchGrid.getNeighborViews(this.getPart(part), direction, false);
    if (!neighborViews) {
      return void 0;
    }
    for (const neighborView of neighborViews) {
      const neighborPart = [Parts.ACTIVITYBAR_PART, Parts.EDITOR_PART, Parts.PANEL_PART, Parts.AUXILIARYBAR_PART, Parts.SIDEBAR_PART, Parts.STATUSBAR_PART, Parts.TITLEBAR_PART].find((partId) => this.getPart(partId) === neighborView && this.isVisible(partId, mainWindow));
      if (neighborPart !== void 0) {
        return neighborPart;
      }
    }
    return void 0;
  }
  onDidChangeWCO() {
    const bannerFirst = this.workbenchGrid.getNeighborViews(this.titleBarPartView, Direction.Up, false).length > 0;
    const shouldBannerBeFirst = this.shouldShowBannerFirst();
    if (bannerFirst !== shouldBannerBeFirst) {
      this.workbenchGrid.moveView(this.bannerPartView, Sizing.Distribute, this.titleBarPartView, shouldBannerBeFirst ? Direction.Up : Direction.Down);
    }
    this.workbenchGrid.setViewVisible(this.titleBarPartView, shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled));
  }
  arrangeEditorNodes(nodes, availableHeight, availableWidth) {
    if (!nodes.sideBar && !nodes.auxiliaryBar) {
      nodes.editor.size = availableHeight;
      return nodes.editor;
    }
    const result = [nodes.editor];
    nodes.editor.size = availableWidth;
    if (nodes.sideBar) {
      if (this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON) === Position.LEFT) {
        result.splice(0, 0, nodes.sideBar);
      } else {
        result.push(nodes.sideBar);
      }
      nodes.editor.size -= this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN) ? 0 : nodes.sideBar.size;
    }
    if (nodes.auxiliaryBar) {
      if (this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON) === Position.RIGHT) {
        result.splice(0, 0, nodes.auxiliaryBar);
      } else {
        result.push(nodes.auxiliaryBar);
      }
      nodes.editor.size -= this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN) ? 0 : nodes.auxiliaryBar.size;
    }
    return {
      type: "branch",
      data: result,
      size: availableHeight,
      visible: result.some((node) => node.visible)
    };
  }
  arrangeMiddleSectionNodes(nodes, availableWidth, availableHeight) {
    const activityBarSize = this.stateModel.getRuntimeValue(LayoutStateKeys.ACTIVITYBAR_HIDDEN) ? 0 : nodes.activityBar.size;
    const sideBarSize = this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN) ? 0 : nodes.sideBar.size;
    const auxiliaryBarSize = this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN) ? 0 : nodes.auxiliaryBar.size;
    const panelSize = this.stateModel.getInitializationValue(LayoutStateKeys.PANEL_SIZE) ? 0 : nodes.panel.size;
    const panelPostion = this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_POSITION);
    const sideBarPosition = this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON);
    const result = [];
    if (!isHorizontal(panelPostion)) {
      result.push(nodes.editor);
      nodes.editor.size = availableWidth - activityBarSize - sideBarSize - panelSize - auxiliaryBarSize;
      if (panelPostion === Position.RIGHT) {
        result.push(nodes.panel);
      } else {
        result.splice(0, 0, nodes.panel);
      }
      if (sideBarPosition === Position.LEFT) {
        result.push(nodes.auxiliaryBar);
        result.splice(0, 0, nodes.sideBar);
        result.splice(0, 0, nodes.activityBar);
      } else {
        result.splice(0, 0, nodes.auxiliaryBar);
        result.push(nodes.sideBar);
        result.push(nodes.activityBar);
      }
    } else {
      const panelAlignment = this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_ALIGNMENT);
      const sideBarNextToEditor = !(panelAlignment === "center" || sideBarPosition === Position.LEFT && panelAlignment === "right" || sideBarPosition === Position.RIGHT && panelAlignment === "left");
      const auxiliaryBarNextToEditor = !(panelAlignment === "center" || sideBarPosition === Position.RIGHT && panelAlignment === "right" || sideBarPosition === Position.LEFT && panelAlignment === "left");
      const editorSectionWidth = availableWidth - activityBarSize - (sideBarNextToEditor ? 0 : sideBarSize) - (auxiliaryBarNextToEditor ? 0 : auxiliaryBarSize);
      const editorNodes = this.arrangeEditorNodes({
        editor: nodes.editor,
        sideBar: sideBarNextToEditor ? nodes.sideBar : void 0,
        auxiliaryBar: auxiliaryBarNextToEditor ? nodes.auxiliaryBar : void 0
      }, availableHeight - panelSize, editorSectionWidth);
      const data = panelPostion === Position.BOTTOM ? [editorNodes, nodes.panel] : [nodes.panel, editorNodes];
      result.push({
        type: "branch",
        data,
        size: editorSectionWidth,
        visible: data.some((node) => node.visible)
      });
      if (!sideBarNextToEditor) {
        if (sideBarPosition === Position.LEFT) {
          result.splice(0, 0, nodes.sideBar);
        } else {
          result.push(nodes.sideBar);
        }
      }
      if (!auxiliaryBarNextToEditor) {
        if (sideBarPosition === Position.RIGHT) {
          result.splice(0, 0, nodes.auxiliaryBar);
        } else {
          result.push(nodes.auxiliaryBar);
        }
      }
      if (sideBarPosition === Position.LEFT) {
        result.splice(0, 0, nodes.activityBar);
      } else {
        result.push(nodes.activityBar);
      }
    }
    return result;
  }
  createGridDescriptor() {
    const { width, height } = this._mainContainerDimension;
    const sideBarSize = this.stateModel.getInitializationValue(LayoutStateKeys.SIDEBAR_SIZE);
    const auxiliaryBarSize = this.stateModel.getInitializationValue(LayoutStateKeys.AUXILIARYBAR_SIZE);
    const panelSize = this.stateModel.getInitializationValue(LayoutStateKeys.PANEL_SIZE);
    const titleBarHeight = this.titleBarPartView.minimumHeight;
    const bannerHeight = this.bannerPartView.minimumHeight;
    const statusBarHeight = this.statusBarPartView.minimumHeight;
    const activityBarWidth = this.activityBarPartView.minimumWidth;
    const middleSectionHeight = height - titleBarHeight - statusBarHeight;
    const titleAndBanner = [
      {
        type: "leaf",
        data: { type: Parts.TITLEBAR_PART },
        size: titleBarHeight,
        visible: this.isVisible(Parts.TITLEBAR_PART, mainWindow)
      },
      {
        type: "leaf",
        data: { type: Parts.BANNER_PART },
        size: bannerHeight,
        visible: false
      }
    ];
    const activityBarNode = {
      type: "leaf",
      data: { type: Parts.ACTIVITYBAR_PART },
      size: activityBarWidth,
      visible: !this.stateModel.getRuntimeValue(LayoutStateKeys.ACTIVITYBAR_HIDDEN)
    };
    const sideBarNode = {
      type: "leaf",
      data: { type: Parts.SIDEBAR_PART },
      size: sideBarSize,
      visible: !this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN)
    };
    const auxiliaryBarNode = {
      type: "leaf",
      data: { type: Parts.AUXILIARYBAR_PART },
      size: auxiliaryBarSize,
      visible: this.isVisible(Parts.AUXILIARYBAR_PART)
    };
    const editorNode = {
      type: "leaf",
      data: { type: Parts.EDITOR_PART },
      size: 0,
      // Update based on sibling sizes
      visible: !this.stateModel.getRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN)
    };
    const panelNode = {
      type: "leaf",
      data: { type: Parts.PANEL_PART },
      size: panelSize,
      visible: !this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN)
    };
    const middleSection = this.arrangeMiddleSectionNodes({
      activityBar: activityBarNode,
      auxiliaryBar: auxiliaryBarNode,
      editor: editorNode,
      panel: panelNode,
      sideBar: sideBarNode
    }, width, middleSectionHeight);
    const result = {
      root: {
        type: "branch",
        size: width,
        data: [
          ...this.shouldShowBannerFirst() ? titleAndBanner.reverse() : titleAndBanner,
          {
            type: "branch",
            data: middleSection,
            size: middleSectionHeight
          },
          {
            type: "leaf",
            data: { type: Parts.STATUSBAR_PART },
            size: statusBarHeight,
            visible: !this.stateModel.getRuntimeValue(LayoutStateKeys.STATUSBAR_HIDDEN)
          }
        ]
      },
      orientation: Orientation.VERTICAL,
      width,
      height
    };
    const layoutDescriptor = {
      activityBarVisible: !this.stateModel.getRuntimeValue(LayoutStateKeys.ACTIVITYBAR_HIDDEN),
      sideBarVisible: !this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN),
      auxiliaryBarVisible: !this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN),
      panelVisible: !this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN),
      statusbarVisible: !this.stateModel.getRuntimeValue(LayoutStateKeys.STATUSBAR_HIDDEN),
      sideBarPosition: positionToString(this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON)),
      panelPosition: positionToString(this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_POSITION))
    };
    this.telemetryService.publicLog2("startupLayout", layoutDescriptor);
    return result;
  }
  dispose() {
    super.dispose();
    this.disposed = true;
  }
}
function getZenModeConfiguration(configurationService) {
  return configurationService.getValue("zenMode" /* ZEN_MODE_CONFIG */);
}
class WorkbenchLayoutStateKey {
  constructor(name, scope, target, defaultValue) {
    this.name = name;
    this.scope = scope;
    this.target = target;
    this.defaultValue = defaultValue;
  }
}
class RuntimeStateKey extends WorkbenchLayoutStateKey {
  constructor(name, scope, target, defaultValue, zenModeIgnore) {
    super(name, scope, target, defaultValue);
    this.zenModeIgnore = zenModeIgnore;
    this.runtime = true;
  }
}
class InitializationStateKey extends WorkbenchLayoutStateKey {
  constructor() {
    super(...arguments);
    this.runtime = false;
  }
}
const LayoutStateKeys = {
  // Editor
  MAIN_EDITOR_CENTERED: new RuntimeStateKey("editor.centered", StorageScope.WORKSPACE, StorageTarget.MACHINE, false),
  // Zen Mode
  ZEN_MODE_ACTIVE: new RuntimeStateKey("zenMode.active", StorageScope.WORKSPACE, StorageTarget.MACHINE, false),
  ZEN_MODE_EXIT_INFO: new RuntimeStateKey("zenMode.exitInfo", StorageScope.WORKSPACE, StorageTarget.MACHINE, {
    transitionedToCenteredEditorLayout: false,
    transitionedToFullScreen: false,
    handleNotificationsDoNotDisturbMode: false,
    wasVisible: {
      auxiliaryBar: false,
      panel: false,
      sideBar: false
    }
  }),
  // Part Sizing
  SIDEBAR_SIZE: new InitializationStateKey("sideBar.size", StorageScope.PROFILE, StorageTarget.MACHINE, 300),
  AUXILIARYBAR_SIZE: new InitializationStateKey("auxiliaryBar.size", StorageScope.PROFILE, StorageTarget.MACHINE, 300),
  PANEL_SIZE: new InitializationStateKey("panel.size", StorageScope.PROFILE, StorageTarget.MACHINE, 300),
  // Part State
  PANEL_LAST_NON_MAXIMIZED_HEIGHT: new RuntimeStateKey("panel.lastNonMaximizedHeight", StorageScope.PROFILE, StorageTarget.MACHINE, 300),
  PANEL_LAST_NON_MAXIMIZED_WIDTH: new RuntimeStateKey("panel.lastNonMaximizedWidth", StorageScope.PROFILE, StorageTarget.MACHINE, 300),
  PANEL_WAS_LAST_MAXIMIZED: new RuntimeStateKey("panel.wasLastMaximized", StorageScope.WORKSPACE, StorageTarget.MACHINE, false),
  AUXILIARYBAR_WAS_LAST_MAXIMIZED: new RuntimeStateKey("auxiliaryBar.wasLastMaximized", StorageScope.WORKSPACE, StorageTarget.MACHINE, false),
  AUXILIARYBAR_LAST_NON_MAXIMIZED_SIZE: new RuntimeStateKey("auxiliaryBar.lastNonMaximizedSize", StorageScope.PROFILE, StorageTarget.MACHINE, 300),
  AUXILIARYBAR_LAST_NON_MAXIMIZED_VISIBILITY: new RuntimeStateKey("auxiliaryBar.lastNonMaximizedVisibility", StorageScope.WORKSPACE, StorageTarget.MACHINE, {
    sideBarVisible: false,
    editorVisible: false,
    panelVisible: false,
    auxiliaryBarVisible: false
  }),
  AUXILIARYBAR_EMPTY: new InitializationStateKey("auxiliaryBar.empty", StorageScope.PROFILE, StorageTarget.MACHINE, false),
  // Part Positions
  SIDEBAR_POSITON: new RuntimeStateKey("sideBar.position", StorageScope.WORKSPACE, StorageTarget.MACHINE, Position.LEFT),
  PANEL_POSITION: new RuntimeStateKey("panel.position", StorageScope.WORKSPACE, StorageTarget.MACHINE, Position.BOTTOM),
  PANEL_ALIGNMENT: new RuntimeStateKey("panel.alignment", StorageScope.PROFILE, StorageTarget.USER, "center"),
  // Part Visibility
  ACTIVITYBAR_HIDDEN: new RuntimeStateKey("activityBar.hidden", StorageScope.WORKSPACE, StorageTarget.MACHINE, false, true),
  SIDEBAR_HIDDEN: new RuntimeStateKey("sideBar.hidden", StorageScope.WORKSPACE, StorageTarget.MACHINE, false),
  EDITOR_HIDDEN: new RuntimeStateKey("editor.hidden", StorageScope.WORKSPACE, StorageTarget.MACHINE, false),
  PANEL_HIDDEN: new RuntimeStateKey("panel.hidden", StorageScope.WORKSPACE, StorageTarget.MACHINE, true),
  AUXILIARYBAR_HIDDEN: new RuntimeStateKey("auxiliaryBar.hidden", StorageScope.WORKSPACE, StorageTarget.MACHINE, true),
  STATUSBAR_HIDDEN: new RuntimeStateKey("statusBar.hidden", StorageScope.WORKSPACE, StorageTarget.MACHINE, false, true)
};
var WorkbenchLayoutSettings = /* @__PURE__ */ ((WorkbenchLayoutSettings2) => {
  WorkbenchLayoutSettings2["AUXILIARYBAR_DEFAULT_VISIBILITY"] = "workbench.secondarySideBar.defaultVisibility";
  WorkbenchLayoutSettings2["AUXILIARYBAR_FORCE_MAXIMIZED"] = "workbench.secondarySideBar.forceMaximized";
  WorkbenchLayoutSettings2["ACTIVITY_BAR_VISIBLE"] = "workbench.activityBar.visible";
  WorkbenchLayoutSettings2["PANEL_POSITION"] = "workbench.panel.defaultLocation";
  WorkbenchLayoutSettings2["PANEL_OPENS_MAXIMIZED"] = "workbench.panel.opensMaximized";
  WorkbenchLayoutSettings2["ZEN_MODE_CONFIG"] = "zenMode";
  WorkbenchLayoutSettings2["EDITOR_CENTERED_LAYOUT_AUTO_RESIZE"] = "workbench.editor.centeredLayoutAutoResize";
  WorkbenchLayoutSettings2["EDITOR_RESTORE_EDITORS"] = "workbench.editor.restoreEditors";
  return WorkbenchLayoutSettings2;
})(WorkbenchLayoutSettings || {});
var LegacyWorkbenchLayoutSettings = /* @__PURE__ */ ((LegacyWorkbenchLayoutSettings2) => {
  LegacyWorkbenchLayoutSettings2["STATUSBAR_VISIBLE"] = "workbench.statusBar.visible";
  LegacyWorkbenchLayoutSettings2["SIDEBAR_POSITION"] = "workbench.sideBar.location";
  return LegacyWorkbenchLayoutSettings2;
})(LegacyWorkbenchLayoutSettings || {});
const _LayoutStateModel = class _LayoutStateModel extends Disposable {
  constructor(storageService, configurationService, contextService, environmentService) {
    super();
    this.storageService = storageService;
    this.configurationService = configurationService;
    this.contextService = contextService;
    this.environmentService = environmentService;
    this._onDidChangeState = this._register(new Emitter());
    this.onDidChangeState = this._onDidChangeState.event;
    this.stateCache = /* @__PURE__ */ new Map();
    this.isNew = {
      [StorageScope.WORKSPACE]: this.storageService.isNew(StorageScope.WORKSPACE),
      [StorageScope.PROFILE]: this.storageService.isNew(StorageScope.PROFILE),
      [StorageScope.APPLICATION]: this.storageService.isNew(StorageScope.APPLICATION),
      [StorageScope.APPLICATION_SHARED]: this.storageService.isNew(StorageScope.APPLICATION_SHARED)
    };
    this._register(this.configurationService.onDidChangeConfiguration((configurationChange) => this.updateStateFromLegacySettings(configurationChange)));
  }
  updateStateFromLegacySettings(configurationChangeEvent) {
    if (configurationChangeEvent.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION)) {
      this.setRuntimeValueAndFire(LayoutStateKeys.ACTIVITYBAR_HIDDEN, this.isActivityBarHidden());
    }
    if (configurationChangeEvent.affectsConfiguration("workbench.statusBar.visible" /* STATUSBAR_VISIBLE */)) {
      this.setRuntimeValueAndFire(LayoutStateKeys.STATUSBAR_HIDDEN, !this.configurationService.getValue("workbench.statusBar.visible" /* STATUSBAR_VISIBLE */));
    }
    if (configurationChangeEvent.affectsConfiguration("workbench.sideBar.location" /* SIDEBAR_POSITION */)) {
      this.setRuntimeValueAndFire(LayoutStateKeys.SIDEBAR_POSITON, positionFromString(this.configurationService.getValue("workbench.sideBar.location" /* SIDEBAR_POSITION */) ?? "left"));
    }
  }
  updateLegacySettingsFromState(key, value) {
    const isZenMode = this.getRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE);
    if (key.zenModeIgnore && isZenMode) {
      return;
    }
    if (key === LayoutStateKeys.ACTIVITYBAR_HIDDEN) {
      this.configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, value ? ActivityBarPosition.HIDDEN : void 0);
    } else if (key === LayoutStateKeys.STATUSBAR_HIDDEN) {
      this.configurationService.updateValue("workbench.statusBar.visible" /* STATUSBAR_VISIBLE */, !value);
    } else if (key === LayoutStateKeys.SIDEBAR_POSITON) {
      this.configurationService.updateValue("workbench.sideBar.location" /* SIDEBAR_POSITION */, positionToString(value));
    }
  }
  load(configuration) {
    let key;
    if (!configuration.resetLayout) {
      for (key in LayoutStateKeys) {
        const stateKey = LayoutStateKeys[key];
        const value = this.loadKeyFromStorage(stateKey);
        if (value !== void 0) {
          this.stateCache.set(stateKey.name, value);
        }
      }
    }
    this.stateCache.set(LayoutStateKeys.ACTIVITYBAR_HIDDEN.name, this.isActivityBarHidden());
    this.stateCache.set(LayoutStateKeys.STATUSBAR_HIDDEN.name, !this.configurationService.getValue("workbench.statusBar.visible" /* STATUSBAR_VISIBLE */));
    this.stateCache.set(LayoutStateKeys.SIDEBAR_POSITON.name, positionFromString(this.configurationService.getValue("workbench.sideBar.location" /* SIDEBAR_POSITION */) ?? "left"));
    const auxiliaryBarForceMaximized = this.configurationService.getValue("workbench.secondarySideBar.forceMaximized" /* AUXILIARYBAR_FORCE_MAXIMIZED */);
    const workbenchState = this.contextService.getWorkbenchState();
    const mainContainerDimension = configuration.mainContainerDimension;
    LayoutStateKeys.SIDEBAR_SIZE.defaultValue = Math.min(300, mainContainerDimension.width / 4);
    LayoutStateKeys.SIDEBAR_HIDDEN.defaultValue = workbenchState === WorkbenchState.EMPTY || auxiliaryBarForceMaximized === true;
    LayoutStateKeys.AUXILIARYBAR_SIZE.defaultValue = auxiliaryBarForceMaximized ? Math.max(300, mainContainerDimension.width / 2) : Math.min(300, mainContainerDimension.width / 4);
    LayoutStateKeys.AUXILIARYBAR_HIDDEN.defaultValue = (() => {
      if (isWeb && !this.environmentService.remoteAuthority) {
        return true;
      }
      if (auxiliaryBarForceMaximized === true) {
        return false;
      }
      const configuration2 = this.configurationService.inspect("workbench.secondarySideBar.defaultVisibility" /* AUXILIARYBAR_DEFAULT_VISIBILITY */);
      if (configuration2.defaultValue !== "hidden" && !isConfigured(configuration2) && this.stateCache.get(LayoutStateKeys.AUXILIARYBAR_EMPTY.name)) {
        return true;
      }
      if (this.isNew[StorageScope.APPLICATION] && configuration2.value !== "hidden" && !this.configurationService.getValue(ChatAIDisabledSettingId)) {
        return false;
      }
      switch (configuration2.value) {
        case "hidden":
          return true;
        case "visibleInWorkspace":
        case "maximizedInWorkspace":
          return workbenchState === WorkbenchState.EMPTY;
        default:
          return false;
      }
    })();
    LayoutStateKeys.PANEL_SIZE.defaultValue = this.stateCache.get(LayoutStateKeys.PANEL_POSITION.name) ?? isHorizontal(LayoutStateKeys.PANEL_POSITION.defaultValue) ? mainContainerDimension.height / 3 : mainContainerDimension.width / 4;
    LayoutStateKeys.PANEL_POSITION.defaultValue = positionFromString(this.configurationService.getValue("workbench.panel.defaultLocation" /* PANEL_POSITION */) ?? "bottom");
    for (key in LayoutStateKeys) {
      const stateKey = LayoutStateKeys[key];
      if (this.stateCache.get(stateKey.name) === void 0) {
        this.stateCache.set(stateKey.name, stateKey.defaultValue);
      }
    }
    this.applyOverrides(configuration);
    this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, void 0, this._store)((storageChangeEvent) => {
      let key2;
      for (key2 in LayoutStateKeys) {
        const stateKey = LayoutStateKeys[key2];
        if (stateKey instanceof RuntimeStateKey && stateKey.scope === StorageScope.PROFILE && stateKey.target === StorageTarget.USER) {
          if (`${_LayoutStateModel.STORAGE_PREFIX}${stateKey.name}` === storageChangeEvent.key) {
            const value = this.loadKeyFromStorage(stateKey) ?? stateKey.defaultValue;
            if (this.stateCache.get(stateKey.name) !== value) {
              this.stateCache.set(stateKey.name, value);
              this._onDidChangeState.fire({ key: stateKey, value });
            }
          }
        }
      }
    }));
  }
  applyOverrides(configuration) {
    if (this.isNew[StorageScope.WORKSPACE]) {
      const defaultAuxiliaryBarVisibility = this.configurationService.getValue("workbench.secondarySideBar.defaultVisibility" /* AUXILIARYBAR_DEFAULT_VISIBILITY */);
      const startupEditor = this.configurationService.getValue("workbench.startupEditor");
      if (startupEditor === "agentSessionsWelcomePage") {
        this.applyAuxiliaryBarHiddenOverride(true);
      } else if (defaultAuxiliaryBarVisibility === "maximized" || defaultAuxiliaryBarVisibility === "maximizedInWorkspace" && this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY) {
        this.applyAuxiliaryBarMaximizedOverride();
      }
    }
    if (this.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN) && this.getRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN) && !this.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_WAS_LAST_MAXIMIZED)) {
      this.setRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN, false);
    }
    if (this.isNew[StorageScope.WORKSPACE] && configuration.mainContainerDimension.width <= DEFAULT_WORKSPACE_WINDOW_DIMENSIONS.width) {
      this.setInitializationValue(LayoutStateKeys.SIDEBAR_SIZE, Math.min(300, configuration.mainContainerDimension.width / 4));
      this.setInitializationValue(LayoutStateKeys.AUXILIARYBAR_SIZE, Math.min(300, configuration.mainContainerDimension.width / 4));
    }
  }
  applyAuxiliaryBarMaximizedOverride() {
    this.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_LAST_NON_MAXIMIZED_VISIBILITY, {
      sideBarVisible: !this.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN),
      panelVisible: !this.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN),
      editorVisible: !this.getRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN),
      auxiliaryBarVisible: !this.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN)
    });
    this.setRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN, true);
    this.setRuntimeValue(LayoutStateKeys.PANEL_HIDDEN, true);
    this.setRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN, true);
    this.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN, false);
    this.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_LAST_NON_MAXIMIZED_SIZE, this.getInitializationValue(LayoutStateKeys.AUXILIARYBAR_SIZE));
    this.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_WAS_LAST_MAXIMIZED, true);
  }
  applyAuxiliaryBarHiddenOverride(value) {
    this.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN, value);
  }
  save(workspace, global) {
    let key;
    const isZenMode = this.getRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE);
    for (key in LayoutStateKeys) {
      const stateKey = LayoutStateKeys[key];
      if (workspace && stateKey.scope === StorageScope.WORKSPACE || global && stateKey.scope === StorageScope.PROFILE) {
        if (isZenMode && stateKey instanceof RuntimeStateKey && stateKey.zenModeIgnore) {
          continue;
        }
        this.saveKeyToStorage(stateKey);
      }
    }
  }
  getInitializationValue(key) {
    return this.stateCache.get(key.name);
  }
  setInitializationValue(key, value) {
    this.stateCache.set(key.name, value);
  }
  getRuntimeValue(key, fallbackToSetting) {
    if (fallbackToSetting) {
      switch (key) {
        case LayoutStateKeys.ACTIVITYBAR_HIDDEN:
          this.stateCache.set(key.name, this.isActivityBarHidden());
          break;
        case LayoutStateKeys.STATUSBAR_HIDDEN:
          this.stateCache.set(key.name, !this.configurationService.getValue("workbench.statusBar.visible" /* STATUSBAR_VISIBLE */));
          break;
        case LayoutStateKeys.SIDEBAR_POSITON:
          this.stateCache.set(key.name, this.configurationService.getValue("workbench.sideBar.location" /* SIDEBAR_POSITION */) ?? "left");
          break;
      }
    }
    return this.stateCache.get(key.name);
  }
  setRuntimeValue(key, value) {
    this.stateCache.set(key.name, value);
    const isZenMode = this.getRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE);
    if (key.scope === StorageScope.PROFILE) {
      if (!isZenMode || !key.zenModeIgnore) {
        this.saveKeyToStorage(key);
        this.updateLegacySettingsFromState(key, value);
      }
    }
  }
  isActivityBarHidden() {
    const oldValue = this.configurationService.getValue("workbench.activityBar.visible" /* ACTIVITY_BAR_VISIBLE */);
    if (oldValue !== void 0) {
      return !oldValue;
    }
    return this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION) !== ActivityBarPosition.DEFAULT;
  }
  setRuntimeValueAndFire(key, value) {
    const previousValue = this.stateCache.get(key.name);
    if (previousValue === value) {
      return;
    }
    this.setRuntimeValue(key, value);
    this._onDidChangeState.fire({ key, value });
  }
  saveKeyToStorage(key) {
    const value = this.stateCache.get(key.name);
    this.storageService.store(`${_LayoutStateModel.STORAGE_PREFIX}${key.name}`, typeof value === "object" ? JSON.stringify(value) : value, key.scope, key.target);
  }
  loadKeyFromStorage(key) {
    const value = this.storageService.get(`${_LayoutStateModel.STORAGE_PREFIX}${key.name}`, key.scope);
    if (value !== void 0) {
      this.isNew[key.scope] = false;
      switch (typeof key.defaultValue) {
        case "boolean":
          return value === "true";
        case "number":
          return parseInt(value);
        case "object":
          return JSON.parse(value);
      }
    }
    return value;
  }
};
_LayoutStateModel.STORAGE_PREFIX = "workbench.";
let LayoutStateModel = _LayoutStateModel;
export {
  Layout,
  TITLE_BAR_SETTINGS
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXGxheW91dC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGFsZXJ0IH0gZnJvbSAnLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBFdmVudFR5cGUsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgZ2V0Q2xpZW50QXJlYSwgc2l6ZSwgSURpbWVuc2lvbiwgaXNBbmNlc3RvclVzaW5nRmxvd1RvLCBjb21wdXRlU2NyZWVuQXdhcmVTaXplLCBnZXRBY3RpdmVEb2N1bWVudCwgZ2V0V2luZG93cywgZ2V0QWN0aXZlV2luZG93LCBpc0FjdGl2ZURvY3VtZW50LCBnZXRXaW5kb3csIGdldFdpbmRvd0lkLCBnZXRBY3RpdmVFbGVtZW50LCBEaW1lbnNpb24gfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IG9uRGlkQ2hhbmdlRnVsbHNjcmVlbiwgaXNGdWxsc2NyZWVuLCBpc1dDT0VuYWJsZWQgfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvYnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MsIGlzTGludXgsIGlzTWFjaW50b3NoLCBpc1dlYiwgaXNJT1MgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dENhcGFiaWxpdGllcywgR3JvdXBJZGVudGlmaWVyLCBpc1Jlc291cmNlRWRpdG9ySW5wdXQsIElVbnR5cGVkRWRpdG9ySW5wdXQsIHBhdGhzVG9FZGl0b3JzIH0gZnJvbSAnLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBTaWRlYmFyUGFydCB9IGZyb20gJy4vcGFydHMvc2lkZWJhci9zaWRlYmFyUGFydC5qcyc7XG5pbXBvcnQgeyBQYW5lbFBhcnQgfSBmcm9tICcuL3BhcnRzL3BhbmVsL3BhbmVsUGFydC5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiwgUGFydHMsIFBhcnRPcGVuc01heGltaXplZE9wdGlvbnMsIElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBwb3NpdGlvbkZyb21TdHJpbmcsIHBvc2l0aW9uVG9TdHJpbmcsIHBhcnRPcGVuc01heGltaXplZEZyb21TdHJpbmcsIFBhbmVsQWxpZ25tZW50LCBBY3Rpdml0eUJhclBvc2l0aW9uLCBMYXlvdXRTZXR0aW5ncywgTVVMVElfV0lORE9XX1BBUlRTLCBTSU5HTEVfV0lORE9XX1BBUlRTLCBaZW5Nb2RlU2V0dGluZ3MsIEVkaXRvclRhYnNNb2RlLCBFZGl0b3JBY3Rpb25zTG9jYXRpb24sIHNob3VsZFNob3dDdXN0b21UaXRsZUJhciwgaXNIb3Jpem9udGFsLCBpc011bHRpV2luZG93UGFydCwgSVBhcnRWaXNpYmlsaXR5Q2hhbmdlRXZlbnQsIGlzRmxvYXRpbmdUb3BFZGdlRXhwb3NlZCB9IGZyb20gJy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNUZW1wb3JhcnlXb3Jrc3BhY2UsIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgV29ya2JlbmNoU3RhdGUgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBpc0NvbmZpZ3VyZWQgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENoYXRBSURpc2FibGVkU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vY2hhdC9jb21tb24vY2hhdFNldHRpbmdzLmpzJztcbmltcG9ydCB7IElUaXRsZVNlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlcy90aXRsZS9icm93c2VyL3RpdGxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTdGFydHVwS2luZCwgSUxpZmVjeWNsZVNlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBnZXRNZW51QmFyVmlzaWJpbGl0eSwgSVBhdGgsIGhhc05hdGl2ZVRpdGxlYmFyLCBoYXNDdXN0b21UaXRsZWJhciwgVGl0bGVCYXJTZXR0aW5nLCBDdXN0b21UaXRsZUJhclZpc2liaWxpdHksIHVzZVdpbmRvd0NvbnRyb2xzT3ZlcmxheSwgREVGQVVMVF9FTVBUWV9XSU5ET1dfU0laRSwgREVGQVVMVF9XT1JLU1BBQ0VfV0lORE9XX1NJWkUsIGhhc05hdGl2ZU1lbnUsIE1lbnVTZXR0aW5ncyB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvZW52aXJvbm1lbnQvYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yR3JvdXBMYXlvdXQsIEdyb3VwQWN0aXZhdGlvblJlYXNvbiwgR3JvdXBPcmllbnRhdGlvbiwgR3JvdXBzT3JkZXIsIElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlcmlhbGl6YWJsZUdyaWQsIElTZXJpYWxpemFibGVWaWV3LCBJU2VyaWFsaXplZEdyaWQsIE9yaWVudGF0aW9uLCBJU2VyaWFsaXplZE5vZGUsIElTZXJpYWxpemVkTGVhZk5vZGUsIERpcmVjdGlvbiwgSVZpZXdTaXplLCBTaXppbmcgfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZ3JpZC9ncmlkLmpzJztcbmltcG9ydCB7IFBhcnQgfSBmcm9tICcuL3BhcnQuanMnO1xuaW1wb3J0IHsgSVN0YXR1c2JhclNlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlcy9zdGF0dXNiYXIvYnJvd3Nlci9zdGF0dXNiYXIuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGlzQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0RlZmluZWQgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgTm90aWZpY2F0aW9uc0ZpbHRlciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzSGlnaENvbnRyYXN0IH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IFdJTkRPV19BQ1RJVkVfQk9SREVSLCBXSU5ET1dfSU5BQ1RJVkVfQk9SREVSIH0gZnJvbSAnLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IExpbmVOdW1iZXJzVHlwZSB9IGZyb20gJy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9ySW5wdXQgfSBmcm9tICcuLi9jb21tb24vZWRpdG9yL2RpZmZFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBtYXJrIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vcGVyZm9ybWFuY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCBQcm9taXNlcyB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElCYW5uZXJTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvYmFubmVyL2Jyb3dzZXIvYmFubmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvcGFuZWNvbXBvc2l0ZS9icm93c2VyL3BhbmVjb21wb3NpdGUuanMnO1xuaW1wb3J0IHsgQXV4aWxpYXJ5QmFyUGFydCB9IGZyb20gJy4vcGFydHMvYXV4aWxpYXJ5YmFyL2F1eGlsaWFyeUJhclBhcnQuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJQXV4aWxpYXJ5V2luZG93U2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL2F1eGlsaWFyeVdpbmRvdy9icm93c2VyL2F1eGlsaWFyeVdpbmRvd1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29kZVdpbmRvdywgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi9ubHMuanMnO1xuXG4vLyNyZWdpb24gTGF5b3V0IEltcGxlbWVudGF0aW9uXG5cbmludGVyZmFjZSBJTGF5b3V0UnVudGltZVN0YXRlIHtcblx0YWN0aXZlQ29udGFpbmVySWQ6IG51bWJlcjtcblx0bWFpbldpbmRvd0Z1bGxzY3JlZW46IGJvb2xlYW47XG5cdHJlYWRvbmx5IG1heGltaXplZDogU2V0PG51bWJlcj47XG5cdGhhc0ZvY3VzOiBib29sZWFuO1xuXHRtYWluV2luZG93Qm9yZGVyOiBib29sZWFuO1xuXHRyZWFkb25seSBtZW51QmFyOiB7XG5cdFx0dG9nZ2xlZDogYm9vbGVhbjtcblx0fTtcblx0cmVhZG9ubHkgemVuTW9kZToge1xuXHRcdHJlYWRvbmx5IHRyYW5zaXRpb25EaXNwb3NhYmxlczogRGlzcG9zYWJsZU1hcDxzdHJpbmcsIElEaXNwb3NhYmxlPjtcblx0fTtcbn1cblxuaW50ZXJmYWNlIElFZGl0b3JUb09wZW4ge1xuXHRyZWFkb25seSBlZGl0b3I6IElVbnR5cGVkRWRpdG9ySW5wdXQ7XG5cdHJlYWRvbmx5IHZpZXdDb2x1bW4/OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBJTGF5b3V0SW5pdGlhbGl6YXRpb25TdGF0ZSB7XG5cdHJlYWRvbmx5IHZpZXdzOiB7XG5cdFx0cmVhZG9ubHkgZGVmYXVsdHM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXHRcdHJlYWRvbmx5IGNvbnRhaW5lclRvUmVzdG9yZToge1xuXHRcdFx0c2lkZUJhcj86IHN0cmluZztcblx0XHRcdHBhbmVsPzogc3RyaW5nO1xuXHRcdFx0YXV4aWxpYXJ5QmFyPzogc3RyaW5nO1xuXHRcdH07XG5cdH07XG5cdHJlYWRvbmx5IGVkaXRvcjoge1xuXHRcdHJlYWRvbmx5IHJlc3RvcmVFZGl0b3JzOiBib29sZWFuO1xuXHRcdHJlYWRvbmx5IGVkaXRvcnNUb09wZW46IFByb21pc2U8SUVkaXRvclRvT3BlbltdPjtcblx0fTtcblx0cmVhZG9ubHkgbGF5b3V0Pzoge1xuXHRcdHJlYWRvbmx5IGVkaXRvcnM/OiBFZGl0b3JHcm91cExheW91dDtcblx0fTtcbn1cblxuaW50ZXJmYWNlIElMYXlvdXRTdGF0ZSB7XG5cdHJlYWRvbmx5IHJ1bnRpbWU6IElMYXlvdXRSdW50aW1lU3RhdGU7XG5cdHJlYWRvbmx5IGluaXRpYWxpemF0aW9uOiBJTGF5b3V0SW5pdGlhbGl6YXRpb25TdGF0ZTtcbn1cblxuZW51bSBMYXlvdXRDbGFzc2VzIHtcblx0U0lERUJBUl9ISURERU4gPSAnbm9zaWRlYmFyJyxcblx0TUFJTl9FRElUT1JfQVJFQV9ISURERU4gPSAnbm9tYWluZWRpdG9yYXJlYScsXG5cdFBBTkVMX0hJRERFTiA9ICdub3BhbmVsJyxcblx0QVVYSUxJQVJZQkFSX0hJRERFTiA9ICdub2F1eGlsaWFyeWJhcicsXG5cdEFDVElWSVRZQkFSX0hJRERFTiA9ICdub2FjdGl2aXR5YmFyJyxcblx0U1RBVFVTQkFSX0hJRERFTiA9ICdub3N0YXR1c2JhcicsXG5cdC8vIFNldCB3aGVuIG5vIGdyaWQgcm93IHNpdHMgYWJvdmUgdGhlIG1pZGRsZSBzZWN0aW9uIChib3RoIHRoZSB0aXRsZSBiYXIgYW5kIHRoZVxuXHQvLyBiYW5uZXIgYXJlIGhpZGRlbiksIHNvIHRoZSBmbG9hdGluZyBjYXJkcyBhYnV0IHRoZSB0b3Agd2luZG93IGVkZ2UuXG5cdFRPUF9XSU5ET1dfRURHRSA9ICd0b3Atd2luZG93LWVkZ2UnLFxuXHRGVUxMU0NSRUVOID0gJ2Z1bGxzY3JlZW4nLFxuXHRNQVhJTUlaRUQgPSAnbWF4aW1pemVkJyxcblx0V0lORE9XX0JPUkRFUiA9ICdib3JkZXInLFxuXHROT19TSEFET1dTID0gJ25vLXNoYWRvd3MnLFxuXHRGTE9BVElOR19QQU5FTFMgPSAnZmxvYXRpbmctcGFuZWxzJyxcblx0Ly8gUHJlc2VudGF0aW9uIGNsYXNzIGZvciB0aGUgTW9kZXJuIFVJIFVwZGF0ZSBleHBlcmltZW50LCBvd25lZC90b2dnbGVkIGF0XG5cdC8vIHJ1bnRpbWUgYnkgYFN0eWxlT3ZlcnJpZGVzQ29udHJpYnV0aW9uYC4gSXQgaXMgKmFsc28qIGFwcGxpZWQgaGVyZSBhdCByZW5kZXJcblx0Ly8gdGltZSAoc2VlIGBnZXRMYXlvdXRDbGFzc2VzYCkgdG8gYXZvaWQgYSBmbGFzaCBvZiB1bnN0eWxlZCB3b3JrYmVuY2ggY2hyb21lLlxuXHRTVFlMRV9PVkVSUklERSA9ICdzdHlsZS1vdmVycmlkZScsXG5cdC8vIE1vZHVsZS1zcGVjaWZpYyBnYXRlIHNoYXJlZCB3aXRoIHRoZSBBZ2VudHMgd29ya2JlbmNoLlxuXHRNT0RFUk5fVUlfVEFCUyA9ICdtb2Rlcm4tdWktdGFicydcbn1cblxuaW50ZXJmYWNlIElQYXRoVG9PcGVuIGV4dGVuZHMgSVBhdGgge1xuXHRyZWFkb25seSB2aWV3Q29sdW1uPzogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSUluaXRpYWxFZGl0b3JzU3RhdGUge1xuXHRyZWFkb25seSBmaWxlc1RvT3Blbk9yQ3JlYXRlPzogSVBhdGhUb09wZW5bXTtcblx0cmVhZG9ubHkgZmlsZXNUb0RpZmY/OiBJUGF0aFRvT3BlbltdO1xuXHRyZWFkb25seSBmaWxlc1RvTWVyZ2U/OiBJUGF0aFRvT3BlbltdO1xuXG5cdHJlYWRvbmx5IGxheW91dD86IEVkaXRvckdyb3VwTGF5b3V0O1xufVxuXG5jb25zdCBDT01NQU5EX0NFTlRFUl9TRVRUSU5HUyA9IFtcblx0J2NoYXQuYWdlbnRzQ29udHJvbC5lbmFibGVkJyxcblx0J2NoYXQudW5pZmllZEFnZW50c0Jhci5lbmFibGVkJyxcblx0J3dvcmtiZW5jaC5uYXZpZ2F0aW9uQ29udHJvbC5lbmFibGVkJyxcblx0J3dvcmtiZW5jaC5leHBlcmltZW50YWwuc2hhcmUuZW5hYmxlZCcsXG5dO1xuXG5leHBvcnQgY29uc3QgVElUTEVfQkFSX1NFVFRJTkdTID0gW1xuXHRMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT04sXG5cdExheW91dFNldHRpbmdzLkNPTU1BTkRfQ0VOVEVSLFxuXHQuLi5DT01NQU5EX0NFTlRFUl9TRVRUSU5HUyxcblx0TGF5b3V0U2V0dGluZ3MuRURJVE9SX0FDVElPTlNfTE9DQVRJT04sXG5cdExheW91dFNldHRpbmdzLkxBWU9VVF9BQ1RJT05TLFxuXHRNZW51U2V0dGluZ3MuTWVudUJhclZpc2liaWxpdHksXG5cdFRpdGxlQmFyU2V0dGluZy5USVRMRV9CQVJfU1RZTEUsXG5cdFRpdGxlQmFyU2V0dGluZy5DVVNUT01fVElUTEVfQkFSX1ZJU0lCSUxJVFksXG5dO1xuXG5jb25zdCBERUZBVUxUX0VNUFRZX1dJTkRPV19ESU1FTlNJT05TID0gbmV3IERpbWVuc2lvbihERUZBVUxUX0VNUFRZX1dJTkRPV19TSVpFLndpZHRoLCBERUZBVUxUX0VNUFRZX1dJTkRPV19TSVpFLmhlaWdodCk7XG5jb25zdCBERUZBVUxUX1dPUktTUEFDRV9XSU5ET1dfRElNRU5TSU9OUyA9IG5ldyBEaW1lbnNpb24oREVGQVVMVF9XT1JLU1BBQ0VfV0lORE9XX1NJWkUud2lkdGgsIERFRkFVTFRfV09SS1NQQUNFX1dJTkRPV19TSVpFLmhlaWdodCk7XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBMYXlvdXQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaExheW91dFNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8vI3JlZ2lvbiBFdmVudHNcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVplbk1vZGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VaZW5Nb2RlID0gdGhpcy5fb25EaWRDaGFuZ2VaZW5Nb2RlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTWFpbkVkaXRvckNlbnRlcmVkTGF5b3V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTWFpbkVkaXRvckNlbnRlcmVkTGF5b3V0ID0gdGhpcy5fb25EaWRDaGFuZ2VNYWluRWRpdG9yQ2VudGVyZWRMYXlvdXQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VQYW5lbEFsaWdubWVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFBhbmVsQWxpZ25tZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQYW5lbEFsaWdubWVudCA9IHRoaXMuX29uRGlkQ2hhbmdlUGFuZWxBbGlnbm1lbnQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VXaW5kb3dNYXhpbWl6ZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHdpbmRvd0lkOiBudW1iZXI7IG1heGltaXplZDogYm9vbGVhbiB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VXaW5kb3dNYXhpbWl6ZWQgPSB0aGlzLl9vbkRpZENoYW5nZVdpbmRvd01heGltaXplZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVBhbmVsUG9zaXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVBhbmVsUG9zaXRpb24gPSB0aGlzLl9vbkRpZENoYW5nZVBhbmVsUG9zaXRpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElQYXJ0VmlzaWJpbGl0eUNoYW5nZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eSA9IHRoaXMuX29uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VOb3RpZmljYXRpb25zVmlzaWJpbGl0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU5vdGlmaWNhdGlvbnNWaXNpYmlsaXR5ID0gdGhpcy5fb25EaWRDaGFuZ2VOb3RpZmljYXRpb25zVmlzaWJpbGl0eS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUF1eGlsaWFyeUJhck1heGltaXplZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUF1eGlsaWFyeUJhck1heGltaXplZCA9IHRoaXMuX29uRGlkQ2hhbmdlQXV4aWxpYXJ5QmFyTWF4aW1pemVkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkTGF5b3V0TWFpbkNvbnRhaW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElEaW1lbnNpb24+KCkpO1xuXHRyZWFkb25seSBvbkRpZExheW91dE1haW5Db250YWluZXIgPSB0aGlzLl9vbkRpZExheW91dE1haW5Db250YWluZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRMYXlvdXRBY3RpdmVDb250YWluZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRGltZW5zaW9uPigpKTtcblx0cmVhZG9ubHkgb25EaWRMYXlvdXRBY3RpdmVDb250YWluZXIgPSB0aGlzLl9vbkRpZExheW91dEFjdGl2ZUNvbnRhaW5lci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZExheW91dENvbnRhaW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgY29udGFpbmVyOiBIVE1MRWxlbWVudDsgZGltZW5zaW9uOiBJRGltZW5zaW9uIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZExheW91dENvbnRhaW5lciA9IHRoaXMuX29uRGlkTGF5b3V0Q29udGFpbmVyLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWRkQ29udGFpbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBjb250YWluZXI6IEhUTUxFbGVtZW50OyBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZEFkZENvbnRhaW5lciA9IHRoaXMuX29uRGlkQWRkQ29udGFpbmVyLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQWN0aXZlQ29udGFpbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZlQ29udGFpbmVyID0gdGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVDb250YWluZXIuZXZlbnQ7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFByb3BlcnRpZXNcblxuXHRyZWFkb25seSBtYWluQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdGdldCBhY3RpdmVDb250YWluZXIoKSB7IHJldHVybiB0aGlzLmdldENvbnRhaW5lckZyb21Eb2N1bWVudChnZXRBY3RpdmVEb2N1bWVudCgpKTsgfVxuXHRnZXQgY29udGFpbmVycygpOiBJdGVyYWJsZTxIVE1MRWxlbWVudD4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lcnM6IEhUTUxFbGVtZW50W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHsgd2luZG93IH0gb2YgZ2V0V2luZG93cygpKSB7XG5cdFx0XHRjb250YWluZXJzLnB1c2godGhpcy5nZXRDb250YWluZXJGcm9tRG9jdW1lbnQod2luZG93LmRvY3VtZW50KSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbnRhaW5lcnM7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbnRhaW5lckZyb21Eb2N1bWVudCh0YXJnZXREb2N1bWVudDogRG9jdW1lbnQpOiBIVE1MRWxlbWVudCB7XG5cdFx0aWYgKHRhcmdldERvY3VtZW50ID09PSB0aGlzLm1haW5Db250YWluZXIub3duZXJEb2N1bWVudCkge1xuXHRcdFx0cmV0dXJuIHRoaXMubWFpbkNvbnRhaW5lcjsgLy8gbWFpbiB3aW5kb3dcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRyZXR1cm4gdGFyZ2V0RG9jdW1lbnQuYm9keS5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKCdtb25hY28td29ya2JlbmNoJylbMF0gYXMgSFRNTEVsZW1lbnQ7IC8vIGF1eGlsaWFyeSB3aW5kb3dcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IGNvbnRhaW5lclN0eWxlc0xvYWRlZCA9IG5ldyBNYXA8bnVtYmVyIC8qIHdpbmRvdyBJRCAqLywgUHJvbWlzZTx2b2lkPj4oKTtcblx0d2hlbkNvbnRhaW5lclN0eWxlc0xvYWRlZCh3aW5kb3c6IENvZGVXaW5kb3cpOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5jb250YWluZXJTdHlsZXNMb2FkZWQuZ2V0KHdpbmRvdy52c2NvZGVXaW5kb3dJZCk7XG5cdH1cblxuXHRwcml2YXRlIF9tYWluQ29udGFpbmVyRGltZW5zaW9uITogSURpbWVuc2lvbjtcblx0Z2V0IG1haW5Db250YWluZXJEaW1lbnNpb24oKTogSURpbWVuc2lvbiB7IHJldHVybiB0aGlzLl9tYWluQ29udGFpbmVyRGltZW5zaW9uOyB9XG5cblx0Z2V0IGFjdGl2ZUNvbnRhaW5lckRpbWVuc2lvbigpOiBJRGltZW5zaW9uIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRDb250YWluZXJEaW1lbnNpb24odGhpcy5hY3RpdmVDb250YWluZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb250YWluZXJEaW1lbnNpb24oY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElEaW1lbnNpb24ge1xuXHRcdGlmIChjb250YWluZXIgPT09IHRoaXMubWFpbkNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuIHRoaXMubWFpbkNvbnRhaW5lckRpbWVuc2lvbjsgLy8gbWFpbiB3aW5kb3dcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGdldENsaWVudEFyZWEoY29udGFpbmVyKTsgXHQvLyBhdXhpbGlhcnkgd2luZG93XG5cdFx0fVxuXHR9XG5cblx0Z2V0IG1haW5Db250YWluZXJPZmZzZXQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuY29tcHV0ZUNvbnRhaW5lck9mZnNldChtYWluV2luZG93KTtcblx0fVxuXG5cdGdldCBhY3RpdmVDb250YWluZXJPZmZzZXQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuY29tcHV0ZUNvbnRhaW5lck9mZnNldChnZXRXaW5kb3codGhpcy5hY3RpdmVDb250YWluZXIpKTtcblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZUNvbnRhaW5lck9mZnNldCh0YXJnZXRXaW5kb3c6IFdpbmRvdykge1xuXHRcdGxldCB0b3AgPSAwO1xuXHRcdGxldCBxdWlja1BpY2tUb3AgPSAwO1xuXG5cdFx0aWYgKHRoaXMuaXNWaXNpYmxlKFBhcnRzLkJBTk5FUl9QQVJUKSkge1xuXHRcdFx0dG9wID0gdGhpcy5nZXRQYXJ0KFBhcnRzLkJBTk5FUl9QQVJUKS5tYXhpbXVtSGVpZ2h0O1xuXHRcdFx0cXVpY2tQaWNrVG9wID0gdG9wO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRpdGxlYmFyVmlzaWJsZSA9IHRoaXMuaXNWaXNpYmxlKFBhcnRzLlRJVExFQkFSX1BBUlQsIHRhcmdldFdpbmRvdyk7XG5cdFx0aWYgKHRpdGxlYmFyVmlzaWJsZSkge1xuXHRcdFx0dG9wICs9IHRoaXMuZ2V0UGFydChQYXJ0cy5USVRMRUJBUl9QQVJUKS5tYXhpbXVtSGVpZ2h0O1xuXHRcdFx0cXVpY2tQaWNrVG9wID0gdG9wO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzQ29tbWFuZENlbnRlclZpc2libGUgPSB0aXRsZWJhclZpc2libGUgJiYgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihMYXlvdXRTZXR0aW5ncy5DT01NQU5EX0NFTlRFUikgIT09IGZhbHNlO1xuXHRcdGlmIChpc0NvbW1hbmRDZW50ZXJWaXNpYmxlKSB7XG5cdFx0XHQvLyBJZiB0aGUgY29tbWFuZCBjZW50ZXIgaXMgdmlzaWJsZSB0aGVuIHRoZSBxdWlja2lucHV0XG5cdFx0XHQvLyBzaG91bGQgZ28gb3ZlciB0aGUgdGl0bGUgYmFyIGFuZCB0aGUgYmFubmVyXG5cdFx0XHRxdWlja1BpY2tUb3AgPSA2O1xuXHRcdH1cblxuXHRcdHJldHVybiB7IHRvcCwgcXVpY2tQaWNrVG9wIH07XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHRwcml2YXRlIHJlYWRvbmx5IHBhcnRzID0gbmV3IE1hcDxzdHJpbmcsIFBhcnQ+KCk7XG5cblx0cHJpdmF0ZSBpbml0aWFsaXplZCA9IGZhbHNlO1xuXHRwcml2YXRlIHdvcmtiZW5jaEdyaWQhOiBTZXJpYWxpemFibGVHcmlkPElTZXJpYWxpemFibGVWaWV3PjtcblxuXHRwcml2YXRlIHRpdGxlQmFyUGFydFZpZXchOiBJU2VyaWFsaXphYmxlVmlldztcblx0cHJpdmF0ZSBiYW5uZXJQYXJ0VmlldyE6IElTZXJpYWxpemFibGVWaWV3O1xuXHRwcml2YXRlIGFjdGl2aXR5QmFyUGFydFZpZXchOiBJU2VyaWFsaXphYmxlVmlldztcblx0cHJpdmF0ZSBzaWRlQmFyUGFydFZpZXchOiBJU2VyaWFsaXphYmxlVmlldztcblx0cHJpdmF0ZSBwYW5lbFBhcnRWaWV3ITogSVNlcmlhbGl6YWJsZVZpZXc7XG5cdHByaXZhdGUgYXV4aWxpYXJ5QmFyUGFydFZpZXchOiBJU2VyaWFsaXphYmxlVmlldztcblx0cHJpdmF0ZSBlZGl0b3JQYXJ0VmlldyE6IElTZXJpYWxpemFibGVWaWV3O1xuXHRwcml2YXRlIHN0YXR1c0JhclBhcnRWaWV3ITogSVNlcmlhbGl6YWJsZVZpZXc7XG5cblx0cHJpdmF0ZSBlbnZpcm9ubWVudFNlcnZpY2UhOiBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZTtcblx0cHJpdmF0ZSBleHRlbnNpb25TZXJ2aWNlITogSUV4dGVuc2lvblNlcnZpY2U7XG5cdHByaXZhdGUgY29uZmlndXJhdGlvblNlcnZpY2UhOiBJQ29uZmlndXJhdGlvblNlcnZpY2U7XG5cdHByaXZhdGUgc3RvcmFnZVNlcnZpY2UhOiBJU3RvcmFnZVNlcnZpY2U7XG5cdHByaXZhdGUgaG9zdFNlcnZpY2UhOiBJSG9zdFNlcnZpY2U7XG5cdHByaXZhdGUgZWRpdG9yU2VydmljZSE6IElFZGl0b3JTZXJ2aWNlO1xuXHRwcml2YXRlIG1haW5QYXJ0RWRpdG9yU2VydmljZSE6IElFZGl0b3JTZXJ2aWNlO1xuXHRwcml2YXRlIGVkaXRvckdyb3VwU2VydmljZSE6IElFZGl0b3JHcm91cHNTZXJ2aWNlO1xuXHRwcml2YXRlIHBhbmVDb21wb3NpdGVTZXJ2aWNlITogSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZTtcblx0cHJpdmF0ZSB0aXRsZVNlcnZpY2UhOiBJVGl0bGVTZXJ2aWNlO1xuXHRwcml2YXRlIHZpZXdEZXNjcmlwdG9yU2VydmljZSE6IElWaWV3RGVzY3JpcHRvclNlcnZpY2U7XG5cdHByaXZhdGUgY29udGV4dFNlcnZpY2UhOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2U7XG5cdHByaXZhdGUgbm90aWZpY2F0aW9uU2VydmljZSE6IElOb3RpZmljYXRpb25TZXJ2aWNlO1xuXHRwcml2YXRlIHRoZW1lU2VydmljZSE6IElUaGVtZVNlcnZpY2U7XG5cdHByaXZhdGUgc3RhdHVzQmFyU2VydmljZSE6IElTdGF0dXNiYXJTZXJ2aWNlO1xuXHRwcml2YXRlIGxvZ1NlcnZpY2UhOiBJTG9nU2VydmljZTtcblx0cHJpdmF0ZSB0ZWxlbWV0cnlTZXJ2aWNlITogSVRlbGVtZXRyeVNlcnZpY2U7XG5cdHByaXZhdGUgYXV4aWxpYXJ5V2luZG93U2VydmljZSE6IElBdXhpbGlhcnlXaW5kb3dTZXJ2aWNlO1xuXG5cdHByaXZhdGUgc3RhdGUhOiBJTGF5b3V0U3RhdGU7XG5cdHByaXZhdGUgc3RhdGVNb2RlbCE6IExheW91dFN0YXRlTW9kZWw7XG5cblx0cHJpdmF0ZSBkaXNwb3NlZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBwYXJlbnQ6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0T3B0aW9ucz86IHsgcmVzZXRMYXlvdXQ6IGJvb2xlYW4gfVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGluaXRMYXlvdXQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblxuXHRcdC8vIFNlcnZpY2VzXG5cdFx0dGhpcy5lbnZpcm9ubWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLmhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElIb3N0U2VydmljZSk7XG5cdFx0dGhpcy5jb250ZXh0U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UpO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHR0aGlzLnRoZW1lU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGhlbWVTZXJ2aWNlKTtcblx0XHR0aGlzLmV4dGVuc2lvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvblNlcnZpY2UpO1xuXHRcdHRoaXMubG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJTG9nU2VydmljZSk7XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHR0aGlzLmF1eGlsaWFyeVdpbmRvd1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUF1eGlsaWFyeVdpbmRvd1NlcnZpY2UpO1xuXG5cdFx0Ly8gUGFydHNcblx0XHR0aGlzLmVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblx0XHR0aGlzLm1haW5QYXJ0RWRpdG9yU2VydmljZSA9IHRoaXMuZWRpdG9yU2VydmljZS5jcmVhdGVTY29wZWQodGhpcy5lZGl0b3JHcm91cFNlcnZpY2UubWFpblBhcnQsIHRoaXMuX3N0b3JlKTtcblx0XHR0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UpO1xuXHRcdHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3RGVzY3JpcHRvclNlcnZpY2UpO1xuXHRcdHRoaXMudGl0bGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUaXRsZVNlcnZpY2UpO1xuXHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5zdGF0dXNCYXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTdGF0dXNiYXJTZXJ2aWNlKTtcblx0XHRhY2Nlc3Nvci5nZXQoSUJhbm5lclNlcnZpY2UpO1xuXG5cdFx0Ly8gTGlzdGVuZXJzXG5cdFx0dGhpcy5yZWdpc3RlckxheW91dExpc3RlbmVycygpO1xuXG5cdFx0Ly8gU3RhdGVcblx0XHR0aGlzLmluaXRMYXlvdXRTdGF0ZShhY2Nlc3Nvci5nZXQoSUxpZmVjeWNsZVNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUZpbGVTZXJ2aWNlKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGF5b3V0TGlzdGVuZXJzKCk6IHZvaWQge1xuXG5cdFx0Ly8gUmVzdG9yZSBlZGl0b3IgaWYgaGlkZGVuIGFuZCBhbiBlZGl0b3IgaXMgdG8gc2hvd1xuXHRcdGNvbnN0IHNob3dFZGl0b3JJZkhpZGRlbiA9IChleHBsaWNpdFVzZXJBY3Rpb24/OiBib29sZWFuKSA9PiB7XG5cdFx0XHRpZiAoXG5cdFx0XHRcdHRoaXMuaXNWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJULCBtYWluV2luZG93KSB8fFx0XHQvLyBhbHJlYWR5IHZpc2libGVcblx0XHRcdFx0dGhpcy5tYWluUGFydEVkaXRvclNlcnZpY2UudmlzaWJsZUVkaXRvcnMubGVuZ3RoID09PSAwXHQvLyBubyBlZGl0b3IgdG8gc2hvd1xuXHRcdFx0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuaXNBdXhpbGlhcnlCYXJNYXhpbWl6ZWQoKSkge1xuXHRcdFx0XHQvLyBEbyBub3QgdW5tYXhpbWl6ZSB0aGUgYXV4aWxpYXJ5IHNpZGUgYmFyIHdoZW4gdGhlIGVkaXRvciB3YXNcblx0XHRcdFx0Ly8gb3BlbmVkIGF1dG9tYXRpY2FsbHkgKGUuZy4gYnkgdGhlIGNoYXQgYWdlbnQgYXBwbHlpbmcgZWRpdHMpLlxuXHRcdFx0XHQvLyBPbmx5IGFuIGV4cGxpY2l0IHVzZXIgYWN0aW9uIHNob3VsZCBkaXNydXB0IHRoZSBjaG9zZW4gbGF5b3V0LlxuXHRcdFx0XHRpZiAoZXhwbGljaXRVc2VyQWN0aW9uICE9PSBmYWxzZSkge1xuXHRcdFx0XHRcdHRoaXMudG9nZ2xlTWF4aW1pemVkQXV4aWxpYXJ5QmFyKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMudG9nZ2xlTWF4aW1pemVkUGFuZWwoKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gTWF5YmUgbWF4aW1pemUgYXV4aWxpYXJ5IGJhciB3aGVuIG5vIGVkaXRvcnMgYXJlIHZpc2libGVcblx0XHRjb25zdCBtYXliZU1heGltaXplQXV4aWxpYXJ5QmFyID0gKCkgPT4ge1xuXHRcdFx0aWYgKFxuXHRcdFx0XHR0aGlzLm1haW5QYXJ0RWRpdG9yU2VydmljZS52aXNpYmxlRWRpdG9ycy5sZW5ndGggPT09IDAgJiZcblx0XHRcdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShXb3JrYmVuY2hMYXlvdXRTZXR0aW5ncy5BVVhJTElBUllCQVJfRk9SQ0VfTUFYSU1JWkVEKSA9PT0gdHJ1ZVxuXHRcdFx0KSB7XG5cdFx0XHRcdHRoaXMuc2V0QXV4aWxpYXJ5QmFyTWF4aW1pemVkKHRydWUpO1xuXG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fTtcblxuXHRcdC8vIFdhaXQgdG8gcmVnaXN0ZXIgdGhlc2UgbGlzdGVuZXJzIGFmdGVyIHRoZSBlZGl0b3IgZ3JvdXAgc2VydmljZVxuXHRcdC8vIGlzIHJlYWR5IHRvIGF2b2lkIGNvbmZsaWN0cyBvbiBzdGFydHVwXG5cdFx0dGhpcy5lZGl0b3JHcm91cFNlcnZpY2Uud2hlblJlc3RvcmVkLnRoZW4oKCkgPT4ge1xuXG5cdFx0XHQvLyBIYW5kbGUgdmlzaWJsZSBlZGl0b3JzIGNoYW5naW5nIGZvciBwYXJ0cyB2aXNpYmlsaXR5XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1haW5QYXJ0RWRpdG9yU2VydmljZS5vbkRpZFZpc2libGVFZGl0b3JzQ2hhbmdlKGUgPT4ge1xuXHRcdFx0XHRjb25zdCBoYW5kbGVkID0gbWF5YmVNYXhpbWl6ZUF1eGlsaWFyeUJhcigpO1xuXHRcdFx0XHRpZiAoIWhhbmRsZWQpIHtcblx0XHRcdFx0XHRzaG93RWRpdG9ySWZIaWRkZW4oZS5pc0V4cGxpY2l0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JHcm91cFNlcnZpY2UubWFpblBhcnQub25EaWRBY3RpdmF0ZUdyb3VwKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5yZWFzb24gIT09IEdyb3VwQWN0aXZhdGlvblJlYXNvbi5QQVJUX0NMT1NFKSB7XG5cdFx0XHRcdFx0c2hvd0VkaXRvcklmSGlkZGVuKCk7IC8vIG9ubHkgc2hvdyB1bmxlc3MgYSBtb2RhbC9hdXhpbGlhcnkgcGFydCBjbG9zZXNcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBSZXZhbGlkYXRlIGNlbnRlciBsYXlvdXQgd2hlbiBhY3RpdmUgZWRpdG9yIGNoYW5nZXM6IGRpZmYgZWRpdG9yIHF1aXRzIGNlbnRlcmVkIG1vZGVcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubWFpblBhcnRFZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKCgpID0+IHRoaXMuY2VudGVyTWFpbkVkaXRvckxheW91dCh0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5NQUlOX0VESVRPUl9DRU5URVJFRCkpKSk7XG5cdFx0fSk7XG5cblx0XHQvLyBDb25maWd1cmF0aW9uIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblxuXHRcdFx0Ly8gTGF5b3V0IHJlbGF0ZWRcblx0XHRcdGlmIChbXG5cdFx0XHRcdC4uLlRJVExFX0JBUl9TRVRUSU5HUyxcblx0XHRcdFx0TGVnYWN5V29ya2JlbmNoTGF5b3V0U2V0dGluZ3MuU0lERUJBUl9QT1NJVElPTixcblx0XHRcdFx0TGVnYWN5V29ya2JlbmNoTGF5b3V0U2V0dGluZ3MuU1RBVFVTQkFSX1ZJU0lCTEUsXG5cdFx0XHRdLnNvbWUoc2V0dGluZyA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKHNldHRpbmcpKSkge1xuXG5cdFx0XHRcdC8vIFNob3cgQ29tbWFuZCBDZW50ZXIgaWYgY29tbWFuZCBjZW50ZXIgYWN0aW9ucyBlbmFibGVkXG5cdFx0XHRcdGNvbnN0IGVuYWJsZWRDb21tYW5kQ2VudGVyQWN0aW9uID0gQ09NTUFORF9DRU5URVJfU0VUVElOR1Muc29tZShzZXR0aW5nID0+IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oc2V0dGluZykgJiYgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihzZXR0aW5nKSA9PT0gdHJ1ZSk7XG5cblx0XHRcdFx0aWYgKGVuYWJsZWRDb21tYW5kQ2VudGVyQWN0aW9uKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTGF5b3V0U2V0dGluZ3MuQ09NTUFORF9DRU5URVIpID09PSBmYWxzZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShMYXlvdXRTZXR0aW5ncy5DT01NQU5EX0NFTlRFUiwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47IC8vIG9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiB3aWxsIGJlIHRyaWdnZXJlZCBhZ2FpblxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFNob3cgQ3VzdG9tIFRpdGxlQmFyIGlmIGFjdGlvbnMgZW5hYmxlZCBpbiAob3IgbW92ZWQgdG8pIHRoZSB0aXRsZWJhclxuXHRcdFx0XHRjb25zdCBlZGl0b3JBY3Rpb25zTW92ZWRUb1RpdGxlYmFyID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihMYXlvdXRTZXR0aW5ncy5FRElUT1JfQUNUSU9OU19MT0NBVElPTikgJiYgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxFZGl0b3JBY3Rpb25zTG9jYXRpb24+KExheW91dFNldHRpbmdzLkVESVRPUl9BQ1RJT05TX0xPQ0FUSU9OKSA9PT0gRWRpdG9yQWN0aW9uc0xvY2F0aW9uLlRJVExFQkFSO1xuXHRcdFx0XHRjb25zdCBjb21tYW5kQ2VudGVyRW5hYmxlZCA9IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTGF5b3V0U2V0dGluZ3MuQ09NTUFORF9DRU5URVIpICYmIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTGF5b3V0U2V0dGluZ3MuQ09NTUFORF9DRU5URVIpO1xuXHRcdFx0XHRjb25zdCBsYXlvdXRDb250cm9sc0VuYWJsZWQgPSBlLmFmZmVjdHNDb25maWd1cmF0aW9uKExheW91dFNldHRpbmdzLkxBWU9VVF9BQ1RJT05TKSAmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KExheW91dFNldHRpbmdzLkxBWU9VVF9BQ1RJT05TKTtcblx0XHRcdFx0Y29uc3QgYWN0aXZpdHlCYXJNb3ZlZFRvVG9wT3JCb3R0b20gPSBlLmFmZmVjdHNDb25maWd1cmF0aW9uKExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9MT0NBVElPTikgJiYgW0FjdGl2aXR5QmFyUG9zaXRpb24uVE9QLCBBY3Rpdml0eUJhclBvc2l0aW9uLkJPVFRPTV0uaW5jbHVkZXModGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxBY3Rpdml0eUJhclBvc2l0aW9uPihMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT04pKTtcblxuXHRcdFx0XHRpZiAoYWN0aXZpdHlCYXJNb3ZlZFRvVG9wT3JCb3R0b20gfHwgZWRpdG9yQWN0aW9uc01vdmVkVG9UaXRsZWJhciB8fCBjb21tYW5kQ2VudGVyRW5hYmxlZCB8fCBsYXlvdXRDb250cm9sc0VuYWJsZWQpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxDdXN0b21UaXRsZUJhclZpc2liaWxpdHk+KFRpdGxlQmFyU2V0dGluZy5DVVNUT01fVElUTEVfQkFSX1ZJU0lCSUxJVFkpID09PSBDdXN0b21UaXRsZUJhclZpc2liaWxpdHkuTkVWRVIpIHtcblx0XHRcdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoVGl0bGVCYXJTZXR0aW5nLkNVU1RPTV9USVRMRV9CQVJfVklTSUJJTElUWSwgQ3VzdG9tVGl0bGVCYXJWaXNpYmlsaXR5LkFVVE8pO1xuXHRcdFx0XHRcdFx0cmV0dXJuOyAvLyBvbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24gd2lsbCBiZSB0cmlnZ2VyZWQgYWdhaW5cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLmRvVXBkYXRlTGF5b3V0Q29uZmlndXJhdGlvbigpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTaGFkb3dzXG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihMYXlvdXRTZXR0aW5ncy5TSEFET1dTKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVNoYWRvd3MoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTW9kZXJuIFVJIFVwZGF0ZSAoZmxvYXRpbmcgcGFuZWxzIHByZXNlbnRhdGlvbilcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKExheW91dFNldHRpbmdzLk1PREVSTl9VSSkpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVGbG9hdGluZ1BhbmVscygpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBdXhpbGlhcnkgU2lkZWJhclxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oV29ya2JlbmNoTGF5b3V0U2V0dGluZ3MuQVVYSUxJQVJZQkFSX0ZPUkNFX01BWElNSVpFRCkpIHtcblx0XHRcdFx0Y29uc3QgZm9yY2VNYXhpbWl6ZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFdvcmtiZW5jaExheW91dFNldHRpbmdzLkFVWElMSUFSWUJBUl9GT1JDRV9NQVhJTUlaRUQpO1xuXHRcdFx0XHRpZiAoZm9yY2VNYXhpbWl6ZWQgPT09IHRydWUgJiYgdGhpcy5tYWluUGFydEVkaXRvclNlcnZpY2UudmlzaWJsZUVkaXRvcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRBdXhpbGlhcnlCYXJNYXhpbWl6ZWQodHJ1ZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZm9yY2VNYXhpbWl6ZWQgPT09IGZhbHNlICYmIHRoaXMuaXNBdXhpbGlhcnlCYXJNYXhpbWl6ZWQoKSkge1xuXHRcdFx0XHRcdHRoaXMuc2V0QXV4aWxpYXJ5QmFyTWF4aW1pemVkKGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEZ1bGxzY3JlZW4gY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG9uRGlkQ2hhbmdlRnVsbHNjcmVlbih3aW5kb3dJZCA9PiB0aGlzLm9uRnVsbHNjcmVlbkNoYW5nZWQod2luZG93SWQpKSk7XG5cblx0XHQvLyBHcm91cCBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JHcm91cFNlcnZpY2UubWFpblBhcnQub25EaWRBZGRHcm91cCgoKSA9PiB0aGlzLmNlbnRlck1haW5FZGl0b3JMYXlvdXQodGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuTUFJTl9FRElUT1JfQ0VOVEVSRUQpKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm1haW5QYXJ0Lm9uRGlkUmVtb3ZlR3JvdXAoKCkgPT4gdGhpcy5jZW50ZXJNYWluRWRpdG9yTGF5b3V0KHRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLk1BSU5fRURJVE9SX0NFTlRFUkVEKSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvckdyb3VwU2VydmljZS5tYWluUGFydC5vbkRpZENoYW5nZUdyb3VwTWF4aW1pemVkKCgpID0+IHRoaXMuY2VudGVyTWFpbkVkaXRvckxheW91dCh0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5NQUlOX0VESVRPUl9DRU5URVJFRCkpKSk7XG5cblx0XHQvLyBQcmV2ZW50IHdvcmtiZW5jaCBmcm9tIHNjcm9sbGluZyAjNTU0NTZcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5tYWluQ29udGFpbmVyLCBFdmVudFR5cGUuU0NST0xMLCAoKSA9PiB0aGlzLm1haW5Db250YWluZXIuc2Nyb2xsVG9wID0gMCkpO1xuXG5cdFx0Ly8gTWVudWJhciB2aXNpYmlsaXR5IGNoYW5nZXNcblx0XHRjb25zdCBzaG93aW5nQ3VzdG9tTWVudSA9IChpc1dpbmRvd3MgfHwgaXNMaW51eCB8fCBpc1dlYikgJiYgIWhhc05hdGl2ZVRpdGxlYmFyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGlmIChzaG93aW5nQ3VzdG9tTWVudSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50aXRsZVNlcnZpY2Uub25NZW51YmFyVmlzaWJpbGl0eUNoYW5nZSh2aXNpYmxlID0+IHRoaXMub25NZW51YmFyVG9nZ2xlZCh2aXNpYmxlKSkpO1xuXHRcdH1cblxuXHRcdC8vIFRoZW1lIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoKCkgPT4gdGhpcy51cGRhdGVXaW5kb3dCb3JkZXIoKSkpO1xuXG5cdFx0Ly8gV2luZG93IGFjdGl2ZSAvIGZvY3VzIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9jdXMoZm9jdXNlZCA9PiB0aGlzLm9uV2luZG93Rm9jdXNDaGFuZ2VkKGZvY3VzZWQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ob3N0U2VydmljZS5vbkRpZENoYW5nZUFjdGl2ZVdpbmRvdygoKSA9PiB0aGlzLm9uQWN0aXZlV2luZG93Q2hhbmdlZCgpKSk7XG5cblx0XHQvLyBXQ08gY2hhbmdlc1xuXHRcdGlmIChpc1dlYiAmJiB0eXBlb2YgKG5hdmlnYXRvciBhcyB7IHdpbmRvd0NvbnRyb2xzT3ZlcmxheT86IEV2ZW50VGFyZ2V0IH0pLndpbmRvd0NvbnRyb2xzT3ZlcmxheSA9PT0gJ29iamVjdCcpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcigobmF2aWdhdG9yIGFzIHVua25vd24gYXMgeyB3aW5kb3dDb250cm9sc092ZXJsYXk6IEV2ZW50VGFyZ2V0IH0pLndpbmRvd0NvbnRyb2xzT3ZlcmxheSwgJ2dlb21ldHJ5Y2hhbmdlJywgKCkgPT4gdGhpcy5vbkRpZENoYW5nZVdDTygpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gQXV4aWxpYXJ5IHdpbmRvd3Ncblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmF1eGlsaWFyeVdpbmRvd1NlcnZpY2Uub25EaWRPcGVuQXV4aWxpYXJ5V2luZG93KCh7IHdpbmRvdywgZGlzcG9zYWJsZXMgfSkgPT4ge1xuXHRcdFx0Y29uc3Qgd2luZG93SWQgPSB3aW5kb3cud2luZG93LnZzY29kZVdpbmRvd0lkO1xuXHRcdFx0dGhpcy5jb250YWluZXJTdHlsZXNMb2FkZWQuc2V0KHdpbmRvd0lkLCB3aW5kb3cud2hlblN0eWxlc0hhdmVMb2FkZWQpO1xuXHRcdFx0d2luZG93LndoZW5TdHlsZXNIYXZlTG9hZGVkLnRoZW4oKCkgPT4gdGhpcy5jb250YWluZXJTdHlsZXNMb2FkZWQuZGVsZXRlKHdpbmRvd0lkKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuY29udGFpbmVyU3R5bGVzTG9hZGVkLmRlbGV0ZSh3aW5kb3dJZCkpKTtcblxuXHRcdFx0Y29uc3QgZXZlbnREaXNwb3NhYmxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdFx0dGhpcy5fb25EaWRBZGRDb250YWluZXIuZmlyZSh7IGNvbnRhaW5lcjogd2luZG93LmNvbnRhaW5lciwgZGlzcG9zYWJsZXM6IGV2ZW50RGlzcG9zYWJsZXMgfSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh3aW5kb3cub25EaWRMYXlvdXQoZGltZW5zaW9uID0+IHRoaXMuaGFuZGxlQ29udGFpbmVyRGlkTGF5b3V0KHdpbmRvdy5jb250YWluZXIsIGRpbWVuc2lvbikpKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIG9uTWVudWJhclRvZ2dsZWQodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh2aXNpYmxlICE9PSB0aGlzLnN0YXRlLnJ1bnRpbWUubWVudUJhci50b2dnbGVkKSB7XG5cdFx0XHR0aGlzLnN0YXRlLnJ1bnRpbWUubWVudUJhci50b2dnbGVkID0gdmlzaWJsZTtcblxuXHRcdFx0Y29uc3QgbWVudUJhclZpc2liaWxpdHkgPSBnZXRNZW51QmFyVmlzaWJpbGl0eSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdFx0Ly8gVGhlIG1lbnUgYmFyIHRvZ2dsZXMgdGhlIHRpdGxlIGJhciBpbiB3ZWIgYmVjYXVzZSBpdCBkb2VzIG5vdCBuZWVkIHRvIGJlIHNob3duIGZvciB3aW5kb3cgY29udHJvbHMgb25seVxuXHRcdFx0aWYgKGlzV2ViICYmIG1lbnVCYXJWaXNpYmlsaXR5ID09PSAndG9nZ2xlJykge1xuXHRcdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQuc2V0Vmlld1Zpc2libGUodGhpcy50aXRsZUJhclBhcnRWaWV3LCBzaG91bGRTaG93Q3VzdG9tVGl0bGVCYXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgbWFpbldpbmRvdywgdGhpcy5zdGF0ZS5ydW50aW1lLm1lbnVCYXIudG9nZ2xlZCkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUaGUgbWVudSBiYXIgdG9nZ2xlcyB0aGUgdGl0bGUgYmFyIGluIGZ1bGwgc2NyZWVuIGZvciB0b2dnbGUgYW5kIGNsYXNzaWMgc2V0dGluZ3Ncblx0XHRcdGVsc2UgaWYgKHRoaXMuc3RhdGUucnVudGltZS5tYWluV2luZG93RnVsbHNjcmVlbiAmJiAobWVudUJhclZpc2liaWxpdHkgPT09ICd0b2dnbGUnIHx8IG1lbnVCYXJWaXNpYmlsaXR5ID09PSAnY2xhc3NpYycpKSB7XG5cdFx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5zZXRWaWV3VmlzaWJsZSh0aGlzLnRpdGxlQmFyUGFydFZpZXcsIHNob3VsZFNob3dDdXN0b21UaXRsZUJhcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBtYWluV2luZG93LCB0aGlzLnN0YXRlLnJ1bnRpbWUubWVudUJhci50b2dnbGVkKSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE1vdmUgbGF5b3V0IGNhbGwgdG8gYW55IHRpbWUgdGhlIG1lbnViYXJcblx0XHRcdC8vIGlzIHRvZ2dsZWQgdG8gdXBkYXRlIGNvbnN1bWVycyBvZiBvZmZzZXRcblx0XHRcdC8vIHNlZSBpc3N1ZSAjMTE1MjY3XG5cdFx0XHR0aGlzLmhhbmRsZUNvbnRhaW5lckRpZExheW91dCh0aGlzLm1haW5Db250YWluZXIsIHRoaXMuX21haW5Db250YWluZXJEaW1lbnNpb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlQ29udGFpbmVyRGlkTGF5b3V0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGRpbWVuc2lvbjogSURpbWVuc2lvbik6IHZvaWQge1xuXHRcdGlmIChjb250YWluZXIgPT09IHRoaXMubWFpbkNvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5fb25EaWRMYXlvdXRNYWluQ29udGFpbmVyLmZpcmUoZGltZW5zaW9uKTtcblx0XHR9XG5cblx0XHRpZiAoaXNBY3RpdmVEb2N1bWVudChjb250YWluZXIpKSB7XG5cdFx0XHR0aGlzLl9vbkRpZExheW91dEFjdGl2ZUNvbnRhaW5lci5maXJlKGRpbWVuc2lvbik7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRMYXlvdXRDb250YWluZXIuZmlyZSh7IGNvbnRhaW5lciwgZGltZW5zaW9uIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkZ1bGxzY3JlZW5DaGFuZ2VkKHdpbmRvd0lkOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAod2luZG93SWQgIT09IG1haW5XaW5kb3cudnNjb2RlV2luZG93SWQpIHtcblx0XHRcdHJldHVybjsgLy8gaWdub3JlIGFsbCBidXQgbWFpbiB3aW5kb3dcblx0XHR9XG5cblx0XHR0aGlzLnN0YXRlLnJ1bnRpbWUubWFpbldpbmRvd0Z1bGxzY3JlZW4gPSBpc0Z1bGxzY3JlZW4obWFpbldpbmRvdyk7XG5cblx0XHQvLyBBcHBseSBhcyBDU1MgY2xhc3Ncblx0XHRpZiAodGhpcy5zdGF0ZS5ydW50aW1lLm1haW5XaW5kb3dGdWxsc2NyZWVuKSB7XG5cdFx0XHR0aGlzLm1haW5Db250YWluZXIuY2xhc3NMaXN0LmFkZChMYXlvdXRDbGFzc2VzLkZVTExTQ1JFRU4pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm1haW5Db250YWluZXIuY2xhc3NMaXN0LnJlbW92ZShMYXlvdXRDbGFzc2VzLkZVTExTQ1JFRU4pO1xuXG5cdFx0XHRjb25zdCB6ZW5Nb2RlRXhpdEluZm8gPSB0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5aRU5fTU9ERV9FWElUX0lORk8pO1xuXHRcdFx0aWYgKHplbk1vZGVFeGl0SW5mby50cmFuc2l0aW9uZWRUb0Z1bGxTY3JlZW4gJiYgdGhpcy5pc1plbk1vZGVBY3RpdmUoKSkge1xuXHRcdFx0XHR0aGlzLnRvZ2dsZVplbk1vZGUoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDaGFuZ2UgZWRnZSBzbmFwcGluZyBhY2NvcmRpbmdseVxuXHRcdHRoaXMud29ya2JlbmNoR3JpZC5lZGdlU25hcHBpbmcgPSB0aGlzLnN0YXRlLnJ1bnRpbWUubWFpbldpbmRvd0Z1bGxzY3JlZW47XG5cblx0XHQvLyBDaGFuZ2luZyBmdWxsc2NyZWVuIHN0YXRlIG9mIHRoZSBtYWluIHdpbmRvdyBoYXMgYW4gaW1wYWN0XG5cdFx0Ly8gb24gY3VzdG9tIHRpdGxlIGJhciB2aXNpYmlsaXR5LCBzbyB3ZSBuZWVkIHRvIHVwZGF0ZVxuXHRcdGlmIChoYXNDdXN0b21UaXRsZWJhcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKSkge1xuXG5cdFx0XHQvLyBQcm9wYWdhdGUgdG8gZ3JpZFxuXHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLnNldFZpZXdWaXNpYmxlKHRoaXMudGl0bGVCYXJQYXJ0Vmlldywgc2hvdWxkU2hvd0N1c3RvbVRpdGxlQmFyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIG1haW5XaW5kb3csIHRoaXMuc3RhdGUucnVudGltZS5tZW51QmFyLnRvZ2dsZWQpKTtcblxuXHRcdFx0Ly8gSW5kaWNhdGUgYWN0aXZlIHdpbmRvdyBib3JkZXJcblx0XHRcdHRoaXMudXBkYXRlV2luZG93Qm9yZGVyKHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25BY3RpdmVXaW5kb3dDaGFuZ2VkKCk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2ZUNvbnRhaW5lcklkID0gdGhpcy5nZXRBY3RpdmVDb250YWluZXJJZCgpO1xuXHRcdGlmICh0aGlzLnN0YXRlLnJ1bnRpbWUuYWN0aXZlQ29udGFpbmVySWQgIT09IGFjdGl2ZUNvbnRhaW5lcklkKSB7XG5cdFx0XHR0aGlzLnN0YXRlLnJ1bnRpbWUuYWN0aXZlQ29udGFpbmVySWQgPSBhY3RpdmVDb250YWluZXJJZDtcblxuXHRcdFx0Ly8gSW5kaWNhdGUgYWN0aXZlIHdpbmRvdyBib3JkZXJcblx0XHRcdHRoaXMudXBkYXRlV2luZG93Qm9yZGVyKCk7XG5cblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlQ29udGFpbmVyLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uV2luZG93Rm9jdXNDaGFuZ2VkKGhhc0ZvY3VzOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuc3RhdGUucnVudGltZS5oYXNGb2N1cyAhPT0gaGFzRm9jdXMpIHtcblx0XHRcdHRoaXMuc3RhdGUucnVudGltZS5oYXNGb2N1cyA9IGhhc0ZvY3VzO1xuXG5cdFx0XHQvLyBJbmRpY2F0ZSBhY3RpdmUgd2luZG93IGJvcmRlclxuXHRcdFx0dGhpcy51cGRhdGVXaW5kb3dCb3JkZXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEFjdGl2ZUNvbnRhaW5lcklkKCk6IG51bWJlciB7XG5cdFx0Y29uc3QgYWN0aXZlQ29udGFpbmVyID0gdGhpcy5hY3RpdmVDb250YWluZXI7XG5cblx0XHRyZXR1cm4gZ2V0V2luZG93KGFjdGl2ZUNvbnRhaW5lcikudnNjb2RlV2luZG93SWQ7XG5cdH1cblxuXHRwcml2YXRlIGRvVXBkYXRlTGF5b3V0Q29uZmlndXJhdGlvbihza2lwTGF5b3V0PzogYm9vbGVhbik6IHZvaWQge1xuXG5cdFx0Ly8gQ3VzdG9tIFRpdGxlYmFyIHZpc2liaWxpdHkgd2l0aCBuYXRpdmUgdGl0bGViYXJcblx0XHR0aGlzLnVwZGF0ZUN1c3RvbVRpdGxlQmFyVmlzaWJpbGl0eSgpO1xuXG5cdFx0Ly8gTWVudWJhciB2aXNpYmlsaXR5XG5cdFx0dGhpcy51cGRhdGVNZW51YmFyVmlzaWJpbGl0eSghIXNraXBMYXlvdXQpO1xuXG5cdFx0Ly8gQ2VudGVyZWQgTGF5b3V0XG5cdFx0dGhpcy5lZGl0b3JHcm91cFNlcnZpY2Uud2hlblJlc3RvcmVkLnRoZW4oKCkgPT4gdGhpcy5jZW50ZXJNYWluRWRpdG9yTGF5b3V0KHRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLk1BSU5fRURJVE9SX0NFTlRFUkVEKSwgc2tpcExheW91dCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1NoYWRvd3NEaXNhYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihMYXlvdXRTZXR0aW5ncy5TSEFET1dTKSA9PT0gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVNoYWRvd3MoKTogdm9pZCB7XG5cdFx0Y29uc3Qgbm9TaGFkb3dzID0gdGhpcy5pc1NoYWRvd3NEaXNhYmxlZCgpO1xuXG5cdFx0Zm9yIChjb25zdCBjb250YWluZXIgb2YgQXJyYXkuZnJvbSh0aGlzLmNvbnRhaW5lcnMpKSB7XG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZShMYXlvdXRDbGFzc2VzLk5PX1NIQURPV1MsIG5vU2hhZG93cyk7XG5cdFx0fVxuXHR9XG5cblx0aXNGbG9hdGluZ1BhbmVsc0VuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTGF5b3V0U2V0dGluZ3MuTU9ERVJOX1VJKSA9PT0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRmxvYXRpbmdQYW5lbHMoKTogdm9pZCB7XG5cdFx0Ly8gRmxvYXRpbmcgcGFuZWxzIGlzIGEgbWFpbi13aW5kb3cgY29uY2VwdDogb25seSB0aGUgbWFpbiBjb250YWluZXIgaG9zdHNcblx0XHQvLyB0aGUgc2lkZSBiYXJzIGFuZCBib3R0b20gcGFuZWwuIFNjb3BlIHRoZSBjbGFzcyAoYW5kIHRoZXJlZm9yZSB0aGUgQ1NTXG5cdFx0Ly8gY2FyZCBtYXJnaW5zKSB0byB0aGUgbWFpbiBjb250YWluZXIgc28gYXV4aWxpYXJ5IHdpbmRvd3MgXHUyMDE0IHdob3NlIHBhcnRzIGRvXG5cdFx0Ly8gbm90IGFwcGx5IHRoZSBtYXRjaGluZyBjb250ZW50IGluc2V0cyBpbiBjb2RlIFx1MjAxNCBhcmUgbGVmdCB1bnRvdWNoZWQuXG5cdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoTGF5b3V0Q2xhc3Nlcy5GTE9BVElOR19QQU5FTFMsIHRoaXMuaXNGbG9hdGluZ1BhbmVsc0VuYWJsZWQoKSk7XG5cdFx0dGhpcy51cGRhdGVXaW5kb3dCb3JkZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0U2lkZUJhclBvc2l0aW9uKHBvc2l0aW9uOiBQb3NpdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2aXR5QmFyID0gdGhpcy5nZXRQYXJ0KFBhcnRzLkFDVElWSVRZQkFSX1BBUlQpO1xuXHRcdGNvbnN0IHNpZGVCYXIgPSB0aGlzLmdldFBhcnQoUGFydHMuU0lERUJBUl9QQVJUKTtcblx0XHRjb25zdCBhdXhpbGlhcnlCYXIgPSB0aGlzLmdldFBhcnQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXHRcdGNvbnN0IG5ld1Bvc2l0aW9uVmFsdWUgPSAocG9zaXRpb24gPT09IFBvc2l0aW9uLkxFRlQpID8gJ2xlZnQnIDogJ3JpZ2h0Jztcblx0XHRjb25zdCBvbGRQb3NpdGlvblZhbHVlID0gKHBvc2l0aW9uID09PSBQb3NpdGlvbi5SSUdIVCkgPyAnbGVmdCcgOiAncmlnaHQnO1xuXHRcdGNvbnN0IHBhbmVsQWxpZ25tZW50ID0gdGhpcy5nZXRQYW5lbEFsaWdubWVudCgpO1xuXHRcdGNvbnN0IHBhbmVsUG9zaXRpb24gPSB0aGlzLmdldFBhbmVsUG9zaXRpb24oKTtcblxuXHRcdHRoaXMuc3RhdGVNb2RlbC5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlNJREVCQVJfUE9TSVRPTiwgcG9zaXRpb24pO1xuXG5cdFx0Ly8gQWRqdXN0IENTU1xuXHRcdGNvbnN0IGFjdGl2aXR5QmFyQ29udGFpbmVyID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQoYWN0aXZpdHlCYXIuZ2V0Q29udGFpbmVyKCkpO1xuXHRcdGNvbnN0IHNpZGVCYXJDb250YWluZXIgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZChzaWRlQmFyLmdldENvbnRhaW5lcigpKTtcblx0XHRjb25zdCBhdXhpbGlhcnlCYXJDb250YWluZXIgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZChhdXhpbGlhcnlCYXIuZ2V0Q29udGFpbmVyKCkpO1xuXHRcdGFjdGl2aXR5QmFyQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUob2xkUG9zaXRpb25WYWx1ZSk7XG5cdFx0c2lkZUJhckNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKG9sZFBvc2l0aW9uVmFsdWUpO1xuXHRcdGFjdGl2aXR5QmFyQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQobmV3UG9zaXRpb25WYWx1ZSk7XG5cdFx0c2lkZUJhckNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKG5ld1Bvc2l0aW9uVmFsdWUpO1xuXG5cdFx0Ly8gQXV4aWxpYXJ5IEJhciBoYXMgb3Bwb3NpdGUgdmFsdWVzXG5cdFx0YXV4aWxpYXJ5QmFyQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUobmV3UG9zaXRpb25WYWx1ZSk7XG5cdFx0YXV4aWxpYXJ5QmFyQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQob2xkUG9zaXRpb25WYWx1ZSk7XG5cblx0XHQvLyBVcGRhdGUgU3R5bGVzXG5cdFx0YWN0aXZpdHlCYXIudXBkYXRlU3R5bGVzKCk7XG5cdFx0c2lkZUJhci51cGRhdGVTdHlsZXMoKTtcblx0XHRhdXhpbGlhcnlCYXIudXBkYXRlU3R5bGVzKCk7XG5cblx0XHQvLyBNb3ZlIGFjdGl2aXR5IGJhciBhbmQgc2lkZSBiYXJzXG5cdFx0dGhpcy5hZGp1c3RQYXJ0UG9zaXRpb25zKHBvc2l0aW9uLCBwYW5lbEFsaWdubWVudCwgcGFuZWxQb3NpdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVdpbmRvd0JvcmRlcihza2lwTGF5b3V0ID0gZmFsc2UpIHtcblx0XHRjb25zdCB0aGVtZSA9IHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblx0XHRjb25zdCBkaWRIYXZlTWFpbldpbmRvd0JvcmRlciA9IHRoaXMuaGFzTWFpbldpbmRvd0JvcmRlcigpO1xuXHRcdGNvbnN0IHN1cHByZXNzTWFpbldpbmRvd0JvcmRlciA9IHRoaXMuaXNGbG9hdGluZ1BhbmVsc0VuYWJsZWQoKSAmJiAhaXNIaWdoQ29udHJhc3QodGhlbWUudHlwZSk7XG5cblx0XHRpZiAoXG5cdFx0XHRpc1dlYiB8fFxuXHRcdFx0aXNXaW5kb3dzIHx8IFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQvLyBub3Qgd29ya2luZyB3ZWxsIHdpdGggem9vbWluZyAoYm9yZGVyIG9mdGVuIG5vdCB2aXNpYmxlKVxuXHRcdFx0KFxuXHRcdFx0XHQoaXNXaW5kb3dzIHx8IGlzTGludXgpICYmXG5cdFx0XHRcdHVzZVdpbmRvd0NvbnRyb2xzT3ZlcmxheSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKVx0Ly8gV2luZG93cy9MaW51eDogbm90IHdvcmtpbmcgd2l0aCBXQ08gKGJvcmRlciBjYW5ub3QgZHJhdyBvdmVyIHRoZSBvdmVybGF5KVxuXHRcdFx0KSB8fFxuXHRcdFx0aGFzTmF0aXZlVGl0bGViYXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSlcblx0XHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhY3RpdmVCb3JkZXIgPSB0aGVtZS5nZXRDb2xvcihXSU5ET1dfQUNUSVZFX0JPUkRFUik7XG5cdFx0Y29uc3QgaW5hY3RpdmVCb3JkZXIgPSB0aGVtZS5nZXRDb2xvcihXSU5ET1dfSU5BQ1RJVkVfQk9SREVSKTtcblxuXHRcdGZvciAoY29uc3QgY29udGFpbmVyIG9mIHRoaXMuY29udGFpbmVycykge1xuXHRcdFx0Y29uc3QgaXNNYWluQ29udGFpbmVyID0gY29udGFpbmVyID09PSB0aGlzLm1haW5Db250YWluZXI7XG5cdFx0XHRjb25zdCBpc0FjdGl2ZUNvbnRhaW5lciA9IHRoaXMuYWN0aXZlQ29udGFpbmVyID09PSBjb250YWluZXI7XG5cblx0XHRcdGxldCB3aW5kb3dCb3JkZXIgPSBmYWxzZTtcblx0XHRcdGlmICghKGlzTWFpbkNvbnRhaW5lciAmJiBzdXBwcmVzc01haW5XaW5kb3dCb3JkZXIpICYmICF0aGlzLnN0YXRlLnJ1bnRpbWUubWFpbldpbmRvd0Z1bGxzY3JlZW4gJiYgKGFjdGl2ZUJvcmRlciB8fCBpbmFjdGl2ZUJvcmRlcikpIHtcblx0XHRcdFx0d2luZG93Qm9yZGVyID0gdHJ1ZTtcblxuXHRcdFx0XHQvLyBJZiB0aGUgaW5hY3RpdmUgY29sb3IgaXMgbWlzc2luZywgZmFsbGJhY2sgdG8gdGhlIGFjdGl2ZSBvbmVcblx0XHRcdFx0Y29uc3QgYm9yZGVyQ29sb3IgPSBpc0FjdGl2ZUNvbnRhaW5lciAmJiB0aGlzLnN0YXRlLnJ1bnRpbWUuaGFzRm9jdXMgPyBhY3RpdmVCb3JkZXIgOiBpbmFjdGl2ZUJvcmRlciA/PyBhY3RpdmVCb3JkZXI7XG5cdFx0XHRcdGNvbnRhaW5lci5zdHlsZS5zZXRQcm9wZXJ0eSgnLS13aW5kb3ctYm9yZGVyLWNvbG9yJywgYm9yZGVyQ29sb3I/LnRvU3RyaW5nKCkgPz8gJ3RyYW5zcGFyZW50Jyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb250YWluZXIuc3R5bGUucmVtb3ZlUHJvcGVydHkoJy0td2luZG93LWJvcmRlci1jb2xvcicpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXNNYWluQ29udGFpbmVyKSB7XG5cdFx0XHRcdHRoaXMuc3RhdGUucnVudGltZS5tYWluV2luZG93Qm9yZGVyID0gd2luZG93Qm9yZGVyO1xuXHRcdFx0fVxuXG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZShMYXlvdXRDbGFzc2VzLldJTkRPV19CT1JERVIsIHdpbmRvd0JvcmRlcik7XG5cdFx0fVxuXG5cdFx0aWYgKCFza2lwTGF5b3V0ICYmIGRpZEhhdmVNYWluV2luZG93Qm9yZGVyICE9PSB0aGlzLmhhc01haW5XaW5kb3dCb3JkZXIoKSkge1xuXHRcdFx0dGhpcy5sYXlvdXQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGluaXRMYXlvdXRTdGF0ZShsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSwgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSk6IHZvaWQge1xuXHRcdHRoaXMuX21haW5Db250YWluZXJEaW1lbnNpb24gPSBnZXRDbGllbnRBcmVhKHRoaXMucGFyZW50LCB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZID8gREVGQVVMVF9FTVBUWV9XSU5ET1dfRElNRU5TSU9OUyA6IERFRkFVTFRfV09SS1NQQUNFX1dJTkRPV19ESU1FTlNJT05TKTsgLy8gcnVubmluZyB3aXRoIGZhbGxiYWNrIHRvIGVuc3VyZSBubyBlcnJvciBpcyB0aHJvd24gKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yNDAyNDIpXG5cblx0XHR0aGlzLnN0YXRlTW9kZWwgPSBuZXcgTGF5b3V0U3RhdGVNb2RlbCh0aGlzLnN0b3JhZ2VTZXJ2aWNlLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmNvbnRleHRTZXJ2aWNlLCB0aGlzLmVudmlyb25tZW50U2VydmljZSk7XG5cdFx0dGhpcy5zdGF0ZU1vZGVsLmxvYWQoe1xuXHRcdFx0bWFpbkNvbnRhaW5lckRpbWVuc2lvbjogdGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbixcblx0XHRcdHJlc2V0TGF5b3V0OiBCb29sZWFuKHRoaXMubGF5b3V0T3B0aW9ucz8ucmVzZXRMYXlvdXQpXG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0YXRlTW9kZWwub25EaWRDaGFuZ2VTdGF0ZShjaGFuZ2UgPT4ge1xuXHRcdFx0aWYgKGNoYW5nZS5rZXkgPT09IExheW91dFN0YXRlS2V5cy5BQ1RJVklUWUJBUl9ISURERU4pIHtcblx0XHRcdFx0dGhpcy5zZXRBY3Rpdml0eUJhckhpZGRlbihjaGFuZ2UudmFsdWUgYXMgYm9vbGVhbik7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaGFuZ2Uua2V5ID09PSBMYXlvdXRTdGF0ZUtleXMuU1RBVFVTQkFSX0hJRERFTikge1xuXHRcdFx0XHR0aGlzLnNldFN0YXR1c0JhckhpZGRlbihjaGFuZ2UudmFsdWUgYXMgYm9vbGVhbik7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaGFuZ2Uua2V5ID09PSBMYXlvdXRTdGF0ZUtleXMuU0lERUJBUl9QT1NJVE9OKSB7XG5cdFx0XHRcdHRoaXMuc2V0U2lkZUJhclBvc2l0aW9uKGNoYW5nZS52YWx1ZSBhcyBQb3NpdGlvbik7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaGFuZ2Uua2V5ID09PSBMYXlvdXRTdGF0ZUtleXMuUEFORUxfUE9TSVRJT04pIHtcblx0XHRcdFx0dGhpcy5zZXRQYW5lbFBvc2l0aW9uKGNoYW5nZS52YWx1ZSBhcyBQb3NpdGlvbik7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaGFuZ2Uua2V5ID09PSBMYXlvdXRTdGF0ZUtleXMuUEFORUxfQUxJR05NRU5UKSB7XG5cdFx0XHRcdHRoaXMuc2V0UGFuZWxBbGlnbm1lbnQoY2hhbmdlLnZhbHVlIGFzIFBhbmVsQWxpZ25tZW50KTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5kb1VwZGF0ZUxheW91dENvbmZpZ3VyYXRpb24oKTtcblx0XHR9KSk7XG5cblx0XHQvLyBMYXlvdXQgSW5pdGlhbGl6YXRpb24gU3RhdGVcblx0XHRjb25zdCBpbml0aWFsRWRpdG9yc1N0YXRlID0gdGhpcy5nZXRJbml0aWFsRWRpdG9yc1N0YXRlKCk7XG5cdFx0aWYgKGluaXRpYWxFZGl0b3JzU3RhdGUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnSW5pdGlhbCBlZGl0b3Igc3RhdGUnLCBpbml0aWFsRWRpdG9yc1N0YXRlKTtcblx0XHR9XG5cdFx0Y29uc3QgaW5pdGlhbExheW91dFN0YXRlOiBJTGF5b3V0SW5pdGlhbGl6YXRpb25TdGF0ZSA9IHtcblx0XHRcdGxheW91dDoge1xuXHRcdFx0XHRlZGl0b3JzOiBpbml0aWFsRWRpdG9yc1N0YXRlPy5sYXlvdXRcblx0XHRcdH0sXG5cdFx0XHRlZGl0b3I6IHtcblx0XHRcdFx0cmVzdG9yZUVkaXRvcnM6IHRoaXMuc2hvdWxkUmVzdG9yZUVkaXRvcnModGhpcy5jb250ZXh0U2VydmljZSwgaW5pdGlhbEVkaXRvcnNTdGF0ZSksXG5cdFx0XHRcdGVkaXRvcnNUb09wZW46IHRoaXMucmVzb2x2ZUVkaXRvcnNUb09wZW4oZmlsZVNlcnZpY2UsIGluaXRpYWxFZGl0b3JzU3RhdGUpLFxuXHRcdFx0fSxcblx0XHRcdHZpZXdzOiB7XG5cdFx0XHRcdGRlZmF1bHRzOiB0aGlzLmdldERlZmF1bHRMYXlvdXRWaWV3cyh0aGlzLmVudmlyb25tZW50U2VydmljZSwgdGhpcy5zdG9yYWdlU2VydmljZSksXG5cdFx0XHRcdGNvbnRhaW5lclRvUmVzdG9yZToge31cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gTGF5b3V0IFJ1bnRpbWUgU3RhdGVcblx0XHRjb25zdCBsYXlvdXRSdW50aW1lU3RhdGU6IElMYXlvdXRSdW50aW1lU3RhdGUgPSB7XG5cdFx0XHRhY3RpdmVDb250YWluZXJJZDogdGhpcy5nZXRBY3RpdmVDb250YWluZXJJZCgpLFxuXHRcdFx0bWFpbldpbmRvd0Z1bGxzY3JlZW46IGlzRnVsbHNjcmVlbihtYWluV2luZG93KSxcblx0XHRcdGhhc0ZvY3VzOiB0aGlzLmhvc3RTZXJ2aWNlLmhhc0ZvY3VzLFxuXHRcdFx0bWF4aW1pemVkOiBuZXcgU2V0PG51bWJlcj4oKSxcblx0XHRcdG1haW5XaW5kb3dCb3JkZXI6IGZhbHNlLFxuXHRcdFx0bWVudUJhcjoge1xuXHRcdFx0XHR0b2dnbGVkOiBmYWxzZSxcblx0XHRcdH0sXG5cdFx0XHR6ZW5Nb2RlOiB7XG5cdFx0XHRcdHRyYW5zaXRpb25EaXNwb3NhYmxlczogbmV3IERpc3Bvc2FibGVNYXAoKSxcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGhpcy5zdGF0ZSA9IHtcblx0XHRcdGluaXRpYWxpemF0aW9uOiBpbml0aWFsTGF5b3V0U3RhdGUsXG5cdFx0XHRydW50aW1lOiBsYXlvdXRSdW50aW1lU3RhdGUsXG5cdFx0fTtcblxuXHRcdC8vIFNpZGViYXIgVmlldyBDb250YWluZXIgVG8gUmVzdG9yZVxuXHRcdGlmICh0aGlzLmlzVmlzaWJsZShQYXJ0cy5TSURFQkFSX1BBUlQpKSB7XG5cdFx0XHRsZXQgdmlld0NvbnRhaW5lclRvUmVzdG9yZSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFNpZGViYXJQYXJ0LmFjdGl2ZVZpZXdsZXRTZXR0aW5nc0tleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0RGVmYXVsdFZpZXdDb250YWluZXIoVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpPy5pZCk7XG5cdFx0XHRpZiAoXG5cdFx0XHRcdCF0aGlzLmVudmlyb25tZW50U2VydmljZS5pc0J1aWx0IHx8XG5cdFx0XHRcdGxpZmVjeWNsZVNlcnZpY2Uuc3RhcnR1cEtpbmQgPT09IFN0YXJ0dXBLaW5kLlJlbG9hZGVkV2luZG93IHx8XG5cdFx0XHRcdHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQgJiYgIXRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmV4dGVuc2lvblRlc3RzTG9jYXRpb25VUklcblx0XHRcdCkge1xuXHRcdFx0XHQvLyBhbGxvdyB0byByZXN0b3JlIGEgbm9uLWRlZmF1bHQgdmlld2xldCBpbiBkZXZlbG9wbWVudCBtb2RlIG9yIHdoZW4gd2luZG93IHJlbG9hZHNcblx0XHRcdH0gZWxzZSBpZiAoXG5cdFx0XHRcdHZpZXdDb250YWluZXJUb1Jlc3RvcmUgIT09IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldERlZmF1bHRWaWV3Q29udGFpbmVyKFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKT8uaWQgJiZcblx0XHRcdFx0dmlld0NvbnRhaW5lclRvUmVzdG9yZSAhPT0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0RGVmYXVsdFZpZXdDb250YWluZXIoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcik/LmlkXG5cdFx0XHQpIHtcblx0XHRcdFx0Ly8gZmFsbGJhY2sgdG8gZGVmYXVsdCB2aWV3bGV0IG90aGVyd2lzZSBpZiB0aGUgdmlld2xldCBpcyBub3QgYSBkZWZhdWx0IHZpZXdsZXRcblx0XHRcdFx0dmlld0NvbnRhaW5lclRvUmVzdG9yZSA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldERlZmF1bHRWaWV3Q29udGFpbmVyKFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKT8uaWQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh2aWV3Q29udGFpbmVyVG9SZXN0b3JlKSB7XG5cdFx0XHRcdHRoaXMuc3RhdGUuaW5pdGlhbGl6YXRpb24udmlld3MuY29udGFpbmVyVG9SZXN0b3JlLnNpZGVCYXIgPSB2aWV3Q29udGFpbmVyVG9SZXN0b3JlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5zdGF0ZU1vZGVsLnNldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuU0lERUJBUl9ISURERU4sIHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFBhbmVsIFZpZXcgQ29udGFpbmVyIFRvIFJlc3RvcmVcblx0XHRpZiAodGhpcy5pc1Zpc2libGUoUGFydHMuUEFORUxfUEFSVCkpIHtcblx0XHRcdGNvbnN0IHZpZXdDb250YWluZXJUb1Jlc3RvcmUgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChQYW5lbFBhcnQuYWN0aXZlUGFuZWxTZXR0aW5nc0tleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0RGVmYXVsdFZpZXdDb250YWluZXIoVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsKT8uaWQpO1xuXG5cdFx0XHRpZiAodmlld0NvbnRhaW5lclRvUmVzdG9yZSkge1xuXHRcdFx0XHR0aGlzLnN0YXRlLmluaXRpYWxpemF0aW9uLnZpZXdzLmNvbnRhaW5lclRvUmVzdG9yZS5wYW5lbCA9IHZpZXdDb250YWluZXJUb1Jlc3RvcmU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnN0YXRlTW9kZWwuc2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5QQU5FTF9ISURERU4sIHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEF1eGlsaWFyeSBWaWV3IHRvIHJlc3RvcmVcblx0XHRpZiAodGhpcy5pc1Zpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpKSB7XG5cdFx0XHRjb25zdCB2aWV3Q29udGFpbmVyVG9SZXN0b3JlID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoQXV4aWxpYXJ5QmFyUGFydC5hY3RpdmVWaWV3U2V0dGluZ3NLZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldERlZmF1bHRWaWV3Q29udGFpbmVyKFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIpPy5pZCk7XG5cdFx0XHRpZiAodmlld0NvbnRhaW5lclRvUmVzdG9yZSkge1xuXHRcdFx0XHR0aGlzLnN0YXRlLmluaXRpYWxpemF0aW9uLnZpZXdzLmNvbnRhaW5lclRvUmVzdG9yZS5hdXhpbGlhcnlCYXIgPSB2aWV3Q29udGFpbmVyVG9SZXN0b3JlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5zdGF0ZU1vZGVsLnNldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuQVVYSUxJQVJZQkFSX0hJRERFTiwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gV2luZG93IGJvcmRlclxuXHRcdHRoaXMudXBkYXRlV2luZG93Qm9yZGVyKHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXREZWZhdWx0TGF5b3V0Vmlld3MoZW52aXJvbm1lbnRTZXJ2aWNlOiBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSwgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSk6IHN0cmluZ1tdIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBkZWZhdWx0TGF5b3V0ID0gZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnM/LmRlZmF1bHRMYXlvdXQ7XG5cdFx0aWYgKCFkZWZhdWx0TGF5b3V0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICghZGVmYXVsdExheW91dC5mb3JjZSAmJiAhc3RvcmFnZVNlcnZpY2UuaXNOZXcoU3RvcmFnZVNjb3BlLldPUktTUEFDRSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyB2aWV3cyB9ID0gZGVmYXVsdExheW91dDtcblx0XHRpZiAodmlld3M/Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHZpZXdzLm1hcCh2aWV3ID0+IHZpZXcuaWQpO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZFJlc3RvcmVFZGl0b3JzKGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIGluaXRpYWxFZGl0b3JzU3RhdGU6IElJbml0aWFsRWRpdG9yc1N0YXRlIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cblx0XHQvLyBSZXN0b3JlIGVkaXRvcnMgYmFzZWQgb24gYSBzZXQgb2YgcnVsZXM6XG5cdFx0Ly8gLSBuZXZlciB3aGVuIHJ1bm5pbmcgb24gdGVtcG9yYXJ5IHdvcmtzcGFjZVxuXHRcdC8vIC0gbmV2ZXIgd2hlbiBgd29ya2JlbmNoLmVkaXRvci5yZXN0b3JlRWRpdG9yc2AgaXMgZGlzYWJsZWRcblx0XHQvLyAtIG5vdCB3aGVuIHdlIGhhdmUgZmlsZXMgdG8gb3BlbiwgdW5sZXNzOlxuXHRcdC8vIC0gYWx3YXlzIHdoZW4gYHdpbmRvdy5yZXN0b3JlV2luZG93czogcHJlc2VydmVgXG5cblx0XHRpZiAoaXNUZW1wb3JhcnlXb3Jrc3BhY2UoY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oV29ya2JlbmNoTGF5b3V0U2V0dGluZ3MuRURJVE9SX1JFU1RPUkVfRURJVE9SUykgPT09IGZhbHNlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9yY2VSZXN0b3JlRWRpdG9ycyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPignd2luZG93LnJlc3RvcmVXaW5kb3dzJykgPT09ICdwcmVzZXJ2ZSc7XG5cdFx0cmV0dXJuICEhZm9yY2VSZXN0b3JlRWRpdG9ycyB8fCBpbml0aWFsRWRpdG9yc1N0YXRlID09PSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgd2lsbFJlc3RvcmVFZGl0b3JzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnN0YXRlLmluaXRpYWxpemF0aW9uLmVkaXRvci5yZXN0b3JlRWRpdG9ycztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZUVkaXRvcnNUb09wZW4oZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSwgaW5pdGlhbEVkaXRvcnNTdGF0ZTogSUluaXRpYWxFZGl0b3JzU3RhdGUgfCB1bmRlZmluZWQpOiBQcm9taXNlPElFZGl0b3JUb09wZW5bXT4ge1xuXHRcdGlmIChpbml0aWFsRWRpdG9yc1N0YXRlKSB7XG5cblx0XHRcdC8vIE1lcmdlIGVkaXRvciAoc2luZ2xlKVxuXHRcdFx0Y29uc3QgZmlsZXNUb01lcmdlID0gY29hbGVzY2UoYXdhaXQgcGF0aHNUb0VkaXRvcnMoaW5pdGlhbEVkaXRvcnNTdGF0ZS5maWxlc1RvTWVyZ2UsIGZpbGVTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpKTtcblx0XHRcdGlmIChmaWxlc1RvTWVyZ2UubGVuZ3RoID09PSA0ICYmIGlzUmVzb3VyY2VFZGl0b3JJbnB1dChmaWxlc1RvTWVyZ2VbMF0pICYmIGlzUmVzb3VyY2VFZGl0b3JJbnB1dChmaWxlc1RvTWVyZ2VbMV0pICYmIGlzUmVzb3VyY2VFZGl0b3JJbnB1dChmaWxlc1RvTWVyZ2VbMl0pICYmIGlzUmVzb3VyY2VFZGl0b3JJbnB1dChmaWxlc1RvTWVyZ2VbM10pKSB7XG5cdFx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRcdGVkaXRvcjoge1xuXHRcdFx0XHRcdFx0aW5wdXQxOiB7IHJlc291cmNlOiBmaWxlc1RvTWVyZ2VbMF0ucmVzb3VyY2UgfSxcblx0XHRcdFx0XHRcdGlucHV0MjogeyByZXNvdXJjZTogZmlsZXNUb01lcmdlWzFdLnJlc291cmNlIH0sXG5cdFx0XHRcdFx0XHRiYXNlOiB7IHJlc291cmNlOiBmaWxlc1RvTWVyZ2VbMl0ucmVzb3VyY2UgfSxcblx0XHRcdFx0XHRcdHJlc3VsdDogeyByZXNvdXJjZTogZmlsZXNUb01lcmdlWzNdLnJlc291cmNlIH0sXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRGlmZiBlZGl0b3IgKHNpbmdsZSlcblx0XHRcdGNvbnN0IGZpbGVzVG9EaWZmID0gY29hbGVzY2UoYXdhaXQgcGF0aHNUb0VkaXRvcnMoaW5pdGlhbEVkaXRvcnNTdGF0ZS5maWxlc1RvRGlmZiwgZmlsZVNlcnZpY2UsIHRoaXMubG9nU2VydmljZSkpO1xuXHRcdFx0aWYgKGZpbGVzVG9EaWZmLmxlbmd0aCA9PT0gMikge1xuXHRcdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0XHRlZGl0b3I6IHtcblx0XHRcdFx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBmaWxlc1RvRGlmZlswXS5yZXNvdXJjZSB9LFxuXHRcdFx0XHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IGZpbGVzVG9EaWZmWzFdLnJlc291cmNlIH0sXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTm9ybWFsIGVkaXRvciAobXVsdGlwbGUpXG5cdFx0XHRjb25zdCBmaWxlc1RvT3Blbk9yQ3JlYXRlOiBJRWRpdG9yVG9PcGVuW10gPSBbXTtcblx0XHRcdGNvbnN0IHJlc29sdmVkRmlsZXNUb09wZW5PckNyZWF0ZSA9IGF3YWl0IHBhdGhzVG9FZGl0b3JzKGluaXRpYWxFZGl0b3JzU3RhdGUuZmlsZXNUb09wZW5PckNyZWF0ZSwgZmlsZVNlcnZpY2UsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHJlc29sdmVkRmlsZXNUb09wZW5PckNyZWF0ZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCByZXNvbHZlZEZpbGVUb09wZW5PckNyZWF0ZSA9IHJlc29sdmVkRmlsZXNUb09wZW5PckNyZWF0ZVtpXTtcblx0XHRcdFx0aWYgKHJlc29sdmVkRmlsZVRvT3Blbk9yQ3JlYXRlKSB7XG5cdFx0XHRcdFx0ZmlsZXNUb09wZW5PckNyZWF0ZS5wdXNoKHtcblx0XHRcdFx0XHRcdGVkaXRvcjogcmVzb2x2ZWRGaWxlVG9PcGVuT3JDcmVhdGUsXG5cdFx0XHRcdFx0XHR2aWV3Q29sdW1uOiBpbml0aWFsRWRpdG9yc1N0YXRlLmZpbGVzVG9PcGVuT3JDcmVhdGU/LltpXS52aWV3Q29sdW1uIC8vIHRha2Ugb3ZlciBgdmlld0NvbHVtbmAgZnJvbSBpbml0aWFsIHN0YXRlXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGZpbGVzVG9PcGVuT3JDcmVhdGU7XG5cdFx0fVxuXG5cdFx0Ly8gRW1wdHkgd29ya2JlbmNoIGNvbmZpZ3VyZWQgdG8gb3BlbiB1bnRpdGxlZCBmaWxlIGlmIGVtcHR5XG5cdFx0ZWxzZSBpZiAodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSAmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCd3b3JrYmVuY2guc3RhcnR1cEVkaXRvcicpID09PSAnbmV3VW50aXRsZWRGaWxlJykge1xuXHRcdFx0aWYgKHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmhhc1Jlc3RvcmFibGVTdGF0ZSkge1xuXHRcdFx0XHRyZXR1cm4gW107IC8vIGRvIG5vdCBvcGVuIGFueSBlbXB0eSB1bnRpdGxlZCBmaWxlIGlmIHdlIHJlc3RvcmVkIGdyb3Vwcy9lZGl0b3JzIGZyb20gcHJldmlvdXMgc2Vzc2lvblxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0ZWRpdG9yOiB7IHJlc291cmNlOiB1bmRlZmluZWQgfSAvLyBvcGVuIGVtcHR5IHVudGl0bGVkIGZpbGVcblx0XHRcdH1dO1xuXHRcdH1cblxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHByaXZhdGUgX29wZW5lZERlZmF1bHRFZGl0b3JzOiBib29sZWFuID0gZmFsc2U7XG5cdGdldCBvcGVuZWREZWZhdWx0RWRpdG9ycygpIHsgcmV0dXJuIHRoaXMuX29wZW5lZERlZmF1bHRFZGl0b3JzOyB9XG5cblx0cHJpdmF0ZSBnZXRJbml0aWFsRWRpdG9yc1N0YXRlKCk6IElJbml0aWFsRWRpdG9yc1N0YXRlIHwgdW5kZWZpbmVkIHtcblxuXHRcdC8vIENoZWNrIGZvciBlZGl0b3JzIC8gZWRpdG9yIGxheW91dCBmcm9tIGBkZWZhdWx0TGF5b3V0YCBvcHRpb25zIGZpcnN0XG5cdFx0Y29uc3QgZGVmYXVsdExheW91dCA9IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnM/LmRlZmF1bHRMYXlvdXQ7XG5cdFx0aWYgKChkZWZhdWx0TGF5b3V0Py5lZGl0b3JzPy5sZW5ndGggfHwgZGVmYXVsdExheW91dD8ubGF5b3V0Py5lZGl0b3JzKSAmJiAoZGVmYXVsdExheW91dC5mb3JjZSB8fCB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmlzTmV3KFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpKSkge1xuXHRcdFx0dGhpcy5fb3BlbmVkRGVmYXVsdEVkaXRvcnMgPSB0cnVlO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRsYXlvdXQ6IGRlZmF1bHRMYXlvdXQubGF5b3V0Py5lZGl0b3JzLFxuXHRcdFx0XHRmaWxlc1RvT3Blbk9yQ3JlYXRlOiBkZWZhdWx0TGF5b3V0Py5lZGl0b3JzPy5tYXAoZWRpdG9yID0+IHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0dmlld0NvbHVtbjogZWRpdG9yLnZpZXdDb2x1bW4sXG5cdFx0XHRcdFx0XHRmaWxlVXJpOiBVUkkucmV2aXZlKGVkaXRvci51cmkpLFxuXHRcdFx0XHRcdFx0b3Blbk9ubHlJZkV4aXN0czogZWRpdG9yLm9wZW5Pbmx5SWZFeGlzdHMsXG5cdFx0XHRcdFx0XHRvcHRpb25zOiBlZGl0b3Iub3B0aW9uc1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0pXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIFRoZW4gY2hlY2sgZm9yIGZpbGVzIHRvIG9wZW4sIGNyZWF0ZSBvciBkaWZmL21lcmdlIGZyb20gbWFpbiBzaWRlXG5cdFx0Y29uc3QgeyBmaWxlc1RvT3Blbk9yQ3JlYXRlLCBmaWxlc1RvRGlmZiwgZmlsZXNUb01lcmdlIH0gPSB0aGlzLmVudmlyb25tZW50U2VydmljZTtcblx0XHRpZiAoZmlsZXNUb09wZW5PckNyZWF0ZSB8fCBmaWxlc1RvRGlmZiB8fCBmaWxlc1RvTWVyZ2UpIHtcblx0XHRcdHJldHVybiB7IGZpbGVzVG9PcGVuT3JDcmVhdGUsIGZpbGVzVG9EaWZmLCBmaWxlc1RvTWVyZ2UgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSB3aGVuUmVhZHlQcm9taXNlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgd2hlblJlYWR5ID0gdGhpcy53aGVuUmVhZHlQcm9taXNlLnA7XG5cblx0cHJpdmF0ZSByZWFkb25seSB3aGVuUmVzdG9yZWRQcm9taXNlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRyZWFkb25seSB3aGVuUmVzdG9yZWQgPSB0aGlzLndoZW5SZXN0b3JlZFByb21pc2UucDtcblx0cHJpdmF0ZSByZXN0b3JlZCA9IGZhbHNlO1xuXG5cdGlzUmVzdG9yZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMucmVzdG9yZWQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVzdG9yZVBhcnRzKCk6IHZvaWQge1xuXG5cdFx0Ly8gZGlzdGluZ3Vpc2ggbG9uZyBydW5uaW5nIHJlc3RvcmUgb3BlcmF0aW9ucyB0aGF0XG5cdFx0Ly8gYXJlIHJlcXVpcmVkIGZvciB0aGUgbGF5b3V0IHRvIGJlIHJlYWR5IGZyb20gdGhvc2Vcblx0XHQvLyB0aGF0IGFyZSBuZWVkZWQgdG8gc2lnbmFsIHJlc3RvcmluZyBpcyBkb25lXG5cdFx0Y29uc3QgbGF5b3V0UmVhZHlQcm9taXNlczogUHJvbWlzZTx1bmtub3duPltdID0gW107XG5cdFx0Y29uc3QgbGF5b3V0UmVzdG9yZWRQcm9taXNlczogUHJvbWlzZTx1bmtub3duPltdID0gW107XG5cblx0XHQvLyBSZXN0b3JlIGVkaXRvcnNcblx0XHRsYXlvdXRSZWFkeVByb21pc2VzLnB1c2goKGFzeW5jICgpID0+IHtcblx0XHRcdG1hcmsoJ2NvZGUvd2lsbFJlc3RvcmVFZGl0b3JzJyk7XG5cblx0XHRcdC8vIGZpcnN0IGVuc3VyZSB0aGUgZWRpdG9yIHBhcnQgaXMgcmVhZHlcblx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLndoZW5SZWFkeTtcblx0XHRcdG1hcmsoJ2NvZGUvcmVzdG9yZUVkaXRvcnMvZWRpdG9yR3JvdXBzUmVhZHknKTtcblxuXHRcdFx0Ly8gYXBwbHkgZWRpdG9yIGxheW91dCBpZiBhbnlcblx0XHRcdGlmICh0aGlzLnN0YXRlLmluaXRpYWxpemF0aW9uLmxheW91dD8uZWRpdG9ycykge1xuXHRcdFx0XHR0aGlzLmVkaXRvckdyb3VwU2VydmljZS5tYWluUGFydC5hcHBseUxheW91dCh0aGlzLnN0YXRlLmluaXRpYWxpemF0aW9uLmxheW91dC5lZGl0b3JzKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdGhlbiBzZWUgZm9yIGVkaXRvcnMgdG8gb3BlbiBhcyBpbnN0cnVjdGVkXG5cdFx0XHQvLyBpdCBpcyBpbXBvcnRhbnQgdGhhdCB3ZSB0cmlnZ2VyIHRoaXMgZnJvbVxuXHRcdFx0Ly8gdGhlIG92ZXJhbGwgcmVzdG9yZSBmbG93IHRvIHJlZHVjZSBwb3NzaWJsZVxuXHRcdFx0Ly8gZmxpY2tlciBvbiBzdGFydHVwOiB3ZSB3YW50IGFueSBlZGl0b3IgdG9cblx0XHRcdC8vIG9wZW4gdG8gZ2V0IGEgY2hhbmNlIHRvIG9wZW4gZmlyc3QgYmVmb3JlXG5cdFx0XHQvLyBzaWduYWxpbmcgdGhhdCBsYXlvdXQgaXMgcmVzdG9yZWQsIGJ1dCB3ZSBkb1xuXHRcdFx0Ly8gbm90IG5lZWQgdG8gYXdhaXQgdGhlIGVkaXRvcnMgZnJvbSBoYXZpbmdcblx0XHRcdC8vIGZ1bGx5IGxvYWRlZC5cblxuXHRcdFx0Y29uc3QgZWRpdG9ycyA9IGF3YWl0IHRoaXMuc3RhdGUuaW5pdGlhbGl6YXRpb24uZWRpdG9yLmVkaXRvcnNUb09wZW47XG5cdFx0XHRtYXJrKCdjb2RlL3Jlc3RvcmVFZGl0b3JzL2VkaXRvcnNUb09wZW5SZXNvbHZlZCcpO1xuXG5cdFx0XHRsZXQgb3BlbkVkaXRvcnNQcm9taXNlOiBQcm9taXNlPHVua25vd24+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGVkaXRvcnMubGVuZ3RoKSB7XG5cblx0XHRcdFx0Ly8gd2UgaGF2ZSB0byBtYXAgZWRpdG9ycyB0byB0aGVpciBncm91cHMgYXMgaW5zdHJ1Y3RlZFxuXHRcdFx0XHQvLyBieSB0aGUgaW5wdXQuIHRoaXMgaXMgaW1wb3J0YW50IHRvIGVuc3VyZSB0aGF0IHdlIG9wZW5cblx0XHRcdFx0Ly8gdGhlIGVkaXRvcnMgaW4gdGhlIGdyb3VwcyB0aGV5IGJlbG9uZyB0by5cblxuXHRcdFx0XHRjb25zdCBlZGl0b3JHcm91cHNJblZpc3VhbE9yZGVyID0gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UubWFpblBhcnQuZ2V0R3JvdXBzKEdyb3Vwc09yZGVyLkdSSURfQVBQRUFSQU5DRSk7XG5cdFx0XHRcdGNvbnN0IG1hcEVkaXRvcnNUb0dyb3VwID0gbmV3IE1hcDxHcm91cElkZW50aWZpZXIsIFNldDxJVW50eXBlZEVkaXRvcklucHV0Pj4oKTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBlZGl0b3JzKSB7XG5cdFx0XHRcdFx0Y29uc3QgZ3JvdXAgPSBlZGl0b3JHcm91cHNJblZpc3VhbE9yZGVyWyhlZGl0b3Iudmlld0NvbHVtbiA/PyAxKSAtIDFdOyAvLyB2aWV3Q29sdW1uIGlzIGluZGV4KzEgYmFzZWRcblxuXHRcdFx0XHRcdGxldCBlZGl0b3JzQnlHcm91cCA9IG1hcEVkaXRvcnNUb0dyb3VwLmdldChncm91cC5pZCk7XG5cdFx0XHRcdFx0aWYgKCFlZGl0b3JzQnlHcm91cCkge1xuXHRcdFx0XHRcdFx0ZWRpdG9yc0J5R3JvdXAgPSBuZXcgU2V0PElVbnR5cGVkRWRpdG9ySW5wdXQ+KCk7XG5cdFx0XHRcdFx0XHRtYXBFZGl0b3JzVG9Hcm91cC5zZXQoZ3JvdXAuaWQsIGVkaXRvcnNCeUdyb3VwKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRlZGl0b3JzQnlHcm91cC5hZGQoZWRpdG9yLmVkaXRvcik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRvcGVuRWRpdG9yc1Byb21pc2UgPSBQcm9taXNlLmFsbChBcnJheS5mcm9tKG1hcEVkaXRvcnNUb0dyb3VwKS5tYXAoYXN5bmMgKFtncm91cElkLCBlZGl0b3JzXSkgPT4ge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcnMoQXJyYXkuZnJvbShlZGl0b3JzKSwgZ3JvdXBJZCwgeyB2YWxpZGF0ZVRydXN0OiB0cnVlIH0pO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBkbyBub3QgYmxvY2sgdGhlIG92ZXJhbGwgbGF5b3V0IHJlYWR5IGZsb3cgZnJvbSBwb3RlbnRpYWxseVxuXHRcdFx0Ly8gc2xvdyBlZGl0b3JzIHRvIHJlc29sdmUgb24gc3RhcnR1cFxuXHRcdFx0bGF5b3V0UmVzdG9yZWRQcm9taXNlcy5wdXNoKFxuXHRcdFx0XHRQcm9taXNlLmFsbChbXG5cdFx0XHRcdFx0b3BlbkVkaXRvcnNQcm9taXNlPy5maW5hbGx5KCgpID0+IG1hcmsoJ2NvZGUvcmVzdG9yZUVkaXRvcnMvZWRpdG9yc09wZW5lZCcpKSxcblx0XHRcdFx0XHR0aGlzLmVkaXRvckdyb3VwU2VydmljZS53aGVuUmVzdG9yZWQuZmluYWxseSgoKSA9PiBtYXJrKCdjb2RlL3Jlc3RvcmVFZGl0b3JzL2VkaXRvckdyb3Vwc1Jlc3RvcmVkJykpXG5cdFx0XHRcdF0pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHRcdC8vIHRoZSBgY29kZS9kaWRSZXN0b3JlRWRpdG9yc2AgcGVyZiBtYXJrIGlzIHNwZWNpZmljYWxseVxuXHRcdFx0XHRcdC8vIGZvciB3aGVuIHZpc2libGUgZWRpdG9ycyBoYXZlIHJlc29sdmVkLCBzbyB3ZSBvbmx5IG1hcmtcblx0XHRcdFx0XHQvLyBpZiB3aGVuIGVkaXRvciBncm91cCBzZXJ2aWNlIGhhcyByZXN0b3JlZC5cblx0XHRcdFx0XHRtYXJrKCdjb2RlL2RpZFJlc3RvcmVFZGl0b3JzJyk7XG5cdFx0XHRcdH0pXG5cdFx0XHQpO1xuXHRcdH0pKCkpO1xuXG5cdFx0Ly8gUmVzdG9yZSBkZWZhdWx0IHZpZXdzIChvbmx5IHdoZW4gYElEZWZhdWx0TGF5b3V0YCBpcyBwcm92aWRlZClcblx0XHRjb25zdCByZXN0b3JlRGVmYXVsdFZpZXdzUHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5zdGF0ZS5pbml0aWFsaXphdGlvbi52aWV3cy5kZWZhdWx0cz8ubGVuZ3RoKSB7XG5cdFx0XHRcdG1hcmsoJ2NvZGUvd2lsbE9wZW5EZWZhdWx0Vmlld3MnKTtcblxuXHRcdFx0XHRjb25zdCBsb2NhdGlvbnNSZXN0b3JlZDogeyBpZDogc3RyaW5nOyBvcmRlcjogbnVtYmVyIH1bXSA9IFtdO1xuXG5cdFx0XHRcdGNvbnN0IHRyeU9wZW5WaWV3ID0gKHZpZXc6IHsgaWQ6IHN0cmluZzsgb3JkZXI6IG51bWJlciB9KTogYm9vbGVhbiA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3TG9jYXRpb25CeUlkKHZpZXcuaWQpO1xuXHRcdFx0XHRcdGlmIChsb2NhdGlvbiAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKHZpZXcuaWQpO1xuXHRcdFx0XHRcdFx0aWYgKGNvbnRhaW5lcikge1xuXHRcdFx0XHRcdFx0XHRpZiAodmlldy5vcmRlciA+PSAobG9jYXRpb25zUmVzdG9yZWQ/Lltsb2NhdGlvbl0/Lm9yZGVyID8/IDApKSB7XG5cdFx0XHRcdFx0XHRcdFx0bG9jYXRpb25zUmVzdG9yZWRbbG9jYXRpb25dID0geyBpZDogY29udGFpbmVyLmlkLCBvcmRlcjogdmlldy5vcmRlciB9O1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0Y29uc3QgY29udGFpbmVyTW9kZWwgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwoY29udGFpbmVyKTtcblx0XHRcdFx0XHRcdFx0Y29udGFpbmVyTW9kZWwuc2V0Q29sbGFwc2VkKHZpZXcuaWQsIGZhbHNlKTtcblx0XHRcdFx0XHRcdFx0Y29udGFpbmVyTW9kZWwuc2V0VmlzaWJsZSh2aWV3LmlkLCB0cnVlKTtcblxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgZGVmYXVsdFZpZXdzID0gWy4uLnRoaXMuc3RhdGUuaW5pdGlhbGl6YXRpb24udmlld3MuZGVmYXVsdHNdLnJldmVyc2UoKS5tYXAoKHYsIGluZGV4KSA9PiAoeyBpZDogdiwgb3JkZXI6IGluZGV4IH0pKTtcblxuXHRcdFx0XHRsZXQgaSA9IGRlZmF1bHRWaWV3cy5sZW5ndGg7XG5cdFx0XHRcdHdoaWxlIChpKSB7XG5cdFx0XHRcdFx0aS0tO1xuXHRcdFx0XHRcdGlmICh0cnlPcGVuVmlldyhkZWZhdWx0Vmlld3NbaV0pKSB7XG5cdFx0XHRcdFx0XHRkZWZhdWx0Vmlld3Muc3BsaWNlKGksIDEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIElmIHdlIHN0aWxsIGhhdmUgdmlld3MgbGVmdCBvdmVyLCB3YWl0IHVudGlsIGFsbCBleHRlbnNpb25zIGhhdmUgYmVlbiByZWdpc3RlcmVkIGFuZCB0cnkgYWdhaW5cblx0XHRcdFx0aWYgKGRlZmF1bHRWaWV3cy5sZW5ndGgpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCk7XG5cblx0XHRcdFx0XHRsZXQgaSA9IGRlZmF1bHRWaWV3cy5sZW5ndGg7XG5cdFx0XHRcdFx0d2hpbGUgKGkpIHtcblx0XHRcdFx0XHRcdGktLTtcblx0XHRcdFx0XHRcdGlmICh0cnlPcGVuVmlldyhkZWZhdWx0Vmlld3NbaV0pKSB7XG5cdFx0XHRcdFx0XHRcdGRlZmF1bHRWaWV3cy5zcGxpY2UoaSwgMSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSWYgd2Ugb3BlbmVkIGEgdmlldyBpbiB0aGUgc2lkZWJhciwgc3RvcCBhbnkgcmVzdG9yZSB0aGVyZVxuXHRcdFx0XHRpZiAobG9jYXRpb25zUmVzdG9yZWRbVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXJdKSB7XG5cdFx0XHRcdFx0dGhpcy5zdGF0ZS5pbml0aWFsaXphdGlvbi52aWV3cy5jb250YWluZXJUb1Jlc3RvcmUuc2lkZUJhciA9IGxvY2F0aW9uc1Jlc3RvcmVkW1ZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyXS5pZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIElmIHdlIG9wZW5lZCBhIHZpZXcgaW4gdGhlIHBhbmVsLCBzdG9wIGFueSByZXN0b3JlIHRoZXJlXG5cdFx0XHRcdGlmIChsb2NhdGlvbnNSZXN0b3JlZFtWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWxdKSB7XG5cdFx0XHRcdFx0dGhpcy5zdGF0ZS5pbml0aWFsaXphdGlvbi52aWV3cy5jb250YWluZXJUb1Jlc3RvcmUucGFuZWwgPSBsb2NhdGlvbnNSZXN0b3JlZFtWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWxdLmlkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSWYgd2Ugb3BlbmVkIGEgdmlldyBpbiB0aGUgYXV4aWxpYXJ5IGJhciwgc3RvcCBhbnkgcmVzdG9yZSB0aGVyZVxuXHRcdFx0XHRpZiAobG9jYXRpb25zUmVzdG9yZWRbVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcl0pIHtcblx0XHRcdFx0XHR0aGlzLnN0YXRlLmluaXRpYWxpemF0aW9uLnZpZXdzLmNvbnRhaW5lclRvUmVzdG9yZS5hdXhpbGlhcnlCYXIgPSBsb2NhdGlvbnNSZXN0b3JlZFtWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyXS5pZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdG1hcmsoJ2NvZGUvZGlkT3BlbkRlZmF1bHRWaWV3cycpO1xuXHRcdFx0fVxuXHRcdH0pKCk7XG5cdFx0bGF5b3V0UmVhZHlQcm9taXNlcy5wdXNoKHJlc3RvcmVEZWZhdWx0Vmlld3NQcm9taXNlKTtcblxuXHRcdC8vIFJlc3RvcmUgU2lkZWJhclxuXHRcdGxheW91dFJlYWR5UHJvbWlzZXMucHVzaCgoYXN5bmMgKCkgPT4ge1xuXG5cdFx0XHQvLyBSZXN0b3Jpbmcgdmlld3MgY291bGQgbWVhbiB0aGF0IHNpZGViYXIgYWxyZWFkeVxuXHRcdFx0Ly8gcmVzdG9yZWQsIGFzIHN1Y2ggd2UgbmVlZCB0byB0ZXN0IGFnYWluXG5cdFx0XHRhd2FpdCByZXN0b3JlRGVmYXVsdFZpZXdzUHJvbWlzZTtcblx0XHRcdGlmICghdGhpcy5zdGF0ZS5pbml0aWFsaXphdGlvbi52aWV3cy5jb250YWluZXJUb1Jlc3RvcmUuc2lkZUJhcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdG1hcmsoJ2NvZGUvd2lsbFJlc3RvcmVWaWV3bGV0Jyk7XG5cblx0XHRcdGF3YWl0IHRoaXMub3BlblZpZXdDb250YWluZXIoVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIsIHRoaXMuc3RhdGUuaW5pdGlhbGl6YXRpb24udmlld3MuY29udGFpbmVyVG9SZXN0b3JlLnNpZGVCYXIpO1xuXG5cdFx0XHRtYXJrKCdjb2RlL2RpZFJlc3RvcmVWaWV3bGV0Jyk7XG5cdFx0fSkoKSk7XG5cblx0XHQvLyBSZXN0b3JlIFBhbmVsXG5cdFx0bGF5b3V0UmVhZHlQcm9taXNlcy5wdXNoKChhc3luYyAoKSA9PiB7XG5cblx0XHRcdC8vIFJlc3RvcmluZyB2aWV3cyBjb3VsZCBtZWFuIHRoYXQgcGFuZWwgYWxyZWFkeVxuXHRcdFx0Ly8gcmVzdG9yZWQsIGFzIHN1Y2ggd2UgbmVlZCB0byB0ZXN0IGFnYWluXG5cdFx0XHRhd2FpdCByZXN0b3JlRGVmYXVsdFZpZXdzUHJvbWlzZTtcblx0XHRcdGlmICghdGhpcy5zdGF0ZS5pbml0aWFsaXphdGlvbi52aWV3cy5jb250YWluZXJUb1Jlc3RvcmUucGFuZWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRtYXJrKCdjb2RlL3dpbGxSZXN0b3JlUGFuZWwnKTtcblxuXHRcdFx0YXdhaXQgdGhpcy5vcGVuVmlld0NvbnRhaW5lcihWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwsIHRoaXMuc3RhdGUuaW5pdGlhbGl6YXRpb24udmlld3MuY29udGFpbmVyVG9SZXN0b3JlLnBhbmVsKTtcblxuXHRcdFx0bWFyaygnY29kZS9kaWRSZXN0b3JlUGFuZWwnKTtcblx0XHR9KSgpKTtcblxuXHRcdC8vIFJlc3RvcmUgQXV4aWxpYXJ5IEJhclxuXHRcdGxheW91dFJlYWR5UHJvbWlzZXMucHVzaCgoYXN5bmMgKCkgPT4ge1xuXG5cdFx0XHQvLyBSZXN0b3Jpbmcgdmlld3MgY291bGQgbWVhbiB0aGF0IGF1eGJhciBhbHJlYWR5XG5cdFx0XHQvLyByZXN0b3JlZCwgYXMgc3VjaCB3ZSBuZWVkIHRvIHRlc3QgYWdhaW5cblx0XHRcdGF3YWl0IHJlc3RvcmVEZWZhdWx0Vmlld3NQcm9taXNlO1xuXHRcdFx0aWYgKCF0aGlzLnN0YXRlLmluaXRpYWxpemF0aW9uLnZpZXdzLmNvbnRhaW5lclRvUmVzdG9yZS5hdXhpbGlhcnlCYXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRtYXJrKCdjb2RlL3dpbGxSZXN0b3JlQXV4aWxpYXJ5QmFyJyk7XG5cblx0XHRcdGF3YWl0IHRoaXMub3BlblZpZXdDb250YWluZXIoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhciwgdGhpcy5zdGF0ZS5pbml0aWFsaXphdGlvbi52aWV3cy5jb250YWluZXJUb1Jlc3RvcmUuYXV4aWxpYXJ5QmFyKTtcblxuXHRcdFx0bWFyaygnY29kZS9kaWRSZXN0b3JlQXV4aWxpYXJ5QmFyJyk7XG5cdFx0fSkoKSk7XG5cblx0XHQvLyBSZXN0b3JlIFplbiBNb2RlXG5cdFx0Y29uc3QgemVuTW9kZVdhc0FjdGl2ZSA9IHRoaXMuaXNaZW5Nb2RlQWN0aXZlKCk7XG5cdFx0Y29uc3QgcmVzdG9yZVplbk1vZGUgPSBnZXRaZW5Nb2RlQ29uZmlndXJhdGlvbih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKS5yZXN0b3JlO1xuXG5cdFx0aWYgKHplbk1vZGVXYXNBY3RpdmUpIHtcblx0XHRcdHRoaXMuc2V0WmVuTW9kZUFjdGl2ZSghcmVzdG9yZVplbk1vZGUpO1xuXHRcdFx0dGhpcy50b2dnbGVaZW5Nb2RlKGZhbHNlLCB0cnVlKTtcblx0XHR9XG5cblx0XHQvLyBSZXN0b3JlIE1haW4gRWRpdG9yIENlbnRlciBNb2RlXG5cdFx0aWYgKHRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLk1BSU5fRURJVE9SX0NFTlRFUkVEKSkge1xuXHRcdFx0dGhpcy5jZW50ZXJNYWluRWRpdG9yTGF5b3V0KHRydWUsIHRydWUpO1xuXHRcdH1cblxuXHRcdC8vIEF3YWl0IGZvciBwcm9taXNlcyB0aGF0IHdlIHJlY29yZGVkIHRvIHVwZGF0ZVxuXHRcdC8vIG91ciByZWFkeSBhbmQgcmVzdG9yZWQgc3RhdGVzIHByb3Blcmx5LlxuXHRcdFByb21pc2VzLnNldHRsZWQobGF5b3V0UmVhZHlQcm9taXNlcykuZmluYWxseSgoKSA9PiB7XG5cblx0XHRcdC8vIEZvY3VzIHRoZSBhY3RpdmUgbWF4aW1pemVkIHBhcnQgaW4gY2FzZSB3ZSBoYXZlXG5cdFx0XHQvLyBub3QgeWV0IGZvY3VzZWQgYSBzcGVjaWZpYyBlbGVtZW50IGFuZCBwYW5lbFxuXHRcdFx0Ly8gb3IgYXV4aWxpYXJ5IGJhciBhcmUgbWF4aW1pemVkLlxuXHRcdFx0aWYgKGdldEFjdGl2ZUVsZW1lbnQoKSA9PT0gbWFpbldpbmRvdy5kb2N1bWVudC5ib2R5ICYmICh0aGlzLmlzUGFuZWxNYXhpbWl6ZWQoKSB8fCB0aGlzLmlzQXV4aWxpYXJ5QmFyTWF4aW1pemVkKCkpKSB7XG5cdFx0XHRcdHRoaXMuZm9jdXMoKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy53aGVuUmVhZHlQcm9taXNlLmNvbXBsZXRlKCk7XG5cblx0XHRcdFByb21pc2VzLnNldHRsZWQobGF5b3V0UmVzdG9yZWRQcm9taXNlcykuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHR0aGlzLmVkaXRvclNlcnZpY2UuZWRpdG9ycy5sZW5ndGggPT09IDAgJiYgXHRcdFx0Ly8gbm8gZWRpdG9ycyBvcGVuZWQgb3IgcmVzdG9yZWRcblx0XHRcdFx0XHR0aGlzLmlzVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCkgJiYgXHRcdFx0Ly8gYXV4aWxpYXJ5IGJhciBpcyB2aXNpYmxlXG5cdFx0XHRcdFx0IXRoaXMuaGFzRm9jdXMoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpICYmIFx0XHRcdC8vIGF1eGlsaWFyeSBiYXIgZG9lcyBub3QgaGF2ZSBmb2N1cyB5ZXRcblx0XHRcdFx0XHQhdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZW5hYmxlU21va2VUZXN0RHJpdmVyIFx0XHQvLyBub3QgaW4gc21va2UgdGVzdCBtb2RlICh3aGVyZSBmb2N1cyBpcyBzZW5zaXRpdmUpXG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdHRoaXMuZm9jdXNQYXJ0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMucmVzdG9yZWQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLndoZW5SZXN0b3JlZFByb21pc2UuY29tcGxldGUoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuVmlld0NvbnRhaW5lcihsb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uLCBpZDogc3RyaW5nLCBmb2N1cz86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgdmlld0NvbnRhaW5lciA9IGF3YWl0IHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2Uub3BlblBhbmVDb21wb3NpdGUoaWQsIGxvY2F0aW9uLCBmb2N1cyk7XG5cdFx0aWYgKHZpZXdDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBmYWxsYmFjayB0byBkZWZhdWx0IHZpZXcgY29udGFpbmVyXG5cdFx0dmlld0NvbnRhaW5lciA9IGF3YWl0IHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2Uub3BlblBhbmVDb21wb3NpdGUodGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0RGVmYXVsdFZpZXdDb250YWluZXIobG9jYXRpb24pPy5pZCwgbG9jYXRpb24sIGZvY3VzKTtcblx0XHRpZiAodmlld0NvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIGZpbmFsbHkgdHJ5IHRvIGp1c3Qgb3BlbiB0aGUgZmlyc3QgdmlzaWJsZSB2aWV3IGNvbnRhaW5lclxuXHRcdGF3YWl0IHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2Uub3BlblBhbmVDb21wb3NpdGUodGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5nZXRWaXNpYmxlUGFuZUNvbXBvc2l0ZUlkcyhsb2NhdGlvbikuYXQoMCksIGxvY2F0aW9uLCBmb2N1cyk7XG5cdH1cblxuXHRyZWdpc3RlclBhcnQocGFydDogUGFydCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBpZCA9IHBhcnQuZ2V0SWQoKTtcblx0XHR0aGlzLnBhcnRzLnNldChpZCwgcGFydCk7XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHRoaXMucGFydHMuZGVsZXRlKGlkKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0UGFydChrZXk6IFBhcnRzKTogUGFydCB7XG5cdFx0Y29uc3QgcGFydCA9IHRoaXMucGFydHMuZ2V0KGtleSk7XG5cdFx0aWYgKCFwYXJ0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gcGFydCAke2tleX1gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcGFydDtcblx0fVxuXG5cdHJlZ2lzdGVyTm90aWZpY2F0aW9ucyhkZWxlZ2F0ZTogeyBvbkRpZENoYW5nZU5vdGlmaWNhdGlvbnNWaXNpYmlsaXR5OiBFdmVudDxib29sZWFuPiB9KTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZGVsZWdhdGUub25EaWRDaGFuZ2VOb3RpZmljYXRpb25zVmlzaWJpbGl0eSh2aXNpYmxlID0+IHRoaXMuX29uRGlkQ2hhbmdlTm90aWZpY2F0aW9uc1Zpc2liaWxpdHkuZmlyZSh2aXNpYmxlKSkpO1xuXHR9XG5cblx0aGFzRm9jdXMocGFydDogUGFydHMpOiBib29sZWFuIHtcblx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLmdldENvbnRhaW5lcihnZXRBY3RpdmVXaW5kb3coKSwgcGFydCk7XG5cdFx0aWYgKCFjb250YWluZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBhY3RpdmVFbGVtZW50ID0gZ2V0QWN0aXZlRWxlbWVudCgpO1xuXHRcdGlmICghYWN0aXZlRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiBpc0FuY2VzdG9yVXNpbmdGbG93VG8oYWN0aXZlRWxlbWVudCwgY29udGFpbmVyKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEZvY3VzZWRQYXJ0KCk6IFBhcnRzIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgdGhpcy5wYXJ0cy5rZXlzKCkpIHtcblx0XHRcdGlmICh0aGlzLmhhc0ZvY3VzKHBhcnQgYXMgUGFydHMpKSB7XG5cdFx0XHRcdHJldHVybiBwYXJ0IGFzIFBhcnRzO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRmb2N1c1BhcnQocGFydDogTVVMVElfV0lORE9XX1BBUlRTLCB0YXJnZXRXaW5kb3c6IFdpbmRvdyk6IHZvaWQ7XG5cdGZvY3VzUGFydChwYXJ0OiBTSU5HTEVfV0lORE9XX1BBUlRTKTogdm9pZDtcblx0Zm9jdXNQYXJ0KHBhcnQ6IFBhcnRzLCB0YXJnZXRXaW5kb3c6IFdpbmRvdyA9IG1haW5XaW5kb3cpOiB2b2lkIHtcblx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLmdldENvbnRhaW5lcih0YXJnZXRXaW5kb3csIHBhcnQpID8/IHRoaXMubWFpbkNvbnRhaW5lcjtcblxuXHRcdHN3aXRjaCAocGFydCkge1xuXHRcdFx0Y2FzZSBQYXJ0cy5FRElUT1JfUEFSVDpcblx0XHRcdFx0dGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuZ2V0UGFydChjb250YWluZXIpLmFjdGl2ZUdyb3VwLmZvY3VzKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQYXJ0cy5QQU5FTF9QQVJUOiB7XG5cdFx0XHRcdHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpPy5mb2N1cygpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgUGFydHMuU0lERUJBUl9QQVJUOiB7XG5cdFx0XHRcdHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik/LmZvY3VzKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVDoge1xuXHRcdFx0XHR0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldEFjdGl2ZVBhbmVDb21wb3NpdGUoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcik/LmZvY3VzKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBQYXJ0cy5BQ1RJVklUWUJBUl9QQVJUOlxuXHRcdFx0XHQodGhpcy5nZXRQYXJ0KFBhcnRzLlNJREVCQVJfUEFSVCkgYXMgU2lkZWJhclBhcnQpLmZvY3VzQWN0aXZpdHlCYXIoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFBhcnRzLlNUQVRVU0JBUl9QQVJUOlxuXHRcdFx0XHR0aGlzLnN0YXR1c0JhclNlcnZpY2UuZ2V0UGFydChjb250YWluZXIpLmZvY3VzKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRjb250YWluZXI/LmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Z2V0Q29udGFpbmVyKHRhcmdldFdpbmRvdzogV2luZG93KTogSFRNTEVsZW1lbnQ7XG5cdGdldENvbnRhaW5lcih0YXJnZXRXaW5kb3c6IFdpbmRvdywgcGFydDogUGFydHMpOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0Z2V0Q29udGFpbmVyKHRhcmdldFdpbmRvdzogV2luZG93LCBwYXJ0PzogUGFydHMpOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHR5cGVvZiBwYXJ0ID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0Q29udGFpbmVyRnJvbURvY3VtZW50KHRhcmdldFdpbmRvdy5kb2N1bWVudCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRhcmdldFdpbmRvdyA9PT0gbWFpbldpbmRvdykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0UGFydChwYXJ0KS5nZXRDb250YWluZXIoKTtcblx0XHR9XG5cblx0XHQvLyBPbmx5IHNvbWUgcGFydHMgYXJlIHN1cHBvcnRlZCBmb3IgYXV4aWxpYXJ5IHdpbmRvd3Ncblx0XHRsZXQgcGFydENhbmRpZGF0ZTogdW5rbm93bjtcblx0XHRpZiAocGFydCA9PT0gUGFydHMuRURJVE9SX1BBUlQpIHtcblx0XHRcdHBhcnRDYW5kaWRhdGUgPSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5nZXRQYXJ0KHRoaXMuZ2V0Q29udGFpbmVyRnJvbURvY3VtZW50KHRhcmdldFdpbmRvdy5kb2N1bWVudCkpO1xuXHRcdH0gZWxzZSBpZiAocGFydCA9PT0gUGFydHMuU1RBVFVTQkFSX1BBUlQpIHtcblx0XHRcdHBhcnRDYW5kaWRhdGUgPSB0aGlzLnN0YXR1c0JhclNlcnZpY2UuZ2V0UGFydCh0aGlzLmdldENvbnRhaW5lckZyb21Eb2N1bWVudCh0YXJnZXRXaW5kb3cuZG9jdW1lbnQpKTtcblx0XHR9IGVsc2UgaWYgKHBhcnQgPT09IFBhcnRzLlRJVExFQkFSX1BBUlQpIHtcblx0XHRcdHBhcnRDYW5kaWRhdGUgPSB0aGlzLnRpdGxlU2VydmljZS5nZXRQYXJ0KHRoaXMuZ2V0Q29udGFpbmVyRnJvbURvY3VtZW50KHRhcmdldFdpbmRvdy5kb2N1bWVudCkpO1xuXHRcdH1cblxuXHRcdGlmIChwYXJ0Q2FuZGlkYXRlIGluc3RhbmNlb2YgUGFydCkge1xuXHRcdFx0cmV0dXJuIHBhcnRDYW5kaWRhdGUuZ2V0Q29udGFpbmVyKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGlzVmlzaWJsZShwYXJ0OiBNVUxUSV9XSU5ET1dfUEFSVFMsIHRhcmdldFdpbmRvdzogV2luZG93KTogYm9vbGVhbjtcblx0aXNWaXNpYmxlKHBhcnQ6IFNJTkdMRV9XSU5ET1dfUEFSVFMpOiBib29sZWFuO1xuXHRpc1Zpc2libGUocGFydDogUGFydHMsIHRhcmdldFdpbmRvdz86IFdpbmRvdyk6IGJvb2xlYW47XG5cdGlzVmlzaWJsZShwYXJ0OiBQYXJ0cywgdGFyZ2V0V2luZG93OiBXaW5kb3cgPSBtYWluV2luZG93KTogYm9vbGVhbiB7XG5cdFx0aWYgKHRhcmdldFdpbmRvdyAhPT0gbWFpbldpbmRvdyAmJiBwYXJ0ID09PSBQYXJ0cy5FRElUT1JfUEFSVCkge1xuXHRcdFx0cmV0dXJuIHRydWU7IC8vIGNhbm5vdCBoaWRlIGVkaXRvciBwYXJ0IGluIGF1eGlsaWFyeSB3aW5kb3dzXG5cdFx0fVxuXG5cdFx0c3dpdGNoIChwYXJ0KSB7XG5cdFx0XHRjYXNlIFBhcnRzLlRJVExFQkFSX1BBUlQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLmluaXRpYWxpemVkID9cblx0XHRcdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQuaXNWaWV3VmlzaWJsZSh0aGlzLnRpdGxlQmFyUGFydFZpZXcpIDpcblx0XHRcdFx0XHRzaG91bGRTaG93Q3VzdG9tVGl0bGVCYXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgbWFpbldpbmRvdywgdGhpcy5zdGF0ZS5ydW50aW1lLm1lbnVCYXIudG9nZ2xlZCk7XG5cdFx0XHRjYXNlIFBhcnRzLlNJREVCQVJfUEFSVDpcblx0XHRcdFx0cmV0dXJuICF0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5TSURFQkFSX0hJRERFTik7XG5cdFx0XHRjYXNlIFBhcnRzLlBBTkVMX1BBUlQ6XG5cdFx0XHRcdHJldHVybiAhdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuUEFORUxfSElEREVOKTtcblx0XHRcdGNhc2UgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQ6XG5cdFx0XHRcdHJldHVybiAhdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuQVVYSUxJQVJZQkFSX0hJRERFTik7XG5cdFx0XHRjYXNlIFBhcnRzLlNUQVRVU0JBUl9QQVJUOlxuXHRcdFx0XHRyZXR1cm4gIXRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlNUQVRVU0JBUl9ISURERU4pO1xuXHRcdFx0Y2FzZSBQYXJ0cy5BQ1RJVklUWUJBUl9QQVJUOlxuXHRcdFx0XHRyZXR1cm4gIXRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFDVElWSVRZQkFSX0hJRERFTik7XG5cdFx0XHRjYXNlIFBhcnRzLkVESVRPUl9QQVJUOlxuXHRcdFx0XHRyZXR1cm4gIXRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkVESVRPUl9ISURERU4pO1xuXHRcdFx0Y2FzZSBQYXJ0cy5CQU5ORVJfUEFSVDpcblx0XHRcdFx0cmV0dXJuIHRoaXMuaW5pdGlhbGl6ZWQgPyB0aGlzLndvcmtiZW5jaEdyaWQuaXNWaWV3VmlzaWJsZSh0aGlzLmJhbm5lclBhcnRWaWV3KSA6IGZhbHNlO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBhbnkgb3RoZXIgcGFydCBjYW5ub3QgYmUgaGlkZGVuXG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRTaG93QmFubmVyRmlyc3QoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlzV2ViICYmICFpc1dDT0VuYWJsZWQoKTtcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzUGFuZWxNYXhpbWl6ZWQoKSAmJiB0aGlzLm1haW5Db250YWluZXIgPT09IHRoaXMuYWN0aXZlQ29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLmZvY3VzUGFydChQYXJ0cy5QQU5FTF9QQVJUKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuaXNBdXhpbGlhcnlCYXJNYXhpbWl6ZWQoKSAmJiB0aGlzLm1haW5Db250YWluZXIgPT09IHRoaXMuYWN0aXZlQ29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLmZvY3VzUGFydChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZm9jdXNQYXJ0KFBhcnRzLkVESVRPUl9QQVJULCBnZXRXaW5kb3codGhpcy5hY3RpdmVDb250YWluZXIpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGZvY3VzUGFuZWxPckVkaXRvcigpOiB2b2lkIHtcblx0XHRjb25zdCBhY3RpdmVQYW5lbCA9IHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpO1xuXHRcdGlmICgodGhpcy5oYXNGb2N1cyhQYXJ0cy5QQU5FTF9QQVJUKSB8fCAhdGhpcy5pc1Zpc2libGUoUGFydHMuRURJVE9SX1BBUlQpKSAmJiBhY3RpdmVQYW5lbCkge1xuXHRcdFx0YWN0aXZlUGFuZWwuZm9jdXMoKTsgLy8gcHJlZmVyIHBhbmVsIGlmIGl0IGhhcyBmb2N1cyBvciBlZGl0b3IgaXMgaGlkZGVuXG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZm9jdXMoKTsgLy8gb3RoZXJ3aXNlIGZvY3VzIGVkaXRvclxuXHRcdH1cblx0fVxuXG5cdGdldE1heGltdW1FZGl0b3JEaW1lbnNpb25zKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRGltZW5zaW9uIHtcblx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBnZXRXaW5kb3coY29udGFpbmVyKTtcblx0XHRjb25zdCBjb250YWluZXJEaW1lbnNpb24gPSB0aGlzLmdldENvbnRhaW5lckRpbWVuc2lvbihjb250YWluZXIpO1xuXG5cdFx0aWYgKGNvbnRhaW5lciA9PT0gdGhpcy5tYWluQ29udGFpbmVyKSB7XG5cdFx0XHRjb25zdCBpc1BhbmVsSG9yaXpvbnRhbCA9IGlzSG9yaXpvbnRhbCh0aGlzLmdldFBhbmVsUG9zaXRpb24oKSk7XG5cdFx0XHRjb25zdCB0YWtlbldpZHRoID1cblx0XHRcdFx0KHRoaXMuaXNWaXNpYmxlKFBhcnRzLkFDVElWSVRZQkFSX1BBUlQpID8gdGhpcy5hY3Rpdml0eUJhclBhcnRWaWV3Lm1pbmltdW1XaWR0aCA6IDApICtcblx0XHRcdFx0KHRoaXMuaXNWaXNpYmxlKFBhcnRzLlNJREVCQVJfUEFSVCkgPyB0aGlzLnNpZGVCYXJQYXJ0Vmlldy5taW5pbXVtV2lkdGggOiAwKSArXG5cdFx0XHRcdCh0aGlzLmlzVmlzaWJsZShQYXJ0cy5QQU5FTF9QQVJUKSAmJiAhaXNQYW5lbEhvcml6b250YWwgPyB0aGlzLnBhbmVsUGFydFZpZXcubWluaW11bVdpZHRoIDogMCkgK1xuXHRcdFx0XHQodGhpcy5pc1Zpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpID8gdGhpcy5hdXhpbGlhcnlCYXJQYXJ0Vmlldy5taW5pbXVtV2lkdGggOiAwKTtcblxuXHRcdFx0Y29uc3QgdGFrZW5IZWlnaHQgPVxuXHRcdFx0XHQodGhpcy5pc1Zpc2libGUoUGFydHMuVElUTEVCQVJfUEFSVCwgdGFyZ2V0V2luZG93KSA/IHRoaXMudGl0bGVCYXJQYXJ0Vmlldy5taW5pbXVtSGVpZ2h0IDogMCkgK1xuXHRcdFx0XHQodGhpcy5pc1Zpc2libGUoUGFydHMuU1RBVFVTQkFSX1BBUlQsIHRhcmdldFdpbmRvdykgPyB0aGlzLnN0YXR1c0JhclBhcnRWaWV3Lm1pbmltdW1IZWlnaHQgOiAwKSArXG5cdFx0XHRcdCh0aGlzLmlzVmlzaWJsZShQYXJ0cy5QQU5FTF9QQVJUKSAmJiBpc1BhbmVsSG9yaXpvbnRhbCA/IHRoaXMucGFuZWxQYXJ0Vmlldy5taW5pbXVtSGVpZ2h0IDogMCk7XG5cblx0XHRcdGNvbnN0IGF2YWlsYWJsZVdpZHRoID0gY29udGFpbmVyRGltZW5zaW9uLndpZHRoIC0gdGFrZW5XaWR0aDtcblx0XHRcdGNvbnN0IGF2YWlsYWJsZUhlaWdodCA9IGNvbnRhaW5lckRpbWVuc2lvbi5oZWlnaHQgLSB0YWtlbkhlaWdodDtcblxuXHRcdFx0cmV0dXJuIHsgd2lkdGg6IGF2YWlsYWJsZVdpZHRoLCBoZWlnaHQ6IGF2YWlsYWJsZUhlaWdodCB9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCB0YWtlbkhlaWdodCA9XG5cdFx0XHRcdCh0aGlzLmlzVmlzaWJsZShQYXJ0cy5USVRMRUJBUl9QQVJULCB0YXJnZXRXaW5kb3cpID8gdGhpcy50aXRsZUJhclBhcnRWaWV3Lm1pbmltdW1IZWlnaHQgOiAwKSArXG5cdFx0XHRcdCh0aGlzLmlzVmlzaWJsZShQYXJ0cy5TVEFUVVNCQVJfUEFSVCwgdGFyZ2V0V2luZG93KSA/IHRoaXMuc3RhdHVzQmFyUGFydFZpZXcubWluaW11bUhlaWdodCA6IDApO1xuXG5cdFx0XHRyZXR1cm4geyB3aWR0aDogY29udGFpbmVyRGltZW5zaW9uLndpZHRoLCBoZWlnaHQ6IGNvbnRhaW5lckRpbWVuc2lvbi5oZWlnaHQgLSB0YWtlbkhlaWdodCB9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaXNaZW5Nb2RlQWN0aXZlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5aRU5fTU9ERV9BQ1RJVkUpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRaZW5Nb2RlQWN0aXZlKGFjdGl2ZTogYm9vbGVhbikge1xuXHRcdHRoaXMuc3RhdGVNb2RlbC5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlpFTl9NT0RFX0FDVElWRSwgYWN0aXZlKTtcblx0fVxuXG5cdHRvZ2dsZVplbk1vZGUoc2tpcExheW91dD86IGJvb2xlYW4sIHJlc3RvcmluZyA9IGZhbHNlKTogdm9pZCB7XG5cdFx0Y29uc3QgZm9jdXNlZFBhcnRQcmVUcmFuc2l0aW9uID0gdGhpcy5fZ2V0Rm9jdXNlZFBhcnQoKTtcblxuXHRcdHRoaXMuc2V0WmVuTW9kZUFjdGl2ZSghdGhpcy5pc1plbk1vZGVBY3RpdmUoKSk7XG5cdFx0dGhpcy5zdGF0ZS5ydW50aW1lLnplbk1vZGUudHJhbnNpdGlvbkRpc3Bvc2FibGVzLmNsZWFyQW5kRGlzcG9zZUFsbCgpO1xuXG5cdFx0Y29uc3Qgc2V0TGluZU51bWJlcnMgPSAobGluZU51bWJlcnM/OiBMaW5lTnVtYmVyc1R5cGUpID0+IHtcblx0XHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIHRoaXMubWFpblBhcnRFZGl0b3JTZXJ2aWNlLnZpc2libGVUZXh0RWRpdG9yQ29udHJvbHMpIHtcblxuXHRcdFx0XHQvLyBUbyBwcm9wZXJseSByZXNldCBsaW5lIG51bWJlcnMgd2UgbmVlZCB0byByZWFkIHRoZSBjb25maWd1cmF0aW9uIGZvciBlYWNoIGVkaXRvciByZXNwZWN0aW5nIGl0J3MgdXJpLlxuXHRcdFx0XHRpZiAoIWxpbmVOdW1iZXJzICYmIGlzQ29kZUVkaXRvcihlZGl0b3IpICYmIGVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdFx0XHRsaW5lTnVtYmVycyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2VkaXRvci5saW5lTnVtYmVycycsIHsgcmVzb3VyY2U6IG1vZGVsLnVyaSwgb3ZlcnJpZGVJZGVudGlmaWVyOiBtb2RlbC5nZXRMYW5ndWFnZUlkKCkgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFsaW5lTnVtYmVycykge1xuXHRcdFx0XHRcdGxpbmVOdW1iZXJzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZWRpdG9yLmxpbmVOdW1iZXJzJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRlZGl0b3IudXBkYXRlT3B0aW9ucyh7IGxpbmVOdW1iZXJzIH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBDaGVjayBpZiB6ZW4gbW9kZSB0cmFuc2l0aW9uZWQgdG8gZnVsbCBzY3JlZW4gYW5kIGlmIG5vdyB3ZSBhcmUgb3V0IG9mIHplbiBtb2RlXG5cdFx0Ly8gLT4gd2UgbmVlZCB0byBnbyBvdXQgb2YgZnVsbCBzY3JlZW4gKHNhbWUgZ29lcyBmb3IgdGhlIGNlbnRlcmVkIGVkaXRvciBsYXlvdXQpXG5cdFx0bGV0IHRvZ2dsZU1haW5XaW5kb3dGdWxsU2NyZWVuID0gZmFsc2U7XG5cdFx0Y29uc3QgY29uZmlnID0gZ2V0WmVuTW9kZUNvbmZpZ3VyYXRpb24odGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgemVuTW9kZUV4aXRJbmZvID0gdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuWkVOX01PREVfRVhJVF9JTkZPKTtcblxuXHRcdC8vIFplbiBNb2RlIEFjdGl2ZVxuXHRcdGlmICh0aGlzLmlzWmVuTW9kZUFjdGl2ZSgpKSB7XG5cblx0XHRcdHRvZ2dsZU1haW5XaW5kb3dGdWxsU2NyZWVuID0gIXRoaXMuc3RhdGUucnVudGltZS5tYWluV2luZG93RnVsbHNjcmVlbiAmJiBjb25maWcuZnVsbFNjcmVlbiAmJiAhaXNJT1M7XG5cblx0XHRcdGlmICghcmVzdG9yaW5nKSB7XG5cdFx0XHRcdHplbk1vZGVFeGl0SW5mby50cmFuc2l0aW9uZWRUb0Z1bGxTY3JlZW4gPSB0b2dnbGVNYWluV2luZG93RnVsbFNjcmVlbjtcblx0XHRcdFx0emVuTW9kZUV4aXRJbmZvLnRyYW5zaXRpb25lZFRvQ2VudGVyZWRFZGl0b3JMYXlvdXQgPSAhdGhpcy5pc01haW5FZGl0b3JMYXlvdXRDZW50ZXJlZCgpICYmIGNvbmZpZy5jZW50ZXJMYXlvdXQ7XG5cdFx0XHRcdHplbk1vZGVFeGl0SW5mby5oYW5kbGVOb3RpZmljYXRpb25zRG9Ob3REaXN0dXJiTW9kZSA9IHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5nZXRGaWx0ZXIoKSA9PT0gTm90aWZpY2F0aW9uc0ZpbHRlci5PRkY7XG5cdFx0XHRcdHplbk1vZGVFeGl0SW5mby53YXNWaXNpYmxlLnNpZGVCYXIgPSB0aGlzLmlzVmlzaWJsZShQYXJ0cy5TSURFQkFSX1BBUlQpO1xuXHRcdFx0XHR6ZW5Nb2RlRXhpdEluZm8ud2FzVmlzaWJsZS5wYW5lbCA9IHRoaXMuaXNWaXNpYmxlKFBhcnRzLlBBTkVMX1BBUlQpO1xuXHRcdFx0XHR6ZW5Nb2RlRXhpdEluZm8ud2FzVmlzaWJsZS5hdXhpbGlhcnlCYXIgPSB0aGlzLmlzVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCk7XG5cdFx0XHRcdHRoaXMuc3RhdGVNb2RlbC5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlpFTl9NT0RFX0VYSVRfSU5GTywgemVuTW9kZUV4aXRJbmZvKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5zZXRQYW5lbEhpZGRlbih0cnVlLCB0cnVlKTtcblx0XHRcdHRoaXMuc2V0QXV4aWxpYXJ5QmFySGlkZGVuKHRydWUsIHRydWUpO1xuXHRcdFx0dGhpcy5zZXRTaWRlQmFySGlkZGVuKHRydWUpO1xuXG5cdFx0XHRpZiAoY29uZmlnLmhpZGVBY3Rpdml0eUJhcikge1xuXHRcdFx0XHR0aGlzLnNldEFjdGl2aXR5QmFySGlkZGVuKHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY29uZmlnLmhpZGVTdGF0dXNCYXIpIHtcblx0XHRcdFx0dGhpcy5zZXRTdGF0dXNCYXJIaWRkZW4odHJ1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjb25maWcuaGlkZUxpbmVOdW1iZXJzKSB7XG5cdFx0XHRcdHNldExpbmVOdW1iZXJzKCdvZmYnKTtcblx0XHRcdFx0dGhpcy5zdGF0ZS5ydW50aW1lLnplbk1vZGUudHJhbnNpdGlvbkRpc3Bvc2FibGVzLnNldChaZW5Nb2RlU2V0dGluZ3MuSElERV9MSU5FTlVNQkVSUywgdGhpcy5tYWluUGFydEVkaXRvclNlcnZpY2Uub25EaWRWaXNpYmxlRWRpdG9yc0NoYW5nZSgoKSA9PiBzZXRMaW5lTnVtYmVycygnb2ZmJykpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNvbmZpZy5zaG93VGFicyAhPT0gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UucGFydE9wdGlvbnMuc2hvd1RhYnMpIHtcblx0XHRcdFx0dGhpcy5zdGF0ZS5ydW50aW1lLnplbk1vZGUudHJhbnNpdGlvbkRpc3Bvc2FibGVzLnNldChaZW5Nb2RlU2V0dGluZ3MuU0hPV19UQUJTLCB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5tYWluUGFydC5lbmZvcmNlUGFydE9wdGlvbnMoeyBzaG93VGFiczogY29uZmlnLnNob3dUYWJzIH0pKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNvbmZpZy5zaWxlbnROb3RpZmljYXRpb25zICYmIHplbk1vZGVFeGl0SW5mby5oYW5kbGVOb3RpZmljYXRpb25zRG9Ob3REaXN0dXJiTW9kZSkge1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uuc2V0RmlsdGVyKE5vdGlmaWNhdGlvbnNGaWx0ZXIuRVJST1IpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY29uZmlnLmNlbnRlckxheW91dCkge1xuXHRcdFx0XHR0aGlzLmNlbnRlck1haW5FZGl0b3JMYXlvdXQodHJ1ZSwgdHJ1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFplbiBNb2RlIENvbmZpZ3VyYXRpb24gQ2hhbmdlc1xuXHRcdFx0dGhpcy5zdGF0ZS5ydW50aW1lLnplbk1vZGUudHJhbnNpdGlvbkRpc3Bvc2FibGVzLnNldCgnY29uZmlndXJhdGlvbkNoYW5nZScsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXG5cdFx0XHRcdC8vIEFjdGl2aXR5IEJhclxuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihaZW5Nb2RlU2V0dGluZ3MuSElERV9BQ1RJVklUWUJBUikgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT04pKSB7XG5cdFx0XHRcdFx0Y29uc3QgemVuTW9kZUhpZGVBY3Rpdml0eUJhciA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oWmVuTW9kZVNldHRpbmdzLkhJREVfQUNUSVZJVFlCQVIpO1xuXHRcdFx0XHRcdGNvbnN0IGFjdGl2aXR5QmFyTG9jYXRpb24gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPEFjdGl2aXR5QmFyUG9zaXRpb24+KExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9MT0NBVElPTik7XG5cdFx0XHRcdFx0dGhpcy5zZXRBY3Rpdml0eUJhckhpZGRlbih6ZW5Nb2RlSGlkZUFjdGl2aXR5QmFyID8gdHJ1ZSA6IChhY3Rpdml0eUJhckxvY2F0aW9uID09PSBBY3Rpdml0eUJhclBvc2l0aW9uLlRPUCB8fCBhY3Rpdml0eUJhckxvY2F0aW9uID09PSBBY3Rpdml0eUJhclBvc2l0aW9uLkJPVFRPTSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gU3RhdHVzIEJhclxuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihaZW5Nb2RlU2V0dGluZ3MuSElERV9TVEFUVVNCQVIpKSB7XG5cdFx0XHRcdFx0Y29uc3QgemVuTW9kZUhpZGVTdGF0dXNCYXIgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFplbk1vZGVTZXR0aW5ncy5ISURFX1NUQVRVU0JBUik7XG5cdFx0XHRcdFx0dGhpcy5zZXRTdGF0dXNCYXJIaWRkZW4oemVuTW9kZUhpZGVTdGF0dXNCYXIpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQ2VudGVyIExheW91dFxuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihaZW5Nb2RlU2V0dGluZ3MuQ0VOVEVSX0xBWU9VVCkpIHtcblx0XHRcdFx0XHRjb25zdCB6ZW5Nb2RlQ2VudGVyTGF5b3V0ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihaZW5Nb2RlU2V0dGluZ3MuQ0VOVEVSX0xBWU9VVCk7XG5cdFx0XHRcdFx0dGhpcy5jZW50ZXJNYWluRWRpdG9yTGF5b3V0KHplbk1vZGVDZW50ZXJMYXlvdXQsIHRydWUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gU2hvdyBUYWJzXG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFplbk1vZGVTZXR0aW5ncy5TSE9XX1RBQlMpKSB7XG5cdFx0XHRcdFx0Y29uc3QgemVuTW9kZVNob3dUYWJzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxFZGl0b3JUYWJzTW9kZSB8IHVuZGVmaW5lZD4oWmVuTW9kZVNldHRpbmdzLlNIT1dfVEFCUykgPz8gJ211bHRpcGxlJztcblx0XHRcdFx0XHR0aGlzLnN0YXRlLnJ1bnRpbWUuemVuTW9kZS50cmFuc2l0aW9uRGlzcG9zYWJsZXMuc2V0KFplbk1vZGVTZXR0aW5ncy5TSE9XX1RBQlMsIHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm1haW5QYXJ0LmVuZm9yY2VQYXJ0T3B0aW9ucyh7IHNob3dUYWJzOiB6ZW5Nb2RlU2hvd1RhYnMgfSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gTm90aWZpY2F0aW9uc1xuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihaZW5Nb2RlU2V0dGluZ3MuU0lMRU5UX05PVElGSUNBVElPTlMpKSB7XG5cdFx0XHRcdFx0Y29uc3QgemVuTW9kZVNpbGVudE5vdGlmaWNhdGlvbnMgPSAhIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoWmVuTW9kZVNldHRpbmdzLlNJTEVOVF9OT1RJRklDQVRJT05TKTtcblx0XHRcdFx0XHRpZiAoemVuTW9kZUV4aXRJbmZvLmhhbmRsZU5vdGlmaWNhdGlvbnNEb05vdERpc3R1cmJNb2RlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uuc2V0RmlsdGVyKHplbk1vZGVTaWxlbnROb3RpZmljYXRpb25zID8gTm90aWZpY2F0aW9uc0ZpbHRlci5FUlJPUiA6IE5vdGlmaWNhdGlvbnNGaWx0ZXIuT0ZGKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBDZW50ZXIgTGF5b3V0XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFplbk1vZGVTZXR0aW5ncy5ISURFX0xJTkVOVU1CRVJTKSkge1xuXHRcdFx0XHRcdGNvbnN0IGxpbmVOdW1iZXJzVHlwZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oWmVuTW9kZVNldHRpbmdzLkhJREVfTElORU5VTUJFUlMpID8gJ29mZicgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0c2V0TGluZU51bWJlcnMobGluZU51bWJlcnNUeXBlKTtcblx0XHRcdFx0XHR0aGlzLnN0YXRlLnJ1bnRpbWUuemVuTW9kZS50cmFuc2l0aW9uRGlzcG9zYWJsZXMuc2V0KFplbk1vZGVTZXR0aW5ncy5ISURFX0xJTkVOVU1CRVJTLCB0aGlzLm1haW5QYXJ0RWRpdG9yU2VydmljZS5vbkRpZFZpc2libGVFZGl0b3JzQ2hhbmdlKCgpID0+IHNldExpbmVOdW1iZXJzKGxpbmVOdW1iZXJzVHlwZSkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIFplbiBNb2RlIEluYWN0aXZlXG5cdFx0ZWxzZSB7XG5cdFx0XHRpZiAoemVuTW9kZUV4aXRJbmZvLndhc1Zpc2libGUucGFuZWwpIHtcblx0XHRcdFx0dGhpcy5zZXRQYW5lbEhpZGRlbihmYWxzZSwgdHJ1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh6ZW5Nb2RlRXhpdEluZm8ud2FzVmlzaWJsZS5hdXhpbGlhcnlCYXIpIHtcblx0XHRcdFx0dGhpcy5zZXRBdXhpbGlhcnlCYXJIaWRkZW4oZmFsc2UsIHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoemVuTW9kZUV4aXRJbmZvLndhc1Zpc2libGUuc2lkZUJhcikge1xuXHRcdFx0XHR0aGlzLnNldFNpZGVCYXJIaWRkZW4oZmFsc2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFDVElWSVRZQkFSX0hJRERFTiwgdHJ1ZSkpIHtcblx0XHRcdFx0dGhpcy5zZXRBY3Rpdml0eUJhckhpZGRlbihmYWxzZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuU1RBVFVTQkFSX0hJRERFTiwgdHJ1ZSkpIHtcblx0XHRcdFx0dGhpcy5zZXRTdGF0dXNCYXJIaWRkZW4oZmFsc2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoemVuTW9kZUV4aXRJbmZvLnRyYW5zaXRpb25lZFRvQ2VudGVyZWRFZGl0b3JMYXlvdXQpIHtcblx0XHRcdFx0dGhpcy5jZW50ZXJNYWluRWRpdG9yTGF5b3V0KGZhbHNlLCB0cnVlKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHplbk1vZGVFeGl0SW5mby5oYW5kbGVOb3RpZmljYXRpb25zRG9Ob3REaXN0dXJiTW9kZSkge1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uuc2V0RmlsdGVyKE5vdGlmaWNhdGlvbnNGaWx0ZXIuT0ZGKTtcblx0XHRcdH1cblxuXHRcdFx0c2V0TGluZU51bWJlcnMoKTtcblxuXHRcdFx0dG9nZ2xlTWFpbldpbmRvd0Z1bGxTY3JlZW4gPSB6ZW5Nb2RlRXhpdEluZm8udHJhbnNpdGlvbmVkVG9GdWxsU2NyZWVuICYmIHRoaXMuc3RhdGUucnVudGltZS5tYWluV2luZG93RnVsbHNjcmVlbjtcblx0XHR9XG5cblx0XHRpZiAoIXNraXBMYXlvdXQpIHtcblx0XHRcdHRoaXMubGF5b3V0KCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRvZ2dsZU1haW5XaW5kb3dGdWxsU2NyZWVuKSB7XG5cdFx0XHR0aGlzLmhvc3RTZXJ2aWNlLnRvZ2dsZUZ1bGxTY3JlZW4obWFpbldpbmRvdyk7XG5cdFx0fVxuXG5cdFx0Ly8gcmVzdG9yZSBmb2N1cyBpZiBwYXJ0IGlzIHN0aWxsIHZpc2libGUsIG90aGVyd2lzZSBmYWxsYmFjayB0byBlZGl0b3Jcblx0XHRpZiAoZm9jdXNlZFBhcnRQcmVUcmFuc2l0aW9uICYmIHRoaXMuaXNWaXNpYmxlKGZvY3VzZWRQYXJ0UHJlVHJhbnNpdGlvbiwgZ2V0V2luZG93KHRoaXMuYWN0aXZlQ29udGFpbmVyKSkpIHtcblx0XHRcdGlmIChpc011bHRpV2luZG93UGFydChmb2N1c2VkUGFydFByZVRyYW5zaXRpb24pKSB7XG5cdFx0XHRcdHRoaXMuZm9jdXNQYXJ0KGZvY3VzZWRQYXJ0UHJlVHJhbnNpdGlvbiwgZ2V0V2luZG93KHRoaXMuYWN0aXZlQ29udGFpbmVyKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmZvY3VzUGFydChmb2N1c2VkUGFydFByZVRyYW5zaXRpb24pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmZvY3VzKCk7XG5cdFx0fVxuXG5cdFx0Ly8gRXZlbnRcblx0XHR0aGlzLl9vbkRpZENoYW5nZVplbk1vZGUuZmlyZSh0aGlzLmlzWmVuTW9kZUFjdGl2ZSgpKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0U3RhdHVzQmFySGlkZGVuKGhpZGRlbjogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuc3RhdGVNb2RlbC5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlNUQVRVU0JBUl9ISURERU4sIGhpZGRlbik7XG5cblx0XHQvLyBBZGp1c3QgQ1NTXG5cdFx0aWYgKGhpZGRlbikge1xuXHRcdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoTGF5b3V0Q2xhc3Nlcy5TVEFUVVNCQVJfSElEREVOKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoTGF5b3V0Q2xhc3Nlcy5TVEFUVVNCQVJfSElEREVOKTtcblx0XHR9XG5cblx0XHQvLyBQcm9wYWdhdGUgdG8gZ3JpZFxuXHRcdHRoaXMud29ya2JlbmNoR3JpZC5zZXRWaWV3VmlzaWJsZSh0aGlzLnN0YXR1c0JhclBhcnRWaWV3LCAhaGlkZGVuKTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVXb3JrYmVuY2hMYXlvdXQoKTogdm9pZCB7XG5cdFx0Y29uc3QgdGl0bGVCYXIgPSB0aGlzLmdldFBhcnQoUGFydHMuVElUTEVCQVJfUEFSVCk7XG5cdFx0Y29uc3QgYmFubmVyUGFydCA9IHRoaXMuZ2V0UGFydChQYXJ0cy5CQU5ORVJfUEFSVCk7XG5cdFx0Y29uc3QgZWRpdG9yUGFydCA9IHRoaXMuZ2V0UGFydChQYXJ0cy5FRElUT1JfUEFSVCk7XG5cdFx0Y29uc3QgYWN0aXZpdHlCYXIgPSB0aGlzLmdldFBhcnQoUGFydHMuQUNUSVZJVFlCQVJfUEFSVCk7XG5cdFx0Y29uc3QgcGFuZWxQYXJ0ID0gdGhpcy5nZXRQYXJ0KFBhcnRzLlBBTkVMX1BBUlQpO1xuXHRcdGNvbnN0IGF1eGlsaWFyeUJhclBhcnQgPSB0aGlzLmdldFBhcnQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXHRcdGNvbnN0IHNpZGVCYXIgPSB0aGlzLmdldFBhcnQoUGFydHMuU0lERUJBUl9QQVJUKTtcblx0XHRjb25zdCBzdGF0dXNCYXIgPSB0aGlzLmdldFBhcnQoUGFydHMuU1RBVFVTQkFSX1BBUlQpO1xuXG5cdFx0Ly8gVmlldyByZWZlcmVuY2VzIGZvciBhbGwgcGFydHNcblx0XHR0aGlzLnRpdGxlQmFyUGFydFZpZXcgPSB0aXRsZUJhcjtcblx0XHR0aGlzLmJhbm5lclBhcnRWaWV3ID0gYmFubmVyUGFydDtcblx0XHR0aGlzLnNpZGVCYXJQYXJ0VmlldyA9IHNpZGVCYXI7XG5cdFx0dGhpcy5hY3Rpdml0eUJhclBhcnRWaWV3ID0gYWN0aXZpdHlCYXI7XG5cdFx0dGhpcy5lZGl0b3JQYXJ0VmlldyA9IGVkaXRvclBhcnQ7XG5cdFx0dGhpcy5wYW5lbFBhcnRWaWV3ID0gcGFuZWxQYXJ0O1xuXHRcdHRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcgPSBhdXhpbGlhcnlCYXJQYXJ0O1xuXHRcdHRoaXMuc3RhdHVzQmFyUGFydFZpZXcgPSBzdGF0dXNCYXI7XG5cblx0XHRjb25zdCB2aWV3TWFwOiBSZWNvcmQ8c3RyaW5nLCBJU2VyaWFsaXphYmxlVmlldz4gPSB7XG5cdFx0XHRbUGFydHMuQUNUSVZJVFlCQVJfUEFSVF06IHRoaXMuYWN0aXZpdHlCYXJQYXJ0Vmlldyxcblx0XHRcdFtQYXJ0cy5CQU5ORVJfUEFSVF06IHRoaXMuYmFubmVyUGFydFZpZXcsXG5cdFx0XHRbUGFydHMuVElUTEVCQVJfUEFSVF06IHRoaXMudGl0bGVCYXJQYXJ0Vmlldyxcblx0XHRcdFtQYXJ0cy5FRElUT1JfUEFSVF06IHRoaXMuZWRpdG9yUGFydFZpZXcsXG5cdFx0XHRbUGFydHMuUEFORUxfUEFSVF06IHRoaXMucGFuZWxQYXJ0Vmlldyxcblx0XHRcdFtQYXJ0cy5TSURFQkFSX1BBUlRdOiB0aGlzLnNpZGVCYXJQYXJ0Vmlldyxcblx0XHRcdFtQYXJ0cy5TVEFUVVNCQVJfUEFSVF06IHRoaXMuc3RhdHVzQmFyUGFydFZpZXcsXG5cdFx0XHRbUGFydHMuQVVYSUxJQVJZQkFSX1BBUlRdOiB0aGlzLmF1eGlsaWFyeUJhclBhcnRWaWV3XG5cdFx0fTtcblxuXHRcdGNvbnN0IGZyb21KU09OID0gKHsgdHlwZSB9OiB7IHR5cGU6IFBhcnRzIH0pID0+IHZpZXdNYXBbdHlwZV07XG5cdFx0Y29uc3Qgd29ya2JlbmNoR3JpZCA9IFNlcmlhbGl6YWJsZUdyaWQuZGVzZXJpYWxpemUoXG5cdFx0XHR0aGlzLmNyZWF0ZUdyaWREZXNjcmlwdG9yKCksXG5cdFx0XHR7IGZyb21KU09OIH0sXG5cdFx0XHR7IHByb3BvcnRpb25hbExheW91dDogZmFsc2UgfVxuXHRcdCk7XG5cblx0XHR0aGlzLm1haW5Db250YWluZXIucHJlcGVuZCh3b3JrYmVuY2hHcmlkLmVsZW1lbnQpO1xuXHRcdHRoaXMubWFpbkNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYXBwbGljYXRpb24nKTtcblx0XHR0aGlzLndvcmtiZW5jaEdyaWQgPSB3b3JrYmVuY2hHcmlkO1xuXHRcdHRoaXMud29ya2JlbmNoR3JpZC5lZGdlU25hcHBpbmcgPSB0aGlzLnN0YXRlLnJ1bnRpbWUubWFpbldpbmRvd0Z1bGxzY3JlZW47XG5cblx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgW3RpdGxlQmFyLCBlZGl0b3JQYXJ0LCBhY3Rpdml0eUJhciwgcGFuZWxQYXJ0LCBzaWRlQmFyLCBzdGF0dXNCYXIsIGF1eGlsaWFyeUJhclBhcnQsIGJhbm5lclBhcnRdKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihwYXJ0Lm9uRGlkVmlzaWJpbGl0eUNoYW5nZSh2aXNpYmxlID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLmluTWF4aW1pemVkQXV4aWxpYXJ5QmFyVHJhbnNpdGlvbikge1xuXG5cdFx0XHRcdFx0Ly8gc2tpcCByZWFjdGluZyB3aGVuIHdlIGFyZSB0cmFuc2l0aW9uaW5nXG5cdFx0XHRcdFx0Ly8gaW4gb3Igb3V0IG9mIG1heGltaXNlZCBhdXhpbGlhcnkgYmFyIHRvIHByZXZlbnRcblx0XHRcdFx0XHQvLyBzdGVwcGluZyBvbiBlYWNoIG90aGVyIHRvZXMgYmVjYXVzZSB0aGlzXG5cdFx0XHRcdFx0Ly8gdHJhbnNpdGlvbiBpcyBhbHJlYWR5IGRlYWxpbmcgd2l0aCBhbGwgcGFydHNcblx0XHRcdFx0XHQvLyB2aXNpYmlsaXR5IGVmZmljaWVudGx5LlxuXG5cdFx0XHRcdFx0aWYgKHBhcnQgPT09IHNpZGVCYXIpIHtcblx0XHRcdFx0XHRcdHRoaXMuc2V0U2lkZUJhckhpZGRlbighdmlzaWJsZSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChwYXJ0ID09PSBwYW5lbFBhcnQgJiYgdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuUEFORUxfSElEREVOKSA9PT0gdmlzaWJsZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5zZXRQYW5lbEhpZGRlbighdmlzaWJsZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChwYXJ0ID09PSBhdXhpbGlhcnlCYXJQYXJ0KSB7XG5cdFx0XHRcdFx0XHR0aGlzLnNldEF1eGlsaWFyeUJhckhpZGRlbighdmlzaWJsZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChwYXJ0ID09PSBlZGl0b3JQYXJ0KSB7XG5cdFx0XHRcdFx0XHR0aGlzLnNldEVkaXRvckhpZGRlbighdmlzaWJsZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBwYXJ0LmdldElkKCksIHZpc2libGUgfSk7XG5cdFx0XHRcdHRoaXMuaGFuZGxlQ29udGFpbmVyRGlkTGF5b3V0KHRoaXMubWFpbkNvbnRhaW5lciwgdGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbik7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIGZsb2F0aW5nIGNhcmRzIGFidXQgdGhlIHRvcCB3aW5kb3cgZWRnZSBvbmx5IHdoaWxlIG5laXRoZXIgb2YgdGhlIHR3byBncmlkIHJvd3Ncblx0XHQvLyBhYm92ZSB0aGUgbWlkZGxlIHNlY3Rpb24gaXMgc2hvd2luZywgc28gdHJhY2sgYm90aCByYXRoZXIgdGhhbiB0aGUgdGl0bGUgYmFyIGFsb25lLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eSgoeyBwYXJ0SWQgfSkgPT4ge1xuXHRcdFx0aWYgKHBhcnRJZCA9PT0gUGFydHMuVElUTEVCQVJfUEFSVCB8fCBwYXJ0SWQgPT09IFBhcnRzLkJBTk5FUl9QQVJUKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlVG9wV2luZG93RWRnZUNsYXNzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yYWdlU2VydmljZS5vbldpbGxTYXZlU3RhdGUoKCkgPT4ge1xuXG5cdFx0XHQvLyBTaWRlIEJhciBTaXplXG5cdFx0XHRjb25zdCBzaWRlQmFyU2l6ZSA9IHRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlNJREVCQVJfSElEREVOKVxuXHRcdFx0XHQ/IHRoaXMud29ya2JlbmNoR3JpZC5nZXRWaWV3Q2FjaGVkVmlzaWJsZVNpemUodGhpcy5zaWRlQmFyUGFydFZpZXcpXG5cdFx0XHRcdDogdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMuc2lkZUJhclBhcnRWaWV3KS53aWR0aDtcblx0XHRcdHRoaXMuc3RhdGVNb2RlbC5zZXRJbml0aWFsaXphdGlvblZhbHVlKExheW91dFN0YXRlS2V5cy5TSURFQkFSX1NJWkUsIHNpZGVCYXJTaXplIGFzIG51bWJlcik7XG5cblx0XHRcdC8vIFBhbmVsIFNpemVcblx0XHRcdGNvbnN0IHBhbmVsU2l6ZSA9IHRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlBBTkVMX0hJRERFTilcblx0XHRcdFx0PyB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld0NhY2hlZFZpc2libGVTaXplKHRoaXMucGFuZWxQYXJ0Vmlldylcblx0XHRcdFx0OiBpc0hvcml6b250YWwodGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuUEFORUxfUE9TSVRJT04pKVxuXHRcdFx0XHRcdD8gdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMucGFuZWxQYXJ0VmlldykuaGVpZ2h0XG5cdFx0XHRcdFx0OiB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodGhpcy5wYW5lbFBhcnRWaWV3KS53aWR0aDtcblx0XHRcdHRoaXMuc3RhdGVNb2RlbC5zZXRJbml0aWFsaXphdGlvblZhbHVlKExheW91dFN0YXRlS2V5cy5QQU5FTF9TSVpFLCBwYW5lbFNpemUgYXMgbnVtYmVyKTtcblxuXHRcdFx0Ly8gQXV4aWxpYXJ5IEJhciBTaXplXG5cdFx0XHRjb25zdCBhdXhpbGlhcnlCYXJTaXplID0gdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuQVVYSUxJQVJZQkFSX0hJRERFTilcblx0XHRcdFx0PyB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld0NhY2hlZFZpc2libGVTaXplKHRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcpXG5cdFx0XHRcdDogdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcpLndpZHRoO1xuXHRcdFx0dGhpcy5zdGF0ZU1vZGVsLnNldEluaXRpYWxpemF0aW9uVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFVWElMSUFSWUJBUl9TSVpFLCBhdXhpbGlhcnlCYXJTaXplIGFzIG51bWJlcik7XG5cblx0XHRcdHRoaXMuc3RhdGVNb2RlbC5zYXZlKHRydWUsIHRydWUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueSh0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLm9uRGlkUGFuZUNvbXBvc2l0ZU9wZW4sIHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2Uub25EaWRQYW5lQ29tcG9zaXRlQ2xvc2UpKCgpID0+IHtcblxuXHRcdFx0Ly8gQXV4aWxpYXJ5IEJhciBTdGF0ZVxuXHRcdFx0dGhpcy5zdGF0ZU1vZGVsLnNldEluaXRpYWxpemF0aW9uVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFVWElMSUFSWUJBUl9FTVBUWSwgdGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5nZXRQYW5lQ29tcG9zaXRlSWRzKFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIpLmxlbmd0aCA9PT0gMCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0bGF5b3V0KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5kaXNwb3NlZCkge1xuXHRcdFx0dGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbiA9IGdldENsaWVudEFyZWEodGhpcy5zdGF0ZS5ydW50aW1lLm1haW5XaW5kb3dGdWxsc2NyZWVuID9cblx0XHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5IDogXHQvLyBpbiBmdWxsc2NyZWVuIG1vZGUsIG1ha2Ugc3VyZSB0byB1c2UgPGJvZHk+IGVsZW1lbnQgYmVjYXVzZVxuXHRcdFx0XHR0aGlzLnBhcmVudCxcdFx0XHRcdC8vIGluIHRoYXQgY2FzZSB0aGUgd29ya2JlbmNoIHdpbGwgc3BhbiB0aGUgZW50aXJlIHNpdGVcblx0XHRcdFx0dGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSA/IERFRkFVTFRfRU1QVFlfV0lORE9XX0RJTUVOU0lPTlMgOiBERUZBVUxUX1dPUktTUEFDRV9XSU5ET1dfRElNRU5TSU9OUyAvLyBydW5uaW5nIHdpdGggZmFsbGJhY2sgdG8gZW5zdXJlIG5vIGVycm9yIGlzIHRocm93biAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI0MDI0Milcblx0XHRcdCk7XG5cblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgTGF5b3V0I2xheW91dCwgaGVpZ2h0OiAke3RoaXMuX21haW5Db250YWluZXJEaW1lbnNpb24uaGVpZ2h0fSwgd2lkdGg6ICR7dGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbi53aWR0aH1gKTtcblxuXHRcdFx0c2l6ZSh0aGlzLm1haW5Db250YWluZXIsIHRoaXMuX21haW5Db250YWluZXJEaW1lbnNpb24ud2lkdGgsIHRoaXMuX21haW5Db250YWluZXJEaW1lbnNpb24uaGVpZ2h0KTtcblxuXHRcdFx0Ly8gTGF5b3V0IHRoZSBncmlkIHdpZGdldFxuXHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLmxheW91dCh0aGlzLl9tYWluQ29udGFpbmVyRGltZW5zaW9uLndpZHRoLCB0aGlzLl9tYWluQ29udGFpbmVyRGltZW5zaW9uLmhlaWdodCk7XG5cdFx0XHR0aGlzLmluaXRpYWxpemVkID0gdHJ1ZTtcblxuXHRcdFx0Ly8gRW1pdCBhcyBldmVudFxuXHRcdFx0dGhpcy5oYW5kbGVDb250YWluZXJEaWRMYXlvdXQodGhpcy5tYWluQ29udGFpbmVyLCB0aGlzLl9tYWluQ29udGFpbmVyRGltZW5zaW9uKTtcblx0XHR9XG5cdH1cblxuXHRpc01haW5FZGl0b3JMYXlvdXRDZW50ZXJlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuTUFJTl9FRElUT1JfQ0VOVEVSRUQpO1xuXHR9XG5cblx0Y2VudGVyTWFpbkVkaXRvckxheW91dChhY3RpdmU6IGJvb2xlYW4sIHNraXBMYXlvdXQ/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5zdGF0ZU1vZGVsLnNldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuTUFJTl9FRElUT1JfQ0VOVEVSRUQsIGFjdGl2ZSk7XG5cblx0XHRjb25zdCBtYWluVmlzaWJsZUVkaXRvcnMgPSBjb2FsZXNjZSh0aGlzLmVkaXRvckdyb3VwU2VydmljZS5tYWluUGFydC5ncm91cHMubWFwKGdyb3VwID0+IGdyb3VwLmFjdGl2ZUVkaXRvcikpO1xuXHRcdGNvbnN0IGlzRWRpdG9yQ29tcGxleCA9IG1haW5WaXNpYmxlRWRpdG9ycy5zb21lKGVkaXRvciA9PiB7XG5cdFx0XHRpZiAoZWRpdG9yIGluc3RhbmNlb2YgRGlmZkVkaXRvcklucHV0KSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdkaWZmRWRpdG9yLnJlbmRlclNpZGVCeVNpZGUnKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVkaXRvcj8uaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5NdWx0aXBsZUVkaXRvcnMpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBsYXlvdXQgPSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5nZXRMYXlvdXQoKTtcblx0XHRsZXQgaGFzTW9yZVRoYW5PbmVDb2x1bW4gPSBmYWxzZTtcblx0XHRpZiAobGF5b3V0Lm9yaWVudGF0aW9uID09PSBHcm91cE9yaWVudGF0aW9uLkhPUklaT05UQUwpIHtcblx0XHRcdGhhc01vcmVUaGFuT25lQ29sdW1uID0gbGF5b3V0Lmdyb3Vwcy5sZW5ndGggPiAxO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRoYXNNb3JlVGhhbk9uZUNvbHVtbiA9IGxheW91dC5ncm91cHMuc29tZShncm91cCA9PiBncm91cC5ncm91cHMgJiYgZ3JvdXAuZ3JvdXBzLmxlbmd0aCA+IDEpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzQ2VudGVyZWRMYXlvdXRBdXRvUmVzaXppbmcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCd3b3JrYmVuY2guZWRpdG9yLmNlbnRlcmVkTGF5b3V0QXV0b1Jlc2l6ZScpO1xuXHRcdGlmIChcblx0XHRcdGlzQ2VudGVyZWRMYXlvdXRBdXRvUmVzaXppbmcgJiZcblx0XHRcdCgoaGFzTW9yZVRoYW5PbmVDb2x1bW4gJiYgIXRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm1haW5QYXJ0Lmhhc01heGltaXplZEdyb3VwKCkpIHx8IGlzRWRpdG9yQ29tcGxleClcblx0XHQpIHtcblx0XHRcdGFjdGl2ZSA9IGZhbHNlOyAvLyBkaXNhYmxlIGNlbnRlcmVkIGxheW91dCBmb3IgY29tcGxleCBlZGl0b3JzIG9yIHdoZW4gdGhlcmUgaXMgbW9yZSB0aGFuIG9uZSBncm91cFxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmVkaXRvckdyb3VwU2VydmljZS5tYWluUGFydC5pc0xheW91dENlbnRlcmVkKCkgIT09IGFjdGl2ZSkge1xuXHRcdFx0dGhpcy5lZGl0b3JHcm91cFNlcnZpY2UubWFpblBhcnQuY2VudGVyTGF5b3V0KGFjdGl2ZSk7XG5cblx0XHRcdGlmICghc2tpcExheW91dCkge1xuXHRcdFx0XHR0aGlzLmxheW91dCgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlTWFpbkVkaXRvckNlbnRlcmVkTGF5b3V0LmZpcmUodGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuTUFJTl9FRElUT1JfQ0VOVEVSRUQpKTtcblx0fVxuXG5cdGdldFNpemUocGFydDogUGFydHMpOiBJVmlld1NpemUge1xuXHRcdHJldHVybiB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodGhpcy5nZXRQYXJ0KHBhcnQpKTtcblx0fVxuXG5cdHNldFNpemUocGFydDogUGFydHMsIHNpemU6IElWaWV3U2l6ZSk6IHZvaWQge1xuXHRcdHRoaXMud29ya2JlbmNoR3JpZC5yZXNpemVWaWV3KHRoaXMuZ2V0UGFydChwYXJ0KSwgc2l6ZSk7XG5cdH1cblxuXHRyZXNpemVQYXJ0KHBhcnQ6IFBhcnRzLCBzaXplQ2hhbmdlV2lkdGg6IG51bWJlciwgc2l6ZUNoYW5nZUhlaWdodDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2l6ZUNoYW5nZVB4V2lkdGggPSBNYXRoLnNpZ24oc2l6ZUNoYW5nZVdpZHRoKSAqIGNvbXB1dGVTY3JlZW5Bd2FyZVNpemUoZ2V0QWN0aXZlV2luZG93KCksIE1hdGguYWJzKHNpemVDaGFuZ2VXaWR0aCkpO1xuXHRcdGNvbnN0IHNpemVDaGFuZ2VQeEhlaWdodCA9IE1hdGguc2lnbihzaXplQ2hhbmdlSGVpZ2h0KSAqIGNvbXB1dGVTY3JlZW5Bd2FyZVNpemUoZ2V0QWN0aXZlV2luZG93KCksIE1hdGguYWJzKHNpemVDaGFuZ2VIZWlnaHQpKTtcblxuXHRcdGxldCB2aWV3U2l6ZTogSVZpZXdTaXplO1xuXG5cdFx0c3dpdGNoIChwYXJ0KSB7XG5cdFx0XHRjYXNlIFBhcnRzLlNJREVCQVJfUEFSVDpcblx0XHRcdFx0dmlld1NpemUgPSB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodGhpcy5zaWRlQmFyUGFydFZpZXcpO1xuXHRcdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQucmVzaXplVmlldyh0aGlzLnNpZGVCYXJQYXJ0Vmlldywge1xuXHRcdFx0XHRcdHdpZHRoOiB2aWV3U2l6ZS53aWR0aCArIHNpemVDaGFuZ2VQeFdpZHRoLFxuXHRcdFx0XHRcdGhlaWdodDogdmlld1NpemUuaGVpZ2h0XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQYXJ0cy5QQU5FTF9QQVJUOlxuXHRcdFx0XHR2aWV3U2l6ZSA9IHRoaXMud29ya2JlbmNoR3JpZC5nZXRWaWV3U2l6ZSh0aGlzLnBhbmVsUGFydFZpZXcpO1xuXG5cdFx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5yZXNpemVWaWV3KHRoaXMucGFuZWxQYXJ0Vmlldywge1xuXHRcdFx0XHRcdHdpZHRoOiB2aWV3U2l6ZS53aWR0aCArIChpc0hvcml6b250YWwodGhpcy5nZXRQYW5lbFBvc2l0aW9uKCkpID8gMCA6IHNpemVDaGFuZ2VQeFdpZHRoKSxcblx0XHRcdFx0XHRoZWlnaHQ6IHZpZXdTaXplLmhlaWdodCArIChpc0hvcml6b250YWwodGhpcy5nZXRQYW5lbFBvc2l0aW9uKCkpID8gc2l6ZUNoYW5nZVB4SGVpZ2h0IDogMClcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUOlxuXHRcdFx0XHR2aWV3U2l6ZSA9IHRoaXMud29ya2JlbmNoR3JpZC5nZXRWaWV3U2l6ZSh0aGlzLmF1eGlsaWFyeUJhclBhcnRWaWV3KTtcblx0XHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLnJlc2l6ZVZpZXcodGhpcy5hdXhpbGlhcnlCYXJQYXJ0Vmlldywge1xuXHRcdFx0XHRcdHdpZHRoOiB2aWV3U2l6ZS53aWR0aCArIHNpemVDaGFuZ2VQeFdpZHRoLFxuXHRcdFx0XHRcdGhlaWdodDogdmlld1NpemUuaGVpZ2h0XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUGFydHMuRURJVE9SX1BBUlQ6XG5cdFx0XHRcdHZpZXdTaXplID0gdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMuZWRpdG9yUGFydFZpZXcpO1xuXG5cdFx0XHRcdC8vIFNpbmdsZSBFZGl0b3IgR3JvdXBcblx0XHRcdFx0aWYgKHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm1haW5QYXJ0LmNvdW50ID09PSAxKSB7XG5cdFx0XHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLnJlc2l6ZVZpZXcodGhpcy5lZGl0b3JQYXJ0Vmlldywge1xuXHRcdFx0XHRcdFx0d2lkdGg6IHZpZXdTaXplLndpZHRoICsgc2l6ZUNoYW5nZVB4V2lkdGgsXG5cdFx0XHRcdFx0XHRoZWlnaHQ6IHZpZXdTaXplLmhlaWdodCArIHNpemVDaGFuZ2VQeEhlaWdodFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGFjdGl2ZUdyb3VwID0gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UubWFpblBhcnQuYWN0aXZlR3JvdXA7XG5cblx0XHRcdFx0XHRjb25zdCB7IHdpZHRoLCBoZWlnaHQgfSA9IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm1haW5QYXJ0LmdldFNpemUoYWN0aXZlR3JvdXApO1xuXHRcdFx0XHRcdHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm1haW5QYXJ0LnNldFNpemUoYWN0aXZlR3JvdXAsIHsgd2lkdGg6IHdpZHRoICsgc2l6ZUNoYW5nZVB4V2lkdGgsIGhlaWdodDogaGVpZ2h0ICsgc2l6ZUNoYW5nZVB4SGVpZ2h0IH0pO1xuXG5cdFx0XHRcdFx0Ly8gQWZ0ZXIgcmVzaXppbmcgdGhlIGVkaXRvciBncm91cFxuXHRcdFx0XHRcdC8vIGlmIGl0IGRvZXMgbm90IGNoYW5nZSBpbiBlaXRoZXIgZGlyZWN0aW9uXG5cdFx0XHRcdFx0Ly8gdHJ5IHJlc2l6aW5nIHRoZSBmdWxsIGVkaXRvciBwYXJ0XG5cdFx0XHRcdFx0Y29uc3QgeyB3aWR0aDogbmV3V2lkdGgsIGhlaWdodDogbmV3SGVpZ2h0IH0gPSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5tYWluUGFydC5nZXRTaXplKGFjdGl2ZUdyb3VwKTtcblx0XHRcdFx0XHRpZiAoKHNpemVDaGFuZ2VQeEhlaWdodCAmJiBoZWlnaHQgPT09IG5ld0hlaWdodCkgfHwgKHNpemVDaGFuZ2VQeFdpZHRoICYmIHdpZHRoID09PSBuZXdXaWR0aCkpIHtcblx0XHRcdFx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5yZXNpemVWaWV3KHRoaXMuZWRpdG9yUGFydFZpZXcsIHtcblx0XHRcdFx0XHRcdFx0d2lkdGg6IHZpZXdTaXplLndpZHRoICsgKHNpemVDaGFuZ2VQeFdpZHRoICYmIHdpZHRoID09PSBuZXdXaWR0aCA/IHNpemVDaGFuZ2VQeFdpZHRoIDogMCksXG5cdFx0XHRcdFx0XHRcdGhlaWdodDogdmlld1NpemUuaGVpZ2h0ICsgKHNpemVDaGFuZ2VQeEhlaWdodCAmJiBoZWlnaHQgPT09IG5ld0hlaWdodCA/IHNpemVDaGFuZ2VQeEhlaWdodCA6IDApXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybjsgLy8gQ2Fubm90IHJlc2l6ZSBvdGhlciBwYXJ0c1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0QWN0aXZpdHlCYXJIaWRkZW4oaGlkZGVuOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5zdGF0ZU1vZGVsLnNldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuQUNUSVZJVFlCQVJfSElEREVOLCBoaWRkZW4pO1xuXHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKExheW91dENsYXNzZXMuQUNUSVZJVFlCQVJfSElEREVOLCBoaWRkZW4pO1xuXHRcdHRoaXMud29ya2JlbmNoR3JpZC5zZXRWaWV3VmlzaWJsZSh0aGlzLmFjdGl2aXR5QmFyUGFydFZpZXcsICFoaWRkZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRCYW5uZXJIaWRkZW4oaGlkZGVuOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy53b3JrYmVuY2hHcmlkLnNldFZpZXdWaXNpYmxlKHRoaXMuYmFubmVyUGFydFZpZXcsICFoaWRkZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRFZGl0b3JIaWRkZW4oaGlkZGVuOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCFoaWRkZW4gJiYgdGhpcy5zZXRBdXhpbGlhcnlCYXJNYXhpbWl6ZWQoZmFsc2UpICYmIHRoaXMuaXNWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJUKSkge1xuXHRcdFx0cmV0dXJuOyAvLyByZXR1cm46IGxlYXZpbmcgbWF4aW1pc2VkIGF1eGlsaWFyeSBiYXIgbWFkZSB0aGlzIHBhcnQgdmlzaWJsZVxuXHRcdH1cblxuXHRcdHRoaXMuc3RhdGVNb2RlbC5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkVESVRPUl9ISURERU4sIGhpZGRlbik7XG5cblx0XHQvLyBBZGp1c3QgQ1NTXG5cdFx0aWYgKGhpZGRlbikge1xuXHRcdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoTGF5b3V0Q2xhc3Nlcy5NQUlOX0VESVRPUl9BUkVBX0hJRERFTik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKExheW91dENsYXNzZXMuTUFJTl9FRElUT1JfQVJFQV9ISURERU4pO1xuXHRcdH1cblxuXHRcdC8vIFByb3BhZ2F0ZSB0byBncmlkXG5cdFx0dGhpcy53b3JrYmVuY2hHcmlkLnNldFZpZXdWaXNpYmxlKHRoaXMuZWRpdG9yUGFydFZpZXcsICFoaWRkZW4pO1xuXG5cdFx0Ly8gVGhlIGVkaXRvciBhbmQgcGFuZWwgY2Fubm90IGJlIGhpZGRlbiBhdCB0aGUgc2FtZSB0aW1lXG5cdFx0Ly8gdW5sZXNzIHdlIGhhdmUgYSBtYXhpbWl6ZWQgYXV4aWxpYXJ5IGJhclxuXHRcdGlmIChoaWRkZW4gJiYgIXRoaXMuaXNWaXNpYmxlKFBhcnRzLlBBTkVMX1BBUlQpICYmICF0aGlzLmlzQXV4aWxpYXJ5QmFyTWF4aW1pemVkKCkpIHtcblx0XHRcdHRoaXMuc2V0UGFuZWxIaWRkZW4oZmFsc2UsIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdGdldExheW91dENsYXNzZXMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBjb2FsZXNjZShbXG5cdFx0XHQhdGhpcy5pc1Zpc2libGUoUGFydHMuU0lERUJBUl9QQVJUKSA/IExheW91dENsYXNzZXMuU0lERUJBUl9ISURERU4gOiB1bmRlZmluZWQsXG5cdFx0XHQhdGhpcy5pc1Zpc2libGUoUGFydHMuRURJVE9SX1BBUlQsIG1haW5XaW5kb3cpID8gTGF5b3V0Q2xhc3Nlcy5NQUlOX0VESVRPUl9BUkVBX0hJRERFTiA6IHVuZGVmaW5lZCxcblx0XHRcdCF0aGlzLmlzVmlzaWJsZShQYXJ0cy5QQU5FTF9QQVJUKSA/IExheW91dENsYXNzZXMuUEFORUxfSElEREVOIDogdW5kZWZpbmVkLFxuXHRcdFx0IXRoaXMuaXNWaXNpYmxlKFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSA/IExheW91dENsYXNzZXMuQVVYSUxJQVJZQkFSX0hJRERFTiA6IHVuZGVmaW5lZCxcblx0XHRcdCF0aGlzLmlzVmlzaWJsZShQYXJ0cy5BQ1RJVklUWUJBUl9QQVJUKSA/IExheW91dENsYXNzZXMuQUNUSVZJVFlCQVJfSElEREVOIDogdW5kZWZpbmVkLFxuXHRcdFx0IXRoaXMuaXNWaXNpYmxlKFBhcnRzLlNUQVRVU0JBUl9QQVJUKSA/IExheW91dENsYXNzZXMuU1RBVFVTQkFSX0hJRERFTiA6IHVuZGVmaW5lZCxcblx0XHRcdGlzRmxvYXRpbmdUb3BFZGdlRXhwb3NlZCh0aGlzLCBtYWluV2luZG93KSA/IExheW91dENsYXNzZXMuVE9QX1dJTkRPV19FREdFIDogdW5kZWZpbmVkLFxuXHRcdFx0dGhpcy5zdGF0ZS5ydW50aW1lLm1haW5XaW5kb3dGdWxsc2NyZWVuID8gTGF5b3V0Q2xhc3Nlcy5GVUxMU0NSRUVOIDogdW5kZWZpbmVkLFxuXHRcdFx0dGhpcy5pc1NoYWRvd3NEaXNhYmxlZCgpID8gTGF5b3V0Q2xhc3Nlcy5OT19TSEFET1dTIDogdW5kZWZpbmVkLFxuXHRcdFx0dGhpcy5pc0Zsb2F0aW5nUGFuZWxzRW5hYmxlZCgpID8gTGF5b3V0Q2xhc3Nlcy5GTE9BVElOR19QQU5FTFMgOiB1bmRlZmluZWQsXG5cdFx0XHQvLyBBbHNvIHNlZWQgdGhlIHN0eWxlLW92ZXJyaWRlIGNsYXNzIGhlcmUgKHNlZSBgTGF5b3V0Q2xhc3Nlcy5TVFlMRV9PVkVSUklERWApLlxuXHRcdFx0dGhpcy5pc0Zsb2F0aW5nUGFuZWxzRW5hYmxlZCgpID8gTGF5b3V0Q2xhc3Nlcy5TVFlMRV9PVkVSUklERSA6IHVuZGVmaW5lZCxcblx0XHRcdHRoaXMuaXNGbG9hdGluZ1BhbmVsc0VuYWJsZWQoKSA/IExheW91dENsYXNzZXMuTU9ERVJOX1VJX1RBQlMgOiB1bmRlZmluZWQsXG5cdFx0XHRgcGFuZWwtcG9zaXRpb24tJHtwb3NpdGlvblRvU3RyaW5nKHRoaXMuZ2V0UGFuZWxQb3NpdGlvbigpKX1gLFxuXHRcdFx0YHBhbmVsLWFsaWdubWVudC0ke3RoaXMuZ2V0UGFuZWxBbGlnbm1lbnQoKX1gXG5cdFx0XSk7XG5cdH1cblxuXHRwcml2YXRlIHNldFNpZGVCYXJIaWRkZW4oaGlkZGVuOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCFoaWRkZW4gJiYgdGhpcy5zZXRBdXhpbGlhcnlCYXJNYXhpbWl6ZWQoZmFsc2UpICYmIHRoaXMuaXNWaXNpYmxlKFBhcnRzLlNJREVCQVJfUEFSVCkpIHtcblx0XHRcdHJldHVybjsgLy8gcmV0dXJuOiBsZWF2aW5nIG1heGltaXNlZCBhdXhpbGlhcnkgYmFyIG1hZGUgdGhpcyBwYXJ0IHZpc2libGVcblx0XHR9XG5cblx0XHR0aGlzLnN0YXRlTW9kZWwuc2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5TSURFQkFSX0hJRERFTiwgaGlkZGVuKTtcblxuXHRcdC8vIEFkanVzdCBDU1Ncblx0XHRpZiAoaGlkZGVuKSB7XG5cdFx0XHR0aGlzLm1haW5Db250YWluZXIuY2xhc3NMaXN0LmFkZChMYXlvdXRDbGFzc2VzLlNJREVCQVJfSElEREVOKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoTGF5b3V0Q2xhc3Nlcy5TSURFQkFSX0hJRERFTik7XG5cdFx0fVxuXG5cdFx0Ly8gUHJvcGFnYXRlIHRvIGdyaWRcblx0XHR0aGlzLndvcmtiZW5jaEdyaWQuc2V0Vmlld1Zpc2libGUodGhpcy5zaWRlQmFyUGFydFZpZXcsICFoaWRkZW4pO1xuXG5cdFx0Ly8gSWYgc2lkZWJhciBiZWNvbWVzIGhpZGRlbiwgYWxzbyBoaWRlIHRoZSBjdXJyZW50IGFjdGl2ZSBWaWV3bGV0IGlmIGFueVxuXHRcdGlmIChoaWRkZW4gJiYgdGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5nZXRBY3RpdmVQYW5lQ29tcG9zaXRlKFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKSkge1xuXHRcdFx0dGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5oaWRlQWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cblx0XHRcdGlmICghdGhpcy5pc0F1eGlsaWFyeUJhck1heGltaXplZCgpKSB7XG5cdFx0XHRcdHRoaXMuZm9jdXNQYW5lbE9yRWRpdG9yKCk7IC8vIGRvIG5vdCBhdXRvIGZvY3VzIHdoZW4gYXV4aWxpYXJ5IGJhciBpcyBtYXhpbWl6ZWRcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiBzaWRlYmFyIGJlY29tZXMgdmlzaWJsZSwgc2hvdyBsYXN0IGFjdGl2ZSBWaWV3bGV0IG9yIGRlZmF1bHQgdmlld2xldFxuXHRcdGVsc2UgaWYgKCFoaWRkZW4gJiYgIXRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcikpIHtcblx0XHRcdGNvbnN0IHZpZXdsZXRUb09wZW4gPSB0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldExhc3RBY3RpdmVQYW5lQ29tcG9zaXRlSWQoVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpO1xuXHRcdFx0aWYgKHZpZXdsZXRUb09wZW4pIHtcblx0XHRcdFx0dGhpcy5vcGVuVmlld0NvbnRhaW5lcihWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhciwgdmlld2xldFRvT3Blbik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYXNWaWV3cyhpZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgdmlld0NvbnRhaW5lciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeUlkKGlkKTtcblx0XHRpZiAoIXZpZXdDb250YWluZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCB2aWV3Q29udGFpbmVyTW9kZWwgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwodmlld0NvbnRhaW5lcik7XG5cdFx0aWYgKCF2aWV3Q29udGFpbmVyTW9kZWwpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdmlld0NvbnRhaW5lck1vZGVsLmFjdGl2ZVZpZXdEZXNjcmlwdG9ycy5sZW5ndGggPj0gMTtcblx0fVxuXG5cdHByaXZhdGUgYWRqdXN0UGFydFBvc2l0aW9ucyhzaWRlQmFyUG9zaXRpb246IFBvc2l0aW9uLCBwYW5lbEFsaWdubWVudDogUGFuZWxBbGlnbm1lbnQsIHBhbmVsUG9zaXRpb246IFBvc2l0aW9uKTogdm9pZCB7XG5cblx0XHQvLyBNb3ZlIGFjdGl2aXR5IGJhciBhbmQgc2lkZSBiYXJzXG5cdFx0Y29uc3QgaXNQYW5lbFZlcnRpY2FsID0gIWlzSG9yaXpvbnRhbChwYW5lbFBvc2l0aW9uKTtcblx0XHRjb25zdCBzaWRlQmFyU2libGluZ1RvRWRpdG9yID0gaXNQYW5lbFZlcnRpY2FsIHx8ICEocGFuZWxBbGlnbm1lbnQgPT09ICdjZW50ZXInIHx8IChzaWRlQmFyUG9zaXRpb24gPT09IFBvc2l0aW9uLkxFRlQgJiYgcGFuZWxBbGlnbm1lbnQgPT09ICdyaWdodCcpIHx8IChzaWRlQmFyUG9zaXRpb24gPT09IFBvc2l0aW9uLlJJR0hUICYmIHBhbmVsQWxpZ25tZW50ID09PSAnbGVmdCcpKTtcblx0XHRjb25zdCBhdXhpbGlhcnlCYXJTaWJsaW5nVG9FZGl0b3IgPSBpc1BhbmVsVmVydGljYWwgfHwgIShwYW5lbEFsaWdubWVudCA9PT0gJ2NlbnRlcicgfHwgKHNpZGVCYXJQb3NpdGlvbiA9PT0gUG9zaXRpb24uUklHSFQgJiYgcGFuZWxBbGlnbm1lbnQgPT09ICdyaWdodCcpIHx8IChzaWRlQmFyUG9zaXRpb24gPT09IFBvc2l0aW9uLkxFRlQgJiYgcGFuZWxBbGlnbm1lbnQgPT09ICdsZWZ0JykpO1xuXHRcdGNvbnN0IHByZU1vdmVQYW5lbFdpZHRoID0gIXRoaXMuaXNWaXNpYmxlKFBhcnRzLlBBTkVMX1BBUlQpID8gU2l6aW5nLkludmlzaWJsZSh0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld0NhY2hlZFZpc2libGVTaXplKHRoaXMucGFuZWxQYXJ0VmlldykgPz8gdGhpcy5wYW5lbFBhcnRWaWV3Lm1pbmltdW1XaWR0aCkgOiB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodGhpcy5wYW5lbFBhcnRWaWV3KS53aWR0aDtcblx0XHRjb25zdCBwcmVNb3ZlUGFuZWxIZWlnaHQgPSAhdGhpcy5pc1Zpc2libGUoUGFydHMuUEFORUxfUEFSVCkgPyBTaXppbmcuSW52aXNpYmxlKHRoaXMud29ya2JlbmNoR3JpZC5nZXRWaWV3Q2FjaGVkVmlzaWJsZVNpemUodGhpcy5wYW5lbFBhcnRWaWV3KSA/PyB0aGlzLnBhbmVsUGFydFZpZXcubWluaW11bUhlaWdodCkgOiB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodGhpcy5wYW5lbFBhcnRWaWV3KS5oZWlnaHQ7XG5cdFx0Y29uc3QgcHJlTW92ZVNpZGVCYXJTaXplID0gIXRoaXMuaXNWaXNpYmxlKFBhcnRzLlNJREVCQVJfUEFSVCkgPyBTaXppbmcuSW52aXNpYmxlKHRoaXMud29ya2JlbmNoR3JpZC5nZXRWaWV3Q2FjaGVkVmlzaWJsZVNpemUodGhpcy5zaWRlQmFyUGFydFZpZXcpID8/IHRoaXMuc2lkZUJhclBhcnRWaWV3Lm1pbmltdW1XaWR0aCkgOiB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodGhpcy5zaWRlQmFyUGFydFZpZXcpLndpZHRoO1xuXHRcdGNvbnN0IHByZU1vdmVBdXhpbGlhcnlCYXJTaXplID0gIXRoaXMuaXNWaXNpYmxlKFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSA/IFNpemluZy5JbnZpc2libGUodGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdDYWNoZWRWaXNpYmxlU2l6ZSh0aGlzLmF1eGlsaWFyeUJhclBhcnRWaWV3KSA/PyB0aGlzLmF1eGlsaWFyeUJhclBhcnRWaWV3Lm1pbmltdW1XaWR0aCkgOiB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodGhpcy5hdXhpbGlhcnlCYXJQYXJ0Vmlldykud2lkdGg7XG5cblx0XHRjb25zdCBmb2N1c2VkUGFydCA9IFtQYXJ0cy5QQU5FTF9QQVJULCBQYXJ0cy5TSURFQkFSX1BBUlQsIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUXS5maW5kKHBhcnQgPT4gdGhpcy5oYXNGb2N1cyhwYXJ0KSkgYXMgU0lOR0xFX1dJTkRPV19QQVJUUyB8IHVuZGVmaW5lZDtcblxuXHRcdGlmIChzaWRlQmFyUG9zaXRpb24gPT09IFBvc2l0aW9uLkxFRlQpIHtcblx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5tb3ZlVmlld1RvKHRoaXMuYWN0aXZpdHlCYXJQYXJ0VmlldywgWzIsIDBdKTtcblx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5tb3ZlVmlldyh0aGlzLnNpZGVCYXJQYXJ0VmlldywgcHJlTW92ZVNpZGVCYXJTaXplLCBzaWRlQmFyU2libGluZ1RvRWRpdG9yID8gdGhpcy5lZGl0b3JQYXJ0VmlldyA6IHRoaXMuYWN0aXZpdHlCYXJQYXJ0Vmlldywgc2lkZUJhclNpYmxpbmdUb0VkaXRvciA/IERpcmVjdGlvbi5MZWZ0IDogRGlyZWN0aW9uLlJpZ2h0KTtcblx0XHRcdGlmIChhdXhpbGlhcnlCYXJTaWJsaW5nVG9FZGl0b3IpIHtcblx0XHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLm1vdmVWaWV3KHRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcsIHByZU1vdmVBdXhpbGlhcnlCYXJTaXplLCB0aGlzLmVkaXRvclBhcnRWaWV3LCBEaXJlY3Rpb24uUmlnaHQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLm1vdmVWaWV3VG8odGhpcy5hdXhpbGlhcnlCYXJQYXJ0VmlldywgWzIsIC0xXSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5tb3ZlVmlld1RvKHRoaXMuYWN0aXZpdHlCYXJQYXJ0VmlldywgWzIsIC0xXSk7XG5cdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQubW92ZVZpZXcodGhpcy5zaWRlQmFyUGFydFZpZXcsIHByZU1vdmVTaWRlQmFyU2l6ZSwgc2lkZUJhclNpYmxpbmdUb0VkaXRvciA/IHRoaXMuZWRpdG9yUGFydFZpZXcgOiB0aGlzLmFjdGl2aXR5QmFyUGFydFZpZXcsIHNpZGVCYXJTaWJsaW5nVG9FZGl0b3IgPyBEaXJlY3Rpb24uUmlnaHQgOiBEaXJlY3Rpb24uTGVmdCk7XG5cdFx0XHRpZiAoYXV4aWxpYXJ5QmFyU2libGluZ1RvRWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5tb3ZlVmlldyh0aGlzLmF1eGlsaWFyeUJhclBhcnRWaWV3LCBwcmVNb3ZlQXV4aWxpYXJ5QmFyU2l6ZSwgdGhpcy5lZGl0b3JQYXJ0VmlldywgRGlyZWN0aW9uLkxlZnQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLm1vdmVWaWV3VG8odGhpcy5hdXhpbGlhcnlCYXJQYXJ0VmlldywgWzIsIDBdKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBNYWludGFpbiBmb2N1cyBhZnRlciBtb3ZpbmcgcGFydHNcblx0XHRpZiAoZm9jdXNlZFBhcnQpIHtcblx0XHRcdHRoaXMuZm9jdXNQYXJ0KGZvY3VzZWRQYXJ0KTtcblx0XHR9XG5cblx0XHQvLyBXZSBtb3ZlZCBhbGwgdGhlIHNpZGUgcGFydHMgYmFzZWQgb24gdGhlIGVkaXRvciBhbmQgaWdub3JlZCB0aGUgcGFuZWxcblx0XHQvLyBOb3csIHdlIG5lZWQgdG8gcHV0IHRoZSBwYW5lbCBiYWNrIGluIHRoZSByaWdodCBwb3NpdGlvbiB3aGVuIGl0IGlzIG5leHQgdG8gdGhlIGVkaXRvclxuXHRcdGlmIChpc1BhbmVsVmVydGljYWwpIHtcblx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5tb3ZlVmlldyh0aGlzLnBhbmVsUGFydFZpZXcsIHByZU1vdmVQYW5lbFdpZHRoLCB0aGlzLmVkaXRvclBhcnRWaWV3LCBwYW5lbFBvc2l0aW9uID09PSBQb3NpdGlvbi5MRUZUID8gRGlyZWN0aW9uLkxlZnQgOiBEaXJlY3Rpb24uUmlnaHQpO1xuXHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLnJlc2l6ZVZpZXcodGhpcy5wYW5lbFBhcnRWaWV3LCB7XG5cdFx0XHRcdGhlaWdodDogcHJlTW92ZVBhbmVsSGVpZ2h0IGFzIG51bWJlcixcblx0XHRcdFx0d2lkdGg6IHByZU1vdmVQYW5lbFdpZHRoIGFzIG51bWJlclxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gTW92aW5nIHZpZXdzIGluIHRoZSBncmlkIGNhbiBjYXVzZSB0aGVtIHRvIHJlLWRpc3RyaWJ1dGUgc2l6aW5nIHVubmVjZXNzYXJpbHlcblx0XHQvLyBSZXNpemUgdmlzaWJsZSBwYXJ0cyB0byB0aGUgd2lkdGggdGhleSB3ZXJlIGJlZm9yZSB0aGUgb3BlcmF0aW9uXG5cdFx0aWYgKHRoaXMuaXNWaXNpYmxlKFBhcnRzLlNJREVCQVJfUEFSVCkpIHtcblx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5yZXNpemVWaWV3KHRoaXMuc2lkZUJhclBhcnRWaWV3LCB7XG5cdFx0XHRcdGhlaWdodDogdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMuc2lkZUJhclBhcnRWaWV3KS5oZWlnaHQsXG5cdFx0XHRcdHdpZHRoOiBwcmVNb3ZlU2lkZUJhclNpemUgYXMgbnVtYmVyXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pc1Zpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpKSB7XG5cdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQucmVzaXplVmlldyh0aGlzLmF1eGlsaWFyeUJhclBhcnRWaWV3LCB7XG5cdFx0XHRcdGhlaWdodDogdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcpLmhlaWdodCxcblx0XHRcdFx0d2lkdGg6IHByZU1vdmVBdXhpbGlhcnlCYXJTaXplIGFzIG51bWJlclxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0c2V0UGFuZWxBbGlnbm1lbnQoYWxpZ25tZW50OiBQYW5lbEFsaWdubWVudCk6IHZvaWQge1xuXG5cdFx0Ly8gUGFuZWwgYWxpZ25tZW50IG9ubHkgYXBwbGllcyB0byBhIHBhbmVsIGluIHRoZSB0b3AvYm90dG9tIHBvc2l0aW9uXG5cdFx0aWYgKCFpc0hvcml6b250YWwodGhpcy5nZXRQYW5lbFBvc2l0aW9uKCkpKSB7XG5cdFx0XHR0aGlzLnNldFBhbmVsUG9zaXRpb24oUG9zaXRpb24uQk9UVE9NKTtcblx0XHR9XG5cblx0XHQvLyB0aGUgd29ya2JlbmNoIGdyaWQgY3VycmVudGx5IHByZXZlbnRzIHVzIGZyb20gc3VwcG9ydGluZyBwYW5lbCBtYXhpbWl6YXRpb24gd2l0aCBub24tY2VudGVyIHBhbmVsIGFsaWdubWVudFxuXHRcdGlmIChhbGlnbm1lbnQgIT09ICdjZW50ZXInICYmIHRoaXMuaXNQYW5lbE1heGltaXplZCgpKSB7XG5cdFx0XHR0aGlzLnRvZ2dsZU1heGltaXplZFBhbmVsKCk7XG5cdFx0fVxuXG5cdFx0Ly8gTGVhdmUgYXV4aWxpYXJ5IGJhciBtYXhpbWl6ZWQgc3RhdGUgYmVjYXVzZSBjaGFuZ2luZ1xuXHRcdC8vIHBhbmVsIGFsaWdubWVudCByZXF1aXJlcyB0aGUgZWRpdG9yIHBhcnQgdG8gYmUgdmlzaWJsZVxuXHRcdHRoaXMuc2V0QXV4aWxpYXJ5QmFyTWF4aW1pemVkKGZhbHNlKTtcblxuXHRcdC8vIEFkanVzdCBDU1MgXHUyMDE0IGNhcHR1cmUgb2xkIHZhbHVlIGJlZm9yZSB1cGRhdGluZyBzdGF0ZSBtb2RlbFxuXHRcdGNvbnN0IG9sZEFsaWdubWVudFZhbHVlID0gdGhpcy5nZXRQYW5lbEFsaWdubWVudCgpO1xuXHRcdHRoaXMuc3RhdGVNb2RlbC5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlBBTkVMX0FMSUdOTUVOVCwgYWxpZ25tZW50KTtcblx0XHR0aGlzLm1haW5Db250YWluZXIuY2xhc3NMaXN0LnJlbW92ZShgcGFuZWwtYWxpZ25tZW50LSR7b2xkQWxpZ25tZW50VmFsdWV9YCk7XG5cdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoYHBhbmVsLWFsaWdubWVudC0ke2FsaWdubWVudH1gKTtcblxuXHRcdHRoaXMuYWRqdXN0UGFydFBvc2l0aW9ucyh0aGlzLmdldFNpZGVCYXJQb3NpdGlvbigpLCBhbGlnbm1lbnQsIHRoaXMuZ2V0UGFuZWxQb3NpdGlvbigpKTtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUGFuZWxBbGlnbm1lbnQuZmlyZShhbGlnbm1lbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRQYW5lbEhpZGRlbihoaWRkZW46IGJvb2xlYW4sIHNraXBMYXlvdXQ/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLndvcmtiZW5jaEdyaWQpIHtcblx0XHRcdHJldHVybjsgLy8gUmV0dXJuIGlmIG5vdCBpbml0aWFsaXplZCBmdWxseSAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEwNTQ4MClcblx0XHR9XG5cblx0XHRpZiAoIWhpZGRlbiAmJiB0aGlzLnNldEF1eGlsaWFyeUJhck1heGltaXplZChmYWxzZSkgJiYgdGhpcy5pc1Zpc2libGUoUGFydHMuUEFORUxfUEFSVCkpIHtcblx0XHRcdHJldHVybjsgLy8gcmV0dXJuOiBsZWF2aW5nIG1heGltaXNlZCBhdXhpbGlhcnkgYmFyIG1hZGUgdGhpcyBwYXJ0IHZpc2libGVcblx0XHR9XG5cblx0XHRjb25zdCB3YXNIaWRkZW4gPSAhdGhpcy5pc1Zpc2libGUoUGFydHMuUEFORUxfUEFSVCk7XG5cdFx0Y29uc3QgaXNQYW5lbE1heGltaXplZCA9IHRoaXMuaXNQYW5lbE1heGltaXplZCgpO1xuXG5cdFx0dGhpcy5zdGF0ZU1vZGVsLnNldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuUEFORUxfSElEREVOLCBoaWRkZW4pO1xuXG5cdFx0Y29uc3QgcGFuZWxPcGVuc01heGltaXplZCA9IHRoaXMucGFuZWxPcGVuc01heGltaXplZCgpO1xuXG5cdFx0Ly8gQWRqdXN0IENTU1xuXHRcdGlmIChoaWRkZW4pIHtcblx0XHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKExheW91dENsYXNzZXMuUEFORUxfSElEREVOKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoTGF5b3V0Q2xhc3Nlcy5QQU5FTF9ISURERU4pO1xuXHRcdH1cblxuXHRcdC8vIElmIG1heGltaXplZCBhbmQgaW4gcHJvY2VzcyBvZiBoaWRpbmcsIHVubWF4aW1pemUgRklSU1QgYmVmb3JlXG5cdFx0Ly8gY2hhbmdpbmcgdmlzaWJpbGl0eSB0byBwcmV2ZW50IGNvbmZsaWN0IHdpdGggc2V0RWRpdG9ySGlkZGVuXG5cdFx0Ly8gd2hpY2ggd291bGQgZm9yY2UgcGFuZWwgdmlzaWJsZSBhZ2FpbiAoZml4ZXMgIzI4MTc3Milcblx0XHRpZiAoaGlkZGVuICYmIGlzUGFuZWxNYXhpbWl6ZWQpIHtcblx0XHRcdHRoaXMudG9nZ2xlTWF4aW1pemVkUGFuZWwoKTtcblx0XHR9XG5cblx0XHQvLyBQcm9wYWdhdGUgbGF5b3V0IGNoYW5nZXMgdG8gZ3JpZFxuXHRcdHRoaXMud29ya2JlbmNoR3JpZC5zZXRWaWV3VmlzaWJsZSh0aGlzLnBhbmVsUGFydFZpZXcsICFoaWRkZW4pO1xuXG5cdFx0Ly8gSWYgcGFuZWwgcGFydCBiZWNvbWVzIGhpZGRlbiwgYWxzbyBoaWRlIHRoZSBjdXJyZW50IGFjdGl2ZSBwYW5lbCBpZiBhbnlcblx0XHRsZXQgZm9jdXNFZGl0b3IgPSBmYWxzZTtcblx0XHRpZiAoaGlkZGVuICYmIHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpKSB7XG5cdFx0XHR0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmhpZGVBY3RpdmVQYW5lQ29tcG9zaXRlKFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCk7XG5cdFx0XHRpZiAoXG5cdFx0XHRcdCFpc0lPUyAmJlx0XHRcdFx0XHRcdC8vIGRvIG5vdCBhdXRvIGZvY3VzIG9uIGlPUyAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEyNzgzMilcblx0XHRcdFx0IXRoaXMuaXNBdXhpbGlhcnlCYXJNYXhpbWl6ZWQoKVx0Ly8gZG8gbm90IGF1dG8gZm9jdXMgd2hlbiBhdXhpbGlhcnkgYmFyIGlzIG1heGltaXplZFxuXHRcdFx0KSB7XG5cdFx0XHRcdGZvY3VzRWRpdG9yID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiBwYW5lbCBwYXJ0IGJlY29tZXMgdmlzaWJsZSwgc2hvdyBsYXN0IGFjdGl2ZSBwYW5lbCBvciBkZWZhdWx0IHBhbmVsXG5cdFx0ZWxzZSBpZiAoIWhpZGRlbiAmJiAhdGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5nZXRBY3RpdmVQYW5lQ29tcG9zaXRlKFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCkpIHtcblx0XHRcdGxldCBwYW5lbFRvT3Blbjogc3RyaW5nIHwgdW5kZWZpbmVkID0gdGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5nZXRMYXN0QWN0aXZlUGFuZUNvbXBvc2l0ZUlkKFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCk7XG5cblx0XHRcdC8vIHZlcmlmeSB0aGF0IHRoZSBwYW5lbCB3ZSB0cnkgdG8gb3BlbiBoYXMgdmlld3MgYmVmb3JlIHdlIGRlZmF1bHQgdG8gaXRcblx0XHRcdC8vIG90aGVyd2lzZSBmYWxsIGJhY2sgdG8gYW55IHZpZXcgdGhhdCBoYXMgdmlld3Mgc3RpbGwgcmVmcyAjMTExNDYzXG5cdFx0XHRpZiAoIXBhbmVsVG9PcGVuIHx8ICF0aGlzLmhhc1ZpZXdzKHBhbmVsVG9PcGVuKSkge1xuXHRcdFx0XHRwYW5lbFRvT3BlbiA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlXG5cdFx0XHRcdFx0LmdldFZpZXdDb250YWluZXJzQnlMb2NhdGlvbihWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpXG5cdFx0XHRcdFx0LmZpbmQodmlld0NvbnRhaW5lciA9PiB0aGlzLmhhc1ZpZXdzKHZpZXdDb250YWluZXIuaWQpKT8uaWQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwYW5lbFRvT3Blbikge1xuXHRcdFx0XHR0aGlzLm9wZW5WaWV3Q29udGFpbmVyKFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCwgcGFuZWxUb09wZW4sICFza2lwTGF5b3V0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBEb24ndCBwcm9jZWVkIGlmIHdlIGhhdmUgYWxyZWFkeSBkb25lIHRoaXMgYmVmb3JlXG5cdFx0aWYgKHdhc0hpZGRlbiA9PT0gaGlkZGVuKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSWYgaW4gcHJvY2VzcyBvZiBzaG93aW5nLCB0b2dnbGUgd2hldGhlciBvciBub3QgcGFuZWwgaXMgbWF4aW1pemVkXG5cdFx0aWYgKCFoaWRkZW4pIHtcblx0XHRcdGlmICghc2tpcExheW91dCAmJiBpc1BhbmVsTWF4aW1pemVkICE9PSBwYW5lbE9wZW5zTWF4aW1pemVkKSB7XG5cdFx0XHRcdHRoaXMudG9nZ2xlTWF4aW1pemVkUGFuZWwoKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gSWYgaW4gcHJvY2VzcyBvZiBoaWRpbmcsIHJlbWVtYmVyIHdoZXRoZXIgdGhlIHBhbmVsIGlzIG1heGltaXplZCBvciBub3Rcblx0XHRcdHRoaXMuc3RhdGVNb2RlbC5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlBBTkVMX1dBU19MQVNUX01BWElNSVpFRCwgaXNQYW5lbE1heGltaXplZCk7XG5cdFx0fVxuXG5cdFx0aWYgKGZvY3VzRWRpdG9yKSB7XG5cdFx0XHR0aGlzLmVkaXRvckdyb3VwU2VydmljZS5tYWluUGFydC5hY3RpdmVHcm91cC5mb2N1cygpOyAvLyBQYXNzIGZvY3VzIHRvIGVkaXRvciBncm91cCBpZiBwYW5lbCBwYXJ0IGlzIG5vdyBoaWRkZW5cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGluTWF4aW1pemVkQXV4aWxpYXJ5QmFyVHJhbnNpdGlvbiA9IGZhbHNlO1xuXG5cdGlzQXV4aWxpYXJ5QmFyTWF4aW1pemVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5BVVhJTElBUllCQVJfV0FTX0xBU1RfTUFYSU1JWkVEKTtcblx0fVxuXG5cdHRvZ2dsZU1heGltaXplZEF1eGlsaWFyeUJhcigpOiB2b2lkIHtcblx0XHR0aGlzLnNldEF1eGlsaWFyeUJhck1heGltaXplZCghdGhpcy5pc0F1eGlsaWFyeUJhck1heGltaXplZCgpKTtcblx0fVxuXG5cdHNldEF1eGlsaWFyeUJhck1heGltaXplZChtYXhpbWl6ZWQ6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRpZiAoXG5cdFx0XHR0aGlzLmluTWF4aW1pemVkQXV4aWxpYXJ5QmFyVHJhbnNpdGlvbiB8fFx0XHQvLyBwcmV2ZW50IHJlLWVudHJhbmNlXG5cdFx0XHQobWF4aW1pemVkID09PSB0aGlzLmlzQXV4aWxpYXJ5QmFyTWF4aW1pemVkKCkpXHQvLyByZXR1cm4gZWFybHkgaWYgc3RhdGUgaXMgYWxyZWFkeSBwcmVzZW50XG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKG1heGltaXplZCkge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB7XG5cdFx0XHRcdHNpZGVCYXJWaXNpYmxlOiB0aGlzLmlzVmlzaWJsZShQYXJ0cy5TSURFQkFSX1BBUlQpLFxuXHRcdFx0XHRlZGl0b3JWaXNpYmxlOiB0aGlzLmlzVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCksXG5cdFx0XHRcdHBhbmVsVmlzaWJsZTogdGhpcy5pc1Zpc2libGUoUGFydHMuUEFORUxfUEFSVCksXG5cdFx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IHRoaXMuaXNWaXNpYmxlKFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKVxuXHRcdFx0fTtcblx0XHRcdHRoaXMuc3RhdGVNb2RlbC5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFVWElMSUFSWUJBUl9XQVNfTEFTVF9NQVhJTUlaRUQsIHRydWUpO1xuXG5cdFx0XHR0aGlzLmluTWF4aW1pemVkQXV4aWxpYXJ5QmFyVHJhbnNpdGlvbiA9IHRydWU7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAoIXN0YXRlLmF1eGlsaWFyeUJhclZpc2libGUpIHtcblx0XHRcdFx0XHR0aGlzLnNldEF1eGlsaWFyeUJhckhpZGRlbihmYWxzZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzaXplID0gdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcpLndpZHRoO1xuXHRcdFx0XHR0aGlzLnN0YXRlTW9kZWwuc2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5BVVhJTElBUllCQVJfTEFTVF9OT05fTUFYSU1JWkVEX1NJWkUsIHNpemUpO1xuXG5cdFx0XHRcdGlmIChzdGF0ZS5zaWRlQmFyVmlzaWJsZSkge1xuXHRcdFx0XHRcdHRoaXMuc2V0U2lkZUJhckhpZGRlbih0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc3RhdGUucGFuZWxWaXNpYmxlKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRQYW5lbEhpZGRlbih0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc3RhdGUuZWRpdG9yVmlzaWJsZSkge1xuXHRcdFx0XHRcdHRoaXMuc2V0RWRpdG9ySGlkZGVuKHRydWUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5zdGF0ZU1vZGVsLnNldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuQVVYSUxJQVJZQkFSX0xBU1RfTk9OX01BWElNSVpFRF9WSVNJQklMSVRZLCBzdGF0ZSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0aGlzLmluTWF4aW1pemVkQXV4aWxpYXJ5QmFyVHJhbnNpdGlvbiA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFVWElMSUFSWUJBUl9MQVNUX05PTl9NQVhJTUlaRURfVklTSUJJTElUWSkpO1xuXHRcdFx0dGhpcy5zdGF0ZU1vZGVsLnNldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuQVVYSUxJQVJZQkFSX1dBU19MQVNUX01BWElNSVpFRCwgZmFsc2UpO1xuXG5cdFx0XHR0aGlzLmluTWF4aW1pemVkQXV4aWxpYXJ5QmFyVHJhbnNpdGlvbiA9IHRydWU7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLnNldEVkaXRvckhpZGRlbighc3RhdGU/LmVkaXRvclZpc2libGUpO1x0Ly8gdGhpcyBvcmRlciBvZiB1cGRhdGluZyB2aWV3IHZpc2liaWxpdHlcblx0XHRcdFx0dGhpcy5zZXRQYW5lbEhpZGRlbighc3RhdGU/LnBhbmVsVmlzaWJsZSk7XHRcdC8vIGhlbHBzIGluIHJlc3RvcmluZyB0aGUgcHJldmlvdXMgdmlld1xuXHRcdFx0XHR0aGlzLnNldFNpZGVCYXJIaWRkZW4oIXN0YXRlPy5zaWRlQmFyVmlzaWJsZSk7XHQvLyBzaXplcyB3ZSBoYWRcblxuXHRcdFx0XHRjb25zdCBzaXplID0gdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcpO1xuXHRcdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQucmVzaXplVmlldyh0aGlzLmF1eGlsaWFyeUJhclBhcnRWaWV3LCB7XG5cdFx0XHRcdFx0d2lkdGg6IHRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFVWElMSUFSWUJBUl9MQVNUX05PTl9NQVhJTUlaRURfU0laRSksXG5cdFx0XHRcdFx0aGVpZ2h0OiBzaXplLmhlaWdodFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRoaXMuaW5NYXhpbWl6ZWRBdXhpbGlhcnlCYXJUcmFuc2l0aW9uID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5mb2N1c1BhcnQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VBdXhpbGlhcnlCYXJNYXhpbWl6ZWQuZmlyZSgpO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRpc1BhbmVsTWF4aW1pemVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAoXG5cdFx0XHR0aGlzLmdldFBhbmVsQWxpZ25tZW50KCkgPT09ICdjZW50ZXInIHx8IFx0Ly8gdGhlIHdvcmtiZW5jaCBncmlkIGN1cnJlbnRseSBwcmV2ZW50cyB1cyBmcm9tIHN1cHBvcnRpbmcgcGFuZWxcblx0XHRcdCFpc0hvcml6b250YWwodGhpcy5nZXRQYW5lbFBvc2l0aW9uKCkpXHRcdC8vIG1heGltaXphdGlvbiB3aXRoIG5vbi1jZW50ZXIgcGFuZWwgYWxpZ25tZW50XG5cdFx0KSAmJiAhdGhpcy5pc1Zpc2libGUoUGFydHMuRURJVE9SX1BBUlQsIG1haW5XaW5kb3cpICYmICF0aGlzLmlzQXV4aWxpYXJ5QmFyTWF4aW1pemVkKCk7XG5cdH1cblxuXHR0b2dnbGVNYXhpbWl6ZWRQYW5lbCgpOiB2b2lkIHtcblx0XHRjb25zdCBzaXplID0gdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMucGFuZWxQYXJ0Vmlldyk7XG5cdFx0Y29uc3QgcGFuZWxQb3NpdGlvbiA9IHRoaXMuZ2V0UGFuZWxQb3NpdGlvbigpO1xuXHRcdGNvbnN0IG1heGltaXplID0gIXRoaXMuaXNQYW5lbE1heGltaXplZCgpO1xuXHRcdGlmIChtYXhpbWl6ZSkge1xuXHRcdFx0aWYgKHRoaXMuaXNWaXNpYmxlKFBhcnRzLlBBTkVMX1BBUlQpKSB7XG5cdFx0XHRcdGlmIChpc0hvcml6b250YWwocGFuZWxQb3NpdGlvbikpIHtcblx0XHRcdFx0XHR0aGlzLnN0YXRlTW9kZWwuc2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5QQU5FTF9MQVNUX05PTl9NQVhJTUlaRURfSEVJR0hULCBzaXplLmhlaWdodCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5zdGF0ZU1vZGVsLnNldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuUEFORUxfTEFTVF9OT05fTUFYSU1JWkVEX1dJRFRILCBzaXplLndpZHRoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnNldEVkaXRvckhpZGRlbih0cnVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zZXRFZGl0b3JIaWRkZW4oZmFsc2UpO1xuXG5cdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQucmVzaXplVmlldyh0aGlzLnBhbmVsUGFydFZpZXcsIHtcblx0XHRcdFx0d2lkdGg6IGlzSG9yaXpvbnRhbChwYW5lbFBvc2l0aW9uKSA/IHNpemUud2lkdGggOiB0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5QQU5FTF9MQVNUX05PTl9NQVhJTUlaRURfV0lEVEgpLFxuXHRcdFx0XHRoZWlnaHQ6IGlzSG9yaXpvbnRhbChwYW5lbFBvc2l0aW9uKSA/IHRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlBBTkVMX0xBU1RfTk9OX01BWElNSVpFRF9IRUlHSFQpIDogc2l6ZS5oZWlnaHRcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuc3RhdGVNb2RlbC5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlBBTkVMX1dBU19MQVNUX01BWElNSVpFRCwgbWF4aW1pemUpO1xuXHR9XG5cblx0cHJpdmF0ZSBwYW5lbE9wZW5zTWF4aW1pemVkKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmdldFBhbmVsQWxpZ25tZW50KCkgIT09ICdjZW50ZXInICYmIGlzSG9yaXpvbnRhbCh0aGlzLmdldFBhbmVsUG9zaXRpb24oKSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gVGhlIHdvcmtiZW5jaCBncmlkIGN1cnJlbnRseSBwcmV2ZW50cyB1cyBmcm9tIHN1cHBvcnRpbmcgcGFuZWwgbWF4aW1pemF0aW9uIHdpdGggbm9uLWNlbnRlciBwYW5lbCBhbGlnbm1lbnRcblx0XHR9XG5cblx0XHRjb25zdCBwYW5lbE9wZW5zTWF4aW1pemVkID0gcGFydE9wZW5zTWF4aW1pemVkRnJvbVN0cmluZyh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oV29ya2JlbmNoTGF5b3V0U2V0dGluZ3MuUEFORUxfT1BFTlNfTUFYSU1JWkVEKSk7XG5cdFx0Y29uc3QgcGFuZWxMYXN0SXNNYXhpbWl6ZWQgPSB0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5QQU5FTF9XQVNfTEFTVF9NQVhJTUlaRUQpO1xuXG5cdFx0cmV0dXJuIHBhbmVsT3BlbnNNYXhpbWl6ZWQgPT09IFBhcnRPcGVuc01heGltaXplZE9wdGlvbnMuQUxXQVlTIHx8IChwYW5lbE9wZW5zTWF4aW1pemVkID09PSBQYXJ0T3BlbnNNYXhpbWl6ZWRPcHRpb25zLlJFTUVNQkVSX0xBU1QgJiYgcGFuZWxMYXN0SXNNYXhpbWl6ZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRBdXhpbGlhcnlCYXJIaWRkZW4oaGlkZGVuOiBib29sZWFuLCBza2lwTGF5b3V0PzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChoaWRkZW4gJiYgdGhpcy5zZXRBdXhpbGlhcnlCYXJNYXhpbWl6ZWQoZmFsc2UpICYmICF0aGlzLmlzVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCkpIHtcblx0XHRcdHJldHVybjsgLy8gcmV0dXJuOiBsZWF2aW5nIG1heGltaXNlZCBhdXhpbGlhcnkgYmFyIG1hZGUgdGhpcyBwYXJ0IGhpZGRlblxuXHRcdH1cblxuXHRcdHRoaXMuc3RhdGVNb2RlbC5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFVWElMSUFSWUJBUl9ISURERU4sIGhpZGRlbik7XG5cblx0XHQvLyBBZGp1c3QgQ1NTXG5cdFx0aWYgKGhpZGRlbikge1xuXHRcdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoTGF5b3V0Q2xhc3Nlcy5BVVhJTElBUllCQVJfSElEREVOKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoTGF5b3V0Q2xhc3Nlcy5BVVhJTElBUllCQVJfSElEREVOKTtcblx0XHR9XG5cblx0XHQvLyBQcm9wYWdhdGUgdG8gZ3JpZFxuXHRcdHRoaXMud29ya2JlbmNoR3JpZC5zZXRWaWV3VmlzaWJsZSh0aGlzLmF1eGlsaWFyeUJhclBhcnRWaWV3LCAhaGlkZGVuKTtcblxuXHRcdC8vIElmIGF1eGlsaWFyeSBiYXIgYmVjb21lcyBoaWRkZW4sIGFsc28gaGlkZSB0aGUgY3VycmVudCBhY3RpdmUgcGFuZSBjb21wb3NpdGUgaWYgYW55XG5cdFx0aWYgKGhpZGRlbiAmJiB0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldEFjdGl2ZVBhbmVDb21wb3NpdGUoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcikpIHtcblx0XHRcdHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuaGlkZUFjdGl2ZVBhbmVDb21wb3NpdGUoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcik7XG5cdFx0XHR0aGlzLmZvY3VzUGFuZWxPckVkaXRvcigpO1xuXHRcdH1cblxuXHRcdC8vIElmIGF1eGlsaWFyeSBiYXIgYmVjb21lcyB2aXNpYmxlLCBzaG93IGxhc3QgYWN0aXZlIHBhbmUgY29tcG9zaXRlIG9yIGRlZmF1bHQgcGFuZSBjb21wb3NpdGVcblx0XHRlbHNlIGlmICghaGlkZGVuICYmICF0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldEFjdGl2ZVBhbmVDb21wb3NpdGUoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcikpIHtcblx0XHRcdGxldCB2aWV3bGV0VG9PcGVuOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldExhc3RBY3RpdmVQYW5lQ29tcG9zaXRlSWQoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcik7XG5cblx0XHRcdC8vIHZlcmlmeSB0aGF0IHRoZSB2aWV3bGV0IHdlIHRyeSB0byBvcGVuIGhhcyB2aWV3cyBiZWZvcmUgd2UgZGVmYXVsdCB0byBpdFxuXHRcdFx0Ly8gb3RoZXJ3aXNlIGZhbGwgYmFjayB0byBhbnkgdmlldyB0aGF0IGhhcyB2aWV3cyBzdGlsbCByZWZzICMxMTE0NjNcblx0XHRcdGlmICghdmlld2xldFRvT3BlbiB8fCAhdGhpcy5oYXNWaWV3cyh2aWV3bGV0VG9PcGVuKSkge1xuXHRcdFx0XHR2aWV3bGV0VG9PcGVuID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2Vcblx0XHRcdFx0XHQuZ2V0Vmlld0NvbnRhaW5lcnNCeUxvY2F0aW9uKFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIpXG5cdFx0XHRcdFx0LmZpbmQodmlld0NvbnRhaW5lciA9PiB0aGlzLmhhc1ZpZXdzKHZpZXdDb250YWluZXIuaWQpKT8uaWQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh2aWV3bGV0VG9PcGVuKSB7XG5cdFx0XHRcdHRoaXMub3BlblZpZXdDb250YWluZXIoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhciwgdmlld2xldFRvT3BlbiwgIXNraXBMYXlvdXQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHNldFBhcnRIaWRkZW4oaGlkZGVuOiBib29sZWFuLCBwYXJ0OiBQYXJ0cyk6IHZvaWQge1xuXHRcdHN3aXRjaCAocGFydCkge1xuXHRcdFx0Y2FzZSBQYXJ0cy5BQ1RJVklUWUJBUl9QQVJUOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZXRBY3Rpdml0eUJhckhpZGRlbihoaWRkZW4pO1xuXHRcdFx0Y2FzZSBQYXJ0cy5TSURFQkFSX1BBUlQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLnNldFNpZGVCYXJIaWRkZW4oaGlkZGVuKTtcblx0XHRcdGNhc2UgUGFydHMuRURJVE9SX1BBUlQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLnNldEVkaXRvckhpZGRlbihoaWRkZW4pO1xuXHRcdFx0Y2FzZSBQYXJ0cy5CQU5ORVJfUEFSVDpcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2V0QmFubmVySGlkZGVuKGhpZGRlbik7XG5cdFx0XHRjYXNlIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZXRBdXhpbGlhcnlCYXJIaWRkZW4oaGlkZGVuKTtcblx0XHRcdGNhc2UgUGFydHMuUEFORUxfUEFSVDpcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2V0UGFuZWxIaWRkZW4oaGlkZGVuKTtcblx0XHR9XG5cdH1cblxuXHR0b2dnbGVTZWNvbmRhcnlTaWRlQmFyKCk6IHZvaWQge1xuXHRcdGNvbnN0IHZpc2libGUgPSAhdGhpcy5pc1NlY29uZGFyeVNpZGVCYXJWaXNpYmxlKCk7XG5cdFx0dGhpcy5zZXRQYXJ0SGlkZGVuKCF2aXNpYmxlLCBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCk7XG5cdFx0YWxlcnQodmlzaWJsZVxuXHRcdFx0PyBsb2NhbGl6ZSgnYXV4aWxpYXJ5QmFyVmlzaWJsZScsIFwiU2Vjb25kYXJ5IFNpZGUgQmFyIHNob3duXCIpXG5cdFx0XHQ6IGxvY2FsaXplKCdhdXhpbGlhcnlCYXJIaWRkZW4nLCBcIlNlY29uZGFyeSBTaWRlIEJhciBoaWRkZW5cIikpO1xuXHR9XG5cblx0aXNTZWNvbmRhcnlTaWRlQmFyVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5pc1Zpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXHR9XG5cblx0aGFzTWFpbldpbmRvd0JvcmRlcigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5zdGF0ZS5ydW50aW1lLm1haW5XaW5kb3dCb3JkZXI7XG5cdH1cblxuXHRnZXRNYWluV2luZG93Qm9yZGVyUmFkaXVzKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuc3RhdGUucnVudGltZS5tYWluV2luZG93Qm9yZGVyICYmIGlzTWFjaW50b3NoID8gJzEwcHgnIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0U2lkZUJhclBvc2l0aW9uKCk6IFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuU0lERUJBUl9QT1NJVE9OKTtcblx0fVxuXG5cdGdldFBhbmVsQWxpZ25tZW50KCk6IFBhbmVsQWxpZ25tZW50IHtcblx0XHRyZXR1cm4gdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuUEFORUxfQUxJR05NRU5UKTtcblx0fVxuXG5cdHVwZGF0ZU1lbnViYXJWaXNpYmlsaXR5KHNraXBMYXlvdXQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBzaG91bGRTaG93VGl0bGVCYXIgPSBzaG91bGRTaG93Q3VzdG9tVGl0bGVCYXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgbWFpbldpbmRvdywgdGhpcy5zdGF0ZS5ydW50aW1lLm1lbnVCYXIudG9nZ2xlZCk7XG5cdFx0aWYgKCFza2lwTGF5b3V0ICYmIHRoaXMud29ya2JlbmNoR3JpZCAmJiBzaG91bGRTaG93VGl0bGVCYXIgIT09IHRoaXMuaXNWaXNpYmxlKFBhcnRzLlRJVExFQkFSX1BBUlQsIG1haW5XaW5kb3cpKSB7XG5cdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQuc2V0Vmlld1Zpc2libGUodGhpcy50aXRsZUJhclBhcnRWaWV3LCBzaG91bGRTaG93VGl0bGVCYXIpO1xuXHRcdH1cblx0fVxuXG5cdHVwZGF0ZUN1c3RvbVRpdGxlQmFyVmlzaWJpbGl0eSgpOiB2b2lkIHtcblx0XHRjb25zdCBzaG91bGRTaG93VGl0bGVCYXIgPSBzaG91bGRTaG93Q3VzdG9tVGl0bGVCYXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgbWFpbldpbmRvdywgdGhpcy5zdGF0ZS5ydW50aW1lLm1lbnVCYXIudG9nZ2xlZCk7XG5cdFx0Y29uc3QgdGl0bGViYXJWaXNpYmxlID0gdGhpcy5pc1Zpc2libGUoUGFydHMuVElUTEVCQVJfUEFSVCk7XG5cdFx0aWYgKHNob3VsZFNob3dUaXRsZUJhciAhPT0gdGl0bGViYXJWaXNpYmxlKSB7XG5cdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQuc2V0Vmlld1Zpc2libGUodGhpcy50aXRsZUJhclBhcnRWaWV3LCBzaG91bGRTaG93VGl0bGVCYXIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVG9wV2luZG93RWRnZUNsYXNzKCk6IHZvaWQge1xuXHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKExheW91dENsYXNzZXMuVE9QX1dJTkRPV19FREdFLCBpc0Zsb2F0aW5nVG9wRWRnZUV4cG9zZWQodGhpcywgbWFpbldpbmRvdykpO1xuXHR9XG5cblx0dG9nZ2xlTWVudUJhcigpOiB2b2lkIHtcblx0XHRsZXQgY3VycmVudFZpc2liaWxpdHlWYWx1ZSA9IGdldE1lbnVCYXJWaXNpYmlsaXR5KHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGlmICh0eXBlb2YgY3VycmVudFZpc2liaWxpdHlWYWx1ZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdGN1cnJlbnRWaXNpYmlsaXR5VmFsdWUgPSAnY2xhc3NpYyc7XG5cdFx0fVxuXG5cdFx0bGV0IG5ld1Zpc2liaWxpdHlWYWx1ZTogc3RyaW5nO1xuXHRcdGlmIChjdXJyZW50VmlzaWJpbGl0eVZhbHVlID09PSAndmlzaWJsZScgfHwgY3VycmVudFZpc2liaWxpdHlWYWx1ZSA9PT0gJ2NsYXNzaWMnKSB7XG5cdFx0XHRuZXdWaXNpYmlsaXR5VmFsdWUgPSBoYXNOYXRpdmVNZW51KHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpID8gJ3RvZ2dsZScgOiAnY29tcGFjdCc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG5ld1Zpc2liaWxpdHlWYWx1ZSA9ICdjbGFzc2ljJztcblx0XHR9XG5cblx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKE1lbnVTZXR0aW5ncy5NZW51QmFyVmlzaWJpbGl0eSwgbmV3VmlzaWJpbGl0eVZhbHVlKTtcblx0fVxuXG5cdGdldFBhbmVsUG9zaXRpb24oKTogUG9zaXRpb24ge1xuXHRcdHJldHVybiB0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5QQU5FTF9QT1NJVElPTik7XG5cdH1cblxuXHRzZXRQYW5lbFBvc2l0aW9uKHBvc2l0aW9uOiBQb3NpdGlvbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5pc1Zpc2libGUoUGFydHMuUEFORUxfUEFSVCkpIHtcblx0XHRcdHRoaXMuc2V0UGFuZWxIaWRkZW4oZmFsc2UpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhbmVsUGFydCA9IHRoaXMuZ2V0UGFydChQYXJ0cy5QQU5FTF9QQVJUKTtcblx0XHRjb25zdCBvbGRQb3NpdGlvblZhbHVlID0gcG9zaXRpb25Ub1N0cmluZyh0aGlzLmdldFBhbmVsUG9zaXRpb24oKSk7XG5cdFx0Y29uc3QgbmV3UG9zaXRpb25WYWx1ZSA9IHBvc2l0aW9uVG9TdHJpbmcocG9zaXRpb24pO1xuXG5cdFx0Ly8gQWRqdXN0IENTU1xuXHRcdGNvbnN0IHBhbmVsQ29udGFpbmVyID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQocGFuZWxQYXJ0LmdldENvbnRhaW5lcigpKTtcblx0XHRwYW5lbENvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKG9sZFBvc2l0aW9uVmFsdWUpO1xuXHRcdHBhbmVsQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQobmV3UG9zaXRpb25WYWx1ZSk7XG5cdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoYHBhbmVsLXBvc2l0aW9uLSR7b2xkUG9zaXRpb25WYWx1ZX1gKTtcblx0XHR0aGlzLm1haW5Db250YWluZXIuY2xhc3NMaXN0LmFkZChgcGFuZWwtcG9zaXRpb24tJHtuZXdQb3NpdGlvblZhbHVlfWApO1xuXG5cdFx0Ly8gVXBkYXRlIFN0eWxlc1xuXHRcdHBhbmVsUGFydC51cGRhdGVTdHlsZXMoKTtcblxuXHRcdC8vIExheW91dFxuXHRcdGNvbnN0IHNpemUgPSB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodGhpcy5wYW5lbFBhcnRWaWV3KTtcblx0XHRjb25zdCBzaWRlQmFyU2l6ZSA9IHRoaXMud29ya2JlbmNoR3JpZC5nZXRWaWV3U2l6ZSh0aGlzLnNpZGVCYXJQYXJ0Vmlldyk7XG5cdFx0Y29uc3QgYXV4aWxpYXJ5QmFyU2l6ZSA9IHRoaXMud29ya2JlbmNoR3JpZC5nZXRWaWV3U2l6ZSh0aGlzLmF1eGlsaWFyeUJhclBhcnRWaWV3KTtcblxuXHRcdGxldCBlZGl0b3JIaWRkZW4gPSAhdGhpcy5pc1Zpc2libGUoUGFydHMuRURJVE9SX1BBUlQsIG1haW5XaW5kb3cpO1xuXG5cdFx0Ly8gU2F2ZSBsYXN0IG5vbi1tYXhpbWl6ZWQgc2l6ZSBmb3IgcGFuZWwgYmVmb3JlIG1vdmVcblx0XHRpZiAobmV3UG9zaXRpb25WYWx1ZSAhPT0gb2xkUG9zaXRpb25WYWx1ZSAmJiAhZWRpdG9ySGlkZGVuKSB7XG5cblx0XHRcdC8vIFNhdmUgdGhlIGN1cnJlbnQgc2l6ZSBvZiB0aGUgcGFuZWwgZm9yIHRoZSBuZXcgb3J0aG9nb25hbCBkaXJlY3Rpb25cblx0XHRcdC8vIElmIG1vdmluZyBkb3duLCBzYXZlIHRoZSB3aWR0aCBvZiB0aGUgcGFuZWxcblx0XHRcdC8vIE90aGVyd2lzZSwgc2F2ZSB0aGUgaGVpZ2h0IG9mIHRoZSBwYW5lbFxuXHRcdFx0aWYgKGlzSG9yaXpvbnRhbChwb3NpdGlvbikpIHtcblx0XHRcdFx0dGhpcy5zdGF0ZU1vZGVsLnNldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuUEFORUxfTEFTVF9OT05fTUFYSU1JWkVEX1dJRFRILCBzaXplLndpZHRoKTtcblx0XHRcdH0gZWxzZSBpZiAoaXNIb3Jpem9udGFsKHBvc2l0aW9uRnJvbVN0cmluZyhvbGRQb3NpdGlvblZhbHVlKSkpIHtcblx0XHRcdFx0dGhpcy5zdGF0ZU1vZGVsLnNldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuUEFORUxfTEFTVF9OT05fTUFYSU1JWkVEX0hFSUdIVCwgc2l6ZS5oZWlnaHQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChpc0hvcml6b250YWwocG9zaXRpb24pICYmIHRoaXMuZ2V0UGFuZWxBbGlnbm1lbnQoKSAhPT0gJ2NlbnRlcicgJiYgZWRpdG9ySGlkZGVuKSB7XG5cdFx0XHR0aGlzLnRvZ2dsZU1heGltaXplZFBhbmVsKCk7XG5cdFx0XHRlZGl0b3JIaWRkZW4gPSBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLnN0YXRlTW9kZWwuc2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5QQU5FTF9QT1NJVElPTiwgcG9zaXRpb24pO1xuXG5cdFx0Y29uc3Qgc2lkZUJhclZpc2libGUgPSB0aGlzLmlzVmlzaWJsZShQYXJ0cy5TSURFQkFSX1BBUlQpO1xuXHRcdGNvbnN0IGF1eGlsaWFyeUJhclZpc2libGUgPSB0aGlzLmlzVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCk7XG5cblx0XHRjb25zdCBoYWRGb2N1cyA9IHRoaXMuaGFzRm9jdXMoUGFydHMuUEFORUxfUEFSVCk7XG5cblx0XHRpZiAocG9zaXRpb24gPT09IFBvc2l0aW9uLkJPVFRPTSkge1xuXHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLm1vdmVWaWV3KHRoaXMucGFuZWxQYXJ0VmlldywgZWRpdG9ySGlkZGVuID8gc2l6ZS5oZWlnaHQgOiB0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5QQU5FTF9MQVNUX05PTl9NQVhJTUlaRURfSEVJR0hUKSwgdGhpcy5lZGl0b3JQYXJ0VmlldywgRGlyZWN0aW9uLkRvd24pO1xuXHRcdH0gZWxzZSBpZiAocG9zaXRpb24gPT09IFBvc2l0aW9uLlRPUCkge1xuXHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLm1vdmVWaWV3KHRoaXMucGFuZWxQYXJ0VmlldywgZWRpdG9ySGlkZGVuID8gc2l6ZS5oZWlnaHQgOiB0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5QQU5FTF9MQVNUX05PTl9NQVhJTUlaRURfSEVJR0hUKSwgdGhpcy5lZGl0b3JQYXJ0VmlldywgRGlyZWN0aW9uLlVwKTtcblx0XHR9IGVsc2UgaWYgKHBvc2l0aW9uID09PSBQb3NpdGlvbi5SSUdIVCkge1xuXHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLm1vdmVWaWV3KHRoaXMucGFuZWxQYXJ0VmlldywgZWRpdG9ySGlkZGVuID8gc2l6ZS53aWR0aCA6IHRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlBBTkVMX0xBU1RfTk9OX01BWElNSVpFRF9XSURUSCksIHRoaXMuZWRpdG9yUGFydFZpZXcsIERpcmVjdGlvbi5SaWdodCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5tb3ZlVmlldyh0aGlzLnBhbmVsUGFydFZpZXcsIGVkaXRvckhpZGRlbiA/IHNpemUud2lkdGggOiB0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5QQU5FTF9MQVNUX05PTl9NQVhJTUlaRURfV0lEVEgpLCB0aGlzLmVkaXRvclBhcnRWaWV3LCBEaXJlY3Rpb24uTGVmdCk7XG5cdFx0fVxuXG5cdFx0aWYgKGhhZEZvY3VzKSB7XG5cdFx0XHR0aGlzLmZvY3VzUGFydChQYXJ0cy5QQU5FTF9QQVJUKTtcblx0XHR9XG5cblx0XHQvLyBSZXNldCBzaWRlYmFyIHRvIG9yaWdpbmFsIHNpemUgYmVmb3JlIHNoaWZ0aW5nIHRoZSBwYW5lbFxuXHRcdHRoaXMud29ya2JlbmNoR3JpZC5yZXNpemVWaWV3KHRoaXMuc2lkZUJhclBhcnRWaWV3LCBzaWRlQmFyU2l6ZSk7XG5cdFx0aWYgKCFzaWRlQmFyVmlzaWJsZSkge1xuXHRcdFx0dGhpcy5zZXRTaWRlQmFySGlkZGVuKHRydWUpO1xuXHRcdH1cblxuXHRcdHRoaXMud29ya2JlbmNoR3JpZC5yZXNpemVWaWV3KHRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcsIGF1eGlsaWFyeUJhclNpemUpO1xuXHRcdGlmICghYXV4aWxpYXJ5QmFyVmlzaWJsZSkge1xuXHRcdFx0dGhpcy5zZXRBdXhpbGlhcnlCYXJIaWRkZW4odHJ1ZSk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzSG9yaXpvbnRhbChwb3NpdGlvbikpIHtcblx0XHRcdHRoaXMuYWRqdXN0UGFydFBvc2l0aW9ucyh0aGlzLmdldFNpZGVCYXJQb3NpdGlvbigpLCB0aGlzLmdldFBhbmVsQWxpZ25tZW50KCksIHBvc2l0aW9uKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZVBhbmVsUG9zaXRpb24uZmlyZShuZXdQb3NpdGlvblZhbHVlKTtcblx0fVxuXG5cdGlzV2luZG93TWF4aW1pemVkKHRhcmdldFdpbmRvdzogV2luZG93KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuc3RhdGUucnVudGltZS5tYXhpbWl6ZWQuaGFzKGdldFdpbmRvd0lkKHRhcmdldFdpbmRvdykpO1xuXHR9XG5cblx0dXBkYXRlV2luZG93TWF4aW1pemVkU3RhdGUodGFyZ2V0V2luZG93OiBXaW5kb3csIG1heGltaXplZDogYm9vbGVhbikge1xuXHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKExheW91dENsYXNzZXMuTUFYSU1JWkVELCBtYXhpbWl6ZWQpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93SWQgPSBnZXRXaW5kb3dJZCh0YXJnZXRXaW5kb3cpO1xuXHRcdGlmIChtYXhpbWl6ZWQgPT09IHRoaXMuc3RhdGUucnVudGltZS5tYXhpbWl6ZWQuaGFzKHRhcmdldFdpbmRvd0lkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChtYXhpbWl6ZWQpIHtcblx0XHRcdHRoaXMuc3RhdGUucnVudGltZS5tYXhpbWl6ZWQuYWRkKHRhcmdldFdpbmRvd0lkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zdGF0ZS5ydW50aW1lLm1heGltaXplZC5kZWxldGUodGFyZ2V0V2luZG93SWQpO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlV2luZG93Qm9yZGVyKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VXaW5kb3dNYXhpbWl6ZWQuZmlyZSh7IHdpbmRvd0lkOiB0YXJnZXRXaW5kb3dJZCwgbWF4aW1pemVkIH0pO1xuXHR9XG5cblx0Z2V0VmlzaWJsZU5laWdoYm9yUGFydChwYXJ0OiBQYXJ0cywgZGlyZWN0aW9uOiBEaXJlY3Rpb24pOiBQYXJ0cyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLndvcmtiZW5jaEdyaWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmlzVmlzaWJsZShwYXJ0LCBtYWluV2luZG93KSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBuZWlnaGJvclZpZXdzID0gdGhpcy53b3JrYmVuY2hHcmlkLmdldE5laWdoYm9yVmlld3ModGhpcy5nZXRQYXJ0KHBhcnQpLCBkaXJlY3Rpb24sIGZhbHNlKTtcblxuXHRcdGlmICghbmVpZ2hib3JWaWV3cykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IG5laWdoYm9yVmlldyBvZiBuZWlnaGJvclZpZXdzKSB7XG5cdFx0XHRjb25zdCBuZWlnaGJvclBhcnQgPVxuXHRcdFx0XHRbUGFydHMuQUNUSVZJVFlCQVJfUEFSVCwgUGFydHMuRURJVE9SX1BBUlQsIFBhcnRzLlBBTkVMX1BBUlQsIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCBQYXJ0cy5TSURFQkFSX1BBUlQsIFBhcnRzLlNUQVRVU0JBUl9QQVJULCBQYXJ0cy5USVRMRUJBUl9QQVJUXVxuXHRcdFx0XHRcdC5maW5kKHBhcnRJZCA9PiB0aGlzLmdldFBhcnQocGFydElkKSA9PT0gbmVpZ2hib3JWaWV3ICYmIHRoaXMuaXNWaXNpYmxlKHBhcnRJZCwgbWFpbldpbmRvdykpO1xuXG5cdFx0XHRpZiAobmVpZ2hib3JQYXJ0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIG5laWdoYm9yUGFydDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZVdDTygpOiB2b2lkIHtcblx0XHRjb25zdCBiYW5uZXJGaXJzdCA9IHRoaXMud29ya2JlbmNoR3JpZC5nZXROZWlnaGJvclZpZXdzKHRoaXMudGl0bGVCYXJQYXJ0VmlldywgRGlyZWN0aW9uLlVwLCBmYWxzZSkubGVuZ3RoID4gMDtcblx0XHRjb25zdCBzaG91bGRCYW5uZXJCZUZpcnN0ID0gdGhpcy5zaG91bGRTaG93QmFubmVyRmlyc3QoKTtcblxuXHRcdGlmIChiYW5uZXJGaXJzdCAhPT0gc2hvdWxkQmFubmVyQmVGaXJzdCkge1xuXHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLm1vdmVWaWV3KHRoaXMuYmFubmVyUGFydFZpZXcsIFNpemluZy5EaXN0cmlidXRlLCB0aGlzLnRpdGxlQmFyUGFydFZpZXcsIHNob3VsZEJhbm5lckJlRmlyc3QgPyBEaXJlY3Rpb24uVXAgOiBEaXJlY3Rpb24uRG93bik7XG5cdFx0fVxuXG5cdFx0dGhpcy53b3JrYmVuY2hHcmlkLnNldFZpZXdWaXNpYmxlKHRoaXMudGl0bGVCYXJQYXJ0Vmlldywgc2hvdWxkU2hvd0N1c3RvbVRpdGxlQmFyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIG1haW5XaW5kb3csIHRoaXMuc3RhdGUucnVudGltZS5tZW51QmFyLnRvZ2dsZWQpKTtcblx0fVxuXG5cdHByaXZhdGUgYXJyYW5nZUVkaXRvck5vZGVzKG5vZGVzOiB7IGVkaXRvcjogSVNlcmlhbGl6ZWROb2RlOyBzaWRlQmFyPzogSVNlcmlhbGl6ZWROb2RlOyBhdXhpbGlhcnlCYXI/OiBJU2VyaWFsaXplZE5vZGUgfSwgYXZhaWxhYmxlSGVpZ2h0OiBudW1iZXIsIGF2YWlsYWJsZVdpZHRoOiBudW1iZXIpOiBJU2VyaWFsaXplZE5vZGUge1xuXHRcdGlmICghbm9kZXMuc2lkZUJhciAmJiAhbm9kZXMuYXV4aWxpYXJ5QmFyKSB7XG5cdFx0XHRub2Rlcy5lZGl0b3Iuc2l6ZSA9IGF2YWlsYWJsZUhlaWdodDtcblx0XHRcdHJldHVybiBub2Rlcy5lZGl0b3I7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gW25vZGVzLmVkaXRvcl07XG5cdFx0bm9kZXMuZWRpdG9yLnNpemUgPSBhdmFpbGFibGVXaWR0aDtcblx0XHRpZiAobm9kZXMuc2lkZUJhcikge1xuXHRcdFx0aWYgKHRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlNJREVCQVJfUE9TSVRPTikgPT09IFBvc2l0aW9uLkxFRlQpIHtcblx0XHRcdFx0cmVzdWx0LnNwbGljZSgwLCAwLCBub2Rlcy5zaWRlQmFyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKG5vZGVzLnNpZGVCYXIpO1xuXHRcdFx0fVxuXG5cdFx0XHRub2Rlcy5lZGl0b3Iuc2l6ZSAtPSB0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5TSURFQkFSX0hJRERFTikgPyAwIDogbm9kZXMuc2lkZUJhci5zaXplO1xuXHRcdH1cblxuXHRcdGlmIChub2Rlcy5hdXhpbGlhcnlCYXIpIHtcblx0XHRcdGlmICh0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5TSURFQkFSX1BPU0lUT04pID09PSBQb3NpdGlvbi5SSUdIVCkge1xuXHRcdFx0XHRyZXN1bHQuc3BsaWNlKDAsIDAsIG5vZGVzLmF1eGlsaWFyeUJhcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXN1bHQucHVzaChub2Rlcy5hdXhpbGlhcnlCYXIpO1xuXHRcdFx0fVxuXG5cdFx0XHRub2Rlcy5lZGl0b3Iuc2l6ZSAtPSB0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5BVVhJTElBUllCQVJfSElEREVOKSA/IDAgOiBub2Rlcy5hdXhpbGlhcnlCYXIuc2l6ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogJ2JyYW5jaCcsXG5cdFx0XHRkYXRhOiByZXN1bHQsXG5cdFx0XHRzaXplOiBhdmFpbGFibGVIZWlnaHQsXG5cdFx0XHR2aXNpYmxlOiByZXN1bHQuc29tZShub2RlID0+IG5vZGUudmlzaWJsZSlcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhcnJhbmdlTWlkZGxlU2VjdGlvbk5vZGVzKG5vZGVzOiB7IGVkaXRvcjogSVNlcmlhbGl6ZWROb2RlOyBwYW5lbDogSVNlcmlhbGl6ZWROb2RlOyBhY3Rpdml0eUJhcjogSVNlcmlhbGl6ZWROb2RlOyBzaWRlQmFyOiBJU2VyaWFsaXplZE5vZGU7IGF1eGlsaWFyeUJhcjogSVNlcmlhbGl6ZWROb2RlIH0sIGF2YWlsYWJsZVdpZHRoOiBudW1iZXIsIGF2YWlsYWJsZUhlaWdodDogbnVtYmVyKTogSVNlcmlhbGl6ZWROb2RlW10ge1xuXHRcdGNvbnN0IGFjdGl2aXR5QmFyU2l6ZSA9IHRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFDVElWSVRZQkFSX0hJRERFTikgPyAwIDogbm9kZXMuYWN0aXZpdHlCYXIuc2l6ZTtcblx0XHRjb25zdCBzaWRlQmFyU2l6ZSA9IHRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlNJREVCQVJfSElEREVOKSA/IDAgOiBub2Rlcy5zaWRlQmFyLnNpemU7XG5cdFx0Y29uc3QgYXV4aWxpYXJ5QmFyU2l6ZSA9IHRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFVWElMSUFSWUJBUl9ISURERU4pID8gMCA6IG5vZGVzLmF1eGlsaWFyeUJhci5zaXplO1xuXHRcdGNvbnN0IHBhbmVsU2l6ZSA9IHRoaXMuc3RhdGVNb2RlbC5nZXRJbml0aWFsaXphdGlvblZhbHVlKExheW91dFN0YXRlS2V5cy5QQU5FTF9TSVpFKSA/IDAgOiBub2Rlcy5wYW5lbC5zaXplO1xuXG5cdFx0Y29uc3QgcGFuZWxQb3N0aW9uID0gdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuUEFORUxfUE9TSVRJT04pO1xuXHRcdGNvbnN0IHNpZGVCYXJQb3NpdGlvbiA9IHRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlNJREVCQVJfUE9TSVRPTik7XG5cblx0XHRjb25zdCByZXN1bHQgPSBbXSBhcyBJU2VyaWFsaXplZE5vZGVbXTtcblx0XHRpZiAoIWlzSG9yaXpvbnRhbChwYW5lbFBvc3Rpb24pKSB7XG5cdFx0XHRyZXN1bHQucHVzaChub2Rlcy5lZGl0b3IpO1xuXHRcdFx0bm9kZXMuZWRpdG9yLnNpemUgPSBhdmFpbGFibGVXaWR0aCAtIGFjdGl2aXR5QmFyU2l6ZSAtIHNpZGVCYXJTaXplIC0gcGFuZWxTaXplIC0gYXV4aWxpYXJ5QmFyU2l6ZTtcblx0XHRcdGlmIChwYW5lbFBvc3Rpb24gPT09IFBvc2l0aW9uLlJJR0hUKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKG5vZGVzLnBhbmVsKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3VsdC5zcGxpY2UoMCwgMCwgbm9kZXMucGFuZWwpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc2lkZUJhclBvc2l0aW9uID09PSBQb3NpdGlvbi5MRUZUKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKG5vZGVzLmF1eGlsaWFyeUJhcik7XG5cdFx0XHRcdHJlc3VsdC5zcGxpY2UoMCwgMCwgbm9kZXMuc2lkZUJhcik7XG5cdFx0XHRcdHJlc3VsdC5zcGxpY2UoMCwgMCwgbm9kZXMuYWN0aXZpdHlCYXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0LnNwbGljZSgwLCAwLCBub2Rlcy5hdXhpbGlhcnlCYXIpO1xuXHRcdFx0XHRyZXN1bHQucHVzaChub2Rlcy5zaWRlQmFyKTtcblx0XHRcdFx0cmVzdWx0LnB1c2gobm9kZXMuYWN0aXZpdHlCYXIpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBwYW5lbEFsaWdubWVudCA9IHRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlBBTkVMX0FMSUdOTUVOVCk7XG5cdFx0XHRjb25zdCBzaWRlQmFyTmV4dFRvRWRpdG9yID0gIShwYW5lbEFsaWdubWVudCA9PT0gJ2NlbnRlcicgfHwgKHNpZGVCYXJQb3NpdGlvbiA9PT0gUG9zaXRpb24uTEVGVCAmJiBwYW5lbEFsaWdubWVudCA9PT0gJ3JpZ2h0JykgfHwgKHNpZGVCYXJQb3NpdGlvbiA9PT0gUG9zaXRpb24uUklHSFQgJiYgcGFuZWxBbGlnbm1lbnQgPT09ICdsZWZ0JykpO1xuXHRcdFx0Y29uc3QgYXV4aWxpYXJ5QmFyTmV4dFRvRWRpdG9yID0gIShwYW5lbEFsaWdubWVudCA9PT0gJ2NlbnRlcicgfHwgKHNpZGVCYXJQb3NpdGlvbiA9PT0gUG9zaXRpb24uUklHSFQgJiYgcGFuZWxBbGlnbm1lbnQgPT09ICdyaWdodCcpIHx8IChzaWRlQmFyUG9zaXRpb24gPT09IFBvc2l0aW9uLkxFRlQgJiYgcGFuZWxBbGlnbm1lbnQgPT09ICdsZWZ0JykpO1xuXG5cdFx0XHRjb25zdCBlZGl0b3JTZWN0aW9uV2lkdGggPSBhdmFpbGFibGVXaWR0aCAtIGFjdGl2aXR5QmFyU2l6ZSAtIChzaWRlQmFyTmV4dFRvRWRpdG9yID8gMCA6IHNpZGVCYXJTaXplKSAtIChhdXhpbGlhcnlCYXJOZXh0VG9FZGl0b3IgPyAwIDogYXV4aWxpYXJ5QmFyU2l6ZSk7XG5cblx0XHRcdGNvbnN0IGVkaXRvck5vZGVzID0gdGhpcy5hcnJhbmdlRWRpdG9yTm9kZXMoe1xuXHRcdFx0XHRlZGl0b3I6IG5vZGVzLmVkaXRvcixcblx0XHRcdFx0c2lkZUJhcjogc2lkZUJhck5leHRUb0VkaXRvciA/IG5vZGVzLnNpZGVCYXIgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGF1eGlsaWFyeUJhcjogYXV4aWxpYXJ5QmFyTmV4dFRvRWRpdG9yID8gbm9kZXMuYXV4aWxpYXJ5QmFyIDogdW5kZWZpbmVkXG5cdFx0XHR9LCBhdmFpbGFibGVIZWlnaHQgLSBwYW5lbFNpemUsIGVkaXRvclNlY3Rpb25XaWR0aCk7XG5cblx0XHRcdGNvbnN0IGRhdGEgPSBwYW5lbFBvc3Rpb24gPT09IFBvc2l0aW9uLkJPVFRPTSA/IFtlZGl0b3JOb2Rlcywgbm9kZXMucGFuZWxdIDogW25vZGVzLnBhbmVsLCBlZGl0b3JOb2Rlc107XG5cdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdHR5cGU6ICdicmFuY2gnLFxuXHRcdFx0XHRkYXRhLFxuXHRcdFx0XHRzaXplOiBlZGl0b3JTZWN0aW9uV2lkdGgsXG5cdFx0XHRcdHZpc2libGU6IGRhdGEuc29tZShub2RlID0+IG5vZGUudmlzaWJsZSlcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoIXNpZGVCYXJOZXh0VG9FZGl0b3IpIHtcblx0XHRcdFx0aWYgKHNpZGVCYXJQb3NpdGlvbiA9PT0gUG9zaXRpb24uTEVGVCkge1xuXHRcdFx0XHRcdHJlc3VsdC5zcGxpY2UoMCwgMCwgbm9kZXMuc2lkZUJhcik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2gobm9kZXMuc2lkZUJhcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKCFhdXhpbGlhcnlCYXJOZXh0VG9FZGl0b3IpIHtcblx0XHRcdFx0aWYgKHNpZGVCYXJQb3NpdGlvbiA9PT0gUG9zaXRpb24uUklHSFQpIHtcblx0XHRcdFx0XHRyZXN1bHQuc3BsaWNlKDAsIDAsIG5vZGVzLmF1eGlsaWFyeUJhcik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2gobm9kZXMuYXV4aWxpYXJ5QmFyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc2lkZUJhclBvc2l0aW9uID09PSBQb3NpdGlvbi5MRUZUKSB7XG5cdFx0XHRcdHJlc3VsdC5zcGxpY2UoMCwgMCwgbm9kZXMuYWN0aXZpdHlCYXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0LnB1c2gobm9kZXMuYWN0aXZpdHlCYXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUdyaWREZXNjcmlwdG9yKCk6IElTZXJpYWxpemVkR3JpZCB7XG5cdFx0Y29uc3QgeyB3aWR0aCwgaGVpZ2h0IH0gPSB0aGlzLl9tYWluQ29udGFpbmVyRGltZW5zaW9uO1xuXHRcdGNvbnN0IHNpZGVCYXJTaXplID0gdGhpcy5zdGF0ZU1vZGVsLmdldEluaXRpYWxpemF0aW9uVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlNJREVCQVJfU0laRSk7XG5cdFx0Y29uc3QgYXV4aWxpYXJ5QmFyU2l6ZSA9IHRoaXMuc3RhdGVNb2RlbC5nZXRJbml0aWFsaXphdGlvblZhbHVlKExheW91dFN0YXRlS2V5cy5BVVhJTElBUllCQVJfU0laRSk7XG5cdFx0Y29uc3QgcGFuZWxTaXplID0gdGhpcy5zdGF0ZU1vZGVsLmdldEluaXRpYWxpemF0aW9uVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlBBTkVMX1NJWkUpO1xuXG5cdFx0Y29uc3QgdGl0bGVCYXJIZWlnaHQgPSB0aGlzLnRpdGxlQmFyUGFydFZpZXcubWluaW11bUhlaWdodDtcblx0XHRjb25zdCBiYW5uZXJIZWlnaHQgPSB0aGlzLmJhbm5lclBhcnRWaWV3Lm1pbmltdW1IZWlnaHQ7XG5cdFx0Y29uc3Qgc3RhdHVzQmFySGVpZ2h0ID0gdGhpcy5zdGF0dXNCYXJQYXJ0Vmlldy5taW5pbXVtSGVpZ2h0O1xuXHRcdGNvbnN0IGFjdGl2aXR5QmFyV2lkdGggPSB0aGlzLmFjdGl2aXR5QmFyUGFydFZpZXcubWluaW11bVdpZHRoO1xuXHRcdGNvbnN0IG1pZGRsZVNlY3Rpb25IZWlnaHQgPSBoZWlnaHQgLSB0aXRsZUJhckhlaWdodCAtIHN0YXR1c0JhckhlaWdodDtcblxuXHRcdGNvbnN0IHRpdGxlQW5kQmFubmVyOiBJU2VyaWFsaXplZE5vZGVbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ2xlYWYnLFxuXHRcdFx0XHRkYXRhOiB7IHR5cGU6IFBhcnRzLlRJVExFQkFSX1BBUlQgfSxcblx0XHRcdFx0c2l6ZTogdGl0bGVCYXJIZWlnaHQsXG5cdFx0XHRcdHZpc2libGU6IHRoaXMuaXNWaXNpYmxlKFBhcnRzLlRJVExFQkFSX1BBUlQsIG1haW5XaW5kb3cpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnbGVhZicsXG5cdFx0XHRcdGRhdGE6IHsgdHlwZTogUGFydHMuQkFOTkVSX1BBUlQgfSxcblx0XHRcdFx0c2l6ZTogYmFubmVySGVpZ2h0LFxuXHRcdFx0XHR2aXNpYmxlOiBmYWxzZVxuXHRcdFx0fVxuXHRcdF07XG5cblx0XHRjb25zdCBhY3Rpdml0eUJhck5vZGU6IElTZXJpYWxpemVkTGVhZk5vZGUgPSB7XG5cdFx0XHR0eXBlOiAnbGVhZicsXG5cdFx0XHRkYXRhOiB7IHR5cGU6IFBhcnRzLkFDVElWSVRZQkFSX1BBUlQgfSxcblx0XHRcdHNpemU6IGFjdGl2aXR5QmFyV2lkdGgsXG5cdFx0XHR2aXNpYmxlOiAhdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuQUNUSVZJVFlCQVJfSElEREVOKVxuXHRcdH07XG5cblx0XHRjb25zdCBzaWRlQmFyTm9kZTogSVNlcmlhbGl6ZWRMZWFmTm9kZSA9IHtcblx0XHRcdHR5cGU6ICdsZWFmJyxcblx0XHRcdGRhdGE6IHsgdHlwZTogUGFydHMuU0lERUJBUl9QQVJUIH0sXG5cdFx0XHRzaXplOiBzaWRlQmFyU2l6ZSxcblx0XHRcdHZpc2libGU6ICF0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5TSURFQkFSX0hJRERFTilcblx0XHR9O1xuXG5cdFx0Y29uc3QgYXV4aWxpYXJ5QmFyTm9kZTogSVNlcmlhbGl6ZWRMZWFmTm9kZSA9IHtcblx0XHRcdHR5cGU6ICdsZWFmJyxcblx0XHRcdGRhdGE6IHsgdHlwZTogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgfSxcblx0XHRcdHNpemU6IGF1eGlsaWFyeUJhclNpemUsXG5cdFx0XHR2aXNpYmxlOiB0aGlzLmlzVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVClcblx0XHR9O1xuXG5cdFx0Y29uc3QgZWRpdG9yTm9kZTogSVNlcmlhbGl6ZWRMZWFmTm9kZSA9IHtcblx0XHRcdHR5cGU6ICdsZWFmJyxcblx0XHRcdGRhdGE6IHsgdHlwZTogUGFydHMuRURJVE9SX1BBUlQgfSxcblx0XHRcdHNpemU6IDAsIC8vIFVwZGF0ZSBiYXNlZCBvbiBzaWJsaW5nIHNpemVzXG5cdFx0XHR2aXNpYmxlOiAhdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuRURJVE9SX0hJRERFTilcblx0XHR9O1xuXG5cdFx0Y29uc3QgcGFuZWxOb2RlOiBJU2VyaWFsaXplZExlYWZOb2RlID0ge1xuXHRcdFx0dHlwZTogJ2xlYWYnLFxuXHRcdFx0ZGF0YTogeyB0eXBlOiBQYXJ0cy5QQU5FTF9QQVJUIH0sXG5cdFx0XHRzaXplOiBwYW5lbFNpemUsXG5cdFx0XHR2aXNpYmxlOiAhdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuUEFORUxfSElEREVOKVxuXHRcdH07XG5cblx0XHRjb25zdCBtaWRkbGVTZWN0aW9uOiBJU2VyaWFsaXplZE5vZGVbXSA9IHRoaXMuYXJyYW5nZU1pZGRsZVNlY3Rpb25Ob2Rlcyh7XG5cdFx0XHRhY3Rpdml0eUJhcjogYWN0aXZpdHlCYXJOb2RlLFxuXHRcdFx0YXV4aWxpYXJ5QmFyOiBhdXhpbGlhcnlCYXJOb2RlLFxuXHRcdFx0ZWRpdG9yOiBlZGl0b3JOb2RlLFxuXHRcdFx0cGFuZWw6IHBhbmVsTm9kZSxcblx0XHRcdHNpZGVCYXI6IHNpZGVCYXJOb2RlXG5cdFx0fSwgd2lkdGgsIG1pZGRsZVNlY3Rpb25IZWlnaHQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0OiBJU2VyaWFsaXplZEdyaWQgPSB7XG5cdFx0XHRyb290OiB7XG5cdFx0XHRcdHR5cGU6ICdicmFuY2gnLFxuXHRcdFx0XHRzaXplOiB3aWR0aCxcblx0XHRcdFx0ZGF0YTogW1xuXHRcdFx0XHRcdC4uLih0aGlzLnNob3VsZFNob3dCYW5uZXJGaXJzdCgpID8gdGl0bGVBbmRCYW5uZXIucmV2ZXJzZSgpIDogdGl0bGVBbmRCYW5uZXIpLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdicmFuY2gnLFxuXHRcdFx0XHRcdFx0ZGF0YTogbWlkZGxlU2VjdGlvbixcblx0XHRcdFx0XHRcdHNpemU6IG1pZGRsZVNlY3Rpb25IZWlnaHRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdsZWFmJyxcblx0XHRcdFx0XHRcdGRhdGE6IHsgdHlwZTogUGFydHMuU1RBVFVTQkFSX1BBUlQgfSxcblx0XHRcdFx0XHRcdHNpemU6IHN0YXR1c0JhckhlaWdodCxcblx0XHRcdFx0XHRcdHZpc2libGU6ICF0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5TVEFUVVNCQVJfSElEREVOKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fSxcblx0XHRcdG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbi5WRVJUSUNBTCxcblx0XHRcdHdpZHRoLFxuXHRcdFx0aGVpZ2h0XG5cdFx0fTtcblxuXHRcdHR5cGUgU3RhcnR1cExheW91dEV2ZW50ID0ge1xuXHRcdFx0YWN0aXZpdHlCYXJWaXNpYmxlOiBib29sZWFuO1xuXHRcdFx0c2lkZUJhclZpc2libGU6IGJvb2xlYW47XG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBib29sZWFuO1xuXHRcdFx0cGFuZWxWaXNpYmxlOiBib29sZWFuO1xuXHRcdFx0c3RhdHVzYmFyVmlzaWJsZTogYm9vbGVhbjtcblx0XHRcdHNpZGVCYXJQb3NpdGlvbjogc3RyaW5nO1xuXHRcdFx0cGFuZWxQb3NpdGlvbjogc3RyaW5nO1xuXHRcdH07XG5cblx0XHR0eXBlIFN0YXJ0dXBMYXlvdXRFdmVudENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdiZW5pYmVuaic7XG5cdFx0XHRjb21tZW50OiAnSW5mb3JtYXRpb24gYWJvdXQgdGhlIGxheW91dCBvZiB0aGUgd29ya2JlbmNoIGR1cmluZyBzdGF0dXAnO1xuXHRcdFx0YWN0aXZpdHlCYXJWaXNpYmxlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciBvciB0aGUgbm90IHRoZSBhY3Rpdml0eSBiYXIgaXMgdmlzaWJsZScgfTtcblx0XHRcdHNpZGVCYXJWaXNpYmxlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciBvciB0aGUgbm90IHRoZSBwcmltYXJ5IHNpZGUgYmFyIGlzIHZpc2libGUnIH07XG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciBvciB0aGUgbm90IHRoZSBzZWNvbmRhcnkgc2lkZSBiYXIgaXMgdmlzaWJsZScgfTtcblx0XHRcdHBhbmVsVmlzaWJsZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgb3IgdGhlIG5vdCB0aGUgcGFuZWwgaXMgdmlzaWJsZScgfTtcblx0XHRcdHN0YXR1c2JhclZpc2libGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIG9yIHRoZSBub3QgdGhlIHN0YXR1cyBiYXIgaXMgdmlzaWJsZScgfTtcblx0XHRcdHNpZGVCYXJQb3NpdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIHByaW1hcnkgc2lkZSBiYXIgaXMgb24gdGhlIGxlZnQgb3IgcmlnaHQnIH07XG5cdFx0XHRwYW5lbFBvc2l0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgcGFuZWwgaXMgb24gdGhlIHRvcCwgYm90dG9tLCBsZWZ0LCBvciByaWdodCcgfTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgbGF5b3V0RGVzY3JpcHRvcjogU3RhcnR1cExheW91dEV2ZW50ID0ge1xuXHRcdFx0YWN0aXZpdHlCYXJWaXNpYmxlOiAhdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuQUNUSVZJVFlCQVJfSElEREVOKSxcblx0XHRcdHNpZGVCYXJWaXNpYmxlOiAhdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuU0lERUJBUl9ISURERU4pLFxuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogIXRoaXMuc3RhdGVNb2RlbC5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFVWElMSUFSWUJBUl9ISURERU4pLFxuXHRcdFx0cGFuZWxWaXNpYmxlOiAhdGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuUEFORUxfSElEREVOKSxcblx0XHRcdHN0YXR1c2JhclZpc2libGU6ICF0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5TVEFUVVNCQVJfSElEREVOKSxcblx0XHRcdHNpZGVCYXJQb3NpdGlvbjogcG9zaXRpb25Ub1N0cmluZyh0aGlzLnN0YXRlTW9kZWwuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5TSURFQkFSX1BPU0lUT04pKSxcblx0XHRcdHBhbmVsUG9zaXRpb246IHBvc2l0aW9uVG9TdHJpbmcodGhpcy5zdGF0ZU1vZGVsLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuUEFORUxfUE9TSVRJT04pKSxcblx0XHR9O1xuXG5cdFx0Ly8gV0FSTklORzogRG8gbm90IHJlbW92ZSB0aGlzIGV2ZW50LCBpdCdzIHVzZWQgdG8gdHJhY2sgYnVpbGQgcm9sbG91dCBwcm9ncmVzc1xuXHRcdC8vIFRhbGsgdG8gQGpvYW9tb3Jlbm8sIEBsc3pvbW9ydSBvciBAanJ1YWxlcyBiZWZvcmUgZG9pbmcgc29cblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxTdGFydHVwTGF5b3V0RXZlbnQsIFN0YXJ0dXBMYXlvdXRFdmVudENsYXNzaWZpY2F0aW9uPignc3RhcnR1cExheW91dCcsIGxheW91dERlc2NyaXB0b3IpO1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy5kaXNwb3NlZCA9IHRydWU7XG5cdH1cbn1cblxudHlwZSBaZW5Nb2RlQ29uZmlndXJhdGlvbiA9IHtcblx0Y2VudGVyTGF5b3V0OiBib29sZWFuO1xuXHRmdWxsU2NyZWVuOiBib29sZWFuO1xuXHRoaWRlQWN0aXZpdHlCYXI6IGJvb2xlYW47XG5cdGhpZGVMaW5lTnVtYmVyczogYm9vbGVhbjtcblx0aGlkZVN0YXR1c0JhcjogYm9vbGVhbjtcblx0c2hvd1RhYnM6ICdtdWx0aXBsZScgfCAnc2luZ2xlJyB8ICdub25lJztcblx0cmVzdG9yZTogYm9vbGVhbjtcblx0c2lsZW50Tm90aWZpY2F0aW9uczogYm9vbGVhbjtcbn07XG5cbmZ1bmN0aW9uIGdldFplbk1vZGVDb25maWd1cmF0aW9uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpOiBaZW5Nb2RlQ29uZmlndXJhdGlvbiB7XG5cdHJldHVybiBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxaZW5Nb2RlQ29uZmlndXJhdGlvbj4oV29ya2JlbmNoTGF5b3V0U2V0dGluZ3MuWkVOX01PREVfQ09ORklHKTtcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBMYXlvdXQgU3RhdGUgTW9kZWxcblxuaW50ZXJmYWNlIElXb3JrYmVuY2hMYXlvdXRTdGF0ZUtleSB7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgcnVudGltZTogYm9vbGVhbjtcblx0cmVhZG9ubHkgZGVmYXVsdFZhbHVlOiB1bmtub3duO1xuXHRyZWFkb25seSBzY29wZTogU3RvcmFnZVNjb3BlO1xuXHRyZWFkb25seSB0YXJnZXQ6IFN0b3JhZ2VUYXJnZXQ7XG5cdHJlYWRvbmx5IHplbk1vZGVJZ25vcmU/OiBib29sZWFuO1xufVxuXG50eXBlIFN0b3JhZ2VLZXlUeXBlID0gc3RyaW5nIHwgYm9vbGVhbiB8IG51bWJlciB8IG9iamVjdDtcblxuYWJzdHJhY3QgY2xhc3MgV29ya2JlbmNoTGF5b3V0U3RhdGVLZXk8VCBleHRlbmRzIFN0b3JhZ2VLZXlUeXBlPiBpbXBsZW1lbnRzIElXb3JrYmVuY2hMYXlvdXRTdGF0ZUtleSB7XG5cblx0YWJzdHJhY3QgcmVhZG9ubHkgcnVudGltZTogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBuYW1lOiBzdHJpbmcsIHJlYWRvbmx5IHNjb3BlOiBTdG9yYWdlU2NvcGUsIHJlYWRvbmx5IHRhcmdldDogU3RvcmFnZVRhcmdldCwgcHVibGljIGRlZmF1bHRWYWx1ZTogVCkgeyB9XG59XG5cbmNsYXNzIFJ1bnRpbWVTdGF0ZUtleTxUIGV4dGVuZHMgU3RvcmFnZUtleVR5cGU+IGV4dGVuZHMgV29ya2JlbmNoTGF5b3V0U3RhdGVLZXk8VD4ge1xuXG5cdHJlYWRvbmx5IHJ1bnRpbWUgPSB0cnVlO1xuXG5cdGNvbnN0cnVjdG9yKG5hbWU6IHN0cmluZywgc2NvcGU6IFN0b3JhZ2VTY29wZSwgdGFyZ2V0OiBTdG9yYWdlVGFyZ2V0LCBkZWZhdWx0VmFsdWU6IFQsIHJlYWRvbmx5IHplbk1vZGVJZ25vcmU/OiBib29sZWFuKSB7XG5cdFx0c3VwZXIobmFtZSwgc2NvcGUsIHRhcmdldCwgZGVmYXVsdFZhbHVlKTtcblx0fVxufVxuXG5jbGFzcyBJbml0aWFsaXphdGlvblN0YXRlS2V5PFQgZXh0ZW5kcyBTdG9yYWdlS2V5VHlwZT4gZXh0ZW5kcyBXb3JrYmVuY2hMYXlvdXRTdGF0ZUtleTxUPiB7XG5cdHJlYWRvbmx5IHJ1bnRpbWUgPSBmYWxzZTtcbn1cblxuY29uc3QgTGF5b3V0U3RhdGVLZXlzID0ge1xuXG5cdC8vIEVkaXRvclxuXHRNQUlOX0VESVRPUl9DRU5URVJFRDogbmV3IFJ1bnRpbWVTdGF0ZUtleTxib29sZWFuPignZWRpdG9yLmNlbnRlcmVkJywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FLCBmYWxzZSksXG5cblx0Ly8gWmVuIE1vZGVcblx0WkVOX01PREVfQUNUSVZFOiBuZXcgUnVudGltZVN0YXRlS2V5PGJvb2xlYW4+KCd6ZW5Nb2RlLmFjdGl2ZScsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSwgZmFsc2UpLFxuXHRaRU5fTU9ERV9FWElUX0lORk86IG5ldyBSdW50aW1lU3RhdGVLZXkoJ3plbk1vZGUuZXhpdEluZm8nLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUsIHtcblx0XHR0cmFuc2l0aW9uZWRUb0NlbnRlcmVkRWRpdG9yTGF5b3V0OiBmYWxzZSxcblx0XHR0cmFuc2l0aW9uZWRUb0Z1bGxTY3JlZW46IGZhbHNlLFxuXHRcdGhhbmRsZU5vdGlmaWNhdGlvbnNEb05vdERpc3R1cmJNb2RlOiBmYWxzZSxcblx0XHR3YXNWaXNpYmxlOiB7XG5cdFx0XHRhdXhpbGlhcnlCYXI6IGZhbHNlLFxuXHRcdFx0cGFuZWw6IGZhbHNlLFxuXHRcdFx0c2lkZUJhcjogZmFsc2UsXG5cdFx0fSxcblx0fSksXG5cblx0Ly8gUGFydCBTaXppbmdcblx0U0lERUJBUl9TSVpFOiBuZXcgSW5pdGlhbGl6YXRpb25TdGF0ZUtleTxudW1iZXI+KCdzaWRlQmFyLnNpemUnLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FLCAzMDApLFxuXHRBVVhJTElBUllCQVJfU0laRTogbmV3IEluaXRpYWxpemF0aW9uU3RhdGVLZXk8bnVtYmVyPignYXV4aWxpYXJ5QmFyLnNpemUnLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FLCAzMDApLFxuXHRQQU5FTF9TSVpFOiBuZXcgSW5pdGlhbGl6YXRpb25TdGF0ZUtleTxudW1iZXI+KCdwYW5lbC5zaXplJywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSwgMzAwKSxcblxuXHQvLyBQYXJ0IFN0YXRlXG5cdFBBTkVMX0xBU1RfTk9OX01BWElNSVpFRF9IRUlHSFQ6IG5ldyBSdW50aW1lU3RhdGVLZXk8bnVtYmVyPigncGFuZWwubGFzdE5vbk1heGltaXplZEhlaWdodCcsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUsIDMwMCksXG5cdFBBTkVMX0xBU1RfTk9OX01BWElNSVpFRF9XSURUSDogbmV3IFJ1bnRpbWVTdGF0ZUtleTxudW1iZXI+KCdwYW5lbC5sYXN0Tm9uTWF4aW1pemVkV2lkdGgnLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FLCAzMDApLFxuXHRQQU5FTF9XQVNfTEFTVF9NQVhJTUlaRUQ6IG5ldyBSdW50aW1lU3RhdGVLZXk8Ym9vbGVhbj4oJ3BhbmVsLndhc0xhc3RNYXhpbWl6ZWQnLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUsIGZhbHNlKSxcblxuXHRBVVhJTElBUllCQVJfV0FTX0xBU1RfTUFYSU1JWkVEOiBuZXcgUnVudGltZVN0YXRlS2V5PGJvb2xlYW4+KCdhdXhpbGlhcnlCYXIud2FzTGFzdE1heGltaXplZCcsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSwgZmFsc2UpLFxuXHRBVVhJTElBUllCQVJfTEFTVF9OT05fTUFYSU1JWkVEX1NJWkU6IG5ldyBSdW50aW1lU3RhdGVLZXk8bnVtYmVyPignYXV4aWxpYXJ5QmFyLmxhc3ROb25NYXhpbWl6ZWRTaXplJywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSwgMzAwKSxcblx0QVVYSUxJQVJZQkFSX0xBU1RfTk9OX01BWElNSVpFRF9WSVNJQklMSVRZOiBuZXcgUnVudGltZVN0YXRlS2V5KCdhdXhpbGlhcnlCYXIubGFzdE5vbk1heGltaXplZFZpc2liaWxpdHknLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUsIHtcblx0XHRzaWRlQmFyVmlzaWJsZTogZmFsc2UsXG5cdFx0ZWRpdG9yVmlzaWJsZTogZmFsc2UsXG5cdFx0cGFuZWxWaXNpYmxlOiBmYWxzZSxcblx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBmYWxzZVxuXHR9KSxcblx0QVVYSUxJQVJZQkFSX0VNUFRZOiBuZXcgSW5pdGlhbGl6YXRpb25TdGF0ZUtleTxib29sZWFuPignYXV4aWxpYXJ5QmFyLmVtcHR5JywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSwgZmFsc2UpLFxuXG5cdC8vIFBhcnQgUG9zaXRpb25zXG5cdFNJREVCQVJfUE9TSVRPTjogbmV3IFJ1bnRpbWVTdGF0ZUtleTxQb3NpdGlvbj4oJ3NpZGVCYXIucG9zaXRpb24nLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUsIFBvc2l0aW9uLkxFRlQpLFxuXHRQQU5FTF9QT1NJVElPTjogbmV3IFJ1bnRpbWVTdGF0ZUtleTxQb3NpdGlvbj4oJ3BhbmVsLnBvc2l0aW9uJywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FLCBQb3NpdGlvbi5CT1RUT00pLFxuXHRQQU5FTF9BTElHTk1FTlQ6IG5ldyBSdW50aW1lU3RhdGVLZXk8UGFuZWxBbGlnbm1lbnQ+KCdwYW5lbC5hbGlnbm1lbnQnLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSLCAnY2VudGVyJyksXG5cblx0Ly8gUGFydCBWaXNpYmlsaXR5XG5cdEFDVElWSVRZQkFSX0hJRERFTjogbmV3IFJ1bnRpbWVTdGF0ZUtleTxib29sZWFuPignYWN0aXZpdHlCYXIuaGlkZGVuJywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FLCBmYWxzZSwgdHJ1ZSksXG5cdFNJREVCQVJfSElEREVOOiBuZXcgUnVudGltZVN0YXRlS2V5PGJvb2xlYW4+KCdzaWRlQmFyLmhpZGRlbicsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSwgZmFsc2UpLFxuXHRFRElUT1JfSElEREVOOiBuZXcgUnVudGltZVN0YXRlS2V5PGJvb2xlYW4+KCdlZGl0b3IuaGlkZGVuJywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FLCBmYWxzZSksXG5cdFBBTkVMX0hJRERFTjogbmV3IFJ1bnRpbWVTdGF0ZUtleTxib29sZWFuPigncGFuZWwuaGlkZGVuJywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FLCB0cnVlKSxcblx0QVVYSUxJQVJZQkFSX0hJRERFTjogbmV3IFJ1bnRpbWVTdGF0ZUtleTxib29sZWFuPignYXV4aWxpYXJ5QmFyLmhpZGRlbicsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSwgdHJ1ZSksXG5cdFNUQVRVU0JBUl9ISURERU46IG5ldyBSdW50aW1lU3RhdGVLZXk8Ym9vbGVhbj4oJ3N0YXR1c0Jhci5oaWRkZW4nLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUsIGZhbHNlLCB0cnVlKVxuXG59IGFzIGNvbnN0O1xuXG5pbnRlcmZhY2UgSUxheW91dFN0YXRlQ2hhbmdlRXZlbnQ8VCBleHRlbmRzIFN0b3JhZ2VLZXlUeXBlPiB7XG5cdHJlYWRvbmx5IGtleTogUnVudGltZVN0YXRlS2V5PFQ+O1xuXHRyZWFkb25seSB2YWx1ZTogVDtcbn1cblxuZW51bSBXb3JrYmVuY2hMYXlvdXRTZXR0aW5ncyB7XG5cdEFVWElMSUFSWUJBUl9ERUZBVUxUX1ZJU0lCSUxJVFkgPSAnd29ya2JlbmNoLnNlY29uZGFyeVNpZGVCYXIuZGVmYXVsdFZpc2liaWxpdHknLFxuXHRBVVhJTElBUllCQVJfRk9SQ0VfTUFYSU1JWkVEID0gJ3dvcmtiZW5jaC5zZWNvbmRhcnlTaWRlQmFyLmZvcmNlTWF4aW1pemVkJyxcblx0QUNUSVZJVFlfQkFSX1ZJU0lCTEUgPSAnd29ya2JlbmNoLmFjdGl2aXR5QmFyLnZpc2libGUnLFxuXHRQQU5FTF9QT1NJVElPTiA9ICd3b3JrYmVuY2gucGFuZWwuZGVmYXVsdExvY2F0aW9uJyxcblx0UEFORUxfT1BFTlNfTUFYSU1JWkVEID0gJ3dvcmtiZW5jaC5wYW5lbC5vcGVuc01heGltaXplZCcsXG5cdFpFTl9NT0RFX0NPTkZJRyA9ICd6ZW5Nb2RlJyxcblx0RURJVE9SX0NFTlRFUkVEX0xBWU9VVF9BVVRPX1JFU0laRSA9ICd3b3JrYmVuY2guZWRpdG9yLmNlbnRlcmVkTGF5b3V0QXV0b1Jlc2l6ZScsXG5cdEVESVRPUl9SRVNUT1JFX0VESVRPUlMgPSAnd29ya2JlbmNoLmVkaXRvci5yZXN0b3JlRWRpdG9ycycsXG59XG5cbmVudW0gTGVnYWN5V29ya2JlbmNoTGF5b3V0U2V0dGluZ3Mge1xuXHRTVEFUVVNCQVJfVklTSUJMRSA9ICd3b3JrYmVuY2guc3RhdHVzQmFyLnZpc2libGUnLCBcdC8vIERlcHJlY2F0ZWQgdG8gVUkgU3RhdGVcblx0U0lERUJBUl9QT1NJVElPTiA9ICd3b3JrYmVuY2guc2lkZUJhci5sb2NhdGlvbicsIFx0Ly8gRGVwcmVjYXRlZCB0byBVSSBTdGF0ZVxufVxuXG5pbnRlcmZhY2UgSUxheW91dFN0YXRlTG9hZENvbmZpZ3VyYXRpb24ge1xuXHRyZWFkb25seSBtYWluQ29udGFpbmVyRGltZW5zaW9uOiBJRGltZW5zaW9uO1xuXHRyZWFkb25seSByZXNldExheW91dDogYm9vbGVhbjtcbn1cblxuY2xhc3MgTGF5b3V0U3RhdGVNb2RlbCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHN0YXRpYyByZWFkb25seSBTVE9SQUdFX1BSRUZJWCA9ICd3b3JrYmVuY2guJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVN0YXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUxheW91dFN0YXRlQ2hhbmdlRXZlbnQ8U3RvcmFnZUtleVR5cGU+PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTdGF0ZSA9IHRoaXMuX29uRGlkQ2hhbmdlU3RhdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBzdGF0ZUNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIHVua25vd24+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBpc05ldzoge1xuXHRcdFtTdG9yYWdlU2NvcGUuV09SS1NQQUNFXTogYm9vbGVhbjtcblx0XHRbU3RvcmFnZVNjb3BlLlBST0ZJTEVdOiBib29sZWFuO1xuXHRcdFtTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05dOiBib29sZWFuO1xuXHRcdFtTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05fU0hBUkVEXTogYm9vbGVhbjtcblx0fTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmlzTmV3ID0ge1xuXHRcdFx0W1N0b3JhZ2VTY29wZS5XT1JLU1BBQ0VdOiB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmlzTmV3KFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpLFxuXHRcdFx0W1N0b3JhZ2VTY29wZS5QUk9GSUxFXTogdGhpcy5zdG9yYWdlU2VydmljZS5pc05ldyhTdG9yYWdlU2NvcGUuUFJPRklMRSksXG5cdFx0XHRbU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OXTogdGhpcy5zdG9yYWdlU2VydmljZS5pc05ldyhTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pLFxuXHRcdFx0W1N0b3JhZ2VTY29wZS5BUFBMSUNBVElPTl9TSEFSRURdOiB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmlzTmV3KFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTl9TSEFSRUQpXG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGNvbmZpZ3VyYXRpb25DaGFuZ2UgPT4gdGhpcy51cGRhdGVTdGF0ZUZyb21MZWdhY3lTZXR0aW5ncyhjb25maWd1cmF0aW9uQ2hhbmdlKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTdGF0ZUZyb21MZWdhY3lTZXR0aW5ncyhjb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQ6IElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoY29uZmlndXJhdGlvbkNoYW5nZUV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9MT0NBVElPTikpIHtcblx0XHRcdHRoaXMuc2V0UnVudGltZVZhbHVlQW5kRmlyZShMYXlvdXRTdGF0ZUtleXMuQUNUSVZJVFlCQVJfSElEREVOLCB0aGlzLmlzQWN0aXZpdHlCYXJIaWRkZW4oKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudC5hZmZlY3RzQ29uZmlndXJhdGlvbihMZWdhY3lXb3JrYmVuY2hMYXlvdXRTZXR0aW5ncy5TVEFUVVNCQVJfVklTSUJMRSkpIHtcblx0XHRcdHRoaXMuc2V0UnVudGltZVZhbHVlQW5kRmlyZShMYXlvdXRTdGF0ZUtleXMuU1RBVFVTQkFSX0hJRERFTiwgIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoTGVnYWN5V29ya2JlbmNoTGF5b3V0U2V0dGluZ3MuU1RBVFVTQkFSX1ZJU0lCTEUpKTtcblx0XHR9XG5cblx0XHRpZiAoY29uZmlndXJhdGlvbkNoYW5nZUV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKExlZ2FjeVdvcmtiZW5jaExheW91dFNldHRpbmdzLlNJREVCQVJfUE9TSVRJT04pKSB7XG5cdFx0XHR0aGlzLnNldFJ1bnRpbWVWYWx1ZUFuZEZpcmUoTGF5b3V0U3RhdGVLZXlzLlNJREVCQVJfUE9TSVRPTiwgcG9zaXRpb25Gcm9tU3RyaW5nKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoTGVnYWN5V29ya2JlbmNoTGF5b3V0U2V0dGluZ3MuU0lERUJBUl9QT1NJVElPTikgPz8gJ2xlZnQnKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVMZWdhY3lTZXR0aW5nc0Zyb21TdGF0ZTxUIGV4dGVuZHMgU3RvcmFnZUtleVR5cGU+KGtleTogUnVudGltZVN0YXRlS2V5PFQ+LCB2YWx1ZTogVCk6IHZvaWQge1xuXHRcdGNvbnN0IGlzWmVuTW9kZSA9IHRoaXMuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5aRU5fTU9ERV9BQ1RJVkUpO1xuXHRcdGlmIChrZXkuemVuTW9kZUlnbm9yZSAmJiBpc1plbk1vZGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoa2V5ID09PSBMYXlvdXRTdGF0ZUtleXMuQUNUSVZJVFlCQVJfSElEREVOKSB7XG5cdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9MT0NBVElPTiwgdmFsdWUgPyBBY3Rpdml0eUJhclBvc2l0aW9uLkhJRERFTiA6IHVuZGVmaW5lZCk7XG5cdFx0fSBlbHNlIGlmIChrZXkgPT09IExheW91dFN0YXRlS2V5cy5TVEFUVVNCQVJfSElEREVOKSB7XG5cdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKExlZ2FjeVdvcmtiZW5jaExheW91dFNldHRpbmdzLlNUQVRVU0JBUl9WSVNJQkxFLCAhdmFsdWUpO1xuXHRcdH0gZWxzZSBpZiAoa2V5ID09PSBMYXlvdXRTdGF0ZUtleXMuU0lERUJBUl9QT1NJVE9OKSB7XG5cdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKExlZ2FjeVdvcmtiZW5jaExheW91dFNldHRpbmdzLlNJREVCQVJfUE9TSVRJT04sIHBvc2l0aW9uVG9TdHJpbmcodmFsdWUgYXMgUG9zaXRpb24pKTtcblx0XHR9XG5cdH1cblxuXHRsb2FkKGNvbmZpZ3VyYXRpb246IElMYXlvdXRTdGF0ZUxvYWRDb25maWd1cmF0aW9uKTogdm9pZCB7XG5cdFx0bGV0IGtleToga2V5b2YgdHlwZW9mIExheW91dFN0YXRlS2V5cztcblxuXHRcdC8vIExvYWQgc3RvcmVkIHZhbHVlcyBmb3IgYWxsIGtleXMgdW5sZXNzIHdlIGV4cGxpY2l0bHkgc2V0IHRvIHJlc2V0XG5cdFx0aWYgKCFjb25maWd1cmF0aW9uLnJlc2V0TGF5b3V0KSB7XG5cdFx0XHRmb3IgKGtleSBpbiBMYXlvdXRTdGF0ZUtleXMpIHtcblx0XHRcdFx0Y29uc3Qgc3RhdGVLZXkgPSBMYXlvdXRTdGF0ZUtleXNba2V5XSBhcyBXb3JrYmVuY2hMYXlvdXRTdGF0ZUtleTxTdG9yYWdlS2V5VHlwZT47XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gdGhpcy5sb2FkS2V5RnJvbVN0b3JhZ2Uoc3RhdGVLZXkpO1xuXG5cdFx0XHRcdGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5zdGF0ZUNhY2hlLnNldChzdGF0ZUtleS5uYW1lLCB2YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBcHBseSBsZWdhY3kgc2V0dGluZ3Ncblx0XHR0aGlzLnN0YXRlQ2FjaGUuc2V0KExheW91dFN0YXRlS2V5cy5BQ1RJVklUWUJBUl9ISURERU4ubmFtZSwgdGhpcy5pc0FjdGl2aXR5QmFySGlkZGVuKCkpO1xuXHRcdHRoaXMuc3RhdGVDYWNoZS5zZXQoTGF5b3V0U3RhdGVLZXlzLlNUQVRVU0JBUl9ISURERU4ubmFtZSwgIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoTGVnYWN5V29ya2JlbmNoTGF5b3V0U2V0dGluZ3MuU1RBVFVTQkFSX1ZJU0lCTEUpKTtcblx0XHR0aGlzLnN0YXRlQ2FjaGUuc2V0KExheW91dFN0YXRlS2V5cy5TSURFQkFSX1BPU0lUT04ubmFtZSwgcG9zaXRpb25Gcm9tU3RyaW5nKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoTGVnYWN5V29ya2JlbmNoTGF5b3V0U2V0dGluZ3MuU0lERUJBUl9QT1NJVElPTikgPz8gJ2xlZnQnKSk7XG5cblx0XHQvLyBTZXQgZHluYW1pYyBkZWZhdWx0czogcGFydCBzaXppbmcgYW5kIHNpZGUgYmFyIHZpc2liaWxpdHlcblx0XHRjb25zdCBhdXhpbGlhcnlCYXJGb3JjZU1heGltaXplZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoV29ya2JlbmNoTGF5b3V0U2V0dGluZ3MuQVVYSUxJQVJZQkFSX0ZPUkNFX01BWElNSVpFRCk7XG5cdFx0Y29uc3Qgd29ya2JlbmNoU3RhdGUgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCk7XG5cdFx0Y29uc3QgbWFpbkNvbnRhaW5lckRpbWVuc2lvbiA9IGNvbmZpZ3VyYXRpb24ubWFpbkNvbnRhaW5lckRpbWVuc2lvbjtcblx0XHRMYXlvdXRTdGF0ZUtleXMuU0lERUJBUl9TSVpFLmRlZmF1bHRWYWx1ZSA9IE1hdGgubWluKDMwMCwgbWFpbkNvbnRhaW5lckRpbWVuc2lvbi53aWR0aCAvIDQpO1xuXHRcdExheW91dFN0YXRlS2V5cy5TSURFQkFSX0hJRERFTi5kZWZhdWx0VmFsdWUgPSB3b3JrYmVuY2hTdGF0ZSA9PT0gV29ya2JlbmNoU3RhdGUuRU1QVFkgfHwgYXV4aWxpYXJ5QmFyRm9yY2VNYXhpbWl6ZWQgPT09IHRydWU7XG5cdFx0TGF5b3V0U3RhdGVLZXlzLkFVWElMSUFSWUJBUl9TSVpFLmRlZmF1bHRWYWx1ZSA9IGF1eGlsaWFyeUJhckZvcmNlTWF4aW1pemVkID8gTWF0aC5tYXgoMzAwLCBtYWluQ29udGFpbmVyRGltZW5zaW9uLndpZHRoIC8gMikgOiBNYXRoLm1pbigzMDAsIG1haW5Db250YWluZXJEaW1lbnNpb24ud2lkdGggLyA0KTtcblx0XHRMYXlvdXRTdGF0ZUtleXMuQVVYSUxJQVJZQkFSX0hJRERFTi5kZWZhdWx0VmFsdWUgPSAoKCkgPT4ge1xuXHRcdFx0aWYgKGlzV2ViICYmICF0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7IC8vIG5vdCByZXF1aXJlZCBpbiB3ZWIgaWYgdW5zdXBwb3J0ZWRcblx0XHRcdH1cblxuXHRcdFx0aWYgKGF1eGlsaWFyeUJhckZvcmNlTWF4aW1pemVkID09PSB0cnVlKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTsgLy8gZm9yY2VkIHRvIGJlIHZpc2libGVcblx0XHRcdH1cblxuXHRcdFx0Ly8gVW5sZXNzIGF1eGlsaWFyeSBiYXIgdmlzaWJpbGl0eSBpcyBleHBsaWNpdGx5IGNvbmZpZ3VyZWQsIG1ha2Vcblx0XHRcdC8vIHN1cmUgdG8gbm90IGZvcmNlIG9wZW4gaXQgaW4gY2FzZSB3ZSBrbm93IGl0IHdhcyBlbXB0eSBiZWZvcmUuXG5cdFx0XHRjb25zdCBjb25maWd1cmF0aW9uID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0KFdvcmtiZW5jaExheW91dFNldHRpbmdzLkFVWElMSUFSWUJBUl9ERUZBVUxUX1ZJU0lCSUxJVFkpO1xuXHRcdFx0aWYgKGNvbmZpZ3VyYXRpb24uZGVmYXVsdFZhbHVlICE9PSAnaGlkZGVuJyAmJiAhaXNDb25maWd1cmVkKGNvbmZpZ3VyYXRpb24pICYmIHRoaXMuc3RhdGVDYWNoZS5nZXQoTGF5b3V0U3RhdGVLZXlzLkFVWElMSUFSWUJBUl9FTVBUWS5uYW1lKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTmV3IHVzZXJzOiBTaG93IGF1eGlsaWFyeSBiYXIgZXZlbiBpbiBlbXB0eSB3b3Jrc3BhY2VzLFxuXHRcdFx0Ly8gYnV0IG5vdCBpZiB0aGUgdXNlciBleHBsaWNpdGx5IGhpZGVzIGl0IG9yIEFJIGZlYXR1cmVzIGFyZSBkaXNhYmxlZC5cblx0XHRcdGlmIChcblx0XHRcdFx0dGhpcy5pc05ld1tTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05dICYmXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb24udmFsdWUgIT09ICdoaWRkZW4nICYmXG5cdFx0XHRcdCF0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRBSURpc2FibGVkU2V0dGluZ0lkKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRXhpc3RpbmcgdXNlcnM6IHJlc3BlY3QgdmlzaWJpbGl0eSBzZXR0aW5nXG5cdFx0XHRzd2l0Y2ggKGNvbmZpZ3VyYXRpb24udmFsdWUpIHtcblx0XHRcdFx0Y2FzZSAnaGlkZGVuJzpcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0Y2FzZSAndmlzaWJsZUluV29ya3NwYWNlJzpcblx0XHRcdFx0Y2FzZSAnbWF4aW1pemVkSW5Xb3Jrc3BhY2UnOlxuXHRcdFx0XHRcdHJldHVybiB3b3JrYmVuY2hTdGF0ZSA9PT0gV29ya2JlbmNoU3RhdGUuRU1QVFk7XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pKCk7XG5cdFx0TGF5b3V0U3RhdGVLZXlzLlBBTkVMX1NJWkUuZGVmYXVsdFZhbHVlID0gKHRoaXMuc3RhdGVDYWNoZS5nZXQoTGF5b3V0U3RhdGVLZXlzLlBBTkVMX1BPU0lUSU9OLm5hbWUpID8/IGlzSG9yaXpvbnRhbChMYXlvdXRTdGF0ZUtleXMuUEFORUxfUE9TSVRJT04uZGVmYXVsdFZhbHVlKSkgPyBtYWluQ29udGFpbmVyRGltZW5zaW9uLmhlaWdodCAvIDMgOiBtYWluQ29udGFpbmVyRGltZW5zaW9uLndpZHRoIC8gNDtcblx0XHRMYXlvdXRTdGF0ZUtleXMuUEFORUxfUE9TSVRJT04uZGVmYXVsdFZhbHVlID0gcG9zaXRpb25Gcm9tU3RyaW5nKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoV29ya2JlbmNoTGF5b3V0U2V0dGluZ3MuUEFORUxfUE9TSVRJT04pID8/ICdib3R0b20nKTtcblxuXHRcdC8vIEFwcGx5IGFsbCBkZWZhdWx0c1xuXHRcdGZvciAoa2V5IGluIExheW91dFN0YXRlS2V5cykge1xuXHRcdFx0Y29uc3Qgc3RhdGVLZXkgPSBMYXlvdXRTdGF0ZUtleXNba2V5XTtcblx0XHRcdGlmICh0aGlzLnN0YXRlQ2FjaGUuZ2V0KHN0YXRlS2V5Lm5hbWUpID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5zdGF0ZUNhY2hlLnNldChzdGF0ZUtleS5uYW1lLCBzdGF0ZUtleS5kZWZhdWx0VmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFwcGx5IGFsbCBvdmVycmlkZXNcblx0XHR0aGlzLmFwcGx5T3ZlcnJpZGVzKGNvbmZpZ3VyYXRpb24pO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgZm9yIHJ1bnRpbWUga2V5IGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLlBST0ZJTEUsIHVuZGVmaW5lZCwgdGhpcy5fc3RvcmUpKHN0b3JhZ2VDaGFuZ2VFdmVudCA9PiB7XG5cdFx0XHRsZXQga2V5OiBrZXlvZiB0eXBlb2YgTGF5b3V0U3RhdGVLZXlzO1xuXHRcdFx0Zm9yIChrZXkgaW4gTGF5b3V0U3RhdGVLZXlzKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXRlS2V5ID0gTGF5b3V0U3RhdGVLZXlzW2tleV0gYXMgV29ya2JlbmNoTGF5b3V0U3RhdGVLZXk8U3RvcmFnZUtleVR5cGU+O1xuXHRcdFx0XHRpZiAoc3RhdGVLZXkgaW5zdGFuY2VvZiBSdW50aW1lU3RhdGVLZXkgJiYgc3RhdGVLZXkuc2NvcGUgPT09IFN0b3JhZ2VTY29wZS5QUk9GSUxFICYmIHN0YXRlS2V5LnRhcmdldCA9PT0gU3RvcmFnZVRhcmdldC5VU0VSKSB7XG5cdFx0XHRcdFx0aWYgKGAke0xheW91dFN0YXRlTW9kZWwuU1RPUkFHRV9QUkVGSVh9JHtzdGF0ZUtleS5uYW1lfWAgPT09IHN0b3JhZ2VDaGFuZ2VFdmVudC5rZXkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHZhbHVlID0gdGhpcy5sb2FkS2V5RnJvbVN0b3JhZ2Uoc3RhdGVLZXkpID8/IHN0YXRlS2V5LmRlZmF1bHRWYWx1ZTtcblx0XHRcdFx0XHRcdGlmICh0aGlzLnN0YXRlQ2FjaGUuZ2V0KHN0YXRlS2V5Lm5hbWUpICE9PSB2YWx1ZSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnN0YXRlQ2FjaGUuc2V0KHN0YXRlS2V5Lm5hbWUsIHZhbHVlKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTdGF0ZS5maXJlKHsga2V5OiBzdGF0ZUtleSwgdmFsdWUgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBseU92ZXJyaWRlcyhjb25maWd1cmF0aW9uOiBJTGF5b3V0U3RhdGVMb2FkQ29uZmlndXJhdGlvbik6IHZvaWQge1xuXG5cdFx0Ly8gQXV4aWxpYXJ5IGJhcjogTWF4aW1pemVkIHNldHRpbmdzXG5cdFx0aWYgKHRoaXMuaXNOZXdbU3RvcmFnZVNjb3BlLldPUktTUEFDRV0pIHtcblx0XHRcdGNvbnN0IGRlZmF1bHRBdXhpbGlhcnlCYXJWaXNpYmlsaXR5ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShXb3JrYmVuY2hMYXlvdXRTZXR0aW5ncy5BVVhJTElBUllCQVJfREVGQVVMVF9WSVNJQklMSVRZKTtcblx0XHRcdGNvbnN0IHN0YXJ0dXBFZGl0b3IgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdub25lJyB8ICd3ZWxjb21lUGFnZScgfCAncmVhZG1lJyB8ICduZXdVbnRpdGxlZEZpbGUnIHwgJ3dlbGNvbWVQYWdlSW5FbXB0eVdvcmtiZW5jaCcgfCAndGVybWluYWwnIHwgJ2FnZW50U2Vzc2lvbnNXZWxjb21lUGFnZSc+KCd3b3JrYmVuY2guc3RhcnR1cEVkaXRvcicpO1xuXHRcdFx0aWYgKHN0YXJ0dXBFZGl0b3IgPT09ICdhZ2VudFNlc3Npb25zV2VsY29tZVBhZ2UnKSB7XG5cdFx0XHRcdHRoaXMuYXBwbHlBdXhpbGlhcnlCYXJIaWRkZW5PdmVycmlkZSh0cnVlKTtcblx0XHRcdH0gZWxzZSBpZiAoXG5cdFx0XHRcdGRlZmF1bHRBdXhpbGlhcnlCYXJWaXNpYmlsaXR5ID09PSAnbWF4aW1pemVkJyB8fFxuXHRcdFx0XHQoZGVmYXVsdEF1eGlsaWFyeUJhclZpc2liaWxpdHkgPT09ICdtYXhpbWl6ZWRJbldvcmtzcGFjZScgJiYgdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpICE9PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSlcblx0XHRcdCkge1xuXHRcdFx0XHR0aGlzLmFwcGx5QXV4aWxpYXJ5QmFyTWF4aW1pemVkT3ZlcnJpZGUoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBCb3RoIGVkaXRvciBhbmQgcGFuZWwgc2hvdWxkIG5vdCBiZSBoaWRkZW4gb24gc3RhcnR1cCB1bmxlc3MgYXV4aWxpYXJ5IGJhciBpcyBtYXhpbWl6ZWRcblx0XHRpZiAoXG5cdFx0XHR0aGlzLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuUEFORUxfSElEREVOKSAmJlxuXHRcdFx0dGhpcy5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkVESVRPUl9ISURERU4pICYmXG5cdFx0XHQhdGhpcy5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFVWElMSUFSWUJBUl9XQVNfTEFTVF9NQVhJTUlaRUQpXG5cdFx0KSB7XG5cdFx0XHR0aGlzLnNldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuRURJVE9SX0hJRERFTiwgZmFsc2UpO1xuXHRcdH1cblxuXHRcdC8vIFJlc3RyaWN0IGF1eGlsaWFyeSBiYXIgc2l6ZSBpbiBjYXNlIG9mIHNtYWxsIHdpbmRvdyBkaW1lbnNpb25zXG5cdFx0aWYgKHRoaXMuaXNOZXdbU3RvcmFnZVNjb3BlLldPUktTUEFDRV0gJiYgY29uZmlndXJhdGlvbi5tYWluQ29udGFpbmVyRGltZW5zaW9uLndpZHRoIDw9IERFRkFVTFRfV09SS1NQQUNFX1dJTkRPV19ESU1FTlNJT05TLndpZHRoKSB7XG5cdFx0XHR0aGlzLnNldEluaXRpYWxpemF0aW9uVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlNJREVCQVJfU0laRSwgTWF0aC5taW4oMzAwLCBjb25maWd1cmF0aW9uLm1haW5Db250YWluZXJEaW1lbnNpb24ud2lkdGggLyA0KSk7XG5cdFx0XHR0aGlzLnNldEluaXRpYWxpemF0aW9uVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFVWElMSUFSWUJBUl9TSVpFLCBNYXRoLm1pbigzMDAsIGNvbmZpZ3VyYXRpb24ubWFpbkNvbnRhaW5lckRpbWVuc2lvbi53aWR0aCAvIDQpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFwcGx5QXV4aWxpYXJ5QmFyTWF4aW1pemVkT3ZlcnJpZGUoKTogdm9pZCB7XG5cdFx0dGhpcy5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFVWElMSUFSWUJBUl9MQVNUX05PTl9NQVhJTUlaRURfVklTSUJJTElUWSwge1xuXHRcdFx0c2lkZUJhclZpc2libGU6ICF0aGlzLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuU0lERUJBUl9ISURERU4pLFxuXHRcdFx0cGFuZWxWaXNpYmxlOiAhdGhpcy5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlBBTkVMX0hJRERFTiksXG5cdFx0XHRlZGl0b3JWaXNpYmxlOiAhdGhpcy5nZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkVESVRPUl9ISURERU4pLFxuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogIXRoaXMuZ2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5BVVhJTElBUllCQVJfSElEREVOKVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLlNJREVCQVJfSElEREVOLCB0cnVlKTtcblx0XHR0aGlzLnNldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuUEFORUxfSElEREVOLCB0cnVlKTtcblx0XHR0aGlzLnNldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuRURJVE9SX0hJRERFTiwgdHJ1ZSk7XG5cdFx0dGhpcy5zZXRSdW50aW1lVmFsdWUoTGF5b3V0U3RhdGVLZXlzLkFVWElMSUFSWUJBUl9ISURERU4sIGZhbHNlKTtcblxuXHRcdHRoaXMuc2V0UnVudGltZVZhbHVlKExheW91dFN0YXRlS2V5cy5BVVhJTElBUllCQVJfTEFTVF9OT05fTUFYSU1JWkVEX1NJWkUsIHRoaXMuZ2V0SW5pdGlhbGl6YXRpb25WYWx1ZShMYXlvdXRTdGF0ZUtleXMuQVVYSUxJQVJZQkFSX1NJWkUpKTtcblx0XHR0aGlzLnNldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuQVVYSUxJQVJZQkFSX1dBU19MQVNUX01BWElNSVpFRCwgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGFwcGx5QXV4aWxpYXJ5QmFySGlkZGVuT3ZlcnJpZGUodmFsdWU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLnNldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuQVVYSUxJQVJZQkFSX0hJRERFTiwgdmFsdWUpO1xuXHR9XG5cblx0c2F2ZSh3b3Jrc3BhY2U6IGJvb2xlYW4sIGdsb2JhbDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGxldCBrZXk6IGtleW9mIHR5cGVvZiBMYXlvdXRTdGF0ZUtleXM7XG5cblx0XHRjb25zdCBpc1plbk1vZGUgPSB0aGlzLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuWkVOX01PREVfQUNUSVZFKTtcblxuXHRcdGZvciAoa2V5IGluIExheW91dFN0YXRlS2V5cykge1xuXHRcdFx0Y29uc3Qgc3RhdGVLZXkgPSBMYXlvdXRTdGF0ZUtleXNba2V5XSBhcyBXb3JrYmVuY2hMYXlvdXRTdGF0ZUtleTxTdG9yYWdlS2V5VHlwZT47XG5cdFx0XHRpZiAoKHdvcmtzcGFjZSAmJiBzdGF0ZUtleS5zY29wZSA9PT0gU3RvcmFnZVNjb3BlLldPUktTUEFDRSkgfHxcblx0XHRcdFx0KGdsb2JhbCAmJiBzdGF0ZUtleS5zY29wZSA9PT0gU3RvcmFnZVNjb3BlLlBST0ZJTEUpKSB7XG5cdFx0XHRcdGlmIChpc1plbk1vZGUgJiYgc3RhdGVLZXkgaW5zdGFuY2VvZiBSdW50aW1lU3RhdGVLZXkgJiYgc3RhdGVLZXkuemVuTW9kZUlnbm9yZSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlOyAvLyBEb24ndCB3cml0ZSBvdXQgc3BlY2lmaWMga2V5cyB3aGlsZSBpbiB6ZW4gbW9kZVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5zYXZlS2V5VG9TdG9yYWdlKHN0YXRlS2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRnZXRJbml0aWFsaXphdGlvblZhbHVlPFQgZXh0ZW5kcyBTdG9yYWdlS2V5VHlwZT4oa2V5OiBJbml0aWFsaXphdGlvblN0YXRlS2V5PFQ+KTogVCB7XG5cdFx0cmV0dXJuIHRoaXMuc3RhdGVDYWNoZS5nZXQoa2V5Lm5hbWUpIGFzIFQ7XG5cdH1cblxuXHRzZXRJbml0aWFsaXphdGlvblZhbHVlPFQgZXh0ZW5kcyBTdG9yYWdlS2V5VHlwZT4oa2V5OiBJbml0aWFsaXphdGlvblN0YXRlS2V5PFQ+LCB2YWx1ZTogVCk6IHZvaWQge1xuXHRcdHRoaXMuc3RhdGVDYWNoZS5zZXQoa2V5Lm5hbWUsIHZhbHVlKTtcblx0fVxuXG5cdGdldFJ1bnRpbWVWYWx1ZTxUIGV4dGVuZHMgU3RvcmFnZUtleVR5cGU+KGtleTogUnVudGltZVN0YXRlS2V5PFQ+LCBmYWxsYmFja1RvU2V0dGluZz86IGJvb2xlYW4pOiBUIHtcblx0XHRpZiAoZmFsbGJhY2tUb1NldHRpbmcpIHtcblx0XHRcdHN3aXRjaCAoa2V5KSB7XG5cdFx0XHRcdGNhc2UgTGF5b3V0U3RhdGVLZXlzLkFDVElWSVRZQkFSX0hJRERFTjpcblx0XHRcdFx0XHR0aGlzLnN0YXRlQ2FjaGUuc2V0KGtleS5uYW1lLCB0aGlzLmlzQWN0aXZpdHlCYXJIaWRkZW4oKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgTGF5b3V0U3RhdGVLZXlzLlNUQVRVU0JBUl9ISURERU46XG5cdFx0XHRcdFx0dGhpcy5zdGF0ZUNhY2hlLnNldChrZXkubmFtZSwgIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoTGVnYWN5V29ya2JlbmNoTGF5b3V0U2V0dGluZ3MuU1RBVFVTQkFSX1ZJU0lCTEUpKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBMYXlvdXRTdGF0ZUtleXMuU0lERUJBUl9QT1NJVE9OOlxuXHRcdFx0XHRcdHRoaXMuc3RhdGVDYWNoZS5zZXQoa2V5Lm5hbWUsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoTGVnYWN5V29ya2JlbmNoTGF5b3V0U2V0dGluZ3MuU0lERUJBUl9QT1NJVElPTikgPz8gJ2xlZnQnKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5zdGF0ZUNhY2hlLmdldChrZXkubmFtZSkgYXMgVDtcblx0fVxuXG5cdHNldFJ1bnRpbWVWYWx1ZTxUIGV4dGVuZHMgU3RvcmFnZUtleVR5cGU+KGtleTogUnVudGltZVN0YXRlS2V5PFQ+LCB2YWx1ZTogVCk6IHZvaWQge1xuXHRcdHRoaXMuc3RhdGVDYWNoZS5zZXQoa2V5Lm5hbWUsIHZhbHVlKTtcblx0XHRjb25zdCBpc1plbk1vZGUgPSB0aGlzLmdldFJ1bnRpbWVWYWx1ZShMYXlvdXRTdGF0ZUtleXMuWkVOX01PREVfQUNUSVZFKTtcblxuXHRcdGlmIChrZXkuc2NvcGUgPT09IFN0b3JhZ2VTY29wZS5QUk9GSUxFKSB7XG5cdFx0XHRpZiAoIWlzWmVuTW9kZSB8fCAha2V5Lnplbk1vZGVJZ25vcmUpIHtcblx0XHRcdFx0dGhpcy5zYXZlS2V5VG9TdG9yYWdlPFQ+KGtleSk7XG5cdFx0XHRcdHRoaXMudXBkYXRlTGVnYWN5U2V0dGluZ3NGcm9tU3RhdGUoa2V5LCB2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBpc0FjdGl2aXR5QmFySGlkZGVuKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG9sZFZhbHVlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuIHwgdW5kZWZpbmVkPihXb3JrYmVuY2hMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfVklTSUJMRSk7XG5cdFx0aWYgKG9sZFZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiAhb2xkVmFsdWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoTGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0xPQ0FUSU9OKSAhPT0gQWN0aXZpdHlCYXJQb3NpdGlvbi5ERUZBVUxUO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRSdW50aW1lVmFsdWVBbmRGaXJlPFQgZXh0ZW5kcyBTdG9yYWdlS2V5VHlwZT4oa2V5OiBSdW50aW1lU3RhdGVLZXk8VD4sIHZhbHVlOiBUKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldmlvdXNWYWx1ZSA9IHRoaXMuc3RhdGVDYWNoZS5nZXQoa2V5Lm5hbWUpO1xuXHRcdGlmIChwcmV2aW91c1ZhbHVlID09PSB2YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuc2V0UnVudGltZVZhbHVlKGtleSwgdmFsdWUpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdGUuZmlyZSh7IGtleSwgdmFsdWUgfSk7XG5cdH1cblxuXHRwcml2YXRlIHNhdmVLZXlUb1N0b3JhZ2U8VCBleHRlbmRzIFN0b3JhZ2VLZXlUeXBlPihrZXk6IFdvcmtiZW5jaExheW91dFN0YXRlS2V5PFQ+KTogdm9pZCB7XG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLnN0YXRlQ2FjaGUuZ2V0KGtleS5uYW1lKSBhcyBUO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoYCR7TGF5b3V0U3RhdGVNb2RlbC5TVE9SQUdFX1BSRUZJWH0ke2tleS5uYW1lfWAsIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgPyBKU09OLnN0cmluZ2lmeSh2YWx1ZSkgOiB2YWx1ZSwga2V5LnNjb3BlLCBrZXkudGFyZ2V0KTtcblx0fVxuXG5cdHByaXZhdGUgbG9hZEtleUZyb21TdG9yYWdlPFQgZXh0ZW5kcyBTdG9yYWdlS2V5VHlwZT4oa2V5OiBXb3JrYmVuY2hMYXlvdXRTdGF0ZUtleTxUPik6IFQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoYCR7TGF5b3V0U3RhdGVNb2RlbC5TVE9SQUdFX1BSRUZJWH0ke2tleS5uYW1lfWAsIGtleS5zY29wZSk7XG5cdFx0aWYgKHZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuaXNOZXdba2V5LnNjb3BlXSA9IGZhbHNlOyAvLyByZW1lbWJlciB0aGF0IHdlIGhhZCBwcmV2aW91cyBzdGF0ZSBmb3IgdGhpcyBzY29wZVxuXG5cdFx0XHRzd2l0Y2ggKHR5cGVvZiBrZXkuZGVmYXVsdFZhbHVlKSB7XG5cdFx0XHRcdGNhc2UgJ2Jvb2xlYW4nOiByZXR1cm4gKHZhbHVlID09PSAndHJ1ZScpIGFzIFQ7XG5cdFx0XHRcdGNhc2UgJ251bWJlcic6IHJldHVybiBwYXJzZUludCh2YWx1ZSkgYXMgVDtcblx0XHRcdFx0Y2FzZSAnb2JqZWN0JzogcmV0dXJuIEpTT04ucGFyc2UodmFsdWUpIGFzIFQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHZhbHVlIGFzIFQgfCB1bmRlZmluZWQ7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFlBQVksZUFBZSxpQkFBOEIsb0JBQW9CO0FBQ3RGLFNBQVMsT0FBTyxlQUFlO0FBQy9CLFNBQVMsYUFBYTtBQUN0QixTQUFTLFdBQVcsdUJBQXVCLGVBQWUsTUFBa0IsdUJBQXVCLHdCQUF3QixtQkFBbUIsWUFBWSxpQkFBaUIsa0JBQWtCLFdBQVcsYUFBYSxrQkFBa0IsaUJBQWlCO0FBQ3hQLFNBQVMsdUJBQXVCLGNBQWMsb0JBQW9CO0FBQ2xFLFNBQVMsV0FBVyxTQUFTLGFBQWEsT0FBTyxhQUFhO0FBQzlELFNBQVMseUJBQTBDLHVCQUE0QyxzQkFBc0I7QUFDckgsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxVQUFVLE9BQU8sMkJBQW9ELG9CQUFvQixrQkFBa0IsOEJBQThDLHFCQUFxQixnQkFBeUQsaUJBQWlDLHVCQUF1QiwwQkFBMEIsY0FBYyxtQkFBK0MsZ0NBQWdDO0FBQy9aLFNBQVMsc0JBQXNCLDBCQUEwQixzQkFBc0I7QUFDL0UsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBb0MsdUJBQXVCLG9CQUFvQjtBQUMvRSxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHFCQUFxQjtBQUU5QixTQUFTLGFBQWEseUJBQXlCO0FBQy9DLFNBQVMsc0JBQTZCLG1CQUFtQixtQkFBbUIsaUJBQWlCLDBCQUEwQiwwQkFBMEIsMkJBQTJCLCtCQUErQixlQUFlLG9CQUFvQjtBQUM5TyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDJDQUEyQztBQUNwRCxTQUFTLHNCQUFzQjtBQUMvQixTQUE0Qix1QkFBdUIsa0JBQWtCLGFBQWEsNEJBQTRCO0FBQzlH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O0FBQ3JDLGFBQUssaUJBQW9CLEdBQUc7QUFDNUIsYUFBSyw4QkFBOEIsS0FBSyxLQUFLO0FBQUEsTUFDOUM7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsc0JBQStCO0FBQ3RDLFVBQU0sV0FBVyxLQUFLLHFCQUFxQixTQUE4QiwwREFBNEM7QUFDckgsUUFBSSxhQUFhLFFBQVc7QUFDM0IsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUVBLFdBQU8sS0FBSyxxQkFBcUIsU0FBUyxlQUFlLHFCQUFxQixNQUFNLG9CQUFvQjtBQUFBLEVBQ3pHO0FBQUEsRUFFUSx1QkFBaUQsS0FBeUIsT0FBZ0I7QUFDakcsVUFBTSxnQkFBZ0IsS0FBSyxXQUFXLElBQUksSUFBSSxJQUFJO0FBQ2xELFFBQUksa0JBQWtCLE9BQU87QUFDNUI7QUFBQSxJQUNEO0FBRUEsU0FBSyxnQkFBZ0IsS0FBSyxLQUFLO0FBQy9CLFNBQUssa0JBQWtCLEtBQUssRUFBRSxLQUFLLE1BQU0sQ0FBQztBQUFBLEVBQzNDO0FBQUEsRUFFUSxpQkFBMkMsS0FBdUM7QUFDekYsVUFBTSxRQUFRLEtBQUssV0FBVyxJQUFJLElBQUksSUFBSTtBQUMxQyxTQUFLLGVBQWUsTUFBTSxHQUFHLGtCQUFpQixjQUFjLEdBQUcsSUFBSSxJQUFJLElBQUksT0FBTyxVQUFVLFdBQVcsS0FBSyxVQUFVLEtBQUssSUFBSSxPQUFPLElBQUksT0FBTyxJQUFJLE1BQU07QUFBQSxFQUM1SjtBQUFBLEVBRVEsbUJBQTZDLEtBQWdEO0FBQ3BHLFVBQU0sUUFBUSxLQUFLLGVBQWUsSUFBSSxHQUFHLGtCQUFpQixjQUFjLEdBQUcsSUFBSSxJQUFJLElBQUksSUFBSSxLQUFLO0FBQ2hHLFFBQUksVUFBVSxRQUFXO0FBQ3hCLFdBQUssTUFBTSxJQUFJLEtBQUssSUFBSTtBQUV4QixjQUFRLE9BQU8sSUFBSSxjQUFjO0FBQUEsUUFDaEMsS0FBSztBQUFXLGlCQUFRLFVBQVU7QUFBQSxRQUNsQyxLQUFLO0FBQVUsaUJBQU8sU0FBUyxLQUFLO0FBQUEsUUFDcEMsS0FBSztBQUFVLGlCQUFPLEtBQUssTUFBTSxLQUFLO0FBQUEsTUFDdkM7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQWxUTSxrQkFFVyxpQkFBaUI7QUFGbEMsSUFBTSxtQkFBTjsiLAogICJuYW1lcyI6IFsiTGF5b3V0Q2xhc3NlcyIsICJlZGl0b3JzIiwgImkiLCAic2l6ZSIsICJXb3JrYmVuY2hMYXlvdXRTZXR0aW5ncyIsICJMZWdhY3lXb3JrYmVuY2hMYXlvdXRTZXR0aW5ncyIsICJjb25maWd1cmF0aW9uIiwgImtleSJdCn0K
