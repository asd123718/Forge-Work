import assert from "assert";
import { Emitter } from "../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { IEnvironmentService } from "../../../../../../platform/environment/common/environment.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../../platform/telemetry/common/telemetryUtils.js";
import { IUserDataProfilesService, toUserDataProfile } from "../../../../../../platform/userDataProfile/common/userDataProfile.js";
import { IWorkspaceContextService, WorkspaceFolder } from "../../../../../../platform/workspace/common/workspace.js";
import { TestWorkspace, Workspace } from "../../../../../../platform/workspace/test/common/testWorkspace.js";
import { ILifecycleService } from "../../../../../services/lifecycle/common/lifecycle.js";
import { IWorkspaceEditingService } from "../../../../../services/workspaces/common/workspaceEditing.js";
import { InMemoryTestFileService, TestContextService, TestLifecycleService, TestStorageService } from "../../../../../test/common/workbenchTestServices.js";
import { ChatSessionStore } from "../../../common/model/chatSessionStore.js";
import { LocalChatSessionUri } from "../../../common/model/chatUri.js";
import { MockChatModel } from "./mockChatModel.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
function createMockChatModel(sessionResource, options) {
  const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
  if (!sessionId) {
    throw new Error("createMockChatModel requires a local session URI");
  }
  const model = new MockChatModel(sessionResource);
  model.sessionId = sessionId;
  if (options?.customTitle) {
    model.customTitle = options.customTitle;
  }
  return model;
}
class MockWorkspaceEditingService extends Disposable {
  constructor() {
    super(...arguments);
    this._onDidEnterWorkspace = this._register(new Emitter());
    this.onDidEnterWorkspace = this._onDidEnterWorkspace.event;
  }
  fireWorkspaceTransition(oldWorkspace, newWorkspace) {
    const promises = [];
    const event = {
      oldWorkspace,
      newWorkspace,
      join: (promise) => promises.push(promise)
    };
    this._onDidEnterWorkspace.fire(event);
    return Promise.all(promises).then(() => {
    });
  }
}
class TestChatSessionFileService extends InMemoryTestFileService {
  constructor() {
    super(...arguments);
    this.deleteOperations = [];
  }
  async del(resource, options) {
    this.deleteOperations.push(resource);
    await super.del(resource, options);
  }
}
suite("ChatSessionStore", () => {
  const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let mockWorkspaceEditingService;
  let fileService;
  function createChatSessionStore(isEmptyWindow = false) {
    const workspace = isEmptyWindow ? new Workspace("empty-window-id", []) : TestWorkspace;
    instantiationService.stub(IWorkspaceContextService, new TestContextService(workspace));
    return testDisposables.add(instantiationService.createInstance(ChatSessionStore));
  }
  setup(() => {
    instantiationService = testDisposables.add(new TestInstantiationService(new ServiceCollection()));
    instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
    instantiationService.stub(ILogService, NullLogService);
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    fileService = testDisposables.add(new TestChatSessionFileService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IEnvironmentService, { workspaceStorageHome: URI.file("/test/workspaceStorage") });
    instantiationService.stub(ILifecycleService, testDisposables.add(new TestLifecycleService()));
    instantiationService.stub(IUserDataProfilesService, { defaultProfile: toUserDataProfile("default", "Default", URI.file("/test/userdata"), URI.file("/test/cache")) });
    instantiationService.stub(IConfigurationService, new TestConfigurationService());
    mockWorkspaceEditingService = testDisposables.add(new MockWorkspaceEditingService());
    instantiationService.stub(IWorkspaceEditingService, mockWorkspaceEditingService);
  });
  test("hasSessions returns false when no sessions exist", () => {
    const store = createChatSessionStore();
    assert.strictEqual(store.hasSessions(), false);
  });
  test("getIndex returns empty index initially", async () => {
    const store = createChatSessionStore();
    const index = await store.getIndex();
    assert.deepStrictEqual(index, {});
  });
  test("getChatStorageFolder returns correct path for workspace", () => {
    const store = createChatSessionStore(false);
    const storageFolder = store.getChatStorageFolder();
    assert.ok(storageFolder.path.includes("workspaceStorage"));
    assert.ok(storageFolder.path.includes("chatSessions"));
  });
  test("getChatStorageFolder returns correct path for empty window", () => {
    const store = createChatSessionStore(true);
    const storageFolder = store.getChatStorageFolder();
    assert.ok(storageFolder.path.includes("emptyWindowChatSessions"));
  });
  test("isSessionEmpty returns true for non-existent session", () => {
    const store = createChatSessionStore();
    assert.strictEqual(store.isSessionEmpty("non-existent-session"), true);
  });
  test("readSession returns undefined for non-existent session", async () => {
    const store = createChatSessionStore();
    const session = await store.readSession("non-existent-session");
    assert.strictEqual(session, void 0);
  });
  test("deleteSession handles non-existent session gracefully", async () => {
    const store = createChatSessionStore();
    await store.deleteSession("non-existent-session");
    assert.strictEqual(store.hasSessions(), false);
  });
  test("storeSessions persists session to index", async () => {
    const store = createChatSessionStore();
    const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession("session-1")));
    await store.storeSessions([model]);
    assert.strictEqual(store.hasSessions(), true);
    const index = await store.getIndex();
    assert.ok(index["session-1"]);
    assert.strictEqual(index["session-1"].sessionId, "session-1");
  });
  test("storeSessions rejects session IDs that escape the storage root", async () => {
    const store = createChatSessionStore();
    const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession("../../../outside")));
    await store.storeSessions([model]);
    assert.deepStrictEqual({
      hasSessions: store.hasSessions(),
      writtenResources: fileService.writeOperations.map((operation) => operation.resource.toString())
    }, {
      hasSessions: false,
      writtenResources: []
    });
  });
  test("storeSessions persists custom title", async () => {
    const store = createChatSessionStore();
    const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession("session-1"), { customTitle: "My Custom Title" }));
    await store.storeSessions([model]);
    const index = await store.getIndex();
    assert.strictEqual(index["session-1"].title, "My Custom Title");
  });
  test("readSession returns stored session data", async () => {
    const store = createChatSessionStore();
    const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession("session-1")));
    await store.storeSessions([model]);
    const session = await store.readSession("session-1");
    assert.ok(session);
    assert.strictEqual(session.value.sessionId, "session-1");
  });
  test("readSession ignores and removes a legacy invalid session ID", async () => {
    const store = createChatSessionStore();
    const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession("session-1")));
    await store.storeSessions([model]);
    const index = await store.getIndex();
    index["../../../outside"] = { ...index["session-1"], sessionId: "../../../outside" };
    delete index["session-1"];
    const session = await store.readSession("../../../outside");
    assert.deepStrictEqual({
      session,
      index: await store.getIndex(),
      readOperations: fileService.readOperations
    }, {
      session: void 0,
      index: {},
      readOperations: []
    });
  });
  test("deleteSession removes session from index", async () => {
    const store = createChatSessionStore();
    const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession("session-1")));
    await store.storeSessions([model]);
    assert.strictEqual(store.hasSessions(), true);
    await store.deleteSession("session-1");
    assert.strictEqual(store.hasSessions(), false);
    const index = await store.getIndex();
    assert.strictEqual(index["session-1"], void 0);
  });
  test("deleteSession removes a legacy invalid session ID without deleting files", async () => {
    const store = createChatSessionStore();
    const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession("session-1")));
    await store.storeSessions([model]);
    const index = await store.getIndex();
    index["../../../outside"] = { ...index["session-1"], sessionId: "../../../outside" };
    delete index["session-1"];
    await store.deleteSession("../../../outside");
    assert.deepStrictEqual({
      index: await store.getIndex(),
      deleteOperations: fileService.deleteOperations
    }, {
      index: {},
      deleteOperations: []
    });
  });
  test("clearAllSessions removes all sessions including legacy invalid session IDs", async () => {
    const store = createChatSessionStore();
    const model1 = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession("session-1")));
    const model2 = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession("session-2")));
    await store.storeSessions([model1, model2]);
    const index = await store.getIndex();
    index["../../../outside"] = { ...index["session-1"], sessionId: "../../../outside" };
    assert.strictEqual(Object.keys(index).length, 3);
    await store.clearAllSessions();
    assert.deepStrictEqual(index, {});
  });
  test("setSessionTitle updates existing session title", async () => {
    const store = createChatSessionStore();
    const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession("session-1"), { customTitle: "Original Title" }));
    await store.storeSessions([model]);
    await store.setSessionTitle("session-1", "New Title");
    const index = await store.getIndex();
    assert.strictEqual(index["session-1"].title, "New Title");
  });
  test("setSessionTitle does nothing for non-existent session", async () => {
    const store = createChatSessionStore();
    await store.setSessionTitle("non-existent", "Title");
    const index = await store.getIndex();
    assert.strictEqual(index["non-existent"], void 0);
  });
  test("multiple stores can be created with different workspaces", async () => {
    const store1 = createChatSessionStore(false);
    const store2 = createChatSessionStore(true);
    const folder1 = store1.getChatStorageFolder();
    const folder2 = store2.getChatStorageFolder();
    assert.notStrictEqual(folder1.toString(), folder2.toString());
  });
  suite("transferred sessions", () => {
    function createSingleFolderWorkspace(folderUri) {
      const folder = new WorkspaceFolder({ uri: folderUri, index: 0, name: "test" });
      return new Workspace("single-folder-id", [folder]);
    }
    function createChatSessionStoreWithSingleFolder(folderUri) {
      instantiationService.stub(IWorkspaceContextService, new TestContextService(createSingleFolderWorkspace(folderUri)));
      return testDisposables.add(instantiationService.createInstance(ChatSessionStore));
    }
    function createTransferData(toWorkspace, sessionResource, timestampInMilliseconds) {
      return {
        toWorkspace,
        sessionResource,
        timestampInMilliseconds: timestampInMilliseconds ?? Date.now()
      };
    }
    test("getTransferredSessionData returns undefined for empty window", () => {
      const store = createChatSessionStore(true);
      const result = store.getTransferredSessionData();
      assert.strictEqual(result, void 0);
    });
    test("getTransferredSessionData returns undefined when no transfer exists", () => {
      const folderUri = URI.file("/test/workspace");
      const store = createChatSessionStoreWithSingleFolder(folderUri);
      const result = store.getTransferredSessionData();
      assert.strictEqual(result, void 0);
    });
    test("storeTransferSession stores and retrieves transfer data", async () => {
      const folderUri = URI.file("/test/workspace");
      const store = createChatSessionStoreWithSingleFolder(folderUri);
      const sessionResource = LocalChatSessionUri.forSession("transfer-session");
      const model = testDisposables.add(createMockChatModel(sessionResource));
      const transferData = createTransferData(folderUri, sessionResource);
      await store.storeTransferSession(transferData, model);
      const result = store.getTransferredSessionData();
      assert.ok(result);
      assert.strictEqual(result.toString(), sessionResource.toString());
    });
    test("readTransferredSession returns session data", async () => {
      const folderUri = URI.file("/test/workspace");
      const store = createChatSessionStoreWithSingleFolder(folderUri);
      const sessionResource = LocalChatSessionUri.forSession("transfer-session");
      const model = testDisposables.add(createMockChatModel(sessionResource));
      const transferData = createTransferData(folderUri, sessionResource);
      await store.storeTransferSession(transferData, model);
      const sessionData = await store.readTransferredSession(sessionResource);
      assert.ok(sessionData);
      assert.strictEqual(sessionData.value.sessionId, "transfer-session");
    });
    test("readTransferredSession cleans up after reading", async () => {
      const folderUri = URI.file("/test/workspace");
      const store = createChatSessionStoreWithSingleFolder(folderUri);
      const sessionResource = LocalChatSessionUri.forSession("transfer-session");
      const model = testDisposables.add(createMockChatModel(sessionResource));
      const transferData = createTransferData(folderUri, sessionResource);
      await store.storeTransferSession(transferData, model);
      await store.readTransferredSession(sessionResource);
      const result = store.getTransferredSessionData();
      assert.strictEqual(result, void 0);
    });
    test("getTransferredSessionData returns undefined for expired transfer", async () => {
      const folderUri = URI.file("/test/workspace");
      const store = createChatSessionStoreWithSingleFolder(folderUri);
      const sessionResource = LocalChatSessionUri.forSession("transfer-session");
      const model = testDisposables.add(createMockChatModel(sessionResource));
      const expiredTimestamp = Date.now() - 10 * 60 * 1e3;
      const transferData = createTransferData(folderUri, sessionResource, expiredTimestamp);
      await store.storeTransferSession(transferData, model);
      const result = store.getTransferredSessionData();
      assert.strictEqual(result, void 0);
    });
    test("expired transfer cleans up index and file", async () => {
      const folderUri = URI.file("/test/workspace");
      const store = createChatSessionStoreWithSingleFolder(folderUri);
      const sessionResource = LocalChatSessionUri.forSession("transfer-session");
      const model = testDisposables.add(createMockChatModel(sessionResource));
      const expiredTimestamp = Date.now() - 100 * 60 * 1e3;
      const transferData = createTransferData(folderUri, sessionResource, expiredTimestamp);
      await store.storeTransferSession(transferData, model);
      const data = store.getTransferredSessionData();
      assert.strictEqual(data, void 0);
    });
    test("readTransferredSession returns undefined for invalid session resource", async () => {
      const folderUri = URI.file("/test/workspace");
      const store = createChatSessionStoreWithSingleFolder(folderUri);
      const invalidResource = URI.parse("file:///invalid/session");
      const result = await store.readTransferredSession(invalidResource);
      assert.strictEqual(result, void 0);
    });
    test("storeTransferSession deletes preexisting transferred session file", async () => {
      const folderUri = URI.file("/test/workspace");
      const store = createChatSessionStoreWithSingleFolder(folderUri);
      const fileService2 = instantiationService.get(IFileService);
      const session1Resource = LocalChatSessionUri.forSession("transfer-session-1");
      const model1 = testDisposables.add(createMockChatModel(session1Resource));
      const transferData1 = createTransferData(folderUri, session1Resource);
      await store.storeTransferSession(transferData1, model1);
      const userDataProfile = instantiationService.get(IUserDataProfilesService).defaultProfile;
      const storageLocation1 = URI.joinPath(
        userDataProfile.globalStorageHome,
        "transferredChatSessions",
        "transfer-session-1.json"
      );
      const exists1 = await fileService2.exists(storageLocation1);
      assert.strictEqual(exists1, true, "First session file should exist");
      const session2Resource = LocalChatSessionUri.forSession("transfer-session-2");
      const model2 = testDisposables.add(createMockChatModel(session2Resource));
      const transferData2 = createTransferData(folderUri, session2Resource);
      await store.storeTransferSession(transferData2, model2);
      const exists1After = await fileService2.exists(storageLocation1);
      assert.strictEqual(exists1After, false, "First session file should be deleted");
      const storageLocation2 = URI.joinPath(
        userDataProfile.globalStorageHome,
        "transferredChatSessions",
        "transfer-session-2.json"
      );
      const exists2 = await fileService2.exists(storageLocation2);
      assert.strictEqual(exists2, true, "Second session file should exist");
      const result = store.getTransferredSessionData();
      assert.ok(result);
      assert.strictEqual(result.toString(), session2Resource.toString());
    });
  });
  suite("workspace migration", () => {
    test("migration is triggered when onDidEnterWorkspace fires", async () => {
      const fileService2 = instantiationService.get(IFileService);
      const store = createChatSessionStore(true);
      const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession("session-1")));
      await store.storeSessions([model]);
      assert.strictEqual(store.hasSessions(), true);
      const emptyWindowStorageRoot = store.getChatStorageFolder();
      const sessionFile = URI.joinPath(emptyWindowStorageRoot, "session-1.json");
      const fileExists = await fileService2.exists(sessionFile);
      assert.strictEqual(fileExists, true, "Session file should exist in empty window storage");
      const oldWorkspace = { id: "empty-window-id" };
      const newWorkspace = { id: TestWorkspace.id, uri: URI.file("/test/folder") };
      await mockWorkspaceEditingService.fireWorkspaceTransition(oldWorkspace, newWorkspace);
      const newStorageRoot = store.getChatStorageFolder();
      const migratedSessionFile = URI.joinPath(newStorageRoot, "session-1.json");
      const migratedFileExists = await fileService2.exists(migratedSessionFile);
      assert.strictEqual(migratedFileExists, true, "Session file should be migrated to workspace storage");
    });
    test("migration handles non-existent old storage location gracefully", async () => {
      const store = createChatSessionStore(false);
      const oldWorkspace = { id: "non-existent-workspace-id" };
      const newWorkspace = { id: "new-workspace-id" };
      await mockWorkspaceEditingService.fireWorkspaceTransition(oldWorkspace, newWorkspace);
      assert.strictEqual(store.hasSessions(), false);
    });
    test("storage root is updated after workspace transition", async () => {
      const store = createChatSessionStore(true);
      const initialStorageRoot = store.getChatStorageFolder();
      assert.ok(initialStorageRoot.path.includes("emptyWindowChatSessions"), "Initial storage should be empty window location");
      const oldWorkspace = { id: "empty-window-id" };
      const newWorkspace = { id: "new-workspace-id", uri: URI.file("/test/folder") };
      await mockWorkspaceEditingService.fireWorkspaceTransition(oldWorkspace, newWorkspace);
      const newStorageRoot = store.getChatStorageFolder();
      assert.ok(newStorageRoot.path.includes("new-workspace-id"), "Storage root should be updated to new workspace location");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcbW9kZWxcXGNoYXRTZXNzaW9uU3RvcmUudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUZpbGVEZWxldGVPcHRpb25zLCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSwgdG9Vc2VyRGF0YVByb2ZpbGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJQW55V29ya3NwYWNlSWRlbnRpZmllciwgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXb3Jrc3BhY2VGb2xkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBUZXN0V29ya3NwYWNlLCBXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvdGVzdC9jb21tb24vdGVzdFdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElEaWRFbnRlcldvcmtzcGFjZUV2ZW50LCBJV29ya3NwYWNlRWRpdGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VFZGl0aW5nLmpzJztcbmltcG9ydCB7IEluTWVtb3J5VGVzdEZpbGVTZXJ2aWNlLCBUZXN0Q29udGV4dFNlcnZpY2UsIFRlc3RMaWZlY3ljbGVTZXJ2aWNlLCBUZXN0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGVsLCBJU2VyaWFsaXphYmxlQ2hhdERhdGEzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0U2Vzc2lvblN0b3JlLCBJQ2hhdFRyYW5zZmVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRTZXNzaW9uU3RvcmUuanMnO1xuaW1wb3J0IHsgTG9jYWxDaGF0U2Vzc2lvblVyaSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IE1vY2tDaGF0TW9kZWwgfSBmcm9tICcuL21vY2tDaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5cbmZ1bmN0aW9uIGNyZWF0ZU1vY2tDaGF0TW9kZWwoc2Vzc2lvblJlc291cmNlOiBVUkksIG9wdGlvbnM/OiB7IGN1c3RvbVRpdGxlPzogc3RyaW5nIH0pOiBDaGF0TW9kZWwge1xuXHRjb25zdCBzZXNzaW9uSWQgPSBMb2NhbENoYXRTZXNzaW9uVXJpLnBhcnNlTG9jYWxTZXNzaW9uSWQoc2Vzc2lvblJlc291cmNlKTtcblx0aWYgKCFzZXNzaW9uSWQpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ2NyZWF0ZU1vY2tDaGF0TW9kZWwgcmVxdWlyZXMgYSBsb2NhbCBzZXNzaW9uIFVSSScpO1xuXHR9XG5cdGNvbnN0IG1vZGVsID0gbmV3IE1vY2tDaGF0TW9kZWwoc2Vzc2lvblJlc291cmNlKTtcblx0bW9kZWwuc2Vzc2lvbklkID0gc2Vzc2lvbklkO1xuXHRpZiAob3B0aW9ucz8uY3VzdG9tVGl0bGUpIHtcblx0XHRtb2RlbC5jdXN0b21UaXRsZSA9IG9wdGlvbnMuY3VzdG9tVGl0bGU7XG5cdH1cblx0Ly8gQ2FzdCB0byBDaGF0TW9kZWwgLSB0aGUgbW9jayBpbXBsZW1lbnRzIGVub3VnaCBvZiB0aGUgaW50ZXJmYWNlIGZvciB0ZXN0aW5nXG5cdHJldHVybiBtb2RlbCBhcyB1bmtub3duIGFzIENoYXRNb2RlbDtcbn1cblxuY2xhc3MgTW9ja1dvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIFBhcnRpYWw8SVdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlPiB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRW50ZXJXb3Jrc3BhY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRGlkRW50ZXJXb3Jrc3BhY2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRW50ZXJXb3Jrc3BhY2UgPSB0aGlzLl9vbkRpZEVudGVyV29ya3NwYWNlLmV2ZW50O1xuXG5cdGZpcmVXb3Jrc3BhY2VUcmFuc2l0aW9uKG9sZFdvcmtzcGFjZTogSUFueVdvcmtzcGFjZUlkZW50aWZpZXIsIG5ld1dvcmtzcGFjZTogSUFueVdvcmtzcGFjZUlkZW50aWZpZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcm9taXNlczogUHJvbWlzZTx2b2lkPltdID0gW107XG5cdFx0Y29uc3QgZXZlbnQ6IElEaWRFbnRlcldvcmtzcGFjZUV2ZW50ID0ge1xuXHRcdFx0b2xkV29ya3NwYWNlLFxuXHRcdFx0bmV3V29ya3NwYWNlLFxuXHRcdFx0am9pbjogKHByb21pc2U6IFByb21pc2U8dm9pZD4pID0+IHByb21pc2VzLnB1c2gocHJvbWlzZSlcblx0XHR9O1xuXHRcdHRoaXMuX29uRGlkRW50ZXJXb3Jrc3BhY2UuZmlyZShldmVudCk7XG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKCgpID0+IHsgfSk7XG5cdH1cbn1cblxuY2xhc3MgVGVzdENoYXRTZXNzaW9uRmlsZVNlcnZpY2UgZXh0ZW5kcyBJbk1lbW9yeVRlc3RGaWxlU2VydmljZSB7XG5cdHJlYWRvbmx5IGRlbGV0ZU9wZXJhdGlvbnM6IFVSSVtdID0gW107XG5cblx0b3ZlcnJpZGUgYXN5bmMgZGVsKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJRmlsZURlbGV0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmRlbGV0ZU9wZXJhdGlvbnMucHVzaChyZXNvdXJjZSk7XG5cdFx0YXdhaXQgc3VwZXIuZGVsKHJlc291cmNlLCBvcHRpb25zKTtcblx0fVxufVxuXG5zdWl0ZSgnQ2hhdFNlc3Npb25TdG9yZScsICgpID0+IHtcblx0Y29uc3QgdGVzdERpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBtb2NrV29ya3NwYWNlRWRpdGluZ1NlcnZpY2U6IE1vY2tXb3Jrc3BhY2VFZGl0aW5nU2VydmljZTtcblx0bGV0IGZpbGVTZXJ2aWNlOiBUZXN0Q2hhdFNlc3Npb25GaWxlU2VydmljZTtcblxuXHRmdW5jdGlvbiBjcmVhdGVDaGF0U2Vzc2lvblN0b3JlKGlzRW1wdHlXaW5kb3c6IGJvb2xlYW4gPSBmYWxzZSk6IENoYXRTZXNzaW9uU3RvcmUge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGlzRW1wdHlXaW5kb3cgPyBuZXcgV29ya3NwYWNlKCdlbXB0eS13aW5kb3ctaWQnLCBbXSkgOiBUZXN0V29ya3NwYWNlO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBuZXcgVGVzdENvbnRleHRTZXJ2aWNlKHdvcmtzcGFjZSkpO1xuXHRcdHJldHVybiB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRTZXNzaW9uU3RvcmUpKTtcblx0fVxuXG5cdHNldHVwKCgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZShuZXcgU2VydmljZUNvbGxlY3Rpb24oKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0ZmlsZVNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0Q2hhdFNlc3Npb25GaWxlU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVudmlyb25tZW50U2VydmljZSwgeyB3b3Jrc3BhY2VTdG9yYWdlSG9tZTogVVJJLmZpbGUoJy90ZXN0L3dvcmtzcGFjZVN0b3JhZ2UnKSB9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMaWZlY3ljbGVTZXJ2aWNlLCB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGlmZWN5Y2xlU2VydmljZSgpKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsIHsgZGVmYXVsdFByb2ZpbGU6IHRvVXNlckRhdGFQcm9maWxlKCdkZWZhdWx0JywgJ0RlZmF1bHQnLCBVUkkuZmlsZSgnL3Rlc3QvdXNlcmRhdGEnKSwgVVJJLmZpbGUoJy90ZXN0L2NhY2hlJykpIH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpO1xuXHRcdG1vY2tXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSwgbW9ja1dvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlIGFzIHVua25vd24gYXMgSVdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlKTtcblx0fSk7XG5cblx0dGVzdCgnaGFzU2Vzc2lvbnMgcmV0dXJucyBmYWxzZSB3aGVuIG5vIHNlc3Npb25zIGV4aXN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gY3JlYXRlQ2hhdFNlc3Npb25TdG9yZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLmhhc1Nlc3Npb25zKCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0SW5kZXggcmV0dXJucyBlbXB0eSBpbmRleCBpbml0aWFsbHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBjcmVhdGVDaGF0U2Vzc2lvblN0b3JlKCk7XG5cblx0XHRjb25zdCBpbmRleCA9IGF3YWl0IHN0b3JlLmdldEluZGV4KCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpbmRleCwge30pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRDaGF0U3RvcmFnZUZvbGRlciByZXR1cm5zIGNvcnJlY3QgcGF0aCBmb3Igd29ya3NwYWNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gY3JlYXRlQ2hhdFNlc3Npb25TdG9yZShmYWxzZSk7XG5cblx0XHRjb25zdCBzdG9yYWdlRm9sZGVyID0gc3RvcmUuZ2V0Q2hhdFN0b3JhZ2VGb2xkZXIoKTtcblx0XHRhc3NlcnQub2soc3RvcmFnZUZvbGRlci5wYXRoLmluY2x1ZGVzKCd3b3Jrc3BhY2VTdG9yYWdlJykpO1xuXHRcdGFzc2VydC5vayhzdG9yYWdlRm9sZGVyLnBhdGguaW5jbHVkZXMoJ2NoYXRTZXNzaW9ucycpKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0Q2hhdFN0b3JhZ2VGb2xkZXIgcmV0dXJucyBjb3JyZWN0IHBhdGggZm9yIGVtcHR5IHdpbmRvdycsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGNyZWF0ZUNoYXRTZXNzaW9uU3RvcmUodHJ1ZSk7XG5cblx0XHRjb25zdCBzdG9yYWdlRm9sZGVyID0gc3RvcmUuZ2V0Q2hhdFN0b3JhZ2VGb2xkZXIoKTtcblx0XHRhc3NlcnQub2soc3RvcmFnZUZvbGRlci5wYXRoLmluY2x1ZGVzKCdlbXB0eVdpbmRvd0NoYXRTZXNzaW9ucycpKTtcblx0fSk7XG5cblx0dGVzdCgnaXNTZXNzaW9uRW1wdHkgcmV0dXJucyB0cnVlIGZvciBub24tZXhpc3RlbnQgc2Vzc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGNyZWF0ZUNoYXRTZXNzaW9uU3RvcmUoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5pc1Nlc3Npb25FbXB0eSgnbm9uLWV4aXN0ZW50LXNlc3Npb24nKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRTZXNzaW9uIHJldHVybnMgdW5kZWZpbmVkIGZvciBub24tZXhpc3RlbnQgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGNyZWF0ZUNoYXRTZXNzaW9uU3RvcmUoKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBzdG9yZS5yZWFkU2Vzc2lvbignbm9uLWV4aXN0ZW50LXNlc3Npb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlU2Vzc2lvbiBoYW5kbGVzIG5vbi1leGlzdGVudCBzZXNzaW9uIGdyYWNlZnVsbHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBjcmVhdGVDaGF0U2Vzc2lvblN0b3JlKCk7XG5cblx0XHQvLyBTaG91bGQgbm90IHRocm93XG5cdFx0YXdhaXQgc3RvcmUuZGVsZXRlU2Vzc2lvbignbm9uLWV4aXN0ZW50LXNlc3Npb24nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5oYXNTZXNzaW9ucygpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0b3JlU2Vzc2lvbnMgcGVyc2lzdHMgc2Vzc2lvbiB0byBpbmRleCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGNyZWF0ZUNoYXRTZXNzaW9uU3RvcmUoKTtcblx0XHRjb25zdCBtb2RlbCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoY3JlYXRlTW9ja0NoYXRNb2RlbChMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ3Nlc3Npb24tMScpKSk7XG5cblx0XHRhd2FpdCBzdG9yZS5zdG9yZVNlc3Npb25zKFttb2RlbF0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLmhhc1Nlc3Npb25zKCksIHRydWUpO1xuXHRcdGNvbnN0IGluZGV4ID0gYXdhaXQgc3RvcmUuZ2V0SW5kZXgoKTtcblx0XHRhc3NlcnQub2soaW5kZXhbJ3Nlc3Npb24tMSddKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5kZXhbJ3Nlc3Npb24tMSddLnNlc3Npb25JZCwgJ3Nlc3Npb24tMScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdG9yZVNlc3Npb25zIHJlamVjdHMgc2Vzc2lvbiBJRHMgdGhhdCBlc2NhcGUgdGhlIHN0b3JhZ2Ugcm9vdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGNyZWF0ZUNoYXRTZXNzaW9uU3RvcmUoKTtcblx0XHRjb25zdCBtb2RlbCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoY3JlYXRlTW9ja0NoYXRNb2RlbChMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJy4uLy4uLy4uL291dHNpZGUnKSkpO1xuXG5cdFx0YXdhaXQgc3RvcmUuc3RvcmVTZXNzaW9ucyhbbW9kZWxdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzU2Vzc2lvbnM6IHN0b3JlLmhhc1Nlc3Npb25zKCksXG5cdFx0XHR3cml0dGVuUmVzb3VyY2VzOiBmaWxlU2VydmljZS53cml0ZU9wZXJhdGlvbnMubWFwKG9wZXJhdGlvbiA9PiBvcGVyYXRpb24ucmVzb3VyY2UudG9TdHJpbmcoKSksXG5cdFx0fSwge1xuXHRcdFx0aGFzU2Vzc2lvbnM6IGZhbHNlLFxuXHRcdFx0d3JpdHRlblJlc291cmNlczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0b3JlU2Vzc2lvbnMgcGVyc2lzdHMgY3VzdG9tIHRpdGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gY3JlYXRlQ2hhdFNlc3Npb25TdG9yZSgpO1xuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChjcmVhdGVNb2NrQ2hhdE1vZGVsKExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignc2Vzc2lvbi0xJyksIHsgY3VzdG9tVGl0bGU6ICdNeSBDdXN0b20gVGl0bGUnIH0pKTtcblxuXHRcdGF3YWl0IHN0b3JlLnN0b3JlU2Vzc2lvbnMoW21vZGVsXSk7XG5cblx0XHRjb25zdCBpbmRleCA9IGF3YWl0IHN0b3JlLmdldEluZGV4KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluZGV4WydzZXNzaW9uLTEnXS50aXRsZSwgJ015IEN1c3RvbSBUaXRsZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkU2Vzc2lvbiByZXR1cm5zIHN0b3JlZCBzZXNzaW9uIGRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBjcmVhdGVDaGF0U2Vzc2lvblN0b3JlKCk7XG5cdFx0Y29uc3QgbW9kZWwgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGNyZWF0ZU1vY2tDaGF0TW9kZWwoTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdzZXNzaW9uLTEnKSkpO1xuXG5cdFx0YXdhaXQgc3RvcmUuc3RvcmVTZXNzaW9ucyhbbW9kZWxdKTtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgc3RvcmUucmVhZFNlc3Npb24oJ3Nlc3Npb24tMScpO1xuXG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoc2Vzc2lvbi52YWx1ZSBhcyBJU2VyaWFsaXphYmxlQ2hhdERhdGEzKS5zZXNzaW9uSWQsICdzZXNzaW9uLTEnKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZFNlc3Npb24gaWdub3JlcyBhbmQgcmVtb3ZlcyBhIGxlZ2FjeSBpbnZhbGlkIHNlc3Npb24gSUQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBjcmVhdGVDaGF0U2Vzc2lvblN0b3JlKCk7XG5cdFx0Y29uc3QgbW9kZWwgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGNyZWF0ZU1vY2tDaGF0TW9kZWwoTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdzZXNzaW9uLTEnKSkpO1xuXHRcdGF3YWl0IHN0b3JlLnN0b3JlU2Vzc2lvbnMoW21vZGVsXSk7XG5cdFx0Y29uc3QgaW5kZXggPSBhd2FpdCBzdG9yZS5nZXRJbmRleCgpO1xuXHRcdGluZGV4WycuLi8uLi8uLi9vdXRzaWRlJ10gPSB7IC4uLmluZGV4WydzZXNzaW9uLTEnXSwgc2Vzc2lvbklkOiAnLi4vLi4vLi4vb3V0c2lkZScgfTtcblx0XHRkZWxldGUgaW5kZXhbJ3Nlc3Npb24tMSddO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHN0b3JlLnJlYWRTZXNzaW9uKCcuLi8uLi8uLi9vdXRzaWRlJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNlc3Npb24sXG5cdFx0XHRpbmRleDogYXdhaXQgc3RvcmUuZ2V0SW5kZXgoKSxcblx0XHRcdHJlYWRPcGVyYXRpb25zOiBmaWxlU2VydmljZS5yZWFkT3BlcmF0aW9ucyxcblx0XHR9LCB7XG5cdFx0XHRzZXNzaW9uOiB1bmRlZmluZWQsXG5cdFx0XHRpbmRleDoge30sXG5cdFx0XHRyZWFkT3BlcmF0aW9uczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZVNlc3Npb24gcmVtb3ZlcyBzZXNzaW9uIGZyb20gaW5kZXgnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBjcmVhdGVDaGF0U2Vzc2lvblN0b3JlKCk7XG5cdFx0Y29uc3QgbW9kZWwgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGNyZWF0ZU1vY2tDaGF0TW9kZWwoTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdzZXNzaW9uLTEnKSkpO1xuXG5cdFx0YXdhaXQgc3RvcmUuc3RvcmVTZXNzaW9ucyhbbW9kZWxdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUuaGFzU2Vzc2lvbnMoKSwgdHJ1ZSk7XG5cblx0XHRhd2FpdCBzdG9yZS5kZWxldGVTZXNzaW9uKCdzZXNzaW9uLTEnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5oYXNTZXNzaW9ucygpLCBmYWxzZSk7XG5cdFx0Y29uc3QgaW5kZXggPSBhd2FpdCBzdG9yZS5nZXRJbmRleCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbmRleFsnc2Vzc2lvbi0xJ10sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZVNlc3Npb24gcmVtb3ZlcyBhIGxlZ2FjeSBpbnZhbGlkIHNlc3Npb24gSUQgd2l0aG91dCBkZWxldGluZyBmaWxlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGNyZWF0ZUNoYXRTZXNzaW9uU3RvcmUoKTtcblx0XHRjb25zdCBtb2RlbCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoY3JlYXRlTW9ja0NoYXRNb2RlbChMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ3Nlc3Npb24tMScpKSk7XG5cdFx0YXdhaXQgc3RvcmUuc3RvcmVTZXNzaW9ucyhbbW9kZWxdKTtcblx0XHRjb25zdCBpbmRleCA9IGF3YWl0IHN0b3JlLmdldEluZGV4KCk7XG5cdFx0aW5kZXhbJy4uLy4uLy4uL291dHNpZGUnXSA9IHsgLi4uaW5kZXhbJ3Nlc3Npb24tMSddLCBzZXNzaW9uSWQ6ICcuLi8uLi8uLi9vdXRzaWRlJyB9O1xuXHRcdGRlbGV0ZSBpbmRleFsnc2Vzc2lvbi0xJ107XG5cblx0XHRhd2FpdCBzdG9yZS5kZWxldGVTZXNzaW9uKCcuLi8uLi8uLi9vdXRzaWRlJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGluZGV4OiBhd2FpdCBzdG9yZS5nZXRJbmRleCgpLFxuXHRcdFx0ZGVsZXRlT3BlcmF0aW9uczogZmlsZVNlcnZpY2UuZGVsZXRlT3BlcmF0aW9ucyxcblx0XHR9LCB7XG5cdFx0XHRpbmRleDoge30sXG5cdFx0XHRkZWxldGVPcGVyYXRpb25zOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2xlYXJBbGxTZXNzaW9ucyByZW1vdmVzIGFsbCBzZXNzaW9ucyBpbmNsdWRpbmcgbGVnYWN5IGludmFsaWQgc2Vzc2lvbiBJRHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBjcmVhdGVDaGF0U2Vzc2lvblN0b3JlKCk7XG5cdFx0Y29uc3QgbW9kZWwxID0gdGVzdERpc3Bvc2FibGVzLmFkZChjcmVhdGVNb2NrQ2hhdE1vZGVsKExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignc2Vzc2lvbi0xJykpKTtcblx0XHRjb25zdCBtb2RlbDIgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGNyZWF0ZU1vY2tDaGF0TW9kZWwoTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdzZXNzaW9uLTInKSkpO1xuXG5cdFx0YXdhaXQgc3RvcmUuc3RvcmVTZXNzaW9ucyhbbW9kZWwxLCBtb2RlbDJdKTtcblx0XHRjb25zdCBpbmRleCA9IGF3YWl0IHN0b3JlLmdldEluZGV4KCk7XG5cdFx0aW5kZXhbJy4uLy4uLy4uL291dHNpZGUnXSA9IHsgLi4uaW5kZXhbJ3Nlc3Npb24tMSddLCBzZXNzaW9uSWQ6ICcuLi8uLi8uLi9vdXRzaWRlJyB9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChPYmplY3Qua2V5cyhpbmRleCkubGVuZ3RoLCAzKTtcblxuXHRcdGF3YWl0IHN0b3JlLmNsZWFyQWxsU2Vzc2lvbnMoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaW5kZXgsIHt9KTtcblx0fSk7XG5cblx0dGVzdCgnc2V0U2Vzc2lvblRpdGxlIHVwZGF0ZXMgZXhpc3Rpbmcgc2Vzc2lvbiB0aXRsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGNyZWF0ZUNoYXRTZXNzaW9uU3RvcmUoKTtcblx0XHRjb25zdCBtb2RlbCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoY3JlYXRlTW9ja0NoYXRNb2RlbChMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ3Nlc3Npb24tMScpLCB7IGN1c3RvbVRpdGxlOiAnT3JpZ2luYWwgVGl0bGUnIH0pKTtcblxuXHRcdGF3YWl0IHN0b3JlLnN0b3JlU2Vzc2lvbnMoW21vZGVsXSk7XG5cdFx0YXdhaXQgc3RvcmUuc2V0U2Vzc2lvblRpdGxlKCdzZXNzaW9uLTEnLCAnTmV3IFRpdGxlJyk7XG5cblx0XHRjb25zdCBpbmRleCA9IGF3YWl0IHN0b3JlLmdldEluZGV4KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluZGV4WydzZXNzaW9uLTEnXS50aXRsZSwgJ05ldyBUaXRsZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRTZXNzaW9uVGl0bGUgZG9lcyBub3RoaW5nIGZvciBub24tZXhpc3RlbnQgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGNyZWF0ZUNoYXRTZXNzaW9uU3RvcmUoKTtcblxuXHRcdC8vIFNob3VsZCBub3QgdGhyb3dcblx0XHRhd2FpdCBzdG9yZS5zZXRTZXNzaW9uVGl0bGUoJ25vbi1leGlzdGVudCcsICdUaXRsZScpO1xuXG5cdFx0Y29uc3QgaW5kZXggPSBhd2FpdCBzdG9yZS5nZXRJbmRleCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbmRleFsnbm9uLWV4aXN0ZW50J10sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpcGxlIHN0b3JlcyBjYW4gYmUgY3JlYXRlZCB3aXRoIGRpZmZlcmVudCB3b3Jrc3BhY2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlMSA9IGNyZWF0ZUNoYXRTZXNzaW9uU3RvcmUoZmFsc2UpO1xuXHRcdGNvbnN0IHN0b3JlMiA9IGNyZWF0ZUNoYXRTZXNzaW9uU3RvcmUodHJ1ZSk7XG5cblx0XHRjb25zdCBmb2xkZXIxID0gc3RvcmUxLmdldENoYXRTdG9yYWdlRm9sZGVyKCk7XG5cdFx0Y29uc3QgZm9sZGVyMiA9IHN0b3JlMi5nZXRDaGF0U3RvcmFnZUZvbGRlcigpO1xuXG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGZvbGRlcjEudG9TdHJpbmcoKSwgZm9sZGVyMi50b1N0cmluZygpKTtcblx0fSk7XG5cblx0c3VpdGUoJ3RyYW5zZmVycmVkIHNlc3Npb25zJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIGNyZWF0ZVNpbmdsZUZvbGRlcldvcmtzcGFjZShmb2xkZXJVcmk6IFVSSSk6IFdvcmtzcGFjZSB7XG5cdFx0XHRjb25zdCBmb2xkZXIgPSBuZXcgV29ya3NwYWNlRm9sZGVyKHsgdXJpOiBmb2xkZXJVcmksIGluZGV4OiAwLCBuYW1lOiAndGVzdCcgfSk7XG5cdFx0XHRyZXR1cm4gbmV3IFdvcmtzcGFjZSgnc2luZ2xlLWZvbGRlci1pZCcsIFtmb2xkZXJdKTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVDaGF0U2Vzc2lvblN0b3JlV2l0aFNpbmdsZUZvbGRlcihmb2xkZXJVcmk6IFVSSSk6IENoYXRTZXNzaW9uU3RvcmUge1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoY3JlYXRlU2luZ2xlRm9sZGVyV29ya3NwYWNlKGZvbGRlclVyaSkpKTtcblx0XHRcdHJldHVybiB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRTZXNzaW9uU3RvcmUpKTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVUcmFuc2ZlckRhdGEodG9Xb3Jrc3BhY2U6IFVSSSwgc2Vzc2lvblJlc291cmNlOiBVUkksIHRpbWVzdGFtcEluTWlsbGlzZWNvbmRzPzogbnVtYmVyKTogSUNoYXRUcmFuc2ZlciB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0b1dvcmtzcGFjZSxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHR0aW1lc3RhbXBJbk1pbGxpc2Vjb25kczogdGltZXN0YW1wSW5NaWxsaXNlY29uZHMgPz8gRGF0ZS5ub3coKSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0dGVzdCgnZ2V0VHJhbnNmZXJyZWRTZXNzaW9uRGF0YSByZXR1cm5zIHVuZGVmaW5lZCBmb3IgZW1wdHkgd2luZG93JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RvcmUgPSBjcmVhdGVDaGF0U2Vzc2lvblN0b3JlKHRydWUpOyAvLyBlbXB0eSB3aW5kb3dcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuZ2V0VHJhbnNmZXJyZWRTZXNzaW9uRGF0YSgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0VHJhbnNmZXJyZWRTZXNzaW9uRGF0YSByZXR1cm5zIHVuZGVmaW5lZCB3aGVuIG5vIHRyYW5zZmVyIGV4aXN0cycsICgpID0+IHtcblx0XHRcdGNvbnN0IGZvbGRlclVyaSA9IFVSSS5maWxlKCcvdGVzdC93b3Jrc3BhY2UnKTtcblx0XHRcdGNvbnN0IHN0b3JlID0gY3JlYXRlQ2hhdFNlc3Npb25TdG9yZVdpdGhTaW5nbGVGb2xkZXIoZm9sZGVyVXJpKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuZ2V0VHJhbnNmZXJyZWRTZXNzaW9uRGF0YSgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RvcmVUcmFuc2ZlclNlc3Npb24gc3RvcmVzIGFuZCByZXRyaWV2ZXMgdHJhbnNmZXIgZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZvbGRlclVyaSA9IFVSSS5maWxlKCcvdGVzdC93b3Jrc3BhY2UnKTtcblx0XHRcdGNvbnN0IHN0b3JlID0gY3JlYXRlQ2hhdFNlc3Npb25TdG9yZVdpdGhTaW5nbGVGb2xkZXIoZm9sZGVyVXJpKTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbigndHJhbnNmZXItc2Vzc2lvbicpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGNyZWF0ZU1vY2tDaGF0TW9kZWwoc2Vzc2lvblJlc291cmNlKSk7XG5cblx0XHRcdGNvbnN0IHRyYW5zZmVyRGF0YSA9IGNyZWF0ZVRyYW5zZmVyRGF0YShmb2xkZXJVcmksIHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRhd2FpdCBzdG9yZS5zdG9yZVRyYW5zZmVyU2Vzc2lvbih0cmFuc2ZlckRhdGEsIG1vZGVsKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuZ2V0VHJhbnNmZXJyZWRTZXNzaW9uRGF0YSgpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRvU3RyaW5nKCksIHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlYWRUcmFuc2ZlcnJlZFNlc3Npb24gcmV0dXJucyBzZXNzaW9uIGRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmb2xkZXJVcmkgPSBVUkkuZmlsZSgnL3Rlc3Qvd29ya3NwYWNlJyk7XG5cdFx0XHRjb25zdCBzdG9yZSA9IGNyZWF0ZUNoYXRTZXNzaW9uU3RvcmVXaXRoU2luZ2xlRm9sZGVyKGZvbGRlclVyaSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ3RyYW5zZmVyLXNlc3Npb24nKTtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChjcmVhdGVNb2NrQ2hhdE1vZGVsKHNlc3Npb25SZXNvdXJjZSkpO1xuXG5cdFx0XHRjb25zdCB0cmFuc2ZlckRhdGEgPSBjcmVhdGVUcmFuc2ZlckRhdGEoZm9sZGVyVXJpLCBzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0YXdhaXQgc3RvcmUuc3RvcmVUcmFuc2ZlclNlc3Npb24odHJhbnNmZXJEYXRhLCBtb2RlbCk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhID0gYXdhaXQgc3RvcmUucmVhZFRyYW5zZmVycmVkU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlc3Npb25EYXRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoc2Vzc2lvbkRhdGEudmFsdWUgYXMgSVNlcmlhbGl6YWJsZUNoYXREYXRhMykuc2Vzc2lvbklkLCAndHJhbnNmZXItc2Vzc2lvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVhZFRyYW5zZmVycmVkU2Vzc2lvbiBjbGVhbnMgdXAgYWZ0ZXIgcmVhZGluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZvbGRlclVyaSA9IFVSSS5maWxlKCcvdGVzdC93b3Jrc3BhY2UnKTtcblx0XHRcdGNvbnN0IHN0b3JlID0gY3JlYXRlQ2hhdFNlc3Npb25TdG9yZVdpdGhTaW5nbGVGb2xkZXIoZm9sZGVyVXJpKTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbigndHJhbnNmZXItc2Vzc2lvbicpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGNyZWF0ZU1vY2tDaGF0TW9kZWwoc2Vzc2lvblJlc291cmNlKSk7XG5cblx0XHRcdGNvbnN0IHRyYW5zZmVyRGF0YSA9IGNyZWF0ZVRyYW5zZmVyRGF0YShmb2xkZXJVcmksIHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRhd2FpdCBzdG9yZS5zdG9yZVRyYW5zZmVyU2Vzc2lvbih0cmFuc2ZlckRhdGEsIG1vZGVsKTtcblxuXHRcdFx0Ly8gUmVhZCB0aGUgc2Vzc2lvblxuXHRcdFx0YXdhaXQgc3RvcmUucmVhZFRyYW5zZmVycmVkU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0XHQvLyBUcmFuc2ZlciBzaG91bGQgYmUgY2xlYW5lZCB1cFxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuZ2V0VHJhbnNmZXJyZWRTZXNzaW9uRGF0YSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldFRyYW5zZmVycmVkU2Vzc2lvbkRhdGEgcmV0dXJucyB1bmRlZmluZWQgZm9yIGV4cGlyZWQgdHJhbnNmZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmb2xkZXJVcmkgPSBVUkkuZmlsZSgnL3Rlc3Qvd29ya3NwYWNlJyk7XG5cdFx0XHRjb25zdCBzdG9yZSA9IGNyZWF0ZUNoYXRTZXNzaW9uU3RvcmVXaXRoU2luZ2xlRm9sZGVyKGZvbGRlclVyaSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ3RyYW5zZmVyLXNlc3Npb24nKTtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChjcmVhdGVNb2NrQ2hhdE1vZGVsKHNlc3Npb25SZXNvdXJjZSkpO1xuXG5cdFx0XHQvLyBDcmVhdGUgdHJhbnNmZXIgd2l0aCB0aW1lc3RhbXAgMTAgbWludXRlcyBpbiB0aGUgcGFzdCAoZXhwaXJlZClcblx0XHRcdGNvbnN0IGV4cGlyZWRUaW1lc3RhbXAgPSBEYXRlLm5vdygpIC0gKDEwICogNjAgKiAxMDAwKTtcblx0XHRcdGNvbnN0IHRyYW5zZmVyRGF0YSA9IGNyZWF0ZVRyYW5zZmVyRGF0YShmb2xkZXJVcmksIHNlc3Npb25SZXNvdXJjZSwgZXhwaXJlZFRpbWVzdGFtcCk7XG5cdFx0XHRhd2FpdCBzdG9yZS5zdG9yZVRyYW5zZmVyU2Vzc2lvbih0cmFuc2ZlckRhdGEsIG1vZGVsKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuZ2V0VHJhbnNmZXJyZWRTZXNzaW9uRGF0YSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4cGlyZWQgdHJhbnNmZXIgY2xlYW5zIHVwIGluZGV4IGFuZCBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZm9sZGVyVXJpID0gVVJJLmZpbGUoJy90ZXN0L3dvcmtzcGFjZScpO1xuXHRcdFx0Y29uc3Qgc3RvcmUgPSBjcmVhdGVDaGF0U2Vzc2lvblN0b3JlV2l0aFNpbmdsZUZvbGRlcihmb2xkZXJVcmkpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCd0cmFuc2Zlci1zZXNzaW9uJyk7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoY3JlYXRlTW9ja0NoYXRNb2RlbChzZXNzaW9uUmVzb3VyY2UpKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIHRyYW5zZmVyIHdpdGggdGltZXN0YW1wIDEwMCBtaW51dGVzIGluIHRoZSBwYXN0IChleHBpcmVkKVxuXHRcdFx0Y29uc3QgZXhwaXJlZFRpbWVzdGFtcCA9IERhdGUubm93KCkgLSAoMTAwICogNjAgKiAxMDAwKTtcblx0XHRcdGNvbnN0IHRyYW5zZmVyRGF0YSA9IGNyZWF0ZVRyYW5zZmVyRGF0YShmb2xkZXJVcmksIHNlc3Npb25SZXNvdXJjZSwgZXhwaXJlZFRpbWVzdGFtcCk7XG5cdFx0XHRhd2FpdCBzdG9yZS5zdG9yZVRyYW5zZmVyU2Vzc2lvbih0cmFuc2ZlckRhdGEsIG1vZGVsKTtcblxuXHRcdFx0Ly8gQXNzZXJ0IGNsZWFuZWQgdXBcblx0XHRcdGNvbnN0IGRhdGEgPSBzdG9yZS5nZXRUcmFuc2ZlcnJlZFNlc3Npb25EYXRhKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlYWRUcmFuc2ZlcnJlZFNlc3Npb24gcmV0dXJucyB1bmRlZmluZWQgZm9yIGludmFsaWQgc2Vzc2lvbiByZXNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZvbGRlclVyaSA9IFVSSS5maWxlKCcvdGVzdC93b3Jrc3BhY2UnKTtcblx0XHRcdGNvbnN0IHN0b3JlID0gY3JlYXRlQ2hhdFNlc3Npb25TdG9yZVdpdGhTaW5nbGVGb2xkZXIoZm9sZGVyVXJpKTtcblxuXHRcdFx0Ly8gVXNlIGEgbm9uLWxvY2FsIHNlc3Npb24gVVJJXG5cdFx0XHRjb25zdCBpbnZhbGlkUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vaW52YWxpZC9zZXNzaW9uJyk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN0b3JlLnJlYWRUcmFuc2ZlcnJlZFNlc3Npb24oaW52YWxpZFJlc291cmNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdG9yZVRyYW5zZmVyU2Vzc2lvbiBkZWxldGVzIHByZWV4aXN0aW5nIHRyYW5zZmVycmVkIHNlc3Npb24gZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZvbGRlclVyaSA9IFVSSS5maWxlKCcvdGVzdC93b3Jrc3BhY2UnKTtcblx0XHRcdGNvbnN0IHN0b3JlID0gY3JlYXRlQ2hhdFNlc3Npb25TdG9yZVdpdGhTaW5nbGVGb2xkZXIoZm9sZGVyVXJpKTtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cblx0XHRcdC8vIFN0b3JlIGZpcnN0IHNlc3Npb25cblx0XHRcdGNvbnN0IHNlc3Npb24xUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ3RyYW5zZmVyLXNlc3Npb24tMScpO1xuXHRcdFx0Y29uc3QgbW9kZWwxID0gdGVzdERpc3Bvc2FibGVzLmFkZChjcmVhdGVNb2NrQ2hhdE1vZGVsKHNlc3Npb24xUmVzb3VyY2UpKTtcblx0XHRcdGNvbnN0IHRyYW5zZmVyRGF0YTEgPSBjcmVhdGVUcmFuc2ZlckRhdGEoZm9sZGVyVXJpLCBzZXNzaW9uMVJlc291cmNlKTtcblx0XHRcdGF3YWl0IHN0b3JlLnN0b3JlVHJhbnNmZXJTZXNzaW9uKHRyYW5zZmVyRGF0YTEsIG1vZGVsMSk7XG5cblx0XHRcdC8vIFZlcmlmeSBmaXJzdCBzZXNzaW9uIGZpbGUgZXhpc3RzXG5cdFx0XHRjb25zdCB1c2VyRGF0YVByb2ZpbGUgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZTtcblx0XHRcdGNvbnN0IHN0b3JhZ2VMb2NhdGlvbjEgPSBVUkkuam9pblBhdGgoXG5cdFx0XHRcdHVzZXJEYXRhUHJvZmlsZS5nbG9iYWxTdG9yYWdlSG9tZSxcblx0XHRcdFx0J3RyYW5zZmVycmVkQ2hhdFNlc3Npb25zJyxcblx0XHRcdFx0J3RyYW5zZmVyLXNlc3Npb24tMS5qc29uJ1xuXHRcdFx0KTtcblx0XHRcdGNvbnN0IGV4aXN0czEgPSBhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoc3RvcmFnZUxvY2F0aW9uMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzMSwgdHJ1ZSwgJ0ZpcnN0IHNlc3Npb24gZmlsZSBzaG91bGQgZXhpc3QnKTtcblxuXHRcdFx0Ly8gU3RvcmUgc2Vjb25kIHNlc3Npb24gZm9yIHRoZSBzYW1lIHdvcmtzcGFjZVxuXHRcdFx0Y29uc3Qgc2Vzc2lvbjJSZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbigndHJhbnNmZXItc2Vzc2lvbi0yJyk7XG5cdFx0XHRjb25zdCBtb2RlbDIgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGNyZWF0ZU1vY2tDaGF0TW9kZWwoc2Vzc2lvbjJSZXNvdXJjZSkpO1xuXHRcdFx0Y29uc3QgdHJhbnNmZXJEYXRhMiA9IGNyZWF0ZVRyYW5zZmVyRGF0YShmb2xkZXJVcmksIHNlc3Npb24yUmVzb3VyY2UpO1xuXHRcdFx0YXdhaXQgc3RvcmUuc3RvcmVUcmFuc2ZlclNlc3Npb24odHJhbnNmZXJEYXRhMiwgbW9kZWwyKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IGZpcnN0IHNlc3Npb24gZmlsZSBpcyBkZWxldGVkXG5cdFx0XHRjb25zdCBleGlzdHMxQWZ0ZXIgPSBhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoc3RvcmFnZUxvY2F0aW9uMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzMUFmdGVyLCBmYWxzZSwgJ0ZpcnN0IHNlc3Npb24gZmlsZSBzaG91bGQgYmUgZGVsZXRlZCcpO1xuXG5cdFx0XHQvLyBWZXJpZnkgc2Vjb25kIHNlc3Npb24gZmlsZSBleGlzdHNcblx0XHRcdGNvbnN0IHN0b3JhZ2VMb2NhdGlvbjIgPSBVUkkuam9pblBhdGgoXG5cdFx0XHRcdHVzZXJEYXRhUHJvZmlsZS5nbG9iYWxTdG9yYWdlSG9tZSxcblx0XHRcdFx0J3RyYW5zZmVycmVkQ2hhdFNlc3Npb25zJyxcblx0XHRcdFx0J3RyYW5zZmVyLXNlc3Npb24tMi5qc29uJ1xuXHRcdFx0KTtcblx0XHRcdGNvbnN0IGV4aXN0czIgPSBhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoc3RvcmFnZUxvY2F0aW9uMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzMiwgdHJ1ZSwgJ1NlY29uZCBzZXNzaW9uIGZpbGUgc2hvdWxkIGV4aXN0Jyk7XG5cblx0XHRcdC8vIFZlcmlmeSBvbmx5IHRoZSBzZWNvbmQgc2Vzc2lvbiBpcyByZXRyaWV2YWJsZVxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuZ2V0VHJhbnNmZXJyZWRTZXNzaW9uRGF0YSgpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRvU3RyaW5nKCksIHNlc3Npb24yUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCd3b3Jrc3BhY2UgbWlncmF0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ21pZ3JhdGlvbiBpcyB0cmlnZ2VyZWQgd2hlbiBvbkRpZEVudGVyV29ya3NwYWNlIGZpcmVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKSBhcyBJbk1lbW9yeVRlc3RGaWxlU2VydmljZTtcblxuXHRcdFx0Ly8gQ3JlYXRlIHN0b3JlIHdpdGggZW1wdHkgd2luZG93XG5cdFx0XHRjb25zdCBzdG9yZSA9IGNyZWF0ZUNoYXRTZXNzaW9uU3RvcmUodHJ1ZSk7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoY3JlYXRlTW9ja0NoYXRNb2RlbChMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ3Nlc3Npb24tMScpKSk7XG5cblx0XHRcdC8vIFN0b3JlIGEgc2Vzc2lvbiBpbiBlbXB0eSB3aW5kb3dcblx0XHRcdGF3YWl0IHN0b3JlLnN0b3JlU2Vzc2lvbnMoW21vZGVsXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUuaGFzU2Vzc2lvbnMoKSwgdHJ1ZSk7XG5cblx0XHRcdC8vIEdldCB0aGUgZmlsZSBwYXRoIGZvciB0aGUgc2Vzc2lvbiBpbiBlbXB0eSB3aW5kb3cgc3RvcmFnZVxuXHRcdFx0Y29uc3QgZW1wdHlXaW5kb3dTdG9yYWdlUm9vdCA9IHN0b3JlLmdldENoYXRTdG9yYWdlRm9sZGVyKCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uRmlsZSA9IFVSSS5qb2luUGF0aChlbXB0eVdpbmRvd1N0b3JhZ2VSb290LCAnc2Vzc2lvbi0xLmpzb24nKTtcblx0XHRcdGNvbnN0IGZpbGVFeGlzdHMgPSBhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoc2Vzc2lvbkZpbGUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVFeGlzdHMsIHRydWUsICdTZXNzaW9uIGZpbGUgc2hvdWxkIGV4aXN0IGluIGVtcHR5IHdpbmRvdyBzdG9yYWdlJyk7XG5cblx0XHRcdC8vIFNpbXVsYXRlIHdvcmtzcGFjZSB0cmFuc2l0aW9uIHZpYSB0aGUgb25EaWRFbnRlcldvcmtzcGFjZSBldmVudFxuXHRcdFx0Y29uc3Qgb2xkV29ya3NwYWNlOiBJQW55V29ya3NwYWNlSWRlbnRpZmllciA9IHsgaWQ6ICdlbXB0eS13aW5kb3ctaWQnIH07XG5cdFx0XHRjb25zdCBuZXdXb3Jrc3BhY2U6IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyID0geyBpZDogVGVzdFdvcmtzcGFjZS5pZCwgdXJpOiBVUkkuZmlsZSgnL3Rlc3QvZm9sZGVyJykgfTtcblxuXHRcdFx0Ly8gRmlyZSB0aGUgd29ya3NwYWNlIHRyYW5zaXRpb24gZXZlbnQgLSBtaWdyYXRpb24gaGFwcGVucyBzeW5jaHJvbm91c2x5IHZpYSBqb2luKClcblx0XHRcdGF3YWl0IG1vY2tXb3Jrc3BhY2VFZGl0aW5nU2VydmljZS5maXJlV29ya3NwYWNlVHJhbnNpdGlvbihvbGRXb3Jrc3BhY2UsIG5ld1dvcmtzcGFjZSk7XG5cblx0XHRcdC8vIFZlcmlmeSBmaWxlIHdhcyBjb3BpZWQgdG8gbmV3IGxvY2F0aW9uXG5cdFx0XHRjb25zdCBuZXdTdG9yYWdlUm9vdCA9IHN0b3JlLmdldENoYXRTdG9yYWdlRm9sZGVyKCk7XG5cdFx0XHRjb25zdCBtaWdyYXRlZFNlc3Npb25GaWxlID0gVVJJLmpvaW5QYXRoKG5ld1N0b3JhZ2VSb290LCAnc2Vzc2lvbi0xLmpzb24nKTtcblx0XHRcdGNvbnN0IG1pZ3JhdGVkRmlsZUV4aXN0cyA9IGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhtaWdyYXRlZFNlc3Npb25GaWxlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaWdyYXRlZEZpbGVFeGlzdHMsIHRydWUsICdTZXNzaW9uIGZpbGUgc2hvdWxkIGJlIG1pZ3JhdGVkIHRvIHdvcmtzcGFjZSBzdG9yYWdlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtaWdyYXRpb24gaGFuZGxlcyBub24tZXhpc3RlbnQgb2xkIHN0b3JhZ2UgbG9jYXRpb24gZ3JhY2VmdWxseScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIENyZWF0ZSBzdG9yZSB3aXRoIGEgd29ya3NwYWNlXG5cdFx0XHRjb25zdCBzdG9yZSA9IGNyZWF0ZUNoYXRTZXNzaW9uU3RvcmUoZmFsc2UpO1xuXG5cdFx0XHQvLyBTaW11bGF0ZSB3b3Jrc3BhY2UgdHJhbnNpdGlvbiBmcm9tIGEgbm9uLWV4aXN0ZW50IHdvcmtzcGFjZVxuXHRcdFx0Y29uc3Qgb2xkV29ya3NwYWNlOiBJQW55V29ya3NwYWNlSWRlbnRpZmllciA9IHsgaWQ6ICdub24tZXhpc3RlbnQtd29ya3NwYWNlLWlkJyB9O1xuXHRcdFx0Y29uc3QgbmV3V29ya3NwYWNlOiBJQW55V29ya3NwYWNlSWRlbnRpZmllciA9IHsgaWQ6ICduZXctd29ya3NwYWNlLWlkJyB9O1xuXG5cdFx0XHQvLyBGaXJlIHRoZSB3b3Jrc3BhY2UgdHJhbnNpdGlvbiBldmVudCAtIHNob3VsZCBub3QgY3Jhc2hcblx0XHRcdGF3YWl0IG1vY2tXb3Jrc3BhY2VFZGl0aW5nU2VydmljZS5maXJlV29ya3NwYWNlVHJhbnNpdGlvbihvbGRXb3Jrc3BhY2UsIG5ld1dvcmtzcGFjZSk7XG5cblx0XHRcdC8vIFN0b3JlIHNob3VsZCB3b3JrIG5vcm1hbGx5XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUuaGFzU2Vzc2lvbnMoKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RvcmFnZSByb290IGlzIHVwZGF0ZWQgYWZ0ZXIgd29ya3NwYWNlIHRyYW5zaXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBDcmVhdGUgc3RvcmUgd2l0aCBlbXB0eSB3aW5kb3dcblx0XHRcdGNvbnN0IHN0b3JlID0gY3JlYXRlQ2hhdFNlc3Npb25TdG9yZSh0cnVlKTtcblxuXHRcdFx0Y29uc3QgaW5pdGlhbFN0b3JhZ2VSb290ID0gc3RvcmUuZ2V0Q2hhdFN0b3JhZ2VGb2xkZXIoKTtcblx0XHRcdGFzc2VydC5vayhpbml0aWFsU3RvcmFnZVJvb3QucGF0aC5pbmNsdWRlcygnZW1wdHlXaW5kb3dDaGF0U2Vzc2lvbnMnKSwgJ0luaXRpYWwgc3RvcmFnZSBzaG91bGQgYmUgZW1wdHkgd2luZG93IGxvY2F0aW9uJyk7XG5cblx0XHRcdC8vIFNpbXVsYXRlIHdvcmtzcGFjZSB0cmFuc2l0aW9uIC0gdXNlIHByb3BlciBpZGVudGlmaWVyIHR5cGVzXG5cdFx0XHQvLyBFbXB0eSB3b3Jrc3BhY2Ugb25seSBoYXMgJ2lkJywgc2luZ2xlIGZvbGRlciBoYXMgJ3VyaScgcHJvcGVydHkgdG9vXG5cdFx0XHRjb25zdCBvbGRXb3Jrc3BhY2U6IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyID0geyBpZDogJ2VtcHR5LXdpbmRvdy1pZCcgfTtcblx0XHRcdGNvbnN0IG5ld1dvcmtzcGFjZTogSUFueVdvcmtzcGFjZUlkZW50aWZpZXIgPSB7IGlkOiAnbmV3LXdvcmtzcGFjZS1pZCcsIHVyaTogVVJJLmZpbGUoJy90ZXN0L2ZvbGRlcicpIH07XG5cblx0XHRcdGF3YWl0IG1vY2tXb3Jrc3BhY2VFZGl0aW5nU2VydmljZS5maXJlV29ya3NwYWNlVHJhbnNpdGlvbihvbGRXb3Jrc3BhY2UsIG5ld1dvcmtzcGFjZSk7XG5cblx0XHRcdGNvbnN0IG5ld1N0b3JhZ2VSb290ID0gc3RvcmUuZ2V0Q2hhdFN0b3JhZ2VGb2xkZXIoKTtcblx0XHRcdGFzc2VydC5vayhuZXdTdG9yYWdlUm9vdC5wYXRoLmluY2x1ZGVzKCduZXctd29ya3NwYWNlLWlkJyksICdTdG9yYWdlIHJvb3Qgc2hvdWxkIGJlIHVwZGF0ZWQgdG8gbmV3IHdvcmtzcGFjZSBsb2NhdGlv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
