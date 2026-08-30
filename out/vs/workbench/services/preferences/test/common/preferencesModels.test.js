import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { toDisposable } from "../../../../../base/common/lifecycle.js";
import { DefaultSettings } from "../../common/preferencesModels.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { Extensions } from "../../../../../platform/configuration/common/configurationRegistry.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { ConfigurationTarget } from "../../../../../platform/configuration/common/configuration.js";
suite("DefaultSettings", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let configurationRegistry;
  let configurationService;
  setup(() => {
    configurationRegistry = Registry.as(Extensions.Configuration);
    configurationService = new TestConfigurationService();
  });
  test("groups settings by title when they share the same extension id", () => {
    const extensionId = "test.extension";
    const config1 = {
      id: "config1",
      title: "Group 1",
      type: "object",
      properties: {
        "test.setting1": {
          type: "string",
          default: "value1",
          description: "Setting 1"
        }
      },
      extensionInfo: { id: extensionId }
    };
    const config2 = {
      id: "config2",
      title: "Group 2",
      type: "object",
      properties: {
        "test.setting2": {
          type: "string",
          default: "value2",
          description: "Setting 2"
        }
      },
      extensionInfo: { id: extensionId }
    };
    configurationRegistry.registerConfiguration(config1);
    configurationRegistry.registerConfiguration(config2);
    disposables.add(toDisposable(() => configurationRegistry.deregisterConfigurations([config1, config2])));
    const defaultSettings = disposables.add(new DefaultSettings([], ConfigurationTarget.USER, configurationService));
    const groups = defaultSettings.getRegisteredGroups();
    const extensionGroups = groups.filter((g) => g.extensionInfo?.id === extensionId);
    assert.strictEqual(extensionGroups.length, 2, "Should have 2 groups");
    assert.strictEqual(extensionGroups[0].title, "Group 1");
    assert.strictEqual(extensionGroups[1].title, "Group 2");
    assert.strictEqual(extensionGroups[0].sections[0].settings.length, 1);
    assert.strictEqual(extensionGroups[0].sections[0].settings[0].key, "test.setting1");
    assert.strictEqual(extensionGroups[1].sections[0].settings.length, 1);
    assert.strictEqual(extensionGroups[1].sections[0].settings[0].key, "test.setting2");
  });
  test("groups settings by id when they share the same extension id and have no title", () => {
    const extensionId = "test.extension";
    const config1 = {
      id: "group1",
      type: "object",
      properties: {
        "test.setting1": {
          type: "string",
          default: "value1",
          description: "Setting 1"
        }
      },
      extensionInfo: { id: extensionId }
    };
    const config2 = {
      id: "group1",
      type: "object",
      properties: {
        "test.setting2": {
          type: "string",
          default: "value2",
          description: "Setting 2"
        }
      },
      extensionInfo: { id: extensionId }
    };
    configurationRegistry.registerConfiguration(config1);
    configurationRegistry.registerConfiguration(config2);
    disposables.add(toDisposable(() => configurationRegistry.deregisterConfigurations([config1, config2])));
    const defaultSettings = disposables.add(new DefaultSettings([], ConfigurationTarget.USER, configurationService));
    const groups = defaultSettings.getRegisteredGroups();
    const extensionGroups = groups.filter((g) => g.extensionInfo?.id === extensionId);
    assert.strictEqual(extensionGroups.length, 1, "Should have 1 group");
    assert.strictEqual(extensionGroups[0].id, "group1");
    assert.strictEqual(extensionGroups[0].sections[0].settings.length, 2);
  });
  test("separates groups with same id but different titles", () => {
    const extensionId = "test.extension";
    const config1 = {
      id: "group1",
      title: "Title 1",
      type: "object",
      properties: {
        "test.setting1": {
          type: "string",
          default: "value1",
          description: "Setting 1"
        }
      },
      extensionInfo: { id: extensionId }
    };
    const config2 = {
      id: "group1",
      title: "Title 2",
      type: "object",
      properties: {
        "test.setting2": {
          type: "string",
          default: "value2",
          description: "Setting 2"
        }
      },
      extensionInfo: { id: extensionId }
    };
    configurationRegistry.registerConfiguration(config1);
    configurationRegistry.registerConfiguration(config2);
    disposables.add(toDisposable(() => configurationRegistry.deregisterConfigurations([config1, config2])));
    const defaultSettings = disposables.add(new DefaultSettings([], ConfigurationTarget.USER, configurationService));
    const groups = defaultSettings.getRegisteredGroups();
    const extensionGroups = groups.filter((g) => g.extensionInfo?.id === extensionId);
    assert.strictEqual(extensionGroups.length, 2, "Should have 2 groups");
    assert.strictEqual(extensionGroups[0].title, "Title 1");
    assert.strictEqual(extensionGroups[1].title, "Title 2");
  });
  test("merges untitled group into titled group if id matches", () => {
    const extensionId = "test.extension";
    const config1 = {
      id: "group1",
      type: "object",
      properties: {
        "test.setting1": {
          type: "string",
          default: "value1",
          description: "Setting 1"
        }
      },
      extensionInfo: { id: extensionId }
    };
    const config2 = {
      id: "group1",
      title: "Title 1",
      type: "object",
      properties: {
        "test.setting2": {
          type: "string",
          default: "value2",
          description: "Setting 2"
        }
      },
      extensionInfo: { id: extensionId }
    };
    configurationRegistry.registerConfiguration(config1);
    configurationRegistry.registerConfiguration(config2);
    disposables.add(toDisposable(() => configurationRegistry.deregisterConfigurations([config1, config2])));
    const defaultSettings = disposables.add(new DefaultSettings([], ConfigurationTarget.USER, configurationService));
    const groups = defaultSettings.getRegisteredGroups();
    const extensionGroups = groups.filter((g) => g.extensionInfo?.id === extensionId);
    assert.strictEqual(extensionGroups.length, 1, "Should have 1 group");
    assert.strictEqual(extensionGroups[0].title, "Title 1");
    assert.strictEqual(extensionGroups[0].sections[0].settings.length, 2);
  });
  test("separates groups with same id and title but different extension ids", () => {
    const extensionId1 = "test.extension1";
    const extensionId2 = "test.extension2";
    const config1 = {
      id: "group1",
      title: "Title 1",
      type: "object",
      properties: {
        "test.setting1": {
          type: "string",
          default: "value1",
          description: "Setting 1"
        }
      },
      extensionInfo: { id: extensionId1 }
    };
    const config2 = {
      id: "group1",
      title: "Title 1",
      type: "object",
      properties: {
        "test.setting2": {
          type: "string",
          default: "value2",
          description: "Setting 2"
        }
      },
      extensionInfo: { id: extensionId2 }
    };
    configurationRegistry.registerConfiguration(config1);
    configurationRegistry.registerConfiguration(config2);
    disposables.add(toDisposable(() => configurationRegistry.deregisterConfigurations([config1, config2])));
    const defaultSettings = disposables.add(new DefaultSettings([], ConfigurationTarget.USER, configurationService));
    const groups = defaultSettings.getRegisteredGroups();
    const group1 = groups.find((g) => g.extensionInfo?.id === extensionId1);
    const group2 = groups.find((g) => g.extensionInfo?.id === extensionId2);
    assert.ok(group1);
    assert.ok(group2);
    assert.notStrictEqual(group1, group2);
    assert.strictEqual(group1.title, "Title 1");
    assert.strictEqual(group2.title, "Title 1");
  });
  test("separates groups with same id (no title) but different extension ids", () => {
    const extensionId1 = "test.extension1";
    const extensionId2 = "test.extension2";
    const config1 = {
      id: "group1",
      type: "object",
      properties: {
        "test.setting1": {
          type: "string",
          default: "value1",
          description: "Setting 1"
        }
      },
      extensionInfo: { id: extensionId1 }
    };
    const config2 = {
      id: "group1",
      type: "object",
      properties: {
        "test.setting2": {
          type: "string",
          default: "value2",
          description: "Setting 2"
        }
      },
      extensionInfo: { id: extensionId2 }
    };
    configurationRegistry.registerConfiguration(config1);
    configurationRegistry.registerConfiguration(config2);
    disposables.add(toDisposable(() => configurationRegistry.deregisterConfigurations([config1, config2])));
    const defaultSettings = disposables.add(new DefaultSettings([], ConfigurationTarget.USER, configurationService));
    const groups = defaultSettings.getRegisteredGroups();
    const group1 = groups.find((g) => g.extensionInfo?.id === extensionId1);
    const group2 = groups.find((g) => g.extensionInfo?.id === extensionId2);
    assert.ok(group1);
    assert.ok(group2);
    assert.notStrictEqual(group1, group2);
  });
  test("groups settings correctly when extension id is same as group id", () => {
    const extensionId = "test.extension";
    const config1 = {
      id: extensionId,
      title: "Group 1",
      type: "object",
      properties: {
        "test.setting1": {
          type: "string",
          default: "value1",
          description: "Setting 1"
        }
      },
      extensionInfo: { id: extensionId }
    };
    const config2 = {
      id: extensionId,
      title: "Group 2",
      type: "object",
      properties: {
        "test.setting2": {
          type: "string",
          default: "value2",
          description: "Setting 2"
        }
      },
      extensionInfo: { id: extensionId }
    };
    configurationRegistry.registerConfiguration(config1);
    configurationRegistry.registerConfiguration(config2);
    disposables.add(toDisposable(() => configurationRegistry.deregisterConfigurations([config1, config2])));
    const defaultSettings = disposables.add(new DefaultSettings([], ConfigurationTarget.USER, configurationService));
    const groups = defaultSettings.getRegisteredGroups();
    const extensionGroups = groups.filter((g) => g.extensionInfo?.id === extensionId);
    assert.strictEqual(extensionGroups.length, 2, "Should have 2 groups");
    assert.strictEqual(extensionGroups[0].title, "Group 1");
    assert.strictEqual(extensionGroups[1].title, "Group 2");
  });
  test("sorts groups by order", () => {
    const extensionId = "test.extension";
    const config1 = {
      id: "group1",
      title: "Group 1",
      order: 2,
      type: "object",
      properties: {
        "test.setting1": {
          type: "string",
          default: "value1",
          description: "Setting 1"
        }
      },
      extensionInfo: { id: extensionId }
    };
    const config2 = {
      id: "group2",
      title: "Group 2",
      order: 1,
      type: "object",
      properties: {
        "test.setting2": {
          type: "string",
          default: "value2",
          description: "Setting 2"
        }
      },
      extensionInfo: { id: extensionId }
    };
    configurationRegistry.registerConfiguration(config1);
    configurationRegistry.registerConfiguration(config2);
    disposables.add(toDisposable(() => configurationRegistry.deregisterConfigurations([config1, config2])));
    const defaultSettings = disposables.add(new DefaultSettings([], ConfigurationTarget.USER, configurationService));
    const groups = defaultSettings.getRegisteredGroups();
    const extensionGroups = groups.filter((g) => g.extensionInfo?.id === extensionId);
    assert.strictEqual(extensionGroups.length, 2);
    assert.strictEqual(extensionGroups[0].title, "Group 2");
    assert.strictEqual(extensionGroups[1].title, "Group 1");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxwcmVmZXJlbmNlc1xcdGVzdFxcY29tbW9uXFxwcmVmZXJlbmNlc01vZGVscy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRGVmYXVsdFNldHRpbmdzIH0gZnJvbSAnLi4vLi4vY29tbW9uL3ByZWZlcmVuY2VzTW9kZWxzLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uUmVnaXN0cnksIElDb25maWd1cmF0aW9uTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5cbnN1aXRlKCdEZWZhdWx0U2V0dGluZ3MnLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGxldCBjb25maWd1cmF0aW9uUmVnaXN0cnk6IElDb25maWd1cmF0aW9uUmVnaXN0cnk7XG5cdGxldCBjb25maWd1cmF0aW9uU2VydmljZTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdncm91cHMgc2V0dGluZ3MgYnkgdGl0bGUgd2hlbiB0aGV5IHNoYXJlIHRoZSBzYW1lIGV4dGVuc2lvbiBpZCcsICgpID0+IHtcblx0XHRjb25zdCBleHRlbnNpb25JZCA9ICd0ZXN0LmV4dGVuc2lvbic7XG5cdFx0Y29uc3QgY29uZmlnMTogSUNvbmZpZ3VyYXRpb25Ob2RlID0ge1xuXHRcdFx0aWQ6ICdjb25maWcxJyxcblx0XHRcdHRpdGxlOiAnR3JvdXAgMScsXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0J3Rlc3Quc2V0dGluZzEnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVmYXVsdDogJ3ZhbHVlMScsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdTZXR0aW5nIDEnXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRleHRlbnNpb25JbmZvOiB7IGlkOiBleHRlbnNpb25JZCB9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGNvbmZpZzI6IElDb25maWd1cmF0aW9uTm9kZSA9IHtcblx0XHRcdGlkOiAnY29uZmlnMicsXG5cdFx0XHR0aXRsZTogJ0dyb3VwIDInLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdCd0ZXN0LnNldHRpbmcyJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlZmF1bHQ6ICd2YWx1ZTInLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnU2V0dGluZyAyJ1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0ZXh0ZW5zaW9uSW5mbzogeyBpZDogZXh0ZW5zaW9uSWQgfVxuXHRcdH07XG5cblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKGNvbmZpZzEpO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oY29uZmlnMik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjb25maWd1cmF0aW9uUmVnaXN0cnkuZGVyZWdpc3RlckNvbmZpZ3VyYXRpb25zKFtjb25maWcxLCBjb25maWcyXSkpKTtcblxuXHRcdGNvbnN0IGRlZmF1bHRTZXR0aW5ncyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdFNldHRpbmdzKFtdLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdFx0Y29uc3QgZ3JvdXBzID0gZGVmYXVsdFNldHRpbmdzLmdldFJlZ2lzdGVyZWRHcm91cHMoKTtcblxuXHRcdGNvbnN0IGV4dGVuc2lvbkdyb3VwcyA9IGdyb3Vwcy5maWx0ZXIoZyA9PiBnLmV4dGVuc2lvbkluZm8/LmlkID09PSBleHRlbnNpb25JZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0ZW5zaW9uR3JvdXBzLmxlbmd0aCwgMiwgJ1Nob3VsZCBoYXZlIDIgZ3JvdXBzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dGVuc2lvbkdyb3Vwc1swXS50aXRsZSwgJ0dyb3VwIDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0ZW5zaW9uR3JvdXBzWzFdLnRpdGxlLCAnR3JvdXAgMicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dGVuc2lvbkdyb3Vwc1swXS5zZWN0aW9uc1swXS5zZXR0aW5ncy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRlbnNpb25Hcm91cHNbMF0uc2VjdGlvbnNbMF0uc2V0dGluZ3NbMF0ua2V5LCAndGVzdC5zZXR0aW5nMScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dGVuc2lvbkdyb3Vwc1sxXS5zZWN0aW9uc1swXS5zZXR0aW5ncy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRlbnNpb25Hcm91cHNbMV0uc2VjdGlvbnNbMF0uc2V0dGluZ3NbMF0ua2V5LCAndGVzdC5zZXR0aW5nMicpO1xuXHR9KTtcblxuXHR0ZXN0KCdncm91cHMgc2V0dGluZ3MgYnkgaWQgd2hlbiB0aGV5IHNoYXJlIHRoZSBzYW1lIGV4dGVuc2lvbiBpZCBhbmQgaGF2ZSBubyB0aXRsZScsICgpID0+IHtcblx0XHRjb25zdCBleHRlbnNpb25JZCA9ICd0ZXN0LmV4dGVuc2lvbic7XG5cdFx0Y29uc3QgY29uZmlnMTogSUNvbmZpZ3VyYXRpb25Ob2RlID0ge1xuXHRcdFx0aWQ6ICdncm91cDEnLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdCd0ZXN0LnNldHRpbmcxJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlZmF1bHQ6ICd2YWx1ZTEnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnU2V0dGluZyAxJ1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0ZXh0ZW5zaW9uSW5mbzogeyBpZDogZXh0ZW5zaW9uSWQgfVxuXHRcdH07XG5cblx0XHRjb25zdCBjb25maWcyOiBJQ29uZmlndXJhdGlvbk5vZGUgPSB7XG5cdFx0XHRpZDogJ2dyb3VwMScsXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0J3Rlc3Quc2V0dGluZzInOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVmYXVsdDogJ3ZhbHVlMicsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdTZXR0aW5nIDInXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRleHRlbnNpb25JbmZvOiB7IGlkOiBleHRlbnNpb25JZCB9XG5cdFx0fTtcblxuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oY29uZmlnMSk7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbihjb25maWcyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5kZXJlZ2lzdGVyQ29uZmlndXJhdGlvbnMoW2NvbmZpZzEsIGNvbmZpZzJdKSkpO1xuXG5cdFx0Y29uc3QgZGVmYXVsdFNldHRpbmdzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWZhdWx0U2V0dGluZ3MoW10sIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUiwgY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0XHRjb25zdCBncm91cHMgPSBkZWZhdWx0U2V0dGluZ3MuZ2V0UmVnaXN0ZXJlZEdyb3VwcygpO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uR3JvdXBzID0gZ3JvdXBzLmZpbHRlcihnID0+IGcuZXh0ZW5zaW9uSW5mbz8uaWQgPT09IGV4dGVuc2lvbklkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRlbnNpb25Hcm91cHMubGVuZ3RoLCAxLCAnU2hvdWxkIGhhdmUgMSBncm91cCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRlbnNpb25Hcm91cHNbMF0uaWQsICdncm91cDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0ZW5zaW9uR3JvdXBzWzBdLnNlY3Rpb25zWzBdLnNldHRpbmdzLmxlbmd0aCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlcGFyYXRlcyBncm91cHMgd2l0aCBzYW1lIGlkIGJ1dCBkaWZmZXJlbnQgdGl0bGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbklkID0gJ3Rlc3QuZXh0ZW5zaW9uJztcblx0XHRjb25zdCBjb25maWcxOiBJQ29uZmlndXJhdGlvbk5vZGUgPSB7XG5cdFx0XHRpZDogJ2dyb3VwMScsXG5cdFx0XHR0aXRsZTogJ1RpdGxlIDEnLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdCd0ZXN0LnNldHRpbmcxJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlZmF1bHQ6ICd2YWx1ZTEnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnU2V0dGluZyAxJ1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0ZXh0ZW5zaW9uSW5mbzogeyBpZDogZXh0ZW5zaW9uSWQgfVxuXHRcdH07XG5cblx0XHRjb25zdCBjb25maWcyOiBJQ29uZmlndXJhdGlvbk5vZGUgPSB7XG5cdFx0XHRpZDogJ2dyb3VwMScsXG5cdFx0XHR0aXRsZTogJ1RpdGxlIDInLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdCd0ZXN0LnNldHRpbmcyJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlZmF1bHQ6ICd2YWx1ZTInLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnU2V0dGluZyAyJ1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0ZXh0ZW5zaW9uSW5mbzogeyBpZDogZXh0ZW5zaW9uSWQgfVxuXHRcdH07XG5cblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKGNvbmZpZzEpO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oY29uZmlnMik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjb25maWd1cmF0aW9uUmVnaXN0cnkuZGVyZWdpc3RlckNvbmZpZ3VyYXRpb25zKFtjb25maWcxLCBjb25maWcyXSkpKTtcblxuXHRcdGNvbnN0IGRlZmF1bHRTZXR0aW5ncyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdFNldHRpbmdzKFtdLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdFx0Y29uc3QgZ3JvdXBzID0gZGVmYXVsdFNldHRpbmdzLmdldFJlZ2lzdGVyZWRHcm91cHMoKTtcblxuXHRcdGNvbnN0IGV4dGVuc2lvbkdyb3VwcyA9IGdyb3Vwcy5maWx0ZXIoZyA9PiBnLmV4dGVuc2lvbkluZm8/LmlkID09PSBleHRlbnNpb25JZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0ZW5zaW9uR3JvdXBzLmxlbmd0aCwgMiwgJ1Nob3VsZCBoYXZlIDIgZ3JvdXBzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dGVuc2lvbkdyb3Vwc1swXS50aXRsZSwgJ1RpdGxlIDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0ZW5zaW9uR3JvdXBzWzFdLnRpdGxlLCAnVGl0bGUgMicpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZXMgdW50aXRsZWQgZ3JvdXAgaW50byB0aXRsZWQgZ3JvdXAgaWYgaWQgbWF0Y2hlcycsICgpID0+IHtcblx0XHRjb25zdCBleHRlbnNpb25JZCA9ICd0ZXN0LmV4dGVuc2lvbic7XG5cdFx0Y29uc3QgY29uZmlnMTogSUNvbmZpZ3VyYXRpb25Ob2RlID0ge1xuXHRcdFx0aWQ6ICdncm91cDEnLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdCd0ZXN0LnNldHRpbmcxJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlZmF1bHQ6ICd2YWx1ZTEnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnU2V0dGluZyAxJ1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0ZXh0ZW5zaW9uSW5mbzogeyBpZDogZXh0ZW5zaW9uSWQgfVxuXHRcdH07XG5cblx0XHRjb25zdCBjb25maWcyOiBJQ29uZmlndXJhdGlvbk5vZGUgPSB7XG5cdFx0XHRpZDogJ2dyb3VwMScsXG5cdFx0XHR0aXRsZTogJ1RpdGxlIDEnLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdCd0ZXN0LnNldHRpbmcyJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlZmF1bHQ6ICd2YWx1ZTInLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnU2V0dGluZyAyJ1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0ZXh0ZW5zaW9uSW5mbzogeyBpZDogZXh0ZW5zaW9uSWQgfVxuXHRcdH07XG5cblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKGNvbmZpZzEpO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oY29uZmlnMik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjb25maWd1cmF0aW9uUmVnaXN0cnkuZGVyZWdpc3RlckNvbmZpZ3VyYXRpb25zKFtjb25maWcxLCBjb25maWcyXSkpKTtcblxuXHRcdGNvbnN0IGRlZmF1bHRTZXR0aW5ncyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdFNldHRpbmdzKFtdLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdFx0Y29uc3QgZ3JvdXBzID0gZGVmYXVsdFNldHRpbmdzLmdldFJlZ2lzdGVyZWRHcm91cHMoKTtcblxuXHRcdGNvbnN0IGV4dGVuc2lvbkdyb3VwcyA9IGdyb3Vwcy5maWx0ZXIoZyA9PiBnLmV4dGVuc2lvbkluZm8/LmlkID09PSBleHRlbnNpb25JZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0ZW5zaW9uR3JvdXBzLmxlbmd0aCwgMSwgJ1Nob3VsZCBoYXZlIDEgZ3JvdXAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0ZW5zaW9uR3JvdXBzWzBdLnRpdGxlLCAnVGl0bGUgMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRlbnNpb25Hcm91cHNbMF0uc2VjdGlvbnNbMF0uc2V0dGluZ3MubGVuZ3RoLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnc2VwYXJhdGVzIGdyb3VwcyB3aXRoIHNhbWUgaWQgYW5kIHRpdGxlIGJ1dCBkaWZmZXJlbnQgZXh0ZW5zaW9uIGlkcycsICgpID0+IHtcblx0XHRjb25zdCBleHRlbnNpb25JZDEgPSAndGVzdC5leHRlbnNpb24xJztcblx0XHRjb25zdCBleHRlbnNpb25JZDIgPSAndGVzdC5leHRlbnNpb24yJztcblx0XHRjb25zdCBjb25maWcxOiBJQ29uZmlndXJhdGlvbk5vZGUgPSB7XG5cdFx0XHRpZDogJ2dyb3VwMScsXG5cdFx0XHR0aXRsZTogJ1RpdGxlIDEnLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdCd0ZXN0LnNldHRpbmcxJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlZmF1bHQ6ICd2YWx1ZTEnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnU2V0dGluZyAxJ1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0ZXh0ZW5zaW9uSW5mbzogeyBpZDogZXh0ZW5zaW9uSWQxIH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgY29uZmlnMjogSUNvbmZpZ3VyYXRpb25Ob2RlID0ge1xuXHRcdFx0aWQ6ICdncm91cDEnLFxuXHRcdFx0dGl0bGU6ICdUaXRsZSAxJyxcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHQndGVzdC5zZXR0aW5nMic6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZWZhdWx0OiAndmFsdWUyJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1NldHRpbmcgMidcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGV4dGVuc2lvbkluZm86IHsgaWQ6IGV4dGVuc2lvbklkMiB9XG5cdFx0fTtcblxuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oY29uZmlnMSk7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbihjb25maWcyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5kZXJlZ2lzdGVyQ29uZmlndXJhdGlvbnMoW2NvbmZpZzEsIGNvbmZpZzJdKSkpO1xuXG5cdFx0Y29uc3QgZGVmYXVsdFNldHRpbmdzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWZhdWx0U2V0dGluZ3MoW10sIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUiwgY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0XHRjb25zdCBncm91cHMgPSBkZWZhdWx0U2V0dGluZ3MuZ2V0UmVnaXN0ZXJlZEdyb3VwcygpO1xuXG5cdFx0Y29uc3QgZ3JvdXAxID0gZ3JvdXBzLmZpbmQoZyA9PiBnLmV4dGVuc2lvbkluZm8/LmlkID09PSBleHRlbnNpb25JZDEpO1xuXHRcdGNvbnN0IGdyb3VwMiA9IGdyb3Vwcy5maW5kKGcgPT4gZy5leHRlbnNpb25JbmZvPy5pZCA9PT0gZXh0ZW5zaW9uSWQyKTtcblxuXHRcdGFzc2VydC5vayhncm91cDEpO1xuXHRcdGFzc2VydC5vayhncm91cDIpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChncm91cDEsIGdyb3VwMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMS50aXRsZSwgJ1RpdGxlIDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAyLnRpdGxlLCAnVGl0bGUgMScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXBhcmF0ZXMgZ3JvdXBzIHdpdGggc2FtZSBpZCAobm8gdGl0bGUpIGJ1dCBkaWZmZXJlbnQgZXh0ZW5zaW9uIGlkcycsICgpID0+IHtcblx0XHRjb25zdCBleHRlbnNpb25JZDEgPSAndGVzdC5leHRlbnNpb24xJztcblx0XHRjb25zdCBleHRlbnNpb25JZDIgPSAndGVzdC5leHRlbnNpb24yJztcblx0XHRjb25zdCBjb25maWcxOiBJQ29uZmlndXJhdGlvbk5vZGUgPSB7XG5cdFx0XHRpZDogJ2dyb3VwMScsXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0J3Rlc3Quc2V0dGluZzEnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVmYXVsdDogJ3ZhbHVlMScsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdTZXR0aW5nIDEnXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRleHRlbnNpb25JbmZvOiB7IGlkOiBleHRlbnNpb25JZDEgfVxuXHRcdH07XG5cblx0XHRjb25zdCBjb25maWcyOiBJQ29uZmlndXJhdGlvbk5vZGUgPSB7XG5cdFx0XHRpZDogJ2dyb3VwMScsXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0J3Rlc3Quc2V0dGluZzInOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVmYXVsdDogJ3ZhbHVlMicsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdTZXR0aW5nIDInXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRleHRlbnNpb25JbmZvOiB7IGlkOiBleHRlbnNpb25JZDIgfVxuXHRcdH07XG5cblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKGNvbmZpZzEpO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oY29uZmlnMik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjb25maWd1cmF0aW9uUmVnaXN0cnkuZGVyZWdpc3RlckNvbmZpZ3VyYXRpb25zKFtjb25maWcxLCBjb25maWcyXSkpKTtcblxuXHRcdGNvbnN0IGRlZmF1bHRTZXR0aW5ncyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdFNldHRpbmdzKFtdLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdFx0Y29uc3QgZ3JvdXBzID0gZGVmYXVsdFNldHRpbmdzLmdldFJlZ2lzdGVyZWRHcm91cHMoKTtcblxuXHRcdGNvbnN0IGdyb3VwMSA9IGdyb3Vwcy5maW5kKGcgPT4gZy5leHRlbnNpb25JbmZvPy5pZCA9PT0gZXh0ZW5zaW9uSWQxKTtcblx0XHRjb25zdCBncm91cDIgPSBncm91cHMuZmluZChnID0+IGcuZXh0ZW5zaW9uSW5mbz8uaWQgPT09IGV4dGVuc2lvbklkMik7XG5cblx0XHRhc3NlcnQub2soZ3JvdXAxKTtcblx0XHRhc3NlcnQub2soZ3JvdXAyKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoZ3JvdXAxLCBncm91cDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdncm91cHMgc2V0dGluZ3MgY29ycmVjdGx5IHdoZW4gZXh0ZW5zaW9uIGlkIGlzIHNhbWUgYXMgZ3JvdXAgaWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSAndGVzdC5leHRlbnNpb24nO1xuXHRcdGNvbnN0IGNvbmZpZzE6IElDb25maWd1cmF0aW9uTm9kZSA9IHtcblx0XHRcdGlkOiBleHRlbnNpb25JZCxcblx0XHRcdHRpdGxlOiAnR3JvdXAgMScsXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0J3Rlc3Quc2V0dGluZzEnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVmYXVsdDogJ3ZhbHVlMScsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdTZXR0aW5nIDEnXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRleHRlbnNpb25JbmZvOiB7IGlkOiBleHRlbnNpb25JZCB9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGNvbmZpZzI6IElDb25maWd1cmF0aW9uTm9kZSA9IHtcblx0XHRcdGlkOiBleHRlbnNpb25JZCxcblx0XHRcdHRpdGxlOiAnR3JvdXAgMicsXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0J3Rlc3Quc2V0dGluZzInOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVmYXVsdDogJ3ZhbHVlMicsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdTZXR0aW5nIDInXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRleHRlbnNpb25JbmZvOiB7IGlkOiBleHRlbnNpb25JZCB9XG5cdFx0fTtcblxuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oY29uZmlnMSk7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbihjb25maWcyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5kZXJlZ2lzdGVyQ29uZmlndXJhdGlvbnMoW2NvbmZpZzEsIGNvbmZpZzJdKSkpO1xuXG5cdFx0Y29uc3QgZGVmYXVsdFNldHRpbmdzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWZhdWx0U2V0dGluZ3MoW10sIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUiwgY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0XHRjb25zdCBncm91cHMgPSBkZWZhdWx0U2V0dGluZ3MuZ2V0UmVnaXN0ZXJlZEdyb3VwcygpO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uR3JvdXBzID0gZ3JvdXBzLmZpbHRlcihnID0+IGcuZXh0ZW5zaW9uSW5mbz8uaWQgPT09IGV4dGVuc2lvbklkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRlbnNpb25Hcm91cHMubGVuZ3RoLCAyLCAnU2hvdWxkIGhhdmUgMiBncm91cHMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0ZW5zaW9uR3JvdXBzWzBdLnRpdGxlLCAnR3JvdXAgMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRlbnNpb25Hcm91cHNbMV0udGl0bGUsICdHcm91cCAyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NvcnRzIGdyb3VwcyBieSBvcmRlcicsICgpID0+IHtcblx0XHRjb25zdCBleHRlbnNpb25JZCA9ICd0ZXN0LmV4dGVuc2lvbic7XG5cdFx0Y29uc3QgY29uZmlnMTogSUNvbmZpZ3VyYXRpb25Ob2RlID0ge1xuXHRcdFx0aWQ6ICdncm91cDEnLFxuXHRcdFx0dGl0bGU6ICdHcm91cCAxJyxcblx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdCd0ZXN0LnNldHRpbmcxJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlZmF1bHQ6ICd2YWx1ZTEnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnU2V0dGluZyAxJ1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0ZXh0ZW5zaW9uSW5mbzogeyBpZDogZXh0ZW5zaW9uSWQgfVxuXHRcdH07XG5cblx0XHRjb25zdCBjb25maWcyOiBJQ29uZmlndXJhdGlvbk5vZGUgPSB7XG5cdFx0XHRpZDogJ2dyb3VwMicsXG5cdFx0XHR0aXRsZTogJ0dyb3VwIDInLFxuXHRcdFx0b3JkZXI6IDEsXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0J3Rlc3Quc2V0dGluZzInOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVmYXVsdDogJ3ZhbHVlMicsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdTZXR0aW5nIDInXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRleHRlbnNpb25JbmZvOiB7IGlkOiBleHRlbnNpb25JZCB9XG5cdFx0fTtcblxuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oY29uZmlnMSk7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbihjb25maWcyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5kZXJlZ2lzdGVyQ29uZmlndXJhdGlvbnMoW2NvbmZpZzEsIGNvbmZpZzJdKSkpO1xuXG5cdFx0Y29uc3QgZGVmYXVsdFNldHRpbmdzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWZhdWx0U2V0dGluZ3MoW10sIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUiwgY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0XHRjb25zdCBncm91cHMgPSBkZWZhdWx0U2V0dGluZ3MuZ2V0UmVnaXN0ZXJlZEdyb3VwcygpO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uR3JvdXBzID0gZ3JvdXBzLmZpbHRlcihnID0+IGcuZXh0ZW5zaW9uSW5mbz8uaWQgPT09IGV4dGVuc2lvbklkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRlbnNpb25Hcm91cHMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0ZW5zaW9uR3JvdXBzWzBdLnRpdGxlLCAnR3JvdXAgMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRlbnNpb25Hcm91cHNbMV0udGl0bGUsICdHcm91cCAxJyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxrQkFBOEQ7QUFDdkUsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywyQkFBMkI7QUFFcEMsTUFBTSxtQkFBbUIsTUFBTTtBQUM5QixRQUFNLGNBQWMsd0NBQXdDO0FBQzVELE1BQUk7QUFDSixNQUFJO0FBRUosUUFBTSxNQUFNO0FBQ1gsNEJBQXdCLFNBQVMsR0FBMkIsV0FBVyxhQUFhO0FBQ3BGLDJCQUF1QixJQUFJLHlCQUF5QjtBQUFBLEVBQ3JELENBQUM7QUFFRCxPQUFLLGtFQUFrRSxNQUFNO0FBQzVFLFVBQU0sY0FBYztBQUNwQixVQUFNLFVBQThCO0FBQUEsTUFDbkMsSUFBSTtBQUFBLE1BQ0osT0FBTztBQUFBLE1BQ1AsTUFBTTtBQUFBLE1BQ04sWUFBWTtBQUFBLFFBQ1gsaUJBQWlCO0FBQUEsVUFDaEIsTUFBTTtBQUFBLFVBQ04sU0FBUztBQUFBLFVBQ1QsYUFBYTtBQUFBLFFBQ2Q7QUFBQSxNQUNEO0FBQUEsTUFDQSxlQUFlLEVBQUUsSUFBSSxZQUFZO0FBQUEsSUFDbEM7QUFFQSxVQUFNLFVBQThCO0FBQUEsTUFDbkMsSUFBSTtBQUFBLE1BQ0osT0FBTztBQUFBLE1BQ1AsTUFBTTtBQUFBLE1BQ04sWUFBWTtBQUFBLFFBQ1gsaUJBQWlCO0FBQUEsVUFDaEIsTUFBTTtBQUFBLFVBQ04sU0FBUztBQUFBLFVBQ1QsYUFBYTtBQUFBLFFBQ2Q7QUFBQSxNQUNEO0FBQUEsTUFDQSxlQUFlLEVBQUUsSUFBSSxZQUFZO0FBQUEsSUFDbEM7QUFFQSwwQkFBc0Isc0JBQXNCLE9BQU87QUFDbkQsMEJBQXNCLHNCQUFzQixPQUFPO0FBQ25ELGdCQUFZLElBQUksYUFBYSxNQUFNLHNCQUFzQix5QkFBeUIsQ0FBQyxTQUFTLE9BQU8sQ0FBQyxDQUFDLENBQUM7QUFFdEcsVUFBTSxrQkFBa0IsWUFBWSxJQUFJLElBQUksZ0JBQWdCLENBQUMsR0FBRyxvQkFBb0IsTUFBTSxvQkFBb0IsQ0FBQztBQUMvRyxVQUFNLFNBQVMsZ0JBQWdCLG9CQUFvQjtBQUVuRCxVQUFNLGtCQUFrQixPQUFPLE9BQU8sT0FBSyxFQUFFLGVBQWUsT0FBTyxXQUFXO0FBRTlFLFdBQU8sWUFBWSxnQkFBZ0IsUUFBUSxHQUFHLHNCQUFzQjtBQUNwRSxXQUFPLFlBQVksZ0JBQWdCLENBQUMsRUFBRSxPQUFPLFNBQVM7QUFDdEQsV0FBTyxZQUFZLGdCQUFnQixDQUFDLEVBQUUsT0FBTyxTQUFTO0FBRXRELFdBQU8sWUFBWSxnQkFBZ0IsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxFQUFFLFNBQVMsUUFBUSxDQUFDO0FBQ3BFLFdBQU8sWUFBWSxnQkFBZ0IsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxFQUFFLEtBQUssZUFBZTtBQUVsRixXQUFPLFlBQVksZ0JBQWdCLENBQUMsRUFBRSxTQUFTLENBQUMsRUFBRSxTQUFTLFFBQVEsQ0FBQztBQUNwRSxXQUFPLFlBQVksZ0JBQWdCLENBQUMsRUFBRSxTQUFTLENBQUMsRUFBRSxTQUFTLENBQUMsRUFBRSxLQUFLLGVBQWU7QUFBQSxFQUNuRixDQUFDO0FBRUQsT0FBSyxpRkFBaUYsTUFBTTtBQUMzRixVQUFNLGNBQWM7QUFDcEIsVUFBTSxVQUE4QjtBQUFBLE1BQ25DLElBQUk7QUFBQSxNQUNKLE1BQU07QUFBQSxNQUNOLFlBQVk7QUFBQSxRQUNYLGlCQUFpQjtBQUFBLFVBQ2hCLE1BQU07QUFBQSxVQUNOLFNBQVM7QUFBQSxVQUNULGFBQWE7QUFBQSxRQUNkO0FBQUEsTUFDRDtBQUFBLE1BQ0EsZUFBZSxFQUFFLElBQUksWUFBWTtBQUFBLElBQ2xDO0FBRUEsVUFBTSxVQUE4QjtBQUFBLE1BQ25DLElBQUk7QUFBQSxNQUNKLE1BQU07QUFBQSxNQUNOLFlBQVk7QUFBQSxRQUNYLGlCQUFpQjtBQUFBLFVBQ2hCLE1BQU07QUFBQSxVQUNOLFNBQVM7QUFBQSxVQUNULGFBQWE7QUFBQSxRQUNkO0FBQUEsTUFDRDtBQUFBLE1BQ0EsZUFBZSxFQUFFLElBQUksWUFBWTtBQUFBLElBQ2xDO0FBRUEsMEJBQXNCLHNCQUFzQixPQUFPO0FBQ25ELDBCQUFzQixzQkFBc0IsT0FBTztBQUNuRCxnQkFBWSxJQUFJLGFBQWEsTUFBTSxzQkFBc0IseUJBQXlCLENBQUMsU0FBUyxPQUFPLENBQUMsQ0FBQyxDQUFDO0FBRXRHLFVBQU0sa0JBQWtCLFlBQVksSUFBSSxJQUFJLGdCQUFnQixDQUFDLEdBQUcsb0JBQW9CLE1BQU0sb0JBQW9CLENBQUM7QUFDL0csVUFBTSxTQUFTLGdCQUFnQixvQkFBb0I7QUFFbkQsVUFBTSxrQkFBa0IsT0FBTyxPQUFPLE9BQUssRUFBRSxlQUFlLE9BQU8sV0FBVztBQUU5RSxXQUFPLFlBQVksZ0JBQWdCLFFBQVEsR0FBRyxxQkFBcUI7QUFDbkUsV0FBTyxZQUFZLGdCQUFnQixDQUFDLEVBQUUsSUFBSSxRQUFRO0FBQ2xELFdBQU8sWUFBWSxnQkFBZ0IsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxFQUFFLFNBQVMsUUFBUSxDQUFDO0FBQUEsRUFDckUsQ0FBQztBQUVELE9BQUssc0RBQXNELE1BQU07QUFDaEUsVUFBTSxjQUFjO0FBQ3BCLFVBQU0sVUFBOEI7QUFBQSxNQUNuQyxJQUFJO0FBQUEsTUFDSixPQUFPO0FBQUEsTUFDUCxNQUFNO0FBQUEsTUFDTixZQUFZO0FBQUEsUUFDWCxpQkFBaUI7QUFBQSxVQUNoQixNQUFNO0FBQUEsVUFDTixTQUFTO0FBQUEsVUFDVCxhQUFhO0FBQUEsUUFDZDtBQUFBLE1BQ0Q7QUFBQSxNQUNBLGVBQWUsRUFBRSxJQUFJLFlBQVk7QUFBQSxJQUNsQztBQUVBLFVBQU0sVUFBOEI7QUFBQSxNQUNuQyxJQUFJO0FBQUEsTUFDSixPQUFPO0FBQUEsTUFDUCxNQUFNO0FBQUEsTUFDTixZQUFZO0FBQUEsUUFDWCxpQkFBaUI7QUFBQSxVQUNoQixNQUFNO0FBQUEsVUFDTixTQUFTO0FBQUEsVUFDVCxhQUFhO0FBQUEsUUFDZDtBQUFBLE1BQ0Q7QUFBQSxNQUNBLGVBQWUsRUFBRSxJQUFJLFlBQVk7QUFBQSxJQUNsQztBQUVBLDBCQUFzQixzQkFBc0IsT0FBTztBQUNuRCwwQkFBc0Isc0JBQXNCLE9BQU87QUFDbkQsZ0JBQVksSUFBSSxhQUFhLE1BQU0sc0JBQXNCLHlCQUF5QixDQUFDLFNBQVMsT0FBTyxDQUFDLENBQUMsQ0FBQztBQUV0RyxVQUFNLGtCQUFrQixZQUFZLElBQUksSUFBSSxnQkFBZ0IsQ0FBQyxHQUFHLG9CQUFvQixNQUFNLG9CQUFvQixDQUFDO0FBQy9HLFVBQU0sU0FBUyxnQkFBZ0Isb0JBQW9CO0FBRW5ELFVBQU0sa0JBQWtCLE9BQU8sT0FBTyxPQUFLLEVBQUUsZUFBZSxPQUFPLFdBQVc7QUFFOUUsV0FBTyxZQUFZLGdCQUFnQixRQUFRLEdBQUcsc0JBQXNCO0FBQ3BFLFdBQU8sWUFBWSxnQkFBZ0IsQ0FBQyxFQUFFLE9BQU8sU0FBUztBQUN0RCxXQUFPLFlBQVksZ0JBQWdCLENBQUMsRUFBRSxPQUFPLFNBQVM7QUFBQSxFQUN2RCxDQUFDO0FBRUQsT0FBSyx5REFBeUQsTUFBTTtBQUNuRSxVQUFNLGNBQWM7QUFDcEIsVUFBTSxVQUE4QjtBQUFBLE1BQ25DLElBQUk7QUFBQSxNQUNKLE1BQU07QUFBQSxNQUNOLFlBQVk7QUFBQSxRQUNYLGlCQUFpQjtBQUFBLFVBQ2hCLE1BQU07QUFBQSxVQUNOLFNBQVM7QUFBQSxVQUNULGFBQWE7QUFBQSxRQUNkO0FBQUEsTUFDRDtBQUFBLE1BQ0EsZUFBZSxFQUFFLElBQUksWUFBWTtBQUFBLElBQ2xDO0FBRUEsVUFBTSxVQUE4QjtBQUFBLE1BQ25DLElBQUk7QUFBQSxNQUNKLE9BQU87QUFBQSxNQUNQLE1BQU07QUFBQSxNQUNOLFlBQVk7QUFBQSxRQUNYLGlCQUFpQjtBQUFBLFVBQ2hCLE1BQU07QUFBQSxVQUNOLFNBQVM7QUFBQSxVQUNULGFBQWE7QUFBQSxRQUNkO0FBQUEsTUFDRDtBQUFBLE1BQ0EsZUFBZSxFQUFFLElBQUksWUFBWTtBQUFBLElBQ2xDO0FBRUEsMEJBQXNCLHNCQUFzQixPQUFPO0FBQ25ELDBCQUFzQixzQkFBc0IsT0FBTztBQUNuRCxnQkFBWSxJQUFJLGFBQWEsTUFBTSxzQkFBc0IseUJBQXlCLENBQUMsU0FBUyxPQUFPLENBQUMsQ0FBQyxDQUFDO0FBRXRHLFVBQU0sa0JBQWtCLFlBQVksSUFBSSxJQUFJLGdCQUFnQixDQUFDLEdBQUcsb0JBQW9CLE1BQU0sb0JBQW9CLENBQUM7QUFDL0csVUFBTSxTQUFTLGdCQUFnQixvQkFBb0I7QUFFbkQsVUFBTSxrQkFBa0IsT0FBTyxPQUFPLE9BQUssRUFBRSxlQUFlLE9BQU8sV0FBVztBQUU5RSxXQUFPLFlBQVksZ0JBQWdCLFFBQVEsR0FBRyxxQkFBcUI7QUFDbkUsV0FBTyxZQUFZLGdCQUFnQixDQUFDLEVBQUUsT0FBTyxTQUFTO0FBQ3RELFdBQU8sWUFBWSxnQkFBZ0IsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxFQUFFLFNBQVMsUUFBUSxDQUFDO0FBQUEsRUFDckUsQ0FBQztBQUVELE9BQUssdUVBQXVFLE1BQU07QUFDakYsVUFBTSxlQUFlO0FBQ3JCLFVBQU0sZUFBZTtBQUNyQixVQUFNLFVBQThCO0FBQUEsTUFDbkMsSUFBSTtBQUFBLE1BQ0osT0FBTztBQUFBLE1BQ1AsTUFBTTtBQUFBLE1BQ04sWUFBWTtBQUFBLFFBQ1gsaUJBQWlCO0FBQUEsVUFDaEIsTUFBTTtBQUFBLFVBQ04sU0FBUztBQUFBLFVBQ1QsYUFBYTtBQUFBLFFBQ2Q7QUFBQSxNQUNEO0FBQUEsTUFDQSxlQUFlLEVBQUUsSUFBSSxhQUFhO0FBQUEsSUFDbkM7QUFFQSxVQUFNLFVBQThCO0FBQUEsTUFDbkMsSUFBSTtBQUFBLE1BQ0osT0FBTztBQUFBLE1BQ1AsTUFBTTtBQUFBLE1BQ04sWUFBWTtBQUFBLFFBQ1gsaUJBQWlCO0FBQUEsVUFDaEIsTUFBTTtBQUFBLFVBQ04sU0FBUztBQUFBLFVBQ1QsYUFBYTtBQUFBLFFBQ2Q7QUFBQSxNQUNEO0FBQUEsTUFDQSxlQUFlLEVBQUUsSUFBSSxhQUFhO0FBQUEsSUFDbkM7QUFFQSwwQkFBc0Isc0JBQXNCLE9BQU87QUFDbkQsMEJBQXNCLHNCQUFzQixPQUFPO0FBQ25ELGdCQUFZLElBQUksYUFBYSxNQUFNLHNCQUFzQix5QkFBeUIsQ0FBQyxTQUFTLE9BQU8sQ0FBQyxDQUFDLENBQUM7QUFFdEcsVUFBTSxrQkFBa0IsWUFBWSxJQUFJLElBQUksZ0JBQWdCLENBQUMsR0FBRyxvQkFBb0IsTUFBTSxvQkFBb0IsQ0FBQztBQUMvRyxVQUFNLFNBQVMsZ0JBQWdCLG9CQUFvQjtBQUVuRCxVQUFNLFNBQVMsT0FBTyxLQUFLLE9BQUssRUFBRSxlQUFlLE9BQU8sWUFBWTtBQUNwRSxVQUFNLFNBQVMsT0FBTyxLQUFLLE9BQUssRUFBRSxlQUFlLE9BQU8sWUFBWTtBQUVwRSxXQUFPLEdBQUcsTUFBTTtBQUNoQixXQUFPLEdBQUcsTUFBTTtBQUNoQixXQUFPLGVBQWUsUUFBUSxNQUFNO0FBQ3BDLFdBQU8sWUFBWSxPQUFPLE9BQU8sU0FBUztBQUMxQyxXQUFPLFlBQVksT0FBTyxPQUFPLFNBQVM7QUFBQSxFQUMzQyxDQUFDO0FBRUQsT0FBSyx3RUFBd0UsTUFBTTtBQUNsRixVQUFNLGVBQWU7QUFDckIsVUFBTSxlQUFlO0FBQ3JCLFVBQU0sVUFBOEI7QUFBQSxNQUNuQyxJQUFJO0FBQUEsTUFDSixNQUFNO0FBQUEsTUFDTixZQUFZO0FBQUEsUUFDWCxpQkFBaUI7QUFBQSxVQUNoQixNQUFNO0FBQUEsVUFDTixTQUFTO0FBQUEsVUFDVCxhQUFhO0FBQUEsUUFDZDtBQUFBLE1BQ0Q7QUFBQSxNQUNBLGVBQWUsRUFBRSxJQUFJLGFBQWE7QUFBQSxJQUNuQztBQUVBLFVBQU0sVUFBOEI7QUFBQSxNQUNuQyxJQUFJO0FBQUEsTUFDSixNQUFNO0FBQUEsTUFDTixZQUFZO0FBQUEsUUFDWCxpQkFBaUI7QUFBQSxVQUNoQixNQUFNO0FBQUEsVUFDTixTQUFTO0FBQUEsVUFDVCxhQUFhO0FBQUEsUUFDZDtBQUFBLE1BQ0Q7QUFBQSxNQUNBLGVBQWUsRUFBRSxJQUFJLGFBQWE7QUFBQSxJQUNuQztBQUVBLDBCQUFzQixzQkFBc0IsT0FBTztBQUNuRCwwQkFBc0Isc0JBQXNCLE9BQU87QUFDbkQsZ0JBQVksSUFBSSxhQUFhLE1BQU0sc0JBQXNCLHlCQUF5QixDQUFDLFNBQVMsT0FBTyxDQUFDLENBQUMsQ0FBQztBQUV0RyxVQUFNLGtCQUFrQixZQUFZLElBQUksSUFBSSxnQkFBZ0IsQ0FBQyxHQUFHLG9CQUFvQixNQUFNLG9CQUFvQixDQUFDO0FBQy9HLFVBQU0sU0FBUyxnQkFBZ0Isb0JBQW9CO0FBRW5ELFVBQU0sU0FBUyxPQUFPLEtBQUssT0FBSyxFQUFFLGVBQWUsT0FBTyxZQUFZO0FBQ3BFLFVBQU0sU0FBUyxPQUFPLEtBQUssT0FBSyxFQUFFLGVBQWUsT0FBTyxZQUFZO0FBRXBFLFdBQU8sR0FBRyxNQUFNO0FBQ2hCLFdBQU8sR0FBRyxNQUFNO0FBQ2hCLFdBQU8sZUFBZSxRQUFRLE1BQU07QUFBQSxFQUNyQyxDQUFDO0FBRUQsT0FBSyxtRUFBbUUsTUFBTTtBQUM3RSxVQUFNLGNBQWM7QUFDcEIsVUFBTSxVQUE4QjtBQUFBLE1BQ25DLElBQUk7QUFBQSxNQUNKLE9BQU87QUFBQSxNQUNQLE1BQU07QUFBQSxNQUNOLFlBQVk7QUFBQSxRQUNYLGlCQUFpQjtBQUFBLFVBQ2hCLE1BQU07QUFBQSxVQUNOLFNBQVM7QUFBQSxVQUNULGFBQWE7QUFBQSxRQUNkO0FBQUEsTUFDRDtBQUFBLE1BQ0EsZUFBZSxFQUFFLElBQUksWUFBWTtBQUFBLElBQ2xDO0FBRUEsVUFBTSxVQUE4QjtBQUFBLE1BQ25DLElBQUk7QUFBQSxNQUNKLE9BQU87QUFBQSxNQUNQLE1BQU07QUFBQSxNQUNOLFlBQVk7QUFBQSxRQUNYLGlCQUFpQjtBQUFBLFVBQ2hCLE1BQU07QUFBQSxVQUNOLFNBQVM7QUFBQSxVQUNULGFBQWE7QUFBQSxRQUNkO0FBQUEsTUFDRDtBQUFBLE1BQ0EsZUFBZSxFQUFFLElBQUksWUFBWTtBQUFBLElBQ2xDO0FBRUEsMEJBQXNCLHNCQUFzQixPQUFPO0FBQ25ELDBCQUFzQixzQkFBc0IsT0FBTztBQUNuRCxnQkFBWSxJQUFJLGFBQWEsTUFBTSxzQkFBc0IseUJBQXlCLENBQUMsU0FBUyxPQUFPLENBQUMsQ0FBQyxDQUFDO0FBRXRHLFVBQU0sa0JBQWtCLFlBQVksSUFBSSxJQUFJLGdCQUFnQixDQUFDLEdBQUcsb0JBQW9CLE1BQU0sb0JBQW9CLENBQUM7QUFDL0csVUFBTSxTQUFTLGdCQUFnQixvQkFBb0I7QUFFbkQsVUFBTSxrQkFBa0IsT0FBTyxPQUFPLE9BQUssRUFBRSxlQUFlLE9BQU8sV0FBVztBQUU5RSxXQUFPLFlBQVksZ0JBQWdCLFFBQVEsR0FBRyxzQkFBc0I7QUFDcEUsV0FBTyxZQUFZLGdCQUFnQixDQUFDLEVBQUUsT0FBTyxTQUFTO0FBQ3RELFdBQU8sWUFBWSxnQkFBZ0IsQ0FBQyxFQUFFLE9BQU8sU0FBUztBQUFBLEVBQ3ZELENBQUM7QUFFRCxPQUFLLHlCQUF5QixNQUFNO0FBQ25DLFVBQU0sY0FBYztBQUNwQixVQUFNLFVBQThCO0FBQUEsTUFDbkMsSUFBSTtBQUFBLE1BQ0osT0FBTztBQUFBLE1BQ1AsT0FBTztBQUFBLE1BQ1AsTUFBTTtBQUFBLE1BQ04sWUFBWTtBQUFBLFFBQ1gsaUJBQWlCO0FBQUEsVUFDaEIsTUFBTTtBQUFBLFVBQ04sU0FBUztBQUFBLFVBQ1QsYUFBYTtBQUFBLFFBQ2Q7QUFBQSxNQUNEO0FBQUEsTUFDQSxlQUFlLEVBQUUsSUFBSSxZQUFZO0FBQUEsSUFDbEM7QUFFQSxVQUFNLFVBQThCO0FBQUEsTUFDbkMsSUFBSTtBQUFBLE1BQ0osT0FBTztBQUFBLE1BQ1AsT0FBTztBQUFBLE1BQ1AsTUFBTTtBQUFBLE1BQ04sWUFBWTtBQUFBLFFBQ1gsaUJBQWlCO0FBQUEsVUFDaEIsTUFBTTtBQUFBLFVBQ04sU0FBUztBQUFBLFVBQ1QsYUFBYTtBQUFBLFFBQ2Q7QUFBQSxNQUNEO0FBQUEsTUFDQSxlQUFlLEVBQUUsSUFBSSxZQUFZO0FBQUEsSUFDbEM7QUFFQSwwQkFBc0Isc0JBQXNCLE9BQU87QUFDbkQsMEJBQXNCLHNCQUFzQixPQUFPO0FBQ25ELGdCQUFZLElBQUksYUFBYSxNQUFNLHNCQUFzQix5QkFBeUIsQ0FBQyxTQUFTLE9BQU8sQ0FBQyxDQUFDLENBQUM7QUFFdEcsVUFBTSxrQkFBa0IsWUFBWSxJQUFJLElBQUksZ0JBQWdCLENBQUMsR0FBRyxvQkFBb0IsTUFBTSxvQkFBb0IsQ0FBQztBQUMvRyxVQUFNLFNBQVMsZ0JBQWdCLG9CQUFvQjtBQUVuRCxVQUFNLGtCQUFrQixPQUFPLE9BQU8sT0FBSyxFQUFFLGVBQWUsT0FBTyxXQUFXO0FBRTlFLFdBQU8sWUFBWSxnQkFBZ0IsUUFBUSxDQUFDO0FBQzVDLFdBQU8sWUFBWSxnQkFBZ0IsQ0FBQyxFQUFFLE9BQU8sU0FBUztBQUN0RCxXQUFPLFlBQVksZ0JBQWdCLENBQUMsRUFBRSxPQUFPLFNBQVM7QUFBQSxFQUN2RCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
