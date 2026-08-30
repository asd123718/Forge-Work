import { Disposable, DisposableMap } from "../../../base/common/lifecycle.js";
import { DeferredPromise, disposableTimeout, raceTimeout } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { PlaywrightTab, DialogInterruptedError } from "./playwrightTab.js";
import { generateUuid } from "../../../base/common/uuid.js";
const DEFERRED_RESULT_CLEANUP_MS = 5 * 6e4;
const SESSION_INACTIVITY_MS = 30 * 6e4;
const OPEN_PAGE_NAVIGATION_TIMEOUT_MS = 3e4;
function isCDPRequest(message) {
  const candidate = message;
  return typeof candidate.id === "number" && typeof candidate.method === "string" && (candidate.sessionId === void 0 || typeof candidate.sessionId === "string");
}
class PlaywrightService extends Disposable {
  constructor(windowId, browserViewGroupRemoteService, logService, agentNetworkFilterService, telemetryService) {
    super();
    this.windowId = windowId;
    this.browserViewGroupRemoteService = browserViewGroupRemoteService;
    this.logService = logService;
    this.agentNetworkFilterService = agentNetworkFilterService;
    this.telemetryService = telemetryService;
    this._sessions = this._register(new DisposableMap());
    /** In-flight session initializations keyed by session ID. */
    this._pendingInits = /* @__PURE__ */ new Map();
    /** Inactivity timers keyed by session ID. */
    this._inactivityTimers = this._register(new DisposableMap());
    /** Global set of tracked page IDs (shared across all sessions). */
    this._trackedPages = /* @__PURE__ */ new Set();
    this._onDidChangeTrackedPages = this._register(new Emitter());
    this.onDidChangeTrackedPages = this._onDidChangeTrackedPages.event;
  }
  /**
   * Get or create a fully-initialized {@link PlaywrightSession} for the
   * given session ID. Creates the CDP group and Playwright browser
   * connection if the session does not already exist.
   */
  async _getOrCreateSession(sessionId) {
    const existing = this._sessions.get(sessionId);
    if (existing) {
      this._touchSession(sessionId);
      return existing;
    }
    const pending = this._pendingInits.get(sessionId);
    if (pending) {
      return pending;
    }
    const initPromise = this._initSession(sessionId);
    this._pendingInits.set(sessionId, initPromise);
    try {
      return await initPromise;
    } finally {
      this._pendingInits.delete(sessionId);
    }
  }
  /**
   * Create and fully initialize a new session: browser view group,
   * Playwright CDP connection, and page replay.
   */
  async _initSession(sessionId) {
    this.logService.debug(`[PlaywrightService] Initializing session ${sessionId}`);
    const group = await this.browserViewGroupRemoteService.createGroup({ mainWindowId: this.windowId, sessionId });
    const actionScope = { activeCalls: 0 };
    let browser;
    try {
      const playwright = await import("playwright-core");
      const sub = group.onCDPMessage((msg) => transport.onmessage?.(msg));
      const transport = {
        close() {
          sub.dispose();
          this.onclose?.();
        },
        send: (rawMessage) => {
          if (!isCDPRequest(rawMessage)) {
            throw new Error(`[PlaywrightService] Unexpected CDP transport payload for session ${sessionId} (type: ${typeof rawMessage})`);
          }
          const message = rawMessage;
          if (actionScope.activeCalls === 0 && message.method.startsWith("Emulation.")) {
            setTimeout(() => {
              transport.onmessage?.({ id: message.id, result: {}, sessionId: message.sessionId });
            }, 1);
            return;
          }
          void group.sendCDPMessage(message);
        }
      };
      browser = await playwright.chromium.connectOverCDP(transport);
    } catch (e) {
      group.dispose();
      throw e;
    }
    this.logService.debug(`[PlaywrightService] Connected to browser for session ${sessionId}`);
    if (this._store.isDisposed) {
      browser.close().catch(() => {
      });
      group.dispose();
      throw new Error("PlaywrightService was disposed during initialization");
    }
    const session = new PlaywrightSession(
      sessionId,
      browser,
      group,
      actionScope,
      this.logService,
      this.agentNetworkFilterService,
      this.telemetryService,
      (viewId) => this.startTrackingPage(viewId)
    );
    session.registerDisposable(group.onDidAddView((e) => {
      if (!this._trackedPages.has(e.viewId)) {
        this._trackedPages.add(e.viewId);
        this._fireTrackedPages();
      }
      for (const [id, other] of this._sessions) {
        if (id !== sessionId) {
          void other.group.addView(e.viewId).catch(() => {
          });
        }
      }
    }));
    session.registerDisposable(group.onDidRemoveView((e) => {
      if (this._trackedPages.delete(e.viewId)) {
        this._fireTrackedPages();
      }
    }));
    browser.on("disconnected", () => {
      this.logService.debug(`[PlaywrightService] Browser disconnected for session ${sessionId}`);
      this._sessions.deleteAndDispose(sessionId);
      this._inactivityTimers.deleteAndDispose(sessionId);
    });
    this._sessions.set(sessionId, session);
    for (const viewId of [...this._trackedPages]) {
      try {
        await session.group.addView(viewId);
      } catch {
        this.logService.debug(`[PlaywrightService] Stale tracked page ${viewId} removed during replay`);
        this._trackedPages.delete(viewId);
        this._fireTrackedPages();
      }
    }
    this._touchSession(sessionId);
    return session;
  }
  // --- Page tracking (global) ---
  async startTrackingPage(viewId) {
    if (!this._trackedPages.has(viewId)) {
      this._trackedPages.add(viewId);
      this._fireTrackedPages();
    }
    for (const session of this._sessions.values()) {
      session.group.addView(viewId);
    }
  }
  async stopTrackingPage(viewId) {
    if (this._trackedPages.delete(viewId)) {
      this._fireTrackedPages();
    }
    for (const session of this._sessions.values()) {
      session.group.removeView(viewId);
    }
  }
  async isPageTracked(viewId) {
    return this._trackedPages.has(viewId);
  }
  async getTrackedPages() {
    return [...this._trackedPages];
  }
  // --- Playwright operations (delegated to per-session instances) ---
  async openPage(sessionId, url) {
    const session = await this._getOrCreateSession(sessionId);
    return session.openPage(url);
  }
  async getSummary(sessionId, pageId) {
    const session = await this._getOrCreateSession(sessionId);
    return session.getSummary(pageId);
  }
  async invokeFunctionRaw(sessionId, pageId, fnDef, ...args) {
    const session = await this._getOrCreateSession(sessionId);
    return session.invokeFunctionRaw(pageId, fnDef, ...args);
  }
  async invokeFunction(sessionId, pageId, fnDef, args = [], timeoutMs) {
    const session = await this._getOrCreateSession(sessionId);
    return session.invokeFunction(pageId, fnDef, args, timeoutMs);
  }
  async waitForDeferredResult(sessionId, deferredResultId, timeoutMs) {
    const session = await this._getOrCreateSession(sessionId);
    return session.waitForDeferredResult(deferredResultId, timeoutMs);
  }
  async replyToFileChooser(sessionId, pageId, files) {
    const session = await this._getOrCreateSession(sessionId);
    return session.replyToFileChooser(pageId, files);
  }
  async replyToDialog(sessionId, pageId, accept, promptText) {
    const session = await this._getOrCreateSession(sessionId);
    return session.replyToDialog(pageId, accept, promptText);
  }
  // --- Session lifecycle ---
  async disposeSession(sessionId) {
    if (this._sessions.has(sessionId)) {
      this.logService.debug(`[PlaywrightService] Disposing session ${sessionId}`);
      this._sessions.deleteAndDispose(sessionId);
      this._inactivityTimers.deleteAndDispose(sessionId);
    }
  }
  // --- Private helpers ---
  _fireTrackedPages() {
    this._onDidChangeTrackedPages.fire([...this._trackedPages]);
  }
  /**
   * Reset the inactivity timer for a session. After
   * {@link SESSION_INACTIVITY_MS} of no activity the session is
   * automatically disposed.
   */
  _touchSession(sessionId) {
    this._inactivityTimers.deleteAndDispose(sessionId);
    const timer = disposableTimeout(
      () => {
        this.logService.debug(`[PlaywrightService] Session ${sessionId} inactive for ${SESSION_INACTIVITY_MS / 6e4}m, disposing`);
        this._sessions.deleteAndDispose(sessionId);
        this._inactivityTimers.deleteAndDispose(sessionId);
      },
      SESSION_INACTIVITY_MS
    );
    this._inactivityTimers.set(sessionId, timer);
  }
}
class PlaywrightSession extends Disposable {
  constructor(sessionId, _browser, group, actionScope, logService, agentNetworkFilterService, telemetryService, onDidCreatePage) {
    super();
    this.sessionId = sessionId;
    this._browser = _browser;
    this.group = group;
    this.actionScope = actionScope;
    this.logService = logService;
    this.agentNetworkFilterService = agentNetworkFilterService;
    this.telemetryService = telemetryService;
    this.onDidCreatePage = onDidCreatePage;
    // --- Page matching ---
    this._viewIdToPage = /* @__PURE__ */ new Map();
    this._pageToViewId = /* @__PURE__ */ new WeakMap();
    this._tabs = /* @__PURE__ */ new WeakMap();
    /** View IDs received from the group but not yet matched with a page. */
    this._viewIdQueue = [];
    /** Pages received from Playwright but not yet matched with a view ID. */
    this._pageQueue = [];
    this._watchedContexts = /* @__PURE__ */ new WeakSet();
    this._openContext = void 0;
    /** In-flight deferred results keyed by their generated ID. */
    this._deferredResults = this._register(new DisposableMap());
    this._register(this.group);
    this._register(this.group.onDidAddView((e) => this._onViewAdded(e.viewId)));
    this._register(this.group.onDidRemoveView((e) => this._onViewRemoved(e.viewId)));
    this._scanForNewContexts();
  }
  /** Register a disposable to be cleaned up when this session is disposed. */
  registerDisposable(d) {
    this._register(d);
  }
  // --- Page operations ---
  async openPage(url) {
    if (!this._openContext) {
      this._openContext = await this._browser.newContext();
      this._onContextAdded(this._openContext);
    }
    const page = await this._openContext.newPage();
    const viewId = await this._onPageAdded(page);
    await this.onDidCreatePage(viewId);
    if (url && url !== "about:blank" && page.url() !== url) {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: OPEN_PAGE_NAVIGATION_TIMEOUT_MS });
      } catch (error) {
        if (!isNavigationTimeoutError(error)) {
          throw error;
        }
        throw new Error(`Navigation to ${url} timed out after ${OPEN_PAGE_NAVIGATION_TIMEOUT_MS} ms. The page (ID: ${viewId}) is open and can be reused.`);
      }
    }
    const summary = await this._getSummary(viewId);
    return { pageId: viewId, summary };
  }
  async getSummary(pageId) {
    return this._getSummary(pageId, true);
  }
  async invokeFunctionRaw(pageId, fnDef, ...args) {
    const fn = await this._compileFunction(fnDef);
    return this._runAgainstPage(pageId, (page) => fn(page, args));
  }
  async invokeFunction(pageId, fnDef, args = [], timeoutMs) {
    this.logService.info(`[PlaywrightSession] Invoking function on view ${pageId}`);
    const logCtx = {
      startedAt: Date.now(),
      codeLength: fnDef.length,
      codeLineCount: fnDef.split("\n").length,
      pageMethodsCalled: /* @__PURE__ */ new Map(),
      wasDeferred: false,
      resumeCount: 0,
      logged: false
    };
    let fn;
    try {
      fn = await this._compileFunction(fnDef);
    } catch (err) {
      this._logExecution(logCtx, false);
      const summary2 = await this._getSummary(pageId);
      return { error: err instanceof Error ? err.message : String(err), summary: summary2 };
    }
    const wrappedCallback = async (page) => fn(createPageApiProxy(page, logCtx.pageMethodsCalled), args);
    if (timeoutMs !== void 0) {
      return this._runWithDeferral(pageId, wrappedCallback, timeoutMs, void 0, logCtx);
    }
    let result, error;
    try {
      result = await this._runAgainstPage(pageId, wrappedCallback);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    this._logExecution(logCtx, !error);
    const summary = await this._getSummary(pageId);
    return { result, error, summary };
  }
  async waitForDeferredResult(deferredResultId, timeoutMs) {
    const entry = this._deferredResults.get(deferredResultId);
    if (!entry) {
      throw new Error(`No deferred result found with ID "${deferredResultId}". It may have been cleaned up or already consumed.`);
    }
    const { pageId, promise, logCtx } = entry;
    if (logCtx) {
      logCtx.resumeCount++;
    }
    this._deferredResults.deleteAndDispose(deferredResultId);
    return this._runWithDeferral(pageId, () => promise, timeoutMs, deferredResultId, logCtx);
  }
  async replyToFileChooser(pageId, files) {
    const page = await this._getPage(pageId);
    const tab = this._tabs.get(page);
    if (!tab) {
      throw new Error("Failed to reply to file chooser");
    }
    await tab.replyToFileChooser(files);
    const summary = await tab.getSummary();
    return { summary };
  }
  async replyToDialog(pageId, accept, promptText) {
    const page = await this._getPage(pageId);
    const tab = this._tabs.get(page);
    if (!tab) {
      throw new Error("Failed to reply to dialog");
    }
    await tab.replyToDialog(accept, promptText);
    const summary = await tab.getSummary();
    return { summary };
  }
  // --- Private: page operations ---
  async _getSummary(pageId, full = false) {
    const page = await this._getPage(pageId);
    const tab = this._tabs.get(page);
    if (!tab) {
      throw new Error("Failed to get page summary");
    }
    return tab.getSummary(full);
  }
  async _runAgainstPage(pageId, callback) {
    const page = await this._getPage(pageId);
    const tab = this._tabs.get(page);
    if (!tab) {
      throw new Error("Failed to execute function against page");
    }
    return tab.safeRunAgainstPage(async () => callback(page));
  }
  async _runWithDeferral(pageId, callback, timeoutMs, existingDeferredId, logCtx) {
    const deferred = new DeferredPromise();
    deferred.p.catch(() => {
    });
    if (existingDeferredId === void 0 && logCtx) {
      deferred.p.then(() => this._logExecution(logCtx, true), () => this._logExecution(logCtx, false));
    }
    const wrappedPromise = this._runAgainstPage(pageId, async (page) => {
      const promise = callback(page);
      promise.catch(() => {
      });
      deferred.settleWith(promise);
      return promise;
    });
    let result, error;
    let interrupted = false;
    try {
      result = await raceTimeout(wrappedPromise, timeoutMs, () => {
        interrupted = true;
      });
    } catch (err) {
      if (err instanceof DialogInterruptedError) {
        interrupted = true;
      }
      error = err instanceof Error ? err.message : String(err);
    }
    let deferredResultId;
    if (interrupted) {
      if (logCtx) {
        logCtx.wasDeferred = true;
      }
      deferredResultId = existingDeferredId ?? generateUuid();
      const cleanup = disposableTimeout(() => this._deferredResults.deleteAndDispose(deferredResultId), DEFERRED_RESULT_CLEANUP_MS);
      this._deferredResults.set(deferredResultId, { pageId, promise: deferred.p, logCtx, dispose: () => cleanup.dispose() });
      this.logService.info(`[PlaywrightSession] Execution interrupted, deferred as ${deferredResultId}`);
    } else if (logCtx) {
      this._logExecution(logCtx, !error);
    }
    const summary = await this._getSummary(pageId);
    return { result, error, summary, deferredResultId };
  }
  /**
   * Emit completion telemetry for a single {@link invokeFunction} call, once the
   * page work settles. Idempotent: only the first call for a given context emits,
   * so the synchronous and settlement-promise paths can both call it safely.
   */
  _logExecution(ctx, success) {
    if (ctx.logged) {
      return;
    }
    ctx.logged = true;
    const entries = [...ctx.pageMethodsCalled.entries()];
    const total = entries.reduce((sum, [, count]) => sum + count, 0);
    this.telemetryService.publicLog2(
      "integratedBrowser.tools.runPlaywrightCode.completed",
      {
        pageMethodsCalled: JSON.stringify(Object.fromEntries(entries)),
        pageMethodsCalledDcount: entries.length,
        pageMethodsCalledCount: total,
        success: success ? 1 : 0,
        wasDeferred: ctx.wasDeferred ? 1 : 0,
        resumeCount: ctx.resumeCount,
        durationMs: Math.round(Date.now() - ctx.startedAt),
        codeLength: ctx.codeLength,
        codeLineCount: ctx.codeLineCount
      }
    );
  }
  async _compileFunction(fnDef) {
    const vm = await import("vm");
    return vm.compileFunction(`return (${fnDef})(page, ...args)`, ["page", "args"], { parsingContext: vm.createContext() });
  }
  // --- Private: page matching (view ↔ page pairing) ---
  async _getPage(viewId) {
    const resolved = this._viewIdToPage.get(viewId);
    if (resolved) {
      return resolved;
    }
    const queued = this._viewIdQueue.find((item) => item.viewId === viewId);
    if (queued) {
      return queued.page.p;
    }
    throw new Error(`Page "${viewId}" not found`);
  }
  _onViewAdded(viewId, timeoutMs = 1e4) {
    const resolved = this._viewIdToPage.get(viewId);
    if (resolved) {
      return Promise.resolve(resolved);
    }
    const queued = this._viewIdQueue.find((item) => item.viewId === viewId);
    if (queued) {
      return queued.page.p;
    }
    const deferred = new DeferredPromise();
    const timeout = setTimeout(() => deferred.error(new Error(`Timed out waiting for page`)), timeoutMs);
    deferred.p.finally(() => {
      clearTimeout(timeout);
      this._viewIdQueue = this._viewIdQueue.filter((item) => item.viewId !== viewId);
      if (this._viewIdQueue.length === 0) {
        this._stopScanning();
      }
    });
    this._viewIdQueue.push({ viewId, page: deferred });
    this._tryMatch();
    this._ensureScanning();
    return deferred.p;
  }
  _onViewRemoved(viewId) {
    this._viewIdQueue = this._viewIdQueue.filter((item) => item.viewId !== viewId);
    const page = this._viewIdToPage.get(viewId);
    if (page) {
      this._pageToViewId.delete(page);
    }
    this._viewIdToPage.delete(viewId);
  }
  _onPageAdded(page, timeoutMs = 1e4) {
    const resolved = this._pageToViewId.get(page);
    if (resolved) {
      return Promise.resolve(resolved);
    }
    const queued = this._pageQueue.find((item) => item.page === page);
    if (queued) {
      return queued.viewId.p;
    }
    this._onContextAdded(page.context());
    page.once("close", () => this._onPageRemoved(page));
    page.setDefaultTimeout(1e4);
    this._tabs.set(page, new PlaywrightTab(page, this.actionScope, this.agentNetworkFilterService));
    const deferred = new DeferredPromise();
    const timeout = setTimeout(() => deferred.error(new Error(`Timed out waiting for browser view`)), timeoutMs);
    deferred.p.finally(() => {
      clearTimeout(timeout);
      this._pageQueue = this._pageQueue.filter((item) => item.page !== page);
    });
    this._pageQueue.push({ page, viewId: deferred });
    this._tryMatch();
    return deferred.p;
  }
  _onPageRemoved(page) {
    this._pageQueue = this._pageQueue.filter((item) => item.page !== page);
    const viewId = this._pageToViewId.get(page);
    if (viewId) {
      this._viewIdToPage.delete(viewId);
    }
    this._pageToViewId.delete(page);
  }
  _onContextAdded(context) {
    if (this._watchedContexts.has(context)) {
      return;
    }
    this._watchedContexts.add(context);
    context.on("page", (page) => this._onPageAdded(page));
    context.on("close", () => this._watchedContexts.delete(context));
    for (const page of context.pages()) {
      this._onPageAdded(page);
    }
  }
  // --- Private: matching ---
  _tryMatch() {
    while (this._viewIdQueue.length > 0 && this._pageQueue.length > 0) {
      const viewIdItem = this._viewIdQueue.shift();
      const pageItem = this._pageQueue.shift();
      this._viewIdToPage.set(viewIdItem.viewId, pageItem.page);
      this._pageToViewId.set(pageItem.page, viewIdItem.viewId);
      viewIdItem.page.complete(pageItem.page);
      pageItem.viewId.complete(viewIdItem.viewId);
      this.logService.debug(`[PlaywrightSession] Matched view ${viewIdItem.viewId} \u2192 page`);
    }
    if (this._viewIdQueue.length === 0) {
      this._stopScanning();
    }
  }
  // --- Private: context scanning ---
  _scanForNewContexts() {
    for (const context of this._browser.contexts()) {
      this._onContextAdded(context);
    }
  }
  _ensureScanning() {
    if (this._scanTimer === void 0) {
      this._scanTimer = setInterval(() => this._scanForNewContexts(), 100);
    }
  }
  _stopScanning() {
    if (this._scanTimer !== void 0) {
      clearInterval(this._scanTimer);
      this._scanTimer = void 0;
    }
  }
  dispose() {
    this._stopScanning();
    this._browser?.close().catch(() => {
    });
    for (const { page } of this._viewIdQueue) {
      page.error(new Error("PlaywrightSession disposed"));
    }
    for (const { viewId } of this._pageQueue) {
      viewId.error(new Error("PlaywrightSession disposed"));
    }
    this._viewIdQueue = [];
    this._pageQueue = [];
    super.dispose();
  }
}
function isNavigationTimeoutError(error) {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === "TimeoutError" || /Timeout \d+ms exceeded/.test(error.message) || /navigation timeout/i.test(error.message);
}
const PAGE_PROXY_IGNORED_PROPS = /* @__PURE__ */ new Set([
  "then",
  "catch",
  "finally",
  "toJSON",
  "toString",
  "valueOf",
  "constructor"
]);
const PAGE_PROXY_MAX_DEPTH = 3;
function createPageApiProxy(target, methodCalls, prefix = "", depth = 0) {
  if (depth >= PAGE_PROXY_MAX_DEPTH) {
    return target;
  }
  const cache = /* @__PURE__ */ new Map();
  return new Proxy(target, {
    get(t, prop, receiver) {
      const value = Reflect.get(t, prop, receiver);
      if (typeof prop !== "string" || prop.startsWith("_") || PAGE_PROXY_IGNORED_PROPS.has(prop)) {
        return value;
      }
      const cached = cache.get(prop);
      if (cached !== void 0) {
        return cached;
      }
      if (typeof value === "function") {
        const name = prefix + prop;
        const wrapper = function(...args) {
          methodCalls.set(name, (methodCalls.get(name) ?? 0) + 1);
          return Reflect.apply(value, t, args);
        };
        cache.set(prop, wrapper);
        return wrapper;
      }
      if (value !== null && typeof value === "object") {
        const nested = createPageApiProxy(value, methodCalls, `${prefix}${prop}.`, depth + 1);
        cache.set(prop, nested);
        return nested;
      }
      return value;
    }
  });
}
export {
  PlaywrightService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYnJvd3NlclZpZXdcXG5vZGVcXHBsYXl3cmlnaHRTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCBkaXNwb3NhYmxlVGltZW91dCwgcmFjZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSB9IGZyb20gJy4uLy4uL25ldHdvcmtGaWx0ZXIvY29tbW9uL25ldHdvcmtGaWx0ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElJbnZva2VGdW5jdGlvblJlc3VsdCwgSVBsYXl3cmlnaHRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3BsYXl3cmlnaHRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElCcm93c2VyVmlld0dyb3VwUmVtb3RlU2VydmljZSB9IGZyb20gJy4uL25vZGUvYnJvd3NlclZpZXdHcm91cFJlbW90ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJWaWV3R3JvdXAgfSBmcm9tICcuLi9jb21tb24vYnJvd3NlclZpZXdHcm91cC5qcyc7XG5pbXBvcnQgeyBQbGF5d3JpZ2h0VGFiLCBEaWFsb2dJbnRlcnJ1cHRlZEVycm9yIH0gZnJvbSAnLi9wbGF5d3JpZ2h0VGFiLmpzJztcbmltcG9ydCB7IENEUFJlcXVlc3QsIENEUFJlc3BvbnNlIH0gZnJvbSAnLi4vY29tbW9uL2NkcC90eXBlcy5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcblxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgdHlwZSB7IEJyb3dzZXIsIEJyb3dzZXJDb250ZXh0LCBDb25uZWN0T3ZlckNEUFRyYW5zcG9ydCwgUGFnZSB9IGZyb20gJ3BsYXl3cmlnaHQtY29yZSc7XG5cbi8qKlxuICogVHJhY2tzIHdoZXRoZXIgYSBjYWxsZXItaW5pdGlhdGVkIFBsYXl3cmlnaHQgYWN0aW9uIGlzIGN1cnJlbnRseSBpbiBmbGlnaHQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVBsYXl3cmlnaHRBY3Rpb25TY29wZSB7XG5cdGFjdGl2ZUNhbGxzOiBudW1iZXI7XG59XG5cbmNvbnN0IERFRkVSUkVEX1JFU1VMVF9DTEVBTlVQX01TID0gNSAqIDYwXzAwMDsgLy8gNSBtaW51dGVzXG5jb25zdCBTRVNTSU9OX0lOQUNUSVZJVFlfTVMgPSAzMCAqIDYwXzAwMDsgLy8gMzAgbWludXRlc1xuY29uc3QgT1BFTl9QQUdFX05BVklHQVRJT05fVElNRU9VVF9NUyA9IDMwXzAwMDtcblxuLyoqXG4gKiBOYXJyb3cgYSByYXcgUGxheXdyaWdodCB0cmFuc3BvcnQgcGF5bG9hZCB0byBhIHtAbGluayBDRFBSZXF1ZXN0fS5cbiAqXG4gKiBQbGF5d3JpZ2h0IHR5cGVzIHRoZSBgc2VuZGAgcGF5bG9hZCBhcyBgb2JqZWN0YCBidXQgcGFzc2VzIHN0cnVjdHVyZWQgQ0RQXG4gKiBtZXNzYWdlcyAobm90IEpTT04gc3RyaW5ncykgZm9yIGEgY2FsbGVyLXN1cHBsaWVkIHRyYW5zcG9ydCwgc28gdGhpcyBndWFyZFxuICogaXMgZXhwZWN0ZWQgdG8gYWx3YXlzIGhvbGQuIEl0IGV4aXN0cyB0byBmYWlsIGxvdWRseSAodGhlIGNhbGxlciB0aHJvd3MpXG4gKiBzaG91bGQgYSBmdXR1cmUgUGxheXdyaWdodCB2ZXJzaW9uIGNoYW5nZSB0aGUgd2lyZSBmb3JtYXQsIHJhdGhlciB0aGFuXG4gKiBzaWxlbnRseSBmb3J3YXJkaW5nIG1hbGZvcm1lZCBtZXNzYWdlcy5cbiAqL1xuZnVuY3Rpb24gaXNDRFBSZXF1ZXN0KG1lc3NhZ2U6IG9iamVjdCk6IG1lc3NhZ2UgaXMgQ0RQUmVxdWVzdCB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IG1lc3NhZ2UgYXMgUGFydGlhbDxDRFBSZXF1ZXN0Pjtcblx0cmV0dXJuIHR5cGVvZiBjYW5kaWRhdGUuaWQgPT09ICdudW1iZXInXG5cdFx0JiYgdHlwZW9mIGNhbmRpZGF0ZS5tZXRob2QgPT09ICdzdHJpbmcnXG5cdFx0JiYgKGNhbmRpZGF0ZS5zZXNzaW9uSWQgPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgY2FuZGlkYXRlLnNlc3Npb25JZCA9PT0gJ3N0cmluZycpO1xufVxuXG5cblxuLyoqXG4gKiBTaGFyZWQtcHJvY2VzcyBpbXBsZW1lbnRhdGlvbiBvZiB7QGxpbmsgSVBsYXl3cmlnaHRTZXJ2aWNlfS5cbiAqXG4gKiBNYW5hZ2VzIHtAbGluayBQbGF5d3JpZ2h0U2Vzc2lvbn0gaW5zdGFuY2VzIGtleWVkIGJ5IHNlc3Npb24gSUQuXG4gKiBFYWNoIHNlc3Npb24gaGFzIGl0cyBvd24gUGxheXdyaWdodCBicm93c2VyIGNvbm5lY3Rpb24gYW5kIGJyb3dzZXIgdmlld1xuICogZ3JvdXAsIGNyZWF0ZWQgZWFnZXJseSBieSB0aGUgc2VydmljZSB3aGVuIHRoZSBzZXNzaW9uIGlzIGZpcnN0IHJlcXVlc3RlZC5cbiAqXG4gKiBQYWdlIHRyYWNraW5nIGlzIGN1cnJlbnRseSBnbG9iYWw6IHRyYWNrZWQgcGFnZXMgYXJlIHNoYXJlZCBhY3Jvc3MgYWxsXG4gKiBzZXNzaW9ucyBzbyBldmVyeSBzZXNzaW9uIGNhbiBpbnRlcmFjdCB3aXRoIGV2ZXJ5IHRyYWNrZWQgcGFnZS5cbiAqL1xuZXhwb3J0IGNsYXNzIFBsYXl3cmlnaHRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElQbGF5d3JpZ2h0U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBQbGF5d3JpZ2h0U2Vzc2lvbj4oKSk7XG5cblx0LyoqIEluLWZsaWdodCBzZXNzaW9uIGluaXRpYWxpemF0aW9ucyBrZXllZCBieSBzZXNzaW9uIElELiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nSW5pdHMgPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTxQbGF5d3JpZ2h0U2Vzc2lvbj4+KCk7XG5cblx0LyoqIEluYWN0aXZpdHkgdGltZXJzIGtleWVkIGJ5IHNlc3Npb24gSUQuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2luYWN0aXZpdHlUaW1lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIElEaXNwb3NhYmxlPigpKTtcblxuXHQvKiogR2xvYmFsIHNldCBvZiB0cmFja2VkIHBhZ2UgSURzIChzaGFyZWQgYWNyb3NzIGFsbCBzZXNzaW9ucykuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyYWNrZWRQYWdlcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVHJhY2tlZFBhZ2VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8cmVhZG9ubHkgc3RyaW5nW10+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVRyYWNrZWRQYWdlczogRXZlbnQ8cmVhZG9ubHkgc3RyaW5nW10+ID0gdGhpcy5fb25EaWRDaGFuZ2VUcmFja2VkUGFnZXMuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB3aW5kb3dJZDogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYnJvd3NlclZpZXdHcm91cFJlbW90ZVNlcnZpY2U6IElCcm93c2VyVmlld0dyb3VwUmVtb3RlU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYWdlbnROZXR3b3JrRmlsdGVyU2VydmljZTogSUFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgb3IgY3JlYXRlIGEgZnVsbHktaW5pdGlhbGl6ZWQge0BsaW5rIFBsYXl3cmlnaHRTZXNzaW9ufSBmb3IgdGhlXG5cdCAqIGdpdmVuIHNlc3Npb24gSUQuIENyZWF0ZXMgdGhlIENEUCBncm91cCBhbmQgUGxheXdyaWdodCBicm93c2VyXG5cdCAqIGNvbm5lY3Rpb24gaWYgdGhlIHNlc3Npb24gZG9lcyBub3QgYWxyZWFkeSBleGlzdC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2dldE9yQ3JlYXRlU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8UGxheXdyaWdodFNlc3Npb24+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0dGhpcy5fdG91Y2hTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXG5cdFx0Ly8gRGUtZHVwbGljYXRlIGNvbmN1cnJlbnQgaW5pdGlhbGl6YXRpb24gZm9yIHRoZSBzYW1lIHNlc3Npb24uXG5cdFx0Y29uc3QgcGVuZGluZyA9IHRoaXMuX3BlbmRpbmdJbml0cy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAocGVuZGluZykge1xuXHRcdFx0cmV0dXJuIHBlbmRpbmc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5pdFByb21pc2UgPSB0aGlzLl9pbml0U2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdHRoaXMuX3BlbmRpbmdJbml0cy5zZXQoc2Vzc2lvbklkLCBpbml0UHJvbWlzZSk7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBpbml0UHJvbWlzZTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ0luaXRzLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGUgYW5kIGZ1bGx5IGluaXRpYWxpemUgYSBuZXcgc2Vzc2lvbjogYnJvd3NlciB2aWV3IGdyb3VwLFxuXHQgKiBQbGF5d3JpZ2h0IENEUCBjb25uZWN0aW9uLCBhbmQgcGFnZSByZXBsYXkuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9pbml0U2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8UGxheXdyaWdodFNlc3Npb24+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtQbGF5d3JpZ2h0U2VydmljZV0gSW5pdGlhbGl6aW5nIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG5cblx0XHRjb25zdCBncm91cCA9IGF3YWl0IHRoaXMuYnJvd3NlclZpZXdHcm91cFJlbW90ZVNlcnZpY2UuY3JlYXRlR3JvdXAoeyBtYWluV2luZG93SWQ6IHRoaXMud2luZG93SWQsIHNlc3Npb25JZCB9KTtcblxuXHRcdGNvbnN0IGFjdGlvblNjb3BlOiBJUGxheXdyaWdodEFjdGlvblNjb3BlID0geyBhY3RpdmVDYWxsczogMCB9O1xuXG5cdFx0bGV0IGJyb3dzZXI6IEJyb3dzZXI7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBsYXl3cmlnaHQgPSBhd2FpdCBpbXBvcnQoJ3BsYXl3cmlnaHQtY29yZScpO1xuXHRcdFx0Y29uc3Qgc3ViID0gZ3JvdXAub25DRFBNZXNzYWdlKG1zZyA9PiB0cmFuc3BvcnQub25tZXNzYWdlPy4obXNnKSk7XG5cdFx0XHRjb25zdCB0cmFuc3BvcnQ6IENvbm5lY3RPdmVyQ0RQVHJhbnNwb3J0ID0ge1xuXHRcdFx0XHRjbG9zZSgpIHtcblx0XHRcdFx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHRoaXMub25jbG9zZT8uKCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNlbmQ6IChyYXdNZXNzYWdlKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCFpc0NEUFJlcXVlc3QocmF3TWVzc2FnZSkpIHtcblx0XHRcdFx0XHRcdC8vIEZhaWwgbG91ZGx5OiByZXR1cm5pbmcgc2lsZW50bHkgd291bGQgbGVhdmUgUGxheXdyaWdodFxuXHRcdFx0XHRcdFx0Ly8gd2FpdGluZyBmb3IgYSByZXNwb25zZSBhbmQgc3VyZmFjZSBsYXRlciBhcyBhbiBvcGFxdWUgaGFuZy5cblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgW1BsYXl3cmlnaHRTZXJ2aWNlXSBVbmV4cGVjdGVkIENEUCB0cmFuc3BvcnQgcGF5bG9hZCBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH0gKHR5cGU6ICR7dHlwZW9mIHJhd01lc3NhZ2V9KWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBtZXNzYWdlID0gcmF3TWVzc2FnZTtcblx0XHRcdFx0XHQvLyBCbG9jayBQbGF5d3JpZ2h0J3MgYXV0b21hdGljIC8gZGVmYXVsdCBlbXVsYXRpb24gdHJhZmZpYy4gV2Vcblx0XHRcdFx0XHQvLyBvbmx5IGZvcndhcmQgYEVtdWxhdGlvbi4qYCB0byB0aGUgdmlldyB3aGlsZSBhIGNhbGxlci1pbml0aWF0ZWRcblx0XHRcdFx0XHQvLyBhY3Rpb24gaXMgcnVubmluZyAoc2VlIElQbGF5d3JpZ2h0QWN0aW9uU2NvcGUpIHNvIHRoZSB3b3JrYmVuY2hcblx0XHRcdFx0XHQvLyBzdGF5cyBpbiBjb250cm9sIG9mIGRldmljZSBlbXVsYXRpb24uIE90aGVyIHRyYWZmaWMgXHUyMDE0IGUuZy4gdGhlXG5cdFx0XHRcdFx0Ly8gc2V0dXAgUGxheXdyaWdodCBpc3N1ZXMgb24gaXRzIG93biB3aGVuIGNvbm5lY3Rpbmcgb3IgY3JlYXRpbmdcblx0XHRcdFx0XHQvLyBwYWdlcyBcdTIwMTQgaXMgYWNrbm93bGVkZ2VkIHdpdGggYSBzeW50aGV0aWMgc3VjY2VzcyByZXNwb25zZSBhbmRcblx0XHRcdFx0XHQvLyBuZXZlciBoaXRzIHRoZSB2aWV3LlxuXHRcdFx0XHRcdGlmIChhY3Rpb25TY29wZS5hY3RpdmVDYWxscyA9PT0gMCAmJiBtZXNzYWdlLm1ldGhvZC5zdGFydHNXaXRoKCdFbXVsYXRpb24uJykpIHtcblx0XHRcdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHR0cmFuc3BvcnQub25tZXNzYWdlPy4oeyBpZDogbWVzc2FnZS5pZCwgcmVzdWx0OiB7fSwgc2Vzc2lvbklkOiBtZXNzYWdlLnNlc3Npb25JZCB9IHNhdGlzZmllcyBDRFBSZXNwb25zZSk7XG5cdFx0XHRcdFx0XHR9LCAxKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dm9pZCBncm91cC5zZW5kQ0RQTWVzc2FnZShtZXNzYWdlKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdGJyb3dzZXIgPSBhd2FpdCBwbGF5d3JpZ2h0LmNocm9taXVtLmNvbm5lY3RPdmVyQ0RQKHRyYW5zcG9ydCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Z3JvdXAuZGlzcG9zZSgpO1xuXHRcdFx0dGhyb3cgZTtcblx0XHR9XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtQbGF5d3JpZ2h0U2VydmljZV0gQ29ubmVjdGVkIHRvIGJyb3dzZXIgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG5cblx0XHQvLyBJZiB0aGUgc2VydmljZSB3YXMgZGlzcG9zZWQgd2hpbGUgd2Ugd2VyZSBjb25uZWN0aW5nLCBjbGVhbiB1cC5cblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0YnJvd3Nlci5jbG9zZSgpLmNhdGNoKCgpID0+IHsgLyogaWdub3JlICovIH0pO1xuXHRcdFx0Z3JvdXAuZGlzcG9zZSgpO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdQbGF5d3JpZ2h0U2VydmljZSB3YXMgZGlzcG9zZWQgZHVyaW5nIGluaXRpYWxpemF0aW9uJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBQbGF5d3JpZ2h0U2Vzc2lvbihcblx0XHRcdHNlc3Npb25JZCxcblx0XHRcdGJyb3dzZXIsXG5cdFx0XHRncm91cCxcblx0XHRcdGFjdGlvblNjb3BlLFxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLFxuXHRcdFx0dGhpcy5hZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlLFxuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0dmlld0lkID0+IHRoaXMuc3RhcnRUcmFja2luZ1BhZ2Uodmlld0lkKSxcblx0XHQpO1xuXG5cdFx0Ly8gS2VlcCB0aGUgZ2xvYmFsIHRyYWNrZWQgc2V0IGluIHN5bmMgd2l0aCBncm91cCBldmVudHMuIFdoZW4gYVxuXHRcdC8vIHZpZXcgaXMgYWRkZWQgdmlhIGV4dGVybmFsIG1lYW5zIChlLmcuIENEUCBjcmVhdGVUYXJnZXQpLCB0aGVcblx0XHQvLyBncm91cCBmaXJlcyBvbkRpZEFkZFZpZXcgXHUyMDE0IHVwZGF0ZSBfdHJhY2tlZFBhZ2VzIGFjY29yZGluZ2x5LlxuXHRcdC8vIFRoZSBTZXQgbWFrZXMgZG91YmxlLWFkZHMgKGZyb20gc3RhcnRUcmFja2luZ1BhZ2UpIGhhcm1sZXNzLlxuXHRcdC8vIEFsc28gcmVwbGljYXRlIHRoZSB2aWV3IGludG8gb3RoZXIgc2Vzc2lvbnMgc28gdGhhdCBDRFAtY3JlYXRlZFxuXHRcdC8vIHRhcmdldHMgYmVjb21lIGFjY2Vzc2libGUgZXZlcnl3aGVyZSwgbm90IGp1c3QgdGhlIG9yaWdpbmF0aW5nIHNlc3Npb24uXG5cdFx0c2Vzc2lvbi5yZWdpc3RlckRpc3Bvc2FibGUoZ3JvdXAub25EaWRBZGRWaWV3KGUgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl90cmFja2VkUGFnZXMuaGFzKGUudmlld0lkKSkge1xuXHRcdFx0XHR0aGlzLl90cmFja2VkUGFnZXMuYWRkKGUudmlld0lkKTtcblx0XHRcdFx0dGhpcy5fZmlyZVRyYWNrZWRQYWdlcygpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBbaWQsIG90aGVyXSBvZiB0aGlzLl9zZXNzaW9ucykge1xuXHRcdFx0XHRpZiAoaWQgIT09IHNlc3Npb25JZCkge1xuXHRcdFx0XHRcdHZvaWQgb3RoZXIuZ3JvdXAuYWRkVmlldyhlLnZpZXdJZCkuY2F0Y2goKCkgPT4geyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRzZXNzaW9uLnJlZ2lzdGVyRGlzcG9zYWJsZShncm91cC5vbkRpZFJlbW92ZVZpZXcoZSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fdHJhY2tlZFBhZ2VzLmRlbGV0ZShlLnZpZXdJZCkpIHtcblx0XHRcdFx0dGhpcy5fZmlyZVRyYWNrZWRQYWdlcygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIE9uIGJyb3dzZXIgZGlzY29ubmVjdCwgZGlzcG9zZSB0aGUgc2Vzc2lvbiBzbyBpdCB3aWxsIGJlXG5cdFx0Ly8gcmVjcmVhdGVkIGZyZXNoIG9uIHRoZSBuZXh0IHRvb2wgY2FsbC5cblx0XHRicm93c2VyLm9uKCdkaXNjb25uZWN0ZWQnLCAoKSA9PiB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtQbGF5d3JpZ2h0U2VydmljZV0gQnJvd3NlciBkaXNjb25uZWN0ZWQgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG5cdFx0XHR0aGlzLl9zZXNzaW9ucy5kZWxldGVBbmREaXNwb3NlKHNlc3Npb25JZCk7XG5cdFx0XHR0aGlzLl9pbmFjdGl2aXR5VGltZXJzLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvbklkKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3Nlc3Npb25zLnNldChzZXNzaW9uSWQsIHNlc3Npb24pO1xuXG5cdFx0Ly8gUmVwbGF5IGdsb2JhbGx5IHRyYWNrZWQgcGFnZXMgaW50byB0aGUgbmV3IHNlc3Npb24ncyBncm91cC5cblx0XHQvLyBQYWdlcyBtYXkgaGF2ZSBiZWVuIHJlbW92ZWQgc2luY2UgdGhleSB3ZXJlIHRyYWNrZWQgXHUyMDE0IGNhdGNoIGFuZFxuXHRcdC8vIGV2aWN0IHN0YWxlIGVudHJpZXMgc28gdGhleSBkb24ndCBhY2N1bXVsYXRlLlxuXHRcdGZvciAoY29uc3Qgdmlld0lkIG9mIFsuLi50aGlzLl90cmFja2VkUGFnZXNdKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBzZXNzaW9uLmdyb3VwLmFkZFZpZXcodmlld0lkKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtQbGF5d3JpZ2h0U2VydmljZV0gU3RhbGUgdHJhY2tlZCBwYWdlICR7dmlld0lkfSByZW1vdmVkIGR1cmluZyByZXBsYXlgKTtcblx0XHRcdFx0dGhpcy5fdHJhY2tlZFBhZ2VzLmRlbGV0ZSh2aWV3SWQpO1xuXHRcdFx0XHR0aGlzLl9maXJlVHJhY2tlZFBhZ2VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fdG91Y2hTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0cmV0dXJuIHNlc3Npb247XG5cdH1cblxuXHQvLyAtLS0gUGFnZSB0cmFja2luZyAoZ2xvYmFsKSAtLS1cblxuXHRhc3luYyBzdGFydFRyYWNraW5nUGFnZSh2aWV3SWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFVwZGF0ZSB0aGUgY2Fub25pY2FsIHNldCBkaXJlY3RseSBzbyB0cmFja2luZyB3b3JrcyBldmVuIHdoZW5cblx0XHQvLyBubyBzZXNzaW9ucyBleGlzdCB5ZXQuIFRoZSBTZXQgbWFrZXMgdGhlIGRvdWJsZS1hZGQgZnJvbVxuXHRcdC8vIHRoZSBncm91cCdzIG9uRGlkQWRkVmlldyBsaXN0ZW5lciBoYXJtbGVzcy5cblx0XHRpZiAoIXRoaXMuX3RyYWNrZWRQYWdlcy5oYXModmlld0lkKSkge1xuXHRcdFx0dGhpcy5fdHJhY2tlZFBhZ2VzLmFkZCh2aWV3SWQpO1xuXHRcdFx0dGhpcy5fZmlyZVRyYWNrZWRQYWdlcygpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgdGhpcy5fc2Vzc2lvbnMudmFsdWVzKCkpIHtcblx0XHRcdHNlc3Npb24uZ3JvdXAuYWRkVmlldyh2aWV3SWQpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHN0b3BUcmFja2luZ1BhZ2Uodmlld0lkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fdHJhY2tlZFBhZ2VzLmRlbGV0ZSh2aWV3SWQpKSB7XG5cdFx0XHR0aGlzLl9maXJlVHJhY2tlZFBhZ2VzKCk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0aGlzLl9zZXNzaW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0c2Vzc2lvbi5ncm91cC5yZW1vdmVWaWV3KHZpZXdJZCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgaXNQYWdlVHJhY2tlZCh2aWV3SWQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLl90cmFja2VkUGFnZXMuaGFzKHZpZXdJZCk7XG5cdH1cblxuXHRhc3luYyBnZXRUcmFja2VkUGFnZXMoKTogUHJvbWlzZTxyZWFkb25seSBzdHJpbmdbXT4ge1xuXHRcdHJldHVybiBbLi4udGhpcy5fdHJhY2tlZFBhZ2VzXTtcblx0fVxuXG5cdC8vIC0tLSBQbGF5d3JpZ2h0IG9wZXJhdGlvbnMgKGRlbGVnYXRlZCB0byBwZXItc2Vzc2lvbiBpbnN0YW5jZXMpIC0tLVxuXG5cdGFzeW5jIG9wZW5QYWdlKHNlc3Npb25JZDogc3RyaW5nLCB1cmw6IHN0cmluZyk6IFByb21pc2U8eyBwYWdlSWQ6IHN0cmluZzsgc3VtbWFyeTogc3RyaW5nIH0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5fZ2V0T3JDcmVhdGVTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0cmV0dXJuIHNlc3Npb24ub3BlblBhZ2UodXJsKTtcblx0fVxuXG5cdGFzeW5jIGdldFN1bW1hcnkoc2Vzc2lvbklkOiBzdHJpbmcsIHBhZ2VJZDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5fZ2V0T3JDcmVhdGVTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0cmV0dXJuIHNlc3Npb24uZ2V0U3VtbWFyeShwYWdlSWQpO1xuXHR9XG5cblx0YXN5bmMgaW52b2tlRnVuY3Rpb25SYXc8VD4oc2Vzc2lvbklkOiBzdHJpbmcsIHBhZ2VJZDogc3RyaW5nLCBmbkRlZjogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPFQ+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5fZ2V0T3JDcmVhdGVTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0cmV0dXJuIHNlc3Npb24uaW52b2tlRnVuY3Rpb25SYXcocGFnZUlkLCBmbkRlZiwgLi4uYXJncyk7XG5cdH1cblxuXHRhc3luYyBpbnZva2VGdW5jdGlvbihzZXNzaW9uSWQ6IHN0cmluZywgcGFnZUlkOiBzdHJpbmcsIGZuRGVmOiBzdHJpbmcsIGFyZ3M6IHVua25vd25bXSA9IFtdLCB0aW1lb3V0TXM/OiBudW1iZXIpOiBQcm9taXNlPElJbnZva2VGdW5jdGlvblJlc3VsdD4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCB0aGlzLl9nZXRPckNyZWF0ZVNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRyZXR1cm4gc2Vzc2lvbi5pbnZva2VGdW5jdGlvbihwYWdlSWQsIGZuRGVmLCBhcmdzLCB0aW1lb3V0TXMpO1xuXHR9XG5cblx0YXN5bmMgd2FpdEZvckRlZmVycmVkUmVzdWx0KHNlc3Npb25JZDogc3RyaW5nLCBkZWZlcnJlZFJlc3VsdElkOiBzdHJpbmcsIHRpbWVvdXRNczogbnVtYmVyKTogUHJvbWlzZTxJSW52b2tlRnVuY3Rpb25SZXN1bHQ+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5fZ2V0T3JDcmVhdGVTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0cmV0dXJuIHNlc3Npb24ud2FpdEZvckRlZmVycmVkUmVzdWx0KGRlZmVycmVkUmVzdWx0SWQsIHRpbWVvdXRNcyk7XG5cdH1cblxuXHRhc3luYyByZXBseVRvRmlsZUNob29zZXIoc2Vzc2lvbklkOiBzdHJpbmcsIHBhZ2VJZDogc3RyaW5nLCBmaWxlczogc3RyaW5nW10pOiBQcm9taXNlPHsgc3VtbWFyeTogc3RyaW5nIH0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5fZ2V0T3JDcmVhdGVTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0cmV0dXJuIHNlc3Npb24ucmVwbHlUb0ZpbGVDaG9vc2VyKHBhZ2VJZCwgZmlsZXMpO1xuXHR9XG5cblx0YXN5bmMgcmVwbHlUb0RpYWxvZyhzZXNzaW9uSWQ6IHN0cmluZywgcGFnZUlkOiBzdHJpbmcsIGFjY2VwdDogYm9vbGVhbiwgcHJvbXB0VGV4dD86IHN0cmluZyk6IFByb21pc2U8eyBzdW1tYXJ5OiBzdHJpbmcgfT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCB0aGlzLl9nZXRPckNyZWF0ZVNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRyZXR1cm4gc2Vzc2lvbi5yZXBseVRvRGlhbG9nKHBhZ2VJZCwgYWNjZXB0LCBwcm9tcHRUZXh0KTtcblx0fVxuXG5cdC8vIC0tLSBTZXNzaW9uIGxpZmVjeWNsZSAtLS1cblxuXHRhc3luYyBkaXNwb3NlU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9zZXNzaW9ucy5oYXMoc2Vzc2lvbklkKSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGBbUGxheXdyaWdodFNlcnZpY2VdIERpc3Bvc2luZyBzZXNzaW9uICR7c2Vzc2lvbklkfWApO1xuXHRcdFx0dGhpcy5fc2Vzc2lvbnMuZGVsZXRlQW5kRGlzcG9zZShzZXNzaW9uSWQpO1xuXHRcdFx0dGhpcy5faW5hY3Rpdml0eVRpbWVycy5kZWxldGVBbmREaXNwb3NlKHNlc3Npb25JZCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIFByaXZhdGUgaGVscGVycyAtLS1cblxuXHRwcml2YXRlIF9maXJlVHJhY2tlZFBhZ2VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVHJhY2tlZFBhZ2VzLmZpcmUoWy4uLnRoaXMuX3RyYWNrZWRQYWdlc10pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc2V0IHRoZSBpbmFjdGl2aXR5IHRpbWVyIGZvciBhIHNlc3Npb24uIEFmdGVyXG5cdCAqIHtAbGluayBTRVNTSU9OX0lOQUNUSVZJVFlfTVN9IG9mIG5vIGFjdGl2aXR5IHRoZSBzZXNzaW9uIGlzXG5cdCAqIGF1dG9tYXRpY2FsbHkgZGlzcG9zZWQuXG5cdCAqL1xuXHRwcml2YXRlIF90b3VjaFNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9pbmFjdGl2aXR5VGltZXJzLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvbklkKTtcblx0XHRjb25zdCB0aW1lciA9IGRpc3Bvc2FibGVUaW1lb3V0KFxuXHRcdFx0KCkgPT4ge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtQbGF5d3JpZ2h0U2VydmljZV0gU2Vzc2lvbiAke3Nlc3Npb25JZH0gaW5hY3RpdmUgZm9yICR7U0VTU0lPTl9JTkFDVElWSVRZX01TIC8gNjBfMDAwfW0sIGRpc3Bvc2luZ2ApO1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9ucy5kZWxldGVBbmREaXNwb3NlKHNlc3Npb25JZCk7XG5cdFx0XHRcdHRoaXMuX2luYWN0aXZpdHlUaW1lcnMuZGVsZXRlQW5kRGlzcG9zZShzZXNzaW9uSWQpO1xuXHRcdFx0fSxcblx0XHRcdFNFU1NJT05fSU5BQ1RJVklUWV9NUyxcblx0XHQpO1xuXHRcdHRoaXMuX2luYWN0aXZpdHlUaW1lcnMuc2V0KHNlc3Npb25JZCwgdGltZXIpO1xuXHR9XG59XG5cbi8qKlxuICogQSBzaW5nbGUgc2Vzc2lvbidzIFBsYXl3cmlnaHQgYnJvd3NlciBjb25uZWN0aW9uLCBwYWdlIHRyYWNraW5nLCBhbmRcbiAqIHBhZ2UtbWF0Y2hpbmcgbG9naWMuXG4gKlxuICogUmVjZWl2ZXMgYW4gYWxyZWFkeS1jb25uZWN0ZWQge0BsaW5rIEJyb3dzZXJ9IGFuZCB7QGxpbmsgSUJyb3dzZXJWaWV3R3JvdXB9XG4gKiBmcm9tIHRoZSBwYXJlbnQge0BsaW5rIFBsYXl3cmlnaHRTZXJ2aWNlfS4gQ29ycmVsYXRlcyBicm93c2VyIHZpZXcgSURzIHdpdGhcbiAqIFBsYXl3cmlnaHQge0BsaW5rIFBhZ2V9IGluc3RhbmNlcyB2aWEgRklGTyBtYXRjaGluZyBvZiBncm91cCBJUEMgZXZlbnRzIGFuZFxuICogUGxheXdyaWdodCBDRFAgZXZlbnRzLlxuICovXG5jbGFzcyBQbGF5d3JpZ2h0U2Vzc2lvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdC8vIC0tLSBQYWdlIG1hdGNoaW5nIC0tLVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdJZFRvUGFnZSA9IG5ldyBNYXA8c3RyaW5nLCBQYWdlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wYWdlVG9WaWV3SWQgPSBuZXcgV2Vha01hcDxQYWdlLCBzdHJpbmc+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RhYnMgPSBuZXcgV2Vha01hcDxQYWdlLCBQbGF5d3JpZ2h0VGFiPigpO1xuXG5cdC8qKiBWaWV3IElEcyByZWNlaXZlZCBmcm9tIHRoZSBncm91cCBidXQgbm90IHlldCBtYXRjaGVkIHdpdGggYSBwYWdlLiAqL1xuXHRwcml2YXRlIF92aWV3SWRRdWV1ZTogQXJyYXk8eyB2aWV3SWQ6IHN0cmluZzsgcGFnZTogRGVmZXJyZWRQcm9taXNlPFBhZ2U+IH0+ID0gW107XG5cblx0LyoqIFBhZ2VzIHJlY2VpdmVkIGZyb20gUGxheXdyaWdodCBidXQgbm90IHlldCBtYXRjaGVkIHdpdGggYSB2aWV3IElELiAqL1xuXHRwcml2YXRlIF9wYWdlUXVldWU6IEFycmF5PHsgcGFnZTogUGFnZTsgdmlld0lkOiBEZWZlcnJlZFByb21pc2U8c3RyaW5nPiB9PiA9IFtdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dhdGNoZWRDb250ZXh0cyA9IG5ldyBXZWFrU2V0PEJyb3dzZXJDb250ZXh0PigpO1xuXHRwcml2YXRlIF9zY2FuVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldEludGVydmFsPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfb3BlbkNvbnRleHQ6IEJyb3dzZXJDb250ZXh0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdC8qKiBJbi1mbGlnaHQgZGVmZXJyZWQgcmVzdWx0cyBrZXllZCBieSB0aGVpciBnZW5lcmF0ZWQgSUQuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlZmVycmVkUmVzdWx0cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywge1xuXHRcdHBhZ2VJZDogc3RyaW5nO1xuXHRcdHByb21pc2U6IFByb21pc2U8dW5rbm93bj47XG5cdFx0bG9nQ3R4PzogSUV4ZWN1dGlvbkxvZ0NvbnRleHQ7XG5cdH0gJiBJRGlzcG9zYWJsZT4oKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgc2Vzc2lvbklkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSBfYnJvd3NlcjogQnJvd3Nlcixcblx0XHRyZWFkb25seSBncm91cDogSUJyb3dzZXJWaWV3R3JvdXAsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBhY3Rpb25TY29wZTogSVBsYXl3cmlnaHRBY3Rpb25TY29wZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYWdlbnROZXR3b3JrRmlsdGVyU2VydmljZTogSUFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkQ3JlYXRlUGFnZTogKHZpZXdJZDogc3RyaW5nKSA9PiBQcm9taXNlPHZvaWQ+LFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ncm91cCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ncm91cC5vbkRpZEFkZFZpZXcoZSA9PiB0aGlzLl9vblZpZXdBZGRlZChlLnZpZXdJZCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmdyb3VwLm9uRGlkUmVtb3ZlVmlldyhlID0+IHRoaXMuX29uVmlld1JlbW92ZWQoZS52aWV3SWQpKSk7XG5cblx0XHR0aGlzLl9zY2FuRm9yTmV3Q29udGV4dHMoKTtcblx0fVxuXG5cdC8qKiBSZWdpc3RlciBhIGRpc3Bvc2FibGUgdG8gYmUgY2xlYW5lZCB1cCB3aGVuIHRoaXMgc2Vzc2lvbiBpcyBkaXNwb3NlZC4gKi9cblx0cmVnaXN0ZXJEaXNwb3NhYmxlKGQ6IElEaXNwb3NhYmxlKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZCk7XG5cdH1cblxuXHQvLyAtLS0gUGFnZSBvcGVyYXRpb25zIC0tLVxuXG5cdGFzeW5jIG9wZW5QYWdlKHVybDogc3RyaW5nKTogUHJvbWlzZTx7IHBhZ2VJZDogc3RyaW5nOyBzdW1tYXJ5OiBzdHJpbmcgfT4ge1xuXHRcdGlmICghdGhpcy5fb3BlbkNvbnRleHQpIHtcblx0XHRcdHRoaXMuX29wZW5Db250ZXh0ID0gYXdhaXQgdGhpcy5fYnJvd3Nlci5uZXdDb250ZXh0KCk7XG5cdFx0XHR0aGlzLl9vbkNvbnRleHRBZGRlZCh0aGlzLl9vcGVuQ29udGV4dCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFnZSA9IGF3YWl0IHRoaXMuX29wZW5Db250ZXh0Lm5ld1BhZ2UoKTtcblx0XHRjb25zdCB2aWV3SWQgPSBhd2FpdCB0aGlzLl9vblBhZ2VBZGRlZChwYWdlKTtcblx0XHRhd2FpdCB0aGlzLm9uRGlkQ3JlYXRlUGFnZSh2aWV3SWQpO1xuXG5cdFx0aWYgKHVybCAmJiB1cmwgIT09ICdhYm91dDpibGFuaycgJiYgcGFnZS51cmwoKSAhPT0gdXJsKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBwYWdlLmdvdG8odXJsLCB7IHdhaXRVbnRpbDogJ2RvbWNvbnRlbnRsb2FkZWQnLCB0aW1lb3V0OiBPUEVOX1BBR0VfTkFWSUdBVElPTl9USU1FT1VUX01TIH0pO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0aWYgKCFpc05hdmlnYXRpb25UaW1lb3V0RXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5hdmlnYXRpb24gdG8gJHt1cmx9IHRpbWVkIG91dCBhZnRlciAke09QRU5fUEFHRV9OQVZJR0FUSU9OX1RJTUVPVVRfTVN9IG1zLiBUaGUgcGFnZSAoSUQ6ICR7dmlld0lkfSkgaXMgb3BlbiBhbmQgY2FuIGJlIHJldXNlZC5gKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBzdW1tYXJ5ID0gYXdhaXQgdGhpcy5fZ2V0U3VtbWFyeSh2aWV3SWQpO1xuXHRcdHJldHVybiB7IHBhZ2VJZDogdmlld0lkLCBzdW1tYXJ5IH07XG5cdH1cblxuXHRhc3luYyBnZXRTdW1tYXJ5KHBhZ2VJZDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0U3VtbWFyeShwYWdlSWQsIHRydWUpO1xuXHR9XG5cblx0YXN5bmMgaW52b2tlRnVuY3Rpb25SYXc8VD4ocGFnZUlkOiBzdHJpbmcsIGZuRGVmOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8VD4ge1xuXHRcdGNvbnN0IGZuID0gYXdhaXQgdGhpcy5fY29tcGlsZUZ1bmN0aW9uKGZuRGVmKTtcblx0XHRyZXR1cm4gdGhpcy5fcnVuQWdhaW5zdFBhZ2UocGFnZUlkLCAocGFnZSkgPT4gZm4ocGFnZSwgYXJncykgYXMgVCk7XG5cdH1cblxuXHRhc3luYyBpbnZva2VGdW5jdGlvbihwYWdlSWQ6IHN0cmluZywgZm5EZWY6IHN0cmluZywgYXJnczogdW5rbm93bltdID0gW10sIHRpbWVvdXRNcz86IG51bWJlcik6IFByb21pc2U8SUludm9rZUZ1bmN0aW9uUmVzdWx0PiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFtQbGF5d3JpZ2h0U2Vzc2lvbl0gSW52b2tpbmcgZnVuY3Rpb24gb24gdmlldyAke3BhZ2VJZH1gKTtcblxuXHRcdGNvbnN0IGxvZ0N0eDogSUV4ZWN1dGlvbkxvZ0NvbnRleHQgPSB7XG5cdFx0XHRzdGFydGVkQXQ6IERhdGUubm93KCksXG5cdFx0XHRjb2RlTGVuZ3RoOiBmbkRlZi5sZW5ndGgsXG5cdFx0XHRjb2RlTGluZUNvdW50OiBmbkRlZi5zcGxpdCgnXFxuJykubGVuZ3RoLFxuXHRcdFx0cGFnZU1ldGhvZHNDYWxsZWQ6IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCksXG5cdFx0XHR3YXNEZWZlcnJlZDogZmFsc2UsXG5cdFx0XHRyZXN1bWVDb3VudDogMCxcblx0XHRcdGxvZ2dlZDogZmFsc2UsXG5cdFx0fTtcblxuXHRcdGxldCBmbjtcblx0XHR0cnkge1xuXHRcdFx0Zm4gPSBhd2FpdCB0aGlzLl9jb21waWxlRnVuY3Rpb24oZm5EZWYpO1xuXHRcdH0gY2F0Y2ggKGVycjogdW5rbm93bikge1xuXHRcdFx0Ly8gU3VyZmFjZSBjb21waWxlL3N5bnRheCBlcnJvcnMgYXMgeyBlcnJvciwgc3VtbWFyeSB9LCBsaWtlIG90aGVyIGV4ZWN1dGlvbiBmYWlsdXJlcy5cblx0XHRcdHRoaXMuX2xvZ0V4ZWN1dGlvbihsb2dDdHgsIGZhbHNlKTtcblx0XHRcdGNvbnN0IHN1bW1hcnkgPSBhd2FpdCB0aGlzLl9nZXRTdW1tYXJ5KHBhZ2VJZCk7XG5cdFx0XHRyZXR1cm4geyBlcnJvcjogZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpLCBzdW1tYXJ5IH07XG5cdFx0fVxuXHRcdGNvbnN0IHdyYXBwZWRDYWxsYmFjayA9IGFzeW5jIChwYWdlOiBQYWdlKSA9PiBmbihjcmVhdGVQYWdlQXBpUHJveHkocGFnZSwgbG9nQ3R4LnBhZ2VNZXRob2RzQ2FsbGVkKSwgYXJncyk7XG5cblx0XHRpZiAodGltZW91dE1zICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9ydW5XaXRoRGVmZXJyYWwocGFnZUlkLCB3cmFwcGVkQ2FsbGJhY2ssIHRpbWVvdXRNcywgdW5kZWZpbmVkLCBsb2dDdHgpO1xuXHRcdH1cblxuXHRcdGxldCByZXN1bHQsIGVycm9yO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXN1bHQgPSBhd2FpdCB0aGlzLl9ydW5BZ2FpbnN0UGFnZShwYWdlSWQsIHdyYXBwZWRDYWxsYmFjayk7XG5cdFx0fSBjYXRjaCAoZXJyOiB1bmtub3duKSB7XG5cdFx0XHRlcnJvciA9IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKTtcblx0XHR9XG5cblx0XHR0aGlzLl9sb2dFeGVjdXRpb24obG9nQ3R4LCAhZXJyb3IpO1xuXHRcdGNvbnN0IHN1bW1hcnkgPSBhd2FpdCB0aGlzLl9nZXRTdW1tYXJ5KHBhZ2VJZCk7XG5cdFx0cmV0dXJuIHsgcmVzdWx0LCBlcnJvciwgc3VtbWFyeSB9O1xuXHR9XG5cblx0YXN5bmMgd2FpdEZvckRlZmVycmVkUmVzdWx0KGRlZmVycmVkUmVzdWx0SWQ6IHN0cmluZywgdGltZW91dE1zOiBudW1iZXIpOiBQcm9taXNlPElJbnZva2VGdW5jdGlvblJlc3VsdD4ge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZGVmZXJyZWRSZXN1bHRzLmdldChkZWZlcnJlZFJlc3VsdElkKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIGRlZmVycmVkIHJlc3VsdCBmb3VuZCB3aXRoIElEIFwiJHtkZWZlcnJlZFJlc3VsdElkfVwiLiBJdCBtYXkgaGF2ZSBiZWVuIGNsZWFuZWQgdXAgb3IgYWxyZWFkeSBjb25zdW1lZC5gKTtcblx0XHR9XG5cblx0XHRjb25zdCB7IHBhZ2VJZCwgcHJvbWlzZSwgbG9nQ3R4IH0gPSBlbnRyeTtcblx0XHRpZiAobG9nQ3R4KSB7XG5cdFx0XHRsb2dDdHgucmVzdW1lQ291bnQrKztcblx0XHR9XG5cdFx0dGhpcy5fZGVmZXJyZWRSZXN1bHRzLmRlbGV0ZUFuZERpc3Bvc2UoZGVmZXJyZWRSZXN1bHRJZCk7XG5cdFx0cmV0dXJuIHRoaXMuX3J1bldpdGhEZWZlcnJhbChwYWdlSWQsICgpID0+IHByb21pc2UsIHRpbWVvdXRNcywgZGVmZXJyZWRSZXN1bHRJZCwgbG9nQ3R4KTtcblx0fVxuXG5cdGFzeW5jIHJlcGx5VG9GaWxlQ2hvb3NlcihwYWdlSWQ6IHN0cmluZywgZmlsZXM6IHN0cmluZ1tdKTogUHJvbWlzZTx7IHN1bW1hcnk6IHN0cmluZyB9PiB7XG5cdFx0Y29uc3QgcGFnZSA9IGF3YWl0IHRoaXMuX2dldFBhZ2UocGFnZUlkKTtcblx0XHRjb25zdCB0YWIgPSB0aGlzLl90YWJzLmdldChwYWdlKTtcblx0XHRpZiAoIXRhYikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gcmVwbHkgdG8gZmlsZSBjaG9vc2VyJyk7XG5cdFx0fVxuXHRcdGF3YWl0IHRhYi5yZXBseVRvRmlsZUNob29zZXIoZmlsZXMpO1xuXHRcdGNvbnN0IHN1bW1hcnkgPSBhd2FpdCB0YWIuZ2V0U3VtbWFyeSgpO1xuXHRcdHJldHVybiB7IHN1bW1hcnkgfTtcblx0fVxuXG5cdGFzeW5jIHJlcGx5VG9EaWFsb2cocGFnZUlkOiBzdHJpbmcsIGFjY2VwdDogYm9vbGVhbiwgcHJvbXB0VGV4dD86IHN0cmluZyk6IFByb21pc2U8eyBzdW1tYXJ5OiBzdHJpbmcgfT4ge1xuXHRcdGNvbnN0IHBhZ2UgPSBhd2FpdCB0aGlzLl9nZXRQYWdlKHBhZ2VJZCk7XG5cdFx0Y29uc3QgdGFiID0gdGhpcy5fdGFicy5nZXQocGFnZSk7XG5cdFx0aWYgKCF0YWIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIHJlcGx5IHRvIGRpYWxvZycpO1xuXHRcdH1cblx0XHRhd2FpdCB0YWIucmVwbHlUb0RpYWxvZyhhY2NlcHQsIHByb21wdFRleHQpO1xuXHRcdGNvbnN0IHN1bW1hcnkgPSBhd2FpdCB0YWIuZ2V0U3VtbWFyeSgpO1xuXHRcdHJldHVybiB7IHN1bW1hcnkgfTtcblx0fVxuXG5cdC8vIC0tLSBQcml2YXRlOiBwYWdlIG9wZXJhdGlvbnMgLS0tXG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0U3VtbWFyeShwYWdlSWQ6IHN0cmluZywgZnVsbCA9IGZhbHNlKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBwYWdlID0gYXdhaXQgdGhpcy5fZ2V0UGFnZShwYWdlSWQpO1xuXHRcdGNvbnN0IHRhYiA9IHRoaXMuX3RhYnMuZ2V0KHBhZ2UpO1xuXHRcdGlmICghdGFiKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBnZXQgcGFnZSBzdW1tYXJ5Jyk7XG5cdFx0fVxuXHRcdHJldHVybiB0YWIuZ2V0U3VtbWFyeShmdWxsKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3J1bkFnYWluc3RQYWdlPFQ+KHBhZ2VJZDogc3RyaW5nLCBjYWxsYmFjazogKHBhZ2U6IFBhZ2UpID0+IFQgfCBQcm9taXNlPFQ+KTogUHJvbWlzZTxUPiB7XG5cdFx0Y29uc3QgcGFnZSA9IGF3YWl0IHRoaXMuX2dldFBhZ2UocGFnZUlkKTtcblx0XHRjb25zdCB0YWIgPSB0aGlzLl90YWJzLmdldChwYWdlKTtcblx0XHRpZiAoIXRhYikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZXhlY3V0ZSBmdW5jdGlvbiBhZ2FpbnN0IHBhZ2UnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRhYi5zYWZlUnVuQWdhaW5zdFBhZ2UoYXN5bmMgKCkgPT4gY2FsbGJhY2socGFnZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcnVuV2l0aERlZmVycmFsKHBhZ2VJZDogc3RyaW5nLCBjYWxsYmFjazogKHBhZ2U6IFBhZ2UpID0+IFByb21pc2U8dW5rbm93bj4sIHRpbWVvdXRNczogbnVtYmVyLCBleGlzdGluZ0RlZmVycmVkSWQ/OiBzdHJpbmcsIGxvZ0N0eD86IElFeGVjdXRpb25Mb2dDb250ZXh0KTogUHJvbWlzZTxJSW52b2tlRnVuY3Rpb25SZXN1bHQ+IHtcblx0XHRjb25zdCBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2UoKTtcblx0XHRkZWZlcnJlZC5wLmNhdGNoKCgpID0+IHsgLyogd2FpdEZvckRlZmVycmVkUmVzdWx0IG9ic2VydmVzIHRoZSByZWplY3Rpb24gd2hlbiByZXN1bWVkICovIH0pO1xuXG5cdFx0Ly8gQXR0YWNoIHNldHRsZW1lbnQgbG9nZ2luZyBvbmNlLCBvbiB0aGUgaW5pdGlhdGluZyBjYWxsOiBgZGVmZXJyZWQucGAgc2V0dGxlc1xuXHRcdC8vIHdoZW4gdGhlIHBhZ2Ugd29yayBmaW5pc2hlcyBubyBtYXR0ZXIgaG93IG1hbnkgdGltZXMgdGhlIHJlc3VsdCBpcyBkZWZlcnJlZCxcblx0XHQvLyByZXN1bWVkLCBvciBhYmFuZG9uZWQsIHNvIGEgZGVmZXJyZWQgcnVuIGlzIHN0aWxsIGxvZ2dlZCBvbmNlIGl0IHNldHRsZXMuXG5cdFx0Ly8gYF9sb2dFeGVjdXRpb25gIGlzIGlkZW1wb3RlbnQsIHNvIHRoaXMgaXMgYSBuby1vcCBpZiB0aGUgc3luY2hyb25vdXMgcGF0aFxuXHRcdC8vIGJlbG93IGFscmVhZHkgbG9nZ2VkIGEgbm9uLWRlZmVycmVkIGNvbXBsZXRpb24uXG5cdFx0aWYgKGV4aXN0aW5nRGVmZXJyZWRJZCA9PT0gdW5kZWZpbmVkICYmIGxvZ0N0eCkge1xuXHRcdFx0ZGVmZXJyZWQucC50aGVuKCgpID0+IHRoaXMuX2xvZ0V4ZWN1dGlvbihsb2dDdHgsIHRydWUpLCAoKSA9PiB0aGlzLl9sb2dFeGVjdXRpb24obG9nQ3R4LCBmYWxzZSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdyYXBwZWRQcm9taXNlID0gdGhpcy5fcnVuQWdhaW5zdFBhZ2UocGFnZUlkLCBhc3luYyAocGFnZSkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvbWlzZSA9IGNhbGxiYWNrKHBhZ2UpO1xuXHRcdFx0cHJvbWlzZS5jYXRjaCgoKSA9PiB7IC8qIHByZXZlbnQgdW5oYW5kbGVkIHJlamVjdGlvbiBpZiBkZWZlcnJlZCAqLyB9KTtcblx0XHRcdGRlZmVycmVkLnNldHRsZVdpdGgocHJvbWlzZSk7XG5cdFx0XHRyZXR1cm4gcHJvbWlzZTtcblx0XHR9KTtcblxuXHRcdGxldCByZXN1bHQsIGVycm9yO1xuXHRcdGxldCBpbnRlcnJ1cHRlZCA9IGZhbHNlO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHJlc3VsdCA9IGF3YWl0IHJhY2VUaW1lb3V0KHdyYXBwZWRQcm9taXNlLCB0aW1lb3V0TXMsICgpID0+IHsgaW50ZXJydXB0ZWQgPSB0cnVlOyB9KTtcblx0XHR9IGNhdGNoIChlcnI6IHVua25vd24pIHtcblx0XHRcdGlmIChlcnIgaW5zdGFuY2VvZiBEaWFsb2dJbnRlcnJ1cHRlZEVycm9yKSB7XG5cdFx0XHRcdGludGVycnVwdGVkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGVycm9yID0gZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpO1xuXHRcdH1cblxuXHRcdGxldCBkZWZlcnJlZFJlc3VsdElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGludGVycnVwdGVkKSB7XG5cdFx0XHRpZiAobG9nQ3R4KSB7XG5cdFx0XHRcdGxvZ0N0eC53YXNEZWZlcnJlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRkZWZlcnJlZFJlc3VsdElkID0gZXhpc3RpbmdEZWZlcnJlZElkID8/IGdlbmVyYXRlVXVpZCgpO1xuXHRcdFx0Y29uc3QgY2xlYW51cCA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHRoaXMuX2RlZmVycmVkUmVzdWx0cy5kZWxldGVBbmREaXNwb3NlKGRlZmVycmVkUmVzdWx0SWQhKSwgREVGRVJSRURfUkVTVUxUX0NMRUFOVVBfTVMpO1xuXHRcdFx0dGhpcy5fZGVmZXJyZWRSZXN1bHRzLnNldChkZWZlcnJlZFJlc3VsdElkLCB7IHBhZ2VJZCwgcHJvbWlzZTogZGVmZXJyZWQucCwgbG9nQ3R4LCBkaXNwb3NlOiAoKSA9PiBjbGVhbnVwLmRpc3Bvc2UoKSB9KTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBbUGxheXdyaWdodFNlc3Npb25dIEV4ZWN1dGlvbiBpbnRlcnJ1cHRlZCwgZGVmZXJyZWQgYXMgJHtkZWZlcnJlZFJlc3VsdElkfWApO1xuXHRcdH0gZWxzZSBpZiAobG9nQ3R4KSB7XG5cdFx0XHQvLyBDb21wbGV0ZWQgb3IgZmFpbGVkIHdpdGhpbiB0aGUgdGltZW91dDogbG9nIHRoZSBvdXRjb21lIG5vdyByYXRoZXIgdGhhblxuXHRcdFx0Ly8gcmVseWluZyBvbiB0aGUgc2V0dGxlbWVudCBwcm9taXNlLCB3aGljaCBuZXZlciBzZXR0bGVzIGlmIHRoZSBwYWdlIHdvcmtcblx0XHRcdC8vIHRocmV3IGJlZm9yZSBgc2V0dGxlV2l0aGAgcmFuIChlLmcuIHRoZSBwYWdlIGNvdWxkIG5vdCBiZSByZXNvbHZlZCkuXG5cdFx0XHR0aGlzLl9sb2dFeGVjdXRpb24obG9nQ3R4LCAhZXJyb3IpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN1bW1hcnkgPSBhd2FpdCB0aGlzLl9nZXRTdW1tYXJ5KHBhZ2VJZCk7XG5cdFx0cmV0dXJuIHsgcmVzdWx0LCBlcnJvciwgc3VtbWFyeSwgZGVmZXJyZWRSZXN1bHRJZCB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEVtaXQgY29tcGxldGlvbiB0ZWxlbWV0cnkgZm9yIGEgc2luZ2xlIHtAbGluayBpbnZva2VGdW5jdGlvbn0gY2FsbCwgb25jZSB0aGVcblx0ICogcGFnZSB3b3JrIHNldHRsZXMuIElkZW1wb3RlbnQ6IG9ubHkgdGhlIGZpcnN0IGNhbGwgZm9yIGEgZ2l2ZW4gY29udGV4dCBlbWl0cyxcblx0ICogc28gdGhlIHN5bmNocm9ub3VzIGFuZCBzZXR0bGVtZW50LXByb21pc2UgcGF0aHMgY2FuIGJvdGggY2FsbCBpdCBzYWZlbHkuXG5cdCAqL1xuXHRwcml2YXRlIF9sb2dFeGVjdXRpb24oY3R4OiBJRXhlY3V0aW9uTG9nQ29udGV4dCwgc3VjY2VzczogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChjdHgubG9nZ2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGN0eC5sb2dnZWQgPSB0cnVlO1xuXHRcdGNvbnN0IGVudHJpZXMgPSBbLi4uY3R4LnBhZ2VNZXRob2RzQ2FsbGVkLmVudHJpZXMoKV07XG5cdFx0Y29uc3QgdG90YWwgPSBlbnRyaWVzLnJlZHVjZSgoc3VtLCBbLCBjb3VudF0pID0+IHN1bSArIGNvdW50LCAwKTtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxSdW5QbGF5d3JpZ2h0Q29kZUV2ZW50LCBSdW5QbGF5d3JpZ2h0Q29kZUNsYXNzaWZpY2F0aW9uPihcblx0XHRcdCdpbnRlZ3JhdGVkQnJvd3Nlci50b29scy5ydW5QbGF5d3JpZ2h0Q29kZS5jb21wbGV0ZWQnLFxuXHRcdFx0e1xuXHRcdFx0XHRwYWdlTWV0aG9kc0NhbGxlZDogSlNPTi5zdHJpbmdpZnkoT2JqZWN0LmZyb21FbnRyaWVzKGVudHJpZXMpKSxcblx0XHRcdFx0cGFnZU1ldGhvZHNDYWxsZWREY291bnQ6IGVudHJpZXMubGVuZ3RoLFxuXHRcdFx0XHRwYWdlTWV0aG9kc0NhbGxlZENvdW50OiB0b3RhbCxcblx0XHRcdFx0c3VjY2Vzczogc3VjY2VzcyA/IDEgOiAwLFxuXHRcdFx0XHR3YXNEZWZlcnJlZDogY3R4Lndhc0RlZmVycmVkID8gMSA6IDAsXG5cdFx0XHRcdHJlc3VtZUNvdW50OiBjdHgucmVzdW1lQ291bnQsXG5cdFx0XHRcdGR1cmF0aW9uTXM6IE1hdGgucm91bmQoRGF0ZS5ub3coKSAtIGN0eC5zdGFydGVkQXQpLFxuXHRcdFx0XHRjb2RlTGVuZ3RoOiBjdHguY29kZUxlbmd0aCxcblx0XHRcdFx0Y29kZUxpbmVDb3VudDogY3R4LmNvZGVMaW5lQ291bnQsXG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NvbXBpbGVGdW5jdGlvbihmbkRlZjogc3RyaW5nKTogUHJvbWlzZTwocGFnZTogUGFnZSwgYXJnczogdW5rbm93bltdKSA9PiB1bmtub3duPiB7XG5cdFx0Y29uc3Qgdm0gPSBhd2FpdCBpbXBvcnQoJ3ZtJyk7XG5cdFx0cmV0dXJuIHZtLmNvbXBpbGVGdW5jdGlvbihgcmV0dXJuICgke2ZuRGVmfSkocGFnZSwgLi4uYXJncylgLCBbJ3BhZ2UnLCAnYXJncyddLCB7IHBhcnNpbmdDb250ZXh0OiB2bS5jcmVhdGVDb250ZXh0KCkgfSkgYXMgKHBhZ2U6IFBhZ2UsIGFyZ3M6IHVua25vd25bXSkgPT4gdW5rbm93bjtcblx0fVxuXG5cdC8vIC0tLSBQcml2YXRlOiBwYWdlIG1hdGNoaW5nICh2aWV3IFx1MjE5NCBwYWdlIHBhaXJpbmcpIC0tLVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldFBhZ2Uodmlld0lkOiBzdHJpbmcpOiBQcm9taXNlPFBhZ2U+IHtcblx0XHRjb25zdCByZXNvbHZlZCA9IHRoaXMuX3ZpZXdJZFRvUGFnZS5nZXQodmlld0lkKTtcblx0XHRpZiAocmVzb2x2ZWQpIHtcblx0XHRcdHJldHVybiByZXNvbHZlZDtcblx0XHR9XG5cdFx0Y29uc3QgcXVldWVkID0gdGhpcy5fdmlld0lkUXVldWUuZmluZChpdGVtID0+IGl0ZW0udmlld0lkID09PSB2aWV3SWQpO1xuXHRcdGlmIChxdWV1ZWQpIHtcblx0XHRcdHJldHVybiBxdWV1ZWQucGFnZS5wO1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoYFBhZ2UgXCIke3ZpZXdJZH1cIiBub3QgZm91bmRgKTtcblx0fVxuXG5cdHByaXZhdGUgX29uVmlld0FkZGVkKHZpZXdJZDogc3RyaW5nLCB0aW1lb3V0TXMgPSAxMDAwMCk6IFByb21pc2U8UGFnZT4ge1xuXHRcdGNvbnN0IHJlc29sdmVkID0gdGhpcy5fdmlld0lkVG9QYWdlLmdldCh2aWV3SWQpO1xuXHRcdGlmIChyZXNvbHZlZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXNvbHZlZCk7XG5cdFx0fVxuXHRcdGNvbnN0IHF1ZXVlZCA9IHRoaXMuX3ZpZXdJZFF1ZXVlLmZpbmQoaXRlbSA9PiBpdGVtLnZpZXdJZCA9PT0gdmlld0lkKTtcblx0XHRpZiAocXVldWVkKSB7XG5cdFx0XHRyZXR1cm4gcXVldWVkLnBhZ2UucDtcblx0XHR9XG5cblx0XHRjb25zdCBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8UGFnZT4oKTtcblx0XHRjb25zdCB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiBkZWZlcnJlZC5lcnJvcihuZXcgRXJyb3IoYFRpbWVkIG91dCB3YWl0aW5nIGZvciBwYWdlYCkpLCB0aW1lb3V0TXMpO1xuXG5cdFx0ZGVmZXJyZWQucC5maW5hbGx5KCgpID0+IHtcblx0XHRcdGNsZWFyVGltZW91dCh0aW1lb3V0KTtcblx0XHRcdHRoaXMuX3ZpZXdJZFF1ZXVlID0gdGhpcy5fdmlld0lkUXVldWUuZmlsdGVyKGl0ZW0gPT4gaXRlbS52aWV3SWQgIT09IHZpZXdJZCk7XG5cdFx0XHRpZiAodGhpcy5fdmlld0lkUXVldWUubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuX3N0b3BTY2FubmluZygpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fdmlld0lkUXVldWUucHVzaCh7IHZpZXdJZCwgcGFnZTogZGVmZXJyZWQgfSk7XG5cdFx0dGhpcy5fdHJ5TWF0Y2goKTtcblx0XHR0aGlzLl9lbnN1cmVTY2FubmluZygpO1xuXG5cdFx0cmV0dXJuIGRlZmVycmVkLnA7XG5cdH1cblxuXHRwcml2YXRlIF9vblZpZXdSZW1vdmVkKHZpZXdJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fdmlld0lkUXVldWUgPSB0aGlzLl92aWV3SWRRdWV1ZS5maWx0ZXIoaXRlbSA9PiBpdGVtLnZpZXdJZCAhPT0gdmlld0lkKTtcblx0XHRjb25zdCBwYWdlID0gdGhpcy5fdmlld0lkVG9QYWdlLmdldCh2aWV3SWQpO1xuXHRcdGlmIChwYWdlKSB7XG5cdFx0XHR0aGlzLl9wYWdlVG9WaWV3SWQuZGVsZXRlKHBhZ2UpO1xuXHRcdH1cblx0XHR0aGlzLl92aWV3SWRUb1BhZ2UuZGVsZXRlKHZpZXdJZCk7XG5cdH1cblxuXHRwcml2YXRlIF9vblBhZ2VBZGRlZChwYWdlOiBQYWdlLCB0aW1lb3V0TXMgPSAxMDAwMCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSB0aGlzLl9wYWdlVG9WaWV3SWQuZ2V0KHBhZ2UpO1xuXHRcdGlmIChyZXNvbHZlZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXNvbHZlZCk7XG5cdFx0fVxuXHRcdGNvbnN0IHF1ZXVlZCA9IHRoaXMuX3BhZ2VRdWV1ZS5maW5kKGl0ZW0gPT4gaXRlbS5wYWdlID09PSBwYWdlKTtcblx0XHRpZiAocXVldWVkKSB7XG5cdFx0XHRyZXR1cm4gcXVldWVkLnZpZXdJZC5wO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uQ29udGV4dEFkZGVkKHBhZ2UuY29udGV4dCgpKTtcblx0XHRwYWdlLm9uY2UoJ2Nsb3NlJywgKCkgPT4gdGhpcy5fb25QYWdlUmVtb3ZlZChwYWdlKSk7XG5cdFx0cGFnZS5zZXREZWZhdWx0VGltZW91dCgxMDAwMCk7XG5cdFx0dGhpcy5fdGFicy5zZXQocGFnZSwgbmV3IFBsYXl3cmlnaHRUYWIocGFnZSwgdGhpcy5hY3Rpb25TY29wZSwgdGhpcy5hZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlKSk7XG5cblx0XHRjb25zdCBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8c3RyaW5nPigpO1xuXHRcdGNvbnN0IHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IGRlZmVycmVkLmVycm9yKG5ldyBFcnJvcihgVGltZWQgb3V0IHdhaXRpbmcgZm9yIGJyb3dzZXIgdmlld2ApKSwgdGltZW91dE1zKTtcblx0XHRkZWZlcnJlZC5wLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuXHRcdFx0dGhpcy5fcGFnZVF1ZXVlID0gdGhpcy5fcGFnZVF1ZXVlLmZpbHRlcihpdGVtID0+IGl0ZW0ucGFnZSAhPT0gcGFnZSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9wYWdlUXVldWUucHVzaCh7IHBhZ2UsIHZpZXdJZDogZGVmZXJyZWQgfSk7XG5cdFx0dGhpcy5fdHJ5TWF0Y2goKTtcblxuXHRcdHJldHVybiBkZWZlcnJlZC5wO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25QYWdlUmVtb3ZlZChwYWdlOiBQYWdlKTogdm9pZCB7XG5cdFx0dGhpcy5fcGFnZVF1ZXVlID0gdGhpcy5fcGFnZVF1ZXVlLmZpbHRlcihpdGVtID0+IGl0ZW0ucGFnZSAhPT0gcGFnZSk7XG5cdFx0Y29uc3Qgdmlld0lkID0gdGhpcy5fcGFnZVRvVmlld0lkLmdldChwYWdlKTtcblx0XHRpZiAodmlld0lkKSB7XG5cdFx0XHR0aGlzLl92aWV3SWRUb1BhZ2UuZGVsZXRlKHZpZXdJZCk7XG5cdFx0fVxuXHRcdHRoaXMuX3BhZ2VUb1ZpZXdJZC5kZWxldGUocGFnZSk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkNvbnRleHRBZGRlZChjb250ZXh0OiBCcm93c2VyQ29udGV4dCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl93YXRjaGVkQ29udGV4dHMuaGFzKGNvbnRleHQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3dhdGNoZWRDb250ZXh0cy5hZGQoY29udGV4dCk7XG5cdFx0Y29udGV4dC5vbigncGFnZScsIChwYWdlOiBQYWdlKSA9PiB0aGlzLl9vblBhZ2VBZGRlZChwYWdlKSk7XG5cdFx0Y29udGV4dC5vbignY2xvc2UnLCAoKSA9PiB0aGlzLl93YXRjaGVkQ29udGV4dHMuZGVsZXRlKGNvbnRleHQpKTtcblx0XHRmb3IgKGNvbnN0IHBhZ2Ugb2YgY29udGV4dC5wYWdlcygpKSB7XG5cdFx0XHR0aGlzLl9vblBhZ2VBZGRlZChwYWdlKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gUHJpdmF0ZTogbWF0Y2hpbmcgLS0tXG5cblx0cHJpdmF0ZSBfdHJ5TWF0Y2goKTogdm9pZCB7XG5cdFx0d2hpbGUgKHRoaXMuX3ZpZXdJZFF1ZXVlLmxlbmd0aCA+IDAgJiYgdGhpcy5fcGFnZVF1ZXVlLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHZpZXdJZEl0ZW0gPSB0aGlzLl92aWV3SWRRdWV1ZS5zaGlmdCgpITtcblx0XHRcdGNvbnN0IHBhZ2VJdGVtID0gdGhpcy5fcGFnZVF1ZXVlLnNoaWZ0KCkhO1xuXG5cdFx0XHR0aGlzLl92aWV3SWRUb1BhZ2Uuc2V0KHZpZXdJZEl0ZW0udmlld0lkLCBwYWdlSXRlbS5wYWdlKTtcblx0XHRcdHRoaXMuX3BhZ2VUb1ZpZXdJZC5zZXQocGFnZUl0ZW0ucGFnZSwgdmlld0lkSXRlbS52aWV3SWQpO1xuXG5cdFx0XHR2aWV3SWRJdGVtLnBhZ2UuY29tcGxldGUocGFnZUl0ZW0ucGFnZSk7XG5cdFx0XHRwYWdlSXRlbS52aWV3SWQuY29tcGxldGUodmlld0lkSXRlbS52aWV3SWQpO1xuXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtQbGF5d3JpZ2h0U2Vzc2lvbl0gTWF0Y2hlZCB2aWV3ICR7dmlld0lkSXRlbS52aWV3SWR9IFx1MjE5MiBwYWdlYCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3ZpZXdJZFF1ZXVlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fc3RvcFNjYW5uaW5nKCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIFByaXZhdGU6IGNvbnRleHQgc2Nhbm5pbmcgLS0tXG5cblx0cHJpdmF0ZSBfc2NhbkZvck5ld0NvbnRleHRzKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgY29udGV4dCBvZiB0aGlzLl9icm93c2VyLmNvbnRleHRzKCkpIHtcblx0XHRcdHRoaXMuX29uQ29udGV4dEFkZGVkKGNvbnRleHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2Vuc3VyZVNjYW5uaW5nKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zY2FuVGltZXIgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fc2NhblRpbWVyID0gc2V0SW50ZXJ2YWwoKCkgPT4gdGhpcy5fc2NhbkZvck5ld0NvbnRleHRzKCksIDEwMCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc3RvcFNjYW5uaW5nKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zY2FuVGltZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y2xlYXJJbnRlcnZhbCh0aGlzLl9zY2FuVGltZXIpO1xuXHRcdFx0dGhpcy5fc2NhblRpbWVyID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RvcFNjYW5uaW5nKCk7XG5cdFx0dGhpcy5fYnJvd3Nlcj8uY2xvc2UoKS5jYXRjaCgoKSA9PiB7IC8qIGlnbm9yZSAqLyB9KTtcblx0XHRmb3IgKGNvbnN0IHsgcGFnZSB9IG9mIHRoaXMuX3ZpZXdJZFF1ZXVlKSB7XG5cdFx0XHRwYWdlLmVycm9yKG5ldyBFcnJvcignUGxheXdyaWdodFNlc3Npb24gZGlzcG9zZWQnKSk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgeyB2aWV3SWQgfSBvZiB0aGlzLl9wYWdlUXVldWUpIHtcblx0XHRcdHZpZXdJZC5lcnJvcihuZXcgRXJyb3IoJ1BsYXl3cmlnaHRTZXNzaW9uIGRpc3Bvc2VkJykpO1xuXHRcdH1cblx0XHR0aGlzLl92aWV3SWRRdWV1ZSA9IFtdO1xuXHRcdHRoaXMuX3BhZ2VRdWV1ZSA9IFtdO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5mdW5jdGlvbiBpc05hdmlnYXRpb25UaW1lb3V0RXJyb3IoZXJyb3I6IHVua25vd24pOiBib29sZWFuIHtcblx0aWYgKCEoZXJyb3IgaW5zdGFuY2VvZiBFcnJvcikpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRyZXR1cm4gZXJyb3IubmFtZSA9PT0gJ1RpbWVvdXRFcnJvcidcblx0XHR8fCAvVGltZW91dCBcXGQrbXMgZXhjZWVkZWQvLnRlc3QoZXJyb3IubWVzc2FnZSlcblx0XHR8fCAvbmF2aWdhdGlvbiB0aW1lb3V0L2kudGVzdChlcnJvci5tZXNzYWdlKTtcbn1cblxuLyoqXG4gKiBQZXItaW52b2NhdGlvbiBzdGF0ZSB0aHJlYWRlZCB0aHJvdWdoIHtAbGluayBQbGF5d3JpZ2h0U2Vzc2lvbi5pbnZva2VGdW5jdGlvbn1cbiAqIGFuZCBpdHMgZGVmZXJyYWwgbWFjaGluZXJ5IHNvIGNvbXBsZXRpb24gdGVsZW1ldHJ5IGNhbiBiZSBlbWl0dGVkIGV4YWN0bHkgb25jZVxuICogd2hlbiB0aGUgdW5kZXJseWluZyBwYWdlIHdvcmsgc2V0dGxlcyAtIGV2ZW4gZm9yIGRlZmVycmVkIHJ1bnMgdGhlIGNhbGxlclxuICogbmV2ZXIgcmVzdW1lcy5cbiAqL1xuaW50ZXJmYWNlIElFeGVjdXRpb25Mb2dDb250ZXh0IHtcblx0LyoqIHtAbGluayBEYXRlLm5vd30gdGltZXN0YW1wIGNhcHR1cmVkIHdoZW4gdGhlIGludm9jYXRpb24gYmVnYW4uICovXG5cdHJlYWRvbmx5IHN0YXJ0ZWRBdDogbnVtYmVyO1xuXHQvKiogQ2hhcmFjdGVyIGxlbmd0aCBvZiB0aGUgZXhlY3V0ZWQgZnVuY3Rpb24gc291cmNlLiAqL1xuXHRyZWFkb25seSBjb2RlTGVuZ3RoOiBudW1iZXI7XG5cdC8qKiBMaW5lIGNvdW50IG9mIHRoZSBleGVjdXRlZCBmdW5jdGlvbiBzb3VyY2UuICovXG5cdHJlYWRvbmx5IGNvZGVMaW5lQ291bnQ6IG51bWJlcjtcblx0LyoqIFBlci1tZXRob2QgY2FsbCBjb3VudHMgYWNjdW11bGF0ZWQgYnkge0BsaW5rIGNyZWF0ZVBhZ2VBcGlQcm94eX0uICovXG5cdHJlYWRvbmx5IHBhZ2VNZXRob2RzQ2FsbGVkOiBNYXA8c3RyaW5nLCBudW1iZXI+O1xuXHQvKiogU2V0IG9uY2UgdGhlIGV4ZWN1dGlvbiBpcyBpbnRlcnJ1cHRlZCBhbmQgZGVmZXJyZWQgYXQgbGVhc3Qgb25jZS4gKi9cblx0d2FzRGVmZXJyZWQ6IGJvb2xlYW47XG5cdC8qKiBOdW1iZXIgb2YgdGltZXMgdGhlIGNhbGxlciByZXN1bWVkIHRoaXMgZXhlY3V0aW9uIHZpYSB7QGxpbmsgUGxheXdyaWdodFNlc3Npb24ud2FpdEZvckRlZmVycmVkUmVzdWx0fS4gKi9cblx0cmVzdW1lQ291bnQ6IG51bWJlcjtcblx0LyoqIEd1YXJkcyBhZ2FpbnN0IGRvdWJsZS1sb2dnaW5nOyBzZXQgYnkge0BsaW5rIFBsYXl3cmlnaHRTZXNzaW9uLl9sb2dFeGVjdXRpb259LiAqL1xuXHRsb2dnZWQ6IGJvb2xlYW47XG59XG5cbnR5cGUgUnVuUGxheXdyaWdodENvZGVFdmVudCA9IHtcblx0cGFnZU1ldGhvZHNDYWxsZWQ6IHN0cmluZztcblx0cGFnZU1ldGhvZHNDYWxsZWREY291bnQ6IG51bWJlcjtcblx0cGFnZU1ldGhvZHNDYWxsZWRDb3VudDogbnVtYmVyO1xuXHRzdWNjZXNzOiBudW1iZXI7XG5cdHdhc0RlZmVycmVkOiBudW1iZXI7XG5cdHJlc3VtZUNvdW50OiBudW1iZXI7XG5cdGR1cmF0aW9uTXM6IG51bWJlcjtcblx0Y29kZUxlbmd0aDogbnVtYmVyO1xuXHRjb2RlTGluZUNvdW50OiBudW1iZXI7XG59O1xuXG50eXBlIFJ1blBsYXl3cmlnaHRDb2RlQ2xhc3NpZmljYXRpb24gPSB7XG5cdHBhZ2VNZXRob2RzQ2FsbGVkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSlNPTiBvYmplY3QgbWFwcGluZyBkb3R0ZWQgYHBhZ2UuKmAgbWV0aG9kIG5hbWVzIHRvIHRoZWlyIGNhbGwgY291bnRzIChlLmcuIGB7XCJjbGlja1wiOjIsXCJrZXlib2FyZC5wcmVzc1wiOjV9YCksIGluIGZpcnN0LW9ic2VydmVkIG9yZGVyLicgfTtcblx0cGFnZU1ldGhvZHNDYWxsZWREY291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgZGlzdGluY3QgYHBhZ2UuKmAgbWV0aG9kcyBpbnZva2VkLicgfTtcblx0cGFnZU1ldGhvZHNDYWxsZWRDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RvdGFsIGBwYWdlLipgIG1ldGhvZCBjYWxscyBpbmNsdWRpbmcgZHVwbGljYXRlcyAoc3VtIG9mIGFsbCBwZXItbWV0aG9kIGNvdW50cykuJyB9O1xuXHRzdWNjZXNzOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnMSBpZiB0aGUgY29kZSBjb21wbGV0ZWQgd2l0aG91dCBlcnJvciwgMCBvdGhlcndpc2UuJyB9O1xuXHR3YXNEZWZlcnJlZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJzEgaWYgdGhlIGV4ZWN1dGlvbiB3YXMgaW50ZXJydXB0ZWQgYW5kIGRlZmVycmVkIGF0IGxlYXN0IG9uY2UsIDAgb3RoZXJ3aXNlLicgfTtcblx0cmVzdW1lQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgdGltZXMgdGhlIGNhbGxlciByZXN1bWVkIHRoaXMgZXhlY3V0aW9uIGJ5IHBvbGxpbmcgZm9yIGl0cyBkZWZlcnJlZCByZXN1bHQuIDAgbWVhbnMgdGhlIHJ1biBlaXRoZXIgY29tcGxldGVkIHdpdGhpbiB0aGUgZmlyc3QgdGltZW91dCBvciB3YXMgZGVmZXJyZWQgYW5kIG5ldmVyIHJlc3VtZWQgKHNldHRsZWQgaW4gdGhlIGJhY2tncm91bmQpLicgfTtcblx0ZHVyYXRpb25NczogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1dhbGwtY2xvY2sgdGltZSBpbiBtaWxsaXNlY29uZHMgZnJvbSBpbnZvY2F0aW9uIHN0YXJ0IHVudGlsIHRoZSBwYWdlIHdvcmsgc2V0dGxlZC4nIH07XG5cdGNvZGVMZW5ndGg6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdDaGFyYWN0ZXIgbGVuZ3RoIG9mIHRoZSBleGVjdXRlZCBmdW5jdGlvbiBzb3VyY2UuJyB9O1xuXHRjb2RlTGluZUNvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTGluZSBjb3VudCBvZiB0aGUgZXhlY3V0ZWQgZnVuY3Rpb24gc291cmNlLicgfTtcblx0b3duZXI6ICdqcnVhbGVzJztcblx0Y29tbWVudDogJ1RyYWNrcyBob3cgdGhlIHJ1bl9wbGF5d3JpZ2h0X2NvZGUgY2hhdCB0b29sIGlzIGV4ZXJjaXNlZC4nO1xufTtcblxuLyoqXG4gKiBQcm9wZXJ0eSBuYW1lcyB0aGF0IGFyZSBza2lwcGVkIGJ5IHtAbGluayBjcmVhdGVQYWdlQXBpUHJveHl9IHNvIHRoYXQgSlNcbiAqIHJ1bnRpbWUvaWRpb21hdGljIGFjY2Vzc2VzIGRvbid0IHNob3cgdXAgYXMgZmFrZSBBUEkgdXNhZ2UuIEluY2x1ZGVzXG4gKiBgdGhlbmAvYGNhdGNoYC9gZmluYWxseWAgKHNvIGF3YWl0aW5nIHRoZSBwcm94eSBuZXZlciByZWNvcmRzIG5vaXNlKSxcbiAqIGNvbnZlcnNpb24gaG9va3MsIGFuZCBgY29uc3RydWN0b3JgLlxuICovXG5jb25zdCBQQUdFX1BST1hZX0lHTk9SRURfUFJPUFMgPSBuZXcgU2V0PHN0cmluZz4oW1xuXHQndGhlbicsXG5cdCdjYXRjaCcsXG5cdCdmaW5hbGx5Jyxcblx0J3RvSlNPTicsXG5cdCd0b1N0cmluZycsXG5cdCd2YWx1ZU9mJyxcblx0J2NvbnN0cnVjdG9yJyxcbl0pO1xuXG4vKipcbiAqIE1heGltdW0gbmVzdGluZyBkZXB0aCBmb3IgdGhlIHJlY3Vyc2l2ZSBwYWdlIHByb3h5LiBUaGUgUGxheXdyaWdodCBgcGFnZWBcbiAqIHN1cmZhY2Ugb25seSBuZXN0cyBvbmUgbGV2ZWwgZGVlcCBpbiBwcmFjdGljZSAoZS5nLiBgcGFnZS5rZXlib2FyZC5wcmVzc2ApLFxuICogc28gMyBpcyBnZW5lcm91c2x5IGFib3ZlIGFueSByZWFsIHdvcmtsb2FkIHdoaWxlIHByZXZlbnRpbmcgcGF0aG9sb2dpY2FsXG4gKiBjYXNlcyBvbiBjeWNsaWMgc3RydWN0dXJlcy5cbiAqL1xuY29uc3QgUEFHRV9QUk9YWV9NQVhfREVQVEggPSAzO1xuXG4vKipcbiAqIFdyYXAgYSBQbGF5d3JpZ2h0IGBwYWdlYCBzbyBldmVyeSBjYWxsIHRocm91Z2ggdGhlIHByb3h5IGluY3JlbWVudHMgYSBjb3VudGVyXG4gKiBpbiB7QGxpbmsgbWV0aG9kQ2FsbHN9LCBrZXllZCBieSB0aGUgZG90dGVkIHBhdGggZnJvbSBgcGFnZWAgKGUuZy4gYGNsaWNrYCxcbiAqIGBrZXlib2FyZC5wcmVzc2ApLiBPYmplY3QgcHJvcGVydGllcyBhcmUgcHJveGllZCByZWN1cnNpdmVseSAoY2FwcGVkIGF0XG4gKiB7QGxpbmsgUEFHRV9QUk9YWV9NQVhfREVQVEh9KSBzbyBjYWxscyBvbiBuYW1lc3BhY2VzIGxpa2UgYGtleWJvYXJkYCBhbmRcbiAqIGBtb3VzZWAgYXJlIHZpc2libGU7IHN5bWJvbCBrZXlzLCBgX2AtcHJlZml4ZWQgaW50ZXJuYWxzLCBhbmRcbiAqIHtAbGluayBQQUdFX1BST1hZX0lHTk9SRURfUFJPUFN9IGFyZSBza2lwcGVkIHRvIGF2b2lkIG5vaXNlLlxuICpcbiAqIFdyYXBwZXJzIGFuZCBuZXN0ZWQgcHJveGllcyBhcmUgY2FjaGVkIHBlciBwcm9wZXJ0eSBzbyByZXBlYXRlZCByZWFkcyByZXR1cm5cbiAqIHRoZSBzYW1lIHZhbHVlLCBwcmVzZXJ2aW5nIFBsYXl3cmlnaHQncyBvYmplY3QgaWRlbnRpdHkgKGUuZy5cbiAqIGBwYWdlLmtleWJvYXJkID09PSBwYWdlLmtleWJvYXJkYCkuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZVBhZ2VBcGlQcm94eTxUIGV4dGVuZHMgb2JqZWN0Pih0YXJnZXQ6IFQsIG1ldGhvZENhbGxzOiBNYXA8c3RyaW5nLCBudW1iZXI+LCBwcmVmaXg6IHN0cmluZyA9ICcnLCBkZXB0aDogbnVtYmVyID0gMCk6IFQge1xuXHRpZiAoZGVwdGggPj0gUEFHRV9QUk9YWV9NQVhfREVQVEgpIHtcblx0XHRyZXR1cm4gdGFyZ2V0O1xuXHR9XG5cdGNvbnN0IGNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIHVua25vd24+KCk7XG5cdHJldHVybiBuZXcgUHJveHkodGFyZ2V0LCB7XG5cdFx0Z2V0KHQsIHByb3AsIHJlY2VpdmVyKSB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IFJlZmxlY3QuZ2V0KHQsIHByb3AsIHJlY2VpdmVyKTtcblx0XHRcdGlmICh0eXBlb2YgcHJvcCAhPT0gJ3N0cmluZycgfHwgcHJvcC5zdGFydHNXaXRoKCdfJykgfHwgUEFHRV9QUk9YWV9JR05PUkVEX1BST1BTLmhhcyhwcm9wKSkge1xuXHRcdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjYWNoZWQgPSBjYWNoZS5nZXQocHJvcCk7XG5cdFx0XHRpZiAoY2FjaGVkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIGNhY2hlZDtcblx0XHRcdH1cblx0XHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0Y29uc3QgbmFtZSA9IHByZWZpeCArIHByb3A7XG5cdFx0XHRcdGNvbnN0IHdyYXBwZXIgPSBmdW5jdGlvbiAodGhpczogdW5rbm93biwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0XHRcdFx0bWV0aG9kQ2FsbHMuc2V0KG5hbWUsIChtZXRob2RDYWxscy5nZXQobmFtZSkgPz8gMCkgKyAxKTtcblx0XHRcdFx0XHRyZXR1cm4gUmVmbGVjdC5hcHBseSh2YWx1ZSBhcyBGdW5jdGlvbiwgdCwgYXJncyk7XG5cdFx0XHRcdH07XG5cdFx0XHRcdGNhY2hlLnNldChwcm9wLCB3cmFwcGVyKTtcblx0XHRcdFx0cmV0dXJuIHdyYXBwZXI7XG5cdFx0XHR9XG5cdFx0XHRpZiAodmFsdWUgIT09IG51bGwgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRjb25zdCBuZXN0ZWQgPSBjcmVhdGVQYWdlQXBpUHJveHkodmFsdWUgYXMgb2JqZWN0LCBtZXRob2RDYWxscywgYCR7cHJlZml4fSR7cHJvcH0uYCwgZGVwdGggKyAxKTtcblx0XHRcdFx0Y2FjaGUuc2V0KHByb3AsIG5lc3RlZCk7XG5cdFx0XHRcdHJldHVybiBuZXN0ZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fSxcblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFlBQVkscUJBQWtDO0FBQ3ZELFNBQVMsaUJBQWlCLG1CQUFtQixtQkFBbUI7QUFDaEUsU0FBUyxlQUFzQjtBQU8vQixTQUFTLGVBQWUsOEJBQThCO0FBRXRELFNBQVMsb0JBQW9CO0FBWTdCLE1BQU0sNkJBQTZCLElBQUk7QUFDdkMsTUFBTSx3QkFBd0IsS0FBSztBQUNuQyxNQUFNLGtDQUFrQztBQVd4QyxTQUFTLGFBQWEsU0FBd0M7QUFDN0QsUUFBTSxZQUFZO0FBQ2xCLFNBQU8sT0FBTyxVQUFVLE9BQU8sWUFDM0IsT0FBTyxVQUFVLFdBQVcsYUFDM0IsVUFBVSxjQUFjLFVBQWEsT0FBTyxVQUFVLGNBQWM7QUFDMUU7QUFjTyxNQUFNLDBCQUEwQixXQUF5QztBQUFBLEVBaUIvRSxZQUNrQixVQUNBLCtCQUNBLFlBQ0EsMkJBQ0Esa0JBQ2hCO0FBQ0QsVUFBTTtBQU5XO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFuQmxCLFNBQWlCLFlBQVksS0FBSyxVQUFVLElBQUksY0FBeUMsQ0FBQztBQUcxRjtBQUFBLFNBQWlCLGdCQUFnQixvQkFBSSxJQUF3QztBQUc3RTtBQUFBLFNBQWlCLG9CQUFvQixLQUFLLFVBQVUsSUFBSSxjQUFtQyxDQUFDO0FBRzVGO0FBQUEsU0FBaUIsZ0JBQWdCLG9CQUFJLElBQVk7QUFFakQsU0FBaUIsMkJBQTJCLEtBQUssVUFBVSxJQUFJLFFBQTJC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
