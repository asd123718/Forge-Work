import assert from "assert";
import { mock } from "../../../../base/test/common/mock.js";
import { ExtHostBrowsers } from "../../common/extHostBrowsers.js";
import { SingleProxyRPCProtocol } from "../common/testRPCProtocol.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("ExtHostBrowsers", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const defaultDto = {
    id: "browser-1",
    url: "https://example.com",
    title: "Example",
    favicon: void 0
  };
  function createDto(overrides) {
    return { ...defaultDto, ...overrides };
  }
  function createExtHostBrowsers(overrides) {
    const proxy = new class extends mock() {
      $openBrowserTab() {
        return Promise.resolve(createDto());
      }
      $startCDPSession() {
        return Promise.resolve();
      }
      $closeCDPSession() {
        return Promise.resolve();
      }
      $sendCDPMessage() {
        return Promise.resolve();
      }
      $closeBrowserTab() {
        return Promise.resolve();
      }
    }();
    if (overrides) {
      Object.assign(proxy, overrides);
    }
    return store.add(new ExtHostBrowsers(SingleProxyRPCProtocol(proxy)));
  }
  test("browserTabs populates from $onDidOpenBrowserTab", () => {
    const extHost = createExtHostBrowsers();
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1", url: "https://one.com", title: "One" }));
    extHost.$onDidOpenBrowserTab(createDto({ id: "b2", url: "https://two.com", title: "Two" }));
    const tabs = extHost.browserTabs;
    assert.strictEqual(tabs.length, 2);
    assert.strictEqual(tabs[0].url, "https://one.com");
    assert.strictEqual(tabs[1].url, "https://two.com");
  });
  test("browserTabs returns a snapshot, not a live array", () => {
    const extHost = createExtHostBrowsers();
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1" }));
    const snapshot1 = extHost.browserTabs;
    extHost.$onDidOpenBrowserTab(createDto({ id: "b2" }));
    const snapshot2 = extHost.browserTabs;
    assert.notStrictEqual(snapshot1, snapshot2);
    assert.strictEqual(snapshot1.length, 1);
    assert.strictEqual(snapshot2.length, 2);
  });
  test("activeBrowserTab updates via $onDidChangeActiveBrowserTab", () => {
    const extHost = createExtHostBrowsers();
    const dto = createDto({ id: "b1", url: "https://active.com" });
    extHost.$onDidOpenBrowserTab(dto);
    extHost.$onDidChangeActiveBrowserTab("b1");
    assert.strictEqual(extHost.activeBrowserTab?.url, "https://active.com");
  });
  test("activeBrowserTab becomes undefined when cleared", () => {
    const extHost = createExtHostBrowsers();
    const dto = createDto({ id: "b1" });
    extHost.$onDidOpenBrowserTab(dto);
    extHost.$onDidChangeActiveBrowserTab("b1");
    assert.ok(extHost.activeBrowserTab);
    extHost.$onDidChangeActiveBrowserTab(void 0);
    assert.strictEqual(extHost.activeBrowserTab, void 0);
  });
  test("$onDidChangeActiveBrowserTab with unknown tab returns undefined", () => {
    const extHost = createExtHostBrowsers();
    extHost.$onDidChangeActiveBrowserTab("non-existent");
    assert.strictEqual(extHost.activeBrowserTab, void 0);
  });
  test("openBrowserTab returns a BrowserTab with correct properties", async () => {
    const dto = createDto({ id: "opened", url: "https://opened.com", title: "Opened" });
    const extHost = createExtHostBrowsers({
      $openBrowserTab: () => Promise.resolve(dto)
    });
    const tab = await extHost.openBrowserTab("https://opened.com");
    assert.strictEqual(tab.url, "https://opened.com");
    assert.strictEqual(tab.title, "Opened");
  });
  test("openBrowserTab fires onDidOpenBrowserTab for new tabs", async () => {
    const extHost = createExtHostBrowsers({
      $openBrowserTab: () => Promise.resolve(createDto({ id: "new-tab" }))
    });
    const opened = [];
    store.add(extHost.onDidOpenBrowserTab((tab) => opened.push(tab)));
    await extHost.openBrowserTab("https://example.com");
    assert.strictEqual(opened.length, 1);
    assert.strictEqual(opened[0].url, "https://example.com");
  });
  test("openBrowserTab reuses existing tab when IDs match", async () => {
    const extHost = createExtHostBrowsers({
      $openBrowserTab: () => Promise.resolve(createDto({ id: "same", url: "https://updated.com" }))
    });
    extHost.$onDidOpenBrowserTab(createDto({ id: "same", url: "https://original.com" }));
    const tab = await extHost.openBrowserTab("https://updated.com");
    assert.strictEqual(extHost.browserTabs.length, 1);
    assert.strictEqual(tab.url, "https://updated.com");
  });
  test("openBrowserTab forwards options to proxy", async () => {
    let capturedViewColumn;
    let capturedOptions;
    const extHost = createExtHostBrowsers({
      $openBrowserTab: (_url, viewColumn, options) => {
        capturedViewColumn = viewColumn;
        capturedOptions = options;
        return Promise.resolve(createDto({ id: "opts" }));
      }
    });
    await extHost.openBrowserTab("https://example.com", { viewColumn: 2, preserveFocus: true, background: true });
    assert.strictEqual(capturedViewColumn, 1);
    assert.strictEqual(capturedOptions?.preserveFocus, true);
    assert.strictEqual(capturedOptions?.inactive, true);
  });
  test("$onDidOpenBrowserTab fires event", () => {
    const extHost = createExtHostBrowsers();
    const opened = [];
    store.add(extHost.onDidOpenBrowserTab((tab) => opened.push(tab)));
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1", url: "https://opened.com" }));
    assert.strictEqual(opened.length, 1);
    assert.strictEqual(opened[0].url, "https://opened.com");
  });
  test("$onDidCloseBrowserTab removes tab and fires event", () => {
    const extHost = createExtHostBrowsers();
    const changes = [];
    store.add(extHost.onDidChangeBrowserTabState((tab) => changes.push(tab)));
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1", url: "https://old.com" }));
    extHost.$onDidChangeBrowserTabState(createDto({ id: "b1", url: "https://new.com" }));
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0].url, "https://new.com");
  });
  test("$onDidChangeBrowserTabState does not fire when data is unchanged", () => {
    const extHost = createExtHostBrowsers();
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1", url: "https://example.com", title: "Old Title" }));
    extHost.$onDidChangeBrowserTabState(createDto({ id: "b1", url: "https://example.com", title: "New Title" }));
    assert.strictEqual(extHost.browserTabs[0].url, "https://example.com");
    assert.strictEqual(extHost.browserTabs[0].title, "New Title");
  });
  test("$onDidChangeActiveBrowserTab fires event", () => {
    const extHost = createExtHostBrowsers();
    const activeChanges = [];
    store.add(extHost.onDidChangeActiveBrowserTab((tab) => activeChanges.push(tab?.url)));
    const dto = createDto({ id: "b1" });
    extHost.$onDidOpenBrowserTab(dto);
    extHost.$onDidChangeActiveBrowserTab("b1");
    extHost.$onDidChangeActiveBrowserTab(void 0);
    assert.deepStrictEqual(activeChanges, ["https://example.com", void 0]);
  });
  test("icon is globe ThemeIcon when no favicon", () => {
    const extHost = createExtHostBrowsers();
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1", favicon: void 0 }));
    assert.strictEqual(extHost.browserTabs[0].icon.id, "globe");
  });
  test("icon is URI when favicon is provided", () => {
    const extHost = createExtHostBrowsers();
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1", favicon: "https://example.com/favicon.ico" }));
    assert.strictEqual(String(extHost.browserTabs[0].icon), "https://example.com/favicon.ico");
  });
  test("icon updates when favicon changes", () => {
    const extHost = createExtHostBrowsers();
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1", favicon: void 0 }));
    assert.strictEqual(extHost.browserTabs[0].icon.id, "globe");
    extHost.$onDidChangeBrowserTabState(createDto({ id: "b1", favicon: "https://example.com/new.ico" }));
    assert.strictEqual(String(extHost.browserTabs[0].icon), "https://example.com/new.ico");
  });
  test("icon reverts to globe when favicon is cleared", () => {
    const extHost = createExtHostBrowsers();
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1", favicon: "https://example.com/icon.ico" }));
    assert.strictEqual(String(extHost.browserTabs[0].icon), "https://example.com/icon.ico");
    extHost.$onDidChangeBrowserTabState(createDto({ id: "b1", favicon: void 0 }));
    assert.strictEqual(extHost.browserTabs[0].icon.id, "globe");
  });
  test("tab properties are not directly writable", () => {
    const extHost = createExtHostBrowsers();
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1", url: "https://example.com", title: "Title" }));
    const tab = extHost.browserTabs[0];
    assert.throws(() => {
      tab.url = "https://hacked.com";
    });
    assert.throws(() => {
      tab.title = "Hacked";
    });
    assert.strictEqual(tab.url, "https://example.com");
    assert.strictEqual(tab.title, "Title");
  });
  test("startCDPSession calls $startCDPSession on proxy", async () => {
    let capturedBrowserId;
    const extHost = createExtHostBrowsers({
      $startCDPSession: (_sessionId, browserId) => {
        capturedBrowserId = browserId;
        return Promise.resolve();
      }
    });
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1" }));
    const session = await extHost.browserTabs[0].startCDPSession();
    assert.ok(session);
    assert.strictEqual(capturedBrowserId, "b1");
  });
  test("sendMessage validates message structure", async () => {
    const extHost = createExtHostBrowsers();
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1" }));
    const session = await extHost.browserTabs[0].startCDPSession();
    await session.sendMessage({ id: 1, method: "Page.enable" });
    await assert.rejects(Promise.resolve().then(() => session.sendMessage(null)), /must be an object/);
    await assert.rejects(Promise.resolve().then(() => session.sendMessage({ method: "Foo" })), /numeric id/);
    await assert.rejects(Promise.resolve().then(() => session.sendMessage({ id: 1 })), /method string/);
  });
  test("sendMessage forwards valid message to proxy", async () => {
    const sentMessages = [];
    const extHost = createExtHostBrowsers({
      $sendCDPMessage: (_sid, message) => {
        sentMessages.push(message);
        return Promise.resolve();
      }
    });
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1" }));
    const session = await extHost.browserTabs[0].startCDPSession();
    await session.sendMessage({ id: 1, method: "Page.enable", params: {} });
    assert.strictEqual(sentMessages.length, 1);
    assert.deepStrictEqual(sentMessages[0], { id: 1, method: "Page.enable", params: {}, sessionId: void 0 });
  });
  test("sendMessage rejects after session is closed", async () => {
    const extHost = createExtHostBrowsers();
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1" }));
    const session = await extHost.browserTabs[0].startCDPSession();
    await session.close();
    await assert.rejects(Promise.resolve().then(() => session.sendMessage({ id: 1, method: "Foo" })), /closed/);
  });
  test("$onCDPSessionMessage delivers to correct session", async () => {
    const capturedIds = [];
    const extHost = createExtHostBrowsers({
      $startCDPSession: (sessionId) => {
        capturedIds.push(sessionId);
        return Promise.resolve();
      }
    });
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1" }));
    const session1 = await extHost.browserTabs[0].startCDPSession();
    const session2 = await extHost.browserTabs[0].startCDPSession();
    const received1 = [];
    const received2 = [];
    store.add(session1.onDidReceiveMessage((m) => received1.push(m)));
    store.add(session2.onDidReceiveMessage((m) => received2.push(m)));
    extHost.$onCDPSessionMessage(capturedIds[1], { id: 1, result: { data: "hello" } });
    assert.deepStrictEqual(received1, []);
    assert.deepStrictEqual(received2, [{ id: 1, result: { data: "hello" } }]);
  });
  test("$onCDPSessionClosed fires onDidClose", async () => {
    const capturedIds = [];
    const extHost = createExtHostBrowsers({
      $startCDPSession: (sessionId) => {
        capturedIds.push(sessionId);
        return Promise.resolve();
      }
    });
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1" }));
    const session = await extHost.browserTabs[0].startCDPSession();
    let closeFired = false;
    store.add(session.onDidClose(() => {
      closeFired = true;
    }));
    extHost.$onCDPSessionClosed(capturedIds[0]);
    assert.ok(closeFired);
  });
  test("tab object reference is stable across updates", () => {
    const extHost = createExtHostBrowsers();
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1", url: "https://old.com", title: "Old" }));
    const tabBefore = extHost.browserTabs[0];
    extHost.$onDidChangeBrowserTabState(createDto({ id: "b1", url: "https://new.com", title: "New" }));
    const tabAfter = extHost.browserTabs[0];
    assert.strictEqual(tabBefore, tabAfter);
    assert.strictEqual(tabAfter.url, "https://new.com");
  });
  test("openBrowserTab returns same reference as browserTabs entry", async () => {
    const extHost = createExtHostBrowsers({
      $openBrowserTab: () => Promise.resolve(createDto({ id: "ref-test" }))
    });
    const returned = await extHost.openBrowserTab("https://example.com");
    const fromArray = extHost.browserTabs[0];
    assert.strictEqual(returned, fromArray);
  });
  test("closing one tab does not affect others", () => {
    const extHost = createExtHostBrowsers();
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1", url: "https://one.com" }));
    extHost.$onDidOpenBrowserTab(createDto({ id: "b2", url: "https://two.com" }));
    extHost.$onDidOpenBrowserTab(createDto({ id: "b3", url: "https://three.com" }));
    extHost.$onDidCloseBrowserTab("b2");
    assert.strictEqual(extHost.browserTabs.length, 2);
    assert.deepStrictEqual(extHost.browserTabs.map((t) => t.url), ["https://one.com", "https://three.com"]);
  });
  test("closing active tab clears activeBrowserTab", () => {
    const extHost = createExtHostBrowsers();
    const dto = createDto({ id: "b1" });
    extHost.$onDidOpenBrowserTab(dto);
    extHost.$onDidChangeActiveBrowserTab("b1");
    assert.ok(extHost.activeBrowserTab);
    extHost.$onDidCloseBrowserTab("b1");
    assert.strictEqual(extHost.activeBrowserTab, void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcYnJvd3NlclxcZXh0SG9zdEJyb3dzZXJzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBCcm93c2VyVGFiRHRvLCBNYWluVGhyZWFkQnJvd3NlcnNTaGFwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IEV4dEhvc3RCcm93c2VycyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0QnJvd3NlcnMuanMnO1xuaW1wb3J0IHsgU2luZ2xlUHJveHlSUENQcm90b2NvbCB9IGZyb20gJy4uL2NvbW1vbi90ZXN0UlBDUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbnN1aXRlKCdFeHRIb3N0QnJvd3NlcnMnLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBkZWZhdWx0RHRvOiBCcm93c2VyVGFiRHRvID0ge1xuXHRcdGlkOiAnYnJvd3Nlci0xJyxcblx0XHR1cmw6ICdodHRwczovL2V4YW1wbGUuY29tJyxcblx0XHR0aXRsZTogJ0V4YW1wbGUnLFxuXHRcdGZhdmljb246IHVuZGVmaW5lZCxcblx0fTtcblxuXHRmdW5jdGlvbiBjcmVhdGVEdG8ob3ZlcnJpZGVzPzogUGFydGlhbDxCcm93c2VyVGFiRHRvPik6IEJyb3dzZXJUYWJEdG8ge1xuXHRcdHJldHVybiB7IC4uLmRlZmF1bHREdG8sIC4uLm92ZXJyaWRlcyB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlRXh0SG9zdEJyb3dzZXJzKG92ZXJyaWRlcz86IFBhcnRpYWw8TWFpblRocmVhZEJyb3dzZXJzU2hhcGU+KTogRXh0SG9zdEJyb3dzZXJzIHtcblx0XHRjb25zdCBwcm94eSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZEJyb3dzZXJzU2hhcGU+KCkge1xuXHRcdFx0b3ZlcnJpZGUgJG9wZW5Ccm93c2VyVGFiKCk6IFByb21pc2U8QnJvd3NlclRhYkR0bz4geyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGNyZWF0ZUR0bygpKTsgfVxuXHRcdFx0b3ZlcnJpZGUgJHN0YXJ0Q0RQU2Vzc2lvbigpOiBQcm9taXNlPHZvaWQ+IHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpOyB9XG5cdFx0XHRvdmVycmlkZSAkY2xvc2VDRFBTZXNzaW9uKCk6IFByb21pc2U8dm9pZD4geyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7IH1cblx0XHRcdG92ZXJyaWRlICRzZW5kQ0RQTWVzc2FnZSgpOiBQcm9taXNlPHZvaWQ+IHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpOyB9XG5cdFx0XHRvdmVycmlkZSAkY2xvc2VCcm93c2VyVGFiKCk6IFByb21pc2U8dm9pZD4geyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7IH1cblx0XHR9O1xuXHRcdGlmIChvdmVycmlkZXMpIHtcblx0XHRcdE9iamVjdC5hc3NpZ24ocHJveHksIG92ZXJyaWRlcyk7XG5cdFx0fVxuXHRcdHJldHVybiBzdG9yZS5hZGQobmV3IEV4dEhvc3RCcm93c2VycyhTaW5nbGVQcm94eVJQQ1Byb3RvY29sKHByb3h5KSkpO1xuXHR9XG5cblx0Ly8gI3JlZ2lvbiBicm93c2VyVGFic1xuXG5cdHRlc3QoJ2Jyb3dzZXJUYWJzIHBvcHVsYXRlcyBmcm9tICRvbkRpZE9wZW5Ccm93c2VyVGFiJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV4dEhvc3QgPSBjcmVhdGVFeHRIb3N0QnJvd3NlcnMoKTtcblx0XHRleHRIb3N0LiRvbkRpZE9wZW5Ccm93c2VyVGFiKGNyZWF0ZUR0byh7IGlkOiAnYjEnLCB1cmw6ICdodHRwczovL29uZS5jb20nLCB0aXRsZTogJ09uZScgfSkpO1xuXHRcdGV4dEhvc3QuJG9uRGlkT3BlbkJyb3dzZXJUYWIoY3JlYXRlRHRvKHsgaWQ6ICdiMicsIHVybDogJ2h0dHBzOi8vdHdvLmNvbScsIHRpdGxlOiAnVHdvJyB9KSk7XG5cblx0XHRjb25zdCB0YWJzID0gZXh0SG9zdC5icm93c2VyVGFicztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFicy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YWJzWzBdLnVybCwgJ2h0dHBzOi8vb25lLmNvbScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YWJzWzFdLnVybCwgJ2h0dHBzOi8vdHdvLmNvbScpO1xuXHR9KTtcblxuXHR0ZXN0KCdicm93c2VyVGFicyByZXR1cm5zIGEgc25hcHNob3QsIG5vdCBhIGxpdmUgYXJyYXknLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXh0SG9zdCA9IGNyZWF0ZUV4dEhvc3RCcm93c2VycygpO1xuXHRcdGV4dEhvc3QuJG9uRGlkT3BlbkJyb3dzZXJUYWIoY3JlYXRlRHRvKHsgaWQ6ICdiMScgfSkpO1xuXHRcdGNvbnN0IHNuYXBzaG90MSA9IGV4dEhvc3QuYnJvd3NlclRhYnM7XG5cblx0XHRleHRIb3N0LiRvbkRpZE9wZW5Ccm93c2VyVGFiKGNyZWF0ZUR0byh7IGlkOiAnYjInIH0pKTtcblx0XHRjb25zdCBzbmFwc2hvdDIgPSBleHRIb3N0LmJyb3dzZXJUYWJzO1xuXG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHNuYXBzaG90MSwgc25hcHNob3QyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc25hcHNob3QxLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuYXBzaG90Mi5sZW5ndGgsIDIpO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBhY3RpdmVCcm93c2VyVGFiXG5cblx0dGVzdCgnYWN0aXZlQnJvd3NlclRhYiB1cGRhdGVzIHZpYSAkb25EaWRDaGFuZ2VBY3RpdmVCcm93c2VyVGFiJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV4dEhvc3QgPSBjcmVhdGVFeHRIb3N0QnJvd3NlcnMoKTtcblx0XHRjb25zdCBkdG8gPSBjcmVhdGVEdG8oeyBpZDogJ2IxJywgdXJsOiAnaHR0cHM6Ly9hY3RpdmUuY29tJyB9KTtcblx0XHRleHRIb3N0LiRvbkRpZE9wZW5Ccm93c2VyVGFiKGR0byk7XG5cdFx0ZXh0SG9zdC4kb25EaWRDaGFuZ2VBY3RpdmVCcm93c2VyVGFiKCdiMScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3QuYWN0aXZlQnJvd3NlclRhYj8udXJsLCAnaHR0cHM6Ly9hY3RpdmUuY29tJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjdGl2ZUJyb3dzZXJUYWIgYmVjb21lcyB1bmRlZmluZWQgd2hlbiBjbGVhcmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV4dEhvc3QgPSBjcmVhdGVFeHRIb3N0QnJvd3NlcnMoKTtcblx0XHRjb25zdCBkdG8gPSBjcmVhdGVEdG8oeyBpZDogJ2IxJyB9KTtcblx0XHRleHRIb3N0LiRvbkRpZE9wZW5Ccm93c2VyVGFiKGR0byk7XG5cdFx0ZXh0SG9zdC4kb25EaWRDaGFuZ2VBY3RpdmVCcm93c2VyVGFiKCdiMScpO1xuXHRcdGFzc2VydC5vayhleHRIb3N0LmFjdGl2ZUJyb3dzZXJUYWIpO1xuXG5cdFx0ZXh0SG9zdC4kb25EaWRDaGFuZ2VBY3RpdmVCcm93c2VyVGFiKHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3QuYWN0aXZlQnJvd3NlclRhYiwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnJG9uRGlkQ2hhbmdlQWN0aXZlQnJvd3NlclRhYiB3aXRoIHVua25vd24gdGFiIHJldHVybnMgdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV4dEhvc3QgPSBjcmVhdGVFeHRIb3N0QnJvd3NlcnMoKTtcblxuXHRcdGV4dEhvc3QuJG9uRGlkQ2hhbmdlQWN0aXZlQnJvd3NlclRhYignbm9uLWV4aXN0ZW50Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdC5hY3RpdmVCcm93c2VyVGFiLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBvcGVuQnJvd3NlclRhYlxuXG5cdHRlc3QoJ29wZW5Ccm93c2VyVGFiIHJldHVybnMgYSBCcm93c2VyVGFiIHdpdGggY29ycmVjdCBwcm9wZXJ0aWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGR0byA9IGNyZWF0ZUR0byh7IGlkOiAnb3BlbmVkJywgdXJsOiAnaHR0cHM6Ly9vcGVuZWQuY29tJywgdGl0bGU6ICdPcGVuZWQnIH0pO1xuXHRcdGNvbnN0IGV4dEhvc3QgPSBjcmVhdGVFeHRIb3N0QnJvd3NlcnMoe1xuXHRcdFx0JG9wZW5Ccm93c2VyVGFiOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoZHRvKSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRhYiA9IGF3YWl0IGV4dEhvc3Qub3BlbkJyb3dzZXJUYWIoJ2h0dHBzOi8vb3BlbmVkLmNvbScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YWIudXJsLCAnaHR0cHM6Ly9vcGVuZWQuY29tJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhYi50aXRsZSwgJ09wZW5lZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdvcGVuQnJvd3NlclRhYiBmaXJlcyBvbkRpZE9wZW5Ccm93c2VyVGFiIGZvciBuZXcgdGFicycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBleHRIb3N0ID0gY3JlYXRlRXh0SG9zdEJyb3dzZXJzKHtcblx0XHRcdCRvcGVuQnJvd3NlclRhYjogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKGNyZWF0ZUR0byh7IGlkOiAnbmV3LXRhYicgfSkpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IG9wZW5lZDogdnNjb2RlLkJyb3dzZXJUYWJbXSA9IFtdO1xuXHRcdHN0b3JlLmFkZChleHRIb3N0Lm9uRGlkT3BlbkJyb3dzZXJUYWIodGFiID0+IG9wZW5lZC5wdXNoKHRhYikpKTtcblxuXHRcdGF3YWl0IGV4dEhvc3Qub3BlbkJyb3dzZXJUYWIoJ2h0dHBzOi8vZXhhbXBsZS5jb20nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcGVuZWQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3BlbmVkWzBdLnVybCwgJ2h0dHBzOi8vZXhhbXBsZS5jb20nKTtcblx0fSk7XG5cblx0dGVzdCgnb3BlbkJyb3dzZXJUYWIgcmV1c2VzIGV4aXN0aW5nIHRhYiB3aGVuIElEcyBtYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBleHRIb3N0ID0gY3JlYXRlRXh0SG9zdEJyb3dzZXJzKHtcblx0XHRcdCRvcGVuQnJvd3NlclRhYjogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKGNyZWF0ZUR0byh7IGlkOiAnc2FtZScsIHVybDogJ2h0dHBzOi8vdXBkYXRlZC5jb20nIH0pKSxcblx0XHR9KTtcblxuXHRcdGV4dEhvc3QuJG9uRGlkT3BlbkJyb3dzZXJUYWIoY3JlYXRlRHRvKHsgaWQ6ICdzYW1lJywgdXJsOiAnaHR0cHM6Ly9vcmlnaW5hbC5jb20nIH0pKTtcblx0XHRjb25zdCB0YWIgPSBhd2FpdCBleHRIb3N0Lm9wZW5Ccm93c2VyVGFiKCdodHRwczovL3VwZGF0ZWQuY29tJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdC5icm93c2VyVGFicy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YWIudXJsLCAnaHR0cHM6Ly91cGRhdGVkLmNvbScpO1xuXHR9KTtcblxuXHR0ZXN0KCdvcGVuQnJvd3NlclRhYiBmb3J3YXJkcyBvcHRpb25zIHRvIHByb3h5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBjYXB0dXJlZFZpZXdDb2x1bW46IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRsZXQgY2FwdHVyZWRPcHRpb25zOiB7IHByZXNlcnZlRm9jdXM/OiBib29sZWFuOyBpbmFjdGl2ZT86IGJvb2xlYW4gfSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBleHRIb3N0ID0gY3JlYXRlRXh0SG9zdEJyb3dzZXJzKHtcblx0XHRcdCRvcGVuQnJvd3NlclRhYjogKF91cmw6IHN0cmluZywgdmlld0NvbHVtbj86IG51bWJlciwgb3B0aW9ucz86IHsgcHJlc2VydmVGb2N1cz86IGJvb2xlYW47IGluYWN0aXZlPzogYm9vbGVhbiB9KSA9PiB7XG5cdFx0XHRcdGNhcHR1cmVkVmlld0NvbHVtbiA9IHZpZXdDb2x1bW47XG5cdFx0XHRcdGNhcHR1cmVkT3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoY3JlYXRlRHRvKHsgaWQ6ICdvcHRzJyB9KSk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgZXh0SG9zdC5vcGVuQnJvd3NlclRhYignaHR0cHM6Ly9leGFtcGxlLmNvbScsIHsgdmlld0NvbHVtbjogMiwgcHJlc2VydmVGb2N1czogdHJ1ZSwgYmFja2dyb3VuZDogdHJ1ZSB9KTtcblxuXHRcdC8vIFZpZXdDb2x1bW4uZnJvbSBjb252ZXJ0cyBBUEkgdmlld0NvbHVtbiAoMS1iYXNlZCkgdG8gRWRpdG9yR3JvdXBDb2x1bW4gKDAtYmFzZWQpXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcHR1cmVkVmlld0NvbHVtbiwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcHR1cmVkT3B0aW9ucz8ucHJlc2VydmVGb2N1cywgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcHR1cmVkT3B0aW9ucz8uaW5hY3RpdmUsIHRydWUpO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiAkb25EaWRPcGVuQnJvd3NlclRhYlxuXG5cdHRlc3QoJyRvbkRpZE9wZW5Ccm93c2VyVGFiIGZpcmVzIGV2ZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IGV4dEhvc3QgPSBjcmVhdGVFeHRIb3N0QnJvd3NlcnMoKTtcblx0XHRjb25zdCBvcGVuZWQ6IHZzY29kZS5Ccm93c2VyVGFiW10gPSBbXTtcblx0XHRzdG9yZS5hZGQoZXh0SG9zdC5vbkRpZE9wZW5Ccm93c2VyVGFiKHRhYiA9PiBvcGVuZWQucHVzaCh0YWIpKSk7XG5cblx0XHRleHRIb3N0LiRvbkRpZE9wZW5Ccm93c2VyVGFiKGNyZWF0ZUR0byh7IGlkOiAnYjEnLCB1cmw6ICdodHRwczovL29wZW5lZC5jb20nIH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcGVuZWQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3BlbmVkWzBdLnVybCwgJ2h0dHBzOi8vb3BlbmVkLmNvbScpO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiAkb25EaWRDbG9zZUJyb3dzZXJUYWJcblxuXHR0ZXN0KCckb25EaWRDbG9zZUJyb3dzZXJUYWIgcmVtb3ZlcyB0YWIgYW5kIGZpcmVzIGV2ZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IGV4dEhvc3QgPSBjcmVhdGVFeHRIb3N0QnJvd3NlcnMoKTtcblx0XHRjb25zdCBjaGFuZ2VzOiB2c2NvZGUuQnJvd3NlclRhYltdID0gW107XG5cdFx0c3RvcmUuYWRkKGV4dEhvc3Qub25EaWRDaGFuZ2VCcm93c2VyVGFiU3RhdGUodGFiID0+IGNoYW5nZXMucHVzaCh0YWIpKSk7XG5cblx0XHRleHRIb3N0LiRvbkRpZE9wZW5Ccm93c2VyVGFiKGNyZWF0ZUR0byh7IGlkOiAnYjEnLCB1cmw6ICdodHRwczovL29sZC5jb20nIH0pKTtcblx0XHRleHRIb3N0LiRvbkRpZENoYW5nZUJyb3dzZXJUYWJTdGF0ZShjcmVhdGVEdG8oeyBpZDogJ2IxJywgdXJsOiAnaHR0cHM6Ly9uZXcuY29tJyB9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VzWzBdLnVybCwgJ2h0dHBzOi8vbmV3LmNvbScpO1xuXHR9KTtcblxuXHR0ZXN0KCckb25EaWRDaGFuZ2VCcm93c2VyVGFiU3RhdGUgZG9lcyBub3QgZmlyZSB3aGVuIGRhdGEgaXMgdW5jaGFuZ2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV4dEhvc3QgPSBjcmVhdGVFeHRIb3N0QnJvd3NlcnMoKTtcblx0XHRleHRIb3N0LiRvbkRpZE9wZW5Ccm93c2VyVGFiKGNyZWF0ZUR0byh7IGlkOiAnYjEnLCB1cmw6ICdodHRwczovL2V4YW1wbGUuY29tJywgdGl0bGU6ICdPbGQgVGl0bGUnIH0pKTtcblxuXHRcdGV4dEhvc3QuJG9uRGlkQ2hhbmdlQnJvd3NlclRhYlN0YXRlKGNyZWF0ZUR0byh7IGlkOiAnYjEnLCB1cmw6ICdodHRwczovL2V4YW1wbGUuY29tJywgdGl0bGU6ICdOZXcgVGl0bGUnIH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0LmJyb3dzZXJUYWJzWzBdLnVybCwgJ2h0dHBzOi8vZXhhbXBsZS5jb20nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdC5icm93c2VyVGFic1swXS50aXRsZSwgJ05ldyBUaXRsZScpO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiAkb25EaWRDaGFuZ2VBY3RpdmVCcm93c2VyVGFiIGV2ZW50XG5cblx0dGVzdCgnJG9uRGlkQ2hhbmdlQWN0aXZlQnJvd3NlclRhYiBmaXJlcyBldmVudCcsICgpID0+IHtcblx0XHRjb25zdCBleHRIb3N0ID0gY3JlYXRlRXh0SG9zdEJyb3dzZXJzKCk7XG5cdFx0Y29uc3QgYWN0aXZlQ2hhbmdlczogKHN0cmluZyB8IHVuZGVmaW5lZClbXSA9IFtdO1xuXHRcdHN0b3JlLmFkZChleHRIb3N0Lm9uRGlkQ2hhbmdlQWN0aXZlQnJvd3NlclRhYih0YWIgPT4gYWN0aXZlQ2hhbmdlcy5wdXNoKHRhYj8udXJsKSkpO1xuXG5cdFx0Y29uc3QgZHRvID0gY3JlYXRlRHRvKHsgaWQ6ICdiMScgfSk7XG5cdFx0ZXh0SG9zdC4kb25EaWRPcGVuQnJvd3NlclRhYihkdG8pO1xuXHRcdGV4dEhvc3QuJG9uRGlkQ2hhbmdlQWN0aXZlQnJvd3NlclRhYignYjEnKTtcblx0XHRleHRIb3N0LiRvbkRpZENoYW5nZUFjdGl2ZUJyb3dzZXJUYWIodW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aXZlQ2hhbmdlcywgWydodHRwczovL2V4YW1wbGUuY29tJywgdW5kZWZpbmVkXSk7XG5cdH0pO1xuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIEJyb3dzZXJUYWIgaWNvblxuXG5cdHRlc3QoJ2ljb24gaXMgZ2xvYmUgVGhlbWVJY29uIHdoZW4gbm8gZmF2aWNvbicsICgpID0+IHtcblx0XHRjb25zdCBleHRIb3N0ID0gY3JlYXRlRXh0SG9zdEJyb3dzZXJzKCk7XG5cdFx0ZXh0SG9zdC4kb25EaWRPcGVuQnJvd3NlclRhYihjcmVhdGVEdG8oeyBpZDogJ2IxJywgZmF2aWNvbjogdW5kZWZpbmVkIH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoZXh0SG9zdC5icm93c2VyVGFic1swXS5pY29uIGFzIHsgaWQ6IHN0cmluZyB9KS5pZCwgJ2dsb2JlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ljb24gaXMgVVJJIHdoZW4gZmF2aWNvbiBpcyBwcm92aWRlZCcsICgpID0+IHtcblx0XHRjb25zdCBleHRIb3N0ID0gY3JlYXRlRXh0SG9zdEJyb3dzZXJzKCk7XG5cdFx0ZXh0SG9zdC4kb25EaWRPcGVuQnJvd3NlclRhYihjcmVhdGVEdG8oeyBpZDogJ2IxJywgZmF2aWNvbjogJ2h0dHBzOi8vZXhhbXBsZS5jb20vZmF2aWNvbi5pY28nIH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChTdHJpbmcoZXh0SG9zdC5icm93c2VyVGFic1swXS5pY29uKSwgJ2h0dHBzOi8vZXhhbXBsZS5jb20vZmF2aWNvbi5pY28nKTtcblx0fSk7XG5cblx0dGVzdCgnaWNvbiB1cGRhdGVzIHdoZW4gZmF2aWNvbiBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV4dEhvc3QgPSBjcmVhdGVFeHRIb3N0QnJvd3NlcnMoKTtcblx0XHRleHRIb3N0LiRvbkRpZE9wZW5Ccm93c2VyVGFiKGNyZWF0ZUR0byh7IGlkOiAnYjEnLCBmYXZpY29uOiB1bmRlZmluZWQgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoZXh0SG9zdC5icm93c2VyVGFic1swXS5pY29uIGFzIHsgaWQ6IHN0cmluZyB9KS5pZCwgJ2dsb2JlJyk7XG5cblx0XHRleHRIb3N0LiRvbkRpZENoYW5nZUJyb3dzZXJUYWJTdGF0ZShjcmVhdGVEdG8oeyBpZDogJ2IxJywgZmF2aWNvbjogJ2h0dHBzOi8vZXhhbXBsZS5jb20vbmV3LmljbycgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChTdHJpbmcoZXh0SG9zdC5icm93c2VyVGFic1swXS5pY29uKSwgJ2h0dHBzOi8vZXhhbXBsZS5jb20vbmV3LmljbycpO1xuXHR9KTtcblxuXHR0ZXN0KCdpY29uIHJldmVydHMgdG8gZ2xvYmUgd2hlbiBmYXZpY29uIGlzIGNsZWFyZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXh0SG9zdCA9IGNyZWF0ZUV4dEhvc3RCcm93c2VycygpO1xuXHRcdGV4dEhvc3QuJG9uRGlkT3BlbkJyb3dzZXJUYWIoY3JlYXRlRHRvKHsgaWQ6ICdiMScsIGZhdmljb246ICdodHRwczovL2V4YW1wbGUuY29tL2ljb24uaWNvJyB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFN0cmluZyhleHRIb3N0LmJyb3dzZXJUYWJzWzBdLmljb24pLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS9pY29uLmljbycpO1xuXG5cdFx0ZXh0SG9zdC4kb25EaWRDaGFuZ2VCcm93c2VyVGFiU3RhdGUoY3JlYXRlRHRvKHsgaWQ6ICdiMScsIGZhdmljb246IHVuZGVmaW5lZCB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChleHRIb3N0LmJyb3dzZXJUYWJzWzBdLmljb24gYXMgeyBpZDogc3RyaW5nIH0pLmlkLCAnZ2xvYmUnKTtcblx0fSk7XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gQnJvd3NlclRhYiByZWFkb25seSBwcm9wZXJ0aWVzXG5cblx0dGVzdCgndGFiIHByb3BlcnRpZXMgYXJlIG5vdCBkaXJlY3RseSB3cml0YWJsZScsICgpID0+IHtcblx0XHRjb25zdCBleHRIb3N0ID0gY3JlYXRlRXh0SG9zdEJyb3dzZXJzKCk7XG5cdFx0ZXh0SG9zdC4kb25EaWRPcGVuQnJvd3NlclRhYihjcmVhdGVEdG8oeyBpZDogJ2IxJywgdXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbScsIHRpdGxlOiAnVGl0bGUnIH0pKTtcblx0XHRjb25zdCB0YWIgPSBleHRIb3N0LmJyb3dzZXJUYWJzWzBdO1xuXG5cdFx0Ly8gQXR0ZW1wdGluZyB0byBhc3NpZ24gdG8gZ2V0dGVyLW9ubHkgcHJvcGVydGllcyBzaG91bGQgZWl0aGVyIHRocm93IG9yIGJlIHNpbGVudGx5IGlnbm9yZWRcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHsgKHRhYiBhcyB1bmtub3duIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KS51cmwgPSAnaHR0cHM6Ly9oYWNrZWQuY29tJzsgfSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7ICh0YWIgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikudGl0bGUgPSAnSGFja2VkJzsgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhYi51cmwsICdodHRwczovL2V4YW1wbGUuY29tJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhYi50aXRsZSwgJ1RpdGxlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXJ0Q0RQU2Vzc2lvbiBjYWxscyAkc3RhcnRDRFBTZXNzaW9uIG9uIHByb3h5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBjYXB0dXJlZEJyb3dzZXJJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGV4dEhvc3QgPSBjcmVhdGVFeHRIb3N0QnJvd3NlcnMoe1xuXHRcdFx0JHN0YXJ0Q0RQU2Vzc2lvbjogKF9zZXNzaW9uSWQ6IHN0cmluZywgYnJvd3NlcklkOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y2FwdHVyZWRCcm93c2VySWQgPSBicm93c2VySWQ7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRleHRIb3N0LiRvbkRpZE9wZW5Ccm93c2VyVGFiKGNyZWF0ZUR0byh7IGlkOiAnYjEnIH0pKTtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgZXh0SG9zdC5icm93c2VyVGFic1swXS5zdGFydENEUFNlc3Npb24oKTtcblxuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FwdHVyZWRCcm93c2VySWQsICdiMScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kTWVzc2FnZSB2YWxpZGF0ZXMgbWVzc2FnZSBzdHJ1Y3R1cmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXh0SG9zdCA9IGNyZWF0ZUV4dEhvc3RCcm93c2VycygpO1xuXHRcdGV4dEhvc3QuJG9uRGlkT3BlbkJyb3dzZXJUYWIoY3JlYXRlRHRvKHsgaWQ6ICdiMScgfSkpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBleHRIb3N0LmJyb3dzZXJUYWJzWzBdLnN0YXJ0Q0RQU2Vzc2lvbigpO1xuXG5cdFx0Ly8gVmFsaWQgbWVzc2FnZSBzdWNjZWVkc1xuXHRcdGF3YWl0IHNlc3Npb24uc2VuZE1lc3NhZ2UoeyBpZDogMSwgbWV0aG9kOiAnUGFnZS5lbmFibGUnIH0pO1xuXG5cdFx0Ly8gSW52YWxpZCBtZXNzYWdlcyBhcmUgcmVqZWN0ZWRcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhQcm9taXNlLnJlc29sdmUoKS50aGVuKCgpID0+IHNlc3Npb24uc2VuZE1lc3NhZ2UobnVsbCBhcyBuZXZlcikpLCAvbXVzdCBiZSBhbiBvYmplY3QvKTtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhQcm9taXNlLnJlc29sdmUoKS50aGVuKCgpID0+IHNlc3Npb24uc2VuZE1lc3NhZ2UoeyBtZXRob2Q6ICdGb28nIH0gYXMgbmV2ZXIpKSwgL251bWVyaWMgaWQvKTtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhQcm9taXNlLnJlc29sdmUoKS50aGVuKCgpID0+IHNlc3Npb24uc2VuZE1lc3NhZ2UoeyBpZDogMSB9IGFzIG5ldmVyKSksIC9tZXRob2Qgc3RyaW5nLyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbmRNZXNzYWdlIGZvcndhcmRzIHZhbGlkIG1lc3NhZ2UgdG8gcHJveHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VudE1lc3NhZ2VzOiB1bmtub3duW10gPSBbXTtcblx0XHRjb25zdCBleHRIb3N0ID0gY3JlYXRlRXh0SG9zdEJyb3dzZXJzKHtcblx0XHRcdCRzZW5kQ0RQTWVzc2FnZTogKF9zaWQ6IHN0cmluZywgbWVzc2FnZTogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRzZW50TWVzc2FnZXMucHVzaChtZXNzYWdlKTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGV4dEhvc3QuJG9uRGlkT3BlbkJyb3dzZXJUYWIoY3JlYXRlRHRvKHsgaWQ6ICdiMScgfSkpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBleHRIb3N0LmJyb3dzZXJUYWJzWzBdLnN0YXJ0Q0RQU2Vzc2lvbigpO1xuXHRcdGF3YWl0IHNlc3Npb24uc2VuZE1lc3NhZ2UoeyBpZDogMSwgbWV0aG9kOiAnUGFnZS5lbmFibGUnLCBwYXJhbXM6IHt9IH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlbnRNZXNzYWdlcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VudE1lc3NhZ2VzWzBdLCB7IGlkOiAxLCBtZXRob2Q6ICdQYWdlLmVuYWJsZScsIHBhcmFtczoge30sIHNlc3Npb25JZDogdW5kZWZpbmVkIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kTWVzc2FnZSByZWplY3RzIGFmdGVyIHNlc3Npb24gaXMgY2xvc2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV4dEhvc3QgPSBjcmVhdGVFeHRIb3N0QnJvd3NlcnMoKTtcblx0XHRleHRIb3N0LiRvbkRpZE9wZW5Ccm93c2VyVGFiKGNyZWF0ZUR0byh7IGlkOiAnYjEnIH0pKTtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgZXh0SG9zdC5icm93c2VyVGFic1swXS5zdGFydENEUFNlc3Npb24oKTtcblxuXHRcdGF3YWl0IHNlc3Npb24uY2xvc2UoKTtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhQcm9taXNlLnJlc29sdmUoKS50aGVuKCgpID0+IHNlc3Npb24uc2VuZE1lc3NhZ2UoeyBpZDogMSwgbWV0aG9kOiAnRm9vJyB9KSksIC9jbG9zZWQvKTtcblx0fSk7XG5cblx0dGVzdCgnJG9uQ0RQU2Vzc2lvbk1lc3NhZ2UgZGVsaXZlcnMgdG8gY29ycmVjdCBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNhcHR1cmVkSWRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGV4dEhvc3QgPSBjcmVhdGVFeHRIb3N0QnJvd3NlcnMoe1xuXHRcdFx0JHN0YXJ0Q0RQU2Vzc2lvbjogKHNlc3Npb25JZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNhcHR1cmVkSWRzLnB1c2goc2Vzc2lvbklkKTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGV4dEhvc3QuJG9uRGlkT3BlbkJyb3dzZXJUYWIoY3JlYXRlRHRvKHsgaWQ6ICdiMScgfSkpO1xuXHRcdGNvbnN0IHNlc3Npb24xID0gYXdhaXQgZXh0SG9zdC5icm93c2VyVGFic1swXS5zdGFydENEUFNlc3Npb24oKTtcblx0XHRjb25zdCBzZXNzaW9uMiA9IGF3YWl0IGV4dEhvc3QuYnJvd3NlclRhYnNbMF0uc3RhcnRDRFBTZXNzaW9uKCk7XG5cblx0XHRjb25zdCByZWNlaXZlZDE6IHVua25vd25bXSA9IFtdO1xuXHRcdGNvbnN0IHJlY2VpdmVkMjogdW5rbm93bltdID0gW107XG5cdFx0c3RvcmUuYWRkKHNlc3Npb24xLm9uRGlkUmVjZWl2ZU1lc3NhZ2UobSA9PiByZWNlaXZlZDEucHVzaChtKSkpO1xuXHRcdHN0b3JlLmFkZChzZXNzaW9uMi5vbkRpZFJlY2VpdmVNZXNzYWdlKG0gPT4gcmVjZWl2ZWQyLnB1c2gobSkpKTtcblxuXHRcdGV4dEhvc3QuJG9uQ0RQU2Vzc2lvbk1lc3NhZ2UoY2FwdHVyZWRJZHNbMV0sIHsgaWQ6IDEsIHJlc3VsdDogeyBkYXRhOiAnaGVsbG8nIH0gfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlY2VpdmVkMSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVjZWl2ZWQyLCBbeyBpZDogMSwgcmVzdWx0OiB7IGRhdGE6ICdoZWxsbycgfSB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJyRvbkNEUFNlc3Npb25DbG9zZWQgZmlyZXMgb25EaWRDbG9zZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjYXB0dXJlZElkczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBleHRIb3N0ID0gY3JlYXRlRXh0SG9zdEJyb3dzZXJzKHtcblx0XHRcdCRzdGFydENEUFNlc3Npb246IChzZXNzaW9uSWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjYXB0dXJlZElkcy5wdXNoKHNlc3Npb25JZCk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRleHRIb3N0LiRvbkRpZE9wZW5Ccm93c2VyVGFiKGNyZWF0ZUR0byh7IGlkOiAnYjEnIH0pKTtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgZXh0SG9zdC5icm93c2VyVGFic1swXS5zdGFydENEUFNlc3Npb24oKTtcblxuXHRcdGxldCBjbG9zZUZpcmVkID0gZmFsc2U7XG5cdFx0c3RvcmUuYWRkKHNlc3Npb24ub25EaWRDbG9zZSgoKSA9PiB7IGNsb3NlRmlyZWQgPSB0cnVlOyB9KSk7XG5cblx0XHRleHRIb3N0LiRvbkNEUFNlc3Npb25DbG9zZWQoY2FwdHVyZWRJZHNbMF0pO1xuXHRcdGFzc2VydC5vayhjbG9zZUZpcmVkKTtcblx0fSk7XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gUmVmZXJlbmNlIHN0YWJpbGl0eVxuXG5cdHRlc3QoJ3RhYiBvYmplY3QgcmVmZXJlbmNlIGlzIHN0YWJsZSBhY3Jvc3MgdXBkYXRlcycsICgpID0+IHtcblx0XHRjb25zdCBleHRIb3N0ID0gY3JlYXRlRXh0SG9zdEJyb3dzZXJzKCk7XG5cdFx0ZXh0SG9zdC4kb25EaWRPcGVuQnJvd3NlclRhYihjcmVhdGVEdG8oeyBpZDogJ2IxJywgdXJsOiAnaHR0cHM6Ly9vbGQuY29tJywgdGl0bGU6ICdPbGQnIH0pKTtcblx0XHRjb25zdCB0YWJCZWZvcmUgPSBleHRIb3N0LmJyb3dzZXJUYWJzWzBdO1xuXG5cdFx0ZXh0SG9zdC4kb25EaWRDaGFuZ2VCcm93c2VyVGFiU3RhdGUoY3JlYXRlRHRvKHsgaWQ6ICdiMScsIHVybDogJ2h0dHBzOi8vbmV3LmNvbScsIHRpdGxlOiAnTmV3JyB9KSk7XG5cdFx0Y29uc3QgdGFiQWZ0ZXIgPSBleHRIb3N0LmJyb3dzZXJUYWJzWzBdO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhYkJlZm9yZSwgdGFiQWZ0ZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YWJBZnRlci51cmwsICdodHRwczovL25ldy5jb20nKTtcblx0fSk7XG5cblx0dGVzdCgnb3BlbkJyb3dzZXJUYWIgcmV0dXJucyBzYW1lIHJlZmVyZW5jZSBhcyBicm93c2VyVGFicyBlbnRyeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBleHRIb3N0ID0gY3JlYXRlRXh0SG9zdEJyb3dzZXJzKHtcblx0XHRcdCRvcGVuQnJvd3NlclRhYjogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKGNyZWF0ZUR0byh7IGlkOiAncmVmLXRlc3QnIH0pKSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJldHVybmVkID0gYXdhaXQgZXh0SG9zdC5vcGVuQnJvd3NlclRhYignaHR0cHM6Ly9leGFtcGxlLmNvbScpO1xuXHRcdGNvbnN0IGZyb21BcnJheSA9IGV4dEhvc3QuYnJvd3NlclRhYnNbMF07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmV0dXJuZWQsIGZyb21BcnJheSk7XG5cdH0pO1xuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIE11bHRpcGxlIHRhYnMgdHJhY2tlZCBpbmRlcGVuZGVudGx5XG5cblx0dGVzdCgnY2xvc2luZyBvbmUgdGFiIGRvZXMgbm90IGFmZmVjdCBvdGhlcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXh0SG9zdCA9IGNyZWF0ZUV4dEhvc3RCcm93c2VycygpO1xuXHRcdGV4dEhvc3QuJG9uRGlkT3BlbkJyb3dzZXJUYWIoY3JlYXRlRHRvKHsgaWQ6ICdiMScsIHVybDogJ2h0dHBzOi8vb25lLmNvbScgfSkpO1xuXHRcdGV4dEhvc3QuJG9uRGlkT3BlbkJyb3dzZXJUYWIoY3JlYXRlRHRvKHsgaWQ6ICdiMicsIHVybDogJ2h0dHBzOi8vdHdvLmNvbScgfSkpO1xuXHRcdGV4dEhvc3QuJG9uRGlkT3BlbkJyb3dzZXJUYWIoY3JlYXRlRHRvKHsgaWQ6ICdiMycsIHVybDogJ2h0dHBzOi8vdGhyZWUuY29tJyB9KSk7XG5cblx0XHRleHRIb3N0LiRvbkRpZENsb3NlQnJvd3NlclRhYignYjInKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0LmJyb3dzZXJUYWJzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHRIb3N0LmJyb3dzZXJUYWJzLm1hcCh0ID0+IHQudXJsKSwgWydodHRwczovL29uZS5jb20nLCAnaHR0cHM6Ly90aHJlZS5jb20nXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nsb3NpbmcgYWN0aXZlIHRhYiBjbGVhcnMgYWN0aXZlQnJvd3NlclRhYicsICgpID0+IHtcblx0XHRjb25zdCBleHRIb3N0ID0gY3JlYXRlRXh0SG9zdEJyb3dzZXJzKCk7XG5cdFx0Y29uc3QgZHRvID0gY3JlYXRlRHRvKHsgaWQ6ICdiMScgfSk7XG5cdFx0ZXh0SG9zdC4kb25EaWRPcGVuQnJvd3NlclRhYihkdG8pO1xuXHRcdGV4dEhvc3QuJG9uRGlkQ2hhbmdlQWN0aXZlQnJvd3NlclRhYignYjEnKTtcblx0XHRhc3NlcnQub2soZXh0SG9zdC5hY3RpdmVCcm93c2VyVGFiKTtcblxuXHRcdGV4dEhvc3QuJG9uRGlkQ2xvc2VCcm93c2VyVGFiKCdiMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0LmFjdGl2ZUJyb3dzZXJUYWIsIHVu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
