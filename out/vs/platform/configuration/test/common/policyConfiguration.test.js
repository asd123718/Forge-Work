import assert from "assert";
import { Event } from "../../../../base/common/event.js";
import { URI } from "../../../../base/common/uri.js";
import { DefaultConfiguration, PolicyConfiguration } from "../../common/configurations.js";
import { FileService } from "../../../files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../log/common/log.js";
import { Extensions } from "../../common/configurationRegistry.js";
import { Registry } from "../../../registry/common/platform.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { deepClone } from "../../../../base/common/objects.js";
import { FilePolicyService } from "../../../policy/common/filePolicyService.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { PolicyCategory } from "../../../../base/common/policy.js";
suite("PolicyConfiguration", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let testObject;
  let fileService;
  let policyService;
  const policyFile = URI.file("policyFile").with({ scheme: "vscode-tests" });
  const policyConfigurationNode = {
    "id": "policyConfiguration",
    "order": 1,
    "title": "a",
    "type": "object",
    "properties": {
      "policy.settingA": {
        "type": "string",
        "default": "defaultValueA",
        policy: {
          name: "PolicySettingA",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } }
        }
      },
      "policy.settingB": {
        "type": "string",
        "default": "defaultValueB",
        policy: {
          name: "PolicySettingB",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } }
        }
      },
      "policy.objectSetting": {
        "type": "object",
        "default": {},
        policy: {
          name: "PolicyObjectSetting",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } }
        }
      },
      "policy.arraySetting": {
        "type": "object",
        "default": [],
        policy: {
          name: "PolicyArraySetting",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } }
        }
      },
      "policy.booleanSetting": {
        "type": "boolean",
        "default": true,
        policy: {
          name: "PolicyBooleanSetting",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } }
        }
      },
      "policy.internalSetting": {
        "type": "string",
        "default": "defaultInternalValue",
        included: false,
        policy: {
          name: "PolicyInternalSetting",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } }
        }
      },
      "policy.ownerSetting": {
        "type": "boolean",
        "default": true,
        policy: {
          name: "PolicyShared",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          restrictedValue: true,
          localization: { description: { key: "shared.owner", value: "" } }
        }
      },
      "policy.referenceSetting": {
        "type": "boolean",
        "default": true,
        policyReference: {
          name: "PolicyShared"
        }
      },
      "policy.orphanReferenceSetting": {
        "type": "boolean",
        "default": true,
        policyReference: {
          name: "PolicyOrphanReference"
        }
      },
      "nonPolicy.setting": {
        "type": "boolean",
        "default": true
      }
    }
  };
  suiteSetup(() => Registry.as(Extensions.Configuration).registerConfiguration(policyConfigurationNode));
  suiteTeardown(() => Registry.as(Extensions.Configuration).deregisterConfigurations([policyConfigurationNode]));
  setup(async () => {
    const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
    await defaultConfiguration.initialize();
    fileService = disposables.add(new FileService(new NullLogService()));
    const diskFileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider(policyFile.scheme, diskFileSystemProvider));
    policyService = disposables.add(new FilePolicyService(policyFile, fileService, new NullLogService()));
    testObject = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService, new NullLogService()));
  });
  test("initialize: with policies", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicySettingA": "policyValueA" })));
    await testObject.initialize();
    const acutal = testObject.configurationModel;
    assert.strictEqual(acutal.getValue("policy.settingA"), "policyValueA");
    assert.strictEqual(acutal.getValue("policy.settingB"), void 0);
    assert.strictEqual(acutal.getValue("nonPolicy.setting"), void 0);
    assert.deepStrictEqual(acutal.keys, ["policy.settingA"]);
    assert.deepStrictEqual(acutal.overrides, []);
  });
  test("initialize: no policies", async () => {
    await testObject.initialize();
    const acutal = testObject.configurationModel;
    assert.deepStrictEqual(acutal.keys, []);
    assert.deepStrictEqual(acutal.overrides, []);
    assert.strictEqual(acutal.getValue("policy.settingA"), void 0);
    assert.strictEqual(acutal.getValue("policy.settingB"), void 0);
    assert.strictEqual(acutal.getValue("nonPolicy.setting"), void 0);
  });
  test("initialize: with policies but not registered", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicySettingA": "policyValueA", "PolicySettingB": "policyValueB", "PolicySettingC": "policyValueC" })));
    await testObject.initialize();
    const acutal = testObject.configurationModel;
    assert.strictEqual(acutal.getValue("policy.settingA"), "policyValueA");
    assert.strictEqual(acutal.getValue("policy.settingB"), "policyValueB");
    assert.strictEqual(acutal.getValue("nonPolicy.setting"), void 0);
    assert.deepStrictEqual(acutal.keys, ["policy.settingA", "policy.settingB"]);
    assert.deepStrictEqual(acutal.overrides, []);
  });
  test("initialize: with object type policy", async () => {
    const expected = {
      "microsoft": true,
      "github": "stable",
      "other": 1,
      "complex": {
        "key": "value"
      },
      "array": [1, 2, 3]
    };
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicyObjectSetting": JSON.stringify(expected) })));
    await testObject.initialize();
    const acutal = testObject.configurationModel;
    assert.deepStrictEqual(acutal.getValue("policy.objectSetting"), expected);
  });
  test("initialize: with array type policy", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicyArraySetting": JSON.stringify([1]) })));
    await testObject.initialize();
    const acutal = testObject.configurationModel;
    assert.deepStrictEqual(acutal.getValue("policy.arraySetting"), [1]);
  });
  test("initialize: with boolean type policy as false", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicyBooleanSetting": false })));
    await testObject.initialize();
    const acutal = testObject.configurationModel;
    assert.deepStrictEqual(acutal.getValue("policy.booleanSetting"), false);
  });
  test("initialize: with boolean type policy as true", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicyBooleanSetting": true })));
    await testObject.initialize();
    const acutal = testObject.configurationModel;
    assert.deepStrictEqual(acutal.getValue("policy.booleanSetting"), true);
  });
  test("initialize: with object type policy ignores policy if value is not valid", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicyObjectSetting": '{"a": "b", "hello": }' })));
    await testObject.initialize();
    const acutal = testObject.configurationModel;
    assert.deepStrictEqual(acutal.getValue("policy.objectSetting"), void 0);
  });
  test("initialize: with object type policy ignores policy if there are duplicate keys", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicyObjectSetting": '{"microsoft": true, "microsoft": false }' })));
    await testObject.initialize();
    const acutal = testObject.configurationModel;
    assert.deepStrictEqual(acutal.getValue("policy.objectSetting"), void 0);
  });
  test("change: when policy is added", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicySettingA": "policyValueA" })));
    await testObject.initialize();
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const promise = Event.toPromise(testObject.onDidChangeConfiguration);
      await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicySettingA": "policyValueA", "PolicySettingB": "policyValueB", "PolicySettingC": "policyValueC" })));
      await promise;
    });
    const acutal = testObject.configurationModel;
    assert.strictEqual(acutal.getValue("policy.settingA"), "policyValueA");
    assert.strictEqual(acutal.getValue("policy.settingB"), "policyValueB");
    assert.strictEqual(acutal.getValue("nonPolicy.setting"), void 0);
    assert.deepStrictEqual(acutal.keys, ["policy.settingA", "policy.settingB"]);
    assert.deepStrictEqual(acutal.overrides, []);
  });
  test("change: when policy is updated", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicySettingA": "policyValueA" })));
    await testObject.initialize();
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const promise = Event.toPromise(testObject.onDidChangeConfiguration);
      await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicySettingA": "policyValueAChanged" })));
      await promise;
    });
    const acutal = testObject.configurationModel;
    assert.strictEqual(acutal.getValue("policy.settingA"), "policyValueAChanged");
    assert.strictEqual(acutal.getValue("policy.settingB"), void 0);
    assert.strictEqual(acutal.getValue("nonPolicy.setting"), void 0);
    assert.deepStrictEqual(acutal.keys, ["policy.settingA"]);
    assert.deepStrictEqual(acutal.overrides, []);
  });
  test("change: when policy is removed", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicySettingA": "policyValueA" })));
    await testObject.initialize();
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const promise = Event.toPromise(testObject.onDidChangeConfiguration);
      await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({})));
      await promise;
    });
    const acutal = testObject.configurationModel;
    assert.strictEqual(acutal.getValue("policy.settingA"), void 0);
    assert.strictEqual(acutal.getValue("policy.settingB"), void 0);
    assert.strictEqual(acutal.getValue("nonPolicy.setting"), void 0);
    assert.deepStrictEqual(acutal.keys, []);
    assert.deepStrictEqual(acutal.overrides, []);
  });
  test("initialize: an owning policy applies to both the owner and its references", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicyShared": false })));
    await testObject.initialize();
    const actual = testObject.configurationModel;
    assert.strictEqual(actual.getValue("policy.ownerSetting"), false);
    assert.strictEqual(actual.getValue("policy.referenceSetting"), false);
    assert.deepStrictEqual([...actual.keys].sort(), ["policy.ownerSetting", "policy.referenceSetting"]);
  });
  test("initialize: a reference resolves even when its owner is not registered", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicyOrphanReference": false })));
    await testObject.initialize();
    const actual = testObject.configurationModel;
    assert.strictEqual(actual.getValue("policy.orphanReferenceSetting"), false);
    assert.deepStrictEqual(actual.keys, ["policy.orphanReferenceSetting"]);
  });
  test("initialize: the owner definition is authoritative; a reference only contributes the policy name", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicyShared": false })));
    await testObject.initialize();
    const definition = policyService.policyDefinitions["PolicyShared"];
    assert.strictEqual(definition?.type, "boolean");
    assert.strictEqual(definition?.restrictedValue, true);
  });
  test("change: a late-registering owner supersedes an earlier reference definition", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicyOrphanReference": false })));
    await testObject.initialize();
    assert.strictEqual(testObject.configurationModel.getValue("policy.orphanReferenceSetting"), false);
    assert.strictEqual(policyService.policyDefinitions["PolicyOrphanReference"]?.restrictedValue, void 0);
    const ownerNode = {
      "id": "_test_late_owner",
      "type": "object",
      "properties": {
        "policy.lateOwner": {
          "type": "boolean",
          "default": true,
          policy: {
            name: "PolicyOrphanReference",
            category: PolicyCategory.Extensions,
            minimumVersion: "1.0.0",
            restrictedValue: true,
            localization: { description: { key: "late.owner", value: "" } }
          }
        }
      }
    };
    try {
      const promise = Event.toPromise(testObject.onDidChangeConfiguration);
      Registry.as(Extensions.Configuration).registerConfiguration(ownerNode);
      await promise;
      assert.strictEqual(policyService.policyDefinitions["PolicyOrphanReference"]?.restrictedValue, true);
      assert.strictEqual(testObject.configurationModel.getValue("policy.lateOwner"), false);
      assert.strictEqual(testObject.configurationModel.getValue("policy.orphanReferenceSetting"), false);
    } finally {
      Registry.as(Extensions.Configuration).deregisterConfigurations([ownerNode]);
    }
  });
  test("change: deregistering the owner falls back to a surviving reference definition", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicyOrphanReference": false })));
    await testObject.initialize();
    const ownerNode = {
      "id": "_test_owner_removal",
      "type": "object",
      "properties": {
        "policy.removableOwner": {
          "type": "boolean",
          "default": true,
          policy: {
            name: "PolicyOrphanReference",
            category: PolicyCategory.Extensions,
            minimumVersion: "1.0.0",
            restrictedValue: true,
            localization: { description: { key: "removable.owner", value: "" } }
          }
        }
      }
    };
    const registry = Registry.as(Extensions.Configuration);
    let promise = Event.toPromise(testObject.onDidChangeConfiguration);
    registry.registerConfiguration(ownerNode);
    await promise;
    assert.strictEqual(policyService.policyDefinitions["PolicyOrphanReference"]?.restrictedValue, true);
    promise = Event.toPromise(testObject.onDidChangeConfiguration);
    registry.deregisterConfigurations([ownerNode]);
    await promise;
    assert.strictEqual(policyService.policyDefinitions["PolicyOrphanReference"]?.restrictedValue, void 0);
    assert.strictEqual(testObject.configurationModel.getValue("policy.orphanReferenceSetting"), false);
  });
  test("change: an owning policy update propagates to both the owner and its references", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicyShared": false })));
    await testObject.initialize();
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const promise = Event.toPromise(testObject.onDidChangeConfiguration);
      await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({})));
      await promise;
    });
    const acutal = testObject.configurationModel;
    assert.strictEqual(acutal.getValue("policy.ownerSetting"), void 0);
    assert.strictEqual(acutal.getValue("policy.referenceSetting"), void 0);
  });
  test("change: when policy setting is registered", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicySettingC": "policyValueC" })));
    await testObject.initialize();
    const promise = Event.toPromise(testObject.onDidChangeConfiguration);
    policyConfigurationNode.properties["policy.settingC"] = {
      "type": "string",
      "default": "defaultValueC",
      policy: {
        name: "PolicySettingC",
        category: PolicyCategory.Extensions,
        minimumVersion: "1.0.0",
        localization: { description: { key: "", value: "" } }
      }
    };
    Registry.as(Extensions.Configuration).registerConfiguration(deepClone(policyConfigurationNode));
    await promise;
    const acutal = testObject.configurationModel;
    assert.strictEqual(acutal.getValue("policy.settingC"), "policyValueC");
    assert.strictEqual(acutal.getValue("policy.settingA"), void 0);
    assert.strictEqual(acutal.getValue("policy.settingB"), void 0);
    assert.strictEqual(acutal.getValue("nonPolicy.setting"), void 0);
    assert.deepStrictEqual(acutal.keys, ["policy.settingC"]);
    assert.deepStrictEqual(acutal.overrides, []);
  });
  test("change: when policy setting is deregistered", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicySettingA": "policyValueA" })));
    await testObject.initialize();
    const promise = Event.toPromise(testObject.onDidChangeConfiguration);
    Registry.as(Extensions.Configuration).deregisterConfigurations([policyConfigurationNode]);
    await promise;
    const acutal = testObject.configurationModel;
    assert.strictEqual(acutal.getValue("policy.settingA"), void 0);
    assert.strictEqual(acutal.getValue("policy.settingB"), void 0);
    assert.strictEqual(acutal.getValue("nonPolicy.setting"), void 0);
    assert.deepStrictEqual(acutal.keys, []);
    assert.deepStrictEqual(acutal.overrides, []);
  });
  test("initialize: with internal policies", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicyInternalSetting": "internalValue" })));
    await testObject.initialize();
    const acutal = testObject.configurationModel;
    assert.strictEqual(acutal.getValue("policy.settingA"), void 0);
    assert.strictEqual(acutal.getValue("policy.settingB"), void 0);
    assert.strictEqual(acutal.getValue("policy.internalSetting"), "internalValue");
    assert.strictEqual(acutal.getValue("nonPolicy.setting"), void 0);
    assert.deepStrictEqual(acutal.keys, ["policy.internalSetting"]);
    assert.deepStrictEqual(acutal.overrides, []);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcY29uZmlndXJhdGlvblxcdGVzdFxcY29tbW9uXFxwb2xpY3lDb25maWd1cmF0aW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBEZWZhdWx0Q29uZmlndXJhdGlvbiwgUG9saWN5Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25maWd1cmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvbk5vZGUsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IGRlZXBDbG9uZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgSVBvbGljeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wb2xpY3kvY29tbW9uL3BvbGljeS5qcyc7XG5pbXBvcnQgeyBGaWxlUG9saWN5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BvbGljeS9jb21tb24vZmlsZVBvbGljeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUG9saWN5Q2F0ZWdvcnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wb2xpY3kuanMnO1xuXG5zdWl0ZSgnUG9saWN5Q29uZmlndXJhdGlvbicsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCB0ZXN0T2JqZWN0OiBQb2xpY3lDb25maWd1cmF0aW9uO1xuXHRsZXQgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZTtcblx0bGV0IHBvbGljeVNlcnZpY2U6IElQb2xpY3lTZXJ2aWNlO1xuXHRjb25zdCBwb2xpY3lGaWxlID0gVVJJLmZpbGUoJ3BvbGljeUZpbGUnKS53aXRoKHsgc2NoZW1lOiAndnNjb2RlLXRlc3RzJyB9KTtcblx0Y29uc3QgcG9saWN5Q29uZmlndXJhdGlvbk5vZGU6IElDb25maWd1cmF0aW9uTm9kZSA9IHtcblx0XHQnaWQnOiAncG9saWN5Q29uZmlndXJhdGlvbicsXG5cdFx0J29yZGVyJzogMSxcblx0XHQndGl0bGUnOiAnYScsXG5cdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdCdwb2xpY3kuc2V0dGluZ0EnOiB7XG5cdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdCdkZWZhdWx0JzogJ2RlZmF1bHRWYWx1ZUEnLFxuXHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRuYW1lOiAnUG9saWN5U2V0dGluZ0EnLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5FeHRlbnNpb25zLFxuXHRcdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0XHRcdGxvY2FsaXphdGlvbjogeyBkZXNjcmlwdGlvbjogeyBrZXk6ICcnLCB2YWx1ZTogJycgfSwgfVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J3BvbGljeS5zZXR0aW5nQic6IHtcblx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdFx0J2RlZmF1bHQnOiAnZGVmYXVsdFZhbHVlQicsXG5cdFx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRcdG5hbWU6ICdQb2xpY3lTZXR0aW5nQicsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdFx0bG9jYWxpemF0aW9uOiB7IGRlc2NyaXB0aW9uOiB7IGtleTogJycsIHZhbHVlOiAnJyB9LCB9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQncG9saWN5Lm9iamVjdFNldHRpbmcnOiB7XG5cdFx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHRcdCdkZWZhdWx0Jzoge30sXG5cdFx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRcdG5hbWU6ICdQb2xpY3lPYmplY3RTZXR0aW5nJyxcblx0XHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuRXh0ZW5zaW9ucyxcblx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRsb2NhbGl6YXRpb246IHsgZGVzY3JpcHRpb246IHsga2V5OiAnJywgdmFsdWU6ICcnIH0sIH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdCdwb2xpY3kuYXJyYXlTZXR0aW5nJzoge1xuXHRcdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0XHQnZGVmYXVsdCc6IFtdLFxuXHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRuYW1lOiAnUG9saWN5QXJyYXlTZXR0aW5nJyxcblx0XHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuRXh0ZW5zaW9ucyxcblx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRsb2NhbGl6YXRpb246IHsgZGVzY3JpcHRpb246IHsga2V5OiAnJywgdmFsdWU6ICcnIH0sIH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdCdwb2xpY3kuYm9vbGVhblNldHRpbmcnOiB7XG5cdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHQnZGVmYXVsdCc6IHRydWUsXG5cdFx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRcdG5hbWU6ICdQb2xpY3lCb29sZWFuU2V0dGluZycsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdFx0bG9jYWxpemF0aW9uOiB7IGRlc2NyaXB0aW9uOiB7IGtleTogJycsIHZhbHVlOiAnJyB9LCB9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQncG9saWN5LmludGVybmFsU2V0dGluZyc6IHtcblx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdFx0J2RlZmF1bHQnOiAnZGVmYXVsdEludGVybmFsVmFsdWUnLFxuXHRcdFx0XHRpbmNsdWRlZDogZmFsc2UsXG5cdFx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRcdG5hbWU6ICdQb2xpY3lJbnRlcm5hbFNldHRpbmcnLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5FeHRlbnNpb25zLFxuXHRcdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0XHRcdGxvY2FsaXphdGlvbjogeyBkZXNjcmlwdGlvbjogeyBrZXk6ICcnLCB2YWx1ZTogJycgfSwgfVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J3BvbGljeS5vd25lclNldHRpbmcnOiB7XG5cdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHQnZGVmYXVsdCc6IHRydWUsXG5cdFx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRcdG5hbWU6ICdQb2xpY3lTaGFyZWQnLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5FeHRlbnNpb25zLFxuXHRcdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0XHRcdHJlc3RyaWN0ZWRWYWx1ZTogdHJ1ZSxcblx0XHRcdFx0XHRsb2NhbGl6YXRpb246IHsgZGVzY3JpcHRpb246IHsga2V5OiAnc2hhcmVkLm93bmVyJywgdmFsdWU6ICcnIH0sIH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdCdwb2xpY3kucmVmZXJlbmNlU2V0dGluZyc6IHtcblx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdCdkZWZhdWx0JzogdHJ1ZSxcblx0XHRcdFx0cG9saWN5UmVmZXJlbmNlOiB7XG5cdFx0XHRcdFx0bmFtZTogJ1BvbGljeVNoYXJlZCcsXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQncG9saWN5Lm9ycGhhblJlZmVyZW5jZVNldHRpbmcnOiB7XG5cdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHQnZGVmYXVsdCc6IHRydWUsXG5cdFx0XHRcdHBvbGljeVJlZmVyZW5jZToge1xuXHRcdFx0XHRcdG5hbWU6ICdQb2xpY3lPcnBoYW5SZWZlcmVuY2UnLFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J25vblBvbGljeS5zZXR0aW5nJzoge1xuXHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0J2RlZmF1bHQnOiB0cnVlXG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xuXG5cdHN1aXRlU2V0dXAoKCkgPT4gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5yZWdpc3RlckNvbmZpZ3VyYXRpb24ocG9saWN5Q29uZmlndXJhdGlvbk5vZGUpKTtcblx0c3VpdGVUZWFyZG93bigoKSA9PiBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLmRlcmVnaXN0ZXJDb25maWd1cmF0aW9ucyhbcG9saWN5Q29uZmlndXJhdGlvbk5vZGVdKSk7XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRlZmF1bHRDb25maWd1cmF0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWZhdWx0Q29uZmlndXJhdGlvbihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGF3YWl0IGRlZmF1bHRDb25maWd1cmF0aW9uLmluaXRpYWxpemUoKTtcblx0XHRmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBkaXNrRmlsZVN5c3RlbVByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihwb2xpY3lGaWxlLnNjaGVtZSwgZGlza0ZpbGVTeXN0ZW1Qcm92aWRlcikpO1xuXHRcdHBvbGljeVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVQb2xpY3lTZXJ2aWNlKHBvbGljeUZpbGUsIGZpbGVTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdHRlc3RPYmplY3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFBvbGljeUNvbmZpZ3VyYXRpb24oZGVmYXVsdENvbmZpZ3VyYXRpb24sIHBvbGljeVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luaXRpYWxpemU6IHdpdGggcG9saWNpZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHBvbGljeUZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoeyAnUG9saWN5U2V0dGluZ0EnOiAncG9saWN5VmFsdWVBJyB9KSkpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cdFx0Y29uc3QgYWN1dGFsID0gdGVzdE9iamVjdC5jb25maWd1cmF0aW9uTW9kZWw7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN1dGFsLmdldFZhbHVlKCdwb2xpY3kuc2V0dGluZ0EnKSwgJ3BvbGljeVZhbHVlQScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3V0YWwuZ2V0VmFsdWUoJ3BvbGljeS5zZXR0aW5nQicpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3V0YWwuZ2V0VmFsdWUoJ25vblBvbGljeS5zZXR0aW5nJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3V0YWwua2V5cywgWydwb2xpY3kuc2V0dGluZ0EnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3V0YWwub3ZlcnJpZGVzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luaXRpYWxpemU6IG5vIHBvbGljaWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXHRcdGNvbnN0IGFjdXRhbCA9IHRlc3RPYmplY3QuY29uZmlndXJhdGlvbk1vZGVsO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3V0YWwua2V5cywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN1dGFsLm92ZXJyaWRlcywgW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3V0YWwuZ2V0VmFsdWUoJ3BvbGljeS5zZXR0aW5nQScpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3V0YWwuZ2V0VmFsdWUoJ3BvbGljeS5zZXR0aW5nQicpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3V0YWwuZ2V0VmFsdWUoJ25vblBvbGljeS5zZXR0aW5nJyksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luaXRpYWxpemU6IHdpdGggcG9saWNpZXMgYnV0IG5vdCByZWdpc3RlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShwb2xpY3lGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHsgJ1BvbGljeVNldHRpbmdBJzogJ3BvbGljeVZhbHVlQScsICdQb2xpY3lTZXR0aW5nQic6ICdwb2xpY3lWYWx1ZUInLCAnUG9saWN5U2V0dGluZ0MnOiAncG9saWN5VmFsdWVDJyB9KSkpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cdFx0Y29uc3QgYWN1dGFsID0gdGVzdE9iamVjdC5jb25maWd1cmF0aW9uTW9kZWw7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN1dGFsLmdldFZhbHVlKCdwb2xpY3kuc2V0dGluZ0EnKSwgJ3BvbGljeVZhbHVlQScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3V0YWwuZ2V0VmFsdWUoJ3BvbGljeS5zZXR0aW5nQicpLCAncG9saWN5VmFsdWVCJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgnbm9uUG9saWN5LnNldHRpbmcnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdXRhbC5rZXlzLCBbJ3BvbGljeS5zZXR0aW5nQScsICdwb2xpY3kuc2V0dGluZ0InXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3V0YWwub3ZlcnJpZGVzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luaXRpYWxpemU6IHdpdGggb2JqZWN0IHR5cGUgcG9saWN5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV4cGVjdGVkID0ge1xuXHRcdFx0J21pY3Jvc29mdCc6IHRydWUsXG5cdFx0XHQnZ2l0aHViJzogJ3N0YWJsZScsXG5cdFx0XHQnb3RoZXInOiAxLFxuXHRcdFx0J2NvbXBsZXgnOiB7XG5cdFx0XHRcdCdrZXknOiAndmFsdWUnXG5cdFx0XHR9LFxuXHRcdFx0J2FycmF5JzogWzEsIDIsIDNdXG5cdFx0fTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocG9saWN5RmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7ICdQb2xpY3lPYmplY3RTZXR0aW5nJzogSlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWQpIH0pKSk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblx0XHRjb25zdCBhY3V0YWwgPSB0ZXN0T2JqZWN0LmNvbmZpZ3VyYXRpb25Nb2RlbDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN1dGFsLmdldFZhbHVlKCdwb2xpY3kub2JqZWN0U2V0dGluZycpLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luaXRpYWxpemU6IHdpdGggYXJyYXkgdHlwZSBwb2xpY3knLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHBvbGljeUZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoeyAnUG9saWN5QXJyYXlTZXR0aW5nJzogSlNPTi5zdHJpbmdpZnkoWzFdKSB9KSkpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cdFx0Y29uc3QgYWN1dGFsID0gdGVzdE9iamVjdC5jb25maWd1cmF0aW9uTW9kZWw7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgncG9saWN5LmFycmF5U2V0dGluZycpLCBbMV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbml0aWFsaXplOiB3aXRoIGJvb2xlYW4gdHlwZSBwb2xpY3kgYXMgZmFsc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHBvbGljeUZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoeyAnUG9saWN5Qm9vbGVhblNldHRpbmcnOiBmYWxzZSB9KSkpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cdFx0Y29uc3QgYWN1dGFsID0gdGVzdE9iamVjdC5jb25maWd1cmF0aW9uTW9kZWw7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgncG9saWN5LmJvb2xlYW5TZXR0aW5nJyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnaW5pdGlhbGl6ZTogd2l0aCBib29sZWFuIHR5cGUgcG9saWN5IGFzIHRydWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHBvbGljeUZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoeyAnUG9saWN5Qm9vbGVhblNldHRpbmcnOiB0cnVlIH0pKSk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblx0XHRjb25zdCBhY3V0YWwgPSB0ZXN0T2JqZWN0LmNvbmZpZ3VyYXRpb25Nb2RlbDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN1dGFsLmdldFZhbHVlKCdwb2xpY3kuYm9vbGVhblNldHRpbmcnKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luaXRpYWxpemU6IHdpdGggb2JqZWN0IHR5cGUgcG9saWN5IGlnbm9yZXMgcG9saWN5IGlmIHZhbHVlIGlzIG5vdCB2YWxpZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocG9saWN5RmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7ICdQb2xpY3lPYmplY3RTZXR0aW5nJzogJ3tcImFcIjogXCJiXCIsIFwiaGVsbG9cIjogfScgfSkpKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXHRcdGNvbnN0IGFjdXRhbCA9IHRlc3RPYmplY3QuY29uZmlndXJhdGlvbk1vZGVsO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3V0YWwuZ2V0VmFsdWUoJ3BvbGljeS5vYmplY3RTZXR0aW5nJyksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luaXRpYWxpemU6IHdpdGggb2JqZWN0IHR5cGUgcG9saWN5IGlnbm9yZXMgcG9saWN5IGlmIHRoZXJlIGFyZSBkdXBsaWNhdGUga2V5cycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocG9saWN5RmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7ICdQb2xpY3lPYmplY3RTZXR0aW5nJzogJ3tcIm1pY3Jvc29mdFwiOiB0cnVlLCBcIm1pY3Jvc29mdFwiOiBmYWxzZSB9JyB9KSkpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cdFx0Y29uc3QgYWN1dGFsID0gdGVzdE9iamVjdC5jb25maWd1cmF0aW9uTW9kZWw7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgncG9saWN5Lm9iamVjdFNldHRpbmcnKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnY2hhbmdlOiB3aGVuIHBvbGljeSBpcyBhZGRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocG9saWN5RmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7ICdQb2xpY3lTZXR0aW5nQSc6ICdwb2xpY3lWYWx1ZUEnIH0pKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb21pc2UgPSBFdmVudC50b1Byb21pc2UodGVzdE9iamVjdC5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24pO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHBvbGljeUZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoeyAnUG9saWN5U2V0dGluZ0EnOiAncG9saWN5VmFsdWVBJywgJ1BvbGljeVNldHRpbmdCJzogJ3BvbGljeVZhbHVlQicsICdQb2xpY3lTZXR0aW5nQyc6ICdwb2xpY3lWYWx1ZUMnIH0pKSk7XG5cdFx0XHRhd2FpdCBwcm9taXNlO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYWN1dGFsID0gdGVzdE9iamVjdC5jb25maWd1cmF0aW9uTW9kZWw7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgncG9saWN5LnNldHRpbmdBJyksICdwb2xpY3lWYWx1ZUEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN1dGFsLmdldFZhbHVlKCdwb2xpY3kuc2V0dGluZ0InKSwgJ3BvbGljeVZhbHVlQicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3V0YWwuZ2V0VmFsdWUoJ25vblBvbGljeS5zZXR0aW5nJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3V0YWwua2V5cywgWydwb2xpY3kuc2V0dGluZ0EnLCAncG9saWN5LnNldHRpbmdCJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN1dGFsLm92ZXJyaWRlcywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGFuZ2U6IHdoZW4gcG9saWN5IGlzIHVwZGF0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHBvbGljeUZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoeyAnUG9saWN5U2V0dGluZ0EnOiAncG9saWN5VmFsdWVBJyB9KSkpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKHRlc3RPYmplY3Qub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShwb2xpY3lGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHsgJ1BvbGljeVNldHRpbmdBJzogJ3BvbGljeVZhbHVlQUNoYW5nZWQnIH0pKSk7XG5cdFx0XHRhd2FpdCBwcm9taXNlO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYWN1dGFsID0gdGVzdE9iamVjdC5jb25maWd1cmF0aW9uTW9kZWw7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgncG9saWN5LnNldHRpbmdBJyksICdwb2xpY3lWYWx1ZUFDaGFuZ2VkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgncG9saWN5LnNldHRpbmdCJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgnbm9uUG9saWN5LnNldHRpbmcnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdXRhbC5rZXlzLCBbJ3BvbGljeS5zZXR0aW5nQSddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdXRhbC5vdmVycmlkZXMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnY2hhbmdlOiB3aGVuIHBvbGljeSBpcyByZW1vdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShwb2xpY3lGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHsgJ1BvbGljeVNldHRpbmdBJzogJ3BvbGljeVZhbHVlQScgfSkpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblxuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvbWlzZSA9IEV2ZW50LnRvUHJvbWlzZSh0ZXN0T2JqZWN0Lm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbik7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocG9saWN5RmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7fSkpKTtcblx0XHRcdGF3YWl0IHByb21pc2U7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBhY3V0YWwgPSB0ZXN0T2JqZWN0LmNvbmZpZ3VyYXRpb25Nb2RlbDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN1dGFsLmdldFZhbHVlKCdwb2xpY3kuc2V0dGluZ0EnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN1dGFsLmdldFZhbHVlKCdwb2xpY3kuc2V0dGluZ0InKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN1dGFsLmdldFZhbHVlKCdub25Qb2xpY3kuc2V0dGluZycpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN1dGFsLmtleXMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdXRhbC5vdmVycmlkZXMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnaW5pdGlhbGl6ZTogYW4gb3duaW5nIHBvbGljeSBhcHBsaWVzIHRvIGJvdGggdGhlIG93bmVyIGFuZCBpdHMgcmVmZXJlbmNlcycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocG9saWN5RmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7ICdQb2xpY3lTaGFyZWQnOiBmYWxzZSB9KSkpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gdGVzdE9iamVjdC5jb25maWd1cmF0aW9uTW9kZWw7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdldFZhbHVlKCdwb2xpY3kub3duZXJTZXR0aW5nJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdldFZhbHVlKCdwb2xpY3kucmVmZXJlbmNlU2V0dGluZycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uYWN0dWFsLmtleXNdLnNvcnQoKSwgWydwb2xpY3kub3duZXJTZXR0aW5nJywgJ3BvbGljeS5yZWZlcmVuY2VTZXR0aW5nJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbml0aWFsaXplOiBhIHJlZmVyZW5jZSByZXNvbHZlcyBldmVuIHdoZW4gaXRzIG93bmVyIGlzIG5vdCByZWdpc3RlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShwb2xpY3lGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHsgJ1BvbGljeU9ycGhhblJlZmVyZW5jZSc6IGZhbHNlIH0pKSk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblx0XHRjb25zdCBhY3R1YWwgPSB0ZXN0T2JqZWN0LmNvbmZpZ3VyYXRpb25Nb2RlbDtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZ2V0VmFsdWUoJ3BvbGljeS5vcnBoYW5SZWZlcmVuY2VTZXR0aW5nJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5rZXlzLCBbJ3BvbGljeS5vcnBoYW5SZWZlcmVuY2VTZXR0aW5nJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbml0aWFsaXplOiB0aGUgb3duZXIgZGVmaW5pdGlvbiBpcyBhdXRob3JpdGF0aXZlOyBhIHJlZmVyZW5jZSBvbmx5IGNvbnRyaWJ1dGVzIHRoZSBwb2xpY3kgbmFtZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocG9saWN5RmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7ICdQb2xpY3lTaGFyZWQnOiBmYWxzZSB9KSkpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cblx0XHQvLyBUaGUgb3duZXIgZGVjbGFyZXMgcmVzdHJpY3RlZFZhbHVlOyB0aGUgcmVmZXJlbmNlIGlzIGEgcHVyZSBwb2ludGVyLiBUaGUgcmVnaXN0ZXJlZFxuXHRcdC8vIGRlZmluaXRpb24gbXVzdCBiZSB0aGUgb3duZXIncy5cblx0XHRjb25zdCBkZWZpbml0aW9uID0gcG9saWN5U2VydmljZS5wb2xpY3lEZWZpbml0aW9uc1snUG9saWN5U2hhcmVkJ107XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZmluaXRpb24/LnR5cGUsICdib29sZWFuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZmluaXRpb24/LnJlc3RyaWN0ZWRWYWx1ZSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoYW5nZTogYSBsYXRlLXJlZ2lzdGVyaW5nIG93bmVyIHN1cGVyc2VkZXMgYW4gZWFybGllciByZWZlcmVuY2UgZGVmaW5pdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHQvLyBPbmx5IHRoZSByZWZlcmVuY2UgZm9yIGBQb2xpY3lPcnBoYW5SZWZlcmVuY2VgIGlzIHJlZ2lzdGVyZWQgaW5pdGlhbGx5IChtb2RlbHMgdGhlIGVkaXRvclxuXHRcdC8vIHdpbmRvdzogdGhlIGFnZW50LWhvc3QgcmVmZXJlbmNlIGxvYWRzIGVhZ2VybHkgd2hpbGUgdGhlIGV4dGVuc2lvbiBwb2xpY3kgb3duZXIgbG9hZHMgbGF0ZXIpLlxuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShwb2xpY3lGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHsgJ1BvbGljeU9ycGhhblJlZmVyZW5jZSc6IGZhbHNlIH0pKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cblx0XHQvLyBUaGUgc3ludGhlc2l6ZWQgcmVmZXJlbmNlIGRlZmluaXRpb24gY2FycmllcyBubyByZXN0cmljdGVkVmFsdWUuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlKCdwb2xpY3kub3JwaGFuUmVmZXJlbmNlU2V0dGluZycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UucG9saWN5RGVmaW5pdGlvbnNbJ1BvbGljeU9ycGhhblJlZmVyZW5jZSddPy5yZXN0cmljdGVkVmFsdWUsIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBvd25lck5vZGU6IElDb25maWd1cmF0aW9uTm9kZSA9IHtcblx0XHRcdCdpZCc6ICdfdGVzdF9sYXRlX293bmVyJyxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3BvbGljeS5sYXRlT3duZXInOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiB0cnVlLFxuXHRcdFx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRcdFx0bmFtZTogJ1BvbGljeU9ycGhhblJlZmVyZW5jZScsXG5cdFx0XHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuRXh0ZW5zaW9ucyxcblx0XHRcdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0XHRcdFx0cmVzdHJpY3RlZFZhbHVlOiB0cnVlLFxuXHRcdFx0XHRcdFx0bG9jYWxpemF0aW9uOiB7IGRlc2NyaXB0aW9uOiB7IGtleTogJ2xhdGUub3duZXInLCB2YWx1ZTogJycgfSwgfVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcHJvbWlzZSA9IEV2ZW50LnRvUHJvbWlzZSh0ZXN0T2JqZWN0Lm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbik7XG5cdFx0XHRSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLnJlZ2lzdGVyQ29uZmlndXJhdGlvbihvd25lck5vZGUpO1xuXHRcdFx0YXdhaXQgcHJvbWlzZTtcblxuXHRcdFx0Ly8gVGhlIG93bmVyJ3MgZGVmaW5pdGlvbiAod2l0aCByZXN0cmljdGVkVmFsdWUpIG11c3Qgbm93IHN1cGVyc2VkZSB0aGUgcmVmZXJlbmNlJ3MsIGFuZFxuXHRcdFx0Ly8gYm90aCBzZXR0aW5ncyByZW1haW4gZ2F0ZWQgYnkgdGhlIHNhbWUgcG9saWN5IHZhbHVlLlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UucG9saWN5RGVmaW5pdGlvbnNbJ1BvbGljeU9ycGhhblJlZmVyZW5jZSddPy5yZXN0cmljdGVkVmFsdWUsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlKCdwb2xpY3kubGF0ZU93bmVyJyksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgncG9saWN5Lm9ycGhhblJlZmVyZW5jZVNldHRpbmcnKSwgZmFsc2UpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLmRlcmVnaXN0ZXJDb25maWd1cmF0aW9ucyhbb3duZXJOb2RlXSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdjaGFuZ2U6IGRlcmVnaXN0ZXJpbmcgdGhlIG93bmVyIGZhbGxzIGJhY2sgdG8gYSBzdXJ2aXZpbmcgcmVmZXJlbmNlIGRlZmluaXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHBvbGljeUZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoeyAnUG9saWN5T3JwaGFuUmVmZXJlbmNlJzogZmFsc2UgfSkpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblxuXHRcdGNvbnN0IG93bmVyTm9kZTogSUNvbmZpZ3VyYXRpb25Ob2RlID0ge1xuXHRcdFx0J2lkJzogJ190ZXN0X293bmVyX3JlbW92YWwnLFxuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQncG9saWN5LnJlbW92YWJsZU93bmVyJzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdCdkZWZhdWx0JzogdHJ1ZSxcblx0XHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRcdG5hbWU6ICdQb2xpY3lPcnBoYW5SZWZlcmVuY2UnLFxuXHRcdFx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRcdHJlc3RyaWN0ZWRWYWx1ZTogdHJ1ZSxcblx0XHRcdFx0XHRcdGxvY2FsaXphdGlvbjogeyBkZXNjcmlwdGlvbjogeyBrZXk6ICdyZW1vdmFibGUub3duZXInLCB2YWx1ZTogJycgfSwgfVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXG5cdFx0bGV0IHByb21pc2UgPSBFdmVudC50b1Byb21pc2UodGVzdE9iamVjdC5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24pO1xuXHRcdHJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbihvd25lck5vZGUpO1xuXHRcdGF3YWl0IHByb21pc2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UucG9saWN5RGVmaW5pdGlvbnNbJ1BvbGljeU9ycGhhblJlZmVyZW5jZSddPy5yZXN0cmljdGVkVmFsdWUsIHRydWUpO1xuXG5cdFx0Ly8gUmVtb3ZpbmcgdGhlIG93bmVyIG11c3QgcmUtcmVzb2x2ZSB0aGUgcG9saWN5IGFuZCBmYWxsIGJhY2sgdG8gdGhlIHN1cnZpdmluZyByZWZlcmVuY2UsXG5cdFx0Ly8gc28gdGhlIG93bmVyLW9ubHkgcmVzdHJpY3RlZFZhbHVlIG5vIGxvbmdlciBhcHBsaWVzLlxuXHRcdHByb21pc2UgPSBFdmVudC50b1Byb21pc2UodGVzdE9iamVjdC5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24pO1xuXHRcdHJlZ2lzdHJ5LmRlcmVnaXN0ZXJDb25maWd1cmF0aW9ucyhbb3duZXJOb2RlXSk7XG5cdFx0YXdhaXQgcHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5wb2xpY3lEZWZpbml0aW9uc1snUG9saWN5T3JwaGFuUmVmZXJlbmNlJ10/LnJlc3RyaWN0ZWRWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3BvbGljeS5vcnBoYW5SZWZlcmVuY2VTZXR0aW5nJyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnY2hhbmdlOiBhbiBvd25pbmcgcG9saWN5IHVwZGF0ZSBwcm9wYWdhdGVzIHRvIGJvdGggdGhlIG93bmVyIGFuZCBpdHMgcmVmZXJlbmNlcycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocG9saWN5RmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7ICdQb2xpY3lTaGFyZWQnOiBmYWxzZSB9KSkpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKHRlc3RPYmplY3Qub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShwb2xpY3lGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHt9KSkpO1xuXHRcdFx0YXdhaXQgcHJvbWlzZTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGFjdXRhbCA9IHRlc3RPYmplY3QuY29uZmlndXJhdGlvbk1vZGVsO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3V0YWwuZ2V0VmFsdWUoJ3BvbGljeS5vd25lclNldHRpbmcnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN1dGFsLmdldFZhbHVlKCdwb2xpY3kucmVmZXJlbmNlU2V0dGluZycpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGFuZ2U6IHdoZW4gcG9saWN5IHNldHRpbmcgaXMgcmVnaXN0ZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocG9saWN5RmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7ICdQb2xpY3lTZXR0aW5nQyc6ICdwb2xpY3lWYWx1ZUMnIH0pKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cblx0XHRjb25zdCBwcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKHRlc3RPYmplY3Qub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKTtcblx0XHRwb2xpY3lDb25maWd1cmF0aW9uTm9kZS5wcm9wZXJ0aWVzIVsncG9saWN5LnNldHRpbmdDJ10gPSB7XG5cdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0J2RlZmF1bHQnOiAnZGVmYXVsdFZhbHVlQycsXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ1BvbGljeVNldHRpbmdDJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkV4dGVuc2lvbnMsXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0XHRsb2NhbGl6YXRpb246IHsgZGVzY3JpcHRpb246IHsga2V5OiAnJywgdmFsdWU6ICcnIH0sIH0sXG5cdFx0XHR9XG5cdFx0fTtcblx0XHRSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLnJlZ2lzdGVyQ29uZmlndXJhdGlvbihkZWVwQ2xvbmUocG9saWN5Q29uZmlndXJhdGlvbk5vZGUpKTtcblx0XHRhd2FpdCBwcm9taXNlO1xuXG5cdFx0Y29uc3QgYWN1dGFsID0gdGVzdE9iamVjdC5jb25maWd1cmF0aW9uTW9kZWw7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgncG9saWN5LnNldHRpbmdDJyksICdwb2xpY3lWYWx1ZUMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN1dGFsLmdldFZhbHVlKCdwb2xpY3kuc2V0dGluZ0EnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN1dGFsLmdldFZhbHVlKCdwb2xpY3kuc2V0dGluZ0InKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN1dGFsLmdldFZhbHVlKCdub25Qb2xpY3kuc2V0dGluZycpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN1dGFsLmtleXMsIFsncG9saWN5LnNldHRpbmdDJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN1dGFsLm92ZXJyaWRlcywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGFuZ2U6IHdoZW4gcG9saWN5IHNldHRpbmcgaXMgZGVyZWdpc3RlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShwb2xpY3lGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHsgJ1BvbGljeVNldHRpbmdBJzogJ3BvbGljeVZhbHVlQScgfSkpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblxuXHRcdGNvbnN0IHByb21pc2UgPSBFdmVudC50b1Byb21pc2UodGVzdE9iamVjdC5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24pO1xuXHRcdFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikuZGVyZWdpc3RlckNvbmZpZ3VyYXRpb25zKFtwb2xpY3lDb25maWd1cmF0aW9uTm9kZV0pO1xuXHRcdGF3YWl0IHByb21pc2U7XG5cblx0XHRjb25zdCBhY3V0YWwgPSB0ZXN0T2JqZWN0LmNvbmZpZ3VyYXRpb25Nb2RlbDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN1dGFsLmdldFZhbHVlKCdwb2xpY3kuc2V0dGluZ0EnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN1dGFsLmdldFZhbHVlKCdwb2xpY3kuc2V0dGluZ0InKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN1dGFsLmdldFZhbHVlKCdub25Qb2xpY3kuc2V0dGluZycpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN1dGFsLmtleXMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdXRhbC5vdmVycmlkZXMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnaW5pdGlhbGl6ZTogd2l0aCBpbnRlcm5hbCBwb2xpY2llcycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocG9saWN5RmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7ICdQb2xpY3lJbnRlcm5hbFNldHRpbmcnOiAnaW50ZXJuYWxWYWx1ZScgfSkpKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXHRcdGNvbnN0IGFjdXRhbCA9IHRlc3RPYmplY3QuY29uZmlndXJhdGlvbk1vZGVsO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgncG9saWN5LnNldHRpbmdBJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgncG9saWN5LnNldHRpbmdCJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgncG9saWN5LmludGVybmFsU2V0dGluZycpLCAnaW50ZXJuYWxWYWx1ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3V0YWwuZ2V0VmFsdWUoJ25vblBvbGljeS5zZXR0aW5nJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3V0YWwua2V5cywgWydwb2xpY3kuaW50ZXJuYWxTZXR0aW5nJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN1dGFsLm92ZXJyaWRlcywgW10pO1xuXHR9KTtcblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsV0FBVztBQUNwQixTQUFTLHNCQUFzQiwyQkFBMkI7QUFFMUQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxrQkFBOEQ7QUFDdkUsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFFL0IsTUFBTSx1QkFBdUIsTUFBTTtBQUVsQyxRQUFNLGNBQWMsd0NBQXdDO0FBRTVELE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLFFBQU0sYUFBYSxJQUFJLEtBQUssWUFBWSxFQUFFLEtBQUssRUFBRSxRQUFRLGVBQWUsQ0FBQztBQUN6RSxRQUFNLDBCQUE4QztBQUFBLElBQ25ELE1BQU07QUFBQSxJQUNOLFNBQVM7QUFBQSxJQUNULFNBQVM7QUFBQSxJQUNULFFBQVE7QUFBQSxJQUNSLGNBQWM7QUFBQSxNQUNiLG1CQUFt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
