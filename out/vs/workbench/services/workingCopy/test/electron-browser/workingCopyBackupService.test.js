import assert from "assert";
import { isWindows } from "../../../../../base/common/platform.js";
import { insert } from "../../../../../base/common/arrays.js";
import { hash } from "../../../../../base/common/hash.js";
import { isEqual, joinPath, dirname } from "../../../../../base/common/resources.js";
import { join } from "../../../../../base/common/path.js";
import { URI } from "../../../../../base/common/uri.js";
import { WorkingCopyBackupsModel, hashIdentifier } from "../../common/workingCopyBackupService.js";
import { createTextModel } from "../../../../../editor/test/common/testTextModel.js";
import { Schemas } from "../../../../../base/common/network.js";
import { FileService } from "../../../../../platform/files/common/fileService.js";
import { LogLevel, NullLogService } from "../../../../../platform/log/common/log.js";
import { NativeWorkbenchEnvironmentService } from "../../../environment/electron-browser/environmentService.js";
import { toBufferOrReadable } from "../../../textfile/common/textfiles.js";
import { NativeWorkingCopyBackupService } from "../../electron-browser/workingCopyBackupService.js";
import { FileUserDataProvider } from "../../../../../platform/userData/common/fileUserDataProvider.js";
import { bufferToReadable, bufferToStream, streamToBuffer, VSBuffer } from "../../../../../base/common/buffer.js";
import { TestLifecycleService, toTypedWorkingCopyId, toUntypedWorkingCopyId } from "../../../../test/browser/workbenchTestServices.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { consumeStream } from "../../../../../base/common/stream.js";
import { TestProductService } from "../../../../test/common/workbenchTestServices.js";
import { InMemoryFileSystemProvider } from "../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import product from "../../../../../platform/product/common/product.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { UserDataProfilesService } from "../../../../../platform/userDataProfile/common/userDataProfile.js";
import { UriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentityService.js";
const homeDir = URI.file("home").with({ scheme: Schemas.inMemory });
const tmpDir = URI.file("tmp").with({ scheme: Schemas.inMemory });
const NULL_PROFILE = {
  name: "",
  id: "",
  shortName: "",
  isDefault: false,
  location: homeDir,
  settingsResource: joinPath(homeDir, "settings.json"),
  globalStorageHome: joinPath(homeDir, "globalStorage"),
  keybindingsResource: joinPath(homeDir, "keybindings.json"),
  tasksResource: joinPath(homeDir, "tasks.json"),
  mcpResource: joinPath(homeDir, "mcp.json"),
  languageModelsResource: joinPath(homeDir, "chatLanguageModels.json"),
  snippetsHome: joinPath(homeDir, "snippets"),
  promptsHome: joinPath(homeDir, "prompts"),
  extensionsResource: joinPath(homeDir, "extensions.json"),
  cacheHome: joinPath(homeDir, "cache"),
  agentPluginsHome: joinPath(homeDir, "agentPluginsHome")
};
const TestNativeWindowConfiguration = {
  windowId: 0,
  machineId: "testMachineId",
  sqmId: "testSqmId",
  devDeviceId: "testdevDeviceId",
  isPortable: false,
  logLevel: LogLevel.Error,
  loggers: [],
  mainPid: 0,
  appRoot: "",
  userEnv: {},
  execPath: process.execPath,
  perfMarks: [],
  colorScheme: { dark: true, highContrast: false },
  os: { release: "unknown", hostname: "unknown", arch: "unknown" },
  product,
  homeDir: homeDir.fsPath,
  tmpDir: tmpDir.fsPath,
  userDataDir: joinPath(homeDir, product.nameShort).fsPath,
  profiles: { profile: NULL_PROFILE, all: [NULL_PROFILE], home: homeDir },
  nls: {
    messages: [],
    language: "en"
  },
  _: []
};
class TestNativeWorkbenchEnvironmentService extends NativeWorkbenchEnvironmentService {
  constructor(testDir, backupPath) {
    super({ ...TestNativeWindowConfiguration, backupPath: backupPath.fsPath, "user-data-dir": testDir.fsPath }, TestProductService);
  }
}
class NodeTestWorkingCopyBackupService extends NativeWorkingCopyBackupService {
  constructor(testDir, workspaceBackupPath) {
    const environmentService = new TestNativeWorkbenchEnvironmentService(testDir, workspaceBackupPath);
    const logService = new NullLogService();
    const fileService = new FileService(logService);
    const lifecycleService = new TestLifecycleService();
    super(environmentService, fileService, logService, lifecycleService);
    const fsp = new InMemoryFileSystemProvider();
    fileService.registerProvider(Schemas.inMemory, fsp);
    const uriIdentityService = new UriIdentityService(fileService);
    const userDataProfilesService = new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService);
    fileService.registerProvider(Schemas.vscodeUserData, new FileUserDataProvider(Schemas.file, fsp, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, logService));
    this._fileService = fileService;
    this.backupResourceJoiners = [];
    this.discardBackupJoiners = [];
    this.discardedBackups = [];
    this.pendingBackupsArr = [];
    this.discardedAllBackups = false;
  }
  testGetFileService() {
    return this.fileService;
  }
  async waitForAllBackups() {
    await Promise.all(this.pendingBackupsArr);
  }
  joinBackupResource() {
    return new Promise((resolve) => this.backupResourceJoiners.push(resolve));
  }
  async backup(identifier, content, versionId, meta, token) {
    const p = super.backup(identifier, content, versionId, meta, token);
    const removeFromPendingBackups = insert(this.pendingBackupsArr, p.then(void 0, void 0));
    try {
      await p;
    } finally {
      removeFromPendingBackups();
    }
    while (this.backupResourceJoiners.length) {
      this.backupResourceJoiners.pop()();
    }
  }
  joinDiscardBackup() {
    return new Promise((resolve) => this.discardBackupJoiners.push(resolve));
  }
  async discardBackup(identifier) {
    await super.discardBackup(identifier);
    this.discardedBackups.push(identifier);
    while (this.discardBackupJoiners.length) {
      this.discardBackupJoiners.pop()();
    }
  }
  async discardBackups(filter) {
    this.discardedAllBackups = true;
    return super.discardBackups(filter);
  }
  async getBackupContents(identifier) {
    const backupResource = this.toBackupResource(identifier);
    const fileContents = await this.fileService.readFile(backupResource);
    return fileContents.value.toString();
  }
}
suite("WorkingCopyBackupService", () => {
  let testDir;
  let backupHome;
  let workspacesJsonPath;
  let workspaceBackupPath;
  let service;
  let fileService;
  const disposables = new DisposableStore();
  const workspaceResource = URI.file(isWindows ? "c:\\workspace" : "/workspace");
  const fooFile = URI.file(isWindows ? "c:\\Foo" : "/Foo");
  const customFile = URI.parse("customScheme://some/path");
  const customFileWithFragment = URI.parse("customScheme2://some/path#fragment");
  const barFile = URI.file(isWindows ? "c:\\Bar" : "/Bar");
  const fooBarFile = URI.file(isWindows ? "c:\\Foo Bar" : "/Foo Bar");
  const untitledFile = URI.from({ scheme: Schemas.untitled, path: "Untitled-1" });
  setup(async () => {
    testDir = URI.file(join(generateUuid(), "vsctests", "workingcopybackupservice")).with({ scheme: Schemas.inMemory });
    backupHome = joinPath(testDir, "Backups");
    workspacesJsonPath = joinPath(backupHome, "workspaces.json");
    workspaceBackupPath = joinPath(backupHome, hash(workspaceResource.fsPath).toString(16));
    service = disposables.add(new NodeTestWorkingCopyBackupService(testDir, workspaceBackupPath));
    fileService = service._fileService;
    await fileService.createFolder(backupHome);
    return fileService.writeFile(workspacesJsonPath, VSBuffer.fromString(""));
  });
  teardown(() => {
    disposables.clear();
  });
  suite("hashIdentifier", () => {
    test("should correctly hash the identifier for untitled scheme URIs", () => {
      const uri = URI.from({ scheme: Schemas.untitled, path: "Untitled-1" });
      const untypedBackupHash = hashIdentifier(toUntypedWorkingCopyId(uri));
      assert.strictEqual(untypedBackupHash, "-7f9c1a2e");
      assert.strictEqual(untypedBackupHash, hash(uri.fsPath).toString(16));
      const typedBackupHash = hashIdentifier({ typeId: "hashTest", resource: uri });
      if (isWindows) {
        assert.strictEqual(typedBackupHash, "-17c47cdc");
      } else {
        assert.strictEqual(typedBackupHash, "-8ad5f4f");
      }
      assert.notStrictEqual(untypedBackupHash, typedBackupHash);
    });
    test("should correctly hash the identifier for file scheme URIs", () => {
      const uri = URI.file("/foo");
      const untypedBackupHash = hashIdentifier(toUntypedWorkingCopyId(uri));
      if (isWindows) {
        assert.strictEqual(untypedBackupHash, "20ffaa13");
      } else {
        assert.strictEqual(untypedBackupHash, "20eb3560");
      }
      assert.strictEqual(untypedBackupHash, hash(uri.fsPath).toString(16));
      const typedBackupHash = hashIdentifier({ typeId: "hashTest", resource: uri });
      if (isWindows) {
        assert.strictEqual(typedBackupHash, "-55fc55db");
      } else {
        assert.strictEqual(typedBackupHash, "51e56bf");
      }
      assert.notStrictEqual(untypedBackupHash, typedBackupHash);
    });
    test("should correctly hash the identifier for custom scheme URIs", () => {
      const uri = URI.from({
        scheme: "vscode-custom",
        path: "somePath"
      });
      const untypedBackupHash = hashIdentifier(toUntypedWorkingCopyId(uri));
      assert.strictEqual(untypedBackupHash, "-44972d98");
      assert.strictEqual(untypedBackupHash, hash(uri.toString()).toString(16));
      const typedBackupHash = hashIdentifier({ typeId: "hashTest", resource: uri });
      assert.strictEqual(typedBackupHash, "502149c7");
      assert.notStrictEqual(untypedBackupHash, typedBackupHash);
    });
    test("should not fail for URIs without path", () => {
      const uri = URI.from({
        scheme: "vscode-fragment",
        fragment: "frag"
      });
      const untypedBackupHash = hashIdentifier(toUntypedWorkingCopyId(uri));
      assert.strictEqual(untypedBackupHash, "-2f6b2f1b");
      assert.strictEqual(untypedBackupHash, hash(uri.toString()).toString(16));
      const typedBackupHash = hashIdentifier({ typeId: "hashTest", resource: uri });
      assert.strictEqual(typedBackupHash, "6e82ca57");
      assert.notStrictEqual(untypedBackupHash, typedBackupHash);
    });
  });
  suite("getBackupResource", () => {
    test("should get the correct backup path for text files", () => {
      const backupResource = fooFile;
      const workspaceHash = hash(workspaceResource.fsPath).toString(16);
      let backupId = toUntypedWorkingCopyId(backupResource);
      let filePathHash = hashIdentifier(backupId);
      let expectedPath = joinPath(backupHome, workspaceHash, Schemas.file, filePathHash).with({ scheme: Schemas.vscodeUserData }).toString();
      assert.strictEqual(service.toBackupResource(backupId).toString(), expectedPath);
      backupId = toTypedWorkingCopyId(backupResource);
      filePathHash = hashIdentifier(backupId);
      expectedPath = joinPath(backupHome, workspaceHash, Schemas.file, filePathHash).with({ scheme: Schemas.vscodeUserData }).toString();
      assert.strictEqual(service.toBackupResource(backupId).toString(), expectedPath);
    });
    test("should get the correct backup path for untitled files", () => {
      const backupResource = URI.from({ scheme: Schemas.untitled, path: "Untitled-1" });
      const workspaceHash = hash(workspaceResource.fsPath).toString(16);
      let backupId = toUntypedWorkingCopyId(backupResource);
      let filePathHash = hashIdentifier(backupId);
      let expectedPath = joinPath(backupHome, workspaceHash, Schemas.untitled, filePathHash).with({ scheme: Schemas.vscodeUserData }).toString();
      assert.strictEqual(service.toBackupResource(backupId).toString(), expectedPath);
      backupId = toTypedWorkingCopyId(backupResource);
      filePathHash = hashIdentifier(backupId);
      expectedPath = joinPath(backupHome, workspaceHash, Schemas.untitled, filePathHash).with({ scheme: Schemas.vscodeUserData }).toString();
      assert.strictEqual(service.toBackupResource(backupId).toString(), expectedPath);
    });
    test("should get the correct backup path for custom files", () => {
      const backupResource = URI.from({ scheme: "custom", path: "custom/file.txt" });
      const workspaceHash = hash(workspaceResource.fsPath).toString(16);
      let backupId = toUntypedWorkingCopyId(backupResource);
      let filePathHash = hashIdentifier(backupId);
      let expectedPath = joinPath(backupHome, workspaceHash, "custom", filePathHash).with({ scheme: Schemas.vscodeUserData }).toString();
      assert.strictEqual(service.toBackupResource(backupId).toString(), expectedPath);
      backupId = toTypedWorkingCopyId(backupResource);
      filePathHash = hashIdentifier(backupId);
      expectedPath = joinPath(backupHome, workspaceHash, "custom", filePathHash).with({ scheme: Schemas.vscodeUserData }).toString();
      assert.strictEqual(service.toBackupResource(backupId).toString(), expectedPath);
    });
  });
  suite("backup", () => {
    function toExpectedPreamble(identifier, content = "", meta) {
      return `${identifier.resource.toString()} ${JSON.stringify({ ...meta, typeId: identifier.typeId })}
${content}`;
    }
    test("joining", async () => {
      let backupJoined = false;
      const joinBackupsPromise = service.joinBackups();
      joinBackupsPromise.then(() => backupJoined = true);
      await joinBackupsPromise;
      assert.strictEqual(backupJoined, true);
      backupJoined = false;
      service.joinBackups().then(() => backupJoined = true);
      const identifier = toUntypedWorkingCopyId(fooFile);
      const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
      const backupPromise = service.backup(identifier);
      assert.strictEqual(backupJoined, false);
      await backupPromise;
      assert.strictEqual(backupJoined, true);
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "file"))).children?.length, 1);
      assert.strictEqual(await fileService.exists(backupPath), true);
      assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier));
      assert.ok(service.hasBackupSync(identifier));
    });
    test("no text", async () => {
      const identifier = toUntypedWorkingCopyId(fooFile);
      const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
      await service.backup(identifier);
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "file"))).children?.length, 1);
      assert.strictEqual(await fileService.exists(backupPath), true);
      assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier));
      assert.ok(service.hasBackupSync(identifier));
    });
    test("text file", async () => {
      const identifier = toUntypedWorkingCopyId(fooFile);
      const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
      await service.backup(identifier, bufferToReadable(VSBuffer.fromString("test")));
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "file"))).children?.length, 1);
      assert.strictEqual(await fileService.exists(backupPath), true);
      assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, "test"));
      assert.ok(service.hasBackupSync(identifier));
    });
    test("text file (with version)", async () => {
      const identifier = toUntypedWorkingCopyId(fooFile);
      const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
      await service.backup(identifier, bufferToReadable(VSBuffer.fromString("test")), 666);
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "file"))).children?.length, 1);
      assert.strictEqual(await fileService.exists(backupPath), true);
      assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, "test"));
      assert.ok(!service.hasBackupSync(identifier, 555));
      assert.ok(service.hasBackupSync(identifier, 666));
    });
    test("text file (with meta)", async () => {
      const identifier = toUntypedWorkingCopyId(fooFile);
      const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
      const meta = { etag: "678", orphaned: true };
      await service.backup(identifier, bufferToReadable(VSBuffer.fromString("test")), void 0, meta);
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "file"))).children?.length, 1);
      assert.strictEqual(await fileService.exists(backupPath), true);
      assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, "test", meta));
      assert.ok(service.hasBackupSync(identifier));
    });
    test("text file with whitespace in name and type (with meta)", async () => {
      const fileWithSpace = URI.file(isWindows ? "c:\\Foo \n Bar" : "/Foo \n Bar");
      const identifier = toTypedWorkingCopyId(fileWithSpace, " test id \n");
      const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
      const meta = { etag: "678 \n k", orphaned: true };
      await service.backup(identifier, bufferToReadable(VSBuffer.fromString("test")), void 0, meta);
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "file"))).children?.length, 1);
      assert.strictEqual(await fileService.exists(backupPath), true);
      assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, "test", meta));
      assert.ok(service.hasBackupSync(identifier));
    });
    test("text file with unicode character in name and type (with meta)", async () => {
      const fileWithUnicode = URI.file(isWindows ? "c:\\so\u{12005}me\u0804" : "/so\u{12005}me\u0804");
      const identifier = toTypedWorkingCopyId(fileWithUnicode, " test so\u{12005}me\u0804 id \n");
      const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
      const meta = { etag: "678so\u{12005}me\u0804", orphaned: true };
      await service.backup(identifier, bufferToReadable(VSBuffer.fromString("test")), void 0, meta);
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "file"))).children?.length, 1);
      assert.strictEqual(await fileService.exists(backupPath), true);
      assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, "test", meta));
      assert.ok(service.hasBackupSync(identifier));
    });
    test("untitled file", async () => {
      const identifier = toUntypedWorkingCopyId(untitledFile);
      const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
      await service.backup(identifier, bufferToReadable(VSBuffer.fromString("test")));
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "untitled"))).children?.length, 1);
      assert.strictEqual(await fileService.exists(backupPath), true);
      assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, "test"));
      assert.ok(service.hasBackupSync(identifier));
    });
    test("text file (readable)", async () => {
      const identifier = toUntypedWorkingCopyId(fooFile);
      const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
      const model = createTextModel("test");
      await service.backup(identifier, toBufferOrReadable(model.createSnapshot()));
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "file"))).children?.length, 1);
      assert.strictEqual(await fileService.exists(backupPath), true);
      assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, "test"));
      assert.ok(service.hasBackupSync(identifier));
      model.dispose();
    });
    test("untitled file (readable)", async () => {
      const identifier = toUntypedWorkingCopyId(untitledFile);
      const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
      const model = createTextModel("test");
      await service.backup(identifier, toBufferOrReadable(model.createSnapshot()));
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "untitled"))).children?.length, 1);
      assert.strictEqual(await fileService.exists(backupPath), true);
      assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, "test"));
      model.dispose();
    });
    test("text file (large file, stream)", () => {
      const largeString = new Array(30 * 1024).join("Large String\n");
      return testLargeTextFile(largeString, bufferToStream(VSBuffer.fromString(largeString)));
    });
    test("text file (large file, readable)", async () => {
      const largeString = new Array(30 * 1024).join("Large String\n");
      const model = createTextModel(largeString);
      await testLargeTextFile(largeString, toBufferOrReadable(model.createSnapshot()));
      model.dispose();
    });
    async function testLargeTextFile(largeString, buffer) {
      const identifier = toUntypedWorkingCopyId(fooFile);
      const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
      await service.backup(identifier, buffer, void 0, { largeTest: true });
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "file"))).children?.length, 1);
      assert.strictEqual(await fileService.exists(backupPath), true);
      assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, largeString, { largeTest: true }));
      assert.ok(service.hasBackupSync(identifier));
    }
    test("untitled file (large file, readable)", async () => {
      const identifier = toUntypedWorkingCopyId(untitledFile);
      const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
      const largeString = new Array(30 * 1024).join("Large String\n");
      const model = createTextModel(largeString);
      await service.backup(identifier, toBufferOrReadable(model.createSnapshot()));
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "untitled"))).children?.length, 1);
      assert.strictEqual(await fileService.exists(backupPath), true);
      assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, largeString));
      assert.ok(service.hasBackupSync(identifier));
      model.dispose();
    });
    test("cancellation", async () => {
      const identifier = toUntypedWorkingCopyId(fooFile);
      const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
      const cts = new CancellationTokenSource();
      const promise = service.backup(identifier, void 0, void 0, void 0, cts.token);
      cts.cancel();
      await promise;
      assert.strictEqual(await fileService.exists(backupPath), false);
      assert.ok(!service.hasBackupSync(identifier));
    });
    test("multiple", async () => {
      const identifier = toUntypedWorkingCopyId(fooFile);
      const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
      await Promise.all([
        service.backup(identifier),
        service.backup(identifier),
        service.backup(identifier),
        service.backup(identifier)
      ]);
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "file"))).children?.length, 1);
      assert.strictEqual(await fileService.exists(backupPath), true);
      assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier));
      assert.ok(service.hasBackupSync(identifier));
    });
    test("multiple same resource, different type id", async () => {
      const backupId1 = toUntypedWorkingCopyId(fooFile);
      const backupId2 = toTypedWorkingCopyId(fooFile, "type1");
      const backupId3 = toTypedWorkingCopyId(fooFile, "type2");
      await Promise.all([
        service.backup(backupId1),
        service.backup(backupId2),
        service.backup(backupId3)
      ]);
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "file"))).children?.length, 3);
      for (const backupId of [backupId1, backupId2, backupId3]) {
        const fooBackupPath = joinPath(workspaceBackupPath, backupId.resource.scheme, hashIdentifier(backupId));
        assert.strictEqual(await fileService.exists(fooBackupPath), true);
        assert.strictEqual((await fileService.readFile(fooBackupPath)).value.toString(), toExpectedPreamble(backupId));
        assert.ok(service.hasBackupSync(backupId));
      }
    });
  });
  suite("discardBackup", () => {
    test("joining", async () => {
      const identifier = toUntypedWorkingCopyId(fooFile);
      const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
      await service.backup(identifier, bufferToReadable(VSBuffer.fromString("test")));
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "file"))).children?.length, 1);
      assert.ok(service.hasBackupSync(identifier));
      let backupJoined = false;
      service.joinBackups().then(() => backupJoined = true);
      const discardBackupPromise = service.discardBackup(identifier);
      assert.strictEqual(backupJoined, false);
      await discardBackupPromise;
      assert.strictEqual(backupJoined, true);
      assert.strictEqual(await fileService.exists(backupPath), false);
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "file"))).children?.length, 0);
      assert.ok(!service.hasBackupSync(identifier));
    });
    test("text file", async () => {
      const identifier = toUntypedWorkingCopyId(fooFile);
      const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
      await service.backup(identifier, bufferToReadable(VSBuffer.fromString("test")));
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "file"))).children?.length, 1);
      assert.ok(service.hasBackupSync(identifier));
      await service.discardBackup(identifier);
      assert.strictEqual(await fileService.exists(backupPath), false);
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "file"))).children?.length, 0);
      assert.ok(!service.hasBackupSync(identifier));
    });
    test("untitled file", async () => {
      const identifier = toUntypedWorkingCopyId(untitledFile);
      const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
      await service.backup(identifier, bufferToReadable(VSBuffer.fromString("test")));
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "untitled"))).children?.length, 1);
      await service.discardBackup(identifier);
      assert.strictEqual(await fileService.exists(backupPath), false);
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "untitled"))).children?.length, 0);
    });
    test("multiple same resource, different type id", async () => {
      const backupId1 = toUntypedWorkingCopyId(fooFile);
      const backupId2 = toTypedWorkingCopyId(fooFile, "type1");
      const backupId3 = toTypedWorkingCopyId(fooFile, "type2");
      await Promise.all([
        service.backup(backupId1),
        service.backup(backupId2),
        service.backup(backupId3)
      ]);
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "file"))).children?.length, 3);
      for (const backupId of [backupId1, backupId2, backupId3]) {
        const backupPath = joinPath(workspaceBackupPath, backupId.resource.scheme, hashIdentifier(backupId));
        await service.discardBackup(backupId);
        assert.strictEqual(await fileService.exists(backupPath), false);
      }
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "file"))).children?.length, 0);
    });
  });
  suite("discardBackups (all)", () => {
    test("text file", async () => {
      const backupId1 = toUntypedWorkingCopyId(fooFile);
      const backupId2 = toUntypedWorkingCopyId(barFile);
      const backupId3 = toTypedWorkingCopyId(barFile);
      await service.backup(backupId1, bufferToReadable(VSBuffer.fromString("test")));
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "file"))).children?.length, 1);
      await service.backup(backupId2, bufferToReadable(VSBuffer.fromString("test")));
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "file"))).children?.length, 2);
      await service.backup(backupId3, bufferToReadable(VSBuffer.fromString("test")));
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "file"))).children?.length, 3);
      await service.discardBackups();
      for (const backupId of [backupId1, backupId2, backupId3]) {
        const backupPath = joinPath(workspaceBackupPath, backupId.resource.scheme, hashIdentifier(backupId));
        assert.strictEqual(await fileService.exists(backupPath), false);
      }
      assert.strictEqual(await fileService.exists(joinPath(workspaceBackupPath, "file")), false);
    });
    test("untitled file", async () => {
      const backupId = toUntypedWorkingCopyId(untitledFile);
      const backupPath = joinPath(workspaceBackupPath, backupId.resource.scheme, hashIdentifier(backupId));
      await service.backup(backupId, bufferToReadable(VSBuffer.fromString("test")));
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "untitled"))).children?.length, 1);
      await service.discardBackups();
      assert.strictEqual(await fileService.exists(backupPath), false);
      assert.strictEqual(await fileService.exists(joinPath(workspaceBackupPath, "untitled")), false);
    });
    test("can backup after discarding all", async () => {
      await service.discardBackups();
      await service.backup(toUntypedWorkingCopyId(untitledFile), bufferToReadable(VSBuffer.fromString("test")));
      assert.strictEqual(await fileService.exists(workspaceBackupPath), true);
    });
  });
  suite("discardBackups (except some)", () => {
    test("text file", async () => {
      const backupId1 = toUntypedWorkingCopyId(fooFile);
      const backupId2 = toUntypedWorkingCopyId(barFile);
      const backupId3 = toTypedWorkingCopyId(barFile);
      await service.backup(backupId1, bufferToReadable(VSBuffer.fromString("test")));
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "file"))).children?.length, 1);
      await service.backup(backupId2, bufferToReadable(VSBuffer.fromString("test")));
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "file"))).children?.length, 2);
      await service.backup(backupId3, bufferToReadable(VSBuffer.fromString("test")));
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "file"))).children?.length, 3);
      await service.discardBackups({ except: [backupId2, backupId3] });
      let backupPath = joinPath(workspaceBackupPath, backupId1.resource.scheme, hashIdentifier(backupId1));
      assert.strictEqual(await fileService.exists(backupPath), false);
      backupPath = joinPath(workspaceBackupPath, backupId2.resource.scheme, hashIdentifier(backupId2));
      assert.strictEqual(await fileService.exists(backupPath), true);
      backupPath = joinPath(workspaceBackupPath, backupId3.resource.scheme, hashIdentifier(backupId3));
      assert.strictEqual(await fileService.exists(backupPath), true);
      await service.discardBackups({ except: [backupId1] });
      for (const backupId of [backupId1, backupId2, backupId3]) {
        const backupPath2 = joinPath(workspaceBackupPath, backupId.resource.scheme, hashIdentifier(backupId));
        assert.strictEqual(await fileService.exists(backupPath2), false);
      }
    });
    test("untitled file", async () => {
      const backupId = toUntypedWorkingCopyId(untitledFile);
      const backupPath = joinPath(workspaceBackupPath, backupId.resource.scheme, hashIdentifier(backupId));
      await service.backup(backupId, bufferToReadable(VSBuffer.fromString("test")));
      assert.strictEqual(await fileService.exists(backupPath), true);
      assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, "untitled"))).children?.length, 1);
      await service.discardBackups({ except: [backupId] });
      assert.strictEqual(await fileService.exists(backupPath), true);
    });
  });
  suite("getBackups", () => {
    test("text file", async () => {
      await Promise.all([
        service.backup(toUntypedWorkingCopyId(fooFile), bufferToReadable(VSBuffer.fromString("test"))),
        service.backup(toTypedWorkingCopyId(fooFile, "type1"), bufferToReadable(VSBuffer.fromString("test"))),
        service.backup(toTypedWorkingCopyId(fooFile, "type2"), bufferToReadable(VSBuffer.fromString("test")))
      ]);
      let backups = await service.getBackups();
      assert.strictEqual(backups.length, 3);
      for (const backup of backups) {
        if (backup.typeId === "") {
          assert.strictEqual(backup.resource.toString(), fooFile.toString());
        } else if (backup.typeId === "type1") {
          assert.strictEqual(backup.resource.toString(), fooFile.toString());
        } else if (backup.typeId === "type2") {
          assert.strictEqual(backup.resource.toString(), fooFile.toString());
        } else {
          assert.fail("Unexpected backup");
        }
      }
      await service.backup(toUntypedWorkingCopyId(barFile), bufferToReadable(VSBuffer.fromString("test")));
      backups = await service.getBackups();
      assert.strictEqual(backups.length, 4);
    });
    test("untitled file", async () => {
      await Promise.all([
        service.backup(toUntypedWorkingCopyId(untitledFile), bufferToReadable(VSBuffer.fromString("test"))),
        service.backup(toTypedWorkingCopyId(untitledFile, "type1"), bufferToReadable(VSBuffer.fromString("test"))),
        service.backup(toTypedWorkingCopyId(untitledFile, "type2"), bufferToReadable(VSBuffer.fromString("test")))
      ]);
      const backups = await service.getBackups();
      assert.strictEqual(backups.length, 3);
      for (const backup of backups) {
        if (backup.typeId === "") {
          assert.strictEqual(backup.resource.toString(), untitledFile.toString());
        } else if (backup.typeId === "type1") {
          assert.strictEqual(backup.resource.toString(), untitledFile.toString());
        } else if (backup.typeId === "type2") {
          assert.strictEqual(backup.resource.toString(), untitledFile.toString());
        } else {
          assert.fail("Unexpected backup");
        }
      }
    });
  });
  suite("resolve", () => {
    test("should restore the original contents (untitled file)", async () => {
      const contents = "test\nand more stuff";
      await testResolveBackup(untitledFile, contents);
    });
    test("should restore the original contents (untitled file with metadata)", async () => {
      const contents = "test\nand more stuff";
      const meta = {
        etag: "the Etag",
        size: 666,
        mtime: Date.now(),
        orphaned: true
      };
      await testResolveBackup(untitledFile, contents, meta);
    });
    test("should restore the original contents (untitled file empty with metadata)", async () => {
      const contents = "";
      const meta = {
        etag: "the Etag",
        size: 666,
        mtime: Date.now(),
        orphaned: true
      };
      await testResolveBackup(untitledFile, contents, meta);
    });
    test("should restore the original contents (untitled large file with metadata)", async () => {
      const contents = new Array(30 * 1024).join("Large String\n");
      const meta = {
        etag: "the Etag",
        size: 666,
        mtime: Date.now(),
        orphaned: true
      };
      await testResolveBackup(untitledFile, contents, meta);
    });
    test("should restore the original contents (text file)", async () => {
      const contents = [
        "Lorem ipsum ",
        "dolor \xF6\xE4\xFC sit amet ",
        "consectetur ",
        "adipiscing \xDF\xDF elit"
      ].join("");
      await testResolveBackup(fooFile, contents);
    });
    test("should restore the original contents (text file - custom scheme)", async () => {
      const contents = [
        "Lorem ipsum ",
        "dolor \xF6\xE4\xFC sit amet ",
        "consectetur ",
        "adipiscing \xDF\xDF elit"
      ].join("");
      await testResolveBackup(customFile, contents);
    });
    test("should restore the original contents (text file with metadata)", async () => {
      const contents = [
        "Lorem ipsum ",
        "dolor \xF6\xE4\xFC sit amet ",
        "adipiscing \xDF\xDF elit",
        "consectetur "
      ].join("");
      const meta = {
        etag: "theEtag",
        size: 888,
        mtime: Date.now(),
        orphaned: false
      };
      await testResolveBackup(fooFile, contents, meta);
    });
    test("should restore the original contents (empty text file with metadata)", async () => {
      const contents = "";
      const meta = {
        etag: "theEtag",
        size: 888,
        mtime: Date.now(),
        orphaned: false
      };
      await testResolveBackup(fooFile, contents, meta);
    });
    test("should restore the original contents (large text file with metadata)", async () => {
      const contents = new Array(30 * 1024).join("Large String\n");
      const meta = {
        etag: "theEtag",
        size: 888,
        mtime: Date.now(),
        orphaned: false
      };
      await testResolveBackup(fooFile, contents, meta);
    });
    test("should restore the original contents (text file with metadata changed once)", async () => {
      const contents = [
        "Lorem ipsum ",
        "dolor \xF6\xE4\xFC sit amet ",
        "adipiscing \xDF\xDF elit",
        "consectetur "
      ].join("");
      const meta = {
        etag: "theEtag",
        size: 888,
        mtime: Date.now(),
        orphaned: false
      };
      await testResolveBackup(fooFile, contents, meta);
      meta.size = 999;
      await testResolveBackup(fooFile, contents, meta);
    });
    test("should restore the original contents (text file with metadata and fragment URI)", async () => {
      const contents = [
        "Lorem ipsum ",
        "dolor \xF6\xE4\xFC sit amet ",
        "adipiscing \xDF\xDF elit",
        "consectetur "
      ].join("");
      const meta = {
        etag: "theEtag",
        size: 888,
        mtime: Date.now(),
        orphaned: false
      };
      await testResolveBackup(customFileWithFragment, contents, meta);
    });
    test("should restore the original contents (text file with space in name with metadata)", async () => {
      const contents = [
        "Lorem ipsum ",
        "dolor \xF6\xE4\xFC sit amet ",
        "adipiscing \xDF\xDF elit",
        "consectetur "
      ].join("");
      const meta = {
        etag: "theEtag",
        size: 888,
        mtime: Date.now(),
        orphaned: false
      };
      await testResolveBackup(fooBarFile, contents, meta);
    });
    test("should restore the original contents (text file with too large metadata to persist)", async () => {
      const contents = [
        "Lorem ipsum ",
        "dolor \xF6\xE4\xFC sit amet ",
        "adipiscing \xDF\xDF elit",
        "consectetur "
      ].join("");
      const meta = {
        etag: new Array(100 * 1024).join("Large String"),
        size: 888,
        mtime: Date.now(),
        orphaned: false
      };
      await testResolveBackup(fooFile, contents, meta, true);
    });
    async function testResolveBackup(resource, contents, meta, expectNoMeta) {
      await doTestResolveBackup(toUntypedWorkingCopyId(resource), contents, meta, expectNoMeta);
      await doTestResolveBackup(toTypedWorkingCopyId(resource), contents, meta, expectNoMeta);
    }
    async function doTestResolveBackup(identifier, contents, meta, expectNoMeta) {
      await service.backup(identifier, bufferToReadable(VSBuffer.fromString(contents)), 1, meta);
      const backup = await service.resolve(identifier);
      assert.ok(backup);
      assert.strictEqual(contents, (await streamToBuffer(backup.value)).toString());
      if (expectNoMeta || !meta) {
        assert.strictEqual(backup.meta, void 0);
      } else {
        assert.ok(backup.meta);
        assert.strictEqual(backup.meta.etag, meta.etag);
        assert.strictEqual(backup.meta.size, meta.size);
        assert.strictEqual(backup.meta.mtime, meta.mtime);
        assert.strictEqual(backup.meta.orphaned, meta.orphaned);
        assert.strictEqual(Object.keys(meta).length, Object.keys(backup.meta).length);
      }
    }
    test("should restore the original contents (text file with broken metadata)", async () => {
      await testShouldRestoreOriginalContentsWithBrokenBackup(toUntypedWorkingCopyId(fooFile));
      await testShouldRestoreOriginalContentsWithBrokenBackup(toTypedWorkingCopyId(fooFile));
    });
    async function testShouldRestoreOriginalContentsWithBrokenBackup(identifier) {
      const contents = [
        "Lorem ipsum ",
        "dolor \xF6\xE4\xFC sit amet ",
        "adipiscing \xDF\xDF elit",
        "consectetur "
      ].join("");
      const meta = {
        etag: "theEtag",
        size: 888,
        mtime: Date.now(),
        orphaned: false
      };
      await service.backup(identifier, bufferToReadable(VSBuffer.fromString(contents)), 1, meta);
      const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
      const fileContents = (await fileService.readFile(backupPath)).value.toString();
      assert.strictEqual(fileContents.indexOf(identifier.resource.toString()), 0);
      const metaIndex = fileContents.indexOf("{");
      const newFileContents = fileContents.substring(0, metaIndex) + "{{" + fileContents.substr(metaIndex);
      await fileService.writeFile(backupPath, VSBuffer.fromString(newFileContents));
      const backup = await service.resolve(identifier);
      assert.ok(backup);
      assert.strictEqual(contents, (await streamToBuffer(backup.value)).toString());
      assert.strictEqual(backup.meta, void 0);
    }
    test("should update metadata from file into model when resolving", async () => {
      await testShouldUpdateMetaFromFileWhenResolving(toUntypedWorkingCopyId(fooFile));
      await testShouldUpdateMetaFromFileWhenResolving(toTypedWorkingCopyId(fooFile));
    });
    async function testShouldUpdateMetaFromFileWhenResolving(identifier) {
      const contents = "Foo Bar";
      const meta = {
        etag: "theEtagForThisMetadataTest",
        size: 888,
        mtime: Date.now(),
        orphaned: false
      };
      const updatedMeta = {
        ...meta,
        etag: meta.etag + meta.etag
      };
      await service.backup(identifier, bufferToReadable(VSBuffer.fromString(contents)), 1, meta);
      const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
      const originalFileContents = (await fileService.readFile(backupPath)).value.toString();
      await fileService.writeFile(backupPath, VSBuffer.fromString(originalFileContents.replace(meta.etag, updatedMeta.etag)));
      await service.resolve(identifier);
      assert.strictEqual(service.hasBackupSync(identifier, void 0, meta), false);
      assert.strictEqual(service.hasBackupSync(identifier, void 0, updatedMeta), true);
      await fileService.writeFile(backupPath, VSBuffer.fromString(originalFileContents));
      await service.getBackups();
      assert.strictEqual(service.hasBackupSync(identifier, void 0, meta), true);
      assert.strictEqual(service.hasBackupSync(identifier, void 0, updatedMeta), false);
    }
    test("should ignore invalid backups (empty file)", async () => {
      const contents = "test\nand more stuff";
      await service.backup(toUntypedWorkingCopyId(fooFile), bufferToReadable(VSBuffer.fromString(contents)), 1);
      let backup = await service.resolve(toUntypedWorkingCopyId(fooFile));
      assert.ok(backup);
      await service.testGetFileService().writeFile(service.toBackupResource(toUntypedWorkingCopyId(fooFile)), VSBuffer.fromString(""));
      backup = await service.resolve(toUntypedWorkingCopyId(fooFile));
      assert.ok(!backup);
    });
    test("should ignore invalid backups (no preamble)", async () => {
      const contents = "testand more stuff";
      await service.backup(toUntypedWorkingCopyId(fooFile), bufferToReadable(VSBuffer.fromString(contents)), 1);
      let backup = await service.resolve(toUntypedWorkingCopyId(fooFile));
      assert.ok(backup);
      await service.testGetFileService().writeFile(service.toBackupResource(toUntypedWorkingCopyId(fooFile)), VSBuffer.fromString(contents));
      backup = await service.resolve(toUntypedWorkingCopyId(fooFile));
      assert.ok(!backup);
    });
    test("file with binary data", async () => {
      const identifier = toUntypedWorkingCopyId(fooFile);
      const buffer = Uint8Array.from([
        137,
        80,
        78,
        71,
        13,
        10,
        26,
        10,
        0,
        0,
        0,
        13,
        73,
        72,
        68,
        82,
        0,
        0,
        0,
        73,
        0,
        0,
        0,
        67,
        8,
        2,
        0,
        0,
        0,
        95,
        138,
        191,
        237,
        0,
        0,
        0,
        1,
        115,
        82,
        71,
        66,
        0,
        174,
        206,
        28,
        233,
        0,
        0,
        0,
        4,
        103,
        65,
        77,
        65,
        0,
        0,
        177,
        143,
        11,
        252,
        97,
        5,
        0,
        0,
        0,
        9,
        112,
        72,
        89,
        115,
        0,
        0,
        14,
        195,
        0,
        0,
        14,
        195,
        1,
        199,
        111,
        168,
        100,
        0,
        0,
        0,
        71,
        116,
        69,
        88,
        116,
        83,
        111,
        117,
        114,
        99,
        101,
        0,
        83,
        104,
        111,
        116,
        116,
        121,
        32,
        118,
        50,
        46,
        48,
        46,
        50,
        46,
        50,
        49,
        54,
        32,
        40,
        67,
        41,
        32,
        84,
        104,
        111,
        109,
        97,
        115,
        32,
        66,
        97,
        117,
        109,
        97,
        110,
        110,
        32,
        45,
        32,
        104,
        116,
        116,
        112,
        58,
        47,
        47,
        115,
        104,
        111,
        116,
        116,
        121,
        46,
        100,
        101,
        118,
        115,
        45,
        111,
        110,
        46,
        110,
        101,
        116,
        44,
        132,
        21,
        213,
        0,
        0,
        0,
        84,
        73,
        68,
        65,
        84,
        120,
        218,
        237,
        207,
        65,
        17,
        0,
        0,
        12,
        2,
        32,
        211,
        217,
        63,
        146,
        37,
        246,
        218,
        65,
        3,
        210,
        191,
        226,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        230,
        118,
        100,
        169,
        4,
        173,
        8,
        44,
        248,
        184,
        40,
        0,
        0,
        0,
        0,
        73,
        69,
        78,
        68,
        174,
        66,
        96,
        130
      ]);
      await service.backup(identifier, bufferToReadable(VSBuffer.wrap(buffer)), void 0, { binaryTest: "true" });
      const backup = await service.resolve(toUntypedWorkingCopyId(fooFile));
      assert.ok(backup);
      const backupBuffer = await consumeStream(backup.value, (chunks) => VSBuffer.concat(chunks));
      assert.strictEqual(backupBuffer.buffer.byteLength, buffer.byteLength);
    });
  });
  suite("WorkingCopyBackupsModel", () => {
    test("simple", async () => {
      const model = await WorkingCopyBackupsModel.create(workspaceBackupPath, service.testGetFileService());
      const resource1 = URI.file("test.html");
      assert.strictEqual(model.has(resource1), false);
      model.add(resource1);
      assert.strictEqual(model.has(resource1), true);
      assert.strictEqual(model.has(resource1, 0), true);
      assert.strictEqual(model.has(resource1, 1), false);
      assert.strictEqual(model.has(resource1, 1, { foo: "bar" }), false);
      model.remove(resource1);
      assert.strictEqual(model.has(resource1), false);
      model.add(resource1);
      assert.strictEqual(model.has(resource1), true);
      assert.strictEqual(model.has(resource1, 0), true);
      assert.strictEqual(model.has(resource1, 1), false);
      model.clear();
      assert.strictEqual(model.has(resource1), false);
      model.add(resource1, 1);
      assert.strictEqual(model.has(resource1), true);
      assert.strictEqual(model.has(resource1, 0), false);
      assert.strictEqual(model.has(resource1, 1), true);
      const resource2 = URI.file("test1.html");
      const resource3 = URI.file("test2.html");
      const resource4 = URI.file("test3.html");
      model.add(resource2);
      model.add(resource3);
      model.add(resource4, void 0, { foo: "bar" });
      assert.strictEqual(model.has(resource1), true);
      assert.strictEqual(model.has(resource2), true);
      assert.strictEqual(model.has(resource3), true);
      assert.strictEqual(model.has(resource4), true);
      assert.strictEqual(model.has(resource4, void 0, { foo: "bar" }), true);
      assert.strictEqual(model.has(resource4, void 0, { bar: "foo" }), false);
      model.update(resource4, { foo: "nothing" });
      assert.strictEqual(model.has(resource4, void 0, { foo: "nothing" }), true);
      assert.strictEqual(model.has(resource4, void 0, { foo: "bar" }), false);
      model.update(resource4);
      assert.strictEqual(model.has(resource4), true);
      assert.strictEqual(model.has(resource4, void 0, { foo: "nothing" }), false);
    });
    test("create", async () => {
      const fooBackupPath = joinPath(workspaceBackupPath, fooFile.scheme, hashIdentifier(toUntypedWorkingCopyId(fooFile)));
      await fileService.createFolder(dirname(fooBackupPath));
      await fileService.writeFile(fooBackupPath, VSBuffer.fromString("foo"));
      const model = await WorkingCopyBackupsModel.create(workspaceBackupPath, service.testGetFileService());
      assert.strictEqual(model.has(fooBackupPath), true);
    });
    test("get", async () => {
      const model = await WorkingCopyBackupsModel.create(workspaceBackupPath, service.testGetFileService());
      assert.deepStrictEqual(model.get(), []);
      const file1 = URI.file("/root/file/foo.html");
      const file2 = URI.file("/root/file/bar.html");
      const untitled = URI.file("/root/untitled/bar.html");
      model.add(file1);
      model.add(file2);
      model.add(untitled);
      assert.deepStrictEqual(model.get().map((f) => f.fsPath), [file1.fsPath, file2.fsPath, untitled.fsPath]);
    });
  });
  suite("typeId migration", () => {
    test("works (when meta is missing)", async () => {
      const fooBackupId = toUntypedWorkingCopyId(fooFile);
      const untitledBackupId = toUntypedWorkingCopyId(untitledFile);
      const customBackupId = toUntypedWorkingCopyId(customFile);
      const fooBackupPath = joinPath(workspaceBackupPath, fooFile.scheme, hashIdentifier(fooBackupId));
      const untitledBackupPath = joinPath(workspaceBackupPath, untitledFile.scheme, hashIdentifier(untitledBackupId));
      const customFileBackupPath = joinPath(workspaceBackupPath, customFile.scheme, hashIdentifier(customBackupId));
      await fileService.createFolder(joinPath(workspaceBackupPath, fooFile.scheme));
      await fileService.createFolder(joinPath(workspaceBackupPath, untitledFile.scheme));
      await fileService.createFolder(joinPath(workspaceBackupPath, customFile.scheme));
      await fileService.writeFile(fooBackupPath, VSBuffer.fromString(`${fooFile.toString()}
test file`));
      await fileService.writeFile(untitledBackupPath, VSBuffer.fromString(`${untitledFile.toString()}
test untitled`));
      await fileService.writeFile(customFileBackupPath, VSBuffer.fromString(`${customFile.toString()}
test custom`));
      service.reinitialize(workspaceBackupPath);
      const backups = await service.getBackups();
      assert.strictEqual(backups.length, 3);
      assert.ok(backups.some((backup) => isEqual(backup.resource, fooFile)));
      assert.ok(backups.some((backup) => isEqual(backup.resource, untitledFile)));
      assert.ok(backups.some((backup) => isEqual(backup.resource, customFile)));
      assert.ok(backups.every((backup) => backup.typeId === ""));
    });
    test("works (when typeId in meta is missing)", async () => {
      const fooBackupId = toUntypedWorkingCopyId(fooFile);
      const untitledBackupId = toUntypedWorkingCopyId(untitledFile);
      const customBackupId = toUntypedWorkingCopyId(customFile);
      const fooBackupPath = joinPath(workspaceBackupPath, fooFile.scheme, hashIdentifier(fooBackupId));
      const untitledBackupPath = joinPath(workspaceBackupPath, untitledFile.scheme, hashIdentifier(untitledBackupId));
      const customFileBackupPath = joinPath(workspaceBackupPath, customFile.scheme, hashIdentifier(customBackupId));
      await fileService.createFolder(joinPath(workspaceBackupPath, fooFile.scheme));
      await fileService.createFolder(joinPath(workspaceBackupPath, untitledFile.scheme));
      await fileService.createFolder(joinPath(workspaceBackupPath, customFile.scheme));
      await fileService.writeFile(fooBackupPath, VSBuffer.fromString(`${fooFile.toString()} ${JSON.stringify({ foo: "bar" })}
test file`));
      await fileService.writeFile(untitledBackupPath, VSBuffer.fromString(`${untitledFile.toString()} ${JSON.stringify({ foo: "bar" })}
test untitled`));
      await fileService.writeFile(customFileBackupPath, VSBuffer.fromString(`${customFile.toString()} ${JSON.stringify({ foo: "bar" })}
test custom`));
      service.reinitialize(workspaceBackupPath);
      const backups = await service.getBackups();
      assert.strictEqual(backups.length, 3);
      assert.ok(backups.some((backup) => isEqual(backup.resource, fooFile)));
      assert.ok(backups.some((backup) => isEqual(backup.resource, untitledFile)));
      assert.ok(backups.some((backup) => isEqual(backup.resource, customFile)));
      assert.ok(backups.every((backup) => backup.typeId === ""));
    });
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
export {
  NodeTestWorkingCopyBackupService,
  TestNativeWorkbenchEnvironmentService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx3b3JraW5nQ29weVxcdGVzdFxcZWxlY3Ryb24tYnJvd3Nlclxcd29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBpbnNlcnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgaGFzaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hhc2guanMnO1xuaW1wb3J0IHsgaXNFcXVhbCwgam9pblBhdGgsIGRpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFdvcmtpbmdDb3B5QmFja3Vwc01vZGVsLCBoYXNoSWRlbnRpZmllciB9IGZyb20gJy4uLy4uL2NvbW1vbi93b3JraW5nQ29weUJhY2t1cFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL3Rlc3QvY29tbW9uL3Rlc3RUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTG9nTGV2ZWwsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZW52aXJvbm1lbnQvZWxlY3Ryb24tYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgdG9CdWZmZXJPclJlYWRhYmxlIH0gZnJvbSAnLi4vLi4vLi4vdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgTmF0aXZlV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZWxlY3Ryb24tYnJvd3Nlci93b3JraW5nQ29weUJhY2t1cFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRmlsZVVzZXJEYXRhUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YS9jb21tb24vZmlsZVVzZXJEYXRhUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgYnVmZmVyVG9SZWFkYWJsZSwgYnVmZmVyVG9TdHJlYW0sIHN0cmVhbVRvQnVmZmVyLCBWU0J1ZmZlciwgVlNCdWZmZXJSZWFkYWJsZSwgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBUZXN0TGlmZWN5Y2xlU2VydmljZSwgdG9UeXBlZFdvcmtpbmdDb3B5SWQsIHRvVW50eXBlZFdvcmtpbmdDb3B5SWQgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlCYWNrdXBNZXRhLCBJV29ya2luZ0NvcHlJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vY29tbW9uL3dvcmtpbmdDb3B5LmpzJztcbmltcG9ydCB7IGNvbnN1bWVTdHJlYW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJlYW0uanMnO1xuaW1wb3J0IHsgVGVzdFByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZVdpbmRvd0NvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgcHJvZHVjdCBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5U2VydmljZS5qcyc7XG5cbmNvbnN0IGhvbWVEaXIgPSBVUkkuZmlsZSgnaG9tZScpLndpdGgoeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnkgfSk7XG5jb25zdCB0bXBEaXIgPSBVUkkuZmlsZSgndG1wJykud2l0aCh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSB9KTtcbmNvbnN0IE5VTExfUFJPRklMRSA9IHtcblx0bmFtZTogJycsXG5cdGlkOiAnJyxcblx0c2hvcnROYW1lOiAnJyxcblx0aXNEZWZhdWx0OiBmYWxzZSxcblx0bG9jYXRpb246IGhvbWVEaXIsXG5cdHNldHRpbmdzUmVzb3VyY2U6IGpvaW5QYXRoKGhvbWVEaXIsICdzZXR0aW5ncy5qc29uJyksXG5cdGdsb2JhbFN0b3JhZ2VIb21lOiBqb2luUGF0aChob21lRGlyLCAnZ2xvYmFsU3RvcmFnZScpLFxuXHRrZXliaW5kaW5nc1Jlc291cmNlOiBqb2luUGF0aChob21lRGlyLCAna2V5YmluZGluZ3MuanNvbicpLFxuXHR0YXNrc1Jlc291cmNlOiBqb2luUGF0aChob21lRGlyLCAndGFza3MuanNvbicpLFxuXHRtY3BSZXNvdXJjZTogam9pblBhdGgoaG9tZURpciwgJ21jcC5qc29uJyksXG5cdGxhbmd1YWdlTW9kZWxzUmVzb3VyY2U6IGpvaW5QYXRoKGhvbWVEaXIsICdjaGF0TGFuZ3VhZ2VNb2RlbHMuanNvbicpLFxuXHRzbmlwcGV0c0hvbWU6IGpvaW5QYXRoKGhvbWVEaXIsICdzbmlwcGV0cycpLFxuXHRwcm9tcHRzSG9tZTogam9pblBhdGgoaG9tZURpciwgJ3Byb21wdHMnKSxcblx0ZXh0ZW5zaW9uc1Jlc291cmNlOiBqb2luUGF0aChob21lRGlyLCAnZXh0ZW5zaW9ucy5qc29uJyksXG5cdGNhY2hlSG9tZTogam9pblBhdGgoaG9tZURpciwgJ2NhY2hlJyksXG5cdGFnZW50UGx1Z2luc0hvbWU6IGpvaW5QYXRoKGhvbWVEaXIsICdhZ2VudFBsdWdpbnNIb21lJyksXG59O1xuXG5jb25zdCBUZXN0TmF0aXZlV2luZG93Q29uZmlndXJhdGlvbjogSU5hdGl2ZVdpbmRvd0NvbmZpZ3VyYXRpb24gPSB7XG5cdHdpbmRvd0lkOiAwLFxuXHRtYWNoaW5lSWQ6ICd0ZXN0TWFjaGluZUlkJyxcblx0c3FtSWQ6ICd0ZXN0U3FtSWQnLFxuXHRkZXZEZXZpY2VJZDogJ3Rlc3RkZXZEZXZpY2VJZCcsXG5cdGlzUG9ydGFibGU6IGZhbHNlLFxuXHRsb2dMZXZlbDogTG9nTGV2ZWwuRXJyb3IsXG5cdGxvZ2dlcnM6IFtdLFxuXHRtYWluUGlkOiAwLFxuXHRhcHBSb290OiAnJyxcblx0dXNlckVudjoge30sXG5cdGV4ZWNQYXRoOiBwcm9jZXNzLmV4ZWNQYXRoLFxuXHRwZXJmTWFya3M6IFtdLFxuXHRjb2xvclNjaGVtZTogeyBkYXJrOiB0cnVlLCBoaWdoQ29udHJhc3Q6IGZhbHNlIH0sXG5cdG9zOiB7IHJlbGVhc2U6ICd1bmtub3duJywgaG9zdG5hbWU6ICd1bmtub3duJywgYXJjaDogJ3Vua25vd24nIH0sXG5cdHByb2R1Y3QsXG5cdGhvbWVEaXI6IGhvbWVEaXIuZnNQYXRoLFxuXHR0bXBEaXI6IHRtcERpci5mc1BhdGgsXG5cdHVzZXJEYXRhRGlyOiBqb2luUGF0aChob21lRGlyLCBwcm9kdWN0Lm5hbWVTaG9ydCkuZnNQYXRoLFxuXHRwcm9maWxlczogeyBwcm9maWxlOiBOVUxMX1BST0ZJTEUsIGFsbDogW05VTExfUFJPRklMRV0sIGhvbWU6IGhvbWVEaXIgfSxcblx0bmxzOiB7XG5cdFx0bWVzc2FnZXM6IFtdLFxuXHRcdGxhbmd1YWdlOiAnZW4nXG5cdH0sXG5cdF86IFtdXG59O1xuXG5leHBvcnQgY2xhc3MgVGVzdE5hdGl2ZVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBleHRlbmRzIE5hdGl2ZVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB7XG5cblx0Y29uc3RydWN0b3IodGVzdERpcjogVVJJLCBiYWNrdXBQYXRoOiBVUkkpIHtcblx0XHRzdXBlcih7IC4uLlRlc3ROYXRpdmVXaW5kb3dDb25maWd1cmF0aW9uLCBiYWNrdXBQYXRoOiBiYWNrdXBQYXRoLmZzUGF0aCwgJ3VzZXItZGF0YS1kaXInOiB0ZXN0RGlyLmZzUGF0aCB9LCBUZXN0UHJvZHVjdFNlcnZpY2UpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBOb2RlVGVzdFdvcmtpbmdDb3B5QmFja3VwU2VydmljZSBleHRlbmRzIE5hdGl2ZVdvcmtpbmdDb3B5QmFja3VwU2VydmljZSB7XG5cblx0cHJpdmF0ZSBiYWNrdXBSZXNvdXJjZUpvaW5lcnM6IEZ1bmN0aW9uW107XG5cdHByaXZhdGUgZGlzY2FyZEJhY2t1cEpvaW5lcnM6IEZ1bmN0aW9uW107XG5cdGRpc2NhcmRlZEJhY2t1cHM6IElXb3JraW5nQ29weUlkZW50aWZpZXJbXTtcblx0ZGlzY2FyZGVkQWxsQmFja3VwczogYm9vbGVhbjtcblx0cHJpdmF0ZSBwZW5kaW5nQmFja3Vwc0FycjogUHJvbWlzZTx2b2lkPltdO1xuXG5cdHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlO1xuXG5cdGNvbnN0cnVjdG9yKHRlc3REaXI6IFVSSSwgd29ya3NwYWNlQmFja3VwUGF0aDogVVJJKSB7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gbmV3IFRlc3ROYXRpdmVXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UodGVzdERpciwgd29ya3NwYWNlQmFja3VwUGF0aCk7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gbmV3IEZpbGVTZXJ2aWNlKGxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGxpZmVjeWNsZVNlcnZpY2UgPSBuZXcgVGVzdExpZmVjeWNsZVNlcnZpY2UoKTtcblx0XHRzdXBlcihlbnZpcm9ubWVudFNlcnZpY2UsIGZpbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBsaWZlY3ljbGVTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGZzcCA9IG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpO1xuXHRcdGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5pbk1lbW9yeSwgZnNwKTtcblx0XHRjb25zdCB1cmlJZGVudGl0eVNlcnZpY2UgPSBuZXcgVXJpSWRlbnRpdHlTZXJ2aWNlKGZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCB1c2VyRGF0YVByb2ZpbGVzU2VydmljZSA9IG5ldyBVc2VyRGF0YVByb2ZpbGVzU2VydmljZShlbnZpcm9ubWVudFNlcnZpY2UsIGZpbGVTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXHRcdGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy52c2NvZGVVc2VyRGF0YSwgbmV3IEZpbGVVc2VyRGF0YVByb3ZpZGVyKFNjaGVtYXMuZmlsZSwgZnNwLCBTY2hlbWFzLnZzY29kZVVzZXJEYXRhLCB1c2VyRGF0YVByb2ZpbGVzU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cblx0XHR0aGlzLl9maWxlU2VydmljZSA9IGZpbGVTZXJ2aWNlO1xuXG5cdFx0dGhpcy5iYWNrdXBSZXNvdXJjZUpvaW5lcnMgPSBbXTtcblx0XHR0aGlzLmRpc2NhcmRCYWNrdXBKb2luZXJzID0gW107XG5cdFx0dGhpcy5kaXNjYXJkZWRCYWNrdXBzID0gW107XG5cdFx0dGhpcy5wZW5kaW5nQmFja3Vwc0FyciA9IFtdO1xuXHRcdHRoaXMuZGlzY2FyZGVkQWxsQmFja3VwcyA9IGZhbHNlO1xuXHR9XG5cblx0dGVzdEdldEZpbGVTZXJ2aWNlKCk6IElGaWxlU2VydmljZSB7XG5cdFx0cmV0dXJuIHRoaXMuZmlsZVNlcnZpY2U7XG5cdH1cblxuXHRhc3luYyB3YWl0Rm9yQWxsQmFja3VwcygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBQcm9taXNlLmFsbCh0aGlzLnBlbmRpbmdCYWNrdXBzQXJyKTtcblx0fVxuXG5cdGpvaW5CYWNrdXBSZXNvdXJjZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB0aGlzLmJhY2t1cFJlc291cmNlSm9pbmVycy5wdXNoKHJlc29sdmUpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGJhY2t1cChpZGVudGlmaWVyOiBJV29ya2luZ0NvcHlJZGVudGlmaWVyLCBjb250ZW50PzogVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB8IFZTQnVmZmVyUmVhZGFibGUsIHZlcnNpb25JZD86IG51bWJlciwgbWV0YT86IGFueSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHAgPSBzdXBlci5iYWNrdXAoaWRlbnRpZmllciwgY29udGVudCwgdmVyc2lvbklkLCBtZXRhLCB0b2tlbik7XG5cdFx0Y29uc3QgcmVtb3ZlRnJvbVBlbmRpbmdCYWNrdXBzID0gaW5zZXJ0KHRoaXMucGVuZGluZ0JhY2t1cHNBcnIsIHAudGhlbih1bmRlZmluZWQsIHVuZGVmaW5lZCkpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHA7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlbW92ZUZyb21QZW5kaW5nQmFja3VwcygpO1xuXHRcdH1cblxuXHRcdHdoaWxlICh0aGlzLmJhY2t1cFJlc291cmNlSm9pbmVycy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuYmFja3VwUmVzb3VyY2VKb2luZXJzLnBvcCgpISgpO1xuXHRcdH1cblx0fVxuXG5cdGpvaW5EaXNjYXJkQmFja3VwKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHRoaXMuZGlzY2FyZEJhY2t1cEpvaW5lcnMucHVzaChyZXNvbHZlKSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBkaXNjYXJkQmFja3VwKGlkZW50aWZpZXI6IElXb3JraW5nQ29weUlkZW50aWZpZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBzdXBlci5kaXNjYXJkQmFja3VwKGlkZW50aWZpZXIpO1xuXHRcdHRoaXMuZGlzY2FyZGVkQmFja3Vwcy5wdXNoKGlkZW50aWZpZXIpO1xuXG5cdFx0d2hpbGUgKHRoaXMuZGlzY2FyZEJhY2t1cEpvaW5lcnMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmRpc2NhcmRCYWNrdXBKb2luZXJzLnBvcCgpISgpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGRpc2NhcmRCYWNrdXBzKGZpbHRlcj86IHsgZXhjZXB0OiBJV29ya2luZ0NvcHlJZGVudGlmaWVyW10gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuZGlzY2FyZGVkQWxsQmFja3VwcyA9IHRydWU7XG5cblx0XHRyZXR1cm4gc3VwZXIuZGlzY2FyZEJhY2t1cHMoZmlsdGVyKTtcblx0fVxuXG5cdGFzeW5jIGdldEJhY2t1cENvbnRlbnRzKGlkZW50aWZpZXI6IElXb3JraW5nQ29weUlkZW50aWZpZXIpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IGJhY2t1cFJlc291cmNlID0gdGhpcy50b0JhY2t1cFJlc291cmNlKGlkZW50aWZpZXIpO1xuXG5cdFx0Y29uc3QgZmlsZUNvbnRlbnRzID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShiYWNrdXBSZXNvdXJjZSk7XG5cblx0XHRyZXR1cm4gZmlsZUNvbnRlbnRzLnZhbHVlLnRvU3RyaW5nKCk7XG5cdH1cbn1cblxuc3VpdGUoJ1dvcmtpbmdDb3B5QmFja3VwU2VydmljZScsICgpID0+IHtcblxuXHRsZXQgdGVzdERpcjogVVJJO1xuXHRsZXQgYmFja3VwSG9tZTogVVJJO1xuXHRsZXQgd29ya3NwYWNlc0pzb25QYXRoOiBVUkk7XG5cdGxldCB3b3Jrc3BhY2VCYWNrdXBQYXRoOiBVUkk7XG5cblx0bGV0IHNlcnZpY2U6IE5vZGVUZXN0V29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlO1xuXHRsZXQgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZTtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRjb25zdCB3b3Jrc3BhY2VSZXNvdXJjZSA9IFVSSS5maWxlKGlzV2luZG93cyA/ICdjOlxcXFx3b3Jrc3BhY2UnIDogJy93b3Jrc3BhY2UnKTtcblx0Y29uc3QgZm9vRmlsZSA9IFVSSS5maWxlKGlzV2luZG93cyA/ICdjOlxcXFxGb28nIDogJy9Gb28nKTtcblx0Y29uc3QgY3VzdG9tRmlsZSA9IFVSSS5wYXJzZSgnY3VzdG9tU2NoZW1lOi8vc29tZS9wYXRoJyk7XG5cdGNvbnN0IGN1c3RvbUZpbGVXaXRoRnJhZ21lbnQgPSBVUkkucGFyc2UoJ2N1c3RvbVNjaGVtZTI6Ly9zb21lL3BhdGgjZnJhZ21lbnQnKTtcblx0Y29uc3QgYmFyRmlsZSA9IFVSSS5maWxlKGlzV2luZG93cyA/ICdjOlxcXFxCYXInIDogJy9CYXInKTtcblx0Y29uc3QgZm9vQmFyRmlsZSA9IFVSSS5maWxlKGlzV2luZG93cyA/ICdjOlxcXFxGb28gQmFyJyA6ICcvRm9vIEJhcicpO1xuXHRjb25zdCB1bnRpdGxlZEZpbGUgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy51bnRpdGxlZCwgcGF0aDogJ1VudGl0bGVkLTEnIH0pO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHR0ZXN0RGlyID0gVVJJLmZpbGUoam9pbihnZW5lcmF0ZVV1aWQoKSwgJ3ZzY3Rlc3RzJywgJ3dvcmtpbmdjb3B5YmFja3Vwc2VydmljZScpKS53aXRoKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5IH0pO1xuXHRcdGJhY2t1cEhvbWUgPSBqb2luUGF0aCh0ZXN0RGlyLCAnQmFja3VwcycpO1xuXHRcdHdvcmtzcGFjZXNKc29uUGF0aCA9IGpvaW5QYXRoKGJhY2t1cEhvbWUsICd3b3Jrc3BhY2VzLmpzb24nKTtcblx0XHR3b3Jrc3BhY2VCYWNrdXBQYXRoID0gam9pblBhdGgoYmFja3VwSG9tZSwgaGFzaCh3b3Jrc3BhY2VSZXNvdXJjZS5mc1BhdGgpLnRvU3RyaW5nKDE2KSk7XG5cblx0XHRzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBOb2RlVGVzdFdvcmtpbmdDb3B5QmFja3VwU2VydmljZSh0ZXN0RGlyLCB3b3Jrc3BhY2VCYWNrdXBQYXRoKSk7XG5cdFx0ZmlsZVNlcnZpY2UgPSBzZXJ2aWNlLl9maWxlU2VydmljZTtcblxuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihiYWNrdXBIb21lKTtcblxuXHRcdHJldHVybiBmaWxlU2VydmljZS53cml0ZUZpbGUod29ya3NwYWNlc0pzb25QYXRoLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCcnKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHRzdWl0ZSgnaGFzaElkZW50aWZpZXInLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGNvcnJlY3RseSBoYXNoIHRoZSBpZGVudGlmaWVyIGZvciB1bnRpdGxlZCBzY2hlbWUgVVJJcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLnVudGl0bGVkLCBwYXRoOiAnVW50aXRsZWQtMScgfSk7XG5cblx0XHRcdC8vICEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISFcblx0XHRcdC8vIElmIHRoZXNlIGhhc2hlcyBjaGFuZ2UgcGVvcGxlIHdpbGwgbG9zZSB0aGVpciBiYWNrZWQgdXAgZmlsZXNcblx0XHRcdC8vICEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISFcblxuXHRcdFx0Y29uc3QgdW50eXBlZEJhY2t1cEhhc2ggPSBoYXNoSWRlbnRpZmllcih0b1VudHlwZWRXb3JraW5nQ29weUlkKHVyaSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVudHlwZWRCYWNrdXBIYXNoLCAnLTdmOWMxYTJlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW50eXBlZEJhY2t1cEhhc2gsIGhhc2godXJpLmZzUGF0aCkudG9TdHJpbmcoMTYpKTtcblxuXHRcdFx0Y29uc3QgdHlwZWRCYWNrdXBIYXNoID0gaGFzaElkZW50aWZpZXIoeyB0eXBlSWQ6ICdoYXNoVGVzdCcsIHJlc291cmNlOiB1cmkgfSk7XG5cdFx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlZEJhY2t1cEhhc2gsICctMTdjNDdjZGMnKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlZEJhY2t1cEhhc2gsICctOGFkNWY0ZicpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyAhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhIVxuXHRcdFx0Ly8gSWYgdGhlc2UgaGFzaGVzIGNvbGxpZGUgcGVvcGxlIHdpbGwgbG9zZSB0aGVpciBiYWNrZWQgdXAgZmlsZXNcblx0XHRcdC8vICEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhXG5cblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh1bnR5cGVkQmFja3VwSGFzaCwgdHlwZWRCYWNrdXBIYXNoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBjb3JyZWN0bHkgaGFzaCB0aGUgaWRlbnRpZmllciBmb3IgZmlsZSBzY2hlbWUgVVJJcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvZm9vJyk7XG5cblx0XHRcdC8vICEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISFcblx0XHRcdC8vIElmIHRoZXNlIGhhc2hlcyBjaGFuZ2UgcGVvcGxlIHdpbGwgbG9zZSB0aGVpciBiYWNrZWQgdXAgZmlsZXNcblx0XHRcdC8vICEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISFcblxuXHRcdFx0Y29uc3QgdW50eXBlZEJhY2t1cEhhc2ggPSBoYXNoSWRlbnRpZmllcih0b1VudHlwZWRXb3JraW5nQ29weUlkKHVyaSkpO1xuXHRcdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW50eXBlZEJhY2t1cEhhc2gsICcyMGZmYWExMycpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVudHlwZWRCYWNrdXBIYXNoLCAnMjBlYjM1NjAnKTtcblx0XHRcdH1cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnR5cGVkQmFja3VwSGFzaCwgaGFzaCh1cmkuZnNQYXRoKS50b1N0cmluZygxNikpO1xuXG5cdFx0XHRjb25zdCB0eXBlZEJhY2t1cEhhc2ggPSBoYXNoSWRlbnRpZmllcih7IHR5cGVJZDogJ2hhc2hUZXN0JywgcmVzb3VyY2U6IHVyaSB9KTtcblx0XHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVkQmFja3VwSGFzaCwgJy01NWZjNTVkYicpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVkQmFja3VwSGFzaCwgJzUxZTU2YmYnKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISFcblx0XHRcdC8vIElmIHRoZXNlIGhhc2hlcyBjb2xsaWRlIHBlb3BsZSB3aWxsIGxvc2UgdGhlaXIgYmFja2VkIHVwIGZpbGVzXG5cdFx0XHQvLyAhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhIVxuXG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodW50eXBlZEJhY2t1cEhhc2gsIHR5cGVkQmFja3VwSGFzaCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgY29ycmVjdGx5IGhhc2ggdGhlIGlkZW50aWZpZXIgZm9yIGN1c3RvbSBzY2hlbWUgVVJJcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5mcm9tKHtcblx0XHRcdFx0c2NoZW1lOiAndnNjb2RlLWN1c3RvbScsXG5cdFx0XHRcdHBhdGg6ICdzb21lUGF0aCdcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyAhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhXG5cdFx0XHQvLyBJZiB0aGVzZSBoYXNoZXMgY2hhbmdlIHBlb3BsZSB3aWxsIGxvc2UgdGhlaXIgYmFja2VkIHVwIGZpbGVzXG5cdFx0XHQvLyAhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhXG5cblx0XHRcdGNvbnN0IHVudHlwZWRCYWNrdXBIYXNoID0gaGFzaElkZW50aWZpZXIodG9VbnR5cGVkV29ya2luZ0NvcHlJZCh1cmkpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnR5cGVkQmFja3VwSGFzaCwgJy00NDk3MmQ5OCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVudHlwZWRCYWNrdXBIYXNoLCBoYXNoKHVyaS50b1N0cmluZygpKS50b1N0cmluZygxNikpO1xuXG5cdFx0XHRjb25zdCB0eXBlZEJhY2t1cEhhc2ggPSBoYXNoSWRlbnRpZmllcih7IHR5cGVJZDogJ2hhc2hUZXN0JywgcmVzb3VyY2U6IHVyaSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlZEJhY2t1cEhhc2gsICc1MDIxNDljNycpO1xuXG5cdFx0XHQvLyAhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhIVxuXHRcdFx0Ly8gSWYgdGhlc2UgaGFzaGVzIGNvbGxpZGUgcGVvcGxlIHdpbGwgbG9zZSB0aGVpciBiYWNrZWQgdXAgZmlsZXNcblx0XHRcdC8vICEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhXG5cblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh1bnR5cGVkQmFja3VwSGFzaCwgdHlwZWRCYWNrdXBIYXNoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgZmFpbCBmb3IgVVJJcyB3aXRob3V0IHBhdGgnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7XG5cdFx0XHRcdHNjaGVtZTogJ3ZzY29kZS1mcmFnbWVudCcsXG5cdFx0XHRcdGZyYWdtZW50OiAnZnJhZydcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyAhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhXG5cdFx0XHQvLyBJZiB0aGVzZSBoYXNoZXMgY2hhbmdlIHBlb3BsZSB3aWxsIGxvc2UgdGhlaXIgYmFja2VkIHVwIGZpbGVzXG5cdFx0XHQvLyAhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhXG5cblx0XHRcdGNvbnN0IHVudHlwZWRCYWNrdXBIYXNoID0gaGFzaElkZW50aWZpZXIodG9VbnR5cGVkV29ya2luZ0NvcHlJZCh1cmkpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnR5cGVkQmFja3VwSGFzaCwgJy0yZjZiMmYxYicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVudHlwZWRCYWNrdXBIYXNoLCBoYXNoKHVyaS50b1N0cmluZygpKS50b1N0cmluZygxNikpO1xuXG5cdFx0XHRjb25zdCB0eXBlZEJhY2t1cEhhc2ggPSBoYXNoSWRlbnRpZmllcih7IHR5cGVJZDogJ2hhc2hUZXN0JywgcmVzb3VyY2U6IHVyaSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlZEJhY2t1cEhhc2gsICc2ZTgyY2E1NycpO1xuXG5cdFx0XHQvLyAhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhIVxuXHRcdFx0Ly8gSWYgdGhlc2UgaGFzaGVzIGNvbGxpZGUgcGVvcGxlIHdpbGwgbG9zZSB0aGVpciBiYWNrZWQgdXAgZmlsZXNcblx0XHRcdC8vICEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhXG5cblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh1bnR5cGVkQmFja3VwSGFzaCwgdHlwZWRCYWNrdXBIYXNoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldEJhY2t1cFJlc291cmNlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBnZXQgdGhlIGNvcnJlY3QgYmFja3VwIHBhdGggZm9yIHRleHQgZmlsZXMnLCAoKSA9PiB7XG5cblx0XHRcdC8vIEZvcm1hdCBzaG91bGQgYmU6IDxiYWNrdXBIb21lPi88d29ya3NwYWNlSGFzaD4vPHNjaGVtZT4vPGZpbGVQYXRoSGFzaD5cblx0XHRcdGNvbnN0IGJhY2t1cFJlc291cmNlID0gZm9vRmlsZTtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUhhc2ggPSBoYXNoKHdvcmtzcGFjZVJlc291cmNlLmZzUGF0aCkudG9TdHJpbmcoMTYpO1xuXG5cdFx0XHQvLyBObyBUeXBlIElEXG5cdFx0XHRsZXQgYmFja3VwSWQgPSB0b1VudHlwZWRXb3JraW5nQ29weUlkKGJhY2t1cFJlc291cmNlKTtcblx0XHRcdGxldCBmaWxlUGF0aEhhc2ggPSBoYXNoSWRlbnRpZmllcihiYWNrdXBJZCk7XG5cdFx0XHRsZXQgZXhwZWN0ZWRQYXRoID0gam9pblBhdGgoYmFja3VwSG9tZSwgd29ya3NwYWNlSGFzaCwgU2NoZW1hcy5maWxlLCBmaWxlUGF0aEhhc2gpLndpdGgoeyBzY2hlbWU6IFNjaGVtYXMudnNjb2RlVXNlckRhdGEgfSkudG9TdHJpbmcoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnRvQmFja3VwUmVzb3VyY2UoYmFja3VwSWQpLnRvU3RyaW5nKCksIGV4cGVjdGVkUGF0aCk7XG5cblx0XHRcdC8vIFdpdGggVHlwZSBJRFxuXHRcdFx0YmFja3VwSWQgPSB0b1R5cGVkV29ya2luZ0NvcHlJZChiYWNrdXBSZXNvdXJjZSk7XG5cdFx0XHRmaWxlUGF0aEhhc2ggPSBoYXNoSWRlbnRpZmllcihiYWNrdXBJZCk7XG5cdFx0XHRleHBlY3RlZFBhdGggPSBqb2luUGF0aChiYWNrdXBIb21lLCB3b3Jrc3BhY2VIYXNoLCBTY2hlbWFzLmZpbGUsIGZpbGVQYXRoSGFzaCkud2l0aCh7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVVc2VyRGF0YSB9KS50b1N0cmluZygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UudG9CYWNrdXBSZXNvdXJjZShiYWNrdXBJZCkudG9TdHJpbmcoKSwgZXhwZWN0ZWRQYXRoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBnZXQgdGhlIGNvcnJlY3QgYmFja3VwIHBhdGggZm9yIHVudGl0bGVkIGZpbGVzJywgKCkgPT4ge1xuXG5cdFx0XHQvLyBGb3JtYXQgc2hvdWxkIGJlOiA8YmFja3VwSG9tZT4vPHdvcmtzcGFjZUhhc2g+LzxzY2hlbWU+LzxmaWxlUGF0aEhhc2g+XG5cdFx0XHRjb25zdCBiYWNrdXBSZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLnVudGl0bGVkLCBwYXRoOiAnVW50aXRsZWQtMScgfSk7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VIYXNoID0gaGFzaCh3b3Jrc3BhY2VSZXNvdXJjZS5mc1BhdGgpLnRvU3RyaW5nKDE2KTtcblxuXHRcdFx0Ly8gTm8gVHlwZSBJRFxuXHRcdFx0bGV0IGJhY2t1cElkID0gdG9VbnR5cGVkV29ya2luZ0NvcHlJZChiYWNrdXBSZXNvdXJjZSk7XG5cdFx0XHRsZXQgZmlsZVBhdGhIYXNoID0gaGFzaElkZW50aWZpZXIoYmFja3VwSWQpO1xuXHRcdFx0bGV0IGV4cGVjdGVkUGF0aCA9IGpvaW5QYXRoKGJhY2t1cEhvbWUsIHdvcmtzcGFjZUhhc2gsIFNjaGVtYXMudW50aXRsZWQsIGZpbGVQYXRoSGFzaCkud2l0aCh7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVVc2VyRGF0YSB9KS50b1N0cmluZygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UudG9CYWNrdXBSZXNvdXJjZShiYWNrdXBJZCkudG9TdHJpbmcoKSwgZXhwZWN0ZWRQYXRoKTtcblxuXHRcdFx0Ly8gV2l0aCBUeXBlIElEXG5cdFx0XHRiYWNrdXBJZCA9IHRvVHlwZWRXb3JraW5nQ29weUlkKGJhY2t1cFJlc291cmNlKTtcblx0XHRcdGZpbGVQYXRoSGFzaCA9IGhhc2hJZGVudGlmaWVyKGJhY2t1cElkKTtcblx0XHRcdGV4cGVjdGVkUGF0aCA9IGpvaW5QYXRoKGJhY2t1cEhvbWUsIHdvcmtzcGFjZUhhc2gsIFNjaGVtYXMudW50aXRsZWQsIGZpbGVQYXRoSGFzaCkud2l0aCh7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVVc2VyRGF0YSB9KS50b1N0cmluZygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UudG9CYWNrdXBSZXNvdXJjZShiYWNrdXBJZCkudG9TdHJpbmcoKSwgZXhwZWN0ZWRQYXRoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBnZXQgdGhlIGNvcnJlY3QgYmFja3VwIHBhdGggZm9yIGN1c3RvbSBmaWxlcycsICgpID0+IHtcblxuXHRcdFx0Ly8gRm9ybWF0IHNob3VsZCBiZTogPGJhY2t1cEhvbWU+Lzx3b3Jrc3BhY2VIYXNoPi88c2NoZW1lPi88ZmlsZVBhdGhIYXNoPlxuXHRcdFx0Y29uc3QgYmFja3VwUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2N1c3RvbScsIHBhdGg6ICdjdXN0b20vZmlsZS50eHQnIH0pO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlSGFzaCA9IGhhc2god29ya3NwYWNlUmVzb3VyY2UuZnNQYXRoKS50b1N0cmluZygxNik7XG5cblx0XHRcdC8vIE5vIFR5cGUgSURcblx0XHRcdGxldCBiYWNrdXBJZCA9IHRvVW50eXBlZFdvcmtpbmdDb3B5SWQoYmFja3VwUmVzb3VyY2UpO1xuXHRcdFx0bGV0IGZpbGVQYXRoSGFzaCA9IGhhc2hJZGVudGlmaWVyKGJhY2t1cElkKTtcblx0XHRcdGxldCBleHBlY3RlZFBhdGggPSBqb2luUGF0aChiYWNrdXBIb21lLCB3b3Jrc3BhY2VIYXNoLCAnY3VzdG9tJywgZmlsZVBhdGhIYXNoKS53aXRoKHsgc2NoZW1lOiBTY2hlbWFzLnZzY29kZVVzZXJEYXRhIH0pLnRvU3RyaW5nKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS50b0JhY2t1cFJlc291cmNlKGJhY2t1cElkKS50b1N0cmluZygpLCBleHBlY3RlZFBhdGgpO1xuXG5cdFx0XHQvLyBXaXRoIFR5cGUgSURcblx0XHRcdGJhY2t1cElkID0gdG9UeXBlZFdvcmtpbmdDb3B5SWQoYmFja3VwUmVzb3VyY2UpO1xuXHRcdFx0ZmlsZVBhdGhIYXNoID0gaGFzaElkZW50aWZpZXIoYmFja3VwSWQpO1xuXHRcdFx0ZXhwZWN0ZWRQYXRoID0gam9pblBhdGgoYmFja3VwSG9tZSwgd29ya3NwYWNlSGFzaCwgJ2N1c3RvbScsIGZpbGVQYXRoSGFzaCkud2l0aCh7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVVc2VyRGF0YSB9KS50b1N0cmluZygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UudG9CYWNrdXBSZXNvdXJjZShiYWNrdXBJZCkudG9TdHJpbmcoKSwgZXhwZWN0ZWRQYXRoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2JhY2t1cCcsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIHRvRXhwZWN0ZWRQcmVhbWJsZShpZGVudGlmaWVyOiBJV29ya2luZ0NvcHlJZGVudGlmaWVyLCBjb250ZW50ID0gJycsIG1ldGE/OiBvYmplY3QpOiBzdHJpbmcge1xuXHRcdFx0cmV0dXJuIGAke2lkZW50aWZpZXIucmVzb3VyY2UudG9TdHJpbmcoKX0gJHtKU09OLnN0cmluZ2lmeSh7IC4uLm1ldGEsIHR5cGVJZDogaWRlbnRpZmllci50eXBlSWQgfSl9XFxuJHtjb250ZW50fWA7XG5cdFx0fVxuXG5cdFx0dGVzdCgnam9pbmluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBiYWNrdXBKb2luZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGpvaW5CYWNrdXBzUHJvbWlzZSA9IHNlcnZpY2Uuam9pbkJhY2t1cHMoKTtcblx0XHRcdGpvaW5CYWNrdXBzUHJvbWlzZS50aGVuKCgpID0+IGJhY2t1cEpvaW5lZCA9IHRydWUpO1xuXHRcdFx0YXdhaXQgam9pbkJhY2t1cHNQcm9taXNlO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhY2t1cEpvaW5lZCwgdHJ1ZSk7XG5cblx0XHRcdGJhY2t1cEpvaW5lZCA9IGZhbHNlO1xuXHRcdFx0c2VydmljZS5qb2luQmFja3VwcygpLnRoZW4oKCkgPT4gYmFja3VwSm9pbmVkID0gdHJ1ZSk7XG5cblx0XHRcdGNvbnN0IGlkZW50aWZpZXIgPSB0b1VudHlwZWRXb3JraW5nQ29weUlkKGZvb0ZpbGUpO1xuXHRcdFx0Y29uc3QgYmFja3VwUGF0aCA9IGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsIGlkZW50aWZpZXIucmVzb3VyY2Uuc2NoZW1lLCBoYXNoSWRlbnRpZmllcihpZGVudGlmaWVyKSk7XG5cblx0XHRcdGNvbnN0IGJhY2t1cFByb21pc2UgPSBzZXJ2aWNlLmJhY2t1cChpZGVudGlmaWVyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYWNrdXBKb2luZWQsIGZhbHNlKTtcblx0XHRcdGF3YWl0IGJhY2t1cFByb21pc2U7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFja3VwSm9pbmVkLCB0cnVlKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZXNvbHZlKGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsICdmaWxlJykpKS5jaGlsZHJlbj8ubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKGJhY2t1cFBhdGgpKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKGJhY2t1cFBhdGgpKS52YWx1ZS50b1N0cmluZygpLCB0b0V4cGVjdGVkUHJlYW1ibGUoaWRlbnRpZmllcikpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuaGFzQmFja3VwU3luYyhpZGVudGlmaWVyKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdubyB0ZXh0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaWRlbnRpZmllciA9IHRvVW50eXBlZFdvcmtpbmdDb3B5SWQoZm9vRmlsZSk7XG5cdFx0XHRjb25zdCBiYWNrdXBQYXRoID0gam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgaWRlbnRpZmllci5yZXNvdXJjZS5zY2hlbWUsIGhhc2hJZGVudGlmaWVyKGlkZW50aWZpZXIpKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5iYWNrdXAoaWRlbnRpZmllcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUoam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgJ2ZpbGUnKSkpLmNoaWxkcmVuPy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoYmFja3VwUGF0aCkpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoYmFja3VwUGF0aCkpLnZhbHVlLnRvU3RyaW5nKCksIHRvRXhwZWN0ZWRQcmVhbWJsZShpZGVudGlmaWVyKSk7XG5cdFx0XHRhc3NlcnQub2soc2VydmljZS5oYXNCYWNrdXBTeW5jKGlkZW50aWZpZXIpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RleHQgZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGlkZW50aWZpZXIgPSB0b1VudHlwZWRXb3JraW5nQ29weUlkKGZvb0ZpbGUpO1xuXHRcdFx0Y29uc3QgYmFja3VwUGF0aCA9IGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsIGlkZW50aWZpZXIucmVzb3VyY2Uuc2NoZW1lLCBoYXNoSWRlbnRpZmllcihpZGVudGlmaWVyKSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuYmFja3VwKGlkZW50aWZpZXIsIGJ1ZmZlclRvUmVhZGFibGUoVlNCdWZmZXIuZnJvbVN0cmluZygndGVzdCcpKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUoam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgJ2ZpbGUnKSkpLmNoaWxkcmVuPy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoYmFja3VwUGF0aCkpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoYmFja3VwUGF0aCkpLnZhbHVlLnRvU3RyaW5nKCksIHRvRXhwZWN0ZWRQcmVhbWJsZShpZGVudGlmaWVyLCAndGVzdCcpKTtcblx0XHRcdGFzc2VydC5vayhzZXJ2aWNlLmhhc0JhY2t1cFN5bmMoaWRlbnRpZmllcikpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGV4dCBmaWxlICh3aXRoIHZlcnNpb24pJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaWRlbnRpZmllciA9IHRvVW50eXBlZFdvcmtpbmdDb3B5SWQoZm9vRmlsZSk7XG5cdFx0XHRjb25zdCBiYWNrdXBQYXRoID0gam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgaWRlbnRpZmllci5yZXNvdXJjZS5zY2hlbWUsIGhhc2hJZGVudGlmaWVyKGlkZW50aWZpZXIpKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5iYWNrdXAoaWRlbnRpZmllciwgYnVmZmVyVG9SZWFkYWJsZShWU0J1ZmZlci5mcm9tU3RyaW5nKCd0ZXN0JykpLCA2NjYpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZXNvbHZlKGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsICdmaWxlJykpKS5jaGlsZHJlbj8ubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKGJhY2t1cFBhdGgpKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKGJhY2t1cFBhdGgpKS52YWx1ZS50b1N0cmluZygpLCB0b0V4cGVjdGVkUHJlYW1ibGUoaWRlbnRpZmllciwgJ3Rlc3QnKSk7XG5cdFx0XHRhc3NlcnQub2soIXNlcnZpY2UuaGFzQmFja3VwU3luYyhpZGVudGlmaWVyLCA1NTUpKTtcblx0XHRcdGFzc2VydC5vayhzZXJ2aWNlLmhhc0JhY2t1cFN5bmMoaWRlbnRpZmllciwgNjY2KSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0ZXh0IGZpbGUgKHdpdGggbWV0YSknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpZGVudGlmaWVyID0gdG9VbnR5cGVkV29ya2luZ0NvcHlJZChmb29GaWxlKTtcblx0XHRcdGNvbnN0IGJhY2t1cFBhdGggPSBqb2luUGF0aCh3b3Jrc3BhY2VCYWNrdXBQYXRoLCBpZGVudGlmaWVyLnJlc291cmNlLnNjaGVtZSwgaGFzaElkZW50aWZpZXIoaWRlbnRpZmllcikpO1xuXHRcdFx0Y29uc3QgbWV0YSA9IHsgZXRhZzogJzY3OCcsIG9ycGhhbmVkOiB0cnVlIH07XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuYmFja3VwKGlkZW50aWZpZXIsIGJ1ZmZlclRvUmVhZGFibGUoVlNCdWZmZXIuZnJvbVN0cmluZygndGVzdCcpKSwgdW5kZWZpbmVkLCBtZXRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UucmVzb2x2ZShqb2luUGF0aCh3b3Jrc3BhY2VCYWNrdXBQYXRoLCAnZmlsZScpKSkuY2hpbGRyZW4/Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhiYWNrdXBQYXRoKSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShiYWNrdXBQYXRoKSkudmFsdWUudG9TdHJpbmcoKSwgdG9FeHBlY3RlZFByZWFtYmxlKGlkZW50aWZpZXIsICd0ZXN0JywgbWV0YSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuaGFzQmFja3VwU3luYyhpZGVudGlmaWVyKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0ZXh0IGZpbGUgd2l0aCB3aGl0ZXNwYWNlIGluIG5hbWUgYW5kIHR5cGUgKHdpdGggbWV0YSknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWxlV2l0aFNwYWNlID0gVVJJLmZpbGUoaXNXaW5kb3dzID8gJ2M6XFxcXEZvbyBcXG4gQmFyJyA6ICcvRm9vIFxcbiBCYXInKTtcblx0XHRcdGNvbnN0IGlkZW50aWZpZXIgPSB0b1R5cGVkV29ya2luZ0NvcHlJZChmaWxlV2l0aFNwYWNlLCAnIHRlc3QgaWQgXFxuJyk7XG5cdFx0XHRjb25zdCBiYWNrdXBQYXRoID0gam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgaWRlbnRpZmllci5yZXNvdXJjZS5zY2hlbWUsIGhhc2hJZGVudGlmaWVyKGlkZW50aWZpZXIpKTtcblx0XHRcdGNvbnN0IG1ldGEgPSB7IGV0YWc6ICc2NzggXFxuIGsnLCBvcnBoYW5lZDogdHJ1ZSB9O1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmJhY2t1cChpZGVudGlmaWVyLCBidWZmZXJUb1JlYWRhYmxlKFZTQnVmZmVyLmZyb21TdHJpbmcoJ3Rlc3QnKSksIHVuZGVmaW5lZCwgbWV0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUoam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgJ2ZpbGUnKSkpLmNoaWxkcmVuPy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoYmFja3VwUGF0aCkpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoYmFja3VwUGF0aCkpLnZhbHVlLnRvU3RyaW5nKCksIHRvRXhwZWN0ZWRQcmVhbWJsZShpZGVudGlmaWVyLCAndGVzdCcsIG1ldGEpKTtcblx0XHRcdGFzc2VydC5vayhzZXJ2aWNlLmhhc0JhY2t1cFN5bmMoaWRlbnRpZmllcikpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGV4dCBmaWxlIHdpdGggdW5pY29kZSBjaGFyYWN0ZXIgaW4gbmFtZSBhbmQgdHlwZSAod2l0aCBtZXRhKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbGVXaXRoVW5pY29kZSA9IFVSSS5maWxlKGlzV2luZG93cyA/ICdjOlxcXFxzb1x1RDgwOFx1REMwNW1lXHUwODA0JyA6ICcvc29cdUQ4MDhcdURDMDVtZVx1MDgwNCcpO1xuXHRcdFx0Y29uc3QgaWRlbnRpZmllciA9IHRvVHlwZWRXb3JraW5nQ29weUlkKGZpbGVXaXRoVW5pY29kZSwgJyB0ZXN0IHNvXHVEODA4XHVEQzA1bWVcdTA4MDQgaWQgXFxuJyk7XG5cdFx0XHRjb25zdCBiYWNrdXBQYXRoID0gam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgaWRlbnRpZmllci5yZXNvdXJjZS5zY2hlbWUsIGhhc2hJZGVudGlmaWVyKGlkZW50aWZpZXIpKTtcblx0XHRcdGNvbnN0IG1ldGEgPSB7IGV0YWc6ICc2Nzhzb1x1RDgwOFx1REMwNW1lXHUwODA0Jywgb3JwaGFuZWQ6IHRydWUgfTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5iYWNrdXAoaWRlbnRpZmllciwgYnVmZmVyVG9SZWFkYWJsZShWU0J1ZmZlci5mcm9tU3RyaW5nKCd0ZXN0JykpLCB1bmRlZmluZWQsIG1ldGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZXNvbHZlKGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsICdmaWxlJykpKS5jaGlsZHJlbj8ubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKGJhY2t1cFBhdGgpKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKGJhY2t1cFBhdGgpKS52YWx1ZS50b1N0cmluZygpLCB0b0V4cGVjdGVkUHJlYW1ibGUoaWRlbnRpZmllciwgJ3Rlc3QnLCBtZXRhKSk7XG5cdFx0XHRhc3NlcnQub2soc2VydmljZS5oYXNCYWNrdXBTeW5jKGlkZW50aWZpZXIpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VudGl0bGVkIGZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpZGVudGlmaWVyID0gdG9VbnR5cGVkV29ya2luZ0NvcHlJZCh1bnRpdGxlZEZpbGUpO1xuXHRcdFx0Y29uc3QgYmFja3VwUGF0aCA9IGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsIGlkZW50aWZpZXIucmVzb3VyY2Uuc2NoZW1lLCBoYXNoSWRlbnRpZmllcihpZGVudGlmaWVyKSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuYmFja3VwKGlkZW50aWZpZXIsIGJ1ZmZlclRvUmVhZGFibGUoVlNCdWZmZXIuZnJvbVN0cmluZygndGVzdCcpKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUoam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgJ3VudGl0bGVkJykpKS5jaGlsZHJlbj8ubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKGJhY2t1cFBhdGgpKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKGJhY2t1cFBhdGgpKS52YWx1ZS50b1N0cmluZygpLCB0b0V4cGVjdGVkUHJlYW1ibGUoaWRlbnRpZmllciwgJ3Rlc3QnKSk7XG5cdFx0XHRhc3NlcnQub2soc2VydmljZS5oYXNCYWNrdXBTeW5jKGlkZW50aWZpZXIpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RleHQgZmlsZSAocmVhZGFibGUpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaWRlbnRpZmllciA9IHRvVW50eXBlZFdvcmtpbmdDb3B5SWQoZm9vRmlsZSk7XG5cdFx0XHRjb25zdCBiYWNrdXBQYXRoID0gam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgaWRlbnRpZmllci5yZXNvdXJjZS5zY2hlbWUsIGhhc2hJZGVudGlmaWVyKGlkZW50aWZpZXIpKTtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCd0ZXN0Jyk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuYmFja3VwKGlkZW50aWZpZXIsIHRvQnVmZmVyT3JSZWFkYWJsZShtb2RlbC5jcmVhdGVTbmFwc2hvdCgpKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUoam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgJ2ZpbGUnKSkpLmNoaWxkcmVuPy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoYmFja3VwUGF0aCkpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoYmFja3VwUGF0aCkpLnZhbHVlLnRvU3RyaW5nKCksIHRvRXhwZWN0ZWRQcmVhbWJsZShpZGVudGlmaWVyLCAndGVzdCcpKTtcblx0XHRcdGFzc2VydC5vayhzZXJ2aWNlLmhhc0JhY2t1cFN5bmMoaWRlbnRpZmllcikpO1xuXG5cdFx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1bnRpdGxlZCBmaWxlIChyZWFkYWJsZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpZGVudGlmaWVyID0gdG9VbnR5cGVkV29ya2luZ0NvcHlJZCh1bnRpdGxlZEZpbGUpO1xuXHRcdFx0Y29uc3QgYmFja3VwUGF0aCA9IGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsIGlkZW50aWZpZXIucmVzb3VyY2Uuc2NoZW1lLCBoYXNoSWRlbnRpZmllcihpZGVudGlmaWVyKSk7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgndGVzdCcpO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmJhY2t1cChpZGVudGlmaWVyLCB0b0J1ZmZlck9yUmVhZGFibGUobW9kZWwuY3JlYXRlU25hcHNob3QoKSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZXNvbHZlKGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsICd1bnRpdGxlZCcpKSkuY2hpbGRyZW4/Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhiYWNrdXBQYXRoKSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShiYWNrdXBQYXRoKSkudmFsdWUudG9TdHJpbmcoKSwgdG9FeHBlY3RlZFByZWFtYmxlKGlkZW50aWZpZXIsICd0ZXN0JykpO1xuXG5cdFx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0ZXh0IGZpbGUgKGxhcmdlIGZpbGUsIHN0cmVhbSknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsYXJnZVN0cmluZyA9IChuZXcgQXJyYXkoMzAgKiAxMDI0KSkuam9pbignTGFyZ2UgU3RyaW5nXFxuJyk7XG5cblx0XHRcdHJldHVybiB0ZXN0TGFyZ2VUZXh0RmlsZShsYXJnZVN0cmluZywgYnVmZmVyVG9TdHJlYW0oVlNCdWZmZXIuZnJvbVN0cmluZyhsYXJnZVN0cmluZykpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RleHQgZmlsZSAobGFyZ2UgZmlsZSwgcmVhZGFibGUpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGFyZ2VTdHJpbmcgPSAobmV3IEFycmF5KDMwICogMTAyNCkpLmpvaW4oJ0xhcmdlIFN0cmluZ1xcbicpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwobGFyZ2VTdHJpbmcpO1xuXG5cdFx0XHRhd2FpdCB0ZXN0TGFyZ2VUZXh0RmlsZShsYXJnZVN0cmluZywgdG9CdWZmZXJPclJlYWRhYmxlKG1vZGVsLmNyZWF0ZVNuYXBzaG90KCkpKTtcblxuXHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0YXN5bmMgZnVuY3Rpb24gdGVzdExhcmdlVGV4dEZpbGUobGFyZ2VTdHJpbmc6IHN0cmluZywgYnVmZmVyOiBWU0J1ZmZlclJlYWRhYmxlIHwgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSkge1xuXHRcdFx0Y29uc3QgaWRlbnRpZmllciA9IHRvVW50eXBlZFdvcmtpbmdDb3B5SWQoZm9vRmlsZSk7XG5cdFx0XHRjb25zdCBiYWNrdXBQYXRoID0gam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgaWRlbnRpZmllci5yZXNvdXJjZS5zY2hlbWUsIGhhc2hJZGVudGlmaWVyKGlkZW50aWZpZXIpKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5iYWNrdXAoaWRlbnRpZmllciwgYnVmZmVyLCB1bmRlZmluZWQsIHsgbGFyZ2VUZXN0OiB0cnVlIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZXNvbHZlKGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsICdmaWxlJykpKS5jaGlsZHJlbj8ubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKGJhY2t1cFBhdGgpKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKGJhY2t1cFBhdGgpKS52YWx1ZS50b1N0cmluZygpLCB0b0V4cGVjdGVkUHJlYW1ibGUoaWRlbnRpZmllciwgbGFyZ2VTdHJpbmcsIHsgbGFyZ2VUZXN0OiB0cnVlIH0pKTtcblx0XHRcdGFzc2VydC5vayhzZXJ2aWNlLmhhc0JhY2t1cFN5bmMoaWRlbnRpZmllcikpO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3VudGl0bGVkIGZpbGUgKGxhcmdlIGZpbGUsIHJlYWRhYmxlKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGlkZW50aWZpZXIgPSB0b1VudHlwZWRXb3JraW5nQ29weUlkKHVudGl0bGVkRmlsZSk7XG5cdFx0XHRjb25zdCBiYWNrdXBQYXRoID0gam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgaWRlbnRpZmllci5yZXNvdXJjZS5zY2hlbWUsIGhhc2hJZGVudGlmaWVyKGlkZW50aWZpZXIpKTtcblx0XHRcdGNvbnN0IGxhcmdlU3RyaW5nID0gKG5ldyBBcnJheSgzMCAqIDEwMjQpKS5qb2luKCdMYXJnZSBTdHJpbmdcXG4nKTtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKGxhcmdlU3RyaW5nKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5iYWNrdXAoaWRlbnRpZmllciwgdG9CdWZmZXJPclJlYWRhYmxlKG1vZGVsLmNyZWF0ZVNuYXBzaG90KCkpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UucmVzb2x2ZShqb2luUGF0aCh3b3Jrc3BhY2VCYWNrdXBQYXRoLCAndW50aXRsZWQnKSkpLmNoaWxkcmVuPy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoYmFja3VwUGF0aCkpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoYmFja3VwUGF0aCkpLnZhbHVlLnRvU3RyaW5nKCksIHRvRXhwZWN0ZWRQcmVhbWJsZShpZGVudGlmaWVyLCBsYXJnZVN0cmluZykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuaGFzQmFja3VwU3luYyhpZGVudGlmaWVyKSk7XG5cblx0XHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhbmNlbGxhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGlkZW50aWZpZXIgPSB0b1VudHlwZWRXb3JraW5nQ29weUlkKGZvb0ZpbGUpO1xuXHRcdFx0Y29uc3QgYmFja3VwUGF0aCA9IGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsIGlkZW50aWZpZXIucmVzb3VyY2Uuc2NoZW1lLCBoYXNoSWRlbnRpZmllcihpZGVudGlmaWVyKSk7XG5cblx0XHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0Y29uc3QgcHJvbWlzZSA9IHNlcnZpY2UuYmFja3VwKGlkZW50aWZpZXIsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGN0cy50b2tlbik7XG5cdFx0XHRjdHMuY2FuY2VsKCk7XG5cdFx0XHRhd2FpdCBwcm9taXNlO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhiYWNrdXBQYXRoKSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5vayghc2VydmljZS5oYXNCYWNrdXBTeW5jKGlkZW50aWZpZXIpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpcGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaWRlbnRpZmllciA9IHRvVW50eXBlZFdvcmtpbmdDb3B5SWQoZm9vRmlsZSk7XG5cdFx0XHRjb25zdCBiYWNrdXBQYXRoID0gam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgaWRlbnRpZmllci5yZXNvdXJjZS5zY2hlbWUsIGhhc2hJZGVudGlmaWVyKGlkZW50aWZpZXIpKTtcblxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRzZXJ2aWNlLmJhY2t1cChpZGVudGlmaWVyKSxcblx0XHRcdFx0c2VydmljZS5iYWNrdXAoaWRlbnRpZmllciksXG5cdFx0XHRcdHNlcnZpY2UuYmFja3VwKGlkZW50aWZpZXIpLFxuXHRcdFx0XHRzZXJ2aWNlLmJhY2t1cChpZGVudGlmaWVyKVxuXHRcdFx0XSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UucmVzb2x2ZShqb2luUGF0aCh3b3Jrc3BhY2VCYWNrdXBQYXRoLCAnZmlsZScpKSkuY2hpbGRyZW4/Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhiYWNrdXBQYXRoKSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShiYWNrdXBQYXRoKSkudmFsdWUudG9TdHJpbmcoKSwgdG9FeHBlY3RlZFByZWFtYmxlKGlkZW50aWZpZXIpKTtcblx0XHRcdGFzc2VydC5vayhzZXJ2aWNlLmhhc0JhY2t1cFN5bmMoaWRlbnRpZmllcikpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlwbGUgc2FtZSByZXNvdXJjZSwgZGlmZmVyZW50IHR5cGUgaWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBiYWNrdXBJZDEgPSB0b1VudHlwZWRXb3JraW5nQ29weUlkKGZvb0ZpbGUpO1xuXHRcdFx0Y29uc3QgYmFja3VwSWQyID0gdG9UeXBlZFdvcmtpbmdDb3B5SWQoZm9vRmlsZSwgJ3R5cGUxJyk7XG5cdFx0XHRjb25zdCBiYWNrdXBJZDMgPSB0b1R5cGVkV29ya2luZ0NvcHlJZChmb29GaWxlLCAndHlwZTInKTtcblxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRzZXJ2aWNlLmJhY2t1cChiYWNrdXBJZDEpLFxuXHRcdFx0XHRzZXJ2aWNlLmJhY2t1cChiYWNrdXBJZDIpLFxuXHRcdFx0XHRzZXJ2aWNlLmJhY2t1cChiYWNrdXBJZDMpXG5cdFx0XHRdKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZXNvbHZlKGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsICdmaWxlJykpKS5jaGlsZHJlbj8ubGVuZ3RoLCAzKTtcblxuXHRcdFx0Zm9yIChjb25zdCBiYWNrdXBJZCBvZiBbYmFja3VwSWQxLCBiYWNrdXBJZDIsIGJhY2t1cElkM10pIHtcblx0XHRcdFx0Y29uc3QgZm9vQmFja3VwUGF0aCA9IGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsIGJhY2t1cElkLnJlc291cmNlLnNjaGVtZSwgaGFzaElkZW50aWZpZXIoYmFja3VwSWQpKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoZm9vQmFja3VwUGF0aCkpLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShmb29CYWNrdXBQYXRoKSkudmFsdWUudG9TdHJpbmcoKSwgdG9FeHBlY3RlZFByZWFtYmxlKGJhY2t1cElkKSk7XG5cdFx0XHRcdGFzc2VydC5vayhzZXJ2aWNlLmhhc0JhY2t1cFN5bmMoYmFja3VwSWQpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2Rpc2NhcmRCYWNrdXAnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdqb2luaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaWRlbnRpZmllciA9IHRvVW50eXBlZFdvcmtpbmdDb3B5SWQoZm9vRmlsZSk7XG5cdFx0XHRjb25zdCBiYWNrdXBQYXRoID0gam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgaWRlbnRpZmllci5yZXNvdXJjZS5zY2hlbWUsIGhhc2hJZGVudGlmaWVyKGlkZW50aWZpZXIpKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5iYWNrdXAoaWRlbnRpZmllciwgYnVmZmVyVG9SZWFkYWJsZShWU0J1ZmZlci5mcm9tU3RyaW5nKCd0ZXN0JykpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UucmVzb2x2ZShqb2luUGF0aCh3b3Jrc3BhY2VCYWNrdXBQYXRoLCAnZmlsZScpKSkuY2hpbGRyZW4/Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQub2soc2VydmljZS5oYXNCYWNrdXBTeW5jKGlkZW50aWZpZXIpKTtcblxuXHRcdFx0bGV0IGJhY2t1cEpvaW5lZCA9IGZhbHNlO1xuXHRcdFx0c2VydmljZS5qb2luQmFja3VwcygpLnRoZW4oKCkgPT4gYmFja3VwSm9pbmVkID0gdHJ1ZSk7XG5cblx0XHRcdGNvbnN0IGRpc2NhcmRCYWNrdXBQcm9taXNlID0gc2VydmljZS5kaXNjYXJkQmFja3VwKGlkZW50aWZpZXIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhY2t1cEpvaW5lZCwgZmFsc2UpO1xuXHRcdFx0YXdhaXQgZGlzY2FyZEJhY2t1cFByb21pc2U7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFja3VwSm9pbmVkLCB0cnVlKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoYmFja3VwUGF0aCkpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUoam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgJ2ZpbGUnKSkpLmNoaWxkcmVuPy5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0Lm9rKCFzZXJ2aWNlLmhhc0JhY2t1cFN5bmMoaWRlbnRpZmllcikpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGV4dCBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaWRlbnRpZmllciA9IHRvVW50eXBlZFdvcmtpbmdDb3B5SWQoZm9vRmlsZSk7XG5cdFx0XHRjb25zdCBiYWNrdXBQYXRoID0gam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgaWRlbnRpZmllci5yZXNvdXJjZS5zY2hlbWUsIGhhc2hJZGVudGlmaWVyKGlkZW50aWZpZXIpKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5iYWNrdXAoaWRlbnRpZmllciwgYnVmZmVyVG9SZWFkYWJsZShWU0J1ZmZlci5mcm9tU3RyaW5nKCd0ZXN0JykpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UucmVzb2x2ZShqb2luUGF0aCh3b3Jrc3BhY2VCYWNrdXBQYXRoLCAnZmlsZScpKSkuY2hpbGRyZW4/Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQub2soc2VydmljZS5oYXNCYWNrdXBTeW5jKGlkZW50aWZpZXIpKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5kaXNjYXJkQmFja3VwKGlkZW50aWZpZXIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoYmFja3VwUGF0aCkpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUoam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgJ2ZpbGUnKSkpLmNoaWxkcmVuPy5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0Lm9rKCFzZXJ2aWNlLmhhc0JhY2t1cFN5bmMoaWRlbnRpZmllcikpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndW50aXRsZWQgZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGlkZW50aWZpZXIgPSB0b1VudHlwZWRXb3JraW5nQ29weUlkKHVudGl0bGVkRmlsZSk7XG5cdFx0XHRjb25zdCBiYWNrdXBQYXRoID0gam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgaWRlbnRpZmllci5yZXNvdXJjZS5zY2hlbWUsIGhhc2hJZGVudGlmaWVyKGlkZW50aWZpZXIpKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5iYWNrdXAoaWRlbnRpZmllciwgYnVmZmVyVG9SZWFkYWJsZShWU0J1ZmZlci5mcm9tU3RyaW5nKCd0ZXN0JykpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UucmVzb2x2ZShqb2luUGF0aCh3b3Jrc3BhY2VCYWNrdXBQYXRoLCAndW50aXRsZWQnKSkpLmNoaWxkcmVuPy5sZW5ndGgsIDEpO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmRpc2NhcmRCYWNrdXAoaWRlbnRpZmllcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhiYWNrdXBQYXRoKSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UucmVzb2x2ZShqb2luUGF0aCh3b3Jrc3BhY2VCYWNrdXBQYXRoLCAndW50aXRsZWQnKSkpLmNoaWxkcmVuPy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlwbGUgc2FtZSByZXNvdXJjZSwgZGlmZmVyZW50IHR5cGUgaWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBiYWNrdXBJZDEgPSB0b1VudHlwZWRXb3JraW5nQ29weUlkKGZvb0ZpbGUpO1xuXHRcdFx0Y29uc3QgYmFja3VwSWQyID0gdG9UeXBlZFdvcmtpbmdDb3B5SWQoZm9vRmlsZSwgJ3R5cGUxJyk7XG5cdFx0XHRjb25zdCBiYWNrdXBJZDMgPSB0b1R5cGVkV29ya2luZ0NvcHlJZChmb29GaWxlLCAndHlwZTInKTtcblxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRzZXJ2aWNlLmJhY2t1cChiYWNrdXBJZDEpLFxuXHRcdFx0XHRzZXJ2aWNlLmJhY2t1cChiYWNrdXBJZDIpLFxuXHRcdFx0XHRzZXJ2aWNlLmJhY2t1cChiYWNrdXBJZDMpXG5cdFx0XHRdKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZXNvbHZlKGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsICdmaWxlJykpKS5jaGlsZHJlbj8ubGVuZ3RoLCAzKTtcblxuXHRcdFx0Zm9yIChjb25zdCBiYWNrdXBJZCBvZiBbYmFja3VwSWQxLCBiYWNrdXBJZDIsIGJhY2t1cElkM10pIHtcblx0XHRcdFx0Y29uc3QgYmFja3VwUGF0aCA9IGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsIGJhY2t1cElkLnJlc291cmNlLnNjaGVtZSwgaGFzaElkZW50aWZpZXIoYmFja3VwSWQpKTtcblx0XHRcdFx0YXdhaXQgc2VydmljZS5kaXNjYXJkQmFja3VwKGJhY2t1cElkKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoYmFja3VwUGF0aCkpLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUoam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgJ2ZpbGUnKSkpLmNoaWxkcmVuPy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZGlzY2FyZEJhY2t1cHMgKGFsbCknLCAoKSA9PiB7XG5cdFx0dGVzdCgndGV4dCBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYmFja3VwSWQxID0gdG9VbnR5cGVkV29ya2luZ0NvcHlJZChmb29GaWxlKTtcblx0XHRcdGNvbnN0IGJhY2t1cElkMiA9IHRvVW50eXBlZFdvcmtpbmdDb3B5SWQoYmFyRmlsZSk7XG5cdFx0XHRjb25zdCBiYWNrdXBJZDMgPSB0b1R5cGVkV29ya2luZ0NvcHlJZChiYXJGaWxlKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5iYWNrdXAoYmFja3VwSWQxLCBidWZmZXJUb1JlYWRhYmxlKFZTQnVmZmVyLmZyb21TdHJpbmcoJ3Rlc3QnKSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZXNvbHZlKGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsICdmaWxlJykpKS5jaGlsZHJlbj8ubGVuZ3RoLCAxKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5iYWNrdXAoYmFja3VwSWQyLCBidWZmZXJUb1JlYWRhYmxlKFZTQnVmZmVyLmZyb21TdHJpbmcoJ3Rlc3QnKSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZXNvbHZlKGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsICdmaWxlJykpKS5jaGlsZHJlbj8ubGVuZ3RoLCAyKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5iYWNrdXAoYmFja3VwSWQzLCBidWZmZXJUb1JlYWRhYmxlKFZTQnVmZmVyLmZyb21TdHJpbmcoJ3Rlc3QnKSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZXNvbHZlKGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsICdmaWxlJykpKS5jaGlsZHJlbj8ubGVuZ3RoLCAzKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5kaXNjYXJkQmFja3VwcygpO1xuXHRcdFx0Zm9yIChjb25zdCBiYWNrdXBJZCBvZiBbYmFja3VwSWQxLCBiYWNrdXBJZDIsIGJhY2t1cElkM10pIHtcblx0XHRcdFx0Y29uc3QgYmFja3VwUGF0aCA9IGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsIGJhY2t1cElkLnJlc291cmNlLnNjaGVtZSwgaGFzaElkZW50aWZpZXIoYmFja3VwSWQpKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoYmFja3VwUGF0aCkpLCBmYWxzZSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsICdmaWxlJykpKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndW50aXRsZWQgZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGJhY2t1cElkID0gdG9VbnR5cGVkV29ya2luZ0NvcHlJZCh1bnRpdGxlZEZpbGUpO1xuXHRcdFx0Y29uc3QgYmFja3VwUGF0aCA9IGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsIGJhY2t1cElkLnJlc291cmNlLnNjaGVtZSwgaGFzaElkZW50aWZpZXIoYmFja3VwSWQpKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5iYWNrdXAoYmFja3VwSWQsIGJ1ZmZlclRvUmVhZGFibGUoVlNCdWZmZXIuZnJvbVN0cmluZygndGVzdCcpKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUoam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgJ3VudGl0bGVkJykpKS5jaGlsZHJlbj8ubGVuZ3RoLCAxKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5kaXNjYXJkQmFja3VwcygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoYmFja3VwUGF0aCkpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhqb2luUGF0aCh3b3Jrc3BhY2VCYWNrdXBQYXRoLCAndW50aXRsZWQnKSkpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYW4gYmFja3VwIGFmdGVyIGRpc2NhcmRpbmcgYWxsJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgc2VydmljZS5kaXNjYXJkQmFja3VwcygpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5iYWNrdXAodG9VbnR5cGVkV29ya2luZ0NvcHlJZCh1bnRpdGxlZEZpbGUpLCBidWZmZXJUb1JlYWRhYmxlKFZTQnVmZmVyLmZyb21TdHJpbmcoJ3Rlc3QnKSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5leGlzdHMod29ya3NwYWNlQmFja3VwUGF0aCkpLCB0cnVlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2Rpc2NhcmRCYWNrdXBzIChleGNlcHQgc29tZSknLCAoKSA9PiB7XG5cdFx0dGVzdCgndGV4dCBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYmFja3VwSWQxID0gdG9VbnR5cGVkV29ya2luZ0NvcHlJZChmb29GaWxlKTtcblx0XHRcdGNvbnN0IGJhY2t1cElkMiA9IHRvVW50eXBlZFdvcmtpbmdDb3B5SWQoYmFyRmlsZSk7XG5cdFx0XHRjb25zdCBiYWNrdXBJZDMgPSB0b1R5cGVkV29ya2luZ0NvcHlJZChiYXJGaWxlKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5iYWNrdXAoYmFja3VwSWQxLCBidWZmZXJUb1JlYWRhYmxlKFZTQnVmZmVyLmZyb21TdHJpbmcoJ3Rlc3QnKSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZXNvbHZlKGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsICdmaWxlJykpKS5jaGlsZHJlbj8ubGVuZ3RoLCAxKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5iYWNrdXAoYmFja3VwSWQyLCBidWZmZXJUb1JlYWRhYmxlKFZTQnVmZmVyLmZyb21TdHJpbmcoJ3Rlc3QnKSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZXNvbHZlKGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsICdmaWxlJykpKS5jaGlsZHJlbj8ubGVuZ3RoLCAyKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5iYWNrdXAoYmFja3VwSWQzLCBidWZmZXJUb1JlYWRhYmxlKFZTQnVmZmVyLmZyb21TdHJpbmcoJ3Rlc3QnKSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZXNvbHZlKGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsICdmaWxlJykpKS5jaGlsZHJlbj8ubGVuZ3RoLCAzKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5kaXNjYXJkQmFja3Vwcyh7IGV4Y2VwdDogW2JhY2t1cElkMiwgYmFja3VwSWQzXSB9KTtcblxuXHRcdFx0bGV0IGJhY2t1cFBhdGggPSBqb2luUGF0aCh3b3Jrc3BhY2VCYWNrdXBQYXRoLCBiYWNrdXBJZDEucmVzb3VyY2Uuc2NoZW1lLCBoYXNoSWRlbnRpZmllcihiYWNrdXBJZDEpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKGJhY2t1cFBhdGgpKSwgZmFsc2UpO1xuXG5cdFx0XHRiYWNrdXBQYXRoID0gam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgYmFja3VwSWQyLnJlc291cmNlLnNjaGVtZSwgaGFzaElkZW50aWZpZXIoYmFja3VwSWQyKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhiYWNrdXBQYXRoKSksIHRydWUpO1xuXG5cdFx0XHRiYWNrdXBQYXRoID0gam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgYmFja3VwSWQzLnJlc291cmNlLnNjaGVtZSwgaGFzaElkZW50aWZpZXIoYmFja3VwSWQzKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhiYWNrdXBQYXRoKSksIHRydWUpO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmRpc2NhcmRCYWNrdXBzKHsgZXhjZXB0OiBbYmFja3VwSWQxXSB9KTtcblxuXHRcdFx0Zm9yIChjb25zdCBiYWNrdXBJZCBvZiBbYmFja3VwSWQxLCBiYWNrdXBJZDIsIGJhY2t1cElkM10pIHtcblx0XHRcdFx0Y29uc3QgYmFja3VwUGF0aCA9IGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsIGJhY2t1cElkLnJlc291cmNlLnNjaGVtZSwgaGFzaElkZW50aWZpZXIoYmFja3VwSWQpKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoYmFja3VwUGF0aCkpLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1bnRpdGxlZCBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYmFja3VwSWQgPSB0b1VudHlwZWRXb3JraW5nQ29weUlkKHVudGl0bGVkRmlsZSk7XG5cdFx0XHRjb25zdCBiYWNrdXBQYXRoID0gam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgYmFja3VwSWQucmVzb3VyY2Uuc2NoZW1lLCBoYXNoSWRlbnRpZmllcihiYWNrdXBJZCkpO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmJhY2t1cChiYWNrdXBJZCwgYnVmZmVyVG9SZWFkYWJsZShWU0J1ZmZlci5mcm9tU3RyaW5nKCd0ZXN0JykpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKGJhY2t1cFBhdGgpKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUoam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgJ3VudGl0bGVkJykpKS5jaGlsZHJlbj8ubGVuZ3RoLCAxKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5kaXNjYXJkQmFja3Vwcyh7IGV4Y2VwdDogW2JhY2t1cElkXSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKGJhY2t1cFBhdGgpKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRCYWNrdXBzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3RleHQgZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0c2VydmljZS5iYWNrdXAodG9VbnR5cGVkV29ya2luZ0NvcHlJZChmb29GaWxlKSwgYnVmZmVyVG9SZWFkYWJsZShWU0J1ZmZlci5mcm9tU3RyaW5nKCd0ZXN0JykpKSxcblx0XHRcdFx0c2VydmljZS5iYWNrdXAodG9UeXBlZFdvcmtpbmdDb3B5SWQoZm9vRmlsZSwgJ3R5cGUxJyksIGJ1ZmZlclRvUmVhZGFibGUoVlNCdWZmZXIuZnJvbVN0cmluZygndGVzdCcpKSksXG5cdFx0XHRcdHNlcnZpY2UuYmFja3VwKHRvVHlwZWRXb3JraW5nQ29weUlkKGZvb0ZpbGUsICd0eXBlMicpLCBidWZmZXJUb1JlYWRhYmxlKFZTQnVmZmVyLmZyb21TdHJpbmcoJ3Rlc3QnKSkpXG5cdFx0XHRdKTtcblxuXHRcdFx0bGV0IGJhY2t1cHMgPSBhd2FpdCBzZXJ2aWNlLmdldEJhY2t1cHMoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYWNrdXBzLmxlbmd0aCwgMyk7XG5cblx0XHRcdGZvciAoY29uc3QgYmFja3VwIG9mIGJhY2t1cHMpIHtcblx0XHRcdFx0aWYgKGJhY2t1cC50eXBlSWQgPT09ICcnKSB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhY2t1cC5yZXNvdXJjZS50b1N0cmluZygpLCBmb29GaWxlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGJhY2t1cC50eXBlSWQgPT09ICd0eXBlMScpIHtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFja3VwLnJlc291cmNlLnRvU3RyaW5nKCksIGZvb0ZpbGUudG9TdHJpbmcoKSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoYmFja3VwLnR5cGVJZCA9PT0gJ3R5cGUyJykge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYWNrdXAucmVzb3VyY2UudG9TdHJpbmcoKSwgZm9vRmlsZS50b1N0cmluZygpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhc3NlcnQuZmFpbCgnVW5leHBlY3RlZCBiYWNrdXAnKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmJhY2t1cCh0b1VudHlwZWRXb3JraW5nQ29weUlkKGJhckZpbGUpLCBidWZmZXJUb1JlYWRhYmxlKFZTQnVmZmVyLmZyb21TdHJpbmcoJ3Rlc3QnKSkpO1xuXG5cdFx0XHRiYWNrdXBzID0gYXdhaXQgc2VydmljZS5nZXRCYWNrdXBzKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFja3Vwcy5sZW5ndGgsIDQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndW50aXRsZWQgZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0c2VydmljZS5iYWNrdXAodG9VbnR5cGVkV29ya2luZ0NvcHlJZCh1bnRpdGxlZEZpbGUpLCBidWZmZXJUb1JlYWRhYmxlKFZTQnVmZmVyLmZyb21TdHJpbmcoJ3Rlc3QnKSkpLFxuXHRcdFx0XHRzZXJ2aWNlLmJhY2t1cCh0b1R5cGVkV29ya2luZ0NvcHlJZCh1bnRpdGxlZEZpbGUsICd0eXBlMScpLCBidWZmZXJUb1JlYWRhYmxlKFZTQnVmZmVyLmZyb21TdHJpbmcoJ3Rlc3QnKSkpLFxuXHRcdFx0XHRzZXJ2aWNlLmJhY2t1cCh0b1R5cGVkV29ya2luZ0NvcHlJZCh1bnRpdGxlZEZpbGUsICd0eXBlMicpLCBidWZmZXJUb1JlYWRhYmxlKFZTQnVmZmVyLmZyb21TdHJpbmcoJ3Rlc3QnKSkpXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgYmFja3VwcyA9IGF3YWl0IHNlcnZpY2UuZ2V0QmFja3VwcygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhY2t1cHMubGVuZ3RoLCAzKTtcblxuXHRcdFx0Zm9yIChjb25zdCBiYWNrdXAgb2YgYmFja3Vwcykge1xuXHRcdFx0XHRpZiAoYmFja3VwLnR5cGVJZCA9PT0gJycpIHtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFja3VwLnJlc291cmNlLnRvU3RyaW5nKCksIHVudGl0bGVkRmlsZS50b1N0cmluZygpKTtcblx0XHRcdFx0fSBlbHNlIGlmIChiYWNrdXAudHlwZUlkID09PSAndHlwZTEnKSB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhY2t1cC5yZXNvdXJjZS50b1N0cmluZygpLCB1bnRpdGxlZEZpbGUudG9TdHJpbmcoKSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoYmFja3VwLnR5cGVJZCA9PT0gJ3R5cGUyJykge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYWNrdXAucmVzb3VyY2UudG9TdHJpbmcoKSwgdW50aXRsZWRGaWxlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFzc2VydC5mYWlsKCdVbmV4cGVjdGVkIGJhY2t1cCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZXNvbHZlJywgKCkgPT4ge1xuXG5cdFx0aW50ZXJmYWNlIElCYWNrdXBUZXN0TWV0YURhdGEgZXh0ZW5kcyBJV29ya2luZ0NvcHlCYWNrdXBNZXRhIHtcblx0XHRcdG10aW1lPzogbnVtYmVyO1xuXHRcdFx0c2l6ZT86IG51bWJlcjtcblx0XHRcdGV0YWc/OiBzdHJpbmc7XG5cdFx0XHRvcnBoYW5lZD86IGJvb2xlYW47XG5cdFx0fVxuXG5cdFx0dGVzdCgnc2hvdWxkIHJlc3RvcmUgdGhlIG9yaWdpbmFsIGNvbnRlbnRzICh1bnRpdGxlZCBmaWxlKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnRzID0gJ3Rlc3RcXG5hbmQgbW9yZSBzdHVmZic7XG5cblx0XHRcdGF3YWl0IHRlc3RSZXNvbHZlQmFja3VwKHVudGl0bGVkRmlsZSwgY29udGVudHMpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlc3RvcmUgdGhlIG9yaWdpbmFsIGNvbnRlbnRzICh1bnRpdGxlZCBmaWxlIHdpdGggbWV0YWRhdGEpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudHMgPSAndGVzdFxcbmFuZCBtb3JlIHN0dWZmJztcblxuXHRcdFx0Y29uc3QgbWV0YSA9IHtcblx0XHRcdFx0ZXRhZzogJ3RoZSBFdGFnJyxcblx0XHRcdFx0c2l6ZTogNjY2LFxuXHRcdFx0XHRtdGltZTogRGF0ZS5ub3coKSxcblx0XHRcdFx0b3JwaGFuZWQ6IHRydWVcblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IHRlc3RSZXNvbHZlQmFja3VwKHVudGl0bGVkRmlsZSwgY29udGVudHMsIG1ldGEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlc3RvcmUgdGhlIG9yaWdpbmFsIGNvbnRlbnRzICh1bnRpdGxlZCBmaWxlIGVtcHR5IHdpdGggbWV0YWRhdGEpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudHMgPSAnJztcblxuXHRcdFx0Y29uc3QgbWV0YSA9IHtcblx0XHRcdFx0ZXRhZzogJ3RoZSBFdGFnJyxcblx0XHRcdFx0c2l6ZTogNjY2LFxuXHRcdFx0XHRtdGltZTogRGF0ZS5ub3coKSxcblx0XHRcdFx0b3JwaGFuZWQ6IHRydWVcblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IHRlc3RSZXNvbHZlQmFja3VwKHVudGl0bGVkRmlsZSwgY29udGVudHMsIG1ldGEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlc3RvcmUgdGhlIG9yaWdpbmFsIGNvbnRlbnRzICh1bnRpdGxlZCBsYXJnZSBmaWxlIHdpdGggbWV0YWRhdGEpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudHMgPSAobmV3IEFycmF5KDMwICogMTAyNCkpLmpvaW4oJ0xhcmdlIFN0cmluZ1xcbicpO1xuXG5cdFx0XHRjb25zdCBtZXRhID0ge1xuXHRcdFx0XHRldGFnOiAndGhlIEV0YWcnLFxuXHRcdFx0XHRzaXplOiA2NjYsXG5cdFx0XHRcdG10aW1lOiBEYXRlLm5vdygpLFxuXHRcdFx0XHRvcnBoYW5lZDogdHJ1ZVxuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgdGVzdFJlc29sdmVCYWNrdXAodW50aXRsZWRGaWxlLCBjb250ZW50cywgbWV0YSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVzdG9yZSB0aGUgb3JpZ2luYWwgY29udGVudHMgKHRleHQgZmlsZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50cyA9IFtcblx0XHRcdFx0J0xvcmVtIGlwc3VtICcsXG5cdFx0XHRcdCdkb2xvciBcdTAwRjZcdTAwRTRcdTAwRkMgc2l0IGFtZXQgJyxcblx0XHRcdFx0J2NvbnNlY3RldHVyICcsXG5cdFx0XHRcdCdhZGlwaXNjaW5nIFx1MDBERlx1MDBERiBlbGl0J1xuXHRcdFx0XS5qb2luKCcnKTtcblxuXHRcdFx0YXdhaXQgdGVzdFJlc29sdmVCYWNrdXAoZm9vRmlsZSwgY29udGVudHMpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlc3RvcmUgdGhlIG9yaWdpbmFsIGNvbnRlbnRzICh0ZXh0IGZpbGUgLSBjdXN0b20gc2NoZW1lKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnRzID0gW1xuXHRcdFx0XHQnTG9yZW0gaXBzdW0gJyxcblx0XHRcdFx0J2RvbG9yIFx1MDBGNlx1MDBFNFx1MDBGQyBzaXQgYW1ldCAnLFxuXHRcdFx0XHQnY29uc2VjdGV0dXIgJyxcblx0XHRcdFx0J2FkaXBpc2NpbmcgXHUwMERGXHUwMERGIGVsaXQnXG5cdFx0XHRdLmpvaW4oJycpO1xuXG5cdFx0XHRhd2FpdCB0ZXN0UmVzb2x2ZUJhY2t1cChjdXN0b21GaWxlLCBjb250ZW50cyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVzdG9yZSB0aGUgb3JpZ2luYWwgY29udGVudHMgKHRleHQgZmlsZSB3aXRoIG1ldGFkYXRhKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnRzID0gW1xuXHRcdFx0XHQnTG9yZW0gaXBzdW0gJyxcblx0XHRcdFx0J2RvbG9yIFx1MDBGNlx1MDBFNFx1MDBGQyBzaXQgYW1ldCAnLFxuXHRcdFx0XHQnYWRpcGlzY2luZyBcdTAwREZcdTAwREYgZWxpdCcsXG5cdFx0XHRcdCdjb25zZWN0ZXR1ciAnXG5cdFx0XHRdLmpvaW4oJycpO1xuXG5cdFx0XHRjb25zdCBtZXRhID0ge1xuXHRcdFx0XHRldGFnOiAndGhlRXRhZycsXG5cdFx0XHRcdHNpemU6IDg4OCxcblx0XHRcdFx0bXRpbWU6IERhdGUubm93KCksXG5cdFx0XHRcdG9ycGhhbmVkOiBmYWxzZVxuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgdGVzdFJlc29sdmVCYWNrdXAoZm9vRmlsZSwgY29udGVudHMsIG1ldGEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlc3RvcmUgdGhlIG9yaWdpbmFsIGNvbnRlbnRzIChlbXB0eSB0ZXh0IGZpbGUgd2l0aCBtZXRhZGF0YSknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50cyA9ICcnO1xuXG5cdFx0XHRjb25zdCBtZXRhID0ge1xuXHRcdFx0XHRldGFnOiAndGhlRXRhZycsXG5cdFx0XHRcdHNpemU6IDg4OCxcblx0XHRcdFx0bXRpbWU6IERhdGUubm93KCksXG5cdFx0XHRcdG9ycGhhbmVkOiBmYWxzZVxuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgdGVzdFJlc29sdmVCYWNrdXAoZm9vRmlsZSwgY29udGVudHMsIG1ldGEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlc3RvcmUgdGhlIG9yaWdpbmFsIGNvbnRlbnRzIChsYXJnZSB0ZXh0IGZpbGUgd2l0aCBtZXRhZGF0YSknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50cyA9IChuZXcgQXJyYXkoMzAgKiAxMDI0KSkuam9pbignTGFyZ2UgU3RyaW5nXFxuJyk7XG5cblx0XHRcdGNvbnN0IG1ldGEgPSB7XG5cdFx0XHRcdGV0YWc6ICd0aGVFdGFnJyxcblx0XHRcdFx0c2l6ZTogODg4LFxuXHRcdFx0XHRtdGltZTogRGF0ZS5ub3coKSxcblx0XHRcdFx0b3JwaGFuZWQ6IGZhbHNlXG5cdFx0XHR9O1xuXG5cdFx0XHRhd2FpdCB0ZXN0UmVzb2x2ZUJhY2t1cChmb29GaWxlLCBjb250ZW50cywgbWV0YSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVzdG9yZSB0aGUgb3JpZ2luYWwgY29udGVudHMgKHRleHQgZmlsZSB3aXRoIG1ldGFkYXRhIGNoYW5nZWQgb25jZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50cyA9IFtcblx0XHRcdFx0J0xvcmVtIGlwc3VtICcsXG5cdFx0XHRcdCdkb2xvciBcdTAwRjZcdTAwRTRcdTAwRkMgc2l0IGFtZXQgJyxcblx0XHRcdFx0J2FkaXBpc2NpbmcgXHUwMERGXHUwMERGIGVsaXQnLFxuXHRcdFx0XHQnY29uc2VjdGV0dXIgJ1xuXHRcdFx0XS5qb2luKCcnKTtcblxuXHRcdFx0Y29uc3QgbWV0YSA9IHtcblx0XHRcdFx0ZXRhZzogJ3RoZUV0YWcnLFxuXHRcdFx0XHRzaXplOiA4ODgsXG5cdFx0XHRcdG10aW1lOiBEYXRlLm5vdygpLFxuXHRcdFx0XHRvcnBoYW5lZDogZmFsc2Vcblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IHRlc3RSZXNvbHZlQmFja3VwKGZvb0ZpbGUsIGNvbnRlbnRzLCBtZXRhKTtcblxuXHRcdFx0Ly8gQ2hhbmdlIG1ldGEgYW5kIHRlc3QgYWdhaW5cblx0XHRcdG1ldGEuc2l6ZSA9IDk5OTtcblx0XHRcdGF3YWl0IHRlc3RSZXNvbHZlQmFja3VwKGZvb0ZpbGUsIGNvbnRlbnRzLCBtZXRhKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXN0b3JlIHRoZSBvcmlnaW5hbCBjb250ZW50cyAodGV4dCBmaWxlIHdpdGggbWV0YWRhdGEgYW5kIGZyYWdtZW50IFVSSSknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50cyA9IFtcblx0XHRcdFx0J0xvcmVtIGlwc3VtICcsXG5cdFx0XHRcdCdkb2xvciBcdTAwRjZcdTAwRTRcdTAwRkMgc2l0IGFtZXQgJyxcblx0XHRcdFx0J2FkaXBpc2NpbmcgXHUwMERGXHUwMERGIGVsaXQnLFxuXHRcdFx0XHQnY29uc2VjdGV0dXIgJ1xuXHRcdFx0XS5qb2luKCcnKTtcblxuXHRcdFx0Y29uc3QgbWV0YSA9IHtcblx0XHRcdFx0ZXRhZzogJ3RoZUV0YWcnLFxuXHRcdFx0XHRzaXplOiA4ODgsXG5cdFx0XHRcdG10aW1lOiBEYXRlLm5vdygpLFxuXHRcdFx0XHRvcnBoYW5lZDogZmFsc2Vcblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IHRlc3RSZXNvbHZlQmFja3VwKGN1c3RvbUZpbGVXaXRoRnJhZ21lbnQsIGNvbnRlbnRzLCBtZXRhKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXN0b3JlIHRoZSBvcmlnaW5hbCBjb250ZW50cyAodGV4dCBmaWxlIHdpdGggc3BhY2UgaW4gbmFtZSB3aXRoIG1ldGFkYXRhKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnRzID0gW1xuXHRcdFx0XHQnTG9yZW0gaXBzdW0gJyxcblx0XHRcdFx0J2RvbG9yIFx1MDBGNlx1MDBFNFx1MDBGQyBzaXQgYW1ldCAnLFxuXHRcdFx0XHQnYWRpcGlzY2luZyBcdTAwREZcdTAwREYgZWxpdCcsXG5cdFx0XHRcdCdjb25zZWN0ZXR1ciAnXG5cdFx0XHRdLmpvaW4oJycpO1xuXG5cdFx0XHRjb25zdCBtZXRhID0ge1xuXHRcdFx0XHRldGFnOiAndGhlRXRhZycsXG5cdFx0XHRcdHNpemU6IDg4OCxcblx0XHRcdFx0bXRpbWU6IERhdGUubm93KCksXG5cdFx0XHRcdG9ycGhhbmVkOiBmYWxzZVxuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgdGVzdFJlc29sdmVCYWNrdXAoZm9vQmFyRmlsZSwgY29udGVudHMsIG1ldGEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlc3RvcmUgdGhlIG9yaWdpbmFsIGNvbnRlbnRzICh0ZXh0IGZpbGUgd2l0aCB0b28gbGFyZ2UgbWV0YWRhdGEgdG8gcGVyc2lzdCknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50cyA9IFtcblx0XHRcdFx0J0xvcmVtIGlwc3VtICcsXG5cdFx0XHRcdCdkb2xvciBcdTAwRjZcdTAwRTRcdTAwRkMgc2l0IGFtZXQgJyxcblx0XHRcdFx0J2FkaXBpc2NpbmcgXHUwMERGXHUwMERGIGVsaXQnLFxuXHRcdFx0XHQnY29uc2VjdGV0dXIgJ1xuXHRcdFx0XS5qb2luKCcnKTtcblxuXHRcdFx0Y29uc3QgbWV0YSA9IHtcblx0XHRcdFx0ZXRhZzogKG5ldyBBcnJheSgxMDAgKiAxMDI0KSkuam9pbignTGFyZ2UgU3RyaW5nJyksXG5cdFx0XHRcdHNpemU6IDg4OCxcblx0XHRcdFx0bXRpbWU6IERhdGUubm93KCksXG5cdFx0XHRcdG9ycGhhbmVkOiBmYWxzZVxuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgdGVzdFJlc29sdmVCYWNrdXAoZm9vRmlsZSwgY29udGVudHMsIG1ldGEsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0YXN5bmMgZnVuY3Rpb24gdGVzdFJlc29sdmVCYWNrdXAocmVzb3VyY2U6IFVSSSwgY29udGVudHM6IHN0cmluZywgbWV0YT86IElCYWNrdXBUZXN0TWV0YURhdGEsIGV4cGVjdE5vTWV0YT86IGJvb2xlYW4pIHtcblx0XHRcdGF3YWl0IGRvVGVzdFJlc29sdmVCYWNrdXAodG9VbnR5cGVkV29ya2luZ0NvcHlJZChyZXNvdXJjZSksIGNvbnRlbnRzLCBtZXRhLCBleHBlY3ROb01ldGEpO1xuXHRcdFx0YXdhaXQgZG9UZXN0UmVzb2x2ZUJhY2t1cCh0b1R5cGVkV29ya2luZ0NvcHlJZChyZXNvdXJjZSksIGNvbnRlbnRzLCBtZXRhLCBleHBlY3ROb01ldGEpO1xuXHRcdH1cblxuXHRcdGFzeW5jIGZ1bmN0aW9uIGRvVGVzdFJlc29sdmVCYWNrdXAoaWRlbnRpZmllcjogSVdvcmtpbmdDb3B5SWRlbnRpZmllciwgY29udGVudHM6IHN0cmluZywgbWV0YT86IElCYWNrdXBUZXN0TWV0YURhdGEsIGV4cGVjdE5vTWV0YT86IGJvb2xlYW4pIHtcblx0XHRcdGF3YWl0IHNlcnZpY2UuYmFja3VwKGlkZW50aWZpZXIsIGJ1ZmZlclRvUmVhZGFibGUoVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50cykpLCAxLCBtZXRhKTtcblxuXHRcdFx0Y29uc3QgYmFja3VwID0gYXdhaXQgc2VydmljZS5yZXNvbHZlPElCYWNrdXBUZXN0TWV0YURhdGE+KGlkZW50aWZpZXIpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJhY2t1cCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudHMsIChhd2FpdCBzdHJlYW1Ub0J1ZmZlcihiYWNrdXAudmFsdWUpKS50b1N0cmluZygpKTtcblxuXHRcdFx0aWYgKGV4cGVjdE5vTWV0YSB8fCAhbWV0YSkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFja3VwLm1ldGEsIHVuZGVmaW5lZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhc3NlcnQub2soYmFja3VwLm1ldGEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFja3VwLm1ldGEuZXRhZywgbWV0YS5ldGFnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhY2t1cC5tZXRhLnNpemUsIG1ldGEuc2l6ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYWNrdXAubWV0YS5tdGltZSwgbWV0YS5tdGltZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYWNrdXAubWV0YS5vcnBoYW5lZCwgbWV0YS5vcnBoYW5lZCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKE9iamVjdC5rZXlzKG1ldGEpLmxlbmd0aCwgT2JqZWN0LmtleXMoYmFja3VwLm1ldGEpLmxlbmd0aCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGVzdCgnc2hvdWxkIHJlc3RvcmUgdGhlIG9yaWdpbmFsIGNvbnRlbnRzICh0ZXh0IGZpbGUgd2l0aCBicm9rZW4gbWV0YWRhdGEpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgdGVzdFNob3VsZFJlc3RvcmVPcmlnaW5hbENvbnRlbnRzV2l0aEJyb2tlbkJhY2t1cCh0b1VudHlwZWRXb3JraW5nQ29weUlkKGZvb0ZpbGUpKTtcblx0XHRcdGF3YWl0IHRlc3RTaG91bGRSZXN0b3JlT3JpZ2luYWxDb250ZW50c1dpdGhCcm9rZW5CYWNrdXAodG9UeXBlZFdvcmtpbmdDb3B5SWQoZm9vRmlsZSkpO1xuXHRcdH0pO1xuXG5cdFx0YXN5bmMgZnVuY3Rpb24gdGVzdFNob3VsZFJlc3RvcmVPcmlnaW5hbENvbnRlbnRzV2l0aEJyb2tlbkJhY2t1cChpZGVudGlmaWVyOiBJV29ya2luZ0NvcHlJZGVudGlmaWVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCBjb250ZW50cyA9IFtcblx0XHRcdFx0J0xvcmVtIGlwc3VtICcsXG5cdFx0XHRcdCdkb2xvciBcdTAwRjZcdTAwRTRcdTAwRkMgc2l0IGFtZXQgJyxcblx0XHRcdFx0J2FkaXBpc2NpbmcgXHUwMERGXHUwMERGIGVsaXQnLFxuXHRcdFx0XHQnY29uc2VjdGV0dXIgJ1xuXHRcdFx0XS5qb2luKCcnKTtcblxuXHRcdFx0Y29uc3QgbWV0YSA9IHtcblx0XHRcdFx0ZXRhZzogJ3RoZUV0YWcnLFxuXHRcdFx0XHRzaXplOiA4ODgsXG5cdFx0XHRcdG10aW1lOiBEYXRlLm5vdygpLFxuXHRcdFx0XHRvcnBoYW5lZDogZmFsc2Vcblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuYmFja3VwKGlkZW50aWZpZXIsIGJ1ZmZlclRvUmVhZGFibGUoVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50cykpLCAxLCBtZXRhKTtcblxuXHRcdFx0Y29uc3QgYmFja3VwUGF0aCA9IGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsIGlkZW50aWZpZXIucmVzb3VyY2Uuc2NoZW1lLCBoYXNoSWRlbnRpZmllcihpZGVudGlmaWVyKSk7XG5cblx0XHRcdGNvbnN0IGZpbGVDb250ZW50cyA9IChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShiYWNrdXBQYXRoKSkudmFsdWUudG9TdHJpbmcoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlQ29udGVudHMuaW5kZXhPZihpZGVudGlmaWVyLnJlc291cmNlLnRvU3RyaW5nKCkpLCAwKTtcblxuXHRcdFx0Y29uc3QgbWV0YUluZGV4ID0gZmlsZUNvbnRlbnRzLmluZGV4T2YoJ3snKTtcblx0XHRcdGNvbnN0IG5ld0ZpbGVDb250ZW50cyA9IGZpbGVDb250ZW50cy5zdWJzdHJpbmcoMCwgbWV0YUluZGV4KSArICd7eycgKyBmaWxlQ29udGVudHMuc3Vic3RyKG1ldGFJbmRleCk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoYmFja3VwUGF0aCwgVlNCdWZmZXIuZnJvbVN0cmluZyhuZXdGaWxlQ29udGVudHMpKTtcblxuXHRcdFx0Y29uc3QgYmFja3VwID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKGlkZW50aWZpZXIpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJhY2t1cCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudHMsIChhd2FpdCBzdHJlYW1Ub0J1ZmZlcihiYWNrdXAudmFsdWUpKS50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYWNrdXAubWV0YSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHR0ZXN0KCdzaG91bGQgdXBkYXRlIG1ldGFkYXRhIGZyb20gZmlsZSBpbnRvIG1vZGVsIHdoZW4gcmVzb2x2aW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgdGVzdFNob3VsZFVwZGF0ZU1ldGFGcm9tRmlsZVdoZW5SZXNvbHZpbmcodG9VbnR5cGVkV29ya2luZ0NvcHlJZChmb29GaWxlKSk7XG5cdFx0XHRhd2FpdCB0ZXN0U2hvdWxkVXBkYXRlTWV0YUZyb21GaWxlV2hlblJlc29sdmluZyh0b1R5cGVkV29ya2luZ0NvcHlJZChmb29GaWxlKSk7XG5cdFx0fSk7XG5cblx0XHRhc3luYyBmdW5jdGlvbiB0ZXN0U2hvdWxkVXBkYXRlTWV0YUZyb21GaWxlV2hlblJlc29sdmluZyhpZGVudGlmaWVyOiBJV29ya2luZ0NvcHlJZGVudGlmaWVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCBjb250ZW50cyA9ICdGb28gQmFyJztcblxuXHRcdFx0Y29uc3QgbWV0YSA9IHtcblx0XHRcdFx0ZXRhZzogJ3RoZUV0YWdGb3JUaGlzTWV0YWRhdGFUZXN0Jyxcblx0XHRcdFx0c2l6ZTogODg4LFxuXHRcdFx0XHRtdGltZTogRGF0ZS5ub3coKSxcblx0XHRcdFx0b3JwaGFuZWQ6IGZhbHNlXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB1cGRhdGVkTWV0YSA9IHtcblx0XHRcdFx0Li4ubWV0YSxcblx0XHRcdFx0ZXRhZzogbWV0YS5ldGFnICsgbWV0YS5ldGFnXG5cdFx0XHR9O1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmJhY2t1cChpZGVudGlmaWVyLCBidWZmZXJUb1JlYWRhYmxlKFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudHMpKSwgMSwgbWV0YSk7XG5cblx0XHRcdGNvbnN0IGJhY2t1cFBhdGggPSBqb2luUGF0aCh3b3Jrc3BhY2VCYWNrdXBQYXRoLCBpZGVudGlmaWVyLnJlc291cmNlLnNjaGVtZSwgaGFzaElkZW50aWZpZXIoaWRlbnRpZmllcikpO1xuXG5cdFx0XHQvLyBTaW11bGF0ZSB0aGUgY29uZGl0aW9uIG9mIHRoZSBiYWNrdXBzIG1vZGVsIGxvYWRpbmcgaW5pdGlhbGx5IHdpdGhvdXRcblx0XHRcdC8vIG1ldGEgZGF0YSBpbmZvcm1hdGlvbiBhbmQgdGhlbiBnZXR0aW5nIHRoZSBtZXRhIGRhdGEgdXBkYXRlZCBvbiB0aGVcblx0XHRcdC8vIGZpcnN0IGNhbGwgdG8gcmVzb2x2ZSB0aGUgYmFja3VwLiBXZSBzaW11bGF0ZSB0aGlzIGJ5IGV4cGxpY2l0bHkgY2hhbmdpbmdcblx0XHRcdC8vIHRoZSBtZXRhIGRhdGEgaW4gdGhlIGZpbGUgYW5kIHRoZW4gdmVyaWZ5aW5nIHRoYXQgdGhlIHVwZGF0ZWQgbWV0YSBkYXRhXG5cdFx0XHQvLyBpcyBwZXJzaXN0ZWQgYmFjayBpbnRvIHRoZSBtb2RlbCAodmVyaWZpZWQgdmlhIGBoYXNCYWNrdXBTeW5jYCkuXG5cdFx0XHQvLyBUaGlzIGlzIG5vdCByZWFsbHkgc29tZXRoaW5nIHRoYXQgd291bGQgaGFwcGVuIGluIHJlYWwgbGlmZSBiZWNhdXNlIGFueVxuXHRcdFx0Ly8gYmFja3VwIHRoYXQgaXMgbWFkZSB2aWEgYmFja3VwIHNlcnZpY2Ugd2lsbCB1cGRhdGUgdGhlIG1vZGVsIGFjY29yZGluZ2x5LlxuXG5cdFx0XHRjb25zdCBvcmlnaW5hbEZpbGVDb250ZW50cyA9IChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShiYWNrdXBQYXRoKSkudmFsdWUudG9TdHJpbmcoKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShiYWNrdXBQYXRoLCBWU0J1ZmZlci5mcm9tU3RyaW5nKG9yaWdpbmFsRmlsZUNvbnRlbnRzLnJlcGxhY2UobWV0YS5ldGFnLCB1cGRhdGVkTWV0YS5ldGFnKSkpO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnJlc29sdmUoaWRlbnRpZmllcik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmhhc0JhY2t1cFN5bmMoaWRlbnRpZmllciwgdW5kZWZpbmVkLCBtZXRhKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaGFzQmFja3VwU3luYyhpZGVudGlmaWVyLCB1bmRlZmluZWQsIHVwZGF0ZWRNZXRhKSwgdHJ1ZSk7XG5cblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShiYWNrdXBQYXRoLCBWU0J1ZmZlci5mcm9tU3RyaW5nKG9yaWdpbmFsRmlsZUNvbnRlbnRzKSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuZ2V0QmFja3VwcygpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5oYXNCYWNrdXBTeW5jKGlkZW50aWZpZXIsIHVuZGVmaW5lZCwgbWV0YSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaGFzQmFja3VwU3luYyhpZGVudGlmaWVyLCB1bmRlZmluZWQsIHVwZGF0ZWRNZXRhKSwgZmFsc2UpO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3Nob3VsZCBpZ25vcmUgaW52YWxpZCBiYWNrdXBzIChlbXB0eSBmaWxlKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnRzID0gJ3Rlc3RcXG5hbmQgbW9yZSBzdHVmZic7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuYmFja3VwKHRvVW50eXBlZFdvcmtpbmdDb3B5SWQoZm9vRmlsZSksIGJ1ZmZlclRvUmVhZGFibGUoVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50cykpLCAxKTtcblxuXHRcdFx0bGV0IGJhY2t1cCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZSh0b1VudHlwZWRXb3JraW5nQ29weUlkKGZvb0ZpbGUpKTtcblx0XHRcdGFzc2VydC5vayhiYWNrdXApO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnRlc3RHZXRGaWxlU2VydmljZSgpLndyaXRlRmlsZShzZXJ2aWNlLnRvQmFja3VwUmVzb3VyY2UodG9VbnR5cGVkV29ya2luZ0NvcHlJZChmb29GaWxlKSksIFZTQnVmZmVyLmZyb21TdHJpbmcoJycpKTtcblxuXHRcdFx0YmFja3VwID0gYXdhaXQgc2VydmljZS5yZXNvbHZlPElCYWNrdXBUZXN0TWV0YURhdGE+KHRvVW50eXBlZFdvcmtpbmdDb3B5SWQoZm9vRmlsZSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFiYWNrdXApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGlnbm9yZSBpbnZhbGlkIGJhY2t1cHMgKG5vIHByZWFtYmxlKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnRzID0gJ3Rlc3RhbmQgbW9yZSBzdHVmZic7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuYmFja3VwKHRvVW50eXBlZFdvcmtpbmdDb3B5SWQoZm9vRmlsZSksIGJ1ZmZlclRvUmVhZGFibGUoVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50cykpLCAxKTtcblxuXHRcdFx0bGV0IGJhY2t1cCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZSh0b1VudHlwZWRXb3JraW5nQ29weUlkKGZvb0ZpbGUpKTtcblx0XHRcdGFzc2VydC5vayhiYWNrdXApO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnRlc3RHZXRGaWxlU2VydmljZSgpLndyaXRlRmlsZShzZXJ2aWNlLnRvQmFja3VwUmVzb3VyY2UodG9VbnR5cGVkV29ya2luZ0NvcHlJZChmb29GaWxlKSksIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudHMpKTtcblxuXHRcdFx0YmFja3VwID0gYXdhaXQgc2VydmljZS5yZXNvbHZlPElCYWNrdXBUZXN0TWV0YURhdGE+KHRvVW50eXBlZFdvcmtpbmdDb3B5SWQoZm9vRmlsZSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFiYWNrdXApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmlsZSB3aXRoIGJpbmFyeSBkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaWRlbnRpZmllciA9IHRvVW50eXBlZFdvcmtpbmdDb3B5SWQoZm9vRmlsZSk7XG5cblx0XHRcdGNvbnN0IGJ1ZmZlciA9IFVpbnQ4QXJyYXkuZnJvbShbXG5cdFx0XHRcdDEzNywgODAsIDc4LCA3MSwgMTMsIDEwLCAyNiwgMTAsIDAsIDAsIDAsIDEzLCA3MywgNzIsIDY4LCA4MiwgMCwgMCwgMCwgNzMsIDAsIDAsIDAsIDY3LCA4LCAyLCAwLCAwLCAwLCA5NSwgMTM4LCAxOTEsIDIzNywgMCwgMCwgMCwgMSwgMTE1LCA4MiwgNzEsIDY2LCAwLCAxNzQsIDIwNiwgMjgsIDIzMywgMCwgMCwgMCwgNCwgMTAzLCA2NSwgNzcsIDY1LCAwLCAwLCAxNzcsIDE0MywgMTEsIDI1MiwgOTcsIDUsIDAsIDAsIDAsIDksIDExMiwgNzIsIDg5LCAxMTUsIDAsIDAsIDE0LCAxOTUsIDAsIDAsIDE0LCAxOTUsIDEsIDE5OSwgMTExLCAxNjgsIDEwMCwgMCwgMCwgMCwgNzEsIDExNiwgNjksIDg4LCAxMTYsIDgzLCAxMTEsIDExNywgMTE0LCA5OSwgMTAxLCAwLCA4MywgMTA0LCAxMTEsIDExNiwgMTE2LCAxMjEsIDMyLCAxMTgsIDUwLCA0NiwgNDgsIDQ2LCA1MCwgNDYsIDUwLCA0OSwgNTQsIDMyLCA0MCwgNjcsIDQxLCAzMiwgODQsIDEwNCwgMTExLCAxMDksIDk3LCAxMTUsIDMyLCA2NiwgOTcsIDExNywgMTA5LCA5NywgMTEwLCAxMTAsIDMyLCA0NSwgMzIsIDEwNCwgMTE2LCAxMTYsIDExMiwgNTgsIDQ3LCA0NywgMTE1LCAxMDQsIDExMSwgMTE2LCAxMTYsIDEyMSwgNDYsIDEwMCwgMTAxLCAxMTgsIDExNSwgNDUsIDExMSwgMTEwLCA0NiwgMTEwLCAxMDEsIDExNiwgNDQsIDEzMiwgMjEsIDIxMywgMCwgMCwgMCwgODQsIDczLCA2OCwgNjUsIDg0LCAxMjAsIDIxOCwgMjM3LCAyMDcsIDY1LCAxNywgMCwgMCwgMTIsIDIsIDMyLCAyMTEsIDIxNywgNjMsIDE0NiwgMzcsIDI0NiwgMjE4LCA2NSwgMywgMjEwLCAxOTEsIDIyNiwgMjMwLCAyMzAsIDIzMCwgMjMwLCAyMzAsIDIzMCwgMjMwLCAyMzAsIDIzMCwgMjMwLCAyMzAsIDIzMCwgMjMwLCAyMzAsIDIzMCwgMjMwLCAyMzAsIDIzMCwgMjMwLCAyMzAsIDIzMCwgMjMwLCAyMzAsIDIzMCwgMjMwLCAyMzAsIDIzMCwgMjMwLCAyMzAsIDIzMCwgMjMwLCAyMzAsIDIzMCwgMjMwLCAyMzAsIDIzMCwgMjMwLCAyMzAsIDIzMCwgMjMwLCAyMzAsIDIzMCwgMjMwLCAyMzAsIDIzMCwgMjMwLCAyMzAsIDIzMCwgMjMwLCAyMzAsIDIzMCwgMjMwLCAyMzAsIDIzMCwgMjMwLCAxMTgsIDEwMCwgMTY5LCA0LCAxNzMsIDgsIDQ0LCAyNDgsIDE4NCwgNDAsIDAsIDAsIDAsIDAsIDczLCA2OSwgNzgsIDY4LCAxNzQsIDY2LCA5NiwgMTMwXG5cdFx0XHRdKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5iYWNrdXAoaWRlbnRpZmllciwgYnVmZmVyVG9SZWFkYWJsZShWU0J1ZmZlci53cmFwKGJ1ZmZlcikpLCB1bmRlZmluZWQsIHsgYmluYXJ5VGVzdDogJ3RydWUnIH0pO1xuXG5cdFx0XHRjb25zdCBiYWNrdXAgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUodG9VbnR5cGVkV29ya2luZ0NvcHlJZChmb29GaWxlKSk7XG5cdFx0XHRhc3NlcnQub2soYmFja3VwKTtcblxuXHRcdFx0Y29uc3QgYmFja3VwQnVmZmVyID0gYXdhaXQgY29uc3VtZVN0cmVhbShiYWNrdXAudmFsdWUsIGNodW5rcyA9PiBWU0J1ZmZlci5jb25jYXQoY2h1bmtzKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFja3VwQnVmZmVyLmJ1ZmZlci5ieXRlTGVuZ3RoLCBidWZmZXIuYnl0ZUxlbmd0aCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdXb3JraW5nQ29weUJhY2t1cHNNb2RlbCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ3NpbXBsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgV29ya2luZ0NvcHlCYWNrdXBzTW9kZWwuY3JlYXRlKHdvcmtzcGFjZUJhY2t1cFBhdGgsIHNlcnZpY2UudGVzdEdldEZpbGVTZXJ2aWNlKCkpO1xuXG5cdFx0XHRjb25zdCByZXNvdXJjZTEgPSBVUkkuZmlsZSgndGVzdC5odG1sJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5oYXMocmVzb3VyY2UxKSwgZmFsc2UpO1xuXG5cdFx0XHRtb2RlbC5hZGQocmVzb3VyY2UxKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmhhcyhyZXNvdXJjZTEpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5oYXMocmVzb3VyY2UxLCAwKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuaGFzKHJlc291cmNlMSwgMSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5oYXMocmVzb3VyY2UxLCAxLCB7IGZvbzogJ2JhcicgfSksIGZhbHNlKTtcblxuXHRcdFx0bW9kZWwucmVtb3ZlKHJlc291cmNlMSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5oYXMocmVzb3VyY2UxKSwgZmFsc2UpO1xuXG5cdFx0XHRtb2RlbC5hZGQocmVzb3VyY2UxKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmhhcyhyZXNvdXJjZTEpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5oYXMocmVzb3VyY2UxLCAwKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuaGFzKHJlc291cmNlMSwgMSksIGZhbHNlKTtcblxuXHRcdFx0bW9kZWwuY2xlYXIoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmhhcyhyZXNvdXJjZTEpLCBmYWxzZSk7XG5cblx0XHRcdG1vZGVsLmFkZChyZXNvdXJjZTEsIDEpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuaGFzKHJlc291cmNlMSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmhhcyhyZXNvdXJjZTEsIDApLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuaGFzKHJlc291cmNlMSwgMSksIHRydWUpO1xuXG5cdFx0XHRjb25zdCByZXNvdXJjZTIgPSBVUkkuZmlsZSgndGVzdDEuaHRtbCcpO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UzID0gVVJJLmZpbGUoJ3Rlc3QyLmh0bWwnKTtcblx0XHRcdGNvbnN0IHJlc291cmNlNCA9IFVSSS5maWxlKCd0ZXN0My5odG1sJyk7XG5cblx0XHRcdG1vZGVsLmFkZChyZXNvdXJjZTIpO1xuXHRcdFx0bW9kZWwuYWRkKHJlc291cmNlMyk7XG5cdFx0XHRtb2RlbC5hZGQocmVzb3VyY2U0LCB1bmRlZmluZWQsIHsgZm9vOiAnYmFyJyB9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmhhcyhyZXNvdXJjZTEpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5oYXMocmVzb3VyY2UyKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuaGFzKHJlc291cmNlMyksIHRydWUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuaGFzKHJlc291cmNlNCksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmhhcyhyZXNvdXJjZTQsIHVuZGVmaW5lZCwgeyBmb286ICdiYXInIH0pLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5oYXMocmVzb3VyY2U0LCB1bmRlZmluZWQsIHsgYmFyOiAnZm9vJyB9KSwgZmFsc2UpO1xuXG5cdFx0XHRtb2RlbC51cGRhdGUocmVzb3VyY2U0LCB7IGZvbzogJ25vdGhpbmcnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmhhcyhyZXNvdXJjZTQsIHVuZGVmaW5lZCwgeyBmb286ICdub3RoaW5nJyB9KSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuaGFzKHJlc291cmNlNCwgdW5kZWZpbmVkLCB7IGZvbzogJ2JhcicgfSksIGZhbHNlKTtcblxuXHRcdFx0bW9kZWwudXBkYXRlKHJlc291cmNlNCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuaGFzKHJlc291cmNlNCksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmhhcyhyZXNvdXJjZTQsIHVuZGVmaW5lZCwgeyBmb286ICdub3RoaW5nJyB9KSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY3JlYXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZm9vQmFja3VwUGF0aCA9IGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsIGZvb0ZpbGUuc2NoZW1lLCBoYXNoSWRlbnRpZmllcih0b1VudHlwZWRXb3JraW5nQ29weUlkKGZvb0ZpbGUpKSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIoZGlybmFtZShmb29CYWNrdXBQYXRoKSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoZm9vQmFja3VwUGF0aCwgVlNCdWZmZXIuZnJvbVN0cmluZygnZm9vJykpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBhd2FpdCBXb3JraW5nQ29weUJhY2t1cHNNb2RlbC5jcmVhdGUod29ya3NwYWNlQmFja3VwUGF0aCwgc2VydmljZS50ZXN0R2V0RmlsZVNlcnZpY2UoKSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5oYXMoZm9vQmFja3VwUGF0aCksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBhd2FpdCBXb3JraW5nQ29weUJhY2t1cHNNb2RlbC5jcmVhdGUod29ya3NwYWNlQmFja3VwUGF0aCwgc2VydmljZS50ZXN0R2V0RmlsZVNlcnZpY2UoKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0KCksIFtdKTtcblxuXHRcdFx0Y29uc3QgZmlsZTEgPSBVUkkuZmlsZSgnL3Jvb3QvZmlsZS9mb28uaHRtbCcpO1xuXHRcdFx0Y29uc3QgZmlsZTIgPSBVUkkuZmlsZSgnL3Jvb3QvZmlsZS9iYXIuaHRtbCcpO1xuXHRcdFx0Y29uc3QgdW50aXRsZWQgPSBVUkkuZmlsZSgnL3Jvb3QvdW50aXRsZWQvYmFyLmh0bWwnKTtcblxuXHRcdFx0bW9kZWwuYWRkKGZpbGUxKTtcblx0XHRcdG1vZGVsLmFkZChmaWxlMik7XG5cdFx0XHRtb2RlbC5hZGQodW50aXRsZWQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldCgpLm1hcChmID0+IGYuZnNQYXRoKSwgW2ZpbGUxLmZzUGF0aCwgZmlsZTIuZnNQYXRoLCB1bnRpdGxlZC5mc1BhdGhdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3R5cGVJZCBtaWdyYXRpb24nLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCd3b3JrcyAod2hlbiBtZXRhIGlzIG1pc3NpbmcpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZm9vQmFja3VwSWQgPSB0b1VudHlwZWRXb3JraW5nQ29weUlkKGZvb0ZpbGUpO1xuXHRcdFx0Y29uc3QgdW50aXRsZWRCYWNrdXBJZCA9IHRvVW50eXBlZFdvcmtpbmdDb3B5SWQodW50aXRsZWRGaWxlKTtcblx0XHRcdGNvbnN0IGN1c3RvbUJhY2t1cElkID0gdG9VbnR5cGVkV29ya2luZ0NvcHlJZChjdXN0b21GaWxlKTtcblxuXHRcdFx0Y29uc3QgZm9vQmFja3VwUGF0aCA9IGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsIGZvb0ZpbGUuc2NoZW1lLCBoYXNoSWRlbnRpZmllcihmb29CYWNrdXBJZCkpO1xuXHRcdFx0Y29uc3QgdW50aXRsZWRCYWNrdXBQYXRoID0gam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgdW50aXRsZWRGaWxlLnNjaGVtZSwgaGFzaElkZW50aWZpZXIodW50aXRsZWRCYWNrdXBJZCkpO1xuXHRcdFx0Y29uc3QgY3VzdG9tRmlsZUJhY2t1cFBhdGggPSBqb2luUGF0aCh3b3Jrc3BhY2VCYWNrdXBQYXRoLCBjdXN0b21GaWxlLnNjaGVtZSwgaGFzaElkZW50aWZpZXIoY3VzdG9tQmFja3VwSWQpKTtcblxuXHRcdFx0Ly8gUHJlcGFyZSBiYWNrdXBzIG9mIHRoZSBvbGQgZm9ybWF0IHdpdGhvdXQgbWV0YVxuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsIGZvb0ZpbGUuc2NoZW1lKSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIoam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgdW50aXRsZWRGaWxlLnNjaGVtZSkpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsIGN1c3RvbUZpbGUuc2NoZW1lKSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoZm9vQmFja3VwUGF0aCwgVlNCdWZmZXIuZnJvbVN0cmluZyhgJHtmb29GaWxlLnRvU3RyaW5nKCl9XFxudGVzdCBmaWxlYCkpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHVudGl0bGVkQmFja3VwUGF0aCwgVlNCdWZmZXIuZnJvbVN0cmluZyhgJHt1bnRpdGxlZEZpbGUudG9TdHJpbmcoKX1cXG50ZXN0IHVudGl0bGVkYCkpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGN1c3RvbUZpbGVCYWNrdXBQYXRoLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGAke2N1c3RvbUZpbGUudG9TdHJpbmcoKX1cXG50ZXN0IGN1c3RvbWApKTtcblxuXHRcdFx0c2VydmljZS5yZWluaXRpYWxpemUod29ya3NwYWNlQmFja3VwUGF0aCk7XG5cblx0XHRcdGNvbnN0IGJhY2t1cHMgPSBhd2FpdCBzZXJ2aWNlLmdldEJhY2t1cHMoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYWNrdXBzLmxlbmd0aCwgMyk7XG5cdFx0XHRhc3NlcnQub2soYmFja3Vwcy5zb21lKGJhY2t1cCA9PiBpc0VxdWFsKGJhY2t1cC5yZXNvdXJjZSwgZm9vRmlsZSkpKTtcblx0XHRcdGFzc2VydC5vayhiYWNrdXBzLnNvbWUoYmFja3VwID0+IGlzRXF1YWwoYmFja3VwLnJlc291cmNlLCB1bnRpdGxlZEZpbGUpKSk7XG5cdFx0XHRhc3NlcnQub2soYmFja3Vwcy5zb21lKGJhY2t1cCA9PiBpc0VxdWFsKGJhY2t1cC5yZXNvdXJjZSwgY3VzdG9tRmlsZSkpKTtcblx0XHRcdGFzc2VydC5vayhiYWNrdXBzLmV2ZXJ5KGJhY2t1cCA9PiBiYWNrdXAudHlwZUlkID09PSAnJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd29ya3MgKHdoZW4gdHlwZUlkIGluIG1ldGEgaXMgbWlzc2luZyknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmb29CYWNrdXBJZCA9IHRvVW50eXBlZFdvcmtpbmdDb3B5SWQoZm9vRmlsZSk7XG5cdFx0XHRjb25zdCB1bnRpdGxlZEJhY2t1cElkID0gdG9VbnR5cGVkV29ya2luZ0NvcHlJZCh1bnRpdGxlZEZpbGUpO1xuXHRcdFx0Y29uc3QgY3VzdG9tQmFja3VwSWQgPSB0b1VudHlwZWRXb3JraW5nQ29weUlkKGN1c3RvbUZpbGUpO1xuXG5cdFx0XHRjb25zdCBmb29CYWNrdXBQYXRoID0gam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgZm9vRmlsZS5zY2hlbWUsIGhhc2hJZGVudGlmaWVyKGZvb0JhY2t1cElkKSk7XG5cdFx0XHRjb25zdCB1bnRpdGxlZEJhY2t1cFBhdGggPSBqb2luUGF0aCh3b3Jrc3BhY2VCYWNrdXBQYXRoLCB1bnRpdGxlZEZpbGUuc2NoZW1lLCBoYXNoSWRlbnRpZmllcih1bnRpdGxlZEJhY2t1cElkKSk7XG5cdFx0XHRjb25zdCBjdXN0b21GaWxlQmFja3VwUGF0aCA9IGpvaW5QYXRoKHdvcmtzcGFjZUJhY2t1cFBhdGgsIGN1c3RvbUZpbGUuc2NoZW1lLCBoYXNoSWRlbnRpZmllcihjdXN0b21CYWNrdXBJZCkpO1xuXG5cdFx0XHQvLyBQcmVwYXJlIGJhY2t1cHMgb2YgdGhlIG9sZCBmb3JtYXQgd2l0aG91dCBtZXRhXG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIoam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgZm9vRmlsZS5zY2hlbWUpKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihqb2luUGF0aCh3b3Jrc3BhY2VCYWNrdXBQYXRoLCB1bnRpdGxlZEZpbGUuc2NoZW1lKSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIoam9pblBhdGgod29ya3NwYWNlQmFja3VwUGF0aCwgY3VzdG9tRmlsZS5zY2hlbWUpKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShmb29CYWNrdXBQYXRoLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGAke2Zvb0ZpbGUudG9TdHJpbmcoKX0gJHtKU09OLnN0cmluZ2lmeSh7IGZvbzogJ2JhcicgfSl9XFxudGVzdCBmaWxlYCkpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHVudGl0bGVkQmFja3VwUGF0aCwgVlNCdWZmZXIuZnJvbVN0cmluZyhgJHt1bnRpdGxlZEZpbGUudG9TdHJpbmcoKX0gJHtKU09OLnN0cmluZ2lmeSh7IGZvbzogJ2JhcicgfSl9XFxudGVzdCB1bnRpdGxlZGApKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShjdXN0b21GaWxlQmFja3VwUGF0aCwgVlNCdWZmZXIuZnJvbVN0cmluZyhgJHtjdXN0b21GaWxlLnRvU3RyaW5nKCl9ICR7SlNPTi5zdHJpbmdpZnkoeyBmb286ICdiYXInIH0pfVxcbnRlc3QgY3VzdG9tYCkpO1xuXG5cdFx0XHRzZXJ2aWNlLnJlaW5pdGlhbGl6ZSh3b3Jrc3BhY2VCYWNrdXBQYXRoKTtcblxuXHRcdFx0Y29uc3QgYmFja3VwcyA9IGF3YWl0IHNlcnZpY2UuZ2V0QmFja3VwcygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhY2t1cHMubGVuZ3RoLCAzKTtcblx0XHRcdGFzc2VydC5vayhiYWNrdXBzLnNvbWUoYmFja3VwID0+IGlzRXF1YWwoYmFja3VwLnJlc291cmNlLCBmb29GaWxlKSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJhY2t1cHMuc29tZShiYWNrdXAgPT4gaXNFcXVhbChiYWNrdXAucmVzb3VyY2UsIHVudGl0bGVkRmlsZSkpKTtcblx0XHRcdGFzc2VydC5vayhiYWNrdXBzLnNvbWUoYmFja3VwID0+IGlzRXF1YWwoYmFja3VwLnJlc291cmNlLCBjdXN0b21GaWxlKSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJhY2t1cHMuZXZlcnkoYmFja3VwID0+IGJhY2t1cC50eXBlSWQgPT09ICcnKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5c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LFFBQUc7QUFBQSxRQUFHO0FBQUEsUUFBRztBQUFBLFFBQUs7QUFBQSxRQUFJO0FBQUEsUUFBSTtBQUFBLFFBQUk7QUFBQSxRQUFHO0FBQUEsUUFBRztBQUFBLFFBQUs7QUFBQSxRQUFLO0FBQUEsUUFBSTtBQUFBLFFBQUs7QUFBQSxRQUFJO0FBQUEsUUFBRztBQUFBLFFBQUc7QUFBQSxRQUFHO0FBQUEsUUFBRztBQUFBLFFBQUc7QUFBQSxRQUFLO0FBQUEsUUFBSTtBQUFBLFFBQUk7QUFBQSxRQUFLO0FBQUEsUUFBRztBQUFBLFFBQUc7QUFBQSxRQUFJO0FBQUEsUUFBSztBQUFBLFFBQUc7QUFBQSxRQUFHO0FBQUEsUUFBSTtBQUFBLFFBQUs7QUFBQSxRQUFHO0FBQUEsUUFBSztBQUFBLFFBQUs7QUFBQSxRQUFLO0FBQUEsUUFBSztBQUFBLFFBQUc7QUFBQSxRQUFHO0FBQUEsUUFBRztBQUFBLFFBQUk7QUFBQSxRQUFLO0FBQUEsUUFBSTtBQUFBLFFBQUk7QUFBQSxRQUFLO0FBQUEsUUFBSTtBQUFBLFFBQUs7QUFBQSxRQUFLO0FBQUEsUUFBSztBQUFBLFFBQUk7QUFBQSxRQUFLO0FBQUEsUUFBRztBQUFBLFFBQUk7QUFBQSxRQUFLO0FBQUEsUUFBSztBQUFBLFFBQUs7QUFBQSxRQUFLO0FBQUEsUUFBSztBQUFBLFFBQUk7QUFBQSxRQUFLO0FBQUEsUUFBSTtBQUFBLFFBQUk7QUFBQSxRQUFJO0FBQUEsUUFBSTtBQUFBLFFBQUk7QUFBQSxRQUFJO0FBQUEsUUFBSTtBQUFBLFFBQUk7QUFBQSxRQUFJO0FBQUEsUUFBSTtBQUFBLFFBQUk7QUFBQSxRQUFJO0FBQUEsUUFBSTtBQUFBLFFBQUk7QUFBQSxRQUFJO0FBQUEsUUFBSztBQUFBLFFBQUs7QUFBQSxRQUFLO0FBQUEsUUFBSTtBQUFBLFFBQUs7QUFBQSxRQUFJO0FBQUEsUUFBSTtBQUFBLFFBQUk7QUFBQSxRQUFLO0FBQUEsUUFBSztBQUFBLFFBQUk7QUFBQSxRQUFLO0FBQUEsUUFBSztBQUFBLFFBQUk7QUFBQSxRQUFJO0FBQUEsUUFBSTtBQUFBLFFBQUs7QUFBQSxRQUFLO0FBQUEsUUFBSztBQUFBLFFBQUs7QUFBQSxRQUFJO0FBQUEsUUFBSTtBQUFBLFFBQUk7QUFBQSxRQUFLO0FBQUEsUUFBSztBQUFBLFFBQUs7QUFBQSxRQUFLO0FBQUEsUUFBSztBQUFBLFFBQUs7QUFBQSxRQUFJO0FBQUEsUUFBSztBQUFBLFFBQUs7QUFBQSxRQUFLO0FBQUEsUUFBSztBQUFBLFFBQUk7QUFBQSxRQUFLO0FBQUEsUUFBSztBQUFBLFFBQUk7QUFBQSxRQUFLO0FBQUEsUUFBSztBQUFBLFFBQUs7QUFBQSxRQUFJO0FBQUEsUUFBSztBQUFBLFFBQUk7QUFBQSxRQUFLO0FBQUEsUUFBRztBQUFBLFFBQUc7QUFBQSxRQUFHO0FBQUEsUUFBSTtBQUFBLFFBQUk7QUFBQSxRQUFJO0FBQUEsUUFBSTtBQUFBLFFBQUk7QUFBQSxRQUFLO0FBQUEsUUFBSztBQUFBLFFBQUs7QUFBQSxRQUFLO0FBQUEsUUFBSTtBQUFBLFFBQUk7QUFBQSxRQUFHO0FBQUEsUUFBRztBQUFBLFFBQUk7QUFBQSxRQUFHO0FBQUEsUUFBSTtBQUFBLFFBQUs7QUFBQSxRQUFLO0FBQUEsUUFBSTtBQUFBLFFBQUs7QUFBQSxRQUFJO0FBQUEsUUFBSztBQUFBLFFBQUs7QUFBQSxRQUFJO0FBQUEsUUFBRztBQUFBLFFBQUs7QUFBQSxRQUFLO0FBQUEsUUFBSztBQUFBLFFBQUs7QUFBQSxRQUFLO0FBQUEsUUFBSztBQUFBLFFBQUs7QUFBQSxRQUFLO0FBQUEsUUFBSztBQUFBLFFBQUs7QUFBQSxRQUFLO0FBQUEsUUFBSztBQUFBLFFBQUs7QUFBQSxRQUFLO0FBQUEsUUFBSztBQUFBLFFBQUs7QUFBQSxRQUFLO0FBQUEsUUFBSztBQUFBLFFBQUs7QUFBQSxRQUFLO0FBQUEsUUFBSztBQUFBLFFBQUs7QUFBQSxRQUFLO0FBQUEsUUFBSztBQUFBLFFBQUs7QUFBQSxRQUFLO0FBQUEsUUFBSztBQUFBLFFBQUs7QUFBQSxRQUFLO0FBQUEsUUFBSztBQUFBLFFBQUs7QUFBQSxRQUFLO0FBQUEsUUFBSztBQUFB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
