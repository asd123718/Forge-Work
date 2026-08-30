import { Queue, raceTimeout, TimeoutTimer } from "../../../base/common/async.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { createSingleCallFunction } from "../../../base/common/functional.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { localize } from "../../../nls.js";
import { convertAXTreeToMarkdown } from "./cdpAccessibilityDomain.js";
const _WebPageLoader = class _WebPageLoader extends Disposable {
  constructor(browserWindowFactory, _logger, _uri, _options, _isTrustedDomain, _agentNetworkFilterService) {
    super();
    this._logger = _logger;
    this._uri = _uri;
    this._options = _options;
    this._isTrustedDomain = _isTrustedDomain;
    this._agentNetworkFilterService = _agentNetworkFilterService;
    this._requests = /* @__PURE__ */ new Set();
    this._queue = this._register(new Queue());
    this._timeout = this._register(new TimeoutTimer());
    this._idleDebounceTimer = this._register(new TimeoutTimer());
    this._onResult = (_result) => {
    };
    this._didFinishLoad = false;
    this._receivedMarkdown = false;
    this._window = browserWindowFactory({
      width: 800,
      height: 600,
      show: false,
      webPreferences: {
        partition: generateUuid(),
        // do not share any state with the default renderer session
        javascript: true,
        offscreen: true,
        sandbox: true,
        webgl: false
      }
    });
    this._register(toDisposable(() => this._window.destroy()));
    this._window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    this._debugger = this._window.webContents.debugger;
    this._debugger.attach("1.1");
    this._debugger.on("message", this.onDebugMessage.bind(this));
    this._window.webContents.once("did-start-loading", this.onStartLoading.bind(this)).once("did-finish-load", this.onFinishLoad.bind(this)).once("did-fail-load", this.onFailLoad.bind(this)).on("will-frame-navigate", this.onFrameNavigate.bind(this)).on("will-navigate", this.onRedirect.bind(this)).on("will-redirect", this.onRedirect.bind(this)).on("select-client-certificate", (event) => event.preventDefault());
    this._window.webContents.session.webRequest.onBeforeRequest(
      this.onBeforeRequest.bind(this)
    );
    this._window.webContents.session.webRequest.onBeforeSendHeaders(
      this.onBeforeSendHeaders.bind(this)
    );
    this._window.webContents.session.webRequest.onHeadersReceived(
      this.onHeadersReceived.bind(this)
    );
    this._window.webContents.session.on("will-download", this.onDownload.bind(this));
  }
  trace(message) {
    this._logger.trace(`[WebPageLoader] [${this._uri}] ${message}`);
  }
  /**
   * Loads the web page and extracts its content.
   */
  async load() {
    return await new Promise((resolve) => {
      this._onResult = createSingleCallFunction((result) => {
        switch (result.status) {
          case "ok":
            this.trace(`Loaded web page content, status: ${result.status}, title: '${result.title}', length: ${result.result.length}`);
            break;
          case "redirect":
            this.trace(`Loaded web page content, status: ${result.status}, toURI: ${result.toURI}`);
            break;
          case "error":
            this.trace(`Loaded web page content, status: ${result.status}, code: ${result.statusCode}, error: '${result.error}', title: '${result.title}', length: ${result.result?.length ?? 0}`);
            break;
        }
        const content = result.status !== "redirect" ? result.result : void 0;
        if (content !== void 0) {
          this.trace(content.length < 200 ? `Extracted content: '${content}'` : `Extracted content preview: '${content.substring(0, 200)}...'`);
        }
        resolve(result);
        this.dispose();
      });
      this.trace(`Loading web page content`);
      void this._window.loadURL(this._uri.toString(true));
      this.setTimeout(_WebPageLoader.TIMEOUT);
    });
  }
  /**
   * Sets a timeout to trigger content extraction regardless of current loading state.
   */
  setTimeout(time) {
    if (this._store.isDisposed) {
      return;
    }
    this.trace(`Setting page load timeout to ${time} ms`);
    this._timeout.cancelAndSet(() => {
      this.trace(`Page load timeout reached`);
      void this._queue.queue(() => this.extractContent());
    }, time);
  }
  getUriPolicyError(url) {
    let uri;
    try {
      uri = URI.parse(url, true);
    } catch {
      return localize("webPageLoader.invalidUri", "Navigation to an invalid URI is not allowed.");
    }
    if (uri.scheme === Schemas.http || uri.scheme === Schemas.https || uri.scheme === "ws" || uri.scheme === "wss") {
      return this._agentNetworkFilterService.isUriAllowed(uri) ? void 0 : this._agentNetworkFilterService.formatError(uri);
    }
    if (uri.scheme === "about" && uri.path === "blank" || uri.scheme === Schemas.data || uri.scheme === "blob") {
      return void 0;
    }
    return localize("webPageLoader.unsupportedUriScheme", "Navigation to the '{0}' URI scheme is not allowed.", uri.scheme);
  }
  onBeforeRequest(details, callback) {
    const error = this.getUriPolicyError(details.url);
    if (error) {
      this.trace(`Blocking request to ${details.url}: ${error}`);
    }
    callback({ cancel: !!error });
  }
  /**
   * Updates HTTP headers for each web request.
   */
  onBeforeSendHeaders(details, callback) {
    const headers = { ...details.requestHeaders };
    headers["DNT"] = "1";
    headers["Sec-GPC"] = "1";
    if (details.resourceType === "mainFrame") {
      headers["Accept"] = "text/markdown, text/html;q=0.9, application/xhtml+xml;q=0.9, application/xml;q=0.8, */*;q=0.7";
    }
    callback({ requestHeaders: headers });
  }
  /**
   * Checks response headers for download-triggering Content-Disposition.
   * For text-based content types, replaces it with 'inline' so the content
   * is rendered and can be extracted. For binary content, cancels the response.
   */
  onHeadersReceived(details, callback) {
    const headers = details.responseHeaders;
    if (headers) {
      let hasAttachment = false;
      let attachmentHeaderName;
      let contentType;
      for (const name of Object.keys(headers)) {
        const lowerName = name.toLowerCase();
        if (lowerName === "content-disposition" && headers[name]?.some((v) => v.toLowerCase().includes("attachment"))) {
          hasAttachment = true;
          attachmentHeaderName = name;
        }
        if (lowerName === "content-type") {
          contentType = headers[name]?.[0]?.toLowerCase();
        }
      }
      if (details.resourceType === "mainFrame") {
        this._receivedMarkdown = contentType?.split(";")[0].trim() === "text/markdown";
        if (this._receivedMarkdown) {
          this.trace("Received text/markdown response, will extract document text content directly");
        }
      }
      if (hasAttachment && attachmentHeaderName) {
        if (this.isTextMimeType(contentType)) {
          this.trace(`Replacing Content-Disposition: attachment with inline for ${details.url} (content-type: ${contentType})`);
          headers[attachmentHeaderName] = ["inline"];
          callback({ responseHeaders: headers, cancel: false });
        } else {
          this.trace(`Blocked binary download (Content-Disposition: attachment, content-type: ${contentType}) for ${details.url}`);
          callback({ cancel: true });
        }
        return;
      }
    }
    callback({ cancel: false });
  }
  isTextMimeType(contentType) {
    const mimeType = contentType?.split(";")[0].trim();
    return !!mimeType && _WebPageLoader.TEXT_MIME_TYPE_RE.test(mimeType);
  }
  /**
   * Handles the 'will-download' event, blocking any downloads.
   */
  onDownload(_event, item) {
    const filename = item.getFilename();
    this.trace(`Blocked download: ${filename}`);
    item.cancel();
    void this._queue.queue(() => this.extractContent({ status: "error", error: `Download not allowed: ${filename}` }));
  }
  /**
   * Handles the 'did-start-loading' event, enabling network tracking.
   */
  onStartLoading() {
    if (this._store.isDisposed) {
      return;
    }
    this.trace(`Received 'did-start-loading' event`);
    void this._debugger.sendCommand("Network.enable").catch(() => {
    });
  }
  /**
   * Handles the 'did-finish-load' event, checking for idle state
   * and updating timeout to allow for post-load activities.
   */
  onFinishLoad() {
    if (this._store.isDisposed) {
      return;
    }
    this.trace(`Received 'did-finish-load' event`);
    this._didFinishLoad = true;
    this.scheduleIdleCheck();
    this.setTimeout(_WebPageLoader.POST_LOAD_TIMEOUT);
  }
  /**
   * Handles the 'did-fail-load' event, reporting load failures.
   */
  onFailLoad(_event, statusCode, error) {
    if (this._store.isDisposed) {
      return;
    }
    this.trace(`Received 'did-fail-load' event, code: ${statusCode}, error: '${error}'`);
    if (statusCode === -3) {
      this.trace(`Ignoring ERR_ABORTED (-3) as it may be caused by CSP or other measures`);
      void this._queue.queue(() => this.extractContent());
    } else if (statusCode === -27) {
      this.trace(`Ignoring ERR_BLOCKED_BY_CLIENT (-27) as it may be caused by ad-blockers or similar extensions`);
      void this._queue.queue(() => this.extractContent());
    } else {
      void this._queue.queue(() => this.extractContent({ status: "error", statusCode, error }));
    }
  }
  /**
   * Handles the 'will-navigate' and 'will-redirect' events, managing redirects.
   */
  onRedirect(event, url) {
    if (this._store.isDisposed) {
      return;
    }
    this.trace(`Received 'will-navigate' or 'will-redirect' event, url: ${url}`);
    const policyError = this.getUriPolicyError(url);
    if (policyError) {
      this.trace(`Blocking navigation to ${url}: ${policyError}`);
      event.preventDefault();
      this._onResult({ status: "error", error: policyError });
      return;
    }
    const toURI = URI.parse(url);
    if (!this._options?.followRedirects) {
      if (this.normalizeAuthority(toURI.authority) === this.normalizeAuthority(this._uri.authority)) {
        return;
      }
      if (this._isTrustedDomain(toURI)) {
        return;
      }
      if (this._didFinishLoad) {
        this.trace(`Blocking post-load navigation to ${url} (likely ad/tracker script)`);
        event.preventDefault();
        return;
      }
      event.preventDefault();
      this._onResult({ status: "redirect", toURI });
    }
  }
  onFrameNavigate(details) {
    const policyError = this.getUriPolicyError(details.url);
    if (policyError) {
      this.trace(`Blocking frame navigation to ${details.url}: ${policyError}`);
      details.preventDefault();
    }
  }
  /**
   * Normalizes an authority by removing the 'www.' prefix if present.
   */
  normalizeAuthority(authority) {
    return authority.toLowerCase().replace(/^www\./, "");
  }
  /**
   * Handles debugger messages related to network requests, tracking their lifecycle.
   * @note DO NOT add logging to this function, microsoft.com will freeze when too many logs are generated
   */
  onDebugMessage(_event, method, params) {
    if (this._store.isDisposed) {
      return;
    }
    const { requestId, type, response } = params;
    switch (method) {
      case "Network.requestWillBeSent":
        if (requestId !== void 0) {
          this._requests.add(requestId);
          this._idleDebounceTimer.cancel();
        }
        break;
      case "Network.loadingFinished":
      case "Network.loadingFailed":
        if (requestId !== void 0) {
          this._requests.delete(requestId);
          if (this._requests.size === 0 && this._didFinishLoad) {
            this.scheduleIdleCheck();
          }
        }
        break;
      case "Network.responseReceived":
        if (type === "Document") {
          const statusCode = response?.status ?? 0;
          if (statusCode >= 400) {
            const error = response?.statusText || `HTTP error ${statusCode}`;
            void this._queue.queue(() => this.extractContent({ status: "error", statusCode, error }));
          }
        }
        break;
    }
  }
  /**
   * Schedules an idle check after a debounce period to allow for bursts of network activity.
   * If idle is detected, proceeds to extract content.
   */
  scheduleIdleCheck() {
    if (this._store.isDisposed) {
      return;
    }
    this._idleDebounceTimer.cancelAndSet(async () => {
      if (this._store.isDisposed) {
        return;
      }
      await this.nextFrame();
      if (this._requests.size === 0) {
        this._queue.queue(() => this.extractContent());
      } else {
        this.trace(`New network requests detected, deferring content extraction`);
      }
    }, _WebPageLoader.IDLE_DEBOUNCE_TIME);
  }
  /**
   * Waits for a rendering frame to ensure the page had a chance to update.
   */
  async nextFrame() {
    if (this._store.isDisposed) {
      return;
    }
    await raceTimeout(
      new Promise((resolve) => {
        try {
          this.trace(`Waiting for a frame to be rendered`);
          this._window.webContents.beginFrameSubscription(false, () => {
            try {
              this.trace(`A frame has been rendered`);
              this._window.webContents.endFrameSubscription();
            } catch {
            }
            resolve();
          });
        } catch {
          resolve();
        }
      }),
      _WebPageLoader.FRAME_TIMEOUT
    );
  }
  /**
   * Extracts the content of the loaded web page using the Accessibility domain and reports the result.
   */
  async extractContent(errorResult) {
    if (this._store.isDisposed) {
      return;
    }
    try {
      const title = this._window.webContents.getTitle();
      let result = "";
      const cts = new CancellationTokenSource();
      try {
        await raceTimeout((async () => {
          if (this._receivedMarkdown) {
            this.trace("Extracting markdown text content from document");
            result = await this._window.webContents.executeJavaScript('document.body?.textContent ?? document.documentElement?.textContent ?? ""') ?? "";
            return;
          }
          if (!cts.token.isCancellationRequested) {
            result = await this.extractAccessibilityTreeContent(cts.token) ?? "";
          }
          if (!cts.token.isCancellationRequested && result.length < _WebPageLoader.MIN_CONTENT_LENGTH) {
            this.trace(`Accessibility tree extraction yielded insufficient content, trying main DOM element extraction`);
            const domContent = await this.extractMainDomElementContent() ?? "";
            result = domContent.length > result.length ? domContent : result;
          }
        })(), _WebPageLoader.EXTRACT_CONTENT_TIMEOUT);
      } finally {
        cts.cancel();
        cts.dispose();
      }
      if (result.length === 0) {
        this._onResult({ status: "error", error: "Failed to extract meaningful content from the web page" });
      } else if (errorResult !== void 0) {
        this._onResult({ ...errorResult, result, title });
      } else {
        this._onResult({ status: "ok", result, title });
      }
    } catch (e) {
      if (errorResult !== void 0) {
        this._onResult(errorResult);
      } else {
        this._onResult({
          status: "error",
          error: e instanceof Error ? e.message : String(e)
        });
      }
    }
  }
  /**
   * Extracts content from the Accessibility tree of the loaded web page.
   * @param token Cancellation token to abort the operation.
   * @return The extracted content, or undefined if extraction fails or is cancelled.
   */
  async extractAccessibilityTreeContent(token) {
    this.trace(`Extracting content using Accessibility domain`);
    try {
      await this._debugger.sendCommand("Page.enable");
      if (token.isCancellationRequested) {
        return void 0;
      }
      const { frameTree } = await this._debugger.sendCommand("Page.getFrameTree");
      if (token.isCancellationRequested) {
        return void 0;
      }
      const frameNodes = [];
      const pendingFrameNodes = [frameTree];
      for (let i = 0; i < pendingFrameNodes.length; i++) {
        const frameNode = pendingFrameNodes[i];
        if (frameNode.frame.url && this.getUriPolicyError(frameNode.frame.url)) {
          this.trace(`Skipping blocked frame content from ${frameNode.frame.url}`);
          continue;
        }
        frameNodes.push(frameNode);
        pendingFrameNodes.push(...frameNode.childFrames ?? []);
      }
      const allNodes = [];
      for (const { frame } of frameNodes) {
        try {
          const { nodes } = await this._debugger.sendCommand("Accessibility.getFullAXTree", { frameId: frame.id });
          allNodes.push(...nodes);
          if (token.isCancellationRequested) {
            return void 0;
          }
        } catch {
        }
      }
      return convertAXTreeToMarkdown(this._uri, allNodes);
    } catch (error) {
      this.trace(`Accessibility tree extraction failed: ${error instanceof Error ? error.message : String(error)}`);
      return void 0;
    }
  }
  /**
   * Fallback method for extracting web page content when Accessibility tree extraction yields insufficient content.
   * Attempts to extract meaningful text content from the main DOM elements of the loaded web page.
   * @returns The extracted text content, or undefined if extraction fails.
   */
  async extractMainDomElementContent() {
    try {
      this.trace(`Extracting content from main DOM element`);
      return await this._window.webContents.executeJavaScript(`
				(() => {
					const selectors = ['main','article','[role="main"]','.main-content','#main-content','.article-body','.post-content','.entry-content','.content','body'];
					for (const selector of selectors) {
						const content = document.querySelector(selector)?.textContent?.replace(/[ \\t]+/g, ' ').replace(/\\s{2,}/gm, '\\n').trim();
						if (content && content.length > ${_WebPageLoader.MIN_CONTENT_LENGTH}) {
							return content;
						}
					}
					return undefined;
				})();
			`);
    } catch (error) {
      this.trace(`DOM extraction failed: ${error instanceof Error ? error.message : String(error)}`);
      return void 0;
    }
  }
};
_WebPageLoader.TIMEOUT = 3e4;
// 30 seconds
_WebPageLoader.POST_LOAD_TIMEOUT = 5e3;
// 5 seconds - increased for dynamic content
_WebPageLoader.FRAME_TIMEOUT = 500;
// 0.5 seconds
_WebPageLoader.EXTRACT_CONTENT_TIMEOUT = 2e3;
// 2 seconds
_WebPageLoader.IDLE_DEBOUNCE_TIME = 500;
// 0.5 seconds - wait after last network request
_WebPageLoader.MIN_CONTENT_LENGTH = 100;
/**
 * Returns whether the given MIME type represents text-based content
 * that can be meaningfully rendered and extracted.
 */
