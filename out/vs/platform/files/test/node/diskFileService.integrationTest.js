import assert from "assert";
import { createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync, promises } from "fs";
import { tmpdir } from "os";
import { timeout } from "../../../../base/common/async.js";
import { bufferToReadable, bufferToStream, streamToBuffer, streamToBufferReadableStream, VSBuffer } from "../../../../base/common/buffer.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { FileAccess, Schemas } from "../../../../base/common/network.js";
import { basename, dirname, join, posix } from "../../../../base/common/path.js";
import { isLinux, isWindows } from "../../../../base/common/platform.js";
import { joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { Promises } from "../../../../base/node/pfs.js";
import { flakySuite, getRandomTestPath } from "../../../../base/test/node/testUtils.js";
import { etag, FileOperation, FileOperationError, FileOperationResult, FilePermission, FileSystemProviderCapabilities, hasFileAtomicReadCapability, hasOpenReadWriteCloseCapability, NotModifiedSinceFileOperationError, TooLargeFileOperationError } from "../../common/files.js";
import { FileService } from "../../common/fileService.js";
import { DiskFileSystemProvider } from "../../node/diskFileSystemProvider.js";
import { NullLogService } from "../../../log/common/log.js";
function getByName(root, name) {
  if (root.children === void 0) {
    return void 0;
  }
  return root.children.find((child) => child.name === name);
}
function toLineByLineReadable(content) {
  let chunks = content.split("\n");
  chunks = chunks.map((chunk, index) => {
    if (index === 0) {
      return chunk;
    }
    return "\n" + chunk;
  });
  return {
    read() {
      const chunk = chunks.shift();
      if (typeof chunk === "string") {
        return VSBuffer.fromString(chunk);
      }
      return null;
    }
  };
}
class TestDiskFileSystemProvider extends DiskFileSystemProvider {
  constructor() {
    super(...arguments);
    this.totalBytesRead = 0;
    this.invalidStatSize = false;
    this.smallStatSize = false;
    this.readonly = false;
  }
  get capabilities() {
    if (!this._testCapabilities) {
      this._testCapabilities = FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.FileReadStream | FileSystemProviderCapabilities.Trash | FileSystemProviderCapabilities.FileFolderCopy | FileSystemProviderCapabilities.FileWriteUnlock | FileSystemProviderCapabilities.FileAtomicRead | FileSystemProviderCapabilities.FileAtomicWrite | FileSystemProviderCapabilities.FileAtomicDelete | FileSystemProviderCapabilities.FileClone | FileSystemProviderCapabilities.FileAppend | FileSystemProviderCapabilities.FileRealpath;
      if (isLinux) {
        this._testCapabilities |= FileSystemProviderCapabilities.PathCaseSensitive;
      }
    }
    return this._testCapabilities;
  }
  set capabilities(capabilities) {
    this._testCapabilities = capabilities;
  }
  setInvalidStatSize(enabled) {
    this.invalidStatSize = enabled;
  }
  setSmallStatSize(enabled) {
    this.smallStatSize = enabled;
  }
  setReadonly(readonly) {
    this.readonly = readonly;
  }
  async stat(resource) {
    const res = await super.stat(resource);
    if (this.invalidStatSize) {
      res.size = String(res.size);
    } else if (this.smallStatSize) {
      res.size = 1;
    } else if (this.readonly) {
      res.permissions = FilePermission.Readonly;
    }
    return res;
  }
  async read(fd, pos, data, offset, length) {
    const bytesRead = await super.read(fd, pos, data, offset, length);
    this.totalBytesRead += bytesRead;
    return bytesRead;
  }
  async readFile(resource, options) {
    const res = await super.readFile(resource, options);
    this.totalBytesRead += res.byteLength;
    return res;
  }
}
DiskFileSystemProvider.configureFlushOnWrite(false);
flakySuite("Disk File Service", function() {
  const testSchema = "test";
  let service;
  let fileProvider;
  let testProvider;
  let testDir;
  const disposables = new DisposableStore();
  setup(async () => {
    const logService = new NullLogService();
    service = disposables.add(new FileService(logService));
    fileProvider = disposables.add(new TestDiskFileSystemProvider(logService));
    disposables.add(service.registerProvider(Schemas.file, fileProvider));
    testProvider = disposables.add(new TestDiskFileSystemProvider(logService));
    disposables.add(service.registerProvider(testSchema, testProvider));
    testDir = getRandomTestPath(tmpdir(), "vsctests", "diskfileservice");
    const sourceDir = FileAccess.asFileUri("vs/platform/files/test/node/fixtures/service").fsPath;
    await Promises.copy(sourceDir, testDir, { preserveSymlinks: false });
  });
  teardown(() => {
    disposables.clear();
    return Promises.rm(testDir);
  });
  test("createFolder", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const parent = await service.resolve(URI.file(testDir));
    const newFolderResource = URI.file(join(parent.resource.fsPath, "newFolder"));
    const newFolder = await service.createFolder(newFolderResource);
    assert.strictEqual(newFolder.name, "newFolder");
    assert.strictEqual(existsSync(newFolder.resource.fsPath), true);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, newFolderResource.fsPath);
    assert.strictEqual(event.operation, FileOperation.CREATE);
    assert.strictEqual(event.target.resource.fsPath, newFolderResource.fsPath);
    assert.strictEqual(event.target.isDirectory, true);
  });
  test("createFolder: creating multiple folders at once", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const multiFolderPaths = ["a", "couple", "of", "folders"];
    const parent = await service.resolve(URI.file(testDir));
    const newFolderResource = URI.file(join(parent.resource.fsPath, ...multiFolderPaths));
    const newFolder = await service.createFolder(newFolderResource);
    const lastFolderName = multiFolderPaths[multiFolderPaths.length - 1];
    assert.strictEqual(newFolder.name, lastFolderName);
    assert.strictEqual(existsSync(newFolder.resource.fsPath), true);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, newFolderResource.fsPath);
    assert.strictEqual(event.operation, FileOperation.CREATE);
    assert.strictEqual(event.target.resource.fsPath, newFolderResource.fsPath);
    assert.strictEqual(event.target.isDirectory, true);
  });
  test("exists", async () => {
    let exists = await service.exists(URI.file(testDir));
    assert.strictEqual(exists, true);
    exists = await service.exists(URI.file(testDir + "something"));
    assert.strictEqual(exists, false);
  });
  test("resolve - file", async () => {
    const resource = FileAccess.asFileUri("vs/platform/files/test/node/fixtures/resolver/index.html");
    const resolved = await service.resolve(resource);
    assert.strictEqual(resolved.name, "index.html");
    assert.strictEqual(resolved.isFile, true);
    assert.strictEqual(resolved.isDirectory, false);
    assert.strictEqual(resolved.readonly, false);
    assert.strictEqual(resolved.isSymbolicLink, false);
    assert.strictEqual(resolved.resource.toString(), resource.toString());
    assert.strictEqual(resolved.children, void 0);
    assert.ok(resolved.mtime > 0);
    assert.ok(resolved.ctime > 0);
    assert.ok(resolved.size > 0);
  });
  test("resolve - directory", async () => {
    const testsElements = ["examples", "other", "index.html", "site.css"];
    const resource = FileAccess.asFileUri("vs/platform/files/test/node/fixtures/resolver");
    const result = await service.resolve(resource);
    assert.ok(result);
    assert.strictEqual(result.resource.toString(), resource.toString());
    assert.strictEqual(result.name, "resolver");
    assert.ok(result.children);
    assert.ok(result.children.length > 0);
    assert.ok(result.isDirectory);
    assert.strictEqual(result.readonly, false);
    assert.ok(result.mtime > 0);
    assert.ok(result.ctime > 0);
    assert.strictEqual(result.children.length, testsElements.length);
    assert.ok(result.children.every((entry) => {
      return testsElements.some((name) => {
        return basename(entry.resource.fsPath) === name;
      });
    }));
    result.children.forEach((value) => {
      assert.ok(basename(value.resource.fsPath));
      if (["examples", "other"].indexOf(basename(value.resource.fsPath)) >= 0) {
        assert.ok(value.isDirectory);
        assert.strictEqual(value.mtime, void 0);
        assert.strictEqual(value.ctime, void 0);
      } else if (basename(value.resource.fsPath) === "index.html") {
        assert.ok(!value.isDirectory);
        assert.ok(!value.children);
        assert.strictEqual(value.mtime, void 0);
        assert.strictEqual(value.ctime, void 0);
      } else if (basename(value.resource.fsPath) === "site.css") {
        assert.ok(!value.isDirectory);
        assert.ok(!value.children);
        assert.strictEqual(value.mtime, void 0);
        assert.strictEqual(value.ctime, void 0);
      } else {
        assert.fail("Unexpected value " + basename(value.resource.fsPath));
      }
    });
  });
  test("resolve - directory - with metadata", async () => {
    const testsElements = ["examples", "other", "index.html", "site.css"];
    const result = await service.resolve(FileAccess.asFileUri("vs/platform/files/test/node/fixtures/resolver"), { resolveMetadata: true });
    assert.ok(result);
    assert.strictEqual(result.name, "resolver");
    assert.ok(result.children);
    assert.ok(result.children.length > 0);
    assert.ok(result.isDirectory);
    assert.ok(result.mtime > 0);
    assert.ok(result.ctime > 0);
    assert.strictEqual(result.children.length, testsElements.length);
    assert.ok(result.children.every((entry) => {
      return testsElements.some((name) => {
        return basename(entry.resource.fsPath) === name;
      });
    }));
    assert.ok(result.children.every((entry) => entry.etag.length > 0));
    result.children.forEach((value) => {
      assert.ok(basename(value.resource.fsPath));
      if (["examples", "other"].indexOf(basename(value.resource.fsPath)) >= 0) {
        assert.ok(value.isDirectory);
        assert.ok(value.mtime > 0);
        assert.ok(value.ctime > 0);
      } else if (basename(value.resource.fsPath) === "index.html") {
        assert.ok(!value.isDirectory);
        assert.ok(!value.children);
        assert.ok(value.mtime > 0);
        assert.ok(value.ctime > 0);
      } else if (basename(value.resource.fsPath) === "site.css") {
        assert.ok(!value.isDirectory);
        assert.ok(!value.children);
        assert.ok(value.mtime > 0);
        assert.ok(value.ctime > 0);
      } else {
        assert.fail("Unexpected value " + basename(value.resource.fsPath));
      }
    });
  });
  test("resolve - directory with resolveTo", async () => {
    const resolved = await service.resolve(URI.file(testDir), { resolveTo: [URI.file(join(testDir, "deep"))] });
    assert.strictEqual(resolved.children.length, 8);
    const deep = getByName(resolved, "deep");
    assert.strictEqual(deep.children.length, 4);
  });
  test("resolve - directory - resolveTo single directory", async () => {
    const resolverFixturesPath = FileAccess.asFileUri("vs/platform/files/test/node/fixtures/resolver").fsPath;
    const result = await service.resolve(URI.file(resolverFixturesPath), { resolveTo: [URI.file(join(resolverFixturesPath, "other/deep"))] });
    assert.ok(result);
    assert.ok(result.children);
    assert.ok(result.children.length > 0);
    assert.ok(result.isDirectory);
    const children = result.children;
    assert.strictEqual(children.length, 4);
    const other = getByName(result, "other");
    assert.ok(other);
    assert.ok(other.children.length > 0);
    const deep = getByName(other, "deep");
    assert.ok(deep);
    assert.ok(deep.children.length > 0);
    assert.strictEqual(deep.children.length, 4);
  });
  test("resolve directory - resolveTo multiple directories", () => {
    return testResolveDirectoryWithTarget(false);
  });
  test("resolve directory - resolveTo with a URI that has query parameter (https://github.com/microsoft/vscode/issues/128151)", () => {
    return testResolveDirectoryWithTarget(true);
  });
  async function testResolveDirectoryWithTarget(withQueryParam) {
    const resolverFixturesPath = FileAccess.asFileUri("vs/platform/files/test/node/fixtures/resolver").fsPath;
    const result = await service.resolve(URI.file(resolverFixturesPath).with({ query: withQueryParam ? "test" : void 0 }), {
      resolveTo: [
        URI.file(join(resolverFixturesPath, "other/deep")).with({ query: withQueryParam ? "test" : void 0 }),
        URI.file(join(resolverFixturesPath, "examples")).with({ query: withQueryParam ? "test" : void 0 })
      ]
    });
    assert.ok(result);
    assert.ok(result.children);
    assert.ok(result.children.length > 0);
    assert.ok(result.isDirectory);
    const children = result.children;
    assert.strictEqual(children.length, 4);
    const other = getByName(result, "other");
    assert.ok(other);
    assert.ok(other.children.length > 0);
    const deep = getByName(other, "deep");
    assert.ok(deep);
    assert.ok(deep.children.length > 0);
    assert.strictEqual(deep.children.length, 4);
    const examples = getByName(result, "examples");
    assert.ok(examples);
    assert.ok(examples.children.length > 0);
    assert.strictEqual(examples.children.length, 4);
  }
  test("resolve directory - resolveSingleChildFolders", async () => {
    const resolverFixturesPath = FileAccess.asFileUri("vs/platform/files/test/node/fixtures/resolver/other").fsPath;
    const result = await service.resolve(URI.file(resolverFixturesPath), { resolveSingleChildDescendants: true });
    assert.ok(result);
    assert.ok(result.children);
    assert.ok(result.children.length > 0);
    assert.ok(result.isDirectory);
    const children = result.children;
    assert.strictEqual(children.length, 1);
    const deep = getByName(result, "deep");
    assert.ok(deep);
    assert.ok(deep.children.length > 0);
    assert.strictEqual(deep.children.length, 4);
  });
  test("resolves", async () => {
    const res = await service.resolveAll([
      { resource: URI.file(testDir), options: { resolveTo: [URI.file(join(testDir, "deep"))] } },
      { resource: URI.file(join(testDir, "deep")) }
    ]);
    const r1 = res[0].stat;
    assert.strictEqual(r1.children.length, 8);
    const deep = getByName(r1, "deep");
    assert.strictEqual(deep.children.length, 4);
    const r2 = res[1].stat;
    assert.strictEqual(r2.children.length, 4);
    assert.strictEqual(r2.name, "deep");
  });
  test("resolve / realpath - folder symbolic link", async () => {
    const link = URI.file(join(testDir, "deep-link"));
    await promises.symlink(join(testDir, "deep"), link.fsPath, "junction");
    const resolved = await service.resolve(link);
    assert.strictEqual(resolved.children.length, 4);
    assert.strictEqual(resolved.isDirectory, true);
    assert.strictEqual(resolved.isSymbolicLink, true);
    const realpath = await service.realpath(link);
    assert.ok(realpath);
    assert.strictEqual(basename(realpath.fsPath), "deep");
  });
  (isWindows ? test.skip : test)("resolve - file symbolic link", async () => {
    const link = URI.file(join(testDir, "lorem.txt-linked"));
    await promises.symlink(join(testDir, "lorem.txt"), link.fsPath);
    const resolved = await service.resolve(link);
    assert.strictEqual(resolved.isDirectory, false);
    assert.strictEqual(resolved.isSymbolicLink, true);
  });
  test("resolve - symbolic link pointing to nonexistent file does not break", async () => {
    await promises.symlink(join(testDir, "foo"), join(testDir, "bar"), "junction");
    const resolved = await service.resolve(URI.file(testDir));
    assert.strictEqual(resolved.isDirectory, true);
    assert.strictEqual(resolved.children.length, 9);
    const resolvedLink = resolved.children?.find((child) => child.name === "bar" && child.isSymbolicLink);
    assert.ok(resolvedLink);
    assert.ok(!resolvedLink?.isDirectory);
    assert.ok(!resolvedLink?.isFile);
  });
  test("stat - file", async () => {
    const resource = FileAccess.asFileUri("vs/platform/files/test/node/fixtures/resolver/index.html");
    const resolved = await service.stat(resource);
    assert.strictEqual(resolved.name, "index.html");
    assert.strictEqual(resolved.isFile, true);
    assert.strictEqual(resolved.isDirectory, false);
    assert.strictEqual(resolved.readonly, false);
    assert.strictEqual(resolved.isSymbolicLink, false);
    assert.strictEqual(resolved.resource.toString(), resource.toString());
    assert.ok(resolved.mtime > 0);
    assert.ok(resolved.ctime > 0);
    assert.ok(resolved.size > 0);
  });
  test("stat - directory", async () => {
    const resource = FileAccess.asFileUri("vs/platform/files/test/node/fixtures/resolver");
    const result = await service.stat(resource);
    assert.ok(result);
    assert.strictEqual(result.resource.toString(), resource.toString());
    assert.strictEqual(result.name, "resolver");
    assert.ok(result.isDirectory);
    assert.strictEqual(result.readonly, false);
    assert.ok(result.mtime > 0);
    assert.ok(result.ctime > 0);
  });
  if (!isWindows) {
    test("stat - executable", async () => {
      const nonExecutable = FileAccess.asFileUri("vs/platform/files/test/node/fixtures/executable/non_executable");
      let resolved = await service.stat(nonExecutable);
      assert.strictEqual(resolved.isFile, true);
      assert.strictEqual(resolved.executable, false);
      const executable = FileAccess.asFileUri("vs/platform/files/test/node/fixtures/executable/executable");
      resolved = await service.stat(executable);
      assert.strictEqual(resolved.isFile, true);
      assert.strictEqual(resolved.executable, true);
    });
  }
  test("deleteFile (non recursive)", async () => {
    return testDeleteFile(false, false);
  });
  test("deleteFile (recursive)", async () => {
    return testDeleteFile(false, true);
  });
  (isLinux ? test.skip : test)("deleteFile (useTrash)", async () => {
    return testDeleteFile(true, false);
  });
  async function testDeleteFile(useTrash, recursive) {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const resource = URI.file(join(testDir, "deep", "conway.js"));
    const source = await service.resolve(resource);
    assert.strictEqual(await service.canDelete(source.resource, { useTrash, recursive }), true);
    await service.del(source.resource, { useTrash, recursive });
    assert.strictEqual(existsSync(source.resource.fsPath), false);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, resource.fsPath);
    assert.strictEqual(event.operation, FileOperation.DELETE);
    let error = void 0;
    try {
      await service.del(source.resource, { useTrash, recursive });
    } catch (e) {
      error = e;
    }
    assert.ok(error);
    assert.strictEqual(error.fileOperationResult, FileOperationResult.FILE_NOT_FOUND);
  }
  (isWindows ? test.skip : test)("deleteFile - symbolic link (exists)", async () => {
    const target = URI.file(join(testDir, "lorem.txt"));
    const link = URI.file(join(testDir, "lorem.txt-linked"));
    await promises.symlink(target.fsPath, link.fsPath);
    const source = await service.resolve(link);
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    assert.strictEqual(await service.canDelete(source.resource), true);
    await service.del(source.resource);
    assert.strictEqual(existsSync(source.resource.fsPath), false);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, link.fsPath);
    assert.strictEqual(event.operation, FileOperation.DELETE);
    assert.strictEqual(existsSync(target.fsPath), true);
  });
  (isWindows ? test.skip : test)("deleteFile - symbolic link (pointing to nonexistent file)", async () => {
    const target = URI.file(join(testDir, "foo"));
    const link = URI.file(join(testDir, "bar"));
    await promises.symlink(target.fsPath, link.fsPath);
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    assert.strictEqual(await service.canDelete(link), true);
    await service.del(link);
    assert.strictEqual(existsSync(link.fsPath), false);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, link.fsPath);
    assert.strictEqual(event.operation, FileOperation.DELETE);
  });
  test("deleteFolder (recursive)", async () => {
    return testDeleteFolderRecursive(false, false);
  });
  test("deleteFolder (recursive, atomic)", async () => {
    return testDeleteFolderRecursive(false, { postfix: ".vsctmp" });
  });
  (isLinux ? test.skip : test)("deleteFolder (recursive, useTrash)", async () => {
    return testDeleteFolderRecursive(true, false);
  });
  async function testDeleteFolderRecursive(useTrash, atomic) {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const resource = URI.file(join(testDir, "deep"));
    const source = await service.resolve(resource);
    assert.strictEqual(await service.canDelete(source.resource, { recursive: true, useTrash, atomic }), true);
    await service.del(source.resource, { recursive: true, useTrash, atomic });
    assert.strictEqual(existsSync(source.resource.fsPath), false);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, resource.fsPath);
    assert.strictEqual(event.operation, FileOperation.DELETE);
  }
  test("deleteFolder (non recursive)", async () => {
    const resource = URI.file(join(testDir, "deep"));
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
  test("deleteFolder empty folder (recursive)", () => {
    return testDeleteEmptyFolder(true);
  });
  test("deleteFolder empty folder (non recursive)", () => {
    return testDeleteEmptyFolder(false);
  });
  async function testDeleteEmptyFolder(recursive) {
    const { resource } = await service.createFolder(URI.file(join(testDir, "deep", "empty")));
    await service.del(resource, { recursive });
    assert.strictEqual(await service.exists(resource), false);
  }
  test("move", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const source = URI.file(join(testDir, "index.html"));
    const sourceContents = readFileSync(source.fsPath);
    const target = URI.file(join(dirname(source.fsPath), "other.html"));
    assert.strictEqual(await service.canMove(source, target), true);
    const renamed = await service.move(source, target);
    assert.strictEqual(existsSync(renamed.resource.fsPath), true);
    assert.strictEqual(existsSync(source.fsPath), false);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, source.fsPath);
    assert.strictEqual(event.operation, FileOperation.MOVE);
    assert.strictEqual(event.target.resource.fsPath, renamed.resource.fsPath);
    const targetContents = readFileSync(target.fsPath);
    assert.strictEqual(sourceContents.byteLength, targetContents.byteLength);
    assert.strictEqual(sourceContents.toString(), targetContents.toString());
  });
  test("move - across providers (buffered => buffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    setCapabilities(testProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testMoveAcrossProviders();
  });
  test("move - across providers (unbuffered => unbuffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    setCapabilities(testProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testMoveAcrossProviders();
  });
  test("move - across providers (buffered => unbuffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    setCapabilities(testProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testMoveAcrossProviders();
  });
  test("move - across providers (unbuffered => buffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    setCapabilities(testProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testMoveAcrossProviders();
  });
  test("move - across providers - large (buffered => buffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    setCapabilities(testProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testMoveAcrossProviders("lorem.txt");
  });
  test("move - across providers - large (unbuffered => unbuffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    setCapabilities(testProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testMoveAcrossProviders("lorem.txt");
  });
  test("move - across providers - large (buffered => unbuffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    setCapabilities(testProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testMoveAcrossProviders("lorem.txt");
  });
  test("move - across providers - large (unbuffered => buffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    setCapabilities(testProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testMoveAcrossProviders("lorem.txt");
  });
  async function testMoveAcrossProviders(sourceFile = "index.html") {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const source = URI.file(join(testDir, sourceFile));
    const sourceContents = readFileSync(source.fsPath);
    const target = URI.file(join(dirname(source.fsPath), "other.html")).with({ scheme: testSchema });
    assert.strictEqual(await service.canMove(source, target), true);
    const renamed = await service.move(source, target);
    assert.strictEqual(existsSync(renamed.resource.fsPath), true);
    assert.strictEqual(existsSync(source.fsPath), false);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, source.fsPath);
    assert.strictEqual(event.operation, FileOperation.COPY);
    assert.strictEqual(event.target.resource.fsPath, renamed.resource.fsPath);
    const targetContents = readFileSync(target.fsPath);
    assert.strictEqual(sourceContents.byteLength, targetContents.byteLength);
    assert.strictEqual(sourceContents.toString(), targetContents.toString());
  }
  test("move - multi folder", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const multiFolderPaths = ["a", "couple", "of", "folders"];
    const renameToPath = join(...multiFolderPaths, "other.html");
    const source = URI.file(join(testDir, "index.html"));
    assert.strictEqual(await service.canMove(source, URI.file(join(dirname(source.fsPath), renameToPath))), true);
    const renamed = await service.move(source, URI.file(join(dirname(source.fsPath), renameToPath)));
    assert.strictEqual(existsSync(renamed.resource.fsPath), true);
    assert.strictEqual(existsSync(source.fsPath), false);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, source.fsPath);
    assert.strictEqual(event.operation, FileOperation.MOVE);
    assert.strictEqual(event.target.resource.fsPath, renamed.resource.fsPath);
  });
  test("move - directory", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const source = URI.file(join(testDir, "deep"));
    assert.strictEqual(await service.canMove(source, URI.file(join(dirname(source.fsPath), "deeper"))), true);
    const renamed = await service.move(source, URI.file(join(dirname(source.fsPath), "deeper")));
    assert.strictEqual(existsSync(renamed.resource.fsPath), true);
    assert.strictEqual(existsSync(source.fsPath), false);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, source.fsPath);
    assert.strictEqual(event.operation, FileOperation.MOVE);
    assert.strictEqual(event.target.resource.fsPath, renamed.resource.fsPath);
  });
  test("move - directory - across providers (buffered => buffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    setCapabilities(testProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testMoveFolderAcrossProviders();
  });
  test("move - directory - across providers (unbuffered => unbuffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    setCapabilities(testProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testMoveFolderAcrossProviders();
  });
  test("move - directory - across providers (buffered => unbuffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    setCapabilities(testProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testMoveFolderAcrossProviders();
  });
  test("move - directory - across providers (unbuffered => buffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    setCapabilities(testProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testMoveFolderAcrossProviders();
  });
  async function testMoveFolderAcrossProviders() {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const source = URI.file(join(testDir, "deep"));
    const sourceChildren = readdirSync(source.fsPath);
    const target = URI.file(join(dirname(source.fsPath), "deeper")).with({ scheme: testSchema });
    assert.strictEqual(await service.canMove(source, target), true);
    const renamed = await service.move(source, target);
    assert.strictEqual(existsSync(renamed.resource.fsPath), true);
    assert.strictEqual(existsSync(source.fsPath), false);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, source.fsPath);
    assert.strictEqual(event.operation, FileOperation.COPY);
    assert.strictEqual(event.target.resource.fsPath, renamed.resource.fsPath);
    const targetChildren = readdirSync(target.fsPath);
    assert.strictEqual(sourceChildren.length, targetChildren.length);
    for (let i = 0; i < sourceChildren.length; i++) {
      assert.strictEqual(sourceChildren[i], targetChildren[i]);
    }
  }
  test("move - MIX CASE", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const source = await service.resolve(URI.file(join(testDir, "index.html")), { resolveMetadata: true });
    assert.ok(source.size > 0);
    const renamedResource = URI.file(join(dirname(source.resource.fsPath), "INDEX.html"));
    assert.strictEqual(await service.canMove(source.resource, renamedResource), true);
    let renamed = await service.move(source.resource, renamedResource);
    assert.strictEqual(existsSync(renamedResource.fsPath), true);
    assert.strictEqual(basename(renamedResource.fsPath), "INDEX.html");
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, source.resource.fsPath);
    assert.strictEqual(event.operation, FileOperation.MOVE);
    assert.strictEqual(event.target.resource.fsPath, renamedResource.fsPath);
    renamed = await service.resolve(renamedResource, { resolveMetadata: true });
    assert.strictEqual(source.size, renamed.size);
  });
  test("move - same file", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const source = await service.resolve(URI.file(join(testDir, "index.html")), { resolveMetadata: true });
    assert.ok(source.size > 0);
    assert.strictEqual(await service.canMove(source.resource, URI.file(source.resource.fsPath)), true);
    let renamed = await service.move(source.resource, URI.file(source.resource.fsPath));
    assert.strictEqual(existsSync(renamed.resource.fsPath), true);
    assert.strictEqual(basename(renamed.resource.fsPath), "index.html");
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, source.resource.fsPath);
    assert.strictEqual(event.operation, FileOperation.MOVE);
    assert.strictEqual(event.target.resource.fsPath, renamed.resource.fsPath);
    renamed = await service.resolve(renamed.resource, { resolveMetadata: true });
    assert.strictEqual(source.size, renamed.size);
  });
  test("move - same file #2", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const source = await service.resolve(URI.file(join(testDir, "index.html")), { resolveMetadata: true });
    assert.ok(source.size > 0);
    const targetParent = URI.file(testDir);
    const target = targetParent.with({ path: posix.join(targetParent.path, posix.basename(source.resource.path)) });
    assert.strictEqual(await service.canMove(source.resource, target), true);
    let renamed = await service.move(source.resource, target);
    assert.strictEqual(existsSync(renamed.resource.fsPath), true);
    assert.strictEqual(basename(renamed.resource.fsPath), "index.html");
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, source.resource.fsPath);
    assert.strictEqual(event.operation, FileOperation.MOVE);
    assert.strictEqual(event.target.resource.fsPath, renamed.resource.fsPath);
    renamed = await service.resolve(renamed.resource, { resolveMetadata: true });
    assert.strictEqual(source.size, renamed.size);
  });
  test("move - source parent of target", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    let source = await service.resolve(URI.file(join(testDir, "index.html")), { resolveMetadata: true });
    const originalSize = source.size;
    assert.ok(originalSize > 0);
    assert.ok(await service.canMove(URI.file(testDir), URI.file(join(testDir, "binary.txt"))) instanceof Error);
    let error;
    try {
      await service.move(URI.file(testDir), URI.file(join(testDir, "binary.txt")));
    } catch (e) {
      error = e;
    }
    assert.ok(error);
    assert.ok(!event);
    source = await service.resolve(source.resource, { resolveMetadata: true });
    assert.strictEqual(originalSize, source.size);
  });
  test("move - FILE_MOVE_CONFLICT", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    let source = await service.resolve(URI.file(join(testDir, "index.html")), { resolveMetadata: true });
    const originalSize = source.size;
    assert.ok(originalSize > 0);
    assert.ok(await service.canMove(source.resource, URI.file(join(testDir, "binary.txt"))) instanceof Error);
    let error;
    try {
      await service.move(source.resource, URI.file(join(testDir, "binary.txt")));
    } catch (e) {
      error = e;
    }
    assert.strictEqual(error.fileOperationResult, FileOperationResult.FILE_MOVE_CONFLICT);
    assert.ok(!event);
    source = await service.resolve(source.resource, { resolveMetadata: true });
    assert.strictEqual(originalSize, source.size);
  });
  test("move - overwrite folder with file", async () => {
    let createEvent;
    let moveEvent;
    let deleteEvent;
    disposables.add(service.onDidRunOperation((e) => {
      if (e.operation === FileOperation.CREATE) {
        createEvent = e;
      } else if (e.operation === FileOperation.DELETE) {
        deleteEvent = e;
      } else if (e.operation === FileOperation.MOVE) {
        moveEvent = e;
      }
    }));
    const parent = await service.resolve(URI.file(testDir));
    const folderResource = URI.file(join(parent.resource.fsPath, "conway.js"));
    const f = await service.createFolder(folderResource);
    const source = URI.file(join(testDir, "deep", "conway.js"));
    assert.strictEqual(await service.canMove(source, f.resource, true), true);
    const moved = await service.move(source, f.resource, true);
    assert.strictEqual(existsSync(moved.resource.fsPath), true);
    assert.ok(statSync(moved.resource.fsPath).isFile);
    assert.ok(createEvent);
    assert.ok(deleteEvent);
    assert.ok(moveEvent);
    assert.strictEqual(moveEvent.resource.fsPath, source.fsPath);
    assert.strictEqual(moveEvent.target.resource.fsPath, moved.resource.fsPath);
    assert.strictEqual(deleteEvent.resource.fsPath, folderResource.fsPath);
  });
  test("copy", async () => {
    await doTestCopy();
  });
  test("copy - unbuffered (FileSystemProviderCapabilities.FileReadWrite)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    await doTestCopy();
  });
  test("copy - unbuffered large (FileSystemProviderCapabilities.FileReadWrite)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    await doTestCopy("lorem.txt");
  });
  test("copy - buffered (FileSystemProviderCapabilities.FileOpenReadWriteClose)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    await doTestCopy();
  });
  test("copy - buffered large (FileSystemProviderCapabilities.FileOpenReadWriteClose)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    await doTestCopy("lorem.txt");
  });
  function setCapabilities(provider, capabilities) {
    provider.capabilities = capabilities;
    if (isLinux) {
      provider.capabilities |= FileSystemProviderCapabilities.PathCaseSensitive;
    }
  }
  async function doTestCopy(sourceName = "index.html") {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const source = await service.resolve(URI.file(join(testDir, sourceName)));
    const target = URI.file(join(testDir, "other.html"));
    assert.strictEqual(await service.canCopy(source.resource, target), true);
    const copied = await service.copy(source.resource, target);
    assert.strictEqual(existsSync(copied.resource.fsPath), true);
    assert.strictEqual(existsSync(source.resource.fsPath), true);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, source.resource.fsPath);
    assert.strictEqual(event.operation, FileOperation.COPY);
    assert.strictEqual(event.target.resource.fsPath, copied.resource.fsPath);
    const sourceContents = readFileSync(source.resource.fsPath);
    const targetContents = readFileSync(target.fsPath);
    assert.strictEqual(sourceContents.byteLength, targetContents.byteLength);
    assert.strictEqual(sourceContents.toString(), targetContents.toString());
  }
  test("copy - overwrite folder with file", async () => {
    let createEvent;
    let copyEvent;
    let deleteEvent;
    disposables.add(service.onDidRunOperation((e) => {
      if (e.operation === FileOperation.CREATE) {
        createEvent = e;
      } else if (e.operation === FileOperation.DELETE) {
        deleteEvent = e;
      } else if (e.operation === FileOperation.COPY) {
        copyEvent = e;
      }
    }));
    const parent = await service.resolve(URI.file(testDir));
    const folderResource = URI.file(join(parent.resource.fsPath, "conway.js"));
    const f = await service.createFolder(folderResource);
    const source = URI.file(join(testDir, "deep", "conway.js"));
    assert.strictEqual(await service.canCopy(source, f.resource, true), true);
    const copied = await service.copy(source, f.resource, true);
    assert.strictEqual(existsSync(copied.resource.fsPath), true);
    assert.ok(statSync(copied.resource.fsPath).isFile);
    assert.ok(createEvent);
    assert.ok(deleteEvent);
    assert.ok(copyEvent);
    assert.strictEqual(copyEvent.resource.fsPath, source.fsPath);
    assert.strictEqual(copyEvent.target.resource.fsPath, copied.resource.fsPath);
    assert.strictEqual(deleteEvent.resource.fsPath, folderResource.fsPath);
  });
  test("copy - MIX CASE same target - no overwrite", async () => {
    let source = await service.resolve(URI.file(join(testDir, "index.html")), { resolveMetadata: true });
    const originalSize = source.size;
    assert.ok(originalSize > 0);
    const target = URI.file(join(dirname(source.resource.fsPath), "INDEX.html"));
    const canCopy = await service.canCopy(source.resource, target);
    let error;
    let copied;
    try {
      copied = await service.copy(source.resource, target);
    } catch (e) {
      error = e;
    }
    if (isLinux) {
      assert.ok(!error);
      assert.strictEqual(canCopy, true);
      assert.strictEqual(existsSync(copied.resource.fsPath), true);
      assert.ok(readdirSync(testDir).some((f) => f === "INDEX.html"));
      assert.strictEqual(source.size, copied.size);
    } else {
      assert.ok(error);
      assert.ok(canCopy instanceof Error);
      source = await service.resolve(source.resource, { resolveMetadata: true });
      assert.strictEqual(originalSize, source.size);
    }
  });
  test("copy - MIX CASE same target - overwrite", async () => {
    let source = await service.resolve(URI.file(join(testDir, "index.html")), { resolveMetadata: true });
    const originalSize = source.size;
    assert.ok(originalSize > 0);
    const target = URI.file(join(dirname(source.resource.fsPath), "INDEX.html"));
    const canCopy = await service.canCopy(source.resource, target, true);
    let error;
    let copied;
    try {
      copied = await service.copy(source.resource, target, true);
    } catch (e) {
      error = e;
    }
    if (isLinux) {
      assert.ok(!error);
      assert.strictEqual(canCopy, true);
      assert.strictEqual(existsSync(copied.resource.fsPath), true);
      assert.ok(readdirSync(testDir).some((f) => f === "INDEX.html"));
      assert.strictEqual(source.size, copied.size);
    } else {
      assert.ok(error);
      assert.ok(canCopy instanceof Error);
      source = await service.resolve(source.resource, { resolveMetadata: true });
      assert.strictEqual(originalSize, source.size);
    }
  });
  test("copy - MIX CASE different target - overwrite", async () => {
    const source1 = await service.resolve(URI.file(join(testDir, "index.html")), { resolveMetadata: true });
    assert.ok(source1.size > 0);
    const renamed = await service.move(source1.resource, URI.file(join(dirname(source1.resource.fsPath), "CONWAY.js")));
    assert.strictEqual(existsSync(renamed.resource.fsPath), true);
    assert.ok(readdirSync(testDir).some((f) => f === "CONWAY.js"));
    assert.strictEqual(source1.size, renamed.size);
    const source2 = await service.resolve(URI.file(join(testDir, "deep", "conway.js")), { resolveMetadata: true });
    const target = URI.file(join(testDir, basename(source2.resource.path)));
    assert.strictEqual(await service.canCopy(source2.resource, target, true), true);
    const res = await service.copy(source2.resource, target, true);
    assert.strictEqual(existsSync(res.resource.fsPath), true);
    assert.ok(readdirSync(testDir).some((f) => f === "conway.js"));
    assert.strictEqual(source2.size, res.size);
  });
  test("copy - same file", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const source = await service.resolve(URI.file(join(testDir, "index.html")), { resolveMetadata: true });
    assert.ok(source.size > 0);
    assert.strictEqual(await service.canCopy(source.resource, URI.file(source.resource.fsPath)), true);
    let copied = await service.copy(source.resource, URI.file(source.resource.fsPath));
    assert.strictEqual(existsSync(copied.resource.fsPath), true);
    assert.strictEqual(basename(copied.resource.fsPath), "index.html");
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, source.resource.fsPath);
    assert.strictEqual(event.operation, FileOperation.COPY);
    assert.strictEqual(event.target.resource.fsPath, copied.resource.fsPath);
    copied = await service.resolve(source.resource, { resolveMetadata: true });
    assert.strictEqual(source.size, copied.size);
  });
  test("copy - same file #2", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const source = await service.resolve(URI.file(join(testDir, "index.html")), { resolveMetadata: true });
    assert.ok(source.size > 0);
    const targetParent = URI.file(testDir);
    const target = targetParent.with({ path: posix.join(targetParent.path, posix.basename(source.resource.path)) });
    assert.strictEqual(await service.canCopy(source.resource, URI.file(target.fsPath)), true);
    let copied = await service.copy(source.resource, URI.file(target.fsPath));
    assert.strictEqual(existsSync(copied.resource.fsPath), true);
    assert.strictEqual(basename(copied.resource.fsPath), "index.html");
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, source.resource.fsPath);
    assert.strictEqual(event.operation, FileOperation.COPY);
    assert.strictEqual(event.target.resource.fsPath, copied.resource.fsPath);
    copied = await service.resolve(source.resource, { resolveMetadata: true });
    assert.strictEqual(source.size, copied.size);
  });
  test("cloneFile - basics", () => {
    return testCloneFile();
  });
  test("cloneFile - via copy capability", () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.FileFolderCopy);
    return testCloneFile();
  });
  test("cloneFile - via pipe", () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testCloneFile();
  });
  async function testCloneFile() {
    const source1 = URI.file(join(testDir, "index.html"));
    const source1Size = (await service.resolve(source1, { resolveMetadata: true })).size;
    const source2 = URI.file(join(testDir, "lorem.txt"));
    const source2Size = (await service.resolve(source2, { resolveMetadata: true })).size;
    const targetParent = URI.file(testDir);
    await service.cloneFile(source1, source1);
    const target1 = targetParent.with({ path: posix.join(targetParent.path, `${posix.basename(source1.path)}-clone`) });
    await service.cloneFile(source1, URI.file(target1.fsPath));
    assert.strictEqual(existsSync(target1.fsPath), true);
    assert.strictEqual(basename(target1.fsPath), "index.html-clone");
    let target1Size = (await service.resolve(target1, { resolveMetadata: true })).size;
    assert.strictEqual(source1Size, target1Size);
    await service.cloneFile(source2, URI.file(target1.fsPath));
    target1Size = (await service.resolve(target1, { resolveMetadata: true })).size;
    assert.strictEqual(source2Size, target1Size);
    assert.notStrictEqual(source1Size, target1Size);
    const target2 = targetParent.with({ path: posix.join(targetParent.path, "foo", "bar", `${posix.basename(source1.path)}-clone`) });
    await service.cloneFile(source1, URI.file(target2.fsPath));
    assert.strictEqual(existsSync(target2.fsPath), true);
    assert.strictEqual(basename(target2.fsPath), "index.html-clone");
    const target2Size = (await service.resolve(target2, { resolveMetadata: true })).size;
    assert.strictEqual(source1Size, target2Size);
  }
  test("readFile - small file - default", () => {
    return testReadFile(URI.file(join(testDir, "small.txt")));
  });
  test("readFile - small file - buffered", () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testReadFile(URI.file(join(testDir, "small.txt")));
  });
  test("readFile - small file - buffered / readonly", () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.Readonly);
    return testReadFile(URI.file(join(testDir, "small.txt")));
  });
  test("readFile - small file - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testReadFile(URI.file(join(testDir, "small.txt")));
  });
  test("readFile - small file - unbuffered / readonly", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.Readonly);
    return testReadFile(URI.file(join(testDir, "small.txt")));
  });
  test("readFile - small file - streamed", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadStream);
    return testReadFile(URI.file(join(testDir, "small.txt")));
  });
  test("readFile - small file - streamed / readonly", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadStream | FileSystemProviderCapabilities.Readonly);
    return testReadFile(URI.file(join(testDir, "small.txt")));
  });
  test("readFile - large file - default", async () => {
    return testReadFile(URI.file(join(testDir, "lorem.txt")));
  });
  test("readFile - large file - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testReadFile(URI.file(join(testDir, "lorem.txt")));
  });
  test("readFile - large file - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testReadFile(URI.file(join(testDir, "lorem.txt")));
  });
  test("readFile - large file - streamed", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadStream);
    return testReadFile(URI.file(join(testDir, "lorem.txt")));
  });
  test("readFile - atomic (emulated on service level)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadStream);
    return testReadFile(URI.file(join(testDir, "lorem.txt")), { atomic: true });
  });
  test("readFile - atomic (natively supported)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite & FileSystemProviderCapabilities.FileAtomicRead);
    return testReadFile(URI.file(join(testDir, "lorem.txt")), { atomic: true });
  });
  async function testReadFile(resource, options) {
    const content = await service.readFile(resource, options);
    assert.strictEqual(content.value.toString(), readFileSync(resource.fsPath).toString());
  }
  test("readFileStream - small file - default", () => {
    return testReadFileStream(URI.file(join(testDir, "small.txt")));
  });
  test("readFileStream - small file - buffered", () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testReadFileStream(URI.file(join(testDir, "small.txt")));
  });
  test("readFileStream - small file - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testReadFileStream(URI.file(join(testDir, "small.txt")));
  });
  test("readFileStream - small file - streamed", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadStream);
    return testReadFileStream(URI.file(join(testDir, "small.txt")));
  });
  async function testReadFileStream(resource) {
    const content = await service.readFileStream(resource);
    assert.strictEqual((await streamToBuffer(content.value)).toString(), readFileSync(resource.fsPath).toString());
  }
  test("readFile - Files are intermingled #38331 - default", async () => {
    return testFilesNotIntermingled();
  });
  test("readFile - Files are intermingled #38331 - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testFilesNotIntermingled();
  });
  test("readFile - Files are intermingled #38331 - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testFilesNotIntermingled();
  });
  test("readFile - Files are intermingled #38331 - streamed", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadStream);
    return testFilesNotIntermingled();
  });
  async function testFilesNotIntermingled() {
    const resource1 = URI.file(join(testDir, "lorem.txt"));
    const resource2 = URI.file(join(testDir, "some_utf16le.css"));
    const value1 = await service.readFile(resource1);
    const value2 = await service.readFile(resource2);
    const result = await Promise.all([
      service.readFile(resource1),
      service.readFile(resource2)
    ]);
    assert.strictEqual(result[0].value.toString(), value1.value.toString());
    assert.strictEqual(result[1].value.toString(), value2.value.toString());
  }
  test("readFile - from position (ASCII) - default", async () => {
    return testReadFileFromPositionAscii();
  });
  test("readFile - from position (ASCII) - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testReadFileFromPositionAscii();
  });
  test("readFile - from position (ASCII) - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testReadFileFromPositionAscii();
  });
  test("readFile - from position (ASCII) - streamed", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadStream);
    return testReadFileFromPositionAscii();
  });
  async function testReadFileFromPositionAscii() {
    const resource = URI.file(join(testDir, "small.txt"));
    const contents = await service.readFile(resource, { position: 6 });
    assert.strictEqual(contents.value.toString(), "File");
  }
  test("readFile - from position (with umlaut) - default", async () => {
    return testReadFileFromPositionUmlaut();
  });
  test("readFile - from position (with umlaut) - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testReadFileFromPositionUmlaut();
  });
  test("readFile - from position (with umlaut) - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testReadFileFromPositionUmlaut();
  });
  test("readFile - from position (with umlaut) - streamed", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadStream);
    return testReadFileFromPositionUmlaut();
  });
  async function testReadFileFromPositionUmlaut() {
    const resource = URI.file(join(testDir, "small_umlaut.txt"));
    const contents = await service.readFile(resource, { position: Buffer.from("Small File with \xDC").length });
    assert.strictEqual(contents.value.toString(), "mlaut");
  }
  test("readFile - 3 bytes (ASCII) - default", async () => {
    return testReadThreeBytesFromFile();
  });
  test("readFile - 3 bytes (ASCII) - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testReadThreeBytesFromFile();
  });
  test("readFile - 3 bytes (ASCII) - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testReadThreeBytesFromFile();
  });
  test("readFile - 3 bytes (ASCII) - streamed", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadStream);
    return testReadThreeBytesFromFile();
  });
  async function testReadThreeBytesFromFile() {
    const resource = URI.file(join(testDir, "small.txt"));
    const contents = await service.readFile(resource, { length: 3 });
    assert.strictEqual(contents.value.toString(), "Sma");
  }
  test("readFile - 20000 bytes (large) - default", async () => {
    return readLargeFileWithLength(2e4);
  });
  test("readFile - 20000 bytes (large) - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return readLargeFileWithLength(2e4);
  });
  test("readFile - 20000 bytes (large) - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return readLargeFileWithLength(2e4);
  });
  test("readFile - 20000 bytes (large) - streamed", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadStream);
    return readLargeFileWithLength(2e4);
  });
  test("readFile - 80000 bytes (large) - default", async () => {
    return readLargeFileWithLength(8e4);
  });
  test("readFile - 80000 bytes (large) - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return readLargeFileWithLength(8e4);
  });
  test("readFile - 80000 bytes (large) - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return readLargeFileWithLength(8e4);
  });
  test("readFile - 80000 bytes (large) - streamed", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadStream);
    return readLargeFileWithLength(8e4);
  });
  async function readLargeFileWithLength(length) {
    const resource = URI.file(join(testDir, "lorem.txt"));
    const contents = await service.readFile(resource, { length });
    assert.strictEqual(contents.value.byteLength, length);
  }
  test("readFile - FILE_IS_DIRECTORY", async () => {
    const resource = URI.file(join(testDir, "deep"));
    let error = void 0;
    try {
      await service.readFile(resource);
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.strictEqual(error.fileOperationResult, FileOperationResult.FILE_IS_DIRECTORY);
  });
  (isWindows ? test.skip : test)("readFile - FILE_NOT_DIRECTORY", async () => {
    const resource = URI.file(join(testDir, "lorem.txt", "file.txt"));
    let error = void 0;
    try {
      await service.readFile(resource);
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.strictEqual(error.fileOperationResult, FileOperationResult.FILE_NOT_DIRECTORY);
  });
  test("readFile - FILE_NOT_FOUND", async () => {
    const resource = URI.file(join(testDir, "404.html"));
    let error = void 0;
    try {
      await service.readFile(resource);
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.strictEqual(error.fileOperationResult, FileOperationResult.FILE_NOT_FOUND);
  });
  test("readFile - FILE_NOT_MODIFIED_SINCE - default", async () => {
    return testNotModifiedSince();
  });
  test("readFile - FILE_NOT_MODIFIED_SINCE - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testNotModifiedSince();
  });
  test("readFile - FILE_NOT_MODIFIED_SINCE - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testNotModifiedSince();
  });
  test("readFile - FILE_NOT_MODIFIED_SINCE - streamed", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadStream);
    return testNotModifiedSince();
  });
  async function testNotModifiedSince() {
    const resource = URI.file(join(testDir, "index.html"));
    const contents = await service.readFile(resource);
    fileProvider.totalBytesRead = 0;
    let error = void 0;
    try {
      await service.readFile(resource, { etag: contents.etag });
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.strictEqual(error.fileOperationResult, FileOperationResult.FILE_NOT_MODIFIED_SINCE);
    assert.ok(error instanceof NotModifiedSinceFileOperationError && error.stat);
    assert.strictEqual(fileProvider.totalBytesRead, 0);
  }
  test("readFile - FILE_NOT_MODIFIED_SINCE does not fire wrongly - https://github.com/microsoft/vscode/issues/72909", async () => {
    fileProvider.setInvalidStatSize(true);
    const resource = URI.file(join(testDir, "index.html"));
    await service.readFile(resource);
    let error = void 0;
    try {
      await service.readFile(resource, { etag: void 0 });
    } catch (err) {
      error = err;
    }
    assert.ok(!error);
  });
  test("readFile - FILE_TOO_LARGE - default", async () => {
    return testFileTooLarge();
  });
  test("readFile - FILE_TOO_LARGE - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testFileTooLarge();
  });
  test("readFile - FILE_TOO_LARGE - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testFileTooLarge();
  });
  test("readFile - FILE_TOO_LARGE - streamed", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadStream);
    return testFileTooLarge();
  });
  async function testFileTooLarge() {
    await doTestFileTooLarge(false);
    fileProvider.setSmallStatSize(true);
    return doTestFileTooLarge(true);
  }
  async function doTestFileTooLarge(statSizeWrong) {
    const resource = URI.file(join(testDir, "index.html"));
    let error = void 0;
    try {
      await service.readFile(resource, { limits: { size: 10 } });
    } catch (err) {
      error = err;
    }
    if (!statSizeWrong) {
      assert.ok(error instanceof TooLargeFileOperationError);
      assert.ok(typeof error.size === "number");
    }
    assert.strictEqual(error.fileOperationResult, FileOperationResult.FILE_TOO_LARGE);
  }
  (isWindows ? test.skip : test)("readFile - dangling symbolic link - https://github.com/microsoft/vscode/issues/116049", async () => {
    const link = URI.file(join(testDir, "small.js-link"));
    await promises.symlink(join(testDir, "small.js"), link.fsPath);
    let error = void 0;
    try {
      await service.readFile(link);
    } catch (err) {
      error = err;
    }
    assert.ok(error);
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
    const resource = URI.file(join(testDir, "test.txt"));
    assert.strictEqual(await service.canCreateFile(resource), true);
    const fileStat = await service.createFile(resource, converter(contents));
    assert.strictEqual(fileStat.name, "test.txt");
    assert.strictEqual(existsSync(fileStat.resource.fsPath), true);
    assert.strictEqual(readFileSync(fileStat.resource.fsPath).toString(), contents);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, resource.fsPath);
    assert.strictEqual(event.operation, FileOperation.CREATE);
    assert.strictEqual(event.target.resource.fsPath, resource.fsPath);
  }
  test("createFile (does not overwrite by default)", async () => {
    const contents = "Hello World";
    const resource = URI.file(join(testDir, "test.txt"));
    writeFileSync(resource.fsPath, "");
    assert.ok(await service.canCreateFile(resource) instanceof Error);
    let error;
    try {
      await service.createFile(resource, VSBuffer.fromString(contents));
    } catch (err) {
      error = err;
    }
    assert.ok(error);
  });
  test("createFile (allows to overwrite existing)", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const contents = "Hello World";
    const resource = URI.file(join(testDir, "test.txt"));
    writeFileSync(resource.fsPath, "");
    assert.strictEqual(await service.canCreateFile(resource, { overwrite: true }), true);
    const fileStat = await service.createFile(resource, VSBuffer.fromString(contents), { overwrite: true });
    assert.strictEqual(fileStat.name, "test.txt");
    assert.strictEqual(existsSync(fileStat.resource.fsPath), true);
    assert.strictEqual(readFileSync(fileStat.resource.fsPath).toString(), contents);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, resource.fsPath);
    assert.strictEqual(event.operation, FileOperation.CREATE);
    assert.strictEqual(event.target.resource.fsPath, resource.fsPath);
  });
  test("writeFile - default", async () => {
    return testWriteFile(false);
  });
  test("writeFile - flush on write", async () => {
    DiskFileSystemProvider.configureFlushOnWrite(true);
    try {
      return await testWriteFile(false);
    } finally {
      DiskFileSystemProvider.configureFlushOnWrite(false);
    }
  });
  test("writeFile - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testWriteFile(false);
  });
  test("writeFile - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testWriteFile(false);
  });
  test("writeFile - default (atomic)", async () => {
    return testWriteFile(true);
  });
  test("writeFile - flush on write (atomic)", async () => {
    DiskFileSystemProvider.configureFlushOnWrite(true);
    try {
      return await testWriteFile(true);
    } finally {
      DiskFileSystemProvider.configureFlushOnWrite(false);
    }
  });
  test("writeFile - buffered (atomic)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.FileAtomicWrite);
    let e;
    try {
      await testWriteFile(true);
    } catch (error) {
      e = error;
    }
    assert.ok(e);
  });
  test("writeFile - unbuffered (atomic)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileAtomicWrite);
    return testWriteFile(true);
  });
  (isWindows ? test.skip : test)("writeFile - atomic writing does not break symlinks", async () => {
    const link = URI.file(join(testDir, "lorem.txt-linked"));
    await promises.symlink(join(testDir, "lorem.txt"), link.fsPath);
    const content = "Updates to the lorem file";
    await service.writeFile(link, VSBuffer.fromString(content), { atomic: { postfix: ".vsctmp" } });
    assert.strictEqual(readFileSync(link.fsPath).toString(), content);
    const resolved = await service.resolve(link);
    assert.strictEqual(resolved.isSymbolicLink, true);
  });
  async function testWriteFile(atomic) {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const resource = URI.file(join(testDir, "small.txt"));
    const content = readFileSync(resource.fsPath).toString();
    assert.strictEqual(content, "Small File");
    const newContent = "Updates to the small file";
    await service.writeFile(resource, VSBuffer.fromString(newContent), { atomic: atomic ? { postfix: ".vsctmp" } : false });
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, resource.fsPath);
    assert.strictEqual(event.operation, FileOperation.WRITE);
    assert.strictEqual(readFileSync(resource.fsPath).toString(), newContent);
  }
  test("writeFile (large file) - default", async () => {
    return testWriteFileLarge(false);
  });
  test("writeFile (large file) - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testWriteFileLarge(false);
  });
  test("writeFile (large file) - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testWriteFileLarge(false);
  });
  test("writeFile (large file) - default (atomic)", async () => {
    return testWriteFileLarge(true);
  });
  test("writeFile (large file) - buffered (atomic)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.FileAtomicWrite);
    let e;
    try {
      await testWriteFileLarge(true);
    } catch (error) {
      e = error;
    }
    assert.ok(e);
  });
  test("writeFile (large file) - unbuffered (atomic)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileAtomicWrite);
    return testWriteFileLarge(true);
  });
  async function testWriteFileLarge(atomic) {
    const resource = URI.file(join(testDir, "lorem.txt"));
    const content = readFileSync(resource.fsPath);
    const newContent = content.toString() + content.toString();
    const fileStat = await service.writeFile(resource, VSBuffer.fromString(newContent), { atomic: atomic ? { postfix: ".vsctmp" } : false });
    assert.strictEqual(fileStat.name, "lorem.txt");
    assert.strictEqual(readFileSync(resource.fsPath).toString(), newContent);
  }
  test("writeFile (large file) - unbuffered (atomic) - concurrent writes with multiple services", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileAtomicWrite);
    const resource = URI.file(join(testDir, "lorem.txt"));
    const content = readFileSync(resource.fsPath);
    const newContent = content.toString() + content.toString();
    const promises2 = [];
    let suffix = 0;
    for (let i = 0; i < 10; i++) {
      const service2 = disposables.add(new FileService(new NullLogService()));
      disposables.add(service2.registerProvider(Schemas.file, fileProvider));
      promises2.push(service2.writeFile(resource, VSBuffer.fromString(`${newContent}${++suffix}`), { atomic: { postfix: ".vsctmp" } }));
      await timeout(0);
    }
    await Promise.allSettled(promises2);
    assert.strictEqual(readFileSync(resource.fsPath).toString(), `${newContent}${suffix}`);
  });
  test("writeFile - buffered - readonly throws", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.Readonly);
    return testWriteFileReadonlyThrows();
  });
  test("writeFile - unbuffered - readonly throws", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.Readonly);
    return testWriteFileReadonlyThrows();
  });
  async function testWriteFileReadonlyThrows() {
    const resource = URI.file(join(testDir, "small.txt"));
    const content = readFileSync(resource.fsPath).toString();
    assert.strictEqual(content, "Small File");
    const newContent = "Updates to the small file";
    let error;
    try {
      await service.writeFile(resource, VSBuffer.fromString(newContent));
    } catch (err) {
      error = err;
    }
    assert.ok(error);
  }
  test("writeFile (large file) - multiple parallel writes queue up and atomic read support (via file service)", async () => {
    const resource = URI.file(join(testDir, "lorem.txt"));
    const content = readFileSync(resource.fsPath);
    const newContent = content.toString() + content.toString();
    const writePromises = Promise.all(["0", "00", "000", "0000", "00000"].map(async (offset) => {
      const fileStat = await service.writeFile(resource, VSBuffer.fromString(offset + newContent));
      assert.strictEqual(fileStat.name, "lorem.txt");
    }));
    const readPromises = Promise.all(["0", "00", "000", "0000", "00000"].map(async () => {
      const fileContent = await service.readFile(resource, { atomic: true });
      assert.ok(fileContent.value.byteLength > 0);
    }));
    await Promise.all([writePromises, readPromises]);
  });
  test("provider - write barrier prevents dirty writes", async () => {
    const resource = URI.file(join(testDir, "lorem.txt"));
    const content = readFileSync(resource.fsPath);
    const newContent = content.toString() + content.toString();
    const provider = service.getProvider(resource.scheme);
    assert.ok(provider);
    assert.ok(hasOpenReadWriteCloseCapability(provider));
    const writePromises = Promise.all(["0", "00", "000", "0000", "00000"].map(async (offset) => {
      const content2 = offset + newContent;
      const contentBuffer = VSBuffer.fromString(content2).buffer;
      const fd = await provider.open(resource, { create: true, unlock: false });
      try {
        await provider.write(fd, 0, VSBuffer.fromString(content2).buffer, 0, contentBuffer.byteLength);
        assert.strictEqual((await promises.readFile(resource.fsPath)).toString(), content2);
      } finally {
        await provider.close(fd);
      }
    }));
    await Promise.all([writePromises]);
  });
  test("provider - write barrier is partitioned per resource", async () => {
    const resource1 = URI.file(join(testDir, "lorem.txt"));
    const resource2 = URI.file(join(testDir, "test.txt"));
    const provider = service.getProvider(resource1.scheme);
    assert.ok(provider);
    assert.ok(hasOpenReadWriteCloseCapability(provider));
    const fd1 = await provider.open(resource1, { create: true, unlock: false });
    const fd2 = await provider.open(resource2, { create: true, unlock: false });
    const newContent = "Hello World";
    try {
      await provider.write(fd1, 0, VSBuffer.fromString(newContent).buffer, 0, VSBuffer.fromString(newContent).buffer.byteLength);
      assert.strictEqual((await promises.readFile(resource1.fsPath)).toString(), newContent);
      await provider.write(fd2, 0, VSBuffer.fromString(newContent).buffer, 0, VSBuffer.fromString(newContent).buffer.byteLength);
      assert.strictEqual((await promises.readFile(resource2.fsPath)).toString(), newContent);
    } finally {
      await Promise.allSettled([
        await provider.close(fd1),
        await provider.close(fd2)
      ]);
    }
  });
  test("provider - write barrier not becoming stale", async () => {
    const newFolder = join(testDir, "new-folder");
    const newResource = URI.file(join(newFolder, "lorem.txt"));
    const provider = service.getProvider(newResource.scheme);
    assert.ok(provider);
    assert.ok(hasOpenReadWriteCloseCapability(provider));
    let error = void 0;
    try {
      await provider.open(newResource, { create: true, unlock: false });
    } catch (e) {
      error = e;
    }
    assert.ok(error);
    await promises.mkdir(newFolder);
    const content = readFileSync(URI.file(join(testDir, "lorem.txt")).fsPath);
    const newContent = content.toString() + content.toString();
    const newContentBuffer = VSBuffer.fromString(newContent).buffer;
    const fd = await provider.open(newResource, { create: true, unlock: false });
    try {
      await provider.write(fd, 0, newContentBuffer, 0, newContentBuffer.byteLength);
      assert.strictEqual((await promises.readFile(newResource.fsPath)).toString(), newContent);
    } finally {
      await provider.close(fd);
    }
  });
  test("provider - atomic reads (write pending when read starts)", async () => {
    const resource = URI.file(join(testDir, "lorem.txt"));
    const content = readFileSync(resource.fsPath);
    const newContent = content.toString() + content.toString();
    const newContentBuffer = VSBuffer.fromString(newContent).buffer;
    const provider = service.getProvider(resource.scheme);
    assert.ok(provider);
    assert.ok(hasOpenReadWriteCloseCapability(provider));
    assert.ok(hasFileAtomicReadCapability(provider));
    let atomicReadPromise = void 0;
    const fd = await provider.open(resource, { create: true, unlock: false });
    try {
      atomicReadPromise = provider.readFile(resource, { atomic: true });
      await timeout(20);
      await provider.write(fd, 0, newContentBuffer, 0, newContentBuffer.byteLength);
    } finally {
      await provider.close(fd);
    }
    assert.ok(atomicReadPromise);
    const atomicReadResult = await atomicReadPromise;
    assert.strictEqual(atomicReadResult.byteLength, newContentBuffer.byteLength);
  });
  test("provider - atomic reads (read pending when write starts)", async () => {
    const resource = URI.file(join(testDir, "lorem.txt"));
    const content = readFileSync(resource.fsPath);
    const newContent = content.toString() + content.toString();
    const newContentBuffer = VSBuffer.fromString(newContent).buffer;
    const provider = service.getProvider(resource.scheme);
    assert.ok(provider);
    assert.ok(hasOpenReadWriteCloseCapability(provider));
    assert.ok(hasFileAtomicReadCapability(provider));
    let atomicReadPromise = provider.readFile(resource, { atomic: true });
    const fdPromise = provider.open(resource, { create: true, unlock: false }).then(async (fd) => {
      try {
        return await provider.write(fd, 0, newContentBuffer, 0, newContentBuffer.byteLength);
      } finally {
        await provider.close(fd);
      }
    });
    let atomicReadResult = await atomicReadPromise;
    assert.strictEqual(atomicReadResult.byteLength, content.byteLength);
    await fdPromise;
    atomicReadPromise = provider.readFile(resource, { atomic: true });
    atomicReadResult = await atomicReadPromise;
    assert.strictEqual(atomicReadResult.byteLength, newContentBuffer.byteLength);
  });
  test("writeFile (readable) - default", async () => {
    return testWriteFileReadable();
  });
  test("writeFile (readable) - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testWriteFileReadable();
  });
  test("writeFile (readable) - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testWriteFileReadable();
  });
  async function testWriteFileReadable() {
    const resource = URI.file(join(testDir, "small.txt"));
    const content = readFileSync(resource.fsPath).toString();
    assert.strictEqual(content, "Small File");
    const newContent = "Updates to the small file";
    await service.writeFile(resource, toLineByLineReadable(newContent));
    assert.strictEqual(readFileSync(resource.fsPath).toString(), newContent);
  }
  test("writeFile (large file - readable) - default", async () => {
    return testWriteFileLargeReadable();
  });
  test("writeFile (large file - readable) - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testWriteFileLargeReadable();
  });
  test("writeFile (large file - readable) - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testWriteFileLargeReadable();
  });
  async function testWriteFileLargeReadable() {
    const resource = URI.file(join(testDir, "lorem.txt"));
    const content = readFileSync(resource.fsPath);
    const newContent = content.toString() + content.toString();
    const fileStat = await service.writeFile(resource, toLineByLineReadable(newContent));
    assert.strictEqual(fileStat.name, "lorem.txt");
    assert.strictEqual(readFileSync(resource.fsPath).toString(), newContent);
  }
  test("writeFile (stream) - default", async () => {
    return testWriteFileStream();
  });
  test("writeFile (stream) - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testWriteFileStream();
  });
  test("writeFile (stream) - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testWriteFileStream();
  });
  async function testWriteFileStream() {
    const source = URI.file(join(testDir, "small.txt"));
    const target = URI.file(join(testDir, "small-copy.txt"));
    const fileStat = await service.writeFile(target, streamToBufferReadableStream(createReadStream(source.fsPath)));
    assert.strictEqual(fileStat.name, "small-copy.txt");
    const targetContents = readFileSync(target.fsPath).toString();
    assert.strictEqual(readFileSync(source.fsPath).toString(), targetContents);
  }
  test("writeFile (large file - stream) - default", async () => {
    return testWriteFileLargeStream();
  });
  test("writeFile (large file - stream) - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testWriteFileLargeStream();
  });
  test("writeFile (large file - stream) - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testWriteFileLargeStream();
  });
  async function testWriteFileLargeStream() {
    const source = URI.file(join(testDir, "lorem.txt"));
    const target = URI.file(join(testDir, "lorem-copy.txt"));
    const fileStat = await service.writeFile(target, streamToBufferReadableStream(createReadStream(source.fsPath)));
    assert.strictEqual(fileStat.name, "lorem-copy.txt");
    const targetContents = readFileSync(target.fsPath).toString();
    assert.strictEqual(readFileSync(source.fsPath).toString(), targetContents);
  }
  test("writeFile (file is created including parents)", async () => {
    const resource = URI.file(join(testDir, "other", "newfile.txt"));
    const content = "File is created including parent";
    const fileStat = await service.writeFile(resource, VSBuffer.fromString(content));
    assert.strictEqual(fileStat.name, "newfile.txt");
    assert.strictEqual(readFileSync(resource.fsPath).toString(), content);
  });
  test("writeFile - locked files and unlocking", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileWriteUnlock);
    return testLockedFiles(false);
  });
  test("writeFile (stream) - locked files and unlocking", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.FileWriteUnlock);
    return testLockedFiles(false);
  });
  test("writeFile - locked files and unlocking throws error when missing capability", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testLockedFiles(true);
  });
  test("writeFile (stream) - locked files and unlocking throws error when missing capability", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testLockedFiles(true);
  });
  async function testLockedFiles(expectError) {
    const lockedFile = URI.file(join(testDir, "my-locked-file"));
    const content = await service.writeFile(lockedFile, VSBuffer.fromString("Locked File"));
    assert.strictEqual(content.locked, false);
    const stats = await promises.stat(lockedFile.fsPath);
    await promises.chmod(lockedFile.fsPath, stats.mode & ~128);
    let stat = await service.stat(lockedFile);
    assert.strictEqual(stat.locked, true);
    let error;
    const newContent = "Updates to locked file";
    try {
      await service.writeFile(lockedFile, VSBuffer.fromString(newContent));
    } catch (e) {
      error = e;
    }
    assert.ok(error);
    error = void 0;
    if (expectError) {
      try {
        await service.writeFile(lockedFile, VSBuffer.fromString(newContent), { unlock: true });
      } catch (e) {
        error = e;
      }
      assert.ok(error);
    } else {
      await service.writeFile(lockedFile, VSBuffer.fromString(newContent), { unlock: true });
      assert.strictEqual(readFileSync(lockedFile.fsPath).toString(), newContent);
      stat = await service.stat(lockedFile);
      assert.strictEqual(stat.locked, false);
    }
  }
  test("writeFile (error when folder is encountered)", async () => {
    const resource = URI.file(testDir);
    let error = void 0;
    try {
      await service.writeFile(resource, VSBuffer.fromString("File is created including parent"));
    } catch (err) {
      error = err;
    }
    assert.ok(error);
  });
  test("writeFile (no error when providing up to date etag)", async () => {
    const resource = URI.file(join(testDir, "small.txt"));
    const stat = await service.resolve(resource);
    const content = readFileSync(resource.fsPath).toString();
    assert.strictEqual(content, "Small File");
    const newContent = "Updates to the small file";
    await service.writeFile(resource, VSBuffer.fromString(newContent), { etag: stat.etag, mtime: stat.mtime });
    assert.strictEqual(readFileSync(resource.fsPath).toString(), newContent);
  });
  test("writeFile - error when writing to file that has been updated meanwhile", async () => {
    const resource = URI.file(join(testDir, "small.txt"));
    const stat = await service.resolve(resource);
    const content = readFileSync(resource.fsPath).toString();
    assert.strictEqual(content, "Small File");
    const newContent = "Updates to the small file";
    await service.writeFile(resource, VSBuffer.fromString(newContent), { etag: stat.etag, mtime: stat.mtime });
    const newContentLeadingToError = newContent + newContent;
    const fakeMtime = 1e3;
    const fakeSize = 1e3;
    let error = void 0;
    try {
      await service.writeFile(resource, VSBuffer.fromString(newContentLeadingToError), { etag: etag({ mtime: fakeMtime, size: fakeSize }), mtime: fakeMtime });
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.ok(error instanceof FileOperationError);
    assert.strictEqual(error.fileOperationResult, FileOperationResult.FILE_MODIFIED_SINCE);
  });
  test("writeFile - no error when writing to file where size is the same", async () => {
    const resource = URI.file(join(testDir, "small.txt"));
    const stat = await service.resolve(resource);
    const content = readFileSync(resource.fsPath).toString();
    assert.strictEqual(content, "Small File");
    const newContent = content;
    await service.writeFile(resource, VSBuffer.fromString(newContent), { etag: stat.etag, mtime: stat.mtime });
    const newContentLeadingToNoError = newContent;
    const fakeMtime = 1e3;
    const actualSize = newContent.length;
    let error = void 0;
    try {
      await service.writeFile(resource, VSBuffer.fromString(newContentLeadingToNoError), { etag: etag({ mtime: fakeMtime, size: actualSize }), mtime: fakeMtime });
    } catch (err) {
      error = err;
    }
    assert.ok(!error);
  });
  test("writeFile - no error when writing to file where content is the same", async () => {
    const resource = URI.file(join(testDir, "small.txt"));
    await service.resolve(resource);
    const content = readFileSync(resource.fsPath).toString();
    assert.strictEqual(content, "Small File");
    const newContent = content;
    let error = void 0;
    try {
      await service.writeFile(
        resource,
        VSBuffer.fromString(newContent),
        { etag: "anything", mtime: 0 }
        /* fake it */
      );
    } catch (err) {
      error = err;
    }
    assert.ok(!error);
  });
  test("writeFile - error when writing to file where content is the same length but different", async () => {
    const resource = URI.file(join(testDir, "small.txt"));
    await service.resolve(resource);
    const content = readFileSync(resource.fsPath).toString();
    assert.strictEqual(content, "Small File");
    const newContent = content.split("").reverse().join("");
    let error = void 0;
    try {
      await service.writeFile(
        resource,
        VSBuffer.fromString(newContent),
        { etag: "anything", mtime: 0 }
        /* fake it */
      );
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.ok(error instanceof FileOperationError);
    assert.strictEqual(error.fileOperationResult, FileOperationResult.FILE_MODIFIED_SINCE);
  });
  test("writeFile - no error when writing to same nonexistent folder multiple times different new files", async () => {
    const newFolder = URI.file(join(testDir, "some", "new", "folder"));
    const file1 = joinPath(newFolder, "file-1");
    const file2 = joinPath(newFolder, "file-2");
    const file3 = joinPath(newFolder, "file-3");
    const newContent = "Updates to the small file";
    await Promise.all([
      service.writeFile(file1, VSBuffer.fromString(newContent)),
      service.writeFile(file2, VSBuffer.fromString(newContent)),
      service.writeFile(file3, VSBuffer.fromString(newContent))
    ]);
    assert.ok(service.exists(file1));
    assert.ok(service.exists(file2));
    assert.ok(service.exists(file3));
  });
  test("writeFile - error when writing to folder that is a file", async () => {
    const existingFile = URI.file(join(testDir, "my-file"));
    await service.createFile(existingFile);
    const newFile = joinPath(existingFile, "file-1");
    let error;
    const newContent = "Updates to the small file";
    try {
      await service.writeFile(newFile, VSBuffer.fromString(newContent));
    } catch (e) {
      error = e;
    }
    assert.ok(error);
  });
  test("appendFile", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileAppend);
    return testAppendFile();
  });
  test("appendFile - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.FileAppend);
    return testAppendFile();
  });
  async function testAppendFile() {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const resource = URI.file(join(testDir, "small.txt"));
    const content = readFileSync(resource.fsPath).toString();
    assert.strictEqual(content, "Small File");
    const appendContent = " - Appended!";
    await service.writeFile(resource, VSBuffer.fromString(appendContent), { append: true });
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, resource.fsPath);
    assert.strictEqual(event.operation, FileOperation.WRITE);
    assert.strictEqual(readFileSync(resource.fsPath).toString(), "Small File - Appended!");
  }
  test("appendFile (readable)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileAppend);
    return testAppendFileReadable();
  });
  test("appendFile (readable) - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.FileAppend);
    return testAppendFileReadable();
  });
  async function testAppendFileReadable() {
    const resource = URI.file(join(testDir, "small.txt"));
    const content = readFileSync(resource.fsPath).toString();
    assert.strictEqual(content, "Small File");
    const appendContent = " - Appended via readable!";
    await service.writeFile(resource, bufferToReadable(VSBuffer.fromString(appendContent)), { append: true });
    assert.strictEqual(readFileSync(resource.fsPath).toString(), "Small File - Appended via readable!");
  }
  test("appendFile (stream)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileAppend);
    return testAppendFileStream();
  });
  test("appendFile (stream) - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.FileAppend);
    return testAppendFileStream();
  });
  async function testAppendFileStream() {
    const resource = URI.file(join(testDir, "small.txt"));
    const content = readFileSync(resource.fsPath).toString();
    assert.strictEqual(content, "Small File");
    const appendContent = " - Appended via stream!";
    await service.writeFile(resource, bufferToStream(VSBuffer.fromString(appendContent)), { append: true });
    assert.strictEqual(readFileSync(resource.fsPath).toString(), "Small File - Appended via stream!");
  }
  test("appendFile - creates file if not exists", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileAppend);
    return testAppendFileCreatesFile();
  });
  test("appendFile - creates file if not exists (buffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.FileAppend);
    return testAppendFileCreatesFile();
  });
  async function testAppendFileCreatesFile() {
    const resource = URI.file(join(testDir, "appendfile-new.txt"));
    assert.strictEqual(existsSync(resource.fsPath), false);
    const content = "Initial content via append";
    await service.writeFile(resource, VSBuffer.fromString(content), { append: true });
    assert.strictEqual(existsSync(resource.fsPath), true);
    assert.strictEqual(readFileSync(resource.fsPath).toString(), content);
  }
  test("appendFile - multiple appends", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileAppend);
    return testAppendFileMultiple();
  });
  test("appendFile - multiple appends (buffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.FileAppend);
    return testAppendFileMultiple();
  });
  async function testAppendFileMultiple() {
    const resource = URI.file(join(testDir, "appendfile-multiple.txt"));
    await service.writeFile(resource, VSBuffer.fromString("Line 1\n"), { append: true });
    await service.writeFile(resource, VSBuffer.fromString("Line 2\n"), { append: true });
    await service.writeFile(resource, VSBuffer.fromString("Line 3\n"), { append: true });
    assert.strictEqual(readFileSync(resource.fsPath).toString(), "Line 1\nLine 2\nLine 3\n");
  }
  test("appendFile - throws when provider does not support append", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    const resource = URI.file(join(testDir, "small.txt"));
    const appendContent = " - Appended via fallback!";
    let error;
    try {
      await service.writeFile(resource, VSBuffer.fromString(appendContent), { append: true });
    } catch (e) {
      error = e;
    }
    assert.ok(error);
    assert.ok(error.message.includes("does not support append"));
  });
  test("read - mixed positions", async () => {
    const resource = URI.file(join(testDir, "lorem.txt"));
    let buffer = VSBuffer.alloc(1024);
    let fd = await fileProvider.open(resource, { create: false });
    for (let i = 0; i < 3; i++) {
      await fileProvider.read(fd, 0, buffer.buffer, 0, 26);
      assert.strictEqual(buffer.slice(0, 26).toString(), "Lorem ipsum dolor sit amet");
    }
    await fileProvider.close(fd);
    buffer = VSBuffer.alloc(1024);
    fd = await fileProvider.open(resource, { create: false });
    let posInFile = 0;
    await fileProvider.read(fd, posInFile, buffer.buffer, 0, 26);
    assert.strictEqual(buffer.slice(0, 26).toString(), "Lorem ipsum dolor sit amet");
    posInFile += 26;
    await fileProvider.read(fd, posInFile, buffer.buffer, 0, 1);
    assert.strictEqual(buffer.slice(0, 1).toString(), ",");
    posInFile += 1;
    await fileProvider.read(fd, posInFile, buffer.buffer, 0, 12);
    assert.strictEqual(buffer.slice(0, 12).toString(), " consectetur");
    posInFile += 12;
    await fileProvider.read(fd, 98, buffer.buffer, 0, 9);
    assert.strictEqual(buffer.slice(0, 9).toString(), "fermentum");
    await fileProvider.read(fd, 27, buffer.buffer, 0, 12);
    assert.strictEqual(buffer.slice(0, 12).toString(), " consectetur");
    await fileProvider.read(fd, 26, buffer.buffer, 0, 1);
    assert.strictEqual(buffer.slice(0, 1).toString(), ",");
    await fileProvider.read(fd, 0, buffer.buffer, 0, 26);
    assert.strictEqual(buffer.slice(0, 26).toString(), "Lorem ipsum dolor sit amet");
    await fileProvider.read(fd, posInFile, buffer.buffer, 0, 11);
    assert.strictEqual(buffer.slice(0, 11).toString(), " adipiscing");
    await fileProvider.close(fd);
  });
  test("write - mixed positions", async () => {
    const resource = URI.file(join(testDir, "lorem.txt"));
    const buffer = VSBuffer.alloc(1024);
    const fdWrite = await fileProvider.open(resource, { create: true, unlock: false });
    const fdRead = await fileProvider.open(resource, { create: false });
    let posInFileWrite = 0;
    let posInFileRead = 0;
    const initialContents = VSBuffer.fromString("Lorem ipsum dolor sit amet");
    await fileProvider.write(fdWrite, posInFileWrite, initialContents.buffer, 0, initialContents.byteLength);
    posInFileWrite += initialContents.byteLength;
    await fileProvider.read(fdRead, posInFileRead, buffer.buffer, 0, 26);
    assert.strictEqual(buffer.slice(0, 26).toString(), "Lorem ipsum dolor sit amet");
    posInFileRead += 26;
    const contents = VSBuffer.fromString("Hello World");
    await fileProvider.write(fdWrite, posInFileWrite, contents.buffer, 0, contents.byteLength);
    posInFileWrite += contents.byteLength;
    await fileProvider.read(fdRead, posInFileRead, buffer.buffer, 0, contents.byteLength);
    assert.strictEqual(buffer.slice(0, contents.byteLength).toString(), "Hello World");
    posInFileRead += contents.byteLength;
    await fileProvider.write(fdWrite, 6, contents.buffer, 0, contents.byteLength);
    await fileProvider.read(fdRead, 0, buffer.buffer, 0, 11);
    assert.strictEqual(buffer.slice(0, 11).toString(), "Lorem Hello");
    await fileProvider.write(fdWrite, posInFileWrite, contents.buffer, 0, contents.byteLength);
    posInFileWrite += contents.byteLength;
    await fileProvider.read(fdRead, posInFileWrite - contents.byteLength, buffer.buffer, 0, contents.byteLength);
    assert.strictEqual(buffer.slice(0, contents.byteLength).toString(), "Hello World");
    await fileProvider.close(fdWrite);
    await fileProvider.close(fdRead);
  });
  test("readonly - is handled properly for a single resource", async () => {
    fileProvider.setReadonly(true);
    const resource = URI.file(join(testDir, "index.html"));
    const resolveResult = await service.resolve(resource);
    assert.strictEqual(resolveResult.readonly, true);
    const readResult = await service.readFile(resource);
    assert.strictEqual(readResult.readonly, true);
    let writeFileError = void 0;
    try {
      await service.writeFile(resource, VSBuffer.fromString("Hello Test"));
    } catch (error) {
      writeFileError = error;
    }
    assert.ok(writeFileError);
    let deleteFileError = void 0;
    try {
      await service.del(resource);
    } catch (error) {
      deleteFileError = error;
    }
    assert.ok(deleteFileError);
  });
});
export {
  TestDiskFileSystemProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZmlsZXNcXHRlc3RcXG5vZGVcXGRpc2tGaWxlU2VydmljZS5pbnRlZ3JhdGlvblRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBjcmVhdGVSZWFkU3RyZWFtLCBleGlzdHNTeW5jLCByZWFkZGlyU3luYywgcmVhZEZpbGVTeW5jLCBzdGF0U3luYywgd3JpdGVGaWxlU3luYywgcHJvbWlzZXMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgYnVmZmVyVG9SZWFkYWJsZSwgYnVmZmVyVG9TdHJlYW0sIHN0cmVhbVRvQnVmZmVyLCBzdHJlYW1Ub0J1ZmZlclJlYWRhYmxlU3RyZWFtLCBWU0J1ZmZlciwgVlNCdWZmZXJSZWFkYWJsZSwgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcywgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGRpcm5hbWUsIGpvaW4sIHBvc2l4IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc0xpbnV4LCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL25vZGUvcGZzLmpzJztcbmltcG9ydCB7IGZsYWt5U3VpdGUsIGdldFJhbmRvbVRlc3RQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L25vZGUvdGVzdFV0aWxzLmpzJztcbmltcG9ydCB7IGV0YWcsIElGaWxlQXRvbWljUmVhZE9wdGlvbnMsIEZpbGVPcGVyYXRpb24sIEZpbGVPcGVyYXRpb25FcnJvciwgRmlsZU9wZXJhdGlvbkV2ZW50LCBGaWxlT3BlcmF0aW9uUmVzdWx0LCBGaWxlUGVybWlzc2lvbiwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLCBoYXNGaWxlQXRvbWljUmVhZENhcGFiaWxpdHksIGhhc09wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHksIElGaWxlU3RhdCwgSUZpbGVTdGF0V2l0aE1ldGFkYXRhLCBJUmVhZEZpbGVPcHRpb25zLCBJU3RhdCwgTm90TW9kaWZpZWRTaW5jZUZpbGVPcGVyYXRpb25FcnJvciwgVG9vTGFyZ2VGaWxlT3BlcmF0aW9uRXJyb3IsIElGaWxlQXRvbWljT3B0aW9ucyB9IGZyb20gJy4uLy4uL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBEaXNrRmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vbm9kZS9kaXNrRmlsZVN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuXG5mdW5jdGlvbiBnZXRCeU5hbWUocm9vdDogSUZpbGVTdGF0LCBuYW1lOiBzdHJpbmcpOiBJRmlsZVN0YXQgfCB1bmRlZmluZWQge1xuXHRpZiAocm9vdC5jaGlsZHJlbiA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHJldHVybiByb290LmNoaWxkcmVuLmZpbmQoY2hpbGQgPT4gY2hpbGQubmFtZSA9PT0gbmFtZSk7XG59XG5cbmZ1bmN0aW9uIHRvTGluZUJ5TGluZVJlYWRhYmxlKGNvbnRlbnQ6IHN0cmluZyk6IFZTQnVmZmVyUmVhZGFibGUge1xuXHRsZXQgY2h1bmtzID0gY29udGVudC5zcGxpdCgnXFxuJyk7XG5cdGNodW5rcyA9IGNodW5rcy5tYXAoKGNodW5rLCBpbmRleCkgPT4ge1xuXHRcdGlmIChpbmRleCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGNodW5rO1xuXHRcdH1cblxuXHRcdHJldHVybiAnXFxuJyArIGNodW5rO1xuXHR9KTtcblxuXHRyZXR1cm4ge1xuXHRcdHJlYWQoKTogVlNCdWZmZXIgfCBudWxsIHtcblx0XHRcdGNvbnN0IGNodW5rID0gY2h1bmtzLnNoaWZ0KCk7XG5cdFx0XHRpZiAodHlwZW9mIGNodW5rID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRyZXR1cm4gVlNCdWZmZXIuZnJvbVN0cmluZyhjaHVuayk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0fTtcbn1cblxuZXhwb3J0IGNsYXNzIFRlc3REaXNrRmlsZVN5c3RlbVByb3ZpZGVyIGV4dGVuZHMgRGlza0ZpbGVTeXN0ZW1Qcm92aWRlciB7XG5cblx0dG90YWxCeXRlc1JlYWQ6IG51bWJlciA9IDA7XG5cblx0cHJpdmF0ZSBpbnZhbGlkU3RhdFNpemU6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBzbWFsbFN0YXRTaXplOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHk6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRwcml2YXRlIF90ZXN0Q2FwYWJpbGl0aWVzITogRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzO1xuXHRvdmVycmlkZSBnZXQgY2FwYWJpbGl0aWVzKCk6IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcyB7XG5cdFx0aWYgKCF0aGlzLl90ZXN0Q2FwYWJpbGl0aWVzKSB7XG5cdFx0XHR0aGlzLl90ZXN0Q2FwYWJpbGl0aWVzID1cblx0XHRcdFx0RmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUgfFxuXHRcdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSB8XG5cdFx0XHRcdEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFN0cmVhbSB8XG5cdFx0XHRcdEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5UcmFzaCB8XG5cdFx0XHRcdEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlRm9sZGVyQ29weSB8XG5cdFx0XHRcdEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlV3JpdGVVbmxvY2sgfFxuXHRcdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUF0b21pY1JlYWQgfFxuXHRcdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUF0b21pY1dyaXRlIHxcblx0XHRcdFx0RmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVBdG9taWNEZWxldGUgfFxuXHRcdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUNsb25lIHxcblx0XHRcdFx0RmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVBcHBlbmQgfFxuXHRcdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWxwYXRoO1xuXG5cdFx0XHRpZiAoaXNMaW51eCkge1xuXHRcdFx0XHR0aGlzLl90ZXN0Q2FwYWJpbGl0aWVzIHw9IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5QYXRoQ2FzZVNlbnNpdGl2ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fdGVzdENhcGFiaWxpdGllcztcblx0fVxuXG5cdG92ZXJyaWRlIHNldCBjYXBhYmlsaXRpZXMoY2FwYWJpbGl0aWVzOiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMpIHtcblx0XHR0aGlzLl90ZXN0Q2FwYWJpbGl0aWVzID0gY2FwYWJpbGl0aWVzO1xuXHR9XG5cblx0c2V0SW52YWxpZFN0YXRTaXplKGVuYWJsZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmludmFsaWRTdGF0U2l6ZSA9IGVuYWJsZWQ7XG5cdH1cblxuXHRzZXRTbWFsbFN0YXRTaXplKGVuYWJsZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLnNtYWxsU3RhdFNpemUgPSBlbmFibGVkO1xuXHR9XG5cblx0c2V0UmVhZG9ubHkocmVhZG9ubHk6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLnJlYWRvbmx5ID0gcmVhZG9ubHk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBzdGF0KHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElTdGF0PiB7XG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgc3VwZXIuc3RhdChyZXNvdXJjZSk7XG5cblx0XHRpZiAodGhpcy5pbnZhbGlkU3RhdFNpemUpIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0KHJlcyBhcyBhbnkpLnNpemUgPSBTdHJpbmcocmVzLnNpemUpIGFzIGFueTsgLy8gZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy83MjkwOVxuXHRcdH0gZWxzZSBpZiAodGhpcy5zbWFsbFN0YXRTaXplKSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdChyZXMgYXMgYW55KS5zaXplID0gMTtcblx0XHR9IGVsc2UgaWYgKHRoaXMucmVhZG9ubHkpIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0KHJlcyBhcyBhbnkpLnBlcm1pc3Npb25zID0gRmlsZVBlcm1pc3Npb24uUmVhZG9ubHk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlcztcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJlYWQoZmQ6IG51bWJlciwgcG9zOiBudW1iZXIsIGRhdGE6IFVpbnQ4QXJyYXksIG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcik6IFByb21pc2U8bnVtYmVyPiB7XG5cdFx0Y29uc3QgYnl0ZXNSZWFkID0gYXdhaXQgc3VwZXIucmVhZChmZCwgcG9zLCBkYXRhLCBvZmZzZXQsIGxlbmd0aCk7XG5cblx0XHR0aGlzLnRvdGFsQnl0ZXNSZWFkICs9IGJ5dGVzUmVhZDtcblxuXHRcdHJldHVybiBieXRlc1JlYWQ7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyByZWFkRmlsZShyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSUZpbGVBdG9taWNSZWFkT3B0aW9ucyk6IFByb21pc2U8VWludDhBcnJheT4ge1xuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHN1cGVyLnJlYWRGaWxlKHJlc291cmNlLCBvcHRpb25zKTtcblxuXHRcdHRoaXMudG90YWxCeXRlc1JlYWQgKz0gcmVzLmJ5dGVMZW5ndGg7XG5cblx0XHRyZXR1cm4gcmVzO1xuXHR9XG59XG5cbkRpc2tGaWxlU3lzdGVtUHJvdmlkZXIuY29uZmlndXJlRmx1c2hPbldyaXRlKGZhbHNlKTsgLy8gc3BlZWQgdXAgYWxsIHVuaXQgdGVzdHMgYnkgZGlzYWJsaW5nIGZsdXNoIG9uIHdyaXRlXG5cbmZsYWt5U3VpdGUoJ0Rpc2sgRmlsZSBTZXJ2aWNlJywgZnVuY3Rpb24gKCkge1xuXG5cdGNvbnN0IHRlc3RTY2hlbWEgPSAndGVzdCc7XG5cblx0bGV0IHNlcnZpY2U6IEZpbGVTZXJ2aWNlO1xuXHRsZXQgZmlsZVByb3ZpZGVyOiBUZXN0RGlza0ZpbGVTeXN0ZW1Qcm92aWRlcjtcblx0bGV0IHRlc3RQcm92aWRlcjogVGVzdERpc2tGaWxlU3lzdGVtUHJvdmlkZXI7XG5cblx0bGV0IHRlc3REaXI6IHN0cmluZztcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXG5cdFx0c2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobG9nU2VydmljZSkpO1xuXG5cdFx0ZmlsZVByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0RGlza0ZpbGVTeXN0ZW1Qcm92aWRlcihsb2dTZXJ2aWNlKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmZpbGUsIGZpbGVQcm92aWRlcikpO1xuXG5cdFx0dGVzdFByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0RGlza0ZpbGVTeXN0ZW1Qcm92aWRlcihsb2dTZXJ2aWNlKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcih0ZXN0U2NoZW1hLCB0ZXN0UHJvdmlkZXIpKTtcblxuXHRcdHRlc3REaXIgPSBnZXRSYW5kb21UZXN0UGF0aCh0bXBkaXIoKSwgJ3ZzY3Rlc3RzJywgJ2Rpc2tmaWxlc2VydmljZScpO1xuXG5cdFx0Y29uc3Qgc291cmNlRGlyID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3BsYXRmb3JtL2ZpbGVzL3Rlc3Qvbm9kZS9maXh0dXJlcy9zZXJ2aWNlJykuZnNQYXRoO1xuXG5cdFx0YXdhaXQgUHJvbWlzZXMuY29weShzb3VyY2VEaXIsIHRlc3REaXIsIHsgcHJlc2VydmVTeW1saW5rczogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0cmV0dXJuIFByb21pc2VzLnJtKHRlc3REaXIpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVGb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGV2ZW50OiBGaWxlT3BlcmF0aW9uRXZlbnQgfCB1bmRlZmluZWQ7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSdW5PcGVyYXRpb24oZSA9PiBldmVudCA9IGUpKTtcblxuXHRcdGNvbnN0IHBhcmVudCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShVUkkuZmlsZSh0ZXN0RGlyKSk7XG5cblx0XHRjb25zdCBuZXdGb2xkZXJSZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4ocGFyZW50LnJlc291cmNlLmZzUGF0aCwgJ25ld0ZvbGRlcicpKTtcblxuXHRcdGNvbnN0IG5ld0ZvbGRlciA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlRm9sZGVyKG5ld0ZvbGRlclJlc291cmNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXdGb2xkZXIubmFtZSwgJ25ld0ZvbGRlcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKG5ld0ZvbGRlci5yZXNvdXJjZS5mc1BhdGgpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5vayhldmVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LnJlc291cmNlLmZzUGF0aCwgbmV3Rm9sZGVyUmVzb3VyY2UuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQub3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uLkNSRUFURSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LnRhcmdldCEucmVzb3VyY2UuZnNQYXRoLCBuZXdGb2xkZXJSZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC50YXJnZXQhLmlzRGlyZWN0b3J5LCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlRm9sZGVyOiBjcmVhdGluZyBtdWx0aXBsZSBmb2xkZXJzIGF0IG9uY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGV2ZW50OiBGaWxlT3BlcmF0aW9uRXZlbnQ7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSdW5PcGVyYXRpb24oZSA9PiBldmVudCA9IGUpKTtcblxuXHRcdGNvbnN0IG11bHRpRm9sZGVyUGF0aHMgPSBbJ2EnLCAnY291cGxlJywgJ29mJywgJ2ZvbGRlcnMnXTtcblx0XHRjb25zdCBwYXJlbnQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUoVVJJLmZpbGUodGVzdERpcikpO1xuXG5cdFx0Y29uc3QgbmV3Rm9sZGVyUmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHBhcmVudC5yZXNvdXJjZS5mc1BhdGgsIC4uLm11bHRpRm9sZGVyUGF0aHMpKTtcblxuXHRcdGNvbnN0IG5ld0ZvbGRlciA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlRm9sZGVyKG5ld0ZvbGRlclJlc291cmNlKTtcblxuXHRcdGNvbnN0IGxhc3RGb2xkZXJOYW1lID0gbXVsdGlGb2xkZXJQYXRoc1ttdWx0aUZvbGRlclBhdGhzLmxlbmd0aCAtIDFdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXdGb2xkZXIubmFtZSwgbGFzdEZvbGRlck5hbWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKG5ld0ZvbGRlci5yZXNvdXJjZS5mc1BhdGgpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5vayhldmVudCEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEucmVzb3VyY2UuZnNQYXRoLCBuZXdGb2xkZXJSZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEub3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uLkNSRUFURSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS50YXJnZXQhLnJlc291cmNlLmZzUGF0aCwgbmV3Rm9sZGVyUmVzb3VyY2UuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLnRhcmdldCEuaXNEaXJlY3RvcnksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGV4aXN0cyA9IGF3YWl0IHNlcnZpY2UuZXhpc3RzKFVSSS5maWxlKHRlc3REaXIpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzLCB0cnVlKTtcblxuXHRcdGV4aXN0cyA9IGF3YWl0IHNlcnZpY2UuZXhpc3RzKFVSSS5maWxlKHRlc3REaXIgKyAnc29tZXRoaW5nJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHMsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZSAtIGZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvcGxhdGZvcm0vZmlsZXMvdGVzdC9ub2RlL2ZpeHR1cmVzL3Jlc29sdmVyL2luZGV4Lmh0bWwnKTtcblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShyZXNvdXJjZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWQubmFtZSwgJ2luZGV4Lmh0bWwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWQuaXNGaWxlLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWQuaXNEaXJlY3RvcnksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWQucmVhZG9ubHksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWQuaXNTeW1ib2xpY0xpbmssIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWQucmVzb3VyY2UudG9TdHJpbmcoKSwgcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLmNoaWxkcmVuLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5vayhyZXNvbHZlZC5tdGltZSEgPiAwKTtcblx0XHRhc3NlcnQub2socmVzb2x2ZWQuY3RpbWUhID4gMCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc29sdmVkLnNpemUhID4gMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmUgLSBkaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdHNFbGVtZW50cyA9IFsnZXhhbXBsZXMnLCAnb3RoZXInLCAnaW5kZXguaHRtbCcsICdzaXRlLmNzcyddO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvcGxhdGZvcm0vZmlsZXMvdGVzdC9ub2RlL2ZpeHR1cmVzL3Jlc29sdmVyJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKHJlc291cmNlKTtcblxuXHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucmVzb3VyY2UudG9TdHJpbmcoKSwgcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5uYW1lLCAncmVzb2x2ZXInKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmNoaWxkcmVuKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmNoaWxkcmVuLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaXNEaXJlY3RvcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucmVhZG9ubHksIGZhbHNlKTtcblx0XHRhc3NlcnQub2socmVzdWx0Lm10aW1lISA+IDApO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuY3RpbWUhID4gMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jaGlsZHJlbi5sZW5ndGgsIHRlc3RzRWxlbWVudHMubGVuZ3RoKTtcblxuXHRcdGFzc2VydC5vayhyZXN1bHQuY2hpbGRyZW4uZXZlcnkoZW50cnkgPT4ge1xuXHRcdFx0cmV0dXJuIHRlc3RzRWxlbWVudHMuc29tZShuYW1lID0+IHtcblx0XHRcdFx0cmV0dXJuIGJhc2VuYW1lKGVudHJ5LnJlc291cmNlLmZzUGF0aCkgPT09IG5hbWU7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHRyZXN1bHQuY2hpbGRyZW4uZm9yRWFjaCh2YWx1ZSA9PiB7XG5cdFx0XHRhc3NlcnQub2soYmFzZW5hbWUodmFsdWUucmVzb3VyY2UuZnNQYXRoKSk7XG5cdFx0XHRpZiAoWydleGFtcGxlcycsICdvdGhlciddLmluZGV4T2YoYmFzZW5hbWUodmFsdWUucmVzb3VyY2UuZnNQYXRoKSkgPj0gMCkge1xuXHRcdFx0XHRhc3NlcnQub2sodmFsdWUuaXNEaXJlY3RvcnkpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubXRpbWUsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5jdGltZSwgdW5kZWZpbmVkKTtcblx0XHRcdH0gZWxzZSBpZiAoYmFzZW5hbWUodmFsdWUucmVzb3VyY2UuZnNQYXRoKSA9PT0gJ2luZGV4Lmh0bWwnKSB7XG5cdFx0XHRcdGFzc2VydC5vayghdmFsdWUuaXNEaXJlY3RvcnkpO1xuXHRcdFx0XHRhc3NlcnQub2soIXZhbHVlLmNoaWxkcmVuKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLm10aW1lLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuY3RpbWUsIHVuZGVmaW5lZCk7XG5cdFx0XHR9IGVsc2UgaWYgKGJhc2VuYW1lKHZhbHVlLnJlc291cmNlLmZzUGF0aCkgPT09ICdzaXRlLmNzcycpIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKCF2YWx1ZS5pc0RpcmVjdG9yeSk7XG5cdFx0XHRcdGFzc2VydC5vayghdmFsdWUuY2hpbGRyZW4pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubXRpbWUsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5jdGltZSwgdW5kZWZpbmVkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGFzc2VydC5mYWlsKCdVbmV4cGVjdGVkIHZhbHVlICcgKyBiYXNlbmFtZSh2YWx1ZS5yZXNvdXJjZS5mc1BhdGgpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZSAtIGRpcmVjdG9yeSAtIHdpdGggbWV0YWRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdHNFbGVtZW50cyA9IFsnZXhhbXBsZXMnLCAnb3RoZXInLCAnaW5kZXguaHRtbCcsICdzaXRlLmNzcyddO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy9wbGF0Zm9ybS9maWxlcy90ZXN0L25vZGUvZml4dHVyZXMvcmVzb2x2ZXInKSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm5hbWUsICdyZXNvbHZlcicpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuY2hpbGRyZW4pO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuY2hpbGRyZW4ubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pc0RpcmVjdG9yeSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5tdGltZSA+IDApO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuY3RpbWUgPiAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNoaWxkcmVuLmxlbmd0aCwgdGVzdHNFbGVtZW50cy5sZW5ndGgpO1xuXG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5jaGlsZHJlbi5ldmVyeShlbnRyeSA9PiB7XG5cdFx0XHRyZXR1cm4gdGVzdHNFbGVtZW50cy5zb21lKG5hbWUgPT4ge1xuXHRcdFx0XHRyZXR1cm4gYmFzZW5hbWUoZW50cnkucmVzb3VyY2UuZnNQYXRoKSA9PT0gbmFtZTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5vayhyZXN1bHQuY2hpbGRyZW4uZXZlcnkoZW50cnkgPT4gZW50cnkuZXRhZy5sZW5ndGggPiAwKSk7XG5cblx0XHRyZXN1bHQuY2hpbGRyZW4uZm9yRWFjaCh2YWx1ZSA9PiB7XG5cdFx0XHRhc3NlcnQub2soYmFzZW5hbWUodmFsdWUucmVzb3VyY2UuZnNQYXRoKSk7XG5cdFx0XHRpZiAoWydleGFtcGxlcycsICdvdGhlciddLmluZGV4T2YoYmFzZW5hbWUodmFsdWUucmVzb3VyY2UuZnNQYXRoKSkgPj0gMCkge1xuXHRcdFx0XHRhc3NlcnQub2sodmFsdWUuaXNEaXJlY3RvcnkpO1xuXHRcdFx0XHRhc3NlcnQub2sodmFsdWUubXRpbWUgPiAwKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHZhbHVlLmN0aW1lID4gMCk7XG5cdFx0XHR9IGVsc2UgaWYgKGJhc2VuYW1lKHZhbHVlLnJlc291cmNlLmZzUGF0aCkgPT09ICdpbmRleC5odG1sJykge1xuXHRcdFx0XHRhc3NlcnQub2soIXZhbHVlLmlzRGlyZWN0b3J5KTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCF2YWx1ZS5jaGlsZHJlbik7XG5cdFx0XHRcdGFzc2VydC5vayh2YWx1ZS5tdGltZSA+IDApO1xuXHRcdFx0XHRhc3NlcnQub2sodmFsdWUuY3RpbWUgPiAwKTtcblx0XHRcdH0gZWxzZSBpZiAoYmFzZW5hbWUodmFsdWUucmVzb3VyY2UuZnNQYXRoKSA9PT0gJ3NpdGUuY3NzJykge1xuXHRcdFx0XHRhc3NlcnQub2soIXZhbHVlLmlzRGlyZWN0b3J5KTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCF2YWx1ZS5jaGlsZHJlbik7XG5cdFx0XHRcdGFzc2VydC5vayh2YWx1ZS5tdGltZSA+IDApO1xuXHRcdFx0XHRhc3NlcnQub2sodmFsdWUuY3RpbWUgPiAwKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGFzc2VydC5mYWlsKCdVbmV4cGVjdGVkIHZhbHVlICcgKyBiYXNlbmFtZSh2YWx1ZS5yZXNvdXJjZS5mc1BhdGgpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZSAtIGRpcmVjdG9yeSB3aXRoIHJlc29sdmVUbycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShVUkkuZmlsZSh0ZXN0RGlyKSwgeyByZXNvbHZlVG86IFtVUkkuZmlsZShqb2luKHRlc3REaXIsICdkZWVwJykpXSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWQuY2hpbGRyZW4hLmxlbmd0aCwgOCk7XG5cblx0XHRjb25zdCBkZWVwID0gKGdldEJ5TmFtZShyZXNvbHZlZCwgJ2RlZXAnKSEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWVwLmNoaWxkcmVuIS5sZW5ndGgsIDQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlIC0gZGlyZWN0b3J5IC0gcmVzb2x2ZVRvIHNpbmdsZSBkaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb2x2ZXJGaXh0dXJlc1BhdGggPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvcGxhdGZvcm0vZmlsZXMvdGVzdC9ub2RlL2ZpeHR1cmVzL3Jlc29sdmVyJykuZnNQYXRoO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShVUkkuZmlsZShyZXNvbHZlckZpeHR1cmVzUGF0aCksIHsgcmVzb2x2ZVRvOiBbVVJJLmZpbGUoam9pbihyZXNvbHZlckZpeHR1cmVzUGF0aCwgJ290aGVyL2RlZXAnKSldIH0pO1xuXG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5jaGlsZHJlbik7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5jaGlsZHJlbi5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmlzRGlyZWN0b3J5KTtcblxuXHRcdGNvbnN0IGNoaWxkcmVuID0gcmVzdWx0LmNoaWxkcmVuO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGlsZHJlbi5sZW5ndGgsIDQpO1xuXG5cdFx0Y29uc3Qgb3RoZXIgPSBnZXRCeU5hbWUocmVzdWx0LCAnb3RoZXInKTtcblx0XHRhc3NlcnQub2sob3RoZXIpO1xuXHRcdGFzc2VydC5vayhvdGhlci5jaGlsZHJlbiEubGVuZ3RoID4gMCk7XG5cblx0XHRjb25zdCBkZWVwID0gZ2V0QnlOYW1lKG90aGVyLCAnZGVlcCcpO1xuXHRcdGFzc2VydC5vayhkZWVwKTtcblx0XHRhc3NlcnQub2soZGVlcC5jaGlsZHJlbiEubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZXAuY2hpbGRyZW4hLmxlbmd0aCwgNCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmUgZGlyZWN0b3J5IC0gcmVzb2x2ZVRvIG11bHRpcGxlIGRpcmVjdG9yaWVzJywgKCkgPT4ge1xuXHRcdHJldHVybiB0ZXN0UmVzb2x2ZURpcmVjdG9yeVdpdGhUYXJnZXQoZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlIGRpcmVjdG9yeSAtIHJlc29sdmVUbyB3aXRoIGEgVVJJIHRoYXQgaGFzIHF1ZXJ5IHBhcmFtZXRlciAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEyODE1MSknLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHRlc3RSZXNvbHZlRGlyZWN0b3J5V2l0aFRhcmdldCh0cnVlKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdFJlc29sdmVEaXJlY3RvcnlXaXRoVGFyZ2V0KHdpdGhRdWVyeVBhcmFtOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVzb2x2ZXJGaXh0dXJlc1BhdGggPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvcGxhdGZvcm0vZmlsZXMvdGVzdC9ub2RlL2ZpeHR1cmVzL3Jlc29sdmVyJykuZnNQYXRoO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShVUkkuZmlsZShyZXNvbHZlckZpeHR1cmVzUGF0aCkud2l0aCh7IHF1ZXJ5OiB3aXRoUXVlcnlQYXJhbSA/ICd0ZXN0JyA6IHVuZGVmaW5lZCB9KSwge1xuXHRcdFx0cmVzb2x2ZVRvOiBbXG5cdFx0XHRcdFVSSS5maWxlKGpvaW4ocmVzb2x2ZXJGaXh0dXJlc1BhdGgsICdvdGhlci9kZWVwJykpLndpdGgoeyBxdWVyeTogd2l0aFF1ZXJ5UGFyYW0gPyAndGVzdCcgOiB1bmRlZmluZWQgfSksXG5cdFx0XHRcdFVSSS5maWxlKGpvaW4ocmVzb2x2ZXJGaXh0dXJlc1BhdGgsICdleGFtcGxlcycpKS53aXRoKHsgcXVlcnk6IHdpdGhRdWVyeVBhcmFtID8gJ3Rlc3QnIDogdW5kZWZpbmVkIH0pXG5cdFx0XHRdXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRhc3NlcnQub2socmVzdWx0LmNoaWxkcmVuKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmNoaWxkcmVuLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaXNEaXJlY3RvcnkpO1xuXG5cdFx0Y29uc3QgY2hpbGRyZW4gPSByZXN1bHQuY2hpbGRyZW47XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoaWxkcmVuLmxlbmd0aCwgNCk7XG5cblx0XHRjb25zdCBvdGhlciA9IGdldEJ5TmFtZShyZXN1bHQsICdvdGhlcicpO1xuXHRcdGFzc2VydC5vayhvdGhlcik7XG5cdFx0YXNzZXJ0Lm9rKG90aGVyLmNoaWxkcmVuIS5sZW5ndGggPiAwKTtcblxuXHRcdGNvbnN0IGRlZXAgPSBnZXRCeU5hbWUob3RoZXIsICdkZWVwJyk7XG5cdFx0YXNzZXJ0Lm9rKGRlZXApO1xuXHRcdGFzc2VydC5vayhkZWVwLmNoaWxkcmVuIS5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVlcC5jaGlsZHJlbiEubGVuZ3RoLCA0KTtcblxuXHRcdGNvbnN0IGV4YW1wbGVzID0gZ2V0QnlOYW1lKHJlc3VsdCwgJ2V4YW1wbGVzJyk7XG5cdFx0YXNzZXJ0Lm9rKGV4YW1wbGVzKTtcblx0XHRhc3NlcnQub2soZXhhbXBsZXMuY2hpbGRyZW4hLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGFtcGxlcy5jaGlsZHJlbiEubGVuZ3RoLCA0KTtcblx0fVxuXG5cdHRlc3QoJ3Jlc29sdmUgZGlyZWN0b3J5IC0gcmVzb2x2ZVNpbmdsZUNoaWxkRm9sZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvbHZlckZpeHR1cmVzUGF0aCA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy9wbGF0Zm9ybS9maWxlcy90ZXN0L25vZGUvZml4dHVyZXMvcmVzb2x2ZXIvb3RoZXInKS5mc1BhdGg7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKFVSSS5maWxlKHJlc29sdmVyRml4dHVyZXNQYXRoKSwgeyByZXNvbHZlU2luZ2xlQ2hpbGREZXNjZW5kYW50czogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuY2hpbGRyZW4pO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuY2hpbGRyZW4ubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pc0RpcmVjdG9yeSk7XG5cblx0XHRjb25zdCBjaGlsZHJlbiA9IHJlc3VsdC5jaGlsZHJlbjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hpbGRyZW4ubGVuZ3RoLCAxKTtcblxuXHRcdGNvbnN0IGRlZXAgPSBnZXRCeU5hbWUocmVzdWx0LCAnZGVlcCcpO1xuXHRcdGFzc2VydC5vayhkZWVwKTtcblx0XHRhc3NlcnQub2soZGVlcC5jaGlsZHJlbiEubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZXAuY2hpbGRyZW4hLmxlbmd0aCwgNCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUFsbChbXG5cdFx0XHR7IHJlc291cmNlOiBVUkkuZmlsZSh0ZXN0RGlyKSwgb3B0aW9uczogeyByZXNvbHZlVG86IFtVUkkuZmlsZShqb2luKHRlc3REaXIsICdkZWVwJykpXSB9IH0sXG5cdFx0XHR7IHJlc291cmNlOiBVUkkuZmlsZShqb2luKHRlc3REaXIsICdkZWVwJykpIH1cblx0XHRdKTtcblxuXHRcdGNvbnN0IHIxID0gKHJlc1swXS5zdGF0ISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHIxLmNoaWxkcmVuIS5sZW5ndGgsIDgpO1xuXG5cdFx0Y29uc3QgZGVlcCA9IChnZXRCeU5hbWUocjEsICdkZWVwJykhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVlcC5jaGlsZHJlbiEubGVuZ3RoLCA0KTtcblxuXHRcdGNvbnN0IHIyID0gKHJlc1sxXS5zdGF0ISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHIyLmNoaWxkcmVuIS5sZW5ndGgsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyMi5uYW1lLCAnZGVlcCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlIC8gcmVhbHBhdGggLSBmb2xkZXIgc3ltYm9saWMgbGluaycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsaW5rID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnZGVlcC1saW5rJykpO1xuXHRcdGF3YWl0IHByb21pc2VzLnN5bWxpbmsoam9pbih0ZXN0RGlyLCAnZGVlcCcpLCBsaW5rLmZzUGF0aCwgJ2p1bmN0aW9uJyk7XG5cblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShsaW5rKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWQuY2hpbGRyZW4hLmxlbmd0aCwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLmlzRGlyZWN0b3J5LCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWQuaXNTeW1ib2xpY0xpbmssIHRydWUpO1xuXG5cdFx0Y29uc3QgcmVhbHBhdGggPSBhd2FpdCBzZXJ2aWNlLnJlYWxwYXRoKGxpbmspO1xuXHRcdGFzc2VydC5vayhyZWFscGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhc2VuYW1lKHJlYWxwYXRoLmZzUGF0aCksICdkZWVwJyk7XG5cdH0pO1xuXG5cdChpc1dpbmRvd3MgPyB0ZXN0LnNraXAgLyogd2luZG93czogY2Fubm90IGNyZWF0ZSBmaWxlIHN5bWJvbGljIGxpbmsgd2l0aG91dCBlbGV2YXRlZCBjb250ZXh0ICovIDogdGVzdCkoJ3Jlc29sdmUgLSBmaWxlIHN5bWJvbGljIGxpbmsnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbGluayA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2xvcmVtLnR4dC1saW5rZWQnKSk7XG5cdFx0YXdhaXQgcHJvbWlzZXMuc3ltbGluayhqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKSwgbGluay5mc1BhdGgpO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUobGluayk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLmlzRGlyZWN0b3J5LCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLmlzU3ltYm9saWNMaW5rLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZSAtIHN5bWJvbGljIGxpbmsgcG9pbnRpbmcgdG8gbm9uZXhpc3RlbnQgZmlsZSBkb2VzIG5vdCBicmVhaycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBwcm9taXNlcy5zeW1saW5rKGpvaW4odGVzdERpciwgJ2ZvbycpLCBqb2luKHRlc3REaXIsICdiYXInKSwgJ2p1bmN0aW9uJyk7XG5cblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShVUkkuZmlsZSh0ZXN0RGlyKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLmlzRGlyZWN0b3J5LCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWQuY2hpbGRyZW4hLmxlbmd0aCwgOSk7XG5cblx0XHRjb25zdCByZXNvbHZlZExpbmsgPSByZXNvbHZlZC5jaGlsZHJlbj8uZmluZChjaGlsZCA9PiBjaGlsZC5uYW1lID09PSAnYmFyJyAmJiBjaGlsZC5pc1N5bWJvbGljTGluayk7XG5cdFx0YXNzZXJ0Lm9rKHJlc29sdmVkTGluayk7XG5cblx0XHRhc3NlcnQub2soIXJlc29sdmVkTGluaz8uaXNEaXJlY3RvcnkpO1xuXHRcdGFzc2VydC5vayghcmVzb2x2ZWRMaW5rPy5pc0ZpbGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGF0IC0gZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy9wbGF0Zm9ybS9maWxlcy90ZXN0L25vZGUvZml4dHVyZXMvcmVzb2x2ZXIvaW5kZXguaHRtbCcpO1xuXHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgc2VydmljZS5zdGF0KHJlc291cmNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlZC5uYW1lLCAnaW5kZXguaHRtbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlZC5pc0ZpbGUsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlZC5pc0RpcmVjdG9yeSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlZC5yZWFkb25seSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlZC5pc1N5bWJvbGljTGluaywgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlZC5yZXNvdXJjZS50b1N0cmluZygpLCByZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQub2socmVzb2x2ZWQubXRpbWUgPiAwKTtcblx0XHRhc3NlcnQub2socmVzb2x2ZWQuY3RpbWUgPiAwKTtcblx0XHRhc3NlcnQub2socmVzb2x2ZWQuc2l6ZSA+IDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGF0IC0gZGlyZWN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3BsYXRmb3JtL2ZpbGVzL3Rlc3Qvbm9kZS9maXh0dXJlcy9yZXNvbHZlcicpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2Uuc3RhdChyZXNvdXJjZSk7XG5cblx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnJlc291cmNlLnRvU3RyaW5nKCksIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubmFtZSwgJ3Jlc29sdmVyJyk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pc0RpcmVjdG9yeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5yZWFkb25seSwgZmFsc2UpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQubXRpbWUgPiAwKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmN0aW1lID4gMCk7XG5cdH0pO1xuXG5cdC8vIFRoZSBleGVjdXRhYmxlIGJpdCBkb2VzIG5vdCBleGlzdCBvbiBXaW5kb3dzIHNvIHVzZSBhIGNvbmRpdGlvbiBub3Qgc2tpcFxuXHRpZiAoIWlzV2luZG93cykge1xuXHRcdHRlc3QoJ3N0YXQgLSBleGVjdXRhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm9uRXhlY3V0YWJsZSA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy9wbGF0Zm9ybS9maWxlcy90ZXN0L25vZGUvZml4dHVyZXMvZXhlY3V0YWJsZS9ub25fZXhlY3V0YWJsZScpO1xuXHRcdFx0bGV0IHJlc29sdmVkID0gYXdhaXQgc2VydmljZS5zdGF0KG5vbkV4ZWN1dGFibGUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLmlzRmlsZSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWQuZXhlY3V0YWJsZSwgZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBleGVjdXRhYmxlID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3BsYXRmb3JtL2ZpbGVzL3Rlc3Qvbm9kZS9maXh0dXJlcy9leGVjdXRhYmxlL2V4ZWN1dGFibGUnKTtcblx0XHRcdHJlc29sdmVkID0gYXdhaXQgc2VydmljZS5zdGF0KGV4ZWN1dGFibGUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLmlzRmlsZSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWQuZXhlY3V0YWJsZSwgdHJ1ZSk7XG5cdFx0fSk7XG5cdH1cblxuXHR0ZXN0KCdkZWxldGVGaWxlIChub24gcmVjdXJzaXZlKScsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gdGVzdERlbGV0ZUZpbGUoZmFsc2UsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlRmlsZSAocmVjdXJzaXZlKScsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gdGVzdERlbGV0ZUZpbGUoZmFsc2UsIHRydWUpO1xuXHR9KTtcblxuXHQoaXNMaW51eCAvKiB0cmFzaCBpcyB1bnJlbGlhYmxlIG9uIExpbnV4ICovID8gdGVzdC5za2lwIDogdGVzdCkoJ2RlbGV0ZUZpbGUgKHVzZVRyYXNoKScsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gdGVzdERlbGV0ZUZpbGUodHJ1ZSwgZmFsc2UpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0RGVsZXRlRmlsZSh1c2VUcmFzaDogYm9vbGVhbiwgcmVjdXJzaXZlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IGV2ZW50OiBGaWxlT3BlcmF0aW9uRXZlbnQ7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSdW5PcGVyYXRpb24oZSA9PiBldmVudCA9IGUpKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnZGVlcCcsICdjb253YXkuanMnKSk7XG5cdFx0Y29uc3Qgc291cmNlID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKHJlc291cmNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNhbkRlbGV0ZShzb3VyY2UucmVzb3VyY2UsIHsgdXNlVHJhc2gsIHJlY3Vyc2l2ZSB9KSwgdHJ1ZSk7XG5cdFx0YXdhaXQgc2VydmljZS5kZWwoc291cmNlLnJlc291cmNlLCB7IHVzZVRyYXNoLCByZWN1cnNpdmUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyhzb3VyY2UucmVzb3VyY2UuZnNQYXRoKSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0Lm9rKGV2ZW50ISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5yZXNvdXJjZS5mc1BhdGgsIHJlc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5vcGVyYXRpb24sIEZpbGVPcGVyYXRpb24uREVMRVRFKTtcblxuXHRcdGxldCBlcnJvcjogRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlcnZpY2UuZGVsKHNvdXJjZS5yZXNvdXJjZSwgeyB1c2VUcmFzaCwgcmVjdXJzaXZlIH0pO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGVycm9yID0gZTtcblx0XHR9XG5cblx0XHRhc3NlcnQub2soZXJyb3IpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoPEZpbGVPcGVyYXRpb25FcnJvcj5lcnJvcikuZmlsZU9wZXJhdGlvblJlc3VsdCwgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCk7XG5cdH1cblxuXHQoaXNXaW5kb3dzID8gdGVzdC5za2lwIC8qIHdpbmRvd3M6IGNhbm5vdCBjcmVhdGUgZmlsZSBzeW1ib2xpYyBsaW5rIHdpdGhvdXQgZWxldmF0ZWQgY29udGV4dCAqLyA6IHRlc3QpKCdkZWxldGVGaWxlIC0gc3ltYm9saWMgbGluayAoZXhpc3RzKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0YXJnZXQgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKSk7XG5cdFx0Y29uc3QgbGluayA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2xvcmVtLnR4dC1saW5rZWQnKSk7XG5cdFx0YXdhaXQgcHJvbWlzZXMuc3ltbGluayh0YXJnZXQuZnNQYXRoLCBsaW5rLmZzUGF0aCk7XG5cblx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUobGluayk7XG5cblx0XHRsZXQgZXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihlID0+IGV2ZW50ID0gZSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuY2FuRGVsZXRlKHNvdXJjZS5yZXNvdXJjZSksIHRydWUpO1xuXHRcdGF3YWl0IHNlcnZpY2UuZGVsKHNvdXJjZS5yZXNvdXJjZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyhzb3VyY2UucmVzb3VyY2UuZnNQYXRoKSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0Lm9rKGV2ZW50ISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5yZXNvdXJjZS5mc1BhdGgsIGxpbmsuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLm9wZXJhdGlvbiwgRmlsZU9wZXJhdGlvbi5ERUxFVEUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0c1N5bmModGFyZ2V0LmZzUGF0aCksIHRydWUpOyAvLyB0YXJnZXQgdGhlIGxpbmsgcG9pbnRlZCB0byBpcyBuZXZlciBkZWxldGVkXG5cdH0pO1xuXG5cdChpc1dpbmRvd3MgPyB0ZXN0LnNraXAgLyogd2luZG93czogY2Fubm90IGNyZWF0ZSBmaWxlIHN5bWJvbGljIGxpbmsgd2l0aG91dCBlbGV2YXRlZCBjb250ZXh0ICovIDogdGVzdCkoJ2RlbGV0ZUZpbGUgLSBzeW1ib2xpYyBsaW5rIChwb2ludGluZyB0byBub25leGlzdGVudCBmaWxlKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0YXJnZXQgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdmb28nKSk7XG5cdFx0Y29uc3QgbGluayA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2JhcicpKTtcblx0XHRhd2FpdCBwcm9taXNlcy5zeW1saW5rKHRhcmdldC5mc1BhdGgsIGxpbmsuZnNQYXRoKTtcblxuXHRcdGxldCBldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUnVuT3BlcmF0aW9uKGUgPT4gZXZlbnQgPSBlKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jYW5EZWxldGUobGluayksIHRydWUpO1xuXHRcdGF3YWl0IHNlcnZpY2UuZGVsKGxpbmspO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0c1N5bmMobGluay5mc1BhdGgpLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQub2soZXZlbnQhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLnJlc291cmNlLmZzUGF0aCwgbGluay5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEub3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uLkRFTEVURSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZUZvbGRlciAocmVjdXJzaXZlKScsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gdGVzdERlbGV0ZUZvbGRlclJlY3Vyc2l2ZShmYWxzZSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVGb2xkZXIgKHJlY3Vyc2l2ZSwgYXRvbWljKScsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gdGVzdERlbGV0ZUZvbGRlclJlY3Vyc2l2ZShmYWxzZSwgeyBwb3N0Zml4OiAnLnZzY3RtcCcgfSk7XG5cdH0pO1xuXG5cdChpc0xpbnV4IC8qIHRyYXNoIGlzIHVucmVsaWFibGUgb24gTGludXggKi8gPyB0ZXN0LnNraXAgOiB0ZXN0KSgnZGVsZXRlRm9sZGVyIChyZWN1cnNpdmUsIHVzZVRyYXNoKScsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gdGVzdERlbGV0ZUZvbGRlclJlY3Vyc2l2ZSh0cnVlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3REZWxldGVGb2xkZXJSZWN1cnNpdmUodXNlVHJhc2g6IGJvb2xlYW4sIGF0b21pYzogSUZpbGVBdG9taWNPcHRpb25zIHwgZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgZXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihlID0+IGV2ZW50ID0gZSkpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdkZWVwJykpO1xuXHRcdGNvbnN0IHNvdXJjZSA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShyZXNvdXJjZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jYW5EZWxldGUoc291cmNlLnJlc291cmNlLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgdXNlVHJhc2gsIGF0b21pYyB9KSwgdHJ1ZSk7XG5cdFx0YXdhaXQgc2VydmljZS5kZWwoc291cmNlLnJlc291cmNlLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgdXNlVHJhc2gsIGF0b21pYyB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKHNvdXJjZS5yZXNvdXJjZS5mc1BhdGgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0Lm9rKGV2ZW50ISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5yZXNvdXJjZS5mc1BhdGgsIHJlc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5vcGVyYXRpb24sIEZpbGVPcGVyYXRpb24uREVMRVRFKTtcblx0fVxuXG5cdHRlc3QoJ2RlbGV0ZUZvbGRlciAobm9uIHJlY3Vyc2l2ZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdkZWVwJykpO1xuXHRcdGNvbnN0IHNvdXJjZSA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShyZXNvdXJjZSk7XG5cblx0XHRhc3NlcnQub2soKGF3YWl0IHNlcnZpY2UuY2FuRGVsZXRlKHNvdXJjZS5yZXNvdXJjZSkpIGluc3RhbmNlb2YgRXJyb3IpO1xuXG5cdFx0bGV0IGVycm9yO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmRlbChzb3VyY2UucmVzb3VyY2UpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGVycm9yID0gZTtcblx0XHR9XG5cblx0XHRhc3NlcnQub2soZXJyb3IpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVGb2xkZXIgZW1wdHkgZm9sZGVyIChyZWN1cnNpdmUpJywgKCkgPT4ge1xuXHRcdHJldHVybiB0ZXN0RGVsZXRlRW1wdHlGb2xkZXIodHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZUZvbGRlciBlbXB0eSBmb2xkZXIgKG5vbiByZWN1cnNpdmUpJywgKCkgPT4ge1xuXHRcdHJldHVybiB0ZXN0RGVsZXRlRW1wdHlGb2xkZXIoZmFsc2UpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0RGVsZXRlRW1wdHlGb2xkZXIocmVjdXJzaXZlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgeyByZXNvdXJjZSB9ID0gYXdhaXQgc2VydmljZS5jcmVhdGVGb2xkZXIoVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnZGVlcCcsICdlbXB0eScpKSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmRlbChyZXNvdXJjZSwgeyByZWN1cnNpdmUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5leGlzdHMocmVzb3VyY2UpLCBmYWxzZSk7XG5cdH1cblxuXHR0ZXN0KCdtb3ZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUnVuT3BlcmF0aW9uKGUgPT4gZXZlbnQgPSBlKSk7XG5cblx0XHRjb25zdCBzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdpbmRleC5odG1sJykpO1xuXHRcdGNvbnN0IHNvdXJjZUNvbnRlbnRzID0gcmVhZEZpbGVTeW5jKHNvdXJjZS5mc1BhdGgpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gVVJJLmZpbGUoam9pbihkaXJuYW1lKHNvdXJjZS5mc1BhdGgpLCAnb3RoZXIuaHRtbCcpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNhbk1vdmUoc291cmNlLCB0YXJnZXQpLCB0cnVlKTtcblx0XHRjb25zdCByZW5hbWVkID0gYXdhaXQgc2VydmljZS5tb3ZlKHNvdXJjZSwgdGFyZ2V0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKHJlbmFtZWQucmVzb3VyY2UuZnNQYXRoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0c1N5bmMoc291cmNlLmZzUGF0aCksIGZhbHNlKTtcblx0XHRhc3NlcnQub2soZXZlbnQhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLnJlc291cmNlLmZzUGF0aCwgc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5vcGVyYXRpb24sIEZpbGVPcGVyYXRpb24uTU9WRSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS50YXJnZXQhLnJlc291cmNlLmZzUGF0aCwgcmVuYW1lZC5yZXNvdXJjZS5mc1BhdGgpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudHMgPSByZWFkRmlsZVN5bmModGFyZ2V0LmZzUGF0aCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc291cmNlQ29udGVudHMuYnl0ZUxlbmd0aCwgdGFyZ2V0Q29udGVudHMuYnl0ZUxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvdXJjZUNvbnRlbnRzLnRvU3RyaW5nKCksIHRhcmdldENvbnRlbnRzLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIC0gYWNyb3NzIHByb3ZpZGVycyAoYnVmZmVyZWQgPT4gYnVmZmVyZWQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKTtcblx0XHRzZXRDYXBhYmlsaXRpZXModGVzdFByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSk7XG5cblx0XHRyZXR1cm4gdGVzdE1vdmVBY3Jvc3NQcm92aWRlcnMoKTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSAtIGFjcm9zcyBwcm92aWRlcnMgKHVuYnVmZmVyZWQgPT4gdW5idWZmZXJlZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUpO1xuXHRcdHNldENhcGFiaWxpdGllcyh0ZXN0UHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlKTtcblxuXHRcdHJldHVybiB0ZXN0TW92ZUFjcm9zc1Byb3ZpZGVycygpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIC0gYWNyb3NzIHByb3ZpZGVycyAoYnVmZmVyZWQgPT4gdW5idWZmZXJlZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UpO1xuXHRcdHNldENhcGFiaWxpdGllcyh0ZXN0UHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlKTtcblxuXHRcdHJldHVybiB0ZXN0TW92ZUFjcm9zc1Byb3ZpZGVycygpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIC0gYWNyb3NzIHByb3ZpZGVycyAodW5idWZmZXJlZCA9PiBidWZmZXJlZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUpO1xuXHRcdHNldENhcGFiaWxpdGllcyh0ZXN0UHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKTtcblxuXHRcdHJldHVybiB0ZXN0TW92ZUFjcm9zc1Byb3ZpZGVycygpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIC0gYWNyb3NzIHByb3ZpZGVycyAtIGxhcmdlIChidWZmZXJlZCA9PiBidWZmZXJlZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UpO1xuXHRcdHNldENhcGFiaWxpdGllcyh0ZXN0UHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKTtcblxuXHRcdHJldHVybiB0ZXN0TW92ZUFjcm9zc1Byb3ZpZGVycygnbG9yZW0udHh0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgLSBhY3Jvc3MgcHJvdmlkZXJzIC0gbGFyZ2UgKHVuYnVmZmVyZWQgPT4gdW5idWZmZXJlZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUpO1xuXHRcdHNldENhcGFiaWxpdGllcyh0ZXN0UHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlKTtcblxuXHRcdHJldHVybiB0ZXN0TW92ZUFjcm9zc1Byb3ZpZGVycygnbG9yZW0udHh0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgLSBhY3Jvc3MgcHJvdmlkZXJzIC0gbGFyZ2UgKGJ1ZmZlcmVkID0+IHVuYnVmZmVyZWQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKTtcblx0XHRzZXRDYXBhYmlsaXRpZXModGVzdFByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSk7XG5cblx0XHRyZXR1cm4gdGVzdE1vdmVBY3Jvc3NQcm92aWRlcnMoJ2xvcmVtLnR4dCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIC0gYWNyb3NzIHByb3ZpZGVycyAtIGxhcmdlICh1bmJ1ZmZlcmVkID0+IGJ1ZmZlcmVkKScsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSk7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKHRlc3RQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UpO1xuXG5cdFx0cmV0dXJuIHRlc3RNb3ZlQWNyb3NzUHJvdmlkZXJzKCdsb3JlbS50eHQnKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdE1vdmVBY3Jvc3NQcm92aWRlcnMoc291cmNlRmlsZSA9ICdpbmRleC5odG1sJyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUnVuT3BlcmF0aW9uKGUgPT4gZXZlbnQgPSBlKSk7XG5cblx0XHRjb25zdCBzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsIHNvdXJjZUZpbGUpKTtcblx0XHRjb25zdCBzb3VyY2VDb250ZW50cyA9IHJlYWRGaWxlU3luYyhzb3VyY2UuZnNQYXRoKTtcblxuXHRcdGNvbnN0IHRhcmdldCA9IFVSSS5maWxlKGpvaW4oZGlybmFtZShzb3VyY2UuZnNQYXRoKSwgJ290aGVyLmh0bWwnKSkud2l0aCh7IHNjaGVtZTogdGVzdFNjaGVtYSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNhbk1vdmUoc291cmNlLCB0YXJnZXQpLCB0cnVlKTtcblx0XHRjb25zdCByZW5hbWVkID0gYXdhaXQgc2VydmljZS5tb3ZlKHNvdXJjZSwgdGFyZ2V0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKHJlbmFtZWQucmVzb3VyY2UuZnNQYXRoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0c1N5bmMoc291cmNlLmZzUGF0aCksIGZhbHNlKTtcblx0XHRhc3NlcnQub2soZXZlbnQhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLnJlc291cmNlLmZzUGF0aCwgc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5vcGVyYXRpb24sIEZpbGVPcGVyYXRpb24uQ09QWSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS50YXJnZXQhLnJlc291cmNlLmZzUGF0aCwgcmVuYW1lZC5yZXNvdXJjZS5mc1BhdGgpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudHMgPSByZWFkRmlsZVN5bmModGFyZ2V0LmZzUGF0aCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc291cmNlQ29udGVudHMuYnl0ZUxlbmd0aCwgdGFyZ2V0Q29udGVudHMuYnl0ZUxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvdXJjZUNvbnRlbnRzLnRvU3RyaW5nKCksIHRhcmdldENvbnRlbnRzLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0dGVzdCgnbW92ZSAtIG11bHRpIGZvbGRlcicsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgZXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihlID0+IGV2ZW50ID0gZSkpO1xuXG5cdFx0Y29uc3QgbXVsdGlGb2xkZXJQYXRocyA9IFsnYScsICdjb3VwbGUnLCAnb2YnLCAnZm9sZGVycyddO1xuXHRcdGNvbnN0IHJlbmFtZVRvUGF0aCA9IGpvaW4oLi4ubXVsdGlGb2xkZXJQYXRocywgJ290aGVyLmh0bWwnKTtcblxuXHRcdGNvbnN0IHNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2luZGV4Lmh0bWwnKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jYW5Nb3ZlKHNvdXJjZSwgVVJJLmZpbGUoam9pbihkaXJuYW1lKHNvdXJjZS5mc1BhdGgpLCByZW5hbWVUb1BhdGgpKSksIHRydWUpO1xuXHRcdGNvbnN0IHJlbmFtZWQgPSBhd2FpdCBzZXJ2aWNlLm1vdmUoc291cmNlLCBVUkkuZmlsZShqb2luKGRpcm5hbWUoc291cmNlLmZzUGF0aCksIHJlbmFtZVRvUGF0aCkpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKHJlbmFtZWQucmVzb3VyY2UuZnNQYXRoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0c1N5bmMoc291cmNlLmZzUGF0aCksIGZhbHNlKTtcblx0XHRhc3NlcnQub2soZXZlbnQhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLnJlc291cmNlLmZzUGF0aCwgc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5vcGVyYXRpb24sIEZpbGVPcGVyYXRpb24uTU9WRSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS50YXJnZXQhLnJlc291cmNlLmZzUGF0aCwgcmVuYW1lZC5yZXNvdXJjZS5mc1BhdGgpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIC0gZGlyZWN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUnVuT3BlcmF0aW9uKGUgPT4gZXZlbnQgPSBlKSk7XG5cblx0XHRjb25zdCBzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdkZWVwJykpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuY2FuTW92ZShzb3VyY2UsIFVSSS5maWxlKGpvaW4oZGlybmFtZShzb3VyY2UuZnNQYXRoKSwgJ2RlZXBlcicpKSksIHRydWUpO1xuXHRcdGNvbnN0IHJlbmFtZWQgPSBhd2FpdCBzZXJ2aWNlLm1vdmUoc291cmNlLCBVUkkuZmlsZShqb2luKGRpcm5hbWUoc291cmNlLmZzUGF0aCksICdkZWVwZXInKSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0c1N5bmMocmVuYW1lZC5yZXNvdXJjZS5mc1BhdGgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyhzb3VyY2UuZnNQYXRoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5vayhldmVudCEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEucmVzb3VyY2UuZnNQYXRoLCBzb3VyY2UuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLm9wZXJhdGlvbiwgRmlsZU9wZXJhdGlvbi5NT1ZFKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLnRhcmdldCEucmVzb3VyY2UuZnNQYXRoLCByZW5hbWVkLnJlc291cmNlLmZzUGF0aCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgLSBkaXJlY3RvcnkgLSBhY3Jvc3MgcHJvdmlkZXJzIChidWZmZXJlZCA9PiBidWZmZXJlZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UpO1xuXHRcdHNldENhcGFiaWxpdGllcyh0ZXN0UHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKTtcblxuXHRcdHJldHVybiB0ZXN0TW92ZUZvbGRlckFjcm9zc1Byb3ZpZGVycygpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIC0gZGlyZWN0b3J5IC0gYWNyb3NzIHByb3ZpZGVycyAodW5idWZmZXJlZCA9PiB1bmJ1ZmZlcmVkKScsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSk7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKHRlc3RQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUpO1xuXG5cdFx0cmV0dXJuIHRlc3RNb3ZlRm9sZGVyQWNyb3NzUHJvdmlkZXJzKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgLSBkaXJlY3RvcnkgLSBhY3Jvc3MgcHJvdmlkZXJzIChidWZmZXJlZCA9PiB1bmJ1ZmZlcmVkKScsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSk7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKHRlc3RQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUpO1xuXG5cdFx0cmV0dXJuIHRlc3RNb3ZlRm9sZGVyQWNyb3NzUHJvdmlkZXJzKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgLSBkaXJlY3RvcnkgLSBhY3Jvc3MgcHJvdmlkZXJzICh1bmJ1ZmZlcmVkID0+IGJ1ZmZlcmVkKScsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSk7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKHRlc3RQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UpO1xuXG5cdFx0cmV0dXJuIHRlc3RNb3ZlRm9sZGVyQWNyb3NzUHJvdmlkZXJzKCk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RNb3ZlRm9sZGVyQWNyb3NzUHJvdmlkZXJzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUnVuT3BlcmF0aW9uKGUgPT4gZXZlbnQgPSBlKSk7XG5cblx0XHRjb25zdCBzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdkZWVwJykpO1xuXHRcdGNvbnN0IHNvdXJjZUNoaWxkcmVuID0gcmVhZGRpclN5bmMoc291cmNlLmZzUGF0aCk7XG5cblx0XHRjb25zdCB0YXJnZXQgPSBVUkkuZmlsZShqb2luKGRpcm5hbWUoc291cmNlLmZzUGF0aCksICdkZWVwZXInKSkud2l0aCh7IHNjaGVtZTogdGVzdFNjaGVtYSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNhbk1vdmUoc291cmNlLCB0YXJnZXQpLCB0cnVlKTtcblx0XHRjb25zdCByZW5hbWVkID0gYXdhaXQgc2VydmljZS5tb3ZlKHNvdXJjZSwgdGFyZ2V0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKHJlbmFtZWQucmVzb3VyY2UuZnNQYXRoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0c1N5bmMoc291cmNlLmZzUGF0aCksIGZhbHNlKTtcblx0XHRhc3NlcnQub2soZXZlbnQhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLnJlc291cmNlLmZzUGF0aCwgc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5vcGVyYXRpb24sIEZpbGVPcGVyYXRpb24uQ09QWSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS50YXJnZXQhLnJlc291cmNlLmZzUGF0aCwgcmVuYW1lZC5yZXNvdXJjZS5mc1BhdGgpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0Q2hpbGRyZW4gPSByZWFkZGlyU3luYyh0YXJnZXQuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc291cmNlQ2hpbGRyZW4ubGVuZ3RoLCB0YXJnZXRDaGlsZHJlbi5sZW5ndGgpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgc291cmNlQ2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzb3VyY2VDaGlsZHJlbltpXSwgdGFyZ2V0Q2hpbGRyZW5baV0pO1xuXHRcdH1cblx0fVxuXG5cdHRlc3QoJ21vdmUgLSBNSVggQ0FTRScsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgZXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihlID0+IGV2ZW50ID0gZSkpO1xuXG5cdFx0Y29uc3Qgc291cmNlID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2luZGV4Lmh0bWwnKSksIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5vayhzb3VyY2Uuc2l6ZSA+IDApO1xuXG5cdFx0Y29uc3QgcmVuYW1lZFJlc291cmNlID0gVVJJLmZpbGUoam9pbihkaXJuYW1lKHNvdXJjZS5yZXNvdXJjZS5mc1BhdGgpLCAnSU5ERVguaHRtbCcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jYW5Nb3ZlKHNvdXJjZS5yZXNvdXJjZSwgcmVuYW1lZFJlc291cmNlKSwgdHJ1ZSk7XG5cdFx0bGV0IHJlbmFtZWQgPSBhd2FpdCBzZXJ2aWNlLm1vdmUoc291cmNlLnJlc291cmNlLCByZW5hbWVkUmVzb3VyY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0c1N5bmMocmVuYW1lZFJlc291cmNlLmZzUGF0aCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYXNlbmFtZShyZW5hbWVkUmVzb3VyY2UuZnNQYXRoKSwgJ0lOREVYLmh0bWwnKTtcblx0XHRhc3NlcnQub2soZXZlbnQhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLnJlc291cmNlLmZzUGF0aCwgc291cmNlLnJlc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5vcGVyYXRpb24sIEZpbGVPcGVyYXRpb24uTU9WRSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS50YXJnZXQhLnJlc291cmNlLmZzUGF0aCwgcmVuYW1lZFJlc291cmNlLmZzUGF0aCk7XG5cblx0XHRyZW5hbWVkID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKHJlbmFtZWRSZXNvdXJjZSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvdXJjZS5zaXplLCByZW5hbWVkLnNpemUpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIC0gc2FtZSBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUnVuT3BlcmF0aW9uKGUgPT4gZXZlbnQgPSBlKSk7XG5cblx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUoVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnaW5kZXguaHRtbCcpKSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0YXNzZXJ0Lm9rKHNvdXJjZS5zaXplID4gMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jYW5Nb3ZlKHNvdXJjZS5yZXNvdXJjZSwgVVJJLmZpbGUoc291cmNlLnJlc291cmNlLmZzUGF0aCkpLCB0cnVlKTtcblx0XHRsZXQgcmVuYW1lZCA9IGF3YWl0IHNlcnZpY2UubW92ZShzb3VyY2UucmVzb3VyY2UsIFVSSS5maWxlKHNvdXJjZS5yZXNvdXJjZS5mc1BhdGgpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKHJlbmFtZWQucmVzb3VyY2UuZnNQYXRoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhc2VuYW1lKHJlbmFtZWQucmVzb3VyY2UuZnNQYXRoKSwgJ2luZGV4Lmh0bWwnKTtcblx0XHRhc3NlcnQub2soZXZlbnQhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLnJlc291cmNlLmZzUGF0aCwgc291cmNlLnJlc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5vcGVyYXRpb24sIEZpbGVPcGVyYXRpb24uTU9WRSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS50YXJnZXQhLnJlc291cmNlLmZzUGF0aCwgcmVuYW1lZC5yZXNvdXJjZS5mc1BhdGgpO1xuXG5cdFx0cmVuYW1lZCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShyZW5hbWVkLnJlc291cmNlLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc291cmNlLnNpemUsIHJlbmFtZWQuc2l6ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgLSBzYW1lIGZpbGUgIzInLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGV2ZW50OiBGaWxlT3BlcmF0aW9uRXZlbnQ7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSdW5PcGVyYXRpb24oZSA9PiBldmVudCA9IGUpKTtcblxuXHRcdGNvbnN0IHNvdXJjZSA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShVUkkuZmlsZShqb2luKHRlc3REaXIsICdpbmRleC5odG1sJykpLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQub2soc291cmNlLnNpemUgPiAwKTtcblxuXHRcdGNvbnN0IHRhcmdldFBhcmVudCA9IFVSSS5maWxlKHRlc3REaXIpO1xuXHRcdGNvbnN0IHRhcmdldCA9IHRhcmdldFBhcmVudC53aXRoKHsgcGF0aDogcG9zaXguam9pbih0YXJnZXRQYXJlbnQucGF0aCwgcG9zaXguYmFzZW5hbWUoc291cmNlLnJlc291cmNlLnBhdGgpKSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNhbk1vdmUoc291cmNlLnJlc291cmNlLCB0YXJnZXQpLCB0cnVlKTtcblx0XHRsZXQgcmVuYW1lZCA9IGF3YWl0IHNlcnZpY2UubW92ZShzb3VyY2UucmVzb3VyY2UsIHRhcmdldCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyhyZW5hbWVkLnJlc291cmNlLmZzUGF0aCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYXNlbmFtZShyZW5hbWVkLnJlc291cmNlLmZzUGF0aCksICdpbmRleC5odG1sJyk7XG5cdFx0YXNzZXJ0Lm9rKGV2ZW50ISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5yZXNvdXJjZS5mc1BhdGgsIHNvdXJjZS5yZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEub3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uLk1PVkUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEudGFyZ2V0IS5yZXNvdXJjZS5mc1BhdGgsIHJlbmFtZWQucmVzb3VyY2UuZnNQYXRoKTtcblxuXHRcdHJlbmFtZWQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUocmVuYW1lZC5yZXNvdXJjZSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvdXJjZS5zaXplLCByZW5hbWVkLnNpemUpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIC0gc291cmNlIHBhcmVudCBvZiB0YXJnZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGV2ZW50OiBGaWxlT3BlcmF0aW9uRXZlbnQ7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSdW5PcGVyYXRpb24oZSA9PiBldmVudCA9IGUpKTtcblxuXHRcdGxldCBzb3VyY2UgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUoVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnaW5kZXguaHRtbCcpKSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0Y29uc3Qgb3JpZ2luYWxTaXplID0gc291cmNlLnNpemU7XG5cdFx0YXNzZXJ0Lm9rKG9yaWdpbmFsU2l6ZSA+IDApO1xuXG5cdFx0YXNzZXJ0Lm9rKChhd2FpdCBzZXJ2aWNlLmNhbk1vdmUoVVJJLmZpbGUodGVzdERpciksIFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2JpbmFyeS50eHQnKSkpIGluc3RhbmNlb2YgRXJyb3IpKTtcblxuXHRcdGxldCBlcnJvcjtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2VydmljZS5tb3ZlKFVSSS5maWxlKHRlc3REaXIpLCBVUkkuZmlsZShqb2luKHRlc3REaXIsICdiaW5hcnkudHh0JykpKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRlcnJvciA9IGU7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGVycm9yKTtcblx0XHRhc3NlcnQub2soIWV2ZW50ISk7XG5cblx0XHRzb3VyY2UgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUoc291cmNlLnJlc291cmNlLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3JpZ2luYWxTaXplLCBzb3VyY2Uuc2l6ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgLSBGSUxFX01PVkVfQ09ORkxJQ1QnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGV2ZW50OiBGaWxlT3BlcmF0aW9uRXZlbnQ7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSdW5PcGVyYXRpb24oZSA9PiBldmVudCA9IGUpKTtcblxuXHRcdGxldCBzb3VyY2UgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUoVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnaW5kZXguaHRtbCcpKSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0Y29uc3Qgb3JpZ2luYWxTaXplID0gc291cmNlLnNpemU7XG5cdFx0YXNzZXJ0Lm9rKG9yaWdpbmFsU2l6ZSA+IDApO1xuXG5cdFx0YXNzZXJ0Lm9rKChhd2FpdCBzZXJ2aWNlLmNhbk1vdmUoc291cmNlLnJlc291cmNlLCBVUkkuZmlsZShqb2luKHRlc3REaXIsICdiaW5hcnkudHh0JykpKSBpbnN0YW5jZW9mIEVycm9yKSk7XG5cblx0XHRsZXQgZXJyb3I7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlcnZpY2UubW92ZShzb3VyY2UucmVzb3VyY2UsIFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2JpbmFyeS50eHQnKSkpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGVycm9yID0gZTtcblx0XHR9XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IuZmlsZU9wZXJhdGlvblJlc3VsdCwgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX01PVkVfQ09ORkxJQ1QpO1xuXHRcdGFzc2VydC5vayghZXZlbnQhKTtcblxuXHRcdHNvdXJjZSA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShzb3VyY2UucmVzb3VyY2UsIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcmlnaW5hbFNpemUsIHNvdXJjZS5zaXplKTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSAtIG92ZXJ3cml0ZSBmb2xkZXIgd2l0aCBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBjcmVhdGVFdmVudDogRmlsZU9wZXJhdGlvbkV2ZW50O1xuXHRcdGxldCBtb3ZlRXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudDtcblx0XHRsZXQgZGVsZXRlRXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLm9wZXJhdGlvbiA9PT0gRmlsZU9wZXJhdGlvbi5DUkVBVEUpIHtcblx0XHRcdFx0Y3JlYXRlRXZlbnQgPSBlO1xuXHRcdFx0fSBlbHNlIGlmIChlLm9wZXJhdGlvbiA9PT0gRmlsZU9wZXJhdGlvbi5ERUxFVEUpIHtcblx0XHRcdFx0ZGVsZXRlRXZlbnQgPSBlO1xuXHRcdFx0fSBlbHNlIGlmIChlLm9wZXJhdGlvbiA9PT0gRmlsZU9wZXJhdGlvbi5NT1ZFKSB7XG5cdFx0XHRcdG1vdmVFdmVudCA9IGU7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcGFyZW50ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKFVSSS5maWxlKHRlc3REaXIpKTtcblx0XHRjb25zdCBmb2xkZXJSZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4ocGFyZW50LnJlc291cmNlLmZzUGF0aCwgJ2NvbndheS5qcycpKTtcblx0XHRjb25zdCBmID0gYXdhaXQgc2VydmljZS5jcmVhdGVGb2xkZXIoZm9sZGVyUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2RlZXAnLCAnY29ud2F5LmpzJykpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuY2FuTW92ZShzb3VyY2UsIGYucmVzb3VyY2UsIHRydWUpLCB0cnVlKTtcblx0XHRjb25zdCBtb3ZlZCA9IGF3YWl0IHNlcnZpY2UubW92ZShzb3VyY2UsIGYucmVzb3VyY2UsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0c1N5bmMobW92ZWQucmVzb3VyY2UuZnNQYXRoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0Lm9rKHN0YXRTeW5jKG1vdmVkLnJlc291cmNlLmZzUGF0aCkuaXNGaWxlKTtcblx0XHRhc3NlcnQub2soY3JlYXRlRXZlbnQhKTtcblx0XHRhc3NlcnQub2soZGVsZXRlRXZlbnQhKTtcblx0XHRhc3NlcnQub2sobW92ZUV2ZW50ISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vdmVFdmVudCEucmVzb3VyY2UuZnNQYXRoLCBzb3VyY2UuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW92ZUV2ZW50IS50YXJnZXQhLnJlc291cmNlLmZzUGF0aCwgbW92ZWQucmVzb3VyY2UuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVsZXRlRXZlbnQhLnJlc291cmNlLmZzUGF0aCwgZm9sZGVyUmVzb3VyY2UuZnNQYXRoKTtcblx0fSk7XG5cblx0dGVzdCgnY29weScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBkb1Rlc3RDb3B5KCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcHkgLSB1bmJ1ZmZlcmVkIChGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUpO1xuXG5cdFx0YXdhaXQgZG9UZXN0Q29weSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb3B5IC0gdW5idWZmZXJlZCBsYXJnZSAoRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUpJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlKTtcblxuXHRcdGF3YWl0IGRvVGVzdENvcHkoJ2xvcmVtLnR4dCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb3B5IC0gYnVmZmVyZWQgKEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKScsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSk7XG5cblx0XHRhd2FpdCBkb1Rlc3RDb3B5KCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcHkgLSBidWZmZXJlZCBsYXJnZSAoRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UpJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKTtcblxuXHRcdGF3YWl0IGRvVGVzdENvcHkoJ2xvcmVtLnR4dCcpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBzZXRDYXBhYmlsaXRpZXMocHJvdmlkZXI6IFRlc3REaXNrRmlsZVN5c3RlbVByb3ZpZGVyLCBjYXBhYmlsaXRpZXM6IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcyk6IHZvaWQge1xuXHRcdHByb3ZpZGVyLmNhcGFiaWxpdGllcyA9IGNhcGFiaWxpdGllcztcblx0XHRpZiAoaXNMaW51eCkge1xuXHRcdFx0cHJvdmlkZXIuY2FwYWJpbGl0aWVzIHw9IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5QYXRoQ2FzZVNlbnNpdGl2ZTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBkb1Rlc3RDb3B5KHNvdXJjZU5hbWU6IHN0cmluZyA9ICdpbmRleC5odG1sJykge1xuXHRcdGxldCBldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUnVuT3BlcmF0aW9uKGUgPT4gZXZlbnQgPSBlKSk7XG5cblx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUoVVJJLmZpbGUoam9pbih0ZXN0RGlyLCBzb3VyY2VOYW1lKSkpO1xuXHRcdGNvbnN0IHRhcmdldCA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ290aGVyLmh0bWwnKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jYW5Db3B5KHNvdXJjZS5yZXNvdXJjZSwgdGFyZ2V0KSwgdHJ1ZSk7XG5cdFx0Y29uc3QgY29waWVkID0gYXdhaXQgc2VydmljZS5jb3B5KHNvdXJjZS5yZXNvdXJjZSwgdGFyZ2V0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKGNvcGllZC5yZXNvdXJjZS5mc1BhdGgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyhzb3VyY2UucmVzb3VyY2UuZnNQYXRoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0Lm9rKGV2ZW50ISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5yZXNvdXJjZS5mc1BhdGgsIHNvdXJjZS5yZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEub3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uLkNPUFkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEudGFyZ2V0IS5yZXNvdXJjZS5mc1BhdGgsIGNvcGllZC5yZXNvdXJjZS5mc1BhdGgpO1xuXG5cdFx0Y29uc3Qgc291cmNlQ29udGVudHMgPSByZWFkRmlsZVN5bmMoc291cmNlLnJlc291cmNlLmZzUGF0aCk7XG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudHMgPSByZWFkRmlsZVN5bmModGFyZ2V0LmZzUGF0aCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc291cmNlQ29udGVudHMuYnl0ZUxlbmd0aCwgdGFyZ2V0Q29udGVudHMuYnl0ZUxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvdXJjZUNvbnRlbnRzLnRvU3RyaW5nKCksIHRhcmdldENvbnRlbnRzLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0dGVzdCgnY29weSAtIG92ZXJ3cml0ZSBmb2xkZXIgd2l0aCBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBjcmVhdGVFdmVudDogRmlsZU9wZXJhdGlvbkV2ZW50O1xuXHRcdGxldCBjb3B5RXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudDtcblx0XHRsZXQgZGVsZXRlRXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLm9wZXJhdGlvbiA9PT0gRmlsZU9wZXJhdGlvbi5DUkVBVEUpIHtcblx0XHRcdFx0Y3JlYXRlRXZlbnQgPSBlO1xuXHRcdFx0fSBlbHNlIGlmIChlLm9wZXJhdGlvbiA9PT0gRmlsZU9wZXJhdGlvbi5ERUxFVEUpIHtcblx0XHRcdFx0ZGVsZXRlRXZlbnQgPSBlO1xuXHRcdFx0fSBlbHNlIGlmIChlLm9wZXJhdGlvbiA9PT0gRmlsZU9wZXJhdGlvbi5DT1BZKSB7XG5cdFx0XHRcdGNvcHlFdmVudCA9IGU7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcGFyZW50ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKFVSSS5maWxlKHRlc3REaXIpKTtcblx0XHRjb25zdCBmb2xkZXJSZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4ocGFyZW50LnJlc291cmNlLmZzUGF0aCwgJ2NvbndheS5qcycpKTtcblx0XHRjb25zdCBmID0gYXdhaXQgc2VydmljZS5jcmVhdGVGb2xkZXIoZm9sZGVyUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2RlZXAnLCAnY29ud2F5LmpzJykpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuY2FuQ29weShzb3VyY2UsIGYucmVzb3VyY2UsIHRydWUpLCB0cnVlKTtcblx0XHRjb25zdCBjb3BpZWQgPSBhd2FpdCBzZXJ2aWNlLmNvcHkoc291cmNlLCBmLnJlc291cmNlLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKGNvcGllZC5yZXNvdXJjZS5mc1BhdGgpLCB0cnVlKTtcblx0XHRhc3NlcnQub2soc3RhdFN5bmMoY29waWVkLnJlc291cmNlLmZzUGF0aCkuaXNGaWxlKTtcblx0XHRhc3NlcnQub2soY3JlYXRlRXZlbnQhKTtcblx0XHRhc3NlcnQub2soZGVsZXRlRXZlbnQhKTtcblx0XHRhc3NlcnQub2soY29weUV2ZW50ISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvcHlFdmVudCEucmVzb3VyY2UuZnNQYXRoLCBzb3VyY2UuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29weUV2ZW50IS50YXJnZXQhLnJlc291cmNlLmZzUGF0aCwgY29waWVkLnJlc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlbGV0ZUV2ZW50IS5yZXNvdXJjZS5mc1BhdGgsIGZvbGRlclJlc291cmNlLmZzUGF0aCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcHkgLSBNSVggQ0FTRSBzYW1lIHRhcmdldCAtIG5vIG92ZXJ3cml0ZScsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgc291cmNlID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2luZGV4Lmh0bWwnKSksIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXHRcdGNvbnN0IG9yaWdpbmFsU2l6ZSA9IHNvdXJjZS5zaXplO1xuXHRcdGFzc2VydC5vayhvcmlnaW5hbFNpemUgPiAwKTtcblxuXHRcdGNvbnN0IHRhcmdldCA9IFVSSS5maWxlKGpvaW4oZGlybmFtZShzb3VyY2UucmVzb3VyY2UuZnNQYXRoKSwgJ0lOREVYLmh0bWwnKSk7XG5cblx0XHRjb25zdCBjYW5Db3B5ID0gYXdhaXQgc2VydmljZS5jYW5Db3B5KHNvdXJjZS5yZXNvdXJjZSwgdGFyZ2V0KTtcblxuXHRcdGxldCBlcnJvcjtcblx0XHRsZXQgY29waWVkOiBJRmlsZVN0YXRXaXRoTWV0YWRhdGE7XG5cdFx0dHJ5IHtcblx0XHRcdGNvcGllZCA9IGF3YWl0IHNlcnZpY2UuY29weShzb3VyY2UucmVzb3VyY2UsIHRhcmdldCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0ZXJyb3IgPSBlO1xuXHRcdH1cblxuXHRcdGlmIChpc0xpbnV4KSB7XG5cdFx0XHRhc3NlcnQub2soIWVycm9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYW5Db3B5LCB0cnVlKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0c1N5bmMoY29waWVkIS5yZXNvdXJjZS5mc1BhdGgpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5vayhyZWFkZGlyU3luYyh0ZXN0RGlyKS5zb21lKGYgPT4gZiA9PT0gJ0lOREVYLmh0bWwnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc291cmNlLnNpemUsIGNvcGllZCEuc2l6ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5vayhlcnJvcik7XG5cdFx0XHRhc3NlcnQub2soY2FuQ29weSBpbnN0YW5jZW9mIEVycm9yKTtcblxuXHRcdFx0c291cmNlID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKHNvdXJjZS5yZXNvdXJjZSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3JpZ2luYWxTaXplLCBzb3VyY2Uuc2l6ZSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdjb3B5IC0gTUlYIENBU0Ugc2FtZSB0YXJnZXQgLSBvdmVyd3JpdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHNvdXJjZSA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShVUkkuZmlsZShqb2luKHRlc3REaXIsICdpbmRleC5odG1sJykpLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblx0XHRjb25zdCBvcmlnaW5hbFNpemUgPSBzb3VyY2Uuc2l6ZTtcblx0XHRhc3NlcnQub2sob3JpZ2luYWxTaXplID4gMCk7XG5cblx0XHRjb25zdCB0YXJnZXQgPSBVUkkuZmlsZShqb2luKGRpcm5hbWUoc291cmNlLnJlc291cmNlLmZzUGF0aCksICdJTkRFWC5odG1sJykpO1xuXG5cdFx0Y29uc3QgY2FuQ29weSA9IGF3YWl0IHNlcnZpY2UuY2FuQ29weShzb3VyY2UucmVzb3VyY2UsIHRhcmdldCwgdHJ1ZSk7XG5cblx0XHRsZXQgZXJyb3I7XG5cdFx0bGV0IGNvcGllZDogSUZpbGVTdGF0V2l0aE1ldGFkYXRhO1xuXHRcdHRyeSB7XG5cdFx0XHRjb3BpZWQgPSBhd2FpdCBzZXJ2aWNlLmNvcHkoc291cmNlLnJlc291cmNlLCB0YXJnZXQsIHRydWUpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGVycm9yID0gZTtcblx0XHR9XG5cblx0XHRpZiAoaXNMaW51eCkge1xuXHRcdFx0YXNzZXJ0Lm9rKCFlcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FuQ29weSwgdHJ1ZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKGNvcGllZCEucmVzb3VyY2UuZnNQYXRoKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQub2socmVhZGRpclN5bmModGVzdERpcikuc29tZShmID0+IGYgPT09ICdJTkRFWC5odG1sJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvdXJjZS5zaXplLCBjb3BpZWQhLnNpemUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQub2soZXJyb3IpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNhbkNvcHkgaW5zdGFuY2VvZiBFcnJvcik7XG5cblx0XHRcdHNvdXJjZSA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShzb3VyY2UucmVzb3VyY2UsIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9yaWdpbmFsU2l6ZSwgc291cmNlLnNpemUpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnY29weSAtIE1JWCBDQVNFIGRpZmZlcmVudCB0YXJnZXQgLSBvdmVyd3JpdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc291cmNlMSA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShVUkkuZmlsZShqb2luKHRlc3REaXIsICdpbmRleC5odG1sJykpLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQub2soc291cmNlMS5zaXplID4gMCk7XG5cblx0XHRjb25zdCByZW5hbWVkID0gYXdhaXQgc2VydmljZS5tb3ZlKHNvdXJjZTEucmVzb3VyY2UsIFVSSS5maWxlKGpvaW4oZGlybmFtZShzb3VyY2UxLnJlc291cmNlLmZzUGF0aCksICdDT05XQVkuanMnKSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKHJlbmFtZWQucmVzb3VyY2UuZnNQYXRoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0Lm9rKHJlYWRkaXJTeW5jKHRlc3REaXIpLnNvbWUoZiA9PiBmID09PSAnQ09OV0FZLmpzJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzb3VyY2UxLnNpemUsIHJlbmFtZWQuc2l6ZSk7XG5cblx0XHRjb25zdCBzb3VyY2UyID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2RlZXAnLCAnY29ud2F5LmpzJykpLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblx0XHRjb25zdCB0YXJnZXQgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsIGJhc2VuYW1lKHNvdXJjZTIucmVzb3VyY2UucGF0aCkpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNhbkNvcHkoc291cmNlMi5yZXNvdXJjZSwgdGFyZ2V0LCB0cnVlKSwgdHJ1ZSk7XG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgc2VydmljZS5jb3B5KHNvdXJjZTIucmVzb3VyY2UsIHRhcmdldCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0c1N5bmMocmVzLnJlc291cmNlLmZzUGF0aCksIHRydWUpO1xuXHRcdGFzc2VydC5vayhyZWFkZGlyU3luYyh0ZXN0RGlyKS5zb21lKGYgPT4gZiA9PT0gJ2NvbndheS5qcycpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc291cmNlMi5zaXplLCByZXMuc2l6ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcHkgLSBzYW1lIGZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGV2ZW50OiBGaWxlT3BlcmF0aW9uRXZlbnQ7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSdW5PcGVyYXRpb24oZSA9PiBldmVudCA9IGUpKTtcblxuXHRcdGNvbnN0IHNvdXJjZSA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShVUkkuZmlsZShqb2luKHRlc3REaXIsICdpbmRleC5odG1sJykpLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQub2soc291cmNlLnNpemUgPiAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNhbkNvcHkoc291cmNlLnJlc291cmNlLCBVUkkuZmlsZShzb3VyY2UucmVzb3VyY2UuZnNQYXRoKSksIHRydWUpO1xuXHRcdGxldCBjb3BpZWQgPSBhd2FpdCBzZXJ2aWNlLmNvcHkoc291cmNlLnJlc291cmNlLCBVUkkuZmlsZShzb3VyY2UucmVzb3VyY2UuZnNQYXRoKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyhjb3BpZWQucmVzb3VyY2UuZnNQYXRoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhc2VuYW1lKGNvcGllZC5yZXNvdXJjZS5mc1BhdGgpLCAnaW5kZXguaHRtbCcpO1xuXHRcdGFzc2VydC5vayhldmVudCEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEucmVzb3VyY2UuZnNQYXRoLCBzb3VyY2UucmVzb3VyY2UuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLm9wZXJhdGlvbiwgRmlsZU9wZXJhdGlvbi5DT1BZKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLnRhcmdldCEucmVzb3VyY2UuZnNQYXRoLCBjb3BpZWQucmVzb3VyY2UuZnNQYXRoKTtcblxuXHRcdGNvcGllZCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShzb3VyY2UucmVzb3VyY2UsIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzb3VyY2Uuc2l6ZSwgY29waWVkLnNpemUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb3B5IC0gc2FtZSBmaWxlICMyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUnVuT3BlcmF0aW9uKGUgPT4gZXZlbnQgPSBlKSk7XG5cblx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUoVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnaW5kZXguaHRtbCcpKSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0YXNzZXJ0Lm9rKHNvdXJjZS5zaXplID4gMCk7XG5cblx0XHRjb25zdCB0YXJnZXRQYXJlbnQgPSBVUkkuZmlsZSh0ZXN0RGlyKTtcblx0XHRjb25zdCB0YXJnZXQgPSB0YXJnZXRQYXJlbnQud2l0aCh7IHBhdGg6IHBvc2l4LmpvaW4odGFyZ2V0UGFyZW50LnBhdGgsIHBvc2l4LmJhc2VuYW1lKHNvdXJjZS5yZXNvdXJjZS5wYXRoKSkgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jYW5Db3B5KHNvdXJjZS5yZXNvdXJjZSwgVVJJLmZpbGUodGFyZ2V0LmZzUGF0aCkpLCB0cnVlKTtcblx0XHRsZXQgY29waWVkID0gYXdhaXQgc2VydmljZS5jb3B5KHNvdXJjZS5yZXNvdXJjZSwgVVJJLmZpbGUodGFyZ2V0LmZzUGF0aCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0c1N5bmMoY29waWVkLnJlc291cmNlLmZzUGF0aCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYXNlbmFtZShjb3BpZWQucmVzb3VyY2UuZnNQYXRoKSwgJ2luZGV4Lmh0bWwnKTtcblx0XHRhc3NlcnQub2soZXZlbnQhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLnJlc291cmNlLmZzUGF0aCwgc291cmNlLnJlc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5vcGVyYXRpb24sIEZpbGVPcGVyYXRpb24uQ09QWSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS50YXJnZXQhLnJlc291cmNlLmZzUGF0aCwgY29waWVkLnJlc291cmNlLmZzUGF0aCk7XG5cblx0XHRjb3BpZWQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUoc291cmNlLnJlc291cmNlLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc291cmNlLnNpemUsIGNvcGllZC5zaXplKTtcblx0fSk7XG5cblx0dGVzdCgnY2xvbmVGaWxlIC0gYmFzaWNzJywgKCkgPT4ge1xuXHRcdHJldHVybiB0ZXN0Q2xvbmVGaWxlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nsb25lRmlsZSAtIHZpYSBjb3B5IGNhcGFiaWxpdHknLCAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UgfCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUZvbGRlckNvcHkpO1xuXG5cdFx0cmV0dXJuIHRlc3RDbG9uZUZpbGUoKTtcblx0fSk7XG5cblx0dGVzdCgnY2xvbmVGaWxlIC0gdmlhIHBpcGUnLCAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UpO1xuXG5cdFx0cmV0dXJuIHRlc3RDbG9uZUZpbGUoKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdENsb25lRmlsZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzb3VyY2UxID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnaW5kZXguaHRtbCcpKTtcblx0XHRjb25zdCBzb3VyY2UxU2l6ZSA9IChhd2FpdCBzZXJ2aWNlLnJlc29sdmUoc291cmNlMSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSkpLnNpemU7XG5cblx0XHRjb25zdCBzb3VyY2UyID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0JykpO1xuXHRcdGNvbnN0IHNvdXJjZTJTaXplID0gKGF3YWl0IHNlcnZpY2UucmVzb2x2ZShzb3VyY2UyLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KSkuc2l6ZTtcblxuXHRcdGNvbnN0IHRhcmdldFBhcmVudCA9IFVSSS5maWxlKHRlc3REaXIpO1xuXG5cdFx0Ly8gc2FtZSBwYXRoIGlzIGEgbm8tb3Bcblx0XHRhd2FpdCBzZXJ2aWNlLmNsb25lRmlsZShzb3VyY2UxLCBzb3VyY2UxKTtcblxuXHRcdC8vIHNpbXBsZSBjbG9uZSB0byBleGlzdGluZyBwYXJlbnQgZm9sZGVyIHBhdGhcblx0XHRjb25zdCB0YXJnZXQxID0gdGFyZ2V0UGFyZW50LndpdGgoeyBwYXRoOiBwb3NpeC5qb2luKHRhcmdldFBhcmVudC5wYXRoLCBgJHtwb3NpeC5iYXNlbmFtZShzb3VyY2UxLnBhdGgpfS1jbG9uZWApIH0pO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jbG9uZUZpbGUoc291cmNlMSwgVVJJLmZpbGUodGFyZ2V0MS5mc1BhdGgpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKHRhcmdldDEuZnNQYXRoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhc2VuYW1lKHRhcmdldDEuZnNQYXRoKSwgJ2luZGV4Lmh0bWwtY2xvbmUnKTtcblxuXHRcdGxldCB0YXJnZXQxU2l6ZSA9IChhd2FpdCBzZXJ2aWNlLnJlc29sdmUodGFyZ2V0MSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSkpLnNpemU7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc291cmNlMVNpemUsIHRhcmdldDFTaXplKTtcblxuXHRcdC8vIGNsb25lIHRvIHNhbWUgcGF0aCBvdmVyd3JpdGVzXG5cdFx0YXdhaXQgc2VydmljZS5jbG9uZUZpbGUoc291cmNlMiwgVVJJLmZpbGUodGFyZ2V0MS5mc1BhdGgpKTtcblxuXHRcdHRhcmdldDFTaXplID0gKGF3YWl0IHNlcnZpY2UucmVzb2x2ZSh0YXJnZXQxLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KSkuc2l6ZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzb3VyY2UyU2l6ZSwgdGFyZ2V0MVNpemUpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChzb3VyY2UxU2l6ZSwgdGFyZ2V0MVNpemUpO1xuXG5cdFx0Ly8gY2xvbmUgY3JlYXRlcyBtaXNzaW5nIGZvbGRlcnMgYWQtaG9jXG5cdFx0Y29uc3QgdGFyZ2V0MiA9IHRhcmdldFBhcmVudC53aXRoKHsgcGF0aDogcG9zaXguam9pbih0YXJnZXRQYXJlbnQucGF0aCwgJ2ZvbycsICdiYXInLCBgJHtwb3NpeC5iYXNlbmFtZShzb3VyY2UxLnBhdGgpfS1jbG9uZWApIH0pO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jbG9uZUZpbGUoc291cmNlMSwgVVJJLmZpbGUodGFyZ2V0Mi5mc1BhdGgpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKHRhcmdldDIuZnNQYXRoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhc2VuYW1lKHRhcmdldDIuZnNQYXRoKSwgJ2luZGV4Lmh0bWwtY2xvbmUnKTtcblxuXHRcdGNvbnN0IHRhcmdldDJTaXplID0gKGF3YWl0IHNlcnZpY2UucmVzb2x2ZSh0YXJnZXQyLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KSkuc2l6ZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzb3VyY2UxU2l6ZSwgdGFyZ2V0MlNpemUpO1xuXHR9XG5cblx0dGVzdCgncmVhZEZpbGUgLSBzbWFsbCBmaWxlIC0gZGVmYXVsdCcsICgpID0+IHtcblx0XHRyZXR1cm4gdGVzdFJlYWRGaWxlKFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsLnR4dCcpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gc21hbGwgZmlsZSAtIGJ1ZmZlcmVkJywgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKTtcblxuXHRcdHJldHVybiB0ZXN0UmVhZEZpbGUoVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc21hbGwudHh0JykpKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSBzbWFsbCBmaWxlIC0gYnVmZmVyZWQgLyByZWFkb25seScsICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSB8IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5SZWFkb25seSk7XG5cblx0XHRyZXR1cm4gdGVzdFJlYWRGaWxlKFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsLnR4dCcpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gc21hbGwgZmlsZSAtIHVuYnVmZmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUpO1xuXG5cdFx0cmV0dXJuIHRlc3RSZWFkRmlsZShVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbC50eHQnKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIHNtYWxsIGZpbGUgLSB1bmJ1ZmZlcmVkIC8gcmVhZG9ubHknLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUgfCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUmVhZG9ubHkpO1xuXG5cdFx0cmV0dXJuIHRlc3RSZWFkRmlsZShVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbC50eHQnKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIHNtYWxsIGZpbGUgLSBzdHJlYW1lZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRTdHJlYW0pO1xuXG5cdFx0cmV0dXJuIHRlc3RSZWFkRmlsZShVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbC50eHQnKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIHNtYWxsIGZpbGUgLSBzdHJlYW1lZCAvIHJlYWRvbmx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFN0cmVhbSB8IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5SZWFkb25seSk7XG5cblx0XHRyZXR1cm4gdGVzdFJlYWRGaWxlKFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsLnR4dCcpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gbGFyZ2UgZmlsZSAtIGRlZmF1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHRlc3RSZWFkRmlsZShVUkkuZmlsZShqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIGxhcmdlIGZpbGUgLSBidWZmZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSk7XG5cblx0XHRyZXR1cm4gdGVzdFJlYWRGaWxlKFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2xvcmVtLnR4dCcpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gbGFyZ2UgZmlsZSAtIHVuYnVmZmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUpO1xuXG5cdFx0cmV0dXJuIHRlc3RSZWFkRmlsZShVUkkuZmlsZShqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIGxhcmdlIGZpbGUgLSBzdHJlYW1lZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRTdHJlYW0pO1xuXG5cdFx0cmV0dXJuIHRlc3RSZWFkRmlsZShVUkkuZmlsZShqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIGF0b21pYyAoZW11bGF0ZWQgb24gc2VydmljZSBsZXZlbCknLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkU3RyZWFtKTtcblxuXHRcdHJldHVybiB0ZXN0UmVhZEZpbGUoVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0JykpLCB7IGF0b21pYzogdHJ1ZSB9KTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSBhdG9taWMgKG5hdGl2ZWx5IHN1cHBvcnRlZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUgJiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUF0b21pY1JlYWQpO1xuXG5cdFx0cmV0dXJuIHRlc3RSZWFkRmlsZShVUkkuZmlsZShqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKSksIHsgYXRvbWljOiB0cnVlIH0pO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0UmVhZEZpbGUocmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IElSZWFkRmlsZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgc2VydmljZS5yZWFkRmlsZShyZXNvdXJjZSwgb3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudC52YWx1ZS50b1N0cmluZygpLCByZWFkRmlsZVN5bmMocmVzb3VyY2UuZnNQYXRoKS50b1N0cmluZygpKTtcblx0fVxuXG5cdHRlc3QoJ3JlYWRGaWxlU3RyZWFtIC0gc21hbGwgZmlsZSAtIGRlZmF1bHQnLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHRlc3RSZWFkRmlsZVN0cmVhbShVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbC50eHQnKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZVN0cmVhbSAtIHNtYWxsIGZpbGUgLSBidWZmZXJlZCcsICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSk7XG5cblx0XHRyZXR1cm4gdGVzdFJlYWRGaWxlU3RyZWFtKFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsLnR4dCcpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRGaWxlU3RyZWFtIC0gc21hbGwgZmlsZSAtIHVuYnVmZmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUpO1xuXG5cdFx0cmV0dXJuIHRlc3RSZWFkRmlsZVN0cmVhbShVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbC50eHQnKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZVN0cmVhbSAtIHNtYWxsIGZpbGUgLSBzdHJlYW1lZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRTdHJlYW0pO1xuXG5cdFx0cmV0dXJuIHRlc3RSZWFkRmlsZVN0cmVhbShVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbC50eHQnKSkpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0UmVhZEZpbGVTdHJlYW0ocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBzZXJ2aWNlLnJlYWRGaWxlU3RyZWFtKHJlc291cmNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgc3RyZWFtVG9CdWZmZXIoY29udGVudC52YWx1ZSkpLnRvU3RyaW5nKCksIHJlYWRGaWxlU3luYyhyZXNvdXJjZS5mc1BhdGgpLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0dGVzdCgncmVhZEZpbGUgLSBGaWxlcyBhcmUgaW50ZXJtaW5nbGVkICMzODMzMSAtIGRlZmF1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHRlc3RGaWxlc05vdEludGVybWluZ2xlZCgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIEZpbGVzIGFyZSBpbnRlcm1pbmdsZWQgIzM4MzMxIC0gYnVmZmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UpO1xuXG5cdFx0cmV0dXJuIHRlc3RGaWxlc05vdEludGVybWluZ2xlZCgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIEZpbGVzIGFyZSBpbnRlcm1pbmdsZWQgIzM4MzMxIC0gdW5idWZmZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSk7XG5cblx0XHRyZXR1cm4gdGVzdEZpbGVzTm90SW50ZXJtaW5nbGVkKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gRmlsZXMgYXJlIGludGVybWluZ2xlZCAjMzgzMzEgLSBzdHJlYW1lZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRTdHJlYW0pO1xuXG5cdFx0cmV0dXJuIHRlc3RGaWxlc05vdEludGVybWluZ2xlZCgpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0RmlsZXNOb3RJbnRlcm1pbmdsZWQoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UxID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0JykpO1xuXHRcdGNvbnN0IHJlc291cmNlMiA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NvbWVfdXRmMTZsZS5jc3MnKSk7XG5cblx0XHQvLyBsb2FkIGluIHNlcXVlbmNlIGFuZCBrZWVwIGRhdGFcblx0XHRjb25zdCB2YWx1ZTEgPSBhd2FpdCBzZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlMSk7XG5cdFx0Y29uc3QgdmFsdWUyID0gYXdhaXQgc2VydmljZS5yZWFkRmlsZShyZXNvdXJjZTIpO1xuXG5cdFx0Ly8gbG9hZCBpbiBwYXJhbGxlbCBpbiBleHBlY3QgdGhlIHNhbWUgcmVzdWx0XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0c2VydmljZS5yZWFkRmlsZShyZXNvdXJjZTEpLFxuXHRcdFx0c2VydmljZS5yZWFkRmlsZShyZXNvdXJjZTIpXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLnZhbHVlLnRvU3RyaW5nKCksIHZhbHVlMS52YWx1ZS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzFdLnZhbHVlLnRvU3RyaW5nKCksIHZhbHVlMi52YWx1ZS50b1N0cmluZygpKTtcblx0fVxuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gZnJvbSBwb3NpdGlvbiAoQVNDSUkpIC0gZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gdGVzdFJlYWRGaWxlRnJvbVBvc2l0aW9uQXNjaWkoKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSBmcm9tIHBvc2l0aW9uIChBU0NJSSkgLSBidWZmZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSk7XG5cblx0XHRyZXR1cm4gdGVzdFJlYWRGaWxlRnJvbVBvc2l0aW9uQXNjaWkoKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSBmcm9tIHBvc2l0aW9uIChBU0NJSSkgLSB1bmJ1ZmZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlKTtcblxuXHRcdHJldHVybiB0ZXN0UmVhZEZpbGVGcm9tUG9zaXRpb25Bc2NpaSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIGZyb20gcG9zaXRpb24gKEFTQ0lJKSAtIHN0cmVhbWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFN0cmVhbSk7XG5cblx0XHRyZXR1cm4gdGVzdFJlYWRGaWxlRnJvbVBvc2l0aW9uQXNjaWkoKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdFJlYWRGaWxlRnJvbVBvc2l0aW9uQXNjaWkoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbC50eHQnKSk7XG5cblx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IHNlcnZpY2UucmVhZEZpbGUocmVzb3VyY2UsIHsgcG9zaXRpb246IDYgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudHMudmFsdWUudG9TdHJpbmcoKSwgJ0ZpbGUnKTtcblx0fVxuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gZnJvbSBwb3NpdGlvbiAod2l0aCB1bWxhdXQpIC0gZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gdGVzdFJlYWRGaWxlRnJvbVBvc2l0aW9uVW1sYXV0KCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gZnJvbSBwb3NpdGlvbiAod2l0aCB1bWxhdXQpIC0gYnVmZmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UpO1xuXG5cdFx0cmV0dXJuIHRlc3RSZWFkRmlsZUZyb21Qb3NpdGlvblVtbGF1dCgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIGZyb20gcG9zaXRpb24gKHdpdGggdW1sYXV0KSAtIHVuYnVmZmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUpO1xuXG5cdFx0cmV0dXJuIHRlc3RSZWFkRmlsZUZyb21Qb3NpdGlvblVtbGF1dCgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIGZyb20gcG9zaXRpb24gKHdpdGggdW1sYXV0KSAtIHN0cmVhbWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFN0cmVhbSk7XG5cblx0XHRyZXR1cm4gdGVzdFJlYWRGaWxlRnJvbVBvc2l0aW9uVW1sYXV0KCk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RSZWFkRmlsZUZyb21Qb3NpdGlvblVtbGF1dCgpIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsX3VtbGF1dC50eHQnKSk7XG5cblx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IHNlcnZpY2UucmVhZEZpbGUocmVzb3VyY2UsIHsgcG9zaXRpb246IEJ1ZmZlci5mcm9tKCdTbWFsbCBGaWxlIHdpdGggXHUwMERDJykubGVuZ3RoIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnRzLnZhbHVlLnRvU3RyaW5nKCksICdtbGF1dCcpO1xuXHR9XG5cblx0dGVzdCgncmVhZEZpbGUgLSAzIGJ5dGVzIChBU0NJSSkgLSBkZWZhdWx0JywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiB0ZXN0UmVhZFRocmVlQnl0ZXNGcm9tRmlsZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIDMgYnl0ZXMgKEFTQ0lJKSAtIGJ1ZmZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKTtcblxuXHRcdHJldHVybiB0ZXN0UmVhZFRocmVlQnl0ZXNGcm9tRmlsZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIDMgYnl0ZXMgKEFTQ0lJKSAtIHVuYnVmZmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUpO1xuXG5cdFx0cmV0dXJuIHRlc3RSZWFkVGhyZWVCeXRlc0Zyb21GaWxlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gMyBieXRlcyAoQVNDSUkpIC0gc3RyZWFtZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkU3RyZWFtKTtcblxuXHRcdHJldHVybiB0ZXN0UmVhZFRocmVlQnl0ZXNGcm9tRmlsZSgpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0UmVhZFRocmVlQnl0ZXNGcm9tRmlsZSgpIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsLnR4dCcpKTtcblxuXHRcdGNvbnN0IGNvbnRlbnRzID0gYXdhaXQgc2VydmljZS5yZWFkRmlsZShyZXNvdXJjZSwgeyBsZW5ndGg6IDMgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudHMudmFsdWUudG9TdHJpbmcoKSwgJ1NtYScpO1xuXHR9XG5cblx0dGVzdCgncmVhZEZpbGUgLSAyMDAwMCBieXRlcyAobGFyZ2UpIC0gZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gcmVhZExhcmdlRmlsZVdpdGhMZW5ndGgoMjAwMDApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIDIwMDAwIGJ5dGVzIChsYXJnZSkgLSBidWZmZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSk7XG5cblx0XHRyZXR1cm4gcmVhZExhcmdlRmlsZVdpdGhMZW5ndGgoMjAwMDApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIDIwMDAwIGJ5dGVzIChsYXJnZSkgLSB1bmJ1ZmZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlKTtcblxuXHRcdHJldHVybiByZWFkTGFyZ2VGaWxlV2l0aExlbmd0aCgyMDAwMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gMjAwMDAgYnl0ZXMgKGxhcmdlKSAtIHN0cmVhbWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFN0cmVhbSk7XG5cblx0XHRyZXR1cm4gcmVhZExhcmdlRmlsZVdpdGhMZW5ndGgoMjAwMDApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIDgwMDAwIGJ5dGVzIChsYXJnZSkgLSBkZWZhdWx0JywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiByZWFkTGFyZ2VGaWxlV2l0aExlbmd0aCg4MDAwMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gODAwMDAgYnl0ZXMgKGxhcmdlKSAtIGJ1ZmZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKTtcblxuXHRcdHJldHVybiByZWFkTGFyZ2VGaWxlV2l0aExlbmd0aCg4MDAwMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gODAwMDAgYnl0ZXMgKGxhcmdlKSAtIHVuYnVmZmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUpO1xuXG5cdFx0cmV0dXJuIHJlYWRMYXJnZUZpbGVXaXRoTGVuZ3RoKDgwMDAwKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSA4MDAwMCBieXRlcyAobGFyZ2UpIC0gc3RyZWFtZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkU3RyZWFtKTtcblxuXHRcdHJldHVybiByZWFkTGFyZ2VGaWxlV2l0aExlbmd0aCg4MDAwMCk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHJlYWRMYXJnZUZpbGVXaXRoTGVuZ3RoKGxlbmd0aDogbnVtYmVyKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKSk7XG5cblx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IHNlcnZpY2UucmVhZEZpbGUocmVzb3VyY2UsIHsgbGVuZ3RoIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnRzLnZhbHVlLmJ5dGVMZW5ndGgsIGxlbmd0aCk7XG5cdH1cblxuXHR0ZXN0KCdyZWFkRmlsZSAtIEZJTEVfSVNfRElSRUNUT1JZJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnZGVlcCcpKTtcblxuXHRcdGxldCBlcnJvcjogRmlsZU9wZXJhdGlvbkVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGVycm9yID0gZXJyO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhlcnJvcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLmZpbGVPcGVyYXRpb25SZXN1bHQsIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9JU19ESVJFQ1RPUlkpO1xuXHR9KTtcblxuXHQoaXNXaW5kb3dzIC8qIGVycm9yIGNvZGUgZG9lcyBub3Qgc2VlbSB0byBiZSBzdXBwb3J0ZWQgb24gd2luZG93cyAqLyA/IHRlc3Quc2tpcCA6IHRlc3QpKCdyZWFkRmlsZSAtIEZJTEVfTk9UX0RJUkVDVE9SWScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2xvcmVtLnR4dCcsICdmaWxlLnR4dCcpKTtcblxuXHRcdGxldCBlcnJvcjogRmlsZU9wZXJhdGlvbkVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGVycm9yID0gZXJyO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhlcnJvcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLmZpbGVPcGVyYXRpb25SZXN1bHQsIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRElSRUNUT1JZKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSBGSUxFX05PVF9GT1VORCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJzQwNC5odG1sJykpO1xuXG5cdFx0bGV0IGVycm9yOiBGaWxlT3BlcmF0aW9uRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlcnZpY2UucmVhZEZpbGUocmVzb3VyY2UpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0ZXJyb3IgPSBlcnI7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGVycm9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IuZmlsZU9wZXJhdGlvblJlc3VsdCwgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gRklMRV9OT1RfTU9ESUZJRURfU0lOQ0UgLSBkZWZhdWx0JywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiB0ZXN0Tm90TW9kaWZpZWRTaW5jZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIEZJTEVfTk9UX01PRElGSUVEX1NJTkNFIC0gYnVmZmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UpO1xuXG5cdFx0cmV0dXJuIHRlc3ROb3RNb2RpZmllZFNpbmNlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gRklMRV9OT1RfTU9ESUZJRURfU0lOQ0UgLSB1bmJ1ZmZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlKTtcblxuXHRcdHJldHVybiB0ZXN0Tm90TW9kaWZpZWRTaW5jZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIEZJTEVfTk9UX01PRElGSUVEX1NJTkNFIC0gc3RyZWFtZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkU3RyZWFtKTtcblxuXHRcdHJldHVybiB0ZXN0Tm90TW9kaWZpZWRTaW5jZSgpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0Tm90TW9kaWZpZWRTaW5jZSgpIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2luZGV4Lmh0bWwnKSk7XG5cblx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IHNlcnZpY2UucmVhZEZpbGUocmVzb3VyY2UpO1xuXHRcdGZpbGVQcm92aWRlci50b3RhbEJ5dGVzUmVhZCA9IDA7XG5cblx0XHRsZXQgZXJyb3I6IEZpbGVPcGVyYXRpb25FcnJvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2VydmljZS5yZWFkRmlsZShyZXNvdXJjZSwgeyBldGFnOiBjb250ZW50cy5ldGFnIH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0ZXJyb3IgPSBlcnI7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGVycm9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IuZmlsZU9wZXJhdGlvblJlc3VsdCwgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9NT0RJRklFRF9TSU5DRSk7XG5cdFx0YXNzZXJ0Lm9rKGVycm9yIGluc3RhbmNlb2YgTm90TW9kaWZpZWRTaW5jZUZpbGVPcGVyYXRpb25FcnJvciAmJiBlcnJvci5zdGF0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZVByb3ZpZGVyLnRvdGFsQnl0ZXNSZWFkLCAwKTtcblx0fVxuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gRklMRV9OT1RfTU9ESUZJRURfU0lOQ0UgZG9lcyBub3QgZmlyZSB3cm9uZ2x5IC0gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzcyOTA5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGZpbGVQcm92aWRlci5zZXRJbnZhbGlkU3RhdFNpemUodHJ1ZSk7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2luZGV4Lmh0bWwnKSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlKTtcblxuXHRcdGxldCBlcnJvcjogRmlsZU9wZXJhdGlvbkVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlLCB7IGV0YWc6IHVuZGVmaW5lZCB9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGVycm9yID0gZXJyO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayghZXJyb3IpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIEZJTEVfVE9PX0xBUkdFIC0gZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gdGVzdEZpbGVUb29MYXJnZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIEZJTEVfVE9PX0xBUkdFIC0gYnVmZmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UpO1xuXG5cdFx0cmV0dXJuIHRlc3RGaWxlVG9vTGFyZ2UoKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSBGSUxFX1RPT19MQVJHRSAtIHVuYnVmZmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUpO1xuXG5cdFx0cmV0dXJuIHRlc3RGaWxlVG9vTGFyZ2UoKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSBGSUxFX1RPT19MQVJHRSAtIHN0cmVhbWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFN0cmVhbSk7XG5cblx0XHRyZXR1cm4gdGVzdEZpbGVUb29MYXJnZSgpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0RmlsZVRvb0xhcmdlKCkge1xuXHRcdGF3YWl0IGRvVGVzdEZpbGVUb29MYXJnZShmYWxzZSk7XG5cblx0XHQvLyBBbHNvIHRlc3Qgd2hlbiB0aGUgc3RhdCBzaXplIGlzIHdyb25nXG5cdFx0ZmlsZVByb3ZpZGVyLnNldFNtYWxsU3RhdFNpemUodHJ1ZSk7XG5cdFx0cmV0dXJuIGRvVGVzdEZpbGVUb29MYXJnZSh0cnVlKTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGRvVGVzdEZpbGVUb29MYXJnZShzdGF0U2l6ZVdyb25nOiBib29sZWFuKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdpbmRleC5odG1sJykpO1xuXG5cdFx0bGV0IGVycm9yOiBGaWxlT3BlcmF0aW9uRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlcnZpY2UucmVhZEZpbGUocmVzb3VyY2UsIHsgbGltaXRzOiB7IHNpemU6IDEwIH0gfSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRlcnJvciA9IGVycjtcblx0XHR9XG5cblx0XHRpZiAoIXN0YXRTaXplV3JvbmcpIHtcblx0XHRcdGFzc2VydC5vayhlcnJvciBpbnN0YW5jZW9mIFRvb0xhcmdlRmlsZU9wZXJhdGlvbkVycm9yKTtcblx0XHRcdGFzc2VydC5vayh0eXBlb2YgZXJyb3Iuc2l6ZSA9PT0gJ251bWJlcicpO1xuXHRcdH1cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IhLmZpbGVPcGVyYXRpb25SZXN1bHQsIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9UT09fTEFSR0UpO1xuXHR9XG5cblx0KGlzV2luZG93cyA/IHRlc3Quc2tpcCAvKiB3aW5kb3dzOiBjYW5ub3QgY3JlYXRlIGZpbGUgc3ltYm9saWMgbGluayB3aXRob3V0IGVsZXZhdGVkIGNvbnRleHQgKi8gOiB0ZXN0KSgncmVhZEZpbGUgLSBkYW5nbGluZyBzeW1ib2xpYyBsaW5rIC0gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzExNjA0OScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsaW5rID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc21hbGwuanMtbGluaycpKTtcblx0XHRhd2FpdCBwcm9taXNlcy5zeW1saW5rKGpvaW4odGVzdERpciwgJ3NtYWxsLmpzJyksIGxpbmsuZnNQYXRoKTtcblxuXHRcdGxldCBlcnJvcjogRmlsZU9wZXJhdGlvbkVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnJlYWRGaWxlKGxpbmspO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0ZXJyb3IgPSBlcnI7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGVycm9yKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlRmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gYXNzZXJ0Q3JlYXRlRmlsZShjb250ZW50cyA9PiBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnRzKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUZpbGUgKHJlYWRhYmxlKScsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gYXNzZXJ0Q3JlYXRlRmlsZShjb250ZW50cyA9PiBidWZmZXJUb1JlYWRhYmxlKFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudHMpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUZpbGUgKHN0cmVhbSknLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIGFzc2VydENyZWF0ZUZpbGUoY29udGVudHMgPT4gYnVmZmVyVG9TdHJlYW0oVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50cykpKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gYXNzZXJ0Q3JlYXRlRmlsZShjb252ZXJ0ZXI6IChjb250ZW50OiBzdHJpbmcpID0+IFZTQnVmZmVyIHwgVlNCdWZmZXJSZWFkYWJsZSB8IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgZXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihlID0+IGV2ZW50ID0gZSkpO1xuXG5cdFx0Y29uc3QgY29udGVudHMgPSAnSGVsbG8gV29ybGQnO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAndGVzdC50eHQnKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jYW5DcmVhdGVGaWxlKHJlc291cmNlKSwgdHJ1ZSk7XG5cdFx0Y29uc3QgZmlsZVN0YXQgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUZpbGUocmVzb3VyY2UsIGNvbnZlcnRlcihjb250ZW50cykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlU3RhdC5uYW1lLCAndGVzdC50eHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyhmaWxlU3RhdC5yZXNvdXJjZS5mc1BhdGgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEZpbGVTeW5jKGZpbGVTdGF0LnJlc291cmNlLmZzUGF0aCkudG9TdHJpbmcoKSwgY29udGVudHMpO1xuXG5cdFx0YXNzZXJ0Lm9rKGV2ZW50ISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5yZXNvdXJjZS5mc1BhdGgsIHJlc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5vcGVyYXRpb24sIEZpbGVPcGVyYXRpb24uQ1JFQVRFKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLnRhcmdldCEucmVzb3VyY2UuZnNQYXRoLCByZXNvdXJjZS5mc1BhdGgpO1xuXHR9XG5cblx0dGVzdCgnY3JlYXRlRmlsZSAoZG9lcyBub3Qgb3ZlcndyaXRlIGJ5IGRlZmF1bHQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnRzID0gJ0hlbGxvIFdvcmxkJztcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3Rlc3QudHh0JykpO1xuXG5cdFx0d3JpdGVGaWxlU3luYyhyZXNvdXJjZS5mc1BhdGgsICcnKTsgLy8gY3JlYXRlIGZpbGVcblxuXHRcdGFzc2VydC5vaygoYXdhaXQgc2VydmljZS5jYW5DcmVhdGVGaWxlKHJlc291cmNlKSkgaW5zdGFuY2VvZiBFcnJvcik7XG5cblx0XHRsZXQgZXJyb3I7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50cykpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0ZXJyb3IgPSBlcnI7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGVycm9yKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlRmlsZSAoYWxsb3dzIHRvIG92ZXJ3cml0ZSBleGlzdGluZyknLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGV2ZW50OiBGaWxlT3BlcmF0aW9uRXZlbnQ7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSdW5PcGVyYXRpb24oZSA9PiBldmVudCA9IGUpKTtcblxuXHRcdGNvbnN0IGNvbnRlbnRzID0gJ0hlbGxvIFdvcmxkJztcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3Rlc3QudHh0JykpO1xuXG5cdFx0d3JpdGVGaWxlU3luYyhyZXNvdXJjZS5mc1BhdGgsICcnKTsgLy8gY3JlYXRlIGZpbGVcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNhbkNyZWF0ZUZpbGUocmVzb3VyY2UsIHsgb3ZlcndyaXRlOiB0cnVlIH0pLCB0cnVlKTtcblx0XHRjb25zdCBmaWxlU3RhdCA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50cyksIHsgb3ZlcndyaXRlOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlU3RhdC5uYW1lLCAndGVzdC50eHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyhmaWxlU3RhdC5yZXNvdXJjZS5mc1BhdGgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEZpbGVTeW5jKGZpbGVTdGF0LnJlc291cmNlLmZzUGF0aCkudG9TdHJpbmcoKSwgY29udGVudHMpO1xuXG5cdFx0YXNzZXJ0Lm9rKGV2ZW50ISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5yZXNvdXJjZS5mc1BhdGgsIHJlc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5vcGVyYXRpb24sIEZpbGVPcGVyYXRpb24uQ1JFQVRFKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLnRhcmdldCEucmVzb3VyY2UuZnNQYXRoLCByZXNvdXJjZS5mc1BhdGgpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgLSBkZWZhdWx0JywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiB0ZXN0V3JpdGVGaWxlKGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIC0gZmx1c2ggb24gd3JpdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0RGlza0ZpbGVTeXN0ZW1Qcm92aWRlci5jb25maWd1cmVGbHVzaE9uV3JpdGUodHJ1ZSk7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCB0ZXN0V3JpdGVGaWxlKGZhbHNlKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0RGlza0ZpbGVTeXN0ZW1Qcm92aWRlci5jb25maWd1cmVGbHVzaE9uV3JpdGUoZmFsc2UpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIC0gYnVmZmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UpO1xuXG5cdFx0cmV0dXJuIHRlc3RXcml0ZUZpbGUoZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgLSB1bmJ1ZmZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlKTtcblxuXHRcdHJldHVybiB0ZXN0V3JpdGVGaWxlKGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIC0gZGVmYXVsdCAoYXRvbWljKScsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gdGVzdFdyaXRlRmlsZSh0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIC0gZmx1c2ggb24gd3JpdGUgKGF0b21pYyknLCBhc3luYyAoKSA9PiB7XG5cdFx0RGlza0ZpbGVTeXN0ZW1Qcm92aWRlci5jb25maWd1cmVGbHVzaE9uV3JpdGUodHJ1ZSk7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCB0ZXN0V3JpdGVGaWxlKHRydWUpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHREaXNrRmlsZVN5c3RlbVByb3ZpZGVyLmNvbmZpZ3VyZUZsdXNoT25Xcml0ZShmYWxzZSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgLSBidWZmZXJlZCAoYXRvbWljKScsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSB8IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlQXRvbWljV3JpdGUpO1xuXG5cdFx0bGV0IGU7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRlc3RXcml0ZUZpbGUodHJ1ZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGUgPSBlcnJvcjtcblx0XHR9XG5cblx0XHRhc3NlcnQub2soZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAtIHVuYnVmZmVyZWQgKGF0b21pYyknLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUgfCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUF0b21pY1dyaXRlKTtcblxuXHRcdHJldHVybiB0ZXN0V3JpdGVGaWxlKHRydWUpO1xuXHR9KTtcblxuXHQoaXNXaW5kb3dzID8gdGVzdC5za2lwIC8qIHdpbmRvd3M6IGNhbm5vdCBjcmVhdGUgZmlsZSBzeW1ib2xpYyBsaW5rIHdpdGhvdXQgZWxldmF0ZWQgY29udGV4dCAqLyA6IHRlc3QpKCd3cml0ZUZpbGUgLSBhdG9taWMgd3JpdGluZyBkb2VzIG5vdCBicmVhayBzeW1saW5rcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsaW5rID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0LWxpbmtlZCcpKTtcblx0XHRhd2FpdCBwcm9taXNlcy5zeW1saW5rKGpvaW4odGVzdERpciwgJ2xvcmVtLnR4dCcpLCBsaW5rLmZzUGF0aCk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gJ1VwZGF0ZXMgdG8gdGhlIGxvcmVtIGZpbGUnO1xuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKGxpbmssIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCksIHsgYXRvbWljOiB7IHBvc3RmaXg6ICcudnNjdG1wJyB9IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRmlsZVN5bmMobGluay5mc1BhdGgpLnRvU3RyaW5nKCksIGNvbnRlbnQpO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUobGluayk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLmlzU3ltYm9saWNMaW5rLCB0cnVlKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdFdyaXRlRmlsZShhdG9taWM6IGJvb2xlYW4pIHtcblx0XHRsZXQgZXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihlID0+IGV2ZW50ID0gZSkpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbC50eHQnKSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gcmVhZEZpbGVTeW5jKHJlc291cmNlLmZzUGF0aCkudG9TdHJpbmcoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudCwgJ1NtYWxsIEZpbGUnKTtcblxuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSAnVXBkYXRlcyB0byB0aGUgc21hbGwgZmlsZSc7XG5cdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcobmV3Q29udGVudCksIHsgYXRvbWljOiBhdG9taWMgPyB7IHBvc3RmaXg6ICcudnNjdG1wJyB9IDogZmFsc2UgfSk7XG5cblx0XHRhc3NlcnQub2soZXZlbnQhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLnJlc291cmNlLmZzUGF0aCwgcmVzb3VyY2UuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLm9wZXJhdGlvbiwgRmlsZU9wZXJhdGlvbi5XUklURSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEZpbGVTeW5jKHJlc291cmNlLmZzUGF0aCkudG9TdHJpbmcoKSwgbmV3Q29udGVudCk7XG5cdH1cblxuXHR0ZXN0KCd3cml0ZUZpbGUgKGxhcmdlIGZpbGUpIC0gZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gdGVzdFdyaXRlRmlsZUxhcmdlKGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIChsYXJnZSBmaWxlKSAtIGJ1ZmZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKTtcblxuXHRcdHJldHVybiB0ZXN0V3JpdGVGaWxlTGFyZ2UoZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgKGxhcmdlIGZpbGUpIC0gdW5idWZmZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSk7XG5cblx0XHRyZXR1cm4gdGVzdFdyaXRlRmlsZUxhcmdlKGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIChsYXJnZSBmaWxlKSAtIGRlZmF1bHQgKGF0b21pYyknLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHRlc3RXcml0ZUZpbGVMYXJnZSh0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIChsYXJnZSBmaWxlKSAtIGJ1ZmZlcmVkIChhdG9taWMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlIHwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVBdG9taWNXcml0ZSk7XG5cblx0XHRsZXQgZTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGVzdFdyaXRlRmlsZUxhcmdlKHRydWUpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRlID0gZXJyb3I7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGUpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgKGxhcmdlIGZpbGUpIC0gdW5idWZmZXJlZCAoYXRvbWljKScsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSB8IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlQXRvbWljV3JpdGUpO1xuXG5cdFx0cmV0dXJuIHRlc3RXcml0ZUZpbGVMYXJnZSh0cnVlKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdFdyaXRlRmlsZUxhcmdlKGF0b21pYzogYm9vbGVhbikge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0JykpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IHJlYWRGaWxlU3luYyhyZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSBjb250ZW50LnRvU3RyaW5nKCkgKyBjb250ZW50LnRvU3RyaW5nKCk7XG5cblx0XHRjb25zdCBmaWxlU3RhdCA9IGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKG5ld0NvbnRlbnQpLCB7IGF0b21pYzogYXRvbWljID8geyBwb3N0Zml4OiAnLnZzY3RtcCcgfSA6IGZhbHNlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlU3RhdC5uYW1lLCAnbG9yZW0udHh0Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEZpbGVTeW5jKHJlc291cmNlLmZzUGF0aCkudG9TdHJpbmcoKSwgbmV3Q29udGVudCk7XG5cdH1cblxuXHR0ZXN0KCd3cml0ZUZpbGUgKGxhcmdlIGZpbGUpIC0gdW5idWZmZXJlZCAoYXRvbWljKSAtIGNvbmN1cnJlbnQgd3JpdGVzIHdpdGggbXVsdGlwbGUgc2VydmljZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUgfCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUF0b21pY1dyaXRlKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0JykpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IHJlYWRGaWxlU3luYyhyZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSBjb250ZW50LnRvU3RyaW5nKCkgKyBjb250ZW50LnRvU3RyaW5nKCk7XG5cblx0XHRjb25zdCBwcm9taXNlczogUHJvbWlzZTxJRmlsZVN0YXRXaXRoTWV0YWRhdGE+W10gPSBbXTtcblx0XHRsZXQgc3VmZml4ID0gMDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwOyBpKyspIHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuZmlsZSwgZmlsZVByb3ZpZGVyKSk7XG5cblx0XHRcdHByb21pc2VzLnB1c2goc2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoYCR7bmV3Q29udGVudH0keysrc3VmZml4fWApLCB7IGF0b21pYzogeyBwb3N0Zml4OiAnLnZzY3RtcCcgfSB9KSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdH1cblxuXHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChwcm9taXNlcyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEZpbGVTeW5jKHJlc291cmNlLmZzUGF0aCkudG9TdHJpbmcoKSwgYCR7bmV3Q29udGVudH0ke3N1ZmZpeH1gKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIC0gYnVmZmVyZWQgLSByZWFkb25seSB0aHJvd3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UgfCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUmVhZG9ubHkpO1xuXG5cdFx0cmV0dXJuIHRlc3RXcml0ZUZpbGVSZWFkb25seVRocm93cygpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgLSB1bmJ1ZmZlcmVkIC0gcmVhZG9ubHkgdGhyb3dzJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlIHwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLlJlYWRvbmx5KTtcblxuXHRcdHJldHVybiB0ZXN0V3JpdGVGaWxlUmVhZG9ubHlUaHJvd3MoKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdFdyaXRlRmlsZVJlYWRvbmx5VGhyb3dzKCkge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc21hbGwudHh0JykpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IHJlYWRGaWxlU3luYyhyZXNvdXJjZS5mc1BhdGgpLnRvU3RyaW5nKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQsICdTbWFsbCBGaWxlJyk7XG5cblx0XHRjb25zdCBuZXdDb250ZW50ID0gJ1VwZGF0ZXMgdG8gdGhlIHNtYWxsIGZpbGUnO1xuXG5cdFx0bGV0IGVycm9yOiBFcnJvcjtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcobmV3Q29udGVudCkpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0ZXJyb3IgPSBlcnI7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGVycm9yISk7XG5cdH1cblxuXHR0ZXN0KCd3cml0ZUZpbGUgKGxhcmdlIGZpbGUpIC0gbXVsdGlwbGUgcGFyYWxsZWwgd3JpdGVzIHF1ZXVlIHVwIGFuZCBhdG9taWMgcmVhZCBzdXBwb3J0ICh2aWEgZmlsZSBzZXJ2aWNlKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2xvcmVtLnR4dCcpKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSByZWFkRmlsZVN5bmMocmVzb3VyY2UuZnNQYXRoKTtcblx0XHRjb25zdCBuZXdDb250ZW50ID0gY29udGVudC50b1N0cmluZygpICsgY29udGVudC50b1N0cmluZygpO1xuXG5cdFx0Y29uc3Qgd3JpdGVQcm9taXNlcyA9IFByb21pc2UuYWxsKFsnMCcsICcwMCcsICcwMDAnLCAnMDAwMCcsICcwMDAwMCddLm1hcChhc3luYyBvZmZzZXQgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZVN0YXQgPSBhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhvZmZzZXQgKyBuZXdDb250ZW50KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZVN0YXQubmFtZSwgJ2xvcmVtLnR4dCcpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHJlYWRQcm9taXNlcyA9IFByb21pc2UuYWxsKFsnMCcsICcwMCcsICcwMDAnLCAnMDAwMCcsICcwMDAwMCddLm1hcChhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWxlQ29udGVudCA9IGF3YWl0IHNlcnZpY2UucmVhZEZpbGUocmVzb3VyY2UsIHsgYXRvbWljOiB0cnVlIH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKGZpbGVDb250ZW50LnZhbHVlLmJ5dGVMZW5ndGggPiAwKTsgLy8gYGF0b21pYzogdHJ1ZWAgZW5zdXJlcyB3ZSBuZXZlciByZWFkIGEgdHJ1bmNhdGVkIGZpbGVcblx0XHR9KSk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbd3JpdGVQcm9taXNlcywgcmVhZFByb21pc2VzXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb3ZpZGVyIC0gd3JpdGUgYmFycmllciBwcmV2ZW50cyBkaXJ0eSB3cml0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gcmVhZEZpbGVTeW5jKHJlc291cmNlLmZzUGF0aCk7XG5cdFx0Y29uc3QgbmV3Q29udGVudCA9IGNvbnRlbnQudG9TdHJpbmcoKSArIGNvbnRlbnQudG9TdHJpbmcoKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gc2VydmljZS5nZXRQcm92aWRlcihyZXNvdXJjZS5zY2hlbWUpO1xuXHRcdGFzc2VydC5vayhwcm92aWRlcik7XG5cdFx0YXNzZXJ0Lm9rKGhhc09wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHkocHJvdmlkZXIpKTtcblxuXHRcdGNvbnN0IHdyaXRlUHJvbWlzZXMgPSBQcm9taXNlLmFsbChbJzAnLCAnMDAnLCAnMDAwJywgJzAwMDAnLCAnMDAwMDAnXS5tYXAoYXN5bmMgb2Zmc2V0ID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBvZmZzZXQgKyBuZXdDb250ZW50O1xuXHRcdFx0Y29uc3QgY29udGVudEJ1ZmZlciA9IFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkuYnVmZmVyO1xuXG5cdFx0XHRjb25zdCBmZCA9IGF3YWl0IHByb3ZpZGVyLm9wZW4ocmVzb3VyY2UsIHsgY3JlYXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlIH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgcHJvdmlkZXIud3JpdGUoZmQsIDAsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkuYnVmZmVyLCAwLCBjb250ZW50QnVmZmVyLmJ5dGVMZW5ndGgpO1xuXG5cdFx0XHRcdC8vIEhlcmUgc2luY2UgYGNsb3NlYCBpcyBub3QgY2FsbGVkLCBhbGwgb3RoZXIgd3JpdGVzIGFyZVxuXHRcdFx0XHQvLyB3YWl0aW5nIG9uIHRoZSBiYXJyaWVyIHRvIHJlbGVhc2UsIHNvIGRvaW5nIGEgcmVhZEZpbGVcblx0XHRcdFx0Ly8gc2hvdWxkIGdpdmUgdXMgYSBjb25zaXN0ZW50IHZpZXcgb2YgdGhlIGZpbGUgY29udGVudHNcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBwcm9taXNlcy5yZWFkRmlsZShyZXNvdXJjZS5mc1BhdGgpKS50b1N0cmluZygpLCBjb250ZW50KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IHByb3ZpZGVyLmNsb3NlKGZkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbd3JpdGVQcm9taXNlc10pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm92aWRlciAtIHdyaXRlIGJhcnJpZXIgaXMgcGFydGl0aW9uZWQgcGVyIHJlc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlMSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2xvcmVtLnR4dCcpKTtcblx0XHRjb25zdCByZXNvdXJjZTIgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICd0ZXN0LnR4dCcpKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gc2VydmljZS5nZXRQcm92aWRlcihyZXNvdXJjZTEuc2NoZW1lKTtcblx0XHRhc3NlcnQub2socHJvdmlkZXIpO1xuXHRcdGFzc2VydC5vayhoYXNPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5KHByb3ZpZGVyKSk7XG5cblx0XHRjb25zdCBmZDEgPSBhd2FpdCBwcm92aWRlci5vcGVuKHJlc291cmNlMSwgeyBjcmVhdGU6IHRydWUsIHVubG9jazogZmFsc2UgfSk7XG5cdFx0Y29uc3QgZmQyID0gYXdhaXQgcHJvdmlkZXIub3BlbihyZXNvdXJjZTIsIHsgY3JlYXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlIH0pO1xuXG5cdFx0Y29uc3QgbmV3Q29udGVudCA9ICdIZWxsbyBXb3JsZCc7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcHJvdmlkZXIud3JpdGUoZmQxLCAwLCBWU0J1ZmZlci5mcm9tU3RyaW5nKG5ld0NvbnRlbnQpLmJ1ZmZlciwgMCwgVlNCdWZmZXIuZnJvbVN0cmluZyhuZXdDb250ZW50KS5idWZmZXIuYnl0ZUxlbmd0aCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IHByb21pc2VzLnJlYWRGaWxlKHJlc291cmNlMS5mc1BhdGgpKS50b1N0cmluZygpLCBuZXdDb250ZW50KTtcblxuXHRcdFx0YXdhaXQgcHJvdmlkZXIud3JpdGUoZmQyLCAwLCBWU0J1ZmZlci5mcm9tU3RyaW5nKG5ld0NvbnRlbnQpLmJ1ZmZlciwgMCwgVlNCdWZmZXIuZnJvbVN0cmluZyhuZXdDb250ZW50KS5idWZmZXIuYnl0ZUxlbmd0aCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IHByb21pc2VzLnJlYWRGaWxlKHJlc291cmNlMi5mc1BhdGgpKS50b1N0cmluZygpLCBuZXdDb250ZW50KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKFtcblx0XHRcdFx0YXdhaXQgcHJvdmlkZXIuY2xvc2UoZmQxKSxcblx0XHRcdFx0YXdhaXQgcHJvdmlkZXIuY2xvc2UoZmQyKVxuXHRcdFx0XSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdwcm92aWRlciAtIHdyaXRlIGJhcnJpZXIgbm90IGJlY29taW5nIHN0YWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG5ld0ZvbGRlciA9IGpvaW4odGVzdERpciwgJ25ldy1mb2xkZXInKTtcblx0XHRjb25zdCBuZXdSZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4obmV3Rm9sZGVyLCAnbG9yZW0udHh0JykpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBzZXJ2aWNlLmdldFByb3ZpZGVyKG5ld1Jlc291cmNlLnNjaGVtZSk7XG5cdFx0YXNzZXJ0Lm9rKHByb3ZpZGVyKTtcblx0XHRhc3NlcnQub2soaGFzT3BlblJlYWRXcml0ZUNsb3NlQ2FwYWJpbGl0eShwcm92aWRlcikpO1xuXG5cdFx0bGV0IGVycm9yOiBFcnJvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcHJvdmlkZXIub3BlbihuZXdSZXNvdXJjZSwgeyBjcmVhdGU6IHRydWUsIHVubG9jazogZmFsc2UgfSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0ZXJyb3IgPSBlO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhlcnJvcik7IC8vIGV4cGVjdGVkIGJlY2F1c2UgYG5ldy1mb2xkZXJgIGRvZXMgbm90IGV4aXN0XG5cblx0XHRhd2FpdCBwcm9taXNlcy5ta2RpcihuZXdGb2xkZXIpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IHJlYWRGaWxlU3luYyhVUkkuZmlsZShqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKSkuZnNQYXRoKTtcblx0XHRjb25zdCBuZXdDb250ZW50ID0gY29udGVudC50b1N0cmluZygpICsgY29udGVudC50b1N0cmluZygpO1xuXHRcdGNvbnN0IG5ld0NvbnRlbnRCdWZmZXIgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKG5ld0NvbnRlbnQpLmJ1ZmZlcjtcblxuXHRcdGNvbnN0IGZkID0gYXdhaXQgcHJvdmlkZXIub3BlbihuZXdSZXNvdXJjZSwgeyBjcmVhdGU6IHRydWUsIHVubG9jazogZmFsc2UgfSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHByb3ZpZGVyLndyaXRlKGZkLCAwLCBuZXdDb250ZW50QnVmZmVyLCAwLCBuZXdDb250ZW50QnVmZmVyLmJ5dGVMZW5ndGgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IHByb21pc2VzLnJlYWRGaWxlKG5ld1Jlc291cmNlLmZzUGF0aCkpLnRvU3RyaW5nKCksIG5ld0NvbnRlbnQpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBwcm92aWRlci5jbG9zZShmZCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdwcm92aWRlciAtIGF0b21pYyByZWFkcyAod3JpdGUgcGVuZGluZyB3aGVuIHJlYWQgc3RhcnRzKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2xvcmVtLnR4dCcpKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSByZWFkRmlsZVN5bmMocmVzb3VyY2UuZnNQYXRoKTtcblx0XHRjb25zdCBuZXdDb250ZW50ID0gY29udGVudC50b1N0cmluZygpICsgY29udGVudC50b1N0cmluZygpO1xuXHRcdGNvbnN0IG5ld0NvbnRlbnRCdWZmZXIgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKG5ld0NvbnRlbnQpLmJ1ZmZlcjtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gc2VydmljZS5nZXRQcm92aWRlcihyZXNvdXJjZS5zY2hlbWUpO1xuXHRcdGFzc2VydC5vayhwcm92aWRlcik7XG5cdFx0YXNzZXJ0Lm9rKGhhc09wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHkocHJvdmlkZXIpKTtcblx0XHRhc3NlcnQub2soaGFzRmlsZUF0b21pY1JlYWRDYXBhYmlsaXR5KHByb3ZpZGVyKSk7XG5cblx0XHRsZXQgYXRvbWljUmVhZFByb21pc2U6IFByb21pc2U8VWludDhBcnJheT4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZmQgPSBhd2FpdCBwcm92aWRlci5vcGVuKHJlc291cmNlLCB7IGNyZWF0ZTogdHJ1ZSwgdW5sb2NrOiBmYWxzZSB9KTtcblx0XHR0cnkge1xuXG5cdFx0XHQvLyBTdGFydCByZWFkaW5nIHdoaWxlIHdyaXRlIGlzIHBlbmRpbmdcblx0XHRcdGF0b21pY1JlYWRQcm9taXNlID0gcHJvdmlkZXIucmVhZEZpbGUocmVzb3VyY2UsIHsgYXRvbWljOiB0cnVlIH0pO1xuXG5cdFx0XHQvLyBTaW11bGF0ZSBhIHNsb3cgd3JpdGUsIGdpdmluZyB0aGUgcmVhZFxuXHRcdFx0Ly8gYSBjaGFuY2UgdG8gc3VjY2VlZCBpZiBpdCB3ZXJlIG5vdCBhdG9taWNcblx0XHRcdGF3YWl0IHRpbWVvdXQoMjApO1xuXG5cdFx0XHRhd2FpdCBwcm92aWRlci53cml0ZShmZCwgMCwgbmV3Q29udGVudEJ1ZmZlciwgMCwgbmV3Q29udGVudEJ1ZmZlci5ieXRlTGVuZ3RoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgcHJvdmlkZXIuY2xvc2UoZmQpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhhdG9taWNSZWFkUHJvbWlzZSk7XG5cblx0XHRjb25zdCBhdG9taWNSZWFkUmVzdWx0ID0gYXdhaXQgYXRvbWljUmVhZFByb21pc2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF0b21pY1JlYWRSZXN1bHQuYnl0ZUxlbmd0aCwgbmV3Q29udGVudEJ1ZmZlci5ieXRlTGVuZ3RoKTtcblx0fSk7XG5cblx0dGVzdCgncHJvdmlkZXIgLSBhdG9taWMgcmVhZHMgKHJlYWQgcGVuZGluZyB3aGVuIHdyaXRlIHN0YXJ0cyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gcmVhZEZpbGVTeW5jKHJlc291cmNlLmZzUGF0aCk7XG5cdFx0Y29uc3QgbmV3Q29udGVudCA9IGNvbnRlbnQudG9TdHJpbmcoKSArIGNvbnRlbnQudG9TdHJpbmcoKTtcblx0XHRjb25zdCBuZXdDb250ZW50QnVmZmVyID0gVlNCdWZmZXIuZnJvbVN0cmluZyhuZXdDb250ZW50KS5idWZmZXI7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHNlcnZpY2UuZ2V0UHJvdmlkZXIocmVzb3VyY2Uuc2NoZW1lKTtcblx0XHRhc3NlcnQub2socHJvdmlkZXIpO1xuXHRcdGFzc2VydC5vayhoYXNPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5KHByb3ZpZGVyKSk7XG5cdFx0YXNzZXJ0Lm9rKGhhc0ZpbGVBdG9taWNSZWFkQ2FwYWJpbGl0eShwcm92aWRlcikpO1xuXG5cdFx0bGV0IGF0b21pY1JlYWRQcm9taXNlID0gcHJvdmlkZXIucmVhZEZpbGUocmVzb3VyY2UsIHsgYXRvbWljOiB0cnVlIH0pO1xuXG5cdFx0Y29uc3QgZmRQcm9taXNlID0gcHJvdmlkZXIub3BlbihyZXNvdXJjZSwgeyBjcmVhdGU6IHRydWUsIHVubG9jazogZmFsc2UgfSkudGhlbihhc3luYyBmZCA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgcHJvdmlkZXIud3JpdGUoZmQsIDAsIG5ld0NvbnRlbnRCdWZmZXIsIDAsIG5ld0NvbnRlbnRCdWZmZXIuYnl0ZUxlbmd0aCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBwcm92aWRlci5jbG9zZShmZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRsZXQgYXRvbWljUmVhZFJlc3VsdCA9IGF3YWl0IGF0b21pY1JlYWRQcm9taXNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdG9taWNSZWFkUmVzdWx0LmJ5dGVMZW5ndGgsIGNvbnRlbnQuYnl0ZUxlbmd0aCk7XG5cblx0XHRhd2FpdCBmZFByb21pc2U7XG5cblx0XHRhdG9taWNSZWFkUHJvbWlzZSA9IHByb3ZpZGVyLnJlYWRGaWxlKHJlc291cmNlLCB7IGF0b21pYzogdHJ1ZSB9KTtcblx0XHRhdG9taWNSZWFkUmVzdWx0ID0gYXdhaXQgYXRvbWljUmVhZFByb21pc2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF0b21pY1JlYWRSZXN1bHQuYnl0ZUxlbmd0aCwgbmV3Q29udGVudEJ1ZmZlci5ieXRlTGVuZ3RoKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIChyZWFkYWJsZSkgLSBkZWZhdWx0JywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiB0ZXN0V3JpdGVGaWxlUmVhZGFibGUoKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIChyZWFkYWJsZSkgLSBidWZmZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSk7XG5cblx0XHRyZXR1cm4gdGVzdFdyaXRlRmlsZVJlYWRhYmxlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAocmVhZGFibGUpIC0gdW5idWZmZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSk7XG5cblx0XHRyZXR1cm4gdGVzdFdyaXRlRmlsZVJlYWRhYmxlKCk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RXcml0ZUZpbGVSZWFkYWJsZSgpIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsLnR4dCcpKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSByZWFkRmlsZVN5bmMocmVzb3VyY2UuZnNQYXRoKS50b1N0cmluZygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LCAnU21hbGwgRmlsZScpO1xuXG5cdFx0Y29uc3QgbmV3Q29udGVudCA9ICdVcGRhdGVzIHRvIHRoZSBzbWFsbCBmaWxlJztcblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgdG9MaW5lQnlMaW5lUmVhZGFibGUobmV3Q29udGVudCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRGaWxlU3luYyhyZXNvdXJjZS5mc1BhdGgpLnRvU3RyaW5nKCksIG5ld0NvbnRlbnQpO1xuXHR9XG5cblx0dGVzdCgnd3JpdGVGaWxlIChsYXJnZSBmaWxlIC0gcmVhZGFibGUpIC0gZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gdGVzdFdyaXRlRmlsZUxhcmdlUmVhZGFibGUoKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIChsYXJnZSBmaWxlIC0gcmVhZGFibGUpIC0gYnVmZmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UpO1xuXG5cdFx0cmV0dXJuIHRlc3RXcml0ZUZpbGVMYXJnZVJlYWRhYmxlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAobGFyZ2UgZmlsZSAtIHJlYWRhYmxlKSAtIHVuYnVmZmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUpO1xuXG5cdFx0cmV0dXJuIHRlc3RXcml0ZUZpbGVMYXJnZVJlYWRhYmxlKCk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RXcml0ZUZpbGVMYXJnZVJlYWRhYmxlKCkge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0JykpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IHJlYWRGaWxlU3luYyhyZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSBjb250ZW50LnRvU3RyaW5nKCkgKyBjb250ZW50LnRvU3RyaW5nKCk7XG5cblx0XHRjb25zdCBmaWxlU3RhdCA9IGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCB0b0xpbmVCeUxpbmVSZWFkYWJsZShuZXdDb250ZW50KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVTdGF0Lm5hbWUsICdsb3JlbS50eHQnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRmlsZVN5bmMocmVzb3VyY2UuZnNQYXRoKS50b1N0cmluZygpLCBuZXdDb250ZW50KTtcblx0fVxuXG5cdHRlc3QoJ3dyaXRlRmlsZSAoc3RyZWFtKSAtIGRlZmF1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHRlc3RXcml0ZUZpbGVTdHJlYW0oKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIChzdHJlYW0pIC0gYnVmZmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UpO1xuXG5cdFx0cmV0dXJuIHRlc3RXcml0ZUZpbGVTdHJlYW0oKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIChzdHJlYW0pIC0gdW5idWZmZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSk7XG5cblx0XHRyZXR1cm4gdGVzdFdyaXRlRmlsZVN0cmVhbSgpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0V3JpdGVGaWxlU3RyZWFtKCkge1xuXHRcdGNvbnN0IHNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsLnR4dCcpKTtcblx0XHRjb25zdCB0YXJnZXQgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbC1jb3B5LnR4dCcpKTtcblxuXHRcdGNvbnN0IGZpbGVTdGF0ID0gYXdhaXQgc2VydmljZS53cml0ZUZpbGUodGFyZ2V0LCBzdHJlYW1Ub0J1ZmZlclJlYWRhYmxlU3RyZWFtKGNyZWF0ZVJlYWRTdHJlYW0oc291cmNlLmZzUGF0aCkpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZVN0YXQubmFtZSwgJ3NtYWxsLWNvcHkudHh0Jyk7XG5cblx0XHRjb25zdCB0YXJnZXRDb250ZW50cyA9IHJlYWRGaWxlU3luYyh0YXJnZXQuZnNQYXRoKS50b1N0cmluZygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRmlsZVN5bmMoc291cmNlLmZzUGF0aCkudG9TdHJpbmcoKSwgdGFyZ2V0Q29udGVudHMpO1xuXHR9XG5cblx0dGVzdCgnd3JpdGVGaWxlIChsYXJnZSBmaWxlIC0gc3RyZWFtKSAtIGRlZmF1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHRlc3RXcml0ZUZpbGVMYXJnZVN0cmVhbSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgKGxhcmdlIGZpbGUgLSBzdHJlYW0pIC0gYnVmZmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UpO1xuXG5cdFx0cmV0dXJuIHRlc3RXcml0ZUZpbGVMYXJnZVN0cmVhbSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgKGxhcmdlIGZpbGUgLSBzdHJlYW0pIC0gdW5idWZmZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSk7XG5cblx0XHRyZXR1cm4gdGVzdFdyaXRlRmlsZUxhcmdlU3RyZWFtKCk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RXcml0ZUZpbGVMYXJnZVN0cmVhbSgpIHtcblx0XHRjb25zdCBzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKSk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnbG9yZW0tY29weS50eHQnKSk7XG5cblx0XHRjb25zdCBmaWxlU3RhdCA9IGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHRhcmdldCwgc3RyZWFtVG9CdWZmZXJSZWFkYWJsZVN0cmVhbShjcmVhdGVSZWFkU3RyZWFtKHNvdXJjZS5mc1BhdGgpKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVTdGF0Lm5hbWUsICdsb3JlbS1jb3B5LnR4dCcpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudHMgPSByZWFkRmlsZVN5bmModGFyZ2V0LmZzUGF0aCkudG9TdHJpbmcoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEZpbGVTeW5jKHNvdXJjZS5mc1BhdGgpLnRvU3RyaW5nKCksIHRhcmdldENvbnRlbnRzKTtcblx0fVxuXG5cdHRlc3QoJ3dyaXRlRmlsZSAoZmlsZSBpcyBjcmVhdGVkIGluY2x1ZGluZyBwYXJlbnRzKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ290aGVyJywgJ25ld2ZpbGUudHh0JykpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9ICdGaWxlIGlzIGNyZWF0ZWQgaW5jbHVkaW5nIHBhcmVudCc7XG5cdFx0Y29uc3QgZmlsZVN0YXQgPSBhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVTdGF0Lm5hbWUsICduZXdmaWxlLnR4dCcpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRGaWxlU3luYyhyZXNvdXJjZS5mc1BhdGgpLnRvU3RyaW5nKCksIGNvbnRlbnQpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgLSBsb2NrZWQgZmlsZXMgYW5kIHVubG9ja2luZycsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSB8IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlV3JpdGVVbmxvY2spO1xuXG5cdFx0cmV0dXJuIHRlc3RMb2NrZWRGaWxlcyhmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAoc3RyZWFtKSAtIGxvY2tlZCBmaWxlcyBhbmQgdW5sb2NraW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlIHwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVXcml0ZVVubG9jayk7XG5cblx0XHRyZXR1cm4gdGVzdExvY2tlZEZpbGVzKGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIC0gbG9ja2VkIGZpbGVzIGFuZCB1bmxvY2tpbmcgdGhyb3dzIGVycm9yIHdoZW4gbWlzc2luZyBjYXBhYmlsaXR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlKTtcblxuXHRcdHJldHVybiB0ZXN0TG9ja2VkRmlsZXModHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAoc3RyZWFtKSAtIGxvY2tlZCBmaWxlcyBhbmQgdW5sb2NraW5nIHRocm93cyBlcnJvciB3aGVuIG1pc3NpbmcgY2FwYWJpbGl0eScsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSk7XG5cblx0XHRyZXR1cm4gdGVzdExvY2tlZEZpbGVzKHRydWUpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0TG9ja2VkRmlsZXMoZXhwZWN0RXJyb3I6IGJvb2xlYW4pIHtcblx0XHRjb25zdCBsb2NrZWRGaWxlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnbXktbG9ja2VkLWZpbGUnKSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgc2VydmljZS53cml0ZUZpbGUobG9ja2VkRmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnTG9ja2VkIEZpbGUnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQubG9ja2VkLCBmYWxzZSk7XG5cblx0XHRjb25zdCBzdGF0cyA9IGF3YWl0IHByb21pc2VzLnN0YXQobG9ja2VkRmlsZS5mc1BhdGgpO1xuXHRcdGF3YWl0IHByb21pc2VzLmNobW9kKGxvY2tlZEZpbGUuZnNQYXRoLCBzdGF0cy5tb2RlICYgfjBvMjAwKTtcblxuXHRcdGxldCBzdGF0ID0gYXdhaXQgc2VydmljZS5zdGF0KGxvY2tlZEZpbGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0LmxvY2tlZCwgdHJ1ZSk7XG5cblx0XHRsZXQgZXJyb3I7XG5cdFx0Y29uc3QgbmV3Q29udGVudCA9ICdVcGRhdGVzIHRvIGxvY2tlZCBmaWxlJztcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUobG9ja2VkRmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhuZXdDb250ZW50KSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0ZXJyb3IgPSBlO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhlcnJvcik7XG5cdFx0ZXJyb3IgPSB1bmRlZmluZWQ7XG5cblx0XHRpZiAoZXhwZWN0RXJyb3IpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKGxvY2tlZEZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcobmV3Q29udGVudCksIHsgdW5sb2NrOiB0cnVlIH0pO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRlcnJvciA9IGU7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5vayhlcnJvcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKGxvY2tlZEZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcobmV3Q29udGVudCksIHsgdW5sb2NrOiB0cnVlIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRGaWxlU3luYyhsb2NrZWRGaWxlLmZzUGF0aCkudG9TdHJpbmcoKSwgbmV3Q29udGVudCk7XG5cblx0XHRcdHN0YXQgPSBhd2FpdCBzZXJ2aWNlLnN0YXQobG9ja2VkRmlsZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdC5sb2NrZWQsIGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHR0ZXN0KCd3cml0ZUZpbGUgKGVycm9yIHdoZW4gZm9sZGVyIGlzIGVuY291bnRlcmVkKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKHRlc3REaXIpO1xuXG5cdFx0bGV0IGVycm9yOiBFcnJvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ0ZpbGUgaXMgY3JlYXRlZCBpbmNsdWRpbmcgcGFyZW50JykpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0ZXJyb3IgPSBlcnI7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGVycm9yKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIChubyBlcnJvciB3aGVuIHByb3ZpZGluZyB1cCB0byBkYXRlIGV0YWcpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc21hbGwudHh0JykpO1xuXG5cdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShyZXNvdXJjZSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gcmVhZEZpbGVTeW5jKHJlc291cmNlLmZzUGF0aCkudG9TdHJpbmcoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudCwgJ1NtYWxsIEZpbGUnKTtcblxuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSAnVXBkYXRlcyB0byB0aGUgc21hbGwgZmlsZSc7XG5cdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcobmV3Q29udGVudCksIHsgZXRhZzogc3RhdC5ldGFnLCBtdGltZTogc3RhdC5tdGltZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRmlsZVN5bmMocmVzb3VyY2UuZnNQYXRoKS50b1N0cmluZygpLCBuZXdDb250ZW50KTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIC0gZXJyb3Igd2hlbiB3cml0aW5nIHRvIGZpbGUgdGhhdCBoYXMgYmVlbiB1cGRhdGVkIG1lYW53aGlsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsLnR4dCcpKTtcblxuXHRcdGNvbnN0IHN0YXQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUocmVzb3VyY2UpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IHJlYWRGaWxlU3luYyhyZXNvdXJjZS5mc1BhdGgpLnRvU3RyaW5nKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQsICdTbWFsbCBGaWxlJyk7XG5cblx0XHRjb25zdCBuZXdDb250ZW50ID0gJ1VwZGF0ZXMgdG8gdGhlIHNtYWxsIGZpbGUnO1xuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKG5ld0NvbnRlbnQpLCB7IGV0YWc6IHN0YXQuZXRhZywgbXRpbWU6IHN0YXQubXRpbWUgfSk7XG5cblx0XHRjb25zdCBuZXdDb250ZW50TGVhZGluZ1RvRXJyb3IgPSBuZXdDb250ZW50ICsgbmV3Q29udGVudDtcblxuXHRcdGNvbnN0IGZha2VNdGltZSA9IDEwMDA7XG5cdFx0Y29uc3QgZmFrZVNpemUgPSAxMDAwO1xuXG5cdFx0bGV0IGVycm9yOiBGaWxlT3BlcmF0aW9uRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKG5ld0NvbnRlbnRMZWFkaW5nVG9FcnJvciksIHsgZXRhZzogZXRhZyh7IG10aW1lOiBmYWtlTXRpbWUsIHNpemU6IGZha2VTaXplIH0pLCBtdGltZTogZmFrZU10aW1lIH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0ZXJyb3IgPSBlcnI7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGVycm9yKTtcblx0XHRhc3NlcnQub2soZXJyb3IgaW5zdGFuY2VvZiBGaWxlT3BlcmF0aW9uRXJyb3IpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvci5maWxlT3BlcmF0aW9uUmVzdWx0LCBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTU9ESUZJRURfU0lOQ0UpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgLSBubyBlcnJvciB3aGVuIHdyaXRpbmcgdG8gZmlsZSB3aGVyZSBzaXplIGlzIHRoZSBzYW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc21hbGwudHh0JykpO1xuXG5cdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShyZXNvdXJjZSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gcmVhZEZpbGVTeW5jKHJlc291cmNlLmZzUGF0aCkudG9TdHJpbmcoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudCwgJ1NtYWxsIEZpbGUnKTtcblxuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSBjb250ZW50OyAvLyBzYW1lIGNvbnRlbnRcblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhuZXdDb250ZW50KSwgeyBldGFnOiBzdGF0LmV0YWcsIG10aW1lOiBzdGF0Lm10aW1lIH0pO1xuXG5cdFx0Y29uc3QgbmV3Q29udGVudExlYWRpbmdUb05vRXJyb3IgPSBuZXdDb250ZW50OyAvLyB3cml0aW5nIHRoZSBzYW1lIGNvbnRlbnQgc2hvdWxkIGJlIE9LXG5cblx0XHRjb25zdCBmYWtlTXRpbWUgPSAxMDAwO1xuXHRcdGNvbnN0IGFjdHVhbFNpemUgPSBuZXdDb250ZW50Lmxlbmd0aDtcblxuXHRcdGxldCBlcnJvcjogRmlsZU9wZXJhdGlvbkVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhuZXdDb250ZW50TGVhZGluZ1RvTm9FcnJvciksIHsgZXRhZzogZXRhZyh7IG10aW1lOiBmYWtlTXRpbWUsIHNpemU6IGFjdHVhbFNpemUgfSksIG10aW1lOiBmYWtlTXRpbWUgfSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRlcnJvciA9IGVycjtcblx0XHR9XG5cblx0XHRhc3NlcnQub2soIWVycm9yKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIC0gbm8gZXJyb3Igd2hlbiB3cml0aW5nIHRvIGZpbGUgd2hlcmUgY29udGVudCBpcyB0aGUgc2FtZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsLnR4dCcpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UucmVzb2x2ZShyZXNvdXJjZSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gcmVhZEZpbGVTeW5jKHJlc291cmNlLmZzUGF0aCkudG9TdHJpbmcoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudCwgJ1NtYWxsIEZpbGUnKTtcblxuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSBjb250ZW50OyAvLyBzYW1lIGNvbnRlbnRcblx0XHRsZXQgZXJyb3I6IEZpbGVPcGVyYXRpb25FcnJvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcobmV3Q29udGVudCksIHsgZXRhZzogJ2FueXRoaW5nJywgbXRpbWU6IDAgfSAvKiBmYWtlIGl0ICovKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGVycm9yID0gZXJyO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayghZXJyb3IpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgLSBlcnJvciB3aGVuIHdyaXRpbmcgdG8gZmlsZSB3aGVyZSBjb250ZW50IGlzIHRoZSBzYW1lIGxlbmd0aCBidXQgZGlmZmVyZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc21hbGwudHh0JykpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5yZXNvbHZlKHJlc291cmNlKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSByZWFkRmlsZVN5bmMocmVzb3VyY2UuZnNQYXRoKS50b1N0cmluZygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LCAnU21hbGwgRmlsZScpO1xuXG5cdFx0Y29uc3QgbmV3Q29udGVudCA9IGNvbnRlbnQuc3BsaXQoJycpLnJldmVyc2UoKS5qb2luKCcnKTsgLy8gcmV2ZXJzZSBjb250ZW50XG5cdFx0bGV0IGVycm9yOiBGaWxlT3BlcmF0aW9uRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKG5ld0NvbnRlbnQpLCB7IGV0YWc6ICdhbnl0aGluZycsIG10aW1lOiAwIH0gLyogZmFrZSBpdCAqLyk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRlcnJvciA9IGVycjtcblx0XHR9XG5cblx0XHRhc3NlcnQub2soZXJyb3IpO1xuXHRcdGFzc2VydC5vayhlcnJvciBpbnN0YW5jZW9mIEZpbGVPcGVyYXRpb25FcnJvcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLmZpbGVPcGVyYXRpb25SZXN1bHQsIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9NT0RJRklFRF9TSU5DRSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAtIG5vIGVycm9yIHdoZW4gd3JpdGluZyB0byBzYW1lIG5vbmV4aXN0ZW50IGZvbGRlciBtdWx0aXBsZSB0aW1lcyBkaWZmZXJlbnQgbmV3IGZpbGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG5ld0ZvbGRlciA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NvbWUnLCAnbmV3JywgJ2ZvbGRlcicpKTtcblxuXHRcdGNvbnN0IGZpbGUxID0gam9pblBhdGgobmV3Rm9sZGVyLCAnZmlsZS0xJyk7XG5cdFx0Y29uc3QgZmlsZTIgPSBqb2luUGF0aChuZXdGb2xkZXIsICdmaWxlLTInKTtcblx0XHRjb25zdCBmaWxlMyA9IGpvaW5QYXRoKG5ld0ZvbGRlciwgJ2ZpbGUtMycpO1xuXG5cdFx0Ly8gdGhpcyBlc3NlbnRpYWxseSB2ZXJpZmllcyB0aGF0IHRoZSBta2RpcnAgbG9naWMgaW1wbGVtZW50ZWRcblx0XHQvLyBpbiB0aGUgZmlsZSBzZXJ2aWNlIGlzIGFibGUgdG8gcmVjZWl2ZSBtdWx0aXBsZSByZXF1ZXN0cyBmb3Jcblx0XHQvLyB0aGUgc2FtZSBmb2xkZXIgYW5kIHdpbGwgbm90IHRocm93IGVycm9ycyBpZiBhbm90aGVyIHJhY2luZ1xuXHRcdC8vIGNhbGwgc3VjY2VlZGVkIGZpcnN0LlxuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSAnVXBkYXRlcyB0byB0aGUgc21hbGwgZmlsZSc7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0c2VydmljZS53cml0ZUZpbGUoZmlsZTEsIFZTQnVmZmVyLmZyb21TdHJpbmcobmV3Q29udGVudCkpLFxuXHRcdFx0c2VydmljZS53cml0ZUZpbGUoZmlsZTIsIFZTQnVmZmVyLmZyb21TdHJpbmcobmV3Q29udGVudCkpLFxuXHRcdFx0c2VydmljZS53cml0ZUZpbGUoZmlsZTMsIFZTQnVmZmVyLmZyb21TdHJpbmcobmV3Q29udGVudCkpXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQub2soc2VydmljZS5leGlzdHMoZmlsZTEpKTtcblx0XHRhc3NlcnQub2soc2VydmljZS5leGlzdHMoZmlsZTIpKTtcblx0XHRhc3NlcnQub2soc2VydmljZS5leGlzdHMoZmlsZTMpKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIC0gZXJyb3Igd2hlbiB3cml0aW5nIHRvIGZvbGRlciB0aGF0IGlzIGEgZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBleGlzdGluZ0ZpbGUgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdteS1maWxlJykpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGVGaWxlKGV4aXN0aW5nRmlsZSk7XG5cblx0XHRjb25zdCBuZXdGaWxlID0gam9pblBhdGgoZXhpc3RpbmdGaWxlLCAnZmlsZS0xJyk7XG5cblx0XHRsZXQgZXJyb3I7XG5cdFx0Y29uc3QgbmV3Q29udGVudCA9ICdVcGRhdGVzIHRvIHRoZSBzbWFsbCBmaWxlJztcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUobmV3RmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhuZXdDb250ZW50KSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0ZXJyb3IgPSBlO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhlcnJvcik7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGVuZEZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUgfCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUFwcGVuZCk7XG5cblx0XHRyZXR1cm4gdGVzdEFwcGVuZEZpbGUoKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwZW5kRmlsZSAtIGJ1ZmZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlIHwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVBcHBlbmQpO1xuXG5cdFx0cmV0dXJuIHRlc3RBcHBlbmRGaWxlKCk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RBcHBlbmRGaWxlKCkge1xuXHRcdGxldCBldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUnVuT3BlcmF0aW9uKGUgPT4gZXZlbnQgPSBlKSk7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsLnR4dCcpKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSByZWFkRmlsZVN5bmMocmVzb3VyY2UuZnNQYXRoKS50b1N0cmluZygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LCAnU21hbGwgRmlsZScpO1xuXG5cdFx0Y29uc3QgYXBwZW5kQ29udGVudCA9ICcgLSBBcHBlbmRlZCEnO1xuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGFwcGVuZENvbnRlbnQpLCB7IGFwcGVuZDogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5vayhldmVudCEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEucmVzb3VyY2UuZnNQYXRoLCByZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEub3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uLldSSVRFKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRmlsZVN5bmMocmVzb3VyY2UuZnNQYXRoKS50b1N0cmluZygpLCAnU21hbGwgRmlsZSAtIEFwcGVuZGVkIScpO1xuXHR9XG5cblx0dGVzdCgnYXBwZW5kRmlsZSAocmVhZGFibGUpJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlIHwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVBcHBlbmQpO1xuXG5cdFx0cmV0dXJuIHRlc3RBcHBlbmRGaWxlUmVhZGFibGUoKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwZW5kRmlsZSAocmVhZGFibGUpIC0gYnVmZmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UgfCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUFwcGVuZCk7XG5cblx0XHRyZXR1cm4gdGVzdEFwcGVuZEZpbGVSZWFkYWJsZSgpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0QXBwZW5kRmlsZVJlYWRhYmxlKCkge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc21hbGwudHh0JykpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IHJlYWRGaWxlU3luYyhyZXNvdXJjZS5mc1BhdGgpLnRvU3RyaW5nKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQsICdTbWFsbCBGaWxlJyk7XG5cblx0XHRjb25zdCBhcHBlbmRDb250ZW50ID0gJyAtIEFwcGVuZGVkIHZpYSByZWFkYWJsZSEnO1xuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBidWZmZXJUb1JlYWRhYmxlKFZTQnVmZmVyLmZyb21TdHJpbmcoYXBwZW5kQ29udGVudCkpLCB7IGFwcGVuZDogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRmlsZVN5bmMocmVzb3VyY2UuZnNQYXRoKS50b1N0cmluZygpLCAnU21hbGwgRmlsZSAtIEFwcGVuZGVkIHZpYSByZWFkYWJsZSEnKTtcblx0fVxuXG5cdHRlc3QoJ2FwcGVuZEZpbGUgKHN0cmVhbSknLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUgfCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUFwcGVuZCk7XG5cblx0XHRyZXR1cm4gdGVzdEFwcGVuZEZpbGVTdHJlYW0oKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwZW5kRmlsZSAoc3RyZWFtKSAtIGJ1ZmZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlIHwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVBcHBlbmQpO1xuXG5cdFx0cmV0dXJuIHRlc3RBcHBlbmRGaWxlU3RyZWFtKCk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RBcHBlbmRGaWxlU3RyZWFtKCkge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc21hbGwudHh0JykpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IHJlYWRGaWxlU3luYyhyZXNvdXJjZS5mc1BhdGgpLnRvU3RyaW5nKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQsICdTbWFsbCBGaWxlJyk7XG5cblx0XHRjb25zdCBhcHBlbmRDb250ZW50ID0gJyAtIEFwcGVuZGVkIHZpYSBzdHJlYW0hJztcblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgYnVmZmVyVG9TdHJlYW0oVlNCdWZmZXIuZnJvbVN0cmluZyhhcHBlbmRDb250ZW50KSksIHsgYXBwZW5kOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRGaWxlU3luYyhyZXNvdXJjZS5mc1BhdGgpLnRvU3RyaW5nKCksICdTbWFsbCBGaWxlIC0gQXBwZW5kZWQgdmlhIHN0cmVhbSEnKTtcblx0fVxuXG5cdHRlc3QoJ2FwcGVuZEZpbGUgLSBjcmVhdGVzIGZpbGUgaWYgbm90IGV4aXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSB8IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlQXBwZW5kKTtcblxuXHRcdHJldHVybiB0ZXN0QXBwZW5kRmlsZUNyZWF0ZXNGaWxlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGVuZEZpbGUgLSBjcmVhdGVzIGZpbGUgaWYgbm90IGV4aXN0cyAoYnVmZmVyZWQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlIHwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVBcHBlbmQpO1xuXG5cdFx0cmV0dXJuIHRlc3RBcHBlbmRGaWxlQ3JlYXRlc0ZpbGUoKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdEFwcGVuZEZpbGVDcmVhdGVzRmlsZSgpIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2FwcGVuZGZpbGUtbmV3LnR4dCcpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKHJlc291cmNlLmZzUGF0aCksIGZhbHNlKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSAnSW5pdGlhbCBjb250ZW50IHZpYSBhcHBlbmQnO1xuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpLCB7IGFwcGVuZDogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKHJlc291cmNlLmZzUGF0aCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRmlsZVN5bmMocmVzb3VyY2UuZnNQYXRoKS50b1N0cmluZygpLCBjb250ZW50KTtcblx0fVxuXG5cdHRlc3QoJ2FwcGVuZEZpbGUgLSBtdWx0aXBsZSBhcHBlbmRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlIHwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVBcHBlbmQpO1xuXG5cdFx0cmV0dXJuIHRlc3RBcHBlbmRGaWxlTXVsdGlwbGUoKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwZW5kRmlsZSAtIG11bHRpcGxlIGFwcGVuZHMgKGJ1ZmZlcmVkKScsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSB8IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlQXBwZW5kKTtcblxuXHRcdHJldHVybiB0ZXN0QXBwZW5kRmlsZU11bHRpcGxlKCk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RBcHBlbmRGaWxlTXVsdGlwbGUoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdhcHBlbmRmaWxlLW11bHRpcGxlLnR4dCcpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdMaW5lIDFcXG4nKSwgeyBhcHBlbmQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ0xpbmUgMlxcbicpLCB7IGFwcGVuZDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnTGluZSAzXFxuJyksIHsgYXBwZW5kOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRGaWxlU3luYyhyZXNvdXJjZS5mc1BhdGgpLnRvU3RyaW5nKCksICdMaW5lIDFcXG5MaW5lIDJcXG5MaW5lIDNcXG4nKTtcblx0fVxuXG5cdHRlc3QoJ2FwcGVuZEZpbGUgLSB0aHJvd3Mgd2hlbiBwcm92aWRlciBkb2VzIG5vdCBzdXBwb3J0IGFwcGVuZCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBSZW1vdmUgRmlsZUFwcGVuZCBjYXBhYmlsaXR5IC0gc2hvdWxkIHRocm93IGVycm9yXG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbC50eHQnKSk7XG5cdFx0Y29uc3QgYXBwZW5kQ29udGVudCA9ICcgLSBBcHBlbmRlZCB2aWEgZmFsbGJhY2shJztcblxuXHRcdGxldCBlcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGFwcGVuZENvbnRlbnQpLCB7IGFwcGVuZDogdHJ1ZSB9KTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRlcnJvciA9IGUgYXMgRXJyb3I7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGVycm9yKTtcblx0XHRhc3NlcnQub2soZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnZG9lcyBub3Qgc3VwcG9ydCBhcHBlbmQnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWQgLSBtaXhlZCBwb3NpdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKSk7XG5cblx0XHQvLyByZWFkIG11bHRpcGxlIHRpbWVzIGZyb20gcG9zaXRpb24gMFxuXHRcdGxldCBidWZmZXIgPSBWU0J1ZmZlci5hbGxvYygxMDI0KTtcblx0XHRsZXQgZmQgPSBhd2FpdCBmaWxlUHJvdmlkZXIub3BlbihyZXNvdXJjZSwgeyBjcmVhdGU6IGZhbHNlIH0pO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMzsgaSsrKSB7XG5cdFx0XHRhd2FpdCBmaWxlUHJvdmlkZXIucmVhZChmZCwgMCwgYnVmZmVyLmJ1ZmZlciwgMCwgMjYpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1ZmZlci5zbGljZSgwLCAyNikudG9TdHJpbmcoKSwgJ0xvcmVtIGlwc3VtIGRvbG9yIHNpdCBhbWV0Jyk7XG5cdFx0fVxuXHRcdGF3YWl0IGZpbGVQcm92aWRlci5jbG9zZShmZCk7XG5cblx0XHQvLyByZWFkIG11bHRpcGxlIHRpbWVzIGF0IHZhcmlvdXMgbG9jYXRpb25zXG5cdFx0YnVmZmVyID0gVlNCdWZmZXIuYWxsb2MoMTAyNCk7XG5cdFx0ZmQgPSBhd2FpdCBmaWxlUHJvdmlkZXIub3BlbihyZXNvdXJjZSwgeyBjcmVhdGU6IGZhbHNlIH0pO1xuXG5cdFx0bGV0IHBvc0luRmlsZSA9IDA7XG5cblx0XHRhd2FpdCBmaWxlUHJvdmlkZXIucmVhZChmZCwgcG9zSW5GaWxlLCBidWZmZXIuYnVmZmVyLCAwLCAyNik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1ZmZlci5zbGljZSgwLCAyNikudG9TdHJpbmcoKSwgJ0xvcmVtIGlwc3VtIGRvbG9yIHNpdCBhbWV0Jyk7XG5cdFx0cG9zSW5GaWxlICs9IDI2O1xuXG5cdFx0YXdhaXQgZmlsZVByb3ZpZGVyLnJlYWQoZmQsIHBvc0luRmlsZSwgYnVmZmVyLmJ1ZmZlciwgMCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1ZmZlci5zbGljZSgwLCAxKS50b1N0cmluZygpLCAnLCcpO1xuXHRcdHBvc0luRmlsZSArPSAxO1xuXG5cdFx0YXdhaXQgZmlsZVByb3ZpZGVyLnJlYWQoZmQsIHBvc0luRmlsZSwgYnVmZmVyLmJ1ZmZlciwgMCwgMTIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWZmZXIuc2xpY2UoMCwgMTIpLnRvU3RyaW5nKCksICcgY29uc2VjdGV0dXInKTtcblx0XHRwb3NJbkZpbGUgKz0gMTI7XG5cblx0XHRhd2FpdCBmaWxlUHJvdmlkZXIucmVhZChmZCwgOTggLyogbm8gbG9uZ2VyIGluIHNlcXVlbmNlIG9mIHBvc0luRmlsZSAqLywgYnVmZmVyLmJ1ZmZlciwgMCwgOSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1ZmZlci5zbGljZSgwLCA5KS50b1N0cmluZygpLCAnZmVybWVudHVtJyk7XG5cblx0XHRhd2FpdCBmaWxlUHJvdmlkZXIucmVhZChmZCwgMjcsIGJ1ZmZlci5idWZmZXIsIDAsIDEyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVmZmVyLnNsaWNlKDAsIDEyKS50b1N0cmluZygpLCAnIGNvbnNlY3RldHVyJyk7XG5cblx0XHRhd2FpdCBmaWxlUHJvdmlkZXIucmVhZChmZCwgMjYsIGJ1ZmZlci5idWZmZXIsIDAsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWZmZXIuc2xpY2UoMCwgMSkudG9TdHJpbmcoKSwgJywnKTtcblxuXHRcdGF3YWl0IGZpbGVQcm92aWRlci5yZWFkKGZkLCAwLCBidWZmZXIuYnVmZmVyLCAwLCAyNik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1ZmZlci5zbGljZSgwLCAyNikudG9TdHJpbmcoKSwgJ0xvcmVtIGlwc3VtIGRvbG9yIHNpdCBhbWV0Jyk7XG5cblx0XHRhd2FpdCBmaWxlUHJvdmlkZXIucmVhZChmZCwgcG9zSW5GaWxlIC8qIGJhY2sgaW4gc2VxdWVuY2UgKi8sIGJ1ZmZlci5idWZmZXIsIDAsIDExKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVmZmVyLnNsaWNlKDAsIDExKS50b1N0cmluZygpLCAnIGFkaXBpc2NpbmcnKTtcblxuXHRcdGF3YWl0IGZpbGVQcm92aWRlci5jbG9zZShmZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlIC0gbWl4ZWQgcG9zaXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0JykpO1xuXG5cdFx0Y29uc3QgYnVmZmVyID0gVlNCdWZmZXIuYWxsb2MoMTAyNCk7XG5cdFx0Y29uc3QgZmRXcml0ZSA9IGF3YWl0IGZpbGVQcm92aWRlci5vcGVuKHJlc291cmNlLCB7IGNyZWF0ZTogdHJ1ZSwgdW5sb2NrOiBmYWxzZSB9KTtcblx0XHRjb25zdCBmZFJlYWQgPSBhd2FpdCBmaWxlUHJvdmlkZXIub3BlbihyZXNvdXJjZSwgeyBjcmVhdGU6IGZhbHNlIH0pO1xuXG5cdFx0bGV0IHBvc0luRmlsZVdyaXRlID0gMDtcblx0XHRsZXQgcG9zSW5GaWxlUmVhZCA9IDA7XG5cblx0XHRjb25zdCBpbml0aWFsQ29udGVudHMgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKCdMb3JlbSBpcHN1bSBkb2xvciBzaXQgYW1ldCcpO1xuXHRcdGF3YWl0IGZpbGVQcm92aWRlci53cml0ZShmZFdyaXRlLCBwb3NJbkZpbGVXcml0ZSwgaW5pdGlhbENvbnRlbnRzLmJ1ZmZlciwgMCwgaW5pdGlhbENvbnRlbnRzLmJ5dGVMZW5ndGgpO1xuXHRcdHBvc0luRmlsZVdyaXRlICs9IGluaXRpYWxDb250ZW50cy5ieXRlTGVuZ3RoO1xuXG5cdFx0YXdhaXQgZmlsZVByb3ZpZGVyLnJlYWQoZmRSZWFkLCBwb3NJbkZpbGVSZWFkLCBidWZmZXIuYnVmZmVyLCAwLCAyNik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1ZmZlci5zbGljZSgwLCAyNikudG9TdHJpbmcoKSwgJ0xvcmVtIGlwc3VtIGRvbG9yIHNpdCBhbWV0Jyk7XG5cdFx0cG9zSW5GaWxlUmVhZCArPSAyNjtcblxuXHRcdGNvbnN0IGNvbnRlbnRzID0gVlNCdWZmZXIuZnJvbVN0cmluZygnSGVsbG8gV29ybGQnKTtcblxuXHRcdGF3YWl0IGZpbGVQcm92aWRlci53cml0ZShmZFdyaXRlLCBwb3NJbkZpbGVXcml0ZSwgY29udGVudHMuYnVmZmVyLCAwLCBjb250ZW50cy5ieXRlTGVuZ3RoKTtcblx0XHRwb3NJbkZpbGVXcml0ZSArPSBjb250ZW50cy5ieXRlTGVuZ3RoO1xuXG5cdFx0YXdhaXQgZmlsZVByb3ZpZGVyLnJlYWQoZmRSZWFkLCBwb3NJbkZpbGVSZWFkLCBidWZmZXIuYnVmZmVyLCAwLCBjb250ZW50cy5ieXRlTGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVmZmVyLnNsaWNlKDAsIGNvbnRlbnRzLmJ5dGVMZW5ndGgpLnRvU3RyaW5nKCksICdIZWxsbyBXb3JsZCcpO1xuXHRcdHBvc0luRmlsZVJlYWQgKz0gY29udGVudHMuYnl0ZUxlbmd0aDtcblxuXHRcdGF3YWl0IGZpbGVQcm92aWRlci53cml0ZShmZFdyaXRlLCA2LCBjb250ZW50cy5idWZmZXIsIDAsIGNvbnRlbnRzLmJ5dGVMZW5ndGgpO1xuXG5cdFx0YXdhaXQgZmlsZVByb3ZpZGVyLnJlYWQoZmRSZWFkLCAwLCBidWZmZXIuYnVmZmVyLCAwLCAxMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1ZmZlci5zbGljZSgwLCAxMSkudG9TdHJpbmcoKSwgJ0xvcmVtIEhlbGxvJyk7XG5cblx0XHRhd2FpdCBmaWxlUHJvdmlkZXIud3JpdGUoZmRXcml0ZSwgcG9zSW5GaWxlV3JpdGUsIGNvbnRlbnRzLmJ1ZmZlciwgMCwgY29udGVudHMuYnl0ZUxlbmd0aCk7XG5cdFx0cG9zSW5GaWxlV3JpdGUgKz0gY29udGVudHMuYnl0ZUxlbmd0aDtcblxuXHRcdGF3YWl0IGZpbGVQcm92aWRlci5yZWFkKGZkUmVhZCwgcG9zSW5GaWxlV3JpdGUgLSBjb250ZW50cy5ieXRlTGVuZ3RoLCBidWZmZXIuYnVmZmVyLCAwLCBjb250ZW50cy5ieXRlTGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVmZmVyLnNsaWNlKDAsIGNvbnRlbnRzLmJ5dGVMZW5ndGgpLnRvU3RyaW5nKCksICdIZWxsbyBXb3JsZCcpO1xuXG5cdFx0YXdhaXQgZmlsZVByb3ZpZGVyLmNsb3NlKGZkV3JpdGUpO1xuXHRcdGF3YWl0IGZpbGVQcm92aWRlci5jbG9zZShmZFJlYWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkb25seSAtIGlzIGhhbmRsZWQgcHJvcGVybHkgZm9yIGEgc2luZ2xlIHJlc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGZpbGVQcm92aWRlci5zZXRSZWFkb25seSh0cnVlKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnaW5kZXguaHRtbCcpKTtcblxuXHRcdGNvbnN0IHJlc29sdmVSZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUocmVzb3VyY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlUmVzdWx0LnJlYWRvbmx5LCB0cnVlKTtcblxuXHRcdGNvbnN0IHJlYWRSZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZFJlc3VsdC5yZWFkb25seSwgdHJ1ZSk7XG5cblx0XHRsZXQgd3JpdGVGaWxlRXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnSGVsbG8gVGVzdCcpKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0d3JpdGVGaWxlRXJyb3IgPSBlcnJvcjtcblx0XHR9XG5cdFx0YXNzZXJ0Lm9rKHdyaXRlRmlsZUVycm9yKTtcblxuXHRcdGxldCBkZWxldGVGaWxlRXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmRlbChyZXNvdXJjZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGRlbGV0ZUZpbGVFcnJvciA9IGVycm9yO1xuXHRcdH1cblx0XHRhc3NlcnQub2soZGVsZXRlRmlsZUVycm9yKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGtCQUFrQixZQUFZLGFBQWEsY0FBYyxVQUFVLGVBQWUsZ0JBQWdCO0FBQzNHLFNBQVMsY0FBYztBQUN2QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0IsZ0JBQWdCLGdCQUFnQiw4QkFBOEIsZ0JBQTBEO0FBQ25KLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsWUFBWSxlQUFlO0FBQ3BDLFNBQVMsVUFBVSxTQUFTLE1BQU0sYUFBYTtBQUMvQyxTQUFTLFNBQVMsaUJBQWlCO0FBQ25DLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFlBQVkseUJBQXlCO0FBQzlDLFNBQVMsTUFBOEIsZUFBZSxvQkFBd0MscUJBQXFCLGdCQUFnQixnQ0FBZ0MsNkJBQTZCLGlDQUE0RixvQ0FBb0Msa0NBQXNEO0FBQ3RYLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsVUFBVSxNQUFpQixNQUFxQztBQUN4RSxNQUFJLEtBQUssYUFBYSxRQUFXO0FBQ2hDLFdBQU87QUFBQSxFQUNSO0FBRUEsU0FBTyxLQUFLLFNBQVMsS0FBSyxXQUFTLE1BQU0sU0FBUyxJQUFJO0FBQ3ZEO0FBRUEsU0FBUyxxQkFBcUIsU0FBbUM7QUFDaEUsTUFBSSxTQUFTLFFBQVEsTUFBTSxJQUFJO0FBQy9CLFdBQVMsT0FBTyxJQUFJLENBQUMsT0FBTyxVQUFVO0FBQ3JD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YSxLQUFLLFFBQVEsZUFBZSxPQUFPLFFBQVEsR0FBRyxTQUFTLFVBQVU7QUFDcEYsV0FBTyxZQUFZLE9BQU8sTUFBTSxHQUFHLFNBQVMsVUFBVSxFQUFFLFNBQVMsR0FBRyxhQUFhO0FBQ2pGLHFCQUFpQixTQUFTO0FBRTFCLFVBQU0sYUFBYSxNQUFNLFNBQVMsR0FBRyxTQUFTLFFBQVEsR0FBRyxTQUFTLFVBQVU7QUFFNUUsVUFBTSxhQUFhLEtBQUssUUFBUSxHQUFHLE9BQU8sUUFBUSxHQUFHLEVBQUU7QUFDdkQsV0FBTyxZQUFZLE9BQU8sTUFBTSxHQUFHLEVBQUUsRUFBRSxTQUFTLEdBQUcsYUFBYTtBQUVoRSxVQUFNLGFBQWEsTUFBTSxTQUFTLGdCQUFnQixTQUFTLFFBQVEsR0FBRyxTQUFTLFVBQVU7QUFDekYsc0JBQWtCLFNBQVM7QUFFM0IsVUFBTSxhQUFhLEtBQUssUUFBUSxpQkFBaUIsU0FBUyxZQUFZLE9BQU8sUUFBUSxHQUFHLFNBQVMsVUFBVTtBQUMzRyxXQUFPLFlBQVksT0FBTyxNQUFNLEdBQUcsU0FBUyxVQUFVLEVBQUUsU0FBUyxHQUFHLGFBQWE7QUFFakYsVUFBTSxhQUFhLE1BQU0sT0FBTztBQUNoQyxVQUFNLGFBQWEsTUFBTSxNQUFNO0FBQUEsRUFDaEMsQ0FBQztBQUVELE9BQUssd0RBQXdELFlBQVk7QUFDeEUsaUJBQWEsWUFBWSxJQUFJO0FBRTdCLFVBQU0sV0FBVyxJQUFJLEtBQUssS0FBSyxTQUFTLFlBQVksQ0FBQztBQUVyRCxVQUFNLGdCQUFnQixNQUFNLFFBQVEsUUFBUSxRQUFRO0FBQ3BELFdBQU8sWUFBWSxjQUFjLFVBQVUsSUFBSTtBQUUvQyxVQUFNLGFBQWEsTUFBTSxRQUFRLFNBQVMsUUFBUTtBQUNsRCxXQUFPLFlBQVksV0FBVyxVQUFVLElBQUk7QUFFNUMsUUFBSSxpQkFBb0M7QUFDeEMsUUFBSTtBQUNILFlBQU0sUUFBUSxVQUFVLFVBQVUsU0FBUyxXQUFXLFlBQVksQ0FBQztBQUFBLElBQ3BFLFNBQVMsT0FBTztBQUNmLHVCQUFpQjtBQUFBLElBQ2xCO0FBQ0EsV0FBTyxHQUFHLGNBQWM7QUFFeEIsUUFBSSxrQkFBcUM7QUFDekMsUUFBSTtBQUNILFlBQU0sUUFBUSxJQUFJLFFBQVE7QUFBQSxJQUMzQixTQUFTLE9BQU87QUFDZix3QkFBa0I7QUFBQSxJQUNuQjtBQUNBLFdBQU8sR0FBRyxlQUFlO0FBQUEsRUFDMUIsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbInByb21pc2VzIiwgInNlcnZpY2UiLCAiY29udGVudCJdCn0K
