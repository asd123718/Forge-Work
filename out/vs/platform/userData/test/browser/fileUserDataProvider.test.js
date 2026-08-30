import assert from "assert";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { dirname, isEqual, joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { AbstractNativeEnvironmentService } from "../../../environment/common/environmentService.js";
import { FileService } from "../../../files/common/fileService.js";
import { FileChangeType, FileSystemProviderCapabilities } from "../../../files/common/files.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../log/common/log.js";
import product from "../../../product/common/product.js";
import { UriIdentityService } from "../../../uriIdentity/common/uriIdentityService.js";
import { FileUserDataProvider } from "../../common/fileUserDataProvider.js";
import { UserDataProfilesService } from "../../../userDataProfile/common/userDataProfile.js";
const ROOT = URI.file("tests").with({ scheme: "vscode-tests" });
class TestEnvironmentService extends AbstractNativeEnvironmentService {
  constructor(_appSettingsHome) {
    super(/* @__PURE__ */ Object.create(null), /* @__PURE__ */ Object.create(null), { _serviceBrand: void 0, ...product });
    this._appSettingsHome = _appSettingsHome;
  }
  get userRoamingDataHome() {
    return this._appSettingsHome.with({ scheme: Schemas.vscodeUserData });
  }
  get cacheHome() {
    return this.userRoamingDataHome;
  }
}
suite("FileUserDataProvider", () => {
  let testObject;
  let userDataHomeOnDisk;
  let backupWorkspaceHomeOnDisk;
  let environmentService;
  let userDataProfilesService;
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let fileUserDataProvider;
  setup(async () => {
    const logService = new NullLogService();
    testObject = disposables.add(new FileService(logService));
    const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(testObject.registerProvider(ROOT.scheme, fileSystemProvider));
    userDataHomeOnDisk = joinPath(ROOT, "User");
    const backupHome = joinPath(ROOT, "Backups");
    backupWorkspaceHomeOnDisk = joinPath(backupHome, "workspaceId");
    await testObject.createFolder(userDataHomeOnDisk);
    await testObject.createFolder(backupWorkspaceHomeOnDisk);
    environmentService = new TestEnvironmentService(userDataHomeOnDisk);
    const uriIdentityService = disposables.add(new UriIdentityService(testObject));
    userDataProfilesService = disposables.add(new UserDataProfilesService(environmentService, testObject, uriIdentityService, logService));
    fileUserDataProvider = disposables.add(new FileUserDataProvider(ROOT.scheme, fileSystemProvider, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, logService));
    disposables.add(fileUserDataProvider);
    disposables.add(testObject.registerProvider(Schemas.vscodeUserData, fileUserDataProvider));
  });
  test("exists return false when file does not exist", async () => {
    const exists = await testObject.exists(userDataProfilesService.defaultProfile.settingsResource);
    assert.strictEqual(exists, false);
  });
  test("read file throws error if not exist", async () => {
    try {
      await testObject.readFile(userDataProfilesService.defaultProfile.settingsResource);
      assert.fail("Should fail since file does not exist");
    } catch (e) {
    }
  });
  test("read existing file", async () => {
    await testObject.writeFile(joinPath(userDataHomeOnDisk, "settings.json"), VSBuffer.fromString("{}"));
    const result = await testObject.readFile(userDataProfilesService.defaultProfile.settingsResource);
    assert.strictEqual(result.value.toString(), "{}");
  });
  test("create file", async () => {
    const resource = userDataProfilesService.defaultProfile.settingsResource;
    const actual1 = await testObject.createFile(resource, VSBuffer.fromString("{}"));
    assert.strictEqual(actual1.resource.toString(), resource.toString());
    const actual2 = await testObject.readFile(joinPath(userDataHomeOnDisk, "settings.json"));
    assert.strictEqual(actual2.value.toString(), "{}");
  });
  test("write file creates the file if not exist", async () => {
    const resource = userDataProfilesService.defaultProfile.settingsResource;
    const actual1 = await testObject.writeFile(resource, VSBuffer.fromString("{}"));
    assert.strictEqual(actual1.resource.toString(), resource.toString());
    const actual2 = await testObject.readFile(joinPath(userDataHomeOnDisk, "settings.json"));
    assert.strictEqual(actual2.value.toString(), "{}");
  });
  test("write to existing file", async () => {
    const resource = userDataProfilesService.defaultProfile.settingsResource;
    await testObject.writeFile(joinPath(userDataHomeOnDisk, "settings.json"), VSBuffer.fromString("{}"));
    const actual1 = await testObject.writeFile(resource, VSBuffer.fromString("{a:1}"));
    assert.strictEqual(actual1.resource.toString(), resource.toString());
    const actual2 = await testObject.readFile(joinPath(userDataHomeOnDisk, "settings.json"));
    assert.strictEqual(actual2.value.toString(), "{a:1}");
  });
  test("delete file", async () => {
    await testObject.writeFile(joinPath(userDataHomeOnDisk, "settings.json"), VSBuffer.fromString(""));
    await testObject.del(userDataProfilesService.defaultProfile.settingsResource);
    const result = await testObject.exists(joinPath(userDataHomeOnDisk, "settings.json"));
    assert.strictEqual(false, result);
  });
  test("resolve file", async () => {
    await testObject.writeFile(joinPath(userDataHomeOnDisk, "settings.json"), VSBuffer.fromString(""));
    const result = await testObject.resolve(userDataProfilesService.defaultProfile.settingsResource);
    assert.ok(!result.isDirectory);
    assert.ok(result.children === void 0);
  });
  test("exists return false for folder that does not exist", async () => {
    const exists = await testObject.exists(userDataProfilesService.defaultProfile.snippetsHome);
    assert.strictEqual(exists, false);
  });
  test("exists return true for folder that exists", async () => {
    await testObject.createFolder(joinPath(userDataHomeOnDisk, "snippets"));
    const exists = await testObject.exists(userDataProfilesService.defaultProfile.snippetsHome);
    assert.strictEqual(exists, true);
  });
  test("read file throws error for folder", async () => {
    await testObject.createFolder(joinPath(userDataHomeOnDisk, "snippets"));
    try {
      await testObject.readFile(userDataProfilesService.defaultProfile.snippetsHome);
      assert.fail("Should fail since read file is not supported for folders");
    } catch (e) {
    }
  });
  test("read file under folder", async () => {
    await testObject.createFolder(joinPath(userDataHomeOnDisk, "snippets"));
    await testObject.writeFile(joinPath(userDataHomeOnDisk, "snippets", "settings.json"), VSBuffer.fromString("{}"));
    const resource = joinPath(userDataProfilesService.defaultProfile.snippetsHome, "settings.json");
    const actual = await testObject.readFile(resource);
    assert.strictEqual(actual.resource.toString(), resource.toString());
    assert.strictEqual(actual.value.toString(), "{}");
  });
  test("read file under sub folder", async () => {
    await testObject.createFolder(joinPath(userDataHomeOnDisk, "snippets", "java"));
    await testObject.writeFile(joinPath(userDataHomeOnDisk, "snippets", "java", "settings.json"), VSBuffer.fromString("{}"));
    const resource = joinPath(userDataProfilesService.defaultProfile.snippetsHome, "java/settings.json");
    const actual = await testObject.readFile(resource);
    assert.strictEqual(actual.resource.toString(), resource.toString());
    assert.strictEqual(actual.value.toString(), "{}");
  });
  test("create file under folder that exists", async () => {
    await testObject.createFolder(joinPath(userDataHomeOnDisk, "snippets"));
    const resource = joinPath(userDataProfilesService.defaultProfile.snippetsHome, "settings.json");
    const actual1 = await testObject.createFile(resource, VSBuffer.fromString("{}"));
    assert.strictEqual(actual1.resource.toString(), resource.toString());
    const actual2 = await testObject.readFile(joinPath(userDataHomeOnDisk, "snippets", "settings.json"));
    assert.strictEqual(actual2.value.toString(), "{}");
  });
  test("create file under folder that does not exist", async () => {
    const resource = joinPath(userDataProfilesService.defaultProfile.snippetsHome, "settings.json");
    const actual1 = await testObject.createFile(resource, VSBuffer.fromString("{}"));
    assert.strictEqual(actual1.resource.toString(), resource.toString());
    const actual2 = await testObject.readFile(joinPath(userDataHomeOnDisk, "snippets", "settings.json"));
    assert.strictEqual(actual2.value.toString(), "{}");
  });
  test("write to not existing file under container that exists", async () => {
    await testObject.createFolder(joinPath(userDataHomeOnDisk, "snippets"));
    const resource = joinPath(userDataProfilesService.defaultProfile.snippetsHome, "settings.json");
    const actual1 = await testObject.writeFile(resource, VSBuffer.fromString("{}"));
    assert.strictEqual(actual1.resource.toString(), resource.toString());
    const actual = await testObject.readFile(joinPath(userDataHomeOnDisk, "snippets", "settings.json"));
    assert.strictEqual(actual.value.toString(), "{}");
  });
  test("write to not existing file under container that does not exists", async () => {
    const resource = joinPath(userDataProfilesService.defaultProfile.snippetsHome, "settings.json");
    const actual1 = await testObject.writeFile(resource, VSBuffer.fromString("{}"));
    assert.strictEqual(actual1.resource.toString(), resource.toString());
    const actual = await testObject.readFile(joinPath(userDataHomeOnDisk, "snippets", "settings.json"));
    assert.strictEqual(actual.value.toString(), "{}");
  });
  test("write to existing file under container", async () => {
    await testObject.createFolder(joinPath(userDataHomeOnDisk, "snippets"));
    await testObject.writeFile(joinPath(userDataHomeOnDisk, "snippets", "settings.json"), VSBuffer.fromString("{}"));
    const resource = joinPath(userDataProfilesService.defaultProfile.snippetsHome, "settings.json");
    const actual1 = await testObject.writeFile(resource, VSBuffer.fromString("{a:1}"));
    assert.strictEqual(actual1.resource.toString(), resource.toString());
    const actual = await testObject.readFile(joinPath(userDataHomeOnDisk, "snippets", "settings.json"));
    assert.strictEqual(actual.value.toString(), "{a:1}");
  });
  test("write file under sub container", async () => {
    const resource = joinPath(userDataProfilesService.defaultProfile.snippetsHome, "java/settings.json");
    const actual1 = await testObject.writeFile(resource, VSBuffer.fromString("{}"));
    assert.strictEqual(actual1.resource.toString(), resource.toString());
    const actual = await testObject.readFile(joinPath(userDataHomeOnDisk, "snippets", "java", "settings.json"));
    assert.strictEqual(actual.value.toString(), "{}");
  });
  test("delete throws error for folder that does not exist", async () => {
    try {
      await testObject.del(userDataProfilesService.defaultProfile.snippetsHome);
      assert.fail("Should fail the folder does not exist");
    } catch (e) {
    }
  });
  test("delete not existing file under container that exists", async () => {
    await testObject.createFolder(joinPath(userDataHomeOnDisk, "snippets"));
    try {
      await testObject.del(joinPath(userDataProfilesService.defaultProfile.snippetsHome, "settings.json"));
      assert.fail("Should fail since file does not exist");
    } catch (e) {
    }
  });
  test("delete not existing file under container that does not exists", async () => {
    try {
      await testObject.del(joinPath(userDataProfilesService.defaultProfile.snippetsHome, "settings.json"));
      assert.fail("Should fail since file does not exist");
    } catch (e) {
    }
  });
  test("delete existing file under folder", async () => {
    await testObject.createFolder(joinPath(userDataHomeOnDisk, "snippets"));
    await testObject.writeFile(joinPath(userDataHomeOnDisk, "snippets", "settings.json"), VSBuffer.fromString("{}"));
    await testObject.del(joinPath(userDataProfilesService.defaultProfile.snippetsHome, "settings.json"));
    const exists = await testObject.exists(joinPath(userDataHomeOnDisk, "snippets", "settings.json"));
    assert.strictEqual(exists, false);
  });
  test("resolve folder", async () => {
    await testObject.createFolder(joinPath(userDataHomeOnDisk, "snippets"));
    await testObject.writeFile(joinPath(userDataHomeOnDisk, "snippets", "settings.json"), VSBuffer.fromString("{}"));
    const result = await testObject.resolve(userDataProfilesService.defaultProfile.snippetsHome);
    assert.ok(result.isDirectory);
    assert.ok(result.children !== void 0);
    assert.strictEqual(result.children.length, 1);
    assert.strictEqual(result.children[0].resource.toString(), joinPath(userDataProfilesService.defaultProfile.snippetsHome, "settings.json").toString());
  });
  test("read backup file", async () => {
    await testObject.writeFile(joinPath(backupWorkspaceHomeOnDisk, "backup.json"), VSBuffer.fromString("{}"));
    const result = await testObject.readFile(joinPath(backupWorkspaceHomeOnDisk.with({ scheme: environmentService.userRoamingDataHome.scheme }), `backup.json`));
    assert.strictEqual(result.value.toString(), "{}");
  });
  test("create backup file", async () => {
    await testObject.createFile(joinPath(backupWorkspaceHomeOnDisk.with({ scheme: environmentService.userRoamingDataHome.scheme }), `backup.json`), VSBuffer.fromString("{}"));
    const result = await testObject.readFile(joinPath(backupWorkspaceHomeOnDisk, "backup.json"));
    assert.strictEqual(result.value.toString(), "{}");
  });
  test("write backup file", async () => {
    await testObject.writeFile(joinPath(backupWorkspaceHomeOnDisk, "backup.json"), VSBuffer.fromString("{}"));
    await testObject.writeFile(joinPath(backupWorkspaceHomeOnDisk.with({ scheme: environmentService.userRoamingDataHome.scheme }), `backup.json`), VSBuffer.fromString("{a:1}"));
    const result = await testObject.readFile(joinPath(backupWorkspaceHomeOnDisk, "backup.json"));
    assert.strictEqual(result.value.toString(), "{a:1}");
  });
  test("resolve backups folder", async () => {
    await testObject.writeFile(joinPath(backupWorkspaceHomeOnDisk, "backup.json"), VSBuffer.fromString("{}"));
    const result = await testObject.resolve(backupWorkspaceHomeOnDisk.with({ scheme: environmentService.userRoamingDataHome.scheme }));
    assert.ok(result.isDirectory);
    assert.ok(result.children !== void 0);
    assert.strictEqual(result.children.length, 1);
    assert.strictEqual(result.children[0].resource.toString(), joinPath(backupWorkspaceHomeOnDisk.with({ scheme: environmentService.userRoamingDataHome.scheme }), `backup.json`).toString());
  });
});
class TestFileSystemProvider {
  constructor(onDidChangeFile) {
    this.onDidChangeFile = onDidChangeFile;
    this.capabilities = FileSystemProviderCapabilities.FileReadWrite;
    this.onDidChangeCapabilities = Event.None;
  }
  watch() {
    return Disposable.None;
  }
  stat() {
    throw new Error("Not Supported");
  }
  mkdir(resource) {
    throw new Error("Not Supported");
  }
  rename() {
    throw new Error("Not Supported");
  }
  readFile(resource) {
    throw new Error("Not Supported");
  }
  readdir(resource) {
    throw new Error("Not Supported");
  }
  writeFile() {
    throw new Error("Not Supported");
  }
  delete() {
    throw new Error("Not Supported");
  }
  open(resource, opts) {
    throw new Error("Not Supported");
  }
  close(fd) {
    throw new Error("Not Supported");
  }
  read(fd, pos, data, offset, length) {
    throw new Error("Not Supported");
  }
  write(fd, pos, data, offset, length) {
    throw new Error("Not Supported");
  }
  readFileStream(resource, opts, token) {
    throw new Error("Method not implemented.");
  }
}
suite("FileUserDataProvider - Watching", () => {
  let testObject;
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const rootFileResource = joinPath(ROOT, "User");
  const rootUserDataResource = rootFileResource.with({ scheme: Schemas.vscodeUserData });
  let fileEventEmitter;
  setup(() => {
    const logService = new NullLogService();
    const fileService = disposables.add(new FileService(logService));
    const environmentService = new TestEnvironmentService(rootFileResource);
    const uriIdentityService = disposables.add(new UriIdentityService(fileService));
    const userDataProfilesService = disposables.add(new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService));
    fileEventEmitter = disposables.add(new Emitter());
    testObject = disposables.add(new FileUserDataProvider(rootFileResource.scheme, new TestFileSystemProvider(fileEventEmitter.event), Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, new NullLogService()));
  });
  test("file added change event", (done) => {
    disposables.add(testObject.watch(rootUserDataResource, { excludes: [], recursive: false }));
    const expected = joinPath(rootUserDataResource, "settings.json");
    const target = joinPath(rootFileResource, "settings.json");
    disposables.add(testObject.onDidChangeFile((e) => {
      if (isEqual(e[0].resource, expected) && e[0].type === FileChangeType.ADDED) {
        done();
      }
    }));
    fileEventEmitter.fire([{
      resource: target,
      type: FileChangeType.ADDED
    }]);
  });
  test("file updated change event", (done) => {
    disposables.add(testObject.watch(rootUserDataResource, { excludes: [], recursive: false }));
    const expected = joinPath(rootUserDataResource, "settings.json");
    const target = joinPath(rootFileResource, "settings.json");
    disposables.add(testObject.onDidChangeFile((e) => {
      if (isEqual(e[0].resource, expected) && e[0].type === FileChangeType.UPDATED) {
        done();
      }
    }));
    fileEventEmitter.fire([{
      resource: target,
      type: FileChangeType.UPDATED
    }]);
  });
  test("file deleted change event", (done) => {
    disposables.add(testObject.watch(rootUserDataResource, { excludes: [], recursive: false }));
    const expected = joinPath(rootUserDataResource, "settings.json");
    const target = joinPath(rootFileResource, "settings.json");
    disposables.add(testObject.onDidChangeFile((e) => {
      if (isEqual(e[0].resource, expected) && e[0].type === FileChangeType.DELETED) {
        done();
      }
    }));
    fileEventEmitter.fire([{
      resource: target,
      type: FileChangeType.DELETED
    }]);
  });
  test("file under folder created change event", (done) => {
    disposables.add(testObject.watch(rootUserDataResource, { excludes: [], recursive: false }));
    const expected = joinPath(rootUserDataResource, "snippets", "settings.json");
    const target = joinPath(rootFileResource, "snippets", "settings.json");
    disposables.add(testObject.onDidChangeFile((e) => {
      if (isEqual(e[0].resource, expected) && e[0].type === FileChangeType.ADDED) {
        done();
      }
    }));
    fileEventEmitter.fire([{
      resource: target,
      type: FileChangeType.ADDED
    }]);
  });
  test("file under folder updated change event", (done) => {
    disposables.add(testObject.watch(rootUserDataResource, { excludes: [], recursive: false }));
    const expected = joinPath(rootUserDataResource, "snippets", "settings.json");
    const target = joinPath(rootFileResource, "snippets", "settings.json");
    disposables.add(testObject.onDidChangeFile((e) => {
      if (isEqual(e[0].resource, expected) && e[0].type === FileChangeType.UPDATED) {
        done();
      }
    }));
    fileEventEmitter.fire([{
      resource: target,
      type: FileChangeType.UPDATED
    }]);
  });
  test("file under folder deleted change event", (done) => {
    disposables.add(testObject.watch(rootUserDataResource, { excludes: [], recursive: false }));
    const expected = joinPath(rootUserDataResource, "snippets", "settings.json");
    const target = joinPath(rootFileResource, "snippets", "settings.json");
    disposables.add(testObject.onDidChangeFile((e) => {
      if (isEqual(e[0].resource, expected) && e[0].type === FileChangeType.DELETED) {
        done();
      }
    }));
    fileEventEmitter.fire([{
      resource: target,
      type: FileChangeType.DELETED
    }]);
  });
  test("event is not triggered if not watched", async () => {
    const target = joinPath(rootFileResource, "settings.json");
    let triggered = false;
    disposables.add(testObject.onDidChangeFile(() => triggered = true));
    fileEventEmitter.fire([{
      resource: target,
      type: FileChangeType.DELETED
    }]);
    if (triggered) {
      assert.fail("event should not be triggered");
    }
  });
  test("event is not triggered if not watched 2", async () => {
    disposables.add(testObject.watch(rootUserDataResource, { excludes: [], recursive: false }));
    const target = joinPath(dirname(rootFileResource), "settings.json");
    let triggered = false;
    disposables.add(testObject.onDidChangeFile(() => triggered = true));
    fileEventEmitter.fire([{
      resource: target,
      type: FileChangeType.DELETED
    }]);
    if (triggered) {
      assert.fail("event should not be triggered");
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFcXHRlc3RcXGJyb3dzZXJcXGZpbGVVc2VyRGF0YVByb3ZpZGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGRpcm5hbWUsIGlzRXF1YWwsIGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFJlYWRhYmxlU3RyZWFtRXZlbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyZWFtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3ROYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEZpbGVDaGFuZ2VUeXBlLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMsIEZpbGVUeXBlLCBJRmlsZUNoYW5nZSwgSUZpbGVPcGVuT3B0aW9ucywgSUZpbGVSZWFkU3RyZWFtT3B0aW9ucywgSUZpbGVTZXJ2aWNlLCBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFkU3RyZWFtQ2FwYWJpbGl0eSwgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFdyaXRlQ2FwYWJpbGl0eSwgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5LCBJU3RhdCB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBGaWxlVXNlckRhdGFQcm92aWRlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9maWxlVXNlckRhdGFQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsIFVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuXG5jb25zdCBST09UID0gVVJJLmZpbGUoJ3Rlc3RzJykud2l0aCh7IHNjaGVtZTogJ3ZzY29kZS10ZXN0cycgfSk7XG5cbmNsYXNzIFRlc3RFbnZpcm9ubWVudFNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdE5hdGl2ZUVudmlyb25tZW50U2VydmljZSB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX2FwcFNldHRpbmdzSG9tZTogVVJJKSB7XG5cdFx0c3VwZXIoT2JqZWN0LmNyZWF0ZShudWxsKSwgT2JqZWN0LmNyZWF0ZShudWxsKSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIC4uLnByb2R1Y3QgfSk7XG5cdH1cblx0b3ZlcnJpZGUgZ2V0IHVzZXJSb2FtaW5nRGF0YUhvbWUoKSB7IHJldHVybiB0aGlzLl9hcHBTZXR0aW5nc0hvbWUud2l0aCh7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVVc2VyRGF0YSB9KTsgfVxuXHRvdmVycmlkZSBnZXQgY2FjaGVIb21lKCkgeyByZXR1cm4gdGhpcy51c2VyUm9hbWluZ0RhdGFIb21lOyB9XG59XG5cbnN1aXRlKCdGaWxlVXNlckRhdGFQcm92aWRlcicsICgpID0+IHtcblxuXHRsZXQgdGVzdE9iamVjdDogSUZpbGVTZXJ2aWNlO1xuXHRsZXQgdXNlckRhdGFIb21lT25EaXNrOiBVUkk7XG5cdGxldCBiYWNrdXBXb3Jrc3BhY2VIb21lT25EaXNrOiBVUkk7XG5cdGxldCBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2U7XG5cdGxldCB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlO1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRsZXQgZmlsZVVzZXJEYXRhUHJvdmlkZXI6IEZpbGVVc2VyRGF0YVByb3ZpZGVyO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0dGVzdE9iamVjdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IGZpbGVTeXN0ZW1Qcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRlc3RPYmplY3QucmVnaXN0ZXJQcm92aWRlcihST09ULnNjaGVtZSwgZmlsZVN5c3RlbVByb3ZpZGVyKSk7XG5cblx0XHR1c2VyRGF0YUhvbWVPbkRpc2sgPSBqb2luUGF0aChST09ULCAnVXNlcicpO1xuXHRcdGNvbnN0IGJhY2t1cEhvbWUgPSBqb2luUGF0aChST09ULCAnQmFja3VwcycpO1xuXHRcdGJhY2t1cFdvcmtzcGFjZUhvbWVPbkRpc2sgPSBqb2luUGF0aChiYWNrdXBIb21lLCAnd29ya3NwYWNlSWQnKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmNyZWF0ZUZvbGRlcih1c2VyRGF0YUhvbWVPbkRpc2spO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuY3JlYXRlRm9sZGVyKGJhY2t1cFdvcmtzcGFjZUhvbWVPbkRpc2spO1xuXG5cdFx0ZW52aXJvbm1lbnRTZXJ2aWNlID0gbmV3IFRlc3RFbnZpcm9ubWVudFNlcnZpY2UodXNlckRhdGFIb21lT25EaXNrKTtcblx0XHRjb25zdCB1cmlJZGVudGl0eVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFVyaUlkZW50aXR5U2VydmljZSh0ZXN0T2JqZWN0KSk7XG5cdFx0dXNlckRhdGFQcm9maWxlc1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKGVudmlyb25tZW50U2VydmljZSwgdGVzdE9iamVjdCwgdXJpSWRlbnRpdHlTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cblx0XHRmaWxlVXNlckRhdGFQcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVVzZXJEYXRhUHJvdmlkZXIoUk9PVC5zY2hlbWUsIGZpbGVTeXN0ZW1Qcm92aWRlciwgU2NoZW1hcy52c2NvZGVVc2VyRGF0YSwgdXNlckRhdGFQcm9maWxlc1NlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSwgbG9nU2VydmljZSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlVXNlckRhdGFQcm92aWRlcik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRlc3RPYmplY3QucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLnZzY29kZVVzZXJEYXRhLCBmaWxlVXNlckRhdGFQcm92aWRlcikpO1xuXHR9KTtcblxuXHR0ZXN0KCdleGlzdHMgcmV0dXJuIGZhbHNlIHdoZW4gZmlsZSBkb2VzIG5vdCBleGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBleGlzdHMgPSBhd2FpdCB0ZXN0T2JqZWN0LmV4aXN0cyh1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zZXR0aW5nc1Jlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWQgZmlsZSB0aHJvd3MgZXJyb3IgaWYgbm90IGV4aXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnJlYWRGaWxlKHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNldHRpbmdzUmVzb3VyY2UpO1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ1Nob3VsZCBmYWlsIHNpbmNlIGZpbGUgZG9lcyBub3QgZXhpc3QnKTtcblx0XHR9IGNhdGNoIChlKSB7IH1cblx0fSk7XG5cblx0dGVzdCgncmVhZCBleGlzdGluZyBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRlc3RPYmplY3Qud3JpdGVGaWxlKGpvaW5QYXRoKHVzZXJEYXRhSG9tZU9uRGlzaywgJ3NldHRpbmdzLmpzb24nKSwgVlNCdWZmZXIuZnJvbVN0cmluZygne30nKSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVzdE9iamVjdC5yZWFkRmlsZSh1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zZXR0aW5nc1Jlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnZhbHVlLnRvU3RyaW5nKCksICd7fScpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGUgZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNldHRpbmdzUmVzb3VyY2U7XG5cdFx0Y29uc3QgYWN0dWFsMSA9IGF3YWl0IHRlc3RPYmplY3QuY3JlYXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygne30nKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEucmVzb3VyY2UudG9TdHJpbmcoKSwgcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0Y29uc3QgYWN0dWFsMiA9IGF3YWl0IHRlc3RPYmplY3QucmVhZEZpbGUoam9pblBhdGgodXNlckRhdGFIb21lT25EaXNrLCAnc2V0dGluZ3MuanNvbicpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi52YWx1ZS50b1N0cmluZygpLCAne30nKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGUgZmlsZSBjcmVhdGVzIHRoZSBmaWxlIGlmIG5vdCBleGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNldHRpbmdzUmVzb3VyY2U7XG5cdFx0Y29uc3QgYWN0dWFsMSA9IGF3YWl0IHRlc3RPYmplY3Qud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7fScpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMS5yZXNvdXJjZS50b1N0cmluZygpLCByZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRjb25zdCBhY3R1YWwyID0gYXdhaXQgdGVzdE9iamVjdC5yZWFkRmlsZShqb2luUGF0aCh1c2VyRGF0YUhvbWVPbkRpc2ssICdzZXR0aW5ncy5qc29uJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLnZhbHVlLnRvU3RyaW5nKCksICd7fScpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZSB0byBleGlzdGluZyBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gdXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LndyaXRlRmlsZShqb2luUGF0aCh1c2VyRGF0YUhvbWVPbkRpc2ssICdzZXR0aW5ncy5qc29uJyksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3t9JykpO1xuXHRcdGNvbnN0IGFjdHVhbDEgPSBhd2FpdCB0ZXN0T2JqZWN0LndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygne2E6MX0nKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEucmVzb3VyY2UudG9TdHJpbmcoKSwgcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0Y29uc3QgYWN0dWFsMiA9IGF3YWl0IHRlc3RPYmplY3QucmVhZEZpbGUoam9pblBhdGgodXNlckRhdGFIb21lT25EaXNrLCAnc2V0dGluZ3MuanNvbicpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi52YWx1ZS50b1N0cmluZygpLCAne2E6MX0nKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlIGZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC53cml0ZUZpbGUoam9pblBhdGgodXNlckRhdGFIb21lT25EaXNrLCAnc2V0dGluZ3MuanNvbicpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCcnKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5kZWwodXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVzdE9iamVjdC5leGlzdHMoam9pblBhdGgodXNlckRhdGFIb21lT25EaXNrLCAnc2V0dGluZ3MuanNvbicpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFsc2UsIHJlc3VsdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmUgZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LndyaXRlRmlsZShqb2luUGF0aCh1c2VyRGF0YUhvbWVPbkRpc2ssICdzZXR0aW5ncy5qc29uJyksIFZTQnVmZmVyLmZyb21TdHJpbmcoJycpKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXN0T2JqZWN0LnJlc29sdmUodXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZSk7XG5cdFx0YXNzZXJ0Lm9rKCFyZXN1bHQuaXNEaXJlY3RvcnkpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuY2hpbGRyZW4gPT09IHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4aXN0cyByZXR1cm4gZmFsc2UgZm9yIGZvbGRlciB0aGF0IGRvZXMgbm90IGV4aXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV4aXN0cyA9IGF3YWl0IHRlc3RPYmplY3QuZXhpc3RzKHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNuaXBwZXRzSG9tZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0cywgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdleGlzdHMgcmV0dXJuIHRydWUgZm9yIGZvbGRlciB0aGF0IGV4aXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmNyZWF0ZUZvbGRlcihqb2luUGF0aCh1c2VyRGF0YUhvbWVPbkRpc2ssICdzbmlwcGV0cycpKTtcblx0XHRjb25zdCBleGlzdHMgPSBhd2FpdCB0ZXN0T2JqZWN0LmV4aXN0cyh1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zbmlwcGV0c0hvbWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHMsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkIGZpbGUgdGhyb3dzIGVycm9yIGZvciBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5jcmVhdGVGb2xkZXIoam9pblBhdGgodXNlckRhdGFIb21lT25EaXNrLCAnc25pcHBldHMnKSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3QucmVhZEZpbGUodXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc25pcHBldHNIb21lKTtcblx0XHRcdGFzc2VydC5mYWlsKCdTaG91bGQgZmFpbCBzaW5jZSByZWFkIGZpbGUgaXMgbm90IHN1cHBvcnRlZCBmb3IgZm9sZGVycycpO1xuXHRcdH0gY2F0Y2ggKGUpIHsgfVxuXHR9KTtcblxuXHR0ZXN0KCdyZWFkIGZpbGUgdW5kZXIgZm9sZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuY3JlYXRlRm9sZGVyKGpvaW5QYXRoKHVzZXJEYXRhSG9tZU9uRGlzaywgJ3NuaXBwZXRzJykpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Qud3JpdGVGaWxlKGpvaW5QYXRoKHVzZXJEYXRhSG9tZU9uRGlzaywgJ3NuaXBwZXRzJywgJ3NldHRpbmdzLmpzb24nKSwgVlNCdWZmZXIuZnJvbVN0cmluZygne30nKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBqb2luUGF0aCh1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zbmlwcGV0c0hvbWUsICdzZXR0aW5ncy5qc29uJyk7XG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgdGVzdE9iamVjdC5yZWFkRmlsZShyZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5yZXNvdXJjZS50b1N0cmluZygpLCByZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnZhbHVlLnRvU3RyaW5nKCksICd7fScpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkIGZpbGUgdW5kZXIgc3ViIGZvbGRlcicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmNyZWF0ZUZvbGRlcihqb2luUGF0aCh1c2VyRGF0YUhvbWVPbkRpc2ssICdzbmlwcGV0cycsICdqYXZhJykpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Qud3JpdGVGaWxlKGpvaW5QYXRoKHVzZXJEYXRhSG9tZU9uRGlzaywgJ3NuaXBwZXRzJywgJ2phdmEnLCAnc2V0dGluZ3MuanNvbicpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7fScpKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IGpvaW5QYXRoKHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNuaXBwZXRzSG9tZSwgJ2phdmEvc2V0dGluZ3MuanNvbicpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IHRlc3RPYmplY3QucmVhZEZpbGUocmVzb3VyY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVzb3VyY2UudG9TdHJpbmcoKSwgcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC52YWx1ZS50b1N0cmluZygpLCAne30nKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlIGZpbGUgdW5kZXIgZm9sZGVyIHRoYXQgZXhpc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuY3JlYXRlRm9sZGVyKGpvaW5QYXRoKHVzZXJEYXRhSG9tZU9uRGlzaywgJ3NuaXBwZXRzJykpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gam9pblBhdGgodXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc25pcHBldHNIb21lLCAnc2V0dGluZ3MuanNvbicpO1xuXHRcdGNvbnN0IGFjdHVhbDEgPSBhd2FpdCB0ZXN0T2JqZWN0LmNyZWF0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3t9JykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLnJlc291cmNlLnRvU3RyaW5nKCksIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGNvbnN0IGFjdHVhbDIgPSBhd2FpdCB0ZXN0T2JqZWN0LnJlYWRGaWxlKGpvaW5QYXRoKHVzZXJEYXRhSG9tZU9uRGlzaywgJ3NuaXBwZXRzJywgJ3NldHRpbmdzLmpzb24nKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIudmFsdWUudG9TdHJpbmcoKSwgJ3t9Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZSBmaWxlIHVuZGVyIGZvbGRlciB0aGF0IGRvZXMgbm90IGV4aXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gam9pblBhdGgodXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc25pcHBldHNIb21lLCAnc2V0dGluZ3MuanNvbicpO1xuXHRcdGNvbnN0IGFjdHVhbDEgPSBhd2FpdCB0ZXN0T2JqZWN0LmNyZWF0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3t9JykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLnJlc291cmNlLnRvU3RyaW5nKCksIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGNvbnN0IGFjdHVhbDIgPSBhd2FpdCB0ZXN0T2JqZWN0LnJlYWRGaWxlKGpvaW5QYXRoKHVzZXJEYXRhSG9tZU9uRGlzaywgJ3NuaXBwZXRzJywgJ3NldHRpbmdzLmpzb24nKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIudmFsdWUudG9TdHJpbmcoKSwgJ3t9Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlIHRvIG5vdCBleGlzdGluZyBmaWxlIHVuZGVyIGNvbnRhaW5lciB0aGF0IGV4aXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmNyZWF0ZUZvbGRlcihqb2luUGF0aCh1c2VyRGF0YUhvbWVPbkRpc2ssICdzbmlwcGV0cycpKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IGpvaW5QYXRoKHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNuaXBwZXRzSG9tZSwgJ3NldHRpbmdzLmpzb24nKTtcblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgdGVzdE9iamVjdC53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3t9JykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLnJlc291cmNlLnRvU3RyaW5nKCksIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IHRlc3RPYmplY3QucmVhZEZpbGUoam9pblBhdGgodXNlckRhdGFIb21lT25EaXNrLCAnc25pcHBldHMnLCAnc2V0dGluZ3MuanNvbicpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnZhbHVlLnRvU3RyaW5nKCksICd7fScpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZSB0byBub3QgZXhpc3RpbmcgZmlsZSB1bmRlciBjb250YWluZXIgdGhhdCBkb2VzIG5vdCBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBqb2luUGF0aCh1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zbmlwcGV0c0hvbWUsICdzZXR0aW5ncy5qc29uJyk7XG5cdFx0Y29uc3QgYWN0dWFsMSA9IGF3YWl0IHRlc3RPYmplY3Qud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7fScpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMS5yZXNvdXJjZS50b1N0cmluZygpLCByZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCB0ZXN0T2JqZWN0LnJlYWRGaWxlKGpvaW5QYXRoKHVzZXJEYXRhSG9tZU9uRGlzaywgJ3NuaXBwZXRzJywgJ3NldHRpbmdzLmpzb24nKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC52YWx1ZS50b1N0cmluZygpLCAne30nKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGUgdG8gZXhpc3RpbmcgZmlsZSB1bmRlciBjb250YWluZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5jcmVhdGVGb2xkZXIoam9pblBhdGgodXNlckRhdGFIb21lT25EaXNrLCAnc25pcHBldHMnKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC53cml0ZUZpbGUoam9pblBhdGgodXNlckRhdGFIb21lT25EaXNrLCAnc25pcHBldHMnLCAnc2V0dGluZ3MuanNvbicpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7fScpKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IGpvaW5QYXRoKHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNuaXBwZXRzSG9tZSwgJ3NldHRpbmdzLmpzb24nKTtcblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgdGVzdE9iamVjdC53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3thOjF9JykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLnJlc291cmNlLnRvU3RyaW5nKCksIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IHRlc3RPYmplY3QucmVhZEZpbGUoam9pblBhdGgodXNlckRhdGFIb21lT25EaXNrLCAnc25pcHBldHMnLCAnc2V0dGluZ3MuanNvbicpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnZhbHVlLnRvU3RyaW5nKCksICd7YToxfScpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZSBmaWxlIHVuZGVyIHN1YiBjb250YWluZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBqb2luUGF0aCh1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zbmlwcGV0c0hvbWUsICdqYXZhL3NldHRpbmdzLmpzb24nKTtcblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgdGVzdE9iamVjdC53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3t9JykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLnJlc291cmNlLnRvU3RyaW5nKCksIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IHRlc3RPYmplY3QucmVhZEZpbGUoam9pblBhdGgodXNlckRhdGFIb21lT25EaXNrLCAnc25pcHBldHMnLCAnamF2YScsICdzZXR0aW5ncy5qc29uJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwudmFsdWUudG9TdHJpbmcoKSwgJ3t9Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZSB0aHJvd3MgZXJyb3IgZm9yIGZvbGRlciB0aGF0IGRvZXMgbm90IGV4aXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LmRlbCh1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zbmlwcGV0c0hvbWUpO1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ1Nob3VsZCBmYWlsIHRoZSBmb2xkZXIgZG9lcyBub3QgZXhpc3QnKTtcblx0XHR9IGNhdGNoIChlKSB7IH1cblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlIG5vdCBleGlzdGluZyBmaWxlIHVuZGVyIGNvbnRhaW5lciB0aGF0IGV4aXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmNyZWF0ZUZvbGRlcihqb2luUGF0aCh1c2VyRGF0YUhvbWVPbkRpc2ssICdzbmlwcGV0cycpKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5kZWwoam9pblBhdGgodXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc25pcHBldHNIb21lLCAnc2V0dGluZ3MuanNvbicpKTtcblx0XHRcdGFzc2VydC5mYWlsKCdTaG91bGQgZmFpbCBzaW5jZSBmaWxlIGRvZXMgbm90IGV4aXN0Jyk7XG5cdFx0fSBjYXRjaCAoZSkgeyB9XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZSBub3QgZXhpc3RpbmcgZmlsZSB1bmRlciBjb250YWluZXIgdGhhdCBkb2VzIG5vdCBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3QuZGVsKGpvaW5QYXRoKHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNuaXBwZXRzSG9tZSwgJ3NldHRpbmdzLmpzb24nKSk7XG5cdFx0XHRhc3NlcnQuZmFpbCgnU2hvdWxkIGZhaWwgc2luY2UgZmlsZSBkb2VzIG5vdCBleGlzdCcpO1xuXHRcdH0gY2F0Y2ggKGUpIHsgfVxuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGUgZXhpc3RpbmcgZmlsZSB1bmRlciBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5jcmVhdGVGb2xkZXIoam9pblBhdGgodXNlckRhdGFIb21lT25EaXNrLCAnc25pcHBldHMnKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC53cml0ZUZpbGUoam9pblBhdGgodXNlckRhdGFIb21lT25EaXNrLCAnc25pcHBldHMnLCAnc2V0dGluZ3MuanNvbicpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7fScpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmRlbChqb2luUGF0aCh1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zbmlwcGV0c0hvbWUsICdzZXR0aW5ncy5qc29uJykpO1xuXHRcdGNvbnN0IGV4aXN0cyA9IGF3YWl0IHRlc3RPYmplY3QuZXhpc3RzKGpvaW5QYXRoKHVzZXJEYXRhSG9tZU9uRGlzaywgJ3NuaXBwZXRzJywgJ3NldHRpbmdzLmpzb24nKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0cywgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlIGZvbGRlcicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmNyZWF0ZUZvbGRlcihqb2luUGF0aCh1c2VyRGF0YUhvbWVPbkRpc2ssICdzbmlwcGV0cycpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LndyaXRlRmlsZShqb2luUGF0aCh1c2VyRGF0YUhvbWVPbkRpc2ssICdzbmlwcGV0cycsICdzZXR0aW5ncy5qc29uJyksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3t9JykpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlc3RPYmplY3QucmVzb2x2ZSh1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zbmlwcGV0c0hvbWUpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaXNEaXJlY3RvcnkpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuY2hpbGRyZW4gIT09IHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jaGlsZHJlbi5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY2hpbGRyZW5bMF0ucmVzb3VyY2UudG9TdHJpbmcoKSwgam9pblBhdGgodXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc25pcHBldHNIb21lLCAnc2V0dGluZ3MuanNvbicpLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkIGJhY2t1cCBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRlc3RPYmplY3Qud3JpdGVGaWxlKGpvaW5QYXRoKGJhY2t1cFdvcmtzcGFjZUhvbWVPbkRpc2ssICdiYWNrdXAuanNvbicpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7fScpKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXN0T2JqZWN0LnJlYWRGaWxlKGpvaW5QYXRoKGJhY2t1cFdvcmtzcGFjZUhvbWVPbkRpc2sud2l0aCh7IHNjaGVtZTogZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJSb2FtaW5nRGF0YUhvbWUuc2NoZW1lIH0pLCBgYmFja3VwLmpzb25gKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC52YWx1ZS50b1N0cmluZygpLCAne30nKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlIGJhY2t1cCBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuY3JlYXRlRmlsZShqb2luUGF0aChiYWNrdXBXb3Jrc3BhY2VIb21lT25EaXNrLndpdGgoeyBzY2hlbWU6IGVudmlyb25tZW50U2VydmljZS51c2VyUm9hbWluZ0RhdGFIb21lLnNjaGVtZSB9KSwgYGJhY2t1cC5qc29uYCksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3t9JykpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlc3RPYmplY3QucmVhZEZpbGUoam9pblBhdGgoYmFja3VwV29ya3NwYWNlSG9tZU9uRGlzaywgJ2JhY2t1cC5qc29uJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudmFsdWUudG9TdHJpbmcoKSwgJ3t9Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlIGJhY2t1cCBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRlc3RPYmplY3Qud3JpdGVGaWxlKGpvaW5QYXRoKGJhY2t1cFdvcmtzcGFjZUhvbWVPbkRpc2ssICdiYWNrdXAuanNvbicpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7fScpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LndyaXRlRmlsZShqb2luUGF0aChiYWNrdXBXb3Jrc3BhY2VIb21lT25EaXNrLndpdGgoeyBzY2hlbWU6IGVudmlyb25tZW50U2VydmljZS51c2VyUm9hbWluZ0RhdGFIb21lLnNjaGVtZSB9KSwgYGJhY2t1cC5qc29uYCksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3thOjF9JykpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlc3RPYmplY3QucmVhZEZpbGUoam9pblBhdGgoYmFja3VwV29ya3NwYWNlSG9tZU9uRGlzaywgJ2JhY2t1cC5qc29uJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudmFsdWUudG9TdHJpbmcoKSwgJ3thOjF9Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmUgYmFja3VwcyBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC53cml0ZUZpbGUoam9pblBhdGgoYmFja3VwV29ya3NwYWNlSG9tZU9uRGlzaywgJ2JhY2t1cC5qc29uJyksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3t9JykpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlc3RPYmplY3QucmVzb2x2ZShiYWNrdXBXb3Jrc3BhY2VIb21lT25EaXNrLndpdGgoeyBzY2hlbWU6IGVudmlyb25tZW50U2VydmljZS51c2VyUm9hbWluZ0RhdGFIb21lLnNjaGVtZSB9KSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pc0RpcmVjdG9yeSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5jaGlsZHJlbiAhPT0gdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNoaWxkcmVuLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jaGlsZHJlblswXS5yZXNvdXJjZS50b1N0cmluZygpLCBqb2luUGF0aChiYWNrdXBXb3Jrc3BhY2VIb21lT25EaXNrLndpdGgoeyBzY2hlbWU6IGVudmlyb25tZW50U2VydmljZS51c2VyUm9hbWluZ0RhdGFIb21lLnNjaGVtZSB9KSwgYGJhY2t1cC5qc29uYCkudG9TdHJpbmcoKSk7XG5cdH0pO1xufSk7XG5cbmNsYXNzIFRlc3RGaWxlU3lzdGVtUHJvdmlkZXIgaW1wbGVtZW50cyBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFkV3JpdGVDYXBhYmlsaXR5LCBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aE9wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHksIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRTdHJlYW1DYXBhYmlsaXR5IHtcblxuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBvbkRpZENoYW5nZUZpbGU6IEV2ZW50PHJlYWRvbmx5IElGaWxlQ2hhbmdlW10+KSB7IH1cblxuXG5cdHJlYWRvbmx5IGNhcGFiaWxpdGllczogRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzID0gRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGU7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDYXBhYmlsaXRpZXM6IEV2ZW50PHZvaWQ+ID0gRXZlbnQuTm9uZTtcblxuXHR3YXRjaCgpOiBJRGlzcG9zYWJsZSB7IHJldHVybiBEaXNwb3NhYmxlLk5vbmU7IH1cblxuXHRzdGF0KCk6IFByb21pc2U8SVN0YXQ+IHsgdGhyb3cgbmV3IEVycm9yKCdOb3QgU3VwcG9ydGVkJyk7IH1cblxuXHRta2RpcihyZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7IHRocm93IG5ldyBFcnJvcignTm90IFN1cHBvcnRlZCcpOyB9XG5cblx0cmVuYW1lKCk6IFByb21pc2U8dm9pZD4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBTdXBwb3J0ZWQnKTsgfVxuXG5cdHJlYWRGaWxlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPFVpbnQ4QXJyYXk+IHsgdGhyb3cgbmV3IEVycm9yKCdOb3QgU3VwcG9ydGVkJyk7IH1cblxuXHRyZWFkZGlyKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPFtzdHJpbmcsIEZpbGVUeXBlXVtdPiB7IHRocm93IG5ldyBFcnJvcignTm90IFN1cHBvcnRlZCcpOyB9XG5cblx0d3JpdGVGaWxlKCk6IFByb21pc2U8dm9pZD4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBTdXBwb3J0ZWQnKTsgfVxuXG5cdGRlbGV0ZSgpOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdOb3QgU3VwcG9ydGVkJyk7IH1cblx0b3BlbihyZXNvdXJjZTogVVJJLCBvcHRzOiBJRmlsZU9wZW5PcHRpb25zKTogUHJvbWlzZTxudW1iZXI+IHsgdGhyb3cgbmV3IEVycm9yKCdOb3QgU3VwcG9ydGVkJyk7IH1cblx0Y2xvc2UoZmQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBTdXBwb3J0ZWQnKTsgfVxuXHRyZWFkKGZkOiBudW1iZXIsIHBvczogbnVtYmVyLCBkYXRhOiBVaW50OEFycmF5LCBvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpOiBQcm9taXNlPG51bWJlcj4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBTdXBwb3J0ZWQnKTsgfVxuXHR3cml0ZShmZDogbnVtYmVyLCBwb3M6IG51bWJlciwgZGF0YTogVWludDhBcnJheSwgb2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKTogUHJvbWlzZTxudW1iZXI+IHsgdGhyb3cgbmV3IEVycm9yKCdOb3QgU3VwcG9ydGVkJyk7IH1cblxuXHRyZWFkRmlsZVN0cmVhbShyZXNvdXJjZTogVVJJLCBvcHRzOiBJRmlsZVJlYWRTdHJlYW1PcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBSZWFkYWJsZVN0cmVhbUV2ZW50czxVaW50OEFycmF5PiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxufVxuXG5zdWl0ZSgnRmlsZVVzZXJEYXRhUHJvdmlkZXIgLSBXYXRjaGluZycsICgpID0+IHtcblxuXHRsZXQgdGVzdE9iamVjdDogRmlsZVVzZXJEYXRhUHJvdmlkZXI7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGNvbnN0IHJvb3RGaWxlUmVzb3VyY2UgPSBqb2luUGF0aChST09ULCAnVXNlcicpO1xuXHRjb25zdCByb290VXNlckRhdGFSZXNvdXJjZSA9IHJvb3RGaWxlUmVzb3VyY2Uud2l0aCh7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVVc2VyRGF0YSB9KTtcblxuXHRsZXQgZmlsZUV2ZW50RW1pdHRlcjogRW1pdHRlcjxyZWFkb25seSBJRmlsZUNoYW5nZVtdPjtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gbmV3IFRlc3RFbnZpcm9ubWVudFNlcnZpY2Uocm9vdEZpbGVSZXNvdXJjZSk7XG5cdFx0Y29uc3QgdXJpSWRlbnRpdHlTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBVcmlJZGVudGl0eVNlcnZpY2UoZmlsZVNlcnZpY2UpKTtcblx0XHRjb25zdCB1c2VyRGF0YVByb2ZpbGVzU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVXNlckRhdGFQcm9maWxlc1NlcnZpY2UoZW52aXJvbm1lbnRTZXJ2aWNlLCBmaWxlU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cblx0XHRmaWxlRXZlbnRFbWl0dGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHJlYWRvbmx5IElGaWxlQ2hhbmdlW10+KCkpO1xuXHRcdHRlc3RPYmplY3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVVc2VyRGF0YVByb3ZpZGVyKHJvb3RGaWxlUmVzb3VyY2Uuc2NoZW1lLCBuZXcgVGVzdEZpbGVTeXN0ZW1Qcm92aWRlcihmaWxlRXZlbnRFbWl0dGVyLmV2ZW50KSwgU2NoZW1hcy52c2NvZGVVc2VyRGF0YSwgdXNlckRhdGFQcm9maWxlc1NlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0fSk7XG5cblx0dGVzdCgnZmlsZSBhZGRlZCBjaGFuZ2UgZXZlbnQnLCBkb25lID0+IHtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGVzdE9iamVjdC53YXRjaChyb290VXNlckRhdGFSZXNvdXJjZSwgeyBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UgfSkpO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gam9pblBhdGgocm9vdFVzZXJEYXRhUmVzb3VyY2UsICdzZXR0aW5ncy5qc29uJyk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gam9pblBhdGgocm9vdEZpbGVSZXNvdXJjZSwgJ3NldHRpbmdzLmpzb24nKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGVzdE9iamVjdC5vbkRpZENoYW5nZUZpbGUoZSA9PiB7XG5cdFx0XHRpZiAoaXNFcXVhbChlWzBdLnJlc291cmNlLCBleHBlY3RlZCkgJiYgZVswXS50eXBlID09PSBGaWxlQ2hhbmdlVHlwZS5BRERFRCkge1xuXHRcdFx0XHRkb25lKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGZpbGVFdmVudEVtaXR0ZXIuZmlyZShbe1xuXHRcdFx0cmVzb3VyY2U6IHRhcmdldCxcblx0XHRcdHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkFEREVEXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmaWxlIHVwZGF0ZWQgY2hhbmdlIGV2ZW50JywgZG9uZSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRlc3RPYmplY3Qud2F0Y2gocm9vdFVzZXJEYXRhUmVzb3VyY2UsIHsgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IGZhbHNlIH0pKTtcblx0XHRjb25zdCBleHBlY3RlZCA9IGpvaW5QYXRoKHJvb3RVc2VyRGF0YVJlc291cmNlLCAnc2V0dGluZ3MuanNvbicpO1xuXHRcdGNvbnN0IHRhcmdldCA9IGpvaW5QYXRoKHJvb3RGaWxlUmVzb3VyY2UsICdzZXR0aW5ncy5qc29uJyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRlc3RPYmplY3Qub25EaWRDaGFuZ2VGaWxlKGUgPT4ge1xuXHRcdFx0aWYgKGlzRXF1YWwoZVswXS5yZXNvdXJjZSwgZXhwZWN0ZWQpICYmIGVbMF0udHlwZSA9PT0gRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCkge1xuXHRcdFx0XHRkb25lKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGZpbGVFdmVudEVtaXR0ZXIuZmlyZShbe1xuXHRcdFx0cmVzb3VyY2U6IHRhcmdldCxcblx0XHRcdHR5cGU6IEZpbGVDaGFuZ2VUeXBlLlVQREFURURcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbGUgZGVsZXRlZCBjaGFuZ2UgZXZlbnQnLCBkb25lID0+IHtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGVzdE9iamVjdC53YXRjaChyb290VXNlckRhdGFSZXNvdXJjZSwgeyBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UgfSkpO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gam9pblBhdGgocm9vdFVzZXJEYXRhUmVzb3VyY2UsICdzZXR0aW5ncy5qc29uJyk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gam9pblBhdGgocm9vdEZpbGVSZXNvdXJjZSwgJ3NldHRpbmdzLmpzb24nKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGVzdE9iamVjdC5vbkRpZENoYW5nZUZpbGUoZSA9PiB7XG5cdFx0XHRpZiAoaXNFcXVhbChlWzBdLnJlc291cmNlLCBleHBlY3RlZCkgJiYgZVswXS50eXBlID09PSBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKSB7XG5cdFx0XHRcdGRvbmUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZmlsZUV2ZW50RW1pdHRlci5maXJlKFt7XG5cdFx0XHRyZXNvdXJjZTogdGFyZ2V0LFxuXHRcdFx0dHlwZTogRmlsZUNoYW5nZVR5cGUuREVMRVRFRFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZmlsZSB1bmRlciBmb2xkZXIgY3JlYXRlZCBjaGFuZ2UgZXZlbnQnLCBkb25lID0+IHtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGVzdE9iamVjdC53YXRjaChyb290VXNlckRhdGFSZXNvdXJjZSwgeyBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UgfSkpO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gam9pblBhdGgocm9vdFVzZXJEYXRhUmVzb3VyY2UsICdzbmlwcGV0cycsICdzZXR0aW5ncy5qc29uJyk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gam9pblBhdGgocm9vdEZpbGVSZXNvdXJjZSwgJ3NuaXBwZXRzJywgJ3NldHRpbmdzLmpzb24nKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGVzdE9iamVjdC5vbkRpZENoYW5nZUZpbGUoZSA9PiB7XG5cdFx0XHRpZiAoaXNFcXVhbChlWzBdLnJlc291cmNlLCBleHBlY3RlZCkgJiYgZVswXS50eXBlID09PSBGaWxlQ2hhbmdlVHlwZS5BRERFRCkge1xuXHRcdFx0XHRkb25lKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGZpbGVFdmVudEVtaXR0ZXIuZmlyZShbe1xuXHRcdFx0cmVzb3VyY2U6IHRhcmdldCxcblx0XHRcdHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkFEREVEXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmaWxlIHVuZGVyIGZvbGRlciB1cGRhdGVkIGNoYW5nZSBldmVudCcsIGRvbmUgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0ZXN0T2JqZWN0LndhdGNoKHJvb3RVc2VyRGF0YVJlc291cmNlLCB7IGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiBmYWxzZSB9KSk7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBqb2luUGF0aChyb290VXNlckRhdGFSZXNvdXJjZSwgJ3NuaXBwZXRzJywgJ3NldHRpbmdzLmpzb24nKTtcblx0XHRjb25zdCB0YXJnZXQgPSBqb2luUGF0aChyb290RmlsZVJlc291cmNlLCAnc25pcHBldHMnLCAnc2V0dGluZ3MuanNvbicpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0ZXN0T2JqZWN0Lm9uRGlkQ2hhbmdlRmlsZShlID0+IHtcblx0XHRcdGlmIChpc0VxdWFsKGVbMF0ucmVzb3VyY2UsIGV4cGVjdGVkKSAmJiBlWzBdLnR5cGUgPT09IEZpbGVDaGFuZ2VUeXBlLlVQREFURUQpIHtcblx0XHRcdFx0ZG9uZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRmaWxlRXZlbnRFbWl0dGVyLmZpcmUoW3tcblx0XHRcdHJlc291cmNlOiB0YXJnZXQsXG5cdFx0XHR0eXBlOiBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmaWxlIHVuZGVyIGZvbGRlciBkZWxldGVkIGNoYW5nZSBldmVudCcsIGRvbmUgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0ZXN0T2JqZWN0LndhdGNoKHJvb3RVc2VyRGF0YVJlc291cmNlLCB7IGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiBmYWxzZSB9KSk7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBqb2luUGF0aChyb290VXNlckRhdGFSZXNvdXJjZSwgJ3NuaXBwZXRzJywgJ3NldHRpbmdzLmpzb24nKTtcblx0XHRjb25zdCB0YXJnZXQgPSBqb2luUGF0aChyb290RmlsZVJlc291cmNlLCAnc25pcHBldHMnLCAnc2V0dGluZ3MuanNvbicpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0ZXN0T2JqZWN0Lm9uRGlkQ2hhbmdlRmlsZShlID0+IHtcblx0XHRcdGlmIChpc0VxdWFsKGVbMF0ucmVzb3VyY2UsIGV4cGVjdGVkKSAmJiBlWzBdLnR5cGUgPT09IEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpIHtcblx0XHRcdFx0ZG9uZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRmaWxlRXZlbnRFbWl0dGVyLmZpcmUoW3tcblx0XHRcdHJlc291cmNlOiB0YXJnZXQsXG5cdFx0XHR0eXBlOiBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdldmVudCBpcyBub3QgdHJpZ2dlcmVkIGlmIG5vdCB3YXRjaGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRhcmdldCA9IGpvaW5QYXRoKHJvb3RGaWxlUmVzb3VyY2UsICdzZXR0aW5ncy5qc29uJyk7XG5cdFx0bGV0IHRyaWdnZXJlZCA9IGZhbHNlO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0ZXN0T2JqZWN0Lm9uRGlkQ2hhbmdlRmlsZSgoKSA9PiB0cmlnZ2VyZWQgPSB0cnVlKSk7XG5cdFx0ZmlsZUV2ZW50RW1pdHRlci5maXJlKFt7XG5cdFx0XHRyZXNvdXJjZTogdGFyZ2V0LFxuXHRcdFx0dHlwZTogRmlsZUNoYW5nZVR5cGUuREVMRVRFRFxuXHRcdH1dKTtcblx0XHRpZiAodHJpZ2dlcmVkKSB7XG5cdFx0XHRhc3NlcnQuZmFpbCgnZXZlbnQgc2hvdWxkIG5vdCBiZSB0cmlnZ2VyZWQnKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2V2ZW50IGlzIG5vdCB0cmlnZ2VyZWQgaWYgbm90IHdhdGNoZWQgMicsIGFzeW5jICgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGVzdE9iamVjdC53YXRjaChyb290VXNlckRhdGFSZXNvdXJjZSwgeyBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UgfSkpO1xuXHRcdGNvbnN0IHRhcmdldCA9IGpvaW5QYXRoKGRpcm5hbWUocm9vdEZpbGVSZXNvdXJjZSksICdzZXR0aW5ncy5qc29uJyk7XG5cdFx0bGV0IHRyaWdnZXJlZCA9IGZhbHNlO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0ZXN0T2JqZWN0Lm9uRGlkQ2hhbmdlRmlsZSgoKSA9PiB0cmlnZ2VyZWQgPSB0cnVlKSk7XG5cdFx0ZmlsZUV2ZW50RW1pdHRlci5maXJlKFt7XG5cdFx0XHRyZXNvdXJjZTogdGFyZ2V0LFxuXHRcdFx0dHlwZTogRmlsZUNoYW5nZVR5cGUuREVMRVRFRFxuXHRcdH1dKTtcblx0XHRpZiAodHJpZ2dlcmVkKSB7XG5cdFx0XHRhc3NlcnQuZmFpbCgnZXZlbnQgc2hvdWxkIG5vdCBiZSB0cmlnZ2VyZWQnKTtcblx0XHR9XG5cdH0pO1xuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGtCQUErQjtBQUN4QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLFNBQVMsZ0JBQWdCO0FBRTNDLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUV4RCxTQUFTLHdDQUF3QztBQUNqRCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGdCQUFnQixzQ0FBa1I7QUFDM1MsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxzQkFBc0I7QUFDL0IsT0FBTyxhQUFhO0FBQ3BCLFNBQVMsMEJBQTBCO0FBQ25D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
