import assert from "assert";
import { CancellationError } from "../../../../../base/common/errors.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ConfigurationTarget } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import {
  AgentHostAccessMode,
  AgentHostPermissionMode,
  AgentHostLocalFilePermissionsSettingId,
  LOCAL_AGENT_HOST_RESOURCE_IDENTITY
} from "../../../../../platform/agentHost/common/agentHostResourceService.js";
import { AgentHostResourceService } from "../../common/agentHostResourceService.js";
const stubTextModelService = {};
class CapturingConfigurationService extends TestConfigurationService {
  async updateValue(key, value, arg3) {
    const target = typeof arg3 === "number" ? arg3 : void 0;
    this.lastUpdate = { key, value, target };
    await this.setUserConfiguration(key, value);
  }
}
function createStubFileService(opts) {
  return {
    realpath: async (resource) => opts?.realpathReturns ? opts.realpathReturns(resource) : resource
  };
}
suite("AgentHostResourceService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function createService(initial, fileService = createStubFileService()) {
    const config = new CapturingConfigurationService();
    if (initial) {
      void config.setUserConfiguration(AgentHostLocalFilePermissionsSettingId, initial);
    }
    const service = disposables.add(new AgentHostResourceService(config, fileService, stubTextModelService, new NullLogService()));
    return { service, config };
  }
  test("check denies when no grant exists", async () => {
    const { service } = createService();
    assert.strictEqual(await service.check("host", URI.file("/etc/passwd"), AgentHostPermissionMode.Read), false);
    assert.strictEqual(await service.check("host", URI.file("/etc/passwd"), AgentHostPermissionMode.Write), false);
  });
  test("trusted local identity cannot be spoofed by a remote local address", async () => {
    const { service } = createService();
    const uri = URI.file("/etc/passwd");
    assert.deepStrictEqual({
      trustedLocal: await service.check(LOCAL_AGENT_HOST_RESOURCE_IDENTITY, uri, AgentHostPermissionMode.Write),
      remoteLocal: await service.check("local", uri, AgentHostPermissionMode.Read),
      normalizedRemoteLocal: await service.check("ws://local", uri, AgentHostPermissionMode.Read)
    }, {
      trustedLocal: true,
      remoteLocal: false,
      normalizedRemoteLocal: false
    });
  });
  test("remote local address uses the normal permission request flow", async () => {
    const { service } = createService();
    const uri = URI.file("/etc/passwd");
    const promise = service.request("ws://local", { channel: "ahp-root://", uri: uri.toString(), read: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const [pending] = service.allPending.get();
    assert.deepStrictEqual({
      address: pending.address,
      uri: pending.uri.toString(),
      mode: pending.mode
    }, {
      address: "local",
      uri: uri.toString(),
      mode: AgentHostPermissionMode.Read
    });
    pending.deny();
    await assert.rejects(promise, (err) => err instanceof CancellationError);
  });
  test("implicit read grant covers descendants but not parent or sibling", async () => {
    const { service } = createService();
    disposables.add(service.grantImplicitRead("host", URI.file("/plugins/foo")));
    assert.strictEqual(await service.check("host", URI.file("/plugins/foo"), AgentHostPermissionMode.Read), true);
    assert.strictEqual(await service.check("host", URI.file("/plugins/foo/skill.md"), AgentHostPermissionMode.Read), true);
    assert.strictEqual(await service.check("host", URI.file("/plugins"), AgentHostPermissionMode.Read), false);
    assert.strictEqual(await service.check("host", URI.file("/plugins/bar"), AgentHostPermissionMode.Read), false);
  });
  test("implicit grant does not allow write", async () => {
    const { service } = createService();
    disposables.add(service.grantImplicitRead("host", URI.file("/plugins/foo")));
    assert.strictEqual(await service.check("host", URI.file("/plugins/foo"), AgentHostPermissionMode.Write), false);
  });
  test('persisted "r" allows read, denies write', async () => {
    const { service } = createService({
      "host": {
        [URI.file("/etc/foo").toString()]: AgentHostAccessMode.Read
      }
    });
    assert.strictEqual(await service.check("host", URI.file("/etc/foo"), AgentHostPermissionMode.Read), true);
    assert.strictEqual(await service.check("host", URI.file("/etc/foo/bar"), AgentHostPermissionMode.Read), true);
    assert.strictEqual(await service.check("host", URI.file("/etc/foo"), AgentHostPermissionMode.Write), false);
  });
  test('persisted "rw" allows read and write', async () => {
    const { service } = createService({
      "host": {
        [URI.file("/etc/foo").toString()]: AgentHostAccessMode.ReadWrite
      }
    });
    assert.strictEqual(await service.check("host", URI.file("/etc/foo"), AgentHostPermissionMode.Read), true);
    assert.strictEqual(await service.check("host", URI.file("/etc/foo"), AgentHostPermissionMode.Write), true);
    assert.strictEqual(await service.check("host", URI.file("/etc/foo/bar"), AgentHostPermissionMode.Write), true);
  });
  test("check canonicalizes via realpath so symlink to outside the grant is denied", async () => {
    const fileService = createStubFileService({
      realpathReturns: (uri) => uri.path.startsWith("/safe/sym") ? URI.file("/sensitive" + uri.path.slice("/safe/sym".length)) : uri
    });
    const { service } = createService(void 0, fileService);
    disposables.add(service.grantImplicitRead("host", URI.file("/safe")));
    assert.strictEqual(await service.check("host", URI.file("/safe/foo"), AgentHostPermissionMode.Read), true);
    assert.strictEqual(await service.check("host", URI.file("/safe/sym/leak"), AgentHostPermissionMode.Read), false);
  });
  test("implicit grant for a symlinked directory still covers descendants resolved through the symlink", async () => {
    const fileService = createStubFileService({
      realpathReturns: (uri) => uri.path.startsWith("/safe/sym") ? URI.file("/real" + uri.path.slice("/safe/sym".length)) : uri
    });
    const { service } = createService(void 0, fileService);
    disposables.add(service.grantImplicitRead("host", URI.file("/safe/sym")));
    assert.strictEqual(await service.check("host", URI.file("/safe/sym/leaf"), AgentHostPermissionMode.Read), true);
  });
  test("check rejects path traversal via .. segments", async () => {
    const { service } = createService();
    disposables.add(service.grantImplicitRead("host", URI.file("/safe")));
    assert.strictEqual(await service.check("host", URI.file("/safe/../etc/passwd"), AgentHostPermissionMode.Read), false);
  });
  test("check canonicalizes nonexistent paths via the parent realpath", async () => {
    const fileService = createStubFileService({
      realpathReturns: (uri) => {
        if (uri.path === "/safe/sym/new.txt") {
          return void 0;
        }
        if (uri.path === "/safe/sym") {
          return URI.file("/real");
        }
        return uri;
      }
    });
    const { service } = createService(void 0, fileService);
    disposables.add(service.grantImplicitRead("host", URI.file("/real")));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(
      await service.check("host", URI.file("/safe/sym/new.txt"), AgentHostPermissionMode.Read),
      true,
      "nonexistent file under a symlinked parent should canonicalize to /real/new.txt"
    );
  });
  test("request resolves immediately when already granted", async () => {
    const { service } = createService();
    disposables.add(service.grantImplicitRead("host", URI.file("/plugins/foo")));
    await service.request("host", { channel: "ahp-root://", uri: URI.file("/plugins/foo/x.md").toString(), read: true });
    assert.strictEqual(service.allPending.get().length, 0);
  });
  test("allow grants in-memory until connection closes", async () => {
    const { service, config } = createService();
    const uri = URI.file("/etc/foo");
    const promise = service.request("host", { channel: "ahp-root://", uri: uri.toString(), read: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const pending = service.allPending.get();
    assert.strictEqual(pending.length, 1);
    pending[0].allow();
    await promise;
    assert.strictEqual(await service.check("host", uri, AgentHostPermissionMode.Read), true);
    assert.strictEqual(config.lastUpdate, void 0);
    service.connectionClosed("host");
    assert.strictEqual(await service.check("host", uri, AgentHostPermissionMode.Read), false);
  });
  test("allow for write also covers read on the same URI", async () => {
    const { service } = createService();
    const promise = service.request("host", { channel: "ahp-root://", uri: URI.file("/etc/foo").toString(), write: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const pending = service.allPending.get();
    assert.strictEqual(pending[0].mode, AgentHostPermissionMode.Write);
    pending[0].allow();
    await promise;
    assert.strictEqual(await service.check("host", URI.file("/etc/foo"), AgentHostPermissionMode.Write), true);
    assert.strictEqual(await service.check("host", URI.file("/etc/foo"), AgentHostPermissionMode.Read), true);
    assert.strictEqual(await service.check("host", URI.file("/etc/bar"), AgentHostPermissionMode.Read), false);
  });
  test("allow for read does not grant write", async () => {
    const { service } = createService();
    const promise = service.request("host", { channel: "ahp-root://", uri: URI.file("/etc/foo").toString(), read: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    service.allPending.get()[0].allow();
    await promise;
    assert.strictEqual(await service.check("host", URI.file("/etc/foo"), AgentHostPermissionMode.Read), true);
    assert.strictEqual(await service.check("host", URI.file("/etc/foo"), AgentHostPermissionMode.Write), false);
  });
  test("request rejects with CancellationError on deny", async () => {
    const { service } = createService();
    const promise = service.request("host", { channel: "ahp-root://", uri: URI.file("/etc/foo").toString(), read: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    service.allPending.get()[0].deny();
    await assert.rejects(promise, (err) => err instanceof CancellationError);
  });
  test("allowAlways persists the grant", async () => {
    const { service, config } = createService();
    const promise = service.request("host", { channel: "ahp-root://", uri: URI.file("/etc/foo").toString(), read: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    service.allPending.get()[0].allowAlways();
    await promise;
    assert.strictEqual(config.lastUpdate?.key, AgentHostLocalFilePermissionsSettingId);
    const value = config.lastUpdate.value;
    assert.strictEqual(value["host"][URI.file("/etc/foo").toString()], AgentHostAccessMode.Read);
  });
  test("allowAlways covers immediate retry without waiting for the settings write", async () => {
    const config = new class extends CapturingConfigurationService {
      async updateValue(key, value, target) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        await super.updateValue(key, value, target);
      }
    }();
    const service = disposables.add(new AgentHostResourceService(config, createStubFileService(), stubTextModelService, new NullLogService()));
    const uri = URI.file("/etc/foo");
    const promise = service.request("host", { channel: "ahp-root://", uri: uri.toString(), read: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    service.allPending.get()[0].allowAlways();
    await promise;
    assert.strictEqual(await service.check("host", uri, AgentHostPermissionMode.Read), true);
  });
  test("allowAlways for write persists rw", async () => {
    const { service, config } = createService();
    const promise = service.request("host", { channel: "ahp-root://", uri: URI.file("/etc/foo").toString(), write: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    service.allPending.get()[0].allowAlways();
    await promise;
    const value = config.lastUpdate?.value;
    assert.strictEqual(value["host"][URI.file("/etc/foo").toString()], AgentHostAccessMode.ReadWrite);
  });
  test("allowAlways skips persistence when covered by parent grant", async () => {
    const { service, config } = createService({
      "host": {
        [URI.file("/etc").toString()]: AgentHostAccessMode.ReadWrite
      }
    });
    await service.request("host", { channel: "ahp-root://", uri: URI.file("/etc/foo").toString(), read: true });
    assert.strictEqual(config.lastUpdate, void 0);
  });
  test("concurrent identical requests share one pending entry", async () => {
    const { service } = createService();
    const a = service.request("host", { channel: "ahp-root://", uri: URI.file("/etc/foo").toString(), read: true });
    const b = service.request("host", { channel: "ahp-root://", uri: URI.file("/etc/foo").toString(), read: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(service.allPending.get().length, 1);
    service.allPending.get()[0].allow();
    await Promise.all([a, b]);
  });
  test("write request that already has read grant still prompts for write", async () => {
    const { service } = createService({
      "host": {
        [URI.file("/etc/foo").toString()]: AgentHostAccessMode.Read
      }
    });
    const promise = service.request("host", { channel: "ahp-root://", uri: URI.file("/etc/foo").toString(), write: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(service.allPending.get().length, 1);
    assert.strictEqual(service.allPending.get()[0].mode, AgentHostPermissionMode.Write);
    service.allPending.get()[0].allow();
    await promise;
  });
  test("connectionClosed rejects pending and clears the queue", async () => {
    const { service } = createService();
    const promise = service.request("host", { channel: "ahp-root://", uri: URI.file("/etc/foo").toString(), read: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    service.connectionClosed("host");
    await assert.rejects(promise, (err) => err instanceof CancellationError);
    assert.strictEqual(service.allPending.get().length, 0);
  });
  test("connectionClosed drops implicit grants", async () => {
    const { service } = createService();
    disposables.add(service.grantImplicitRead("host", URI.file("/plugins/foo")));
    assert.strictEqual(await service.check("host", URI.file("/plugins/foo/x"), AgentHostPermissionMode.Read), true);
    service.connectionClosed("host");
    assert.strictEqual(await service.check("host", URI.file("/plugins/foo/x"), AgentHostPermissionMode.Read), false);
  });
  test("address normalization strips ws:// prefix", async () => {
    const { service } = createService({
      "host:1234": {
        [URI.file("/etc/foo").toString()]: AgentHostAccessMode.Read
      }
    });
    assert.strictEqual(await service.check("ws://host:1234", URI.file("/etc/foo"), AgentHostPermissionMode.Read), true);
    assert.strictEqual(await service.check("host:1234", URI.file("/etc/foo"), AgentHostPermissionMode.Read), true);
  });
  test("findPending returns the pending request by id", async () => {
    const { service } = createService();
    const promise = service.request("host", { channel: "ahp-root://", uri: URI.file("/etc/foo").toString(), read: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const [pending] = service.allPending.get();
    assert.strictEqual(service.findPending(pending.id), pending);
    pending.allow();
    await promise;
  });
  test("grants for one host do not leak into another host", async () => {
    const { service } = createService({
      "host-a": {
        [URI.file("/etc/foo").toString()]: AgentHostAccessMode.ReadWrite
      }
    });
    disposables.add(service.grantImplicitRead("host-a", URI.file("/plugins/p")));
    assert.strictEqual(await service.check("host-b", URI.file("/etc/foo"), AgentHostPermissionMode.Read), false);
    assert.strictEqual(await service.check("host-b", URI.file("/plugins/p"), AgentHostPermissionMode.Read), false);
    assert.strictEqual(await service.check("host-a", URI.file("/etc/foo"), AgentHostPermissionMode.Write), true);
  });
  test("connectionClosed only affects the named address", async () => {
    const { service } = createService();
    disposables.add(service.grantImplicitRead("host-a", URI.file("/plugins/a")));
    disposables.add(service.grantImplicitRead("host-b", URI.file("/plugins/b")));
    const pendingA = service.request("host-a", { channel: "ahp-root://", uri: URI.file("/etc/a").toString(), read: true });
    const pendingB = service.request("host-b", { channel: "ahp-root://", uri: URI.file("/etc/b").toString(), read: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    service.connectionClosed("host-a");
    await assert.rejects(pendingA, (err) => err instanceof CancellationError);
    assert.strictEqual(await service.check("host-b", URI.file("/plugins/b"), AgentHostPermissionMode.Read), true);
    assert.strictEqual(service.allPending.get().length, 1);
    service.allPending.get()[0].allow();
    await pendingB;
  });
  test("pendingFor returns only this host's requests, with normalized address", async () => {
    const { service } = createService();
    const a = service.request("host-a", { channel: "ahp-root://", uri: URI.file("/etc/a").toString(), read: true });
    const b = service.request("ws://host-b", { channel: "ahp-root://", uri: URI.file("/etc/b").toString(), read: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(service.pendingFor("host-a").get().length, 1);
    assert.strictEqual(service.pendingFor("host-b").get().length, 1);
    assert.strictEqual(service.pendingFor("host-b").get()[0].uri.toString(), URI.file("/etc/b").toString());
    assert.strictEqual(service.pendingFor("ws://host-b").get().length, 1);
    service.allPending.get().forEach((p) => p.allow());
    await Promise.all([a, b]);
  });
  test("request with both read and write prompts sequentially", async () => {
    const { service } = createService();
    const promise = service.request("host", { channel: "ahp-root://", uri: URI.file("/etc/foo").toString(), read: true, write: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    let pending = service.allPending.get();
    assert.strictEqual(pending.length, 1);
    assert.strictEqual(pending[0].mode, AgentHostPermissionMode.Read);
    pending[0].allow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    pending = service.allPending.get();
    assert.strictEqual(pending.length, 1);
    assert.strictEqual(pending[0].mode, AgentHostPermissionMode.Write);
    pending[0].allow();
    await promise;
  });
  test("grantImplicitRead asynchronously upgrades to realpath", async () => {
    const fileService = createStubFileService({
      realpathReturns: (uri) => uri.path === "/home/me/plugin-link" ? URI.file("/real/plugin") : uri
    });
    const { service } = createService(void 0, fileService);
    disposables.add(service.grantImplicitRead("host", URI.file("/home/me/plugin-link")));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(await service.check("host", URI.file("/real/plugin/skill.md"), AgentHostPermissionMode.Read), true);
  });
  test("allowAlways defaults to APPLICATION scope when no value is configured anywhere", async () => {
    const { service, config } = createService();
    const promise = service.request("host", { channel: "ahp-root://", uri: URI.file("/etc/foo").toString(), read: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    service.allPending.get()[0].allowAlways();
    await promise;
    assert.strictEqual(config.lastUpdate?.target, ConfigurationTarget.APPLICATION);
  });
  test("allowAlways merges with existing APPLICATION-scoped grants instead of overwriting them", async () => {
    const config = new CapturingConfigurationService();
    const existing = {
      "other-host": { [URI.file("/etc/preexisting").toString()]: AgentHostAccessMode.ReadWrite }
    };
    const originalInspect = config.inspect.bind(config);
    config.inspect = (key) => {
      if (key === AgentHostLocalFilePermissionsSettingId) {
        return {
          value: existing,
          defaultValue: {},
          applicationValue: existing,
          overrideIdentifiers: []
        };
      }
      return originalInspect(key);
    };
    const service = disposables.add(new AgentHostResourceService(config, createStubFileService(), stubTextModelService, new NullLogService()));
    const promise = service.request("host", { channel: "ahp-root://", uri: URI.file("/etc/foo").toString(), read: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    service.allPending.get()[0].allowAlways();
    await promise;
    assert.strictEqual(config.lastUpdate?.target, ConfigurationTarget.APPLICATION);
    const written = config.lastUpdate.value;
    assert.deepStrictEqual(written, {
      "other-host": { [URI.file("/etc/preexisting").toString()]: AgentHostAccessMode.ReadWrite },
      "host": { [URI.file("/etc/foo").toString()]: AgentHostAccessMode.Read }
    });
  });
  test("allowAlways persists into USER_LOCAL when a pre-existing value is in USER_LOCAL", async () => {
    const config = new CapturingConfigurationService();
    const originalInspect = config.inspect.bind(config);
    config.inspect = (key) => {
      if (key === AgentHostLocalFilePermissionsSettingId) {
        return {
          value: {},
          defaultValue: {},
          userLocalValue: {},
          overrideIdentifiers: []
        };
      }
      return originalInspect(key);
    };
    const service = disposables.add(new AgentHostResourceService(config, createStubFileService(), stubTextModelService, new NullLogService()));
    const promise = service.request("host", { channel: "ahp-root://", uri: URI.file("/etc/foo").toString(), read: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    service.allPending.get()[0].allowAlways();
    await promise;
    assert.strictEqual(config.lastUpdate?.target, ConfigurationTarget.USER_LOCAL);
  });
  test("persisted entries with malformed URI keys or unknown modes are ignored", async () => {
    const { service } = createService({
      "host": {
        "::not a uri::": AgentHostAccessMode.ReadWrite,
        [URI.file("/etc/garbage").toString()]: "unknown",
        [URI.file("/etc/good").toString()]: AgentHostAccessMode.Read
      }
    });
    assert.strictEqual(await service.check("host", URI.file("/etc/garbage"), AgentHostPermissionMode.Read), false);
    assert.strictEqual(await service.check("host", URI.file("/etc/good"), AgentHostPermissionMode.Read), true);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxhZ2VudEhvc3RcXHRlc3RcXGNvbW1vblxcYWdlbnRIb3N0UmVzb3VyY2VTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQge1xuXHRBZ2VudEhvc3RBY2Nlc3NNb2RlLFxuXHRBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZSxcblx0QWdlbnRIb3N0UGVybWlzc2lvbnNTZXR0aW5nLFxuXHRBZ2VudEhvc3RMb2NhbEZpbGVQZXJtaXNzaW9uc1NldHRpbmdJZCxcblx0TE9DQUxfQUdFTlRfSE9TVF9SRVNPVVJDRV9JREVOVElUWSxcbn0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RSZXNvdXJjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0UmVzb3VyY2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdFJlc291cmNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcblxuY29uc3Qgc3R1YlRleHRNb2RlbFNlcnZpY2UgPSB7fSBhcyB1bmtub3duIGFzIElUZXh0TW9kZWxTZXJ2aWNlO1xuXG5jbGFzcyBDYXB0dXJpbmdDb25maWd1cmF0aW9uU2VydmljZSBleHRlbmRzIFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB7XG5cdG92ZXJyaWRlIGFzeW5jIHVwZGF0ZVZhbHVlKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93biwgYXJnMz86IENvbmZpZ3VyYXRpb25UYXJnZXQgfCB1bmtub3duKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdHlwZW9mIGFyZzMgPT09ICdudW1iZXInID8gYXJnMyBhcyBDb25maWd1cmF0aW9uVGFyZ2V0IDogdW5kZWZpbmVkO1xuXHRcdHRoaXMubGFzdFVwZGF0ZSA9IHsga2V5LCB2YWx1ZSwgdGFyZ2V0IH07XG5cdFx0Ly8gUmVmbGVjdCBpbnRvIHRoZSBpbnNwZWN0ZWQgdmFsdWUgc28gc3Vic2VxdWVudCBpbnNwZWN0KCkgcmVhZHMgaXQgYmFjay5cblx0XHRhd2FpdCB0aGlzLnNldFVzZXJDb25maWd1cmF0aW9uKGtleSwgdmFsdWUpO1xuXHR9XG5cblx0bGFzdFVwZGF0ZTogeyBrZXk6IHN0cmluZzsgdmFsdWU6IHVua25vd247IHRhcmdldD86IENvbmZpZ3VyYXRpb25UYXJnZXQgfSB8IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBTdHViIGZpbGUgc2VydmljZSB0aGF0IHJldHVybnMgdGhlIFVSSSBhcy1pcyBmcm9tIGByZWFscGF0aGAsIHdpdGggdGhlXG4gKiBsZXhpY2FsIG5vcm1hbGl6YXRpb24gdGhhdCBgZXh0VXJpLm5vcm1hbGl6ZVBhdGhgIGFwcGxpZWQuIFRoaXMgbGV0cyB0aGVcbiAqIHVuaXQgdGVzdHMgZXhlcmNpc2UgdGhlIHBvbGljeSBsb2dpYyB3aXRob3V0IGEgcmVhbCBmaWxlc3lzdGVtOyBjYW5vbmljYWxcbiAqIGZvcm0gPT0gbGV4aWNhbGx5IG5vcm1hbGl6ZWQgZm9ybS5cbiAqXG4gKiBgbnVsbGAgcmVhbHBhdGggcmVzcG9uc2VzIHNpbXVsYXRlIG5vbi1leGlzdGVudCBwYXRocyB0byBkcml2ZSB0aGVcbiAqIGBfY2Fub25pY2FsaXplYCBwYXJlbnQtZmFsbGJhY2sgYnJhbmNoLlxuICovXG5mdW5jdGlvbiBjcmVhdGVTdHViRmlsZVNlcnZpY2Uob3B0cz86IHtcblx0cmVhbHBhdGhSZXR1cm5zPzogKHVyaTogVVJJKSA9PiBVUkkgfCB1bmRlZmluZWQ7XG59KTogSUZpbGVTZXJ2aWNlIHtcblx0cmV0dXJuIHtcblx0XHRyZWFscGF0aDogYXN5bmMgKHJlc291cmNlOiBVUkkpID0+IG9wdHM/LnJlYWxwYXRoUmV0dXJucyA/IG9wdHMucmVhbHBhdGhSZXR1cm5zKHJlc291cmNlKSA6IHJlc291cmNlLFxuXHR9IGFzIHVua25vd24gYXMgSUZpbGVTZXJ2aWNlO1xufVxuXG5zdWl0ZSgnQWdlbnRIb3N0UmVzb3VyY2VTZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVNlcnZpY2UoaW5pdGlhbD86IEFnZW50SG9zdFBlcm1pc3Npb25zU2V0dGluZywgZmlsZVNlcnZpY2UgPSBjcmVhdGVTdHViRmlsZVNlcnZpY2UoKSk6IHsgc2VydmljZTogQWdlbnRIb3N0UmVzb3VyY2VTZXJ2aWNlOyBjb25maWc6IENhcHR1cmluZ0NvbmZpZ3VyYXRpb25TZXJ2aWNlIH0ge1xuXHRcdGNvbnN0IGNvbmZpZyA9IG5ldyBDYXB0dXJpbmdDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGlmIChpbml0aWFsKSB7XG5cdFx0XHR2b2lkIGNvbmZpZy5zZXRVc2VyQ29uZmlndXJhdGlvbihBZ2VudEhvc3RMb2NhbEZpbGVQZXJtaXNzaW9uc1NldHRpbmdJZCwgaW5pdGlhbCk7XG5cdFx0fVxuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFJlc291cmNlU2VydmljZShjb25maWcsIGZpbGVTZXJ2aWNlLCBzdHViVGV4dE1vZGVsU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRyZXR1cm4geyBzZXJ2aWNlLCBjb25maWcgfTtcblx0fVxuXG5cdHRlc3QoJ2NoZWNrIGRlbmllcyB3aGVuIG5vIGdyYW50IGV4aXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jaGVjaygnaG9zdCcsIFVSSS5maWxlKCcvZXRjL3Bhc3N3ZCcpLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5SZWFkKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNoZWNrKCdob3N0JywgVVJJLmZpbGUoJy9ldGMvcGFzc3dkJyksIEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLldyaXRlKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCd0cnVzdGVkIGxvY2FsIGlkZW50aXR5IGNhbm5vdCBiZSBzcG9vZmVkIGJ5IGEgcmVtb3RlIGxvY2FsIGFkZHJlc3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9ldGMvcGFzc3dkJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRydXN0ZWRMb2NhbDogYXdhaXQgc2VydmljZS5jaGVjayhMT0NBTF9BR0VOVF9IT1NUX1JFU09VUkNFX0lERU5USVRZLCB1cmksIEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLldyaXRlKSxcblx0XHRcdHJlbW90ZUxvY2FsOiBhd2FpdCBzZXJ2aWNlLmNoZWNrKCdsb2NhbCcsIHVyaSwgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuUmVhZCksXG5cdFx0XHRub3JtYWxpemVkUmVtb3RlTG9jYWw6IGF3YWl0IHNlcnZpY2UuY2hlY2soJ3dzOi8vbG9jYWwnLCB1cmksIEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLlJlYWQpLFxuXHRcdH0sIHtcblx0XHRcdHRydXN0ZWRMb2NhbDogdHJ1ZSxcblx0XHRcdHJlbW90ZUxvY2FsOiBmYWxzZSxcblx0XHRcdG5vcm1hbGl6ZWRSZW1vdGVMb2NhbDogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW90ZSBsb2NhbCBhZGRyZXNzIHVzZXMgdGhlIG5vcm1hbCBwZXJtaXNzaW9uIHJlcXVlc3QgZmxvdycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL2V0Yy9wYXNzd2QnKTtcblx0XHRjb25zdCBwcm9taXNlID0gc2VydmljZS5yZXF1ZXN0KCd3czovL2xvY2FsJywgeyBjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLCB1cmk6IHVyaS50b1N0cmluZygpLCByZWFkOiB0cnVlIH0pO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cdFx0Y29uc3QgW3BlbmRpbmddID0gc2VydmljZS5hbGxQZW5kaW5nLmdldCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhZGRyZXNzOiBwZW5kaW5nLmFkZHJlc3MsXG5cdFx0XHR1cmk6IHBlbmRpbmcudXJpLnRvU3RyaW5nKCksXG5cdFx0XHRtb2RlOiBwZW5kaW5nLm1vZGUsXG5cdFx0fSwge1xuXHRcdFx0YWRkcmVzczogJ2xvY2FsJyxcblx0XHRcdHVyaTogdXJpLnRvU3RyaW5nKCksXG5cdFx0XHRtb2RlOiBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5SZWFkLFxuXHRcdH0pO1xuXG5cdFx0cGVuZGluZy5kZW55KCk7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMocHJvbWlzZSwgKGVycjogdW5rbm93bikgPT4gZXJyIGluc3RhbmNlb2YgQ2FuY2VsbGF0aW9uRXJyb3IpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbXBsaWNpdCByZWFkIGdyYW50IGNvdmVycyBkZXNjZW5kYW50cyBidXQgbm90IHBhcmVudCBvciBzaWJsaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLmdyYW50SW1wbGljaXRSZWFkKCdob3N0JywgVVJJLmZpbGUoJy9wbHVnaW5zL2ZvbycpKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jaGVjaygnaG9zdCcsIFVSSS5maWxlKCcvcGx1Z2lucy9mb28nKSwgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuUmVhZCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNoZWNrKCdob3N0JywgVVJJLmZpbGUoJy9wbHVnaW5zL2Zvby9za2lsbC5tZCcpLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5SZWFkKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuY2hlY2soJ2hvc3QnLCBVUkkuZmlsZSgnL3BsdWdpbnMnKSwgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuUmVhZCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jaGVjaygnaG9zdCcsIFVSSS5maWxlKCcvcGx1Z2lucy9iYXInKSwgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuUmVhZCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnaW1wbGljaXQgZ3JhbnQgZG9lcyBub3QgYWxsb3cgd3JpdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UuZ3JhbnRJbXBsaWNpdFJlYWQoJ2hvc3QnLCBVUkkuZmlsZSgnL3BsdWdpbnMvZm9vJykpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jaGVjaygnaG9zdCcsIFVSSS5maWxlKCcvcGx1Z2lucy9mb28nKSwgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuV3JpdGUpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BlcnNpc3RlZCBcInJcIiBhbGxvd3MgcmVhZCwgZGVuaWVzIHdyaXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHQnaG9zdCc6IHtcblx0XHRcdFx0W1VSSS5maWxlKCcvZXRjL2ZvbycpLnRvU3RyaW5nKCldOiBBZ2VudEhvc3RBY2Nlc3NNb2RlLlJlYWQsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNoZWNrKCdob3N0JywgVVJJLmZpbGUoJy9ldGMvZm9vJyksIEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLlJlYWQpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jaGVjaygnaG9zdCcsIFVSSS5maWxlKCcvZXRjL2Zvby9iYXInKSwgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuUmVhZCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNoZWNrKCdob3N0JywgVVJJLmZpbGUoJy9ldGMvZm9vJyksIEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLldyaXRlKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdwZXJzaXN0ZWQgXCJyd1wiIGFsbG93cyByZWFkIGFuZCB3cml0ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0J2hvc3QnOiB7XG5cdFx0XHRcdFtVUkkuZmlsZSgnL2V0Yy9mb28nKS50b1N0cmluZygpXTogQWdlbnRIb3N0QWNjZXNzTW9kZS5SZWFkV3JpdGUsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNoZWNrKCdob3N0JywgVVJJLmZpbGUoJy9ldGMvZm9vJyksIEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLlJlYWQpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jaGVjaygnaG9zdCcsIFVSSS5maWxlKCcvZXRjL2ZvbycpLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5Xcml0ZSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNoZWNrKCdob3N0JywgVVJJLmZpbGUoJy9ldGMvZm9vL2JhcicpLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5Xcml0ZSksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGVjayBjYW5vbmljYWxpemVzIHZpYSByZWFscGF0aCBzbyBzeW1saW5rIHRvIG91dHNpZGUgdGhlIGdyYW50IGlzIGRlbmllZCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBgL3NhZmUvc3ltYCBpcyBhIHN5bWxpbmsgdG8gYC9zZW5zaXRpdmVgLiBUaGUgZ3JhbnQgaXMgZm9yIGAvc2FmZWAgb25seS5cblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNyZWF0ZVN0dWJGaWxlU2VydmljZSh7XG5cdFx0XHRyZWFscGF0aFJldHVybnM6IHVyaSA9PiB1cmkucGF0aC5zdGFydHNXaXRoKCcvc2FmZS9zeW0nKVxuXHRcdFx0XHQ/IFVSSS5maWxlKCcvc2Vuc2l0aXZlJyArIHVyaS5wYXRoLnNsaWNlKCcvc2FmZS9zeW0nLmxlbmd0aCkpXG5cdFx0XHRcdDogdXJpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSh1bmRlZmluZWQsIGZpbGVTZXJ2aWNlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5ncmFudEltcGxpY2l0UmVhZCgnaG9zdCcsIFVSSS5maWxlKCcvc2FmZScpKSk7XG5cblx0XHQvLyBgL3NhZmUvZm9vYCByZXNvbHZlcyB0byBpdHNlbGY7IGNvdmVyZWQgYnkgZ3JhbnQuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuY2hlY2soJ2hvc3QnLCBVUkkuZmlsZSgnL3NhZmUvZm9vJyksIEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLlJlYWQpLCB0cnVlKTtcblxuXHRcdC8vIGAvc2FmZS9zeW0vbGVha2AgcmVzb2x2ZXMgdGhyb3VnaCBzeW1saW5rIHRvIGAvc2Vuc2l0aXZlL2xlYWtgOyBub3QgY292ZXJlZC5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jaGVjaygnaG9zdCcsIFVSSS5maWxlKCcvc2FmZS9zeW0vbGVhaycpLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5SZWFkKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbXBsaWNpdCBncmFudCBmb3IgYSBzeW1saW5rZWQgZGlyZWN0b3J5IHN0aWxsIGNvdmVycyBkZXNjZW5kYW50cyByZXNvbHZlZCB0aHJvdWdoIHRoZSBzeW1saW5rJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRoZSBncmFudCByb290IGlzIGl0c2VsZiBhIHN5bWxpbms6IGAvc2FmZS9zeW1gIFx1MjE5MiBgL3JlYWxgLlxuXHRcdC8vIEEgcmVxdWVzdCBmb3IgYC9zYWZlL3N5bS9sZWFmYCBzaG91bGQgY2Fub25pY2FsaXplIHRvIGAvcmVhbC9sZWFmYCxcblx0XHQvLyBhbmQgdGhlIGdyYW50IHNob3VsZCBjYW5vbmljYWxpemUgdG8gYC9yZWFsYCwgc28gdGhlIGNvbXBhcmlzb25cblx0XHQvLyBwYXNzZXMuIFByZS1maXgsIHRoZSBncmFudCBVUkkgd2FzIHN0b3JlZCBsZXhpY2FsbHkgdW50aWwgcmVhbHBhdGhcblx0XHQvLyBjb21wbGV0ZWQsIHdoaWNoIGxlZnQgYSB3aW5kb3cgd2hlcmUgdGhlIGNvbXBhcmlzb24gZmFpbGVkLlxuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY3JlYXRlU3R1YkZpbGVTZXJ2aWNlKHtcblx0XHRcdHJlYWxwYXRoUmV0dXJuczogdXJpID0+IHVyaS5wYXRoLnN0YXJ0c1dpdGgoJy9zYWZlL3N5bScpXG5cdFx0XHRcdD8gVVJJLmZpbGUoJy9yZWFsJyArIHVyaS5wYXRoLnNsaWNlKCcvc2FmZS9zeW0nLmxlbmd0aCkpXG5cdFx0XHRcdDogdXJpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSh1bmRlZmluZWQsIGZpbGVTZXJ2aWNlKTtcblx0XHQvLyBJc3N1ZSB0aGUgZ3JhbnQgYW5kIHRoZSBjaGVjayBpbW1lZGlhdGVseSwgYmVmb3JlIGFueSBhd2FpdHMsIHRvXG5cdFx0Ly8gcmVwcm9kdWNlIHRoZSByYWNlIHdpbmRvdy5cblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5ncmFudEltcGxpY2l0UmVhZCgnaG9zdCcsIFVSSS5maWxlKCcvc2FmZS9zeW0nKSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNoZWNrKCdob3N0JywgVVJJLmZpbGUoJy9zYWZlL3N5bS9sZWFmJyksIEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLlJlYWQpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnY2hlY2sgcmVqZWN0cyBwYXRoIHRyYXZlcnNhbCB2aWEgLi4gc2VnbWVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UuZ3JhbnRJbXBsaWNpdFJlYWQoJ2hvc3QnLCBVUkkuZmlsZSgnL3NhZmUnKSkpO1xuXG5cdFx0Ly8gYC9zYWZlLy4uL2V0Yy9wYXNzd2RgIGxleGljYWxseSBub3JtYWxpemVzIHRvIGAvZXRjL3Bhc3N3ZGAgXHUyMDE0IG91dHNpZGUgdGhlIGdyYW50LlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNoZWNrKCdob3N0JywgVVJJLmZpbGUoJy9zYWZlLy4uL2V0Yy9wYXNzd2QnKSwgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuUmVhZCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnY2hlY2sgY2Fub25pY2FsaXplcyBub25leGlzdGVudCBwYXRocyB2aWEgdGhlIHBhcmVudCByZWFscGF0aCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBgL3NhZmUvc3ltYCBpcyBhIHN5bWxpbmsgdG8gYC9yZWFsYC4gV2UncmUgYXNraW5nIGFib3V0IGEgKm5ldypcblx0XHQvLyBmaWxlIGF0IGAvc2FmZS9zeW0vbmV3LnR4dGAgKGUuZy4gYSBgcmVzb3VyY2VXcml0ZWAgZm9yIGEgZmlsZVxuXHRcdC8vIHRoYXQgZG9lc24ndCBleGlzdCB5ZXQpLiBSZWFscGF0aCByZXR1cm5zIGB1bmRlZmluZWRgIGZvciB0aGVcblx0XHQvLyBmaWxlLCBzbyB0aGUgc2VydmljZSBmYWxscyBiYWNrIHRvIHJlYWxwYXRoaW5nIHRoZSBwYXJlbnQuXG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjcmVhdGVTdHViRmlsZVNlcnZpY2Uoe1xuXHRcdFx0cmVhbHBhdGhSZXR1cm5zOiB1cmkgPT4ge1xuXHRcdFx0XHRpZiAodXJpLnBhdGggPT09ICcvc2FmZS9zeW0vbmV3LnR4dCcpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh1cmkucGF0aCA9PT0gJy9zYWZlL3N5bScpIHtcblx0XHRcdFx0XHRyZXR1cm4gVVJJLmZpbGUoJy9yZWFsJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVyaTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKHVuZGVmaW5lZCwgZmlsZVNlcnZpY2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLmdyYW50SW1wbGljaXRSZWFkKCdob3N0JywgVVJJLmZpbGUoJy9yZWFsJykpKTtcblxuXHRcdC8vIFdhaXQgZm9yIHRoZSBpbXBsaWNpdC1ncmFudCByZWFscGF0aCB1cGdyYWRlIHRvIHNldHRsZS5cblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0YXdhaXQgc2VydmljZS5jaGVjaygnaG9zdCcsIFVSSS5maWxlKCcvc2FmZS9zeW0vbmV3LnR4dCcpLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5SZWFkKSxcblx0XHRcdHRydWUsXG5cdFx0XHQnbm9uZXhpc3RlbnQgZmlsZSB1bmRlciBhIHN5bWxpbmtlZCBwYXJlbnQgc2hvdWxkIGNhbm9uaWNhbGl6ZSB0byAvcmVhbC9uZXcudHh0Jyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXF1ZXN0IHJlc29sdmVzIGltbWVkaWF0ZWx5IHdoZW4gYWxyZWFkeSBncmFudGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLmdyYW50SW1wbGljaXRSZWFkKCdob3N0JywgVVJJLmZpbGUoJy9wbHVnaW5zL2ZvbycpKSk7XG5cdFx0YXdhaXQgc2VydmljZS5yZXF1ZXN0KCdob3N0JywgeyBjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLCB1cmk6IFVSSS5maWxlKCcvcGx1Z2lucy9mb28veC5tZCcpLnRvU3RyaW5nKCksIHJlYWQ6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuYWxsUGVuZGluZy5nZXQoKS5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdhbGxvdyBncmFudHMgaW4tbWVtb3J5IHVudGlsIGNvbm5lY3Rpb24gY2xvc2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSwgY29uZmlnIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9ldGMvZm9vJyk7XG5cdFx0Y29uc3QgcHJvbWlzZSA9IHNlcnZpY2UucmVxdWVzdCgnaG9zdCcsIHsgY2hhbm5lbDogJ2FocC1yb290Oi8vJywgdXJpOiB1cmkudG9TdHJpbmcoKSwgcmVhZDogdHJ1ZSB9KTtcblxuXHRcdC8vIFdhaXQgZm9yIGNhbm9uaWNhbGl6YXRpb24gKyBlbnF1ZXVlLlxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cdFx0Y29uc3QgcGVuZGluZyA9IHNlcnZpY2UuYWxsUGVuZGluZy5nZXQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVuZGluZy5sZW5ndGgsIDEpO1xuXG5cdFx0cGVuZGluZ1swXS5hbGxvdygpO1xuXHRcdGF3YWl0IHByb21pc2U7XG5cblx0XHQvLyBUaGUgZ3JhbnQgbXVzdCB0YWtlIGVmZmVjdCBzeW5jaHJvbm91c2x5OiBzdWJzZXF1ZW50IGNoZWNrIHBhc3Nlcy5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jaGVjaygnaG9zdCcsIHVyaSwgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuUmVhZCksIHRydWUpO1xuXHRcdC8vIEFuZCBub3RoaW5nIHdhcyBwZXJzaXN0ZWQuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpZy5sYXN0VXBkYXRlLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gQ29ubmVjdGlvbiBjbG9zZSByZXZva2VzIHRoZSBpbi1tZW1vcnkgZ3JhbnQuXG5cdFx0c2VydmljZS5jb25uZWN0aW9uQ2xvc2VkKCdob3N0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuY2hlY2soJ2hvc3QnLCB1cmksIEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLlJlYWQpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FsbG93IGZvciB3cml0ZSBhbHNvIGNvdmVycyByZWFkIG9uIHRoZSBzYW1lIFVSSScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBwcm9taXNlID0gc2VydmljZS5yZXF1ZXN0KCdob3N0JywgeyBjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLCB1cmk6IFVSSS5maWxlKCcvZXRjL2ZvbycpLnRvU3RyaW5nKCksIHdyaXRlOiB0cnVlIH0pO1xuXG5cdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblx0XHRjb25zdCBwZW5kaW5nID0gc2VydmljZS5hbGxQZW5kaW5nLmdldCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZW5kaW5nWzBdLm1vZGUsIEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLldyaXRlKTtcblx0XHRwZW5kaW5nWzBdLmFsbG93KCk7XG5cdFx0YXdhaXQgcHJvbWlzZTtcblxuXHRcdC8vIE1pcnJvcnMgdGhlIHBlcnNpc3RlZCBcInJ3XCIgc2VtYW50aWNzOiB3cml0ZSBhY2Nlc3MgaW1wbGllcyByZWFkIGFjY2VzcyBvbiB0aGUgc2FtZSBVUkkuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuY2hlY2soJ2hvc3QnLCBVUkkuZmlsZSgnL2V0Yy9mb28nKSwgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuV3JpdGUpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jaGVjaygnaG9zdCcsIFVSSS5maWxlKCcvZXRjL2ZvbycpLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5SZWFkKSwgdHJ1ZSk7XG5cdFx0Ly8gQnV0IGEgc2libGluZyBVUkkgZ2V0cyBub3RoaW5nLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNoZWNrKCdob3N0JywgVVJJLmZpbGUoJy9ldGMvYmFyJyksIEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLlJlYWQpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FsbG93IGZvciByZWFkIGRvZXMgbm90IGdyYW50IHdyaXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IHByb21pc2UgPSBzZXJ2aWNlLnJlcXVlc3QoJ2hvc3QnLCB7IGNoYW5uZWw6ICdhaHAtcm9vdDovLycsIHVyaTogVVJJLmZpbGUoJy9ldGMvZm9vJykudG9TdHJpbmcoKSwgcmVhZDogdHJ1ZSB9KTtcblxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cdFx0c2VydmljZS5hbGxQZW5kaW5nLmdldCgpWzBdLmFsbG93KCk7XG5cdFx0YXdhaXQgcHJvbWlzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNoZWNrKCdob3N0JywgVVJJLmZpbGUoJy9ldGMvZm9vJyksIEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLlJlYWQpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jaGVjaygnaG9zdCcsIFVSSS5maWxlKCcvZXRjL2ZvbycpLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5Xcml0ZSksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgncmVxdWVzdCByZWplY3RzIHdpdGggQ2FuY2VsbGF0aW9uRXJyb3Igb24gZGVueScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBwcm9taXNlID0gc2VydmljZS5yZXF1ZXN0KCdob3N0JywgeyBjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLCB1cmk6IFVSSS5maWxlKCcvZXRjL2ZvbycpLnRvU3RyaW5nKCksIHJlYWQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblx0XHRzZXJ2aWNlLmFsbFBlbmRpbmcuZ2V0KClbMF0uZGVueSgpO1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHByb21pc2UsIChlcnI6IHVua25vd24pID0+IGVyciBpbnN0YW5jZW9mIENhbmNlbGxhdGlvbkVycm9yKTtcblx0fSk7XG5cblx0dGVzdCgnYWxsb3dBbHdheXMgcGVyc2lzdHMgdGhlIGdyYW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSwgY29uZmlnIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcHJvbWlzZSA9IHNlcnZpY2UucmVxdWVzdCgnaG9zdCcsIHsgY2hhbm5lbDogJ2FocC1yb290Oi8vJywgdXJpOiBVUkkuZmlsZSgnL2V0Yy9mb28nKS50b1N0cmluZygpLCByZWFkOiB0cnVlIH0pO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cdFx0c2VydmljZS5hbGxQZW5kaW5nLmdldCgpWzBdLmFsbG93QWx3YXlzKCk7XG5cdFx0YXdhaXQgcHJvbWlzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWcubGFzdFVwZGF0ZT8ua2V5LCBBZ2VudEhvc3RMb2NhbEZpbGVQZXJtaXNzaW9uc1NldHRpbmdJZCk7XG5cdFx0Y29uc3QgdmFsdWUgPSBjb25maWcubGFzdFVwZGF0ZS52YWx1ZSBhcyBBZ2VudEhvc3RQZXJtaXNzaW9uc1NldHRpbmc7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlWydob3N0J11bVVJJLmZpbGUoJy9ldGMvZm9vJykudG9TdHJpbmcoKV0sIEFnZW50SG9zdEFjY2Vzc01vZGUuUmVhZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FsbG93QWx3YXlzIGNvdmVycyBpbW1lZGlhdGUgcmV0cnkgd2l0aG91dCB3YWl0aW5nIGZvciB0aGUgc2V0dGluZ3Mgd3JpdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gYHVwZGF0ZVZhbHVlYCBkZWxpYmVyYXRlbHkgZGVmZXJyZWQgdG8gc2ltdWxhdGUgc2xvdyBwcm9wYWdhdGlvbi5cblx0XHRjb25zdCBjb25maWcgPSBuZXcgKGNsYXNzIGV4dGVuZHMgQ2FwdHVyaW5nQ29uZmlndXJhdGlvblNlcnZpY2Uge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgdXBkYXRlVmFsdWUoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCB0YXJnZXQ/OiB1bmtub3duKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCA1MCkpO1xuXHRcdFx0XHRhd2FpdCBzdXBlci51cGRhdGVWYWx1ZShrZXksIHZhbHVlLCB0YXJnZXQgYXMgQ29uZmlndXJhdGlvblRhcmdldCk7XG5cdFx0XHR9XG5cdFx0fSkoKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RSZXNvdXJjZVNlcnZpY2UoY29uZmlnLCBjcmVhdGVTdHViRmlsZVNlcnZpY2UoKSwgc3R1YlRleHRNb2RlbFNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL2V0Yy9mb28nKTtcblx0XHRjb25zdCBwcm9taXNlID0gc2VydmljZS5yZXF1ZXN0KCdob3N0JywgeyBjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLCB1cmk6IHVyaS50b1N0cmluZygpLCByZWFkOiB0cnVlIH0pO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cdFx0c2VydmljZS5hbGxQZW5kaW5nLmdldCgpWzBdLmFsbG93QWx3YXlzKCk7XG5cdFx0YXdhaXQgcHJvbWlzZTtcblxuXHRcdC8vIFRoZSBjaGVjayBtdXN0IHN1Y2NlZWQgaW1tZWRpYXRlbHkgZXZlbiB0aG91Z2ggYHVwZGF0ZVZhbHVlYCBoYXNuJ3QgcmV0dXJuZWQgeWV0LlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNoZWNrKCdob3N0JywgdXJpLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5SZWFkKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FsbG93QWx3YXlzIGZvciB3cml0ZSBwZXJzaXN0cyBydycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIGNvbmZpZyB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IHByb21pc2UgPSBzZXJ2aWNlLnJlcXVlc3QoJ2hvc3QnLCB7IGNoYW5uZWw6ICdhaHAtcm9vdDovLycsIHVyaTogVVJJLmZpbGUoJy9ldGMvZm9vJykudG9TdHJpbmcoKSwgd3JpdGU6IHRydWUgfSk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblx0XHRzZXJ2aWNlLmFsbFBlbmRpbmcuZ2V0KClbMF0uYWxsb3dBbHdheXMoKTtcblx0XHRhd2FpdCBwcm9taXNlO1xuXG5cdFx0Y29uc3QgdmFsdWUgPSBjb25maWcubGFzdFVwZGF0ZT8udmFsdWUgYXMgQWdlbnRIb3N0UGVybWlzc2lvbnNTZXR0aW5nO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZVsnaG9zdCddW1VSSS5maWxlKCcvZXRjL2ZvbycpLnRvU3RyaW5nKCldLCBBZ2VudEhvc3RBY2Nlc3NNb2RlLlJlYWRXcml0ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FsbG93QWx3YXlzIHNraXBzIHBlcnNpc3RlbmNlIHdoZW4gY292ZXJlZCBieSBwYXJlbnQgZ3JhbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBjb25maWcgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0J2hvc3QnOiB7XG5cdFx0XHRcdFtVUkkuZmlsZSgnL2V0YycpLnRvU3RyaW5nKCldOiBBZ2VudEhvc3RBY2Nlc3NNb2RlLlJlYWRXcml0ZSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Ly8gQWxyZWFkeSBjb3ZlcmVkIGJ5IHBhcmVudCBcdTIwMTQgcmVxdWVzdCByZXNvbHZlcyB3aXRob3V0IHByb21wdGluZy5cblx0XHRhd2FpdCBzZXJ2aWNlLnJlcXVlc3QoJ2hvc3QnLCB7IGNoYW5uZWw6ICdhaHAtcm9vdDovLycsIHVyaTogVVJJLmZpbGUoJy9ldGMvZm9vJykudG9TdHJpbmcoKSwgcmVhZDogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlnLmxhc3RVcGRhdGUsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmN1cnJlbnQgaWRlbnRpY2FsIHJlcXVlc3RzIHNoYXJlIG9uZSBwZW5kaW5nIGVudHJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IGEgPSBzZXJ2aWNlLnJlcXVlc3QoJ2hvc3QnLCB7IGNoYW5uZWw6ICdhaHAtcm9vdDovLycsIHVyaTogVVJJLmZpbGUoJy9ldGMvZm9vJykudG9TdHJpbmcoKSwgcmVhZDogdHJ1ZSB9KTtcblx0XHRjb25zdCBiID0gc2VydmljZS5yZXF1ZXN0KCdob3N0JywgeyBjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLCB1cmk6IFVSSS5maWxlKCcvZXRjL2ZvbycpLnRvU3RyaW5nKCksIHJlYWQ6IHRydWUgfSk7XG5cblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmFsbFBlbmRpbmcuZ2V0KCkubGVuZ3RoLCAxKTtcblx0XHRzZXJ2aWNlLmFsbFBlbmRpbmcuZ2V0KClbMF0uYWxsb3coKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbYSwgYl0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZSByZXF1ZXN0IHRoYXQgYWxyZWFkeSBoYXMgcmVhZCBncmFudCBzdGlsbCBwcm9tcHRzIGZvciB3cml0ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0J2hvc3QnOiB7XG5cdFx0XHRcdFtVUkkuZmlsZSgnL2V0Yy9mb28nKS50b1N0cmluZygpXTogQWdlbnRIb3N0QWNjZXNzTW9kZS5SZWFkLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBwcm9taXNlID0gc2VydmljZS5yZXF1ZXN0KCdob3N0JywgeyBjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLCB1cmk6IFVSSS5maWxlKCcvZXRjL2ZvbycpLnRvU3RyaW5nKCksIHdyaXRlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuYWxsUGVuZGluZy5nZXQoKS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmFsbFBlbmRpbmcuZ2V0KClbMF0ubW9kZSwgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuV3JpdGUpO1xuXHRcdC8vIFJlc29sdmUgdG8gY2xlYW4gdXAuXG5cdFx0c2VydmljZS5hbGxQZW5kaW5nLmdldCgpWzBdLmFsbG93KCk7XG5cdFx0YXdhaXQgcHJvbWlzZTtcblx0fSk7XG5cblx0dGVzdCgnY29ubmVjdGlvbkNsb3NlZCByZWplY3RzIHBlbmRpbmcgYW5kIGNsZWFycyB0aGUgcXVldWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcHJvbWlzZSA9IHNlcnZpY2UucmVxdWVzdCgnaG9zdCcsIHsgY2hhbm5lbDogJ2FocC1yb290Oi8vJywgdXJpOiBVUkkuZmlsZSgnL2V0Yy9mb28nKS50b1N0cmluZygpLCByZWFkOiB0cnVlIH0pO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cdFx0c2VydmljZS5jb25uZWN0aW9uQ2xvc2VkKCdob3N0Jyk7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMocHJvbWlzZSwgKGVycjogdW5rbm93bikgPT4gZXJyIGluc3RhbmNlb2YgQ2FuY2VsbGF0aW9uRXJyb3IpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmFsbFBlbmRpbmcuZ2V0KCkubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnY29ubmVjdGlvbkNsb3NlZCBkcm9wcyBpbXBsaWNpdCBncmFudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UuZ3JhbnRJbXBsaWNpdFJlYWQoJ2hvc3QnLCBVUkkuZmlsZSgnL3BsdWdpbnMvZm9vJykpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jaGVjaygnaG9zdCcsIFVSSS5maWxlKCcvcGx1Z2lucy9mb28veCcpLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5SZWFkKSwgdHJ1ZSk7XG5cdFx0c2VydmljZS5jb25uZWN0aW9uQ2xvc2VkKCdob3N0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuY2hlY2soJ2hvc3QnLCBVUkkuZmlsZSgnL3BsdWdpbnMvZm9vL3gnKSwgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuUmVhZCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnYWRkcmVzcyBub3JtYWxpemF0aW9uIHN0cmlwcyB3czovLyBwcmVmaXgnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdCdob3N0OjEyMzQnOiB7XG5cdFx0XHRcdFtVUkkuZmlsZSgnL2V0Yy9mb28nKS50b1N0cmluZygpXTogQWdlbnRIb3N0QWNjZXNzTW9kZS5SZWFkLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jaGVjaygnd3M6Ly9ob3N0OjEyMzQnLCBVUkkuZmlsZSgnL2V0Yy9mb28nKSwgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuUmVhZCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNoZWNrKCdob3N0OjEyMzQnLCBVUkkuZmlsZSgnL2V0Yy9mb28nKSwgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuUmVhZCksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5kUGVuZGluZyByZXR1cm5zIHRoZSBwZW5kaW5nIHJlcXVlc3QgYnkgaWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcHJvbWlzZSA9IHNlcnZpY2UucmVxdWVzdCgnaG9zdCcsIHsgY2hhbm5lbDogJ2FocC1yb290Oi8vJywgdXJpOiBVUkkuZmlsZSgnL2V0Yy9mb28nKS50b1N0cmluZygpLCByZWFkOiB0cnVlIH0pO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cdFx0Y29uc3QgW3BlbmRpbmddID0gc2VydmljZS5hbGxQZW5kaW5nLmdldCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmZpbmRQZW5kaW5nKHBlbmRpbmcuaWQpLCBwZW5kaW5nKTtcblx0XHQvLyBSZXNvbHZlIHRvIGNsZWFuIHVwIGJlZm9yZSB0aGUgdGVzdCBlbmRzIHNvIHRoZSBkZWZlcnJlZCBkb2Vzbid0IGxlYWsuXG5cdFx0cGVuZGluZy5hbGxvdygpO1xuXHRcdGF3YWl0IHByb21pc2U7XG5cdH0pO1xuXG5cdC8vIC0tLS0gQWRkcmVzcyBpc29sYXRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHRlc3QoJ2dyYW50cyBmb3Igb25lIGhvc3QgZG8gbm90IGxlYWsgaW50byBhbm90aGVyIGhvc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdCdob3N0LWEnOiB7XG5cdFx0XHRcdFtVUkkuZmlsZSgnL2V0Yy9mb28nKS50b1N0cmluZygpXTogQWdlbnRIb3N0QWNjZXNzTW9kZS5SZWFkV3JpdGUsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLmdyYW50SW1wbGljaXRSZWFkKCdob3N0LWEnLCBVUkkuZmlsZSgnL3BsdWdpbnMvcCcpKSk7XG5cblx0XHQvLyBTYW1lIFVSSSwgZGlmZmVyZW50IGhvc3QgXHUyMTkyIG5vdCBncmFudGVkLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNoZWNrKCdob3N0LWInLCBVUkkuZmlsZSgnL2V0Yy9mb28nKSwgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuUmVhZCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jaGVjaygnaG9zdC1iJywgVVJJLmZpbGUoJy9wbHVnaW5zL3AnKSwgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuUmVhZCksIGZhbHNlKTtcblx0XHQvLyBTYW5pdHk6IGdyYW50IHN0aWxsIHdvcmtzIGZvciB0aGUgb3JpZ2luYXRpbmcgaG9zdC5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jaGVjaygnaG9zdC1hJywgVVJJLmZpbGUoJy9ldGMvZm9vJyksIEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLldyaXRlKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nvbm5lY3Rpb25DbG9zZWQgb25seSBhZmZlY3RzIHRoZSBuYW1lZCBhZGRyZXNzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLmdyYW50SW1wbGljaXRSZWFkKCdob3N0LWEnLCBVUkkuZmlsZSgnL3BsdWdpbnMvYScpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UuZ3JhbnRJbXBsaWNpdFJlYWQoJ2hvc3QtYicsIFVSSS5maWxlKCcvcGx1Z2lucy9iJykpKTtcblxuXHRcdGNvbnN0IHBlbmRpbmdBID0gc2VydmljZS5yZXF1ZXN0KCdob3N0LWEnLCB7IGNoYW5uZWw6ICdhaHAtcm9vdDovLycsIHVyaTogVVJJLmZpbGUoJy9ldGMvYScpLnRvU3RyaW5nKCksIHJlYWQ6IHRydWUgfSk7XG5cdFx0Y29uc3QgcGVuZGluZ0IgPSBzZXJ2aWNlLnJlcXVlc3QoJ2hvc3QtYicsIHsgY2hhbm5lbDogJ2FocC1yb290Oi8vJywgdXJpOiBVUkkuZmlsZSgnL2V0Yy9iJykudG9TdHJpbmcoKSwgcmVhZDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdFx0c2VydmljZS5jb25uZWN0aW9uQ2xvc2VkKCdob3N0LWEnKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHBlbmRpbmdBLCAoZXJyOiB1bmtub3duKSA9PiBlcnIgaW5zdGFuY2VvZiBDYW5jZWxsYXRpb25FcnJvcik7XG5cdFx0Ly8gaG9zdC1iJ3MgZ3JhbnQgYW5kIHBlbmRpbmcgcmVxdWVzdCBzdXJ2aXZlLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNoZWNrKCdob3N0LWInLCBVUkkuZmlsZSgnL3BsdWdpbnMvYicpLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5SZWFkKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuYWxsUGVuZGluZy5nZXQoKS5sZW5ndGgsIDEpO1xuXG5cdFx0Ly8gQ2xlYW4gdXA6IHJlc29sdmUgdGhlIHN1cnZpdmluZyBwZW5kaW5nIHJlcXVlc3QuXG5cdFx0c2VydmljZS5hbGxQZW5kaW5nLmdldCgpWzBdLmFsbG93KCk7XG5cdFx0YXdhaXQgcGVuZGluZ0I7XG5cdH0pO1xuXG5cdC8vIC0tLS0gcGVuZGluZ0ZvciBmaWx0ZXIgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0dGVzdCgncGVuZGluZ0ZvciByZXR1cm5zIG9ubHkgdGhpcyBob3N0XFwncyByZXF1ZXN0cywgd2l0aCBub3JtYWxpemVkIGFkZHJlc3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgYSA9IHNlcnZpY2UucmVxdWVzdCgnaG9zdC1hJywgeyBjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLCB1cmk6IFVSSS5maWxlKCcvZXRjL2EnKS50b1N0cmluZygpLCByZWFkOiB0cnVlIH0pO1xuXHRcdGNvbnN0IGIgPSBzZXJ2aWNlLnJlcXVlc3QoJ3dzOi8vaG9zdC1iJywgeyBjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLCB1cmk6IFVSSS5maWxlKCcvZXRjL2InKS50b1N0cmluZygpLCByZWFkOiB0cnVlIH0pO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5wZW5kaW5nRm9yKCdob3N0LWEnKS5nZXQoKS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnBlbmRpbmdGb3IoJ2hvc3QtYicpLmdldCgpLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucGVuZGluZ0ZvcignaG9zdC1iJykuZ2V0KClbMF0udXJpLnRvU3RyaW5nKCksIFVSSS5maWxlKCcvZXRjL2InKS50b1N0cmluZygpKTtcblx0XHQvLyBOb3JtYWxpemVkIGxvb2t1cDogcXVlcnlpbmcgd2l0aCB0aGUgd3M6Ly8gcHJlZml4IHJldHVybnMgdGhlIHNhbWUgc2V0LlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnBlbmRpbmdGb3IoJ3dzOi8vaG9zdC1iJykuZ2V0KCkubGVuZ3RoLCAxKTtcblxuXHRcdHNlcnZpY2UuYWxsUGVuZGluZy5nZXQoKS5mb3JFYWNoKHAgPT4gcC5hbGxvdygpKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbYSwgYl0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIE11bHRpLW1vZGUgcmVxdWVzdHMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHR0ZXN0KCdyZXF1ZXN0IHdpdGggYm90aCByZWFkIGFuZCB3cml0ZSBwcm9tcHRzIHNlcXVlbnRpYWxseScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBXZSBzdXJmYWNlIHJlYWQgZmlyc3QsIHRoZW4gb25jZSBhcHByb3ZlZCB3ZSBzdXJmYWNlIHdyaXRlLiBBc2tpbmdcblx0XHQvLyBmb3IgdGhlIHNtYWxsZXIgc2NvcGUgZmlyc3QgbGV0cyB0aGUgdXNlciBkZWNsaW5lIHRoZSBkYW5nZXJvdXNcblx0XHQvLyBwYXJ0IHdpdGhvdXQgZXZlciBzZWVpbmcgaXQuXG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcHJvbWlzZSA9IHNlcnZpY2UucmVxdWVzdCgnaG9zdCcsIHsgY2hhbm5lbDogJ2FocC1yb290Oi8vJywgdXJpOiBVUkkuZmlsZSgnL2V0Yy9mb28nKS50b1N0cmluZygpLCByZWFkOiB0cnVlLCB3cml0ZTogdHJ1ZSB9KTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdFx0bGV0IHBlbmRpbmcgPSBzZXJ2aWNlLmFsbFBlbmRpbmcuZ2V0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlbmRpbmcubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVuZGluZ1swXS5tb2RlLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5SZWFkKTtcblx0XHRwZW5kaW5nWzBdLmFsbG93KCk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblxuXHRcdHBlbmRpbmcgPSBzZXJ2aWNlLmFsbFBlbmRpbmcuZ2V0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlbmRpbmcubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVuZGluZ1swXS5tb2RlLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5Xcml0ZSk7XG5cdFx0cGVuZGluZ1swXS5hbGxvdygpO1xuXHRcdGF3YWl0IHByb21pc2U7XG5cdH0pO1xuXG5cdC8vIC0tLS0gSW1wbGljaXQtZ3JhbnQgcmVhbHBhdGggdXBncmFkZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHRlc3QoJ2dyYW50SW1wbGljaXRSZWFkIGFzeW5jaHJvbm91c2x5IHVwZ3JhZGVzIHRvIHJlYWxwYXRoJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIGB+L3BsdWdpbi1saW5rYCBpcyBhIHN5bWxpbmsgdG8gYC9yZWFsL3BsdWdpbmAuIEluaXRpYWwgY2hlY2sgc2Vlc1xuXHRcdC8vIHRoZSBsZXhpY2FsIFVSSTsgYWZ0ZXIgcmVhbHBhdGggcmVzb2x2ZXMsIHRoZSBncmFudCBjb3ZlcnMgdGhlXG5cdFx0Ly8gcmVhbHBhdGggdGFyZ2V0IGFzIHdlbGwuXG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjcmVhdGVTdHViRmlsZVNlcnZpY2Uoe1xuXHRcdFx0cmVhbHBhdGhSZXR1cm5zOiB1cmkgPT4gdXJpLnBhdGggPT09ICcvaG9tZS9tZS9wbHVnaW4tbGluaycgPyBVUkkuZmlsZSgnL3JlYWwvcGx1Z2luJykgOiB1cmksXG5cdFx0fSk7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKHVuZGVmaW5lZCwgZmlsZVNlcnZpY2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLmdyYW50SW1wbGljaXRSZWFkKCdob3N0JywgVVJJLmZpbGUoJy9ob21lL21lL3BsdWdpbi1saW5rJykpKTtcblxuXHRcdC8vIFdhaXQgZm9yIHRoZSBkZWZlcnJlZCB1cGdyYWRlIHRvIGxhbmQuXG5cdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblxuXHRcdC8vIENoZWNrIHNlZXMgdGhlIHJlYWxwYXRoIGZvcm0gYmVjYXVzZSBjYW5vbmljYWxpemUgKyBncmFudCBib3RoIHBvaW50IGF0IC9yZWFsL3BsdWdpbi5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jaGVjaygnaG9zdCcsIFVSSS5maWxlKCcvcmVhbC9wbHVnaW4vc2tpbGwubWQnKSwgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuUmVhZCksIHRydWUpO1xuXHR9KTtcblxuXHQvLyAtLS0tIFNldHRpbmdzLXNjb3BlIGluZmVyZW5jZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHR0ZXN0KCdhbGxvd0Fsd2F5cyBkZWZhdWx0cyB0byBBUFBMSUNBVElPTiBzY29wZSB3aGVuIG5vIHZhbHVlIGlzIGNvbmZpZ3VyZWQgYW55d2hlcmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBjb25maWcgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBwcm9taXNlID0gc2VydmljZS5yZXF1ZXN0KCdob3N0JywgeyBjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLCB1cmk6IFVSSS5maWxlKCcvZXRjL2ZvbycpLnRvU3RyaW5nKCksIHJlYWQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblx0XHRzZXJ2aWNlLmFsbFBlbmRpbmcuZ2V0KClbMF0uYWxsb3dBbHdheXMoKTtcblx0XHRhd2FpdCBwcm9taXNlO1xuXG5cdFx0Ly8gVGhlIHNldHRpbmcgaXMgcmVnaXN0ZXJlZCBhcyBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sIHNvIGFcblx0XHQvLyBmcmVzaCB3cml0ZSBtdXN0IGxhbmQgdGhlcmUgXHUyMDE0IG5vdCBpbiBVU0VSICh3aGljaCB3b3VsZCBiZSBpbnZpc2libGVcblx0XHQvLyB0byBvdGhlciB3aW5kb3dzIHRoYXQgcmVhZCB0aGlzIEFQUExJQ0FUSU9OLXNjb3BlZCBzZXR0aW5nKS5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlnLmxhc3RVcGRhdGU/LnRhcmdldCwgQ29uZmlndXJhdGlvblRhcmdldC5BUFBMSUNBVElPTik7XG5cdH0pO1xuXG5cdHRlc3QoJ2FsbG93QWx3YXlzIG1lcmdlcyB3aXRoIGV4aXN0aW5nIEFQUExJQ0FUSU9OLXNjb3BlZCBncmFudHMgaW5zdGVhZCBvZiBvdmVyd3JpdGluZyB0aGVtJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFByZS1leGlzdGluZyBncmFudCBmb3IgYG90aGVyLWhvc3RgIGxpdmVzIGluIEFQUExJQ0FUSU9OIHNjb3BlLlxuXHRcdC8vIFRoZSBzZXJ2aWNlIG11c3QgcmVhZCBmcm9tIEFQUExJQ0FUSU9OIHdoZW4gcGlja2luZyB0aGUgbWVyZ2Vcblx0XHQvLyBiYXNlLCBvdGhlcndpc2UgaXQgd291bGQgYnVpbGQgdGhlIG5leHQgdmFsdWUgZnJvbSB7fSBhbmQgY2xvYmJlclxuXHRcdC8vIHRoZSBleGlzdGluZyBgb3RoZXItaG9zdGAgZW50cnkgb24gd3JpdGUuXG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IENhcHR1cmluZ0NvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgZXhpc3Rpbmc6IEFnZW50SG9zdFBlcm1pc3Npb25zU2V0dGluZyA9IHtcblx0XHRcdCdvdGhlci1ob3N0JzogeyBbVVJJLmZpbGUoJy9ldGMvcHJlZXhpc3RpbmcnKS50b1N0cmluZygpXTogQWdlbnRIb3N0QWNjZXNzTW9kZS5SZWFkV3JpdGUgfSxcblx0XHR9O1xuXHRcdGNvbnN0IG9yaWdpbmFsSW5zcGVjdCA9IGNvbmZpZy5pbnNwZWN0LmJpbmQoY29uZmlnKTtcblx0XHQoY29uZmlnIGFzIHsgaW5zcGVjdDogKGtleTogc3RyaW5nKSA9PiB1bmtub3duIH0pLmluc3BlY3QgPSAoa2V5OiBzdHJpbmcpID0+IHtcblx0XHRcdGlmIChrZXkgPT09IEFnZW50SG9zdExvY2FsRmlsZVBlcm1pc3Npb25zU2V0dGluZ0lkKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dmFsdWU6IGV4aXN0aW5nLFxuXHRcdFx0XHRcdGRlZmF1bHRWYWx1ZToge30sXG5cdFx0XHRcdFx0YXBwbGljYXRpb25WYWx1ZTogZXhpc3RpbmcsXG5cdFx0XHRcdFx0b3ZlcnJpZGVJZGVudGlmaWVyczogW10sXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gb3JpZ2luYWxJbnNwZWN0KGtleSk7XG5cdFx0fTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RSZXNvdXJjZVNlcnZpY2UoY29uZmlnLCBjcmVhdGVTdHViRmlsZVNlcnZpY2UoKSwgc3R1YlRleHRNb2RlbFNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHRjb25zdCBwcm9taXNlID0gc2VydmljZS5yZXF1ZXN0KCdob3N0JywgeyBjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLCB1cmk6IFVSSS5maWxlKCcvZXRjL2ZvbycpLnRvU3RyaW5nKCksIHJlYWQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblx0XHRzZXJ2aWNlLmFsbFBlbmRpbmcuZ2V0KClbMF0uYWxsb3dBbHdheXMoKTtcblx0XHRhd2FpdCBwcm9taXNlO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpZy5sYXN0VXBkYXRlPy50YXJnZXQsIENvbmZpZ3VyYXRpb25UYXJnZXQuQVBQTElDQVRJT04pO1xuXHRcdGNvbnN0IHdyaXR0ZW4gPSBjb25maWcubGFzdFVwZGF0ZS52YWx1ZSBhcyBBZ2VudEhvc3RQZXJtaXNzaW9uc1NldHRpbmc7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh3cml0dGVuLCB7XG5cdFx0XHQnb3RoZXItaG9zdCc6IHsgW1VSSS5maWxlKCcvZXRjL3ByZWV4aXN0aW5nJykudG9TdHJpbmcoKV06IEFnZW50SG9zdEFjY2Vzc01vZGUuUmVhZFdyaXRlIH0sXG5cdFx0XHQnaG9zdCc6IHsgW1VSSS5maWxlKCcvZXRjL2ZvbycpLnRvU3RyaW5nKCldOiBBZ2VudEhvc3RBY2Nlc3NNb2RlLlJlYWQgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYWxsb3dBbHdheXMgcGVyc2lzdHMgaW50byBVU0VSX0xPQ0FMIHdoZW4gYSBwcmUtZXhpc3RpbmcgdmFsdWUgaXMgaW4gVVNFUl9MT0NBTCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBIYW5kLWVkaXRlZCBvciBtaWdyYXRlZCBlbnRyaWVzIGxpdmluZyBpbiBVU0VSX0xPQ0FMIGFyZSBob25vdXJlZFxuXHRcdC8vIHJhdGhlciB0aGFuIHNpbGVudGx5IHJlbG9jYXRlZCB0byBBUFBMSUNBVElPTiBvbiB0aGUgbmV4dCB3cml0ZS5cblx0XHRjb25zdCBjb25maWcgPSBuZXcgQ2FwdHVyaW5nQ29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCBvcmlnaW5hbEluc3BlY3QgPSBjb25maWcuaW5zcGVjdC5iaW5kKGNvbmZpZyk7XG5cdFx0KGNvbmZpZyBhcyB7IGluc3BlY3Q6IChrZXk6IHN0cmluZykgPT4gdW5rbm93biB9KS5pbnNwZWN0ID0gKGtleTogc3RyaW5nKSA9PiB7XG5cdFx0XHRpZiAoa2V5ID09PSBBZ2VudEhvc3RMb2NhbEZpbGVQZXJtaXNzaW9uc1NldHRpbmdJZCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHZhbHVlOiB7fSxcblx0XHRcdFx0XHRkZWZhdWx0VmFsdWU6IHt9LFxuXHRcdFx0XHRcdHVzZXJMb2NhbFZhbHVlOiB7fSxcblx0XHRcdFx0XHRvdmVycmlkZUlkZW50aWZpZXJzOiBbXSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBvcmlnaW5hbEluc3BlY3Qoa2V5KTtcblx0XHR9O1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFJlc291cmNlU2VydmljZShjb25maWcsIGNyZWF0ZVN0dWJGaWxlU2VydmljZSgpLCBzdHViVGV4dE1vZGVsU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdGNvbnN0IHByb21pc2UgPSBzZXJ2aWNlLnJlcXVlc3QoJ2hvc3QnLCB7IGNoYW5uZWw6ICdhaHAtcm9vdDovLycsIHVyaTogVVJJLmZpbGUoJy9ldGMvZm9vJykudG9TdHJpbmcoKSwgcmVhZDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXHRcdHNlcnZpY2UuYWxsUGVuZGluZy5nZXQoKVswXS5hbGxvd0Fsd2F5cygpO1xuXHRcdGF3YWl0IHByb21pc2U7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlnLmxhc3RVcGRhdGU/LnRhcmdldCwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMKTtcblx0fSk7XG5cblx0Ly8gLS0tLSBEZWZlbnNpdmU6IG1hbGZvcm1lZCBzZXR0aW5ncyBlbnRyaWVzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0dGVzdCgncGVyc2lzdGVkIGVudHJpZXMgd2l0aCBtYWxmb3JtZWQgVVJJIGtleXMgb3IgdW5rbm93biBtb2RlcyBhcmUgaWdub3JlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0J2hvc3QnOiB7XG5cdFx0XHRcdCc6Om5vdCBhIHVyaTo6JzogQWdlbnRIb3N0QWNjZXNzTW9kZS5SZWFkV3JpdGUsXG5cdFx0XHRcdFtVUkkuZmlsZSgnL2V0Yy9nYXJiYWdlJykudG9TdHJpbmcoKV06ICd1bmtub3duJyBhcyB1bmtub3duIGFzIEFnZW50SG9zdEFjY2Vzc01vZGUsXG5cdFx0XHRcdFtVUkkuZmlsZSgnL2V0Yy9nb29kJykudG9TdHJpbmcoKV06IEFnZW50SG9zdEFjY2Vzc01vZGUuUmVhZCxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Ly8gVGhlIG1hbGZvcm1lZCBhbmQgdW5rbm93bi1tb2RlIGVudHJpZXMgZG9uJ3QgZ3JhbnQgYWNjZXNzLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNoZWNrKCdob3N0JywgVVJJLmZpbGUoJy9ldGMvZ2FyYmFnZScpLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5SZWFkKSwgZmFsc2UpO1xuXHRcdC8vIFRoZSB2YWxpZCBlbnRyeSBzdGlsbCB3b3Jrcy5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jaGVjaygnaG9zdCcsIFVSSS5maWxlKCcvZXRjL2dvb2QnKSwgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuUmVhZCksIHRydWUpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGdDQUFnQztBQUV6QyxTQUFTLHNCQUFzQjtBQUMvQjtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFFQTtBQUFBLEVBQ0E7QUFBQSxPQUNNO0FBQ1AsU0FBUyxnQ0FBZ0M7QUFHekMsTUFBTSx1QkFBdUIsQ0FBQztBQUU5QixNQUFNLHNDQUFzQyx5QkFBeUI7QUFBQSxFQUNwRSxNQUFlLFlBQVksS0FBYSxPQUFnQixNQUFxRDtBQUM1RyxVQUFNLFNBQVMsT0FBTyxTQUFTLFdBQVcsT0FBOEI7QUFDeEUsU0FBSyxhQUFhLEVBQUUsS0FBSyxPQUFPLE9BQU87QUFFdkMsVUFBTSxLQUFLLHFCQUFxQixLQUFLLEtBQUs7QUFBQSxFQUMzQztBQUdEO0FBV0EsU0FBUyxzQkFBc0IsTUFFZDtBQUNoQixTQUFPO0FBQUEsSUFDTixVQUFVLE9BQU8sYUFBa0IsTUFBTSxrQkFBa0IsS0FBSyxnQkFBZ0IsUUFBUSxJQUFJO0FBQUEsRUFDN0Y7QUFDRDtBQUVBLE1BQU0sNEJBQTRCLE1BQU07QUFDdkMsUUFBTSxjQUFjLHdDQUF3QztBQUU1RCxXQUFTLGNBQWMsU0FBdUMsY0FBYyxzQkFB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
