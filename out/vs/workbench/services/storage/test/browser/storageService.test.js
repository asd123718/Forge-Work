import { deepStrictEqual, rejects, strictEqual } from "assert";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { joinPath } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { Storage } from "../../../../../base/parts/storage/common/storage.js";
import { flakySuite } from "../../../../../base/test/common/testUtils.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { FileService } from "../../../../../platform/files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { createSuite } from "../../../../../platform/storage/test/common/storageService.test.js";
import { BrowserStorageService, IndexedDBStorageDatabase } from "../../browser/storageService.js";
import { UserDataProfileService } from "../../../userDataProfile/common/userDataProfileService.js";
async function createStorageService() {
  const disposables = new DisposableStore();
  const logService = new NullLogService();
  const fileService = disposables.add(new FileService(logService));
  const userDataProvider = disposables.add(new InMemoryFileSystemProvider());
  disposables.add(fileService.registerProvider(Schemas.vscodeUserData, userDataProvider));
  const profilesRoot = URI.file("/profiles").with({ scheme: Schemas.inMemory });
  const inMemoryExtraProfileRoot = joinPath(profilesRoot, "extra");
  const inMemoryExtraProfile = {
    id: "id",
    name: "inMemory",
    isDefault: false,
    location: inMemoryExtraProfileRoot,
    globalStorageHome: joinPath(inMemoryExtraProfileRoot, "globalStorageHome"),
    settingsResource: joinPath(inMemoryExtraProfileRoot, "settingsResource"),
    keybindingsResource: joinPath(inMemoryExtraProfileRoot, "keybindingsResource"),
    tasksResource: joinPath(inMemoryExtraProfileRoot, "tasksResource"),
    mcpResource: joinPath(inMemoryExtraProfileRoot, "mcp.json"),
    languageModelsResource: joinPath(inMemoryExtraProfileRoot, "chatLanguageModels.json"),
    snippetsHome: joinPath(inMemoryExtraProfileRoot, "snippetsHome"),
    promptsHome: joinPath(inMemoryExtraProfileRoot, "promptsHome"),
    extensionsResource: joinPath(inMemoryExtraProfileRoot, "extensionsResource"),
    cacheHome: joinPath(inMemoryExtraProfileRoot, "cache"),
    agentPluginsHome: joinPath(inMemoryExtraProfileRoot, "agentPluginsHome")
  };
  const storageService = disposables.add(new BrowserStorageService({ id: "workspace-storage-test" }, disposables.add(new UserDataProfileService(inMemoryExtraProfile)), logService));
  await storageService.initialize();
  return [disposables, storageService];
}
flakySuite("StorageService (browser)", function() {
  const disposables = new DisposableStore();
  let storageService;
  createSuite({
    setup: async () => {
      const res = await createStorageService();
      disposables.add(res[0]);
      storageService = res[1];
      return storageService;
    },
    teardown: async () => {
      await storageService.clear();
      disposables.clear();
    }
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
flakySuite("StorageService (browser specific)", () => {
  const disposables = new DisposableStore();
  let storageService;
  setup(async () => {
    const res = await createStorageService();
    disposables.add(res[0]);
    storageService = res[1];
  });
  teardown(async () => {
    await storageService.clear();
    disposables.clear();
  });
  test.skip("clear", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      storageService.store("bar", "foo", StorageScope.APPLICATION, StorageTarget.MACHINE);
      storageService.store("bar", 3, StorageScope.APPLICATION, StorageTarget.USER);
      storageService.store("bar", "foo", StorageScope.PROFILE, StorageTarget.MACHINE);
      storageService.store("bar", 3, StorageScope.PROFILE, StorageTarget.USER);
      storageService.store("bar", "foo", StorageScope.WORKSPACE, StorageTarget.MACHINE);
      storageService.store("bar", 3, StorageScope.WORKSPACE, StorageTarget.USER);
      await storageService.clear();
      for (const scope of [StorageScope.APPLICATION, StorageScope.PROFILE, StorageScope.WORKSPACE]) {
        for (const target of [StorageTarget.USER, StorageTarget.MACHINE]) {
          strictEqual(storageService.get("bar", scope), void 0);
          strictEqual(storageService.keys(scope, target).length, 0);
        }
      }
    });
  });
  test("application database access shares storage state and fallback", async () => {
    storageService.store("key", "first", StorageScope.APPLICATION, StorageTarget.MACHINE);
    await storageService.flush();
    const before = await storageService.getApplicationStorageValue("key");
    const result = await storageService.compareAndSwapApplicationStorage("key", "first", "second");
    deepStrictEqual({
      before,
      result,
      serviceValue: storageService.get("key", StorageScope.APPLICATION)
    }, {
      before: "first",
      result: { swapped: true, currentValue: "second" },
      serviceValue: "second"
    });
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
flakySuite("IndexDBStorageDatabase (browser)", () => {
  const id = "workspace-storage-db-test";
  const logService = new NullLogService();
  const disposables = new DisposableStore();
  teardown(async () => {
    const storage = disposables.add(await IndexedDBStorageDatabase.create({ id }, logService));
    await storage.clear();
    disposables.clear();
  });
  test("Basics", async () => {
    let storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));
    await storage.init();
    storage.set("bar", "foo");
    storage.set("barNumber", 55);
    storage.set("barBoolean", true);
    storage.set("barUndefined", void 0);
    storage.set("barNull", null);
    strictEqual(storage.get("bar"), "foo");
    strictEqual(storage.get("barNumber"), "55");
    strictEqual(storage.get("barBoolean"), "true");
    strictEqual(storage.get("barUndefined"), void 0);
    strictEqual(storage.get("barNull"), void 0);
    strictEqual(storage.size, 3);
    strictEqual(storage.items.size, 3);
    await storage.close();
    storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));
    await storage.init();
    strictEqual(storage.get("bar"), "foo");
    strictEqual(storage.get("barNumber"), "55");
    strictEqual(storage.get("barBoolean"), "true");
    strictEqual(storage.get("barUndefined"), void 0);
    strictEqual(storage.get("barNull"), void 0);
    strictEqual(storage.size, 3);
    strictEqual(storage.items.size, 3);
    storage.set("bar", "foo2");
    storage.set("barNumber", 552);
    strictEqual(storage.get("bar"), "foo2");
    strictEqual(storage.get("barNumber"), "552");
    await storage.close();
    storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));
    await storage.init();
    strictEqual(storage.get("bar"), "foo2");
    strictEqual(storage.get("barNumber"), "552");
    strictEqual(storage.get("barBoolean"), "true");
    strictEqual(storage.get("barUndefined"), void 0);
    strictEqual(storage.get("barNull"), void 0);
    strictEqual(storage.size, 3);
    strictEqual(storage.items.size, 3);
    storage.delete("bar");
    storage.delete("barNumber");
    storage.delete("barBoolean");
    strictEqual(storage.get("bar", "undefined"), "undefined");
    strictEqual(storage.get("barNumber", "undefinedNumber"), "undefinedNumber");
    strictEqual(storage.get("barBoolean", "undefinedBoolean"), "undefinedBoolean");
    strictEqual(storage.size, 0);
    strictEqual(storage.items.size, 0);
    await storage.close();
    storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));
    await storage.init();
    strictEqual(storage.get("bar", "undefined"), "undefined");
    strictEqual(storage.get("barNumber", "undefinedNumber"), "undefinedNumber");
    strictEqual(storage.get("barBoolean", "undefinedBoolean"), "undefinedBoolean");
    strictEqual(storage.size, 0);
    strictEqual(storage.items.size, 0);
  });
  test("compareAndSwap", async () => {
    const database = disposables.add(await IndexedDBStorageDatabase.create({ id }, logService));
    await database.updateItems({ insert: /* @__PURE__ */ new Map([["key", "first"], ["unrelated", "sentinel"]]) });
    const rejected = await database.compareAndSwap("key", "stale", "second");
    const accepted = await database.compareAndSwap("key", "first", "second");
    const items = await database.getItems();
    const value = await database.getValue("key");
    deepStrictEqual({
      rejected,
      accepted,
      value,
      unrelated: items.get("unrelated")
    }, {
      rejected: { swapped: false, currentValue: "first" },
      accepted: { swapped: true, currentValue: "second" },
      value: "second",
      unrelated: "sentinel"
    });
  });
  test("compareAndSwap rejects after close without modifying stored values", async () => {
    const database = disposables.add(await IndexedDBStorageDatabase.create({ id }, logService));
    await database.updateItems({ insert: /* @__PURE__ */ new Map([["key", "first"], ["unrelated", "sentinel"]]) });
    await database.close();
    await rejects(database.compareAndSwap("key", "first", "second"));
    const reopened = disposables.add(await IndexedDBStorageDatabase.create({ id }, logService));
    const items = await reopened.getItems();
    deepStrictEqual({
      value: items.get("key"),
      unrelated: items.get("unrelated")
    }, {
      value: "first",
      unrelated: "sentinel"
    });
  });
  test("compareAndSwap is atomic across database connections", async () => {
    const databaseA = disposables.add(await IndexedDBStorageDatabase.create({ id }, logService));
    const databaseB = disposables.add(await IndexedDBStorageDatabase.create({ id }, logService));
    await databaseA.updateItems({ insert: /* @__PURE__ */ new Map([["key", "first"]]) });
    const results = await Promise.all([
      databaseA.compareAndSwap("key", "first", "second"),
      databaseB.compareAndSwap("key", "first", "third")
    ]);
    const finalValue = (await databaseA.getItems()).get("key");
    const winner = results.find((result) => result.swapped);
    const loser = results.find((result) => !result.swapped);
    deepStrictEqual({
      swappedCount: results.filter((result) => result.swapped).length,
      finalValue,
      winnerValue: winner?.currentValue,
      loserValue: loser?.currentValue
    }, {
      swappedCount: 1,
      finalValue: winner?.currentValue,
      winnerValue: winner?.currentValue,
      loserValue: winner?.currentValue
    });
  });
  test("Clear", async () => {
    let storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));
    await storage.init();
    storage.set("bar", "foo");
    storage.set("barNumber", 55);
    storage.set("barBoolean", true);
    await storage.close();
    const db = disposables.add(await IndexedDBStorageDatabase.create({ id }, logService));
    storage = disposables.add(new Storage(db));
    await storage.init();
    await db.clear();
    storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));
    await storage.init();
    strictEqual(storage.get("bar"), void 0);
    strictEqual(storage.get("barNumber"), void 0);
    strictEqual(storage.get("barBoolean"), void 0);
    strictEqual(storage.size, 0);
    strictEqual(storage.items.size, 0);
  });
  test("Inserts and Deletes at the same time", async () => {
    let storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));
    await storage.init();
    storage.set("bar", "foo");
    storage.set("barNumber", 55);
    storage.set("barBoolean", true);
    await storage.close();
    storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));
    await storage.init();
    storage.set("bar", "foobar");
    const largeItem = JSON.stringify({ largeItem: "Hello World".repeat(1e3) });
    storage.set("largeItem", largeItem);
    storage.delete("barNumber");
    storage.delete("barBoolean");
    await storage.close();
    storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));
    await storage.init();
    strictEqual(storage.get("bar"), "foobar");
    strictEqual(storage.get("largeItem"), largeItem);
    strictEqual(storage.get("barNumber"), void 0);
    strictEqual(storage.get("barBoolean"), void 0);
  });
  test("Storage change event", async () => {
    const storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));
    let storageChangeEvents = [];
    disposables.add(storage.onDidChangeStorage((e) => storageChangeEvents.push(e)));
    await storage.init();
    storage.set("notExternal", 42);
    let storageValueChangeEvent = storageChangeEvents.find((e) => e.key === "notExternal");
    strictEqual(storageValueChangeEvent?.external, false);
    storageChangeEvents = [];
    storage.set("isExternal", 42, true);
    storageValueChangeEvent = storageChangeEvents.find((e) => e.key === "isExternal");
    strictEqual(storageValueChangeEvent?.external, true);
    storage.delete("notExternal");
    storageValueChangeEvent = storageChangeEvents.find((e) => e.key === "notExternal");
    strictEqual(storageValueChangeEvent?.external, false);
    storage.delete("isExternal", true);
    storageValueChangeEvent = storageChangeEvents.find((e) => e.key === "isExternal");
    strictEqual(storageValueChangeEvent?.external, true);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxzdG9yYWdlXFx0ZXN0XFxicm93c2VyXFxzdG9yYWdlU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGVlcFN0cmljdEVxdWFsLCByZWplY3RzLCBzdHJpY3RFcXVhbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElTdG9yYWdlQ2hhbmdlRXZlbnQsIFN0b3JhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3BhcnRzL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgZmxha3lTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGVzdFV0aWxzLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvdGVzdC9jb21tb24vc3RvcmFnZVNlcnZpY2UudGVzdC5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgQnJvd3NlclN0b3JhZ2VTZXJ2aWNlLCBJbmRleGVkREJTdG9yYWdlRGF0YWJhc2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3N0b3JhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZVNlcnZpY2UuanMnO1xuXG5hc3luYyBmdW5jdGlvbiBjcmVhdGVTdG9yYWdlU2VydmljZSgpOiBQcm9taXNlPFtEaXNwb3NhYmxlU3RvcmUsIEJyb3dzZXJTdG9yYWdlU2VydmljZV0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblxuXHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobG9nU2VydmljZSkpO1xuXG5cdGNvbnN0IHVzZXJEYXRhUHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLnZzY29kZVVzZXJEYXRhLCB1c2VyRGF0YVByb3ZpZGVyKSk7XG5cblx0Y29uc3QgcHJvZmlsZXNSb290ID0gVVJJLmZpbGUoJy9wcm9maWxlcycpLndpdGgoeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnkgfSk7XG5cblx0Y29uc3QgaW5NZW1vcnlFeHRyYVByb2ZpbGVSb290ID0gam9pblBhdGgocHJvZmlsZXNSb290LCAnZXh0cmEnKTtcblx0Y29uc3QgaW5NZW1vcnlFeHRyYVByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUgPSB7XG5cdFx0aWQ6ICdpZCcsXG5cdFx0bmFtZTogJ2luTWVtb3J5Jyxcblx0XHRpc0RlZmF1bHQ6IGZhbHNlLFxuXHRcdGxvY2F0aW9uOiBpbk1lbW9yeUV4dHJhUHJvZmlsZVJvb3QsXG5cdFx0Z2xvYmFsU3RvcmFnZUhvbWU6IGpvaW5QYXRoKGluTWVtb3J5RXh0cmFQcm9maWxlUm9vdCwgJ2dsb2JhbFN0b3JhZ2VIb21lJyksXG5cdFx0c2V0dGluZ3NSZXNvdXJjZTogam9pblBhdGgoaW5NZW1vcnlFeHRyYVByb2ZpbGVSb290LCAnc2V0dGluZ3NSZXNvdXJjZScpLFxuXHRcdGtleWJpbmRpbmdzUmVzb3VyY2U6IGpvaW5QYXRoKGluTWVtb3J5RXh0cmFQcm9maWxlUm9vdCwgJ2tleWJpbmRpbmdzUmVzb3VyY2UnKSxcblx0XHR0YXNrc1Jlc291cmNlOiBqb2luUGF0aChpbk1lbW9yeUV4dHJhUHJvZmlsZVJvb3QsICd0YXNrc1Jlc291cmNlJyksXG5cdFx0bWNwUmVzb3VyY2U6IGpvaW5QYXRoKGluTWVtb3J5RXh0cmFQcm9maWxlUm9vdCwgJ21jcC5qc29uJyksXG5cdFx0bGFuZ3VhZ2VNb2RlbHNSZXNvdXJjZTogam9pblBhdGgoaW5NZW1vcnlFeHRyYVByb2ZpbGVSb290LCAnY2hhdExhbmd1YWdlTW9kZWxzLmpzb24nKSxcblx0XHRzbmlwcGV0c0hvbWU6IGpvaW5QYXRoKGluTWVtb3J5RXh0cmFQcm9maWxlUm9vdCwgJ3NuaXBwZXRzSG9tZScpLFxuXHRcdHByb21wdHNIb21lOiBqb2luUGF0aChpbk1lbW9yeUV4dHJhUHJvZmlsZVJvb3QsICdwcm9tcHRzSG9tZScpLFxuXHRcdGV4dGVuc2lvbnNSZXNvdXJjZTogam9pblBhdGgoaW5NZW1vcnlFeHRyYVByb2ZpbGVSb290LCAnZXh0ZW5zaW9uc1Jlc291cmNlJyksXG5cdFx0Y2FjaGVIb21lOiBqb2luUGF0aChpbk1lbW9yeUV4dHJhUHJvZmlsZVJvb3QsICdjYWNoZScpLFxuXHRcdGFnZW50UGx1Z2luc0hvbWU6IGpvaW5QYXRoKGluTWVtb3J5RXh0cmFQcm9maWxlUm9vdCwgJ2FnZW50UGx1Z2luc0hvbWUnKSxcblx0fTtcblxuXHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQnJvd3NlclN0b3JhZ2VTZXJ2aWNlKHsgaWQ6ICd3b3Jrc3BhY2Utc3RvcmFnZS10ZXN0JyB9LCBkaXNwb3NhYmxlcy5hZGQobmV3IFVzZXJEYXRhUHJvZmlsZVNlcnZpY2UoaW5NZW1vcnlFeHRyYVByb2ZpbGUpKSwgbG9nU2VydmljZSkpO1xuXG5cdGF3YWl0IHN0b3JhZ2VTZXJ2aWNlLmluaXRpYWxpemUoKTtcblxuXHRyZXR1cm4gW2Rpc3Bvc2FibGVzLCBzdG9yYWdlU2VydmljZV07XG59XG5cbmZsYWt5U3VpdGUoJ1N0b3JhZ2VTZXJ2aWNlIChicm93c2VyKScsIGZ1bmN0aW9uICgpIHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBzdG9yYWdlU2VydmljZTogQnJvd3NlclN0b3JhZ2VTZXJ2aWNlO1xuXG5cdGNyZWF0ZVN1aXRlPEJyb3dzZXJTdG9yYWdlU2VydmljZT4oe1xuXHRcdHNldHVwOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXMgPSBhd2FpdCBjcmVhdGVTdG9yYWdlU2VydmljZSgpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHJlc1swXSk7XG5cdFx0XHRzdG9yYWdlU2VydmljZSA9IHJlc1sxXTtcblxuXHRcdFx0cmV0dXJuIHN0b3JhZ2VTZXJ2aWNlO1xuXHRcdH0sXG5cdFx0dGVhcmRvd246IGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHN0b3JhZ2VTZXJ2aWNlLmNsZWFyKCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdH1cblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcblxuZmxha3lTdWl0ZSgnU3RvcmFnZVNlcnZpY2UgKGJyb3dzZXIgc3BlY2lmaWMpJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IHN0b3JhZ2VTZXJ2aWNlOiBCcm93c2VyU3RvcmFnZVNlcnZpY2U7XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IGNyZWF0ZVN0b3JhZ2VTZXJ2aWNlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlc1swXSk7XG5cblx0XHRzdG9yYWdlU2VydmljZSA9IHJlc1sxXTtcblx0fSk7XG5cblx0dGVhcmRvd24oYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHN0b3JhZ2VTZXJ2aWNlLmNsZWFyKCk7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0dGVzdC5za2lwKCdjbGVhcicsICgpID0+IHsgLy8gc2xvdyB0ZXN0IGFuZCBhbHNvIG9ubHkgZXZlciBiZWluZyB1c2VkIGFzIGEgZGV2ZWxvcGVyIGFjdGlvblxuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdiYXInLCAnZm9vJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ2JhcicsIDMsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdiYXInLCAnZm9vJywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnYmFyJywgMywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnYmFyJywgJ2ZvbycsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnYmFyJywgMywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdFx0YXdhaXQgc3RvcmFnZVNlcnZpY2UuY2xlYXIoKTtcblxuXHRcdFx0Zm9yIChjb25zdCBzY29wZSBvZiBbU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRV0pIHtcblx0XHRcdFx0Zm9yIChjb25zdCB0YXJnZXQgb2YgW1N0b3JhZ2VUYXJnZXQuVVNFUiwgU3RvcmFnZVRhcmdldC5NQUNISU5FXSkge1xuXHRcdFx0XHRcdHN0cmljdEVxdWFsKHN0b3JhZ2VTZXJ2aWNlLmdldCgnYmFyJywgc2NvcGUpLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdHN0cmljdEVxdWFsKHN0b3JhZ2VTZXJ2aWNlLmtleXMoc2NvcGUsIHRhcmdldCkubGVuZ3RoLCAwKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBsaWNhdGlvbiBkYXRhYmFzZSBhY2Nlc3Mgc2hhcmVzIHN0b3JhZ2Ugc3RhdGUgYW5kIGZhbGxiYWNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdrZXknLCAnZmlyc3QnLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0YXdhaXQgc3RvcmFnZVNlcnZpY2UuZmx1c2goKTtcblx0XHRjb25zdCBiZWZvcmUgPSBhd2FpdCBzdG9yYWdlU2VydmljZS5nZXRBcHBsaWNhdGlvblN0b3JhZ2VWYWx1ZSgna2V5Jyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc3RvcmFnZVNlcnZpY2UuY29tcGFyZUFuZFN3YXBBcHBsaWNhdGlvblN0b3JhZ2UoJ2tleScsICdmaXJzdCcsICdzZWNvbmQnKTtcblxuXHRcdGRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRiZWZvcmUsXG5cdFx0XHRyZXN1bHQsXG5cdFx0XHRzZXJ2aWNlVmFsdWU6IHN0b3JhZ2VTZXJ2aWNlLmdldCgna2V5JywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSxcblx0XHR9LCB7XG5cdFx0XHRiZWZvcmU6ICdmaXJzdCcsXG5cdFx0XHRyZXN1bHQ6IHsgc3dhcHBlZDogdHJ1ZSwgY3VycmVudFZhbHVlOiAnc2Vjb25kJyB9LFxuXHRcdFx0c2VydmljZVZhbHVlOiAnc2Vjb25kJyxcblx0XHR9KTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcblxuZmxha3lTdWl0ZSgnSW5kZXhEQlN0b3JhZ2VEYXRhYmFzZSAoYnJvd3NlciknLCAoKSA9PiB7XG5cblx0Y29uc3QgaWQgPSAnd29ya3NwYWNlLXN0b3JhZ2UtZGItdGVzdCc7XG5cdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHR0ZWFyZG93bihhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBJbmRleGVkREJTdG9yYWdlRGF0YWJhc2UuY3JlYXRlKHsgaWQgfSwgbG9nU2VydmljZSkpO1xuXHRcdGF3YWl0IHN0b3JhZ2UuY2xlYXIoKTtcblxuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0Jhc2ljcycsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU3RvcmFnZShkaXNwb3NhYmxlcy5hZGQoYXdhaXQgSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlLmNyZWF0ZSh7IGlkIH0sIGxvZ1NlcnZpY2UpKSkpO1xuXG5cdFx0YXdhaXQgc3RvcmFnZS5pbml0KCk7XG5cblx0XHQvLyBJbnNlcnQgaW5pdGlhbCBkYXRhXG5cdFx0c3RvcmFnZS5zZXQoJ2JhcicsICdmb28nKTtcblx0XHRzdG9yYWdlLnNldCgnYmFyTnVtYmVyJywgNTUpO1xuXHRcdHN0b3JhZ2Uuc2V0KCdiYXJCb29sZWFuJywgdHJ1ZSk7XG5cdFx0c3RvcmFnZS5zZXQoJ2JhclVuZGVmaW5lZCcsIHVuZGVmaW5lZCk7XG5cdFx0c3RvcmFnZS5zZXQoJ2Jhck51bGwnLCBudWxsKTtcblxuXHRcdHN0cmljdEVxdWFsKHN0b3JhZ2UuZ2V0KCdiYXInKSwgJ2ZvbycpO1xuXHRcdHN0cmljdEVxdWFsKHN0b3JhZ2UuZ2V0KCdiYXJOdW1iZXInKSwgJzU1Jyk7XG5cdFx0c3RyaWN0RXF1YWwoc3RvcmFnZS5nZXQoJ2JhckJvb2xlYW4nKSwgJ3RydWUnKTtcblx0XHRzdHJpY3RFcXVhbChzdG9yYWdlLmdldCgnYmFyVW5kZWZpbmVkJyksIHVuZGVmaW5lZCk7XG5cdFx0c3RyaWN0RXF1YWwoc3RvcmFnZS5nZXQoJ2Jhck51bGwnKSwgdW5kZWZpbmVkKTtcblxuXHRcdHN0cmljdEVxdWFsKHN0b3JhZ2Uuc2l6ZSwgMyk7XG5cdFx0c3RyaWN0RXF1YWwoc3RvcmFnZS5pdGVtcy5zaXplLCAzKTtcblxuXHRcdGF3YWl0IHN0b3JhZ2UuY2xvc2UoKTtcblxuXHRcdHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFN0b3JhZ2UoZGlzcG9zYWJsZXMuYWRkKGF3YWl0IEluZGV4ZWREQlN0b3JhZ2VEYXRhYmFzZS5jcmVhdGUoeyBpZCB9LCBsb2dTZXJ2aWNlKSkpKTtcblxuXHRcdGF3YWl0IHN0b3JhZ2UuaW5pdCgpO1xuXG5cdFx0Ly8gQ2hlY2sgaW5pdGlhbCBkYXRhIHN0aWxsIHRoZXJlXG5cdFx0c3RyaWN0RXF1YWwoc3RvcmFnZS5nZXQoJ2JhcicpLCAnZm9vJyk7XG5cdFx0c3RyaWN0RXF1YWwoc3RvcmFnZS5nZXQoJ2Jhck51bWJlcicpLCAnNTUnKTtcblx0XHRzdHJpY3RFcXVhbChzdG9yYWdlLmdldCgnYmFyQm9vbGVhbicpLCAndHJ1ZScpO1xuXHRcdHN0cmljdEVxdWFsKHN0b3JhZ2UuZ2V0KCdiYXJVbmRlZmluZWQnKSwgdW5kZWZpbmVkKTtcblx0XHRzdHJpY3RFcXVhbChzdG9yYWdlLmdldCgnYmFyTnVsbCcpLCB1bmRlZmluZWQpO1xuXG5cdFx0c3RyaWN0RXF1YWwoc3RvcmFnZS5zaXplLCAzKTtcblx0XHRzdHJpY3RFcXVhbChzdG9yYWdlLml0ZW1zLnNpemUsIDMpO1xuXG5cdFx0Ly8gVXBkYXRlIGRhdGFcblx0XHRzdG9yYWdlLnNldCgnYmFyJywgJ2ZvbzInKTtcblx0XHRzdG9yYWdlLnNldCgnYmFyTnVtYmVyJywgNTUyKTtcblxuXHRcdHN0cmljdEVxdWFsKHN0b3JhZ2UuZ2V0KCdiYXInKSwgJ2ZvbzInKTtcblx0XHRzdHJpY3RFcXVhbChzdG9yYWdlLmdldCgnYmFyTnVtYmVyJyksICc1NTInKTtcblxuXHRcdGF3YWl0IHN0b3JhZ2UuY2xvc2UoKTtcblxuXHRcdHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFN0b3JhZ2UoZGlzcG9zYWJsZXMuYWRkKGF3YWl0IEluZGV4ZWREQlN0b3JhZ2VEYXRhYmFzZS5jcmVhdGUoeyBpZCB9LCBsb2dTZXJ2aWNlKSkpKTtcblxuXHRcdGF3YWl0IHN0b3JhZ2UuaW5pdCgpO1xuXG5cdFx0Ly8gQ2hlY2sgaW5pdGlhbCBkYXRhIHN0aWxsIHRoZXJlXG5cdFx0c3RyaWN0RXF1YWwoc3RvcmFnZS5nZXQoJ2JhcicpLCAnZm9vMicpO1xuXHRcdHN0cmljdEVxdWFsKHN0b3JhZ2UuZ2V0KCdiYXJOdW1iZXInKSwgJzU1MicpO1xuXHRcdHN0cmljdEVxdWFsKHN0b3JhZ2UuZ2V0KCdiYXJCb29sZWFuJyksICd0cnVlJyk7XG5cdFx0c3RyaWN0RXF1YWwoc3RvcmFnZS5nZXQoJ2JhclVuZGVmaW5lZCcpLCB1bmRlZmluZWQpO1xuXHRcdHN0cmljdEVxdWFsKHN0b3JhZ2UuZ2V0KCdiYXJOdWxsJyksIHVuZGVmaW5lZCk7XG5cblx0XHRzdHJpY3RFcXVhbChzdG9yYWdlLnNpemUsIDMpO1xuXHRcdHN0cmljdEVxdWFsKHN0b3JhZ2UuaXRlbXMuc2l6ZSwgMyk7XG5cblx0XHQvLyBEZWxldGUgZGF0YVxuXHRcdHN0b3JhZ2UuZGVsZXRlKCdiYXInKTtcblx0XHRzdG9yYWdlLmRlbGV0ZSgnYmFyTnVtYmVyJyk7XG5cdFx0c3RvcmFnZS5kZWxldGUoJ2JhckJvb2xlYW4nKTtcblxuXHRcdHN0cmljdEVxdWFsKHN0b3JhZ2UuZ2V0KCdiYXInLCAndW5kZWZpbmVkJyksICd1bmRlZmluZWQnKTtcblx0XHRzdHJpY3RFcXVhbChzdG9yYWdlLmdldCgnYmFyTnVtYmVyJywgJ3VuZGVmaW5lZE51bWJlcicpLCAndW5kZWZpbmVkTnVtYmVyJyk7XG5cdFx0c3RyaWN0RXF1YWwoc3RvcmFnZS5nZXQoJ2JhckJvb2xlYW4nLCAndW5kZWZpbmVkQm9vbGVhbicpLCAndW5kZWZpbmVkQm9vbGVhbicpO1xuXG5cdFx0c3RyaWN0RXF1YWwoc3RvcmFnZS5zaXplLCAwKTtcblx0XHRzdHJpY3RFcXVhbChzdG9yYWdlLml0ZW1zLnNpemUsIDApO1xuXG5cdFx0YXdhaXQgc3RvcmFnZS5jbG9zZSgpO1xuXG5cdFx0c3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU3RvcmFnZShkaXNwb3NhYmxlcy5hZGQoYXdhaXQgSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlLmNyZWF0ZSh7IGlkIH0sIGxvZ1NlcnZpY2UpKSkpO1xuXG5cdFx0YXdhaXQgc3RvcmFnZS5pbml0KCk7XG5cblx0XHRzdHJpY3RFcXVhbChzdG9yYWdlLmdldCgnYmFyJywgJ3VuZGVmaW5lZCcpLCAndW5kZWZpbmVkJyk7XG5cdFx0c3RyaWN0RXF1YWwoc3RvcmFnZS5nZXQoJ2Jhck51bWJlcicsICd1bmRlZmluZWROdW1iZXInKSwgJ3VuZGVmaW5lZE51bWJlcicpO1xuXHRcdHN0cmljdEVxdWFsKHN0b3JhZ2UuZ2V0KCdiYXJCb29sZWFuJywgJ3VuZGVmaW5lZEJvb2xlYW4nKSwgJ3VuZGVmaW5lZEJvb2xlYW4nKTtcblxuXHRcdHN0cmljdEVxdWFsKHN0b3JhZ2Uuc2l6ZSwgMCk7XG5cdFx0c3RyaWN0RXF1YWwoc3RvcmFnZS5pdGVtcy5zaXplLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUFuZFN3YXAnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGF0YWJhc2UgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlLmNyZWF0ZSh7IGlkIH0sIGxvZ1NlcnZpY2UpKTtcblx0XHRhd2FpdCBkYXRhYmFzZS51cGRhdGVJdGVtcyh7IGluc2VydDogbmV3IE1hcChbWydrZXknLCAnZmlyc3QnXSwgWyd1bnJlbGF0ZWQnLCAnc2VudGluZWwnXV0pIH0pO1xuXG5cdFx0Y29uc3QgcmVqZWN0ZWQgPSBhd2FpdCBkYXRhYmFzZS5jb21wYXJlQW5kU3dhcCgna2V5JywgJ3N0YWxlJywgJ3NlY29uZCcpO1xuXHRcdGNvbnN0IGFjY2VwdGVkID0gYXdhaXQgZGF0YWJhc2UuY29tcGFyZUFuZFN3YXAoJ2tleScsICdmaXJzdCcsICdzZWNvbmQnKTtcblx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IGRhdGFiYXNlLmdldEl0ZW1zKCk7XG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBkYXRhYmFzZS5nZXRWYWx1ZSgna2V5Jyk7XG5cblx0XHRkZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVqZWN0ZWQsXG5cdFx0XHRhY2NlcHRlZCxcblx0XHRcdHZhbHVlLFxuXHRcdFx0dW5yZWxhdGVkOiBpdGVtcy5nZXQoJ3VucmVsYXRlZCcpLFxuXHRcdH0sIHtcblx0XHRcdHJlamVjdGVkOiB7IHN3YXBwZWQ6IGZhbHNlLCBjdXJyZW50VmFsdWU6ICdmaXJzdCcgfSxcblx0XHRcdGFjY2VwdGVkOiB7IHN3YXBwZWQ6IHRydWUsIGN1cnJlbnRWYWx1ZTogJ3NlY29uZCcgfSxcblx0XHRcdHZhbHVlOiAnc2Vjb25kJyxcblx0XHRcdHVucmVsYXRlZDogJ3NlbnRpbmVsJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUFuZFN3YXAgcmVqZWN0cyBhZnRlciBjbG9zZSB3aXRob3V0IG1vZGlmeWluZyBzdG9yZWQgdmFsdWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRhdGFiYXNlID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IEluZGV4ZWREQlN0b3JhZ2VEYXRhYmFzZS5jcmVhdGUoeyBpZCB9LCBsb2dTZXJ2aWNlKSk7XG5cdFx0YXdhaXQgZGF0YWJhc2UudXBkYXRlSXRlbXMoeyBpbnNlcnQ6IG5ldyBNYXAoW1sna2V5JywgJ2ZpcnN0J10sIFsndW5yZWxhdGVkJywgJ3NlbnRpbmVsJ11dKSB9KTtcblx0XHRhd2FpdCBkYXRhYmFzZS5jbG9zZSgpO1xuXG5cdFx0YXdhaXQgcmVqZWN0cyhkYXRhYmFzZS5jb21wYXJlQW5kU3dhcCgna2V5JywgJ2ZpcnN0JywgJ3NlY29uZCcpKTtcblxuXHRcdGNvbnN0IHJlb3BlbmVkID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IEluZGV4ZWREQlN0b3JhZ2VEYXRhYmFzZS5jcmVhdGUoeyBpZCB9LCBsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCByZW9wZW5lZC5nZXRJdGVtcygpO1xuXHRcdGRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR2YWx1ZTogaXRlbXMuZ2V0KCdrZXknKSxcblx0XHRcdHVucmVsYXRlZDogaXRlbXMuZ2V0KCd1bnJlbGF0ZWQnKSxcblx0XHR9LCB7XG5cdFx0XHR2YWx1ZTogJ2ZpcnN0Jyxcblx0XHRcdHVucmVsYXRlZDogJ3NlbnRpbmVsJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGFyZUFuZFN3YXAgaXMgYXRvbWljIGFjcm9zcyBkYXRhYmFzZSBjb25uZWN0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkYXRhYmFzZUEgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlLmNyZWF0ZSh7IGlkIH0sIGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBkYXRhYmFzZUIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlLmNyZWF0ZSh7IGlkIH0sIGxvZ1NlcnZpY2UpKTtcblx0XHRhd2FpdCBkYXRhYmFzZUEudXBkYXRlSXRlbXMoeyBpbnNlcnQ6IG5ldyBNYXAoW1sna2V5JywgJ2ZpcnN0J11dKSB9KTtcblxuXHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRkYXRhYmFzZUEuY29tcGFyZUFuZFN3YXAoJ2tleScsICdmaXJzdCcsICdzZWNvbmQnKSxcblx0XHRcdGRhdGFiYXNlQi5jb21wYXJlQW5kU3dhcCgna2V5JywgJ2ZpcnN0JywgJ3RoaXJkJyksXG5cdFx0XSk7XG5cdFx0Y29uc3QgZmluYWxWYWx1ZSA9IChhd2FpdCBkYXRhYmFzZUEuZ2V0SXRlbXMoKSkuZ2V0KCdrZXknKTtcblx0XHRjb25zdCB3aW5uZXIgPSByZXN1bHRzLmZpbmQocmVzdWx0ID0+IHJlc3VsdC5zd2FwcGVkKTtcblx0XHRjb25zdCBsb3NlciA9IHJlc3VsdHMuZmluZChyZXN1bHQgPT4gIXJlc3VsdC5zd2FwcGVkKTtcblxuXHRcdGRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzd2FwcGVkQ291bnQ6IHJlc3VsdHMuZmlsdGVyKHJlc3VsdCA9PiByZXN1bHQuc3dhcHBlZCkubGVuZ3RoLFxuXHRcdFx0ZmluYWxWYWx1ZSxcblx0XHRcdHdpbm5lclZhbHVlOiB3aW5uZXI/LmN1cnJlbnRWYWx1ZSxcblx0XHRcdGxvc2VyVmFsdWU6IGxvc2VyPy5jdXJyZW50VmFsdWUsXG5cdFx0fSwge1xuXHRcdFx0c3dhcHBlZENvdW50OiAxLFxuXHRcdFx0ZmluYWxWYWx1ZTogd2lubmVyPy5jdXJyZW50VmFsdWUsXG5cdFx0XHR3aW5uZXJWYWx1ZTogd2lubmVyPy5jdXJyZW50VmFsdWUsXG5cdFx0XHRsb3NlclZhbHVlOiB3aW5uZXI/LmN1cnJlbnRWYWx1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQ2xlYXInLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFN0b3JhZ2UoZGlzcG9zYWJsZXMuYWRkKGF3YWl0IEluZGV4ZWREQlN0b3JhZ2VEYXRhYmFzZS5jcmVhdGUoeyBpZCB9LCBsb2dTZXJ2aWNlKSkpKTtcblxuXHRcdGF3YWl0IHN0b3JhZ2UuaW5pdCgpO1xuXG5cdFx0c3RvcmFnZS5zZXQoJ2JhcicsICdmb28nKTtcblx0XHRzdG9yYWdlLnNldCgnYmFyTnVtYmVyJywgNTUpO1xuXHRcdHN0b3JhZ2Uuc2V0KCdiYXJCb29sZWFuJywgdHJ1ZSk7XG5cblx0XHRhd2FpdCBzdG9yYWdlLmNsb3NlKCk7XG5cblx0XHRjb25zdCBkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBJbmRleGVkREJTdG9yYWdlRGF0YWJhc2UuY3JlYXRlKHsgaWQgfSwgbG9nU2VydmljZSkpO1xuXHRcdHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFN0b3JhZ2UoZGIpKTtcblxuXHRcdGF3YWl0IHN0b3JhZ2UuaW5pdCgpO1xuXHRcdGF3YWl0IGRiLmNsZWFyKCk7XG5cblx0XHRzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTdG9yYWdlKGRpc3Bvc2FibGVzLmFkZChhd2FpdCBJbmRleGVkREJTdG9yYWdlRGF0YWJhc2UuY3JlYXRlKHsgaWQgfSwgbG9nU2VydmljZSkpKSk7XG5cblx0XHRhd2FpdCBzdG9yYWdlLmluaXQoKTtcblxuXHRcdHN0cmljdEVxdWFsKHN0b3JhZ2UuZ2V0KCdiYXInKSwgdW5kZWZpbmVkKTtcblx0XHRzdHJpY3RFcXVhbChzdG9yYWdlLmdldCgnYmFyTnVtYmVyJyksIHVuZGVmaW5lZCk7XG5cdFx0c3RyaWN0RXF1YWwoc3RvcmFnZS5nZXQoJ2JhckJvb2xlYW4nKSwgdW5kZWZpbmVkKTtcblxuXHRcdHN0cmljdEVxdWFsKHN0b3JhZ2Uuc2l6ZSwgMCk7XG5cdFx0c3RyaWN0RXF1YWwoc3RvcmFnZS5pdGVtcy5zaXplLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnSW5zZXJ0cyBhbmQgRGVsZXRlcyBhdCB0aGUgc2FtZSB0aW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTdG9yYWdlKGRpc3Bvc2FibGVzLmFkZChhd2FpdCBJbmRleGVkREJTdG9yYWdlRGF0YWJhc2UuY3JlYXRlKHsgaWQgfSwgbG9nU2VydmljZSkpKSk7XG5cblx0XHRhd2FpdCBzdG9yYWdlLmluaXQoKTtcblxuXHRcdHN0b3JhZ2Uuc2V0KCdiYXInLCAnZm9vJyk7XG5cdFx0c3RvcmFnZS5zZXQoJ2Jhck51bWJlcicsIDU1KTtcblx0XHRzdG9yYWdlLnNldCgnYmFyQm9vbGVhbicsIHRydWUpO1xuXG5cdFx0YXdhaXQgc3RvcmFnZS5jbG9zZSgpO1xuXG5cdFx0c3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU3RvcmFnZShkaXNwb3NhYmxlcy5hZGQoYXdhaXQgSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlLmNyZWF0ZSh7IGlkIH0sIGxvZ1NlcnZpY2UpKSkpO1xuXG5cdFx0YXdhaXQgc3RvcmFnZS5pbml0KCk7XG5cblx0XHRzdG9yYWdlLnNldCgnYmFyJywgJ2Zvb2JhcicpO1xuXHRcdGNvbnN0IGxhcmdlSXRlbSA9IEpTT04uc3RyaW5naWZ5KHsgbGFyZ2VJdGVtOiAnSGVsbG8gV29ybGQnLnJlcGVhdCgxMDAwKSB9KTtcblx0XHRzdG9yYWdlLnNldCgnbGFyZ2VJdGVtJywgbGFyZ2VJdGVtKTtcblx0XHRzdG9yYWdlLmRlbGV0ZSgnYmFyTnVtYmVyJyk7XG5cdFx0c3RvcmFnZS5kZWxldGUoJ2JhckJvb2xlYW4nKTtcblxuXHRcdGF3YWl0IHN0b3JhZ2UuY2xvc2UoKTtcblxuXHRcdHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFN0b3JhZ2UoZGlzcG9zYWJsZXMuYWRkKGF3YWl0IEluZGV4ZWREQlN0b3JhZ2VEYXRhYmFzZS5jcmVhdGUoeyBpZCB9LCBsb2dTZXJ2aWNlKSkpKTtcblxuXHRcdGF3YWl0IHN0b3JhZ2UuaW5pdCgpO1xuXG5cdFx0c3RyaWN0RXF1YWwoc3RvcmFnZS5nZXQoJ2JhcicpLCAnZm9vYmFyJyk7XG5cdFx0c3RyaWN0RXF1YWwoc3RvcmFnZS5nZXQoJ2xhcmdlSXRlbScpLCBsYXJnZUl0ZW0pO1xuXHRcdHN0cmljdEVxdWFsKHN0b3JhZ2UuZ2V0KCdiYXJOdW1iZXInKSwgdW5kZWZpbmVkKTtcblx0XHRzdHJpY3RFcXVhbChzdG9yYWdlLmdldCgnYmFyQm9vbGVhbicpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdTdG9yYWdlIGNoYW5nZSBldmVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTdG9yYWdlKGRpc3Bvc2FibGVzLmFkZChhd2FpdCBJbmRleGVkREJTdG9yYWdlRGF0YWJhc2UuY3JlYXRlKHsgaWQgfSwgbG9nU2VydmljZSkpKSk7XG5cdFx0bGV0IHN0b3JhZ2VDaGFuZ2VFdmVudHM6IElTdG9yYWdlQ2hhbmdlRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzdG9yYWdlLm9uRGlkQ2hhbmdlU3RvcmFnZShlID0+IHN0b3JhZ2VDaGFuZ2VFdmVudHMucHVzaChlKSkpO1xuXG5cdFx0YXdhaXQgc3RvcmFnZS5pbml0KCk7XG5cblx0XHRzdG9yYWdlLnNldCgnbm90RXh0ZXJuYWwnLCA0Mik7XG5cdFx0bGV0IHN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50ID0gc3RvcmFnZUNoYW5nZUV2ZW50cy5maW5kKGUgPT4gZS5rZXkgPT09ICdub3RFeHRlcm5hbCcpO1xuXHRcdHN0cmljdEVxdWFsKHN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50Py5leHRlcm5hbCwgZmFsc2UpO1xuXHRcdHN0b3JhZ2VDaGFuZ2VFdmVudHMgPSBbXTtcblxuXHRcdHN0b3JhZ2Uuc2V0KCdpc0V4dGVybmFsJywgNDIsIHRydWUpO1xuXHRcdHN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50ID0gc3RvcmFnZUNoYW5nZUV2ZW50cy5maW5kKGUgPT4gZS5rZXkgPT09ICdpc0V4dGVybmFsJyk7XG5cdFx0c3RyaWN0RXF1YWwoc3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQ/LmV4dGVybmFsLCB0cnVlKTtcblxuXHRcdHN0b3JhZ2UuZGVsZXRlKCdub3RFeHRlcm5hbCcpO1xuXHRcdHN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50ID0gc3RvcmFnZUNoYW5nZUV2ZW50cy5maW5kKGUgPT4gZS5rZXkgPT09ICdub3RFeHRlcm5hbCcpO1xuXHRcdHN0cmljdEVxdWFsKHN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50Py5leHRlcm5hbCwgZmFsc2UpO1xuXG5cdFx0c3RvcmFnZS5kZWxldGUoJ2lzRXh0ZXJuYWwnLCB0cnVlKTtcblx0XHRzdG9yYWdlVmFsdWVDaGFuZ2VFdmVudCA9IHN0b3JhZ2VDaGFuZ2VFdmVudHMuZmluZChlID0+IGUua2V5ID09PSAnaXNFeHRlcm5hbCcpO1xuXHRcdHN0cmljdEVxdWFsKHN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50Py5leHRlcm5hbCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGlCQUFpQixTQUFTLG1CQUFtQjtBQUN0RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXO0FBQ3BCLFNBQThCLGVBQWU7QUFDN0MsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxjQUFjLHFCQUFxQjtBQUM1QyxTQUFTLG1CQUFtQjtBQUU1QixTQUFTLHVCQUF1QixnQ0FBZ0M7QUFDaEUsU0FBUyw4QkFBOEI7QUFFdkMsZUFBZSx1QkFBMEU7QUFDeEYsUUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLFFBQU0sYUFBYSxJQUFJLGVBQWU7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
