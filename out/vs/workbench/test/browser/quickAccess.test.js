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
import assert from "assert";
import { Registry } from "../../../platform/registry/common/platform.js";
import { Extensions } from "../../../platform/quickinput/common/quickAccess.js";
import { IQuickInputService } from "../../../platform/quickinput/common/quickInput.js";
import { TestServiceAccessor, workbenchInstantiationService, createEditorPart } from "./workbenchTestServices.js";
import { DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { timeout } from "../../../base/common/async.js";
import { PickerQuickAccessProvider } from "../../../platform/quickinput/browser/pickerQuickAccess.js";
import { URI } from "../../../base/common/uri.js";
import { IEditorGroupsService } from "../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../services/editor/common/editorService.js";
import { EditorService } from "../../services/editor/browser/editorService.js";
import { PickerEditorState } from "../../browser/quickaccess.js";
import { EditorsOrder } from "../../common/editor.js";
import { Range } from "../../../editor/common/core/range.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../base/test/common/utils.js";
import { IContextKeyService, ContextKeyExpr } from "../../../platform/contextkey/common/contextkey.js";
import { ContextKeyService } from "../../../platform/contextkey/browser/contextKeyService.js";
import { TestConfigurationService } from "../../../platform/configuration/test/common/testConfigurationService.js";
suite("QuickAccess", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let accessor;
  let providerDefaultCalled = false;
  let providerDefaultCanceled = false;
  let providerDefaultDisposed = false;
  let provider1Called = false;
  let provider1Canceled = false;
  let provider1Disposed = false;
  let provider2Called = false;
  let provider2Canceled = false;
  let provider2Disposed = false;
  let provider3Called = false;
  let provider3Canceled = false;
  let provider3Disposed = false;
  let TestProviderDefault = class {
    constructor(quickInputService, disposables2) {
      this.quickInputService = quickInputService;
    }
    provide(picker, token) {
      assert.ok(picker);
      providerDefaultCalled = true;
      const store = new DisposableStore();
      store.add(toDisposable(() => providerDefaultDisposed = true));
      store.add(token.onCancellationRequested(() => providerDefaultCanceled = true));
      setTimeout(() => this.quickInputService.quickAccess.show(providerDescriptor3.prefix));
      return store;
    }
  };
  TestProviderDefault = __decorateClass([
    __decorateParam(0, IQuickInputService)
  ], TestProviderDefault);
  class TestProvider1 {
    provide(picker, token) {
      assert.ok(picker);
      provider1Called = true;
      const store = new DisposableStore();
      store.add(token.onCancellationRequested(() => provider1Canceled = true));
      store.add(toDisposable(() => provider1Disposed = true));
      return store;
    }
  }
  class TestProvider2 {
    provide(picker, token) {
      assert.ok(picker);
      provider2Called = true;
      const store = new DisposableStore();
      store.add(token.onCancellationRequested(() => provider2Canceled = true));
      store.add(toDisposable(() => provider2Disposed = true));
      return store;
    }
  }
  class TestProvider3 {
    provide(picker, token) {
      assert.ok(picker);
      provider3Called = true;
      const store = new DisposableStore();
      store.add(token.onCancellationRequested(() => provider3Canceled = true));
      setTimeout(() => picker.hide());
      store.add(toDisposable(() => provider3Disposed = true));
      return store;
    }
  }
  const providerDescriptorDefault = { ctor: TestProviderDefault, prefix: "", helpEntries: [] };
  const providerDescriptor1 = { ctor: TestProvider1, prefix: "test", helpEntries: [] };
  const providerDescriptor2 = { ctor: TestProvider2, prefix: "test something", helpEntries: [] };
  const providerDescriptor3 = { ctor: TestProvider3, prefix: "changed", helpEntries: [] };
  setup(() => {
    instantiationService = workbenchInstantiationService(void 0, disposables);
    accessor = instantiationService.createInstance(TestServiceAccessor);
  });
  test("registry", () => {
    const registry = Registry.as(Extensions.Quickaccess);
    const restore = registry.clear();
    const contextKeyService = instantiationService.get(IContextKeyService);
    assert.ok(!registry.getQuickAccessProvider("test", contextKeyService));
    const disposables2 = new DisposableStore();
    disposables2.add(registry.registerQuickAccessProvider(providerDescriptorDefault));
    assert(registry.getQuickAccessProvider("", contextKeyService) === providerDescriptorDefault);
    assert(registry.getQuickAccessProvider("test", contextKeyService) === providerDescriptorDefault);
    const disposable = disposables2.add(registry.registerQuickAccessProvider(providerDescriptor1));
    assert(registry.getQuickAccessProvider("test", contextKeyService) === providerDescriptor1);
    const providers = registry.getQuickAccessProviders(contextKeyService);
    assert(providers.some((provider) => provider.prefix === "test"));
    disposable.dispose();
    assert(registry.getQuickAccessProvider("test", contextKeyService) === providerDescriptorDefault);
    disposables2.dispose();
    assert.ok(!registry.getQuickAccessProvider("test", contextKeyService));
    restore();
  });
  test("registry - when condition", () => {
    const registry = Registry.as(Extensions.Quickaccess);
    const restore = registry.clear();
    const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
    const localDisposables = new DisposableStore();
    const contextKey = contextKeyService.createKey("testQuickAccessContextKey", void 0);
    const providerWithWhen = {
      ctor: TestProvider1,
      prefix: "whentest",
      helpEntries: [],
      when: ContextKeyExpr.has("testQuickAccessContextKey")
    };
    localDisposables.add(registry.registerQuickAccessProvider(providerWithWhen));
    assert.strictEqual(contextKeyService.contextMatchesRules(providerWithWhen.when), false);
    assert.strictEqual(registry.getQuickAccessProvider("whentest", contextKeyService), void 0);
    let providers = registry.getQuickAccessProviders(contextKeyService);
    assert.ok(!providers.some((p) => p.prefix === "whentest"));
    contextKey.set(true);
    assert.strictEqual(contextKeyService.contextMatchesRules(providerWithWhen.when), true);
    assert.strictEqual(registry.getQuickAccessProvider("whentest", contextKeyService), providerWithWhen);
    providers = registry.getQuickAccessProviders(contextKeyService);
    assert.ok(providers.some((p) => p.prefix === "whentest"));
    contextKey.set(void 0);
    assert.strictEqual(registry.getQuickAccessProvider("whentest", contextKeyService), void 0);
    localDisposables.dispose();
    restore();
  });
  test("provider", async () => {
    const registry = Registry.as(Extensions.Quickaccess);
    const restore = registry.clear();
    const disposables2 = new DisposableStore();
    disposables2.add(registry.registerQuickAccessProvider(providerDescriptorDefault));
    disposables2.add(registry.registerQuickAccessProvider(providerDescriptor1));
    disposables2.add(registry.registerQuickAccessProvider(providerDescriptor2));
    disposables2.add(registry.registerQuickAccessProvider(providerDescriptor3));
    accessor.quickInputService.quickAccess.show("test");
    assert.strictEqual(providerDefaultCalled, false);
    assert.strictEqual(provider1Called, true);
    assert.strictEqual(provider2Called, false);
    assert.strictEqual(provider3Called, false);
    assert.strictEqual(providerDefaultCanceled, false);
    assert.strictEqual(provider1Canceled, false);
    assert.strictEqual(provider2Canceled, false);
    assert.strictEqual(provider3Canceled, false);
    assert.strictEqual(providerDefaultDisposed, false);
    assert.strictEqual(provider1Disposed, false);
    assert.strictEqual(provider2Disposed, false);
    assert.strictEqual(provider3Disposed, false);
    provider1Called = false;
    accessor.quickInputService.quickAccess.show("test something");
    assert.strictEqual(providerDefaultCalled, false);
    assert.strictEqual(provider1Called, false);
    assert.strictEqual(provider2Called, true);
    assert.strictEqual(provider3Called, false);
    assert.strictEqual(providerDefaultCanceled, false);
    assert.strictEqual(provider1Canceled, true);
    assert.strictEqual(provider2Canceled, false);
    assert.strictEqual(provider3Canceled, false);
    assert.strictEqual(providerDefaultDisposed, false);
    assert.strictEqual(provider1Disposed, true);
    assert.strictEqual(provider2Disposed, false);
    assert.strictEqual(provider3Disposed, false);
    provider2Called = false;
    provider1Canceled = false;
    provider1Disposed = false;
    accessor.quickInputService.quickAccess.show("usedefault");
    assert.strictEqual(providerDefaultCalled, true);
    assert.strictEqual(provider1Called, false);
    assert.strictEqual(provider2Called, false);
    assert.strictEqual(provider3Called, false);
    assert.strictEqual(providerDefaultCanceled, false);
    assert.strictEqual(provider1Canceled, false);
    assert.strictEqual(provider2Canceled, true);
    assert.strictEqual(provider3Canceled, false);
    assert.strictEqual(providerDefaultDisposed, false);
    assert.strictEqual(provider1Disposed, false);
    assert.strictEqual(provider2Disposed, true);
    assert.strictEqual(provider3Disposed, false);
    await timeout(1);
    assert.strictEqual(providerDefaultCanceled, true);
    assert.strictEqual(providerDefaultDisposed, true);
    assert.strictEqual(provider3Called, true);
    await timeout(1);
    assert.strictEqual(provider3Canceled, true);
    assert.strictEqual(provider3Disposed, true);
    disposables2.dispose();
    restore();
  });
  let fastProviderCalled = false;
  let slowProviderCalled = false;
  let fastAndSlowProviderCalled = false;
  let slowProviderCanceled = false;
  let fastAndSlowProviderCanceled = false;
  class FastTestQuickPickProvider extends PickerQuickAccessProvider {
    constructor() {
      super("fast");
    }
    _getPicks(filter, disposables2, token) {
      fastProviderCalled = true;
      return [{ label: "Fast Pick" }];
    }
  }
  class SlowTestQuickPickProvider extends PickerQuickAccessProvider {
    constructor() {
      super("slow");
    }
    async _getPicks(filter, disposables2, token) {
      slowProviderCalled = true;
      await timeout(1);
      if (token.isCancellationRequested) {
        slowProviderCanceled = true;
      }
      return [{ label: "Slow Pick" }];
    }
  }
  class FastAndSlowTestQuickPickProvider extends PickerQuickAccessProvider {
    constructor() {
      super("bothFastAndSlow");
    }
    _getPicks(filter, disposables2, token) {
      fastAndSlowProviderCalled = true;
      return {
        picks: [{ label: "Fast Pick" }],
        additionalPicks: (async () => {
          await timeout(1);
          if (token.isCancellationRequested) {
            fastAndSlowProviderCanceled = true;
          }
          return [{ label: "Slow Pick" }];
        })()
      };
    }
  }
  const fastProviderDescriptor = { ctor: FastTestQuickPickProvider, prefix: "fast", helpEntries: [] };
  const slowProviderDescriptor = { ctor: SlowTestQuickPickProvider, prefix: "slow", helpEntries: [] };
  const fastAndSlowProviderDescriptor = { ctor: FastAndSlowTestQuickPickProvider, prefix: "bothFastAndSlow", helpEntries: [] };
  test("quick pick access - show()", async () => {
    const registry = Registry.as(Extensions.Quickaccess);
    const restore = registry.clear();
    const disposables2 = new DisposableStore();
    disposables2.add(registry.registerQuickAccessProvider(fastProviderDescriptor));
    disposables2.add(registry.registerQuickAccessProvider(slowProviderDescriptor));
    disposables2.add(registry.registerQuickAccessProvider(fastAndSlowProviderDescriptor));
    accessor.quickInputService.quickAccess.show("fast");
    assert.strictEqual(fastProviderCalled, true);
    assert.strictEqual(slowProviderCalled, false);
    assert.strictEqual(fastAndSlowProviderCalled, false);
    fastProviderCalled = false;
    accessor.quickInputService.quickAccess.show("slow");
    await timeout(2);
    assert.strictEqual(fastProviderCalled, false);
    assert.strictEqual(slowProviderCalled, true);
    assert.strictEqual(slowProviderCanceled, false);
    assert.strictEqual(fastAndSlowProviderCalled, false);
    slowProviderCalled = false;
    accessor.quickInputService.quickAccess.show("bothFastAndSlow");
    await timeout(2);
    assert.strictEqual(fastProviderCalled, false);
    assert.strictEqual(slowProviderCalled, false);
    assert.strictEqual(fastAndSlowProviderCalled, true);
    assert.strictEqual(fastAndSlowProviderCanceled, false);
    fastAndSlowProviderCalled = false;
    accessor.quickInputService.quickAccess.show("slow");
    accessor.quickInputService.quickAccess.show("bothFastAndSlow");
    accessor.quickInputService.quickAccess.show("fast");
    assert.strictEqual(fastProviderCalled, true);
    assert.strictEqual(slowProviderCalled, true);
    assert.strictEqual(fastAndSlowProviderCalled, true);
    await timeout(2);
    assert.strictEqual(slowProviderCanceled, true);
    assert.strictEqual(fastAndSlowProviderCanceled, true);
    disposables2.dispose();
    restore();
  });
  test("quick pick access - pick()", async () => {
    const registry = Registry.as(Extensions.Quickaccess);
    const restore = registry.clear();
    const disposables2 = new DisposableStore();
    disposables2.add(registry.registerQuickAccessProvider(fastProviderDescriptor));
    const result = accessor.quickInputService.quickAccess.pick("fast");
    assert.strictEqual(fastProviderCalled, true);
    assert.ok(result instanceof Promise);
    disposables2.dispose();
    restore();
  });
  test("PickerEditorState can properly restore editors", async () => {
    const part = await createEditorPart(instantiationService, disposables.add(new DisposableStore()));
    instantiationService.stub(IEditorGroupsService, part);
    const editorService = disposables.add(instantiationService.createInstance(EditorService, void 0));
    instantiationService.stub(IEditorService, editorService);
    const editorViewState = disposables.add(instantiationService.createInstance(PickerEditorState));
    disposables.add(part);
    disposables.add(editorService);
    const input1 = {
      resource: URI.parse("foo://bar1"),
      options: {
        pinned: true,
        preserveFocus: true,
        selection: new Range(1, 0, 1, 3)
      }
    };
    const input2 = {
      resource: URI.parse("foo://bar2"),
      options: {
        pinned: true,
        selection: new Range(1, 0, 1, 3)
      }
    };
    const input3 = {
      resource: URI.parse("foo://bar3")
    };
    const input4 = {
      resource: URI.parse("foo://bar4")
    };
    const editor = await editorService.openEditor(input1);
    assert.strictEqual(editor, editorService.activeEditorPane);
    editorViewState.set();
    await editorService.openEditor(input2);
    await editorViewState.openTransientEditor(input3);
    await editorViewState.openTransientEditor(input4);
    await editorViewState.restore();
    assert.strictEqual(part.activeGroup.activeEditor?.resource, input1.resource);
    assert.deepStrictEqual(part.activeGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).map((e) => e.resource), [input1.resource, input2.resource]);
    if (part.activeGroup.activeEditorPane?.getSelection) {
      assert.deepStrictEqual(part.activeGroup.activeEditorPane?.getSelection(), input1.options.selection);
    }
    await part.activeGroup.closeAllEditors();
  });
  let attachTestAcceptCalled = false;
  let attachTestAttachCalled = false;
  let attachTestAttachKeyMods;
  class AttachTestQuickPickProvider extends PickerQuickAccessProvider {
    constructor() {
      super("attach");
    }
    _getPicks() {
      return [{
        label: "Test Item",
        accept: () => {
          attachTestAcceptCalled = true;
        },
        attach: (keyMods) => {
          attachTestAttachCalled = true;
          attachTestAttachKeyMods = keyMods;
        }
      }];
    }
  }
  class AttachTestNoAttachProvider extends PickerQuickAccessProvider {
    constructor() {
      super("noattach");
    }
    _getPicks() {
      return [{
        label: "No Attach Item",
        accept: () => {
          attachTestAcceptCalled = true;
        }
      }];
    }
  }
  const attachProviderDescriptor = { ctor: AttachTestQuickPickProvider, prefix: "attach", helpEntries: [] };
  const noAttachProviderDescriptor = { ctor: AttachTestNoAttachProvider, prefix: "noattach", helpEntries: [] };
  function resetAttachState() {
    attachTestAcceptCalled = false;
    attachTestAttachCalled = false;
    attachTestAttachKeyMods = void 0;
  }
  test("quick pick access - accept without modifier keys calls accept, not attach", async () => {
    const registry = Registry.as(Extensions.Quickaccess);
    const restore = registry.clear();
    const disposables2 = new DisposableStore();
    disposables2.add(registry.registerQuickAccessProvider(attachProviderDescriptor));
    resetAttachState();
    accessor.quickInputService.quickAccess.show("attach");
    await accessor.quickInputService.accept();
    assert.strictEqual(attachTestAcceptCalled, true);
    assert.strictEqual(attachTestAttachCalled, false);
    disposables2.dispose();
    restore();
  });
  test("quick pick access - accept with ctrlCmd calls attach instead of accept", async () => {
    const registry = Registry.as(Extensions.Quickaccess);
    const restore = registry.clear();
    const disposables2 = new DisposableStore();
    disposables2.add(registry.registerQuickAccessProvider(attachProviderDescriptor));
    resetAttachState();
    accessor.quickInputService.quickAccess.show("attach");
    await accessor.quickInputService.accept({ ctrlCmd: true, alt: false, shift: false });
    assert.strictEqual(attachTestAcceptCalled, false);
    assert.strictEqual(attachTestAttachCalled, true);
    assert.deepStrictEqual(attachTestAttachKeyMods, { ctrlCmd: true, alt: false, shift: false });
    disposables2.dispose();
    restore();
  });
  test("quick pick access - accept with alt calls attach instead of accept", async () => {
    const registry = Registry.as(Extensions.Quickaccess);
    const restore = registry.clear();
    const disposables2 = new DisposableStore();
    disposables2.add(registry.registerQuickAccessProvider(attachProviderDescriptor));
    resetAttachState();
    accessor.quickInputService.quickAccess.show("attach");
    await accessor.quickInputService.accept({ ctrlCmd: false, alt: true, shift: false });
    assert.strictEqual(attachTestAcceptCalled, false);
    assert.strictEqual(attachTestAttachCalled, true);
    assert.deepStrictEqual(attachTestAttachKeyMods, { ctrlCmd: false, alt: true, shift: false });
    disposables2.dispose();
    restore();
  });
  test("quick pick access - accept with modifier keys but no attach method calls accept", async () => {
    const registry = Registry.as(Extensions.Quickaccess);
    const restore = registry.clear();
    const disposables2 = new DisposableStore();
    disposables2.add(registry.registerQuickAccessProvider(noAttachProviderDescriptor));
    resetAttachState();
    accessor.quickInputService.quickAccess.show("noattach");
    await accessor.quickInputService.accept({ ctrlCmd: true, alt: false, shift: false });
    assert.strictEqual(attachTestAcceptCalled, true);
    assert.strictEqual(attachTestAttachCalled, false);
    disposables2.dispose();
    restore();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXHF1aWNrQWNjZXNzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJUXVpY2tBY2Nlc3NSZWdpc3RyeSwgRXh0ZW5zaW9ucywgSVF1aWNrQWNjZXNzUHJvdmlkZXIsIFF1aWNrQWNjZXNzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tQaWNrLCBJUXVpY2tQaWNrSXRlbSwgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJS2V5TW9kcywgSVF1aWNrUGlja0RpZEFjY2VwdEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0U2VydmljZUFjY2Vzc29yLCB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSwgY3JlYXRlRWRpdG9yUGFydCB9IGZyb20gJy4vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgUGlja2VyUXVpY2tBY2Nlc3NQcm92aWRlciwgRmFzdEFuZFNsb3dQaWNrcywgSVBpY2tlclF1aWNrQWNjZXNzSXRlbSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvYnJvd3Nlci9waWNrZXJRdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2VkaXRvci9icm93c2VyL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUGlja2VyRWRpdG9yU3RhdGUgfSBmcm9tICcuLi8uLi9icm93c2VyL3F1aWNrYWNjZXNzLmpzJztcbmltcG9ydCB7IEVkaXRvcnNPcmRlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UsIENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvYnJvd3Nlci9jb250ZXh0S2V5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5cbnN1aXRlKCdRdWlja0FjY2VzcycsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGFjY2Vzc29yOiBUZXN0U2VydmljZUFjY2Vzc29yO1xuXG5cdGxldCBwcm92aWRlckRlZmF1bHRDYWxsZWQgPSBmYWxzZTtcblx0bGV0IHByb3ZpZGVyRGVmYXVsdENhbmNlbGVkID0gZmFsc2U7XG5cdGxldCBwcm92aWRlckRlZmF1bHREaXNwb3NlZCA9IGZhbHNlO1xuXG5cdGxldCBwcm92aWRlcjFDYWxsZWQgPSBmYWxzZTtcblx0bGV0IHByb3ZpZGVyMUNhbmNlbGVkID0gZmFsc2U7XG5cdGxldCBwcm92aWRlcjFEaXNwb3NlZCA9IGZhbHNlO1xuXG5cdGxldCBwcm92aWRlcjJDYWxsZWQgPSBmYWxzZTtcblx0bGV0IHByb3ZpZGVyMkNhbmNlbGVkID0gZmFsc2U7XG5cdGxldCBwcm92aWRlcjJEaXNwb3NlZCA9IGZhbHNlO1xuXG5cdGxldCBwcm92aWRlcjNDYWxsZWQgPSBmYWxzZTtcblx0bGV0IHByb3ZpZGVyM0NhbmNlbGVkID0gZmFsc2U7XG5cdGxldCBwcm92aWRlcjNEaXNwb3NlZCA9IGZhbHNlO1xuXG5cdGNsYXNzIFRlc3RQcm92aWRlckRlZmF1bHQgaW1wbGVtZW50cyBJUXVpY2tBY2Nlc3NQcm92aWRlciB7XG5cblx0XHRjb25zdHJ1Y3RvcihASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSkgeyB9XG5cblx0XHRwcm92aWRlKHBpY2tlcjogSVF1aWNrUGljazxJUXVpY2tQaWNrSXRlbSwgeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBJRGlzcG9zYWJsZSB7XG5cdFx0XHRhc3NlcnQub2socGlja2VyKTtcblx0XHRcdHByb3ZpZGVyRGVmYXVsdENhbGxlZCA9IHRydWU7XG5cdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcHJvdmlkZXJEZWZhdWx0RGlzcG9zZWQgPSB0cnVlKSk7XG5cdFx0XHRzdG9yZS5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gcHJvdmlkZXJEZWZhdWx0Q2FuY2VsZWQgPSB0cnVlKSk7XG5cblx0XHRcdC8vIGJyaW5nIHVwIHByb3ZpZGVyICMzXG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IHRoaXMucXVpY2tJbnB1dFNlcnZpY2UucXVpY2tBY2Nlc3Muc2hvdyhwcm92aWRlckRlc2NyaXB0b3IzLnByZWZpeCkpO1xuXG5cdFx0XHRyZXR1cm4gc3RvcmU7XG5cdFx0fVxuXHR9XG5cblx0Y2xhc3MgVGVzdFByb3ZpZGVyMSBpbXBsZW1lbnRzIElRdWlja0FjY2Vzc1Byb3ZpZGVyIHtcblx0XHRwcm92aWRlKHBpY2tlcjogSVF1aWNrUGljazxJUXVpY2tQaWNrSXRlbSwgeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBJRGlzcG9zYWJsZSB7XG5cdFx0XHRhc3NlcnQub2socGlja2VyKTtcblx0XHRcdHByb3ZpZGVyMUNhbGxlZCA9IHRydWU7XG5cdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdHN0b3JlLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiBwcm92aWRlcjFDYW5jZWxlZCA9IHRydWUpKTtcblxuXHRcdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwcm92aWRlcjFEaXNwb3NlZCA9IHRydWUpKTtcblx0XHRcdHJldHVybiBzdG9yZTtcblx0XHR9XG5cdH1cblxuXHRjbGFzcyBUZXN0UHJvdmlkZXIyIGltcGxlbWVudHMgSVF1aWNrQWNjZXNzUHJvdmlkZXIge1xuXHRcdHByb3ZpZGUocGlja2VyOiBJUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtLCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IElEaXNwb3NhYmxlIHtcblx0XHRcdGFzc2VydC5vayhwaWNrZXIpO1xuXHRcdFx0cHJvdmlkZXIyQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0c3RvcmUuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHByb3ZpZGVyMkNhbmNlbGVkID0gdHJ1ZSkpO1xuXG5cdFx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHByb3ZpZGVyMkRpc3Bvc2VkID0gdHJ1ZSkpO1xuXHRcdFx0cmV0dXJuIHN0b3JlO1xuXHRcdH1cblx0fVxuXG5cdGNsYXNzIFRlc3RQcm92aWRlcjMgaW1wbGVtZW50cyBJUXVpY2tBY2Nlc3NQcm92aWRlciB7XG5cdFx0cHJvdmlkZShwaWNrZXI6IElRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0sIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9PiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogSURpc3Bvc2FibGUge1xuXHRcdFx0YXNzZXJ0Lm9rKHBpY2tlcik7XG5cdFx0XHRwcm92aWRlcjNDYWxsZWQgPSB0cnVlO1xuXHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRzdG9yZS5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gcHJvdmlkZXIzQ2FuY2VsZWQgPSB0cnVlKSk7XG5cblx0XHRcdC8vIGhpZGUgd2l0aG91dCBwaWNraW5nXG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IHBpY2tlci5oaWRlKCkpO1xuXG5cdFx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHByb3ZpZGVyM0Rpc3Bvc2VkID0gdHJ1ZSkpO1xuXHRcdFx0cmV0dXJuIHN0b3JlO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IHByb3ZpZGVyRGVzY3JpcHRvckRlZmF1bHQgPSB7IGN0b3I6IFRlc3RQcm92aWRlckRlZmF1bHQsIHByZWZpeDogJycsIGhlbHBFbnRyaWVzOiBbXSB9O1xuXHRjb25zdCBwcm92aWRlckRlc2NyaXB0b3IxID0geyBjdG9yOiBUZXN0UHJvdmlkZXIxLCBwcmVmaXg6ICd0ZXN0JywgaGVscEVudHJpZXM6IFtdIH07XG5cdGNvbnN0IHByb3ZpZGVyRGVzY3JpcHRvcjIgPSB7IGN0b3I6IFRlc3RQcm92aWRlcjIsIHByZWZpeDogJ3Rlc3Qgc29tZXRoaW5nJywgaGVscEVudHJpZXM6IFtdIH07XG5cdGNvbnN0IHByb3ZpZGVyRGVzY3JpcHRvcjMgPSB7IGN0b3I6IFRlc3RQcm92aWRlcjMsIHByZWZpeDogJ2NoYW5nZWQnLCBoZWxwRW50cmllczogW10gfTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHRhY2Nlc3NvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTZXJ2aWNlQWNjZXNzb3IpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWdpc3RyeScsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IChSZWdpc3RyeS5hczxJUXVpY2tBY2Nlc3NSZWdpc3RyeT4oRXh0ZW5zaW9ucy5RdWlja2FjY2VzcykpO1xuXHRcdGNvbnN0IHJlc3RvcmUgPSAocmVnaXN0cnkgYXMgUXVpY2tBY2Nlc3NSZWdpc3RyeSkuY2xlYXIoKTtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJQ29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0Lm9rKCFyZWdpc3RyeS5nZXRRdWlja0FjY2Vzc1Byb3ZpZGVyKCd0ZXN0JywgY29udGV4dEtleVNlcnZpY2UpKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyUXVpY2tBY2Nlc3NQcm92aWRlcihwcm92aWRlckRlc2NyaXB0b3JEZWZhdWx0KSk7XG5cdFx0YXNzZXJ0KHJlZ2lzdHJ5LmdldFF1aWNrQWNjZXNzUHJvdmlkZXIoJycsIGNvbnRleHRLZXlTZXJ2aWNlKSA9PT0gcHJvdmlkZXJEZXNjcmlwdG9yRGVmYXVsdCk7XG5cdFx0YXNzZXJ0KHJlZ2lzdHJ5LmdldFF1aWNrQWNjZXNzUHJvdmlkZXIoJ3Rlc3QnLCBjb250ZXh0S2V5U2VydmljZSkgPT09IHByb3ZpZGVyRGVzY3JpcHRvckRlZmF1bHQpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3RlclF1aWNrQWNjZXNzUHJvdmlkZXIocHJvdmlkZXJEZXNjcmlwdG9yMSkpO1xuXHRcdGFzc2VydChyZWdpc3RyeS5nZXRRdWlja0FjY2Vzc1Byb3ZpZGVyKCd0ZXN0JywgY29udGV4dEtleVNlcnZpY2UpID09PSBwcm92aWRlckRlc2NyaXB0b3IxKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVycyA9IHJlZ2lzdHJ5LmdldFF1aWNrQWNjZXNzUHJvdmlkZXJzKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQocHJvdmlkZXJzLnNvbWUocHJvdmlkZXIgPT4gcHJvdmlkZXIucHJlZml4ID09PSAndGVzdCcpKTtcblxuXHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdGFzc2VydChyZWdpc3RyeS5nZXRRdWlja0FjY2Vzc1Byb3ZpZGVyKCd0ZXN0JywgY29udGV4dEtleVNlcnZpY2UpID09PSBwcm92aWRlckRlc2NyaXB0b3JEZWZhdWx0KTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQub2soIXJlZ2lzdHJ5LmdldFF1aWNrQWNjZXNzUHJvdmlkZXIoJ3Rlc3QnLCBjb250ZXh0S2V5U2VydmljZSkpO1xuXG5cdFx0cmVzdG9yZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWdpc3RyeSAtIHdoZW4gY29uZGl0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gKFJlZ2lzdHJ5LmFzPElRdWlja0FjY2Vzc1JlZ2lzdHJ5PihFeHRlbnNpb25zLlF1aWNrYWNjZXNzKSk7XG5cdFx0Y29uc3QgcmVzdG9yZSA9IChyZWdpc3RyeSBhcyBRdWlja0FjY2Vzc1JlZ2lzdHJ5KS5jbGVhcigpO1xuXG5cdFx0Ly8gVXNlIHJlYWwgQ29udGV4dEtleVNlcnZpY2UgdGhhdCBwcm9wZXJseSBldmFsdWF0ZXMgcnVsZXNcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ29udGV4dEtleVNlcnZpY2UobmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgbG9jYWxEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdC8vIENyZWF0ZSBhIGNvbnRleHQga2V5IHRoYXQgc3RhcnRzIGFzIHVuZGVmaW5lZCAoZmFsc3kpXG5cdFx0Y29uc3QgY29udGV4dEtleSA9IGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleTxib29sZWFuIHwgdW5kZWZpbmVkPigndGVzdFF1aWNrQWNjZXNzQ29udGV4dEtleScsIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBSZWdpc3RlciBhIHByb3ZpZGVyIHdpdGggYSB3aGVuIGNvbmRpdGlvbiB0aGF0IHJlcXVpcmVzIHRlc3RRdWlja0FjY2Vzc0NvbnRleHRLZXkgdG8gYmUgdHJ1dGh5XG5cdFx0Y29uc3QgcHJvdmlkZXJXaXRoV2hlbiA9IHtcblx0XHRcdGN0b3I6IFRlc3RQcm92aWRlcjEsXG5cdFx0XHRwcmVmaXg6ICd3aGVudGVzdCcsXG5cdFx0XHRoZWxwRW50cmllczogW10sXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5oYXMoJ3Rlc3RRdWlja0FjY2Vzc0NvbnRleHRLZXknKVxuXHRcdH07XG5cdFx0bG9jYWxEaXNwb3NhYmxlcy5hZGQocmVnaXN0cnkucmVnaXN0ZXJRdWlja0FjY2Vzc1Byb3ZpZGVyKHByb3ZpZGVyV2l0aFdoZW4pKTtcblxuXHRcdC8vIFZlcmlmeSB0aGUgZXhwcmVzc2lvbiB3b3JrcyB3aXRoIHRoZSBjb250ZXh0IGtleSBzZXJ2aWNlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMocHJvdmlkZXJXaXRoV2hlbi53aGVuKSwgZmFsc2UpO1xuXG5cdFx0Ly8gUHJvdmlkZXIgd2l0aCBmYWxzZSB3aGVuIGNvbmRpdGlvbiBzaG91bGQgbm90IGJlIGZvdW5kXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldFF1aWNrQWNjZXNzUHJvdmlkZXIoJ3doZW50ZXN0JywgY29udGV4dEtleVNlcnZpY2UpLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gU2hvdWxkIG5vdCBhcHBlYXIgaW4gdGhlIGxpc3Qgb2YgcHJvdmlkZXJzXG5cdFx0bGV0IHByb3ZpZGVycyA9IHJlZ2lzdHJ5LmdldFF1aWNrQWNjZXNzUHJvdmlkZXJzKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQub2soIXByb3ZpZGVycy5zb21lKHAgPT4gcC5wcmVmaXggPT09ICd3aGVudGVzdCcpKTtcblxuXHRcdC8vIFNldCB0aGUgY29udGV4dCBrZXkgdG8gdHJ1ZVxuXHRcdGNvbnRleHRLZXkuc2V0KHRydWUpO1xuXG5cdFx0Ly8gVmVyaWZ5IHRoZSBleHByZXNzaW9uIG5vdyBtYXRjaGVzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMocHJvdmlkZXJXaXRoV2hlbi53aGVuKSwgdHJ1ZSk7XG5cblx0XHQvLyBOb3cgdGhlIHByb3ZpZGVyIHNob3VsZCBiZSBmb3VuZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRRdWlja0FjY2Vzc1Byb3ZpZGVyKCd3aGVudGVzdCcsIGNvbnRleHRLZXlTZXJ2aWNlKSwgcHJvdmlkZXJXaXRoV2hlbik7XG5cblx0XHQvLyBTaG91bGQgYXBwZWFyIGluIHRoZSBsaXN0IG9mIHByb3ZpZGVyc1xuXHRcdHByb3ZpZGVycyA9IHJlZ2lzdHJ5LmdldFF1aWNrQWNjZXNzUHJvdmlkZXJzKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQub2socHJvdmlkZXJzLnNvbWUocCA9PiBwLnByZWZpeCA9PT0gJ3doZW50ZXN0JykpO1xuXG5cdFx0Ly8gU2V0IGNvbnRleHQga2V5IGJhY2sgdG8gdW5kZWZpbmVkIChmYWxzeSlcblx0XHRjb250ZXh0S2V5LnNldCh1bmRlZmluZWQpO1xuXG5cdFx0Ly8gUHJvdmlkZXIgc2hvdWxkIG5vdCBiZSBmb3VuZCBhZ2FpblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRRdWlja0FjY2Vzc1Byb3ZpZGVyKCd3aGVudGVzdCcsIGNvbnRleHRLZXlTZXJ2aWNlKSwgdW5kZWZpbmVkKTtcblxuXHRcdGxvY2FsRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXG5cdFx0cmVzdG9yZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm92aWRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IChSZWdpc3RyeS5hczxJUXVpY2tBY2Nlc3NSZWdpc3RyeT4oRXh0ZW5zaW9ucy5RdWlja2FjY2VzcykpO1xuXHRcdGNvbnN0IHJlc3RvcmUgPSAocmVnaXN0cnkgYXMgUXVpY2tBY2Nlc3NSZWdpc3RyeSkuY2xlYXIoKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyUXVpY2tBY2Nlc3NQcm92aWRlcihwcm92aWRlckRlc2NyaXB0b3JEZWZhdWx0KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyUXVpY2tBY2Nlc3NQcm92aWRlcihwcm92aWRlckRlc2NyaXB0b3IxKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyUXVpY2tBY2Nlc3NQcm92aWRlcihwcm92aWRlckRlc2NyaXB0b3IyKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyUXVpY2tBY2Nlc3NQcm92aWRlcihwcm92aWRlckRlc2NyaXB0b3IzKSk7XG5cblx0XHRhY2Nlc3Nvci5xdWlja0lucHV0U2VydmljZS5xdWlja0FjY2Vzcy5zaG93KCd0ZXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyRGVmYXVsdENhbGxlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlcjFDYWxsZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlcjJDYWxsZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIzQ2FsbGVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyRGVmYXVsdENhbmNlbGVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyMUNhbmNlbGVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyMkNhbmNlbGVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyM0NhbmNlbGVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyRGVmYXVsdERpc3Bvc2VkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyMURpc3Bvc2VkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyMkRpc3Bvc2VkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyM0Rpc3Bvc2VkLCBmYWxzZSk7XG5cdFx0cHJvdmlkZXIxQ2FsbGVkID0gZmFsc2U7XG5cblx0XHRhY2Nlc3Nvci5xdWlja0lucHV0U2VydmljZS5xdWlja0FjY2Vzcy5zaG93KCd0ZXN0IHNvbWV0aGluZycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlckRlZmF1bHRDYWxsZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIxQ2FsbGVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyMkNhbGxlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyM0NhbGxlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlckRlZmF1bHRDYW5jZWxlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlcjFDYW5jZWxlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyMkNhbmNlbGVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyM0NhbmNlbGVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyRGVmYXVsdERpc3Bvc2VkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyMURpc3Bvc2VkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIyRGlzcG9zZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIzRGlzcG9zZWQsIGZhbHNlKTtcblx0XHRwcm92aWRlcjJDYWxsZWQgPSBmYWxzZTtcblx0XHRwcm92aWRlcjFDYW5jZWxlZCA9IGZhbHNlO1xuXHRcdHByb3ZpZGVyMURpc3Bvc2VkID0gZmFsc2U7XG5cblx0XHRhY2Nlc3Nvci5xdWlja0lucHV0U2VydmljZS5xdWlja0FjY2Vzcy5zaG93KCd1c2VkZWZhdWx0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyRGVmYXVsdENhbGxlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyMUNhbGxlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlcjJDYWxsZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIzQ2FsbGVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyRGVmYXVsdENhbmNlbGVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyMUNhbmNlbGVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyMkNhbmNlbGVkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIzQ2FuY2VsZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXJEZWZhdWx0RGlzcG9zZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIxRGlzcG9zZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIyRGlzcG9zZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlcjNEaXNwb3NlZCwgZmFsc2UpO1xuXG5cdFx0YXdhaXQgdGltZW91dCgxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlckRlZmF1bHRDYW5jZWxlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyRGVmYXVsdERpc3Bvc2VkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIzQ2FsbGVkLCB0cnVlKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIzQ2FuY2VsZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlcjNEaXNwb3NlZCwgdHJ1ZSk7XG5cblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cblx0XHRyZXN0b3JlKCk7XG5cdH0pO1xuXG5cdGxldCBmYXN0UHJvdmlkZXJDYWxsZWQgPSBmYWxzZTtcblx0bGV0IHNsb3dQcm92aWRlckNhbGxlZCA9IGZhbHNlO1xuXHRsZXQgZmFzdEFuZFNsb3dQcm92aWRlckNhbGxlZCA9IGZhbHNlO1xuXG5cdGxldCBzbG93UHJvdmlkZXJDYW5jZWxlZCA9IGZhbHNlO1xuXHRsZXQgZmFzdEFuZFNsb3dQcm92aWRlckNhbmNlbGVkID0gZmFsc2U7XG5cblx0Y2xhc3MgRmFzdFRlc3RRdWlja1BpY2tQcm92aWRlciBleHRlbmRzIFBpY2tlclF1aWNrQWNjZXNzUHJvdmlkZXI8SVF1aWNrUGlja0l0ZW0+IHtcblxuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoJ2Zhc3QnKTtcblx0XHR9XG5cblx0XHRwcm90ZWN0ZWQgX2dldFBpY2tzKGZpbHRlcjogc3RyaW5nLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBBcnJheTxJUXVpY2tQaWNrSXRlbT4ge1xuXHRcdFx0ZmFzdFByb3ZpZGVyQ2FsbGVkID0gdHJ1ZTtcblxuXHRcdFx0cmV0dXJuIFt7IGxhYmVsOiAnRmFzdCBQaWNrJyB9XTtcblx0XHR9XG5cdH1cblxuXHRjbGFzcyBTbG93VGVzdFF1aWNrUGlja1Byb3ZpZGVyIGV4dGVuZHMgUGlja2VyUXVpY2tBY2Nlc3NQcm92aWRlcjxJUXVpY2tQaWNrSXRlbT4ge1xuXG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcignc2xvdycpO1xuXHRcdH1cblxuXHRcdHByb3RlY3RlZCBhc3luYyBfZ2V0UGlja3MoZmlsdGVyOiBzdHJpbmcsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8QXJyYXk8SVF1aWNrUGlja0l0ZW0+PiB7XG5cdFx0XHRzbG93UHJvdmlkZXJDYWxsZWQgPSB0cnVlO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0c2xvd1Byb3ZpZGVyQ2FuY2VsZWQgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gW3sgbGFiZWw6ICdTbG93IFBpY2snIH1dO1xuXHRcdH1cblx0fVxuXG5cdGNsYXNzIEZhc3RBbmRTbG93VGVzdFF1aWNrUGlja1Byb3ZpZGVyIGV4dGVuZHMgUGlja2VyUXVpY2tBY2Nlc3NQcm92aWRlcjxJUXVpY2tQaWNrSXRlbT4ge1xuXG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcignYm90aEZhc3RBbmRTbG93Jyk7XG5cdFx0fVxuXG5cdFx0cHJvdGVjdGVkIF9nZXRQaWNrcyhmaWx0ZXI6IHN0cmluZywgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogRmFzdEFuZFNsb3dQaWNrczxJUXVpY2tQaWNrSXRlbT4ge1xuXHRcdFx0ZmFzdEFuZFNsb3dQcm92aWRlckNhbGxlZCA9IHRydWU7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHBpY2tzOiBbeyBsYWJlbDogJ0Zhc3QgUGljaycgfV0sXG5cdFx0XHRcdGFkZGl0aW9uYWxQaWNrczogKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXG5cdFx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRmYXN0QW5kU2xvd1Byb3ZpZGVyQ2FuY2VsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBbeyBsYWJlbDogJ1Nsb3cgUGljaycgfV07XG5cdFx0XHRcdH0pKClcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgZmFzdFByb3ZpZGVyRGVzY3JpcHRvciA9IHsgY3RvcjogRmFzdFRlc3RRdWlja1BpY2tQcm92aWRlciwgcHJlZml4OiAnZmFzdCcsIGhlbHBFbnRyaWVzOiBbXSB9O1xuXHRjb25zdCBzbG93UHJvdmlkZXJEZXNjcmlwdG9yID0geyBjdG9yOiBTbG93VGVzdFF1aWNrUGlja1Byb3ZpZGVyLCBwcmVmaXg6ICdzbG93JywgaGVscEVudHJpZXM6IFtdIH07XG5cdGNvbnN0IGZhc3RBbmRTbG93UHJvdmlkZXJEZXNjcmlwdG9yID0geyBjdG9yOiBGYXN0QW5kU2xvd1Rlc3RRdWlja1BpY2tQcm92aWRlciwgcHJlZml4OiAnYm90aEZhc3RBbmRTbG93JywgaGVscEVudHJpZXM6IFtdIH07XG5cblx0dGVzdCgncXVpY2sgcGljayBhY2Nlc3MgLSBzaG93KCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSAoUmVnaXN0cnkuYXM8SVF1aWNrQWNjZXNzUmVnaXN0cnk+KEV4dGVuc2lvbnMuUXVpY2thY2Nlc3MpKTtcblx0XHRjb25zdCByZXN0b3JlID0gKHJlZ2lzdHJ5IGFzIFF1aWNrQWNjZXNzUmVnaXN0cnkpLmNsZWFyKCk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3RlclF1aWNrQWNjZXNzUHJvdmlkZXIoZmFzdFByb3ZpZGVyRGVzY3JpcHRvcikpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3RlclF1aWNrQWNjZXNzUHJvdmlkZXIoc2xvd1Byb3ZpZGVyRGVzY3JpcHRvcikpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3RlclF1aWNrQWNjZXNzUHJvdmlkZXIoZmFzdEFuZFNsb3dQcm92aWRlckRlc2NyaXB0b3IpKTtcblxuXHRcdGFjY2Vzc29yLnF1aWNrSW5wdXRTZXJ2aWNlLnF1aWNrQWNjZXNzLnNob3coJ2Zhc3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFzdFByb3ZpZGVyQ2FsbGVkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2xvd1Byb3ZpZGVyQ2FsbGVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZhc3RBbmRTbG93UHJvdmlkZXJDYWxsZWQsIGZhbHNlKTtcblx0XHRmYXN0UHJvdmlkZXJDYWxsZWQgPSBmYWxzZTtcblxuXHRcdGFjY2Vzc29yLnF1aWNrSW5wdXRTZXJ2aWNlLnF1aWNrQWNjZXNzLnNob3coJ3Nsb3cnKTtcblx0XHRhd2FpdCB0aW1lb3V0KDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZhc3RQcm92aWRlckNhbGxlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbG93UHJvdmlkZXJDYWxsZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbG93UHJvdmlkZXJDYW5jZWxlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYXN0QW5kU2xvd1Byb3ZpZGVyQ2FsbGVkLCBmYWxzZSk7XG5cdFx0c2xvd1Byb3ZpZGVyQ2FsbGVkID0gZmFsc2U7XG5cblx0XHRhY2Nlc3Nvci5xdWlja0lucHV0U2VydmljZS5xdWlja0FjY2Vzcy5zaG93KCdib3RoRmFzdEFuZFNsb3cnKTtcblx0XHRhd2FpdCB0aW1lb3V0KDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZhc3RQcm92aWRlckNhbGxlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbG93UHJvdmlkZXJDYWxsZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFzdEFuZFNsb3dQcm92aWRlckNhbGxlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZhc3RBbmRTbG93UHJvdmlkZXJDYW5jZWxlZCwgZmFsc2UpO1xuXHRcdGZhc3RBbmRTbG93UHJvdmlkZXJDYWxsZWQgPSBmYWxzZTtcblxuXHRcdGFjY2Vzc29yLnF1aWNrSW5wdXRTZXJ2aWNlLnF1aWNrQWNjZXNzLnNob3coJ3Nsb3cnKTtcblx0XHRhY2Nlc3Nvci5xdWlja0lucHV0U2VydmljZS5xdWlja0FjY2Vzcy5zaG93KCdib3RoRmFzdEFuZFNsb3cnKTtcblx0XHRhY2Nlc3Nvci5xdWlja0lucHV0U2VydmljZS5xdWlja0FjY2Vzcy5zaG93KCdmYXN0Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFzdFByb3ZpZGVyQ2FsbGVkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2xvd1Byb3ZpZGVyQ2FsbGVkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFzdEFuZFNsb3dQcm92aWRlckNhbGxlZCwgdHJ1ZSk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbG93UHJvdmlkZXJDYW5jZWxlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZhc3RBbmRTbG93UHJvdmlkZXJDYW5jZWxlZCwgdHJ1ZSk7XG5cblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cblx0XHRyZXN0b3JlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3F1aWNrIHBpY2sgYWNjZXNzIC0gcGljaygpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gKFJlZ2lzdHJ5LmFzPElRdWlja0FjY2Vzc1JlZ2lzdHJ5PihFeHRlbnNpb25zLlF1aWNrYWNjZXNzKSk7XG5cdFx0Y29uc3QgcmVzdG9yZSA9IChyZWdpc3RyeSBhcyBRdWlja0FjY2Vzc1JlZ2lzdHJ5KS5jbGVhcigpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0cnkucmVnaXN0ZXJRdWlja0FjY2Vzc1Byb3ZpZGVyKGZhc3RQcm92aWRlckRlc2NyaXB0b3IpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGFjY2Vzc29yLnF1aWNrSW5wdXRTZXJ2aWNlLnF1aWNrQWNjZXNzLnBpY2soJ2Zhc3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFzdFByb3ZpZGVyQ2FsbGVkLCB0cnVlKTtcblx0XHRhc3NlcnQub2socmVzdWx0IGluc3RhbmNlb2YgUHJvbWlzZSk7XG5cblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cblx0XHRyZXN0b3JlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1BpY2tlckVkaXRvclN0YXRlIGNhbiBwcm9wZXJseSByZXN0b3JlIGVkaXRvcnMnLCBhc3luYyAoKSA9PiB7XG5cblx0XHRjb25zdCBwYXJ0ID0gYXdhaXQgY3JlYXRlRWRpdG9yUGFydChpbnN0YW50aWF0aW9uU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVkaXRvckdyb3Vwc1NlcnZpY2UsIHBhcnQpO1xuXG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0b3JTZXJ2aWNlLCB1bmRlZmluZWQpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFZGl0b3JTZXJ2aWNlLCBlZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGVkaXRvclZpZXdTdGF0ZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQaWNrZXJFZGl0b3JTdGF0ZSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwYXJ0KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZWRpdG9yU2VydmljZSk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSB7XG5cdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCdmb286Ly9iYXIxJyksXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdHBpbm5lZDogdHJ1ZSwgcHJlc2VydmVGb2N1czogdHJ1ZSwgc2VsZWN0aW9uOiBuZXcgUmFuZ2UoMSwgMCwgMSwgMylcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IGlucHV0MiA9IHtcblx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ2ZvbzovL2JhcjInKSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0cGlubmVkOiB0cnVlLCBzZWxlY3Rpb246IG5ldyBSYW5nZSgxLCAwLCAxLCAzKVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgaW5wdXQzID0ge1xuXHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgnZm9vOi8vYmFyMycpXG5cdFx0fTtcblx0XHRjb25zdCBpbnB1dDQgPSB7XG5cdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCdmb286Ly9iYXI0Jylcblx0XHR9O1xuXG5cdFx0Y29uc3QgZWRpdG9yID0gYXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvciwgZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lKTtcblx0XHRlZGl0b3JWaWV3U3RhdGUuc2V0KCk7XG5cdFx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKGlucHV0Mik7XG5cdFx0YXdhaXQgZWRpdG9yVmlld1N0YXRlLm9wZW5UcmFuc2llbnRFZGl0b3IoaW5wdXQzKTtcblx0XHRhd2FpdCBlZGl0b3JWaWV3U3RhdGUub3BlblRyYW5zaWVudEVkaXRvcihpbnB1dDQpO1xuXHRcdGF3YWl0IGVkaXRvclZpZXdTdGF0ZS5yZXN0b3JlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5hY3RpdmVHcm91cC5hY3RpdmVFZGl0b3I/LnJlc291cmNlLCBpbnB1dDEucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFydC5hY3RpdmVHcm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkubWFwKGUgPT4gZS5yZXNvdXJjZSksIFtpbnB1dDEucmVzb3VyY2UsIGlucHV0Mi5yZXNvdXJjZV0pO1xuXHRcdGlmIChwYXJ0LmFjdGl2ZUdyb3VwLmFjdGl2ZUVkaXRvclBhbmU/LmdldFNlbGVjdGlvbikge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLmFjdGl2ZUVkaXRvclBhbmU/LmdldFNlbGVjdGlvbigpLCBpbnB1dDEub3B0aW9ucy5zZWxlY3Rpb24pO1xuXHRcdH1cblx0XHRhd2FpdCBwYXJ0LmFjdGl2ZUdyb3VwLmNsb3NlQWxsRWRpdG9ycygpO1xuXHR9KTtcblxuXHQvLyNyZWdpb24gYXR0YWNoIGRpc3BhdGNoIHRlc3RzXG5cblx0aW50ZXJmYWNlIElUZXN0QXR0YWNoUGlja0l0ZW0gZXh0ZW5kcyBJUGlja2VyUXVpY2tBY2Nlc3NJdGVtIHtcblx0XHRsYWJlbDogc3RyaW5nO1xuXHRcdGFjY2VwdD8oa2V5TW9kczogSUtleU1vZHMsIGV2ZW50OiBJUXVpY2tQaWNrRGlkQWNjZXB0RXZlbnQpOiB2b2lkO1xuXHRcdGF0dGFjaD8oa2V5TW9kczogSUtleU1vZHMsIGV2ZW50OiBJUXVpY2tQaWNrRGlkQWNjZXB0RXZlbnQpOiB2b2lkO1xuXHR9XG5cblx0bGV0IGF0dGFjaFRlc3RBY2NlcHRDYWxsZWQgPSBmYWxzZTtcblx0bGV0IGF0dGFjaFRlc3RBdHRhY2hDYWxsZWQgPSBmYWxzZTtcblx0bGV0IGF0dGFjaFRlc3RBdHRhY2hLZXlNb2RzOiBJS2V5TW9kcyB8IHVuZGVmaW5lZDtcblxuXHRjbGFzcyBBdHRhY2hUZXN0UXVpY2tQaWNrUHJvdmlkZXIgZXh0ZW5kcyBQaWNrZXJRdWlja0FjY2Vzc1Byb3ZpZGVyPElUZXN0QXR0YWNoUGlja0l0ZW0+IHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKCdhdHRhY2gnKTtcblx0XHR9XG5cblx0XHRwcm90ZWN0ZWQgX2dldFBpY2tzKCk6IElUZXN0QXR0YWNoUGlja0l0ZW1bXSB7XG5cdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0bGFiZWw6ICdUZXN0IEl0ZW0nLFxuXHRcdFx0XHRhY2NlcHQ6ICgpID0+IHtcblx0XHRcdFx0XHRhdHRhY2hUZXN0QWNjZXB0Q2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0fSxcblx0XHRcdFx0YXR0YWNoOiAoa2V5TW9kcykgPT4ge1xuXHRcdFx0XHRcdGF0dGFjaFRlc3RBdHRhY2hDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGF0dGFjaFRlc3RBdHRhY2hLZXlNb2RzID0ga2V5TW9kcztcblx0XHRcdFx0fVxuXHRcdFx0fV07XG5cdFx0fVxuXHR9XG5cblx0Y2xhc3MgQXR0YWNoVGVzdE5vQXR0YWNoUHJvdmlkZXIgZXh0ZW5kcyBQaWNrZXJRdWlja0FjY2Vzc1Byb3ZpZGVyPElUZXN0QXR0YWNoUGlja0l0ZW0+IHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKCdub2F0dGFjaCcpO1xuXHRcdH1cblxuXHRcdHByb3RlY3RlZCBfZ2V0UGlja3MoKTogSVRlc3RBdHRhY2hQaWNrSXRlbVtdIHtcblx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRsYWJlbDogJ05vIEF0dGFjaCBJdGVtJyxcblx0XHRcdFx0YWNjZXB0OiAoKSA9PiB7XG5cdFx0XHRcdFx0YXR0YWNoVGVzdEFjY2VwdENhbGxlZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1dO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IGF0dGFjaFByb3ZpZGVyRGVzY3JpcHRvciA9IHsgY3RvcjogQXR0YWNoVGVzdFF1aWNrUGlja1Byb3ZpZGVyLCBwcmVmaXg6ICdhdHRhY2gnLCBoZWxwRW50cmllczogW10gfTtcblx0Y29uc3Qgbm9BdHRhY2hQcm92aWRlckRlc2NyaXB0b3IgPSB7IGN0b3I6IEF0dGFjaFRlc3ROb0F0dGFjaFByb3ZpZGVyLCBwcmVmaXg6ICdub2F0dGFjaCcsIGhlbHBFbnRyaWVzOiBbXSB9O1xuXG5cdGZ1bmN0aW9uIHJlc2V0QXR0YWNoU3RhdGUoKSB7XG5cdFx0YXR0YWNoVGVzdEFjY2VwdENhbGxlZCA9IGZhbHNlO1xuXHRcdGF0dGFjaFRlc3RBdHRhY2hDYWxsZWQgPSBmYWxzZTtcblx0XHRhdHRhY2hUZXN0QXR0YWNoS2V5TW9kcyA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHRlc3QoJ3F1aWNrIHBpY2sgYWNjZXNzIC0gYWNjZXB0IHdpdGhvdXQgbW9kaWZpZXIga2V5cyBjYWxscyBhY2NlcHQsIG5vdCBhdHRhY2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSAoUmVnaXN0cnkuYXM8SVF1aWNrQWNjZXNzUmVnaXN0cnk+KEV4dGVuc2lvbnMuUXVpY2thY2Nlc3MpKTtcblx0XHRjb25zdCByZXN0b3JlID0gKHJlZ2lzdHJ5IGFzIFF1aWNrQWNjZXNzUmVnaXN0cnkpLmNsZWFyKCk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0cnkucmVnaXN0ZXJRdWlja0FjY2Vzc1Byb3ZpZGVyKGF0dGFjaFByb3ZpZGVyRGVzY3JpcHRvcikpO1xuXHRcdHJlc2V0QXR0YWNoU3RhdGUoKTtcblxuXHRcdGFjY2Vzc29yLnF1aWNrSW5wdXRTZXJ2aWNlLnF1aWNrQWNjZXNzLnNob3coJ2F0dGFjaCcpO1xuXHRcdGF3YWl0IGFjY2Vzc29yLnF1aWNrSW5wdXRTZXJ2aWNlLmFjY2VwdCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF0dGFjaFRlc3RBY2NlcHRDYWxsZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdHRhY2hUZXN0QXR0YWNoQ2FsbGVkLCBmYWxzZSk7XG5cblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0cmVzdG9yZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdxdWljayBwaWNrIGFjY2VzcyAtIGFjY2VwdCB3aXRoIGN0cmxDbWQgY2FsbHMgYXR0YWNoIGluc3RlYWQgb2YgYWNjZXB0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gKFJlZ2lzdHJ5LmFzPElRdWlja0FjY2Vzc1JlZ2lzdHJ5PihFeHRlbnNpb25zLlF1aWNrYWNjZXNzKSk7XG5cdFx0Y29uc3QgcmVzdG9yZSA9IChyZWdpc3RyeSBhcyBRdWlja0FjY2Vzc1JlZ2lzdHJ5KS5jbGVhcigpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyUXVpY2tBY2Nlc3NQcm92aWRlcihhdHRhY2hQcm92aWRlckRlc2NyaXB0b3IpKTtcblx0XHRyZXNldEF0dGFjaFN0YXRlKCk7XG5cblx0XHRhY2Nlc3Nvci5xdWlja0lucHV0U2VydmljZS5xdWlja0FjY2Vzcy5zaG93KCdhdHRhY2gnKTtcblx0XHRhd2FpdCBhY2Nlc3Nvci5xdWlja0lucHV0U2VydmljZS5hY2NlcHQoeyBjdHJsQ21kOiB0cnVlLCBhbHQ6IGZhbHNlLCBzaGlmdDogZmFsc2UgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXR0YWNoVGVzdEFjY2VwdENhbGxlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdHRhY2hUZXN0QXR0YWNoQ2FsbGVkLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF0dGFjaFRlc3RBdHRhY2hLZXlNb2RzLCB7IGN0cmxDbWQ6IHRydWUsIGFsdDogZmFsc2UsIHNoaWZ0OiBmYWxzZSB9KTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRyZXN0b3JlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3F1aWNrIHBpY2sgYWNjZXNzIC0gYWNjZXB0IHdpdGggYWx0IGNhbGxzIGF0dGFjaCBpbnN0ZWFkIG9mIGFjY2VwdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IChSZWdpc3RyeS5hczxJUXVpY2tBY2Nlc3NSZWdpc3RyeT4oRXh0ZW5zaW9ucy5RdWlja2FjY2VzcykpO1xuXHRcdGNvbnN0IHJlc3RvcmUgPSAocmVnaXN0cnkgYXMgUXVpY2tBY2Nlc3NSZWdpc3RyeSkuY2xlYXIoKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3RlclF1aWNrQWNjZXNzUHJvdmlkZXIoYXR0YWNoUHJvdmlkZXJEZXNjcmlwdG9yKSk7XG5cdFx0cmVzZXRBdHRhY2hTdGF0ZSgpO1xuXG5cdFx0YWNjZXNzb3IucXVpY2tJbnB1dFNlcnZpY2UucXVpY2tBY2Nlc3Muc2hvdygnYXR0YWNoJyk7XG5cdFx0YXdhaXQgYWNjZXNzb3IucXVpY2tJbnB1dFNlcnZpY2UuYWNjZXB0KHsgY3RybENtZDogZmFsc2UsIGFsdDogdHJ1ZSwgc2hpZnQ6IGZhbHNlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF0dGFjaFRlc3RBY2NlcHRDYWxsZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXR0YWNoVGVzdEF0dGFjaENhbGxlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhdHRhY2hUZXN0QXR0YWNoS2V5TW9kcywgeyBjdHJsQ21kOiBmYWxzZSwgYWx0OiB0cnVlLCBzaGlmdDogZmFsc2UgfSk7XG5cblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0cmVzdG9yZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdxdWljayBwaWNrIGFjY2VzcyAtIGFjY2VwdCB3aXRoIG1vZGlmaWVyIGtleXMgYnV0IG5vIGF0dGFjaCBtZXRob2QgY2FsbHMgYWNjZXB0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gKFJlZ2lzdHJ5LmFzPElRdWlja0FjY2Vzc1JlZ2lzdHJ5PihFeHRlbnNpb25zLlF1aWNrYWNjZXNzKSk7XG5cdFx0Y29uc3QgcmVzdG9yZSA9IChyZWdpc3RyeSBhcyBRdWlja0FjY2Vzc1JlZ2lzdHJ5KS5jbGVhcigpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyUXVpY2tBY2Nlc3NQcm92aWRlcihub0F0dGFjaFByb3ZpZGVyRGVzY3JpcHRvcikpO1xuXHRcdHJlc2V0QXR0YWNoU3RhdGUoKTtcblxuXHRcdGFjY2Vzc29yLnF1aWNrSW5wdXRTZXJ2aWNlLnF1aWNrQWNjZXNzLnNob3coJ25vYXR0YWNoJyk7XG5cdFx0YXdhaXQgYWNjZXNzb3IucXVpY2tJbnB1dFNlcnZpY2UuYWNjZXB0KHsgY3RybENtZDogdHJ1ZSwgYWx0OiBmYWxzZSwgc2hpZnQ6IGZhbHNlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF0dGFjaFRlc3RBY2NlcHRDYWxsZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdHRhY2hUZXN0QXR0YWNoQ2FsbGVkLCBmYWxzZSk7XG5cblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0cmVzdG9yZSgpO1xuXHR9KTtcblxuXHQvLyNlbmRyZWdpb25cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBK0Isa0JBQTZEO0FBQzVGLFNBQXFDLDBCQUE4RDtBQUVuRyxTQUFTLHFCQUFxQiwrQkFBK0Isd0JBQXdCO0FBQ3JGLFNBQVMsaUJBQWlCLG9CQUFpQztBQUMzRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQ0FBMkU7QUFDcEYsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsYUFBYTtBQUV0QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLG9CQUFvQixzQkFBc0I7QUFDbkQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQ0FBZ0M7QUFFekMsTUFBTSxlQUFlLE1BQU07QUFFMUIsUUFBTSxjQUFjLHdDQUF3QztBQUM1RCxNQUFJO0FBQ0osTUFBSTtBQUVKLE1BQUksd0JBQXdCO0FBQzVCLE1BQUksMEJBQTBCO0FBQzlCLE1BQUksMEJBQTBCO0FBRTlCLE1BQUksa0JBQWtCO0FBQ3RCLE1BQUksb0JBQW9CO0FBQ3hCLE1BQUksb0JBQW9CO0FBRXhCLE1BQUksa0JBQWtCO0FBQ3RCLE1BQUksb0JBQW9CO0FBQ3hCLE1BQUksb0JBQW9CO0FBRXhCLE1BQUksa0JB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
