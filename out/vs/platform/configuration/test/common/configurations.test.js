import assert from "assert";
import { Event } from "../../../../base/common/event.js";
import { equals } from "../../../../base/common/objects.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Extensions } from "../../common/configurationRegistry.js";
import { DefaultConfiguration } from "../../common/configurations.js";
import { NullLogService } from "../../../log/common/log.js";
import { Registry } from "../../../registry/common/platform.js";
suite("DefaultConfiguration", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const configurationRegistry = Registry.as(Extensions.Configuration);
  setup(() => reset());
  teardown(() => reset());
  function reset() {
    configurationRegistry.deregisterConfigurations(configurationRegistry.getConfigurations());
    configurationRegistry.deregisterDefaultConfigurations(configurationRegistry.getRegisteredDefaultConfigurations());
  }
  test("Test registering a property before initialize", async () => {
    const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
    configurationRegistry.registerConfiguration({
      "id": "a",
      "order": 1,
      "title": "a",
      "type": "object",
      "properties": {
        "a": {
          "description": "a",
          "type": "boolean",
          "default": false
        }
      }
    });
    const actual = await testObject.initialize();
    assert.strictEqual(actual.getValue("a"), false);
  });
  test("Test registering a property and do not initialize", async () => {
    const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
    configurationRegistry.registerConfiguration({
      "id": "a",
      "order": 1,
      "title": "a",
      "type": "object",
      "properties": {
        "a": {
          "description": "a",
          "type": "boolean",
          "default": false
        }
      }
    });
    assert.strictEqual(testObject.configurationModel.getValue("a"), void 0);
  });
  test("Test registering a property after initialize", async () => {
    const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
    await testObject.initialize();
    const promise = Event.toPromise(testObject.onDidChangeConfiguration);
    configurationRegistry.registerConfiguration({
      "id": "a",
      "order": 1,
      "title": "a",
      "type": "object",
      "properties": {
        "defaultConfiguration.testSetting1": {
          "description": "a",
          "type": "boolean",
          "default": false
        }
      }
    });
    const { defaults: actual, properties } = await promise;
    assert.strictEqual(actual.getValue("defaultConfiguration.testSetting1"), false);
    assert.deepStrictEqual(properties, ["defaultConfiguration.testSetting1"]);
  });
  test("Test registering nested properties", async () => {
    const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
    configurationRegistry.registerConfiguration({
      "id": "a",
      "order": 1,
      "title": "a",
      "type": "object",
      "properties": {
        "a.b": {
          "description": "1",
          "type": "object",
          "default": {}
        },
        "a.b.c": {
          "description": "2",
          "type": "object",
          "default": "2"
        }
      }
    });
    const actual = await testObject.initialize();
    assert.ok(equals(actual.getValue("a"), { b: { c: "2" } }));
    assert.ok(equals(actual.contents, { "a": { b: { c: "2" } } }));
    assert.deepStrictEqual(actual.keys.sort(), ["a.b", "a.b.c"]);
  });
  test("Test registering the same property again", async () => {
    const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
    configurationRegistry.registerConfiguration({
      "id": "a",
      "order": 1,
      "title": "a",
      "type": "object",
      "properties": {
        "a": {
          "description": "a",
          "type": "boolean",
          "default": true
        }
      }
    });
    configurationRegistry.registerConfiguration({
      "id": "a",
      "order": 1,
      "title": "a",
      "type": "object",
      "properties": {
        "a": {
          "description": "a",
          "type": "boolean",
          "default": false
        }
      }
    });
    const actual = await testObject.initialize();
    assert.strictEqual(true, actual.getValue("a"));
  });
  test("Test registering an override identifier", async () => {
    const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
    configurationRegistry.registerDefaultConfigurations([{
      overrides: {
        "[a]": {
          "b": true
        }
      }
    }]);
    const actual = await testObject.initialize();
    assert.ok(equals(actual.getValue("[a]"), { "b": true }));
    assert.ok(equals(actual.contents, { "[a]": { "b": true } }));
    assert.ok(equals(actual.overrides, [{ contents: { "b": true }, identifiers: ["a"], keys: ["b"] }]));
    assert.deepStrictEqual(actual.keys.sort(), ["[a]"]);
    assert.strictEqual(actual.getOverrideValue("b", "a"), true);
  });
  test("Test registering a normal property and override identifier", async () => {
    const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
    configurationRegistry.registerConfiguration({
      "id": "a",
      "order": 1,
      "title": "a",
      "type": "object",
      "properties": {
        "b": {
          "description": "b",
          "type": "boolean",
          "default": false
        }
      }
    });
    configurationRegistry.registerDefaultConfigurations([{
      overrides: {
        "[a]": {
          "b": true
        }
      }
    }]);
    const actual = await testObject.initialize();
    assert.deepStrictEqual(actual.getValue("b"), false);
    assert.ok(equals(actual.getValue("[a]"), { "b": true }));
    assert.ok(equals(actual.contents, { "b": false, "[a]": { "b": true } }));
    assert.ok(equals(actual.overrides, [{ contents: { "b": true }, identifiers: ["a"], keys: ["b"] }]));
    assert.deepStrictEqual(actual.keys.sort(), ["[a]", "b"]);
    assert.strictEqual(actual.getOverrideValue("b", "a"), true);
  });
  test("Test normal property is registered after override identifier", async () => {
    const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
    const promise = Event.toPromise(testObject.onDidChangeConfiguration);
    configurationRegistry.registerDefaultConfigurations([{
      overrides: {
        "[a]": {
          "b": true
        }
      }
    }]);
    await testObject.initialize();
    configurationRegistry.registerConfiguration({
      "id": "a",
      "order": 1,
      "title": "a",
      "type": "object",
      "properties": {
        "b": {
          "description": "b",
          "type": "boolean",
          "default": false
        }
      }
    });
    const { defaults: actual, properties } = await promise;
    assert.deepStrictEqual(actual.getValue("b"), false);
    assert.ok(equals(actual.getValue("[a]"), { "b": true }));
    assert.ok(equals(actual.contents, { "b": false, "[a]": { "b": true } }));
    assert.ok(equals(actual.overrides, [{ contents: { "b": true }, identifiers: ["a"], keys: ["b"] }]));
    assert.deepStrictEqual(actual.keys.sort(), ["[a]", "b"]);
    assert.strictEqual(actual.getOverrideValue("b", "a"), true);
    assert.deepStrictEqual(properties, ["b"]);
  });
  test("Test override identifier is registered after property", async () => {
    const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
    const promise = Event.toPromise(testObject.onDidChangeConfiguration);
    configurationRegistry.registerConfiguration({
      "id": "a",
      "order": 1,
      "title": "a",
      "type": "object",
      "properties": {
        "b": {
          "description": "b",
          "type": "boolean",
          "default": false
        }
      }
    });
    await testObject.initialize();
    configurationRegistry.registerDefaultConfigurations([{
      overrides: {
        "[a]": {
          "b": true
        }
      }
    }]);
    const { defaults: actual, properties } = await promise;
    assert.deepStrictEqual(actual.getValue("b"), false);
    assert.ok(equals(actual.getValue("[a]"), { "b": true }));
    assert.ok(equals(actual.contents, { "b": false, "[a]": { "b": true } }));
    assert.ok(equals(actual.overrides, [{ contents: { "b": true }, identifiers: ["a"], keys: ["b"] }]));
    assert.deepStrictEqual(actual.keys.sort(), ["[a]", "b"]);
    assert.strictEqual(actual.getOverrideValue("b", "a"), true);
    assert.deepStrictEqual(properties, ["[a]"]);
  });
  test("Test register override identifier and property after initialize", async () => {
    const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
    await testObject.initialize();
    configurationRegistry.registerConfiguration({
      "id": "a",
      "order": 1,
      "title": "a",
      "type": "object",
      "properties": {
        "b": {
          "description": "b",
          "type": "boolean",
          "default": false
        }
      }
    });
    configurationRegistry.registerDefaultConfigurations([{
      overrides: {
        "[a]": {
          "b": true
        }
      }
    }]);
    const actual = testObject.configurationModel;
    assert.deepStrictEqual(actual.getValue("b"), false);
    assert.ok(equals(actual.getValue("[a]"), { "b": true }));
    assert.ok(equals(actual.contents, { "b": false, "[a]": { "b": true } }));
    assert.ok(equals(actual.overrides, [{ contents: { "b": true }, identifiers: ["a"], keys: ["b"] }]));
    assert.deepStrictEqual(actual.keys.sort(), ["[a]", "b"]);
    assert.strictEqual(actual.getOverrideValue("b", "a"), true);
  });
  test("Test deregistering a property", async () => {
    const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
    const promise = Event.toPromise(testObject.onDidChangeConfiguration);
    const node = {
      "id": "a",
      "order": 1,
      "title": "a",
      "type": "object",
      "properties": {
        "a": {
          "description": "a",
          "type": "boolean",
          "default": false
        }
      }
    };
    configurationRegistry.registerConfiguration(node);
    await testObject.initialize();
    configurationRegistry.deregisterConfigurations([node]);
    const { defaults: actual, properties } = await promise;
    assert.strictEqual(actual.getValue("a"), void 0);
    assert.ok(equals(actual.contents, {}));
    assert.deepStrictEqual(actual.keys, []);
    assert.deepStrictEqual(properties, ["a"]);
  });
  test("Test deregistering an override identifier", async () => {
    const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
    configurationRegistry.registerConfiguration({
      "id": "a",
      "order": 1,
      "title": "a",
      "type": "object",
      "properties": {
        "b": {
          "description": "b",
          "type": "boolean",
          "default": false
        }
      }
    });
    const node = {
      overrides: {
        "[a]": {
          "b": true
        }
      }
    };
    configurationRegistry.registerDefaultConfigurations([node]);
    await testObject.initialize();
    configurationRegistry.deregisterDefaultConfigurations([node]);
    assert.deepStrictEqual(testObject.configurationModel.getValue("[a]"), void 0);
    assert.ok(equals(testObject.configurationModel.contents, { "b": false }));
    assert.ok(equals(testObject.configurationModel.overrides, []));
    assert.deepStrictEqual(testObject.configurationModel.keys, ["b"]);
    assert.strictEqual(testObject.configurationModel.getOverrideValue("b", "a"), void 0);
  });
  test("Test deregistering a merged language object setting", async () => {
    const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
    configurationRegistry.registerConfiguration({
      "id": "b",
      "order": 1,
      "title": "b",
      "type": "object",
      "properties": {
        "b": {
          "description": "b",
          "type": "object",
          "default": {}
        }
      }
    });
    const node1 = {
      overrides: {
        "[a]": {
          "b": {
            "aa": "1",
            "bb": "2"
          }
        }
      },
      source: { id: "source1", displayName: "source1" }
    };
    const node2 = {
      overrides: {
        "[a]": {
          "b": {
            "bb": "20",
            "cc": "30"
          }
        }
      },
      source: { id: "source2", displayName: "source2" }
    };
    configurationRegistry.registerDefaultConfigurations([node1]);
    configurationRegistry.registerDefaultConfigurations([node2]);
    await testObject.initialize();
    configurationRegistry.deregisterDefaultConfigurations([node1]);
    assert.ok(equals(testObject.configurationModel.getValue("[a]"), { "b": { "bb": "20", "cc": "30" } }));
    assert.ok(equals(testObject.configurationModel.contents, { "[a]": { "b": { "bb": "20", "cc": "30" } }, "b": {} }));
    assert.ok(equals(testObject.configurationModel.overrides, [{ contents: { "b": { "bb": "20", "cc": "30" } }, identifiers: ["a"], keys: ["b"] }]));
    assert.deepStrictEqual(testObject.configurationModel.keys.sort(), ["[a]", "b"]);
    assert.ok(equals(testObject.configurationModel.getOverrideValue("b", "a"), { "bb": "20", "cc": "30" }));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcY29uZmlndXJhdGlvblxcdGVzdFxcY29tbW9uXFxjb25maWd1cmF0aW9ucy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25Ob2RlLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBEZWZhdWx0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25maWd1cmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcblxuc3VpdGUoJ0RlZmF1bHRDb25maWd1cmF0aW9uJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5cblx0c2V0dXAoKCkgPT4gcmVzZXQoKSk7XG5cdHRlYXJkb3duKCgpID0+IHJlc2V0KCkpO1xuXG5cdGZ1bmN0aW9uIHJlc2V0KCkge1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5kZXJlZ2lzdGVyQ29uZmlndXJhdGlvbnMoY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25zKCkpO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5kZXJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRSZWdpc3RlcmVkRGVmYXVsdENvbmZpZ3VyYXRpb25zKCkpO1xuXHR9XG5cblx0dGVzdCgnVGVzdCByZWdpc3RlcmluZyBhIHByb3BlcnR5IGJlZm9yZSBpbml0aWFsaXplJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERlZmF1bHRDb25maWd1cmF0aW9uKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0XHQnaWQnOiAnYScsXG5cdFx0XHQnb3JkZXInOiAxLFxuXHRcdFx0J3RpdGxlJzogJ2EnLFxuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnYSc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiAnYScsXG5cdFx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiBmYWxzZSxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZ2V0VmFsdWUoJ2EnKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXN0IHJlZ2lzdGVyaW5nIGEgcHJvcGVydHkgYW5kIGRvIG5vdCBpbml0aWFsaXplJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERlZmF1bHRDb25maWd1cmF0aW9uKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0XHQnaWQnOiAnYScsXG5cdFx0XHQnb3JkZXInOiAxLFxuXHRcdFx0J3RpdGxlJzogJ2EnLFxuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnYSc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiAnYScsXG5cdFx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiBmYWxzZSxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgnYScpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXN0IHJlZ2lzdGVyaW5nIGEgcHJvcGVydHkgYWZ0ZXIgaW5pdGlhbGl6ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWZhdWx0Q29uZmlndXJhdGlvbihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXHRcdGNvbnN0IHByb21pc2UgPSBFdmVudC50b1Byb21pc2UodGVzdE9iamVjdC5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24pO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2lkJzogJ2EnLFxuXHRcdFx0J29yZGVyJzogMSxcblx0XHRcdCd0aXRsZSc6ICdhJyxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J2RlZmF1bHRDb25maWd1cmF0aW9uLnRlc3RTZXR0aW5nMSc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiAnYScsXG5cdFx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiBmYWxzZSxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbnN0IHsgZGVmYXVsdHM6IGFjdHVhbCwgcHJvcGVydGllcyB9ID0gYXdhaXQgcHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdldFZhbHVlKCdkZWZhdWx0Q29uZmlndXJhdGlvbi50ZXN0U2V0dGluZzEnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvcGVydGllcywgWydkZWZhdWx0Q29uZmlndXJhdGlvbi50ZXN0U2V0dGluZzEnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Rlc3QgcmVnaXN0ZXJpbmcgbmVzdGVkIHByb3BlcnRpZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdENvbmZpZ3VyYXRpb24obmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdCdpZCc6ICdhJyxcblx0XHRcdCdvcmRlcic6IDEsXG5cdFx0XHQndGl0bGUnOiAnYScsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdhLmInOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogJzEnLFxuXHRcdFx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiB7fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0J2EuYi5jJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6ICcyJyxcblx0XHRcdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0XHRcdCdkZWZhdWx0JzogJzInLFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblxuXHRcdGFzc2VydC5vayhlcXVhbHMoYWN0dWFsLmdldFZhbHVlKCdhJyksIHsgYjogeyBjOiAnMicgfSB9KSk7XG5cdFx0YXNzZXJ0Lm9rKGVxdWFscyhhY3R1YWwuY29udGVudHMsIHsgJ2EnOiB7IGI6IHsgYzogJzInIH0gfSB9KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwua2V5cy5zb3J0KCksIFsnYS5iJywgJ2EuYi5jJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXN0IHJlZ2lzdGVyaW5nIHRoZSBzYW1lIHByb3BlcnR5IGFnYWluJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERlZmF1bHRDb25maWd1cmF0aW9uKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0XHQnaWQnOiAnYScsXG5cdFx0XHQnb3JkZXInOiAxLFxuXHRcdFx0J3RpdGxlJzogJ2EnLFxuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnYSc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiAnYScsXG5cdFx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiB0cnVlLFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0XHQnaWQnOiAnYScsXG5cdFx0XHQnb3JkZXInOiAxLFxuXHRcdFx0J3RpdGxlJzogJ2EnLFxuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnYSc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiAnYScsXG5cdFx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiBmYWxzZSxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cnVlLCBhY3R1YWwuZ2V0VmFsdWUoJ2EnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Rlc3QgcmVnaXN0ZXJpbmcgYW4gb3ZlcnJpZGUgaWRlbnRpZmllcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWZhdWx0Q29uZmlndXJhdGlvbihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhbe1xuXHRcdFx0b3ZlcnJpZGVzOiB7XG5cdFx0XHRcdCdbYV0nOiB7XG5cdFx0XHRcdFx0J2InOiB0cnVlXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cdFx0YXNzZXJ0Lm9rKGVxdWFscyhhY3R1YWwuZ2V0VmFsdWUoJ1thXScpLCB7ICdiJzogdHJ1ZSB9KSk7XG5cdFx0YXNzZXJ0Lm9rKGVxdWFscyhhY3R1YWwuY29udGVudHMsIHsgJ1thXSc6IHsgJ2InOiB0cnVlIH0gfSkpO1xuXHRcdGFzc2VydC5vayhlcXVhbHMoYWN0dWFsLm92ZXJyaWRlcywgW3sgY29udGVudHM6IHsgJ2InOiB0cnVlIH0sIGlkZW50aWZpZXJzOiBbJ2EnXSwga2V5czogWydiJ10gfV0pKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5rZXlzLnNvcnQoKSwgWydbYV0nXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nZXRPdmVycmlkZVZhbHVlKCdiJywgJ2EnKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Rlc3QgcmVnaXN0ZXJpbmcgYSBub3JtYWwgcHJvcGVydHkgYW5kIG92ZXJyaWRlIGlkZW50aWZpZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdENvbmZpZ3VyYXRpb24obmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdCdpZCc6ICdhJyxcblx0XHRcdCdvcmRlcic6IDEsXG5cdFx0XHQndGl0bGUnOiAnYScsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdiJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6ICdiJyxcblx0XHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0XHQnZGVmYXVsdCc6IGZhbHNlLFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMoW3tcblx0XHRcdG92ZXJyaWRlczoge1xuXHRcdFx0XHQnW2FdJzoge1xuXHRcdFx0XHRcdCdiJzogdHJ1ZVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fV0pO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuZ2V0VmFsdWUoJ2InKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5vayhlcXVhbHMoYWN0dWFsLmdldFZhbHVlKCdbYV0nKSwgeyAnYic6IHRydWUgfSkpO1xuXHRcdGFzc2VydC5vayhlcXVhbHMoYWN0dWFsLmNvbnRlbnRzLCB7ICdiJzogZmFsc2UsICdbYV0nOiB7ICdiJzogdHJ1ZSB9IH0pKTtcblx0XHRhc3NlcnQub2soZXF1YWxzKGFjdHVhbC5vdmVycmlkZXMsIFt7IGNvbnRlbnRzOiB7ICdiJzogdHJ1ZSB9LCBpZGVudGlmaWVyczogWydhJ10sIGtleXM6IFsnYiddIH1dKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwua2V5cy5zb3J0KCksIFsnW2FdJywgJ2InXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nZXRPdmVycmlkZVZhbHVlKCdiJywgJ2EnKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Rlc3Qgbm9ybWFsIHByb3BlcnR5IGlzIHJlZ2lzdGVyZWQgYWZ0ZXIgb3ZlcnJpZGUgaWRlbnRpZmllcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWZhdWx0Q29uZmlndXJhdGlvbihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHByb21pc2UgPSBFdmVudC50b1Byb21pc2UodGVzdE9iamVjdC5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24pO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhbe1xuXHRcdFx0b3ZlcnJpZGVzOiB7XG5cdFx0XHRcdCdbYV0nOiB7XG5cdFx0XHRcdFx0J2InOiB0cnVlXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XSk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblxuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2lkJzogJ2EnLFxuXHRcdFx0J29yZGVyJzogMSxcblx0XHRcdCd0aXRsZSc6ICdhJyxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J2InOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogJ2InLFxuXHRcdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdCdkZWZhdWx0JzogZmFsc2UsXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHsgZGVmYXVsdHM6IGFjdHVhbCwgcHJvcGVydGllcyB9ID0gYXdhaXQgcHJvbWlzZTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5nZXRWYWx1ZSgnYicpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0Lm9rKGVxdWFscyhhY3R1YWwuZ2V0VmFsdWUoJ1thXScpLCB7ICdiJzogdHJ1ZSB9KSk7XG5cdFx0YXNzZXJ0Lm9rKGVxdWFscyhhY3R1YWwuY29udGVudHMsIHsgJ2InOiBmYWxzZSwgJ1thXSc6IHsgJ2InOiB0cnVlIH0gfSkpO1xuXHRcdGFzc2VydC5vayhlcXVhbHMoYWN0dWFsLm92ZXJyaWRlcywgW3sgY29udGVudHM6IHsgJ2InOiB0cnVlIH0sIGlkZW50aWZpZXJzOiBbJ2EnXSwga2V5czogWydiJ10gfV0pKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5rZXlzLnNvcnQoKSwgWydbYV0nLCAnYiddKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdldE92ZXJyaWRlVmFsdWUoJ2InLCAnYScpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3BlcnRpZXMsIFsnYiddKTtcblx0fSk7XG5cblx0dGVzdCgnVGVzdCBvdmVycmlkZSBpZGVudGlmaWVyIGlzIHJlZ2lzdGVyZWQgYWZ0ZXIgcHJvcGVydHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdENvbmZpZ3VyYXRpb24obmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBwcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKHRlc3RPYmplY3Qub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdCdpZCc6ICdhJyxcblx0XHRcdCdvcmRlcic6IDEsXG5cdFx0XHQndGl0bGUnOiAnYScsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdiJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6ICdiJyxcblx0XHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0XHQnZGVmYXVsdCc6IGZhbHNlLFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMoW3tcblx0XHRcdG92ZXJyaWRlczoge1xuXHRcdFx0XHQnW2FdJzoge1xuXHRcdFx0XHRcdCdiJzogdHJ1ZVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fV0pO1xuXG5cdFx0Y29uc3QgeyBkZWZhdWx0czogYWN0dWFsLCBwcm9wZXJ0aWVzIH0gPSBhd2FpdCBwcm9taXNlO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmdldFZhbHVlKCdiJyksIGZhbHNlKTtcblx0XHRhc3NlcnQub2soZXF1YWxzKGFjdHVhbC5nZXRWYWx1ZSgnW2FdJyksIHsgJ2InOiB0cnVlIH0pKTtcblx0XHRhc3NlcnQub2soZXF1YWxzKGFjdHVhbC5jb250ZW50cywgeyAnYic6IGZhbHNlLCAnW2FdJzogeyAnYic6IHRydWUgfSB9KSk7XG5cdFx0YXNzZXJ0Lm9rKGVxdWFscyhhY3R1YWwub3ZlcnJpZGVzLCBbeyBjb250ZW50czogeyAnYic6IHRydWUgfSwgaWRlbnRpZmllcnM6IFsnYSddLCBrZXlzOiBbJ2InXSB9XSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmtleXMuc29ydCgpLCBbJ1thXScsICdiJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZ2V0T3ZlcnJpZGVWYWx1ZSgnYicsICdhJyksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvcGVydGllcywgWydbYV0nXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Rlc3QgcmVnaXN0ZXIgb3ZlcnJpZGUgaWRlbnRpZmllciBhbmQgcHJvcGVydHkgYWZ0ZXIgaW5pdGlhbGl6ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWZhdWx0Q29uZmlndXJhdGlvbihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdCdpZCc6ICdhJyxcblx0XHRcdCdvcmRlcic6IDEsXG5cdFx0XHQndGl0bGUnOiAnYScsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdiJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6ICdiJyxcblx0XHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0XHQnZGVmYXVsdCc6IGZhbHNlLFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKFt7XG5cdFx0XHRvdmVycmlkZXM6IHtcblx0XHRcdFx0J1thXSc6IHtcblx0XHRcdFx0XHQnYic6IHRydWVcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1dKTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IHRlc3RPYmplY3QuY29uZmlndXJhdGlvbk1vZGVsO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmdldFZhbHVlKCdiJyksIGZhbHNlKTtcblx0XHRhc3NlcnQub2soZXF1YWxzKGFjdHVhbC5nZXRWYWx1ZSgnW2FdJyksIHsgJ2InOiB0cnVlIH0pKTtcblx0XHRhc3NlcnQub2soZXF1YWxzKGFjdHVhbC5jb250ZW50cywgeyAnYic6IGZhbHNlLCAnW2FdJzogeyAnYic6IHRydWUgfSB9KSk7XG5cdFx0YXNzZXJ0Lm9rKGVxdWFscyhhY3R1YWwub3ZlcnJpZGVzLCBbeyBjb250ZW50czogeyAnYic6IHRydWUgfSwgaWRlbnRpZmllcnM6IFsnYSddLCBrZXlzOiBbJ2InXSB9XSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmtleXMuc29ydCgpLCBbJ1thXScsICdiJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZ2V0T3ZlcnJpZGVWYWx1ZSgnYicsICdhJyksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXN0IGRlcmVnaXN0ZXJpbmcgYSBwcm9wZXJ0eScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWZhdWx0Q29uZmlndXJhdGlvbihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHByb21pc2UgPSBFdmVudC50b1Byb21pc2UodGVzdE9iamVjdC5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24pO1xuXHRcdGNvbnN0IG5vZGU6IElDb25maWd1cmF0aW9uTm9kZSA9IHtcblx0XHRcdCdpZCc6ICdhJyxcblx0XHRcdCdvcmRlcic6IDEsXG5cdFx0XHQndGl0bGUnOiAnYScsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdhJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6ICdhJyxcblx0XHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0XHQnZGVmYXVsdCc6IGZhbHNlLFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKG5vZGUpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5kZXJlZ2lzdGVyQ29uZmlndXJhdGlvbnMoW25vZGVdKTtcblxuXHRcdGNvbnN0IHsgZGVmYXVsdHM6IGFjdHVhbCwgcHJvcGVydGllcyB9ID0gYXdhaXQgcHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdldFZhbHVlKCdhJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0Lm9rKGVxdWFscyhhY3R1YWwuY29udGVudHMsIHt9KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwua2V5cywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvcGVydGllcywgWydhJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXN0IGRlcmVnaXN0ZXJpbmcgYW4gb3ZlcnJpZGUgaWRlbnRpZmllcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWZhdWx0Q29uZmlndXJhdGlvbihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2lkJzogJ2EnLFxuXHRcdFx0J29yZGVyJzogMSxcblx0XHRcdCd0aXRsZSc6ICdhJyxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J2InOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogJ2InLFxuXHRcdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdCdkZWZhdWx0JzogZmFsc2UsXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCBub2RlID0ge1xuXHRcdFx0b3ZlcnJpZGVzOiB7XG5cdFx0XHRcdCdbYV0nOiB7XG5cdFx0XHRcdFx0J2InOiB0cnVlXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhbbm9kZV0pO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5kZXJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKFtub2RlXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgnW2FdJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0Lm9rKGVxdWFscyh0ZXN0T2JqZWN0LmNvbmZpZ3VyYXRpb25Nb2RlbC5jb250ZW50cywgeyAnYic6IGZhbHNlIH0pKTtcblx0XHRhc3NlcnQub2soZXF1YWxzKHRlc3RPYmplY3QuY29uZmlndXJhdGlvbk1vZGVsLm92ZXJyaWRlcywgW10pKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmlndXJhdGlvbk1vZGVsLmtleXMsIFsnYiddKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25maWd1cmF0aW9uTW9kZWwuZ2V0T3ZlcnJpZGVWYWx1ZSgnYicsICdhJyksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Rlc3QgZGVyZWdpc3RlcmluZyBhIG1lcmdlZCBsYW5ndWFnZSBvYmplY3Qgc2V0dGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWZhdWx0Q29uZmlndXJhdGlvbihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2lkJzogJ2InLFxuXHRcdFx0J29yZGVyJzogMSxcblx0XHRcdCd0aXRsZSc6ICdiJyxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J2InOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogJ2InLFxuXHRcdFx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiB7fSxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbnN0IG5vZGUxID0ge1xuXHRcdFx0b3ZlcnJpZGVzOiB7XG5cdFx0XHRcdCdbYV0nOiB7XG5cdFx0XHRcdFx0J2InOiB7XG5cdFx0XHRcdFx0XHQnYWEnOiAnMScsXG5cdFx0XHRcdFx0XHQnYmInOiAnMidcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRzb3VyY2U6IHsgaWQ6ICdzb3VyY2UxJywgZGlzcGxheU5hbWU6ICdzb3VyY2UxJyB9XG5cdFx0fTtcblxuXHRcdGNvbnN0IG5vZGUyID0ge1xuXHRcdFx0b3ZlcnJpZGVzOiB7XG5cdFx0XHRcdCdbYV0nOiB7XG5cdFx0XHRcdFx0J2InOiB7XG5cdFx0XHRcdFx0XHQnYmInOiAnMjAnLFxuXHRcdFx0XHRcdFx0J2NjJzogJzMwJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHNvdXJjZTogeyBpZDogJ3NvdXJjZTInLCBkaXNwbGF5TmFtZTogJ3NvdXJjZTInIH1cblx0XHR9O1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhbbm9kZTFdKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMoW25vZGUyXSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkuZGVyZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhbbm9kZTFdKTtcblx0XHRhc3NlcnQub2soZXF1YWxzKHRlc3RPYmplY3QuY29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlKCdbYV0nKSwgeyAnYic6IHsgJ2JiJzogJzIwJywgJ2NjJzogJzMwJyB9IH0pKTtcblx0XHRhc3NlcnQub2soZXF1YWxzKHRlc3RPYmplY3QuY29uZmlndXJhdGlvbk1vZGVsLmNvbnRlbnRzLCB7ICdbYV0nOiB7ICdiJzogeyAnYmInOiAnMjAnLCAnY2MnOiAnMzAnIH0gfSwgJ2InOiB7fSB9KSk7XG5cdFx0YXNzZXJ0Lm9rKGVxdWFscyh0ZXN0T2JqZWN0LmNvbmZpZ3VyYXRpb25Nb2RlbC5vdmVycmlkZXMsIFt7IGNvbnRlbnRzOiB7ICdiJzogeyAnYmInOiAnMjAnLCAnY2MnOiAnMzAnIH0gfSwgaWRlbnRpZmllcnM6IFsnYSddLCBrZXlzOiBbJ2InXSB9XSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25maWd1cmF0aW9uTW9kZWwua2V5cy5zb3J0KCksIFsnW2FdJywgJ2InXSk7XG5cdFx0YXNzZXJ0Lm9rKGVxdWFscyh0ZXN0T2JqZWN0LmNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRPdmVycmlkZVZhbHVlKCdiJywgJ2EnKSwgeyAnYmInOiAnMjAnLCAnY2MnOiAnMzAnIH0pKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsa0JBQThEO0FBQ3ZFLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0JBQWdCO0FBRXpCLE1BQU0sd0JBQXdCLE1BQU07QUFFbkMsUUFBTSxjQUFjLHdDQUF3QztBQUM1RCxRQUFNLHdCQUF3QixTQUFTLEdBQTJCLFdBQVcsYUFBYTtBQUUxRixRQUFNLE1BQU0sTUFBTSxDQUFDO0FBQ25CLFdBQVMsTUFBTSxNQUFNLENBQUM7QUFFdEIsV0FBUyxRQUFRO0FBQ2hCLDBCQUFzQix5QkFBeUIsc0JBQXNCLGtCQUFrQixDQUFDO0FBQ3hGLDBCQUFzQixnQ0FBZ0Msc0JBQXNCLG1DQUFtQyxDQUFDO0FBQUEsRUFDakg7QUFFQSxPQUFLLGlEQUFpRCxZQUFZO0FBQ2pFLFVBQU0sYUFBYSxZQUFZLElBQUksSUFBSSxxQkFBcUIsSUFBSSxlQUFlLENBQUMsQ0FBQztBQUNqRiwwQkFBc0Isc0JBQXNCO0FBQUEsTUFDM0MsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsU0FBUztBQUFBLE1BQ1QsUUFBUTtBQUFBLE1BQ1IsY0FBYztBQUFBLFFBQ2IsS0FBSztBQUFBLFVBQ0osZUFBZTtBQUFBLFVBQ2YsUUFBUTtBQUFBLFVBQ1IsV0FBVztBQUFBLFFBQ1o7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQ0QsVUFBTSxTQUFTLE1BQU0sV0FBVyxXQUFXO0FBQzNDLFdBQU8sWUFBWSxPQUFPLFNBQVMsR0FBRyxHQUFHLEtBQUs7QUFB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
