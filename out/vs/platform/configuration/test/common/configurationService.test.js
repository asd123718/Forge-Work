import assert from "assert";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Event } from "../../../../base/common/event.js";
import { Schemas } from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ConfigurationTarget, isConfigured } from "../../common/configuration.js";
import { Extensions as ConfigurationExtensions } from "../../common/configurationRegistry.js";
import { ConfigurationService } from "../../common/configurationService.js";
import { FileService } from "../../../files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../log/common/log.js";
import { FilePolicyService } from "../../../policy/common/filePolicyService.js";
import { NullPolicyService } from "../../../policy/common/policy.js";
import { Registry } from "../../../registry/common/platform.js";
import { PolicyCategory } from "../../../../base/common/policy.js";
suite("ConfigurationService.test.ts", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let fileService;
  let settingsResource;
  setup(async () => {
    fileService = disposables.add(new FileService(new NullLogService()));
    const diskFileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider(Schemas.file, diskFileSystemProvider));
    settingsResource = URI.file("settings.json");
  });
  test("simple", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "foo": "bar" }'));
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    const config = testObject.getValue();
    assert.ok(config);
    assert.strictEqual(config.foo, "bar");
  }));
  test("config gets flattened", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "testworkbench.editor.tabs": true }'));
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    const config = testObject.getValue();
    assert.ok(config);
    assert.ok(config.testworkbench);
    assert.ok(config.testworkbench.editor);
    assert.strictEqual(config.testworkbench.editor.tabs, true);
  }));
  test("error case does not explode", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await fileService.writeFile(settingsResource, VSBuffer.fromString(",,,,"));
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    const config = testObject.getValue();
    assert.ok(config);
  }));
  test("missing file does not explode", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const testObject = disposables.add(new ConfigurationService(URI.file("__testFile"), fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    const config = testObject.getValue();
    assert.ok(config);
  }));
  test("trigger configuration change event when file does not exist", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    return new Promise((c, e) => {
      disposables.add(Event.filter(testObject.onDidChangeConfiguration, (e2) => e2.source === ConfigurationTarget.USER)(() => {
        assert.strictEqual(testObject.getValue("foo"), "bar");
        c();
      }));
      fileService.writeFile(settingsResource, VSBuffer.fromString('{ "foo": "bar" }')).catch(e);
    });
  }));
  test("trigger configuration change event when file exists", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "foo": "bar" }'));
    await testObject.initialize();
    return new Promise((c) => {
      disposables.add(Event.filter(testObject.onDidChangeConfiguration, (e) => e.source === ConfigurationTarget.USER)(async (e) => {
        assert.strictEqual(testObject.getValue("foo"), "barz");
        c();
      }));
      fileService.writeFile(settingsResource, VSBuffer.fromString('{ "foo": "barz" }'));
    });
  }));
  test("reloadConfiguration", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "foo": "bar" }'));
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    let config = testObject.getValue();
    assert.ok(config);
    assert.strictEqual(config.foo, "bar");
    await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "foo": "changed" }'));
    await testObject.reloadConfiguration();
    config = testObject.getValue();
    assert.ok(config);
    assert.strictEqual(config.foo, "changed");
  }));
  test("model defaults", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
    configurationRegistry.registerConfiguration({
      "id": "_test",
      "type": "object",
      "properties": {
        "configuration.service.testSetting": {
          "type": "string",
          "default": "isSet"
        }
      }
    });
    let testObject = disposables.add(new ConfigurationService(URI.file("__testFile"), fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    let setting = testObject.getValue();
    assert.ok(setting);
    assert.strictEqual(setting.configuration.service.testSetting, "isSet");
    await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "testworkbench.editor.tabs": true }'));
    testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    setting = testObject.getValue();
    assert.ok(setting);
    assert.strictEqual(setting.configuration.service.testSetting, "isSet");
    await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "configuration.service.testSetting": "isChanged" }'));
    await testObject.reloadConfiguration();
    setting = testObject.getValue();
    assert.ok(setting);
    assert.strictEqual(setting.configuration.service.testSetting, "isChanged");
  }));
  test("lookup", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
    configurationRegistry.registerConfiguration({
      "id": "_test",
      "type": "object",
      "properties": {
        "lookup.service.testSetting": {
          "type": "string",
          "default": "isSet"
        }
      }
    });
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    let res = testObject.inspect("something.missing");
    assert.strictEqual(res.value, void 0);
    assert.strictEqual(res.defaultValue, void 0);
    assert.strictEqual(res.userValue, void 0);
    assert.strictEqual(isConfigured(res), false);
    res = testObject.inspect("lookup.service.testSetting");
    assert.strictEqual(res.defaultValue, "isSet");
    assert.strictEqual(res.value, "isSet");
    assert.strictEqual(res.userValue, void 0);
    assert.strictEqual(isConfigured(res), false);
    await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "lookup.service.testSetting": "bar" }'));
    await testObject.reloadConfiguration();
    res = testObject.inspect("lookup.service.testSetting");
    assert.strictEqual(res.defaultValue, "isSet");
    assert.strictEqual(res.userValue, "bar");
    assert.strictEqual(res.value, "bar");
    assert.strictEqual(isConfigured(res), true);
  }));
  test("lookup with null", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
    configurationRegistry.registerConfiguration({
      "id": "_testNull",
      "type": "object",
      "properties": {
        "lookup.service.testNullSetting": {
          "type": "null"
        }
      }
    });
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    let res = testObject.inspect("lookup.service.testNullSetting");
    assert.strictEqual(res.defaultValue, null);
    assert.strictEqual(res.value, null);
    assert.strictEqual(res.userValue, void 0);
    await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "lookup.service.testNullSetting": null }'));
    await testObject.reloadConfiguration();
    res = testObject.inspect("lookup.service.testNullSetting");
    assert.strictEqual(res.defaultValue, null);
    assert.strictEqual(res.value, null);
    assert.strictEqual(res.userValue, null);
  }));
  test("update configuration", async () => {
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
    configurationRegistry.registerConfiguration({
      "id": "_test",
      "type": "object",
      "properties": {
        "configurationService.testSetting": {
          "type": "string",
          "default": "isSet"
        }
      }
    });
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    await testObject.updateValue("configurationService.testSetting", "value");
    assert.strictEqual(testObject.getValue("configurationService.testSetting"), "value");
  });
  test("update configuration when exist", async () => {
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
    configurationRegistry.registerConfiguration({
      "id": "_test",
      "type": "object",
      "properties": {
        "configurationService.testSetting": {
          "type": "string",
          "default": "isSet"
        }
      }
    });
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    await testObject.updateValue("configurationService.testSetting", "value");
    await testObject.updateValue("configurationService.testSetting", "updatedValue");
    assert.strictEqual(testObject.getValue("configurationService.testSetting"), "updatedValue");
  });
  test("update configuration to default value should remove", async () => {
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
    configurationRegistry.registerConfiguration({
      "id": "_test",
      "type": "object",
      "properties": {
        "configurationService.testSetting": {
          "type": "string",
          "default": "isSet"
        }
      }
    });
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    await testObject.updateValue("configurationService.testSetting", "value");
    await testObject.updateValue("configurationService.testSetting", "isSet");
    const inspect = testObject.inspect("configurationService.testSetting");
    assert.strictEqual(inspect.userValue, void 0);
  });
  test("update configuration should remove when undefined is passed", async () => {
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
    configurationRegistry.registerConfiguration({
      "id": "_test",
      "type": "object",
      "properties": {
        "configurationService.testSetting": {
          "type": "string",
          "default": "isSet"
        }
      }
    });
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    await testObject.updateValue("configurationService.testSetting", "value");
    await testObject.updateValue("configurationService.testSetting", void 0);
    const inspect = testObject.inspect("configurationService.testSetting");
    assert.strictEqual(inspect.userValue, void 0);
  });
  test("update unknown configuration", async () => {
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    await testObject.updateValue("configurationService.unknownSetting", "value");
    assert.strictEqual(testObject.getValue("configurationService.unknownSetting"), "value");
  });
  test("update configuration in non user target throws error", async () => {
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
    configurationRegistry.registerConfiguration({
      "id": "_test",
      "type": "object",
      "properties": {
        "configurationService.testSetting": {
          "type": "string",
          "default": "isSet"
        }
      }
    });
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    try {
      await testObject.updateValue("configurationService.testSetting", "value", ConfigurationTarget.WORKSPACE);
      assert.fail("Should fail with error");
    } catch (e) {
    }
  });
  test("update configuration throws error for policy setting", async () => {
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
    configurationRegistry.registerConfiguration({
      "id": "_test",
      "type": "object",
      "properties": {
        "configurationService.policySetting": {
          "type": "string",
          "default": "isSet",
          policy: {
            name: "configurationService.policySetting",
            category: PolicyCategory.Extensions,
            minimumVersion: "1.0.0",
            localization: { description: { key: "", value: "" } }
          }
        }
      }
    });
    const logService = new NullLogService();
    const policyFile = URI.file("policies.json");
    await fileService.writeFile(policyFile, VSBuffer.fromString('{ "configurationService.policySetting": "policyValue" }'));
    const policyService = disposables.add(new FilePolicyService(policyFile, fileService, logService));
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, policyService, logService));
    await testObject.initialize();
    try {
      await testObject.updateValue("configurationService.policySetting", "value");
      assert.fail("Should throw error");
    } catch (error) {
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcY29uZmlndXJhdGlvblxcdGVzdFxcY29tbW9uXFxjb25maWd1cmF0aW9uU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgaXNDb25maWd1cmVkIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vY29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgRmlsZVBvbGljeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wb2xpY3kvY29tbW9uL2ZpbGVQb2xpY3lTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE51bGxQb2xpY3lTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcG9saWN5L2NvbW1vbi9wb2xpY3kuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgUG9saWN5Q2F0ZWdvcnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wb2xpY3kuanMnO1xuXG5zdWl0ZSgnQ29uZmlndXJhdGlvblNlcnZpY2UudGVzdC50cycsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlO1xuXHRsZXQgc2V0dGluZ3NSZXNvdXJjZTogVVJJO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBkaXNrRmlsZVN5c3RlbVByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmZpbGUsIGRpc2tGaWxlU3lzdGVtUHJvdmlkZXIpKTtcblx0XHRzZXR0aW5nc1Jlc291cmNlID0gVVJJLmZpbGUoJ3NldHRpbmdzLmpzb24nKTtcblx0fSk7XG5cblx0dGVzdCgnc2ltcGxlJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHNldHRpbmdzUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3sgXCJmb29cIjogXCJiYXJcIiB9JykpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENvbmZpZ3VyYXRpb25TZXJ2aWNlKHNldHRpbmdzUmVzb3VyY2UsIGZpbGVTZXJ2aWNlLCBuZXcgTnVsbFBvbGljeVNlcnZpY2UoKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblx0XHRjb25zdCBjb25maWcgPSB0ZXN0T2JqZWN0LmdldFZhbHVlPHtcblx0XHRcdGZvbzogc3RyaW5nO1xuXHRcdH0+KCk7XG5cblx0XHRhc3NlcnQub2soY29uZmlnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlnLmZvbywgJ2JhcicpO1xuXHR9KSk7XG5cblx0dGVzdCgnY29uZmlnIGdldHMgZmxhdHRlbmVkJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHNldHRpbmdzUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3sgXCJ0ZXN0d29ya2JlbmNoLmVkaXRvci50YWJzXCI6IHRydWUgfScpKTtcblxuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENvbmZpZ3VyYXRpb25TZXJ2aWNlKHNldHRpbmdzUmVzb3VyY2UsIGZpbGVTZXJ2aWNlLCBuZXcgTnVsbFBvbGljeVNlcnZpY2UoKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblx0XHRjb25zdCBjb25maWcgPSB0ZXN0T2JqZWN0LmdldFZhbHVlPHtcblx0XHRcdHRlc3R3b3JrYmVuY2g6IHtcblx0XHRcdFx0ZWRpdG9yOiB7XG5cdFx0XHRcdFx0dGFiczogYm9vbGVhbjtcblx0XHRcdFx0fTtcblx0XHRcdH07XG5cdFx0fT4oKTtcblxuXHRcdGFzc2VydC5vayhjb25maWcpO1xuXHRcdGFzc2VydC5vayhjb25maWcudGVzdHdvcmtiZW5jaCk7XG5cdFx0YXNzZXJ0Lm9rKGNvbmZpZy50ZXN0d29ya2JlbmNoLmVkaXRvcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpZy50ZXN0d29ya2JlbmNoLmVkaXRvci50YWJzLCB0cnVlKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2Vycm9yIGNhc2UgZG9lcyBub3QgZXhwbG9kZScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShzZXR0aW5nc1Jlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCcsLCwsJykpO1xuXG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ29uZmlndXJhdGlvblNlcnZpY2Uoc2V0dGluZ3NSZXNvdXJjZSwgZmlsZVNlcnZpY2UsIG5ldyBOdWxsUG9saWN5U2VydmljZSgpLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXHRcdGNvbnN0IGNvbmZpZyA9IHRlc3RPYmplY3QuZ2V0VmFsdWU8e1xuXHRcdFx0Zm9vOiBzdHJpbmc7XG5cdFx0fT4oKTtcblxuXHRcdGFzc2VydC5vayhjb25maWcpO1xuXHR9KSk7XG5cblx0dGVzdCgnbWlzc2luZyBmaWxlIGRvZXMgbm90IGV4cGxvZGUnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDb25maWd1cmF0aW9uU2VydmljZShVUkkuZmlsZSgnX190ZXN0RmlsZScpLCBmaWxlU2VydmljZSwgbmV3IE51bGxQb2xpY3lTZXJ2aWNlKCksIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cblx0XHRjb25zdCBjb25maWcgPSB0ZXN0T2JqZWN0LmdldFZhbHVlPHsgZm9vOiBzdHJpbmcgfT4oKTtcblxuXHRcdGFzc2VydC5vayhjb25maWcpO1xuXHR9KSk7XG5cblx0dGVzdCgndHJpZ2dlciBjb25maWd1cmF0aW9uIGNoYW5nZSBldmVudCB3aGVuIGZpbGUgZG9lcyBub3QgZXhpc3QnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDb25maWd1cmF0aW9uU2VydmljZShzZXR0aW5nc1Jlc291cmNlLCBmaWxlU2VydmljZSwgbmV3IE51bGxQb2xpY3lTZXJ2aWNlKCksIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChjLCBlKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoRXZlbnQuZmlsdGVyKHRlc3RPYmplY3Qub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLCBlID0+IGUuc291cmNlID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpKCgpID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuZ2V0VmFsdWUoJ2ZvbycpLCAnYmFyJyk7XG5cdFx0XHRcdGMoKTtcblx0XHRcdH0pKTtcblx0XHRcdGZpbGVTZXJ2aWNlLndyaXRlRmlsZShzZXR0aW5nc1Jlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7IFwiZm9vXCI6IFwiYmFyXCIgfScpKS5jYXRjaChlKTtcblx0XHR9KTtcblxuXHR9KSk7XG5cblx0dGVzdCgndHJpZ2dlciBjb25maWd1cmF0aW9uIGNoYW5nZSBldmVudCB3aGVuIGZpbGUgZXhpc3RzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ29uZmlndXJhdGlvblNlcnZpY2Uoc2V0dGluZ3NSZXNvdXJjZSwgZmlsZVNlcnZpY2UsIG5ldyBOdWxsUG9saWN5U2VydmljZSgpLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShzZXR0aW5nc1Jlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7IFwiZm9vXCI6IFwiYmFyXCIgfScpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigoYykgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50LmZpbHRlcih0ZXN0T2JqZWN0Lm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgZSA9PiBlLnNvdXJjZSA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKShhc3luYyAoZSkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5nZXRWYWx1ZSgnZm9vJyksICdiYXJ6Jyk7XG5cdFx0XHRcdGMoKTtcblx0XHRcdH0pKTtcblx0XHRcdGZpbGVTZXJ2aWNlLndyaXRlRmlsZShzZXR0aW5nc1Jlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7IFwiZm9vXCI6IFwiYmFyelwiIH0nKSk7XG5cdFx0fSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdyZWxvYWRDb25maWd1cmF0aW9uJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHNldHRpbmdzUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3sgXCJmb29cIjogXCJiYXJcIiB9JykpO1xuXG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ29uZmlndXJhdGlvblNlcnZpY2Uoc2V0dGluZ3NSZXNvdXJjZSwgZmlsZVNlcnZpY2UsIG5ldyBOdWxsUG9saWN5U2VydmljZSgpLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXHRcdGxldCBjb25maWcgPSB0ZXN0T2JqZWN0LmdldFZhbHVlPHtcblx0XHRcdGZvbzogc3RyaW5nO1xuXHRcdH0+KCk7XG5cdFx0YXNzZXJ0Lm9rKGNvbmZpZyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpZy5mb28sICdiYXInKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoc2V0dGluZ3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygneyBcImZvb1wiOiBcImNoYW5nZWRcIiB9JykpO1xuXG5cdFx0Ly8gZm9yY2UgYSByZWxvYWQgdG8gZ2V0IGxhdGVzdFxuXHRcdGF3YWl0IHRlc3RPYmplY3QucmVsb2FkQ29uZmlndXJhdGlvbigpO1xuXHRcdGNvbmZpZyA9IHRlc3RPYmplY3QuZ2V0VmFsdWU8e1xuXHRcdFx0Zm9vOiBzdHJpbmc7XG5cdFx0fT4oKTtcblx0XHRhc3NlcnQub2soY29uZmlnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlnLmZvbywgJ2NoYW5nZWQnKTtcblx0fSkpO1xuXG5cdHRlc3QoJ21vZGVsIGRlZmF1bHRzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0aW50ZXJmYWNlIElUZXN0U2V0dGluZyB7XG5cdFx0XHRjb25maWd1cmF0aW9uOiB7XG5cdFx0XHRcdHNlcnZpY2U6IHtcblx0XHRcdFx0XHR0ZXN0U2V0dGluZzogc3RyaW5nO1xuXHRcdFx0XHR9O1xuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCBjb25maWd1cmF0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdCdpZCc6ICdfdGVzdCcsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdjb25maWd1cmF0aW9uLnNlcnZpY2UudGVzdFNldHRpbmcnOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdFx0XHQnZGVmYXVsdCc6ICdpc1NldCdcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0bGV0IHRlc3RPYmplY3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENvbmZpZ3VyYXRpb25TZXJ2aWNlKFVSSS5maWxlKCdfX3Rlc3RGaWxlJyksIGZpbGVTZXJ2aWNlLCBuZXcgTnVsbFBvbGljeVNlcnZpY2UoKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblx0XHRsZXQgc2V0dGluZyA9IHRlc3RPYmplY3QuZ2V0VmFsdWU8SVRlc3RTZXR0aW5nPigpO1xuXG5cdFx0YXNzZXJ0Lm9rKHNldHRpbmcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXR0aW5nLmNvbmZpZ3VyYXRpb24uc2VydmljZS50ZXN0U2V0dGluZywgJ2lzU2V0Jyk7XG5cblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoc2V0dGluZ3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygneyBcInRlc3R3b3JrYmVuY2guZWRpdG9yLnRhYnNcIjogdHJ1ZSB9JykpO1xuXHRcdHRlc3RPYmplY3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENvbmZpZ3VyYXRpb25TZXJ2aWNlKHNldHRpbmdzUmVzb3VyY2UsIGZpbGVTZXJ2aWNlLCBuZXcgTnVsbFBvbGljeVNlcnZpY2UoKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblxuXHRcdHNldHRpbmcgPSB0ZXN0T2JqZWN0LmdldFZhbHVlPElUZXN0U2V0dGluZz4oKTtcblxuXHRcdGFzc2VydC5vayhzZXR0aW5nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2V0dGluZy5jb25maWd1cmF0aW9uLnNlcnZpY2UudGVzdFNldHRpbmcsICdpc1NldCcpO1xuXG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHNldHRpbmdzUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3sgXCJjb25maWd1cmF0aW9uLnNlcnZpY2UudGVzdFNldHRpbmdcIjogXCJpc0NoYW5nZWRcIiB9JykpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5yZWxvYWRDb25maWd1cmF0aW9uKCk7XG5cdFx0c2V0dGluZyA9IHRlc3RPYmplY3QuZ2V0VmFsdWU8SVRlc3RTZXR0aW5nPigpO1xuXHRcdGFzc2VydC5vayhzZXR0aW5nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2V0dGluZy5jb25maWd1cmF0aW9uLnNlcnZpY2UudGVzdFNldHRpbmcsICdpc0NoYW5nZWQnKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2xvb2t1cCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2lkJzogJ190ZXN0Jyxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J2xvb2t1cC5zZXJ2aWNlLnRlc3RTZXR0aW5nJzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiAnaXNTZXQnXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENvbmZpZ3VyYXRpb25TZXJ2aWNlKHNldHRpbmdzUmVzb3VyY2UsIGZpbGVTZXJ2aWNlLCBuZXcgTnVsbFBvbGljeVNlcnZpY2UoKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblxuXHRcdGxldCByZXMgPSB0ZXN0T2JqZWN0Lmluc3BlY3QoJ3NvbWV0aGluZy5taXNzaW5nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy52YWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmRlZmF1bHRWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnVzZXJWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNDb25maWd1cmVkKHJlcyksIGZhbHNlKTtcblxuXHRcdHJlcyA9IHRlc3RPYmplY3QuaW5zcGVjdCgnbG9va3VwLnNlcnZpY2UudGVzdFNldHRpbmcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmRlZmF1bHRWYWx1ZSwgJ2lzU2V0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy52YWx1ZSwgJ2lzU2V0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy51c2VyVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQ29uZmlndXJlZChyZXMpLCBmYWxzZSk7XG5cblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoc2V0dGluZ3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygneyBcImxvb2t1cC5zZXJ2aWNlLnRlc3RTZXR0aW5nXCI6IFwiYmFyXCIgfScpKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QucmVsb2FkQ29uZmlndXJhdGlvbigpO1xuXHRcdHJlcyA9IHRlc3RPYmplY3QuaW5zcGVjdCgnbG9va3VwLnNlcnZpY2UudGVzdFNldHRpbmcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmRlZmF1bHRWYWx1ZSwgJ2lzU2V0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy51c2VyVmFsdWUsICdiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnZhbHVlLCAnYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQ29uZmlndXJlZChyZXMpLCB0cnVlKTtcblxuXHR9KSk7XG5cblx0dGVzdCgnbG9va3VwIHdpdGggbnVsbCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2lkJzogJ190ZXN0TnVsbCcsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdsb29rdXAuc2VydmljZS50ZXN0TnVsbFNldHRpbmcnOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnbnVsbCcsXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENvbmZpZ3VyYXRpb25TZXJ2aWNlKHNldHRpbmdzUmVzb3VyY2UsIGZpbGVTZXJ2aWNlLCBuZXcgTnVsbFBvbGljeVNlcnZpY2UoKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblxuXHRcdGxldCByZXMgPSB0ZXN0T2JqZWN0Lmluc3BlY3QoJ2xvb2t1cC5zZXJ2aWNlLnRlc3ROdWxsU2V0dGluZycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuZGVmYXVsdFZhbHVlLCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnZhbHVlLCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnVzZXJWYWx1ZSwgdW5kZWZpbmVkKTtcblxuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShzZXR0aW5nc1Jlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7IFwibG9va3VwLnNlcnZpY2UudGVzdE51bGxTZXR0aW5nXCI6IG51bGwgfScpKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QucmVsb2FkQ29uZmlndXJhdGlvbigpO1xuXG5cdFx0cmVzID0gdGVzdE9iamVjdC5pbnNwZWN0KCdsb29rdXAuc2VydmljZS50ZXN0TnVsbFNldHRpbmcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmRlZmF1bHRWYWx1ZSwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy52YWx1ZSwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy51c2VyVmFsdWUsIG51bGwpO1xuXHR9KSk7XG5cblx0dGVzdCgndXBkYXRlIGNvbmZpZ3VyYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0XHQnaWQnOiAnX3Rlc3QnLFxuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnY29uZmlndXJhdGlvblNlcnZpY2UudGVzdFNldHRpbmcnOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdFx0XHQnZGVmYXVsdCc6ICdpc1NldCdcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENvbmZpZ3VyYXRpb25TZXJ2aWNlKHNldHRpbmdzUmVzb3VyY2UsIGZpbGVTZXJ2aWNlLCBuZXcgTnVsbFBvbGljeVNlcnZpY2UoKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QudXBkYXRlVmFsdWUoJ2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnRlc3RTZXR0aW5nJywgJ3ZhbHVlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuZ2V0VmFsdWUoJ2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnRlc3RTZXR0aW5nJyksICd2YWx1ZScpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGUgY29uZmlndXJhdGlvbiB3aGVuIGV4aXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2lkJzogJ190ZXN0Jyxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnRlc3RTZXR0aW5nJzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiAnaXNTZXQnXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDb25maWd1cmF0aW9uU2VydmljZShzZXR0aW5nc1Jlc291cmNlLCBmaWxlU2VydmljZSwgbmV3IE51bGxQb2xpY3lTZXJ2aWNlKCksIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnVwZGF0ZVZhbHVlKCdjb25maWd1cmF0aW9uU2VydmljZS50ZXN0U2V0dGluZycsICd2YWx1ZScpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QudXBkYXRlVmFsdWUoJ2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnRlc3RTZXR0aW5nJywgJ3VwZGF0ZWRWYWx1ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmdldFZhbHVlKCdjb25maWd1cmF0aW9uU2VydmljZS50ZXN0U2V0dGluZycpLCAndXBkYXRlZFZhbHVlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZSBjb25maWd1cmF0aW9uIHRvIGRlZmF1bHQgdmFsdWUgc2hvdWxkIHJlbW92ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdCdpZCc6ICdfdGVzdCcsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdjb25maWd1cmF0aW9uU2VydmljZS50ZXN0U2V0dGluZyc6IHtcblx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdCdkZWZhdWx0JzogJ2lzU2V0J1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ29uZmlndXJhdGlvblNlcnZpY2Uoc2V0dGluZ3NSZXNvdXJjZSwgZmlsZVNlcnZpY2UsIG5ldyBOdWxsUG9saWN5U2VydmljZSgpLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC51cGRhdGVWYWx1ZSgnY29uZmlndXJhdGlvblNlcnZpY2UudGVzdFNldHRpbmcnLCAndmFsdWUnKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnVwZGF0ZVZhbHVlKCdjb25maWd1cmF0aW9uU2VydmljZS50ZXN0U2V0dGluZycsICdpc1NldCcpO1xuXHRcdGNvbnN0IGluc3BlY3QgPSB0ZXN0T2JqZWN0Lmluc3BlY3QoJ2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnRlc3RTZXR0aW5nJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zcGVjdC51c2VyVmFsdWUsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZSBjb25maWd1cmF0aW9uIHNob3VsZCByZW1vdmUgd2hlbiB1bmRlZmluZWQgaXMgcGFzc2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2lkJzogJ190ZXN0Jyxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnRlc3RTZXR0aW5nJzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiAnaXNTZXQnXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDb25maWd1cmF0aW9uU2VydmljZShzZXR0aW5nc1Jlc291cmNlLCBmaWxlU2VydmljZSwgbmV3IE51bGxQb2xpY3lTZXJ2aWNlKCksIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnVwZGF0ZVZhbHVlKCdjb25maWd1cmF0aW9uU2VydmljZS50ZXN0U2V0dGluZycsICd2YWx1ZScpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QudXBkYXRlVmFsdWUoJ2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnRlc3RTZXR0aW5nJywgdW5kZWZpbmVkKTtcblx0XHRjb25zdCBpbnNwZWN0ID0gdGVzdE9iamVjdC5pbnNwZWN0KCdjb25maWd1cmF0aW9uU2VydmljZS50ZXN0U2V0dGluZycpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3BlY3QudXNlclZhbHVlLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGUgdW5rbm93biBjb25maWd1cmF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENvbmZpZ3VyYXRpb25TZXJ2aWNlKHNldHRpbmdzUmVzb3VyY2UsIGZpbGVTZXJ2aWNlLCBuZXcgTnVsbFBvbGljeVNlcnZpY2UoKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QudXBkYXRlVmFsdWUoJ2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVua25vd25TZXR0aW5nJywgJ3ZhbHVlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuZ2V0VmFsdWUoJ2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVua25vd25TZXR0aW5nJyksICd2YWx1ZScpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGUgY29uZmlndXJhdGlvbiBpbiBub24gdXNlciB0YXJnZXQgdGhyb3dzIGVycm9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2lkJzogJ190ZXN0Jyxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnRlc3RTZXR0aW5nJzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiAnaXNTZXQnXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDb25maWd1cmF0aW9uU2VydmljZShzZXR0aW5nc1Jlc291cmNlLCBmaWxlU2VydmljZSwgbmV3IE51bGxQb2xpY3lTZXJ2aWNlKCksIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC51cGRhdGVWYWx1ZSgnY29uZmlndXJhdGlvblNlcnZpY2UudGVzdFNldHRpbmcnLCAndmFsdWUnLCBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSk7XG5cdFx0XHRhc3NlcnQuZmFpbCgnU2hvdWxkIGZhaWwgd2l0aCBlcnJvcicpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdC8vIHN1Y2NlZXNzXG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGUgY29uZmlndXJhdGlvbiB0aHJvd3MgZXJyb3IgZm9yIHBvbGljeSBzZXR0aW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2lkJzogJ190ZXN0Jyxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnBvbGljeVNldHRpbmcnOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdFx0XHQnZGVmYXVsdCc6ICdpc1NldCcsXG5cdFx0XHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdFx0XHRuYW1lOiAnY29uZmlndXJhdGlvblNlcnZpY2UucG9saWN5U2V0dGluZycsXG5cdFx0XHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuRXh0ZW5zaW9ucyxcblx0XHRcdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0XHRcdFx0bG9jYWxpemF0aW9uOiB7IGRlc2NyaXB0aW9uOiB7IGtleTogJycsIHZhbHVlOiAnJyB9LCB9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcG9saWN5RmlsZSA9IFVSSS5maWxlKCdwb2xpY2llcy5qc29uJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHBvbGljeUZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3sgXCJjb25maWd1cmF0aW9uU2VydmljZS5wb2xpY3lTZXR0aW5nXCI6IFwicG9saWN5VmFsdWVcIiB9JykpO1xuXHRcdGNvbnN0IHBvbGljeVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVQb2xpY3lTZXJ2aWNlKHBvbGljeUZpbGUsIGZpbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ29uZmlndXJhdGlvblNlcnZpY2Uoc2V0dGluZ3NSZXNvdXJjZSwgZmlsZVNlcnZpY2UsIHBvbGljeVNlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnVwZGF0ZVZhbHVlKCdjb25maWd1cmF0aW9uU2VydmljZS5wb2xpY3lTZXR0aW5nJywgJ3ZhbHVlJyk7XG5cdFx0XHRhc3NlcnQuZmFpbCgnU2hvdWxkIHRocm93IGVycm9yJyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdC8vIHN1Y2NlZXNzXG5cdFx0fVxuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMscUJBQXFCLG9CQUFvQjtBQUNsRCxTQUFTLGNBQWMsK0JBQXVEO0FBQzlFLFNBQVMsNEJBQTRCO0FBRXJDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0JBQXNCO0FBRS9CLE1BQU0sZ0NBQWdDLE1BQU07QUFFM0MsUUFBTSxjQUFjLHdDQUF3QztBQUU1RCxNQUFJO0FBQ0osTUFBSTtBQUVKLFFBQU0sWUFBWTtB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
