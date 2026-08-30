import assert from "assert";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../../../base/test/common/timeTravelScheduler.js";
import { waitForState } from "../../../../../../base/common/observable.js";
import { FileService } from "../../../../../../platform/files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { TestContextService } from "../../../../../test/common/workbenchTestServices.js";
import { testWorkspace } from "../../../../../../platform/workspace/test/common/testWorkspace.js";
import { WorkspacePluginSettingsService } from "../../../common/plugins/workspacePluginSettingsService.js";
suite("WorkspacePluginSettingsService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const logService = new NullLogService();
  let fileService;
  let workspaceContextService;
  const workspaceRoot = URI.from({ scheme: Schemas.inMemory, path: "/workspace" });
  setup(() => {
    workspaceContextService = new TestContextService(testWorkspace(workspaceRoot));
    fileService = store.add(new FileService(logService));
    store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
  });
  function createService() {
    return store.add(new WorkspacePluginSettingsService(
      fileService,
      workspaceContextService,
      logService
    ));
  }
  async function writeClaudeSettings(content) {
    const uri = URI.from({ scheme: Schemas.inMemory, path: "/workspace/.claude/settings.json" });
    await fileService.writeFile(uri, VSBuffer.fromString(content));
  }
  async function writeClaudeLocalSettings(content) {
    const uri = URI.from({ scheme: Schemas.inMemory, path: "/workspace/.claude/settings.local.json" });
    await fileService.writeFile(uri, VSBuffer.fromString(content));
  }
  async function writeCopilotSettings(content) {
    const uri = URI.from({ scheme: Schemas.inMemory, path: "/workspace/.github/copilot/settings.json" });
    await fileService.writeFile(uri, VSBuffer.fromString(content));
  }
  test("parses enabledPlugins from Claude settings", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await writeClaudeSettings(JSON.stringify({
      enabledPlugins: {
        "my-plugin@my-marketplace": true,
        "disabled-plugin@my-marketplace": false
      }
    }));
    const service = createService();
    await waitForState(service.enabledPlugins, (v) => v.size > 0);
    const enabled = service.enabledPlugins.get();
    assert.strictEqual(enabled.get("my-plugin@my-marketplace"), true);
    assert.strictEqual(enabled.get("disabled-plugin@my-marketplace"), false);
    assert.strictEqual(enabled.size, 2);
  }));
  test("settings.local.json overrides settings.json for enabledPlugins", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await writeClaudeSettings(JSON.stringify({
      enabledPlugins: {
        "my-plugin@mp": true,
        "other-plugin@mp": true
      }
    }));
    await writeClaudeLocalSettings(JSON.stringify({
      enabledPlugins: {
        "my-plugin@mp": false
      }
    }));
    const service = createService();
    await waitForState(service.enabledPlugins, (v) => v.size > 0);
    const enabled = service.enabledPlugins.get();
    assert.strictEqual(enabled.get("my-plugin@mp"), false, "local should override shared");
    assert.strictEqual(enabled.get("other-plugin@mp"), true, "non-overridden key preserved");
  }));
  test("merges enabledPlugins from Claude and Copilot settings", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await writeClaudeSettings(JSON.stringify({
      enabledPlugins: { "from-claude@mp": true }
    }));
    await writeCopilotSettings(JSON.stringify({
      enabledPlugins: { "from-copilot@mp": true }
    }));
    const service = createService();
    await waitForState(service.enabledPlugins, (v) => v.size >= 2);
    const enabled = service.enabledPlugins.get();
    assert.strictEqual(enabled.get("from-claude@mp"), true);
    assert.strictEqual(enabled.get("from-copilot@mp"), true);
  }));
  test("Claude enabledPlugins take precedence over Copilot for same key", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await writeClaudeSettings(JSON.stringify({
      enabledPlugins: { "shared-plugin@mp": false }
    }));
    await writeCopilotSettings(JSON.stringify({
      enabledPlugins: { "shared-plugin@mp": true }
    }));
    const service = createService();
    await waitForState(service.enabledPlugins, (v) => v.size > 0);
    const enabled = service.enabledPlugins.get();
    assert.strictEqual(enabled.get("shared-plugin@mp"), false, "Claude should win");
  }));
  test("parses GitHub shorthand from extraKnownMarketplaces", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await writeClaudeSettings(JSON.stringify({
      extraKnownMarketplaces: {
        "my-marketplace": {
          source: "github",
          repo: "owner/repo"
        }
      }
    }));
    const service = createService();
    await waitForState(service.extraMarketplaces, (v) => v.length > 0);
    const marketplaces = service.extraMarketplaces.get();
    assert.strictEqual(marketplaces.length, 1);
    assert.strictEqual(marketplaces[0].name, "my-marketplace");
    assert.strictEqual(marketplaces[0].reference.displayLabel, "my-marketplace");
    assert.strictEqual(marketplaces[0].reference.githubRepo, "owner/repo");
  }));
  test("parses marketplace refs from extraKnownMarketplaces", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await writeClaudeSettings(JSON.stringify({
      extraKnownMarketplaces: {
        "my-marketplace": {
          source: "github",
          repo: "owner/repo",
          ref: "marketplace"
        }
      }
    }));
    const service = createService();
    await waitForState(service.extraMarketplaces, (v) => v.length > 0);
    const marketplaces = service.extraMarketplaces.get();
    assert.strictEqual(marketplaces[0].reference.ref, "marketplace");
    assert.strictEqual(marketplaces[0].reference.canonicalId, "github:owner/repo#marketplace");
  }));
  test("parses nested source object from extraKnownMarketplaces", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await writeClaudeSettings(JSON.stringify({
      extraKnownMarketplaces: {
        "nested-mp": {
          source: {
            source: "github",
            repo: "nested-owner/nested-repo"
          }
        }
      }
    }));
    const service = createService();
    await waitForState(service.extraMarketplaces, (v) => v.length > 0);
    const marketplaces = service.extraMarketplaces.get();
    assert.strictEqual(marketplaces.length, 1);
    assert.strictEqual(marketplaces[0].reference.githubRepo, "nested-owner/nested-repo");
    assert.strictEqual(marketplaces[0].reference.displayLabel, "nested-mp");
  }));
  test("deduplicates marketplaces across Claude and Copilot by canonical ID", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await writeClaudeSettings(JSON.stringify({
      extraKnownMarketplaces: {
        "claude-name": { source: "github", repo: "owner/repo" }
      }
    }));
    await writeCopilotSettings(JSON.stringify({
      extraKnownMarketplaces: {
        "copilot-name": { source: "github", repo: "owner/repo" }
      }
    }));
    const service = createService();
    await waitForState(service.extraMarketplaces, (v) => v.length > 0);
    const marketplaces = service.extraMarketplaces.get();
    assert.strictEqual(marketplaces.length, 1, "should deduplicate by canonical ID");
    assert.strictEqual(marketplaces[0].name, "claude-name", "Claude entry should win");
  }));
  test("ignores invalid enabledPlugins shapes", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await writeClaudeSettings(JSON.stringify({
      enabledPlugins: "not-an-object"
    }));
    const service = createService();
    await new Promise((r) => queueMicrotask(r));
    assert.strictEqual(service.enabledPlugins.get().size, 0);
  }));
  test("ignores non-boolean values in enabledPlugins", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await writeClaudeSettings(JSON.stringify({
      enabledPlugins: {
        "valid@mp": true,
        "number@mp": 42,
        "string@mp": "yes"
      }
    }));
    const service = createService();
    await waitForState(service.enabledPlugins, (v) => v.size > 0);
    const enabled = service.enabledPlugins.get();
    assert.strictEqual(enabled.size, 1);
    assert.strictEqual(enabled.get("valid@mp"), true);
  }));
  test("ignores non-object marketplace entries", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await writeClaudeSettings(JSON.stringify({
      extraKnownMarketplaces: {
        "valid": { source: "github", repo: "owner/repo" },
        "invalid-string": "not-valid",
        "invalid-number": 42
      }
    }));
    const service = createService();
    await waitForState(service.extraMarketplaces, (v) => v.length > 0);
    const marketplaces = service.extraMarketplaces.get();
    assert.strictEqual(marketplaces.length, 1);
    assert.strictEqual(marketplaces[0].name, "valid");
  }));
  test("returns empty observables when no settings files exist", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const service = createService();
    await new Promise((r) => queueMicrotask(r));
    assert.strictEqual(service.enabledPlugins.get().size, 0);
    assert.strictEqual(service.extraMarketplaces.get().length, 0);
  }));
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxccGx1Z2luc1xcd29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgd2FpdEZvclN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFRlc3RDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyB0ZXN0V29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL3Rlc3QvY29tbW9uL3Rlc3RXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgV29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BsdWdpbnMvd29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlLmpzJztcblxuc3VpdGUoJ1dvcmtzcGFjZVBsdWdpblNldHRpbmdzU2VydmljZScsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXG5cdGxldCBmaWxlU2VydmljZTogRmlsZVNlcnZpY2U7XG5cdGxldCB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogVGVzdENvbnRleHRTZXJ2aWNlO1xuXHRjb25zdCB3b3Jrc3BhY2VSb290ID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvd29ya3NwYWNlJyB9KTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2UgPSBuZXcgVGVzdENvbnRleHRTZXJ2aWNlKHRlc3RXb3Jrc3BhY2Uod29ya3NwYWNlUm9vdCkpO1xuXHRcdGZpbGVTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBGaWxlU2VydmljZShsb2dTZXJ2aWNlKSk7XG5cdFx0c3RvcmUuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5pbk1lbW9yeSwgc3RvcmUuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBjcmVhdGVTZXJ2aWNlKCk6IFdvcmtzcGFjZVBsdWdpblNldHRpbmdzU2VydmljZSB7XG5cdFx0cmV0dXJuIHN0b3JlLmFkZChuZXcgV29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlKFxuXHRcdFx0ZmlsZVNlcnZpY2UsXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRcdGxvZ1NlcnZpY2UsXG5cdFx0KSk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiB3cml0ZUNsYXVkZVNldHRpbmdzKGNvbnRlbnQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3dvcmtzcGFjZS8uY2xhdWRlL3NldHRpbmdzLmpzb24nIH0pO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZSh1cmksIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gd3JpdGVDbGF1ZGVMb2NhbFNldHRpbmdzKGNvbnRlbnQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3dvcmtzcGFjZS8uY2xhdWRlL3NldHRpbmdzLmxvY2FsLmpzb24nIH0pO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZSh1cmksIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gd3JpdGVDb3BpbG90U2V0dGluZ3MoY29udGVudDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvd29ya3NwYWNlLy5naXRodWIvY29waWxvdC9zZXR0aW5ncy5qc29uJyB9KTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUodXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblx0fVxuXG5cdC8vIC0tLSBlbmFibGVkUGx1Z2lucyBwYXJzaW5nIC0tLVxuXG5cdHRlc3QoJ3BhcnNlcyBlbmFibGVkUGx1Z2lucyBmcm9tIENsYXVkZSBzZXR0aW5ncycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdyaXRlQ2xhdWRlU2V0dGluZ3MoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0ZW5hYmxlZFBsdWdpbnM6IHtcblx0XHRcdFx0J215LXBsdWdpbkBteS1tYXJrZXRwbGFjZSc6IHRydWUsXG5cdFx0XHRcdCdkaXNhYmxlZC1wbHVnaW5AbXktbWFya2V0cGxhY2UnOiBmYWxzZSxcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzZXJ2aWNlLmVuYWJsZWRQbHVnaW5zLCB2ID0+IHYuc2l6ZSA+IDApO1xuXG5cdFx0Y29uc3QgZW5hYmxlZCA9IHNlcnZpY2UuZW5hYmxlZFBsdWdpbnMuZ2V0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuYWJsZWQuZ2V0KCdteS1wbHVnaW5AbXktbWFya2V0cGxhY2UnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuYWJsZWQuZ2V0KCdkaXNhYmxlZC1wbHVnaW5AbXktbWFya2V0cGxhY2UnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmFibGVkLnNpemUsIDIpO1xuXHR9KSk7XG5cblx0dGVzdCgnc2V0dGluZ3MubG9jYWwuanNvbiBvdmVycmlkZXMgc2V0dGluZ3MuanNvbiBmb3IgZW5hYmxlZFBsdWdpbnMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3cml0ZUNsYXVkZVNldHRpbmdzKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdGVuYWJsZWRQbHVnaW5zOiB7XG5cdFx0XHRcdCdteS1wbHVnaW5AbXAnOiB0cnVlLFxuXHRcdFx0XHQnb3RoZXItcGx1Z2luQG1wJzogdHJ1ZSxcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0YXdhaXQgd3JpdGVDbGF1ZGVMb2NhbFNldHRpbmdzKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdGVuYWJsZWRQbHVnaW5zOiB7XG5cdFx0XHRcdCdteS1wbHVnaW5AbXAnOiBmYWxzZSxcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzZXJ2aWNlLmVuYWJsZWRQbHVnaW5zLCB2ID0+IHYuc2l6ZSA+IDApO1xuXG5cdFx0Y29uc3QgZW5hYmxlZCA9IHNlcnZpY2UuZW5hYmxlZFBsdWdpbnMuZ2V0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuYWJsZWQuZ2V0KCdteS1wbHVnaW5AbXAnKSwgZmFsc2UsICdsb2NhbCBzaG91bGQgb3ZlcnJpZGUgc2hhcmVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuYWJsZWQuZ2V0KCdvdGhlci1wbHVnaW5AbXAnKSwgdHJ1ZSwgJ25vbi1vdmVycmlkZGVuIGtleSBwcmVzZXJ2ZWQnKTtcblx0fSkpO1xuXG5cdHRlc3QoJ21lcmdlcyBlbmFibGVkUGx1Z2lucyBmcm9tIENsYXVkZSBhbmQgQ29waWxvdCBzZXR0aW5ncycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdyaXRlQ2xhdWRlU2V0dGluZ3MoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0ZW5hYmxlZFBsdWdpbnM6IHsgJ2Zyb20tY2xhdWRlQG1wJzogdHJ1ZSB9XG5cdFx0fSkpO1xuXHRcdGF3YWl0IHdyaXRlQ29waWxvdFNldHRpbmdzKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdGVuYWJsZWRQbHVnaW5zOiB7ICdmcm9tLWNvcGlsb3RAbXAnOiB0cnVlIH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzZXJ2aWNlLmVuYWJsZWRQbHVnaW5zLCB2ID0+IHYuc2l6ZSA+PSAyKTtcblxuXHRcdGNvbnN0IGVuYWJsZWQgPSBzZXJ2aWNlLmVuYWJsZWRQbHVnaW5zLmdldCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmFibGVkLmdldCgnZnJvbS1jbGF1ZGVAbXAnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuYWJsZWQuZ2V0KCdmcm9tLWNvcGlsb3RAbXAnKSwgdHJ1ZSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdDbGF1ZGUgZW5hYmxlZFBsdWdpbnMgdGFrZSBwcmVjZWRlbmNlIG92ZXIgQ29waWxvdCBmb3Igc2FtZSBrZXknLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3cml0ZUNsYXVkZVNldHRpbmdzKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdGVuYWJsZWRQbHVnaW5zOiB7ICdzaGFyZWQtcGx1Z2luQG1wJzogZmFsc2UgfVxuXHRcdH0pKTtcblx0XHRhd2FpdCB3cml0ZUNvcGlsb3RTZXR0aW5ncyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRlbmFibGVkUGx1Z2luczogeyAnc2hhcmVkLXBsdWdpbkBtcCc6IHRydWUgfVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHNlcnZpY2UuZW5hYmxlZFBsdWdpbnMsIHYgPT4gdi5zaXplID4gMCk7XG5cblx0XHRjb25zdCBlbmFibGVkID0gc2VydmljZS5lbmFibGVkUGx1Z2lucy5nZXQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5hYmxlZC5nZXQoJ3NoYXJlZC1wbHVnaW5AbXAnKSwgZmFsc2UsICdDbGF1ZGUgc2hvdWxkIHdpbicpO1xuXHR9KSk7XG5cblx0Ly8gLS0tIGV4dHJhS25vd25NYXJrZXRwbGFjZXMgcGFyc2luZyAtLS1cblxuXHR0ZXN0KCdwYXJzZXMgR2l0SHViIHNob3J0aGFuZCBmcm9tIGV4dHJhS25vd25NYXJrZXRwbGFjZXMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3cml0ZUNsYXVkZVNldHRpbmdzKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdGV4dHJhS25vd25NYXJrZXRwbGFjZXM6IHtcblx0XHRcdFx0J215LW1hcmtldHBsYWNlJzoge1xuXHRcdFx0XHRcdHNvdXJjZTogJ2dpdGh1YicsXG5cdFx0XHRcdFx0cmVwbzogJ293bmVyL3JlcG8nLFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUoc2VydmljZS5leHRyYU1hcmtldHBsYWNlcywgdiA9PiB2Lmxlbmd0aCA+IDApO1xuXG5cdFx0Y29uc3QgbWFya2V0cGxhY2VzID0gc2VydmljZS5leHRyYU1hcmtldHBsYWNlcy5nZXQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2V0cGxhY2VzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtldHBsYWNlc1swXS5uYW1lLCAnbXktbWFya2V0cGxhY2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2V0cGxhY2VzWzBdLnJlZmVyZW5jZS5kaXNwbGF5TGFiZWwsICdteS1tYXJrZXRwbGFjZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXRwbGFjZXNbMF0ucmVmZXJlbmNlLmdpdGh1YlJlcG8sICdvd25lci9yZXBvJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdwYXJzZXMgbWFya2V0cGxhY2UgcmVmcyBmcm9tIGV4dHJhS25vd25NYXJrZXRwbGFjZXMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3cml0ZUNsYXVkZVNldHRpbmdzKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdGV4dHJhS25vd25NYXJrZXRwbGFjZXM6IHtcblx0XHRcdFx0J215LW1hcmtldHBsYWNlJzoge1xuXHRcdFx0XHRcdHNvdXJjZTogJ2dpdGh1YicsXG5cdFx0XHRcdFx0cmVwbzogJ293bmVyL3JlcG8nLFxuXHRcdFx0XHRcdHJlZjogJ21hcmtldHBsYWNlJyxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHNlcnZpY2UuZXh0cmFNYXJrZXRwbGFjZXMsIHYgPT4gdi5sZW5ndGggPiAwKTtcblxuXHRcdGNvbnN0IG1hcmtldHBsYWNlcyA9IHNlcnZpY2UuZXh0cmFNYXJrZXRwbGFjZXMuZ2V0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtldHBsYWNlc1swXS5yZWZlcmVuY2UucmVmLCAnbWFya2V0cGxhY2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2V0cGxhY2VzWzBdLnJlZmVyZW5jZS5jYW5vbmljYWxJZCwgJ2dpdGh1Yjpvd25lci9yZXBvI21hcmtldHBsYWNlJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdwYXJzZXMgbmVzdGVkIHNvdXJjZSBvYmplY3QgZnJvbSBleHRyYUtub3duTWFya2V0cGxhY2VzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd3JpdGVDbGF1ZGVTZXR0aW5ncyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRleHRyYUtub3duTWFya2V0cGxhY2VzOiB7XG5cdFx0XHRcdCduZXN0ZWQtbXAnOiB7XG5cdFx0XHRcdFx0c291cmNlOiB7XG5cdFx0XHRcdFx0XHRzb3VyY2U6ICdnaXRodWInLFxuXHRcdFx0XHRcdFx0cmVwbzogJ25lc3RlZC1vd25lci9uZXN0ZWQtcmVwbycsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUoc2VydmljZS5leHRyYU1hcmtldHBsYWNlcywgdiA9PiB2Lmxlbmd0aCA+IDApO1xuXG5cdFx0Y29uc3QgbWFya2V0cGxhY2VzID0gc2VydmljZS5leHRyYU1hcmtldHBsYWNlcy5nZXQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2V0cGxhY2VzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtldHBsYWNlc1swXS5yZWZlcmVuY2UuZ2l0aHViUmVwbywgJ25lc3RlZC1vd25lci9uZXN0ZWQtcmVwbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXRwbGFjZXNbMF0ucmVmZXJlbmNlLmRpc3BsYXlMYWJlbCwgJ25lc3RlZC1tcCcpO1xuXHR9KSk7XG5cblx0dGVzdCgnZGVkdXBsaWNhdGVzIG1hcmtldHBsYWNlcyBhY3Jvc3MgQ2xhdWRlIGFuZCBDb3BpbG90IGJ5IGNhbm9uaWNhbCBJRCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdyaXRlQ2xhdWRlU2V0dGluZ3MoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0ZXh0cmFLbm93bk1hcmtldHBsYWNlczoge1xuXHRcdFx0XHQnY2xhdWRlLW5hbWUnOiB7IHNvdXJjZTogJ2dpdGh1YicsIHJlcG86ICdvd25lci9yZXBvJyB9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGF3YWl0IHdyaXRlQ29waWxvdFNldHRpbmdzKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdGV4dHJhS25vd25NYXJrZXRwbGFjZXM6IHtcblx0XHRcdFx0J2NvcGlsb3QtbmFtZSc6IHsgc291cmNlOiAnZ2l0aHViJywgcmVwbzogJ293bmVyL3JlcG8nIH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzZXJ2aWNlLmV4dHJhTWFya2V0cGxhY2VzLCB2ID0+IHYubGVuZ3RoID4gMCk7XG5cblx0XHRjb25zdCBtYXJrZXRwbGFjZXMgPSBzZXJ2aWNlLmV4dHJhTWFya2V0cGxhY2VzLmdldCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXRwbGFjZXMubGVuZ3RoLCAxLCAnc2hvdWxkIGRlZHVwbGljYXRlIGJ5IGNhbm9uaWNhbCBJRCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXRwbGFjZXNbMF0ubmFtZSwgJ2NsYXVkZS1uYW1lJywgJ0NsYXVkZSBlbnRyeSBzaG91bGQgd2luJyk7XG5cdH0pKTtcblxuXHQvLyAtLS0gSW52YWxpZCBpbnB1dCBoYW5kbGluZyAtLS1cblxuXHR0ZXN0KCdpZ25vcmVzIGludmFsaWQgZW5hYmxlZFBsdWdpbnMgc2hhcGVzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd3JpdGVDbGF1ZGVTZXR0aW5ncyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRlbmFibGVkUGx1Z2luczogJ25vdC1hbi1vYmplY3QnXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHQvLyBHaXZlIHRoZSBhc3luYyByZWFkIGEgY2hhbmNlIHRvIGNvbXBsZXRlIHdpdGggZmFrZWQgdGltZXJzLlxuXHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4gcXVldWVNaWNyb3Rhc2socikpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZW5hYmxlZFBsdWdpbnMuZ2V0KCkuc2l6ZSwgMCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdpZ25vcmVzIG5vbi1ib29sZWFuIHZhbHVlcyBpbiBlbmFibGVkUGx1Z2lucycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdyaXRlQ2xhdWRlU2V0dGluZ3MoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0ZW5hYmxlZFBsdWdpbnM6IHtcblx0XHRcdFx0J3ZhbGlkQG1wJzogdHJ1ZSxcblx0XHRcdFx0J251bWJlckBtcCc6IDQyLFxuXHRcdFx0XHQnc3RyaW5nQG1wJzogJ3llcycsXG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUoc2VydmljZS5lbmFibGVkUGx1Z2lucywgdiA9PiB2LnNpemUgPiAwKTtcblxuXHRcdGNvbnN0IGVuYWJsZWQgPSBzZXJ2aWNlLmVuYWJsZWRQbHVnaW5zLmdldCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmFibGVkLnNpemUsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmFibGVkLmdldCgndmFsaWRAbXAnKSwgdHJ1ZSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdpZ25vcmVzIG5vbi1vYmplY3QgbWFya2V0cGxhY2UgZW50cmllcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdyaXRlQ2xhdWRlU2V0dGluZ3MoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0ZXh0cmFLbm93bk1hcmtldHBsYWNlczoge1xuXHRcdFx0XHQndmFsaWQnOiB7IHNvdXJjZTogJ2dpdGh1YicsIHJlcG86ICdvd25lci9yZXBvJyB9LFxuXHRcdFx0XHQnaW52YWxpZC1zdHJpbmcnOiAnbm90LXZhbGlkJyxcblx0XHRcdFx0J2ludmFsaWQtbnVtYmVyJzogNDIsXG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUoc2VydmljZS5leHRyYU1hcmtldHBsYWNlcywgdiA9PiB2Lmxlbmd0aCA+IDApO1xuXG5cdFx0Y29uc3QgbWFya2V0cGxhY2VzID0gc2VydmljZS5leHRyYU1hcmtldHBsYWNlcy5nZXQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2V0cGxhY2VzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtldHBsYWNlc1swXS5uYW1lLCAndmFsaWQnKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3JldHVybnMgZW1wdHkgb2JzZXJ2YWJsZXMgd2hlbiBubyBzZXR0aW5ncyBmaWxlcyBleGlzdCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ociA9PiBxdWV1ZU1pY3JvdGFzayhyKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5lbmFibGVkUGx1Z2lucy5nZXQoKS5zaXplLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5leHRyYU1hcmtldHBsYWNlcy5nZXQoKS5sZW5ndGgsIDApO1xuXHR9KSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsc0NBQXNDO0FBRS9DLE1BQU0sa0NBQWtDLE1BQU07QUFDN0MsUUFBTSxRQUFRLHdDQUF3QztBQUN0RCxRQUFNLGFBQWEsSUFBSSxlQUFlO0FBRXRDLE1BQUk7QUFDSixNQUFJO0FBQ0osUUFBTSxnQkFBZ0IsSUFBSSxLQUFLLEVBQUUsUUFBUSxRQUFRLFVBQVUsTUFBTSxhQUFhLENBQUM7QUFFL0UsUUFBTSxNQUFNO0FBQ1gsOEJBQTBCLElBQUksbUJBQW1CLGNBQWMsYUFBYSxDQUFDO0FBQzdFLGtCQUFjLE1BQU0sSUFBSSxJQUFJLFlBQVksVUFBVSxDQUFDO0FBQ25ELFVBQU0sSUFBSSxZQUFZLGlCQUFpQixRQUFRLFVBQVUsTUFBTSxJ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