_WebPageLoader.TEXT_MIME_TYPE_RE = /^(?:text\/|application\/(?:json|xml|xhtml\+xml|rss\+xml|atom\+xml|svg\+xml|javascript|ecmascript|x-yaml|yaml|toml|.*\+(?:xml|json))$)/;
let WebPageLoader = _WebPageLoader;
export {
  WebPageLoader
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcd2ViQ29udGVudEV4dHJhY3RvclxcZWxlY3Ryb24tbWFpblxcd2ViUGFnZUxvYWRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgQmVmb3JlU2VuZFJlc3BvbnNlLCBCcm93c2VyV2luZG93LCBCcm93c2VyV2luZG93Q29uc3RydWN0b3JPcHRpb25zLCBDYWxsYmFja1Jlc3BvbnNlLCBFdmVudCwgSGVhZGVyc1JlY2VpdmVkUmVzcG9uc2UsIE9uQmVmb3JlUmVxdWVzdExpc3RlbmVyRGV0YWlscywgT25CZWZvcmVTZW5kSGVhZGVyc0xpc3RlbmVyRGV0YWlscywgT25IZWFkZXJzUmVjZWl2ZWRMaXN0ZW5lckRldGFpbHMsIFdlYkNvbnRlbnRzV2lsbEZyYW1lTmF2aWdhdGVFdmVudFBhcmFtcyB9IGZyb20gJ2VsZWN0cm9uJztcbmltcG9ydCB7IFF1ZXVlLCByYWNlVGltZW91dCwgVGltZW91dFRpbWVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGNyZWF0ZVNpbmdsZUNhbGxGdW5jdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Z1bmN0aW9uYWwuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9uZXR3b3JrRmlsdGVyL2NvbW1vbi9uZXR3b3JrRmlsdGVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV2ViQ29udGVudEV4dHJhY3Rvck9wdGlvbnMsIFdlYkNvbnRlbnRFeHRyYWN0UmVzdWx0IH0gZnJvbSAnLi4vY29tbW9uL3dlYkNvbnRlbnRFeHRyYWN0b3IuanMnO1xuaW1wb3J0IHsgQVhOb2RlLCBjb252ZXJ0QVhUcmVlVG9NYXJrZG93biB9IGZyb20gJy4vY2RwQWNjZXNzaWJpbGl0eURvbWFpbi5qcyc7XG5cbnR5cGUgTmV0d29ya1JlcXVlc3RFdmVudFBhcmFtcyA9IFJlYWRvbmx5PHtcblx0cmVxdWVzdElkPzogc3RyaW5nO1xuXHRyZXF1ZXN0PzogeyB1cmw/OiBzdHJpbmcgfTtcblx0cmVzcG9uc2U/OiB7IHN0YXR1cz86IG51bWJlcjsgc3RhdHVzVGV4dD86IHN0cmluZyB9O1xuXHR0eXBlPzogc3RyaW5nO1xufT47XG5cbnR5cGUgRnJhbWVJbmZvID0gUmVhZG9ubHk8e1xuXHRpZDogc3RyaW5nO1xuXHR1cmw/OiBzdHJpbmc7XG5cdG5hbWU/OiBzdHJpbmc7XG59PjtcblxudHlwZSBGcmFtZVRyZWVOb2RlID0gUmVhZG9ubHk8e1xuXHRmcmFtZTogRnJhbWVJbmZvO1xuXHRjaGlsZEZyYW1lcz86IEZyYW1lVHJlZU5vZGVbXTtcbn0+O1xuXG4vKipcbiAqIEEgd2ViIHBhZ2UgbG9hZGVyIHRoYXQgdXNlcyBFbGVjdHJvbiB0byBsb2FkIHdlYiBwYWdlcyBhbmQgZXh0cmFjdCB0aGVpciBjb250ZW50LlxuICovXG5leHBvcnQgY2xhc3MgV2ViUGFnZUxvYWRlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBUSU1FT1VUID0gMzAwMDA7IC8vIDMwIHNlY29uZHNcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUE9TVF9MT0FEX1RJTUVPVVQgPSA1MDAwOyAvLyA1IHNlY29uZHMgLSBpbmNyZWFzZWQgZm9yIGR5bmFtaWMgY29udGVudFxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBGUkFNRV9USU1FT1VUID0gNTAwOyAvLyAwLjUgc2Vjb25kc1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBFWFRSQUNUX0NPTlRFTlRfVElNRU9VVCA9IDIwMDA7IC8vIDIgc2Vjb25kc1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBJRExFX0RFQk9VTkNFX1RJTUUgPSA1MDA7IC8vIDAuNSBzZWNvbmRzIC0gd2FpdCBhZnRlciBsYXN0IG5ldHdvcmsgcmVxdWVzdFxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBNSU5fQ09OVEVOVF9MRU5HVEggPSAxMDA7IC8vIE1pbmltdW0gY29udGVudCBsZW5ndGggdG8gY29uc2lkZXIgZXh0cmFjdGlvbiBzdWNjZXNzZnVsXG5cblx0cHJpdmF0ZSByZWFkb25seSBfd2luZG93OiBCcm93c2VyV2luZG93O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWJ1Z2dlcjogRWxlY3Ryb24uRGVidWdnZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlcXVlc3RzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3F1ZXVlID0gdGhpcy5fcmVnaXN0ZXIobmV3IFF1ZXVlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90aW1lb3V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRpbWVvdXRUaW1lcigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaWRsZURlYm91bmNlVGltZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGltZW91dFRpbWVyKCkpO1xuXHRwcml2YXRlIF9vblJlc3VsdCA9IChfcmVzdWx0OiBXZWJDb250ZW50RXh0cmFjdFJlc3VsdCkgPT4geyB9O1xuXHRwcml2YXRlIF9kaWRGaW5pc2hMb2FkID0gZmFsc2U7XG5cdHByaXZhdGUgX3JlY2VpdmVkTWFya2Rvd24gPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRicm93c2VyV2luZG93RmFjdG9yeTogKG9wdGlvbnM6IEJyb3dzZXJXaW5kb3dDb25zdHJ1Y3Rvck9wdGlvbnMpID0+IEJyb3dzZXJXaW5kb3csXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nZ2VyOiBJTG9nU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF91cmk6IFVSSSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zOiBJV2ViQ29udGVudEV4dHJhY3Rvck9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaXNUcnVzdGVkRG9tYWluOiAodXJpOiBVUkkpID0+IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfYWdlbnROZXR3b3JrRmlsdGVyU2VydmljZTogSUFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl93aW5kb3cgPSBicm93c2VyV2luZG93RmFjdG9yeSh7XG5cdFx0XHR3aWR0aDogODAwLFxuXHRcdFx0aGVpZ2h0OiA2MDAsXG5cdFx0XHRzaG93OiBmYWxzZSxcblx0XHRcdHdlYlByZWZlcmVuY2VzOiB7XG5cdFx0XHRcdHBhcnRpdGlvbjogZ2VuZXJhdGVVdWlkKCksIC8vIGRvIG5vdCBzaGFyZSBhbnkgc3RhdGUgd2l0aCB0aGUgZGVmYXVsdCByZW5kZXJlciBzZXNzaW9uXG5cdFx0XHRcdGphdmFzY3JpcHQ6IHRydWUsXG5cdFx0XHRcdG9mZnNjcmVlbjogdHJ1ZSxcblx0XHRcdFx0c2FuZGJveDogdHJ1ZSxcblx0XHRcdFx0d2ViZ2w6IGZhbHNlLFxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX3dpbmRvdy5kZXN0cm95KCkpKTtcblxuXHRcdHRoaXMuX3dpbmRvdy53ZWJDb250ZW50cy5zZXRXaW5kb3dPcGVuSGFuZGxlcigoKSA9PiAoeyBhY3Rpb246ICdkZW55JyB9KSk7XG5cblx0XHR0aGlzLl9kZWJ1Z2dlciA9IHRoaXMuX3dpbmRvdy53ZWJDb250ZW50cy5kZWJ1Z2dlcjtcblx0XHR0aGlzLl9kZWJ1Z2dlci5hdHRhY2goJzEuMScpO1xuXHRcdHRoaXMuX2RlYnVnZ2VyLm9uKCdtZXNzYWdlJywgdGhpcy5vbkRlYnVnTWVzc2FnZS5iaW5kKHRoaXMpKTtcblxuXHRcdHRoaXMuX3dpbmRvdy53ZWJDb250ZW50c1xuXHRcdFx0Lm9uY2UoJ2RpZC1zdGFydC1sb2FkaW5nJywgdGhpcy5vblN0YXJ0TG9hZGluZy5iaW5kKHRoaXMpKVxuXHRcdFx0Lm9uY2UoJ2RpZC1maW5pc2gtbG9hZCcsIHRoaXMub25GaW5pc2hMb2FkLmJpbmQodGhpcykpXG5cdFx0XHQub25jZSgnZGlkLWZhaWwtbG9hZCcsIHRoaXMub25GYWlsTG9hZC5iaW5kKHRoaXMpKVxuXHRcdFx0Lm9uKCd3aWxsLWZyYW1lLW5hdmlnYXRlJywgdGhpcy5vbkZyYW1lTmF2aWdhdGUuYmluZCh0aGlzKSlcblx0XHRcdC5vbignd2lsbC1uYXZpZ2F0ZScsIHRoaXMub25SZWRpcmVjdC5iaW5kKHRoaXMpKVxuXHRcdFx0Lm9uKCd3aWxsLXJlZGlyZWN0JywgdGhpcy5vblJlZGlyZWN0LmJpbmQodGhpcykpXG5cdFx0XHQub24oJ3NlbGVjdC1jbGllbnQtY2VydGlmaWNhdGUnLCAoZXZlbnQpID0+IGV2ZW50LnByZXZlbnREZWZhdWx0KCkpO1xuXG5cdFx0dGhpcy5fd2luZG93LndlYkNvbnRlbnRzLnNlc3Npb24ud2ViUmVxdWVzdC5vbkJlZm9yZVJlcXVlc3QoXG5cdFx0XHR0aGlzLm9uQmVmb3JlUmVxdWVzdC5iaW5kKHRoaXMpKTtcblxuXHRcdHRoaXMuX3dpbmRvdy53ZWJDb250ZW50cy5zZXNzaW9uLndlYlJlcXVlc3Qub25CZWZvcmVTZW5kSGVhZGVycyhcblx0XHRcdHRoaXMub25CZWZvcmVTZW5kSGVhZGVycy5iaW5kKHRoaXMpKTtcblxuXHRcdHRoaXMuX3dpbmRvdy53ZWJDb250ZW50cy5zZXNzaW9uLndlYlJlcXVlc3Qub25IZWFkZXJzUmVjZWl2ZWQoXG5cdFx0XHR0aGlzLm9uSGVhZGVyc1JlY2VpdmVkLmJpbmQodGhpcykpO1xuXG5cdFx0dGhpcy5fd2luZG93LndlYkNvbnRlbnRzLnNlc3Npb24ub24oJ3dpbGwtZG93bmxvYWQnLCB0aGlzLm9uRG93bmxvYWQuYmluZCh0aGlzKSk7XG5cdH1cblxuXHRwcml2YXRlIHRyYWNlKG1lc3NhZ2U6IHN0cmluZykge1xuXHRcdHRoaXMuX2xvZ2dlci50cmFjZShgW1dlYlBhZ2VMb2FkZXJdIFske3RoaXMuX3VyaX1dICR7bWVzc2FnZX1gKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMb2FkcyB0aGUgd2ViIHBhZ2UgYW5kIGV4dHJhY3RzIGl0cyBjb250ZW50LlxuXHQgKi9cblx0cHVibGljIGFzeW5jIGxvYWQoKSB7XG5cdFx0cmV0dXJuIGF3YWl0IG5ldyBQcm9taXNlPFdlYkNvbnRlbnRFeHRyYWN0UmVzdWx0PigocmVzb2x2ZSkgPT4ge1xuXHRcdFx0dGhpcy5fb25SZXN1bHQgPSBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24oKHJlc3VsdCkgPT4ge1xuXHRcdFx0XHRzd2l0Y2ggKHJlc3VsdC5zdGF0dXMpIHtcblx0XHRcdFx0XHRjYXNlICdvayc6XG5cdFx0XHRcdFx0XHR0aGlzLnRyYWNlKGBMb2FkZWQgd2ViIHBhZ2UgY29udGVudCwgc3RhdHVzOiAke3Jlc3VsdC5zdGF0dXN9LCB0aXRsZTogJyR7cmVzdWx0LnRpdGxlfScsIGxlbmd0aDogJHtyZXN1bHQucmVzdWx0Lmxlbmd0aH1gKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3JlZGlyZWN0Jzpcblx0XHRcdFx0XHRcdHRoaXMudHJhY2UoYExvYWRlZCB3ZWIgcGFnZSBjb250ZW50LCBzdGF0dXM6ICR7cmVzdWx0LnN0YXR1c30sIHRvVVJJOiAke3Jlc3VsdC50b1VSSX1gKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2Vycm9yJzpcblx0XHRcdFx0XHRcdHRoaXMudHJhY2UoYExvYWRlZCB3ZWIgcGFnZSBjb250ZW50LCBzdGF0dXM6ICR7cmVzdWx0LnN0YXR1c30sIGNvZGU6ICR7cmVzdWx0LnN0YXR1c0NvZGV9LCBlcnJvcjogJyR7cmVzdWx0LmVycm9yfScsIHRpdGxlOiAnJHtyZXN1bHQudGl0bGV9JywgbGVuZ3RoOiAke3Jlc3VsdC5yZXN1bHQ/Lmxlbmd0aCA/PyAwfWApO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gcmVzdWx0LnN0YXR1cyAhPT0gJ3JlZGlyZWN0JyA/IHJlc3VsdC5yZXN1bHQgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChjb250ZW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aGlzLnRyYWNlKGNvbnRlbnQubGVuZ3RoIDwgMjAwID8gYEV4dHJhY3RlZCBjb250ZW50OiAnJHtjb250ZW50fSdgIDogYEV4dHJhY3RlZCBjb250ZW50IHByZXZpZXc6ICcke2NvbnRlbnQuc3Vic3RyaW5nKDAsIDIwMCl9Li4uJ2ApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmVzb2x2ZShyZXN1bHQpO1xuXHRcdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLnRyYWNlKGBMb2FkaW5nIHdlYiBwYWdlIGNvbnRlbnRgKTtcblx0XHRcdHZvaWQgdGhpcy5fd2luZG93LmxvYWRVUkwodGhpcy5fdXJpLnRvU3RyaW5nKHRydWUpKTtcblx0XHRcdHRoaXMuc2V0VGltZW91dChXZWJQYWdlTG9hZGVyLlRJTUVPVVQpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldHMgYSB0aW1lb3V0IHRvIHRyaWdnZXIgY29udGVudCBleHRyYWN0aW9uIHJlZ2FyZGxlc3Mgb2YgY3VycmVudCBsb2FkaW5nIHN0YXRlLlxuXHQgKi9cblx0cHJpdmF0ZSBzZXRUaW1lb3V0KHRpbWU6IG51bWJlcikge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy50cmFjZShgU2V0dGluZyBwYWdlIGxvYWQgdGltZW91dCB0byAke3RpbWV9IG1zYCk7XG5cdFx0dGhpcy5fdGltZW91dC5jYW5jZWxBbmRTZXQoKCkgPT4ge1xuXHRcdFx0dGhpcy50cmFjZShgUGFnZSBsb2FkIHRpbWVvdXQgcmVhY2hlZGApO1xuXHRcdFx0dm9pZCB0aGlzLl9xdWV1ZS5xdWV1ZSgoKSA9PiB0aGlzLmV4dHJhY3RDb250ZW50KCkpO1xuXHRcdH0sIHRpbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRVcmlQb2xpY3lFcnJvcih1cmw6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IHVyaTogVVJJO1xuXHRcdHRyeSB7XG5cdFx0XHR1cmkgPSBVUkkucGFyc2UodXJsLCB0cnVlKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnd2ViUGFnZUxvYWRlci5pbnZhbGlkVXJpJywgXCJOYXZpZ2F0aW9uIHRvIGFuIGludmFsaWQgVVJJIGlzIG5vdCBhbGxvd2VkLlwiKTtcblx0XHR9XG5cblx0XHRpZiAodXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5odHRwIHx8IHVyaS5zY2hlbWUgPT09IFNjaGVtYXMuaHR0cHMgfHwgdXJpLnNjaGVtZSA9PT0gJ3dzJyB8fCB1cmkuc2NoZW1lID09PSAnd3NzJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UuaXNVcmlBbGxvd2VkKHVyaSlcblx0XHRcdFx0PyB1bmRlZmluZWRcblx0XHRcdFx0OiB0aGlzLl9hZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlLmZvcm1hdEVycm9yKHVyaSk7XG5cdFx0fVxuXG5cdFx0aWYgKFxuXHRcdFx0KHVyaS5zY2hlbWUgPT09ICdhYm91dCcgJiYgdXJpLnBhdGggPT09ICdibGFuaycpIHx8XG5cdFx0XHR1cmkuc2NoZW1lID09PSBTY2hlbWFzLmRhdGEgfHxcblx0XHRcdHVyaS5zY2hlbWUgPT09ICdibG9iJ1xuXHRcdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gbG9jYWxpemUoJ3dlYlBhZ2VMb2FkZXIudW5zdXBwb3J0ZWRVcmlTY2hlbWUnLCBcIk5hdmlnYXRpb24gdG8gdGhlICd7MH0nIFVSSSBzY2hlbWUgaXMgbm90IGFsbG93ZWQuXCIsIHVyaS5zY2hlbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkJlZm9yZVJlcXVlc3QoZGV0YWlsczogT25CZWZvcmVSZXF1ZXN0TGlzdGVuZXJEZXRhaWxzLCBjYWxsYmFjazogKHJlc3BvbnNlOiBDYWxsYmFja1Jlc3BvbnNlKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0Y29uc3QgZXJyb3IgPSB0aGlzLmdldFVyaVBvbGljeUVycm9yKGRldGFpbHMudXJsKTtcblx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdHRoaXMudHJhY2UoYEJsb2NraW5nIHJlcXVlc3QgdG8gJHtkZXRhaWxzLnVybH06ICR7ZXJyb3J9YCk7XG5cdFx0fVxuXHRcdGNhbGxiYWNrKHsgY2FuY2VsOiAhIWVycm9yIH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgSFRUUCBoZWFkZXJzIGZvciBlYWNoIHdlYiByZXF1ZXN0LlxuXHQgKi9cblx0cHJpdmF0ZSBvbkJlZm9yZVNlbmRIZWFkZXJzKGRldGFpbHM6IE9uQmVmb3JlU2VuZEhlYWRlcnNMaXN0ZW5lckRldGFpbHMsIGNhbGxiYWNrOiAoYmVmb3JlU2VuZFJlc3BvbnNlOiBCZWZvcmVTZW5kUmVzcG9uc2UpID0+IHZvaWQpIHtcblx0XHRjb25zdCBoZWFkZXJzID0geyAuLi5kZXRhaWxzLnJlcXVlc3RIZWFkZXJzIH07XG5cblx0XHQvLyBSZXF1ZXN0IHByaXZhY3kgZm9yIHdlYi1zaXRlcyB0aGF0IHJlc3BlY3QgdGhlc2UuXG5cdFx0aGVhZGVyc1snRE5UJ10gPSAnMSc7XG5cdFx0aGVhZGVyc1snU2VjLUdQQyddID0gJzEnO1xuXG5cdFx0Ly8gRm9yIHRoZSBtYWluIGRvY3VtZW50IHJlcXVlc3QsIHByZWZlciBtYXJrZG93biByZXNwb25zZXMgZnJvbSBzaXRlcyB0aGF0XG5cdFx0Ly8gc3VwcG9ydCBhZ2VudC1mcmllbmRseSBjb250ZW50IG5lZ290aWF0aW9uIChlLmcuIE1pY3Jvc29mdCBMZWFybiwgQ2xvdWRmbGFyZSBkb2NzKS5cblx0XHRpZiAoZGV0YWlscy5yZXNvdXJjZVR5cGUgPT09ICdtYWluRnJhbWUnKSB7XG5cdFx0XHRoZWFkZXJzWydBY2NlcHQnXSA9ICd0ZXh0L21hcmtkb3duLCB0ZXh0L2h0bWw7cT0wLjksIGFwcGxpY2F0aW9uL3hodG1sK3htbDtxPTAuOSwgYXBwbGljYXRpb24veG1sO3E9MC44LCAqLyo7cT0wLjcnO1xuXHRcdH1cblxuXHRcdGNhbGxiYWNrKHsgcmVxdWVzdEhlYWRlcnM6IGhlYWRlcnMgfSk7XG5cdH1cblxuXHQvKipcblx0ICogQ2hlY2tzIHJlc3BvbnNlIGhlYWRlcnMgZm9yIGRvd25sb2FkLXRyaWdnZXJpbmcgQ29udGVudC1EaXNwb3NpdGlvbi5cblx0ICogRm9yIHRleHQtYmFzZWQgY29udGVudCB0eXBlcywgcmVwbGFjZXMgaXQgd2l0aCAnaW5saW5lJyBzbyB0aGUgY29udGVudFxuXHQgKiBpcyByZW5kZXJlZCBhbmQgY2FuIGJlIGV4dHJhY3RlZC4gRm9yIGJpbmFyeSBjb250ZW50LCBjYW5jZWxzIHRoZSByZXNwb25zZS5cblx0ICovXG5cdHByaXZhdGUgb25IZWFkZXJzUmVjZWl2ZWQoZGV0YWlsczogT25IZWFkZXJzUmVjZWl2ZWRMaXN0ZW5lckRldGFpbHMsIGNhbGxiYWNrOiAoaGVhZGVyc1JlY2VpdmVkUmVzcG9uc2U6IEhlYWRlcnNSZWNlaXZlZFJlc3BvbnNlKSA9PiB2b2lkKSB7XG5cdFx0Y29uc3QgaGVhZGVycyA9IGRldGFpbHMucmVzcG9uc2VIZWFkZXJzO1xuXHRcdGlmIChoZWFkZXJzKSB7XG5cdFx0XHRsZXQgaGFzQXR0YWNobWVudCA9IGZhbHNlO1xuXHRcdFx0bGV0IGF0dGFjaG1lbnRIZWFkZXJOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgY29udGVudFR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRcdFx0Zm9yIChjb25zdCBuYW1lIG9mIE9iamVjdC5rZXlzKGhlYWRlcnMpKSB7XG5cdFx0XHRcdGNvbnN0IGxvd2VyTmFtZSA9IG5hbWUudG9Mb3dlckNhc2UoKTtcblx0XHRcdFx0aWYgKGxvd2VyTmFtZSA9PT0gJ2NvbnRlbnQtZGlzcG9zaXRpb24nICYmIGhlYWRlcnNbbmFtZV0/LnNvbWUodiA9PiB2LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2F0dGFjaG1lbnQnKSkpIHtcblx0XHRcdFx0XHRoYXNBdHRhY2htZW50ID0gdHJ1ZTtcblx0XHRcdFx0XHRhdHRhY2htZW50SGVhZGVyTmFtZSA9IG5hbWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGxvd2VyTmFtZSA9PT0gJ2NvbnRlbnQtdHlwZScpIHtcblx0XHRcdFx0XHRjb250ZW50VHlwZSA9IGhlYWRlcnNbbmFtZV0/LlswXT8udG9Mb3dlckNhc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBUcmFjayB3aGV0aGVyIHRoZSBjdXJyZW50IG1haW4tZnJhbWUgcmVzcG9uc2UgaXMgbWFya2Rvd24gKHJlZGlyZWN0cyBjYW4gY2hhbmdlIGNvbnRlbnQtdHlwZSlcblx0XHRcdGlmIChkZXRhaWxzLnJlc291cmNlVHlwZSA9PT0gJ21haW5GcmFtZScpIHtcblx0XHRcdFx0dGhpcy5fcmVjZWl2ZWRNYXJrZG93biA9IGNvbnRlbnRUeXBlPy5zcGxpdCgnOycpWzBdLnRyaW0oKSA9PT0gJ3RleHQvbWFya2Rvd24nO1xuXHRcdFx0XHRpZiAodGhpcy5fcmVjZWl2ZWRNYXJrZG93bikge1xuXHRcdFx0XHRcdHRoaXMudHJhY2UoJ1JlY2VpdmVkIHRleHQvbWFya2Rvd24gcmVzcG9uc2UsIHdpbGwgZXh0cmFjdCBkb2N1bWVudCB0ZXh0IGNvbnRlbnQgZGlyZWN0bHknKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaGFzQXR0YWNobWVudCAmJiBhdHRhY2htZW50SGVhZGVyTmFtZSkge1xuXHRcdFx0XHRpZiAodGhpcy5pc1RleHRNaW1lVHlwZShjb250ZW50VHlwZSkpIHtcblx0XHRcdFx0XHR0aGlzLnRyYWNlKGBSZXBsYWNpbmcgQ29udGVudC1EaXNwb3NpdGlvbjogYXR0YWNobWVudCB3aXRoIGlubGluZSBmb3IgJHtkZXRhaWxzLnVybH0gKGNvbnRlbnQtdHlwZTogJHtjb250ZW50VHlwZX0pYCk7XG5cdFx0XHRcdFx0aGVhZGVyc1thdHRhY2htZW50SGVhZGVyTmFtZV0gPSBbJ2lubGluZSddO1xuXHRcdFx0XHRcdGNhbGxiYWNrKHsgcmVzcG9uc2VIZWFkZXJzOiBoZWFkZXJzLCBjYW5jZWw6IGZhbHNlIH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMudHJhY2UoYEJsb2NrZWQgYmluYXJ5IGRvd25sb2FkIChDb250ZW50LURpc3Bvc2l0aW9uOiBhdHRhY2htZW50LCBjb250ZW50LXR5cGU6ICR7Y29udGVudFR5cGV9KSBmb3IgJHtkZXRhaWxzLnVybH1gKTtcblx0XHRcdFx0XHRjYWxsYmFjayh7IGNhbmNlbDogdHJ1ZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNhbGxiYWNrKHsgY2FuY2VsOiBmYWxzZSB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIGdpdmVuIE1JTUUgdHlwZSByZXByZXNlbnRzIHRleHQtYmFzZWQgY29udGVudFxuXHQgKiB0aGF0IGNhbiBiZSBtZWFuaW5nZnVsbHkgcmVuZGVyZWQgYW5kIGV4dHJhY3RlZC5cblx0ICovXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFRFWFRfTUlNRV9UWVBFX1JFID0gL14oPzp0ZXh0XFwvfGFwcGxpY2F0aW9uXFwvKD86anNvbnx4bWx8eGh0bWxcXCt4bWx8cnNzXFwreG1sfGF0b21cXCt4bWx8c3ZnXFwreG1sfGphdmFzY3JpcHR8ZWNtYXNjcmlwdHx4LXlhbWx8eWFtbHx0b21sfC4qXFwrKD86eG1sfGpzb24pKSQpLztcblxuXHRwcml2YXRlIGlzVGV4dE1pbWVUeXBlKGNvbnRlbnRUeXBlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRjb25zdCBtaW1lVHlwZSA9IGNvbnRlbnRUeXBlPy5zcGxpdCgnOycpWzBdLnRyaW0oKTtcblx0XHRyZXR1cm4gISFtaW1lVHlwZSAmJiBXZWJQYWdlTG9hZGVyLlRFWFRfTUlNRV9UWVBFX1JFLnRlc3QobWltZVR5cGUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZXMgdGhlICd3aWxsLWRvd25sb2FkJyBldmVudCwgYmxvY2tpbmcgYW55IGRvd25sb2Fkcy5cblx0ICovXG5cdHByaXZhdGUgb25Eb3dubG9hZChfZXZlbnQ6IEV2ZW50LCBpdGVtOiBFbGVjdHJvbi5Eb3dubG9hZEl0ZW0pIHtcblx0XHRjb25zdCBmaWxlbmFtZSA9IGl0ZW0uZ2V0RmlsZW5hbWUoKTtcblx0XHR0aGlzLnRyYWNlKGBCbG9ja2VkIGRvd25sb2FkOiAke2ZpbGVuYW1lfWApO1xuXHRcdGl0ZW0uY2FuY2VsKCk7XG5cdFx0dm9pZCB0aGlzLl9xdWV1ZS5xdWV1ZSgoKSA9PiB0aGlzLmV4dHJhY3RDb250ZW50KHsgc3RhdHVzOiAnZXJyb3InLCBlcnJvcjogYERvd25sb2FkIG5vdCBhbGxvd2VkOiAke2ZpbGVuYW1lfWAgfSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZXMgdGhlICdkaWQtc3RhcnQtbG9hZGluZycgZXZlbnQsIGVuYWJsaW5nIG5ldHdvcmsgdHJhY2tpbmcuXG5cdCAqL1xuXHRwcml2YXRlIG9uU3RhcnRMb2FkaW5nKCkge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy50cmFjZShgUmVjZWl2ZWQgJ2RpZC1zdGFydC1sb2FkaW5nJyBldmVudGApO1xuXHRcdHZvaWQgdGhpcy5fZGVidWdnZXIuc2VuZENvbW1hbmQoJ05ldHdvcmsuZW5hYmxlJykuY2F0Y2goKCkgPT4ge1xuXHRcdFx0Ly8gVGhpcyB0aHJvd3Mgd2hlbiB3ZSBkZXN0cm95IHRoZSB3aW5kb3cgb24gcmVkaXJlY3QuXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogSGFuZGxlcyB0aGUgJ2RpZC1maW5pc2gtbG9hZCcgZXZlbnQsIGNoZWNraW5nIGZvciBpZGxlIHN0YXRlXG5cdCAqIGFuZCB1cGRhdGluZyB0aW1lb3V0IHRvIGFsbG93IGZvciBwb3N0LWxvYWQgYWN0aXZpdGllcy5cblx0ICovXG5cdHByaXZhdGUgb25GaW5pc2hMb2FkKCkge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy50cmFjZShgUmVjZWl2ZWQgJ2RpZC1maW5pc2gtbG9hZCcgZXZlbnRgKTtcblx0XHR0aGlzLl9kaWRGaW5pc2hMb2FkID0gdHJ1ZTtcblx0XHR0aGlzLnNjaGVkdWxlSWRsZUNoZWNrKCk7XG5cdFx0dGhpcy5zZXRUaW1lb3V0KFdlYlBhZ2VMb2FkZXIuUE9TVF9MT0FEX1RJTUVPVVQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZXMgdGhlICdkaWQtZmFpbC1sb2FkJyBldmVudCwgcmVwb3J0aW5nIGxvYWQgZmFpbHVyZXMuXG5cdCAqL1xuXHRwcml2YXRlIG9uRmFpbExvYWQoX2V2ZW50OiBFdmVudCwgc3RhdHVzQ29kZTogbnVtYmVyLCBlcnJvcjogc3RyaW5nKSB7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnRyYWNlKGBSZWNlaXZlZCAnZGlkLWZhaWwtbG9hZCcgZXZlbnQsIGNvZGU6ICR7c3RhdHVzQ29kZX0sIGVycm9yOiAnJHtlcnJvcn0nYCk7XG5cdFx0aWYgKHN0YXR1c0NvZGUgPT09IC0zKSB7XG5cdFx0XHR0aGlzLnRyYWNlKGBJZ25vcmluZyBFUlJfQUJPUlRFRCAoLTMpIGFzIGl0IG1heSBiZSBjYXVzZWQgYnkgQ1NQIG9yIG90aGVyIG1lYXN1cmVzYCk7XG5cdFx0XHR2b2lkIHRoaXMuX3F1ZXVlLnF1ZXVlKCgpID0+IHRoaXMuZXh0cmFjdENvbnRlbnQoKSk7XG5cdFx0fSBlbHNlIGlmIChzdGF0dXNDb2RlID09PSAtMjcpIHtcblx0XHRcdHRoaXMudHJhY2UoYElnbm9yaW5nIEVSUl9CTE9DS0VEX0JZX0NMSUVOVCAoLTI3KSBhcyBpdCBtYXkgYmUgY2F1c2VkIGJ5IGFkLWJsb2NrZXJzIG9yIHNpbWlsYXIgZXh0ZW5zaW9uc2ApO1xuXHRcdFx0dm9pZCB0aGlzLl9xdWV1ZS5xdWV1ZSgoKSA9PiB0aGlzLmV4dHJhY3RDb250ZW50KCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR2b2lkIHRoaXMuX3F1ZXVlLnF1ZXVlKCgpID0+IHRoaXMuZXh0cmFjdENvbnRlbnQoeyBzdGF0dXM6ICdlcnJvcicsIHN0YXR1c0NvZGUsIGVycm9yIH0pKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogSGFuZGxlcyB0aGUgJ3dpbGwtbmF2aWdhdGUnIGFuZCAnd2lsbC1yZWRpcmVjdCcgZXZlbnRzLCBtYW5hZ2luZyByZWRpcmVjdHMuXG5cdCAqL1xuXHRwcml2YXRlIG9uUmVkaXJlY3QoZXZlbnQ6IEV2ZW50LCB1cmw6IHN0cmluZykge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy50cmFjZShgUmVjZWl2ZWQgJ3dpbGwtbmF2aWdhdGUnIG9yICd3aWxsLXJlZGlyZWN0JyBldmVudCwgdXJsOiAke3VybH1gKTtcblxuXHRcdGNvbnN0IHBvbGljeUVycm9yID0gdGhpcy5nZXRVcmlQb2xpY3lFcnJvcih1cmwpO1xuXHRcdGlmIChwb2xpY3lFcnJvcikge1xuXHRcdFx0dGhpcy50cmFjZShgQmxvY2tpbmcgbmF2aWdhdGlvbiB0byAke3VybH06ICR7cG9saWN5RXJyb3J9YCk7XG5cdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0dGhpcy5fb25SZXN1bHQoeyBzdGF0dXM6ICdlcnJvcicsIGVycm9yOiBwb2xpY3lFcnJvciB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0b1VSSSA9IFVSSS5wYXJzZSh1cmwpO1xuXHRcdGlmICghdGhpcy5fb3B0aW9ucz8uZm9sbG93UmVkaXJlY3RzKSB7XG5cdFx0XHQvLyBBbGxvdyByZWRpcmVjdCBpZiBhdXRob3JpdHkgaXMgdGhlIHNhbWUgd2hlbiBpZ25vcmluZyB3d3cgcHJlZml4XG5cdFx0XHRpZiAodGhpcy5ub3JtYWxpemVBdXRob3JpdHkodG9VUkkuYXV0aG9yaXR5KSA9PT0gdGhpcy5ub3JtYWxpemVBdXRob3JpdHkodGhpcy5fdXJpLmF1dGhvcml0eSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBbGxvdyByZWRpcmVjdCBpZiB0YXJnZXQgaXMgYSB0cnVzdGVkIGRvbWFpblxuXHRcdFx0aWYgKHRoaXMuX2lzVHJ1c3RlZERvbWFpbih0b1VSSSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZ25vcmUgc2NyaXB0LWluaXRpYXRlZCBuYXZpZ2F0aW9uIChhZHMvdHJhY2tlcnMgZXRjKVxuXHRcdFx0aWYgKHRoaXMuX2RpZEZpbmlzaExvYWQpIHtcblx0XHRcdFx0dGhpcy50cmFjZShgQmxvY2tpbmcgcG9zdC1sb2FkIG5hdmlnYXRpb24gdG8gJHt1cmx9IChsaWtlbHkgYWQvdHJhY2tlciBzY3JpcHQpYCk7XG5cdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gT3RoZXJ3aXNlLCBwcmV2ZW50IHJlZGlyZWN0IGFuZCByZXBvcnQgaXRcblx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR0aGlzLl9vblJlc3VsdCh7IHN0YXR1czogJ3JlZGlyZWN0JywgdG9VUkkgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkZyYW1lTmF2aWdhdGUoZGV0YWlsczogRXZlbnQ8V2ViQ29udGVudHNXaWxsRnJhbWVOYXZpZ2F0ZUV2ZW50UGFyYW1zPik6IHZvaWQge1xuXHRcdGNvbnN0IHBvbGljeUVycm9yID0gdGhpcy5nZXRVcmlQb2xpY3lFcnJvcihkZXRhaWxzLnVybCk7XG5cdFx0aWYgKHBvbGljeUVycm9yKSB7XG5cdFx0XHR0aGlzLnRyYWNlKGBCbG9ja2luZyBmcmFtZSBuYXZpZ2F0aW9uIHRvICR7ZGV0YWlscy51cmx9OiAke3BvbGljeUVycm9yfWApO1xuXHRcdFx0ZGV0YWlscy5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBOb3JtYWxpemVzIGFuIGF1dGhvcml0eSBieSByZW1vdmluZyB0aGUgJ3d3dy4nIHByZWZpeCBpZiBwcmVzZW50LlxuXHQgKi9cblx0cHJpdmF0ZSBub3JtYWxpemVBdXRob3JpdHkoYXV0aG9yaXR5OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBhdXRob3JpdHkudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9ed3d3XFwuLywgJycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZXMgZGVidWdnZXIgbWVzc2FnZXMgcmVsYXRlZCB0byBuZXR3b3JrIHJlcXVlc3RzLCB0cmFja2luZyB0aGVpciBsaWZlY3ljbGUuXG5cdCAqIEBub3RlIERPIE5PVCBhZGQgbG9nZ2luZyB0byB0aGlzIGZ1bmN0aW9uLCBtaWNyb3NvZnQuY29tIHdpbGwgZnJlZXplIHdoZW4gdG9vIG1hbnkgbG9ncyBhcmUgZ2VuZXJhdGVkXG5cdCAqL1xuXHRwcml2YXRlIG9uRGVidWdNZXNzYWdlKF9ldmVudDogRXZlbnQsIG1ldGhvZDogc3RyaW5nLCBwYXJhbXM6IE5ldHdvcmtSZXF1ZXN0RXZlbnRQYXJhbXMpIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgcmVxdWVzdElkLCB0eXBlLCByZXNwb25zZSB9ID0gcGFyYW1zO1xuXHRcdHN3aXRjaCAobWV0aG9kKSB7XG5cdFx0XHRjYXNlICdOZXR3b3JrLnJlcXVlc3RXaWxsQmVTZW50Jzpcblx0XHRcdFx0aWYgKHJlcXVlc3RJZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVxdWVzdHMuYWRkKHJlcXVlc3RJZCk7XG5cdFx0XHRcdFx0dGhpcy5faWRsZURlYm91bmNlVGltZXIuY2FuY2VsKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdOZXR3b3JrLmxvYWRpbmdGaW5pc2hlZCc6XG5cdFx0XHRjYXNlICdOZXR3b3JrLmxvYWRpbmdGYWlsZWQnOlxuXHRcdFx0XHRpZiAocmVxdWVzdElkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9yZXF1ZXN0cy5kZWxldGUocmVxdWVzdElkKTtcblx0XHRcdFx0XHRpZiAodGhpcy5fcmVxdWVzdHMuc2l6ZSA9PT0gMCAmJiB0aGlzLl9kaWRGaW5pc2hMb2FkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnNjaGVkdWxlSWRsZUNoZWNrKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnTmV0d29yay5yZXNwb25zZVJlY2VpdmVkJzpcblx0XHRcdFx0aWYgKHR5cGUgPT09ICdEb2N1bWVudCcpIHtcblx0XHRcdFx0XHRjb25zdCBzdGF0dXNDb2RlID0gcmVzcG9uc2U/LnN0YXR1cyA/PyAwO1xuXHRcdFx0XHRcdGlmIChzdGF0dXNDb2RlID49IDQwMCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZXJyb3IgPSByZXNwb25zZT8uc3RhdHVzVGV4dCB8fCBgSFRUUCBlcnJvciAke3N0YXR1c0NvZGV9YDtcblx0XHRcdFx0XHRcdHZvaWQgdGhpcy5fcXVldWUucXVldWUoKCkgPT4gdGhpcy5leHRyYWN0Q29udGVudCh7IHN0YXR1czogJ2Vycm9yJywgc3RhdHVzQ29kZSwgZXJyb3IgfSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU2NoZWR1bGVzIGFuIGlkbGUgY2hlY2sgYWZ0ZXIgYSBkZWJvdW5jZSBwZXJpb2QgdG8gYWxsb3cgZm9yIGJ1cnN0cyBvZiBuZXR3b3JrIGFjdGl2aXR5LlxuXHQgKiBJZiBpZGxlIGlzIGRldGVjdGVkLCBwcm9jZWVkcyB0byBleHRyYWN0IGNvbnRlbnQuXG5cdCAqL1xuXHRwcml2YXRlIHNjaGVkdWxlSWRsZUNoZWNrKCkge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5faWRsZURlYm91bmNlVGltZXIuY2FuY2VsQW5kU2V0KGFzeW5jICgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgdGhpcy5uZXh0RnJhbWUoKTtcblxuXHRcdFx0aWYgKHRoaXMuX3JlcXVlc3RzLnNpemUgPT09IDApIHtcblx0XHRcdFx0dGhpcy5fcXVldWUucXVldWUoKCkgPT4gdGhpcy5leHRyYWN0Q29udGVudCgpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMudHJhY2UoYE5ldyBuZXR3b3JrIHJlcXVlc3RzIGRldGVjdGVkLCBkZWZlcnJpbmcgY29udGVudCBleHRyYWN0aW9uYCk7XG5cdFx0XHR9XG5cdFx0fSwgV2ViUGFnZUxvYWRlci5JRExFX0RFQk9VTkNFX1RJTUUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdhaXRzIGZvciBhIHJlbmRlcmluZyBmcmFtZSB0byBlbnN1cmUgdGhlIHBhZ2UgaGFkIGEgY2hhbmNlIHRvIHVwZGF0ZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgbmV4dEZyYW1lKCkge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gV2FpdCBmb3IgYSByZW5kZXJpbmcgZnJhbWUgdG8gZW5zdXJlIHRoZSBwYWdlIGhhZCBhIGNoYW5jZSB0byB1cGRhdGUuXG5cdFx0YXdhaXQgcmFjZVRpbWVvdXQoXG5cdFx0XHRuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHRoaXMudHJhY2UoYFdhaXRpbmcgZm9yIGEgZnJhbWUgdG8gYmUgcmVuZGVyZWRgKTtcblx0XHRcdFx0XHR0aGlzLl93aW5kb3cud2ViQ29udGVudHMuYmVnaW5GcmFtZVN1YnNjcmlwdGlvbihmYWxzZSwgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0dGhpcy50cmFjZShgQSBmcmFtZSBoYXMgYmVlbiByZW5kZXJlZGApO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl93aW5kb3cud2ViQ29udGVudHMuZW5kRnJhbWVTdWJzY3JpcHRpb24oKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdFx0XHQvLyBpZ25vcmUgZXJyb3JzXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdC8vIGlnbm9yZSBlcnJvcnNcblx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pLFxuXHRcdFx0V2ViUGFnZUxvYWRlci5GUkFNRV9USU1FT1VUXG5cdFx0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFeHRyYWN0cyB0aGUgY29udGVudCBvZiB0aGUgbG9hZGVkIHdlYiBwYWdlIHVzaW5nIHRoZSBBY2Nlc3NpYmlsaXR5IGRvbWFpbiBhbmQgcmVwb3J0cyB0aGUgcmVzdWx0LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBleHRyYWN0Q29udGVudChlcnJvclJlc3VsdD86IFdlYkNvbnRlbnRFeHRyYWN0UmVzdWx0ICYgeyBzdGF0dXM6ICdlcnJvcicgfSkge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHRpdGxlID0gdGhpcy5fd2luZG93LndlYkNvbnRlbnRzLmdldFRpdGxlKCk7XG5cblx0XHRcdGxldCByZXN1bHQgPSAnJztcblx0XHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgcmFjZVRpbWVvdXQoKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHQvLyBJZiB0aGUgc2VydmVyIHJldHVybmVkIHRleHQvbWFya2Rvd24sIHRoZSBkb2N1bWVudCBpcyBhbHJlYWR5IHBsYWluIHRleHQuXG5cdFx0XHRcdFx0Ly8gRXh0cmFjdCBpdCBkaXJlY3RseSBmcm9tIHRoZSBkb2N1bWVudCBpbnN0ZWFkIG9mIHJ1bm5pbmcgYWNjZXNzaWJpbGl0eS9ET00gaGV1cmlzdGljcy5cblx0XHRcdFx0XHRpZiAodGhpcy5fcmVjZWl2ZWRNYXJrZG93bikge1xuXHRcdFx0XHRcdFx0dGhpcy50cmFjZSgnRXh0cmFjdGluZyBtYXJrZG93biB0ZXh0IGNvbnRlbnQgZnJvbSBkb2N1bWVudCcpO1xuXHRcdFx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5fd2luZG93LndlYkNvbnRlbnRzLmV4ZWN1dGVKYXZhU2NyaXB0KCdkb2N1bWVudC5ib2R5Py50ZXh0Q29udGVudCA/PyBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ/LnRleHRDb250ZW50ID8/IFwiXCInKSA/PyAnJztcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoIWN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5leHRyYWN0QWNjZXNzaWJpbGl0eVRyZWVDb250ZW50KGN0cy50b2tlbikgPz8gJyc7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKCFjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgJiYgcmVzdWx0Lmxlbmd0aCA8IFdlYlBhZ2VMb2FkZXIuTUlOX0NPTlRFTlRfTEVOR1RIKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnRyYWNlKGBBY2Nlc3NpYmlsaXR5IHRyZWUgZXh0cmFjdGlvbiB5aWVsZGVkIGluc3VmZmljaWVudCBjb250ZW50LCB0cnlpbmcgbWFpbiBET00gZWxlbWVudCBleHRyYWN0aW9uYCk7XG5cdFx0XHRcdFx0XHRjb25zdCBkb21Db250ZW50ID0gYXdhaXQgdGhpcy5leHRyYWN0TWFpbkRvbUVsZW1lbnRDb250ZW50KCkgPz8gJyc7XG5cdFx0XHRcdFx0XHRyZXN1bHQgPSBkb21Db250ZW50Lmxlbmd0aCA+IHJlc3VsdC5sZW5ndGggPyBkb21Db250ZW50IDogcmVzdWx0O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkoKSwgV2ViUGFnZUxvYWRlci5FWFRSQUNUX0NPTlRFTlRfVElNRU9VVCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRjdHMuY2FuY2VsKCk7XG5cdFx0XHRcdGN0cy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXN1bHQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuX29uUmVzdWx0KHsgc3RhdHVzOiAnZXJyb3InLCBlcnJvcjogJ0ZhaWxlZCB0byBleHRyYWN0IG1lYW5pbmdmdWwgY29udGVudCBmcm9tIHRoZSB3ZWIgcGFnZScgfSk7XG5cdFx0XHR9IGVsc2UgaWYgKGVycm9yUmVzdWx0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5fb25SZXN1bHQoeyAuLi5lcnJvclJlc3VsdCwgcmVzdWx0LCB0aXRsZSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX29uUmVzdWx0KHsgc3RhdHVzOiAnb2snLCByZXN1bHQsIHRpdGxlIH0pO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGlmIChlcnJvclJlc3VsdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuX29uUmVzdWx0KGVycm9yUmVzdWx0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX29uUmVzdWx0KHtcblx0XHRcdFx0XHRzdGF0dXM6ICdlcnJvcicsXG5cdFx0XHRcdFx0ZXJyb3I6IGUgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IFN0cmluZyhlKVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRXh0cmFjdHMgY29udGVudCBmcm9tIHRoZSBBY2Nlc3NpYmlsaXR5IHRyZWUgb2YgdGhlIGxvYWRlZCB3ZWIgcGFnZS5cblx0ICogQHBhcmFtIHRva2VuIENhbmNlbGxhdGlvbiB0b2tlbiB0byBhYm9ydCB0aGUgb3BlcmF0aW9uLlxuXHQgKiBAcmV0dXJuIFRoZSBleHRyYWN0ZWQgY29udGVudCwgb3IgdW5kZWZpbmVkIGlmIGV4dHJhY3Rpb24gZmFpbHMgb3IgaXMgY2FuY2VsbGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBleHRyYWN0QWNjZXNzaWJpbGl0eVRyZWVDb250ZW50KHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy50cmFjZShgRXh0cmFjdGluZyBjb250ZW50IHVzaW5nIEFjY2Vzc2liaWxpdHkgZG9tYWluYCk7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIEVuYWJsZSB0aGUgUGFnZSBkb21haW4gdG8gZ2V0IGZyYW1lIGluZm9ybWF0aW9uXG5cdFx0XHRhd2FpdCB0aGlzLl9kZWJ1Z2dlci5zZW5kQ29tbWFuZCgnUGFnZS5lbmFibGUnKTtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBHZXQgYWxsIGZyYW1lcyBpbmNsdWRpbmcgaWZyYW1lc1xuXHRcdFx0Y29uc3QgeyBmcmFtZVRyZWUgfSA9IGF3YWl0IHRoaXMuX2RlYnVnZ2VyLnNlbmRDb21tYW5kKCdQYWdlLmdldEZyYW1lVHJlZScpIGFzIHsgZnJhbWVUcmVlOiBGcmFtZVRyZWVOb2RlIH07XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZnJhbWVOb2RlczogRnJhbWVUcmVlTm9kZVtdID0gW107XG5cdFx0XHRjb25zdCBwZW5kaW5nRnJhbWVOb2RlcyA9IFtmcmFtZVRyZWVdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBwZW5kaW5nRnJhbWVOb2Rlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBmcmFtZU5vZGUgPSBwZW5kaW5nRnJhbWVOb2Rlc1tpXTtcblx0XHRcdFx0aWYgKGZyYW1lTm9kZS5mcmFtZS51cmwgJiYgdGhpcy5nZXRVcmlQb2xpY3lFcnJvcihmcmFtZU5vZGUuZnJhbWUudXJsKSkge1xuXHRcdFx0XHRcdHRoaXMudHJhY2UoYFNraXBwaW5nIGJsb2NrZWQgZnJhbWUgY29udGVudCBmcm9tICR7ZnJhbWVOb2RlLmZyYW1lLnVybH1gKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmcmFtZU5vZGVzLnB1c2goZnJhbWVOb2RlKTtcblx0XHRcdFx0cGVuZGluZ0ZyYW1lTm9kZXMucHVzaCguLi5mcmFtZU5vZGUuY2hpbGRGcmFtZXMgPz8gW10pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDb2xsZWN0IGFjY2Vzc2liaWxpdHkgbm9kZXMgZnJvbSBhbGwgZnJhbWVzXG5cdFx0XHRjb25zdCBhbGxOb2RlczogQVhOb2RlW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgeyBmcmFtZSB9IG9mIGZyYW1lTm9kZXMpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCB7IG5vZGVzIH0gPSBhd2FpdCB0aGlzLl9kZWJ1Z2dlci5zZW5kQ29tbWFuZCgnQWNjZXNzaWJpbGl0eS5nZXRGdWxsQVhUcmVlJywgeyBmcmFtZUlkOiBmcmFtZS5pZCB9KSBhcyB7IG5vZGVzOiBBWE5vZGVbXSB9O1xuXHRcdFx0XHRcdGFsbE5vZGVzLnB1c2goLi4ubm9kZXMpO1xuXHRcdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdC8vIGlnbm9yZVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBjb252ZXJ0QVhUcmVlVG9NYXJrZG93bih0aGlzLl91cmksIGFsbE5vZGVzKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy50cmFjZShgQWNjZXNzaWJpbGl0eSB0cmVlIGV4dHJhY3Rpb24gZmFpbGVkOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEZhbGxiYWNrIG1ldGhvZCBmb3IgZXh0cmFjdGluZyB3ZWIgcGFnZSBjb250ZW50IHdoZW4gQWNjZXNzaWJpbGl0eSB0cmVlIGV4dHJhY3Rpb24geWllbGRzIGluc3VmZmljaWVudCBjb250ZW50LlxuXHQgKiBBdHRlbXB0cyB0byBleHRyYWN0IG1lYW5pbmdmdWwgdGV4dCBjb250ZW50IGZyb20gdGhlIG1haW4gRE9NIGVsZW1lbnRzIG9mIHRoZSBsb2FkZWQgd2ViIHBhZ2UuXG5cdCAqIEByZXR1cm5zIFRoZSBleHRyYWN0ZWQgdGV4dCBjb250ZW50LCBvciB1bmRlZmluZWQgaWYgZXh0cmFjdGlvbiBmYWlscy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgZXh0cmFjdE1haW5Eb21FbGVtZW50Q29udGVudCgpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLnRyYWNlKGBFeHRyYWN0aW5nIGNvbnRlbnQgZnJvbSBtYWluIERPTSBlbGVtZW50YCk7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fd2luZG93LndlYkNvbnRlbnRzLmV4ZWN1dGVKYXZhU2NyaXB0KGBcblx0XHRcdFx0KCgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBzZWxlY3RvcnMgPSBbJ21haW4nLCdhcnRpY2xlJywnW3JvbGU9XCJtYWluXCJdJywnLm1haW4tY29udGVudCcsJyNtYWluLWNvbnRlbnQnLCcuYXJ0aWNsZS1ib2R5JywnLnBvc3QtY29udGVudCcsJy5lbnRyeS1jb250ZW50JywnLmNvbnRlbnQnLCdib2R5J107XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBzZWxlY3RvciBvZiBzZWxlY3RvcnMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKT8udGV4dENvbnRlbnQ/LnJlcGxhY2UoL1sgXFxcXHRdKy9nLCAnICcpLnJlcGxhY2UoL1xcXFxzezIsfS9nbSwgJ1xcXFxuJykudHJpbSgpO1xuXHRcdFx0XHRcdFx0aWYgKGNvbnRlbnQgJiYgY29udGVudC5sZW5ndGggPiAke1dlYlBhZ2VMb2FkZXIuTUlOX0NPTlRFTlRfTEVOR1RIfSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gY29udGVudDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fSkoKTtcblx0XHRcdGApO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLnRyYWNlKGBET00gZXh0cmFjdGlvbiBmYWlsZWQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsT0FBTyxhQUFhLG9CQUFvQjtBQUNqRCxTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxZQUFZLG9CQUFvQjtBQUN6QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0JBQWdCO0FBSXpCLFNBQWlCLCtCQUErQjtBQXVCekMsTUFBTSxpQkFBTixNQUFNLHVCQUFzQixXQUFXO0FBQUEsRUFrQjdDLFlBQ0Msc0JBQ2lCLFNBQ0EsTUFDQSxVQUNBLGtCQUNBLDRCQUNoQjtBQUNELFVBQU07QUFOVztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBZGxCLFNBQWlCLFlBQVksb0JBQUksSUFBWTtBQUM3QyxTQUFpQixTQUFTLEtBQUssVUFBVSxJQUFJLE1BQU0sQ0FBQztBQUNwRCxTQUFpQixXQUFXLEtBQUssVUFBVSxJQUFJLGFBQWEsQ0FBQztBQUM3RCxTQUFpQixxQkFBcUIsS0FBSyxVQUFVLElBQUksYUFBYSxDQUFDO0FBQ3ZFLFNBQVEsWUFBWSxDQUFDLFlBQXFDO0FBQUEsSUFBRTtBQUM1RCxTQUFRLGlCQUFpQjtBQUN6QixTQUFRLG9CQUFvQjtBQVkzQixTQUFLLFVBQVUscUJBQXFCO0FBQUEsTUFDbkMsT0FBTztBQUFBLE1BQ1AsUUFBUTtBQUFBLE1BQ1IsTUFBTTtBQUFBLE1BQ04sZ0JBQWdCO0FBQUEsUUFDZixXQUFXLGFBQWE7QUFBQTtBQUFBLFFBQ3hCLFlBQVk7QUFBQSxRQUNaLFdBQVc7QUFBQSxRQUNYLFNBQVM7QUFBQSxRQUNULE9BQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxVQUFVLGFBQWEsTUFBTSxLQUFLLFFBQVEsUUFBUSxDQUFDLENBQUM7QUFFekQsU0FBSyxRQUFRLFlBQVkscUJBQXFCLE9BQU8sRUFBRSxRQUFRLE9BQU8sRUFBRTtBQUV4RSxTQUFLLFlBQVksS0FBSyxRQUFRLFlBQVk7QUFDMUMsU0FBSyxVQUFVLE9BQU8sS0FBSztBQUMzQixTQUFLLFVBQVUsR0FBRyxXQUFXLEtBQUssZUFBZSxLQUFLLElBQUksQ0FBQztBQUUzRCxTQUFLLFFBQVEsWUFDWCxLQUFLLHFCQUFxQixLQUFLLGVBQWUsS0FBSyxJQUFJLENBQUMsRUFDeEQsS0FBSyxtQkFBbUIsS0FBSyxhQUFhLEtBQUssSUFBSSxDQUFDLEVBQ3BELEtBQUssaUJBQWlCLEtBQUssV0FBVyxLQUFLLElBQUksQ0FBQyxFQUNoRCxHQUFHLHVCQUF1QixLQUFLLGdCQUFnQixLQUFLLElBQUksQ0FBQyxFQUN6RCxHQUFHLGlCQUFpQixLQUFLLFdBQVcsS0FBSyxJQUFJLENBQUMsRUFDOUMsR0FBRyxpQkFBaUIsS0FBSyxXQUFXLEtBQUssSUFBSSxDQUFDLEVBQzlDLEdBQUcsNkJBQTZCLENBQUMsVUFBVSxNQUFNLGVBQWUsQ0FBQztBQUVuRSxTQUFLLFFBQVEsWUFBWSxRQUFRLFdBQVc7QUFBQSxNQUMzQyxLQUFLLGdCQUFnQixLQUFLLElBQUk7QUFBQSxJQUFDO0FBRWhDLFNBQUssUUFBUSxZQUFZLFFBQVEsV0FBVztBQUFBLE1BQzNDLEtBQUssb0JBQW9CLEtBQUssSUFBSTtBQUFBLElBQUM7QUFFcEMsU0FBSyxRQUFRLFlBQVksUUFBUSxXQUFXO0FBQUEsTUFDM0MsS0FBSyxrQkFBa0IsS0FBSyxJQUFJO0FBQUEsSUFBQztBQUVsQyxTQUFLLFFBQVEsWUFBWSxRQUFRLEdBQUcsaUJBQWlCLEtBQUssV0FBVyxLQUFLLElBQUksQ0FBQztBQUFBLEVBQ2hGO0FBQUEsRUFFUSxNQUFNLFNBQWlCO0FBQzlCLFNBQUssUUFBUSxNQUFNLG9CQUFvQixLQUFLLElBQUksS0FBSyxPQUFPLEVBQUU7QUFBQSxFQUMvRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsTUFBYSxPQUFPO0FBQ25CLFdBQU8sTUFBTSxJQUFJLFFBQWlDLENBQUMsWUFBWTtBQUM5RCxXQUFLLFlBQVkseUJBQXlCLENBQUMsV0FBVztBQUNyRCxnQkFBUSxPQUFPLFFBQVE7QUFBQSxVQUN0QixLQUFLO0FBQ0osaUJBQUssTUFBTSxvQ0FBb0MsT0FBTyxNQUFNLGFBQWEsT0FBTyxLQUFLLGNBQWMsT0FBTyxPQUFPLE1BQU0sRUFBRTtBQUN6SDtBQUFBLFVBQ0QsS0FBSztBQUNKLGlCQUFLLE1BQU0sb0NBQW9DLE9BQU8sTUFBTSxZQUFZLE9BQU8sS0FBSyxFQUFFO0FBQ3RGO0FBQUEsVUFDRCxLQUFLO0FBQ0osaUJBQUssTUFBTSxvQ0FBb0MsT0FBTyxNQUFNLFdBQVcsT0FBTyxVQUFVLGFBQWEsT0FBTyxLQUFLLGNBQWMsT0FBTyxLQUFLLGNBQWMsT0FBTyxRQUFRLFVBQVUsQ0FBQyxFQUFFO0FBQ3JMO0FBQUEsUUFDRjtBQUVBLGNBQU0sVUFBVSxPQUFPLFdBQVcsYUFBYSxPQUFPLFNBQVM7QUFDL0QsWUFBSSxZQUFZLFFBQVc7QUFDMUIsZUFBSyxNQUFNLFFBQVEsU0FBUyxNQUFNLHVCQUF1QixPQUFPLE1BQU0sK0JBQStCLFFBQVEsVUFBVSxHQUFHLEdBQUcsQ0FBQyxNQUFNO0FBQUEsUUFDckk7QUFFQSxnQkFBUSxNQUFNO0FBQ2QsYUFBSyxRQUFRO0FBQUEsTUFDZCxDQUFDO0FBRUQsV0FBSyxNQUFNLDBCQUEwQjtBQUNyQyxXQUFLLEtBQUssUUFBUSxRQUFRLEtBQUssS0FBSyxTQUFTLElBQUksQ0FBQztBQUNsRCxXQUFLLFdBQVcsZUFBYyxPQUFPO0FBQUEsSUFDdEMsQ0FBQztBQUFBLEVBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLFdBQVcsTUFBYztBQUNoQyxRQUFJLEtBQUssT0FBTyxZQUFZO0FBQzNCO0FBQUEsSUFDRDtBQUVBLFNBQUssTUFBTSxnQ0FBZ0MsSUFBSSxLQUFLO0FBQ3BELFNBQUssU0FBUyxhQUFhLE1BQU07QUFDaEMsV0FBSyxNQUFNLDJCQUEyQjtBQUN0QyxXQUFLLEtBQUssT0FBTyxNQUFNLE1BQU0sS0FBSyxlQUFlLENBQUM7QUFBQSxJQUNuRCxHQUFHLElBQUk7QUFBQSxFQUNSO0FBQUEsRUFFUSxrQkFBa0IsS0FBaUM7QUFDMUQsUUFBSTtBQUNKLFFBQUk7QUFDSCxZQUFNLElBQUksTUFBTSxLQUFLLElBQUk7QUFBQSxJQUMxQixRQUFRO0FBQ1AsYUFBTyxTQUFTLDRCQUE0Qiw4Q0FBOEM7QUFBQSxJQUMzRjtBQUVBLFFBQUksSUFBSSxXQUFXLFFBQVEsUUFBUSxJQUFJLFdBQVcsUUFBUSxTQUFTLElBQUksV0FBVyxRQUFRLElBQUksV0FBVyxPQUFPO0FBQy9HLGFBQU8sS0FBSywyQkFBMkIsYUFBYSxHQUFHLElBQ3BELFNBQ0EsS0FBSywyQkFBMkIsWUFBWSxHQUFHO0FBQUEsSUFDbkQ7QUFFQSxRQUNFLElBQUksV0FBVyxXQUFXLElBQUksU0FBUyxXQUN4QyxJQUFJLFdBQVcsUUFBUSxRQUN2QixJQUFJLFdBQVcsUUFDZDtBQUNELGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTyxTQUFTLHNDQUFzQyxzREFBc0QsSUFBSSxNQUFNO0FBQUEsRUFDdkg7QUFBQSxFQUVRLGdCQUFnQixTQUF5QyxVQUFzRDtBQUN0SCxVQUFNLFFBQVEsS0FBSyxrQkFBa0IsUUFBUSxHQUFHO0FBQ2hELFFBQUksT0FBTztBQUNWLFdBQUssTUFBTSx1QkFBdUIsUUFBUSxHQUFHLEtBQUssS0FBSyxFQUFFO0FBQUEsSUFDMUQ7QUFDQSxhQUFTLEVBQUUsUUFBUSxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQUEsRUFDN0I7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLG9CQUFvQixTQUE2QyxVQUE0RDtBQUNwSSxVQUFNLFVBQVUsRUFBRSxHQUFHLFFBQVEsZUFBZTtBQUc1QyxZQUFRLEtBQUssSUFBSTtBQUNqQixZQUFRLFNBQVMsSUFBSTtBQUlyQixRQUFJLFFBQVEsaUJBQWlCLGFBQWE7QUFDekMsY0FBUSxRQUFRLElBQUk7QUFBQSxJQUNyQjtBQUVBLGFBQVMsRUFBRSxnQkFBZ0IsUUFBUSxDQUFDO0FBQUEsRUFDckM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPUSxrQkFBa0IsU0FBMkMsVUFBc0U7QUFDMUksVUFBTSxVQUFVLFFBQVE7QUFDeEIsUUFBSSxTQUFTO0FBQ1osVUFBSSxnQkFBZ0I7QUFDcEIsVUFBSTtBQUNKLFVBQUk7QUFFSixpQkFBVyxRQUFRLE9BQU8sS0FBSyxPQUFPLEdBQUc7QUFDeEMsY0FBTSxZQUFZLEtBQUssWUFBWTtBQUNuQyxZQUFJLGNBQWMseUJBQXlCLFFBQVEsSUFBSSxHQUFHLEtBQUssT0FBSyxFQUFFLFlBQVksRUFBRSxTQUFTLFlBQVksQ0FBQyxHQUFHO0FBQzVHLDBCQUFnQjtBQUNoQixpQ0FBdUI7QUFBQSxRQUN4QjtBQUNBLFlBQUksY0FBYyxnQkFBZ0I7QUFDakMsd0JBQWMsUUFBUSxJQUFJLElBQUksQ0FBQyxHQUFHLFlBQVk7QUFBQSxRQUMvQztBQUFBLE1BQ0Q7QUFHQSxVQUFJLFFBQVEsaUJBQWlCLGFBQWE7QUFDekMsYUFBSyxvQkFBb0IsYUFBYSxNQUFNLEdBQUcsRUFBRSxDQUFDLEVBQUUsS0FBSyxNQUFNO0FBQy9ELFlBQUksS0FBSyxtQkFBbUI7QUFDM0IsZUFBSyxNQUFNLDhFQUE4RTtBQUFBLFFBQzFGO0FBQUEsTUFDRDtBQUVBLFVBQUksaUJBQWlCLHNCQUFzQjtBQUMxQyxZQUFJLEtBQUssZUFBZSxXQUFXLEdBQUc7QUFDckMsZUFBSyxNQUFNLDZEQUE2RCxRQUFRLEdBQUcsbUJBQW1CLFdBQVcsR0FBRztBQUNwSCxrQkFBUSxvQkFBb0IsSUFBSSxDQUFDLFFBQVE7QUFDekMsbUJBQVMsRUFBRSxpQkFBaUIsU0FBUyxRQUFRLE1BQU0sQ0FBQztBQUFBLFFBQ3JELE9BQU87QUFDTixlQUFLLE1BQU0sMkVBQTJFLFdBQVcsU0FBUyxRQUFRLEdBQUcsRUFBRTtBQUN2SCxtQkFBUyxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBQUEsUUFDMUI7QUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsYUFBUyxFQUFFLFFBQVEsTUFBTSxDQUFDO0FBQUEsRUFDM0I7QUFBQSxFQVFRLGVBQWUsYUFBMEM7QUFDaEUsVUFBTSxXQUFXLGFBQWEsTUFBTSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEtBQUs7QUFDakQsV0FBTyxDQUFDLENBQUMsWUFBWSxlQUFjLGtCQUFrQixLQUFLLFFBQVE7QUFBQSxFQUNuRTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1EsV0FBVyxRQUFlLE1BQTZCO0FBQzlELFVBQU0sV0FBVyxLQUFLLFlBQVk7QUFDbEMsU0FBSyxNQUFNLHFCQUFxQixRQUFRLEVBQUU7QUFDMUMsU0FBSyxPQUFPO0FBQ1osU0FBSyxLQUFLLE9BQU8sTUFBTSxNQUFNLEtBQUssZUFBZSxFQUFFLFFBQVEsU0FBUyxPQUFPLHlCQUF5QixRQUFRLEdBQUcsQ0FBQyxDQUFDO0FBQUEsRUFDbEg7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLGlCQUFpQjtBQUN4QixRQUFJLEtBQUssT0FBTyxZQUFZO0FBQzNCO0FBQUEsSUFDRDtBQUVBLFNBQUssTUFBTSxvQ0FBb0M7QUFDL0MsU0FBSyxLQUFLLFVBQVUsWUFBWSxnQkFBZ0IsRUFBRSxNQUFNLE1BQU07QUFBQSxJQUU5RCxDQUFDO0FBQUEsRUFDRjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNUSxlQUFlO0FBQ3RCLFFBQUksS0FBSyxPQUFPLFlBQVk7QUFDM0I7QUFBQSxJQUNEO0FBRUEsU0FBSyxNQUFNLGtDQUFrQztBQUM3QyxTQUFLLGlCQUFpQjtBQUN0QixTQUFLLGtCQUFrQjtBQUN2QixTQUFLLFdBQVcsZUFBYyxpQkFBaUI7QUFBQSxFQUNoRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1EsV0FBVyxRQUFlLFlBQW9CLE9BQWU7QUFDcEUsUUFBSSxLQUFLLE9BQU8sWUFBWTtBQUMzQjtBQUFBLElBQ0Q7QUFFQSxTQUFLLE1BQU0seUNBQXlDLFVBQVUsYUFBYSxLQUFLLEdBQUc7QUFDbkYsUUFBSSxlQUFlLElBQUk7QUFDdEIsV0FBSyxNQUFNLHdFQUF3RTtBQUNuRixXQUFLLEtBQUssT0FBTyxNQUFNLE1BQU0sS0FBSyxlQUFlLENBQUM7QUFBQSxJQUNuRCxXQUFXLGVBQWUsS0FBSztBQUM5QixXQUFLLE1BQU0sK0ZBQStGO0FBQzFHLFdBQUssS0FBSyxPQUFPLE1BQU0sTUFBTSxLQUFLLGVBQWUsQ0FBQztBQUFBLElBQ25ELE9BQU87QUFDTixXQUFLLEtBQUssT0FBTyxNQUFNLE1BQU0sS0FBSyxlQUFlLEVBQUUsUUFBUSxTQUFTLFlBQVksTUFBTSxDQUFDLENBQUM7QUFBQSxJQUN6RjtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLFdBQVcsT0FBYyxLQUFhO0FBQzdDLFFBQUksS0FBSyxPQUFPLFlBQVk7QUFDM0I7QUFBQSxJQUNEO0FBRUEsU0FBSyxNQUFNLDJEQUEyRCxHQUFHLEVBQUU7QUFFM0UsVUFBTSxjQUFjLEtBQUssa0JBQWtCLEdBQUc7QUFDOUMsUUFBSSxhQUFhO0FBQ2hCLFdBQUssTUFBTSwwQkFBMEIsR0FBRyxLQUFLLFdBQVcsRUFBRTtBQUMxRCxZQUFNLGVBQWU7QUFDckIsV0FBSyxVQUFVLEVBQUUsUUFBUSxTQUFTLE9BQU8sWUFBWSxDQUFDO0FBQ3REO0FBQUEsSUFDRDtBQUVBLFVBQU0sUUFBUSxJQUFJLE1BQU0sR0FBRztBQUMzQixRQUFJLENBQUMsS0FBSyxVQUFVLGlCQUFpQjtBQUVwQyxVQUFJLEtBQUssbUJBQW1CLE1BQU0sU0FBUyxNQUFNLEtBQUssbUJBQW1CLEtBQUssS0FBSyxTQUFTLEdBQUc7QUFDOUY7QUFBQSxNQUNEO0FBR0EsVUFBSSxLQUFLLGlCQUFpQixLQUFLLEdBQUc7QUFDakM7QUFBQSxNQUNEO0FBR0EsVUFBSSxLQUFLLGdCQUFnQjtBQUN4QixhQUFLLE1BQU0sb0NBQW9DLEdBQUcsNkJBQTZCO0FBQy9FLGNBQU0sZUFBZTtBQUNyQjtBQUFBLE1BQ0Q7QUFHQSxZQUFNLGVBQWU7QUFDckIsV0FBSyxVQUFVLEVBQUUsUUFBUSxZQUFZLE1BQU0sQ0FBQztBQUFBLElBQzdDO0FBQUEsRUFDRDtBQUFBLEVBRVEsZ0JBQWdCLFNBQStEO0FBQ3RGLFVBQU0sY0FBYyxLQUFLLGtCQUFrQixRQUFRLEdBQUc7QUFDdEQsUUFBSSxhQUFhO0FBQ2hCLFdBQUssTUFBTSxnQ0FBZ0MsUUFBUSxHQUFHLEtBQUssV0FBVyxFQUFFO0FBQ3hFLGNBQVEsZUFBZTtBQUFBLElBQ3hCO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1EsbUJBQW1CLFdBQTJCO0FBQ3JELFdBQU8sVUFBVSxZQUFZLEVBQUUsUUFBUSxVQUFVLEVBQUU7QUFBQSxFQUNwRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNUSxlQUFlLFFBQWUsUUFBZ0IsUUFBbUM7QUFDeEYsUUFBSSxLQUFLLE9BQU8sWUFBWTtBQUMzQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLEVBQUUsV0FBVyxNQUFNLFNBQVMsSUFBSTtBQUN0QyxZQUFRLFFBQVE7QUFBQSxNQUNmLEtBQUs7QUFDSixZQUFJLGNBQWMsUUFBVztBQUM1QixlQUFLLFVBQVUsSUFBSSxTQUFTO0FBQzVCLGVBQUssbUJBQW1CLE9BQU87QUFBQSxRQUNoQztBQUNBO0FBQUEsTUFDRCxLQUFLO0FBQUEsTUFDTCxLQUFLO0FBQ0osWUFBSSxjQUFjLFFBQVc7QUFDNUIsZUFBSyxVQUFVLE9BQU8sU0FBUztBQUMvQixjQUFJLEtBQUssVUFBVSxTQUFTLEtBQUssS0FBSyxnQkFBZ0I7QUFDckQsaUJBQUssa0JBQWtCO0FBQUEsVUFDeEI7QUFBQSxRQUNEO0FBQ0E7QUFBQSxNQUNELEtBQUs7QUFDSixZQUFJLFNBQVMsWUFBWTtBQUN4QixnQkFBTSxhQUFhLFVBQVUsVUFBVTtBQUN2QyxjQUFJLGNBQWMsS0FBSztBQUN0QixrQkFBTSxRQUFRLFVBQVUsY0FBYyxjQUFjLFVBQVU7QUFDOUQsaUJBQUssS0FBSyxPQUFPLE1BQU0sTUFBTSxLQUFLLGVBQWUsRUFBRSxRQUFRLFNBQVMsWUFBWSxNQUFNLENBQUMsQ0FBQztBQUFBLFVBQ3pGO0FBQUEsUUFDRDtBQUNBO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTVEsb0JBQW9CO0FBQzNCLFFBQUksS0FBSyxPQUFPLFlBQVk7QUFDM0I7QUFBQSxJQUNEO0FBRUEsU0FBSyxtQkFBbUIsYUFBYSxZQUFZO0FBQ2hELFVBQUksS0FBSyxPQUFPLFlBQVk7QUFDM0I7QUFBQSxNQUNEO0FBRUEsWUFBTSxLQUFLLFVBQVU7QUFFckIsVUFBSSxLQUFLLFVBQVUsU0FBUyxHQUFHO0FBQzlCLGFBQUssT0FBTyxNQUFNLE1BQU0sS0FBSyxlQUFlLENBQUM7QUFBQSxNQUM5QyxPQUFPO0FBQ04sYUFBSyxNQUFNLDZEQUE2RDtBQUFBLE1BQ3pFO0FBQUEsSUFDRCxHQUFHLGVBQWMsa0JBQWtCO0FBQUEsRUFDcEM7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE1BQWMsWUFBWTtBQUN6QixRQUFJLEtBQUssT0FBTyxZQUFZO0FBQzNCO0FBQUEsSUFDRDtBQUdBLFVBQU07QUFBQSxNQUNMLElBQUksUUFBYyxDQUFDLFlBQVk7QUFDOUIsWUFBSTtBQUNILGVBQUssTUFBTSxvQ0FBb0M7QUFDL0MsZUFBSyxRQUFRLFlBQVksdUJBQXVCLE9BQU8sTUFBTTtBQUM1RCxnQkFBSTtBQUNILG1CQUFLLE1BQU0sMkJBQTJCO0FBQ3RDLG1CQUFLLFFBQVEsWUFBWSxxQkFBcUI7QUFBQSxZQUMvQyxRQUFRO0FBQUEsWUFFUjtBQUNBLG9CQUFRO0FBQUEsVUFDVCxDQUFDO0FBQUEsUUFDRixRQUFRO0FBRVAsa0JBQVE7QUFBQSxRQUNUO0FBQUEsTUFDRCxDQUFDO0FBQUEsTUFDRCxlQUFjO0FBQUEsSUFDZjtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE1BQWMsZUFBZSxhQUE2RDtBQUN6RixRQUFJLEtBQUssT0FBTyxZQUFZO0FBQzNCO0FBQUEsSUFDRDtBQUVBLFFBQUk7QUFDSCxZQUFNLFFBQVEsS0FBSyxRQUFRLFlBQVksU0FBUztBQUVoRCxVQUFJLFNBQVM7QUFDYixZQUFNLE1BQU0sSUFBSSx3QkFBd0I7QUFDeEMsVUFBSTtBQUNILGNBQU0sYUFBYSxZQUFZO0FBRzlCLGNBQUksS0FBSyxtQkFBbUI7QUFDM0IsaUJBQUssTUFBTSxnREFBZ0Q7QUFDM0QscUJBQVMsTUFBTSxLQUFLLFFBQVEsWUFBWSxrQkFBa0IsMkVBQTJFLEtBQUs7QUFDMUk7QUFBQSxVQUNEO0FBRUEsY0FBSSxDQUFDLElBQUksTUFBTSx5QkFBeUI7QUFDdkMscUJBQVMsTUFBTSxLQUFLLGdDQUFnQyxJQUFJLEtBQUssS0FBSztBQUFBLFVBQ25FO0FBRUEsY0FBSSxDQUFDLElBQUksTUFBTSwyQkFBMkIsT0FBTyxTQUFTLGVBQWMsb0JBQW9CO0FBQzNGLGlCQUFLLE1BQU0sZ0dBQWdHO0FBQzNHLGtCQUFNLGFBQWEsTUFBTSxLQUFLLDZCQUE2QixLQUFLO0FBQ2hFLHFCQUFTLFdBQVcsU0FBUyxPQUFPLFNBQVMsYUFBYTtBQUFBLFVBQzNEO0FBQUEsUUFDRCxHQUFHLEdBQUcsZUFBYyx1QkFBdUI7QUFBQSxNQUM1QyxVQUFFO0FBQ0QsWUFBSSxPQUFPO0FBQ1gsWUFBSSxRQUFRO0FBQUEsTUFDYjtBQUVBLFVBQUksT0FBTyxXQUFXLEdBQUc7QUFDeEIsYUFBSyxVQUFVLEVBQUUsUUFBUSxTQUFTLE9BQU8seURBQXlELENBQUM7QUFBQSxNQUNwRyxXQUFXLGdCQUFnQixRQUFXO0FBQ3JDLGFBQUssVUFBVSxFQUFFLEdBQUcsYUFBYSxRQUFRLE1BQU0sQ0FBQztBQUFBLE1BQ2pELE9BQU87QUFDTixhQUFLLFVBQVUsRUFBRSxRQUFRLE1BQU0sUUFBUSxNQUFNLENBQUM7QUFBQSxNQUMvQztBQUFBLElBQ0QsU0FBUyxHQUFHO0FBQ1gsVUFBSSxnQkFBZ0IsUUFBVztBQUM5QixhQUFLLFVBQVUsV0FBVztBQUFBLE1BQzNCLE9BQU87QUFDTixhQUFLLFVBQVU7QUFBQSxVQUNkLFFBQVE7QUFBQSxVQUNSLE9BQU8sYUFBYSxRQUFRLEVBQUUsVUFBVSxPQUFPLENBQUM7QUFBQSxRQUNqRCxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT0EsTUFBYyxnQ0FBZ0MsT0FBdUQ7QUFDcEcsU0FBSyxNQUFNLCtDQUErQztBQUMxRCxRQUFJO0FBRUgsWUFBTSxLQUFLLFVBQVUsWUFBWSxhQUFhO0FBQzlDLFVBQUksTUFBTSx5QkFBeUI7QUFDbEMsZUFBTztBQUFBLE1BQ1I7QUFHQSxZQUFNLEVBQUUsVUFBVSxJQUFJLE1BQU0sS0FBSyxVQUFVLFlBQVksbUJBQW1CO0FBQzFFLFVBQUksTUFBTSx5QkFBeUI7QUFDbEMsZUFBTztBQUFBLE1BQ1I7QUFFQSxZQUFNLGFBQThCLENBQUM7QUFDckMsWUFBTSxvQkFBb0IsQ0FBQyxTQUFTO0FBQ3BDLGVBQVMsSUFBSSxHQUFHLElBQUksa0JBQWtCLFFBQVEsS0FBSztBQUNsRCxjQUFNLFlBQVksa0JBQWtCLENBQUM7QUFDckMsWUFBSSxVQUFVLE1BQU0sT0FBTyxLQUFLLGtCQUFrQixVQUFVLE1BQU0sR0FBRyxHQUFHO0FBQ3ZFLGVBQUssTUFBTSx1Q0FBdUMsVUFBVSxNQUFNLEdBQUcsRUFBRTtBQUN2RTtBQUFBLFFBQ0Q7QUFDQSxtQkFBVyxLQUFLLFNBQVM7QUFDekIsMEJBQWtCLEtBQUssR0FBRyxVQUFVLGVBQWUsQ0FBQyxDQUFDO0FBQUEsTUFDdEQ7QUFHQSxZQUFNLFdBQXFCLENBQUM7QUFDNUIsaUJBQVcsRUFBRSxNQUFNLEtBQUssWUFBWTtBQUNuQyxZQUFJO0FBQ0gsZ0JBQU0sRUFBRSxNQUFNLElBQUksTUFBTSxLQUFLLFVBQVUsWUFBWSwrQkFBK0IsRUFBRSxTQUFTLE1BQU0sR0FBRyxDQUFDO0FBQ3ZHLG1CQUFTLEtBQUssR0FBRyxLQUFLO0FBQ3RCLGNBQUksTUFBTSx5QkFBeUI7QUFDbEMsbUJBQU87QUFBQSxVQUNSO0FBQUEsUUFDRCxRQUFRO0FBQUEsUUFFUjtBQUFBLE1BQ0Q7QUFFQSxhQUFPLHdCQUF3QixLQUFLLE1BQU0sUUFBUTtBQUFBLElBQ25ELFNBQVMsT0FBTztBQUNmLFdBQUssTUFBTSx5Q0FBeUMsaUJBQWlCLFFBQVEsTUFBTSxVQUFVLE9BQU8sS0FBSyxDQUFDLEVBQUU7QUFDNUcsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT0EsTUFBYywrQkFBNEQ7QUFDekUsUUFBSTtBQUNILFdBQUssTUFBTSwwQ0FBMEM7QUFDckQsYUFBTyxNQUFNLEtBQUssUUFBUSxZQUFZLGtCQUFrQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsd0NBS25CLGVBQWMsa0JBQWtCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBTXBFO0FBQUEsSUFDRixTQUFTLE9BQU87QUFDZixXQUFLLE1BQU0sMEJBQTBCLGlCQUFpQixRQUFRLE1BQU0sVUFBVSxPQUFPLEtBQUssQ0FBQyxFQUFFO0FBQzdGLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUNEO0FBaGtCYSxlQUNZLFVBQVU7QUFBQTtBQUR0QixlQUVZLG9CQUFvQjtBQUFBO0FBRmhDLGVBR1ksZ0JBQWdCO0FBQUE7QUFINUIsZUFJWSwwQkFBMEI7QUFBQTtBQUp0QyxlQUtZLHFCQUFxQjtBQUFBO0FBTGpDLGVBTVkscUJBQXFCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFOakMsZUFnT1ksb0JBQW9CO0FBaE90QyxJQUFNLGdCQUFOOyIsCiAgIm5hbWVzIjogW10KfQo=
