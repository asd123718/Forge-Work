import assert from "assert";
import { Barrier } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { isEqual, joinPath } from "../../../../base/common/resources.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { IFileService } from "../../../files/common/files.js";
import { IStorageService, StorageScope } from "../../../storage/common/storage.js";
import { IUserDataProfilesService } from "../../../userDataProfile/common/userDataProfile.js";
import { AbstractSynchroniser } from "../../common/abstractSynchronizer.js";
import { Change, IUserDataSyncStoreService, MergeState, SyncResource, SyncStatus, USER_DATA_SYNC_SCHEME } from "../../common/userDataSync.js";
import { UserDataSyncClient, UserDataSyncTestServer } from "./userDataSyncClient.js";
class TestSynchroniser extends AbstractSynchroniser {
  constructor() {
    super(...arguments);
    this.syncBarrier = new Barrier();
    this.syncResult = { hasConflicts: false, hasError: false };
    this.onDoSyncCall = this._register(new Emitter());
    this.failWhenGettingLatestRemoteUserData = false;
    this.version = 1;
    this.cancelled = false;
    this.localResource = joinPath(this.environmentService.userRoamingDataHome, "testResource.json");
    this.onDidTriggerLocalChangeCall = this._register(new Emitter());
  }
  getMachineId() {
    return this.currentMachineIdPromise;
  }
  getLastSyncResource() {
    return this.lastSyncResource;
  }
  getLatestRemoteUserData(refOrLatestData, lastSyncUserData) {
    if (this.failWhenGettingLatestRemoteUserData) {
      throw new Error();
    }
    return super.getLatestRemoteUserData(refOrLatestData, lastSyncUserData);
  }
  async doSync(remoteUserData, lastSyncUserData, strategy, userDataSyncConfiguration) {
    this.cancelled = false;
    this.onDoSyncCall.fire();
    await this.syncBarrier.wait();
    if (this.cancelled) {
      return SyncStatus.Idle;
    }
    return super.doSync(remoteUserData, lastSyncUserData, strategy, userDataSyncConfiguration);
  }
  async generateSyncPreview(remoteUserData) {
    if (this.syncResult.hasError) {
      throw new Error("failed");
    }
    let fileContent = null;
    try {
      fileContent = await this.fileService.readFile(this.localResource);
    } catch (error) {
    }
    return [{
      baseResource: this.localResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
      baseContent: null,
      localResource: this.localResource,
      localContent: fileContent ? fileContent.value.toString() : null,
      remoteResource: this.localResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
      remoteContent: remoteUserData.syncData ? remoteUserData.syncData.content : null,
      previewResource: this.localResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "preview" }),
      ref: remoteUserData.ref,
      localChange: Change.Modified,
      remoteChange: Change.Modified,
      acceptedResource: this.localResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" })
    }];
  }
  async hasRemoteChanged(lastSyncUserData) {
    return true;
  }
  async getMergeResult(resourcePreview, token) {
    return {
      content: resourcePreview.ref,
      localChange: Change.Modified,
      remoteChange: Change.Modified,
      hasConflicts: this.syncResult.hasConflicts
    };
  }
  async getAcceptResult(resourcePreview, resource, content, token) {
    if (isEqual(resource, resourcePreview.localResource)) {
      return {
        content: resourcePreview.localContent,
        localChange: Change.None,
        remoteChange: resourcePreview.localContent === null ? Change.Deleted : Change.Modified
      };
    }
    if (isEqual(resource, resourcePreview.remoteResource)) {
      return {
        content: resourcePreview.remoteContent,
        localChange: resourcePreview.remoteContent === null ? Change.Deleted : Change.Modified,
        remoteChange: Change.None
      };
    }
    if (isEqual(resource, resourcePreview.previewResource)) {
      if (content === void 0) {
        return {
          content: resourcePreview.ref,
          localChange: Change.Modified,
          remoteChange: Change.Modified
        };
      } else {
        return {
          content,
          localChange: content === null ? resourcePreview.localContent !== null ? Change.Deleted : Change.None : Change.Modified,
          remoteChange: content === null ? resourcePreview.remoteContent !== null ? Change.Deleted : Change.None : Change.Modified
        };
      }
    }
    throw new Error(`Invalid Resource: ${resource.toString()}`);
  }
  async applyResult(remoteUserData, lastSyncUserData, resourcePreviews, force) {
    if (resourcePreviews[0][1].localChange === Change.Deleted) {
      await this.fileService.del(this.localResource);
    }
    if (resourcePreviews[0][1].localChange === Change.Added || resourcePreviews[0][1].localChange === Change.Modified) {
      await this.fileService.writeFile(this.localResource, VSBuffer.fromString(resourcePreviews[0][1].content));
    }
    if (resourcePreviews[0][1].remoteChange === Change.Deleted) {
      await this.applyRef(null, remoteUserData.ref);
    }
    if (resourcePreviews[0][1].remoteChange === Change.Added || resourcePreviews[0][1].remoteChange === Change.Modified) {
      await this.applyRef(resourcePreviews[0][1].content, remoteUserData.ref);
    }
  }
  async applyRef(content, ref) {
    const remoteUserData = await this.updateRemoteUserData(content === null ? "" : content, ref);
    await this.updateLastSyncUserData(remoteUserData);
  }
  async stop() {
    this.cancelled = true;
    this.syncBarrier.open();
    super.stop();
  }
  testTriggerLocalChange() {
    this.triggerLocalChange();
  }
  async doTriggerLocalChange() {
    await super.doTriggerLocalChange();
    this.onDidTriggerLocalChangeCall.fire();
  }
  hasLocalData() {
    throw new Error("not implemented");
  }
  async resolveContent(uri) {
    return null;
  }
}
suite("TestSynchronizer - Auto Sync", () => {
  const server = new UserDataSyncTestServer();
  let client;
  teardown(async () => {
    await client.instantiationService.get(IUserDataSyncStoreService).clear();
  });
  const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();
  setup(async () => {
    client = disposableStore.add(new UserDataSyncClient(server));
    await client.setUp();
  });
  test("status is syncing", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      const actual = [];
      disposableStore.add(testObject.onDidChangeStatus((status) => actual.push(status)));
      const promise = Event.toPromise(testObject.onDoSyncCall.event);
      testObject.sync(await client.getLatestRef(testObject.resource));
      await promise;
      assert.deepStrictEqual(actual, [SyncStatus.Syncing]);
      assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
      testObject.stop();
    });
  });
  test("status is set correctly when sync is finished", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncBarrier.open();
      const actual = [];
      disposableStore.add(testObject.onDidChangeStatus((status) => actual.push(status)));
      await testObject.sync(await client.getLatestRef(testObject.resource));
      assert.deepStrictEqual(actual, [SyncStatus.Syncing, SyncStatus.Idle]);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
    });
  });
  test("status is set correctly when sync has errors", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncResult = { hasError: true, hasConflicts: false };
      testObject.syncBarrier.open();
      const actual = [];
      disposableStore.add(testObject.onDidChangeStatus((status) => actual.push(status)));
      try {
        await testObject.sync(await client.getLatestRef(testObject.resource));
        assert.fail("Should fail");
      } catch (e) {
        assert.deepStrictEqual(actual, [SyncStatus.Syncing, SyncStatus.Idle]);
        assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      }
    });
  });
  test("status is set to hasConflicts when asked to sync if there are conflicts", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncResult = { hasConflicts: true, hasError: false };
      testObject.syncBarrier.open();
      await testObject.sync(await client.getLatestRef(testObject.resource));
      assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
      assertConflicts(testObject.conflicts.conflicts, [testObject.localResource]);
    });
  });
  test("sync should not run if syncing already", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      const promise = Event.toPromise(testObject.onDoSyncCall.event);
      testObject.sync(await client.getLatestRef(testObject.resource));
      await promise;
      const actual = [];
      disposableStore.add(testObject.onDidChangeStatus((status) => actual.push(status)));
      await testObject.sync(await client.getLatestRef(testObject.resource));
      assert.deepStrictEqual(actual, []);
      assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
      await testObject.stop();
    });
  });
  test("sync should not run if there are conflicts", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncResult = { hasConflicts: true, hasError: false };
      testObject.syncBarrier.open();
      await testObject.sync(await client.getLatestRef(testObject.resource));
      const actual = [];
      disposableStore.add(testObject.onDidChangeStatus((status) => actual.push(status)));
      await testObject.sync(await client.getLatestRef(testObject.resource));
      assert.deepStrictEqual(actual, []);
      assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
    });
  });
  test("accept preview during conflicts", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncResult = { hasConflicts: true, hasError: false };
      testObject.syncBarrier.open();
      await testObject.sync(await client.getLatestRef(testObject.resource));
      assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
      await testObject.accept(testObject.conflicts.conflicts[0].previewResource);
      assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
      assertConflicts(testObject.conflicts.conflicts, []);
      await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const fileService = client.instantiationService.get(IFileService);
      assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, (await fileService.readFile(testObject.localResource)).value.toString());
    });
  });
  test("accept remote during conflicts", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncBarrier.open();
      await testObject.sync(await client.getLatestRef(testObject.resource));
      const fileService = client.instantiationService.get(IFileService);
      const currentRemoteContent = (await testObject.getRemoteUserData(null)).syncData?.content;
      const newLocalContent = "conflict";
      await fileService.writeFile(testObject.localResource, VSBuffer.fromString(newLocalContent));
      testObject.syncResult = { hasConflicts: true, hasError: false };
      await testObject.sync(await client.getLatestRef(testObject.resource));
      assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
      await testObject.accept(testObject.conflicts.conflicts[0].remoteResource);
      assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
      assertConflicts(testObject.conflicts.conflicts, []);
      await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, currentRemoteContent);
      assert.strictEqual((await fileService.readFile(testObject.localResource)).value.toString(), currentRemoteContent);
    });
  });
  test("accept local during conflicts", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncBarrier.open();
      await testObject.sync(await client.getLatestRef(testObject.resource));
      const fileService = client.instantiationService.get(IFileService);
      const newLocalContent = "conflict";
      await fileService.writeFile(testObject.localResource, VSBuffer.fromString(newLocalContent));
      testObject.syncResult = { hasConflicts: true, hasError: false };
      await testObject.sync(await client.getLatestRef(testObject.resource));
      assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
      await testObject.accept(testObject.conflicts.conflicts[0].localResource);
      assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
      assertConflicts(testObject.conflicts.conflicts, []);
      await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, newLocalContent);
      assert.strictEqual((await fileService.readFile(testObject.localResource)).value.toString(), newLocalContent);
    });
  });
  test("accept new content during conflicts", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncBarrier.open();
      await testObject.sync(await client.getLatestRef(testObject.resource));
      const fileService = client.instantiationService.get(IFileService);
      const newLocalContent = "conflict";
      await fileService.writeFile(testObject.localResource, VSBuffer.fromString(newLocalContent));
      testObject.syncResult = { hasConflicts: true, hasError: false };
      await testObject.sync(await client.getLatestRef(testObject.resource));
      assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
      const mergeContent = "newContent";
      await testObject.accept(testObject.conflicts.conflicts[0].previewResource, mergeContent);
      assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
      assertConflicts(testObject.conflicts.conflicts, []);
      await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, mergeContent);
      assert.strictEqual((await fileService.readFile(testObject.localResource)).value.toString(), mergeContent);
    });
  });
  test("accept delete during conflicts", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncBarrier.open();
      await testObject.sync(await client.getLatestRef(testObject.resource));
      const fileService = client.instantiationService.get(IFileService);
      const newLocalContent = "conflict";
      await fileService.writeFile(testObject.localResource, VSBuffer.fromString(newLocalContent));
      testObject.syncResult = { hasConflicts: true, hasError: false };
      await testObject.sync(await client.getLatestRef(testObject.resource));
      assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
      await testObject.accept(testObject.conflicts.conflicts[0].previewResource, null);
      assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
      assertConflicts(testObject.conflicts.conflicts, []);
      await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, "");
      assert.ok(!await fileService.exists(testObject.localResource));
    });
  });
  test("accept deleted local during conflicts", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncBarrier.open();
      await testObject.sync(await client.getLatestRef(testObject.resource));
      const fileService = client.instantiationService.get(IFileService);
      await fileService.del(testObject.localResource);
      testObject.syncResult = { hasConflicts: true, hasError: false };
      await testObject.sync(await client.getLatestRef(testObject.resource));
      assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
      await testObject.accept(testObject.conflicts.conflicts[0].localResource);
      assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
      assertConflicts(testObject.conflicts.conflicts, []);
      await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, "");
      assert.ok(!await fileService.exists(testObject.localResource));
    });
  });
  test("accept deleted remote during conflicts", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncBarrier.open();
      const fileService = client.instantiationService.get(IFileService);
      await fileService.writeFile(testObject.localResource, VSBuffer.fromString("some content"));
      testObject.syncResult = { hasConflicts: true, hasError: false };
      await testObject.sync(await client.getLatestRef(testObject.resource));
      assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
      await testObject.accept(testObject.conflicts.conflicts[0].remoteResource);
      assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
      assertConflicts(testObject.conflicts.conflicts, []);
      await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      assert.strictEqual((await testObject.getRemoteUserData(null)).syncData, null);
      assert.ok(!await fileService.exists(testObject.localResource));
    });
  });
  test("request latest data on precondition failure", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncBarrier.open();
      await testObject.sync(await client.getLatestRef(testObject.resource));
      testObject.syncBarrier = new Barrier();
      const disposable = testObject.onDoSyncCall.event(async () => {
        disposable.dispose();
        await testObject.applyRef(ref, ref);
        server.reset();
        testObject.syncBarrier.open();
      });
      const ref = await client.getLatestRef(testObject.resource);
      await testObject.sync(await client.getLatestRef(testObject.resource));
      assert.deepStrictEqual(server.requests, [
        { type: "POST", url: `${server.url}/v1/resource/${testObject.resource}`, headers: { "If-Match": ref } },
        { type: "GET", url: `${server.url}/v1/resource/${testObject.resource}/latest`, headers: {} },
        { type: "POST", url: `${server.url}/v1/resource/${testObject.resource}`, headers: { "If-Match": `${parseInt(ref) + 1}` } }
      ]);
    });
  });
  test("no requests are made to server when local change is triggered", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncBarrier.open();
      await testObject.sync(await client.getLatestRef(testObject.resource));
      server.reset();
      const promise = Event.toPromise(testObject.onDidTriggerLocalChangeCall.event);
      testObject.testTriggerLocalChange();
      await promise;
      assert.deepStrictEqual(server.requests, []);
    });
  });
  test("status is reset when getting latest remote data fails", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.failWhenGettingLatestRemoteUserData = true;
      try {
        await testObject.sync(await client.getLatestRef(testObject.resource));
        assert.fail("Should throw an error");
      } catch (error) {
      }
      assert.strictEqual(testObject.status, SyncStatus.Idle);
    });
  });
});
suite("TestSynchronizer - Manual Sync", () => {
  const server = new UserDataSyncTestServer();
  let client;
  teardown(async () => {
    await client.instantiationService.get(IUserDataSyncStoreService).clear();
  });
  const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();
  setup(async () => {
    client = disposableStore.add(new UserDataSyncClient(server));
    await client.setUp();
  });
  test("preview", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncResult = { hasConflicts: false, hasError: false };
      testObject.syncBarrier.open();
      const preview = await testObject.sync(await client.getLatestRef(testObject.resource), true);
      assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
      assertPreviews(preview.resourcePreviews, [testObject.localResource]);
      assert.strictEqual(preview.resourcePreviews[0].mergeState, MergeState.Accepted);
      assertConflicts(testObject.conflicts.conflicts, []);
    });
  });
  test("preview -> accept", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncResult = { hasConflicts: false, hasError: false };
      testObject.syncBarrier.open();
      let preview = await testObject.sync(await client.getLatestRef(testObject.resource), true);
      preview = await testObject.accept(preview.resourcePreviews[0].localResource);
      assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
      assertPreviews(preview.resourcePreviews, [testObject.localResource]);
      assert.strictEqual(preview.resourcePreviews[0].mergeState, MergeState.Accepted);
      assertConflicts(testObject.conflicts.conflicts, []);
    });
  });
  test("preview -> merge -> apply", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncResult = { hasConflicts: false, hasError: false };
      testObject.syncBarrier.open();
      await testObject.sync(await client.getLatestRef(testObject.resource));
      const ref = await client.getLatestRef(testObject.resource);
      let preview = await testObject.sync(ref, true);
      preview = await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      assert.strictEqual(preview, null);
      assertConflicts(testObject.conflicts.conflicts, []);
      assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, ref);
      assert.strictEqual((await client.instantiationService.get(IFileService).readFile(testObject.localResource)).value.toString(), ref);
    });
  });
  test("preview -> accept -> apply", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncResult = { hasConflicts: false, hasError: false };
      testObject.syncBarrier.open();
      await testObject.sync(await client.getLatestRef(testObject.resource));
      const ref = await client.getLatestRef(testObject.resource);
      let preview = await testObject.sync(ref, true);
      preview = await testObject.accept(preview.resourcePreviews[0].previewResource);
      preview = await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      assert.strictEqual(preview, null);
      assertConflicts(testObject.conflicts.conflicts, []);
      assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, ref);
      assert.strictEqual((await client.instantiationService.get(IFileService).readFile(testObject.localResource)).value.toString(), ref);
    });
  });
  test("preivew -> discard", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncResult = { hasConflicts: false, hasError: false };
      testObject.syncBarrier.open();
      let preview = await testObject.sync(await client.getLatestRef(testObject.resource), true);
      preview = await testObject.discard(preview.resourcePreviews[0].previewResource);
      assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
      assertPreviews(preview.resourcePreviews, [testObject.localResource]);
      assert.strictEqual(preview.resourcePreviews[0].mergeState, MergeState.Preview);
      assertConflicts(testObject.conflicts.conflicts, []);
    });
  });
  test("preivew -> discard -> accept", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncResult = { hasConflicts: false, hasError: false };
      testObject.syncBarrier.open();
      let preview = await testObject.sync(await client.getLatestRef(testObject.resource), true);
      preview = await testObject.discard(preview.resourcePreviews[0].previewResource);
      preview = await testObject.accept(preview.resourcePreviews[0].remoteResource);
      assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
      assertPreviews(preview.resourcePreviews, [testObject.localResource]);
      assert.strictEqual(preview.resourcePreviews[0].mergeState, MergeState.Accepted);
      assertConflicts(testObject.conflicts.conflicts, []);
    });
  });
  test("preivew -> accept -> discard -> accept", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncResult = { hasConflicts: false, hasError: false };
      testObject.syncBarrier.open();
      let preview = await testObject.sync(await client.getLatestRef(testObject.resource), true);
      preview = await testObject.accept(preview.resourcePreviews[0].previewResource);
      preview = await testObject.discard(preview.resourcePreviews[0].previewResource);
      preview = await testObject.accept(preview.resourcePreviews[0].remoteResource);
      assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
      assertPreviews(preview.resourcePreviews, [testObject.localResource]);
      assert.strictEqual(preview.resourcePreviews[0].mergeState, MergeState.Accepted);
      assertConflicts(testObject.conflicts.conflicts, []);
    });
  });
  test("preivew -> accept -> discard", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncResult = { hasConflicts: false, hasError: false };
      testObject.syncBarrier.open();
      let preview = await testObject.sync(await client.getLatestRef(testObject.resource), true);
      preview = await testObject.accept(preview.resourcePreviews[0].remoteResource);
      preview = await testObject.discard(preview.resourcePreviews[0].previewResource);
      assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
      assertPreviews(preview.resourcePreviews, [testObject.localResource]);
      assert.strictEqual(preview.resourcePreviews[0].mergeState, MergeState.Preview);
      assertConflicts(testObject.conflicts.conflicts, []);
    });
  });
  test("preivew -> discard -> accept -> apply", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncResult = { hasConflicts: false, hasError: false };
      testObject.syncBarrier.open();
      await testObject.sync(await client.getLatestRef(testObject.resource));
      const expectedContent = (await client.instantiationService.get(IFileService).readFile(testObject.localResource)).value.toString();
      let preview = await testObject.sync(await client.getLatestRef(testObject.resource), true);
      preview = await testObject.accept(preview.resourcePreviews[0].remoteResource);
      preview = await testObject.discard(preview.resourcePreviews[0].previewResource);
      preview = await testObject.accept(preview.resourcePreviews[0].localResource);
      preview = await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      assert.strictEqual(preview, null);
      assertConflicts(testObject.conflicts.conflicts, []);
      assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, expectedContent);
      assert.strictEqual((await client.instantiationService.get(IFileService).readFile(testObject.localResource)).value.toString(), expectedContent);
    });
  });
  test("conflicts: preview", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncResult = { hasConflicts: true, hasError: false };
      testObject.syncBarrier.open();
      const preview = await testObject.sync(await client.getLatestRef(testObject.resource), true);
      assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
      assertPreviews(preview.resourcePreviews, [testObject.localResource]);
      assert.strictEqual(preview.resourcePreviews[0].mergeState, MergeState.Conflict);
      assertConflicts(testObject.conflicts.conflicts, [preview.resourcePreviews[0].localResource]);
    });
  });
  test("conflicts: preview -> discard", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncResult = { hasConflicts: true, hasError: false };
      testObject.syncBarrier.open();
      const preview = await testObject.sync(await client.getLatestRef(testObject.resource), true);
      await testObject.discard(preview.resourcePreviews[0].previewResource);
      assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
      assertPreviews(preview.resourcePreviews, [testObject.localResource]);
      assert.strictEqual(preview.resourcePreviews[0].mergeState, MergeState.Preview);
      assertConflicts(testObject.conflicts.conflicts, []);
    });
  });
  test("conflicts: preview -> accept", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncResult = { hasConflicts: true, hasError: false };
      testObject.syncBarrier.open();
      let preview = await testObject.sync(await client.getLatestRef(testObject.resource), true);
      const content = await testObject.resolveContent(preview.resourcePreviews[0].previewResource);
      preview = await testObject.accept(preview.resourcePreviews[0].previewResource, content);
      assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
      assertPreviews(preview.resourcePreviews, [testObject.localResource]);
      assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    });
  });
  test("conflicts: preview -> accept 2", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncResult = { hasConflicts: true, hasError: false };
      testObject.syncBarrier.open();
      let preview = await testObject.sync(await client.getLatestRef(testObject.resource), true);
      const content = await testObject.resolveContent(preview.resourcePreviews[0].previewResource);
      preview = await testObject.accept(preview.resourcePreviews[0].previewResource, content);
      assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
      assertPreviews(preview.resourcePreviews, [testObject.localResource]);
      assertConflicts(testObject.conflicts.conflicts, []);
    });
  });
  test("conflicts: preview -> accept -> apply", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncResult = { hasConflicts: false, hasError: false };
      testObject.syncBarrier.open();
      await testObject.sync(await client.getLatestRef(testObject.resource));
      testObject.syncResult = { hasConflicts: true, hasError: false };
      const ref = await client.getLatestRef(testObject.resource);
      let preview = await testObject.sync(ref, true);
      preview = await testObject.accept(preview.resourcePreviews[0].previewResource);
      preview = await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      assert.strictEqual(preview, null);
      assertConflicts(testObject.conflicts.conflicts, []);
      assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, ref);
      assert.strictEqual((await client.instantiationService.get(IFileService).readFile(testObject.localResource)).value.toString(), ref);
    });
  });
  test("conflicts: preivew -> discard", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncResult = { hasConflicts: true, hasError: false };
      testObject.syncBarrier.open();
      let preview = await testObject.sync(await client.getLatestRef(testObject.resource), true);
      preview = await testObject.discard(preview.resourcePreviews[0].previewResource);
      assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
      assertPreviews(preview.resourcePreviews, [testObject.localResource]);
      assert.strictEqual(preview.resourcePreviews[0].mergeState, MergeState.Preview);
      assertConflicts(testObject.conflicts.conflicts, []);
    });
  });
  test("conflicts: preivew -> discard -> accept", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncResult = { hasConflicts: true, hasError: false };
      testObject.syncBarrier.open();
      let preview = await testObject.sync(await client.getLatestRef(testObject.resource), true);
      preview = await testObject.discard(preview.resourcePreviews[0].previewResource);
      preview = await testObject.accept(preview.resourcePreviews[0].remoteResource);
      assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
      assertPreviews(preview.resourcePreviews, [testObject.localResource]);
      assert.strictEqual(preview.resourcePreviews[0].mergeState, MergeState.Accepted);
      assertConflicts(testObject.conflicts.conflicts, []);
    });
  });
  test("conflicts: preivew -> accept -> discard -> accept", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncResult = { hasConflicts: true, hasError: false };
      testObject.syncBarrier.open();
      let preview = await testObject.sync(await client.getLatestRef(testObject.resource), true);
      preview = await testObject.accept(preview.resourcePreviews[0].previewResource);
      preview = await testObject.discard(preview.resourcePreviews[0].previewResource);
      preview = await testObject.accept(preview.resourcePreviews[0].remoteResource);
      assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
      assertPreviews(preview.resourcePreviews, [testObject.localResource]);
      assert.strictEqual(preview.resourcePreviews[0].mergeState, MergeState.Accepted);
      assertConflicts(testObject.conflicts.conflicts, []);
    });
  });
  test("conflicts: preivew -> accept -> discard", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncResult = { hasConflicts: false, hasError: false };
      testObject.syncBarrier.open();
      let preview = await testObject.sync(await client.getLatestRef(testObject.resource), true);
      preview = await testObject.accept(preview.resourcePreviews[0].remoteResource);
      preview = await testObject.discard(preview.resourcePreviews[0].previewResource);
      assert.deepStrictEqual(testObject.status, SyncStatus.Syncing);
      assertPreviews(preview.resourcePreviews, [testObject.localResource]);
      assert.strictEqual(preview.resourcePreviews[0].mergeState, MergeState.Preview);
      assertConflicts(testObject.conflicts.conflicts, []);
    });
  });
  test("conflicts: preivew -> discard -> accept -> apply", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncResult = { hasConflicts: false, hasError: false };
      testObject.syncBarrier.open();
      await testObject.sync(await client.getLatestRef(testObject.resource));
      const expectedContent = (await client.instantiationService.get(IFileService).readFile(testObject.localResource)).value.toString();
      let preview = await testObject.sync(await client.getLatestRef(testObject.resource), true);
      preview = await testObject.discard(preview.resourcePreviews[0].previewResource);
      preview = await testObject.accept(preview.resourcePreviews[0].localResource);
      preview = await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      assert.strictEqual(preview, null);
      assertConflicts(testObject.conflicts.conflicts, []);
      assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, expectedContent);
      assert.strictEqual((await client.instantiationService.get(IFileService).readFile(testObject.localResource)).value.toString(), expectedContent);
    });
  });
  test("conflicts: preivew -> accept -> discard -> accept -> apply", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncResult = { hasConflicts: false, hasError: false };
      testObject.syncBarrier.open();
      await testObject.sync(await client.getLatestRef(testObject.resource));
      const expectedContent = (await client.instantiationService.get(IFileService).readFile(testObject.localResource)).value.toString();
      let preview = await testObject.sync(await client.getLatestRef(testObject.resource), true);
      preview = await testObject.accept(preview.resourcePreviews[0].remoteResource);
      preview = await testObject.discard(preview.resourcePreviews[0].previewResource);
      preview = await testObject.accept(preview.resourcePreviews[0].localResource);
      preview = await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      assert.strictEqual(preview, null);
      assertConflicts(testObject.conflicts.conflicts, []);
      assert.strictEqual((await testObject.getRemoteUserData(null)).syncData?.content, expectedContent);
      assert.strictEqual((await client.instantiationService.get(IFileService).readFile(testObject.localResource)).value.toString(), expectedContent);
    });
  });
  test("remote is accepted if last sync state does not exists in server", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncBarrier.open();
      await testObject.sync(await client.getLatestRef(testObject.resource));
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp();
      const synchronizer2 = disposableStore.add(client2.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client2.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      synchronizer2.syncBarrier.open();
      const ref = await client2.getLatestRef(testObject.resource);
      await synchronizer2.sync(ref);
      await fileService.del(testObject.getLastSyncResource());
      await testObject.sync(await client.getLatestRef(testObject.resource));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      assert.strictEqual((await client.instantiationService.get(IFileService).readFile(testObject.localResource)).value.toString(), ref);
    });
  });
});
suite("TestSynchronizer - Last Sync Data", () => {
  const server = new UserDataSyncTestServer();
  let client;
  teardown(async () => {
    await client.instantiationService.get(IUserDataSyncStoreService).clear();
  });
  const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();
  setup(async () => {
    client = disposableStore.add(new UserDataSyncClient(server));
    await client.setUp();
  });
  test("last sync data is null when not synced before", async () => {
    await runWithFakedTimers({}, async () => {
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      const actual = await testObject.getLastSyncUserData();
      assert.strictEqual(actual, null);
    });
  });
  test("last sync data is set after sync", async () => {
    await runWithFakedTimers({}, async () => {
      const storageService = client.instantiationService.get(IStorageService);
      const fileService = client.instantiationService.get(IFileService);
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncBarrier.open();
      await testObject.sync(await client.getLatestRef(testObject.resource));
      const machineId = await testObject.getMachineId();
      const actual = await testObject.getLastSyncUserData();
      assert.deepStrictEqual(storageService.get("settings.lastSyncUserData", StorageScope.APPLICATION), JSON.stringify({ ref: "1" }));
      assert.deepStrictEqual(JSON.parse((await fileService.readFile(testObject.getLastSyncResource())).value.toString()), { ref: "1", syncData: { version: 1, machineId, content: "0" } });
      assert.deepStrictEqual(actual, {
        ref: "1",
        syncData: {
          content: "0",
          machineId,
          version: 1
        }
      });
    });
  });
  test("last sync data is read from server after sync if last sync resource is deleted", async () => {
    await runWithFakedTimers({}, async () => {
      const storageService = client.instantiationService.get(IStorageService);
      const fileService = client.instantiationService.get(IFileService);
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncBarrier.open();
      await testObject.sync(await client.getLatestRef(testObject.resource));
      const machineId = await testObject.getMachineId();
      await fileService.del(testObject.getLastSyncResource());
      const actual = await testObject.getLastSyncUserData();
      assert.deepStrictEqual(storageService.get("settings.lastSyncUserData", StorageScope.APPLICATION), JSON.stringify({ ref: "1" }));
      assert.deepStrictEqual(actual, {
        ref: "1",
        syncData: {
          content: "0",
          machineId,
          version: 1
        }
      });
    });
  });
  test("last sync data is read from server after sync and sync data is invalid", async () => {
    await runWithFakedTimers({}, async () => {
      const storageService = client.instantiationService.get(IStorageService);
      const fileService = client.instantiationService.get(IFileService);
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncBarrier.open();
      await testObject.sync(await client.getLatestRef(testObject.resource));
      const machineId = await testObject.getMachineId();
      await fileService.writeFile(testObject.getLastSyncResource(), VSBuffer.fromString(JSON.stringify({
        ref: "1",
        version: 1,
        content: JSON.stringify({
          content: "0",
          machineId,
          version: 1
        }),
        additionalData: {
          foo: "bar"
        }
      })));
      server.reset();
      const actual = await testObject.getLastSyncUserData();
      assert.deepStrictEqual(storageService.get("settings.lastSyncUserData", StorageScope.APPLICATION), JSON.stringify({ ref: "1" }));
      assert.deepStrictEqual(actual, {
        ref: "1",
        syncData: {
          content: "0",
          machineId,
          version: 1
        }
      });
      assert.deepStrictEqual(server.requests, [{ headers: {}, type: "GET", url: "http://host:3000/v1/resource/settings/1" }]);
    });
  });
  test("last sync data is read from server after sync and stored sync data is tampered", async () => {
    await runWithFakedTimers({}, async () => {
      const storageService = client.instantiationService.get(IStorageService);
      const fileService = client.instantiationService.get(IFileService);
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncBarrier.open();
      await testObject.sync(await client.getLatestRef(testObject.resource));
      const machineId = await testObject.getMachineId();
      await fileService.writeFile(testObject.getLastSyncResource(), VSBuffer.fromString(JSON.stringify({
        ref: "2",
        syncData: {
          content: "0",
          machineId,
          version: 1
        }
      })));
      server.reset();
      const actual = await testObject.getLastSyncUserData();
      assert.deepStrictEqual(storageService.get("settings.lastSyncUserData", StorageScope.APPLICATION), JSON.stringify({ ref: "1" }));
      assert.deepStrictEqual(actual, {
        ref: "1",
        syncData: {
          content: "0",
          machineId,
          version: 1
        }
      });
      assert.deepStrictEqual(server.requests, [{ headers: {}, type: "GET", url: "http://host:3000/v1/resource/settings/1" }]);
    });
  });
  test("reading last sync data: no requests are made to server when sync data is invalid", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncBarrier.open();
      await testObject.sync(await client.getLatestRef(testObject.resource));
      const machineId = await testObject.getMachineId();
      await fileService.writeFile(testObject.getLastSyncResource(), VSBuffer.fromString(JSON.stringify({
        ref: "1",
        version: 1,
        content: JSON.stringify({
          content: "0",
          machineId,
          version: 1
        }),
        additionalData: {
          foo: "bar"
        }
      })));
      await testObject.getLastSyncUserData();
      server.reset();
      await testObject.getLastSyncUserData();
      assert.deepStrictEqual(server.requests, []);
    });
  });
  test("reading last sync data: no requests are made to server when sync data is null", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncBarrier.open();
      await testObject.sync(await client.getLatestRef(testObject.resource));
      server.reset();
      await fileService.writeFile(testObject.getLastSyncResource(), VSBuffer.fromString(JSON.stringify({
        ref: "1",
        syncData: null
      })));
      await testObject.getLastSyncUserData();
      assert.deepStrictEqual(server.requests, []);
    });
  });
  test("last sync data is null after sync if last sync state is deleted", async () => {
    await runWithFakedTimers({}, async () => {
      const storageService = client.instantiationService.get(IStorageService);
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncBarrier.open();
      await testObject.sync(await client.getLatestRef(testObject.resource));
      storageService.remove("settings.lastSyncUserData", StorageScope.APPLICATION);
      const actual = await testObject.getLastSyncUserData();
      assert.strictEqual(actual, null);
    });
  });
  test("last sync data is null after sync if last sync content is deleted everywhere", async () => {
    await runWithFakedTimers({}, async () => {
      const storageService = client.instantiationService.get(IStorageService);
      const fileService = client.instantiationService.get(IFileService);
      const userDataSyncStoreService = client.instantiationService.get(IUserDataSyncStoreService);
      const testObject = disposableStore.add(client.instantiationService.createInstance(TestSynchroniser, { syncResource: SyncResource.Settings, profile: client.instantiationService.get(IUserDataProfilesService).defaultProfile }, void 0));
      testObject.syncBarrier.open();
      await testObject.sync(await client.getLatestRef(testObject.resource));
      await fileService.del(testObject.getLastSyncResource());
      await userDataSyncStoreService.deleteResource(testObject.syncResource.syncResource, null);
      const actual = await testObject.getLastSyncUserData();
      assert.deepStrictEqual(storageService.get("settings.lastSyncUserData", StorageScope.APPLICATION), JSON.stringify({ ref: "1" }));
      assert.strictEqual(actual, null);
    });
  });
});
function assertConflicts(actual, expected) {
  assert.deepStrictEqual(actual.map(({ localResource }) => localResource.toString()), expected.map((uri) => uri.toString()));
}
function assertPreviews(actual, expected) {
  assert.deepStrictEqual(actual.map(({ localResource }) => localResource.toString()), expected.map((uri) => uri.toString()));
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFx0ZXN0XFxjb21tb25cXHN5bmNocm9uaXplci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQmFycmllciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCwgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSB9IGZyb20gJy4uLy4uLy4uL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RTeW5jaHJvbmlzZXIsIElBY2NlcHRSZXN1bHQsIElNZXJnZVJlc3VsdCwgSVJlc291cmNlUHJldmlldywgU3luY1N0cmF0ZWd5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2Fic3RyYWN0U3luY2hyb25pemVyLmpzJztcbmltcG9ydCB7IENoYW5nZSwgSVJlbW90ZVVzZXJEYXRhLCBJUmVzb3VyY2VQcmV2aWV3IGFzIElCYXNlUmVzb3VyY2VQcmV2aWV3LCBJVXNlckRhdGFTeW5jQ29uZmlndXJhdGlvbiwgSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSwgTWVyZ2VTdGF0ZSwgU3luY1Jlc291cmNlLCBTeW5jU3RhdHVzLCBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIElVc2VyRGF0YSB9IGZyb20gJy4uLy4uL2NvbW1vbi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgVXNlckRhdGFTeW5jQ2xpZW50LCBVc2VyRGF0YVN5bmNUZXN0U2VydmVyIH0gZnJvbSAnLi91c2VyRGF0YVN5bmNDbGllbnQuanMnO1xuXG5pbnRlcmZhY2UgSVRlc3RSZXNvdXJjZVByZXZpZXcgZXh0ZW5kcyBJUmVzb3VyY2VQcmV2aWV3IHtcblx0cmVmOiBzdHJpbmc7XG59XG5cbmNsYXNzIFRlc3RTeW5jaHJvbmlzZXIgZXh0ZW5kcyBBYnN0cmFjdFN5bmNocm9uaXNlciB7XG5cblx0c3luY0JhcnJpZXI6IEJhcnJpZXIgPSBuZXcgQmFycmllcigpO1xuXHRzeW5jUmVzdWx0OiB7IGhhc0NvbmZsaWN0czogYm9vbGVhbjsgaGFzRXJyb3I6IGJvb2xlYW4gfSA9IHsgaGFzQ29uZmxpY3RzOiBmYWxzZSwgaGFzRXJyb3I6IGZhbHNlIH07XG5cdG9uRG9TeW5jQ2FsbDogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRmYWlsV2hlbkdldHRpbmdMYXRlc3RSZW1vdGVVc2VyRGF0YTogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSB2ZXJzaW9uOiBudW1iZXIgPSAxO1xuXG5cdHByaXZhdGUgY2FuY2VsbGVkOiBib29sZWFuID0gZmFsc2U7XG5cdHJlYWRvbmx5IGxvY2FsUmVzb3VyY2UgPSBqb2luUGF0aCh0aGlzLmVudmlyb25tZW50U2VydmljZS51c2VyUm9hbWluZ0RhdGFIb21lLCAndGVzdFJlc291cmNlLmpzb24nKTtcblxuXHRnZXRNYWNoaW5lSWQoKTogUHJvbWlzZTxzdHJpbmc+IHsgcmV0dXJuIHRoaXMuY3VycmVudE1hY2hpbmVJZFByb21pc2U7IH1cblx0Z2V0TGFzdFN5bmNSZXNvdXJjZSgpOiBVUkkgeyByZXR1cm4gdGhpcy5sYXN0U3luY1Jlc291cmNlOyB9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldExhdGVzdFJlbW90ZVVzZXJEYXRhKHJlZk9yTGF0ZXN0RGF0YTogc3RyaW5nIHwgSVVzZXJEYXRhIHwgbnVsbCwgbGFzdFN5bmNVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhIHwgbnVsbCk6IFByb21pc2U8SVJlbW90ZVVzZXJEYXRhPiB7XG5cdFx0aWYgKHRoaXMuZmFpbFdoZW5HZXR0aW5nTGF0ZXN0UmVtb3RlVXNlckRhdGEpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcigpO1xuXHRcdH1cblx0XHRyZXR1cm4gc3VwZXIuZ2V0TGF0ZXN0UmVtb3RlVXNlckRhdGEocmVmT3JMYXRlc3REYXRhLCBsYXN0U3luY1VzZXJEYXRhKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBkb1N5bmMocmVtb3RlVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSwgbGFzdFN5bmNVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhIHwgbnVsbCwgc3RyYXRlZ3k6IFN5bmNTdHJhdGVneSwgdXNlckRhdGFTeW5jQ29uZmlndXJhdGlvbjogSVVzZXJEYXRhU3luY0NvbmZpZ3VyYXRpb24pOiBQcm9taXNlPFN5bmNTdGF0dXM+IHtcblx0XHR0aGlzLmNhbmNlbGxlZCA9IGZhbHNlO1xuXHRcdHRoaXMub25Eb1N5bmNDYWxsLmZpcmUoKTtcblx0XHRhd2FpdCB0aGlzLnN5bmNCYXJyaWVyLndhaXQoKTtcblxuXHRcdGlmICh0aGlzLmNhbmNlbGxlZCkge1xuXHRcdFx0cmV0dXJuIFN5bmNTdGF0dXMuSWRsZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3VwZXIuZG9TeW5jKHJlbW90ZVVzZXJEYXRhLCBsYXN0U3luY1VzZXJEYXRhLCBzdHJhdGVneSwgdXNlckRhdGFTeW5jQ29uZmlndXJhdGlvbik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgZ2VuZXJhdGVTeW5jUHJldmlldyhyZW1vdGVVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhKTogUHJvbWlzZTxJVGVzdFJlc291cmNlUHJldmlld1tdPiB7XG5cdFx0aWYgKHRoaXMuc3luY1Jlc3VsdC5oYXNFcnJvcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdmYWlsZWQnKTtcblx0XHR9XG5cblx0XHRsZXQgZmlsZUNvbnRlbnQgPSBudWxsO1xuXHRcdHRyeSB7XG5cdFx0XHRmaWxlQ29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUodGhpcy5sb2NhbFJlc291cmNlKTtcblx0XHR9IGNhdGNoIChlcnJvcikgeyB9XG5cblx0XHRyZXR1cm4gW3tcblx0XHRcdGJhc2VSZXNvdXJjZTogdGhpcy5sb2NhbFJlc291cmNlLndpdGgoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2Jhc2UnIH0pKSxcblx0XHRcdGJhc2VDb250ZW50OiBudWxsLFxuXHRcdFx0bG9jYWxSZXNvdXJjZTogdGhpcy5sb2NhbFJlc291cmNlLFxuXHRcdFx0bG9jYWxDb250ZW50OiBmaWxlQ29udGVudCA/IGZpbGVDb250ZW50LnZhbHVlLnRvU3RyaW5nKCkgOiBudWxsLFxuXHRcdFx0cmVtb3RlUmVzb3VyY2U6IHRoaXMubG9jYWxSZXNvdXJjZS53aXRoKCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdyZW1vdGUnIH0pKSxcblx0XHRcdHJlbW90ZUNvbnRlbnQ6IHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhID8gcmVtb3RlVXNlckRhdGEuc3luY0RhdGEuY29udGVudCA6IG51bGwsXG5cdFx0XHRwcmV2aWV3UmVzb3VyY2U6IHRoaXMubG9jYWxSZXNvdXJjZS53aXRoKCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdwcmV2aWV3JyB9KSksXG5cdFx0XHRyZWY6IHJlbW90ZVVzZXJEYXRhLnJlZixcblx0XHRcdGxvY2FsQ2hhbmdlOiBDaGFuZ2UuTW9kaWZpZWQsXG5cdFx0XHRyZW1vdGVDaGFuZ2U6IENoYW5nZS5Nb2RpZmllZCxcblx0XHRcdGFjY2VwdGVkUmVzb3VyY2U6IHRoaXMubG9jYWxSZXNvdXJjZS53aXRoKCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdhY2NlcHRlZCcgfSkpLFxuXHRcdH1dO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGhhc1JlbW90ZUNoYW5nZWQobGFzdFN5bmNVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2V0TWVyZ2VSZXN1bHQocmVzb3VyY2VQcmV2aWV3OiBJVGVzdFJlc291cmNlUHJldmlldywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTWVyZ2VSZXN1bHQ+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGVudDogcmVzb3VyY2VQcmV2aWV3LnJlZixcblx0XHRcdGxvY2FsQ2hhbmdlOiBDaGFuZ2UuTW9kaWZpZWQsXG5cdFx0XHRyZW1vdGVDaGFuZ2U6IENoYW5nZS5Nb2RpZmllZCxcblx0XHRcdGhhc0NvbmZsaWN0czogdGhpcy5zeW5jUmVzdWx0Lmhhc0NvbmZsaWN0cyxcblx0XHR9O1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGdldEFjY2VwdFJlc3VsdChyZXNvdXJjZVByZXZpZXc6IElUZXN0UmVzb3VyY2VQcmV2aWV3LCByZXNvdXJjZTogVVJJLCBjb250ZW50OiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElBY2NlcHRSZXN1bHQ+IHtcblxuXHRcdGlmIChpc0VxdWFsKHJlc291cmNlLCByZXNvdXJjZVByZXZpZXcubG9jYWxSZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IHJlc291cmNlUHJldmlldy5sb2NhbENvbnRlbnQsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBDaGFuZ2UuTm9uZSxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiByZXNvdXJjZVByZXZpZXcubG9jYWxDb250ZW50ID09PSBudWxsID8gQ2hhbmdlLkRlbGV0ZWQgOiBDaGFuZ2UuTW9kaWZpZWQsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmIChpc0VxdWFsKHJlc291cmNlLCByZXNvdXJjZVByZXZpZXcucmVtb3RlUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiByZXNvdXJjZVByZXZpZXcucmVtb3RlQ29udGVudCxcblx0XHRcdFx0bG9jYWxDaGFuZ2U6IHJlc291cmNlUHJldmlldy5yZW1vdGVDb250ZW50ID09PSBudWxsID8gQ2hhbmdlLkRlbGV0ZWQgOiBDaGFuZ2UuTW9kaWZpZWQsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogQ2hhbmdlLk5vbmUsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmIChpc0VxdWFsKHJlc291cmNlLCByZXNvdXJjZVByZXZpZXcucHJldmlld1Jlc291cmNlKSkge1xuXHRcdFx0aWYgKGNvbnRlbnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGNvbnRlbnQ6IHJlc291cmNlUHJldmlldy5yZWYsXG5cdFx0XHRcdFx0bG9jYWxDaGFuZ2U6IENoYW5nZS5Nb2RpZmllZCxcblx0XHRcdFx0XHRyZW1vdGVDaGFuZ2U6IENoYW5nZS5Nb2RpZmllZCxcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0XHRsb2NhbENoYW5nZTogY29udGVudCA9PT0gbnVsbCA/IHJlc291cmNlUHJldmlldy5sb2NhbENvbnRlbnQgIT09IG51bGwgPyBDaGFuZ2UuRGVsZXRlZCA6IENoYW5nZS5Ob25lIDogQ2hhbmdlLk1vZGlmaWVkLFxuXHRcdFx0XHRcdHJlbW90ZUNoYW5nZTogY29udGVudCA9PT0gbnVsbCA/IHJlc291cmNlUHJldmlldy5yZW1vdGVDb250ZW50ICE9PSBudWxsID8gQ2hhbmdlLkRlbGV0ZWQgOiBDaGFuZ2UuTm9uZSA6IENoYW5nZS5Nb2RpZmllZCxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgUmVzb3VyY2U6ICR7cmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBhcHBseVJlc3VsdChyZW1vdGVVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhLCBsYXN0U3luY1VzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEgfCBudWxsLCByZXNvdXJjZVByZXZpZXdzOiBbSVJlc291cmNlUHJldmlldywgSUFjY2VwdFJlc3VsdF1bXSwgZm9yY2U6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAocmVzb3VyY2VQcmV2aWV3c1swXVsxXS5sb2NhbENoYW5nZSA9PT0gQ2hhbmdlLkRlbGV0ZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKHRoaXMubG9jYWxSZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0aWYgKHJlc291cmNlUHJldmlld3NbMF1bMV0ubG9jYWxDaGFuZ2UgPT09IENoYW5nZS5BZGRlZCB8fCByZXNvdXJjZVByZXZpZXdzWzBdWzFdLmxvY2FsQ2hhbmdlID09PSBDaGFuZ2UuTW9kaWZpZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRoaXMubG9jYWxSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhyZXNvdXJjZVByZXZpZXdzWzBdWzFdLmNvbnRlbnQhKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHJlc291cmNlUHJldmlld3NbMF1bMV0ucmVtb3RlQ2hhbmdlID09PSBDaGFuZ2UuRGVsZXRlZCkge1xuXHRcdFx0YXdhaXQgdGhpcy5hcHBseVJlZihudWxsLCByZW1vdGVVc2VyRGF0YS5yZWYpO1xuXHRcdH1cblxuXHRcdGlmIChyZXNvdXJjZVByZXZpZXdzWzBdWzFdLnJlbW90ZUNoYW5nZSA9PT0gQ2hhbmdlLkFkZGVkIHx8IHJlc291cmNlUHJldmlld3NbMF1bMV0ucmVtb3RlQ2hhbmdlID09PSBDaGFuZ2UuTW9kaWZpZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMuYXBwbHlSZWYocmVzb3VyY2VQcmV2aWV3c1swXVsxXS5jb250ZW50LCByZW1vdGVVc2VyRGF0YS5yZWYpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGFwcGx5UmVmKGNvbnRlbnQ6IHN0cmluZyB8IG51bGwsIHJlZjogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0aGlzLnVwZGF0ZVJlbW90ZVVzZXJEYXRhKGNvbnRlbnQgPT09IG51bGwgPyAnJyA6IGNvbnRlbnQsIHJlZik7XG5cdFx0YXdhaXQgdGhpcy51cGRhdGVMYXN0U3luY1VzZXJEYXRhKHJlbW90ZVVzZXJEYXRhKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHN0b3AoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5jYW5jZWxsZWQgPSB0cnVlO1xuXHRcdHRoaXMuc3luY0JhcnJpZXIub3BlbigpO1xuXHRcdHN1cGVyLnN0b3AoKTtcblx0fVxuXG5cdHRlc3RUcmlnZ2VyTG9jYWxDaGFuZ2UoKTogdm9pZCB7XG5cdFx0dGhpcy50cmlnZ2VyTG9jYWxDaGFuZ2UoKTtcblx0fVxuXG5cdG9uRGlkVHJpZ2dlckxvY2FsQ2hhbmdlQ2FsbDogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgZG9UcmlnZ2VyTG9jYWxDaGFuZ2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgc3VwZXIuZG9UcmlnZ2VyTG9jYWxDaGFuZ2UoKTtcblx0XHR0aGlzLm9uRGlkVHJpZ2dlckxvY2FsQ2hhbmdlQ2FsbC5maXJlKCk7XG5cdH1cblxuXHRoYXNMb2NhbERhdGEoKTogUHJvbWlzZTxib29sZWFuPiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0YXN5bmMgcmVzb2x2ZUNvbnRlbnQodXJpOiBVUkkpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHsgcmV0dXJuIG51bGw7IH1cbn1cblxuc3VpdGUoJ1Rlc3RTeW5jaHJvbml6ZXIgLSBBdXRvIFN5bmMnLCAoKSA9PiB7XG5cblx0Y29uc3Qgc2VydmVyID0gbmV3IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIoKTtcblx0bGV0IGNsaWVudDogVXNlckRhdGFTeW5jQ2xpZW50O1xuXG5cdHRlYXJkb3duKGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVTdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRjbGllbnQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQoc2VydmVyKSk7XG5cdFx0YXdhaXQgY2xpZW50LnNldFVwKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXR1cyBpcyBzeW5jaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdDogVGVzdFN5bmNocm9uaXNlciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTeW5jaHJvbmlzZXIsIHsgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuU2V0dGluZ3MsIHByb2ZpbGU6IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZSB9LCB1bmRlZmluZWQpKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsOiBTeW5jU3RhdHVzW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQodGVzdE9iamVjdC5vbkRpZENoYW5nZVN0YXR1cyhzdGF0dXMgPT4gYWN0dWFsLnB1c2goc3RhdHVzKSkpO1xuXG5cdFx0XHRjb25zdCBwcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKHRlc3RPYmplY3Qub25Eb1N5bmNDYWxsLmV2ZW50KTtcblxuXHRcdFx0dGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYodGVzdE9iamVjdC5yZXNvdXJjZSkpO1xuXHRcdFx0YXdhaXQgcHJvbWlzZTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIFtTeW5jU3RhdHVzLlN5bmNpbmddKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuU3luY2luZyk7XG5cblx0XHRcdHRlc3RPYmplY3Quc3RvcCgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGF0dXMgaXMgc2V0IGNvcnJlY3RseSB3aGVuIHN5bmMgaXMgZmluaXNoZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXN0T2JqZWN0OiBUZXN0U3luY2hyb25pc2VyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFN5bmNocm9uaXNlciwgeyBzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgcHJvZmlsZTogY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlIH0sIHVuZGVmaW5lZCkpO1xuXHRcdFx0dGVzdE9iamVjdC5zeW5jQmFycmllci5vcGVuKCk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbDogU3luY1N0YXR1c1tdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKHRlc3RPYmplY3Qub25EaWRDaGFuZ2VTdGF0dXMoc3RhdHVzID0+IGFjdHVhbC5wdXNoKHN0YXR1cykpKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKHRlc3RPYmplY3QucmVzb3VyY2UpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIFtTeW5jU3RhdHVzLlN5bmNpbmcsIFN5bmNTdGF0dXMuSWRsZV0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc3RhdHVzIGlzIHNldCBjb3JyZWN0bHkgd2hlbiBzeW5jIGhhcyBlcnJvcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXN0T2JqZWN0OiBUZXN0U3luY2hyb25pc2VyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFN5bmNocm9uaXNlciwgeyBzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgcHJvZmlsZTogY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlIH0sIHVuZGVmaW5lZCkpO1xuXHRcdFx0dGVzdE9iamVjdC5zeW5jUmVzdWx0ID0geyBoYXNFcnJvcjogdHJ1ZSwgaGFzQ29uZmxpY3RzOiBmYWxzZSB9O1xuXHRcdFx0dGVzdE9iamVjdC5zeW5jQmFycmllci5vcGVuKCk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbDogU3luY1N0YXR1c1tdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKHRlc3RPYmplY3Qub25EaWRDaGFuZ2VTdGF0dXMoc3RhdHVzID0+IGFjdHVhbC5wdXNoKHN0YXR1cykpKTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYodGVzdE9iamVjdC5yZXNvdXJjZSkpO1xuXHRcdFx0XHRhc3NlcnQuZmFpbCgnU2hvdWxkIGZhaWwnKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIFtTeW5jU3RhdHVzLlN5bmNpbmcsIFN5bmNTdGF0dXMuSWRsZV0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGF0dXMgaXMgc2V0IHRvIGhhc0NvbmZsaWN0cyB3aGVuIGFza2VkIHRvIHN5bmMgaWYgdGhlcmUgYXJlIGNvbmZsaWN0cycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRlc3RPYmplY3Q6IFRlc3RTeW5jaHJvbmlzZXIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0U3luY2hyb25pc2VyLCB7IHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlLlNldHRpbmdzLCBwcm9maWxlOiBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUgfSwgdW5kZWZpbmVkKSk7XG5cdFx0XHR0ZXN0T2JqZWN0LnN5bmNSZXN1bHQgPSB7IGhhc0NvbmZsaWN0czogdHJ1ZSwgaGFzRXJyb3I6IGZhbHNlIH07XG5cdFx0XHR0ZXN0T2JqZWN0LnN5bmNCYXJyaWVyLm9wZW4oKTtcblxuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYodGVzdE9iamVjdC5yZXNvdXJjZSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cdFx0XHRhc3NlcnRDb25mbGljdHModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbdGVzdE9iamVjdC5sb2NhbFJlc291cmNlXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgc2hvdWxkIG5vdCBydW4gaWYgc3luY2luZyBhbHJlYWR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdDogVGVzdFN5bmNocm9uaXNlciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTeW5jaHJvbmlzZXIsIHsgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuU2V0dGluZ3MsIHByb2ZpbGU6IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZSB9LCB1bmRlZmluZWQpKTtcblx0XHRcdGNvbnN0IHByb21pc2UgPSBFdmVudC50b1Byb21pc2UodGVzdE9iamVjdC5vbkRvU3luY0NhbGwuZXZlbnQpO1xuXG5cdFx0XHR0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZih0ZXN0T2JqZWN0LnJlc291cmNlKSk7XG5cdFx0XHRhd2FpdCBwcm9taXNlO1xuXG5cdFx0XHRjb25zdCBhY3R1YWw6IFN5bmNTdGF0dXNbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZCh0ZXN0T2JqZWN0Lm9uRGlkQ2hhbmdlU3RhdHVzKHN0YXR1cyA9PiBhY3R1YWwucHVzaChzdGF0dXMpKSk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZih0ZXN0T2JqZWN0LnJlc291cmNlKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLlN5bmNpbmcpO1xuXG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN0b3AoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc3luYyBzaG91bGQgbm90IHJ1biBpZiB0aGVyZSBhcmUgY29uZmxpY3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdDogVGVzdFN5bmNocm9uaXNlciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTeW5jaHJvbmlzZXIsIHsgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuU2V0dGluZ3MsIHByb2ZpbGU6IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZSB9LCB1bmRlZmluZWQpKTtcblx0XHRcdHRlc3RPYmplY3Quc3luY1Jlc3VsdCA9IHsgaGFzQ29uZmxpY3RzOiB0cnVlLCBoYXNFcnJvcjogZmFsc2UgfTtcblx0XHRcdHRlc3RPYmplY3Quc3luY0JhcnJpZXIub3BlbigpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYodGVzdE9iamVjdC5yZXNvdXJjZSkpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWw6IFN5bmNTdGF0dXNbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZCh0ZXN0T2JqZWN0Lm9uRGlkQ2hhbmdlU3RhdHVzKHN0YXR1cyA9PiBhY3R1YWwucHVzaChzdGF0dXMpKSk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZih0ZXN0T2JqZWN0LnJlc291cmNlKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjY2VwdCBwcmV2aWV3IGR1cmluZyBjb25mbGljdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXN0T2JqZWN0OiBUZXN0U3luY2hyb25pc2VyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFN5bmNocm9uaXNlciwgeyBzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgcHJvZmlsZTogY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlIH0sIHVuZGVmaW5lZCkpO1xuXHRcdFx0dGVzdE9iamVjdC5zeW5jUmVzdWx0ID0geyBoYXNDb25mbGljdHM6IHRydWUsIGhhc0Vycm9yOiBmYWxzZSB9O1xuXHRcdFx0dGVzdE9iamVjdC5zeW5jQmFycmllci5vcGVuKCk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKHRlc3RPYmplY3QucmVzb3VyY2UpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSGFzQ29uZmxpY3RzKTtcblxuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5hY2NlcHQodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzWzBdLnByZXZpZXdSZXNvdXJjZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLlN5bmNpbmcpO1xuXHRcdFx0YXNzZXJ0Q29uZmxpY3RzKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFwcGx5KGZhbHNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKSkuc3luY0RhdGE/LmNvbnRlbnQsIChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZSh0ZXN0T2JqZWN0LmxvY2FsUmVzb3VyY2UpKS52YWx1ZS50b1N0cmluZygpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYWNjZXB0IHJlbW90ZSBkdXJpbmcgY29uZmxpY3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdDogVGVzdFN5bmNocm9uaXNlciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTeW5jaHJvbmlzZXIsIHsgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuU2V0dGluZ3MsIHByb2ZpbGU6IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZSB9LCB1bmRlZmluZWQpKTtcblx0XHRcdHRlc3RPYmplY3Quc3luY0JhcnJpZXIub3BlbigpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYodGVzdE9iamVjdC5yZXNvdXJjZSkpO1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCBjdXJyZW50UmVtb3RlQ29udGVudCA9IChhd2FpdCB0ZXN0T2JqZWN0LmdldFJlbW90ZVVzZXJEYXRhKG51bGwpKS5zeW5jRGF0YT8uY29udGVudDtcblx0XHRcdGNvbnN0IG5ld0xvY2FsQ29udGVudCA9ICdjb25mbGljdCc7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUodGVzdE9iamVjdC5sb2NhbFJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKG5ld0xvY2FsQ29udGVudCkpO1xuXG5cdFx0XHR0ZXN0T2JqZWN0LnN5bmNSZXN1bHQgPSB7IGhhc0NvbmZsaWN0czogdHJ1ZSwgaGFzRXJyb3I6IGZhbHNlIH07XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZih0ZXN0T2JqZWN0LnJlc291cmNlKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0c1swXS5yZW1vdGVSZXNvdXJjZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLlN5bmNpbmcpO1xuXHRcdFx0YXNzZXJ0Q29uZmxpY3RzKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFwcGx5KGZhbHNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCkpLnN5bmNEYXRhPy5jb250ZW50LCBjdXJyZW50UmVtb3RlQ29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHRlc3RPYmplY3QubG9jYWxSZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCksIGN1cnJlbnRSZW1vdGVDb250ZW50KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYWNjZXB0IGxvY2FsIGR1cmluZyBjb25mbGljdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXN0T2JqZWN0OiBUZXN0U3luY2hyb25pc2VyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFN5bmNocm9uaXNlciwgeyBzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgcHJvZmlsZTogY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlIH0sIHVuZGVmaW5lZCkpO1xuXHRcdFx0dGVzdE9iamVjdC5zeW5jQmFycmllci5vcGVuKCk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZih0ZXN0T2JqZWN0LnJlc291cmNlKSk7XG5cdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IG5ld0xvY2FsQ29udGVudCA9ICdjb25mbGljdCc7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUodGVzdE9iamVjdC5sb2NhbFJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKG5ld0xvY2FsQ29udGVudCkpO1xuXG5cdFx0XHR0ZXN0T2JqZWN0LnN5bmNSZXN1bHQgPSB7IGhhc0NvbmZsaWN0czogdHJ1ZSwgaGFzRXJyb3I6IGZhbHNlIH07XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZih0ZXN0T2JqZWN0LnJlc291cmNlKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0c1swXS5sb2NhbFJlc291cmNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuU3luY2luZyk7XG5cdFx0XHRhc3NlcnRDb25mbGljdHModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKSkuc3luY0RhdGE/LmNvbnRlbnQsIG5ld0xvY2FsQ29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHRlc3RPYmplY3QubG9jYWxSZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCksIG5ld0xvY2FsQ29udGVudCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjY2VwdCBuZXcgY29udGVudCBkdXJpbmcgY29uZmxpY3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdDogVGVzdFN5bmNocm9uaXNlciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTeW5jaHJvbmlzZXIsIHsgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuU2V0dGluZ3MsIHByb2ZpbGU6IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZSB9LCB1bmRlZmluZWQpKTtcblx0XHRcdHRlc3RPYmplY3Quc3luY0JhcnJpZXIub3BlbigpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYodGVzdE9iamVjdC5yZXNvdXJjZSkpO1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCBuZXdMb2NhbENvbnRlbnQgPSAnY29uZmxpY3QnO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRlc3RPYmplY3QubG9jYWxSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhuZXdMb2NhbENvbnRlbnQpKTtcblxuXHRcdFx0dGVzdE9iamVjdC5zeW5jUmVzdWx0ID0geyBoYXNDb25mbGljdHM6IHRydWUsIGhhc0Vycm9yOiBmYWxzZSB9O1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYodGVzdE9iamVjdC5yZXNvdXJjZSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5IYXNDb25mbGljdHMpO1xuXG5cdFx0XHRjb25zdCBtZXJnZUNvbnRlbnQgPSAnbmV3Q29udGVudCc7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHNbMF0ucHJldmlld1Jlc291cmNlLCBtZXJnZUNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5TeW5jaW5nKTtcblx0XHRcdGFzc2VydENvbmZsaWN0cyh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblxuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5hcHBseShmYWxzZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCB0ZXN0T2JqZWN0LmdldFJlbW90ZVVzZXJEYXRhKG51bGwpKS5zeW5jRGF0YT8uY29udGVudCwgbWVyZ2VDb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUodGVzdE9iamVjdC5sb2NhbFJlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKSwgbWVyZ2VDb250ZW50KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYWNjZXB0IGRlbGV0ZSBkdXJpbmcgY29uZmxpY3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdDogVGVzdFN5bmNocm9uaXNlciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTeW5jaHJvbmlzZXIsIHsgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuU2V0dGluZ3MsIHByb2ZpbGU6IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZSB9LCB1bmRlZmluZWQpKTtcblx0XHRcdHRlc3RPYmplY3Quc3luY0JhcnJpZXIub3BlbigpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYodGVzdE9iamVjdC5yZXNvdXJjZSkpO1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCBuZXdMb2NhbENvbnRlbnQgPSAnY29uZmxpY3QnO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRlc3RPYmplY3QubG9jYWxSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhuZXdMb2NhbENvbnRlbnQpKTtcblxuXHRcdFx0dGVzdE9iamVjdC5zeW5jUmVzdWx0ID0geyBoYXNDb25mbGljdHM6IHRydWUsIGhhc0Vycm9yOiBmYWxzZSB9O1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYodGVzdE9iamVjdC5yZXNvdXJjZSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5IYXNDb25mbGljdHMpO1xuXG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHNbMF0ucHJldmlld1Jlc291cmNlLCBudWxsKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuU3luY2luZyk7XG5cdFx0XHRhc3NlcnRDb25mbGljdHModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKSkuc3luY0RhdGE/LmNvbnRlbnQsICcnKTtcblx0XHRcdGFzc2VydC5vayghKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyh0ZXN0T2JqZWN0LmxvY2FsUmVzb3VyY2UpKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjY2VwdCBkZWxldGVkIGxvY2FsIGR1cmluZyBjb25mbGljdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXN0T2JqZWN0OiBUZXN0U3luY2hyb25pc2VyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFN5bmNocm9uaXNlciwgeyBzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgcHJvZmlsZTogY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlIH0sIHVuZGVmaW5lZCkpO1xuXHRcdFx0dGVzdE9iamVjdC5zeW5jQmFycmllci5vcGVuKCk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZih0ZXN0T2JqZWN0LnJlc291cmNlKSk7XG5cdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmRlbCh0ZXN0T2JqZWN0LmxvY2FsUmVzb3VyY2UpO1xuXG5cdFx0XHR0ZXN0T2JqZWN0LnN5bmNSZXN1bHQgPSB7IGhhc0NvbmZsaWN0czogdHJ1ZSwgaGFzRXJyb3I6IGZhbHNlIH07XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZih0ZXN0T2JqZWN0LnJlc291cmNlKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0c1swXS5sb2NhbFJlc291cmNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuU3luY2luZyk7XG5cdFx0XHRhc3NlcnRDb25mbGljdHModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKSkuc3luY0RhdGE/LmNvbnRlbnQsICcnKTtcblx0XHRcdGFzc2VydC5vayghKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyh0ZXN0T2JqZWN0LmxvY2FsUmVzb3VyY2UpKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjY2VwdCBkZWxldGVkIHJlbW90ZSBkdXJpbmcgY29uZmxpY3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdDogVGVzdFN5bmNocm9uaXNlciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTeW5jaHJvbmlzZXIsIHsgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuU2V0dGluZ3MsIHByb2ZpbGU6IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZSB9LCB1bmRlZmluZWQpKTtcblx0XHRcdHRlc3RPYmplY3Quc3luY0JhcnJpZXIub3BlbigpO1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUodGVzdE9iamVjdC5sb2NhbFJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdzb21lIGNvbnRlbnQnKSk7XG5cdFx0XHR0ZXN0T2JqZWN0LnN5bmNSZXN1bHQgPSB7IGhhc0NvbmZsaWN0czogdHJ1ZSwgaGFzRXJyb3I6IGZhbHNlIH07XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKHRlc3RPYmplY3QucmVzb3VyY2UpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSGFzQ29uZmxpY3RzKTtcblxuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5hY2NlcHQodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzWzBdLnJlbW90ZVJlc291cmNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuU3luY2luZyk7XG5cdFx0XHRhc3NlcnRDb25mbGljdHModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKSkuc3luY0RhdGEsIG51bGwpO1xuXHRcdFx0YXNzZXJ0Lm9rKCEoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKHRlc3RPYmplY3QubG9jYWxSZXNvdXJjZSkpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVxdWVzdCBsYXRlc3QgZGF0YSBvbiBwcmVjb25kaXRpb24gZmFpbHVyZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRlc3RPYmplY3Q6IFRlc3RTeW5jaHJvbmlzZXIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0U3luY2hyb25pc2VyLCB7IHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlLlNldHRpbmdzLCBwcm9maWxlOiBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUgfSwgdW5kZWZpbmVkKSk7XG5cdFx0XHQvLyBTeW5jIG9uY2Vcblx0XHRcdHRlc3RPYmplY3Quc3luY0JhcnJpZXIub3BlbigpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYodGVzdE9iamVjdC5yZXNvdXJjZSkpO1xuXHRcdFx0dGVzdE9iamVjdC5zeW5jQmFycmllciA9IG5ldyBCYXJyaWVyKCk7XG5cblx0XHRcdC8vIHVwZGF0ZSByZW1vdGUgZGF0YSBiZWZvcmUgc3luY2luZyBzbyB0aGF0IDQxMiBpcyB0aHJvd24gYnkgc2VydmVyXG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gdGVzdE9iamVjdC5vbkRvU3luY0NhbGwuZXZlbnQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0YXdhaXQgdGVzdE9iamVjdC5hcHBseVJlZihyZWYsIHJlZiEpO1xuXHRcdFx0XHRzZXJ2ZXIucmVzZXQoKTtcblx0XHRcdFx0dGVzdE9iamVjdC5zeW5jQmFycmllci5vcGVuKCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gU3RhcnQgc3ljaW5nXG5cdFx0XHRjb25zdCByZWYgPSBhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKHRlc3RPYmplY3QucmVzb3VyY2UpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYodGVzdE9iamVjdC5yZXNvdXJjZSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZlci5yZXF1ZXN0cywgW1xuXHRcdFx0XHR7IHR5cGU6ICdQT1NUJywgdXJsOiBgJHtzZXJ2ZXIudXJsfS92MS9yZXNvdXJjZS8ke3Rlc3RPYmplY3QucmVzb3VyY2V9YCwgaGVhZGVyczogeyAnSWYtTWF0Y2gnOiByZWYgfSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdHRVQnLCB1cmw6IGAke3NlcnZlci51cmx9L3YxL3Jlc291cmNlLyR7dGVzdE9iamVjdC5yZXNvdXJjZX0vbGF0ZXN0YCwgaGVhZGVyczoge30gfSxcblx0XHRcdFx0eyB0eXBlOiAnUE9TVCcsIHVybDogYCR7c2VydmVyLnVybH0vdjEvcmVzb3VyY2UvJHt0ZXN0T2JqZWN0LnJlc291cmNlfWAsIGhlYWRlcnM6IHsgJ0lmLU1hdGNoJzogYCR7cGFyc2VJbnQocmVmISkgKyAxfWAgfSB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vIHJlcXVlc3RzIGFyZSBtYWRlIHRvIHNlcnZlciB3aGVuIGxvY2FsIGNoYW5nZSBpcyB0cmlnZ2VyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXN0T2JqZWN0OiBUZXN0U3luY2hyb25pc2VyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFN5bmNocm9uaXNlciwgeyBzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgcHJvZmlsZTogY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlIH0sIHVuZGVmaW5lZCkpO1xuXHRcdFx0dGVzdE9iamVjdC5zeW5jQmFycmllci5vcGVuKCk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZih0ZXN0T2JqZWN0LnJlc291cmNlKSk7XG5cblx0XHRcdHNlcnZlci5yZXNldCgpO1xuXHRcdFx0Y29uc3QgcHJvbWlzZSA9IEV2ZW50LnRvUHJvbWlzZSh0ZXN0T2JqZWN0Lm9uRGlkVHJpZ2dlckxvY2FsQ2hhbmdlQ2FsbC5ldmVudCk7XG5cdFx0XHR0ZXN0T2JqZWN0LnRlc3RUcmlnZ2VyTG9jYWxDaGFuZ2UoKTtcblxuXHRcdFx0YXdhaXQgcHJvbWlzZTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RzLCBbXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXR1cyBpcyByZXNldCB3aGVuIGdldHRpbmcgbGF0ZXN0IHJlbW90ZSBkYXRhIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdDogVGVzdFN5bmNocm9uaXNlciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTeW5jaHJvbmlzZXIsIHsgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuU2V0dGluZ3MsIHByb2ZpbGU6IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZSB9LCB1bmRlZmluZWQpKTtcblx0XHRcdHRlc3RPYmplY3QuZmFpbFdoZW5HZXR0aW5nTGF0ZXN0UmVtb3RlVXNlckRhdGEgPSB0cnVlO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZih0ZXN0T2JqZWN0LnJlc291cmNlKSk7XG5cdFx0XHRcdGFzc2VydC5mYWlsKCdTaG91bGQgdGhyb3cgYW4gZXJyb3InKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ1Rlc3RTeW5jaHJvbml6ZXIgLSBNYW51YWwgU3luYycsICgpID0+IHtcblxuXHRjb25zdCBzZXJ2ZXIgPSBuZXcgVXNlckRhdGFTeW5jVGVzdFNlcnZlcigpO1xuXHRsZXQgY2xpZW50OiBVc2VyRGF0YVN5bmNDbGllbnQ7XG5cblx0dGVhcmRvd24oYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSkuY2xlYXIoKTtcblx0fSk7XG5cblx0Y29uc3QgZGlzcG9zYWJsZVN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGNsaWVudCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudChzZXJ2ZXIpKTtcblx0XHRhd2FpdCBjbGllbnQuc2V0VXAoKTtcblx0fSk7XG5cblx0dGVzdCgncHJldmlldycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRlc3RPYmplY3Q6IFRlc3RTeW5jaHJvbmlzZXIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0U3luY2hyb25pc2VyLCB7IHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlLlNldHRpbmdzLCBwcm9maWxlOiBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUgfSwgdW5kZWZpbmVkKSk7XG5cdFx0XHR0ZXN0T2JqZWN0LnN5bmNSZXN1bHQgPSB7IGhhc0NvbmZsaWN0czogZmFsc2UsIGhhc0Vycm9yOiBmYWxzZSB9O1xuXHRcdFx0dGVzdE9iamVjdC5zeW5jQmFycmllci5vcGVuKCk7XG5cblx0XHRcdGNvbnN0IHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZih0ZXN0T2JqZWN0LnJlc291cmNlKSwgdHJ1ZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuU3luY2luZyk7XG5cdFx0XHRhc3NlcnRQcmV2aWV3cyhwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzLCBbdGVzdE9iamVjdC5sb2NhbFJlc291cmNlXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJldmlldyEucmVzb3VyY2VQcmV2aWV3c1swXS5tZXJnZVN0YXRlLCBNZXJnZVN0YXRlLkFjY2VwdGVkKTtcblx0XHRcdGFzc2VydENvbmZsaWN0cyh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHJldmlldyAtPiBhY2NlcHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXN0T2JqZWN0OiBUZXN0U3luY2hyb25pc2VyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFN5bmNocm9uaXNlciwgeyBzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgcHJvZmlsZTogY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlIH0sIHVuZGVmaW5lZCkpO1xuXHRcdFx0dGVzdE9iamVjdC5zeW5jUmVzdWx0ID0geyBoYXNDb25mbGljdHM6IGZhbHNlLCBoYXNFcnJvcjogZmFsc2UgfTtcblx0XHRcdHRlc3RPYmplY3Quc3luY0JhcnJpZXIub3BlbigpO1xuXG5cdFx0XHRsZXQgcHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKHRlc3RPYmplY3QucmVzb3VyY2UpLCB0cnVlKTtcblx0XHRcdHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdChwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzWzBdLmxvY2FsUmVzb3VyY2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLlN5bmNpbmcpO1xuXHRcdFx0YXNzZXJ0UHJldmlld3MocHJldmlldyEucmVzb3VyY2VQcmV2aWV3cywgW3Rlc3RPYmplY3QubG9jYWxSZXNvdXJjZV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXZpZXchLnJlc291cmNlUHJldmlld3NbMF0ubWVyZ2VTdGF0ZSwgTWVyZ2VTdGF0ZS5BY2NlcHRlZCk7XG5cdFx0XHRhc3NlcnRDb25mbGljdHModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXZpZXcgLT4gbWVyZ2UgLT4gYXBwbHknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXN0T2JqZWN0OiBUZXN0U3luY2hyb25pc2VyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFN5bmNocm9uaXNlciwgeyBzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgcHJvZmlsZTogY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlIH0sIHVuZGVmaW5lZCkpO1xuXHRcdFx0dGVzdE9iamVjdC5zeW5jUmVzdWx0ID0geyBoYXNDb25mbGljdHM6IGZhbHNlLCBoYXNFcnJvcjogZmFsc2UgfTtcblx0XHRcdHRlc3RPYmplY3Quc3luY0JhcnJpZXIub3BlbigpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYodGVzdE9iamVjdC5yZXNvdXJjZSkpO1xuXG5cdFx0XHRjb25zdCByZWYgPSBhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKHRlc3RPYmplY3QucmVzb3VyY2UpO1xuXHRcdFx0bGV0IHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LnN5bmMocmVmLCB0cnVlKTtcblx0XHRcdHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LmFwcGx5KGZhbHNlKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmV2aWV3LCBudWxsKTtcblx0XHRcdGFzc2VydENvbmZsaWN0cyh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCB0ZXN0T2JqZWN0LmdldFJlbW90ZVVzZXJEYXRhKG51bGwpKS5zeW5jRGF0YT8uY29udGVudCwgcmVmKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpLnJlYWRGaWxlKHRlc3RPYmplY3QubG9jYWxSZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCksIHJlZik7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXZpZXcgLT4gYWNjZXB0IC0+IGFwcGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdDogVGVzdFN5bmNocm9uaXNlciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTeW5jaHJvbmlzZXIsIHsgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuU2V0dGluZ3MsIHByb2ZpbGU6IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZSB9LCB1bmRlZmluZWQpKTtcblx0XHRcdHRlc3RPYmplY3Quc3luY1Jlc3VsdCA9IHsgaGFzQ29uZmxpY3RzOiBmYWxzZSwgaGFzRXJyb3I6IGZhbHNlIH07XG5cdFx0XHR0ZXN0T2JqZWN0LnN5bmNCYXJyaWVyLm9wZW4oKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKHRlc3RPYmplY3QucmVzb3VyY2UpKTtcblxuXHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZih0ZXN0T2JqZWN0LnJlc291cmNlKTtcblx0XHRcdGxldCBwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5zeW5jKHJlZiwgdHJ1ZSk7XG5cdFx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5hY2NlcHQocHJldmlldyEucmVzb3VyY2VQcmV2aWV3c1swXS5wcmV2aWV3UmVzb3VyY2UpO1xuXHRcdFx0cHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXZpZXcsIG51bGwpO1xuXHRcdFx0YXNzZXJ0Q29uZmxpY3RzKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCkpLnN5bmNEYXRhPy5jb250ZW50LCByZWYpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSkucmVhZEZpbGUodGVzdE9iamVjdC5sb2NhbFJlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKSwgcmVmKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHJlaXZldyAtPiBkaXNjYXJkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdDogVGVzdFN5bmNocm9uaXNlciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTeW5jaHJvbmlzZXIsIHsgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuU2V0dGluZ3MsIHByb2ZpbGU6IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZSB9LCB1bmRlZmluZWQpKTtcblx0XHRcdHRlc3RPYmplY3Quc3luY1Jlc3VsdCA9IHsgaGFzQ29uZmxpY3RzOiBmYWxzZSwgaGFzRXJyb3I6IGZhbHNlIH07XG5cdFx0XHR0ZXN0T2JqZWN0LnN5bmNCYXJyaWVyLm9wZW4oKTtcblxuXHRcdFx0bGV0IHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZih0ZXN0T2JqZWN0LnJlc291cmNlKSwgdHJ1ZSk7XG5cdFx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5kaXNjYXJkKHByZXZpZXchLnJlc291cmNlUHJldmlld3NbMF0ucHJldmlld1Jlc291cmNlKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5TeW5jaW5nKTtcblx0XHRcdGFzc2VydFByZXZpZXdzKHByZXZpZXchLnJlc291cmNlUHJldmlld3MsIFt0ZXN0T2JqZWN0LmxvY2FsUmVzb3VyY2VdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzWzBdLm1lcmdlU3RhdGUsIE1lcmdlU3RhdGUuUHJldmlldyk7XG5cdFx0XHRhc3NlcnRDb25mbGljdHModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZWl2ZXcgLT4gZGlzY2FyZCAtPiBhY2NlcHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXN0T2JqZWN0OiBUZXN0U3luY2hyb25pc2VyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFN5bmNocm9uaXNlciwgeyBzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgcHJvZmlsZTogY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlIH0sIHVuZGVmaW5lZCkpO1xuXHRcdFx0dGVzdE9iamVjdC5zeW5jUmVzdWx0ID0geyBoYXNDb25mbGljdHM6IGZhbHNlLCBoYXNFcnJvcjogZmFsc2UgfTtcblx0XHRcdHRlc3RPYmplY3Quc3luY0JhcnJpZXIub3BlbigpO1xuXG5cdFx0XHRsZXQgcHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKHRlc3RPYmplY3QucmVzb3VyY2UpLCB0cnVlKTtcblx0XHRcdHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LmRpc2NhcmQocHJldmlldyEucmVzb3VyY2VQcmV2aWV3c1swXS5wcmV2aWV3UmVzb3VyY2UpO1xuXHRcdFx0cHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHByZXZpZXchLnJlc291cmNlUHJldmlld3NbMF0ucmVtb3RlUmVzb3VyY2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLlN5bmNpbmcpO1xuXHRcdFx0YXNzZXJ0UHJldmlld3MocHJldmlldyEucmVzb3VyY2VQcmV2aWV3cywgW3Rlc3RPYmplY3QubG9jYWxSZXNvdXJjZV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXZpZXchLnJlc291cmNlUHJldmlld3NbMF0ubWVyZ2VTdGF0ZSwgTWVyZ2VTdGF0ZS5BY2NlcHRlZCk7XG5cdFx0XHRhc3NlcnRDb25mbGljdHModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZWl2ZXcgLT4gYWNjZXB0IC0+IGRpc2NhcmQgLT4gYWNjZXB0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdDogVGVzdFN5bmNocm9uaXNlciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTeW5jaHJvbmlzZXIsIHsgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuU2V0dGluZ3MsIHByb2ZpbGU6IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZSB9LCB1bmRlZmluZWQpKTtcblx0XHRcdHRlc3RPYmplY3Quc3luY1Jlc3VsdCA9IHsgaGFzQ29uZmxpY3RzOiBmYWxzZSwgaGFzRXJyb3I6IGZhbHNlIH07XG5cdFx0XHR0ZXN0T2JqZWN0LnN5bmNCYXJyaWVyLm9wZW4oKTtcblxuXHRcdFx0bGV0IHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZih0ZXN0T2JqZWN0LnJlc291cmNlKSwgdHJ1ZSk7XG5cdFx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5hY2NlcHQocHJldmlldyEucmVzb3VyY2VQcmV2aWV3c1swXS5wcmV2aWV3UmVzb3VyY2UpO1xuXHRcdFx0cHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3QuZGlzY2FyZChwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzWzBdLnByZXZpZXdSZXNvdXJjZSk7XG5cdFx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5hY2NlcHQocHJldmlldyEucmVzb3VyY2VQcmV2aWV3c1swXS5yZW1vdGVSZXNvdXJjZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuU3luY2luZyk7XG5cdFx0XHRhc3NlcnRQcmV2aWV3cyhwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzLCBbdGVzdE9iamVjdC5sb2NhbFJlc291cmNlXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJldmlldyEucmVzb3VyY2VQcmV2aWV3c1swXS5tZXJnZVN0YXRlLCBNZXJnZVN0YXRlLkFjY2VwdGVkKTtcblx0XHRcdGFzc2VydENvbmZsaWN0cyh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHJlaXZldyAtPiBhY2NlcHQgLT4gZGlzY2FyZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRlc3RPYmplY3Q6IFRlc3RTeW5jaHJvbmlzZXIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0U3luY2hyb25pc2VyLCB7IHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlLlNldHRpbmdzLCBwcm9maWxlOiBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUgfSwgdW5kZWZpbmVkKSk7XG5cdFx0XHR0ZXN0T2JqZWN0LnN5bmNSZXN1bHQgPSB7IGhhc0NvbmZsaWN0czogZmFsc2UsIGhhc0Vycm9yOiBmYWxzZSB9O1xuXHRcdFx0dGVzdE9iamVjdC5zeW5jQmFycmllci5vcGVuKCk7XG5cblx0XHRcdGxldCBwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYodGVzdE9iamVjdC5yZXNvdXJjZSksIHRydWUpO1xuXHRcdFx0cHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHByZXZpZXchLnJlc291cmNlUHJldmlld3NbMF0ucmVtb3RlUmVzb3VyY2UpO1xuXHRcdFx0cHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3QuZGlzY2FyZChwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzWzBdLnByZXZpZXdSZXNvdXJjZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuU3luY2luZyk7XG5cdFx0XHRhc3NlcnRQcmV2aWV3cyhwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzLCBbdGVzdE9iamVjdC5sb2NhbFJlc291cmNlXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJldmlldyEucmVzb3VyY2VQcmV2aWV3c1swXS5tZXJnZVN0YXRlLCBNZXJnZVN0YXRlLlByZXZpZXcpO1xuXHRcdFx0YXNzZXJ0Q29uZmxpY3RzKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVpdmV3IC0+IGRpc2NhcmQgLT4gYWNjZXB0IC0+IGFwcGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdDogVGVzdFN5bmNocm9uaXNlciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTeW5jaHJvbmlzZXIsIHsgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuU2V0dGluZ3MsIHByb2ZpbGU6IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZSB9LCB1bmRlZmluZWQpKTtcblx0XHRcdHRlc3RPYmplY3Quc3luY1Jlc3VsdCA9IHsgaGFzQ29uZmxpY3RzOiBmYWxzZSwgaGFzRXJyb3I6IGZhbHNlIH07XG5cdFx0XHR0ZXN0T2JqZWN0LnN5bmNCYXJyaWVyLm9wZW4oKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKHRlc3RPYmplY3QucmVzb3VyY2UpKTtcblxuXHRcdFx0Y29uc3QgZXhwZWN0ZWRDb250ZW50ID0gKGF3YWl0IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKS5yZWFkRmlsZSh0ZXN0T2JqZWN0LmxvY2FsUmVzb3VyY2UpKS52YWx1ZS50b1N0cmluZygpO1xuXHRcdFx0bGV0IHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZih0ZXN0T2JqZWN0LnJlc291cmNlKSwgdHJ1ZSk7XG5cdFx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5hY2NlcHQocHJldmlldyEucmVzb3VyY2VQcmV2aWV3c1swXS5yZW1vdGVSZXNvdXJjZSk7XG5cdFx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5kaXNjYXJkKHByZXZpZXchLnJlc291cmNlUHJldmlld3NbMF0ucHJldmlld1Jlc291cmNlKTtcblx0XHRcdHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdChwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzWzBdLmxvY2FsUmVzb3VyY2UpO1xuXHRcdFx0cHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXZpZXcsIG51bGwpO1xuXHRcdFx0YXNzZXJ0Q29uZmxpY3RzKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCB0ZXN0T2JqZWN0LmdldFJlbW90ZVVzZXJEYXRhKG51bGwpKS5zeW5jRGF0YT8uY29udGVudCwgZXhwZWN0ZWRDb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpLnJlYWRGaWxlKHRlc3RPYmplY3QubG9jYWxSZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCksIGV4cGVjdGVkQ29udGVudCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZsaWN0czogcHJldmlldycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRlc3RPYmplY3Q6IFRlc3RTeW5jaHJvbmlzZXIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0U3luY2hyb25pc2VyLCB7IHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlLlNldHRpbmdzLCBwcm9maWxlOiBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUgfSwgdW5kZWZpbmVkKSk7XG5cdFx0XHR0ZXN0T2JqZWN0LnN5bmNSZXN1bHQgPSB7IGhhc0NvbmZsaWN0czogdHJ1ZSwgaGFzRXJyb3I6IGZhbHNlIH07XG5cdFx0XHR0ZXN0T2JqZWN0LnN5bmNCYXJyaWVyLm9wZW4oKTtcblxuXHRcdFx0Y29uc3QgcHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKHRlc3RPYmplY3QucmVzb3VyY2UpLCB0cnVlKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5IYXNDb25mbGljdHMpO1xuXHRcdFx0YXNzZXJ0UHJldmlld3MocHJldmlldyEucmVzb3VyY2VQcmV2aWV3cywgW3Rlc3RPYmplY3QubG9jYWxSZXNvdXJjZV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXZpZXchLnJlc291cmNlUHJldmlld3NbMF0ubWVyZ2VTdGF0ZSwgTWVyZ2VTdGF0ZS5Db25mbGljdCk7XG5cdFx0XHRhc3NlcnRDb25mbGljdHModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbcHJldmlldyEucmVzb3VyY2VQcmV2aWV3c1swXS5sb2NhbFJlc291cmNlXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZsaWN0czogcHJldmlldyAtPiBkaXNjYXJkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdDogVGVzdFN5bmNocm9uaXNlciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTeW5jaHJvbmlzZXIsIHsgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuU2V0dGluZ3MsIHByb2ZpbGU6IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZSB9LCB1bmRlZmluZWQpKTtcblx0XHRcdHRlc3RPYmplY3Quc3luY1Jlc3VsdCA9IHsgaGFzQ29uZmxpY3RzOiB0cnVlLCBoYXNFcnJvcjogZmFsc2UgfTtcblx0XHRcdHRlc3RPYmplY3Quc3luY0JhcnJpZXIub3BlbigpO1xuXG5cdFx0XHRjb25zdCBwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYodGVzdE9iamVjdC5yZXNvdXJjZSksIHRydWUpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5kaXNjYXJkKHByZXZpZXchLnJlc291cmNlUHJldmlld3NbMF0ucHJldmlld1Jlc291cmNlKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5TeW5jaW5nKTtcblx0XHRcdGFzc2VydFByZXZpZXdzKHByZXZpZXchLnJlc291cmNlUHJldmlld3MsIFt0ZXN0T2JqZWN0LmxvY2FsUmVzb3VyY2VdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzWzBdLm1lcmdlU3RhdGUsIE1lcmdlU3RhdGUuUHJldmlldyk7XG5cdFx0XHRhc3NlcnRDb25mbGljdHModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZsaWN0czogcHJldmlldyAtPiBhY2NlcHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXN0T2JqZWN0OiBUZXN0U3luY2hyb25pc2VyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFN5bmNocm9uaXNlciwgeyBzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgcHJvZmlsZTogY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlIH0sIHVuZGVmaW5lZCkpO1xuXHRcdFx0dGVzdE9iamVjdC5zeW5jUmVzdWx0ID0geyBoYXNDb25mbGljdHM6IHRydWUsIGhhc0Vycm9yOiBmYWxzZSB9O1xuXHRcdFx0dGVzdE9iamVjdC5zeW5jQmFycmllci5vcGVuKCk7XG5cblx0XHRcdGxldCBwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYodGVzdE9iamVjdC5yZXNvdXJjZSksIHRydWUpO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRlc3RPYmplY3QucmVzb2x2ZUNvbnRlbnQocHJldmlldyEucmVzb3VyY2VQcmV2aWV3c1swXS5wcmV2aWV3UmVzb3VyY2UpO1xuXHRcdFx0cHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHByZXZpZXchLnJlc291cmNlUHJldmlld3NbMF0ucHJldmlld1Jlc291cmNlLCBjb250ZW50KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5TeW5jaW5nKTtcblx0XHRcdGFzc2VydFByZXZpZXdzKHByZXZpZXchLnJlc291cmNlUHJldmlld3MsIFt0ZXN0T2JqZWN0LmxvY2FsUmVzb3VyY2VdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZsaWN0czogcHJldmlldyAtPiBhY2NlcHQgMicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRlc3RPYmplY3Q6IFRlc3RTeW5jaHJvbmlzZXIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0U3luY2hyb25pc2VyLCB7IHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlLlNldHRpbmdzLCBwcm9maWxlOiBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUgfSwgdW5kZWZpbmVkKSk7XG5cdFx0XHR0ZXN0T2JqZWN0LnN5bmNSZXN1bHQgPSB7IGhhc0NvbmZsaWN0czogdHJ1ZSwgaGFzRXJyb3I6IGZhbHNlIH07XG5cdFx0XHR0ZXN0T2JqZWN0LnN5bmNCYXJyaWVyLm9wZW4oKTtcblxuXHRcdFx0bGV0IHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZih0ZXN0T2JqZWN0LnJlc291cmNlKSwgdHJ1ZSk7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGVzdE9iamVjdC5yZXNvbHZlQ29udGVudChwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzWzBdLnByZXZpZXdSZXNvdXJjZSk7XG5cdFx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5hY2NlcHQocHJldmlldyEucmVzb3VyY2VQcmV2aWV3c1swXS5wcmV2aWV3UmVzb3VyY2UsIGNvbnRlbnQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLlN5bmNpbmcpO1xuXHRcdFx0YXNzZXJ0UHJldmlld3MocHJldmlldyEucmVzb3VyY2VQcmV2aWV3cywgW3Rlc3RPYmplY3QubG9jYWxSZXNvdXJjZV0pO1xuXHRcdFx0YXNzZXJ0Q29uZmxpY3RzKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25mbGljdHM6IHByZXZpZXcgLT4gYWNjZXB0IC0+IGFwcGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdDogVGVzdFN5bmNocm9uaXNlciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTeW5jaHJvbmlzZXIsIHsgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuU2V0dGluZ3MsIHByb2ZpbGU6IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZSB9LCB1bmRlZmluZWQpKTtcblx0XHRcdHRlc3RPYmplY3Quc3luY1Jlc3VsdCA9IHsgaGFzQ29uZmxpY3RzOiBmYWxzZSwgaGFzRXJyb3I6IGZhbHNlIH07XG5cdFx0XHR0ZXN0T2JqZWN0LnN5bmNCYXJyaWVyLm9wZW4oKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKHRlc3RPYmplY3QucmVzb3VyY2UpKTtcblxuXHRcdFx0dGVzdE9iamVjdC5zeW5jUmVzdWx0ID0geyBoYXNDb25mbGljdHM6IHRydWUsIGhhc0Vycm9yOiBmYWxzZSB9O1xuXHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZih0ZXN0T2JqZWN0LnJlc291cmNlKTtcblx0XHRcdGxldCBwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5zeW5jKHJlZiwgdHJ1ZSk7XG5cblx0XHRcdHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdChwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzWzBdLnByZXZpZXdSZXNvdXJjZSk7XG5cdFx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5hcHBseShmYWxzZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJldmlldywgbnVsbCk7XG5cdFx0XHRhc3NlcnRDb25mbGljdHModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKSkuc3luY0RhdGE/LmNvbnRlbnQsIHJlZik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKS5yZWFkRmlsZSh0ZXN0T2JqZWN0LmxvY2FsUmVzb3VyY2UpKS52YWx1ZS50b1N0cmluZygpLCByZWYpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25mbGljdHM6IHByZWl2ZXcgLT4gZGlzY2FyZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRlc3RPYmplY3Q6IFRlc3RTeW5jaHJvbmlzZXIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0U3luY2hyb25pc2VyLCB7IHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlLlNldHRpbmdzLCBwcm9maWxlOiBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUgfSwgdW5kZWZpbmVkKSk7XG5cdFx0XHR0ZXN0T2JqZWN0LnN5bmNSZXN1bHQgPSB7IGhhc0NvbmZsaWN0czogdHJ1ZSwgaGFzRXJyb3I6IGZhbHNlIH07XG5cdFx0XHR0ZXN0T2JqZWN0LnN5bmNCYXJyaWVyLm9wZW4oKTtcblxuXHRcdFx0bGV0IHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZih0ZXN0T2JqZWN0LnJlc291cmNlKSwgdHJ1ZSk7XG5cdFx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5kaXNjYXJkKHByZXZpZXchLnJlc291cmNlUHJldmlld3NbMF0ucHJldmlld1Jlc291cmNlKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5TeW5jaW5nKTtcblx0XHRcdGFzc2VydFByZXZpZXdzKHByZXZpZXchLnJlc291cmNlUHJldmlld3MsIFt0ZXN0T2JqZWN0LmxvY2FsUmVzb3VyY2VdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzWzBdLm1lcmdlU3RhdGUsIE1lcmdlU3RhdGUuUHJldmlldyk7XG5cdFx0XHRhc3NlcnRDb25mbGljdHModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZsaWN0czogcHJlaXZldyAtPiBkaXNjYXJkIC0+IGFjY2VwdCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRlc3RPYmplY3Q6IFRlc3RTeW5jaHJvbmlzZXIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0U3luY2hyb25pc2VyLCB7IHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlLlNldHRpbmdzLCBwcm9maWxlOiBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUgfSwgdW5kZWZpbmVkKSk7XG5cdFx0XHR0ZXN0T2JqZWN0LnN5bmNSZXN1bHQgPSB7IGhhc0NvbmZsaWN0czogdHJ1ZSwgaGFzRXJyb3I6IGZhbHNlIH07XG5cdFx0XHR0ZXN0T2JqZWN0LnN5bmNCYXJyaWVyLm9wZW4oKTtcblxuXHRcdFx0bGV0IHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZih0ZXN0T2JqZWN0LnJlc291cmNlKSwgdHJ1ZSk7XG5cdFx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5kaXNjYXJkKHByZXZpZXchLnJlc291cmNlUHJldmlld3NbMF0ucHJldmlld1Jlc291cmNlKTtcblx0XHRcdHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdChwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzWzBdLnJlbW90ZVJlc291cmNlKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5TeW5jaW5nKTtcblx0XHRcdGFzc2VydFByZXZpZXdzKHByZXZpZXchLnJlc291cmNlUHJldmlld3MsIFt0ZXN0T2JqZWN0LmxvY2FsUmVzb3VyY2VdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzWzBdLm1lcmdlU3RhdGUsIE1lcmdlU3RhdGUuQWNjZXB0ZWQpO1xuXHRcdFx0YXNzZXJ0Q29uZmxpY3RzKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25mbGljdHM6IHByZWl2ZXcgLT4gYWNjZXB0IC0+IGRpc2NhcmQgLT4gYWNjZXB0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdDogVGVzdFN5bmNocm9uaXNlciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTeW5jaHJvbmlzZXIsIHsgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuU2V0dGluZ3MsIHByb2ZpbGU6IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZSB9LCB1bmRlZmluZWQpKTtcblx0XHRcdHRlc3RPYmplY3Quc3luY1Jlc3VsdCA9IHsgaGFzQ29uZmxpY3RzOiB0cnVlLCBoYXNFcnJvcjogZmFsc2UgfTtcblx0XHRcdHRlc3RPYmplY3Quc3luY0JhcnJpZXIub3BlbigpO1xuXG5cdFx0XHRsZXQgcHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKHRlc3RPYmplY3QucmVzb3VyY2UpLCB0cnVlKTtcblx0XHRcdHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdChwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzWzBdLnByZXZpZXdSZXNvdXJjZSk7XG5cdFx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5kaXNjYXJkKHByZXZpZXchLnJlc291cmNlUHJldmlld3NbMF0ucHJldmlld1Jlc291cmNlKTtcblx0XHRcdHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdChwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzWzBdLnJlbW90ZVJlc291cmNlKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5TeW5jaW5nKTtcblx0XHRcdGFzc2VydFByZXZpZXdzKHByZXZpZXchLnJlc291cmNlUHJldmlld3MsIFt0ZXN0T2JqZWN0LmxvY2FsUmVzb3VyY2VdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzWzBdLm1lcmdlU3RhdGUsIE1lcmdlU3RhdGUuQWNjZXB0ZWQpO1xuXHRcdFx0YXNzZXJ0Q29uZmxpY3RzKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25mbGljdHM6IHByZWl2ZXcgLT4gYWNjZXB0IC0+IGRpc2NhcmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXN0T2JqZWN0OiBUZXN0U3luY2hyb25pc2VyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFN5bmNocm9uaXNlciwgeyBzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgcHJvZmlsZTogY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlIH0sIHVuZGVmaW5lZCkpO1xuXHRcdFx0dGVzdE9iamVjdC5zeW5jUmVzdWx0ID0geyBoYXNDb25mbGljdHM6IGZhbHNlLCBoYXNFcnJvcjogZmFsc2UgfTtcblx0XHRcdHRlc3RPYmplY3Quc3luY0JhcnJpZXIub3BlbigpO1xuXG5cdFx0XHRsZXQgcHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKHRlc3RPYmplY3QucmVzb3VyY2UpLCB0cnVlKTtcblx0XHRcdHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdChwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzWzBdLnJlbW90ZVJlc291cmNlKTtcblx0XHRcdHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LmRpc2NhcmQocHJldmlldyEucmVzb3VyY2VQcmV2aWV3c1swXS5wcmV2aWV3UmVzb3VyY2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLlN5bmNpbmcpO1xuXHRcdFx0YXNzZXJ0UHJldmlld3MocHJldmlldyEucmVzb3VyY2VQcmV2aWV3cywgW3Rlc3RPYmplY3QubG9jYWxSZXNvdXJjZV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXZpZXchLnJlc291cmNlUHJldmlld3NbMF0ubWVyZ2VTdGF0ZSwgTWVyZ2VTdGF0ZS5QcmV2aWV3KTtcblx0XHRcdGFzc2VydENvbmZsaWN0cyh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHMsIFtdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmxpY3RzOiBwcmVpdmV3IC0+IGRpc2NhcmQgLT4gYWNjZXB0IC0+IGFwcGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdDogVGVzdFN5bmNocm9uaXNlciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTeW5jaHJvbmlzZXIsIHsgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuU2V0dGluZ3MsIHByb2ZpbGU6IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZSB9LCB1bmRlZmluZWQpKTtcblx0XHRcdHRlc3RPYmplY3Quc3luY1Jlc3VsdCA9IHsgaGFzQ29uZmxpY3RzOiBmYWxzZSwgaGFzRXJyb3I6IGZhbHNlIH07XG5cdFx0XHR0ZXN0T2JqZWN0LnN5bmNCYXJyaWVyLm9wZW4oKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKHRlc3RPYmplY3QucmVzb3VyY2UpKTtcblxuXHRcdFx0Y29uc3QgZXhwZWN0ZWRDb250ZW50ID0gKGF3YWl0IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKS5yZWFkRmlsZSh0ZXN0T2JqZWN0LmxvY2FsUmVzb3VyY2UpKS52YWx1ZS50b1N0cmluZygpO1xuXHRcdFx0bGV0IHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZih0ZXN0T2JqZWN0LnJlc291cmNlKSwgdHJ1ZSk7XG5cdFx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5kaXNjYXJkKHByZXZpZXchLnJlc291cmNlUHJldmlld3NbMF0ucHJldmlld1Jlc291cmNlKTtcblx0XHRcdHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdChwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzWzBdLmxvY2FsUmVzb3VyY2UpO1xuXHRcdFx0cHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXZpZXcsIG51bGwpO1xuXHRcdFx0YXNzZXJ0Q29uZmxpY3RzKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cywgW10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCB0ZXN0T2JqZWN0LmdldFJlbW90ZVVzZXJEYXRhKG51bGwpKS5zeW5jRGF0YT8uY29udGVudCwgZXhwZWN0ZWRDb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpLnJlYWRGaWxlKHRlc3RPYmplY3QubG9jYWxSZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCksIGV4cGVjdGVkQ29udGVudCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZsaWN0czogcHJlaXZldyAtPiBhY2NlcHQgLT4gZGlzY2FyZCAtPiBhY2NlcHQgLT4gYXBwbHknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXN0T2JqZWN0OiBUZXN0U3luY2hyb25pc2VyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFN5bmNocm9uaXNlciwgeyBzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgcHJvZmlsZTogY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlIH0sIHVuZGVmaW5lZCkpO1xuXHRcdFx0dGVzdE9iamVjdC5zeW5jUmVzdWx0ID0geyBoYXNDb25mbGljdHM6IGZhbHNlLCBoYXNFcnJvcjogZmFsc2UgfTtcblx0XHRcdHRlc3RPYmplY3Quc3luY0JhcnJpZXIub3BlbigpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYodGVzdE9iamVjdC5yZXNvdXJjZSkpO1xuXG5cdFx0XHRjb25zdCBleHBlY3RlZENvbnRlbnQgPSAoYXdhaXQgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpLnJlYWRGaWxlKHRlc3RPYmplY3QubG9jYWxSZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0XHRsZXQgcHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKHRlc3RPYmplY3QucmVzb3VyY2UpLCB0cnVlKTtcblx0XHRcdHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdChwcmV2aWV3IS5yZXNvdXJjZVByZXZpZXdzWzBdLnJlbW90ZVJlc291cmNlKTtcblx0XHRcdHByZXZpZXcgPSBhd2FpdCB0ZXN0T2JqZWN0LmRpc2NhcmQocHJldmlldyEucmVzb3VyY2VQcmV2aWV3c1swXS5wcmV2aWV3UmVzb3VyY2UpO1xuXHRcdFx0cHJldmlldyA9IGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHByZXZpZXchLnJlc291cmNlUHJldmlld3NbMF0ubG9jYWxSZXNvdXJjZSk7XG5cdFx0XHRwcmV2aWV3ID0gYXdhaXQgdGVzdE9iamVjdC5hcHBseShmYWxzZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJldmlldywgbnVsbCk7XG5cdFx0XHRhc3NlcnRDb25mbGljdHModGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLCBbXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCkpLnN5bmNEYXRhPy5jb250ZW50LCBleHBlY3RlZENvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSkucmVhZEZpbGUodGVzdE9iamVjdC5sb2NhbFJlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKSwgZXhwZWN0ZWRDb250ZW50KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3RlIGlzIGFjY2VwdGVkIGlmIGxhc3Qgc3luYyBzdGF0ZSBkb2VzIG5vdCBleGlzdHMgaW4gc2VydmVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCB0ZXN0T2JqZWN0OiBUZXN0U3luY2hyb25pc2VyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFN5bmNocm9uaXNlciwgeyBzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgcHJvZmlsZTogY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlIH0sIHVuZGVmaW5lZCkpO1xuXHRcdFx0dGVzdE9iamVjdC5zeW5jQmFycmllci5vcGVuKCk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKHRlc3RPYmplY3QucmVzb3VyY2UpKTtcblxuXHRcdFx0Y29uc3QgY2xpZW50MiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudChzZXJ2ZXIpKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc2V0VXAoKTtcblx0XHRcdGNvbnN0IHN5bmNocm9uaXplcjI6IFRlc3RTeW5jaHJvbmlzZXIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFN5bmNocm9uaXNlciwgeyBzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgcHJvZmlsZTogY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZSB9LCB1bmRlZmluZWQpKTtcblx0XHRcdHN5bmNocm9uaXplcjIuc3luY0JhcnJpZXIub3BlbigpO1xuXHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgY2xpZW50Mi5nZXRMYXRlc3RSZWYodGVzdE9iamVjdC5yZXNvdXJjZSk7XG5cdFx0XHRhd2FpdCBzeW5jaHJvbml6ZXIyLnN5bmMocmVmKTtcblxuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2UuZGVsKHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNSZXNvdXJjZSgpKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKHRlc3RPYmplY3QucmVzb3VyY2UpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpLnJlYWRGaWxlKHRlc3RPYmplY3QubG9jYWxSZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCksIHJlZik7XG5cdFx0fSk7XG5cdH0pO1xuXG59KTtcblxuc3VpdGUoJ1Rlc3RTeW5jaHJvbml6ZXIgLSBMYXN0IFN5bmMgRGF0YScsICgpID0+IHtcblx0Y29uc3Qgc2VydmVyID0gbmV3IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIoKTtcblx0bGV0IGNsaWVudDogVXNlckRhdGFTeW5jQ2xpZW50O1xuXG5cdHRlYXJkb3duKGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVTdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRjbGllbnQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQoc2VydmVyKSk7XG5cdFx0YXdhaXQgY2xpZW50LnNldFVwKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xhc3Qgc3luYyBkYXRhIGlzIG51bGwgd2hlbiBub3Qgc3luY2VkIGJlZm9yZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRlc3RPYmplY3Q6IFRlc3RTeW5jaHJvbmlzZXIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0U3luY2hyb25pc2VyLCB7IHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlLlNldHRpbmdzLCBwcm9maWxlOiBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUgfSwgdW5kZWZpbmVkKSk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBudWxsKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbGFzdCBzeW5jIGRhdGEgaXMgc2V0IGFmdGVyIHN5bmMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdDogVGVzdFN5bmNocm9uaXNlciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTeW5jaHJvbmlzZXIsIHsgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuU2V0dGluZ3MsIHByb2ZpbGU6IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZSB9LCB1bmRlZmluZWQpKTtcblx0XHRcdHRlc3RPYmplY3Quc3luY0JhcnJpZXIub3BlbigpO1xuXG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZih0ZXN0T2JqZWN0LnJlc291cmNlKSk7XG5cdFx0XHRjb25zdCBtYWNoaW5lSWQgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldE1hY2hpbmVJZCgpO1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RvcmFnZVNlcnZpY2UuZ2V0KCdzZXR0aW5ncy5sYXN0U3luY1VzZXJEYXRhJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSwgSlNPTi5zdHJpbmdpZnkoeyByZWY6ICcxJyB9KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEpTT04ucGFyc2UoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNSZXNvdXJjZSgpKSkudmFsdWUudG9TdHJpbmcoKSksIHsgcmVmOiAnMScsIHN5bmNEYXRhOiB7IHZlcnNpb246IDEsIG1hY2hpbmVJZCwgY29udGVudDogJzAnIH0gfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwge1xuXHRcdFx0XHRyZWY6ICcxJyxcblx0XHRcdFx0c3luY0RhdGE6IHtcblx0XHRcdFx0XHRjb250ZW50OiAnMCcsXG5cdFx0XHRcdFx0bWFjaGluZUlkLFxuXHRcdFx0XHRcdHZlcnNpb246IDFcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsYXN0IHN5bmMgZGF0YSBpcyByZWFkIGZyb20gc2VydmVyIGFmdGVyIHN5bmMgaWYgbGFzdCBzeW5jIHJlc291cmNlIGlzIGRlbGV0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdDogVGVzdFN5bmNocm9uaXNlciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTeW5jaHJvbmlzZXIsIHsgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuU2V0dGluZ3MsIHByb2ZpbGU6IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZSB9LCB1bmRlZmluZWQpKTtcblx0XHRcdHRlc3RPYmplY3Quc3luY0JhcnJpZXIub3BlbigpO1xuXG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZih0ZXN0T2JqZWN0LnJlc291cmNlKSk7XG5cdFx0XHRjb25zdCBtYWNoaW5lSWQgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldE1hY2hpbmVJZCgpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2UuZGVsKHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNSZXNvdXJjZSgpKTtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0b3JhZ2VTZXJ2aWNlLmdldCgnc2V0dGluZ3MubGFzdFN5bmNVc2VyRGF0YScsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiksIEpTT04uc3RyaW5naWZ5KHsgcmVmOiAnMScgfSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHtcblx0XHRcdFx0cmVmOiAnMScsXG5cdFx0XHRcdHN5bmNEYXRhOiB7XG5cdFx0XHRcdFx0Y29udGVudDogJzAnLFxuXHRcdFx0XHRcdG1hY2hpbmVJZCxcblx0XHRcdFx0XHR2ZXJzaW9uOiAxXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbGFzdCBzeW5jIGRhdGEgaXMgcmVhZCBmcm9tIHNlcnZlciBhZnRlciBzeW5jIGFuZCBzeW5jIGRhdGEgaXMgaW52YWxpZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCB0ZXN0T2JqZWN0OiBUZXN0U3luY2hyb25pc2VyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFN5bmNocm9uaXNlciwgeyBzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgcHJvZmlsZTogY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlIH0sIHVuZGVmaW5lZCkpO1xuXHRcdFx0dGVzdE9iamVjdC5zeW5jQmFycmllci5vcGVuKCk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKHRlc3RPYmplY3QucmVzb3VyY2UpKTtcblx0XHRcdGNvbnN0IG1hY2hpbmVJZCA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TWFjaGluZUlkKCk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUodGVzdE9iamVjdC5nZXRMYXN0U3luY1Jlc291cmNlKCksIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRyZWY6ICcxJyxcblx0XHRcdFx0dmVyc2lvbjogMSxcblx0XHRcdFx0Y29udGVudDogSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICcwJyxcblx0XHRcdFx0XHRtYWNoaW5lSWQsXG5cdFx0XHRcdFx0dmVyc2lvbjogMVxuXHRcdFx0XHR9KSxcblx0XHRcdFx0YWRkaXRpb25hbERhdGE6IHtcblx0XHRcdFx0XHRmb286ICdiYXInXG5cdFx0XHRcdH1cblx0XHRcdH0pKSk7XG5cdFx0XHRzZXJ2ZXIucmVzZXQoKTtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0b3JhZ2VTZXJ2aWNlLmdldCgnc2V0dGluZ3MubGFzdFN5bmNVc2VyRGF0YScsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiksIEpTT04uc3RyaW5naWZ5KHsgcmVmOiAnMScgfSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHtcblx0XHRcdFx0cmVmOiAnMScsXG5cdFx0XHRcdHN5bmNEYXRhOiB7XG5cdFx0XHRcdFx0Y29udGVudDogJzAnLFxuXHRcdFx0XHRcdG1hY2hpbmVJZCxcblx0XHRcdFx0XHR2ZXJzaW9uOiAxXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RzLCBbeyBoZWFkZXJzOiB7fSwgdHlwZTogJ0dFVCcsIHVybDogJ2h0dHA6Ly9ob3N0OjMwMDAvdjEvcmVzb3VyY2Uvc2V0dGluZ3MvMScgfV0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsYXN0IHN5bmMgZGF0YSBpcyByZWFkIGZyb20gc2VydmVyIGFmdGVyIHN5bmMgYW5kIHN0b3JlZCBzeW5jIGRhdGEgaXMgdGFtcGVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdDogVGVzdFN5bmNocm9uaXNlciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTeW5jaHJvbmlzZXIsIHsgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuU2V0dGluZ3MsIHByb2ZpbGU6IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZSB9LCB1bmRlZmluZWQpKTtcblx0XHRcdHRlc3RPYmplY3Quc3luY0JhcnJpZXIub3BlbigpO1xuXG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZih0ZXN0T2JqZWN0LnJlc291cmNlKSk7XG5cdFx0XHRjb25zdCBtYWNoaW5lSWQgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldE1hY2hpbmVJZCgpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNSZXNvdXJjZSgpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0cmVmOiAnMicsXG5cdFx0XHRcdHN5bmNEYXRhOiB7XG5cdFx0XHRcdFx0Y29udGVudDogJzAnLFxuXHRcdFx0XHRcdG1hY2hpbmVJZCxcblx0XHRcdFx0XHR2ZXJzaW9uOiAxXG5cdFx0XHRcdH1cblx0XHRcdH0pKSk7XG5cdFx0XHRzZXJ2ZXIucmVzZXQoKTtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0b3JhZ2VTZXJ2aWNlLmdldCgnc2V0dGluZ3MubGFzdFN5bmNVc2VyRGF0YScsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiksIEpTT04uc3RyaW5naWZ5KHsgcmVmOiAnMScgfSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHtcblx0XHRcdFx0cmVmOiAnMScsXG5cdFx0XHRcdHN5bmNEYXRhOiB7XG5cdFx0XHRcdFx0Y29udGVudDogJzAnLFxuXHRcdFx0XHRcdG1hY2hpbmVJZCxcblx0XHRcdFx0XHR2ZXJzaW9uOiAxXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2ZXIucmVxdWVzdHMsIFt7IGhlYWRlcnM6IHt9LCB0eXBlOiAnR0VUJywgdXJsOiAnaHR0cDovL2hvc3Q6MzAwMC92MS9yZXNvdXJjZS9zZXR0aW5ncy8xJyB9XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRpbmcgbGFzdCBzeW5jIGRhdGE6IG5vIHJlcXVlc3RzIGFyZSBtYWRlIHRvIHNlcnZlciB3aGVuIHN5bmMgZGF0YSBpcyBpbnZhbGlkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCB0ZXN0T2JqZWN0OiBUZXN0U3luY2hyb25pc2VyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFN5bmNocm9uaXNlciwgeyBzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgcHJvZmlsZTogY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlIH0sIHVuZGVmaW5lZCkpO1xuXHRcdFx0dGVzdE9iamVjdC5zeW5jQmFycmllci5vcGVuKCk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKHRlc3RPYmplY3QucmVzb3VyY2UpKTtcblx0XHRcdGNvbnN0IG1hY2hpbmVJZCA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TWFjaGluZUlkKCk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUodGVzdE9iamVjdC5nZXRMYXN0U3luY1Jlc291cmNlKCksIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRyZWY6ICcxJyxcblx0XHRcdFx0dmVyc2lvbjogMSxcblx0XHRcdFx0Y29udGVudDogSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICcwJyxcblx0XHRcdFx0XHRtYWNoaW5lSWQsXG5cdFx0XHRcdFx0dmVyc2lvbjogMVxuXHRcdFx0XHR9KSxcblx0XHRcdFx0YWRkaXRpb25hbERhdGE6IHtcblx0XHRcdFx0XHRmb286ICdiYXInXG5cdFx0XHRcdH1cblx0XHRcdH0pKSk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRcdHNlcnZlci5yZXNldCgpO1xuXG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RzLCBbXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRpbmcgbGFzdCBzeW5jIGRhdGE6IG5vIHJlcXVlc3RzIGFyZSBtYWRlIHRvIHNlcnZlciB3aGVuIHN5bmMgZGF0YSBpcyBudWxsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCB0ZXN0T2JqZWN0OiBUZXN0U3luY2hyb25pc2VyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFN5bmNocm9uaXNlciwgeyBzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgcHJvZmlsZTogY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlIH0sIHVuZGVmaW5lZCkpO1xuXHRcdFx0dGVzdE9iamVjdC5zeW5jQmFycmllci5vcGVuKCk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKHRlc3RPYmplY3QucmVzb3VyY2UpKTtcblx0XHRcdHNlcnZlci5yZXNldCgpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNSZXNvdXJjZSgpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0cmVmOiAnMScsXG5cdFx0XHRcdHN5bmNEYXRhOiBudWxsLFxuXHRcdFx0fSkpKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZlci5yZXF1ZXN0cywgW10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsYXN0IHN5bmMgZGF0YSBpcyBudWxsIGFmdGVyIHN5bmMgaWYgbGFzdCBzeW5jIHN0YXRlIGlzIGRlbGV0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHRlc3RPYmplY3Q6IFRlc3RTeW5jaHJvbmlzZXIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0U3luY2hyb25pc2VyLCB7IHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlLlNldHRpbmdzLCBwcm9maWxlOiBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUgfSwgdW5kZWZpbmVkKSk7XG5cdFx0XHR0ZXN0T2JqZWN0LnN5bmNCYXJyaWVyLm9wZW4oKTtcblxuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYodGVzdE9iamVjdC5yZXNvdXJjZSkpO1xuXHRcdFx0c3RvcmFnZVNlcnZpY2UucmVtb3ZlKCdzZXR0aW5ncy5sYXN0U3luY1VzZXJEYXRhJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBudWxsKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbGFzdCBzeW5jIGRhdGEgaXMgbnVsbCBhZnRlciBzeW5jIGlmIGxhc3Qgc3luYyBjb250ZW50IGlzIGRlbGV0ZWQgZXZlcnl3aGVyZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCB1c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdDogVGVzdFN5bmNocm9uaXNlciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTeW5jaHJvbmlzZXIsIHsgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuU2V0dGluZ3MsIHByb2ZpbGU6IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZSB9LCB1bmRlZmluZWQpKTtcblx0XHRcdHRlc3RPYmplY3Quc3luY0JhcnJpZXIub3BlbigpO1xuXG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZih0ZXN0T2JqZWN0LnJlc291cmNlKSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS5kZWwodGVzdE9iamVjdC5nZXRMYXN0U3luY1Jlc291cmNlKCkpO1xuXHRcdFx0YXdhaXQgdXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLmRlbGV0ZVJlc291cmNlKHRlc3RPYmplY3Quc3luY1Jlc291cmNlLnN5bmNSZXNvdXJjZSwgbnVsbCk7XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdG9yYWdlU2VydmljZS5nZXQoJ3NldHRpbmdzLmxhc3RTeW5jVXNlckRhdGEnLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pLCBKU09OLnN0cmluZ2lmeSh7IHJlZjogJzEnIH0pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIG51bGwpO1xuXHRcdH0pO1xuXHR9KTtcblxufSk7XG5cbmZ1bmN0aW9uIGFzc2VydENvbmZsaWN0cyhhY3R1YWw6IElCYXNlUmVzb3VyY2VQcmV2aWV3W10sIGV4cGVjdGVkOiBVUklbXSkge1xuXHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5tYXAoKHsgbG9jYWxSZXNvdXJjZSB9KSA9PiBsb2NhbFJlc291cmNlLnRvU3RyaW5nKCkpLCBleHBlY3RlZC5tYXAodXJpID0+IHVyaS50b1N0cmluZygpKSk7XG59XG5cbmZ1bmN0aW9uIGFzc2VydFByZXZpZXdzKGFjdHVhbDogSUJhc2VSZXNvdXJjZVByZXZpZXdbXSwgZXhwZWN0ZWQ6IFVSSVtdKSB7XG5cdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLm1hcCgoeyBsb2NhbFJlc291cmNlIH0pID0+IGxvY2FsUmVzb3VyY2UudG9TdHJpbmcoKSksIGV4cGVjdGVkLm1hcCh1cmkgPT4gdXJpLnRvU3RyaW5nKCkpKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxTQUFTLGdCQUFnQjtBQUVsQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGlCQUFpQixvQkFBb0I7QUFDOUMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw0QkFBeUY7QUFDbEcsU0FBUyxRQUErRiwyQkFBMkIsWUFBWSxjQUFjLFlBQVksNkJBQXdDO0FBQ2pOLFNBQVMsb0JBQW9CLDhCQUE4QjtBQU0zRCxNQUFNLHlCQUF5QixxQkFBcUI7QUFBQSxFQUFwRDtBQUFBO0FBRUMsdUJBQXVCLElBQUksUUFBUTtBQUNuQyxzQkFBMkQsRUFBRSxjQUFjLE9BQU8sVUFBVSxNQUFNO0FBQ2xH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
