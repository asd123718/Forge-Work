import assert from "assert";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { IFileService } from "../../../files/common/files.js";
import { ILogService } from "../../../log/common/log.js";
import { IUserDataProfilesService } from "../../../userDataProfile/common/userDataProfile.js";
import { getMcpContentFromSyncContent } from "../../common/mcpSync.js";
import { Change, IUserDataSyncStoreService, MergeState, SyncResource, SyncStatus } from "../../common/userDataSync.js";
import { UserDataSyncClient, UserDataSyncTestServer } from "./userDataSyncClient.js";
suite("McpSync", () => {
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
    testObject = client.getSynchronizer(SyncResource.Mcp);
  });
  test("when mcp file does not exist", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      assert.deepStrictEqual(await testObject.getLastSyncUserData(), null);
      let manifest = await client.getLatestRef(SyncResource.Mcp);
      server.reset();
      await testObject.sync(manifest);
      assert.deepStrictEqual(server.requests, []);
      assert.ok(!await fileService.exists(mcpResource));
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
      assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
      assert.strictEqual(lastSyncUserData.syncData, null);
      manifest = await client.getLatestRef(SyncResource.Mcp);
      server.reset();
      await testObject.sync(manifest);
      assert.deepStrictEqual(server.requests, []);
      manifest = await client.getLatestRef(SyncResource.Mcp);
      server.reset();
      await testObject.sync(manifest);
      assert.deepStrictEqual(server.requests, []);
    });
  });
  test("when mcp file does not exist and remote has changes", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const content = JSON.stringify({
        "mcpServers": {
          "test-server": {
            "command": "node",
            "args": ["./server.js"]
          }
        }
      });
      const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      await client2.instantiationService.get(IFileService).writeFile(mcpResource2, VSBuffer.fromString(content));
      await client2.sync();
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
    });
  });
  test("when mcp file exists locally and remote has no mcp", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      const content = JSON.stringify({
        "mcpServers": {
          "test-server": {
            "command": "node",
            "args": ["./server.js"]
          }
        }
      });
      fileService.writeFile(mcpResource, VSBuffer.fromString(content));
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
    });
  });
  test("first time sync: when mcp file exists locally with same content as remote", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const content = JSON.stringify({
        "mcpServers": {
          "test-server": {
            "command": "node",
            "args": ["./server.js"]
          }
        }
      });
      const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      await client2.instantiationService.get(IFileService).writeFile(mcpResource2, VSBuffer.fromString(content));
      await client2.sync();
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      await fileService.writeFile(mcpResource, VSBuffer.fromString(content));
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
    });
  });
  test("when mcp file locally has moved forward", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      fileService.writeFile(mcpResource, VSBuffer.fromString(JSON.stringify({
        "mcpServers": {}
      })));
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      const content = JSON.stringify({
        "mcpServers": {
          "test-server": {
            "command": "node",
            "args": ["./server.js"]
          }
        }
      });
      fileService.writeFile(mcpResource, VSBuffer.fromString(content));
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
    });
  });
  test("when mcp file remotely has moved forward", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      await fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
        "mcpServers": {}
      })));
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      const content = JSON.stringify({
        "mcpServers": {
          "test-server": {
            "command": "node",
            "args": ["./server.js"]
          }
        }
      });
      fileService2.writeFile(mcpResource2, VSBuffer.fromString(content));
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
    });
  });
  test("when mcp file has moved forward locally and remotely with same changes", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      await fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
        "mcpServers": {}
      })));
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      const content = JSON.stringify({
        "mcpServers": {
          "test-server": {
            "command": "node",
            "args": ["./server.js"]
          }
        }
      });
      fileService2.writeFile(mcpResource2, VSBuffer.fromString(content));
      await client2.sync();
      fileService.writeFile(mcpResource, VSBuffer.fromString(content));
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
    });
  });
  test("when mcp file has moved forward locally and remotely - accept preview", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      await fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
        "mcpServers": {}
      })));
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
        "mcpServers": {
          "server1": {
            "command": "node",
            "args": ["./server1.js"]
          }
        }
      })));
      await client2.sync();
      const content = JSON.stringify({
        "mcpServers": {
          "server2": {
            "command": "node",
            "args": ["./server2.js"]
          }
        }
      });
      fileService.writeFile(mcpResource, VSBuffer.fromString(content));
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
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
      assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), previewContent);
      assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), previewContent);
      assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), previewContent);
    });
  });
  test("when mcp file has moved forward locally and remotely - accept modified preview", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      await fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
        "mcpServers": {}
      })));
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
        "mcpServers": {
          "server1": {
            "command": "node",
            "args": ["./server1.js"]
          }
        }
      })));
      await client2.sync();
      fileService.writeFile(mcpResource, VSBuffer.fromString(JSON.stringify({
        "mcpServers": {
          "server2": {
            "command": "node",
            "args": ["./server2.js"]
          }
        }
      })));
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      const content = JSON.stringify({
        "mcpServers": {
          "server1": {
            "command": "node",
            "args": ["./server1.js"]
          },
          "server2": {
            "command": "node",
            "args": ["./server2.js"]
          }
        }
      });
      await testObject.accept(testObject.conflicts.conflicts[0].previewResource, content);
      await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
    });
  });
  test("when mcp file has moved forward locally and remotely - accept remote", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      await fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
        "mcpServers": {}
      })));
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      const content = JSON.stringify({
        "mcpServers": {
          "server1": {
            "command": "node",
            "args": ["./server1.js"]
          }
        }
      });
      fileService2.writeFile(mcpResource2, VSBuffer.fromString(content));
      await client2.sync();
      fileService.writeFile(mcpResource, VSBuffer.fromString(JSON.stringify({
        "mcpServers": {
          "server2": {
            "command": "node",
            "args": ["./server2.js"]
          }
        }
      })));
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
      await testObject.accept(testObject.conflicts.conflicts[0].remoteResource);
      await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
    });
  });
  test("when mcp file has moved forward locally and remotely - accept local", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      await fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
        "mcpServers": {}
      })));
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
        "mcpServers": {
          "server1": {
            "command": "node",
            "args": ["./server1.js"]
          }
        }
      })));
      await client2.sync();
      const content = JSON.stringify({
        "mcpServers": {
          "server2": {
            "command": "node",
            "args": ["./server2.js"]
          }
        }
      });
      fileService.writeFile(mcpResource, VSBuffer.fromString(content));
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
      await testObject.accept(testObject.conflicts.conflicts[0].localResource);
      await testObject.apply(false);
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
      assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
    });
  });
  test("when mcp file was removed in one client", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      await fileService.writeFile(mcpResource, VSBuffer.fromString(JSON.stringify({
        "mcpServers": {}
      })));
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      await client2.sync();
      const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      const fileService2 = client2.instantiationService.get(IFileService);
      fileService2.del(mcpResource2);
      await client2.sync();
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
      const lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), null);
      assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), null);
      assert.strictEqual(await fileService.exists(mcpResource), false);
    });
  });
  test("when mcp file is created after first sync", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
      const content = JSON.stringify({
        "mcpServers": {
          "test-server": {
            "command": "node",
            "args": ["./server.js"]
          }
        }
      });
      await fileService.createFile(mcpResource, VSBuffer.fromString(content));
      let lastSyncUserData = await testObject.getLastSyncUserData();
      const manifest = await client.getLatestRef(SyncResource.Mcp);
      server.reset();
      await testObject.sync(manifest);
      assert.deepStrictEqual(server.requests, [
        { type: "POST", url: `${server.url}/v1/resource/${testObject.resource}`, headers: { "If-Match": lastSyncUserData?.ref } }
      ]);
      lastSyncUserData = await testObject.getLastSyncUserData();
      const remoteUserData = await testObject.getRemoteUserData(null);
      assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
      assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
      assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
    });
  });
  test("apply remote when mcp file does not exist", async () => {
    await runWithFakedTimers({}, async () => {
      const fileService = client.instantiationService.get(IFileService);
      const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
      if (await fileService.exists(mcpResource)) {
        await fileService.del(mcpResource);
      }
      const preview = await testObject.sync(await client.getLatestRef(SyncResource.Mcp), true);
      server.reset();
      const content = await testObject.resolveContent(preview.resourcePreviews[0].remoteResource);
      await testObject.accept(preview.resourcePreviews[0].remoteResource, content);
      await testObject.apply(false);
      assert.deepStrictEqual(server.requests, []);
    });
  });
  test("sync profile mcp", async () => {
    await runWithFakedTimers({}, async () => {
      const client2 = disposableStore.add(new UserDataSyncClient(server));
      await client2.setUp(true);
      const profile = await client2.instantiationService.get(IUserDataProfilesService).createNamedProfile("profile1");
      const expected = JSON.stringify({
        "mcpServers": {
          "test-server": {
            "command": "node",
            "args": ["./server.js"]
          }
        }
      });
      await client2.instantiationService.get(IFileService).createFile(profile.mcpResource, VSBuffer.fromString(expected));
      await client2.sync();
      await client.sync();
      const syncedProfile = client.instantiationService.get(IUserDataProfilesService).profiles.find((p) => p.id === profile.id);
      const actual = (await client.instantiationService.get(IFileService).readFile(syncedProfile.mcpResource)).value.toString();
      assert.strictEqual(actual, expected);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFx0ZXN0XFxjb21tb25cXG1jcFN5bmMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IGdldE1jcENvbnRlbnRGcm9tU3luY0NvbnRlbnQsIE1jcFN5bmNocm9uaXNlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9tY3BTeW5jLmpzJztcbmltcG9ydCB7IENoYW5nZSwgSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSwgTWVyZ2VTdGF0ZSwgU3luY1Jlc291cmNlLCBTeW5jU3RhdHVzIH0gZnJvbSAnLi4vLi4vY29tbW9uL3VzZXJEYXRhU3luYy5qcyc7XG5pbXBvcnQgeyBVc2VyRGF0YVN5bmNDbGllbnQsIFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIgfSBmcm9tICcuL3VzZXJEYXRhU3luY0NsaWVudC5qcyc7XG5cbnN1aXRlKCdNY3BTeW5jJywgKCkgPT4ge1xuXG5cdGNvbnN0IHNlcnZlciA9IG5ldyBVc2VyRGF0YVN5bmNUZXN0U2VydmVyKCk7XG5cdGxldCBjbGllbnQ6IFVzZXJEYXRhU3luY0NsaWVudDtcblxuXHRsZXQgdGVzdE9iamVjdDogTWNwU3luY2hyb25pc2VyO1xuXG5cdHRlYXJkb3duKGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVTdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRjbGllbnQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQoc2VydmVyKSk7XG5cdFx0YXdhaXQgY2xpZW50LnNldFVwKHRydWUpO1xuXHRcdHRlc3RPYmplY3QgPSBjbGllbnQuZ2V0U3luY2hyb25pemVyKFN5bmNSZXNvdXJjZS5NY3ApIGFzIE1jcFN5bmNocm9uaXNlcjtcblx0fSk7XG5cblx0dGVzdCgnd2hlbiBtY3AgZmlsZSBkb2VzIG5vdCBleGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgbWNwUmVzb3VyY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUubWNwUmVzb3VyY2U7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCksIG51bGwpO1xuXHRcdFx0bGV0IG1hbmlmZXN0ID0gYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuTWNwKTtcblx0XHRcdHNlcnZlci5yZXNldCgpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKG1hbmlmZXN0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2ZXIucmVxdWVzdHMsIFtdKTtcblx0XHRcdGFzc2VydC5vayghYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKG1jcFJlc291cmNlKSk7XG5cblx0XHRcdGNvbnN0IGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRcdGNvbnN0IHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN5bmNVc2VyRGF0YSEucmVmLCByZW1vdGVVc2VyRGF0YS5yZWYpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSwgcmVtb3RlVXNlckRhdGEuc3luY0RhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhLCBudWxsKTtcblxuXHRcdFx0bWFuaWZlc3QgPSBhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5NY3ApO1xuXHRcdFx0c2VydmVyLnJlc2V0KCk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMobWFuaWZlc3QpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2ZXIucmVxdWVzdHMsIFtdKTtcblxuXHRcdFx0bWFuaWZlc3QgPSBhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5NY3ApO1xuXHRcdFx0c2VydmVyLnJlc2V0KCk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMobWFuaWZlc3QpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2ZXIucmVxdWVzdHMsIFtdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnd2hlbiBtY3AgZmlsZSBkb2VzIG5vdCBleGlzdCBhbmQgcmVtb3RlIGhhcyBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xpZW50MiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudChzZXJ2ZXIpKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc2V0VXAodHJ1ZSk7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQnbWNwU2VydmVycyc6IHtcblx0XHRcdFx0XHQndGVzdC1zZXJ2ZXInOiB7XG5cdFx0XHRcdFx0XHQnY29tbWFuZCc6ICdub2RlJyxcblx0XHRcdFx0XHRcdCdhcmdzJzogWycuL3NlcnZlci5qcyddXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IG1jcFJlc291cmNlMiA9IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUubWNwUmVzb3VyY2U7XG5cdFx0XHRhd2FpdCBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpLndyaXRlRmlsZShtY3BSZXNvdXJjZTIsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgbWNwUmVzb3VyY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUubWNwUmVzb3VyY2U7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5NY3ApKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRcdGNvbnN0IGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRcdGNvbnN0IHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRNY3BDb250ZW50RnJvbVN5bmNDb250ZW50KGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldE1jcENvbnRlbnRGcm9tU3luY0NvbnRlbnQocmVtb3RlVXNlckRhdGEuc3luY0RhdGEhLmNvbnRlbnQsIGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxvZ1NlcnZpY2UpKSwgY29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKG1jcFJlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKSwgY29udGVudCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3doZW4gbWNwIGZpbGUgZXhpc3RzIGxvY2FsbHkgYW5kIHJlbW90ZSBoYXMgbm8gbWNwJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCBtY3BSZXNvdXJjZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS5tY3BSZXNvdXJjZTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCdtY3BTZXJ2ZXJzJzoge1xuXHRcdFx0XHRcdCd0ZXN0LXNlcnZlcic6IHtcblx0XHRcdFx0XHRcdCdjb21tYW5kJzogJ25vZGUnLFxuXHRcdFx0XHRcdFx0J2FyZ3MnOiBbJy4vc2VydmVyLmpzJ11cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0ZmlsZVNlcnZpY2Uud3JpdGVGaWxlKG1jcFJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblxuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLk1jcCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdFx0Y29uc3QgbGFzdFN5bmNVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXHRcdFx0Y29uc3QgcmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldFJlbW90ZVVzZXJEYXRhKG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldE1jcENvbnRlbnRGcm9tU3luY0NvbnRlbnQobGFzdFN5bmNVc2VyRGF0YSEuc3luY0RhdGEhLmNvbnRlbnQsIGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxvZ1NlcnZpY2UpKSwgY29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TWNwQ29udGVudEZyb21TeW5jQ29udGVudChyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBjb250ZW50KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZmlyc3QgdGltZSBzeW5jOiB3aGVuIG1jcCBmaWxlIGV4aXN0cyBsb2NhbGx5IHdpdGggc2FtZSBjb250ZW50IGFzIHJlbW90ZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNsaWVudDIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQoc2VydmVyKSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnNldFVwKHRydWUpO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J21jcFNlcnZlcnMnOiB7XG5cdFx0XHRcdFx0J3Rlc3Qtc2VydmVyJzoge1xuXHRcdFx0XHRcdFx0J2NvbW1hbmQnOiAnbm9kZScsXG5cdFx0XHRcdFx0XHQnYXJncyc6IFsnLi9zZXJ2ZXIuanMnXVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBtY3BSZXNvdXJjZTIgPSBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLm1jcFJlc291cmNlO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKS53cml0ZUZpbGUobWNwUmVzb3VyY2UyLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IG1jcFJlc291cmNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLm1jcFJlc291cmNlO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKG1jcFJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblxuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLk1jcCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLklkbGUpO1xuXHRcdFx0Y29uc3QgbGFzdFN5bmNVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXHRcdFx0Y29uc3QgcmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldFJlbW90ZVVzZXJEYXRhKG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldE1jcENvbnRlbnRGcm9tU3luY0NvbnRlbnQobGFzdFN5bmNVc2VyRGF0YSEuc3luY0RhdGEhLmNvbnRlbnQsIGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxvZ1NlcnZpY2UpKSwgY29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TWNwQ29udGVudEZyb21TeW5jQ29udGVudChyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBjb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUobWNwUmVzb3VyY2UpKS52YWx1ZS50b1N0cmluZygpLCBjb250ZW50KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnd2hlbiBtY3AgZmlsZSBsb2NhbGx5IGhhcyBtb3ZlZCBmb3J3YXJkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCBtY3BSZXNvdXJjZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS5tY3BSZXNvdXJjZTtcblx0XHRcdGZpbGVTZXJ2aWNlLndyaXRlRmlsZShtY3BSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCdtY3BTZXJ2ZXJzJzoge31cblx0XHRcdH0pKSk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5NY3ApKTtcblxuXHRcdFx0Y29uc3QgY29udGVudCA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J21jcFNlcnZlcnMnOiB7XG5cdFx0XHRcdFx0J3Rlc3Qtc2VydmVyJzoge1xuXHRcdFx0XHRcdFx0J2NvbW1hbmQnOiAnbm9kZScsXG5cdFx0XHRcdFx0XHQnYXJncyc6IFsnLi9zZXJ2ZXIuanMnXVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRmaWxlU2VydmljZS53cml0ZUZpbGUobWNwUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuTWNwKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TWNwQ29udGVudEZyb21TeW5jQ29udGVudChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBjb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRNY3BDb250ZW50RnJvbVN5bmNDb250ZW50KHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3aGVuIG1jcCBmaWxlIHJlbW90ZWx5IGhhcyBtb3ZlZCBmb3J3YXJkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xpZW50MiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudChzZXJ2ZXIpKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc2V0VXAodHJ1ZSk7XG5cdFx0XHRjb25zdCBtY3BSZXNvdXJjZTIgPSBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLm1jcFJlc291cmNlO1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UyID0gY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlMi53cml0ZUZpbGUobWNwUmVzb3VyY2UyLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J21jcFNlcnZlcnMnOiB7fVxuXHRcdFx0fSkpKTtcblxuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCBtY3BSZXNvdXJjZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS5tY3BSZXNvdXJjZTtcblxuXHRcdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuTWNwKSk7XG5cblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCdtY3BTZXJ2ZXJzJzoge1xuXHRcdFx0XHRcdCd0ZXN0LXNlcnZlcic6IHtcblx0XHRcdFx0XHRcdCdjb21tYW5kJzogJ25vZGUnLFxuXHRcdFx0XHRcdFx0J2FyZ3MnOiBbJy4vc2VydmVyLmpzJ11cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0ZmlsZVNlcnZpY2UyLndyaXRlRmlsZShtY3BSZXNvdXJjZTIsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXG5cdFx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5NY3ApKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRcdGNvbnN0IGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRcdGNvbnN0IHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRNY3BDb250ZW50RnJvbVN5bmNDb250ZW50KGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldE1jcENvbnRlbnRGcm9tU3luY0NvbnRlbnQocmVtb3RlVXNlckRhdGEuc3luY0RhdGEhLmNvbnRlbnQsIGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxvZ1NlcnZpY2UpKSwgY29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKG1jcFJlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKSwgY29udGVudCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3doZW4gbWNwIGZpbGUgaGFzIG1vdmVkIGZvcndhcmQgbG9jYWxseSBhbmQgcmVtb3RlbHkgd2l0aCBzYW1lIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbGllbnQyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHNlcnZlcikpO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5zZXRVcCh0cnVlKTtcblx0XHRcdGNvbnN0IG1jcFJlc291cmNlMiA9IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUubWNwUmVzb3VyY2U7XG5cdFx0XHRjb25zdCBmaWxlU2VydmljZTIgPSBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2UyLndyaXRlRmlsZShtY3BSZXNvdXJjZTIsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQnbWNwU2VydmVycyc6IHt9XG5cdFx0XHR9KSkpO1xuXG5cdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IG1jcFJlc291cmNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLm1jcFJlc291cmNlO1xuXG5cdFx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5NY3ApKTtcblxuXHRcdFx0Y29uc3QgY29udGVudCA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J21jcFNlcnZlcnMnOiB7XG5cdFx0XHRcdFx0J3Rlc3Qtc2VydmVyJzoge1xuXHRcdFx0XHRcdFx0J2NvbW1hbmQnOiAnbm9kZScsXG5cdFx0XHRcdFx0XHQnYXJncyc6IFsnLi9zZXJ2ZXIuanMnXVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRmaWxlU2VydmljZTIud3JpdGVGaWxlKG1jcFJlc291cmNlMiwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdFx0ZmlsZVNlcnZpY2Uud3JpdGVGaWxlKG1jcFJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5NY3ApKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRcdGNvbnN0IGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRcdGNvbnN0IHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRNY3BDb250ZW50RnJvbVN5bmNDb250ZW50KGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldE1jcENvbnRlbnRGcm9tU3luY0NvbnRlbnQocmVtb3RlVXNlckRhdGEuc3luY0RhdGEhLmNvbnRlbnQsIGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxvZ1NlcnZpY2UpKSwgY29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKG1jcFJlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKSwgY29udGVudCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3doZW4gbWNwIGZpbGUgaGFzIG1vdmVkIGZvcndhcmQgbG9jYWxseSBhbmQgcmVtb3RlbHkgLSBhY2NlcHQgcHJldmlldycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNsaWVudDIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQoc2VydmVyKSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnNldFVwKHRydWUpO1xuXHRcdFx0Y29uc3QgbWNwUmVzb3VyY2UyID0gY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS5tY3BSZXNvdXJjZTtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlMiA9IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZTIud3JpdGVGaWxlKG1jcFJlc291cmNlMiwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCdtY3BTZXJ2ZXJzJzoge31cblx0XHRcdH0pKSk7XG5cblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgbWNwUmVzb3VyY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUubWNwUmVzb3VyY2U7XG5cblx0XHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLk1jcCkpO1xuXG5cdFx0XHRmaWxlU2VydmljZTIud3JpdGVGaWxlKG1jcFJlc291cmNlMiwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCdtY3BTZXJ2ZXJzJzoge1xuXHRcdFx0XHRcdCdzZXJ2ZXIxJzoge1xuXHRcdFx0XHRcdFx0J2NvbW1hbmQnOiAnbm9kZScsXG5cdFx0XHRcdFx0XHQnYXJncyc6IFsnLi9zZXJ2ZXIxLmpzJ11cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdFx0Y29uc3QgY29udGVudCA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J21jcFNlcnZlcnMnOiB7XG5cdFx0XHRcdFx0J3NlcnZlcjInOiB7XG5cdFx0XHRcdFx0XHQnY29tbWFuZCc6ICdub2RlJyxcblx0XHRcdFx0XHRcdCdhcmdzJzogWycuL3NlcnZlcjIuanMnXVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRmaWxlU2VydmljZS53cml0ZUZpbGUobWNwUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLk1jcCkpO1xuXG5cdFx0XHRjb25zdCBwcmV2aWV3Q29udGVudCA9IChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZSh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHNbMF0ucHJldmlld1Jlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSGFzQ29uZmxpY3RzKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0c1swXS5tZXJnZVN0YXRlLCBNZXJnZVN0YXRlLkNvbmZsaWN0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25mbGljdHMuY29uZmxpY3RzWzBdLmxvY2FsQ2hhbmdlLCBDaGFuZ2UuTW9kaWZpZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHNbMF0ucmVtb3RlQ2hhbmdlLCBDaGFuZ2UuTW9kaWZpZWQpO1xuXG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHNbMF0ucHJldmlld1Jlc291cmNlKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRcdGNvbnN0IGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRcdGNvbnN0IHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRNY3BDb250ZW50RnJvbVN5bmNDb250ZW50KGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIHByZXZpZXdDb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRNY3BDb250ZW50RnJvbVN5bmNDb250ZW50KHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIHByZXZpZXdDb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUobWNwUmVzb3VyY2UpKS52YWx1ZS50b1N0cmluZygpLCBwcmV2aWV3Q29udGVudCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3doZW4gbWNwIGZpbGUgaGFzIG1vdmVkIGZvcndhcmQgbG9jYWxseSBhbmQgcmVtb3RlbHkgLSBhY2NlcHQgbW9kaWZpZWQgcHJldmlldycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNsaWVudDIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQoc2VydmVyKSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnNldFVwKHRydWUpO1xuXHRcdFx0Y29uc3QgbWNwUmVzb3VyY2UyID0gY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS5tY3BSZXNvdXJjZTtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlMiA9IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZTIud3JpdGVGaWxlKG1jcFJlc291cmNlMiwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCdtY3BTZXJ2ZXJzJzoge31cblx0XHRcdH0pKSk7XG5cblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgbWNwUmVzb3VyY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUubWNwUmVzb3VyY2U7XG5cblx0XHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLk1jcCkpO1xuXG5cdFx0XHRmaWxlU2VydmljZTIud3JpdGVGaWxlKG1jcFJlc291cmNlMiwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCdtY3BTZXJ2ZXJzJzoge1xuXHRcdFx0XHRcdCdzZXJ2ZXIxJzoge1xuXHRcdFx0XHRcdFx0J2NvbW1hbmQnOiAnbm9kZScsXG5cdFx0XHRcdFx0XHQnYXJncyc6IFsnLi9zZXJ2ZXIxLmpzJ11cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdFx0ZmlsZVNlcnZpY2Uud3JpdGVGaWxlKG1jcFJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J21jcFNlcnZlcnMnOiB7XG5cdFx0XHRcdFx0J3NlcnZlcjInOiB7XG5cdFx0XHRcdFx0XHQnY29tbWFuZCc6ICdub2RlJyxcblx0XHRcdFx0XHRcdCdhcmdzJzogWycuL3NlcnZlcjIuanMnXVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3Quc3luYyhhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5NY3ApKTtcblxuXHRcdFx0Y29uc3QgY29udGVudCA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J21jcFNlcnZlcnMnOiB7XG5cdFx0XHRcdFx0J3NlcnZlcjEnOiB7XG5cdFx0XHRcdFx0XHQnY29tbWFuZCc6ICdub2RlJyxcblx0XHRcdFx0XHRcdCdhcmdzJzogWycuL3NlcnZlcjEuanMnXVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0J3NlcnZlcjInOiB7XG5cdFx0XHRcdFx0XHQnY29tbWFuZCc6ICdub2RlJyxcblx0XHRcdFx0XHRcdCdhcmdzJzogWycuL3NlcnZlcjIuanMnXVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFjY2VwdCh0ZXN0T2JqZWN0LmNvbmZsaWN0cy5jb25mbGljdHNbMF0ucHJldmlld1Jlc291cmNlLCBjb250ZW50KTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRcdGNvbnN0IGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRcdGNvbnN0IHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRNY3BDb250ZW50RnJvbVN5bmNDb250ZW50KGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldE1jcENvbnRlbnRGcm9tU3luY0NvbnRlbnQocmVtb3RlVXNlckRhdGEuc3luY0RhdGEhLmNvbnRlbnQsIGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxvZ1NlcnZpY2UpKSwgY29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKG1jcFJlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKSwgY29udGVudCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3doZW4gbWNwIGZpbGUgaGFzIG1vdmVkIGZvcndhcmQgbG9jYWxseSBhbmQgcmVtb3RlbHkgLSBhY2NlcHQgcmVtb3RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xpZW50MiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudChzZXJ2ZXIpKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc2V0VXAodHJ1ZSk7XG5cdFx0XHRjb25zdCBtY3BSZXNvdXJjZTIgPSBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLm1jcFJlc291cmNlO1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UyID0gY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlMi53cml0ZUZpbGUobWNwUmVzb3VyY2UyLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J21jcFNlcnZlcnMnOiB7fVxuXHRcdFx0fSkpKTtcblxuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCBtY3BSZXNvdXJjZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS5tY3BSZXNvdXJjZTtcblxuXHRcdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuTWNwKSk7XG5cblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCdtY3BTZXJ2ZXJzJzoge1xuXHRcdFx0XHRcdCdzZXJ2ZXIxJzoge1xuXHRcdFx0XHRcdFx0J2NvbW1hbmQnOiAnbm9kZScsXG5cdFx0XHRcdFx0XHQnYXJncyc6IFsnLi9zZXJ2ZXIxLmpzJ11cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0ZmlsZVNlcnZpY2UyLndyaXRlRmlsZShtY3BSZXNvdXJjZTIsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cblx0XHRcdGZpbGVTZXJ2aWNlLndyaXRlRmlsZShtY3BSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdCdtY3BTZXJ2ZXJzJzoge1xuXHRcdFx0XHRcdCdzZXJ2ZXIyJzoge1xuXHRcdFx0XHRcdFx0J2NvbW1hbmQnOiAnbm9kZScsXG5cdFx0XHRcdFx0XHQnYXJncyc6IFsnLi9zZXJ2ZXIyLmpzJ11cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKSk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuTWNwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0c1swXS5yZW1vdGVSZXNvdXJjZSk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFwcGx5KGZhbHNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TWNwQ29udGVudEZyb21TeW5jQ29udGVudChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBjb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRNY3BDb250ZW50RnJvbVN5bmNDb250ZW50KHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShtY3BSZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCksIGNvbnRlbnQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3aGVuIG1jcCBmaWxlIGhhcyBtb3ZlZCBmb3J3YXJkIGxvY2FsbHkgYW5kIHJlbW90ZWx5IC0gYWNjZXB0IGxvY2FsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xpZW50MiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudChzZXJ2ZXIpKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc2V0VXAodHJ1ZSk7XG5cdFx0XHRjb25zdCBtY3BSZXNvdXJjZTIgPSBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLm1jcFJlc291cmNlO1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UyID0gY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlMi53cml0ZUZpbGUobWNwUmVzb3VyY2UyLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J21jcFNlcnZlcnMnOiB7fVxuXHRcdFx0fSkpKTtcblxuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCBtY3BSZXNvdXJjZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS5tY3BSZXNvdXJjZTtcblxuXHRcdFx0YXdhaXQgY2xpZW50Mi5zeW5jKCk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuTWNwKSk7XG5cblx0XHRcdGZpbGVTZXJ2aWNlMi53cml0ZUZpbGUobWNwUmVzb3VyY2UyLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0J21jcFNlcnZlcnMnOiB7XG5cdFx0XHRcdFx0J3NlcnZlcjEnOiB7XG5cdFx0XHRcdFx0XHQnY29tbWFuZCc6ICdub2RlJyxcblx0XHRcdFx0XHRcdCdhcmdzJzogWycuL3NlcnZlcjEuanMnXVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0XHRjb25zdCBjb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQnbWNwU2VydmVycyc6IHtcblx0XHRcdFx0XHQnc2VydmVyMic6IHtcblx0XHRcdFx0XHRcdCdjb21tYW5kJzogJ25vZGUnLFxuXHRcdFx0XHRcdFx0J2FyZ3MnOiBbJy4vc2VydmVyMi5qcyddXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGZpbGVTZXJ2aWNlLndyaXRlRmlsZShtY3BSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuTWNwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3Quc3RhdHVzLCBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cyk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHRlc3RPYmplY3QuY29uZmxpY3RzLmNvbmZsaWN0c1swXS5sb2NhbFJlc291cmNlKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3QuYXBwbHkoZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnN0YXR1cywgU3luY1N0YXR1cy5JZGxlKTtcblx0XHRcdGNvbnN0IGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRcdGNvbnN0IHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRNY3BDb250ZW50RnJvbVN5bmNDb250ZW50KGxhc3RTeW5jVXNlckRhdGEhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldE1jcENvbnRlbnRGcm9tU3luY0NvbnRlbnQocmVtb3RlVXNlckRhdGEuc3luY0RhdGEhLmNvbnRlbnQsIGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxvZ1NlcnZpY2UpKSwgY29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKG1jcFJlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKSwgY29udGVudCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3doZW4gbWNwIGZpbGUgd2FzIHJlbW92ZWQgaW4gb25lIGNsaWVudCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgbWNwUmVzb3VyY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkuZGVmYXVsdFByb2ZpbGUubWNwUmVzb3VyY2U7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUobWNwUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQnbWNwU2VydmVycyc6IHt9XG5cdFx0XHR9KSkpO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLk1jcCkpO1xuXG5cdFx0XHRjb25zdCBjbGllbnQyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHNlcnZlcikpO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5zZXRVcCh0cnVlKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0XHRjb25zdCBtY3BSZXNvdXJjZTIgPSBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLm1jcFJlc291cmNlO1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UyID0gY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGZpbGVTZXJ2aWNlMi5kZWwobWNwUmVzb3VyY2UyKTtcblx0XHRcdGF3YWl0IGNsaWVudDIuc3luYygpO1xuXG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMoYXdhaXQgY2xpZW50LmdldExhdGVzdFJlZihTeW5jUmVzb3VyY2UuTWNwKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5zdGF0dXMsIFN5bmNTdGF0dXMuSWRsZSk7XG5cdFx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0XHRjb25zdCByZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0UmVtb3RlVXNlckRhdGEobnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TWNwQ29udGVudEZyb21TeW5jQ29udGVudChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSEuY29udGVudCwgY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRNY3BDb250ZW50RnJvbVN5bmNDb250ZW50KHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhIS5jb250ZW50LCBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dTZXJ2aWNlKSksIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhtY3BSZXNvdXJjZSksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnd2hlbiBtY3AgZmlsZSBpcyBjcmVhdGVkIGFmdGVyIGZpcnN0IHN5bmMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IG1jcFJlc291cmNlID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLm1jcFJlc291cmNlO1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLk1jcCkpO1xuXG5cdFx0XHRjb25zdCBjb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQnbWNwU2VydmVycyc6IHtcblx0XHRcdFx0XHQndGVzdC1zZXJ2ZXInOiB7XG5cdFx0XHRcdFx0XHQnY29tbWFuZCc6ICdub2RlJyxcblx0XHRcdFx0XHRcdCdhcmdzJzogWycuL3NlcnZlci5qcyddXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNyZWF0ZUZpbGUobWNwUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXG5cdFx0XHRsZXQgbGFzdFN5bmNVc2VyRGF0YSA9IGF3YWl0IHRlc3RPYmplY3QuZ2V0TGFzdFN5bmNVc2VyRGF0YSgpO1xuXHRcdFx0Y29uc3QgbWFuaWZlc3QgPSBhd2FpdCBjbGllbnQuZ2V0TGF0ZXN0UmVmKFN5bmNSZXNvdXJjZS5NY3ApO1xuXHRcdFx0c2VydmVyLnJlc2V0KCk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnN5bmMobWFuaWZlc3QpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZlci5yZXF1ZXN0cywgW1xuXHRcdFx0XHR7IHR5cGU6ICdQT1NUJywgdXJsOiBgJHtzZXJ2ZXIudXJsfS92MS9yZXNvdXJjZS8ke3Rlc3RPYmplY3QucmVzb3VyY2V9YCwgaGVhZGVyczogeyAnSWYtTWF0Y2gnOiBsYXN0U3luY1VzZXJEYXRhPy5yZWYgfSB9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGxhc3RTeW5jVXNlckRhdGEgPSBhd2FpdCB0ZXN0T2JqZWN0LmdldExhc3RTeW5jVXNlckRhdGEoKTtcblx0XHRcdGNvbnN0IHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGVzdE9iamVjdC5nZXRSZW1vdGVVc2VyRGF0YShudWxsKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN5bmNVc2VyRGF0YSEucmVmLCByZW1vdGVVc2VyRGF0YS5yZWYpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXN0U3luY1VzZXJEYXRhIS5zeW5jRGF0YSwgcmVtb3RlVXNlckRhdGEuc3luY0RhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldE1jcENvbnRlbnRGcm9tU3luY0NvbnRlbnQobGFzdFN5bmNVc2VyRGF0YSEuc3luY0RhdGEhLmNvbnRlbnQsIGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxvZ1NlcnZpY2UpKSwgY29udGVudCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGx5IHJlbW90ZSB3aGVuIG1jcCBmaWxlIGRvZXMgbm90IGV4aXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCBtY3BSZXNvdXJjZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZS5tY3BSZXNvdXJjZTtcblx0XHRcdGlmIChhd2FpdCBmaWxlU2VydmljZS5leGlzdHMobWNwUmVzb3VyY2UpKSB7XG5cdFx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmRlbChtY3BSZXNvdXJjZSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHByZXZpZXcgPSAoYXdhaXQgdGVzdE9iamVjdC5zeW5jKGF3YWl0IGNsaWVudC5nZXRMYXRlc3RSZWYoU3luY1Jlc291cmNlLk1jcCksIHRydWUpKSE7XG5cblx0XHRcdHNlcnZlci5yZXNldCgpO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRlc3RPYmplY3QucmVzb2x2ZUNvbnRlbnQocHJldmlldy5yZXNvdXJjZVByZXZpZXdzWzBdLnJlbW90ZVJlc291cmNlKTtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3QuYWNjZXB0KHByZXZpZXcucmVzb3VyY2VQcmV2aWV3c1swXS5yZW1vdGVSZXNvdXJjZSwgY29udGVudCk7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFwcGx5KGZhbHNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RzLCBbXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmMgcHJvZmlsZSBtY3AnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbGllbnQyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHNlcnZlcikpO1xuXHRcdFx0YXdhaXQgY2xpZW50Mi5zZXRVcCh0cnVlKTtcblx0XHRcdGNvbnN0IHByb2ZpbGUgPSBhd2FpdCBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmNyZWF0ZU5hbWVkUHJvZmlsZSgncHJvZmlsZTEnKTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHQnbWNwU2VydmVycyc6IHtcblx0XHRcdFx0XHQndGVzdC1zZXJ2ZXInOiB7XG5cdFx0XHRcdFx0XHQnY29tbWFuZCc6ICdub2RlJyxcblx0XHRcdFx0XHRcdCdhcmdzJzogWycuL3NlcnZlci5qcyddXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSkuY3JlYXRlRmlsZShwcm9maWxlLm1jcFJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGV4cGVjdGVkKSk7XG5cdFx0XHRhd2FpdCBjbGllbnQyLnN5bmMoKTtcblxuXHRcdFx0YXdhaXQgY2xpZW50LnN5bmMoKTtcblxuXHRcdFx0Y29uc3Qgc3luY2VkUHJvZmlsZSA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5wcm9maWxlcy5maW5kKHAgPT4gcC5pZCA9PT0gcHJvZmlsZS5pZCkhO1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gKGF3YWl0IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKS5yZWFkRmlsZShzeW5jZWRQcm9maWxlLm1jcFJlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0XHR9KTtcblx0fSk7XG5cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMs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SSxZQUFZO0FBQ2hFLFlBQU0sY0FBYyxPQUFPLHFCQUFxQixJQUFJLHdCQUF3QixFQUFFLGVBQWU7QUFDN0YsVUFBSSxNQUFNLFlBQVksT0FBTyxXQUFXLEdBQUc7QUFDMUMsY0FBTSxZQUFZLElBQUksV0FBVztBQUFBLE1BQ2xDO0FBRUEsWUFBTSxVQUFXLE1BQU0sV0FBVyxLQUFLLE1BQU0sT0FBTyxhQUFhLGFBQWEsR0FBRyxHQUFHLElBQUk7QUFFeEYsYUFBTyxNQUFNO0FBQ2IsWUFBTSxVQUFVLE1BQU0sV0FBVyxlQUFlLFFBQVEsaUJBQWlCLENBQUMsRUFBRSxjQUFjO0FBQzFGLFlBQU0sV0FBVyxPQUFPLFFBQVEsaUJBQWlCLENBQUMsRUFBRSxnQkFBZ0IsT0FBTztBQUMzRSxZQUFNLFdBQVcsTUFBTSxLQUFLO0FBQzVCLGFBQU8sZ0JBQWdCLE9BQU8sVUFBVSxDQUFDLENBQUM7QUFBQSxJQUMzQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxvQkFBb0IsWUFBWTtBQUNwQyxVQUFNLG1CQUF5QixDQUFDLEdBQUcsWUFBWTtBQUM5QyxZQUFNLFVBQVUsZ0JBQWdCLElBQUksSUFBSSxtQkFBbUIsTUFBTSxDQUFDO0FBQ2xFLFlBQU0sUUFBUSxNQUFNLElBQUk7QUFDeEIsWUFBTSxVQUFVLE1BQU0sUUFBUSxxQkFBcUIsSUFBSSx3QkFBd0IsRUFBRSxtQkFBbUIsVUFBVTtBQUM5RyxZQUFNLFdBQVcsS0FBSyxVQUFVO0FBQUEsUUFDL0IsY0FBYztBQUFBLFVBQ2IsZUFBZTtBQUFBLFlBQ2QsV0FBVztBQUFBLFlBQ1gsUUFBUSxDQUFDLGFBQWE7QUFBQSxVQUN2QjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxZQUFNLFFBQVEscUJBQXFCLElBQUksWUFBWSxFQUFFLFdBQVcsUUFBUSxhQUFhLFNBQVMsV0FBVyxRQUFRLENBQUM7QUFDbEgsWUFBTSxRQUFRLEtBQUs7QUFFbkIsWUFBTSxPQUFPLEtBQUs7QUFFbEIsWUFBTSxnQkFBZ0IsT0FBTyxxQkFBcUIsSUFBSSx3QkFBd0IsRUFBRSxTQUFTLEtBQUssT0FBSyxFQUFFLE9BQU8sUUFBUSxFQUFFO0FBQ3RILFlBQU0sVUFBVSxNQUFNLE9BQU8scUJBQXFCLElBQUksWUFBWSxFQUFFLFNBQVMsY0FBYyxXQUFXLEdBQUcsTUFBTSxTQUFTO0FBQ3hILGFBQU8sWUFBWSxRQUFRLFFBQVE7QUFBQSxJQUNwQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUYsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
