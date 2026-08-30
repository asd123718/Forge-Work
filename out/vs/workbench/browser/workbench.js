import "./style.js";
import { runWhenWindowIdle } from "../../base/browser/dom.js";
import { Event, Emitter, setGlobalLeakWarningThreshold } from "../../base/common/event.js";
import { RunOnceScheduler, timeout } from "../../base/common/async.js";
import { isFirefox, isSafari, isChrome } from "../../base/browser/browser.js";
import { mark } from "../../base/common/performance.js";
import { onUnexpectedError, setUnexpectedErrorHandler } from "../../base/common/errors.js";
import { Registry } from "../../platform/registry/common/platform.js";
import { isWindows, isLinux, isWeb, isNative, isMacintosh } from "../../base/common/platform.js";
import { Extensions as WorkbenchExtensions } from "../common/contributions.js";
import { EditorExtensions } from "../common/editor.js";
import { getSingletonServiceDescriptors } from "../../platform/instantiation/common/extensions.js";
import { Position, Parts, IWorkbenchLayoutService, positionToString } from "../services/layout/browser/layoutService.js";
import { IStorageService, WillSaveStateReason, StorageScope, StorageTarget } from "../../platform/storage/common/storage.js";
import { IConfigurationService } from "../../platform/configuration/common/configuration.js";
import { LifecyclePhase, ILifecycleService } from "../services/lifecycle/common/lifecycle.js";
import { INotificationService } from "../../platform/notification/common/notification.js";
import { NotificationsCenter } from "./parts/notifications/notificationsCenter.js";
import { NotificationsAlerts } from "./parts/notifications/notificationsAlerts.js";
import { NotificationsStatus } from "./parts/notifications/notificationsStatus.js";
import { registerNotificationCommands } from "./parts/notifications/notificationsCommands.js";
import { NotificationsToasts } from "./parts/notifications/notificationsToasts.js";
import { setARIAContainer } from "../../base/browser/ui/aria/aria.js";
import { FontMeasurements } from "../../editor/browser/config/fontMeasurements.js";
import { createBareFontInfoFromRawSettings } from "../../editor/common/config/fontInfoFromSettings.js";
import { toErrorMessage } from "../../base/common/errorMessage.js";
import { WorkbenchContextKeysHandler } from "./contextkeys.js";
import { coalesce } from "../../base/common/arrays.js";
import { InstantiationService } from "../../platform/instantiation/common/instantiationService.js";
import { Layout } from "./layout.js";
import { IHostService } from "../services/host/browser/host.js";
import { IDialogService } from "../../platform/dialogs/common/dialogs.js";
import { mainWindow } from "../../base/browser/window.js";
import { PixelRatio } from "../../base/browser/pixelRatio.js";
import { IHoverService, WorkbenchHoverDelegate } from "../../platform/hover/browser/hover.js";
import { setHoverDelegateFactory } from "../../base/browser/ui/hover/hoverDelegateFactory.js";
import { setBaseLayerHoverDelegate } from "../../base/browser/ui/hover/hoverDelegate2.js";
import { AccessibilityProgressSignalScheduler } from "../../platform/accessibilitySignal/browser/progressAccessibilitySignalScheduler.js";
import { setProgressAccessibilitySignalScheduler } from "../../base/browser/ui/progressbar/progressAccessibilitySignal.js";
import { AccessibleViewRegistry } from "../../platform/accessibility/browser/accessibleViewRegistry.js";
import { NotificationAccessibleView } from "./parts/notifications/notificationAccessibleView.js";
import { IMarkdownRendererService } from "../../platform/markdown/browser/markdownRenderer.js";
import { EditorMarkdownCodeBlockRenderer } from "../../editor/browser/widget/markdownRenderer/browser/editorMarkdownCodeBlockRenderer.js";
class Workbench extends Layout {
  constructor(parent, options, serviceCollection, logService) {
    super(parent, { resetLayout: Boolean(options?.resetLayout) });
    this.options = options;
    this.serviceCollection = serviceCollection;
    this._onWillShutdown = this._register(new Emitter());
    this.onWillShutdown = this._onWillShutdown.event;
    this._onDidShutdown = this._register(new Emitter());
    this.onDidShutdown = this._onDidShutdown.event;
    this.previousUnexpectedError = { message: void 0, time: 0 };
    mark("code/willStartWorkbench");
    this.registerErrorHandler(logService);
  }
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
        markdownRendererService.setDefaultCodeBlockRenderer(instantiationService.createInstance(EditorMarkdownCodeBlockRenderer));
        setHoverDelegateFactory((placement, enableInstantHover) => instantiationService.createInstance(WorkbenchHoverDelegate, placement, { instantHover: enableInstantHover }, {}));
        setBaseLayerHoverDelegate(hoverService);
        this.initLayout(accessor);
        Registry.as(WorkbenchExtensions.Workbench).start(accessor);
        Registry.as(EditorExtensions.EditorFactory).start(accessor);
        this._register(instantiationService.createInstance(WorkbenchContextKeysHandler));
        this.registerListeners(lifecycleService, storageService, configurationService, hostService, dialogService);
        this.renderWorkbench(instantiationService, notificationService, storageService, configurationService);
        this.createWorkbenchLayout();
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
    serviceCollection.set(IWorkbenchLayoutService, this);
    const contributedServices = getSingletonServiceDescriptors();
    for (const [id, descriptor] of contributedServices) {
      serviceCollection.set(id, descriptor);
    }
    const instantiationService = new InstantiationService(serviceCollection, true);
    instantiationService.invokeFunction((accessor) => {
      const lifecycleService = accessor.get(ILifecycleService);
      const configurationService = accessor.get(IConfigurationService);
      if (configurationService && "acquireInstantiationService" in configurationService) {
        configurationService.acquireInstantiationService(instantiationService);
      }
      lifecycleService.phase = LifecyclePhase.Ready;
    });
    return instantiationService;
  }
  registerListeners(lifecycleService, storageService, configurationService, hostService, dialogService) {
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
  renderWorkbench(instantiationService, notificationService, storageService, configurationService) {
    setARIAContainer(this.mainContainer);
    setProgressAccessibilitySignalScheduler((msDelayTime, msLoopTime) => instantiationService.createInstance(AccessibilityProgressSignalScheduler, msDelayTime, msLoopTime));
    const platformClass = isWindows ? "windows" : isLinux ? "linux" : "mac";
    const workbenchClasses = coalesce([
      "monaco-workbench",
      platformClass,
      isWeb ? "web" : void 0,
      isChrome ? "chromium" : isFirefox ? "firefox" : isSafari ? "safari" : void 0,
      ...this.getLayoutClasses(),
      ...this.options?.extraClasses ? this.options.extraClasses : []
    ]);
    this.mainContainer.classList.add(...workbenchClasses);
    this.updateFontAliasing(void 0, configurationService);
    this.restoreFontInfo(storageService, configurationService);
    for (const { id, role, classes, options } of [
      { id: Parts.TITLEBAR_PART, role: "none", classes: ["titlebar"] },
      { id: Parts.BANNER_PART, role: "banner", classes: ["banner"] },
      { id: Parts.ACTIVITYBAR_PART, role: "none", classes: ["activitybar", this.getSideBarPosition() === Position.LEFT ? "left" : "right"] },
      // Use role 'none' for some parts to make screen readers less chatty #114892
      { id: Parts.SIDEBAR_PART, role: "none", classes: ["sidebar", this.getSideBarPosition() === Position.LEFT ? "left" : "right"] },
      { id: Parts.EDITOR_PART, role: "main", classes: ["editor"], options: { restorePreviousState: this.willRestoreEditors() } },
      { id: Parts.PANEL_PART, role: "none", classes: ["panel", "basepanel", positionToString(this.getPanelPosition())] },
      { id: Parts.AUXILIARYBAR_PART, role: "none", classes: ["auxiliarybar", "basepanel", this.getSideBarPosition() === Position.LEFT ? "right" : "left"] },
      { id: Parts.STATUSBAR_PART, role: "status", classes: ["statusbar"] }
    ]) {
      const partContainer = this.createPart(id, role, classes);
      mark(`code/willCreatePart/${id}`);
      this.getPart(id).create(partContainer, options);
      mark(`code/didCreatePart/${id}`);
    }
    this.createNotificationsHandlers(instantiationService, notificationService);
    this.parent.appendChild(this.mainContainer);
  }
  createPart(id, role, classes) {
    const part = document.createElement(role === "status" ? "footer" : "div");
    part.classList.add("part", ...classes);
    part.id = id;
    part.setAttribute("role", role);
    if (role === "status") {
      part.setAttribute("aria-live", "off");
    }
    return part;
  }
  createNotificationsHandlers(instantiationService, notificationService) {
    const notificationsCenter = this._register(instantiationService.createInstance(NotificationsCenter, this.mainContainer, notificationService.model));
    const notificationsToasts = this._register(instantiationService.createInstance(NotificationsToasts, this.mainContainer, notificationService.model));
    this._register(instantiationService.createInstance(NotificationsAlerts, notificationService.model));
    const notificationsStatus = instantiationService.createInstance(NotificationsStatus, notificationService.model);
    this._register(notificationsCenter.onDidChangeVisibility(() => {
      notificationsStatus.update(notificationsCenter.isVisible, notificationsToasts.isVisible);
      notificationsToasts.update(notificationsCenter.isVisible);
    }));
    this._register(notificationsToasts.onDidChangeVisibility(() => {
      notificationsStatus.update(notificationsCenter.isVisible, notificationsToasts.isVisible);
    }));
    registerNotificationCommands(notificationsCenter, notificationsToasts, notificationService.model);
    AccessibleViewRegistry.register(new NotificationAccessibleView());
    this.registerNotifications({
      onDidChangeNotificationsVisibility: Event.map(Event.any(notificationsToasts.onDidChangeVisibility, notificationsCenter.onDidChangeVisibility), () => notificationsToasts.isVisible || notificationsCenter.isVisible)
    });
  }
  restore(lifecycleService) {
    try {
      this.restoreParts();
    } catch (error) {
      onUnexpectedError(error);
    }
    this.whenReady.finally(
      () => Promise.race([
        this.whenRestored,
        timeout(2e3)
      ]).finally(() => {
        function markDidStartWorkbench() {
          mark("code/didStartWorkbench");
          performance.measure("perf: workbench create & restore", "code/didLoadWorkbenchMain", "code/didStartWorkbench");
        }
        if (this.isRestored()) {
          markDidStartWorkbench();
        } else {
          this.whenRestored.finally(() => markDidStartWorkbench());
        }
        lifecycleService.phase = LifecyclePhase.Restored;
        const eventuallyPhaseScheduler = this._register(new RunOnceScheduler(() => {
          this._register(runWhenWindowIdle(mainWindow, () => lifecycleService.phase = LifecyclePhase.Eventually, 2500));
        }, 2500));
        eventuallyPhaseScheduler.schedule();
      })
    );
  }
}
export {
  Workbench
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHdvcmtiZW5jaC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9zdHlsZS5qcyc7XG5pbXBvcnQgeyBydW5XaGVuV2luZG93SWRsZSB9IGZyb20gJy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRXZlbnQsIEVtaXR0ZXIsIHNldEdsb2JhbExlYWtXYXJuaW5nVGhyZXNob2xkIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciwgdGltZW91dCB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGlzRmlyZWZveCwgaXNTYWZhcmksIGlzQ2hyb21lIH0gZnJvbSAnLi4vLi4vYmFzZS9icm93c2VyL2Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgbWFyayB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3BlcmZvcm1hbmNlLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yLCBzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGlzV2luZG93cywgaXNMaW51eCwgaXNXZWIsIGlzTmF0aXZlLCBpc01hY2ludG9zaCB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoRXh0ZW5zaW9ucyB9IGZyb20gJy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElFZGl0b3JGYWN0b3J5UmVnaXN0cnksIEVkaXRvckV4dGVuc2lvbnMgfSBmcm9tICcuLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IGdldFNpbmdsZXRvblNlcnZpY2VEZXNjcmlwdG9ycyB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24sIFBhcnRzLCBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgcG9zaXRpb25Ub1N0cmluZyB9IGZyb20gJy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBXaWxsU2F2ZVN0YXRlUmVhc29uLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlLCBJTGlmZWN5Y2xlU2VydmljZSwgV2lsbFNodXRkb3duRXZlbnQgfSBmcm9tICcuLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IE5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlcy9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90aWZpY2F0aW9uc0NlbnRlciB9IGZyb20gJy4vcGFydHMvbm90aWZpY2F0aW9ucy9ub3RpZmljYXRpb25zQ2VudGVyLmpzJztcbmltcG9ydCB7IE5vdGlmaWNhdGlvbnNBbGVydHMgfSBmcm9tICcuL3BhcnRzL25vdGlmaWNhdGlvbnMvbm90aWZpY2F0aW9uc0FsZXJ0cy5qcyc7XG5pbXBvcnQgeyBOb3RpZmljYXRpb25zU3RhdHVzIH0gZnJvbSAnLi9wYXJ0cy9ub3RpZmljYXRpb25zL25vdGlmaWNhdGlvbnNTdGF0dXMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJOb3RpZmljYXRpb25Db21tYW5kcyB9IGZyb20gJy4vcGFydHMvbm90aWZpY2F0aW9ucy9ub3RpZmljYXRpb25zQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgTm90aWZpY2F0aW9uc1RvYXN0cyB9IGZyb20gJy4vcGFydHMvbm90aWZpY2F0aW9ucy9ub3RpZmljYXRpb25zVG9hc3RzLmpzJztcbmltcG9ydCB7IHNldEFSSUFDb250YWluZXIgfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IEZvbnRNZWFzdXJlbWVudHMgfSBmcm9tICcuLi8uLi9lZGl0b3IvYnJvd3Nlci9jb25maWcvZm9udE1lYXN1cmVtZW50cy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVCYXJlRm9udEluZm9Gcm9tUmF3U2V0dGluZ3MgfSBmcm9tICcuLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9mb250SW5mb0Zyb21TZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaENvbnRleHRLZXlzSGFuZGxlciB9IGZyb20gJy4vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBMYXlvdXQgfSBmcm9tICcuL2xheW91dC5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgUGl4ZWxSYXRpbyB9IGZyb20gJy4uLy4uL2Jhc2UvYnJvd3Nlci9waXhlbFJhdGlvLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UsIFdvcmtiZW5jaEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IHNldEhvdmVyRGVsZWdhdGVGYWN0b3J5IH0gZnJvbSAnLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IHNldEJhc2VMYXllckhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZTIuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVByb2dyZXNzU2lnbmFsU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eVNpZ25hbC9icm93c2VyL3Byb2dyZXNzQWNjZXNzaWJpbGl0eVNpZ25hbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBzZXRQcm9ncmVzc0FjY2Vzc2liaWxpdHlTaWduYWxTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvdWkvcHJvZ3Jlc3NiYXIvcHJvZ3Jlc3NBY2Nlc3NpYmlsaXR5U2lnbmFsLmpzJztcbmltcG9ydCB7IEFjY2Vzc2libGVWaWV3UmVnaXN0cnkgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJsZVZpZXdSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBOb3RpZmljYXRpb25BY2Nlc3NpYmxlVmlldyB9IGZyb20gJy4vcGFydHMvbm90aWZpY2F0aW9ucy9ub3RpZmljYXRpb25BY2Nlc3NpYmxlVmlldy5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yTWFya2Rvd25Db2RlQmxvY2tSZW5kZXJlciB9IGZyb20gJy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9tYXJrZG93blJlbmRlcmVyL2Jyb3dzZXIvZWRpdG9yTWFya2Rvd25Db2RlQmxvY2tSZW5kZXJlci5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmtiZW5jaE9wdGlvbnMge1xuXG5cdC8qKlxuXHQgKiBFeHRyYSBjbGFzc2VzIHRvIGJlIGFkZGVkIHRvIHRoZSB3b3JrYmVuY2ggY29udGFpbmVyLlxuXHQgKi9cblx0ZXh0cmFDbGFzc2VzPzogc3RyaW5nW107XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdG8gcmVzZXQgdGhlIHdvcmtiZW5jaCBwYXJ0cyBsYXlvdXQgb24gc3RhcnR1cC5cblx0ICovXG5cdHJlc2V0TGF5b3V0PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIFdvcmtiZW5jaCBleHRlbmRzIExheW91dCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsU2h1dGRvd24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxXaWxsU2h1dGRvd25FdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbFNodXRkb3duID0gdGhpcy5fb25XaWxsU2h1dGRvd24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTaHV0ZG93biA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNodXRkb3duID0gdGhpcy5fb25EaWRTaHV0ZG93bi5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwYXJlbnQ6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczogSVdvcmtiZW5jaE9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzZXJ2aWNlQ29sbGVjdGlvbjogU2VydmljZUNvbGxlY3Rpb24sXG5cdFx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIocGFyZW50LCB7IHJlc2V0TGF5b3V0OiBCb29sZWFuKG9wdGlvbnM/LnJlc2V0TGF5b3V0KSB9KTtcblxuXHRcdC8vIFBlcmY6IG1lYXN1cmUgd29ya2JlbmNoIHN0YXJ0dXAgdGltZVxuXHRcdG1hcmsoJ2NvZGUvd2lsbFN0YXJ0V29ya2JlbmNoJyk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXJyb3JIYW5kbGVyKGxvZ1NlcnZpY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckVycm9ySGFuZGxlcihsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSk6IHZvaWQge1xuXG5cdFx0Ly8gSW5jcmVhc2Ugc3RhY2sgdHJhY2UgbGltaXQgZm9yIGJldHRlciBlcnJvcnMgc3RhY2tzXG5cdFx0aWYgKCFpc0ZpcmVmb3gpIHtcblx0XHRcdEVycm9yLnN0YWNrVHJhY2VMaW1pdCA9IDEwMDtcblx0XHR9XG5cblx0XHQvLyBMaXN0ZW4gb24gdW5oYW5kbGVkIHJlamVjdGlvbiBldmVudHNcblx0XHQvLyBOb3RlOiBpbnRlbnRpb25hbGx5IG5vdCByZWdpc3RlcmVkIGFzIGRpc3Bvc2FibGUgdG8gaGFuZGxlXG5cdFx0Ly8gICAgICAgZXJyb3JzIHRoYXQgY2FuIG9jY3VyIGR1cmluZyBzaHV0ZG93biBwaGFzZS5cblx0XHRtYWluV2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3VuaGFuZGxlZHJlamVjdGlvbicsIChldmVudCkgPT4ge1xuXG5cdFx0XHQvLyBTZWUgaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL1Byb21pc2VSZWplY3Rpb25FdmVudFxuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXZlbnQucmVhc29uKTtcblxuXHRcdFx0Ly8gUHJldmVudCB0aGUgcHJpbnRpbmcgb2YgdGhpcyBldmVudCB0byB0aGUgY29uc29sZVxuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHR9KTtcblxuXHRcdC8vIEluc3RhbGwgaGFuZGxlciBmb3IgdW5leHBlY3RlZCBlcnJvcnNcblx0XHRzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKGVycm9yID0+IHRoaXMuaGFuZGxlVW5leHBlY3RlZEVycm9yKGVycm9yLCBsb2dTZXJ2aWNlKSk7XG5cdH1cblxuXHRwcml2YXRlIHByZXZpb3VzVW5leHBlY3RlZEVycm9yOiB7IG1lc3NhZ2U6IHN0cmluZyB8IHVuZGVmaW5lZDsgdGltZTogbnVtYmVyIH0gPSB7IG1lc3NhZ2U6IHVuZGVmaW5lZCwgdGltZTogMCB9O1xuXHRwcml2YXRlIGhhbmRsZVVuZXhwZWN0ZWRFcnJvcihlcnJvcjogdW5rbm93biwgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UpOiB2b2lkIHtcblx0XHRjb25zdCBtZXNzYWdlID0gdG9FcnJvck1lc3NhZ2UoZXJyb3IsIHRydWUpO1xuXHRcdGlmICghbWVzc2FnZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0aWYgKG1lc3NhZ2UgPT09IHRoaXMucHJldmlvdXNVbmV4cGVjdGVkRXJyb3IubWVzc2FnZSAmJiBub3cgLSB0aGlzLnByZXZpb3VzVW5leHBlY3RlZEVycm9yLnRpbWUgPD0gMTAwMCkge1xuXHRcdFx0cmV0dXJuOyAvLyBSZXR1cm4gaWYgZXJyb3IgbWVzc2FnZSBpZGVudGljYWwgdG8gcHJldmlvdXMgYW5kIHNob3J0ZXIgdGhhbiAxIHNlY29uZFxuXHRcdH1cblxuXHRcdHRoaXMucHJldmlvdXNVbmV4cGVjdGVkRXJyb3IudGltZSA9IG5vdztcblx0XHR0aGlzLnByZXZpb3VzVW5leHBlY3RlZEVycm9yLm1lc3NhZ2UgPSBtZXNzYWdlO1xuXG5cdFx0Ly8gTG9nIGl0XG5cdFx0bG9nU2VydmljZS5lcnJvcihtZXNzYWdlKTtcblx0fVxuXG5cdHN0YXJ0dXAoKTogSUluc3RhbnRpYXRpb25TZXJ2aWNlIHtcblx0XHR0cnkge1xuXG5cdFx0XHQvLyBDb25maWd1cmUgZW1pdHRlciBsZWFrIHdhcm5pbmcgdGhyZXNob2xkXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihzZXRHbG9iYWxMZWFrV2FybmluZ1RocmVzaG9sZCgxNzUpKTtcblxuXHRcdFx0Ly8gU2VydmljZXNcblx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5pbml0U2VydmljZXModGhpcy5zZXJ2aWNlQ29sbGVjdGlvbik7XG5cblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHtcblx0XHRcdFx0Y29uc3QgbGlmZWN5Y2xlU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGlmZWN5Y2xlU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElIb3N0U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGhvdmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJSG92ZXJTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpIGFzIE5vdGlmaWNhdGlvblNlcnZpY2U7XG5cdFx0XHRcdGNvbnN0IG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElNYXJrZG93blJlbmRlcmVyU2VydmljZSk7XG5cblx0XHRcdFx0Ly8gU2V0IGNvZGUgYmxvY2sgcmVuZGVyZXIgZm9yIG1hcmtkb3duIHJlbmRlcmluZ1xuXHRcdFx0XHRtYXJrZG93blJlbmRlcmVyU2VydmljZS5zZXREZWZhdWx0Q29kZUJsb2NrUmVuZGVyZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdG9yTWFya2Rvd25Db2RlQmxvY2tSZW5kZXJlcikpO1xuXG5cdFx0XHRcdC8vIERlZmF1bHQgSG92ZXIgRGVsZWdhdGUgbXVzdCBiZSByZWdpc3RlcmVkIGJlZm9yZSBjcmVhdGluZyBhbnkgd29ya2JlbmNoL2xheW91dCBjb21wb25lbnRzXG5cdFx0XHRcdC8vIGFzIHRoZXNlIHBvc3NpYmx5IHdpbGwgdXNlIHRoZSBkZWZhdWx0IGhvdmVyIGRlbGVnYXRlXG5cdFx0XHRcdHNldEhvdmVyRGVsZWdhdGVGYWN0b3J5KChwbGFjZW1lbnQsIGVuYWJsZUluc3RhbnRIb3ZlcikgPT4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoSG92ZXJEZWxlZ2F0ZSwgcGxhY2VtZW50LCB7IGluc3RhbnRIb3ZlcjogZW5hYmxlSW5zdGFudEhvdmVyIH0sIHt9KSk7XG5cdFx0XHRcdHNldEJhc2VMYXllckhvdmVyRGVsZWdhdGUoaG92ZXJTZXJ2aWNlKTtcblxuXHRcdFx0XHQvLyBMYXlvdXRcblx0XHRcdFx0dGhpcy5pbml0TGF5b3V0KGFjY2Vzc29yKTtcblxuXHRcdFx0XHQvLyBSZWdpc3RyaWVzXG5cdFx0XHRcdFJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKS5zdGFydChhY2Nlc3Nvcik7XG5cdFx0XHRcdFJlZ2lzdHJ5LmFzPElFZGl0b3JGYWN0b3J5UmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yRmFjdG9yeSkuc3RhcnQoYWNjZXNzb3IpO1xuXG5cdFx0XHRcdC8vIENvbnRleHQgS2V5c1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hDb250ZXh0S2V5c0hhbmRsZXIpKTtcblxuXHRcdFx0XHQvLyBSZWdpc3RlciBMaXN0ZW5lcnNcblx0XHRcdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycyhsaWZlY3ljbGVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGhvc3RTZXJ2aWNlLCBkaWFsb2dTZXJ2aWNlKTtcblxuXHRcdFx0XHQvLyBSZW5kZXIgV29ya2JlbmNoXG5cdFx0XHRcdHRoaXMucmVuZGVyV29ya2JlbmNoKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0XHRcdC8vIFdvcmtiZW5jaCBMYXlvdXRcblx0XHRcdFx0dGhpcy5jcmVhdGVXb3JrYmVuY2hMYXlvdXQoKTtcblxuXHRcdFx0XHQvLyBMYXlvdXRcblx0XHRcdFx0dGhpcy5sYXlvdXQoKTtcblxuXHRcdFx0XHQvLyBSZXN0b3JlXG5cdFx0XHRcdHRoaXMucmVzdG9yZShsaWZlY3ljbGVTZXJ2aWNlKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycm9yKTtcblxuXHRcdFx0dGhyb3cgZXJyb3I7IC8vIHJldGhyb3cgYmVjYXVzZSB0aGlzIGlzIGEgY3JpdGljYWwgaXNzdWUgd2UgY2Fubm90IGhhbmRsZSBwcm9wZXJseSBoZXJlXG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBpbml0U2VydmljZXMoc2VydmljZUNvbGxlY3Rpb246IFNlcnZpY2VDb2xsZWN0aW9uKTogSUluc3RhbnRpYXRpb25TZXJ2aWNlIHtcblxuXHRcdC8vIExheW91dCBTZXJ2aWNlXG5cdFx0c2VydmljZUNvbGxlY3Rpb24uc2V0KElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCB0aGlzKTtcblxuXHRcdC8vICEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISFcblx0XHQvL1xuXHRcdC8vIE5PVEU6IFBsZWFzZSBkbyBOT1QgcmVnaXN0ZXIgc2VydmljZXMgaGVyZS4gVXNlIGByZWdpc3RlclNpbmdsZXRvbigpYFxuXHRcdC8vICAgICAgIGZyb20gYHdvcmtiZW5jaC5jb21tb24ubWFpbi50c2AgaWYgdGhlIHNlcnZpY2UgaXMgc2hhcmVkIGJldHdlZW5cblx0XHQvLyAgICAgICBkZXNrdG9wIGFuZCB3ZWIgb3IgYHdvcmtiZW5jaC5kZXNrdG9wLm1haW4udHNgIGlmIHRoZSBzZXJ2aWNlXG5cdFx0Ly8gICAgICAgaXMgZGVza3RvcCBvbmx5LlxuXHRcdC8vXG5cdFx0Ly8gISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhIVxuXG5cdFx0Ly8gQWxsIENvbnRyaWJ1dGVkIFNlcnZpY2VzXG5cdFx0Y29uc3QgY29udHJpYnV0ZWRTZXJ2aWNlcyA9IGdldFNpbmdsZXRvblNlcnZpY2VEZXNjcmlwdG9ycygpO1xuXHRcdGZvciAoY29uc3QgW2lkLCBkZXNjcmlwdG9yXSBvZiBjb250cmlidXRlZFNlcnZpY2VzKSB7XG5cdFx0XHRzZXJ2aWNlQ29sbGVjdGlvbi5zZXQoaWQsIGRlc2NyaXB0b3IpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gbmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKHNlcnZpY2VDb2xsZWN0aW9uLCB0cnVlKTtcblxuXHRcdC8vIFdyYXAgdXBcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cdFx0XHRjb25zdCBsaWZlY3ljbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMaWZlY3ljbGVTZXJ2aWNlKTtcblxuXHRcdFx0Ly8gVE9ET0BTYW5kZWVwIGRlYnQgYXJvdW5kIGN5Y2xpYyBkZXBlbmRlbmNpZXNcblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRpZiAoY29uZmlndXJhdGlvblNlcnZpY2UgJiYgJ2FjcXVpcmVJbnN0YW50aWF0aW9uU2VydmljZScgaW4gY29uZmlndXJhdGlvblNlcnZpY2UpIHtcblx0XHRcdFx0KGNvbmZpZ3VyYXRpb25TZXJ2aWNlIGFzIHsgYWNxdWlyZUluc3RhbnRpYXRpb25TZXJ2aWNlOiAoaW5zdGFudGlhdGlvblNlcnZpY2U6IHVua25vd24pID0+IHZvaWQgfSkuYWNxdWlyZUluc3RhbnRpYXRpb25TZXJ2aWNlKGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2lnbmFsIHRvIGxpZmVjeWNsZSB0aGF0IHNlcnZpY2VzIGFyZSBzZXRcblx0XHRcdGxpZmVjeWNsZVNlcnZpY2UucGhhc2UgPSBMaWZlY3ljbGVQaGFzZS5SZWFkeTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMobGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsIGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsIGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlKTogdm9pZCB7XG5cblx0XHQvLyBDb25maWd1cmF0aW9uIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3Rlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB0aGlzLnVwZGF0ZUZvbnRBbGlhc2luZyhlLCBjb25maWd1cmF0aW9uU2VydmljZSkpKTtcblxuXHRcdC8vIEZvbnQgSW5mb1xuXHRcdGlmIChpc05hdGl2ZSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoc3RvcmFnZVNlcnZpY2Uub25XaWxsU2F2ZVN0YXRlKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5yZWFzb24gPT09IFdpbGxTYXZlU3RhdGVSZWFzb24uU0hVVERPV04pIHtcblx0XHRcdFx0XHR0aGlzLnN0b3JlRm9udEluZm8oc3RvcmFnZVNlcnZpY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGxpZmVjeWNsZVNlcnZpY2Uub25XaWxsU2h1dGRvd24oKCkgPT4gdGhpcy5zdG9yZUZvbnRJbmZvKHN0b3JhZ2VTZXJ2aWNlKSkpO1xuXHRcdH1cblxuXHRcdC8vIExpZmVjeWNsZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKGxpZmVjeWNsZVNlcnZpY2Uub25XaWxsU2h1dGRvd24oZXZlbnQgPT4gdGhpcy5fb25XaWxsU2h1dGRvd24uZmlyZShldmVudCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihsaWZlY3ljbGVTZXJ2aWNlLm9uRGlkU2h1dGRvd24oKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRTaHV0ZG93bi5maXJlKCk7XG5cdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBJbiBzb21lIGVudmlyb25tZW50cyB3ZSBkbyBub3QgZ2V0IGVub3VnaCB0aW1lIHRvIHBlcnNpc3Qgc3RhdGUgb24gc2h1dGRvd24uXG5cdFx0Ly8gSW4gb3RoZXIgY2FzZXMsIFZTQ29kZSBtaWdodCBjcmFzaCwgc28gd2UgcGVyaW9kaWNhbGx5IHNhdmUgc3RhdGUgdG8gcmVkdWNlXG5cdFx0Ly8gdGhlIGNoYW5jZSBvZiBsb29zaW5nIGFueSBzdGF0ZS5cblx0XHQvLyBUaGUgd2luZG93IGxvb3NpbmcgZm9jdXMgaXMgYSBnb29kIGluZGljYXRpb24gdGhhdCB0aGUgdXNlciBoYXMgc3RvcHBlZCB3b3JraW5nXG5cdFx0Ly8gaW4gdGhhdCB3aW5kb3cgc28gd2UgcGljayB0aGF0IGF0IGEgdGltZSB0byBjb2xsZWN0IHN0YXRlLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGhvc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9jdXMoZm9jdXMgPT4ge1xuXHRcdFx0aWYgKCFmb2N1cykge1xuXHRcdFx0XHRzdG9yYWdlU2VydmljZS5mbHVzaCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIERpYWxvZ3Mgc2hvd2luZy9oaWRpbmdcblx0XHR0aGlzLl9yZWdpc3RlcihkaWFsb2dTZXJ2aWNlLm9uV2lsbFNob3dEaWFsb2coKCkgPT4gdGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ21vZGFsLWRpYWxvZy12aXNpYmxlJykpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihkaWFsb2dTZXJ2aWNlLm9uRGlkU2hvd0RpYWxvZygoKSA9PiB0aGlzLm1haW5Db250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnbW9kYWwtZGlhbG9nLXZpc2libGUnKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBmb250QWxpYXNpbmc6ICdkZWZhdWx0JyB8ICdhbnRpYWxpYXNlZCcgfCAnbm9uZScgfCAnYXV0bycgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdXBkYXRlRm9udEFsaWFzaW5nKGU6IElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQgfCB1bmRlZmluZWQsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpIHtcblx0XHRpZiAoIWlzTWFjaW50b3NoKSB7XG5cdFx0XHRyZXR1cm47IC8vIG1hY09TIG9ubHlcblx0XHR9XG5cblx0XHRpZiAoZSAmJiAhZS5hZmZlY3RzQ29uZmlndXJhdGlvbignd29ya2JlbmNoLmZvbnRBbGlhc2luZycpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWxpYXNpbmcgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnZGVmYXVsdCcgfCAnYW50aWFsaWFzZWQnIHwgJ25vbmUnIHwgJ2F1dG8nPignd29ya2JlbmNoLmZvbnRBbGlhc2luZycpO1xuXHRcdGlmICh0aGlzLmZvbnRBbGlhc2luZyA9PT0gYWxpYXNpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmZvbnRBbGlhc2luZyA9IGFsaWFzaW5nO1xuXG5cdFx0Ly8gUmVtb3ZlIGFsbFxuXHRcdGNvbnN0IGZvbnRBbGlhc2luZ1ZhbHVlczogKHR5cGVvZiBhbGlhc2luZylbXSA9IFsnYW50aWFsaWFzZWQnLCAnbm9uZScsICdhdXRvJ107XG5cdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoLi4uZm9udEFsaWFzaW5nVmFsdWVzLm1hcCh2YWx1ZSA9PiBgbW9uYWNvLWZvbnQtYWxpYXNpbmctJHt2YWx1ZX1gKSk7XG5cblx0XHQvLyBBZGQgc3BlY2lmaWNcblx0XHRpZiAoZm9udEFsaWFzaW5nVmFsdWVzLnNvbWUob3B0aW9uID0+IG9wdGlvbiA9PT0gYWxpYXNpbmcpKSB7XG5cdFx0XHR0aGlzLm1haW5Db250YWluZXIuY2xhc3NMaXN0LmFkZChgbW9uYWNvLWZvbnQtYWxpYXNpbmctJHthbGlhc2luZ31gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlc3RvcmVGb250SW5mbyhzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RvcmVkRm9udEluZm9SYXcgPSBzdG9yYWdlU2VydmljZS5nZXQoJ2VkaXRvckZvbnRJbmZvJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRpZiAoc3RvcmVkRm9udEluZm9SYXcpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHN0b3JlZEZvbnRJbmZvID0gSlNPTi5wYXJzZShzdG9yZWRGb250SW5mb1Jhdyk7XG5cdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KHN0b3JlZEZvbnRJbmZvKSkge1xuXHRcdFx0XHRcdEZvbnRNZWFzdXJlbWVudHMucmVzdG9yZUZvbnRJbmZvKG1haW5XaW5kb3csIHN0b3JlZEZvbnRJbmZvKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdC8qIGlnbm9yZSAqL1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdEZvbnRNZWFzdXJlbWVudHMucmVhZEZvbnRJbmZvKG1haW5XaW5kb3csIGNyZWF0ZUJhcmVGb250SW5mb0Zyb21SYXdTZXR0aW5ncyhjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZWRpdG9yJyksIFBpeGVsUmF0aW8uZ2V0SW5zdGFuY2UobWFpbldpbmRvdykudmFsdWUpKTtcblx0fVxuXG5cdHByaXZhdGUgc3RvcmVGb250SW5mbyhzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VyaWFsaXplZEZvbnRJbmZvID0gRm9udE1lYXN1cmVtZW50cy5zZXJpYWxpemVGb250SW5mbyhtYWluV2luZG93KTtcblx0XHRpZiAoc2VyaWFsaXplZEZvbnRJbmZvKSB7XG5cdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnZWRpdG9yRm9udEluZm8nLCBKU09OLnN0cmluZ2lmeShzZXJpYWxpemVkRm9udEluZm8pLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJXb3JrYmVuY2goaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZTogTm90aWZpY2F0aW9uU2VydmljZSwgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSk6IHZvaWQge1xuXG5cdFx0Ly8gQVJJQSAmIFNpZ25hbHNcblx0XHRzZXRBUklBQ29udGFpbmVyKHRoaXMubWFpbkNvbnRhaW5lcik7XG5cdFx0c2V0UHJvZ3Jlc3NBY2Nlc3NpYmlsaXR5U2lnbmFsU2NoZWR1bGVyKChtc0RlbGF5VGltZTogbnVtYmVyLCBtc0xvb3BUaW1lPzogbnVtYmVyKSA9PiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBY2Nlc3NpYmlsaXR5UHJvZ3Jlc3NTaWduYWxTY2hlZHVsZXIsIG1zRGVsYXlUaW1lLCBtc0xvb3BUaW1lKSk7XG5cblx0XHQvLyBTdGF0ZSBzcGVjaWZpYyBjbGFzc2VzXG5cdFx0Y29uc3QgcGxhdGZvcm1DbGFzcyA9IGlzV2luZG93cyA/ICd3aW5kb3dzJyA6IGlzTGludXggPyAnbGludXgnIDogJ21hYyc7XG5cdFx0Y29uc3Qgd29ya2JlbmNoQ2xhc3NlcyA9IGNvYWxlc2NlKFtcblx0XHRcdCdtb25hY28td29ya2JlbmNoJyxcblx0XHRcdHBsYXRmb3JtQ2xhc3MsXG5cdFx0XHRpc1dlYiA/ICd3ZWInIDogdW5kZWZpbmVkLFxuXHRcdFx0aXNDaHJvbWUgPyAnY2hyb21pdW0nIDogaXNGaXJlZm94ID8gJ2ZpcmVmb3gnIDogaXNTYWZhcmkgPyAnc2FmYXJpJyA6IHVuZGVmaW5lZCxcblx0XHRcdC4uLnRoaXMuZ2V0TGF5b3V0Q2xhc3NlcygpLFxuXHRcdFx0Li4uKHRoaXMub3B0aW9ucz8uZXh0cmFDbGFzc2VzID8gdGhpcy5vcHRpb25zLmV4dHJhQ2xhc3NlcyA6IFtdKVxuXHRcdF0pO1xuXG5cdFx0dGhpcy5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoLi4ud29ya2JlbmNoQ2xhc3Nlcyk7XG5cblx0XHQvLyBBcHBseSBmb250IGFsaWFzaW5nXG5cdFx0dGhpcy51cGRhdGVGb250QWxpYXNpbmcodW5kZWZpbmVkLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHQvLyBXYXJtIHVwIGZvbnQgY2FjaGUgaW5mb3JtYXRpb24gYmVmb3JlIGJ1aWxkaW5nIHVwIHRvbyBtYW55IGRvbSBlbGVtZW50c1xuXHRcdHRoaXMucmVzdG9yZUZvbnRJbmZvKHN0b3JhZ2VTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHQvLyBDcmVhdGUgUGFydHNcblx0XHRmb3IgKGNvbnN0IHsgaWQsIHJvbGUsIGNsYXNzZXMsIG9wdGlvbnMgfSBvZiBbXG5cdFx0XHR7IGlkOiBQYXJ0cy5USVRMRUJBUl9QQVJULCByb2xlOiAnbm9uZScsIGNsYXNzZXM6IFsndGl0bGViYXInXSB9LFxuXHRcdFx0eyBpZDogUGFydHMuQkFOTkVSX1BBUlQsIHJvbGU6ICdiYW5uZXInLCBjbGFzc2VzOiBbJ2Jhbm5lciddIH0sXG5cdFx0XHR7IGlkOiBQYXJ0cy5BQ1RJVklUWUJBUl9QQVJULCByb2xlOiAnbm9uZScsIGNsYXNzZXM6IFsnYWN0aXZpdHliYXInLCB0aGlzLmdldFNpZGVCYXJQb3NpdGlvbigpID09PSBQb3NpdGlvbi5MRUZUID8gJ2xlZnQnIDogJ3JpZ2h0J10gfSwgLy8gVXNlIHJvbGUgJ25vbmUnIGZvciBzb21lIHBhcnRzIHRvIG1ha2Ugc2NyZWVuIHJlYWRlcnMgbGVzcyBjaGF0dHkgIzExNDg5MlxuXHRcdFx0eyBpZDogUGFydHMuU0lERUJBUl9QQVJULCByb2xlOiAnbm9uZScsIGNsYXNzZXM6IFsnc2lkZWJhcicsIHRoaXMuZ2V0U2lkZUJhclBvc2l0aW9uKCkgPT09IFBvc2l0aW9uLkxFRlQgPyAnbGVmdCcgOiAncmlnaHQnXSB9LFxuXHRcdFx0eyBpZDogUGFydHMuRURJVE9SX1BBUlQsIHJvbGU6ICdtYWluJywgY2xhc3NlczogWydlZGl0b3InXSwgb3B0aW9uczogeyByZXN0b3JlUHJldmlvdXNTdGF0ZTogdGhpcy53aWxsUmVzdG9yZUVkaXRvcnMoKSB9IH0sXG5cdFx0XHR7IGlkOiBQYXJ0cy5QQU5FTF9QQVJULCByb2xlOiAnbm9uZScsIGNsYXNzZXM6IFsncGFuZWwnLCAnYmFzZXBhbmVsJywgcG9zaXRpb25Ub1N0cmluZyh0aGlzLmdldFBhbmVsUG9zaXRpb24oKSldIH0sXG5cdFx0XHR7IGlkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgcm9sZTogJ25vbmUnLCBjbGFzc2VzOiBbJ2F1eGlsaWFyeWJhcicsICdiYXNlcGFuZWwnLCB0aGlzLmdldFNpZGVCYXJQb3NpdGlvbigpID09PSBQb3NpdGlvbi5MRUZUID8gJ3JpZ2h0JyA6ICdsZWZ0J10gfSxcblx0XHRcdHsgaWQ6IFBhcnRzLlNUQVRVU0JBUl9QQVJULCByb2xlOiAnc3RhdHVzJywgY2xhc3NlczogWydzdGF0dXNiYXInXSB9XG5cdFx0XSkge1xuXHRcdFx0Y29uc3QgcGFydENvbnRhaW5lciA9IHRoaXMuY3JlYXRlUGFydChpZCwgcm9sZSwgY2xhc3Nlcyk7XG5cblx0XHRcdG1hcmsoYGNvZGUvd2lsbENyZWF0ZVBhcnQvJHtpZH1gKTtcblx0XHRcdHRoaXMuZ2V0UGFydChpZCkuY3JlYXRlKHBhcnRDb250YWluZXIsIG9wdGlvbnMpO1xuXHRcdFx0bWFyayhgY29kZS9kaWRDcmVhdGVQYXJ0LyR7aWR9YCk7XG5cdFx0fVxuXG5cdFx0Ly8gTm90aWZpY2F0aW9uIEhhbmRsZXJzXG5cdFx0dGhpcy5jcmVhdGVOb3RpZmljYXRpb25zSGFuZGxlcnMoaW5zdGFudGlhdGlvblNlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXG5cdFx0Ly8gQWRkIFdvcmtiZW5jaCB0byBET01cblx0XHR0aGlzLnBhcmVudC5hcHBlbmRDaGlsZCh0aGlzLm1haW5Db250YWluZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVQYXJ0KGlkOiBzdHJpbmcsIHJvbGU6IHN0cmluZywgY2xhc3Nlczogc3RyaW5nW10pOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgcGFydCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQocm9sZSA9PT0gJ3N0YXR1cycgPyAnZm9vdGVyJyAvKiBVc2UgZm9vdGVyIGVsZW1lbnQgZm9yIHN0YXR1cyBiYXIgIzk4Mzc2ICovIDogJ2RpdicpO1xuXHRcdHBhcnQuY2xhc3NMaXN0LmFkZCgncGFydCcsIC4uLmNsYXNzZXMpO1xuXHRcdHBhcnQuaWQgPSBpZDtcblx0XHRwYXJ0LnNldEF0dHJpYnV0ZSgncm9sZScsIHJvbGUpO1xuXHRcdGlmIChyb2xlID09PSAnc3RhdHVzJykge1xuXHRcdFx0cGFydC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGl2ZScsICdvZmYnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcGFydDtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlTm90aWZpY2F0aW9uc0hhbmRsZXJzKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2U6IE5vdGlmaWNhdGlvblNlcnZpY2UpOiB2b2lkIHtcblxuXHRcdC8vIEluc3RhbnRpYXRlIE5vdGlmaWNhdGlvbiBjb21wb25lbnRzXG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uc0NlbnRlciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGlmaWNhdGlvbnNDZW50ZXIsIHRoaXMubWFpbkNvbnRhaW5lciwgbm90aWZpY2F0aW9uU2VydmljZS5tb2RlbCkpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbnNUb2FzdHMgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RpZmljYXRpb25zVG9hc3RzLCB0aGlzLm1haW5Db250YWluZXIsIG5vdGlmaWNhdGlvblNlcnZpY2UubW9kZWwpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RpZmljYXRpb25zQWxlcnRzLCBub3RpZmljYXRpb25TZXJ2aWNlLm1vZGVsKSk7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uc1N0YXR1cyA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGlmaWNhdGlvbnNTdGF0dXMsIG5vdGlmaWNhdGlvblNlcnZpY2UubW9kZWwpO1xuXG5cdFx0Ly8gVmlzaWJpbGl0eVxuXHRcdHRoaXMuX3JlZ2lzdGVyKG5vdGlmaWNhdGlvbnNDZW50ZXIub25EaWRDaGFuZ2VWaXNpYmlsaXR5KCgpID0+IHtcblx0XHRcdG5vdGlmaWNhdGlvbnNTdGF0dXMudXBkYXRlKG5vdGlmaWNhdGlvbnNDZW50ZXIuaXNWaXNpYmxlLCBub3RpZmljYXRpb25zVG9hc3RzLmlzVmlzaWJsZSk7XG5cdFx0XHRub3RpZmljYXRpb25zVG9hc3RzLnVwZGF0ZShub3RpZmljYXRpb25zQ2VudGVyLmlzVmlzaWJsZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIobm90aWZpY2F0aW9uc1RvYXN0cy5vbkRpZENoYW5nZVZpc2liaWxpdHkoKCkgPT4ge1xuXHRcdFx0bm90aWZpY2F0aW9uc1N0YXR1cy51cGRhdGUobm90aWZpY2F0aW9uc0NlbnRlci5pc1Zpc2libGUsIG5vdGlmaWNhdGlvbnNUb2FzdHMuaXNWaXNpYmxlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZWdpc3RlciBDb21tYW5kc1xuXHRcdHJlZ2lzdGVyTm90aWZpY2F0aW9uQ29tbWFuZHMobm90aWZpY2F0aW9uc0NlbnRlciwgbm90aWZpY2F0aW9uc1RvYXN0cywgbm90aWZpY2F0aW9uU2VydmljZS5tb2RlbCk7XG5cblx0XHQvLyBSZWdpc3RlciBub3RpZmljYXRpb24gYWNjZXNzaWJsZSB2aWV3XG5cdFx0QWNjZXNzaWJsZVZpZXdSZWdpc3RyeS5yZWdpc3RlcihuZXcgTm90aWZpY2F0aW9uQWNjZXNzaWJsZVZpZXcoKSk7XG5cblx0XHQvLyBSZWdpc3RlciB3aXRoIExheW91dFxuXHRcdHRoaXMucmVnaXN0ZXJOb3RpZmljYXRpb25zKHtcblx0XHRcdG9uRGlkQ2hhbmdlTm90aWZpY2F0aW9uc1Zpc2liaWxpdHk6IEV2ZW50Lm1hcChFdmVudC5hbnkobm90aWZpY2F0aW9uc1RvYXN0cy5vbkRpZENoYW5nZVZpc2liaWxpdHksIG5vdGlmaWNhdGlvbnNDZW50ZXIub25EaWRDaGFuZ2VWaXNpYmlsaXR5KSwgKCkgPT4gbm90aWZpY2F0aW9uc1RvYXN0cy5pc1Zpc2libGUgfHwgbm90aWZpY2F0aW9uc0NlbnRlci5pc1Zpc2libGUpXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlc3RvcmUobGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UpOiB2b2lkIHtcblxuXHRcdC8vIEFzayBlYWNoIHBhcnQgdG8gcmVzdG9yZVxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLnJlc3RvcmVQYXJ0cygpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnJvcik7XG5cdFx0fVxuXG5cdFx0Ly8gVHJhbnNpdGlvbiBpbnRvIHJlc3RvcmVkIHBoYXNlIGFmdGVyIGxheW91dCBoYXMgcmVzdG9yZWRcblx0XHQvLyBidXQgZG8gbm90IHdhaXQgaW5kZWZpbml0ZWx5IG9uIHRoaXMgdG8gYWNjb3VudCBmb3Igc2xvd1xuXHRcdC8vIGVkaXRvcnMgcmVzdG9yaW5nLiBTaW5jZSB0aGUgd29ya2JlbmNoIGlzIGZ1bGx5IGZ1bmN0aW9uYWxcblx0XHQvLyBldmVuIHdoZW4gdGhlIHZpc2libGUgZWRpdG9ycyBoYXZlIG5vdCByZXNvbHZlZCwgd2Ugc3RpbGxcblx0XHQvLyB3YW50IGNvbnRyaWJ1dGlvbnMgb24gdGhlIGBSZXN0b3JlZGAgcGhhc2UgdG8gd29yayBiZWZvcmVcblx0XHQvLyBzbG93IGVkaXRvcnMgaGF2ZSByZXNvbHZlZC4gQnV0IHdlIGFsc28gZG8gbm90IHdhbnQgZmFzdFxuXHRcdC8vIGVkaXRvcnMgdG8gcmVzb2x2ZSBzbG93IHdoZW4gdG9vIG1hbnkgY29udHJpYnV0aW9ucyBnZXRcblx0XHQvLyBpbnN0YW50aWF0ZWQsIHNvIHdlIGZpbmQgYSBtaWRkbGUgZ3JvdW5kIHNvbHV0aW9uIHZpYVxuXHRcdC8vIGBQcm9taXNlLnJhY2VgXG5cdFx0dGhpcy53aGVuUmVhZHkuZmluYWxseSgoKSA9PlxuXHRcdFx0UHJvbWlzZS5yYWNlKFtcblx0XHRcdFx0dGhpcy53aGVuUmVzdG9yZWQsXG5cdFx0XHRcdHRpbWVvdXQoMjAwMClcblx0XHRcdF0pLmZpbmFsbHkoKCkgPT4ge1xuXG5cdFx0XHRcdC8vIFVwZGF0ZSBwZXJmIG1hcmtzIG9ubHkgd2hlbiB0aGUgbGF5b3V0IGlzIGZ1bGx5XG5cdFx0XHRcdC8vIHJlc3RvcmVkLiBXZSB3YW50IHRoZSB0aW1lIGl0IHRha2VzIHRvIHJlc3RvcmVcblx0XHRcdFx0Ly8gZWRpdG9ycyB0byBiZSBpbmNsdWRlZCBpbiB0aGVzZSBudW1iZXJzXG5cblx0XHRcdFx0ZnVuY3Rpb24gbWFya0RpZFN0YXJ0V29ya2JlbmNoKCkge1xuXHRcdFx0XHRcdG1hcmsoJ2NvZGUvZGlkU3RhcnRXb3JrYmVuY2gnKTtcblx0XHRcdFx0XHRwZXJmb3JtYW5jZS5tZWFzdXJlKCdwZXJmOiB3b3JrYmVuY2ggY3JlYXRlICYgcmVzdG9yZScsICdjb2RlL2RpZExvYWRXb3JrYmVuY2hNYWluJywgJ2NvZGUvZGlkU3RhcnRXb3JrYmVuY2gnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0aGlzLmlzUmVzdG9yZWQoKSkge1xuXHRcdFx0XHRcdG1hcmtEaWRTdGFydFdvcmtiZW5jaCgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMud2hlblJlc3RvcmVkLmZpbmFsbHkoKCkgPT4gbWFya0RpZFN0YXJ0V29ya2JlbmNoKCkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gU2V0IGxpZmVjeWNsZSBwaGFzZSB0byBgUmVzdG9yZWRgXG5cdFx0XHRcdGxpZmVjeWNsZVNlcnZpY2UucGhhc2UgPSBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZDtcblxuXHRcdFx0XHQvLyBTZXQgbGlmZWN5Y2xlIHBoYXNlIHRvIGBFdmVudHVhbGx5YCBhZnRlciBhIHNob3J0IGRlbGF5IGFuZCB3aGVuIGlkbGUgKG1pbiAyLjVzZWMsIG1heCA1c2VjKVxuXHRcdFx0XHRjb25zdCBldmVudHVhbGx5UGhhc2VTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIocnVuV2hlbldpbmRvd0lkbGUobWFpbldpbmRvdywgKCkgPT4gbGlmZWN5Y2xlU2VydmljZS5waGFzZSA9IExpZmVjeWNsZVBoYXNlLkV2ZW50dWFsbHksIDI1MDApKTtcblx0XHRcdFx0fSwgMjUwMCkpO1xuXHRcdFx0XHRldmVudHVhbGx5UGhhc2VTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdH0pXG5cdFx0KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTztBQUNQLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsT0FBTyxTQUFTLHFDQUFxQztBQUM5RCxTQUFTLGtCQUFrQixlQUFlO0FBQzFDLFNBQVMsV0FBVyxVQUFVLGdCQUFnQjtBQUM5QyxTQUFTLFlBQVk7QUFDckIsU0FBUyxtQkFBbUIsaUNBQWlDO0FBQzdELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsV0FBVyxTQUFTLE9BQU8sVUFBVSxtQkFBbUI7QUFDakUsU0FBMEMsY0FBYywyQkFBMkI7QUFDbkYsU0FBaUMsd0JBQXdCO0FBQ3pELFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsVUFBVSxPQUFPLHlCQUF5Qix3QkFBd0I7QUFDM0UsU0FBUyxpQkFBaUIscUJBQXFCLGNBQWMscUJBQXFCO0FBQ2xGLFNBQW9DLDZCQUE2QjtBQUdqRSxTQUFTLGdCQUFnQix5QkFBNEM7QUFDckUsU0FBUyw0QkFBNEI7QUFFckMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx5Q0FBeUM7QUFFbEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBZSw4QkFBOEI7QUFDdEQsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyw0Q0FBNEM7QUFDckQsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx1Q0FBdUM7QUFlekMsTUFBTSxrQkFBa0IsT0FBTztBQUFBLEVBUXJDLFlBQ0MsUUFDaUIsU0FDQSxtQkFDakIsWUFDQztBQUNELFVBQU0sUUFBUSxFQUFFLGFBQWEsUUFBUSxTQUFTLFdBQVcsRUFBRSxDQUFDO0FBSjNDO0FBQ0E7QUFUbEIsU0FBaUIsa0JBQWtCLEtBQUssVUFBVSxJQUFJLFFBQTJCLENBQUM7QUFDbEYsU0FBUyxpQkFBaUIsS0FBSyxnQkFBZ0I7QUFFL0MsU0FBaUIsaUJBQWlCLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUNwRSxTQUFTLGdCQUFnQixLQUFLLGVBQWU7QUF1QzdDLFNBQVEsMEJBQXlFLEVBQUUsU0FBUyxRQUFXLE1BQU0sRUFBRTtBQTVCOUcsU0FBSyx5QkFBeUI7QUFFOUIsU0FBSyxxQkFBcUIsVUFBVTtBQUFBLEVBQ3JDO0FBQUEsRUFFUSxxQkFBcUIsWUFBK0I7QUFHM0QsUUFBSSxDQUFDLFdBQVc7QUFDZixZQUFNLGtCQUFrQjtBQUFBLElBQ3pCO0FBS0EsZUFBVyxpQkFBaUIsc0JBQXNCLENBQUMsVUFBVTtBQUc1RCx3QkFBa0IsTUFBTSxNQUFNO0FBRzlCLFlBQU0sZUFBZTtBQUFBLElBQ3RCLENBQUM7QUFHRCw4QkFBMEIsV0FBUyxLQUFLLHNCQUFzQixPQUFPLFVBQVUsQ0FBQztBQUFBLEVBQ2pGO0FBQUEsRUFHUSxzQkFBc0IsT0FBZ0IsWUFBK0I7QUFDNUUsVUFBTSxVQUFVLGVBQWUsT0FBTyxJQUFJO0FBQzFDLFFBQUksQ0FBQyxTQUFTO0FBQ2I7QUFBQSxJQUNEO0FBRUEsVUFBTSxNQUFNLEtBQUssSUFBSTtBQUNyQixRQUFJLFlBQVksS0FBSyx3QkFBd0IsV0FBVyxNQUFNLEtBQUssd0JBQXdCLFFBQVEsS0FBTTtBQUN4RztBQUFBLElBQ0Q7QUFFQSxTQUFLLHdCQUF3QixPQUFPO0FBQ3BDLFNBQUssd0JBQXdCLFVBQVU7QUFHdkMsZUFBVyxNQUFNLE9BQU87QUFBQSxFQUN6QjtBQUFBLEVBRUEsVUFBaUM7QUFDaEMsUUFBSTtBQUdILFdBQUssVUFBVSw4QkFBOEIsR0FBRyxDQUFDO0FBR2pELFlBQU0sdUJBQXVCLEtBQUssYUFBYSxLQUFLLGlCQUFpQjtBQUVyRSwyQkFBcUIsZUFBZSxjQUFZO0FBQy9DLGNBQU0sbUJBQW1CLFNBQVMsSUFBSSxpQkFBaUI7QUFDdkQsY0FBTSxpQkFBaUIsU0FBUyxJQUFJLGVBQWU7QUFDbkQsY0FBTSx1QkFBdUIsU0FBUyxJQUFJLHFCQUFxQjtBQUMvRCxjQUFNLGNBQWMsU0FBUyxJQUFJLFlBQVk7QUFDN0MsY0FBTSxlQUFlLFNBQVMsSUFBSSxhQUFhO0FBQy9DLGNBQU0sZ0JBQWdCLFNBQVMsSUFBSSxjQUFjO0FBQ2pELGNBQU0sc0JBQXNCLFNBQVMsSUFBSSxvQkFBb0I7QUFDN0QsY0FBTSwwQkFBMEIsU0FBUyxJQUFJLHdCQUF3QjtBQUdyRSxnQ0FBd0IsNEJBQTRCLHFCQUFxQixlQUFlLCtCQUErQixDQUFDO0FBSXhILGdDQUF3QixDQUFDLFdBQVcsdUJBQXVCLHFCQUFxQixlQUFlLHdCQUF3QixXQUFXLEVBQUUsY0FBYyxtQkFBbUIsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUMzSyxrQ0FBMEIsWUFBWTtBQUd0QyxhQUFLLFdBQVcsUUFBUTtBQUd4QixpQkFBUyxHQUFvQyxvQkFBb0IsU0FBUyxFQUFFLE1BQU0sUUFBUTtBQUMxRixpQkFBUyxHQUEyQixpQkFBaUIsYUFBYSxFQUFFLE1BQU0sUUFBUTtBQUdsRixhQUFLLFVBQVUscUJBQXFCLGVBQWUsMkJBQTJCLENBQUM7QUFHL0UsYUFBSyxrQkFBa0Isa0JBQWtCLGdCQUFnQixzQkFBc0IsYUFBYSxhQUFhO0FBR3pHLGFBQUssZ0JBQWdCLHNCQUFzQixxQkFBcUIsZ0JBQWdCLG9CQUFvQjtBQUdwRyxhQUFLLHNCQUFzQjtBQUczQixhQUFLLE9BQU87QUFHWixhQUFLLFFBQVEsZ0JBQWdCO0FBQUEsTUFDOUIsQ0FBQztBQUVELGFBQU87QUFBQSxJQUNSLFNBQVMsT0FBTztBQUNmLHdCQUFrQixLQUFLO0FBRXZCLFlBQU07QUFBQSxJQUNQO0FBQUEsRUFDRDtBQUFBLEVBRVEsYUFBYSxtQkFBNkQ7QUFHakYsc0JBQWtCLElBQUkseUJBQXlCLElBQUk7QUFZbkQsVUFBTSxzQkFBc0IsK0JBQStCO0FBQzNELGVBQVcsQ0FBQyxJQUFJLFVBQVUsS0FBSyxxQkFBcUI7QUFDbkQsd0JBQWtCLElBQUksSUFBSSxVQUFVO0FBQUEsSUFDckM7QUFFQSxVQUFNLHVCQUF1QixJQUFJLHFCQUFxQixtQkFBbUIsSUFBSTtBQUc3RSx5QkFBcUIsZUFBZSxjQUFZO0FBQy9DLFlBQU0sbUJBQW1CLFNBQVMsSUFBSSxpQkFBaUI7QUFHdkQsWUFBTSx1QkFBdUIsU0FBUyxJQUFJLHFCQUFxQjtBQUMvRCxVQUFJLHdCQUF3QixpQ0FBaUMsc0JBQXNCO0FBQ2xGLFFBQUMscUJBQWtHLDRCQUE0QixvQkFBb0I7QUFBQSxNQUNwSjtBQUdBLHVCQUFpQixRQUFRLGVBQWU7QUFBQSxJQUN6QyxDQUFDO0FBRUQsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLGtCQUFrQixrQkFBcUMsZ0JBQWlDLHNCQUE2QyxhQUEyQixlQUFxQztBQUc1TSxTQUFLLFVBQVUscUJBQXFCLHlCQUF5QixPQUFLLEtBQUssbUJBQW1CLEdBQUcsb0JBQW9CLENBQUMsQ0FBQztBQUduSCxRQUFJLFVBQVU7QUFDYixXQUFLLFVBQVUsZUFBZSxnQkFBZ0IsT0FBSztBQUNsRCxZQUFJLEVBQUUsV0FBVyxvQkFBb0IsVUFBVTtBQUM5QyxlQUFLLGNBQWMsY0FBYztBQUFBLFFBQ2xDO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFBQSxJQUNILE9BQU87QUFDTixXQUFLLFVBQVUsaUJBQWlCLGVBQWUsTUFBTSxLQUFLLGNBQWMsY0FBYyxDQUFDLENBQUM7QUFBQSxJQUN6RjtBQUdBLFNBQUssVUFBVSxpQkFBaUIsZUFBZSxXQUFTLEtBQUssZ0JBQWdCLEtBQUssS0FBSyxDQUFDLENBQUM7QUFDekYsU0FBSyxVQUFVLGlCQUFpQixjQUFjLE1BQU07QUFDbkQsV0FBSyxlQUFlLEtBQUs7QUFDekIsV0FBSyxRQUFRO0FBQUEsSUFDZCxDQUFDLENBQUM7QUFPRixTQUFLLFVBQVUsWUFBWSxpQkFBaUIsV0FBUztBQUNwRCxVQUFJLENBQUMsT0FBTztBQUNYLHVCQUFlLE1BQU07QUFBQSxNQUN0QjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBR0YsU0FBSyxVQUFVLGNBQWMsaUJBQWlCLE1BQU0sS0FBSyxjQUFjLFVBQVUsSUFBSSxzQkFBc0IsQ0FBQyxDQUFDO0FBQzdHLFNBQUssVUFBVSxjQUFjLGdCQUFnQixNQUFNLEtBQUssY0FBYyxVQUFVLE9BQU8sc0JBQXNCLENBQUMsQ0FBQztBQUFBLEVBQ2hIO0FBQUEsRUFHUSxtQkFBbUIsR0FBMEMsc0JBQTZDO0FBQ2pILFFBQUksQ0FBQyxhQUFhO0FBQ2pCO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSyxDQUFDLEVBQUUscUJBQXFCLHdCQUF3QixHQUFHO0FBQzNEO0FBQUEsSUFDRDtBQUVBLFVBQU0sV0FBVyxxQkFBcUIsU0FBc0Qsd0JBQXdCO0FBQ3BILFFBQUksS0FBSyxpQkFBaUIsVUFBVTtBQUNuQztBQUFBLElBQ0Q7QUFFQSxTQUFLLGVBQWU7QUFHcEIsVUFBTSxxQkFBMEMsQ0FBQyxlQUFlLFFBQVEsTUFBTTtBQUM5RSxTQUFLLGNBQWMsVUFBVSxPQUFPLEdBQUcsbUJBQW1CLElBQUksV0FBUyx3QkFBd0IsS0FBSyxFQUFFLENBQUM7QUFHdkcsUUFBSSxtQkFBbUIsS0FBSyxZQUFVLFdBQVcsUUFBUSxHQUFHO0FBQzNELFdBQUssY0FBYyxVQUFVLElBQUksd0JBQXdCLFFBQVEsRUFBRTtBQUFBLElBQ3BFO0FBQUEsRUFDRDtBQUFBLEVBRVEsZ0JBQWdCLGdCQUFpQyxzQkFBbUQ7QUFDM0csVUFBTSxvQkFBb0IsZUFBZSxJQUFJLGtCQUFrQixhQUFhLFdBQVc7QUFDdkYsUUFBSSxtQkFBbUI7QUFDdEIsVUFBSTtBQUNILGNBQU0saUJBQWlCLEtBQUssTUFBTSxpQkFBaUI7QUFDbkQsWUFBSSxNQUFNLFFBQVEsY0FBYyxHQUFHO0FBQ2xDLDJCQUFpQixnQkFBZ0IsWUFBWSxjQUFjO0FBQUEsUUFDNUQ7QUFBQSxNQUNELFNBQVMsS0FBSztBQUFBLE1BRWQ7QUFBQSxJQUNEO0FBRUEscUJBQWlCLGFBQWEsWUFBWSxrQ0FBa0MscUJBQXFCLFNBQVMsUUFBUSxHQUFHLFdBQVcsWUFBWSxVQUFVLEVBQUUsS0FBSyxDQUFDO0FBQUEsRUFDL0o7QUFBQSxFQUVRLGNBQWMsZ0JBQXVDO0FBQzVELFVBQU0scUJBQXFCLGlCQUFpQixrQkFBa0IsVUFBVTtBQUN4RSxRQUFJLG9CQUFvQjtBQUN2QixxQkFBZSxNQUFNLGtCQUFrQixLQUFLLFVBQVUsa0JBQWtCLEdBQUcsYUFBYSxhQUFhLGNBQWMsT0FBTztBQUFBLElBQzNIO0FBQUEsRUFDRDtBQUFBLEVBRVEsZ0JBQWdCLHNCQUE2QyxxQkFBMEMsZ0JBQWlDLHNCQUFtRDtBQUdsTSxxQkFBaUIsS0FBSyxhQUFhO0FBQ25DLDRDQUF3QyxDQUFDLGFBQXFCLGVBQXdCLHFCQUFxQixlQUFlLHNDQUFzQyxhQUFhLFVBQVUsQ0FBQztBQUd4TCxVQUFNLGdCQUFnQixZQUFZLFlBQVksVUFBVSxVQUFVO0FBQ2xFLFVBQU0sbUJBQW1CLFNBQVM7QUFBQSxNQUNqQztBQUFBLE1BQ0E7QUFBQSxNQUNBLFFBQVEsUUFBUTtBQUFBLE1BQ2hCLFdBQVcsYUFBYSxZQUFZLFlBQVksV0FBVyxXQUFXO0FBQUEsTUFDdEUsR0FBRyxLQUFLLGlCQUFpQjtBQUFBLE1BQ3pCLEdBQUksS0FBSyxTQUFTLGVBQWUsS0FBSyxRQUFRLGVBQWUsQ0FBQztBQUFBLElBQy9ELENBQUM7QUFFRCxTQUFLLGNBQWMsVUFBVSxJQUFJLEdBQUcsZ0JBQWdCO0FBR3BELFNBQUssbUJBQW1CLFFBQVcsb0JBQW9CO0FBR3ZELFNBQUssZ0JBQWdCLGdCQUFnQixvQkFBb0I7QUFHekQsZUFBVyxFQUFFLElBQUksTUFBTSxTQUFTLFFBQVEsS0FBSztBQUFBLE1BQzVDLEVBQUUsSUFBSSxNQUFNLGVBQWUsTUFBTSxRQUFRLFNBQVMsQ0FBQyxVQUFVLEVBQUU7QUFBQSxNQUMvRCxFQUFFLElBQUksTUFBTSxhQUFhLE1BQU0sVUFBVSxTQUFTLENBQUMsUUFBUSxFQUFFO0FBQUEsTUFDN0QsRUFBRSxJQUFJLE1BQU0sa0JBQWtCLE1BQU0sUUFBUSxTQUFTLENBQUMsZUFBZSxLQUFLLG1CQUFtQixNQUFNLFNBQVMsT0FBTyxTQUFTLE9BQU8sRUFBRTtBQUFBO0FBQUEsTUFDckksRUFBRSxJQUFJLE1BQU0sY0FBYyxNQUFNLFFBQVEsU0FBUyxDQUFDLFdBQVcsS0FBSyxtQkFBbUIsTUFBTSxTQUFTLE9BQU8sU0FBUyxPQUFPLEVBQUU7QUFBQSxNQUM3SCxFQUFFLElBQUksTUFBTSxhQUFhLE1BQU0sUUFBUSxTQUFTLENBQUMsUUFBUSxHQUFHLFNBQVMsRUFBRSxzQkFBc0IsS0FBSyxtQkFBbUIsRUFBRSxFQUFFO0FBQUEsTUFDekgsRUFBRSxJQUFJLE1BQU0sWUFBWSxNQUFNLFFBQVEsU0FBUyxDQUFDLFNBQVMsYUFBYSxpQkFBaUIsS0FBSyxpQkFBaUIsQ0FBQyxDQUFDLEVBQUU7QUFBQSxNQUNqSCxFQUFFLElBQUksTUFBTSxtQkFBbUIsTUFBTSxRQUFRLFNBQVMsQ0FBQyxnQkFBZ0IsYUFBYSxLQUFLLG1CQUFtQixNQUFNLFNBQVMsT0FBTyxVQUFVLE1BQU0sRUFBRTtBQUFBLE1BQ3BKLEVBQUUsSUFBSSxNQUFNLGdCQUFnQixNQUFNLFVBQVUsU0FBUyxDQUFDLFdBQVcsRUFBRTtBQUFBLElBQ3BFLEdBQUc7QUFDRixZQUFNLGdCQUFnQixLQUFLLFdBQVcsSUFBSSxNQUFNLE9BQU87QUFFdkQsV0FBSyx1QkFBdUIsRUFBRSxFQUFFO0FBQ2hDLFdBQUssUUFBUSxFQUFFLEVBQUUsT0FBTyxlQUFlLE9BQU87QUFDOUMsV0FBSyxzQkFBc0IsRUFBRSxFQUFFO0FBQUEsSUFDaEM7QUFHQSxTQUFLLDRCQUE0QixzQkFBc0IsbUJBQW1CO0FBRzFFLFNBQUssT0FBTyxZQUFZLEtBQUssYUFBYTtBQUFBLEVBQzNDO0FBQUEsRUFFUSxXQUFXLElBQVksTUFBYyxTQUFnQztBQUM1RSxVQUFNLE9BQU8sU0FBUyxjQUFjLFNBQVMsV0FBVyxXQUEwRCxLQUFLO0FBQ3ZILFNBQUssVUFBVSxJQUFJLFFBQVEsR0FBRyxPQUFPO0FBQ3JDLFNBQUssS0FBSztBQUNWLFNBQUssYUFBYSxRQUFRLElBQUk7QUFDOUIsUUFBSSxTQUFTLFVBQVU7QUFDdEIsV0FBSyxhQUFhLGFBQWEsS0FBSztBQUFBLElBQ3JDO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLDRCQUE0QixzQkFBNkMscUJBQWdEO0FBR2hJLFVBQU0sc0JBQXNCLEtBQUssVUFBVSxxQkFBcUIsZUFBZSxxQkFBcUIsS0FBSyxlQUFlLG9CQUFvQixLQUFLLENBQUM7QUFDbEosVUFBTSxzQkFBc0IsS0FBSyxVQUFVLHFCQUFxQixlQUFlLHFCQUFxQixLQUFLLGVBQWUsb0JBQW9CLEtBQUssQ0FBQztBQUNsSixTQUFLLFVBQVUscUJBQXFCLGVBQWUscUJBQXFCLG9CQUFvQixLQUFLLENBQUM7QUFDbEcsVUFBTSxzQkFBc0IscUJBQXFCLGVBQWUscUJBQXFCLG9CQUFvQixLQUFLO0FBRzlHLFNBQUssVUFBVSxvQkFBb0Isc0JBQXNCLE1BQU07QUFDOUQsMEJBQW9CLE9BQU8sb0JBQW9CLFdBQVcsb0JBQW9CLFNBQVM7QUFDdkYsMEJBQW9CLE9BQU8sb0JBQW9CLFNBQVM7QUFBQSxJQUN6RCxDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsb0JBQW9CLHNCQUFzQixNQUFNO0FBQzlELDBCQUFvQixPQUFPLG9CQUFvQixXQUFXLG9CQUFvQixTQUFTO0FBQUEsSUFDeEYsQ0FBQyxDQUFDO0FBR0YsaUNBQTZCLHFCQUFxQixxQkFBcUIsb0JBQW9CLEtBQUs7QUFHaEcsMkJBQXVCLFNBQVMsSUFBSSwyQkFBMkIsQ0FBQztBQUdoRSxTQUFLLHNCQUFzQjtBQUFBLE1BQzFCLG9DQUFvQyxNQUFNLElBQUksTUFBTSxJQUFJLG9CQUFvQix1QkFBdUIsb0JBQW9CLHFCQUFxQixHQUFHLE1BQU0sb0JBQW9CLGFBQWEsb0JBQW9CLFNBQVM7QUFBQSxJQUNwTixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsUUFBUSxrQkFBMkM7QUFHMUQsUUFBSTtBQUNILFdBQUssYUFBYTtBQUFBLElBQ25CLFNBQVMsT0FBTztBQUNmLHdCQUFrQixLQUFLO0FBQUEsSUFDeEI7QUFXQSxTQUFLLFVBQVU7QUFBQSxNQUFRLE1BQ3RCLFFBQVEsS0FBSztBQUFBLFFBQ1osS0FBSztBQUFBLFFBQ0wsUUFBUSxHQUFJO0FBQUEsTUFDYixDQUFDLEVBQUUsUUFBUSxNQUFNO0FBTWhCLGlCQUFTLHdCQUF3QjtBQUNoQyxlQUFLLHdCQUF3QjtBQUM3QixzQkFBWSxRQUFRLG9DQUFvQyw2QkFBNkIsd0JBQXdCO0FBQUEsUUFDOUc7QUFFQSxZQUFJLEtBQUssV0FBVyxHQUFHO0FBQ3RCLGdDQUFzQjtBQUFBLFFBQ3ZCLE9BQU87QUFDTixlQUFLLGFBQWEsUUFBUSxNQUFNLHNCQUFzQixDQUFDO0FBQUEsUUFDeEQ7QUFHQSx5QkFBaUIsUUFBUSxlQUFlO0FBR3hDLGNBQU0sMkJBQTJCLEtBQUssVUFBVSxJQUFJLGlCQUFpQixNQUFNO0FBQzFFLGVBQUssVUFBVSxrQkFBa0IsWUFBWSxNQUFNLGlCQUFpQixRQUFRLGVBQWUsWUFBWSxJQUFJLENBQUM7QUFBQSxRQUM3RyxHQUFHLElBQUksQ0FBQztBQUNSLGlDQUF5QixTQUFTO0FBQUEsTUFDbkMsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQ0Q7IiwKICAibmFtZXMiOiBbXQp9Cg==
