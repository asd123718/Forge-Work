import * as assert from "assert";
import * as sinon from "sinon";
import { Event } from "../../../../base/common/event.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { NullLogService } from "../../../log/common/log.js";
import { WebPageLoader } from "../../electron-main/webPageLoader.js";
function createWillFrameNavigateEvent(url) {
  return {
    url,
    isSameDocument: false,
    isMainFrame: false,
    frame: null,
    preventDefault: sinon.stub()
  };
}
class MockWebContents {
  constructor() {
    this._listeners = /* @__PURE__ */ new Map();
    this._onceListeners = /* @__PURE__ */ new Set();
    this.loadURL = sinon.stub().resolves();
    this.getTitle = sinon.stub().returns("Test Page Title");
    this.executeJavaScript = sinon.stub().resolves(void 0);
    this.setWindowOpenHandler = sinon.stub();
    this.session = {
      webRequest: {
        onBeforeRequest: sinon.stub(),
        onBeforeSendHeaders: sinon.stub(),
        onHeadersReceived: sinon.stub()
      },
      on: sinon.stub()
    };
    this.debugger = new MockDebugger();
  }
  once(event, listener) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(listener);
    this._onceListeners.add(listener);
    return this;
  }
  on(event, listener) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(listener);
    return this;
  }
  emit(event, ...args) {
    const listeners = this._listeners.get(event) || [];
    for (const listener of listeners) {
      listener(...args);
    }
    const remaining = listeners.filter((l) => !this._onceListeners.has(l));
    for (const listener of listeners) {
      this._onceListeners.delete(listener);
    }
    if (remaining.length > 0) {
      this._listeners.set(event, remaining);
    } else {
      this._listeners.delete(event);
    }
  }
  beginFrameSubscription(_onlyDirty, callback) {
    setTimeout(() => callback(), 0);
  }
  endFrameSubscription() {
  }
}
class MockDebugger {
  constructor() {
    this._listeners = /* @__PURE__ */ new Map();
    this.attach = sinon.stub();
    this.sendCommand = sinon.stub().resolves({});
  }
  on(event, listener) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(listener);
    return this;
  }
  emit(event, ...args) {
    const listeners = this._listeners.get(event) || [];
    for (const listener of listeners) {
      listener(...args);
    }
  }
}
class MockBrowserWindow {
  constructor(_options) {
    this.destroy = sinon.stub();
    this.loadURL = sinon.stub().resolves();
    this.webContents = new MockWebContents();
  }
}
suite("WebPageLoader", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let window;
  teardown(() => {
    sinon.restore();
  });
  function createWebPageLoader(uri, options, isTrustedDomain, isDomainAllowed) {
    const agentNetworkFilterService = {
      _serviceBrand: void 0,
      onDidChange: Event.None,
      isUriAllowed: isDomainAllowed ?? (() => true),
      formatError: (u) => `Access to ${u.authority} is blocked by network domain policy.`
    };
    const loader = new WebPageLoader((options2) => {
      window = new MockBrowserWindow(options2);
      return window;
    }, new NullLogService(), uri, options, isTrustedDomain ?? (() => false), agentNetworkFilterService);
    disposables.add(loader);
    return loader;
  }
  function createMockAXNodes() {
    return [
      {
        nodeId: "node1",
        ignored: false,
        role: { type: "role", value: "paragraph" },
        childIds: ["node2"]
      },
      {
        nodeId: "node2",
        ignored: false,
        role: { type: "role", value: "StaticText" },
        name: { type: "string", value: "Test content from page" }
      }
    ];
  }
  function setupDebuggerMock(options = {}) {
    const {
      axNodes = createMockAXNodes(),
      frameTree = { frame: { id: "main-frame" }, childFrames: [] },
      accessibilityHang
    } = options;
    window.webContents.debugger.sendCommand.callsFake((command, params) => {
      switch (command) {
        case "Network.enable":
          return Promise.resolve();
        case "Page.enable":
          return Promise.resolve();
        case "Page.getFrameTree":
          return Promise.resolve({ frameTree });
        case "Accessibility.getFullAXTree":
          if (accessibilityHang) {
            return new Promise(() => {
            });
          } else if (typeof axNodes === "function") {
            return Promise.resolve({ nodes: axNodes(params?.frameId ?? "") });
          } else {
            return Promise.resolve({ nodes: axNodes });
          }
        default:
          assert.fail(`Unexpected command: ${command}`);
      }
    });
  }
  test("successful page load returns ok status with content", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const loader = createWebPageLoader(uri);
    setupDebuggerMock();
    const loadPromise = loader.load();
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
    assert.strictEqual(result.title, "Test Page Title");
    assert.ok(result.result.includes("Test content from page"));
  }));
  test("page load failure returns error status", async () => {
    const uri = URI.parse("https://example.com/page");
    const loader = createWebPageLoader(uri);
    setupDebuggerMock();
    const loadPromise = loader.load();
    const mockEvent = {};
    window.webContents.emit("did-fail-load", mockEvent, -6, "ERR_CONNECTION_REFUSED");
    const result = await loadPromise;
    assert.strictEqual(result.status, "error");
    if (result.status === "error") {
      assert.strictEqual(result.statusCode, -6);
      assert.strictEqual(result.error, "ERR_CONNECTION_REFUSED");
    }
  });
  test("ERR_ABORTED is ignored and content extraction continues", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const loader = createWebPageLoader(uri);
    setupDebuggerMock();
    const loadPromise = loader.load();
    const mockEvent = {};
    window.webContents.emit("did-fail-load", mockEvent, -3, "ERR_ABORTED");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
    if (result.status === "ok") {
      assert.ok(result.result.includes("Test content from page"));
    }
  }));
  test("ERR_BLOCKED_BY_CLIENT is ignored and content extraction continues", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const loader = createWebPageLoader(uri);
    setupDebuggerMock();
    const loadPromise = loader.load();
    const mockEvent = {};
    window.webContents.emit("did-fail-load", mockEvent, -27, "ERR_BLOCKED_BY_CLIENT");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
    if (result.status === "ok") {
      assert.ok(result.result.includes("Test content from page"));
    }
  }));
  test("redirect to different authority returns redirect status when followRedirects is false", async () => {
    const uri = URI.parse("https://example.com/page");
    const redirectUrl = "https://other-domain.com/redirected";
    const loader = createWebPageLoader(uri, { followRedirects: false });
    window.webContents.debugger.sendCommand.resolves({});
    const loadPromise = loader.load();
    const mockEvent = {
      preventDefault: sinon.stub()
    };
    window.webContents.emit("will-redirect", mockEvent, redirectUrl);
    const result = await loadPromise;
    assert.strictEqual(result.status, "redirect");
    if (result.status === "redirect") {
      assert.strictEqual(result.toURI.authority, "other-domain.com");
    }
    assert.ok(mockEvent.preventDefault.called);
  });
  test("redirect to same authority is not treated as redirect", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const redirectUrl = "https://example.com/other-page";
    const loader = createWebPageLoader(uri, { followRedirects: false });
    setupDebuggerMock();
    const loadPromise = loader.load();
    const mockEvent = {
      preventDefault: sinon.stub()
    };
    window.webContents.emit("will-redirect", mockEvent, redirectUrl);
    assert.ok(!mockEvent.preventDefault.called);
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
  }));
  test("redirect is followed when followRedirects option is true", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const redirectUrl = "https://other-domain.com/redirected";
    const loader = createWebPageLoader(uri, { followRedirects: true });
    setupDebuggerMock();
    const loadPromise = loader.load();
    const mockEvent = {
      preventDefault: sinon.stub()
    };
    window.webContents.emit("will-redirect", mockEvent, redirectUrl);
    assert.ok(!mockEvent.preventDefault.called);
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
  }));
  test("redirect from www to non-www same domain is allowed", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://www.example.com/page");
    const redirectUrl = "https://example.com/other-page";
    const loader = createWebPageLoader(uri, { followRedirects: false });
    setupDebuggerMock();
    const loadPromise = loader.load();
    const mockEvent = {
      preventDefault: sinon.stub()
    };
    window.webContents.emit("will-redirect", mockEvent, redirectUrl);
    assert.ok(!mockEvent.preventDefault.called);
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
  }));
  test("redirect from non-www to www same domain is allowed", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const redirectUrl = "https://www.example.com/other-page";
    const loader = createWebPageLoader(uri, { followRedirects: false });
    setupDebuggerMock();
    const loadPromise = loader.load();
    const mockEvent = {
      preventDefault: sinon.stub()
    };
    window.webContents.emit("will-redirect", mockEvent, redirectUrl);
    assert.ok(!mockEvent.preventDefault.called);
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
  }));
  test("redirect to trusted domain is allowed", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const redirectUrl = "https://trusted-domain.com/redirected";
    const loader = createWebPageLoader(
      uri,
      { followRedirects: false },
      (uri2) => uri2.authority === "trusted-domain.com" || uri2.authority === "another-trusted.com"
    );
    setupDebuggerMock();
    const loadPromise = loader.load();
    const mockEvent = {
      preventDefault: sinon.stub()
    };
    window.webContents.emit("will-redirect", mockEvent, redirectUrl);
    assert.ok(!mockEvent.preventDefault.called);
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
  }));
  test("post-load navigation to different domain is blocked silently and content is extracted", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const adRedirectUrl = "https://eus.rubiconproject.com/usync.html?p=12776";
    const loader = createWebPageLoader(uri, { followRedirects: false });
    setupDebuggerMock();
    const loadPromise = loader.load();
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const mockEvent = {
      preventDefault: sinon.stub()
    };
    window.webContents.emit("will-navigate", mockEvent, adRedirectUrl);
    const result = await loadPromise;
    assert.ok(mockEvent.preventDefault.called);
    assert.strictEqual(result.status, "ok");
    assert.ok(result.result.includes("Test content from page"));
  }));
  test("initial same-domain navigation is allowed but later cross-domain navigation is blocked", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const sameDomainUrl = "https://example.com/otherpage";
    const crossDomainUrl = "https://eus.rubiconproject.com/usync.html?p=12776";
    const loader = createWebPageLoader(uri, { followRedirects: false });
    setupDebuggerMock();
    const loadPromise = loader.load();
    const initialEvent = {
      preventDefault: sinon.stub()
    };
    window.webContents.emit("will-navigate", initialEvent, sameDomainUrl);
    assert.ok(!initialEvent.preventDefault.called);
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const crossDomainEvent = {
      preventDefault: sinon.stub()
    };
    window.webContents.emit("will-navigate", crossDomainEvent, crossDomainUrl);
    const result = await loadPromise;
    assert.ok(crossDomainEvent.preventDefault.called);
    assert.strictEqual(result.status, "ok");
    assert.ok(result.result.includes("Test content from page"));
  }));
  test("redirect to non-trusted domain is blocked", async () => {
    const uri = URI.parse("https://example.com/page");
    const redirectUrl = "https://untrusted-domain.com/redirected";
    const loader = createWebPageLoader(
      uri,
      { followRedirects: false },
      (uri2) => uri2.authority === "trusted-domain.com"
    );
    window.webContents.debugger.sendCommand.resolves({});
    const loadPromise = loader.load();
    const mockEvent = {
      preventDefault: sinon.stub()
    };
    window.webContents.emit("will-redirect", mockEvent, redirectUrl);
    const result = await loadPromise;
    assert.ok(mockEvent.preventDefault.called);
    assert.strictEqual(result.status, "redirect");
    if (result.status === "redirect") {
      assert.strictEqual(result.toURI.authority, "untrusted-domain.com");
    }
  });
  test("redirect to wildcard subdomain trusted domain is allowed", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const redirectUrl = "https://sub.trusted-domain.com/redirected";
    const loader = createWebPageLoader(
      uri,
      { followRedirects: false },
      (uri2) => uri2.authority.endsWith(".trusted-domain.com") || uri2.authority === "trusted-domain.com"
    );
    setupDebuggerMock();
    const loadPromise = loader.load();
    const mockEvent = {
      preventDefault: sinon.stub()
    };
    window.webContents.emit("will-redirect", mockEvent, redirectUrl);
    assert.ok(!mockEvent.preventDefault.called);
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
  }));
  test("navigation to domain blocked by isDomainAllowed returns error", async () => {
    const uri = URI.parse("https://example.com/page");
    const blockedUrl = "https://blocked-domain.com/path";
    const loader = createWebPageLoader(uri, { followRedirects: true }, void 0, (u) => u.authority !== "blocked-domain.com");
    window.webContents.debugger.sendCommand.resolves({});
    const loadPromise = loader.load();
    const mockEvent = {
      preventDefault: sinon.stub()
    };
    window.webContents.emit("will-navigate", mockEvent, blockedUrl);
    const result = await loadPromise;
    assert.ok(mockEvent.preventDefault.called);
    assert.strictEqual(result.status, "error");
    if (result.status === "error") {
      assert.ok(result.error?.includes("blocked-domain.com"));
    }
  });
  test("navigation to allowed domain is not blocked by isDomainAllowed", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const allowedUrl = "https://allowed-domain.com/path";
    const loader = createWebPageLoader(uri, { followRedirects: true }, void 0, (u) => u.authority !== "blocked-domain.com");
    setupDebuggerMock();
    const loadPromise = loader.load();
    const mockEvent = {
      preventDefault: sinon.stub()
    };
    window.webContents.emit("will-navigate", mockEvent, allowedUrl);
    assert.ok(!mockEvent.preventDefault.called);
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
  }));
  test("network policy cancels denied subframe requests and allows trusted requests", () => {
    createWebPageLoader(
      URI.parse("https://allowed.example/page"),
      void 0,
      void 0,
      (uri) => uri.authority === "allowed.example"
    );
    assert.ok(window.webContents.session.webRequest.onBeforeRequest.calledOnce);
    const listener = window.webContents.session.webRequest.onBeforeRequest.firstCall.args[0];
    const deniedCallback = sinon.stub();
    const allowedCallback = sinon.stub();
    listener({ url: "https://denied.example/private", resourceType: "subFrame" }, deniedCallback);
    listener({ url: "https://allowed.example/frame", resourceType: "subFrame" }, allowedCallback);
    assert.deepStrictEqual({
      denied: deniedCallback.firstCall?.args[0],
      allowed: allowedCallback.firstCall?.args[0]
    }, {
      denied: { cancel: true },
      allowed: { cancel: false }
    });
  });
  test("denies all child window creation from fetched content", () => {
    createWebPageLoader(URI.parse("https://allowed.example/page"));
    assert.ok(window.webContents.setWindowOpenHandler.calledOnce);
    const handler = window.webContents.setWindowOpenHandler.firstCall.args[0];
    assert.deepStrictEqual([
      handler({ url: "https://allowed.example/popup" }),
      handler({ url: "vscode:mcp/install?test" }),
      handler({ url: "calculator:" })
    ], [
      { action: "deny" },
      { action: "deny" },
      { action: "deny" }
    ]);
  });
  test("rejects unsafe schemes before domain filtering requests", () => {
    createWebPageLoader(
      URI.parse("https://allowed.example/page"),
      void 0,
      void 0,
      () => true
    );
    assert.ok(window.webContents.session.webRequest.onBeforeRequest.calledOnce);
    const listener = window.webContents.session.webRequest.onBeforeRequest.firstCall.args[0];
    const callbackResults = /* @__PURE__ */ new Map();
    for (const url of [
      "https://allowed.example/resource",
      "http://allowed.example/resource",
      "vscode:mcp/install?test",
      "file:///private/file",
      "calculator:"
    ]) {
      listener({ url, resourceType: "subFrame" }, (result) => callbackResults.set(url, result));
    }
    assert.deepStrictEqual(Object.fromEntries(callbackResults), {
      "https://allowed.example/resource": { cancel: false },
      "http://allowed.example/resource": { cancel: false },
      "vscode:mcp/install?test": { cancel: true },
      "file:///private/file": { cancel: true },
      "calculator:": { cancel: true }
    });
  });
  test("applies domain policy to WebSocket requests", () => {
    createWebPageLoader(
      URI.parse("https://allowed.example/page"),
      void 0,
      void 0,
      (uri) => uri.authority === "allowed.example"
    );
    const listener = window.webContents.session.webRequest.onBeforeRequest.firstCall.args[0];
    const callbackResults = /* @__PURE__ */ new Map();
    for (const url of [
      "ws://allowed.example/socket",
      "wss://allowed.example/socket",
      "ws://denied.example/socket",
      "wss://denied.example/socket"
    ]) {
      listener({ url, resourceType: "webSocket" }, (result) => callbackResults.set(url, result));
    }
    assert.deepStrictEqual(Object.fromEntries(callbackResults), {
      "ws://allowed.example/socket": { cancel: false },
      "wss://allowed.example/socket": { cancel: false },
      "ws://denied.example/socket": { cancel: true },
      "wss://denied.example/socket": { cancel: true }
    });
  });
  test("fails closed for malformed request and frame URLs", () => {
    createWebPageLoader(URI.parse("https://allowed.example/page"));
    const requestListener = window.webContents.session.webRequest.onBeforeRequest.firstCall.args[0];
    const requestCallback = sinon.stub();
    const frameEvent = createWillFrameNavigateEvent("not a uri");
    requestListener({ url: "not a uri", resourceType: "subFrame" }, requestCallback);
    window.webContents.emit("will-frame-navigate", frameEvent);
    assert.deepStrictEqual({
      request: requestCallback.firstCall?.args[0],
      framePrevented: frameEvent.preventDefault.calledOnce
    }, {
      request: { cancel: true },
      framePrevented: true
    });
  });
  test("blocks unsafe frame navigation schemes and preserves browser content schemes", () => {
    createWebPageLoader(URI.parse("https://allowed.example/page"));
    const results = /* @__PURE__ */ new Map();
    for (const url of [
      "https://allowed.example/frame",
      "http://allowed.example/frame",
      "about:blank",
      "data:text/html,frame",
      "blob:https://allowed.example/frame-id",
      "vscode:mcp/install?test",
      "file:///private/file",
      "mailto:test@example.com",
      "calculator:"
    ]) {
      const details = createWillFrameNavigateEvent(url);
      window.webContents.emit("will-frame-navigate", details);
      results.set(url, details.preventDefault.called);
    }
    assert.deepStrictEqual(Object.fromEntries(results), {
      "https://allowed.example/frame": false,
      "http://allowed.example/frame": false,
      "about:blank": false,
      "data:text/html,frame": false,
      "blob:https://allowed.example/frame-id": false,
      "vscode:mcp/install?test": true,
      "file:///private/file": true,
      "mailto:test@example.com": true,
      "calculator:": true
    });
  });
  test("blocks unsafe main-frame schemes when redirects are enabled", () => {
    createWebPageLoader(
      URI.parse("https://allowed.example/page"),
      { followRedirects: true },
      void 0,
      () => true
    );
    const event = { preventDefault: sinon.stub() };
    window.webContents.emit("will-navigate", event, "vscode:mcp/install?test");
    assert.ok(event.preventDefault.calledOnce);
  });
  test("HTTP error status code returns error with content", async () => {
    const uri = URI.parse("https://example.com/not-found");
    const loader = createWebPageLoader(uri);
    setupDebuggerMock();
    const loadPromise = loader.load();
    const mockEvent = {};
    window.webContents.debugger.emit("message", mockEvent, "Network.responseReceived", {
      requestId: "req1",
      type: "Document",
      response: {
        status: 404,
        statusText: "Not Found"
      }
    });
    const result = await loadPromise;
    assert.strictEqual(result.status, "error");
    if (result.status === "error") {
      assert.strictEqual(result.statusCode, 404);
      assert.strictEqual(result.error, "Not Found");
    }
  });
  test("HTTP 500 error returns server error status", async () => {
    const uri = URI.parse("https://example.com/server-error");
    const loader = createWebPageLoader(uri);
    setupDebuggerMock();
    const loadPromise = loader.load();
    const mockEvent = {};
    window.webContents.debugger.emit("message", mockEvent, "Network.responseReceived", {
      requestId: "req1",
      type: "Document",
      response: {
        status: 500,
        statusText: "Internal Server Error"
      }
    });
    const result = await loadPromise;
    assert.strictEqual(result.status, "error");
    if (result.status === "error") {
      assert.strictEqual(result.statusCode, 500);
      assert.strictEqual(result.error, "Internal Server Error");
    }
  });
  test("HTTP error without status text uses fallback message", async () => {
    const uri = URI.parse("https://example.com/error");
    const loader = createWebPageLoader(uri);
    setupDebuggerMock();
    const loadPromise = loader.load();
    const mockEvent = {};
    window.webContents.debugger.emit("message", mockEvent, "Network.responseReceived", {
      requestId: "req1",
      type: "Document",
      response: {
        status: 503
      }
    });
    const result = await loadPromise;
    assert.strictEqual(result.status, "error");
    if (result.status === "error") {
      assert.strictEqual(result.statusCode, 503);
      assert.strictEqual(result.error, "HTTP error 503");
    }
  });
  test("tracks network requests and waits for completion", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const loader = createWebPageLoader(uri);
    setupDebuggerMock();
    const loadPromise = loader.load();
    window.webContents.emit("did-start-loading");
    const mockEvent = {};
    window.webContents.debugger.emit("message", mockEvent, "Network.requestWillBeSent", {
      requestId: "req1"
    });
    window.webContents.debugger.emit("message", mockEvent, "Network.requestWillBeSent", {
      requestId: "req2"
    });
    window.webContents.emit("did-finish-load");
    window.webContents.debugger.emit("message", mockEvent, "Network.loadingFinished", {
      requestId: "req1"
    });
    window.webContents.debugger.emit("message", mockEvent, "Network.loadingFinished", {
      requestId: "req2"
    });
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
  }));
  test("handles network request failures gracefully", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const loader = createWebPageLoader(uri);
    setupDebuggerMock();
    const loadPromise = loader.load();
    window.webContents.emit("did-start-loading");
    const mockEvent = {};
    window.webContents.debugger.emit("message", mockEvent, "Network.requestWillBeSent", {
      requestId: "req1"
    });
    window.webContents.debugger.emit("message", mockEvent, "Network.loadingFailed", {
      requestId: "req1"
    });
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
  }));
  test("extracts content from accessibility tree", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const axNodes = [
      {
        nodeId: "heading1",
        ignored: false,
        role: { type: "role", value: "heading" },
        name: { type: "string", value: "Page Title" },
        properties: [{ name: "level", value: { type: "integer", value: 1 } }],
        childIds: ["text1"]
      },
      {
        nodeId: "text1",
        ignored: false,
        role: { type: "role", value: "StaticText" },
        name: { type: "string", value: "Page Title" }
      }
    ];
    const loader = createWebPageLoader(uri);
    setupDebuggerMock({ axNodes });
    const loadPromise = loader.load();
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
    if (result.status === "ok") {
      assert.ok(result.result.includes("# Page Title"));
    }
  }));
  test("falls back to DOM extraction when accessibility tree yields insufficient content", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const shortAXNodes = [
      {
        nodeId: "node1",
        ignored: false,
        role: { type: "role", value: "StaticText" },
        name: { type: "string", value: "Short" }
      }
    ];
    const loader = createWebPageLoader(uri);
    setupDebuggerMock({ axNodes: shortAXNodes });
    const domContent = "This is much longer content extracted from the DOM that exceeds the minimum content length requirement and should be used instead of the short accessibility tree content.";
    window.webContents.executeJavaScript.resolves(domContent);
    const loadPromise = loader.load();
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
    if (result.status === "ok") {
      assert.strictEqual(result.result, domContent);
    }
    assert.ok(window.webContents.executeJavaScript.called);
  }));
  test("returns error when accessibility tree extraction hangs", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const loader = createWebPageLoader(uri);
    setupDebuggerMock({ accessibilityHang: true });
    const loadPromise = loader.load();
    window.webContents.emit("did-start-loading");
    const result = await loadPromise;
    assert.strictEqual(result.status, "error");
    if (result.status === "error") {
      assert.ok(result.error.includes("Failed to extract meaningful content"));
    }
    assert.ok(!window.webContents.executeJavaScript.called);
  }));
  test("returns error when both accessibility tree and DOM extraction yield no content", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/empty-page");
    const loader = createWebPageLoader(uri);
    setupDebuggerMock({ axNodes: [] });
    window.webContents.executeJavaScript.resolves(void 0);
    const loadPromise = loader.load();
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "error");
    if (result.status === "error") {
      assert.ok(result.error.includes("Failed to extract meaningful content"));
    }
    assert.ok(window.webContents.executeJavaScript.called);
  }));
  test("extracts content from multiple frames including iframes", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page-with-iframes");
    const mainFrameNodes = [
      {
        nodeId: "main-root",
        ignored: false,
        role: { type: "role", value: "RootWebArea" },
        childIds: ["main-heading"]
      },
      {
        nodeId: "main-heading",
        ignored: false,
        role: { type: "role", value: "heading" },
        name: { type: "string", value: "Main Page Content" },
        properties: [{ name: "level", value: { type: "integer", value: 1 } }],
        childIds: ["main-text"]
      },
      {
        nodeId: "main-text",
        ignored: false,
        role: { type: "role", value: "StaticText" },
        name: { type: "string", value: "Main Page Content" }
      }
    ];
    const iframeNodes = [
      {
        nodeId: "iframe-root",
        ignored: false,
        role: { type: "role", value: "RootWebArea" },
        childIds: ["iframe-heading"]
      },
      {
        nodeId: "iframe-heading",
        ignored: false,
        role: { type: "role", value: "heading" },
        name: { type: "string", value: "Iframe Documentation Content" },
        properties: [{ name: "level", value: { type: "integer", value: 2 } }],
        childIds: ["iframe-text"]
      },
      {
        nodeId: "iframe-text",
        ignored: false,
        role: { type: "role", value: "StaticText" },
        name: { type: "string", value: "Iframe Documentation Content" }
      }
    ];
    const nestedIframeNodes = [
      {
        nodeId: "nested-root",
        ignored: false,
        role: { type: "role", value: "RootWebArea" },
        childIds: ["nested-paragraph"]
      },
      {
        nodeId: "nested-paragraph",
        ignored: false,
        role: { type: "role", value: "paragraph" },
        childIds: ["nested-text"]
      },
      {
        nodeId: "nested-text",
        ignored: false,
        role: { type: "role", value: "StaticText" },
        name: { type: "string", value: "Deeply nested iframe content that should also be extracted" }
      }
    ];
    const loader = createWebPageLoader(uri);
    const frameTree = {
      frame: { id: "main-frame", url: "https://example.com/page-with-iframes" },
      childFrames: [
        {
          frame: { id: "iframe-1", url: "https://example.com/iframe-content" },
          childFrames: [
            {
              frame: { id: "nested-iframe", url: "https://example.com/nested-content" },
              childFrames: []
            }
          ]
        }
      ]
    };
    setupDebuggerMock({
      frameTree,
      axNodes: (frameId) => {
        switch (frameId) {
          case "main-frame":
            return mainFrameNodes;
          case "iframe-1":
            return iframeNodes;
          case "nested-iframe":
            return nestedIframeNodes;
          default:
            return [];
        }
      }
    });
    const loadPromise = loader.load();
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
    if (result.status === "ok") {
      assert.ok(result.result.includes("Main Page Content"), "Should include main frame content");
      assert.ok(result.result.includes("Iframe Documentation Content"), "Should include iframe content");
      assert.ok(result.result.includes("Deeply nested iframe content"), "Should include nested iframe content");
    }
    const getFullAXTreeCalls = window.webContents.debugger.sendCommand.getCalls().filter((call) => call.args[0] === "Accessibility.getFullAXTree");
    assert.strictEqual(getFullAXTreeCalls.length, 3, "Should call getFullAXTree for all 3 frames");
  }));
  test("network policy skips denied frames and their descendants during extraction", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://allowed.example/page-with-iframes");
    const frameTree = {
      frame: { id: "main-frame", url: uri.toString() },
      childFrames: [
        {
          frame: { id: "allowed-frame", url: "https://allowed.example/frame" },
          childFrames: []
        },
        {
          frame: { id: "denied-frame", url: "https://denied.example/private" },
          childFrames: [
            {
              frame: { id: "denied-descendant", url: "https://allowed.example/nested" },
              childFrames: []
            }
          ]
        }
      ]
    };
    const contentByFrame = /* @__PURE__ */ new Map([
      ["main-frame", "Allowed main frame content"],
      ["allowed-frame", "Allowed child frame content"],
      ["denied-frame", "DENIED_FRAME_SECRET_MARKER"],
      ["denied-descendant", "DENIED_DESCENDANT_SECRET_MARKER"]
    ]);
    const loader = createWebPageLoader(
      uri,
      void 0,
      void 0,
      (frameUri) => frameUri.authority === "allowed.example"
    );
    setupDebuggerMock({
      frameTree,
      axNodes: (frameId) => [{
        nodeId: `${frameId}-text`,
        ignored: false,
        role: { type: "role", value: "StaticText" },
        name: { type: "string", value: contentByFrame.get(frameId) ?? "" }
      }]
    });
    const loadPromise = loader.load();
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
    const extractedFrameIds = window.webContents.debugger.sendCommand.getCalls().filter((call) => call.args[0] === "Accessibility.getFullAXTree").map((call) => call.args[1]?.frameId);
    const content = result.status === "ok" ? result.result : "";
    assert.deepStrictEqual({
      extractedFrameIds,
      includesMainContent: content.includes("Allowed main frame content"),
      includesAllowedFrameContent: content.includes("Allowed child frame content"),
      includesDeniedFrameContent: content.includes("DENIED_FRAME_SECRET_MARKER"),
      includesDeniedDescendantContent: content.includes("DENIED_DESCENDANT_SECRET_MARKER")
    }, {
      extractedFrameIds: ["main-frame", "allowed-frame"],
      includesMainContent: true,
      includesAllowedFrameContent: true,
      includesDeniedFrameContent: false,
      includesDeniedDescendantContent: false
    });
  }));
  test("onBeforeSendHeaders adds privacy headers for all requests", () => {
    createWebPageLoader(URI.parse("https://example.com/page"));
    assert.ok(window.webContents.session.webRequest.onBeforeSendHeaders.called);
    const callback = window.webContents.session.webRequest.onBeforeSendHeaders.getCall(0).args[0];
    let modifiedHeaders;
    const mockCallback = (details) => {
      modifiedHeaders = details.requestHeaders;
    };
    callback(
      {
        url: "https://example.com/style.css",
        requestHeaders: {
          "TestHeader": "TestValue"
        }
      },
      mockCallback
    );
    assert.ok(modifiedHeaders);
    assert.strictEqual(modifiedHeaders["DNT"], "1");
    assert.strictEqual(modifiedHeaders["Sec-GPC"], "1");
    assert.strictEqual(modifiedHeaders["TestHeader"], "TestValue");
    assert.strictEqual(modifiedHeaders["Accept"], void 0);
  });
  test("onBeforeSendHeaders adds Accept header preferring markdown for mainFrame requests", () => {
    createWebPageLoader(URI.parse("https://example.com/page"));
    assert.ok(window.webContents.session.webRequest.onBeforeSendHeaders.called);
    const callback = window.webContents.session.webRequest.onBeforeSendHeaders.getCall(0).args[0];
    let modifiedHeaders;
    const mockCallback = (details) => {
      modifiedHeaders = details.requestHeaders;
    };
    callback(
      {
        url: "https://example.com/page",
        resourceType: "mainFrame",
        requestHeaders: {}
      },
      mockCallback
    );
    assert.ok(modifiedHeaders);
    assert.ok(modifiedHeaders["Accept"]?.includes("text/markdown"));
    assert.ok(modifiedHeaders["Accept"]?.includes("text/html"));
  });
  test("onHeadersReceived replaces Content-Disposition attachment with inline for text content", () => {
    createWebPageLoader(URI.parse("https://example.com/page"));
    assert.ok(window.webContents.session.webRequest.onHeadersReceived.called);
    const listener = window.webContents.session.webRequest.onHeadersReceived.getCall(0).args[0];
    for (const contentType of ["application/xml", "text/html", "text/plain", "application/json", "application/xhtml+xml", "application/rss+xml", "application/vnd.custom+json"]) {
      let response;
      const mockCallback = (result) => {
        response = result;
      };
      listener(
        {
          url: "https://example.com/file",
          responseHeaders: {
            "Content-Disposition": ['attachment; filename="file.xml"'],
            "Content-Type": [contentType]
          }
        },
        mockCallback
      );
      assert.ok(response, `Expected response for ${contentType}`);
      assert.deepStrictEqual(response.responseHeaders["Content-Disposition"], ["inline"], `Expected inline for ${contentType}`);
      assert.strictEqual(response.cancel, false, `Should not cancel for ${contentType}`);
    }
  });
  test("onHeadersReceived cancels Content-Disposition attachment for binary content", () => {
    createWebPageLoader(URI.parse("https://example.com/page"));
    const listener = window.webContents.session.webRequest.onHeadersReceived.getCall(0).args[0];
    for (const contentType of ["application/octet-stream", "application/zip", "application/pdf", "image/png", "video/mp4"]) {
      let response;
      const mockCallback = (result) => {
        response = result;
      };
      listener(
        {
          url: "https://example.com/file.bin",
          responseHeaders: {
            "Content-Disposition": ['attachment; filename="file.bin"'],
            "Content-Type": [contentType]
          }
        },
        mockCallback
      );
      assert.ok(response, `Expected response for ${contentType}`);
      assert.strictEqual(response.cancel, true, `Expected cancel for ${contentType}`);
    }
  });
  test("onHeadersReceived cancels Content-Disposition attachment when content type is missing", () => {
    createWebPageLoader(URI.parse("https://example.com/page"));
    const listener = window.webContents.session.webRequest.onHeadersReceived.getCall(0).args[0];
    let response;
    const mockCallback = (result) => {
      response = result;
    };
    listener(
      {
        url: "https://example.com/file",
        responseHeaders: {
          "Content-Disposition": ['attachment; filename="file"']
        }
      },
      mockCallback
    );
    assert.ok(response);
    assert.strictEqual(response.cancel, true);
  });
  test("onHeadersReceived allows normal responses without Content-Disposition attachment", () => {
    createWebPageLoader(URI.parse("https://example.com/page"));
    const listener = window.webContents.session.webRequest.onHeadersReceived.getCall(0).args[0];
    let response;
    const mockCallback = (result) => {
      response = result;
    };
    listener(
      {
        url: "https://example.com/page",
        responseHeaders: {
          "Content-Type": ["text/html"],
          "Content-Disposition": ["inline"]
        }
      },
      mockCallback
    );
    assert.ok(response);
    assert.strictEqual(response.responseHeaders, void 0);
  });
  test("will-download handler cancels download and returns error", async () => {
    const uri = URI.parse("https://dl.google.com/linux/chrome/rpm/stable/x86_64/repodata/repomd.xml");
    const loader = createWebPageLoader(uri);
    setupDebuggerMock();
    assert.ok(window.webContents.session.on.called);
    const willDownloadCall = window.webContents.session.on.getCalls().find((call) => call.args[0] === "will-download");
    assert.ok(willDownloadCall);
    const willDownloadHandler = willDownloadCall.args[1];
    const loadPromise = loader.load();
    const mockItem = {
      cancel: sinon.stub(),
      getFilename: sinon.stub().returns("repomd.xml")
    };
    willDownloadHandler({}, mockItem);
    const result = await loadPromise;
    assert.ok(mockItem.cancel.called);
    assert.strictEqual(result.status, "error");
    if (result.status === "error") {
      assert.ok(result.error.includes("Download not allowed"));
      assert.ok(result.error.includes("repomd.xml"));
    }
  });
  test("onHeadersReceived detects markdown content-type for mainFrame responses", () => {
    createWebPageLoader(URI.parse("https://example.com/page"));
    const listener = window.webContents.session.webRequest.onHeadersReceived.getCall(0).args[0];
    let response;
    const mockCallback = (result) => {
      response = result;
    };
    listener(
      {
        url: "https://example.com/page",
        resourceType: "mainFrame",
        responseHeaders: {
          "Content-Type": ["text/markdown; charset=utf-8"]
        }
      },
      mockCallback
    );
    assert.ok(response);
    assert.strictEqual(response.cancel, false);
  });
  test("markdown content-type extraction uses raw body", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://learn.microsoft.com/en-us/docs");
    const loader = createWebPageLoader(uri);
    const longAXNodes = [
      {
        nodeId: "node1",
        ignored: false,
        role: { type: "role", value: "StaticText" },
        name: { type: "string", value: "This is a long accessibility tree content that exceeds the minimum content length requirement of one hundred characters easily." }
      }
    ];
    setupDebuggerMock({ axNodes: longAXNodes });
    const headersListener = window.webContents.session.webRequest.onHeadersReceived.getCall(0).args[0];
    const loadPromise = loader.load();
    headersListener(
      {
        url: uri.toString(),
        resourceType: "mainFrame",
        responseHeaders: {
          "Content-Type": ["text/markdown; charset=utf-8"]
        }
      },
      () => {
      }
    );
    window.webContents.executeJavaScript.resolves("# Hello World\n\nThis is markdown content.");
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    const result = await loadPromise;
    assert.strictEqual(result.status, "ok");
    assert.ok(result.result.includes("# Hello World"));
    assert.ok(result.result.includes("This is markdown content."));
  }));
  test("disposes resources after load completes", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = URI.parse("https://example.com/page");
    const loader = createWebPageLoader(uri);
    setupDebuggerMock();
    const loadPromise = loader.load();
    window.webContents.emit("did-start-loading");
    window.webContents.emit("did-finish-load");
    await loadPromise;
    assert.ok(window.destroy.called);
  }));
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcd2ViQ29udGVudEV4dHJhY3RvclxcdGVzdFxcZWxlY3Ryb24tbWFpblxcd2ViUGFnZUxvYWRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBzaW5vbiBmcm9tICdzaW5vbic7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbmV0d29ya0ZpbHRlci9jb21tb24vbmV0d29ya0ZpbHRlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQVhOb2RlIH0gZnJvbSAnLi4vLi4vZWxlY3Ryb24tbWFpbi9jZHBBY2Nlc3NpYmlsaXR5RG9tYWluLmpzJztcbmltcG9ydCB7IFdlYlBhZ2VMb2FkZXIgfSBmcm9tICcuLi8uLi9lbGVjdHJvbi1tYWluL3dlYlBhZ2VMb2FkZXIuanMnO1xuaW1wb3J0IHsgSVdlYkNvbnRlbnRFeHRyYWN0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vY29tbW9uL3dlYkNvbnRlbnRFeHRyYWN0b3IuanMnO1xuXG5pbnRlcmZhY2UgTW9ja0VsZWN0cm9uRXZlbnQge1xuXHRwcmV2ZW50RGVmYXVsdD86IHNpbm9uLlNpbm9uU3R1Yjtcbn1cblxudHlwZSBNb2NrV2lsbEZyYW1lTmF2aWdhdGVFdmVudCA9IEVsZWN0cm9uLkV2ZW50PEVsZWN0cm9uLldlYkNvbnRlbnRzV2lsbEZyYW1lTmF2aWdhdGVFdmVudFBhcmFtcz4gJiB7XG5cdHByZXZlbnREZWZhdWx0OiBzaW5vbi5TaW5vblN0dWI7XG59O1xuXG5mdW5jdGlvbiBjcmVhdGVXaWxsRnJhbWVOYXZpZ2F0ZUV2ZW50KHVybDogc3RyaW5nKTogTW9ja1dpbGxGcmFtZU5hdmlnYXRlRXZlbnQge1xuXHRyZXR1cm4ge1xuXHRcdHVybCxcblx0XHRpc1NhbWVEb2N1bWVudDogZmFsc2UsXG5cdFx0aXNNYWluRnJhbWU6IGZhbHNlLFxuXHRcdGZyYW1lOiBudWxsLFxuXHRcdHByZXZlbnREZWZhdWx0OiBzaW5vbi5zdHViKCksXG5cdH0gYXMgTW9ja1dpbGxGcmFtZU5hdmlnYXRlRXZlbnQ7XG59XG5cbmNsYXNzIE1vY2tXZWJDb250ZW50cyB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpc3RlbmVycyA9IG5ldyBNYXA8c3RyaW5nLCAoKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZClbXT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25jZUxpc3RlbmVycyA9IG5ldyBTZXQ8KC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZD4oKTtcblx0cHVibGljIHJlYWRvbmx5IGRlYnVnZ2VyOiBNb2NrRGVidWdnZXI7XG5cdHB1YmxpYyBsb2FkVVJMID0gc2lub24uc3R1YigpLnJlc29sdmVzKCk7XG5cdHB1YmxpYyBnZXRUaXRsZSA9IHNpbm9uLnN0dWIoKS5yZXR1cm5zKCdUZXN0IFBhZ2UgVGl0bGUnKTtcblx0cHVibGljIGV4ZWN1dGVKYXZhU2NyaXB0ID0gc2lub24uc3R1YigpLnJlc29sdmVzKHVuZGVmaW5lZCk7XG5cdHB1YmxpYyBzZXRXaW5kb3dPcGVuSGFuZGxlciA9IHNpbm9uLnN0dWIoKTtcblxuXHRwdWJsaWMgc2Vzc2lvbiA9IHtcblx0XHR3ZWJSZXF1ZXN0OiB7XG5cdFx0XHRvbkJlZm9yZVJlcXVlc3Q6IHNpbm9uLnN0dWIoKSxcblx0XHRcdG9uQmVmb3JlU2VuZEhlYWRlcnM6IHNpbm9uLnN0dWIoKSxcblx0XHRcdG9uSGVhZGVyc1JlY2VpdmVkOiBzaW5vbi5zdHViKClcblx0XHR9LFxuXHRcdG9uOiBzaW5vbi5zdHViKClcblx0fTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLmRlYnVnZ2VyID0gbmV3IE1vY2tEZWJ1Z2dlcigpO1xuXHR9XG5cblx0b25jZShldmVudDogc3RyaW5nLCBsaXN0ZW5lcjogKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZCk6IHRoaXMge1xuXHRcdGlmICghdGhpcy5fbGlzdGVuZXJzLmhhcyhldmVudCkpIHtcblx0XHRcdHRoaXMuX2xpc3RlbmVycy5zZXQoZXZlbnQsIFtdKTtcblx0XHR9XG5cdFx0dGhpcy5fbGlzdGVuZXJzLmdldChldmVudCkhLnB1c2gobGlzdGVuZXIpO1xuXHRcdHRoaXMuX29uY2VMaXN0ZW5lcnMuYWRkKGxpc3RlbmVyKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdG9uKGV2ZW50OiBzdHJpbmcsIGxpc3RlbmVyOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkKTogdGhpcyB7XG5cdFx0aWYgKCF0aGlzLl9saXN0ZW5lcnMuaGFzKGV2ZW50KSkge1xuXHRcdFx0dGhpcy5fbGlzdGVuZXJzLnNldChldmVudCwgW10pO1xuXHRcdH1cblx0XHR0aGlzLl9saXN0ZW5lcnMuZ2V0KGV2ZW50KSEucHVzaChsaXN0ZW5lcik7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRlbWl0KGV2ZW50OiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGNvbnN0IGxpc3RlbmVycyA9IHRoaXMuX2xpc3RlbmVycy5nZXQoZXZlbnQpIHx8IFtdO1xuXHRcdGZvciAoY29uc3QgbGlzdGVuZXIgb2YgbGlzdGVuZXJzKSB7XG5cdFx0XHRsaXN0ZW5lciguLi5hcmdzKTtcblx0XHR9XG5cdFx0Ly8gUmVtb3ZlIG9uY2UgbGlzdGVuZXJzLCBrZWVwIG9uIGxpc3RlbmVyc1xuXHRcdGNvbnN0IHJlbWFpbmluZyA9IGxpc3RlbmVycy5maWx0ZXIobCA9PiAhdGhpcy5fb25jZUxpc3RlbmVycy5oYXMobCkpO1xuXHRcdGZvciAoY29uc3QgbGlzdGVuZXIgb2YgbGlzdGVuZXJzKSB7XG5cdFx0XHR0aGlzLl9vbmNlTGlzdGVuZXJzLmRlbGV0ZShsaXN0ZW5lcik7XG5cdFx0fVxuXHRcdGlmIChyZW1haW5pbmcubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fbGlzdGVuZXJzLnNldChldmVudCwgcmVtYWluaW5nKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbGlzdGVuZXJzLmRlbGV0ZShldmVudCk7XG5cdFx0fVxuXHR9XG5cblx0YmVnaW5GcmFtZVN1YnNjcmlwdGlvbihfb25seURpcnR5OiBib29sZWFuLCBjYWxsYmFjazogKCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdHNldFRpbWVvdXQoKCkgPT4gY2FsbGJhY2soKSwgMCk7XG5cdH1cblxuXHRlbmRGcmFtZVN1YnNjcmlwdGlvbigpOiB2b2lkIHtcblx0fVxufVxuXG5jbGFzcyBNb2NrRGVidWdnZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9saXN0ZW5lcnMgPSBuZXcgTWFwPHN0cmluZywgKCguLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWQpW10+KCk7XG5cdHB1YmxpYyBhdHRhY2ggPSBzaW5vbi5zdHViKCk7XG5cdHB1YmxpYyBzZW5kQ29tbWFuZCA9IHNpbm9uLnN0dWIoKS5yZXNvbHZlcyh7fSk7XG5cblx0b24oZXZlbnQ6IHN0cmluZywgbGlzdGVuZXI6ICguLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWQpOiB0aGlzIHtcblx0XHRpZiAoIXRoaXMuX2xpc3RlbmVycy5oYXMoZXZlbnQpKSB7XG5cdFx0XHR0aGlzLl9saXN0ZW5lcnMuc2V0KGV2ZW50LCBbXSk7XG5cdFx0fVxuXHRcdHRoaXMuX2xpc3RlbmVycy5nZXQoZXZlbnQpIS5wdXNoKGxpc3RlbmVyKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdGVtaXQoZXZlbnQ6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0Y29uc3QgbGlzdGVuZXJzID0gdGhpcy5fbGlzdGVuZXJzLmdldChldmVudCkgfHwgW107XG5cdFx0Zm9yIChjb25zdCBsaXN0ZW5lciBvZiBsaXN0ZW5lcnMpIHtcblx0XHRcdGxpc3RlbmVyKC4uLmFyZ3MpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBNb2NrQnJvd3NlcldpbmRvdyB7XG5cdHB1YmxpYyByZWFkb25seSB3ZWJDb250ZW50czogTW9ja1dlYkNvbnRlbnRzO1xuXHRwdWJsaWMgZGVzdHJveSA9IHNpbm9uLnN0dWIoKTtcblx0cHVibGljIGxvYWRVUkwgPSBzaW5vbi5zdHViKCkucmVzb2x2ZXMoKTtcblxuXHRjb25zdHJ1Y3Rvcihfb3B0aW9ucz86IEVsZWN0cm9uLkJyb3dzZXJXaW5kb3dDb25zdHJ1Y3Rvck9wdGlvbnMpIHtcblx0XHR0aGlzLndlYkNvbnRlbnRzID0gbmV3IE1vY2tXZWJDb250ZW50cygpO1xuXHR9XG59XG5cbnN1aXRlKCdXZWJQYWdlTG9hZGVyJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRsZXQgd2luZG93OiBNb2NrQnJvd3NlcldpbmRvdztcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0c2lub24ucmVzdG9yZSgpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBjcmVhdGVXZWJQYWdlTG9hZGVyKHVyaTogVVJJLCBvcHRpb25zPzogSVdlYkNvbnRlbnRFeHRyYWN0b3JPcHRpb25zLCBpc1RydXN0ZWREb21haW4/OiAodXJpOiBVUkkpID0+IGJvb2xlYW4sIGlzRG9tYWluQWxsb3dlZD86ICh1cmk6IFVSSSkgPT4gYm9vbGVhbik6IFdlYlBhZ2VMb2FkZXIge1xuXHRcdGNvbnN0IGFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2U6IElBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlID0ge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRpc1VyaUFsbG93ZWQ6IGlzRG9tYWluQWxsb3dlZCA/PyAoKCkgPT4gdHJ1ZSksXG5cdFx0XHRmb3JtYXRFcnJvcjogKHUpID0+IGBBY2Nlc3MgdG8gJHt1LmF1dGhvcml0eX0gaXMgYmxvY2tlZCBieSBuZXR3b3JrIGRvbWFpbiBwb2xpY3kuYCxcblx0XHR9O1xuXHRcdGNvbnN0IGxvYWRlciA9IG5ldyBXZWJQYWdlTG9hZGVyKChvcHRpb25zKSA9PiB7XG5cdFx0XHR3aW5kb3cgPSBuZXcgTW9ja0Jyb3dzZXJXaW5kb3cob3B0aW9ucyk7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdHJldHVybiB3aW5kb3cgYXMgYW55O1xuXHRcdH0sIG5ldyBOdWxsTG9nU2VydmljZSgpLCB1cmksIG9wdGlvbnMsIGlzVHJ1c3RlZERvbWFpbiA/PyAoKCkgPT4gZmFsc2UpLCBhZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobG9hZGVyKTtcblx0XHRyZXR1cm4gbG9hZGVyO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9ja0FYTm9kZXMoKTogQVhOb2RlW10ge1xuXHRcdHJldHVybiBbXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ25vZGUxJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IHsgdHlwZTogJ3JvbGUnLCB2YWx1ZTogJ3BhcmFncmFwaCcgfSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsnbm9kZTInXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnbm9kZTInLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogeyB0eXBlOiAncm9sZScsIHZhbHVlOiAnU3RhdGljVGV4dCcgfSxcblx0XHRcdFx0bmFtZTogeyB0eXBlOiAnc3RyaW5nJywgdmFsdWU6ICdUZXN0IGNvbnRlbnQgZnJvbSBwYWdlJyB9XG5cdFx0XHR9XG5cdFx0XTtcblx0fVxuXG5cdGludGVyZmFjZSBEZWJ1Z2dlck1vY2tPcHRpb25zIHtcblx0XHRheE5vZGVzPzogQVhOb2RlW10gfCAoKGZyYW1lSWQ6IHN0cmluZykgPT4gQVhOb2RlW10pO1xuXHRcdGZyYW1lVHJlZT86IHsgZnJhbWU6IHsgaWQ6IHN0cmluZzsgdXJsPzogc3RyaW5nIH07IGNoaWxkRnJhbWVzPzogdW5rbm93bltdIH07XG5cdFx0YWNjZXNzaWJpbGl0eUhhbmc/OiBib29sZWFuO1xuXHR9XG5cblx0ZnVuY3Rpb24gc2V0dXBEZWJ1Z2dlck1vY2sob3B0aW9uczogRGVidWdnZXJNb2NrT3B0aW9ucyA9IHt9KTogdm9pZCB7XG5cdFx0Y29uc3Qge1xuXHRcdFx0YXhOb2RlcyA9IGNyZWF0ZU1vY2tBWE5vZGVzKCksXG5cdFx0XHRmcmFtZVRyZWUgPSB7IGZyYW1lOiB7IGlkOiAnbWFpbi1mcmFtZScgfSwgY2hpbGRGcmFtZXM6IFtdIH0sXG5cdFx0XHRhY2Nlc3NpYmlsaXR5SGFuZ1xuXHRcdH0gPSBvcHRpb25zO1xuXG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmRlYnVnZ2VyLnNlbmRDb21tYW5kLmNhbGxzRmFrZSgoY29tbWFuZDogc3RyaW5nLCBwYXJhbXM/OiB7IGZyYW1lSWQ/OiBzdHJpbmcgfSkgPT4ge1xuXHRcdFx0c3dpdGNoIChjb21tYW5kKSB7XG5cdFx0XHRcdGNhc2UgJ05ldHdvcmsuZW5hYmxlJzpcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHRcdGNhc2UgJ1BhZ2UuZW5hYmxlJzpcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHRcdGNhc2UgJ1BhZ2UuZ2V0RnJhbWVUcmVlJzpcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgZnJhbWVUcmVlIH0pO1xuXHRcdFx0XHRjYXNlICdBY2Nlc3NpYmlsaXR5LmdldEZ1bGxBWFRyZWUnOlxuXHRcdFx0XHRcdGlmIChhY2Nlc3NpYmlsaXR5SGFuZykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlKCgpID0+IHsgfSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgYXhOb2RlcyA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IG5vZGVzOiBheE5vZGVzKHBhcmFtcz8uZnJhbWVJZCA/PyAnJykgfSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBub2RlczogYXhOb2RlcyB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0YXNzZXJ0LmZhaWwoYFVuZXhwZWN0ZWQgY29tbWFuZDogJHtjb21tYW5kfWApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0Ly8jcmVnaW9uIEJhc2ljIExvYWRpbmcgVGVzdHNcblxuXHR0ZXN0KCdzdWNjZXNzZnVsIHBhZ2UgbG9hZCByZXR1cm5zIG9rIHN0YXR1cyB3aXRoIGNvbnRlbnQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGFnZScpO1xuXG5cdFx0Y29uc3QgbG9hZGVyID0gY3JlYXRlV2ViUGFnZUxvYWRlcih1cmkpO1xuXHRcdHNldHVwRGVidWdnZXJNb2NrKCk7XG5cblx0XHRjb25zdCBsb2FkUHJvbWlzZSA9IGxvYWRlci5sb2FkKCk7XG5cblx0XHQvLyBTaW11bGF0ZSBwYWdlIGxvYWQgZXZlbnRzXG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1zdGFydC1sb2FkaW5nJyk7XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1maW5pc2gtbG9hZCcpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbG9hZFByb21pc2U7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXR1cywgJ29rJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50aXRsZSwgJ1Rlc3QgUGFnZSBUaXRsZScpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQucmVzdWx0LmluY2x1ZGVzKCdUZXN0IGNvbnRlbnQgZnJvbSBwYWdlJykpO1xuXHR9KSk7XG5cblx0dGVzdCgncGFnZSBsb2FkIGZhaWx1cmUgcmV0dXJucyBlcnJvciBzdGF0dXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL3BhZ2UnKTtcblxuXHRcdGNvbnN0IGxvYWRlciA9IGNyZWF0ZVdlYlBhZ2VMb2FkZXIodXJpKTtcblx0XHRzZXR1cERlYnVnZ2VyTW9jaygpO1xuXG5cdFx0Y29uc3QgbG9hZFByb21pc2UgPSBsb2FkZXIubG9hZCgpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgcGFnZSBsb2FkIGZhaWx1cmVcblx0XHRjb25zdCBtb2NrRXZlbnQ6IE1vY2tFbGVjdHJvbkV2ZW50ID0ge307XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1mYWlsLWxvYWQnLCBtb2NrRXZlbnQsIC02LCAnRVJSX0NPTk5FQ1RJT05fUkVGVVNFRCcpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbG9hZFByb21pc2U7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXR1cywgJ2Vycm9yJyk7XG5cdFx0aWYgKHJlc3VsdC5zdGF0dXMgPT09ICdlcnJvcicpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RhdHVzQ29kZSwgLTYpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lcnJvciwgJ0VSUl9DT05ORUNUSU9OX1JFRlVTRUQnKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ0VSUl9BQk9SVEVEIGlzIGlnbm9yZWQgYW5kIGNvbnRlbnQgZXh0cmFjdGlvbiBjb250aW51ZXMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGFnZScpO1xuXG5cdFx0Y29uc3QgbG9hZGVyID0gY3JlYXRlV2ViUGFnZUxvYWRlcih1cmkpO1xuXHRcdHNldHVwRGVidWdnZXJNb2NrKCk7XG5cblx0XHRjb25zdCBsb2FkUHJvbWlzZSA9IGxvYWRlci5sb2FkKCk7XG5cblx0XHQvLyBTaW11bGF0ZSBFUlJfQUJPUlRFRCAoLTMpIHdoaWNoIHNob3VsZCBiZSBpZ25vcmVkXG5cdFx0Y29uc3QgbW9ja0V2ZW50OiBNb2NrRWxlY3Ryb25FdmVudCA9IHt9O1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtZmFpbC1sb2FkJywgbW9ja0V2ZW50LCAtMywgJ0VSUl9BQk9SVEVEJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBsb2FkUHJvbWlzZTtcblxuXHRcdC8vIEVSUl9BQk9SVEVEIHNob3VsZCBub3QgY2F1c2UgYW4gZXJyb3Igc3RhdHVzLCBjb250ZW50IHNob3VsZCBiZSBleHRyYWN0ZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXR1cywgJ29rJyk7XG5cdFx0aWYgKHJlc3VsdC5zdGF0dXMgPT09ICdvaycpIHtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQucmVzdWx0LmluY2x1ZGVzKCdUZXN0IGNvbnRlbnQgZnJvbSBwYWdlJykpO1xuXHRcdH1cblx0fSkpO1xuXG5cdHRlc3QoJ0VSUl9CTE9DS0VEX0JZX0NMSUVOVCBpcyBpZ25vcmVkIGFuZCBjb250ZW50IGV4dHJhY3Rpb24gY29udGludWVzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL3BhZ2UnKTtcblxuXHRcdGNvbnN0IGxvYWRlciA9IGNyZWF0ZVdlYlBhZ2VMb2FkZXIodXJpKTtcblx0XHRzZXR1cERlYnVnZ2VyTW9jaygpO1xuXG5cdFx0Y29uc3QgbG9hZFByb21pc2UgPSBsb2FkZXIubG9hZCgpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgRVJSX0JMT0NLRURfQllfQ0xJRU5UICgtMjcpIHdoaWNoIHNob3VsZCBiZSBpZ25vcmVkXG5cdFx0Y29uc3QgbW9ja0V2ZW50OiBNb2NrRWxlY3Ryb25FdmVudCA9IHt9O1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtZmFpbC1sb2FkJywgbW9ja0V2ZW50LCAtMjcsICdFUlJfQkxPQ0tFRF9CWV9DTElFTlQnKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGxvYWRQcm9taXNlO1xuXG5cdFx0Ly8gRVJSX0JMT0NLRURfQllfQ0xJRU5UIHNob3VsZCBub3QgY2F1c2UgYW4gZXJyb3Igc3RhdHVzLCBjb250ZW50IHNob3VsZCBiZSBleHRyYWN0ZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXR1cywgJ29rJyk7XG5cdFx0aWYgKHJlc3VsdC5zdGF0dXMgPT09ICdvaycpIHtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQucmVzdWx0LmluY2x1ZGVzKCdUZXN0IGNvbnRlbnQgZnJvbSBwYWdlJykpO1xuXHRcdH1cblx0fSkpO1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBSZWRpcmVjdCBUZXN0c1xuXG5cdHRlc3QoJ3JlZGlyZWN0IHRvIGRpZmZlcmVudCBhdXRob3JpdHkgcmV0dXJucyByZWRpcmVjdCBzdGF0dXMgd2hlbiBmb2xsb3dSZWRpcmVjdHMgaXMgZmFsc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL3BhZ2UnKTtcblx0XHRjb25zdCByZWRpcmVjdFVybCA9ICdodHRwczovL290aGVyLWRvbWFpbi5jb20vcmVkaXJlY3RlZCc7XG5cblx0XHRjb25zdCBsb2FkZXIgPSBjcmVhdGVXZWJQYWdlTG9hZGVyKHVyaSwgeyBmb2xsb3dSZWRpcmVjdHM6IGZhbHNlIH0pO1xuXG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmRlYnVnZ2VyLnNlbmRDb21tYW5kLnJlc29sdmVzKHt9KTtcblxuXHRcdGNvbnN0IGxvYWRQcm9taXNlID0gbG9hZGVyLmxvYWQoKTtcblxuXHRcdC8vIFNpbXVsYXRlIHJlZGlyZWN0IHRvIGRpZmZlcmVudCBhdXRob3JpdHlcblx0XHRjb25zdCBtb2NrRXZlbnQ6IE1vY2tFbGVjdHJvbkV2ZW50ID0ge1xuXHRcdFx0cHJldmVudERlZmF1bHQ6IHNpbm9uLnN0dWIoKVxuXHRcdH07XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ3dpbGwtcmVkaXJlY3QnLCBtb2NrRXZlbnQsIHJlZGlyZWN0VXJsKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGxvYWRQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdGF0dXMsICdyZWRpcmVjdCcpO1xuXHRcdGlmIChyZXN1bHQuc3RhdHVzID09PSAncmVkaXJlY3QnKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRvVVJJLmF1dGhvcml0eSwgJ290aGVyLWRvbWFpbi5jb20nKTtcblx0XHR9XG5cdFx0YXNzZXJ0Lm9rKChtb2NrRXZlbnQucHJldmVudERlZmF1bHQhKS5jYWxsZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWRpcmVjdCB0byBzYW1lIGF1dGhvcml0eSBpcyBub3QgdHJlYXRlZCBhcyByZWRpcmVjdCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlJyk7XG5cdFx0Y29uc3QgcmVkaXJlY3RVcmwgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS9vdGhlci1wYWdlJztcblxuXHRcdGNvbnN0IGxvYWRlciA9IGNyZWF0ZVdlYlBhZ2VMb2FkZXIodXJpLCB7IGZvbGxvd1JlZGlyZWN0czogZmFsc2UgfSk7XG5cdFx0c2V0dXBEZWJ1Z2dlck1vY2soKTtcblxuXHRcdGNvbnN0IGxvYWRQcm9taXNlID0gbG9hZGVyLmxvYWQoKTtcblxuXHRcdC8vIFNpbXVsYXRlIHJlZGlyZWN0IHRvIHNhbWUgYXV0aG9yaXR5XG5cdFx0Y29uc3QgbW9ja0V2ZW50OiBNb2NrRWxlY3Ryb25FdmVudCA9IHtcblx0XHRcdHByZXZlbnREZWZhdWx0OiBzaW5vbi5zdHViKClcblx0XHR9O1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCd3aWxsLXJlZGlyZWN0JywgbW9ja0V2ZW50LCByZWRpcmVjdFVybCk7XG5cblx0XHQvLyBTaG91bGQgbm90IHByZXZlbnQgZGVmYXVsdCBmb3Igc2FtZS1hdXRob3JpdHkgcmVkaXJlY3RzXG5cdFx0YXNzZXJ0Lm9rKCEobW9ja0V2ZW50LnByZXZlbnREZWZhdWx0ISkuY2FsbGVkKTtcblxuXHRcdC8vIENvbnRpbnVlIHdpdGggbm9ybWFsIGxvYWRcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnZGlkLXN0YXJ0LWxvYWRpbmcnKTtcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnZGlkLWZpbmlzaC1sb2FkJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBsb2FkUHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXR1cywgJ29rJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdyZWRpcmVjdCBpcyBmb2xsb3dlZCB3aGVuIGZvbGxvd1JlZGlyZWN0cyBvcHRpb24gaXMgdHJ1ZScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlJyk7XG5cdFx0Y29uc3QgcmVkaXJlY3RVcmwgPSAnaHR0cHM6Ly9vdGhlci1kb21haW4uY29tL3JlZGlyZWN0ZWQnO1xuXG5cdFx0Y29uc3QgbG9hZGVyID0gY3JlYXRlV2ViUGFnZUxvYWRlcih1cmksIHsgZm9sbG93UmVkaXJlY3RzOiB0cnVlIH0pO1xuXHRcdHNldHVwRGVidWdnZXJNb2NrKCk7XG5cblx0XHRjb25zdCBsb2FkUHJvbWlzZSA9IGxvYWRlci5sb2FkKCk7XG5cblx0XHQvLyBTaW11bGF0ZSByZWRpcmVjdFxuXHRcdGNvbnN0IG1vY2tFdmVudDogTW9ja0VsZWN0cm9uRXZlbnQgPSB7XG5cdFx0XHRwcmV2ZW50RGVmYXVsdDogc2lub24uc3R1YigpXG5cdFx0fTtcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnd2lsbC1yZWRpcmVjdCcsIG1vY2tFdmVudCwgcmVkaXJlY3RVcmwpO1xuXG5cdFx0Ly8gU2hvdWxkIG5vdCBwcmV2ZW50IGRlZmF1bHQgd2hlbiBmb2xsb3dSZWRpcmVjdHMgaXMgdHJ1ZVxuXHRcdGFzc2VydC5vayghKG1vY2tFdmVudC5wcmV2ZW50RGVmYXVsdCEpLmNhbGxlZCk7XG5cblx0XHQvLyBDb250aW51ZSB3aXRoIG5vcm1hbCBsb2FkIGFmdGVyIHJlZGlyZWN0XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1zdGFydC1sb2FkaW5nJyk7XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1maW5pc2gtbG9hZCcpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbG9hZFByb21pc2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdGF0dXMsICdvaycpO1xuXHR9KSk7XG5cblx0dGVzdCgncmVkaXJlY3QgZnJvbSB3d3cgdG8gbm9uLXd3dyBzYW1lIGRvbWFpbiBpcyBhbGxvd2VkJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdodHRwczovL3d3dy5leGFtcGxlLmNvbS9wYWdlJyk7XG5cdFx0Y29uc3QgcmVkaXJlY3RVcmwgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS9vdGhlci1wYWdlJztcblxuXHRcdGNvbnN0IGxvYWRlciA9IGNyZWF0ZVdlYlBhZ2VMb2FkZXIodXJpLCB7IGZvbGxvd1JlZGlyZWN0czogZmFsc2UgfSk7XG5cdFx0c2V0dXBEZWJ1Z2dlck1vY2soKTtcblxuXHRcdGNvbnN0IGxvYWRQcm9taXNlID0gbG9hZGVyLmxvYWQoKTtcblxuXHRcdC8vIFNpbXVsYXRlIHJlZGlyZWN0IGZyb20gd3d3IHRvIG5vbi13d3dcblx0XHRjb25zdCBtb2NrRXZlbnQ6IE1vY2tFbGVjdHJvbkV2ZW50ID0ge1xuXHRcdFx0cHJldmVudERlZmF1bHQ6IHNpbm9uLnN0dWIoKVxuXHRcdH07XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ3dpbGwtcmVkaXJlY3QnLCBtb2NrRXZlbnQsIHJlZGlyZWN0VXJsKTtcblxuXHRcdC8vIFNob3VsZCBub3QgcHJldmVudCBkZWZhdWx0IGZvciB3d3cgcHJlZml4IHJlZGlyZWN0XG5cdFx0YXNzZXJ0Lm9rKCEobW9ja0V2ZW50LnByZXZlbnREZWZhdWx0ISkuY2FsbGVkKTtcblxuXHRcdC8vIENvbnRpbnVlIHdpdGggbm9ybWFsIGxvYWRcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnZGlkLXN0YXJ0LWxvYWRpbmcnKTtcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnZGlkLWZpbmlzaC1sb2FkJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBsb2FkUHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXR1cywgJ29rJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdyZWRpcmVjdCBmcm9tIG5vbi13d3cgdG8gd3d3IHNhbWUgZG9tYWluIGlzIGFsbG93ZWQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGFnZScpO1xuXHRcdGNvbnN0IHJlZGlyZWN0VXJsID0gJ2h0dHBzOi8vd3d3LmV4YW1wbGUuY29tL290aGVyLXBhZ2UnO1xuXG5cdFx0Y29uc3QgbG9hZGVyID0gY3JlYXRlV2ViUGFnZUxvYWRlcih1cmksIHsgZm9sbG93UmVkaXJlY3RzOiBmYWxzZSB9KTtcblx0XHRzZXR1cERlYnVnZ2VyTW9jaygpO1xuXG5cdFx0Y29uc3QgbG9hZFByb21pc2UgPSBsb2FkZXIubG9hZCgpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgcmVkaXJlY3QgZnJvbSBub24td3d3IHRvIHd3d1xuXHRcdGNvbnN0IG1vY2tFdmVudDogTW9ja0VsZWN0cm9uRXZlbnQgPSB7XG5cdFx0XHRwcmV2ZW50RGVmYXVsdDogc2lub24uc3R1YigpXG5cdFx0fTtcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnd2lsbC1yZWRpcmVjdCcsIG1vY2tFdmVudCwgcmVkaXJlY3RVcmwpO1xuXG5cdFx0Ly8gU2hvdWxkIG5vdCBwcmV2ZW50IGRlZmF1bHQgZm9yIHd3dyBwcmVmaXggcmVkaXJlY3Rcblx0XHRhc3NlcnQub2soIShtb2NrRXZlbnQucHJldmVudERlZmF1bHQhKS5jYWxsZWQpO1xuXG5cdFx0Ly8gQ29udGludWUgd2l0aCBub3JtYWwgbG9hZFxuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtc3RhcnQtbG9hZGluZycpO1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtZmluaXNoLWxvYWQnKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGxvYWRQcm9taXNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RhdHVzLCAnb2snKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3JlZGlyZWN0IHRvIHRydXN0ZWQgZG9tYWluIGlzIGFsbG93ZWQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGFnZScpO1xuXHRcdGNvbnN0IHJlZGlyZWN0VXJsID0gJ2h0dHBzOi8vdHJ1c3RlZC1kb21haW4uY29tL3JlZGlyZWN0ZWQnO1xuXG5cdFx0Y29uc3QgbG9hZGVyID0gY3JlYXRlV2ViUGFnZUxvYWRlcih1cmksXG5cdFx0XHR7IGZvbGxvd1JlZGlyZWN0czogZmFsc2UgfSxcblx0XHRcdCh1cmkpID0+IHVyaS5hdXRob3JpdHkgPT09ICd0cnVzdGVkLWRvbWFpbi5jb20nIHx8IHVyaS5hdXRob3JpdHkgPT09ICdhbm90aGVyLXRydXN0ZWQuY29tJ1xuXHRcdCk7XG5cdFx0c2V0dXBEZWJ1Z2dlck1vY2soKTtcblxuXHRcdGNvbnN0IGxvYWRQcm9taXNlID0gbG9hZGVyLmxvYWQoKTtcblxuXHRcdC8vIFNpbXVsYXRlIHJlZGlyZWN0IHRvIHRydXN0ZWQgZG9tYWluXG5cdFx0Y29uc3QgbW9ja0V2ZW50OiBNb2NrRWxlY3Ryb25FdmVudCA9IHtcblx0XHRcdHByZXZlbnREZWZhdWx0OiBzaW5vbi5zdHViKClcblx0XHR9O1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCd3aWxsLXJlZGlyZWN0JywgbW9ja0V2ZW50LCByZWRpcmVjdFVybCk7XG5cblx0XHQvLyBTaG91bGQgbm90IHByZXZlbnQgZGVmYXVsdCBmb3IgdHJ1c3RlZCBkb21haW4gcmVkaXJlY3Rcblx0XHRhc3NlcnQub2soIShtb2NrRXZlbnQucHJldmVudERlZmF1bHQhKS5jYWxsZWQpO1xuXG5cdFx0Ly8gQ29udGludWUgd2l0aCBub3JtYWwgbG9hZFxuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtc3RhcnQtbG9hZGluZycpO1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtZmluaXNoLWxvYWQnKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGxvYWRQcm9taXNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RhdHVzLCAnb2snKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3Bvc3QtbG9hZCBuYXZpZ2F0aW9uIHRvIGRpZmZlcmVudCBkb21haW4gaXMgYmxvY2tlZCBzaWxlbnRseSBhbmQgY29udGVudCBpcyBleHRyYWN0ZWQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGFnZScpO1xuXHRcdGNvbnN0IGFkUmVkaXJlY3RVcmwgPSAnaHR0cHM6Ly9ldXMucnViaWNvbnByb2plY3QuY29tL3VzeW5jLmh0bWw/cD0xMjc3Nic7XG5cblx0XHRjb25zdCBsb2FkZXIgPSBjcmVhdGVXZWJQYWdlTG9hZGVyKHVyaSwgeyBmb2xsb3dSZWRpcmVjdHM6IGZhbHNlIH0pO1xuXHRcdHNldHVwRGVidWdnZXJNb2NrKCk7XG5cblx0XHRjb25zdCBsb2FkUHJvbWlzZSA9IGxvYWRlci5sb2FkKCk7XG5cblx0XHQvLyBTaW11bGF0ZSBzdWNjZXNzZnVsIHBhZ2UgbG9hZFxuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtc3RhcnQtbG9hZGluZycpO1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtZmluaXNoLWxvYWQnKTtcblxuXHRcdC8vIFNpbXVsYXRlIGFkL3RyYWNrZXIgc2NyaXB0IHJlZGlyZWN0aW5nIGFmdGVyIHBhZ2UgbG9hZFxuXHRcdGNvbnN0IG1vY2tFdmVudDogTW9ja0VsZWN0cm9uRXZlbnQgPSB7XG5cdFx0XHRwcmV2ZW50RGVmYXVsdDogc2lub24uc3R1YigpXG5cdFx0fTtcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnd2lsbC1uYXZpZ2F0ZScsIG1vY2tFdmVudCwgYWRSZWRpcmVjdFVybCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBsb2FkUHJvbWlzZTtcblxuXHRcdC8vIE5hdmlnYXRpb24gc2hvdWxkIGJlIHByZXZlbnRlZFxuXHRcdGFzc2VydC5vaygobW9ja0V2ZW50LnByZXZlbnREZWZhdWx0ISkuY2FsbGVkKTtcblx0XHQvLyBCdXQgcmVzdWx0IHNob3VsZCBiZSBvayAoY29udGVudCBleHRyYWN0ZWQpLCBOT1QgcmVkaXJlY3Rcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXR1cywgJ29rJyk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5yZXN1bHQuaW5jbHVkZXMoJ1Rlc3QgY29udGVudCBmcm9tIHBhZ2UnKSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdpbml0aWFsIHNhbWUtZG9tYWluIG5hdmlnYXRpb24gaXMgYWxsb3dlZCBidXQgbGF0ZXIgY3Jvc3MtZG9tYWluIG5hdmlnYXRpb24gaXMgYmxvY2tlZCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlJyk7XG5cdFx0Y29uc3Qgc2FtZURvbWFpblVybCA9ICdodHRwczovL2V4YW1wbGUuY29tL290aGVycGFnZSc7XG5cdFx0Y29uc3QgY3Jvc3NEb21haW5VcmwgPSAnaHR0cHM6Ly9ldXMucnViaWNvbnByb2plY3QuY29tL3VzeW5jLmh0bWw/cD0xMjc3Nic7XG5cblx0XHRjb25zdCBsb2FkZXIgPSBjcmVhdGVXZWJQYWdlTG9hZGVyKHVyaSwgeyBmb2xsb3dSZWRpcmVjdHM6IGZhbHNlIH0pO1xuXHRcdHNldHVwRGVidWdnZXJNb2NrKCk7XG5cblx0XHRjb25zdCBsb2FkUHJvbWlzZSA9IGxvYWRlci5sb2FkKCk7XG5cblx0XHQvLyBGaXJzdCBuYXZpZ2F0aW9uOiBzYW1lLWF1dGhvcml0eSwgc2hvdWxkIGJlIGFsbG93ZWRcblx0XHRjb25zdCBpbml0aWFsRXZlbnQ6IE1vY2tFbGVjdHJvbkV2ZW50ID0ge1xuXHRcdFx0cHJldmVudERlZmF1bHQ6IHNpbm9uLnN0dWIoKVxuXHRcdH07XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ3dpbGwtbmF2aWdhdGUnLCBpbml0aWFsRXZlbnQsIHNhbWVEb21haW5VcmwpO1xuXHRcdGFzc2VydC5vayghKGluaXRpYWxFdmVudC5wcmV2ZW50RGVmYXVsdCEpLmNhbGxlZCk7XG5cblx0XHQvLyBTaW11bGF0ZSBzdWNjZXNzZnVsIHBhZ2UgbG9hZFxuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtc3RhcnQtbG9hZGluZycpO1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtZmluaXNoLWxvYWQnKTtcblxuXHRcdC8vIFNlY29uZCBuYXZpZ2F0aW9uOiBjcm9zcy1kb21haW4gYWZ0ZXIgbG9hZCwgc2hvdWxkIGJlIGJsb2NrZWRcblx0XHRjb25zdCBjcm9zc0RvbWFpbkV2ZW50OiBNb2NrRWxlY3Ryb25FdmVudCA9IHtcblx0XHRcdHByZXZlbnREZWZhdWx0OiBzaW5vbi5zdHViKClcblx0XHR9O1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCd3aWxsLW5hdmlnYXRlJywgY3Jvc3NEb21haW5FdmVudCwgY3Jvc3NEb21haW5VcmwpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbG9hZFByb21pc2U7XG5cblx0XHRhc3NlcnQub2soKGNyb3NzRG9tYWluRXZlbnQucHJldmVudERlZmF1bHQhKS5jYWxsZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RhdHVzLCAnb2snKTtcblx0XHRhc3NlcnQub2socmVzdWx0LnJlc3VsdC5pbmNsdWRlcygnVGVzdCBjb250ZW50IGZyb20gcGFnZScpKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3JlZGlyZWN0IHRvIG5vbi10cnVzdGVkIGRvbWFpbiBpcyBibG9ja2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlJyk7XG5cdFx0Y29uc3QgcmVkaXJlY3RVcmwgPSAnaHR0cHM6Ly91bnRydXN0ZWQtZG9tYWluLmNvbS9yZWRpcmVjdGVkJztcblxuXHRcdGNvbnN0IGxvYWRlciA9IGNyZWF0ZVdlYlBhZ2VMb2FkZXIodXJpLFxuXHRcdFx0eyBmb2xsb3dSZWRpcmVjdHM6IGZhbHNlIH0sXG5cdFx0XHQodXJpKSA9PiB1cmkuYXV0aG9yaXR5ID09PSAndHJ1c3RlZC1kb21haW4uY29tJ1xuXHRcdCk7XG5cblx0XHR3aW5kb3cud2ViQ29udGVudHMuZGVidWdnZXIuc2VuZENvbW1hbmQucmVzb2x2ZXMoe30pO1xuXG5cdFx0Y29uc3QgbG9hZFByb21pc2UgPSBsb2FkZXIubG9hZCgpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgcmVkaXJlY3QgdG8gbm9uLXRydXN0ZWQgZG9tYWluXG5cdFx0Y29uc3QgbW9ja0V2ZW50OiBNb2NrRWxlY3Ryb25FdmVudCA9IHtcblx0XHRcdHByZXZlbnREZWZhdWx0OiBzaW5vbi5zdHViKClcblx0XHR9O1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCd3aWxsLXJlZGlyZWN0JywgbW9ja0V2ZW50LCByZWRpcmVjdFVybCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBsb2FkUHJvbWlzZTtcblxuXHRcdC8vIFNob3VsZCBwcmV2ZW50IHJlZGlyZWN0IHRvIG5vbi10cnVzdGVkIGRvbWFpblxuXHRcdGFzc2VydC5vaygobW9ja0V2ZW50LnByZXZlbnREZWZhdWx0ISkuY2FsbGVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXR1cywgJ3JlZGlyZWN0Jyk7XG5cdFx0aWYgKHJlc3VsdC5zdGF0dXMgPT09ICdyZWRpcmVjdCcpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudG9VUkkuYXV0aG9yaXR5LCAndW50cnVzdGVkLWRvbWFpbi5jb20nKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZGlyZWN0IHRvIHdpbGRjYXJkIHN1YmRvbWFpbiB0cnVzdGVkIGRvbWFpbiBpcyBhbGxvd2VkJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL3BhZ2UnKTtcblx0XHRjb25zdCByZWRpcmVjdFVybCA9ICdodHRwczovL3N1Yi50cnVzdGVkLWRvbWFpbi5jb20vcmVkaXJlY3RlZCc7XG5cblx0XHRjb25zdCBsb2FkZXIgPSBjcmVhdGVXZWJQYWdlTG9hZGVyKHVyaSxcblx0XHRcdHsgZm9sbG93UmVkaXJlY3RzOiBmYWxzZSB9LFxuXHRcdFx0KHVyaSkgPT4gdXJpLmF1dGhvcml0eS5lbmRzV2l0aCgnLnRydXN0ZWQtZG9tYWluLmNvbScpIHx8IHVyaS5hdXRob3JpdHkgPT09ICd0cnVzdGVkLWRvbWFpbi5jb20nXG5cdFx0KTtcblx0XHRzZXR1cERlYnVnZ2VyTW9jaygpO1xuXG5cdFx0Y29uc3QgbG9hZFByb21pc2UgPSBsb2FkZXIubG9hZCgpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgcmVkaXJlY3QgdG8gc3ViZG9tYWluIG9mIHRydXN0ZWQgd2lsZGNhcmQgZG9tYWluXG5cdFx0Y29uc3QgbW9ja0V2ZW50OiBNb2NrRWxlY3Ryb25FdmVudCA9IHtcblx0XHRcdHByZXZlbnREZWZhdWx0OiBzaW5vbi5zdHViKClcblx0XHR9O1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCd3aWxsLXJlZGlyZWN0JywgbW9ja0V2ZW50LCByZWRpcmVjdFVybCk7XG5cblx0XHQvLyBTaG91bGQgbm90IHByZXZlbnQgZGVmYXVsdCBmb3Igd2lsZGNhcmQgc3ViZG9tYWluIG1hdGNoXG5cdFx0YXNzZXJ0Lm9rKCEobW9ja0V2ZW50LnByZXZlbnREZWZhdWx0ISkuY2FsbGVkKTtcblxuXHRcdC8vIENvbnRpbnVlIHdpdGggbm9ybWFsIGxvYWRcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnZGlkLXN0YXJ0LWxvYWRpbmcnKTtcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnZGlkLWZpbmlzaC1sb2FkJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBsb2FkUHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXR1cywgJ29rJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCduYXZpZ2F0aW9uIHRvIGRvbWFpbiBibG9ja2VkIGJ5IGlzRG9tYWluQWxsb3dlZCByZXR1cm5zIGVycm9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlJyk7XG5cdFx0Y29uc3QgYmxvY2tlZFVybCA9ICdodHRwczovL2Jsb2NrZWQtZG9tYWluLmNvbS9wYXRoJztcblxuXHRcdGNvbnN0IGxvYWRlciA9IGNyZWF0ZVdlYlBhZ2VMb2FkZXIodXJpLCB7IGZvbGxvd1JlZGlyZWN0czogdHJ1ZSB9LCB1bmRlZmluZWQsICh1KSA9PiB1LmF1dGhvcml0eSAhPT0gJ2Jsb2NrZWQtZG9tYWluLmNvbScpO1xuXG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmRlYnVnZ2VyLnNlbmRDb21tYW5kLnJlc29sdmVzKHt9KTtcblxuXHRcdGNvbnN0IGxvYWRQcm9taXNlID0gbG9hZGVyLmxvYWQoKTtcblxuXHRcdGNvbnN0IG1vY2tFdmVudDogTW9ja0VsZWN0cm9uRXZlbnQgPSB7XG5cdFx0XHRwcmV2ZW50RGVmYXVsdDogc2lub24uc3R1YigpXG5cdFx0fTtcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnd2lsbC1uYXZpZ2F0ZScsIG1vY2tFdmVudCwgYmxvY2tlZFVybCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBsb2FkUHJvbWlzZTtcblxuXHRcdGFzc2VydC5vaygobW9ja0V2ZW50LnByZXZlbnREZWZhdWx0ISkuY2FsbGVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXR1cywgJ2Vycm9yJyk7XG5cdFx0aWYgKHJlc3VsdC5zdGF0dXMgPT09ICdlcnJvcicpIHtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuZXJyb3I/LmluY2x1ZGVzKCdibG9ja2VkLWRvbWFpbi5jb20nKSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCduYXZpZ2F0aW9uIHRvIGFsbG93ZWQgZG9tYWluIGlzIG5vdCBibG9ja2VkIGJ5IGlzRG9tYWluQWxsb3dlZCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlJyk7XG5cdFx0Y29uc3QgYWxsb3dlZFVybCA9ICdodHRwczovL2FsbG93ZWQtZG9tYWluLmNvbS9wYXRoJztcblxuXHRcdGNvbnN0IGxvYWRlciA9IGNyZWF0ZVdlYlBhZ2VMb2FkZXIodXJpLCB7IGZvbGxvd1JlZGlyZWN0czogdHJ1ZSB9LCB1bmRlZmluZWQsICh1KSA9PiB1LmF1dGhvcml0eSAhPT0gJ2Jsb2NrZWQtZG9tYWluLmNvbScpO1xuXHRcdHNldHVwRGVidWdnZXJNb2NrKCk7XG5cblx0XHRjb25zdCBsb2FkUHJvbWlzZSA9IGxvYWRlci5sb2FkKCk7XG5cblx0XHRjb25zdCBtb2NrRXZlbnQ6IE1vY2tFbGVjdHJvbkV2ZW50ID0ge1xuXHRcdFx0cHJldmVudERlZmF1bHQ6IHNpbm9uLnN0dWIoKVxuXHRcdH07XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ3dpbGwtbmF2aWdhdGUnLCBtb2NrRXZlbnQsIGFsbG93ZWRVcmwpO1xuXG5cdFx0Ly8gU2hvdWxkIG5vdCBwcmV2ZW50IG5hdmlnYXRpb24gdG8gYWxsb3dlZCBkb21haW5cblx0XHRhc3NlcnQub2soIShtb2NrRXZlbnQucHJldmVudERlZmF1bHQhKS5jYWxsZWQpO1xuXG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1zdGFydC1sb2FkaW5nJyk7XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1maW5pc2gtbG9hZCcpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbG9hZFByb21pc2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdGF0dXMsICdvaycpO1xuXHR9KSk7XG5cblx0dGVzdCgnbmV0d29yayBwb2xpY3kgY2FuY2VscyBkZW5pZWQgc3ViZnJhbWUgcmVxdWVzdHMgYW5kIGFsbG93cyB0cnVzdGVkIHJlcXVlc3RzJywgKCkgPT4ge1xuXHRcdGNyZWF0ZVdlYlBhZ2VMb2FkZXIoXG5cdFx0XHRVUkkucGFyc2UoJ2h0dHBzOi8vYWxsb3dlZC5leGFtcGxlL3BhZ2UnKSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVyaSA9PiB1cmkuYXV0aG9yaXR5ID09PSAnYWxsb3dlZC5leGFtcGxlJ1xuXHRcdCk7XG5cblx0XHRhc3NlcnQub2sod2luZG93LndlYkNvbnRlbnRzLnNlc3Npb24ud2ViUmVxdWVzdC5vbkJlZm9yZVJlcXVlc3QuY2FsbGVkT25jZSk7XG5cdFx0Y29uc3QgbGlzdGVuZXIgPSB3aW5kb3cud2ViQ29udGVudHMuc2Vzc2lvbi53ZWJSZXF1ZXN0Lm9uQmVmb3JlUmVxdWVzdC5maXJzdENhbGwuYXJnc1swXTtcblx0XHRjb25zdCBkZW5pZWRDYWxsYmFjayA9IHNpbm9uLnN0dWIoKTtcblx0XHRjb25zdCBhbGxvd2VkQ2FsbGJhY2sgPSBzaW5vbi5zdHViKCk7XG5cblx0XHRsaXN0ZW5lcih7IHVybDogJ2h0dHBzOi8vZGVuaWVkLmV4YW1wbGUvcHJpdmF0ZScsIHJlc291cmNlVHlwZTogJ3N1YkZyYW1lJyB9LCBkZW5pZWRDYWxsYmFjayk7XG5cdFx0bGlzdGVuZXIoeyB1cmw6ICdodHRwczovL2FsbG93ZWQuZXhhbXBsZS9mcmFtZScsIHJlc291cmNlVHlwZTogJ3N1YkZyYW1lJyB9LCBhbGxvd2VkQ2FsbGJhY2spO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkZW5pZWQ6IGRlbmllZENhbGxiYWNrLmZpcnN0Q2FsbD8uYXJnc1swXSxcblx0XHRcdGFsbG93ZWQ6IGFsbG93ZWRDYWxsYmFjay5maXJzdENhbGw/LmFyZ3NbMF0sXG5cdFx0fSwge1xuXHRcdFx0ZGVuaWVkOiB7IGNhbmNlbDogdHJ1ZSB9LFxuXHRcdFx0YWxsb3dlZDogeyBjYW5jZWw6IGZhbHNlIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbmllcyBhbGwgY2hpbGQgd2luZG93IGNyZWF0aW9uIGZyb20gZmV0Y2hlZCBjb250ZW50JywgKCkgPT4ge1xuXHRcdGNyZWF0ZVdlYlBhZ2VMb2FkZXIoVVJJLnBhcnNlKCdodHRwczovL2FsbG93ZWQuZXhhbXBsZS9wYWdlJykpO1xuXG5cdFx0YXNzZXJ0Lm9rKHdpbmRvdy53ZWJDb250ZW50cy5zZXRXaW5kb3dPcGVuSGFuZGxlci5jYWxsZWRPbmNlKTtcblx0XHRjb25zdCBoYW5kbGVyID0gd2luZG93LndlYkNvbnRlbnRzLnNldFdpbmRvd09wZW5IYW5kbGVyLmZpcnN0Q2FsbC5hcmdzWzBdO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRoYW5kbGVyKHsgdXJsOiAnaHR0cHM6Ly9hbGxvd2VkLmV4YW1wbGUvcG9wdXAnIH0pLFxuXHRcdFx0aGFuZGxlcih7IHVybDogJ3ZzY29kZTptY3AvaW5zdGFsbD90ZXN0JyB9KSxcblx0XHRcdGhhbmRsZXIoeyB1cmw6ICdjYWxjdWxhdG9yOicgfSksXG5cdFx0XSwgW1xuXHRcdFx0eyBhY3Rpb246ICdkZW55JyB9LFxuXHRcdFx0eyBhY3Rpb246ICdkZW55JyB9LFxuXHRcdFx0eyBhY3Rpb246ICdkZW55JyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIHVuc2FmZSBzY2hlbWVzIGJlZm9yZSBkb21haW4gZmlsdGVyaW5nIHJlcXVlc3RzJywgKCkgPT4ge1xuXHRcdGNyZWF0ZVdlYlBhZ2VMb2FkZXIoXG5cdFx0XHRVUkkucGFyc2UoJ2h0dHBzOi8vYWxsb3dlZC5leGFtcGxlL3BhZ2UnKSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdCgpID0+IHRydWVcblx0XHQpO1xuXG5cdFx0YXNzZXJ0Lm9rKHdpbmRvdy53ZWJDb250ZW50cy5zZXNzaW9uLndlYlJlcXVlc3Qub25CZWZvcmVSZXF1ZXN0LmNhbGxlZE9uY2UpO1xuXHRcdGNvbnN0IGxpc3RlbmVyID0gd2luZG93LndlYkNvbnRlbnRzLnNlc3Npb24ud2ViUmVxdWVzdC5vbkJlZm9yZVJlcXVlc3QuZmlyc3RDYWxsLmFyZ3NbMF07XG5cdFx0Y29uc3QgY2FsbGJhY2tSZXN1bHRzID0gbmV3IE1hcDxzdHJpbmcsIHVua25vd24+KCk7XG5cdFx0Zm9yIChjb25zdCB1cmwgb2YgW1xuXHRcdFx0J2h0dHBzOi8vYWxsb3dlZC5leGFtcGxlL3Jlc291cmNlJyxcblx0XHRcdCdodHRwOi8vYWxsb3dlZC5leGFtcGxlL3Jlc291cmNlJyxcblx0XHRcdCd2c2NvZGU6bWNwL2luc3RhbGw/dGVzdCcsXG5cdFx0XHQnZmlsZTovLy9wcml2YXRlL2ZpbGUnLFxuXHRcdFx0J2NhbGN1bGF0b3I6Jyxcblx0XHRdKSB7XG5cdFx0XHRsaXN0ZW5lcih7IHVybCwgcmVzb3VyY2VUeXBlOiAnc3ViRnJhbWUnIH0sIChyZXN1bHQ6IHVua25vd24pID0+IGNhbGxiYWNrUmVzdWx0cy5zZXQodXJsLCByZXN1bHQpKTtcblx0XHR9XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKE9iamVjdC5mcm9tRW50cmllcyhjYWxsYmFja1Jlc3VsdHMpLCB7XG5cdFx0XHQnaHR0cHM6Ly9hbGxvd2VkLmV4YW1wbGUvcmVzb3VyY2UnOiB7IGNhbmNlbDogZmFsc2UgfSxcblx0XHRcdCdodHRwOi8vYWxsb3dlZC5leGFtcGxlL3Jlc291cmNlJzogeyBjYW5jZWw6IGZhbHNlIH0sXG5cdFx0XHQndnNjb2RlOm1jcC9pbnN0YWxsP3Rlc3QnOiB7IGNhbmNlbDogdHJ1ZSB9LFxuXHRcdFx0J2ZpbGU6Ly8vcHJpdmF0ZS9maWxlJzogeyBjYW5jZWw6IHRydWUgfSxcblx0XHRcdCdjYWxjdWxhdG9yOic6IHsgY2FuY2VsOiB0cnVlIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGxpZXMgZG9tYWluIHBvbGljeSB0byBXZWJTb2NrZXQgcmVxdWVzdHMnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlV2ViUGFnZUxvYWRlcihcblx0XHRcdFVSSS5wYXJzZSgnaHR0cHM6Ly9hbGxvd2VkLmV4YW1wbGUvcGFnZScpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dXJpID0+IHVyaS5hdXRob3JpdHkgPT09ICdhbGxvd2VkLmV4YW1wbGUnXG5cdFx0KTtcblxuXHRcdGNvbnN0IGxpc3RlbmVyID0gd2luZG93LndlYkNvbnRlbnRzLnNlc3Npb24ud2ViUmVxdWVzdC5vbkJlZm9yZVJlcXVlc3QuZmlyc3RDYWxsLmFyZ3NbMF07XG5cdFx0Y29uc3QgY2FsbGJhY2tSZXN1bHRzID0gbmV3IE1hcDxzdHJpbmcsIHVua25vd24+KCk7XG5cdFx0Zm9yIChjb25zdCB1cmwgb2YgW1xuXHRcdFx0J3dzOi8vYWxsb3dlZC5leGFtcGxlL3NvY2tldCcsXG5cdFx0XHQnd3NzOi8vYWxsb3dlZC5leGFtcGxlL3NvY2tldCcsXG5cdFx0XHQnd3M6Ly9kZW5pZWQuZXhhbXBsZS9zb2NrZXQnLFxuXHRcdFx0J3dzczovL2RlbmllZC5leGFtcGxlL3NvY2tldCcsXG5cdFx0XSkge1xuXHRcdFx0bGlzdGVuZXIoeyB1cmwsIHJlc291cmNlVHlwZTogJ3dlYlNvY2tldCcgfSwgKHJlc3VsdDogdW5rbm93bikgPT4gY2FsbGJhY2tSZXN1bHRzLnNldCh1cmwsIHJlc3VsdCkpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoT2JqZWN0LmZyb21FbnRyaWVzKGNhbGxiYWNrUmVzdWx0cyksIHtcblx0XHRcdCd3czovL2FsbG93ZWQuZXhhbXBsZS9zb2NrZXQnOiB7IGNhbmNlbDogZmFsc2UgfSxcblx0XHRcdCd3c3M6Ly9hbGxvd2VkLmV4YW1wbGUvc29ja2V0JzogeyBjYW5jZWw6IGZhbHNlIH0sXG5cdFx0XHQnd3M6Ly9kZW5pZWQuZXhhbXBsZS9zb2NrZXQnOiB7IGNhbmNlbDogdHJ1ZSB9LFxuXHRcdFx0J3dzczovL2RlbmllZC5leGFtcGxlL3NvY2tldCc6IHsgY2FuY2VsOiB0cnVlIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhaWxzIGNsb3NlZCBmb3IgbWFsZm9ybWVkIHJlcXVlc3QgYW5kIGZyYW1lIFVSTHMnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlV2ViUGFnZUxvYWRlcihVUkkucGFyc2UoJ2h0dHBzOi8vYWxsb3dlZC5leGFtcGxlL3BhZ2UnKSk7XG5cdFx0Y29uc3QgcmVxdWVzdExpc3RlbmVyID0gd2luZG93LndlYkNvbnRlbnRzLnNlc3Npb24ud2ViUmVxdWVzdC5vbkJlZm9yZVJlcXVlc3QuZmlyc3RDYWxsLmFyZ3NbMF07XG5cdFx0Y29uc3QgcmVxdWVzdENhbGxiYWNrID0gc2lub24uc3R1YigpO1xuXHRcdGNvbnN0IGZyYW1lRXZlbnQgPSBjcmVhdGVXaWxsRnJhbWVOYXZpZ2F0ZUV2ZW50KCdub3QgYSB1cmknKTtcblxuXHRcdHJlcXVlc3RMaXN0ZW5lcih7IHVybDogJ25vdCBhIHVyaScsIHJlc291cmNlVHlwZTogJ3N1YkZyYW1lJyB9LCByZXF1ZXN0Q2FsbGJhY2spO1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCd3aWxsLWZyYW1lLW5hdmlnYXRlJywgZnJhbWVFdmVudCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlcXVlc3Q6IHJlcXVlc3RDYWxsYmFjay5maXJzdENhbGw/LmFyZ3NbMF0sXG5cdFx0XHRmcmFtZVByZXZlbnRlZDogZnJhbWVFdmVudC5wcmV2ZW50RGVmYXVsdC5jYWxsZWRPbmNlLFxuXHRcdH0sIHtcblx0XHRcdHJlcXVlc3Q6IHsgY2FuY2VsOiB0cnVlIH0sXG5cdFx0XHRmcmFtZVByZXZlbnRlZDogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYmxvY2tzIHVuc2FmZSBmcmFtZSBuYXZpZ2F0aW9uIHNjaGVtZXMgYW5kIHByZXNlcnZlcyBicm93c2VyIGNvbnRlbnQgc2NoZW1lcycsICgpID0+IHtcblx0XHRjcmVhdGVXZWJQYWdlTG9hZGVyKFVSSS5wYXJzZSgnaHR0cHM6Ly9hbGxvd2VkLmV4YW1wbGUvcGFnZScpKTtcblxuXHRcdGNvbnN0IHJlc3VsdHMgPSBuZXcgTWFwPHN0cmluZywgYm9vbGVhbj4oKTtcblx0XHRmb3IgKGNvbnN0IHVybCBvZiBbXG5cdFx0XHQnaHR0cHM6Ly9hbGxvd2VkLmV4YW1wbGUvZnJhbWUnLFxuXHRcdFx0J2h0dHA6Ly9hbGxvd2VkLmV4YW1wbGUvZnJhbWUnLFxuXHRcdFx0J2Fib3V0OmJsYW5rJyxcblx0XHRcdCdkYXRhOnRleHQvaHRtbCxmcmFtZScsXG5cdFx0XHQnYmxvYjpodHRwczovL2FsbG93ZWQuZXhhbXBsZS9mcmFtZS1pZCcsXG5cdFx0XHQndnNjb2RlOm1jcC9pbnN0YWxsP3Rlc3QnLFxuXHRcdFx0J2ZpbGU6Ly8vcHJpdmF0ZS9maWxlJyxcblx0XHRcdCdtYWlsdG86dGVzdEBleGFtcGxlLmNvbScsXG5cdFx0XHQnY2FsY3VsYXRvcjonLFxuXHRcdF0pIHtcblx0XHRcdGNvbnN0IGRldGFpbHMgPSBjcmVhdGVXaWxsRnJhbWVOYXZpZ2F0ZUV2ZW50KHVybCk7XG5cdFx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnd2lsbC1mcmFtZS1uYXZpZ2F0ZScsIGRldGFpbHMpO1xuXHRcdFx0cmVzdWx0cy5zZXQodXJsLCBkZXRhaWxzLnByZXZlbnREZWZhdWx0LmNhbGxlZCk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChPYmplY3QuZnJvbUVudHJpZXMocmVzdWx0cyksIHtcblx0XHRcdCdodHRwczovL2FsbG93ZWQuZXhhbXBsZS9mcmFtZSc6IGZhbHNlLFxuXHRcdFx0J2h0dHA6Ly9hbGxvd2VkLmV4YW1wbGUvZnJhbWUnOiBmYWxzZSxcblx0XHRcdCdhYm91dDpibGFuayc6IGZhbHNlLFxuXHRcdFx0J2RhdGE6dGV4dC9odG1sLGZyYW1lJzogZmFsc2UsXG5cdFx0XHQnYmxvYjpodHRwczovL2FsbG93ZWQuZXhhbXBsZS9mcmFtZS1pZCc6IGZhbHNlLFxuXHRcdFx0J3ZzY29kZTptY3AvaW5zdGFsbD90ZXN0JzogdHJ1ZSxcblx0XHRcdCdmaWxlOi8vL3ByaXZhdGUvZmlsZSc6IHRydWUsXG5cdFx0XHQnbWFpbHRvOnRlc3RAZXhhbXBsZS5jb20nOiB0cnVlLFxuXHRcdFx0J2NhbGN1bGF0b3I6JzogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYmxvY2tzIHVuc2FmZSBtYWluLWZyYW1lIHNjaGVtZXMgd2hlbiByZWRpcmVjdHMgYXJlIGVuYWJsZWQnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlV2ViUGFnZUxvYWRlcihcblx0XHRcdFVSSS5wYXJzZSgnaHR0cHM6Ly9hbGxvd2VkLmV4YW1wbGUvcGFnZScpLFxuXHRcdFx0eyBmb2xsb3dSZWRpcmVjdHM6IHRydWUgfSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdCgpID0+IHRydWVcblx0XHQpO1xuXHRcdGNvbnN0IGV2ZW50ID0geyBwcmV2ZW50RGVmYXVsdDogc2lub24uc3R1YigpIH07XG5cblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnd2lsbC1uYXZpZ2F0ZScsIGV2ZW50LCAndnNjb2RlOm1jcC9pbnN0YWxsP3Rlc3QnKTtcblxuXHRcdGFzc2VydC5vayhldmVudC5wcmV2ZW50RGVmYXVsdC5jYWxsZWRPbmNlKTtcblx0fSk7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEhUVFAgRXJyb3IgVGVzdHNcblxuXHR0ZXN0KCdIVFRQIGVycm9yIHN0YXR1cyBjb2RlIHJldHVybnMgZXJyb3Igd2l0aCBjb250ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9ub3QtZm91bmQnKTtcblxuXHRcdGNvbnN0IGxvYWRlciA9IGNyZWF0ZVdlYlBhZ2VMb2FkZXIodXJpKTtcblx0XHRzZXR1cERlYnVnZ2VyTW9jaygpO1xuXG5cdFx0Y29uc3QgbG9hZFByb21pc2UgPSBsb2FkZXIubG9hZCgpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgbmV0d29yayByZXNwb25zZSB3aXRoIGVycm9yIHN0YXR1c1xuXHRcdGNvbnN0IG1vY2tFdmVudDogTW9ja0VsZWN0cm9uRXZlbnQgPSB7fTtcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZGVidWdnZXIuZW1pdCgnbWVzc2FnZScsIG1vY2tFdmVudCwgJ05ldHdvcmsucmVzcG9uc2VSZWNlaXZlZCcsIHtcblx0XHRcdHJlcXVlc3RJZDogJ3JlcTEnLFxuXHRcdFx0dHlwZTogJ0RvY3VtZW50Jyxcblx0XHRcdHJlc3BvbnNlOiB7XG5cdFx0XHRcdHN0YXR1czogNDA0LFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnTm90IEZvdW5kJ1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbG9hZFByb21pc2U7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXR1cywgJ2Vycm9yJyk7XG5cdFx0aWYgKHJlc3VsdC5zdGF0dXMgPT09ICdlcnJvcicpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RhdHVzQ29kZSwgNDA0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZXJyb3IsICdOb3QgRm91bmQnKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ0hUVFAgNTAwIGVycm9yIHJldHVybnMgc2VydmVyIGVycm9yIHN0YXR1cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vc2VydmVyLWVycm9yJyk7XG5cblx0XHRjb25zdCBsb2FkZXIgPSBjcmVhdGVXZWJQYWdlTG9hZGVyKHVyaSk7XG5cdFx0c2V0dXBEZWJ1Z2dlck1vY2soKTtcblxuXHRcdGNvbnN0IGxvYWRQcm9taXNlID0gbG9hZGVyLmxvYWQoKTtcblxuXHRcdC8vIFNpbXVsYXRlIG5ldHdvcmsgcmVzcG9uc2Ugd2l0aCA1MDAgc3RhdHVzXG5cdFx0Y29uc3QgbW9ja0V2ZW50OiBNb2NrRWxlY3Ryb25FdmVudCA9IHt9O1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5kZWJ1Z2dlci5lbWl0KCdtZXNzYWdlJywgbW9ja0V2ZW50LCAnTmV0d29yay5yZXNwb25zZVJlY2VpdmVkJywge1xuXHRcdFx0cmVxdWVzdElkOiAncmVxMScsXG5cdFx0XHR0eXBlOiAnRG9jdW1lbnQnLFxuXHRcdFx0cmVzcG9uc2U6IHtcblx0XHRcdFx0c3RhdHVzOiA1MDAsXG5cdFx0XHRcdHN0YXR1c1RleHQ6ICdJbnRlcm5hbCBTZXJ2ZXIgRXJyb3InXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBsb2FkUHJvbWlzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RhdHVzLCAnZXJyb3InKTtcblx0XHRpZiAocmVzdWx0LnN0YXR1cyA9PT0gJ2Vycm9yJykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdGF0dXNDb2RlLCA1MDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lcnJvciwgJ0ludGVybmFsIFNlcnZlciBFcnJvcicpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnSFRUUCBlcnJvciB3aXRob3V0IHN0YXR1cyB0ZXh0IHVzZXMgZmFsbGJhY2sgbWVzc2FnZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vZXJyb3InKTtcblxuXHRcdGNvbnN0IGxvYWRlciA9IGNyZWF0ZVdlYlBhZ2VMb2FkZXIodXJpKTtcblx0XHRzZXR1cERlYnVnZ2VyTW9jaygpO1xuXG5cdFx0Y29uc3QgbG9hZFByb21pc2UgPSBsb2FkZXIubG9hZCgpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgbmV0d29yayByZXNwb25zZSB3aXRob3V0IHN0YXR1cyB0ZXh0XG5cdFx0Y29uc3QgbW9ja0V2ZW50OiBNb2NrRWxlY3Ryb25FdmVudCA9IHt9O1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5kZWJ1Z2dlci5lbWl0KCdtZXNzYWdlJywgbW9ja0V2ZW50LCAnTmV0d29yay5yZXNwb25zZVJlY2VpdmVkJywge1xuXHRcdFx0cmVxdWVzdElkOiAncmVxMScsXG5cdFx0XHR0eXBlOiAnRG9jdW1lbnQnLFxuXHRcdFx0cmVzcG9uc2U6IHtcblx0XHRcdFx0c3RhdHVzOiA1MDNcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGxvYWRQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdGF0dXMsICdlcnJvcicpO1xuXHRcdGlmIChyZXN1bHQuc3RhdHVzID09PSAnZXJyb3InKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXR1c0NvZGUsIDUwMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVycm9yLCAnSFRUUCBlcnJvciA1MDMnKTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBOZXR3b3JrIFJlcXVlc3QgVHJhY2tpbmcgVGVzdHNcblxuXHR0ZXN0KCd0cmFja3MgbmV0d29yayByZXF1ZXN0cyBhbmQgd2FpdHMgZm9yIGNvbXBsZXRpb24nLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGFnZScpO1xuXG5cdFx0Y29uc3QgbG9hZGVyID0gY3JlYXRlV2ViUGFnZUxvYWRlcih1cmkpO1xuXHRcdHNldHVwRGVidWdnZXJNb2NrKCk7XG5cblx0XHRjb25zdCBsb2FkUHJvbWlzZSA9IGxvYWRlci5sb2FkKCk7XG5cblx0XHQvLyBTaW11bGF0ZSBwYWdlIHN0YXJ0aW5nIHRvIGxvYWRcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnZGlkLXN0YXJ0LWxvYWRpbmcnKTtcblxuXHRcdC8vIFNpbXVsYXRlIG5ldHdvcmsgcmVxdWVzdHNcblx0XHRjb25zdCBtb2NrRXZlbnQ6IE1vY2tFbGVjdHJvbkV2ZW50ID0ge307XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmRlYnVnZ2VyLmVtaXQoJ21lc3NhZ2UnLCBtb2NrRXZlbnQsICdOZXR3b3JrLnJlcXVlc3RXaWxsQmVTZW50Jywge1xuXHRcdFx0cmVxdWVzdElkOiAncmVxMSdcblx0XHR9KTtcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZGVidWdnZXIuZW1pdCgnbWVzc2FnZScsIG1vY2tFdmVudCwgJ05ldHdvcmsucmVxdWVzdFdpbGxCZVNlbnQnLCB7XG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXEyJ1xuXHRcdH0pO1xuXG5cdFx0Ly8gU2ltdWxhdGUgcGFnZSBmaW5pc2ggbG9hZCAoYnV0IG5ldHdvcmsgcmVxdWVzdHMgc3RpbGwgcGVuZGluZylcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnZGlkLWZpbmlzaC1sb2FkJyk7XG5cblx0XHQvLyBTaW11bGF0ZSBuZXR3b3JrIHJlcXVlc3RzIGNvbXBsZXRpbmdcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZGVidWdnZXIuZW1pdCgnbWVzc2FnZScsIG1vY2tFdmVudCwgJ05ldHdvcmsubG9hZGluZ0ZpbmlzaGVkJywge1xuXHRcdFx0cmVxdWVzdElkOiAncmVxMSdcblx0XHR9KTtcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZGVidWdnZXIuZW1pdCgnbWVzc2FnZScsIG1vY2tFdmVudCwgJ05ldHdvcmsubG9hZGluZ0ZpbmlzaGVkJywge1xuXHRcdFx0cmVxdWVzdElkOiAncmVxMidcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGxvYWRQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdGF0dXMsICdvaycpO1xuXHR9KSk7XG5cblx0dGVzdCgnaGFuZGxlcyBuZXR3b3JrIHJlcXVlc3QgZmFpbHVyZXMgZ3JhY2VmdWxseScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlJyk7XG5cblx0XHRjb25zdCBsb2FkZXIgPSBjcmVhdGVXZWJQYWdlTG9hZGVyKHVyaSk7XG5cdFx0c2V0dXBEZWJ1Z2dlck1vY2soKTtcblxuXHRcdGNvbnN0IGxvYWRQcm9taXNlID0gbG9hZGVyLmxvYWQoKTtcblxuXHRcdC8vIFNpbXVsYXRlIHBhZ2UgbG9hZFxuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtc3RhcnQtbG9hZGluZycpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgYSBuZXR3b3JrIHJlcXVlc3QgdGhhdCBmYWlsc1xuXHRcdGNvbnN0IG1vY2tFdmVudDogTW9ja0VsZWN0cm9uRXZlbnQgPSB7fTtcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZGVidWdnZXIuZW1pdCgnbWVzc2FnZScsIG1vY2tFdmVudCwgJ05ldHdvcmsucmVxdWVzdFdpbGxCZVNlbnQnLCB7XG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJ1xuXHRcdH0pO1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5kZWJ1Z2dlci5lbWl0KCdtZXNzYWdlJywgbW9ja0V2ZW50LCAnTmV0d29yay5sb2FkaW5nRmFpbGVkJywge1xuXHRcdFx0cmVxdWVzdElkOiAncmVxMSdcblx0XHR9KTtcblxuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtZmluaXNoLWxvYWQnKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGxvYWRQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdGF0dXMsICdvaycpO1xuXHR9KSk7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEFjY2Vzc2liaWxpdHkgVHJlZSBFeHRyYWN0aW9uIFRlc3RzXG5cblx0dGVzdCgnZXh0cmFjdHMgY29udGVudCBmcm9tIGFjY2Vzc2liaWxpdHkgdHJlZScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlJyk7XG5cdFx0Y29uc3QgYXhOb2RlczogQVhOb2RlW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ2hlYWRpbmcxJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IHsgdHlwZTogJ3JvbGUnLCB2YWx1ZTogJ2hlYWRpbmcnIH0sXG5cdFx0XHRcdG5hbWU6IHsgdHlwZTogJ3N0cmluZycsIHZhbHVlOiAnUGFnZSBUaXRsZScgfSxcblx0XHRcdFx0cHJvcGVydGllczogW3sgbmFtZTogJ2xldmVsJywgdmFsdWU6IHsgdHlwZTogJ2ludGVnZXInLCB2YWx1ZTogMSB9IH1dLFxuXHRcdFx0XHRjaGlsZElkczogWyd0ZXh0MSddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICd0ZXh0MScsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiB7IHR5cGU6ICdyb2xlJywgdmFsdWU6ICdTdGF0aWNUZXh0JyB9LFxuXHRcdFx0XHRuYW1lOiB7IHR5cGU6ICdzdHJpbmcnLCB2YWx1ZTogJ1BhZ2UgVGl0bGUnIH1cblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgbG9hZGVyID0gY3JlYXRlV2ViUGFnZUxvYWRlcih1cmkpO1xuXHRcdHNldHVwRGVidWdnZXJNb2NrKHsgYXhOb2RlcyB9KTtcblxuXHRcdGNvbnN0IGxvYWRQcm9taXNlID0gbG9hZGVyLmxvYWQoKTtcblxuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtc3RhcnQtbG9hZGluZycpO1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtZmluaXNoLWxvYWQnKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGxvYWRQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdGF0dXMsICdvaycpO1xuXHRcdGlmIChyZXN1bHQuc3RhdHVzID09PSAnb2snKSB7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LnJlc3VsdC5pbmNsdWRlcygnIyBQYWdlIFRpdGxlJykpO1xuXHRcdH1cblx0fSkpO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gRE9NIGV4dHJhY3Rpb24gd2hlbiBhY2Nlc3NpYmlsaXR5IHRyZWUgeWllbGRzIGluc3VmZmljaWVudCBjb250ZW50JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL3BhZ2UnKTtcblx0XHQvLyBDcmVhdGUgQVggdHJlZSB3aXRoIHZlcnkgc2hvcnQgY29udGVudCAobGVzcyB0aGFuIE1JTl9DT05URU5UX0xFTkdUSClcblx0XHRjb25zdCBzaG9ydEFYTm9kZXM6IEFYTm9kZVtdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdub2RlMScsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiB7IHR5cGU6ICdyb2xlJywgdmFsdWU6ICdTdGF0aWNUZXh0JyB9LFxuXHRcdFx0XHRuYW1lOiB7IHR5cGU6ICdzdHJpbmcnLCB2YWx1ZTogJ1Nob3J0JyB9XG5cdFx0XHR9XG5cdFx0XTtcblxuXHRcdGNvbnN0IGxvYWRlciA9IGNyZWF0ZVdlYlBhZ2VMb2FkZXIodXJpKTtcblx0XHRzZXR1cERlYnVnZ2VyTW9jayh7IGF4Tm9kZXM6IHNob3J0QVhOb2RlcyB9KTtcblxuXHRcdC8vIE1vY2sgRE9NIGV4dHJhY3Rpb24gcmV0dXJuaW5nIGxvbmdlciBjb250ZW50XG5cdFx0Y29uc3QgZG9tQ29udGVudCA9ICdUaGlzIGlzIG11Y2ggbG9uZ2VyIGNvbnRlbnQgZXh0cmFjdGVkIGZyb20gdGhlIERPTSB0aGF0IGV4Y2VlZHMgdGhlIG1pbmltdW0gY29udGVudCBsZW5ndGggcmVxdWlyZW1lbnQgYW5kIHNob3VsZCBiZSB1c2VkIGluc3RlYWQgb2YgdGhlIHNob3J0IGFjY2Vzc2liaWxpdHkgdHJlZSBjb250ZW50Lic7XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmV4ZWN1dGVKYXZhU2NyaXB0LnJlc29sdmVzKGRvbUNvbnRlbnQpO1xuXG5cdFx0Y29uc3QgbG9hZFByb21pc2UgPSBsb2FkZXIubG9hZCgpO1xuXG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1zdGFydC1sb2FkaW5nJyk7XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1maW5pc2gtbG9hZCcpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbG9hZFByb21pc2U7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXR1cywgJ29rJyk7XG5cdFx0aWYgKHJlc3VsdC5zdGF0dXMgPT09ICdvaycpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucmVzdWx0LCBkb21Db250ZW50KTtcblx0XHR9XG5cdFx0Ly8gVmVyaWZ5IGV4ZWN1dGVKYXZhU2NyaXB0IHdhcyBjYWxsZWQgZm9yIERPTSBleHRyYWN0aW9uXG5cdFx0YXNzZXJ0Lm9rKHdpbmRvdy53ZWJDb250ZW50cy5leGVjdXRlSmF2YVNjcmlwdC5jYWxsZWQpO1xuXHR9KSk7XG5cblx0dGVzdCgncmV0dXJucyBlcnJvciB3aGVuIGFjY2Vzc2liaWxpdHkgdHJlZSBleHRyYWN0aW9uIGhhbmdzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL3BhZ2UnKTtcblx0XHRjb25zdCBsb2FkZXIgPSBjcmVhdGVXZWJQYWdlTG9hZGVyKHVyaSk7XG5cdFx0c2V0dXBEZWJ1Z2dlck1vY2soeyBhY2Nlc3NpYmlsaXR5SGFuZzogdHJ1ZSB9KTtcblxuXHRcdGNvbnN0IGxvYWRQcm9taXNlID0gbG9hZGVyLmxvYWQoKTtcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZW1pdCgnZGlkLXN0YXJ0LWxvYWRpbmcnKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBsb2FkUHJvbWlzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RhdHVzLCAnZXJyb3InKTtcblx0XHRpZiAocmVzdWx0LnN0YXR1cyA9PT0gJ2Vycm9yJykge1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5lcnJvci5pbmNsdWRlcygnRmFpbGVkIHRvIGV4dHJhY3QgbWVhbmluZ2Z1bCBjb250ZW50JykpO1xuXHRcdH1cblx0XHQvLyBWZXJpZnkgZXhlY3V0ZUphdmFTY3JpcHQgd2FzIE5PVCBjYWxsZWQgZm9yIERPTSBleHRyYWN0aW9uXG5cdFx0YXNzZXJ0Lm9rKCF3aW5kb3cud2ViQ29udGVudHMuZXhlY3V0ZUphdmFTY3JpcHQuY2FsbGVkKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3JldHVybnMgZXJyb3Igd2hlbiBib3RoIGFjY2Vzc2liaWxpdHkgdHJlZSBhbmQgRE9NIGV4dHJhY3Rpb24geWllbGQgbm8gY29udGVudCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9lbXB0eS1wYWdlJyk7XG5cblx0XHRjb25zdCBsb2FkZXIgPSBjcmVhdGVXZWJQYWdlTG9hZGVyKHVyaSk7XG5cdFx0c2V0dXBEZWJ1Z2dlck1vY2soeyBheE5vZGVzOiBbXSB9KTtcblxuXHRcdC8vIE1vY2sgRE9NIGV4dHJhY3Rpb24gcmV0dXJuaW5nIHVuZGVmaW5lZCAobm8gY29udGVudClcblx0XHR3aW5kb3cud2ViQ29udGVudHMuZXhlY3V0ZUphdmFTY3JpcHQucmVzb2x2ZXModW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IGxvYWRQcm9taXNlID0gbG9hZGVyLmxvYWQoKTtcblxuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtc3RhcnQtbG9hZGluZycpO1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtZmluaXNoLWxvYWQnKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGxvYWRQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdGF0dXMsICdlcnJvcicpO1xuXHRcdGlmIChyZXN1bHQuc3RhdHVzID09PSAnZXJyb3InKSB7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmVycm9yLmluY2x1ZGVzKCdGYWlsZWQgdG8gZXh0cmFjdCBtZWFuaW5nZnVsIGNvbnRlbnQnKSk7XG5cdFx0fVxuXHRcdC8vIFZlcmlmeSBib3RoIGV4dHJhY3Rpb24gbWV0aG9kcyB3ZXJlIGF0dGVtcHRlZFxuXHRcdGFzc2VydC5vayh3aW5kb3cud2ViQ29udGVudHMuZXhlY3V0ZUphdmFTY3JpcHQuY2FsbGVkKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2V4dHJhY3RzIGNvbnRlbnQgZnJvbSBtdWx0aXBsZSBmcmFtZXMgaW5jbHVkaW5nIGlmcmFtZXMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGFnZS13aXRoLWlmcmFtZXMnKTtcblxuXHRcdC8vIEFjY2Vzc2liaWxpdHkgbm9kZXMgZm9yIHRoZSBtYWluIGZyYW1lXG5cdFx0Y29uc3QgbWFpbkZyYW1lTm9kZXM6IEFYTm9kZVtdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdtYWluLXJvb3QnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogeyB0eXBlOiAncm9sZScsIHZhbHVlOiAnUm9vdFdlYkFyZWEnIH0sXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ21haW4taGVhZGluZyddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdtYWluLWhlYWRpbmcnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogeyB0eXBlOiAncm9sZScsIHZhbHVlOiAnaGVhZGluZycgfSxcblx0XHRcdFx0bmFtZTogeyB0eXBlOiAnc3RyaW5nJywgdmFsdWU6ICdNYWluIFBhZ2UgQ29udGVudCcgfSxcblx0XHRcdFx0cHJvcGVydGllczogW3sgbmFtZTogJ2xldmVsJywgdmFsdWU6IHsgdHlwZTogJ2ludGVnZXInLCB2YWx1ZTogMSB9IH1dLFxuXHRcdFx0XHRjaGlsZElkczogWydtYWluLXRleHQnXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnbWFpbi10ZXh0Jyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IHsgdHlwZTogJ3JvbGUnLCB2YWx1ZTogJ1N0YXRpY1RleHQnIH0sXG5cdFx0XHRcdG5hbWU6IHsgdHlwZTogJ3N0cmluZycsIHZhbHVlOiAnTWFpbiBQYWdlIENvbnRlbnQnIH1cblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Ly8gQWNjZXNzaWJpbGl0eSBub2RlcyBmb3IgYW4gaWZyYW1lIChzaW11bGF0aW5nIG5lc3RlZCBkb2N1bWVudGF0aW9uIGNvbnRlbnQpXG5cdFx0Y29uc3QgaWZyYW1lTm9kZXM6IEFYTm9kZVtdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdpZnJhbWUtcm9vdCcsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiB7IHR5cGU6ICdyb2xlJywgdmFsdWU6ICdSb290V2ViQXJlYScgfSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsnaWZyYW1lLWhlYWRpbmcnXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnaWZyYW1lLWhlYWRpbmcnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogeyB0eXBlOiAncm9sZScsIHZhbHVlOiAnaGVhZGluZycgfSxcblx0XHRcdFx0bmFtZTogeyB0eXBlOiAnc3RyaW5nJywgdmFsdWU6ICdJZnJhbWUgRG9jdW1lbnRhdGlvbiBDb250ZW50JyB9LFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiBbeyBuYW1lOiAnbGV2ZWwnLCB2YWx1ZTogeyB0eXBlOiAnaW50ZWdlcicsIHZhbHVlOiAyIH0gfV0sXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ2lmcmFtZS10ZXh0J11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ2lmcmFtZS10ZXh0Jyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IHsgdHlwZTogJ3JvbGUnLCB2YWx1ZTogJ1N0YXRpY1RleHQnIH0sXG5cdFx0XHRcdG5hbWU6IHsgdHlwZTogJ3N0cmluZycsIHZhbHVlOiAnSWZyYW1lIERvY3VtZW50YXRpb24gQ29udGVudCcgfVxuXHRcdFx0fVxuXHRcdF07XG5cblx0XHQvLyBBY2Nlc3NpYmlsaXR5IG5vZGVzIGZvciBhIG5lc3RlZCBpZnJhbWVcblx0XHRjb25zdCBuZXN0ZWRJZnJhbWVOb2RlczogQVhOb2RlW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ25lc3RlZC1yb290Jyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IHsgdHlwZTogJ3JvbGUnLCB2YWx1ZTogJ1Jvb3RXZWJBcmVhJyB9LFxuXHRcdFx0XHRjaGlsZElkczogWyduZXN0ZWQtcGFyYWdyYXBoJ11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ25lc3RlZC1wYXJhZ3JhcGgnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogeyB0eXBlOiAncm9sZScsIHZhbHVlOiAncGFyYWdyYXBoJyB9LFxuXHRcdFx0XHRjaGlsZElkczogWyduZXN0ZWQtdGV4dCddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICduZXN0ZWQtdGV4dCcsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiB7IHR5cGU6ICdyb2xlJywgdmFsdWU6ICdTdGF0aWNUZXh0JyB9LFxuXHRcdFx0XHRuYW1lOiB7IHR5cGU6ICdzdHJpbmcnLCB2YWx1ZTogJ0RlZXBseSBuZXN0ZWQgaWZyYW1lIGNvbnRlbnQgdGhhdCBzaG91bGQgYWxzbyBiZSBleHRyYWN0ZWQnIH1cblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgbG9hZGVyID0gY3JlYXRlV2ViUGFnZUxvYWRlcih1cmkpO1xuXG5cdFx0Y29uc3QgZnJhbWVUcmVlID0ge1xuXHRcdFx0ZnJhbWU6IHsgaWQ6ICdtYWluLWZyYW1lJywgdXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlLXdpdGgtaWZyYW1lcycgfSxcblx0XHRcdGNoaWxkRnJhbWVzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRmcmFtZTogeyBpZDogJ2lmcmFtZS0xJywgdXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9pZnJhbWUtY29udGVudCcgfSxcblx0XHRcdFx0XHRjaGlsZEZyYW1lczogW1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRmcmFtZTogeyBpZDogJ25lc3RlZC1pZnJhbWUnLCB1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL25lc3RlZC1jb250ZW50JyB9LFxuXHRcdFx0XHRcdFx0XHRjaGlsZEZyYW1lczogW11cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9O1xuXG5cdFx0c2V0dXBEZWJ1Z2dlck1vY2soe1xuXHRcdFx0ZnJhbWVUcmVlLFxuXHRcdFx0YXhOb2RlczogKGZyYW1lSWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRzd2l0Y2ggKGZyYW1lSWQpIHtcblx0XHRcdFx0XHRjYXNlICdtYWluLWZyYW1lJzpcblx0XHRcdFx0XHRcdHJldHVybiBtYWluRnJhbWVOb2Rlcztcblx0XHRcdFx0XHRjYXNlICdpZnJhbWUtMSc6XG5cdFx0XHRcdFx0XHRyZXR1cm4gaWZyYW1lTm9kZXM7XG5cdFx0XHRcdFx0Y2FzZSAnbmVzdGVkLWlmcmFtZSc6XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmVzdGVkSWZyYW1lTm9kZXM7XG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbG9hZFByb21pc2UgPSBsb2FkZXIubG9hZCgpO1xuXG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1zdGFydC1sb2FkaW5nJyk7XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1maW5pc2gtbG9hZCcpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbG9hZFByb21pc2U7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXR1cywgJ29rJyk7XG5cdFx0aWYgKHJlc3VsdC5zdGF0dXMgPT09ICdvaycpIHtcblx0XHRcdC8vIFZlcmlmeSBjb250ZW50IGZyb20gbWFpbiBmcmFtZSBpcyBpbmNsdWRlZFxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5yZXN1bHQuaW5jbHVkZXMoJ01haW4gUGFnZSBDb250ZW50JyksICdTaG91bGQgaW5jbHVkZSBtYWluIGZyYW1lIGNvbnRlbnQnKTtcblx0XHRcdC8vIFZlcmlmeSBjb250ZW50IGZyb20gaWZyYW1lIGlzIGluY2x1ZGVkXG5cdFx0XHRhc3NlcnQub2socmVzdWx0LnJlc3VsdC5pbmNsdWRlcygnSWZyYW1lIERvY3VtZW50YXRpb24gQ29udGVudCcpLCAnU2hvdWxkIGluY2x1ZGUgaWZyYW1lIGNvbnRlbnQnKTtcblx0XHRcdC8vIFZlcmlmeSBjb250ZW50IGZyb20gbmVzdGVkIGlmcmFtZSBpcyBpbmNsdWRlZFxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5yZXN1bHQuaW5jbHVkZXMoJ0RlZXBseSBuZXN0ZWQgaWZyYW1lIGNvbnRlbnQnKSwgJ1Nob3VsZCBpbmNsdWRlIG5lc3RlZCBpZnJhbWUgY29udGVudCcpO1xuXHRcdH1cblxuXHRcdC8vIFZlcmlmeSBBY2Nlc3NpYmlsaXR5LmdldEZ1bGxBWFRyZWUgd2FzIGNhbGxlZCBmb3IgZWFjaCBmcmFtZVxuXHRcdGNvbnN0IGdldEZ1bGxBWFRyZWVDYWxscyA9IHdpbmRvdy53ZWJDb250ZW50cy5kZWJ1Z2dlci5zZW5kQ29tbWFuZC5nZXRDYWxscygpXG5cdFx0XHQuZmlsdGVyKGNhbGwgPT4gY2FsbC5hcmdzWzBdID09PSAnQWNjZXNzaWJpbGl0eS5nZXRGdWxsQVhUcmVlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEZ1bGxBWFRyZWVDYWxscy5sZW5ndGgsIDMsICdTaG91bGQgY2FsbCBnZXRGdWxsQVhUcmVlIGZvciBhbGwgMyBmcmFtZXMnKTtcblx0fSkpO1xuXG5cdHRlc3QoJ25ldHdvcmsgcG9saWN5IHNraXBzIGRlbmllZCBmcmFtZXMgYW5kIHRoZWlyIGRlc2NlbmRhbnRzIGR1cmluZyBleHRyYWN0aW9uJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdodHRwczovL2FsbG93ZWQuZXhhbXBsZS9wYWdlLXdpdGgtaWZyYW1lcycpO1xuXHRcdGNvbnN0IGZyYW1lVHJlZSA9IHtcblx0XHRcdGZyYW1lOiB7IGlkOiAnbWFpbi1mcmFtZScsIHVybDogdXJpLnRvU3RyaW5nKCkgfSxcblx0XHRcdGNoaWxkRnJhbWVzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRmcmFtZTogeyBpZDogJ2FsbG93ZWQtZnJhbWUnLCB1cmw6ICdodHRwczovL2FsbG93ZWQuZXhhbXBsZS9mcmFtZScgfSxcblx0XHRcdFx0XHRjaGlsZEZyYW1lczogW11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGZyYW1lOiB7IGlkOiAnZGVuaWVkLWZyYW1lJywgdXJsOiAnaHR0cHM6Ly9kZW5pZWQuZXhhbXBsZS9wcml2YXRlJyB9LFxuXHRcdFx0XHRcdGNoaWxkRnJhbWVzOiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGZyYW1lOiB7IGlkOiAnZGVuaWVkLWRlc2NlbmRhbnQnLCB1cmw6ICdodHRwczovL2FsbG93ZWQuZXhhbXBsZS9uZXN0ZWQnIH0sXG5cdFx0XHRcdFx0XHRcdGNoaWxkRnJhbWVzOiBbXVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH07XG5cdFx0Y29uc3QgY29udGVudEJ5RnJhbWUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPihbXG5cdFx0XHRbJ21haW4tZnJhbWUnLCAnQWxsb3dlZCBtYWluIGZyYW1lIGNvbnRlbnQnXSxcblx0XHRcdFsnYWxsb3dlZC1mcmFtZScsICdBbGxvd2VkIGNoaWxkIGZyYW1lIGNvbnRlbnQnXSxcblx0XHRcdFsnZGVuaWVkLWZyYW1lJywgJ0RFTklFRF9GUkFNRV9TRUNSRVRfTUFSS0VSJ10sXG5cdFx0XHRbJ2RlbmllZC1kZXNjZW5kYW50JywgJ0RFTklFRF9ERVNDRU5EQU5UX1NFQ1JFVF9NQVJLRVInXSxcblx0XHRdKTtcblx0XHRjb25zdCBsb2FkZXIgPSBjcmVhdGVXZWJQYWdlTG9hZGVyKFxuXHRcdFx0dXJpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0ZnJhbWVVcmkgPT4gZnJhbWVVcmkuYXV0aG9yaXR5ID09PSAnYWxsb3dlZC5leGFtcGxlJ1xuXHRcdCk7XG5cdFx0c2V0dXBEZWJ1Z2dlck1vY2soe1xuXHRcdFx0ZnJhbWVUcmVlLFxuXHRcdFx0YXhOb2RlczogZnJhbWVJZCA9PiBbe1xuXHRcdFx0XHRub2RlSWQ6IGAke2ZyYW1lSWR9LXRleHRgLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogeyB0eXBlOiAncm9sZScsIHZhbHVlOiAnU3RhdGljVGV4dCcgfSxcblx0XHRcdFx0bmFtZTogeyB0eXBlOiAnc3RyaW5nJywgdmFsdWU6IGNvbnRlbnRCeUZyYW1lLmdldChmcmFtZUlkKSA/PyAnJyB9XG5cdFx0XHR9XVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbG9hZFByb21pc2UgPSBsb2FkZXIubG9hZCgpO1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtc3RhcnQtbG9hZGluZycpO1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtZmluaXNoLWxvYWQnKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBsb2FkUHJvbWlzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RhdHVzLCAnb2snKTtcblx0XHRjb25zdCBleHRyYWN0ZWRGcmFtZUlkcyA9IHdpbmRvdy53ZWJDb250ZW50cy5kZWJ1Z2dlci5zZW5kQ29tbWFuZC5nZXRDYWxscygpXG5cdFx0XHQuZmlsdGVyKGNhbGwgPT4gY2FsbC5hcmdzWzBdID09PSAnQWNjZXNzaWJpbGl0eS5nZXRGdWxsQVhUcmVlJylcblx0XHRcdC5tYXAoY2FsbCA9PiBjYWxsLmFyZ3NbMV0/LmZyYW1lSWQpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSByZXN1bHQuc3RhdHVzID09PSAnb2snID8gcmVzdWx0LnJlc3VsdCA6ICcnO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZXh0cmFjdGVkRnJhbWVJZHMsXG5cdFx0XHRpbmNsdWRlc01haW5Db250ZW50OiBjb250ZW50LmluY2x1ZGVzKCdBbGxvd2VkIG1haW4gZnJhbWUgY29udGVudCcpLFxuXHRcdFx0aW5jbHVkZXNBbGxvd2VkRnJhbWVDb250ZW50OiBjb250ZW50LmluY2x1ZGVzKCdBbGxvd2VkIGNoaWxkIGZyYW1lIGNvbnRlbnQnKSxcblx0XHRcdGluY2x1ZGVzRGVuaWVkRnJhbWVDb250ZW50OiBjb250ZW50LmluY2x1ZGVzKCdERU5JRURfRlJBTUVfU0VDUkVUX01BUktFUicpLFxuXHRcdFx0aW5jbHVkZXNEZW5pZWREZXNjZW5kYW50Q29udGVudDogY29udGVudC5pbmNsdWRlcygnREVOSUVEX0RFU0NFTkRBTlRfU0VDUkVUX01BUktFUicpLFxuXHRcdH0sIHtcblx0XHRcdGV4dHJhY3RlZEZyYW1lSWRzOiBbJ21haW4tZnJhbWUnLCAnYWxsb3dlZC1mcmFtZSddLFxuXHRcdFx0aW5jbHVkZXNNYWluQ29udGVudDogdHJ1ZSxcblx0XHRcdGluY2x1ZGVzQWxsb3dlZEZyYW1lQ29udGVudDogdHJ1ZSxcblx0XHRcdGluY2x1ZGVzRGVuaWVkRnJhbWVDb250ZW50OiBmYWxzZSxcblx0XHRcdGluY2x1ZGVzRGVuaWVkRGVzY2VuZGFudENvbnRlbnQ6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEhlYWRlciBNb2RpZmljYXRpb24gVGVzdHNcblxuXHR0ZXN0KCdvbkJlZm9yZVNlbmRIZWFkZXJzIGFkZHMgcHJpdmFjeSBoZWFkZXJzIGZvciBhbGwgcmVxdWVzdHMnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlV2ViUGFnZUxvYWRlcihVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGFnZScpKTtcblxuXHRcdC8vIEdldCB0aGUgY2FsbGJhY2sgcGFzc2VkIHRvIG9uQmVmb3JlU2VuZEhlYWRlcnNcblx0XHRhc3NlcnQub2sod2luZG93LndlYkNvbnRlbnRzLnNlc3Npb24ud2ViUmVxdWVzdC5vbkJlZm9yZVNlbmRIZWFkZXJzLmNhbGxlZCk7XG5cdFx0Y29uc3QgY2FsbGJhY2sgPSB3aW5kb3cud2ViQ29udGVudHMuc2Vzc2lvbi53ZWJSZXF1ZXN0Lm9uQmVmb3JlU2VuZEhlYWRlcnMuZ2V0Q2FsbCgwKS5hcmdzWzBdO1xuXG5cdFx0Ly8gTW9jayBjYWxsYmFjayBmdW5jdGlvblxuXHRcdGxldCBtb2RpZmllZEhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbW9ja0NhbGxiYWNrID0gKGRldGFpbHM6IHsgcmVxdWVzdEhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfSkgPT4ge1xuXHRcdFx0bW9kaWZpZWRIZWFkZXJzID0gZGV0YWlscy5yZXF1ZXN0SGVhZGVycztcblx0XHR9O1xuXG5cdFx0Ly8gU2ltdWxhdGUgYSBzdWItcmVzb3VyY2UgcmVxdWVzdCAobm8gcmVzb3VyY2VUeXBlKVxuXHRcdGNhbGxiYWNrKFxuXHRcdFx0e1xuXHRcdFx0XHR1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N0eWxlLmNzcycsXG5cdFx0XHRcdHJlcXVlc3RIZWFkZXJzOiB7XG5cdFx0XHRcdFx0J1Rlc3RIZWFkZXInOiAnVGVzdFZhbHVlJ1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0bW9ja0NhbGxiYWNrXG5cdFx0KTtcblxuXHRcdC8vIFZlcmlmeSBwcml2YWN5IGhlYWRlcnMgd2VyZSBhZGRlZFxuXHRcdGFzc2VydC5vayhtb2RpZmllZEhlYWRlcnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RpZmllZEhlYWRlcnNbJ0ROVCddLCAnMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RpZmllZEhlYWRlcnNbJ1NlYy1HUEMnXSwgJzEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kaWZpZWRIZWFkZXJzWydUZXN0SGVhZGVyJ10sICdUZXN0VmFsdWUnKTtcblx0XHQvLyBBY2NlcHQgaGVhZGVyIHNob3VsZCBOT1QgYmUgc2V0IGZvciBub24tbWFpbkZyYW1lIHJlcXVlc3RzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGlmaWVkSGVhZGVyc1snQWNjZXB0J10sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uQmVmb3JlU2VuZEhlYWRlcnMgYWRkcyBBY2NlcHQgaGVhZGVyIHByZWZlcnJpbmcgbWFya2Rvd24gZm9yIG1haW5GcmFtZSByZXF1ZXN0cycsICgpID0+IHtcblx0XHRjcmVhdGVXZWJQYWdlTG9hZGVyKFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlJykpO1xuXG5cdFx0YXNzZXJ0Lm9rKHdpbmRvdy53ZWJDb250ZW50cy5zZXNzaW9uLndlYlJlcXVlc3Qub25CZWZvcmVTZW5kSGVhZGVycy5jYWxsZWQpO1xuXHRcdGNvbnN0IGNhbGxiYWNrID0gd2luZG93LndlYkNvbnRlbnRzLnNlc3Npb24ud2ViUmVxdWVzdC5vbkJlZm9yZVNlbmRIZWFkZXJzLmdldENhbGwoMCkuYXJnc1swXTtcblxuXHRcdGxldCBtb2RpZmllZEhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbW9ja0NhbGxiYWNrID0gKGRldGFpbHM6IHsgcmVxdWVzdEhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfSkgPT4ge1xuXHRcdFx0bW9kaWZpZWRIZWFkZXJzID0gZGV0YWlscy5yZXF1ZXN0SGVhZGVycztcblx0XHR9O1xuXG5cdFx0Ly8gU2ltdWxhdGUgYSBtYWluRnJhbWUgbmF2aWdhdGlvbiByZXF1ZXN0XG5cdFx0Y2FsbGJhY2soXG5cdFx0XHR7XG5cdFx0XHRcdHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGFnZScsXG5cdFx0XHRcdHJlc291cmNlVHlwZTogJ21haW5GcmFtZScsXG5cdFx0XHRcdHJlcXVlc3RIZWFkZXJzOiB7fVxuXHRcdFx0fSxcblx0XHRcdG1vY2tDYWxsYmFja1xuXHRcdCk7XG5cblx0XHRhc3NlcnQub2sobW9kaWZpZWRIZWFkZXJzKTtcblx0XHRhc3NlcnQub2sobW9kaWZpZWRIZWFkZXJzWydBY2NlcHQnXT8uaW5jbHVkZXMoJ3RleHQvbWFya2Rvd24nKSk7XG5cdFx0YXNzZXJ0Lm9rKG1vZGlmaWVkSGVhZGVyc1snQWNjZXB0J10/LmluY2x1ZGVzKCd0ZXh0L2h0bWwnKSk7XG5cdH0pO1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBEb3dubG9hZCBQcmV2ZW50aW9uIFRlc3RzXG5cblx0dGVzdCgnb25IZWFkZXJzUmVjZWl2ZWQgcmVwbGFjZXMgQ29udGVudC1EaXNwb3NpdGlvbiBhdHRhY2htZW50IHdpdGggaW5saW5lIGZvciB0ZXh0IGNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlV2ViUGFnZUxvYWRlcihVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGFnZScpKTtcblxuXHRcdC8vIEdldCB0aGUgY2FsbGJhY2sgcGFzc2VkIHRvIG9uSGVhZGVyc1JlY2VpdmVkXG5cdFx0YXNzZXJ0Lm9rKHdpbmRvdy53ZWJDb250ZW50cy5zZXNzaW9uLndlYlJlcXVlc3Qub25IZWFkZXJzUmVjZWl2ZWQuY2FsbGVkKTtcblx0XHRjb25zdCBsaXN0ZW5lciA9IHdpbmRvdy53ZWJDb250ZW50cy5zZXNzaW9uLndlYlJlcXVlc3Qub25IZWFkZXJzUmVjZWl2ZWQuZ2V0Q2FsbCgwKS5hcmdzWzBdO1xuXG5cdFx0Zm9yIChjb25zdCBjb250ZW50VHlwZSBvZiBbJ2FwcGxpY2F0aW9uL3htbCcsICd0ZXh0L2h0bWwnLCAndGV4dC9wbGFpbicsICdhcHBsaWNhdGlvbi9qc29uJywgJ2FwcGxpY2F0aW9uL3hodG1sK3htbCcsICdhcHBsaWNhdGlvbi9yc3MreG1sJywgJ2FwcGxpY2F0aW9uL3ZuZC5jdXN0b20ranNvbiddKSB7XG5cdFx0XHRsZXQgcmVzcG9uc2U6IHsgcmVzcG9uc2VIZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nW10+OyBjYW5jZWw/OiBib29sZWFuIH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBtb2NrQ2FsbGJhY2sgPSAocmVzdWx0OiB7IHJlc3BvbnNlSGVhZGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZ1tdPjsgY2FuY2VsPzogYm9vbGVhbiB9KSA9PiB7XG5cdFx0XHRcdHJlc3BvbnNlID0gcmVzdWx0O1xuXHRcdFx0fTtcblxuXHRcdFx0bGlzdGVuZXIoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL2ZpbGUnLFxuXHRcdFx0XHRcdHJlc3BvbnNlSGVhZGVyczoge1xuXHRcdFx0XHRcdFx0J0NvbnRlbnQtRGlzcG9zaXRpb24nOiBbJ2F0dGFjaG1lbnQ7IGZpbGVuYW1lPVwiZmlsZS54bWxcIiddLFxuXHRcdFx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6IFtjb250ZW50VHlwZV1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1vY2tDYWxsYmFja1xuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3BvbnNlLCBgRXhwZWN0ZWQgcmVzcG9uc2UgZm9yICR7Y29udGVudFR5cGV9YCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3BvbnNlIS5yZXNwb25zZUhlYWRlcnMhWydDb250ZW50LURpc3Bvc2l0aW9uJ10sIFsnaW5saW5lJ10sIGBFeHBlY3RlZCBpbmxpbmUgZm9yICR7Y29udGVudFR5cGV9YCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UhLmNhbmNlbCwgZmFsc2UsIGBTaG91bGQgbm90IGNhbmNlbCBmb3IgJHtjb250ZW50VHlwZX1gKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ29uSGVhZGVyc1JlY2VpdmVkIGNhbmNlbHMgQ29udGVudC1EaXNwb3NpdGlvbiBhdHRhY2htZW50IGZvciBiaW5hcnkgY29udGVudCcsICgpID0+IHtcblx0XHRjcmVhdGVXZWJQYWdlTG9hZGVyKFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlJykpO1xuXG5cdFx0Y29uc3QgbGlzdGVuZXIgPSB3aW5kb3cud2ViQ29udGVudHMuc2Vzc2lvbi53ZWJSZXF1ZXN0Lm9uSGVhZGVyc1JlY2VpdmVkLmdldENhbGwoMCkuYXJnc1swXTtcblxuXHRcdGZvciAoY29uc3QgY29udGVudFR5cGUgb2YgWydhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW0nLCAnYXBwbGljYXRpb24vemlwJywgJ2FwcGxpY2F0aW9uL3BkZicsICdpbWFnZS9wbmcnLCAndmlkZW8vbXA0J10pIHtcblx0XHRcdGxldCByZXNwb25zZTogeyBjYW5jZWw/OiBib29sZWFuIH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBtb2NrQ2FsbGJhY2sgPSAocmVzdWx0OiB7IGNhbmNlbD86IGJvb2xlYW4gfSkgPT4ge1xuXHRcdFx0XHRyZXNwb25zZSA9IHJlc3VsdDtcblx0XHRcdH07XG5cblx0XHRcdGxpc3RlbmVyKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9maWxlLmJpbicsXG5cdFx0XHRcdFx0cmVzcG9uc2VIZWFkZXJzOiB7XG5cdFx0XHRcdFx0XHQnQ29udGVudC1EaXNwb3NpdGlvbic6IFsnYXR0YWNobWVudDsgZmlsZW5hbWU9XCJmaWxlLmJpblwiJ10sXG5cdFx0XHRcdFx0XHQnQ29udGVudC1UeXBlJzogW2NvbnRlbnRUeXBlXVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0bW9ja0NhbGxiYWNrXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzcG9uc2UsIGBFeHBlY3RlZCByZXNwb25zZSBmb3IgJHtjb250ZW50VHlwZX1gKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZSEuY2FuY2VsLCB0cnVlLCBgRXhwZWN0ZWQgY2FuY2VsIGZvciAke2NvbnRlbnRUeXBlfWApO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnb25IZWFkZXJzUmVjZWl2ZWQgY2FuY2VscyBDb250ZW50LURpc3Bvc2l0aW9uIGF0dGFjaG1lbnQgd2hlbiBjb250ZW50IHR5cGUgaXMgbWlzc2luZycsICgpID0+IHtcblx0XHRjcmVhdGVXZWJQYWdlTG9hZGVyKFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlJykpO1xuXG5cdFx0Y29uc3QgbGlzdGVuZXIgPSB3aW5kb3cud2ViQ29udGVudHMuc2Vzc2lvbi53ZWJSZXF1ZXN0Lm9uSGVhZGVyc1JlY2VpdmVkLmdldENhbGwoMCkuYXJnc1swXTtcblxuXHRcdGxldCByZXNwb25zZTogeyBjYW5jZWw/OiBib29sZWFuIH0gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbW9ja0NhbGxiYWNrID0gKHJlc3VsdDogeyBjYW5jZWw/OiBib29sZWFuIH0pID0+IHtcblx0XHRcdHJlc3BvbnNlID0gcmVzdWx0O1xuXHRcdH07XG5cblx0XHRsaXN0ZW5lcihcblx0XHRcdHtcblx0XHRcdFx0dXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9maWxlJyxcblx0XHRcdFx0cmVzcG9uc2VIZWFkZXJzOiB7XG5cdFx0XHRcdFx0J0NvbnRlbnQtRGlzcG9zaXRpb24nOiBbJ2F0dGFjaG1lbnQ7IGZpbGVuYW1lPVwiZmlsZVwiJ11cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdG1vY2tDYWxsYmFja1xuXHRcdCk7XG5cblx0XHRhc3NlcnQub2socmVzcG9uc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZSEuY2FuY2VsLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnb25IZWFkZXJzUmVjZWl2ZWQgYWxsb3dzIG5vcm1hbCByZXNwb25zZXMgd2l0aG91dCBDb250ZW50LURpc3Bvc2l0aW9uIGF0dGFjaG1lbnQnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlV2ViUGFnZUxvYWRlcihVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGFnZScpKTtcblxuXHRcdGNvbnN0IGxpc3RlbmVyID0gd2luZG93LndlYkNvbnRlbnRzLnNlc3Npb24ud2ViUmVxdWVzdC5vbkhlYWRlcnNSZWNlaXZlZC5nZXRDYWxsKDApLmFyZ3NbMF07XG5cblx0XHRsZXQgcmVzcG9uc2U6IHsgcmVzcG9uc2VIZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nW10+IH0gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbW9ja0NhbGxiYWNrID0gKHJlc3VsdDogeyByZXNwb25zZUhlYWRlcnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmdbXT4gfSkgPT4ge1xuXHRcdFx0cmVzcG9uc2UgPSByZXN1bHQ7XG5cdFx0fTtcblxuXHRcdC8vIFNpbXVsYXRlIGEgbm9ybWFsIEhUTUwgcmVzcG9uc2Vcblx0XHRsaXN0ZW5lcihcblx0XHRcdHtcblx0XHRcdFx0dXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlJyxcblx0XHRcdFx0cmVzcG9uc2VIZWFkZXJzOiB7XG5cdFx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6IFsndGV4dC9odG1sJ10sXG5cdFx0XHRcdFx0J0NvbnRlbnQtRGlzcG9zaXRpb24nOiBbJ2lubGluZSddXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRtb2NrQ2FsbGJhY2tcblx0XHQpO1xuXG5cdFx0YXNzZXJ0Lm9rKHJlc3BvbnNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UhLnJlc3BvbnNlSGVhZGVycywgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnd2lsbC1kb3dubG9hZCBoYW5kbGVyIGNhbmNlbHMgZG93bmxvYWQgYW5kIHJldHVybnMgZXJyb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdodHRwczovL2RsLmdvb2dsZS5jb20vbGludXgvY2hyb21lL3JwbS9zdGFibGUveDg2XzY0L3JlcG9kYXRhL3JlcG9tZC54bWwnKTtcblxuXHRcdGNvbnN0IGxvYWRlciA9IGNyZWF0ZVdlYlBhZ2VMb2FkZXIodXJpKTtcblx0XHRzZXR1cERlYnVnZ2VyTW9jaygpO1xuXG5cdFx0Ly8gR2V0IHRoZSB3aWxsLWRvd25sb2FkIGhhbmRsZXJcblx0XHRhc3NlcnQub2sod2luZG93LndlYkNvbnRlbnRzLnNlc3Npb24ub24uY2FsbGVkKTtcblx0XHRjb25zdCB3aWxsRG93bmxvYWRDYWxsID0gd2luZG93LndlYkNvbnRlbnRzLnNlc3Npb24ub24uZ2V0Q2FsbHMoKVxuXHRcdFx0LmZpbmQoY2FsbCA9PiBjYWxsLmFyZ3NbMF0gPT09ICd3aWxsLWRvd25sb2FkJyk7XG5cdFx0YXNzZXJ0Lm9rKHdpbGxEb3dubG9hZENhbGwpO1xuXHRcdGNvbnN0IHdpbGxEb3dubG9hZEhhbmRsZXIgPSB3aWxsRG93bmxvYWRDYWxsIS5hcmdzWzFdO1xuXG5cdFx0Y29uc3QgbG9hZFByb21pc2UgPSBsb2FkZXIubG9hZCgpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgYSBkb3dubG9hZCBiZWluZyB0cmlnZ2VyZWRcblx0XHRjb25zdCBtb2NrSXRlbSA9IHtcblx0XHRcdGNhbmNlbDogc2lub24uc3R1YigpLFxuXHRcdFx0Z2V0RmlsZW5hbWU6IHNpbm9uLnN0dWIoKS5yZXR1cm5zKCdyZXBvbWQueG1sJylcblx0XHR9O1xuXHRcdHdpbGxEb3dubG9hZEhhbmRsZXIoe30sIG1vY2tJdGVtKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGxvYWRQcm9taXNlO1xuXG5cdFx0Ly8gVmVyaWZ5IGRvd25sb2FkIHdhcyBjYW5jZWxsZWRcblx0XHRhc3NlcnQub2sobW9ja0l0ZW0uY2FuY2VsLmNhbGxlZCk7XG5cblx0XHQvLyBWZXJpZnkgZXJyb3IgcmVzdWx0XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdGF0dXMsICdlcnJvcicpO1xuXHRcdGlmIChyZXN1bHQuc3RhdHVzID09PSAnZXJyb3InKSB7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmVycm9yLmluY2x1ZGVzKCdEb3dubG9hZCBub3QgYWxsb3dlZCcpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuZXJyb3IuaW5jbHVkZXMoJ3JlcG9tZC54bWwnKSk7XG5cdFx0fVxuXHR9KTtcblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gTWFya2Rvd24gQ29udGVudCBOZWdvdGlhdGlvbiBUZXN0c1xuXG5cdHRlc3QoJ29uSGVhZGVyc1JlY2VpdmVkIGRldGVjdHMgbWFya2Rvd24gY29udGVudC10eXBlIGZvciBtYWluRnJhbWUgcmVzcG9uc2VzJywgKCkgPT4ge1xuXHRcdGNyZWF0ZVdlYlBhZ2VMb2FkZXIoVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL3BhZ2UnKSk7XG5cblx0XHRjb25zdCBsaXN0ZW5lciA9IHdpbmRvdy53ZWJDb250ZW50cy5zZXNzaW9uLndlYlJlcXVlc3Qub25IZWFkZXJzUmVjZWl2ZWQuZ2V0Q2FsbCgwKS5hcmdzWzBdO1xuXG5cdFx0bGV0IHJlc3BvbnNlOiB7IGNhbmNlbD86IGJvb2xlYW4gfSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBtb2NrQ2FsbGJhY2sgPSAocmVzdWx0OiB7IGNhbmNlbD86IGJvb2xlYW4gfSkgPT4ge1xuXHRcdFx0cmVzcG9uc2UgPSByZXN1bHQ7XG5cdFx0fTtcblxuXHRcdC8vIFNpbXVsYXRlIGEgbWFya2Rvd24gcmVzcG9uc2UgZm9yIG1haW5GcmFtZVxuXHRcdGxpc3RlbmVyKFxuXHRcdFx0e1xuXHRcdFx0XHR1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL3BhZ2UnLFxuXHRcdFx0XHRyZXNvdXJjZVR5cGU6ICdtYWluRnJhbWUnLFxuXHRcdFx0XHRyZXNwb25zZUhlYWRlcnM6IHtcblx0XHRcdFx0XHQnQ29udGVudC1UeXBlJzogWyd0ZXh0L21hcmtkb3duOyBjaGFyc2V0PXV0Zi04J11cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdG1vY2tDYWxsYmFja1xuXHRcdCk7XG5cblx0XHRhc3NlcnQub2socmVzcG9uc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZSEuY2FuY2VsLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcmtkb3duIGNvbnRlbnQtdHlwZSBleHRyYWN0aW9uIHVzZXMgcmF3IGJvZHknLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vbGVhcm4ubWljcm9zb2Z0LmNvbS9lbi11cy9kb2NzJyk7XG5cblx0XHRjb25zdCBsb2FkZXIgPSBjcmVhdGVXZWJQYWdlTG9hZGVyKHVyaSk7XG5cdFx0Ly8gVXNlIEFYIG5vZGVzIHRoYXQgZXhjZWVkIE1JTl9DT05URU5UX0xFTkdUSCBzbyB0aGUgdGVzdCBvbmx5IHBhc3Nlc1xuXHRcdC8vIGlmIHRoZSBtYXJrZG93biBicmFuY2ggc2hvcnQtY2lyY3VpdHMgYmVmb3JlIGFjY2Vzc2liaWxpdHkgZXh0cmFjdGlvbi5cblx0XHRjb25zdCBsb25nQVhOb2RlczogQVhOb2RlW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ25vZGUxJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IHsgdHlwZTogJ3JvbGUnLCB2YWx1ZTogJ1N0YXRpY1RleHQnIH0sXG5cdFx0XHRcdG5hbWU6IHsgdHlwZTogJ3N0cmluZycsIHZhbHVlOiAnVGhpcyBpcyBhIGxvbmcgYWNjZXNzaWJpbGl0eSB0cmVlIGNvbnRlbnQgdGhhdCBleGNlZWRzIHRoZSBtaW5pbXVtIGNvbnRlbnQgbGVuZ3RoIHJlcXVpcmVtZW50IG9mIG9uZSBodW5kcmVkIGNoYXJhY3RlcnMgZWFzaWx5LicgfVxuXHRcdFx0fVxuXHRcdF07XG5cdFx0c2V0dXBEZWJ1Z2dlck1vY2soeyBheE5vZGVzOiBsb25nQVhOb2RlcyB9KTtcblxuXHRcdC8vIEdldCB0aGUgb25IZWFkZXJzUmVjZWl2ZWQgbGlzdGVuZXIgdG8gc2ltdWxhdGUgbWFya2Rvd24gcmVzcG9uc2Vcblx0XHRjb25zdCBoZWFkZXJzTGlzdGVuZXIgPSB3aW5kb3cud2ViQ29udGVudHMuc2Vzc2lvbi53ZWJSZXF1ZXN0Lm9uSGVhZGVyc1JlY2VpdmVkLmdldENhbGwoMCkuYXJnc1swXTtcblxuXHRcdGNvbnN0IGxvYWRQcm9taXNlID0gbG9hZGVyLmxvYWQoKTtcblxuXHRcdC8vIFNpbXVsYXRlIHJlY2VpdmluZyBhIG1hcmtkb3duIGNvbnRlbnQtdHlwZSByZXNwb25zZVxuXHRcdGhlYWRlcnNMaXN0ZW5lcihcblx0XHRcdHtcblx0XHRcdFx0dXJsOiB1cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0cmVzb3VyY2VUeXBlOiAnbWFpbkZyYW1lJyxcblx0XHRcdFx0cmVzcG9uc2VIZWFkZXJzOiB7XG5cdFx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6IFsndGV4dC9tYXJrZG93bjsgY2hhcnNldD11dGYtOCddXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQoKSA9PiB7IH1cblx0XHQpO1xuXG5cdFx0Ly8gTWFrZSBleGVjdXRlSmF2YVNjcmlwdCByZXR1cm4gbWFya2Rvd24gY29udGVudFxuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5leGVjdXRlSmF2YVNjcmlwdC5yZXNvbHZlcygnIyBIZWxsbyBXb3JsZFxcblxcblRoaXMgaXMgbWFya2Rvd24gY29udGVudC4nKTtcblxuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtc3RhcnQtbG9hZGluZycpO1xuXHRcdHdpbmRvdy53ZWJDb250ZW50cy5lbWl0KCdkaWQtZmluaXNoLWxvYWQnKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGxvYWRQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdGF0dXMsICdvaycpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQucmVzdWx0LmluY2x1ZGVzKCcjIEhlbGxvIFdvcmxkJykpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQucmVzdWx0LmluY2x1ZGVzKCdUaGlzIGlzIG1hcmtkb3duIGNvbnRlbnQuJykpO1xuXHR9KSk7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIERpc3Bvc2FsIFRlc3RzXG5cblx0dGVzdCgnZGlzcG9zZXMgcmVzb3VyY2VzIGFmdGVyIGxvYWQgY29tcGxldGVzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL3BhZ2UnKTtcblxuXHRcdGNvbnN0IGxvYWRlciA9IGNyZWF0ZVdlYlBhZ2VMb2FkZXIodXJpKTtcblx0XHRzZXR1cERlYnVnZ2VyTW9jaygpO1xuXG5cdFx0Y29uc3QgbG9hZFByb21pc2UgPSBsb2FkZXIubG9hZCgpO1xuXG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1zdGFydC1sb2FkaW5nJyk7XG5cdFx0d2luZG93LndlYkNvbnRlbnRzLmVtaXQoJ2RpZC1maW5pc2gtbG9hZCcpO1xuXG5cdFx0YXdhaXQgbG9hZFByb21pc2U7XG5cblx0XHQvLyBUaGUgbG9hZGVyIHNob3VsZCBjYWxsIGRlc3Ryb3kgb24gdGhlIHdpbmRvdyB3aGVuIGRpc3Bvc2VkXG5cdFx0YXNzZXJ0Lm9rKHdpbmRvdy5kZXN0cm95LmNhbGxlZCk7XG5cdH0pKTtcblxuXHQvLyNlbmRyZWdpb25cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxZQUFZO0FBQ3hCLFlBQVksV0FBVztBQUN2QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQXNCO0FBRy9CLFNBQVMscUJBQXFCO0FBVzlCLFNBQVMsNkJBQTZCLEtBQXlDO0FBQzlFLFNBQU87QUFBQSxJQUNOO0FBQUEsSUFDQSxnQkFBZ0I7QUFBQSxJQUNoQixhQUFhO0FBQUEsSUFDYixPQUFPO0FBQUEsSUFDUCxnQkFBZ0IsTUFBTSxLQUFLO0FBQUEsRUFDNUI7QUFDRDtBQUVBLE1BQU0sZ0JBQWdCO0FBQUEsRUFrQnJCLGNBQWM7QUFqQmQsU0FBaUIsYUFBYSxvQkFBSSxJQUE4QztBQUNoRixTQUFpQixpQkFBaUIsb0JBQUksSUFBa0M7QUFFeEUsU0FBTyxVQUFVLE1BQU0sS0FBSyxFQUFFLFNBQVM7QUFDdkMsU0FBTyxXQUFXLE1BQU0sS0FBSyxFQUFFLFFBQVEsaUJBQWlCO0FBQ3hELFNBQU8sb0JBQW9CLE1BQU0sS0FBSyxFQUFFLFNBQVMsTUFBUztBQUMxRCxTQUFPLHVCQUF1QixNQUFNLEtBQUs7QUFFekMsU0FBTyxVQUFVO0FBQUEsTUFDaEIsWUFBWTtBQUFBLFFBQ1gsaUJBQWlCLE1BQU0sS0FBSztBQUFBLFFBQzVCLHFCQUFxQixNQUFNLEtBQUs7QUFBQSxRQUNoQyxtQkFBbUIsTUFBTSxLQUFLO0FBQUEsTUFDL0I7QUFBQSxN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
