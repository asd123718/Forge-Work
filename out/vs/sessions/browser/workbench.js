import "../../workbench/browser/style.js";
import "./media/style.css";
import "./media/workbench.css";
import "./media/phoneLayout.css";
import { Disposable, DisposableStore, toDisposable } from "../../base/common/lifecycle.js";
import { Emitter, Event, setGlobalLeakWarningThreshold } from "../../base/common/event.js";
import { addDisposableGenericMouseDownListener, addDisposableListener, EventType, getActiveDocument, getActiveElement, getClientArea, getWindowId, getWindows, isAncestorUsingFlowTo, isHTMLElement, size, Dimension, runWhenWindowIdle } from "../../base/browser/dom.js";
import { DeferredPromise, RunOnceScheduler } from "../../base/common/async.js";
import { isFullscreen, onDidChangeFullscreen, isChrome, isFirefox, isSafari } from "../../base/browser/browser.js";
import { mark } from "../../base/common/performance.js";
import { onUnexpectedError, setUnexpectedErrorHandler } from "../../base/common/errors.js";
import { isWindows, isLinux, isWeb, isNative, isMacintosh } from "../../base/common/platform.js";
import { Parts, Position, IWorkbenchLayoutService, positionToString } from "../../workbench/services/layout/browser/layoutService.js";
import { Part } from "../../workbench/browser/part.js";
import { Orientation, SerializableGrid } from "../../base/browser/ui/grid/grid.js";
import { IEditorGroupsService } from "../../workbench/services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../workbench/services/editor/common/editorService.js";
import { IPaneCompositePartService } from "../../workbench/services/panecomposite/browser/panecomposite.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../workbench/common/views.js";
import { IInstantiationService, refineServiceDecorator } from "../../platform/instantiation/common/instantiation.js";
import { ITitleService } from "../../workbench/services/title/browser/titleService.js";
import { mainWindow } from "../../base/browser/window.js";
import { coalesce } from "../../base/common/arrays.js";
import { InstantiationService } from "../../platform/instantiation/common/instantiationService.js";
import { getSingletonServiceDescriptors } from "../../platform/instantiation/common/extensions.js";
import { ILifecycleService, LifecyclePhase } from "../../workbench/services/lifecycle/common/lifecycle.js";
import { IStorageService, WillSaveStateReason, StorageScope, StorageTarget } from "../../platform/storage/common/storage.js";
import { IConfigurationService } from "../../platform/configuration/common/configuration.js";
import { IHostService } from "../../workbench/services/host/browser/host.js";
import { IDialogService } from "../../platform/dialogs/common/dialogs.js";
import { INotificationService } from "../../platform/notification/common/notification.js";
import { IHoverService, WorkbenchHoverDelegate } from "../../platform/hover/browser/hover.js";
import { setHoverDelegateFactory } from "../../base/browser/ui/hover/hoverDelegateFactory.js";
import { setBaseLayerHoverDelegate } from "../../base/browser/ui/hover/hoverDelegate2.js";
import { Registry } from "../../platform/registry/common/platform.js";
import { Extensions as WorkbenchExtensions } from "../../workbench/common/contributions.js";
import { EditorExtensions } from "../../workbench/common/editor.js";
import { alert, setARIAContainer } from "../../base/browser/ui/aria/aria.js";
import { localize } from "../../nls.js";
import { FontMeasurements } from "../../editor/browser/config/fontMeasurements.js";
import { createBareFontInfoFromRawSettings } from "../../editor/common/config/fontInfoFromSettings.js";
import { toErrorMessage } from "../../base/common/errorMessage.js";
import { WorkbenchContextKeysHandler } from "../../workbench/browser/contextkeys.js";
import { PixelRatio } from "../../base/browser/pixelRatio.js";
import { AccessibilityProgressSignalScheduler } from "../../platform/accessibilitySignal/browser/progressAccessibilitySignalScheduler.js";
import { setProgressAccessibilitySignalScheduler } from "../../base/browser/ui/progressbar/progressAccessibilitySignal.js";
import { AccessibleViewRegistry } from "../../platform/accessibility/browser/accessibleViewRegistry.js";
import { NotificationAccessibleView } from "../../workbench/browser/parts/notifications/notificationAccessibleView.js";
import { NotificationsCenter } from "../../workbench/browser/parts/notifications/notificationsCenter.js";
import { NotificationsAlerts } from "../../workbench/browser/parts/notifications/notificationsAlerts.js";
import { NotificationsStatus } from "../../workbench/browser/parts/notifications/notificationsStatus.js";
import { registerNotificationCommands } from "../../workbench/browser/parts/notifications/notificationsCommands.js";
import { CommandsRegistry } from "../../platform/commands/common/commands.js";
import { NotificationsToasts } from "../../workbench/browser/parts/notifications/notificationsToasts.js";
import { IMarkdownRendererService } from "../../platform/markdown/browser/markdownRenderer.js";
import { EditorMarkdownCodeBlockRenderer } from "../../editor/browser/widget/markdownRenderer/browser/editorMarkdownCodeBlockRenderer.js";
import { SyncDescriptor } from "../../platform/instantiation/common/descriptors.js";
import { TitleService } from "./parts/titlebarPart.js";
import { EDITOR_PART_DEFAULT_WIDTH, EDITOR_PART_MINIMUM_WIDTH } from "./parts/editorPartSizing.js";
import { IContextKeyService } from "../../platform/contextkey/common/contextkey.js";
import { CustomViewVisibleContext, EditorMaximizedContext, IsPhoneLayoutContext, SinglePaneLayoutEnabledContext } from "../common/contextkeys.js";
import {
  NotificationsPosition,
  NotificationsSettings,
  getNotificationsPosition
} from "../../workbench/common/notifications.js";
import { SessionsLayoutPolicy } from "./layoutPolicy.js";
import { AGENTS_PART_CARD_CLASS } from "./parts/agentsPartCard.js";
import { MobileNavigationStack } from "./mobileNavigationStack.js";
import { MobileTitlebarPart } from "./parts/mobile/mobileTitlebarPart.js";
import { IMobileVisualViewport } from "./parts/mobile/mobileVisualViewport.js";
import { autorun } from "../../base/common/observable.js";
import { ISessionsService } from "../services/sessions/browser/sessionsService.js";
import { ISessionsPartService } from "../services/sessions/browser/sessionsPartService.js";
import { ICustomViewService } from "../services/customView/browser/customViewService.js";
import { ICustomViewGridPartService } from "../services/customView/browser/customViewGridPartService.js";
import { ISessionsSetUpService } from "./sessionsSetUpService.js";
import { AGENTS_FLOATING_PANEL_GAP } from "../common/layoutConstants.js";
var LayoutClasses = /* @__PURE__ */ ((LayoutClasses2) => {
  LayoutClasses2["MODERN_UI_TABS"] = "modern-ui-tabs";
  LayoutClasses2["SIDEBAR_HIDDEN"] = "nosidebar";
  LayoutClasses2["MAIN_EDITOR_AREA_HIDDEN"] = "nomaineditorarea";
  LayoutClasses2["PANEL_HIDDEN"] = "nopanel";
  LayoutClasses2["AUXILIARYBAR_HIDDEN"] = "noauxiliarybar";
  LayoutClasses2["EDITOR_PANE_HIDDEN"] = "noeditorpane";
  LayoutClasses2["SESSIONS_HIDDEN"] = "nosessionspart";
  LayoutClasses2["CUSTOM_VIEW_GRID_HIDDEN"] = "nocustomviewgrid";
  LayoutClasses2["STATUSBAR_HIDDEN"] = "nostatusbar";
  LayoutClasses2["SHELL_GRADIENT_BACKGROUND"] = "shell-gradient-background";
  LayoutClasses2["FULLSCREEN"] = "fullscreen";
  LayoutClasses2["MAXIMIZED"] = "maximized";
  LayoutClasses2["PHONE_LAYOUT"] = "phone-layout";
  return LayoutClasses2;
})(LayoutClasses || {});
const IAgentWorkbenchLayoutService = refineServiceDecorator(IWorkbenchLayoutService);
const CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID = "sessions.closeMobileSidebarDrawer";
const _Workbench = class _Workbench extends Disposable {
  //#endregion
  constructor(parent, options, serviceCollection, logService) {
    super();
    this.parent = parent;
    this.options = options;
    this.serviceCollection = serviceCollection;
    this.logService = logService;
    //#region Lifecycle Events
    this._onWillShutdown = this._register(new Emitter());
    this.onWillShutdown = this._onWillShutdown.event;
    this._onDidShutdown = this._register(new Emitter());
    this.onDidShutdown = this._onDidShutdown.event;
    //#endregion
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
    this._onWillToggleSidePane = this._register(new Emitter());
    this.onWillToggleSidePane = this._onWillToggleSidePane.event;
    this._onDidToggleSidePane = this._register(new Emitter());
    this.onDidToggleSidePane = this._onDidToggleSidePane.event;
    this._onDidRevealSidePane = this._register(new Emitter());
    this.onDidRevealSidePane = this._onDidRevealSidePane.event;
    this._onDidChangeNotificationsVisibility = this._register(new Emitter());
    this.onDidChangeNotificationsVisibility = this._onDidChangeNotificationsVisibility.event;
    this._onDidChangeAuxiliaryBarMaximized = this._register(new Emitter());
    this.onDidChangeAuxiliaryBarMaximized = this._onDidChangeAuxiliaryBarMaximized.event;
    this._onDidChangeEditorMaximized = this._register(new Emitter());
    this.onDidChangeEditorMaximized = this._onDidChangeEditorMaximized.event;
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
    //#endregion
    //#region State
    this.parts = /* @__PURE__ */ new Map();
    /** `true` while the editor's current visible state was produced by an explicit user reveal. */
    this._editorRevealedExplicitly = false;
    this.partVisibility = {
      sidebar: true,
      auxiliaryBar: true,
      editor: false,
      panel: false,
      sessions: true,
      customViewGrid: false
    };
    this.mainWindowFullscreen = false;
    this.maximized = /* @__PURE__ */ new Set();
    this.layoutPolicy = this._register(new SessionsLayoutPolicy());
    this.mobileNavStack = this._register(new MobileNavigationStack());
    this.mobileTopBarDisposables = this._register(new DisposableStore());
    this._editorMaximized = false;
    /** Guards the grid updates that show/hide the custom view from feeding back into the desired part visibility. */
    this._applyingCustomViewGridVisibility = false;
    this._restoreAttachedEditorMaximizedOnShow = false;
    this._editorPartAutoVisibilitySuppressionCount = 0;
    this._hasAppliedInitialEditorSplit = false;
    this._restoreSidePaneEditorMaximizedOnShow = false;
    this._defaultSidePaneState = { editor: true, auxiliaryBar: true };
    this.restoredPromise = new DeferredPromise();
    this.whenRestored = this.restoredPromise.p;
    this.restored = false;
    this.openedDefaultEditors = false;
    this._savedPartSizes = {};
    this.previousUnexpectedError = { message: void 0, time: 0 };
    const metaElements = mainWindow.document.head.getElementsByTagName("meta");
    let viewportMeta;
    for (let i = 0; i < metaElements.length; i++) {
      if (metaElements[i].name === "viewport") {
        viewportMeta = metaElements[i];
        break;
      }
    }
    if (viewportMeta && !viewportMeta.content.includes("viewport-fit=")) {
      viewportMeta.content = `${viewportMeta.content}, viewport-fit=cover`;
    }
    mark("code/willStartWorkbench");
    this.registerErrorHandler(logService);
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
    return this.computeContainerOffset();
  }
  get activeContainerOffset() {
    return this.computeContainerOffset();
  }
  computeContainerOffset() {
    let top = 0;
    let quickPickTop = 0;
    if (this.isVisible(Parts.TITLEBAR_PART, mainWindow)) {
      top = this.getPart(Parts.TITLEBAR_PART).maximumHeight;
      quickPickTop = top;
    } else if (this.mobileTopBarElement) {
      top = this.mobileTopBarElement.offsetHeight;
      quickPickTop = top;
    }
    return { top, quickPickTop };
  }
  /** `false` for the classic/mobile layout; {@link SinglePaneWorkbench} overrides to `true`. */
  get isSinglePaneLayoutEnabled() {
    return false;
  }
  //#region Error Handling
  registerErrorHandler(logService) {
    if (!isFirefox) {
      Error.stackTraceLimit = 100;
    }
    mainWindow.addEventListener("unhandledrejection", (event) => {
      onUnexpectedError(event.reason);
      event.preventDefault();
    });
    setUnexpectedErrorHandler((error) => this.handleUnexpectedError(error, logService));
  }
  handleUnexpectedError(error, logService) {
    const message = toErrorMessage(error, true);
    if (!message) {
      return;
    }
    const now = Date.now();
    if (message === this.previousUnexpectedError.message && now - this.previousUnexpectedError.time <= 1e3) {
      return;
    }
    this.previousUnexpectedError.time = now;
    this.previousUnexpectedError.message = message;
    logService.error(message);
  }
  //#endregion
  //#region Startup
  startup() {
    try {
      this._register(setGlobalLeakWarningThreshold(175));
      const instantiationService = this.initServices(this.serviceCollection);
      instantiationService.invokeFunction((accessor) => {
        const lifecycleService = accessor.get(ILifecycleService);
        const storageService = accessor.get(IStorageService);
        const configurationService = accessor.get(IConfigurationService);
        const hostService = accessor.get(IHostService);
        const hoverService = accessor.get(IHoverService);
        const dialogService = accessor.get(IDialogService);
        const notificationService = accessor.get(INotificationService);
        const markdownRendererService = accessor.get(IMarkdownRendererService);
        if (isWeb && typeof configurationService.acquireInstantiationService === "function") {
          configurationService.acquireInstantiationService(instantiationService);
        }
        markdownRendererService.setDefaultCodeBlockRenderer(instantiationService.createInstance(EditorMarkdownCodeBlockRenderer));
        setHoverDelegateFactory((placement, enableInstantHover) => instantiationService.createInstance(WorkbenchHoverDelegate, placement, { instantHover: enableInstantHover }, {}));
        setBaseLayerHoverDelegate(hoverService);
        this.initLayout(accessor);
        Registry.as(WorkbenchExtensions.Workbench).start(accessor);
        Registry.as(EditorExtensions.EditorFactory).start(accessor);
        this._register(instantiationService.createInstance(WorkbenchContextKeysHandler));
        const editorMaximizedContext = EditorMaximizedContext.bindTo(accessor.get(IContextKeyService));
        this._register(this.onDidChangeEditorMaximized(() => {
          editorMaximizedContext.set(this.isEditorMaximized());
        }));
        const contextKeyService = accessor.get(IContextKeyService);
        const isPhoneLayoutCtx = IsPhoneLayoutContext.bindTo(contextKeyService);
        this._register(autorun((reader) => {
          isPhoneLayoutCtx.set(this.layoutPolicy.viewportClass.read(reader) === "phone");
        }));
        SinglePaneLayoutEnabledContext.bindTo(contextKeyService).set(this.isSinglePaneLayoutEnabled);
        accessor.get(IMobileVisualViewport);
        this.registerListeners(lifecycleService, storageService, configurationService, hostService, dialogService);
        this.renderWorkbench(instantiationService, notificationService, storageService, configurationService);
        this.createWorkbenchLayout();
        if (this.layoutPolicy.viewportClass.get() === "phone") {
          this.createMobileTitlebar();
        }
        this.createWorkbenchManagement(instantiationService);
        this.layout();
        this.restore(lifecycleService);
      });
      return instantiationService;
    } catch (error) {
      onUnexpectedError(error);
      throw error;
    }
  }
  initServices(serviceCollection) {
    serviceCollection.set(IAgentWorkbenchLayoutService, this);
    serviceCollection.set(ITitleService, new SyncDescriptor(TitleService, []));
    const contributedServices = getSingletonServiceDescriptors();
    for (const [id, descriptor] of contributedServices) {
      serviceCollection.set(id, descriptor);
    }
    const instantiationService = new InstantiationService(serviceCollection, true);
    instantiationService.invokeFunction((accessor) => {
      const lifecycleService = accessor.get(ILifecycleService);
      lifecycleService.phase = LifecyclePhase.Ready;
    });
    return instantiationService;
  }
  registerListeners(lifecycleService, storageService, configurationService, hostService, dialogService) {
    this._register(CommandsRegistry.registerCommand(CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID, () => {
      if (this.layoutPolicy.viewportClass.get() === "phone") {
        this.closeMobileSidebarDrawer();
      }
    }));
    this._register(configurationService.onDidChangeConfiguration((e) => this.updateFontAliasing(e, configurationService)));
    if (isNative) {
      this._register(storageService.onWillSaveState((e) => {
        if (e.reason === WillSaveStateReason.SHUTDOWN) {
          this.storeFontInfo(storageService);
        }
      }));
    } else {
      this._register(lifecycleService.onWillShutdown(() => this.storeFontInfo(storageService)));
    }
    this._register(storageService.onWillSaveState(() => this._savePartSizes()));
    this._register(lifecycleService.onWillShutdown((event) => this._onWillShutdown.fire(event)));
    this._register(lifecycleService.onDidShutdown(() => {
      this._onDidShutdown.fire();
      this.dispose();
    }));
    this._register(hostService.onDidChangeFocus((focus) => {
      if (!focus) {
        storageService.flush();
      }
    }));
    this._register(dialogService.onWillShowDialog(() => this.mainContainer.classList.add("modal-dialog-visible")));
    this._register(dialogService.onDidShowDialog(() => this.mainContainer.classList.remove("modal-dialog-visible")));
  }
  updateFontAliasing(e, configurationService) {
    if (!isMacintosh) {
      return;
    }
    if (e && !e.affectsConfiguration("workbench.fontAliasing")) {
      return;
    }
    const aliasing = configurationService.getValue("workbench.fontAliasing");
    if (this.fontAliasing === aliasing) {
      return;
    }
    this.fontAliasing = aliasing;
    const fontAliasingValues = ["antialiased", "none", "auto"];
    this.mainContainer.classList.remove(...fontAliasingValues.map((value) => `monaco-font-aliasing-${value}`));
    if (fontAliasingValues.some((option) => option === aliasing)) {
      this.mainContainer.classList.add(`monaco-font-aliasing-${aliasing}`);
    }
  }
  restoreFontInfo(storageService, configurationService) {
    const storedFontInfoRaw = storageService.get("editorFontInfo", StorageScope.APPLICATION);
    if (storedFontInfoRaw) {
      try {
        const storedFontInfo = JSON.parse(storedFontInfoRaw);
        if (Array.isArray(storedFontInfo)) {
          FontMeasurements.restoreFontInfo(mainWindow, storedFontInfo);
        }
      } catch (err) {
      }
    }
    FontMeasurements.readFontInfo(mainWindow, createBareFontInfoFromRawSettings(configurationService.getValue("editor"), PixelRatio.getInstance(mainWindow).value));
  }
  storeFontInfo(storageService) {
    const serializedFontInfo = FontMeasurements.serializeFontInfo(mainWindow);
    if (serializedFontInfo) {
      storageService.store("editorFontInfo", JSON.stringify(serializedFontInfo), StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
  }
  _loadPartVisibility(storageService) {
    if (this.layoutPolicy.viewportClass.get() === "phone") {
      return {};
    }
    const raw = storageService.get(_Workbench._PART_VISIBILITY_KEY, StorageScope.WORKSPACE);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        storageService.remove(_Workbench._PART_VISIBILITY_KEY, StorageScope.WORKSPACE);
      }
    }
    return {};
  }
  /**
   * Overlays the persisted part visibility on top of the current
   * (layout-policy default) `partVisibility` state. Must run before the
   * `WorkbenchContextKeysHandler` reads the initial visibility so that
   * context keys like `auxiliaryBarVisible` reflect the restored state on
   * reload rather than the hardcoded defaults.
   */
  _applyPersistedPartVisibility() {
    const savedPartVisibility = this._loadPartVisibility(this.storageService);
    this.partVisibility.editor = savedPartVisibility.editor ?? this.partVisibility.editor;
    this.partVisibility.auxiliaryBar = savedPartVisibility.auxiliaryBar ?? this.partVisibility.auxiliaryBar;
    this.partVisibility.sidebar = savedPartVisibility.sidebar ?? this.partVisibility.sidebar;
  }
  _savePartVisibility() {
    if (this.layoutPolicy.viewportClass.get() === "phone") {
      return;
    }
    this.storageService.store(_Workbench._PART_VISIBILITY_KEY, JSON.stringify({
      editor: this.partVisibility.editor,
      auxiliaryBar: this.partVisibility.auxiliaryBar,
      sidebar: this.partVisibility.sidebar
    }), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  _loadPartSizes(storageService) {
    const raw = storageService.get(_Workbench._PART_SIZES_KEY, StorageScope.WORKSPACE);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        storageService.remove(_Workbench._PART_SIZES_KEY, StorageScope.WORKSPACE);
      }
    }
    return {};
  }
  _savePartSizes() {
    if (!this.workbenchGrid) {
      return;
    }
    const editorNodeVisible = this._editorNodeShouldBeVisible();
    const editorGridWidth = this._persistedGridViewSize(this.editorPartView, "width", editorNodeVisible);
    let editorWidth = this._persistedEditorWidth(editorGridWidth);
    if (editorWidth === void 0 || editorWidth < EDITOR_PART_MINIMUM_WIDTH) {
      editorWidth = this._savedPartSizes.editor !== void 0 && this._savedPartSizes.editor >= EDITOR_PART_MINIMUM_WIDTH ? this._savedPartSizes.editor : void 0;
    } else {
      this._savedPartSizes = { ...this._savedPartSizes, editor: editorWidth };
    }
    const sizes = {
      sidebar: this._persistedGridViewSize(this.sideBarPartView, "width", this.partVisibility.sidebar),
      auxiliaryBar: this._persistedGridViewSize(this.auxiliaryBarPartView, "width", this._effectiveVisible(Parts.AUXILIARYBAR_PART)),
      sessions: this._persistedGridViewSize(this.sessionsPartView, "width", this._effectiveVisible(Parts.SESSIONS_PART)),
      editor: editorWidth,
      panel: this._persistedGridViewSize(this.panelPartView, "height", this._effectiveVisible(Parts.PANEL_PART))
    };
    this.storageService.store(_Workbench._PART_SIZES_KEY, JSON.stringify(sizes), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  //#endregion
  renderWorkbench(instantiationService, notificationService, storageService, configurationService) {
    setARIAContainer(this.mainContainer);
    setProgressAccessibilitySignalScheduler((msDelayTime, msLoopTime) => instantiationService.createInstance(AccessibilityProgressSignalScheduler, msDelayTime, msLoopTime));
    const initialDimension = getClientArea(this.parent);
    this.layoutPolicy.update(initialDimension.width, initialDimension.height);
    const visibilityDefaults = this.layoutPolicy.getPartVisibilityDefaults();
    this.partVisibility.sidebar = visibilityDefaults.sidebar;
    this.partVisibility.auxiliaryBar = visibilityDefaults.auxiliaryBar;
    this.partVisibility.panel = visibilityDefaults.panel;
    this.partVisibility.sessions = visibilityDefaults.sessions;
    this.partVisibility.editor = visibilityDefaults.editor;
    this._applyPersistedPartVisibility();
    this._savedPartSizes = this._loadPartSizes(storageService);
    if (this._savedPartSizes.auxiliaryBar !== void 0) {
      this._restoreAuxiliaryBarWidth(this._savedPartSizes.auxiliaryBar);
    }
    const platformClass = isWindows ? "windows" : isLinux ? "linux" : "mac";
    const workbenchClasses = coalesce([
      "monaco-workbench",
      "agent-sessions-workbench",
      "modern-ui-tabs" /* MODERN_UI_TABS */,
      // LayoutClasses.SHELL_GRADIENT_BACKGROUND,
      platformClass,
      isWeb ? "web" : void 0,
      isChrome ? "chromium" : isFirefox ? "firefox" : isSafari ? "safari" : void 0,
      ...this.getLayoutClasses(),
      ...this.options?.extraClasses ? this.options.extraClasses : []
    ]);
    this.mainContainer.classList.add(...workbenchClasses);
    this.updateFontAliasing(void 0, configurationService);
    this.restoreFontInfo(storageService, configurationService);
    for (const { id, role, classes } of [
      { id: Parts.TITLEBAR_PART, role: "none", classes: ["titlebar"] },
      { id: Parts.SIDEBAR_PART, role: "none", classes: ["sidebar", "left"] },
      { id: Parts.AUXILIARYBAR_PART, role: "none", classes: ["auxiliarybar", "basepanel", "right"] },
      { id: Parts.PANEL_PART, role: "none", classes: ["panel", "basepanel", positionToString(this.getPanelPosition())] }
    ]) {
      const partContainer = this.createPartContainer(id, role, classes);
      mark(`code/willCreatePart/${id}`);
      this.getPart(id).create(partContainer);
      mark(`code/didCreatePart/${id}`);
    }
    this.createEditorPart();
    this.createSessionsPart();
    this.createCustomViewGridPart();
    this.createNotificationsHandlers(instantiationService, notificationService, configurationService);
    this.parent.appendChild(this.mainContainer);
  }
  createMobileTitlebar() {
    this.mobileTopBarDisposables.clear();
    const mobileTitlebar = this.mobileTopBarDisposables.add(this.instantiationService.createInstance(MobileTitlebarPart, this.mainContainer));
    this.mobileTopBarElement = mobileTitlebar.element;
    this.mobileTopBarDisposables.add(mobileTitlebar.onDidClickHamburger(() => {
      this.toggleMobileSidebarDrawer();
    }));
    this.mobileTopBarDisposables.add(mobileTitlebar.onDidClickNewSession(() => {
      this.sessionsService.openNewSession();
      this.closeMobileSidebarDrawer();
      this.sessionsPartService.focusSession(this.sessionsService.activeSession.get());
    }));
  }
  toggleMobileSidebarDrawer() {
    const isOpen = this.partVisibility.sidebar;
    if (isOpen) {
      this.closeMobileSidebarDrawer();
    } else {
      this.openMobileSidebarDrawer();
    }
  }
  openMobileSidebarDrawer() {
    if (!this.mobileNavStack.has("sidebar")) {
      this.mobileNavStack.push("sidebar");
    }
    this.setSideBarHidden(false);
  }
  closeMobileSidebarDrawer() {
    this.setSideBarHidden(true);
    if (this.mobileNavStack.has("sidebar")) {
      this.mobileNavStack.popSilently("sidebar");
    }
  }
  createNotificationsHandlers(instantiationService, notificationService, configurationService) {
    const notificationsCenter = this._register(instantiationService.createInstance(NotificationsCenter, this.mainContainer, notificationService.model));
    const notificationsToasts = this._register(instantiationService.createInstance(NotificationsToasts, this.mainContainer, notificationService.model));
    this._register(instantiationService.createInstance(NotificationsAlerts, notificationService.model));
    const notificationsStatus = this._register(instantiationService.createInstance(NotificationsStatus, notificationService.model));
    this._register(notificationsCenter.onDidChangeVisibility(() => {
      notificationsStatus.update(notificationsCenter.isVisible, notificationsToasts.isVisible);
      notificationsToasts.update(notificationsCenter.isVisible);
    }));
    this._register(notificationsToasts.onDidChangeVisibility(() => {
      notificationsStatus.update(notificationsCenter.isVisible, notificationsToasts.isVisible);
    }));
    registerNotificationCommands(notificationsCenter, notificationsToasts, notificationService.model);
    AccessibleViewRegistry.register(new NotificationAccessibleView());
    this.registerSessionsNotificationOffsets(configurationService, notificationsCenter, notificationsToasts);
    this.registerNotifications({
      onDidChangeNotificationsVisibility: Event.map(
        Event.any(notificationsToasts.onDidChangeVisibility, notificationsCenter.onDidChangeVisibility),
        () => notificationsToasts.isVisible || notificationsCenter.isVisible
      )
    });
  }
  registerSessionsNotificationOffsets(configurationService, notificationsCenter, notificationsToasts) {
    const applySessionsNotificationOffsets = () => {
      const position = getNotificationsPosition(configurationService);
      const notificationsCenterContainer = this.getWorkbenchChildByClassName("notifications-center");
      const notificationsToastsContainer = this.getWorkbenchChildByClassName("notifications-toasts");
      if (position === NotificationsPosition.TOP_RIGHT) {
        notificationsCenterContainer?.style.setProperty("top", "40px");
        notificationsToastsContainer?.style.setProperty("top", "40px");
      }
    };
    this._register(this.onDidLayoutMainContainer(() => applySessionsNotificationOffsets()));
    this._register(notificationsCenter.onDidChangeVisibility(() => applySessionsNotificationOffsets()));
    this._register(notificationsToasts.onDidChangeVisibility(() => applySessionsNotificationOffsets()));
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(NotificationsSettings.NOTIFICATIONS_POSITION)) {
        applySessionsNotificationOffsets();
      }
    }));
  }
  getWorkbenchChildByClassName(className) {
    for (const child of this.mainContainer.children) {
      if (isHTMLElement(child) && child.classList.contains(className)) {
        return child;
      }
    }
    return void 0;
  }
  createPartContainer(id, role, classes) {
    const part = document.createElement("div");
    part.classList.add("part", ...classes);
    part.id = id;
    part.setAttribute("role", role);
    return part;
  }
  createEditorPart() {
    const editorPartContainer = document.createElement("div");
    editorPartContainer.classList.add("part", "editor");
    editorPartContainer.id = Parts.EDITOR_PART;
    editorPartContainer.setAttribute("role", "main");
    this._register(addDisposableListener(editorPartContainer, EventType.FOCUS_IN, () => this._restoreEditorPartOnActivation()));
    this._register(addDisposableGenericMouseDownListener(editorPartContainer, () => this._restoreEditorPartOnActivation()));
    this._editorPartContainer = editorPartContainer;
    mark("code/willCreatePart/workbench.parts.editor");
    this.getPart(Parts.EDITOR_PART).create(editorPartContainer, { restorePreviousState: false });
    mark("code/didCreatePart/workbench.parts.editor");
    this.mainContainer.appendChild(editorPartContainer);
  }
  createSessionsPart() {
    const sessionsPartContainer = document.createElement("div");
    sessionsPartContainer.classList.add("part", "sessionspart", "basepanel", "right", AGENTS_PART_CARD_CLASS);
    sessionsPartContainer.id = Parts.SESSIONS_PART;
    sessionsPartContainer.setAttribute("role", "main");
    this._register(addDisposableListener(sessionsPartContainer, EventType.FOCUS_IN, () => this._restoreSessionsPartOnActivation()));
    this._register(addDisposableGenericMouseDownListener(sessionsPartContainer, () => this._restoreSessionsPartOnActivation()));
    mark(`code/willCreatePart/${Parts.SESSIONS_PART}`);
    this.getPart(Parts.SESSIONS_PART).create(sessionsPartContainer);
    mark(`code/didCreatePart/${Parts.SESSIONS_PART}`);
    this.mainContainer.appendChild(sessionsPartContainer);
  }
  _restoreSessionsPartOnActivation() {
    if (!this.workbenchGrid || !this.isVisible(Parts.EDITOR_PART, mainWindow)) {
      return;
    }
    this._restoreMinimizedPartOnActivation(this.sessionsPartView, this.editorPartView);
  }
  _restoreEditorPartOnActivation() {
    if (!this.workbenchGrid || !this.isVisible(Parts.EDITOR_PART, mainWindow) || !this.isVisible(Parts.SESSIONS_PART)) {
      return;
    }
    this._restoreMinimizedPartOnActivation(this.editorPartView, this.sessionsPartView);
  }
  _restoreMinimizedPartOnActivation(target, sibling) {
    const targetSize = this.workbenchGrid.getViewSize(target);
    if (targetSize.width !== this._minimumPartWidthForActivation(target)) {
      return;
    }
    const siblingSize = this.workbenchGrid.getViewSize(sibling);
    const siblingMinimumWidth = this._minimumPartWidthForActivation(sibling);
    if (siblingSize.width > siblingMinimumWidth) {
      this.workbenchGrid.resizeView(sibling, { width: siblingMinimumWidth, height: siblingSize.height });
    }
  }
  _minimumPartWidthForActivation(view) {
    return view.minimumWidth;
  }
  createCustomViewGridPart() {
    const customViewGridPartContainer = document.createElement("div");
    customViewGridPartContainer.classList.add("part", "customviewgridpart", "basepanel", "right", AGENTS_PART_CARD_CLASS);
    customViewGridPartContainer.id = Parts.CUSTOM_VIEW_GRID_PART;
    customViewGridPartContainer.setAttribute("role", "main");
    mark(`code/willCreatePart/${Parts.CUSTOM_VIEW_GRID_PART}`);
    this.getPart(Parts.CUSTOM_VIEW_GRID_PART).create(customViewGridPartContainer);
    mark(`code/didCreatePart/${Parts.CUSTOM_VIEW_GRID_PART}`);
    this.mainContainer.appendChild(customViewGridPartContainer);
  }
  restore(lifecycleService) {
    mark("code/didStartWorkbench");
    performance.measure("perf: workbench create & restore", "code/didLoadWorkbenchMain", "code/didStartWorkbench");
    this.restoreParts();
    void this.sessionsService.restoreVisibleSessions().catch((e) => {
      this.logService.error("[Workbench] restoreVisibleSessions failed", e);
    });
    lifecycleService.phase = LifecyclePhase.Restored;
    this.setRestored();
    const eventuallyPhaseScheduler = this._register(new RunOnceScheduler(() => {
      this._register(runWhenWindowIdle(mainWindow, () => lifecycleService.phase = LifecyclePhase.Eventually, 2500));
    }, 2500));
    eventuallyPhaseScheduler.schedule();
  }
  restoreParts() {
    const partsToRestore = [
      { location: ViewContainerLocation.Sidebar, visible: this.partVisibility.sidebar },
      { location: ViewContainerLocation.Panel, visible: this.partVisibility.panel },
      { location: ViewContainerLocation.AuxiliaryBar, visible: this.partVisibility.auxiliaryBar }
    ];
    for (const { location, visible } of partsToRestore) {
      if (visible) {
        const defaultViewContainer = this.viewDescriptorService.getDefaultViewContainer(location);
        if (defaultViewContainer) {
          this.paneCompositeService.openPaneComposite(defaultViewContainer.id, location);
        }
      }
    }
  }
  //#endregion
  //#region Initialization
  initLayout(accessor) {
    this.editorGroupService = accessor.get(IEditorGroupsService);
    this.editorService = accessor.get(IEditorService);
    this.paneCompositeService = accessor.get(IPaneCompositePartService);
    this.viewDescriptorService = accessor.get(IViewDescriptorService);
    this.sessionsService = accessor.get(ISessionsService);
    this.sessionsPartService = accessor.get(ISessionsPartService);
    this.customViewService = accessor.get(ICustomViewService);
    this.customViewGridPartService = accessor.get(ICustomViewGridPartService);
    this.instantiationService = accessor.get(IInstantiationService);
    this.storageService = accessor.get(IStorageService);
    accessor.get(ITitleService);
    this.layoutPolicy.setSinglePane(this.isSinglePaneLayoutEnabled);
    this.registerLayoutListeners();
    this._customViewVisibleKey = CustomViewVisibleContext.bindTo(accessor.get(IContextKeyService));
    this._register(autorun((reader) => {
      this._applyCustomViewGridVisibility(this.customViewService.activeCustomView.read(reader));
    }));
    this._register(this.editorService.onWillOpenEditor((e) => this.revealEditorOnOpen(e)));
    this._register(this.editorService.onDidCloseEditor(() => this.handleDidCloseEditor()));
    this._mainContainerDimension = getClientArea(this.parent, new Dimension(800, 600));
    this.layoutPolicy.update(this._mainContainerDimension.width, this._mainContainerDimension.height);
    const visDefaults = this.layoutPolicy.getPartVisibilityDefaults();
    this.partVisibility.sidebar = visDefaults.sidebar;
    this.partVisibility.auxiliaryBar = visDefaults.auxiliaryBar;
    this.partVisibility.panel = visDefaults.panel;
    this.partVisibility.sessions = visDefaults.sessions;
    this.partVisibility.editor = visDefaults.editor;
    this._applyPersistedPartVisibility();
  }
  areAllGroupsInMainPartEmpty() {
    for (const group of this.editorGroupService.mainPart.groups) {
      if (!group.isEmpty) {
        return false;
      }
    }
    return true;
  }
  revealEditorOnOpen(e) {
    if (this._editorPartAutoVisibilitySuppressionCount > 0) {
      return;
    }
    const group = this.editorGroupService.mainPart.groups.find((g) => g.id === e.groupId);
    if (!group) {
      return;
    }
    if (!this.partVisibility.editor) {
      this.setEditorHidden(
        false,
        /* explicit */
        true
      );
      this.restoreAttachedEditorMaximizedState();
    }
  }
  handleDidCloseEditor() {
    if (this._editorPartAutoVisibilitySuppressionCount > 0 || !this.areAllGroupsInMainPartEmpty()) {
      return;
    }
    this._handleAllEditorsClosed();
  }
  suppressEditorPartAutoVisibility() {
    this._editorPartAutoVisibilitySuppressionCount++;
    let disposed = false;
    return toDisposable(() => {
      if (disposed) {
        return;
      }
      disposed = true;
      this._editorPartAutoVisibilitySuppressionCount--;
    });
  }
  rememberAttachedEditorMaximizedState() {
    this._restoreAttachedEditorMaximizedOnShow = this._editorMaximized && this.partVisibility.auxiliaryBar;
  }
  restoreAttachedEditorMaximizedState() {
    const shouldRestore = this._restoreAttachedEditorMaximizedOnShow && this.partVisibility.auxiliaryBar;
    this._restoreAttachedEditorMaximizedOnShow = false;
    if (shouldRestore) {
      this.setEditorMaximized(true);
    }
  }
  //#region Side-pane layout hooks (classic grid defaults; overridden by SinglePaneWorkbench)
  _fireDidChangePartVisibility(partId, visible, source) {
    this._onDidChangePartVisibility.fire({ partId, visible, source });
  }
  _notifyContainerDidLayout() {
    this.handleContainerDidLayout(this.mainContainer, this._mainContainerDimension);
  }
  _setMainEditorAreaHidden(hidden) {
    this.mainContainer.classList.toggle("nomaineditorarea" /* MAIN_EDITOR_AREA_HIDDEN */, hidden);
  }
  /**
   * Handles a change in the editor-part grid view's visibility. In the classic
   * layout the editor part is a standalone grid view, so its view visibility *is*
   * the editor visibility — map it to `setEditorHidden` and raise the part event.
   * Single-pane overrides this: its editor-part grid view also hosts the docked
   * auxiliary bar, so the view can become visible purely to show the detail while
   * the editor content stays hidden; it fires its own editor-part events instead.
   */
  _onEditorPartGridVisibilityChange(visible) {
    this.setEditorHidden(!visible);
    this._onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible });
  }
  isEditorPartAutoVisibilitySuppressed() {
    return this._isEditorPartAutoVisibilitySuppressed;
  }
  get _isEditorPartAutoVisibilitySuppressed() {
    return this._editorPartAutoVisibilitySuppressionCount > 0;
  }
  /** Toggles the container marker class for the side-pane layout. */
  _applyLayoutContainerClass() {
    this.mainContainer.classList.toggle("dock-detail-panel", false);
  }
  /** Width the auxiliary bar occupies when visible (for max-editor-dimension math). */
  _auxiliaryBarLayoutWidth() {
    return this.workbenchGrid ? this.workbenchGrid.getViewSize(this.auxiliaryBarPartView).width : 0;
  }
  _auxiliaryBarViewSize() {
    if (!this.workbenchGrid || !this.auxiliaryBarPartView) {
      return { width: 0, height: 0 };
    }
    return this.workbenchGrid.getViewSize(this.auxiliaryBarPartView);
  }
  _setAuxiliaryBarViewSize(size2) {
    if (this.auxiliaryBarPartView) {
      this.workbenchGrid.resizeView(this.auxiliaryBarPartView, size2);
    }
  }
  _resizeAuxiliaryBarBy(deltaWidth, deltaHeight) {
    if (!this.auxiliaryBarPartView) {
      return;
    }
    const currentSize = this.workbenchGrid.getViewSize(this.auxiliaryBarPartView);
    this.workbenchGrid.resizeView(this.auxiliaryBarPartView, {
      width: currentSize.width + deltaWidth,
      height: currentSize.height + deltaHeight
    });
  }
  _restoreAuxiliaryBarWidth(_width) {
  }
  /**
   * Reads a part's size from the workbench grid for persistence. For visible
   * parts, the current view size; for hidden parts, the grid's cached visible
   * size (the size it had the last time it was shown) so toggling visibility
   * later restores the same dimensions. Overridden by the single-pane layout for
   * its docked auxiliary bar, which is not a grid view.
   */
  _persistedGridViewSize(view, dimension, visible) {
    if (visible) {
      return this.workbenchGrid.getViewSize(view)[dimension];
    }
    return this.workbenchGrid.getViewCachedVisibleSize(view);
  }
  _persistedEditorWidth(editorGridWidth) {
    return editorGridWidth;
  }
  _defaultSideBarSize(policySideBarSize) {
    return policySideBarSize;
  }
  _editorNodeSize(effectiveEditorWidth, _effectiveAuxBarWidth) {
    return effectiveEditorWidth;
  }
  _editorNodeVisible(editorVisible, _auxBarVisible) {
    return editorVisible;
  }
  _topRightSectionChildren(sessionsNode, editorNode, auxiliaryBarNode, customViewGridNode) {
    return [sessionsNode, editorNode, auxiliaryBarNode, customViewGridNode];
  }
  /** Attach any per-layout controllers once the editor part container exists. */
  _attachSidePane() {
  }
  /** Lay out any docked overlay. */
  _layoutSidePane() {
  }
  /** React to a whole-grid change (e.g. a sash drag) after the grid rebuilds. */
  _onGridDidChange() {
  }
  /** React to the editor grid node being resized to `nodeWidth`. */
  _onEditorNodeResized(_nodeWidth) {
  }
  /** Run editor-node work with the reveal-sync suspended (no-op for the grid layout). */
  _runWithEditorResizeSyncSuspended(fn) {
    fn();
  }
  _applyEditorVisibility(hidden) {
    const shouldApplyEvenSplit = !hidden && !this._hasAppliedInitialEditorSplit;
    const mainAreaWidth = this.workbenchGrid.getViewSize(this.sessionsPartView).width;
    this.workbenchGrid.setViewVisible(this.editorPartView, this._editorNodeShouldBeVisible());
    if (shouldApplyEvenSplit) {
      this._hasAppliedInitialEditorSplit = true;
      this._applyEditorSplitSize(mainAreaWidth);
    }
  }
  _onWillHideAuxiliaryBar(_hidden) {
  }
  _applyAuxiliaryBarVisibility(hidden, _source) {
    if (this.workbenchGrid) {
      this.workbenchGrid.setViewVisible(this.auxiliaryBarPartView, this._effectiveVisible(Parts.AUXILIARYBAR_PART));
    }
  }
  _shouldOpenAuxiliaryPaneComposite(_containerId) {
    return true;
  }
  _handleAllEditorsClosed() {
    if (this.partVisibility.editor) {
      this.rememberAttachedEditorMaximizedState();
      this.setEditorHidden(true);
    }
  }
  _prepareSideBarResize(_hidden) {
    return {};
  }
  _applySideBarResize(_hidden, _context) {
  }
  //#endregion
  registerLayoutListeners() {
    this._register(onDidChangeFullscreen((windowId) => {
      if (windowId === getWindowId(mainWindow)) {
        this.mainWindowFullscreen = isFullscreen(mainWindow);
        this.updateFullscreenClass();
        this.layout();
      }
    }));
    const onWindowResize = () => this.layout();
    this._register(addDisposableListener(mainWindow, "resize", onWindowResize));
  }
  updateFullscreenClass() {
    if (this.mainWindowFullscreen) {
      this.mainContainer.classList.add("fullscreen" /* FULLSCREEN */);
    } else {
      this.mainContainer.classList.remove("fullscreen" /* FULLSCREEN */);
    }
  }
  //#endregion
  //#region Workbench Layout Creation
  createWorkbenchLayout() {
    this._applyLayoutContainerClass();
    const titleBar = this.getPart(Parts.TITLEBAR_PART);
    const editorPart = this.getPart(Parts.EDITOR_PART);
    const panelPart = this.getPart(Parts.PANEL_PART);
    const auxiliaryBarPart = this.getPart(Parts.AUXILIARYBAR_PART);
    const sideBar = this.getPart(Parts.SIDEBAR_PART);
    const sessionsPart = this.getPart(Parts.SESSIONS_PART);
    const customViewGridPart = this.getPart(Parts.CUSTOM_VIEW_GRID_PART);
    this.titleBarPartView = titleBar;
    this.sideBarPartView = sideBar;
    this.panelPartView = panelPart;
    this.auxiliaryBarPartView = auxiliaryBarPart;
    this.sessionsPartView = sessionsPart;
    this.customViewGridPartView = customViewGridPart;
    this.editorPartView = editorPart;
    const viewMap = {
      [Parts.TITLEBAR_PART]: this.titleBarPartView,
      [Parts.PANEL_PART]: this.panelPartView,
      [Parts.SIDEBAR_PART]: this.sideBarPartView,
      [Parts.AUXILIARYBAR_PART]: this.auxiliaryBarPartView,
      [Parts.SESSIONS_PART]: this.sessionsPartView,
      [Parts.CUSTOM_VIEW_GRID_PART]: this.customViewGridPartView,
      [Parts.EDITOR_PART]: this.editorPartView
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
    this.workbenchGrid.edgeSnapping = this.mainWindowFullscreen;
    this._register(this.workbenchGrid.onDidChange(() => {
      this._onGridDidChange();
    }));
    this._hasAppliedInitialEditorSplit = this.partVisibility.editor;
    for (const part of [titleBar, panelPart, sideBar, auxiliaryBarPart, sessionsPart, editorPart]) {
      this._register(part.onDidVisibilityChange((visible) => {
        if (this._applyingCustomViewGridVisibility) {
          return;
        }
        if (part === editorPart) {
          this._onEditorPartGridVisibilityChange(visible);
          this.handleContainerDidLayout(this.mainContainer, this._mainContainerDimension);
          return;
        }
        if (part === sideBar) {
          this.setSideBarHidden(!visible);
        } else if (part === panelPart) {
          this.setPanelHidden(!visible);
        } else if (part === auxiliaryBarPart) {
          this.setAuxiliaryBarHidden(!visible);
        } else if (part === sessionsPart) {
          this.setSessionsHidden(!visible);
        }
        this._onDidChangePartVisibility.fire({ partId: part.getId(), visible });
        this.handleContainerDidLayout(this.mainContainer, this._mainContainerDimension);
      }));
    }
    this._register(this.mobileNavStack.onDidPop((layer) => {
      switch (layer) {
        case "sidebar":
          this.closeMobileSidebarDrawer();
          break;
        case "panel":
          this.setPanelHidden(true);
          break;
        case "auxbar":
          this.setAuxiliaryBarHidden(true);
          break;
        case "customView":
          this.customViewService.hideCustomView();
          break;
        case "editor":
          break;
      }
    }));
  }
  createWorkbenchManagement(instantiationService) {
    instantiationService.invokeFunction((accessor) => accessor.get(ISessionsSetUpService));
  }
  /**
   * Creates the grid descriptor for the Agent Sessions layout.
   *
   * Structure (horizontal orientation):
   * - Sidebar (left, spans full height from top to bottom)
   * - Right section (vertical):
   *   - Titlebar (top of right section)
   *   - Top right (horizontal): Chat Bar | Editor | Auxiliary Bar
   *   - Panel (below chat, editor, and auxiliary bar)
   */
  createGridDescriptor() {
    const { width, height } = this._mainContainerDimension;
    return this.createDesktopGridDescriptor(width, height);
  }
  /**
   * Standard multi-part layout for all viewport classes.
   * On phone, the titlebar is hidden via CSS and a MobileTitlebarPart
   * is prepended before the grid. Sidebar/panel/auxbar are hidden
   * in the grid via partVisibility defaults.
   */
  createDesktopGridDescriptor(width, height) {
    const sizes = this.layoutPolicy.getPartSizes(width, height);
    const defaultSideBarSize = this._defaultSideBarSize(sizes.sideBarSize);
    const sideBarSize = this._savedPartSizes.sidebar ?? (this.partVisibility.sidebar ? defaultSideBarSize : Math.max(defaultSideBarSize, 250));
    const defaultAuxiliaryBarSize = this.isSinglePaneLayoutEnabled ? this.getDockedAuxiliaryBarWidth() : sizes.auxiliaryBarSize;
    const auxiliaryBarSize = this._savedPartSizes.auxiliaryBar ?? (this.partVisibility.auxiliaryBar ? defaultAuxiliaryBarSize : Math.max(defaultAuxiliaryBarSize, 300));
    const panelSize = this._savedPartSizes.panel ?? (this.partVisibility.panel ? sizes.panelSize : Math.max(sizes.panelSize, 250));
    const savedEditorWidth = this._savedPartSizes.editor;
    const editorSize = savedEditorWidth !== void 0 && savedEditorWidth >= EDITOR_PART_MINIMUM_WIDTH ? savedEditorWidth : EDITOR_PART_DEFAULT_WIDTH;
    const titleBarHeight = this.titleBarPartView?.minimumHeight ?? 30;
    const effectiveSideBarWidth = this.partVisibility.sidebar ? sideBarSize : 0;
    const rightSectionWidth = Math.max(0, width - effectiveSideBarWidth);
    const effectiveAuxBarWidth = this.partVisibility.auxiliaryBar ? auxiliaryBarSize : 0;
    const effectiveEditorWidth = this.partVisibility.editor ? editorSize : 0;
    const sessionsWidth = this._savedPartSizes.sessions ?? Math.max(0, rightSectionWidth - effectiveAuxBarWidth - effectiveEditorWidth);
    const contentHeight = Math.max(0, height - titleBarHeight);
    const topRightHeight = Math.max(0, contentHeight - panelSize);
    const isPhone = this.layoutPolicy.viewportClass.get() === "phone";
    const titleBarNode = {
      type: "leaf",
      data: { type: Parts.TITLEBAR_PART },
      size: titleBarHeight,
      visible: !isPhone
    };
    const sideBarNode = {
      type: "leaf",
      data: { type: Parts.SIDEBAR_PART },
      size: sideBarSize,
      visible: this.partVisibility.sidebar
    };
    const sessionsNode = {
      type: "leaf",
      data: { type: Parts.SESSIONS_PART },
      size: sessionsWidth,
      visible: this._effectiveVisible(Parts.SESSIONS_PART)
    };
    const customViewGridNode = {
      type: "leaf",
      data: { type: Parts.CUSTOM_VIEW_GRID_PART },
      size: rightSectionWidth,
      visible: this.partVisibility.customViewGrid
    };
    const editorNode = {
      type: "leaf",
      data: { type: Parts.EDITOR_PART },
      size: this._editorNodeSize(effectiveEditorWidth, effectiveAuxBarWidth),
      visible: this._editorNodeShouldBeVisible()
    };
    const auxiliaryBarNode = {
      type: "leaf",
      data: { type: Parts.AUXILIARYBAR_PART },
      size: auxiliaryBarSize,
      visible: this._effectiveVisible(Parts.AUXILIARYBAR_PART)
    };
    const panelNode = {
      type: "leaf",
      data: { type: Parts.PANEL_PART },
      size: panelSize,
      visible: this._effectiveVisible(Parts.PANEL_PART)
    };
    const topRightSection = {
      type: "branch",
      data: this._topRightSectionChildren(sessionsNode, editorNode, auxiliaryBarNode, customViewGridNode),
      size: topRightHeight
    };
    const rightSection = {
      type: "branch",
      data: [topRightSection, panelNode],
      size: rightSectionWidth
    };
    const contentSection = {
      type: "branch",
      data: [sideBarNode, rightSection],
      size: contentHeight
    };
    const result = {
      root: {
        type: "branch",
        size: width,
        data: [
          titleBarNode,
          contentSection
        ]
      },
      orientation: Orientation.VERTICAL,
      width,
      height
    };
    return result;
  }
  layout() {
    this._mainContainerDimension = getClientArea(
      this.mainWindowFullscreen ? mainWindow.document.body : this.parent
    );
    const previousClass = this._previousViewportClass;
    this.layoutPolicy.update(this._mainContainerDimension.width, this._mainContainerDimension.height);
    const currentClass = this.layoutPolicy.viewportClass.get();
    this.mainContainer.classList.toggle("phone-layout" /* PHONE_LAYOUT */, currentClass === "phone");
    if (previousClass !== void 0 && previousClass !== currentClass) {
      if (currentClass === "phone" && !this.mobileTopBarElement) {
        this.createMobileTitlebar();
        this.workbenchGrid.setViewVisible(this.titleBarPartView, false);
        const defaults = this.layoutPolicy.getPartVisibilityDefaults();
        if (this.partVisibility.sidebar !== defaults.sidebar) {
          this.setSideBarHidden(!defaults.sidebar);
        }
        if (this.partVisibility.auxiliaryBar !== defaults.auxiliaryBar) {
          this.setAuxiliaryBarHidden(!defaults.auxiliaryBar);
        }
        if (this.partVisibility.panel !== defaults.panel) {
          this.setPanelHidden(!defaults.panel);
        }
      } else if (currentClass !== "phone" && this.mobileTopBarElement) {
        this.mobileTopBarDisposables.clear();
        this.mobileTopBarElement = void 0;
        this.workbenchGrid.setViewVisible(this.titleBarPartView, true);
        const defaults = this.layoutPolicy.getPartVisibilityDefaults();
        if (this.partVisibility.sidebar !== defaults.sidebar) {
          this.setSideBarHidden(!defaults.sidebar);
        }
        if (this.partVisibility.sessions !== defaults.sessions) {
          this.setSessionsHidden(!defaults.sessions);
        }
        if (this.partVisibility.auxiliaryBar !== defaults.auxiliaryBar) {
          this.setAuxiliaryBarHidden(!defaults.auxiliaryBar);
        }
        if (this.partVisibility.panel !== defaults.panel) {
          this.setPanelHidden(!defaults.panel);
        }
      }
      for (const partId of [Parts.SESSIONS_PART, Parts.CUSTOM_VIEW_GRID_PART, Parts.SIDEBAR_PART, Parts.AUXILIARYBAR_PART, Parts.PANEL_PART]) {
        this.parts.get(partId)?.updateStyles();
      }
      this._updateMobileCustomViewNavigation();
    }
    this._previousViewportClass = currentClass;
    this.logService.trace(`Workbench#layout, height: ${this._mainContainerDimension.height}, width: ${this._mainContainerDimension.width}`);
    size(this.mainContainer, this._mainContainerDimension.width, this._mainContainerDimension.height);
    this._layoutGrid();
    this._attachSidePane();
    this._layoutSidePane();
    this.layoutMobileSidebar();
    this.handleContainerDidLayout(this.mainContainer, this._mainContainerDimension);
  }
  _layoutGrid() {
    const mobileTopBarHeight = this.mobileTopBarElement?.offsetHeight ?? 0;
    const isPhone = this.layoutPolicy.viewportClass.get() === "phone";
    const gridGutterW = isPhone ? 0 : AGENTS_FLOATING_PANEL_GAP + (this.partVisibility.sidebar ? 0 : AGENTS_FLOATING_PANEL_GAP);
    const gridGutterH = isPhone ? 0 : AGENTS_FLOATING_PANEL_GAP;
    this.workbenchGrid.layout(
      this._mainContainerDimension.width - gridGutterW,
      this._mainContainerDimension.height - mobileTopBarHeight - gridGutterH
    );
  }
  handleDockedEditorPartLayout(nodeWidth) {
    this._onEditorNodeResized(nodeWidth);
  }
  isEditorRevealedExplicitly() {
    return this._editorRevealedExplicitly;
  }
  revealEditorPartExplicitly() {
    this._editorRevealedExplicitly = true;
    this.setEditorHidden(
      false,
      /* explicit */
      true
    );
  }
  getDockedAuxiliaryBarWidth() {
    return 0;
  }
  setDockedAuxiliaryBarWidth(_width) {
  }
  layoutMobileSidebar() {
    const sidebarContainer = this.getContainer(mainWindow, Parts.SIDEBAR_PART);
    const sidebarPart = this.getPart(Parts.SIDEBAR_PART);
    if (!sidebarContainer) {
      return;
    }
    const isPhone = this.layoutPolicy.viewportClass.get() === "phone";
    if (!isPhone || !this.partVisibility.sidebar) {
      sidebarContainer.classList.remove("mobile-overlay-sidebar");
      return;
    }
    sidebarContainer.classList.add("mobile-overlay-sidebar");
    const topBarHeight = this.mobileTopBarElement?.offsetHeight ?? 48;
    const drawerWidth = this._mainContainerDimension.width;
    const drawerHeight = Math.max(0, this._mainContainerDimension.height - topBarHeight);
    sidebarPart.layout(drawerWidth, drawerHeight, topBarHeight, 0);
  }
  handleContainerDidLayout(container, dimension) {
    this._onDidLayoutContainer.fire({ container, dimension });
    if (container === this.mainContainer) {
      this._onDidLayoutMainContainer.fire(dimension);
    }
    if (container === this.activeContainer) {
      this._onDidLayoutActiveContainer.fire(dimension);
    }
  }
  isFloatingPanelsEnabled() {
    return false;
  }
  getLayoutClasses() {
    return coalesce([
      !this.partVisibility.sidebar ? "nosidebar" /* SIDEBAR_HIDDEN */ : void 0,
      !this._effectiveVisible(Parts.EDITOR_PART) ? "nomaineditorarea" /* MAIN_EDITOR_AREA_HIDDEN */ : void 0,
      !this._effectiveVisible(Parts.PANEL_PART) ? "nopanel" /* PANEL_HIDDEN */ : void 0,
      !this._effectiveVisible(Parts.AUXILIARYBAR_PART) ? "noauxiliarybar" /* AUXILIARYBAR_HIDDEN */ : void 0,
      !this.isEditorPaneVisible() ? "noeditorpane" /* EDITOR_PANE_HIDDEN */ : void 0,
      !this._effectiveVisible(Parts.SESSIONS_PART) ? "nosessionspart" /* SESSIONS_HIDDEN */ : void 0,
      !this.partVisibility.customViewGrid ? "nocustomviewgrid" /* CUSTOM_VIEW_GRID_HIDDEN */ : void 0,
      "nostatusbar" /* STATUSBAR_HIDDEN */,
      // agents window never has a status bar
      this.mainWindowFullscreen ? "fullscreen" /* FULLSCREEN */ : void 0,
      this.layoutPolicy.viewportClass.get() === "phone" ? "phone-layout" /* PHONE_LAYOUT */ : void 0
    ]);
  }
  isEditorPaneVisible() {
    return this._effectiveVisible(Parts.EDITOR_PART) || this._effectiveVisible(Parts.AUXILIARYBAR_PART);
  }
  _updateEditorPaneVisibilityClass() {
    this.mainContainer.classList.toggle("noeditorpane" /* EDITOR_PANE_HIDDEN */, !this.isEditorPaneVisible());
  }
  //#endregion
  //#region Part Management
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
  hasFocus(part) {
    const container = this.getContainer(mainWindow, part);
    if (!container) {
      return false;
    }
    const activeElement = getActiveElement();
    if (!activeElement) {
      return false;
    }
    return isAncestorUsingFlowTo(activeElement, container);
  }
  focusPart(part, targetWindow = mainWindow) {
    switch (part) {
      case Parts.EDITOR_PART:
        this.editorGroupService.activeGroup.focus();
        break;
      case Parts.PANEL_PART:
        this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel)?.focus();
        break;
      case Parts.SIDEBAR_PART:
        this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar)?.focus();
        break;
      case Parts.AUXILIARYBAR_PART:
        this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)?.focus();
        break;
      case Parts.SESSIONS_PART:
        this.getPart(Parts.SESSIONS_PART).getContainer()?.focus();
        break;
      case Parts.CUSTOM_VIEW_GRID_PART:
        this.customViewGridPartService.focusActiveView();
        break;
      default: {
        const container = this.getContainer(targetWindow, part);
        container?.focus();
      }
    }
  }
  focus() {
    this.focusPart(Parts.SESSIONS_PART);
  }
  getContainer(targetWindow, part) {
    if (typeof part === "undefined") {
      return this.getContainerFromDocument(targetWindow.document);
    }
    if (targetWindow === mainWindow) {
      return this.parts.get(part)?.getContainer();
    }
    if (part === Parts.EDITOR_PART) {
      const container = this.getContainerFromDocument(targetWindow.document);
      const partCandidate = this.editorGroupService.getPart(container);
      if (partCandidate instanceof Part) {
        return partCandidate.getContainer();
      }
    }
    return void 0;
  }
  whenContainerStylesLoaded(_window) {
    return void 0;
  }
  //#endregion
  //#region Part Visibility
  isActivityBarHidden() {
    return true;
  }
  /** The desired visibility of a part, ignoring any custom view showing over it. */
  _desiredVisible(part) {
    switch (part) {
      case Parts.SESSIONS_PART:
        return this.partVisibility.sessions;
      case Parts.EDITOR_PART:
        return this.partVisibility.editor;
      case Parts.AUXILIARYBAR_PART:
        return this.partVisibility.auxiliaryBar;
      case Parts.PANEL_PART:
        return this.partVisibility.panel;
      default:
        return false;
    }
  }
  /** Whether a part is actually rendered right now. */
  _effectiveVisible(part) {
    return this._desiredVisible(part) && !this.partVisibility.customViewGrid;
  }
  /**
   * Whether the editor grid node should be shown. In the single-pane layout the
   * node also hosts the docked auxiliary bar, so it follows both parts.
   */
  _editorNodeShouldBeVisible() {
    return this._editorNodeVisible(this._effectiveVisible(Parts.EDITOR_PART), this._effectiveVisible(Parts.AUXILIARYBAR_PART));
  }
  isVisible(part, targetWindow) {
    switch (part) {
      case Parts.TITLEBAR_PART:
        return this.layoutPolicy.viewportClass.get() !== "phone";
      case Parts.SIDEBAR_PART:
        return this.partVisibility.sidebar;
      case Parts.AUXILIARYBAR_PART:
      case Parts.EDITOR_PART:
      case Parts.PANEL_PART:
      case Parts.SESSIONS_PART:
        return this._effectiveVisible(part);
      case Parts.CUSTOM_VIEW_GRID_PART:
        return this.partVisibility.customViewGrid;
      case Parts.ACTIVITYBAR_PART:
      case Parts.STATUSBAR_PART:
      case Parts.BANNER_PART:
      default:
        return false;
    }
  }
  setPartHidden(hidden, part) {
    switch (part) {
      case Parts.SIDEBAR_PART:
        this.setSideBarHidden(hidden);
        break;
      case Parts.AUXILIARYBAR_PART:
        this.setAuxiliaryBarHidden(hidden);
        break;
      case Parts.EDITOR_PART:
        this.setEditorHidden(hidden);
        break;
      case Parts.PANEL_PART:
        this.setPanelHidden(hidden);
        break;
      case Parts.SESSIONS_PART:
        this.setSessionsHidden(hidden);
        break;
    }
  }
  toggleSecondarySideBar() {
    if (this.partVisibility.customViewGrid) {
      return;
    }
    const visible = !this.isSecondarySideBarVisible();
    this.setAuxiliaryBarHidden(!visible);
    alert(visible ? localize("auxiliaryBarVisible", "Secondary Side Bar shown") : localize("auxiliaryBarHidden", "Secondary Side Bar hidden"));
  }
  isSecondarySideBarVisible() {
    return this.isVisible(Parts.AUXILIARYBAR_PART);
  }
  isSidePaneVisible() {
    const { editor, auxiliaryBar } = this._getSidePaneState();
    return editor || auxiliaryBar;
  }
  toggleSidePane() {
    const sidePaneHadFocus = this.hasFocus(Parts.EDITOR_PART) || this.hasFocus(Parts.AUXILIARYBAR_PART);
    const stateBeforeToggle = this._getSidePaneState();
    const editorWasMaximized = this.isEditorMaximized();
    this._onWillToggleSidePane.fire();
    try {
      if (editorWasMaximized) {
        this.setEditorMaximized(false);
      }
      const visible2 = !this.isSidePaneVisible();
      if (!visible2) {
        this._restoreSidePaneEditorMaximizedOnShow = editorWasMaximized;
      }
      const suppressEditorPartAutoVisibility = this.suppressEditorPartAutoVisibility();
      try {
        if (visible2) {
          const restore = this._sidePaneStateBeforeHide ?? this._defaultSidePaneState;
          this.setEditorHidden(!restore.editor, false, true);
          this._setAuxiliaryBarHidden(!restore.auxiliaryBar, void 0, true);
        } else {
          this._sidePaneStateBeforeHide = this._getSidePaneState();
          this.setEditorHidden(true);
          this._setAuxiliaryBarHidden(true, void 0, true);
        }
      } finally {
        suppressEditorPartAutoVisibility.dispose();
      }
      if (!stateBeforeToggle.editor && !stateBeforeToggle.auxiliaryBar && this.isSidePaneVisible()) {
        this._onSidePaneRevealed();
      }
      if (visible2) {
        const restoreEditorMaximized = this._restoreSidePaneEditorMaximizedOnShow;
        this._restoreSidePaneEditorMaximizedOnShow = false;
        if (restoreEditorMaximized) {
          this.setEditorMaximized(true);
        }
      }
    } finally {
      this._onDidToggleSidePane.fire({ before: stateBeforeToggle, after: this._getSidePaneState() });
    }
    const visible = this.isSidePaneVisible();
    if (!visible && sidePaneHadFocus) {
      this.focusPart(Parts.SESSIONS_PART);
    }
    return visible;
  }
  hideSidePane() {
    if (this.isSidePaneVisible()) {
      this.toggleSidePane();
    }
  }
  _getSidePaneState() {
    const editor = this.isVisible(Parts.EDITOR_PART, mainWindow);
    const auxiliaryBar = this.isVisible(Parts.AUXILIARYBAR_PART);
    return { editor, auxiliaryBar };
  }
  setSideBarHidden(hidden) {
    if (this.partVisibility.sidebar === !hidden) {
      return;
    }
    const resizeContext = this._prepareSideBarResize(hidden);
    this.partVisibility.sidebar = !hidden;
    this.mainContainer.classList.toggle("nosidebar" /* SIDEBAR_HIDDEN */, hidden);
    this.workbenchGrid.setViewVisible(
      this.sideBarPartView,
      !hidden
    );
    this._applySideBarResize(hidden, resizeContext);
    if (hidden && this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar)) {
      this.paneCompositeService.hideActivePaneComposite(ViewContainerLocation.Sidebar);
    }
    if (!hidden && !this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar)) {
      const viewletToOpen = this.paneCompositeService.getLastActivePaneCompositeId(ViewContainerLocation.Sidebar) ?? this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.Sidebar)?.id;
      if (viewletToOpen) {
        this.paneCompositeService.openPaneComposite(viewletToOpen, ViewContainerLocation.Sidebar);
      }
    }
    this.layoutMobileSidebar();
    this._savePartVisibility();
    this._layoutGrid();
  }
  setAuxiliaryBarHidden(hidden) {
    this._setAuxiliaryBarHidden(hidden);
  }
  setAuxiliaryBarHiddenForResize(hidden) {
    this._setAuxiliaryBarHidden(hidden, "resize");
  }
  _setAuxiliaryBarHidden(hidden, source, skipSidePaneReveal = false) {
    if (this.partVisibility.auxiliaryBar === !hidden) {
      return;
    }
    const sidePaneWasClosed = !this.partVisibility.editor && !this.partVisibility.auxiliaryBar;
    if (hidden) {
      this._restoreAttachedEditorMaximizedOnShow = false;
    }
    this._onWillHideAuxiliaryBar(hidden);
    this.partVisibility.auxiliaryBar = !hidden;
    this.mainContainer.classList.toggle("noauxiliarybar" /* AUXILIARYBAR_HIDDEN */, !this._effectiveVisible(Parts.AUXILIARYBAR_PART));
    this._applyAuxiliaryBarVisibility(hidden, source);
    this._updateEditorPaneVisibilityClass();
    if (hidden && this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)) {
      this.paneCompositeService.hideActivePaneComposite(ViewContainerLocation.AuxiliaryBar);
    }
    if (!hidden && !this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)) {
      const paneCompositeToOpen = this.paneCompositeService.getLastActivePaneCompositeId(ViewContainerLocation.AuxiliaryBar) ?? this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.AuxiliaryBar)?.id;
      if (paneCompositeToOpen && this._shouldOpenAuxiliaryPaneComposite(paneCompositeToOpen)) {
        this.paneCompositeService.openPaneComposite(paneCompositeToOpen, ViewContainerLocation.AuxiliaryBar);
      }
    }
    if (!source) {
      this._savePartVisibility();
    }
    if (!hidden && sidePaneWasClosed && !skipSidePaneReveal) {
      this._onSidePaneRevealed();
    }
  }
  /**
   * Whether the given auxiliary-bar view container currently has content to show
   * (mirrors `IViewsService.isViewContainerActive`: a `hideIfEmpty` container is
   * only active once it has at least one active view descriptor). Used to avoid
   * presenting an empty docked detail panel.
   */
  _isAuxViewContainerActive(containerId) {
    const viewContainer = this.viewDescriptorService.getViewContainerById(containerId);
    if (!viewContainer) {
      return false;
    }
    if (!viewContainer.hideIfEmpty) {
      return true;
    }
    return this.viewDescriptorService.getViewContainerModel(viewContainer).activeViewDescriptors.length > 0;
  }
  setEditorHidden(hidden, explicit = false, skipSidePaneReveal = false) {
    if (this.partVisibility.editor === !hidden) {
      return;
    }
    const sidePaneWasClosed = !this.partVisibility.editor && !this.partVisibility.auxiliaryBar;
    const panelSizeBeforeEditorReveal = !hidden && this.isSinglePaneLayoutEnabled && this._effectiveVisible(Parts.PANEL_PART) ? this.workbenchGrid.getViewSize(this.panelPartView) : void 0;
    this._editorRevealedExplicitly = !hidden && explicit;
    this._runWithEditorResizeSyncSuspended(() => {
      if (hidden && this._editorMaximized) {
        this.setEditorMaximized(false);
      }
      this.partVisibility.editor = !hidden;
      this.mainContainer.classList.toggle("nomaineditorarea" /* MAIN_EDITOR_AREA_HIDDEN */, !this._effectiveVisible(Parts.EDITOR_PART));
      if (this.editorPartView) {
        this._applyEditorVisibility(hidden);
      }
      this._updateEditorPaneVisibilityClass();
      this._savePartVisibility();
    });
    if (panelSizeBeforeEditorReveal) {
      this.workbenchGrid.resizeView(this.panelPartView, panelSizeBeforeEditorReveal);
    }
    if (!hidden && sidePaneWasClosed && !skipSidePaneReveal) {
      this._onSidePaneRevealed();
    }
  }
  /**
   * Fires when the side pane (editor part and/or auxiliary bar) transitions from
   * fully hidden to visible.
   */
  _onSidePaneRevealed() {
    this._onDidRevealSidePane.fire();
  }
  /**
   * Sizes the editor part when it is first revealed from a hidden state, so it
   * opens as a comfortable split with the sessions part rather than at its
   * minimum/restored width. The default grid layout splits the main area evenly;
   * layouts with different sizing (e.g. the single-pane side pane) override this.
   */
  _applyEditorSplitSize(mainAreaWidth) {
    const targetEditorWidth = Math.max(EDITOR_PART_MINIMUM_WIDTH, Math.floor(mainAreaWidth / 2));
    const currentEditorSize = this.workbenchGrid.getViewSize(this.editorPartView);
    this.workbenchGrid.resizeView(this.editorPartView, {
      width: targetEditorWidth,
      height: currentEditorSize.height
    });
  }
  setPanelHidden(hidden) {
    if (this.partVisibility.panel === !hidden) {
      return;
    }
    if (hidden && this.workbenchGrid.hasMaximizedView()) {
      this.workbenchGrid.exitMaximizedView();
    }
    const panelHadFocus = !hidden || this.hasFocus(Parts.PANEL_PART);
    this.partVisibility.panel = !hidden;
    this.mainContainer.classList.toggle("nopanel" /* PANEL_HIDDEN */, !this._effectiveVisible(Parts.PANEL_PART));
    this.workbenchGrid.setViewVisible(
      this.panelPartView,
      this._effectiveVisible(Parts.PANEL_PART)
    );
    if (hidden && this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel)) {
      this.paneCompositeService.hideActivePaneComposite(ViewContainerLocation.Panel);
      if (panelHadFocus) {
        this.focusPart(Parts.SESSIONS_PART);
      }
    }
    if (!hidden) {
      if (!this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel)) {
        const panelToOpen = this.paneCompositeService.getLastActivePaneCompositeId(ViewContainerLocation.Panel) ?? this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.Panel)?.id;
        if (panelToOpen) {
          this.paneCompositeService.openPaneComposite(panelToOpen, ViewContainerLocation.Panel);
        }
      }
      if (this._effectiveVisible(Parts.PANEL_PART)) {
        this.focusPart(Parts.PANEL_PART);
      }
    }
  }
  setSessionsHidden(hidden) {
    if (this.partVisibility.sessions === !hidden) {
      return;
    }
    this.partVisibility.sessions = !hidden;
    this.mainContainer.classList.toggle("nosessionspart" /* SESSIONS_HIDDEN */, !this._effectiveVisible(Parts.SESSIONS_PART));
    this.workbenchGrid.setViewVisible(this.sessionsPartView, this._effectiveVisible(Parts.SESSIONS_PART));
  }
  /**
   * Shows or hides the custom view grid. The custom view grid and the sessions
   * grid are mutually exclusive and exactly one of them owns the row, so hiding
   * the custom view always brings the sessions grid back (together with the side
   * panel and panel state the layout wants for the active session). The parts it
   * covers keep their desired visibility while it is shown, so the restore
   * reflects whatever the layout controller last asked for.
   */
  _applyCustomViewGridVisibility(descriptor) {
    const visible = !!descriptor;
    if (this.partVisibility.customViewGrid === visible) {
      this.customViewGridPartService.setView(descriptor);
      return;
    }
    const wasVisible = _Workbench._CUSTOM_VIEW_EXCLUSIVE_PARTS.map((part) => this._effectiveVisible(part));
    if (visible && this._editorMaximized) {
      this.setEditorMaximized(false);
    }
    this.customViewGridPartService.setView(descriptor);
    this.partVisibility.customViewGrid = visible;
    this._customViewVisibleKey.set(visible);
    if (!this.workbenchGrid) {
      return;
    }
    this._applyingCustomViewGridVisibility = true;
    try {
      this._runWithEditorResizeSyncSuspended(() => {
        if (visible) {
          this.workbenchGrid.setViewVisible(this.customViewGridPartView, true);
          this._applyExclusivePartVisibility();
        } else {
          this._applyExclusivePartVisibility();
          this.workbenchGrid.setViewVisible(this.customViewGridPartView, false);
        }
      });
    } finally {
      this._applyingCustomViewGridVisibility = false;
    }
    this._updateExclusiveLayoutClasses();
    this.mainContainer.classList.toggle("nocustomviewgrid" /* CUSTOM_VIEW_GRID_HIDDEN */, !visible);
    this._updateMobileCustomViewNavigation();
    if (visible) {
      this._fireDidChangePartVisibility(Parts.CUSTOM_VIEW_GRID_PART, true);
    }
    _Workbench._CUSTOM_VIEW_EXCLUSIVE_PARTS.forEach((part, index) => {
      const nowVisible = this._effectiveVisible(part);
      if (nowVisible !== wasVisible[index]) {
        this._fireDidChangePartVisibility(part, nowVisible);
      }
    });
    if (!visible) {
      this._fireDidChangePartVisibility(Parts.CUSTOM_VIEW_GRID_PART, false);
    }
    this.layout();
    if (visible) {
      this.focusPart(Parts.CUSTOM_VIEW_GRID_PART);
    } else {
      this.sessionsPartService.focusSession(this.sessionsService.activeSession.get());
    }
  }
  _applyExclusivePartVisibility() {
    this.workbenchGrid.setViewVisible(this.sessionsPartView, this._effectiveVisible(Parts.SESSIONS_PART));
    this.workbenchGrid.setViewVisible(this.panelPartView, this._effectiveVisible(Parts.PANEL_PART));
    this._applyEditorAreaVisibility();
  }
  /** Pushes the editor and auxiliary bar node visibility into the grid. */
  _applyEditorAreaVisibility() {
    this.workbenchGrid.setViewVisible(this.editorPartView, this._editorNodeShouldBeVisible());
    this.workbenchGrid.setViewVisible(this.auxiliaryBarPartView, this._effectiveVisible(Parts.AUXILIARYBAR_PART));
  }
  _updateExclusiveLayoutClasses() {
    this.mainContainer.classList.toggle("nosessionspart" /* SESSIONS_HIDDEN */, !this._effectiveVisible(Parts.SESSIONS_PART));
    this.mainContainer.classList.toggle("nomaineditorarea" /* MAIN_EDITOR_AREA_HIDDEN */, !this._effectiveVisible(Parts.EDITOR_PART));
    this.mainContainer.classList.toggle("noauxiliarybar" /* AUXILIARYBAR_HIDDEN */, !this._effectiveVisible(Parts.AUXILIARYBAR_PART));
    this.mainContainer.classList.toggle("nopanel" /* PANEL_HIDDEN */, !this._effectiveVisible(Parts.PANEL_PART));
    this._updateEditorPaneVisibilityClass();
  }
  /** Keeps the Android back button in sync with a shown custom view. */
  _updateMobileCustomViewNavigation() {
    const tracked = this.layoutPolicy.viewportClass.get() === "phone" && this.partVisibility.customViewGrid;
    if (tracked === this.mobileNavStack.has("customView")) {
      return;
    }
    if (tracked) {
      this.mobileNavStack.push("customView");
    } else {
      this.mobileNavStack.popSilently("customView");
    }
  }
  //#endregion
  //#region Position Methods (Fixed - Not Configurable)
  getSideBarPosition() {
    return Position.LEFT;
  }
  getPanelPosition() {
    return Position.BOTTOM;
  }
  setPanelPosition(_position) {
  }
  getPanelAlignment() {
    return "justify";
  }
  setPanelAlignment(_alignment) {
  }
  //#endregion
  //#region Size Methods
  getSize(part) {
    if (part === Parts.AUXILIARYBAR_PART) {
      return this._auxiliaryBarViewSize();
    }
    const view = this.getPartView(part);
    if (!view) {
      return { width: 0, height: 0 };
    }
    return this.workbenchGrid.getViewSize(view);
  }
  setSize(part, size2) {
    if (part === Parts.AUXILIARYBAR_PART) {
      this._setAuxiliaryBarViewSize(size2);
      return;
    }
    const view = this.getPartView(part);
    if (view) {
      this.workbenchGrid.resizeView(view, size2);
    }
  }
  resizePart(part, sizeChangeWidth, sizeChangeHeight) {
    if (part === Parts.AUXILIARYBAR_PART) {
      this._resizeAuxiliaryBarBy(sizeChangeWidth, sizeChangeHeight);
      return;
    }
    const view = this.getPartView(part);
    if (!view) {
      return;
    }
    const currentSize = this.workbenchGrid.getViewSize(view);
    this.workbenchGrid.resizeView(view, {
      width: currentSize.width + sizeChangeWidth,
      height: currentSize.height + sizeChangeHeight
    });
  }
  getPartView(part) {
    switch (part) {
      case Parts.TITLEBAR_PART:
        return this.titleBarPartView;
      case Parts.SIDEBAR_PART:
        return this.sideBarPartView;
      case Parts.AUXILIARYBAR_PART:
        return this.auxiliaryBarPartView;
      case Parts.EDITOR_PART:
        return this.editorPartView;
      case Parts.PANEL_PART:
        return this.panelPartView;
      case Parts.SESSIONS_PART:
        return this.sessionsPartView;
      case Parts.CUSTOM_VIEW_GRID_PART:
        return this.customViewGridPartView;
      default:
        return void 0;
    }
  }
  getMaximumEditorDimensions(_container) {
    const sidebarWidth = this.partVisibility.sidebar ? this.workbenchGrid.getViewSize(this.sideBarPartView).width : 0;
    const auxiliaryBarWidth = this.partVisibility.auxiliaryBar ? this._auxiliaryBarLayoutWidth() : 0;
    const panelHeight = this.partVisibility.panel ? this.workbenchGrid.getViewSize(this.panelPartView).height : 0;
    const titleBarHeight = this.workbenchGrid.getViewSize(this.titleBarPartView).height;
    return new Dimension(
      this._mainContainerDimension.width - sidebarWidth - auxiliaryBarWidth,
      this._mainContainerDimension.height - titleBarHeight - panelHeight
    );
  }
  //#endregion
  //#region Unsupported Features (No-ops)
  toggleMaximizedPanel() {
    if (!this.workbenchGrid) {
      return;
    }
    if (this.isPanelMaximized()) {
      this.workbenchGrid.exitMaximizedView();
    } else {
      this.workbenchGrid.maximizeView(this.panelPartView, [this.titleBarPartView, this.sideBarPartView]);
    }
  }
  isPanelMaximized() {
    if (!this.workbenchGrid) {
      return false;
    }
    return this.workbenchGrid.isViewMaximized(this.panelPartView);
  }
  toggleMaximizedAuxiliaryBar() {
  }
  setAuxiliaryBarMaximized(_maximized) {
    return false;
  }
  isAuxiliaryBarMaximized() {
    return false;
  }
  isEditorMaximized() {
    return this._editorMaximized;
  }
  setEditorMaximized(maximized) {
    if (maximized === this._editorMaximized) {
      return;
    }
    if (maximized) {
      this._editorLastNonMaximizedVisibility = {
        sidebar: this.partVisibility.sidebar,
        auxiliaryBar: this.partVisibility.auxiliaryBar,
        editor: this.partVisibility.editor,
        panel: this.partVisibility.panel,
        sessions: this.partVisibility.sessions,
        customViewGrid: this.partVisibility.customViewGrid
      };
      this._editorLastNonMaximizedSize = this.editorPartView ? this.workbenchGrid.getViewSize(this.editorPartView) : void 0;
      if (!this.partVisibility.editor) {
        this.setEditorHidden(false);
      }
      if (this.partVisibility.sidebar) {
        this.setSideBarHidden(true);
      }
      if (this.partVisibility.sessions) {
        this.setSessionsHidden(true);
      }
      this._editorMaximized = true;
    } else {
      const state = this._editorLastNonMaximizedVisibility;
      const size2 = this._editorLastNonMaximizedSize;
      this._editorLastNonMaximizedSize = void 0;
      this.setSideBarHidden(!state?.sidebar);
      this.setSessionsHidden(!state?.sessions);
      this.setAuxiliaryBarHidden(!state?.auxiliaryBar);
      this._editorMaximized = false;
      if (this.editorPartView && size2) {
        this.workbenchGrid.resizeView(this.editorPartView, size2);
      }
      this._layoutSidePane();
    }
    this._onDidChangeEditorMaximized.fire();
  }
  toggleZenMode() {
  }
  toggleMenuBar() {
  }
  isMainEditorLayoutCentered() {
    return false;
  }
  centerMainEditorLayout(_active) {
  }
  hasMainWindowBorder() {
    return false;
  }
  getMainWindowBorderRadius() {
    return void 0;
  }
  //#endregion
  //#region Window Maximized State
  isWindowMaximized(targetWindow) {
    return this.maximized.has(getWindowId(targetWindow));
  }
  updateWindowMaximizedState(targetWindow, maximized) {
    const windowId = getWindowId(targetWindow);
    if (maximized) {
      this.maximized.add(windowId);
      if (targetWindow === mainWindow) {
        this.mainContainer.classList.add("maximized" /* MAXIMIZED */);
      }
    } else {
      this.maximized.delete(windowId);
      if (targetWindow === mainWindow) {
        this.mainContainer.classList.remove("maximized" /* MAXIMIZED */);
      }
    }
    this._onDidChangeWindowMaximized.fire({ windowId, maximized });
  }
  //#endregion
  //#region Neighbor Parts
  getVisibleNeighborPart(part, direction) {
    if (!this.workbenchGrid) {
      return void 0;
    }
    const view = this.getPartView(part);
    if (!view) {
      return void 0;
    }
    const neighbor = this.workbenchGrid.getNeighborViews(view, direction, false);
    if (neighbor.length === 0) {
      return void 0;
    }
    const neighborView = neighbor[0];
    if (neighborView === this.titleBarPartView) {
      return Parts.TITLEBAR_PART;
    }
    if (neighborView === this.sideBarPartView) {
      return Parts.SIDEBAR_PART;
    }
    if (neighborView === this.auxiliaryBarPartView) {
      return Parts.AUXILIARYBAR_PART;
    }
    if (neighborView === this.editorPartView) {
      return Parts.EDITOR_PART;
    }
    if (neighborView === this.panelPartView) {
      return Parts.PANEL_PART;
    }
    if (neighborView === this.sessionsPartView) {
      return Parts.SESSIONS_PART;
    }
    return void 0;
  }
  //#endregion
  //#region Restore
  isRestored() {
    return this.restored;
  }
  setRestored() {
    this.restored = true;
    this.restoredPromise.complete();
  }
  //#endregion
  //#region Notifications Registration
  registerNotifications(delegate) {
    this._register(delegate.onDidChangeNotificationsVisibility((visible) => this._onDidChangeNotificationsVisibility.fire(visible)));
  }
  //#endregion
};
//#endregion
_Workbench._PART_VISIBILITY_KEY = "workbench.sessions.partVisibility";
_Workbench._PART_SIZES_KEY = "workbench.sessions.partSizes";
/**
 * Parts a visible custom view replaces. While the custom view grid is shown
 * these keep their desired (per-session) visibility state but are not
 * rendered, so hiding the custom view restores whatever the layout
 * controller last asked for — including changes made while it was shown.
 */
_Workbench._CUSTOM_VIEW_EXCLUSIVE_PARTS = [
  Parts.SESSIONS_PART,
  Parts.EDITOR_PART,
  Parts.AUXILIARYBAR_PART,
  Parts.PANEL_PART
];
let Workbench = _Workbench;
export {
  CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID,
  IAgentWorkbenchLayoutService,
  Workbench
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcYnJvd3Nlclxcd29ya2JlbmNoLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9zdHlsZS5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvc3R5bGUuY3NzJztcbmltcG9ydCAnLi9tZWRpYS93b3JrYmVuY2guY3NzJztcbmltcG9ydCAnLi9tZWRpYS9waG9uZUxheW91dC5jc3MnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50LCBzZXRHbG9iYWxMZWFrV2FybmluZ1RocmVzaG9sZCB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VEb3duTGlzdGVuZXIsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRXZlbnRUeXBlLCBnZXRBY3RpdmVEb2N1bWVudCwgZ2V0QWN0aXZlRWxlbWVudCwgZ2V0Q2xpZW50QXJlYSwgZ2V0V2luZG93SWQsIGdldFdpbmRvd3MsIElEaW1lbnNpb24sIGlzQW5jZXN0b3JVc2luZ0Zsb3dUbywgaXNIVE1MRWxlbWVudCwgc2l6ZSwgRGltZW5zaW9uLCBydW5XaGVuV2luZG93SWRsZSB9IGZyb20gJy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgaXNGdWxsc2NyZWVuLCBvbkRpZENoYW5nZUZ1bGxzY3JlZW4sIGlzQ2hyb21lLCBpc0ZpcmVmb3gsIGlzU2FmYXJpIH0gZnJvbSAnLi4vLi4vYmFzZS9icm93c2VyL2Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgbWFyayB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3BlcmZvcm1hbmNlLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yLCBzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IGlzV2luZG93cywgaXNMaW51eCwgaXNXZWIsIGlzTmF0aXZlLCBpc01hY2ludG9zaCB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFBhcnRzLCBQb3NpdGlvbiwgUGFuZWxBbGlnbm1lbnQsIElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBTSU5HTEVfV0lORE9XX1BBUlRTLCBNVUxUSV9XSU5ET1dfUEFSVFMsIElQYXJ0VmlzaWJpbGl0eUNoYW5nZUV2ZW50LCBwb3NpdGlvblRvU3RyaW5nIH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxheW91dE9mZnNldEluZm8gfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFBhcnQgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0LmpzJztcbmltcG9ydCB7IERpcmVjdGlvbiwgSVNlcmlhbGl6YWJsZVZpZXcsIElTZXJpYWxpemVkR3JpZCwgSVNlcmlhbGl6ZWRMZWFmTm9kZSwgSVNlcmlhbGl6ZWROb2RlLCBJVmlld1NpemUsIE9yaWVudGF0aW9uLCBTZXJpYWxpemFibGVHcmlkIH0gZnJvbSAnLi4vLi4vYmFzZS9icm93c2VyL3VpL2dyaWQvZ3JpZC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvc2VydmljZXMvcGFuZWNvbXBvc2l0ZS9icm93c2VyL3BhbmVjb21wb3NpdGUuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgcmVmaW5lU2VydmljZURlY29yYXRvciwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVRpdGxlU2VydmljZSB9IGZyb20gJy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy90aXRsZS9icm93c2VyL3RpdGxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93LCBDb2RlV2luZG93IH0gZnJvbSAnLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0U2luZ2xldG9uU2VydmljZURlc2NyaXB0b3JzIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSwgTGlmZWN5Y2xlUGhhc2UsIFdpbGxTaHV0ZG93bkV2ZW50IH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgV2lsbFNhdmVTdGF0ZVJlYXNvbiwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlLCBXb3JrYmVuY2hIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBzZXRIb3ZlckRlbGVnYXRlRmFjdG9yeSB9IGZyb20gJy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBzZXRCYXNlTGF5ZXJIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGUyLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5LCBFZGl0b3JFeHRlbnNpb25zLCBJRWRpdG9yV2lsbE9wZW5FdmVudCB9IGZyb20gJy4uLy4uL3dvcmtiZW5jaC9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IGFsZXJ0LCBzZXRBUklBQ29udGFpbmVyIH0gZnJvbSAnLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBGb250TWVhc3VyZW1lbnRzIH0gZnJvbSAnLi4vLi4vZWRpdG9yL2Jyb3dzZXIvY29uZmlnL2ZvbnRNZWFzdXJlbWVudHMuanMnO1xuaW1wb3J0IHsgY3JlYXRlQmFyZUZvbnRJbmZvRnJvbVJhd1NldHRpbmdzIH0gZnJvbSAnLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZm9udEluZm9Gcm9tU2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoQ29udGV4dEtleXNIYW5kbGVyIH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgUGl4ZWxSYXRpbyB9IGZyb20gJy4uLy4uL2Jhc2UvYnJvd3Nlci9waXhlbFJhdGlvLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlQcm9ncmVzc1NpZ25hbFNjaGVkdWxlciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9wcm9ncmVzc0FjY2Vzc2liaWxpdHlTaWduYWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgc2V0UHJvZ3Jlc3NBY2Nlc3NpYmlsaXR5U2lnbmFsU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vYmFzZS9icm93c2VyL3VpL3Byb2dyZXNzYmFyL3Byb2dyZXNzQWNjZXNzaWJpbGl0eVNpZ25hbC5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmxlVmlld1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3UmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgTm90aWZpY2F0aW9uQWNjZXNzaWJsZVZpZXcgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9ub3RpZmljYXRpb25zL25vdGlmaWNhdGlvbkFjY2Vzc2libGVWaWV3LmpzJztcbmltcG9ydCB7IE5vdGlmaWNhdGlvbnNDZW50ZXIgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9ub3RpZmljYXRpb25zL25vdGlmaWNhdGlvbnNDZW50ZXIuanMnO1xuaW1wb3J0IHsgTm90aWZpY2F0aW9uc0FsZXJ0cyB9IGZyb20gJy4uLy4uL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL25vdGlmaWNhdGlvbnMvbm90aWZpY2F0aW9uc0FsZXJ0cy5qcyc7XG5pbXBvcnQgeyBOb3RpZmljYXRpb25zU3RhdHVzIH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvbm90aWZpY2F0aW9ucy9ub3RpZmljYXRpb25zU3RhdHVzLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyTm90aWZpY2F0aW9uQ29tbWFuZHMgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9ub3RpZmljYXRpb25zL25vdGlmaWNhdGlvbnNDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IE5vdGlmaWNhdGlvbnNUb2FzdHMgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9ub3RpZmljYXRpb25zL25vdGlmaWNhdGlvbnNUb2FzdHMuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IEVkaXRvck1hcmtkb3duQ29kZUJsb2NrUmVuZGVyZXIgfSBmcm9tICcuLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvbWFya2Rvd25SZW5kZXJlci9icm93c2VyL2VkaXRvck1hcmtkb3duQ29kZUJsb2NrUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBUaXRsZVNlcnZpY2UgfSBmcm9tICcuL3BhcnRzL3RpdGxlYmFyUGFydC5qcyc7XG5pbXBvcnQgeyBFRElUT1JfUEFSVF9ERUZBVUxUX1dJRFRILCBFRElUT1JfUEFSVF9NSU5JTVVNX1dJRFRIIH0gZnJvbSAnLi9wYXJ0cy9lZGl0b3JQYXJ0U2l6aW5nLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEN1c3RvbVZpZXdWaXNpYmxlQ29udGV4dCwgRWRpdG9yTWF4aW1pemVkQ29udGV4dCwgSXNQaG9uZUxheW91dENvbnRleHQsIFNpbmdsZVBhbmVMYXlvdXRFbmFibGVkQ29udGV4dCB9IGZyb20gJy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQge1xuXHROb3RpZmljYXRpb25zUG9zaXRpb24sXG5cdE5vdGlmaWNhdGlvbnNTZXR0aW5ncyxcblx0Z2V0Tm90aWZpY2F0aW9uc1Bvc2l0aW9uXG59IGZyb20gJy4uLy4uL3dvcmtiZW5jaC9jb21tb24vbm90aWZpY2F0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uc0xheW91dFBvbGljeSB9IGZyb20gJy4vbGF5b3V0UG9saWN5LmpzJztcbmltcG9ydCB7IEFHRU5UU19QQVJUX0NBUkRfQ0xBU1MgfSBmcm9tICcuL3BhcnRzL2FnZW50c1BhcnRDYXJkLmpzJztcbmltcG9ydCB7IE1vYmlsZU5hdmlnYXRpb25TdGFjayB9IGZyb20gJy4vbW9iaWxlTmF2aWdhdGlvblN0YWNrLmpzJztcbmltcG9ydCB7IE1vYmlsZVRpdGxlYmFyUGFydCB9IGZyb20gJy4vcGFydHMvbW9iaWxlL21vYmlsZVRpdGxlYmFyUGFydC5qcyc7XG5pbXBvcnQgeyBJTW9iaWxlVmlzdWFsVmlld3BvcnQgfSBmcm9tICcuL3BhcnRzL21vYmlsZS9tb2JpbGVWaXN1YWxWaWV3cG9ydC5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUGFydFNlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUGFydFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUN1c3RvbVZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvY3VzdG9tVmlldy9icm93c2VyL2N1c3RvbVZpZXdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDdXN0b21WaWV3R3JpZFBhcnRTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvY3VzdG9tVmlldy9icm93c2VyL2N1c3RvbVZpZXdHcmlkUGFydFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUN1c3RvbVZpZXdEZXNjcmlwdG9yIH0gZnJvbSAnLi4vc2VydmljZXMvY3VzdG9tVmlldy9icm93c2VyL2N1c3RvbVZpZXcuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2V0VXBTZXJ2aWNlIH0gZnJvbSAnLi9zZXNzaW9uc1NldFVwU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBR0VOVFNfRkxPQVRJTkdfUEFORUxfR0FQIH0gZnJvbSAnLi4vY29tbW9uL2xheW91dENvbnN0YW50cy5qcyc7XG5cbi8vI3JlZ2lvbiBXb3JrYmVuY2ggT3B0aW9uc1xuXG5leHBvcnQgaW50ZXJmYWNlIElXb3JrYmVuY2hPcHRpb25zIHtcblx0LyoqXG5cdCAqIEV4dHJhIGNsYXNzZXMgdG8gYmUgYWRkZWQgdG8gdGhlIHdvcmtiZW5jaCBjb250YWluZXIuXG5cdCAqL1xuXHRleHRyYUNsYXNzZXM/OiBzdHJpbmdbXTtcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBMYXlvdXQgQ2xhc3Nlc1xuXG5lbnVtIExheW91dENsYXNzZXMge1xuXHRNT0RFUk5fVUlfVEFCUyA9ICdtb2Rlcm4tdWktdGFicycsXG5cdFNJREVCQVJfSElEREVOID0gJ25vc2lkZWJhcicsXG5cdE1BSU5fRURJVE9SX0FSRUFfSElEREVOID0gJ25vbWFpbmVkaXRvcmFyZWEnLFxuXHRQQU5FTF9ISURERU4gPSAnbm9wYW5lbCcsXG5cdEFVWElMSUFSWUJBUl9ISURERU4gPSAnbm9hdXhpbGlhcnliYXInLFxuXHRFRElUT1JfUEFORV9ISURERU4gPSAnbm9lZGl0b3JwYW5lJyxcblx0U0VTU0lPTlNfSElEREVOID0gJ25vc2Vzc2lvbnNwYXJ0Jyxcblx0Q1VTVE9NX1ZJRVdfR1JJRF9ISURERU4gPSAnbm9jdXN0b212aWV3Z3JpZCcsXG5cdFNUQVRVU0JBUl9ISURERU4gPSAnbm9zdGF0dXNiYXInLFxuXHRTSEVMTF9HUkFESUVOVF9CQUNLR1JPVU5EID0gJ3NoZWxsLWdyYWRpZW50LWJhY2tncm91bmQnLFxuXHRGVUxMU0NSRUVOID0gJ2Z1bGxzY3JlZW4nLFxuXHRNQVhJTUlaRUQgPSAnbWF4aW1pemVkJyxcblx0UEhPTkVfTEFZT1VUID0gJ3Bob25lLWxheW91dCdcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBQYXJ0IFZpc2liaWxpdHkgU3RhdGVcblxuLyoqIFZpc2liaWxpdHkgb2YgZWFjaCB3b3JrYmVuY2ggcGFydCBpbiB0aGUgQWdlbnRzIHdpbmRvdyBsYXlvdXQuICovXG5leHBvcnQgaW50ZXJmYWNlIElQYXJ0VmlzaWJpbGl0eVN0YXRlIHtcblx0c2lkZWJhcjogYm9vbGVhbjtcblx0YXV4aWxpYXJ5QmFyOiBib29sZWFuO1xuXHRlZGl0b3I6IGJvb2xlYW47XG5cdHBhbmVsOiBib29sZWFuO1xuXHRzZXNzaW9uczogYm9vbGVhbjtcblx0Y3VzdG9tVmlld0dyaWQ6IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBJUGFydFNpemVzU3RhdGUge1xuXHRzaWRlYmFyPzogbnVtYmVyO1xuXHRhdXhpbGlhcnlCYXI/OiBudW1iZXI7XG5cdHNlc3Npb25zPzogbnVtYmVyO1xuXHRlZGl0b3I/OiBudW1iZXI7XG5cdHBhbmVsPzogbnVtYmVyO1xufVxuXG4vKiogT3BhcXVlIHBlci10cmFuc2l0aW9uIGNhcHR1cmUgcmV0dXJuZWQgYnkgYFdvcmtiZW5jaC5fcHJlcGFyZVNpZGVCYXJSZXNpemVgLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU2lkZUJhclJlc2l6ZUNvbnRleHQgeyB9XG5cbi8qKiBDdXJyZW50IHZpc2liaWxpdHkgc3RhdGUgb2YgdGhlIHNpZGUgcGFuZSBhbmQgaXRzIGNvbnN0aXR1ZW50IHBhcnRzLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU2lkZVBhbmVTdGF0ZSB7XG5cdHJlYWRvbmx5IGVkaXRvcjogYm9vbGVhbjtcblx0cmVhZG9ubHkgYXV4aWxpYXJ5QmFyOiBib29sZWFuO1xufVxuXG4vKiogU2lkZS1wYW5lIHZpc2liaWxpdHkgYmVmb3JlIGFuZCBhZnRlciBhIGNvbXBsZXRlZCB0b2dnbGUuICovXG5leHBvcnQgaW50ZXJmYWNlIElTaWRlUGFuZVRvZ2dsZUV2ZW50IHtcblx0cmVhZG9ubHkgYmVmb3JlOiBJU2lkZVBhbmVTdGF0ZTtcblx0cmVhZG9ubHkgYWZ0ZXI6IElTaWRlUGFuZVN0YXRlO1xufVxuXG4vLyNlbmRyZWdpb25cblxuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIGV4dGVuZHMgSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIElEb2NrZWRFZGl0b3JMYXlvdXQge1xuXHRpc0VkaXRvck1heGltaXplZCgpOiBib29sZWFuO1xuXHRzZXRFZGl0b3JNYXhpbWl6ZWQobWF4aW1pemVkOiBib29sZWFuKTogdm9pZDtcblx0aXNFZGl0b3JQYW5lVmlzaWJsZSgpOiBib29sZWFuO1xuXG5cdC8qKiBXaGV0aGVyIHRoZSBzaWRlIHBhbmUgKGVkaXRvciBhcmVhIGFuZC9vciBhdXhpbGlhcnkgYmFyKSBpcyB2aXNpYmxlLiAqL1xuXHRpc1NpZGVQYW5lVmlzaWJsZSgpOiBib29sZWFuO1xuXG5cdC8qKiBGaXJlZCBzeW5jaHJvbm91c2x5IGJlZm9yZSB0aGUgc2lkZSBwYW5lIHN0YXJ0cyB0b2dnbGluZy4gKi9cblx0cmVhZG9ubHkgb25XaWxsVG9nZ2xlU2lkZVBhbmU6IEV2ZW50PHZvaWQ+O1xuXG5cdC8qKiBGaXJlZCBzeW5jaHJvbm91c2x5IGFmdGVyIHRoZSBzaWRlIHBhbmUgZmluaXNoZXMgdG9nZ2xpbmcuICovXG5cdHJlYWRvbmx5IG9uRGlkVG9nZ2xlU2lkZVBhbmU6IEV2ZW50PElTaWRlUGFuZVRvZ2dsZUV2ZW50PjtcblxuXHQvKipcblx0ICogVG9nZ2xlIHRoZSBzaWRlIHBhbmUgXHUyMDE0IHRoZSBlZGl0b3IgYXJlYSBhbmQgYXV4aWxpYXJ5IGJhciBhcyBvbmUgc3VyZmFjZS5cblx0ICogQ2xvc2luZyBoaWRlcyBib3RoOyByZS1vcGVuaW5nIHJlc3RvcmVzIHRoZSBwYXJ0cyB2aXNpYmxlIHdoZW4gaXQgd2FzIGxhc3Rcblx0ICogY2xvc2VkLCBmYWxsaW5nIGJhY2sgdG8gdGhlIGxheW91dCdzIGRlZmF1bHQgcmVvcGVuIHBhcnRzLiBFbXB0eSBzdXJmYWNlc1xuXHQgKiBhcmUgbmV2ZXIgcmV2ZWFsZWQsIGFuZCBhIG1heGltaXplZCBzaW5nbGUtcGFuZSBlZGl0b3IgY29sbGFwc2VzIGZ1bGx5LlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIHNpZGUgcGFuZSBpcyBub3cgdmlzaWJsZS5cblx0ICovXG5cdHRvZ2dsZVNpZGVQYW5lKCk6IGJvb2xlYW47XG5cblx0LyoqIEhpZGVzIHRoZSBzaWRlIHBhbmUgYXMgb25lIHNlbWFudGljIHRyYW5zaXRpb24uICovXG5cdGhpZGVTaWRlUGFuZSgpOiB2b2lkO1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRWRpdG9yTWF4aW1pemVkOiBFdmVudDx2b2lkPjtcblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgQWdlbnRzIHdpbmRvdyBpcyB1c2luZyB0aGUgc2luZ2xlLXBhbmUgKGRvY2tlZCBkZXRhaWwgcGFuZWwpXG5cdCAqIGxheW91dC4gRml4ZWQgYXQgY29uc3RydWN0aW9uIFx1MjAxNCBgZmFsc2VgIGZvciB0aGUgY2xhc3NpYy9tb2JpbGUgd29ya2JlbmNoLFxuXHQgKiBgdHJ1ZWAgZm9yIHtAbGluayBTaW5nbGVQYW5lV29ya2JlbmNofS5cblx0ICovXG5cdHJlYWRvbmx5IGlzU2luZ2xlUGFuZUxheW91dEVuYWJsZWQ6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFN1cHByZXNzZXMgdGhlIGF1dG9tYXRpYyBlZGl0b3IgcGFydCBzaG93L2hpZGUgdGhhdCBub3JtYWxseSBmaXJlcyBmcm9tXG5cdCAqIGBlZGl0b3JTZXJ2aWNlLm9uV2lsbE9wZW5FZGl0b3JgIC8gYG9uRGlkQ2xvc2VFZGl0b3JgLiBVc2UgdGhpcyBhcm91bmRcblx0ICogcHJvZ3JhbW1hdGljIGVkaXRvciBvcGVyYXRpb25zIChlLmcuIGFwcGx5aW5nIGEgd29ya2luZyBzZXQpIHNvIHRoYXQgdGhlXG5cdCAqIGVkaXRvciBwYXJ0IHZpc2liaWxpdHkgaXMgbm90IGNoYW5nZWQgYXMgYSBzaWRlLWVmZmVjdC4gRGlzcG9zZSB0aGVcblx0ICogcmV0dXJuZWQgaGFuZGxlIHRvIHJlbGVhc2UgdGhlIHN1cHByZXNzaW9uLiBDYWxscyBuZXN0IHZpYSBhIGNvdW50ZXIuXG5cdCAqL1xuXHRzdXBwcmVzc0VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eSgpOiBJRGlzcG9zYWJsZTtcblxuXHQvKiogV2hldGhlciBwcm9ncmFtbWF0aWMgZWRpdG9yIG9wZXJhdGlvbnMgY3VycmVudGx5IHN1cHByZXNzIGF1dG9tYXRpYyBzaWRlLXBhbmUgdmlzaWJpbGl0eS4gKi9cblx0aXNFZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHlTdXBwcmVzc2VkKCk6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIENoYW5nZXMgZG9ja2VkIGRldGFpbCB2aXNpYmlsaXR5IGluIHJlc3BvbnNlIHRvIGEgc2FzaCByZXNpemUgd2l0aG91dFxuXHQgKiBwZXJzaXN0aW5nIGl0IGFzIGFuIGV4cGxpY2l0IHVzZXIgdmlzaWJpbGl0eSBwcmVmZXJlbmNlLlxuXHQgKi9cblx0c2V0QXV4aWxpYXJ5QmFySGlkZGVuRm9yUmVzaXplKGhpZGRlbjogYm9vbGVhbik6IHZvaWQ7XG59XG5cbi8qKlxuICogRG9ja2VkLWVkaXRvciAoc2luZ2xlLXBhbmUgZGV0YWlsIHBhbmVsKSBjb25jZXJucyBvZiB0aGUgbGF5b3V0IHNlcnZpY2UsIGtlcHRcbiAqIHNlcGFyYXRlIGZyb20gdGhlIGdlbmVyYWwgY29udHJhY3Qgc28gZmVhdHVyZXMgdGhhdCBkbyBub3QgY2FyZSBhYm91dCB0aGVcbiAqIGRvY2tlZCBsYXlvdXQgYXJlIG5vdCBjb3VwbGVkIHRvIGl0LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElEb2NrZWRFZGl0b3JMYXlvdXQge1xuXHRoYW5kbGVEb2NrZWRFZGl0b3JQYXJ0TGF5b3V0KG5vZGVXaWR0aDogbnVtYmVyKTogdm9pZDtcblxuXHQvKipcblx0ICogRmlyZWQgd2hlbiB0aGUgc2lkZSBwYW5lICh0aGUgZG9ja2VkIGVkaXRvciBwYXJ0IGFuZC9vciB0aGUgYXV4aWxpYXJ5LWJhclxuXHQgKiBkZXRhaWwgcGFuZWwpIHRyYW5zaXRpb25zIGZyb20gKmZ1bGx5IGhpZGRlbiogdG8gdmlzaWJsZSBcdTIwMTQgaS5lLiB0aGUgdXNlclxuXHQgKiBvcGVucyB0aGUgc2lkZSBwYW5lLiBJdCBmaXJlcyByZWdhcmRsZXNzIG9mIGhvdyB0aGUgcGFuZSBpcyBvcGVuZWQgKHRoZVxuXHQgKiB0b2dnbGUgYWN0aW9uLCByZXZlYWxpbmcgYW4gZWRpdG9yLCBvciByZXZlYWxpbmcgdGhlIGRldGFpbCkuIENvbnN1bWVyc1xuXHQgKiBkZWNpZGUgd2hhdCB0byBkbyBmcm9tIHRoZSBjdXJyZW50IGVkaXRvciBncm91cCBzdGF0ZSAoZS5nLiBwb3B1bGF0ZSB0aGVcblx0ICogZGVmYXVsdCBtYW5hZ2VkIHRhYnMgb25seSB3aGVuIG5vIHJlYWwgZWRpdG9yIGlzIG9wZW4pLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRSZXZlYWxTaWRlUGFuZTogRXZlbnQ8dm9pZD47XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIGVkaXRvcidzIGN1cnJlbnQgdmlzaWJsZSBzdGF0ZSB3YXMgcHJvZHVjZWQgYnkgYW4gZXhwbGljaXQgdXNlclxuXHQgKiByZXZlYWwgKG9wZW5pbmcgYW4gZWRpdG9yLCBvciB0b2dnbGluZyB0aGUgZGV0YWlsIHBhbmVsIG9mZikuXG5cdCAqL1xuXHRpc0VkaXRvclJldmVhbGVkRXhwbGljaXRseSgpOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBSZXZlYWxzIHRoZSAocG9zc2libHkgaGlkZGVuKSBlZGl0b3IgcGFydCBhcyBhbiBleHBsaWNpdCB1c2VyIGFjdGlvbi4gVXNlIGZvclxuXHQgKiBkZWxpYmVyYXRlIG9wZW5zIGxpa2UgdGhlIHNlc3Npb24taGVhZGVyIENoYW5nZXMgcGlsbCBvciBvcGVuaW5nIGEgZmlsZSBkaWZmLlxuXHQgKi9cblx0cmV2ZWFsRWRpdG9yUGFydEV4cGxpY2l0bHkoKTogdm9pZDtcblxuXHQvKipcblx0ICogVGhlIGRvY2tlZCBhdXhpbGlhcnkgYmFyIChkZXRhaWwgcGFuZWwpIHdpZHRoLCBvd25lZCBieSB0aGUgd29ya2JlbmNoJ3Ncblx0ICogc2luZ2xlLXBhbmUgbGF5b3V0IHN0YXRlIGFuZCByZWFkL3dyaXR0ZW4gYnkgdGhlIGRvY2tlZCBjb250cm9sbGVyIHRoYXQgdGhlXG5cdCAqIGVkaXRvciBwYXJ0IG93bnMuIFRyaXZpYWwgaW4gdGhlIGNsYXNzaWMgbGF5b3V0LlxuXHQgKi9cblx0Z2V0RG9ja2VkQXV4aWxpYXJ5QmFyV2lkdGgoKTogbnVtYmVyO1xuXHRzZXREb2NrZWRBdXhpbGlhcnlCYXJXaWR0aCh3aWR0aDogbnVtYmVyKTogdm9pZDtcbn1cblxuZXhwb3J0IGNvbnN0IElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2UgPSByZWZpbmVTZXJ2aWNlRGVjb3JhdG9yPElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlPihJV29ya2JlbmNoTGF5b3V0U2VydmljZSk7XG5cbmV4cG9ydCBjb25zdCBDTE9TRV9NT0JJTEVfU0lERUJBUl9EUkFXRVJfQ09NTUFORF9JRCA9ICdzZXNzaW9ucy5jbG9zZU1vYmlsZVNpZGViYXJEcmF3ZXInO1xuXG5leHBvcnQgY2xhc3MgV29ya2JlbmNoIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8vI3JlZ2lvbiBMaWZlY3ljbGUgRXZlbnRzXG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsU2h1dGRvd24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxXaWxsU2h1dGRvd25FdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbFNodXRkb3duID0gdGhpcy5fb25XaWxsU2h1dGRvd24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTaHV0ZG93biA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNodXRkb3duID0gdGhpcy5fb25EaWRTaHV0ZG93bi5ldmVudDtcblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gRXZlbnRzXG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VaZW5Nb2RlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlWmVuTW9kZSA9IHRoaXMuX29uRGlkQ2hhbmdlWmVuTW9kZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU1haW5FZGl0b3JDZW50ZXJlZExheW91dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU1haW5FZGl0b3JDZW50ZXJlZExheW91dCA9IHRoaXMuX29uRGlkQ2hhbmdlTWFpbkVkaXRvckNlbnRlcmVkTGF5b3V0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUGFuZWxBbGlnbm1lbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxQYW5lbEFsaWdubWVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUGFuZWxBbGlnbm1lbnQgPSB0aGlzLl9vbkRpZENoYW5nZVBhbmVsQWxpZ25tZW50LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlV2luZG93TWF4aW1pemVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyB3aW5kb3dJZDogbnVtYmVyOyBtYXhpbWl6ZWQ6IGJvb2xlYW4gfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlV2luZG93TWF4aW1pemVkID0gdGhpcy5fb25EaWRDaGFuZ2VXaW5kb3dNYXhpbWl6ZWQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VQYW5lbFBvc2l0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQYW5lbFBvc2l0aW9uID0gdGhpcy5fb25EaWRDaGFuZ2VQYW5lbFBvc2l0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUGFydFZpc2liaWxpdHlDaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkgPSB0aGlzLl9vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbFRvZ2dsZVNpZGVQYW5lID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbFRvZ2dsZVNpZGVQYW5lID0gdGhpcy5fb25XaWxsVG9nZ2xlU2lkZVBhbmUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRUb2dnbGVTaWRlUGFuZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElTaWRlUGFuZVRvZ2dsZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRUb2dnbGVTaWRlUGFuZSA9IHRoaXMuX29uRGlkVG9nZ2xlU2lkZVBhbmUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXZlYWxTaWRlUGFuZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJldmVhbFNpZGVQYW5lID0gdGhpcy5fb25EaWRSZXZlYWxTaWRlUGFuZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU5vdGlmaWNhdGlvbnNWaXNpYmlsaXR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTm90aWZpY2F0aW9uc1Zpc2liaWxpdHkgPSB0aGlzLl9vbkRpZENoYW5nZU5vdGlmaWNhdGlvbnNWaXNpYmlsaXR5LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQXV4aWxpYXJ5QmFyTWF4aW1pemVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQXV4aWxpYXJ5QmFyTWF4aW1pemVkID0gdGhpcy5fb25EaWRDaGFuZ2VBdXhpbGlhcnlCYXJNYXhpbWl6ZWQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VFZGl0b3JNYXhpbWl6ZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VFZGl0b3JNYXhpbWl6ZWQgPSB0aGlzLl9vbkRpZENoYW5nZUVkaXRvck1heGltaXplZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZExheW91dE1haW5Db250YWluZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRGltZW5zaW9uPigpKTtcblx0cmVhZG9ubHkgb25EaWRMYXlvdXRNYWluQ29udGFpbmVyID0gdGhpcy5fb25EaWRMYXlvdXRNYWluQ29udGFpbmVyLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkTGF5b3V0QWN0aXZlQ29udGFpbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SURpbWVuc2lvbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkTGF5b3V0QWN0aXZlQ29udGFpbmVyID0gdGhpcy5fb25EaWRMYXlvdXRBY3RpdmVDb250YWluZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRMYXlvdXRDb250YWluZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7IGRpbWVuc2lvbjogSURpbWVuc2lvbiB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRMYXlvdXRDb250YWluZXIgPSB0aGlzLl9vbkRpZExheW91dENvbnRhaW5lci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFkZENvbnRhaW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgY29udGFpbmVyOiBIVE1MRWxlbWVudDsgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRBZGRDb250YWluZXIgPSB0aGlzLl9vbkRpZEFkZENvbnRhaW5lci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUFjdGl2ZUNvbnRhaW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZUNvbnRhaW5lciA9IHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlQ29udGFpbmVyLmV2ZW50O1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBQcm9wZXJ0aWVzXG5cblx0cmVhZG9ubHkgbWFpbkNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXG5cdGdldCBhY3RpdmVDb250YWluZXIoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLmdldENvbnRhaW5lckZyb21Eb2N1bWVudChnZXRBY3RpdmVEb2N1bWVudCgpKTtcblx0fVxuXG5cdGdldCBjb250YWluZXJzKCk6IEl0ZXJhYmxlPEhUTUxFbGVtZW50PiB7XG5cdFx0Y29uc3QgY29udGFpbmVyczogSFRNTEVsZW1lbnRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgeyB3aW5kb3cgfSBvZiBnZXRXaW5kb3dzKCkpIHtcblx0XHRcdGNvbnRhaW5lcnMucHVzaCh0aGlzLmdldENvbnRhaW5lckZyb21Eb2N1bWVudCh3aW5kb3cuZG9jdW1lbnQpKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNvbnRhaW5lcnM7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbnRhaW5lckZyb21Eb2N1bWVudCh0YXJnZXREb2N1bWVudDogRG9jdW1lbnQpOiBIVE1MRWxlbWVudCB7XG5cdFx0aWYgKHRhcmdldERvY3VtZW50ID09PSB0aGlzLm1haW5Db250YWluZXIub3duZXJEb2N1bWVudCkge1xuXHRcdFx0cmV0dXJuIHRoaXMubWFpbkNvbnRhaW5lcjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRyZXR1cm4gdGFyZ2V0RG9jdW1lbnQuYm9keS5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKCdtb25hY28td29ya2JlbmNoJylbMF0gYXMgSFRNTEVsZW1lbnQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbWFpbkNvbnRhaW5lckRpbWVuc2lvbiE6IElEaW1lbnNpb247XG5cdGdldCBtYWluQ29udGFpbmVyRGltZW5zaW9uKCk6IElEaW1lbnNpb24geyByZXR1cm4gdGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbjsgfVxuXG5cdGdldCBhY3RpdmVDb250YWluZXJEaW1lbnNpb24oKTogSURpbWVuc2lvbiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0Q29udGFpbmVyRGltZW5zaW9uKHRoaXMuYWN0aXZlQ29udGFpbmVyKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29udGFpbmVyRGltZW5zaW9uKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRGltZW5zaW9uIHtcblx0XHRpZiAoY29udGFpbmVyID09PSB0aGlzLm1haW5Db250YWluZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLm1haW5Db250YWluZXJEaW1lbnNpb247XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBnZXRDbGllbnRBcmVhKGNvbnRhaW5lcik7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IG1haW5Db250YWluZXJPZmZzZXQoKTogSUxheW91dE9mZnNldEluZm8ge1xuXHRcdHJldHVybiB0aGlzLmNvbXB1dGVDb250YWluZXJPZmZzZXQoKTtcblx0fVxuXG5cdGdldCBhY3RpdmVDb250YWluZXJPZmZzZXQoKTogSUxheW91dE9mZnNldEluZm8ge1xuXHRcdHJldHVybiB0aGlzLmNvbXB1dGVDb250YWluZXJPZmZzZXQoKTtcblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZUNvbnRhaW5lck9mZnNldCgpOiBJTGF5b3V0T2Zmc2V0SW5mbyB7XG5cdFx0bGV0IHRvcCA9IDA7XG5cdFx0bGV0IHF1aWNrUGlja1RvcCA9IDA7XG5cblx0XHRpZiAodGhpcy5pc1Zpc2libGUoUGFydHMuVElUTEVCQVJfUEFSVCwgbWFpbldpbmRvdykpIHtcblx0XHRcdHRvcCA9IHRoaXMuZ2V0UGFydChQYXJ0cy5USVRMRUJBUl9QQVJUKS5tYXhpbXVtSGVpZ2h0O1xuXHRcdFx0cXVpY2tQaWNrVG9wID0gdG9wO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5tb2JpbGVUb3BCYXJFbGVtZW50KSB7XG5cdFx0XHQvLyBPbiBwaG9uZSBsYXlvdXQgdGhlIE1vYmlsZVRpdGxlYmFyUGFydCByZXBsYWNlcyB0aGUgdGl0bGViYXJcblx0XHRcdHRvcCA9IHRoaXMubW9iaWxlVG9wQmFyRWxlbWVudC5vZmZzZXRIZWlnaHQ7XG5cdFx0XHRxdWlja1BpY2tUb3AgPSB0b3A7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgdG9wLCBxdWlja1BpY2tUb3AgfTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBTdGF0ZVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgcGFydHMgPSBuZXcgTWFwPHN0cmluZywgUGFydD4oKTtcblx0cHJvdGVjdGVkIHdvcmtiZW5jaEdyaWQhOiBTZXJpYWxpemFibGVHcmlkPElTZXJpYWxpemFibGVWaWV3PjtcblxuXHRwcml2YXRlIHRpdGxlQmFyUGFydFZpZXchOiBJU2VyaWFsaXphYmxlVmlldztcblx0cHJvdGVjdGVkIHNpZGVCYXJQYXJ0VmlldyE6IElTZXJpYWxpemFibGVWaWV3O1xuXHRwcml2YXRlIHBhbmVsUGFydFZpZXchOiBJU2VyaWFsaXphYmxlVmlldztcblx0cHJvdGVjdGVkIGF1eGlsaWFyeUJhclBhcnRWaWV3ITogSVNlcmlhbGl6YWJsZVZpZXc7XG5cdHByb3RlY3RlZCBlZGl0b3JQYXJ0VmlldyE6IElTZXJpYWxpemFibGVWaWV3O1xuXG5cdHByb3RlY3RlZCBzZXNzaW9uc1BhcnRWaWV3ITogSVNlcmlhbGl6YWJsZVZpZXc7XG5cdHByb3RlY3RlZCBjdXN0b21WaWV3R3JpZFBhcnRWaWV3ITogSVNlcmlhbGl6YWJsZVZpZXc7XG5cblx0LyoqIFRoZSBlZGl0b3IgcGFydCBjb250YWluZXI7IHRoZSBhdXhpbGlhcnkgYmFyIGlzIGRvY2tlZCBpbnNpZGUgaXQuICovXG5cdHByb3RlY3RlZCBfZWRpdG9yUGFydENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdC8qKiBgZmFsc2VgIGZvciB0aGUgY2xhc3NpYy9tb2JpbGUgbGF5b3V0OyB7QGxpbmsgU2luZ2xlUGFuZVdvcmtiZW5jaH0gb3ZlcnJpZGVzIHRvIGB0cnVlYC4gKi9cblx0Z2V0IGlzU2luZ2xlUGFuZUxheW91dEVuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdC8qKiBgdHJ1ZWAgd2hpbGUgdGhlIGVkaXRvcidzIGN1cnJlbnQgdmlzaWJsZSBzdGF0ZSB3YXMgcHJvZHVjZWQgYnkgYW4gZXhwbGljaXQgdXNlciByZXZlYWwuICovXG5cdHByb3RlY3RlZCBfZWRpdG9yUmV2ZWFsZWRFeHBsaWNpdGx5ID0gZmFsc2U7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IHBhcnRWaXNpYmlsaXR5OiBJUGFydFZpc2liaWxpdHlTdGF0ZSA9IHtcblx0XHRzaWRlYmFyOiB0cnVlLFxuXHRcdGF1eGlsaWFyeUJhcjogdHJ1ZSxcblx0XHRlZGl0b3I6IGZhbHNlLFxuXHRcdHBhbmVsOiBmYWxzZSxcblx0XHRzZXNzaW9uczogdHJ1ZSxcblx0XHRjdXN0b21WaWV3R3JpZDogZmFsc2Vcblx0fTtcblxuXHRwcml2YXRlIG1haW5XaW5kb3dGdWxsc2NyZWVuID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWF4aW1pemVkID0gbmV3IFNldDxudW1iZXI+KCk7XG5cdHByb3RlY3RlZCByZWFkb25seSBsYXlvdXRQb2xpY3kgPSB0aGlzLl9yZWdpc3RlcihuZXcgU2Vzc2lvbnNMYXlvdXRQb2xpY3koKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgbW9iaWxlTmF2U3RhY2sgPSB0aGlzLl9yZWdpc3RlcihuZXcgTW9iaWxlTmF2aWdhdGlvblN0YWNrKCkpO1xuXHRwcml2YXRlIG1vYmlsZVRvcEJhckVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1vYmlsZVRvcEJhckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRwcml2YXRlIF9lZGl0b3JNYXhpbWl6ZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfY3VzdG9tVmlld1Zpc2libGVLZXkhOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0LyoqIEd1YXJkcyB0aGUgZ3JpZCB1cGRhdGVzIHRoYXQgc2hvdy9oaWRlIHRoZSBjdXN0b20gdmlldyBmcm9tIGZlZWRpbmcgYmFjayBpbnRvIHRoZSBkZXNpcmVkIHBhcnQgdmlzaWJpbGl0eS4gKi9cblx0cHJpdmF0ZSBfYXBwbHlpbmdDdXN0b21WaWV3R3JpZFZpc2liaWxpdHkgPSBmYWxzZTtcblx0cHJpdmF0ZSBfZWRpdG9yTGFzdE5vbk1heGltaXplZFZpc2liaWxpdHk6IElQYXJ0VmlzaWJpbGl0eVN0YXRlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9lZGl0b3JMYXN0Tm9uTWF4aW1pemVkU2l6ZTogSVZpZXdTaXplIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9yZXN0b3JlQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRPblNob3cgPSBmYWxzZTtcblx0cHJvdGVjdGVkIF9lZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHlTdXBwcmVzc2lvbkNvdW50ID0gMDtcblx0cHJvdGVjdGVkIF9oYXNBcHBsaWVkSW5pdGlhbEVkaXRvclNwbGl0ID0gZmFsc2U7XG5cdHByaXZhdGUgX3NpZGVQYW5lU3RhdGVCZWZvcmVIaWRlOiBJU2lkZVBhbmVTdGF0ZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcmVzdG9yZVNpZGVQYW5lRWRpdG9yTWF4aW1pemVkT25TaG93ID0gZmFsc2U7XG5cdHByb3RlY3RlZCByZWFkb25seSBfZGVmYXVsdFNpZGVQYW5lU3RhdGU6IElTaWRlUGFuZVN0YXRlID0geyBlZGl0b3I6IHRydWUsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcmVzdG9yZWRQcm9taXNlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRyZWFkb25seSB3aGVuUmVzdG9yZWQgPSB0aGlzLnJlc3RvcmVkUHJvbWlzZS5wO1xuXHRwcml2YXRlIHJlc3RvcmVkID0gZmFsc2U7XG5cblx0cmVhZG9ubHkgb3BlbmVkRGVmYXVsdEVkaXRvcnMgPSBmYWxzZTtcblxuXHRwcm90ZWN0ZWQgX3NhdmVkUGFydFNpemVzOiBJUGFydFNpemVzU3RhdGUgPSB7fTtcblxuXHQvLyNlbmRyZWdpb25cblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfUEFSVF9WSVNJQklMSVRZX0tFWSA9ICd3b3JrYmVuY2guc2Vzc2lvbnMucGFydFZpc2liaWxpdHknO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfUEFSVF9TSVpFU19LRVkgPSAnd29ya2JlbmNoLnNlc3Npb25zLnBhcnRTaXplcyc7XG5cblx0Ly8jcmVnaW9uIFNlcnZpY2VzXG5cblx0cHJvdGVjdGVkIGVkaXRvckdyb3VwU2VydmljZSE6IElFZGl0b3JHcm91cHNTZXJ2aWNlO1xuXHRwcml2YXRlIGVkaXRvclNlcnZpY2UhOiBJRWRpdG9yU2VydmljZTtcblx0cHJpdmF0ZSBwYW5lQ29tcG9zaXRlU2VydmljZSE6IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2U7XG5cdHByaXZhdGUgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlITogSVZpZXdEZXNjcmlwdG9yU2VydmljZTtcblx0cHJpdmF0ZSBzZXNzaW9uc1NlcnZpY2UhOiBJU2Vzc2lvbnNTZXJ2aWNlO1xuXHRwcml2YXRlIHNlc3Npb25zUGFydFNlcnZpY2UhOiBJU2Vzc2lvbnNQYXJ0U2VydmljZTtcblx0cHJpdmF0ZSBjdXN0b21WaWV3U2VydmljZSE6IElDdXN0b21WaWV3U2VydmljZTtcblx0cHJpdmF0ZSBjdXN0b21WaWV3R3JpZFBhcnRTZXJ2aWNlITogSUN1c3RvbVZpZXdHcmlkUGFydFNlcnZpY2U7XG5cdHByaXZhdGUgaW5zdGFudGlhdGlvblNlcnZpY2UhOiBJSW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdHByaXZhdGUgc3RvcmFnZVNlcnZpY2UhOiBJU3RvcmFnZVNlcnZpY2U7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IHBhcmVudDogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiBJV29ya2JlbmNoT3B0aW9ucyB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNlcnZpY2VDb2xsZWN0aW9uOiBTZXJ2aWNlQ29sbGVjdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBTZXNzaW9ucy1zY29wZWQgbW9iaWxlIHZpZXdwb3J0IHR3ZWFrcy4gVGhlc2UgYXJlIGFwcGxpZWQgaGVyZVxuXHRcdC8vIChyYXRoZXIgdGhhbiBpbiB0aGUgc2hhcmVkIHdvcmtiZW5jaC5odG1sKSBzbyB0aGF0IHRoZSByZWd1bGFyXG5cdFx0Ly8gY29kZS13ZWIgd29ya2JlbmNoIFx1MjAxNCB3aGljaCBkb2VzIG5vdCBoYW5kbGUgc2FmZS1hcmVhIGluc2V0cyBcdTIwMTQgaXNcblx0XHQvLyBub3QgYWZmZWN0ZWQgb24gbm90Y2hlZCBtb2JpbGUgZGV2aWNlcy5cblx0XHQvLyBUaGUgdmlld3BvcnQgYDxtZXRhPmAgdGFnIGlzIGluamVjdGVkIGJ5IHRoZSBzaGFyZWQgd29ya2JlbmNoLmh0bWwsXG5cdFx0Ly8gc28gd2UgY2Fubm90IHVzZSBkb20udHMgYGgoKWAgdG8gY3JlYXRlIGl0LiBMb29rIGl0IHVwIGJ5IHRhZyBuYW1lXG5cdFx0Ly8gYW5kIGZpbHRlciBieSB0aGUgYG5hbWVgIGF0dHJpYnV0ZSB0byBhdm9pZCBhIHNlbGVjdG9yIHF1ZXJ5LlxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IG1ldGFFbGVtZW50cyA9IG1haW5XaW5kb3cuZG9jdW1lbnQuaGVhZC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnbWV0YScpO1xuXHRcdGxldCB2aWV3cG9ydE1ldGE6IEhUTUxNZXRhRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG1ldGFFbGVtZW50cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKG1ldGFFbGVtZW50c1tpXS5uYW1lID09PSAndmlld3BvcnQnKSB7XG5cdFx0XHRcdHZpZXdwb3J0TWV0YSA9IG1ldGFFbGVtZW50c1tpXTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh2aWV3cG9ydE1ldGEgJiYgIXZpZXdwb3J0TWV0YS5jb250ZW50LmluY2x1ZGVzKCd2aWV3cG9ydC1maXQ9JykpIHtcblx0XHRcdHZpZXdwb3J0TWV0YS5jb250ZW50ID0gYCR7dmlld3BvcnRNZXRhLmNvbnRlbnR9LCB2aWV3cG9ydC1maXQ9Y292ZXJgO1xuXHRcdH1cblxuXHRcdC8vIFBlcmY6IG1lYXN1cmUgd29ya2JlbmNoIHN0YXJ0dXAgdGltZVxuXHRcdG1hcmsoJ2NvZGUvd2lsbFN0YXJ0V29ya2JlbmNoJyk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXJyb3JIYW5kbGVyKGxvZ1NlcnZpY2UpO1xuXHR9XG5cblx0Ly8jcmVnaW9uIEVycm9yIEhhbmRsaW5nXG5cblx0cHJpdmF0ZSByZWdpc3RlckVycm9ySGFuZGxlcihsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSk6IHZvaWQge1xuXHRcdC8vIEluY3JlYXNlIHN0YWNrIHRyYWNlIGxpbWl0IGZvciBiZXR0ZXIgZXJyb3JzIHN0YWNrc1xuXHRcdGlmICghaXNGaXJlZm94KSB7XG5cdFx0XHRFcnJvci5zdGFja1RyYWNlTGltaXQgPSAxMDA7XG5cdFx0fVxuXG5cdFx0Ly8gTGlzdGVuIG9uIHVuaGFuZGxlZCByZWplY3Rpb24gZXZlbnRzXG5cdFx0Ly8gTm90ZTogaW50ZW50aW9uYWxseSBub3QgcmVnaXN0ZXJlZCBhcyBkaXNwb3NhYmxlIHRvIGhhbmRsZVxuXHRcdC8vICAgICAgIGVycm9ycyB0aGF0IGNhbiBvY2N1ciBkdXJpbmcgc2h1dGRvd24gcGhhc2UuXG5cdFx0bWFpbldpbmRvdy5hZGRFdmVudExpc3RlbmVyKCd1bmhhbmRsZWRyZWplY3Rpb24nLCAoZXZlbnQpID0+IHtcblx0XHRcdC8vIFNlZSBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvUHJvbWlzZVJlamVjdGlvbkV2ZW50XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihldmVudC5yZWFzb24pO1xuXG5cdFx0XHQvLyBQcmV2ZW50IHRoZSBwcmludGluZyBvZiB0aGlzIGV2ZW50IHRvIHRoZSBjb25zb2xlXG5cdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gSW5zdGFsbCBoYW5kbGVyIGZvciB1bmV4cGVjdGVkIGVycm9yc1xuXHRcdHNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoZXJyb3IgPT4gdGhpcy5oYW5kbGVVbmV4cGVjdGVkRXJyb3IoZXJyb3IsIGxvZ1NlcnZpY2UpKTtcblx0fVxuXG5cdHByaXZhdGUgcHJldmlvdXNVbmV4cGVjdGVkRXJyb3I6IHsgbWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkOyB0aW1lOiBudW1iZXIgfSA9IHsgbWVzc2FnZTogdW5kZWZpbmVkLCB0aW1lOiAwIH07XG5cdHByaXZhdGUgaGFuZGxlVW5leHBlY3RlZEVycm9yKGVycm9yOiB1bmtub3duLCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSk6IHZvaWQge1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSB0b0Vycm9yTWVzc2FnZShlcnJvciwgdHJ1ZSk7XG5cdFx0aWYgKCFtZXNzYWdlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRpZiAobWVzc2FnZSA9PT0gdGhpcy5wcmV2aW91c1VuZXhwZWN0ZWRFcnJvci5tZXNzYWdlICYmIG5vdyAtIHRoaXMucHJldmlvdXNVbmV4cGVjdGVkRXJyb3IudGltZSA8PSAxMDAwKSB7XG5cdFx0XHRyZXR1cm47IC8vIFJldHVybiBpZiBlcnJvciBtZXNzYWdlIGlkZW50aWNhbCB0byBwcmV2aW91cyBhbmQgc2hvcnRlciB0aGFuIDEgc2Vjb25kXG5cdFx0fVxuXG5cdFx0dGhpcy5wcmV2aW91c1VuZXhwZWN0ZWRFcnJvci50aW1lID0gbm93O1xuXHRcdHRoaXMucHJldmlvdXNVbmV4cGVjdGVkRXJyb3IubWVzc2FnZSA9IG1lc3NhZ2U7XG5cblx0XHQvLyBMb2cgaXRcblx0XHRsb2dTZXJ2aWNlLmVycm9yKG1lc3NhZ2UpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFN0YXJ0dXBcblxuXHRzdGFydHVwKCk6IElJbnN0YW50aWF0aW9uU2VydmljZSB7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIENvbmZpZ3VyZSBlbWl0dGVyIGxlYWsgd2FybmluZyB0aHJlc2hvbGRcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHNldEdsb2JhbExlYWtXYXJuaW5nVGhyZXNob2xkKDE3NSkpO1xuXG5cdFx0XHQvLyBTZXJ2aWNlc1xuXHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLmluaXRTZXJ2aWNlcyh0aGlzLnNlcnZpY2VDb2xsZWN0aW9uKTtcblxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRjb25zdCBsaWZlY3ljbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMaWZlY3ljbGVTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgaG9zdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUhvc3RTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgaG92ZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElIb3ZlclNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSkgYXMgTm90aWZpY2F0aW9uU2VydmljZTtcblx0XHRcdFx0Y29uc3QgbWFya2Rvd25SZW5kZXJlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlKTtcblxuXHRcdFx0XHQvLyBPbiB3ZWIsIHRoZSBjb25maWd1cmF0aW9uIHNlcnZpY2UgbmVlZHMgYWNjZXNzIHRvIHRoZVxuXHRcdFx0XHQvLyBpbnN0YW50aWF0aW9uIHNlcnZpY2UgZm9yIGR5bmFtaWMgY29uZmlndXJhdGlvbiByZXNvbHV0aW9uLlxuXHRcdFx0XHRpZiAoaXNXZWIgJiYgdHlwZW9mIChjb25maWd1cmF0aW9uU2VydmljZSBhcyBJQ29uZmlndXJhdGlvblNlcnZpY2UgJiB7IGFjcXVpcmVJbnN0YW50aWF0aW9uU2VydmljZT8oaTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogdm9pZCB9KS5hY3F1aXJlSW5zdGFudGlhdGlvblNlcnZpY2UgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0XHQoY29uZmlndXJhdGlvblNlcnZpY2UgYXMgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlICYgeyBhY3F1aXJlSW5zdGFudGlhdGlvblNlcnZpY2UoaTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogdm9pZCB9KS5hY3F1aXJlSW5zdGFudGlhdGlvblNlcnZpY2UoaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gU2V0IGNvZGUgYmxvY2sgcmVuZGVyZXIgZm9yIG1hcmtkb3duIHJlbmRlcmluZ1xuXHRcdFx0XHRtYXJrZG93blJlbmRlcmVyU2VydmljZS5zZXREZWZhdWx0Q29kZUJsb2NrUmVuZGVyZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdG9yTWFya2Rvd25Db2RlQmxvY2tSZW5kZXJlcikpO1xuXG5cdFx0XHRcdC8vIERlZmF1bHQgSG92ZXIgRGVsZWdhdGUgbXVzdCBiZSByZWdpc3RlcmVkIGJlZm9yZSBjcmVhdGluZyBhbnkgd29ya2JlbmNoL2xheW91dCBjb21wb25lbnRzXG5cdFx0XHRcdHNldEhvdmVyRGVsZWdhdGVGYWN0b3J5KChwbGFjZW1lbnQsIGVuYWJsZUluc3RhbnRIb3ZlcikgPT4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoSG92ZXJEZWxlZ2F0ZSwgcGxhY2VtZW50LCB7IGluc3RhbnRIb3ZlcjogZW5hYmxlSW5zdGFudEhvdmVyIH0sIHt9KSk7XG5cdFx0XHRcdHNldEJhc2VMYXllckhvdmVyRGVsZWdhdGUoaG92ZXJTZXJ2aWNlKTtcblxuXHRcdFx0XHQvLyBMYXlvdXRcblx0XHRcdFx0dGhpcy5pbml0TGF5b3V0KGFjY2Vzc29yKTtcblxuXHRcdFx0XHQvLyBSZWdpc3RyaWVzIC0gdGhpcyBjcmVhdGVzIGFuZCByZWdpc3RlcnMgYWxsIHBhcnRzXG5cdFx0XHRcdFJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKS5zdGFydChhY2Nlc3Nvcik7XG5cdFx0XHRcdFJlZ2lzdHJ5LmFzPElFZGl0b3JGYWN0b3J5UmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yRmFjdG9yeSkuc3RhcnQoYWNjZXNzb3IpO1xuXG5cdFx0XHRcdC8vIENvbnRleHQgS2V5c1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hDb250ZXh0S2V5c0hhbmRsZXIpKTtcblxuXHRcdFx0XHQvLyBFZGl0b3IgTWF4aW1pemVkIENvbnRleHQgS2V5XG5cdFx0XHRcdGNvbnN0IGVkaXRvck1heGltaXplZENvbnRleHQgPSBFZGl0b3JNYXhpbWl6ZWRDb250ZXh0LmJpbmRUbyhhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VFZGl0b3JNYXhpbWl6ZWQoKCkgPT4ge1xuXHRcdFx0XHRcdGVkaXRvck1heGltaXplZENvbnRleHQuc2V0KHRoaXMuaXNFZGl0b3JNYXhpbWl6ZWQoKSk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHQvLyBQaG9uZSBMYXlvdXQgQ29udGV4dCBLZXlcblx0XHRcdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgaXNQaG9uZUxheW91dEN0eCA9IElzUGhvbmVMYXlvdXRDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0XHRpc1Bob25lTGF5b3V0Q3R4LnNldCh0aGlzLmxheW91dFBvbGljeS52aWV3cG9ydENsYXNzLnJlYWQocmVhZGVyKSA9PT0gJ3Bob25lJyk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRTaW5nbGVQYW5lTGF5b3V0RW5hYmxlZENvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKS5zZXQodGhpcy5pc1NpbmdsZVBhbmVMYXlvdXRFbmFibGVkKTtcblxuXHRcdFx0XHQvLyBWaXJ0dWFsIGtleWJvYXJkIHRyYWNraW5nICh2aXN1YWxWaWV3cG9ydCk6IHB1Ymxpc2hlcyB0aGVcblx0XHRcdFx0Ly8ga2V5Ym9hcmQgaGVpZ2h0IGFzIGFuIG9ic2VydmFibGUsIG1pcnJvcnMgaXQgb250byB0aGVcblx0XHRcdFx0Ly8gYC0tdnNjb2RlLWtleWJvYXJkLWhlaWdodGAgQ1NTIHZhcmlhYmxlIG9uIHRoZSBtYWluXG5cdFx0XHRcdC8vIGNvbnRhaW5lciwgYW5kIGRyaXZlcyB0aGUgYEtleWJvYXJkVmlzaWJsZUNvbnRleHRgXG5cdFx0XHRcdC8vIGNvbnRleHQga2V5LiBUaGUgc2VydmljZSBpcyBhbiBlYWdlciBzaW5nbGV0b24sIHNvXG5cdFx0XHRcdC8vIHJlc29sdmluZyBpdCBoZXJlIGlzIHdoYXQgdHJpZ2dlcnMgaXRzIGNvbnN0cnVjdG9yIFx1MjAxNFxuXHRcdFx0XHQvLyB0aGUgcmVnaXN0cnkgaGFuZHMgb3duZXJzaGlwL2Rpc3Bvc2FsIHRvIHRoZVxuXHRcdFx0XHQvLyBpbnN0YW50aWF0aW9uIHNlcnZpY2Ugc28gd2UgZG9uJ3QgYF9yZWdpc3RlcmAgaXQuXG5cdFx0XHRcdGFjY2Vzc29yLmdldChJTW9iaWxlVmlzdWFsVmlld3BvcnQpO1xuXG5cdFx0XHRcdC8vIE9yaWVudGF0aW9uIGNoYW5nZXMgcHJvZHVjZSBhIHdpbmRvdyBgcmVzaXplYCBldmVudCB3aGljaFxuXHRcdFx0XHQvLyBpcyBhbHJlYWR5IGhhbmRsZWQgYnkgYHJlZ2lzdGVyTGF5b3V0TGlzdGVuZXJzKClgLiBOb1xuXHRcdFx0XHQvLyBzZXBhcmF0ZSBtYXRjaE1lZGlhIGxpc3RlbmVyIGlzIG5lZWRlZCBcdTIwMTQgdGhlIHByZXZpb3VzXG5cdFx0XHRcdC8vIGltcGxlbWVudGF0aW9uIGNhdXNlZCBhIHJlZHVuZGFudCBzZWNvbmQgbGF5b3V0LlxuXG5cdFx0XHRcdC8vIFJlZ2lzdGVyIExpc3RlbmVyc1xuXHRcdFx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKGxpZmVjeWNsZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgaG9zdFNlcnZpY2UsIGRpYWxvZ1NlcnZpY2UpO1xuXG5cdFx0XHRcdC8vIFJlbmRlciBXb3JrYmVuY2hcblx0XHRcdFx0dGhpcy5yZW5kZXJXb3JrYmVuY2goaW5zdGFudGlhdGlvblNlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRcdFx0Ly8gV29ya2JlbmNoIExheW91dFxuXHRcdFx0XHR0aGlzLmNyZWF0ZVdvcmtiZW5jaExheW91dCgpO1xuXG5cdFx0XHRcdC8vIENyZWF0ZSBtb2JpbGUgbmF2aWdhdGlvbiBhZnRlciBncmlkIGV4aXN0cyAoc28gRE9NIG9yZGVyIGlzIGNvcnJlY3QpXG5cdFx0XHRcdGlmICh0aGlzLmxheW91dFBvbGljeS52aWV3cG9ydENsYXNzLmdldCgpID09PSAncGhvbmUnKSB7XG5cdFx0XHRcdFx0dGhpcy5jcmVhdGVNb2JpbGVUaXRsZWJhcigpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gV29ya2JlbmNoIE1hbmFnZW1lbnRcblx0XHRcdFx0dGhpcy5jcmVhdGVXb3JrYmVuY2hNYW5hZ2VtZW50KGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdFx0XHQvLyBMYXlvdXRcblx0XHRcdFx0dGhpcy5sYXlvdXQoKTtcblxuXHRcdFx0XHQvLyBSZXN0b3JlXG5cdFx0XHRcdHRoaXMucmVzdG9yZShsaWZlY3ljbGVTZXJ2aWNlKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycm9yKTtcblxuXHRcdFx0dGhyb3cgZXJyb3I7IC8vIHJldGhyb3cgYmVjYXVzZSB0aGlzIGlzIGEgY3JpdGljYWwgaXNzdWUgd2UgY2Fubm90IGhhbmRsZSBwcm9wZXJseSBoZXJlXG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBpbml0U2VydmljZXMoc2VydmljZUNvbGxlY3Rpb246IFNlcnZpY2VDb2xsZWN0aW9uKTogSUluc3RhbnRpYXRpb25TZXJ2aWNlIHtcblx0XHQvLyBMYXlvdXQgU2VydmljZVxuXHRcdHNlcnZpY2VDb2xsZWN0aW9uLnNldChJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCB0aGlzKTtcblxuXHRcdC8vIFRpdGxlIFNlcnZpY2UgLSBhZ2VudCBzZXNzaW9ucyB0aXRsZWJhciB3aXRoIGRlZGljYXRlZCBwYXJ0IG92ZXJyaWRlc1xuXHRcdHNlcnZpY2VDb2xsZWN0aW9uLnNldChJVGl0bGVTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoVGl0bGVTZXJ2aWNlLCBbXSkpO1xuXG5cdFx0Ly8gQWxsIENvbnRyaWJ1dGVkIFNlcnZpY2VzXG5cdFx0Y29uc3QgY29udHJpYnV0ZWRTZXJ2aWNlcyA9IGdldFNpbmdsZXRvblNlcnZpY2VEZXNjcmlwdG9ycygpO1xuXHRcdGZvciAoY29uc3QgW2lkLCBkZXNjcmlwdG9yXSBvZiBjb250cmlidXRlZFNlcnZpY2VzKSB7XG5cdFx0XHRzZXJ2aWNlQ29sbGVjdGlvbi5zZXQoaWQsIGRlc2NyaXB0b3IpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gbmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKHNlcnZpY2VDb2xsZWN0aW9uLCB0cnVlKTtcblxuXHRcdC8vIFdyYXAgdXBcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cdFx0XHRjb25zdCBsaWZlY3ljbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMaWZlY3ljbGVTZXJ2aWNlKTtcblx0XHRcdGxpZmVjeWNsZVNlcnZpY2UucGhhc2UgPSBMaWZlY3ljbGVQaGFzZS5SZWFkeTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMobGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsIGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsIGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlKTogdm9pZCB7XG5cdFx0Ly8gQ29tbWFuZDogY2xvc2UgdGhlIG1vYmlsZSBzaWRlYmFyIGRyYXdlciAobm8tb3Agb3V0c2lkZSBwaG9uZSBsYXlvdXQpLlxuXHRcdC8vIFJvdXRlcyB0aHJvdWdoIHRoZSBwcm9wZXIgY2xvc2UgcGF0aCBzbyB0aGUgbW9iaWxlIG5hdi9oaXN0b3J5IHN0YWNrXG5cdFx0Ly8gc3RheXMgaW4gc3luYyAoYXZvaWRzIGV4dHJhIEFuZHJvaWQgYmFjay1idXR0b24gcHJlc3NlcykuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoQ0xPU0VfTU9CSUxFX1NJREVCQVJfRFJBV0VSX0NPTU1BTkRfSUQsICgpID0+IHtcblx0XHRcdGlmICh0aGlzLmxheW91dFBvbGljeS52aWV3cG9ydENsYXNzLmdldCgpID09PSAncGhvbmUnKSB7XG5cdFx0XHRcdHRoaXMuY2xvc2VNb2JpbGVTaWRlYmFyRHJhd2VyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ29uZmlndXJhdGlvbiBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4gdGhpcy51cGRhdGVGb250QWxpYXNpbmcoZSwgY29uZmlndXJhdGlvblNlcnZpY2UpKSk7XG5cblx0XHQvLyBGb250IEluZm9cblx0XHRpZiAoaXNOYXRpdmUpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHN0b3JhZ2VTZXJ2aWNlLm9uV2lsbFNhdmVTdGF0ZShlID0+IHtcblx0XHRcdFx0aWYgKGUucmVhc29uID09PSBXaWxsU2F2ZVN0YXRlUmVhc29uLlNIVVRET1dOKSB7XG5cdFx0XHRcdFx0dGhpcy5zdG9yZUZvbnRJbmZvKHN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihsaWZlY3ljbGVTZXJ2aWNlLm9uV2lsbFNodXRkb3duKCgpID0+IHRoaXMuc3RvcmVGb250SW5mbyhzdG9yYWdlU2VydmljZSkpKTtcblx0XHR9XG5cblx0XHQvLyBQYXJ0IFNpemVzIFx1MjAxNCBwZXJzaXN0IGN1cnJlbnQgZ3JpZCBzaXplcyBzbyB0aGV5IGFyZSByZXN0b3JlZCBvbiByZWxvYWRcblx0XHR0aGlzLl9yZWdpc3RlcihzdG9yYWdlU2VydmljZS5vbldpbGxTYXZlU3RhdGUoKCkgPT4gdGhpcy5fc2F2ZVBhcnRTaXplcygpKSk7XG5cblx0XHQvLyBMaWZlY3ljbGVcblx0XHR0aGlzLl9yZWdpc3RlcihsaWZlY3ljbGVTZXJ2aWNlLm9uV2lsbFNodXRkb3duKGV2ZW50ID0+IHRoaXMuX29uV2lsbFNodXRkb3duLmZpcmUoZXZlbnQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobGlmZWN5Y2xlU2VydmljZS5vbkRpZFNodXRkb3duKCgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkU2h1dGRvd24uZmlyZSgpO1xuXHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gRmx1c2ggc3RvcmFnZSBvbiB3aW5kb3cgZm9jdXMgbG9zc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGhvc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9jdXMoZm9jdXMgPT4ge1xuXHRcdFx0aWYgKCFmb2N1cykge1xuXHRcdFx0XHRzdG9yYWdlU2VydmljZS5mbHVzaCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIERpYWxvZ3Mgc2hvd2luZy9oaWRpbmdcblx0XHR0aGlzLl9yZWdpc3RlcihkaWFsb2dTZXJ2aWNlLm9uV2lsbFNob3dEaWFsb2coKCkgPT4gdGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ21vZGFsLWRpYWxvZy12aXNpYmxlJykpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihkaWFsb2dTZXJ2aWNlLm9uRGlkU2hvd0RpYWxvZygoKSA9PiB0aGlzLm1haW5Db250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnbW9kYWwtZGlhbG9nLXZpc2libGUnKSkpO1xuXHR9XG5cblx0Ly8jcmVnaW9uIEZvbnQgQWxpYXNpbmcgYW5kIENhY2hpbmdcblxuXHRwcml2YXRlIGZvbnRBbGlhc2luZzogJ2RlZmF1bHQnIHwgJ2FudGlhbGlhc2VkJyB8ICdub25lJyB8ICdhdXRvJyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB1cGRhdGVGb250QWxpYXNpbmcoZTogSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCB8IHVuZGVmaW5lZCwgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSkge1xuXHRcdGlmICghaXNNYWNpbnRvc2gpIHtcblx0XHRcdHJldHVybjsgLy8gbWFjT1Mgb25seVxuXHRcdH1cblxuXHRcdGlmIChlICYmICFlLmFmZmVjdHNDb25maWd1cmF0aW9uKCd3b3JrYmVuY2guZm9udEFsaWFzaW5nJykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhbGlhc2luZyA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdkZWZhdWx0JyB8ICdhbnRpYWxpYXNlZCcgfCAnbm9uZScgfCAnYXV0byc+KCd3b3JrYmVuY2guZm9udEFsaWFzaW5nJyk7XG5cdFx0aWYgKHRoaXMuZm9udEFsaWFzaW5nID09PSBhbGlhc2luZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZm9udEFsaWFzaW5nID0gYWxpYXNpbmc7XG5cblx0XHQvLyBSZW1vdmUgYWxsXG5cdFx0Y29uc3QgZm9udEFsaWFzaW5nVmFsdWVzOiAodHlwZW9mIGFsaWFzaW5nKVtdID0gWydhbnRpYWxpYXNlZCcsICdub25lJywgJ2F1dG8nXTtcblx0XHR0aGlzLm1haW5Db250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSguLi5mb250QWxpYXNpbmdWYWx1ZXMubWFwKHZhbHVlID0+IGBtb25hY28tZm9udC1hbGlhc2luZy0ke3ZhbHVlfWApKTtcblxuXHRcdC8vIEFkZCBzcGVjaWZpY1xuXHRcdGlmIChmb250QWxpYXNpbmdWYWx1ZXMuc29tZShvcHRpb24gPT4gb3B0aW9uID09PSBhbGlhc2luZykpIHtcblx0XHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKGBtb25hY28tZm9udC1hbGlhc2luZy0ke2FsaWFzaW5nfWApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVzdG9yZUZvbnRJbmZvKHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpOiB2b2lkIHtcblx0XHRjb25zdCBzdG9yZWRGb250SW5mb1JhdyA9IHN0b3JhZ2VTZXJ2aWNlLmdldCgnZWRpdG9yRm9udEluZm8nLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdGlmIChzdG9yZWRGb250SW5mb1Jhdykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgc3RvcmVkRm9udEluZm8gPSBKU09OLnBhcnNlKHN0b3JlZEZvbnRJbmZvUmF3KTtcblx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoc3RvcmVkRm9udEluZm8pKSB7XG5cdFx0XHRcdFx0Rm9udE1lYXN1cmVtZW50cy5yZXN0b3JlRm9udEluZm8obWFpbldpbmRvdywgc3RvcmVkRm9udEluZm8pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0LyogaWdub3JlICovXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Rm9udE1lYXN1cmVtZW50cy5yZWFkRm9udEluZm8obWFpbldpbmRvdywgY3JlYXRlQmFyZUZvbnRJbmZvRnJvbVJhd1NldHRpbmdzKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdlZGl0b3InKSwgUGl4ZWxSYXRpby5nZXRJbnN0YW5jZShtYWluV2luZG93KS52YWx1ZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdG9yZUZvbnRJbmZvKHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UpOiB2b2lkIHtcblx0XHRjb25zdCBzZXJpYWxpemVkRm9udEluZm8gPSBGb250TWVhc3VyZW1lbnRzLnNlcmlhbGl6ZUZvbnRJbmZvKG1haW5XaW5kb3cpO1xuXHRcdGlmIChzZXJpYWxpemVkRm9udEluZm8pIHtcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdlZGl0b3JGb250SW5mbycsIEpTT04uc3RyaW5naWZ5KHNlcmlhbGl6ZWRGb250SW5mbyksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9sb2FkUGFydFZpc2liaWxpdHkoc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSk6IHsgZWRpdG9yPzogYm9vbGVhbjsgYXV4aWxpYXJ5QmFyPzogYm9vbGVhbjsgc2lkZWJhcj86IGJvb2xlYW4gfSB7XG5cdFx0aWYgKHRoaXMubGF5b3V0UG9saWN5LnZpZXdwb3J0Q2xhc3MuZ2V0KCkgPT09ICdwaG9uZScpIHtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cblx0XHRjb25zdCByYXcgPSBzdG9yYWdlU2VydmljZS5nZXQoV29ya2JlbmNoLl9QQVJUX1ZJU0lCSUxJVFlfS0VZLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRpZiAocmF3KSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gSlNPTi5wYXJzZShyYXcpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIENvcnJ1cHRlZCBkYXRhIFx1MjAxNCByZW1vdmUgdGhlIGJhZCBrZXkgc28gd2UgZG9uJ3Qga2VlcCB3YXJuaW5nIG9uIGV2ZXJ5IHN0YXJ0dXBcblx0XHRcdFx0c3RvcmFnZVNlcnZpY2UucmVtb3ZlKFdvcmtiZW5jaC5fUEFSVF9WSVNJQklMSVRZX0tFWSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBPdmVybGF5cyB0aGUgcGVyc2lzdGVkIHBhcnQgdmlzaWJpbGl0eSBvbiB0b3Agb2YgdGhlIGN1cnJlbnRcblx0ICogKGxheW91dC1wb2xpY3kgZGVmYXVsdCkgYHBhcnRWaXNpYmlsaXR5YCBzdGF0ZS4gTXVzdCBydW4gYmVmb3JlIHRoZVxuXHQgKiBgV29ya2JlbmNoQ29udGV4dEtleXNIYW5kbGVyYCByZWFkcyB0aGUgaW5pdGlhbCB2aXNpYmlsaXR5IHNvIHRoYXRcblx0ICogY29udGV4dCBrZXlzIGxpa2UgYGF1eGlsaWFyeUJhclZpc2libGVgIHJlZmxlY3QgdGhlIHJlc3RvcmVkIHN0YXRlIG9uXG5cdCAqIHJlbG9hZCByYXRoZXIgdGhhbiB0aGUgaGFyZGNvZGVkIGRlZmF1bHRzLlxuXHQgKi9cblx0cHJpdmF0ZSBfYXBwbHlQZXJzaXN0ZWRQYXJ0VmlzaWJpbGl0eSgpOiB2b2lkIHtcblx0XHRjb25zdCBzYXZlZFBhcnRWaXNpYmlsaXR5ID0gdGhpcy5fbG9hZFBhcnRWaXNpYmlsaXR5KHRoaXMuc3RvcmFnZVNlcnZpY2UpO1xuXHRcdHRoaXMucGFydFZpc2liaWxpdHkuZWRpdG9yID0gc2F2ZWRQYXJ0VmlzaWJpbGl0eS5lZGl0b3IgPz8gdGhpcy5wYXJ0VmlzaWJpbGl0eS5lZGl0b3I7XG5cdFx0dGhpcy5wYXJ0VmlzaWJpbGl0eS5hdXhpbGlhcnlCYXIgPSBzYXZlZFBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhciA/PyB0aGlzLnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhcjtcblx0XHR0aGlzLnBhcnRWaXNpYmlsaXR5LnNpZGViYXIgPSBzYXZlZFBhcnRWaXNpYmlsaXR5LnNpZGViYXIgPz8gdGhpcy5wYXJ0VmlzaWJpbGl0eS5zaWRlYmFyO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9zYXZlUGFydFZpc2liaWxpdHkoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubGF5b3V0UG9saWN5LnZpZXdwb3J0Q2xhc3MuZ2V0KCkgPT09ICdwaG9uZScpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFdvcmtiZW5jaC5fUEFSVF9WSVNJQklMSVRZX0tFWSwgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0ZWRpdG9yOiB0aGlzLnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdGF1eGlsaWFyeUJhcjogdGhpcy5wYXJ0VmlzaWJpbGl0eS5hdXhpbGlhcnlCYXIsXG5cdFx0XHRzaWRlYmFyOiB0aGlzLnBhcnRWaXNpYmlsaXR5LnNpZGViYXIsXG5cdFx0fSksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cblxuXHRwcml2YXRlIF9sb2FkUGFydFNpemVzKHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UpOiBJUGFydFNpemVzU3RhdGUge1xuXHRcdGNvbnN0IHJhdyA9IHN0b3JhZ2VTZXJ2aWNlLmdldChXb3JrYmVuY2guX1BBUlRfU0laRVNfS0VZLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRpZiAocmF3KSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gSlNPTi5wYXJzZShyYXcpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIENvcnJ1cHRlZCBkYXRhIFx1MjAxNCByZW1vdmUgdGhlIGJhZCBrZXkgc28gd2UgZG9uJ3Qga2VlcCB3YXJuaW5nIG9uIGV2ZXJ5IHN0YXJ0dXBcblx0XHRcdFx0c3RvcmFnZVNlcnZpY2UucmVtb3ZlKFdvcmtiZW5jaC5fUEFSVF9TSVpFU19LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4ge307XG5cdH1cblxuXHRwcml2YXRlIF9zYXZlUGFydFNpemVzKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy53b3JrYmVuY2hHcmlkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIGVkaXRvci1wYXJ0IGdyaWQgbm9kZSBob3N0cyB0aGUgZG9ja2VkIGF1eGlsaWFyeSBiYXIgaW4gc2luZ2xlLXBhbmUsIHNvXG5cdFx0Ly8gaXQgaXMgXCJ2aXNpYmxlXCIgd2hlbmV2ZXIgdGhlIGVkaXRvciBPUiB0aGUgZGV0YWlsIGlzIHNob3duLiBVc2UgdGhlIG5vZGUnc1xuXHRcdC8vIHJlYWwgdmlzaWJpbGl0eSAobm90IGp1c3QgYHBhcnRWaXNpYmlsaXR5LmVkaXRvcmApIHNvIGEgRGV0YWlsLW9ubHkgc2Vzc2lvblxuXHRcdC8vIHJlY29yZHMgaXRzICpjdXJyZW50KiBjb2xsYXBzZWQgbm9kZSB3aWR0aCBcdTIwMTQgcmVhZGluZyB0aGUgc3RhbGUgY2FjaGVkIHZpc2libGVcblx0XHQvLyBzaXplICh3aWRlKSBoZXJlIHdvdWxkIHJlc3RvcmUgYSB3aWRlIG5vZGUgb24gcmVsb2FkIGFuZCBmbGlja2VyIHRoZSBlZGl0b3Jcblx0XHQvLyBvcGVuIHZpYSB0aGUgd2lkdGgtYmFzZWQgcmV2ZWFsLXN5bmMuIENsYXNzaWMgbGF5b3V0IGlzIHVuYWZmZWN0ZWRcblx0XHQvLyAoYF9lZGl0b3JOb2RlVmlzaWJsZWAgcmV0dXJucyBgcGFydFZpc2liaWxpdHkuZWRpdG9yYCB0aGVyZSkuXG5cdFx0Y29uc3QgZWRpdG9yTm9kZVZpc2libGUgPSB0aGlzLl9lZGl0b3JOb2RlU2hvdWxkQmVWaXNpYmxlKCk7XG5cdFx0Y29uc3QgZWRpdG9yR3JpZFdpZHRoID0gdGhpcy5fcGVyc2lzdGVkR3JpZFZpZXdTaXplKHRoaXMuZWRpdG9yUGFydFZpZXcsICd3aWR0aCcsIGVkaXRvck5vZGVWaXNpYmxlKTtcblx0XHRsZXQgZWRpdG9yV2lkdGggPSB0aGlzLl9wZXJzaXN0ZWRFZGl0b3JXaWR0aChlZGl0b3JHcmlkV2lkdGgpO1xuXG5cdFx0Ly8gQSBzdWItbWluaW11bSBtZWFzdXJlbWVudCBpcyBuZXZlciBhIHJlYWwgdXNlciB3aWR0aDogdGhlIGVkaXRvciBtYXkgYmVcblx0XHQvLyBoaWRkZW4gKHNpbmdsZS1wYW5lIHJldHVybnMgdGhlIGRldGFpbC1vbmx5IG5vZGUgbWludXMgdGhlIGRldGFpbCB3aWR0aCxcblx0XHQvLyBpLmUuIH4wKSwgb3IgdGhlIGhpZ2gtcHJpb3JpdHkgc2Vzc2lvbnMgcGFydCBtYXkgaGF2ZSB0cmFuc2llbnRseSBzcXVlZXplZFxuXHRcdC8vIHRoZSBub2RlIGJlbG93IGl0cyBtaW5pbXVtLiBQZXJzaXN0aW5nIGl0IHdvdWxkIHJlYnVpbGQgdGhlIGVkaXRvciBhdCBpdHNcblx0XHQvLyAzMDBweCBtaW5pbXVtIG9uIHJlbG9hZCBhbmQgbG9zZSB0aGUgbGFzdCB1c2VyLXNlbGVjdGVkIHdpZHRoLiBQcmVzZXJ2ZSB0aGVcblx0XHQvLyBsYXN0IHZhbGlkIGdsb2JhbCB3aWR0aCBpbnN0ZWFkIChvciBvbWl0IGl0IHNvIHRoZSBkZWZhdWx0IGlzIHVzZWQpLiBUaGVcblx0XHQvLyBkZXNjcmlwdG9yIGtlZXBzIHRoZSBlZGl0b3IgY29udHJpYnV0aW9uIGF0IHplcm8gd2hpbGUgdGhlIGVkaXRvciBwYXJ0IGlzXG5cdFx0Ly8gaGlkZGVuLCBzbyBrZWVwaW5nIGEgdmFsaWQgd2lkdGggaGVyZSBpcyBzYWZlLlxuXHRcdGlmIChlZGl0b3JXaWR0aCA9PT0gdW5kZWZpbmVkIHx8IGVkaXRvcldpZHRoIDwgRURJVE9SX1BBUlRfTUlOSU1VTV9XSURUSCkge1xuXHRcdFx0ZWRpdG9yV2lkdGggPSAodGhpcy5fc2F2ZWRQYXJ0U2l6ZXMuZWRpdG9yICE9PSB1bmRlZmluZWQgJiYgdGhpcy5fc2F2ZWRQYXJ0U2l6ZXMuZWRpdG9yID49IEVESVRPUl9QQVJUX01JTklNVU1fV0lEVEgpXG5cdFx0XHRcdD8gdGhpcy5fc2F2ZWRQYXJ0U2l6ZXMuZWRpdG9yXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBUcmFjayB0aGUgbGF0ZXN0IGdvb2Qgd2lkdGggc28gYSBsYXRlciBzaHV0ZG93bi10aW1lIHNxdWVlemUgZmFsbHMgYmFjayB0byBpdC5cblx0XHRcdHRoaXMuX3NhdmVkUGFydFNpemVzID0geyAuLi50aGlzLl9zYXZlZFBhcnRTaXplcywgZWRpdG9yOiBlZGl0b3JXaWR0aCB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHNpemVzOiBJUGFydFNpemVzU3RhdGUgPSB7XG5cdFx0XHRzaWRlYmFyOiB0aGlzLl9wZXJzaXN0ZWRHcmlkVmlld1NpemUodGhpcy5zaWRlQmFyUGFydFZpZXcsICd3aWR0aCcsIHRoaXMucGFydFZpc2liaWxpdHkuc2lkZWJhciksXG5cdFx0XHRhdXhpbGlhcnlCYXI6IHRoaXMuX3BlcnNpc3RlZEdyaWRWaWV3U2l6ZSh0aGlzLmF1eGlsaWFyeUJhclBhcnRWaWV3LCAnd2lkdGgnLCB0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSksXG5cdFx0XHRzZXNzaW9uczogdGhpcy5fcGVyc2lzdGVkR3JpZFZpZXdTaXplKHRoaXMuc2Vzc2lvbnNQYXJ0VmlldywgJ3dpZHRoJywgdGhpcy5fZWZmZWN0aXZlVmlzaWJsZShQYXJ0cy5TRVNTSU9OU19QQVJUKSksXG5cdFx0XHRlZGl0b3I6IGVkaXRvcldpZHRoLFxuXHRcdFx0cGFuZWw6IHRoaXMuX3BlcnNpc3RlZEdyaWRWaWV3U2l6ZSh0aGlzLnBhbmVsUGFydFZpZXcsICdoZWlnaHQnLCB0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKFBhcnRzLlBBTkVMX1BBUlQpKSxcblx0XHR9O1xuXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShXb3JrYmVuY2guX1BBUlRfU0laRVNfS0VZLCBKU09OLnN0cmluZ2lmeShzaXplcyksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHRwcml2YXRlIHJlbmRlcldvcmtiZW5jaChpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlOiBOb3RpZmljYXRpb25TZXJ2aWNlLCBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTogdm9pZCB7XG5cdFx0Ly8gQVJJQSAmIFNpZ25hbHNcblx0XHRzZXRBUklBQ29udGFpbmVyKHRoaXMubWFpbkNvbnRhaW5lcik7XG5cdFx0c2V0UHJvZ3Jlc3NBY2Nlc3NpYmlsaXR5U2lnbmFsU2NoZWR1bGVyKChtc0RlbGF5VGltZTogbnVtYmVyLCBtc0xvb3BUaW1lPzogbnVtYmVyKSA9PiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBY2Nlc3NpYmlsaXR5UHJvZ3Jlc3NTaWduYWxTY2hlZHVsZXIsIG1zRGVsYXlUaW1lLCBtc0xvb3BUaW1lKSk7XG5cblx0XHQvLyBJbml0aWFsaXplIHZpZXdwb3J0IGNsYXNzaWZpY2F0aW9uIGJlZm9yZSBidWlsZGluZyBsYXlvdXQgY2xhc3Nlc1xuXHRcdGNvbnN0IGluaXRpYWxEaW1lbnNpb24gPSBnZXRDbGllbnRBcmVhKHRoaXMucGFyZW50KTtcblx0XHR0aGlzLmxheW91dFBvbGljeS51cGRhdGUoaW5pdGlhbERpbWVuc2lvbi53aWR0aCwgaW5pdGlhbERpbWVuc2lvbi5oZWlnaHQpO1xuXG5cdFx0Ly8gQXBwbHkgaW5pdGlhbCBwYXJ0IHZpc2liaWxpdHkgZnJvbSBsYXlvdXQgcG9saWN5IChwaG9uZSBoaWRlcyBzaWRlYmFyLCBldGMuKVxuXHRcdGNvbnN0IHZpc2liaWxpdHlEZWZhdWx0cyA9IHRoaXMubGF5b3V0UG9saWN5LmdldFBhcnRWaXNpYmlsaXR5RGVmYXVsdHMoKTtcblx0XHR0aGlzLnBhcnRWaXNpYmlsaXR5LnNpZGViYXIgPSB2aXNpYmlsaXR5RGVmYXVsdHMuc2lkZWJhcjtcblx0XHR0aGlzLnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhciA9IHZpc2liaWxpdHlEZWZhdWx0cy5hdXhpbGlhcnlCYXI7XG5cdFx0dGhpcy5wYXJ0VmlzaWJpbGl0eS5wYW5lbCA9IHZpc2liaWxpdHlEZWZhdWx0cy5wYW5lbDtcblx0XHR0aGlzLnBhcnRWaXNpYmlsaXR5LnNlc3Npb25zID0gdmlzaWJpbGl0eURlZmF1bHRzLnNlc3Npb25zO1xuXHRcdHRoaXMucGFydFZpc2liaWxpdHkuZWRpdG9yID0gdmlzaWJpbGl0eURlZmF1bHRzLmVkaXRvcjtcblx0XHR0aGlzLl9hcHBseVBlcnNpc3RlZFBhcnRWaXNpYmlsaXR5KCk7XG5cblx0XHQvLyBMb2FkIHNhdmVkIGdyaWQgcGFydCBzaXplcyBcdTIwMTQgdGhlc2Ugd2lsbCBiZSBjb25zdW1lZCB3aGVuIGJ1aWxkaW5nIHRoZVxuXHRcdC8vIGdyaWQgZGVzY3JpcHRvciBzbyBlZGl0b3Ivc2lkZWJhci9hdXhiYXIvcGFuZWwgcmVzdG9yZSB0byB0aGVpciBwcmV2aW91c1xuXHRcdC8vIGRpbWVuc2lvbnMgYWNyb3NzIHJlbG9hZHMuXG5cdFx0dGhpcy5fc2F2ZWRQYXJ0U2l6ZXMgPSB0aGlzLl9sb2FkUGFydFNpemVzKHN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRpZiAodGhpcy5fc2F2ZWRQYXJ0U2l6ZXMuYXV4aWxpYXJ5QmFyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3Jlc3RvcmVBdXhpbGlhcnlCYXJXaWR0aCh0aGlzLl9zYXZlZFBhcnRTaXplcy5hdXhpbGlhcnlCYXIpO1xuXHRcdH1cblxuXHRcdC8vIFN0YXRlIHNwZWNpZmljIGNsYXNzZXNcblx0XHRjb25zdCBwbGF0Zm9ybUNsYXNzID0gaXNXaW5kb3dzID8gJ3dpbmRvd3MnIDogaXNMaW51eCA/ICdsaW51eCcgOiAnbWFjJztcblx0XHRjb25zdCB3b3JrYmVuY2hDbGFzc2VzID0gY29hbGVzY2UoW1xuXHRcdFx0J21vbmFjby13b3JrYmVuY2gnLFxuXHRcdFx0J2FnZW50LXNlc3Npb25zLXdvcmtiZW5jaCcsXG5cdFx0XHRMYXlvdXRDbGFzc2VzLk1PREVSTl9VSV9UQUJTLFxuXHRcdFx0Ly8gTGF5b3V0Q2xhc3Nlcy5TSEVMTF9HUkFESUVOVF9CQUNLR1JPVU5ELFxuXHRcdFx0cGxhdGZvcm1DbGFzcyxcblx0XHRcdGlzV2ViID8gJ3dlYicgOiB1bmRlZmluZWQsXG5cdFx0XHRpc0Nocm9tZSA/ICdjaHJvbWl1bScgOiBpc0ZpcmVmb3ggPyAnZmlyZWZveCcgOiBpc1NhZmFyaSA/ICdzYWZhcmknIDogdW5kZWZpbmVkLFxuXHRcdFx0Li4udGhpcy5nZXRMYXlvdXRDbGFzc2VzKCksXG5cdFx0XHQuLi4odGhpcy5vcHRpb25zPy5leHRyYUNsYXNzZXMgPyB0aGlzLm9wdGlvbnMuZXh0cmFDbGFzc2VzIDogW10pXG5cdFx0XSk7XG5cblx0XHR0aGlzLm1haW5Db250YWluZXIuY2xhc3NMaXN0LmFkZCguLi53b3JrYmVuY2hDbGFzc2VzKTtcblxuXHRcdC8vIEFwcGx5IGZvbnQgYWxpYXNpbmdcblx0XHR0aGlzLnVwZGF0ZUZvbnRBbGlhc2luZyh1bmRlZmluZWQsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdC8vIFdhcm0gdXAgZm9udCBjYWNoZSBpbmZvcm1hdGlvbiBiZWZvcmUgYnVpbGRpbmcgdXAgdG9vIG1hbnkgZG9tIGVsZW1lbnRzXG5cdFx0dGhpcy5yZXN0b3JlRm9udEluZm8oc3RvcmFnZVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdC8vIENyZWF0ZSBQYXJ0cyAoZWRpdG9yIHN0YXJ0cyBoaWRkZW4gYW5kIGlzIHNob3duIHdoZW4gYW4gZWRpdG9yIG9wZW5zKVxuXHRcdGZvciAoY29uc3QgeyBpZCwgcm9sZSwgY2xhc3NlcyB9IG9mIFtcblx0XHRcdHsgaWQ6IFBhcnRzLlRJVExFQkFSX1BBUlQsIHJvbGU6ICdub25lJywgY2xhc3NlczogWyd0aXRsZWJhciddIH0sXG5cdFx0XHR7IGlkOiBQYXJ0cy5TSURFQkFSX1BBUlQsIHJvbGU6ICdub25lJywgY2xhc3NlczogWydzaWRlYmFyJywgJ2xlZnQnXSB9LFxuXHRcdFx0eyBpZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHJvbGU6ICdub25lJywgY2xhc3NlczogWydhdXhpbGlhcnliYXInLCAnYmFzZXBhbmVsJywgJ3JpZ2h0J10gfSxcblx0XHRcdHsgaWQ6IFBhcnRzLlBBTkVMX1BBUlQsIHJvbGU6ICdub25lJywgY2xhc3NlczogWydwYW5lbCcsICdiYXNlcGFuZWwnLCBwb3NpdGlvblRvU3RyaW5nKHRoaXMuZ2V0UGFuZWxQb3NpdGlvbigpKV0gfSxcblx0XHRdKSB7XG5cdFx0XHRjb25zdCBwYXJ0Q29udGFpbmVyID0gdGhpcy5jcmVhdGVQYXJ0Q29udGFpbmVyKGlkLCByb2xlLCBjbGFzc2VzKTtcblxuXHRcdFx0bWFyayhgY29kZS93aWxsQ3JlYXRlUGFydC8ke2lkfWApO1xuXHRcdFx0dGhpcy5nZXRQYXJ0KGlkKS5jcmVhdGUocGFydENvbnRhaW5lcik7XG5cdFx0XHRtYXJrKGBjb2RlL2RpZENyZWF0ZVBhcnQvJHtpZH1gKTtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgRWRpdG9yIFBhcnQgKGhpZGRlbiBieSBkZWZhdWx0KVxuXHRcdHRoaXMuY3JlYXRlRWRpdG9yUGFydCgpO1xuXG5cdFx0Ly8gQ3JlYXRlIFNlc3Npb25zIFBhcnRcblx0XHR0aGlzLmNyZWF0ZVNlc3Npb25zUGFydCgpO1xuXG5cdFx0Ly8gQ3JlYXRlIEN1c3RvbSBWaWV3IEdyaWQgUGFydCAoaGlkZGVuIGJ5IGRlZmF1bHQpXG5cdFx0dGhpcy5jcmVhdGVDdXN0b21WaWV3R3JpZFBhcnQoKTtcblxuXHRcdC8vIE5vdGlmaWNhdGlvbiBIYW5kbGVyc1xuXHRcdHRoaXMuY3JlYXRlTm90aWZpY2F0aW9uc0hhbmRsZXJzKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHQvLyBBZGQgV29ya2JlbmNoIHRvIERPTVxuXHRcdHRoaXMucGFyZW50LmFwcGVuZENoaWxkKHRoaXMubWFpbkNvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU1vYmlsZVRpdGxlYmFyKCk6IHZvaWQge1xuXHRcdHRoaXMubW9iaWxlVG9wQmFyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRjb25zdCBtb2JpbGVUaXRsZWJhciA9IHRoaXMubW9iaWxlVG9wQmFyRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTW9iaWxlVGl0bGViYXJQYXJ0LCB0aGlzLm1haW5Db250YWluZXIpKTtcblx0XHR0aGlzLm1vYmlsZVRvcEJhckVsZW1lbnQgPSBtb2JpbGVUaXRsZWJhci5lbGVtZW50O1xuXG5cdFx0Ly8gSGFtYnVyZ2VyOiB0b2dnbGUgc2lkZWJhciBkcmF3ZXIgb3ZlcmxheVxuXHRcdHRoaXMubW9iaWxlVG9wQmFyRGlzcG9zYWJsZXMuYWRkKG1vYmlsZVRpdGxlYmFyLm9uRGlkQ2xpY2tIYW1idXJnZXIoKCkgPT4ge1xuXHRcdFx0dGhpcy50b2dnbGVNb2JpbGVTaWRlYmFyRHJhd2VyKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTmV3IHNlc3Npb246IG9wZW4gbmV3IGNoYXQgdmlldyBhbmQgZGlzbWlzcyB0aGUgc2lkZWJhciBkcmF3ZXJcblx0XHQvLyBzbyB0aGUgbmV3IHNlc3Npb24gdmlldyBiZWNvbWVzIHZpc2libGUuIGNyZWF0ZU1vYmlsZVRpdGxlYmFyKCkgaXNcblx0XHQvLyBvbmx5IGludm9rZWQgaW4gcGhvbmUgbGF5b3V0LCBzbyBjbG9zaW5nIHRoZSBkcmF3ZXIgaGVyZSBpcyBzYWZlLlxuXHRcdHRoaXMubW9iaWxlVG9wQmFyRGlzcG9zYWJsZXMuYWRkKG1vYmlsZVRpdGxlYmFyLm9uRGlkQ2xpY2tOZXdTZXNzaW9uKCgpID0+IHtcblx0XHRcdHRoaXMuc2Vzc2lvbnNTZXJ2aWNlLm9wZW5OZXdTZXNzaW9uKCk7XG5cdFx0XHR0aGlzLmNsb3NlTW9iaWxlU2lkZWJhckRyYXdlcigpO1xuXHRcdFx0dGhpcy5zZXNzaW9uc1BhcnRTZXJ2aWNlLmZvY3VzU2Vzc2lvbih0aGlzLnNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHRvZ2dsZU1vYmlsZVNpZGViYXJEcmF3ZXIoKTogdm9pZCB7XG5cdFx0Y29uc3QgaXNPcGVuID0gdGhpcy5wYXJ0VmlzaWJpbGl0eS5zaWRlYmFyO1xuXHRcdGlmIChpc09wZW4pIHtcblx0XHRcdHRoaXMuY2xvc2VNb2JpbGVTaWRlYmFyRHJhd2VyKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMub3Blbk1vYmlsZVNpZGViYXJEcmF3ZXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9wZW5Nb2JpbGVTaWRlYmFyRHJhd2VyKCk6IHZvaWQge1xuXHRcdC8vIFB1c2ggYSBoaXN0b3J5IGVudHJ5IHNvIHRoZSBBbmRyb2lkIGJhY2sgYnV0dG9uIGRpc21pc3NlcyB0aGUgZHJhd2VyLlxuXHRcdC8vIE11c3QgY29tZSBiZWZvcmUgc2V0U2lkZUJhckhpZGRlbihmYWxzZSkgc28gbGF5b3V0TW9iaWxlU2lkZWJhcigpIHNlZXNcblx0XHQvLyB0aGUgZHJhd2VyIHN0YXRlLlxuXHRcdGlmICghdGhpcy5tb2JpbGVOYXZTdGFjay5oYXMoJ3NpZGViYXInKSkge1xuXHRcdFx0dGhpcy5tb2JpbGVOYXZTdGFjay5wdXNoKCdzaWRlYmFyJyk7XG5cdFx0fVxuXG5cdFx0Ly8gU2hvdyBzaWRlYmFyIGluIGdyaWQgXHUyMDE0IHRoZSBhY3R1YWwgZHJhd2VyIGRpbWVuc2lvbnMgYXJlIGFwcGxpZWQgYnlcblx0XHQvLyBsYXlvdXRNb2JpbGVTaWRlYmFyKCkgZnJvbSB3aXRoaW4gbGF5b3V0KCksIHdoaWNoIHVzZXMgdGhlIGZ1bGxcblx0XHQvLyB2aWV3cG9ydCB3aWR0aCBiZWxvdyB0aGUgbW9iaWxlIHRvcCBiYXIgb24gcGhvbmUuIFRoZSB0b2dnbGUgYnV0dG9uXG5cdFx0Ly8gaW4gdGhlIHRvcCBiYXIgcmVtYWlucyB2aXNpYmxlIGFuZCBpcyB1c2VkIHRvIGNsb3NlIHRoZSBkcmF3ZXIuXG5cdFx0dGhpcy5zZXRTaWRlQmFySGlkZGVuKGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgY2xvc2VNb2JpbGVTaWRlYmFyRHJhd2VyKCk6IHZvaWQge1xuXHRcdC8vIEhpZGUgc2lkZWJhciBpbiBncmlkXG5cdFx0dGhpcy5zZXRTaWRlQmFySGlkZGVuKHRydWUpO1xuXG5cdFx0Ly8gU3luYyB0aGUgbmF2aWdhdGlvbiBzdGFjayB3aXRoIHRoZSBicm93c2VyIGhpc3Rvcnk6IGlmIHRoZXJlIGlzIGFcblx0XHQvLyBwZW5kaW5nICdzaWRlYmFyJyBlbnRyeSAoVUktaW5pdGlhdGVkIGNsb3NlKSwgcmV3aW5kIGhpc3Rvcnkgd2l0aG91dFxuXHRcdC8vIGZpcmluZyBvbkRpZFBvcC4gSWYgd2UncmUgYmVpbmcgY2FsbGVkIGZyb20gdGhlIGJhY2stYnV0dG9uIHBhdGhcblx0XHQvLyAob25EaWRQb3AgYWxyZWFkeSBmaXJlZCksIHRoaXMgaXMgYSBuby1vcC5cblx0XHRpZiAodGhpcy5tb2JpbGVOYXZTdGFjay5oYXMoJ3NpZGViYXInKSkge1xuXHRcdFx0dGhpcy5tb2JpbGVOYXZTdGFjay5wb3BTaWxlbnRseSgnc2lkZWJhcicpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlTm90aWZpY2F0aW9uc0hhbmRsZXJzKFxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0bm90aWZpY2F0aW9uU2VydmljZTogTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCk6IHZvaWQge1xuXHRcdC8vIEluc3RhbnRpYXRlIE5vdGlmaWNhdGlvbiBjb21wb25lbnRzXG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uc0NlbnRlciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGlmaWNhdGlvbnNDZW50ZXIsIHRoaXMubWFpbkNvbnRhaW5lciwgbm90aWZpY2F0aW9uU2VydmljZS5tb2RlbCkpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbnNUb2FzdHMgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RpZmljYXRpb25zVG9hc3RzLCB0aGlzLm1haW5Db250YWluZXIsIG5vdGlmaWNhdGlvblNlcnZpY2UubW9kZWwpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RpZmljYXRpb25zQWxlcnRzLCBub3RpZmljYXRpb25TZXJ2aWNlLm1vZGVsKSk7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uc1N0YXR1cyA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGlmaWNhdGlvbnNTdGF0dXMsIG5vdGlmaWNhdGlvblNlcnZpY2UubW9kZWwpKTtcblxuXHRcdC8vIFZpc2liaWxpdHlcblx0XHR0aGlzLl9yZWdpc3Rlcihub3RpZmljYXRpb25zQ2VudGVyLm9uRGlkQ2hhbmdlVmlzaWJpbGl0eSgoKSA9PiB7XG5cdFx0XHRub3RpZmljYXRpb25zU3RhdHVzLnVwZGF0ZShub3RpZmljYXRpb25zQ2VudGVyLmlzVmlzaWJsZSwgbm90aWZpY2F0aW9uc1RvYXN0cy5pc1Zpc2libGUpO1xuXHRcdFx0bm90aWZpY2F0aW9uc1RvYXN0cy51cGRhdGUobm90aWZpY2F0aW9uc0NlbnRlci5pc1Zpc2libGUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG5vdGlmaWNhdGlvbnNUb2FzdHMub25EaWRDaGFuZ2VWaXNpYmlsaXR5KCgpID0+IHtcblx0XHRcdG5vdGlmaWNhdGlvbnNTdGF0dXMudXBkYXRlKG5vdGlmaWNhdGlvbnNDZW50ZXIuaXNWaXNpYmxlLCBub3RpZmljYXRpb25zVG9hc3RzLmlzVmlzaWJsZSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgQ29tbWFuZHNcblx0XHRyZWdpc3Rlck5vdGlmaWNhdGlvbkNvbW1hbmRzKG5vdGlmaWNhdGlvbnNDZW50ZXIsIG5vdGlmaWNhdGlvbnNUb2FzdHMsIG5vdGlmaWNhdGlvblNlcnZpY2UubW9kZWwpO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgbm90aWZpY2F0aW9uIGFjY2Vzc2libGUgdmlld1xuXHRcdEFjY2Vzc2libGVWaWV3UmVnaXN0cnkucmVnaXN0ZXIobmV3IE5vdGlmaWNhdGlvbkFjY2Vzc2libGVWaWV3KCkpO1xuXG5cdFx0Ly8gVGhlIHNoYXJlZCBub3RpZmljYXRpb24gY29udHJvbGxlcnMgYXBwbHkgYSB0b3AtcmlnaHQgaW5saW5lIG9mZnNldCBiYXNlZCBvbiB0aGVcblx0XHQvLyBkZWZhdWx0IHdvcmtiZW5jaCBjdXN0b20gdGl0bGViYXIgaGVpZ2h0LiBUaGUgc2Vzc2lvbnMgd29ya2JlbmNoIGhhcyBpdHMgb3duXG5cdFx0Ly8gZml4ZWQgY2hyb21lLCBzbyByZS1hcHBseSB0aGUgc2Vzc2lvbnMtc3BlY2lmaWMgdG9wLXJpZ2h0IG9mZnNldCBhZnRlciB0aGV5IHJ1bi5cblx0XHR0aGlzLnJlZ2lzdGVyU2Vzc2lvbnNOb3RpZmljYXRpb25PZmZzZXRzKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBub3RpZmljYXRpb25zQ2VudGVyLCBub3RpZmljYXRpb25zVG9hc3RzKTtcblxuXHRcdC8vIFJlZ2lzdGVyIHdpdGggTGF5b3V0XG5cdFx0dGhpcy5yZWdpc3Rlck5vdGlmaWNhdGlvbnMoe1xuXHRcdFx0b25EaWRDaGFuZ2VOb3RpZmljYXRpb25zVmlzaWJpbGl0eTogRXZlbnQubWFwKFxuXHRcdFx0XHRFdmVudC5hbnkobm90aWZpY2F0aW9uc1RvYXN0cy5vbkRpZENoYW5nZVZpc2liaWxpdHksIG5vdGlmaWNhdGlvbnNDZW50ZXIub25EaWRDaGFuZ2VWaXNpYmlsaXR5KSxcblx0XHRcdFx0KCkgPT4gbm90aWZpY2F0aW9uc1RvYXN0cy5pc1Zpc2libGUgfHwgbm90aWZpY2F0aW9uc0NlbnRlci5pc1Zpc2libGVcblx0XHRcdClcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJTZXNzaW9uc05vdGlmaWNhdGlvbk9mZnNldHMoXG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRub3RpZmljYXRpb25zQ2VudGVyOiBOb3RpZmljYXRpb25zQ2VudGVyLFxuXHRcdG5vdGlmaWNhdGlvbnNUb2FzdHM6IE5vdGlmaWNhdGlvbnNUb2FzdHNcblx0KTogdm9pZCB7XG5cdFx0Y29uc3QgYXBwbHlTZXNzaW9uc05vdGlmaWNhdGlvbk9mZnNldHMgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBwb3NpdGlvbiA9IGdldE5vdGlmaWNhdGlvbnNQb3NpdGlvbihjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRjb25zdCBub3RpZmljYXRpb25zQ2VudGVyQ29udGFpbmVyID0gdGhpcy5nZXRXb3JrYmVuY2hDaGlsZEJ5Q2xhc3NOYW1lKCdub3RpZmljYXRpb25zLWNlbnRlcicpO1xuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uc1RvYXN0c0NvbnRhaW5lciA9IHRoaXMuZ2V0V29ya2JlbmNoQ2hpbGRCeUNsYXNzTmFtZSgnbm90aWZpY2F0aW9ucy10b2FzdHMnKTtcblxuXHRcdFx0aWYgKHBvc2l0aW9uID09PSBOb3RpZmljYXRpb25zUG9zaXRpb24uVE9QX1JJR0hUKSB7XG5cdFx0XHRcdG5vdGlmaWNhdGlvbnNDZW50ZXJDb250YWluZXI/LnN0eWxlLnNldFByb3BlcnR5KCd0b3AnLCAnNDBweCcpO1xuXHRcdFx0XHRub3RpZmljYXRpb25zVG9hc3RzQ29udGFpbmVyPy5zdHlsZS5zZXRQcm9wZXJ0eSgndG9wJywgJzQwcHgnKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZExheW91dE1haW5Db250YWluZXIoKCkgPT4gYXBwbHlTZXNzaW9uc05vdGlmaWNhdGlvbk9mZnNldHMoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG5vdGlmaWNhdGlvbnNDZW50ZXIub25EaWRDaGFuZ2VWaXNpYmlsaXR5KCgpID0+IGFwcGx5U2Vzc2lvbnNOb3RpZmljYXRpb25PZmZzZXRzKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihub3RpZmljYXRpb25zVG9hc3RzLm9uRGlkQ2hhbmdlVmlzaWJpbGl0eSgoKSA9PiBhcHBseVNlc3Npb25zTm90aWZpY2F0aW9uT2Zmc2V0cygpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90aWZpY2F0aW9uc1NldHRpbmdzLk5PVElGSUNBVElPTlNfUE9TSVRJT04pKSB7XG5cdFx0XHRcdGFwcGx5U2Vzc2lvbnNOb3RpZmljYXRpb25PZmZzZXRzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRXb3JrYmVuY2hDaGlsZEJ5Q2xhc3NOYW1lKGNsYXNzTmFtZTogc3RyaW5nKTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgY2hpbGQgb2YgdGhpcy5tYWluQ29udGFpbmVyLmNoaWxkcmVuKSB7XG5cdFx0XHRpZiAoaXNIVE1MRWxlbWVudChjaGlsZCkgJiYgY2hpbGQuY2xhc3NMaXN0LmNvbnRhaW5zKGNsYXNzTmFtZSkpIHtcblx0XHRcdFx0cmV0dXJuIGNoaWxkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVBhcnRDb250YWluZXIoaWQ6IHN0cmluZywgcm9sZTogc3RyaW5nLCBjbGFzc2VzOiBzdHJpbmdbXSk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBwYXJ0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0cGFydC5jbGFzc0xpc3QuYWRkKCdwYXJ0JywgLi4uY2xhc3Nlcyk7XG5cdFx0cGFydC5pZCA9IGlkO1xuXHRcdHBhcnQuc2V0QXR0cmlidXRlKCdyb2xlJywgcm9sZSk7XG5cdFx0cmV0dXJuIHBhcnQ7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUVkaXRvclBhcnQoKTogdm9pZCB7XG5cdFx0Y29uc3QgZWRpdG9yUGFydENvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGVkaXRvclBhcnRDb250YWluZXIuY2xhc3NMaXN0LmFkZCgncGFydCcsICdlZGl0b3InKTtcblx0XHRlZGl0b3JQYXJ0Q29udGFpbmVyLmlkID0gUGFydHMuRURJVE9SX1BBUlQ7XG5cdFx0ZWRpdG9yUGFydENvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbWFpbicpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihlZGl0b3JQYXJ0Q29udGFpbmVyLCBFdmVudFR5cGUuRk9DVVNfSU4sICgpID0+IHRoaXMuX3Jlc3RvcmVFZGl0b3JQYXJ0T25BY3RpdmF0aW9uKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlRG93bkxpc3RlbmVyKGVkaXRvclBhcnRDb250YWluZXIsICgpID0+IHRoaXMuX3Jlc3RvcmVFZGl0b3JQYXJ0T25BY3RpdmF0aW9uKCkpKTtcblx0XHR0aGlzLl9lZGl0b3JQYXJ0Q29udGFpbmVyID0gZWRpdG9yUGFydENvbnRhaW5lcjtcblxuXHRcdG1hcmsoJ2NvZGUvd2lsbENyZWF0ZVBhcnQvd29ya2JlbmNoLnBhcnRzLmVkaXRvcicpO1xuXHRcdHRoaXMuZ2V0UGFydChQYXJ0cy5FRElUT1JfUEFSVCkuY3JlYXRlKGVkaXRvclBhcnRDb250YWluZXIsIHsgcmVzdG9yZVByZXZpb3VzU3RhdGU6IGZhbHNlIH0pO1xuXHRcdG1hcmsoJ2NvZGUvZGlkQ3JlYXRlUGFydC93b3JrYmVuY2gucGFydHMuZWRpdG9yJyk7XG5cblx0XHR0aGlzLm1haW5Db250YWluZXIuYXBwZW5kQ2hpbGQoZWRpdG9yUGFydENvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVNlc3Npb25zUGFydCgpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uc1BhcnRDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRzZXNzaW9uc1BhcnRDb250YWluZXIuY2xhc3NMaXN0LmFkZCgncGFydCcsICdzZXNzaW9uc3BhcnQnLCAnYmFzZXBhbmVsJywgJ3JpZ2h0JywgQUdFTlRTX1BBUlRfQ0FSRF9DTEFTUyk7XG5cdFx0c2Vzc2lvbnNQYXJ0Q29udGFpbmVyLmlkID0gUGFydHMuU0VTU0lPTlNfUEFSVDtcblx0XHRzZXNzaW9uc1BhcnRDb250YWluZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ21haW4nKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIoc2Vzc2lvbnNQYXJ0Q29udGFpbmVyLCBFdmVudFR5cGUuRk9DVVNfSU4sICgpID0+IHRoaXMuX3Jlc3RvcmVTZXNzaW9uc1BhcnRPbkFjdGl2YXRpb24oKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VEb3duTGlzdGVuZXIoc2Vzc2lvbnNQYXJ0Q29udGFpbmVyLCAoKSA9PiB0aGlzLl9yZXN0b3JlU2Vzc2lvbnNQYXJ0T25BY3RpdmF0aW9uKCkpKTtcblxuXHRcdG1hcmsoYGNvZGUvd2lsbENyZWF0ZVBhcnQvJHtQYXJ0cy5TRVNTSU9OU19QQVJUfWApO1xuXHRcdHRoaXMuZ2V0UGFydChQYXJ0cy5TRVNTSU9OU19QQVJUKS5jcmVhdGUoc2Vzc2lvbnNQYXJ0Q29udGFpbmVyKTtcblx0XHRtYXJrKGBjb2RlL2RpZENyZWF0ZVBhcnQvJHtQYXJ0cy5TRVNTSU9OU19QQVJUfWApO1xuXG5cdFx0dGhpcy5tYWluQ29udGFpbmVyLmFwcGVuZENoaWxkKHNlc3Npb25zUGFydENvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIF9yZXN0b3JlU2Vzc2lvbnNQYXJ0T25BY3RpdmF0aW9uKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy53b3JrYmVuY2hHcmlkIHx8ICF0aGlzLmlzVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCwgbWFpbldpbmRvdykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9yZXN0b3JlTWluaW1pemVkUGFydE9uQWN0aXZhdGlvbih0aGlzLnNlc3Npb25zUGFydFZpZXcsIHRoaXMuZWRpdG9yUGFydFZpZXcpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzdG9yZUVkaXRvclBhcnRPbkFjdGl2YXRpb24oKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLndvcmtiZW5jaEdyaWQgfHwgIXRoaXMuaXNWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJULCBtYWluV2luZG93KSB8fCAhdGhpcy5pc1Zpc2libGUoUGFydHMuU0VTU0lPTlNfUEFSVCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9yZXN0b3JlTWluaW1pemVkUGFydE9uQWN0aXZhdGlvbih0aGlzLmVkaXRvclBhcnRWaWV3LCB0aGlzLnNlc3Npb25zUGFydFZpZXcpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzdG9yZU1pbmltaXplZFBhcnRPbkFjdGl2YXRpb24odGFyZ2V0OiBJU2VyaWFsaXphYmxlVmlldywgc2libGluZzogSVNlcmlhbGl6YWJsZVZpZXcpOiB2b2lkIHtcblx0XHRjb25zdCB0YXJnZXRTaXplID0gdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRhcmdldCk7XG5cdFx0aWYgKHRhcmdldFNpemUud2lkdGggIT09IHRoaXMuX21pbmltdW1QYXJ0V2lkdGhGb3JBY3RpdmF0aW9uKHRhcmdldCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzaWJsaW5nU2l6ZSA9IHRoaXMud29ya2JlbmNoR3JpZC5nZXRWaWV3U2l6ZShzaWJsaW5nKTtcblx0XHRjb25zdCBzaWJsaW5nTWluaW11bVdpZHRoID0gdGhpcy5fbWluaW11bVBhcnRXaWR0aEZvckFjdGl2YXRpb24oc2libGluZyk7XG5cdFx0aWYgKHNpYmxpbmdTaXplLndpZHRoID4gc2libGluZ01pbmltdW1XaWR0aCkge1xuXHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLnJlc2l6ZVZpZXcoc2libGluZywgeyB3aWR0aDogc2libGluZ01pbmltdW1XaWR0aCwgaGVpZ2h0OiBzaWJsaW5nU2l6ZS5oZWlnaHQgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIF9taW5pbXVtUGFydFdpZHRoRm9yQWN0aXZhdGlvbih2aWV3OiBJU2VyaWFsaXphYmxlVmlldyk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHZpZXcubWluaW11bVdpZHRoO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVDdXN0b21WaWV3R3JpZFBhcnQoKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VzdG9tVmlld0dyaWRQYXJ0Q29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y3VzdG9tVmlld0dyaWRQYXJ0Q29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3BhcnQnLCAnY3VzdG9tdmlld2dyaWRwYXJ0JywgJ2Jhc2VwYW5lbCcsICdyaWdodCcsIEFHRU5UU19QQVJUX0NBUkRfQ0xBU1MpO1xuXHRcdGN1c3RvbVZpZXdHcmlkUGFydENvbnRhaW5lci5pZCA9IFBhcnRzLkNVU1RPTV9WSUVXX0dSSURfUEFSVDtcblx0XHRjdXN0b21WaWV3R3JpZFBhcnRDb250YWluZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ21haW4nKTtcblxuXHRcdG1hcmsoYGNvZGUvd2lsbENyZWF0ZVBhcnQvJHtQYXJ0cy5DVVNUT01fVklFV19HUklEX1BBUlR9YCk7XG5cdFx0dGhpcy5nZXRQYXJ0KFBhcnRzLkNVU1RPTV9WSUVXX0dSSURfUEFSVCkuY3JlYXRlKGN1c3RvbVZpZXdHcmlkUGFydENvbnRhaW5lcik7XG5cdFx0bWFyayhgY29kZS9kaWRDcmVhdGVQYXJ0LyR7UGFydHMuQ1VTVE9NX1ZJRVdfR1JJRF9QQVJUfWApO1xuXG5cdFx0dGhpcy5tYWluQ29udGFpbmVyLmFwcGVuZENoaWxkKGN1c3RvbVZpZXdHcmlkUGFydENvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIHJlc3RvcmUobGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UpOiB2b2lkIHtcblx0XHQvLyBVcGRhdGUgcGVyZiBtYXJrc1xuXHRcdG1hcmsoJ2NvZGUvZGlkU3RhcnRXb3JrYmVuY2gnKTtcblx0XHRwZXJmb3JtYW5jZS5tZWFzdXJlKCdwZXJmOiB3b3JrYmVuY2ggY3JlYXRlICYgcmVzdG9yZScsICdjb2RlL2RpZExvYWRXb3JrYmVuY2hNYWluJywgJ2NvZGUvZGlkU3RhcnRXb3JrYmVuY2gnKTtcblxuXHRcdC8vIFJlc3RvcmUgcGFydHMgKG9wZW4gZGVmYXVsdCB2aWV3IGNvbnRhaW5lcnMpXG5cdFx0dGhpcy5yZXN0b3JlUGFydHMoKTtcblxuXHRcdC8vIFJlc3RvcmUgdGhlIHNlc3Npb25zIHRoYXQgd2VyZSB2aXNpYmxlIGluIHRoZSBncmlkLlxuXHRcdHZvaWQgdGhpcy5zZXNzaW9uc1NlcnZpY2UucmVzdG9yZVZpc2libGVTZXNzaW9ucygpLmNhdGNoKGUgPT4ge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbV29ya2JlbmNoXSByZXN0b3JlVmlzaWJsZVNlc3Npb25zIGZhaWxlZCcsIGUpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gU2V0IGxpZmVjeWNsZSBwaGFzZSB0byBgUmVzdG9yZWRgXG5cdFx0bGlmZWN5Y2xlU2VydmljZS5waGFzZSA9IExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkO1xuXG5cdFx0Ly8gTWFyayBhcyByZXN0b3JlZFxuXHRcdHRoaXMuc2V0UmVzdG9yZWQoKTtcblxuXHRcdC8vIFNldCBsaWZlY3ljbGUgcGhhc2UgdG8gYEV2ZW50dWFsbHlgIGFmdGVyIGEgc2hvcnQgZGVsYXkgYW5kIHdoZW4gaWRsZSAobWluIDIuNXNlYywgbWF4IDVzZWMpXG5cdFx0Y29uc3QgZXZlbnR1YWxseVBoYXNlU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIocnVuV2hlbldpbmRvd0lkbGUobWFpbldpbmRvdywgKCkgPT4gbGlmZWN5Y2xlU2VydmljZS5waGFzZSA9IExpZmVjeWNsZVBoYXNlLkV2ZW50dWFsbHksIDI1MDApKTtcblx0XHR9LCAyNTAwKSk7XG5cdFx0ZXZlbnR1YWxseVBoYXNlU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlc3RvcmVQYXJ0cygpOiB2b2lkIHtcblx0XHQvLyBPcGVuIGRlZmF1bHQgdmlldyBjb250YWluZXJzIGZvciBlYWNoIHZpc2libGUgcGFydFxuXHRcdGNvbnN0IHBhcnRzVG9SZXN0b3JlOiB7IGxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb247IHZpc2libGU6IGJvb2xlYW4gfVtdID0gW1xuXHRcdFx0eyBsb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIsIHZpc2libGU6IHRoaXMucGFydFZpc2liaWxpdHkuc2lkZWJhciB9LFxuXHRcdFx0eyBsb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsLCB2aXNpYmxlOiB0aGlzLnBhcnRWaXNpYmlsaXR5LnBhbmVsIH0sXG5cdFx0XHR7IGxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyLCB2aXNpYmxlOiB0aGlzLnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhciB9LFxuXHRcdF07XG5cblx0XHRmb3IgKGNvbnN0IHsgbG9jYXRpb24sIHZpc2libGUgfSBvZiBwYXJ0c1RvUmVzdG9yZSkge1xuXHRcdFx0aWYgKHZpc2libGUpIHtcblx0XHRcdFx0Y29uc3QgZGVmYXVsdFZpZXdDb250YWluZXIgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXREZWZhdWx0Vmlld0NvbnRhaW5lcihsb2NhdGlvbik7XG5cdFx0XHRcdGlmIChkZWZhdWx0Vmlld0NvbnRhaW5lcikge1xuXHRcdFx0XHRcdHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2Uub3BlblBhbmVDb21wb3NpdGUoZGVmYXVsdFZpZXdDb250YWluZXIuaWQsIGxvY2F0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBJbml0aWFsaXphdGlvblxuXG5cdGluaXRMYXlvdXQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHQvLyBTZXJ2aWNlcyAtIGFjY2Vzc2luZyB0aGVzZSB0cmlnZ2VycyB0aGVpciBpbnN0YW50aWF0aW9uXG5cdFx0Ly8gd2hpY2ggY3JlYXRlcyBhbmQgcmVnaXN0ZXJzIHRoZSBwYXJ0c1xuXHRcdHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblx0XHR0aGlzLmVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSk7XG5cdFx0dGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdEZXNjcmlwdG9yU2VydmljZSk7XG5cdFx0dGhpcy5zZXNzaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zU2VydmljZSk7XG5cdFx0Ly8gRm9yY2VzIGVhZ2VyIGNyZWF0aW9uIG9mIHRoZSBzZXNzaW9ucyBwYXJ0IHNvIGl0IHJlZ2lzdGVycyBpdHNlbGYgd2l0aCB0aGVcblx0XHQvLyBsYXlvdXQgc2VydmljZSBiZWZvcmUgcmVuZGVyV29ya2JlbmNoKCkgbG9va3MgaXQgdXAgdmlhIGdldFBhcnQoKS5cblx0XHR0aGlzLnNlc3Npb25zUGFydFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zUGFydFNlcnZpY2UpO1xuXHRcdHRoaXMuY3VzdG9tVmlld1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUN1c3RvbVZpZXdTZXJ2aWNlKTtcblx0XHQvLyBTYW1lIGZvciB0aGUgY3VzdG9tIHZpZXcgZ3JpZCBwYXJ0LlxuXHRcdHRoaXMuY3VzdG9tVmlld0dyaWRQYXJ0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ3VzdG9tVmlld0dyaWRQYXJ0U2VydmljZSk7XG5cdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRhY2Nlc3Nvci5nZXQoSVRpdGxlU2VydmljZSk7XG5cblx0XHQvLyBSZXNvbHZlIHRoZSBzaW5nbGUtcGFuZSBsYXlvdXQgbW9kZSBvbmNlIChyZWxvYWQgdG8gdG9nZ2xlKS5cblx0XHR0aGlzLmxheW91dFBvbGljeS5zZXRTaW5nbGVQYW5lKHRoaXMuaXNTaW5nbGVQYW5lTGF5b3V0RW5hYmxlZCk7XG5cblx0XHQvLyBSZWdpc3RlciBsYXlvdXQgbGlzdGVuZXJzXG5cdFx0dGhpcy5yZWdpc3RlckxheW91dExpc3RlbmVycygpO1xuXG5cdFx0Ly8gQSBjdXN0b20gdmlldyByZXBsYWNlcyB0aGUgc2Vzc2lvbnMgZ3JpZCAoYW5kIHRoZSBlZGl0b3IsIHNpZGUgcGFuZWwgYW5kXG5cdFx0Ly8gYm90dG9tIHBhbmVsKSBmb3IgYXMgbG9uZyBhcyBpdCBpcyBzaG93bi5cblx0XHR0aGlzLl9jdXN0b21WaWV3VmlzaWJsZUtleSA9IEN1c3RvbVZpZXdWaXNpYmxlQ29udGV4dC5iaW5kVG8oYWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMuX2FwcGx5Q3VzdG9tVmlld0dyaWRWaXNpYmlsaXR5KHRoaXMuY3VzdG9tVmlld1NlcnZpY2UuYWN0aXZlQ3VzdG9tVmlldy5yZWFkKHJlYWRlcikpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEVkaXRvciBvcGVucyBzaG91bGQgb25seSBhZmZlY3QgdGhlIG1haW4gZWRpdG9yIHBhcnQgd2hlblxuXHRcdC8vIHRoZXkgYWN0dWFsbHkgdGFyZ2V0IG9uZSBvZiB0aGUgbWFpbiBlZGl0b3IgZ3JvdXBzLiBNb2RhbFxuXHRcdC8vIG9wZW5zIHN0YXkgbmV1dHJhbC4gUHJvZ3JhbW1hdGljIG9wZW5zIHRoYXQgc3VwcHJlc3MgYXV0b1xuXHRcdC8vIHZpc2liaWxpdHkgKGUuZy4gd29ya2luZyBzZXQgYXBwbGljYXRpb24pIGFyZSBpZ25vcmVkLlxuXHRcdC8vIFRoZSBiYXNlIGhhbmRsZXIgcmV2ZWFscyBhIGhpZGRlbiBlZGl0b3IgZm9yIGFueSBzdWNoIG9wZW47XG5cdFx0Ly8gYFNpbmdsZVBhbmVXb3JrYmVuY2hgIG92ZXJyaWRlcyBgcmV2ZWFsRWRpdG9yT25PcGVuYCB0byBrZWVwIGFcblx0XHQvLyBkb2NrZWQtZGV0YWlsIGVkaXRvciAoQ2hhbmdlcy9GaWxlcykgZnJvbSByZXZlYWxpbmcgdGhlIGVkaXRvciBhcmVhXG5cdFx0Ly8gd2hpbGUgdGhlIGRldGFpbCBwYW5lbCBpcyBhbHJlYWR5IHNob3dpbmcgaXRzIGNvbnRlbnQuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JTZXJ2aWNlLm9uV2lsbE9wZW5FZGl0b3IoZSA9PiB0aGlzLnJldmVhbEVkaXRvck9uT3BlbihlKSkpO1xuXG5cdFx0Ly8gSGlkZSBlZGl0b3IgcGFydCB3aGVuIGxhc3QgZWRpdG9yIGNsb3Nlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yU2VydmljZS5vbkRpZENsb3NlRWRpdG9yKCgpID0+IHRoaXMuaGFuZGxlRGlkQ2xvc2VFZGl0b3IoKSkpO1xuXG5cdFx0Ly8gSW5pdGlhbGl6ZSBsYXlvdXQgc3RhdGUgKG11c3QgYmUgZG9uZSBiZWZvcmUgY3JlYXRlV29ya2JlbmNoTGF5b3V0KVxuXHRcdHRoaXMuX21haW5Db250YWluZXJEaW1lbnNpb24gPSBnZXRDbGllbnRBcmVhKHRoaXMucGFyZW50LCBuZXcgRGltZW5zaW9uKDgwMCwgNjAwKSk7XG5cdFx0dGhpcy5sYXlvdXRQb2xpY3kudXBkYXRlKHRoaXMuX21haW5Db250YWluZXJEaW1lbnNpb24ud2lkdGgsIHRoaXMuX21haW5Db250YWluZXJEaW1lbnNpb24uaGVpZ2h0KTtcblxuXHRcdC8vIFVwZGF0ZSBwYXJ0IHZpc2liaWxpdHkgYmFzZWQgb24gZmluYWwgdmlld3BvcnQgY2xhc3NpZmljYXRpb25cblx0XHRjb25zdCB2aXNEZWZhdWx0cyA9IHRoaXMubGF5b3V0UG9saWN5LmdldFBhcnRWaXNpYmlsaXR5RGVmYXVsdHMoKTtcblx0XHR0aGlzLnBhcnRWaXNpYmlsaXR5LnNpZGViYXIgPSB2aXNEZWZhdWx0cy5zaWRlYmFyO1xuXHRcdHRoaXMucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyID0gdmlzRGVmYXVsdHMuYXV4aWxpYXJ5QmFyO1xuXHRcdHRoaXMucGFydFZpc2liaWxpdHkucGFuZWwgPSB2aXNEZWZhdWx0cy5wYW5lbDtcblx0XHR0aGlzLnBhcnRWaXNpYmlsaXR5LnNlc3Npb25zID0gdmlzRGVmYXVsdHMuc2Vzc2lvbnM7XG5cdFx0dGhpcy5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IgPSB2aXNEZWZhdWx0cy5lZGl0b3I7XG5cblx0XHQvLyBPdmVybGF5IHRoZSBwZXJzaXN0ZWQgdmlzaWJpbGl0eSBub3cgc28gdGhhdCB0aGUgY29udGV4dCBrZXlzIGhhbmRsZXJcblx0XHQvLyAoY3JlYXRlZCByaWdodCBhZnRlciBpbml0TGF5b3V0KSBpbml0aWFsaXplcyBwYXJ0LXZpc2liaWxpdHkgY29udGV4dFxuXHRcdC8vIGtleXMgKGUuZy4gYXV4aWxpYXJ5QmFyVmlzaWJsZSkgZnJvbSB0aGUgcmVzdG9yZWQgc3RhdGUgcmF0aGVyIHRoYW4gdGhlXG5cdFx0Ly8gZGVmYXVsdHMuIFdpdGhvdXQgdGhpcywgdGhlIGVkaXRvci10aXRsZSB0b2dnbGUgaWNvbiBpcyB3cm9uZyBvbiByZWxvYWQuXG5cdFx0dGhpcy5fYXBwbHlQZXJzaXN0ZWRQYXJ0VmlzaWJpbGl0eSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhcmVBbGxHcm91cHNJbk1haW5QYXJ0RW1wdHkoKTogYm9vbGVhbiB7XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5tYWluUGFydC5ncm91cHMpIHtcblx0XHRcdGlmICghZ3JvdXAuaXNFbXB0eSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJldmVhbEVkaXRvck9uT3BlbihlOiBJRWRpdG9yV2lsbE9wZW5FdmVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9lZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHlTdXBwcmVzc2lvbkNvdW50ID4gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGdyb3VwID0gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UubWFpblBhcnQuZ3JvdXBzLmZpbmQoZyA9PiBnLmlkID09PSBlLmdyb3VwSWQpO1xuXHRcdGlmICghZ3JvdXApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMucGFydFZpc2liaWxpdHkuZWRpdG9yKSB7XG5cdFx0XHR0aGlzLnNldEVkaXRvckhpZGRlbihmYWxzZSwgLyogZXhwbGljaXQgKi8gdHJ1ZSk7XG5cdFx0XHR0aGlzLnJlc3RvcmVBdHRhY2hlZEVkaXRvck1heGltaXplZFN0YXRlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVEaWRDbG9zZUVkaXRvcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5U3VwcHJlc3Npb25Db3VudCA+IDAgfHwgIXRoaXMuYXJlQWxsR3JvdXBzSW5NYWluUGFydEVtcHR5KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9oYW5kbGVBbGxFZGl0b3JzQ2xvc2VkKCk7XG5cdH1cblxuXHRzdXBwcmVzc0VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eSgpOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy5fZWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5U3VwcHJlc3Npb25Db3VudCsrO1xuXHRcdGxldCBkaXNwb3NlZCA9IGZhbHNlO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKGRpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGRpc3Bvc2VkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eVN1cHByZXNzaW9uQ291bnQtLTtcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCByZW1lbWJlckF0dGFjaGVkRWRpdG9yTWF4aW1pemVkU3RhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVzdG9yZUF0dGFjaGVkRWRpdG9yTWF4aW1pemVkT25TaG93ID0gdGhpcy5fZWRpdG9yTWF4aW1pemVkICYmIHRoaXMucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyO1xuXHR9XG5cblx0cHJpdmF0ZSByZXN0b3JlQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRTdGF0ZSgpOiB2b2lkIHtcblx0XHRjb25zdCBzaG91bGRSZXN0b3JlID0gdGhpcy5fcmVzdG9yZUF0dGFjaGVkRWRpdG9yTWF4aW1pemVkT25TaG93ICYmIHRoaXMucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyO1xuXHRcdHRoaXMuX3Jlc3RvcmVBdHRhY2hlZEVkaXRvck1heGltaXplZE9uU2hvdyA9IGZhbHNlO1xuXG5cdFx0aWYgKHNob3VsZFJlc3RvcmUpIHtcblx0XHRcdHRoaXMuc2V0RWRpdG9yTWF4aW1pemVkKHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdC8vI3JlZ2lvbiBTaWRlLXBhbmUgbGF5b3V0IGhvb2tzIChjbGFzc2ljIGdyaWQgZGVmYXVsdHM7IG92ZXJyaWRkZW4gYnkgU2luZ2xlUGFuZVdvcmtiZW5jaClcblxuXHRwcm90ZWN0ZWQgX2ZpcmVEaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eShwYXJ0SWQ6IFBhcnRzLCB2aXNpYmxlOiBib29sZWFuLCBzb3VyY2U/OiAncmVzaXplJyk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZCwgdmlzaWJsZSwgc291cmNlIH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9ub3RpZnlDb250YWluZXJEaWRMYXlvdXQoKTogdm9pZCB7XG5cdFx0dGhpcy5oYW5kbGVDb250YWluZXJEaWRMYXlvdXQodGhpcy5tYWluQ29udGFpbmVyLCB0aGlzLl9tYWluQ29udGFpbmVyRGltZW5zaW9uKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfc2V0TWFpbkVkaXRvckFyZWFIaWRkZW4oaGlkZGVuOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoTGF5b3V0Q2xhc3Nlcy5NQUlOX0VESVRPUl9BUkVBX0hJRERFTiwgaGlkZGVuKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kbGVzIGEgY2hhbmdlIGluIHRoZSBlZGl0b3ItcGFydCBncmlkIHZpZXcncyB2aXNpYmlsaXR5LiBJbiB0aGUgY2xhc3NpY1xuXHQgKiBsYXlvdXQgdGhlIGVkaXRvciBwYXJ0IGlzIGEgc3RhbmRhbG9uZSBncmlkIHZpZXcsIHNvIGl0cyB2aWV3IHZpc2liaWxpdHkgKmlzKlxuXHQgKiB0aGUgZWRpdG9yIHZpc2liaWxpdHkgXHUyMDE0IG1hcCBpdCB0byBgc2V0RWRpdG9ySGlkZGVuYCBhbmQgcmFpc2UgdGhlIHBhcnQgZXZlbnQuXG5cdCAqIFNpbmdsZS1wYW5lIG92ZXJyaWRlcyB0aGlzOiBpdHMgZWRpdG9yLXBhcnQgZ3JpZCB2aWV3IGFsc28gaG9zdHMgdGhlIGRvY2tlZFxuXHQgKiBhdXhpbGlhcnkgYmFyLCBzbyB0aGUgdmlldyBjYW4gYmVjb21lIHZpc2libGUgcHVyZWx5IHRvIHNob3cgdGhlIGRldGFpbCB3aGlsZVxuXHQgKiB0aGUgZWRpdG9yIGNvbnRlbnQgc3RheXMgaGlkZGVuOyBpdCBmaXJlcyBpdHMgb3duIGVkaXRvci1wYXJ0IGV2ZW50cyBpbnN0ZWFkLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9vbkVkaXRvclBhcnRHcmlkVmlzaWJpbGl0eUNoYW5nZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5zZXRFZGl0b3JIaWRkZW4oIXZpc2libGUpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuRURJVE9SX1BBUlQsIHZpc2libGUgfSk7XG5cdH1cblxuXHRpc0VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eVN1cHByZXNzZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzRWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5U3VwcHJlc3NlZDtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXQgX2lzRWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5U3VwcHJlc3NlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5U3VwcHJlc3Npb25Db3VudCA+IDA7XG5cdH1cblxuXHQvKiogVG9nZ2xlcyB0aGUgY29udGFpbmVyIG1hcmtlciBjbGFzcyBmb3IgdGhlIHNpZGUtcGFuZSBsYXlvdXQuICovXG5cdHByb3RlY3RlZCBfYXBwbHlMYXlvdXRDb250YWluZXJDbGFzcygpOiB2b2lkIHtcblx0XHR0aGlzLm1haW5Db250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnZG9jay1kZXRhaWwtcGFuZWwnLCBmYWxzZSk7XG5cdH1cblxuXHQvKiogV2lkdGggdGhlIGF1eGlsaWFyeSBiYXIgb2NjdXBpZXMgd2hlbiB2aXNpYmxlIChmb3IgbWF4LWVkaXRvci1kaW1lbnNpb24gbWF0aCkuICovXG5cdHByb3RlY3RlZCBfYXV4aWxpYXJ5QmFyTGF5b3V0V2lkdGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy53b3JrYmVuY2hHcmlkID8gdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcpLndpZHRoIDogMDtcblx0fVxuXG5cdHByb3RlY3RlZCBfYXV4aWxpYXJ5QmFyVmlld1NpemUoKTogSVZpZXdTaXplIHtcblx0XHRpZiAoIXRoaXMud29ya2JlbmNoR3JpZCB8fCAhdGhpcy5hdXhpbGlhcnlCYXJQYXJ0Vmlldykge1xuXHRcdFx0cmV0dXJuIHsgd2lkdGg6IDAsIGhlaWdodDogMCB9O1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9zZXRBdXhpbGlhcnlCYXJWaWV3U2l6ZShzaXplOiBJVmlld1NpemUpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5hdXhpbGlhcnlCYXJQYXJ0Vmlldykge1xuXHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLnJlc2l6ZVZpZXcodGhpcy5hdXhpbGlhcnlCYXJQYXJ0Vmlldywgc2l6ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIF9yZXNpemVBdXhpbGlhcnlCYXJCeShkZWx0YVdpZHRoOiBudW1iZXIsIGRlbHRhSGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY3VycmVudFNpemUgPSB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodGhpcy5hdXhpbGlhcnlCYXJQYXJ0Vmlldyk7XG5cdFx0dGhpcy53b3JrYmVuY2hHcmlkLnJlc2l6ZVZpZXcodGhpcy5hdXhpbGlhcnlCYXJQYXJ0Vmlldywge1xuXHRcdFx0d2lkdGg6IGN1cnJlbnRTaXplLndpZHRoICsgZGVsdGFXaWR0aCxcblx0XHRcdGhlaWdodDogY3VycmVudFNpemUuaGVpZ2h0ICsgZGVsdGFIZWlnaHRcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBfcmVzdG9yZUF1eGlsaWFyeUJhcldpZHRoKF93aWR0aDogbnVtYmVyKTogdm9pZCB7IH1cblxuXHQvKipcblx0ICogUmVhZHMgYSBwYXJ0J3Mgc2l6ZSBmcm9tIHRoZSB3b3JrYmVuY2ggZ3JpZCBmb3IgcGVyc2lzdGVuY2UuIEZvciB2aXNpYmxlXG5cdCAqIHBhcnRzLCB0aGUgY3VycmVudCB2aWV3IHNpemU7IGZvciBoaWRkZW4gcGFydHMsIHRoZSBncmlkJ3MgY2FjaGVkIHZpc2libGVcblx0ICogc2l6ZSAodGhlIHNpemUgaXQgaGFkIHRoZSBsYXN0IHRpbWUgaXQgd2FzIHNob3duKSBzbyB0b2dnbGluZyB2aXNpYmlsaXR5XG5cdCAqIGxhdGVyIHJlc3RvcmVzIHRoZSBzYW1lIGRpbWVuc2lvbnMuIE92ZXJyaWRkZW4gYnkgdGhlIHNpbmdsZS1wYW5lIGxheW91dCBmb3Jcblx0ICogaXRzIGRvY2tlZCBhdXhpbGlhcnkgYmFyLCB3aGljaCBpcyBub3QgYSBncmlkIHZpZXcuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX3BlcnNpc3RlZEdyaWRWaWV3U2l6ZSh2aWV3OiBJU2VyaWFsaXphYmxlVmlldywgZGltZW5zaW9uOiAnd2lkdGgnIHwgJ2hlaWdodCcsIHZpc2libGU6IGJvb2xlYW4pOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHZpZXcpW2RpbWVuc2lvbl07XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld0NhY2hlZFZpc2libGVTaXplKHZpZXcpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9wZXJzaXN0ZWRFZGl0b3JXaWR0aChlZGl0b3JHcmlkV2lkdGg6IG51bWJlciB8IHVuZGVmaW5lZCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGVkaXRvckdyaWRXaWR0aDtcblx0fVxuXG5cdHByb3RlY3RlZCBfZGVmYXVsdFNpZGVCYXJTaXplKHBvbGljeVNpZGVCYXJTaXplOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiBwb2xpY3lTaWRlQmFyU2l6ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZWRpdG9yTm9kZVNpemUoZWZmZWN0aXZlRWRpdG9yV2lkdGg6IG51bWJlciwgX2VmZmVjdGl2ZUF1eEJhcldpZHRoOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiBlZmZlY3RpdmVFZGl0b3JXaWR0aDtcblx0fVxuXG5cdHByb3RlY3RlZCBfZWRpdG9yTm9kZVZpc2libGUoZWRpdG9yVmlzaWJsZTogYm9vbGVhbiwgX2F1eEJhclZpc2libGU6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZWRpdG9yVmlzaWJsZTtcblx0fVxuXG5cdHByb3RlY3RlZCBfdG9wUmlnaHRTZWN0aW9uQ2hpbGRyZW4oc2Vzc2lvbnNOb2RlOiBJU2VyaWFsaXplZE5vZGUsIGVkaXRvck5vZGU6IElTZXJpYWxpemVkTm9kZSwgYXV4aWxpYXJ5QmFyTm9kZTogSVNlcmlhbGl6ZWROb2RlLCBjdXN0b21WaWV3R3JpZE5vZGU6IElTZXJpYWxpemVkTm9kZSk6IElTZXJpYWxpemVkTm9kZVtdIHtcblx0XHRyZXR1cm4gW3Nlc3Npb25zTm9kZSwgZWRpdG9yTm9kZSwgYXV4aWxpYXJ5QmFyTm9kZSwgY3VzdG9tVmlld0dyaWROb2RlXTtcblx0fVxuXG5cdC8qKiBBdHRhY2ggYW55IHBlci1sYXlvdXQgY29udHJvbGxlcnMgb25jZSB0aGUgZWRpdG9yIHBhcnQgY29udGFpbmVyIGV4aXN0cy4gKi9cblx0cHJvdGVjdGVkIF9hdHRhY2hTaWRlUGFuZSgpOiB2b2lkIHsgfVxuXHQvKiogTGF5IG91dCBhbnkgZG9ja2VkIG92ZXJsYXkuICovXG5cdHByb3RlY3RlZCBfbGF5b3V0U2lkZVBhbmUoKTogdm9pZCB7IH1cblx0LyoqIFJlYWN0IHRvIGEgd2hvbGUtZ3JpZCBjaGFuZ2UgKGUuZy4gYSBzYXNoIGRyYWcpIGFmdGVyIHRoZSBncmlkIHJlYnVpbGRzLiAqL1xuXHRwcm90ZWN0ZWQgX29uR3JpZERpZENoYW5nZSgpOiB2b2lkIHsgfVxuXHQvKiogUmVhY3QgdG8gdGhlIGVkaXRvciBncmlkIG5vZGUgYmVpbmcgcmVzaXplZCB0byBgbm9kZVdpZHRoYC4gKi9cblx0cHJvdGVjdGVkIF9vbkVkaXRvck5vZGVSZXNpemVkKF9ub2RlV2lkdGg6IG51bWJlcik6IHZvaWQgeyB9XG5cblx0LyoqIFJ1biBlZGl0b3Itbm9kZSB3b3JrIHdpdGggdGhlIHJldmVhbC1zeW5jIHN1c3BlbmRlZCAobm8tb3AgZm9yIHRoZSBncmlkIGxheW91dCkuICovXG5cdHByb3RlY3RlZCBfcnVuV2l0aEVkaXRvclJlc2l6ZVN5bmNTdXNwZW5kZWQoZm46ICgpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRmbigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9hcHBseUVkaXRvclZpc2liaWxpdHkoaGlkZGVuOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2hvdWxkQXBwbHlFdmVuU3BsaXQgPSAhaGlkZGVuICYmICF0aGlzLl9oYXNBcHBsaWVkSW5pdGlhbEVkaXRvclNwbGl0O1xuXG5cdFx0Ly8gQ2FwdHVyZSB0aGUgbWFpbi1hcmVhIHdpZHRoICh0aGUgc2Vzc2lvbnMgcGFydCBvY2N1cGllcyBpdCBmdWxseSB3aGlsZSB0aGVcblx0XHQvLyBlZGl0b3IgaXMgaGlkZGVuKSBiZWZvcmUgcmV2ZWFsaW5nLCBzbyB0aGUgZXZlbiBzcGxpdCBjYW4gaGFsdmUgaXQuXG5cdFx0Y29uc3QgbWFpbkFyZWFXaWR0aCA9IHRoaXMud29ya2JlbmNoR3JpZC5nZXRWaWV3U2l6ZSh0aGlzLnNlc3Npb25zUGFydFZpZXcpLndpZHRoO1xuXG5cdFx0dGhpcy53b3JrYmVuY2hHcmlkLnNldFZpZXdWaXNpYmxlKHRoaXMuZWRpdG9yUGFydFZpZXcsIHRoaXMuX2VkaXRvck5vZGVTaG91bGRCZVZpc2libGUoKSk7XG5cblx0XHRpZiAoc2hvdWxkQXBwbHlFdmVuU3BsaXQpIHtcblx0XHRcdHRoaXMuX2hhc0FwcGxpZWRJbml0aWFsRWRpdG9yU3BsaXQgPSB0cnVlO1xuXHRcdFx0dGhpcy5fYXBwbHlFZGl0b3JTcGxpdFNpemUobWFpbkFyZWFXaWR0aCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIF9vbldpbGxIaWRlQXV4aWxpYXJ5QmFyKF9oaWRkZW46IGJvb2xlYW4pOiB2b2lkIHsgfVxuXG5cdHByb3RlY3RlZCBfYXBwbHlBdXhpbGlhcnlCYXJWaXNpYmlsaXR5KGhpZGRlbjogYm9vbGVhbiwgX3NvdXJjZT86ICdyZXNpemUnKTogdm9pZCB7XG5cdFx0Ly8gU2tpcHBlZCBiZWZvcmUgdGhlIGdyaWQgZXhpc3RzOiBkdXJpbmcgc3RhcnR1cCB0aGUgbGF5b3V0IGNvbnRyb2xsZXIgKGFcblx0XHQvLyBCbG9ja1Jlc3RvcmUgY29udHJpYnV0aW9uKSBydW5zIGJlZm9yZSBjcmVhdGVXb3JrYmVuY2hMYXlvdXQoKSwgc28gdGhlXG5cdFx0Ly8gdmlzaWJpbGl0eSBpcyByZWNvcmRlZCBpbiBwYXJ0VmlzaWJpbGl0eSBhbmQgYXBwbGllZCB3aGVuIHRoZSBncmlkIGlzIGJ1aWx0LlxuXHRcdGlmICh0aGlzLndvcmtiZW5jaEdyaWQpIHtcblx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5zZXRWaWV3VmlzaWJsZSh0aGlzLmF1eGlsaWFyeUJhclBhcnRWaWV3LCB0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIF9zaG91bGRPcGVuQXV4aWxpYXJ5UGFuZUNvbXBvc2l0ZShfY29udGFpbmVySWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9oYW5kbGVBbGxFZGl0b3JzQ2xvc2VkKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnBhcnRWaXNpYmlsaXR5LmVkaXRvcikge1xuXHRcdFx0dGhpcy5yZW1lbWJlckF0dGFjaGVkRWRpdG9yTWF4aW1pemVkU3RhdGUoKTtcblx0XHRcdHRoaXMuc2V0RWRpdG9ySGlkZGVuKHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBfcHJlcGFyZVNpZGVCYXJSZXNpemUoX2hpZGRlbjogYm9vbGVhbik6IElTaWRlQmFyUmVzaXplQ29udGV4dCB7XG5cdFx0cmV0dXJuIHt9O1xuXHR9XG5cblx0cHJvdGVjdGVkIF9hcHBseVNpZGVCYXJSZXNpemUoX2hpZGRlbjogYm9vbGVhbiwgX2NvbnRleHQ6IElTaWRlQmFyUmVzaXplQ29udGV4dCk6IHZvaWQgeyB9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0cHJpdmF0ZSByZWdpc3RlckxheW91dExpc3RlbmVycygpOiB2b2lkIHtcblx0XHQvLyBGdWxsc2NyZWVuIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3RlcihvbkRpZENoYW5nZUZ1bGxzY3JlZW4od2luZG93SWQgPT4ge1xuXHRcdFx0aWYgKHdpbmRvd0lkID09PSBnZXRXaW5kb3dJZChtYWluV2luZG93KSkge1xuXHRcdFx0XHR0aGlzLm1haW5XaW5kb3dGdWxsc2NyZWVuID0gaXNGdWxsc2NyZWVuKG1haW5XaW5kb3cpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUZ1bGxzY3JlZW5DbGFzcygpO1xuXHRcdFx0XHR0aGlzLmxheW91dCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFdpbmRvdyByZXNpemUgXHUyMDE0IG5lZWRlZCBmb3IgZGV2aWNlIGVtdWxhdGlvbiBhbmQgbW9iaWxlIHZpZXdwb3J0IGNoYW5nZXNcblx0XHRjb25zdCBvbldpbmRvd1Jlc2l6ZSA9ICgpID0+IHRoaXMubGF5b3V0KCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG1haW5XaW5kb3csICdyZXNpemUnLCBvbldpbmRvd1Jlc2l6ZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVGdWxsc2NyZWVuQ2xhc3MoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubWFpbldpbmRvd0Z1bGxzY3JlZW4pIHtcblx0XHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKExheW91dENsYXNzZXMuRlVMTFNDUkVFTik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKExheW91dENsYXNzZXMuRlVMTFNDUkVFTik7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFdvcmtiZW5jaCBMYXlvdXQgQ3JlYXRpb25cblxuXHRjcmVhdGVXb3JrYmVuY2hMYXlvdXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fYXBwbHlMYXlvdXRDb250YWluZXJDbGFzcygpO1xuXG5cdFx0Y29uc3QgdGl0bGVCYXIgPSB0aGlzLmdldFBhcnQoUGFydHMuVElUTEVCQVJfUEFSVCk7XG5cdFx0Y29uc3QgZWRpdG9yUGFydCA9IHRoaXMuZ2V0UGFydChQYXJ0cy5FRElUT1JfUEFSVCk7XG5cdFx0Y29uc3QgcGFuZWxQYXJ0ID0gdGhpcy5nZXRQYXJ0KFBhcnRzLlBBTkVMX1BBUlQpO1xuXHRcdGNvbnN0IGF1eGlsaWFyeUJhclBhcnQgPSB0aGlzLmdldFBhcnQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXHRcdGNvbnN0IHNpZGVCYXIgPSB0aGlzLmdldFBhcnQoUGFydHMuU0lERUJBUl9QQVJUKTtcblx0XHRjb25zdCBzZXNzaW9uc1BhcnQgPSB0aGlzLmdldFBhcnQoUGFydHMuU0VTU0lPTlNfUEFSVCk7XG5cdFx0Y29uc3QgY3VzdG9tVmlld0dyaWRQYXJ0ID0gdGhpcy5nZXRQYXJ0KFBhcnRzLkNVU1RPTV9WSUVXX0dSSURfUEFSVCk7XG5cblx0XHQvLyBWaWV3IHJlZmVyZW5jZXMgZm9yIHBhcnRzIGluIHRoZSBncmlkXG5cdFx0dGhpcy50aXRsZUJhclBhcnRWaWV3ID0gdGl0bGVCYXI7XG5cdFx0dGhpcy5zaWRlQmFyUGFydFZpZXcgPSBzaWRlQmFyO1xuXHRcdHRoaXMucGFuZWxQYXJ0VmlldyA9IHBhbmVsUGFydDtcblx0XHR0aGlzLmF1eGlsaWFyeUJhclBhcnRWaWV3ID0gYXV4aWxpYXJ5QmFyUGFydDtcblx0XHR0aGlzLnNlc3Npb25zUGFydFZpZXcgPSBzZXNzaW9uc1BhcnQ7XG5cdFx0dGhpcy5jdXN0b21WaWV3R3JpZFBhcnRWaWV3ID0gY3VzdG9tVmlld0dyaWRQYXJ0O1xuXHRcdHRoaXMuZWRpdG9yUGFydFZpZXcgPSBlZGl0b3JQYXJ0O1xuXG5cdFx0Y29uc3Qgdmlld01hcDogeyBba2V5OiBzdHJpbmddOiBJU2VyaWFsaXphYmxlVmlldyB9ID0ge1xuXHRcdFx0W1BhcnRzLlRJVExFQkFSX1BBUlRdOiB0aGlzLnRpdGxlQmFyUGFydFZpZXcsXG5cdFx0XHRbUGFydHMuUEFORUxfUEFSVF06IHRoaXMucGFuZWxQYXJ0Vmlldyxcblx0XHRcdFtQYXJ0cy5TSURFQkFSX1BBUlRdOiB0aGlzLnNpZGVCYXJQYXJ0Vmlldyxcblx0XHRcdFtQYXJ0cy5BVVhJTElBUllCQVJfUEFSVF06IHRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcsXG5cdFx0XHRbUGFydHMuU0VTU0lPTlNfUEFSVF06IHRoaXMuc2Vzc2lvbnNQYXJ0Vmlldyxcblx0XHRcdFtQYXJ0cy5DVVNUT01fVklFV19HUklEX1BBUlRdOiB0aGlzLmN1c3RvbVZpZXdHcmlkUGFydFZpZXcsXG5cdFx0XHRbUGFydHMuRURJVE9SX1BBUlRdOiB0aGlzLmVkaXRvclBhcnRWaWV3XG5cdFx0fTtcblxuXHRcdGNvbnN0IGZyb21KU09OID0gKHsgdHlwZSB9OiB7IHR5cGU6IHN0cmluZyB9KSA9PiB2aWV3TWFwW3R5cGVdO1xuXHRcdGNvbnN0IHdvcmtiZW5jaEdyaWQgPSBTZXJpYWxpemFibGVHcmlkLmRlc2VyaWFsaXplKFxuXHRcdFx0dGhpcy5jcmVhdGVHcmlkRGVzY3JpcHRvcigpLFxuXHRcdFx0eyBmcm9tSlNPTiB9LFxuXHRcdFx0eyBwcm9wb3J0aW9uYWxMYXlvdXQ6IGZhbHNlIH1cblx0XHQpO1xuXG5cdFx0dGhpcy5tYWluQ29udGFpbmVyLnByZXBlbmQod29ya2JlbmNoR3JpZC5lbGVtZW50KTtcblx0XHR0aGlzLm1haW5Db250YWluZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2FwcGxpY2F0aW9uJyk7XG5cdFx0dGhpcy53b3JrYmVuY2hHcmlkID0gd29ya2JlbmNoR3JpZDtcblx0XHR0aGlzLndvcmtiZW5jaEdyaWQuZWRnZVNuYXBwaW5nID0gdGhpcy5tYWluV2luZG93RnVsbHNjcmVlbjtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtiZW5jaEdyaWQub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25HcmlkRGlkQ2hhbmdlKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSWYgdGhlIGVkaXRvciBpcyByZXN0b3JlZCB2aXNpYmxlLCBpdCBhbHJlYWR5IGhhcyBhbiBlc3RhYmxpc2hlZFxuXHRcdC8vIHdpZHRoLCBzbyBhIGxhdGVyIHJldmVhbCBtdXN0IG5vdCBmb3JjZSBhbiBldmVuIHNwbGl0IG92ZXIgaXQuXG5cdFx0dGhpcy5faGFzQXBwbGllZEluaXRpYWxFZGl0b3JTcGxpdCA9IHRoaXMucGFydFZpc2liaWxpdHkuZWRpdG9yO1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBwYXJ0IHZpc2liaWxpdHkgY2hhbmdlcyAoZm9yIHBhcnRzIGluIGdyaWQpXG5cdFx0Zm9yIChjb25zdCBwYXJ0IG9mIFt0aXRsZUJhciwgcGFuZWxQYXJ0LCBzaWRlQmFyLCBhdXhpbGlhcnlCYXJQYXJ0LCBzZXNzaW9uc1BhcnQsIGVkaXRvclBhcnRdKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihwYXJ0Lm9uRGlkVmlzaWJpbGl0eUNoYW5nZSh2aXNpYmxlID0+IHtcblx0XHRcdFx0Ly8gQSBjdXN0b20gdmlldyByZW5kZXJzIG92ZXIgdGhlc2UgcGFydHMgd2l0aG91dCBjaGFuZ2luZyB3aGF0IHRoZSBsYXlvdXRcblx0XHRcdFx0Ly8gd2FudHMgdGhlbSB0byBiZSwgc28gaXRzIGdyaWQgdXBkYXRlcyBtdXN0IG5vdCBmZWVkIGJhY2sgaW50byB0aGVcblx0XHRcdFx0Ly8gZGVzaXJlZCBzdGF0ZSBcdTIwMTQgb3RoZXJ3aXNlIHRoZXJlIGlzIG5vdGhpbmcgbGVmdCB0byByZXN0b3JlLlxuXHRcdFx0XHRpZiAodGhpcy5fYXBwbHlpbmdDdXN0b21WaWV3R3JpZFZpc2liaWxpdHkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBUaGUgZWRpdG9yIHBhcnQncyBncmlkLXZpZXcgdmlzaWJpbGl0eSBpcyBmdWxseSBvd25lZCBieVxuXHRcdFx0XHQvLyBgX29uRWRpdG9yUGFydEdyaWRWaXNpYmlsaXR5Q2hhbmdlYDogaW4gdGhlIGNsYXNzaWMgbGF5b3V0IGl0IG1hcHMgdG9cblx0XHRcdFx0Ly8gdGhlIGVkaXRvciB2aXNpYmlsaXR5IGFuZCByYWlzZXMgdGhlIHBhcnQtdmlzaWJpbGl0eSBldmVudDsgc2luZ2xlLXBhbmVcblx0XHRcdFx0Ly8gKHdob3NlIGVkaXRvci1wYXJ0IHZpZXcgYWxzbyBob3N0cyB0aGUgZG9ja2VkIGF1eGlsaWFyeSBiYXIpIG92ZXJyaWRlcyBpdFxuXHRcdFx0XHQvLyBzbyB0aGUgc2hhcmVkIG5vZGUgYmVjb21pbmcgdmlzaWJsZSBmb3IgdGhlIGRldGFpbCBuZWl0aGVyIHJldmVhbHMgdGhlXG5cdFx0XHRcdC8vIGVkaXRvciBjb250ZW50IG5vciBmaXJlcyBhIGJvZ3VzIGVkaXRvci1wYXJ0LXZpc2libGUgZXZlbnQuXG5cdFx0XHRcdGlmIChwYXJ0ID09PSBlZGl0b3JQYXJ0KSB7XG5cdFx0XHRcdFx0dGhpcy5fb25FZGl0b3JQYXJ0R3JpZFZpc2liaWxpdHlDaGFuZ2UodmlzaWJsZSk7XG5cdFx0XHRcdFx0dGhpcy5oYW5kbGVDb250YWluZXJEaWRMYXlvdXQodGhpcy5tYWluQ29udGFpbmVyLCB0aGlzLl9tYWluQ29udGFpbmVyRGltZW5zaW9uKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAocGFydCA9PT0gc2lkZUJhcikge1xuXHRcdFx0XHRcdHRoaXMuc2V0U2lkZUJhckhpZGRlbighdmlzaWJsZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAocGFydCA9PT0gcGFuZWxQYXJ0KSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRQYW5lbEhpZGRlbighdmlzaWJsZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAocGFydCA9PT0gYXV4aWxpYXJ5QmFyUGFydCkge1xuXHRcdFx0XHRcdHRoaXMuc2V0QXV4aWxpYXJ5QmFySGlkZGVuKCF2aXNpYmxlKTtcblx0XHRcdFx0fSBlbHNlIGlmIChwYXJ0ID09PSBzZXNzaW9uc1BhcnQpIHtcblx0XHRcdFx0XHR0aGlzLnNldFNlc3Npb25zSGlkZGVuKCF2aXNpYmxlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogcGFydC5nZXRJZCgpLCB2aXNpYmxlIH0pO1xuXHRcdFx0XHR0aGlzLmhhbmRsZUNvbnRhaW5lckRpZExheW91dCh0aGlzLm1haW5Db250YWluZXIsIHRoaXMuX21haW5Db250YWluZXJEaW1lbnNpb24pO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIFdpcmUgdXAgbW9iaWxlIG5hdiBzdGFjazogYmFjay1idXR0b24gcG9wcyBjbG9zZSB0aGUgY29ycmVzcG9uZGluZyBwYXJ0XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tb2JpbGVOYXZTdGFjay5vbkRpZFBvcChsYXllciA9PiB7XG5cdFx0XHRzd2l0Y2ggKGxheWVyKSB7XG5cdFx0XHRcdGNhc2UgJ3NpZGViYXInOlxuXHRcdFx0XHRcdHRoaXMuY2xvc2VNb2JpbGVTaWRlYmFyRHJhd2VyKCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ3BhbmVsJzpcblx0XHRcdFx0XHR0aGlzLnNldFBhbmVsSGlkZGVuKHRydWUpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdhdXhiYXInOlxuXHRcdFx0XHRcdHRoaXMuc2V0QXV4aWxpYXJ5QmFySGlkZGVuKHRydWUpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdjdXN0b21WaWV3Jzpcblx0XHRcdFx0XHR0aGlzLmN1c3RvbVZpZXdTZXJ2aWNlLmhpZGVDdXN0b21WaWV3KCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2VkaXRvcic6XG5cdFx0XHRcdFx0Ly8gRWRpdG9yIG1vZGFsIGNsb3NlIGlzIGhhbmRsZWQgYnkgdGhlIGVkaXRvciBzZXJ2aWNlXG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0Y3JlYXRlV29ya2JlbmNoTWFuYWdlbWVudChpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogdm9pZCB7XG5cdFx0Ly8gV2VsY29tZSBcdTIwMTQgbXVzdCBiZSBjcmVhdGVkIGVhcmx5IGluIGxheW91dCBzbyB0aGUgd2lkZ2V0IGNhbiBnYXRlXG5cdFx0Ly8gb3RoZXIgVUkgdW50aWwgc2lnbi1pbiAvIGNoYXQgc2V0dXAgaXMgY29tcGxldGUuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NldFVwU2VydmljZSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgdGhlIGdyaWQgZGVzY3JpcHRvciBmb3IgdGhlIEFnZW50IFNlc3Npb25zIGxheW91dC5cblx0ICpcblx0ICogU3RydWN0dXJlIChob3Jpem9udGFsIG9yaWVudGF0aW9uKTpcblx0ICogLSBTaWRlYmFyIChsZWZ0LCBzcGFucyBmdWxsIGhlaWdodCBmcm9tIHRvcCB0byBib3R0b20pXG5cdCAqIC0gUmlnaHQgc2VjdGlvbiAodmVydGljYWwpOlxuXHQgKiAgIC0gVGl0bGViYXIgKHRvcCBvZiByaWdodCBzZWN0aW9uKVxuXHQgKiAgIC0gVG9wIHJpZ2h0IChob3Jpem9udGFsKTogQ2hhdCBCYXIgfCBFZGl0b3IgfCBBdXhpbGlhcnkgQmFyXG5cdCAqICAgLSBQYW5lbCAoYmVsb3cgY2hhdCwgZWRpdG9yLCBhbmQgYXV4aWxpYXJ5IGJhcilcblx0ICovXG5cdHByaXZhdGUgY3JlYXRlR3JpZERlc2NyaXB0b3IoKTogSVNlcmlhbGl6ZWRHcmlkIHtcblx0XHRjb25zdCB7IHdpZHRoLCBoZWlnaHQgfSA9IHRoaXMuX21haW5Db250YWluZXJEaW1lbnNpb247XG5cblx0XHRyZXR1cm4gdGhpcy5jcmVhdGVEZXNrdG9wR3JpZERlc2NyaXB0b3Iod2lkdGgsIGhlaWdodCk7XG5cdH1cblxuXHQvKipcblx0ICogU3RhbmRhcmQgbXVsdGktcGFydCBsYXlvdXQgZm9yIGFsbCB2aWV3cG9ydCBjbGFzc2VzLlxuXHQgKiBPbiBwaG9uZSwgdGhlIHRpdGxlYmFyIGlzIGhpZGRlbiB2aWEgQ1NTIGFuZCBhIE1vYmlsZVRpdGxlYmFyUGFydFxuXHQgKiBpcyBwcmVwZW5kZWQgYmVmb3JlIHRoZSBncmlkLiBTaWRlYmFyL3BhbmVsL2F1eGJhciBhcmUgaGlkZGVuXG5cdCAqIGluIHRoZSBncmlkIHZpYSBwYXJ0VmlzaWJpbGl0eSBkZWZhdWx0cy5cblx0ICovXG5cdHByaXZhdGUgY3JlYXRlRGVza3RvcEdyaWREZXNjcmlwdG9yKHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogSVNlcmlhbGl6ZWRHcmlkIHtcblxuXHRcdC8vIERlZmF1bHQgc2l6ZXMgZnJvbSBsYXlvdXQgcG9saWN5XG5cdFx0Y29uc3Qgc2l6ZXMgPSB0aGlzLmxheW91dFBvbGljeS5nZXRQYXJ0U2l6ZXMod2lkdGgsIGhlaWdodCk7XG5cdFx0Ly8gRm9yIGhpZGRlbiBwYXJ0cywgc3RpbGwgcHJvdmlkZSBhIHJlYXNvbmFibGUgY2FjaGVkIHNpemUgZm9yIHdoZW4gdGhleSdyZSBzaG93biBsYXRlci5cblx0XHQvLyBTYXZlZCBzaXplcyBmcm9tIGEgcHJldmlvdXMgc2Vzc2lvbiB0YWtlIHByZWNlZGVuY2Ugb3ZlciBwb2xpY3kgZGVmYXVsdHMuXG5cdFx0Y29uc3QgZGVmYXVsdFNpZGVCYXJTaXplID0gdGhpcy5fZGVmYXVsdFNpZGVCYXJTaXplKHNpemVzLnNpZGVCYXJTaXplKTtcblx0XHRjb25zdCBzaWRlQmFyU2l6ZSA9IHRoaXMuX3NhdmVkUGFydFNpemVzLnNpZGViYXJcblx0XHRcdD8/ICh0aGlzLnBhcnRWaXNpYmlsaXR5LnNpZGViYXIgPyBkZWZhdWx0U2lkZUJhclNpemUgOiBNYXRoLm1heChkZWZhdWx0U2lkZUJhclNpemUsIDI1MCkpO1xuXHRcdGNvbnN0IGRlZmF1bHRBdXhpbGlhcnlCYXJTaXplID0gdGhpcy5pc1NpbmdsZVBhbmVMYXlvdXRFbmFibGVkXG5cdFx0XHQ/IHRoaXMuZ2V0RG9ja2VkQXV4aWxpYXJ5QmFyV2lkdGgoKVxuXHRcdFx0OiBzaXplcy5hdXhpbGlhcnlCYXJTaXplO1xuXHRcdGNvbnN0IGF1eGlsaWFyeUJhclNpemUgPSB0aGlzLl9zYXZlZFBhcnRTaXplcy5hdXhpbGlhcnlCYXJcblx0XHRcdD8/ICh0aGlzLnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhciA/IGRlZmF1bHRBdXhpbGlhcnlCYXJTaXplIDogTWF0aC5tYXgoZGVmYXVsdEF1eGlsaWFyeUJhclNpemUsIDMwMCkpO1xuXHRcdGNvbnN0IHBhbmVsU2l6ZSA9IHRoaXMuX3NhdmVkUGFydFNpemVzLnBhbmVsXG5cdFx0XHQ/PyAodGhpcy5wYXJ0VmlzaWJpbGl0eS5wYW5lbCA/IHNpemVzLnBhbmVsU2l6ZSA6IE1hdGgubWF4KHNpemVzLnBhbmVsU2l6ZSwgMjUwKSk7XG5cdFx0Ly8gRmFsbCBiYWNrIHRvIGEgY29tZm9ydGFibGUgZGVmYXVsdCB3aGVuIHRoZXJlIGlzIG5vIHNhdmVkIGVkaXRvciB3aWR0aCBcdTIwMTQgb3Jcblx0XHQvLyB3aGVuIGEgc3RhbGUvY29ycnVwdCBzdWItbWluaW11bSB2YWx1ZSAoZS5nLiBhIGAwYCBwZXJzaXN0ZWQgd2hpbGUgdGhlIGVkaXRvclxuXHRcdC8vIG5vZGUgd2FzIHRyYW5zaWVudGx5IHNxdWVlemVkIHRvIG5vdGhpbmcgYnkgdGhlIGhpZ2gtcHJpb3JpdHkgc2Vzc2lvbnMgcGFydClcblx0XHQvLyB3YXMgc3RvcmVkLiBBIHBsYWluIGA/PyA2MDBgIHdvdWxkIGxldCBgMGAgdGhyb3VnaCBhbmQgYnVpbGQgdGhlIGVkaXRvciBub2RlIGF0XG5cdFx0Ly8gYDBgLCB3aGljaCB0aGUgZ3JpZCB0aGVuIGNsYW1wcyB0byBpdHMgMzAwcHggbWluaW11bSBvbiBldmVyeSByZWxvYWQuXG5cdFx0Y29uc3Qgc2F2ZWRFZGl0b3JXaWR0aCA9IHRoaXMuX3NhdmVkUGFydFNpemVzLmVkaXRvcjtcblx0XHRjb25zdCBlZGl0b3JTaXplID0gc2F2ZWRFZGl0b3JXaWR0aCAhPT0gdW5kZWZpbmVkICYmIHNhdmVkRWRpdG9yV2lkdGggPj0gRURJVE9SX1BBUlRfTUlOSU1VTV9XSURUSCA/IHNhdmVkRWRpdG9yV2lkdGggOiBFRElUT1JfUEFSVF9ERUZBVUxUX1dJRFRIO1xuXHRcdGNvbnN0IHRpdGxlQmFySGVpZ2h0ID0gdGhpcy50aXRsZUJhclBhcnRWaWV3Py5taW5pbXVtSGVpZ2h0ID8/IDMwO1xuXG5cdFx0Ly8gQ2FsY3VsYXRlIHJpZ2h0IHNlY3Rpb24gd2lkdGggXHUyMDE0IHdoZW4gc2lkZWJhciBpcyBoaWRkZW4gaXQgdGFrZXMgbm8gc3BhY2Vcblx0XHRjb25zdCBlZmZlY3RpdmVTaWRlQmFyV2lkdGggPSB0aGlzLnBhcnRWaXNpYmlsaXR5LnNpZGViYXIgPyBzaWRlQmFyU2l6ZSA6IDA7XG5cdFx0Y29uc3QgcmlnaHRTZWN0aW9uV2lkdGggPSBNYXRoLm1heCgwLCB3aWR0aCAtIGVmZmVjdGl2ZVNpZGVCYXJXaWR0aCk7XG5cdFx0Y29uc3QgZWZmZWN0aXZlQXV4QmFyV2lkdGggPSB0aGlzLnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhciA/IGF1eGlsaWFyeUJhclNpemUgOiAwO1xuXHRcdGNvbnN0IGVmZmVjdGl2ZUVkaXRvcldpZHRoID0gdGhpcy5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IgPyBlZGl0b3JTaXplIDogMDtcblx0XHQvLyBQcmVmZXIgdGhlIHNhdmVkIGNoYXQgYmFyIHdpZHRoIHNvIHRoZSB1c2VyJ3MgcHJlZmVycmVkIGNoYXQgYmFyIHNpemVcblx0XHQvLyBpcyBwcmVzZXJ2ZWQgYWNyb3NzIHJlbG9hZHMuIEZhbGwgYmFjayB0byB0aGUgcmVtYWluZGVyIG9mIHRoZSByaWdodFxuXHRcdC8vIHNlY3Rpb24sIHdoaWNoIHRoZSBncmlkIGRpc3RyaWJ1dGVzIHByb3BvcnRpb25hbGx5IHdoZW4gdGhlIHNhdmVkXG5cdFx0Ly8gc2l6ZXMgZG9uJ3QgZml0IHRoZSBjdXJyZW50IGNvbnRhaW5lci5cblx0XHRjb25zdCBzZXNzaW9uc1dpZHRoID0gdGhpcy5fc2F2ZWRQYXJ0U2l6ZXMuc2Vzc2lvbnNcblx0XHRcdD8/IE1hdGgubWF4KDAsIHJpZ2h0U2VjdGlvbldpZHRoIC0gZWZmZWN0aXZlQXV4QmFyV2lkdGggLSBlZmZlY3RpdmVFZGl0b3JXaWR0aCk7XG5cblx0XHRjb25zdCBjb250ZW50SGVpZ2h0ID0gTWF0aC5tYXgoMCwgaGVpZ2h0IC0gdGl0bGVCYXJIZWlnaHQpO1xuXHRcdGNvbnN0IHRvcFJpZ2h0SGVpZ2h0ID0gTWF0aC5tYXgoMCwgY29udGVudEhlaWdodCAtIHBhbmVsU2l6ZSk7XG5cblx0XHRjb25zdCBpc1Bob25lID0gdGhpcy5sYXlvdXRQb2xpY3kudmlld3BvcnRDbGFzcy5nZXQoKSA9PT0gJ3Bob25lJztcblxuXHRcdGNvbnN0IHRpdGxlQmFyTm9kZTogSVNlcmlhbGl6ZWRMZWFmTm9kZSA9IHtcblx0XHRcdHR5cGU6ICdsZWFmJyxcblx0XHRcdGRhdGE6IHsgdHlwZTogUGFydHMuVElUTEVCQVJfUEFSVCB9LFxuXHRcdFx0c2l6ZTogdGl0bGVCYXJIZWlnaHQsXG5cdFx0XHR2aXNpYmxlOiAhaXNQaG9uZVxuXHRcdH07XG5cblx0XHRjb25zdCBzaWRlQmFyTm9kZTogSVNlcmlhbGl6ZWRMZWFmTm9kZSA9IHtcblx0XHRcdHR5cGU6ICdsZWFmJyxcblx0XHRcdGRhdGE6IHsgdHlwZTogUGFydHMuU0lERUJBUl9QQVJUIH0sXG5cdFx0XHRzaXplOiBzaWRlQmFyU2l6ZSxcblx0XHRcdHZpc2libGU6IHRoaXMucGFydFZpc2liaWxpdHkuc2lkZWJhclxuXHRcdH07XG5cblx0XHRjb25zdCBzZXNzaW9uc05vZGU6IElTZXJpYWxpemVkTGVhZk5vZGUgPSB7XG5cdFx0XHR0eXBlOiAnbGVhZicsXG5cdFx0XHRkYXRhOiB7IHR5cGU6IFBhcnRzLlNFU1NJT05TX1BBUlQgfSxcblx0XHRcdHNpemU6IHNlc3Npb25zV2lkdGgsXG5cdFx0XHR2aXNpYmxlOiB0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKFBhcnRzLlNFU1NJT05TX1BBUlQpXG5cdFx0fTtcblxuXHRcdC8vIE11dHVhbGx5IGV4Y2x1c2l2ZSB3aXRoIHRoZSBzZXNzaW9ucyBwYXJ0IChhbmQgdGhlIGVkaXRvciAvIGF1eGlsaWFyeSBiYXIgL1xuXHRcdC8vIHBhbmVsKSwgc28gaXQgYWx3YXlzIGNsYWltcyB0aGUgZnVsbCByb3cgd2hlbiBpdCBpcyB2aXNpYmxlLlxuXHRcdGNvbnN0IGN1c3RvbVZpZXdHcmlkTm9kZTogSVNlcmlhbGl6ZWRMZWFmTm9kZSA9IHtcblx0XHRcdHR5cGU6ICdsZWFmJyxcblx0XHRcdGRhdGE6IHsgdHlwZTogUGFydHMuQ1VTVE9NX1ZJRVdfR1JJRF9QQVJUIH0sXG5cdFx0XHRzaXplOiByaWdodFNlY3Rpb25XaWR0aCxcblx0XHRcdHZpc2libGU6IHRoaXMucGFydFZpc2liaWxpdHkuY3VzdG9tVmlld0dyaWRcblx0XHR9O1xuXG5cdFx0Y29uc3QgZWRpdG9yTm9kZTogSVNlcmlhbGl6ZWRMZWFmTm9kZSA9IHtcblx0XHRcdHR5cGU6ICdsZWFmJyxcblx0XHRcdGRhdGE6IHsgdHlwZTogUGFydHMuRURJVE9SX1BBUlQgfSxcblx0XHRcdHNpemU6IHRoaXMuX2VkaXRvck5vZGVTaXplKGVmZmVjdGl2ZUVkaXRvcldpZHRoLCBlZmZlY3RpdmVBdXhCYXJXaWR0aCksXG5cdFx0XHR2aXNpYmxlOiB0aGlzLl9lZGl0b3JOb2RlU2hvdWxkQmVWaXNpYmxlKClcblx0XHR9O1xuXG5cdFx0Y29uc3QgYXV4aWxpYXJ5QmFyTm9kZTogSVNlcmlhbGl6ZWRMZWFmTm9kZSA9IHtcblx0XHRcdHR5cGU6ICdsZWFmJyxcblx0XHRcdGRhdGE6IHsgdHlwZTogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgfSxcblx0XHRcdHNpemU6IGF1eGlsaWFyeUJhclNpemUsXG5cdFx0XHR2aXNpYmxlOiB0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKVxuXHRcdH07XG5cblx0XHRjb25zdCBwYW5lbE5vZGU6IElTZXJpYWxpemVkTGVhZk5vZGUgPSB7XG5cdFx0XHR0eXBlOiAnbGVhZicsXG5cdFx0XHRkYXRhOiB7IHR5cGU6IFBhcnRzLlBBTkVMX1BBUlQgfSxcblx0XHRcdHNpemU6IHBhbmVsU2l6ZSxcblx0XHRcdHZpc2libGU6IHRoaXMuX2VmZmVjdGl2ZVZpc2libGUoUGFydHMuUEFORUxfUEFSVClcblx0XHR9O1xuXG5cdFx0Ly8gVG9wIHJpZ2h0IHNlY3Rpb246IENoYXQgQmFyIHwgRWRpdG9yIFt8IEF1eGlsaWFyeSBCYXJdIHwgQ3VzdG9tIFZpZXcgR3JpZCAoaG9yaXpvbnRhbCkuXG5cdFx0Ly8gV2hlbiBkb2NrZWQsIHRoZSBhdXhpbGlhcnkgYmFyIGlzIGluc2lkZSB0aGUgZWRpdG9yIHBhcnQgYW5kXG5cdFx0Ly8gb21pdHRlZCBmcm9tIHRoZSBncmlkOyBvdGhlcndpc2UgaXQgaXMgaXRzIG93biB0cmFpbGluZyBncmlkIGNvbHVtbi5cblx0XHRjb25zdCB0b3BSaWdodFNlY3Rpb246IElTZXJpYWxpemVkTm9kZSA9IHtcblx0XHRcdHR5cGU6ICdicmFuY2gnLFxuXHRcdFx0ZGF0YTogdGhpcy5fdG9wUmlnaHRTZWN0aW9uQ2hpbGRyZW4oc2Vzc2lvbnNOb2RlLCBlZGl0b3JOb2RlLCBhdXhpbGlhcnlCYXJOb2RlLCBjdXN0b21WaWV3R3JpZE5vZGUpLFxuXHRcdFx0c2l6ZTogdG9wUmlnaHRIZWlnaHRcblx0XHR9O1xuXG5cdFx0Ly8gUmlnaHQgc2VjdGlvbjogVG9wIFJpZ2h0IHwgUGFuZWwgKHZlcnRpY2FsKVxuXHRcdGNvbnN0IHJpZ2h0U2VjdGlvbjogSVNlcmlhbGl6ZWROb2RlID0ge1xuXHRcdFx0dHlwZTogJ2JyYW5jaCcsXG5cdFx0XHRkYXRhOiBbdG9wUmlnaHRTZWN0aW9uLCBwYW5lbE5vZGVdLFxuXHRcdFx0c2l6ZTogcmlnaHRTZWN0aW9uV2lkdGhcblx0XHR9O1xuXG5cdFx0Ly8gQ29udGVudCBzZWN0aW9uOiBTaWRlYmFyIHwgUmlnaHQgc2VjdGlvbiAoaG9yaXpvbnRhbClcblx0XHRjb25zdCBjb250ZW50U2VjdGlvbjogSVNlcmlhbGl6ZWROb2RlID0ge1xuXHRcdFx0dHlwZTogJ2JyYW5jaCcsXG5cdFx0XHRkYXRhOiBbc2lkZUJhck5vZGUsIHJpZ2h0U2VjdGlvbl0sXG5cdFx0XHRzaXplOiBjb250ZW50SGVpZ2h0XG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlc3VsdDogSVNlcmlhbGl6ZWRHcmlkID0ge1xuXHRcdFx0cm9vdDoge1xuXHRcdFx0XHR0eXBlOiAnYnJhbmNoJyxcblx0XHRcdFx0c2l6ZTogd2lkdGgsXG5cdFx0XHRcdGRhdGE6IFtcblx0XHRcdFx0XHR0aXRsZUJhck5vZGUsXG5cdFx0XHRcdFx0Y29udGVudFNlY3Rpb25cblx0XHRcdFx0XVxuXHRcdFx0fSxcblx0XHRcdG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbi5WRVJUSUNBTCxcblx0XHRcdHdpZHRoLFxuXHRcdFx0aGVpZ2h0XG5cdFx0fTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gTGF5b3V0IE1ldGhvZHNcblxuXHRwcml2YXRlIF9wcmV2aW91c1ZpZXdwb3J0Q2xhc3M6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRsYXlvdXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbiA9IGdldENsaWVudEFyZWEoXG5cdFx0XHR0aGlzLm1haW5XaW5kb3dGdWxsc2NyZWVuID8gbWFpbldpbmRvdy5kb2N1bWVudC5ib2R5IDogdGhpcy5wYXJlbnRcblx0XHQpO1xuXG5cdFx0Ly8gVXBkYXRlIHZpZXdwb3J0IGNsYXNzaWZpY2F0aW9uIGFuZCB0b2dnbGUgbW9iaWxlIENTUyBjbGFzc2VzXG5cdFx0Y29uc3QgcHJldmlvdXNDbGFzcyA9IHRoaXMuX3ByZXZpb3VzVmlld3BvcnRDbGFzcztcblx0XHR0aGlzLmxheW91dFBvbGljeS51cGRhdGUodGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbi53aWR0aCwgdGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbi5oZWlnaHQpO1xuXHRcdGNvbnN0IGN1cnJlbnRDbGFzcyA9IHRoaXMubGF5b3V0UG9saWN5LnZpZXdwb3J0Q2xhc3MuZ2V0KCk7XG5cdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoTGF5b3V0Q2xhc3Nlcy5QSE9ORV9MQVlPVVQsIGN1cnJlbnRDbGFzcyA9PT0gJ3Bob25lJyk7XG5cblx0XHQvLyBXaGVuIHZpZXdwb3J0IGNsYXNzIGNoYW5nZXMgYXQgcnVudGltZSAoZS5nLiwgZGV2aWNlIGVtdWxhdGlvbiB0b2dnbGUpLFxuXHRcdC8vIHVwZGF0ZSBwYXJ0IHZpc2liaWxpdHkgYW5kIGNyZWF0ZS9kZXN0cm95IG1vYmlsZSBjb21wb25lbnRzXG5cdFx0aWYgKHByZXZpb3VzQ2xhc3MgIT09IHVuZGVmaW5lZCAmJiBwcmV2aW91c0NsYXNzICE9PSBjdXJyZW50Q2xhc3MpIHtcblx0XHRcdGlmIChjdXJyZW50Q2xhc3MgPT09ICdwaG9uZScgJiYgIXRoaXMubW9iaWxlVG9wQmFyRWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLmNyZWF0ZU1vYmlsZVRpdGxlYmFyKCk7XG5cdFx0XHRcdC8vIEhpZGUgdGl0bGViYXIgaW4gZ3JpZCBvbiBwaG9uZSAocmVwbGFjZWQgYnkgTW9iaWxlVGl0bGViYXJQYXJ0KVxuXHRcdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQuc2V0Vmlld1Zpc2libGUodGhpcy50aXRsZUJhclBhcnRWaWV3LCBmYWxzZSk7XG5cdFx0XHRcdC8vIE9uIHBob25lLCBvbmx5IGNoYXQgaXMgdmlzaWJsZSBcdTIwMTQgaGlkZSBldmVyeXRoaW5nIGVsc2UgZmlyc3Rcblx0XHRcdFx0Y29uc3QgZGVmYXVsdHMgPSB0aGlzLmxheW91dFBvbGljeS5nZXRQYXJ0VmlzaWJpbGl0eURlZmF1bHRzKCk7XG5cdFx0XHRcdGlmICh0aGlzLnBhcnRWaXNpYmlsaXR5LnNpZGViYXIgIT09IGRlZmF1bHRzLnNpZGViYXIpIHtcblx0XHRcdFx0XHR0aGlzLnNldFNpZGVCYXJIaWRkZW4oIWRlZmF1bHRzLnNpZGViYXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhciAhPT0gZGVmYXVsdHMuYXV4aWxpYXJ5QmFyKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRBdXhpbGlhcnlCYXJIaWRkZW4oIWRlZmF1bHRzLmF1eGlsaWFyeUJhcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMucGFydFZpc2liaWxpdHkucGFuZWwgIT09IGRlZmF1bHRzLnBhbmVsKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRQYW5lbEhpZGRlbighZGVmYXVsdHMucGFuZWwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGN1cnJlbnRDbGFzcyAhPT0gJ3Bob25lJyAmJiB0aGlzLm1vYmlsZVRvcEJhckVsZW1lbnQpIHtcblx0XHRcdFx0Ly8gUmVtb3ZlIG1vYmlsZSBjb21wb25lbnRzIHdoZW4gbGVhdmluZyBwaG9uZSBsYXlvdXRcblx0XHRcdFx0dGhpcy5tb2JpbGVUb3BCYXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0XHR0aGlzLm1vYmlsZVRvcEJhckVsZW1lbnQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdC8vIFJlc3RvcmUgdGl0bGViYXIgaW4gZ3JpZFxuXHRcdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQuc2V0Vmlld1Zpc2libGUodGhpcy50aXRsZUJhclBhcnRWaWV3LCB0cnVlKTtcblx0XHRcdFx0Ly8gUmVzdG9yZSBkZXNrdG9wIHBhcnQgdmlzaWJpbGl0eVxuXHRcdFx0XHRjb25zdCBkZWZhdWx0cyA9IHRoaXMubGF5b3V0UG9saWN5LmdldFBhcnRWaXNpYmlsaXR5RGVmYXVsdHMoKTtcblx0XHRcdFx0aWYgKHRoaXMucGFydFZpc2liaWxpdHkuc2lkZWJhciAhPT0gZGVmYXVsdHMuc2lkZWJhcikge1xuXHRcdFx0XHRcdHRoaXMuc2V0U2lkZUJhckhpZGRlbighZGVmYXVsdHMuc2lkZWJhcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMucGFydFZpc2liaWxpdHkuc2Vzc2lvbnMgIT09IGRlZmF1bHRzLnNlc3Npb25zKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRTZXNzaW9uc0hpZGRlbighZGVmYXVsdHMuc2Vzc2lvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhciAhPT0gZGVmYXVsdHMuYXV4aWxpYXJ5QmFyKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRBdXhpbGlhcnlCYXJIaWRkZW4oIWRlZmF1bHRzLmF1eGlsaWFyeUJhcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMucGFydFZpc2liaWxpdHkucGFuZWwgIT09IGRlZmF1bHRzLnBhbmVsKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRQYW5lbEhpZGRlbighZGVmYXVsdHMucGFuZWwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlLXJ1biB1cGRhdGVTdHlsZXMoKSBvbiBwYW5lIGNvbXBvc2l0ZSBwYXJ0cyBzbyB0aGF0XG5cdFx0XHQvLyBtb2JpbGUgUGFydCBzdWJjbGFzc2VzIGNhbiByZS1hcHBseSBvciBjbGVhciBjYXJkLWNocm9tZVxuXHRcdFx0Ly8gaW5saW5lIHN0eWxlcyBiYXNlZCBvbiB0aGUgbmV3IGAucGhvbmUtbGF5b3V0YCBjbGFzcy5cblx0XHRcdGZvciAoY29uc3QgcGFydElkIG9mIFtQYXJ0cy5TRVNTSU9OU19QQVJULCBQYXJ0cy5DVVNUT01fVklFV19HUklEX1BBUlQsIFBhcnRzLlNJREVCQVJfUEFSVCwgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIFBhcnRzLlBBTkVMX1BBUlRdKSB7XG5cdFx0XHRcdHRoaXMucGFydHMuZ2V0KHBhcnRJZCk/LnVwZGF0ZVN0eWxlcygpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl91cGRhdGVNb2JpbGVDdXN0b21WaWV3TmF2aWdhdGlvbigpO1xuXHRcdH1cblx0XHR0aGlzLl9wcmV2aW91c1ZpZXdwb3J0Q2xhc3MgPSBjdXJyZW50Q2xhc3M7XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFdvcmtiZW5jaCNsYXlvdXQsIGhlaWdodDogJHt0aGlzLl9tYWluQ29udGFpbmVyRGltZW5zaW9uLmhlaWdodH0sIHdpZHRoOiAke3RoaXMuX21haW5Db250YWluZXJEaW1lbnNpb24ud2lkdGh9YCk7XG5cblx0XHRzaXplKHRoaXMubWFpbkNvbnRhaW5lciwgdGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbi53aWR0aCwgdGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbi5oZWlnaHQpO1xuXG5cblx0XHR0aGlzLl9sYXlvdXRHcmlkKCk7XG5cblx0XHQvLyBEb2NrICsgbGF5b3V0IHRoZSBhdXhpbGlhcnkgYmFyIGluc2lkZSB0aGUgZWRpdG9yIHBhcnQgc28gdGhlXG5cdFx0Ly8gZWRpdG9yIHRhYiBiYXIgc3BhbnMgdGhlIGZ1bGwgd2lkdGggYWJvdmUgYm90aC5cblx0XHR0aGlzLl9hdHRhY2hTaWRlUGFuZSgpO1xuXHRcdHRoaXMuX2xheW91dFNpZGVQYW5lKCk7XG5cblx0XHR0aGlzLmxheW91dE1vYmlsZVNpZGViYXIoKTtcblxuXHRcdC8vIEVtaXQgYXMgZXZlbnRcblx0XHR0aGlzLmhhbmRsZUNvbnRhaW5lckRpZExheW91dCh0aGlzLm1haW5Db250YWluZXIsIHRoaXMuX21haW5Db250YWluZXJEaW1lbnNpb24pO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9sYXlvdXRHcmlkKCk6IHZvaWQge1xuXHRcdGNvbnN0IG1vYmlsZVRvcEJhckhlaWdodCA9IHRoaXMubW9iaWxlVG9wQmFyRWxlbWVudD8ub2Zmc2V0SGVpZ2h0ID8/IDA7XG5cdFx0Ly8gS2VlcCBpbiBzeW5jIHdpdGggdGhlIGRlc2t0b3AgZ3JpZCBtYXJnaW4gaW4gd29ya2JlbmNoLmNzcy5cblx0XHRjb25zdCBpc1Bob25lID0gdGhpcy5sYXlvdXRQb2xpY3kudmlld3BvcnRDbGFzcy5nZXQoKSA9PT0gJ3Bob25lJztcblx0XHRjb25zdCBncmlkR3V0dGVyVyA9IGlzUGhvbmUgPyAwIDogQUdFTlRTX0ZMT0FUSU5HX1BBTkVMX0dBUCArICh0aGlzLnBhcnRWaXNpYmlsaXR5LnNpZGViYXIgPyAwIDogQUdFTlRTX0ZMT0FUSU5HX1BBTkVMX0dBUCk7XG5cdFx0Y29uc3QgZ3JpZEd1dHRlckggPSBpc1Bob25lID8gMCA6IEFHRU5UU19GTE9BVElOR19QQU5FTF9HQVA7XG5cdFx0dGhpcy53b3JrYmVuY2hHcmlkLmxheW91dChcblx0XHRcdHRoaXMuX21haW5Db250YWluZXJEaW1lbnNpb24ud2lkdGggLSBncmlkR3V0dGVyVyxcblx0XHRcdHRoaXMuX21haW5Db250YWluZXJEaW1lbnNpb24uaGVpZ2h0IC0gbW9iaWxlVG9wQmFySGVpZ2h0IC0gZ3JpZEd1dHRlckhcblx0XHQpO1xuXHR9XG5cblx0aGFuZGxlRG9ja2VkRWRpdG9yUGFydExheW91dChub2RlV2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX29uRWRpdG9yTm9kZVJlc2l6ZWQobm9kZVdpZHRoKTtcblx0fVxuXG5cdGlzRWRpdG9yUmV2ZWFsZWRFeHBsaWNpdGx5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9lZGl0b3JSZXZlYWxlZEV4cGxpY2l0bHk7XG5cdH1cblxuXHRyZXZlYWxFZGl0b3JQYXJ0RXhwbGljaXRseSgpOiB2b2lkIHtcblx0XHQvLyBQcmVzZXJ2ZSB0aGUgZGlzdGluY3Rpb24gZnJvbSBhdXRvbWF0aWMgbGF5b3V0LWRyaXZlbiByZXZlYWxzLlxuXHRcdC8vIFJlLWFzc2VydCB0aGUgZmxhZyBldmVuIHdoZW4gYWxyZWFkeSB2aXNpYmxlICh0aGUgZWFybHktcmV0dXJuIGluXG5cdFx0Ly8gc2V0RWRpdG9ySGlkZGVuIHdvdWxkIG90aGVyd2lzZSBza2lwIGl0KS5cblx0XHR0aGlzLl9lZGl0b3JSZXZlYWxlZEV4cGxpY2l0bHkgPSB0cnVlO1xuXHRcdHRoaXMuc2V0RWRpdG9ySGlkZGVuKGZhbHNlLCAvKiBleHBsaWNpdCAqLyB0cnVlKTtcblx0fVxuXG5cdGdldERvY2tlZEF1eGlsaWFyeUJhcldpZHRoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRzZXREb2NrZWRBdXhpbGlhcnlCYXJXaWR0aChfd2lkdGg6IG51bWJlcik6IHZvaWQgeyB9XG5cblx0cHJpdmF0ZSBsYXlvdXRNb2JpbGVTaWRlYmFyKCk6IHZvaWQge1xuXHRcdGNvbnN0IHNpZGViYXJDb250YWluZXIgPSB0aGlzLmdldENvbnRhaW5lcihtYWluV2luZG93LCBQYXJ0cy5TSURFQkFSX1BBUlQpO1xuXHRcdGNvbnN0IHNpZGViYXJQYXJ0ID0gdGhpcy5nZXRQYXJ0KFBhcnRzLlNJREVCQVJfUEFSVCk7XG5cdFx0aWYgKCFzaWRlYmFyQ29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gT24gcGhvbmUgdGhlIHNpZGViYXIgcmVuZGVycyBhcyBhIGZ1bGwtdmlld3BvcnQgb3ZlcmxheSBkcmF3ZXIuXG5cdFx0Ly8gR2VvbWV0cnkgaXMgZnVsbHkgZXhwcmVzc2VkIGluIENTUyBcdTIwMTQgc2VlXG5cdFx0Ly8gYG1vYmlsZUNoYXRTaGVsbC5jc3NgIChzcGxpdC12aWV3LXZpZXcgZmlsbHMgdGhlIGdyaWQpIGFuZFxuXHRcdC8vIGBzaWRlYmFyUGFydC5jc3NgIChkcmF3ZXIgYW5pbWF0aW9uLCB6LWluZGV4KS4gV2UgYXZvaWQgc2V0dGluZ1xuXHRcdC8vIGlubGluZSBwb3NpdGlvbi9zaXplIHN0eWxlcyBoZXJlIGJlY2F1c2Ugd3JpdGluZyB0aGVtIGFmdGVyIHRoZVxuXHRcdC8vIGdyaWQgaGFzIGFscmVhZHkgbGFpZCBvdXQgYW5kIHBhaW50ZWQgdGhlIHNpZGViYXIgY2F1c2VzIGFcblx0XHQvLyB2aXNpYmxlIG9uZS1mcmFtZSBzbmFwIG9uIHRvZ2dsZS5cblx0XHRjb25zdCBpc1Bob25lID0gdGhpcy5sYXlvdXRQb2xpY3kudmlld3BvcnRDbGFzcy5nZXQoKSA9PT0gJ3Bob25lJztcblx0XHRpZiAoIWlzUGhvbmUgfHwgIXRoaXMucGFydFZpc2liaWxpdHkuc2lkZWJhcikge1xuXHRcdFx0c2lkZWJhckNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdtb2JpbGUtb3ZlcmxheS1zaWRlYmFyJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0c2lkZWJhckNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdtb2JpbGUtb3ZlcmxheS1zaWRlYmFyJyk7XG5cblx0XHQvLyBSZS1sYXlvdXQgdGhlIHNpZGViYXIgUGFydCB3aXRoIHRoZSBkcmF3ZXIncyBjb250ZW50IGRpbWVuc2lvbnNcblx0XHQvLyBzbyBpdHMgaW50ZXJuYWwgY29tcG9zaXRlL2xpc3Qgc2l6aW5nIG1hdGNoZXMgdGhlIENTUy1wb3NpdGlvbmVkXG5cdFx0Ly8gZHJhd2VyIChncmlkIGFyZWEgbWludXMgdGhlIG1vYmlsZSB0b3AgYmFyKS5cblx0XHRjb25zdCB0b3BCYXJIZWlnaHQgPSB0aGlzLm1vYmlsZVRvcEJhckVsZW1lbnQ/Lm9mZnNldEhlaWdodCA/PyA0ODtcblx0XHRjb25zdCBkcmF3ZXJXaWR0aCA9IHRoaXMuX21haW5Db250YWluZXJEaW1lbnNpb24ud2lkdGg7XG5cdFx0Y29uc3QgZHJhd2VySGVpZ2h0ID0gTWF0aC5tYXgoMCwgdGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbi5oZWlnaHQgLSB0b3BCYXJIZWlnaHQpO1xuXHRcdHNpZGViYXJQYXJ0LmxheW91dChkcmF3ZXJXaWR0aCwgZHJhd2VySGVpZ2h0LCB0b3BCYXJIZWlnaHQsIDApO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVDb250YWluZXJEaWRMYXlvdXQoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZGltZW5zaW9uOiBJRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRMYXlvdXRDb250YWluZXIuZmlyZSh7IGNvbnRhaW5lciwgZGltZW5zaW9uIH0pO1xuXHRcdGlmIChjb250YWluZXIgPT09IHRoaXMubWFpbkNvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5fb25EaWRMYXlvdXRNYWluQ29udGFpbmVyLmZpcmUoZGltZW5zaW9uKTtcblx0XHR9XG5cdFx0aWYgKGNvbnRhaW5lciA9PT0gdGhpcy5hY3RpdmVDb250YWluZXIpIHtcblx0XHRcdHRoaXMuX29uRGlkTGF5b3V0QWN0aXZlQ29udGFpbmVyLmZpcmUoZGltZW5zaW9uKTtcblx0XHR9XG5cdH1cblxuXHRpc0Zsb2F0aW5nUGFuZWxzRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7IC8vIHRoZSBhZ2VudHMgd2luZG93IGhhcyBpdHMgb3duIGZsb2F0aW5nIGNhcmQgZGVzaWduXG5cdH1cblxuXHRnZXRMYXlvdXRDbGFzc2VzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gY29hbGVzY2UoW1xuXHRcdFx0IXRoaXMucGFydFZpc2liaWxpdHkuc2lkZWJhciA/IExheW91dENsYXNzZXMuU0lERUJBUl9ISURERU4gOiB1bmRlZmluZWQsXG5cdFx0XHQhdGhpcy5fZWZmZWN0aXZlVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCkgPyBMYXlvdXRDbGFzc2VzLk1BSU5fRURJVE9SX0FSRUFfSElEREVOIDogdW5kZWZpbmVkLFxuXHRcdFx0IXRoaXMuX2VmZmVjdGl2ZVZpc2libGUoUGFydHMuUEFORUxfUEFSVCkgPyBMYXlvdXRDbGFzc2VzLlBBTkVMX0hJRERFTiA6IHVuZGVmaW5lZCxcblx0XHRcdCF0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSA/IExheW91dENsYXNzZXMuQVVYSUxJQVJZQkFSX0hJRERFTiA6IHVuZGVmaW5lZCxcblx0XHRcdCF0aGlzLmlzRWRpdG9yUGFuZVZpc2libGUoKSA/IExheW91dENsYXNzZXMuRURJVE9SX1BBTkVfSElEREVOIDogdW5kZWZpbmVkLFxuXHRcdFx0IXRoaXMuX2VmZmVjdGl2ZVZpc2libGUoUGFydHMuU0VTU0lPTlNfUEFSVCkgPyBMYXlvdXRDbGFzc2VzLlNFU1NJT05TX0hJRERFTiA6IHVuZGVmaW5lZCxcblx0XHRcdCF0aGlzLnBhcnRWaXNpYmlsaXR5LmN1c3RvbVZpZXdHcmlkID8gTGF5b3V0Q2xhc3Nlcy5DVVNUT01fVklFV19HUklEX0hJRERFTiA6IHVuZGVmaW5lZCxcblx0XHRcdExheW91dENsYXNzZXMuU1RBVFVTQkFSX0hJRERFTiwgLy8gYWdlbnRzIHdpbmRvdyBuZXZlciBoYXMgYSBzdGF0dXMgYmFyXG5cdFx0XHR0aGlzLm1haW5XaW5kb3dGdWxsc2NyZWVuID8gTGF5b3V0Q2xhc3Nlcy5GVUxMU0NSRUVOIDogdW5kZWZpbmVkLFxuXHRcdFx0dGhpcy5sYXlvdXRQb2xpY3kudmlld3BvcnRDbGFzcy5nZXQoKSA9PT0gJ3Bob25lJyA/IExheW91dENsYXNzZXMuUEhPTkVfTEFZT1VUIDogdW5kZWZpbmVkLFxuXHRcdF0pO1xuXHR9XG5cblx0aXNFZGl0b3JQYW5lVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZWZmZWN0aXZlVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCkgfHwgdGhpcy5fZWZmZWN0aXZlVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVFZGl0b3JQYW5lVmlzaWJpbGl0eUNsYXNzKCk6IHZvaWQge1xuXHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKExheW91dENsYXNzZXMuRURJVE9SX1BBTkVfSElEREVOLCAhdGhpcy5pc0VkaXRvclBhbmVWaXNpYmxlKCkpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFBhcnQgTWFuYWdlbWVudFxuXG5cdHJlZ2lzdGVyUGFydChwYXJ0OiBQYXJ0KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGlkID0gcGFydC5nZXRJZCgpO1xuXHRcdHRoaXMucGFydHMuc2V0KGlkLCBwYXJ0KTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHRoaXMucGFydHMuZGVsZXRlKGlkKSk7XG5cdH1cblxuXHRnZXRQYXJ0KGtleTogUGFydHMpOiBQYXJ0IHtcblx0XHRjb25zdCBwYXJ0ID0gdGhpcy5wYXJ0cy5nZXQoa2V5KTtcblx0XHRpZiAoIXBhcnQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5rbm93biBwYXJ0ICR7a2V5fWApO1xuXHRcdH1cblx0XHRyZXR1cm4gcGFydDtcblx0fVxuXG5cdGhhc0ZvY3VzKHBhcnQ6IFBhcnRzKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy5nZXRDb250YWluZXIobWFpbldpbmRvdywgcGFydCk7XG5cdFx0aWYgKCFjb250YWluZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBhY3RpdmVFbGVtZW50ID0gZ2V0QWN0aXZlRWxlbWVudCgpO1xuXHRcdGlmICghYWN0aXZlRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiBpc0FuY2VzdG9yVXNpbmdGbG93VG8oYWN0aXZlRWxlbWVudCwgY29udGFpbmVyKTtcblx0fVxuXG5cdGZvY3VzUGFydChwYXJ0OiBNVUxUSV9XSU5ET1dfUEFSVFMsIHRhcmdldFdpbmRvdzogV2luZG93KTogdm9pZDtcblx0Zm9jdXNQYXJ0KHBhcnQ6IFNJTkdMRV9XSU5ET1dfUEFSVFMpOiB2b2lkO1xuXHRmb2N1c1BhcnQocGFydDogUGFydHMsIHRhcmdldFdpbmRvdzogV2luZG93ID0gbWFpbldpbmRvdyk6IHZvaWQge1xuXHRcdHN3aXRjaCAocGFydCkge1xuXHRcdFx0Y2FzZSBQYXJ0cy5FRElUT1JfUEFSVDpcblx0XHRcdFx0dGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuYWN0aXZlR3JvdXAuZm9jdXMoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFBhcnRzLlBBTkVMX1BBUlQ6XG5cdFx0XHRcdHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpPy5mb2N1cygpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUGFydHMuU0lERUJBUl9QQVJUOlxuXHRcdFx0XHR0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldEFjdGl2ZVBhbmVDb21wb3NpdGUoVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpPy5mb2N1cygpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQ6XG5cdFx0XHRcdHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyKT8uZm9jdXMoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFBhcnRzLlNFU1NJT05TX1BBUlQ6XG5cdFx0XHRcdC8vIFRPRE86IGZvY3VzIGNoYXQgYmFyIGNvbnRlbnQgb25jZSBpdCBpcyB3aXJlZCB1cFxuXHRcdFx0XHR0aGlzLmdldFBhcnQoUGFydHMuU0VTU0lPTlNfUEFSVCkuZ2V0Q29udGFpbmVyKCk/LmZvY3VzKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQYXJ0cy5DVVNUT01fVklFV19HUklEX1BBUlQ6XG5cdFx0XHRcdHRoaXMuY3VzdG9tVmlld0dyaWRQYXJ0U2VydmljZS5mb2N1c0FjdGl2ZVZpZXcoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMuZ2V0Q29udGFpbmVyKHRhcmdldFdpbmRvdywgcGFydCk7XG5cdFx0XHRcdGNvbnRhaW5lcj8uZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLmZvY3VzUGFydChQYXJ0cy5TRVNTSU9OU19QQVJUKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBDb250YWluZXIgTWV0aG9kc1xuXG5cdGdldENvbnRhaW5lcih0YXJnZXRXaW5kb3c6IFdpbmRvdyk6IEhUTUxFbGVtZW50O1xuXHRnZXRDb250YWluZXIodGFyZ2V0V2luZG93OiBXaW5kb3csIHBhcnQ6IFBhcnRzKTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdGdldENvbnRhaW5lcih0YXJnZXRXaW5kb3c6IFdpbmRvdywgcGFydD86IFBhcnRzKTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0eXBlb2YgcGFydCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybiB0aGlzLmdldENvbnRhaW5lckZyb21Eb2N1bWVudCh0YXJnZXRXaW5kb3cuZG9jdW1lbnQpO1xuXHRcdH1cblxuXHRcdGlmICh0YXJnZXRXaW5kb3cgPT09IG1haW5XaW5kb3cpIHtcblx0XHRcdHJldHVybiB0aGlzLnBhcnRzLmdldChwYXJ0KT8uZ2V0Q29udGFpbmVyKCk7XG5cdFx0fVxuXG5cdFx0Ly8gRm9yIGF1eGlsaWFyeSB3aW5kb3dzLCBvbmx5IGVkaXRvciBwYXJ0IGlzIHN1cHBvcnRlZFxuXHRcdGlmIChwYXJ0ID09PSBQYXJ0cy5FRElUT1JfUEFSVCkge1xuXHRcdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy5nZXRDb250YWluZXJGcm9tRG9jdW1lbnQodGFyZ2V0V2luZG93LmRvY3VtZW50KTtcblx0XHRcdGNvbnN0IHBhcnRDYW5kaWRhdGUgPSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5nZXRQYXJ0KGNvbnRhaW5lcik7XG5cdFx0XHRpZiAocGFydENhbmRpZGF0ZSBpbnN0YW5jZW9mIFBhcnQpIHtcblx0XHRcdFx0cmV0dXJuIHBhcnRDYW5kaWRhdGUuZ2V0Q29udGFpbmVyKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHdoZW5Db250YWluZXJTdHlsZXNMb2FkZWQoX3dpbmRvdzogQ29kZVdpbmRvdyk6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gUGFydCBWaXNpYmlsaXR5XG5cblx0aXNBY3Rpdml0eUJhckhpZGRlbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTsgLy8gTm8gYWN0aXZpdHkgYmFyIGluIHRoaXMgbGF5b3V0XG5cdH1cblxuXHQvKipcblx0ICogUGFydHMgYSB2aXNpYmxlIGN1c3RvbSB2aWV3IHJlcGxhY2VzLiBXaGlsZSB0aGUgY3VzdG9tIHZpZXcgZ3JpZCBpcyBzaG93blxuXHQgKiB0aGVzZSBrZWVwIHRoZWlyIGRlc2lyZWQgKHBlci1zZXNzaW9uKSB2aXNpYmlsaXR5IHN0YXRlIGJ1dCBhcmUgbm90XG5cdCAqIHJlbmRlcmVkLCBzbyBoaWRpbmcgdGhlIGN1c3RvbSB2aWV3IHJlc3RvcmVzIHdoYXRldmVyIHRoZSBsYXlvdXRcblx0ICogY29udHJvbGxlciBsYXN0IGFza2VkIGZvciBcdTIwMTQgaW5jbHVkaW5nIGNoYW5nZXMgbWFkZSB3aGlsZSBpdCB3YXMgc2hvd24uXG5cdCAqL1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfQ1VTVE9NX1ZJRVdfRVhDTFVTSVZFX1BBUlRTID0gW1xuXHRcdFBhcnRzLlNFU1NJT05TX1BBUlQsXG5cdFx0UGFydHMuRURJVE9SX1BBUlQsXG5cdFx0UGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsXG5cdFx0UGFydHMuUEFORUxfUEFSVFxuXHRdIGFzIGNvbnN0O1xuXG5cdC8qKiBUaGUgZGVzaXJlZCB2aXNpYmlsaXR5IG9mIGEgcGFydCwgaWdub3JpbmcgYW55IGN1c3RvbSB2aWV3IHNob3dpbmcgb3ZlciBpdC4gKi9cblx0cHJpdmF0ZSBfZGVzaXJlZFZpc2libGUocGFydDogUGFydHMpOiBib29sZWFuIHtcblx0XHRzd2l0Y2ggKHBhcnQpIHtcblx0XHRcdGNhc2UgUGFydHMuU0VTU0lPTlNfUEFSVDpcblx0XHRcdFx0cmV0dXJuIHRoaXMucGFydFZpc2liaWxpdHkuc2Vzc2lvbnM7XG5cdFx0XHRjYXNlIFBhcnRzLkVESVRPUl9QQVJUOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5wYXJ0VmlzaWJpbGl0eS5lZGl0b3I7XG5cdFx0XHRjYXNlIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5wYXJ0VmlzaWJpbGl0eS5hdXhpbGlhcnlCYXI7XG5cdFx0XHRjYXNlIFBhcnRzLlBBTkVMX1BBUlQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLnBhcnRWaXNpYmlsaXR5LnBhbmVsO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBXaGV0aGVyIGEgcGFydCBpcyBhY3R1YWxseSByZW5kZXJlZCByaWdodCBub3cuICovXG5cdHByb3RlY3RlZCBfZWZmZWN0aXZlVmlzaWJsZShwYXJ0OiBQYXJ0cyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9kZXNpcmVkVmlzaWJsZShwYXJ0KSAmJiAhdGhpcy5wYXJ0VmlzaWJpbGl0eS5jdXN0b21WaWV3R3JpZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBlZGl0b3IgZ3JpZCBub2RlIHNob3VsZCBiZSBzaG93bi4gSW4gdGhlIHNpbmdsZS1wYW5lIGxheW91dCB0aGVcblx0ICogbm9kZSBhbHNvIGhvc3RzIHRoZSBkb2NrZWQgYXV4aWxpYXJ5IGJhciwgc28gaXQgZm9sbG93cyBib3RoIHBhcnRzLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9lZGl0b3JOb2RlU2hvdWxkQmVWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9lZGl0b3JOb2RlVmlzaWJsZSh0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJUKSwgdGhpcy5fZWZmZWN0aXZlVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCkpO1xuXHR9XG5cblx0aXNWaXNpYmxlKHBhcnQ6IFNJTkdMRV9XSU5ET1dfUEFSVFMpOiBib29sZWFuO1xuXHRpc1Zpc2libGUocGFydDogTVVMVElfV0lORE9XX1BBUlRTLCB0YXJnZXRXaW5kb3c6IFdpbmRvdyk6IGJvb2xlYW47XG5cdGlzVmlzaWJsZShwYXJ0OiBQYXJ0cywgdGFyZ2V0V2luZG93PzogV2luZG93KTogYm9vbGVhbiB7XG5cdFx0c3dpdGNoIChwYXJ0KSB7XG5cdFx0XHRjYXNlIFBhcnRzLlRJVExFQkFSX1BBUlQ6XG5cdFx0XHRcdC8vIE9uIHBob25lIGxheW91dCB0aGUgZ3JpZCB0aXRsZWJhciBpcyBoaWRkZW4gKHJlcGxhY2VkIGJ5IE1vYmlsZVRpdGxlYmFyUGFydClcblx0XHRcdFx0cmV0dXJuIHRoaXMubGF5b3V0UG9saWN5LnZpZXdwb3J0Q2xhc3MuZ2V0KCkgIT09ICdwaG9uZSc7XG5cdFx0XHRjYXNlIFBhcnRzLlNJREVCQVJfUEFSVDpcblx0XHRcdFx0cmV0dXJuIHRoaXMucGFydFZpc2liaWxpdHkuc2lkZWJhcjtcblx0XHRcdGNhc2UgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQ6XG5cdFx0XHRjYXNlIFBhcnRzLkVESVRPUl9QQVJUOlxuXHRcdFx0Y2FzZSBQYXJ0cy5QQU5FTF9QQVJUOlxuXHRcdFx0Y2FzZSBQYXJ0cy5TRVNTSU9OU19QQVJUOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZWZmZWN0aXZlVmlzaWJsZShwYXJ0KTtcblx0XHRcdGNhc2UgUGFydHMuQ1VTVE9NX1ZJRVdfR1JJRF9QQVJUOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5wYXJ0VmlzaWJpbGl0eS5jdXN0b21WaWV3R3JpZDtcblx0XHRcdGNhc2UgUGFydHMuQUNUSVZJVFlCQVJfUEFSVDpcblx0XHRcdGNhc2UgUGFydHMuU1RBVFVTQkFSX1BBUlQ6XG5cdFx0XHRjYXNlIFBhcnRzLkJBTk5FUl9QQVJUOlxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHNldFBhcnRIaWRkZW4oaGlkZGVuOiBib29sZWFuLCBwYXJ0OiBQYXJ0cyk6IHZvaWQge1xuXHRcdHN3aXRjaCAocGFydCkge1xuXHRcdFx0Y2FzZSBQYXJ0cy5TSURFQkFSX1BBUlQ6XG5cdFx0XHRcdHRoaXMuc2V0U2lkZUJhckhpZGRlbihoaWRkZW4pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQ6XG5cdFx0XHRcdHRoaXMuc2V0QXV4aWxpYXJ5QmFySGlkZGVuKGhpZGRlbik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQYXJ0cy5FRElUT1JfUEFSVDpcblx0XHRcdFx0dGhpcy5zZXRFZGl0b3JIaWRkZW4oaGlkZGVuKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFBhcnRzLlBBTkVMX1BBUlQ6XG5cdFx0XHRcdHRoaXMuc2V0UGFuZWxIaWRkZW4oaGlkZGVuKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFBhcnRzLlNFU1NJT05TX1BBUlQ6XG5cdFx0XHRcdHRoaXMuc2V0U2Vzc2lvbnNIaWRkZW4oaGlkZGVuKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0dG9nZ2xlU2Vjb25kYXJ5U2lkZUJhcigpOiB2b2lkIHtcblx0XHQvLyBUaGUgc2lkZSBwYW5lbCBpcyByZXBsYWNlZCBieSB0aGUgY3VzdG9tIHZpZXcgZ3JpZCB3aGlsZSBvbmUgaXMgc2hvd24uXG5cdFx0aWYgKHRoaXMucGFydFZpc2liaWxpdHkuY3VzdG9tVmlld0dyaWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB2aXNpYmxlID0gIXRoaXMuaXNTZWNvbmRhcnlTaWRlQmFyVmlzaWJsZSgpO1xuXHRcdHRoaXMuc2V0QXV4aWxpYXJ5QmFySGlkZGVuKCF2aXNpYmxlKTtcblx0XHRhbGVydCh2aXNpYmxlXG5cdFx0XHQ/IGxvY2FsaXplKCdhdXhpbGlhcnlCYXJWaXNpYmxlJywgXCJTZWNvbmRhcnkgU2lkZSBCYXIgc2hvd25cIilcblx0XHRcdDogbG9jYWxpemUoJ2F1eGlsaWFyeUJhckhpZGRlbicsIFwiU2Vjb25kYXJ5IFNpZGUgQmFyIGhpZGRlblwiKSk7XG5cdH1cblxuXHRpc1NlY29uZGFyeVNpZGVCYXJWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmlzVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCk7XG5cdH1cblxuXHRpc1NpZGVQYW5lVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRjb25zdCB7IGVkaXRvciwgYXV4aWxpYXJ5QmFyIH0gPSB0aGlzLl9nZXRTaWRlUGFuZVN0YXRlKCk7XG5cdFx0cmV0dXJuIGVkaXRvciB8fCBhdXhpbGlhcnlCYXI7XG5cdH1cblxuXHR0b2dnbGVTaWRlUGFuZSgpOiBib29sZWFuIHtcblx0XHRjb25zdCBzaWRlUGFuZUhhZEZvY3VzID0gdGhpcy5oYXNGb2N1cyhQYXJ0cy5FRElUT1JfUEFSVCkgfHwgdGhpcy5oYXNGb2N1cyhQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCk7XG5cdFx0Y29uc3Qgc3RhdGVCZWZvcmVUb2dnbGUgPSB0aGlzLl9nZXRTaWRlUGFuZVN0YXRlKCk7XG5cdFx0Y29uc3QgZWRpdG9yV2FzTWF4aW1pemVkID0gdGhpcy5pc0VkaXRvck1heGltaXplZCgpO1xuXHRcdHRoaXMuX29uV2lsbFRvZ2dsZVNpZGVQYW5lLmZpcmUoKTtcblx0XHR0cnkge1xuXHRcdFx0Ly8gRXhpdCBtYXhpbWl6ZSBiZWZvcmUgdG9nZ2xpbmcgc28gYW55IHJlc3RvcmVkIHBhcnRzIGFyZSBpbmNsdWRlZCBpbiB0aGVcblx0XHRcdC8vIHZpc2liaWxpdHkgdHJhbnNpdGlvbiByYXRoZXIgdGhhbiByZWFwcGVhcmluZyBhZnRlciB0aGUgc2lkZSBwYW5lIGhpZGVzLlxuXHRcdFx0aWYgKGVkaXRvcldhc01heGltaXplZCkge1xuXHRcdFx0XHR0aGlzLnNldEVkaXRvck1heGltaXplZChmYWxzZSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHZpc2libGUgPSAhdGhpcy5pc1NpZGVQYW5lVmlzaWJsZSgpO1xuXHRcdFx0aWYgKCF2aXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMuX3Jlc3RvcmVTaWRlUGFuZUVkaXRvck1heGltaXplZE9uU2hvdyA9IGVkaXRvcldhc01heGltaXplZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHN1cHByZXNzRWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5ID0gdGhpcy5zdXBwcmVzc0VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eSgpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Ly8gSGlkZSBpbiB0aGUgcmV2ZXJzZSBvcmRlciBvZiBzaG93IHNvIGdyaWQgc2l6aW5nIHJlc3RvcmVzIGNvcnJlY3RseS5cblx0XHRcdFx0aWYgKHZpc2libGUpIHtcblx0XHRcdFx0XHRjb25zdCByZXN0b3JlID0gdGhpcy5fc2lkZVBhbmVTdGF0ZUJlZm9yZUhpZGUgPz8gdGhpcy5fZGVmYXVsdFNpZGVQYW5lU3RhdGU7XG5cdFx0XHRcdFx0dGhpcy5zZXRFZGl0b3JIaWRkZW4oIXJlc3RvcmUuZWRpdG9yLCBmYWxzZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0dGhpcy5fc2V0QXV4aWxpYXJ5QmFySGlkZGVuKCFyZXN0b3JlLmF1eGlsaWFyeUJhciwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9zaWRlUGFuZVN0YXRlQmVmb3JlSGlkZSA9IHRoaXMuX2dldFNpZGVQYW5lU3RhdGUoKTtcblx0XHRcdFx0XHR0aGlzLnNldEVkaXRvckhpZGRlbih0cnVlKTtcblx0XHRcdFx0XHR0aGlzLl9zZXRBdXhpbGlhcnlCYXJIaWRkZW4odHJ1ZSwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0c3VwcHJlc3NFZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHkuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFzdGF0ZUJlZm9yZVRvZ2dsZS5lZGl0b3IgJiYgIXN0YXRlQmVmb3JlVG9nZ2xlLmF1eGlsaWFyeUJhciAmJiB0aGlzLmlzU2lkZVBhbmVWaXNpYmxlKCkpIHtcblx0XHRcdFx0Ly8gUmV2ZWFsIGNhbGxzIGFib3ZlIGV4cGxpY2l0bHkgc2tpcCBub3RpZmljYXRpb247IG5vdGlmeSBvbmNlIGFmdGVyIHRoZVxuXHRcdFx0XHQvLyBjb21wbGV0ZSBlZGl0b3IvYXV4IGNvbXBvc2l0aW9uIGhhcyBzZXR0bGVkLlxuXHRcdFx0XHR0aGlzLl9vblNpZGVQYW5lUmV2ZWFsZWQoKTtcblx0XHRcdH1cblx0XHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHRcdGNvbnN0IHJlc3RvcmVFZGl0b3JNYXhpbWl6ZWQgPSB0aGlzLl9yZXN0b3JlU2lkZVBhbmVFZGl0b3JNYXhpbWl6ZWRPblNob3c7XG5cdFx0XHRcdHRoaXMuX3Jlc3RvcmVTaWRlUGFuZUVkaXRvck1heGltaXplZE9uU2hvdyA9IGZhbHNlO1xuXHRcdFx0XHRpZiAocmVzdG9yZUVkaXRvck1heGltaXplZCkge1xuXHRcdFx0XHRcdHRoaXMuc2V0RWRpdG9yTWF4aW1pemVkKHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX29uRGlkVG9nZ2xlU2lkZVBhbmUuZmlyZSh7IGJlZm9yZTogc3RhdGVCZWZvcmVUb2dnbGUsIGFmdGVyOiB0aGlzLl9nZXRTaWRlUGFuZVN0YXRlKCkgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmlzaWJsZSA9IHRoaXMuaXNTaWRlUGFuZVZpc2libGUoKTtcblx0XHRpZiAoIXZpc2libGUgJiYgc2lkZVBhbmVIYWRGb2N1cykge1xuXHRcdFx0dGhpcy5mb2N1c1BhcnQoUGFydHMuU0VTU0lPTlNfUEFSVCk7XG5cdFx0fVxuXHRcdHJldHVybiB2aXNpYmxlO1xuXHR9XG5cblx0aGlkZVNpZGVQYW5lKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzU2lkZVBhbmVWaXNpYmxlKCkpIHtcblx0XHRcdHRoaXMudG9nZ2xlU2lkZVBhbmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRTaWRlUGFuZVN0YXRlKCk6IElTaWRlUGFuZVN0YXRlIHtcblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLmlzVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCwgbWFpbldpbmRvdyk7XG5cdFx0Y29uc3QgYXV4aWxpYXJ5QmFyID0gdGhpcy5pc1Zpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXHRcdHJldHVybiB7IGVkaXRvciwgYXV4aWxpYXJ5QmFyIH07XG5cdH1cblxuXHRwcml2YXRlIHNldFNpZGVCYXJIaWRkZW4oaGlkZGVuOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMucGFydFZpc2liaWxpdHkuc2lkZWJhciA9PT0gIWhpZGRlbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc2l6ZUNvbnRleHQgPSB0aGlzLl9wcmVwYXJlU2lkZUJhclJlc2l6ZShoaWRkZW4pO1xuXG5cdFx0dGhpcy5wYXJ0VmlzaWJpbGl0eS5zaWRlYmFyID0gIWhpZGRlbjtcblx0XHR0aGlzLm1haW5Db250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZShMYXlvdXRDbGFzc2VzLlNJREVCQVJfSElEREVOLCBoaWRkZW4pO1xuXG5cdFx0Ly8gUHJvcGFnYXRlIHRvIGdyaWRcblx0XHR0aGlzLndvcmtiZW5jaEdyaWQuc2V0Vmlld1Zpc2libGUoXG5cdFx0XHR0aGlzLnNpZGVCYXJQYXJ0Vmlldyxcblx0XHRcdCFoaWRkZW4sXG5cdFx0KTtcblxuXHRcdHRoaXMuX2FwcGx5U2lkZUJhclJlc2l6ZShoaWRkZW4sIHJlc2l6ZUNvbnRleHQpO1xuXG5cdFx0Ly8gSWYgc2lkZWJhciBiZWNvbWVzIGhpZGRlbiwgYWxzbyBoaWRlIHRoZSBjdXJyZW50IGFjdGl2ZSBwYW5lIGNvbXBvc2l0ZVxuXHRcdGlmIChoaWRkZW4gJiYgdGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5nZXRBY3RpdmVQYW5lQ29tcG9zaXRlKFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKSkge1xuXHRcdFx0dGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5oaWRlQWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgc2lkZWJhciBiZWNvbWVzIHZpc2libGUsIHNob3cgbGFzdCBhY3RpdmUgVmlld2xldCBvciBkZWZhdWx0IHZpZXdsZXRcblx0XHRpZiAoIWhpZGRlbiAmJiAhdGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5nZXRBY3RpdmVQYW5lQ29tcG9zaXRlKFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKSkge1xuXHRcdFx0Y29uc3Qgdmlld2xldFRvT3BlbiA9IHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0TGFzdEFjdGl2ZVBhbmVDb21wb3NpdGVJZChWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcikgPz9cblx0XHRcdFx0dGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0RGVmYXVsdFZpZXdDb250YWluZXIoVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpPy5pZDtcblx0XHRcdGlmICh2aWV3bGV0VG9PcGVuKSB7XG5cdFx0XHRcdHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2Uub3BlblBhbmVDb21wb3NpdGUodmlld2xldFRvT3BlbiwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMubGF5b3V0TW9iaWxlU2lkZWJhcigpO1xuXHRcdHRoaXMuX3NhdmVQYXJ0VmlzaWJpbGl0eSgpO1xuXHRcdHRoaXMuX2xheW91dEdyaWQoKTtcblx0fVxuXG5cdHNldEF1eGlsaWFyeUJhckhpZGRlbihoaWRkZW46IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9zZXRBdXhpbGlhcnlCYXJIaWRkZW4oaGlkZGVuKTtcblx0fVxuXG5cdHNldEF1eGlsaWFyeUJhckhpZGRlbkZvclJlc2l6ZShoaWRkZW46IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9zZXRBdXhpbGlhcnlCYXJIaWRkZW4oaGlkZGVuLCAncmVzaXplJyk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRBdXhpbGlhcnlCYXJIaWRkZW4oaGlkZGVuOiBib29sZWFuLCBzb3VyY2U/OiAncmVzaXplJywgc2tpcFNpZGVQYW5lUmV2ZWFsOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5wYXJ0VmlzaWJpbGl0eS5hdXhpbGlhcnlCYXIgPT09ICFoaWRkZW4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzaWRlUGFuZVdhc0Nsb3NlZCA9ICF0aGlzLnBhcnRWaXNpYmlsaXR5LmVkaXRvciAmJiAhdGhpcy5wYXJ0VmlzaWJpbGl0eS5hdXhpbGlhcnlCYXI7XG5cblx0XHRpZiAoaGlkZGVuKSB7XG5cdFx0XHR0aGlzLl9yZXN0b3JlQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRPblNob3cgPSBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbldpbGxIaWRlQXV4aWxpYXJ5QmFyKGhpZGRlbik7XG5cblx0XHR0aGlzLnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhciA9ICFoaWRkZW47XG5cdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoTGF5b3V0Q2xhc3Nlcy5BVVhJTElBUllCQVJfSElEREVOLCAhdGhpcy5fZWZmZWN0aXZlVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCkpO1xuXG5cdFx0dGhpcy5fYXBwbHlBdXhpbGlhcnlCYXJWaXNpYmlsaXR5KGhpZGRlbiwgc291cmNlKTtcblx0XHR0aGlzLl91cGRhdGVFZGl0b3JQYW5lVmlzaWJpbGl0eUNsYXNzKCk7XG5cblx0XHQvLyBJZiBhdXhpbGlhcnkgYmFyIGJlY29tZXMgaGlkZGVuLCBhbHNvIGhpZGUgdGhlIGN1cnJlbnQgYWN0aXZlIHBhbmUgY29tcG9zaXRlXG5cdFx0aWYgKGhpZGRlbiAmJiB0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldEFjdGl2ZVBhbmVDb21wb3NpdGUoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcikpIHtcblx0XHRcdHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuaGlkZUFjdGl2ZVBhbmVDb21wb3NpdGUoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcik7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgYXV4aWxpYXJ5IGJhciBiZWNvbWVzIHZpc2libGUsIHNob3cgbGFzdCBhY3RpdmUgcGFuZSBjb21wb3NpdGUgb3IgZGVmYXVsdFxuXHRcdGlmICghaGlkZGVuICYmICF0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldEFjdGl2ZVBhbmVDb21wb3NpdGUoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcikpIHtcblx0XHRcdGNvbnN0IHBhbmVDb21wb3NpdGVUb09wZW4gPSB0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldExhc3RBY3RpdmVQYW5lQ29tcG9zaXRlSWQoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcikgPz9cblx0XHRcdFx0dGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0RGVmYXVsdFZpZXdDb250YWluZXIoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcik/LmlkO1xuXHRcdFx0aWYgKHBhbmVDb21wb3NpdGVUb09wZW4gJiYgdGhpcy5fc2hvdWxkT3BlbkF1eGlsaWFyeVBhbmVDb21wb3NpdGUocGFuZUNvbXBvc2l0ZVRvT3BlbikpIHtcblx0XHRcdFx0dGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5vcGVuUGFuZUNvbXBvc2l0ZShwYW5lQ29tcG9zaXRlVG9PcGVuLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXNvdXJjZSkge1xuXHRcdFx0dGhpcy5fc2F2ZVBhcnRWaXNpYmlsaXR5KCk7XG5cdFx0fVxuXG5cdFx0aWYgKCFoaWRkZW4gJiYgc2lkZVBhbmVXYXNDbG9zZWQgJiYgIXNraXBTaWRlUGFuZVJldmVhbCkge1xuXHRcdFx0dGhpcy5fb25TaWRlUGFuZVJldmVhbGVkKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIGdpdmVuIGF1eGlsaWFyeS1iYXIgdmlldyBjb250YWluZXIgY3VycmVudGx5IGhhcyBjb250ZW50IHRvIHNob3dcblx0ICogKG1pcnJvcnMgYElWaWV3c1NlcnZpY2UuaXNWaWV3Q29udGFpbmVyQWN0aXZlYDogYSBgaGlkZUlmRW1wdHlgIGNvbnRhaW5lciBpc1xuXHQgKiBvbmx5IGFjdGl2ZSBvbmNlIGl0IGhhcyBhdCBsZWFzdCBvbmUgYWN0aXZlIHZpZXcgZGVzY3JpcHRvcikuIFVzZWQgdG8gYXZvaWRcblx0ICogcHJlc2VudGluZyBhbiBlbXB0eSBkb2NrZWQgZGV0YWlsIHBhbmVsLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9pc0F1eFZpZXdDb250YWluZXJBY3RpdmUoY29udGFpbmVySWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHZpZXdDb250YWluZXIgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlJZChjb250YWluZXJJZCk7XG5cdFx0aWYgKCF2aWV3Q29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghdmlld0NvbnRhaW5lci5oaWRlSWZFbXB0eSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwodmlld0NvbnRhaW5lcikuYWN0aXZlVmlld0Rlc2NyaXB0b3JzLmxlbmd0aCA+IDA7XG5cdH1cblxuXHRzZXRFZGl0b3JIaWRkZW4oaGlkZGVuOiBib29sZWFuLCBleHBsaWNpdDogYm9vbGVhbiA9IGZhbHNlLCBza2lwU2lkZVBhbmVSZXZlYWw6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnBhcnRWaXNpYmlsaXR5LmVkaXRvciA9PT0gIWhpZGRlbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNpZGVQYW5lV2FzQ2xvc2VkID0gIXRoaXMucGFydFZpc2liaWxpdHkuZWRpdG9yICYmICF0aGlzLnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhcjtcblx0XHRjb25zdCBwYW5lbFNpemVCZWZvcmVFZGl0b3JSZXZlYWwgPSAhaGlkZGVuICYmIHRoaXMuaXNTaW5nbGVQYW5lTGF5b3V0RW5hYmxlZCAmJiB0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKFBhcnRzLlBBTkVMX1BBUlQpXG5cdFx0XHQ/IHRoaXMud29ya2JlbmNoR3JpZC5nZXRWaWV3U2l6ZSh0aGlzLnBhbmVsUGFydFZpZXcpXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdC8vIFRyYWNrIHdoZXRoZXIgdGhpcyB2aXNpYmxlIHN0YXRlIHdhcyBhbiBleHBsaWNpdCB1c2VyIHJldmVhbC5cblx0XHR0aGlzLl9lZGl0b3JSZXZlYWxlZEV4cGxpY2l0bHkgPSAhaGlkZGVuICYmIGV4cGxpY2l0O1xuXG5cdFx0dGhpcy5fcnVuV2l0aEVkaXRvclJlc2l6ZVN5bmNTdXNwZW5kZWQoKCkgPT4ge1xuXHRcdFx0Ly8gSWYgaGlkaW5nIHRoZSBlZGl0b3Igd2hpbGUgbWF4aW1pemVkXG5cdFx0XHRpZiAoaGlkZGVuICYmIHRoaXMuX2VkaXRvck1heGltaXplZCkge1xuXHRcdFx0XHR0aGlzLnNldEVkaXRvck1heGltaXplZChmYWxzZSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMucGFydFZpc2liaWxpdHkuZWRpdG9yID0gIWhpZGRlbjtcblx0XHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKExheW91dENsYXNzZXMuTUFJTl9FRElUT1JfQVJFQV9ISURERU4sICF0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJUKSk7XG5cblx0XHRcdGlmICh0aGlzLmVkaXRvclBhcnRWaWV3KSB7XG5cdFx0XHRcdHRoaXMuX2FwcGx5RWRpdG9yVmlzaWJpbGl0eShoaWRkZW4pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdXBkYXRlRWRpdG9yUGFuZVZpc2liaWxpdHlDbGFzcygpO1xuXG5cdFx0XHR0aGlzLl9zYXZlUGFydFZpc2liaWxpdHkoKTtcblx0XHR9KTtcblx0XHRpZiAocGFuZWxTaXplQmVmb3JlRWRpdG9yUmV2ZWFsKSB7XG5cdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQucmVzaXplVmlldyh0aGlzLnBhbmVsUGFydFZpZXcsIHBhbmVsU2l6ZUJlZm9yZUVkaXRvclJldmVhbCk7XG5cdFx0fVxuXG5cdFx0aWYgKCFoaWRkZW4gJiYgc2lkZVBhbmVXYXNDbG9zZWQgJiYgIXNraXBTaWRlUGFuZVJldmVhbCkge1xuXHRcdFx0dGhpcy5fb25TaWRlUGFuZVJldmVhbGVkKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEZpcmVzIHdoZW4gdGhlIHNpZGUgcGFuZSAoZWRpdG9yIHBhcnQgYW5kL29yIGF1eGlsaWFyeSBiYXIpIHRyYW5zaXRpb25zIGZyb21cblx0ICogZnVsbHkgaGlkZGVuIHRvIHZpc2libGUuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX29uU2lkZVBhbmVSZXZlYWxlZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZFJldmVhbFNpZGVQYW5lLmZpcmUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTaXplcyB0aGUgZWRpdG9yIHBhcnQgd2hlbiBpdCBpcyBmaXJzdCByZXZlYWxlZCBmcm9tIGEgaGlkZGVuIHN0YXRlLCBzbyBpdFxuXHQgKiBvcGVucyBhcyBhIGNvbWZvcnRhYmxlIHNwbGl0IHdpdGggdGhlIHNlc3Npb25zIHBhcnQgcmF0aGVyIHRoYW4gYXQgaXRzXG5cdCAqIG1pbmltdW0vcmVzdG9yZWQgd2lkdGguIFRoZSBkZWZhdWx0IGdyaWQgbGF5b3V0IHNwbGl0cyB0aGUgbWFpbiBhcmVhIGV2ZW5seTtcblx0ICogbGF5b3V0cyB3aXRoIGRpZmZlcmVudCBzaXppbmcgKGUuZy4gdGhlIHNpbmdsZS1wYW5lIHNpZGUgcGFuZSkgb3ZlcnJpZGUgdGhpcy5cblx0ICovXG5cdHByb3RlY3RlZCBfYXBwbHlFZGl0b3JTcGxpdFNpemUobWFpbkFyZWFXaWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgdGFyZ2V0RWRpdG9yV2lkdGggPSBNYXRoLm1heChFRElUT1JfUEFSVF9NSU5JTVVNX1dJRFRILCBNYXRoLmZsb29yKG1haW5BcmVhV2lkdGggLyAyKSk7XG5cdFx0Y29uc3QgY3VycmVudEVkaXRvclNpemUgPSB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodGhpcy5lZGl0b3JQYXJ0Vmlldyk7XG5cdFx0dGhpcy53b3JrYmVuY2hHcmlkLnJlc2l6ZVZpZXcodGhpcy5lZGl0b3JQYXJ0Vmlldywge1xuXHRcdFx0d2lkdGg6IHRhcmdldEVkaXRvcldpZHRoLFxuXHRcdFx0aGVpZ2h0OiBjdXJyZW50RWRpdG9yU2l6ZS5oZWlnaHRcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgc2V0UGFuZWxIaWRkZW4oaGlkZGVuOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMucGFydFZpc2liaWxpdHkucGFuZWwgPT09ICFoaWRkZW4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJZiBoaWRpbmcgYW5kIHRoZSBwYW5lbCBpcyBtYXhpbWl6ZWQsIGV4aXQgbWF4aW1pemVkIHN0YXRlIGZpcnN0XG5cdFx0aWYgKGhpZGRlbiAmJiB0aGlzLndvcmtiZW5jaEdyaWQuaGFzTWF4aW1pemVkVmlldygpKSB7XG5cdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQuZXhpdE1heGltaXplZFZpZXcoKTtcblx0XHR9XG5cblx0XHRjb25zdCBwYW5lbEhhZEZvY3VzID0gIWhpZGRlbiB8fCB0aGlzLmhhc0ZvY3VzKFBhcnRzLlBBTkVMX1BBUlQpO1xuXG5cdFx0dGhpcy5wYXJ0VmlzaWJpbGl0eS5wYW5lbCA9ICFoaWRkZW47XG5cdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoTGF5b3V0Q2xhc3Nlcy5QQU5FTF9ISURERU4sICF0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKFBhcnRzLlBBTkVMX1BBUlQpKTtcblxuXHRcdC8vIFByb3BhZ2F0ZSB0byBncmlkXG5cdFx0dGhpcy53b3JrYmVuY2hHcmlkLnNldFZpZXdWaXNpYmxlKFxuXHRcdFx0dGhpcy5wYW5lbFBhcnRWaWV3LFxuXHRcdFx0dGhpcy5fZWZmZWN0aXZlVmlzaWJsZShQYXJ0cy5QQU5FTF9QQVJUKSxcblx0XHQpO1xuXG5cdFx0Ly8gSWYgcGFuZWwgYmVjb21lcyBoaWRkZW4sIGFsc28gaGlkZSB0aGUgY3VycmVudCBhY3RpdmUgcGFuZSBjb21wb3NpdGVcblx0XHRpZiAoaGlkZGVuICYmIHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpKSB7XG5cdFx0XHR0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmhpZGVBY3RpdmVQYW5lQ29tcG9zaXRlKFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCk7XG5cblx0XHRcdC8vIEZvY3VzIHRoZSBjaGF0IGJhciB3aGVuIGhpZGluZyB0aGUgcGFuZWwgaWYgaXQgaGFkIGZvY3VzXG5cdFx0XHRpZiAocGFuZWxIYWRGb2N1cykge1xuXHRcdFx0XHR0aGlzLmZvY3VzUGFydChQYXJ0cy5TRVNTSU9OU19QQVJUKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiBwYW5lbCBiZWNvbWVzIHZpc2libGUsIHNob3cgbGFzdCBhY3RpdmUgcGFuZWwgb3IgZGVmYXVsdCBhbmQgZm9jdXMgaXRcblx0XHRpZiAoIWhpZGRlbikge1xuXHRcdFx0aWYgKCF0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldEFjdGl2ZVBhbmVDb21wb3NpdGUoVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsKSkge1xuXHRcdFx0XHRjb25zdCBwYW5lbFRvT3BlbiA9IHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0TGFzdEFjdGl2ZVBhbmVDb21wb3NpdGVJZChWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpID8/XG5cdFx0XHRcdFx0dGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0RGVmYXVsdFZpZXdDb250YWluZXIoVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsKT8uaWQ7XG5cdFx0XHRcdGlmIChwYW5lbFRvT3Blbikge1xuXHRcdFx0XHRcdHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2Uub3BlblBhbmVDb21wb3NpdGUocGFuZWxUb09wZW4sIFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gQSBjdXN0b20gdmlldyBpcyBzaG93aW5nIG92ZXIgdGhlIHBhbmVsLCBzbyBpdCBtdXN0IG5vdCB0YWtlIGZvY3VzLlxuXHRcdFx0aWYgKHRoaXMuX2VmZmVjdGl2ZVZpc2libGUoUGFydHMuUEFORUxfUEFSVCkpIHtcblx0XHRcdFx0dGhpcy5mb2N1c1BhcnQoUGFydHMuUEFORUxfUEFSVCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXRTZXNzaW9uc0hpZGRlbihoaWRkZW46IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5wYXJ0VmlzaWJpbGl0eS5zZXNzaW9ucyA9PT0gIWhpZGRlbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMucGFydFZpc2liaWxpdHkuc2Vzc2lvbnMgPSAhaGlkZGVuO1xuXHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKExheW91dENsYXNzZXMuU0VTU0lPTlNfSElEREVOLCAhdGhpcy5fZWZmZWN0aXZlVmlzaWJsZShQYXJ0cy5TRVNTSU9OU19QQVJUKSk7XG5cblx0XHQvLyBQcm9wYWdhdGUgdG8gZ3JpZFxuXHRcdHRoaXMud29ya2JlbmNoR3JpZC5zZXRWaWV3VmlzaWJsZSh0aGlzLnNlc3Npb25zUGFydFZpZXcsIHRoaXMuX2VmZmVjdGl2ZVZpc2libGUoUGFydHMuU0VTU0lPTlNfUEFSVCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNob3dzIG9yIGhpZGVzIHRoZSBjdXN0b20gdmlldyBncmlkLiBUaGUgY3VzdG9tIHZpZXcgZ3JpZCBhbmQgdGhlIHNlc3Npb25zXG5cdCAqIGdyaWQgYXJlIG11dHVhbGx5IGV4Y2x1c2l2ZSBhbmQgZXhhY3RseSBvbmUgb2YgdGhlbSBvd25zIHRoZSByb3csIHNvIGhpZGluZ1xuXHQgKiB0aGUgY3VzdG9tIHZpZXcgYWx3YXlzIGJyaW5ncyB0aGUgc2Vzc2lvbnMgZ3JpZCBiYWNrICh0b2dldGhlciB3aXRoIHRoZSBzaWRlXG5cdCAqIHBhbmVsIGFuZCBwYW5lbCBzdGF0ZSB0aGUgbGF5b3V0IHdhbnRzIGZvciB0aGUgYWN0aXZlIHNlc3Npb24pLiBUaGUgcGFydHMgaXRcblx0ICogY292ZXJzIGtlZXAgdGhlaXIgZGVzaXJlZCB2aXNpYmlsaXR5IHdoaWxlIGl0IGlzIHNob3duLCBzbyB0aGUgcmVzdG9yZVxuXHQgKiByZWZsZWN0cyB3aGF0ZXZlciB0aGUgbGF5b3V0IGNvbnRyb2xsZXIgbGFzdCBhc2tlZCBmb3IuXG5cdCAqL1xuXHRwcml2YXRlIF9hcHBseUN1c3RvbVZpZXdHcmlkVmlzaWJpbGl0eShkZXNjcmlwdG9yOiBJQ3VzdG9tVmlld0Rlc2NyaXB0b3IgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCB2aXNpYmxlID0gISFkZXNjcmlwdG9yO1xuXHRcdGlmICh0aGlzLnBhcnRWaXNpYmlsaXR5LmN1c3RvbVZpZXdHcmlkID09PSB2aXNpYmxlKSB7XG5cdFx0XHQvLyBTd2FwcGluZyBvbmUgY3VzdG9tIHZpZXcgZm9yIGFub3RoZXIgb25seSBjaGFuZ2VzIHdoYXQgaXMgcmVuZGVyZWQuXG5cdFx0XHR0aGlzLmN1c3RvbVZpZXdHcmlkUGFydFNlcnZpY2Uuc2V0VmlldyhkZXNjcmlwdG9yKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB3YXNWaXNpYmxlID0gV29ya2JlbmNoLl9DVVNUT01fVklFV19FWENMVVNJVkVfUEFSVFMubWFwKHBhcnQgPT4gdGhpcy5fZWZmZWN0aXZlVmlzaWJsZShwYXJ0KSk7XG5cblx0XHQvLyBBIG1heGltaXplZCBlZGl0b3Igb3ducyB0aGUgcm93IGluc3RlYWQgb2YgdGhlIHNlc3Npb25zIGdyaWQsIHdoaWNoIHdvdWxkXG5cdFx0Ly8gbGVhdmUgdGhlIHJvdyB3aXRob3V0IGFuIG93bmVyIG9uY2UgdGhlIGN1c3RvbSB2aWV3IGdvZXMgYXdheS5cblx0XHRpZiAodmlzaWJsZSAmJiB0aGlzLl9lZGl0b3JNYXhpbWl6ZWQpIHtcblx0XHRcdHRoaXMuc2V0RWRpdG9yTWF4aW1pemVkKGZhbHNlKTtcblx0XHR9XG5cblx0XHR0aGlzLmN1c3RvbVZpZXdHcmlkUGFydFNlcnZpY2Uuc2V0VmlldyhkZXNjcmlwdG9yKTtcblx0XHR0aGlzLnBhcnRWaXNpYmlsaXR5LmN1c3RvbVZpZXdHcmlkID0gdmlzaWJsZTtcblx0XHR0aGlzLl9jdXN0b21WaWV3VmlzaWJsZUtleS5zZXQodmlzaWJsZSk7XG5cblx0XHRpZiAoIXRoaXMud29ya2JlbmNoR3JpZCkge1xuXHRcdFx0cmV0dXJuOyAvLyBzdGlsbCBzdGFydGluZyB1cDsgdGhlIGdyaWQgZGVzY3JpcHRvciBwaWNrcyB0aGlzIHN0YXRlIHVwXG5cdFx0fVxuXG5cdFx0dGhpcy5fYXBwbHlpbmdDdXN0b21WaWV3R3JpZFZpc2liaWxpdHkgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBTdXNwZW5kZWQgc28gdGhlIHNpbmdsZS1wYW5lIHdpZHRoIHN5bmMgY2Fubm90IHJlYWQgdGhlIHRyYW5zaWVudCBub2RlXG5cdFx0XHQvLyB3aWR0aHMgYXMgYSBzYXNoIGRyYWcgYW5kIHdyaXRlIGJhY2sgdGhlIGRlc2lyZWQgdmlzaWJpbGl0eS5cblx0XHRcdHRoaXMuX3J1bldpdGhFZGl0b3JSZXNpemVTeW5jU3VzcGVuZGVkKCgpID0+IHtcblx0XHRcdFx0Ly8gT25lIHBhc3MsIHJldmVhbGluZyBiZWZvcmUgaGlkaW5nIHNvIHRoZSByb3cgbmV2ZXIgZ29lcyBlbXB0eSBpbiBiZXR3ZWVuLlxuXHRcdFx0XHRpZiAodmlzaWJsZSkge1xuXHRcdFx0XHRcdHRoaXMud29ya2JlbmNoR3JpZC5zZXRWaWV3VmlzaWJsZSh0aGlzLmN1c3RvbVZpZXdHcmlkUGFydFZpZXcsIHRydWUpO1xuXHRcdFx0XHRcdHRoaXMuX2FwcGx5RXhjbHVzaXZlUGFydFZpc2liaWxpdHkoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9hcHBseUV4Y2x1c2l2ZVBhcnRWaXNpYmlsaXR5KCk7XG5cdFx0XHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLnNldFZpZXdWaXNpYmxlKHRoaXMuY3VzdG9tVmlld0dyaWRQYXJ0VmlldywgZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fYXBwbHlpbmdDdXN0b21WaWV3R3JpZFZpc2liaWxpdHkgPSBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLl91cGRhdGVFeGNsdXNpdmVMYXlvdXRDbGFzc2VzKCk7XG5cdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoTGF5b3V0Q2xhc3Nlcy5DVVNUT01fVklFV19HUklEX0hJRERFTiwgIXZpc2libGUpO1xuXHRcdHRoaXMuX3VwZGF0ZU1vYmlsZUN1c3RvbVZpZXdOYXZpZ2F0aW9uKCk7XG5cblx0XHQvLyBNaXJyb3IgdGhlIHJldmVhbC1iZWZvcmUtaGlkZSBvcmRlciBvZiB0aGUgZ3JpZCB1cGRhdGVzLlxuXHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHR0aGlzLl9maXJlRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkoUGFydHMuQ1VTVE9NX1ZJRVdfR1JJRF9QQVJULCB0cnVlKTtcblx0XHR9XG5cdFx0V29ya2JlbmNoLl9DVVNUT01fVklFV19FWENMVVNJVkVfUEFSVFMuZm9yRWFjaCgocGFydCwgaW5kZXgpID0+IHtcblx0XHRcdGNvbnN0IG5vd1Zpc2libGUgPSB0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKHBhcnQpO1xuXHRcdFx0aWYgKG5vd1Zpc2libGUgIT09IHdhc1Zpc2libGVbaW5kZXhdKSB7XG5cdFx0XHRcdHRoaXMuX2ZpcmVEaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eShwYXJ0LCBub3dWaXNpYmxlKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRpZiAoIXZpc2libGUpIHtcblx0XHRcdHRoaXMuX2ZpcmVEaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eShQYXJ0cy5DVVNUT01fVklFV19HUklEX1BBUlQsIGZhbHNlKTtcblx0XHR9XG5cblx0XHR0aGlzLmxheW91dCgpO1xuXG5cdFx0aWYgKHZpc2libGUpIHtcblx0XHRcdHRoaXMuZm9jdXNQYXJ0KFBhcnRzLkNVU1RPTV9WSUVXX0dSSURfUEFSVCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2Vzc2lvbnNQYXJ0U2VydmljZS5mb2N1c1Nlc3Npb24odGhpcy5zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlFeGNsdXNpdmVQYXJ0VmlzaWJpbGl0eSgpOiB2b2lkIHtcblx0XHR0aGlzLndvcmtiZW5jaEdyaWQuc2V0Vmlld1Zpc2libGUodGhpcy5zZXNzaW9uc1BhcnRWaWV3LCB0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKFBhcnRzLlNFU1NJT05TX1BBUlQpKTtcblx0XHR0aGlzLndvcmtiZW5jaEdyaWQuc2V0Vmlld1Zpc2libGUodGhpcy5wYW5lbFBhcnRWaWV3LCB0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKFBhcnRzLlBBTkVMX1BBUlQpKTtcblx0XHR0aGlzLl9hcHBseUVkaXRvckFyZWFWaXNpYmlsaXR5KCk7XG5cdH1cblxuXHQvKiogUHVzaGVzIHRoZSBlZGl0b3IgYW5kIGF1eGlsaWFyeSBiYXIgbm9kZSB2aXNpYmlsaXR5IGludG8gdGhlIGdyaWQuICovXG5cdHByb3RlY3RlZCBfYXBwbHlFZGl0b3JBcmVhVmlzaWJpbGl0eSgpOiB2b2lkIHtcblx0XHR0aGlzLndvcmtiZW5jaEdyaWQuc2V0Vmlld1Zpc2libGUodGhpcy5lZGl0b3JQYXJ0VmlldywgdGhpcy5fZWRpdG9yTm9kZVNob3VsZEJlVmlzaWJsZSgpKTtcblx0XHR0aGlzLndvcmtiZW5jaEdyaWQuc2V0Vmlld1Zpc2libGUodGhpcy5hdXhpbGlhcnlCYXJQYXJ0VmlldywgdGhpcy5fZWZmZWN0aXZlVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRXhjbHVzaXZlTGF5b3V0Q2xhc3NlcygpOiB2b2lkIHtcblx0XHR0aGlzLm1haW5Db250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZShMYXlvdXRDbGFzc2VzLlNFU1NJT05TX0hJRERFTiwgIXRoaXMuX2VmZmVjdGl2ZVZpc2libGUoUGFydHMuU0VTU0lPTlNfUEFSVCkpO1xuXHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKExheW91dENsYXNzZXMuTUFJTl9FRElUT1JfQVJFQV9ISURERU4sICF0aGlzLl9lZmZlY3RpdmVWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJUKSk7XG5cdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoTGF5b3V0Q2xhc3Nlcy5BVVhJTElBUllCQVJfSElEREVOLCAhdGhpcy5fZWZmZWN0aXZlVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCkpO1xuXHRcdHRoaXMubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKExheW91dENsYXNzZXMuUEFORUxfSElEREVOLCAhdGhpcy5fZWZmZWN0aXZlVmlzaWJsZShQYXJ0cy5QQU5FTF9QQVJUKSk7XG5cdFx0dGhpcy5fdXBkYXRlRWRpdG9yUGFuZVZpc2liaWxpdHlDbGFzcygpO1xuXHR9XG5cblx0LyoqIEtlZXBzIHRoZSBBbmRyb2lkIGJhY2sgYnV0dG9uIGluIHN5bmMgd2l0aCBhIHNob3duIGN1c3RvbSB2aWV3LiAqL1xuXHRwcml2YXRlIF91cGRhdGVNb2JpbGVDdXN0b21WaWV3TmF2aWdhdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCB0cmFja2VkID0gdGhpcy5sYXlvdXRQb2xpY3kudmlld3BvcnRDbGFzcy5nZXQoKSA9PT0gJ3Bob25lJyAmJiB0aGlzLnBhcnRWaXNpYmlsaXR5LmN1c3RvbVZpZXdHcmlkO1xuXHRcdGlmICh0cmFja2VkID09PSB0aGlzLm1vYmlsZU5hdlN0YWNrLmhhcygnY3VzdG9tVmlldycpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRyYWNrZWQpIHtcblx0XHRcdHRoaXMubW9iaWxlTmF2U3RhY2sucHVzaCgnY3VzdG9tVmlldycpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm1vYmlsZU5hdlN0YWNrLnBvcFNpbGVudGx5KCdjdXN0b21WaWV3Jyk7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFBvc2l0aW9uIE1ldGhvZHMgKEZpeGVkIC0gTm90IENvbmZpZ3VyYWJsZSlcblxuXHRnZXRTaWRlQmFyUG9zaXRpb24oKTogUG9zaXRpb24ge1xuXHRcdHJldHVybiBQb3NpdGlvbi5MRUZUOyAvLyBBbHdheXMgbGVmdCBpbiB0aGlzIGxheW91dFxuXHR9XG5cblx0Z2V0UGFuZWxQb3NpdGlvbigpOiBQb3NpdGlvbiB7XG5cdFx0cmV0dXJuIFBvc2l0aW9uLkJPVFRPTTsgLy8gQWx3YXlzIGJvdHRvbSBpbiB0aGlzIGxheW91dFxuXHR9XG5cblx0c2V0UGFuZWxQb3NpdGlvbihfcG9zaXRpb246IFBvc2l0aW9uKTogdm9pZCB7XG5cdFx0Ly8gTm8tb3A6IFBhbmVsIHBvc2l0aW9uIGlzIGZpeGVkIGluIHRoaXMgbGF5b3V0XG5cdH1cblxuXHRnZXRQYW5lbEFsaWdubWVudCgpOiBQYW5lbEFsaWdubWVudCB7XG5cdFx0cmV0dXJuICdqdXN0aWZ5JzsgLy8gRnVsbCB3aWR0aCBwYW5lbFxuXHR9XG5cblx0c2V0UGFuZWxBbGlnbm1lbnQoX2FsaWdubWVudDogUGFuZWxBbGlnbm1lbnQpOiB2b2lkIHtcblx0XHQvLyBOby1vcDogUGFuZWwgYWxpZ25tZW50IGlzIGZpeGVkIGluIHRoaXMgbGF5b3V0XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gU2l6ZSBNZXRob2RzXG5cblx0Z2V0U2l6ZShwYXJ0OiBQYXJ0cyk6IElWaWV3U2l6ZSB7XG5cdFx0aWYgKHBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYXV4aWxpYXJ5QmFyVmlld1NpemUoKTtcblx0XHR9XG5cdFx0Y29uc3QgdmlldyA9IHRoaXMuZ2V0UGFydFZpZXcocGFydCk7XG5cdFx0aWYgKCF2aWV3KSB7XG5cdFx0XHRyZXR1cm4geyB3aWR0aDogMCwgaGVpZ2h0OiAwIH07XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodmlldyk7XG5cdH1cblxuXHRzZXRTaXplKHBhcnQ6IFBhcnRzLCBzaXplOiBJVmlld1NpemUpOiB2b2lkIHtcblx0XHRpZiAocGFydCA9PT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpIHtcblx0XHRcdHRoaXMuX3NldEF1eGlsaWFyeUJhclZpZXdTaXplKHNpemUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB2aWV3ID0gdGhpcy5nZXRQYXJ0VmlldyhwYXJ0KTtcblx0XHRpZiAodmlldykge1xuXHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLnJlc2l6ZVZpZXcodmlldywgc2l6ZSk7XG5cdFx0fVxuXHR9XG5cblx0cmVzaXplUGFydChwYXJ0OiBQYXJ0cywgc2l6ZUNoYW5nZVdpZHRoOiBudW1iZXIsIHNpemVDaGFuZ2VIZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmIChwYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCkge1xuXHRcdFx0dGhpcy5fcmVzaXplQXV4aWxpYXJ5QmFyQnkoc2l6ZUNoYW5nZVdpZHRoLCBzaXplQ2hhbmdlSGVpZ2h0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdmlldyA9IHRoaXMuZ2V0UGFydFZpZXcocGFydCk7XG5cdFx0aWYgKCF2aWV3KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VycmVudFNpemUgPSB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0Vmlld1NpemUodmlldyk7XG5cdFx0dGhpcy53b3JrYmVuY2hHcmlkLnJlc2l6ZVZpZXcodmlldywge1xuXHRcdFx0d2lkdGg6IGN1cnJlbnRTaXplLndpZHRoICsgc2l6ZUNoYW5nZVdpZHRoLFxuXHRcdFx0aGVpZ2h0OiBjdXJyZW50U2l6ZS5oZWlnaHQgKyBzaXplQ2hhbmdlSGVpZ2h0XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFBhcnRWaWV3KHBhcnQ6IFBhcnRzKTogSVNlcmlhbGl6YWJsZVZpZXcgfCB1bmRlZmluZWQge1xuXHRcdHN3aXRjaCAocGFydCkge1xuXHRcdFx0Y2FzZSBQYXJ0cy5USVRMRUJBUl9QQVJUOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy50aXRsZUJhclBhcnRWaWV3O1xuXHRcdFx0Y2FzZSBQYXJ0cy5TSURFQkFSX1BBUlQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLnNpZGVCYXJQYXJ0Vmlldztcblx0XHRcdGNhc2UgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLmF1eGlsaWFyeUJhclBhcnRWaWV3O1xuXHRcdFx0Y2FzZSBQYXJ0cy5FRElUT1JfUEFSVDpcblx0XHRcdFx0cmV0dXJuIHRoaXMuZWRpdG9yUGFydFZpZXc7XG5cdFx0XHRjYXNlIFBhcnRzLlBBTkVMX1BBUlQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLnBhbmVsUGFydFZpZXc7XG5cdFx0XHRjYXNlIFBhcnRzLlNFU1NJT05TX1BBUlQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLnNlc3Npb25zUGFydFZpZXc7XG5cdFx0XHRjYXNlIFBhcnRzLkNVU1RPTV9WSUVXX0dSSURfUEFSVDpcblx0XHRcdFx0cmV0dXJuIHRoaXMuY3VzdG9tVmlld0dyaWRQYXJ0Vmlldztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0Z2V0TWF4aW11bUVkaXRvckRpbWVuc2lvbnMoX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRGltZW5zaW9uIHtcblx0XHQvLyBSZXR1cm4gdGhlIGF2YWlsYWJsZSBzcGFjZSBmb3IgZWRpdG9yIChleGNsdWRpbmcgb3RoZXIgcGFydHMpXG5cdFx0Y29uc3Qgc2lkZWJhcldpZHRoID0gdGhpcy5wYXJ0VmlzaWJpbGl0eS5zaWRlYmFyID8gdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMuc2lkZUJhclBhcnRWaWV3KS53aWR0aCA6IDA7XG5cdFx0Y29uc3QgYXV4aWxpYXJ5QmFyV2lkdGggPSB0aGlzLnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhclxuXHRcdFx0PyB0aGlzLl9hdXhpbGlhcnlCYXJMYXlvdXRXaWR0aCgpXG5cdFx0XHQ6IDA7XG5cdFx0Y29uc3QgcGFuZWxIZWlnaHQgPSB0aGlzLnBhcnRWaXNpYmlsaXR5LnBhbmVsID8gdGhpcy53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKHRoaXMucGFuZWxQYXJ0VmlldykuaGVpZ2h0IDogMDtcblx0XHRjb25zdCB0aXRsZUJhckhlaWdodCA9IHRoaXMud29ya2JlbmNoR3JpZC5nZXRWaWV3U2l6ZSh0aGlzLnRpdGxlQmFyUGFydFZpZXcpLmhlaWdodDtcblxuXHRcdHJldHVybiBuZXcgRGltZW5zaW9uKFxuXHRcdFx0dGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbi53aWR0aCAtIHNpZGViYXJXaWR0aCAtIGF1eGlsaWFyeUJhcldpZHRoLFxuXHRcdFx0dGhpcy5fbWFpbkNvbnRhaW5lckRpbWVuc2lvbi5oZWlnaHQgLSB0aXRsZUJhckhlaWdodCAtIHBhbmVsSGVpZ2h0XG5cdFx0KTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBVbnN1cHBvcnRlZCBGZWF0dXJlcyAoTm8tb3BzKVxuXG5cdHRvZ2dsZU1heGltaXplZFBhbmVsKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy53b3JrYmVuY2hHcmlkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaXNQYW5lbE1heGltaXplZCgpKSB7XG5cdFx0XHR0aGlzLndvcmtiZW5jaEdyaWQuZXhpdE1heGltaXplZFZpZXcoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLm1heGltaXplVmlldyh0aGlzLnBhbmVsUGFydFZpZXcsIFt0aGlzLnRpdGxlQmFyUGFydFZpZXcsIHRoaXMuc2lkZUJhclBhcnRWaWV3XSk7XG5cdFx0fVxuXHR9XG5cblx0aXNQYW5lbE1heGltaXplZCgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMud29ya2JlbmNoR3JpZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLndvcmtiZW5jaEdyaWQuaXNWaWV3TWF4aW1pemVkKHRoaXMucGFuZWxQYXJ0Vmlldyk7XG5cdH1cblxuXHR0b2dnbGVNYXhpbWl6ZWRBdXhpbGlhcnlCYXIoKTogdm9pZCB7XG5cdFx0Ly8gTm8tb3A6IE1heGltaXplIG5vdCBzdXBwb3J0ZWQgaW4gdGhpcyBsYXlvdXRcblx0fVxuXG5cdHNldEF1eGlsaWFyeUJhck1heGltaXplZChfbWF4aW1pemVkOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlOyAvLyBNYXhpbWl6ZSBub3Qgc3VwcG9ydGVkXG5cdH1cblxuXHRpc0F1eGlsaWFyeUJhck1heGltaXplZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7IC8vIE1heGltaXplIG5vdCBzdXBwb3J0ZWRcblx0fVxuXG5cdGlzRWRpdG9yTWF4aW1pemVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9lZGl0b3JNYXhpbWl6ZWQ7XG5cdH1cblxuXHRzZXRFZGl0b3JNYXhpbWl6ZWQobWF4aW1pemVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKG1heGltaXplZCA9PT0gdGhpcy5fZWRpdG9yTWF4aW1pemVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKG1heGltaXplZCkge1xuXHRcdFx0Ly8gU2F2ZSBjdXJyZW50IHZpc2liaWxpdHkgc3RhdGVcblx0XHRcdHRoaXMuX2VkaXRvckxhc3ROb25NYXhpbWl6ZWRWaXNpYmlsaXR5ID0ge1xuXHRcdFx0XHRzaWRlYmFyOiB0aGlzLnBhcnRWaXNpYmlsaXR5LnNpZGViYXIsXG5cdFx0XHRcdGF1eGlsaWFyeUJhcjogdGhpcy5wYXJ0VmlzaWJpbGl0eS5hdXhpbGlhcnlCYXIsXG5cdFx0XHRcdGVkaXRvcjogdGhpcy5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IsXG5cdFx0XHRcdHBhbmVsOiB0aGlzLnBhcnRWaXNpYmlsaXR5LnBhbmVsLFxuXHRcdFx0XHRzZXNzaW9uczogdGhpcy5wYXJ0VmlzaWJpbGl0eS5zZXNzaW9ucyxcblx0XHRcdFx0Y3VzdG9tVmlld0dyaWQ6IHRoaXMucGFydFZpc2liaWxpdHkuY3VzdG9tVmlld0dyaWQsXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBTYXZlIHRoZSBlZGl0b3IgcGFydCBzaXplIHNvIGl0IGNhbiBiZSByZXN0b3JlZCBvbiB1bi1tYXhpbWl6ZS5cblx0XHRcdC8vIFdoaWxlIG1heGltaXplZCB0aGUgbGF5b3V0IGNvbnRyb2xsZXIgZm9yY2VzIHRoZSBhdXhpbGlhcnkgYmFyXG5cdFx0XHQvLyAoQ2hhbmdlcykgdmlzaWJsZSwgd2hpY2ggc2hyaW5rcyB0aGUgZWRpdG9yOyB3aXRob3V0IHJlc3RvcmluZyB0aGVcblx0XHRcdC8vIHNpemUgdGhlIGVkaXRvciB3b3VsZCBub3QgcmV0dXJuIHRvIGl0cyBwcmV2aW91cyB3aWR0aC5cblx0XHRcdHRoaXMuX2VkaXRvckxhc3ROb25NYXhpbWl6ZWRTaXplID0gdGhpcy5lZGl0b3JQYXJ0Vmlld1xuXHRcdFx0XHQ/IHRoaXMud29ya2JlbmNoR3JpZC5nZXRWaWV3U2l6ZSh0aGlzLmVkaXRvclBhcnRWaWV3KVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdFx0Ly8gRW5zdXJlIGVkaXRvciBpcyB2aXNpYmxlXG5cdFx0XHRpZiAoIXRoaXMucGFydFZpc2liaWxpdHkuZWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMuc2V0RWRpdG9ySGlkZGVuKGZhbHNlKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSGlkZSBhbGwgb3RoZXIgY29udGVudCBwYXJ0c1xuXHRcdFx0aWYgKHRoaXMucGFydFZpc2liaWxpdHkuc2lkZWJhcikge1xuXHRcdFx0XHR0aGlzLnNldFNpZGVCYXJIaWRkZW4odHJ1ZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5wYXJ0VmlzaWJpbGl0eS5zZXNzaW9ucykge1xuXHRcdFx0XHR0aGlzLnNldFNlc3Npb25zSGlkZGVuKHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9lZGl0b3JNYXhpbWl6ZWQgPSB0cnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX2VkaXRvckxhc3ROb25NYXhpbWl6ZWRWaXNpYmlsaXR5O1xuXHRcdFx0Y29uc3Qgc2l6ZSA9IHRoaXMuX2VkaXRvckxhc3ROb25NYXhpbWl6ZWRTaXplO1xuXHRcdFx0dGhpcy5fZWRpdG9yTGFzdE5vbk1heGltaXplZFNpemUgPSB1bmRlZmluZWQ7XG5cblx0XHRcdC8vIFJlc3RvcmUgcHJldmlvdXMgdmlzaWJpbGl0eSBzdGF0ZSwgaW5jbHVkaW5nIHRoZSBhdXhpbGlhcnkgYmFyXG5cdFx0XHQvLyAod2hpY2ggdGhlIGxheW91dCBjb250cm9sbGVyIGZvcmNlZCB2aXNpYmxlIHdoaWxlIG1heGltaXplZCkuXG5cdFx0XHR0aGlzLnNldFNpZGVCYXJIaWRkZW4oIXN0YXRlPy5zaWRlYmFyKTtcblx0XHRcdHRoaXMuc2V0U2Vzc2lvbnNIaWRkZW4oIXN0YXRlPy5zZXNzaW9ucyk7XG5cdFx0XHR0aGlzLnNldEF1eGlsaWFyeUJhckhpZGRlbighc3RhdGU/LmF1eGlsaWFyeUJhcik7XG5cblx0XHRcdHRoaXMuX2VkaXRvck1heGltaXplZCA9IGZhbHNlO1xuXG5cdFx0XHQvLyBSZXN0b3JlIHRoZSBlZGl0b3IgcGFydCB3aWR0aCBjYXB0dXJlZCBiZWZvcmUgbWF4aW1pemluZy5cblx0XHRcdGlmICh0aGlzLmVkaXRvclBhcnRWaWV3ICYmIHNpemUpIHtcblx0XHRcdFx0dGhpcy53b3JrYmVuY2hHcmlkLnJlc2l6ZVZpZXcodGhpcy5lZGl0b3JQYXJ0Vmlldywgc2l6ZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sYXlvdXRTaWRlUGFuZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRWRpdG9yTWF4aW1pemVkLmZpcmUoKTtcblx0fVxuXG5cdHRvZ2dsZVplbk1vZGUoKTogdm9pZCB7XG5cdFx0Ly8gTm8tb3A6IFplbiBtb2RlIG5vdCBzdXBwb3J0ZWQgaW4gdGhpcyBsYXlvdXRcblx0fVxuXG5cdHRvZ2dsZU1lbnVCYXIoKTogdm9pZCB7XG5cdFx0Ly8gTm8tb3A6IE1lbnUgYmFyIHRvZ2dsZSBub3Qgc3VwcG9ydGVkIGluIHRoaXMgbGF5b3V0XG5cdH1cblxuXHRpc01haW5FZGl0b3JMYXlvdXRDZW50ZXJlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7IC8vIENlbnRlcmVkIGxheW91dCBub3Qgc3VwcG9ydGVkXG5cdH1cblxuXHRjZW50ZXJNYWluRWRpdG9yTGF5b3V0KF9hY3RpdmU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHQvLyBOby1vcDogQ2VudGVyZWQgbGF5b3V0IG5vdCBzdXBwb3J0ZWQgaW4gdGhpcyBsYXlvdXRcblx0fVxuXG5cdGhhc01haW5XaW5kb3dCb3JkZXIoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Z2V0TWFpbldpbmRvd0JvcmRlclJhZGl1cygpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gV2luZG93IE1heGltaXplZCBTdGF0ZVxuXG5cdGlzV2luZG93TWF4aW1pemVkKHRhcmdldFdpbmRvdzogV2luZG93KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubWF4aW1pemVkLmhhcyhnZXRXaW5kb3dJZCh0YXJnZXRXaW5kb3cpKTtcblx0fVxuXG5cdHVwZGF0ZVdpbmRvd01heGltaXplZFN0YXRlKHRhcmdldFdpbmRvdzogV2luZG93LCBtYXhpbWl6ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCB3aW5kb3dJZCA9IGdldFdpbmRvd0lkKHRhcmdldFdpbmRvdyk7XG5cdFx0aWYgKG1heGltaXplZCkge1xuXHRcdFx0dGhpcy5tYXhpbWl6ZWQuYWRkKHdpbmRvd0lkKTtcblx0XHRcdGlmICh0YXJnZXRXaW5kb3cgPT09IG1haW5XaW5kb3cpIHtcblx0XHRcdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoTGF5b3V0Q2xhc3Nlcy5NQVhJTUlaRUQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm1heGltaXplZC5kZWxldGUod2luZG93SWQpO1xuXHRcdFx0aWYgKHRhcmdldFdpbmRvdyA9PT0gbWFpbldpbmRvdykge1xuXHRcdFx0XHR0aGlzLm1haW5Db250YWluZXIuY2xhc3NMaXN0LnJlbW92ZShMYXlvdXRDbGFzc2VzLk1BWElNSVpFRCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VXaW5kb3dNYXhpbWl6ZWQuZmlyZSh7IHdpbmRvd0lkLCBtYXhpbWl6ZWQgfSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gTmVpZ2hib3IgUGFydHNcblxuXHRnZXRWaXNpYmxlTmVpZ2hib3JQYXJ0KHBhcnQ6IFBhcnRzLCBkaXJlY3Rpb246IERpcmVjdGlvbik6IFBhcnRzIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMud29ya2JlbmNoR3JpZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCB2aWV3ID0gdGhpcy5nZXRQYXJ0VmlldyhwYXJ0KTtcblx0XHRpZiAoIXZpZXcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmVpZ2hib3IgPSB0aGlzLndvcmtiZW5jaEdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3LCBkaXJlY3Rpb24sIGZhbHNlKTtcblx0XHRpZiAobmVpZ2hib3IubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5laWdoYm9yVmlldyA9IG5laWdoYm9yWzBdO1xuXG5cdFx0aWYgKG5laWdoYm9yVmlldyA9PT0gdGhpcy50aXRsZUJhclBhcnRWaWV3KSB7XG5cdFx0XHRyZXR1cm4gUGFydHMuVElUTEVCQVJfUEFSVDtcblx0XHR9XG5cdFx0aWYgKG5laWdoYm9yVmlldyA9PT0gdGhpcy5zaWRlQmFyUGFydFZpZXcpIHtcblx0XHRcdHJldHVybiBQYXJ0cy5TSURFQkFSX1BBUlQ7XG5cdFx0fVxuXHRcdGlmIChuZWlnaGJvclZpZXcgPT09IHRoaXMuYXV4aWxpYXJ5QmFyUGFydFZpZXcpIHtcblx0XHRcdHJldHVybiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVDtcblx0XHR9XG5cdFx0aWYgKG5laWdoYm9yVmlldyA9PT0gdGhpcy5lZGl0b3JQYXJ0Vmlldykge1xuXHRcdFx0cmV0dXJuIFBhcnRzLkVESVRPUl9QQVJUO1xuXHRcdH1cblx0XHRpZiAobmVpZ2hib3JWaWV3ID09PSB0aGlzLnBhbmVsUGFydFZpZXcpIHtcblx0XHRcdHJldHVybiBQYXJ0cy5QQU5FTF9QQVJUO1xuXHRcdH1cblx0XHRpZiAobmVpZ2hib3JWaWV3ID09PSB0aGlzLnNlc3Npb25zUGFydFZpZXcpIHtcblx0XHRcdHJldHVybiBQYXJ0cy5TRVNTSU9OU19QQVJUO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gUmVzdG9yZVxuXG5cdGlzUmVzdG9yZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMucmVzdG9yZWQ7XG5cdH1cblxuXHRzZXRSZXN0b3JlZCgpOiB2b2lkIHtcblx0XHR0aGlzLnJlc3RvcmVkID0gdHJ1ZTtcblx0XHR0aGlzLnJlc3RvcmVkUHJvbWlzZS5jb21wbGV0ZSgpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIE5vdGlmaWNhdGlvbnMgUmVnaXN0cmF0aW9uXG5cblx0cmVnaXN0ZXJOb3RpZmljYXRpb25zKGRlbGVnYXRlOiB7IG9uRGlkQ2hhbmdlTm90aWZpY2F0aW9uc1Zpc2liaWxpdHk6IEV2ZW50PGJvb2xlYW4+IH0pOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihkZWxlZ2F0ZS5vbkRpZENoYW5nZU5vdGlmaWNhdGlvbnNWaXNpYmlsaXR5KHZpc2libGUgPT4gdGhpcy5fb25EaWRDaGFuZ2VOb3RpZmljYXRpb25zVmlzaWJpbGl0eS5maXJlKHZpc2libGUpKSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxTQUFTLFlBQVksaUJBQThCLG9CQUFvQjtBQUN2RSxTQUFTLFNBQVMsT0FBTyxxQ0FBcUM7QUFDOUQsU0FBUyx1Q0FBdUMsdUJBQXVCLFdBQVcsbUJBQW1CLGtCQUFrQixlQUFlLGFBQWEsWUFBd0IsdUJBQXVCLGVBQWUsTUFBTSxXQUFXLHlCQUF5QjtBQUMzUCxTQUFTLGlCQUFpQix3QkFBd0I7QUFDbEQsU0FBUyxjQUFjLHVCQUF1QixVQUFVLFdBQVcsZ0JBQWdCO0FBQ25GLFNBQVMsWUFBWTtBQUNyQixTQUFTLG1CQUFtQixpQ0FBaUM7QUFDN0QsU0FBUyxXQUFXLFNBQVMsT0FBTyxVQUFVLG1CQUFtQjtBQUNqRSxTQUFTLE9BQU8sVUFBMEIseUJBQThGLHdCQUF3QjtBQUVoSyxTQUFTLFlBQVk7QUFDckIsU0FBeUcsYUFBYSx3QkFBd0I7QUFDOUksU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyx3QkFBd0IsNkJBQTZCO0FBRTlELFNBQVMsdUJBQXVCLDhCQUFnRDtBQUNoRixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGtCQUE4QjtBQUN2QyxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLG1CQUFtQixzQkFBeUM7QUFDckUsU0FBUyxp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
