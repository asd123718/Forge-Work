import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../base/test/common/utils.js";
import { NativeWindow } from "../../electron-browser/window.js";
import { ITunnelService } from "../../../platform/tunnel/common/tunnel.js";
import { URI } from "../../../base/common/uri.js";
import { workbenchInstantiationService } from "./workbenchTestServices.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
class TunnelMock {
  constructor() {
    this.assignedPorts = {};
    this.expectedDispose = false;
  }
  reset(ports) {
    this.assignedPorts = ports;
  }
  expectDispose() {
    this.expectedDispose = true;
  }
  getExistingTunnel() {
    return Promise.resolve(void 0);
  }
  openTunnel(_addressProvider, _host, port) {
    if (!this.assignedPorts[port]) {
      return Promise.reject(new Error("Unexpected tunnel request"));
    }
    const res = {
      localAddress: `localhost:${this.assignedPorts[port]}`,
      tunnelRemoteHost: "4.3.2.1",
      tunnelRemotePort: this.assignedPorts[port],
      privacy: "",
      dispose: () => {
        assert(this.expectedDispose, "Unexpected dispose");
        this.expectedDispose = false;
        return Promise.resolve();
      }
    };
    delete this.assignedPorts[port];
    return Promise.resolve(res);
  }
  validate() {
    try {
      assert(Object.keys(this.assignedPorts).length === 0, "Expected tunnel to be used");
      assert(!this.expectedDispose, "Expected dispose to be called");
    } finally {
      this.expectedDispose = false;
    }
  }
}
class TestNativeWindow extends NativeWindow {
  create() {
  }
  registerListeners() {
  }
  enableMultiWindowAwareTimeout() {
  }
}
suite.skip("NativeWindow:resolveExternal", () => {
  const disposables = new DisposableStore();
  const tunnelMock = new TunnelMock();
  let window;
  setup(() => {
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    instantiationService.stub(ITunnelService, tunnelMock);
    window = disposables.add(instantiationService.createInstance(TestNativeWindow));
  });
  teardown(() => {
    disposables.clear();
  });
  async function doTest(uri, ports = {}, expectedUri) {
    tunnelMock.reset(ports);
    const res = await window.resolveExternalUri(URI.parse(uri), {
      allowTunneling: true,
      openExternal: true
    });
    assert.strictEqual(!expectedUri, !res, `Expected URI ${expectedUri} but got ${res}`);
    if (expectedUri && res) {
      assert.strictEqual(res.resolved.toString(), URI.parse(expectedUri).toString());
    }
    tunnelMock.validate();
  }
  test("invalid", async () => {
    await doTest("file:///foo.bar/baz");
    await doTest("http://foo.bar/path");
  });
  test("simple", async () => {
    await doTest("http://localhost:1234/path", { 1234: 1234 }, "http://localhost:1234/path");
  });
  test("all interfaces", async () => {
    await doTest("http://0.0.0.0:1234/path", { 1234: 1234 }, "http://localhost:1234/path");
  });
  test("changed port", async () => {
    await doTest("http://localhost:1234/path", { 1234: 1235 }, "http://localhost:1235/path");
  });
  test("query", async () => {
    await doTest("http://foo.bar/path?a=b&c=http%3a%2f%2flocalhost%3a4455", { 4455: 4455 }, "http://foo.bar/path?a=b&c=http%3a%2f%2flocalhost%3a4455");
  });
  test("query with different port", async () => {
    tunnelMock.expectDispose();
    await doTest("http://foo.bar/path?a=b&c=http%3a%2f%2flocalhost%3a4455", { 4455: 4567 });
  });
  test("both url and query", async () => {
    await doTest(
      "http://localhost:1234/path?a=b&c=http%3a%2f%2flocalhost%3a4455",
      { 1234: 4321, 4455: 4455 },
      "http://localhost:4321/path?a=b&c=http%3a%2f%2flocalhost%3a4455"
    );
  });
  test("both url and query, query rejected", async () => {
    tunnelMock.expectDispose();
    await doTest(
      "http://localhost:1234/path?a=b&c=http%3a%2f%2flocalhost%3a4455",
      { 1234: 4321, 4455: 5544 },
      "http://localhost:4321/path?a=b&c=http%3a%2f%2flocalhost%3a4455"
    );
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGVsZWN0cm9uLWJyb3dzZXJcXHJlc29sdmVFeHRlcm5hbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTmF0aXZlV2luZG93IH0gZnJvbSAnLi4vLi4vZWxlY3Ryb24tYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgSVR1bm5lbFNlcnZpY2UsIFJlbW90ZVR1bm5lbCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3R1bm5lbC9jb21tb24vdHVubmVsLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJQWRkcmVzc1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudENvbm5lY3Rpb24uanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuXG50eXBlIFBvcnRNYXAgPSBSZWNvcmQ8bnVtYmVyLCBudW1iZXI+O1xuXG5jbGFzcyBUdW5uZWxNb2NrIGltcGxlbWVudHMgUGFydGlhbDxJVHVubmVsU2VydmljZT4ge1xuXHRwcml2YXRlIGFzc2lnbmVkUG9ydHM6IFBvcnRNYXAgPSB7fTtcblx0cHJpdmF0ZSBleHBlY3RlZERpc3Bvc2UgPSBmYWxzZTtcblxuXHRyZXNldChwb3J0czogUG9ydE1hcCkge1xuXHRcdHRoaXMuYXNzaWduZWRQb3J0cyA9IHBvcnRzO1xuXHR9XG5cblx0ZXhwZWN0RGlzcG9zZSgpIHtcblx0XHR0aGlzLmV4cGVjdGVkRGlzcG9zZSA9IHRydWU7XG5cdH1cblxuXHRnZXRFeGlzdGluZ1R1bm5lbCgpOiBQcm9taXNlPHN0cmluZyB8IFJlbW90ZVR1bm5lbCB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdG9wZW5UdW5uZWwoX2FkZHJlc3NQcm92aWRlcjogSUFkZHJlc3NQcm92aWRlciB8IHVuZGVmaW5lZCwgX2hvc3Q6IHN0cmluZyB8IHVuZGVmaW5lZCwgcG9ydDogbnVtYmVyKTogUHJvbWlzZTxSZW1vdGVUdW5uZWwgfCBzdHJpbmcgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuYXNzaWduZWRQb3J0c1twb3J0XSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignVW5leHBlY3RlZCB0dW5uZWwgcmVxdWVzdCcpKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzOiBSZW1vdGVUdW5uZWwgPSB7XG5cdFx0XHRsb2NhbEFkZHJlc3M6IGBsb2NhbGhvc3Q6JHt0aGlzLmFzc2lnbmVkUG9ydHNbcG9ydF19YCxcblx0XHRcdHR1bm5lbFJlbW90ZUhvc3Q6ICc0LjMuMi4xJyxcblx0XHRcdHR1bm5lbFJlbW90ZVBvcnQ6IHRoaXMuYXNzaWduZWRQb3J0c1twb3J0XSxcblx0XHRcdHByaXZhY3k6ICcnLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQodGhpcy5leHBlY3RlZERpc3Bvc2UsICdVbmV4cGVjdGVkIGRpc3Bvc2UnKTtcblx0XHRcdFx0dGhpcy5leHBlY3RlZERpc3Bvc2UgPSBmYWxzZTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0ZGVsZXRlIHRoaXMuYXNzaWduZWRQb3J0c1twb3J0XTtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlcyk7XG5cdH1cblxuXHR2YWxpZGF0ZSgpIHtcblx0XHR0cnkge1xuXHRcdFx0YXNzZXJ0KE9iamVjdC5rZXlzKHRoaXMuYXNzaWduZWRQb3J0cykubGVuZ3RoID09PSAwLCAnRXhwZWN0ZWQgdHVubmVsIHRvIGJlIHVzZWQnKTtcblx0XHRcdGFzc2VydCghdGhpcy5leHBlY3RlZERpc3Bvc2UsICdFeHBlY3RlZCBkaXNwb3NlIHRvIGJlIGNhbGxlZCcpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLmV4cGVjdGVkRGlzcG9zZSA9IGZhbHNlO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBUZXN0TmF0aXZlV2luZG93IGV4dGVuZHMgTmF0aXZlV2luZG93IHtcblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNyZWF0ZSgpOiB2b2lkIHsgfVxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7IH1cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGVuYWJsZU11bHRpV2luZG93QXdhcmVUaW1lb3V0KCk6IHZvaWQgeyB9XG59XG5cbnN1aXRlLnNraXAoJ05hdGl2ZVdpbmRvdzpyZXNvbHZlRXh0ZXJuYWwnLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRjb25zdCB0dW5uZWxNb2NrID0gbmV3IFR1bm5lbE1vY2soKTtcblx0bGV0IHdpbmRvdzogVGVzdE5hdGl2ZVdpbmRvdztcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSA9IDxUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U+d29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBkaXNwb3NhYmxlcyk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVHVubmVsU2VydmljZSwgdHVubmVsTW9jayk7XG5cdFx0d2luZG93ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3ROYXRpdmVXaW5kb3cpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIGRvVGVzdCh1cmk6IHN0cmluZywgcG9ydHM6IFBvcnRNYXAgPSB7fSwgZXhwZWN0ZWRVcmk/OiBzdHJpbmcpIHtcblx0XHR0dW5uZWxNb2NrLnJlc2V0KHBvcnRzKTtcblx0XHRjb25zdCByZXMgPSBhd2FpdCB3aW5kb3cucmVzb2x2ZUV4dGVybmFsVXJpKFVSSS5wYXJzZSh1cmkpLCB7XG5cdFx0XHRhbGxvd1R1bm5lbGluZzogdHJ1ZSxcblx0XHRcdG9wZW5FeHRlcm5hbDogdHJ1ZVxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCghZXhwZWN0ZWRVcmksICFyZXMsIGBFeHBlY3RlZCBVUkkgJHtleHBlY3RlZFVyaX0gYnV0IGdvdCAke3Jlc31gKTtcblx0XHRpZiAoZXhwZWN0ZWRVcmkgJiYgcmVzKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnJlc29sdmVkLnRvU3RyaW5nKCksIFVSSS5wYXJzZShleHBlY3RlZFVyaSkudG9TdHJpbmcoKSk7XG5cdFx0fVxuXHRcdHR1bm5lbE1vY2sudmFsaWRhdGUoKTtcblx0fVxuXG5cdHRlc3QoJ2ludmFsaWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZG9UZXN0KCdmaWxlOi8vL2Zvby5iYXIvYmF6Jyk7XG5cdFx0YXdhaXQgZG9UZXN0KCdodHRwOi8vZm9vLmJhci9wYXRoJyk7XG5cdH0pO1xuXHR0ZXN0KCdzaW1wbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZG9UZXN0KCdodHRwOi8vbG9jYWxob3N0OjEyMzQvcGF0aCcsIHsgMTIzNDogMTIzNCB9LCAnaHR0cDovL2xvY2FsaG9zdDoxMjM0L3BhdGgnKTtcblx0fSk7XG5cdHRlc3QoJ2FsbCBpbnRlcmZhY2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGRvVGVzdCgnaHR0cDovLzAuMC4wLjA6MTIzNC9wYXRoJywgeyAxMjM0OiAxMjM0IH0sICdodHRwOi8vbG9jYWxob3N0OjEyMzQvcGF0aCcpO1xuXHR9KTtcblx0dGVzdCgnY2hhbmdlZCBwb3J0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGRvVGVzdCgnaHR0cDovL2xvY2FsaG9zdDoxMjM0L3BhdGgnLCB7IDEyMzQ6IDEyMzUgfSwgJ2h0dHA6Ly9sb2NhbGhvc3Q6MTIzNS9wYXRoJyk7XG5cdH0pO1xuXHR0ZXN0KCdxdWVyeScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBkb1Rlc3QoJ2h0dHA6Ly9mb28uYmFyL3BhdGg/YT1iJmM9aHR0cCUzYSUyZiUyZmxvY2FsaG9zdCUzYTQ0NTUnLCB7IDQ0NTU6IDQ0NTUgfSwgJ2h0dHA6Ly9mb28uYmFyL3BhdGg/YT1iJmM9aHR0cCUzYSUyZiUyZmxvY2FsaG9zdCUzYTQ0NTUnKTtcblx0fSk7XG5cdHRlc3QoJ3F1ZXJ5IHdpdGggZGlmZmVyZW50IHBvcnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0dHVubmVsTW9jay5leHBlY3REaXNwb3NlKCk7XG5cdFx0YXdhaXQgZG9UZXN0KCdodHRwOi8vZm9vLmJhci9wYXRoP2E9YiZjPWh0dHAlM2ElMmYlMmZsb2NhbGhvc3QlM2E0NDU1JywgeyA0NDU1OiA0NTY3IH0pO1xuXHR9KTtcblx0dGVzdCgnYm90aCB1cmwgYW5kIHF1ZXJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGRvVGVzdCgnaHR0cDovL2xvY2FsaG9zdDoxMjM0L3BhdGg/YT1iJmM9aHR0cCUzYSUyZiUyZmxvY2FsaG9zdCUzYTQ0NTUnLFxuXHRcdFx0eyAxMjM0OiA0MzIxLCA0NDU1OiA0NDU1IH0sXG5cdFx0XHQnaHR0cDovL2xvY2FsaG9zdDo0MzIxL3BhdGg/YT1iJmM9aHR0cCUzYSUyZiUyZmxvY2FsaG9zdCUzYTQ0NTUnKTtcblx0fSk7XG5cdHRlc3QoJ2JvdGggdXJsIGFuZCBxdWVyeSwgcXVlcnkgcmVqZWN0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0dHVubmVsTW9jay5leHBlY3REaXNwb3NlKCk7XG5cdFx0YXdhaXQgZG9UZXN0KCdodHRwOi8vbG9jYWxob3N0OjEyMzQvcGF0aD9hPWImYz1odHRwJTNhJTJmJTJmbG9jYWxob3N0JTNhNDQ1NScsXG5cdFx0XHR7IDEyMzQ6IDQzMjEsIDQ0NTU6IDU1NDQgfSxcblx0XHRcdCdodHRwOi8vbG9jYWxob3N0OjQzMjEvcGF0aD9hPWImYz1odHRwJTNhJTJmJTJmbG9jYWxob3N0JTNhNDQ1NScpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEs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
