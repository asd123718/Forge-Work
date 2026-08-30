import assert from "assert";
import { IndexedDB } from "../../../../base/browser/indexedDB.js";
import { bufferToReadable, bufferToStream, VSBuffer } from "../../../../base/common/buffer.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { basename, joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { flakySuite } from "../../../../base/test/common/testUtils.js";
import { IndexedDBFileSystemProvider } from "../../browser/indexedDBFileSystemProvider.js";
import { FileOperation, FileOperationResult, FileSystemProviderErrorCode, FileType } from "../../common/files.js";
import { FileService } from "../../common/fileService.js";
import { NullLogService } from "../../../log/common/log.js";
flakySuite("IndexedDBFileSystemProvider", function() {
  let service;
  let userdataFileProvider;
  const testDir = "/";
  const userdataURIFromPaths = (paths) => joinPath(URI.from({ scheme: Schemas.vscodeUserData, path: testDir }), ...paths);
  const disposables = new DisposableStore();
  const initFixtures = async () => {
    await Promise.all(
      [
        ["fixtures", "resolver", "examples"],
        ["fixtures", "resolver", "other", "deep"],
        ["fixtures", "service", "deep"],
        ["batched"]
      ].map((path) => userdataURIFromPaths(path)).map((uri) => service.createFolder(uri))
    );
    await Promise.all(
      [
        [["fixtures", "resolver", "examples", "company.js"], "class company {}"],
        [["fixtures", "resolver", "examples", "conway.js"], "export function conway() {}"],
        [["fixtures", "resolver", "examples", "employee.js"], 'export const employee = "jax"'],
        [["fixtures", "resolver", "examples", "small.js"], ""],
        [["fixtures", "resolver", "other", "deep", "company.js"], "class company {}"],
        [["fixtures", "resolver", "other", "deep", "conway.js"], "export function conway() {}"],
        [["fixtures", "resolver", "other", "deep", "employee.js"], 'export const employee = "jax"'],
        [["fixtures", "resolver", "other", "deep", "small.js"], ""],
        [["fixtures", "resolver", "index.html"], "<p>p</p>"],
        [["fixtures", "resolver", "site.css"], ".p {color: red;}"],
        [["fixtures", "service", "deep", "company.js"], "class company {}"],
        [["fixtures", "service", "deep", "conway.js"], "export function conway() {}"],
        [["fixtures", "service", "deep", "employee.js"], 'export const employee = "jax"'],
        [["fixtures", "service", "deep", "small.js"], ""],
        [["fixtures", "service", "binary.txt"], "<p>p</p>"]
      ].map(([path, contents]) => [userdataURIFromPaths(path), contents]).map(([uri, contents]) => service.createFile(uri, VSBuffer.fromString(contents)))
    );
  };
  const reload = async () => {
    const logService = new NullLogService();
    service = new FileService(logService);
    disposables.add(service);
    const indexedDB = await IndexedDB.create("vscode-web-db-test", 1, ["vscode-userdata-store", "vscode-logs-store"]);
    userdataFileProvider = new IndexedDBFileSystemProvider(Schemas.vscodeUserData, indexedDB, "vscode-userdata-store", true);
    disposables.add(service.registerProvider(Schemas.vscodeUserData, userdataFileProvider));
    disposables.add(userdataFileProvider);
  };
  setup(async function() {
    this.timeout(15e3);
    await reload();
  });
  teardown(async () => {
    await userdataFileProvider.reset();
    disposables.clear();
  });
  test("root is always present", async () => {
    assert.strictEqual((await userdataFileProvider.stat(userdataURIFromPaths([]))).type, FileType.Directory);
    await userdataFileProvider.delete(userdataURIFromPaths([]), { recursive: true, useTrash: false, atomic: false });
    assert.strictEqual((await userdataFileProvider.stat(userdataURIFromPaths([]))).type, FileType.Directory);
  });
  test("createFolder", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const parent = await service.resolve(userdataURIFromPaths([]));
    const newFolderResource = joinPath(parent.resource, "newFolder");
    assert.strictEqual((await userdataFileProvider.readdir(parent.resource)).length, 0);
    const newFolder = await service.createFolder(newFolderResource);
    assert.strictEqual(newFolder.name, "newFolder");
    assert.strictEqual((await userdataFileProvider.readdir(parent.resource)).length, 1);
    assert.strictEqual((await userdataFileProvider.stat(newFolderResource)).type, FileType.Directory);
    assert.ok(event);
    assert.strictEqual(event.resource.path, newFolderResource.path);
    assert.strictEqual(event.operation, FileOperation.CREATE);
    assert.strictEqual(event.target.resource.path, newFolderResource.path);
    assert.strictEqual(event.target.isDirectory, true);
  });
  test("createFolder: creating multiple folders at once", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const multiFolderPaths = ["a", "couple", "of", "folders"];
    const parent = await service.resolve(userdataURIFromPaths([]));
    const newFolderResource = joinPath(parent.resource, ...multiFolderPaths);
    const newFolder = await service.createFolder(newFolderResource);
    const lastFolderName = multiFolderPaths[multiFolderPaths.length - 1];
    assert.strictEqual(newFolder.name, lastFolderName);
    assert.strictEqual((await userdataFileProvider.stat(newFolderResource)).type, FileType.Directory);
    assert.ok(event);
    assert.strictEqual(event.resource.path, newFolderResource.path);
    assert.strictEqual(event.operation, FileOperation.CREATE);
    assert.strictEqual(event.target.resource.path, newFolderResource.path);
    assert.strictEqual(event.target.isDirectory, true);
  });
  test("exists", async () => {
    let exists = await service.exists(userdataURIFromPaths([]));
    assert.strictEqual(exists, true);
    exists = await service.exists(userdataURIFromPaths(["hello"]));
    assert.strictEqual(exists, false);
  });
  test("resolve - file", async () => {
    await initFixtures();
    const resource = userdataURIFromPaths(["fixtures", "resolver", "index.html"]);
    const resolved = await service.resolve(resource);
    assert.strictEqual(resolved.name, "index.html");
    assert.strictEqual(resolved.isFile, true);
    assert.strictEqual(resolved.isDirectory, false);
    assert.strictEqual(resolved.isSymbolicLink, false);
    assert.strictEqual(resolved.resource.toString(), resource.toString());
    assert.strictEqual(resolved.children, void 0);
    assert.ok(resolved.size > 0);
  });
  test("resolve - directory", async () => {
    await initFixtures();
    const testsElements = ["examples", "other", "index.html", "site.css"];
    const resource = userdataURIFromPaths(["fixtures", "resolver"]);
    const result = await service.resolve(resource);
    assert.ok(result);
    assert.strictEqual(result.resource.toString(), resource.toString());
    assert.strictEqual(result.name, "resolver");
    assert.ok(result.children);
    assert.ok(result.children.length > 0);
    assert.ok(result.isDirectory);
    assert.strictEqual(result.children.length, testsElements.length);
    assert.ok(result.children.every((entry) => {
      return testsElements.some((name) => {
        return basename(entry.resource) === name;
      });
    }));
    result.children.forEach((value) => {
      assert.ok(basename(value.resource));
      if (["examples", "other"].indexOf(basename(value.resource)) >= 0) {
        assert.ok(value.isDirectory);
        assert.strictEqual(value.mtime, void 0);
        assert.strictEqual(value.ctime, void 0);
      } else if (basename(value.resource) === "index.html") {
        assert.ok(!value.isDirectory);
        assert.ok(!value.children);
        assert.strictEqual(value.mtime, void 0);
        assert.strictEqual(value.ctime, void 0);
      } else if (basename(value.resource) === "site.css") {
        assert.ok(!value.isDirectory);
        assert.ok(!value.children);
        assert.strictEqual(value.mtime, void 0);
        assert.strictEqual(value.ctime, void 0);
      } else {
        assert.fail("Unexpected value " + basename(value.resource));
      }
    });
  });
  test("createFile", async () => {
    return assertCreateFile((contents) => VSBuffer.fromString(contents));
  });
  test("createFile (readable)", async () => {
    return assertCreateFile((contents) => bufferToReadable(VSBuffer.fromString(contents)));
  });
  test("createFile (stream)", async () => {
    return assertCreateFile((contents) => bufferToStream(VSBuffer.fromString(contents)));
  });
  async function assertCreateFile(converter) {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const contents = "Hello World";
    const resource = userdataURIFromPaths(["test.txt"]);
    assert.strictEqual(await service.canCreateFile(resource), true);
    const fileStat = await service.createFile(resource, converter(contents));
    assert.strictEqual(fileStat.name, "test.txt");
    assert.strictEqual((await userdataFileProvider.stat(fileStat.resource)).type, FileType.File);
    assert.strictEqual(new TextDecoder().decode(await userdataFileProvider.readFile(fileStat.resource)), contents);
    assert.ok(event);
    assert.strictEqual(event.resource.path, resource.path);
    assert.strictEqual(event.operation, FileOperation.CREATE);
    assert.strictEqual(event.target.resource.path, resource.path);
  }
  const fileCreateBatchTester = (size, name) => {
    const batch = Array.from({ length: size }).map((_, i) => ({ contents: `Hello${i}`, resource: userdataURIFromPaths(["batched", name, `Hello${i}.txt`]) }));
    let creationPromises = void 0;
    return {
      async create() {
        return creationPromises = Promise.all(batch.map((entry) => userdataFileProvider.writeFile(entry.resource, VSBuffer.fromString(entry.contents).buffer, { create: true, overwrite: true, unlock: false, atomic: false })));
      },
      async assertContentsCorrect() {
        if (!creationPromises) {
          throw Error("read called before create");
        }
        await creationPromises;
        await Promise.all(batch.map(async (entry, i) => {
          assert.strictEqual((await userdataFileProvider.stat(entry.resource)).type, FileType.File);
          assert.strictEqual(new TextDecoder().decode(await userdataFileProvider.readFile(entry.resource)), entry.contents);
        }));
      }
    };
  };
  test("createFile - batch", async () => {
    const tester = fileCreateBatchTester(20, "batch");
    await tester.create();
    await tester.assertContentsCorrect();
  });
  test("createFile - batch (mixed parallel/sequential)", async () => {
    const batch1 = fileCreateBatchTester(1, "batch1");
    const batch2 = fileCreateBatchTester(20, "batch2");
    const batch3 = fileCreateBatchTester(1, "batch3");
    const batch4 = fileCreateBatchTester(20, "batch4");
    batch1.create();
    batch2.create();
    await Promise.all([batch1.assertContentsCorrect(), batch2.assertContentsCorrect()]);
    batch3.create();
    batch4.create();
    await Promise.all([batch3.assertContentsCorrect(), batch4.assertContentsCorrect()]);
    await Promise.all([batch1.assertContentsCorrect(), batch2.assertContentsCorrect()]);
  });
  test("rename not existing resource", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const sourceFile = joinPath(parent.resource, "sourceFile");
    const targetFile = joinPath(parent.resource, "targetFile");
    try {
      await service.move(sourceFile, targetFile, false);
    } catch (error) {
      assert.deepStrictEqual(error.code, FileSystemProviderErrorCode.FileNotFound);
      return;
    }
    assert.fail("This should fail with error");
  });
  test("rename to an existing file without overwrite", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const sourceFile = joinPath(parent.resource, "sourceFile");
    await service.writeFile(sourceFile, VSBuffer.fromString("This is source file"));
    const targetFile = joinPath(parent.resource, "targetFile");
    await service.writeFile(targetFile, VSBuffer.fromString("This is target file"));
    try {
      await service.move(sourceFile, targetFile, false);
    } catch (error) {
      assert.deepStrictEqual(error.fileOperationResult, FileOperationResult.FILE_MOVE_CONFLICT);
      return;
    }
    assert.fail("This should fail with error");
  });
  test("rename folder to an existing folder without overwrite", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const sourceFolder = joinPath(parent.resource, "sourceFolder");
    await service.createFolder(sourceFolder);
    const targetFolder = joinPath(parent.resource, "targetFolder");
    await service.createFolder(targetFolder);
    try {
      await service.move(sourceFolder, targetFolder, false);
    } catch (error) {
      assert.deepStrictEqual(error.fileOperationResult, FileOperationResult.FILE_MOVE_CONFLICT);
      return;
    }
    assert.fail("This should fail with cannot overwrite error");
  });
  test("rename file to a folder", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const sourceFile = joinPath(parent.resource, "sourceFile");
    await service.writeFile(sourceFile, VSBuffer.fromString("This is source file"));
    const targetFolder = joinPath(parent.resource, "targetFolder");
    await service.createFolder(targetFolder);
    try {
      await service.move(sourceFile, targetFolder, false);
    } catch (error) {
      assert.deepStrictEqual(error.fileOperationResult, FileOperationResult.FILE_MOVE_CONFLICT);
      return;
    }
    assert.fail("This should fail with error");
  });
  test("rename folder to a file", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const sourceFolder = joinPath(parent.resource, "sourceFile");
    await service.createFolder(sourceFolder);
    const targetFile = joinPath(parent.resource, "targetFile");
    await service.writeFile(targetFile, VSBuffer.fromString("This is target file"));
    try {
      await service.move(sourceFolder, targetFile, false);
    } catch (error) {
      assert.deepStrictEqual(error.fileOperationResult, FileOperationResult.FILE_MOVE_CONFLICT);
      return;
    }
    assert.fail("This should fail with error");
  });
  test("rename file", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const sourceFile = joinPath(parent.resource, "sourceFile");
    await service.writeFile(sourceFile, VSBuffer.fromString("This is source file"));
    const targetFile = joinPath(parent.resource, "targetFile");
    await service.move(sourceFile, targetFile, false);
    const content = await service.readFile(targetFile);
    assert.strictEqual(await service.exists(sourceFile), false);
    assert.strictEqual(content.value.toString(), "This is source file");
  });
  test("rename to an existing file with overwrite", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const sourceFile = joinPath(parent.resource, "sourceFile");
    const targetFile = joinPath(parent.resource, "targetFile");
    await Promise.all([
      service.writeFile(sourceFile, VSBuffer.fromString("This is source file")),
      service.writeFile(targetFile, VSBuffer.fromString("This is target file"))
    ]);
    await service.move(sourceFile, targetFile, true);
    const content = await service.readFile(targetFile);
    assert.strictEqual(await service.exists(sourceFile), false);
    assert.strictEqual(content.value.toString(), "This is source file");
  });
  test("rename folder to a new folder", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const sourceFolder = joinPath(parent.resource, "sourceFolder");
    await service.createFolder(sourceFolder);
    const targetFolder = joinPath(parent.resource, "targetFolder");
    await service.move(sourceFolder, targetFolder, false);
    assert.deepStrictEqual(await service.exists(sourceFolder), false);
    assert.deepStrictEqual(await service.exists(targetFolder), true);
  });
  test("rename folder to an existing folder", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const sourceFolder = joinPath(parent.resource, "sourceFolder");
    await service.createFolder(sourceFolder);
    const targetFolder = joinPath(parent.resource, "targetFolder");
    await service.createFolder(targetFolder);
    await service.move(sourceFolder, targetFolder, true);
    assert.deepStrictEqual(await service.exists(sourceFolder), false);
    assert.deepStrictEqual(await service.exists(targetFolder), true);
  });
  test("rename a folder that has multiple files and folders", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const sourceFolder = joinPath(parent.resource, "sourceFolder");
    const sourceFile1 = joinPath(sourceFolder, "folder1", "file1");
    const sourceFile2 = joinPath(sourceFolder, "folder2", "file1");
    const sourceEmptyFolder = joinPath(sourceFolder, "folder3");
    await Promise.all([
      service.writeFile(sourceFile1, VSBuffer.fromString("Source File 1")),
      service.writeFile(sourceFile2, VSBuffer.fromString("Source File 2")),
      service.createFolder(sourceEmptyFolder)
    ]);
    const targetFolder = joinPath(parent.resource, "targetFolder");
    const targetFile1 = joinPath(targetFolder, "folder1", "file1");
    const targetFile2 = joinPath(targetFolder, "folder2", "file1");
    const targetEmptyFolder = joinPath(targetFolder, "folder3");
    await service.move(sourceFolder, targetFolder, false);
    assert.deepStrictEqual(await service.exists(sourceFolder), false);
    assert.deepStrictEqual(await service.exists(targetFolder), true);
    assert.strictEqual((await service.readFile(targetFile1)).value.toString(), "Source File 1");
    assert.strictEqual((await service.readFile(targetFile2)).value.toString(), "Source File 2");
    assert.deepStrictEqual(await service.exists(targetEmptyFolder), true);
  });
  test("rename a folder to another folder that has some files", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const sourceFolder = joinPath(parent.resource, "sourceFolder");
    const sourceFile1 = joinPath(sourceFolder, "folder1", "file1");
    const targetFolder = joinPath(parent.resource, "targetFolder");
    const targetFile1 = joinPath(targetFolder, "folder1", "file1");
    const targetFile2 = joinPath(targetFolder, "folder1", "file2");
    const targetFile3 = joinPath(targetFolder, "folder2", "file1");
    await Promise.all([
      service.writeFile(sourceFile1, VSBuffer.fromString("Source File 1")),
      service.writeFile(targetFile2, VSBuffer.fromString("Target File 2")),
      service.writeFile(targetFile3, VSBuffer.fromString("Target File 3"))
    ]);
    await service.move(sourceFolder, targetFolder, true);
    assert.deepStrictEqual(await service.exists(sourceFolder), false);
    assert.deepStrictEqual(await service.exists(targetFolder), true);
    assert.strictEqual((await service.readFile(targetFile1)).value.toString(), "Source File 1");
    assert.strictEqual(await service.exists(targetFile2), false);
    assert.strictEqual(await service.exists(targetFile3), false);
  });
  test("deleteFile", async () => {
    await initFixtures();
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const anotherResource = userdataURIFromPaths(["fixtures", "service", "deep", "company.js"]);
    const resource = userdataURIFromPaths(["fixtures", "service", "deep", "conway.js"]);
    const source = await service.resolve(resource);
    assert.strictEqual(await service.canDelete(source.resource, { useTrash: false }), true);
    await service.del(source.resource, { useTrash: false });
    assert.strictEqual(await service.exists(source.resource), false);
    assert.strictEqual(await service.exists(anotherResource), true);
    assert.ok(event);
    assert.strictEqual(event.resource.path, resource.path);
    assert.strictEqual(event.operation, FileOperation.DELETE);
    {
      let error = void 0;
      try {
        await service.del(source.resource, { useTrash: false });
      } catch (e) {
        error = e;
      }
      assert.ok(error);
      assert.strictEqual(error.fileOperationResult, FileOperationResult.FILE_NOT_FOUND);
    }
    await reload();
    {
      let error = void 0;
      try {
        await service.del(source.resource, { useTrash: false });
      } catch (e) {
        error = e;
      }
      assert.ok(error);
      assert.strictEqual(error.fileOperationResult, FileOperationResult.FILE_NOT_FOUND);
    }
  });
  test("deleteFolder (recursive)", async () => {
    await initFixtures();
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const resource = userdataURIFromPaths(["fixtures", "service", "deep"]);
    const subResource1 = userdataURIFromPaths(["fixtures", "service", "deep", "company.js"]);
    const subResource2 = userdataURIFromPaths(["fixtures", "service", "deep", "conway.js"]);
    assert.strictEqual(await service.exists(subResource1), true);
    assert.strictEqual(await service.exists(subResource2), true);
    const source = await service.resolve(resource);
    assert.strictEqual(await service.canDelete(source.resource, { recursive: true, useTrash: false }), true);
    await service.del(source.resource, { recursive: true, useTrash: false });
    assert.strictEqual(await service.exists(source.resource), false);
    assert.strictEqual(await service.exists(subResource1), false);
    assert.strictEqual(await service.exists(subResource2), false);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, resource.fsPath);
    assert.strictEqual(event.operation, FileOperation.DELETE);
  });
  test("deleteFolder (non recursive)", async () => {
    await initFixtures();
    const resource = userdataURIFromPaths(["fixtures", "service", "deep"]);
    const source = await service.resolve(resource);
    assert.ok(await service.canDelete(source.resource) instanceof Error);
    let error;
    try {
      await service.del(source.resource);
    } catch (e) {
      error = e;
    }
    assert.ok(error);
  });
  test("delete empty folder", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const folder = joinPath(parent.resource, "folder");
    await service.createFolder(folder);
    await service.del(folder);
    assert.deepStrictEqual(await service.exists(folder), false);
  });
  test("delete empty folder with reccursive", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const folder = joinPath(parent.resource, "folder");
    await service.createFolder(folder);
    await service.del(folder, { recursive: true });
    assert.deepStrictEqual(await service.exists(folder), false);
  });
  test("deleteFolder with folders and files (recursive)", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const targetFolder = joinPath(parent.resource, "targetFolder");
    const file1 = joinPath(targetFolder, "folder1", "file1");
    await service.createFile(file1);
    const file2 = joinPath(targetFolder, "folder2", "file1");
    await service.createFile(file2);
    const emptyFolder = joinPath(targetFolder, "folder3");
    await service.createFolder(emptyFolder);
    await service.del(targetFolder, { recursive: true });
    assert.deepStrictEqual(await service.exists(targetFolder), false);
    assert.deepStrictEqual(await service.exists(joinPath(targetFolder, "folder1")), false);
    assert.deepStrictEqual(await service.exists(joinPath(targetFolder, "folder2")), false);
    assert.deepStrictEqual(await service.exists(file1), false);
    assert.deepStrictEqual(await service.exists(file2), false);
    assert.deepStrictEqual(await service.exists(emptyFolder), false);
  });
  test("writeFile with append - existing file", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const resource = joinPath(parent.resource, "appendTest.txt");
    await service.writeFile(resource, VSBuffer.fromString("Hello "));
    await service.writeFile(resource, VSBuffer.fromString("World!"), { append: true });
    const content = await service.readFile(resource);
    assert.strictEqual(content.value.toString(), "Hello World!");
  });
  test("writeFile with append - non-existent file", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const resource = joinPath(parent.resource, "newAppendTest.txt");
    await service.writeFile(resource, VSBuffer.fromString("First content"), { append: true });
    const content = await service.readFile(resource);
    assert.strictEqual(content.value.toString(), "First content");
  });
  test("writeFile with append - multiple appends", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const resource = joinPath(parent.resource, "multiAppend.txt");
    await service.writeFile(resource, VSBuffer.fromString("Line 1\n"));
    await service.writeFile(resource, VSBuffer.fromString("Line 2\n"), { append: true });
    await service.writeFile(resource, VSBuffer.fromString("Line 3\n"), { append: true });
    const content = await service.readFile(resource);
    assert.strictEqual(content.value.toString(), "Line 1\nLine 2\nLine 3\n");
  });
  test("writeFile without append - overwrites content", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const resource = joinPath(parent.resource, "overwriteTest.txt");
    await service.writeFile(resource, VSBuffer.fromString("Original content"));
    await service.writeFile(resource, VSBuffer.fromString("New content"));
    const content = await service.readFile(resource);
    assert.strictEqual(content.value.toString(), "New content");
  });
  test("writeFile with append - binary content", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const resource = joinPath(parent.resource, "binaryAppend.bin");
    const data1 = new Uint8Array([1, 2, 3, 4, 5]);
    const data2 = new Uint8Array([6, 7, 8, 9, 10]);
    await service.writeFile(resource, VSBuffer.wrap(data1));
    await service.writeFile(resource, VSBuffer.wrap(data2), { append: true });
    const content = await service.readFile(resource);
    const expected = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.strictEqual(content.value.byteLength, expected.byteLength);
    for (let i = 0; i < expected.byteLength; i++) {
      assert.strictEqual(content.value.buffer[i], expected[i]);
    }
  });
  test("provider writeFile with append - direct provider API", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const resource = joinPath(parent.resource, "providerAppend.txt");
    await userdataFileProvider.writeFile(resource, VSBuffer.fromString("First ").buffer, { create: true, overwrite: true, unlock: false, atomic: false });
    await userdataFileProvider.writeFile(resource, VSBuffer.fromString("Second").buffer, { create: true, overwrite: true, unlock: false, atomic: false, append: true });
    const content = await userdataFileProvider.readFile(resource);
    assert.strictEqual(new TextDecoder().decode(content), "First Second");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZmlsZXNcXHRlc3RcXGJyb3dzZXJcXGluZGV4ZWREQkZpbGVTZXJ2aWNlLmludGVncmF0aW9uVGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEluZGV4ZWREQiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9pbmRleGVkREIuanMnO1xuaW1wb3J0IHsgYnVmZmVyVG9SZWFkYWJsZSwgYnVmZmVyVG9TdHJlYW0sIFZTQnVmZmVyLCBWU0J1ZmZlclJlYWRhYmxlLCBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGZsYWt5U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3Rlc3RVdGlscy5qcyc7XG5pbXBvcnQgeyBJbmRleGVkREJGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL2luZGV4ZWREQkZpbGVTeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uRXJyb3IsIEZpbGVPcGVyYXRpb25FdmVudCwgRmlsZU9wZXJhdGlvblJlc3VsdCwgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZSwgRmlsZVR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5cbmZsYWt5U3VpdGUoJ0luZGV4ZWREQkZpbGVTeXN0ZW1Qcm92aWRlcicsIGZ1bmN0aW9uICgpIHtcblxuXHRsZXQgc2VydmljZTogRmlsZVNlcnZpY2U7XG5cdGxldCB1c2VyZGF0YUZpbGVQcm92aWRlcjogSW5kZXhlZERCRmlsZVN5c3RlbVByb3ZpZGVyO1xuXHRjb25zdCB0ZXN0RGlyID0gJy8nO1xuXG5cdGNvbnN0IHVzZXJkYXRhVVJJRnJvbVBhdGhzID0gKHBhdGhzOiByZWFkb25seSBzdHJpbmdbXSkgPT4gam9pblBhdGgoVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMudnNjb2RlVXNlckRhdGEsIHBhdGg6IHRlc3REaXIgfSksIC4uLnBhdGhzKTtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRjb25zdCBpbml0Rml4dHVyZXMgPSBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoXG5cdFx0XHRbWydmaXh0dXJlcycsICdyZXNvbHZlcicsICdleGFtcGxlcyddLFxuXHRcdFx0WydmaXh0dXJlcycsICdyZXNvbHZlcicsICdvdGhlcicsICdkZWVwJ10sXG5cdFx0XHRbJ2ZpeHR1cmVzJywgJ3NlcnZpY2UnLCAnZGVlcCddLFxuXHRcdFx0WydiYXRjaGVkJ11dXG5cdFx0XHRcdC5tYXAocGF0aCA9PiB1c2VyZGF0YVVSSUZyb21QYXRocyhwYXRoKSlcblx0XHRcdFx0Lm1hcCh1cmkgPT4gc2VydmljZS5jcmVhdGVGb2xkZXIodXJpKSkpO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKFxuXHRcdFx0KFtcblx0XHRcdFx0W1snZml4dHVyZXMnLCAncmVzb2x2ZXInLCAnZXhhbXBsZXMnLCAnY29tcGFueS5qcyddLCAnY2xhc3MgY29tcGFueSB7fSddLFxuXHRcdFx0XHRbWydmaXh0dXJlcycsICdyZXNvbHZlcicsICdleGFtcGxlcycsICdjb253YXkuanMnXSwgJ2V4cG9ydCBmdW5jdGlvbiBjb253YXkoKSB7fSddLFxuXHRcdFx0XHRbWydmaXh0dXJlcycsICdyZXNvbHZlcicsICdleGFtcGxlcycsICdlbXBsb3llZS5qcyddLCAnZXhwb3J0IGNvbnN0IGVtcGxveWVlID0gXCJqYXhcIiddLFxuXHRcdFx0XHRbWydmaXh0dXJlcycsICdyZXNvbHZlcicsICdleGFtcGxlcycsICdzbWFsbC5qcyddLCAnJ10sXG5cdFx0XHRcdFtbJ2ZpeHR1cmVzJywgJ3Jlc29sdmVyJywgJ290aGVyJywgJ2RlZXAnLCAnY29tcGFueS5qcyddLCAnY2xhc3MgY29tcGFueSB7fSddLFxuXHRcdFx0XHRbWydmaXh0dXJlcycsICdyZXNvbHZlcicsICdvdGhlcicsICdkZWVwJywgJ2NvbndheS5qcyddLCAnZXhwb3J0IGZ1bmN0aW9uIGNvbndheSgpIHt9J10sXG5cdFx0XHRcdFtbJ2ZpeHR1cmVzJywgJ3Jlc29sdmVyJywgJ290aGVyJywgJ2RlZXAnLCAnZW1wbG95ZWUuanMnXSwgJ2V4cG9ydCBjb25zdCBlbXBsb3llZSA9IFwiamF4XCInXSxcblx0XHRcdFx0W1snZml4dHVyZXMnLCAncmVzb2x2ZXInLCAnb3RoZXInLCAnZGVlcCcsICdzbWFsbC5qcyddLCAnJ10sXG5cdFx0XHRcdFtbJ2ZpeHR1cmVzJywgJ3Jlc29sdmVyJywgJ2luZGV4Lmh0bWwnXSwgJzxwPnA8L3A+J10sXG5cdFx0XHRcdFtbJ2ZpeHR1cmVzJywgJ3Jlc29sdmVyJywgJ3NpdGUuY3NzJ10sICcucCB7Y29sb3I6IHJlZDt9J10sXG5cdFx0XHRcdFtbJ2ZpeHR1cmVzJywgJ3NlcnZpY2UnLCAnZGVlcCcsICdjb21wYW55LmpzJ10sICdjbGFzcyBjb21wYW55IHt9J10sXG5cdFx0XHRcdFtbJ2ZpeHR1cmVzJywgJ3NlcnZpY2UnLCAnZGVlcCcsICdjb253YXkuanMnXSwgJ2V4cG9ydCBmdW5jdGlvbiBjb253YXkoKSB7fSddLFxuXHRcdFx0XHRbWydmaXh0dXJlcycsICdzZXJ2aWNlJywgJ2RlZXAnLCAnZW1wbG95ZWUuanMnXSwgJ2V4cG9ydCBjb25zdCBlbXBsb3llZSA9IFwiamF4XCInXSxcblx0XHRcdFx0W1snZml4dHVyZXMnLCAnc2VydmljZScsICdkZWVwJywgJ3NtYWxsLmpzJ10sICcnXSxcblx0XHRcdFx0W1snZml4dHVyZXMnLCAnc2VydmljZScsICdiaW5hcnkudHh0J10sICc8cD5wPC9wPiddLFxuXHRcdFx0XSBhcyBjb25zdClcblx0XHRcdFx0Lm1hcCgoW3BhdGgsIGNvbnRlbnRzXSkgPT4gW3VzZXJkYXRhVVJJRnJvbVBhdGhzKHBhdGgpLCBjb250ZW50c10gYXMgY29uc3QpXG5cdFx0XHRcdC5tYXAoKFt1cmksIGNvbnRlbnRzXSkgPT4gc2VydmljZS5jcmVhdGVGaWxlKHVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50cykpKVxuXHRcdCk7XG5cdH07XG5cblx0Y29uc3QgcmVsb2FkID0gYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblxuXHRcdHNlcnZpY2UgPSBuZXcgRmlsZVNlcnZpY2UobG9nU2VydmljZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgaW5kZXhlZERCID0gYXdhaXQgSW5kZXhlZERCLmNyZWF0ZSgndnNjb2RlLXdlYi1kYi10ZXN0JywgMSwgWyd2c2NvZGUtdXNlcmRhdGEtc3RvcmUnLCAndnNjb2RlLWxvZ3Mtc3RvcmUnXSk7XG5cblx0XHR1c2VyZGF0YUZpbGVQcm92aWRlciA9IG5ldyBJbmRleGVkREJGaWxlU3lzdGVtUHJvdmlkZXIoU2NoZW1hcy52c2NvZGVVc2VyRGF0YSwgaW5kZXhlZERCLCAndnNjb2RlLXVzZXJkYXRhLXN0b3JlJywgdHJ1ZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLnZzY29kZVVzZXJEYXRhLCB1c2VyZGF0YUZpbGVQcm92aWRlcikpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh1c2VyZGF0YUZpbGVQcm92aWRlcik7XG5cdH07XG5cblx0c2V0dXAoYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxNTAwMCk7XG5cdFx0YXdhaXQgcmVsb2FkKCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1c2VyZGF0YUZpbGVQcm92aWRlci5yZXNldCgpO1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jvb3QgaXMgYWx3YXlzIHByZXNlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCB1c2VyZGF0YUZpbGVQcm92aWRlci5zdGF0KHVzZXJkYXRhVVJJRnJvbVBhdGhzKFtdKSkpLnR5cGUsIEZpbGVUeXBlLkRpcmVjdG9yeSk7XG5cdFx0YXdhaXQgdXNlcmRhdGFGaWxlUHJvdmlkZXIuZGVsZXRlKHVzZXJkYXRhVVJJRnJvbVBhdGhzKFtdKSwgeyByZWN1cnNpdmU6IHRydWUsIHVzZVRyYXNoOiBmYWxzZSwgYXRvbWljOiBmYWxzZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IHVzZXJkYXRhRmlsZVByb3ZpZGVyLnN0YXQodXNlcmRhdGFVUklGcm9tUGF0aHMoW10pKSkudHlwZSwgRmlsZVR5cGUuRGlyZWN0b3J5KTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlRm9sZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50IHwgdW5kZWZpbmVkO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUnVuT3BlcmF0aW9uKGUgPT4gZXZlbnQgPSBlKSk7XG5cblx0XHRjb25zdCBwYXJlbnQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUodXNlcmRhdGFVUklGcm9tUGF0aHMoW10pKTtcblx0XHRjb25zdCBuZXdGb2xkZXJSZXNvdXJjZSA9IGpvaW5QYXRoKHBhcmVudC5yZXNvdXJjZSwgJ25ld0ZvbGRlcicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCB1c2VyZGF0YUZpbGVQcm92aWRlci5yZWFkZGlyKHBhcmVudC5yZXNvdXJjZSkpLmxlbmd0aCwgMCk7XG5cdFx0Y29uc3QgbmV3Rm9sZGVyID0gYXdhaXQgc2VydmljZS5jcmVhdGVGb2xkZXIobmV3Rm9sZGVyUmVzb3VyY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXdGb2xkZXIubmFtZSwgJ25ld0ZvbGRlcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgdXNlcmRhdGFGaWxlUHJvdmlkZXIucmVhZGRpcihwYXJlbnQucmVzb3VyY2UpKS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgdXNlcmRhdGFGaWxlUHJvdmlkZXIuc3RhdChuZXdGb2xkZXJSZXNvdXJjZSkpLnR5cGUsIEZpbGVUeXBlLkRpcmVjdG9yeSk7XG5cblx0XHRhc3NlcnQub2soZXZlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5yZXNvdXJjZS5wYXRoLCBuZXdGb2xkZXJSZXNvdXJjZS5wYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQub3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uLkNSRUFURSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LnRhcmdldCEucmVzb3VyY2UucGF0aCwgbmV3Rm9sZGVyUmVzb3VyY2UucGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LnRhcmdldCEuaXNEaXJlY3RvcnksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVGb2xkZXI6IGNyZWF0aW5nIG11bHRpcGxlIGZvbGRlcnMgYXQgb25jZScsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgZXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihlID0+IGV2ZW50ID0gZSkpO1xuXG5cdFx0Y29uc3QgbXVsdGlGb2xkZXJQYXRocyA9IFsnYScsICdjb3VwbGUnLCAnb2YnLCAnZm9sZGVycyddO1xuXHRcdGNvbnN0IHBhcmVudCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZSh1c2VyZGF0YVVSSUZyb21QYXRocyhbXSkpO1xuXHRcdGNvbnN0IG5ld0ZvbGRlclJlc291cmNlID0gam9pblBhdGgocGFyZW50LnJlc291cmNlLCAuLi5tdWx0aUZvbGRlclBhdGhzKTtcblxuXHRcdGNvbnN0IG5ld0ZvbGRlciA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlRm9sZGVyKG5ld0ZvbGRlclJlc291cmNlKTtcblxuXHRcdGNvbnN0IGxhc3RGb2xkZXJOYW1lID0gbXVsdGlGb2xkZXJQYXRoc1ttdWx0aUZvbGRlclBhdGhzLmxlbmd0aCAtIDFdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXdGb2xkZXIubmFtZSwgbGFzdEZvbGRlck5hbWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgdXNlcmRhdGFGaWxlUHJvdmlkZXIuc3RhdChuZXdGb2xkZXJSZXNvdXJjZSkpLnR5cGUsIEZpbGVUeXBlLkRpcmVjdG9yeSk7XG5cblx0XHRhc3NlcnQub2soZXZlbnQhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLnJlc291cmNlLnBhdGgsIG5ld0ZvbGRlclJlc291cmNlLnBhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEub3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uLkNSRUFURSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS50YXJnZXQhLnJlc291cmNlLnBhdGgsIG5ld0ZvbGRlclJlc291cmNlLnBhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEudGFyZ2V0IS5pc0RpcmVjdG9yeSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4aXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgZXhpc3RzID0gYXdhaXQgc2VydmljZS5leGlzdHModXNlcmRhdGFVUklGcm9tUGF0aHMoW10pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzLCB0cnVlKTtcblxuXHRcdGV4aXN0cyA9IGF3YWl0IHNlcnZpY2UuZXhpc3RzKHVzZXJkYXRhVVJJRnJvbVBhdGhzKFsnaGVsbG8nXSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHMsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZSAtIGZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgaW5pdEZpeHR1cmVzKCk7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IHVzZXJkYXRhVVJJRnJvbVBhdGhzKFsnZml4dHVyZXMnLCAncmVzb2x2ZXInLCAnaW5kZXguaHRtbCddKTtcblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShyZXNvdXJjZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWQubmFtZSwgJ2luZGV4Lmh0bWwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWQuaXNGaWxlLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWQuaXNEaXJlY3RvcnksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWQuaXNTeW1ib2xpY0xpbmssIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWQucmVzb3VyY2UudG9TdHJpbmcoKSwgcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLmNoaWxkcmVuLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5vayhyZXNvbHZlZC5zaXplISA+IDApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlIC0gZGlyZWN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGluaXRGaXh0dXJlcygpO1xuXG5cdFx0Y29uc3QgdGVzdHNFbGVtZW50cyA9IFsnZXhhbXBsZXMnLCAnb3RoZXInLCAnaW5kZXguaHRtbCcsICdzaXRlLmNzcyddO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB1c2VyZGF0YVVSSUZyb21QYXRocyhbJ2ZpeHR1cmVzJywgJ3Jlc29sdmVyJ10pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShyZXNvdXJjZSk7XG5cblx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnJlc291cmNlLnRvU3RyaW5nKCksIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubmFtZSwgJ3Jlc29sdmVyJyk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5jaGlsZHJlbik7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5jaGlsZHJlbi5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmlzRGlyZWN0b3J5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNoaWxkcmVuLmxlbmd0aCwgdGVzdHNFbGVtZW50cy5sZW5ndGgpO1xuXG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5jaGlsZHJlbi5ldmVyeShlbnRyeSA9PiB7XG5cdFx0XHRyZXR1cm4gdGVzdHNFbGVtZW50cy5zb21lKG5hbWUgPT4ge1xuXHRcdFx0XHRyZXR1cm4gYmFzZW5hbWUoZW50cnkucmVzb3VyY2UpID09PSBuYW1lO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0cmVzdWx0LmNoaWxkcmVuLmZvckVhY2godmFsdWUgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKGJhc2VuYW1lKHZhbHVlLnJlc291cmNlKSk7XG5cdFx0XHRpZiAoWydleGFtcGxlcycsICdvdGhlciddLmluZGV4T2YoYmFzZW5hbWUodmFsdWUucmVzb3VyY2UpKSA+PSAwKSB7XG5cdFx0XHRcdGFzc2VydC5vayh2YWx1ZS5pc0RpcmVjdG9yeSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5tdGltZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmN0aW1lLCB1bmRlZmluZWQpO1xuXHRcdFx0fSBlbHNlIGlmIChiYXNlbmFtZSh2YWx1ZS5yZXNvdXJjZSkgPT09ICdpbmRleC5odG1sJykge1xuXHRcdFx0XHRhc3NlcnQub2soIXZhbHVlLmlzRGlyZWN0b3J5KTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCF2YWx1ZS5jaGlsZHJlbik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5tdGltZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmN0aW1lLCB1bmRlZmluZWQpO1xuXHRcdFx0fSBlbHNlIGlmIChiYXNlbmFtZSh2YWx1ZS5yZXNvdXJjZSkgPT09ICdzaXRlLmNzcycpIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKCF2YWx1ZS5pc0RpcmVjdG9yeSk7XG5cdFx0XHRcdGFzc2VydC5vayghdmFsdWUuY2hpbGRyZW4pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubXRpbWUsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5jdGltZSwgdW5kZWZpbmVkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGFzc2VydC5mYWlsKCdVbmV4cGVjdGVkIHZhbHVlICcgKyBiYXNlbmFtZSh2YWx1ZS5yZXNvdXJjZSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVGaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBhc3NlcnRDcmVhdGVGaWxlKGNvbnRlbnRzID0+IFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudHMpKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlRmlsZSAocmVhZGFibGUpJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBhc3NlcnRDcmVhdGVGaWxlKGNvbnRlbnRzID0+IGJ1ZmZlclRvUmVhZGFibGUoVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50cykpKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlRmlsZSAoc3RyZWFtKScsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gYXNzZXJ0Q3JlYXRlRmlsZShjb250ZW50cyA9PiBidWZmZXJUb1N0cmVhbShWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnRzKSkpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiBhc3NlcnRDcmVhdGVGaWxlKGNvbnZlcnRlcjogKGNvbnRlbnQ6IHN0cmluZykgPT4gVlNCdWZmZXIgfCBWU0J1ZmZlclJlYWRhYmxlIHwgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUnVuT3BlcmF0aW9uKGUgPT4gZXZlbnQgPSBlKSk7XG5cblx0XHRjb25zdCBjb250ZW50cyA9ICdIZWxsbyBXb3JsZCc7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB1c2VyZGF0YVVSSUZyb21QYXRocyhbJ3Rlc3QudHh0J10pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuY2FuQ3JlYXRlRmlsZShyZXNvdXJjZSksIHRydWUpO1xuXHRcdGNvbnN0IGZpbGVTdGF0ID0gYXdhaXQgc2VydmljZS5jcmVhdGVGaWxlKHJlc291cmNlLCBjb252ZXJ0ZXIoY29udGVudHMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZVN0YXQubmFtZSwgJ3Rlc3QudHh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCB1c2VyZGF0YUZpbGVQcm92aWRlci5zdGF0KGZpbGVTdGF0LnJlc291cmNlKSkudHlwZSwgRmlsZVR5cGUuRmlsZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ldyBUZXh0RGVjb2RlcigpLmRlY29kZShhd2FpdCB1c2VyZGF0YUZpbGVQcm92aWRlci5yZWFkRmlsZShmaWxlU3RhdC5yZXNvdXJjZSkpLCBjb250ZW50cyk7XG5cblx0XHRhc3NlcnQub2soZXZlbnQhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLnJlc291cmNlLnBhdGgsIHJlc291cmNlLnBhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEub3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uLkNSRUFURSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS50YXJnZXQhLnJlc291cmNlLnBhdGgsIHJlc291cmNlLnBhdGgpO1xuXHR9XG5cblx0Y29uc3QgZmlsZUNyZWF0ZUJhdGNoVGVzdGVyID0gKHNpemU6IG51bWJlciwgbmFtZTogc3RyaW5nKSA9PiB7XG5cdFx0Y29uc3QgYmF0Y2ggPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiBzaXplIH0pLm1hcCgoXywgaSkgPT4gKHsgY29udGVudHM6IGBIZWxsbyR7aX1gLCByZXNvdXJjZTogdXNlcmRhdGFVUklGcm9tUGF0aHMoWydiYXRjaGVkJywgbmFtZSwgYEhlbGxvJHtpfS50eHRgXSkgfSkpO1xuXHRcdGxldCBjcmVhdGlvblByb21pc2VzOiBQcm9taXNlPGFueT4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGFzeW5jIGNyZWF0ZSgpIHtcblx0XHRcdFx0cmV0dXJuIGNyZWF0aW9uUHJvbWlzZXMgPSBQcm9taXNlLmFsbChiYXRjaC5tYXAoZW50cnkgPT4gdXNlcmRhdGFGaWxlUHJvdmlkZXIud3JpdGVGaWxlKGVudHJ5LnJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGVudHJ5LmNvbnRlbnRzKS5idWZmZXIsIHsgY3JlYXRlOiB0cnVlLCBvdmVyd3JpdGU6IHRydWUsIHVubG9jazogZmFsc2UsIGF0b21pYzogZmFsc2UgfSkpKTtcblx0XHRcdH0sXG5cdFx0XHRhc3luYyBhc3NlcnRDb250ZW50c0NvcnJlY3QoKSB7XG5cdFx0XHRcdGlmICghY3JlYXRpb25Qcm9taXNlcykgeyB0aHJvdyBFcnJvcigncmVhZCBjYWxsZWQgYmVmb3JlIGNyZWF0ZScpOyB9XG5cdFx0XHRcdGF3YWl0IGNyZWF0aW9uUHJvbWlzZXM7XG5cdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKGJhdGNoLm1hcChhc3luYyAoZW50cnksIGkpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IHVzZXJkYXRhRmlsZVByb3ZpZGVyLnN0YXQoZW50cnkucmVzb3VyY2UpKS50eXBlLCBGaWxlVHlwZS5GaWxlKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKGF3YWl0IHVzZXJkYXRhRmlsZVByb3ZpZGVyLnJlYWRGaWxlKGVudHJ5LnJlc291cmNlKSksIGVudHJ5LmNvbnRlbnRzKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH07XG5cblx0dGVzdCgnY3JlYXRlRmlsZSAtIGJhdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RlciA9IGZpbGVDcmVhdGVCYXRjaFRlc3RlcigyMCwgJ2JhdGNoJyk7XG5cdFx0YXdhaXQgdGVzdGVyLmNyZWF0ZSgpO1xuXHRcdGF3YWl0IHRlc3Rlci5hc3NlcnRDb250ZW50c0NvcnJlY3QoKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlRmlsZSAtIGJhdGNoIChtaXhlZCBwYXJhbGxlbC9zZXF1ZW50aWFsKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBiYXRjaDEgPSBmaWxlQ3JlYXRlQmF0Y2hUZXN0ZXIoMSwgJ2JhdGNoMScpO1xuXHRcdGNvbnN0IGJhdGNoMiA9IGZpbGVDcmVhdGVCYXRjaFRlc3RlcigyMCwgJ2JhdGNoMicpO1xuXHRcdGNvbnN0IGJhdGNoMyA9IGZpbGVDcmVhdGVCYXRjaFRlc3RlcigxLCAnYmF0Y2gzJyk7XG5cdFx0Y29uc3QgYmF0Y2g0ID0gZmlsZUNyZWF0ZUJhdGNoVGVzdGVyKDIwLCAnYmF0Y2g0Jyk7XG5cblx0XHRiYXRjaDEuY3JlYXRlKCk7XG5cdFx0YmF0Y2gyLmNyZWF0ZSgpO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtiYXRjaDEuYXNzZXJ0Q29udGVudHNDb3JyZWN0KCksIGJhdGNoMi5hc3NlcnRDb250ZW50c0NvcnJlY3QoKV0pO1xuXHRcdGJhdGNoMy5jcmVhdGUoKTtcblx0XHRiYXRjaDQuY3JlYXRlKCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW2JhdGNoMy5hc3NlcnRDb250ZW50c0NvcnJlY3QoKSwgYmF0Y2g0LmFzc2VydENvbnRlbnRzQ29ycmVjdCgpXSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW2JhdGNoMS5hc3NlcnRDb250ZW50c0NvcnJlY3QoKSwgYmF0Y2gyLmFzc2VydENvbnRlbnRzQ29ycmVjdCgpXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmFtZSBub3QgZXhpc3RpbmcgcmVzb3VyY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyZW50ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKHVzZXJkYXRhVVJJRnJvbVBhdGhzKFtdKSk7XG5cdFx0Y29uc3Qgc291cmNlRmlsZSA9IGpvaW5QYXRoKHBhcmVudC5yZXNvdXJjZSwgJ3NvdXJjZUZpbGUnKTtcblx0XHRjb25zdCB0YXJnZXRGaWxlID0gam9pblBhdGgocGFyZW50LnJlc291cmNlLCAndGFyZ2V0RmlsZScpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlcnZpY2UubW92ZShzb3VyY2VGaWxlLCB0YXJnZXRGaWxlLCBmYWxzZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKDxGaWxlU3lzdGVtUHJvdmlkZXJFcnJvcj5lcnJvcikuY29kZSwgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVOb3RGb3VuZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmZhaWwoJ1RoaXMgc2hvdWxkIGZhaWwgd2l0aCBlcnJvcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5hbWUgdG8gYW4gZXhpc3RpbmcgZmlsZSB3aXRob3V0IG92ZXJ3cml0ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwYXJlbnQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUodXNlcmRhdGFVUklGcm9tUGF0aHMoW10pKTtcblx0XHRjb25zdCBzb3VyY2VGaWxlID0gam9pblBhdGgocGFyZW50LnJlc291cmNlLCAnc291cmNlRmlsZScpO1xuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHNvdXJjZUZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ1RoaXMgaXMgc291cmNlIGZpbGUnKSk7XG5cblx0XHRjb25zdCB0YXJnZXRGaWxlID0gam9pblBhdGgocGFyZW50LnJlc291cmNlLCAndGFyZ2V0RmlsZScpO1xuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHRhcmdldEZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ1RoaXMgaXMgdGFyZ2V0IGZpbGUnKSk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2VydmljZS5tb3ZlKHNvdXJjZUZpbGUsIHRhcmdldEZpbGUsIGZhbHNlKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoPEZpbGVPcGVyYXRpb25FcnJvcj5lcnJvcikuZmlsZU9wZXJhdGlvblJlc3VsdCwgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX01PVkVfQ09ORkxJQ1QpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGFzc2VydC5mYWlsKCdUaGlzIHNob3VsZCBmYWlsIHdpdGggZXJyb3InKTtcblx0fSk7XG5cblx0dGVzdCgncmVuYW1lIGZvbGRlciB0byBhbiBleGlzdGluZyBmb2xkZXIgd2l0aG91dCBvdmVyd3JpdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyZW50ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKHVzZXJkYXRhVVJJRnJvbVBhdGhzKFtdKSk7XG5cdFx0Y29uc3Qgc291cmNlRm9sZGVyID0gam9pblBhdGgocGFyZW50LnJlc291cmNlLCAnc291cmNlRm9sZGVyJyk7XG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGVGb2xkZXIoc291cmNlRm9sZGVyKTtcblx0XHRjb25zdCB0YXJnZXRGb2xkZXIgPSBqb2luUGF0aChwYXJlbnQucmVzb3VyY2UsICd0YXJnZXRGb2xkZXInKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUZvbGRlcih0YXJnZXRGb2xkZXIpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlcnZpY2UubW92ZShzb3VyY2VGb2xkZXIsIHRhcmdldEZvbGRlciwgZmFsc2UpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKCg8RmlsZU9wZXJhdGlvbkVycm9yPmVycm9yKS5maWxlT3BlcmF0aW9uUmVzdWx0LCBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTU9WRV9DT05GTElDVCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmZhaWwoJ1RoaXMgc2hvdWxkIGZhaWwgd2l0aCBjYW5ub3Qgb3ZlcndyaXRlIGVycm9yJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmFtZSBmaWxlIHRvIGEgZm9sZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcmVudCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZSh1c2VyZGF0YVVSSUZyb21QYXRocyhbXSkpO1xuXHRcdGNvbnN0IHNvdXJjZUZpbGUgPSBqb2luUGF0aChwYXJlbnQucmVzb3VyY2UsICdzb3VyY2VGaWxlJyk7XG5cdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUoc291cmNlRmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnVGhpcyBpcyBzb3VyY2UgZmlsZScpKTtcblxuXHRcdGNvbnN0IHRhcmdldEZvbGRlciA9IGpvaW5QYXRoKHBhcmVudC5yZXNvdXJjZSwgJ3RhcmdldEZvbGRlcicpO1xuXHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlRm9sZGVyKHRhcmdldEZvbGRlcik7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2VydmljZS5tb3ZlKHNvdXJjZUZpbGUsIHRhcmdldEZvbGRlciwgZmFsc2UpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKCg8RmlsZU9wZXJhdGlvbkVycm9yPmVycm9yKS5maWxlT3BlcmF0aW9uUmVzdWx0LCBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTU9WRV9DT05GTElDVCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmZhaWwoJ1RoaXMgc2hvdWxkIGZhaWwgd2l0aCBlcnJvcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5hbWUgZm9sZGVyIHRvIGEgZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwYXJlbnQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUodXNlcmRhdGFVUklGcm9tUGF0aHMoW10pKTtcblx0XHRjb25zdCBzb3VyY2VGb2xkZXIgPSBqb2luUGF0aChwYXJlbnQucmVzb3VyY2UsICdzb3VyY2VGaWxlJyk7XG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGVGb2xkZXIoc291cmNlRm9sZGVyKTtcblxuXHRcdGNvbnN0IHRhcmdldEZpbGUgPSBqb2luUGF0aChwYXJlbnQucmVzb3VyY2UsICd0YXJnZXRGaWxlJyk7XG5cdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUodGFyZ2V0RmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnVGhpcyBpcyB0YXJnZXQgZmlsZScpKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLm1vdmUoc291cmNlRm9sZGVyLCB0YXJnZXRGaWxlLCBmYWxzZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKDxGaWxlT3BlcmF0aW9uRXJyb3I+ZXJyb3IpLmZpbGVPcGVyYXRpb25SZXN1bHQsIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9NT1ZFX0NPTkZMSUNUKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhc3NlcnQuZmFpbCgnVGhpcyBzaG91bGQgZmFpbCB3aXRoIGVycm9yJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmFtZSBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcmVudCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZSh1c2VyZGF0YVVSSUZyb21QYXRocyhbXSkpO1xuXHRcdGNvbnN0IHNvdXJjZUZpbGUgPSBqb2luUGF0aChwYXJlbnQucmVzb3VyY2UsICdzb3VyY2VGaWxlJyk7XG5cdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUoc291cmNlRmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnVGhpcyBpcyBzb3VyY2UgZmlsZScpKTtcblxuXHRcdGNvbnN0IHRhcmdldEZpbGUgPSBqb2luUGF0aChwYXJlbnQucmVzb3VyY2UsICd0YXJnZXRGaWxlJyk7XG5cdFx0YXdhaXQgc2VydmljZS5tb3ZlKHNvdXJjZUZpbGUsIHRhcmdldEZpbGUsIGZhbHNlKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBzZXJ2aWNlLnJlYWRGaWxlKHRhcmdldEZpbGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmV4aXN0cyhzb3VyY2VGaWxlKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LnZhbHVlLnRvU3RyaW5nKCksICdUaGlzIGlzIHNvdXJjZSBmaWxlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmFtZSB0byBhbiBleGlzdGluZyBmaWxlIHdpdGggb3ZlcndyaXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcmVudCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZSh1c2VyZGF0YVVSSUZyb21QYXRocyhbXSkpO1xuXHRcdGNvbnN0IHNvdXJjZUZpbGUgPSBqb2luUGF0aChwYXJlbnQucmVzb3VyY2UsICdzb3VyY2VGaWxlJyk7XG5cdFx0Y29uc3QgdGFyZ2V0RmlsZSA9IGpvaW5QYXRoKHBhcmVudC5yZXNvdXJjZSwgJ3RhcmdldEZpbGUnKTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHNlcnZpY2Uud3JpdGVGaWxlKHNvdXJjZUZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ1RoaXMgaXMgc291cmNlIGZpbGUnKSksXG5cdFx0XHRzZXJ2aWNlLndyaXRlRmlsZSh0YXJnZXRGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdUaGlzIGlzIHRhcmdldCBmaWxlJykpXG5cdFx0XSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLm1vdmUoc291cmNlRmlsZSwgdGFyZ2V0RmlsZSwgdHJ1ZSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgc2VydmljZS5yZWFkRmlsZSh0YXJnZXRGaWxlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5leGlzdHMoc291cmNlRmlsZSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudC52YWx1ZS50b1N0cmluZygpLCAnVGhpcyBpcyBzb3VyY2UgZmlsZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5hbWUgZm9sZGVyIHRvIGEgbmV3IGZvbGRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwYXJlbnQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUodXNlcmRhdGFVUklGcm9tUGF0aHMoW10pKTtcblx0XHRjb25zdCBzb3VyY2VGb2xkZXIgPSBqb2luUGF0aChwYXJlbnQucmVzb3VyY2UsICdzb3VyY2VGb2xkZXInKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUZvbGRlcihzb3VyY2VGb2xkZXIpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0Rm9sZGVyID0gam9pblBhdGgocGFyZW50LnJlc291cmNlLCAndGFyZ2V0Rm9sZGVyJyk7XG5cdFx0YXdhaXQgc2VydmljZS5tb3ZlKHNvdXJjZUZvbGRlciwgdGFyZ2V0Rm9sZGVyLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuZXhpc3RzKHNvdXJjZUZvbGRlciksIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuZXhpc3RzKHRhcmdldEZvbGRlciksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5hbWUgZm9sZGVyIHRvIGFuIGV4aXN0aW5nIGZvbGRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwYXJlbnQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUodXNlcmRhdGFVUklGcm9tUGF0aHMoW10pKTtcblx0XHRjb25zdCBzb3VyY2VGb2xkZXIgPSBqb2luUGF0aChwYXJlbnQucmVzb3VyY2UsICdzb3VyY2VGb2xkZXInKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUZvbGRlcihzb3VyY2VGb2xkZXIpO1xuXHRcdGNvbnN0IHRhcmdldEZvbGRlciA9IGpvaW5QYXRoKHBhcmVudC5yZXNvdXJjZSwgJ3RhcmdldEZvbGRlcicpO1xuXHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlRm9sZGVyKHRhcmdldEZvbGRlcik7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLm1vdmUoc291cmNlRm9sZGVyLCB0YXJnZXRGb2xkZXIsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmV4aXN0cyhzb3VyY2VGb2xkZXIpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmV4aXN0cyh0YXJnZXRGb2xkZXIpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncmVuYW1lIGEgZm9sZGVyIHRoYXQgaGFzIG11bHRpcGxlIGZpbGVzIGFuZCBmb2xkZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcmVudCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZSh1c2VyZGF0YVVSSUZyb21QYXRocyhbXSkpO1xuXG5cdFx0Y29uc3Qgc291cmNlRm9sZGVyID0gam9pblBhdGgocGFyZW50LnJlc291cmNlLCAnc291cmNlRm9sZGVyJyk7XG5cdFx0Y29uc3Qgc291cmNlRmlsZTEgPSBqb2luUGF0aChzb3VyY2VGb2xkZXIsICdmb2xkZXIxJywgJ2ZpbGUxJyk7XG5cdFx0Y29uc3Qgc291cmNlRmlsZTIgPSBqb2luUGF0aChzb3VyY2VGb2xkZXIsICdmb2xkZXIyJywgJ2ZpbGUxJyk7XG5cdFx0Y29uc3Qgc291cmNlRW1wdHlGb2xkZXIgPSBqb2luUGF0aChzb3VyY2VGb2xkZXIsICdmb2xkZXIzJyk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRzZXJ2aWNlLndyaXRlRmlsZShzb3VyY2VGaWxlMSwgVlNCdWZmZXIuZnJvbVN0cmluZygnU291cmNlIEZpbGUgMScpKSxcblx0XHRcdHNlcnZpY2Uud3JpdGVGaWxlKHNvdXJjZUZpbGUyLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdTb3VyY2UgRmlsZSAyJykpLFxuXHRcdFx0c2VydmljZS5jcmVhdGVGb2xkZXIoc291cmNlRW1wdHlGb2xkZXIpXG5cdFx0XSk7XG5cblx0XHRjb25zdCB0YXJnZXRGb2xkZXIgPSBqb2luUGF0aChwYXJlbnQucmVzb3VyY2UsICd0YXJnZXRGb2xkZXInKTtcblx0XHRjb25zdCB0YXJnZXRGaWxlMSA9IGpvaW5QYXRoKHRhcmdldEZvbGRlciwgJ2ZvbGRlcjEnLCAnZmlsZTEnKTtcblx0XHRjb25zdCB0YXJnZXRGaWxlMiA9IGpvaW5QYXRoKHRhcmdldEZvbGRlciwgJ2ZvbGRlcjInLCAnZmlsZTEnKTtcblx0XHRjb25zdCB0YXJnZXRFbXB0eUZvbGRlciA9IGpvaW5QYXRoKHRhcmdldEZvbGRlciwgJ2ZvbGRlcjMnKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UubW92ZShzb3VyY2VGb2xkZXIsIHRhcmdldEZvbGRlciwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmV4aXN0cyhzb3VyY2VGb2xkZXIpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmV4aXN0cyh0YXJnZXRGb2xkZXIpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IHNlcnZpY2UucmVhZEZpbGUodGFyZ2V0RmlsZTEpKS52YWx1ZS50b1N0cmluZygpLCAnU291cmNlIEZpbGUgMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgc2VydmljZS5yZWFkRmlsZSh0YXJnZXRGaWxlMikpLnZhbHVlLnRvU3RyaW5nKCksICdTb3VyY2UgRmlsZSAyJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmV4aXN0cyh0YXJnZXRFbXB0eUZvbGRlciksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5hbWUgYSBmb2xkZXIgdG8gYW5vdGhlciBmb2xkZXIgdGhhdCBoYXMgc29tZSBmaWxlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwYXJlbnQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUodXNlcmRhdGFVUklGcm9tUGF0aHMoW10pKTtcblxuXHRcdGNvbnN0IHNvdXJjZUZvbGRlciA9IGpvaW5QYXRoKHBhcmVudC5yZXNvdXJjZSwgJ3NvdXJjZUZvbGRlcicpO1xuXHRcdGNvbnN0IHNvdXJjZUZpbGUxID0gam9pblBhdGgoc291cmNlRm9sZGVyLCAnZm9sZGVyMScsICdmaWxlMScpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0Rm9sZGVyID0gam9pblBhdGgocGFyZW50LnJlc291cmNlLCAndGFyZ2V0Rm9sZGVyJyk7XG5cdFx0Y29uc3QgdGFyZ2V0RmlsZTEgPSBqb2luUGF0aCh0YXJnZXRGb2xkZXIsICdmb2xkZXIxJywgJ2ZpbGUxJyk7XG5cdFx0Y29uc3QgdGFyZ2V0RmlsZTIgPSBqb2luUGF0aCh0YXJnZXRGb2xkZXIsICdmb2xkZXIxJywgJ2ZpbGUyJyk7XG5cdFx0Y29uc3QgdGFyZ2V0RmlsZTMgPSBqb2luUGF0aCh0YXJnZXRGb2xkZXIsICdmb2xkZXIyJywgJ2ZpbGUxJyk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRzZXJ2aWNlLndyaXRlRmlsZShzb3VyY2VGaWxlMSwgVlNCdWZmZXIuZnJvbVN0cmluZygnU291cmNlIEZpbGUgMScpKSxcblx0XHRcdHNlcnZpY2Uud3JpdGVGaWxlKHRhcmdldEZpbGUyLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdUYXJnZXQgRmlsZSAyJykpLFxuXHRcdFx0c2VydmljZS53cml0ZUZpbGUodGFyZ2V0RmlsZTMsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ1RhcmdldCBGaWxlIDMnKSlcblx0XHRdKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UubW92ZShzb3VyY2VGb2xkZXIsIHRhcmdldEZvbGRlciwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuZXhpc3RzKHNvdXJjZUZvbGRlciksIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuZXhpc3RzKHRhcmdldEZvbGRlciksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgc2VydmljZS5yZWFkRmlsZSh0YXJnZXRGaWxlMSkpLnZhbHVlLnRvU3RyaW5nKCksICdTb3VyY2UgRmlsZSAxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuZXhpc3RzKHRhcmdldEZpbGUyKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmV4aXN0cyh0YXJnZXRGaWxlMyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlRmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBpbml0Rml4dHVyZXMoKTtcblxuXHRcdGxldCBldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUnVuT3BlcmF0aW9uKGUgPT4gZXZlbnQgPSBlKSk7XG5cblx0XHRjb25zdCBhbm90aGVyUmVzb3VyY2UgPSB1c2VyZGF0YVVSSUZyb21QYXRocyhbJ2ZpeHR1cmVzJywgJ3NlcnZpY2UnLCAnZGVlcCcsICdjb21wYW55LmpzJ10pO1xuXHRcdGNvbnN0IHJlc291cmNlID0gdXNlcmRhdGFVUklGcm9tUGF0aHMoWydmaXh0dXJlcycsICdzZXJ2aWNlJywgJ2RlZXAnLCAnY29ud2F5LmpzJ10pO1xuXHRcdGNvbnN0IHNvdXJjZSA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShyZXNvdXJjZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jYW5EZWxldGUoc291cmNlLnJlc291cmNlLCB7IHVzZVRyYXNoOiBmYWxzZSB9KSwgdHJ1ZSk7XG5cdFx0YXdhaXQgc2VydmljZS5kZWwoc291cmNlLnJlc291cmNlLCB7IHVzZVRyYXNoOiBmYWxzZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmV4aXN0cyhzb3VyY2UucmVzb3VyY2UpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuZXhpc3RzKGFub3RoZXJSZXNvdXJjZSksIHRydWUpO1xuXG5cdFx0YXNzZXJ0Lm9rKGV2ZW50ISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5yZXNvdXJjZS5wYXRoLCByZXNvdXJjZS5wYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLm9wZXJhdGlvbiwgRmlsZU9wZXJhdGlvbi5ERUxFVEUpO1xuXG5cdFx0e1xuXHRcdFx0bGV0IGVycm9yOiBFcnJvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHNlcnZpY2UuZGVsKHNvdXJjZS5yZXNvdXJjZSwgeyB1c2VUcmFzaDogZmFsc2UgfSk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdGVycm9yID0gZTtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0Lm9rKGVycm9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoPEZpbGVPcGVyYXRpb25FcnJvcj5lcnJvcikuZmlsZU9wZXJhdGlvblJlc3VsdCwgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCk7XG5cdFx0fVxuXHRcdGF3YWl0IHJlbG9hZCgpO1xuXHRcdHtcblx0XHRcdGxldCBlcnJvcjogRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBzZXJ2aWNlLmRlbChzb3VyY2UucmVzb3VyY2UsIHsgdXNlVHJhc2g6IGZhbHNlIH0pO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRlcnJvciA9IGU7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5vayhlcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKDxGaWxlT3BlcmF0aW9uRXJyb3I+ZXJyb3IpLmZpbGVPcGVyYXRpb25SZXN1bHQsIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlRm9sZGVyIChyZWN1cnNpdmUpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGluaXRGaXh0dXJlcygpO1xuXHRcdGxldCBldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUnVuT3BlcmF0aW9uKGUgPT4gZXZlbnQgPSBlKSk7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IHVzZXJkYXRhVVJJRnJvbVBhdGhzKFsnZml4dHVyZXMnLCAnc2VydmljZScsICdkZWVwJ10pO1xuXHRcdGNvbnN0IHN1YlJlc291cmNlMSA9IHVzZXJkYXRhVVJJRnJvbVBhdGhzKFsnZml4dHVyZXMnLCAnc2VydmljZScsICdkZWVwJywgJ2NvbXBhbnkuanMnXSk7XG5cdFx0Y29uc3Qgc3ViUmVzb3VyY2UyID0gdXNlcmRhdGFVUklGcm9tUGF0aHMoWydmaXh0dXJlcycsICdzZXJ2aWNlJywgJ2RlZXAnLCAnY29ud2F5LmpzJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmV4aXN0cyhzdWJSZXNvdXJjZTEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5leGlzdHMoc3ViUmVzb3VyY2UyKSwgdHJ1ZSk7XG5cblx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUocmVzb3VyY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuY2FuRGVsZXRlKHNvdXJjZS5yZXNvdXJjZSwgeyByZWN1cnNpdmU6IHRydWUsIHVzZVRyYXNoOiBmYWxzZSB9KSwgdHJ1ZSk7XG5cdFx0YXdhaXQgc2VydmljZS5kZWwoc291cmNlLnJlc291cmNlLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgdXNlVHJhc2g6IGZhbHNlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuZXhpc3RzKHNvdXJjZS5yZXNvdXJjZSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5leGlzdHMoc3ViUmVzb3VyY2UxKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmV4aXN0cyhzdWJSZXNvdXJjZTIpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0Lm9rKGV2ZW50ISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5yZXNvdXJjZS5mc1BhdGgsIHJlc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5vcGVyYXRpb24sIEZpbGVPcGVyYXRpb24uREVMRVRFKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlRm9sZGVyIChub24gcmVjdXJzaXZlKScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBpbml0Rml4dHVyZXMoKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IHVzZXJkYXRhVVJJRnJvbVBhdGhzKFsnZml4dHVyZXMnLCAnc2VydmljZScsICdkZWVwJ10pO1xuXHRcdGNvbnN0IHNvdXJjZSA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShyZXNvdXJjZSk7XG5cblx0XHRhc3NlcnQub2soKGF3YWl0IHNlcnZpY2UuY2FuRGVsZXRlKHNvdXJjZS5yZXNvdXJjZSkpIGluc3RhbmNlb2YgRXJyb3IpO1xuXG5cdFx0bGV0IGVycm9yO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmRlbChzb3VyY2UucmVzb3VyY2UpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGVycm9yID0gZTtcblx0XHR9XG5cdFx0YXNzZXJ0Lm9rKGVycm9yKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlIGVtcHR5IGZvbGRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwYXJlbnQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUodXNlcmRhdGFVUklGcm9tUGF0aHMoW10pKTtcblx0XHRjb25zdCBmb2xkZXIgPSBqb2luUGF0aChwYXJlbnQucmVzb3VyY2UsICdmb2xkZXInKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUZvbGRlcihmb2xkZXIpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5kZWwoZm9sZGVyKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5leGlzdHMoZm9sZGVyKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGUgZW1wdHkgZm9sZGVyIHdpdGggcmVjY3Vyc2l2ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwYXJlbnQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUodXNlcmRhdGFVUklGcm9tUGF0aHMoW10pKTtcblx0XHRjb25zdCBmb2xkZXIgPSBqb2luUGF0aChwYXJlbnQucmVzb3VyY2UsICdmb2xkZXInKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUZvbGRlcihmb2xkZXIpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5kZWwoZm9sZGVyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5leGlzdHMoZm9sZGVyKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVGb2xkZXIgd2l0aCBmb2xkZXJzIGFuZCBmaWxlcyAocmVjdXJzaXZlKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwYXJlbnQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUodXNlcmRhdGFVUklGcm9tUGF0aHMoW10pKTtcblxuXHRcdGNvbnN0IHRhcmdldEZvbGRlciA9IGpvaW5QYXRoKHBhcmVudC5yZXNvdXJjZSwgJ3RhcmdldEZvbGRlcicpO1xuXHRcdGNvbnN0IGZpbGUxID0gam9pblBhdGgodGFyZ2V0Rm9sZGVyLCAnZm9sZGVyMScsICdmaWxlMScpO1xuXHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlRmlsZShmaWxlMSk7XG5cdFx0Y29uc3QgZmlsZTIgPSBqb2luUGF0aCh0YXJnZXRGb2xkZXIsICdmb2xkZXIyJywgJ2ZpbGUxJyk7XG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGVGaWxlKGZpbGUyKTtcblx0XHRjb25zdCBlbXB0eUZvbGRlciA9IGpvaW5QYXRoKHRhcmdldEZvbGRlciwgJ2ZvbGRlcjMnKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUZvbGRlcihlbXB0eUZvbGRlcik7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmRlbCh0YXJnZXRGb2xkZXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmV4aXN0cyh0YXJnZXRGb2xkZXIpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmV4aXN0cyhqb2luUGF0aCh0YXJnZXRGb2xkZXIsICdmb2xkZXIxJykpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmV4aXN0cyhqb2luUGF0aCh0YXJnZXRGb2xkZXIsICdmb2xkZXIyJykpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmV4aXN0cyhmaWxlMSksIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuZXhpc3RzKGZpbGUyKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5leGlzdHMoZW1wdHlGb2xkZXIpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSB3aXRoIGFwcGVuZCAtIGV4aXN0aW5nIGZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyZW50ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKHVzZXJkYXRhVVJJRnJvbVBhdGhzKFtdKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBqb2luUGF0aChwYXJlbnQucmVzb3VyY2UsICdhcHBlbmRUZXN0LnR4dCcpO1xuXG5cdFx0Ly8gQ3JlYXRlIGluaXRpYWwgZmlsZVxuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdIZWxsbyAnKSk7XG5cblx0XHQvLyBBcHBlbmQgdG8gZXhpc3RpbmcgZmlsZVxuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdXb3JsZCEnKSwgeyBhcHBlbmQ6IHRydWUgfSk7XG5cblx0XHQvLyBWZXJpZnkgY29udGVudFxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBzZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudC52YWx1ZS50b1N0cmluZygpLCAnSGVsbG8gV29ybGQhJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSB3aXRoIGFwcGVuZCAtIG5vbi1leGlzdGVudCBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcmVudCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZSh1c2VyZGF0YVVSSUZyb21QYXRocyhbXSkpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gam9pblBhdGgocGFyZW50LnJlc291cmNlLCAnbmV3QXBwZW5kVGVzdC50eHQnKTtcblxuXHRcdC8vIEFwcGVuZCB0byBub24tZXhpc3RlbnQgZmlsZSAoc2hvdWxkIGNyZWF0ZSBpdClcblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnRmlyc3QgY29udGVudCcpLCB7IGFwcGVuZDogdHJ1ZSB9KTtcblxuXHRcdC8vIFZlcmlmeSBjb250ZW50XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHNlcnZpY2UucmVhZEZpbGUocmVzb3VyY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LnZhbHVlLnRvU3RyaW5nKCksICdGaXJzdCBjb250ZW50Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSB3aXRoIGFwcGVuZCAtIG11bHRpcGxlIGFwcGVuZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyZW50ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKHVzZXJkYXRhVVJJRnJvbVBhdGhzKFtdKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBqb2luUGF0aChwYXJlbnQucmVzb3VyY2UsICdtdWx0aUFwcGVuZC50eHQnKTtcblxuXHRcdC8vIENyZWF0ZSBhbmQgYXBwZW5kIG11bHRpcGxlIHRpbWVzXG5cdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ0xpbmUgMVxcbicpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnTGluZSAyXFxuJyksIHsgYXBwZW5kOiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdMaW5lIDNcXG4nKSwgeyBhcHBlbmQ6IHRydWUgfSk7XG5cblx0XHQvLyBWZXJpZnkgY29udGVudFxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBzZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudC52YWx1ZS50b1N0cmluZygpLCAnTGluZSAxXFxuTGluZSAyXFxuTGluZSAzXFxuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSB3aXRob3V0IGFwcGVuZCAtIG92ZXJ3cml0ZXMgY29udGVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwYXJlbnQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUodXNlcmRhdGFVUklGcm9tUGF0aHMoW10pKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IGpvaW5QYXRoKHBhcmVudC5yZXNvdXJjZSwgJ292ZXJ3cml0ZVRlc3QudHh0Jyk7XG5cblx0XHQvLyBDcmVhdGUgaW5pdGlhbCBmaWxlXG5cdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ09yaWdpbmFsIGNvbnRlbnQnKSk7XG5cblx0XHQvLyBXcml0ZSB3aXRob3V0IGFwcGVuZCAoc2hvdWxkIG92ZXJ3cml0ZSlcblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnTmV3IGNvbnRlbnQnKSk7XG5cblx0XHQvLyBWZXJpZnkgY29udGVudCBpcyBvdmVyd3JpdHRlblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBzZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudC52YWx1ZS50b1N0cmluZygpLCAnTmV3IGNvbnRlbnQnKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIHdpdGggYXBwZW5kIC0gYmluYXJ5IGNvbnRlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyZW50ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKHVzZXJkYXRhVVJJRnJvbVBhdGhzKFtdKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBqb2luUGF0aChwYXJlbnQucmVzb3VyY2UsICdiaW5hcnlBcHBlbmQuYmluJyk7XG5cblx0XHRjb25zdCBkYXRhMSA9IG5ldyBVaW50OEFycmF5KFsxLCAyLCAzLCA0LCA1XSk7XG5cdFx0Y29uc3QgZGF0YTIgPSBuZXcgVWludDhBcnJheShbNiwgNywgOCwgOSwgMTBdKTtcblxuXHRcdC8vIENyZWF0ZSBpbml0aWFsIGZpbGUgd2l0aCBiaW5hcnkgZGF0YVxuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci53cmFwKGRhdGExKSk7XG5cblx0XHQvLyBBcHBlbmQgYmluYXJ5IGRhdGFcblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIud3JhcChkYXRhMiksIHsgYXBwZW5kOiB0cnVlIH0pO1xuXG5cdFx0Ly8gVmVyaWZ5IGNvbWJpbmVkIGNvbnRlbnRcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgc2VydmljZS5yZWFkRmlsZShyZXNvdXJjZSk7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBuZXcgVWludDhBcnJheShbMSwgMiwgMywgNCwgNSwgNiwgNywgOCwgOSwgMTBdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudC52YWx1ZS5ieXRlTGVuZ3RoLCBleHBlY3RlZC5ieXRlTGVuZ3RoKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGV4cGVjdGVkLmJ5dGVMZW5ndGg7IGkrKykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQudmFsdWUuYnVmZmVyW2ldLCBleHBlY3RlZFtpXSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdwcm92aWRlciB3cml0ZUZpbGUgd2l0aCBhcHBlbmQgLSBkaXJlY3QgcHJvdmlkZXIgQVBJJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcmVudCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZSh1c2VyZGF0YVVSSUZyb21QYXRocyhbXSkpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gam9pblBhdGgocGFyZW50LnJlc291cmNlLCAncHJvdmlkZXJBcHBlbmQudHh0Jyk7XG5cblx0XHQvLyBVc2UgcHJvdmlkZXIgZGlyZWN0bHlcblx0XHRhd2FpdCB1c2VyZGF0YUZpbGVQcm92aWRlci53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ0ZpcnN0ICcpLmJ1ZmZlciwgeyBjcmVhdGU6IHRydWUsIG92ZXJ3cml0ZTogdHJ1ZSwgdW5sb2NrOiBmYWxzZSwgYXRvbWljOiBmYWxzZSB9KTtcblx0XHRhd2FpdCB1c2VyZGF0YUZpbGVQcm92aWRlci53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ1NlY29uZCcpLmJ1ZmZlciwgeyBjcmVhdGU6IHRydWUsIG92ZXJ3cml0ZTogdHJ1ZSwgdW5sb2NrOiBmYWxzZSwgYXRvbWljOiBmYWxzZSwgYXBwZW5kOiB0cnVlIH0pO1xuXG5cdFx0Ly8gVmVyaWZ5IGNvbnRlbnRcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdXNlcmRhdGFGaWxlUHJvdmlkZXIucmVhZEZpbGUocmVzb3VyY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUoY29udGVudCksICdGaXJzdCBTZWNvbmQnKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGtCQUFrQixnQkFBZ0IsZ0JBQTBEO0FBQ3JHLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFVBQVUsZ0JBQWdCO0FBQ25DLFNBQVMsV0FBVztBQUNwQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1DQUFtQztBQUM1QyxTQUFTLGVBQXVELHFCQUE4Qyw2QkFBNkIsZ0JBQWdCO0FBQzNKLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsc0JBQXNCO0FBRS9CLFdBQVcsK0JBQStCLFdBQVk7QUFFckQsTUFBSTtBQUNKLE1BQUk7QUFDSixRQUFNLFVBQVU7QUFFaEIsUUFBTSx1QkFBdUIsQ0FBQyxVQUE2QixTQUFTLElBQUksS0FBSyxFQUFFLFFBQVEsUUFBUSxnQkFBZ0IsTUFBTSxRQUFRLENBQUMsR0FBRyxHQUFHLEtBQUs7QUFFekksUUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBRXhDLFFBQU0sZUFBZSxZQUFZO0FBQ2hDLFVBQU0sUUFBUTtBQUFBLE1BQ2I7QUFBQSxRQUFDLENBQUMsWUFBWSxZQUFZLFVBQVU7QUFBQSxRQUNwQyxDQUFDLFlB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
