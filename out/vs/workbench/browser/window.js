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
import { isSafari, setFullscreen } from "../../base/browser/browser.js";
import { addDisposableListener, EventHelper, EventType, getWindow, getWindowById, getWindows, getWindowsCount, hasAppFocus, windowOpenNoOpener, windowOpenPopup, windowOpenWithSuccess } from "../../base/browser/dom.js";
import { DomEmitter } from "../../base/browser/event.js";
import { requestHidDevice, requestSerialPort, requestUsbDevice } from "../../base/browser/deviceAccess.js";
import { timeout } from "../../base/common/async.js";
import { Event } from "../../base/common/event.js";
import { Disposable, dispose, toDisposable } from "../../base/common/lifecycle.js";
import { matchesScheme, Schemas } from "../../base/common/network.js";
import { isIOS, isMacintosh } from "../../base/common/platform.js";
import Severity from "../../base/common/severity.js";
import { URI } from "../../base/common/uri.js";
import { localize } from "../../nls.js";
import { CommandsRegistry } from "../../platform/commands/common/commands.js";
import { IDialogService } from "../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../platform/label/common/label.js";
import { IOpenerService } from "../../platform/opener/common/opener.js";
import { IProductService } from "../../platform/product/common/productService.js";
import { IBrowserWorkbenchEnvironmentService } from "../services/environment/browser/environmentService.js";
import { IWorkbenchLayoutService } from "../services/layout/browser/layoutService.js";
import { ILifecycleService, ShutdownReason } from "../services/lifecycle/common/lifecycle.js";
import { IHostService } from "../services/host/browser/host.js";
import { registerWindowDriver } from "../services/driver/browser/driver.js";
import { isAuxiliaryWindow, mainWindow } from "../../base/browser/window.js";
import { createSingleCallFunction } from "../../base/common/functional.js";
import { IConfigurationService } from "../../platform/configuration/common/configuration.js";
import { IWorkbenchEnvironmentService } from "../services/environment/common/environmentService.js";
import { MarkdownString } from "../../base/common/htmlContent.js";
import { IContextMenuService } from "../../platform/contextview/browser/contextView.js";
let BaseWindow = class extends Disposable {
  constructor(targetWindow, dom = { getWindowsCount, getWindows }, hostService, environmentService, contextMenuService, layoutService) {
    super();
    this.hostService = hostService;
    this.environmentService = environmentService;
    this.contextMenuService = contextMenuService;
    this.layoutService = layoutService;
    this.enableWindowFocusOnElementFocus(targetWindow);
    this.enableMultiWindowAwareTimeout(targetWindow, dom);
    this.registerFullScreenListeners(targetWindow.vscodeWindowId);
    this.registerContextMenuListeners(targetWindow);
  }
  //#region focus handling in multi-window applications
  enableWindowFocusOnElementFocus(targetWindow) {
    const originalFocus = targetWindow.HTMLElement.prototype.focus;
    const that = this;
    targetWindow.HTMLElement.prototype.focus = function(options) {
      that.onElementFocus(getWindow(this));
      originalFocus.apply(this, [options]);
    };
  }
  onElementFocus(targetWindow) {
    if (!targetWindow.document.hasFocus() && hasAppFocus()) {
      targetWindow.focus();
      if (!this.environmentService.extensionTestsLocationURI && !targetWindow.document.hasFocus()) {
        this.hostService.focus(targetWindow);
      }
    }
  }
  //#endregion
  //#region timeout handling in multi-window applications
  enableMultiWindowAwareTimeout(targetWindow, dom = { getWindowsCount, getWindows }) {
    const originalSetTimeout = targetWindow.setTimeout;
    Object.defineProperty(targetWindow, "vscodeOriginalSetTimeout", { get: () => originalSetTimeout });
    const originalClearTimeout = targetWindow.clearTimeout;
    Object.defineProperty(targetWindow, "vscodeOriginalClearTimeout", { get: () => originalClearTimeout });
    targetWindow.setTimeout = function(handler, timeout2 = 0, ...args) {
      if (dom.getWindowsCount() === 1 || typeof handler === "string" || timeout2 === 0) {
        return originalSetTimeout.apply(this, [handler, timeout2, ...args]);
      }
      const timeoutDisposables = /* @__PURE__ */ new Set();
      const timeoutHandle = BaseWindow.TIMEOUT_HANDLES++;
      BaseWindow.TIMEOUT_DISPOSABLES.set(timeoutHandle, timeoutDisposables);
      const handlerFn = createSingleCallFunction(handler, () => {
        dispose(timeoutDisposables);
        BaseWindow.TIMEOUT_DISPOSABLES.delete(timeoutHandle);
      });
      for (const { window, disposables } of dom.getWindows()) {
        if (isAuxiliaryWindow(window) && window.document.visibilityState === "hidden") {
          continue;
        }
        let didClear = false;
        const handle = window.vscodeOriginalSetTimeout?.apply(this, [(...args2) => {
          if (didClear) {
            return;
          }
          handlerFn(...args2);
        }, timeout2, ...args]);
        const timeoutDisposable = toDisposable(() => {
          didClear = true;
          window.vscodeOriginalClearTimeout?.apply(this, [handle]);
          timeoutDisposables.delete(timeoutDisposable);
          disposables.delete(timeoutDisposable);
        });
        disposables.add(timeoutDisposable);
        timeoutDisposables.add(timeoutDisposable);
      }
      return timeoutHandle;
    };
    targetWindow.clearTimeout = function(timeoutHandle) {
      const timeoutDisposables = typeof timeoutHandle === "number" ? BaseWindow.TIMEOUT_DISPOSABLES.get(timeoutHandle) : void 0;
      if (timeoutDisposables) {
        dispose(timeoutDisposables);
        BaseWindow.TIMEOUT_DISPOSABLES.delete(timeoutHandle);
      } else {
        originalClearTimeout.apply(this, [timeoutHandle]);
      }
    };
  }
  //#endregion
  //#region Confirm on Shutdown
  static async confirmOnShutdown(accessor, reason) {
    const dialogService = accessor.get(IDialogService);
    const configurationService = accessor.get(IConfigurationService);
    const message = reason === ShutdownReason.QUIT ? isMacintosh ? localize("quitMessageMac", "Are you sure you want to quit?") : localize("quitMessage", "Are you sure you want to exit?") : localize("closeWindowMessage", "Are you sure you want to close the window?");
    const primaryButton = reason === ShutdownReason.QUIT ? isMacintosh ? localize({ key: "quitButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Quit") : localize({ key: "exitButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Exit") : localize({ key: "closeWindowButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Close Window");
    const res = await dialogService.confirm({
      message,
      primaryButton,
      checkbox: {
        label: localize("doNotAskAgain", "Do not ask me again")
      }
    });
    if (res.confirmed && res.checkboxChecked) {
      await configurationService.updateValue("window.confirmBeforeClose", "never");
    }
    return res.confirmed;
  }
  //#endregion
  registerFullScreenListeners(targetWindowId) {
    this._register(this.hostService.onDidChangeFullScreen(({ windowId, fullscreen }) => {
      if (windowId === targetWindowId) {
        const targetWindow = getWindowById(targetWindowId);
        if (targetWindow) {
          setFullscreen(fullscreen, targetWindow.window);
        }
      }
    }));
  }
  registerContextMenuListeners(targetWindow) {
    if (targetWindow !== mainWindow) {
      return;
    }
    const update = (visible) => this.layoutService.activeContainer.classList.toggle("context-menu-visible", visible);
    this._register(this.contextMenuService.onDidShowContextMenu(() => update(true)));
    this._register(this.contextMenuService.onDidHideContextMenu(() => update(false)));
  }
};
BaseWindow.TIMEOUT_HANDLES = Number.MIN_SAFE_INTEGER;
// try to not compete with the IDs of native `setTimeout`
BaseWindow.TIMEOUT_DISPOSABLES = /* @__PURE__ */ new Map();
BaseWindow = __decorateClass([
  __decorateParam(2, IHostService),
  __decorateParam(3, IWorkbenchEnvironmentService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IWorkbenchLayoutService)
], BaseWindow);
let BrowserWindow = class extends BaseWindow {
  constructor(openerService, lifecycleService, dialogService, labelService, productService, browserEnvironmentService, layoutService, instantiationService, hostService, contextMenuService) {
    super(mainWindow, void 0, hostService, browserEnvironmentService, contextMenuService, layoutService);
    this.openerService = openerService;
    this.lifecycleService = lifecycleService;
    this.dialogService = dialogService;
    this.labelService = labelService;
    this.productService = productService;
    this.browserEnvironmentService = browserEnvironmentService;
    this.instantiationService = instantiationService;
    this.registerListeners();
    this.create();
  }
  registerListeners() {
    this._register(this.lifecycleService.onWillShutdown(() => this.onWillShutdown()));
    const viewport = isIOS && mainWindow.visualViewport ? mainWindow.visualViewport : mainWindow;
    this._register(addDisposableListener(viewport, EventType.RESIZE, () => {
      this.layoutService.layout();
      if (isIOS) {
        mainWindow.scrollTo(0, 0);
      }
    }));
    this._register(addDisposableListener(this.layoutService.mainContainer, EventType.WHEEL, (e) => e.preventDefault(), { passive: false }));
    this._register(addDisposableListener(this.layoutService.mainContainer, EventType.CONTEXT_MENU, (e) => EventHelper.stop(e, true)));
    this._register(addDisposableListener(this.layoutService.mainContainer, EventType.DROP, (e) => EventHelper.stop(e, true)));
  }
  onWillShutdown() {
    Event.toPromise(Event.any(
      Event.once(new DomEmitter(mainWindow.document.body, EventType.KEY_DOWN, true).event),
      Event.once(new DomEmitter(mainWindow.document.body, EventType.MOUSE_DOWN, true).event)
    )).then(async () => {
      await timeout(3e3);
      await this.dialogService.prompt({
        type: Severity.Error,
        message: localize("shutdownError", "An unexpected error occurred that requires a reload of this page."),
        detail: localize("shutdownErrorDetail", "The workbench was unexpectedly disposed while running."),
        buttons: [
          {
            label: localize({ key: "reload", comment: ["&& denotes a mnemonic"] }, "&&Reload"),
            run: () => mainWindow.location.reload()
            // do not use any services at this point since they are likely not functional at this point
          }
        ]
      });
    });
  }
  create() {
    this.setupOpenHandlers();
    this.registerLabelFormatters();
    this.registerCommands();
    this.setupDriver();
  }
  setupDriver() {
    if (this.environmentService.enableSmokeTestDriver) {
      registerWindowDriver(this.instantiationService);
    }
  }
  setupOpenHandlers() {
    this.openerService.setDefaultExternalOpener({
      openExternal: async (href) => {
        let isAllowedOpener = false;
        if (this.browserEnvironmentService.options?.openerAllowedExternalUrlPrefixes) {
          for (const trustedPopupPrefix of this.browserEnvironmentService.options.openerAllowedExternalUrlPrefixes) {
            if (href.startsWith(trustedPopupPrefix)) {
              isAllowedOpener = true;
              break;
            }
          }
        }
        if (matchesScheme(href, Schemas.http) || matchesScheme(href, Schemas.https)) {
          if (isSafari) {
            const opened = windowOpenWithSuccess(href, !isAllowedOpener);
            if (!opened) {
              await this.dialogService.prompt({
                type: Severity.Warning,
                message: localize("unableToOpenExternal", "The browser blocked opening a new tab or window. Press 'Retry' to try again."),
                custom: {
                  markdownDetails: [{ markdown: new MarkdownString(localize("unableToOpenWindowDetail", "Please allow pop-ups for this website in your [browser settings]({0}).", "https://aka.ms/allow-vscode-popup"), true) }]
                },
                buttons: [
                  {
                    label: localize({ key: "retry", comment: ["&& denotes a mnemonic"] }, "&&Retry"),
                    run: () => isAllowedOpener ? windowOpenPopup(href) : windowOpenNoOpener(href)
                  }
                ],
                cancelButton: true
              });
            }
          } else {
            if (isAllowedOpener) {
              windowOpenPopup(href);
            } else {
              windowOpenNoOpener(href);
            }
          }
        } else {
          const invokeProtocolHandler = () => {
            this.lifecycleService.withExpectedShutdown({ disableShutdownHandling: true }, () => mainWindow.location.href = href);
          };
          invokeProtocolHandler();
          const showProtocolUrlOpenedDialog = async () => {
            const { downloadUrl } = this.productService;
            let detail;
            const buttons = [
              {
                label: localize({ key: "openExternalDialogButtonRetry.v2", comment: ["&& denotes a mnemonic"] }, "&&Try Again"),
                run: () => invokeProtocolHandler()
              }
            ];
            if (downloadUrl !== void 0) {
              detail = localize(
                "openExternalDialogDetail.v2",
                "We launched {0} on your computer.\n\nIf {1} did not launch, try again or install it below.",
                this.productService.nameLong,
                this.productService.nameLong
              );
              buttons.push({
                label: localize({ key: "openExternalDialogButtonInstall.v3", comment: ["&& denotes a mnemonic"] }, "&&Install"),
                run: async () => {
                  await this.openerService.open(URI.parse(downloadUrl));
                  showProtocolUrlOpenedDialog();
                }
              });
            } else {
              detail = localize(
                "openExternalDialogDetailNoInstall",
                "We launched {0} on your computer.\n\nIf {1} did not launch, try again below.",
                this.productService.nameLong,
                this.productService.nameLong
              );
            }
            await this.hostService.withExpectedShutdown(() => this.dialogService.prompt({
              type: Severity.Info,
              message: localize("openExternalDialogTitle", "All done. You can close this tab now."),
              detail,
              buttons,
              cancelButton: true
            }));
          };
          if (matchesScheme(href, this.productService.urlProtocol)) {
            await showProtocolUrlOpenedDialog();
          }
        }
        return true;
      }
    });
  }
  registerLabelFormatters() {
    this._register(this.labelService.registerFormatter({
      scheme: Schemas.vscodeUserData,
      priority: true,
      formatting: {
        label: "(Settings) ${path}",
        separator: "/"
      }
    }));
  }
  registerCommands() {
    CommandsRegistry.registerCommand("workbench.experimental.requestUsbDevice", async (_accessor, options) => {
      return requestUsbDevice(options);
    });
    CommandsRegistry.registerCommand("workbench.experimental.requestSerialPort", async (_accessor, options) => {
      return requestSerialPort(options);
    });
    CommandsRegistry.registerCommand("workbench.experimental.requestHidDevice", async (_accessor, options) => {
      return requestHidDevice(options);
    });
  }
};
BrowserWindow = __decorateClass([
  __decorateParam(0, IOpenerService),
  __decorateParam(1, ILifecycleService),
  __decorateParam(2, IDialogService),
  __decorateParam(3, ILabelService),
  __decorateParam(4, IProductService),
  __decorateParam(5, IBrowserWorkbenchEnvironmentService),
  __decorateParam(6, IWorkbenchLayoutService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IHostService),
  __decorateParam(9, IContextMenuService)
], BrowserWindow);
export {
  BaseWindow,
  BrowserWindow
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHdpbmRvdy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGlzU2FmYXJpLCBzZXRGdWxsc2NyZWVuIH0gZnJvbSAnLi4vLi4vYmFzZS9icm93c2VyL2Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBFdmVudEhlbHBlciwgRXZlbnRUeXBlLCBnZXRXaW5kb3csIGdldFdpbmRvd0J5SWQsIGdldFdpbmRvd3MsIGdldFdpbmRvd3NDb3VudCwgaGFzQXBwRm9jdXMsIHdpbmRvd09wZW5Ob09wZW5lciwgd2luZG93T3BlblBvcHVwLCB3aW5kb3dPcGVuV2l0aFN1Y2Nlc3MgfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IERvbUVtaXR0ZXIgfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvZXZlbnQuanMnO1xuaW1wb3J0IHsgSGlkRGV2aWNlRGF0YSwgcmVxdWVzdEhpZERldmljZSwgcmVxdWVzdFNlcmlhbFBvcnQsIHJlcXVlc3RVc2JEZXZpY2UsIFNlcmlhbFBvcnREYXRhLCBVc2JEZXZpY2VEYXRhIH0gZnJvbSAnLi4vLi4vYmFzZS9icm93c2VyL2RldmljZUFjY2Vzcy5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgZGlzcG9zZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG1hdGNoZXNTY2hlbWUsIFNjaGVtYXMgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGlzSU9TLCBpc01hY2ludG9zaCB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSwgSVByb21wdEJ1dHRvbiB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9icm93c2VyL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQnJvd3NlckxpZmVjeWNsZVNlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlcy9saWZlY3ljbGUvYnJvd3Nlci9saWZlY3ljbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlLCBTaHV0ZG93blJlYXNvbiB9IGZyb20gJy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyV2luZG93RHJpdmVyIH0gZnJvbSAnLi4vc2VydmljZXMvZHJpdmVyL2Jyb3dzZXIvZHJpdmVyLmpzJztcbmltcG9ydCB7IENvZGVXaW5kb3csIGlzQXV4aWxpYXJ5V2luZG93LCBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24gfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9mdW5jdGlvbmFsLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBCYXNlV2luZG93IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgVElNRU9VVF9IQU5ETEVTID0gTnVtYmVyLk1JTl9TQUZFX0lOVEVHRVI7IC8vIHRyeSB0byBub3QgY29tcGV0ZSB3aXRoIHRoZSBJRHMgb2YgbmF0aXZlIGBzZXRUaW1lb3V0YFxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBUSU1FT1VUX0RJU1BPU0FCTEVTID0gbmV3IE1hcDxudW1iZXIsIFNldDxJRGlzcG9zYWJsZT4+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dGFyZ2V0V2luZG93OiBDb2RlV2luZG93LFxuXHRcdGRvbSA9IHsgZ2V0V2luZG93c0NvdW50LCBnZXRXaW5kb3dzIH0sIC8qIGZvciB0ZXN0aW5nICovXG5cdFx0QElIb3N0U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZW5hYmxlV2luZG93Rm9jdXNPbkVsZW1lbnRGb2N1cyh0YXJnZXRXaW5kb3cpO1xuXHRcdHRoaXMuZW5hYmxlTXVsdGlXaW5kb3dBd2FyZVRpbWVvdXQodGFyZ2V0V2luZG93LCBkb20pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckZ1bGxTY3JlZW5MaXN0ZW5lcnModGFyZ2V0V2luZG93LnZzY29kZVdpbmRvd0lkKTtcblx0XHR0aGlzLnJlZ2lzdGVyQ29udGV4dE1lbnVMaXN0ZW5lcnModGFyZ2V0V2luZG93KTtcblx0fVxuXG5cdC8vI3JlZ2lvbiBmb2N1cyBoYW5kbGluZyBpbiBtdWx0aS13aW5kb3cgYXBwbGljYXRpb25zXG5cblx0cHJvdGVjdGVkIGVuYWJsZVdpbmRvd0ZvY3VzT25FbGVtZW50Rm9jdXModGFyZ2V0V2luZG93OiBDb2RlV2luZG93KTogdm9pZCB7XG5cdFx0Y29uc3Qgb3JpZ2luYWxGb2N1cyA9IHRhcmdldFdpbmRvdy5IVE1MRWxlbWVudC5wcm90b3R5cGUuZm9jdXM7XG5cblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHR0YXJnZXRXaW5kb3cuSFRNTEVsZW1lbnQucHJvdG90eXBlLmZvY3VzID0gZnVuY3Rpb24gKHRoaXM6IEhUTUxFbGVtZW50LCBvcHRpb25zPzogRm9jdXNPcHRpb25zIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cblx0XHRcdC8vIEVuc3VyZSB0aGUgd2luZG93IHRoZSBlbGVtZW50IGJlbG9uZ3MgdG8gaXMgZm9jdXNlZFxuXHRcdFx0Ly8gaW4gc2NlbmFyaW9zIHdoZXJlIGF1eGlsaWFyeSB3aW5kb3dzIGFyZSBwcmVzZW50XG5cdFx0XHR0aGF0Lm9uRWxlbWVudEZvY3VzKGdldFdpbmRvdyh0aGlzKSk7XG5cblx0XHRcdC8vIFBhc3MgdG8gb3JpZ2luYWwgZm9jdXMoKSBtZXRob2Rcblx0XHRcdG9yaWdpbmFsRm9jdXMuYXBwbHkodGhpcywgW29wdGlvbnNdKTtcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBvbkVsZW1lbnRGb2N1cyh0YXJnZXRXaW5kb3c6IENvZGVXaW5kb3cpOiB2b2lkIHtcblxuXHRcdC8vIENoZWNrIGlmIGZvY3VzIHNob3VsZCB0cmFuc2ZlcjogdGhlIGFwcGxpY2F0aW9uIGN1cnJlbnRseSBoYXMgZm9jdXMgc29tZXdoZXJlLCBidXQgbm90IGluIHRoZSB0YXJnZXQgd2luZG93LlxuXHRcdGlmICghdGFyZ2V0V2luZG93LmRvY3VtZW50Lmhhc0ZvY3VzKCkgJiYgaGFzQXBwRm9jdXMoKSkge1xuXG5cdFx0XHQvLyBDYWxsIG9yaWdpbmFsIGZvY3VzKClcblx0XHRcdHRhcmdldFdpbmRvdy5mb2N1cygpO1xuXG5cdFx0XHQvLyBJbiBFbGVjdHJvbiwgYHdpbmRvdy5mb2N1cygpYCBmYWlscyB0byBicmluZyB0aGUgd2luZG93XG5cdFx0XHQvLyB0byB0aGUgZnJvbnQgaWYgbXVsdGlwbGUgd2luZG93cyBleGlzdCBpbiB0aGUgc2FtZSBwcm9jZXNzXG5cdFx0XHQvLyBncm91cCAoZmxvYXRpbmcgd2luZG93cykuIEFzIHN1Y2gsIHdlIGFzayB0aGUgaG9zdCBzZXJ2aWNlXG5cdFx0XHQvLyB0byBmb2N1cyB0aGUgd2luZG93IHdoaWNoIGNhbiB0YWtlIGNhcmUgb2YgYnJpbmdpbiB0aGVcblx0XHRcdC8vIHdpbmRvdyB0byB0aGUgZnJvbnQuXG5cdFx0XHQvL1xuXHRcdFx0Ly8gVG8gbWluaW1pc2UgZGlzcnVwdGlvbiBieSBicmluZ2luZyB3aW5kb3dzIHRvIHRoZSBmcm9udFxuXHRcdFx0Ly8gYnkgYWNjaWRlbnQsIHdlIG9ubHkgZG8gdGhpcyBpZiB0aGUgd2luZG93IGlzIG5vdCBhbHJlYWR5XG5cdFx0XHQvLyBmb2N1c2VkIGFuZCB0aGUgYWN0aXZlIHdpbmRvdyBpcyBub3QgdGhlIHRhcmdldCB3aW5kb3dcblx0XHRcdC8vIGJ1dCBoYXMgZm9jdXMuIFRoaXMgaXMgYW4gaW5kaWNhdGlvbiB0aGF0IG11bHRpcGxlIHdpbmRvd3Ncblx0XHRcdC8vIGFyZSBvcGVuZWQgaW4gdGhlIHNhbWUgcHJvY2VzcyBncm91cCB3aGlsZSB0aGUgdGFyZ2V0IHdpbmRvd1xuXHRcdFx0Ly8gaXMgbm90IGZvY3VzZWQuXG5cblx0XHRcdGlmIChcblx0XHRcdFx0IXRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmV4dGVuc2lvblRlc3RzTG9jYXRpb25VUkkgJiZcblx0XHRcdFx0IXRhcmdldFdpbmRvdy5kb2N1bWVudC5oYXNGb2N1cygpXG5cdFx0XHQpIHtcblx0XHRcdFx0dGhpcy5ob3N0U2VydmljZS5mb2N1cyh0YXJnZXRXaW5kb3cpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiB0aW1lb3V0IGhhbmRsaW5nIGluIG11bHRpLXdpbmRvdyBhcHBsaWNhdGlvbnNcblxuXHRwcm90ZWN0ZWQgZW5hYmxlTXVsdGlXaW5kb3dBd2FyZVRpbWVvdXQodGFyZ2V0V2luZG93OiBXaW5kb3csIGRvbSA9IHsgZ2V0V2luZG93c0NvdW50LCBnZXRXaW5kb3dzIH0pOiB2b2lkIHtcblxuXHRcdC8vIE92ZXJyaWRlIGBzZXRUaW1lb3V0YCBhbmQgYGNsZWFyVGltZW91dGAgb24gdGhlIHByb3ZpZGVkIHdpbmRvdyB0byBtYWtlXG5cdFx0Ly8gc3VyZSB0aW1lb3V0cyBhcmUgZGlzcGF0Y2hlZCB0byBhbGwgb3BlbmVkIHdpbmRvd3MuIFNvbWUgYnJvd3NlcnMgbWF5IGRlY2lkZVxuXHRcdC8vIHRvIHRocm90dGxlIHRpbWVvdXRzIGluIG1pbmltaXplZCB3aW5kb3dzLCBzbyB3aXRoIHRoaXMgd2UgY2FuIGVuc3VyZSB0aGVcblx0XHQvLyB0aW1lb3V0IGlzIHNjaGVkdWxlZCB3aXRob3V0IGJlaW5nIHRocm90dGxlZCAodW5sZXNzIGFsbCB3aW5kb3dzIGFyZSBtaW5pbWl6ZWQpLlxuXG5cdFx0Y29uc3Qgb3JpZ2luYWxTZXRUaW1lb3V0ID0gdGFyZ2V0V2luZG93LnNldFRpbWVvdXQ7XG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldFdpbmRvdywgJ3ZzY29kZU9yaWdpbmFsU2V0VGltZW91dCcsIHsgZ2V0OiAoKSA9PiBvcmlnaW5hbFNldFRpbWVvdXQgfSk7XG5cblx0XHRjb25zdCBvcmlnaW5hbENsZWFyVGltZW91dCA9IHRhcmdldFdpbmRvdy5jbGVhclRpbWVvdXQ7XG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldFdpbmRvdywgJ3ZzY29kZU9yaWdpbmFsQ2xlYXJUaW1lb3V0JywgeyBnZXQ6ICgpID0+IG9yaWdpbmFsQ2xlYXJUaW1lb3V0IH0pO1xuXG5cdFx0dGFyZ2V0V2luZG93LnNldFRpbWVvdXQgPSBmdW5jdGlvbiAodGhpczogdW5rbm93biwgaGFuZGxlcjogVGltZXJIYW5kbGVyLCB0aW1lb3V0ID0gMCwgLi4uYXJnczogdW5rbm93bltdKTogbnVtYmVyIHtcblx0XHRcdGlmIChkb20uZ2V0V2luZG93c0NvdW50KCkgPT09IDEgfHwgdHlwZW9mIGhhbmRsZXIgPT09ICdzdHJpbmcnIHx8IHRpbWVvdXQgPT09IDAgLyogaW1tZWRpYXRlcyBhcmUgbmV2ZXIgdGhyb3R0bGVkICovKSB7XG5cdFx0XHRcdHJldHVybiBvcmlnaW5hbFNldFRpbWVvdXQuYXBwbHkodGhpcywgW2hhbmRsZXIsIHRpbWVvdXQsIC4uLmFyZ3NdKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGltZW91dERpc3Bvc2FibGVzID0gbmV3IFNldDxJRGlzcG9zYWJsZT4oKTtcblx0XHRcdGNvbnN0IHRpbWVvdXRIYW5kbGUgPSBCYXNlV2luZG93LlRJTUVPVVRfSEFORExFUysrO1xuXHRcdFx0QmFzZVdpbmRvdy5USU1FT1VUX0RJU1BPU0FCTEVTLnNldCh0aW1lb3V0SGFuZGxlLCB0aW1lb3V0RGlzcG9zYWJsZXMpO1xuXG5cdFx0XHRjb25zdCBoYW5kbGVyRm4gPSBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24oaGFuZGxlciwgKCkgPT4ge1xuXHRcdFx0XHRkaXNwb3NlKHRpbWVvdXREaXNwb3NhYmxlcyk7XG5cdFx0XHRcdEJhc2VXaW5kb3cuVElNRU9VVF9ESVNQT1NBQkxFUy5kZWxldGUodGltZW91dEhhbmRsZSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Zm9yIChjb25zdCB7IHdpbmRvdywgZGlzcG9zYWJsZXMgfSBvZiBkb20uZ2V0V2luZG93cygpKSB7XG5cdFx0XHRcdGlmIChpc0F1eGlsaWFyeVdpbmRvdyh3aW5kb3cpICYmIHdpbmRvdy5kb2N1bWVudC52aXNpYmlsaXR5U3RhdGUgPT09ICdoaWRkZW4nKSB7XG5cdFx0XHRcdFx0Y29udGludWU7IC8vIHNraXAgb3ZlciBoaWRkZW4gd2luZG93cyAoYnV0IG5ldmVyIG92ZXIgbWFpbiB3aW5kb3cpXG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyB3ZSB0cmFjayBkaWRDbGVhciBpbiBjYXNlIHRoZSBicm93c2VyIGRvZXMgbm90IHByb3Blcmx5IGNsZWFyIHRoZSB0aW1lb3V0XG5cdFx0XHRcdC8vIHRoaXMgY2FuIGhhcHBlbiBmb3IgdGltZW91dHMgb24gdW5mb2N1c2VkIHdpbmRvd3Ncblx0XHRcdFx0bGV0IGRpZENsZWFyID0gZmFsc2U7XG5cblx0XHRcdFx0Y29uc3QgaGFuZGxlID0gKHdpbmRvdyBhcyB7IHZzY29kZU9yaWdpbmFsU2V0VGltZW91dD86IHR5cGVvZiB3aW5kb3cuc2V0VGltZW91dCB9KS52c2NvZGVPcmlnaW5hbFNldFRpbWVvdXQ/LmFwcGx5KHRoaXMsIFsoLi4uYXJnczogdW5rbm93bltdKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGRpZENsZWFyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGhhbmRsZXJGbiguLi5hcmdzKTtcblx0XHRcdFx0fSwgdGltZW91dCwgLi4uYXJnc10pO1xuXG5cdFx0XHRcdGNvbnN0IHRpbWVvdXREaXNwb3NhYmxlID0gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0XHRkaWRDbGVhciA9IHRydWU7XG5cdFx0XHRcdFx0KHdpbmRvdyBhcyB7IHZzY29kZU9yaWdpbmFsQ2xlYXJUaW1lb3V0PzogdHlwZW9mIHdpbmRvdy5jbGVhclRpbWVvdXQgfSkudnNjb2RlT3JpZ2luYWxDbGVhclRpbWVvdXQ/LmFwcGx5KHRoaXMsIFtoYW5kbGVdKTtcblx0XHRcdFx0XHR0aW1lb3V0RGlzcG9zYWJsZXMuZGVsZXRlKHRpbWVvdXREaXNwb3NhYmxlKTtcblx0XHRcdFx0XHQvLyBSZW1vdmUgZnJvbSB0aGUgd2luZG93J3MgRGlzcG9zYWJsZVN0b3JlLiBSZS1kaXNwb3NhbCBpcyBhIG5vLW9wIGFuZFxuXHRcdFx0XHRcdC8vIGF2b2lkcyByZS1yZWdpc3RlcmluZyB0aGUgYWxyZWFkeS1kaXNwb3NlZCB0aW1lb3V0IGFzIGEgbGVhay5cblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5kZWxldGUodGltZW91dERpc3Bvc2FibGUpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQodGltZW91dERpc3Bvc2FibGUpO1xuXHRcdFx0XHR0aW1lb3V0RGlzcG9zYWJsZXMuYWRkKHRpbWVvdXREaXNwb3NhYmxlKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRpbWVvdXRIYW5kbGU7XG5cdFx0fTtcblxuXHRcdHRhcmdldFdpbmRvdy5jbGVhclRpbWVvdXQgPSBmdW5jdGlvbiAodGhpczogdW5rbm93biwgdGltZW91dEhhbmRsZTogbnVtYmVyIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0XHRjb25zdCB0aW1lb3V0RGlzcG9zYWJsZXMgPSB0eXBlb2YgdGltZW91dEhhbmRsZSA9PT0gJ251bWJlcicgPyBCYXNlV2luZG93LlRJTUVPVVRfRElTUE9TQUJMRVMuZ2V0KHRpbWVvdXRIYW5kbGUpIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHRpbWVvdXREaXNwb3NhYmxlcykge1xuXHRcdFx0XHRkaXNwb3NlKHRpbWVvdXREaXNwb3NhYmxlcyk7XG5cdFx0XHRcdEJhc2VXaW5kb3cuVElNRU9VVF9ESVNQT1NBQkxFUy5kZWxldGUodGltZW91dEhhbmRsZSEpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0b3JpZ2luYWxDbGVhclRpbWVvdXQuYXBwbHkodGhpcywgW3RpbWVvdXRIYW5kbGVdKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIENvbmZpcm0gb24gU2h1dGRvd25cblxuXHRzdGF0aWMgYXN5bmMgY29uZmlybU9uU2h1dGRvd24oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHJlYXNvbjogU2h1dGRvd25SZWFzb24pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgbWVzc2FnZSA9IHJlYXNvbiA9PT0gU2h1dGRvd25SZWFzb24uUVVJVCA/XG5cdFx0XHQoaXNNYWNpbnRvc2ggPyBsb2NhbGl6ZSgncXVpdE1lc3NhZ2VNYWMnLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBxdWl0P1wiKSA6IGxvY2FsaXplKCdxdWl0TWVzc2FnZScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGV4aXQ/XCIpKSA6XG5cdFx0XHRsb2NhbGl6ZSgnY2xvc2VXaW5kb3dNZXNzYWdlJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gY2xvc2UgdGhlIHdpbmRvdz9cIik7XG5cdFx0Y29uc3QgcHJpbWFyeUJ1dHRvbiA9IHJlYXNvbiA9PT0gU2h1dGRvd25SZWFzb24uUVVJVCA/XG5cdFx0XHQoaXNNYWNpbnRvc2ggPyBsb2NhbGl6ZSh7IGtleTogJ3F1aXRCdXR0b25MYWJlbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlF1aXRcIikgOiBsb2NhbGl6ZSh7IGtleTogJ2V4aXRCdXR0b25MYWJlbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkV4aXRcIikpIDpcblx0XHRcdGxvY2FsaXplKHsga2V5OiAnY2xvc2VXaW5kb3dCdXR0b25MYWJlbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkNsb3NlIFdpbmRvd1wiKTtcblxuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRtZXNzYWdlLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbixcblx0XHRcdGNoZWNrYm94OiB7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZG9Ob3RBc2tBZ2FpbicsIFwiRG8gbm90IGFzayBtZSBhZ2FpblwiKVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gVXBkYXRlIHNldHRpbmcgaWYgY2hlY2tib3ggY2hlY2tlZFxuXHRcdGlmIChyZXMuY29uZmlybWVkICYmIHJlcy5jaGVja2JveENoZWNrZWQpIHtcblx0XHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKCd3aW5kb3cuY29uZmlybUJlZm9yZUNsb3NlJywgJ25ldmVyJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlcy5jb25maXJtZWQ7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHRwcml2YXRlIHJlZ2lzdGVyRnVsbFNjcmVlbkxpc3RlbmVycyh0YXJnZXRXaW5kb3dJZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ob3N0U2VydmljZS5vbkRpZENoYW5nZUZ1bGxTY3JlZW4oKHsgd2luZG93SWQsIGZ1bGxzY3JlZW4gfSkgPT4ge1xuXHRcdFx0aWYgKHdpbmRvd0lkID09PSB0YXJnZXRXaW5kb3dJZCkge1xuXHRcdFx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBnZXRXaW5kb3dCeUlkKHRhcmdldFdpbmRvd0lkKTtcblx0XHRcdFx0aWYgKHRhcmdldFdpbmRvdykge1xuXHRcdFx0XHRcdHNldEZ1bGxzY3JlZW4oZnVsbHNjcmVlbiwgdGFyZ2V0V2luZG93LndpbmRvdyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyQ29udGV4dE1lbnVMaXN0ZW5lcnModGFyZ2V0V2luZG93OiBXaW5kb3cpOiB2b2lkIHtcblx0XHRpZiAodGFyZ2V0V2luZG93ICE9PSBtYWluV2luZG93KSB7XG5cdFx0XHQvLyB3ZSBvbmx5IG5lZWQgdG8gbGlzdGVuIGluIHRoZSBtYWluIHdpbmRvdyBhcyB0aGUgY29kZVxuXHRcdFx0Ly8gd2lsbCBnbyBieSB0aGUgYWN0aXZlIGNvbnRhaW5lciBhbmQgdXBkYXRlIGFjY29yZGluZ2x5XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXBkYXRlID0gKHZpc2libGU6IGJvb2xlYW4pID0+IHRoaXMubGF5b3V0U2VydmljZS5hY3RpdmVDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY29udGV4dC1tZW51LXZpc2libGUnLCB2aXNpYmxlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRNZW51U2VydmljZS5vbkRpZFNob3dDb250ZXh0TWVudSgoKSA9PiB1cGRhdGUodHJ1ZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRNZW51U2VydmljZS5vbkRpZEhpZGVDb250ZXh0TWVudSgoKSA9PiB1cGRhdGUoZmFsc2UpKSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEJyb3dzZXJXaW5kb3cgZXh0ZW5kcyBCYXNlV2luZG93IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVTZXJ2aWNlOiBCcm93c2VyTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBicm93c2VyRW52aXJvbm1lbnRTZXJ2aWNlOiBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIobWFpbldpbmRvdywgdW5kZWZpbmVkLCBob3N0U2VydmljZSwgYnJvd3NlckVudmlyb25tZW50U2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBsYXlvdXRTZXJ2aWNlKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0XHR0aGlzLmNyZWF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblxuXHRcdC8vIExpZmVjeWNsZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlmZWN5Y2xlU2VydmljZS5vbldpbGxTaHV0ZG93bigoKSA9PiB0aGlzLm9uV2lsbFNodXRkb3duKCkpKTtcblxuXHRcdC8vIExheW91dFxuXHRcdGNvbnN0IHZpZXdwb3J0ID0gaXNJT1MgJiYgbWFpbldpbmRvdy52aXN1YWxWaWV3cG9ydCA/IG1haW5XaW5kb3cudmlzdWFsVmlld3BvcnQgLyoqIFZpc3VhbCB2aWV3cG9ydCAqLyA6IG1haW5XaW5kb3cgLyoqIExheW91dCB2aWV3cG9ydCAqLztcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodmlld3BvcnQsIEV2ZW50VHlwZS5SRVNJWkUsICgpID0+IHtcblx0XHRcdHRoaXMubGF5b3V0U2VydmljZS5sYXlvdXQoKTtcblxuXHRcdFx0Ly8gU29tZXRpbWVzIHRoZSBrZXlib2FyZCBhcHBlYXJpbmcgc2Nyb2xscyB0aGUgd2hvbGUgd29ya2JlbmNoIG91dCBvZiB2aWV3LCBhcyBhIHdvcmthcm91bmQgc2Nyb2xsIGJhY2sgaW50byB2aWV3ICMxMjEyMDZcblx0XHRcdGlmIChpc0lPUykge1xuXHRcdFx0XHRtYWluV2luZG93LnNjcm9sbFRvKDAsIDApO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFByZXZlbnQgdGhlIGJhY2svZm9yd2FyZCBnZXN0dXJlcyBpbiBtYWNPU1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmxheW91dFNlcnZpY2UubWFpbkNvbnRhaW5lciwgRXZlbnRUeXBlLldIRUVMLCBlID0+IGUucHJldmVudERlZmF1bHQoKSwgeyBwYXNzaXZlOiBmYWxzZSB9KSk7XG5cblx0XHQvLyBQcmV2ZW50IG5hdGl2ZSBjb250ZXh0IG1lbnVzIGluIHdlYlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmxheW91dFNlcnZpY2UubWFpbkNvbnRhaW5lciwgRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgZSA9PiBFdmVudEhlbHBlci5zdG9wKGUsIHRydWUpKSk7XG5cblx0XHQvLyBQcmV2ZW50IGRlZmF1bHQgbmF2aWdhdGlvbiBvbiBkcm9wXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMubGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyLCBFdmVudFR5cGUuRFJPUCwgZSA9PiBFdmVudEhlbHBlci5zdG9wKGUsIHRydWUpKSk7XG5cdH1cblxuXHRwcml2YXRlIG9uV2lsbFNodXRkb3duKCk6IHZvaWQge1xuXG5cdFx0Ly8gVHJ5IHRvIGRldGVjdCBzb21lIHVzZXIgaW50ZXJhY3Rpb24gd2l0aCB0aGUgd29ya2JlbmNoXG5cdFx0Ly8gd2hlbiBzaHV0ZG93biBoYXMgaGFwcGVuZWQgdG8gbm90IHNob3cgdGhlIGRpYWxvZyBlLmcuXG5cdFx0Ly8gd2hlbiBuYXZpZ2F0aW9uIHRha2VzIGEgbG9uZ2VyIHRpbWUuXG5cdFx0RXZlbnQudG9Qcm9taXNlKEV2ZW50LmFueShcblx0XHRcdEV2ZW50Lm9uY2UobmV3IERvbUVtaXR0ZXIobWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LCBFdmVudFR5cGUuS0VZX0RPV04sIHRydWUpLmV2ZW50KSxcblx0XHRcdEV2ZW50Lm9uY2UobmV3IERvbUVtaXR0ZXIobWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LCBFdmVudFR5cGUuTU9VU0VfRE9XTiwgdHJ1ZSkuZXZlbnQpXG5cdFx0KSkudGhlbihhc3luYyAoKSA9PiB7XG5cblx0XHRcdC8vIERlbGF5IHRoZSBkaWFsb2cgaW4gY2FzZSB0aGUgdXNlciBpbnRlcmFjdGVkXG5cdFx0XHQvLyB3aXRoIHRoZSBwYWdlIGJlZm9yZSBpdCB0cmFuc2l0aW9uZWQgYXdheVxuXHRcdFx0YXdhaXQgdGltZW91dCgzMDAwKTtcblxuXHRcdFx0Ly8gVGhpcyBzaG91bGQgbm9ybWFsbHkgbm90IGhhcHBlbiwgYnV0IGlmIGZvciBzb21lIHJlYXNvblxuXHRcdFx0Ly8gdGhlIHdvcmtiZW5jaCB3YXMgc2h1dGRvd24gd2hpbGUgdGhlIHBhZ2UgaXMgc3RpbGwgdGhlcmUsXG5cdFx0XHQvLyBpbmZvcm0gdGhlIHVzZXIgdGhhdCBvbmx5IGEgcmVsb2FkIGNhbiBicmluZyBiYWNrIGEgd29ya2luZ1xuXHRcdFx0Ly8gc3RhdGUuXG5cdFx0XHRhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UucHJvbXB0KHtcblx0XHRcdFx0dHlwZTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdzaHV0ZG93bkVycm9yJywgXCJBbiB1bmV4cGVjdGVkIGVycm9yIG9jY3VycmVkIHRoYXQgcmVxdWlyZXMgYSByZWxvYWQgb2YgdGhpcyBwYWdlLlwiKSxcblx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnc2h1dGRvd25FcnJvckRldGFpbCcsIFwiVGhlIHdvcmtiZW5jaCB3YXMgdW5leHBlY3RlZGx5IGRpc3Bvc2VkIHdoaWxlIHJ1bm5pbmcuXCIpLFxuXHRcdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKHsga2V5OiAncmVsb2FkJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmUmVsb2FkXCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiBtYWluV2luZG93LmxvY2F0aW9uLnJlbG9hZCgpIC8vIGRvIG5vdCB1c2UgYW55IHNlcnZpY2VzIGF0IHRoaXMgcG9pbnQgc2luY2UgdGhleSBhcmUgbGlrZWx5IG5vdCBmdW5jdGlvbmFsIGF0IHRoaXMgcG9pbnRcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGUoKTogdm9pZCB7XG5cblx0XHQvLyBIYW5kbGUgb3BlbiBjYWxsc1xuXHRcdHRoaXMuc2V0dXBPcGVuSGFuZGxlcnMoKTtcblxuXHRcdC8vIExhYmVsIGZvcm1hdHRpbmdcblx0XHR0aGlzLnJlZ2lzdGVyTGFiZWxGb3JtYXR0ZXJzKCk7XG5cblx0XHQvLyBDb21tYW5kc1xuXHRcdHRoaXMucmVnaXN0ZXJDb21tYW5kcygpO1xuXG5cdFx0Ly8gU21va2UgVGVzdCBEcml2ZXJcblx0XHR0aGlzLnNldHVwRHJpdmVyKCk7XG5cdH1cblxuXHRwcml2YXRlIHNldHVwRHJpdmVyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5lbmFibGVTbW9rZVRlc3REcml2ZXIpIHtcblx0XHRcdHJlZ2lzdGVyV2luZG93RHJpdmVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0dXBPcGVuSGFuZGxlcnMoKTogdm9pZCB7XG5cblx0XHQvLyBXZSBuZWVkIHRvIGlnbm9yZSB0aGUgYGJlZm9yZXVubG9hZGAgZXZlbnQgd2hpbGVcblx0XHQvLyB3ZSBoYW5kbGUgZXh0ZXJuYWwgbGlua3MgdG8gb3BlbiBzcGVjaWZpY2FsbHkgZm9yXG5cdFx0Ly8gdGhlIGNhc2Ugb2YgYXBwbGljYXRpb24gcHJvdG9jb2xzIHRoYXQgZS5nLiBpbnZva2Vcblx0XHQvLyB2c2NvZGUgaXRzZWxmLiBXZSBkbyBub3Qgd2FudCB0byBvcGVuIHRoZXNlIGxpbmtzXG5cdFx0Ly8gaW4gYSBuZXcgd2luZG93IGJlY2F1c2UgdGhhdCB3b3VsZCBsZWF2ZSBhIGJsYW5rXG5cdFx0Ly8gd2luZG93IHRvIHRoZSB1c2VyLCBidXQgdXNpbmcgYHdpbmRvdy5sb2NhdGlvbi5ocmVmYFxuXHRcdC8vIHdpbGwgdHJpZ2dlciB0aGUgYGJlZm9yZXVubG9hZGAuXG5cdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLnNldERlZmF1bHRFeHRlcm5hbE9wZW5lcih7XG5cdFx0XHRvcGVuRXh0ZXJuYWw6IGFzeW5jIChocmVmOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0bGV0IGlzQWxsb3dlZE9wZW5lciA9IGZhbHNlO1xuXHRcdFx0XHRpZiAodGhpcy5icm93c2VyRW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnM/Lm9wZW5lckFsbG93ZWRFeHRlcm5hbFVybFByZWZpeGVzKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB0cnVzdGVkUG9wdXBQcmVmaXggb2YgdGhpcy5icm93c2VyRW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnMub3BlbmVyQWxsb3dlZEV4dGVybmFsVXJsUHJlZml4ZXMpIHtcblx0XHRcdFx0XHRcdGlmIChocmVmLnN0YXJ0c1dpdGgodHJ1c3RlZFBvcHVwUHJlZml4KSkge1xuXHRcdFx0XHRcdFx0XHRpc0FsbG93ZWRPcGVuZXIgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBIVFRQKHMpOiBvcGVuIGluIG5ldyB3aW5kb3cgYW5kIGRlYWwgd2l0aCBwb3RlbnRpYWwgcG9wdXAgYmxvY2tlcnNcblx0XHRcdFx0aWYgKG1hdGNoZXNTY2hlbWUoaHJlZiwgU2NoZW1hcy5odHRwKSB8fCBtYXRjaGVzU2NoZW1lKGhyZWYsIFNjaGVtYXMuaHR0cHMpKSB7XG5cdFx0XHRcdFx0aWYgKGlzU2FmYXJpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBvcGVuZWQgPSB3aW5kb3dPcGVuV2l0aFN1Y2Nlc3MoaHJlZiwgIWlzQWxsb3dlZE9wZW5lcik7XG5cdFx0XHRcdFx0XHRpZiAoIW9wZW5lZCkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UucHJvbXB0KHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCd1bmFibGVUb09wZW5FeHRlcm5hbCcsIFwiVGhlIGJyb3dzZXIgYmxvY2tlZCBvcGVuaW5nIGEgbmV3IHRhYiBvciB3aW5kb3cuIFByZXNzICdSZXRyeScgdG8gdHJ5IGFnYWluLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRjdXN0b206IHtcblx0XHRcdFx0XHRcdFx0XHRcdG1hcmtkb3duRGV0YWlsczogW3sgbWFya2Rvd246IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgndW5hYmxlVG9PcGVuV2luZG93RGV0YWlsJywgXCJQbGVhc2UgYWxsb3cgcG9wLXVwcyBmb3IgdGhpcyB3ZWJzaXRlIGluIHlvdXIgW2Jyb3dzZXIgc2V0dGluZ3NdKHswfSkuXCIsICdodHRwczovL2FrYS5tcy9hbGxvdy12c2NvZGUtcG9wdXAnKSwgdHJ1ZSkgfV1cblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKHsga2V5OiAncmV0cnknLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZSZXRyeVwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiBpc0FsbG93ZWRPcGVuZXIgPyB3aW5kb3dPcGVuUG9wdXAoaHJlZikgOiB3aW5kb3dPcGVuTm9PcGVuZXIoaHJlZilcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdGNhbmNlbEJ1dHRvbjogdHJ1ZVxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aWYgKGlzQWxsb3dlZE9wZW5lcikge1xuXHRcdFx0XHRcdFx0XHR3aW5kb3dPcGVuUG9wdXAoaHJlZik7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR3aW5kb3dPcGVuTm9PcGVuZXIoaHJlZik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQW55dGhpbmcgZWxzZTogc2V0IGxvY2F0aW9uIHRvIHRyaWdnZXIgcHJvdG9jb2wgaGFuZGxlciBpbiB0aGUgYnJvd3NlclxuXHRcdFx0XHQvLyBidXQgbWFrZSBzdXJlIHRvIHNpZ25hbCB0aGlzIGFzIGFuIGV4cGVjdGVkIHVubG9hZCBhbmQgZGlzYWJsZSB1bmxvYWRcblx0XHRcdFx0Ly8gaGFuZGxpbmcgZXhwbGljaXRseSB0byBwcmV2ZW50IHRoZSB3b3JrYmVuY2ggZnJvbSBnb2luZyBkb3duLlxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBpbnZva2VQcm90b2NvbEhhbmRsZXIgPSAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLmxpZmVjeWNsZVNlcnZpY2Uud2l0aEV4cGVjdGVkU2h1dGRvd24oeyBkaXNhYmxlU2h1dGRvd25IYW5kbGluZzogdHJ1ZSB9LCAoKSA9PiBtYWluV2luZG93LmxvY2F0aW9uLmhyZWYgPSBocmVmKTtcblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0aW52b2tlUHJvdG9jb2xIYW5kbGVyKCk7XG5cblx0XHRcdFx0XHRjb25zdCBzaG93UHJvdG9jb2xVcmxPcGVuZWREaWFsb2cgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCB7IGRvd25sb2FkVXJsIH0gPSB0aGlzLnByb2R1Y3RTZXJ2aWNlO1xuXHRcdFx0XHRcdFx0bGV0IGRldGFpbDogc3RyaW5nO1xuXG5cdFx0XHRcdFx0XHRjb25zdCBidXR0b25zOiBJUHJvbXB0QnV0dG9uPHZvaWQ+W10gPSBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoeyBrZXk6ICdvcGVuRXh0ZXJuYWxEaWFsb2dCdXR0b25SZXRyeS52MicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlRyeSBBZ2FpblwiKSxcblx0XHRcdFx0XHRcdFx0XHRydW46ICgpID0+IGludm9rZVByb3RvY29sSGFuZGxlcigpXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdF07XG5cblx0XHRcdFx0XHRcdGlmIChkb3dubG9hZFVybCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdGRldGFpbCA9IGxvY2FsaXplKFxuXHRcdFx0XHRcdFx0XHRcdCdvcGVuRXh0ZXJuYWxEaWFsb2dEZXRhaWwudjInLFxuXHRcdFx0XHRcdFx0XHRcdFwiV2UgbGF1bmNoZWQgezB9IG9uIHlvdXIgY29tcHV0ZXIuXFxuXFxuSWYgezF9IGRpZCBub3QgbGF1bmNoLCB0cnkgYWdhaW4gb3IgaW5zdGFsbCBpdCBiZWxvdy5cIixcblx0XHRcdFx0XHRcdFx0XHR0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nLFxuXHRcdFx0XHRcdFx0XHRcdHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmdcblx0XHRcdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdFx0XHRidXR0b25zLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSh7IGtleTogJ29wZW5FeHRlcm5hbERpYWxvZ0J1dHRvbkluc3RhbGwudjMnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZJbnN0YWxsXCIpLFxuXHRcdFx0XHRcdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKGRvd25sb2FkVXJsKSk7XG5cblx0XHRcdFx0XHRcdFx0XHRcdC8vIFJlLXNob3cgdGhlIGRpYWxvZyBzbyB0aGF0IHRoZSB1c2VyIGNhbiBjb21lIGJhY2sgYWZ0ZXIgaW5zdGFsbGluZyBhbmQgdHJ5IGFnYWluXG5cdFx0XHRcdFx0XHRcdFx0XHRzaG93UHJvdG9jb2xVcmxPcGVuZWREaWFsb2coKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0ZGV0YWlsID0gbG9jYWxpemUoXG5cdFx0XHRcdFx0XHRcdFx0J29wZW5FeHRlcm5hbERpYWxvZ0RldGFpbE5vSW5zdGFsbCcsXG5cdFx0XHRcdFx0XHRcdFx0XCJXZSBsYXVuY2hlZCB7MH0gb24geW91ciBjb21wdXRlci5cXG5cXG5JZiB7MX0gZGlkIG5vdCBsYXVuY2gsIHRyeSBhZ2FpbiBiZWxvdy5cIixcblx0XHRcdFx0XHRcdFx0XHR0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nLFxuXHRcdFx0XHRcdFx0XHRcdHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmdcblx0XHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gV2hpbGUgdGhpcyBkaWFsb2cgc2hvd3MsIGNsb3NpbmcgdGhlIHRhYiB3aWxsIG5vdCBkaXNwbGF5IGEgY29uZmlybWF0aW9uIGRpYWxvZ1xuXHRcdFx0XHRcdFx0Ly8gdG8gYXZvaWQgc2hvd2luZyB0aGUgdXNlciB0d28gZGlhbG9ncyBhdCBvbmNlXG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmhvc3RTZXJ2aWNlLndpdGhFeHBlY3RlZFNodXRkb3duKCgpID0+IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnb3BlbkV4dGVybmFsRGlhbG9nVGl0bGUnLCBcIkFsbCBkb25lLiBZb3UgY2FuIGNsb3NlIHRoaXMgdGFiIG5vdy5cIiksXG5cdFx0XHRcdFx0XHRcdGRldGFpbCxcblx0XHRcdFx0XHRcdFx0YnV0dG9ucyxcblx0XHRcdFx0XHRcdFx0Y2FuY2VsQnV0dG9uOiB0cnVlXG5cdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdC8vIFdlIGNhbm5vdCBrbm93IHdoZXRoZXIgdGhlIHByb3RvY29sIGhhbmRsZXIgc3VjY2VlZGVkLlxuXHRcdFx0XHRcdC8vIERpc3BsYXkgZ3VpZGFuY2UgaW4gY2FzZSBpdCBkaWQgbm90LCBlLmcuIHRoZSBhcHAgaXMgbm90IGluc3RhbGxlZCBsb2NhbGx5LlxuXHRcdFx0XHRcdGlmIChtYXRjaGVzU2NoZW1lKGhyZWYsIHRoaXMucHJvZHVjdFNlcnZpY2UudXJsUHJvdG9jb2wpKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCBzaG93UHJvdG9jb2xVcmxPcGVuZWREaWFsb2coKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMYWJlbEZvcm1hdHRlcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYWJlbFNlcnZpY2UucmVnaXN0ZXJGb3JtYXR0ZXIoe1xuXHRcdFx0c2NoZW1lOiBTY2hlbWFzLnZzY29kZVVzZXJEYXRhLFxuXHRcdFx0cHJpb3JpdHk6IHRydWUsXG5cdFx0XHRmb3JtYXR0aW5nOiB7XG5cdFx0XHRcdGxhYmVsOiAnKFNldHRpbmdzKSAke3BhdGh9Jyxcblx0XHRcdFx0c2VwYXJhdG9yOiAnLycsXG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckNvbW1hbmRzKCk6IHZvaWQge1xuXG5cdFx0Ly8gQWxsb3cgZXh0ZW5zaW9ucyB0byByZXF1ZXN0IFVTQiBkZXZpY2VzIGluIFdlYlxuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCd3b3JrYmVuY2guZXhwZXJpbWVudGFsLnJlcXVlc3RVc2JEZXZpY2UnLCBhc3luYyAoX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBvcHRpb25zPzogeyBmaWx0ZXJzPzogdW5rbm93bltdIH0pOiBQcm9taXNlPFVzYkRldmljZURhdGEgfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdHJldHVybiByZXF1ZXN0VXNiRGV2aWNlKG9wdGlvbnMpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQWxsb3cgZXh0ZW5zaW9ucyB0byByZXF1ZXN0IFNlcmlhbCBkZXZpY2VzIGluIFdlYlxuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCd3b3JrYmVuY2guZXhwZXJpbWVudGFsLnJlcXVlc3RTZXJpYWxQb3J0JywgYXN5bmMgKF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgb3B0aW9ucz86IHsgZmlsdGVycz86IHVua25vd25bXSB9KTogUHJvbWlzZTxTZXJpYWxQb3J0RGF0YSB8IHVuZGVmaW5lZD4gPT4ge1xuXHRcdFx0cmV0dXJuIHJlcXVlc3RTZXJpYWxQb3J0KG9wdGlvbnMpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQWxsb3cgZXh0ZW5zaW9ucyB0byByZXF1ZXN0IEhJRCBkZXZpY2VzIGluIFdlYlxuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCd3b3JrYmVuY2guZXhwZXJpbWVudGFsLnJlcXVlc3RIaWREZXZpY2UnLCBhc3luYyAoX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBvcHRpb25zPzogeyBmaWx0ZXJzPzogdW5rbm93bltdIH0pOiBQcm9taXNlPEhpZERldmljZURhdGEgfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdHJldHVybiByZXF1ZXN0SGlkRGV2aWNlKG9wdGlvbnMpO1xuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsVUFBVSxxQkFBcUI7QUFDeEMsU0FBUyx1QkFBdUIsYUFBYSxXQUFXLFdBQVcsZUFBZSxZQUFZLGlCQUFpQixhQUFhLG9CQUFvQixpQkFBaUIsNkJBQTZCO0FBQzlMLFNBQVMsa0JBQWtCO0FBQzNCLFNBQXdCLGtCQUFrQixtQkFBbUIsd0JBQXVEO0FBQ3BILFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxZQUF5QixTQUFTLG9CQUFvQjtBQUMvRCxTQUFTLGVBQWUsZUFBZTtBQUN2QyxTQUFTLE9BQU8sbUJBQW1CO0FBQ25DLE9BQU8sY0FBYztBQUNyQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxzQkFBcUM7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QUFTO0FBQUEsZ0JBQ1I7QUFBQSxnQkFDQTtBQUFBLGdCQUNBLEtBQUssZUFBZTtBQUFBLGdCQUNwQixLQUFLLGVBQWU7QUFBQSxjQUNyQjtBQUVBLHNCQUFRLEtBQUs7QUFBQSxnQkFDWixPQUFPLFNBQVMsRUFBRSxLQUFLLHNDQUFzQyxTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxXQUFXO0FBQUEsZ0JBQzlHLEtBQUssWUFBWTtBQUNoQix3QkFBTSxLQUFLLGNBQWMsS0FBSyxJQUFJLE1BQU0sV0FBVyxDQUFDO0FBR3BELDhDQUE0QjtBQUFBLGdCQUM3QjtBQUFBLGNBQ0QsQ0FBQztBQUFBLFlBQ0YsT0FBTztBQUNOLHVCQUFTO0FBQUEsZ0JBQ1I7QUFBQSxnQkFDQTtBQUFBLGdCQUNBLEtBQUssZUFBZTtBQUFBLGdCQUNwQixLQUFLLGVBQWU7QUFBQSxjQUNyQjtBQUFBLFlBQ0Q7QUFJQSxrQkFBTSxLQUFLLFlBQVkscUJBQXFCLE1BQU0sS0FBSyxjQUFjLE9BQU87QUFBQSxjQUMzRSxNQUFNLFNBQVM7QUFBQSxjQUNmLFNBQVMsU0FBUywyQkFBMkIsdUNBQXVDO0FBQUEsY0FDcEY7QUFBQSxjQUNBO0FBQUEsY0FDQSxjQUFjO0FBQUEsWUFDZixDQUFDLENBQUM7QUFBQSxVQUNIO0FBSUEsY0FBSSxjQUFjLE1BQU0sS0FBSyxlQUFlLFdBQVcsR0FBRztBQUN6RCxrQkFBTSw0QkFBNEI7QUFBQSxVQUNuQztBQUFBLFFBQ0Q7QUFFQSxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLDBCQUFnQztBQUN2QyxTQUFLLFVBQVUsS0FBSyxhQUFhLGtCQUFrQjtBQUFBLE1BQ2xELFFBQVEsUUFBUTtBQUFBLE1BQ2hCLFVBQVU7QUFBQSxNQUNWLFlBQVk7QUFBQSxRQUNYLE9BQU87QUFBQSxRQUNQLFdBQVc7QUFBQSxNQUNaO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSxtQkFBeUI7QUFHaEMscUJBQWlCLGdCQUFnQiwyQ0FBMkMsT0FBTyxXQUE2QixZQUEwRTtBQUN6TCxhQUFPLGlCQUFpQixPQUFPO0FBQUEsSUFDaEMsQ0FBQztBQUdELHFCQUFpQixnQkFBZ0IsNENBQTRDLE9BQU8sV0FBNkIsWUFBMkU7QUFDM0wsYUFBTyxrQkFBa0IsT0FBTztBQUFBLElBQ2pDLENBQUM7QUFHRCxxQkFBaUIsZ0JBQWdCLDJDQUEyQyxPQUFPLFdBQTZCLFlBQTBFO0FBQ3pMLGFBQU8saUJBQWlCLE9BQU87QUFBQSxJQUNoQyxDQUFDO0FBQUEsRUFDRjtBQUNEO0FBdlBhLGdCQUFOO0FBQUEsRUFHSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBWlU7IiwKICAibmFtZXMiOiBbInRpbWVvdXQiLCAiYXJncyJdCn0K
