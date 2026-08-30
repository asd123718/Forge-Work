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
import { isFirefox } from "../../../../base/browser/browser.js";
import { addDisposableListener, EventType, getWindow, getWindowById } from "../../../../base/browser/dom.js";
import { parentOriginHash } from "../../../../base/browser/iframe.js";
import { promiseWithResolvers, ThrottledDelayer } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { COI } from "../../../../base/common/network.js";
import { observableValue } from "../../../../base/common/observable.js";
import { listenStream } from "../../../../base/common/stream.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IRemoteAuthorityResolverService } from "../../../../platform/remote/common/remoteAuthorityResolver.js";
import { ITunnelService } from "../../../../platform/tunnel/common/tunnel.js";
import { WebviewPortMappingManager } from "../../../../platform/webview/common/webviewPortMapping.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { decodeAuthority, webviewGenericCspSource, webviewRootResourceAuthority } from "../common/webview.js";
import { loadLocalResource, WebviewResourceResponse } from "./resourceLoading.js";
import { areWebviewContentOptionsEqual } from "./webview.js";
import { WebviewFindWidget } from "./webviewFindWidget.js";
var WebviewState;
((WebviewState2) => {
  let Type;
  ((Type2) => {
    Type2[Type2["Initializing"] = 0] = "Initializing";
    Type2[Type2["Ready"] = 1] = "Ready";
  })(Type = WebviewState2.Type || (WebviewState2.Type = {}));
  class Initializing {
    constructor(pendingMessages) {
      this.pendingMessages = pendingMessages;
      this.type = 0 /* Initializing */;
    }
  }
  WebviewState2.Initializing = Initializing;
  WebviewState2.Ready = { type: 1 /* Ready */ };
})(WebviewState || (WebviewState = {}));
const webviewIdContext = "webviewId";
let WebviewElement = class extends Disposable {
  constructor(initInfo, webviewThemeDataProvider, configurationService, contextMenuService, notificationService, _environmentService, _logService, _remoteAuthorityResolverService, _tunnelService, _accessibilityService, _instantiationService) {
    super();
    this.webviewThemeDataProvider = webviewThemeDataProvider;
    this._environmentService = _environmentService;
    this._logService = _logService;
    this._remoteAuthorityResolverService = _remoteAuthorityResolverService;
    this._tunnelService = _tunnelService;
    this._accessibilityService = _accessibilityService;
    this._instantiationService = _instantiationService;
    this.id = generateUuid();
    this._windowId = void 0;
    this._expectedServiceWorkerVersion = 6;
    this._state = new WebviewState.Initializing([]);
    this._resourceLoadingCts = this._register(new CancellationTokenSource());
    this._activeStreamControllers = /* @__PURE__ */ new Set();
    this._focusDelayer = this._register(new ThrottledDelayer(50));
    this._onDidHtmlChange = this._register(new Emitter());
    this.onDidHtmlChange = this._onDidHtmlChange.event;
    this._messageHandlers = /* @__PURE__ */ new Map();
    this.checkImeCompletionState = true;
    this.intrinsicContentSize = observableValue("WebviewIntrinsicContentSize", void 0);
    this._disposed = false;
    this._onMissingCsp = this._register(new Emitter());
    this.onMissingCsp = this._onMissingCsp.event;
    this._onDidClickLink = this._register(new Emitter());
    this.onDidClickLink = this._onDidClickLink.event;
    this._onMessage = this._register(new Emitter());
    this.onMessage = this._onMessage.event;
    this._onDidScroll = this._register(new Emitter());
    this.onDidScroll = this._onDidScroll.event;
    this._onDidWheel = this._register(new Emitter());
    this.onDidWheel = this._onDidWheel.event;
    this._onDidUpdateState = this._register(new Emitter());
    this.onDidUpdateState = this._onDidUpdateState.event;
    this._onDidFocus = this._register(new Emitter());
    this.onDidFocus = this._onDidFocus.event;
    this._onDidBlur = this._register(new Emitter());
    this.onDidBlur = this._onDidBlur.event;
    this._onFatalError = this._register(new Emitter());
    this.onFatalError = this._onFatalError.event;
    this._onDidDispose = this._register(new Emitter());
    this.onDidDispose = this._onDidDispose.event;
    this._hasAlertedAboutMissingCsp = false;
    this._hasFindResult = this._register(new Emitter());
    this.hasFindResult = this._hasFindResult.event;
    this._onDidStopFind = this._register(new Emitter());
    this.onDidStopFind = this._onDidStopFind.event;
    this.providedViewType = initInfo.providedViewType;
    this.origin = initInfo.origin ?? this.id;
    this._options = initInfo.options;
    this.extension = initInfo.extension;
    this._content = {
      html: "",
      title: initInfo.title,
      options: initInfo.contentOptions,
      state: void 0
    };
    this._portMappingManager = this._register(new WebviewPortMappingManager(
      () => this.extension?.location,
      () => this._content.options.portMapping || [],
      this._tunnelService
    ));
    this._element = this._createElement(initInfo.options, initInfo.contentOptions);
    this._register(this.on("no-csp-found", () => {
      this.handleNoCspFound();
    }));
    this._register(this.on("did-click-link", ({ uri }) => {
      if (!this.isActiveElement()) {
        return;
      }
      this._onDidClickLink.fire(uri);
    }));
    this._register(this.on("onmessage", ({ message, transfer }) => {
      this._onMessage.fire({ message, transfer });
    }));
    this._register(this.on("did-scroll", ({ scrollYPercentage }) => {
      this._onDidScroll.fire({ scrollYPercentage });
    }));
    this._register(this.on("do-reload", () => {
      this.reload();
    }));
    this._register(this.on("do-update-state", (state) => {
      this.state = state;
      this._onDidUpdateState.fire(state);
    }));
    this._register(this.on("did-focus", () => {
      this.handleFocusChange(true);
    }));
    this._register(this.on("did-blur", () => {
      this.handleFocusChange(false);
    }));
    this._register(this.on("did-scroll-wheel", (event) => {
      this._onDidWheel.fire(event);
    }));
    this._register(this.on("did-find", ({ didFind }) => {
      this._hasFindResult.fire(didFind);
    }));
    this._register(this.on("fatal-error", (e) => {
      notificationService.error(localize("fatalErrorMessage", "Error loading webview: {0}", e.message));
      this._onFatalError.fire({ message: e.message });
    }));
    this._register(this.on("did-keydown", (data) => {
      this.handleKeyEvent("keydown", data);
    }));
    this._register(this.on("did-keyup", (data) => {
      this.handleKeyEvent("keyup", data);
    }));
    this._register(this.on("did-context-menu", (data) => {
      if (!this.element) {
        return;
      }
      if (!this._contextKeyService) {
        return;
      }
      const elementBox = this.element.getBoundingClientRect();
      const contextKeyService = this._contextKeyService.createOverlay([
        ...Object.entries(data.context),
        [webviewIdContext, this.providedViewType]
      ]);
      contextMenuService.showContextMenu({
        menuId: MenuId.WebviewContext,
        menuActionOptions: { shouldForwardArgs: true },
        contextKeyService,
        getActionsContext: () => ({ ...data.context, webview: this.providedViewType }),
        getAnchor: () => ({
          x: elementBox.x + data.clientX,
          y: elementBox.y + data.clientY
        })
      });
      this._send("set-context-menu-visible", { visible: true });
    }));
    this._register(this.on("load-resource", async (entry) => {
      try {
        const authority = decodeAuthority(entry.authority);
        const uri = URI.from({
          scheme: entry.scheme,
          authority,
          path: decodeURIComponent(entry.path),
          // This gets re-encoded
          query: entry.query ? decodeURIComponent(entry.query) : entry.query
        });
        this.loadResource(entry.id, uri, { ifNoneMatch: entry.ifNoneMatch, range: entry.range }, this._resourceLoadingCts.token);
      } catch (e) {
        this._send("did-load-resource", {
          id: entry.id,
          status: 404,
          path: entry.path
        });
      }
    }));
    this._register(this.on("load-localhost", (entry) => {
      this.localLocalhost(entry.id, entry.origin);
    }));
    this._register(Event.runAndSubscribe(webviewThemeDataProvider.onThemeDataChanged, () => this.style()));
    this._register(_accessibilityService.onDidChangeReducedMotion(() => this.style()));
    this._register(_accessibilityService.onDidChangeScreenReaderOptimized(() => this.style()));
    this._register(contextMenuService.onDidHideContextMenu(() => this._send("set-context-menu-visible", { visible: false })));
    this._confirmBeforeClose = configurationService.getValue("window.confirmBeforeClose");
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("window.confirmBeforeClose")) {
        this._confirmBeforeClose = configurationService.getValue("window.confirmBeforeClose");
        this._send("set-confirm-before-close", this._confirmBeforeClose);
      }
    }));
    this._register(this.on("drag-start", () => {
      this._startBlockingIframeDragEvents();
    }));
    this._register(this.on("drag", (event) => {
      this.handleDragEvent("drag", event);
    }));
    this._register(this.on("updated-intrinsic-content-size", (event) => {
      this.intrinsicContentSize.set({ width: event.width, height: event.height }, void 0, void 0);
    }));
    if (initInfo.options.enableFindWidget) {
      this._webviewFindWidget = this._register(this._instantiationService.createInstance(WebviewFindWidget, this));
    }
  }
  get window() {
    return typeof this._windowId === "number" ? getWindowById(this._windowId)?.window : void 0;
  }
  get platform() {
    return "browser";
  }
  get element() {
    return this._element;
  }
  get isFocused() {
    if (!this._focused) {
      return false;
    }
    if (!this.window) {
      return false;
    }
    if (this.window.document.activeElement && this.window.document.activeElement !== this.element) {
      return false;
    }
    return true;
  }
  dispose() {
    this._disposed = true;
    this.element?.remove();
    this._element = void 0;
    this._messagePort = void 0;
    if (this._state.type === 0 /* Initializing */) {
      for (const message of this._state.pendingMessages) {
        message.resolve(false);
      }
      this._state.pendingMessages = [];
    }
    this._onDidDispose.fire();
    for (const controller of this._activeStreamControllers) {
      try {
        controller.close();
      } catch {
      }
    }
    this._activeStreamControllers.clear();
    this._resourceLoadingCts.dispose(true);
    super.dispose();
  }
  setContextKeyService(contextKeyService) {
    this._contextKeyService = contextKeyService;
  }
  postMessage(message, transfer) {
    return this._send("message", { message, transfer });
  }
  async _send(channel, data, _createElement = []) {
    if (this._state.type === 0 /* Initializing */) {
      const { promise, resolve } = promiseWithResolvers();
      this._state.pendingMessages.push({ channel, data, transferable: _createElement, resolve });
      return promise;
    } else {
      return this.doPostMessage(channel, data, _createElement);
    }
  }
  _createElement(options, _contentOptions) {
    const element = document.createElement("iframe");
    element.name = this.id;
    element.className = `webview ${options.customClasses || ""}`;
    element.sandbox.add("allow-scripts", "allow-same-origin", "allow-forms", "allow-pointer-lock", "allow-downloads");
    const allowRules = ["cross-origin-isolated", "autoplay", "local-network-access"];
    if (!isFirefox) {
      allowRules.push("clipboard-read", "clipboard-write");
    }
    element.setAttribute("allow", allowRules.join("; "));
    element.style.border = "none";
    element.style.width = "100%";
    element.style.height = "100%";
    element.focus = () => {
      this._doFocus();
    };
    return element;
  }
  _initElement(encodedWebviewOrigin, extension, options, targetWindow) {
    const params = {
      id: this.id,
      parentId: targetWindow.vscodeWindowId.toString(),
      origin: this.origin,
      swVersion: String(this._expectedServiceWorkerVersion),
      extensionId: extension?.id.value ?? "",
      platform: this.platform,
      "vscode-resource-base-authority": webviewRootResourceAuthority,
      parentOrigin: targetWindow.origin
    };
    if (this._options.disableServiceWorker) {
      params.disableServiceWorker = "true";
    }
    if (this._environmentService.remoteAuthority) {
      params.remoteAuthority = this._environmentService.remoteAuthority;
    }
    if (options.purpose) {
      params.purpose = options.purpose;
    }
    COI.addSearchParam(params, true, true);
    const queryString = new URLSearchParams(params).toString();
    this.perfMark("init/set-src");
    const fileName = "index.html";
    this.element.setAttribute("src", `${this.webviewContentEndpoint(encodedWebviewOrigin)}/${fileName}?${queryString}`);
  }
  mountTo(element, targetWindow) {
    if (!this.element) {
      return;
    }
    this._windowId = targetWindow.vscodeWindowId;
    this._encodedWebviewOriginPromise = parentOriginHash(targetWindow.origin, this.origin).then((id) => this._encodedWebviewOrigin = id);
    this._encodedWebviewOriginPromise.then((encodedWebviewOrigin) => {
      if (!this._disposed) {
        this._initElement(encodedWebviewOrigin, this.extension, this._options, targetWindow);
      }
    });
    this._registerMessageHandler(targetWindow);
    if (this._webviewFindWidget) {
      element.appendChild(this._webviewFindWidget.getDomNode());
    }
    for (const eventName of [EventType.MOUSE_DOWN, EventType.MOUSE_MOVE, EventType.DROP]) {
      this._register(addDisposableListener(element, eventName, () => {
        this._stopBlockingIframeDragEvents();
      }));
    }
    for (const node of [element, targetWindow]) {
      this._register(addDisposableListener(node, EventType.DRAG_END, () => {
        this._stopBlockingIframeDragEvents();
      }));
    }
    element.id = this.id;
    this.perfMark("mounted");
    element.appendChild(this.element);
  }
  _registerMessageHandler(targetWindow) {
    const subscription = this._register(addDisposableListener(targetWindow, "message", (e) => {
      if (!this._encodedWebviewOrigin || e?.data?.target !== this.id) {
        return;
      }
      if (e.origin !== this._webviewContentOrigin(this._encodedWebviewOrigin)) {
        console.log(`Skipped renderer receiving message due to mismatched origins: ${e.origin} ${this._webviewContentOrigin}`);
        return;
      }
      if (e.data.channel === "webview-ready") {
        if (this._messagePort) {
          return;
        }
        this.perfMark("webview-ready");
        this._logService.trace(`Webview(${this.id}): webview ready`);
        this._messagePort = e.ports[0];
        this._messagePort.onmessage = (e2) => {
          const handlers = this._messageHandlers.get(e2.data.channel);
          if (!handlers) {
            console.log(`No handlers found for '${e2.data.channel}'`);
            return;
          }
          handlers?.forEach((handler) => handler(e2.data.data, e2));
        };
        this.element?.classList.add("ready");
        if (this._state.type === 0 /* Initializing */) {
          this._state.pendingMessages.forEach(({ channel, data, resolve }) => resolve(this.doPostMessage(channel, data)));
        }
        this._state = WebviewState.Ready;
        subscription.dispose();
      }
    }));
  }
  perfMark(name) {
    performance.mark(`webview/webviewElement/${name}`, {
      detail: {
        id: this.id
      }
    });
  }
  _startBlockingIframeDragEvents() {
    if (this.element) {
      this.element.style.pointerEvents = "none";
    }
  }
  _stopBlockingIframeDragEvents() {
    if (this.element) {
      this.element.style.pointerEvents = "auto";
    }
  }
  webviewContentEndpoint(encodedWebviewOrigin) {
    const webviewExternalEndpoint = this._environmentService.webviewExternalEndpoint;
    if (!webviewExternalEndpoint) {
      throw new Error(`'webviewExternalEndpoint' has not been configured. Webviews will not work!`);
    }
    const endpoint = webviewExternalEndpoint.replace("{{uuid}}", encodedWebviewOrigin);
    if (endpoint[endpoint.length - 1] === "/") {
      return endpoint.slice(0, endpoint.length - 1);
    }
    return endpoint;
  }
  _webviewContentOrigin(encodedWebviewOrigin) {
    const uri = URI.parse(this.webviewContentEndpoint(encodedWebviewOrigin));
    return uri.scheme + "://" + uri.authority.toLowerCase();
  }
  doPostMessage(channel, data, transferable = []) {
    if (this.element && this._messagePort) {
      this._messagePort.postMessage({ channel, args: data }, transferable);
      return true;
    }
    return false;
  }
  on(channel, handler) {
    let handlers = this._messageHandlers.get(channel);
    if (!handlers) {
      handlers = /* @__PURE__ */ new Set();
      this._messageHandlers.set(channel, handlers);
    }
    handlers.add(handler);
    return toDisposable(() => {
      this._messageHandlers.get(channel)?.delete(handler);
    });
  }
  handleNoCspFound() {
    if (this._hasAlertedAboutMissingCsp) {
      return;
    }
    this._hasAlertedAboutMissingCsp = true;
    if (this.extension?.id) {
      if (this._environmentService.isExtensionDevelopment) {
        this._onMissingCsp.fire(this.extension.id);
      }
    }
  }
  reload() {
    this.doUpdateContent(this._content);
  }
  reinitializeAfterDismount() {
    this._state = new WebviewState.Initializing([]);
    this._messagePort = void 0;
    this.mountTo(this.element.parentElement, getWindow(this.element));
    this.style();
    this.reload();
  }
  setHtml(html) {
    this.doUpdateContent({ ...this._content, html });
    this._onDidHtmlChange.fire(html);
  }
  setTitle(title) {
    this._content = { ...this._content, title };
    this._send("set-title", title);
  }
  set contentOptions(options) {
    this._logService.debug(`Webview(${this.id}): will update content options`);
    if (areWebviewContentOptionsEqual(options, this._content.options)) {
      this._logService.debug(`Webview(${this.id}): skipping content options update`);
      return;
    }
    this.doUpdateContent({ ...this._content, options });
  }
  set localResourcesRoot(resources) {
    this._content = {
      ...this._content,
      options: { ...this._content.options, localResourceRoots: resources }
    };
  }
  set state(state) {
    this._content = { ...this._content, state };
  }
  set initialScrollProgress(value) {
    this._send("initial-scroll-position", value);
  }
  doUpdateContent(newContent) {
    this._logService.debug(`Webview(${this.id}): will update content`);
    this._content = newContent;
    const allowScripts = !!this._content.options.allowScripts;
    this.perfMark("set-content");
    this._send("content", {
      contents: this._content.html,
      title: this._content.title,
      options: {
        allowMultipleAPIAcquire: !!this._content.options.allowMultipleAPIAcquire,
        allowScripts,
        allowForms: this._content.options.allowForms ?? allowScripts
        // For back compat, we allow forms by default when scripts are enabled
      },
      state: this._content.state,
      cspSource: webviewGenericCspSource,
      confirmBeforeClose: this._confirmBeforeClose
    });
  }
  style() {
    let { styles, activeTheme, themeLabel, themeId } = this.webviewThemeDataProvider.getWebviewThemeData();
    if (this._options.transformCssVariables) {
      styles = this._options.transformCssVariables(styles);
    }
    const reduceMotion = this._accessibilityService.isMotionReduced();
    const screenReader = this._accessibilityService.isScreenReaderOptimized();
    this._send("styles", { styles, activeTheme, themeId, themeLabel, reduceMotion, screenReader });
  }
  handleFocusChange(isFocused) {
    this._focused = isFocused;
    if (isFocused) {
      this._onDidFocus.fire();
    } else {
      this._onDidBlur.fire();
    }
  }
  shouldForwardKeyEvent(event) {
    return event.isTrusted || !!this._content.options.forwardUntrustedKeypressEvents;
  }
  isActiveElement() {
    return !!this.element && this.window?.document.activeElement === this.element;
  }
  handleKeyEvent(type, event) {
    if (!this.shouldForwardKeyEvent(event) || !this.isActiveElement()) {
      return;
    }
    const emulatedKeyboardEvent = new KeyboardEvent(type, event);
    Object.defineProperty(emulatedKeyboardEvent, "target", {
      get: () => this.element
    });
    this.window?.dispatchEvent(emulatedKeyboardEvent);
  }
  handleDragEvent(type, event) {
    const emulatedDragEvent = new DragEvent(type, event);
    Object.defineProperty(emulatedDragEvent, "target", {
      get: () => this.element
    });
    this.window?.dispatchEvent(emulatedDragEvent);
  }
  windowDidDragStart() {
    this._startBlockingIframeDragEvents();
  }
  windowDidDragEnd() {
    this._stopBlockingIframeDragEvents();
  }
  selectAll() {
    this.execCommand("selectAll");
  }
  copy() {
    this.execCommand("copy");
  }
  paste() {
    this.execCommand("paste");
  }
  cut() {
    this.execCommand("cut");
  }
  undo() {
    this.execCommand("undo");
  }
  redo() {
    this.execCommand("redo");
  }
  execCommand(command) {
    if (this.element) {
      this._send("execCommand", command);
    }
  }
  async loadResource(id, uri, options, token) {
    if (this._disposed) {
      return;
    }
    try {
      const result = await this._instantiationService.invokeFunction(loadLocalResource, uri, {
        ifNoneMatch: options.ifNoneMatch,
        roots: this._content.options.localResourceRoots || [],
        range: options.range
      }, token);
      if (this._disposed) {
        return;
      }
      switch (result.type) {
        case WebviewResourceResponse.Type.Success: {
          const range = options.range;
          const requestedRangeEnd = range?.end !== void 0 ? range.end : result.size - 1;
          const rangeEnd = Math.min(requestedRangeEnd, result.size - 1);
          const rangeHeader = range ? `bytes ${range.start}-${rangeEnd}/${result.size}` : void 0;
          if (WebviewElement._supportsTransferableStreams.value) {
            const streamCts = this.platform === "electron" ? new CancellationTokenSource(token) : void 0;
            let controller;
            let closed = false;
            const close = () => {
              if (!closed) {
                closed = true;
                streamCts?.dispose();
                if (controller) {
                  this._activeStreamControllers.delete(controller);
                  try {
                    controller.close();
                  } catch {
                  }
                }
              }
            };
            const stream = new ReadableStream({
              start: (newController) => {
                controller = newController;
                this._activeStreamControllers.add(controller);
                listenStream(result.stream, {
                  onData: (chunk) => {
                    if (!closed) {
                      try {
                        controller?.enqueue(new Uint8Array(chunk.buffer));
                      } catch {
                        close();
                      }
                    }
                  },
                  onError: (err) => {
                    if (!closed) {
                      closed = true;
                      streamCts?.dispose();
                      const currentController = controller;
                      if (currentController) {
                        this._activeStreamControllers.delete(currentController);
                        try {
                          currentController.error(err);
                        } catch {
                        }
                      }
                    }
                  },
                  onEnd: () => close()
                }, streamCts?.token ?? token);
              },
              cancel: streamCts ? () => {
                streamCts.dispose(true);
                result.stream.destroy();
                close();
              } : void 0
            });
            this._send("did-load-resource", {
              id,
              status: range ? 206 : 200,
              path: uri.path,
              mime: result.mimeType,
              etag: result.etag,
              mtime: result.mtime,
              range: rangeHeader,
              stream
            }, [stream]);
          } else {
            this._send("did-load-resource", {
              id,
              status: range ? 206 : 200,
              path: uri.path,
              mime: result.mimeType,
              etag: result.etag,
              mtime: result.mtime,
              range: rangeHeader
            });
            listenStream(result.stream, {
              onData: (chunk) => {
                const data = new Uint8Array(chunk.buffer);
                this._send("did-load-resource-chunk", { id, data }, [data.buffer]);
              },
              onError: () => {
                this._send("did-load-resource-end", { id, error: true });
              },
              onEnd: () => {
                this._send("did-load-resource-end", { id });
              }
            }, token);
          }
          return;
        }
        case WebviewResourceResponse.Type.NotModified: {
          return this._send("did-load-resource", {
            id,
            status: 304,
            // not modified
            path: uri.path,
            mime: result.mimeType,
            mtime: result.mtime
          });
        }
        case WebviewResourceResponse.Type.AccessDenied: {
          return this._send("did-load-resource", {
            id,
            status: 401,
            // unauthorized
            path: uri.path
          });
        }
      }
    } catch {
    }
    return this._send("did-load-resource", {
      id,
      status: 404,
      path: uri.path
    });
  }
  async localLocalhost(id, origin) {
    const authority = this._environmentService.remoteAuthority;
    const resolveAuthority = authority ? await this._remoteAuthorityResolverService.resolveAuthority(authority) : void 0;
    const redirect = resolveAuthority ? await this._portMappingManager.getRedirect(resolveAuthority.authority, origin) : void 0;
    return this._send("did-load-localhost", {
      id,
      origin,
      location: redirect
    });
  }
  focus() {
    this._doFocus();
    this.handleFocusChange(true);
  }
  _doFocus() {
    if (!this.element) {
      return;
    }
    try {
      this.element.contentWindow?.focus();
    } catch {
    }
    this._focusDelayer.trigger(async () => {
      if (!this.isFocused || !this.element) {
        return;
      }
      if (this.window?.document.activeElement && this.window.document.activeElement !== this.element && this.window.document.activeElement?.tagName !== "BODY") {
        return;
      }
      this.window?.document.body?.focus();
      this._send("focus", void 0);
    });
  }
  /**
   * Webviews expose a stateful find API.
   * Successive calls to find will move forward or backward through onFindResults
   * depending on the supplied options.
   *
   * @param value The string to search for. Empty strings are ignored.
   */
  find(value, previous) {
    if (!this.element) {
      return;
    }
    this._send("find", { value, previous });
  }
  updateFind(value) {
    if (!value || !this.element) {
      return;
    }
    this._send("find", { value });
  }
  stopFind(keepSelection) {
    if (!this.element) {
      return;
    }
    this._send("find-stop", { clearSelection: !keepSelection });
    this._onDidStopFind.fire();
  }
  showFind(animated = true) {
    this._webviewFindWidget?.reveal(void 0, animated);
  }
  hideFind(animated = true) {
    this._webviewFindWidget?.hide(animated);
  }
  runFindAction(previous) {
    this._webviewFindWidget?.find(previous);
  }
};
WebviewElement._supportsTransferableStreams = new Lazy(() => {
  try {
    const stream = new ReadableStream();
    const mc = new MessageChannel();
    mc.port1.postMessage(stream, [stream]);
    mc.port1.close();
    mc.port2.close();
    return true;
  } catch {
    return false;
  }
});
WebviewElement = __decorateClass([
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IWorkbenchEnvironmentService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IRemoteAuthorityResolverService),
  __decorateParam(8, ITunnelService),
  __decorateParam(9, IAccessibilityService),
  __decorateParam(10, IInstantiationService)
], WebviewElement);
export {
  WebviewElement
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHdlYnZpZXdcXGJyb3dzZXJcXHdlYnZpZXdFbGVtZW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaXNGaXJlZm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBFdmVudFR5cGUsIGdldFdpbmRvdywgZ2V0V2luZG93QnlJZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcGFyZW50T3JpZ2luSGFzaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9pZnJhbWUuanMnO1xuaW1wb3J0IHsgSU1vdXNlV2hlZWxFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IENvZGVXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IHByb21pc2VXaXRoUmVzb2x2ZXJzLCBUaHJvdHRsZWREZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBDT0kgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgbGlzdGVuU3RyZWFtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyZWFtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVJlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSVR1bm5lbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90dW5uZWwvY29tbW9uL3R1bm5lbC5qcyc7XG5pbXBvcnQgeyBXZWJ2aWV3UG9ydE1hcHBpbmdNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd2Vidmlldy9jb21tb24vd2Vidmlld1BvcnRNYXBwaW5nLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGRlY29kZUF1dGhvcml0eSwgd2Vidmlld0dlbmVyaWNDc3BTb3VyY2UsIHdlYnZpZXdSb290UmVzb3VyY2VBdXRob3JpdHkgfSBmcm9tICcuLi9jb21tb24vd2Vidmlldy5qcyc7XG5pbXBvcnQgeyBsb2FkTG9jYWxSZXNvdXJjZSwgV2Vidmlld1Jlc291cmNlUmVzcG9uc2UgfSBmcm9tICcuL3Jlc291cmNlTG9hZGluZy5qcyc7XG5pbXBvcnQgeyBXZWJ2aWV3VGhlbWVEYXRhUHJvdmlkZXIgfSBmcm9tICcuL3RoZW1laW5nLmpzJztcbmltcG9ydCB7IGFyZVdlYnZpZXdDb250ZW50T3B0aW9uc0VxdWFsLCBJV2Vidmlld0VsZW1lbnQsIFdlYnZpZXdDb250ZW50T3B0aW9ucywgV2Vidmlld0V4dGVuc2lvbkRlc2NyaXB0aW9uLCBXZWJ2aWV3SW5pdEluZm8sIFdlYnZpZXdNZXNzYWdlUmVjZWl2ZWRFdmVudCwgV2Vidmlld09wdGlvbnMgfSBmcm9tICcuL3dlYnZpZXcuanMnO1xuaW1wb3J0IHsgV2Vidmlld0ZpbmREZWxlZ2F0ZSwgV2Vidmlld0ZpbmRXaWRnZXQgfSBmcm9tICcuL3dlYnZpZXdGaW5kV2lkZ2V0LmpzJztcbmltcG9ydCB7IEZyb21XZWJ2aWV3TWVzc2FnZSwgS2V5RXZlbnQsIFRvV2Vidmlld01lc3NhZ2UsIFdlYlZpZXdEcmFnRXZlbnQgfSBmcm9tICcuL3dlYnZpZXdNZXNzYWdlcy5qcyc7XG5cbmludGVyZmFjZSBXZWJ2aWV3Q29udGVudCB7XG5cdHJlYWRvbmx5IGh0bWw6IHN0cmluZztcblx0cmVhZG9ubHkgdGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgb3B0aW9uczogV2Vidmlld0NvbnRlbnRPcHRpb25zO1xuXHRyZWFkb25seSBzdGF0ZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5uYW1lc3BhY2UgV2Vidmlld1N0YXRlIHtcblx0ZXhwb3J0IGNvbnN0IGVudW0gVHlwZSB7IEluaXRpYWxpemluZywgUmVhZHkgfVxuXG5cdGV4cG9ydCBjbGFzcyBJbml0aWFsaXppbmcge1xuXHRcdHJlYWRvbmx5IHR5cGUgPSBUeXBlLkluaXRpYWxpemluZztcblxuXHRcdGNvbnN0cnVjdG9yKFxuXHRcdFx0cHVibGljIHBlbmRpbmdNZXNzYWdlczogQXJyYXk8e1xuXHRcdFx0XHRyZWFkb25seSBjaGFubmVsOiBzdHJpbmc7XG5cdFx0XHRcdHJlYWRvbmx5IGRhdGE/OiBhbnk7XG5cdFx0XHRcdHJlYWRvbmx5IHRyYW5zZmVyYWJsZTogVHJhbnNmZXJhYmxlW107XG5cdFx0XHRcdHJlYWRvbmx5IHJlc29sdmU6IChwb3N0ZWQ6IGJvb2xlYW4pID0+IHZvaWQ7XG5cdFx0XHR9PlxuXHRcdCkgeyB9XG5cdH1cblxuXHRleHBvcnQgY29uc3QgUmVhZHkgPSB7IHR5cGU6IFR5cGUuUmVhZHkgfSBhcyBjb25zdDtcblxuXHRleHBvcnQgdHlwZSBTdGF0ZSA9IHR5cGVvZiBSZWFkeSB8IEluaXRpYWxpemluZztcbn1cblxuaW50ZXJmYWNlIFdlYnZpZXdBY3Rpb25Db250ZXh0IHtcblx0cmVhZG9ubHkgd2Vidmlldz86IHN0cmluZztcblx0cmVhZG9ubHkgW2tleTogc3RyaW5nXTogdW5rbm93bjtcbn1cblxuY29uc3Qgd2Vidmlld0lkQ29udGV4dCA9ICd3ZWJ2aWV3SWQnO1xuXG5leHBvcnQgY2xhc3MgV2Vidmlld0VsZW1lbnQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdlYnZpZXdFbGVtZW50LCBXZWJ2aWV3RmluZERlbGVnYXRlIHtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgaWQgPSBnZW5lcmF0ZVV1aWQoKTtcblxuXHQvKipcblx0ICogVGhlIHByb3ZpZGVkIGlkZW50aWZpZXIgb2YgdGhpcyB3ZWJ2aWV3LlxuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IHByb3ZpZGVkVmlld1R5cGU/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFRoZSBvcmlnaW4gdGhpcyB3ZWJ2aWV3IGl0c2VsZiBpcyBsb2FkZWQgZnJvbS4gTWF5IG5vdCBiZSB1bmlxdWVcblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBvcmlnaW46IHN0cmluZztcblxuXHRwcml2YXRlIF93aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIGdldCB3aW5kb3coKSB7IHJldHVybiB0eXBlb2YgdGhpcy5fd2luZG93SWQgPT09ICdudW1iZXInID8gZ2V0V2luZG93QnlJZCh0aGlzLl93aW5kb3dJZCk/LndpbmRvdyA6IHVuZGVmaW5lZDsgfVxuXG5cdHByaXZhdGUgX2VuY29kZWRXZWJ2aWV3T3JpZ2luUHJvbWlzZT86IFByb21pc2U8c3RyaW5nPjtcblx0cHJpdmF0ZSBfZW5jb2RlZFdlYnZpZXdPcmlnaW46IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRwcm90ZWN0ZWQgZ2V0IHBsYXRmb3JtKCk6IHN0cmluZyB7IHJldHVybiAnYnJvd3Nlcic7IH1cblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfc3VwcG9ydHNUcmFuc2ZlcmFibGVTdHJlYW1zID0gbmV3IExhenk8Ym9vbGVhbj4oKCkgPT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzdHJlYW0gPSBuZXcgUmVhZGFibGVTdHJlYW0oKTtcblx0XHRcdGNvbnN0IG1jID0gbmV3IE1lc3NhZ2VDaGFubmVsKCk7XG5cdFx0XHRtYy5wb3J0MS5wb3N0TWVzc2FnZShzdHJlYW0sIFtzdHJlYW1dKTtcblx0XHRcdG1jLnBvcnQxLmNsb3NlKCk7XG5cdFx0XHRtYy5wb3J0Mi5jbG9zZSgpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9leHBlY3RlZFNlcnZpY2VXb3JrZXJWZXJzaW9uID0gNjsgLy8gS2VlcCB0aGlzIGluIHN5bmMgd2l0aCB0aGUgdmVyc2lvbiBpbiBzZXJ2aWNlLXdvcmtlci5qc1xuXG5cdHByaXZhdGUgX2VsZW1lbnQ6IEhUTUxJRnJhbWVFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcm90ZWN0ZWQgZ2V0IGVsZW1lbnQoKTogSFRNTElGcmFtZUVsZW1lbnQgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fZWxlbWVudDsgfVxuXG5cdHByaXZhdGUgX2ZvY3VzZWQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBnZXQgaXNGb2N1c2VkKCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5fZm9jdXNlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHQvLyBjb2RlIHdpbmRvdyBpcyBvbmx5IGF2YWlsYWJsZSBhZnRlciB0aGUgd2VidmlldyBpcyBtb3VudGVkLlxuXHRcdGlmICghdGhpcy53aW5kb3cpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy53aW5kb3cuZG9jdW1lbnQuYWN0aXZlRWxlbWVudCAmJiB0aGlzLndpbmRvdy5kb2N1bWVudC5hY3RpdmVFbGVtZW50ICE9PSB0aGlzLmVsZW1lbnQpIHtcblx0XHRcdC8vIGxvb2tzIGxpa2UgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEzMjY0MVxuXHRcdFx0Ly8gd2hlcmUgdGhlIGZvY3VzIGlzIGFjdHVhbGx5IG5vdCBpbiB0aGUgYDxpZnJhbWU+YFxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX3N0YXRlOiBXZWJ2aWV3U3RhdGUuU3RhdGUgPSBuZXcgV2Vidmlld1N0YXRlLkluaXRpYWxpemluZyhbXSk7XG5cblx0cHJpdmF0ZSBfY29udGVudDogV2Vidmlld0NvbnRlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcG9ydE1hcHBpbmdNYW5hZ2VyOiBXZWJ2aWV3UG9ydE1hcHBpbmdNYW5hZ2VyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc291cmNlTG9hZGluZ0N0cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlU3RyZWFtQ29udHJvbGxlcnMgPSBuZXcgU2V0PFJlYWRhYmxlU3RyZWFtRGVmYXVsdENvbnRyb2xsZXI+KCk7XG5cblx0cHJpdmF0ZSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9jb25maXJtQmVmb3JlQ2xvc2U6IHN0cmluZztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9mb2N1c0RlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGhyb3R0bGVkRGVsYXllcig1MCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkSHRtbENoYW5nZTogRW1pdHRlcjxzdHJpbmc+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IG9uRGlkSHRtbENoYW5nZSA9IHRoaXMuX29uRGlkSHRtbENoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIF9tZXNzYWdlUG9ydD86IE1lc3NhZ2VQb3J0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tZXNzYWdlSGFuZGxlcnMgPSBuZXcgTWFwPHN0cmluZywgU2V0PChkYXRhOiBhbnksIGU6IE1lc3NhZ2VFdmVudCkgPT4gdm9pZD4+KCk7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF93ZWJ2aWV3RmluZFdpZGdldDogV2Vidmlld0ZpbmRXaWRnZXQgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyByZWFkb25seSBjaGVja0ltZUNvbXBsZXRpb25TdGF0ZSA9IHRydWU7XG5cblx0cHVibGljIHJlYWRvbmx5IGludHJpbnNpY0NvbnRlbnRTaXplID0gb2JzZXJ2YWJsZVZhbHVlPHsgcmVhZG9ubHkgd2lkdGg6IG51bWJlcjsgcmVhZG9ubHkgaGVpZ2h0OiBudW1iZXIgfSB8IHVuZGVmaW5lZD4oJ1dlYnZpZXdJbnRyaW5zaWNDb250ZW50U2l6ZScsIHVuZGVmaW5lZCk7XG5cblx0cHJpdmF0ZSBfZGlzcG9zZWQgPSBmYWxzZTtcblxuXG5cdHB1YmxpYyBleHRlbnNpb246IFdlYnZpZXdFeHRlbnNpb25EZXNjcmlwdGlvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogV2Vidmlld09wdGlvbnM7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aW5pdEluZm86IFdlYnZpZXdJbml0SW5mbyxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgd2Vidmlld1RoZW1lRGF0YVByb3ZpZGVyOiBXZWJ2aWV3VGhlbWVEYXRhUHJvdmlkZXIsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2Ugbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVJlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2U6IElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UsXG5cdFx0QElUdW5uZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3R1bm5lbFNlcnZpY2U6IElUdW5uZWxTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnByb3ZpZGVkVmlld1R5cGUgPSBpbml0SW5mby5wcm92aWRlZFZpZXdUeXBlO1xuXHRcdHRoaXMub3JpZ2luID0gaW5pdEluZm8ub3JpZ2luID8/IHRoaXMuaWQ7XG5cblx0XHR0aGlzLl9vcHRpb25zID0gaW5pdEluZm8ub3B0aW9ucztcblx0XHR0aGlzLmV4dGVuc2lvbiA9IGluaXRJbmZvLmV4dGVuc2lvbjtcblxuXHRcdHRoaXMuX2NvbnRlbnQgPSB7XG5cdFx0XHRodG1sOiAnJyxcblx0XHRcdHRpdGxlOiBpbml0SW5mby50aXRsZSxcblx0XHRcdG9wdGlvbnM6IGluaXRJbmZvLmNvbnRlbnRPcHRpb25zLFxuXHRcdFx0c3RhdGU6IHVuZGVmaW5lZFxuXHRcdH07XG5cblx0XHR0aGlzLl9wb3J0TWFwcGluZ01hbmFnZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgV2Vidmlld1BvcnRNYXBwaW5nTWFuYWdlcihcblx0XHRcdCgpID0+IHRoaXMuZXh0ZW5zaW9uPy5sb2NhdGlvbixcblx0XHRcdCgpID0+IHRoaXMuX2NvbnRlbnQub3B0aW9ucy5wb3J0TWFwcGluZyB8fCBbXSxcblx0XHRcdHRoaXMuX3R1bm5lbFNlcnZpY2Vcblx0XHQpKTtcblxuXHRcdHRoaXMuX2VsZW1lbnQgPSB0aGlzLl9jcmVhdGVFbGVtZW50KGluaXRJbmZvLm9wdGlvbnMsIGluaXRJbmZvLmNvbnRlbnRPcHRpb25zKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub24oJ25vLWNzcC1mb3VuZCcsICgpID0+IHtcblx0XHRcdHRoaXMuaGFuZGxlTm9Dc3BGb3VuZCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub24oJ2RpZC1jbGljay1saW5rJywgKHsgdXJpIH0pID0+IHtcblx0XHRcdGlmICghdGhpcy5pc0FjdGl2ZUVsZW1lbnQoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkRpZENsaWNrTGluay5maXJlKHVyaSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbignb25tZXNzYWdlJywgKHsgbWVzc2FnZSwgdHJhbnNmZXIgfSkgPT4ge1xuXHRcdFx0dGhpcy5fb25NZXNzYWdlLmZpcmUoeyBtZXNzYWdlLCB0cmFuc2ZlciB9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uKCdkaWQtc2Nyb2xsJywgKHsgc2Nyb2xsWVBlcmNlbnRhZ2UgfSkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRTY3JvbGwuZmlyZSh7IHNjcm9sbFlQZXJjZW50YWdlIH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub24oJ2RvLXJlbG9hZCcsICgpID0+IHtcblx0XHRcdHRoaXMucmVsb2FkKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbignZG8tdXBkYXRlLXN0YXRlJywgKHN0YXRlKSA9PiB7XG5cdFx0XHR0aGlzLnN0YXRlID0gc3RhdGU7XG5cdFx0XHR0aGlzLl9vbkRpZFVwZGF0ZVN0YXRlLmZpcmUoc3RhdGUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub24oJ2RpZC1mb2N1cycsICgpID0+IHtcblx0XHRcdHRoaXMuaGFuZGxlRm9jdXNDaGFuZ2UodHJ1ZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbignZGlkLWJsdXInLCAoKSA9PiB7XG5cdFx0XHR0aGlzLmhhbmRsZUZvY3VzQ2hhbmdlKGZhbHNlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uKCdkaWQtc2Nyb2xsLXdoZWVsJywgKGV2ZW50KSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZFdoZWVsLmZpcmUoZXZlbnQpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub24oJ2RpZC1maW5kJywgKHsgZGlkRmluZCB9KSA9PiB7XG5cdFx0XHR0aGlzLl9oYXNGaW5kUmVzdWx0LmZpcmUoZGlkRmluZCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbignZmF0YWwtZXJyb3InLCAoZSkgPT4ge1xuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnZmF0YWxFcnJvck1lc3NhZ2UnLCBcIkVycm9yIGxvYWRpbmcgd2VidmlldzogezB9XCIsIGUubWVzc2FnZSkpO1xuXHRcdFx0dGhpcy5fb25GYXRhbEVycm9yLmZpcmUoeyBtZXNzYWdlOiBlLm1lc3NhZ2UgfSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbignZGlkLWtleWRvd24nLCAoZGF0YSkgPT4ge1xuXHRcdFx0dGhpcy5oYW5kbGVLZXlFdmVudCgna2V5ZG93bicsIGRhdGEpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub24oJ2RpZC1rZXl1cCcsIChkYXRhKSA9PiB7XG5cdFx0XHR0aGlzLmhhbmRsZUtleUV2ZW50KCdrZXl1cCcsIGRhdGEpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub24oJ2RpZC1jb250ZXh0LW1lbnUnLCAoZGF0YSkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLmVsZW1lbnQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLl9jb250ZXh0S2V5U2VydmljZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlbGVtZW50Qm94ID0gdGhpcy5lbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSB0aGlzLl9jb250ZXh0S2V5U2VydmljZS5jcmVhdGVPdmVybGF5KFtcblx0XHRcdFx0Li4uT2JqZWN0LmVudHJpZXMoZGF0YS5jb250ZXh0KSxcblx0XHRcdFx0W3dlYnZpZXdJZENvbnRleHQsIHRoaXMucHJvdmlkZWRWaWV3VHlwZV0sXG5cdFx0XHRdKTtcblx0XHRcdGNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRtZW51SWQ6IE1lbnVJZC5XZWJ2aWV3Q29udGV4dCxcblx0XHRcdFx0bWVudUFjdGlvbk9wdGlvbnM6IHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSxcblx0XHRcdFx0Y29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRcdGdldEFjdGlvbnNDb250ZXh0OiAoKTogV2Vidmlld0FjdGlvbkNvbnRleHQgPT4gKHsgLi4uZGF0YS5jb250ZXh0LCB3ZWJ2aWV3OiB0aGlzLnByb3ZpZGVkVmlld1R5cGUgfSksXG5cdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gKHtcblx0XHRcdFx0XHR4OiBlbGVtZW50Qm94LnggKyBkYXRhLmNsaWVudFgsXG5cdFx0XHRcdFx0eTogZWxlbWVudEJveC55ICsgZGF0YS5jbGllbnRZXG5cdFx0XHRcdH0pXG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX3NlbmQoJ3NldC1jb250ZXh0LW1lbnUtdmlzaWJsZScsIHsgdmlzaWJsZTogdHJ1ZSB9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uKCdsb2FkLXJlc291cmNlJywgYXN5bmMgKGVudHJ5KSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHQvLyBSZXN0b3JlIHRoZSBhdXRob3JpdHkgd2UgcHJldmlvdXNseSBlbmNvZGVkXG5cdFx0XHRcdGNvbnN0IGF1dGhvcml0eSA9IGRlY29kZUF1dGhvcml0eShlbnRyeS5hdXRob3JpdHkpO1xuXHRcdFx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7XG5cdFx0XHRcdFx0c2NoZW1lOiBlbnRyeS5zY2hlbWUsXG5cdFx0XHRcdFx0YXV0aG9yaXR5OiBhdXRob3JpdHksXG5cdFx0XHRcdFx0cGF0aDogZGVjb2RlVVJJQ29tcG9uZW50KGVudHJ5LnBhdGgpLCAvLyBUaGlzIGdldHMgcmUtZW5jb2RlZFxuXHRcdFx0XHRcdHF1ZXJ5OiBlbnRyeS5xdWVyeSA/IGRlY29kZVVSSUNvbXBvbmVudChlbnRyeS5xdWVyeSkgOiBlbnRyeS5xdWVyeSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMubG9hZFJlc291cmNlKGVudHJ5LmlkLCB1cmksIHsgaWZOb25lTWF0Y2g6IGVudHJ5LmlmTm9uZU1hdGNoLCByYW5nZTogZW50cnkucmFuZ2UgfSwgdGhpcy5fcmVzb3VyY2VMb2FkaW5nQ3RzLnRva2VuKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5fc2VuZCgnZGlkLWxvYWQtcmVzb3VyY2UnLCB7XG5cdFx0XHRcdFx0aWQ6IGVudHJ5LmlkLFxuXHRcdFx0XHRcdHN0YXR1czogNDA0LFxuXHRcdFx0XHRcdHBhdGg6IGVudHJ5LnBhdGgsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub24oJ2xvYWQtbG9jYWxob3N0JywgKGVudHJ5KSA9PiB7XG5cdFx0XHR0aGlzLmxvY2FsTG9jYWxob3N0KGVudHJ5LmlkLCBlbnRyeS5vcmlnaW4pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZSh3ZWJ2aWV3VGhlbWVEYXRhUHJvdmlkZXIub25UaGVtZURhdGFDaGFuZ2VkLCAoKSA9PiB0aGlzLnN0eWxlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfYWNjZXNzaWJpbGl0eVNlcnZpY2Uub25EaWRDaGFuZ2VSZWR1Y2VkTW90aW9uKCgpID0+IHRoaXMuc3R5bGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF9hY2Nlc3NpYmlsaXR5U2VydmljZS5vbkRpZENoYW5nZVNjcmVlblJlYWRlck9wdGltaXplZCgoKSA9PiB0aGlzLnN0eWxlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb250ZXh0TWVudVNlcnZpY2Uub25EaWRIaWRlQ29udGV4dE1lbnUoKCkgPT4gdGhpcy5fc2VuZCgnc2V0LWNvbnRleHQtbWVudS12aXNpYmxlJywgeyB2aXNpYmxlOiBmYWxzZSB9KSkpO1xuXG5cdFx0dGhpcy5fY29uZmlybUJlZm9yZUNsb3NlID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPignd2luZG93LmNvbmZpcm1CZWZvcmVDbG9zZScpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3dpbmRvdy5jb25maXJtQmVmb3JlQ2xvc2UnKSkge1xuXHRcdFx0XHR0aGlzLl9jb25maXJtQmVmb3JlQ2xvc2UgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnd2luZG93LmNvbmZpcm1CZWZvcmVDbG9zZScpO1xuXHRcdFx0XHR0aGlzLl9zZW5kKCdzZXQtY29uZmlybS1iZWZvcmUtY2xvc2UnLCB0aGlzLl9jb25maXJtQmVmb3JlQ2xvc2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub24oJ2RyYWctc3RhcnQnLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9zdGFydEJsb2NraW5nSWZyYW1lRHJhZ0V2ZW50cygpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub24oJ2RyYWcnLCAoZXZlbnQpID0+IHtcblx0XHRcdHRoaXMuaGFuZGxlRHJhZ0V2ZW50KCdkcmFnJywgZXZlbnQpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub24oJ3VwZGF0ZWQtaW50cmluc2ljLWNvbnRlbnQtc2l6ZScsIChldmVudCkgPT4ge1xuXHRcdFx0dGhpcy5pbnRyaW5zaWNDb250ZW50U2l6ZS5zZXQoeyB3aWR0aDogZXZlbnQud2lkdGgsIGhlaWdodDogZXZlbnQuaGVpZ2h0IH0sIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHR9KSk7XG5cblx0XHRpZiAoaW5pdEluZm8ub3B0aW9ucy5lbmFibGVGaW5kV2lkZ2V0KSB7XG5cdFx0XHR0aGlzLl93ZWJ2aWV3RmluZFdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdlYnZpZXdGaW5kV2lkZ2V0LCB0aGlzKSk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NlZCA9IHRydWU7XG5cblx0XHR0aGlzLmVsZW1lbnQ/LnJlbW92ZSgpO1xuXHRcdHRoaXMuX2VsZW1lbnQgPSB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLl9tZXNzYWdlUG9ydCA9IHVuZGVmaW5lZDtcblxuXHRcdGlmICh0aGlzLl9zdGF0ZS50eXBlID09PSBXZWJ2aWV3U3RhdGUuVHlwZS5Jbml0aWFsaXppbmcpIHtcblx0XHRcdGZvciAoY29uc3QgbWVzc2FnZSBvZiB0aGlzLl9zdGF0ZS5wZW5kaW5nTWVzc2FnZXMpIHtcblx0XHRcdFx0bWVzc2FnZS5yZXNvbHZlKGZhbHNlKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3N0YXRlLnBlbmRpbmdNZXNzYWdlcyA9IFtdO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkRGlzcG9zZS5maXJlKCk7XG5cblx0XHRmb3IgKGNvbnN0IGNvbnRyb2xsZXIgb2YgdGhpcy5fYWN0aXZlU3RyZWFtQ29udHJvbGxlcnMpIHtcblx0XHRcdHRyeSB7IGNvbnRyb2xsZXIuY2xvc2UoKTsgfSBjYXRjaCB7IC8qIGFscmVhZHkgY2xvc2VkICovIH1cblx0XHR9XG5cdFx0dGhpcy5fYWN0aXZlU3RyZWFtQ29udHJvbGxlcnMuY2xlYXIoKTtcblxuXHRcdHRoaXMuX3Jlc291cmNlTG9hZGluZ0N0cy5kaXNwb3NlKHRydWUpO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0c2V0Q29udGV4dEtleVNlcnZpY2UoY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSkge1xuXHRcdHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlID0gY29udGV4dEtleVNlcnZpY2U7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk1pc3NpbmdDc3AgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxFeHRlbnNpb25JZGVudGlmaWVyPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uTWlzc2luZ0NzcCA9IHRoaXMuX29uTWlzc2luZ0NzcC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENsaWNrTGluayA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENsaWNrTGluayA9IHRoaXMuX29uRGlkQ2xpY2tMaW5rLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTWVzc2FnZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFdlYnZpZXdNZXNzYWdlUmVjZWl2ZWRFdmVudD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbk1lc3NhZ2UgPSB0aGlzLl9vbk1lc3NhZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTY3JvbGwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHJlYWRvbmx5IHNjcm9sbFlQZXJjZW50YWdlOiBudW1iZXIgfT4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZFNjcm9sbCA9IHRoaXMuX29uRGlkU2Nyb2xsLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkV2hlZWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTW91c2VXaGVlbEV2ZW50PigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkV2hlZWwgPSB0aGlzLl9vbkRpZFdoZWVsLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVXBkYXRlU3RhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmcgfCB1bmRlZmluZWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRVcGRhdGVTdGF0ZSA9IHRoaXMuX29uRGlkVXBkYXRlU3RhdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRGb2N1cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRGb2N1cyA9IHRoaXMuX29uRGlkRm9jdXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRCbHVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZEJsdXIgPSB0aGlzLl9vbkRpZEJsdXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25GYXRhbEVycm9yID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyByZWFkb25seSBtZXNzYWdlOiBzdHJpbmcgfT4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkZhdGFsRXJyb3IgPSB0aGlzLl9vbkZhdGFsRXJyb3IuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREaXNwb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZERpc3Bvc2UgPSB0aGlzLl9vbkRpZERpc3Bvc2UuZXZlbnQ7XG5cblx0cHVibGljIHBvc3RNZXNzYWdlKG1lc3NhZ2U6IGFueSwgdHJhbnNmZXI/OiBBcnJheUJ1ZmZlcltdKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlbmQoJ21lc3NhZ2UnLCB7IG1lc3NhZ2UsIHRyYW5zZmVyIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2VuZDxLIGV4dGVuZHMga2V5b2YgVG9XZWJ2aWV3TWVzc2FnZT4oY2hhbm5lbDogSywgZGF0YTogVG9XZWJ2aWV3TWVzc2FnZVtLXSwgX2NyZWF0ZUVsZW1lbnQ6IFRyYW5zZmVyYWJsZVtdID0gW10pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAodGhpcy5fc3RhdGUudHlwZSA9PT0gV2Vidmlld1N0YXRlLlR5cGUuSW5pdGlhbGl6aW5nKSB7XG5cdFx0XHRjb25zdCB7IHByb21pc2UsIHJlc29sdmUgfSA9IHByb21pc2VXaXRoUmVzb2x2ZXJzPGJvb2xlYW4+KCk7XG5cdFx0XHR0aGlzLl9zdGF0ZS5wZW5kaW5nTWVzc2FnZXMucHVzaCh7IGNoYW5uZWwsIGRhdGEsIHRyYW5zZmVyYWJsZTogX2NyZWF0ZUVsZW1lbnQsIHJlc29sdmUgfSk7XG5cdFx0XHRyZXR1cm4gcHJvbWlzZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMuZG9Qb3N0TWVzc2FnZShjaGFubmVsLCBkYXRhLCBfY3JlYXRlRWxlbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlRWxlbWVudChvcHRpb25zOiBXZWJ2aWV3T3B0aW9ucywgX2NvbnRlbnRPcHRpb25zOiBXZWJ2aWV3Q29udGVudE9wdGlvbnMpIHtcblx0XHQvLyBEbyBub3Qgc3RhcnQgbG9hZGluZyB0aGUgd2VidmlldyB5ZXQuXG5cdFx0Ly8gV2FpdCB0aGUgZW5kIG9mIHRoZSBjdG9yIHdoZW4gYWxsIGxpc3RlbmVycyBoYXZlIGJlZW4gaG9va2VkIHVwLlxuXHRcdGNvbnN0IGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpZnJhbWUnKTtcblx0XHRlbGVtZW50Lm5hbWUgPSB0aGlzLmlkO1xuXHRcdGVsZW1lbnQuY2xhc3NOYW1lID0gYHdlYnZpZXcgJHtvcHRpb25zLmN1c3RvbUNsYXNzZXMgfHwgJyd9YDtcblx0XHRlbGVtZW50LnNhbmRib3guYWRkKCdhbGxvdy1zY3JpcHRzJywgJ2FsbG93LXNhbWUtb3JpZ2luJywgJ2FsbG93LWZvcm1zJywgJ2FsbG93LXBvaW50ZXItbG9jaycsICdhbGxvdy1kb3dubG9hZHMnKTtcblxuXHRcdGNvbnN0IGFsbG93UnVsZXMgPSBbJ2Nyb3NzLW9yaWdpbi1pc29sYXRlZCcsICdhdXRvcGxheScsICdsb2NhbC1uZXR3b3JrLWFjY2VzcyddO1xuXHRcdGlmICghaXNGaXJlZm94KSB7XG5cdFx0XHRhbGxvd1J1bGVzLnB1c2goJ2NsaXBib2FyZC1yZWFkJywgJ2NsaXBib2FyZC13cml0ZScpO1xuXHRcdH1cblx0XHRlbGVtZW50LnNldEF0dHJpYnV0ZSgnYWxsb3cnLCBhbGxvd1J1bGVzLmpvaW4oJzsgJykpO1xuXG5cdFx0ZWxlbWVudC5zdHlsZS5ib3JkZXIgPSAnbm9uZSc7XG5cdFx0ZWxlbWVudC5zdHlsZS53aWR0aCA9ICcxMDAlJztcblx0XHRlbGVtZW50LnN0eWxlLmhlaWdodCA9ICcxMDAlJztcblxuXHRcdGVsZW1lbnQuZm9jdXMgPSAoKSA9PiB7XG5cdFx0XHR0aGlzLl9kb0ZvY3VzKCk7XG5cdFx0fTtcblxuXHRcdHJldHVybiBlbGVtZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBfaW5pdEVsZW1lbnQoZW5jb2RlZFdlYnZpZXdPcmlnaW46IHN0cmluZywgZXh0ZW5zaW9uOiBXZWJ2aWV3RXh0ZW5zaW9uRGVzY3JpcHRpb24gfCB1bmRlZmluZWQsIG9wdGlvbnM6IFdlYnZpZXdPcHRpb25zLCB0YXJnZXRXaW5kb3c6IENvZGVXaW5kb3cpIHtcblx0XHQvLyBUaGUgZXh0ZW5zaW9uSWQgYW5kIHB1cnBvc2UgaW4gdGhlIFVSTCBhcmUgdXNlZCBmb3IgZmlsdGVyaW5nIGluIGpzLWRlYnVnOlxuXHRcdGNvbnN0IHBhcmFtczogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfSA9IHtcblx0XHRcdGlkOiB0aGlzLmlkLFxuXHRcdFx0cGFyZW50SWQ6IHRhcmdldFdpbmRvdy52c2NvZGVXaW5kb3dJZC50b1N0cmluZygpLFxuXHRcdFx0b3JpZ2luOiB0aGlzLm9yaWdpbixcblx0XHRcdHN3VmVyc2lvbjogU3RyaW5nKHRoaXMuX2V4cGVjdGVkU2VydmljZVdvcmtlclZlcnNpb24pLFxuXHRcdFx0ZXh0ZW5zaW9uSWQ6IGV4dGVuc2lvbj8uaWQudmFsdWUgPz8gJycsXG5cdFx0XHRwbGF0Zm9ybTogdGhpcy5wbGF0Zm9ybSxcblx0XHRcdCd2c2NvZGUtcmVzb3VyY2UtYmFzZS1hdXRob3JpdHknOiB3ZWJ2aWV3Um9vdFJlc291cmNlQXV0aG9yaXR5LFxuXHRcdFx0cGFyZW50T3JpZ2luOiB0YXJnZXRXaW5kb3cub3JpZ2luLFxuXHRcdH07XG5cblx0XHRpZiAodGhpcy5fb3B0aW9ucy5kaXNhYmxlU2VydmljZVdvcmtlcikge1xuXHRcdFx0cGFyYW1zLmRpc2FibGVTZXJ2aWNlV29ya2VyID0gJ3RydWUnO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRwYXJhbXMucmVtb3RlQXV0aG9yaXR5ID0gdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy5wdXJwb3NlKSB7XG5cdFx0XHRwYXJhbXMucHVycG9zZSA9IG9wdGlvbnMucHVycG9zZTtcblx0XHR9XG5cblx0XHRDT0kuYWRkU2VhcmNoUGFyYW0ocGFyYW1zLCB0cnVlLCB0cnVlKTtcblxuXHRcdGNvbnN0IHF1ZXJ5U3RyaW5nID0gbmV3IFVSTFNlYXJjaFBhcmFtcyhwYXJhbXMpLnRvU3RyaW5nKCk7XG5cblx0XHR0aGlzLnBlcmZNYXJrKCdpbml0L3NldC1zcmMnKTtcblx0XHRjb25zdCBmaWxlTmFtZSA9ICdpbmRleC5odG1sJztcblx0XHR0aGlzLmVsZW1lbnQhLnNldEF0dHJpYnV0ZSgnc3JjJywgYCR7dGhpcy53ZWJ2aWV3Q29udGVudEVuZHBvaW50KGVuY29kZWRXZWJ2aWV3T3JpZ2luKX0vJHtmaWxlTmFtZX0/JHtxdWVyeVN0cmluZ31gKTtcblx0fVxuXG5cdHB1YmxpYyBtb3VudFRvKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCB0YXJnZXRXaW5kb3c6IENvZGVXaW5kb3cpIHtcblx0XHRpZiAoIXRoaXMuZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3dpbmRvd0lkID0gdGFyZ2V0V2luZG93LnZzY29kZVdpbmRvd0lkO1xuXHRcdHRoaXMuX2VuY29kZWRXZWJ2aWV3T3JpZ2luUHJvbWlzZSA9IHBhcmVudE9yaWdpbkhhc2godGFyZ2V0V2luZG93Lm9yaWdpbiwgdGhpcy5vcmlnaW4pLnRoZW4oaWQgPT4gdGhpcy5fZW5jb2RlZFdlYnZpZXdPcmlnaW4gPSBpZCk7XG5cdFx0dGhpcy5fZW5jb2RlZFdlYnZpZXdPcmlnaW5Qcm9taXNlLnRoZW4oZW5jb2RlZFdlYnZpZXdPcmlnaW4gPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0XHR0aGlzLl9pbml0RWxlbWVudChlbmNvZGVkV2Vidmlld09yaWdpbiwgdGhpcy5leHRlbnNpb24sIHRoaXMuX29wdGlvbnMsIHRhcmdldFdpbmRvdyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJNZXNzYWdlSGFuZGxlcih0YXJnZXRXaW5kb3cpO1xuXG5cdFx0aWYgKHRoaXMuX3dlYnZpZXdGaW5kV2lkZ2V0KSB7XG5cdFx0XHRlbGVtZW50LmFwcGVuZENoaWxkKHRoaXMuX3dlYnZpZXdGaW5kV2lkZ2V0LmdldERvbU5vZGUoKSk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBldmVudE5hbWUgb2YgW0V2ZW50VHlwZS5NT1VTRV9ET1dOLCBFdmVudFR5cGUuTU9VU0VfTU9WRSwgRXZlbnRUeXBlLkRST1BdKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIoZWxlbWVudCwgZXZlbnROYW1lLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3N0b3BCbG9ja2luZ0lmcmFtZURyYWdFdmVudHMoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IG5vZGUgb2YgW2VsZW1lbnQsIHRhcmdldFdpbmRvd10pIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihub2RlLCBFdmVudFR5cGUuRFJBR19FTkQsICgpID0+IHtcblx0XHRcdFx0dGhpcy5fc3RvcEJsb2NraW5nSWZyYW1lRHJhZ0V2ZW50cygpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGVsZW1lbnQuaWQgPSB0aGlzLmlkOyAvLyBUaGlzIGlzIHVzZWQgYnkgYXJpYS1mbG93IGZvciBhY2Nlc3NpYmlsaXR5IG9yZGVyXG5cblx0XHR0aGlzLnBlcmZNYXJrKCdtb3VudGVkJyk7XG5cdFx0ZWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLmVsZW1lbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJNZXNzYWdlSGFuZGxlcih0YXJnZXRXaW5kb3c6IENvZGVXaW5kb3cpIHtcblx0XHRjb25zdCBzdWJzY3JpcHRpb24gPSB0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFyZ2V0V2luZG93LCAnbWVzc2FnZScsIChlOiBNZXNzYWdlRXZlbnQpID0+IHtcblx0XHRcdGlmICghdGhpcy5fZW5jb2RlZFdlYnZpZXdPcmlnaW4gfHwgZT8uZGF0YT8udGFyZ2V0ICE9PSB0aGlzLmlkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGUub3JpZ2luICE9PSB0aGlzLl93ZWJ2aWV3Q29udGVudE9yaWdpbih0aGlzLl9lbmNvZGVkV2Vidmlld09yaWdpbikpIHtcblx0XHRcdFx0Y29uc29sZS5sb2coYFNraXBwZWQgcmVuZGVyZXIgcmVjZWl2aW5nIG1lc3NhZ2UgZHVlIHRvIG1pc21hdGNoZWQgb3JpZ2luczogJHtlLm9yaWdpbn0gJHt0aGlzLl93ZWJ2aWV3Q29udGVudE9yaWdpbn1gKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5kYXRhLmNoYW5uZWwgPT09ICd3ZWJ2aWV3LXJlYWR5Jykge1xuXHRcdFx0XHRpZiAodGhpcy5fbWVzc2FnZVBvcnQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLnBlcmZNYXJrKCd3ZWJ2aWV3LXJlYWR5Jyk7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFdlYnZpZXcoJHt0aGlzLmlkfSk6IHdlYnZpZXcgcmVhZHlgKTtcblxuXHRcdFx0XHR0aGlzLl9tZXNzYWdlUG9ydCA9IGUucG9ydHNbMF07XG5cdFx0XHRcdHRoaXMuX21lc3NhZ2VQb3J0Lm9ubWVzc2FnZSA9IChlKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgaGFuZGxlcnMgPSB0aGlzLl9tZXNzYWdlSGFuZGxlcnMuZ2V0KGUuZGF0YS5jaGFubmVsKTtcblx0XHRcdFx0XHRpZiAoIWhhbmRsZXJzKSB7XG5cdFx0XHRcdFx0XHRjb25zb2xlLmxvZyhgTm8gaGFuZGxlcnMgZm91bmQgZm9yICcke2UuZGF0YS5jaGFubmVsfSdgKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aGFuZGxlcnM/LmZvckVhY2goaGFuZGxlciA9PiBoYW5kbGVyKGUuZGF0YS5kYXRhLCBlKSk7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0dGhpcy5lbGVtZW50Py5jbGFzc0xpc3QuYWRkKCdyZWFkeScpO1xuXG5cdFx0XHRcdGlmICh0aGlzLl9zdGF0ZS50eXBlID09PSBXZWJ2aWV3U3RhdGUuVHlwZS5Jbml0aWFsaXppbmcpIHtcblx0XHRcdFx0XHR0aGlzLl9zdGF0ZS5wZW5kaW5nTWVzc2FnZXMuZm9yRWFjaCgoeyBjaGFubmVsLCBkYXRhLCByZXNvbHZlIH0pID0+IHJlc29sdmUodGhpcy5kb1Bvc3RNZXNzYWdlKGNoYW5uZWwsIGRhdGEpKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fc3RhdGUgPSBXZWJ2aWV3U3RhdGUuUmVhZHk7XG5cblx0XHRcdFx0c3Vic2NyaXB0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHBlcmZNYXJrKG5hbWU6IHN0cmluZykge1xuXHRcdHBlcmZvcm1hbmNlLm1hcmsoYHdlYnZpZXcvd2Vidmlld0VsZW1lbnQvJHtuYW1lfWAsIHtcblx0XHRcdGRldGFpbDoge1xuXHRcdFx0XHRpZDogdGhpcy5pZFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RhcnRCbG9ja2luZ0lmcmFtZURyYWdFdmVudHMoKSB7XG5cdFx0aWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnbm9uZSc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc3RvcEJsb2NraW5nSWZyYW1lRHJhZ0V2ZW50cygpIHtcblx0XHRpZiAodGhpcy5lbGVtZW50KSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUucG9pbnRlckV2ZW50cyA9ICdhdXRvJztcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgd2Vidmlld0NvbnRlbnRFbmRwb2ludChlbmNvZGVkV2Vidmlld09yaWdpbjogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCB3ZWJ2aWV3RXh0ZXJuYWxFbmRwb2ludCA9IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS53ZWJ2aWV3RXh0ZXJuYWxFbmRwb2ludDtcblx0XHRpZiAoIXdlYnZpZXdFeHRlcm5hbEVuZHBvaW50KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYCd3ZWJ2aWV3RXh0ZXJuYWxFbmRwb2ludCcgaGFzIG5vdCBiZWVuIGNvbmZpZ3VyZWQuIFdlYnZpZXdzIHdpbGwgbm90IHdvcmshYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW5kcG9pbnQgPSB3ZWJ2aWV3RXh0ZXJuYWxFbmRwb2ludC5yZXBsYWNlKCd7e3V1aWR9fScsIGVuY29kZWRXZWJ2aWV3T3JpZ2luKTtcblx0XHRpZiAoZW5kcG9pbnRbZW5kcG9pbnQubGVuZ3RoIC0gMV0gPT09ICcvJykge1xuXHRcdFx0cmV0dXJuIGVuZHBvaW50LnNsaWNlKDAsIGVuZHBvaW50Lmxlbmd0aCAtIDEpO1xuXHRcdH1cblx0XHRyZXR1cm4gZW5kcG9pbnQ7XG5cdH1cblxuXHRwcml2YXRlIF93ZWJ2aWV3Q29udGVudE9yaWdpbihlbmNvZGVkV2Vidmlld09yaWdpbjogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UodGhpcy53ZWJ2aWV3Q29udGVudEVuZHBvaW50KGVuY29kZWRXZWJ2aWV3T3JpZ2luKSk7XG5cdFx0cmV0dXJuIHVyaS5zY2hlbWUgKyAnOi8vJyArIHVyaS5hdXRob3JpdHkudG9Mb3dlckNhc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgZG9Qb3N0TWVzc2FnZShjaGFubmVsOiBzdHJpbmcsIGRhdGE/OiBhbnksIHRyYW5zZmVyYWJsZTogVHJhbnNmZXJhYmxlW10gPSBbXSk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmVsZW1lbnQgJiYgdGhpcy5fbWVzc2FnZVBvcnQpIHtcblx0XHRcdHRoaXMuX21lc3NhZ2VQb3J0LnBvc3RNZXNzYWdlKHsgY2hhbm5lbCwgYXJnczogZGF0YSB9LCB0cmFuc2ZlcmFibGUpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgb248SyBleHRlbmRzIGtleW9mIEZyb21XZWJ2aWV3TWVzc2FnZT4oY2hhbm5lbDogSywgaGFuZGxlcjogKGRhdGE6IEZyb21XZWJ2aWV3TWVzc2FnZVtLXSwgZTogTWVzc2FnZUV2ZW50KSA9PiB2b2lkKTogSURpc3Bvc2FibGUge1xuXHRcdGxldCBoYW5kbGVycyA9IHRoaXMuX21lc3NhZ2VIYW5kbGVycy5nZXQoY2hhbm5lbCk7XG5cdFx0aWYgKCFoYW5kbGVycykge1xuXHRcdFx0aGFuZGxlcnMgPSBuZXcgU2V0KCk7XG5cdFx0XHR0aGlzLl9tZXNzYWdlSGFuZGxlcnMuc2V0KGNoYW5uZWwsIGhhbmRsZXJzKTtcblx0XHR9XG5cblx0XHRoYW5kbGVycy5hZGQoaGFuZGxlcik7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9tZXNzYWdlSGFuZGxlcnMuZ2V0KGNoYW5uZWwpPy5kZWxldGUoaGFuZGxlcik7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9oYXNBbGVydGVkQWJvdXRNaXNzaW5nQ3NwID0gZmFsc2U7XG5cdHByaXZhdGUgaGFuZGxlTm9Dc3BGb3VuZCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faGFzQWxlcnRlZEFib3V0TWlzc2luZ0NzcCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9oYXNBbGVydGVkQWJvdXRNaXNzaW5nQ3NwID0gdHJ1ZTtcblxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbj8uaWQpIHtcblx0XHRcdGlmICh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNFeHRlbnNpb25EZXZlbG9wbWVudCkge1xuXHRcdFx0XHR0aGlzLl9vbk1pc3NpbmdDc3AuZmlyZSh0aGlzLmV4dGVuc2lvbi5pZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlbG9hZCgpOiB2b2lkIHtcblx0XHR0aGlzLmRvVXBkYXRlQ29udGVudCh0aGlzLl9jb250ZW50KTtcblx0fVxuXG5cdHB1YmxpYyByZWluaXRpYWxpemVBZnRlckRpc21vdW50KCk6IHZvaWQge1xuXHRcdHRoaXMuX3N0YXRlID0gbmV3IFdlYnZpZXdTdGF0ZS5Jbml0aWFsaXppbmcoW10pO1xuXHRcdHRoaXMuX21lc3NhZ2VQb3J0ID0gdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5tb3VudFRvKHRoaXMuZWxlbWVudCEucGFyZW50RWxlbWVudCEsIGdldFdpbmRvdyh0aGlzLmVsZW1lbnQpKTtcblx0XHR0aGlzLnN0eWxlKCk7XG5cdFx0dGhpcy5yZWxvYWQoKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRIdG1sKGh0bWw6IHN0cmluZykge1xuXHRcdHRoaXMuZG9VcGRhdGVDb250ZW50KHsgLi4udGhpcy5fY29udGVudCwgaHRtbCB9KTtcblx0XHR0aGlzLl9vbkRpZEh0bWxDaGFuZ2UuZmlyZShodG1sKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRUaXRsZSh0aXRsZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5fY29udGVudCA9IHsgLi4udGhpcy5fY29udGVudCwgdGl0bGUgfTtcblx0XHR0aGlzLl9zZW5kKCdzZXQtdGl0bGUnLCB0aXRsZSk7XG5cdH1cblxuXHRwdWJsaWMgc2V0IGNvbnRlbnRPcHRpb25zKG9wdGlvbnM6IFdlYnZpZXdDb250ZW50T3B0aW9ucykge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFdlYnZpZXcoJHt0aGlzLmlkfSk6IHdpbGwgdXBkYXRlIGNvbnRlbnQgb3B0aW9uc2ApO1xuXG5cdFx0aWYgKGFyZVdlYnZpZXdDb250ZW50T3B0aW9uc0VxdWFsKG9wdGlvbnMsIHRoaXMuX2NvbnRlbnQub3B0aW9ucykpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFdlYnZpZXcoJHt0aGlzLmlkfSk6IHNraXBwaW5nIGNvbnRlbnQgb3B0aW9ucyB1cGRhdGVgKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmRvVXBkYXRlQ29udGVudCh7IC4uLnRoaXMuX2NvbnRlbnQsIG9wdGlvbnMgfSk7XG5cdH1cblxuXHRwdWJsaWMgc2V0IGxvY2FsUmVzb3VyY2VzUm9vdChyZXNvdXJjZXM6IHJlYWRvbmx5IFVSSVtdKSB7XG5cdFx0dGhpcy5fY29udGVudCA9IHtcblx0XHRcdC4uLnRoaXMuX2NvbnRlbnQsXG5cdFx0XHRvcHRpb25zOiB7IC4uLnRoaXMuX2NvbnRlbnQub3B0aW9ucywgbG9jYWxSZXNvdXJjZVJvb3RzOiByZXNvdXJjZXMgfVxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgc2V0IHN0YXRlKHN0YXRlOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9jb250ZW50ID0geyAuLi50aGlzLl9jb250ZW50LCBzdGF0ZSB9O1xuXHR9XG5cblx0cHVibGljIHNldCBpbml0aWFsU2Nyb2xsUHJvZ3Jlc3ModmFsdWU6IG51bWJlcikge1xuXHRcdHRoaXMuX3NlbmQoJ2luaXRpYWwtc2Nyb2xsLXBvc2l0aW9uJywgdmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1VwZGF0ZUNvbnRlbnQobmV3Q29udGVudDogV2Vidmlld0NvbnRlbnQpIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBXZWJ2aWV3KCR7dGhpcy5pZH0pOiB3aWxsIHVwZGF0ZSBjb250ZW50YCk7XG5cblx0XHR0aGlzLl9jb250ZW50ID0gbmV3Q29udGVudDtcblxuXHRcdGNvbnN0IGFsbG93U2NyaXB0cyA9ICEhdGhpcy5fY29udGVudC5vcHRpb25zLmFsbG93U2NyaXB0cztcblx0XHR0aGlzLnBlcmZNYXJrKCdzZXQtY29udGVudCcpO1xuXHRcdHRoaXMuX3NlbmQoJ2NvbnRlbnQnLCB7XG5cdFx0XHRjb250ZW50czogdGhpcy5fY29udGVudC5odG1sLFxuXHRcdFx0dGl0bGU6IHRoaXMuX2NvbnRlbnQudGl0bGUsXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdGFsbG93TXVsdGlwbGVBUElBY3F1aXJlOiAhIXRoaXMuX2NvbnRlbnQub3B0aW9ucy5hbGxvd011bHRpcGxlQVBJQWNxdWlyZSxcblx0XHRcdFx0YWxsb3dTY3JpcHRzOiBhbGxvd1NjcmlwdHMsXG5cdFx0XHRcdGFsbG93Rm9ybXM6IHRoaXMuX2NvbnRlbnQub3B0aW9ucy5hbGxvd0Zvcm1zID8/IGFsbG93U2NyaXB0cywgLy8gRm9yIGJhY2sgY29tcGF0LCB3ZSBhbGxvdyBmb3JtcyBieSBkZWZhdWx0IHdoZW4gc2NyaXB0cyBhcmUgZW5hYmxlZFxuXHRcdFx0fSxcblx0XHRcdHN0YXRlOiB0aGlzLl9jb250ZW50LnN0YXRlLFxuXHRcdFx0Y3NwU291cmNlOiB3ZWJ2aWV3R2VuZXJpY0NzcFNvdXJjZSxcblx0XHRcdGNvbmZpcm1CZWZvcmVDbG9zZTogdGhpcy5fY29uZmlybUJlZm9yZUNsb3NlLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIHN0eWxlKCk6IHZvaWQge1xuXHRcdGxldCB7IHN0eWxlcywgYWN0aXZlVGhlbWUsIHRoZW1lTGFiZWwsIHRoZW1lSWQgfSA9IHRoaXMud2Vidmlld1RoZW1lRGF0YVByb3ZpZGVyLmdldFdlYnZpZXdUaGVtZURhdGEoKTtcblx0XHRpZiAodGhpcy5fb3B0aW9ucy50cmFuc2Zvcm1Dc3NWYXJpYWJsZXMpIHtcblx0XHRcdHN0eWxlcyA9IHRoaXMuX29wdGlvbnMudHJhbnNmb3JtQ3NzVmFyaWFibGVzKHN0eWxlcyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVkdWNlTW90aW9uID0gdGhpcy5fYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNNb3Rpb25SZWR1Y2VkKCk7XG5cdFx0Y29uc3Qgc2NyZWVuUmVhZGVyID0gdGhpcy5fYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKTtcblxuXHRcdHRoaXMuX3NlbmQoJ3N0eWxlcycsIHsgc3R5bGVzLCBhY3RpdmVUaGVtZSwgdGhlbWVJZCwgdGhlbWVMYWJlbCwgcmVkdWNlTW90aW9uLCBzY3JlZW5SZWFkZXIgfSk7XG5cdH1cblxuXG5cdHByb3RlY3RlZCBoYW5kbGVGb2N1c0NoYW5nZShpc0ZvY3VzZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9mb2N1c2VkID0gaXNGb2N1c2VkO1xuXHRcdGlmIChpc0ZvY3VzZWQpIHtcblx0XHRcdHRoaXMuX29uRGlkRm9jdXMuZmlyZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9vbkRpZEJsdXIuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkRm9yd2FyZEtleUV2ZW50KGV2ZW50OiBLZXlFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBldmVudC5pc1RydXN0ZWQgfHwgISF0aGlzLl9jb250ZW50Lm9wdGlvbnMuZm9yd2FyZFVudHJ1c3RlZEtleXByZXNzRXZlbnRzO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0FjdGl2ZUVsZW1lbnQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5lbGVtZW50ICYmIHRoaXMud2luZG93Py5kb2N1bWVudC5hY3RpdmVFbGVtZW50ID09PSB0aGlzLmVsZW1lbnQ7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUtleUV2ZW50KHR5cGU6ICdrZXlkb3duJyB8ICdrZXl1cCcsIGV2ZW50OiBLZXlFdmVudCkge1xuXHRcdGlmICghdGhpcy5zaG91bGRGb3J3YXJkS2V5RXZlbnQoZXZlbnQpIHx8ICF0aGlzLmlzQWN0aXZlRWxlbWVudCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRWxlY3Ryb246IHdvcmthcm91bmQgZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9lbGVjdHJvbi9lbGVjdHJvbi9pc3N1ZXMvMTQyNThcblx0XHQvLyBXZSBoYXZlIHRvIGRldGVjdCBrZXlib2FyZCBldmVudHMgaW4gdGhlIDx3ZWJ2aWV3PiBhbmQgZGlzcGF0Y2ggdGhlbSB0byBvdXJcblx0XHQvLyBrZXliaW5kaW5nIHNlcnZpY2UgYmVjYXVzZSB0aGVzZSBldmVudHMgZG8gbm90IGJ1YmJsZSB0byB0aGUgcGFyZW50IHdpbmRvdyBhbnltb3JlLlxuXHRcdC8vIENyZWF0ZSBhIGZha2UgS2V5Ym9hcmRFdmVudCBmcm9tIHRoZSBkYXRhIHByb3ZpZGVkXG5cdFx0Y29uc3QgZW11bGF0ZWRLZXlib2FyZEV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQodHlwZSwgZXZlbnQpO1xuXHRcdC8vIEZvcmNlIG92ZXJyaWRlIHRoZSB0YXJnZXRcblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoZW11bGF0ZWRLZXlib2FyZEV2ZW50LCAndGFyZ2V0Jywge1xuXHRcdFx0Z2V0OiAoKSA9PiB0aGlzLmVsZW1lbnQsXG5cdFx0fSk7XG5cdFx0Ly8gQW5kIHJlLWRpc3BhdGNoXG5cdFx0dGhpcy53aW5kb3c/LmRpc3BhdGNoRXZlbnQoZW11bGF0ZWRLZXlib2FyZEV2ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlRHJhZ0V2ZW50KHR5cGU6ICdkcmFnJywgZXZlbnQ6IFdlYlZpZXdEcmFnRXZlbnQpIHtcblx0XHQvLyBDcmVhdGUgYSBmYWtlIERyYWdFdmVudCBmcm9tIHRoZSBkYXRhIHByb3ZpZGVkXG5cdFx0Y29uc3QgZW11bGF0ZWREcmFnRXZlbnQgPSBuZXcgRHJhZ0V2ZW50KHR5cGUsIGV2ZW50KTtcblx0XHQvLyBGb3JjZSBvdmVycmlkZSB0aGUgdGFyZ2V0XG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGVtdWxhdGVkRHJhZ0V2ZW50LCAndGFyZ2V0Jywge1xuXHRcdFx0Z2V0OiAoKSA9PiB0aGlzLmVsZW1lbnQsXG5cdFx0fSk7XG5cdFx0Ly8gQW5kIHJlLWRpc3BhdGNoXG5cdFx0dGhpcy53aW5kb3c/LmRpc3BhdGNoRXZlbnQoZW11bGF0ZWREcmFnRXZlbnQpO1xuXHR9XG5cblx0d2luZG93RGlkRHJhZ1N0YXJ0KCk6IHZvaWQge1xuXHRcdC8vIFdlYnZpZXcgYnJlYWsgZHJhZyBhbmQgZHJvcHBpbmcgYXJvdW5kIHRoZSBtYWluIHdpbmRvdyAobm8gZXZlbnRzIGFyZSBnZW5lcmF0ZWQgd2hlbiB5b3UgYXJlIG92ZXIgdGhlbSlcblx0XHQvLyBXb3JrIGFyb3VuZCB0aGlzIGJ5IGRpc2FibGluZyBwb2ludGVyIGV2ZW50cyBkdXJpbmcgdGhlIGRyYWcuXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL2VsZWN0cm9uL2VsZWN0cm9uL2lzc3Vlcy8xODIyNlxuXHRcdHRoaXMuX3N0YXJ0QmxvY2tpbmdJZnJhbWVEcmFnRXZlbnRzKCk7XG5cdH1cblxuXHR3aW5kb3dEaWREcmFnRW5kKCk6IHZvaWQge1xuXHRcdHRoaXMuX3N0b3BCbG9ja2luZ0lmcmFtZURyYWdFdmVudHMoKTtcblx0fVxuXG5cdHB1YmxpYyBzZWxlY3RBbGwoKSB7XG5cdFx0dGhpcy5leGVjQ29tbWFuZCgnc2VsZWN0QWxsJyk7XG5cdH1cblxuXHRwdWJsaWMgY29weSgpIHtcblx0XHR0aGlzLmV4ZWNDb21tYW5kKCdjb3B5Jyk7XG5cdH1cblxuXHRwdWJsaWMgcGFzdGUoKSB7XG5cdFx0dGhpcy5leGVjQ29tbWFuZCgncGFzdGUnKTtcblx0fVxuXG5cdHB1YmxpYyBjdXQoKSB7XG5cdFx0dGhpcy5leGVjQ29tbWFuZCgnY3V0Jyk7XG5cdH1cblxuXHRwdWJsaWMgdW5kbygpIHtcblx0XHR0aGlzLmV4ZWNDb21tYW5kKCd1bmRvJyk7XG5cdH1cblxuXHRwdWJsaWMgcmVkbygpIHtcblx0XHR0aGlzLmV4ZWNDb21tYW5kKCdyZWRvJyk7XG5cdH1cblxuXHRwcml2YXRlIGV4ZWNDb21tYW5kKGNvbW1hbmQ6IHN0cmluZykge1xuXHRcdGlmICh0aGlzLmVsZW1lbnQpIHtcblx0XHRcdHRoaXMuX3NlbmQoJ2V4ZWNDb21tYW5kJywgY29tbWFuZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBsb2FkUmVzb3VyY2UoaWQ6IG51bWJlciwgdXJpOiBVUkksIG9wdGlvbnM6IHsgaWZOb25lTWF0Y2g6IHN0cmluZyB8IHVuZGVmaW5lZDsgcmFuZ2U/OiB7IHJlYWRvbmx5IHN0YXJ0OiBudW1iZXI7IHJlYWRvbmx5IGVuZD86IG51bWJlciB9IH0sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihsb2FkTG9jYWxSZXNvdXJjZSwgdXJpLCB7XG5cdFx0XHRcdGlmTm9uZU1hdGNoOiBvcHRpb25zLmlmTm9uZU1hdGNoLFxuXHRcdFx0XHRyb290czogdGhpcy5fY29udGVudC5vcHRpb25zLmxvY2FsUmVzb3VyY2VSb290cyB8fCBbXSxcblx0XHRcdFx0cmFuZ2U6IG9wdGlvbnMucmFuZ2UsXG5cdFx0XHR9LCB0b2tlbik7XG5cblx0XHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHN3aXRjaCAocmVzdWx0LnR5cGUpIHtcblx0XHRcdFx0Y2FzZSBXZWJ2aWV3UmVzb3VyY2VSZXNwb25zZS5UeXBlLlN1Y2Nlc3M6IHtcblx0XHRcdFx0XHRjb25zdCByYW5nZSA9IG9wdGlvbnMucmFuZ2U7XG5cdFx0XHRcdFx0Y29uc3QgcmVxdWVzdGVkUmFuZ2VFbmQgPSByYW5nZT8uZW5kICE9PSB1bmRlZmluZWQgPyByYW5nZS5lbmQgOiByZXN1bHQuc2l6ZSAtIDE7XG5cdFx0XHRcdFx0Y29uc3QgcmFuZ2VFbmQgPSBNYXRoLm1pbihyZXF1ZXN0ZWRSYW5nZUVuZCwgcmVzdWx0LnNpemUgLSAxKTtcblx0XHRcdFx0XHRjb25zdCByYW5nZUhlYWRlciA9IHJhbmdlXG5cdFx0XHRcdFx0XHQ/IGBieXRlcyAke3JhbmdlLnN0YXJ0fS0ke3JhbmdlRW5kfS8ke3Jlc3VsdC5zaXplfWBcblx0XHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmIChXZWJ2aWV3RWxlbWVudC5fc3VwcG9ydHNUcmFuc2ZlcmFibGVTdHJlYW1zLnZhbHVlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBzdHJlYW1DdHMgPSB0aGlzLnBsYXRmb3JtID09PSAnZWxlY3Ryb24nID8gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKHRva2VuKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdGxldCBjb250cm9sbGVyOiBSZWFkYWJsZVN0cmVhbURlZmF1bHRDb250cm9sbGVyPFVpbnQ4QXJyYXk8QXJyYXlCdWZmZXI+PiB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdGxldCBjbG9zZWQgPSBmYWxzZTtcblx0XHRcdFx0XHRcdGNvbnN0IGNsb3NlID0gKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRpZiAoIWNsb3NlZCkge1xuXHRcdFx0XHRcdFx0XHRcdGNsb3NlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdFx0c3RyZWFtQ3RzPy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGNvbnRyb2xsZXIpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuX2FjdGl2ZVN0cmVhbUNvbnRyb2xsZXJzLmRlbGV0ZShjb250cm9sbGVyKTtcblx0XHRcdFx0XHRcdFx0XHRcdHRyeSB7IGNvbnRyb2xsZXIuY2xvc2UoKTsgfSBjYXRjaCB7IC8qIGFscmVhZHkgY2xvc2VkICovIH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRjb25zdCBzdHJlYW0gPSBuZXcgUmVhZGFibGVTdHJlYW08VWludDhBcnJheTxBcnJheUJ1ZmZlcj4+KHtcblx0XHRcdFx0XHRcdFx0c3RhcnQ6IChuZXdDb250cm9sbGVyKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gVHJhY2sgdGhpcyBjb250cm9sbGVyIHNvIHRoYXQgdGhlIHNpbmdsZVxuXHRcdFx0XHRcdFx0XHRcdC8vIGNhbmNlbGxhdGlvbiBoYW5kbGVyIGluIGRpc3Bvc2UoKSBjYW4gY2xvc2Vcblx0XHRcdFx0XHRcdFx0XHQvLyBhbGwgYWN0aXZlIHN0cmVhbXMgd2l0aG91dCBwZXItc3RyZWFtIGxpc3RlbmVycy5cblx0XHRcdFx0XHRcdFx0XHRjb250cm9sbGVyID0gbmV3Q29udHJvbGxlcjtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9hY3RpdmVTdHJlYW1Db250cm9sbGVycy5hZGQoY29udHJvbGxlcik7XG5cblx0XHRcdFx0XHRcdFx0XHRsaXN0ZW5TdHJlYW0ocmVzdWx0LnN0cmVhbSwge1xuXHRcdFx0XHRcdFx0XHRcdFx0b25EYXRhOiAoY2h1bmspID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKCFjbG9zZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Y29udHJvbGxlcj8uZW5xdWV1ZShuZXcgVWludDhBcnJheShjaHVuay5idWZmZXIpKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNsb3NlKCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0b25FcnJvcjogKGVycikgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRpZiAoIWNsb3NlZCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNsb3NlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0c3RyZWFtQ3RzPy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgY3VycmVudENvbnRyb2xsZXIgPSBjb250cm9sbGVyO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGlmIChjdXJyZW50Q29udHJvbGxlcikge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5fYWN0aXZlU3RyZWFtQ29udHJvbGxlcnMuZGVsZXRlKGN1cnJlbnRDb250cm9sbGVyKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHRyeSB7IGN1cnJlbnRDb250cm9sbGVyLmVycm9yKGVycik7IH0gY2F0Y2ggeyAvKiBhbHJlYWR5IGNsb3NlZCAqLyB9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0b25FbmQ6ICgpID0+IGNsb3NlKClcblx0XHRcdFx0XHRcdFx0XHR9LCBzdHJlYW1DdHM/LnRva2VuID8/IHRva2VuKTtcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0Y2FuY2VsOiBzdHJlYW1DdHMgPyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0c3RyZWFtQ3RzLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0XHRcdFx0XHRcdFx0cmVzdWx0LnN0cmVhbS5kZXN0cm95KCk7XG5cdFx0XHRcdFx0XHRcdFx0Y2xvc2UoKTtcblx0XHRcdFx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0dGhpcy5fc2VuZCgnZGlkLWxvYWQtcmVzb3VyY2UnLCB7XG5cdFx0XHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdFx0XHRzdGF0dXM6IHJhbmdlID8gMjA2IDogMjAwLFxuXHRcdFx0XHRcdFx0XHRwYXRoOiB1cmkucGF0aCxcblx0XHRcdFx0XHRcdFx0bWltZTogcmVzdWx0Lm1pbWVUeXBlLFxuXHRcdFx0XHRcdFx0XHRldGFnOiByZXN1bHQuZXRhZyxcblx0XHRcdFx0XHRcdFx0bXRpbWU6IHJlc3VsdC5tdGltZSxcblx0XHRcdFx0XHRcdFx0cmFuZ2U6IHJhbmdlSGVhZGVyLFxuXHRcdFx0XHRcdFx0XHRzdHJlYW0sXG5cdFx0XHRcdFx0XHR9LCBbc3RyZWFtXSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIFNhZmFyaTogdHJhbnNmZXJhYmxlIHN0cmVhbXMgbm90IHN1cHBvcnRlZCwgZmFsbCBiYWNrIHRvIGNodW5rIG1lc3NhZ2VzXG5cdFx0XHRcdFx0XHR0aGlzLl9zZW5kKCdkaWQtbG9hZC1yZXNvdXJjZScsIHtcblx0XHRcdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0XHRcdHN0YXR1czogcmFuZ2UgPyAyMDYgOiAyMDAsXG5cdFx0XHRcdFx0XHRcdHBhdGg6IHVyaS5wYXRoLFxuXHRcdFx0XHRcdFx0XHRtaW1lOiByZXN1bHQubWltZVR5cGUsXG5cdFx0XHRcdFx0XHRcdGV0YWc6IHJlc3VsdC5ldGFnLFxuXHRcdFx0XHRcdFx0XHRtdGltZTogcmVzdWx0Lm10aW1lLFxuXHRcdFx0XHRcdFx0XHRyYW5nZTogcmFuZ2VIZWFkZXIsXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdGxpc3RlblN0cmVhbShyZXN1bHQuc3RyZWFtLCB7XG5cdFx0XHRcdFx0XHRcdG9uRGF0YTogKGNodW5rKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gQ29weSBpbnRvIGEgZnJlc2hseS1vd25lZCBBcnJheUJ1ZmZlciBiZWZvcmUgdHJhbnNmZXJyaW5nLiBgY2h1bmtgXG5cdFx0XHRcdFx0XHRcdFx0Ly8gbWF5IGJlIGEgdmlldyBpbnRvIGEgbGFyZ2VyLCBzaGFyZWQgQXJyYXlCdWZmZXIgKGUuZy4gZnJvbSB0aGUgSVBDXG5cdFx0XHRcdFx0XHRcdFx0Ly8gZGVzZXJpYWxpemUgcGlwZWxpbmUpOyB0cmFuc2ZlcnJpbmcgaXRzIHVuZGVybHlpbmcgQXJyYXlCdWZmZXIgd291bGRcblx0XHRcdFx0XHRcdFx0XHQvLyBkZXRhY2ggZXZlcnkgc2libGluZyB2aWV3LiBXZWJLaXQgZGV0YWNoZXMgc3luY2hyb25vdXNseSwgd2hpY2hcblx0XHRcdFx0XHRcdFx0XHQvLyBwcmV2aW91c2x5IGJyb2tlIHdlYnZpZXcgcmVzb3VyY2UgbG9hZGluZyBpbiBTYWZhcmkuXG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgZGF0YSA9IG5ldyBVaW50OEFycmF5KGNodW5rLmJ1ZmZlcik7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fc2VuZCgnZGlkLWxvYWQtcmVzb3VyY2UtY2h1bmsnLCB7IGlkLCBkYXRhIH0sIFtkYXRhLmJ1ZmZlcl0pO1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRvbkVycm9yOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fc2VuZCgnZGlkLWxvYWQtcmVzb3VyY2UtZW5kJywgeyBpZCwgZXJyb3I6IHRydWUgfSk7XG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdG9uRW5kOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fc2VuZCgnZGlkLWxvYWQtcmVzb3VyY2UtZW5kJywgeyBpZCB9KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSwgdG9rZW4pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSBXZWJ2aWV3UmVzb3VyY2VSZXNwb25zZS5UeXBlLk5vdE1vZGlmaWVkOiB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3NlbmQoJ2RpZC1sb2FkLXJlc291cmNlJywge1xuXHRcdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0XHRzdGF0dXM6IDMwNCwgLy8gbm90IG1vZGlmaWVkXG5cdFx0XHRcdFx0XHRwYXRoOiB1cmkucGF0aCxcblx0XHRcdFx0XHRcdG1pbWU6IHJlc3VsdC5taW1lVHlwZSxcblx0XHRcdFx0XHRcdG10aW1lOiByZXN1bHQubXRpbWVcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIFdlYnZpZXdSZXNvdXJjZVJlc3BvbnNlLlR5cGUuQWNjZXNzRGVuaWVkOiB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3NlbmQoJ2RpZC1sb2FkLXJlc291cmNlJywge1xuXHRcdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0XHRzdGF0dXM6IDQwMSwgLy8gdW5hdXRob3JpemVkXG5cdFx0XHRcdFx0XHRwYXRoOiB1cmkucGF0aCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gbm9vcFxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9zZW5kKCdkaWQtbG9hZC1yZXNvdXJjZScsIHtcblx0XHRcdGlkLFxuXHRcdFx0c3RhdHVzOiA0MDQsXG5cdFx0XHRwYXRoOiB1cmkucGF0aCxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbG9jYWxMb2NhbGhvc3QoaWQ6IHN0cmluZywgb3JpZ2luOiBzdHJpbmcpIHtcblx0XHRjb25zdCBhdXRob3JpdHkgPSB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5O1xuXHRcdGNvbnN0IHJlc29sdmVBdXRob3JpdHkgPSBhdXRob3JpdHkgPyBhd2FpdCB0aGlzLl9yZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UucmVzb2x2ZUF1dGhvcml0eShhdXRob3JpdHkpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJlZGlyZWN0ID0gcmVzb2x2ZUF1dGhvcml0eSA/IGF3YWl0IHRoaXMuX3BvcnRNYXBwaW5nTWFuYWdlci5nZXRSZWRpcmVjdChyZXNvbHZlQXV0aG9yaXR5LmF1dGhvcml0eSwgb3JpZ2luKSA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gdGhpcy5fc2VuZCgnZGlkLWxvYWQtbG9jYWxob3N0Jywge1xuXHRcdFx0aWQsXG5cdFx0XHRvcmlnaW4sXG5cdFx0XHRsb2NhdGlvbjogcmVkaXJlY3Rcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLl9kb0ZvY3VzKCk7XG5cblx0XHQvLyBIYW5kbGUgZm9jdXMgY2hhbmdlIHByb2dyYW1tYXRpY2FsbHkgKGRvIG5vdCByZWx5IG9uIGV2ZW50IGZyb20gPHdlYnZpZXc+KVxuXHRcdHRoaXMuaGFuZGxlRm9jdXNDaGFuZ2UodHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9kb0ZvY3VzKCkge1xuXHRcdGlmICghdGhpcy5lbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuZWxlbWVudC5jb250ZW50V2luZG93Py5mb2N1cygpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gbm9vcFxuXHRcdH1cblxuXHRcdC8vIFdvcmthcm91bmQgZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy83NTIwOVxuXHRcdC8vIEZvY3VzaW5nIHRoZSBpbm5lciB3ZWJ2aWV3IGlzIGFzeW5jIHNvIGZvciBhIHNlcXVlbmNlIG9mIGFjdGlvbnMgc3VjaCBhczpcblx0XHQvL1xuXHRcdC8vIDEuIE9wZW4gd2Vidmlld1xuXHRcdC8vIDEuIFNob3cgcXVpY2sgcGljayBmcm9tIGNvbW1hbmQgcGFsZXR0ZVxuXHRcdC8vXG5cdFx0Ly8gV2UgZW5kIHVwIGZvY3VzaW5nIHRoZSB3ZWJ2aWV3IGFmdGVyIHNob3dpbmcgdGhlIHF1aWNrIHBpY2ssIHdoaWNoIGNhdXNlc1xuXHRcdC8vIHRoZSBxdWljayBwaWNrIHRvIGluc3RhbnRseSBkaXNtaXNzLlxuXHRcdC8vXG5cdFx0Ly8gV29ya2Fyb3VuZCB0aGlzIGJ5IGRlYm91bmNpbmcgdGhlIGZvY3VzIGFuZCBtYWtpbmcgc3VyZSB3ZSBhcmUgbm90IGZvY3VzZWQgb24gYW4gaW5wdXRcblx0XHQvLyB3aGVuIHdlIHRyeSB0byByZS1mb2N1cy5cblx0XHR0aGlzLl9mb2N1c0RlbGF5ZXIudHJpZ2dlcihhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuaXNGb2N1c2VkIHx8ICF0aGlzLmVsZW1lbnQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy53aW5kb3c/LmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgJiYgdGhpcy53aW5kb3cuZG9jdW1lbnQuYWN0aXZlRWxlbWVudCAhPT0gdGhpcy5lbGVtZW50ICYmIHRoaXMud2luZG93LmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ/LnRhZ05hbWUgIT09ICdCT0RZJykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIEl0IGlzIHBvc3NpYmxlIGZvciB0aGUgd2VidmlldyB0byBiZSBjb250YWluZWQgaW4gYW5vdGhlciB3aW5kb3dcblx0XHRcdC8vIHRoYXQgZG9lcyBub3QgaGF2ZSBmb2N1cy4gQXMgc3VjaCwgYWxzbyBmb2N1cyB0aGUgYm9keSBvZiB0aGVcblx0XHRcdC8vIHdlYnZpZXcncyB3aW5kb3cgdG8gZW5zdXJlIGl0IGlzIHByb3Blcmx5IHJlY2VpdmluZyBrZXlib2FyZCBmb2N1cy5cblx0XHRcdHRoaXMud2luZG93Py5kb2N1bWVudC5ib2R5Py5mb2N1cygpO1xuXG5cdFx0XHR0aGlzLl9zZW5kKCdmb2N1cycsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2hhc0ZpbmRSZXN1bHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cHVibGljIHJlYWRvbmx5IGhhc0ZpbmRSZXN1bHQ6IEV2ZW50PGJvb2xlYW4+ID0gdGhpcy5faGFzRmluZFJlc3VsdC5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkU3RvcEZpbmQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkU3RvcEZpbmQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRTdG9wRmluZC5ldmVudDtcblxuXHQvKipcblx0ICogV2Vidmlld3MgZXhwb3NlIGEgc3RhdGVmdWwgZmluZCBBUEkuXG5cdCAqIFN1Y2Nlc3NpdmUgY2FsbHMgdG8gZmluZCB3aWxsIG1vdmUgZm9yd2FyZCBvciBiYWNrd2FyZCB0aHJvdWdoIG9uRmluZFJlc3VsdHNcblx0ICogZGVwZW5kaW5nIG9uIHRoZSBzdXBwbGllZCBvcHRpb25zLlxuXHQgKlxuXHQgKiBAcGFyYW0gdmFsdWUgVGhlIHN0cmluZyB0byBzZWFyY2ggZm9yLiBFbXB0eSBzdHJpbmdzIGFyZSBpZ25vcmVkLlxuXHQgKi9cblx0cHVibGljIGZpbmQodmFsdWU6IHN0cmluZywgcHJldmlvdXM6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3NlbmQoJ2ZpbmQnLCB7IHZhbHVlLCBwcmV2aW91cyB9KTtcblx0fVxuXG5cdHB1YmxpYyB1cGRhdGVGaW5kKHZhbHVlOiBzdHJpbmcpIHtcblx0XHRpZiAoIXZhbHVlIHx8ICF0aGlzLmVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc2VuZCgnZmluZCcsIHsgdmFsdWUgfSk7XG5cdH1cblxuXHRwdWJsaWMgc3RvcEZpbmQoa2VlcFNlbGVjdGlvbj86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zZW5kKCdmaW5kLXN0b3AnLCB7IGNsZWFyU2VsZWN0aW9uOiAha2VlcFNlbGVjdGlvbiB9KTtcblx0XHR0aGlzLl9vbkRpZFN0b3BGaW5kLmZpcmUoKTtcblx0fVxuXG5cdHB1YmxpYyBzaG93RmluZChhbmltYXRlZCA9IHRydWUpIHtcblx0XHR0aGlzLl93ZWJ2aWV3RmluZFdpZGdldD8ucmV2ZWFsKHVuZGVmaW5lZCwgYW5pbWF0ZWQpO1xuXHR9XG5cblx0cHVibGljIGhpZGVGaW5kKGFuaW1hdGVkID0gdHJ1ZSkge1xuXHRcdHRoaXMuX3dlYnZpZXdGaW5kV2lkZ2V0Py5oaWRlKGFuaW1hdGVkKTtcblx0fVxuXG5cdHB1YmxpYyBydW5GaW5kQWN0aW9uKHByZXZpb3VzOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fd2Vidmlld0ZpbmRXaWRnZXQ/LmZpbmQocHJldmlvdXMpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsdUJBQXVCLFdBQVcsV0FBVyxxQkFBcUI7QUFDM0UsU0FBUyx3QkFBd0I7QUFHakMsU0FBUyxzQkFBc0Isd0JBQXdCO0FBQ3ZELFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVk7QUFDckIsU0FBUyxZQUF5QixvQkFBb0I7QUFDdEQsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtB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LFNBQVM7QUFDckM7QUFBQSxNQUNEO0FBRUEsVUFBSSxLQUFLLFFBQVEsU0FBUyxpQkFBaUIsS0FBSyxPQUFPLFNBQVMsa0JBQWtCLEtBQUssV0FBVyxLQUFLLE9BQU8sU0FBUyxlQUFlLFlBQVksUUFBUTtBQUN6SjtBQUFBLE1BQ0Q7QUFLQSxXQUFLLFFBQVEsU0FBUyxNQUFNLE1BQU07QUFFbEMsV0FBSyxNQUFNLFNBQVMsTUFBUztBQUFBLElBQzlCLENBQUM7QUFBQSxFQUNGO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQWVPLEtBQUssT0FBZSxVQUF5QjtBQUNuRCxRQUFJLENBQUMsS0FBSyxTQUFTO0FBQ2xCO0FBQUEsSUFDRDtBQUVBLFNBQUssTUFBTSxRQUFRLEVBQUUsT0FBTyxTQUFTLENBQUM7QUFBQSxFQUN2QztBQUFBLEVBRU8sV0FBVyxPQUFlO0FBQ2hDLFFBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxTQUFTO0FBQzVCO0FBQUEsSUFDRDtBQUNBLFNBQUssTUFBTSxRQUFRLEVBQUUsTUFBTSxDQUFDO0FBQUEsRUFDN0I7QUFBQSxFQUVPLFNBQVMsZUFBK0I7QUFDOUMsUUFBSSxDQUFDLEtBQUssU0FBUztBQUNsQjtBQUFBLElBQ0Q7QUFDQSxTQUFLLE1BQU0sYUFBYSxFQUFFLGdCQUFnQixDQUFDLGNBQWMsQ0FBQztBQUMxRCxTQUFLLGVBQWUsS0FBSztBQUFBLEVBQzFCO0FBQUEsRUFFTyxTQUFTLFdBQVcsTUFBTTtBQUNoQyxTQUFLLG9CQUFvQixPQUFPLFFBQVcsUUFBUTtBQUFBLEVBQ3BEO0FBQUEsRUFFTyxTQUFTLFdBQVcsTUFBTTtBQUNoQyxTQUFLLG9CQUFvQixLQUFLLFFBQVE7QUFBQSxFQUN2QztBQUFBLEVBRU8sY0FBYyxVQUFtQjtBQUN2QyxTQUFLLG9CQUFvQixLQUFLLFFBQVE7QUFBQSxFQUN2QztBQUNEO0FBdjhCYSxlQXNCWSwrQkFBK0IsSUFBSSxLQUFjLE1BQU07QUFDOUUsTUFBSTtBQUNILFVBQU0sU0FBUyxJQUFJLGVBQWU7QUFDbEMsVUFBTSxLQUFLLElBQUksZUFBZTtBQUM5QixPQUFHLE1BQU0sWUFBWSxRQUFRLENBQUMsTUFBTSxDQUFDO0FBQ3JDLE9BQUcsTUFBTSxNQUFNO0FBQ2YsT0FBRyxNQUFNLE1BQU07QUFDZixXQUFPO0FBQUEsRUFDUixRQUFRO0FBQ1AsV0FBTztBQUFBLEVBQ1I7QUFDRCxDQUFDO0FBakNXLGlCQUFOO0FBQUEsRUE2Rko7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBckdVOyIsCiAgIm5hbWVzIjogWyJXZWJ2aWV3U3RhdGUiLCAiVHlwZSIsICJlIl0KfQo=
