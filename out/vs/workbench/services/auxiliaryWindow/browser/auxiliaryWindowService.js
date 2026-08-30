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
import { getZoomLevel } from "../../../../base/browser/browser.js";
import { $, Dimension, EventHelper, EventType, ModifierKeyEmitter, addDisposableListener, copyAttributes, createLinkElement, createMetaElement, getActiveWindow, getClientArea, getWindowId, isHTMLElement, position, registerWindow, sharedMutationObserver, trackAttributes } from "../../../../base/browser/dom.js";
import { cloneGlobalStylesheets, isGlobalStylesheet } from "../../../../base/browser/domStylesheets.js";
import { ensureCodeWindow, mainWindow } from "../../../../base/browser/window.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { Barrier } from "../../../../base/common/async.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { mark } from "../../../../base/common/performance.js";
import { isFirefox, isWeb } from "../../../../base/common/platform.js";
import Severity from "../../../../base/common/severity.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { DEFAULT_AUX_WINDOW_SIZE, WindowMinimumSize } from "../../../../platform/window/common/window.js";
import { BaseWindow } from "../../../browser/window.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { IHostService } from "../../host/browser/host.js";
import { IWorkbenchLayoutService } from "../../layout/browser/layoutService.js";
const IAuxiliaryWindowService = createDecorator("auxiliaryWindowService");
var AuxiliaryWindowMode = /* @__PURE__ */ ((AuxiliaryWindowMode2) => {
  AuxiliaryWindowMode2[AuxiliaryWindowMode2["Maximized"] = 0] = "Maximized";
  AuxiliaryWindowMode2[AuxiliaryWindowMode2["Normal"] = 1] = "Normal";
  AuxiliaryWindowMode2[AuxiliaryWindowMode2["Fullscreen"] = 2] = "Fullscreen";
  return AuxiliaryWindowMode2;
})(AuxiliaryWindowMode || {});
const DEFAULT_AUX_WINDOW_DIMENSIONS = new Dimension(DEFAULT_AUX_WINDOW_SIZE.width, DEFAULT_AUX_WINDOW_SIZE.height);
let AuxiliaryWindow = class extends BaseWindow {
  constructor(window, container, stylesHaveLoaded, configurationService, hostService, environmentService, contextMenuService, layoutService) {
    super(window, void 0, hostService, environmentService, contextMenuService, layoutService);
    this.window = window;
    this.container = container;
    this.configurationService = configurationService;
    this._onWillLayout = this._register(new Emitter());
    this.onWillLayout = this._onWillLayout.event;
    this._onDidLayout = this._register(new Emitter());
    this.onDidLayout = this._onDidLayout.event;
    this._onBeforeUnload = this._register(new Emitter());
    this.onBeforeUnload = this._onBeforeUnload.event;
    this._onUnload = this._register(new Emitter());
    this.onUnload = this._onUnload.event;
    this._onWillDispose = this._register(new Emitter());
    this.onWillDispose = this._onWillDispose.event;
    this.compact = false;
    this.whenStylesHaveLoaded = stylesHaveLoaded.wait().then(() => void 0);
    this.registerListeners();
  }
  updateOptions(options) {
    this.compact = options.compact;
  }
  async setBounds(bounds) {
    this.window.moveTo(bounds.x, bounds.y);
    this.window.resizeTo(bounds.width, bounds.height);
  }
  registerListeners() {
    this._register(addDisposableListener(this.window, EventType.BEFORE_UNLOAD, (e) => this.handleBeforeUnload(e)));
    this._register(addDisposableListener(this.window, EventType.UNLOAD, () => this.handleUnload()));
    this._register(addDisposableListener(this.window, "unhandledrejection", (e) => {
      onUnexpectedError(e.reason);
      e.preventDefault();
    }));
    this._register(addDisposableListener(this.window, EventType.RESIZE, () => this.layout()));
    this._register(addDisposableListener(this.container, EventType.SCROLL, () => this.container.scrollTop = 0));
    if (isWeb) {
      this._register(addDisposableListener(this.container, EventType.DROP, (e) => EventHelper.stop(e, true)));
      this._register(addDisposableListener(this.container, EventType.WHEEL, (e) => e.preventDefault(), { passive: false }));
      this._register(addDisposableListener(this.container, EventType.CONTEXT_MENU, (e) => EventHelper.stop(e, true)));
    } else {
      this._register(addDisposableListener(this.window.document.body, EventType.DRAG_OVER, (e) => EventHelper.stop(e)));
      this._register(addDisposableListener(this.window.document.body, EventType.DROP, (e) => EventHelper.stop(e)));
    }
  }
  handleBeforeUnload(e) {
    let veto;
    this._onBeforeUnload.fire({
      veto(reason) {
        if (reason) {
          veto = reason;
        }
      }
    });
    if (veto) {
      this.handleVetoBeforeClose(e, veto);
      return;
    }
    const confirmBeforeCloseSetting = this.configurationService.getValue("window.confirmBeforeClose");
    const confirmBeforeClose = confirmBeforeCloseSetting === "always" || confirmBeforeCloseSetting === "keyboardOnly" && ModifierKeyEmitter.getInstance().isModifierPressed;
    if (confirmBeforeClose) {
      this.confirmBeforeClose(e);
    }
  }
  handleVetoBeforeClose(e, reason) {
    this.preventUnload(e);
  }
  preventUnload(e) {
    e.preventDefault();
    e.returnValue = localize("lifecycleVeto", "Changes that you made may not be saved. Please check press 'Cancel' and try again.");
  }
  confirmBeforeClose(e) {
    this.preventUnload(e);
  }
  handleUnload() {
    this._onUnload.fire();
  }
  layout() {
    const dimension = getClientArea(this.window.document.body, DEFAULT_AUX_WINDOW_DIMENSIONS, this.container);
    this._onWillLayout.fire(dimension);
    this._onDidLayout.fire(dimension);
  }
  createState() {
    return {
      bounds: {
        x: this.window.screenX,
        y: this.window.screenY,
        width: this.window.outerWidth,
        height: this.window.outerHeight
      },
      zoomLevel: getZoomLevel(this.window),
      compact: this.compact
    };
  }
  dispose() {
    if (this._store.isDisposed) {
      return;
    }
    this._onWillDispose.fire();
    super.dispose();
  }
};
AuxiliaryWindow = __decorateClass([
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IHostService),
  __decorateParam(5, IWorkbenchEnvironmentService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IWorkbenchLayoutService)
], AuxiliaryWindow);
let BrowserAuxiliaryWindowService = class extends Disposable {
  constructor(layoutService, dialogService, configurationService, telemetryService, hostService, environmentService, contextMenuService) {
    super();
    this.layoutService = layoutService;
    this.dialogService = dialogService;
    this.configurationService = configurationService;
    this.telemetryService = telemetryService;
    this.hostService = hostService;
    this.environmentService = environmentService;
    this.contextMenuService = contextMenuService;
    // start from the main window ID + 1
    this._onDidOpenAuxiliaryWindow = this._register(new Emitter());
    this.onDidOpenAuxiliaryWindow = this._onDidOpenAuxiliaryWindow.event;
    this.windows = /* @__PURE__ */ new Map();
  }
  async open(options) {
    mark("code/auxiliaryWindow/willOpen");
    const targetWindow = await this.openWindow(options);
    if (!targetWindow) {
      throw new Error(localize("unableToOpenWindowError", "Unable to open a new window."));
    }
    const resolvedWindowId = await this.resolveWindowId(targetWindow);
    ensureCodeWindow(targetWindow, resolvedWindowId);
    const containerDisposables = new DisposableStore();
    const { container, stylesLoaded } = this.createContainer(targetWindow, containerDisposables, options);
    const auxiliaryWindow = this.createAuxiliaryWindow(targetWindow, container, stylesLoaded);
    auxiliaryWindow.updateOptions({ compact: options?.compact ?? false });
    const registryDisposables = new DisposableStore();
    this.windows.set(targetWindow.vscodeWindowId, auxiliaryWindow);
    registryDisposables.add(toDisposable(() => this.windows.delete(targetWindow.vscodeWindowId)));
    const eventDisposables = new DisposableStore();
    Event.once(auxiliaryWindow.onWillDispose)(() => {
      targetWindow.close();
      containerDisposables.dispose();
      registryDisposables.dispose();
      eventDisposables.dispose();
    });
    registryDisposables.add(registerWindow(targetWindow));
    this._onDidOpenAuxiliaryWindow.fire({ window: auxiliaryWindow, disposables: eventDisposables });
    mark("code/auxiliaryWindow/didOpen");
    this.telemetryService.publicLog2("auxiliaryWindowOpen", { bounds: !!options?.bounds });
    return auxiliaryWindow;
  }
  createAuxiliaryWindow(targetWindow, container, stylesLoaded) {
    return new AuxiliaryWindow(targetWindow, container, stylesLoaded, this.configurationService, this.hostService, this.environmentService, this.contextMenuService, this.layoutService);
  }
  async openWindow(options) {
    const activeWindow = getActiveWindow();
    const activeWindowBounds = {
      x: activeWindow.screenX,
      y: activeWindow.screenY,
      width: activeWindow.outerWidth,
      height: activeWindow.outerHeight
    };
    const defaultSize = DEFAULT_AUX_WINDOW_SIZE;
    const width = options?.frameless ? options?.bounds?.width ?? defaultSize.width : Math.max(options?.bounds?.width ?? defaultSize.width, WindowMinimumSize.WIDTH);
    const height = options?.frameless ? options?.bounds?.height ?? defaultSize.height : Math.max(options?.bounds?.height ?? defaultSize.height, WindowMinimumSize.HEIGHT);
    let newWindowBounds = {
      x: options?.bounds?.x ?? Math.max(activeWindowBounds.x + activeWindowBounds.width / 2 - width / 2, 0),
      y: options?.bounds?.y ?? Math.max(activeWindowBounds.y + activeWindowBounds.height / 2 - height / 2, 0),
      width,
      height
    };
    if (!options?.bounds && newWindowBounds.x === activeWindowBounds.x && newWindowBounds.y === activeWindowBounds.y) {
      newWindowBounds = {
        ...newWindowBounds,
        x: newWindowBounds.x + 30,
        y: newWindowBounds.y + 30
      };
    }
    const features = coalesce([
      "popup=yes",
      `left=${newWindowBounds.x}`,
      `top=${newWindowBounds.y}`,
      `width=${newWindowBounds.width}`,
      `height=${newWindowBounds.height}`,
      // non-standard properties
      options?.nativeTitlebar ? "window-native-titlebar=yes" : void 0,
      options?.disableFullscreen ? "window-disable-fullscreen=yes" : void 0,
      options?.alwaysOnTop ? "window-always-on-top=yes" : void 0,
      options?.mode === 0 /* Maximized */ ? "window-maximized=yes" : void 0,
      options?.mode === 2 /* Fullscreen */ ? "window-fullscreen=yes" : void 0,
      options?.frameless ? "window-frameless=yes" : void 0,
      options?.transparent ? "window-transparent=yes" : void 0,
      options?.notResizable ? "window-not-resizable=yes" : void 0,
      options?.disableMaximize ? "window-disable-maximize=yes" : void 0,
      options?.noBackgroundThrottling ? "window-no-background-throttling=yes" : void 0,
      options?.backgroundColor && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(options.backgroundColor) ? `window-background-color=${options.backgroundColor}` : void 0
    ]);
    const auxiliaryWindow = mainWindow.open(isFirefox ? "" : "about:blank", void 0, features.join(","));
    if (!auxiliaryWindow && isWeb) {
      return (await this.dialogService.prompt({
        type: Severity.Warning,
        message: localize("unableToOpenWindow", "The browser blocked opening a new window. Press 'Retry' to try again."),
        custom: {
          markdownDetails: [{ markdown: new MarkdownString(localize("unableToOpenWindowDetail", "Please allow pop-ups for this website in your [browser settings]({0}).", "https://aka.ms/allow-vscode-popup"), true) }]
        },
        buttons: [
          {
            label: localize({ key: "retry", comment: ["&& denotes a mnemonic"] }, "&&Retry"),
            run: () => this.openWindow(options)
          }
        ],
        cancelButton: true
      })).result;
    }
    return auxiliaryWindow?.window;
  }
  async resolveWindowId(auxiliaryWindow) {
    return BrowserAuxiliaryWindowService.WINDOW_IDS++;
  }
  createContainer(auxiliaryWindow, disposables, options) {
    auxiliaryWindow.document.createElement = function() {
      throw new Error('Not allowed to create elements in child window JavaScript context. Always use the main window so that "xyz instanceof HTMLElement" continues to work.');
    };
    this.applyMeta(auxiliaryWindow);
    const { stylesLoaded } = this.applyCSS(auxiliaryWindow, disposables);
    const container = this.applyHTML(auxiliaryWindow, disposables);
    return { stylesLoaded, container };
  }
  applyMeta(auxiliaryWindow) {
    for (const metaTag of ['meta[charset="utf-8"]', 'meta[http-equiv="Content-Security-Policy"]', 'meta[name="viewport"]', 'meta[name="theme-color"]']) {
      const metaElement = mainWindow.document.querySelector(metaTag);
      if (metaElement) {
        const clonedMetaElement = createMetaElement(auxiliaryWindow.document.head);
        copyAttributes(metaElement, clonedMetaElement);
        if (metaTag === 'meta[http-equiv="Content-Security-Policy"]') {
          const content = clonedMetaElement.getAttribute("content");
          if (content) {
            clonedMetaElement.setAttribute("content", content.replace(/(script-src[^\;]*)/, `script-src 'none'`));
          }
        }
      }
    }
    const originalIconLinkTag = mainWindow.document.querySelector('link[rel="icon"]');
    if (originalIconLinkTag) {
      const icon = createLinkElement(auxiliaryWindow.document.head);
      copyAttributes(originalIconLinkTag, icon);
    }
  }
  applyCSS(auxiliaryWindow, disposables) {
    mark("code/auxiliaryWindow/willApplyCSS");
    const mapOriginalToClone = /* @__PURE__ */ new Map();
    const stylesLoaded = new Barrier();
    stylesLoaded.wait().then(() => mark("code/auxiliaryWindow/didLoadCSSStyles"));
    const pendingLinksDisposables = disposables.add(new DisposableStore());
    let pendingLinksToSettle = 0;
    function onLinkSettled() {
      if (--pendingLinksToSettle === 0) {
        pendingLinksDisposables.dispose();
        stylesLoaded.open();
      }
    }
    function cloneNode(originalNode) {
      if (isGlobalStylesheet(originalNode)) {
        return;
      }
      const clonedNode = auxiliaryWindow.document.head.appendChild(originalNode.cloneNode(true));
      if (originalNode.tagName.toLowerCase() === "link") {
        pendingLinksToSettle++;
        pendingLinksDisposables.add(addDisposableListener(clonedNode, "load", onLinkSettled));
        pendingLinksDisposables.add(addDisposableListener(clonedNode, "error", onLinkSettled));
      }
      mapOriginalToClone.set(originalNode, clonedNode);
    }
    pendingLinksToSettle++;
    try {
      for (const originalNode of mainWindow.document.head.querySelectorAll('link[rel="stylesheet"], style')) {
        cloneNode(originalNode);
      }
    } finally {
      onLinkSettled();
    }
    disposables.add(cloneGlobalStylesheets(auxiliaryWindow));
    disposables.add(sharedMutationObserver.observe(mainWindow.document.head, disposables, { childList: true, subtree: true })((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== "childList" || // only interested in added/removed nodes
        mutation.target.nodeName.toLowerCase() === "title" || // skip over title changes that happen frequently
        mutation.target.nodeName.toLowerCase() === "script" || // block <script> changes that are unsupported anyway
        mutation.target.nodeName.toLowerCase() === "meta") {
          continue;
        }
        for (const node of mutation.addedNodes) {
          if (isHTMLElement(node) && (node.tagName.toLowerCase() === "style" || node.tagName.toLowerCase() === "link")) {
            cloneNode(node);
          } else if (node.nodeType === Node.TEXT_NODE && node.parentNode) {
            const clonedNode = mapOriginalToClone.get(node.parentNode);
            if (clonedNode) {
              clonedNode.textContent = node.textContent;
            }
          }
        }
        for (const node of mutation.removedNodes) {
          const clonedNode = mapOriginalToClone.get(node);
          if (clonedNode) {
            clonedNode.parentNode?.removeChild(clonedNode);
            mapOriginalToClone.delete(node);
          }
        }
      }
    }));
    mark("code/auxiliaryWindow/didApplyCSS");
    return { stylesLoaded };
  }
  applyHTML(auxiliaryWindow, disposables) {
    mark("code/auxiliaryWindow/willApplyHTML");
    const container = $("div", { role: "application" });
    position(container, 0, 0, 0, 0, "relative");
    container.style.display = "flex";
    container.style.height = "100%";
    container.style.flexDirection = "column";
    auxiliaryWindow.document.body.append(container);
    disposables.add(trackAttributes(mainWindow.document.documentElement, auxiliaryWindow.document.documentElement));
    disposables.add(trackAttributes(mainWindow.document.body, auxiliaryWindow.document.body));
    disposables.add(trackAttributes(this.layoutService.mainContainer, container, ["class"]));
    mark("code/auxiliaryWindow/didApplyHTML");
    return container;
  }
  getWindow(windowId) {
    return this.windows.get(windowId);
  }
};
BrowserAuxiliaryWindowService.WINDOW_IDS = getWindowId(mainWindow) + 1;
BrowserAuxiliaryWindowService = __decorateClass([
  __decorateParam(0, IWorkbenchLayoutService),
  __decorateParam(1, IDialogService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IHostService),
  __decorateParam(5, IWorkbenchEnvironmentService),
  __decorateParam(6, IContextMenuService)
], BrowserAuxiliaryWindowService);
registerSingleton(IAuxiliaryWindowService, BrowserAuxiliaryWindowService, InstantiationType.Delayed);
export {
  AuxiliaryWindow,
  AuxiliaryWindowMode,
  BrowserAuxiliaryWindowService,
  IAuxiliaryWindowService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxhdXhpbGlhcnlXaW5kb3dcXGJyb3dzZXJcXGF1eGlsaWFyeVdpbmRvd1NlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBnZXRab29tTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvYnJvd3Nlci5qcyc7XG5pbXBvcnQgeyAkLCBEaW1lbnNpb24sIEV2ZW50SGVscGVyLCBFdmVudFR5cGUsIE1vZGlmaWVyS2V5RW1pdHRlciwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBjb3B5QXR0cmlidXRlcywgY3JlYXRlTGlua0VsZW1lbnQsIGNyZWF0ZU1ldGFFbGVtZW50LCBnZXRBY3RpdmVXaW5kb3csIGdldENsaWVudEFyZWEsIGdldFdpbmRvd0lkLCBpc0hUTUxFbGVtZW50LCBwb3NpdGlvbiwgcmVnaXN0ZXJXaW5kb3csIHNoYXJlZE11dGF0aW9uT2JzZXJ2ZXIsIHRyYWNrQXR0cmlidXRlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgY2xvbmVHbG9iYWxTdHlsZXNoZWV0cywgaXNHbG9iYWxTdHlsZXNoZWV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbVN0eWxlc2hlZXRzLmpzJztcbmltcG9ydCB7IENvZGVXaW5kb3csIGVuc3VyZUNvZGVXaW5kb3csIG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IEJhcnJpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG1hcmsgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wZXJmb3JtYW5jZS5qcyc7XG5pbXBvcnQgeyBpc0ZpcmVmb3gsIGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IERFRkFVTFRfQVVYX1dJTkRPV19TSVpFLCBJUmVjdGFuZ2xlLCBXaW5kb3dNaW5pbXVtU2l6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IEJhc2VXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuXG5leHBvcnQgY29uc3QgSUF1eGlsaWFyeVdpbmRvd1NlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUF1eGlsaWFyeVdpbmRvd1NlcnZpY2U+KCdhdXhpbGlhcnlXaW5kb3dTZXJ2aWNlJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUF1eGlsaWFyeVdpbmRvd09wZW5FdmVudCB7XG5cdHJlYWRvbmx5IHdpbmRvdzogSUF1eGlsaWFyeVdpbmRvdztcblx0cmVhZG9ubHkgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuZXhwb3J0IGVudW0gQXV4aWxpYXJ5V2luZG93TW9kZSB7XG5cdE1heGltaXplZCxcblx0Tm9ybWFsLFxuXHRGdWxsc2NyZWVuXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUF1eGlsaWFyeVdpbmRvd09wZW5PcHRpb25zIHtcblx0cmVhZG9ubHkgYm91bmRzPzogUGFydGlhbDxJUmVjdGFuZ2xlPjtcblx0cmVhZG9ubHkgY29tcGFjdD86IGJvb2xlYW47XG5cblx0cmVhZG9ubHkgbW9kZT86IEF1eGlsaWFyeVdpbmRvd01vZGU7XG5cdHJlYWRvbmx5IHpvb21MZXZlbD86IG51bWJlcjtcblx0cmVhZG9ubHkgYWx3YXlzT25Ub3A/OiBib29sZWFuO1xuXG5cdHJlYWRvbmx5IG5hdGl2ZVRpdGxlYmFyPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZGlzYWJsZUZ1bGxzY3JlZW4/OiBib29sZWFuO1xuXHRyZWFkb25seSBmcmFtZWxlc3M/OiBib29sZWFuO1xuXHRyZWFkb25seSB0cmFuc3BhcmVudD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IG5vdFJlc2l6YWJsZT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGRpc2FibGVNYXhpbWl6ZT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IG5vQmFja2dyb3VuZFRocm90dGxpbmc/OiBib29sZWFuO1xuXHRyZWFkb25seSBiYWNrZ3JvdW5kQ29sb3I/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUF1eGlsaWFyeVdpbmRvd1NlcnZpY2Uge1xuXG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBvbkRpZE9wZW5BdXhpbGlhcnlXaW5kb3c6IEV2ZW50PElBdXhpbGlhcnlXaW5kb3dPcGVuRXZlbnQ+O1xuXG5cdG9wZW4ob3B0aW9ucz86IElBdXhpbGlhcnlXaW5kb3dPcGVuT3B0aW9ucyk6IFByb21pc2U8SUF1eGlsaWFyeVdpbmRvdz47XG5cblx0Z2V0V2luZG93KHdpbmRvd0lkOiBudW1iZXIpOiBJQXV4aWxpYXJ5V2luZG93IHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEJlZm9yZUF1eGlsaWFyeVdpbmRvd1VubG9hZEV2ZW50IHtcblx0dmV0byhyZWFzb246IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUF1eGlsaWFyeVdpbmRvdyBleHRlbmRzIElEaXNwb3NhYmxlIHtcblxuXHRyZWFkb25seSBvbldpbGxMYXlvdXQ6IEV2ZW50PERpbWVuc2lvbj47XG5cdHJlYWRvbmx5IG9uRGlkTGF5b3V0OiBFdmVudDxEaW1lbnNpb24+O1xuXG5cdHJlYWRvbmx5IG9uQmVmb3JlVW5sb2FkOiBFdmVudDxCZWZvcmVBdXhpbGlhcnlXaW5kb3dVbmxvYWRFdmVudD47XG5cdHJlYWRvbmx5IG9uVW5sb2FkOiBFdmVudDx2b2lkPjtcblxuXHRyZWFkb25seSB3aGVuU3R5bGVzSGF2ZUxvYWRlZDogUHJvbWlzZTx2b2lkPjtcblxuXHRyZWFkb25seSB3aW5kb3c6IENvZGVXaW5kb3c7XG5cdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cblx0dXBkYXRlT3B0aW9ucyhvcHRpb25zOiB7IGNvbXBhY3Q6IGJvb2xlYW4gfSB8IHVuZGVmaW5lZCk6IHZvaWQ7XG5cblx0c2V0Qm91bmRzKGJvdW5kczogSVJlY3RhbmdsZSk6IFByb21pc2U8dm9pZD47XG5cblx0bGF5b3V0KCk6IHZvaWQ7XG5cblx0Y3JlYXRlU3RhdGUoKTogSUF1eGlsaWFyeVdpbmRvd09wZW5PcHRpb25zO1xufVxuXG5jb25zdCBERUZBVUxUX0FVWF9XSU5ET1dfRElNRU5TSU9OUyA9IG5ldyBEaW1lbnNpb24oREVGQVVMVF9BVVhfV0lORE9XX1NJWkUud2lkdGgsIERFRkFVTFRfQVVYX1dJTkRPV19TSVpFLmhlaWdodCk7XG5cbmV4cG9ydCBjbGFzcyBBdXhpbGlhcnlXaW5kb3cgZXh0ZW5kcyBCYXNlV2luZG93IGltcGxlbWVudHMgSUF1eGlsaWFyeVdpbmRvdyB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsTGF5b3V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8RGltZW5zaW9uPigpKTtcblx0cmVhZG9ubHkgb25XaWxsTGF5b3V0ID0gdGhpcy5fb25XaWxsTGF5b3V0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkTGF5b3V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8RGltZW5zaW9uPigpKTtcblx0cmVhZG9ubHkgb25EaWRMYXlvdXQgPSB0aGlzLl9vbkRpZExheW91dC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkJlZm9yZVVubG9hZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEJlZm9yZUF1eGlsaWFyeVdpbmRvd1VubG9hZEV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25CZWZvcmVVbmxvYWQgPSB0aGlzLl9vbkJlZm9yZVVubG9hZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblVubG9hZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvblVubG9hZCA9IHRoaXMuX29uVW5sb2FkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbERpc3Bvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25XaWxsRGlzcG9zZSA9IHRoaXMuX29uV2lsbERpc3Bvc2UuZXZlbnQ7XG5cblx0cmVhZG9ubHkgd2hlblN0eWxlc0hhdmVMb2FkZWQ6IFByb21pc2U8dm9pZD47XG5cblx0cHJpdmF0ZSBjb21wYWN0ID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgd2luZG93OiBDb2RlV2luZG93LFxuXHRcdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0c3R5bGVzSGF2ZUxvYWRlZDogQmFycmllcixcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIod2luZG93LCB1bmRlZmluZWQsIGhvc3RTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgbGF5b3V0U2VydmljZSk7XG5cblx0XHR0aGlzLndoZW5TdHlsZXNIYXZlTG9hZGVkID0gc3R5bGVzSGF2ZUxvYWRlZC53YWl0KCkudGhlbigoKSA9PiB1bmRlZmluZWQpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0dXBkYXRlT3B0aW9ucyhvcHRpb25zOiB7IGNvbXBhY3Q6IGJvb2xlYW4gfSk6IHZvaWQge1xuXHRcdHRoaXMuY29tcGFjdCA9IG9wdGlvbnMuY29tcGFjdDtcblx0fVxuXG5cdGFzeW5jIHNldEJvdW5kcyhib3VuZHM6IElSZWN0YW5nbGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLndpbmRvdy5tb3ZlVG8oYm91bmRzLngsIGJvdW5kcy55KTtcblx0XHR0aGlzLndpbmRvdy5yZXNpemVUbyhib3VuZHMud2lkdGgsIGJvdW5kcy5oZWlnaHQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy53aW5kb3csIEV2ZW50VHlwZS5CRUZPUkVfVU5MT0FELCAoZTogQmVmb3JlVW5sb2FkRXZlbnQpID0+IHRoaXMuaGFuZGxlQmVmb3JlVW5sb2FkKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMud2luZG93LCBFdmVudFR5cGUuVU5MT0FELCAoKSA9PiB0aGlzLmhhbmRsZVVubG9hZCgpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy53aW5kb3csICd1bmhhbmRsZWRyZWplY3Rpb24nLCBlID0+IHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGUucmVhc29uKTtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy53aW5kb3csIEV2ZW50VHlwZS5SRVNJWkUsICgpID0+IHRoaXMubGF5b3V0KCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNvbnRhaW5lciwgRXZlbnRUeXBlLlNDUk9MTCwgKCkgPT4gdGhpcy5jb250YWluZXIuc2Nyb2xsVG9wID0gMCkpOyBcdFx0XHRcdFx0XHQvLyBQcmV2ZW50IGNvbnRhaW5lciBmcm9tIHNjcm9sbGluZyAoIzU1NDU2KVxuXG5cdFx0aWYgKGlzV2ViKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5jb250YWluZXIsIEV2ZW50VHlwZS5EUk9QLCBlID0+IEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSkpKTsgXHRcdFx0XHRcdFx0XHQvLyBQcmV2ZW50IGRlZmF1bHQgbmF2aWdhdGlvbiBvbiBkcm9wXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5jb250YWluZXIsIEV2ZW50VHlwZS5XSEVFTCwgZSA9PiBlLnByZXZlbnREZWZhdWx0KCksIHsgcGFzc2l2ZTogZmFsc2UgfSkpOyBcdFx0XHQvLyBQcmV2ZW50IHRoZSBiYWNrL2ZvcndhcmQgZ2VzdHVyZXMgaW4gbWFjT1Ncblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNvbnRhaW5lciwgRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgZSA9PiBFdmVudEhlbHBlci5zdG9wKGUsIHRydWUpKSk7IFx0XHRcdFx0XHQvLyBQcmV2ZW50IG5hdGl2ZSBjb250ZXh0IG1lbnVzIGluIHdlYlxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy53aW5kb3cuZG9jdW1lbnQuYm9keSwgRXZlbnRUeXBlLkRSQUdfT1ZFUiwgKGU6IERyYWdFdmVudCkgPT4gRXZlbnRIZWxwZXIuc3RvcChlKSkpO1x0Ly8gUHJldmVudCBkcmFnIGZlZWRiYWNrIG9uIDxib2R5PlxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMud2luZG93LmRvY3VtZW50LmJvZHksIEV2ZW50VHlwZS5EUk9QLCAoZTogRHJhZ0V2ZW50KSA9PiBFdmVudEhlbHBlci5zdG9wKGUpKSk7XHRcdC8vIFByZXZlbnQgZGVmYXVsdCBuYXZpZ2F0aW9uIG9uIGRyb3Bcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUJlZm9yZVVubG9hZChlOiBCZWZvcmVVbmxvYWRFdmVudCk6IHZvaWQge1xuXG5cdFx0Ly8gQ2hlY2sgZm9yIHZldG8gZnJvbSBhIGxpc3RlbmluZyBjb21wb25lbnRcblx0XHRsZXQgdmV0bzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdHRoaXMuX29uQmVmb3JlVW5sb2FkLmZpcmUoe1xuXHRcdFx0dmV0byhyZWFzb24pIHtcblx0XHRcdFx0aWYgKHJlYXNvbikge1xuXHRcdFx0XHRcdHZldG8gPSByZWFzb247XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRpZiAodmV0bykge1xuXHRcdFx0dGhpcy5oYW5kbGVWZXRvQmVmb3JlQ2xvc2UoZSwgdmV0byk7XG5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBmb3IgY29uZmlybSBiZWZvcmUgY2xvc2Ugc2V0dGluZ1xuXHRcdGNvbnN0IGNvbmZpcm1CZWZvcmVDbG9zZVNldHRpbmcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdhbHdheXMnIHwgJ25ldmVyJyB8ICdrZXlib2FyZE9ubHknPignd2luZG93LmNvbmZpcm1CZWZvcmVDbG9zZScpO1xuXHRcdGNvbnN0IGNvbmZpcm1CZWZvcmVDbG9zZSA9IGNvbmZpcm1CZWZvcmVDbG9zZVNldHRpbmcgPT09ICdhbHdheXMnIHx8IChjb25maXJtQmVmb3JlQ2xvc2VTZXR0aW5nID09PSAna2V5Ym9hcmRPbmx5JyAmJiBNb2RpZmllcktleUVtaXR0ZXIuZ2V0SW5zdGFuY2UoKS5pc01vZGlmaWVyUHJlc3NlZCk7XG5cdFx0aWYgKGNvbmZpcm1CZWZvcmVDbG9zZSkge1xuXHRcdFx0dGhpcy5jb25maXJtQmVmb3JlQ2xvc2UoZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGhhbmRsZVZldG9CZWZvcmVDbG9zZShlOiBCZWZvcmVVbmxvYWRFdmVudCwgcmVhc29uOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnByZXZlbnRVbmxvYWQoZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcHJldmVudFVubG9hZChlOiBCZWZvcmVVbmxvYWRFdmVudCk6IHZvaWQge1xuXHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRlLnJldHVyblZhbHVlID0gbG9jYWxpemUoJ2xpZmVjeWNsZVZldG8nLCBcIkNoYW5nZXMgdGhhdCB5b3UgbWFkZSBtYXkgbm90IGJlIHNhdmVkLiBQbGVhc2UgY2hlY2sgcHJlc3MgJ0NhbmNlbCcgYW5kIHRyeSBhZ2Fpbi5cIik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY29uZmlybUJlZm9yZUNsb3NlKGU6IEJlZm9yZVVubG9hZEV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5wcmV2ZW50VW5sb2FkKGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVVbmxvYWQoKTogdm9pZCB7XG5cblx0XHQvLyBFdmVudFxuXHRcdHRoaXMuX29uVW5sb2FkLmZpcmUoKTtcblx0fVxuXG5cdGxheW91dCgpOiB2b2lkIHtcblxuXHRcdC8vIFNwbGl0IGxheW91dCB1cCBpbnRvIHR3byBldmVudHMgc28gdGhhdCBkb3duc3RyZWFtIGNvbXBvbmVudHNcblx0XHQvLyBoYXZlIGEgY2hhbmNlIHRvIHBhcnRpY2lwYXRlIGluIHRoZSBiZWdpbm5pbmcgb3IgZW5kIG9mIHRoZVxuXHRcdC8vIGxheW91dCBwaGFzZS5cblx0XHQvLyBUaGlzIGhlbHBzIHRvIGJ1aWxkIHRoZSBhdXhpbGlhcnkgd2luZG93IGluIGFub3RoZXIgY29tcG9uZW50XG5cdFx0Ly8gaW4gdGhlIGBvbldpbGxMYXlvdXRgIHBoYXNlIGFuZCB0aGVuIGxldCBvdGhlciBjb21wb21lbnRzXG5cdFx0Ly8gcmVhY3Qgd2hlbiB0aGUgb3ZlcmFsbCBsYXlvdXQgaGFzIGZpbmlzaGVkIGluIGBvbkRpZExheW91dGAuXG5cblx0XHRjb25zdCBkaW1lbnNpb24gPSBnZXRDbGllbnRBcmVhKHRoaXMud2luZG93LmRvY3VtZW50LmJvZHksIERFRkFVTFRfQVVYX1dJTkRPV19ESU1FTlNJT05TLCB0aGlzLmNvbnRhaW5lcik7XG5cdFx0dGhpcy5fb25XaWxsTGF5b3V0LmZpcmUoZGltZW5zaW9uKTtcblx0XHR0aGlzLl9vbkRpZExheW91dC5maXJlKGRpbWVuc2lvbik7XG5cdH1cblxuXHRjcmVhdGVTdGF0ZSgpOiBJQXV4aWxpYXJ5V2luZG93T3Blbk9wdGlvbnMge1xuXHRcdHJldHVybiB7XG5cdFx0XHRib3VuZHM6IHtcblx0XHRcdFx0eDogdGhpcy53aW5kb3cuc2NyZWVuWCxcblx0XHRcdFx0eTogdGhpcy53aW5kb3cuc2NyZWVuWSxcblx0XHRcdFx0d2lkdGg6IHRoaXMud2luZG93Lm91dGVyV2lkdGgsXG5cdFx0XHRcdGhlaWdodDogdGhpcy53aW5kb3cub3V0ZXJIZWlnaHRcblx0XHRcdH0sXG5cdFx0XHR6b29tTGV2ZWw6IGdldFpvb21MZXZlbCh0aGlzLndpbmRvdyksXG5cdFx0XHRjb21wYWN0OiB0aGlzLmNvbXBhY3Rcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uV2lsbERpc3Bvc2UuZmlyZSgpO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBCcm93c2VyQXV4aWxpYXJ5V2luZG93U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQXV4aWxpYXJ5V2luZG93U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBzdGF0aWMgV0lORE9XX0lEUyA9IGdldFdpbmRvd0lkKG1haW5XaW5kb3cpICsgMTsgLy8gc3RhcnQgZnJvbSB0aGUgbWFpbiB3aW5kb3cgSUQgKyAxXG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRPcGVuQXV4aWxpYXJ5V2luZG93ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUF1eGlsaWFyeVdpbmRvd09wZW5FdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkT3BlbkF1eGlsaWFyeVdpbmRvdyA9IHRoaXMuX29uRGlkT3BlbkF1eGlsaWFyeVdpbmRvdy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHdpbmRvd3MgPSBuZXcgTWFwPG51bWJlciwgSUF1eGlsaWFyeVdpbmRvdz4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGFzeW5jIG9wZW4ob3B0aW9ucz86IElBdXhpbGlhcnlXaW5kb3dPcGVuT3B0aW9ucyk6IFByb21pc2U8SUF1eGlsaWFyeVdpbmRvdz4ge1xuXHRcdG1hcmsoJ2NvZGUvYXV4aWxpYXJ5V2luZG93L3dpbGxPcGVuJyk7XG5cblx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBhd2FpdCB0aGlzLm9wZW5XaW5kb3cob3B0aW9ucyk7XG5cdFx0aWYgKCF0YXJnZXRXaW5kb3cpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgndW5hYmxlVG9PcGVuV2luZG93RXJyb3InLCBcIlVuYWJsZSB0byBvcGVuIGEgbmV3IHdpbmRvdy5cIikpO1xuXHRcdH1cblxuXHRcdC8vIEFkZCBhIGB2c2NvZGVXaW5kb3dJZGAgcHJvcGVydHkgdG8gaWRlbnRpZnkgYXV4aWxpYXJ5IHdpbmRvd3Ncblx0XHRjb25zdCByZXNvbHZlZFdpbmRvd0lkID0gYXdhaXQgdGhpcy5yZXNvbHZlV2luZG93SWQodGFyZ2V0V2luZG93KTtcblx0XHRlbnN1cmVDb2RlV2luZG93KHRhcmdldFdpbmRvdywgcmVzb2x2ZWRXaW5kb3dJZCk7XG5cblx0XHRjb25zdCBjb250YWluZXJEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCB7IGNvbnRhaW5lciwgc3R5bGVzTG9hZGVkIH0gPSB0aGlzLmNyZWF0ZUNvbnRhaW5lcih0YXJnZXRXaW5kb3csIGNvbnRhaW5lckRpc3Bvc2FibGVzLCBvcHRpb25zKTtcblxuXHRcdGNvbnN0IGF1eGlsaWFyeVdpbmRvdyA9IHRoaXMuY3JlYXRlQXV4aWxpYXJ5V2luZG93KHRhcmdldFdpbmRvdywgY29udGFpbmVyLCBzdHlsZXNMb2FkZWQpO1xuXHRcdGF1eGlsaWFyeVdpbmRvdy51cGRhdGVPcHRpb25zKHsgY29tcGFjdDogb3B0aW9ucz8uY29tcGFjdCA/PyBmYWxzZSB9KTtcblxuXHRcdGNvbnN0IHJlZ2lzdHJ5RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy53aW5kb3dzLnNldCh0YXJnZXRXaW5kb3cudnNjb2RlV2luZG93SWQsIGF1eGlsaWFyeVdpbmRvdyk7XG5cdFx0cmVnaXN0cnlEaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMud2luZG93cy5kZWxldGUodGFyZ2V0V2luZG93LnZzY29kZVdpbmRvd0lkKSkpO1xuXG5cdFx0Y29uc3QgZXZlbnREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdEV2ZW50Lm9uY2UoYXV4aWxpYXJ5V2luZG93Lm9uV2lsbERpc3Bvc2UpKCgpID0+IHtcblx0XHRcdHRhcmdldFdpbmRvdy5jbG9zZSgpO1xuXG5cdFx0XHRjb250YWluZXJEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRyZWdpc3RyeURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdGV2ZW50RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0cmVnaXN0cnlEaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJXaW5kb3codGFyZ2V0V2luZG93KSk7XG5cdFx0dGhpcy5fb25EaWRPcGVuQXV4aWxpYXJ5V2luZG93LmZpcmUoeyB3aW5kb3c6IGF1eGlsaWFyeVdpbmRvdywgZGlzcG9zYWJsZXM6IGV2ZW50RGlzcG9zYWJsZXMgfSk7XG5cblx0XHRtYXJrKCdjb2RlL2F1eGlsaWFyeVdpbmRvdy9kaWRPcGVuJyk7XG5cblx0XHR0eXBlIEF1eGlsaWFyeVdpbmRvd0NsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdicGFzZXJvJztcblx0XHRcdGNvbW1lbnQ6ICdBbiBldmVudCB0aGF0IGZpcmVzIHdoZW4gYW4gYXV4aWxpYXJ5IHdpbmRvdyBpcyBvcGVuZWQnO1xuXHRcdFx0Ym91bmRzOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSGFzIHdpbmRvdyBib3VuZHMgcHJvdmlkZWQuJyB9O1xuXHRcdH07XG5cdFx0dHlwZSBBdXhpbGlhcnlXaW5kb3dPcGVuRXZlbnQgPSB7XG5cdFx0XHRib3VuZHM6IGJvb2xlYW47XG5cdFx0fTtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxBdXhpbGlhcnlXaW5kb3dPcGVuRXZlbnQsIEF1eGlsaWFyeVdpbmRvd0NsYXNzaWZpY2F0aW9uPignYXV4aWxpYXJ5V2luZG93T3BlbicsIHsgYm91bmRzOiAhIW9wdGlvbnM/LmJvdW5kcyB9KTtcblxuXHRcdHJldHVybiBhdXhpbGlhcnlXaW5kb3c7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlQXV4aWxpYXJ5V2luZG93KHRhcmdldFdpbmRvdzogQ29kZVdpbmRvdywgY29udGFpbmVyOiBIVE1MRWxlbWVudCwgc3R5bGVzTG9hZGVkOiBCYXJyaWVyKTogQXV4aWxpYXJ5V2luZG93IHtcblx0XHRyZXR1cm4gbmV3IEF1eGlsaWFyeVdpbmRvdyh0YXJnZXRXaW5kb3csIGNvbnRhaW5lciwgc3R5bGVzTG9hZGVkLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmhvc3RTZXJ2aWNlLCB0aGlzLmVudmlyb25tZW50U2VydmljZSwgdGhpcy5jb250ZXh0TWVudVNlcnZpY2UsIHRoaXMubGF5b3V0U2VydmljZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5XaW5kb3cob3B0aW9ucz86IElBdXhpbGlhcnlXaW5kb3dPcGVuT3B0aW9ucyk6IFByb21pc2U8V2luZG93IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYWN0aXZlV2luZG93ID0gZ2V0QWN0aXZlV2luZG93KCk7XG5cdFx0Y29uc3QgYWN0aXZlV2luZG93Qm91bmRzID0ge1xuXHRcdFx0eDogYWN0aXZlV2luZG93LnNjcmVlblgsXG5cdFx0XHR5OiBhY3RpdmVXaW5kb3cuc2NyZWVuWSxcblx0XHRcdHdpZHRoOiBhY3RpdmVXaW5kb3cub3V0ZXJXaWR0aCxcblx0XHRcdGhlaWdodDogYWN0aXZlV2luZG93Lm91dGVySGVpZ2h0XG5cdFx0fTtcblxuXHRcdGNvbnN0IGRlZmF1bHRTaXplID0gREVGQVVMVF9BVVhfV0lORE9XX1NJWkU7XG5cblx0XHRjb25zdCB3aWR0aCA9IG9wdGlvbnM/LmZyYW1lbGVzc1xuXHRcdFx0PyAob3B0aW9ucz8uYm91bmRzPy53aWR0aCA/PyBkZWZhdWx0U2l6ZS53aWR0aClcblx0XHRcdDogTWF0aC5tYXgob3B0aW9ucz8uYm91bmRzPy53aWR0aCA/PyBkZWZhdWx0U2l6ZS53aWR0aCwgV2luZG93TWluaW11bVNpemUuV0lEVEgpO1xuXHRcdGNvbnN0IGhlaWdodCA9IG9wdGlvbnM/LmZyYW1lbGVzc1xuXHRcdFx0PyAob3B0aW9ucz8uYm91bmRzPy5oZWlnaHQgPz8gZGVmYXVsdFNpemUuaGVpZ2h0KVxuXHRcdFx0OiBNYXRoLm1heChvcHRpb25zPy5ib3VuZHM/LmhlaWdodCA/PyBkZWZhdWx0U2l6ZS5oZWlnaHQsIFdpbmRvd01pbmltdW1TaXplLkhFSUdIVCk7XG5cblx0XHRsZXQgbmV3V2luZG93Qm91bmRzOiBJUmVjdGFuZ2xlID0ge1xuXHRcdFx0eDogb3B0aW9ucz8uYm91bmRzPy54ID8/IE1hdGgubWF4KGFjdGl2ZVdpbmRvd0JvdW5kcy54ICsgYWN0aXZlV2luZG93Qm91bmRzLndpZHRoIC8gMiAtIHdpZHRoIC8gMiwgMCksXG5cdFx0XHR5OiBvcHRpb25zPy5ib3VuZHM/LnkgPz8gTWF0aC5tYXgoYWN0aXZlV2luZG93Qm91bmRzLnkgKyBhY3RpdmVXaW5kb3dCb3VuZHMuaGVpZ2h0IC8gMiAtIGhlaWdodCAvIDIsIDApLFxuXHRcdFx0d2lkdGgsXG5cdFx0XHRoZWlnaHRcblx0XHR9O1xuXG5cdFx0aWYgKCFvcHRpb25zPy5ib3VuZHMgJiYgbmV3V2luZG93Qm91bmRzLnggPT09IGFjdGl2ZVdpbmRvd0JvdW5kcy54ICYmIG5ld1dpbmRvd0JvdW5kcy55ID09PSBhY3RpdmVXaW5kb3dCb3VuZHMueSkge1xuXHRcdFx0Ly8gT2Zmc2V0IHRoZSBuZXcgd2luZG93IGEgYml0IHNvIHRoYXQgaXQgZG9lcyBub3Qgb3ZlcmxhcFxuXHRcdFx0Ly8gd2l0aCB0aGUgYWN0aXZlIHdpbmRvdywgdW5sZXNzIGJvdW5kcyBhcmUgcHJvdmlkZWRcblx0XHRcdG5ld1dpbmRvd0JvdW5kcyA9IHtcblx0XHRcdFx0Li4ubmV3V2luZG93Qm91bmRzLFxuXHRcdFx0XHR4OiBuZXdXaW5kb3dCb3VuZHMueCArIDMwLFxuXHRcdFx0XHR5OiBuZXdXaW5kb3dCb3VuZHMueSArIDMwXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGZlYXR1cmVzID0gY29hbGVzY2UoW1xuXHRcdFx0J3BvcHVwPXllcycsXG5cdFx0XHRgbGVmdD0ke25ld1dpbmRvd0JvdW5kcy54fWAsXG5cdFx0XHRgdG9wPSR7bmV3V2luZG93Qm91bmRzLnl9YCxcblx0XHRcdGB3aWR0aD0ke25ld1dpbmRvd0JvdW5kcy53aWR0aH1gLFxuXHRcdFx0YGhlaWdodD0ke25ld1dpbmRvd0JvdW5kcy5oZWlnaHR9YCxcblxuXHRcdFx0Ly8gbm9uLXN0YW5kYXJkIHByb3BlcnRpZXNcblx0XHRcdG9wdGlvbnM/Lm5hdGl2ZVRpdGxlYmFyID8gJ3dpbmRvdy1uYXRpdmUtdGl0bGViYXI9eWVzJyA6IHVuZGVmaW5lZCxcblx0XHRcdG9wdGlvbnM/LmRpc2FibGVGdWxsc2NyZWVuID8gJ3dpbmRvdy1kaXNhYmxlLWZ1bGxzY3JlZW49eWVzJyA6IHVuZGVmaW5lZCxcblx0XHRcdG9wdGlvbnM/LmFsd2F5c09uVG9wID8gJ3dpbmRvdy1hbHdheXMtb24tdG9wPXllcycgOiB1bmRlZmluZWQsXG5cdFx0XHRvcHRpb25zPy5tb2RlID09PSBBdXhpbGlhcnlXaW5kb3dNb2RlLk1heGltaXplZCA/ICd3aW5kb3ctbWF4aW1pemVkPXllcycgOiB1bmRlZmluZWQsXG5cdFx0XHRvcHRpb25zPy5tb2RlID09PSBBdXhpbGlhcnlXaW5kb3dNb2RlLkZ1bGxzY3JlZW4gPyAnd2luZG93LWZ1bGxzY3JlZW49eWVzJyA6IHVuZGVmaW5lZCxcblx0XHRcdG9wdGlvbnM/LmZyYW1lbGVzcyA/ICd3aW5kb3ctZnJhbWVsZXNzPXllcycgOiB1bmRlZmluZWQsXG5cdFx0XHRvcHRpb25zPy50cmFuc3BhcmVudCA/ICd3aW5kb3ctdHJhbnNwYXJlbnQ9eWVzJyA6IHVuZGVmaW5lZCxcblx0XHRcdG9wdGlvbnM/Lm5vdFJlc2l6YWJsZSA/ICd3aW5kb3ctbm90LXJlc2l6YWJsZT15ZXMnIDogdW5kZWZpbmVkLFxuXHRcdFx0b3B0aW9ucz8uZGlzYWJsZU1heGltaXplID8gJ3dpbmRvdy1kaXNhYmxlLW1heGltaXplPXllcycgOiB1bmRlZmluZWQsXG5cdFx0XHRvcHRpb25zPy5ub0JhY2tncm91bmRUaHJvdHRsaW5nID8gJ3dpbmRvdy1uby1iYWNrZ3JvdW5kLXRocm90dGxpbmc9eWVzJyA6IHVuZGVmaW5lZCxcblx0XHRcdG9wdGlvbnM/LmJhY2tncm91bmRDb2xvciAmJiAvXiMoPzpbMC05YS1mQS1GXXszfXxbMC05YS1mQS1GXXs0fXxbMC05YS1mQS1GXXs2fXxbMC05YS1mQS1GXXs4fSkkLy50ZXN0KG9wdGlvbnMuYmFja2dyb3VuZENvbG9yKSA/IGB3aW5kb3ctYmFja2dyb3VuZC1jb2xvcj0ke29wdGlvbnMuYmFja2dyb3VuZENvbG9yfWAgOiB1bmRlZmluZWQsXG5cdFx0XSk7XG5cblx0XHRjb25zdCBhdXhpbGlhcnlXaW5kb3cgPSBtYWluV2luZG93Lm9wZW4oaXNGaXJlZm94ID8gJycgLyogRkYgaW1tZWRpYXRlbHkgZmlyZXMgYW4gdW5sb2FkIGV2ZW50IGlmIHVzaW5nIGFib3V0OmJsYW5rICovIDogJ2Fib3V0OmJsYW5rJywgdW5kZWZpbmVkLCBmZWF0dXJlcy5qb2luKCcsJykpO1xuXHRcdGlmICghYXV4aWxpYXJ5V2luZG93ICYmIGlzV2ViKSB7XG5cdFx0XHRyZXR1cm4gKGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0XHR0eXBlOiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgndW5hYmxlVG9PcGVuV2luZG93JywgXCJUaGUgYnJvd3NlciBibG9ja2VkIG9wZW5pbmcgYSBuZXcgd2luZG93LiBQcmVzcyAnUmV0cnknIHRvIHRyeSBhZ2Fpbi5cIiksXG5cdFx0XHRcdGN1c3RvbToge1xuXHRcdFx0XHRcdG1hcmtkb3duRGV0YWlsczogW3sgbWFya2Rvd246IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgndW5hYmxlVG9PcGVuV2luZG93RGV0YWlsJywgXCJQbGVhc2UgYWxsb3cgcG9wLXVwcyBmb3IgdGhpcyB3ZWJzaXRlIGluIHlvdXIgW2Jyb3dzZXIgc2V0dGluZ3NdKHswfSkuXCIsICdodHRwczovL2FrYS5tcy9hbGxvdy12c2NvZGUtcG9wdXAnKSwgdHJ1ZSkgfV1cblx0XHRcdFx0fSxcblx0XHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSh7IGtleTogJ3JldHJ5JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmUmV0cnlcIiksXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMub3BlbldpbmRvdyhvcHRpb25zKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0Y2FuY2VsQnV0dG9uOiB0cnVlXG5cdFx0XHR9KSkucmVzdWx0O1xuXHRcdH1cblxuXHRcdHJldHVybiBhdXhpbGlhcnlXaW5kb3c/LndpbmRvdztcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyByZXNvbHZlV2luZG93SWQoYXV4aWxpYXJ5V2luZG93OiBXaW5kb3cpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdHJldHVybiBCcm93c2VyQXV4aWxpYXJ5V2luZG93U2VydmljZS5XSU5ET1dfSURTKys7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlQ29udGFpbmVyKGF1eGlsaWFyeVdpbmRvdzogQ29kZVdpbmRvdywgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgb3B0aW9ucz86IElBdXhpbGlhcnlXaW5kb3dPcGVuT3B0aW9ucyk6IHsgc3R5bGVzTG9hZGVkOiBCYXJyaWVyOyBjb250YWluZXI6IEhUTUxFbGVtZW50IH0ge1xuXHRcdGF1eGlsaWFyeVdpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50ID0gZnVuY3Rpb24gKCkge1xuXHRcdFx0Ly8gRGlzYWxsb3cgYGNyZWF0ZUVsZW1lbnRgIGJlY2F1c2UgaXQgd291bGQgY3JlYXRlXG5cdFx0XHQvLyBIVE1MIEVsZW1lbnRzIGluIHRoZSBcIndyb25nXCIgY29udGV4dCBhbmQgYnJlYWtcblx0XHRcdC8vIGNvZGUgdGhhdCBkb2VzIFwiaW5zdGFuY2VvZiBIVE1MRWxlbWVudFwiIGV0Yy5cblx0XHRcdHRocm93IG5ldyBFcnJvcignTm90IGFsbG93ZWQgdG8gY3JlYXRlIGVsZW1lbnRzIGluIGNoaWxkIHdpbmRvdyBKYXZhU2NyaXB0IGNvbnRleHQuIEFsd2F5cyB1c2UgdGhlIG1haW4gd2luZG93IHNvIHRoYXQgXCJ4eXogaW5zdGFuY2VvZiBIVE1MRWxlbWVudFwiIGNvbnRpbnVlcyB0byB3b3JrLicpO1xuXHRcdH07XG5cblx0XHR0aGlzLmFwcGx5TWV0YShhdXhpbGlhcnlXaW5kb3cpO1xuXHRcdGNvbnN0IHsgc3R5bGVzTG9hZGVkIH0gPSB0aGlzLmFwcGx5Q1NTKGF1eGlsaWFyeVdpbmRvdywgZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMuYXBwbHlIVE1MKGF1eGlsaWFyeVdpbmRvdywgZGlzcG9zYWJsZXMpO1xuXG5cdFx0cmV0dXJuIHsgc3R5bGVzTG9hZGVkLCBjb250YWluZXIgfTtcblx0fVxuXG5cdHByaXZhdGUgYXBwbHlNZXRhKGF1eGlsaWFyeVdpbmRvdzogQ29kZVdpbmRvdyk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgbWV0YVRhZyBvZiBbJ21ldGFbY2hhcnNldD1cInV0Zi04XCJdJywgJ21ldGFbaHR0cC1lcXVpdj1cIkNvbnRlbnQtU2VjdXJpdHktUG9saWN5XCJdJywgJ21ldGFbbmFtZT1cInZpZXdwb3J0XCJdJywgJ21ldGFbbmFtZT1cInRoZW1lLWNvbG9yXCJdJ10pIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgbWV0YUVsZW1lbnQgPSBtYWluV2luZG93LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IobWV0YVRhZyk7XG5cdFx0XHRpZiAobWV0YUVsZW1lbnQpIHtcblx0XHRcdFx0Y29uc3QgY2xvbmVkTWV0YUVsZW1lbnQgPSBjcmVhdGVNZXRhRWxlbWVudChhdXhpbGlhcnlXaW5kb3cuZG9jdW1lbnQuaGVhZCk7XG5cdFx0XHRcdGNvcHlBdHRyaWJ1dGVzKG1ldGFFbGVtZW50LCBjbG9uZWRNZXRhRWxlbWVudCk7XG5cblx0XHRcdFx0aWYgKG1ldGFUYWcgPT09ICdtZXRhW2h0dHAtZXF1aXY9XCJDb250ZW50LVNlY3VyaXR5LVBvbGljeVwiXScpIHtcblx0XHRcdFx0XHRjb25zdCBjb250ZW50ID0gY2xvbmVkTWV0YUVsZW1lbnQuZ2V0QXR0cmlidXRlKCdjb250ZW50Jyk7XG5cdFx0XHRcdFx0aWYgKGNvbnRlbnQpIHtcblx0XHRcdFx0XHRcdGNsb25lZE1ldGFFbGVtZW50LnNldEF0dHJpYnV0ZSgnY29udGVudCcsIGNvbnRlbnQucmVwbGFjZSgvKHNjcmlwdC1zcmNbXlxcO10qKS8sIGBzY3JpcHQtc3JjICdub25lJ2ApKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBvcmlnaW5hbEljb25MaW5rVGFnID0gbWFpbldpbmRvdy5kb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdsaW5rW3JlbD1cImljb25cIl0nKTtcblx0XHRpZiAob3JpZ2luYWxJY29uTGlua1RhZykge1xuXHRcdFx0Y29uc3QgaWNvbiA9IGNyZWF0ZUxpbmtFbGVtZW50KGF1eGlsaWFyeVdpbmRvdy5kb2N1bWVudC5oZWFkKTtcblx0XHRcdGNvcHlBdHRyaWJ1dGVzKG9yaWdpbmFsSWNvbkxpbmtUYWcsIGljb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXBwbHlDU1MoYXV4aWxpYXJ5V2luZG93OiBDb2RlV2luZG93LCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKSB7XG5cdFx0bWFyaygnY29kZS9hdXhpbGlhcnlXaW5kb3cvd2lsbEFwcGx5Q1NTJyk7XG5cblx0XHRjb25zdCBtYXBPcmlnaW5hbFRvQ2xvbmUgPSBuZXcgTWFwPE5vZGUgLyogb3JpZ2luYWwgKi8sIE5vZGUgLyogY2xvbmUgKi8+KCk7XG5cblx0XHRjb25zdCBzdHlsZXNMb2FkZWQgPSBuZXcgQmFycmllcigpO1xuXHRcdHN0eWxlc0xvYWRlZC53YWl0KCkudGhlbigoKSA9PiBtYXJrKCdjb2RlL2F1eGlsaWFyeVdpbmRvdy9kaWRMb2FkQ1NTU3R5bGVzJykpO1xuXG5cdFx0Y29uc3QgcGVuZGluZ0xpbmtzRGlzcG9zYWJsZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRcdGxldCBwZW5kaW5nTGlua3NUb1NldHRsZSA9IDA7XG5cdFx0ZnVuY3Rpb24gb25MaW5rU2V0dGxlZCgpIHtcblx0XHRcdGlmICgtLXBlbmRpbmdMaW5rc1RvU2V0dGxlID09PSAwKSB7XG5cdFx0XHRcdHBlbmRpbmdMaW5rc0Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0c3R5bGVzTG9hZGVkLm9wZW4oKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmdW5jdGlvbiBjbG9uZU5vZGUob3JpZ2luYWxOb2RlOiBFbGVtZW50KTogdm9pZCB7XG5cdFx0XHRpZiAoaXNHbG9iYWxTdHlsZXNoZWV0KG9yaWdpbmFsTm9kZSkpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBnbG9iYWwgc3R5bGVzaGVldHMgYXJlIGhhbmRsZWQgYnkgYGNsb25lR2xvYmFsU3R5bGVzaGVldHNgIGJlbG93XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNsb25lZE5vZGUgPSBhdXhpbGlhcnlXaW5kb3cuZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChvcmlnaW5hbE5vZGUuY2xvbmVOb2RlKHRydWUpKTtcblx0XHRcdGlmIChvcmlnaW5hbE5vZGUudGFnTmFtZS50b0xvd2VyQ2FzZSgpID09PSAnbGluaycpIHtcblx0XHRcdFx0cGVuZGluZ0xpbmtzVG9TZXR0bGUrKztcblxuXHRcdFx0XHRwZW5kaW5nTGlua3NEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNsb25lZE5vZGUsICdsb2FkJywgb25MaW5rU2V0dGxlZCkpO1xuXHRcdFx0XHRwZW5kaW5nTGlua3NEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNsb25lZE5vZGUsICdlcnJvcicsIG9uTGlua1NldHRsZWQpKTtcblx0XHRcdH1cblxuXHRcdFx0bWFwT3JpZ2luYWxUb0Nsb25lLnNldChvcmlnaW5hbE5vZGUsIGNsb25lZE5vZGUpO1xuXHRcdH1cblxuXHRcdC8vIENsb25lIGFsbCBzdHlsZSBlbGVtZW50cyBhbmQgc3R5bGVzaGVldCBsaW5rcyBmcm9tIHRoZSB3aW5kb3cgdG8gdGhlIGNoaWxkIHdpbmRvd1xuXHRcdC8vIGFuZCBrZWVwIHRyYWNrIG9mIDxsaW5rPiBlbGVtZW50cyB0byBzZXR0bGUgdG8gc2lnbmFsIHRoYXQgc3R5bGVzIGhhdmUgbG9hZGVkXG5cdFx0Ly8gSW5jcmVtZW50IHBlbmRpbmcgbGlua3MgcmlnaHQgZnJvbSB0aGUgYmVnaW5uaW5nIHRvIGVuc3VyZSB3ZSBvbmx5IHNldHRsZSB3aGVuXG5cdFx0Ly8gYWxsIHN0eWxlIHJlbGF0ZWQgbm9kZXMgaGF2ZSBiZWVuIGNsb25lZC5cblx0XHRwZW5kaW5nTGlua3NUb1NldHRsZSsrO1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGZvciAoY29uc3Qgb3JpZ2luYWxOb2RlIG9mIG1haW5XaW5kb3cuZG9jdW1lbnQuaGVhZC5xdWVyeVNlbGVjdG9yQWxsKCdsaW5rW3JlbD1cInN0eWxlc2hlZXRcIl0sIHN0eWxlJykpIHtcblx0XHRcdFx0Y2xvbmVOb2RlKG9yaWdpbmFsTm9kZSk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdG9uTGlua1NldHRsZWQoKTtcblx0XHR9XG5cblx0XHQvLyBHbG9iYWwgc3R5bGVzaGVldHMgaW4gPGhlYWQ+IGFyZSBjbG9uZWQgaW4gYSBzcGVjaWFsIHdheSBiZWNhdXNlIHRoZSBtdXRhdGlvblxuXHRcdC8vIG9ic2VydmVyIGlzIG5vdCBmaXJpbmcgZm9yIGNoYW5nZXMgZG9uZSB2aWEgYHN0eWxlLnNoZWV0YCBBUEkuIE9ubHkgdGV4dCBjaGFuZ2VzXG5cdFx0Ly8gY2FuIGJlIG9ic2VydmVkLlxuXHRcdGRpc3Bvc2FibGVzLmFkZChjbG9uZUdsb2JhbFN0eWxlc2hlZXRzKGF1eGlsaWFyeVdpbmRvdykpO1xuXG5cdFx0Ly8gTGlzdGVuIHRvIG5ldyBzdHlsZXNoZWV0cyBhcyB0aGV5IGFyZSBiZWluZyBhZGRlZCBvciByZW1vdmVkIGluIHRoZSBtYWluIHdpbmRvd1xuXHRcdC8vIGFuZCBhcHBseSB0byBjaGlsZCB3aW5kb3cgKGluY2x1ZGluZyBjaGFuZ2VzIHRvIGV4aXN0aW5nIHN0eWxlc2hlZXRzIGVsZW1lbnRzKVxuXHRcdGRpc3Bvc2FibGVzLmFkZChzaGFyZWRNdXRhdGlvbk9ic2VydmVyLm9ic2VydmUobWFpbldpbmRvdy5kb2N1bWVudC5oZWFkLCBkaXNwb3NhYmxlcywgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUgfSkobXV0YXRpb25zID0+IHtcblx0XHRcdGZvciAoY29uc3QgbXV0YXRpb24gb2YgbXV0YXRpb25zKSB7XG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHRtdXRhdGlvbi50eXBlICE9PSAnY2hpbGRMaXN0JyB8fFx0XHRcdFx0XHRcdC8vIG9ubHkgaW50ZXJlc3RlZCBpbiBhZGRlZC9yZW1vdmVkIG5vZGVzXG5cdFx0XHRcdFx0bXV0YXRpb24udGFyZ2V0Lm5vZGVOYW1lLnRvTG93ZXJDYXNlKCkgPT09ICd0aXRsZScgfHwgXHQvLyBza2lwIG92ZXIgdGl0bGUgY2hhbmdlcyB0aGF0IGhhcHBlbiBmcmVxdWVudGx5XG5cdFx0XHRcdFx0bXV0YXRpb24udGFyZ2V0Lm5vZGVOYW1lLnRvTG93ZXJDYXNlKCkgPT09ICdzY3JpcHQnIHx8IFx0Ly8gYmxvY2sgPHNjcmlwdD4gY2hhbmdlcyB0aGF0IGFyZSB1bnN1cHBvcnRlZCBhbnl3YXlcblx0XHRcdFx0XHRtdXRhdGlvbi50YXJnZXQubm9kZU5hbWUudG9Mb3dlckNhc2UoKSA9PT0gJ21ldGEnXHRcdC8vIGRvIG5vdCBvYnNlcnZlIDxtZXRhPiBlbGVtZW50cyBmb3Igbm93XG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Zm9yIChjb25zdCBub2RlIG9mIG11dGF0aW9uLmFkZGVkTm9kZXMpIHtcblxuXHRcdFx0XHRcdC8vIDxzdHlsZT4vPGxpbms+IGVsZW1lbnQgd2FzIGFkZGVkXG5cdFx0XHRcdFx0aWYgKGlzSFRNTEVsZW1lbnQobm9kZSkgJiYgKG5vZGUudGFnTmFtZS50b0xvd2VyQ2FzZSgpID09PSAnc3R5bGUnIHx8IG5vZGUudGFnTmFtZS50b0xvd2VyQ2FzZSgpID09PSAnbGluaycpKSB7XG5cdFx0XHRcdFx0XHRjbG9uZU5vZGUobm9kZSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gdGV4dC1ub2RlIHdhcyBjaGFuZ2VkLCB0cnkgdG8gYXBwbHkgdG8gb3VyIGNsb25lc1xuXHRcdFx0XHRcdGVsc2UgaWYgKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFICYmIG5vZGUucGFyZW50Tm9kZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY2xvbmVkTm9kZSA9IG1hcE9yaWdpbmFsVG9DbG9uZS5nZXQobm9kZS5wYXJlbnROb2RlKTtcblx0XHRcdFx0XHRcdGlmIChjbG9uZWROb2RlKSB7XG5cdFx0XHRcdFx0XHRcdGNsb25lZE5vZGUudGV4dENvbnRlbnQgPSBub2RlLnRleHRDb250ZW50O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAoY29uc3Qgbm9kZSBvZiBtdXRhdGlvbi5yZW1vdmVkTm9kZXMpIHtcblx0XHRcdFx0XHRjb25zdCBjbG9uZWROb2RlID0gbWFwT3JpZ2luYWxUb0Nsb25lLmdldChub2RlKTtcblx0XHRcdFx0XHRpZiAoY2xvbmVkTm9kZSkge1xuXHRcdFx0XHRcdFx0Y2xvbmVkTm9kZS5wYXJlbnROb2RlPy5yZW1vdmVDaGlsZChjbG9uZWROb2RlKTtcblx0XHRcdFx0XHRcdG1hcE9yaWdpbmFsVG9DbG9uZS5kZWxldGUobm9kZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0bWFyaygnY29kZS9hdXhpbGlhcnlXaW5kb3cvZGlkQXBwbHlDU1MnKTtcblxuXHRcdHJldHVybiB7IHN0eWxlc0xvYWRlZCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBseUhUTUwoYXV4aWxpYXJ5V2luZG93OiBDb2RlV2luZG93LCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogSFRNTEVsZW1lbnQge1xuXHRcdG1hcmsoJ2NvZGUvYXV4aWxpYXJ5V2luZG93L3dpbGxBcHBseUhUTUwnKTtcblxuXHRcdC8vIENyZWF0ZSB3b3JrYmVuY2ggY29udGFpbmVyIGFuZCBhcHBseSBjbGFzc2VzXG5cdFx0Y29uc3QgY29udGFpbmVyID0gJCgnZGl2JywgeyByb2xlOiAnYXBwbGljYXRpb24nIH0pO1xuXHRcdHBvc2l0aW9uKGNvbnRhaW5lciwgMCwgMCwgMCwgMCwgJ3JlbGF0aXZlJyk7XG5cdFx0Y29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdFx0Y29udGFpbmVyLnN0eWxlLmhlaWdodCA9ICcxMDAlJztcblx0XHRjb250YWluZXIuc3R5bGUuZmxleERpcmVjdGlvbiA9ICdjb2x1bW4nO1xuXHRcdGF1eGlsaWFyeVdpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZChjb250YWluZXIpO1xuXG5cdFx0Ly8gVHJhY2sgYXR0cmlidXRlc1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0cmFja0F0dHJpYnV0ZXMobWFpbldpbmRvdy5kb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsIGF1eGlsaWFyeVdpbmRvdy5kb2N1bWVudC5kb2N1bWVudEVsZW1lbnQpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodHJhY2tBdHRyaWJ1dGVzKG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keSwgYXV4aWxpYXJ5V2luZG93LmRvY3VtZW50LmJvZHkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodHJhY2tBdHRyaWJ1dGVzKHRoaXMubGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyLCBjb250YWluZXIsIFsnY2xhc3MnXSkpOyAvLyBvbmx5IGNsYXNzIGF0dHJpYnV0ZVxuXG5cdFx0bWFyaygnY29kZS9hdXhpbGlhcnlXaW5kb3cvZGlkQXBwbHlIVE1MJyk7XG5cblx0XHRyZXR1cm4gY29udGFpbmVyO1xuXHR9XG5cblx0Z2V0V2luZG93KHdpbmRvd0lkOiBudW1iZXIpOiBJQXV4aWxpYXJ5V2luZG93IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy53aW5kb3dzLmdldCh3aW5kb3dJZCk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUF1eGlsaWFyeVdpbmRvd1NlcnZpY2UsIEJyb3dzZXJBdXhpbGlhcnlXaW5kb3dTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxHQUFHLFdBQVcsYUFBYSxXQUFXLG9CQUFvQix1QkFBdUIsZ0JBQWdCLG1CQUFtQixtQkFBbUIsaUJBQWlCLGVBQWUsYUFB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
