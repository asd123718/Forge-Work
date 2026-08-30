import assert from "assert";
import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import { Schemas } from "../../../../base/common/network.js";
import * as path from "../../../../base/common/path.js";
import * as platform from "../../../../base/common/platform.js";
import { isEqual } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { Promises } from "../../../../base/node/pfs.js";
import { flakySuite, getRandomTestPath } from "../../../../base/test/node/testUtils.js";
import { BackupMainService } from "../../electron-main/backupMainService.js";
import { TestConfigurationService } from "../../../configuration/test/common/testConfigurationService.js";
import { EnvironmentMainService } from "../../../environment/electron-main/environmentMainService.js";
import { OPTIONS, parseArgs } from "../../../environment/node/argv.js";
import { HotExitConfiguration } from "../../../files/common/files.js";
import { ConsoleMainLogger } from "../../../log/common/log.js";
import product from "../../../product/common/product.js";
import { isFolderBackupInfo } from "../../common/backup.js";
import { InMemoryTestStateMainService } from "../../../test/electron-main/workbenchTestServices.js";
import { LogService } from "../../../log/common/logService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
flakySuite("BackupMainService", () => {
  function assertEqualFolderInfos(actual, expected) {
    const withUriAsString = (f) => ({ folderUri: f.folderUri.toString(), remoteAuthority: f.remoteAuthority });
    assert.deepStrictEqual(actual.map(withUriAsString), expected.map(withUriAsString));
  }
  function toWorkspace(path2) {
    return {
      id: createHash("md5").update(sanitizePath(path2)).digest("hex"),
      // CodeQL [SM04514] Using MD5 to convert a file path to a fixed length
      configPath: URI.file(path2)
    };
  }
  function toWorkspaceBackupInfo(path2, remoteAuthority) {
    return {
      workspace: {
        id: createHash("md5").update(sanitizePath(path2)).digest("hex"),
        // CodeQL [SM04514] Using MD5 to convert a file path to a fixed length
        configPath: URI.file(path2)
      },
      remoteAuthority
    };
  }
  function toFolderBackupInfo(uri, remoteAuthority) {
    return { folderUri: uri, remoteAuthority };
  }
  function toSerializedWorkspace(ws) {
    return {
      id: ws.id,
      configURIPath: ws.configPath.toString()
    };
  }
  function ensureFolderExists(uri) {
    if (!fs.existsSync(uri.fsPath)) {
      fs.mkdirSync(uri.fsPath);
    }
    const backupFolder = service.toBackupPath(uri);
    return createBackupFolder(backupFolder);
  }
  async function ensureWorkspaceExists(workspace) {
    if (!fs.existsSync(workspace.configPath.fsPath)) {
      await Promises.writeFile(workspace.configPath.fsPath, "Hello");
    }
    const backupFolder = service.toBackupPath(workspace.id);
    await createBackupFolder(backupFolder);
    return workspace;
  }
  async function createBackupFolder(backupFolder) {
    if (!fs.existsSync(backupFolder)) {
      fs.mkdirSync(backupFolder);
      fs.mkdirSync(path.join(backupFolder, Schemas.file));
      await Promises.writeFile(path.join(backupFolder, Schemas.file, "foo.txt"), "Hello");
    }
  }
  function readWorkspacesMetadata() {
    return stateMainService.getItem("backupWorkspaces");
  }
  function writeWorkspacesMetadata(data) {
    if (!data) {
      stateMainService.removeItem("backupWorkspaces");
    } else {
      stateMainService.setItem("backupWorkspaces", JSON.parse(data));
    }
  }
  function sanitizePath(p) {
    return platform.isLinux ? p : p.toLowerCase();
  }
  const fooFile = URI.file(platform.isWindows ? "C:\\foo" : "/foo");
  const barFile = URI.file(platform.isWindows ? "C:\\bar" : "/bar");
  let service;
  let configService;
  let stateMainService;
  let environmentService;
  let testDir;
  let backupHome;
  let existingTestFolder1;
  setup(async () => {
    testDir = getRandomTestPath(os.tmpdir(), "vsctests", "backupmainservice");
    backupHome = path.join(testDir, "Backups");
    existingTestFolder1 = URI.file(path.join(testDir, "folder1"));
    environmentService = new EnvironmentMainService(parseArgs(process.argv, OPTIONS), { _serviceBrand: void 0, ...product });
    await fs.promises.mkdir(backupHome, { recursive: true });
    configService = new TestConfigurationService();
    stateMainService = new InMemoryTestStateMainService();
    service = new class TestBackupMainService extends BackupMainService {
      constructor() {
        super(environmentService, configService, new LogService(new ConsoleMainLogger()), stateMainService);
        this.backupHome = backupHome;
      }
      toBackupPath(arg) {
        const id = arg instanceof URI ? super.getFolderHash({ folderUri: arg }) : arg;
        return path.join(this.backupHome, id);
      }
      testGetFolderHash(folder) {
        return super.getFolderHash(folder);
      }
      testGetWorkspaceBackups() {
        return super.getWorkspaceBackups();
      }
      testGetFolderBackups() {
        return super.getFolderBackups();
      }
    }();
    return service.initialize();
  });
  teardown(() => {
    return Promises.rm(testDir);
  });
  test("service validates backup workspaces on startup and cleans up (folder workspaces)", async function() {
    service.registerFolderBackup(toFolderBackupInfo(fooFile));
    service.registerFolderBackup(toFolderBackupInfo(barFile));
    await service.initialize();
    assertEqualFolderInfos(service.testGetFolderBackups(), []);
    fs.mkdirSync(service.toBackupPath(fooFile));
    fs.mkdirSync(service.toBackupPath(barFile));
    service.registerFolderBackup(toFolderBackupInfo(fooFile));
    service.registerFolderBackup(toFolderBackupInfo(barFile));
    await service.initialize();
    assertEqualFolderInfos(service.testGetFolderBackups(), []);
    assert.ok(!fs.existsSync(service.toBackupPath(fooFile)));
    assert.ok(!fs.existsSync(service.toBackupPath(barFile)));
    fs.mkdirSync(service.toBackupPath(fooFile));
    fs.mkdirSync(service.toBackupPath(barFile));
    fs.mkdirSync(path.join(service.toBackupPath(fooFile), Schemas.file));
    fs.mkdirSync(path.join(service.toBackupPath(barFile), Schemas.untitled));
    service.registerFolderBackup(toFolderBackupInfo(fooFile));
    service.registerFolderBackup(toFolderBackupInfo(barFile));
    await service.initialize();
    assertEqualFolderInfos(service.testGetFolderBackups(), []);
    assert.ok(!fs.existsSync(service.toBackupPath(fooFile)));
    assert.ok(!fs.existsSync(service.toBackupPath(barFile)));
    const fileBackups = path.join(service.toBackupPath(fooFile), Schemas.file);
    fs.mkdirSync(service.toBackupPath(fooFile));
    fs.mkdirSync(service.toBackupPath(barFile));
    fs.mkdirSync(fileBackups);
    service.registerFolderBackup(toFolderBackupInfo(fooFile));
    assert.strictEqual(service.testGetFolderBackups().length, 1);
    assert.strictEqual(service.getEmptyWindowBackups().length, 0);
    fs.writeFileSync(path.join(fileBackups, "backup.txt"), "");
    await service.initialize();
    assert.strictEqual(service.testGetFolderBackups().length, 0);
    assert.strictEqual(service.getEmptyWindowBackups().length, 1);
  });
  test("service validates backup workspaces on startup and cleans up (root workspaces)", async function() {
    service.registerWorkspaceBackup(toWorkspaceBackupInfo(fooFile.fsPath));
    service.registerWorkspaceBackup(toWorkspaceBackupInfo(barFile.fsPath));
    await service.initialize();
    assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
    fs.mkdirSync(service.toBackupPath(fooFile));
    fs.mkdirSync(service.toBackupPath(barFile));
    service.registerWorkspaceBackup(toWorkspaceBackupInfo(fooFile.fsPath));
    service.registerWorkspaceBackup(toWorkspaceBackupInfo(barFile.fsPath));
    await service.initialize();
    assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
    assert.ok(!fs.existsSync(service.toBackupPath(fooFile)));
    assert.ok(!fs.existsSync(service.toBackupPath(barFile)));
    fs.mkdirSync(service.toBackupPath(fooFile));
    fs.mkdirSync(service.toBackupPath(barFile));
    fs.mkdirSync(path.join(service.toBackupPath(fooFile), Schemas.file));
    fs.mkdirSync(path.join(service.toBackupPath(barFile), Schemas.untitled));
    service.registerWorkspaceBackup(toWorkspaceBackupInfo(fooFile.fsPath));
    service.registerWorkspaceBackup(toWorkspaceBackupInfo(barFile.fsPath));
    await service.initialize();
    assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
    assert.ok(!fs.existsSync(service.toBackupPath(fooFile)));
    assert.ok(!fs.existsSync(service.toBackupPath(barFile)));
    const fileBackups = path.join(service.toBackupPath(fooFile), Schemas.file);
    fs.mkdirSync(service.toBackupPath(fooFile));
    fs.mkdirSync(service.toBackupPath(barFile));
    fs.mkdirSync(fileBackups);
    service.registerWorkspaceBackup(toWorkspaceBackupInfo(fooFile.fsPath));
    assert.strictEqual(service.testGetWorkspaceBackups().length, 1);
    assert.strictEqual(service.getEmptyWindowBackups().length, 0);
    fs.writeFileSync(path.join(fileBackups, "backup.txt"), "");
    await service.initialize();
    assert.strictEqual(service.testGetWorkspaceBackups().length, 0);
    assert.strictEqual(service.getEmptyWindowBackups().length, 1);
  });
  test("service supports to migrate backup data from another location", async () => {
    const backupPathToMigrate = service.toBackupPath(fooFile);
    fs.mkdirSync(backupPathToMigrate);
    fs.writeFileSync(path.join(backupPathToMigrate, "backup.txt"), "Some Data");
    service.registerFolderBackup(toFolderBackupInfo(URI.file(backupPathToMigrate)));
    const workspaceBackupPath = await service.registerWorkspaceBackup(toWorkspaceBackupInfo(barFile.fsPath), backupPathToMigrate);
    assert.ok(fs.existsSync(workspaceBackupPath));
    assert.ok(fs.existsSync(path.join(workspaceBackupPath, "backup.txt")));
    assert.ok(!fs.existsSync(backupPathToMigrate));
    const emptyBackups = service.getEmptyWindowBackups();
    assert.strictEqual(0, emptyBackups.length);
  });
  test("service backup migration makes sure to preserve existing backups", async () => {
    const backupPathToMigrate = service.toBackupPath(fooFile);
    fs.mkdirSync(backupPathToMigrate);
    fs.writeFileSync(path.join(backupPathToMigrate, "backup.txt"), "Some Data");
    service.registerFolderBackup(toFolderBackupInfo(URI.file(backupPathToMigrate)));
    const backupPathToPreserve = service.toBackupPath(barFile);
    fs.mkdirSync(backupPathToPreserve);
    fs.writeFileSync(path.join(backupPathToPreserve, "backup.txt"), "Some Data");
    service.registerFolderBackup(toFolderBackupInfo(URI.file(backupPathToPreserve)));
    const workspaceBackupPath = await service.registerWorkspaceBackup(toWorkspaceBackupInfo(barFile.fsPath), backupPathToMigrate);
    assert.ok(fs.existsSync(workspaceBackupPath));
    assert.ok(fs.existsSync(path.join(workspaceBackupPath, "backup.txt")));
    assert.ok(!fs.existsSync(backupPathToMigrate));
    const emptyBackups = service.getEmptyWindowBackups();
    assert.strictEqual(1, emptyBackups.length);
    assert.strictEqual(1, fs.readdirSync(path.join(backupHome, emptyBackups[0].backupFolder)).length);
  });
  suite("loadSync", () => {
    test("getFolderBackupPaths() should return [] when workspaces.json doesn't exist", () => {
      assertEqualFolderInfos(service.testGetFolderBackups(), []);
    });
    test("getFolderBackupPaths() should return [] when folders in workspaces.json is absent", async () => {
      writeWorkspacesMetadata("{}");
      await service.initialize();
      assertEqualFolderInfos(service.testGetFolderBackups(), []);
    });
    test("getFolderBackupPaths() should return [] when folders in workspaces.json is not a string array", async () => {
      writeWorkspacesMetadata('{"folders":{}}');
      await service.initialize();
      assertEqualFolderInfos(service.testGetFolderBackups(), []);
      writeWorkspacesMetadata('{"folders":{"foo": ["bar"]}}');
      await service.initialize();
      assertEqualFolderInfos(service.testGetFolderBackups(), []);
      writeWorkspacesMetadata('{"folders":{"foo": []}}');
      await service.initialize();
      assertEqualFolderInfos(service.testGetFolderBackups(), []);
      writeWorkspacesMetadata('{"folders":{"foo": "bar"}}');
      await service.initialize();
      assertEqualFolderInfos(service.testGetFolderBackups(), []);
      writeWorkspacesMetadata('{"folders":"foo"}');
      await service.initialize();
      assertEqualFolderInfos(service.testGetFolderBackups(), []);
      writeWorkspacesMetadata('{"folders":1}');
      await service.initialize();
      assertEqualFolderInfos(service.testGetFolderBackups(), []);
    });
    test('getFolderBackupPaths() should return [] when files.hotExit = "onExitAndWindowClose"', async () => {
      const fi = toFolderBackupInfo(URI.file(fooFile.fsPath.toUpperCase()));
      service.registerFolderBackup(fi);
      assertEqualFolderInfos(service.testGetFolderBackups(), [fi]);
      configService.setUserConfiguration("files.hotExit", HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE);
      await service.initialize();
      assertEqualFolderInfos(service.testGetFolderBackups(), []);
    });
    test("getWorkspaceBackups() should return [] when workspaces.json doesn't exist", () => {
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
    });
    test("getWorkspaceBackups() should return [] when folderWorkspaces in workspaces.json is absent", async () => {
      writeWorkspacesMetadata("{}");
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
    });
    test("getWorkspaceBackups() should return [] when rootWorkspaces in workspaces.json is not a object array", async () => {
      writeWorkspacesMetadata('{"rootWorkspaces":{}}');
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
      writeWorkspacesMetadata('{"rootWorkspaces":{"foo": ["bar"]}}');
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
      writeWorkspacesMetadata('{"rootWorkspaces":{"foo": []}}');
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
      writeWorkspacesMetadata('{"rootWorkspaces":{"foo": "bar"}}');
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
      writeWorkspacesMetadata('{"rootWorkspaces":"foo"}');
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
      writeWorkspacesMetadata('{"rootWorkspaces":1}');
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
    });
    test("getWorkspaceBackups() should return [] when workspaces in workspaces.json is not a object array", async () => {
      writeWorkspacesMetadata('{"workspaces":{}}');
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
      writeWorkspacesMetadata('{"workspaces":{"foo": ["bar"]}}');
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
      writeWorkspacesMetadata('{"workspaces":{"foo": []}}');
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
      writeWorkspacesMetadata('{"workspaces":{"foo": "bar"}}');
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
      writeWorkspacesMetadata('{"workspaces":"foo"}');
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
      writeWorkspacesMetadata('{"workspaces":1}');
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
    });
    test('getWorkspaceBackups() should return [] when files.hotExit = "onExitAndWindowClose"', async () => {
      const upperFooPath = fooFile.fsPath.toUpperCase();
      service.registerWorkspaceBackup(toWorkspaceBackupInfo(upperFooPath));
      assert.strictEqual(service.testGetWorkspaceBackups().length, 1);
      assert.deepStrictEqual(service.testGetWorkspaceBackups().map((r) => r.workspace.configPath.toString()), [URI.file(upperFooPath).toString()]);
      configService.setUserConfiguration("files.hotExit", HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE);
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
    });
    test("getEmptyWorkspaceBackupPaths() should return [] when workspaces.json doesn't exist", () => {
      assert.deepStrictEqual(service.getEmptyWindowBackups(), []);
    });
    test("getEmptyWorkspaceBackupPaths() should return [] when folderWorkspaces in workspaces.json is absent", async () => {
      writeWorkspacesMetadata("{}");
      await service.initialize();
      assert.deepStrictEqual(service.getEmptyWindowBackups(), []);
    });
    test("getEmptyWorkspaceBackupPaths() should return [] when folderWorkspaces in workspaces.json is not a string array", async function() {
      writeWorkspacesMetadata('{"emptyWorkspaces":{}}');
      await service.initialize();
      assert.deepStrictEqual(service.getEmptyWindowBackups(), []);
      writeWorkspacesMetadata('{"emptyWorkspaces":{"foo": ["bar"]}}');
      await service.initialize();
      assert.deepStrictEqual(service.getEmptyWindowBackups(), []);
      writeWorkspacesMetadata('{"emptyWorkspaces":{"foo": []}}');
      await service.initialize();
      assert.deepStrictEqual(service.getEmptyWindowBackups(), []);
      writeWorkspacesMetadata('{"emptyWorkspaces":{"foo": "bar"}}');
      await service.initialize();
      assert.deepStrictEqual(service.getEmptyWindowBackups(), []);
      writeWorkspacesMetadata('{"emptyWorkspaces":"foo"}');
      await service.initialize();
      assert.deepStrictEqual(service.getEmptyWindowBackups(), []);
      writeWorkspacesMetadata('{"emptyWorkspaces":1}');
      await service.initialize();
      assert.deepStrictEqual(service.getEmptyWindowBackups(), []);
    });
  });
  suite("dedupeFolderWorkspaces", () => {
    test("should ignore duplicates (folder workspace)", async () => {
      await ensureFolderExists(existingTestFolder1);
      const workspacesJson = {
        workspaces: [],
        folders: [{ folderUri: existingTestFolder1.toString() }, { folderUri: existingTestFolder1.toString() }],
        emptyWindows: []
      };
      writeWorkspacesMetadata(JSON.stringify(workspacesJson));
      await service.initialize();
      const json = readWorkspacesMetadata();
      assert.deepStrictEqual(json.folders, [{ folderUri: existingTestFolder1.toString() }]);
    });
    test("should ignore duplicates on Windows and Mac (folder workspace)", async () => {
      await ensureFolderExists(existingTestFolder1);
      const workspacesJson = {
        workspaces: [],
        folders: [{ folderUri: existingTestFolder1.toString() }, { folderUri: existingTestFolder1.toString().toLowerCase() }],
        emptyWindows: []
      };
      writeWorkspacesMetadata(JSON.stringify(workspacesJson));
      await service.initialize();
      const json = readWorkspacesMetadata();
      assert.deepStrictEqual(json.folders, [{ folderUri: existingTestFolder1.toString() }]);
    });
    test("should ignore duplicates on Windows and Mac (root workspace)", async () => {
      const workspacePath = path.join(testDir, "Foo.code-workspace");
      const workspacePath1 = path.join(testDir, "FOO.code-workspace");
      const workspacePath2 = path.join(testDir, "foo.code-workspace");
      const workspace1 = await ensureWorkspaceExists(toWorkspace(workspacePath));
      const workspace2 = await ensureWorkspaceExists(toWorkspace(workspacePath1));
      const workspace3 = await ensureWorkspaceExists(toWorkspace(workspacePath2));
      const workspacesJson = {
        workspaces: [workspace1, workspace2, workspace3].map(toSerializedWorkspace),
        folders: [],
        emptyWindows: []
      };
      writeWorkspacesMetadata(JSON.stringify(workspacesJson));
      await service.initialize();
      const json = readWorkspacesMetadata();
      assert.strictEqual(json.workspaces.length, platform.isLinux ? 3 : 1);
      if (platform.isLinux) {
        assert.deepStrictEqual(json.workspaces.map((r) => r.configURIPath), [URI.file(workspacePath).toString(), URI.file(workspacePath1).toString(), URI.file(workspacePath2).toString()]);
      } else {
        assert.deepStrictEqual(json.workspaces.map((r) => r.configURIPath), [URI.file(workspacePath).toString()], "should return the first duplicated entry");
      }
    });
  });
  suite("registerWindowForBackups", () => {
    test("should persist paths to workspaces.json (folder workspace)", async () => {
      service.registerFolderBackup(toFolderBackupInfo(fooFile));
      service.registerFolderBackup(toFolderBackupInfo(barFile));
      assertEqualFolderInfos(service.testGetFolderBackups(), [toFolderBackupInfo(fooFile), toFolderBackupInfo(barFile)]);
      const json = readWorkspacesMetadata();
      assert.deepStrictEqual(json.folders, [{ folderUri: fooFile.toString() }, { folderUri: barFile.toString() }]);
    });
    test("should persist paths to workspaces.json (root workspace)", async () => {
      const ws1 = toWorkspaceBackupInfo(fooFile.fsPath);
      service.registerWorkspaceBackup(ws1);
      const ws2 = toWorkspaceBackupInfo(barFile.fsPath);
      service.registerWorkspaceBackup(ws2);
      assert.deepStrictEqual(service.testGetWorkspaceBackups().map((b) => b.workspace.configPath.toString()), [fooFile.toString(), barFile.toString()]);
      assert.strictEqual(ws1.workspace.id, service.testGetWorkspaceBackups()[0].workspace.id);
      assert.strictEqual(ws2.workspace.id, service.testGetWorkspaceBackups()[1].workspace.id);
      const json = readWorkspacesMetadata();
      assert.deepStrictEqual(json.workspaces.map((b) => b.configURIPath), [fooFile.toString(), barFile.toString()]);
      assert.strictEqual(ws1.workspace.id, json.workspaces[0].id);
      assert.strictEqual(ws2.workspace.id, json.workspaces[1].id);
    });
  });
  test("should always store the workspace path in workspaces.json using the case given, regardless of whether the file system is case-sensitive (folder workspace)", async () => {
    service.registerFolderBackup(toFolderBackupInfo(URI.file(fooFile.fsPath.toUpperCase())));
    assertEqualFolderInfos(service.testGetFolderBackups(), [toFolderBackupInfo(URI.file(fooFile.fsPath.toUpperCase()))]);
    const json = readWorkspacesMetadata();
    assert.deepStrictEqual(json.folders, [{ folderUri: URI.file(fooFile.fsPath.toUpperCase()).toString() }]);
  });
  test("should always store the workspace path in workspaces.json using the case given, regardless of whether the file system is case-sensitive (root workspace)", async () => {
    const upperFooPath = fooFile.fsPath.toUpperCase();
    service.registerWorkspaceBackup(toWorkspaceBackupInfo(upperFooPath));
    assert.deepStrictEqual(service.testGetWorkspaceBackups().map((b) => b.workspace.configPath.toString()), [URI.file(upperFooPath).toString()]);
    const json = readWorkspacesMetadata();
    assert.deepStrictEqual(json.workspaces.map((b) => b.configURIPath), [URI.file(upperFooPath).toString()]);
  });
  suite("getWorkspaceHash", () => {
    (platform.isLinux ? test.skip : test)("should ignore case on Windows and Mac", () => {
      const assertFolderHash = (uri1, uri2) => {
        assert.strictEqual(service.testGetFolderHash(toFolderBackupInfo(uri1)), service.testGetFolderHash(toFolderBackupInfo(uri2)));
      };
      if (platform.isMacintosh) {
        assertFolderHash(URI.file("/foo"), URI.file("/FOO"));
      }
      if (platform.isWindows) {
        assertFolderHash(URI.file("c:\\foo"), URI.file("C:\\FOO"));
      }
    });
  });
  suite("mixed path casing", () => {
    test("should handle case insensitive paths properly (registerWindowForBackupsSync) (folder workspace)", () => {
      service.registerFolderBackup(toFolderBackupInfo(fooFile));
      service.registerFolderBackup(toFolderBackupInfo(URI.file(fooFile.fsPath.toUpperCase())));
      if (platform.isLinux) {
        assert.strictEqual(service.testGetFolderBackups().length, 2);
      } else {
        assert.strictEqual(service.testGetFolderBackups().length, 1);
      }
    });
    test("should handle case insensitive paths properly (registerWindowForBackupsSync) (root workspace)", () => {
      service.registerWorkspaceBackup(toWorkspaceBackupInfo(fooFile.fsPath));
      service.registerWorkspaceBackup(toWorkspaceBackupInfo(fooFile.fsPath.toUpperCase()));
      if (platform.isLinux) {
        assert.strictEqual(service.testGetWorkspaceBackups().length, 2);
      } else {
        assert.strictEqual(service.testGetWorkspaceBackups().length, 1);
      }
    });
  });
  suite("getDirtyWorkspaces", () => {
    test("should report if a workspace or folder has backups", async () => {
      const folderBackupPath = service.registerFolderBackup(toFolderBackupInfo(fooFile));
      const backupWorkspaceInfo = toWorkspaceBackupInfo(fooFile.fsPath);
      const workspaceBackupPath = service.registerWorkspaceBackup(backupWorkspaceInfo);
      assert.strictEqual((await service.getDirtyWorkspaces()).length, 0);
      try {
        await fs.promises.mkdir(path.join(folderBackupPath, Schemas.file), { recursive: true });
        await fs.promises.mkdir(path.join(workspaceBackupPath, Schemas.untitled), { recursive: true });
      } catch {
      }
      assert.strictEqual((await service.getDirtyWorkspaces()).length, 0);
      fs.writeFileSync(path.join(folderBackupPath, Schemas.file, "594a4a9d82a277a899d4713a5b08f504"), "");
      fs.writeFileSync(path.join(workspaceBackupPath, Schemas.untitled, "594a4a9d82a277a899d4713a5b08f504"), "");
      const dirtyWorkspaces = await service.getDirtyWorkspaces();
      assert.strictEqual(dirtyWorkspaces.length, 2);
      let found = 0;
      for (const dirtyWorkpspace of dirtyWorkspaces) {
        if (isFolderBackupInfo(dirtyWorkpspace)) {
          if (isEqual(fooFile, dirtyWorkpspace.folderUri)) {
            found++;
          }
        } else {
          if (isEqual(backupWorkspaceInfo.workspace.configPath, dirtyWorkpspace.workspace.configPath)) {
            found++;
          }
        }
      }
      assert.strictEqual(found, 2);
    });
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYmFja3VwXFx0ZXN0XFxlbGVjdHJvbi1tYWluXFxiYWNrdXBNYWluU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgY3JlYXRlSGFzaCB9IGZyb20gJ2NyeXB0byc7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBvcyBmcm9tICdvcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL25vZGUvcGZzLmpzJztcbmltcG9ydCB7IGZsYWt5U3VpdGUsIGdldFJhbmRvbVRlc3RQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L25vZGUvdGVzdFV0aWxzLmpzJztcbmltcG9ydCB7IEJhY2t1cE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZWxlY3Ryb24tbWFpbi9iYWNrdXBNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2VyaWFsaXplZEJhY2t1cFdvcmtzcGFjZXMsIElTZXJpYWxpemVkV29ya3NwYWNlQmFja3VwSW5mbyB9IGZyb20gJy4uLy4uL25vZGUvYmFja3VwLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVudmlyb25tZW50TWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lbnZpcm9ubWVudC9lbGVjdHJvbi1tYWluL2Vudmlyb25tZW50TWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgT1BUSU9OUywgcGFyc2VBcmdzIH0gZnJvbSAnLi4vLi4vLi4vZW52aXJvbm1lbnQvbm9kZS9hcmd2LmpzJztcbmltcG9ydCB7IEhvdEV4aXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IENvbnNvbGVNYWluTG9nZ2VyIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBJRm9sZGVyQmFja3VwSW5mbywgaXNGb2xkZXJCYWNrdXBJbmZvLCBJV29ya3NwYWNlQmFja3VwSW5mbyB9IGZyb20gJy4uLy4uL2NvbW1vbi9iYWNrdXAuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeVRlc3RTdGF0ZU1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdGVzdC9lbGVjdHJvbi1tYWluL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2dTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuXG5mbGFreVN1aXRlKCdCYWNrdXBNYWluU2VydmljZScsICgpID0+IHtcblxuXHRmdW5jdGlvbiBhc3NlcnRFcXVhbEZvbGRlckluZm9zKGFjdHVhbDogSUZvbGRlckJhY2t1cEluZm9bXSwgZXhwZWN0ZWQ6IElGb2xkZXJCYWNrdXBJbmZvW10pIHtcblx0XHRjb25zdCB3aXRoVXJpQXNTdHJpbmcgPSAoZjogSUZvbGRlckJhY2t1cEluZm8pID0+ICh7IGZvbGRlclVyaTogZi5mb2xkZXJVcmkudG9TdHJpbmcoKSwgcmVtb3RlQXV0aG9yaXR5OiBmLnJlbW90ZUF1dGhvcml0eSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5tYXAod2l0aFVyaUFzU3RyaW5nKSwgZXhwZWN0ZWQubWFwKHdpdGhVcmlBc1N0cmluZykpO1xuXHR9XG5cblx0ZnVuY3Rpb24gdG9Xb3Jrc3BhY2UocGF0aDogc3RyaW5nKTogSVdvcmtzcGFjZUlkZW50aWZpZXIge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogY3JlYXRlSGFzaCgnbWQ1JykudXBkYXRlKHNhbml0aXplUGF0aChwYXRoKSkuZGlnZXN0KCdoZXgnKSwgLy8gQ29kZVFMIFtTTTA0NTE0XSBVc2luZyBNRDUgdG8gY29udmVydCBhIGZpbGUgcGF0aCB0byBhIGZpeGVkIGxlbmd0aFxuXHRcdFx0Y29uZmlnUGF0aDogVVJJLmZpbGUocGF0aClcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gdG9Xb3Jrc3BhY2VCYWNrdXBJbmZvKHBhdGg6IHN0cmluZywgcmVtb3RlQXV0aG9yaXR5Pzogc3RyaW5nKTogSVdvcmtzcGFjZUJhY2t1cEluZm8ge1xuXHRcdHJldHVybiB7XG5cdFx0XHR3b3Jrc3BhY2U6IHtcblx0XHRcdFx0aWQ6IGNyZWF0ZUhhc2goJ21kNScpLnVwZGF0ZShzYW5pdGl6ZVBhdGgocGF0aCkpLmRpZ2VzdCgnaGV4JyksIC8vIENvZGVRTCBbU00wNDUxNF0gVXNpbmcgTUQ1IHRvIGNvbnZlcnQgYSBmaWxlIHBhdGggdG8gYSBmaXhlZCBsZW5ndGhcblx0XHRcdFx0Y29uZmlnUGF0aDogVVJJLmZpbGUocGF0aClcblx0XHRcdH0sXG5cdFx0XHRyZW1vdGVBdXRob3JpdHlcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gdG9Gb2xkZXJCYWNrdXBJbmZvKHVyaTogVVJJLCByZW1vdGVBdXRob3JpdHk/OiBzdHJpbmcpOiBJRm9sZGVyQmFja3VwSW5mbyB7XG5cdFx0cmV0dXJuIHsgZm9sZGVyVXJpOiB1cmksIHJlbW90ZUF1dGhvcml0eSB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gdG9TZXJpYWxpemVkV29ya3NwYWNlKHdzOiBJV29ya3NwYWNlSWRlbnRpZmllcik6IElTZXJpYWxpemVkV29ya3NwYWNlQmFja3VwSW5mbyB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiB3cy5pZCxcblx0XHRcdGNvbmZpZ1VSSVBhdGg6IHdzLmNvbmZpZ1BhdGgudG9TdHJpbmcoKVxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBlbnN1cmVGb2xkZXJFeGlzdHModXJpOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWZzLmV4aXN0c1N5bmModXJpLmZzUGF0aCkpIHtcblx0XHRcdGZzLm1rZGlyU3luYyh1cmkuZnNQYXRoKTtcblx0XHR9XG5cblx0XHRjb25zdCBiYWNrdXBGb2xkZXIgPSBzZXJ2aWNlLnRvQmFja3VwUGF0aCh1cmkpO1xuXHRcdHJldHVybiBjcmVhdGVCYWNrdXBGb2xkZXIoYmFja3VwRm9sZGVyKTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGVuc3VyZVdvcmtzcGFjZUV4aXN0cyh3b3Jrc3BhY2U6IElXb3Jrc3BhY2VJZGVudGlmaWVyKTogUHJvbWlzZTxJV29ya3NwYWNlSWRlbnRpZmllcj4ge1xuXHRcdGlmICghZnMuZXhpc3RzU3luYyh3b3Jrc3BhY2UuY29uZmlnUGF0aC5mc1BhdGgpKSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUod29ya3NwYWNlLmNvbmZpZ1BhdGguZnNQYXRoLCAnSGVsbG8nKTtcblx0XHR9XG5cblx0XHRjb25zdCBiYWNrdXBGb2xkZXIgPSBzZXJ2aWNlLnRvQmFja3VwUGF0aCh3b3Jrc3BhY2UuaWQpO1xuXHRcdGF3YWl0IGNyZWF0ZUJhY2t1cEZvbGRlcihiYWNrdXBGb2xkZXIpO1xuXG5cdFx0cmV0dXJuIHdvcmtzcGFjZTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZUJhY2t1cEZvbGRlcihiYWNrdXBGb2xkZXI6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghZnMuZXhpc3RzU3luYyhiYWNrdXBGb2xkZXIpKSB7XG5cdFx0XHRmcy5ta2RpclN5bmMoYmFja3VwRm9sZGVyKTtcblx0XHRcdGZzLm1rZGlyU3luYyhwYXRoLmpvaW4oYmFja3VwRm9sZGVyLCBTY2hlbWFzLmZpbGUpKTtcblx0XHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShwYXRoLmpvaW4oYmFja3VwRm9sZGVyLCBTY2hlbWFzLmZpbGUsICdmb28udHh0JyksICdIZWxsbycpO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIHJlYWRXb3Jrc3BhY2VzTWV0YWRhdGEoKTogSVNlcmlhbGl6ZWRCYWNrdXBXb3Jrc3BhY2VzIHtcblx0XHRyZXR1cm4gc3RhdGVNYWluU2VydmljZS5nZXRJdGVtKCdiYWNrdXBXb3Jrc3BhY2VzJykgYXMgSVNlcmlhbGl6ZWRCYWNrdXBXb3Jrc3BhY2VzO1xuXHR9XG5cblx0ZnVuY3Rpb24gd3JpdGVXb3Jrc3BhY2VzTWV0YWRhdGEoZGF0YTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRzdGF0ZU1haW5TZXJ2aWNlLnJlbW92ZUl0ZW0oJ2JhY2t1cFdvcmtzcGFjZXMnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c3RhdGVNYWluU2VydmljZS5zZXRJdGVtKCdiYWNrdXBXb3Jrc3BhY2VzJywgSlNPTi5wYXJzZShkYXRhKSk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gc2FuaXRpemVQYXRoKHA6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHBsYXRmb3JtLmlzTGludXggPyBwIDogcC50b0xvd2VyQ2FzZSgpO1xuXHR9XG5cblx0Y29uc3QgZm9vRmlsZSA9IFVSSS5maWxlKHBsYXRmb3JtLmlzV2luZG93cyA/ICdDOlxcXFxmb28nIDogJy9mb28nKTtcblx0Y29uc3QgYmFyRmlsZSA9IFVSSS5maWxlKHBsYXRmb3JtLmlzV2luZG93cyA/ICdDOlxcXFxiYXInIDogJy9iYXInKTtcblxuXHRsZXQgc2VydmljZTogQmFja3VwTWFpblNlcnZpY2UgJiB7XG5cdFx0dG9CYWNrdXBQYXRoKGFyZzogVVJJIHwgc3RyaW5nKTogc3RyaW5nO1xuXHRcdHRlc3RHZXRGb2xkZXJIYXNoKGZvbGRlcjogSUZvbGRlckJhY2t1cEluZm8pOiBzdHJpbmc7XG5cdFx0dGVzdEdldFdvcmtzcGFjZUJhY2t1cHMoKTogSVdvcmtzcGFjZUJhY2t1cEluZm9bXTtcblx0XHR0ZXN0R2V0Rm9sZGVyQmFja3VwcygpOiBJRm9sZGVyQmFja3VwSW5mb1tdO1xuXHR9O1xuXHRsZXQgY29uZmlnU2VydmljZTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRsZXQgc3RhdGVNYWluU2VydmljZTogSW5NZW1vcnlUZXN0U3RhdGVNYWluU2VydmljZTtcblxuXHRsZXQgZW52aXJvbm1lbnRTZXJ2aWNlOiBFbnZpcm9ubWVudE1haW5TZXJ2aWNlO1xuXHRsZXQgdGVzdERpcjogc3RyaW5nO1xuXHRsZXQgYmFja3VwSG9tZTogc3RyaW5nO1xuXHRsZXQgZXhpc3RpbmdUZXN0Rm9sZGVyMTogVVJJO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHR0ZXN0RGlyID0gZ2V0UmFuZG9tVGVzdFBhdGgob3MudG1wZGlyKCksICd2c2N0ZXN0cycsICdiYWNrdXBtYWluc2VydmljZScpO1xuXHRcdGJhY2t1cEhvbWUgPSBwYXRoLmpvaW4odGVzdERpciwgJ0JhY2t1cHMnKTtcblx0XHRleGlzdGluZ1Rlc3RGb2xkZXIxID0gVVJJLmZpbGUocGF0aC5qb2luKHRlc3REaXIsICdmb2xkZXIxJykpO1xuXG5cdFx0ZW52aXJvbm1lbnRTZXJ2aWNlID0gbmV3IEVudmlyb25tZW50TWFpblNlcnZpY2UocGFyc2VBcmdzKHByb2Nlc3MuYXJndiwgT1BUSU9OUyksIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCAuLi5wcm9kdWN0IH0pO1xuXG5cdFx0YXdhaXQgZnMucHJvbWlzZXMubWtkaXIoYmFja3VwSG9tZSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cblx0XHRjb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdHN0YXRlTWFpblNlcnZpY2UgPSBuZXcgSW5NZW1vcnlUZXN0U3RhdGVNYWluU2VydmljZSgpO1xuXG5cdFx0c2VydmljZSA9IG5ldyBjbGFzcyBUZXN0QmFja3VwTWFpblNlcnZpY2UgZXh0ZW5kcyBCYWNrdXBNYWluU2VydmljZSB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoZW52aXJvbm1lbnRTZXJ2aWNlLCBjb25maWdTZXJ2aWNlLCBuZXcgTG9nU2VydmljZShuZXcgQ29uc29sZU1haW5Mb2dnZXIoKSksIHN0YXRlTWFpblNlcnZpY2UpO1xuXG5cdFx0XHRcdHRoaXMuYmFja3VwSG9tZSA9IGJhY2t1cEhvbWU7XG5cdFx0XHR9XG5cblx0XHRcdHRvQmFja3VwUGF0aChhcmc6IFVSSSB8IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0XHRcdGNvbnN0IGlkID0gYXJnIGluc3RhbmNlb2YgVVJJID8gc3VwZXIuZ2V0Rm9sZGVySGFzaCh7IGZvbGRlclVyaTogYXJnIH0pIDogYXJnO1xuXHRcdFx0XHRyZXR1cm4gcGF0aC5qb2luKHRoaXMuYmFja3VwSG9tZSwgaWQpO1xuXHRcdFx0fVxuXG5cdFx0XHR0ZXN0R2V0Rm9sZGVySGFzaChmb2xkZXI6IElGb2xkZXJCYWNrdXBJbmZvKTogc3RyaW5nIHtcblx0XHRcdFx0cmV0dXJuIHN1cGVyLmdldEZvbGRlckhhc2goZm9sZGVyKTtcblx0XHRcdH1cblxuXHRcdFx0dGVzdEdldFdvcmtzcGFjZUJhY2t1cHMoKTogSVdvcmtzcGFjZUJhY2t1cEluZm9bXSB7XG5cdFx0XHRcdHJldHVybiBzdXBlci5nZXRXb3Jrc3BhY2VCYWNrdXBzKCk7XG5cdFx0XHR9XG5cblx0XHRcdHRlc3RHZXRGb2xkZXJCYWNrdXBzKCk6IElGb2xkZXJCYWNrdXBJbmZvW10ge1xuXHRcdFx0XHRyZXR1cm4gc3VwZXIuZ2V0Rm9sZGVyQmFja3VwcygpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRyZXR1cm4gc2VydmljZS5pbml0aWFsaXplKCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRyZXR1cm4gUHJvbWlzZXMucm0odGVzdERpcik7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlcnZpY2UgdmFsaWRhdGVzIGJhY2t1cCB3b3Jrc3BhY2VzIG9uIHN0YXJ0dXAgYW5kIGNsZWFucyB1cCAoZm9sZGVyIHdvcmtzcGFjZXMpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0Ly8gMSkgYmFja3VwIHdvcmtzcGFjZSBwYXRoIGRvZXMgbm90IGV4aXN0XG5cdFx0c2VydmljZS5yZWdpc3RlckZvbGRlckJhY2t1cCh0b0ZvbGRlckJhY2t1cEluZm8oZm9vRmlsZSkpO1xuXHRcdHNlcnZpY2UucmVnaXN0ZXJGb2xkZXJCYWNrdXAodG9Gb2xkZXJCYWNrdXBJbmZvKGJhckZpbGUpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRhc3NlcnRFcXVhbEZvbGRlckluZm9zKHNlcnZpY2UudGVzdEdldEZvbGRlckJhY2t1cHMoKSwgW10pO1xuXG5cdFx0Ly8gMikgYmFja3VwIHdvcmtzcGFjZSBwYXRoIGV4aXN0cyB3aXRoIGVtcHR5IGNvbnRlbnRzIHdpdGhpblxuXHRcdGZzLm1rZGlyU3luYyhzZXJ2aWNlLnRvQmFja3VwUGF0aChmb29GaWxlKSk7XG5cdFx0ZnMubWtkaXJTeW5jKHNlcnZpY2UudG9CYWNrdXBQYXRoKGJhckZpbGUpKTtcblx0XHRzZXJ2aWNlLnJlZ2lzdGVyRm9sZGVyQmFja3VwKHRvRm9sZGVyQmFja3VwSW5mbyhmb29GaWxlKSk7XG5cdFx0c2VydmljZS5yZWdpc3RlckZvbGRlckJhY2t1cCh0b0ZvbGRlckJhY2t1cEluZm8oYmFyRmlsZSkpO1xuXHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdGFzc2VydEVxdWFsRm9sZGVySW5mb3Moc2VydmljZS50ZXN0R2V0Rm9sZGVyQmFja3VwcygpLCBbXSk7XG5cdFx0YXNzZXJ0Lm9rKCFmcy5leGlzdHNTeW5jKHNlcnZpY2UudG9CYWNrdXBQYXRoKGZvb0ZpbGUpKSk7XG5cdFx0YXNzZXJ0Lm9rKCFmcy5leGlzdHNTeW5jKHNlcnZpY2UudG9CYWNrdXBQYXRoKGJhckZpbGUpKSk7XG5cblx0XHQvLyAzKSBiYWNrdXAgd29ya3NwYWNlIHBhdGggZXhpc3RzIHdpdGggZW1wdHkgZm9sZGVycyB3aXRoaW5cblx0XHRmcy5ta2RpclN5bmMoc2VydmljZS50b0JhY2t1cFBhdGgoZm9vRmlsZSkpO1xuXHRcdGZzLm1rZGlyU3luYyhzZXJ2aWNlLnRvQmFja3VwUGF0aChiYXJGaWxlKSk7XG5cdFx0ZnMubWtkaXJTeW5jKHBhdGguam9pbihzZXJ2aWNlLnRvQmFja3VwUGF0aChmb29GaWxlKSwgU2NoZW1hcy5maWxlKSk7XG5cdFx0ZnMubWtkaXJTeW5jKHBhdGguam9pbihzZXJ2aWNlLnRvQmFja3VwUGF0aChiYXJGaWxlKSwgU2NoZW1hcy51bnRpdGxlZCkpO1xuXHRcdHNlcnZpY2UucmVnaXN0ZXJGb2xkZXJCYWNrdXAodG9Gb2xkZXJCYWNrdXBJbmZvKGZvb0ZpbGUpKTtcblx0XHRzZXJ2aWNlLnJlZ2lzdGVyRm9sZGVyQmFja3VwKHRvRm9sZGVyQmFja3VwSW5mbyhiYXJGaWxlKSk7XG5cdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0YXNzZXJ0RXF1YWxGb2xkZXJJbmZvcyhzZXJ2aWNlLnRlc3RHZXRGb2xkZXJCYWNrdXBzKCksIFtdKTtcblx0XHRhc3NlcnQub2soIWZzLmV4aXN0c1N5bmMoc2VydmljZS50b0JhY2t1cFBhdGgoZm9vRmlsZSkpKTtcblx0XHRhc3NlcnQub2soIWZzLmV4aXN0c1N5bmMoc2VydmljZS50b0JhY2t1cFBhdGgoYmFyRmlsZSkpKTtcblxuXHRcdC8vIDQpIGJhY2t1cCB3b3Jrc3BhY2UgcGF0aCBwb2ludHMgdG8gYSB3b3Jrc3BhY2UgdGhhdCBubyBsb25nZXIgZXhpc3RzXG5cdFx0Ly8gc28gaXQgc2hvdWxkIGNvbnZlcnQgdGhlIGJhY2t1cCB3b3JzcGFjZSB0byBhbiBlbXB0eSB3b3Jrc3BhY2UgYmFja3VwXG5cdFx0Y29uc3QgZmlsZUJhY2t1cHMgPSBwYXRoLmpvaW4oc2VydmljZS50b0JhY2t1cFBhdGgoZm9vRmlsZSksIFNjaGVtYXMuZmlsZSk7XG5cdFx0ZnMubWtkaXJTeW5jKHNlcnZpY2UudG9CYWNrdXBQYXRoKGZvb0ZpbGUpKTtcblx0XHRmcy5ta2RpclN5bmMoc2VydmljZS50b0JhY2t1cFBhdGgoYmFyRmlsZSkpO1xuXHRcdGZzLm1rZGlyU3luYyhmaWxlQmFja3Vwcyk7XG5cdFx0c2VydmljZS5yZWdpc3RlckZvbGRlckJhY2t1cCh0b0ZvbGRlckJhY2t1cEluZm8oZm9vRmlsZSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnRlc3RHZXRGb2xkZXJCYWNrdXBzKCkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRFbXB0eVdpbmRvd0JhY2t1cHMoKS5sZW5ndGgsIDApO1xuXHRcdGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGZpbGVCYWNrdXBzLCAnYmFja3VwLnR4dCcpLCAnJyk7XG5cdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UudGVzdEdldEZvbGRlckJhY2t1cHMoKS5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEVtcHR5V2luZG93QmFja3VwcygpLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlcnZpY2UgdmFsaWRhdGVzIGJhY2t1cCB3b3Jrc3BhY2VzIG9uIHN0YXJ0dXAgYW5kIGNsZWFucyB1cCAocm9vdCB3b3Jrc3BhY2VzKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdC8vIDEpIGJhY2t1cCB3b3Jrc3BhY2UgcGF0aCBkb2VzIG5vdCBleGlzdFxuXHRcdHNlcnZpY2UucmVnaXN0ZXJXb3Jrc3BhY2VCYWNrdXAodG9Xb3Jrc3BhY2VCYWNrdXBJbmZvKGZvb0ZpbGUuZnNQYXRoKSk7XG5cdFx0c2VydmljZS5yZWdpc3RlcldvcmtzcGFjZUJhY2t1cCh0b1dvcmtzcGFjZUJhY2t1cEluZm8oYmFyRmlsZS5mc1BhdGgpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UudGVzdEdldFdvcmtzcGFjZUJhY2t1cHMoKSwgW10pO1xuXG5cdFx0Ly8gMikgYmFja3VwIHdvcmtzcGFjZSBwYXRoIGV4aXN0cyB3aXRoIGVtcHR5IGNvbnRlbnRzIHdpdGhpblxuXHRcdGZzLm1rZGlyU3luYyhzZXJ2aWNlLnRvQmFja3VwUGF0aChmb29GaWxlKSk7XG5cdFx0ZnMubWtkaXJTeW5jKHNlcnZpY2UudG9CYWNrdXBQYXRoKGJhckZpbGUpKTtcblx0XHRzZXJ2aWNlLnJlZ2lzdGVyV29ya3NwYWNlQmFja3VwKHRvV29ya3NwYWNlQmFja3VwSW5mbyhmb29GaWxlLmZzUGF0aCkpO1xuXHRcdHNlcnZpY2UucmVnaXN0ZXJXb3Jrc3BhY2VCYWNrdXAodG9Xb3Jrc3BhY2VCYWNrdXBJbmZvKGJhckZpbGUuZnNQYXRoKSk7XG5cdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLnRlc3RHZXRXb3Jrc3BhY2VCYWNrdXBzKCksIFtdKTtcblx0XHRhc3NlcnQub2soIWZzLmV4aXN0c1N5bmMoc2VydmljZS50b0JhY2t1cFBhdGgoZm9vRmlsZSkpKTtcblx0XHRhc3NlcnQub2soIWZzLmV4aXN0c1N5bmMoc2VydmljZS50b0JhY2t1cFBhdGgoYmFyRmlsZSkpKTtcblxuXHRcdC8vIDMpIGJhY2t1cCB3b3Jrc3BhY2UgcGF0aCBleGlzdHMgd2l0aCBlbXB0eSBmb2xkZXJzIHdpdGhpblxuXHRcdGZzLm1rZGlyU3luYyhzZXJ2aWNlLnRvQmFja3VwUGF0aChmb29GaWxlKSk7XG5cdFx0ZnMubWtkaXJTeW5jKHNlcnZpY2UudG9CYWNrdXBQYXRoKGJhckZpbGUpKTtcblx0XHRmcy5ta2RpclN5bmMocGF0aC5qb2luKHNlcnZpY2UudG9CYWNrdXBQYXRoKGZvb0ZpbGUpLCBTY2hlbWFzLmZpbGUpKTtcblx0XHRmcy5ta2RpclN5bmMocGF0aC5qb2luKHNlcnZpY2UudG9CYWNrdXBQYXRoKGJhckZpbGUpLCBTY2hlbWFzLnVudGl0bGVkKSk7XG5cdFx0c2VydmljZS5yZWdpc3RlcldvcmtzcGFjZUJhY2t1cCh0b1dvcmtzcGFjZUJhY2t1cEluZm8oZm9vRmlsZS5mc1BhdGgpKTtcblx0XHRzZXJ2aWNlLnJlZ2lzdGVyV29ya3NwYWNlQmFja3VwKHRvV29ya3NwYWNlQmFja3VwSW5mbyhiYXJGaWxlLmZzUGF0aCkpO1xuXHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS50ZXN0R2V0V29ya3NwYWNlQmFja3VwcygpLCBbXSk7XG5cdFx0YXNzZXJ0Lm9rKCFmcy5leGlzdHNTeW5jKHNlcnZpY2UudG9CYWNrdXBQYXRoKGZvb0ZpbGUpKSk7XG5cdFx0YXNzZXJ0Lm9rKCFmcy5leGlzdHNTeW5jKHNlcnZpY2UudG9CYWNrdXBQYXRoKGJhckZpbGUpKSk7XG5cblx0XHQvLyA0KSBiYWNrdXAgd29ya3NwYWNlIHBhdGggcG9pbnRzIHRvIGEgd29ya3NwYWNlIHRoYXQgbm8gbG9uZ2VyIGV4aXN0c1xuXHRcdC8vIHNvIGl0IHNob3VsZCBjb252ZXJ0IHRoZSBiYWNrdXAgd29yc3BhY2UgdG8gYW4gZW1wdHkgd29ya3NwYWNlIGJhY2t1cFxuXHRcdGNvbnN0IGZpbGVCYWNrdXBzID0gcGF0aC5qb2luKHNlcnZpY2UudG9CYWNrdXBQYXRoKGZvb0ZpbGUpLCBTY2hlbWFzLmZpbGUpO1xuXHRcdGZzLm1rZGlyU3luYyhzZXJ2aWNlLnRvQmFja3VwUGF0aChmb29GaWxlKSk7XG5cdFx0ZnMubWtkaXJTeW5jKHNlcnZpY2UudG9CYWNrdXBQYXRoKGJhckZpbGUpKTtcblx0XHRmcy5ta2RpclN5bmMoZmlsZUJhY2t1cHMpO1xuXHRcdHNlcnZpY2UucmVnaXN0ZXJXb3Jrc3BhY2VCYWNrdXAodG9Xb3Jrc3BhY2VCYWNrdXBJbmZvKGZvb0ZpbGUuZnNQYXRoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UudGVzdEdldFdvcmtzcGFjZUJhY2t1cHMoKS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEVtcHR5V2luZG93QmFja3VwcygpLmxlbmd0aCwgMCk7XG5cdFx0ZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZmlsZUJhY2t1cHMsICdiYWNrdXAudHh0JyksICcnKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS50ZXN0R2V0V29ya3NwYWNlQmFja3VwcygpLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RW1wdHlXaW5kb3dCYWNrdXBzKCkubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnc2VydmljZSBzdXBwb3J0cyB0byBtaWdyYXRlIGJhY2t1cCBkYXRhIGZyb20gYW5vdGhlciBsb2NhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBiYWNrdXBQYXRoVG9NaWdyYXRlID0gc2VydmljZS50b0JhY2t1cFBhdGgoZm9vRmlsZSk7XG5cdFx0ZnMubWtkaXJTeW5jKGJhY2t1cFBhdGhUb01pZ3JhdGUpO1xuXHRcdGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGJhY2t1cFBhdGhUb01pZ3JhdGUsICdiYWNrdXAudHh0JyksICdTb21lIERhdGEnKTtcblx0XHRzZXJ2aWNlLnJlZ2lzdGVyRm9sZGVyQmFja3VwKHRvRm9sZGVyQmFja3VwSW5mbyhVUkkuZmlsZShiYWNrdXBQYXRoVG9NaWdyYXRlKSkpO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlQmFja3VwUGF0aCA9IGF3YWl0IHNlcnZpY2UucmVnaXN0ZXJXb3Jrc3BhY2VCYWNrdXAodG9Xb3Jrc3BhY2VCYWNrdXBJbmZvKGJhckZpbGUuZnNQYXRoKSwgYmFja3VwUGF0aFRvTWlncmF0ZSk7XG5cblx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyh3b3Jrc3BhY2VCYWNrdXBQYXRoKSk7XG5cdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmMocGF0aC5qb2luKHdvcmtzcGFjZUJhY2t1cFBhdGgsICdiYWNrdXAudHh0JykpKTtcblx0XHRhc3NlcnQub2soIWZzLmV4aXN0c1N5bmMoYmFja3VwUGF0aFRvTWlncmF0ZSkpO1xuXG5cdFx0Y29uc3QgZW1wdHlCYWNrdXBzID0gc2VydmljZS5nZXRFbXB0eVdpbmRvd0JhY2t1cHMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoMCwgZW1wdHlCYWNrdXBzLmxlbmd0aCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlcnZpY2UgYmFja3VwIG1pZ3JhdGlvbiBtYWtlcyBzdXJlIHRvIHByZXNlcnZlIGV4aXN0aW5nIGJhY2t1cHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYmFja3VwUGF0aFRvTWlncmF0ZSA9IHNlcnZpY2UudG9CYWNrdXBQYXRoKGZvb0ZpbGUpO1xuXHRcdGZzLm1rZGlyU3luYyhiYWNrdXBQYXRoVG9NaWdyYXRlKTtcblx0XHRmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihiYWNrdXBQYXRoVG9NaWdyYXRlLCAnYmFja3VwLnR4dCcpLCAnU29tZSBEYXRhJyk7XG5cdFx0c2VydmljZS5yZWdpc3RlckZvbGRlckJhY2t1cCh0b0ZvbGRlckJhY2t1cEluZm8oVVJJLmZpbGUoYmFja3VwUGF0aFRvTWlncmF0ZSkpKTtcblxuXHRcdGNvbnN0IGJhY2t1cFBhdGhUb1ByZXNlcnZlID0gc2VydmljZS50b0JhY2t1cFBhdGgoYmFyRmlsZSk7XG5cdFx0ZnMubWtkaXJTeW5jKGJhY2t1cFBhdGhUb1ByZXNlcnZlKTtcblx0XHRmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihiYWNrdXBQYXRoVG9QcmVzZXJ2ZSwgJ2JhY2t1cC50eHQnKSwgJ1NvbWUgRGF0YScpO1xuXHRcdHNlcnZpY2UucmVnaXN0ZXJGb2xkZXJCYWNrdXAodG9Gb2xkZXJCYWNrdXBJbmZvKFVSSS5maWxlKGJhY2t1cFBhdGhUb1ByZXNlcnZlKSkpO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlQmFja3VwUGF0aCA9IGF3YWl0IHNlcnZpY2UucmVnaXN0ZXJXb3Jrc3BhY2VCYWNrdXAodG9Xb3Jrc3BhY2VCYWNrdXBJbmZvKGJhckZpbGUuZnNQYXRoKSwgYmFja3VwUGF0aFRvTWlncmF0ZSk7XG5cblx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyh3b3Jrc3BhY2VCYWNrdXBQYXRoKSk7XG5cdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmMocGF0aC5qb2luKHdvcmtzcGFjZUJhY2t1cFBhdGgsICdiYWNrdXAudHh0JykpKTtcblx0XHRhc3NlcnQub2soIWZzLmV4aXN0c1N5bmMoYmFja3VwUGF0aFRvTWlncmF0ZSkpO1xuXG5cdFx0Y29uc3QgZW1wdHlCYWNrdXBzID0gc2VydmljZS5nZXRFbXB0eVdpbmRvd0JhY2t1cHMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoMSwgZW1wdHlCYWNrdXBzLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDEsIGZzLnJlYWRkaXJTeW5jKHBhdGguam9pbihiYWNrdXBIb21lLCBlbXB0eUJhY2t1cHNbMF0uYmFja3VwRm9sZGVyKSkubGVuZ3RoKTtcblx0fSk7XG5cblx0c3VpdGUoJ2xvYWRTeW5jJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2dldEZvbGRlckJhY2t1cFBhdGhzKCkgc2hvdWxkIHJldHVybiBbXSB3aGVuIHdvcmtzcGFjZXMuanNvbiBkb2VzblxcJ3QgZXhpc3QnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnRFcXVhbEZvbGRlckluZm9zKHNlcnZpY2UudGVzdEdldEZvbGRlckJhY2t1cHMoKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0Rm9sZGVyQmFja3VwUGF0aHMoKSBzaG91bGQgcmV0dXJuIFtdIHdoZW4gZm9sZGVycyBpbiB3b3Jrc3BhY2VzLmpzb24gaXMgYWJzZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0d3JpdGVXb3Jrc3BhY2VzTWV0YWRhdGEoJ3t9Jyk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRcdGFzc2VydEVxdWFsRm9sZGVySW5mb3Moc2VydmljZS50ZXN0R2V0Rm9sZGVyQmFja3VwcygpLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRGb2xkZXJCYWNrdXBQYXRocygpIHNob3VsZCByZXR1cm4gW10gd2hlbiBmb2xkZXJzIGluIHdvcmtzcGFjZXMuanNvbiBpcyBub3QgYSBzdHJpbmcgYXJyYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR3cml0ZVdvcmtzcGFjZXNNZXRhZGF0YSgne1wiZm9sZGVyc1wiOnt9fScpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0XHRhc3NlcnRFcXVhbEZvbGRlckluZm9zKHNlcnZpY2UudGVzdEdldEZvbGRlckJhY2t1cHMoKSwgW10pO1xuXHRcdFx0d3JpdGVXb3Jrc3BhY2VzTWV0YWRhdGEoJ3tcImZvbGRlcnNcIjp7XCJmb29cIjogW1wiYmFyXCJdfX0nKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdFx0YXNzZXJ0RXF1YWxGb2xkZXJJbmZvcyhzZXJ2aWNlLnRlc3RHZXRGb2xkZXJCYWNrdXBzKCksIFtdKTtcblx0XHRcdHdyaXRlV29ya3NwYWNlc01ldGFkYXRhKCd7XCJmb2xkZXJzXCI6e1wiZm9vXCI6IFtdfX0nKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdFx0YXNzZXJ0RXF1YWxGb2xkZXJJbmZvcyhzZXJ2aWNlLnRlc3RHZXRGb2xkZXJCYWNrdXBzKCksIFtdKTtcblx0XHRcdHdyaXRlV29ya3NwYWNlc01ldGFkYXRhKCd7XCJmb2xkZXJzXCI6e1wiZm9vXCI6IFwiYmFyXCJ9fScpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0XHRhc3NlcnRFcXVhbEZvbGRlckluZm9zKHNlcnZpY2UudGVzdEdldEZvbGRlckJhY2t1cHMoKSwgW10pO1xuXHRcdFx0d3JpdGVXb3Jrc3BhY2VzTWV0YWRhdGEoJ3tcImZvbGRlcnNcIjpcImZvb1wifScpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0XHRhc3NlcnRFcXVhbEZvbGRlckluZm9zKHNlcnZpY2UudGVzdEdldEZvbGRlckJhY2t1cHMoKSwgW10pO1xuXHRcdFx0d3JpdGVXb3Jrc3BhY2VzTWV0YWRhdGEoJ3tcImZvbGRlcnNcIjoxfScpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0XHRhc3NlcnRFcXVhbEZvbGRlckluZm9zKHNlcnZpY2UudGVzdEdldEZvbGRlckJhY2t1cHMoKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0Rm9sZGVyQmFja3VwUGF0aHMoKSBzaG91bGQgcmV0dXJuIFtdIHdoZW4gZmlsZXMuaG90RXhpdCA9IFwib25FeGl0QW5kV2luZG93Q2xvc2VcIicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZpID0gdG9Gb2xkZXJCYWNrdXBJbmZvKFVSSS5maWxlKGZvb0ZpbGUuZnNQYXRoLnRvVXBwZXJDYXNlKCkpKTtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJGb2xkZXJCYWNrdXAoZmkpO1xuXHRcdFx0YXNzZXJ0RXF1YWxGb2xkZXJJbmZvcyhzZXJ2aWNlLnRlc3RHZXRGb2xkZXJCYWNrdXBzKCksIFtmaV0pO1xuXHRcdFx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignZmlsZXMuaG90RXhpdCcsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVRfQU5EX1dJTkRPV19DTE9TRSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRcdGFzc2VydEVxdWFsRm9sZGVySW5mb3Moc2VydmljZS50ZXN0R2V0Rm9sZGVyQmFja3VwcygpLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRXb3Jrc3BhY2VCYWNrdXBzKCkgc2hvdWxkIHJldHVybiBbXSB3aGVuIHdvcmtzcGFjZXMuanNvbiBkb2VzblxcJ3QgZXhpc3QnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UudGVzdEdldFdvcmtzcGFjZUJhY2t1cHMoKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0V29ya3NwYWNlQmFja3VwcygpIHNob3VsZCByZXR1cm4gW10gd2hlbiBmb2xkZXJXb3Jrc3BhY2VzIGluIHdvcmtzcGFjZXMuanNvbiBpcyBhYnNlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR3cml0ZVdvcmtzcGFjZXNNZXRhZGF0YSgne30nKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLnRlc3RHZXRXb3Jrc3BhY2VCYWNrdXBzKCksIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldFdvcmtzcGFjZUJhY2t1cHMoKSBzaG91bGQgcmV0dXJuIFtdIHdoZW4gcm9vdFdvcmtzcGFjZXMgaW4gd29ya3NwYWNlcy5qc29uIGlzIG5vdCBhIG9iamVjdCBhcnJheScsIGFzeW5jICgpID0+IHtcblx0XHRcdHdyaXRlV29ya3NwYWNlc01ldGFkYXRhKCd7XCJyb290V29ya3NwYWNlc1wiOnt9fScpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UudGVzdEdldFdvcmtzcGFjZUJhY2t1cHMoKSwgW10pO1xuXHRcdFx0d3JpdGVXb3Jrc3BhY2VzTWV0YWRhdGEoJ3tcInJvb3RXb3Jrc3BhY2VzXCI6e1wiZm9vXCI6IFtcImJhclwiXX19Jyk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS50ZXN0R2V0V29ya3NwYWNlQmFja3VwcygpLCBbXSk7XG5cdFx0XHR3cml0ZVdvcmtzcGFjZXNNZXRhZGF0YSgne1wicm9vdFdvcmtzcGFjZXNcIjp7XCJmb29cIjogW119fScpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UudGVzdEdldFdvcmtzcGFjZUJhY2t1cHMoKSwgW10pO1xuXHRcdFx0d3JpdGVXb3Jrc3BhY2VzTWV0YWRhdGEoJ3tcInJvb3RXb3Jrc3BhY2VzXCI6e1wiZm9vXCI6IFwiYmFyXCJ9fScpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UudGVzdEdldFdvcmtzcGFjZUJhY2t1cHMoKSwgW10pO1xuXHRcdFx0d3JpdGVXb3Jrc3BhY2VzTWV0YWRhdGEoJ3tcInJvb3RXb3Jrc3BhY2VzXCI6XCJmb29cIn0nKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLnRlc3RHZXRXb3Jrc3BhY2VCYWNrdXBzKCksIFtdKTtcblx0XHRcdHdyaXRlV29ya3NwYWNlc01ldGFkYXRhKCd7XCJyb290V29ya3NwYWNlc1wiOjF9Jyk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS50ZXN0R2V0V29ya3NwYWNlQmFja3VwcygpLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRXb3Jrc3BhY2VCYWNrdXBzKCkgc2hvdWxkIHJldHVybiBbXSB3aGVuIHdvcmtzcGFjZXMgaW4gd29ya3NwYWNlcy5qc29uIGlzIG5vdCBhIG9iamVjdCBhcnJheScsIGFzeW5jICgpID0+IHtcblx0XHRcdHdyaXRlV29ya3NwYWNlc01ldGFkYXRhKCd7XCJ3b3Jrc3BhY2VzXCI6e319Jyk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS50ZXN0R2V0V29ya3NwYWNlQmFja3VwcygpLCBbXSk7XG5cdFx0XHR3cml0ZVdvcmtzcGFjZXNNZXRhZGF0YSgne1wid29ya3NwYWNlc1wiOntcImZvb1wiOiBbXCJiYXJcIl19fScpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UudGVzdEdldFdvcmtzcGFjZUJhY2t1cHMoKSwgW10pO1xuXHRcdFx0d3JpdGVXb3Jrc3BhY2VzTWV0YWRhdGEoJ3tcIndvcmtzcGFjZXNcIjp7XCJmb29cIjogW119fScpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UudGVzdEdldFdvcmtzcGFjZUJhY2t1cHMoKSwgW10pO1xuXHRcdFx0d3JpdGVXb3Jrc3BhY2VzTWV0YWRhdGEoJ3tcIndvcmtzcGFjZXNcIjp7XCJmb29cIjogXCJiYXJcIn19Jyk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS50ZXN0R2V0V29ya3NwYWNlQmFja3VwcygpLCBbXSk7XG5cdFx0XHR3cml0ZVdvcmtzcGFjZXNNZXRhZGF0YSgne1wid29ya3NwYWNlc1wiOlwiZm9vXCJ9Jyk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS50ZXN0R2V0V29ya3NwYWNlQmFja3VwcygpLCBbXSk7XG5cdFx0XHR3cml0ZVdvcmtzcGFjZXNNZXRhZGF0YSgne1wid29ya3NwYWNlc1wiOjF9Jyk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS50ZXN0R2V0V29ya3NwYWNlQmFja3VwcygpLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRXb3Jrc3BhY2VCYWNrdXBzKCkgc2hvdWxkIHJldHVybiBbXSB3aGVuIGZpbGVzLmhvdEV4aXQgPSBcIm9uRXhpdEFuZFdpbmRvd0Nsb3NlXCInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cHBlckZvb1BhdGggPSBmb29GaWxlLmZzUGF0aC50b1VwcGVyQ2FzZSgpO1xuXHRcdFx0c2VydmljZS5yZWdpc3RlcldvcmtzcGFjZUJhY2t1cCh0b1dvcmtzcGFjZUJhY2t1cEluZm8odXBwZXJGb29QYXRoKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS50ZXN0R2V0V29ya3NwYWNlQmFja3VwcygpLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UudGVzdEdldFdvcmtzcGFjZUJhY2t1cHMoKS5tYXAociA9PiByLndvcmtzcGFjZS5jb25maWdQYXRoLnRvU3RyaW5nKCkpLCBbVVJJLmZpbGUodXBwZXJGb29QYXRoKS50b1N0cmluZygpXSk7XG5cdFx0XHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdmaWxlcy5ob3RFeGl0JywgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVF9BTkRfV0lORE9XX0NMT1NFKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLnRlc3RHZXRXb3Jrc3BhY2VCYWNrdXBzKCksIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldEVtcHR5V29ya3NwYWNlQmFja3VwUGF0aHMoKSBzaG91bGQgcmV0dXJuIFtdIHdoZW4gd29ya3NwYWNlcy5qc29uIGRvZXNuXFwndCBleGlzdCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5nZXRFbXB0eVdpbmRvd0JhY2t1cHMoKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0RW1wdHlXb3Jrc3BhY2VCYWNrdXBQYXRocygpIHNob3VsZCByZXR1cm4gW10gd2hlbiBmb2xkZXJXb3Jrc3BhY2VzIGluIHdvcmtzcGFjZXMuanNvbiBpcyBhYnNlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR3cml0ZVdvcmtzcGFjZXNNZXRhZGF0YSgne30nKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmdldEVtcHR5V2luZG93QmFja3VwcygpLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRFbXB0eVdvcmtzcGFjZUJhY2t1cFBhdGhzKCkgc2hvdWxkIHJldHVybiBbXSB3aGVuIGZvbGRlcldvcmtzcGFjZXMgaW4gd29ya3NwYWNlcy5qc29uIGlzIG5vdCBhIHN0cmluZyBhcnJheScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHdyaXRlV29ya3NwYWNlc01ldGFkYXRhKCd7XCJlbXB0eVdvcmtzcGFjZXNcIjp7fX0nKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmdldEVtcHR5V2luZG93QmFja3VwcygpLCBbXSk7XG5cdFx0XHR3cml0ZVdvcmtzcGFjZXNNZXRhZGF0YSgne1wiZW1wdHlXb3Jrc3BhY2VzXCI6e1wiZm9vXCI6IFtcImJhclwiXX19Jyk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5nZXRFbXB0eVdpbmRvd0JhY2t1cHMoKSwgW10pO1xuXHRcdFx0d3JpdGVXb3Jrc3BhY2VzTWV0YWRhdGEoJ3tcImVtcHR5V29ya3NwYWNlc1wiOntcImZvb1wiOiBbXX19Jyk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5nZXRFbXB0eVdpbmRvd0JhY2t1cHMoKSwgW10pO1xuXHRcdFx0d3JpdGVXb3Jrc3BhY2VzTWV0YWRhdGEoJ3tcImVtcHR5V29ya3NwYWNlc1wiOntcImZvb1wiOiBcImJhclwifX0nKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmdldEVtcHR5V2luZG93QmFja3VwcygpLCBbXSk7XG5cdFx0XHR3cml0ZVdvcmtzcGFjZXNNZXRhZGF0YSgne1wiZW1wdHlXb3Jrc3BhY2VzXCI6XCJmb29cIn0nKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmdldEVtcHR5V2luZG93QmFja3VwcygpLCBbXSk7XG5cdFx0XHR3cml0ZVdvcmtzcGFjZXNNZXRhZGF0YSgne1wiZW1wdHlXb3Jrc3BhY2VzXCI6MX0nKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmdldEVtcHR5V2luZG93QmFja3VwcygpLCBbXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdkZWR1cGVGb2xkZXJXb3Jrc3BhY2VzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBpZ25vcmUgZHVwbGljYXRlcyAoZm9sZGVyIHdvcmtzcGFjZSknLCBhc3luYyAoKSA9PiB7XG5cblx0XHRcdGF3YWl0IGVuc3VyZUZvbGRlckV4aXN0cyhleGlzdGluZ1Rlc3RGb2xkZXIxKTtcblxuXHRcdFx0Y29uc3Qgd29ya3NwYWNlc0pzb246IElTZXJpYWxpemVkQmFja3VwV29ya3NwYWNlcyA9IHtcblx0XHRcdFx0d29ya3NwYWNlczogW10sXG5cdFx0XHRcdGZvbGRlcnM6IFt7IGZvbGRlclVyaTogZXhpc3RpbmdUZXN0Rm9sZGVyMS50b1N0cmluZygpIH0sIHsgZm9sZGVyVXJpOiBleGlzdGluZ1Rlc3RGb2xkZXIxLnRvU3RyaW5nKCkgfV0sXG5cdFx0XHRcdGVtcHR5V2luZG93czogW11cblx0XHRcdH07XG5cdFx0XHR3cml0ZVdvcmtzcGFjZXNNZXRhZGF0YShKU09OLnN0cmluZ2lmeSh3b3Jrc3BhY2VzSnNvbikpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cblx0XHRcdGNvbnN0IGpzb24gPSByZWFkV29ya3NwYWNlc01ldGFkYXRhKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGpzb24uZm9sZGVycywgW3sgZm9sZGVyVXJpOiBleGlzdGluZ1Rlc3RGb2xkZXIxLnRvU3RyaW5nKCkgfV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGlnbm9yZSBkdXBsaWNhdGVzIG9uIFdpbmRvd3MgYW5kIE1hYyAoZm9sZGVyIHdvcmtzcGFjZSknLCBhc3luYyAoKSA9PiB7XG5cblx0XHRcdGF3YWl0IGVuc3VyZUZvbGRlckV4aXN0cyhleGlzdGluZ1Rlc3RGb2xkZXIxKTtcblxuXHRcdFx0Y29uc3Qgd29ya3NwYWNlc0pzb246IElTZXJpYWxpemVkQmFja3VwV29ya3NwYWNlcyA9IHtcblx0XHRcdFx0d29ya3NwYWNlczogW10sXG5cdFx0XHRcdGZvbGRlcnM6IFt7IGZvbGRlclVyaTogZXhpc3RpbmdUZXN0Rm9sZGVyMS50b1N0cmluZygpIH0sIHsgZm9sZGVyVXJpOiBleGlzdGluZ1Rlc3RGb2xkZXIxLnRvU3RyaW5nKCkudG9Mb3dlckNhc2UoKSB9XSxcblx0XHRcdFx0ZW1wdHlXaW5kb3dzOiBbXVxuXHRcdFx0fTtcblx0XHRcdHdyaXRlV29ya3NwYWNlc01ldGFkYXRhKEpTT04uc3RyaW5naWZ5KHdvcmtzcGFjZXNKc29uKSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRcdGNvbnN0IGpzb24gPSByZWFkV29ya3NwYWNlc01ldGFkYXRhKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGpzb24uZm9sZGVycywgW3sgZm9sZGVyVXJpOiBleGlzdGluZ1Rlc3RGb2xkZXIxLnRvU3RyaW5nKCkgfV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGlnbm9yZSBkdXBsaWNhdGVzIG9uIFdpbmRvd3MgYW5kIE1hYyAocm9vdCB3b3Jrc3BhY2UpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlUGF0aCA9IHBhdGguam9pbih0ZXN0RGlyLCAnRm9vLmNvZGUtd29ya3NwYWNlJyk7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VQYXRoMSA9IHBhdGguam9pbih0ZXN0RGlyLCAnRk9PLmNvZGUtd29ya3NwYWNlJyk7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VQYXRoMiA9IHBhdGguam9pbih0ZXN0RGlyLCAnZm9vLmNvZGUtd29ya3NwYWNlJyk7XG5cblx0XHRcdGNvbnN0IHdvcmtzcGFjZTEgPSBhd2FpdCBlbnN1cmVXb3Jrc3BhY2VFeGlzdHModG9Xb3Jrc3BhY2Uod29ya3NwYWNlUGF0aCkpO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlMiA9IGF3YWl0IGVuc3VyZVdvcmtzcGFjZUV4aXN0cyh0b1dvcmtzcGFjZSh3b3Jrc3BhY2VQYXRoMSkpO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlMyA9IGF3YWl0IGVuc3VyZVdvcmtzcGFjZUV4aXN0cyh0b1dvcmtzcGFjZSh3b3Jrc3BhY2VQYXRoMikpO1xuXG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VzSnNvbjogSVNlcmlhbGl6ZWRCYWNrdXBXb3Jrc3BhY2VzID0ge1xuXHRcdFx0XHR3b3Jrc3BhY2VzOiBbd29ya3NwYWNlMSwgd29ya3NwYWNlMiwgd29ya3NwYWNlM10ubWFwKHRvU2VyaWFsaXplZFdvcmtzcGFjZSksXG5cdFx0XHRcdGZvbGRlcnM6IFtdLFxuXHRcdFx0XHRlbXB0eVdpbmRvd3M6IFtdXG5cdFx0XHR9O1xuXHRcdFx0d3JpdGVXb3Jrc3BhY2VzTWV0YWRhdGEoSlNPTi5zdHJpbmdpZnkod29ya3NwYWNlc0pzb24pKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXG5cdFx0XHRjb25zdCBqc29uID0gcmVhZFdvcmtzcGFjZXNNZXRhZGF0YSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGpzb24ud29ya3NwYWNlcy5sZW5ndGgsIHBsYXRmb3JtLmlzTGludXggPyAzIDogMSk7XG5cdFx0XHRpZiAocGxhdGZvcm0uaXNMaW51eCkge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGpzb24ud29ya3NwYWNlcy5tYXAociA9PiByLmNvbmZpZ1VSSVBhdGgpLCBbVVJJLmZpbGUod29ya3NwYWNlUGF0aCkudG9TdHJpbmcoKSwgVVJJLmZpbGUod29ya3NwYWNlUGF0aDEpLnRvU3RyaW5nKCksIFVSSS5maWxlKHdvcmtzcGFjZVBhdGgyKS50b1N0cmluZygpXSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGpzb24ud29ya3NwYWNlcy5tYXAociA9PiByLmNvbmZpZ1VSSVBhdGgpLCBbVVJJLmZpbGUod29ya3NwYWNlUGF0aCkudG9TdHJpbmcoKV0sICdzaG91bGQgcmV0dXJuIHRoZSBmaXJzdCBkdXBsaWNhdGVkIGVudHJ5Jyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZWdpc3RlcldpbmRvd0ZvckJhY2t1cHMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIHBlcnNpc3QgcGF0aHMgdG8gd29ya3NwYWNlcy5qc29uIChmb2xkZXIgd29ya3NwYWNlKScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJGb2xkZXJCYWNrdXAodG9Gb2xkZXJCYWNrdXBJbmZvKGZvb0ZpbGUpKTtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJGb2xkZXJCYWNrdXAodG9Gb2xkZXJCYWNrdXBJbmZvKGJhckZpbGUpKTtcblx0XHRcdGFzc2VydEVxdWFsRm9sZGVySW5mb3Moc2VydmljZS50ZXN0R2V0Rm9sZGVyQmFja3VwcygpLCBbdG9Gb2xkZXJCYWNrdXBJbmZvKGZvb0ZpbGUpLCB0b0ZvbGRlckJhY2t1cEluZm8oYmFyRmlsZSldKTtcblxuXHRcdFx0Y29uc3QganNvbiA9IHJlYWRXb3Jrc3BhY2VzTWV0YWRhdGEoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoanNvbi5mb2xkZXJzLCBbeyBmb2xkZXJVcmk6IGZvb0ZpbGUudG9TdHJpbmcoKSB9LCB7IGZvbGRlclVyaTogYmFyRmlsZS50b1N0cmluZygpIH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBwZXJzaXN0IHBhdGhzIHRvIHdvcmtzcGFjZXMuanNvbiAocm9vdCB3b3Jrc3BhY2UpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd3MxID0gdG9Xb3Jrc3BhY2VCYWNrdXBJbmZvKGZvb0ZpbGUuZnNQYXRoKTtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJXb3Jrc3BhY2VCYWNrdXAod3MxKTtcblx0XHRcdGNvbnN0IHdzMiA9IHRvV29ya3NwYWNlQmFja3VwSW5mbyhiYXJGaWxlLmZzUGF0aCk7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyV29ya3NwYWNlQmFja3VwKHdzMik7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS50ZXN0R2V0V29ya3NwYWNlQmFja3VwcygpLm1hcChiID0+IGIud29ya3NwYWNlLmNvbmZpZ1BhdGgudG9TdHJpbmcoKSksIFtmb29GaWxlLnRvU3RyaW5nKCksIGJhckZpbGUudG9TdHJpbmcoKV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzMS53b3Jrc3BhY2UuaWQsIHNlcnZpY2UudGVzdEdldFdvcmtzcGFjZUJhY2t1cHMoKVswXS53b3Jrc3BhY2UuaWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzMi53b3Jrc3BhY2UuaWQsIHNlcnZpY2UudGVzdEdldFdvcmtzcGFjZUJhY2t1cHMoKVsxXS53b3Jrc3BhY2UuaWQpO1xuXG5cdFx0XHRjb25zdCBqc29uID0gcmVhZFdvcmtzcGFjZXNNZXRhZGF0YSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChqc29uLndvcmtzcGFjZXMubWFwKGIgPT4gYi5jb25maWdVUklQYXRoKSwgW2Zvb0ZpbGUudG9TdHJpbmcoKSwgYmFyRmlsZS50b1N0cmluZygpXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MxLndvcmtzcGFjZS5pZCwganNvbi53b3Jrc3BhY2VzWzBdLmlkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3czIud29ya3NwYWNlLmlkLCBqc29uLndvcmtzcGFjZXNbMV0uaWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgYWx3YXlzIHN0b3JlIHRoZSB3b3Jrc3BhY2UgcGF0aCBpbiB3b3Jrc3BhY2VzLmpzb24gdXNpbmcgdGhlIGNhc2UgZ2l2ZW4sIHJlZ2FyZGxlc3Mgb2Ygd2hldGhlciB0aGUgZmlsZSBzeXN0ZW0gaXMgY2FzZS1zZW5zaXRpdmUgKGZvbGRlciB3b3Jrc3BhY2UpJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlcnZpY2UucmVnaXN0ZXJGb2xkZXJCYWNrdXAodG9Gb2xkZXJCYWNrdXBJbmZvKFVSSS5maWxlKGZvb0ZpbGUuZnNQYXRoLnRvVXBwZXJDYXNlKCkpKSk7XG5cdFx0YXNzZXJ0RXF1YWxGb2xkZXJJbmZvcyhzZXJ2aWNlLnRlc3RHZXRGb2xkZXJCYWNrdXBzKCksIFt0b0ZvbGRlckJhY2t1cEluZm8oVVJJLmZpbGUoZm9vRmlsZS5mc1BhdGgudG9VcHBlckNhc2UoKSkpXSk7XG5cblx0XHRjb25zdCBqc29uID0gcmVhZFdvcmtzcGFjZXNNZXRhZGF0YSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoanNvbi5mb2xkZXJzLCBbeyBmb2xkZXJVcmk6IFVSSS5maWxlKGZvb0ZpbGUuZnNQYXRoLnRvVXBwZXJDYXNlKCkpLnRvU3RyaW5nKCkgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgYWx3YXlzIHN0b3JlIHRoZSB3b3Jrc3BhY2UgcGF0aCBpbiB3b3Jrc3BhY2VzLmpzb24gdXNpbmcgdGhlIGNhc2UgZ2l2ZW4sIHJlZ2FyZGxlc3Mgb2Ygd2hldGhlciB0aGUgZmlsZSBzeXN0ZW0gaXMgY2FzZS1zZW5zaXRpdmUgKHJvb3Qgd29ya3NwYWNlKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cHBlckZvb1BhdGggPSBmb29GaWxlLmZzUGF0aC50b1VwcGVyQ2FzZSgpO1xuXHRcdHNlcnZpY2UucmVnaXN0ZXJXb3Jrc3BhY2VCYWNrdXAodG9Xb3Jrc3BhY2VCYWNrdXBJbmZvKHVwcGVyRm9vUGF0aCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS50ZXN0R2V0V29ya3NwYWNlQmFja3VwcygpLm1hcChiID0+IGIud29ya3NwYWNlLmNvbmZpZ1BhdGgudG9TdHJpbmcoKSksIFtVUkkuZmlsZSh1cHBlckZvb1BhdGgpLnRvU3RyaW5nKCldKTtcblxuXHRcdGNvbnN0IGpzb24gPSByZWFkV29ya3NwYWNlc01ldGFkYXRhKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChqc29uLndvcmtzcGFjZXMubWFwKGIgPT4gYi5jb25maWdVUklQYXRoKSwgW1VSSS5maWxlKHVwcGVyRm9vUGF0aCkudG9TdHJpbmcoKV0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0V29ya3NwYWNlSGFzaCcsICgpID0+IHtcblx0XHQocGxhdGZvcm0uaXNMaW51eCA/IHRlc3Quc2tpcCA6IHRlc3QpKCdzaG91bGQgaWdub3JlIGNhc2Ugb24gV2luZG93cyBhbmQgTWFjJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXNzZXJ0Rm9sZGVySGFzaCA9ICh1cmkxOiBVUkksIHVyaTI6IFVSSSkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS50ZXN0R2V0Rm9sZGVySGFzaCh0b0ZvbGRlckJhY2t1cEluZm8odXJpMSkpLCBzZXJ2aWNlLnRlc3RHZXRGb2xkZXJIYXNoKHRvRm9sZGVyQmFja3VwSW5mbyh1cmkyKSkpO1xuXHRcdFx0fTtcblxuXHRcdFx0aWYgKHBsYXRmb3JtLmlzTWFjaW50b3NoKSB7XG5cdFx0XHRcdGFzc2VydEZvbGRlckhhc2goVVJJLmZpbGUoJy9mb28nKSwgVVJJLmZpbGUoJy9GT08nKSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwbGF0Zm9ybS5pc1dpbmRvd3MpIHtcblx0XHRcdFx0YXNzZXJ0Rm9sZGVySGFzaChVUkkuZmlsZSgnYzpcXFxcZm9vJyksIFVSSS5maWxlKCdDOlxcXFxGT08nKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdtaXhlZCBwYXRoIGNhc2luZycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGNhc2UgaW5zZW5zaXRpdmUgcGF0aHMgcHJvcGVybHkgKHJlZ2lzdGVyV2luZG93Rm9yQmFja3Vwc1N5bmMpIChmb2xkZXIgd29ya3NwYWNlKScsICgpID0+IHtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJGb2xkZXJCYWNrdXAodG9Gb2xkZXJCYWNrdXBJbmZvKGZvb0ZpbGUpKTtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJGb2xkZXJCYWNrdXAodG9Gb2xkZXJCYWNrdXBJbmZvKFVSSS5maWxlKGZvb0ZpbGUuZnNQYXRoLnRvVXBwZXJDYXNlKCkpKSk7XG5cblx0XHRcdGlmIChwbGF0Zm9ybS5pc0xpbnV4KSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnRlc3RHZXRGb2xkZXJCYWNrdXBzKCkubGVuZ3RoLCAyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnRlc3RHZXRGb2xkZXJCYWNrdXBzKCkubGVuZ3RoLCAxKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgY2FzZSBpbnNlbnNpdGl2ZSBwYXRocyBwcm9wZXJseSAocmVnaXN0ZXJXaW5kb3dGb3JCYWNrdXBzU3luYykgKHJvb3Qgd29ya3NwYWNlKScsICgpID0+IHtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJXb3Jrc3BhY2VCYWNrdXAodG9Xb3Jrc3BhY2VCYWNrdXBJbmZvKGZvb0ZpbGUuZnNQYXRoKSk7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyV29ya3NwYWNlQmFja3VwKHRvV29ya3NwYWNlQmFja3VwSW5mbyhmb29GaWxlLmZzUGF0aC50b1VwcGVyQ2FzZSgpKSk7XG5cblx0XHRcdGlmIChwbGF0Zm9ybS5pc0xpbnV4KSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnRlc3RHZXRXb3Jrc3BhY2VCYWNrdXBzKCkubGVuZ3RoLCAyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnRlc3RHZXRXb3Jrc3BhY2VCYWNrdXBzKCkubGVuZ3RoLCAxKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldERpcnR5V29ya3NwYWNlcycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgcmVwb3J0IGlmIGEgd29ya3NwYWNlIG9yIGZvbGRlciBoYXMgYmFja3VwcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZvbGRlckJhY2t1cFBhdGggPSBzZXJ2aWNlLnJlZ2lzdGVyRm9sZGVyQmFja3VwKHRvRm9sZGVyQmFja3VwSW5mbyhmb29GaWxlKSk7XG5cblx0XHRcdGNvbnN0IGJhY2t1cFdvcmtzcGFjZUluZm8gPSB0b1dvcmtzcGFjZUJhY2t1cEluZm8oZm9vRmlsZS5mc1BhdGgpO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlQmFja3VwUGF0aCA9IHNlcnZpY2UucmVnaXN0ZXJXb3Jrc3BhY2VCYWNrdXAoYmFja3VwV29ya3NwYWNlSW5mbyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoKGF3YWl0IHNlcnZpY2UuZ2V0RGlydHlXb3Jrc3BhY2VzKCkpLmxlbmd0aCksIDApO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBmcy5wcm9taXNlcy5ta2RpcihwYXRoLmpvaW4oZm9sZGVyQmFja3VwUGF0aCwgU2NoZW1hcy5maWxlKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRcdGF3YWl0IGZzLnByb21pc2VzLm1rZGlyKHBhdGguam9pbih3b3Jrc3BhY2VCYWNrdXBQYXRoLCBTY2hlbWFzLnVudGl0bGVkKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gaWdub3JlIC0gZm9sZGVyIG1pZ2h0IGV4aXN0IGFscmVhZHlcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCgoYXdhaXQgc2VydmljZS5nZXREaXJ0eVdvcmtzcGFjZXMoKSkubGVuZ3RoKSwgMCk7XG5cblx0XHRcdGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGZvbGRlckJhY2t1cFBhdGgsIFNjaGVtYXMuZmlsZSwgJzU5NGE0YTlkODJhMjc3YTg5OWQ0NzEzYTViMDhmNTA0JyksICcnKTtcblx0XHRcdGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKHdvcmtzcGFjZUJhY2t1cFBhdGgsIFNjaGVtYXMudW50aXRsZWQsICc1OTRhNGE5ZDgyYTI3N2E4OTlkNDcxM2E1YjA4ZjUwNCcpLCAnJyk7XG5cblx0XHRcdGNvbnN0IGRpcnR5V29ya3NwYWNlcyA9IGF3YWl0IHNlcnZpY2UuZ2V0RGlydHlXb3Jrc3BhY2VzKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlydHlXb3Jrc3BhY2VzLmxlbmd0aCwgMik7XG5cblx0XHRcdGxldCBmb3VuZCA9IDA7XG5cdFx0XHRmb3IgKGNvbnN0IGRpcnR5V29ya3BzcGFjZSBvZiBkaXJ0eVdvcmtzcGFjZXMpIHtcblx0XHRcdFx0aWYgKGlzRm9sZGVyQmFja3VwSW5mbyhkaXJ0eVdvcmtwc3BhY2UpKSB7XG5cdFx0XHRcdFx0aWYgKGlzRXF1YWwoZm9vRmlsZSwgZGlydHlXb3JrcHNwYWNlLmZvbGRlclVyaSkpIHtcblx0XHRcdFx0XHRcdGZvdW5kKys7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmIChpc0VxdWFsKGJhY2t1cFdvcmtzcGFjZUluZm8ud29ya3NwYWNlLmNvbmZpZ1BhdGgsIGRpcnR5V29ya3BzcGFjZS53b3Jrc3BhY2UuY29uZmlnUGF0aCkpIHtcblx0XHRcdFx0XHRcdGZvdW5kKys7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZCwgMik7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxrQkFBa0I7QUFDM0IsWUFBWSxRQUFRO0FBQ3BCLFlBQVksUUFBUTtBQUNwQixTQUFTLGVBQWU7QUFDeEIsWUFBWSxVQUFVO0FBQ3RCLFlBQVksY0FBYztBQUMxQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsWUFBWSx5QkFBeUI7QUFDOUMsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxTQUFTLGlCQUFpQjtBQUNuQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHlCQUF5QjtBQUNsQyxPQUFPLGFBQWE7QUFDcEIsU0FBNEIsMEJBQWdEO0FBRTVFLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsK0NBQStDO0FBRXhELFdBQVcscUJBQXFCLE1BQU07QUFFckMsV0FBUyx1QkFBdUIsUUFBNkIsVUFBK0I7QUFDM0YsVUFBTSxrQkFBa0IsQ0FBQyxPQUEwQixFQUFFLFdBQVcsRUFBRSxVQUFVLFNBQVMsR0FBRyxpQkFBaUIsRUFBRSxnQkFBZ0I7QUFDM0gsV0FBTyxnQkFBZ0IsT0FBTyxJQUFJLGVBQWUsR0FBRyxTQUFTLElBQUksZUFBZSxDQUFDO0FBQUEsRUFDbEY7QUFFQSxXQUFTLFlBQVlBLE9BQW9DO0FBQ3hELFdBQU87QUFBQSxNQUNOLElBQUksV0FBVyxLQUFLLEVBQUUsT0FBTyxhQUFhQSxLQUFJLENBQUMsRUFBRSxPQUFPLEtBQUs7QUFBQTtBQUFBLE1BQzdELFlBQVksSUFBSSxLQUFLQSxLQUFJO0FB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
