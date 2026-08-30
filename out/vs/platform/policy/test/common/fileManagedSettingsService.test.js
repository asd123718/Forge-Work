import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { FileService } from "../../../files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../log/common/log.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { COPILOT_ALLOW_MANAGED_HOOKS_ONLY_KEY, COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_KEY, COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY, COPILOT_ENABLED_PLUGINS_KEY, COPILOT_EXTRA_MARKETPLACES_KEY, COPILOT_MODEL_KEY, COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_KEY, COPILOT_TOP_LEVEL_MODEL_KEY, managedModelValue, normalizeManagedSettings } from "../../common/copilotManagedSettings.js";
import { FileManagedSettingsService } from "../../common/fileManagedSettingsService.js";
import { FileManagedSettingsChannelClient } from "../../common/fileManagedSettingsIpc.js";
suite("normalizeManagedSettings", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("flattens scalar leaves to dot-paths", () => {
    const result = normalizeManagedSettings({
      permissions: {
        disableBypassPermissionsMode: "disable"
      }
    });
    assert.deepStrictEqual(result, {
      "permissions.disableBypassPermissionsMode": "disable"
    });
  });
  test("JSON-stringifies structured keys (enabledPlugins)", () => {
    const plugins = { "plugin@marketplace": false };
    const result = normalizeManagedSettings({
      [COPILOT_ENABLED_PLUGINS_KEY]: plugins
    });
    assert.deepStrictEqual(result, {
      [COPILOT_ENABLED_PLUGINS_KEY]: JSON.stringify(plugins)
    });
  });
  test("normalizes customization lockdown controls", () => {
    assert.deepStrictEqual(normalizeManagedSettings({
      [COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_KEY]: true,
      [COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_KEY]: true,
      [COPILOT_ALLOW_MANAGED_HOOKS_ONLY_KEY]: false
    }), {
      [COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_KEY]: true,
      [COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_KEY]: true,
      [COPILOT_ALLOW_MANAGED_HOOKS_ONLY_KEY]: false
    });
  });
  test("drops a non-boolean strictPluginOnlyCustomization value", () => {
    assert.deepStrictEqual(normalizeManagedSettings({
      [COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_KEY]: ["skills", "unknown"]
    }), {});
  });
  test("normalizes extraKnownMarketplaces from schema format to config dict", () => {
    const result = normalizeManagedSettings({
      [COPILOT_EXTRA_MARKETPLACES_KEY]: {
        "a": { source: { source: "github", repo: "github/agent-skills" }, autoUpdate: true },
        "b": { source: { source: "git", url: "https://example.com/repo.git", ref: "v1" }, autoUpdate: false },
        "c": { source: { source: "github", repo: "github/copilot-plugins" } }
      }
    });
    assert.deepStrictEqual(result, {
      [COPILOT_EXTRA_MARKETPLACES_KEY]: '{"a":"{\\"source\\":\\"github/agent-skills\\",\\"autoUpdate\\":true}","b":"{\\"source\\":\\"https://example.com/repo.git#v1\\",\\"autoUpdate\\":false}","c":"github/copilot-plugins"}'
    });
  });
  test("ignores non-boolean marketplace autoUpdate with warning", () => {
    const warnings = [];
    const result = normalizeManagedSettings({
      [COPILOT_EXTRA_MARKETPLACES_KEY]: {
        "a": { source: { source: "github", repo: "github/agent-skills" }, autoUpdate: "yes" }
      }
    }, (msg) => warnings.push(msg));
    assert.deepStrictEqual(result, {
      [COPILOT_EXTRA_MARKETPLACES_KEY]: '{"a":"github/agent-skills"}'
    });
    assert.deepStrictEqual(warnings, ['Ignoring invalid autoUpdate for extraKnownMarketplaces entry "a": expected boolean']);
  });
  test("drops malformed marketplace entries with warning", () => {
    const warnings = [];
    const result = normalizeManagedSettings({
      [COPILOT_EXTRA_MARKETPLACES_KEY]: {
        "good": { source: { source: "github", repo: "a/b" } },
        "bad": {}
      }
    }, (msg) => warnings.push(msg));
    assert.deepStrictEqual(result, {
      [COPILOT_EXTRA_MARKETPLACES_KEY]: '{"good":"a/b"}'
    });
    assert.strictEqual(warnings.length, 1);
  });
  test("handles mixed scalar and structured keys", () => {
    const result = normalizeManagedSettings({
      permissions: { disableBypassPermissionsMode: "disable" },
      strictKnownMarketplaces: ["github/foo"],
      [COPILOT_ENABLED_PLUGINS_KEY]: { "plugin": true }
    });
    assert.deepStrictEqual(result, {
      "permissions.disableBypassPermissionsMode": "disable",
      "strictKnownMarketplaces": '["github/foo"]',
      [COPILOT_ENABLED_PLUGINS_KEY]: '{"plugin":true}'
    });
  });
  test("flattens the model setting nested under permissions", () => {
    const result = normalizeManagedSettings({
      permissions: { model: "auto" }
    });
    assert.deepStrictEqual(result, {
      "permissions.model": "auto"
    });
    assert.strictEqual(COPILOT_MODEL_KEY, "permissions.model");
    assert.strictEqual(managedModelValue()({ managedSettings: result }), "auto");
  });
  test("carries the top-level model setting as the `model` bag key", () => {
    const result = normalizeManagedSettings({
      model: "auto"
    });
    assert.deepStrictEqual(result, {
      "model": "auto"
    });
    assert.strictEqual(COPILOT_TOP_LEVEL_MODEL_KEY, "model");
    assert.strictEqual(managedModelValue()({ managedSettings: result }), "auto");
  });
  test("keeps top-level and legacy model keys distinct, with the top-level value winning", () => {
    const result = normalizeManagedSettings({
      model: "opus",
      permissions: { model: "gemini" }
    });
    assert.deepStrictEqual(result, {
      "model": "opus",
      "permissions.model": "gemini"
    });
    assert.strictEqual(managedModelValue()({ managedSettings: result }), "opus");
  });
  test("handles empty object", () => {
    assert.deepStrictEqual(normalizeManagedSettings({}), {});
  });
  test("drops a structured key whose value is not an object", () => {
    const result = normalizeManagedSettings({
      [COPILOT_ENABLED_PLUGINS_KEY]: "already-a-string"
    });
    assert.deepStrictEqual(result, {});
  });
});
suite("FileManagedSettingsService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const managedSettingsFile = URI.file("managed-settings.json").with({ scheme: "vscode-tests" });
  test("reads managed-settings.json on startup", () => runWithFakedTimers({}, async () => {
    const logService = new NullLogService();
    const fileService = disposables.add(new FileService(logService));
    const inMemoryProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider("vscode-tests", inMemoryProvider));
    await fileService.writeFile(managedSettingsFile, VSBuffer.fromString(JSON.stringify({
      permissions: { disableBypassPermissionsMode: "disable" },
      strictKnownMarketplaces: ["github/foo"]
    })));
    const service = disposables.add(new FileManagedSettingsService(managedSettingsFile, fileService, logService));
    await new Promise((resolve) => {
      if (Object.keys(service.managedSettings).length > 0) {
        resolve();
      } else {
        const listener = disposables.add(service.onDidChangeManagedSettings(() => {
          listener.dispose();
          resolve();
        }));
      }
    });
    assert.deepStrictEqual(service.managedSettings, {
      "permissions.disableBypassPermissionsMode": "disable",
      "strictKnownMarketplaces": '["github/foo"]'
    });
  }));
  test("retains raw settings that are absent from the normalized bag", () => runWithFakedTimers({}, async () => {
    const logService = new NullLogService();
    const fileService = disposables.add(new FileService(logService));
    const inMemoryProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider("vscode-tests", inMemoryProvider));
    const raw = {
      permissions: {
        deny: ["Shell(echo denied *)"],
        ask: ["Shell(echo ask *)"],
        allow: ["Shell(echo *)"]
      }
    };
    await fileService.writeFile(managedSettingsFile, VSBuffer.fromString(JSON.stringify(raw)));
    const service = disposables.add(new FileManagedSettingsService(managedSettingsFile, fileService, logService));
    await Event.toPromise(service.onDidChangeRawManagedSettings);
    assert.deepStrictEqual({ raw: service.rawManagedSettings, normalized: service.managedSettings }, {
      raw,
      normalized: {}
    });
  }));
  test("returns empty object when file does not exist", () => runWithFakedTimers({}, async () => {
    const logService = new NullLogService();
    const fileService = disposables.add(new FileService(logService));
    const inMemoryProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider("vscode-tests", inMemoryProvider));
    const service = disposables.add(new FileManagedSettingsService(managedSettingsFile, fileService, logService));
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepStrictEqual(service.managedSettings, {});
  }));
  test("fires event when file changes", () => runWithFakedTimers({}, async () => {
    const logService = new NullLogService();
    const fileService = disposables.add(new FileService(logService));
    const inMemoryProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider("vscode-tests", inMemoryProvider));
    await fileService.writeFile(managedSettingsFile, VSBuffer.fromString(JSON.stringify({
      permissions: { disableBypassPermissionsMode: "disable" }
    })));
    const service = disposables.add(new FileManagedSettingsService(managedSettingsFile, fileService, logService));
    await new Promise((resolve) => {
      if (Object.keys(service.managedSettings).length > 0) {
        resolve();
      } else {
        const listener = disposables.add(service.onDidChangeManagedSettings(() => {
          listener.dispose();
          resolve();
        }));
      }
    });
    const changePromise = new Promise((resolve) => {
      const listener = disposables.add(service.onDidChangeManagedSettings(() => {
        listener.dispose();
        resolve();
      }));
    });
    await fileService.writeFile(managedSettingsFile, VSBuffer.fromString(JSON.stringify({
      strictKnownMarketplaces: ["github/foo"]
    })));
    await changePromise;
    assert.deepStrictEqual(service.managedSettings, {
      "strictKnownMarketplaces": '["github/foo"]'
    });
  }));
  test("returns empty object when the file is malformed JSON", () => runWithFakedTimers({}, async () => {
    const logService = new NullLogService();
    const fileService = disposables.add(new FileService(logService));
    const inMemoryProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider("vscode-tests", inMemoryProvider));
    await fileService.writeFile(managedSettingsFile, VSBuffer.fromString("{ not: valid json"));
    const service = disposables.add(new FileManagedSettingsService(managedSettingsFile, fileService, logService));
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepStrictEqual(service.managedSettings, {});
  }));
  test("returns empty object when the file is not a JSON object", () => runWithFakedTimers({}, async () => {
    const logService = new NullLogService();
    const fileService = disposables.add(new FileService(logService));
    const inMemoryProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider("vscode-tests", inMemoryProvider));
    await fileService.writeFile(managedSettingsFile, VSBuffer.fromString(JSON.stringify(["not", "an", "object"])));
    const service = disposables.add(new FileManagedSettingsService(managedSettingsFile, fileService, logService));
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepStrictEqual(service.managedSettings, {});
  }));
  test("clears managed settings and fires when the file is deleted", () => runWithFakedTimers({}, async () => {
    const logService = new NullLogService();
    const fileService = disposables.add(new FileService(logService));
    const inMemoryProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider("vscode-tests", inMemoryProvider));
    await fileService.writeFile(managedSettingsFile, VSBuffer.fromString(JSON.stringify({
      permissions: { disableBypassPermissionsMode: "disable" }
    })));
    const service = disposables.add(new FileManagedSettingsService(managedSettingsFile, fileService, logService));
    await new Promise((resolve) => {
      if (Object.keys(service.managedSettings).length > 0) {
        resolve();
      } else {
        const listener = disposables.add(service.onDidChangeManagedSettings(() => {
          listener.dispose();
          resolve();
        }));
      }
    });
    const changePromise = new Promise((resolve) => {
      const listener = disposables.add(service.onDidChangeManagedSettings(() => {
        listener.dispose();
        resolve();
      }));
    });
    await fileService.del(managedSettingsFile);
    await changePromise;
    assert.deepStrictEqual(service.managedSettings, {});
  }));
});
suite("FileManagedSettingsChannelClient", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("keeps newer event state when the initial snapshot resolves later", async () => {
    const channel = disposables.add(new DeferredManagedSettingsChannel());
    const client = disposables.add(new FileManagedSettingsChannelClient(channel));
    channel.fireRaw({ permissions: { allow: ["Shell(echo *)"] } });
    channel.fire({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "disable" });
    channel.resolveInitialRawSnapshot({ permissions: { deny: ["Shell(echo *)"] } });
    channel.resolveInitialSnapshot({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "enable" });
    await Promise.all([channel.initialRawSnapshot, channel.initialSnapshot]);
    assert.deepStrictEqual({ raw: client.rawManagedSettings, normalized: client.managedSettings }, {
      raw: { permissions: { allow: ["Shell(echo *)"] } },
      normalized: { [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "disable" }
    });
  });
});
class DeferredManagedSettingsChannel extends Disposable {
  constructor() {
    super(...arguments);
    this._onDidChangeRawManagedSettings = this._register(new Emitter());
    this._onDidChangeManagedSettings = this._register(new Emitter());
    this.initialRawSnapshot = new Promise((resolve) => this.resolveInitialRawSnapshotPromise = resolve);
    this.initialSnapshot = new Promise((resolve) => this.resolveInitialSnapshotPromise = resolve);
  }
  call(command) {
    switch (command) {
      case "getRawManagedSettings":
        return this.initialRawSnapshot;
      case "getManagedSettings":
        return this.initialSnapshot;
    }
    throw new Error(`Call not found: ${command}`);
  }
  listen(event) {
    switch (event) {
      case "onDidChangeRawManagedSettings":
        return this._onDidChangeRawManagedSettings.event;
      case "onDidChangeManagedSettings":
        return this._onDidChangeManagedSettings.event;
    }
    throw new Error(`Event not found: ${event}`);
  }
  fireRaw(managedSettings) {
    this._onDidChangeRawManagedSettings.fire(managedSettings);
  }
  fire(managedSettings) {
    this._onDidChangeManagedSettings.fire(managedSettings);
  }
  resolveInitialSnapshot(managedSettings) {
    this.resolveInitialSnapshotPromise(managedSettings);
  }
  resolveInitialRawSnapshot(managedSettings) {
    this.resolveInitialRawSnapshotPromise(managedSettings);
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxccG9saWN5XFx0ZXN0XFxjb21tb25cXGZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE1hbmFnZWRTZXR0aW5nc0RhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wb2xpY3kuanMnO1xuaW1wb3J0IHsgSUNoYW5uZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgQ09QSUxPVF9BTExPV19NQU5BR0VEX0hPT0tTX09OTFlfS0VZLCBDT1BJTE9UX0FMTE9XX01BTkFHRURfTUNQX1NFUlZFUlNfT05MWV9LRVksIENPUElMT1RfRElTQUJMRV9CWVBBU1NfUEVSTUlTU0lPTlNfTU9ERV9LRVksIENPUElMT1RfRU5BQkxFRF9QTFVHSU5TX0tFWSwgQ09QSUxPVF9FWFRSQV9NQVJLRVRQTEFDRVNfS0VZLCBDT1BJTE9UX01PREVMX0tFWSwgQ09QSUxPVF9TVFJJQ1RfUExVR0lOX09OTFlfQ1VTVE9NSVpBVElPTl9LRVksIENPUElMT1RfVE9QX0xFVkVMX01PREVMX0tFWSwgbWFuYWdlZE1vZGVsVmFsdWUsIG5vcm1hbGl6ZU1hbmFnZWRTZXR0aW5ncywgUmF3TWFuYWdlZFNldHRpbmdzRGF0YSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb3BpbG90TWFuYWdlZFNldHRpbmdzLmpzJztcbmltcG9ydCB7IEZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2ZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEZpbGVNYW5hZ2VkU2V0dGluZ3NDaGFubmVsQ2xpZW50IH0gZnJvbSAnLi4vLi4vY29tbW9uL2ZpbGVNYW5hZ2VkU2V0dGluZ3NJcGMuanMnO1xuXG5zdWl0ZSgnbm9ybWFsaXplTWFuYWdlZFNldHRpbmdzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2ZsYXR0ZW5zIHNjYWxhciBsZWF2ZXMgdG8gZG90LXBhdGhzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5vcm1hbGl6ZU1hbmFnZWRTZXR0aW5ncyh7XG5cdFx0XHRwZXJtaXNzaW9uczoge1xuXHRcdFx0XHRkaXNhYmxlQnlwYXNzUGVybWlzc2lvbnNNb2RlOiAnZGlzYWJsZSdcblx0XHRcdH1cblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0J3Blcm1pc3Npb25zLmRpc2FibGVCeXBhc3NQZXJtaXNzaW9uc01vZGUnOiAnZGlzYWJsZSdcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnSlNPTi1zdHJpbmdpZmllcyBzdHJ1Y3R1cmVkIGtleXMgKGVuYWJsZWRQbHVnaW5zKScsICgpID0+IHtcblx0XHRjb25zdCBwbHVnaW5zID0geyAncGx1Z2luQG1hcmtldHBsYWNlJzogZmFsc2UgfTtcblx0XHRjb25zdCByZXN1bHQgPSBub3JtYWxpemVNYW5hZ2VkU2V0dGluZ3Moe1xuXHRcdFx0W0NPUElMT1RfRU5BQkxFRF9QTFVHSU5TX0tFWV06IHBsdWdpbnNcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0W0NPUElMT1RfRU5BQkxFRF9QTFVHSU5TX0tFWV06IEpTT04uc3RyaW5naWZ5KHBsdWdpbnMpXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vcm1hbGl6ZXMgY3VzdG9taXphdGlvbiBsb2NrZG93biBjb250cm9scycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5vcm1hbGl6ZU1hbmFnZWRTZXR0aW5ncyh7XG5cdFx0XHRbQ09QSUxPVF9TVFJJQ1RfUExVR0lOX09OTFlfQ1VTVE9NSVpBVElPTl9LRVldOiB0cnVlLFxuXHRcdFx0W0NPUElMT1RfQUxMT1dfTUFOQUdFRF9NQ1BfU0VSVkVSU19PTkxZX0tFWV06IHRydWUsXG5cdFx0XHRbQ09QSUxPVF9BTExPV19NQU5BR0VEX0hPT0tTX09OTFlfS0VZXTogZmFsc2UsXG5cdFx0fSksIHtcblx0XHRcdFtDT1BJTE9UX1NUUklDVF9QTFVHSU5fT05MWV9DVVNUT01JWkFUSU9OX0tFWV06IHRydWUsXG5cdFx0XHRbQ09QSUxPVF9BTExPV19NQU5BR0VEX01DUF9TRVJWRVJTX09OTFlfS0VZXTogdHJ1ZSxcblx0XHRcdFtDT1BJTE9UX0FMTE9XX01BTkFHRURfSE9PS1NfT05MWV9LRVldOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZHJvcHMgYSBub24tYm9vbGVhbiBzdHJpY3RQbHVnaW5Pbmx5Q3VzdG9taXphdGlvbiB2YWx1ZScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5vcm1hbGl6ZU1hbmFnZWRTZXR0aW5ncyh7XG5cdFx0XHRbQ09QSUxPVF9TVFJJQ1RfUExVR0lOX09OTFlfQ1VTVE9NSVpBVElPTl9LRVldOiBbJ3NraWxscycsICd1bmtub3duJ10sXG5cdFx0fSksIHt9KTtcblx0fSk7XG5cblx0dGVzdCgnbm9ybWFsaXplcyBleHRyYUtub3duTWFya2V0cGxhY2VzIGZyb20gc2NoZW1hIGZvcm1hdCB0byBjb25maWcgZGljdCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBub3JtYWxpemVNYW5hZ2VkU2V0dGluZ3Moe1xuXHRcdFx0W0NPUElMT1RfRVhUUkFfTUFSS0VUUExBQ0VTX0tFWV06IHtcblx0XHRcdFx0J2EnOiB7IHNvdXJjZTogeyBzb3VyY2U6ICdnaXRodWInLCByZXBvOiAnZ2l0aHViL2FnZW50LXNraWxscycgfSwgYXV0b1VwZGF0ZTogdHJ1ZSB9LFxuXHRcdFx0XHQnYic6IHsgc291cmNlOiB7IHNvdXJjZTogJ2dpdCcsIHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vcmVwby5naXQnLCByZWY6ICd2MScgfSwgYXV0b1VwZGF0ZTogZmFsc2UgfSxcblx0XHRcdFx0J2MnOiB7IHNvdXJjZTogeyBzb3VyY2U6ICdnaXRodWInLCByZXBvOiAnZ2l0aHViL2NvcGlsb3QtcGx1Z2lucycgfSB9LFxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRbQ09QSUxPVF9FWFRSQV9NQVJLRVRQTEFDRVNfS0VZXTogJ3tcImFcIjpcIntcXFxcXCJzb3VyY2VcXFxcXCI6XFxcXFwiZ2l0aHViL2FnZW50LXNraWxsc1xcXFxcIixcXFxcXCJhdXRvVXBkYXRlXFxcXFwiOnRydWV9XCIsXCJiXCI6XCJ7XFxcXFwic291cmNlXFxcXFwiOlxcXFxcImh0dHBzOi8vZXhhbXBsZS5jb20vcmVwby5naXQjdjFcXFxcXCIsXFxcXFwiYXV0b1VwZGF0ZVxcXFxcIjpmYWxzZX1cIixcImNcIjpcImdpdGh1Yi9jb3BpbG90LXBsdWdpbnNcIn0nLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIG5vbi1ib29sZWFuIG1hcmtldHBsYWNlIGF1dG9VcGRhdGUgd2l0aCB3YXJuaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHdhcm5pbmdzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5vcm1hbGl6ZU1hbmFnZWRTZXR0aW5ncyh7XG5cdFx0XHRbQ09QSUxPVF9FWFRSQV9NQVJLRVRQTEFDRVNfS0VZXToge1xuXHRcdFx0XHQnYSc6IHsgc291cmNlOiB7IHNvdXJjZTogJ2dpdGh1YicsIHJlcG86ICdnaXRodWIvYWdlbnQtc2tpbGxzJyB9LCBhdXRvVXBkYXRlOiAneWVzJyB9LFxuXHRcdFx0fVxuXHRcdH0sIG1zZyA9PiB3YXJuaW5ncy5wdXNoKG1zZykpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRbQ09QSUxPVF9FWFRSQV9NQVJLRVRQTEFDRVNfS0VZXTogJ3tcImFcIjpcImdpdGh1Yi9hZ2VudC1za2lsbHNcIn0nLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwod2FybmluZ3MsIFsnSWdub3JpbmcgaW52YWxpZCBhdXRvVXBkYXRlIGZvciBleHRyYUtub3duTWFya2V0cGxhY2VzIGVudHJ5IFwiYVwiOiBleHBlY3RlZCBib29sZWFuJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdkcm9wcyBtYWxmb3JtZWQgbWFya2V0cGxhY2UgZW50cmllcyB3aXRoIHdhcm5pbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd2FybmluZ3M6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcmVzdWx0ID0gbm9ybWFsaXplTWFuYWdlZFNldHRpbmdzKHtcblx0XHRcdFtDT1BJTE9UX0VYVFJBX01BUktFVFBMQUNFU19LRVldOiB7XG5cdFx0XHRcdCdnb29kJzogeyBzb3VyY2U6IHsgc291cmNlOiAnZ2l0aHViJywgcmVwbzogJ2EvYicgfSB9LFxuXHRcdFx0XHQnYmFkJzoge30gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4sXG5cdFx0XHR9XG5cdFx0fSwgbXNnID0+IHdhcm5pbmdzLnB1c2gobXNnKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFtDT1BJTE9UX0VYVFJBX01BUktFVFBMQUNFU19LRVldOiAne1wiZ29vZFwiOlwiYS9iXCJ9Jyxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2FybmluZ3MubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBtaXhlZCBzY2FsYXIgYW5kIHN0cnVjdHVyZWQga2V5cycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBub3JtYWxpemVNYW5hZ2VkU2V0dGluZ3Moe1xuXHRcdFx0cGVybWlzc2lvbnM6IHsgZGlzYWJsZUJ5cGFzc1Blcm1pc3Npb25zTW9kZTogJ2Rpc2FibGUnIH0sXG5cdFx0XHRzdHJpY3RLbm93bk1hcmtldHBsYWNlczogWydnaXRodWIvZm9vJ10sXG5cdFx0XHRbQ09QSUxPVF9FTkFCTEVEX1BMVUdJTlNfS0VZXTogeyAncGx1Z2luJzogdHJ1ZSB9LFxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHQncGVybWlzc2lvbnMuZGlzYWJsZUJ5cGFzc1Blcm1pc3Npb25zTW9kZSc6ICdkaXNhYmxlJyxcblx0XHRcdCdzdHJpY3RLbm93bk1hcmtldHBsYWNlcyc6ICdbXCJnaXRodWIvZm9vXCJdJyxcblx0XHRcdFtDT1BJTE9UX0VOQUJMRURfUExVR0lOU19LRVldOiAne1wicGx1Z2luXCI6dHJ1ZX0nLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmbGF0dGVucyB0aGUgbW9kZWwgc2V0dGluZyBuZXN0ZWQgdW5kZXIgcGVybWlzc2lvbnMnLCAoKSA9PiB7XG5cdFx0Ly8gVGhlIHNlcnZlci9maWxlIG1hbmFnZWQtc2V0dGluZ3Mgc2NoZW1hIGNhcnJpZXMgYG1vZGVsYCB1bmRlciBgcGVybWlzc2lvbnNgXG5cdFx0Ly8gKGFsb25nc2lkZSBkaXNhYmxlQnlwYXNzUGVybWlzc2lvbnNNb2RlKTsgaXQgbXVzdCBmbGF0dGVuIHRvIGBwZXJtaXNzaW9ucy5tb2RlbGAsXG5cdFx0Ly8gd2hpY2ggaXMgdGhlIGtleSB0aGUgQ2hhdERlZmF1bHRNb2RlbCBwb2xpY3kgdmFsdWUgY2FsbGJhY2sgcmVhZHMuXG5cdFx0Y29uc3QgcmVzdWx0ID0gbm9ybWFsaXplTWFuYWdlZFNldHRpbmdzKHtcblx0XHRcdHBlcm1pc3Npb25zOiB7IG1vZGVsOiAnYXV0bycgfVxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHQncGVybWlzc2lvbnMubW9kZWwnOiAnYXV0bydcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQ09QSUxPVF9NT0RFTF9LRVksICdwZXJtaXNzaW9ucy5tb2RlbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VkTW9kZWxWYWx1ZSgpKHsgbWFuYWdlZFNldHRpbmdzOiByZXN1bHQgfSksICdhdXRvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhcnJpZXMgdGhlIHRvcC1sZXZlbCBtb2RlbCBzZXR0aW5nIGFzIHRoZSBgbW9kZWxgIGJhZyBrZXknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbm9ybWFsaXplTWFuYWdlZFNldHRpbmdzKHtcblx0XHRcdG1vZGVsOiAnYXV0bydcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0J21vZGVsJzogJ2F1dG8nXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKENPUElMT1RfVE9QX0xFVkVMX01PREVMX0tFWSwgJ21vZGVsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZWRNb2RlbFZhbHVlKCkoeyBtYW5hZ2VkU2V0dGluZ3M6IHJlc3VsdCB9KSwgJ2F1dG8nKTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgdG9wLWxldmVsIGFuZCBsZWdhY3kgbW9kZWwga2V5cyBkaXN0aW5jdCwgd2l0aCB0aGUgdG9wLWxldmVsIHZhbHVlIHdpbm5pbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbm9ybWFsaXplTWFuYWdlZFNldHRpbmdzKHtcblx0XHRcdG1vZGVsOiAnb3B1cycsXG5cdFx0XHRwZXJtaXNzaW9uczogeyBtb2RlbDogJ2dlbWluaScgfVxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHQnbW9kZWwnOiAnb3B1cycsXG5cdFx0XHQncGVybWlzc2lvbnMubW9kZWwnOiAnZ2VtaW5pJ1xuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VkTW9kZWxWYWx1ZSgpKHsgbWFuYWdlZFNldHRpbmdzOiByZXN1bHQgfSksICdvcHVzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgZW1wdHkgb2JqZWN0JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobm9ybWFsaXplTWFuYWdlZFNldHRpbmdzKHt9KSwge30pO1xuXHR9KTtcblxuXHR0ZXN0KCdkcm9wcyBhIHN0cnVjdHVyZWQga2V5IHdob3NlIHZhbHVlIGlzIG5vdCBhbiBvYmplY3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbm9ybWFsaXplTWFuYWdlZFNldHRpbmdzKHtcblx0XHRcdFtDT1BJTE9UX0VOQUJMRURfUExVR0lOU19LRVldOiAnYWxyZWFkeS1hLXN0cmluZydcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge30pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnRmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0Y29uc3QgbWFuYWdlZFNldHRpbmdzRmlsZSA9IFVSSS5maWxlKCdtYW5hZ2VkLXNldHRpbmdzLmpzb24nKS53aXRoKHsgc2NoZW1lOiAndnNjb2RlLXRlc3RzJyB9KTtcblxuXHR0ZXN0KCdyZWFkcyBtYW5hZ2VkLXNldHRpbmdzLmpzb24gb24gc3RhcnR1cCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IGluTWVtb3J5UHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCd2c2NvZGUtdGVzdHMnLCBpbk1lbW9yeVByb3ZpZGVyKSk7XG5cblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUobWFuYWdlZFNldHRpbmdzRmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRwZXJtaXNzaW9uczogeyBkaXNhYmxlQnlwYXNzUGVybWlzc2lvbnNNb2RlOiAnZGlzYWJsZScgfSxcblx0XHRcdHN0cmljdEtub3duTWFya2V0cGxhY2VzOiBbJ2dpdGh1Yi9mb28nXVxuXHRcdH0pKSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlTWFuYWdlZFNldHRpbmdzU2VydmljZShtYW5hZ2VkU2V0dGluZ3NGaWxlLCBmaWxlU2VydmljZSwgbG9nU2VydmljZSkpO1xuXG5cdFx0Ly8gV2FpdCBmb3IgdGhlIGFzeW5jIHJlZnJlc2ggdG8gY29tcGxldGVcblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdGlmIChPYmplY3Qua2V5cyhzZXJ2aWNlLm1hbmFnZWRTZXR0aW5ncykubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBsaXN0ZW5lciA9IGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQ2hhbmdlTWFuYWdlZFNldHRpbmdzKCgpID0+IHtcblx0XHRcdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UubWFuYWdlZFNldHRpbmdzLCB7XG5cdFx0XHQncGVybWlzc2lvbnMuZGlzYWJsZUJ5cGFzc1Blcm1pc3Npb25zTW9kZSc6ICdkaXNhYmxlJyxcblx0XHRcdCdzdHJpY3RLbm93bk1hcmtldHBsYWNlcyc6ICdbXCJnaXRodWIvZm9vXCJdJ1xuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgncmV0YWlucyByYXcgc2V0dGluZ3MgdGhhdCBhcmUgYWJzZW50IGZyb20gdGhlIG5vcm1hbGl6ZWQgYmFnJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgaW5NZW1vcnlQcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ3ZzY29kZS10ZXN0cycsIGluTWVtb3J5UHJvdmlkZXIpKTtcblxuXHRcdGNvbnN0IHJhdyA9IHtcblx0XHRcdHBlcm1pc3Npb25zOiB7XG5cdFx0XHRcdGRlbnk6IFsnU2hlbGwoZWNobyBkZW5pZWQgKiknXSxcblx0XHRcdFx0YXNrOiBbJ1NoZWxsKGVjaG8gYXNrICopJ10sXG5cdFx0XHRcdGFsbG93OiBbJ1NoZWxsKGVjaG8gKiknXSxcblx0XHRcdH1cblx0XHR9O1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShtYW5hZ2VkU2V0dGluZ3NGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHJhdykpKTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlKG1hbmFnZWRTZXR0aW5nc0ZpbGUsIGZpbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKHNlcnZpY2Uub25EaWRDaGFuZ2VSYXdNYW5hZ2VkU2V0dGluZ3MpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHJhdzogc2VydmljZS5yYXdNYW5hZ2VkU2V0dGluZ3MsIG5vcm1hbGl6ZWQ6IHNlcnZpY2UubWFuYWdlZFNldHRpbmdzIH0sIHtcblx0XHRcdHJhdyxcblx0XHRcdG5vcm1hbGl6ZWQ6IHt9LFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgncmV0dXJucyBlbXB0eSBvYmplY3Qgd2hlbiBmaWxlIGRvZXMgbm90IGV4aXN0JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgaW5NZW1vcnlQcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ3ZzY29kZS10ZXN0cycsIGluTWVtb3J5UHJvdmlkZXIpKTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlKG1hbmFnZWRTZXR0aW5nc0ZpbGUsIGZpbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cblx0XHQvLyBHaXZlIHRoZSBhc3luYyByZWZyZXNoIGEgY2hhbmNlIHRvIHJ1blxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLm1hbmFnZWRTZXR0aW5ncywge30pO1xuXHR9KSk7XG5cblx0dGVzdCgnZmlyZXMgZXZlbnQgd2hlbiBmaWxlIGNoYW5nZXMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBpbk1lbW9yeVByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcigndnNjb2RlLXRlc3RzJywgaW5NZW1vcnlQcm92aWRlcikpO1xuXG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKG1hbmFnZWRTZXR0aW5nc0ZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0cGVybWlzc2lvbnM6IHsgZGlzYWJsZUJ5cGFzc1Blcm1pc3Npb25zTW9kZTogJ2Rpc2FibGUnIH1cblx0XHR9KSkpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UobWFuYWdlZFNldHRpbmdzRmlsZSwgZmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblxuXHRcdC8vIFdhaXQgZm9yIGluaXRpYWwgcmVhZFxuXHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0aWYgKE9iamVjdC5rZXlzKHNlcnZpY2UubWFuYWdlZFNldHRpbmdzKS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGxpc3RlbmVyID0gZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRDaGFuZ2VNYW5hZ2VkU2V0dGluZ3MoKCkgPT4ge1xuXHRcdFx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIFVwZGF0ZSB0aGUgZmlsZVxuXHRcdGNvbnN0IGNoYW5nZVByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IGxpc3RlbmVyID0gZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRDaGFuZ2VNYW5hZ2VkU2V0dGluZ3MoKCkgPT4ge1xuXHRcdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdH0pKTtcblx0XHR9KTtcblxuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShtYW5hZ2VkU2V0dGluZ3NGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdHN0cmljdEtub3duTWFya2V0cGxhY2VzOiBbJ2dpdGh1Yi9mb28nXVxuXHRcdH0pKSk7XG5cblx0XHRhd2FpdCBjaGFuZ2VQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLm1hbmFnZWRTZXR0aW5ncywge1xuXHRcdFx0J3N0cmljdEtub3duTWFya2V0cGxhY2VzJzogJ1tcImdpdGh1Yi9mb29cIl0nXG5cdFx0fSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdyZXR1cm5zIGVtcHR5IG9iamVjdCB3aGVuIHRoZSBmaWxlIGlzIG1hbGZvcm1lZCBKU09OJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgaW5NZW1vcnlQcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ3ZzY29kZS10ZXN0cycsIGluTWVtb3J5UHJvdmlkZXIpKTtcblxuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShtYW5hZ2VkU2V0dGluZ3NGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7IG5vdDogdmFsaWQganNvbicpKTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlKG1hbmFnZWRTZXR0aW5nc0ZpbGUsIGZpbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UubWFuYWdlZFNldHRpbmdzLCB7fSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdyZXR1cm5zIGVtcHR5IG9iamVjdCB3aGVuIHRoZSBmaWxlIGlzIG5vdCBhIEpTT04gb2JqZWN0JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgaW5NZW1vcnlQcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ3ZzY29kZS10ZXN0cycsIGluTWVtb3J5UHJvdmlkZXIpKTtcblxuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShtYW5hZ2VkU2V0dGluZ3NGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KFsnbm90JywgJ2FuJywgJ29iamVjdCddKSkpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UobWFuYWdlZFNldHRpbmdzRmlsZSwgZmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTApKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5tYW5hZ2VkU2V0dGluZ3MsIHt9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ2NsZWFycyBtYW5hZ2VkIHNldHRpbmdzIGFuZCBmaXJlcyB3aGVuIHRoZSBmaWxlIGlzIGRlbGV0ZWQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBpbk1lbW9yeVByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcigndnNjb2RlLXRlc3RzJywgaW5NZW1vcnlQcm92aWRlcikpO1xuXG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKG1hbmFnZWRTZXR0aW5nc0ZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0cGVybWlzc2lvbnM6IHsgZGlzYWJsZUJ5cGFzc1Blcm1pc3Npb25zTW9kZTogJ2Rpc2FibGUnIH1cblx0XHR9KSkpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UobWFuYWdlZFNldHRpbmdzRmlsZSwgZmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblxuXHRcdC8vIFdhaXQgZm9yIGluaXRpYWwgcmVhZFxuXHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0aWYgKE9iamVjdC5rZXlzKHNlcnZpY2UubWFuYWdlZFNldHRpbmdzKS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGxpc3RlbmVyID0gZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRDaGFuZ2VNYW5hZ2VkU2V0dGluZ3MoKCkgPT4ge1xuXHRcdFx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IGNoYW5nZVByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IGxpc3RlbmVyID0gZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRDaGFuZ2VNYW5hZ2VkU2V0dGluZ3MoKCkgPT4ge1xuXHRcdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdH0pKTtcblx0XHR9KTtcblxuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmRlbChtYW5hZ2VkU2V0dGluZ3NGaWxlKTtcblxuXHRcdGF3YWl0IGNoYW5nZVByb21pc2U7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UubWFuYWdlZFNldHRpbmdzLCB7fSk7XG5cdH0pKTtcbn0pO1xuXG5zdWl0ZSgnRmlsZU1hbmFnZWRTZXR0aW5nc0NoYW5uZWxDbGllbnQnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdrZWVwcyBuZXdlciBldmVudCBzdGF0ZSB3aGVuIHRoZSBpbml0aWFsIHNuYXBzaG90IHJlc29sdmVzIGxhdGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYW5uZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERlZmVycmVkTWFuYWdlZFNldHRpbmdzQ2hhbm5lbCgpKTtcblx0XHRjb25zdCBjbGllbnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVNYW5hZ2VkU2V0dGluZ3NDaGFubmVsQ2xpZW50KGNoYW5uZWwpKTtcblxuXHRcdC8vIEEgY2hhbmdlIGV2ZW50IGFycml2ZXMgYmVmb3JlIHRoZSBpbml0aWFsIGdldE1hbmFnZWRTZXR0aW5ncyBjYWxsIHJlc29sdmVzOyB0aGUgbGF0ZXIsXG5cdFx0Ly8gc3RhbGUgc25hcHNob3QgbXVzdCBub3QgY2xvYmJlciB0aGUgbmV3ZXIgZXZlbnQtZGVsaXZlcmVkIHN0YXRlLlxuXHRcdGNoYW5uZWwuZmlyZVJhdyh7IHBlcm1pc3Npb25zOiB7IGFsbG93OiBbJ1NoZWxsKGVjaG8gKiknXSB9IH0pO1xuXHRcdGNoYW5uZWwuZmlyZSh7IFtDT1BJTE9UX0RJU0FCTEVfQllQQVNTX1BFUk1JU1NJT05TX01PREVfS0VZXTogJ2Rpc2FibGUnIH0pO1xuXHRcdGNoYW5uZWwucmVzb2x2ZUluaXRpYWxSYXdTbmFwc2hvdCh7IHBlcm1pc3Npb25zOiB7IGRlbnk6IFsnU2hlbGwoZWNobyAqKSddIH0gfSk7XG5cdFx0Y2hhbm5lbC5yZXNvbHZlSW5pdGlhbFNuYXBzaG90KHsgW0NPUElMT1RfRElTQUJMRV9CWVBBU1NfUEVSTUlTU0lPTlNfTU9ERV9LRVldOiAnZW5hYmxlJyB9KTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbY2hhbm5lbC5pbml0aWFsUmF3U25hcHNob3QsIGNoYW5uZWwuaW5pdGlhbFNuYXBzaG90XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmF3OiBjbGllbnQucmF3TWFuYWdlZFNldHRpbmdzLCBub3JtYWxpemVkOiBjbGllbnQubWFuYWdlZFNldHRpbmdzIH0sIHtcblx0XHRcdHJhdzogeyBwZXJtaXNzaW9uczogeyBhbGxvdzogWydTaGVsbChlY2hvICopJ10gfSB9LFxuXHRcdFx0bm9ybWFsaXplZDogeyBbQ09QSUxPVF9ESVNBQkxFX0JZUEFTU19QRVJNSVNTSU9OU19NT0RFX0tFWV06ICdkaXNhYmxlJyB9LFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5jbGFzcyBEZWZlcnJlZE1hbmFnZWRTZXR0aW5nc0NoYW5uZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNoYW5uZWwge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVJhd01hbmFnZWRTZXR0aW5ncyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFJhd01hbmFnZWRTZXR0aW5nc0RhdGE+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU1hbmFnZWRTZXR0aW5ncyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPE1hbmFnZWRTZXR0aW5nc0RhdGE+KCkpO1xuXHRwcml2YXRlIHJlc29sdmVJbml0aWFsUmF3U25hcHNob3RQcm9taXNlITogKG1hbmFnZWRTZXR0aW5nczogUmF3TWFuYWdlZFNldHRpbmdzRGF0YSkgPT4gdm9pZDtcblx0cmVhZG9ubHkgaW5pdGlhbFJhd1NuYXBzaG90ID0gbmV3IFByb21pc2U8UmF3TWFuYWdlZFNldHRpbmdzRGF0YT4ocmVzb2x2ZSA9PiB0aGlzLnJlc29sdmVJbml0aWFsUmF3U25hcHNob3RQcm9taXNlID0gcmVzb2x2ZSk7XG5cdHByaXZhdGUgcmVzb2x2ZUluaXRpYWxTbmFwc2hvdFByb21pc2UhOiAobWFuYWdlZFNldHRpbmdzOiBNYW5hZ2VkU2V0dGluZ3NEYXRhKSA9PiB2b2lkO1xuXHRyZWFkb25seSBpbml0aWFsU25hcHNob3QgPSBuZXcgUHJvbWlzZTxNYW5hZ2VkU2V0dGluZ3NEYXRhPihyZXNvbHZlID0+IHRoaXMucmVzb2x2ZUluaXRpYWxTbmFwc2hvdFByb21pc2UgPSByZXNvbHZlKTtcblxuXHRjYWxsPFQ+KGNvbW1hbmQ6IHN0cmluZyk6IFByb21pc2U8VD4ge1xuXHRcdHN3aXRjaCAoY29tbWFuZCkge1xuXHRcdFx0Y2FzZSAnZ2V0UmF3TWFuYWdlZFNldHRpbmdzJzogcmV0dXJuIHRoaXMuaW5pdGlhbFJhd1NuYXBzaG90IGFzIFByb21pc2U8VD47XG5cdFx0XHRjYXNlICdnZXRNYW5hZ2VkU2V0dGluZ3MnOiByZXR1cm4gdGhpcy5pbml0aWFsU25hcHNob3QgYXMgUHJvbWlzZTxUPjtcblx0XHR9XG5cblx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbGwgbm90IGZvdW5kOiAke2NvbW1hbmR9YCk7XG5cdH1cblxuXHRsaXN0ZW48VD4oZXZlbnQ6IHN0cmluZyk6IEV2ZW50PFQ+IHtcblx0XHRzd2l0Y2ggKGV2ZW50KSB7XG5cdFx0XHRjYXNlICdvbkRpZENoYW5nZVJhd01hbmFnZWRTZXR0aW5ncyc6IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZVJhd01hbmFnZWRTZXR0aW5ncy5ldmVudCBhcyBFdmVudDxUPjtcblx0XHRcdGNhc2UgJ29uRGlkQ2hhbmdlTWFuYWdlZFNldHRpbmdzJzogcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlTWFuYWdlZFNldHRpbmdzLmV2ZW50IGFzIEV2ZW50PFQ+O1xuXHRcdH1cblxuXHRcdHRocm93IG5ldyBFcnJvcihgRXZlbnQgbm90IGZvdW5kOiAke2V2ZW50fWApO1xuXHR9XG5cblx0ZmlyZVJhdyhtYW5hZ2VkU2V0dGluZ3M6IFJhd01hbmFnZWRTZXR0aW5nc0RhdGEpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVJhd01hbmFnZWRTZXR0aW5ncy5maXJlKG1hbmFnZWRTZXR0aW5ncyk7XG5cdH1cblxuXHRmaXJlKG1hbmFnZWRTZXR0aW5nczogTWFuYWdlZFNldHRpbmdzRGF0YSk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlTWFuYWdlZFNldHRpbmdzLmZpcmUobWFuYWdlZFNldHRpbmdzKTtcblx0fVxuXG5cdHJlc29sdmVJbml0aWFsU25hcHNob3QobWFuYWdlZFNldHRpbmdzOiBNYW5hZ2VkU2V0dGluZ3NEYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5yZXNvbHZlSW5pdGlhbFNuYXBzaG90UHJvbWlzZShtYW5hZ2VkU2V0dGluZ3MpO1xuXHR9XG5cblx0cmVzb2x2ZUluaXRpYWxSYXdTbmFwc2hvdChtYW5hZ2VkU2V0dGluZ3M6IFJhd01hbmFnZWRTZXR0aW5nc0RhdGEpOiB2b2lkIHtcblx0XHR0aGlzLnJlc29sdmVJbml0aWFsUmF3U25hcHNob3RQcm9taXNlKG1hbmFnZWRTZXR0aW5ncyk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxrQkFBa0I7QUFHM0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQ0FBc0MsNENBQTRDLDZDQUE2Qyw2QkFBNkIsZ0NBQWdDLG1CQUFtQiw4Q0FBOEMsNkJBQTZCLG1CQUFtQixnQ0FBd0Q7QUFDOVcsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyx3Q0FBd0M7QUFFakQsTUFBTSw0QkFBNEIsTUFBTTtBQUV2QywwQ0FBd0M7QUFFeEMsT0FBSyx1Q0FBdUMsTUFBTTtBQUNqRCxVQUFNLFNBQVMseUJBQXlCO0FBQUEsTUFDdkMsYUFBYTtBQUFBLFFBQ1osOEJBQThCO0FBQUEsTUFDL0I7QUFBQSxJQUNELENBQUM7QUFDRCxXQUFPLGdCQUFnQixRQUFRO0FBQUEsTUFDOUIsNENB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
