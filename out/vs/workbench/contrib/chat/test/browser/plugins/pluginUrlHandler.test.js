import assert from "assert";
import { encodeBase64, VSBuffer } from "../../../../../../base/common/buffer.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../../../platform/notification/common/notification.js";
import { IURLService } from "../../../../../../platform/url/common/url.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { IHostService } from "../../../../../services/host/browser/host.js";
import { IExtensionsWorkbenchService } from "../../../../extensions/common/extensions.js";
import { PluginUrlHandler } from "../../../browser/pluginUrlHandler.js";
import { ChatConfiguration } from "../../../common/constants.js";
import { IPluginInstallService } from "../../../common/plugins/pluginInstallService.js";
import { MarketplaceReferenceKind, MarketplaceType, PluginSourceKind } from "../../../common/plugins/pluginMarketplaceService.js";
function toBase64(value) {
  return encodeBase64(VSBuffer.fromString(value));
}
suite("PluginUrlHandler", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createHandler(stateOverrides) {
    const state = {
      dialogConfirmResult: true,
      installedSources: [],
      configUpdates: [],
      openedEditorInputs: [],
      openSearchQueries: [],
      installFromSourceResult: { success: true },
      notifications: [],
      ...stateOverrides
    };
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IURLService, {
      registerHandler: () => ({ dispose() {
      } })
    });
    instantiationService.stub(IPluginInstallService, {
      installPluginFromSource: async (source, _options) => {
        state.installedSources.push(source);
        return state.installFromSourceResult;
      }
    });
    instantiationService.stub(IDialogService, {
      confirm: async () => ({ confirmed: state.dialogConfirmResult })
    });
    const configService = new TestConfigurationService({
      [ChatConfiguration.PluginMarketplaces]: ["existing/marketplace"]
    });
    const origUpdate = configService.updateValue.bind(configService);
    configService.updateValue = async (key, value, target) => {
      state.configUpdates.push({ key, value, target: target ?? ConfigurationTarget.USER });
      return origUpdate(key, value);
    };
    instantiationService.stub(IConfigurationService, configService);
    instantiationService.stub(IHostService, {
      focus: async () => {
      }
    });
    instantiationService.stub(IExtensionsWorkbenchService, {
      openSearch: (query) => {
        state.openSearchQueries.push(query);
      }
    });
    instantiationService.stub(IEditorService, {
      openEditor: async (input) => {
        state.openedEditorInputs.push(input);
        store.add(input);
        return void 0;
      }
    });
    instantiationService.stub(IInstantiationService, instantiationService);
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(INotificationService, {
      notify: (notification) => {
        state.notifications.push({ severity: notification.severity, message: notification.message });
        return void 0;
      }
    });
    const handler = store.add(instantiationService.createInstance(PluginUrlHandler));
    return { handler, state };
  }
  function uri(path, query) {
    return URI.from({ scheme: "vscode", authority: "chat-plugin", path, query });
  }
  test("ignores unrelated authority", async () => {
    const { handler } = createHandler();
    assert.strictEqual(await handler.handleURL(URI.parse("vscode://other/install?source=foo/bar")), false);
  });
  test("ignores unknown path", async () => {
    const { handler } = createHandler();
    assert.strictEqual(await handler.handleURL(uri("/unknown", "source=foo/bar")), false);
  });
  test("install with plain-text owner/repo source", async () => {
    const { handler, state } = createHandler();
    const result = await handler.handleURL(uri("/install", "source=anthropics/claude-code"));
    assert.strictEqual(result, true);
    assert.deepStrictEqual(state.installedSources, ["anthropics/claude-code"]);
  });
  test("install with base64-encoded source", async () => {
    const { handler, state } = createHandler();
    const encoded = toBase64("anthropics/claude-code");
    const result = await handler.handleURL(uri("/install", `source=${encoded}`));
    assert.strictEqual(result, true);
    assert.deepStrictEqual(state.installedSources, ["anthropics/claude-code"]);
  });
  test("install does nothing when dialog is declined", async () => {
    const { handler, state } = createHandler({ dialogConfirmResult: false });
    const result = await handler.handleURL(uri("/install", "source=anthropics/claude-code"));
    assert.strictEqual(result, true);
    assert.deepStrictEqual(state.installedSources, []);
  });
  test("install handles missing source param", async () => {
    const { handler, state } = createHandler();
    const result = await handler.handleURL(uri("/install", ""));
    assert.strictEqual(result, true);
    assert.deepStrictEqual(state.installedSources, []);
  });
  test("install handles invalid source", async () => {
    const { handler, state } = createHandler();
    const result = await handler.handleURL(uri("/install", "source=not-a-valid-ref"));
    assert.strictEqual(result, true);
    assert.deepStrictEqual(state.installedSources, []);
  });
  test("install rejects local file URI sources", async () => {
    const { handler, state } = createHandler();
    const encoded = toBase64("file:///home/user/my-plugin");
    const result = await handler.handleURL(uri("/install", `source=${encodeURIComponent(encoded)}`));
    assert.strictEqual(result, true);
    assert.deepStrictEqual(state.installedSources, []);
  });
  test("add-marketplace with plain-text ref", async () => {
    const { handler, state } = createHandler();
    const result = await handler.handleURL(uri("/add-marketplace", "ref=anthropics/claude-code"));
    assert.strictEqual(result, true);
    assert.strictEqual(state.configUpdates.length, 1);
    assert.deepStrictEqual(state.configUpdates[0].value, ["existing/marketplace", "anthropics/claude-code"]);
  });
  test("add-marketplace with base64-encoded ref", async () => {
    const { handler, state } = createHandler();
    const encoded = toBase64("anthropics/claude-code");
    const result = await handler.handleURL(uri("/add-marketplace", `ref=${encoded}`));
    assert.strictEqual(result, true);
    assert.strictEqual(state.configUpdates.length, 1);
    assert.deepStrictEqual(state.configUpdates[0].value, ["existing/marketplace", "anthropics/claude-code"]);
  });
  test("add-marketplace does not duplicate existing entry", async () => {
    const { handler, state } = createHandler();
    const result = await handler.handleURL(uri("/add-marketplace", "ref=existing/marketplace"));
    assert.strictEqual(result, true);
    assert.strictEqual(state.configUpdates.length, 0);
  });
  test("add-marketplace deduplicates by canonical ID", async () => {
    const { handler, state } = createHandler();
    const result = await handler.handleURL(uri("/add-marketplace", "ref=existing%2Fmarketplace"));
    assert.strictEqual(result, true);
    assert.strictEqual(state.configUpdates.length, 0);
  });
  test("add-marketplace does nothing when dialog is declined", async () => {
    const { handler, state } = createHandler({ dialogConfirmResult: false });
    const result = await handler.handleURL(uri("/add-marketplace", "ref=anthropics/claude-code"));
    assert.strictEqual(result, true);
    assert.strictEqual(state.configUpdates.length, 0);
  });
  test("add-marketplace handles missing ref param", async () => {
    const { handler, state } = createHandler();
    const result = await handler.handleURL(uri("/add-marketplace", ""));
    assert.strictEqual(result, true);
    assert.strictEqual(state.configUpdates.length, 0);
  });
  test("add-marketplace handles invalid ref", async () => {
    const { handler, state } = createHandler();
    const result = await handler.handleURL(uri("/add-marketplace", "ref=not-valid"));
    assert.strictEqual(result, true);
    assert.strictEqual(state.configUpdates.length, 0);
  });
  function makeMarketplacePlugin(name, marketplace) {
    const [owner, repo] = marketplace.split("/");
    const ref = {
      kind: MarketplaceReferenceKind.GitHubShorthand,
      rawValue: marketplace,
      displayLabel: marketplace,
      canonicalId: `github:${owner.toLowerCase()}/${repo.toLowerCase()}`,
      cloneUrl: `https://github.com/${marketplace}.git`,
      githubRepo: marketplace,
      cacheSegments: ["github.com", owner, repo]
    };
    return {
      name,
      description: `${name} description`,
      version: "1.0.0",
      source: name,
      sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: name },
      marketplace,
      marketplaceReference: ref,
      marketplaceType: MarketplaceType.OpenPlugin
    };
  }
  test("install with plugin param targets the plugin and opens editor", async () => {
    const plugin = makeMarketplacePlugin("my-plugin", "acme/plugins");
    const { handler, state } = createHandler({
      installFromSourceResult: { success: true, matchedPlugin: plugin }
    });
    const result = await handler.handleURL(uri("/install", "source=acme/plugins&plugin=my-plugin"));
    assert.strictEqual(result, true);
    assert.deepStrictEqual(state.installedSources, ["acme/plugins"]);
    assert.strictEqual(state.openedEditorInputs.length, 1);
    assert.strictEqual(state.openedEditorInputs[0].item.name, "my-plugin");
  });
  test("install with plugin param does nothing when dialog is declined", async () => {
    const plugin = makeMarketplacePlugin("my-plugin", "acme/plugins");
    const { handler, state } = createHandler({
      dialogConfirmResult: false,
      installFromSourceResult: { success: true, matchedPlugin: plugin }
    });
    const result = await handler.handleURL(uri("/install", "source=acme/plugins&plugin=my-plugin"));
    assert.strictEqual(result, true);
    assert.deepStrictEqual(state.installedSources, []);
    assert.strictEqual(state.openedEditorInputs.length, 0);
    assert.strictEqual(state.openSearchQueries.length, 0);
  });
  test("install with base64-encoded plugin param opens editor", async () => {
    const plugin = makeMarketplacePlugin("my-plugin", "acme/plugins");
    const { handler, state } = createHandler({
      installFromSourceResult: { success: true, matchedPlugin: plugin }
    });
    const encodedPlugin = toBase64("my-plugin");
    const result = await handler.handleURL(uri("/install", `source=acme/plugins&plugin=${encodedPlugin}`));
    assert.strictEqual(result, true);
    assert.strictEqual(state.openedEditorInputs.length, 1);
    assert.strictEqual(state.openedEditorInputs[0].item.name, "my-plugin");
  });
  test("install with plugin param falls back to search on failure", async () => {
    const { handler, state } = createHandler({
      installFromSourceResult: { success: false, message: "Plugin not found" }
    });
    const result = await handler.handleURL(uri("/install", "source=acme/plugins&plugin=nonexistent"));
    assert.strictEqual(result, true);
    assert.strictEqual(state.openedEditorInputs.length, 0);
    assert.strictEqual(state.openSearchQueries.length, 1);
    assert.ok(state.openSearchQueries[0].includes("acme/plugins"));
  });
  test("install with plugin param falls back to search when no matchedPlugin", async () => {
    const { handler, state } = createHandler({
      installFromSourceResult: { success: true }
    });
    const result = await handler.handleURL(uri("/install", "source=acme/plugins&plugin=my-plugin"));
    assert.strictEqual(result, true);
    assert.strictEqual(state.openedEditorInputs.length, 0);
    assert.strictEqual(state.openSearchQueries.length, 1);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHBsdWdpbnNcXHBsdWdpblVybEhhbmRsZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuY29kZUJhc2U2NCwgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElVUkxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJsL2NvbW1vbi91cmwuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBBZ2VudFBsdWdpbkVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFBsdWdpbkVkaXRvci9hZ2VudFBsdWdpbkVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFBsdWdpblVybEhhbmRsZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BsdWdpblVybEhhbmRsZXIuanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElJbnN0YWxsUGx1Z2luRnJvbVNvdXJjZU9wdGlvbnMsIElJbnN0YWxsUGx1Z2luRnJvbVNvdXJjZVJlc3VsdCwgSVBsdWdpbkluc3RhbGxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BsdWdpbnMvcGx1Z2luSW5zdGFsbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1hcmtldHBsYWNlUGx1Z2luLCBNYXJrZXRwbGFjZVJlZmVyZW5jZUtpbmQsIE1hcmtldHBsYWNlVHlwZSwgUGx1Z2luU291cmNlS2luZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wbHVnaW5zL3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5qcyc7XG5cbmZ1bmN0aW9uIHRvQmFzZTY0KHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gZW5jb2RlQmFzZTY0KFZTQnVmZmVyLmZyb21TdHJpbmcodmFsdWUpKTtcbn1cblxuc3VpdGUoJ1BsdWdpblVybEhhbmRsZXInLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0aW50ZXJmYWNlIE1vY2tTdGF0ZSB7XG5cdFx0ZGlhbG9nQ29uZmlybVJlc3VsdDogYm9vbGVhbjtcblx0XHRpbnN0YWxsZWRTb3VyY2VzOiBzdHJpbmdbXTtcblx0XHRjb25maWdVcGRhdGVzOiB7IGtleTogc3RyaW5nOyB2YWx1ZTogdW5rbm93bjsgdGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0IH1bXTtcblx0XHRvcGVuZWRFZGl0b3JJbnB1dHM6IEFnZW50UGx1Z2luRWRpdG9ySW5wdXRbXTtcblx0XHRvcGVuU2VhcmNoUXVlcmllczogc3RyaW5nW107XG5cdFx0aW5zdGFsbEZyb21Tb3VyY2VSZXN1bHQ6IElJbnN0YWxsUGx1Z2luRnJvbVNvdXJjZVJlc3VsdDtcblx0XHRub3RpZmljYXRpb25zOiB7IHNldmVyaXR5OiBudW1iZXI7IG1lc3NhZ2U6IHN0cmluZyB9W107XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVIYW5kbGVyKHN0YXRlT3ZlcnJpZGVzPzogUGFydGlhbDxNb2NrU3RhdGU+KTogeyBoYW5kbGVyOiBQbHVnaW5VcmxIYW5kbGVyOyBzdGF0ZTogTW9ja1N0YXRlIH0ge1xuXHRcdGNvbnN0IHN0YXRlOiBNb2NrU3RhdGUgPSB7XG5cdFx0XHRkaWFsb2dDb25maXJtUmVzdWx0OiB0cnVlLFxuXHRcdFx0aW5zdGFsbGVkU291cmNlczogW10sXG5cdFx0XHRjb25maWdVcGRhdGVzOiBbXSxcblx0XHRcdG9wZW5lZEVkaXRvcklucHV0czogW10sXG5cdFx0XHRvcGVuU2VhcmNoUXVlcmllczogW10sXG5cdFx0XHRpbnN0YWxsRnJvbVNvdXJjZVJlc3VsdDogeyBzdWNjZXNzOiB0cnVlIH0sXG5cdFx0XHRub3RpZmljYXRpb25zOiBbXSxcblx0XHRcdC4uLnN0YXRlT3ZlcnJpZGVzLFxuXHRcdH07XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVVJMU2VydmljZSwge1xuXHRcdFx0cmVnaXN0ZXJIYW5kbGVyOiAoKSA9PiAoeyBkaXNwb3NlKCkgeyB9IH0pLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJVVJMU2VydmljZSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQbHVnaW5JbnN0YWxsU2VydmljZSwge1xuXHRcdFx0aW5zdGFsbFBsdWdpbkZyb21Tb3VyY2U6IGFzeW5jIChzb3VyY2U6IHN0cmluZywgX29wdGlvbnM/OiBJSW5zdGFsbFBsdWdpbkZyb21Tb3VyY2VPcHRpb25zKSA9PiB7XG5cdFx0XHRcdHN0YXRlLmluc3RhbGxlZFNvdXJjZXMucHVzaChzb3VyY2UpO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGUuaW5zdGFsbEZyb21Tb3VyY2VSZXN1bHQ7XG5cdFx0XHR9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJUGx1Z2luSW5zdGFsbFNlcnZpY2UpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGlhbG9nU2VydmljZSwge1xuXHRcdFx0Y29uZmlybTogYXN5bmMgKCkgPT4gKHsgY29uZmlybWVkOiBzdGF0ZS5kaWFsb2dDb25maXJtUmVzdWx0IH0pLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJRGlhbG9nU2VydmljZSk7XG5cblx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luTWFya2V0cGxhY2VzXTogWydleGlzdGluZy9tYXJrZXRwbGFjZSddLFxuXHRcdH0pO1xuXHRcdC8vIFRyYWNrIHVwZGF0ZVZhbHVlIGNhbGxzXG5cdFx0Y29uc3Qgb3JpZ1VwZGF0ZSA9IGNvbmZpZ1NlcnZpY2UudXBkYXRlVmFsdWUuYmluZChjb25maWdTZXJ2aWNlKTtcblx0XHRjb25maWdTZXJ2aWNlLnVwZGF0ZVZhbHVlID0gYXN5bmMgKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93biwgdGFyZ2V0PzogQ29uZmlndXJhdGlvblRhcmdldCkgPT4ge1xuXHRcdFx0c3RhdGUuY29uZmlnVXBkYXRlcy5wdXNoKHsga2V5LCB2YWx1ZSwgdGFyZ2V0OiB0YXJnZXQgPz8gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSIH0pO1xuXHRcdFx0cmV0dXJuIG9yaWdVcGRhdGUoa2V5LCB2YWx1ZSk7XG5cdFx0fTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlnU2VydmljZSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElIb3N0U2VydmljZSwge1xuXHRcdFx0Zm9jdXM6IGFzeW5jICgpID0+IHsgfSxcblx0XHR9IGFzIHVua25vd24gYXMgSUhvc3RTZXJ2aWNlKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLCB7XG5cdFx0XHRvcGVuU2VhcmNoOiAocXVlcnk6IHN0cmluZykgPT4geyBzdGF0ZS5vcGVuU2VhcmNoUXVlcmllcy5wdXNoKHF1ZXJ5KTsgfSxcblx0XHR9IGFzIHVua25vd24gYXMgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVkaXRvclNlcnZpY2UsIHtcblx0XHRcdG9wZW5FZGl0b3I6IGFzeW5jIChpbnB1dDogQWdlbnRQbHVnaW5FZGl0b3JJbnB1dCkgPT4ge1xuXHRcdFx0XHRzdGF0ZS5vcGVuZWRFZGl0b3JJbnB1dHMucHVzaChpbnB1dCk7XG5cdFx0XHRcdHN0b3JlLmFkZChpbnB1dCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJRWRpdG9yU2VydmljZSk7XG5cblx0XHQvLyBJSW5zdGFudGlhdGlvblNlcnZpY2U6IGRlbGVnYXRlIGNyZWF0ZUluc3RhbmNlIHRvIHRoZSBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgaXRzZWxmXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJSW5zdGFudGlhdGlvblNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5vdGlmaWNhdGlvblNlcnZpY2UsIHtcblx0XHRcdG5vdGlmeTogKG5vdGlmaWNhdGlvbjogeyBzZXZlcml0eTogbnVtYmVyOyBtZXNzYWdlOiBzdHJpbmcgfSkgPT4ge1xuXHRcdFx0XHRzdGF0ZS5ub3RpZmljYXRpb25zLnB1c2goeyBzZXZlcml0eTogbm90aWZpY2F0aW9uLnNldmVyaXR5LCBtZXNzYWdlOiBub3RpZmljYXRpb24ubWVzc2FnZSB9KTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGhhbmRsZXIgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUGx1Z2luVXJsSGFuZGxlcikpO1xuXHRcdHJldHVybiB7IGhhbmRsZXIsIHN0YXRlIH07XG5cdH1cblxuXHRmdW5jdGlvbiB1cmkocGF0aDogc3RyaW5nLCBxdWVyeTogc3RyaW5nKTogVVJJIHtcblx0XHRyZXR1cm4gVVJJLmZyb20oeyBzY2hlbWU6ICd2c2NvZGUnLCBhdXRob3JpdHk6ICdjaGF0LXBsdWdpbicsIHBhdGgsIHF1ZXJ5IH0pO1xuXHR9XG5cblx0Ly8gLS0tIHJvdXRpbmcgLS0tXG5cblx0dGVzdCgnaWdub3JlcyB1bnJlbGF0ZWQgYXV0aG9yaXR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaGFuZGxlciB9ID0gY3JlYXRlSGFuZGxlcigpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBoYW5kbGVyLmhhbmRsZVVSTChVUkkucGFyc2UoJ3ZzY29kZTovL290aGVyL2luc3RhbGw/c291cmNlPWZvby9iYXInKSksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyB1bmtub3duIHBhdGgnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBoYW5kbGVyIH0gPSBjcmVhdGVIYW5kbGVyKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGhhbmRsZXIuaGFuZGxlVVJMKHVyaSgnL3Vua25vd24nLCAnc291cmNlPWZvby9iYXInKSksIGZhbHNlKTtcblx0fSk7XG5cblx0Ly8gLS0tIGluc3RhbGw6IHBsYWluIHRleHQgLS0tXG5cblx0dGVzdCgnaW5zdGFsbCB3aXRoIHBsYWluLXRleHQgb3duZXIvcmVwbyBzb3VyY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBoYW5kbGVyLCBzdGF0ZSB9ID0gY3JlYXRlSGFuZGxlcigpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuaGFuZGxlVVJMKHVyaSgnL2luc3RhbGwnLCAnc291cmNlPWFudGhyb3BpY3MvY2xhdWRlLWNvZGUnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZS5pbnN0YWxsZWRTb3VyY2VzLCBbJ2FudGhyb3BpY3MvY2xhdWRlLWNvZGUnXSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBpbnN0YWxsOiBiYXNlNjQgLS0tXG5cblx0dGVzdCgnaW5zdGFsbCB3aXRoIGJhc2U2NC1lbmNvZGVkIHNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGhhbmRsZXIsIHN0YXRlIH0gPSBjcmVhdGVIYW5kbGVyKCk7XG5cdFx0Y29uc3QgZW5jb2RlZCA9IHRvQmFzZTY0KCdhbnRocm9waWNzL2NsYXVkZS1jb2RlJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlci5oYW5kbGVVUkwodXJpKCcvaW5zdGFsbCcsIGBzb3VyY2U9JHtlbmNvZGVkfWApKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlLmluc3RhbGxlZFNvdXJjZXMsIFsnYW50aHJvcGljcy9jbGF1ZGUtY29kZSddKTtcblx0fSk7XG5cblx0Ly8gLS0tIGluc3RhbGw6IGRpYWxvZyBkZWNsaW5lZCAtLS1cblxuXHR0ZXN0KCdpbnN0YWxsIGRvZXMgbm90aGluZyB3aGVuIGRpYWxvZyBpcyBkZWNsaW5lZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGhhbmRsZXIsIHN0YXRlIH0gPSBjcmVhdGVIYW5kbGVyKHsgZGlhbG9nQ29uZmlybVJlc3VsdDogZmFsc2UgfSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlci5oYW5kbGVVUkwodXJpKCcvaW5zdGFsbCcsICdzb3VyY2U9YW50aHJvcGljcy9jbGF1ZGUtY29kZScpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlLmluc3RhbGxlZFNvdXJjZXMsIFtdKTtcblx0fSk7XG5cblx0Ly8gLS0tIGluc3RhbGw6IG1pc3NpbmcvaW52YWxpZCBzb3VyY2UgLS0tXG5cblx0dGVzdCgnaW5zdGFsbCBoYW5kbGVzIG1pc3Npbmcgc291cmNlIHBhcmFtJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc3RhdGUgfSA9IGNyZWF0ZUhhbmRsZXIoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyLmhhbmRsZVVSTCh1cmkoJy9pbnN0YWxsJywgJycpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlLmluc3RhbGxlZFNvdXJjZXMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zdGFsbCBoYW5kbGVzIGludmFsaWQgc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc3RhdGUgfSA9IGNyZWF0ZUhhbmRsZXIoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyLmhhbmRsZVVSTCh1cmkoJy9pbnN0YWxsJywgJ3NvdXJjZT1ub3QtYS12YWxpZC1yZWYnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZS5pbnN0YWxsZWRTb3VyY2VzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc3RhbGwgcmVqZWN0cyBsb2NhbCBmaWxlIFVSSSBzb3VyY2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc3RhdGUgfSA9IGNyZWF0ZUhhbmRsZXIoKTtcblx0XHRjb25zdCBlbmNvZGVkID0gdG9CYXNlNjQoJ2ZpbGU6Ly8vaG9tZS91c2VyL215LXBsdWdpbicpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuaGFuZGxlVVJMKHVyaSgnL2luc3RhbGwnLCBgc291cmNlPSR7ZW5jb2RlVVJJQ29tcG9uZW50KGVuY29kZWQpfWApKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlLmluc3RhbGxlZFNvdXJjZXMsIFtdKTtcblx0fSk7XG5cblx0Ly8gLS0tIGFkZC1tYXJrZXRwbGFjZTogcGxhaW4gdGV4dCAtLS1cblxuXHR0ZXN0KCdhZGQtbWFya2V0cGxhY2Ugd2l0aCBwbGFpbi10ZXh0IHJlZicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGhhbmRsZXIsIHN0YXRlIH0gPSBjcmVhdGVIYW5kbGVyKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlci5oYW5kbGVVUkwodXJpKCcvYWRkLW1hcmtldHBsYWNlJywgJ3JlZj1hbnRocm9waWNzL2NsYXVkZS1jb2RlJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5jb25maWdVcGRhdGVzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZS5jb25maWdVcGRhdGVzWzBdLnZhbHVlLCBbJ2V4aXN0aW5nL21hcmtldHBsYWNlJywgJ2FudGhyb3BpY3MvY2xhdWRlLWNvZGUnXSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBhZGQtbWFya2V0cGxhY2U6IGJhc2U2NCAtLS1cblxuXHR0ZXN0KCdhZGQtbWFya2V0cGxhY2Ugd2l0aCBiYXNlNjQtZW5jb2RlZCByZWYnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBoYW5kbGVyLCBzdGF0ZSB9ID0gY3JlYXRlSGFuZGxlcigpO1xuXHRcdGNvbnN0IGVuY29kZWQgPSB0b0Jhc2U2NCgnYW50aHJvcGljcy9jbGF1ZGUtY29kZScpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuaGFuZGxlVVJMKHVyaSgnL2FkZC1tYXJrZXRwbGFjZScsIGByZWY9JHtlbmNvZGVkfWApKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuY29uZmlnVXBkYXRlcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUuY29uZmlnVXBkYXRlc1swXS52YWx1ZSwgWydleGlzdGluZy9tYXJrZXRwbGFjZScsICdhbnRocm9waWNzL2NsYXVkZS1jb2RlJ10pO1xuXHR9KTtcblxuXHQvLyAtLS0gYWRkLW1hcmtldHBsYWNlOiBkZWR1cCAtLS1cblxuXHR0ZXN0KCdhZGQtbWFya2V0cGxhY2UgZG9lcyBub3QgZHVwbGljYXRlIGV4aXN0aW5nIGVudHJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc3RhdGUgfSA9IGNyZWF0ZUhhbmRsZXIoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyLmhhbmRsZVVSTCh1cmkoJy9hZGQtbWFya2V0cGxhY2UnLCAncmVmPWV4aXN0aW5nL21hcmtldHBsYWNlJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5jb25maWdVcGRhdGVzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZC1tYXJrZXRwbGFjZSBkZWR1cGxpY2F0ZXMgYnkgY2Fub25pY2FsIElEJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc3RhdGUgfSA9IGNyZWF0ZUhhbmRsZXIoKTtcblx0XHQvLyBUaGUgVVJMIGZvcm0gb2YgdGhlIHNhbWUgR2l0SHViIHNob3J0aGFuZCBzaG91bGQgbWF0Y2ggY2Fub25pY2FsbHlcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyLmhhbmRsZVVSTCh1cmkoJy9hZGQtbWFya2V0cGxhY2UnLCAncmVmPWV4aXN0aW5nJTJGbWFya2V0cGxhY2UnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmNvbmZpZ1VwZGF0ZXMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0Ly8gLS0tIGFkZC1tYXJrZXRwbGFjZTogZGlhbG9nIGRlY2xpbmVkIC0tLVxuXG5cdHRlc3QoJ2FkZC1tYXJrZXRwbGFjZSBkb2VzIG5vdGhpbmcgd2hlbiBkaWFsb2cgaXMgZGVjbGluZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBoYW5kbGVyLCBzdGF0ZSB9ID0gY3JlYXRlSGFuZGxlcih7IGRpYWxvZ0NvbmZpcm1SZXN1bHQ6IGZhbHNlIH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuaGFuZGxlVVJMKHVyaSgnL2FkZC1tYXJrZXRwbGFjZScsICdyZWY9YW50aHJvcGljcy9jbGF1ZGUtY29kZScpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuY29uZmlnVXBkYXRlcy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHQvLyAtLS0gYWRkLW1hcmtldHBsYWNlOiBtaXNzaW5nL2ludmFsaWQgcmVmIC0tLVxuXG5cdHRlc3QoJ2FkZC1tYXJrZXRwbGFjZSBoYW5kbGVzIG1pc3NpbmcgcmVmIHBhcmFtJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc3RhdGUgfSA9IGNyZWF0ZUhhbmRsZXIoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyLmhhbmRsZVVSTCh1cmkoJy9hZGQtbWFya2V0cGxhY2UnLCAnJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5jb25maWdVcGRhdGVzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZC1tYXJrZXRwbGFjZSBoYW5kbGVzIGludmFsaWQgcmVmJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc3RhdGUgfSA9IGNyZWF0ZUhhbmRsZXIoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyLmhhbmRsZVVSTCh1cmkoJy9hZGQtbWFya2V0cGxhY2UnLCAncmVmPW5vdC12YWxpZCcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuY29uZmlnVXBkYXRlcy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHQvLyAtLS0gaW5zdGFsbCB3aXRoIHBsdWdpbiB0YXJnZXRpbmcgLS0tXG5cblx0ZnVuY3Rpb24gbWFrZU1hcmtldHBsYWNlUGx1Z2luKG5hbWU6IHN0cmluZywgbWFya2V0cGxhY2U6IHN0cmluZyk6IElNYXJrZXRwbGFjZVBsdWdpbiB7XG5cdFx0Y29uc3QgW293bmVyLCByZXBvXSA9IG1hcmtldHBsYWNlLnNwbGl0KCcvJyk7XG5cdFx0Y29uc3QgcmVmID0ge1xuXHRcdFx0a2luZDogTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLkdpdEh1YlNob3J0aGFuZCBhcyBjb25zdCxcblx0XHRcdHJhd1ZhbHVlOiBtYXJrZXRwbGFjZSxcblx0XHRcdGRpc3BsYXlMYWJlbDogbWFya2V0cGxhY2UsXG5cdFx0XHRjYW5vbmljYWxJZDogYGdpdGh1Yjoke293bmVyLnRvTG93ZXJDYXNlKCl9LyR7cmVwby50b0xvd2VyQ2FzZSgpfWAsXG5cdFx0XHRjbG9uZVVybDogYGh0dHBzOi8vZ2l0aHViLmNvbS8ke21hcmtldHBsYWNlfS5naXRgLFxuXHRcdFx0Z2l0aHViUmVwbzogbWFya2V0cGxhY2UsXG5cdFx0XHRjYWNoZVNlZ21lbnRzOiBbJ2dpdGh1Yi5jb20nLCBvd25lciwgcmVwb10sXG5cdFx0fTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBgJHtuYW1lfSBkZXNjcmlwdGlvbmAsXG5cdFx0XHR2ZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0c291cmNlOiBuYW1lLFxuXHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogbmFtZSB9LFxuXHRcdFx0bWFya2V0cGxhY2UsXG5cdFx0XHRtYXJrZXRwbGFjZVJlZmVyZW5jZTogcmVmLFxuXHRcdFx0bWFya2V0cGxhY2VUeXBlOiBNYXJrZXRwbGFjZVR5cGUuT3BlblBsdWdpbixcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgnaW5zdGFsbCB3aXRoIHBsdWdpbiBwYXJhbSB0YXJnZXRzIHRoZSBwbHVnaW4gYW5kIG9wZW5zIGVkaXRvcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwbHVnaW4gPSBtYWtlTWFya2V0cGxhY2VQbHVnaW4oJ215LXBsdWdpbicsICdhY21lL3BsdWdpbnMnKTtcblx0XHRjb25zdCB7IGhhbmRsZXIsIHN0YXRlIH0gPSBjcmVhdGVIYW5kbGVyKHtcblx0XHRcdGluc3RhbGxGcm9tU291cmNlUmVzdWx0OiB7IHN1Y2Nlc3M6IHRydWUsIG1hdGNoZWRQbHVnaW46IHBsdWdpbiB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuaGFuZGxlVVJMKHVyaSgnL2luc3RhbGwnLCAnc291cmNlPWFjbWUvcGx1Z2lucyZwbHVnaW49bXktcGx1Z2luJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUuaW5zdGFsbGVkU291cmNlcywgWydhY21lL3BsdWdpbnMnXSk7XG5cdFx0Ly8gUGx1Z2luIGVkaXRvciB3YXMgb3BlbmVkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLm9wZW5lZEVkaXRvcklucHV0cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5vcGVuZWRFZGl0b3JJbnB1dHNbMF0uaXRlbS5uYW1lLCAnbXktcGx1Z2luJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc3RhbGwgd2l0aCBwbHVnaW4gcGFyYW0gZG9lcyBub3RoaW5nIHdoZW4gZGlhbG9nIGlzIGRlY2xpbmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBsdWdpbiA9IG1ha2VNYXJrZXRwbGFjZVBsdWdpbignbXktcGx1Z2luJywgJ2FjbWUvcGx1Z2lucycpO1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc3RhdGUgfSA9IGNyZWF0ZUhhbmRsZXIoe1xuXHRcdFx0ZGlhbG9nQ29uZmlybVJlc3VsdDogZmFsc2UsXG5cdFx0XHRpbnN0YWxsRnJvbVNvdXJjZVJlc3VsdDogeyBzdWNjZXNzOiB0cnVlLCBtYXRjaGVkUGx1Z2luOiBwbHVnaW4gfSxcblx0XHR9KTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyLmhhbmRsZVVSTCh1cmkoJy9pbnN0YWxsJywgJ3NvdXJjZT1hY21lL3BsdWdpbnMmcGx1Z2luPW15LXBsdWdpbicpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlLmluc3RhbGxlZFNvdXJjZXMsIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUub3BlbmVkRWRpdG9ySW5wdXRzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLm9wZW5TZWFyY2hRdWVyaWVzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc3RhbGwgd2l0aCBiYXNlNjQtZW5jb2RlZCBwbHVnaW4gcGFyYW0gb3BlbnMgZWRpdG9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBsdWdpbiA9IG1ha2VNYXJrZXRwbGFjZVBsdWdpbignbXktcGx1Z2luJywgJ2FjbWUvcGx1Z2lucycpO1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc3RhdGUgfSA9IGNyZWF0ZUhhbmRsZXIoe1xuXHRcdFx0aW5zdGFsbEZyb21Tb3VyY2VSZXN1bHQ6IHsgc3VjY2VzczogdHJ1ZSwgbWF0Y2hlZFBsdWdpbjogcGx1Z2luIH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgZW5jb2RlZFBsdWdpbiA9IHRvQmFzZTY0KCdteS1wbHVnaW4nKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyLmhhbmRsZVVSTCh1cmkoJy9pbnN0YWxsJywgYHNvdXJjZT1hY21lL3BsdWdpbnMmcGx1Z2luPSR7ZW5jb2RlZFBsdWdpbn1gKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLm9wZW5lZEVkaXRvcklucHV0cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5vcGVuZWRFZGl0b3JJbnB1dHNbMF0uaXRlbS5uYW1lLCAnbXktcGx1Z2luJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc3RhbGwgd2l0aCBwbHVnaW4gcGFyYW0gZmFsbHMgYmFjayB0byBzZWFyY2ggb24gZmFpbHVyZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGhhbmRsZXIsIHN0YXRlIH0gPSBjcmVhdGVIYW5kbGVyKHtcblx0XHRcdGluc3RhbGxGcm9tU291cmNlUmVzdWx0OiB7IHN1Y2Nlc3M6IGZhbHNlLCBtZXNzYWdlOiAnUGx1Z2luIG5vdCBmb3VuZCcgfSxcblx0XHR9KTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyLmhhbmRsZVVSTCh1cmkoJy9pbnN0YWxsJywgJ3NvdXJjZT1hY21lL3BsdWdpbnMmcGx1Z2luPW5vbmV4aXN0ZW50JykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5vcGVuZWRFZGl0b3JJbnB1dHMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUub3BlblNlYXJjaFF1ZXJpZXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQub2soc3RhdGUub3BlblNlYXJjaFF1ZXJpZXNbMF0uaW5jbHVkZXMoJ2FjbWUvcGx1Z2lucycpKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zdGFsbCB3aXRoIHBsdWdpbiBwYXJhbSBmYWxscyBiYWNrIHRvIHNlYXJjaCB3aGVuIG5vIG1hdGNoZWRQbHVnaW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBoYW5kbGVyLCBzdGF0ZSB9ID0gY3JlYXRlSGFuZGxlcih7XG5cdFx0XHRpbnN0YWxsRnJvbVNvdXJjZVJlc3VsdDogeyBzdWNjZXNzOiB0cnVlIH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlci5oYW5kbGVVUkwodXJpKCcvaW5zdGFsbCcsICdzb3VyY2U9YWNtZS9wbHVnaW5zJnBsdWdpbj1teS1wbHVnaW4nKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLm9wZW5lZEVkaXRvcklucHV0cy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5vcGVuU2VhcmNoUXVlcmllcy5sZW5ndGgsIDEpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsY0FBYyxnQkFBZ0I7QUFDdkMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMscUJBQXFCLDZCQUE2QjtBQUMzRCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUNBQW1DO0FBRTVDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQTBFLDZCQUE2QjtBQUN2RyxTQUE2QiwwQkFBMEIsaUJBQWlCLHdCQUF3QjtBQUVoRyxTQUFTLFNBQVMsT0FBdUI7QUFDeEMsU0FBTyxhQUFhLFNBQVMsV0FBVyxLQUFLLENBQUM7QUFDL0M7QUFFQSxNQUFNLG9CQUFvQixNQUFNO0FBQy9CLFFBQU0sUUFBUSx3Q0FBd0M7QUFZdEQsV0FBUyxjQUFjLGdCQUFzRjtBQUM1RyxVQUFNLFFBQW1CO0FBQUEsTUFDeEIscUJBQXFCO0FBQUEsTUFDckIsa0JBQWtCLENBQUM7QUFBQSxNQUNuQixlQUFlLENBQUM7QUFBQSxNQUNoQixvQkFBb0IsQ0FBQztBQUFBLE1BQ3JCLG1CQUFtQixDQUFDO0FBQUEsTUFDcEIseUJBQXlCLEVBQUUsU0FBUyxLQUFLO0FBQUEsTUFDekMsZUFBZSxDQUFDO0FBQUEsTUFDaEIsR0FBRztBQUFBLElBQ0o7QUFFQSxVQUFNLHVCQUF1QixNQUFNLElBQUksSUFBSSx5QkFBeUIsQ0FBQztBQUVyRSx5QkFBcUIsS0FBSyxh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
