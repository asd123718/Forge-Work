import assert from "assert";
import { DeferredPromise } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileService } from "../../../files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../log/common/log.js";
import { AGENT_CLIENT_SCHEME, toAgentClientUri } from "../../common/agentClientUri.js";
import { customizationId } from "../../common/state/sessionState.js";
import { CustomizationType } from "../../common/state/protocol/state.js";
import { AgentPluginManager } from "../../node/agentPluginManager.js";
class LockableInMemoryFileSystemProvider extends InMemoryFileSystemProvider {
  constructor() {
    super(...arguments);
    this.lockedPaths = /* @__PURE__ */ new Set();
    this.cacheReadStarted = new DeferredPromise();
    this.operationLog = [];
  }
  async delete(resource, opts) {
    for (const locked of this.lockedPaths) {
      if (resource.path.includes(locked)) {
        throw new Error("EBUSY: resource busy or locked");
      }
    }
    return super.delete(resource, opts);
  }
  async readFile(resource) {
    const content = await super.readFile(resource);
    if (this.cacheReadBarrier && resource.path.endsWith("/agentPlugins/cache.json")) {
      this.cacheReadStarted.complete();
      await this.cacheReadBarrier.p;
      this.operationLog.push("cache-read-complete");
    }
    return content;
  }
  async mkdir(resource) {
    if (this.cacheReadBarrier && resource.path.includes("/agentPlugins/") && !resource.path.endsWith("/cache.json")) {
      this.operationLog.push("plugin-materialize");
    }
    return super.mkdir(resource);
  }
}
suite("AgentPluginManager", () => {
  const disposables = new DisposableStore();
  let fileService;
  let provider;
  let manager;
  const basePath = URI.from({ scheme: Schemas.inMemory, path: "/userData" });
  setup(() => {
    fileService = disposables.add(new FileService(new NullLogService()));
    provider = disposables.add(new LockableInMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider(Schemas.inMemory, provider));
    disposables.add(fileService.registerProvider(AGENT_CLIENT_SCHEME, disposables.add(new InMemoryFileSystemProvider())));
    manager = new AgentPluginManager(basePath, fileService, new NullLogService());
  });
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  function pluginUri(name) {
    return URI.from({ scheme: Schemas.inMemory, path: `/plugins/${name}` }).toString();
  }
  function makeRef(name, nonce) {
    const uri = pluginUri(name);
    return {
      type: CustomizationType.Plugin,
      id: customizationId(uri),
      uri,
      name: `Plugin ${name}`,
      ...nonce !== void 0 ? { nonce } : {}
    };
  }
  async function seedPluginDir(name, files) {
    const originalUri = URI.from({ scheme: Schemas.inMemory, path: `/plugins/${name}` });
    const agentClientDir = toAgentClientUri(originalUri, "test-client");
    await fileService.createFolder(agentClientDir);
    for (const [fileName, content] of Object.entries(files)) {
      await fileService.writeFile(URI.joinPath(agentClientDir, fileName), VSBuffer.fromString(content));
    }
  }
  async function readCacheNonces() {
    const cachePath = URI.joinPath(basePath, "agentPlugins", "cache.json");
    const content = await fileService.readFile(cachePath);
    const entries = JSON.parse(content.value.toString());
    return new Set(entries.map((entry) => entry.nonce));
  }
  suite("syncCustomizations", () => {
    test("returns loaded status and pluginDir for each synced plugin", async () => {
      await seedPluginDir("alpha", { "index.js": "a" });
      await seedPluginDir("beta", { "index.js": "b" });
      const results = await manager.syncCustomizations("test-client", [
        makeRef("alpha", "n1"),
        makeRef("beta", "n2")
      ]);
      assert.strictEqual(results[0].customization.load?.kind, "loaded");
      assert.ok(results[0].pluginDir, "should have pluginDir");
      assert.strictEqual(results[1].customization.load?.kind, "loaded");
      assert.ok(results[1].pluginDir, "should have pluginDir");
    });
    test("returns error status without pluginDir when source missing", async () => {
      const results = await manager.syncCustomizations("test-client", [makeRef("nonexistent")]);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].customization.load?.kind, "error");
      assert.ok(results[0].customization.load?.kind === "error" && results[0].customization.load.message);
      assert.strictEqual(results[0].pluginDir, void 0);
    });
    test("mixes loaded and error results", async () => {
      await seedPluginDir("good", { "index.js": "ok" });
      const results = await manager.syncCustomizations("test-client", [
        makeRef("good", "n1"),
        makeRef("missing")
      ]);
      assert.strictEqual(results[1].customization.load?.kind, "error");
      assert.strictEqual(results[1].pluginDir, void 0);
    });
    test("fires progress callback with changed customization status", async () => {
      await seedPluginDir("prog", { "index.js": "content" });
      const progressCalls = [];
      await manager.syncCustomizations("test-client", [makeRef("prog", "n1")], (status) => {
        progressCalls.push(status);
      });
      assert.deepStrictEqual(progressCalls.map((call) => call.load?.kind), ["loaded"]);
    });
    test("skips copy when nonce matches", async () => {
      await seedPluginDir("cached", { "index.js": "v1" });
      const ref = makeRef("cached", "nonce-abc");
      const result1 = await manager.syncCustomizations("test-client", [ref]);
      assert.ok(result1[0].pluginDir);
      const result2 = await manager.syncCustomizations("test-client", [ref]);
      assert.ok(result2[0].pluginDir);
      assert.strictEqual(result1[0].pluginDir.toString(), result2[0].pluginDir.toString());
    });
    test("new nonce materializes a fresh subdirectory and evicts the stale one", async () => {
      await seedPluginDir("rev", { "index.js": "v1" });
      const r1 = await manager.syncCustomizations("test-client", [makeRef("rev", "nonce-1")]);
      const dir1 = r1[0].pluginDir;
      await seedPluginDir("rev", { "index.js": "v2" });
      const r2 = await manager.syncCustomizations("test-client", [makeRef("rev", "nonce-2")]);
      const dir2 = r2[0].pluginDir;
      assert.notStrictEqual(dir1.toString(), dir2.toString(), "new nonce should use a new subdirectory");
      assert.strictEqual(await fileService.exists(dir2), true, "new nonce subdirectory should exist");
      assert.strictEqual(await fileService.exists(dir1), false, "stale nonce subdirectory should be evicted");
      assert.deepStrictEqual(await readCacheNonces(), /* @__PURE__ */ new Set(["nonce-2"]));
    });
    test("retains a locked older nonce so both revisions coexist", async () => {
      await seedPluginDir("rev", { "index.js": "v1" });
      const r1 = await manager.syncCustomizations("test-client", [makeRef("rev", "nonce-1")]);
      const dir1 = r1[0].pluginDir;
      provider.lockedPaths.add(dir1.path);
      await seedPluginDir("rev", { "index.js": "v2" });
      const r2 = await manager.syncCustomizations("test-client", [makeRef("rev", "nonce-2")]);
      const dir2 = r2[0].pluginDir;
      assert.strictEqual(await fileService.exists(dir1), true, "locked older nonce should be retained on disk");
      assert.strictEqual(await fileService.exists(dir2), true, "new nonce subdirectory should exist");
      assert.deepStrictEqual(await readCacheNonces(), /* @__PURE__ */ new Set(["nonce-1", "nonce-2"]));
    });
    test("evicts a previously locked older nonce on startup once released", async () => {
      await seedPluginDir("rev", { "index.js": "v1" });
      const r1 = await manager.syncCustomizations("test-client", [makeRef("rev", "nonce-1")]);
      const dir1 = r1[0].pluginDir;
      provider.lockedPaths.add(dir1.path);
      await seedPluginDir("rev", { "index.js": "v2" });
      await manager.syncCustomizations("test-client", [makeRef("rev", "nonce-2")]);
      provider.lockedPaths.clear();
      const manager2 = new AgentPluginManager(basePath, fileService, new NullLogService());
      await manager2.syncCustomizations("test-client", [makeRef("rev", "nonce-2")]);
      assert.strictEqual(await fileService.exists(dir1), false, "released older nonce should be evicted on startup");
      assert.deepStrictEqual(await readCacheNonces(), /* @__PURE__ */ new Set(["nonce-2"]));
    });
    test("drops a stale cache entry when its directory is already gone", async () => {
      await seedPluginDir("rev", { "index.js": "v1" });
      const r1 = await manager.syncCustomizations("test-client", [makeRef("rev", "nonce-1")]);
      const dir1 = r1[0].pluginDir;
      provider.lockedPaths.add(dir1.path);
      await seedPluginDir("rev", { "index.js": "v2" });
      await manager.syncCustomizations("test-client", [makeRef("rev", "nonce-2")]);
      provider.lockedPaths.clear();
      await fileService.del(dir1, { recursive: true });
      const manager2 = new AgentPluginManager(basePath, fileService, new NullLogService());
      await manager2.syncCustomizations("test-client", [makeRef("rev", "nonce-2")]);
      assert.deepStrictEqual(await readCacheNonces(), /* @__PURE__ */ new Set(["nonce-2"]));
    });
    test("serializes concurrent syncs of the same URI", async () => {
      await seedPluginDir("concurrent", { "index.js": "v1" });
      const ref = makeRef("concurrent", "n1");
      const [r1, r2] = await Promise.all([
        manager.syncCustomizations("test-client", [ref]),
        manager.syncCustomizations("test-client", [ref])
      ]);
      assert.strictEqual(r1[0].customization.load?.kind, "loaded");
      assert.strictEqual(r2[0].customization.load?.kind, "loaded");
    });
    test("waits for cache initialization before starting concurrent syncs", async () => {
      await seedPluginDir("concurrent", { "index.js": "v1" });
      await manager.syncCustomizations("test-client", [makeRef("concurrent", "n1")]);
      const manager2 = new AgentPluginManager(basePath, fileService, new NullLogService());
      const cacheReadBarrier = provider.cacheReadBarrier = new DeferredPromise();
      const firstSync = manager2.syncCustomizations("test-client", [makeRef("concurrent", "n2")]);
      await provider.cacheReadStarted.p;
      const secondSync = manager2.syncCustomizations("test-client", [makeRef("concurrent", "n2")]);
      cacheReadBarrier.complete();
      await Promise.all([firstSync, secondSync]);
      assert.strictEqual(provider.operationLog[0], "cache-read-complete");
    });
  });
  suite("LRU eviction", () => {
    test("evicts least recently used plugins when limit exceeded", async () => {
      const smallManager = new AgentPluginManager(basePath, fileService, new NullLogService(), 3);
      for (let i = 1; i <= 4; i++) {
        await seedPluginDir(`plugin-${i}`, { "index.js": `p${i}` });
        await smallManager.syncCustomizations("test-client", [makeRef(`plugin-${i}`, `n${i}`)]);
      }
      const evictedDir = URI.joinPath(basePath, "agentPlugins");
      const listing = await fileService.resolve(evictedDir);
      assert.ok(listing.children);
      const pluginDirs = listing.children.filter((c) => c.isDirectory);
      assert.strictEqual(pluginDirs.length, 3, "should have exactly 3 plugin dirs after eviction");
    });
    test("retains a locked LRU candidate and skips ahead to evict an unlocked one", async () => {
      const smallManager = new AgentPluginManager(basePath, fileService, new NullLogService(), 2);
      await seedPluginDir("plugin-1", { "index.js": "p1" });
      const r1 = await smallManager.syncCustomizations("client-1", [makeRef("plugin-1", "n1")]);
      const dir1 = r1[0].pluginDir;
      await seedPluginDir("plugin-2", { "index.js": "p2" });
      const r2 = await smallManager.syncCustomizations("client-2", [makeRef("plugin-2", "n2")]);
      const dir2 = r2[0].pluginDir;
      provider.lockedPaths.add(dir1.path);
      await seedPluginDir("plugin-3", { "index.js": "p3" });
      await smallManager.syncCustomizations("client-3", [makeRef("plugin-3", "n3")]);
      assert.strictEqual(await fileService.exists(dir1), true, "locked plugin-1 should be retained");
      assert.strictEqual(await fileService.exists(dir2), false, "unlocked plugin-2 should be evicted");
    });
  });
  suite("cache persistence", () => {
    test("restores nonce cache from disk on new manager instance", async () => {
      await seedPluginDir("persist1", { "index.js": "v1" });
      const ref = makeRef("persist1", "nonce-persist");
      await manager.syncCustomizations("test-client", [ref]);
      const manager2 = new AgentPluginManager(basePath, fileService, new NullLogService());
      const result = await manager2.syncCustomizations("test-client", [ref]);
      assert.strictEqual(result[0].customization.load?.kind, "loaded");
      assert.ok(result[0].pluginDir);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudFBsdWdpbk1hbmFnZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZURlbGV0ZU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBBR0VOVF9DTElFTlRfU0NIRU1FLCB0b0FnZW50Q2xpZW50VXJpIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50Q2xpZW50VXJpLmpzJztcbmltcG9ydCB7IGN1c3RvbWl6YXRpb25JZCwgdHlwZSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uLCB0eXBlIFBsdWdpbkN1c3RvbWl6YXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IEFnZW50UGx1Z2luTWFuYWdlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRQbHVnaW5NYW5hZ2VyLmpzJztcblxuLyoqXG4gKiBJbi1tZW1vcnkgcHJvdmlkZXIgdGhhdCBjYW4gc2ltdWxhdGUgYSBsb2NrZWQgKHVuZGVsZXRhYmxlKSByZXNvdXJjZSwgbGlrZSBhXG4gKiBkaXJlY3Rvcnkgc3RpbGwgaGVsZCBieSBhIHJ1bm5pbmcgc2Vzc2lvbiwgc28gZXZpY3Rpb24gZmFpbHMgd2l0aCBhbiBlcnJvci5cbiAqL1xuY2xhc3MgTG9ja2FibGVJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciBleHRlbmRzIEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIHtcblx0cmVhZG9ubHkgbG9ja2VkUGF0aHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cmVhZG9ubHkgY2FjaGVSZWFkU3RhcnRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0cmVhZG9ubHkgb3BlcmF0aW9uTG9nOiBzdHJpbmdbXSA9IFtdO1xuXHRjYWNoZVJlYWRCYXJyaWVyOiBEZWZlcnJlZFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cblx0b3ZlcnJpZGUgYXN5bmMgZGVsZXRlKHJlc291cmNlOiBVUkksIG9wdHM6IElGaWxlRGVsZXRlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGZvciAoY29uc3QgbG9ja2VkIG9mIHRoaXMubG9ja2VkUGF0aHMpIHtcblx0XHRcdGlmIChyZXNvdXJjZS5wYXRoLmluY2x1ZGVzKGxvY2tlZCkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFQlVTWTogcmVzb3VyY2UgYnVzeSBvciBsb2NrZWQnKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHN1cGVyLmRlbGV0ZShyZXNvdXJjZSwgb3B0cyk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyByZWFkRmlsZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxVaW50OEFycmF5PiB7XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHN1cGVyLnJlYWRGaWxlKHJlc291cmNlKTtcblx0XHRpZiAodGhpcy5jYWNoZVJlYWRCYXJyaWVyICYmIHJlc291cmNlLnBhdGguZW5kc1dpdGgoJy9hZ2VudFBsdWdpbnMvY2FjaGUuanNvbicpKSB7XG5cdFx0XHR0aGlzLmNhY2hlUmVhZFN0YXJ0ZWQuY29tcGxldGUoKTtcblx0XHRcdGF3YWl0IHRoaXMuY2FjaGVSZWFkQmFycmllci5wO1xuXHRcdFx0dGhpcy5vcGVyYXRpb25Mb2cucHVzaCgnY2FjaGUtcmVhZC1jb21wbGV0ZScpO1xuXHRcdH1cblx0XHRyZXR1cm4gY29udGVudDtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIG1rZGlyKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5jYWNoZVJlYWRCYXJyaWVyICYmIHJlc291cmNlLnBhdGguaW5jbHVkZXMoJy9hZ2VudFBsdWdpbnMvJykgJiYgIXJlc291cmNlLnBhdGguZW5kc1dpdGgoJy9jYWNoZS5qc29uJykpIHtcblx0XHRcdHRoaXMub3BlcmF0aW9uTG9nLnB1c2goJ3BsdWdpbi1tYXRlcmlhbGl6ZScpO1xuXHRcdH1cblx0XHRyZXR1cm4gc3VwZXIubWtkaXIocmVzb3VyY2UpO1xuXHR9XG59XG5cbnN1aXRlKCdBZ2VudFBsdWdpbk1hbmFnZXInLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBmaWxlU2VydmljZTogRmlsZVNlcnZpY2U7XG5cdGxldCBwcm92aWRlcjogTG9ja2FibGVJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcjtcblx0bGV0IG1hbmFnZXI6IEFnZW50UGx1Z2luTWFuYWdlcjtcblx0Y29uc3QgYmFzZVBhdGggPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy91c2VyRGF0YScgfSk7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBMb2NrYWJsZUluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuaW5NZW1vcnksIHByb3ZpZGVyKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoQUdFTlRfQ0xJRU5UX1NDSEVNRSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdG1hbmFnZXIgPSBuZXcgQWdlbnRQbHVnaW5NYW5hZ2VyKGJhc2VQYXRoLCBmaWxlU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiBkaXNwb3NhYmxlcy5jbGVhcigpKTtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gcGx1Z2luVXJpKG5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiBgL3BsdWdpbnMvJHtuYW1lfWAgfSkudG9TdHJpbmcoKTtcblx0fVxuXG5cdGZ1bmN0aW9uIG1ha2VSZWYobmFtZTogc3RyaW5nLCBub25jZT86IHN0cmluZyk6IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb24ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaShuYW1lKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLFxuXHRcdFx0aWQ6IGN1c3RvbWl6YXRpb25JZCh1cmkpLFxuXHRcdFx0dXJpLFxuXHRcdFx0bmFtZTogYFBsdWdpbiAke25hbWV9YCxcblx0XHRcdC4uLihub25jZSAhPT0gdW5kZWZpbmVkID8geyBub25jZSB9IDoge30pLFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBzZWVkUGx1Z2luRGlyKG5hbWU6IHN0cmluZywgZmlsZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBvcmlnaW5hbFVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiBgL3BsdWdpbnMvJHtuYW1lfWAgfSk7XG5cdFx0Y29uc3QgYWdlbnRDbGllbnREaXIgPSB0b0FnZW50Q2xpZW50VXJpKG9yaWdpbmFsVXJpLCAndGVzdC1jbGllbnQnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIoYWdlbnRDbGllbnREaXIpO1xuXHRcdGZvciAoY29uc3QgW2ZpbGVOYW1lLCBjb250ZW50XSBvZiBPYmplY3QuZW50cmllcyhmaWxlcykpIHtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuam9pblBhdGgoYWdlbnRDbGllbnREaXIsIGZpbGVOYW1lKSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gcmVhZENhY2hlTm9uY2VzKCk6IFByb21pc2U8U2V0PHN0cmluZz4+IHtcblx0XHRjb25zdCBjYWNoZVBhdGggPSBVUkkuam9pblBhdGgoYmFzZVBhdGgsICdhZ2VudFBsdWdpbnMnLCAnY2FjaGUuanNvbicpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShjYWNoZVBhdGgpO1xuXHRcdGNvbnN0IGVudHJpZXM6IHsgdXJpOiBzdHJpbmc7IG5vbmNlOiBzdHJpbmcgfVtdID0gSlNPTi5wYXJzZShjb250ZW50LnZhbHVlLnRvU3RyaW5nKCkpO1xuXHRcdHJldHVybiBuZXcgU2V0KGVudHJpZXMubWFwKGVudHJ5ID0+IGVudHJ5Lm5vbmNlKSk7XG5cdH1cblxuXHQvLyAtLS0tIHN5bmNDdXN0b21pemF0aW9ucyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3N5bmNDdXN0b21pemF0aW9ucycsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JldHVybnMgbG9hZGVkIHN0YXR1cyBhbmQgcGx1Z2luRGlyIGZvciBlYWNoIHN5bmNlZCBwbHVnaW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBzZWVkUGx1Z2luRGlyKCdhbHBoYScsIHsgJ2luZGV4LmpzJzogJ2EnIH0pO1xuXHRcdFx0YXdhaXQgc2VlZFBsdWdpbkRpcignYmV0YScsIHsgJ2luZGV4LmpzJzogJ2InIH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgbWFuYWdlci5zeW5jQ3VzdG9taXphdGlvbnMoJ3Rlc3QtY2xpZW50JywgW1xuXHRcdFx0XHRtYWtlUmVmKCdhbHBoYScsICduMScpLFxuXHRcdFx0XHRtYWtlUmVmKCdiZXRhJywgJ24yJyksXG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRzWzBdLmN1c3RvbWl6YXRpb24ubG9hZD8ua2luZCwgJ2xvYWRlZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdHNbMF0ucGx1Z2luRGlyLCAnc2hvdWxkIGhhdmUgcGx1Z2luRGlyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0c1sxXS5jdXN0b21pemF0aW9uLmxvYWQ/LmtpbmQsICdsb2FkZWQnKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHRzWzFdLnBsdWdpbkRpciwgJ3Nob3VsZCBoYXZlIHBsdWdpbkRpcicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBlcnJvciBzdGF0dXMgd2l0aG91dCBwbHVnaW5EaXIgd2hlbiBzb3VyY2UgbWlzc2luZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBtYW5hZ2VyLnN5bmNDdXN0b21pemF0aW9ucygndGVzdC1jbGllbnQnLCBbbWFrZVJlZignbm9uZXhpc3RlbnQnKV0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdHNbMF0uY3VzdG9taXphdGlvbi5sb2FkPy5raW5kLCAnZXJyb3InKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHRzWzBdLmN1c3RvbWl6YXRpb24ubG9hZD8ua2luZCA9PT0gJ2Vycm9yJyAmJiByZXN1bHRzWzBdLmN1c3RvbWl6YXRpb24ubG9hZC5tZXNzYWdlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRzWzBdLnBsdWdpbkRpciwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21peGVzIGxvYWRlZCBhbmQgZXJyb3IgcmVzdWx0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHNlZWRQbHVnaW5EaXIoJ2dvb2QnLCB7ICdpbmRleC5qcyc6ICdvaycgfSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBtYW5hZ2VyLnN5bmNDdXN0b21pemF0aW9ucygndGVzdC1jbGllbnQnLCBbXG5cdFx0XHRcdG1ha2VSZWYoJ2dvb2QnLCAnbjEnKSxcblx0XHRcdFx0bWFrZVJlZignbWlzc2luZycpLFxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0c1sxXS5jdXN0b21pemF0aW9uLmxvYWQ/LmtpbmQsICdlcnJvcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdHNbMV0ucGx1Z2luRGlyLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmlyZXMgcHJvZ3Jlc3MgY2FsbGJhY2sgd2l0aCBjaGFuZ2VkIGN1c3RvbWl6YXRpb24gc3RhdHVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgc2VlZFBsdWdpbkRpcigncHJvZycsIHsgJ2luZGV4LmpzJzogJ2NvbnRlbnQnIH0pO1xuXG5cdFx0XHRjb25zdCBwcm9ncmVzc0NhbGxzOiBQbHVnaW5DdXN0b21pemF0aW9uW10gPSBbXTtcblx0XHRcdGF3YWl0IG1hbmFnZXIuc3luY0N1c3RvbWl6YXRpb25zKCd0ZXN0LWNsaWVudCcsIFttYWtlUmVmKCdwcm9nJywgJ24xJyldLCBzdGF0dXMgPT4ge1xuXHRcdFx0XHRwcm9ncmVzc0NhbGxzLnB1c2goc3RhdHVzKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb2dyZXNzQ2FsbHMubWFwKGNhbGwgPT4gY2FsbC5sb2FkPy5raW5kKSwgWydsb2FkZWQnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lwcyBjb3B5IHdoZW4gbm9uY2UgbWF0Y2hlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHNlZWRQbHVnaW5EaXIoJ2NhY2hlZCcsIHsgJ2luZGV4LmpzJzogJ3YxJyB9KTtcblx0XHRcdGNvbnN0IHJlZiA9IG1ha2VSZWYoJ2NhY2hlZCcsICdub25jZS1hYmMnKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0MSA9IGF3YWl0IG1hbmFnZXIuc3luY0N1c3RvbWl6YXRpb25zKCd0ZXN0LWNsaWVudCcsIFtyZWZdKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQxWzBdLnBsdWdpbkRpcik7XG5cblx0XHRcdC8vIFNlY29uZCBzeW5jIHdpdGggc2FtZSBub25jZSBzaG91bGQgc3RpbGwgc3VjY2VlZCAoZnJvbSBjYWNoZSlcblx0XHRcdGNvbnN0IHJlc3VsdDIgPSBhd2FpdCBtYW5hZ2VyLnN5bmNDdXN0b21pemF0aW9ucygndGVzdC1jbGllbnQnLCBbcmVmXSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0MlswXS5wbHVnaW5EaXIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDFbMF0ucGx1Z2luRGlyIS50b1N0cmluZygpLCByZXN1bHQyWzBdLnBsdWdpbkRpciEudG9TdHJpbmcoKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCduZXcgbm9uY2UgbWF0ZXJpYWxpemVzIGEgZnJlc2ggc3ViZGlyZWN0b3J5IGFuZCBldmljdHMgdGhlIHN0YWxlIG9uZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHNlZWRQbHVnaW5EaXIoJ3JldicsIHsgJ2luZGV4LmpzJzogJ3YxJyB9KTtcblxuXHRcdFx0Y29uc3QgcjEgPSBhd2FpdCBtYW5hZ2VyLnN5bmNDdXN0b21pemF0aW9ucygndGVzdC1jbGllbnQnLCBbbWFrZVJlZigncmV2JywgJ25vbmNlLTEnKV0pO1xuXHRcdFx0Y29uc3QgZGlyMSA9IHIxWzBdLnBsdWdpbkRpciE7XG5cblx0XHRcdC8vIFJlLXNlZWQgd2l0aCBuZXcgY29udGVudCBhbmQgc3luYyB3aXRoIGEgZGlmZmVyZW50IG5vbmNlLlxuXHRcdFx0YXdhaXQgc2VlZFBsdWdpbkRpcigncmV2JywgeyAnaW5kZXguanMnOiAndjInIH0pO1xuXHRcdFx0Y29uc3QgcjIgPSBhd2FpdCBtYW5hZ2VyLnN5bmNDdXN0b21pemF0aW9ucygndGVzdC1jbGllbnQnLCBbbWFrZVJlZigncmV2JywgJ25vbmNlLTInKV0pO1xuXHRcdFx0Y29uc3QgZGlyMiA9IHIyWzBdLnBsdWdpbkRpciE7XG5cblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChkaXIxLnRvU3RyaW5nKCksIGRpcjIudG9TdHJpbmcoKSwgJ25ldyBub25jZSBzaG91bGQgdXNlIGEgbmV3IHN1YmRpcmVjdG9yeScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhkaXIyKSwgdHJ1ZSwgJ25ldyBub25jZSBzdWJkaXJlY3Rvcnkgc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKGRpcjEpLCBmYWxzZSwgJ3N0YWxlIG5vbmNlIHN1YmRpcmVjdG9yeSBzaG91bGQgYmUgZXZpY3RlZCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCByZWFkQ2FjaGVOb25jZXMoKSwgbmV3IFNldChbJ25vbmNlLTInXSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0YWlucyBhIGxvY2tlZCBvbGRlciBub25jZSBzbyBib3RoIHJldmlzaW9ucyBjb2V4aXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgc2VlZFBsdWdpbkRpcigncmV2JywgeyAnaW5kZXguanMnOiAndjEnIH0pO1xuXHRcdFx0Y29uc3QgcjEgPSBhd2FpdCBtYW5hZ2VyLnN5bmNDdXN0b21pemF0aW9ucygndGVzdC1jbGllbnQnLCBbbWFrZVJlZigncmV2JywgJ25vbmNlLTEnKV0pO1xuXHRcdFx0Y29uc3QgZGlyMSA9IHIxWzBdLnBsdWdpbkRpciE7XG5cblx0XHRcdC8vIFNpbXVsYXRlIGEgc2Vzc2lvbiBzdGlsbCBob2xkaW5nIHRoZSBmaXJzdCByZXZpc2lvbi5cblx0XHRcdHByb3ZpZGVyLmxvY2tlZFBhdGhzLmFkZChkaXIxLnBhdGgpO1xuXG5cdFx0XHRhd2FpdCBzZWVkUGx1Z2luRGlyKCdyZXYnLCB7ICdpbmRleC5qcyc6ICd2MicgfSk7XG5cdFx0XHRjb25zdCByMiA9IGF3YWl0IG1hbmFnZXIuc3luY0N1c3RvbWl6YXRpb25zKCd0ZXN0LWNsaWVudCcsIFttYWtlUmVmKCdyZXYnLCAnbm9uY2UtMicpXSk7XG5cdFx0XHRjb25zdCBkaXIyID0gcjJbMF0ucGx1Z2luRGlyITtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhkaXIxKSwgdHJ1ZSwgJ2xvY2tlZCBvbGRlciBub25jZSBzaG91bGQgYmUgcmV0YWluZWQgb24gZGlzaycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhkaXIyKSwgdHJ1ZSwgJ25ldyBub25jZSBzdWJkaXJlY3Rvcnkgc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHJlYWRDYWNoZU5vbmNlcygpLCBuZXcgU2V0KFsnbm9uY2UtMScsICdub25jZS0yJ10pKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V2aWN0cyBhIHByZXZpb3VzbHkgbG9ja2VkIG9sZGVyIG5vbmNlIG9uIHN0YXJ0dXAgb25jZSByZWxlYXNlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHNlZWRQbHVnaW5EaXIoJ3JldicsIHsgJ2luZGV4LmpzJzogJ3YxJyB9KTtcblx0XHRcdGNvbnN0IHIxID0gYXdhaXQgbWFuYWdlci5zeW5jQ3VzdG9taXphdGlvbnMoJ3Rlc3QtY2xpZW50JywgW21ha2VSZWYoJ3JldicsICdub25jZS0xJyldKTtcblx0XHRcdGNvbnN0IGRpcjEgPSByMVswXS5wbHVnaW5EaXIhO1xuXHRcdFx0cHJvdmlkZXIubG9ja2VkUGF0aHMuYWRkKGRpcjEucGF0aCk7XG5cblx0XHRcdGF3YWl0IHNlZWRQbHVnaW5EaXIoJ3JldicsIHsgJ2luZGV4LmpzJzogJ3YyJyB9KTtcblx0XHRcdGF3YWl0IG1hbmFnZXIuc3luY0N1c3RvbWl6YXRpb25zKCd0ZXN0LWNsaWVudCcsIFttYWtlUmVmKCdyZXYnLCAnbm9uY2UtMicpXSk7XG5cblx0XHRcdC8vIFJlbGVhc2UgdGhlIGxvY2sgYW5kIHN0YXJ0IGEgZnJlc2ggbWFuYWdlciBhZ2FpbnN0IHRoZSBzYW1lIGJhc2UgcGF0aC5cblx0XHRcdHByb3ZpZGVyLmxvY2tlZFBhdGhzLmNsZWFyKCk7XG5cdFx0XHRjb25zdCBtYW5hZ2VyMiA9IG5ldyBBZ2VudFBsdWdpbk1hbmFnZXIoYmFzZVBhdGgsIGZpbGVTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRhd2FpdCBtYW5hZ2VyMi5zeW5jQ3VzdG9taXphdGlvbnMoJ3Rlc3QtY2xpZW50JywgW21ha2VSZWYoJ3JldicsICdub25jZS0yJyldKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhkaXIxKSwgZmFsc2UsICdyZWxlYXNlZCBvbGRlciBub25jZSBzaG91bGQgYmUgZXZpY3RlZCBvbiBzdGFydHVwJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHJlYWRDYWNoZU5vbmNlcygpLCBuZXcgU2V0KFsnbm9uY2UtMiddKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkcm9wcyBhIHN0YWxlIGNhY2hlIGVudHJ5IHdoZW4gaXRzIGRpcmVjdG9yeSBpcyBhbHJlYWR5IGdvbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBzZWVkUGx1Z2luRGlyKCdyZXYnLCB7ICdpbmRleC5qcyc6ICd2MScgfSk7XG5cdFx0XHRjb25zdCByMSA9IGF3YWl0IG1hbmFnZXIuc3luY0N1c3RvbWl6YXRpb25zKCd0ZXN0LWNsaWVudCcsIFttYWtlUmVmKCdyZXYnLCAnbm9uY2UtMScpXSk7XG5cdFx0XHRjb25zdCBkaXIxID0gcjFbMF0ucGx1Z2luRGlyITtcblx0XHRcdHByb3ZpZGVyLmxvY2tlZFBhdGhzLmFkZChkaXIxLnBhdGgpO1xuXG5cdFx0XHRhd2FpdCBzZWVkUGx1Z2luRGlyKCdyZXYnLCB7ICdpbmRleC5qcyc6ICd2MicgfSk7XG5cdFx0XHRhd2FpdCBtYW5hZ2VyLnN5bmNDdXN0b21pemF0aW9ucygndGVzdC1jbGllbnQnLCBbbWFrZVJlZigncmV2JywgJ25vbmNlLTInKV0pO1xuXG5cdFx0XHRwcm92aWRlci5sb2NrZWRQYXRocy5jbGVhcigpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2UuZGVsKGRpcjEsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0Y29uc3QgbWFuYWdlcjIgPSBuZXcgQWdlbnRQbHVnaW5NYW5hZ2VyKGJhc2VQYXRoLCBmaWxlU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0YXdhaXQgbWFuYWdlcjIuc3luY0N1c3RvbWl6YXRpb25zKCd0ZXN0LWNsaWVudCcsIFttYWtlUmVmKCdyZXYnLCAnbm9uY2UtMicpXSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgcmVhZENhY2hlTm9uY2VzKCksIG5ldyBTZXQoWydub25jZS0yJ10pKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NlcmlhbGl6ZXMgY29uY3VycmVudCBzeW5jcyBvZiB0aGUgc2FtZSBVUkknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBzZWVkUGx1Z2luRGlyKCdjb25jdXJyZW50JywgeyAnaW5kZXguanMnOiAndjEnIH0pO1xuXHRcdFx0Y29uc3QgcmVmID0gbWFrZVJlZignY29uY3VycmVudCcsICduMScpO1xuXG5cdFx0XHQvLyBGaXJlIHR3byBzeW5jcyBjb25jdXJyZW50bHlcblx0XHRcdGNvbnN0IFtyMSwgcjJdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRtYW5hZ2VyLnN5bmNDdXN0b21pemF0aW9ucygndGVzdC1jbGllbnQnLCBbcmVmXSksXG5cdFx0XHRcdG1hbmFnZXIuc3luY0N1c3RvbWl6YXRpb25zKCd0ZXN0LWNsaWVudCcsIFtyZWZdKSxcblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBCb3RoIHNob3VsZCBzdWNjZWVkIHdpdGhvdXQgZXJyb3Jcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyMVswXS5jdXN0b21pemF0aW9uLmxvYWQ/LmtpbmQsICdsb2FkZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyMlswXS5jdXN0b21pemF0aW9uLmxvYWQ/LmtpbmQsICdsb2FkZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dhaXRzIGZvciBjYWNoZSBpbml0aWFsaXphdGlvbiBiZWZvcmUgc3RhcnRpbmcgY29uY3VycmVudCBzeW5jcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHNlZWRQbHVnaW5EaXIoJ2NvbmN1cnJlbnQnLCB7ICdpbmRleC5qcyc6ICd2MScgfSk7XG5cdFx0XHRhd2FpdCBtYW5hZ2VyLnN5bmNDdXN0b21pemF0aW9ucygndGVzdC1jbGllbnQnLCBbbWFrZVJlZignY29uY3VycmVudCcsICduMScpXSk7XG5cblx0XHRcdGNvbnN0IG1hbmFnZXIyID0gbmV3IEFnZW50UGx1Z2luTWFuYWdlcihiYXNlUGF0aCwgZmlsZVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGNhY2hlUmVhZEJhcnJpZXIgPSBwcm92aWRlci5jYWNoZVJlYWRCYXJyaWVyID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0Y29uc3QgZmlyc3RTeW5jID0gbWFuYWdlcjIuc3luY0N1c3RvbWl6YXRpb25zKCd0ZXN0LWNsaWVudCcsIFttYWtlUmVmKCdjb25jdXJyZW50JywgJ24yJyldKTtcblx0XHRcdGF3YWl0IHByb3ZpZGVyLmNhY2hlUmVhZFN0YXJ0ZWQucDtcblxuXHRcdFx0Y29uc3Qgc2Vjb25kU3luYyA9IG1hbmFnZXIyLnN5bmNDdXN0b21pemF0aW9ucygndGVzdC1jbGllbnQnLCBbbWFrZVJlZignY29uY3VycmVudCcsICduMicpXSk7XG5cdFx0XHRjYWNoZVJlYWRCYXJyaWVyLmNvbXBsZXRlKCk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbZmlyc3RTeW5jLCBzZWNvbmRTeW5jXSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5vcGVyYXRpb25Mb2dbMF0sICdjYWNoZS1yZWFkLWNvbXBsZXRlJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gTFJVIGV2aWN0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnTFJVIGV2aWN0aW9uJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZXZpY3RzIGxlYXN0IHJlY2VudGx5IHVzZWQgcGx1Z2lucyB3aGVuIGxpbWl0IGV4Y2VlZGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc21hbGxNYW5hZ2VyID0gbmV3IEFnZW50UGx1Z2luTWFuYWdlcihiYXNlUGF0aCwgZmlsZVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCAzKTtcblxuXHRcdFx0Zm9yIChsZXQgaSA9IDE7IGkgPD0gNDsgaSsrKSB7XG5cdFx0XHRcdGF3YWl0IHNlZWRQbHVnaW5EaXIoYHBsdWdpbi0ke2l9YCwgeyAnaW5kZXguanMnOiBgcCR7aX1gIH0pO1xuXHRcdFx0XHRhd2FpdCBzbWFsbE1hbmFnZXIuc3luY0N1c3RvbWl6YXRpb25zKCd0ZXN0LWNsaWVudCcsIFttYWtlUmVmKGBwbHVnaW4tJHtpfWAsIGBuJHtpfWApXSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRoZSBldmljdGVkIGRpciBzaG91bGQgbm8gbG9uZ2VyIGV4aXN0IG9uIGRpc2sgKGNhY2hlLmpzb24gKyAzIHBsdWdpbiBkaXJzKVxuXHRcdFx0Y29uc3QgZXZpY3RlZERpciA9IFVSSS5qb2luUGF0aChiYXNlUGF0aCwgJ2FnZW50UGx1Z2lucycpO1xuXHRcdFx0Y29uc3QgbGlzdGluZyA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUoZXZpY3RlZERpcik7XG5cdFx0XHRhc3NlcnQub2sobGlzdGluZy5jaGlsZHJlbik7XG5cdFx0XHRjb25zdCBwbHVnaW5EaXJzID0gbGlzdGluZy5jaGlsZHJlbi5maWx0ZXIoYyA9PiBjLmlzRGlyZWN0b3J5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5EaXJzLmxlbmd0aCwgMywgJ3Nob3VsZCBoYXZlIGV4YWN0bHkgMyBwbHVnaW4gZGlycyBhZnRlciBldmljdGlvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0YWlucyBhIGxvY2tlZCBMUlUgY2FuZGlkYXRlIGFuZCBza2lwcyBhaGVhZCB0byBldmljdCBhbiB1bmxvY2tlZCBvbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzbWFsbE1hbmFnZXIgPSBuZXcgQWdlbnRQbHVnaW5NYW5hZ2VyKGJhc2VQYXRoLCBmaWxlU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIDIpO1xuXG5cdFx0XHRhd2FpdCBzZWVkUGx1Z2luRGlyKCdwbHVnaW4tMScsIHsgJ2luZGV4LmpzJzogJ3AxJyB9KTtcblx0XHRcdGNvbnN0IHIxID0gYXdhaXQgc21hbGxNYW5hZ2VyLnN5bmNDdXN0b21pemF0aW9ucygnY2xpZW50LTEnLCBbbWFrZVJlZigncGx1Z2luLTEnLCAnbjEnKV0pO1xuXHRcdFx0Y29uc3QgZGlyMSA9IHIxWzBdLnBsdWdpbkRpciE7XG5cblx0XHRcdGF3YWl0IHNlZWRQbHVnaW5EaXIoJ3BsdWdpbi0yJywgeyAnaW5kZXguanMnOiAncDInIH0pO1xuXHRcdFx0Y29uc3QgcjIgPSBhd2FpdCBzbWFsbE1hbmFnZXIuc3luY0N1c3RvbWl6YXRpb25zKCdjbGllbnQtMicsIFttYWtlUmVmKCdwbHVnaW4tMicsICduMicpXSk7XG5cdFx0XHRjb25zdCBkaXIyID0gcjJbMF0ucGx1Z2luRGlyITtcblxuXHRcdFx0Ly8gTG9jayB0aGUgTFJVIGhlYWQgc28gaXRzIGRpcmVjdG9yeSBjYW4ndCBiZSBkZWxldGVkLlxuXHRcdFx0cHJvdmlkZXIubG9ja2VkUGF0aHMuYWRkKGRpcjEucGF0aCk7XG5cblx0XHRcdGF3YWl0IHNlZWRQbHVnaW5EaXIoJ3BsdWdpbi0zJywgeyAnaW5kZXguanMnOiAncDMnIH0pO1xuXHRcdFx0YXdhaXQgc21hbGxNYW5hZ2VyLnN5bmNDdXN0b21pemF0aW9ucygnY2xpZW50LTMnLCBbbWFrZVJlZigncGx1Z2luLTMnLCAnbjMnKV0pO1xuXG5cdFx0XHQvLyBwbHVnaW4tMSBzaG91bGQgc3Vydml2ZSAobG9ja2VkKSBhbmQgcGx1Z2luLTIgc2hvdWxkIGJlIGV2aWN0ZWQgaW5zdGVhZC5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoZGlyMSksIHRydWUsICdsb2NrZWQgcGx1Z2luLTEgc2hvdWxkIGJlIHJldGFpbmVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKGRpcjIpLCBmYWxzZSwgJ3VubG9ja2VkIHBsdWdpbi0yIHNob3VsZCBiZSBldmljdGVkJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gY2FjaGUgcGVyc2lzdGVuY2UgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnY2FjaGUgcGVyc2lzdGVuY2UnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXN0b3JlcyBub25jZSBjYWNoZSBmcm9tIGRpc2sgb24gbmV3IG1hbmFnZXIgaW5zdGFuY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBzZWVkUGx1Z2luRGlyKCdwZXJzaXN0MScsIHsgJ2luZGV4LmpzJzogJ3YxJyB9KTtcblx0XHRcdGNvbnN0IHJlZiA9IG1ha2VSZWYoJ3BlcnNpc3QxJywgJ25vbmNlLXBlcnNpc3QnKTtcblxuXHRcdFx0Ly8gU3luYyB3aXRoIGZpcnN0IG1hbmFnZXJcblx0XHRcdGF3YWl0IG1hbmFnZXIuc3luY0N1c3RvbWl6YXRpb25zKCd0ZXN0LWNsaWVudCcsIFtyZWZdKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIGEgbmV3IG1hbmFnZXIgcG9pbnRpbmcgdG8gdGhlIHNhbWUgYmFzZSBwYXRoXG5cdFx0XHRjb25zdCBtYW5hZ2VyMiA9IG5ldyBBZ2VudFBsdWdpbk1hbmFnZXIoYmFzZVBhdGgsIGZpbGVTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBtYW5hZ2VyMi5zeW5jQ3VzdG9taXphdGlvbnMoJ3Rlc3QtY2xpZW50JywgW3JlZl0pO1xuXG5cdFx0XHQvLyBTaG91bGQgYmUgbG9hZGVkIGZyb20gY2FjaGUgKG5vbmNlIG1hdGNoKSwgbm90IGVycm9yXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHJlc3VsdFswXS5jdXN0b21pemF0aW9uIGFzIFBsdWdpbkN1c3RvbWl6YXRpb24pLmxvYWQ/LmtpbmQsICdsb2FkZWQnKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHRbMF0ucGx1Z2luRGlyKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMscUJB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RCxhQUFPLFlBQVksV0FBVyxRQUFRLEdBQUcsa0RBQWtEO0FBQUEsSUFDNUYsQ0FBQztBQUVELFNBQUssMkVBQTJFLFlBQVk7QUFDM0YsWUFBTSxlQUFlLElBQUksbUJBQW1CLFVBQVUsYUFBYSxJQUFJLGVBQWUsR0FBRyxDQUFDO0FBRTFGLFlBQU0sY0FBYyxZQUFZLEVBQUUsWUFBWSxLQUFLLENBQUM7QUFDcEQsWUFBTSxLQUFLLE1BQU0sYUFBYSxtQkFBbUIsWUFBWSxDQUFDLFFBQVEsWUFBWSxJQUFJLENBQUMsQ0FBQztBQUN4RixZQUFNLE9BQU8sR0FBRyxDQUFDLEVBQUU7QUFFbkIsWUFBTSxjQUFjLFlBQVksRUFBRSxZQUFZLEtBQUssQ0FBQztBQUNwRCxZQUFNLEtBQUssTUFBTSxhQUFhLG1CQUFtQixZQUFZLENBQUMsUUFBUSxZQUFZLElBQUksQ0FBQyxDQUFDO0FBQ3hGLFlBQU0sT0FBTyxHQUFHLENBQUMsRUFBRTtBQUduQixlQUFTLFlBQVksSUFBSSxLQUFLLElBQUk7QUFFbEMsWUFBTSxjQUFjLFlBQVksRUFBRSxZQUFZLEtBQUssQ0FBQztBQUNwRCxZQUFNLGFBQWEsbUJBQW1CLFlBQVksQ0FBQyxRQUFRLFlBQVksSUFBSSxDQUFDLENBQUM7QUFHN0UsYUFBTyxZQUFZLE1BQU0sWUFBWSxPQUFPLElBQUksR0FBRyxNQUFNLG9DQUFvQztBQUM3RixhQUFPLFlBQVksTUFBTSxZQUFZLE9BQU8sSUFBSSxHQUFHLE9BQU8scUNBQXFDO0FBQUEsSUFDaEcsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUlELFFBQU0scUJBQXFCLE1BQU07QUFFaEMsU0FBSywwREFBMEQsWUFBWTtBQUMxRSxZQUFNLGNBQWMsWUFBWSxFQUFFLFlBQVksS0FBSyxDQUFDO0FBQ3BELFlBQU0sTUFBTSxRQUFRLFlBQVksZUFBZTtBQUcvQyxZQUFNLFFBQVEsbUJBQW1CLGVBQWUsQ0FBQyxHQUFHLENBQUM7QUFHckQsWUFBTSxXQUFXLElBQUksbUJBQW1CLFVBQVUsYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUNuRixZQUFNLFNBQVMsTUFBTSxTQUFTLG1CQUFtQixlQUFlLENBQUMsR0FBRyxDQUFDO0FBR3JFLGFBQU8sWUFBYSxPQUFPLENBQUMsRUFBRSxjQUFzQyxNQUFNLE1BQU0sUUFBUTtBQUN4RixhQUFPLEdBQUcsT0FBTyxDQUFDLEVBQUUsU0FBUztBQUFBLElBQzlCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
