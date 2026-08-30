import assert from "assert";
import * as fs from "fs";
import { tmpdir } from "os";
import { timeout } from "../../../common/async.js";
import { VSBuffer } from "../../../common/buffer.js";
import { randomPath } from "../../../common/extpath.js";
import { FileAccess } from "../../../common/network.js";
import { basename, dirname, join, sep } from "../../../common/path.js";
import { isWindows } from "../../../common/platform.js";
import { configureFlushOnWrite, Promises, realcase, realpathSync, RimRafMode, SymlinkSupport, writeFileSync } from "../../../node/pfs.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../common/utils.js";
import { flakySuite, getRandomTestPath } from "../testUtils.js";
configureFlushOnWrite(false);
flakySuite("PFS", function() {
  let testDir;
  setup(() => {
    testDir = getRandomTestPath(tmpdir(), "vsctests", "pfs");
    return fs.promises.mkdir(testDir, { recursive: true });
  });
  teardown(() => {
    return Promises.rm(testDir);
  });
  test("writeFile", async () => {
    const testFile = join(testDir, "writefile.txt");
    assert.ok(!await Promises.exists(testFile));
    await Promises.writeFile(testFile, "Hello World", null);
    assert.strictEqual((await fs.promises.readFile(testFile)).toString(), "Hello World");
  });
  test("writeFile - parallel write on different files works", async () => {
    const testFile1 = join(testDir, "writefile1.txt");
    const testFile2 = join(testDir, "writefile2.txt");
    const testFile3 = join(testDir, "writefile3.txt");
    const testFile4 = join(testDir, "writefile4.txt");
    const testFile5 = join(testDir, "writefile5.txt");
    await Promise.all([
      Promises.writeFile(testFile1, "Hello World 1", null),
      Promises.writeFile(testFile2, "Hello World 2", null),
      Promises.writeFile(testFile3, "Hello World 3", null),
      Promises.writeFile(testFile4, "Hello World 4", null),
      Promises.writeFile(testFile5, "Hello World 5", null)
    ]);
    assert.strictEqual(fs.readFileSync(testFile1).toString(), "Hello World 1");
    assert.strictEqual(fs.readFileSync(testFile2).toString(), "Hello World 2");
    assert.strictEqual(fs.readFileSync(testFile3).toString(), "Hello World 3");
    assert.strictEqual(fs.readFileSync(testFile4).toString(), "Hello World 4");
    assert.strictEqual(fs.readFileSync(testFile5).toString(), "Hello World 5");
  });
  test("writeFile - parallel write on same files works and is sequentalized", async () => {
    const testFile = join(testDir, "writefile.txt");
    await Promise.all([
      Promises.writeFile(testFile, "Hello World 1", void 0),
      Promises.writeFile(testFile, "Hello World 2", void 0),
      timeout(10).then(() => Promises.writeFile(testFile, "Hello World 3", void 0)),
      Promises.writeFile(testFile, "Hello World 4", void 0),
      timeout(10).then(() => Promises.writeFile(testFile, "Hello World 5", void 0))
    ]);
    assert.strictEqual(fs.readFileSync(testFile).toString(), "Hello World 5");
  });
  test("rimraf - simple - unlink", async () => {
    fs.writeFileSync(join(testDir, "somefile.txt"), "Contents");
    fs.writeFileSync(join(testDir, "someOtherFile.txt"), "Contents");
    await Promises.rm(testDir);
    assert.ok(!fs.existsSync(testDir));
  });
  test("rimraf - simple - move", async () => {
    fs.writeFileSync(join(testDir, "somefile.txt"), "Contents");
    fs.writeFileSync(join(testDir, "someOtherFile.txt"), "Contents");
    await Promises.rm(testDir, RimRafMode.MOVE);
    assert.ok(!fs.existsSync(testDir));
  });
  test("rimraf - simple - move (with moveToPath)", async () => {
    fs.writeFileSync(join(testDir, "somefile.txt"), "Contents");
    fs.writeFileSync(join(testDir, "someOtherFile.txt"), "Contents");
    await Promises.rm(testDir, RimRafMode.MOVE, join(dirname(testDir), `${basename(testDir)}.vsctmp`));
    assert.ok(!fs.existsSync(testDir));
  });
  test("rimraf - path does not exist - move", async () => {
    const nonExistingDir = join(testDir, "unknown-move");
    await Promises.rm(nonExistingDir, RimRafMode.MOVE);
  });
  test("rimraf - path does not exist - unlink", async () => {
    const nonExistingDir = join(testDir, "unknown-unlink");
    await Promises.rm(nonExistingDir, RimRafMode.UNLINK);
  });
  test("rimraf - recursive folder structure - unlink", async () => {
    fs.writeFileSync(join(testDir, "somefile.txt"), "Contents");
    fs.writeFileSync(join(testDir, "someOtherFile.txt"), "Contents");
    fs.mkdirSync(join(testDir, "somefolder"));
    fs.writeFileSync(join(testDir, "somefolder", "somefile.txt"), "Contents");
    await Promises.rm(testDir);
    assert.ok(!fs.existsSync(testDir));
  });
  test("rimraf - recursive folder structure - move", async () => {
    fs.writeFileSync(join(testDir, "somefile.txt"), "Contents");
    fs.writeFileSync(join(testDir, "someOtherFile.txt"), "Contents");
    fs.mkdirSync(join(testDir, "somefolder"));
    fs.writeFileSync(join(testDir, "somefolder", "somefile.txt"), "Contents");
    await Promises.rm(testDir, RimRafMode.MOVE);
    assert.ok(!fs.existsSync(testDir));
  });
  test("rimraf - simple ends with dot - move", async () => {
    fs.writeFileSync(join(testDir, "somefile.txt"), "Contents");
    fs.writeFileSync(join(testDir, "someOtherFile.txt"), "Contents");
    await Promises.rm(testDir, RimRafMode.MOVE);
    assert.ok(!fs.existsSync(testDir));
  });
  test("rimraf - simple ends with dot slash/backslash - move", async () => {
    fs.writeFileSync(join(testDir, "somefile.txt"), "Contents");
    fs.writeFileSync(join(testDir, "someOtherFile.txt"), "Contents");
    await Promises.rm(`${testDir}${sep}`, RimRafMode.MOVE);
    assert.ok(!fs.existsSync(testDir));
  });
  test("copy, rename and delete", async () => {
    const sourceDir = FileAccess.asFileUri("vs/base/test/node/pfs/fixtures").fsPath;
    const parentDir = join(tmpdir(), "vsctests", "pfs");
    const targetDir = randomPath(parentDir);
    const targetDir2 = randomPath(parentDir);
    await Promises.copy(sourceDir, targetDir, { preserveSymlinks: true });
    assert.ok(fs.existsSync(targetDir));
    assert.ok(fs.existsSync(join(targetDir, "index.html")));
    assert.ok(fs.existsSync(join(targetDir, "site.css")));
    assert.ok(fs.existsSync(join(targetDir, "examples")));
    assert.ok(fs.statSync(join(targetDir, "examples")).isDirectory());
    assert.ok(fs.existsSync(join(targetDir, "examples", "small.jxs")));
    await Promises.rename(targetDir, targetDir2);
    assert.ok(!fs.existsSync(targetDir));
    assert.ok(fs.existsSync(targetDir2));
    assert.ok(fs.existsSync(join(targetDir2, "index.html")));
    assert.ok(fs.existsSync(join(targetDir2, "site.css")));
    assert.ok(fs.existsSync(join(targetDir2, "examples")));
    assert.ok(fs.statSync(join(targetDir2, "examples")).isDirectory());
    assert.ok(fs.existsSync(join(targetDir2, "examples", "small.jxs")));
    await Promises.rename(join(targetDir2, "index.html"), join(targetDir2, "index_moved.html"));
    assert.ok(!fs.existsSync(join(targetDir2, "index.html")));
    assert.ok(fs.existsSync(join(targetDir2, "index_moved.html")));
    await Promises.rm(parentDir);
    assert.ok(!fs.existsSync(parentDir));
  });
  test("rename without retry", async () => {
    const sourceDir = FileAccess.asFileUri("vs/base/test/node/pfs/fixtures").fsPath;
    const parentDir = join(tmpdir(), "vsctests", "pfs");
    const targetDir = randomPath(parentDir);
    const targetDir2 = randomPath(parentDir);
    await Promises.copy(sourceDir, targetDir, { preserveSymlinks: true });
    await Promises.rename(targetDir, targetDir2, false);
    assert.ok(!fs.existsSync(targetDir));
    assert.ok(fs.existsSync(targetDir2));
    assert.ok(fs.existsSync(join(targetDir2, "index.html")));
    assert.ok(fs.existsSync(join(targetDir2, "site.css")));
    assert.ok(fs.existsSync(join(targetDir2, "examples")));
    assert.ok(fs.statSync(join(targetDir2, "examples")).isDirectory());
    assert.ok(fs.existsSync(join(targetDir2, "examples", "small.jxs")));
    await Promises.rename(join(targetDir2, "index.html"), join(targetDir2, "index_moved.html"), false);
    assert.ok(!fs.existsSync(join(targetDir2, "index.html")));
    assert.ok(fs.existsSync(join(targetDir2, "index_moved.html")));
    await Promises.rm(parentDir);
    assert.ok(!fs.existsSync(parentDir));
  });
  test("copy handles symbolic links", async () => {
    const symbolicLinkTarget = randomPath(testDir);
    const symLink = randomPath(testDir);
    const copyTarget = randomPath(testDir);
    await fs.promises.mkdir(symbolicLinkTarget, { recursive: true });
    fs.symlinkSync(symbolicLinkTarget, symLink, "junction");
    if (!isWindows) {
      await Promises.copy(symLink, copyTarget, { preserveSymlinks: true });
      assert.ok(fs.existsSync(copyTarget));
      const { symbolicLink } = await SymlinkSupport.stat(copyTarget);
      assert.ok(symbolicLink);
      assert.ok(!symbolicLink.dangling);
      const target = await fs.promises.readlink(copyTarget);
      assert.strictEqual(target, symbolicLinkTarget);
      await Promises.rm(copyTarget);
      await Promises.copy(symLink, copyTarget, { preserveSymlinks: false });
      assert.ok(fs.existsSync(copyTarget));
      const { symbolicLink: symbolicLink2 } = await SymlinkSupport.stat(copyTarget);
      assert.ok(!symbolicLink2);
    }
    await Promises.rm(copyTarget);
    await Promises.rm(symbolicLinkTarget);
    await Promises.copy(symLink, copyTarget, { preserveSymlinks: true });
    if (!isWindows) {
      const { symbolicLink } = await SymlinkSupport.stat(copyTarget);
      assert.ok(symbolicLink?.dangling);
    } else {
      assert.ok(!fs.existsSync(copyTarget));
    }
  });
  test("copy handles symbolic links when the reference is inside source", async () => {
    const sourceFolder = join(randomPath(testDir), "copy-test");
    const sourceLinkTestFolder = join(sourceFolder, "link-test");
    const sourceLinkMD5JSFolder = join(sourceLinkTestFolder, "md5");
    const sourceLinkMD5JSFile = join(sourceLinkMD5JSFolder, "md5.js");
    await fs.promises.mkdir(sourceLinkMD5JSFolder, { recursive: true });
    await Promises.writeFile(sourceLinkMD5JSFile, "Hello from MD5");
    const sourceLinkMD5JSFolderLinked = join(sourceLinkTestFolder, "md5-linked");
    fs.symlinkSync(sourceLinkMD5JSFolder, sourceLinkMD5JSFolderLinked, "junction");
    const targetLinkTestFolder = join(sourceFolder, "link-test copy");
    const targetLinkMD5JSFolder = join(targetLinkTestFolder, "md5");
    const targetLinkMD5JSFile = join(targetLinkMD5JSFolder, "md5.js");
    const targetLinkMD5JSFolderLinked = join(targetLinkTestFolder, "md5-linked");
    if (!isWindows) {
      await Promises.copy(sourceLinkTestFolder, targetLinkTestFolder, { preserveSymlinks: true });
      assert.ok(fs.existsSync(targetLinkTestFolder));
      assert.ok(fs.existsSync(targetLinkMD5JSFolder));
      assert.ok(fs.existsSync(targetLinkMD5JSFile));
      assert.ok(fs.existsSync(targetLinkMD5JSFolderLinked));
      assert.ok(fs.lstatSync(targetLinkMD5JSFolderLinked).isSymbolicLink());
      const linkTarget = await fs.promises.readlink(targetLinkMD5JSFolderLinked);
      assert.strictEqual(linkTarget, targetLinkMD5JSFolder);
      await Promises.rm(targetLinkTestFolder);
    }
    await Promises.copy(sourceLinkTestFolder, targetLinkTestFolder, { preserveSymlinks: false });
    assert.ok(fs.existsSync(targetLinkTestFolder));
    assert.ok(fs.existsSync(targetLinkMD5JSFolder));
    assert.ok(fs.existsSync(targetLinkMD5JSFile));
    assert.ok(fs.existsSync(targetLinkMD5JSFolderLinked));
    assert.ok(fs.lstatSync(targetLinkMD5JSFolderLinked).isDirectory());
  });
  test("readDirsInDir", async () => {
    fs.mkdirSync(join(testDir, "somefolder1"));
    fs.mkdirSync(join(testDir, "somefolder2"));
    fs.mkdirSync(join(testDir, "somefolder3"));
    fs.writeFileSync(join(testDir, "somefile.txt"), "Contents");
    fs.writeFileSync(join(testDir, "someOtherFile.txt"), "Contents");
    const result = await Promises.readDirsInDir(testDir);
    assert.strictEqual(result.length, 3);
    assert.ok(result.indexOf("somefolder1") !== -1);
    assert.ok(result.indexOf("somefolder2") !== -1);
    assert.ok(result.indexOf("somefolder3") !== -1);
  });
  test("stat link", async () => {
    const directory = randomPath(testDir);
    const symbolicLink = randomPath(testDir);
    await fs.promises.mkdir(directory, { recursive: true });
    fs.symlinkSync(directory, symbolicLink, "junction");
    let statAndIsLink = await SymlinkSupport.stat(directory);
    assert.ok(!statAndIsLink?.symbolicLink);
    statAndIsLink = await SymlinkSupport.stat(symbolicLink);
    assert.ok(statAndIsLink?.symbolicLink);
    assert.ok(!statAndIsLink?.symbolicLink?.dangling);
  });
  test("stat link (non existing target)", async () => {
    const directory = randomPath(testDir);
    const symbolicLink = randomPath(testDir);
    await fs.promises.mkdir(directory, { recursive: true });
    fs.symlinkSync(directory, symbolicLink, "junction");
    await Promises.rm(directory);
    const statAndIsLink = await SymlinkSupport.stat(symbolicLink);
    assert.ok(statAndIsLink?.symbolicLink);
    assert.ok(statAndIsLink?.symbolicLink?.dangling);
  });
  test("readdir", async () => {
    const parent = randomPath(join(testDir, "pfs"));
    const newDir = join(parent, "\xF6\xE4\xFC");
    await fs.promises.mkdir(newDir, { recursive: true });
    assert.ok(fs.existsSync(newDir));
    const children = await Promises.readdir(parent);
    assert.strictEqual(children.some((n) => n === "\xF6\xE4\xFC"), true);
  });
  test("readdir (with file types)", async () => {
    const newDir = join(testDir, "\xF6\xE4\xFC");
    await fs.promises.mkdir(newDir, { recursive: true });
    await Promises.writeFile(join(testDir, "somefile.txt"), "contents");
    assert.ok(fs.existsSync(newDir));
    const children = await Promises.readdir(testDir, { withFileTypes: true });
    assert.strictEqual(children.some((n) => n.name === "\xF6\xE4\xFC"), true);
    assert.strictEqual(children.some((n) => n.isDirectory()), true);
    assert.strictEqual(children.some((n) => n.name === "somefile.txt"), true);
    assert.strictEqual(children.some((n) => n.isFile()), true);
  });
  test("writeFile (string)", async () => {
    const smallData = "Hello World";
    const bigData = new Array(100 * 1024).join("Large String\n");
    return testWriteFile(smallData, smallData, bigData, bigData);
  });
  test("writeFile (string) - flush on write", async () => {
    configureFlushOnWrite(true);
    try {
      const smallData = "Hello World";
      const bigData = new Array(100 * 1024).join("Large String\n");
      return await testWriteFile(smallData, smallData, bigData, bigData);
    } finally {
      configureFlushOnWrite(false);
    }
  });
  test("writeFile (Buffer)", async () => {
    const smallData = "Hello World";
    const bigData = new Array(100 * 1024).join("Large String\n");
    return testWriteFile(Buffer.from(smallData), smallData, Buffer.from(bigData), bigData);
  });
  test("writeFile (UInt8Array)", async () => {
    const smallData = "Hello World";
    const bigData = new Array(100 * 1024).join("Large String\n");
    return testWriteFile(VSBuffer.fromString(smallData).buffer, smallData, VSBuffer.fromString(bigData).buffer, bigData);
  });
  async function testWriteFile(smallData, smallDataValue, bigData, bigDataValue) {
    const testFile = join(testDir, "flushed.txt");
    assert.ok(fs.existsSync(testDir));
    await Promises.writeFile(testFile, smallData);
    assert.strictEqual(fs.readFileSync(testFile).toString(), smallDataValue);
    await Promises.writeFile(testFile, bigData);
    assert.strictEqual(fs.readFileSync(testFile).toString(), bigDataValue);
  }
  test("writeFile (string, error handling)", async () => {
    const testFile = join(testDir, "flushed.txt");
    fs.mkdirSync(testFile);
    let expectedError;
    try {
      await Promises.writeFile(testFile, "Hello World");
    } catch (error) {
      expectedError = error;
    }
    assert.ok(expectedError);
  });
  test("writeFileSync", async () => {
    const testFile = join(testDir, "flushed.txt");
    writeFileSync(testFile, "Hello World");
    assert.strictEqual(fs.readFileSync(testFile).toString(), "Hello World");
    const largeString = new Array(100 * 1024).join("Large String\n");
    writeFileSync(testFile, largeString);
    assert.strictEqual(fs.readFileSync(testFile).toString(), largeString);
  });
  test("realcase", async () => {
    if (process.platform === "win32" || process.platform === "darwin") {
      const upper = testDir.toUpperCase();
      const real = await realcase(upper);
      if (real) {
        assert.notStrictEqual(real, upper);
        assert.strictEqual(real.toUpperCase(), upper);
        assert.strictEqual(real, testDir);
      }
    } else {
      let real = await realcase(testDir);
      assert.strictEqual(real, testDir);
      real = await realcase(testDir.toUpperCase());
      assert.strictEqual(real, testDir.toUpperCase());
    }
  });
  test("realpath", async () => {
    const realpathVal = await Promises.realpath(testDir);
    assert.ok(realpathVal);
  });
  test("realpathSync", () => {
    const realpath = realpathSync(testDir);
    assert.ok(realpath);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxub2RlXFxwZnNcXHBmcy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0IHsgdG1wZGlyIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgcmFuZG9tUGF0aCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9leHRwYXRoLmpzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgZGlybmFtZSwgam9pbiwgc2VwIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGNvbmZpZ3VyZUZsdXNoT25Xcml0ZSwgUHJvbWlzZXMsIHJlYWxjYXNlLCByZWFscGF0aFN5bmMsIFJpbVJhZk1vZGUsIFN5bWxpbmtTdXBwb3J0LCB3cml0ZUZpbGVTeW5jIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9wZnMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGZsYWt5U3VpdGUsIGdldFJhbmRvbVRlc3RQYXRoIH0gZnJvbSAnLi4vdGVzdFV0aWxzLmpzJztcblxuY29uZmlndXJlRmx1c2hPbldyaXRlKGZhbHNlKTsgLy8gc3BlZWQgdXAgYWxsIHVuaXQgdGVzdHMgYnkgZGlzYWJsaW5nIGZsdXNoIG9uIHdyaXRlXG5cbmZsYWt5U3VpdGUoJ1BGUycsIGZ1bmN0aW9uICgpIHtcblxuXHRsZXQgdGVzdERpcjogc3RyaW5nO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHR0ZXN0RGlyID0gZ2V0UmFuZG9tVGVzdFBhdGgodG1wZGlyKCksICd2c2N0ZXN0cycsICdwZnMnKTtcblxuXHRcdHJldHVybiBmcy5wcm9taXNlcy5ta2Rpcih0ZXN0RGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHJldHVybiBQcm9taXNlcy5ybSh0ZXN0RGlyKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RGaWxlID0gam9pbih0ZXN0RGlyLCAnd3JpdGVmaWxlLnR4dCcpO1xuXG5cdFx0YXNzZXJ0Lm9rKCEoYXdhaXQgUHJvbWlzZXMuZXhpc3RzKHRlc3RGaWxlKSkpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKHRlc3RGaWxlLCAnSGVsbG8gV29ybGQnLCAobnVsbCEpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZnMucHJvbWlzZXMucmVhZEZpbGUodGVzdEZpbGUpKS50b1N0cmluZygpLCAnSGVsbG8gV29ybGQnKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIC0gcGFyYWxsZWwgd3JpdGUgb24gZGlmZmVyZW50IGZpbGVzIHdvcmtzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RGaWxlMSA9IGpvaW4odGVzdERpciwgJ3dyaXRlZmlsZTEudHh0Jyk7XG5cdFx0Y29uc3QgdGVzdEZpbGUyID0gam9pbih0ZXN0RGlyLCAnd3JpdGVmaWxlMi50eHQnKTtcblx0XHRjb25zdCB0ZXN0RmlsZTMgPSBqb2luKHRlc3REaXIsICd3cml0ZWZpbGUzLnR4dCcpO1xuXHRcdGNvbnN0IHRlc3RGaWxlNCA9IGpvaW4odGVzdERpciwgJ3dyaXRlZmlsZTQudHh0Jyk7XG5cdFx0Y29uc3QgdGVzdEZpbGU1ID0gam9pbih0ZXN0RGlyLCAnd3JpdGVmaWxlNS50eHQnKTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFByb21pc2VzLndyaXRlRmlsZSh0ZXN0RmlsZTEsICdIZWxsbyBXb3JsZCAxJywgKG51bGwhKSksXG5cdFx0XHRQcm9taXNlcy53cml0ZUZpbGUodGVzdEZpbGUyLCAnSGVsbG8gV29ybGQgMicsIChudWxsISkpLFxuXHRcdFx0UHJvbWlzZXMud3JpdGVGaWxlKHRlc3RGaWxlMywgJ0hlbGxvIFdvcmxkIDMnLCAobnVsbCEpKSxcblx0XHRcdFByb21pc2VzLndyaXRlRmlsZSh0ZXN0RmlsZTQsICdIZWxsbyBXb3JsZCA0JywgKG51bGwhKSksXG5cdFx0XHRQcm9taXNlcy53cml0ZUZpbGUodGVzdEZpbGU1LCAnSGVsbG8gV29ybGQgNScsIChudWxsISkpXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZzLnJlYWRGaWxlU3luYyh0ZXN0RmlsZTEpLnRvU3RyaW5nKCksICdIZWxsbyBXb3JsZCAxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZzLnJlYWRGaWxlU3luYyh0ZXN0RmlsZTIpLnRvU3RyaW5nKCksICdIZWxsbyBXb3JsZCAyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZzLnJlYWRGaWxlU3luYyh0ZXN0RmlsZTMpLnRvU3RyaW5nKCksICdIZWxsbyBXb3JsZCAzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZzLnJlYWRGaWxlU3luYyh0ZXN0RmlsZTQpLnRvU3RyaW5nKCksICdIZWxsbyBXb3JsZCA0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZzLnJlYWRGaWxlU3luYyh0ZXN0RmlsZTUpLnRvU3RyaW5nKCksICdIZWxsbyBXb3JsZCA1Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAtIHBhcmFsbGVsIHdyaXRlIG9uIHNhbWUgZmlsZXMgd29ya3MgYW5kIGlzIHNlcXVlbnRhbGl6ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdEZpbGUgPSBqb2luKHRlc3REaXIsICd3cml0ZWZpbGUudHh0Jyk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRQcm9taXNlcy53cml0ZUZpbGUodGVzdEZpbGUsICdIZWxsbyBXb3JsZCAxJywgdW5kZWZpbmVkKSxcblx0XHRcdFByb21pc2VzLndyaXRlRmlsZSh0ZXN0RmlsZSwgJ0hlbGxvIFdvcmxkIDInLCB1bmRlZmluZWQpLFxuXHRcdFx0dGltZW91dCgxMCkudGhlbigoKSA9PiBQcm9taXNlcy53cml0ZUZpbGUodGVzdEZpbGUsICdIZWxsbyBXb3JsZCAzJywgdW5kZWZpbmVkKSksXG5cdFx0XHRQcm9taXNlcy53cml0ZUZpbGUodGVzdEZpbGUsICdIZWxsbyBXb3JsZCA0JywgdW5kZWZpbmVkKSxcblx0XHRcdHRpbWVvdXQoMTApLnRoZW4oKCkgPT4gUHJvbWlzZXMud3JpdGVGaWxlKHRlc3RGaWxlLCAnSGVsbG8gV29ybGQgNScsIHVuZGVmaW5lZCkpXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZzLnJlYWRGaWxlU3luYyh0ZXN0RmlsZSkudG9TdHJpbmcoKSwgJ0hlbGxvIFdvcmxkIDUnKTtcblx0fSk7XG5cblx0dGVzdCgncmltcmFmIC0gc2ltcGxlIC0gdW5saW5rJywgYXN5bmMgKCkgPT4ge1xuXHRcdGZzLndyaXRlRmlsZVN5bmMoam9pbih0ZXN0RGlyLCAnc29tZWZpbGUudHh0JyksICdDb250ZW50cycpO1xuXHRcdGZzLndyaXRlRmlsZVN5bmMoam9pbih0ZXN0RGlyLCAnc29tZU90aGVyRmlsZS50eHQnKSwgJ0NvbnRlbnRzJyk7XG5cblx0XHRhd2FpdCBQcm9taXNlcy5ybSh0ZXN0RGlyKTtcblx0XHRhc3NlcnQub2soIWZzLmV4aXN0c1N5bmModGVzdERpcikpO1xuXHR9KTtcblxuXHR0ZXN0KCdyaW1yYWYgLSBzaW1wbGUgLSBtb3ZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGZzLndyaXRlRmlsZVN5bmMoam9pbih0ZXN0RGlyLCAnc29tZWZpbGUudHh0JyksICdDb250ZW50cycpO1xuXHRcdGZzLndyaXRlRmlsZVN5bmMoam9pbih0ZXN0RGlyLCAnc29tZU90aGVyRmlsZS50eHQnKSwgJ0NvbnRlbnRzJyk7XG5cblx0XHRhd2FpdCBQcm9taXNlcy5ybSh0ZXN0RGlyLCBSaW1SYWZNb2RlLk1PVkUpO1xuXHRcdGFzc2VydC5vayghZnMuZXhpc3RzU3luYyh0ZXN0RGlyKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JpbXJhZiAtIHNpbXBsZSAtIG1vdmUgKHdpdGggbW92ZVRvUGF0aCknLCBhc3luYyAoKSA9PiB7XG5cdFx0ZnMud3JpdGVGaWxlU3luYyhqb2luKHRlc3REaXIsICdzb21lZmlsZS50eHQnKSwgJ0NvbnRlbnRzJyk7XG5cdFx0ZnMud3JpdGVGaWxlU3luYyhqb2luKHRlc3REaXIsICdzb21lT3RoZXJGaWxlLnR4dCcpLCAnQ29udGVudHMnKTtcblxuXHRcdGF3YWl0IFByb21pc2VzLnJtKHRlc3REaXIsIFJpbVJhZk1vZGUuTU9WRSwgam9pbihkaXJuYW1lKHRlc3REaXIpLCBgJHtiYXNlbmFtZSh0ZXN0RGlyKX0udnNjdG1wYCkpO1xuXHRcdGFzc2VydC5vayghZnMuZXhpc3RzU3luYyh0ZXN0RGlyKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JpbXJhZiAtIHBhdGggZG9lcyBub3QgZXhpc3QgLSBtb3ZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG5vbkV4aXN0aW5nRGlyID0gam9pbih0ZXN0RGlyLCAndW5rbm93bi1tb3ZlJyk7XG5cdFx0YXdhaXQgUHJvbWlzZXMucm0obm9uRXhpc3RpbmdEaXIsIFJpbVJhZk1vZGUuTU9WRSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JpbXJhZiAtIHBhdGggZG9lcyBub3QgZXhpc3QgLSB1bmxpbmsnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgbm9uRXhpc3RpbmdEaXIgPSBqb2luKHRlc3REaXIsICd1bmtub3duLXVubGluaycpO1xuXHRcdGF3YWl0IFByb21pc2VzLnJtKG5vbkV4aXN0aW5nRGlyLCBSaW1SYWZNb2RlLlVOTElOSyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JpbXJhZiAtIHJlY3Vyc2l2ZSBmb2xkZXIgc3RydWN0dXJlIC0gdW5saW5rJywgYXN5bmMgKCkgPT4ge1xuXHRcdGZzLndyaXRlRmlsZVN5bmMoam9pbih0ZXN0RGlyLCAnc29tZWZpbGUudHh0JyksICdDb250ZW50cycpO1xuXHRcdGZzLndyaXRlRmlsZVN5bmMoam9pbih0ZXN0RGlyLCAnc29tZU90aGVyRmlsZS50eHQnKSwgJ0NvbnRlbnRzJyk7XG5cdFx0ZnMubWtkaXJTeW5jKGpvaW4odGVzdERpciwgJ3NvbWVmb2xkZXInKSk7XG5cdFx0ZnMud3JpdGVGaWxlU3luYyhqb2luKHRlc3REaXIsICdzb21lZm9sZGVyJywgJ3NvbWVmaWxlLnR4dCcpLCAnQ29udGVudHMnKTtcblxuXHRcdGF3YWl0IFByb21pc2VzLnJtKHRlc3REaXIpO1xuXHRcdGFzc2VydC5vayghZnMuZXhpc3RzU3luYyh0ZXN0RGlyKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JpbXJhZiAtIHJlY3Vyc2l2ZSBmb2xkZXIgc3RydWN0dXJlIC0gbW92ZScsIGFzeW5jICgpID0+IHtcblx0XHRmcy53cml0ZUZpbGVTeW5jKGpvaW4odGVzdERpciwgJ3NvbWVmaWxlLnR4dCcpLCAnQ29udGVudHMnKTtcblx0XHRmcy53cml0ZUZpbGVTeW5jKGpvaW4odGVzdERpciwgJ3NvbWVPdGhlckZpbGUudHh0JyksICdDb250ZW50cycpO1xuXHRcdGZzLm1rZGlyU3luYyhqb2luKHRlc3REaXIsICdzb21lZm9sZGVyJykpO1xuXHRcdGZzLndyaXRlRmlsZVN5bmMoam9pbih0ZXN0RGlyLCAnc29tZWZvbGRlcicsICdzb21lZmlsZS50eHQnKSwgJ0NvbnRlbnRzJyk7XG5cblx0XHRhd2FpdCBQcm9taXNlcy5ybSh0ZXN0RGlyLCBSaW1SYWZNb2RlLk1PVkUpO1xuXHRcdGFzc2VydC5vayghZnMuZXhpc3RzU3luYyh0ZXN0RGlyKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JpbXJhZiAtIHNpbXBsZSBlbmRzIHdpdGggZG90IC0gbW92ZScsIGFzeW5jICgpID0+IHtcblx0XHRmcy53cml0ZUZpbGVTeW5jKGpvaW4odGVzdERpciwgJ3NvbWVmaWxlLnR4dCcpLCAnQ29udGVudHMnKTtcblx0XHRmcy53cml0ZUZpbGVTeW5jKGpvaW4odGVzdERpciwgJ3NvbWVPdGhlckZpbGUudHh0JyksICdDb250ZW50cycpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZXMucm0odGVzdERpciwgUmltUmFmTW9kZS5NT1ZFKTtcblx0XHRhc3NlcnQub2soIWZzLmV4aXN0c1N5bmModGVzdERpcikpO1xuXHR9KTtcblxuXHR0ZXN0KCdyaW1yYWYgLSBzaW1wbGUgZW5kcyB3aXRoIGRvdCBzbGFzaC9iYWNrc2xhc2ggLSBtb3ZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGZzLndyaXRlRmlsZVN5bmMoam9pbih0ZXN0RGlyLCAnc29tZWZpbGUudHh0JyksICdDb250ZW50cycpO1xuXHRcdGZzLndyaXRlRmlsZVN5bmMoam9pbih0ZXN0RGlyLCAnc29tZU90aGVyRmlsZS50eHQnKSwgJ0NvbnRlbnRzJyk7XG5cblx0XHRhd2FpdCBQcm9taXNlcy5ybShgJHt0ZXN0RGlyfSR7c2VwfWAsIFJpbVJhZk1vZGUuTU9WRSk7XG5cdFx0YXNzZXJ0Lm9rKCFmcy5leGlzdHNTeW5jKHRlc3REaXIpKTtcblx0fSk7XG5cblx0dGVzdCgnY29weSwgcmVuYW1lIGFuZCBkZWxldGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc291cmNlRGlyID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL2Jhc2UvdGVzdC9ub2RlL3Bmcy9maXh0dXJlcycpLmZzUGF0aDtcblx0XHRjb25zdCBwYXJlbnREaXIgPSBqb2luKHRtcGRpcigpLCAndnNjdGVzdHMnLCAncGZzJyk7XG5cdFx0Y29uc3QgdGFyZ2V0RGlyID0gcmFuZG9tUGF0aChwYXJlbnREaXIpO1xuXHRcdGNvbnN0IHRhcmdldERpcjIgPSByYW5kb21QYXRoKHBhcmVudERpcik7XG5cblx0XHRhd2FpdCBQcm9taXNlcy5jb3B5KHNvdXJjZURpciwgdGFyZ2V0RGlyLCB7IHByZXNlcnZlU3ltbGlua3M6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyh0YXJnZXREaXIpKTtcblx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyhqb2luKHRhcmdldERpciwgJ2luZGV4Lmh0bWwnKSkpO1xuXHRcdGFzc2VydC5vayhmcy5leGlzdHNTeW5jKGpvaW4odGFyZ2V0RGlyLCAnc2l0ZS5jc3MnKSkpO1xuXHRcdGFzc2VydC5vayhmcy5leGlzdHNTeW5jKGpvaW4odGFyZ2V0RGlyLCAnZXhhbXBsZXMnKSkpO1xuXHRcdGFzc2VydC5vayhmcy5zdGF0U3luYyhqb2luKHRhcmdldERpciwgJ2V4YW1wbGVzJykpLmlzRGlyZWN0b3J5KCkpO1xuXHRcdGFzc2VydC5vayhmcy5leGlzdHNTeW5jKGpvaW4odGFyZ2V0RGlyLCAnZXhhbXBsZXMnLCAnc21hbGwuanhzJykpKTtcblxuXHRcdGF3YWl0IFByb21pc2VzLnJlbmFtZSh0YXJnZXREaXIsIHRhcmdldERpcjIpO1xuXG5cdFx0YXNzZXJ0Lm9rKCFmcy5leGlzdHNTeW5jKHRhcmdldERpcikpO1xuXHRcdGFzc2VydC5vayhmcy5leGlzdHNTeW5jKHRhcmdldERpcjIpKTtcblx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyhqb2luKHRhcmdldERpcjIsICdpbmRleC5odG1sJykpKTtcblx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyhqb2luKHRhcmdldERpcjIsICdzaXRlLmNzcycpKSk7XG5cdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmMoam9pbih0YXJnZXREaXIyLCAnZXhhbXBsZXMnKSkpO1xuXHRcdGFzc2VydC5vayhmcy5zdGF0U3luYyhqb2luKHRhcmdldERpcjIsICdleGFtcGxlcycpKS5pc0RpcmVjdG9yeSgpKTtcblx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyhqb2luKHRhcmdldERpcjIsICdleGFtcGxlcycsICdzbWFsbC5qeHMnKSkpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZXMucmVuYW1lKGpvaW4odGFyZ2V0RGlyMiwgJ2luZGV4Lmh0bWwnKSwgam9pbih0YXJnZXREaXIyLCAnaW5kZXhfbW92ZWQuaHRtbCcpKTtcblxuXHRcdGFzc2VydC5vayghZnMuZXhpc3RzU3luYyhqb2luKHRhcmdldERpcjIsICdpbmRleC5odG1sJykpKTtcblx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyhqb2luKHRhcmdldERpcjIsICdpbmRleF9tb3ZlZC5odG1sJykpKTtcblxuXHRcdGF3YWl0IFByb21pc2VzLnJtKHBhcmVudERpcik7XG5cblx0XHRhc3NlcnQub2soIWZzLmV4aXN0c1N5bmMocGFyZW50RGlyKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmFtZSB3aXRob3V0IHJldHJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNvdXJjZURpciA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy9iYXNlL3Rlc3Qvbm9kZS9wZnMvZml4dHVyZXMnKS5mc1BhdGg7XG5cdFx0Y29uc3QgcGFyZW50RGlyID0gam9pbih0bXBkaXIoKSwgJ3ZzY3Rlc3RzJywgJ3BmcycpO1xuXHRcdGNvbnN0IHRhcmdldERpciA9IHJhbmRvbVBhdGgocGFyZW50RGlyKTtcblx0XHRjb25zdCB0YXJnZXREaXIyID0gcmFuZG9tUGF0aChwYXJlbnREaXIpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZXMuY29weShzb3VyY2VEaXIsIHRhcmdldERpciwgeyBwcmVzZXJ2ZVN5bWxpbmtzOiB0cnVlIH0pO1xuXHRcdGF3YWl0IFByb21pc2VzLnJlbmFtZSh0YXJnZXREaXIsIHRhcmdldERpcjIsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5vayghZnMuZXhpc3RzU3luYyh0YXJnZXREaXIpKTtcblx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyh0YXJnZXREaXIyKSk7XG5cdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmMoam9pbih0YXJnZXREaXIyLCAnaW5kZXguaHRtbCcpKSk7XG5cdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmMoam9pbih0YXJnZXREaXIyLCAnc2l0ZS5jc3MnKSkpO1xuXHRcdGFzc2VydC5vayhmcy5leGlzdHNTeW5jKGpvaW4odGFyZ2V0RGlyMiwgJ2V4YW1wbGVzJykpKTtcblx0XHRhc3NlcnQub2soZnMuc3RhdFN5bmMoam9pbih0YXJnZXREaXIyLCAnZXhhbXBsZXMnKSkuaXNEaXJlY3RvcnkoKSk7XG5cdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmMoam9pbih0YXJnZXREaXIyLCAnZXhhbXBsZXMnLCAnc21hbGwuanhzJykpKTtcblxuXHRcdGF3YWl0IFByb21pc2VzLnJlbmFtZShqb2luKHRhcmdldERpcjIsICdpbmRleC5odG1sJyksIGpvaW4odGFyZ2V0RGlyMiwgJ2luZGV4X21vdmVkLmh0bWwnKSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0Lm9rKCFmcy5leGlzdHNTeW5jKGpvaW4odGFyZ2V0RGlyMiwgJ2luZGV4Lmh0bWwnKSkpO1xuXHRcdGFzc2VydC5vayhmcy5leGlzdHNTeW5jKGpvaW4odGFyZ2V0RGlyMiwgJ2luZGV4X21vdmVkLmh0bWwnKSkpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZXMucm0ocGFyZW50RGlyKTtcblxuXHRcdGFzc2VydC5vayghZnMuZXhpc3RzU3luYyhwYXJlbnREaXIpKTtcblx0fSk7XG5cblx0dGVzdCgnY29weSBoYW5kbGVzIHN5bWJvbGljIGxpbmtzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN5bWJvbGljTGlua1RhcmdldCA9IHJhbmRvbVBhdGgodGVzdERpcik7XG5cdFx0Y29uc3Qgc3ltTGluayA9IHJhbmRvbVBhdGgodGVzdERpcik7XG5cdFx0Y29uc3QgY29weVRhcmdldCA9IHJhbmRvbVBhdGgodGVzdERpcik7XG5cblx0XHRhd2FpdCBmcy5wcm9taXNlcy5ta2RpcihzeW1ib2xpY0xpbmtUYXJnZXQsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXG5cdFx0ZnMuc3ltbGlua1N5bmMoc3ltYm9saWNMaW5rVGFyZ2V0LCBzeW1MaW5rLCAnanVuY3Rpb24nKTtcblxuXHRcdC8vIENvcHkgcHJlc2VydmVzIHN5bWxpbmtzIGlmIGNvbmZpZ3VyZWQgYXMgc3VjaFxuXHRcdC8vXG5cdFx0Ly8gV2luZG93czogdGhpcyB0ZXN0IGRvZXMgbm90IHdvcmsgYmVjYXVzZSBjcmVhdGluZyBzeW1saW5rc1xuXHRcdC8vIHJlcXVpcmVzIHByaXZpbGVkZ2VkIHBlcm1pc3Npb25zIChhZG1pbikuXG5cdFx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRcdGF3YWl0IFByb21pc2VzLmNvcHkoc3ltTGluaywgY29weVRhcmdldCwgeyBwcmVzZXJ2ZVN5bWxpbmtzOiB0cnVlIH0pO1xuXG5cdFx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyhjb3B5VGFyZ2V0KSk7XG5cblx0XHRcdGNvbnN0IHsgc3ltYm9saWNMaW5rIH0gPSBhd2FpdCBTeW1saW5rU3VwcG9ydC5zdGF0KGNvcHlUYXJnZXQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN5bWJvbGljTGluayk7XG5cdFx0XHRhc3NlcnQub2soIXN5bWJvbGljTGluay5kYW5nbGluZyk7XG5cblx0XHRcdGNvbnN0IHRhcmdldCA9IGF3YWl0IGZzLnByb21pc2VzLnJlYWRsaW5rKGNvcHlUYXJnZXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldCwgc3ltYm9saWNMaW5rVGFyZ2V0KTtcblxuXHRcdFx0Ly8gQ29weSBkb2VzIG5vdCBwcmVzZXJ2ZSBzeW1saW5rcyBpZiBjb25maWd1cmVkIGFzIHN1Y2hcblxuXHRcdFx0YXdhaXQgUHJvbWlzZXMucm0oY29weVRhcmdldCk7XG5cdFx0XHRhd2FpdCBQcm9taXNlcy5jb3B5KHN5bUxpbmssIGNvcHlUYXJnZXQsIHsgcHJlc2VydmVTeW1saW5rczogZmFsc2UgfSk7XG5cblx0XHRcdGFzc2VydC5vayhmcy5leGlzdHNTeW5jKGNvcHlUYXJnZXQpKTtcblxuXHRcdFx0Y29uc3QgeyBzeW1ib2xpY0xpbms6IHN5bWJvbGljTGluazIgfSA9IGF3YWl0IFN5bWxpbmtTdXBwb3J0LnN0YXQoY29weVRhcmdldCk7XG5cdFx0XHRhc3NlcnQub2soIXN5bWJvbGljTGluazIpO1xuXHRcdH1cblxuXHRcdC8vIENvcHkgZG9lcyBub3QgZmFpbCBvdmVyIGRhbmdsaW5nIHN5bWxpbmtzXG5cblx0XHRhd2FpdCBQcm9taXNlcy5ybShjb3B5VGFyZ2V0KTtcblx0XHRhd2FpdCBQcm9taXNlcy5ybShzeW1ib2xpY0xpbmtUYXJnZXQpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZXMuY29weShzeW1MaW5rLCBjb3B5VGFyZ2V0LCB7IHByZXNlcnZlU3ltbGlua3M6IHRydWUgfSk7IC8vIHRoaXMgc2hvdWxkIG5vdCB0aHJvd1xuXG5cdFx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRcdGNvbnN0IHsgc3ltYm9saWNMaW5rIH0gPSBhd2FpdCBTeW1saW5rU3VwcG9ydC5zdGF0KGNvcHlUYXJnZXQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN5bWJvbGljTGluaz8uZGFuZ2xpbmcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQub2soIWZzLmV4aXN0c1N5bmMoY29weVRhcmdldCkpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnY29weSBoYW5kbGVzIHN5bWJvbGljIGxpbmtzIHdoZW4gdGhlIHJlZmVyZW5jZSBpcyBpbnNpZGUgc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0Ly8gU291cmNlIEZvbGRlclxuXHRcdGNvbnN0IHNvdXJjZUZvbGRlciA9IGpvaW4ocmFuZG9tUGF0aCh0ZXN0RGlyKSwgJ2NvcHktdGVzdCcpOyBcdFx0Ly8gY29weS10ZXN0XG5cdFx0Y29uc3Qgc291cmNlTGlua1Rlc3RGb2xkZXIgPSBqb2luKHNvdXJjZUZvbGRlciwgJ2xpbmstdGVzdCcpO1x0XHQvLyBjb3B5LXRlc3QvbGluay10ZXN0XG5cdFx0Y29uc3Qgc291cmNlTGlua01ENUpTRm9sZGVyID0gam9pbihzb3VyY2VMaW5rVGVzdEZvbGRlciwgJ21kNScpO1x0Ly8gY29weS10ZXN0L2xpbmstdGVzdC9tZDVcblx0XHRjb25zdCBzb3VyY2VMaW5rTUQ1SlNGaWxlID0gam9pbihzb3VyY2VMaW5rTUQ1SlNGb2xkZXIsICdtZDUuanMnKTtcdC8vIGNvcHktdGVzdC9saW5rLXRlc3QvbWQ1L21kNS5qc1xuXHRcdGF3YWl0IGZzLnByb21pc2VzLm1rZGlyKHNvdXJjZUxpbmtNRDVKU0ZvbGRlciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKHNvdXJjZUxpbmtNRDVKU0ZpbGUsICdIZWxsbyBmcm9tIE1ENScpO1xuXG5cdFx0Y29uc3Qgc291cmNlTGlua01ENUpTRm9sZGVyTGlua2VkID0gam9pbihzb3VyY2VMaW5rVGVzdEZvbGRlciwgJ21kNS1saW5rZWQnKTtcdC8vIGNvcHktdGVzdC9saW5rLXRlc3QvbWQ1LWxpbmtlZFxuXHRcdGZzLnN5bWxpbmtTeW5jKHNvdXJjZUxpbmtNRDVKU0ZvbGRlciwgc291cmNlTGlua01ENUpTRm9sZGVyTGlua2VkLCAnanVuY3Rpb24nKTtcblxuXHRcdC8vIFRhcmdldCBGb2xkZXJcblx0XHRjb25zdCB0YXJnZXRMaW5rVGVzdEZvbGRlciA9IGpvaW4oc291cmNlRm9sZGVyLCAnbGluay10ZXN0IGNvcHknKTtcdFx0XHRcdC8vIGNvcHktdGVzdC9saW5rLXRlc3QgY29weVxuXHRcdGNvbnN0IHRhcmdldExpbmtNRDVKU0ZvbGRlciA9IGpvaW4odGFyZ2V0TGlua1Rlc3RGb2xkZXIsICdtZDUnKTtcdFx0XHRcdC8vIGNvcHktdGVzdC9saW5rLXRlc3QgY29weS9tZDVcblx0XHRjb25zdCB0YXJnZXRMaW5rTUQ1SlNGaWxlID0gam9pbih0YXJnZXRMaW5rTUQ1SlNGb2xkZXIsICdtZDUuanMnKTtcdFx0XHRcdC8vIGNvcHktdGVzdC9saW5rLXRlc3QgY29weS9tZDUvbWQ1LmpzXG5cdFx0Y29uc3QgdGFyZ2V0TGlua01ENUpTRm9sZGVyTGlua2VkID0gam9pbih0YXJnZXRMaW5rVGVzdEZvbGRlciwgJ21kNS1saW5rZWQnKTtcdC8vIGNvcHktdGVzdC9saW5rLXRlc3QgY29weS9tZDUtbGlua2VkXG5cblx0XHQvLyBDb3B5IHdpdGggYHByZXNlcnZlU3ltbGlua3M6IHRydWVgIGFuZCB2ZXJpZnkgcmVzdWx0XG5cdFx0Ly9cblx0XHQvLyBXaW5kb3dzOiB0aGlzIHRlc3QgZG9lcyBub3Qgd29yayBiZWNhdXNlIGNyZWF0aW5nIHN5bWxpbmtzXG5cdFx0Ly8gcmVxdWlyZXMgcHJpdmlsZWRnZWQgcGVybWlzc2lvbnMgKGFkbWluKS5cblx0XHRpZiAoIWlzV2luZG93cykge1xuXHRcdFx0YXdhaXQgUHJvbWlzZXMuY29weShzb3VyY2VMaW5rVGVzdEZvbGRlciwgdGFyZ2V0TGlua1Rlc3RGb2xkZXIsIHsgcHJlc2VydmVTeW1saW5rczogdHJ1ZSB9KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmModGFyZ2V0TGlua1Rlc3RGb2xkZXIpKTtcblx0XHRcdGFzc2VydC5vayhmcy5leGlzdHNTeW5jKHRhcmdldExpbmtNRDVKU0ZvbGRlcikpO1xuXHRcdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmModGFyZ2V0TGlua01ENUpTRmlsZSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmModGFyZ2V0TGlua01ENUpTRm9sZGVyTGlua2VkKSk7XG5cdFx0XHRhc3NlcnQub2soZnMubHN0YXRTeW5jKHRhcmdldExpbmtNRDVKU0ZvbGRlckxpbmtlZCkuaXNTeW1ib2xpY0xpbmsoKSk7XG5cblx0XHRcdGNvbnN0IGxpbmtUYXJnZXQgPSBhd2FpdCBmcy5wcm9taXNlcy5yZWFkbGluayh0YXJnZXRMaW5rTUQ1SlNGb2xkZXJMaW5rZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmtUYXJnZXQsIHRhcmdldExpbmtNRDVKU0ZvbGRlcik7XG5cblx0XHRcdGF3YWl0IFByb21pc2VzLnJtKHRhcmdldExpbmtUZXN0Rm9sZGVyKTtcblx0XHR9XG5cblx0XHQvLyBDb3B5IHdpdGggYHByZXNlcnZlU3ltbGlua3M6IGZhbHNlYCBhbmQgdmVyaWZ5IHJlc3VsdFxuXHRcdGF3YWl0IFByb21pc2VzLmNvcHkoc291cmNlTGlua1Rlc3RGb2xkZXIsIHRhcmdldExpbmtUZXN0Rm9sZGVyLCB7IHByZXNlcnZlU3ltbGlua3M6IGZhbHNlIH0pO1xuXG5cdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmModGFyZ2V0TGlua1Rlc3RGb2xkZXIpKTtcblx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyh0YXJnZXRMaW5rTUQ1SlNGb2xkZXIpKTtcblx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyh0YXJnZXRMaW5rTUQ1SlNGaWxlKSk7XG5cdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmModGFyZ2V0TGlua01ENUpTRm9sZGVyTGlua2VkKSk7XG5cdFx0YXNzZXJ0Lm9rKGZzLmxzdGF0U3luYyh0YXJnZXRMaW5rTUQ1SlNGb2xkZXJMaW5rZWQpLmlzRGlyZWN0b3J5KCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRGlyc0luRGlyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGZzLm1rZGlyU3luYyhqb2luKHRlc3REaXIsICdzb21lZm9sZGVyMScpKTtcblx0XHRmcy5ta2RpclN5bmMoam9pbih0ZXN0RGlyLCAnc29tZWZvbGRlcjInKSk7XG5cdFx0ZnMubWtkaXJTeW5jKGpvaW4odGVzdERpciwgJ3NvbWVmb2xkZXIzJykpO1xuXHRcdGZzLndyaXRlRmlsZVN5bmMoam9pbih0ZXN0RGlyLCAnc29tZWZpbGUudHh0JyksICdDb250ZW50cycpO1xuXHRcdGZzLndyaXRlRmlsZVN5bmMoam9pbih0ZXN0RGlyLCAnc29tZU90aGVyRmlsZS50eHQnKSwgJ0NvbnRlbnRzJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBQcm9taXNlcy5yZWFkRGlyc0luRGlyKHRlc3REaXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmluZGV4T2YoJ3NvbWVmb2xkZXIxJykgIT09IC0xKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmluZGV4T2YoJ3NvbWVmb2xkZXIyJykgIT09IC0xKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmluZGV4T2YoJ3NvbWVmb2xkZXIzJykgIT09IC0xKTtcblx0fSk7XG5cblx0dGVzdCgnc3RhdCBsaW5rJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpcmVjdG9yeSA9IHJhbmRvbVBhdGgodGVzdERpcik7XG5cdFx0Y29uc3Qgc3ltYm9saWNMaW5rID0gcmFuZG9tUGF0aCh0ZXN0RGlyKTtcblxuXHRcdGF3YWl0IGZzLnByb21pc2VzLm1rZGlyKGRpcmVjdG9yeSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cblx0XHRmcy5zeW1saW5rU3luYyhkaXJlY3RvcnksIHN5bWJvbGljTGluaywgJ2p1bmN0aW9uJyk7XG5cblx0XHRsZXQgc3RhdEFuZElzTGluayA9IGF3YWl0IFN5bWxpbmtTdXBwb3J0LnN0YXQoZGlyZWN0b3J5KTtcblx0XHRhc3NlcnQub2soIXN0YXRBbmRJc0xpbms/LnN5bWJvbGljTGluayk7XG5cblx0XHRzdGF0QW5kSXNMaW5rID0gYXdhaXQgU3ltbGlua1N1cHBvcnQuc3RhdChzeW1ib2xpY0xpbmspO1xuXHRcdGFzc2VydC5vayhzdGF0QW5kSXNMaW5rPy5zeW1ib2xpY0xpbmspO1xuXHRcdGFzc2VydC5vayghc3RhdEFuZElzTGluaz8uc3ltYm9saWNMaW5rPy5kYW5nbGluZyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXQgbGluayAobm9uIGV4aXN0aW5nIHRhcmdldCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlyZWN0b3J5ID0gcmFuZG9tUGF0aCh0ZXN0RGlyKTtcblx0XHRjb25zdCBzeW1ib2xpY0xpbmsgPSByYW5kb21QYXRoKHRlc3REaXIpO1xuXG5cdFx0YXdhaXQgZnMucHJvbWlzZXMubWtkaXIoZGlyZWN0b3J5LCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblxuXHRcdGZzLnN5bWxpbmtTeW5jKGRpcmVjdG9yeSwgc3ltYm9saWNMaW5rLCAnanVuY3Rpb24nKTtcblxuXHRcdGF3YWl0IFByb21pc2VzLnJtKGRpcmVjdG9yeSk7XG5cblx0XHRjb25zdCBzdGF0QW5kSXNMaW5rID0gYXdhaXQgU3ltbGlua1N1cHBvcnQuc3RhdChzeW1ib2xpY0xpbmspO1xuXHRcdGFzc2VydC5vayhzdGF0QW5kSXNMaW5rPy5zeW1ib2xpY0xpbmspO1xuXHRcdGFzc2VydC5vayhzdGF0QW5kSXNMaW5rPy5zeW1ib2xpY0xpbms/LmRhbmdsaW5nKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZGRpcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwYXJlbnQgPSByYW5kb21QYXRoKGpvaW4odGVzdERpciwgJ3BmcycpKTtcblx0XHRjb25zdCBuZXdEaXIgPSBqb2luKHBhcmVudCwgJ1x1MDBGNlx1MDBFNFx1MDBGQycpO1xuXG5cdFx0YXdhaXQgZnMucHJvbWlzZXMubWtkaXIobmV3RGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5vayhmcy5leGlzdHNTeW5jKG5ld0RpcikpO1xuXG5cdFx0Y29uc3QgY2hpbGRyZW4gPSBhd2FpdCBQcm9taXNlcy5yZWFkZGlyKHBhcmVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoaWxkcmVuLnNvbWUobiA9PiBuID09PSAnXHUwMEY2XHUwMEU0XHUwMEZDJyksIHRydWUpOyAvLyBNYWMgYWx3YXlzIGNvbnZlcnRzIHRvIE5GRCwgc29cblx0fSk7XG5cblx0dGVzdCgncmVhZGRpciAod2l0aCBmaWxlIHR5cGVzKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBuZXdEaXIgPSBqb2luKHRlc3REaXIsICdcdTAwRjZcdTAwRTRcdTAwRkMnKTtcblx0XHRhd2FpdCBmcy5wcm9taXNlcy5ta2RpcihuZXdEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXG5cdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKGpvaW4odGVzdERpciwgJ3NvbWVmaWxlLnR4dCcpLCAnY29udGVudHMnKTtcblxuXHRcdGFzc2VydC5vayhmcy5leGlzdHNTeW5jKG5ld0RpcikpO1xuXG5cdFx0Y29uc3QgY2hpbGRyZW4gPSBhd2FpdCBQcm9taXNlcy5yZWFkZGlyKHRlc3REaXIsIHsgd2l0aEZpbGVUeXBlczogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGlsZHJlbi5zb21lKG4gPT4gbi5uYW1lID09PSAnXHUwMEY2XHUwMEU0XHUwMEZDJyksIHRydWUpOyAvLyBNYWMgYWx3YXlzIGNvbnZlcnRzIHRvIE5GRCwgc29cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hpbGRyZW4uc29tZShuID0+IG4uaXNEaXJlY3RvcnkoKSksIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoaWxkcmVuLnNvbWUobiA9PiBuLm5hbWUgPT09ICdzb21lZmlsZS50eHQnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoaWxkcmVuLnNvbWUobiA9PiBuLmlzRmlsZSgpKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAoc3RyaW5nKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzbWFsbERhdGEgPSAnSGVsbG8gV29ybGQnO1xuXHRcdGNvbnN0IGJpZ0RhdGEgPSAobmV3IEFycmF5KDEwMCAqIDEwMjQpKS5qb2luKCdMYXJnZSBTdHJpbmdcXG4nKTtcblxuXHRcdHJldHVybiB0ZXN0V3JpdGVGaWxlKHNtYWxsRGF0YSwgc21hbGxEYXRhLCBiaWdEYXRhLCBiaWdEYXRhKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIChzdHJpbmcpIC0gZmx1c2ggb24gd3JpdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlndXJlRmx1c2hPbldyaXRlKHRydWUpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzbWFsbERhdGEgPSAnSGVsbG8gV29ybGQnO1xuXHRcdFx0Y29uc3QgYmlnRGF0YSA9IChuZXcgQXJyYXkoMTAwICogMTAyNCkpLmpvaW4oJ0xhcmdlIFN0cmluZ1xcbicpO1xuXG5cdFx0XHRyZXR1cm4gYXdhaXQgdGVzdFdyaXRlRmlsZShzbWFsbERhdGEsIHNtYWxsRGF0YSwgYmlnRGF0YSwgYmlnRGF0YSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNvbmZpZ3VyZUZsdXNoT25Xcml0ZShmYWxzZSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgKEJ1ZmZlciknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc21hbGxEYXRhID0gJ0hlbGxvIFdvcmxkJztcblx0XHRjb25zdCBiaWdEYXRhID0gKG5ldyBBcnJheSgxMDAgKiAxMDI0KSkuam9pbignTGFyZ2UgU3RyaW5nXFxuJyk7XG5cblx0XHRyZXR1cm4gdGVzdFdyaXRlRmlsZShCdWZmZXIuZnJvbShzbWFsbERhdGEpLCBzbWFsbERhdGEsIEJ1ZmZlci5mcm9tKGJpZ0RhdGEpLCBiaWdEYXRhKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIChVSW50OEFycmF5KScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzbWFsbERhdGEgPSAnSGVsbG8gV29ybGQnO1xuXHRcdGNvbnN0IGJpZ0RhdGEgPSAobmV3IEFycmF5KDEwMCAqIDEwMjQpKS5qb2luKCdMYXJnZSBTdHJpbmdcXG4nKTtcblxuXHRcdHJldHVybiB0ZXN0V3JpdGVGaWxlKFZTQnVmZmVyLmZyb21TdHJpbmcoc21hbGxEYXRhKS5idWZmZXIsIHNtYWxsRGF0YSwgVlNCdWZmZXIuZnJvbVN0cmluZyhiaWdEYXRhKS5idWZmZXIsIGJpZ0RhdGEpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0V3JpdGVGaWxlKFxuXHRcdHNtYWxsRGF0YTogc3RyaW5nIHwgQnVmZmVyIHwgVWludDhBcnJheSxcblx0XHRzbWFsbERhdGFWYWx1ZTogc3RyaW5nLFxuXHRcdGJpZ0RhdGE6IHN0cmluZyB8IEJ1ZmZlciB8IFVpbnQ4QXJyYXksXG5cdFx0YmlnRGF0YVZhbHVlOiBzdHJpbmdcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdGVzdEZpbGUgPSBqb2luKHRlc3REaXIsICdmbHVzaGVkLnR4dCcpO1xuXG5cdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmModGVzdERpcikpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKHRlc3RGaWxlLCBzbWFsbERhdGEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmcy5yZWFkRmlsZVN5bmModGVzdEZpbGUpLnRvU3RyaW5nKCksIHNtYWxsRGF0YVZhbHVlKTtcblxuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZSh0ZXN0RmlsZSwgYmlnRGF0YSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZzLnJlYWRGaWxlU3luYyh0ZXN0RmlsZSkudG9TdHJpbmcoKSwgYmlnRGF0YVZhbHVlKTtcblx0fVxuXG5cdHRlc3QoJ3dyaXRlRmlsZSAoc3RyaW5nLCBlcnJvciBoYW5kbGluZyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdEZpbGUgPSBqb2luKHRlc3REaXIsICdmbHVzaGVkLnR4dCcpO1xuXG5cdFx0ZnMubWtkaXJTeW5jKHRlc3RGaWxlKTsgLy8gdGhpcyB3aWxsIHRyaWdnZXIgYW4gZXJyb3IgbGF0ZXIgYmVjYXVzZSB0ZXN0RmlsZSBpcyBub3cgYSBkaXJlY3RvcnkhXG5cblx0XHRsZXQgZXhwZWN0ZWRFcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZSh0ZXN0RmlsZSwgJ0hlbGxvIFdvcmxkJyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGV4cGVjdGVkRXJyb3IgPSBlcnJvcjtcblx0XHR9XG5cblx0XHRhc3NlcnQub2soZXhwZWN0ZWRFcnJvcik7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZVN5bmMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdEZpbGUgPSBqb2luKHRlc3REaXIsICdmbHVzaGVkLnR4dCcpO1xuXG5cdFx0d3JpdGVGaWxlU3luYyh0ZXN0RmlsZSwgJ0hlbGxvIFdvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZzLnJlYWRGaWxlU3luYyh0ZXN0RmlsZSkudG9TdHJpbmcoKSwgJ0hlbGxvIFdvcmxkJyk7XG5cblx0XHRjb25zdCBsYXJnZVN0cmluZyA9IChuZXcgQXJyYXkoMTAwICogMTAyNCkpLmpvaW4oJ0xhcmdlIFN0cmluZ1xcbicpO1xuXG5cdFx0d3JpdGVGaWxlU3luYyh0ZXN0RmlsZSwgbGFyZ2VTdHJpbmcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmcy5yZWFkRmlsZVN5bmModGVzdEZpbGUpLnRvU3RyaW5nKCksIGxhcmdlU3RyaW5nKTtcblx0fSk7XG5cblx0dGVzdCgncmVhbGNhc2UnLCBhc3luYyAoKSA9PiB7XG5cblx0XHQvLyBhc3N1bWUgY2FzZSBpbnNlbnNpdGl2ZSBmaWxlIHN5c3RlbVxuXHRcdGlmIChwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInIHx8IHByb2Nlc3MucGxhdGZvcm0gPT09ICdkYXJ3aW4nKSB7XG5cdFx0XHRjb25zdCB1cHBlciA9IHRlc3REaXIudG9VcHBlckNhc2UoKTtcblx0XHRcdGNvbnN0IHJlYWwgPSBhd2FpdCByZWFsY2FzZSh1cHBlcik7XG5cblx0XHRcdGlmIChyZWFsKSB7IC8vIGNhbiBiZSBudWxsIGluIGNhc2Ugb2YgcGVybWlzc2lvbiBlcnJvcnNcblx0XHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHJlYWwsIHVwcGVyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWwudG9VcHBlckNhc2UoKSwgdXBwZXIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhbCwgdGVzdERpcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gbGludXgsIHVuaXgsIGV0Yy4gLT4gYXNzdW1lIGNhc2Ugc2Vuc2l0aXZlIGZpbGUgc3lzdGVtXG5cdFx0ZWxzZSB7XG5cdFx0XHRsZXQgcmVhbCA9IGF3YWl0IHJlYWxjYXNlKHRlc3REaXIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWwsIHRlc3REaXIpO1xuXG5cdFx0XHRyZWFsID0gYXdhaXQgcmVhbGNhc2UodGVzdERpci50b1VwcGVyQ2FzZSgpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFsLCB0ZXN0RGlyLnRvVXBwZXJDYXNlKCkpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmVhbHBhdGgnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVhbHBhdGhWYWwgPSBhd2FpdCBQcm9taXNlcy5yZWFscGF0aCh0ZXN0RGlyKTtcblx0XHRhc3NlcnQub2socmVhbHBhdGhWYWwpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFscGF0aFN5bmMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVhbHBhdGggPSByZWFscGF0aFN5bmModGVzdERpcik7XG5cdFx0YXNzZXJ0Lm9rKHJlYWxwYXRoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixZQUFZLFFBQVE7QUFDcEIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFVBQVUsU0FBUyxNQUFNLFdBQVc7QUFDN0MsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx1QkFBdUIsVUFBVSxVQUFVLGNBQWMsWUFBWSxnQkFBZ0IscUJBQXFCO0FBQ25ILFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsWUFBWSx5QkFBeUI7QUFFOUMsc0JBQXNCLEtBQUs7QUFFM0IsV0FBVyxPQUFPLFdBQVk7QUFFN0IsTUFBSTtBQUVKLFFBQU0sTUFBTTtBQUNYLGNBQVUsa0JBQWtCLE9BQU8sR0FBRyxZQUFZLEtBQUs7QUFFdkQsV0FBTyxHQUFHLFNBQVMsTUFBTSxTQUFTLEVBQUUsV0FBVyxLQUFLLENBQUM7QUFBQSxFQUN0RCxDQUFDO0FBRUQsV0FBUyxNQUFNO0FBQ2QsV0FBTyxTQUFTLEdBQUcsT0FBTztBQUFBLEVBQzNCLENBQUM7QUFFRCxPQUFLLGFBQWEsWUFBWTtBQUM3QixVQUFNLFdBQVcsS0FBSyxTQUFTLGVBQWU7QUFFOUMsV0FBTyxHQUFHLENBQUUsTUFBTSxTQUFTLE9BQU8sUUFBUSxDQUFFO0FBRTVDLFVBQU0sU0FBUyxVQUFVLFVBQVUsZUFBZ0IsSUFBTTtBQUV6RCxXQUFPLGFBQWEsTUFBTSxHQUFHLFNBQVMsU0FBUyxRQUFRLEdBQUcsU0FBUyxHQUFHLGFBQWE7QUFBQSxFQUNwRixDQUFDO0FBRUQsT0FBSyx1REFBdUQsWUFBWTtBQUN2RSxVQUFNLFlBQVksS0FBSyxTQUFTLGdCQUFnQjtBQUNoRCxVQUFNLFlBQVksS0FBSyxTQUFTLGdCQUFnQjtBQUNoRCxVQUFNLFlBQVksS0FBSyxTQUFTLGdCQUFn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
