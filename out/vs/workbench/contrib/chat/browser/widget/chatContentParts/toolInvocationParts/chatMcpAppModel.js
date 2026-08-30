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
import * as dom from "../../../../../../../base/browser/dom.js";
import { softAssertNever } from "../../../../../../../base/common/assert.js";
import { disposableTimeout } from "../../../../../../../base/common/async.js";
import { decodeBase64 } from "../../../../../../../base/common/buffer.js";
import { CancellationTokenSource } from "../../../../../../../base/common/cancellation.js";
import { Emitter } from "../../../../../../../base/common/event.js";
import { hash } from "../../../../../../../base/common/hash.js";
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../../../../base/common/lifecycle.js";
import { autorun, autorunSelfDisposable, observableValue } from "../../../../../../../base/common/observable.js";
import { basename } from "../../../../../../../base/common/resources.js";
import { isFalsyOrWhitespace } from "../../../../../../../base/common/strings.js";
import { hasKey, isDefined } from "../../../../../../../base/common/types.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../../base/common/uuid.js";
import { localize } from "../../../../../../../nls.js";
import { IChatResponseResourceFileSystemProvider } from "../../../../common/widget/chatResponseResourceFileSystemProvider.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../../../platform/log/common/log.js";
import { IOpenerService } from "../../../../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../../../../platform/product/common/productService.js";
import { IStorageService } from "../../../../../../../platform/storage/common/storage.js";
import { McpToolCallUI } from "../../../../../mcp/browser/mcpToolCallUI.js";
import { McpResourceURI } from "../../../../../mcp/common/mcpTypes.js";
import { McpApps } from "../../../../../mcp/common/modelContextProtocolApps.js";
import { IWebviewService, WebviewContentPurpose, WebviewOriginStore } from "../../../../../webview/browser/webview.js";
import { IChatToolInvocation } from "../../../../common/chatService/chatService.js";
import { isToolResultInputOutputDetails } from "../../../../common/tools/languageModelToolsService.js";
import { IChatWidgetService } from "../../../chat.js";
const ORIGIN_STORE_KEY = "chatMcpApp.origins";
let ChatMcpAppModel = class extends Disposable {
  constructor(toolInvocation, renderData, _container, maxHeight, currentWidth, _instantiationService, _chatWidgetService, _webviewService, storageService, _chatResponseResourceFsProvider, _logService, _productService, _openerService) {
    super();
    this.toolInvocation = toolInvocation;
    this.renderData = renderData;
    this._container = _container;
    this._instantiationService = _instantiationService;
    this._chatWidgetService = _chatWidgetService;
    this._webviewService = _webviewService;
    this._chatResponseResourceFsProvider = _chatResponseResourceFsProvider;
    this._logService = _logService;
    this._productService = _productService;
    this._openerService = _openerService;
    /** Cancellation source for async operations */
    this._disposeCts = this._register(new CancellationTokenSource());
    /** Whether ui/initialize has been called and capabilities announced */
    this._announcedCapabilities = false;
    /** Latest CSP used for the frame */
    this._latestCsp = void 0;
    /** Observable for load state */
    this._loadState = observableValue(this, { status: "loading" });
    this.loadState = this._loadState;
    /** Event fired when height changes */
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    /** Accumulated download resource parts from ui/download-file calls */
    this._downloadParts = observableValue(this, []);
    this.downloadParts = this._downloadParts;
    this._originStore = new WebviewOriginStore(ORIGIN_STORE_KEY, storageService);
    this._webviewOrigin = this._computeWebviewOrigin();
    this._mcpToolCallUI = this._register(this._instantiationService.createInstance(McpToolCallUI, renderData));
    this._height = ChatMcpAppModel.heightCache.get(this.toolInvocation) ?? 300;
    this._webview = this._register(this._webviewService.createWebviewElement({
      origin: this._webviewOrigin,
      title: localize("mcpAppTitle", "MCP App"),
      options: {
        purpose: WebviewContentPurpose.ChatOutputItem,
        enableFindWidget: false,
        disableServiceWorker: true,
        retainContextWhenHidden: true
      },
      contentOptions: {
        allowMultipleAPIAcquire: true,
        allowScripts: true,
        allowForms: true
      },
      extension: void 0
    }));
    const targetWindow = dom.getWindow(this._container);
    this._webview.mountTo(this._container, targetWindow);
    this.hostContext = this._mcpToolCallUI.hostContext.map((context, reader) => ({
      ...context,
      containerDimensions: {
        width: currentWidth.read(reader),
        maxHeight: maxHeight.read(reader)
      },
      toolCall: {
        toolCallId: this.toolInvocation.toolCallId,
        toolName: this.toolInvocation.toolId
      }
    }));
    this._register(autorun((reader) => {
      const context = this.hostContext.read(reader);
      if (this._announcedCapabilities) {
        this._sendNotification({
          method: "ui/notifications/host-context-changed",
          params: context
        });
      }
    }));
    this._register(this._webview.onMessage(async ({ message }) => {
      await this._handleWebviewMessage(message);
    }));
    this._register(this._mcpToolCallUI.onNotification((n) => {
      if (!this._announcedCapabilities) {
        return;
      }
      this._webview.postMessage({ jsonrpc: "2.0", method: n.method, params: n.params });
    }));
    this._loadContent();
  }
  /**
   * Gets the current height of the webview.
   */
  get height() {
    return this._height;
  }
  remount() {
    this._webview.reinitializeAfterDismount();
    this._announcedCapabilities = false;
  }
  /**
   * Retries loading the MCP App content.
   */
  retry() {
    this._loadState.set({ status: "loading" }, void 0);
    this._loadContent();
  }
  /**
   * Loads the MCP App content into the webview.
   */
  async _loadContent() {
    const token = this._disposeCts.token;
    try {
      const resourceContent = await this._mcpToolCallUI.loadResource(token);
      if (token.isCancellationRequested) {
        return;
      }
      const htmlWithCsp = this._injectPreamble(resourceContent);
      this._announcedCapabilities = false;
      this._latestCsp = resourceContent.csp;
      this._webview.setHtml(htmlWithCsp);
      this._loadState.set({ status: "loaded" }, void 0);
    } catch (error) {
      this._logService.error("[MCP App] Error loading app:", error);
      this._loadState.set({ status: "error", error }, void 0);
    }
  }
  /**
   * Injects a Content-Security-Policy meta tag into the HTML.
   */
  _injectPreamble({ html, csp }) {
    const cleanDomains = (s) => (s?.join(" ") || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    const cspContent = `
			default-src 'none';
			script-src 'self' 'unsafe-inline' ${cleanDomains(csp?.resourceDomains)};
			style-src 'self' 'unsafe-inline' ${cleanDomains(csp?.resourceDomains)};
			connect-src 'self' ${cleanDomains(csp?.connectDomains)};
			img-src 'self' data: ${cleanDomains(csp?.resourceDomains)};
			font-src 'self' ${cleanDomains(csp?.resourceDomains)};
			media-src 'self' data: ${cleanDomains(csp?.resourceDomains)};
			frame-src ${cleanDomains(csp?.frameDomains) || `'none'`};
			object-src 'none';
			base-uri ${cleanDomains(csp?.baseUriDomains) || `'self'`};
		`;
    const cspTag = `<meta http-equiv="Content-Security-Policy" content="${cspContent}">`;
    const postMessageRehoist = `
			<script>(() => {
				const api = acquireVsCodeApi();
				const setMessageSource = (obj, src) => new Proxy(obj, {
					get: (target, prop) => {
						if (prop === 'source')  {
							return src;
						}
						return target[prop];
					}
				});

				const wrappedFns = new WeakMap();

				let patchedPostMessage = (message, transfer) => api.postMessage(message, transfer);
				const wrap = target => new Proxy(target, {
					set: (obj, prop, value) => {
						if (prop === 'postMessage') {
							patchedPostMessage = (message, transfer) => value.call(target, message, transfer);
						} else {
							obj[prop] = value;
						}
						return true;
					},
					get: (obj, prop) => {
						if (prop === 'postMessage') {
							return patchedPostMessage;
						}
						return obj[prop];
					},
				});

				const originalAddEventListener = window.addEventListener.bind(window);
				window.addEventListener = (type, listener, options) => {
					if (type === 'message') {
						const originalListener = listener;
						const wrappedListener = (event) => {
							if (event.origin === document.location.origin && event.source !== window) { event = setMessageSource(event, window.parent); }
							originalListener(event);
						};
						wrappedFns.set(originalListener, wrappedListener);
						listener = wrappedListener;
					}

					return originalAddEventListener(type, listener, options);
				};

				const originalRemoveEventListener = window.removeEventListener.bind(window);
				window.removeEventListener = (type, listener, options) => {
					const wrappedListener = wrappedFns.get(listener) || listener;
					return originalRemoveEventListener(type, wrappedListener, options);
				};

				window.parent = wrap(window.parent);

				// Scroll boundary detection: bubble wheel events to parent when at scroll boundaries
				const shouldBubbleScroll = (event) => {
					// First check element-level scrolling (for elements with overflow: auto/scroll)
					for (let node = event.target; node; node = node.parentNode) {
						if (!(node instanceof Element)) {
							continue;
						}

						// Skip HTML and BODY - we check document-level scroll separately
						if (node === document.documentElement || node === document.body) {
							continue;
						}

						// Check if the element can actually scroll
						const overflow = window.getComputedStyle(node).overflowY;
						if (overflow === 'hidden' || overflow === 'visible') {
							continue;
						}

						// Scroll up: if there's content above (scrollTop > 0), don't bubble
						if (event.deltaY < 0 && node.scrollTop > 0) {
							return false;
						}

						// Scroll down: if there's content below, don't bubble
						if (event.deltaY > 0 && node.scrollTop + node.clientHeight < node.scrollHeight) {
							// Account for rounding: scrollTop isn't rounded but scrollHeight/clientHeight are
							if (node.scrollHeight - node.scrollTop - node.clientHeight < 2) {
								continue;
							}
							return false;
						}
					}

					// Check document-level scrolling (works even with overflow: visible on html/body)
					const docEl = document.documentElement;
					const scrollTop = window.scrollY || docEl.scrollTop || document.body.scrollTop || 0;
					const scrollHeight = Math.max(docEl.scrollHeight, document.body.scrollHeight);
					const clientHeight = docEl.clientHeight;
					const scrollableDistance = scrollHeight - clientHeight;

					if (scrollableDistance > 2) {
						// Document is scrollable
						if (event.deltaY < 0 && scrollTop > 0) {
							return false;
						}
						if (event.deltaY > 0 && scrollTop < scrollableDistance - 2) {
							return false;
						}
					}

					return true;
				};

				window.addEventListener('wheel', (event) => {
					if (event.defaultPrevented || !shouldBubbleScroll(event)) {
						return;
					}
					api.postMessage({
						method: 'ui/notifications/sandbox-wheel',
						params: {
							deltaMode: event.deltaMode,
							deltaX: event.deltaX,
							deltaY: event.deltaY,
							deltaZ: event.deltaZ,
						}
					});
				}, { passive: true });
			})();<\/script>
		`;
    return this._prependToHead(html, cspTag + postMessageRehoist);
  }
  _prependToHead(html, content) {
    const headMatch = html.match(/<head[^>]*>/i);
    if (headMatch) {
      const insertIndex = headMatch.index + headMatch[0].length;
      return html.slice(0, insertIndex) + "\n" + content + html.slice(insertIndex);
    }
    const htmlMatch = html.match(/<html[^>]*>/i);
    if (htmlMatch) {
      const insertIndex = htmlMatch.index + htmlMatch[0].length;
      return html.slice(0, insertIndex) + "\n<head>" + content + "</head>" + html.slice(insertIndex);
    }
    return `<!DOCTYPE html><html><head>${content}</head><body>${html}</body></html>`;
  }
  /**
   * Handles incoming JSON-RPC messages from the webview.
   */
  async _handleWebviewMessage(message) {
    const request = message;
    const token = this._disposeCts.token;
    try {
      let result = {};
      switch (request.method) {
        case "ui/initialize":
          result = await this._handleInitialize(request.params);
          break;
        case "tools/call":
          result = await this._handleToolsCall(request.params, token);
          break;
        case "resources/read":
          result = await this._handleResourcesRead(request.params, token);
          break;
        case "sampling/createMessage":
          result = await this._handleSamplingCreateMessage(request.params, token);
          break;
        case "ping":
          break;
        case "ui/notifications/size-changed":
          this._handleSizeChanged(request.params);
          break;
        case "ui/open-link":
          result = await this._handleOpenLink(request.params);
          break;
        case "ui/download-file":
          result = await this._handleDownloadFile(request.params);
          break;
        case "ui/request-display-mode":
          result = { mode: "inline" };
          break;
        case "ui/notifications/initialized":
          break;
        case "ui/message":
          result = await this._handleUiMessage(request.params);
          break;
        case "ui/update-model-context":
          result = await this._handleUpdateModelContext(request.params);
          break;
        case "notifications/message":
          await this._mcpToolCallUI.log(request.params);
          break;
        case "ui/notifications/sandbox-wheel":
          this._handleSandboxWheel(request.params);
          break;
        default: {
          softAssertNever(request);
          const cast = request;
          if (cast.id !== void 0) {
            await this._sendError(cast.id, -32601, `Method not found: ${cast.method}`);
          }
          return;
        }
      }
      if (hasKey(request, { id: true })) {
        await this._sendResponse(request.id, result);
      }
    } catch (error) {
      this._logService.error(`[MCP App] Error handling ${request.method}:`, error);
      if (hasKey(request, { id: true })) {
        const message2 = error instanceof Error ? error.message : String(error);
        await this._sendError(request.id, -32e3, message2);
      }
    }
  }
  /**
   * Handles the ui/initialize request from the MCP App View.
   */
  async _handleInitialize(_params) {
    this._announcedCapabilities = true;
    let args;
    try {
      args = JSON.parse(this.renderData.input);
    } catch {
      args = this.renderData.input;
    }
    const timeout = this._register(disposableTimeout(async () => {
      this._store.delete(timeout);
      await this._sendNotification({
        method: "ui/notifications/tool-input",
        params: { arguments: args }
      });
      if (this.toolInvocation.kind === "toolInvocationSerialized") {
        this._sendToolResult(this.toolInvocation.resultDetails);
      } else if (this.toolInvocation.kind === "toolInvocation") {
        const invocation = this.toolInvocation;
        this._register(autorunSelfDisposable((reader) => {
          const state = invocation.state.read(reader);
          if (state.type === IChatToolInvocation.StateKind.Completed) {
            this._sendToolResult(state.resultDetails);
            reader.dispose();
          }
        }));
      }
    }));
    return {
      protocolVersion: McpApps.LATEST_PROTOCOL_VERSION,
      hostInfo: {
        name: this._productService.nameLong,
        version: this._productService.version
      },
      hostCapabilities: {
        openLinks: {},
        serverTools: { listChanged: true },
        serverResources: { listChanged: true },
        logging: {},
        sandbox: {
          csp: this._latestCsp,
          permissions: { clipboardWrite: {} }
        },
        updateModelContext: {
          audio: {},
          image: {},
          resourceLink: {},
          resource: {},
          structuredContent: {}
        },
        downloadFile: {}
      },
      hostContext: this.hostContext.get()
    };
  }
  /**
   * Sends the tool result notification when the result becomes available.
   */
  /**
   * Returns a stable identifier for the originating MCP server to use
   * as the webview origin key. Local servers use their definition id,
   * agent-host servers use the per-session `serverId`.
   */
  _serverOriginId() {
    return this.renderData.kind === "agentHost" ? this.renderData.serverId : this.renderData.serverDefinitionId;
  }
  /**
   * Picks a stable webview origin for this server. Local MCP servers
   * get a persisted origin via {@link WebviewOriginStore} since their
   * server-definition id is stable across VS Code restarts. Agent-host
   * servers fall back to the static in-memory {@link _agentHostOrigins}
   * map keyed by `serverId`, so origins are stable within the app
   * lifetime without leaking entries into application storage for
   * every session.
   */
  _computeWebviewOrigin() {
    if (this.renderData.kind !== "agentHost") {
      return this._originStore.getOrigin("mcpApp", this._serverOriginId());
    }
    const key = this._serverOriginId();
    let origin = ChatMcpAppModel._agentHostOrigins.get(key);
    if (!origin) {
      origin = generateUuid();
      ChatMcpAppModel._agentHostOrigins.set(key, origin);
    }
    return origin;
  }
  /**
   * Resolves a server-relative resource URI into a workbench URI.
   * - Local servers: wrap in {@link McpResourceURI.fromServer} so it
   *   resolves through the MCP filesystem provider.
   * - Agent-host servers: pass through as a plain {@link URI}. There's
   *   no host-side resolver for AHP-backed servers in v1, so these
   *   URIs may not be openable, but they preserve the original
   *   resource reference for the user.
   */
  _resolveServerResourceUri(serverUri) {
    if (this.renderData.kind === "agentHost") {
      return URI.parse(serverUri);
    }
    return McpResourceURI.fromServer({ id: this.renderData.serverDefinitionId, label: "" }, serverUri);
  }
  _sendToolResult(resultDetails) {
    if (isToolResultInputOutputDetails(resultDetails) && resultDetails.mcpOutput) {
      this._sendNotification({
        method: "ui/notifications/tool-result",
        params: resultDetails.mcpOutput
      });
    }
  }
  async _handleUiMessage(params) {
    const widget = this._chatWidgetService.getWidgetBySessionResource(this.renderData.sessionResource);
    if (!widget) {
      return { isError: true };
    }
    if (!isFalsyOrWhitespace(widget.getInput())) {
      return { isError: true };
    }
    widget.setInput(params.content.filter((c) => c.type === "text").map((c) => c.text).join("\n\n"));
    widget.attachmentModel.clearAndSetContext(...params.content.map((c, i) => {
      const id = `mcpui-${i}-${Date.now()}`;
      if (c.type === "image") {
        return { kind: "image", value: decodeBase64(c.data).buffer, id, name: "Image" };
      } else if (c.type === "resource_link") {
        const uri = this._resolveServerResourceUri(c.uri);
        return { kind: "file", value: uri, id, name: basename(uri) };
      } else {
        return void 0;
      }
    }).filter(isDefined));
    widget.focusInput();
    return { isError: false };
  }
  async _handleUpdateModelContext(params) {
    const widget = this._chatWidgetService.getWidgetBySessionResource(this.renderData.sessionResource);
    if (!widget) {
      return {};
    }
    const idPrefix = `mcpui-context-${hash(this._serverOriginId())}-`;
    const toDelete = widget.attachmentModel.getAttachmentIDs();
    const idsToDelete = Array.from(toDelete).filter((id) => id.startsWith(idPrefix));
    const entries = [];
    let entryIndex = 0;
    if (params.content) {
      for (const block of params.content) {
        const id = `${idPrefix}${entryIndex++}`;
        if (block.type === "image") {
          entries.push({
            kind: "image",
            value: decodeBase64(block.data).buffer,
            id,
            name: "Image",
            mimeType: block.mimeType
          });
        } else if (block.type === "resource_link") {
          const uri = this._resolveServerResourceUri(block.uri);
          entries.push({
            kind: "file",
            value: uri,
            id,
            name: basename(uri)
          });
        } else if (block.type === "text") {
          const preview = block.text.replaceAll(/\s+/g, " ").trim();
          const truncateTo = 20;
          entries.push({
            kind: "generic",
            value: block.text,
            id,
            tooltip: new MarkdownString().appendCodeblock("plaintext", block.text),
            name: preview.length > truncateTo ? preview.slice(0, truncateTo) + "\u2026" : preview
          });
        }
      }
    }
    if (params.structuredContent && Object.keys(params.structuredContent).length > 0) {
      const id = `${idPrefix}structured`;
      const value = JSON.stringify(params.structuredContent, null, 2);
      entries.push({
        kind: "generic",
        value,
        tooltip: new MarkdownString().appendCodeblock("json", value),
        id,
        name: "UI Data"
      });
    }
    widget.attachmentModel.updateContext(idsToDelete, entries);
    return {};
  }
  _handleSizeChanged(params) {
    if (params.height !== void 0 && params.height !== this._height) {
      this._height = params.height;
      ChatMcpAppModel.heightCache.set(this.toolInvocation, params.height);
      this._onDidChangeHeight.fire();
    }
  }
  _handleSandboxWheel(params) {
    let defaultPrevented = false;
    const evt = {
      wheelDeltaX: params.deltaX,
      wheelDeltaY: -params.deltaY,
      wheelDelta: Math.abs(params.deltaY),
      deltaX: params.deltaX,
      deltaY: -params.deltaY,
      deltaZ: params.deltaZ,
      deltaMode: params.deltaMode,
      preventDefault: () => {
        defaultPrevented = true;
      },
      stopPropagation: () => {
      },
      get defaultPrevented() {
        return defaultPrevented;
      }
    };
    const widget = this._chatWidgetService.getWidgetBySessionResource(this.renderData.sessionResource);
    widget?.delegateScrollFromMouseWheelEvent(evt);
  }
  async _handleDownloadFile(params) {
    const newParts = [];
    let hadError = false;
    for (const content of params.contents) {
      try {
        if (content.type === "resource") {
          const resource = content.resource;
          const parsed = URI.parse(resource.uri);
          const data = hasKey(resource, { text: true }) ? new TextEncoder().encode(resource.text) : { base64: resource.blob };
          const { resource: uri } = this._chatResponseResourceFsProvider.associate(data, { sessionResource: this.renderData.sessionResource, name: basename(parsed) });
          newParts.push({ kind: "data", mimeType: resource.mimeType, uri });
        } else if (content.type === "resource_link") {
          const mcpUri = this._resolveServerResourceUri(content.uri);
          newParts.push({ kind: "data", mimeType: content.mimeType, uri: mcpUri });
        }
      } catch (error) {
        hadError = true;
        this._logService.warn("[MCP App] Failed to process ui/download-file content", error);
      }
    }
    if (newParts.length > 0) {
      const existing = this._downloadParts.get();
      this._downloadParts.set([...existing, ...newParts], void 0);
    }
    return hadError ? { isError: true } : {};
  }
  async _handleOpenLink(params) {
    let parsed;
    try {
      parsed = URI.parse(params.url, true);
    } catch {
      this._logService.warn(`[MCP App] Rejected ui/open-link with unparseable URL`);
      return { isError: true };
    }
    if (parsed.scheme !== "http" && parsed.scheme !== "https") {
      this._logService.warn(`[MCP App] Rejected ui/open-link with non-http(s) scheme: ${parsed.scheme}`);
      return { isError: true };
    }
    const ok = await this._openerService.open(parsed, { openExternal: true });
    return { isError: !ok };
  }
  /**
   * Handles tools/call requests from the MCP App.
   */
  async _handleToolsCall(params, token) {
    if (!params?.name) {
      throw new Error("Missing tool name in tools/call request");
    }
    return this._mcpToolCallUI.callTool(params.name, params.arguments || {}, token);
  }
  /**
   * Handles resources/read requests from the MCP App.
   */
  async _handleResourcesRead(params, token) {
    if (!params?.uri) {
      throw new Error("Missing uri in resources/read request");
    }
    return this._mcpToolCallUI.readResource(params.uri, token);
  }
  /**
   * Handles sampling/createMessage requests from the MCP App. Forwarded
   * to the host-side sampling implementation through the underlying
   * transport (typically an agent host that owns the MCP server).
   */
  async _handleSamplingCreateMessage(params, token) {
    if (!params) {
      throw new Error("Missing params in sampling/createMessage request");
    }
    return this._mcpToolCallUI.sampling(params, token);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async _sendResponse(id, result) {
    await this._webview.postMessage({
      jsonrpc: "2.0",
      id,
      result
    });
  }
  async _sendError(id, code, message) {
    await this._webview.postMessage({
      jsonrpc: "2.0",
      id,
      error: { code, message }
    });
  }
  async _sendNotification(message) {
    await this._webview.postMessage({
      jsonrpc: "2.0",
      ...message
    });
  }
  dispose() {
    this._disposeCts.dispose(true);
    super.dispose();
  }
};
ChatMcpAppModel.heightCache = /* @__PURE__ */ new WeakMap();
/**
 * In-memory origin map for agent-host MCP servers. Agent-host server
 * ids embed the session id, so they're effectively single-use across
 * VS Code restarts — using {@link WebviewOriginStore} for them would
 * accumulate one persisted entry per agent-host session forever. The
 * in-memory map keeps origins stable for the lifetime of the app
 * (enough for webview state to persist across re-renders) without
 * touching application storage.
 */
ChatMcpAppModel._agentHostOrigins = /* @__PURE__ */ new Map();
ChatMcpAppModel = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IChatWidgetService),
  __decorateParam(7, IWebviewService),
  __decorateParam(8, IStorageService),
  __decorateParam(9, IChatResponseResourceFileSystemProvider),
  __decorateParam(10, ILogService),
  __decorateParam(11, IProductService),
  __decorateParam(12, IOpenerService)
], ChatMcpAppModel);
export {
  ChatMcpAppModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcdG9vbEludm9jYXRpb25QYXJ0c1xcY2hhdE1jcEFwcE1vZGVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSU1vdXNlV2hlZWxFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IHNvZnRBc3NlcnROZXZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Fzc2VydC5qcyc7XG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGRlY29kZUJhc2U2NCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBoYXNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgYXV0b3J1blNlbGZEaXNwb3NhYmxlLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBpc0ZhbHN5T3JXaGl0ZXNwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBoYXNLZXksIGlzRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDaGF0UmVzcG9uc2VSZXNvdXJjZUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi93aWRnZXQvY2hhdFJlc3BvbnNlUmVzb3VyY2VGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5cbmltcG9ydCB7IElNY3BBcHBSZXNvdXJjZUNvbnRlbnQsIE1jcFRvb2xDYWxsVUkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9tY3AvYnJvd3Nlci9tY3BUb29sQ2FsbFVJLmpzJztcbmltcG9ydCB7IE1jcFJlc291cmNlVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbWNwL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBNQ1AgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9tY3AvY29tbW9uL21vZGVsQ29udGV4dFByb3RvY29sLmpzJztcbmltcG9ydCB7IE1jcEFwcHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9tY3AvY29tbW9uL21vZGVsQ29udGV4dFByb3RvY29sQXBwcy5qcyc7XG5pbXBvcnQgeyBJV2Vidmlld0VsZW1lbnQsIElXZWJ2aWV3U2VydmljZSwgV2Vidmlld0NvbnRlbnRQdXJwb3NlLCBXZWJ2aWV3T3JpZ2luU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93ZWJ2aWV3L2Jyb3dzZXIvd2Vidmlldy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRUb29sSW52b2NhdGlvbiwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNUb29sUmVzdWx0SW5wdXRPdXRwdXREZXRhaWxzLCBJVG9vbFJlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRDb2xsYXBzaWJsZUlPRGF0YVBhcnQgfSBmcm9tICcuLi9jaGF0VG9vbElucHV0T3V0cHV0Q29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgSU1jcEFwcFJlbmRlckRhdGEgfSBmcm9tICcuL2NoYXRNY3BBcHBTdWJQYXJ0LmpzJztcblxuLyoqIFN0b3JhZ2Uga2V5IGZvciBwZXJzaXN0ZW50IHdlYnZpZXcgb3JpZ2lucyAqL1xuY29uc3QgT1JJR0lOX1NUT1JFX0tFWSA9ICdjaGF0TWNwQXBwLm9yaWdpbnMnO1xuXG4vKipcbiAqIExvYWQgc3RhdGUgZm9yIHRoZSBNQ1AgQXBwIG1vZGVsLlxuICovXG5leHBvcnQgdHlwZSBNY3BBcHBMb2FkU3RhdGUgPVxuXHR8IHsgcmVhZG9ubHkgc3RhdHVzOiAnbG9hZGluZycgfVxuXHR8IHsgcmVhZG9ubHkgc3RhdHVzOiAnbG9hZGVkJyB9XG5cdHwgeyByZWFkb25seSBzdGF0dXM6ICdlcnJvcic7IHJlYWRvbmx5IGVycm9yOiBFcnJvciB9O1xuXG4vKipcbiAqIE1vZGVsIHRoYXQgb3ducyBhbiBNQ1AgQXBwIHdlYnZpZXcgYW5kIGFsbCBpdHMgc3RhdGUvbG9naWMuXG4gKiBUaGUgd2VidmlldyBpcyBjcmVhdGVkIGxhemlseSBvbiBmaXJzdCBjbGFpbSBhbmQgc3Vydml2ZXMgYWNyb3NzIHJlLXJlbmRlcnMuXG4gKi9cbmV4cG9ydCBjbGFzcyBDaGF0TWNwQXBwTW9kZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgaGVpZ2h0Q2FjaGUgPSBuZXcgV2Vha01hcDxJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQsIG51bWJlcj4oKTtcblxuXHQvKipcblx0ICogSW4tbWVtb3J5IG9yaWdpbiBtYXAgZm9yIGFnZW50LWhvc3QgTUNQIHNlcnZlcnMuIEFnZW50LWhvc3Qgc2VydmVyXG5cdCAqIGlkcyBlbWJlZCB0aGUgc2Vzc2lvbiBpZCwgc28gdGhleSdyZSBlZmZlY3RpdmVseSBzaW5nbGUtdXNlIGFjcm9zc1xuXHQgKiBWUyBDb2RlIHJlc3RhcnRzIFx1MjAxNCB1c2luZyB7QGxpbmsgV2Vidmlld09yaWdpblN0b3JlfSBmb3IgdGhlbSB3b3VsZFxuXHQgKiBhY2N1bXVsYXRlIG9uZSBwZXJzaXN0ZWQgZW50cnkgcGVyIGFnZW50LWhvc3Qgc2Vzc2lvbiBmb3JldmVyLiBUaGVcblx0ICogaW4tbWVtb3J5IG1hcCBrZWVwcyBvcmlnaW5zIHN0YWJsZSBmb3IgdGhlIGxpZmV0aW1lIG9mIHRoZSBhcHBcblx0ICogKGVub3VnaCBmb3Igd2VidmlldyBzdGF0ZSB0byBwZXJzaXN0IGFjcm9zcyByZS1yZW5kZXJzKSB3aXRob3V0XG5cdCAqIHRvdWNoaW5nIGFwcGxpY2F0aW9uIHN0b3JhZ2UuXG5cdCAqL1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfYWdlbnRIb3N0T3JpZ2lucyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cblx0LyoqIE9yaWdpbiBzdG9yZSBmb3IgcGVyc2lzdGVudCB3ZWJ2aWV3IG9yaWdpbnMgcGVyIHNlcnZlciAobG9jYWwgTUNQIG9ubHkpICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX29yaWdpblN0b3JlOiBXZWJ2aWV3T3JpZ2luU3RvcmU7XG5cblx0LyoqIFRoZSB3ZWJ2aWV3IGVsZW1lbnQgaW5zdGFuY2UgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfd2VidmlldzogSVdlYnZpZXdFbGVtZW50O1xuXG5cdC8qKiBUb29sIGNhbGwgVUkgZm9yIGxvYWRpbmcgcmVzb3VyY2VzIGFuZCBwcm94eWluZyBjYWxscyAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tY3BUb29sQ2FsbFVJOiBNY3BUb29sQ2FsbFVJO1xuXG5cdC8qKiBDYW5jZWxsYXRpb24gc291cmNlIGZvciBhc3luYyBvcGVyYXRpb25zICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2VDdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cblx0LyoqIFdoZXRoZXIgdWkvaW5pdGlhbGl6ZSBoYXMgYmVlbiBjYWxsZWQgYW5kIGNhcGFiaWxpdGllcyBhbm5vdW5jZWQgKi9cblx0cHJpdmF0ZSBfYW5ub3VuY2VkQ2FwYWJpbGl0aWVzID0gZmFsc2U7XG5cblx0LyoqIExhdGVzdCBDU1AgdXNlZCBmb3IgdGhlIGZyYW1lICovXG5cdHByaXZhdGUgX2xhdGVzdENzcDogTWNwQXBwcy5NY3BVaVJlc291cmNlQ3NwIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdC8qKiBDdXJyZW50IGhlaWdodCBvZiB0aGUgd2VidmlldyAqL1xuXHRwcml2YXRlIF9oZWlnaHQ6IG51bWJlcjtcblxuXHQvKiogVGhlIHBlcnNpc3RlbnQgd2VidmlldyBvcmlnaW4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfd2Vidmlld09yaWdpbjogc3RyaW5nO1xuXG5cdC8qKiBPYnNlcnZhYmxlIGZvciBsb2FkIHN0YXRlICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvYWRTdGF0ZSA9IG9ic2VydmFibGVWYWx1ZTxNY3BBcHBMb2FkU3RhdGU+KHRoaXMsIHsgc3RhdHVzOiAnbG9hZGluZycgfSk7XG5cdHB1YmxpYyByZWFkb25seSBsb2FkU3RhdGU6IElPYnNlcnZhYmxlPE1jcEFwcExvYWRTdGF0ZT4gPSB0aGlzLl9sb2FkU3RhdGU7XG5cblx0LyoqIEV2ZW50IGZpcmVkIHdoZW4gaGVpZ2h0IGNoYW5nZXMgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VIZWlnaHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlSGVpZ2h0OiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmV2ZW50O1xuXG5cdC8qKiBBY2N1bXVsYXRlZCBkb3dubG9hZCByZXNvdXJjZSBwYXJ0cyBmcm9tIHVpL2Rvd25sb2FkLWZpbGUgY2FsbHMgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZG93bmxvYWRQYXJ0cyA9IG9ic2VydmFibGVWYWx1ZTxJQ2hhdENvbGxhcHNpYmxlSU9EYXRhUGFydFtdPih0aGlzLCBbXSk7XG5cdHB1YmxpYyByZWFkb25seSBkb3dubG9hZFBhcnRzOiBJT2JzZXJ2YWJsZTxJQ2hhdENvbGxhcHNpYmxlSU9EYXRhUGFydFtdPiA9IHRoaXMuX2Rvd25sb2FkUGFydHM7XG5cblx0LyoqIEZ1bGwgaG9zdCBjb250ZXh0IGZvciB0aGUgTUNQIEFwcCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgaG9zdENvbnRleHQ6IElPYnNlcnZhYmxlPE1jcEFwcHMuTWNwVWlIb3N0Q29udGV4dD47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQsXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlbmRlckRhdGE6IElNY3BBcHBSZW5kZXJEYXRhLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0bWF4SGVpZ2h0OiBJT2JzZXJ2YWJsZTxudW1iZXI+LFxuXHRcdGN1cnJlbnRXaWR0aDogSU9ic2VydmFibGU8bnVtYmVyPixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJV2Vidmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd2Vidmlld1NlcnZpY2U6IElXZWJ2aWV3U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDaGF0UmVzcG9uc2VSZXNvdXJjZUZpbGVTeXN0ZW1Qcm92aWRlciBwcml2YXRlIHJlYWRvbmx5IF9jaGF0UmVzcG9uc2VSZXNvdXJjZUZzUHJvdmlkZXI6IElDaGF0UmVzcG9uc2VSZXNvdXJjZUZpbGVTeXN0ZW1Qcm92aWRlcixcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX29yaWdpblN0b3JlID0gbmV3IFdlYnZpZXdPcmlnaW5TdG9yZShPUklHSU5fU1RPUkVfS0VZLCBzdG9yYWdlU2VydmljZSk7XG5cdFx0dGhpcy5fd2Vidmlld09yaWdpbiA9IHRoaXMuX2NvbXB1dGVXZWJ2aWV3T3JpZ2luKCk7XG5cdFx0dGhpcy5fbWNwVG9vbENhbGxVSSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1jcFRvb2xDYWxsVUksIHJlbmRlckRhdGEpKTtcblx0XHR0aGlzLl9oZWlnaHQgPSBDaGF0TWNwQXBwTW9kZWwuaGVpZ2h0Q2FjaGUuZ2V0KHRoaXMudG9vbEludm9jYXRpb24pID8/IDMwMDtcblxuXHRcdC8vIENyZWF0ZSB0aGUgd2VidmlldyBlbGVtZW50XG5cdFx0dGhpcy5fd2VidmlldyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3dlYnZpZXdTZXJ2aWNlLmNyZWF0ZVdlYnZpZXdFbGVtZW50KHtcblx0XHRcdG9yaWdpbjogdGhpcy5fd2Vidmlld09yaWdpbixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbWNwQXBwVGl0bGUnLCAnTUNQIEFwcCcpLFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRwdXJwb3NlOiBXZWJ2aWV3Q29udGVudFB1cnBvc2UuQ2hhdE91dHB1dEl0ZW0sXG5cdFx0XHRcdGVuYWJsZUZpbmRXaWRnZXQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNhYmxlU2VydmljZVdvcmtlcjogdHJ1ZSxcblx0XHRcdFx0cmV0YWluQ29udGV4dFdoZW5IaWRkZW46IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0Y29udGVudE9wdGlvbnM6IHtcblx0XHRcdFx0YWxsb3dNdWx0aXBsZUFQSUFjcXVpcmU6IHRydWUsXG5cdFx0XHRcdGFsbG93U2NyaXB0czogdHJ1ZSxcblx0XHRcdFx0YWxsb3dGb3JtczogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHRleHRlbnNpb246IHVuZGVmaW5lZCxcblx0XHR9KSk7XG5cblx0XHQvLyBNb3VudCB0aGUgd2VidmlldyB0byB0aGUgY29udGFpbmVyXG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZG9tLmdldFdpbmRvdyh0aGlzLl9jb250YWluZXIpO1xuXHRcdHRoaXMuX3dlYnZpZXcubW91bnRUbyh0aGlzLl9jb250YWluZXIsIHRhcmdldFdpbmRvdyk7XG5cblx0XHQvLyBCdWlsZCBob3N0IGNvbnRleHQgb2JzZXJ2YWJsZVxuXHRcdHRoaXMuaG9zdENvbnRleHQgPSB0aGlzLl9tY3BUb29sQ2FsbFVJLmhvc3RDb250ZXh0Lm1hcCgoY29udGV4dCwgcmVhZGVyKSA9PiAoe1xuXHRcdFx0Li4uY29udGV4dCxcblx0XHRcdGNvbnRhaW5lckRpbWVuc2lvbnM6IHtcblx0XHRcdFx0d2lkdGg6IGN1cnJlbnRXaWR0aC5yZWFkKHJlYWRlciksXG5cdFx0XHRcdG1heEhlaWdodDogbWF4SGVpZ2h0LnJlYWQocmVhZGVyKSxcblx0XHRcdH0sXG5cdFx0XHR0b29sQ2FsbDoge1xuXHRcdFx0XHR0b29sQ2FsbElkOiB0aGlzLnRvb2xJbnZvY2F0aW9uLnRvb2xDYWxsSWQsXG5cdFx0XHRcdHRvb2xOYW1lOiB0aGlzLnRvb2xJbnZvY2F0aW9uLnRvb2xJZCxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0Ly8gU2V0IHVwIGhvc3QgY29udGV4dCBjaGFuZ2Ugbm90aWZpY2F0aW9uc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSB0aGlzLmhvc3RDb250ZXh0LnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICh0aGlzLl9hbm5vdW5jZWRDYXBhYmlsaXRpZXMpIHtcblx0XHRcdFx0dGhpcy5fc2VuZE5vdGlmaWNhdGlvbih7XG5cdFx0XHRcdFx0bWV0aG9kOiAndWkvbm90aWZpY2F0aW9ucy9ob3N0LWNvbnRleHQtY2hhbmdlZCcsXG5cdFx0XHRcdFx0cGFyYW1zOiBjb250ZXh0XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFNldCB1cCBtZXNzYWdlIGhhbmRsaW5nXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fd2Vidmlldy5vbk1lc3NhZ2UoYXN5bmMgKHsgbWVzc2FnZSB9KSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLl9oYW5kbGVXZWJ2aWV3TWVzc2FnZShtZXNzYWdlIGFzIE1jcEFwcHMuQXBwTWVzc2FnZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbWNwVG9vbENhbGxVSS5vbk5vdGlmaWNhdGlvbihuID0+IHtcblx0XHRcdGlmICghdGhpcy5fYW5ub3VuY2VkQ2FwYWJpbGl0aWVzKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3dlYnZpZXcucG9zdE1lc3NhZ2UoeyBqc29ucnBjOiAnMi4wJywgbWV0aG9kOiBuLm1ldGhvZCwgcGFyYW1zOiBuLnBhcmFtcyB9KTtcblx0XHR9KSk7XG5cblx0XHQvLyBTdGFydCBsb2FkaW5nIHRoZSBjb250ZW50XG5cdFx0dGhpcy5fbG9hZENvbnRlbnQoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBjdXJyZW50IGhlaWdodCBvZiB0aGUgd2Vidmlldy5cblx0ICovXG5cdHB1YmxpYyBnZXQgaGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2hlaWdodDtcblx0fVxuXG5cdHB1YmxpYyByZW1vdW50KCkge1xuXHRcdHRoaXMuX3dlYnZpZXcucmVpbml0aWFsaXplQWZ0ZXJEaXNtb3VudCgpO1xuXHRcdHRoaXMuX2Fubm91bmNlZENhcGFiaWxpdGllcyA9IGZhbHNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHJpZXMgbG9hZGluZyB0aGUgTUNQIEFwcCBjb250ZW50LlxuXHQgKi9cblx0cHVibGljIHJldHJ5KCk6IHZvaWQge1xuXHRcdHRoaXMuX2xvYWRTdGF0ZS5zZXQoeyBzdGF0dXM6ICdsb2FkaW5nJyB9LCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX2xvYWRDb250ZW50KCk7XG5cdH1cblxuXHQvKipcblx0ICogTG9hZHMgdGhlIE1DUCBBcHAgY29udGVudCBpbnRvIHRoZSB3ZWJ2aWV3LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfbG9hZENvbnRlbnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdG9rZW4gPSB0aGlzLl9kaXNwb3NlQ3RzLnRva2VuO1xuXG5cdFx0dHJ5IHtcblx0XHRcdC8vIExvYWQgdGhlIFVJIHJlc291cmNlIGZyb20gdGhlIE1DUCBzZXJ2ZXJcblx0XHRcdGNvbnN0IHJlc291cmNlQ29udGVudCA9IGF3YWl0IHRoaXMuX21jcFRvb2xDYWxsVUkubG9hZFJlc291cmNlKHRva2VuKTtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIEluamVjdCBDU1AgaW50byB0aGUgSFRNTFxuXHRcdFx0Y29uc3QgaHRtbFdpdGhDc3AgPSB0aGlzLl9pbmplY3RQcmVhbWJsZShyZXNvdXJjZUNvbnRlbnQpO1xuXG5cdFx0XHQvLyBSZXNldCB0aGUgc3RhdGVcblx0XHRcdHRoaXMuX2Fubm91bmNlZENhcGFiaWxpdGllcyA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fbGF0ZXN0Q3NwID0gcmVzb3VyY2VDb250ZW50LmNzcDtcblxuXHRcdFx0Ly8gU2V0IHRoZSBIVE1MIGNvbnRlbnRcblx0XHRcdHRoaXMuX3dlYnZpZXcuc2V0SHRtbChodG1sV2l0aENzcCk7XG5cblx0XHRcdHRoaXMuX2xvYWRTdGF0ZS5zZXQoeyBzdGF0dXM6ICdsb2FkZWQnIH0sIHVuZGVmaW5lZCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1tNQ1AgQXBwXSBFcnJvciBsb2FkaW5nIGFwcDonLCBlcnJvcik7XG5cdFx0XHR0aGlzLl9sb2FkU3RhdGUuc2V0KHsgc3RhdHVzOiAnZXJyb3InLCBlcnJvcjogZXJyb3IgYXMgRXJyb3IgfSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogSW5qZWN0cyBhIENvbnRlbnQtU2VjdXJpdHktUG9saWN5IG1ldGEgdGFnIGludG8gdGhlIEhUTUwuXG5cdCAqL1xuXHRwcml2YXRlIF9pbmplY3RQcmVhbWJsZSh7IGh0bWwsIGNzcCB9OiBJTWNwQXBwUmVzb3VyY2VDb250ZW50KTogc3RyaW5nIHtcblx0XHQvLyBOb3RlOiB0aGlzIGlzIG5vdCBidWxsZXRwcm9vZiBhZ2FpbnN0IG1hbGZvcm1lZCBkb21haW5zLiBIb3dldmVyIGl0IGRvZXMgbm90XG5cdFx0Ly8gbmVlZCB0byBiZS4gVGhlIHNlcnZlciBpcyB0aGUgb25lIGdpdmluZyB1cyBib3RoIHRoZSBDU1AgYXMgd2VsbCBhcyB0aGUgSFRNTFxuXHRcdC8vIHRvIHJlbmRlciBpbiB0aGUgaWZyYW1lLiBNQ1AgQXBwcyBnaXZlIHRoZSBDU1Agc2VwYXJhdGVseSBzbyB0aGF0IHN5c3RlbXMgdGhhdFxuXHRcdC8vIHByb3h5IHRoZSBIVE1MIGZyb20gYSBzZXJ2ZXIgY2FuIHNldCBpdCBpbiBhIGhlYWRlciwgYnV0IHRoZSBDU1AgYW5kIHRoZSBIVE1MXG5cdFx0Ly8gY29tZSBmcm9tIHRoZSBzYW1lIHNvdXJjZSBhbmQgYXJlIHdpdGhpbiB0aGUgc2FtZSB0cnVzdCBib3VuZGFyeS4gV2Ugb25seVxuXHRcdC8vIHByb2Nlc3MgdGhlIENTUCBlbm91Z2ggKGVzY2FwaW5nIEhUTUwgc3BlY2lhbCBjaGFyYWN0ZXJzKSB0byBhdm9pZCBicmVha2luZyBpdC5cblx0XHQvL1xuXHRcdC8vIEl0IHdvdWxkIGNlcnRhaW5seSBiZSBtb3JlIGR1cmFibGUgdG8gdXNlIGBET01QYXJzZXIucGFyc2VGcm9tU3RyaW5nYCBoZXJlXG5cdFx0Ly8gYW5kIG9wZXJhdGUgb24gdGhlIERvY3VtZW50RnJhZ21lbnQgb2YgdGhlIEhUTUwsIGhvd2V2ZXIgKGV2ZW4gdGhvdWdoIGtlZXBpbmdcblx0XHQvLyBpdCBzb2xlbHkgYXMgYSBkZXRhY2hlZCBkb2N1bWVudCBpcyBzYWZlKSB0aGlzIHJlcXVpcmVzIG1ha2luZyB0aGUgSFRNTCB0cnVzdGVkXG5cdFx0Ly8gaW4gdGhlIHJlbmRlcmVyIGFuZCBieXBhc3NpbmcgdmFyaW91cyB0c2VjIHdhcm5pbmdzLiBJIGNvbnNpZGVyIHRoZSBzdHJpbmdcblx0XHQvLyBtdW5naW5nIGhlcmUgdG8gYmUgdGhlIGxlc3NlciBvZiB0d28gZXZpbHMuXG5cdFx0Y29uc3QgY2xlYW5Eb21haW5zID0gKHM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkKSA9PiAocz8uam9pbignICcpIHx8ICcnKVxuXHRcdFx0LnJlcGxhY2VBbGwoJyYnLCAnJmFtcDsnKVxuXHRcdFx0LnJlcGxhY2VBbGwoJzwnLCAnJmx0OycpXG5cdFx0XHQucmVwbGFjZUFsbCgnPicsICcmZ3Q7Jylcblx0XHRcdC5yZXBsYWNlQWxsKCdcIicsICcmcXVvdDsnKTtcblxuXHRcdGNvbnN0IGNzcENvbnRlbnQgPSBgXG5cdFx0XHRkZWZhdWx0LXNyYyAnbm9uZSc7XG5cdFx0XHRzY3JpcHQtc3JjICdzZWxmJyAndW5zYWZlLWlubGluZScgJHtjbGVhbkRvbWFpbnMoY3NwPy5yZXNvdXJjZURvbWFpbnMpfTtcblx0XHRcdHN0eWxlLXNyYyAnc2VsZicgJ3Vuc2FmZS1pbmxpbmUnICR7Y2xlYW5Eb21haW5zKGNzcD8ucmVzb3VyY2VEb21haW5zKX07XG5cdFx0XHRjb25uZWN0LXNyYyAnc2VsZicgJHtjbGVhbkRvbWFpbnMoY3NwPy5jb25uZWN0RG9tYWlucyl9O1xuXHRcdFx0aW1nLXNyYyAnc2VsZicgZGF0YTogJHtjbGVhbkRvbWFpbnMoY3NwPy5yZXNvdXJjZURvbWFpbnMpfTtcblx0XHRcdGZvbnQtc3JjICdzZWxmJyAke2NsZWFuRG9tYWlucyhjc3A/LnJlc291cmNlRG9tYWlucyl9O1xuXHRcdFx0bWVkaWEtc3JjICdzZWxmJyBkYXRhOiAke2NsZWFuRG9tYWlucyhjc3A/LnJlc291cmNlRG9tYWlucyl9O1xuXHRcdFx0ZnJhbWUtc3JjICR7Y2xlYW5Eb21haW5zKGNzcD8uZnJhbWVEb21haW5zKSB8fCBgJ25vbmUnYH07XG5cdFx0XHRvYmplY3Qtc3JjICdub25lJztcblx0XHRcdGJhc2UtdXJpICR7Y2xlYW5Eb21haW5zKGNzcD8uYmFzZVVyaURvbWFpbnMpIHx8IGAnc2VsZidgfTtcblx0XHRgO1xuXG5cdFx0Y29uc3QgY3NwVGFnID0gYDxtZXRhIGh0dHAtZXF1aXY9XCJDb250ZW50LVNlY3VyaXR5LVBvbGljeVwiIGNvbnRlbnQ9XCIke2NzcENvbnRlbnR9XCI+YDtcblxuXHRcdC8vIHdpbmRvdy50b3AgYW5kIHdpbmRvdy5wYXJlbnQgZ2V0IHJlc2V0IHRvIGB3aW5kb3dgIGFmdGVyIHRoZSB2c2NvZGUgQVBJIGlzIG1hZGUuXG5cdFx0Ly8gSG93ZXZlciwgdGhlIE1DUCBBcHAgU0RLIGJ5IGRlZmF1bHQgdHJpZXMgdG8gdXNlIHRoZXNlIGZvciBwb3N0TWVzc2FnZS4gU28sIHdyYXAgdGhlbS5cblx0XHQvLyBXZSBhbHNvIG5lZWQgdG8gd3JhcCB0aGUgZXZlbnQgbGlzdGVuZXJzIG90aGVyd2lzZSB0aGUgZXZlbnQuc291cmNlIHdvbid0IG1hdGNoXG5cdFx0Ly8gdGhlIHdyYXBwZWQgd2luZG93LnBhcmVudC93aW5kb3cudG9wLlxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2Jsb2IvMmE0YzhmNWI4YTcxNWQ0NWRkMmEzNjc3ODkwNmI1ODEwZTRhMTkwNS9zcmMvdnMvd29ya2JlbmNoL2NvbnRyaWIvd2Vidmlldy9icm93c2VyL3ByZS9pbmRleC5odG1sI0wyNDItTDI0NFxuXHRcdGNvbnN0IHBvc3RNZXNzYWdlUmVob2lzdCA9IGBcblx0XHRcdDxzY3JpcHQ+KCgpID0+IHtcblx0XHRcdFx0Y29uc3QgYXBpID0gYWNxdWlyZVZzQ29kZUFwaSgpO1xuXHRcdFx0XHRjb25zdCBzZXRNZXNzYWdlU291cmNlID0gKG9iaiwgc3JjKSA9PiBuZXcgUHJveHkob2JqLCB7XG5cdFx0XHRcdFx0Z2V0OiAodGFyZ2V0LCBwcm9wKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAocHJvcCA9PT0gJ3NvdXJjZScpICB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBzcmM7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGFyZ2V0W3Byb3BdO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3Qgd3JhcHBlZEZucyA9IG5ldyBXZWFrTWFwKCk7XG5cblx0XHRcdFx0bGV0IHBhdGNoZWRQb3N0TWVzc2FnZSA9IChtZXNzYWdlLCB0cmFuc2ZlcikgPT4gYXBpLnBvc3RNZXNzYWdlKG1lc3NhZ2UsIHRyYW5zZmVyKTtcblx0XHRcdFx0Y29uc3Qgd3JhcCA9IHRhcmdldCA9PiBuZXcgUHJveHkodGFyZ2V0LCB7XG5cdFx0XHRcdFx0c2V0OiAob2JqLCBwcm9wLCB2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHByb3AgPT09ICdwb3N0TWVzc2FnZScpIHtcblx0XHRcdFx0XHRcdFx0cGF0Y2hlZFBvc3RNZXNzYWdlID0gKG1lc3NhZ2UsIHRyYW5zZmVyKSA9PiB2YWx1ZS5jYWxsKHRhcmdldCwgbWVzc2FnZSwgdHJhbnNmZXIpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0b2JqW3Byb3BdID0gdmFsdWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldDogKG9iaiwgcHJvcCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHByb3AgPT09ICdwb3N0TWVzc2FnZScpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHBhdGNoZWRQb3N0TWVzc2FnZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBvYmpbcHJvcF07XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxBZGRFdmVudExpc3RlbmVyID0gd2luZG93LmFkZEV2ZW50TGlzdGVuZXIuYmluZCh3aW5kb3cpO1xuXHRcdFx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lciA9ICh0eXBlLCBsaXN0ZW5lciwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRcdGlmICh0eXBlID09PSAnbWVzc2FnZScpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG9yaWdpbmFsTGlzdGVuZXIgPSBsaXN0ZW5lcjtcblx0XHRcdFx0XHRcdGNvbnN0IHdyYXBwZWRMaXN0ZW5lciA9IChldmVudCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRpZiAoZXZlbnQub3JpZ2luID09PSBkb2N1bWVudC5sb2NhdGlvbi5vcmlnaW4gJiYgZXZlbnQuc291cmNlICE9PSB3aW5kb3cpIHsgZXZlbnQgPSBzZXRNZXNzYWdlU291cmNlKGV2ZW50LCB3aW5kb3cucGFyZW50KTsgfVxuXHRcdFx0XHRcdFx0XHRvcmlnaW5hbExpc3RlbmVyKGV2ZW50KTtcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHR3cmFwcGVkRm5zLnNldChvcmlnaW5hbExpc3RlbmVyLCB3cmFwcGVkTGlzdGVuZXIpO1xuXHRcdFx0XHRcdFx0bGlzdGVuZXIgPSB3cmFwcGVkTGlzdGVuZXI7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIG9yaWdpbmFsQWRkRXZlbnRMaXN0ZW5lcih0eXBlLCBsaXN0ZW5lciwgb3B0aW9ucyk7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxSZW1vdmVFdmVudExpc3RlbmVyID0gd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIuYmluZCh3aW5kb3cpO1xuXHRcdFx0XHR3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lciA9ICh0eXBlLCBsaXN0ZW5lciwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHdyYXBwZWRMaXN0ZW5lciA9IHdyYXBwZWRGbnMuZ2V0KGxpc3RlbmVyKSB8fCBsaXN0ZW5lcjtcblx0XHRcdFx0XHRyZXR1cm4gb3JpZ2luYWxSZW1vdmVFdmVudExpc3RlbmVyKHR5cGUsIHdyYXBwZWRMaXN0ZW5lciwgb3B0aW9ucyk7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0d2luZG93LnBhcmVudCA9IHdyYXAod2luZG93LnBhcmVudCk7XG5cblx0XHRcdFx0Ly8gU2Nyb2xsIGJvdW5kYXJ5IGRldGVjdGlvbjogYnViYmxlIHdoZWVsIGV2ZW50cyB0byBwYXJlbnQgd2hlbiBhdCBzY3JvbGwgYm91bmRhcmllc1xuXHRcdFx0XHRjb25zdCBzaG91bGRCdWJibGVTY3JvbGwgPSAoZXZlbnQpID0+IHtcblx0XHRcdFx0XHQvLyBGaXJzdCBjaGVjayBlbGVtZW50LWxldmVsIHNjcm9sbGluZyAoZm9yIGVsZW1lbnRzIHdpdGggb3ZlcmZsb3c6IGF1dG8vc2Nyb2xsKVxuXHRcdFx0XHRcdGZvciAobGV0IG5vZGUgPSBldmVudC50YXJnZXQ7IG5vZGU7IG5vZGUgPSBub2RlLnBhcmVudE5vZGUpIHtcblx0XHRcdFx0XHRcdGlmICghKG5vZGUgaW5zdGFuY2VvZiBFbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gU2tpcCBIVE1MIGFuZCBCT0RZIC0gd2UgY2hlY2sgZG9jdW1lbnQtbGV2ZWwgc2Nyb2xsIHNlcGFyYXRlbHlcblx0XHRcdFx0XHRcdGlmIChub2RlID09PSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQgfHwgbm9kZSA9PT0gZG9jdW1lbnQuYm9keSkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gQ2hlY2sgaWYgdGhlIGVsZW1lbnQgY2FuIGFjdHVhbGx5IHNjcm9sbFxuXHRcdFx0XHRcdFx0Y29uc3Qgb3ZlcmZsb3cgPSB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShub2RlKS5vdmVyZmxvd1k7XG5cdFx0XHRcdFx0XHRpZiAob3ZlcmZsb3cgPT09ICdoaWRkZW4nIHx8IG92ZXJmbG93ID09PSAndmlzaWJsZScpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIFNjcm9sbCB1cDogaWYgdGhlcmUncyBjb250ZW50IGFib3ZlIChzY3JvbGxUb3AgPiAwKSwgZG9uJ3QgYnViYmxlXG5cdFx0XHRcdFx0XHRpZiAoZXZlbnQuZGVsdGFZIDwgMCAmJiBub2RlLnNjcm9sbFRvcCA+IDApIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQvLyBTY3JvbGwgZG93bjogaWYgdGhlcmUncyBjb250ZW50IGJlbG93LCBkb24ndCBidWJibGVcblx0XHRcdFx0XHRcdGlmIChldmVudC5kZWx0YVkgPiAwICYmIG5vZGUuc2Nyb2xsVG9wICsgbm9kZS5jbGllbnRIZWlnaHQgPCBub2RlLnNjcm9sbEhlaWdodCkge1xuXHRcdFx0XHRcdFx0XHQvLyBBY2NvdW50IGZvciByb3VuZGluZzogc2Nyb2xsVG9wIGlzbid0IHJvdW5kZWQgYnV0IHNjcm9sbEhlaWdodC9jbGllbnRIZWlnaHQgYXJlXG5cdFx0XHRcdFx0XHRcdGlmIChub2RlLnNjcm9sbEhlaWdodCAtIG5vZGUuc2Nyb2xsVG9wIC0gbm9kZS5jbGllbnRIZWlnaHQgPCAyKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIENoZWNrIGRvY3VtZW50LWxldmVsIHNjcm9sbGluZyAod29ya3MgZXZlbiB3aXRoIG92ZXJmbG93OiB2aXNpYmxlIG9uIGh0bWwvYm9keSlcblx0XHRcdFx0XHRjb25zdCBkb2NFbCA9IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudDtcblx0XHRcdFx0XHRjb25zdCBzY3JvbGxUb3AgPSB3aW5kb3cuc2Nyb2xsWSB8fCBkb2NFbC5zY3JvbGxUb3AgfHwgZG9jdW1lbnQuYm9keS5zY3JvbGxUb3AgfHwgMDtcblx0XHRcdFx0XHRjb25zdCBzY3JvbGxIZWlnaHQgPSBNYXRoLm1heChkb2NFbC5zY3JvbGxIZWlnaHQsIGRvY3VtZW50LmJvZHkuc2Nyb2xsSGVpZ2h0KTtcblx0XHRcdFx0XHRjb25zdCBjbGllbnRIZWlnaHQgPSBkb2NFbC5jbGllbnRIZWlnaHQ7XG5cdFx0XHRcdFx0Y29uc3Qgc2Nyb2xsYWJsZURpc3RhbmNlID0gc2Nyb2xsSGVpZ2h0IC0gY2xpZW50SGVpZ2h0O1xuXG5cdFx0XHRcdFx0aWYgKHNjcm9sbGFibGVEaXN0YW5jZSA+IDIpIHtcblx0XHRcdFx0XHRcdC8vIERvY3VtZW50IGlzIHNjcm9sbGFibGVcblx0XHRcdFx0XHRcdGlmIChldmVudC5kZWx0YVkgPCAwICYmIHNjcm9sbFRvcCA+IDApIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGV2ZW50LmRlbHRhWSA+IDAgJiYgc2Nyb2xsVG9wIDwgc2Nyb2xsYWJsZURpc3RhbmNlIC0gMikge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3doZWVsJywgKGV2ZW50KSA9PiB7XG5cdFx0XHRcdFx0aWYgKGV2ZW50LmRlZmF1bHRQcmV2ZW50ZWQgfHwgIXNob3VsZEJ1YmJsZVNjcm9sbChldmVudCkpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YXBpLnBvc3RNZXNzYWdlKHtcblx0XHRcdFx0XHRcdG1ldGhvZDogJ3VpL25vdGlmaWNhdGlvbnMvc2FuZGJveC13aGVlbCcsXG5cdFx0XHRcdFx0XHRwYXJhbXM6IHtcblx0XHRcdFx0XHRcdFx0ZGVsdGFNb2RlOiBldmVudC5kZWx0YU1vZGUsXG5cdFx0XHRcdFx0XHRcdGRlbHRhWDogZXZlbnQuZGVsdGFYLFxuXHRcdFx0XHRcdFx0XHRkZWx0YVk6IGV2ZW50LmRlbHRhWSxcblx0XHRcdFx0XHRcdFx0ZGVsdGFaOiBldmVudC5kZWx0YVosXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0sIHsgcGFzc2l2ZTogdHJ1ZSB9KTtcblx0XHRcdH0pKCk7PC9zY3JpcHQ+XG5cdFx0YDtcblxuXHRcdHJldHVybiB0aGlzLl9wcmVwZW5kVG9IZWFkKGh0bWwsIGNzcFRhZyArIHBvc3RNZXNzYWdlUmVob2lzdCk7XG5cdH1cblxuXHRwcml2YXRlIF9wcmVwZW5kVG9IZWFkKGh0bWw6IHN0cmluZywgY29udGVudDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHQvLyBUcnkgdG8gaW5qZWN0IGludG8gPGhlYWQ+XG5cdFx0Y29uc3QgaGVhZE1hdGNoID0gaHRtbC5tYXRjaCgvPGhlYWRbXj5dKj4vaSk7XG5cdFx0aWYgKGhlYWRNYXRjaCkge1xuXHRcdFx0Y29uc3QgaW5zZXJ0SW5kZXggPSBoZWFkTWF0Y2guaW5kZXghICsgaGVhZE1hdGNoWzBdLmxlbmd0aDtcblx0XHRcdHJldHVybiBodG1sLnNsaWNlKDAsIGluc2VydEluZGV4KSArICdcXG4nICsgY29udGVudCArIGh0bWwuc2xpY2UoaW5zZXJ0SW5kZXgpO1xuXHRcdH1cblxuXHRcdC8vIElmIG5vIDxoZWFkPiwgdHJ5IHRvIGluamVjdCBhZnRlciA8aHRtbD5cblx0XHRjb25zdCBodG1sTWF0Y2ggPSBodG1sLm1hdGNoKC88aHRtbFtePl0qPi9pKTtcblx0XHRpZiAoaHRtbE1hdGNoKSB7XG5cdFx0XHRjb25zdCBpbnNlcnRJbmRleCA9IGh0bWxNYXRjaC5pbmRleCEgKyBodG1sTWF0Y2hbMF0ubGVuZ3RoO1xuXHRcdFx0cmV0dXJuIGh0bWwuc2xpY2UoMCwgaW5zZXJ0SW5kZXgpICsgJ1xcbjxoZWFkPicgKyBjb250ZW50ICsgJzwvaGVhZD4nICsgaHRtbC5zbGljZShpbnNlcnRJbmRleCk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgbm8gPGh0bWw+LCBwcmVwZW5kXG5cdFx0cmV0dXJuIGA8IURPQ1RZUEUgaHRtbD48aHRtbD48aGVhZD4ke2NvbnRlbnR9PC9oZWFkPjxib2R5PiR7aHRtbH08L2JvZHk+PC9odG1sPmA7XG5cdH1cblxuXHQvKipcblx0ICogSGFuZGxlcyBpbmNvbWluZyBKU09OLVJQQyBtZXNzYWdlcyBmcm9tIHRoZSB3ZWJ2aWV3LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlV2Vidmlld01lc3NhZ2UobWVzc2FnZTogTWNwQXBwcy5BcHBNZXNzYWdlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IG1lc3NhZ2U7XG5cdFx0Y29uc3QgdG9rZW4gPSB0aGlzLl9kaXNwb3NlQ3RzLnRva2VuO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGxldCByZXN1bHQ6IE1jcEFwcHMuSG9zdFJlc3VsdCA9IHt9O1xuXG5cdFx0XHRzd2l0Y2ggKHJlcXVlc3QubWV0aG9kKSB7XG5cdFx0XHRcdGNhc2UgJ3VpL2luaXRpYWxpemUnOlxuXHRcdFx0XHRcdHJlc3VsdCA9IGF3YWl0IHRoaXMuX2hhbmRsZUluaXRpYWxpemUocmVxdWVzdC5wYXJhbXMpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ3Rvb2xzL2NhbGwnOlxuXHRcdFx0XHRcdHJlc3VsdCA9IGF3YWl0IHRoaXMuX2hhbmRsZVRvb2xzQ2FsbChyZXF1ZXN0LnBhcmFtcywgdG9rZW4pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ3Jlc291cmNlcy9yZWFkJzpcblx0XHRcdFx0XHRyZXN1bHQgPSBhd2FpdCB0aGlzLl9oYW5kbGVSZXNvdXJjZXNSZWFkKHJlcXVlc3QucGFyYW1zLCB0b2tlbik7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAnc2FtcGxpbmcvY3JlYXRlTWVzc2FnZSc6XG5cdFx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5faGFuZGxlU2FtcGxpbmdDcmVhdGVNZXNzYWdlKHJlcXVlc3QucGFyYW1zLCB0b2tlbik7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAncGluZyc6XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAndWkvbm90aWZpY2F0aW9ucy9zaXplLWNoYW5nZWQnOlxuXHRcdFx0XHRcdHRoaXMuX2hhbmRsZVNpemVDaGFuZ2VkKHJlcXVlc3QucGFyYW1zKTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICd1aS9vcGVuLWxpbmsnOlxuXHRcdFx0XHRcdHJlc3VsdCA9IGF3YWl0IHRoaXMuX2hhbmRsZU9wZW5MaW5rKHJlcXVlc3QucGFyYW1zKTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICd1aS9kb3dubG9hZC1maWxlJzpcblx0XHRcdFx0XHRyZXN1bHQgPSBhd2FpdCB0aGlzLl9oYW5kbGVEb3dubG9hZEZpbGUocmVxdWVzdC5wYXJhbXMpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ3VpL3JlcXVlc3QtZGlzcGxheS1tb2RlJzpcblx0XHRcdFx0XHQvLyBWUyBDb2RlIG9ubHkgc3VwcG9ydHMgaW5saW5lIGRpc3BsYXkgbW9kZVxuXHRcdFx0XHRcdHJlc3VsdCA9IHsgbW9kZTogJ2lubGluZScgfSBzYXRpc2ZpZXMgTWNwQXBwcy5NY3BVaVJlcXVlc3REaXNwbGF5TW9kZVJlc3VsdDtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICd1aS9ub3RpZmljYXRpb25zL2luaXRpYWxpemVkJzpcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICd1aS9tZXNzYWdlJzpcblx0XHRcdFx0XHRyZXN1bHQgPSBhd2FpdCB0aGlzLl9oYW5kbGVVaU1lc3NhZ2UocmVxdWVzdC5wYXJhbXMpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ3VpL3VwZGF0ZS1tb2RlbC1jb250ZXh0Jzpcblx0XHRcdFx0XHRyZXN1bHQgPSBhd2FpdCB0aGlzLl9oYW5kbGVVcGRhdGVNb2RlbENvbnRleHQocmVxdWVzdC5wYXJhbXMpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ25vdGlmaWNhdGlvbnMvbWVzc2FnZSc6XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fbWNwVG9vbENhbGxVSS5sb2cocmVxdWVzdC5wYXJhbXMpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgJ3VpL25vdGlmaWNhdGlvbnMvc2FuZGJveC13aGVlbCc6XG5cdFx0XHRcdFx0dGhpcy5faGFuZGxlU2FuZGJveFdoZWVsKHJlcXVlc3QucGFyYW1zKTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdFx0c29mdEFzc2VydE5ldmVyKHJlcXVlc3QpO1xuXHRcdFx0XHRcdGNvbnN0IGNhc3QgPSByZXF1ZXN0IGFzIE1DUC5KU09OUlBDUmVxdWVzdDtcblx0XHRcdFx0XHRpZiAoY2FzdC5pZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9zZW5kRXJyb3IoY2FzdC5pZCwgLTMyNjAxLCBgTWV0aG9kIG5vdCBmb3VuZDogJHtjYXN0Lm1ldGhvZH1gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNlbmQgcmVzcG9uc2UgaWYgdGhpcyB3YXMgYSByZXF1ZXN0IChoYXMgaWQpXG5cdFx0XHRpZiAoaGFzS2V5KHJlcXVlc3QsIHsgaWQ6IHRydWUgfSkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fc2VuZFJlc3BvbnNlKHJlcXVlc3QuaWQsIHJlc3VsdCk7XG5cdFx0XHR9XG5cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW01DUCBBcHBdIEVycm9yIGhhbmRsaW5nICR7cmVxdWVzdC5tZXRob2R9OmAsIGVycm9yKTtcblx0XHRcdGlmIChoYXNLZXkocmVxdWVzdCwgeyBpZDogdHJ1ZSB9KSkge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9zZW5kRXJyb3IocmVxdWVzdC5pZCwgLTMyMDAwLCBtZXNzYWdlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogSGFuZGxlcyB0aGUgdWkvaW5pdGlhbGl6ZSByZXF1ZXN0IGZyb20gdGhlIE1DUCBBcHAgVmlldy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZUluaXRpYWxpemUoX3BhcmFtczogTWNwQXBwcy5NY3BVaUluaXRpYWxpemVSZXF1ZXN0WydwYXJhbXMnXSk6IFByb21pc2U8TWNwQXBwcy5NY3BVaUluaXRpYWxpemVSZXN1bHQ+IHtcblx0XHR0aGlzLl9hbm5vdW5jZWRDYXBhYmlsaXRpZXMgPSB0cnVlO1xuXG5cdFx0Ly8gXCJIb3N0IE1VU1Qgc2VuZCB0aGlzIG5vdGlmaWNhdGlvbiB3aXRoIHRoZSBjb21wbGV0ZSB0b29sIGFyZ3VtZW50cyBhZnRlciB0aGUgR3Vlc3QgVUkncyBpbml0aWFsaXplIHJlcXVlc3QgY29tcGxldGVzXCJcblx0XHQvLyBDYXN0IHRvIGBhbnlgIGR1ZSB0byBodHRwczovL2dpdGh1Yi5jb20vbW9kZWxjb250ZXh0cHJvdG9jb2wvZXh0LWFwcHMvaXNzdWVzLzE5N1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0bGV0IGFyZ3M6IGFueTtcblx0XHR0cnkge1xuXHRcdFx0YXJncyA9IEpTT04ucGFyc2UodGhpcy5yZW5kZXJEYXRhLmlucHV0KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdGFyZ3MgPSB0aGlzLnJlbmRlckRhdGEuaW5wdXQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGltZW91dCA9IHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGVUaW1lb3V0KGFzeW5jICgpID0+IHtcblx0XHRcdHRoaXMuX3N0b3JlLmRlbGV0ZSh0aW1lb3V0KTtcblx0XHRcdGF3YWl0IHRoaXMuX3NlbmROb3RpZmljYXRpb24oe1xuXHRcdFx0XHRtZXRob2Q6ICd1aS9ub3RpZmljYXRpb25zL3Rvb2wtaW5wdXQnLFxuXHRcdFx0XHRwYXJhbXM6IHsgYXJndW1lbnRzOiBhcmdzIH1cblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAodGhpcy50b29sSW52b2NhdGlvbi5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJykge1xuXHRcdFx0XHR0aGlzLl9zZW5kVG9vbFJlc3VsdCh0aGlzLnRvb2xJbnZvY2F0aW9uLnJlc3VsdERldGFpbHMpO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLnRvb2xJbnZvY2F0aW9uLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicpIHtcblx0XHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRoaXMudG9vbEludm9jYXRpb247XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW5TZWxmRGlzcG9zYWJsZShyZWFkZXIgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHN0YXRlID0gaW52b2NhdGlvbi5zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0aWYgKHN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNvbXBsZXRlZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fc2VuZFRvb2xSZXN1bHQoc3RhdGUucmVzdWx0RGV0YWlscyk7XG5cdFx0XHRcdFx0XHRyZWFkZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRwcm90b2NvbFZlcnNpb246IE1jcEFwcHMuTEFURVNUX1BST1RPQ09MX1ZFUlNJT04sXG5cdFx0XHRob3N0SW5mbzoge1xuXHRcdFx0XHRuYW1lOiB0aGlzLl9wcm9kdWN0U2VydmljZS5uYW1lTG9uZyxcblx0XHRcdFx0dmVyc2lvbjogdGhpcy5fcHJvZHVjdFNlcnZpY2UudmVyc2lvbixcblx0XHRcdH0sXG5cdFx0XHRob3N0Q2FwYWJpbGl0aWVzOiB7XG5cdFx0XHRcdG9wZW5MaW5rczoge30sXG5cdFx0XHRcdHNlcnZlclRvb2xzOiB7IGxpc3RDaGFuZ2VkOiB0cnVlIH0sXG5cdFx0XHRcdHNlcnZlclJlc291cmNlczogeyBsaXN0Q2hhbmdlZDogdHJ1ZSB9LFxuXHRcdFx0XHRsb2dnaW5nOiB7fSxcblx0XHRcdFx0c2FuZGJveDoge1xuXHRcdFx0XHRcdGNzcDogdGhpcy5fbGF0ZXN0Q3NwLFxuXHRcdFx0XHRcdHBlcm1pc3Npb25zOiB7IGNsaXBib2FyZFdyaXRlOiB7fSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR1cGRhdGVNb2RlbENvbnRleHQ6IHtcblx0XHRcdFx0XHRhdWRpbzoge30sXG5cdFx0XHRcdFx0aW1hZ2U6IHt9LFxuXHRcdFx0XHRcdHJlc291cmNlTGluazoge30sXG5cdFx0XHRcdFx0cmVzb3VyY2U6IHt9LFxuXHRcdFx0XHRcdHN0cnVjdHVyZWRDb250ZW50OiB7fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZG93bmxvYWRGaWxlOiB7fSxcblx0XHRcdH0sXG5cdFx0XHRob3N0Q29udGV4dDogdGhpcy5ob3N0Q29udGV4dC5nZXQoKSxcblx0XHR9IHNhdGlzZmllcyBSZXF1aXJlZDxNY3BBcHBzLk1jcFVpSW5pdGlhbGl6ZVJlc3VsdD47XG5cdH1cblxuXHQvKipcblx0ICogU2VuZHMgdGhlIHRvb2wgcmVzdWx0IG5vdGlmaWNhdGlvbiB3aGVuIHRoZSByZXN1bHQgYmVjb21lcyBhdmFpbGFibGUuXG5cdCAqL1xuXHQvKipcblx0ICogUmV0dXJucyBhIHN0YWJsZSBpZGVudGlmaWVyIGZvciB0aGUgb3JpZ2luYXRpbmcgTUNQIHNlcnZlciB0byB1c2Vcblx0ICogYXMgdGhlIHdlYnZpZXcgb3JpZ2luIGtleS4gTG9jYWwgc2VydmVycyB1c2UgdGhlaXIgZGVmaW5pdGlvbiBpZCxcblx0ICogYWdlbnQtaG9zdCBzZXJ2ZXJzIHVzZSB0aGUgcGVyLXNlc3Npb24gYHNlcnZlcklkYC5cblx0ICovXG5cdHByaXZhdGUgX3NlcnZlck9yaWdpbklkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMucmVuZGVyRGF0YS5raW5kID09PSAnYWdlbnRIb3N0J1xuXHRcdFx0PyB0aGlzLnJlbmRlckRhdGEuc2VydmVySWRcblx0XHRcdDogdGhpcy5yZW5kZXJEYXRhLnNlcnZlckRlZmluaXRpb25JZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBQaWNrcyBhIHN0YWJsZSB3ZWJ2aWV3IG9yaWdpbiBmb3IgdGhpcyBzZXJ2ZXIuIExvY2FsIE1DUCBzZXJ2ZXJzXG5cdCAqIGdldCBhIHBlcnNpc3RlZCBvcmlnaW4gdmlhIHtAbGluayBXZWJ2aWV3T3JpZ2luU3RvcmV9IHNpbmNlIHRoZWlyXG5cdCAqIHNlcnZlci1kZWZpbml0aW9uIGlkIGlzIHN0YWJsZSBhY3Jvc3MgVlMgQ29kZSByZXN0YXJ0cy4gQWdlbnQtaG9zdFxuXHQgKiBzZXJ2ZXJzIGZhbGwgYmFjayB0byB0aGUgc3RhdGljIGluLW1lbW9yeSB7QGxpbmsgX2FnZW50SG9zdE9yaWdpbnN9XG5cdCAqIG1hcCBrZXllZCBieSBgc2VydmVySWRgLCBzbyBvcmlnaW5zIGFyZSBzdGFibGUgd2l0aGluIHRoZSBhcHBcblx0ICogbGlmZXRpbWUgd2l0aG91dCBsZWFraW5nIGVudHJpZXMgaW50byBhcHBsaWNhdGlvbiBzdG9yYWdlIGZvclxuXHQgKiBldmVyeSBzZXNzaW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfY29tcHV0ZVdlYnZpZXdPcmlnaW4oKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5yZW5kZXJEYXRhLmtpbmQgIT09ICdhZ2VudEhvc3QnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fb3JpZ2luU3RvcmUuZ2V0T3JpZ2luKCdtY3BBcHAnLCB0aGlzLl9zZXJ2ZXJPcmlnaW5JZCgpKTtcblx0XHR9XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5fc2VydmVyT3JpZ2luSWQoKTtcblx0XHRsZXQgb3JpZ2luID0gQ2hhdE1jcEFwcE1vZGVsLl9hZ2VudEhvc3RPcmlnaW5zLmdldChrZXkpO1xuXHRcdGlmICghb3JpZ2luKSB7XG5cdFx0XHRvcmlnaW4gPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRcdENoYXRNY3BBcHBNb2RlbC5fYWdlbnRIb3N0T3JpZ2lucy5zZXQoa2V5LCBvcmlnaW4pO1xuXHRcdH1cblx0XHRyZXR1cm4gb3JpZ2luO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIGEgc2VydmVyLXJlbGF0aXZlIHJlc291cmNlIFVSSSBpbnRvIGEgd29ya2JlbmNoIFVSSS5cblx0ICogLSBMb2NhbCBzZXJ2ZXJzOiB3cmFwIGluIHtAbGluayBNY3BSZXNvdXJjZVVSSS5mcm9tU2VydmVyfSBzbyBpdFxuXHQgKiAgIHJlc29sdmVzIHRocm91Z2ggdGhlIE1DUCBmaWxlc3lzdGVtIHByb3ZpZGVyLlxuXHQgKiAtIEFnZW50LWhvc3Qgc2VydmVyczogcGFzcyB0aHJvdWdoIGFzIGEgcGxhaW4ge0BsaW5rIFVSSX0uIFRoZXJlJ3Ncblx0ICogICBubyBob3N0LXNpZGUgcmVzb2x2ZXIgZm9yIEFIUC1iYWNrZWQgc2VydmVycyBpbiB2MSwgc28gdGhlc2Vcblx0ICogICBVUklzIG1heSBub3QgYmUgb3BlbmFibGUsIGJ1dCB0aGV5IHByZXNlcnZlIHRoZSBvcmlnaW5hbFxuXHQgKiAgIHJlc291cmNlIHJlZmVyZW5jZSBmb3IgdGhlIHVzZXIuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXNvbHZlU2VydmVyUmVzb3VyY2VVcmkoc2VydmVyVXJpOiBzdHJpbmcpOiBVUkkge1xuXHRcdGlmICh0aGlzLnJlbmRlckRhdGEua2luZCA9PT0gJ2FnZW50SG9zdCcpIHtcblx0XHRcdHJldHVybiBVUkkucGFyc2Uoc2VydmVyVXJpKTtcblx0XHR9XG5cdFx0cmV0dXJuIE1jcFJlc291cmNlVVJJLmZyb21TZXJ2ZXIoeyBpZDogdGhpcy5yZW5kZXJEYXRhLnNlcnZlckRlZmluaXRpb25JZCwgbGFiZWw6ICcnIH0sIHNlcnZlclVyaSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZW5kVG9vbFJlc3VsdChyZXN1bHREZXRhaWxzOiBJVG9vbFJlc3VsdFsndG9vbFJlc3VsdERldGFpbHMnXSB8IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkWydyZXN1bHREZXRhaWxzJ10pOiB2b2lkIHtcblx0XHRpZiAoaXNUb29sUmVzdWx0SW5wdXRPdXRwdXREZXRhaWxzKHJlc3VsdERldGFpbHMpICYmIHJlc3VsdERldGFpbHMubWNwT3V0cHV0KSB7XG5cdFx0XHR0aGlzLl9zZW5kTm90aWZpY2F0aW9uKHtcblx0XHRcdFx0bWV0aG9kOiAndWkvbm90aWZpY2F0aW9ucy90b29sLXJlc3VsdCcsXG5cdFx0XHRcdHBhcmFtczogcmVzdWx0RGV0YWlscy5tY3BPdXRwdXQgYXMgTUNQLkNhbGxUb29sUmVzdWx0LFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlVWlNZXNzYWdlKHBhcmFtczogTWNwQXBwcy5NY3BVaU1lc3NhZ2VSZXF1ZXN0WydwYXJhbXMnXSk6IFByb21pc2U8TWNwQXBwcy5NY3BVaU1lc3NhZ2VSZXN1bHQ+IHtcblx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLl9jaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZSh0aGlzLnJlbmRlckRhdGEuc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0cmV0dXJuIHsgaXNFcnJvcjogdHJ1ZSB9O1xuXHRcdH1cblxuXHRcdGlmICghaXNGYWxzeU9yV2hpdGVzcGFjZSh3aWRnZXQuZ2V0SW5wdXQoKSkpIHtcblx0XHRcdHJldHVybiB7IGlzRXJyb3I6IHRydWUgfTtcblx0XHR9XG5cblx0XHR3aWRnZXQuc2V0SW5wdXQocGFyYW1zLmNvbnRlbnQuZmlsdGVyKGMgPT4gYy50eXBlID09PSAndGV4dCcpLm1hcChjID0+IGMudGV4dCkuam9pbignXFxuXFxuJykpO1xuXHRcdHdpZGdldC5hdHRhY2htZW50TW9kZWwuY2xlYXJBbmRTZXRDb250ZXh0KC4uLnBhcmFtcy5jb250ZW50Lm1hcCgoYywgaSk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0Y29uc3QgaWQgPSBgbWNwdWktJHtpfS0ke0RhdGUubm93KCl9YDtcblx0XHRcdGlmIChjLnR5cGUgPT09ICdpbWFnZScpIHtcblx0XHRcdFx0cmV0dXJuIHsga2luZDogJ2ltYWdlJywgdmFsdWU6IGRlY29kZUJhc2U2NChjLmRhdGEpLmJ1ZmZlciwgaWQsIG5hbWU6ICdJbWFnZScgfTtcblx0XHRcdH0gZWxzZSBpZiAoYy50eXBlID09PSAncmVzb3VyY2VfbGluaycpIHtcblx0XHRcdFx0Y29uc3QgdXJpID0gdGhpcy5fcmVzb2x2ZVNlcnZlclJlc291cmNlVXJpKGMudXJpKTtcblx0XHRcdFx0cmV0dXJuIHsga2luZDogJ2ZpbGUnLCB2YWx1ZTogdXJpLCBpZCwgbmFtZTogYmFzZW5hbWUodXJpKSB9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KS5maWx0ZXIoaXNEZWZpbmVkKSk7XG5cdFx0d2lkZ2V0LmZvY3VzSW5wdXQoKTtcblxuXHRcdHJldHVybiB7IGlzRXJyb3I6IGZhbHNlIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVVcGRhdGVNb2RlbENvbnRleHQocGFyYW1zOiBNY3BBcHBzLk1jcFVpVXBkYXRlTW9kZWxDb250ZXh0UmVxdWVzdFsncGFyYW1zJ10pOiBQcm9taXNlPE1DUC5FbXB0eVJlc3VsdD4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKHRoaXMucmVuZGVyRGF0YS5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXG5cdFx0Y29uc3QgaWRQcmVmaXggPSBgbWNwdWktY29udGV4dC0ke2hhc2godGhpcy5fc2VydmVyT3JpZ2luSWQoKSl9LWA7XG5cdFx0Y29uc3QgdG9EZWxldGUgPSB3aWRnZXQuYXR0YWNobWVudE1vZGVsLmdldEF0dGFjaG1lbnRJRHMoKTtcblx0XHRjb25zdCBpZHNUb0RlbGV0ZSA9IEFycmF5LmZyb20odG9EZWxldGUpLmZpbHRlcihpZCA9PiBpZC5zdGFydHNXaXRoKGlkUHJlZml4KSk7XG5cdFx0Y29uc3QgZW50cmllczogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdID0gW107XG5cdFx0bGV0IGVudHJ5SW5kZXggPSAwO1xuXG5cdFx0aWYgKHBhcmFtcy5jb250ZW50KSB7XG5cdFx0XHRmb3IgKGNvbnN0IGJsb2NrIG9mIHBhcmFtcy5jb250ZW50KSB7XG5cdFx0XHRcdGNvbnN0IGlkID0gYCR7aWRQcmVmaXh9JHtlbnRyeUluZGV4Kyt9YDtcblx0XHRcdFx0aWYgKGJsb2NrLnR5cGUgPT09ICdpbWFnZScpIHtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goe1xuXHRcdFx0XHRcdFx0a2luZDogJ2ltYWdlJyxcblx0XHRcdFx0XHRcdHZhbHVlOiBkZWNvZGVCYXNlNjQoYmxvY2suZGF0YSkuYnVmZmVyLFxuXHRcdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0XHRuYW1lOiAnSW1hZ2UnLFxuXHRcdFx0XHRcdFx0bWltZVR5cGU6IGJsb2NrLm1pbWVUeXBlLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGJsb2NrLnR5cGUgPT09ICdyZXNvdXJjZV9saW5rJykge1xuXHRcdFx0XHRcdGNvbnN0IHVyaSA9IHRoaXMuX3Jlc29sdmVTZXJ2ZXJSZXNvdXJjZVVyaShibG9jay51cmkpO1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRraW5kOiAnZmlsZScsXG5cdFx0XHRcdFx0XHR2YWx1ZTogdXJpLFxuXHRcdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0XHRuYW1lOiBiYXNlbmFtZSh1cmkpLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGJsb2NrLnR5cGUgPT09ICd0ZXh0Jykge1xuXHRcdFx0XHRcdGNvbnN0IHByZXZpZXcgPSBibG9jay50ZXh0LnJlcGxhY2VBbGwoL1xccysvZywgJyAnKS50cmltKCk7XG5cdFx0XHRcdFx0Y29uc3QgdHJ1bmNhdGVUbyA9IDIwO1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRraW5kOiAnZ2VuZXJpYycsXG5cdFx0XHRcdFx0XHR2YWx1ZTogYmxvY2sudGV4dCxcblx0XHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdFx0dG9vbHRpcDogbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kQ29kZWJsb2NrKCdwbGFpbnRleHQnLCBibG9jay50ZXh0KSxcblx0XHRcdFx0XHRcdG5hbWU6IHByZXZpZXcubGVuZ3RoID4gdHJ1bmNhdGVUbyA/IHByZXZpZXcuc2xpY2UoMCwgdHJ1bmNhdGVUbykgKyAnXHUyMDI2JyA6IHByZXZpZXcsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAocGFyYW1zLnN0cnVjdHVyZWRDb250ZW50ICYmIE9iamVjdC5rZXlzKHBhcmFtcy5zdHJ1Y3R1cmVkQ29udGVudCkubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgaWQgPSBgJHtpZFByZWZpeH1zdHJ1Y3R1cmVkYDtcblx0XHRcdGNvbnN0IHZhbHVlID0gSlNPTi5zdHJpbmdpZnkocGFyYW1zLnN0cnVjdHVyZWRDb250ZW50LCBudWxsLCAyKTtcblx0XHRcdGVudHJpZXMucHVzaCh7XG5cdFx0XHRcdGtpbmQ6ICdnZW5lcmljJyxcblx0XHRcdFx0dmFsdWUsXG5cdFx0XHRcdHRvb2x0aXA6IG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZENvZGVibG9jaygnanNvbicsIHZhbHVlKSxcblx0XHRcdFx0aWQsXG5cdFx0XHRcdG5hbWU6ICdVSSBEYXRhJyxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHdpZGdldC5hdHRhY2htZW50TW9kZWwudXBkYXRlQ29udGV4dChpZHNUb0RlbGV0ZSwgZW50cmllcyk7XG5cblx0XHRyZXR1cm4ge307XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVTaXplQ2hhbmdlZChwYXJhbXM6IE1jcEFwcHMuTWNwVWlTaXplQ2hhbmdlZE5vdGlmaWNhdGlvblsncGFyYW1zJ10pOiB2b2lkIHtcblx0XHRpZiAocGFyYW1zLmhlaWdodCAhPT0gdW5kZWZpbmVkICYmIHBhcmFtcy5oZWlnaHQgIT09IHRoaXMuX2hlaWdodCkge1xuXHRcdFx0dGhpcy5faGVpZ2h0ID0gcGFyYW1zLmhlaWdodDtcblx0XHRcdENoYXRNY3BBcHBNb2RlbC5oZWlnaHRDYWNoZS5zZXQodGhpcy50b29sSW52b2NhdGlvbiwgcGFyYW1zLmhlaWdodCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlU2FuZGJveFdoZWVsKHBhcmFtczogTWNwQXBwcy5DdXN0b21TYW5kYm94V2hlZWxOb3RpZmljYXRpb25bJ3BhcmFtcyddKTogdm9pZCB7XG5cdFx0bGV0IGRlZmF1bHRQcmV2ZW50ZWQgPSBmYWxzZTtcblx0XHRjb25zdCBldnQ6IFBhcnRpYWw8SU1vdXNlV2hlZWxFdmVudD4gPSB7XG5cdFx0XHR3aGVlbERlbHRhWDogcGFyYW1zLmRlbHRhWCxcblx0XHRcdHdoZWVsRGVsdGFZOiAtcGFyYW1zLmRlbHRhWSxcblx0XHRcdHdoZWVsRGVsdGE6IE1hdGguYWJzKHBhcmFtcy5kZWx0YVkpLFxuXG5cdFx0XHRkZWx0YVg6IHBhcmFtcy5kZWx0YVgsXG5cdFx0XHRkZWx0YVk6IC1wYXJhbXMuZGVsdGFZLFxuXHRcdFx0ZGVsdGFaOiBwYXJhbXMuZGVsdGFaLFxuXHRcdFx0ZGVsdGFNb2RlOiBwYXJhbXMuZGVsdGFNb2RlLFxuXHRcdFx0cHJldmVudERlZmF1bHQ6ICgpID0+IHtcblx0XHRcdFx0ZGVmYXVsdFByZXZlbnRlZCA9IHRydWU7XG5cdFx0XHR9LFxuXHRcdFx0c3RvcFByb3BhZ2F0aW9uOiAoKSA9PiB7IH0sXG5cdFx0XHRnZXQgZGVmYXVsdFByZXZlbnRlZCgpIHtcblx0XHRcdFx0cmV0dXJuIGRlZmF1bHRQcmV2ZW50ZWQ7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKHRoaXMucmVuZGVyRGF0YS5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHdpZGdldD8uZGVsZWdhdGVTY3JvbGxGcm9tTW91c2VXaGVlbEV2ZW50KGV2dCBhcyBJTW91c2VXaGVlbEV2ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZURvd25sb2FkRmlsZShwYXJhbXM6IE1jcEFwcHMuTWNwVWlEb3dubG9hZEZpbGVSZXF1ZXN0WydwYXJhbXMnXSk6IFByb21pc2U8TWNwQXBwcy5NY3BVaURvd25sb2FkRmlsZVJlc3VsdD4ge1xuXHRcdGNvbnN0IG5ld1BhcnRzOiBJQ2hhdENvbGxhcHNpYmxlSU9EYXRhUGFydFtdID0gW107XG5cdFx0bGV0IGhhZEVycm9yID0gZmFsc2U7XG5cblx0XHRmb3IgKGNvbnN0IGNvbnRlbnQgb2YgcGFyYW1zLmNvbnRlbnRzKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAoY29udGVudC50eXBlID09PSAncmVzb3VyY2UnKSB7XG5cdFx0XHRcdFx0Ly8gRW1iZWRkZWRSZXNvdXJjZSBcdTIwMTQgYXNzb2NpYXRlIGlubGluZSBjb250ZW50IHdpdGggdGhlIGNoYXQgcmVzcG9uc2UgRlNcblx0XHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IGNvbnRlbnQucmVzb3VyY2U7XG5cdFx0XHRcdFx0Y29uc3QgcGFyc2VkID0gVVJJLnBhcnNlKHJlc291cmNlLnVyaSk7XG5cblx0XHRcdFx0XHRjb25zdCBkYXRhOiBVaW50OEFycmF5IHwgeyBiYXNlNjQ6IHN0cmluZyB9ID0gaGFzS2V5KHJlc291cmNlLCB7IHRleHQ6IHRydWUgfSlcblx0XHRcdFx0XHRcdD8gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKHJlc291cmNlLnRleHQpXG5cdFx0XHRcdFx0XHQ6IHsgYmFzZTY0OiByZXNvdXJjZS5ibG9iIH07XG5cblx0XHRcdFx0XHRjb25zdCB7IHJlc291cmNlOiB1cmkgfSA9IHRoaXMuX2NoYXRSZXNwb25zZVJlc291cmNlRnNQcm92aWRlci5hc3NvY2lhdGUoZGF0YSwgeyBzZXNzaW9uUmVzb3VyY2U6IHRoaXMucmVuZGVyRGF0YS5zZXNzaW9uUmVzb3VyY2UsIG5hbWU6IGJhc2VuYW1lKHBhcnNlZCkgfSk7XG5cdFx0XHRcdFx0bmV3UGFydHMucHVzaCh7IGtpbmQ6ICdkYXRhJywgbWltZVR5cGU6IHJlc291cmNlLm1pbWVUeXBlLCB1cmkgfSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoY29udGVudC50eXBlID09PSAncmVzb3VyY2VfbGluaycpIHtcblx0XHRcdFx0XHQvLyBSZXNvdXJjZUxpbmsgXHUyMDE0IGNyZWF0ZSBhIHBhcnQgd2l0aCBhbiBNQ1AgcmVzb3VyY2UgVVJJLCByZXNvbHZlZCBsYXppbHkgb24gc2F2ZVxuXHRcdFx0XHRcdGNvbnN0IG1jcFVyaSA9IHRoaXMuX3Jlc29sdmVTZXJ2ZXJSZXNvdXJjZVVyaShjb250ZW50LnVyaSk7XG5cdFx0XHRcdFx0bmV3UGFydHMucHVzaCh7IGtpbmQ6ICdkYXRhJywgbWltZVR5cGU6IGNvbnRlbnQubWltZVR5cGUsIHVyaTogbWNwVXJpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRoYWRFcnJvciA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignW01DUCBBcHBdIEZhaWxlZCB0byBwcm9jZXNzIHVpL2Rvd25sb2FkLWZpbGUgY29udGVudCcsIGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobmV3UGFydHMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9kb3dubG9hZFBhcnRzLmdldCgpO1xuXHRcdFx0dGhpcy5fZG93bmxvYWRQYXJ0cy5zZXQoWy4uLmV4aXN0aW5nLCAuLi5uZXdQYXJ0c10sIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGhhZEVycm9yID8geyBpc0Vycm9yOiB0cnVlIH0gOiB7fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZU9wZW5MaW5rKHBhcmFtczogTWNwQXBwcy5NY3BVaU9wZW5MaW5rUmVxdWVzdFsncGFyYW1zJ10pOiBQcm9taXNlPE1jcEFwcHMuTWNwVWlPcGVuTGlua1Jlc3VsdD4ge1xuXHRcdC8vIFRoZSBNQ1AgQXBwcyBwcm90b2NvbCBzY29wZXMgdWkvb3Blbi1saW5rIHRvIFwib3BlbiBhbiBleHRlcm5hbCBVUkwgaW5cblx0XHQvLyB0aGUgaG9zdCdzIGRlZmF1bHQgYnJvd3NlclwiLiBSZXN0cmljdCB0byBodHRwL2h0dHBzIHNvIGd1ZXN0IGNvbnRlbnRcblx0XHQvLyBjYW5ub3QgcmVhY2ggaW50ZXJuYWwgcHJvZHVjdC1zY2hlbWUgVVJMIGhhbmRsZXJzIChlLmcuIGZvcmdpbmcgYW5cblx0XHQvLyBhdXRoIGNhbGxiYWNrKSB0aHJvdWdoIHRoaXMgY2FwYWJpbGl0eS5cblx0XHRsZXQgcGFyc2VkOiBVUkk7XG5cdFx0dHJ5IHtcblx0XHRcdHBhcnNlZCA9IFVSSS5wYXJzZShwYXJhbXMudXJsLCB0cnVlKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW01DUCBBcHBdIFJlamVjdGVkIHVpL29wZW4tbGluayB3aXRoIHVucGFyc2VhYmxlIFVSTGApO1xuXHRcdFx0cmV0dXJuIHsgaXNFcnJvcjogdHJ1ZSB9O1xuXHRcdH1cblx0XHRpZiAocGFyc2VkLnNjaGVtZSAhPT0gJ2h0dHAnICYmIHBhcnNlZC5zY2hlbWUgIT09ICdodHRwcycpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW01DUCBBcHBdIFJlamVjdGVkIHVpL29wZW4tbGluayB3aXRoIG5vbi1odHRwKHMpIHNjaGVtZTogJHtwYXJzZWQuc2NoZW1lfWApO1xuXHRcdFx0cmV0dXJuIHsgaXNFcnJvcjogdHJ1ZSB9O1xuXHRcdH1cblx0XHRjb25zdCBvayA9IGF3YWl0IHRoaXMuX29wZW5lclNlcnZpY2Uub3BlbihwYXJzZWQsIHsgb3BlbkV4dGVybmFsOiB0cnVlIH0pO1xuXHRcdHJldHVybiB7IGlzRXJyb3I6ICFvayB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZXMgdG9vbHMvY2FsbCByZXF1ZXN0cyBmcm9tIHRoZSBNQ1AgQXBwLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlVG9vbHNDYWxsKHBhcmFtczogTUNQLkNhbGxUb29sUmVxdWVzdFBhcmFtcywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxNQ1AuQ2FsbFRvb2xSZXN1bHQ+IHtcblx0XHRpZiAoIXBhcmFtcz8ubmFtZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIHRvb2wgbmFtZSBpbiB0b29scy9jYWxsIHJlcXVlc3QnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fbWNwVG9vbENhbGxVSS5jYWxsVG9vbChwYXJhbXMubmFtZSwgcGFyYW1zLmFyZ3VtZW50cyB8fCB7fSwgdG9rZW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZXMgcmVzb3VyY2VzL3JlYWQgcmVxdWVzdHMgZnJvbSB0aGUgTUNQIEFwcC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZVJlc291cmNlc1JlYWQocGFyYW1zOiBNQ1AuUmVhZFJlc291cmNlUmVxdWVzdFBhcmFtcywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxNQ1AuUmVhZFJlc291cmNlUmVzdWx0PiB7XG5cdFx0aWYgKCFwYXJhbXM/LnVyaSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIHVyaSBpbiByZXNvdXJjZXMvcmVhZCByZXF1ZXN0Jyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX21jcFRvb2xDYWxsVUkucmVhZFJlc291cmNlKHBhcmFtcy51cmksIHRva2VuKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kbGVzIHNhbXBsaW5nL2NyZWF0ZU1lc3NhZ2UgcmVxdWVzdHMgZnJvbSB0aGUgTUNQIEFwcC4gRm9yd2FyZGVkXG5cdCAqIHRvIHRoZSBob3N0LXNpZGUgc2FtcGxpbmcgaW1wbGVtZW50YXRpb24gdGhyb3VnaCB0aGUgdW5kZXJseWluZ1xuXHQgKiB0cmFuc3BvcnQgKHR5cGljYWxseSBhbiBhZ2VudCBob3N0IHRoYXQgb3ducyB0aGUgTUNQIHNlcnZlcikuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVTYW1wbGluZ0NyZWF0ZU1lc3NhZ2UocGFyYW1zOiBNQ1AuQ3JlYXRlTWVzc2FnZVJlcXVlc3RQYXJhbXMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8TUNQLkNyZWF0ZU1lc3NhZ2VSZXN1bHQ+IHtcblx0XHRpZiAoIXBhcmFtcykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIHBhcmFtcyBpbiBzYW1wbGluZy9jcmVhdGVNZXNzYWdlIHJlcXVlc3QnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21jcFRvb2xDYWxsVUkuc2FtcGxpbmcocGFyYW1zLCB0b2tlbik7XG5cdH1cblxuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRwcml2YXRlIGFzeW5jIF9zZW5kUmVzcG9uc2UoaWQ6IG51bWJlciB8IHN0cmluZywgcmVzdWx0OiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl93ZWJ2aWV3LnBvc3RNZXNzYWdlKHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0aWQsXG5cdFx0XHRyZXN1bHQsXG5cdFx0fSBzYXRpc2ZpZXMgTUNQLkpTT05SUENSZXNwb25zZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zZW5kRXJyb3IoaWQ6IG51bWJlciB8IHN0cmluZywgY29kZTogbnVtYmVyLCBtZXNzYWdlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl93ZWJ2aWV3LnBvc3RNZXNzYWdlKHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0aWQsXG5cdFx0XHRlcnJvcjogeyBjb2RlLCBtZXNzYWdlIH0sXG5cdFx0fSBzYXRpc2ZpZXMgTUNQLkpTT05SUENFcnJvclJlc3BvbnNlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NlbmROb3RpZmljYXRpb24obWVzc2FnZTogTWNwQXBwcy5Ib3N0Tm90aWZpY2F0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fd2Vidmlldy5wb3N0TWVzc2FnZSh7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdC4uLm1lc3NhZ2UsXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NlQ3RzLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUVyQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG9CQUFvQjtBQUM3QixTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVk7QUFDckIsU0FB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
