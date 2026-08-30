import assert from "assert";
import * as fs from "fs";
import * as os from "os";
import { isUNC, toSlashes } from "../../../../base/common/extpath.js";
import { normalizeDriveLetter } from "../../../../base/common/labels.js";
import * as path from "../../../../base/common/path.js";
import { isWindows } from "../../../../base/common/platform.js";
import { extUriBiasedIgnorePathCase } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import * as pfs from "../../../../base/node/pfs.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { flakySuite, getRandomTestPath } from "../../../../base/test/node/testUtils.js";
import { EnvironmentMainService } from "../../../environment/electron-main/environmentMainService.js";
import { OPTIONS, parseArgs } from "../../../environment/node/argv.js";
import { FileService } from "../../../files/common/fileService.js";
import { NullLogService } from "../../../log/common/log.js";
import product from "../../../product/common/product.js";
import { SaveStrategy, StateService } from "../../../state/node/stateService.js";
import { UriIdentityService } from "../../../uriIdentity/common/uriIdentityService.js";
import { UserDataProfilesMainService } from "../../../userDataProfile/electron-main/userDataProfile.js";
import { WORKSPACE_EXTENSION } from "../../../workspace/common/workspace.js";
import { rewriteWorkspaceFileForNewLocation } from "../../common/workspaces.js";
import { WorkspacesManagementMainService } from "../../electron-main/workspacesManagementMainService.js";
flakySuite("WorkspacesManagementMainService", () => {
  class TestDialogMainService {
    pickFileFolder(options, window) {
      throw new Error("Method not implemented.");
    }
    pickFolder(options, window) {
      throw new Error("Method not implemented.");
    }
    pickFile(options, window) {
      throw new Error("Method not implemented.");
    }
    pickWorkspace(options, window) {
      throw new Error("Method not implemented.");
    }
    showMessageBox(options, window) {
      throw new Error("Method not implemented.");
    }
    showSaveDialog(options, window) {
      throw new Error("Method not implemented.");
    }
    showOpenDialog(options, window) {
      throw new Error("Method not implemented.");
    }
  }
  class TestBackupMainService {
    isHotExitEnabled() {
      throw new Error("Method not implemented.");
    }
    getEmptyWindowBackups() {
      throw new Error("Method not implemented.");
    }
    registerWorkspaceBackup(workspaceInfo, migrateFrom) {
      throw new Error("Method not implemented.");
    }
    registerFolderBackup(folder) {
      throw new Error("Method not implemented.");
    }
    registerEmptyWindowBackup(empty) {
      throw new Error("Method not implemented.");
    }
    async getDirtyWorkspaces() {
      return [];
    }
  }
  function createUntitledWorkspace(folders, names) {
    return service.createUntitledWorkspace(folders.map((folder, index) => ({ uri: URI.file(folder), name: names ? names[index] : void 0 })));
  }
  function createWorkspace(workspaceConfigPath, folders, names) {
    const ws = {
      folders: []
    };
    for (let i = 0; i < folders.length; i++) {
      const f = folders[i];
      const s = f instanceof URI ? { uri: f.toString() } : { path: f };
      if (names) {
        s.name = names[i];
      }
      ws.folders.push(s);
    }
    fs.writeFileSync(workspaceConfigPath, JSON.stringify(ws));
  }
  let testDir;
  let untitledWorkspacesHomePath;
  let environmentMainService;
  let service;
  const cwd = process.cwd();
  const tmpDir = os.tmpdir();
  setup(async () => {
    testDir = getRandomTestPath(tmpDir, "vsctests", "workspacesmanagementmainservice");
    untitledWorkspacesHomePath = path.join(testDir, "Workspaces");
    const productService = { _serviceBrand: void 0, ...product };
    environmentMainService = new class TestEnvironmentService extends EnvironmentMainService {
      constructor() {
        super(parseArgs(process.argv, OPTIONS), productService);
      }
      get untitledWorkspacesHome() {
        return URI.file(untitledWorkspacesHomePath);
      }
    }();
    const logService = new NullLogService();
    const fileService = new FileService(logService);
    service = new WorkspacesManagementMainService(environmentMainService, logService, new UserDataProfilesMainService(new StateService(SaveStrategy.DELAYED, environmentMainService, logService, fileService), new UriIdentityService(fileService), environmentMainService, fileService, logService, productService), new TestBackupMainService(), new TestDialogMainService());
    return fs.promises.mkdir(untitledWorkspacesHomePath, { recursive: true });
  });
  teardown(() => {
    service.dispose();
    return pfs.Promises.rm(testDir);
  });
  function assertPathEquals(pathInWorkspaceFile, pathOnDisk) {
    if (isWindows) {
      pathInWorkspaceFile = normalizeDriveLetter(pathInWorkspaceFile);
      pathOnDisk = normalizeDriveLetter(pathOnDisk);
      if (!isUNC(pathOnDisk)) {
        pathOnDisk = toSlashes(pathOnDisk);
      }
    }
    assert.strictEqual(pathInWorkspaceFile, pathOnDisk);
  }
  function assertEqualURI(u1, u2) {
    assert.strictEqual(u1.toString(), u2.toString());
  }
  test("createWorkspace (folders)", async () => {
    const workspace = await createUntitledWorkspace([cwd, tmpDir]);
    assert.ok(workspace);
    assert.ok(fs.existsSync(workspace.configPath.fsPath));
    assert.ok(service.isUntitledWorkspace(workspace));
    const ws = JSON.parse(fs.readFileSync(workspace.configPath.fsPath).toString());
    assert.strictEqual(ws.folders.length, 2);
    assertPathEquals(ws.folders[0].path, cwd);
    assertPathEquals(ws.folders[1].path, tmpDir);
    assert.ok(!ws.folders[0].name);
    assert.ok(!ws.folders[1].name);
  });
  test("createWorkspace (folders with name)", async () => {
    const workspace = await createUntitledWorkspace([cwd, tmpDir], ["currentworkingdirectory", "tempdir"]);
    assert.ok(workspace);
    assert.ok(fs.existsSync(workspace.configPath.fsPath));
    assert.ok(service.isUntitledWorkspace(workspace));
    const ws = JSON.parse(fs.readFileSync(workspace.configPath.fsPath).toString());
    assert.strictEqual(ws.folders.length, 2);
    assertPathEquals(ws.folders[0].path, cwd);
    assertPathEquals(ws.folders[1].path, tmpDir);
    assert.strictEqual(ws.folders[0].name, "currentworkingdirectory");
    assert.strictEqual(ws.folders[1].name, "tempdir");
  });
  test("createUntitledWorkspace (folders as other resource URIs)", async () => {
    const folder1URI = URI.parse("myscheme://server/work/p/f1");
    const folder2URI = URI.parse("myscheme://server/work/o/f3");
    const workspace = await service.createUntitledWorkspace([{ uri: folder1URI }, { uri: folder2URI }], "server");
    assert.ok(workspace);
    assert.ok(fs.existsSync(workspace.configPath.fsPath));
    assert.ok(service.isUntitledWorkspace(workspace));
    const ws = JSON.parse(fs.readFileSync(workspace.configPath.fsPath).toString());
    assert.strictEqual(ws.folders.length, 2);
    assert.strictEqual(ws.folders[0].uri, folder1URI.toString(true));
    assert.strictEqual(ws.folders[1].uri, folder2URI.toString(true));
    assert.ok(!ws.folders[0].name);
    assert.ok(!ws.folders[1].name);
    assert.strictEqual(ws.remoteAuthority, "server");
  });
  test("resolveWorkspace", async () => {
    const workspace = await createUntitledWorkspace([cwd, tmpDir]);
    assert.ok(await service.resolveLocalWorkspace(workspace.configPath));
    const newPath = path.join(path.dirname(workspace.configPath.fsPath), `workspace.${WORKSPACE_EXTENSION}`);
    fs.renameSync(workspace.configPath.fsPath, newPath);
    workspace.configPath = URI.file(newPath);
    const resolved = await service.resolveLocalWorkspace(workspace.configPath);
    assert.strictEqual(2, resolved.folders.length);
    assertEqualURI(resolved.configPath, workspace.configPath);
    assert.ok(resolved.id);
    fs.writeFileSync(workspace.configPath.fsPath, JSON.stringify({ something: "something" }));
    const resolvedInvalid = await service.resolveLocalWorkspace(workspace.configPath);
    assert.ok(!resolvedInvalid);
    fs.writeFileSync(workspace.configPath.fsPath, JSON.stringify({ transient: true, folders: [] }));
    const resolvedTransient = await service.resolveLocalWorkspace(workspace.configPath);
    assert.ok(resolvedTransient?.transient);
  });
  test("resolveWorkspace (support relative paths)", async () => {
    const workspace = await createUntitledWorkspace([cwd, tmpDir]);
    fs.writeFileSync(workspace.configPath.fsPath, JSON.stringify({ folders: [{ path: "./ticino-playground/lib" }] }));
    const resolved = await service.resolveLocalWorkspace(workspace.configPath);
    assertEqualURI(resolved.folders[0].uri, URI.file(path.join(path.dirname(workspace.configPath.fsPath), "ticino-playground", "lib")));
  });
  test("resolveWorkspace (support relative paths #2)", async () => {
    const workspace = await createUntitledWorkspace([cwd, tmpDir]);
    fs.writeFileSync(workspace.configPath.fsPath, JSON.stringify({ folders: [{ path: "./ticino-playground/lib/../other" }] }));
    const resolved = await service.resolveLocalWorkspace(workspace.configPath);
    assertEqualURI(resolved.folders[0].uri, URI.file(path.join(path.dirname(workspace.configPath.fsPath), "ticino-playground", "other")));
  });
  test("resolveWorkspace (support relative paths #3)", async () => {
    const workspace = await createUntitledWorkspace([cwd, tmpDir]);
    fs.writeFileSync(workspace.configPath.fsPath, JSON.stringify({ folders: [{ path: "ticino-playground/lib" }] }));
    const resolved = await service.resolveLocalWorkspace(workspace.configPath);
    assertEqualURI(resolved.folders[0].uri, URI.file(path.join(path.dirname(workspace.configPath.fsPath), "ticino-playground", "lib")));
  });
  test("resolveWorkspace (support invalid JSON via fault tolerant parsing)", async () => {
    const workspace = await createUntitledWorkspace([cwd, tmpDir]);
    fs.writeFileSync(workspace.configPath.fsPath, '{ "folders": [ { "path": "./ticino-playground/lib" } , ] }');
    const resolved = await service.resolveLocalWorkspace(workspace.configPath);
    assertEqualURI(resolved.folders[0].uri, URI.file(path.join(path.dirname(workspace.configPath.fsPath), "ticino-playground", "lib")));
  });
  test("rewriteWorkspaceFileForNewLocation", async () => {
    const folder1 = cwd;
    const tmpInsideDir = path.join(tmpDir, "inside");
    const firstConfigPath = path.join(tmpDir, "myworkspace0.code-workspace");
    createWorkspace(firstConfigPath, [folder1, "inside", path.join("inside", "somefolder")]);
    const origContent = fs.readFileSync(firstConfigPath).toString();
    let origConfigPath = URI.file(firstConfigPath);
    let workspaceConfigPath = URI.file(path.join(tmpDir, "inside", "myworkspace1.code-workspace"));
    let newContent = rewriteWorkspaceFileForNewLocation(origContent, origConfigPath, false, workspaceConfigPath, extUriBiasedIgnorePathCase);
    let ws = JSON.parse(newContent);
    assert.strictEqual(ws.folders.length, 3);
    assertPathEquals(ws.folders[0].path, folder1);
    assertPathEquals(ws.folders[1].path, ".");
    assertPathEquals(ws.folders[2].path, "somefolder");
    origConfigPath = workspaceConfigPath;
    workspaceConfigPath = URI.file(path.join(tmpDir, "myworkspace2.code-workspace"));
    newContent = rewriteWorkspaceFileForNewLocation(newContent, origConfigPath, false, workspaceConfigPath, extUriBiasedIgnorePathCase);
    ws = JSON.parse(newContent);
    assert.strictEqual(ws.folders.length, 3);
    assertPathEquals(ws.folders[0].path, folder1);
    assertPathEquals(ws.folders[1].path, "inside");
    assertPathEquals(ws.folders[2].path, "inside/somefolder");
    origConfigPath = workspaceConfigPath;
    workspaceConfigPath = URI.file(path.join(tmpDir, "other", "myworkspace2.code-workspace"));
    newContent = rewriteWorkspaceFileForNewLocation(newContent, origConfigPath, false, workspaceConfigPath, extUriBiasedIgnorePathCase);
    ws = JSON.parse(newContent);
    assert.strictEqual(ws.folders.length, 3);
    assertPathEquals(ws.folders[0].path, folder1);
    assertPathEquals(ws.folders[1].path, "../inside");
    assertPathEquals(ws.folders[2].path, "../inside/somefolder");
    origConfigPath = workspaceConfigPath;
    workspaceConfigPath = URI.parse("foo://foo/bar/myworkspace2.code-workspace");
    newContent = rewriteWorkspaceFileForNewLocation(newContent, origConfigPath, false, workspaceConfigPath, extUriBiasedIgnorePathCase);
    ws = JSON.parse(newContent);
    assert.strictEqual(ws.folders.length, 3);
    assert.strictEqual(ws.folders[0].uri, URI.file(folder1).toString(true));
    assert.strictEqual(ws.folders[1].uri, URI.file(tmpInsideDir).toString(true));
    assert.strictEqual(ws.folders[2].uri, URI.file(path.join(tmpInsideDir, "somefolder")).toString(true));
    fs.unlinkSync(firstConfigPath);
  });
  test("rewriteWorkspaceFileForNewLocation (preserves comments)", async () => {
    const workspace = await createUntitledWorkspace([cwd, tmpDir, path.join(tmpDir, "somefolder")]);
    const workspaceConfigPath = URI.file(path.join(tmpDir, `myworkspace.${Date.now()}.${WORKSPACE_EXTENSION}`));
    let origContent = fs.readFileSync(workspace.configPath.fsPath).toString();
    origContent = `// this is a comment
${origContent}`;
    const newContent = rewriteWorkspaceFileForNewLocation(origContent, workspace.configPath, false, workspaceConfigPath, extUriBiasedIgnorePathCase);
    assert.strictEqual(0, newContent.indexOf("// this is a comment"));
    await service.deleteUntitledWorkspace(workspace);
  });
  test("rewriteWorkspaceFileForNewLocation (preserves forward slashes)", async () => {
    const workspace = await createUntitledWorkspace([cwd, tmpDir, path.join(tmpDir, "somefolder")]);
    const workspaceConfigPath = URI.file(path.join(tmpDir, `myworkspace.${Date.now()}.${WORKSPACE_EXTENSION}`));
    let origContent = fs.readFileSync(workspace.configPath.fsPath).toString();
    origContent = origContent.replace(/[\\]/g, "/");
    const newContent = rewriteWorkspaceFileForNewLocation(origContent, workspace.configPath, false, workspaceConfigPath, extUriBiasedIgnorePathCase);
    const ws = JSON.parse(newContent);
    assert.ok(ws.folders.every((f) => f.path.indexOf("\\") < 0));
    await service.deleteUntitledWorkspace(workspace);
  });
  (!isWindows ? test.skip : test)("rewriteWorkspaceFileForNewLocation (unc paths)", async () => {
    const workspaceLocation = path.join(tmpDir, "wsloc");
    const folder1Location = "x:\\foo";
    const folder2Location = "\\\\server\\share2\\some\\path";
    const folder3Location = path.join(workspaceLocation, "inner", "more");
    const workspace = await createUntitledWorkspace([folder1Location, folder2Location, folder3Location]);
    const workspaceConfigPath = URI.file(path.join(workspaceLocation, `myworkspace.${Date.now()}.${WORKSPACE_EXTENSION}`));
    const origContent = fs.readFileSync(workspace.configPath.fsPath).toString();
    const newContent = rewriteWorkspaceFileForNewLocation(origContent, workspace.configPath, true, workspaceConfigPath, extUriBiasedIgnorePathCase);
    const ws = JSON.parse(newContent);
    assertPathEquals(ws.folders[0].path, folder1Location);
    assertPathEquals(ws.folders[1].path, folder2Location);
    assertPathEquals(ws.folders[2].path, "inner/more");
    await service.deleteUntitledWorkspace(workspace);
  });
  test("deleteUntitledWorkspace (untitled)", async () => {
    const workspace = await createUntitledWorkspace([cwd, tmpDir]);
    assert.ok(fs.existsSync(workspace.configPath.fsPath));
    await service.deleteUntitledWorkspace(workspace);
    assert.ok(!fs.existsSync(workspace.configPath.fsPath));
  });
  test("deleteUntitledWorkspace (saved)", async () => {
    const workspace = await createUntitledWorkspace([cwd, tmpDir]);
    await service.deleteUntitledWorkspace(workspace);
  });
  test("getUntitledWorkspace", async function() {
    await service.initialize();
    let untitled = service.getUntitledWorkspaces();
    assert.strictEqual(untitled.length, 0);
    const untitledOne = await createUntitledWorkspace([cwd, tmpDir]);
    assert.ok(fs.existsSync(untitledOne.configPath.fsPath));
    await service.initialize();
    untitled = service.getUntitledWorkspaces();
    assert.strictEqual(1, untitled.length);
    assert.strictEqual(untitledOne.id, untitled[0].workspace.id);
    await service.deleteUntitledWorkspace(untitledOne);
    await service.initialize();
    untitled = service.getUntitledWorkspaces();
    assert.strictEqual(0, untitled.length);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcd29ya3NwYWNlc1xcdGVzdFxcZWxlY3Ryb24tbWFpblxcd29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgb3MgZnJvbSAnb3MnO1xuaW1wb3J0IHsgaXNVTkMsIHRvU2xhc2hlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V4dHBhdGguanMnO1xuaW1wb3J0IHsgbm9ybWFsaXplRHJpdmVMZXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYWJlbHMuanMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgKiBhcyBwZnMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9ub2RlL3Bmcy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGZsYWt5U3VpdGUsIGdldFJhbmRvbVRlc3RQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L25vZGUvdGVzdFV0aWxzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VCYWNrdXBJbmZvLCBJRm9sZGVyQmFja3VwSW5mbyB9IGZyb20gJy4uLy4uLy4uL2JhY2t1cC9jb21tb24vYmFja3VwLmpzJztcbmltcG9ydCB7IElCYWNrdXBNYWluU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2JhY2t1cC9lbGVjdHJvbi1tYWluL2JhY2t1cC5qcyc7XG5pbXBvcnQgeyBJRW1wdHlXaW5kb3dCYWNrdXBJbmZvIH0gZnJvbSAnLi4vLi4vLi4vYmFja3VwL25vZGUvYmFja3VwLmpzJztcbmltcG9ydCB7IElOYXRpdmVPcGVuRGlhbG9nT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSURpYWxvZ01haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZGlhbG9ncy9lbGVjdHJvbi1tYWluL2RpYWxvZ01haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVudmlyb25tZW50TWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lbnZpcm9ubWVudC9lbGVjdHJvbi1tYWluL2Vudmlyb25tZW50TWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgT1BUSU9OUywgcGFyc2VBcmdzIH0gZnJvbSAnLi4vLi4vLi4vZW52aXJvbm1lbnQvbm9kZS9hcmd2LmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBTYXZlU3RyYXRlZ3ksIFN0YXRlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3N0YXRlL25vZGUvc3RhdGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVXNlckRhdGFQcm9maWxlc01haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdXNlckRhdGFQcm9maWxlL2VsZWN0cm9uLW1haW4vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElSYXdGaWxlV29ya3NwYWNlRm9sZGVyLCBJUmF3VXJpV29ya3NwYWNlRm9sZGVyLCBXT1JLU1BBQ0VfRVhURU5TSU9OIH0gZnJvbSAnLi4vLi4vLi4vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVN0b3JlZFdvcmtzcGFjZSwgSVN0b3JlZFdvcmtzcGFjZUZvbGRlciwgSVdvcmtzcGFjZUZvbGRlckNyZWF0aW9uRGF0YSwgcmV3cml0ZVdvcmtzcGFjZUZpbGVGb3JOZXdMb2NhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi93b3Jrc3BhY2VzLmpzJztcbmltcG9ydCB7IFdvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbGVjdHJvbi1tYWluL3dvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2UuanMnO1xuXG5mbGFreVN1aXRlKCdXb3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlJywgKCkgPT4ge1xuXG5cdGNsYXNzIFRlc3REaWFsb2dNYWluU2VydmljZSBpbXBsZW1lbnRzIElEaWFsb2dNYWluU2VydmljZSB7XG5cblx0XHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRcdHBpY2tGaWxlRm9sZGVyKG9wdGlvbnM6IElOYXRpdmVPcGVuRGlhbG9nT3B0aW9ucywgd2luZG93PzogRWxlY3Ryb24uQnJvd3NlcldpbmRvdyB8IHVuZGVmaW5lZCk6IFByb21pc2U8c3RyaW5nW10gfCB1bmRlZmluZWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdFx0cGlja0ZvbGRlcihvcHRpb25zOiBJTmF0aXZlT3BlbkRpYWxvZ09wdGlvbnMsIHdpbmRvdz86IEVsZWN0cm9uLkJyb3dzZXJXaW5kb3cgfCB1bmRlZmluZWQpOiBQcm9taXNlPHN0cmluZ1tdIHwgdW5kZWZpbmVkPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRcdHBpY2tGaWxlKG9wdGlvbnM6IElOYXRpdmVPcGVuRGlhbG9nT3B0aW9ucywgd2luZG93PzogRWxlY3Ryb24uQnJvd3NlcldpbmRvdyB8IHVuZGVmaW5lZCk6IFByb21pc2U8c3RyaW5nW10gfCB1bmRlZmluZWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdFx0cGlja1dvcmtzcGFjZShvcHRpb25zOiBJTmF0aXZlT3BlbkRpYWxvZ09wdGlvbnMsIHdpbmRvdz86IEVsZWN0cm9uLkJyb3dzZXJXaW5kb3cgfCB1bmRlZmluZWQpOiBQcm9taXNlPHN0cmluZ1tdIHwgdW5kZWZpbmVkPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRcdHNob3dNZXNzYWdlQm94KG9wdGlvbnM6IEVsZWN0cm9uLk1lc3NhZ2VCb3hPcHRpb25zLCB3aW5kb3c/OiBFbGVjdHJvbi5Ccm93c2VyV2luZG93IHwgdW5kZWZpbmVkKTogUHJvbWlzZTxFbGVjdHJvbi5NZXNzYWdlQm94UmV0dXJuVmFsdWU+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdFx0c2hvd1NhdmVEaWFsb2cob3B0aW9uczogRWxlY3Ryb24uU2F2ZURpYWxvZ09wdGlvbnMsIHdpbmRvdz86IEVsZWN0cm9uLkJyb3dzZXJXaW5kb3cgfCB1bmRlZmluZWQpOiBQcm9taXNlPEVsZWN0cm9uLlNhdmVEaWFsb2dSZXR1cm5WYWx1ZT4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0XHRzaG93T3BlbkRpYWxvZyhvcHRpb25zOiBFbGVjdHJvbi5PcGVuRGlhbG9nT3B0aW9ucywgd2luZG93PzogRWxlY3Ryb24uQnJvd3NlcldpbmRvdyB8IHVuZGVmaW5lZCk6IFByb21pc2U8RWxlY3Ryb24uT3BlbkRpYWxvZ1JldHVyblZhbHVlPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHR9XG5cblx0Y2xhc3MgVGVzdEJhY2t1cE1haW5TZXJ2aWNlIGltcGxlbWVudHMgSUJhY2t1cE1haW5TZXJ2aWNlIHtcblxuXHRcdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdFx0aXNIb3RFeGl0RW5hYmxlZCgpOiBib29sZWFuIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdFx0Z2V0RW1wdHlXaW5kb3dCYWNrdXBzKCk6IElFbXB0eVdpbmRvd0JhY2t1cEluZm9bXSB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRcdHJlZ2lzdGVyV29ya3NwYWNlQmFja3VwKHdvcmtzcGFjZUluZm86IElXb3Jrc3BhY2VCYWNrdXBJbmZvKTogc3RyaW5nO1xuXHRcdHJlZ2lzdGVyV29ya3NwYWNlQmFja3VwKHdvcmtzcGFjZUluZm86IElXb3Jrc3BhY2VCYWNrdXBJbmZvLCBtaWdyYXRlRnJvbTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+O1xuXHRcdHJlZ2lzdGVyV29ya3NwYWNlQmFja3VwKHdvcmtzcGFjZUluZm86IHVua25vd24sIG1pZ3JhdGVGcm9tPzogdW5rbm93bik6IHN0cmluZyB8IFByb21pc2U8c3RyaW5nPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRcdHJlZ2lzdGVyRm9sZGVyQmFja3VwKGZvbGRlcjogSUZvbGRlckJhY2t1cEluZm8pOiBzdHJpbmcgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0XHRyZWdpc3RlckVtcHR5V2luZG93QmFja3VwKGVtcHR5OiBJRW1wdHlXaW5kb3dCYWNrdXBJbmZvKTogc3RyaW5nIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdFx0YXN5bmMgZ2V0RGlydHlXb3Jrc3BhY2VzKCk6IFByb21pc2U8KElXb3Jrc3BhY2VCYWNrdXBJbmZvIHwgSUZvbGRlckJhY2t1cEluZm8pW10+IHsgcmV0dXJuIFtdOyB9XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVVbnRpdGxlZFdvcmtzcGFjZShmb2xkZXJzOiBzdHJpbmdbXSwgbmFtZXM/OiBzdHJpbmdbXSkge1xuXHRcdHJldHVybiBzZXJ2aWNlLmNyZWF0ZVVudGl0bGVkV29ya3NwYWNlKGZvbGRlcnMubWFwKChmb2xkZXIsIGluZGV4KSA9PiAoeyB1cmk6IFVSSS5maWxlKGZvbGRlciksIG5hbWU6IG5hbWVzID8gbmFtZXNbaW5kZXhdIDogdW5kZWZpbmVkIH0gYXMgSVdvcmtzcGFjZUZvbGRlckNyZWF0aW9uRGF0YSkpKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZVdvcmtzcGFjZSh3b3Jrc3BhY2VDb25maWdQYXRoOiBzdHJpbmcsIGZvbGRlcnM6IChzdHJpbmcgfCBVUkkpW10sIG5hbWVzPzogc3RyaW5nW10pOiB2b2lkIHtcblx0XHRjb25zdCB3czogSVN0b3JlZFdvcmtzcGFjZSA9IHtcblx0XHRcdGZvbGRlcnM6IFtdXG5cdFx0fTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZm9sZGVycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZiA9IGZvbGRlcnNbaV07XG5cdFx0XHRjb25zdCBzOiBJU3RvcmVkV29ya3NwYWNlRm9sZGVyID0gZiBpbnN0YW5jZW9mIFVSSSA/IHsgdXJpOiBmLnRvU3RyaW5nKCkgfSA6IHsgcGF0aDogZiB9O1xuXHRcdFx0aWYgKG5hbWVzKSB7XG5cdFx0XHRcdHMubmFtZSA9IG5hbWVzW2ldO1xuXHRcdFx0fVxuXHRcdFx0d3MuZm9sZGVycy5wdXNoKHMpO1xuXHRcdH1cblxuXHRcdGZzLndyaXRlRmlsZVN5bmMod29ya3NwYWNlQ29uZmlnUGF0aCwgSlNPTi5zdHJpbmdpZnkod3MpKTtcblx0fVxuXG5cdGxldCB0ZXN0RGlyOiBzdHJpbmc7XG5cdGxldCB1bnRpdGxlZFdvcmtzcGFjZXNIb21lUGF0aDogc3RyaW5nO1xuXHRsZXQgZW52aXJvbm1lbnRNYWluU2VydmljZTogRW52aXJvbm1lbnRNYWluU2VydmljZTtcblx0bGV0IHNlcnZpY2U6IFdvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2U7XG5cblx0Y29uc3QgY3dkID0gcHJvY2Vzcy5jd2QoKTtcblx0Y29uc3QgdG1wRGlyID0gb3MudG1wZGlyKCk7XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdHRlc3REaXIgPSBnZXRSYW5kb21UZXN0UGF0aCh0bXBEaXIsICd2c2N0ZXN0cycsICd3b3Jrc3BhY2VzbWFuYWdlbWVudG1haW5zZXJ2aWNlJyk7XG5cdFx0dW50aXRsZWRXb3Jrc3BhY2VzSG9tZVBhdGggPSBwYXRoLmpvaW4odGVzdERpciwgJ1dvcmtzcGFjZXMnKTtcblxuXHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UgPSB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgLi4ucHJvZHVjdCB9O1xuXG5cdFx0ZW52aXJvbm1lbnRNYWluU2VydmljZSA9IG5ldyBjbGFzcyBUZXN0RW52aXJvbm1lbnRTZXJ2aWNlIGV4dGVuZHMgRW52aXJvbm1lbnRNYWluU2VydmljZSB7XG5cblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcihwYXJzZUFyZ3MocHJvY2Vzcy5hcmd2LCBPUFRJT05TKSwgcHJvZHVjdFNlcnZpY2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBnZXQgdW50aXRsZWRXb3Jrc3BhY2VzSG9tZSgpOiBVUkkge1xuXHRcdFx0XHRyZXR1cm4gVVJJLmZpbGUodW50aXRsZWRXb3Jrc3BhY2VzSG9tZVBhdGgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBuZXcgRmlsZVNlcnZpY2UobG9nU2VydmljZSk7XG5cdFx0c2VydmljZSA9IG5ldyBXb3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlKGVudmlyb25tZW50TWFpblNlcnZpY2UsIGxvZ1NlcnZpY2UsIG5ldyBVc2VyRGF0YVByb2ZpbGVzTWFpblNlcnZpY2UobmV3IFN0YXRlU2VydmljZShTYXZlU3RyYXRlZ3kuREVMQVlFRCwgZW52aXJvbm1lbnRNYWluU2VydmljZSwgbG9nU2VydmljZSwgZmlsZVNlcnZpY2UpLCBuZXcgVXJpSWRlbnRpdHlTZXJ2aWNlKGZpbGVTZXJ2aWNlKSwgZW52aXJvbm1lbnRNYWluU2VydmljZSwgZmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlKSwgbmV3IFRlc3RCYWNrdXBNYWluU2VydmljZSgpLCBuZXcgVGVzdERpYWxvZ01haW5TZXJ2aWNlKCkpO1xuXG5cdFx0cmV0dXJuIGZzLnByb21pc2VzLm1rZGlyKHVudGl0bGVkV29ya3NwYWNlc0hvbWVQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXG5cdFx0cmV0dXJuIHBmcy5Qcm9taXNlcy5ybSh0ZXN0RGlyKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gYXNzZXJ0UGF0aEVxdWFscyhwYXRoSW5Xb3Jrc3BhY2VGaWxlOiBzdHJpbmcsIHBhdGhPbkRpc2s6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdHBhdGhJbldvcmtzcGFjZUZpbGUgPSBub3JtYWxpemVEcml2ZUxldHRlcihwYXRoSW5Xb3Jrc3BhY2VGaWxlKTtcblx0XHRcdHBhdGhPbkRpc2sgPSBub3JtYWxpemVEcml2ZUxldHRlcihwYXRoT25EaXNrKTtcblx0XHRcdGlmICghaXNVTkMocGF0aE9uRGlzaykpIHtcblx0XHRcdFx0cGF0aE9uRGlzayA9IHRvU2xhc2hlcyhwYXRoT25EaXNrKTsgLy8gd29ya3NwYWNlIGZpbGUgaXMgdXNpbmcgc2xhc2hlcyBmb3IgYWxsIHBhdGhzIGV4Y2VwdCB3aGVyZSBtYW5kYXRvcnlcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aEluV29ya3NwYWNlRmlsZSwgcGF0aE9uRGlzayk7XG5cdH1cblxuXHRmdW5jdGlvbiBhc3NlcnRFcXVhbFVSSSh1MTogVVJJLCB1MjogVVJJKTogdm9pZCB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHUxLnRvU3RyaW5nKCksIHUyLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0dGVzdCgnY3JlYXRlV29ya3NwYWNlIChmb2xkZXJzKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBhd2FpdCBjcmVhdGVVbnRpdGxlZFdvcmtzcGFjZShbY3dkLCB0bXBEaXJdKTtcblx0XHRhc3NlcnQub2sod29ya3NwYWNlKTtcblx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyh3b3Jrc3BhY2UuY29uZmlnUGF0aC5mc1BhdGgpKTtcblx0XHRhc3NlcnQub2soc2VydmljZS5pc1VudGl0bGVkV29ya3NwYWNlKHdvcmtzcGFjZSkpO1xuXG5cdFx0Y29uc3Qgd3MgPSAoSlNPTi5wYXJzZShmcy5yZWFkRmlsZVN5bmMod29ya3NwYWNlLmNvbmZpZ1BhdGguZnNQYXRoKS50b1N0cmluZygpKSBhcyBJU3RvcmVkV29ya3NwYWNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MuZm9sZGVycy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydFBhdGhFcXVhbHMoKDxJUmF3RmlsZVdvcmtzcGFjZUZvbGRlcj53cy5mb2xkZXJzWzBdKS5wYXRoLCBjd2QpO1xuXHRcdGFzc2VydFBhdGhFcXVhbHMoKDxJUmF3RmlsZVdvcmtzcGFjZUZvbGRlcj53cy5mb2xkZXJzWzFdKS5wYXRoLCB0bXBEaXIpO1xuXHRcdGFzc2VydC5vayghKDxJUmF3RmlsZVdvcmtzcGFjZUZvbGRlcj53cy5mb2xkZXJzWzBdKS5uYW1lKTtcblx0XHRhc3NlcnQub2soISg8SVJhd0ZpbGVXb3Jrc3BhY2VGb2xkZXI+d3MuZm9sZGVyc1sxXSkubmFtZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZVdvcmtzcGFjZSAoZm9sZGVycyB3aXRoIG5hbWUpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGF3YWl0IGNyZWF0ZVVudGl0bGVkV29ya3NwYWNlKFtjd2QsIHRtcERpcl0sIFsnY3VycmVudHdvcmtpbmdkaXJlY3RvcnknLCAndGVtcGRpciddKTtcblx0XHRhc3NlcnQub2sod29ya3NwYWNlKTtcblx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyh3b3Jrc3BhY2UuY29uZmlnUGF0aC5mc1BhdGgpKTtcblx0XHRhc3NlcnQub2soc2VydmljZS5pc1VudGl0bGVkV29ya3NwYWNlKHdvcmtzcGFjZSkpO1xuXG5cdFx0Y29uc3Qgd3MgPSAoSlNPTi5wYXJzZShmcy5yZWFkRmlsZVN5bmMod29ya3NwYWNlLmNvbmZpZ1BhdGguZnNQYXRoKS50b1N0cmluZygpKSBhcyBJU3RvcmVkV29ya3NwYWNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MuZm9sZGVycy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydFBhdGhFcXVhbHMoKDxJUmF3RmlsZVdvcmtzcGFjZUZvbGRlcj53cy5mb2xkZXJzWzBdKS5wYXRoLCBjd2QpO1xuXHRcdGFzc2VydFBhdGhFcXVhbHMoKDxJUmF3RmlsZVdvcmtzcGFjZUZvbGRlcj53cy5mb2xkZXJzWzFdKS5wYXRoLCB0bXBEaXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoPElSYXdGaWxlV29ya3NwYWNlRm9sZGVyPndzLmZvbGRlcnNbMF0pLm5hbWUsICdjdXJyZW50d29ya2luZ2RpcmVjdG9yeScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoPElSYXdGaWxlV29ya3NwYWNlRm9sZGVyPndzLmZvbGRlcnNbMV0pLm5hbWUsICd0ZW1wZGlyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZVVudGl0bGVkV29ya3NwYWNlIChmb2xkZXJzIGFzIG90aGVyIHJlc291cmNlIFVSSXMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZvbGRlcjFVUkkgPSBVUkkucGFyc2UoJ215c2NoZW1lOi8vc2VydmVyL3dvcmsvcC9mMScpO1xuXHRcdGNvbnN0IGZvbGRlcjJVUkkgPSBVUkkucGFyc2UoJ215c2NoZW1lOi8vc2VydmVyL3dvcmsvby9mMycpO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gYXdhaXQgc2VydmljZS5jcmVhdGVVbnRpdGxlZFdvcmtzcGFjZShbeyB1cmk6IGZvbGRlcjFVUkkgfSwgeyB1cmk6IGZvbGRlcjJVUkkgfV0sICdzZXJ2ZXInKTtcblx0XHRhc3NlcnQub2sod29ya3NwYWNlKTtcblx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyh3b3Jrc3BhY2UuY29uZmlnUGF0aC5mc1BhdGgpKTtcblx0XHRhc3NlcnQub2soc2VydmljZS5pc1VudGl0bGVkV29ya3NwYWNlKHdvcmtzcGFjZSkpO1xuXG5cdFx0Y29uc3Qgd3MgPSAoSlNPTi5wYXJzZShmcy5yZWFkRmlsZVN5bmMod29ya3NwYWNlLmNvbmZpZ1BhdGguZnNQYXRoKS50b1N0cmluZygpKSBhcyBJU3RvcmVkV29ya3NwYWNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MuZm9sZGVycy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoPElSYXdVcmlXb3Jrc3BhY2VGb2xkZXI+d3MuZm9sZGVyc1swXSkudXJpLCBmb2xkZXIxVVJJLnRvU3RyaW5nKHRydWUpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKDxJUmF3VXJpV29ya3NwYWNlRm9sZGVyPndzLmZvbGRlcnNbMV0pLnVyaSwgZm9sZGVyMlVSSS50b1N0cmluZyh0cnVlKSk7XG5cdFx0YXNzZXJ0Lm9rKCEoPElSYXdGaWxlV29ya3NwYWNlRm9sZGVyPndzLmZvbGRlcnNbMF0pLm5hbWUpO1xuXHRcdGFzc2VydC5vayghKDxJUmF3RmlsZVdvcmtzcGFjZUZvbGRlcj53cy5mb2xkZXJzWzFdKS5uYW1lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MucmVtb3RlQXV0aG9yaXR5LCAnc2VydmVyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVXb3Jrc3BhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gYXdhaXQgY3JlYXRlVW50aXRsZWRXb3Jrc3BhY2UoW2N3ZCwgdG1wRGlyXSk7XG5cdFx0YXNzZXJ0Lm9rKGF3YWl0IHNlcnZpY2UucmVzb2x2ZUxvY2FsV29ya3NwYWNlKHdvcmtzcGFjZS5jb25maWdQYXRoKSk7XG5cblx0XHQvLyBtYWtlIGl0IGEgdmFsaWQgd29ya3NwYWNlIHBhdGhcblx0XHRjb25zdCBuZXdQYXRoID0gcGF0aC5qb2luKHBhdGguZGlybmFtZSh3b3Jrc3BhY2UuY29uZmlnUGF0aC5mc1BhdGgpLCBgd29ya3NwYWNlLiR7V09SS1NQQUNFX0VYVEVOU0lPTn1gKTtcblx0XHRmcy5yZW5hbWVTeW5jKHdvcmtzcGFjZS5jb25maWdQYXRoLmZzUGF0aCwgbmV3UGF0aCk7XG5cdFx0d29ya3NwYWNlLmNvbmZpZ1BhdGggPSBVUkkuZmlsZShuZXdQYXRoKTtcblxuXHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgc2VydmljZS5yZXNvbHZlTG9jYWxXb3Jrc3BhY2Uod29ya3NwYWNlLmNvbmZpZ1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgyLCByZXNvbHZlZCEuZm9sZGVycy5sZW5ndGgpO1xuXHRcdGFzc2VydEVxdWFsVVJJKHJlc29sdmVkIS5jb25maWdQYXRoLCB3b3Jrc3BhY2UuY29uZmlnUGF0aCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc29sdmVkIS5pZCk7XG5cdFx0ZnMud3JpdGVGaWxlU3luYyh3b3Jrc3BhY2UuY29uZmlnUGF0aC5mc1BhdGgsIEpTT04uc3RyaW5naWZ5KHsgc29tZXRoaW5nOiAnc29tZXRoaW5nJyB9KSk7IC8vIGludmFsaWQgd29ya3NwYWNlXG5cblx0XHRjb25zdCByZXNvbHZlZEludmFsaWQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmVMb2NhbFdvcmtzcGFjZSh3b3Jrc3BhY2UuY29uZmlnUGF0aCk7XG5cdFx0YXNzZXJ0Lm9rKCFyZXNvbHZlZEludmFsaWQpO1xuXG5cdFx0ZnMud3JpdGVGaWxlU3luYyh3b3Jrc3BhY2UuY29uZmlnUGF0aC5mc1BhdGgsIEpTT04uc3RyaW5naWZ5KHsgdHJhbnNpZW50OiB0cnVlLCBmb2xkZXJzOiBbXSB9KSk7IC8vIHRyYW5zaWVudCB3b3Jrc2FwY2Vcblx0XHRjb25zdCByZXNvbHZlZFRyYW5zaWVudCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUxvY2FsV29ya3NwYWNlKHdvcmtzcGFjZS5jb25maWdQYXRoKTtcblx0XHRhc3NlcnQub2socmVzb2x2ZWRUcmFuc2llbnQ/LnRyYW5zaWVudCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVXb3Jrc3BhY2UgKHN1cHBvcnQgcmVsYXRpdmUgcGF0aHMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGF3YWl0IGNyZWF0ZVVudGl0bGVkV29ya3NwYWNlKFtjd2QsIHRtcERpcl0pO1xuXHRcdGZzLndyaXRlRmlsZVN5bmMod29ya3NwYWNlLmNvbmZpZ1BhdGguZnNQYXRoLCBKU09OLnN0cmluZ2lmeSh7IGZvbGRlcnM6IFt7IHBhdGg6ICcuL3RpY2luby1wbGF5Z3JvdW5kL2xpYicgfV0gfSkpO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmVMb2NhbFdvcmtzcGFjZSh3b3Jrc3BhY2UuY29uZmlnUGF0aCk7XG5cdFx0YXNzZXJ0RXF1YWxVUkkocmVzb2x2ZWQhLmZvbGRlcnNbMF0udXJpLCBVUkkuZmlsZShwYXRoLmpvaW4ocGF0aC5kaXJuYW1lKHdvcmtzcGFjZS5jb25maWdQYXRoLmZzUGF0aCksICd0aWNpbm8tcGxheWdyb3VuZCcsICdsaWInKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlV29ya3NwYWNlIChzdXBwb3J0IHJlbGF0aXZlIHBhdGhzICMyKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBhd2FpdCBjcmVhdGVVbnRpdGxlZFdvcmtzcGFjZShbY3dkLCB0bXBEaXJdKTtcblx0XHRmcy53cml0ZUZpbGVTeW5jKHdvcmtzcGFjZS5jb25maWdQYXRoLmZzUGF0aCwgSlNPTi5zdHJpbmdpZnkoeyBmb2xkZXJzOiBbeyBwYXRoOiAnLi90aWNpbm8tcGxheWdyb3VuZC9saWIvLi4vb3RoZXInIH1dIH0pKTtcblxuXHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgc2VydmljZS5yZXNvbHZlTG9jYWxXb3Jrc3BhY2Uod29ya3NwYWNlLmNvbmZpZ1BhdGgpO1xuXHRcdGFzc2VydEVxdWFsVVJJKHJlc29sdmVkIS5mb2xkZXJzWzBdLnVyaSwgVVJJLmZpbGUocGF0aC5qb2luKHBhdGguZGlybmFtZSh3b3Jrc3BhY2UuY29uZmlnUGF0aC5mc1BhdGgpLCAndGljaW5vLXBsYXlncm91bmQnLCAnb3RoZXInKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlV29ya3NwYWNlIChzdXBwb3J0IHJlbGF0aXZlIHBhdGhzICMzKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBhd2FpdCBjcmVhdGVVbnRpdGxlZFdvcmtzcGFjZShbY3dkLCB0bXBEaXJdKTtcblx0XHRmcy53cml0ZUZpbGVTeW5jKHdvcmtzcGFjZS5jb25maWdQYXRoLmZzUGF0aCwgSlNPTi5zdHJpbmdpZnkoeyBmb2xkZXJzOiBbeyBwYXRoOiAndGljaW5vLXBsYXlncm91bmQvbGliJyB9XSB9KSk7XG5cblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUxvY2FsV29ya3NwYWNlKHdvcmtzcGFjZS5jb25maWdQYXRoKTtcblx0XHRhc3NlcnRFcXVhbFVSSShyZXNvbHZlZCEuZm9sZGVyc1swXS51cmksIFVSSS5maWxlKHBhdGguam9pbihwYXRoLmRpcm5hbWUod29ya3NwYWNlLmNvbmZpZ1BhdGguZnNQYXRoKSwgJ3RpY2luby1wbGF5Z3JvdW5kJywgJ2xpYicpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVXb3Jrc3BhY2UgKHN1cHBvcnQgaW52YWxpZCBKU09OIHZpYSBmYXVsdCB0b2xlcmFudCBwYXJzaW5nKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBhd2FpdCBjcmVhdGVVbnRpdGxlZFdvcmtzcGFjZShbY3dkLCB0bXBEaXJdKTtcblx0XHRmcy53cml0ZUZpbGVTeW5jKHdvcmtzcGFjZS5jb25maWdQYXRoLmZzUGF0aCwgJ3sgXCJmb2xkZXJzXCI6IFsgeyBcInBhdGhcIjogXCIuL3RpY2luby1wbGF5Z3JvdW5kL2xpYlwiIH0gLCBdIH0nKTsgLy8gdHJhaWxpbmcgY29tbWFcblxuXHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgc2VydmljZS5yZXNvbHZlTG9jYWxXb3Jrc3BhY2Uod29ya3NwYWNlLmNvbmZpZ1BhdGgpO1xuXHRcdGFzc2VydEVxdWFsVVJJKHJlc29sdmVkIS5mb2xkZXJzWzBdLnVyaSwgVVJJLmZpbGUocGF0aC5qb2luKHBhdGguZGlybmFtZSh3b3Jrc3BhY2UuY29uZmlnUGF0aC5mc1BhdGgpLCAndGljaW5vLXBsYXlncm91bmQnLCAnbGliJykpKTtcblx0fSk7XG5cblx0dGVzdCgncmV3cml0ZVdvcmtzcGFjZUZpbGVGb3JOZXdMb2NhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmb2xkZXIxID0gY3dkOyAgLy8gYWJzb2x1dGUgcGF0aCBiZWNhdXNlIG91dHNpZGUgb2YgdG1wRGlyXG5cdFx0Y29uc3QgdG1wSW5zaWRlRGlyID0gcGF0aC5qb2luKHRtcERpciwgJ2luc2lkZScpO1xuXG5cdFx0Y29uc3QgZmlyc3RDb25maWdQYXRoID0gcGF0aC5qb2luKHRtcERpciwgJ215d29ya3NwYWNlMC5jb2RlLXdvcmtzcGFjZScpO1xuXHRcdGNyZWF0ZVdvcmtzcGFjZShmaXJzdENvbmZpZ1BhdGgsIFtmb2xkZXIxLCAnaW5zaWRlJywgcGF0aC5qb2luKCdpbnNpZGUnLCAnc29tZWZvbGRlcicpXSk7XG5cdFx0Y29uc3Qgb3JpZ0NvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMoZmlyc3RDb25maWdQYXRoKS50b1N0cmluZygpO1xuXG5cdFx0bGV0IG9yaWdDb25maWdQYXRoID0gVVJJLmZpbGUoZmlyc3RDb25maWdQYXRoKTtcblx0XHRsZXQgd29ya3NwYWNlQ29uZmlnUGF0aCA9IFVSSS5maWxlKHBhdGguam9pbih0bXBEaXIsICdpbnNpZGUnLCAnbXl3b3Jrc3BhY2UxLmNvZGUtd29ya3NwYWNlJykpO1xuXHRcdGxldCBuZXdDb250ZW50ID0gcmV3cml0ZVdvcmtzcGFjZUZpbGVGb3JOZXdMb2NhdGlvbihvcmlnQ29udGVudCwgb3JpZ0NvbmZpZ1BhdGgsIGZhbHNlLCB3b3Jrc3BhY2VDb25maWdQYXRoLCBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSk7XG5cdFx0bGV0IHdzID0gKEpTT04ucGFyc2UobmV3Q29udGVudCkgYXMgSVN0b3JlZFdvcmtzcGFjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLmZvbGRlcnMubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnRQYXRoRXF1YWxzKCg8SVJhd0ZpbGVXb3Jrc3BhY2VGb2xkZXI+d3MuZm9sZGVyc1swXSkucGF0aCwgZm9sZGVyMSk7IC8vIGFic29sdXRlIHBhdGggYmVjYXVzZSBvdXRzaWRlIG9mIHRtcGRpclxuXHRcdGFzc2VydFBhdGhFcXVhbHMoKDxJUmF3RmlsZVdvcmtzcGFjZUZvbGRlcj53cy5mb2xkZXJzWzFdKS5wYXRoLCAnLicpO1xuXHRcdGFzc2VydFBhdGhFcXVhbHMoKDxJUmF3RmlsZVdvcmtzcGFjZUZvbGRlcj53cy5mb2xkZXJzWzJdKS5wYXRoLCAnc29tZWZvbGRlcicpO1xuXG5cdFx0b3JpZ0NvbmZpZ1BhdGggPSB3b3Jrc3BhY2VDb25maWdQYXRoO1xuXHRcdHdvcmtzcGFjZUNvbmZpZ1BhdGggPSBVUkkuZmlsZShwYXRoLmpvaW4odG1wRGlyLCAnbXl3b3Jrc3BhY2UyLmNvZGUtd29ya3NwYWNlJykpO1xuXHRcdG5ld0NvbnRlbnQgPSByZXdyaXRlV29ya3NwYWNlRmlsZUZvck5ld0xvY2F0aW9uKG5ld0NvbnRlbnQsIG9yaWdDb25maWdQYXRoLCBmYWxzZSwgd29ya3NwYWNlQ29uZmlnUGF0aCwgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UpO1xuXHRcdHdzID0gKEpTT04ucGFyc2UobmV3Q29udGVudCkgYXMgSVN0b3JlZFdvcmtzcGFjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLmZvbGRlcnMubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnRQYXRoRXF1YWxzKCg8SVJhd0ZpbGVXb3Jrc3BhY2VGb2xkZXI+d3MuZm9sZGVyc1swXSkucGF0aCwgZm9sZGVyMSk7XG5cdFx0YXNzZXJ0UGF0aEVxdWFscygoPElSYXdGaWxlV29ya3NwYWNlRm9sZGVyPndzLmZvbGRlcnNbMV0pLnBhdGgsICdpbnNpZGUnKTtcblx0XHRhc3NlcnRQYXRoRXF1YWxzKCg8SVJhd0ZpbGVXb3Jrc3BhY2VGb2xkZXI+d3MuZm9sZGVyc1syXSkucGF0aCwgJ2luc2lkZS9zb21lZm9sZGVyJyk7XG5cblx0XHRvcmlnQ29uZmlnUGF0aCA9IHdvcmtzcGFjZUNvbmZpZ1BhdGg7XG5cdFx0d29ya3NwYWNlQ29uZmlnUGF0aCA9IFVSSS5maWxlKHBhdGguam9pbih0bXBEaXIsICdvdGhlcicsICdteXdvcmtzcGFjZTIuY29kZS13b3Jrc3BhY2UnKSk7XG5cdFx0bmV3Q29udGVudCA9IHJld3JpdGVXb3Jrc3BhY2VGaWxlRm9yTmV3TG9jYXRpb24obmV3Q29udGVudCwgb3JpZ0NvbmZpZ1BhdGgsIGZhbHNlLCB3b3Jrc3BhY2VDb25maWdQYXRoLCBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSk7XG5cdFx0d3MgPSAoSlNPTi5wYXJzZShuZXdDb250ZW50KSBhcyBJU3RvcmVkV29ya3NwYWNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MuZm9sZGVycy5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydFBhdGhFcXVhbHMoKDxJUmF3RmlsZVdvcmtzcGFjZUZvbGRlcj53cy5mb2xkZXJzWzBdKS5wYXRoLCBmb2xkZXIxKTtcblx0XHRhc3NlcnRQYXRoRXF1YWxzKCg8SVJhd0ZpbGVXb3Jrc3BhY2VGb2xkZXI+d3MuZm9sZGVyc1sxXSkucGF0aCwgJy4uL2luc2lkZScpO1xuXHRcdGFzc2VydFBhdGhFcXVhbHMoKDxJUmF3RmlsZVdvcmtzcGFjZUZvbGRlcj53cy5mb2xkZXJzWzJdKS5wYXRoLCAnLi4vaW5zaWRlL3NvbWVmb2xkZXInKTtcblxuXHRcdG9yaWdDb25maWdQYXRoID0gd29ya3NwYWNlQ29uZmlnUGF0aDtcblx0XHR3b3Jrc3BhY2VDb25maWdQYXRoID0gVVJJLnBhcnNlKCdmb286Ly9mb28vYmFyL215d29ya3NwYWNlMi5jb2RlLXdvcmtzcGFjZScpO1xuXHRcdG5ld0NvbnRlbnQgPSByZXdyaXRlV29ya3NwYWNlRmlsZUZvck5ld0xvY2F0aW9uKG5ld0NvbnRlbnQsIG9yaWdDb25maWdQYXRoLCBmYWxzZSwgd29ya3NwYWNlQ29uZmlnUGF0aCwgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UpO1xuXHRcdHdzID0gKEpTT04ucGFyc2UobmV3Q29udGVudCkgYXMgSVN0b3JlZFdvcmtzcGFjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLmZvbGRlcnMubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKDxJUmF3VXJpV29ya3NwYWNlRm9sZGVyPndzLmZvbGRlcnNbMF0pLnVyaSwgVVJJLmZpbGUoZm9sZGVyMSkudG9TdHJpbmcodHJ1ZSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoPElSYXdVcmlXb3Jrc3BhY2VGb2xkZXI+d3MuZm9sZGVyc1sxXSkudXJpLCBVUkkuZmlsZSh0bXBJbnNpZGVEaXIpLnRvU3RyaW5nKHRydWUpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKDxJUmF3VXJpV29ya3NwYWNlRm9sZGVyPndzLmZvbGRlcnNbMl0pLnVyaSwgVVJJLmZpbGUocGF0aC5qb2luKHRtcEluc2lkZURpciwgJ3NvbWVmb2xkZXInKSkudG9TdHJpbmcodHJ1ZSkpO1xuXG5cdFx0ZnMudW5saW5rU3luYyhmaXJzdENvbmZpZ1BhdGgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXdyaXRlV29ya3NwYWNlRmlsZUZvck5ld0xvY2F0aW9uIChwcmVzZXJ2ZXMgY29tbWVudHMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGF3YWl0IGNyZWF0ZVVudGl0bGVkV29ya3NwYWNlKFtjd2QsIHRtcERpciwgcGF0aC5qb2luKHRtcERpciwgJ3NvbWVmb2xkZXInKV0pO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUNvbmZpZ1BhdGggPSBVUkkuZmlsZShwYXRoLmpvaW4odG1wRGlyLCBgbXl3b3Jrc3BhY2UuJHtEYXRlLm5vdygpfS4ke1dPUktTUEFDRV9FWFRFTlNJT059YCkpO1xuXG5cdFx0bGV0IG9yaWdDb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKHdvcmtzcGFjZS5jb25maWdQYXRoLmZzUGF0aCkudG9TdHJpbmcoKTtcblx0XHRvcmlnQ29udGVudCA9IGAvLyB0aGlzIGlzIGEgY29tbWVudFxcbiR7b3JpZ0NvbnRlbnR9YDtcblxuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSByZXdyaXRlV29ya3NwYWNlRmlsZUZvck5ld0xvY2F0aW9uKG9yaWdDb250ZW50LCB3b3Jrc3BhY2UuY29uZmlnUGF0aCwgZmFsc2UsIHdvcmtzcGFjZUNvbmZpZ1BhdGgsIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoMCwgbmV3Q29udGVudC5pbmRleE9mKCcvLyB0aGlzIGlzIGEgY29tbWVudCcpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmRlbGV0ZVVudGl0bGVkV29ya3NwYWNlKHdvcmtzcGFjZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jld3JpdGVXb3Jrc3BhY2VGaWxlRm9yTmV3TG9jYXRpb24gKHByZXNlcnZlcyBmb3J3YXJkIHNsYXNoZXMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGF3YWl0IGNyZWF0ZVVudGl0bGVkV29ya3NwYWNlKFtjd2QsIHRtcERpciwgcGF0aC5qb2luKHRtcERpciwgJ3NvbWVmb2xkZXInKV0pO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUNvbmZpZ1BhdGggPSBVUkkuZmlsZShwYXRoLmpvaW4odG1wRGlyLCBgbXl3b3Jrc3BhY2UuJHtEYXRlLm5vdygpfS4ke1dPUktTUEFDRV9FWFRFTlNJT059YCkpO1xuXG5cdFx0bGV0IG9yaWdDb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKHdvcmtzcGFjZS5jb25maWdQYXRoLmZzUGF0aCkudG9TdHJpbmcoKTtcblx0XHRvcmlnQ29udGVudCA9IG9yaWdDb250ZW50LnJlcGxhY2UoL1tcXFxcXS9nLCAnLycpOyAvLyBjb252ZXJ0IGJhY2tzbGFzaCB0byBzbGFzaFxuXG5cdFx0Y29uc3QgbmV3Q29udGVudCA9IHJld3JpdGVXb3Jrc3BhY2VGaWxlRm9yTmV3TG9jYXRpb24ob3JpZ0NvbnRlbnQsIHdvcmtzcGFjZS5jb25maWdQYXRoLCBmYWxzZSwgd29ya3NwYWNlQ29uZmlnUGF0aCwgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UpO1xuXHRcdGNvbnN0IHdzID0gKEpTT04ucGFyc2UobmV3Q29udGVudCkgYXMgSVN0b3JlZFdvcmtzcGFjZSk7XG5cdFx0YXNzZXJ0Lm9rKHdzLmZvbGRlcnMuZXZlcnkoZiA9PiAoPElSYXdGaWxlV29ya3NwYWNlRm9sZGVyPmYpLnBhdGguaW5kZXhPZignXFxcXCcpIDwgMCkpO1xuXHRcdGF3YWl0IHNlcnZpY2UuZGVsZXRlVW50aXRsZWRXb3Jrc3BhY2Uod29ya3NwYWNlKTtcblx0fSk7XG5cblx0KCFpc1dpbmRvd3MgPyB0ZXN0LnNraXAgOiB0ZXN0KSgncmV3cml0ZVdvcmtzcGFjZUZpbGVGb3JOZXdMb2NhdGlvbiAodW5jIHBhdGhzKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VMb2NhdGlvbiA9IHBhdGguam9pbih0bXBEaXIsICd3c2xvYycpO1xuXHRcdGNvbnN0IGZvbGRlcjFMb2NhdGlvbiA9ICd4OlxcXFxmb28nO1xuXHRcdGNvbnN0IGZvbGRlcjJMb2NhdGlvbiA9ICdcXFxcXFxcXHNlcnZlclxcXFxzaGFyZTJcXFxcc29tZVxcXFxwYXRoJztcblx0XHRjb25zdCBmb2xkZXIzTG9jYXRpb24gPSBwYXRoLmpvaW4od29ya3NwYWNlTG9jYXRpb24sICdpbm5lcicsICdtb3JlJyk7XG5cblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBhd2FpdCBjcmVhdGVVbnRpdGxlZFdvcmtzcGFjZShbZm9sZGVyMUxvY2F0aW9uLCBmb2xkZXIyTG9jYXRpb24sIGZvbGRlcjNMb2NhdGlvbl0pO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUNvbmZpZ1BhdGggPSBVUkkuZmlsZShwYXRoLmpvaW4od29ya3NwYWNlTG9jYXRpb24sIGBteXdvcmtzcGFjZS4ke0RhdGUubm93KCl9LiR7V09SS1NQQUNFX0VYVEVOU0lPTn1gKSk7XG5cdFx0Y29uc3Qgb3JpZ0NvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMod29ya3NwYWNlLmNvbmZpZ1BhdGguZnNQYXRoKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSByZXdyaXRlV29ya3NwYWNlRmlsZUZvck5ld0xvY2F0aW9uKG9yaWdDb250ZW50LCB3b3Jrc3BhY2UuY29uZmlnUGF0aCwgdHJ1ZSwgd29ya3NwYWNlQ29uZmlnUGF0aCwgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UpO1xuXHRcdGNvbnN0IHdzID0gKEpTT04ucGFyc2UobmV3Q29udGVudCkgYXMgSVN0b3JlZFdvcmtzcGFjZSk7XG5cdFx0YXNzZXJ0UGF0aEVxdWFscygoPElSYXdGaWxlV29ya3NwYWNlRm9sZGVyPndzLmZvbGRlcnNbMF0pLnBhdGgsIGZvbGRlcjFMb2NhdGlvbik7XG5cdFx0YXNzZXJ0UGF0aEVxdWFscygoPElSYXdGaWxlV29ya3NwYWNlRm9sZGVyPndzLmZvbGRlcnNbMV0pLnBhdGgsIGZvbGRlcjJMb2NhdGlvbik7XG5cdFx0YXNzZXJ0UGF0aEVxdWFscygoPElSYXdGaWxlV29ya3NwYWNlRm9sZGVyPndzLmZvbGRlcnNbMl0pLnBhdGgsICdpbm5lci9tb3JlJyk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmRlbGV0ZVVudGl0bGVkV29ya3NwYWNlKHdvcmtzcGFjZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZVVudGl0bGVkV29ya3NwYWNlICh1bnRpdGxlZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gYXdhaXQgY3JlYXRlVW50aXRsZWRXb3Jrc3BhY2UoW2N3ZCwgdG1wRGlyXSk7XG5cdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmMod29ya3NwYWNlLmNvbmZpZ1BhdGguZnNQYXRoKSk7XG5cdFx0YXdhaXQgc2VydmljZS5kZWxldGVVbnRpdGxlZFdvcmtzcGFjZSh3b3Jrc3BhY2UpO1xuXHRcdGFzc2VydC5vayghZnMuZXhpc3RzU3luYyh3b3Jrc3BhY2UuY29uZmlnUGF0aC5mc1BhdGgpKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlVW50aXRsZWRXb3Jrc3BhY2UgKHNhdmVkKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBhd2FpdCBjcmVhdGVVbnRpdGxlZFdvcmtzcGFjZShbY3dkLCB0bXBEaXJdKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmRlbGV0ZVVudGl0bGVkV29ya3NwYWNlKHdvcmtzcGFjZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFVudGl0bGVkV29ya3NwYWNlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdGxldCB1bnRpdGxlZCA9IHNlcnZpY2UuZ2V0VW50aXRsZWRXb3Jrc3BhY2VzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVudGl0bGVkLmxlbmd0aCwgMCk7XG5cblx0XHRjb25zdCB1bnRpdGxlZE9uZSA9IGF3YWl0IGNyZWF0ZVVudGl0bGVkV29ya3NwYWNlKFtjd2QsIHRtcERpcl0pO1xuXHRcdGFzc2VydC5vayhmcy5leGlzdHNTeW5jKHVudGl0bGVkT25lLmNvbmZpZ1BhdGguZnNQYXRoKSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHR1bnRpdGxlZCA9IHNlcnZpY2UuZ2V0VW50aXRsZWRXb3Jrc3BhY2VzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDEsIHVudGl0bGVkLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVudGl0bGVkT25lLmlkLCB1bnRpdGxlZFswXS53b3Jrc3BhY2UuaWQpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5kZWxldGVVbnRpdGxlZFdvcmtzcGFjZSh1bnRpdGxlZE9uZSk7XG5cdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0dW50aXRsZWQgPSBzZXJ2aWNlLmdldFVudGl0bGVkV29ya3NwYWNlcygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgwLCB1bnRpdGxlZC5sZW5ndGgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFlBQVksUUFBUTtBQUNwQixZQUFZLFFBQVE7QUFDcEIsU0FBUyxPQUFPLGlCQUFpQjtBQUNqQyxTQUFTLDRCQUE0QjtBQUNyQyxZQUFZLFVBQVU7QUFDdEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxXQUFXO0FBQ3BCLFlBQVksU0FBUztBQUNyQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLFlBQVkseUJBQXlCO0FBTTlDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsU0FBUyxpQkFBaUI7QUFDbkMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxzQkFBc0I7QUFDL0IsT0FBTyxhQUFhO0FBRXBCLFNBQVMsY0FBYyxvQkFBb0I7QUFDM0MsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBMEQsMkJBQTJCO0FBQ3JGLFNBQWlGLDBDQUEwQztBQUMzSCxTQUFTLHVDQUF1QztBQUVoRCxXQUFXLG1DQUFtQyxNQUFNO0FBQUEsRUFFbkQsTUFBTSxzQkFBb0Q7QUFBQSxJQUl6RCxlQUFlLFNBQW1DLFFBQTRFO0FBQUUsWUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsSUFBRztBQUFBLElBQzVLLFdBQVcsU0FBbUMsUUFBNEU7QUFBRSxZQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxJ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
