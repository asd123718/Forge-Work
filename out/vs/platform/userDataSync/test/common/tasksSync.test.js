import assert from "assert";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { IFileService } from "../../../files/common/files.js";
import { ILogService } from "../../../log/common/log.js";
import { IUserDataProfilesService } from "../../../userDataProfile/common/userDataProfile.js";
import { getTasksContentFromSyncContent } from "../../common/tasksSync.js";
import { Change, IUserDataSyncStoreService, MergeState, SyncResource, SyncStatus } from "../../common/userDataSync.js";
import { UserDataSyncClient, UserDataSyncTestServer } from "./userDataSyncClient.js";
suite("TasksSync", () => {
  const server = new UserDataSyncTestServer();
  let client;
  let testObject;
  teardown(async () => {
    await client.instantiationService.get(IUserDataSyncStoreService).clear();
  });
  const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();
  setup(async () => {
    client = disposableStore.add(new UserDataSyncClient(server));
    await client.setUp(true);
    testObject = client.getSynchronizer(SyncResource.Tasks);
  });
  test("when tasks file does not exist", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      assert.deepStrictEqual(await testObject.getLastSyncUserData(), null);
      let manifest = await client.getLatestRef(SyncResource.Tasks);
      server.reset();
      await testObject.sync(manifest);
      assert.deepStrictEqual(server.requests, []);
      assert.ok(!await fileService.exists(tasksResource));
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
      assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
      assert.strictEqual(lastSyncUserData.syncData, null);
      manifest = await client.getLatestRef(SyncResource.Tasks);
      server.reset();
      await testObject.sync(manifest);
      assert.deepStrictEqual(server.requests, []);
      manifest = await client.getLatestRef(SyncResource.Tasks);
      server.reset();
      await testObject.sync(manifest);
      assert.deepStrictEqual(server.requests, []);
    });
  });
  test("when tasks file does not exist and remote has changes", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const content = JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch",
          "label": "Watch"
        }]
      });
      const tasksResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      await client2.instantiationService.get(IFileService).writeFile(tasksResource2, VSBuffer.fromString(content));
      await client2.sync();
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getTasksContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(tasksResource)).value.toString(), content);
    });
  });
  test("when tasks file exists locally and remote has no tasks", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      const content = JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch",
          "label": "Watch"
        }]
      });
      fileService.writeFile(tasksResource, VSBuffer.fromString(content));
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getTasksContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
    });
  });
  test("first time sync: when tasks file exists locally with same content as remote", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const content = JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch",
          "label": "Watch"
        }]
      });
      const tasksResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      await client2.instantiationService.get(IFileService).writeFile(tasksResource2, VSBuffer.fromString(content));
      await client2.sync();
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      await fileService.writeFile(tasksResource, VSBuffer.fromString(content));
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getTasksContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(tasksResource)).value.toString(), content);
    });
  });
  test("when tasks file locally has moved forward", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      fileService.writeFile(tasksResource, VSBuffer.fromString(JSON.stringify({
        "version": "2.0.0",
        "tasks": []
      })));
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      const content = JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch",
          "label": "Watch"
        }]
      });
      fileService.writeFile(tasksResource, VSBuffer.fromString(content));
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getTasksContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
    });
  });
  test("when tasks file remotely has moved forward", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const tasksResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      await fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
        "version": "2.0.0",
        "tasks": []
      })));
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      const content = JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch",
          "label": "Watch"
        }]
      });
      fileService2.writeFile(tasksResource2, VSBuffer.fromString(content));
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getTasksContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(tasksResource)).value.toString(), content);
    });
  });
  test("when tasks file has moved forward locally and remotely with same changes", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const tasksResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      await fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
        "version": "2.0.0",
        "tasks": []
      })));
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      const content = JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch",
          "label": "Watch"
        }]
      });
      fileService2.writeFile(tasksResource2, VSBuffer.fromString(content));
      await client2.sync();
      fileService.writeFile(tasksResource, VSBuffer.fromString(content));
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getTasksContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(tasksResource)).value.toString(), content);
    });
  });
  test("when tasks file has moved forward locally and remotely - accept preview", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const tasksResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      await fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
        "version": "2.0.0",
        "tasks": []
      })));
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch"
        }]
      })));
      await client2.sync();
      const content = JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch",
          "label": "Watch"
        }]
      });
      fileService.writeFile(tasksResource, VSBuffer.fromString(content));
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      const previewContent = (await fileService.readFile(testObject.conflicts.conflicts[0].previewResource)).value.toString();
      assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
      assert.deepStrictEqual(testObject.conflicts.conflicts.length, 1);
      assert.deepStrictEqual(testObject.conflicts.conflicts[0].mergeState, MergeState.Conflict);
      assert.deepStrictEqual(testObject.conflicts.conflicts[0].localChange, Change.Modified);
      assert.deepStrictEqual(testObject.conflicts.conflicts[0].remoteChange, Change.Modified);
      await testObject.accept(testObject.conflicts.conflicts[0].previewResource);
      await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), previewContent);
      assert.strictEqual(getTasksContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), previewContent);
      assert.strictEqual((await fileService.readFile(tasksResource)).value.toString(), previewContent);
    });
  });
  test("when tasks file has moved forward locally and remotely - accept modified preview", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const tasksResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      await fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
        "version": "2.0.0",
        "tasks": []
      })));
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch"
        }]
      })));
      await client2.sync();
      fileService.writeFile(tasksResource, VSBuffer.fromString(JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch",
          "label": "Watch"
        }]
      })));
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      const content = JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch",
          "label": "Watch 2"
        }]
      });
      await testObject.accept(testObject.conflicts.conflicts[0].previewResource, content);
      await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getTasksContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(tasksResource)).value.toString(), content);
    });
  });
  test("when tasks file has moved forward locally and remotely - accept remote", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const tasksResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      await fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
        "version": "2.0.0",
        "tasks": []
      })));
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      const content = JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch"
        }]
      });
      fileService2.writeFile(tasksResource2, VSBuffer.fromString(content));
      await client2.sync();
      fileService.writeFile(tasksResource, VSBuffer.fromString(JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch",
          "label": "Watch"
        }]
      })));
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
      await testObject.accept(testObject.conflicts.conflicts[0].remoteResource);
      await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getTasksContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(tasksResource)).value.toString(), content);
    });
  });
  test("when tasks file has moved forward locally and remotely - accept local", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const tasksResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      await fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
        "version": "2.0.0",
        "tasks": []
      })));
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch"
        }]
      })));
      await client2.sync();
      const content = JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch",
          "label": "Watch"
        }]
      });
      fileService.writeFile(tasksResource, VSBuffer.fromString(content));
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
      await testObject.accept(testObject.conflicts.conflicts[0].localResource);
      await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getTasksContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(tasksResource)).value.toString(), content);
    });
  });
  test("when tasks file was removed in one client", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      await fileService.writeFile(tasksResource, VSBuffer.fromString(JSON.stringify({
        "version": "2.0.0",
        "tasks": []
      })));
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      await client2.sync();
      const tasksResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      fileService2.del(tasksResource2);
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), null);
      assert.strictEqual(getTasksContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), null);
      assert.strictEqual(await fileService.exists(tasksResource), false);
    });
  });
  test("when tasks file is created after first sync", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      await testObject.sync(await client.getLatestRef(SyncResource.Tasks));
      const content = JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch",
          "label": "Watch"
        }]
      });
      await fileService.createFile(tasksResource, VSBuffer.fromString(content));
      let lastSyncUserData = await testObject.getLastSyncUserData();
      const manifest = await client.getLatestRef(SyncResource.Tasks);
      server.reset();
      await testObject.sync(manifest);
      assert.deepStrictEqual(server.requests, [
        { type: "POST", url: `${server.url}/v1/resource/${testObject.resource}`, headers: { "If-Match": lastSyncUserData?.ref } }
      ]);
      lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
      assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
      assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
    });
  });
  test("apply remote when tasks file does not exist", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const tasksResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.tasksResource;
      if (await fileService.exists(tasksResource)) {
        await fileService.del(tasksResource);
      }
      const preview = await testObject.sync(await client.getLatestRef(SyncResource.Tasks), true);
      server.reset();
      const content = await testObject.resolveContent(preview.resourcePreviews[0].remoteResource);
      await testObject.accept(preview.resourcePreviews[0].remoteResource, content);
      await testObject.apply(false);
      assert.deepStrictEqual(server.requests, []);
    });
  });
  test("sync profile tasks", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const profile = await client2.instantiationService.get(IUserDataProfilesService).createNamedProfile("profile1");
      const expected = JSON.stringify({
        "version": "2.0.0",
        "tasks": [{
          "type": "npm",
          "script": "watch",
          "label": "Watch"
        }]
      });
      await client2.instantiationService.get(IFileService).createFile(profile.tasksResource, VSBuffer.fromString(expected));
      await client2.sync();
      await client.sync();
      const syncedProfile = client.instantiationService.get(IUserDataProfilesService).profiles.find((p) => p.id === profile.id);
      const actual = (await client.instantiationService.get(IFileService).readFile(syncedProfile.tasksResource)).value.toString();
      assert.strictEqual(actual, expected);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFx0ZXN0XFxjb21tb25cXHRhc2tzU3luYy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgZ2V0VGFza3NDb250ZW50RnJvbVN5bmNDb250ZW50LCBUYXNrc1N5bmNocm9uaXNlciB9IGZyb20gJy4uLy4uL2NvbW1vbi90YXNrc1N5bmMuanMnO1xuaW1wb3J0IHsgQ2hhbmdlLCBJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLCBNZXJnZVN0YXRlLCBTeW5jUmVzb3VyY2UsIFN5bmNTdGF0dXMgfSBmcm9tICcuLi8uLi9jb21tb24vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IFVzZXJEYXRhU3luY0NsaWVudCwgVXNlckRhdGFTeW5jVGVzdFNlcnZlciB9IGZyb20gJy4vdXNlckRhdGFTeW5jQ2xpZW50LmpzJztcblxuc3VpdGUoJ1Rhc2tzU3luYycsICgpID0+IHtcblxuXHRjb25zdCBzZXJ2ZXIgPSBuZXcgVXNlckRhdGFTeW5jVGVzdFNlcnZlcigpO1xuXHRsZXQgY2xpZW50OiBVc2VyRGF0YVN5bmNDbGllbnQ7XG5cblx0bGV0IHRlc3RPYmplY3Q6IFRhc2tzU3luY2hyb25pc2VyO1xuXG5cdHRlYXJkb3duKGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVTdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRjbGllbnQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQoc2VydmVyKSk7XG5cdFx0YXdhaXQgY2xpZW50LnNldFVwKHRydWUpO1xuXHRcdHRlc3RPYmplY3QgPSBjbGllbnQuZ2V0U3luY2hyb25pemVyKFN5bmNSZXNvdXJjZS5UYXNrcykgYXMgVGFza3NTeW5jaHJvbmlzZXI7XG5cdH0pO1xuXG5cdHRlc3QoJ3doZW4gdGFza3MgZmlsZSBkb2VzIG5vdCBleGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdGFza3NSZXNvdXJjZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS50YXNrc1Jlc291cmNlO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpLCBudWxsKTtcblx0XHRcdGxldCBtYW5pZmVzdCA9IGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlRhc2tzKTtcblx0XHRcdHNlcnZlci5yZXNldCgpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKG1hbmlmZXN0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2ZXIucmVxdWVzdHMsIFtdKTtcblx0XHRcdGFzc2VydC5vayghYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKHRhc2tzUmVzb3VyY2UpKTtcblxuXHRcdFx0Y29uc3QgbGFzdFN5bmNVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXHRcdFx0Y29uc3QgcmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldFJlbW90ZVVzZXJEYXRhKG51bGwpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXN0U3luY1VzZXJEYXRhIS5yZWYsIHJlbW90ZVVzZXJEYXRhLnJlZik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhLCByZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdFN5bmNVc2VyRGF0YSEuc3luY0RhdGEsIG51bGwpO1xuXG5cdFx0XHRtYW5pZmVzdCA9IGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlRhc2tzKTtcblx0XHRcdHNlcnZlci5yZXNldCgpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKG1hbmlmZXN0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RzLCBbXSk7XG5cblx0XHRcdG1hbmlmZXN0ID0gYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuVGFza3MpO1xuXHRcdFx0c2VydmVyLnJlc2V0KCk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMobWFuaWZlc3QpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2ZXIucmVxdWVzdHMsIFtdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnd2hlbiB0YXNrcyBmaWxlIGRvZXMgbm90IGV4aXN0IGFuZCByZW1vdGUgaGFzIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbGllbnQyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHNlcnZlcikpO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5zZXRVcCh0cnVlKTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCd2ZXJzaW9uJzogJzIuMC4wJyxcblx0XHRcdFx0J3Rhc2tzJzogW3tcblx0XHRcdFx0XHQndHlwZSc6ICducG0nLFxuXHRcdFx0XHRcdCdzY3JpcHQnOiAnd2F0Y2gnLFxuXHRcdFx0XHRcdCdsYWJlbCc6ICdXYXRjaCdcblx0XHRcdFx0fV1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgdGFza3NSZXNvdXJjZTIgPSBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLnRhc2tzUmVzb3VyY2U7XG5cdFx0XHRhd2FpdCBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpLndyaXRlRmlsZSh0YXNrc1Jlc291cmNlMiwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCB0YXNrc1Jlc291cmNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLnRhc2tzUmVzb3VyY2U7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5UYXNrcykpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdFx0Y29uc3QgbGFzdFN5bmNVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXHRcdFx0Y29uc3QgcmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldFJlbW90ZVVzZXJEYXRhKG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRhc2tzQ29udGVudEZyb21TeW5jQ29udGVudChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBjb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUYXNrc0NvbnRlbnRGcm9tU3luY0NvbnRlbnQocmVtb3RlVXNlckRhdGEuc3luY0RhdGEhLmNvbnRlbnQsIGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxvZ1NlcnZpY2UpKSwgY29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHRhc2tzUmVzb3VyY2UpKS52YWx1ZS50b1N0cmluZygpLCBjb250ZW50KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnd2hlbiB0YXNrcyBmaWxlIGV4aXN0cyBsb2NhbGx5IGFuZCByZW1vdGUgaGFzIG5vIHRhc2tzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCB0YXNrc1Jlc291cmNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLnRhc2tzUmVzb3VyY2U7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQndmVyc2lvbic6ICcyLjAuMCcsXG5cdFx0XHRcdCd0YXNrcyc6IFt7XG5cdFx0XHRcdFx0J3R5cGUnOiAnbnBtJyxcblx0XHRcdFx0XHQnc2NyaXB0JzogJ3dhdGNoJyxcblx0XHRcdFx0XHQnbGFiZWwnOiAnV2F0Y2gnXG5cdFx0XHRcdH1dXG5cdFx0XHR9KTtcblx0XHRcdGZpbGVTZXJ2aWNlLndyaXRlRmlsZSh0YXNrc1Jlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblxuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlRhc2tzKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VGFza3NDb250ZW50RnJvbVN5bmNDb250ZW50KGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRhc2tzQ29udGVudEZyb21TeW5jQ29udGVudChyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBjb250ZW50KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZmlyc3QgdGltZSBzeW5jOiB3aGVuIHRhc2tzIGZpbGUgZXhpc3RzIGxvY2FsbHkgd2l0aCBzYW1lIGNvbnRlbnQgYXMgcmVtb3RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xpZW50MiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudChzZXJ2ZXIpKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc2V0VXAodHJ1ZSk7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQndmVyc2lvbic6ICcyLjAuMCcsXG5cdFx0XHRcdCd0YXNrcyc6IFt7XG5cdFx0XHRcdFx0J3R5cGUnOiAnbnBtJyxcblx0XHRcdFx0XHQnc2NyaXB0JzogJ3dhdGNoJyxcblx0XHRcdFx0XHQnbGFiZWwnOiAnV2F0Y2gnXG5cdFx0XHRcdH1dXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHRhc2tzUmVzb3VyY2UyID0gY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS50YXNrc1Jlc291cmNlO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKS53cml0ZUZpbGUodGFza3NSZXNvdXJjZTIsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdGFza3NSZXNvdXJjZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS50YXNrc1Jlc291cmNlO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRhc2tzUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuVGFza3MpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRcdGNvbnN0IGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRcdGNvbnN0IHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUYXNrc0NvbnRlbnRGcm9tU3luY0NvbnRlbnQobGFzdFN5bmNVc2VyRGF0YSEuc3luY0RhdGEhLmNvbnRlbnQsIGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxvZ1NlcnZpY2UpKSwgY29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VGFza3NDb250ZW50RnJvbVN5bmNDb250ZW50KHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZSh0YXNrc1Jlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKSwgY29udGVudCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3doZW4gdGFza3MgZmlsZSBsb2NhbGx5IGhhcyBtb3ZlZCBmb3J3YXJkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCB0YXNrc1Jlc291cmNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLnRhc2tzUmVzb3VyY2U7XG5cdFx0XHRmaWxlU2VydmljZS53cml0ZUZpbGUodGFza3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCd2ZXJzaW9uJzogJzIuMC4wJyxcblx0XHRcdFx0J3Rhc2tzJzogW11cblx0XHRcdH0pKSk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5UYXNrcykpO1xuXG5cdFx0XHRjb25zdCBjb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQndmVyc2lvbic6ICcyLjAuMCcsXG5cdFx0XHRcdCd0YXNrcyc6IFt7XG5cdFx0XHRcdFx0J3R5cGUnOiAnbnBtJyxcblx0XHRcdFx0XHQnc2NyaXB0JzogJ3dhdGNoJyxcblx0XHRcdFx0XHQnbGFiZWwnOiAnV2F0Y2gnXG5cdFx0XHRcdH1dXG5cdFx0XHR9KTtcblx0XHRcdGZpbGVTZXJ2aWNlLndyaXRlRmlsZSh0YXNrc1Jlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblxuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlRhc2tzKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VGFza3NDb250ZW50RnJvbVN5bmNDb250ZW50KGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRhc2tzQ29udGVudEZyb21TeW5jQ29udGVudChyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBjb250ZW50KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnd2hlbiB0YXNrcyBmaWxlIHJlbW90ZWx5IGhhcyBtb3ZlZCBmb3J3YXJkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xpZW50MiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudChzZXJ2ZXIpKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc2V0VXAodHJ1ZSk7XG5cdFx0XHRjb25zdCB0YXNrc1Jlc291cmNlMiA9IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUudGFza3NSZXNvdXJjZTtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlMiA9IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZTIud3JpdGVGaWxlKHRhc2tzUmVzb3VyY2UyLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J3ZlcnNpb24nOiAnMi4wLjAnLFxuXHRcdFx0XHQndGFza3MnOiBbXVxuXHRcdFx0fSkpKTtcblxuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCB0YXNrc1Jlc291cmNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLnRhc2tzUmVzb3VyY2U7XG5cblx0XHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlRhc2tzKSk7XG5cblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCd2ZXJzaW9uJzogJzIuMC4wJyxcblx0XHRcdFx0J3Rhc2tzJzogW3tcblx0XHRcdFx0XHQndHlwZSc6ICducG0nLFxuXHRcdFx0XHRcdCdzY3JpcHQnOiAnd2F0Y2gnLFxuXHRcdFx0XHRcdCdsYWJlbCc6ICdXYXRjaCdcblx0XHRcdFx0fV1cblx0XHRcdH0pO1xuXHRcdFx0ZmlsZVNlcnZpY2UyLndyaXRlRmlsZSh0YXNrc1Jlc291cmNlMiwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cblx0XHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlRhc2tzKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VGFza3NDb250ZW50RnJvbVN5bmNDb250ZW50KGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRhc2tzQ29udGVudEZyb21TeW5jQ29udGVudChyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBjb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUodGFza3NSZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCksIGNvbnRlbnQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3aGVuIHRhc2tzIGZpbGUgaGFzIG1vdmVkIGZvcndhcmQgbG9jYWxseSBhbmQgcmVtb3RlbHkgd2l0aCBzYW1lIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbGllbnQyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHNlcnZlcikpO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5zZXRVcCh0cnVlKTtcblx0XHRcdGNvbnN0IHRhc2tzUmVzb3VyY2UyID0gY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS50YXNrc1Jlc291cmNlO1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UyID0gY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlMi53cml0ZUZpbGUodGFza3NSZXNvdXJjZTIsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQndmVyc2lvbic6ICcyLjAuMCcsXG5cdFx0XHRcdCd0YXNrcyc6IFtdXG5cdFx0XHR9KSkpO1xuXG5cdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHRhc2tzUmVzb3VyY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUudGFza3NSZXNvdXJjZTtcblxuXHRcdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuVGFza3MpKTtcblxuXHRcdFx0Y29uc3QgY29udGVudCA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J3ZlcnNpb24nOiAnMi4wLjAnLFxuXHRcdFx0XHQndGFza3MnOiBbe1xuXHRcdFx0XHRcdCd0eXBlJzogJ25wbScsXG5cdFx0XHRcdFx0J3NjcmlwdCc6ICd3YXRjaCcsXG5cdFx0XHRcdFx0J2xhYmVsJzogJ1dhdGNoJ1xuXHRcdFx0XHR9XVxuXHRcdFx0fSk7XG5cdFx0XHRmaWxlU2VydmljZTIud3JpdGVGaWxlKHRhc2tzUmVzb3VyY2UyLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0XHRmaWxlU2VydmljZS53cml0ZUZpbGUodGFza3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuVGFza3MpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRcdGNvbnN0IGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRcdGNvbnN0IHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUYXNrc0NvbnRlbnRGcm9tU3luY0NvbnRlbnQobGFzdFN5bmNVc2VyRGF0YSEuc3luY0RhdGEhLmNvbnRlbnQsIGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxvZ1NlcnZpY2UpKSwgY29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VGFza3NDb250ZW50RnJvbVN5bmNDb250ZW50KHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZSh0YXNrc1Jlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKSwgY29udGVudCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3doZW4gdGFza3MgZmlsZSBoYXMgbW92ZWQgZm9yd2FyZCBsb2NhbGx5IGFuZCByZW1vdGVseSAtIGFjY2VwdCBwcmV2aWV3JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xpZW50MiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudChzZXJ2ZXIpKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc2V0VXAodHJ1ZSk7XG5cdFx0XHRjb25zdCB0YXNrc1Jlc291cmNlMiA9IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUudGFza3NSZXNvdXJjZTtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlMiA9IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZTIud3JpdGVGaWxlKHRhc2tzUmVzb3VyY2UyLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J3ZlcnNpb24nOiAnMi4wLjAnLFxuXHRcdFx0XHQndGFza3MnOiBbXVxuXHRcdFx0fSkpKTtcblxuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCB0YXNrc1Jlc291cmNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLnRhc2tzUmVzb3VyY2U7XG5cblx0XHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlRhc2tzKSk7XG5cblx0XHRcdGZpbGVTZXJ2aWNlMi53cml0ZUZpbGUodGFza3NSZXNvdXJjZTIsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQndmVyc2lvbic6ICcyLjAuMCcsXG5cdFx0XHRcdCd0YXNrcyc6IFt7XG5cdFx0XHRcdFx0J3R5cGUnOiAnbnBtJyxcblx0XHRcdFx0XHQnc2NyaXB0JzogJ3dhdGNoJyxcblx0XHRcdFx0fV1cblx0XHRcdH0pKSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdFx0Y29uc3QgY29udGVudCA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J3ZlcnNpb24nOiAnMi4wLjAnLFxuXHRcdFx0XHQndGFza3MnOiBbe1xuXHRcdFx0XHRcdCd0eXBlJzogJ25wbScsXG5cdFx0XHRcdFx0J3NjcmlwdCc6ICd3YXRjaCcsXG5cdFx0XHRcdFx0J2xhYmVsJzogJ1dhdGNoJ1xuXHRcdFx0XHR9XVxuXHRcdFx0fSk7XG5cdFx0XHRmaWxlU2VydmljZS53cml0ZUZpbGUodGFza3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuVGFza3MpKTtcblxuXHRcdFx0Y29uc3QgcHJldmlld0NvbnRlbnQgPSAoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzWzBdLnByZXZpZXdSZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHNbMF0ubWVyZ2VTdGF0ZSwgTWVyZ2VTdGF0ZS5Db25mbGljdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0c1swXS5sb2NhbENoYW5nZSwgQ2hhbmdlLk1vZGlmaWVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzWzBdLnJlbW90ZUNoYW5nZSwgQ2hhbmdlLk1vZGlmaWVkKTtcblxuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5hY2NlcHQodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzWzBdLnByZXZpZXdSZXNvdXJjZSk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFwcGx5KGZhbHNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VGFza3NDb250ZW50RnJvbVN5bmNDb250ZW50KGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIHByZXZpZXdDb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUYXNrc0NvbnRlbnRGcm9tU3luY0NvbnRlbnQocmVtb3RlVXNlckRhdGEuc3luY0RhdGEhLmNvbnRlbnQsIGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxvZ1NlcnZpY2UpKSwgcHJldmlld0NvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZSh0YXNrc1Jlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKSwgcHJldmlld0NvbnRlbnQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3aGVuIHRhc2tzIGZpbGUgaGFzIG1vdmVkIGZvcndhcmQgbG9jYWxseSBhbmQgcmVtb3RlbHkgLSBhY2NlcHQgbW9kaWZpZWQgcHJldmlldycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNsaWVudDIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQoc2VydmVyKSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnNldFVwKHRydWUpO1xuXHRcdFx0Y29uc3QgdGFza3NSZXNvdXJjZTIgPSBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLnRhc2tzUmVzb3VyY2U7XG5cdFx0XHRjb25zdCBmaWxlU2VydmljZTIgPSBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2UyLndyaXRlRmlsZSh0YXNrc1Jlc291cmNlMiwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCd2ZXJzaW9uJzogJzIuMC4wJyxcblx0XHRcdFx0J3Rhc2tzJzogW11cblx0XHRcdH0pKSk7XG5cblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdGFza3NSZXNvdXJjZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS50YXNrc1Jlc291cmNlO1xuXG5cdFx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5UYXNrcykpO1xuXG5cdFx0XHRmaWxlU2VydmljZTIud3JpdGVGaWxlKHRhc2tzUmVzb3VyY2UyLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J3ZlcnNpb24nOiAnMi4wLjAnLFxuXHRcdFx0XHQndGFza3MnOiBbe1xuXHRcdFx0XHRcdCd0eXBlJzogJ25wbScsXG5cdFx0XHRcdFx0J3NjcmlwdCc6ICd3YXRjaCcsXG5cdFx0XHRcdH1dXG5cdFx0XHR9KSkpO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRcdGZpbGVTZXJ2aWNlLndyaXRlRmlsZSh0YXNrc1Jlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J3ZlcnNpb24nOiAnMi4wLjAnLFxuXHRcdFx0XHQndGFza3MnOiBbe1xuXHRcdFx0XHRcdCd0eXBlJzogJ25wbScsXG5cdFx0XHRcdFx0J3NjcmlwdCc6ICd3YXRjaCcsXG5cdFx0XHRcdFx0J2xhYmVsJzogJ1dhdGNoJ1xuXHRcdFx0XHR9XVxuXHRcdFx0fSkpKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5UYXNrcykpO1xuXG5cdFx0XHRjb25zdCBjb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQndmVyc2lvbic6ICcyLjAuMCcsXG5cdFx0XHRcdCd0YXNrcyc6IFt7XG5cdFx0XHRcdFx0J3R5cGUnOiAnbnBtJyxcblx0XHRcdFx0XHQnc2NyaXB0JzogJ3dhdGNoJyxcblx0XHRcdFx0XHQnbGFiZWwnOiAnV2F0Y2ggMidcblx0XHRcdFx0fV1cblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5hY2NlcHQodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzWzBdLnByZXZpZXdSZXNvdXJjZSwgY29udGVudCk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFwcGx5KGZhbHNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VGFza3NDb250ZW50RnJvbVN5bmNDb250ZW50KGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRhc2tzQ29udGVudEZyb21TeW5jQ29udGVudChyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBjb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUodGFza3NSZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCksIGNvbnRlbnQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3aGVuIHRhc2tzIGZpbGUgaGFzIG1vdmVkIGZvcndhcmQgbG9jYWxseSBhbmQgcmVtb3RlbHkgLSBhY2NlcHQgcmVtb3RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xpZW50MiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudChzZXJ2ZXIpKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc2V0VXAodHJ1ZSk7XG5cdFx0XHRjb25zdCB0YXNrc1Jlc291cmNlMiA9IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUudGFza3NSZXNvdXJjZTtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlMiA9IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZTIud3JpdGVGaWxlKHRhc2tzUmVzb3VyY2UyLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J3ZlcnNpb24nOiAnMi4wLjAnLFxuXHRcdFx0XHQndGFza3MnOiBbXVxuXHRcdFx0fSkpKTtcblxuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCB0YXNrc1Jlc291cmNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLnRhc2tzUmVzb3VyY2U7XG5cblx0XHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlRhc2tzKSk7XG5cblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCd2ZXJzaW9uJzogJzIuMC4wJyxcblx0XHRcdFx0J3Rhc2tzJzogW3tcblx0XHRcdFx0XHQndHlwZSc6ICducG0nLFxuXHRcdFx0XHRcdCdzY3JpcHQnOiAnd2F0Y2gnLFxuXHRcdFx0XHR9XVxuXHRcdFx0fSk7XG5cdFx0XHRmaWxlU2VydmljZTIud3JpdGVGaWxlKHRhc2tzUmVzb3VyY2UyLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0XHRmaWxlU2VydmljZS53cml0ZUZpbGUodGFza3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCd2ZXJzaW9uJzogJzIuMC4wJyxcblx0XHRcdFx0J3Rhc2tzJzogW3tcblx0XHRcdFx0XHQndHlwZSc6ICducG0nLFxuXHRcdFx0XHRcdCdzY3JpcHQnOiAnd2F0Y2gnLFxuXHRcdFx0XHRcdCdsYWJlbCc6ICdXYXRjaCdcblx0XHRcdFx0fV1cblx0XHRcdH0pKSk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuVGFza3MpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSGFzQ29uZmxpY3RzKTtcblxuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5hY2NlcHQodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzWzBdLnJlbW90ZVJlc291cmNlKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRcdGNvbnN0IGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRcdGNvbnN0IHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUYXNrc0NvbnRlbnRGcm9tU3luY0NvbnRlbnQobGFzdFN5bmNVc2VyRGF0YSEuc3luY0RhdGEhLmNvbnRlbnQsIGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxvZ1NlcnZpY2UpKSwgY29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VGFza3NDb250ZW50RnJvbVN5bmNDb250ZW50KHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZSh0YXNrc1Jlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKSwgY29udGVudCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3doZW4gdGFza3MgZmlsZSBoYXMgbW92ZWQgZm9yd2FyZCBsb2NhbGx5IGFuZCByZW1vdGVseSAtIGFjY2VwdCBsb2NhbCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNsaWVudDIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQoc2VydmVyKSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnNldFVwKHRydWUpO1xuXHRcdFx0Y29uc3QgdGFza3NSZXNvdXJjZTIgPSBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLnRhc2tzUmVzb3VyY2U7XG5cdFx0XHRjb25zdCBmaWxlU2VydmljZTIgPSBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2UyLndyaXRlRmlsZSh0YXNrc1Jlc291cmNlMiwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCd2ZXJzaW9uJzogJzIuMC4wJyxcblx0XHRcdFx0J3Rhc2tzJzogW11cblx0XHRcdH0pKSk7XG5cblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdGFza3NSZXNvdXJjZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS50YXNrc1Jlc291cmNlO1xuXG5cdFx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5UYXNrcykpO1xuXG5cdFx0XHRmaWxlU2VydmljZTIud3JpdGVGaWxlKHRhc2tzUmVzb3VyY2UyLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J3ZlcnNpb24nOiAnMi4wLjAnLFxuXHRcdFx0XHQndGFza3MnOiBbe1xuXHRcdFx0XHRcdCd0eXBlJzogJ25wbScsXG5cdFx0XHRcdFx0J3NjcmlwdCc6ICd3YXRjaCcsXG5cdFx0XHRcdH1dXG5cdFx0XHR9KSkpO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCd2ZXJzaW9uJzogJzIuMC4wJyxcblx0XHRcdFx0J3Rhc2tzJzogW3tcblx0XHRcdFx0XHQndHlwZSc6ICducG0nLFxuXHRcdFx0XHRcdCdzY3JpcHQnOiAnd2F0Y2gnLFxuXHRcdFx0XHRcdCdsYWJlbCc6ICdXYXRjaCdcblx0XHRcdFx0fV1cblx0XHRcdH0pO1xuXHRcdFx0ZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRhc2tzUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlRhc2tzKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0c1swXS5sb2NhbFJlc291cmNlKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRcdGNvbnN0IGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRcdGNvbnN0IHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUYXNrc0NvbnRlbnRGcm9tU3luY0NvbnRlbnQobGFzdFN5bmNVc2VyRGF0YSEuc3luY0RhdGEhLmNvbnRlbnQsIGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxvZ1NlcnZpY2UpKSwgY29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VGFza3NDb250ZW50RnJvbVN5bmNDb250ZW50KHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZSh0YXNrc1Jlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKSwgY29udGVudCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3doZW4gdGFza3MgZmlsZSB3YXMgcmVtb3ZlZCBpbiBvbmUgY2xpZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCB0YXNrc1Jlc291cmNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLnRhc2tzUmVzb3VyY2U7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUodGFza3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCd2ZXJzaW9uJzogJzIuMC4wJyxcblx0XHRcdFx0J3Rhc2tzJzogW11cblx0XHRcdH0pKSk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuVGFza3MpKTtcblxuXHRcdFx0Y29uc3QgY2xpZW50MiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudChzZXJ2ZXIpKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc2V0VXAodHJ1ZSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdFx0Y29uc3QgdGFza3NSZXNvdXJjZTIgPSBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLnRhc2tzUmVzb3VyY2U7XG5cdFx0XHRjb25zdCBmaWxlU2VydmljZTIgPSBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0ZmlsZVNlcnZpY2UyLmRlbCh0YXNrc1Jlc291cmNlMik7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlRhc2tzKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VGFza3NDb250ZW50RnJvbVN5bmNDb250ZW50KGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRhc2tzQ29udGVudEZyb21TeW5jQ29udGVudChyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBmaWxlU2VydmljZS5leGlzdHModGFza3NSZXNvdXJjZSksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnd2hlbiB0YXNrcyBmaWxlIGlzIGNyZWF0ZWQgYWZ0ZXIgZmlyc3Qgc3luYycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdGFza3NSZXNvdXJjZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS50YXNrc1Jlc291cmNlO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlRhc2tzKSk7XG5cblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCd2ZXJzaW9uJzogJzIuMC4wJyxcblx0XHRcdFx0J3Rhc2tzJzogW3tcblx0XHRcdFx0XHQndHlwZSc6ICducG0nLFxuXHRcdFx0XHRcdCdzY3JpcHQnOiAnd2F0Y2gnLFxuXHRcdFx0XHRcdCdsYWJlbCc6ICdXYXRjaCdcblx0XHRcdFx0fV1cblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2UuY3JlYXRlRmlsZSh0YXNrc1Jlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblxuXHRcdFx0bGV0IGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuVGFza3MpO1xuXHRcdFx0c2VydmVyLnJlc2V0KCk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMobWFuaWZlc3QpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZlci5yZXF1ZXN0cywgW1xuXHRcdFx0XHR7IHR5cGU6ICdQT1NUJywgdXJsOiBgJHtzZXJ2ZXIudXJsfS92MS9yZXNvdXJjZS8ke3Rlc3RPYmplY3QucmVzb3VyY2V9YCwgaGVhZGVyczogeyAnSWYtTWF0Y2gnOiBsYXN0U3luY1VzZXJEYXRhPy5yZWYgfSB9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRcdGNvbnN0IHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN5bmNVc2VyRGF0YSEucmVmLCByZW1vdGVVc2VyRGF0YS5yZWYpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSwgcmVtb3RlVXNlckRhdGEuc3luY0RhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRhc2tzQ29udGVudEZyb21TeW5jQ29udGVudChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBjb250ZW50KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYXBwbHkgcmVtb3RlIHdoZW4gdGFza3MgZmlsZSBkb2VzIG5vdCBleGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdGFza3NSZXNvdXJjZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS50YXNrc1Jlc291cmNlO1xuXHRcdFx0aWYgKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyh0YXNrc1Jlc291cmNlKSkge1xuXHRcdFx0XHRhd2FpdCBmaWxlU2VydmljZS5kZWwodGFza3NSZXNvdXJjZSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHByZXZpZXcgPSAoYXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLlRhc2tzKSwgdHJ1ZSkpITtcblxuXHRcdFx0c2VydmVyLnJlc2V0KCk7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGVzdE9iamVjdC5yZXNvbHZlQ29udGVudChwcmV2aWV3LnJlc291cmNlUHJldmlld3NbMF0ucmVtb3RlUmVzb3VyY2UpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5hY2NlcHQocHJldmlldy5yZXNvdXJjZVByZXZpZXdzWzBdLnJlbW90ZVJlc291cmNlLCBjb250ZW50KTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2ZXIucmVxdWVzdHMsIFtdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc3luYyBwcm9maWxlIHRhc2tzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xpZW50MiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudChzZXJ2ZXIpKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc2V0VXAodHJ1ZSk7XG5cdFx0XHRjb25zdCBwcm9maWxlID0gYXdhaXQgY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5jcmVhdGVOYW1lZFByb2ZpbGUoJ3Byb2ZpbGUxJyk7XG5cdFx0XHRjb25zdCBleHBlY3RlZCA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J3ZlcnNpb24nOiAnMi4wLjAnLFxuXHRcdFx0XHQndGFza3MnOiBbe1xuXHRcdFx0XHRcdCd0eXBlJzogJ25wbScsXG5cdFx0XHRcdFx0J3NjcmlwdCc6ICd3YXRjaCcsXG5cdFx0XHRcdFx0J2xhYmVsJzogJ1dhdGNoJ1xuXHRcdFx0XHR9XVxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpLmNyZWF0ZUZpbGUocHJvZmlsZS50YXNrc1Jlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGV4cGVjdGVkKSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdFx0YXdhaXQgY2xpZW50LnN5bmMoKTtcblxuXHRcdFx0Y29uc3Qgc3luY2VkUHJvZmlsZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5wcm9maWxlcy5maW5kKHAgPT4gcC5pZCA9PT0gcHJvZmlsZS5pZCkhO1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gKGF3YWl0IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKS5yZWFkRmlsZShzeW5jZWRQcm9maWxlLnRhc2tzUmVzb3VyY2UpKS52YWx1ZS50b1N0cmluZygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxzQ0FBeUQ7QUFDbEUsU0FBUyxRQUFRLDJCQUEyQixZQUFZLGNBQWMsa0JBQWtCO0FBQ3hGLFNBQVMsb0JBQW9CLDhCQUE4QjtBQUUzRCxNQUFNLGFBQWEsTUFBTTtBQUV4QixRQUFNLFNBQVMsSUFBSSx1QkFBdUI7QUFDMUMsTUFBSTtBQUVKLE1BQUk7QUFFSixXQUFTLFlBQVk7QUFDcEIsVUFBTSxPQUFPLHFCQUFxQixJQUFJLHlCQUF5QixFQUFFLE1BQU07QUFBQSxFQUN4RSxDQUFDO0FBRUQsUUFBTSxrQkFBa0Isd0NBQXdDO0FBRWhFLFFBQU0sWUFBWTtBQUNqQixhQUFTLGdCQUFnQixJQUFJLElBQUksbUJBQW1CLE1BQU0sQ0FBQztBQUMzRCxVQUFNLE9BQU8sTUFBTSxJQUFJO0FBQ3ZCLGlCQUFhLE9BQU8sZ0JBQWdCLGFBQWEsS0FBSztBQUFBLEVBQ3ZELENBQUM7QUFFRCxPQUFLLGtDQUFrQyxZQUFZO0FBQ2xELFVBQU0sbUJBQXlCLENBQUMsR0FBRyxZQUFZO0FBQzlDLFlBQU0sY0FBYyxPQUFPLHFCQUFxQixJQUFJLFlBQVk7QUFDaEUsWUFBTSxnQkFBZ0IsT0FBTyxxQkFBcUIsSUFBSSx3QkFBd0IsRUFBRSxlQUFlO0FBRS9GLGFBQU8sZ0JBQWdCLE1BQU0sV0FBVyxvQkFBb0IsR0FBRyxJQUFJO0FBQ25FLFVBQUksV0FBVyxNQUFNLE9BQU8sYUFBYSxhQUFhLEtBQUs7QUFDM0QsYUFBTyxNQUFNO0FBQ2IsWUFBTSxXQUFXLEtBQUssUUFBUTtBQUU5QixhQUFPLGdCQUFnQixPQUFPLFVBQVUsQ0FBQyxDQUFDO0FBQzFDLGFBQU8sR0FBRyxDQUFDLE1BQU0sWUFBWSxPQUFPLGFBQWEsQ0FBQztBQUVsRCxZQUFNLG1CQUFtQixNQUFNLFdBQVcsb0JBQW9CO0FBQzlELFlBQU0saUJBQWlCLE1BQU0sV0FBVyxrQkFBa0IsSUFBSTtBQUM5RCxhQUFPLGdCQUFnQixpQkFBa0IsS0FBSyxlQUFlLEdBQUc7QUFDaEUsYUFBTyxnQkFBZ0IsaUJBQWtCLFVBQVUsZUFBZSxRQUFRO0FBQzFFLGFBQU8sWUFBWSxpQkFBa0IsVUFBVSxJQUFJO0FBRW5ELGlCQUFXLE1BQU0sT0FBTyxhQUFhLGFBQWEsS0FBSztBQUN2RCxhQUFPLE1BQU07QUFDYixZQUFNLFdBQVcsS0FBSyxRQUFRO0FBQzlCLGFBQU8sZ0JBQWdCLE9BQU8sVUFBVSxDQUFDLENBQUM7QUFFMUMsaUJBQVcsTUFBTSxPQUFPLGFBQWEsYUFBYSxLQUFLO0FBQ3ZELGFBQU8sTUFBTTtBQUNiLFlBQU0sV0FBVyxLQUFLLFFBQVE7QUFDOUIsYUFBTyxnQkFBZ0IsT0FBTyxVQUFVLENBQUMsQ0FBQztBQUFBLElBQzNDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHlEQUF5RCxZQUFZO0FBQ3pFLFVBQU0sbUJBQXlCLENBQUMsR0FBRyxZQUFZO0FBQzlDLFlBQU0sVUFBVSxnQkFBZ0IsSUFBSSxJQUFJLG1CQUFtQixNQUFNLENBQUM7QUFDbEUsWUFBTSxRQUFRLE1BQU0sSUFBSTtBQUN4QixZQUFNLFVBQVUsS0FBSyxVQUFVO0FBQUEsUUFDOUIsV0FBVztBQUFBLFFBQ1gsU0FBUyxDQUFDO0FBQUEsVUFDVCxRQUFRO0FBQUEsVUFDUixVQUFVO0FBQUEsVUFDVixTQUFTO0FBQUEsUUFDVixDQUFDO0FBQUEsTUFDRixDQUFDO0FBQ0QsWUFBTSxpQkFBaUIsUUFBUSxxQkFBcUIsSUFBSSx3QkFBd0IsRUFBRSxlQUFlO0FBQ2pHLFlBQU0sUUFBUSxxQkFBcUIsSUFBSSxZQUFZLEVBQUUsVUFBVSxnQkFBZ0IsU0FBUyxXQUFXLE9BQU8sQ0FBQztBQUMzRyxZQUFNLFFBQVEsS0FBSztBQUVuQixZQUFNLGNBQWMsT0FBTyxxQkFBcUIsSUFBSSxZQUFZO0FBQ2hFLFlBQU0sZ0JBQWdCLE9BQU8scUJBQXFCLElBQUksd0JBQXdCLEVBQUUsZUFBZTtBQUUvRixZQUFNLFdBQVcsS0FBSyxNQUFNLE9BQU8sYUFBYSxhQUFhLEtBQUssQ0FBQztBQUVuRSxhQUFPLGdCQUFnQixXQUFXLFFBQVEsV0FBVyxJQUFJO0FBQ3pELFlBQU0sbUJBQW1CLE1BQU0sV0FBVyxvQkFBb0I7QUFDOUQsWUFBTSxpQkFBaUIsTUFBTSxXQUFXLGtCQUFrQixJQUFJO0FBQzlELGFBQU8sWUFBWSwrQkFBK0IsaUJBQWtCLFNBQVUsU0FBUyxPQUFPLHFCQUFxQixJQUFJLFdBQVcsQ0FBQyxHQUFHLE9BQU87QUFDN0ksYUFBTyxZQUFZLCtCQUErQixlQUFlLFNBQVUsU0FBUyxPQUFPLHFCQUFxQixJQUFJLFdBQVcsQ0FBQyxHQUFHLE9BQU87QUFDMUksYUFBTyxhQUFhLE1BQU0sWUFBWSxTQUFTLGFBQWEsR0FBRyxNQUFNLFNBQVMsR0FBRyxPQUFPO0FBQUEsSUFDekYsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMERBQTBELFlBQVk7QUFDMUUsVUFBTSxtQkFBeUIsQ0FBQyxHQUFHLFlBQVk7QUFDOUMsWUFBTSxjQUFjLE9BQU8scUJBQXFCLElBQUksWUFBWTtBQUNoRSxZQUFNLGdCQUFnQixPQUFPLHFCQUFxQixJQUFJLHdCQUF3QixFQUFFLGVBQWU7QUFDL0YsWUFBTSxVQUFVLEtBQUssVUFBVTtBQUFBLFFBQzlCLFdBQVc7QUFBQSxRQUNYLFNBQVMsQ0FBQztBQUFBLFVBQ1QsUUFBUTtBQUFBLFVBQ1IsVUFBVTtBQUFBLFVBQ1YsU0FBUztBQUFBLFFBQ1YsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUNELGtCQUFZLFVBQVUsZUFBZSxTQUFTLFdBQVcsT0FBTyxDQUFDO0FBRWpFLFlBQU0sV0FBVyxLQUFLLE1BQU0sT0FBTyxhQUFhLGFBQWEsS0FBSyxDQUFDO0FBRW5FLGFBQU8sZ0JBQWdCLFdBQVcsUUFBUSxXQUFXLElBQUk7QUFDekQsWUFBTSxtQkFBbUIsTUFBTSxXQUFXLG9CQUFvQjtBQUM5RCxZQUFNLGlCQUFpQixNQUFNLFdBQVcsa0JBQWtCLElBQUk7QUFDOUQsYUFBTyxZQUFZLCtCQUErQixpQkFBa0IsU0FBVSxTQUFTLE9BQU8scUJBQXFCLElBQUksV0FBVyxDQUFDLEdBQUcsT0FBTztBQUM3SSxhQUFPLFlBQVksK0JBQStCLGVBQWUsU0FBVSxTQUFTLE9BQU8scUJBQXFCLElBQUksV0FBVyxDQUFDLEdBQUcsT0FBTztBQUFBLElBQzNJLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLCtFQUErRSxZQUFZO0FBQy9GLFVBQU0sbUJBQXlCLENBQUMsR0FBRyxZQUFZO0FBQzlDLFlBQU0sVUFBVSxnQkFBZ0IsSUFBSSxJQUFJLG1CQUFtQixNQUFNLENBQUM7QUFDbEUsWUFBTSxRQUFRLE1BQU0sSUFBSTtBQUN4QixZQUFNLFVBQVUsS0FBSyxVQUFVO0FBQUEsUUFDOUIsV0FBVztBQUFBLFFBQ1gsU0FBUyxDQUFDO0FBQUEsVUFDVCxRQUFRO0FBQUEsVUFDUixVQUFVO0FBQUEsVUFDVixTQUFTO0FBQUEsUUFDVixDQUFDO0FBQUEsTUFDRixDQUFDO0FBQ0QsWUFBTSxpQkFBaUIsUUFBUSxxQkFBcUIsSUFBSSx3QkFBd0IsRUFBRSxlQUFlO0FBQ2pHLFlBQU0sUUFBUSxxQkFBcUIsSUFBSSxZQUFZLEVBQUUsVUFBVSxnQkFBZ0IsU0FBUyxXQUFXLE9BQU8sQ0FBQztBQUMzRyxZQUFNLFFBQVEsS0FBSztBQUVuQixZQUFNLGNBQWMsT0FBTyxxQkFBcUIsSUFBSSxZQUFZO0FBQ2hFLFlBQU0sZ0JBQWdCLE9BQU8scUJBQXFCLElBQUksd0JBQXdCLEVBQUUsZUFBZTtBQUMvRixZQUFNLFlBQVksVUFBVSxlQUFlLFNBQVMsV0FBVyxPQUFPLENBQUM7QUFFdkUsWUFBTSxXQUFXLEtBQUssTUFBTSxPQUFPLGFBQWEsYUFBYSxLQUFLLENBQUM7QUFFbkUsYUFBTyxnQkFBZ0IsV0FBVyxRQUFRLFdBQVcsSUFBSTtBQUN6RCxZQUFNLG1CQUFtQixNQUFNLFdBQVcsb0JBQW9CO0FBQzlELFlBQU0saUJBQWlCLE1BQU0sV0FBVyxrQkFBa0IsSUFBSTtBQUM5RCxhQUFPLFlBQVksK0JBQStCLGlCQUFrQixTQUFVLFNBQVMsT0FBTyxxQkFBcUIsSUFBSSxXQUFXLENBQUMsR0FBRyxPQUFPO0FBQzdJLGFBQU8sWUFBWSwrQkFBK0IsZUFBZSxTQUFVLFNBQVMsT0FBTyxxQkFBcUIsSUFBSSxXQUFXLENBQUMsR0FBRyxPQUFPO0FBQzFJLGFBQU8sYUFBYSxNQUFNLFlBQVksU0FBUyxhQUFhLEdBQUcsTUFBTSxTQUFTLEdBQUcsT0FBTztBQUFBLElBQ3pGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDZDQUE2QyxZQUFZO0FBQzdELFVBQU0sbUJBQXlCLENBQUMsR0FBRyxZQUFZO0FBQzlDLFlBQU0sY0FBYyxPQUFPLHFCQUFxQixJQUFJLFlBQVk7QUFDaEUsWUFBTSxnQkFBZ0IsT0FBTyxxQkFBcUIsSUFBSSx3QkFBd0IsRUFBRSxlQUFlO0FBQy9GLGtCQUFZLFVBQVUsZUFBZSxTQUFTLFdBQVcsS0FBSyxVQUFVO0FBQUEsUUFDdkUsV0FBVztBQUFBLFFBQ1gsU0FBUyxDQUFDO0FBQUEsTUFDWCxDQUFDLENBQUMsQ0FBQztBQUVILFlBQU0sV0FBVyxLQUFLLE1BQU0sT0FBTyxhQUFhLGFBQWEsS0FBSyxDQUFDO0FBRW5FLFlBQU0sVUFBVSxLQUFLLFVBQVU7QUFBQSxRQUM5QixXQUFXO0FBQUEsUUFDWCxTQUFTLENBQUM7QUFBQSxVQUNULFFBQVE7QUFBQSxVQUNSLFVBQVU7QUFBQSxVQUNWLFNBQVM7QUFBQSxRQUNWLENBQUM7QUFBQSxNQUNGLENBQUM7QUFDRCxrQkFBWSxVQUFVLGVBQWUsU0FBUyxXQUFXLE9BQU8sQ0FBQztBQUVqRSxZQUFNLFdBQVcsS0FBSyxNQUFNLE9BQU8sYUFBYSxhQUFhLEtBQUssQ0FBQztBQUVuRSxhQUFPLGdCQUFnQixXQUFXLFFBQVEsV0FBVyxJQUFJO0FBQ3pELFlBQU0sbUJBQW1CLE1BQU0sV0FBVyxvQkFBb0I7QUFDOUQsWUFBTSxpQkFBaUIsTUFBTSxXQUFXLGtCQUFrQixJQUFJO0FBQzlELGFBQU8sWUFBWSwrQkFBK0IsaUJBQWtCLFNBQVUsU0FBUyxPQUFPLHFCQUFxQixJQUFJLFdBQVcsQ0FBQyxHQUFHLE9BQU87QUFDN0ksYUFBTyxZQUFZLCtCQUErQixlQUFlLFNBQVUsU0FBUyxPQUFPLHFCQUFxQixJQUFJLFdBQVcsQ0FBQyxHQUFHLE9BQU87QUFBQSxJQUMzSSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw4Q0FBOEMsWUFBWTtBQUM5RCxVQUFNLG1CQUF5QixDQUFDLEdBQUcsWUFBWTtBQUM5QyxZQUFNLFVBQVUsZ0JBQWdCLElBQUksSUFBSSxtQkFBbUIsTUFBTSxDQUFDO0FBQ2xFLFlBQU0sUUFBUSxNQUFNLElBQUk7QUFDeEIsWUFBTSxpQkFBaUIsUUFBUSxxQkFBcUIsSUFBSSx3QkFBd0IsRUFBRSxlQUFlO0FBQ2pHLFlBQU0sZUFBZSxRQUFRLHFCQUFxQixJQUFJLFlBQVk7QUFDbEUsWUFBTSxhQUFhLFVBQVUsZ0JBQWdCLFNBQVMsV0FBVyxLQUFLLFVBQVU7QUFBQSxRQUMvRSxXQUFXO0FBQUEsUUFDWCxTQUFTLENBQUM7QUFBQSxNQUNYLENBQUMsQ0FBQyxDQUFDO0FBRUgsWUFBTSxjQUFjLE9BQU8scUJBQXFCLElBQUksWUFBWTtBQUNoRSxZQUFNLGdCQUFnQixPQUFPLHFCQUFxQixJQUFJLHdCQUF3QixFQUFFLGVBQWU7QUFFL0YsWUFBTSxRQUFRLEtBQUs7QUFDbkIsWUFBTSxXQUFXLEtBQUssTUFBTSxPQUFPLGFBQWEsYUFBYSxLQUFLLENBQUM7QUFFbkUsWUFBTSxVQUFVLEtBQUssVUFBVTtBQUFBLFFBQzlCLFdBQVc7QUFBQSxRQUNYLFNBQVMsQ0FBQztBQUFBLFVBQ1QsUUFBUTtBQUFBLFVBQ1IsVUFBVTtBQUFBLFVBQ1YsU0FBUztBQUFBLFFBQ1YsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUNELG1CQUFhLFVBQVUsZ0JBQWdCLFNBQVMsV0FBVyxPQUFPLENBQUM7QUFFbkUsWUFBTSxRQUFRLEtBQUs7QUFDbkIsWUFBTSxXQUFXLEtBQUssTUFBTSxPQUFPLGFBQWEsYUFBYSxLQUFLLENBQUM7QUFFbkUsYUFBTyxnQkFBZ0IsV0FBVyxRQUFRLFdBQVcsSUFBSTtBQUN6RCxZQUFNLG1CQUFtQixNQUFNLFdBQVcsb0JBQW9CO0FBQzlELFlBQU0saUJBQWlCLE1BQU0sV0FBVyxrQkFBa0IsSUFBSTtBQUM5RCxhQUFPLFlBQVksK0JBQStCLGlCQUFrQixTQUFVLFNBQVMsT0FBTyxxQkFBcUIsSUFBSSxXQUFXLENBQUMsR0FBRyxPQUFPO0FBQzdJLGFBQU8sWUFBWSwrQkFBK0IsZUFBZSxTQUFVLFNBQVMsT0FBTyxxQkFBcUIsSUFBSSxXQUFXLENBQUMsR0FBRyxPQUFPO0FBQzFJLGFBQU8sYUFBYSxNQUFNLFlBQVksU0FBUyxhQUFhLEdBQUcsTUFBTSxTQUFTLEdBQUcsT0FBTztBQUFBLElBQ3pGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDRFQUE0RSxZQUFZO0FBQzVGLFVBQU0sbUJBQXlCLENBQUMsR0FBRyxZQUFZO0FBQzlDLFlBQU0sVUFBVSxnQkFBZ0IsSUFBSSxJQUFJLG1CQUFtQixNQUFNLENBQUM7QUFDbEUsWUFBTSxRQUFRLE1BQU0sSUFBSTtBQUN4QixZQUFNLGlCQUFpQixRQUFRLHFCQUFxQixJQUFJLHdCQUF3QixFQUFFLGVBQWU7QUFDakcsWUFBTSxlQUFlLFFBQVEscUJBQXFCLElBQUksWUFBWTtBQUNsRSxZQUFNLGFBQWEsVUFBVSxnQkFBZ0IsU0FBUyxXQUFXLEtBQUssVUFBVTtBQUFBLFFBQy9FLFdBQVc7QUFBQSxRQUNYLFNBQVMsQ0FBQztBQUFBLE1BQ1gsQ0FBQyxDQUFDLENBQUM7QUFFSCxZQUFNLGNBQWMsT0FBTyxxQkFBcUIsSUFBSSxZQUFZO0FBQ2hFLFlBQU0sZ0JBQWdCLE9BQU8scUJBQXFCLElBQUksd0JBQXdCLEVBQUUsZUFBZTtBQUUvRixZQUFNLFFBQVEsS0FBSztBQUNuQixZQUFNLFdBQVcsS0FBSyxNQUFNLE9BQU8sYUFBYSxhQUFhLEtBQUssQ0FBQztBQUVuRSxZQUFNLFVBQVUsS0FBSyxVQUFVO0FBQUEsUUFDOUIsV0FBVztBQUFBLFFBQ1gsU0FBUyxDQUFDO0FBQUEsVUFDVCxRQUFRO0FBQUEsVUFDUixVQUFVO0FBQUEsVUFDVixTQUFTO0FBQUEsUUFDVixDQUFDO0FBQUEsTUFDRixDQUFDO0FBQ0QsbUJBQWEsVUFBVSxnQkFBZ0IsU0FBUyxXQUFXLE9BQU8sQ0FBQztBQUNuRSxZQUFNLFFBQVEsS0FBSztBQUVuQixrQkFBWSxVQUFVLGVBQWUsU0FBUyxXQUFXLE9BQU8sQ0FBQztBQUNqRSxZQUFNLFdBQVcsS0FBSyxNQUFNLE9BQU8sYUFBYSxhQUFhLEtBQUssQ0FBQztBQUVuRSxhQUFPLGdCQUFnQixXQUFXLFFBQVEsV0FBVyxJQUFJO0FBQ3pELFlBQU0sbUJBQW1CLE1BQU0sV0FBVyxvQkFBb0I7QUFDOUQsWUFBTSxpQkFBaUIsTUFBTSxXQUFXLGtCQUFrQixJQUFJO0FBQzlELGFBQU8sWUFBWSwrQkFBK0IsaUJBQWtCLFNBQVUsU0FBUyxPQUFPLHFCQUFxQixJQUFJLFdBQVcsQ0FBQyxHQUFHLE9BQU87QUFDN0ksYUFBTyxZQUFZLCtCQUErQixlQUFlLFNBQVUsU0FBUyxPQUFPLHFCQUFxQixJQUFJLFdBQVcsQ0FBQyxHQUFHLE9BQU87QUFDMUksYUFBTyxhQUFhLE1BQU0sWUFBWSxTQUFTLGFBQWEsR0FBRyxNQUFNLFNBQVMsR0FBRyxPQUFPO0FBQUEsSUFDekYsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMkVBQTJFLFlBQVk7QUFDM0YsVUFBTSxtQkFBeUIsQ0FBQyxHQUFHLFlBQVk7QUFDOUMsWUFBTSxVQUFVLGdCQUFnQixJQUFJLElBQUksbUJBQW1CLE1BQU0sQ0FBQztBQUNsRSxZQUFNLFFBQVEsTUFBTSxJQUFJO0FBQ3hCLFlBQU0saUJBQWlCLFFBQVEscUJBQXFCLElBQUksd0JBQXdCLEVBQUUsZUFBZTtBQUNqRyxZQUFNLGVBQWUsUUFBUSxxQkFBcUIsSUFBSSxZQUFZO0FBQ2xFLFlBQU0sYUFBYSxVQUFVLGdCQUFnQixTQUFTLFdBQVcsS0FBSyxVQUFVO0FBQUEsUUFDL0UsV0FBVztBQUFBLFFBQ1gsU0FBUyxDQUFDO0FBQUEsTUFDWCxDQUFDLENBQUMsQ0FBQztBQUVILFlBQU0sY0FBYyxPQUFPLHFCQUFxQixJQUFJLFlBQVk7QUFDaEUsWUFBTSxnQkFBZ0IsT0FBTyxxQkFBcUIsSUFBSSx3QkFBd0IsRUFBRSxlQUFlO0FBRS9GLFlBQU0sUUFBUSxLQUFLO0FBQ25CLFlBQU0sV0FBVyxLQUFLLE1BQU0sT0FBTyxhQUFhLGFBQWEsS0FBSyxDQUFDO0FBRW5FLG1CQUFhLFVBQVUsZ0JBQWdCLFNBQVMsV0FBVyxLQUFLLFVBQVU7QUFBQSxRQUN6RSxXQUFXO0FBQUEsUUFDWCxTQUFTLENBQUM7QUFBQSxVQUNULFFBQVE7QUFBQSxVQUNSLFVBQVU7QUFBQSxRQUNYLENBQUM7QUFBQSxNQUNGLENBQUMsQ0FBQyxDQUFDO0FBQ0gsWUFBTSxRQUFRLEtBQUs7QUFFbkIsWUFBTSxVQUFVLEtBQUssVUFBVTtBQUFBLFFBQzlCLFdBQVc7QUFBQSxRQUNYLFNBQVMsQ0FBQztBQUFBLFVBQ1QsUUFBUTtBQUFBLFVBQ1IsVUFBVTtBQUFBLFVBQ1YsU0FBUztBQUFBLFFBQ1YsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUNELGtCQUFZLFVBQVUsZUFBZSxTQUFTLFdBQVcsT0FBTyxDQUFDO0FBQ2pFLFlBQU0sV0FBVyxLQUFLLE1BQU0sT0FBTyxhQUFhLGFBQWEsS0FBSyxDQUFDO0FBRW5FLFlBQU0sa0JBQWtCLE1BQU0sWUFBWSxTQUFTLFdBQVcsVUFBVSxVQUFVLENBQUMsRUFBRSxlQUFlLEdBQUcsTUFBTSxTQUFTO0FBQ3RILGFBQU8sZ0JBQWdCLFdBQVcsUUFBUSxXQUFXLFlBQVk7QUFDakUsYUFBTyxnQkFBZ0IsV0FBVyxVQUFVLFVBQVUsUUFBUSxDQUFDO0FBQy9ELGFBQU8sZ0JBQWdCLFdBQVcsVUFBVSxVQUFVLENBQUMsRUFBRSxZQUFZLFdBQVcsUUFBUTtBQUN4RixhQUFPLGdCQUFnQixXQUFXLFVBQVUsVUFBVSxDQUFDLEVBQUUsYUFBYSxPQUFPLFFBQVE7QUFDckYsYUFBTyxnQkFBZ0IsV0FBVyxVQUFVLFVBQVUsQ0FBQyxFQUFFLGNBQWMsT0FBTyxRQUFRO0FBRXRGLFlBQU0sV0FBVyxPQUFPLFdBQVcsVUFBVSxVQUFVLENBQUMsRUFBRSxlQUFlO0FBQ3pFLFlBQU0sV0FBVyxNQUFNLEtBQUs7QUFDNUIsYUFBTyxnQkFBZ0IsV0FBVyxRQUFRLFdBQVcsSUFBSTtBQUN6RCxZQUFNLG1CQUFtQixNQUFNLFdBQVcsb0JBQW9CO0FBQzlELFlBQU0saUJBQWlCLE1BQU0sV0FBVyxrQkFBa0IsSUFBSTtBQUM5RCxhQUFPLFlBQVksK0JBQStCLGlCQUFrQixTQUFVLFNBQVMsT0FBTyxxQkFBcUIsSUFBSSxXQUFXLENBQUMsR0FBRyxjQUFjO0FBQ3BKLGFBQU8sWUFBWSwrQkFBK0IsZUFBZSxTQUFVLFNBQVMsT0FBTyxxQkFBcUIsSUFBSSxXQUFXLENBQUMsR0FBRyxjQUFjO0FBQ2pKLGFBQU8sYUFBYSxNQUFNLFlBQVksU0FBUyxhQUFhLEdBQUcsTUFBTSxTQUFTLEdBQUcsY0FBYztBQUFBLElBQ2hHLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG9GQUFvRixZQUFZO0FBQ3BHLFVBQU0sbUJBQXlCLENBQUMsR0FBRyxZQUFZO0FBQzlDLFlBQU0sVUFBVSxnQkFBZ0IsSUFBSSxJQUFJLG1CQUFtQixNQUFNLENBQUM7QUFDbEUsWUFBTSxRQUFRLE1BQU0sSUFBSTtBQUN4QixZQUFNLGlCQUFpQixRQUFRLHFCQUFxQixJQUFJLHdCQUF3QixFQUFFLGVBQWU7QUFDakcsWUFBTSxlQUFlLFFBQVEscUJBQXFCLElBQUksWUFBWTtBQUNsRSxZQUFNLGFBQWEsVUFBVSxnQkFBZ0IsU0FBUyxXQUFXLEtBQUssVUFBVTtBQUFBLFFBQy9FLFdBQVc7QUFBQSxRQUNYLFNBQVMsQ0FBQztBQUFBLE1BQ1gsQ0FBQyxDQUFDLENBQUM7QUFFSCxZQUFNLGNBQWMsT0FBTyxxQkFBcUIsSUFBSSxZQUFZO0FBQ2hFLFlBQU0sZ0JBQWdCLE9BQU8scUJBQXFCLElBQUksd0JBQXdCLEVBQUUsZUFBZTtBQUUvRixZQUFNLFFBQVEsS0FBSztBQUNuQixZQUFNLFdBQVcsS0FBSyxNQUFNLE9BQU8sYUFBYSxhQUFhLEtBQUssQ0FBQztBQUVuRSxtQkFBYSxVQUFVLGdCQUFnQixTQUFTLFdBQVcsS0FBSyxVQUFVO0FBQUEsUUFDekUsV0FBVztBQUFBLFFBQ1gsU0FBUyxDQUFDO0FBQUEsVUFDVCxRQUFRO0FBQUEsVUFDUixVQUFVO0FBQUEsUUFDWCxDQUFDO0FBQUEsTUFDRixDQUFDLENBQUMsQ0FBQztBQUNILFlBQU0sUUFBUSxLQUFLO0FBRW5CLGtCQUFZLFVBQVUsZUFBZSxTQUFTLFdBQVcsS0FBSyxVQUFVO0FBQUEsUUFDdkUsV0FBVztBQUFBLFFBQ1gsU0FBUyxDQUFDO0FBQUEsVUFDVCxRQUFRO0FBQUEsVUFDUixVQUFVO0FBQUEsVUFDVixTQUFTO0FBQUEsUUFDVixDQUFDO0FBQUEsTUFDRixDQUFDLENBQUMsQ0FBQztBQUNILFlBQU0sV0FBVyxLQUFLLE1BQU0sT0FBTyxhQUFhLGFBQWEsS0FBSyxDQUFDO0FBRW5FLFlBQU0sVUFBVSxLQUFLLFVBQVU7QUFBQSxRQUM5QixXQUFXO0FBQUEsUUFDWCxTQUFTLENBQUM7QUFBQSxVQUNULFFBQVE7QUFBQSxVQUNSLFVBQVU7QUFBQSxVQUNWLFNBQVM7QUFBQSxRQUNWLENBQUM7QUFBQSxNQUNGLENBQUM7QUFDRCxZQUFNLFdBQVcsT0FBTyxXQUFXLFVBQVUsVUFBVSxDQUFDLEVBQUUsaUJBQWlCLE9BQU87QUFDbEYsWUFBTSxXQUFXLE1BQU0sS0FBSztBQUM1QixhQUFPLGdCQUFnQixXQUFXLFFBQVEsV0FBVyxJQUFJO0FBQ3pELFlBQU0sbUJBQW1CLE1BQU0sV0FBVyxvQkFBb0I7QUFDOUQsWUFBTSxpQkFBaUIsTUFBTSxXQUFXLGtCQUFrQixJQUFJO0FBQzlELGFBQU8sWUFBWSwrQkFBK0IsaUJBQWtCLFNBQVUsU0FBUyxPQUFPLHFCQUFxQixJQUFJLFdBQVcsQ0FBQyxHQUFHLE9BQU87QUFDN0ksYUFBTyxZQUFZLCtCQUErQixlQUFlLFNBQVUsU0FBUyxPQUFPLHFCQUFxQixJQUFJLFdBQVcsQ0FBQyxHQUFHLE9BQU87QUFDMUksYUFBTyxhQUFhLE1BQU0sWUFBWSxTQUFTLGFBQWEsR0FBRyxNQUFNLFNBQVMsR0FBRyxPQUFPO0FBQUEsSUFDekYsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMEVBQTBFLFlBQVk7QUFDMUYsVUFBTSxtQkFBeUIsQ0FBQyxHQUFHLFlBQVk7QUFDOUMsWUFBTSxVQUFVLGdCQUFnQixJQUFJLElBQUksbUJBQW1CLE1BQU0sQ0FBQztBQUNsRSxZQUFNLFFBQVEsTUFBTSxJQUFJO0FBQ3hCLFlBQU0saUJBQWlCLFFBQVEscUJBQXFCLElBQUksd0JBQXdCLEVBQUUsZUFBZTtBQUNqRyxZQUFNLGVBQWUsUUFBUSxxQkFBcUIsSUFBSSxZQUFZO0FBQ2xFLFlBQU0sYUFBYSxVQUFVLGdCQUFnQixTQUFTLFdBQVcsS0FBSyxVQUFVO0FBQUEsUUFDL0UsV0FBVztBQUFBLFFBQ1gsU0FBUyxDQUFDO0FBQUEsTUFDWCxDQUFDLENBQUMsQ0FBQztBQUVILFlBQU0sY0FBYyxPQUFPLHFCQUFxQixJQUFJLFlBQVk7QUFDaEUsWUFBTSxnQkFBZ0IsT0FBTyxxQkFBcUIsSUFBSSx3QkFBd0IsRUFBRSxlQUFlO0FBRS9GLFlBQU0sUUFBUSxLQUFLO0FBQ25CLFlBQU0sV0FBVyxLQUFLLE1BQU0sT0FBTyxhQUFhLGFBQWEsS0FBSyxDQUFDO0FBRW5FLFlBQU0sVUFBVSxLQUFLLFVBQVU7QUFBQSxRQUM5QixXQUFXO0FBQUEsUUFDWCxTQUFTLENBQUM7QUFBQSxVQUNULFFBQVE7QUFBQSxVQUNSLFVBQVU7QUFBQSxRQUNYLENBQUM7QUFBQSxNQUNGLENBQUM7QUFDRCxtQkFBYSxVQUFVLGdCQUFnQixTQUFTLFdBQVcsT0FBTyxDQUFDO0FBQ25FLFlBQU0sUUFBUSxLQUFLO0FBRW5CLGtCQUFZLFVBQVUsZUFBZSxTQUFTLFdBQVcsS0FBSyxVQUFVO0FBQUEsUUFDdkUsV0FBVztBQUFBLFFBQ1gsU0FBUyxDQUFDO0FBQUEsVUFDVCxRQUFRO0FBQUEsVUFDUixVQUFVO0FBQUEsVUFDVixTQUFTO0FBQUEsUUFDVixDQUFDO0FBQUEsTUFDRixDQUFDLENBQUMsQ0FBQztBQUNILFlBQU0sV0FBVyxLQUFLLE1BQU0sT0FBTyxhQUFhLGFBQWEsS0FBSyxDQUFDO0FBQ25FLGFBQU8sZ0JBQWdCLFdBQVcsUUFBUSxXQUFXLFlBQVk7QUFFakUsWUFBTSxXQUFXLE9BQU8sV0FBVyxVQUFVLFVBQVUsQ0FBQyxFQUFFLGNBQWM7QUFDeEUsWUFBTSxXQUFXLE1BQU0sS0FBSztBQUM1QixhQUFPLGdCQUFnQixXQUFXLFFBQVEsV0FBVyxJQUFJO0FBQ3pELFlBQU0sbUJBQW1CLE1BQU0sV0FBVyxvQkFBb0I7QUFDOUQsWUFBTSxpQkFBaUIsTUFBTSxXQUFXLGtCQUFrQixJQUFJO0FBQzlELGFBQU8sWUFBWSwrQkFBK0IsaUJBQWtCLFNBQVUsU0FBUyxPQUFPLHFCQUFxQixJQUFJLFdBQVcsQ0FBQyxHQUFHLE9BQU87QUFDN0ksYUFBTyxZQUFZLCtCQUErQixlQUFlLFNBQVUsU0FBUyxPQUFPLHFCQUFxQixJQUFJLFdBQVcsQ0FBQyxHQUFHLE9BQU87QUFDMUksYUFBTyxhQUFhLE1BQU0sWUFBWSxTQUFTLGFBQWEsR0FBRyxNQUFNLFNBQVMsR0FBRyxPQUFPO0FBQUEsSUFDekYsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsseUVBQXlFLFlBQVk7QUFDekYsVUFBTSxtQkFBeUIsQ0FBQyxHQUFHLFlBQVk7QUFDOUMsWUFBTSxVQUFVLGdCQUFnQixJQUFJLElBQUksbUJBQW1CLE1BQU0sQ0FBQztBQUNsRSxZQUFNLFFBQVEsTUFBTSxJQUFJO0FBQ3hCLFlBQU0saUJBQWlCLFFBQVEscUJBQXFCLElBQUksd0JBQXdCLEVBQUUsZUFBZTtBQUNqRyxZQUFNLGVBQWUsUUFBUSxxQkFBcUIsSUFBSSxZQUFZO0FBQ2xFLFlBQU0sYUFBYSxVQUFVLGdCQUFnQixTQUFTLFdBQVcsS0FBSyxVQUFVO0FBQUEsUUFDL0UsV0FBVztBQUFBLFFBQ1gsU0FBUyxDQUFDO0FBQUEsTUFDWCxDQUFDLENBQUMsQ0FBQztBQUVILFlBQU0sY0FBYyxPQUFPLHFCQUFxQixJQUFJLFlBQVk7QUFDaEUsWUFBTSxnQkFBZ0IsT0FBTyxxQkFBcUIsSUFBSSx3QkFBd0IsRUFBRSxlQUFlO0FBRS9GLFlBQU0sUUFBUSxLQUFLO0FBQ25CLFlBQU0sV0FBVyxLQUFLLE1BQU0sT0FBTyxhQUFhLGFBQWEsS0FBSyxDQUFDO0FBRW5FLG1CQUFhLFVBQVUsZ0JBQWdCLFNBQVMsV0FBVyxLQUFLLFVBQVU7QUFBQSxRQUN6RSxXQUFXO0FBQUEsUUFDWCxTQUFTLENBQUM7QUFBQSxVQUNULFFBQVE7QUFBQSxVQUNSLFVBQVU7QUFBQSxRQUNYLENBQUM7QUFBQSxNQUNGLENBQUMsQ0FBQyxDQUFDO0FBQ0gsWUFBTSxRQUFRLEtBQUs7QUFFbkIsWUFBTSxVQUFVLEtBQUssVUFBVTtBQUFBLFFBQzlCLFdBQVc7QUFBQSxRQUNYLFNBQVMsQ0FBQztBQUFBLFVBQ1QsUUFBUTtBQUFBLFVBQ1IsVUFBVTtBQUFBLFVBQ1YsU0FBUztBQUFBLFFBQ1YsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUNELGtCQUFZLFVBQVUsZUFBZSxTQUFTLFdBQVcsT0FBTyxDQUFDO0FBQ2pFLFlBQU0sV0FBVyxLQUFLLE1BQU0sT0FBTyxhQUFhLGFBQWEsS0FBSyxDQUFDO0FBQ25FLGFBQU8sZ0JBQWdCLFdBQVcsUUFBUSxXQUFXLFlBQVk7QUFFakUsWUFBTSxXQUFXLE9BQU8sV0FBVyxVQUFVLFVBQVUsQ0FBQyxFQUFFLGFBQWE7QUFDdkUsWUFBTSxXQUFXLE1BQU0sS0FBSztBQUM1QixhQUFPLGdCQUFnQixXQUFXLFFBQVEsV0FBVyxJQUFJO0FBQ3pELFlBQU0sbUJBQW1CLE1BQU0sV0FBVyxvQkFBb0I7QUFDOUQsWUFBTSxpQkFBaUIsTUFBTSxXQUFXLGtCQUFrQixJQUFJO0FBQzlELGFBQU8sWUFBWSwrQkFBK0IsaUJBQWtCLFNBQVUsU0FBUyxPQUFPLHFCQUFxQixJQUFJLFdBQVcsQ0FBQyxHQUFHLE9BQU87QUFDN0ksYUFBTyxZQUFZLCtCQUErQixlQUFlLFNBQVUsU0FBUyxPQUFPLHFCQUFxQixJQUFJLFdBQVcsQ0FBQyxHQUFHLE9BQU87QUFDMUksYUFBTyxhQUFhLE1BQU0sWUFBWSxTQUFTLGFBQWEsR0FBRyxNQUFNLFNBQVMsR0FBRyxPQUFPO0FBQUEsSUFDekYsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssNkNBQTZDLFlBQVk7QUFDN0QsVUFBTSxtQkFBeUIsQ0FBQyxHQUFHLFlBQVk7QUFDOUMsWUFBTSxjQUFjLE9BQU8scUJBQXFCLElBQUksWUFBWTtBQUNoRSxZQUFNLGdCQUFnQixPQUFPLHFCQUFxQixJQUFJLHdCQUF3QixFQUFFLGVBQWU7QUFDL0YsWUFBTSxZQUFZLFVBQVUsZUFBZSxTQUFTLFdBQVcsS0FBSyxVQUFVO0FBQUEsUUFDN0UsV0FBVztBQUFBLFFBQ1gsU0FBUyxDQUFDO0FBQUEsTUFDWCxDQUFDLENBQUMsQ0FBQztBQUNILFlBQU0sV0FBVyxLQUFLLE1BQU0sT0FBTyxhQUFhLGFBQWEsS0FBSyxDQUFDO0FBRW5FLFlBQU0sVUFBVSxnQkFBZ0IsSUFBSSxJQUFJLG1CQUFtQixNQUFNLENBQUM7QUFDbEUsWUFBTSxRQUFRLE1BQU0sSUFBSTtBQUN4QixZQUFNLFFBQVEsS0FBSztBQUVuQixZQUFNLGlCQUFpQixRQUFRLHFCQUFxQixJQUFJLHdCQUF3QixFQUFFLGVBQWU7QUFDakcsWUFBTSxlQUFlLFFBQVEscUJBQXFCLElBQUksWUFBWTtBQUNsRSxtQkFBYSxJQUFJLGNBQWM7QUFDL0IsWUFBTSxRQUFRLEtBQUs7QUFFbkIsWUFBTSxXQUFXLEtBQUssTUFBTSxPQUFPLGFBQWEsYUFBYSxLQUFLLENBQUM7QUFFbkUsYUFBTyxnQkFBZ0IsV0FBVyxRQUFRLFdBQVcsSUFBSTtBQUN6RCxZQUFNLG1CQUFtQixNQUFNLFdBQVcsb0JBQW9CO0FBQzlELFlBQU0saUJBQWlCLE1BQU0sV0FBVyxrQkFBa0IsSUFBSTtBQUM5RCxhQUFPLFlBQVksK0JBQStCLGlCQUFrQixTQUFVLFNBQVMsT0FBTyxxQkFBcUIsSUFBSSxXQUFXLENBQUMsR0FBRyxJQUFJO0FBQzFJLGFBQU8sWUFBWSwrQkFBK0IsZUFBZSxTQUFVLFNBQVMsT0FBTyxxQkFBcUIsSUFBSSxXQUFXLENBQUMsR0FBRyxJQUFJO0FBQ3ZJLGFBQU8sWUFBWSxNQUFNLFlBQVksT0FBTyxhQUFhLEdBQUcsS0FBSztBQUFBLElBQ2xFLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLCtDQUErQyxZQUFZO0FBQy9ELFVBQU0sbUJBQXlCLENBQUMsR0FBRyxZQUFZO0FBQzlDLFlBQU0sY0FBYyxPQUFPLHFCQUFxQixJQUFJLFlBQVk7QUFDaEUsWUFBTSxnQkFBZ0IsT0FBTyxxQkFBcUIsSUFBSSx3QkFBd0IsRUFBRSxlQUFlO0FBQy9GLFlBQU0sV0FBVyxLQUFLLE1BQU0sT0FBTyxhQUFhLGFBQWEsS0FBSyxDQUFDO0FBRW5FLFlBQU0sVUFBVSxLQUFLLFVBQVU7QUFBQSxRQUM5QixXQUFXO0FBQUEsUUFDWCxTQUFTLENBQUM7QUFBQSxVQUNULFFBQVE7QUFBQSxVQUNSLFVBQVU7QUFBQSxVQUNWLFNBQVM7QUFBQSxRQUNWLENBQUM7QUFBQSxNQUNGLENBQUM7QUFDRCxZQUFNLFlBQVksV0FBVyxlQUFlLFNBQVMsV0FBVyxPQUFPLENBQUM7QUFFeEUsVUFBSSxtQkFBbUIsTUFBTSxXQUFXLG9CQUFvQjtBQUM1RCxZQUFNLFdBQVcsTUFBTSxPQUFPLGFBQWEsYUFBYSxLQUFLO0FBQzdELGFBQU8sTUFBTTtBQUNiLFlBQU0sV0FBVyxLQUFLLFFBQVE7QUFFOUIsYUFBTyxnQkFBZ0IsT0FBTyxVQUFVO0FBQUEsUUFDdkMsRUFBRSxNQUFNLFFBQVEsS0FBSyxHQUFHLE9BQU8sR0FBRyxnQkFBZ0IsV0FBVyxRQUFRLElBQUksU0FBUyxFQUFFLFlBQVksa0JBQWtCLElBQUksRUFBRTtBQUFBLE1BQ3pILENBQUM7QUFFRCx5QkFBbUIsTUFBTSxXQUFXLG9CQUFvQjtBQUN4RCxZQUFNLGlCQUFpQixNQUFNLFdBQVcsa0JBQWtCLElBQUk7QUFDOUQsYUFBTyxnQkFBZ0IsaUJBQWtCLEtBQUssZUFBZSxHQUFHO0FBQ2hFLGFBQU8sZ0JBQWdCLGlCQUFrQixVQUFVLGVBQWUsUUFBUTtBQUMxRSxhQUFPLFlBQVksK0JBQStCLGlCQUFrQixTQUFVLFNBQVMsT0FBTyxxQkFBcUIsSUFBSSxXQUFXLENBQUMsR0FBRyxPQUFPO0FBQUEsSUFDOUksQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssK0NBQStDLFlBQVk7QUFDL0QsVUFBTSxtQkFBeUIsQ0FBQyxHQUFHLFlBQVk7QUFDOUMsWUFBTSxjQUFjLE9BQU8scUJBQXFCLElBQUksWUFBWTtBQUNoRSxZQUFNLGdCQUFnQixPQUFPLHFCQUFxQixJQUFJLHdCQUF3QixFQUFFLGVBQWU7QUFDL0YsVUFBSSxNQUFNLFlBQVksT0FBTyxhQUFhLEdBQUc7QUFDNUMsY0FBTSxZQUFZLElBQUksYUFBYTtBQUFBLE1BQ3BDO0FBRUEsWUFBTSxVQUFXLE1BQU0sV0FBVyxLQUFLLE1BQU0sT0FBTyxhQUFhLGFBQWEsS0FBSyxHQUFHLElBQUk7QUFFMUYsYUFBTyxNQUFNO0FBQ2IsWUFBTSxVQUFVLE1BQU0sV0FBVyxlQUFlLFFBQVEsaUJBQWlCLENBQUMsRUFBRSxjQUFjO0FBQzFGLFlBQU0sV0FBVyxPQUFPLFFBQVEsaUJBQWlCLENBQUMsRUFBRSxnQkFBZ0IsT0FBTztBQUMzRSxZQUFNLFdBQVcsTUFBTSxLQUFLO0FBQzVCLGFBQU8sZ0JBQWdCLE9BQU8sVUFBVSxDQUFDLENBQUM7QUFBQSxJQUMzQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxzQkFBc0IsWUFBWTtBQUN0QyxVQUFNLG1CQUF5QixDQUFDLEdBQUcsWUFBWTtBQUM5QyxZQUFNLFVBQVUsZ0JBQWdCLElBQUksSUFBSSxtQkFBbUIsTUFBTSxDQUFDO0FBQ2xFLFlBQU0sUUFBUSxNQUFNLElBQUk7QUFDeEIsWUFBTSxVQUFVLE1BQU0sUUFBUSxxQkFBcUIsSUFBSSx3QkFBd0IsRUFBRSxtQkFBbUIsVUFBVTtBQUM5RyxZQUFNLFdBQVcsS0FBSyxVQUFVO0FBQUEsUUFDL0IsV0FBVztBQUFBLFFBQ1gsU0FBUyxDQUFDO0FBQUEsVUFDVCxRQUFRO0FBQUEsVUFDUixVQUFVO0FBQUEsVUFDVixTQUFTO0FBQUEsUUFDVixDQUFDO0FBQUEsTUFDRixDQUFDO0FBQ0QsWUFBTSxRQUFRLHFCQUFxQixJQUFJLFlBQVksRUFBRSxXQUFXLFFBQVEsZUFBZSxTQUFTLFdBQVcsUUFBUSxDQUFDO0FBQ3BILFlBQU0sUUFBUSxLQUFLO0FBRW5CLFlBQU0sT0FBTyxLQUFLO0FBRWxCLFlBQU0sZ0JBQWdCLE9BQU8scUJBQXFCLElBQUksd0JBQXdCLEVBQUUsU0FBUyxLQUFLLE9BQUssRUFBRSxPQUFPLFFBQVEsRUFBRTtBQUN0SCxZQUFNLFVBQVUsTUFBTSxPQUFPLHFCQUFxQixJQUFJLFlBQVksRUFBRSxTQUFTLGNBQWMsYUFBYSxHQUFHLE1BQU0sU0FBUztBQUMxSCxhQUFPLFlBQVksUUFBUSxRQUFRO0FBQUEsSUFDcEMsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
