import assert from "assert";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { mock } from "../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { SerializableObjectWithBuffers } from "../../../services/extensions/common/proxyIdentifier.js";
import { TestExtensionService, TestProductService } from "../../../test/common/workbenchTestServices.js";
import { MainThreadLanguageModels } from "../../browser/mainThreadLanguageModels.js";
import { SingleProxyRPCProtocol } from "../common/testRPCProtocol.js";
suite("MainThreadLanguageModels", function() {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("bridges onDidChangeLanguageModels to $onChatModelsChange when the model id set changes", async () => {
    const store = disposables.add(new DisposableStore());
    const onDidChangeLanguageModels = store.add(new Emitter());
    let onChatModelsChangeCount = 0;
    let modelIds = [];
    const proxy = {
      $onChatModelsChange: () => {
        onChatModelsChangeCount++;
      }
    };
    const languageModelsService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeLanguageModels = onDidChangeLanguageModels.event;
      }
      getLanguageModelIds() {
        return modelIds;
      }
    }();
    store.add(new MainThreadLanguageModels(
      SingleProxyRPCProtocol(proxy),
      languageModelsService,
      new NullLogService(),
      TestProductService,
      new class extends mock() {
      }(),
      new class extends mock() {
      }(),
      new TestExtensionService(),
      new class extends mock() {
      }()
    ));
    assert.strictEqual(onChatModelsChangeCount, 0);
    modelIds = ["vendor-a/model-1"];
    onDidChangeLanguageModels.fire("vendor-a");
    assert.strictEqual(onChatModelsChangeCount, 1);
    modelIds = ["vendor-a/model-1", "vendor-b/model-1"];
    onDidChangeLanguageModels.fire("vendor-b");
    assert.strictEqual(onChatModelsChangeCount, 2);
    modelIds = ["vendor-a/model-1"];
    onDidChangeLanguageModels.fire("vendor-b");
    assert.strictEqual(onChatModelsChangeCount, 3);
  });
  test("does not bridge metadata-only churn that keeps the model id set stable", async () => {
    const store = disposables.add(new DisposableStore());
    const onDidChangeLanguageModels = store.add(new Emitter());
    let onChatModelsChangeCount = 0;
    const modelIds = ["copilot/copilot-utility"];
    const proxy = {
      $onChatModelsChange: () => {
        onChatModelsChangeCount++;
      }
    };
    const languageModelsService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeLanguageModels = onDidChangeLanguageModels.event;
      }
      getLanguageModelIds() {
        return modelIds;
      }
    }();
    store.add(new MainThreadLanguageModels(
      SingleProxyRPCProtocol(proxy),
      languageModelsService,
      new NullLogService(),
      TestProductService,
      new class extends mock() {
      }(),
      new class extends mock() {
      }(),
      new TestExtensionService(),
      new class extends mock() {
      }()
    ));
    for (let i = 0; i < 10; i++) {
      onDidChangeLanguageModels.fire("copilot");
    }
    assert.strictEqual(onChatModelsChangeCount, 0);
  });
  test("defaults isBYOK in provideLanguageModelChatInfo for built-in and extension-contributed models", async () => {
    const store = disposables.add(new DisposableStore());
    let provider;
    const copilotExtensionId = TestProductService.defaultChatAgent?.chatExtensionId;
    const proxy = {
      $provideLanguageModelChatInfo: async () => [
        {
          identifier: "explicit-true",
          metadata: {
            extension: new ExtensionIdentifier("custom.explicit-true"),
            name: "explicit-true",
            id: "explicit-true",
            vendor: "test-vendor",
            version: "1",
            family: "test-family",
            maxInputTokens: 1,
            maxOutputTokens: 1,
            isDefaultForLocation: {},
            isBYOK: true
          }
        },
        {
          identifier: "explicit-false",
          metadata: {
            extension: new ExtensionIdentifier("custom.explicit-false"),
            name: "explicit-false",
            id: "explicit-false",
            vendor: "test-vendor",
            version: "1",
            family: "test-family",
            maxInputTokens: 1,
            maxOutputTokens: 1,
            isDefaultForLocation: {},
            isBYOK: false
          }
        },
        {
          identifier: "builtin-default",
          metadata: {
            extension: new ExtensionIdentifier(copilotExtensionId ?? "builtin.copilot"),
            name: "builtin-default",
            id: "builtin-default",
            vendor: "test-vendor",
            version: "1",
            family: "test-family",
            maxInputTokens: 1,
            maxOutputTokens: 1,
            isDefaultForLocation: {}
          }
        },
        {
          identifier: "external-default",
          metadata: {
            extension: new ExtensionIdentifier("custom.external"),
            name: "external-default",
            id: "external-default",
            vendor: "test-vendor",
            version: "1",
            family: "test-family",
            maxInputTokens: 1,
            maxOutputTokens: 1,
            isDefaultForLocation: {}
          }
        }
      ]
    };
    const languageModelsService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeLanguageModels = store.add(new Emitter()).event;
      }
      getLanguageModelIds() {
        return [];
      }
      registerLanguageModelProvider(_vendor, value) {
        provider = value;
        return Disposable.None;
      }
    }();
    const mainThread = store.add(new MainThreadLanguageModels(
      SingleProxyRPCProtocol(proxy),
      languageModelsService,
      new NullLogService(),
      TestProductService,
      new class extends mock() {
      }(),
      new class extends mock() {
      }(),
      new TestExtensionService(),
      new class extends mock() {
      }()
    ));
    mainThread.$registerLanguageModelProvider("test-vendor");
    const infos = await provider.provideLanguageModelChatInfo({ silent: true }, CancellationToken.None);
    assert.deepStrictEqual(infos.map((info) => ({ identifier: info.identifier, isBYOK: info.metadata.isBYOK })), [
      { identifier: "explicit-true", isBYOK: true },
      { identifier: "explicit-false", isBYOK: false },
      { identifier: "builtin-default", isBYOK: copilotExtensionId ? false : true },
      { identifier: "external-default", isBYOK: true }
    ]);
  });
  test("$cancelLanguageModelChatRequest cancels the token passed to $tryStartChatRequest", async () => {
    const store = disposables.add(new DisposableStore());
    let capturedToken;
    const languageModelsService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeLanguageModels = store.add(new Emitter()).event;
      }
      getLanguageModelIds() {
        return [];
      }
      sendChatRequest(_modelId, _from, _messages, _options, token) {
        capturedToken = token;
        return Promise.resolve({
          stream: (async function* () {
          })(),
          result: new Promise(() => {
          })
          // never resolves
        });
      }
    }();
    const mainThread = store.add(new MainThreadLanguageModels(
      SingleProxyRPCProtocol({}),
      languageModelsService,
      new NullLogService(),
      TestProductService,
      new class extends mock() {
      }(),
      new class extends mock() {
      }(),
      new TestExtensionService(),
      new class extends mock() {
      }()
    ));
    const requestId = 42;
    const cts = store.add(new CancellationTokenSource());
    await mainThread.$tryStartChatRequest(
      new ExtensionIdentifier("test.ext"),
      "model-1",
      requestId,
      new SerializableObjectWithBuffers([]),
      {},
      cts.token
    );
    assert.ok(capturedToken, "token should have been captured by sendChatRequest");
    assert.strictEqual(capturedToken.isCancellationRequested, false);
    mainThread.$cancelLanguageModelChatRequest(requestId);
    assert.strictEqual(capturedToken.isCancellationRequested, true);
  });
  test("$cancelLanguageModelChatRequest is a no-op for unknown requestId", () => {
    const store = disposables.add(new DisposableStore());
    const onDidChangeLanguageModels = store.add(new Emitter());
    const languageModelsService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeLanguageModels = onDidChangeLanguageModels.event;
      }
      getLanguageModelIds() {
        return [];
      }
    }();
    const mainThread = store.add(new MainThreadLanguageModels(
      SingleProxyRPCProtocol({}),
      languageModelsService,
      new NullLogService(),
      TestProductService,
      new class extends mock() {
      }(),
      new class extends mock() {
      }(),
      new TestExtensionService(),
      new class extends mock() {
      }()
    ));
    mainThread.$cancelLanguageModelChatRequest(999999);
  });
  test("disposes the provider request cancellation listener when the response completes", async () => {
    const store = disposables.add(new DisposableStore());
    let provider;
    let requestId;
    let cancelCount = 0;
    const proxy = {
      $startChatRequest: async (_modelId, id) => {
        requestId = id;
      },
      $cancelLanguageModelChatRequest: () => {
        cancelCount++;
      }
    };
    const languageModelsService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeLanguageModels = store.add(new Emitter()).event;
      }
      getLanguageModelIds() {
        return [];
      }
      registerLanguageModelProvider(_vendor, value) {
        provider = value;
        return Disposable.None;
      }
    }();
    const mainThread = store.add(new MainThreadLanguageModels(
      SingleProxyRPCProtocol(proxy),
      languageModelsService,
      new NullLogService(),
      TestProductService,
      new class extends mock() {
      }(),
      new class extends mock() {
      }(),
      new TestExtensionService(),
      new class extends mock() {
      }()
    ));
    mainThread.$registerLanguageModelProvider("test");
    const cts = store.add(new CancellationTokenSource());
    const response = await provider.sendChatRequest("model-1", [], void 0, {}, cts.token);
    await mainThread.$reportResponseDone(requestId, void 0);
    await response.result;
    cts.cancel();
    assert.strictEqual(cancelCount, 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcYnJvd3NlclxcbWFpblRocmVhZExhbmd1YWdlTW9kZWxzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vY29tbW9uL2F1dGhlbnRpY2F0aW9uLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9icm93c2VyL2F1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbElnbm9yZWRGaWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2lnbm9yZWRGaWxlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlciwgSUxhbmd1YWdlTW9kZWxzU2VydmljZSwgSUNoYXRNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL3Byb3h5SWRlbnRpZmllci5qcyc7XG5pbXBvcnQgeyBUZXN0RXh0ZW5zaW9uU2VydmljZSwgVGVzdFByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWRMYW5ndWFnZU1vZGVscyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbWFpblRocmVhZExhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RMYW5ndWFnZU1vZGVsc1NoYXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgU2luZ2xlUHJveHlSUENQcm90b2NvbCB9IGZyb20gJy4uL2NvbW1vbi90ZXN0UlBDUHJvdG9jb2wuanMnO1xuXG5zdWl0ZSgnTWFpblRocmVhZExhbmd1YWdlTW9kZWxzJywgZnVuY3Rpb24gKCkge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnYnJpZGdlcyBvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzIHRvICRvbkNoYXRNb2RlbHNDaGFuZ2Ugd2hlbiB0aGUgbW9kZWwgaWQgc2V0IGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCBvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0bGV0IG9uQ2hhdE1vZGVsc0NoYW5nZUNvdW50ID0gMDtcblx0XHRsZXQgbW9kZWxJZHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcHJveHk6IFBhcnRpYWw8RXh0SG9zdExhbmd1YWdlTW9kZWxzU2hhcGU+ID0ge1xuXHRcdFx0JG9uQ2hhdE1vZGVsc0NoYW5nZTogKCkgPT4geyBvbkNoYXRNb2RlbHNDaGFuZ2VDb3VudCsrOyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMgPSBvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzLmV2ZW50O1xuXHRcdFx0b3ZlcnJpZGUgZ2V0TGFuZ3VhZ2VNb2RlbElkcygpOiBzdHJpbmdbXSB7IHJldHVybiBtb2RlbElkczsgfVxuXHRcdH07XG5cblx0XHRzdG9yZS5hZGQobmV3IE1haW5UaHJlYWRMYW5ndWFnZU1vZGVscyhcblx0XHRcdFNpbmdsZVByb3h5UlBDUHJvdG9jb2wocHJveHkpLFxuXHRcdFx0bGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRUZXN0UHJvZHVjdFNlcnZpY2UsXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBdXRoZW50aWNhdGlvblNlcnZpY2U+KCkgeyB9LFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlPigpIHsgfSxcblx0XHRcdG5ldyBUZXN0RXh0ZW5zaW9uU2VydmljZSgpLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTGFuZ3VhZ2VNb2RlbElnbm9yZWRGaWxlc1NlcnZpY2U+KCkgeyB9LFxuXHRcdCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9uQ2hhdE1vZGVsc0NoYW5nZUNvdW50LCAwKTtcblxuXHRcdC8vIE5ldyBtb2RlbCBpZGVudGlmaWVyIGFwcGVhcnMgLT4gYnJpZGdlZFxuXHRcdG1vZGVsSWRzID0gWyd2ZW5kb3ItYS9tb2RlbC0xJ107XG5cdFx0b25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscy5maXJlKCd2ZW5kb3ItYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvbkNoYXRNb2RlbHNDaGFuZ2VDb3VudCwgMSk7XG5cblx0XHQvLyBBbm90aGVyIG5ldyBpZGVudGlmaWVyIGFwcGVhcnMgLT4gYnJpZGdlZFxuXHRcdG1vZGVsSWRzID0gWyd2ZW5kb3ItYS9tb2RlbC0xJywgJ3ZlbmRvci1iL21vZGVsLTEnXTtcblx0XHRvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzLmZpcmUoJ3ZlbmRvci1iJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9uQ2hhdE1vZGVsc0NoYW5nZUNvdW50LCAyKTtcblxuXHRcdC8vIElkZW50aWZpZXIgcmVtb3ZlZCAtPiBicmlkZ2VkXG5cdFx0bW9kZWxJZHMgPSBbJ3ZlbmRvci1hL21vZGVsLTEnXTtcblx0XHRvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzLmZpcmUoJ3ZlbmRvci1iJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9uQ2hhdE1vZGVsc0NoYW5nZUNvdW50LCAzKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgYnJpZGdlIG1ldGFkYXRhLW9ubHkgY2h1cm4gdGhhdCBrZWVwcyB0aGUgbW9kZWwgaWQgc2V0IHN0YWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRsZXQgb25DaGF0TW9kZWxzQ2hhbmdlQ291bnQgPSAwO1xuXHRcdC8vIFNhbWUgaWRlbnRpZmllciBzZXQgdGhyb3VnaG91dDogb25seSBtZXRhZGF0YSAoZS5nLiBiYXNlQ291bnQpIGNoYW5nZXMgYmV0d2VlbiBmaXJlcy5cblx0XHRjb25zdCBtb2RlbElkcyA9IFsnY29waWxvdC9jb3BpbG90LXV0aWxpdHknXTtcblx0XHRjb25zdCBwcm94eTogUGFydGlhbDxFeHRIb3N0TGFuZ3VhZ2VNb2RlbHNTaGFwZT4gPSB7XG5cdFx0XHQkb25DaGF0TW9kZWxzQ2hhbmdlOiAoKSA9PiB7IG9uQ2hhdE1vZGVsc0NoYW5nZUNvdW50Kys7IH0sXG5cdFx0fTtcblx0XHRjb25zdCBsYW5ndWFnZU1vZGVsc1NlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElMYW5ndWFnZU1vZGVsc1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscyA9IG9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMuZXZlbnQ7XG5cdFx0XHRvdmVycmlkZSBnZXRMYW5ndWFnZU1vZGVsSWRzKCk6IHN0cmluZ1tdIHsgcmV0dXJuIG1vZGVsSWRzOyB9XG5cdFx0fTtcblxuXHRcdHN0b3JlLmFkZChuZXcgTWFpblRocmVhZExhbmd1YWdlTW9kZWxzKFxuXHRcdFx0U2luZ2xlUHJveHlSUENQcm90b2NvbChwcm94eSksXG5cdFx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdFRlc3RQcm9kdWN0U2VydmljZSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUF1dGhlbnRpY2F0aW9uU2VydmljZT4oKSB7IH0sXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2U+KCkgeyB9LFxuXHRcdFx0bmV3IFRlc3RFeHRlbnNpb25TZXJ2aWNlKCksXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElMYW5ndWFnZU1vZGVsSWdub3JlZEZpbGVzU2VydmljZT4oKSB7IH0sXG5cdFx0KSk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwOyBpKyspIHtcblx0XHRcdG9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMuZmlyZSgnY29waWxvdCcpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvbkNoYXRNb2RlbHNDaGFuZ2VDb3VudCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlZmF1bHRzIGlzQllPSyBpbiBwcm92aWRlTGFuZ3VhZ2VNb2RlbENoYXRJbmZvIGZvciBidWlsdC1pbiBhbmQgZXh0ZW5zaW9uLWNvbnRyaWJ1dGVkIG1vZGVscycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGxldCBwcm92aWRlcjogSUxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXIgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY29waWxvdEV4dGVuc2lvbklkID0gVGVzdFByb2R1Y3RTZXJ2aWNlLmRlZmF1bHRDaGF0QWdlbnQ/LmNoYXRFeHRlbnNpb25JZDtcblx0XHRjb25zdCBwcm94eTogUGFydGlhbDxFeHRIb3N0TGFuZ3VhZ2VNb2RlbHNTaGFwZT4gPSB7XG5cdFx0XHQkcHJvdmlkZUxhbmd1YWdlTW9kZWxDaGF0SW5mbzogYXN5bmMgKCkgPT4gKFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkZW50aWZpZXI6ICdleHBsaWNpdC10cnVlJyxcblx0XHRcdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcignY3VzdG9tLmV4cGxpY2l0LXRydWUnKSxcblx0XHRcdFx0XHRcdG5hbWU6ICdleHBsaWNpdC10cnVlJyxcblx0XHRcdFx0XHRcdGlkOiAnZXhwbGljaXQtdHJ1ZScsXG5cdFx0XHRcdFx0XHR2ZW5kb3I6ICd0ZXN0LXZlbmRvcicsXG5cdFx0XHRcdFx0XHR2ZXJzaW9uOiAnMScsXG5cdFx0XHRcdFx0XHRmYW1pbHk6ICd0ZXN0LWZhbWlseScsXG5cdFx0XHRcdFx0XHRtYXhJbnB1dFRva2VuczogMSxcblx0XHRcdFx0XHRcdG1heE91dHB1dFRva2VuczogMSxcblx0XHRcdFx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fSxcblx0XHRcdFx0XHRcdGlzQllPSzogdHJ1ZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkZW50aWZpZXI6ICdleHBsaWNpdC1mYWxzZScsXG5cdFx0XHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2N1c3RvbS5leHBsaWNpdC1mYWxzZScpLFxuXHRcdFx0XHRcdFx0bmFtZTogJ2V4cGxpY2l0LWZhbHNlJyxcblx0XHRcdFx0XHRcdGlkOiAnZXhwbGljaXQtZmFsc2UnLFxuXHRcdFx0XHRcdFx0dmVuZG9yOiAndGVzdC12ZW5kb3InLFxuXHRcdFx0XHRcdFx0dmVyc2lvbjogJzEnLFxuXHRcdFx0XHRcdFx0ZmFtaWx5OiAndGVzdC1mYW1pbHknLFxuXHRcdFx0XHRcdFx0bWF4SW5wdXRUb2tlbnM6IDEsXG5cdFx0XHRcdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDEsXG5cdFx0XHRcdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge30sXG5cdFx0XHRcdFx0XHRpc0JZT0s6IGZhbHNlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWRlbnRpZmllcjogJ2J1aWx0aW4tZGVmYXVsdCcsXG5cdFx0XHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoY29waWxvdEV4dGVuc2lvbklkID8/ICdidWlsdGluLmNvcGlsb3QnKSxcblx0XHRcdFx0XHRcdG5hbWU6ICdidWlsdGluLWRlZmF1bHQnLFxuXHRcdFx0XHRcdFx0aWQ6ICdidWlsdGluLWRlZmF1bHQnLFxuXHRcdFx0XHRcdFx0dmVuZG9yOiAndGVzdC12ZW5kb3InLFxuXHRcdFx0XHRcdFx0dmVyc2lvbjogJzEnLFxuXHRcdFx0XHRcdFx0ZmFtaWx5OiAndGVzdC1mYW1pbHknLFxuXHRcdFx0XHRcdFx0bWF4SW5wdXRUb2tlbnM6IDEsXG5cdFx0XHRcdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDEsXG5cdFx0XHRcdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge31cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZGVudGlmaWVyOiAnZXh0ZXJuYWwtZGVmYXVsdCcsXG5cdFx0XHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2N1c3RvbS5leHRlcm5hbCcpLFxuXHRcdFx0XHRcdFx0bmFtZTogJ2V4dGVybmFsLWRlZmF1bHQnLFxuXHRcdFx0XHRcdFx0aWQ6ICdleHRlcm5hbC1kZWZhdWx0Jyxcblx0XHRcdFx0XHRcdHZlbmRvcjogJ3Rlc3QtdmVuZG9yJyxcblx0XHRcdFx0XHRcdHZlcnNpb246ICcxJyxcblx0XHRcdFx0XHRcdGZhbWlseTogJ3Rlc3QtZmFtaWx5Jyxcblx0XHRcdFx0XHRcdG1heElucHV0VG9rZW5zOiAxLFxuXHRcdFx0XHRcdFx0bWF4T3V0cHV0VG9rZW5zOiAxLFxuXHRcdFx0XHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRdKSxcblx0XHR9O1xuXHRcdGNvbnN0IGxhbmd1YWdlTW9kZWxzU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxhbmd1YWdlTW9kZWxzU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSkuZXZlbnQ7XG5cdFx0XHRvdmVycmlkZSBnZXRMYW5ndWFnZU1vZGVsSWRzKCk6IHN0cmluZ1tdIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHRvdmVycmlkZSByZWdpc3Rlckxhbmd1YWdlTW9kZWxQcm92aWRlcihfdmVuZG9yOiBzdHJpbmcsIHZhbHVlOiBJTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlcikge1xuXHRcdFx0XHRwcm92aWRlciA9IHZhbHVlO1xuXHRcdFx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBtYWluVGhyZWFkID0gc3RvcmUuYWRkKG5ldyBNYWluVGhyZWFkTGFuZ3VhZ2VNb2RlbHMoXG5cdFx0XHRTaW5nbGVQcm94eVJQQ1Byb3RvY29sKHByb3h5KSxcblx0XHRcdGxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0VGVzdFByb2R1Y3RTZXJ2aWNlLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQXV0aGVudGljYXRpb25TZXJ2aWNlPigpIHsgfSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZT4oKSB7IH0sXG5cdFx0XHRuZXcgVGVzdEV4dGVuc2lvblNlcnZpY2UoKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxhbmd1YWdlTW9kZWxJZ25vcmVkRmlsZXNTZXJ2aWNlPigpIHsgfSxcblx0XHQpKTtcblx0XHRtYWluVGhyZWFkLiRyZWdpc3Rlckxhbmd1YWdlTW9kZWxQcm92aWRlcigndGVzdC12ZW5kb3InKTtcblxuXHRcdGNvbnN0IGluZm9zID0gYXdhaXQgcHJvdmlkZXIhLnByb3ZpZGVMYW5ndWFnZU1vZGVsQ2hhdEluZm8oeyBzaWxlbnQ6IHRydWUgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpbmZvcy5tYXAoaW5mbyA9PiAoeyBpZGVudGlmaWVyOiBpbmZvLmlkZW50aWZpZXIsIGlzQllPSzogaW5mby5tZXRhZGF0YS5pc0JZT0sgfSkpLCBbXG5cdFx0XHR7IGlkZW50aWZpZXI6ICdleHBsaWNpdC10cnVlJywgaXNCWU9LOiB0cnVlIH0sXG5cdFx0XHR7IGlkZW50aWZpZXI6ICdleHBsaWNpdC1mYWxzZScsIGlzQllPSzogZmFsc2UgfSxcblx0XHRcdHsgaWRlbnRpZmllcjogJ2J1aWx0aW4tZGVmYXVsdCcsIGlzQllPSzogY29waWxvdEV4dGVuc2lvbklkID8gZmFsc2UgOiB0cnVlIH0sXG5cdFx0XHR7IGlkZW50aWZpZXI6ICdleHRlcm5hbC1kZWZhdWx0JywgaXNCWU9LOiB0cnVlIH1cblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnJGNhbmNlbExhbmd1YWdlTW9kZWxDaGF0UmVxdWVzdCBjYW5jZWxzIHRoZSB0b2tlbiBwYXNzZWQgdG8gJHRyeVN0YXJ0Q2hhdFJlcXVlc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRsZXQgY2FwdHVyZWRUb2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBsYW5ndWFnZU1vZGVsc1NlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElMYW5ndWFnZU1vZGVsc1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscyA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpLmV2ZW50O1xuXHRcdFx0b3ZlcnJpZGUgZ2V0TGFuZ3VhZ2VNb2RlbElkcygpOiBzdHJpbmdbXSB7IHJldHVybiBbXTsgfVxuXHRcdFx0b3ZlcnJpZGUgc2VuZENoYXRSZXF1ZXN0KF9tb2RlbElkOiBzdHJpbmcsIF9mcm9tOiBFeHRlbnNpb25JZGVudGlmaWVyLCBfbWVzc2FnZXM6IElDaGF0TWVzc2FnZVtdLCBfb3B0aW9uczogdW5rbm93biwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0XHRcdGNhcHR1cmVkVG9rZW4gPSB0b2tlbjtcblx0XHRcdFx0Ly8gUmV0dXJuIGEgcmVzcG9uc2UgdGhhdCBuZXZlciByZXNvbHZlcyBzbyB0aGUgQ1RTIHN0YXlzIGFsaXZlLlxuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcblx0XHRcdFx0XHRzdHJlYW06IChhc3luYyBmdW5jdGlvbiogKCkgeyB9KSgpLFxuXHRcdFx0XHRcdHJlc3VsdDogbmV3IFByb21pc2U8dm9pZD4oKCkgPT4geyB9KSAvLyBuZXZlciByZXNvbHZlc1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgbWFpblRocmVhZCA9IHN0b3JlLmFkZChuZXcgTWFpblRocmVhZExhbmd1YWdlTW9kZWxzKFxuXHRcdFx0U2luZ2xlUHJveHlSUENQcm90b2NvbCh7fSksXG5cdFx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdFRlc3RQcm9kdWN0U2VydmljZSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUF1dGhlbnRpY2F0aW9uU2VydmljZT4oKSB7IH0sXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2U+KCkgeyB9LFxuXHRcdFx0bmV3IFRlc3RFeHRlbnNpb25TZXJ2aWNlKCksXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElMYW5ndWFnZU1vZGVsSWdub3JlZEZpbGVzU2VydmljZT4oKSB7IH0sXG5cdFx0KSk7XG5cblx0XHRjb25zdCByZXF1ZXN0SWQgPSA0Mjtcblx0XHRjb25zdCBjdHMgPSBzdG9yZS5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXG5cdFx0YXdhaXQgbWFpblRocmVhZC4kdHJ5U3RhcnRDaGF0UmVxdWVzdChcblx0XHRcdG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0LmV4dCcpLFxuXHRcdFx0J21vZGVsLTEnLFxuXHRcdFx0cmVxdWVzdElkLFxuXHRcdFx0bmV3IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzPElDaGF0TWVzc2FnZVtdPihbXSksXG5cdFx0XHR7fSxcblx0XHRcdGN0cy50b2tlblxuXHRcdCk7XG5cblx0XHRhc3NlcnQub2soY2FwdHVyZWRUb2tlbiwgJ3Rva2VuIHNob3VsZCBoYXZlIGJlZW4gY2FwdHVyZWQgYnkgc2VuZENoYXRSZXF1ZXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcHR1cmVkVG9rZW4hLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkLCBmYWxzZSk7XG5cblx0XHRtYWluVGhyZWFkLiRjYW5jZWxMYW5ndWFnZU1vZGVsQ2hhdFJlcXVlc3QocmVxdWVzdElkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXB0dXJlZFRva2VuIS5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJyRjYW5jZWxMYW5ndWFnZU1vZGVsQ2hhdFJlcXVlc3QgaXMgYSBuby1vcCBmb3IgdW5rbm93biByZXF1ZXN0SWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCBvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMgPSBvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzLmV2ZW50O1xuXHRcdFx0b3ZlcnJpZGUgZ2V0TGFuZ3VhZ2VNb2RlbElkcygpOiBzdHJpbmdbXSB7IHJldHVybiBbXTsgfVxuXHRcdH07XG5cblx0XHRjb25zdCBtYWluVGhyZWFkID0gc3RvcmUuYWRkKG5ldyBNYWluVGhyZWFkTGFuZ3VhZ2VNb2RlbHMoXG5cdFx0XHRTaW5nbGVQcm94eVJQQ1Byb3RvY29sKHt9KSxcblx0XHRcdGxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0VGVzdFByb2R1Y3RTZXJ2aWNlLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQXV0aGVudGljYXRpb25TZXJ2aWNlPigpIHsgfSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZT4oKSB7IH0sXG5cdFx0XHRuZXcgVGVzdEV4dGVuc2lvblNlcnZpY2UoKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxhbmd1YWdlTW9kZWxJZ25vcmVkRmlsZXNTZXJ2aWNlPigpIHsgfSxcblx0XHQpKTtcblxuXHRcdC8vIFNob3VsZCBub3QgdGhyb3dcblx0XHRtYWluVGhyZWFkLiRjYW5jZWxMYW5ndWFnZU1vZGVsQ2hhdFJlcXVlc3QoOTk5OTk5KTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zZXMgdGhlIHByb3ZpZGVyIHJlcXVlc3QgY2FuY2VsbGF0aW9uIGxpc3RlbmVyIHdoZW4gdGhlIHJlc3BvbnNlIGNvbXBsZXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGxldCBwcm92aWRlcjogSUxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXIgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHJlcXVlc3RJZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBjYW5jZWxDb3VudCA9IDA7XG5cdFx0Y29uc3QgcHJveHk6IFBhcnRpYWw8RXh0SG9zdExhbmd1YWdlTW9kZWxzU2hhcGU+ID0ge1xuXHRcdFx0JHN0YXJ0Q2hhdFJlcXVlc3Q6IGFzeW5jIChfbW9kZWxJZCwgaWQpID0+IHtcblx0XHRcdFx0cmVxdWVzdElkID0gaWQ7XG5cdFx0XHR9LFxuXHRcdFx0JGNhbmNlbExhbmd1YWdlTW9kZWxDaGF0UmVxdWVzdDogKCkgPT4ge1xuXHRcdFx0XHRjYW5jZWxDb3VudCsrO1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IGxhbmd1YWdlTW9kZWxzU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxhbmd1YWdlTW9kZWxzU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSkuZXZlbnQ7XG5cdFx0XHRvdmVycmlkZSBnZXRMYW5ndWFnZU1vZGVsSWRzKCk6IHN0cmluZ1tdIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHRvdmVycmlkZSByZWdpc3Rlckxhbmd1YWdlTW9kZWxQcm92aWRlcihfdmVuZG9yOiBzdHJpbmcsIHZhbHVlOiBJTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlcikge1xuXHRcdFx0XHRwcm92aWRlciA9IHZhbHVlO1xuXHRcdFx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBtYWluVGhyZWFkID0gc3RvcmUuYWRkKG5ldyBNYWluVGhyZWFkTGFuZ3VhZ2VNb2RlbHMoXG5cdFx0XHRTaW5nbGVQcm94eVJQQ1Byb3RvY29sKHByb3h5KSxcblx0XHRcdGxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0VGVzdFByb2R1Y3RTZXJ2aWNlLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQXV0aGVudGljYXRpb25TZXJ2aWNlPigpIHsgfSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZT4oKSB7IH0sXG5cdFx0XHRuZXcgVGVzdEV4dGVuc2lvblNlcnZpY2UoKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxhbmd1YWdlTW9kZWxJZ25vcmVkRmlsZXNTZXJ2aWNlPigpIHsgfSxcblx0XHQpKTtcblx0XHRtYWluVGhyZWFkLiRyZWdpc3Rlckxhbmd1YWdlTW9kZWxQcm92aWRlcigndGVzdCcpO1xuXG5cdFx0Y29uc3QgY3RzID0gc3RvcmUuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHByb3ZpZGVyIS5zZW5kQ2hhdFJlcXVlc3QoJ21vZGVsLTEnLCBbXSwgdW5kZWZpbmVkLCB7fSwgY3RzLnRva2VuKTtcblx0XHRhd2FpdCBtYWluVGhyZWFkLiRyZXBvcnRSZXNwb25zZURvbmUocmVxdWVzdElkISwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCByZXNwb25zZS5yZXN1bHQ7XG5cdFx0Y3RzLmNhbmNlbCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbmNlbENvdW50LCAwKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBSy9CLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsc0JBQXNCLDBCQUEwQjtBQUN6RCxTQUFTLGdDQUFnQztBQUV6QyxTQUFTLDhCQUE4QjtBQUV2QyxNQUFNLDRCQUE0QixXQUFZO0FBRTdDLFFBQU0sY0FBYyx3Q0FBd0M7QUFFNUQsT0FBSywwRkFBMEYsWUFBWTtBQUMxRyxVQUFNLFFBQVEsWUFBWSxJQUFJLElBQUksZ0JBQWdCLENBQUM7QUFDbkQsVUFBTSw0QkFBNEIsTUFBTSxJQUFJLElBQUksUUFBZ0IsQ0FBQztBQUNqRSxRQUFJLDBCQUEwQjtBQUM5QixRQUFJLFdBQXFCLENBQUM7QUFDMUIsVUFBTSxRQUE2QztBQUFBLE1BQ2xELHFCQUFxQixNQUFNO0FBQUU7QUFBQSxNQUEyQjtBQUFBLElBQ3pEO0FBQ0EsVUFBTSx3QkFBd0IsSUFBSSxjQUFjLEtBQTZCLEVBQUU7QUFBQSxNQUE3QztBQUFBO0FBQ2pDLGFBQWtCLDRCQUE0QiwwQkFBMEI7QUFBQTtBQUFBLE1BQy9ELHNCQUFnQztBQUFFLGVBQU87QUFBQSxNQUFVO0FBQUEsSUFDN0Q7QUFFQSxVQUFNLElBQUksSUFBSTtBQUFBLE1BQ2IsdUJBQXVCLEtBQUs7QUFBQSxNQUM1QjtBQUFBLE1BQ0EsSUFB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
