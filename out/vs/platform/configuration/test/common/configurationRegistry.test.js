import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Extensions as ConfigurationExtensions, isConfigurationDefaultSourceEquals } from "../../common/configurationRegistry.js";
import { Registry } from "../../../registry/common/platform.js";
import { PolicyCategory } from "../../../../base/common/policy.js";
suite("ConfigurationRegistry", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
  setup(() => reset());
  teardown(() => reset());
  function reset() {
    configurationRegistry.deregisterConfigurations(configurationRegistry.getConfigurations());
    configurationRegistry.deregisterDefaultConfigurations(configurationRegistry.getRegisteredDefaultConfigurations());
  }
  test("configuration override", async () => {
    configurationRegistry.registerConfiguration({
      "id": "_test_default",
      "type": "object",
      "properties": {
        "config": {
          "type": "object"
        }
      }
    });
    configurationRegistry.registerDefaultConfigurations([{ overrides: { "config": { a: 1, b: 2 } } }]);
    configurationRegistry.registerDefaultConfigurations([{ overrides: { "[lang]": { a: 2, c: 3 } } }]);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, { a: 1, b: 2 });
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["[lang]"].default, { a: 2, c: 3 });
  });
  test("configuration override defaults - prevent overriding default value", async () => {
    configurationRegistry.registerConfiguration({
      "id": "_test_default",
      "type": "object",
      "properties": {
        "config.preventDefaultValueOverride": {
          "type": "object",
          default: { a: 0 },
          "disallowConfigurationDefault": true
        }
      }
    });
    configurationRegistry.registerDefaultConfigurations([{ overrides: { "config.preventDefaultValueOverride": { a: 1, b: 2 } } }]);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config.preventDefaultValueOverride"].default, { a: 0 });
  });
  test("configuration override defaults - merges defaults", async () => {
    configurationRegistry.registerDefaultConfigurations([{ overrides: { "[lang]": { a: 1, b: 2 } } }]);
    configurationRegistry.registerDefaultConfigurations([{ overrides: { "[lang]": { a: 2, c: 3 } } }]);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["[lang]"].default, { a: 2, b: 2, c: 3 });
  });
  test("configuration defaults - merge object default overrides", async () => {
    configurationRegistry.registerConfiguration({
      "id": "_test_default",
      "type": "object",
      "properties": {
        "config": {
          "type": "object"
        }
      }
    });
    configurationRegistry.registerDefaultConfigurations([{ overrides: { "config": { a: 1, b: 2 } } }]);
    configurationRegistry.registerDefaultConfigurations([{ overrides: { "config": { a: 2, c: 3 } } }]);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, { a: 2, b: 2, c: 3 });
  });
  test("registering multiple settings with same policy", async () => {
    configurationRegistry.registerConfiguration({
      "id": "_test_default",
      "type": "object",
      "properties": {
        "policy1": {
          "type": "object",
          policy: {
            name: "policy",
            category: PolicyCategory.Extensions,
            minimumVersion: "1.0.0",
            localization: { description: { key: "", value: "" } }
          }
        },
        "policy2": {
          "type": "object",
          policy: {
            name: "policy",
            category: PolicyCategory.Extensions,
            minimumVersion: "1.0.0",
            localization: { description: { key: "", value: "" } }
          }
        }
      }
    });
    const actual = configurationRegistry.getConfigurationProperties();
    assert.ok(actual["policy1"] !== void 0);
    assert.ok(actual["policy2"] === void 0);
  });
  test("a policyReference attaches a subordinate setting to an owning policy", async () => {
    configurationRegistry.registerConfiguration({
      "id": "_test_default",
      "type": "object",
      "properties": {
        "policy.owner": {
          "type": "boolean",
          policy: {
            name: "sharedPolicy",
            category: PolicyCategory.Extensions,
            minimumVersion: "1.0.0",
            localization: { description: { key: "owner", value: "" } }
          }
        },
        "policy.subordinate": {
          "type": "boolean",
          policyReference: {
            name: "sharedPolicy"
          }
        }
      }
    });
    const actual = configurationRegistry.getConfigurationProperties();
    assert.ok(actual["policy.owner"] !== void 0);
    assert.ok(actual["policy.subordinate"] !== void 0);
    assert.strictEqual(configurationRegistry.getPolicyConfigurations().get("sharedPolicy"), "policy.owner");
    assert.deepStrictEqual([...configurationRegistry.getPolicyReferenceConfigurations().get("sharedPolicy") ?? []], ["policy.subordinate"]);
  });
  test("a policyReference does not require its owner to be registered", async () => {
    configurationRegistry.registerConfiguration({
      "id": "_test_default",
      "type": "object",
      "properties": {
        "policy.orphanReference": {
          "type": "boolean",
          policyReference: {
            name: "externallyOwnedPolicy"
          }
        }
      }
    });
    const actual = configurationRegistry.getConfigurationProperties();
    assert.ok(actual["policy.orphanReference"] !== void 0);
    assert.strictEqual(configurationRegistry.getPolicyConfigurations().get("externallyOwnedPolicy"), void 0);
    assert.deepStrictEqual([...configurationRegistry.getPolicyReferenceConfigurations().get("externallyOwnedPolicy") ?? []], ["policy.orphanReference"]);
  });
  test("a setting declaring both policy and policyReference is rejected", async () => {
    configurationRegistry.registerConfiguration({
      "id": "_test_default",
      "type": "object",
      "properties": {
        "policy.both": {
          "type": "boolean",
          policy: {
            name: "policyBoth",
            category: PolicyCategory.Extensions,
            minimumVersion: "1.0.0",
            localization: { description: { key: "both", value: "" } }
          },
          policyReference: {
            name: "policyBothReference"
          }
        }
      }
    });
    const actual = configurationRegistry.getConfigurationProperties();
    assert.ok(actual["policy.both"] === void 0);
    assert.strictEqual(configurationRegistry.getPolicyConfigurations().get("policyBoth"), void 0);
    assert.strictEqual(configurationRegistry.getPolicyReferenceConfigurations().get("policyBothReference"), void 0);
  });
  test("configuration defaults - deregister merged object default override", async () => {
    configurationRegistry.registerConfiguration({
      "id": "_test_default",
      "type": "object",
      "properties": {
        "config": {
          "type": "object"
        }
      }
    });
    const overrides1 = [{ overrides: { "config": { a: 1, b: 2 } }, source: { id: "source1", displayName: "source1" } }];
    const overrides2 = [{ overrides: { "config": { a: 2, c: 3 } }, source: { id: "source2", displayName: "source2" } }];
    configurationRegistry.registerDefaultConfigurations(overrides1);
    configurationRegistry.registerDefaultConfigurations(overrides2);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, { a: 2, b: 2, c: 3 });
    configurationRegistry.deregisterDefaultConfigurations(overrides2);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, { a: 1, b: 2 });
    configurationRegistry.deregisterDefaultConfigurations(overrides1);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, {});
  });
  test("configuration defaults - deregister merged object default override without source", async () => {
    configurationRegistry.registerConfiguration({
      "id": "_test_default",
      "type": "object",
      "properties": {
        "config": {
          "type": "object"
        }
      }
    });
    const overrides1 = [{ overrides: { "config": { a: 1, b: 2 } } }];
    const overrides2 = [{ overrides: { "config": { a: 2, c: 3 } } }];
    configurationRegistry.registerDefaultConfigurations(overrides1);
    configurationRegistry.registerDefaultConfigurations(overrides2);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, { a: 2, b: 2, c: 3 });
    configurationRegistry.deregisterDefaultConfigurations(overrides2);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, { a: 1, b: 2 });
    configurationRegistry.deregisterDefaultConfigurations(overrides1);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, {});
  });
  test("configuration defaults - deregister merged object default language overrides", async () => {
    configurationRegistry.registerConfiguration({
      "id": "_test_default",
      "type": "object",
      "properties": {
        "config": {
          "type": "object"
        }
      }
    });
    const overrides1 = [{ overrides: { "[lang]": { "config": { a: 1, b: 2 } } }, source: { id: "source1", displayName: "source1" } }];
    const overrides2 = [{ overrides: { "[lang]": { "config": { a: 2, c: 3 } } }, source: { id: "source2", displayName: "source2" } }];
    configurationRegistry.registerDefaultConfigurations(overrides1);
    configurationRegistry.registerDefaultConfigurations(overrides2);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["[lang]"].default, { "config": { a: 2, b: 2, c: 3 } });
    configurationRegistry.deregisterDefaultConfigurations(overrides2);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["[lang]"].default, { "config": { a: 1, b: 2 } });
    configurationRegistry.deregisterDefaultConfigurations(overrides1);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["[lang]"], void 0);
  });
  test("configuration defaults - string source", async () => {
    configurationRegistry.registerConfiguration({
      "id": "_test_default",
      "type": "object",
      "properties": {
        "config": {
          "type": "object"
        }
      }
    });
    const overrides1 = [{ overrides: { "config": { a: 1, b: 2 } }, source: "source1" }];
    const overrides2 = [{ overrides: { "config": { a: 2, c: 3 } }, source: "source2" }];
    configurationRegistry.registerDefaultConfigurations(overrides1);
    configurationRegistry.registerDefaultConfigurations(overrides2);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, { a: 2, b: 2, c: 3 });
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].defaultValueSource instanceof Map, true);
    configurationRegistry.deregisterDefaultConfigurations(overrides2);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, { a: 1, b: 2 });
    configurationRegistry.deregisterDefaultConfigurations(overrides1);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, {});
  });
  test("configuration defaults - deregister with string source and extension source", async () => {
    configurationRegistry.registerConfiguration({
      "id": "_test_default",
      "type": "object",
      "properties": {
        "config": {
          "type": "object"
        }
      }
    });
    const overrides1 = [{ overrides: { "config": { a: 1, b: 2 } }, source: "stringSource" }];
    const overrides2 = [{ overrides: { "config": { a: 2, c: 3 } }, source: { id: "extSource", displayName: "Extension Source" } }];
    configurationRegistry.registerDefaultConfigurations(overrides1);
    configurationRegistry.registerDefaultConfigurations(overrides2);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, { a: 2, b: 2, c: 3 });
    configurationRegistry.deregisterDefaultConfigurations(overrides1);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, { a: 2, c: 3 });
    configurationRegistry.deregisterDefaultConfigurations(overrides2);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, {});
  });
  suite("isConfigurationDefaultSourceEquals", () => {
    test("both undefined", () => {
      assert.strictEqual(isConfigurationDefaultSourceEquals(void 0, void 0), true);
    });
    test("one undefined", () => {
      assert.strictEqual(isConfigurationDefaultSourceEquals("source", void 0), false);
      assert.strictEqual(isConfigurationDefaultSourceEquals(void 0, "source"), false);
      assert.strictEqual(isConfigurationDefaultSourceEquals({ id: "ext" }, void 0), false);
      assert.strictEqual(isConfigurationDefaultSourceEquals(void 0, { id: "ext" }), false);
    });
    test("same string source", () => {
      assert.strictEqual(isConfigurationDefaultSourceEquals("source", "source"), true);
    });
    test("different string sources", () => {
      assert.strictEqual(isConfigurationDefaultSourceEquals("source1", "source2"), false);
    });
    test("same extension source", () => {
      assert.strictEqual(isConfigurationDefaultSourceEquals({ id: "ext" }, { id: "ext" }), true);
    });
    test("different extension sources", () => {
      assert.strictEqual(isConfigurationDefaultSourceEquals({ id: "ext1" }, { id: "ext2" }), false);
    });
    test("string vs extension source", () => {
      assert.strictEqual(isConfigurationDefaultSourceEquals("ext", { id: "ext" }), false);
      assert.strictEqual(isConfigurationDefaultSourceEquals({ id: "ext" }, "ext"), false);
    });
    test("same reference", () => {
      const source = { id: "ext", displayName: "Extension" };
      assert.strictEqual(isConfigurationDefaultSourceEquals(source, source), true);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcY29uZmlndXJhdGlvblxcdGVzdFxcY29tbW9uXFxjb25maWd1cmF0aW9uUmVnaXN0cnkudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSwgaXNDb25maWd1cmF0aW9uRGVmYXVsdFNvdXJjZUVxdWFscyB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgUG9saWN5Q2F0ZWdvcnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wb2xpY3kuanMnO1xuXG5zdWl0ZSgnQ29uZmlndXJhdGlvblJlZ2lzdHJ5JywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXG5cdHNldHVwKCgpID0+IHJlc2V0KCkpO1xuXHR0ZWFyZG93bigoKSA9PiByZXNldCgpKTtcblxuXHRmdW5jdGlvbiByZXNldCgpIHtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkuZGVyZWdpc3RlckNvbmZpZ3VyYXRpb25zKGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9ucygpKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkuZGVyZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0UmVnaXN0ZXJlZERlZmF1bHRDb25maWd1cmF0aW9ucygpKTtcblx0fVxuXG5cdHRlc3QoJ2NvbmZpZ3VyYXRpb24gb3ZlcnJpZGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0XHQnaWQnOiAnX3Rlc3RfZGVmYXVsdCcsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdjb25maWcnOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhbeyBvdmVycmlkZXM6IHsgJ2NvbmZpZyc6IHsgYTogMSwgYjogMiB9IH0gfV0pO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhbeyBvdmVycmlkZXM6IHsgJ1tsYW5nXSc6IHsgYTogMiwgYzogMyB9IH0gfV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKVsnY29uZmlnJ10uZGVmYXVsdCwgeyBhOiAxLCBiOiAyIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKClbJ1tsYW5nXSddLmRlZmF1bHQsIHsgYTogMiwgYzogMyB9KTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlndXJhdGlvbiBvdmVycmlkZSBkZWZhdWx0cyAtIHByZXZlbnQgb3ZlcnJpZGluZyBkZWZhdWx0IHZhbHVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2lkJzogJ190ZXN0X2RlZmF1bHQnLFxuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnY29uZmlnLnByZXZlbnREZWZhdWx0VmFsdWVPdmVycmlkZSc6IHtcblx0XHRcdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHsgYTogMCB9LFxuXHRcdFx0XHRcdCdkaXNhbGxvd0NvbmZpZ3VyYXRpb25EZWZhdWx0JzogdHJ1ZVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMoW3sgb3ZlcnJpZGVzOiB7ICdjb25maWcucHJldmVudERlZmF1bHRWYWx1ZU92ZXJyaWRlJzogeyBhOiAxLCBiOiAyIH0gfSB9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpWydjb25maWcucHJldmVudERlZmF1bHRWYWx1ZU92ZXJyaWRlJ10uZGVmYXVsdCwgeyBhOiAwIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25maWd1cmF0aW9uIG92ZXJyaWRlIGRlZmF1bHRzIC0gbWVyZ2VzIGRlZmF1bHRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhbeyBvdmVycmlkZXM6IHsgJ1tsYW5nXSc6IHsgYTogMSwgYjogMiB9IH0gfV0pO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhbeyBvdmVycmlkZXM6IHsgJ1tsYW5nXSc6IHsgYTogMiwgYzogMyB9IH0gfV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKVsnW2xhbmddJ10uZGVmYXVsdCwgeyBhOiAyLCBiOiAyLCBjOiAzIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25maWd1cmF0aW9uIGRlZmF1bHRzIC0gbWVyZ2Ugb2JqZWN0IGRlZmF1bHQgb3ZlcnJpZGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2lkJzogJ190ZXN0X2RlZmF1bHQnLFxuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnY29uZmlnJzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMoW3sgb3ZlcnJpZGVzOiB7ICdjb25maWcnOiB7IGE6IDEsIGI6IDIgfSB9IH1dKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMoW3sgb3ZlcnJpZGVzOiB7ICdjb25maWcnOiB7IGE6IDIsIGM6IDMgfSB9IH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKClbJ2NvbmZpZyddLmRlZmF1bHQsIHsgYTogMiwgYjogMiwgYzogMyB9KTtcblx0fSk7XG5cblx0dGVzdCgncmVnaXN0ZXJpbmcgbXVsdGlwbGUgc2V0dGluZ3Mgd2l0aCBzYW1lIHBvbGljeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdCdpZCc6ICdfdGVzdF9kZWZhdWx0Jyxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3BvbGljeTEnOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRcdG5hbWU6ICdwb2xpY3knLFxuXHRcdFx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRcdGxvY2FsaXphdGlvbjogeyBkZXNjcmlwdGlvbjogeyBrZXk6ICcnLCB2YWx1ZTogJycgfSwgfVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0J3BvbGljeTInOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRcdG5hbWU6ICdwb2xpY3knLFxuXHRcdFx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRcdGxvY2FsaXphdGlvbjogeyBkZXNjcmlwdGlvbjogeyBrZXk6ICcnLCB2YWx1ZTogJycgfSwgfVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpO1xuXHRcdGFzc2VydC5vayhhY3R1YWxbJ3BvbGljeTEnXSAhPT0gdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQub2soYWN0dWFsWydwb2xpY3kyJ10gPT09IHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgcG9saWN5UmVmZXJlbmNlIGF0dGFjaGVzIGEgc3Vib3JkaW5hdGUgc2V0dGluZyB0byBhbiBvd25pbmcgcG9saWN5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2lkJzogJ190ZXN0X2RlZmF1bHQnLFxuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQncG9saWN5Lm93bmVyJzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRcdFx0bmFtZTogJ3NoYXJlZFBvbGljeScsXG5cdFx0XHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuRXh0ZW5zaW9ucyxcblx0XHRcdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0XHRcdFx0bG9jYWxpemF0aW9uOiB7IGRlc2NyaXB0aW9uOiB7IGtleTogJ293bmVyJywgdmFsdWU6ICcnIH0sIH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdwb2xpY3kuc3Vib3JkaW5hdGUnOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0cG9saWN5UmVmZXJlbmNlOiB7XG5cdFx0XHRcdFx0XHRuYW1lOiAnc2hhcmVkUG9saWN5Jyxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCBhY3R1YWwgPSBjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKTtcblx0XHRhc3NlcnQub2soYWN0dWFsWydwb2xpY3kub3duZXInXSAhPT0gdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQub2soYWN0dWFsWydwb2xpY3kuc3Vib3JkaW5hdGUnXSAhPT0gdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldFBvbGljeUNvbmZpZ3VyYXRpb25zKCkuZ2V0KCdzaGFyZWRQb2xpY3knKSwgJ3BvbGljeS5vd25lcicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLihjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0UG9saWN5UmVmZXJlbmNlQ29uZmlndXJhdGlvbnMoKS5nZXQoJ3NoYXJlZFBvbGljeScpID8/IFtdKV0sIFsncG9saWN5LnN1Ym9yZGluYXRlJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHBvbGljeVJlZmVyZW5jZSBkb2VzIG5vdCByZXF1aXJlIGl0cyBvd25lciB0byBiZSByZWdpc3RlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2lkJzogJ190ZXN0X2RlZmF1bHQnLFxuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQncG9saWN5Lm9ycGhhblJlZmVyZW5jZSc6IHtcblx0XHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0XHRwb2xpY3lSZWZlcmVuY2U6IHtcblx0XHRcdFx0XHRcdG5hbWU6ICdleHRlcm5hbGx5T3duZWRQb2xpY3knLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpO1xuXHRcdGFzc2VydC5vayhhY3R1YWxbJ3BvbGljeS5vcnBoYW5SZWZlcmVuY2UnXSAhPT0gdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldFBvbGljeUNvbmZpZ3VyYXRpb25zKCkuZ2V0KCdleHRlcm5hbGx5T3duZWRQb2xpY3knKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi4oY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldFBvbGljeVJlZmVyZW5jZUNvbmZpZ3VyYXRpb25zKCkuZ2V0KCdleHRlcm5hbGx5T3duZWRQb2xpY3knKSA/PyBbXSldLCBbJ3BvbGljeS5vcnBoYW5SZWZlcmVuY2UnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Egc2V0dGluZyBkZWNsYXJpbmcgYm90aCBwb2xpY3kgYW5kIHBvbGljeVJlZmVyZW5jZSBpcyByZWplY3RlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdCdpZCc6ICdfdGVzdF9kZWZhdWx0Jyxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3BvbGljeS5ib3RoJzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRcdFx0bmFtZTogJ3BvbGljeUJvdGgnLFxuXHRcdFx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRcdGxvY2FsaXphdGlvbjogeyBkZXNjcmlwdGlvbjogeyBrZXk6ICdib3RoJywgdmFsdWU6ICcnIH0sIH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHBvbGljeVJlZmVyZW5jZToge1xuXHRcdFx0XHRcdFx0bmFtZTogJ3BvbGljeUJvdGhSZWZlcmVuY2UnLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpO1xuXHRcdGFzc2VydC5vayhhY3R1YWxbJ3BvbGljeS5ib3RoJ10gPT09IHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRQb2xpY3lDb25maWd1cmF0aW9ucygpLmdldCgncG9saWN5Qm90aCcpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0UG9saWN5UmVmZXJlbmNlQ29uZmlndXJhdGlvbnMoKS5nZXQoJ3BvbGljeUJvdGhSZWZlcmVuY2UnKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlndXJhdGlvbiBkZWZhdWx0cyAtIGRlcmVnaXN0ZXIgbWVyZ2VkIG9iamVjdCBkZWZhdWx0IG92ZXJyaWRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2lkJzogJ190ZXN0X2RlZmF1bHQnLFxuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnY29uZmlnJzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IG92ZXJyaWRlczEgPSBbeyBvdmVycmlkZXM6IHsgJ2NvbmZpZyc6IHsgYTogMSwgYjogMiB9IH0sIHNvdXJjZTogeyBpZDogJ3NvdXJjZTEnLCBkaXNwbGF5TmFtZTogJ3NvdXJjZTEnIH0gfV07XG5cdFx0Y29uc3Qgb3ZlcnJpZGVzMiA9IFt7IG92ZXJyaWRlczogeyAnY29uZmlnJzogeyBhOiAyLCBjOiAzIH0gfSwgc291cmNlOiB7IGlkOiAnc291cmNlMicsIGRpc3BsYXlOYW1lOiAnc291cmNlMicgfSB9XTtcblxuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhvdmVycmlkZXMxKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMob3ZlcnJpZGVzMik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpWydjb25maWcnXS5kZWZhdWx0LCB7IGE6IDIsIGI6IDIsIGM6IDMgfSk7XG5cblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkuZGVyZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhvdmVycmlkZXMyKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKClbJ2NvbmZpZyddLmRlZmF1bHQsIHsgYTogMSwgYjogMiB9KTtcblxuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5kZXJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKG92ZXJyaWRlczEpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKVsnY29uZmlnJ10uZGVmYXVsdCwge30pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25maWd1cmF0aW9uIGRlZmF1bHRzIC0gZGVyZWdpc3RlciBtZXJnZWQgb2JqZWN0IGRlZmF1bHQgb3ZlcnJpZGUgd2l0aG91dCBzb3VyY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0XHQnaWQnOiAnX3Rlc3RfZGVmYXVsdCcsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdjb25maWcnOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgb3ZlcnJpZGVzMSA9IFt7IG92ZXJyaWRlczogeyAnY29uZmlnJzogeyBhOiAxLCBiOiAyIH0gfSB9XTtcblx0XHRjb25zdCBvdmVycmlkZXMyID0gW3sgb3ZlcnJpZGVzOiB7ICdjb25maWcnOiB7IGE6IDIsIGM6IDMgfSB9IH1dO1xuXG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKG92ZXJyaWRlczEpO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhvdmVycmlkZXMyKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKClbJ2NvbmZpZyddLmRlZmF1bHQsIHsgYTogMiwgYjogMiwgYzogMyB9KTtcblxuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5kZXJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKG92ZXJyaWRlczIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKVsnY29uZmlnJ10uZGVmYXVsdCwgeyBhOiAxLCBiOiAyIH0pO1xuXG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LmRlcmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMob3ZlcnJpZGVzMSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpWydjb25maWcnXS5kZWZhdWx0LCB7fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZpZ3VyYXRpb24gZGVmYXVsdHMgLSBkZXJlZ2lzdGVyIG1lcmdlZCBvYmplY3QgZGVmYXVsdCBsYW5ndWFnZSBvdmVycmlkZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0XHQnaWQnOiAnX3Rlc3RfZGVmYXVsdCcsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdjb25maWcnOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgb3ZlcnJpZGVzMSA9IFt7IG92ZXJyaWRlczogeyAnW2xhbmddJzogeyAnY29uZmlnJzogeyBhOiAxLCBiOiAyIH0gfSB9LCBzb3VyY2U6IHsgaWQ6ICdzb3VyY2UxJywgZGlzcGxheU5hbWU6ICdzb3VyY2UxJyB9IH1dO1xuXHRcdGNvbnN0IG92ZXJyaWRlczIgPSBbeyBvdmVycmlkZXM6IHsgJ1tsYW5nXSc6IHsgJ2NvbmZpZyc6IHsgYTogMiwgYzogMyB9IH0gfSwgc291cmNlOiB7IGlkOiAnc291cmNlMicsIGRpc3BsYXlOYW1lOiAnc291cmNlMicgfSB9XTtcblxuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhvdmVycmlkZXMxKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMob3ZlcnJpZGVzMik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpWydbbGFuZ10nXS5kZWZhdWx0LCB7ICdjb25maWcnOiB7IGE6IDIsIGI6IDIsIGM6IDMgfSB9KTtcblxuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5kZXJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKG92ZXJyaWRlczIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKVsnW2xhbmddJ10uZGVmYXVsdCwgeyAnY29uZmlnJzogeyBhOiAxLCBiOiAyIH0gfSk7XG5cblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkuZGVyZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhvdmVycmlkZXMxKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKClbJ1tsYW5nXSddLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25maWd1cmF0aW9uIGRlZmF1bHRzIC0gc3RyaW5nIHNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdCdpZCc6ICdfdGVzdF9kZWZhdWx0Jyxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J2NvbmZpZyc6IHtcblx0XHRcdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBvdmVycmlkZXMxID0gW3sgb3ZlcnJpZGVzOiB7ICdjb25maWcnOiB7IGE6IDEsIGI6IDIgfSB9LCBzb3VyY2U6ICdzb3VyY2UxJyB9XTtcblx0XHRjb25zdCBvdmVycmlkZXMyID0gW3sgb3ZlcnJpZGVzOiB7ICdjb25maWcnOiB7IGE6IDIsIGM6IDMgfSB9LCBzb3VyY2U6ICdzb3VyY2UyJyB9XTtcblxuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhvdmVycmlkZXMxKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMob3ZlcnJpZGVzMik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpWydjb25maWcnXS5kZWZhdWx0LCB7IGE6IDIsIGI6IDIsIGM6IDMgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKVsnY29uZmlnJ10uZGVmYXVsdFZhbHVlU291cmNlIGluc3RhbmNlb2YgTWFwLCB0cnVlKTtcblxuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5kZXJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKG92ZXJyaWRlczIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKVsnY29uZmlnJ10uZGVmYXVsdCwgeyBhOiAxLCBiOiAyIH0pO1xuXG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LmRlcmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMob3ZlcnJpZGVzMSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpWydjb25maWcnXS5kZWZhdWx0LCB7fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZpZ3VyYXRpb24gZGVmYXVsdHMgLSBkZXJlZ2lzdGVyIHdpdGggc3RyaW5nIHNvdXJjZSBhbmQgZXh0ZW5zaW9uIHNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdCdpZCc6ICdfdGVzdF9kZWZhdWx0Jyxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J2NvbmZpZyc6IHtcblx0XHRcdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBvdmVycmlkZXMxID0gW3sgb3ZlcnJpZGVzOiB7ICdjb25maWcnOiB7IGE6IDEsIGI6IDIgfSB9LCBzb3VyY2U6ICdzdHJpbmdTb3VyY2UnIH1dO1xuXHRcdGNvbnN0IG92ZXJyaWRlczIgPSBbeyBvdmVycmlkZXM6IHsgJ2NvbmZpZyc6IHsgYTogMiwgYzogMyB9IH0sIHNvdXJjZTogeyBpZDogJ2V4dFNvdXJjZScsIGRpc3BsYXlOYW1lOiAnRXh0ZW5zaW9uIFNvdXJjZScgfSB9XTtcblxuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhvdmVycmlkZXMxKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMob3ZlcnJpZGVzMik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpWydjb25maWcnXS5kZWZhdWx0LCB7IGE6IDIsIGI6IDIsIGM6IDMgfSk7XG5cblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkuZGVyZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhvdmVycmlkZXMxKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKClbJ2NvbmZpZyddLmRlZmF1bHQsIHsgYTogMiwgYzogMyB9KTtcblxuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5kZXJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKG92ZXJyaWRlczIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKVsnY29uZmlnJ10uZGVmYXVsdCwge30pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaXNDb25maWd1cmF0aW9uRGVmYXVsdFNvdXJjZUVxdWFscycsICgpID0+IHtcblxuXHRcdHRlc3QoJ2JvdGggdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQ29uZmlndXJhdGlvbkRlZmF1bHRTb3VyY2VFcXVhbHModW5kZWZpbmVkLCB1bmRlZmluZWQpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29uZSB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNDb25maWd1cmF0aW9uRGVmYXVsdFNvdXJjZUVxdWFscygnc291cmNlJywgdW5kZWZpbmVkKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQ29uZmlndXJhdGlvbkRlZmF1bHRTb3VyY2VFcXVhbHModW5kZWZpbmVkLCAnc291cmNlJyksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0NvbmZpZ3VyYXRpb25EZWZhdWx0U291cmNlRXF1YWxzKHsgaWQ6ICdleHQnIH0sIHVuZGVmaW5lZCksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0NvbmZpZ3VyYXRpb25EZWZhdWx0U291cmNlRXF1YWxzKHVuZGVmaW5lZCwgeyBpZDogJ2V4dCcgfSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NhbWUgc3RyaW5nIHNvdXJjZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0NvbmZpZ3VyYXRpb25EZWZhdWx0U291cmNlRXF1YWxzKCdzb3VyY2UnLCAnc291cmNlJyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlmZmVyZW50IHN0cmluZyBzb3VyY2VzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQ29uZmlndXJhdGlvbkRlZmF1bHRTb3VyY2VFcXVhbHMoJ3NvdXJjZTEnLCAnc291cmNlMicpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzYW1lIGV4dGVuc2lvbiBzb3VyY2UnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNDb25maWd1cmF0aW9uRGVmYXVsdFNvdXJjZUVxdWFscyh7IGlkOiAnZXh0JyB9LCB7IGlkOiAnZXh0JyB9KSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaWZmZXJlbnQgZXh0ZW5zaW9uIHNvdXJjZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNDb25maWd1cmF0aW9uRGVmYXVsdFNvdXJjZUVxdWFscyh7IGlkOiAnZXh0MScgfSwgeyBpZDogJ2V4dDInIH0pLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdHJpbmcgdnMgZXh0ZW5zaW9uIHNvdXJjZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0NvbmZpZ3VyYXRpb25EZWZhdWx0U291cmNlRXF1YWxzKCdleHQnLCB7IGlkOiAnZXh0JyB9KSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQ29uZmlndXJhdGlvbkRlZmF1bHRTb3VyY2VFcXVhbHMoeyBpZDogJ2V4dCcgfSwgJ2V4dCcpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzYW1lIHJlZmVyZW5jZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHNvdXJjZSA9IHsgaWQ6ICdleHQnLCBkaXNwbGF5TmFtZTogJ0V4dGVuc2lvbicgfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0NvbmZpZ3VyYXRpb25EZWZhdWx0U291cmNlRXF1YWxzKHNvdXJjZSwgc291cmNlKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxjQUFjLHlCQUFpRCwwQ0FBMEM7QUFDbEgsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBc0I7QUFFL0IsTUFBTSx5QkFBeUIsTUFBTTtBQUVwQywwQ0FBd0M7QUFFeEMsUUFBTSx3QkFBd0IsU0FBUyxHQUEyQix3QkFBd0IsYUFBYTtBQUV2RyxRQUFNLE1BQU0sTUFBTSxDQUFDO0FBQ25CLFdBQVMsTUFBTSxNQUFNLENBQUM7QUFFdEIsV0FBUyxRQUFRO0FBQ2hCLDBCQUFzQix5QkFBeUIsc0JBQXNCLGtCQUFrQixDQUFDO0FBQ3hGLDBCQUFzQixnQ0FBZ0Msc0JBQXNCLG1DQUFtQyxDQUFDO0FBQUEsRUFDakg7QUFFQSxPQUFLLDBCQUEwQixZQUFZO0FBQzFDLDBCQUFzQixzQkFBc0I7QUFBQSxNQUMzQyxNQUFNO0FBQUEsTUFDTixRQUFRO0FBQUEsTUFDUixjQUFjO0FBQUEsUUFDYixVQUFVO0FBQUEsVUFDVCxRQUFRO0FBQUEsUUFDVDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFDRCwwQkFBc0IsOEJBQThCLENBQUMsRUFBRSxXQUFXLEVBQUUsVUFBVSxFQUFFLEdBQUcsR0FBRyxHQUFHLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztBQUNqRywwQkFBc0IsOEJBQThCLENBQUMsRUFBRSxXQUFXLEVBQUUsVUFBVSxFQUFFLEdBQUcsR0FBRyxHQUFHLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztBQUVqRyxXQUFPLGdCQUFnQixzQkFBc0IsMkJBQTJCLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUM7QUFDM0csV0FBTyxnQkFBZ0Is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
