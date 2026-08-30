import * as fs from "fs";
import assert from "assert";
import { tmpdir } from "os";
import { basename, dirname, join } from "../../../../base/common/path.js";
import { Promises, RimRafMode } from "../../../../base/node/pfs.js";
import { getRandomTestPath } from "../../../../base/test/node/testUtils.js";
import { FileChangeFilter, FileChangeType } from "../../common/files.js";
import { watchFileContents } from "../../node/watcher/nodejs/nodejsWatcherLib.js";
import { isLinux, isMacintosh, isWindows } from "../../../../base/common/platform.js";
import { getDriveLetter } from "../../../../base/common/extpath.js";
import { ltrim } from "../../../../base/common/strings.js";
import { DeferredPromise, timeout } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { NodeJSWatcher } from "../../node/watcher/nodejs/nodejsWatcher.js";
import { FileAccess } from "../../../../base/common/network.js";
import { extUriBiasedIgnorePathCase } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { addUNCHostToAllowlist } from "../../../../base/node/unc.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { TestParcelWatcher } from "./parcelWatcher.test.js";
suite.skip("File Watcher (node.js)", function() {
  this.timeout(1e4);
  class TestNodeJSWatcher extends NodeJSWatcher {
    constructor() {
      super(...arguments);
      this.suspendedWatchRequestPollingInterval = 100;
      this._onDidWatch = this._register(new Emitter());
      this.onDidWatch = this._onDidWatch.event;
      this.onWatchFail = this._onDidWatchFail.event;
    }
    getUpdateWatchersDelay() {
      return 0;
    }
    async doWatch(requests) {
      await super.doWatch(requests);
      for (const watcher2 of this.watchers) {
        await watcher2.instance.ready;
      }
      this._onDidWatch.fire();
    }
  }
  let testDir;
  let watcher;
  let loggingEnabled = false;
  function enableLogging(enable) {
    loggingEnabled = enable;
    watcher?.setVerboseLogging(enable);
  }
  enableLogging(loggingEnabled);
  setup(async () => {
    await createWatcher(void 0);
    testDir = URI.file(getRandomTestPath(fs.realpathSync(tmpdir()), "vsctests", "filewatcher")).fsPath;
    const sourceDir = FileAccess.asFileUri("vs/platform/files/test/node/fixtures/service").fsPath;
    await Promises.copy(sourceDir, testDir, { preserveSymlinks: false });
  });
  async function createWatcher(accessor) {
    await watcher?.stop();
    watcher?.dispose();
    watcher = new TestNodeJSWatcher(accessor);
    watcher?.setVerboseLogging(loggingEnabled);
    watcher.onDidLogMessage((e) => {
      if (loggingEnabled) {
        console.log(`[non-recursive watcher test message] ${e.message}`);
      }
    });
    watcher.onDidError((e) => {
      if (loggingEnabled) {
        console.log(`[non-recursive watcher test error] ${e}`);
      }
    });
  }
  teardown(async () => {
    await watcher.stop();
    watcher.dispose();
    return Promises.rm(testDir).catch((error) => console.error(error));
  });
  function toMsg(type) {
    switch (type) {
      case FileChangeType.ADDED:
        return "added";
      case FileChangeType.DELETED:
        return "deleted";
      default:
        return "changed";
    }
  }
  async function awaitEvent(service, path, type, correlationId, expectedCount) {
    if (loggingEnabled) {
      console.log(`Awaiting change type '${toMsg(type)}' on file '${path}'`);
    }
    await new Promise((resolve) => {
      let counter = 0;
      const disposable = service.onDidChangeFile((events) => {
        for (const event of events) {
          if (extUriBiasedIgnorePathCase.isEqual(event.resource, URI.file(path)) && event.type === type && (correlationId === null || event.cId === correlationId)) {
            counter++;
            if (typeof expectedCount === "number" && counter < expectedCount) {
              continue;
            }
            disposable.dispose();
            resolve();
            break;
          }
        }
      });
    });
  }
  test("basics (folder watch)", async function() {
    const request = { path: testDir, excludes: [], recursive: false };
    await watcher.watch([request]);
    assert.strictEqual(watcher.isSuspended(request), false);
    const instance = Array.from(watcher.watchers)[0].instance;
    assert.strictEqual(instance.isReusingRecursiveWatcher, false);
    assert.strictEqual(instance.failed, false);
    const newFilePath = join(testDir, "newFile.txt");
    let changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.ADDED);
    await Promises.writeFile(newFilePath, "Hello World");
    await changeFuture;
    const newFolderPath = join(testDir, "New Folder");
    changeFuture = awaitEvent(watcher, newFolderPath, FileChangeType.ADDED);
    await fs.promises.mkdir(newFolderPath);
    await changeFuture;
    let renamedFilePath = join(testDir, "renamedFile.txt");
    changeFuture = Promise.all([
      awaitEvent(watcher, newFilePath, FileChangeType.DELETED),
      awaitEvent(watcher, renamedFilePath, FileChangeType.ADDED)
    ]);
    await Promises.rename(newFilePath, renamedFilePath);
    await changeFuture;
    let renamedFolderPath = join(testDir, "Renamed Folder");
    changeFuture = Promise.all([
      awaitEvent(watcher, newFolderPath, FileChangeType.DELETED),
      awaitEvent(watcher, renamedFolderPath, FileChangeType.ADDED)
    ]);
    await Promises.rename(newFolderPath, renamedFolderPath);
    await changeFuture;
    const caseRenamedFilePath = join(testDir, "RenamedFile.txt");
    changeFuture = Promise.all([
      awaitEvent(watcher, renamedFilePath, FileChangeType.DELETED),
      awaitEvent(watcher, caseRenamedFilePath, FileChangeType.ADDED)
    ]);
    await Promises.rename(renamedFilePath, caseRenamedFilePath);
    await changeFuture;
    renamedFilePath = caseRenamedFilePath;
    const caseRenamedFolderPath = join(testDir, "REnamed Folder");
    changeFuture = Promise.all([
      awaitEvent(watcher, renamedFolderPath, FileChangeType.DELETED),
      awaitEvent(watcher, caseRenamedFolderPath, FileChangeType.ADDED)
    ]);
    await Promises.rename(renamedFolderPath, caseRenamedFolderPath);
    await changeFuture;
    renamedFolderPath = caseRenamedFolderPath;
    const movedFilepath = join(testDir, "movedFile.txt");
    changeFuture = Promise.all([
      awaitEvent(watcher, renamedFilePath, FileChangeType.DELETED),
      awaitEvent(watcher, movedFilepath, FileChangeType.ADDED)
    ]);
    await Promises.rename(renamedFilePath, movedFilepath);
    await changeFuture;
    const movedFolderpath = join(testDir, "Moved Folder");
    changeFuture = Promise.all([
      awaitEvent(watcher, renamedFolderPath, FileChangeType.DELETED),
      awaitEvent(watcher, movedFolderpath, FileChangeType.ADDED)
    ]);
    await Promises.rename(renamedFolderPath, movedFolderpath);
    await changeFuture;
    const copiedFilepath = join(testDir, "copiedFile.txt");
    changeFuture = awaitEvent(watcher, copiedFilepath, FileChangeType.ADDED);
    await fs.promises.copyFile(movedFilepath, copiedFilepath);
    await changeFuture;
    const copiedFolderpath = join(testDir, "Copied Folder");
    changeFuture = awaitEvent(watcher, copiedFolderpath, FileChangeType.ADDED);
    await Promises.copy(movedFolderpath, copiedFolderpath, { preserveSymlinks: false });
    await changeFuture;
    changeFuture = awaitEvent(watcher, copiedFilepath, FileChangeType.UPDATED);
    await Promises.writeFile(copiedFilepath, "Hello Change");
    await changeFuture;
    const anotherNewFilePath = join(testDir, "anotherNewFile.txt");
    changeFuture = awaitEvent(watcher, anotherNewFilePath, FileChangeType.ADDED);
    await Promises.writeFile(anotherNewFilePath, "Hello Another World");
    await changeFuture;
    changeFuture = awaitEvent(watcher, copiedFilepath, FileChangeType.DELETED);
    await fs.promises.unlink(copiedFilepath);
    await changeFuture;
    changeFuture = awaitEvent(watcher, copiedFolderpath, FileChangeType.DELETED);
    await fs.promises.rmdir(copiedFolderpath);
    await changeFuture;
    watcher.dispose();
  });
  test("basics (file watch)", async function() {
    const filePath = join(testDir, "lorem.txt");
    const request = { path: filePath, excludes: [], recursive: false };
    await watcher.watch([request]);
    assert.strictEqual(watcher.isSuspended(request), false);
    const instance = Array.from(watcher.watchers)[0].instance;
    assert.strictEqual(instance.isReusingRecursiveWatcher, false);
    assert.strictEqual(instance.failed, false);
    let changeFuture = awaitEvent(watcher, filePath, FileChangeType.UPDATED);
    await Promises.writeFile(filePath, "Hello Change");
    await changeFuture;
    changeFuture = awaitEvent(watcher, filePath, FileChangeType.DELETED);
    await fs.promises.unlink(filePath);
    await changeFuture;
    await Promises.writeFile(filePath, "Hello Change");
    await watcher.watch([]);
    await watcher.watch([{ path: filePath, excludes: [], recursive: false }]);
    changeFuture = awaitEvent(watcher, filePath, FileChangeType.DELETED);
    await Promises.rename(filePath, `${filePath}-moved`);
    await changeFuture;
  });
  test("atomic writes (folder watch)", async function() {
    await watcher.watch([{ path: testDir, excludes: [], recursive: false }]);
    const newFilePath = join(testDir, "lorem.txt");
    const changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.UPDATED);
    await fs.promises.unlink(newFilePath);
    Promises.writeFile(newFilePath, "Hello Atomic World");
    await changeFuture;
  });
  test("atomic writes (file watch)", async function() {
    const filePath = join(testDir, "lorem.txt");
    await watcher.watch([{ path: filePath, excludes: [], recursive: false }]);
    const newFilePath = join(filePath);
    const changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.UPDATED);
    await fs.promises.unlink(newFilePath);
    Promises.writeFile(newFilePath, "Hello Atomic World");
    await changeFuture;
  });
  test("multiple events (folder watch)", async function() {
    await watcher.watch([{ path: testDir, excludes: [], recursive: false }]);
    const newFilePath1 = join(testDir, "newFile-1.txt");
    const newFilePath2 = join(testDir, "newFile-2.txt");
    const newFilePath3 = join(testDir, "newFile-3.txt");
    const addedFuture1 = awaitEvent(watcher, newFilePath1, FileChangeType.ADDED);
    const addedFuture2 = awaitEvent(watcher, newFilePath2, FileChangeType.ADDED);
    const addedFuture3 = awaitEvent(watcher, newFilePath3, FileChangeType.ADDED);
    await Promise.all([
      await Promises.writeFile(newFilePath1, "Hello World 1"),
      await Promises.writeFile(newFilePath2, "Hello World 2"),
      await Promises.writeFile(newFilePath3, "Hello World 3")
    ]);
    await Promise.all([addedFuture1, addedFuture2, addedFuture3]);
    const changeFuture1 = awaitEvent(watcher, newFilePath1, FileChangeType.UPDATED);
    const changeFuture2 = awaitEvent(watcher, newFilePath2, FileChangeType.UPDATED);
    const changeFuture3 = awaitEvent(watcher, newFilePath3, FileChangeType.UPDATED);
    await Promise.all([
      await Promises.writeFile(newFilePath1, "Hello Update 1"),
      await Promises.writeFile(newFilePath2, "Hello Update 2"),
      await Promises.writeFile(newFilePath3, "Hello Update 3")
    ]);
    await Promise.all([changeFuture1, changeFuture2, changeFuture3]);
    const copyFuture1 = awaitEvent(watcher, join(testDir, "newFile-1-copy.txt"), FileChangeType.ADDED);
    const copyFuture2 = awaitEvent(watcher, join(testDir, "newFile-2-copy.txt"), FileChangeType.ADDED);
    const copyFuture3 = awaitEvent(watcher, join(testDir, "newFile-3-copy.txt"), FileChangeType.ADDED);
    await Promise.all([
      Promises.copy(join(testDir, "newFile-1.txt"), join(testDir, "newFile-1-copy.txt"), { preserveSymlinks: false }),
      Promises.copy(join(testDir, "newFile-2.txt"), join(testDir, "newFile-2-copy.txt"), { preserveSymlinks: false }),
      Promises.copy(join(testDir, "newFile-3.txt"), join(testDir, "newFile-3-copy.txt"), { preserveSymlinks: false })
    ]);
    await Promise.all([copyFuture1, copyFuture2, copyFuture3]);
    const deleteFuture1 = awaitEvent(watcher, newFilePath1, FileChangeType.DELETED);
    const deleteFuture2 = awaitEvent(watcher, newFilePath2, FileChangeType.DELETED);
    const deleteFuture3 = awaitEvent(watcher, newFilePath3, FileChangeType.DELETED);
    await Promise.all([
      await fs.promises.unlink(newFilePath1),
      await fs.promises.unlink(newFilePath2),
      await fs.promises.unlink(newFilePath3)
    ]);
    await Promise.all([deleteFuture1, deleteFuture2, deleteFuture3]);
  });
  test("multiple events (file watch)", async function() {
    const filePath = join(testDir, "lorem.txt");
    await watcher.watch([{ path: filePath, excludes: [], recursive: false }]);
    const changeFuture1 = awaitEvent(watcher, filePath, FileChangeType.UPDATED);
    await Promise.all([
      await Promises.writeFile(filePath, "Hello Update 1"),
      await Promises.writeFile(filePath, "Hello Update 2"),
      await Promises.writeFile(filePath, "Hello Update 3")
    ]);
    await Promise.all([changeFuture1]);
  });
  test("excludes can be updated (folder watch)", async function() {
    await watcher.watch([{ path: testDir, excludes: ["**"], recursive: false }]);
    await watcher.watch([{ path: testDir, excludes: [], recursive: false }]);
    return basicCrudTest(join(testDir, "files-excludes.txt"));
  });
  test("excludes are ignored (file watch)", async function() {
    const filePath = join(testDir, "lorem.txt");
    await watcher.watch([{ path: filePath, excludes: ["**"], recursive: false }]);
    return basicCrudTest(filePath, true);
  });
  test("includes can be updated (folder watch)", async function() {
    await watcher.watch([{ path: testDir, excludes: [], includes: ["nothing"], recursive: false }]);
    await watcher.watch([{ path: testDir, excludes: [], recursive: false }]);
    return basicCrudTest(join(testDir, "files-includes.txt"));
  });
  test("non-includes are ignored (file watch)", async function() {
    const filePath = join(testDir, "lorem.txt");
    await watcher.watch([{ path: filePath, excludes: [], includes: ["nothing"], recursive: false }]);
    return basicCrudTest(filePath, true);
  });
  test("includes are supported (folder watch)", async function() {
    await watcher.watch([{ path: testDir, excludes: [], includes: ["**/files-includes.txt"], recursive: false }]);
    return basicCrudTest(join(testDir, "files-includes.txt"));
  });
  test("includes are supported (folder watch, relative pattern explicit)", async function() {
    await watcher.watch([{ path: testDir, excludes: [], includes: [{ base: testDir, pattern: "files-includes.txt" }], recursive: false }]);
    return basicCrudTest(join(testDir, "files-includes.txt"));
  });
  test("includes are supported (folder watch, relative pattern implicit)", async function() {
    await watcher.watch([{ path: testDir, excludes: [], includes: ["files-includes.txt"], recursive: false }]);
    return basicCrudTest(join(testDir, "files-includes.txt"));
  });
  test("correlationId is supported", async function() {
    const correlationId = Math.random();
    await watcher.watch([{ correlationId, path: testDir, excludes: [], recursive: false }]);
    return basicCrudTest(join(testDir, "newFile.txt"), void 0, correlationId);
  });
  (isWindows ? test.skip : test)("symlink support (folder watch)", async function() {
    const link = join(testDir, "deep-linked");
    const linkTarget = join(testDir, "deep");
    await fs.promises.symlink(linkTarget, link);
    await watcher.watch([{ path: link, excludes: [], recursive: false }]);
    return basicCrudTest(join(link, "newFile.txt"));
  });
  async function basicCrudTest(filePath, skipAdd, correlationId, expectedCount, awaitWatchAfterAdd) {
    let changeFuture;
    if (!skipAdd) {
      changeFuture = awaitEvent(watcher, filePath, FileChangeType.ADDED, correlationId, expectedCount);
      await Promises.writeFile(filePath, "Hello World");
      await changeFuture;
      if (awaitWatchAfterAdd) {
        await Event.toPromise(watcher.onDidWatch);
      }
    }
    changeFuture = awaitEvent(watcher, filePath, FileChangeType.UPDATED, correlationId, expectedCount);
    await Promises.writeFile(filePath, "Hello Change");
    await changeFuture;
    changeFuture = awaitEvent(watcher, filePath, FileChangeType.DELETED, correlationId, expectedCount);
    await fs.promises.unlink(await Promises.realpath(filePath));
    await changeFuture;
  }
  (isWindows ? test.skip : test)("symlink support (file watch)", async function() {
    const link = join(testDir, "lorem.txt-linked");
    const linkTarget = join(testDir, "lorem.txt");
    await fs.promises.symlink(linkTarget, link);
    await watcher.watch([{ path: link, excludes: [], recursive: false }]);
    return basicCrudTest(link, true);
  });
  (!isWindows ? test.skip : test)("unc support (folder watch)", async function() {
    addUNCHostToAllowlist("localhost");
    const uncPath = `\\\\localhost\\${getDriveLetter(testDir)?.toLowerCase()}$\\${ltrim(testDir.substr(testDir.indexOf(":") + 1), "\\")}`;
    await watcher.watch([{ path: uncPath, excludes: [], recursive: false }]);
    return basicCrudTest(join(uncPath, "newFile.txt"));
  });
  (!isWindows ? test.skip : test)("unc support (file watch)", async function() {
    addUNCHostToAllowlist("localhost");
    const uncPath = `\\\\localhost\\${getDriveLetter(testDir)?.toLowerCase()}$\\${ltrim(testDir.substr(testDir.indexOf(":") + 1), "\\")}\\lorem.txt`;
    await watcher.watch([{ path: uncPath, excludes: [], recursive: false }]);
    return basicCrudTest(uncPath, true);
  });
  (isLinux ? test.skip : test)("wrong casing (folder watch)", async function() {
    const wrongCase = join(dirname(testDir), basename(testDir).toUpperCase());
    await watcher.watch([{ path: wrongCase, excludes: [], recursive: false }]);
    return basicCrudTest(join(wrongCase, "newFile.txt"));
  });
  (isLinux ? test.skip : test)("wrong casing (file watch)", async function() {
    const filePath = join(testDir, "LOREM.txt");
    await watcher.watch([{ path: filePath, excludes: [], recursive: false }]);
    return basicCrudTest(filePath, true);
  });
  test("invalid path does not explode", async function() {
    const invalidPath = join(testDir, "invalid");
    await watcher.watch([{ path: invalidPath, excludes: [], recursive: false }]);
  });
  test("watchFileContents", async function() {
    const watchedPath = join(testDir, "lorem.txt");
    const cts = new CancellationTokenSource();
    const readyPromise = new DeferredPromise();
    const chunkPromise = new DeferredPromise();
    const watchPromise = watchFileContents(watchedPath, () => chunkPromise.complete(), () => readyPromise.complete(), cts.token);
    await readyPromise.p;
    Promises.writeFile(watchedPath, "Hello World");
    await chunkPromise.p;
    cts.cancel();
    return watchPromise;
  });
  test("watching same or overlapping paths supported when correlation is applied", async function() {
    await watcher.watch([
      { path: testDir, excludes: [], recursive: false, correlationId: 1 }
    ]);
    await basicCrudTest(join(testDir, "newFile_1.txt"), void 0, null, 1);
    await watcher.watch([
      { path: testDir, excludes: [], recursive: false, correlationId: 1 },
      { path: testDir, excludes: [], recursive: false, correlationId: 2 },
      { path: testDir, excludes: [], recursive: false, correlationId: void 0 }
    ]);
    await basicCrudTest(join(testDir, "newFile_2.txt"), void 0, null, 3);
    await basicCrudTest(join(testDir, "otherNewFile.txt"), void 0, null, 3);
  });
  test("watching missing path emits watcher fail event", async function() {
    const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
    const folderPath = join(testDir, "missing");
    watcher.watch([{ path: folderPath, excludes: [], recursive: true }]);
    await onDidWatchFail;
  });
  test("deleting watched path emits watcher fail and delete event when correlated (file watch)", async function() {
    const filePath = join(testDir, "lorem.txt");
    await watcher.watch([{ path: filePath, excludes: [], recursive: false, correlationId: 1 }]);
    const instance = Array.from(watcher.watchers)[0].instance;
    const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
    const changeFuture = awaitEvent(watcher, filePath, FileChangeType.DELETED, 1);
    fs.promises.unlink(filePath);
    await onDidWatchFail;
    await changeFuture;
    assert.strictEqual(instance.failed, true);
  });
  (isMacintosh || isWindows ? test.skip : test)("deleting watched path emits watcher fail and delete event when correlated (folder watch)", async function() {
    const folderPath = join(testDir, "deep");
    await watcher.watch([{ path: folderPath, excludes: [], recursive: false, correlationId: 1 }]);
    const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
    const changeFuture = awaitEvent(watcher, folderPath, FileChangeType.DELETED, 1);
    Promises.rm(folderPath, RimRafMode.UNLINK);
    await onDidWatchFail;
    await changeFuture;
  });
  test("watch requests support suspend/resume (file, does not exist in beginning)", async function() {
    const filePath = join(testDir, "not-found.txt");
    const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
    const request = { path: filePath, excludes: [], recursive: false };
    await watcher.watch([request]);
    await onDidWatchFail;
    assert.strictEqual(watcher.isSuspended(request), "polling");
    await basicCrudTest(filePath, void 0, null, void 0, true);
    await basicCrudTest(filePath, void 0, null, void 0, true);
  });
  test("watch requests support suspend/resume (file, exists in beginning)", async function() {
    const filePath = join(testDir, "lorem.txt");
    const request = { path: filePath, excludes: [], recursive: false };
    await watcher.watch([request]);
    const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
    await basicCrudTest(filePath, true);
    await onDidWatchFail;
    assert.strictEqual(watcher.isSuspended(request), "polling");
    await basicCrudTest(filePath, void 0, null, void 0, true);
  });
  (isWindows ? test.skip : test)("watch requests support suspend/resume (folder, does not exist in beginning)", async function() {
    let onDidWatchFail = Event.toPromise(watcher.onWatchFail);
    const folderPath = join(testDir, "not-found");
    const request = { path: folderPath, excludes: [], recursive: false };
    await watcher.watch([request]);
    await onDidWatchFail;
    assert.strictEqual(watcher.isSuspended(request), "polling");
    let changeFuture = awaitEvent(watcher, folderPath, FileChangeType.ADDED);
    let onDidWatch = Event.toPromise(watcher.onDidWatch);
    await fs.promises.mkdir(folderPath);
    await changeFuture;
    await onDidWatch;
    assert.strictEqual(watcher.isSuspended(request), false);
    if (isWindows) {
      const filePath = join(folderPath, "newFile.txt");
      await basicCrudTest(filePath);
      onDidWatchFail = Event.toPromise(watcher.onWatchFail);
      await fs.promises.rmdir(folderPath);
      await onDidWatchFail;
      changeFuture = awaitEvent(watcher, folderPath, FileChangeType.ADDED);
      onDidWatch = Event.toPromise(watcher.onDidWatch);
      await fs.promises.mkdir(folderPath);
      await changeFuture;
      await onDidWatch;
      await timeout(500);
      await basicCrudTest(filePath);
    }
  });
  (isMacintosh ? test.skip : test)("watch requests support suspend/resume (folder, exists in beginning)", async function() {
    const folderPath = join(testDir, "deep");
    await watcher.watch([{ path: folderPath, excludes: [], recursive: false }]);
    const filePath = join(folderPath, "newFile.txt");
    await basicCrudTest(filePath);
    const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
    await Promises.rm(folderPath);
    await onDidWatchFail;
    const changeFuture = awaitEvent(watcher, folderPath, FileChangeType.ADDED);
    const onDidWatch = Event.toPromise(watcher.onDidWatch);
    await fs.promises.mkdir(folderPath);
    await changeFuture;
    await onDidWatch;
    await timeout(500);
    await basicCrudTest(filePath);
  });
  test("parcel watcher reused when present for non-recursive file watching (uncorrelated)", function() {
    return testParcelWatcherReused(void 0);
  });
  test("parcel watcher reused when present for non-recursive file watching (correlated)", function() {
    return testParcelWatcherReused(2);
  });
  function createParcelWatcher() {
    const recursiveWatcher = new TestParcelWatcher();
    recursiveWatcher.setVerboseLogging(loggingEnabled);
    recursiveWatcher.onDidLogMessage((e) => {
      if (loggingEnabled) {
        console.log(`[recursive watcher test message] ${e.message}`);
      }
    });
    recursiveWatcher.onDidError((e) => {
      if (loggingEnabled) {
        console.log(`[recursive watcher test error] ${e.error}`);
      }
    });
    return recursiveWatcher;
  }
  async function testParcelWatcherReused(correlationId) {
    const recursiveWatcher = createParcelWatcher();
    await recursiveWatcher.watch([{ path: testDir, excludes: [], recursive: true, correlationId: 1 }]);
    const recursiveInstance = Array.from(recursiveWatcher.watchers)[0];
    assert.strictEqual(recursiveInstance.subscriptionsCount, 0);
    await createWatcher(recursiveWatcher);
    const filePath = join(testDir, "deep", "conway.js");
    await watcher.watch([{ path: filePath, excludes: [], recursive: false, correlationId }]);
    const { instance } = Array.from(watcher.watchers)[0];
    assert.strictEqual(instance.isReusingRecursiveWatcher, true);
    assert.strictEqual(recursiveInstance.subscriptionsCount, 1);
    let changeFuture = awaitEvent(watcher, filePath, isMacintosh ? FileChangeType.ADDED : FileChangeType.UPDATED, correlationId);
    await Promises.writeFile(filePath, "Hello World");
    await changeFuture;
    await recursiveWatcher.stop();
    recursiveWatcher.dispose();
    await timeout(500);
    changeFuture = awaitEvent(watcher, filePath, FileChangeType.UPDATED, correlationId);
    await Promises.writeFile(filePath, "Hello World");
    await changeFuture;
    assert.strictEqual(instance.isReusingRecursiveWatcher, false);
  }
  test("watch requests support suspend/resume (file, does not exist in beginning, parcel watcher reused)", async function() {
    const recursiveWatcher = createParcelWatcher();
    await recursiveWatcher.watch([{ path: testDir, excludes: [], recursive: true }]);
    await createWatcher(recursiveWatcher);
    const filePath = join(testDir, "not-found-2.txt");
    const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
    const request = { path: filePath, excludes: [], recursive: false };
    await watcher.watch([request]);
    await onDidWatchFail;
    assert.strictEqual(watcher.isSuspended(request), true);
    const changeFuture = awaitEvent(watcher, filePath, FileChangeType.ADDED);
    await Promises.writeFile(filePath, "Hello World");
    await changeFuture;
    assert.strictEqual(watcher.isSuspended(request), false);
  });
  test("event type filter (file watch)", async function() {
    const filePath = join(testDir, "lorem.txt");
    const request = { path: filePath, excludes: [], recursive: false, filter: FileChangeFilter.UPDATED | FileChangeFilter.DELETED, correlationId: 1 };
    await watcher.watch([request]);
    let changeFuture = awaitEvent(watcher, filePath, FileChangeType.UPDATED, 1);
    await Promises.writeFile(filePath, "Hello Change");
    await changeFuture;
    changeFuture = awaitEvent(watcher, filePath, FileChangeType.DELETED, 1);
    await fs.promises.unlink(filePath);
    await changeFuture;
  });
  test("event type filter (folder watch)", async function() {
    const request = { path: testDir, excludes: [], recursive: false, filter: FileChangeFilter.UPDATED | FileChangeFilter.DELETED, correlationId: 1 };
    await watcher.watch([request]);
    const filePath = join(testDir, "lorem.txt");
    let changeFuture = awaitEvent(watcher, filePath, FileChangeType.UPDATED, 1);
    await Promises.writeFile(filePath, "Hello Change");
    await changeFuture;
    changeFuture = awaitEvent(watcher, filePath, FileChangeType.DELETED, 1);
    await fs.promises.unlink(filePath);
    await changeFuture;
  });
  (isLinux ? test.skip : test)("includes are case insensitive on Windows/Mac", async function() {
    await watcher.watch([{ path: testDir, excludes: [], includes: ["*.TXT"], recursive: false }]);
    return basicCrudTest(join(testDir, "newFile.txt"));
  });
  (isLinux ? test.skip : test)("excludes are case insensitive on Windows/Mac", async function() {
    await watcher.watch([{ path: testDir, excludes: ["*.TXT"], recursive: false }]);
    const newFilePath = join(testDir, "newFile.txt");
    const changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.ADDED);
    await Promises.writeFile(newFilePath, "Hello World");
    const res = await Promise.any([
      timeout(500).then(() => true),
      changeFuture.then(() => false)
    ]);
    if (!res) {
      assert.fail("Unexpected change event");
    }
  });
  (isLinux ? test.skip : test)("excludes are case insensitive on Windows/Mac", async function() {
    await watcher.watch([{ path: testDir, excludes: ["*.TXT"], recursive: false }]);
    const newFilePath = join(testDir, "newFile.txt");
    const changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.ADDED);
    await Promises.writeFile(newFilePath, "Hello World");
    const res = await Promise.any([
      timeout(500).then(() => true),
      changeFuture.then(() => false)
    ]);
    if (!res) {
      assert.fail("Unexpected change event");
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZmlsZXNcXHRlc3RcXG5vZGVcXG5vZGVqc1dhdGNoZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHRtcGRpciB9IGZyb20gJ29zJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lLCBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcywgUmltUmFmTW9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2Uvbm9kZS9wZnMuanMnO1xuaW1wb3J0IHsgZ2V0UmFuZG9tVGVzdFBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3Qvbm9kZS90ZXN0VXRpbHMuanMnO1xuaW1wb3J0IHsgRmlsZUNoYW5nZUZpbHRlciwgRmlsZUNoYW5nZVR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSU5vblJlY3Vyc2l2ZVdhdGNoUmVxdWVzdCwgSVJlY3Vyc2l2ZVdhdGNoZXJXaXRoU3Vic2NyaWJlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3dhdGNoZXIuanMnO1xuaW1wb3J0IHsgd2F0Y2hGaWxlQ29udGVudHMgfSBmcm9tICcuLi8uLi9ub2RlL3dhdGNoZXIvbm9kZWpzL25vZGVqc1dhdGNoZXJMaWIuanMnO1xuaW1wb3J0IHsgaXNMaW51eCwgaXNNYWNpbnRvc2gsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGdldERyaXZlTGV0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXh0cGF0aC5qcyc7XG5pbXBvcnQgeyBsdHJpbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgTm9kZUpTV2F0Y2hlciB9IGZyb20gJy4uLy4uL25vZGUvd2F0Y2hlci9ub2RlanMvbm9kZWpzV2F0Y2hlci5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgYWRkVU5DSG9zdFRvQWxsb3dsaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9ub2RlL3VuYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFRlc3RQYXJjZWxXYXRjaGVyIH0gZnJvbSAnLi9wYXJjZWxXYXRjaGVyLnRlc3QuanMnO1xuXG4vLyB0aGlzIHN1aXRlIGhhcyBzaG93biBmbGFreSBydW5zIGluIEF6dXJlIHBpcGVsaW5lcyB3aGVyZVxuLy8gdGFza3Mgd291bGQganVzdCBoYW5nIGFuZCB0aW1lb3V0IGFmdGVyIGEgd2hpbGUgKG5vdCBpblxuLy8gbW9jaGEgYnV0IGdlbmVyYWxseSkuIGFzIHN1Y2ggdGhleSB3aWxsIHJ1biBvbmx5IG9uIGRlbWFuZFxuLy8gd2hlbmV2ZXIgd2UgdXBkYXRlIHRoZSB3YXRjaGVyIGxpYnJhcnkuXG5cbnN1aXRlLnNraXAoJ0ZpbGUgV2F0Y2hlciAobm9kZS5qcyknLCBmdW5jdGlvbiAoKSB7XG5cblx0dGhpcy50aW1lb3V0KDEwMDAwKTtcblxuXHRjbGFzcyBUZXN0Tm9kZUpTV2F0Y2hlciBleHRlbmRzIE5vZGVKU1dhdGNoZXIge1xuXG5cdFx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlYWRvbmx5IHN1c3BlbmRlZFdhdGNoUmVxdWVzdFBvbGxpbmdJbnRlcnZhbCA9IDEwMDtcblxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkV2F0Y2ggPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRyZWFkb25seSBvbkRpZFdhdGNoID0gdGhpcy5fb25EaWRXYXRjaC5ldmVudDtcblxuXHRcdHJlYWRvbmx5IG9uV2F0Y2hGYWlsID0gdGhpcy5fb25EaWRXYXRjaEZhaWwuZXZlbnQ7XG5cblx0XHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0VXBkYXRlV2F0Y2hlcnNEZWxheSgpOiBudW1iZXIge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXG5cdFx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIGRvV2F0Y2gocmVxdWVzdHM6IElOb25SZWN1cnNpdmVXYXRjaFJlcXVlc3RbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0YXdhaXQgc3VwZXIuZG9XYXRjaChyZXF1ZXN0cyk7XG5cdFx0XHRmb3IgKGNvbnN0IHdhdGNoZXIgb2YgdGhpcy53YXRjaGVycykge1xuXHRcdFx0XHRhd2FpdCB3YXRjaGVyLmluc3RhbmNlLnJlYWR5O1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9vbkRpZFdhdGNoLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRsZXQgdGVzdERpcjogc3RyaW5nO1xuXHRsZXQgd2F0Y2hlcjogVGVzdE5vZGVKU1dhdGNoZXI7XG5cblx0bGV0IGxvZ2dpbmdFbmFibGVkID0gZmFsc2U7XG5cblx0ZnVuY3Rpb24gZW5hYmxlTG9nZ2luZyhlbmFibGU6IGJvb2xlYW4pIHtcblx0XHRsb2dnaW5nRW5hYmxlZCA9IGVuYWJsZTtcblx0XHR3YXRjaGVyPy5zZXRWZXJib3NlTG9nZ2luZyhlbmFibGUpO1xuXHR9XG5cblx0ZW5hYmxlTG9nZ2luZyhsb2dnaW5nRW5hYmxlZCk7XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGNyZWF0ZVdhdGNoZXIodW5kZWZpbmVkKTtcblxuXHRcdC8vIFJ1bGUgb3V0IHN0cmFuZ2UgdGVzdGluZyBjb25kaXRpb25zIGJ5IHVzaW5nIHRoZSByZWFscGF0aFxuXHRcdC8vIGhlcmUuIGZvciBleGFtcGxlLCBvbiBtYWNPUyB0aGUgdG1wIGRpciBpcyBwb3RlbnRpYWxseSBhXG5cdFx0Ly8gc3ltbGluayBpbiBzb21lIG9mIHRoZSByb290IGZvbGRlcnMsIHdoaWNoIGlzIGEgcmF0aGVyXG5cdFx0Ly8gdW5yZWFsaXNpYyBjYXNlIGZvciB0aGUgZmlsZSB3YXRjaGVyLlxuXHRcdHRlc3REaXIgPSBVUkkuZmlsZShnZXRSYW5kb21UZXN0UGF0aChmcy5yZWFscGF0aFN5bmModG1wZGlyKCkpLCAndnNjdGVzdHMnLCAnZmlsZXdhdGNoZXInKSkuZnNQYXRoO1xuXG5cdFx0Y29uc3Qgc291cmNlRGlyID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3BsYXRmb3JtL2ZpbGVzL3Rlc3Qvbm9kZS9maXh0dXJlcy9zZXJ2aWNlJykuZnNQYXRoO1xuXG5cdFx0YXdhaXQgUHJvbWlzZXMuY29weShzb3VyY2VEaXIsIHRlc3REaXIsIHsgcHJlc2VydmVTeW1saW5rczogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVdhdGNoZXIoYWNjZXNzb3I6IElSZWN1cnNpdmVXYXRjaGVyV2l0aFN1YnNjcmliZSB8IHVuZGVmaW5lZCkge1xuXHRcdGF3YWl0IHdhdGNoZXI/LnN0b3AoKTtcblx0XHR3YXRjaGVyPy5kaXNwb3NlKCk7XG5cblx0XHR3YXRjaGVyID0gbmV3IFRlc3ROb2RlSlNXYXRjaGVyKGFjY2Vzc29yKTtcblx0XHR3YXRjaGVyPy5zZXRWZXJib3NlTG9nZ2luZyhsb2dnaW5nRW5hYmxlZCk7XG5cblx0XHR3YXRjaGVyLm9uRGlkTG9nTWVzc2FnZShlID0+IHtcblx0XHRcdGlmIChsb2dnaW5nRW5hYmxlZCkge1xuXHRcdFx0XHRjb25zb2xlLmxvZyhgW25vbi1yZWN1cnNpdmUgd2F0Y2hlciB0ZXN0IG1lc3NhZ2VdICR7ZS5tZXNzYWdlfWApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0d2F0Y2hlci5vbkRpZEVycm9yKGUgPT4ge1xuXHRcdFx0aWYgKGxvZ2dpbmdFbmFibGVkKSB7XG5cdFx0XHRcdGNvbnNvbGUubG9nKGBbbm9uLXJlY3Vyc2l2ZSB3YXRjaGVyIHRlc3QgZXJyb3JdICR7ZX1gKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHRlYXJkb3duKGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3YXRjaGVyLnN0b3AoKTtcblx0XHR3YXRjaGVyLmRpc3Bvc2UoKTtcblxuXHRcdC8vIFBvc3NpYmxlIHRoYXQgdGhlIGZpbGUgd2F0Y2hlciBpcyBzdGlsbCBob2xkaW5nXG5cdFx0Ly8gb250byB0aGUgZm9sZGVycyBvbiBXaW5kb3dzIHNwZWNpZmljYWxseSBhbmQgdGhlXG5cdFx0Ly8gdW5saW5rIHdvdWxkIGZhaWwuIEluIHRoYXQgY2FzZSwgZG8gbm90IGZhaWwgdGhlXG5cdFx0Ly8gdGVzdCBzdWl0ZS5cblx0XHRyZXR1cm4gUHJvbWlzZXMucm0odGVzdERpcikuY2F0Y2goZXJyb3IgPT4gY29uc29sZS5lcnJvcihlcnJvcikpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiB0b01zZyh0eXBlOiBGaWxlQ2hhbmdlVHlwZSk6IHN0cmluZyB7XG5cdFx0c3dpdGNoICh0eXBlKSB7XG5cdFx0XHRjYXNlIEZpbGVDaGFuZ2VUeXBlLkFEREVEOiByZXR1cm4gJ2FkZGVkJztcblx0XHRcdGNhc2UgRmlsZUNoYW5nZVR5cGUuREVMRVRFRDogcmV0dXJuICdkZWxldGVkJztcblx0XHRcdGRlZmF1bHQ6IHJldHVybiAnY2hhbmdlZCc7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gYXdhaXRFdmVudChzZXJ2aWNlOiBUZXN0Tm9kZUpTV2F0Y2hlciwgcGF0aDogc3RyaW5nLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZSwgY29ycmVsYXRpb25JZD86IG51bWJlciB8IG51bGwsIGV4cGVjdGVkQ291bnQ/OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAobG9nZ2luZ0VuYWJsZWQpIHtcblx0XHRcdGNvbnNvbGUubG9nKGBBd2FpdGluZyBjaGFuZ2UgdHlwZSAnJHt0b01zZyh0eXBlKX0nIG9uIGZpbGUgJyR7cGF0aH0nYCk7XG5cdFx0fVxuXG5cdFx0Ly8gQXdhaXQgdGhlIGV2ZW50XG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRsZXQgY291bnRlciA9IDA7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gc2VydmljZS5vbkRpZENoYW5nZUZpbGUoZXZlbnRzID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCBldmVudCBvZiBldmVudHMpIHtcblx0XHRcdFx0XHRpZiAoZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbChldmVudC5yZXNvdXJjZSwgVVJJLmZpbGUocGF0aCkpICYmIGV2ZW50LnR5cGUgPT09IHR5cGUgJiYgKGNvcnJlbGF0aW9uSWQgPT09IG51bGwgfHwgZXZlbnQuY0lkID09PSBjb3JyZWxhdGlvbklkKSkge1xuXHRcdFx0XHRcdFx0Y291bnRlcisrO1xuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZiBleHBlY3RlZENvdW50ID09PSAnbnVtYmVyJyAmJiBjb3VudGVyIDwgZXhwZWN0ZWRDb3VudCkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTsgLy8gbm90IHlldFxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHR0ZXN0KCdiYXNpY3MgKGZvbGRlciB3YXRjaCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IHsgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IGZhbHNlIH07XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbcmVxdWVzdF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXRjaGVyLmlzU3VzcGVuZGVkKHJlcXVlc3QpLCBmYWxzZSk7XG5cblx0XHRjb25zdCBpbnN0YW5jZSA9IEFycmF5LmZyb20od2F0Y2hlci53YXRjaGVycylbMF0uaW5zdGFuY2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RhbmNlLmlzUmV1c2luZ1JlY3Vyc2l2ZVdhdGNoZXIsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdGFuY2UuZmFpbGVkLCBmYWxzZSk7XG5cblx0XHQvLyBOZXcgZmlsZVxuXHRcdGNvbnN0IG5ld0ZpbGVQYXRoID0gam9pbih0ZXN0RGlyLCAnbmV3RmlsZS50eHQnKTtcblx0XHRsZXQgY2hhbmdlRnV0dXJlOiBQcm9taXNlPHVua25vd24+ID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShuZXdGaWxlUGF0aCwgJ0hlbGxvIFdvcmxkJyk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXG5cdFx0Ly8gTmV3IGZvbGRlclxuXHRcdGNvbnN0IG5ld0ZvbGRlclBhdGggPSBqb2luKHRlc3REaXIsICdOZXcgRm9sZGVyJyk7XG5cdFx0Y2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGb2xkZXJQYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0YXdhaXQgZnMucHJvbWlzZXMubWtkaXIobmV3Rm9sZGVyUGF0aCk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXG5cdFx0Ly8gUmVuYW1lIGZpbGVcblx0XHRsZXQgcmVuYW1lZEZpbGVQYXRoID0gam9pbih0ZXN0RGlyLCAncmVuYW1lZEZpbGUudHh0Jyk7XG5cdFx0Y2hhbmdlRnV0dXJlID0gUHJvbWlzZS5hbGwoW1xuXHRcdFx0YXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCksXG5cdFx0XHRhd2FpdEV2ZW50KHdhdGNoZXIsIHJlbmFtZWRGaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQpXG5cdFx0XSk7XG5cdFx0YXdhaXQgUHJvbWlzZXMucmVuYW1lKG5ld0ZpbGVQYXRoLCByZW5hbWVkRmlsZVBhdGgpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblxuXHRcdC8vIFJlbmFtZSBmb2xkZXJcblx0XHRsZXQgcmVuYW1lZEZvbGRlclBhdGggPSBqb2luKHRlc3REaXIsICdSZW5hbWVkIEZvbGRlcicpO1xuXHRcdGNoYW5nZUZ1dHVyZSA9IFByb21pc2UuYWxsKFtcblx0XHRcdGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3Rm9sZGVyUGF0aCwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCksXG5cdFx0XHRhd2FpdEV2ZW50KHdhdGNoZXIsIHJlbmFtZWRGb2xkZXJQYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRClcblx0XHRdKTtcblx0XHRhd2FpdCBQcm9taXNlcy5yZW5hbWUobmV3Rm9sZGVyUGF0aCwgcmVuYW1lZEZvbGRlclBhdGgpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblxuXHRcdC8vIFJlbmFtZSBmaWxlIChzYW1lIG5hbWUsIGRpZmZlcmVudCBjYXNlKVxuXHRcdGNvbnN0IGNhc2VSZW5hbWVkRmlsZVBhdGggPSBqb2luKHRlc3REaXIsICdSZW5hbWVkRmlsZS50eHQnKTtcblx0XHRjaGFuZ2VGdXR1cmUgPSBQcm9taXNlLmFsbChbXG5cdFx0XHRhd2FpdEV2ZW50KHdhdGNoZXIsIHJlbmFtZWRGaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCksXG5cdFx0XHRhd2FpdEV2ZW50KHdhdGNoZXIsIGNhc2VSZW5hbWVkRmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKVxuXHRcdF0pO1xuXHRcdGF3YWl0IFByb21pc2VzLnJlbmFtZShyZW5hbWVkRmlsZVBhdGgsIGNhc2VSZW5hbWVkRmlsZVBhdGgpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblx0XHRyZW5hbWVkRmlsZVBhdGggPSBjYXNlUmVuYW1lZEZpbGVQYXRoO1xuXG5cdFx0Ly8gUmVuYW1lIGZvbGRlciAoc2FtZSBuYW1lLCBkaWZmZXJlbnQgY2FzZSlcblx0XHRjb25zdCBjYXNlUmVuYW1lZEZvbGRlclBhdGggPSBqb2luKHRlc3REaXIsICdSRW5hbWVkIEZvbGRlcicpO1xuXHRcdGNoYW5nZUZ1dHVyZSA9IFByb21pc2UuYWxsKFtcblx0XHRcdGF3YWl0RXZlbnQod2F0Y2hlciwgcmVuYW1lZEZvbGRlclBhdGgsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpLFxuXHRcdFx0YXdhaXRFdmVudCh3YXRjaGVyLCBjYXNlUmVuYW1lZEZvbGRlclBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKVxuXHRcdF0pO1xuXHRcdGF3YWl0IFByb21pc2VzLnJlbmFtZShyZW5hbWVkRm9sZGVyUGF0aCwgY2FzZVJlbmFtZWRGb2xkZXJQYXRoKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cdFx0cmVuYW1lZEZvbGRlclBhdGggPSBjYXNlUmVuYW1lZEZvbGRlclBhdGg7XG5cblx0XHQvLyBNb3ZlIGZpbGVcblx0XHRjb25zdCBtb3ZlZEZpbGVwYXRoID0gam9pbih0ZXN0RGlyLCAnbW92ZWRGaWxlLnR4dCcpO1xuXHRcdGNoYW5nZUZ1dHVyZSA9IFByb21pc2UuYWxsKFtcblx0XHRcdGF3YWl0RXZlbnQod2F0Y2hlciwgcmVuYW1lZEZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKSxcblx0XHRcdGF3YWl0RXZlbnQod2F0Y2hlciwgbW92ZWRGaWxlcGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQpXG5cdFx0XSk7XG5cdFx0YXdhaXQgUHJvbWlzZXMucmVuYW1lKHJlbmFtZWRGaWxlUGF0aCwgbW92ZWRGaWxlcGF0aCk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXG5cdFx0Ly8gTW92ZSBmb2xkZXJcblx0XHRjb25zdCBtb3ZlZEZvbGRlcnBhdGggPSBqb2luKHRlc3REaXIsICdNb3ZlZCBGb2xkZXInKTtcblx0XHRjaGFuZ2VGdXR1cmUgPSBQcm9taXNlLmFsbChbXG5cdFx0XHRhd2FpdEV2ZW50KHdhdGNoZXIsIHJlbmFtZWRGb2xkZXJQYXRoLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKSxcblx0XHRcdGF3YWl0RXZlbnQod2F0Y2hlciwgbW92ZWRGb2xkZXJwYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRClcblx0XHRdKTtcblx0XHRhd2FpdCBQcm9taXNlcy5yZW5hbWUocmVuYW1lZEZvbGRlclBhdGgsIG1vdmVkRm9sZGVycGF0aCk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXG5cdFx0Ly8gQ29weSBmaWxlXG5cdFx0Y29uc3QgY29waWVkRmlsZXBhdGggPSBqb2luKHRlc3REaXIsICdjb3BpZWRGaWxlLnR4dCcpO1xuXHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgY29waWVkRmlsZXBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRhd2FpdCBmcy5wcm9taXNlcy5jb3B5RmlsZShtb3ZlZEZpbGVwYXRoLCBjb3BpZWRGaWxlcGF0aCk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXG5cdFx0Ly8gQ29weSBmb2xkZXJcblx0XHRjb25zdCBjb3BpZWRGb2xkZXJwYXRoID0gam9pbih0ZXN0RGlyLCAnQ29waWVkIEZvbGRlcicpO1xuXHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgY29waWVkRm9sZGVycGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdGF3YWl0IFByb21pc2VzLmNvcHkobW92ZWRGb2xkZXJwYXRoLCBjb3BpZWRGb2xkZXJwYXRoLCB7IHByZXNlcnZlU3ltbGlua3M6IGZhbHNlIH0pO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblxuXHRcdC8vIENoYW5nZSBmaWxlXG5cdFx0Y2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBjb3BpZWRGaWxlcGF0aCwgRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCk7XG5cdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKGNvcGllZEZpbGVwYXRoLCAnSGVsbG8gQ2hhbmdlJyk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXG5cdFx0Ly8gQ3JlYXRlIG5ldyBmaWxlXG5cdFx0Y29uc3QgYW5vdGhlck5ld0ZpbGVQYXRoID0gam9pbih0ZXN0RGlyLCAnYW5vdGhlck5ld0ZpbGUudHh0Jyk7XG5cdFx0Y2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBhbm90aGVyTmV3RmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUoYW5vdGhlck5ld0ZpbGVQYXRoLCAnSGVsbG8gQW5vdGhlciBXb3JsZCcpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblxuXHRcdC8vIERlbGV0ZSBmaWxlXG5cdFx0Y2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBjb3BpZWRGaWxlcGF0aCwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCk7XG5cdFx0YXdhaXQgZnMucHJvbWlzZXMudW5saW5rKGNvcGllZEZpbGVwYXRoKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cblx0XHQvLyBEZWxldGUgZm9sZGVyXG5cdFx0Y2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBjb3BpZWRGb2xkZXJwYXRoLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKTtcblx0XHRhd2FpdCBmcy5wcm9taXNlcy5ybWRpcihjb3BpZWRGb2xkZXJwYXRoKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cblx0XHR3YXRjaGVyLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnYmFzaWNzIChmaWxlIHdhdGNoKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmaWxlUGF0aCA9IGpvaW4odGVzdERpciwgJ2xvcmVtLnR4dCcpO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSB7IHBhdGg6IGZpbGVQYXRoLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UgfTtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFtyZXF1ZXN0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhdGNoZXIuaXNTdXNwZW5kZWQocmVxdWVzdCksIGZhbHNlKTtcblxuXHRcdGNvbnN0IGluc3RhbmNlID0gQXJyYXkuZnJvbSh3YXRjaGVyLndhdGNoZXJzKVswXS5pbnN0YW5jZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdGFuY2UuaXNSZXVzaW5nUmVjdXJzaXZlV2F0Y2hlciwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnN0YW5jZS5mYWlsZWQsIGZhbHNlKTtcblxuXHRcdC8vIENoYW5nZSBmaWxlXG5cdFx0bGV0IGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgZmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQpO1xuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShmaWxlUGF0aCwgJ0hlbGxvIENoYW5nZScpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblxuXHRcdC8vIERlbGV0ZSBmaWxlXG5cdFx0Y2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBmaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCk7XG5cdFx0YXdhaXQgZnMucHJvbWlzZXMudW5saW5rKGZpbGVQYXRoKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cblx0XHQvLyBSZWNyZWF0ZSB3YXRjaGVyXG5cdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKGZpbGVQYXRoLCAnSGVsbG8gQ2hhbmdlJyk7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbXSk7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiBmaWxlUGF0aCwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IGZhbHNlIH1dKTtcblxuXHRcdC8vIE1vdmUgZmlsZVxuXHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgZmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpO1xuXHRcdGF3YWl0IFByb21pc2VzLnJlbmFtZShmaWxlUGF0aCwgYCR7ZmlsZVBhdGh9LW1vdmVkYCk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXHR9KTtcblxuXHR0ZXN0KCdhdG9taWMgd3JpdGVzIChmb2xkZXIgd2F0Y2gpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IGZhbHNlIH1dKTtcblxuXHRcdC8vIERlbGV0ZSArIFJlY3JlYXRlIGZpbGVcblx0XHRjb25zdCBuZXdGaWxlUGF0aCA9IGpvaW4odGVzdERpciwgJ2xvcmVtLnR4dCcpO1xuXHRcdGNvbnN0IGNoYW5nZUZ1dHVyZTogUHJvbWlzZTx1bmtub3duPiA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQpO1xuXHRcdGF3YWl0IGZzLnByb21pc2VzLnVubGluayhuZXdGaWxlUGF0aCk7XG5cdFx0UHJvbWlzZXMud3JpdGVGaWxlKG5ld0ZpbGVQYXRoLCAnSGVsbG8gQXRvbWljIFdvcmxkJyk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXHR9KTtcblxuXHR0ZXN0KCdhdG9taWMgd3JpdGVzIChmaWxlIHdhdGNoKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmaWxlUGF0aCA9IGpvaW4odGVzdERpciwgJ2xvcmVtLnR4dCcpO1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogZmlsZVBhdGgsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiBmYWxzZSB9XSk7XG5cblx0XHQvLyBEZWxldGUgKyBSZWNyZWF0ZSBmaWxlXG5cdFx0Y29uc3QgbmV3RmlsZVBhdGggPSBqb2luKGZpbGVQYXRoKTtcblx0XHRjb25zdCBjaGFuZ2VGdXR1cmU6IFByb21pc2U8dW5rbm93bj4gPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKTtcblx0XHRhd2FpdCBmcy5wcm9taXNlcy51bmxpbmsobmV3RmlsZVBhdGgpO1xuXHRcdFByb21pc2VzLndyaXRlRmlsZShuZXdGaWxlUGF0aCwgJ0hlbGxvIEF0b21pYyBXb3JsZCcpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlwbGUgZXZlbnRzIChmb2xkZXIgd2F0Y2gpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IGZhbHNlIH1dKTtcblxuXHRcdC8vIG11bHRpcGxlIGFkZFxuXG5cdFx0Y29uc3QgbmV3RmlsZVBhdGgxID0gam9pbih0ZXN0RGlyLCAnbmV3RmlsZS0xLnR4dCcpO1xuXHRcdGNvbnN0IG5ld0ZpbGVQYXRoMiA9IGpvaW4odGVzdERpciwgJ25ld0ZpbGUtMi50eHQnKTtcblx0XHRjb25zdCBuZXdGaWxlUGF0aDMgPSBqb2luKHRlc3REaXIsICduZXdGaWxlLTMudHh0Jyk7XG5cblx0XHRjb25zdCBhZGRlZEZ1dHVyZTE6IFByb21pc2U8dW5rbm93bj4gPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoMSwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdGNvbnN0IGFkZGVkRnV0dXJlMjogUHJvbWlzZTx1bmtub3duPiA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGgyLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0Y29uc3QgYWRkZWRGdXR1cmUzOiBQcm9taXNlPHVua25vd24+ID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aDMsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShuZXdGaWxlUGF0aDEsICdIZWxsbyBXb3JsZCAxJyksXG5cdFx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUobmV3RmlsZVBhdGgyLCAnSGVsbG8gV29ybGQgMicpLFxuXHRcdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKG5ld0ZpbGVQYXRoMywgJ0hlbGxvIFdvcmxkIDMnKSxcblx0XHRdKTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFthZGRlZEZ1dHVyZTEsIGFkZGVkRnV0dXJlMiwgYWRkZWRGdXR1cmUzXSk7XG5cblx0XHQvLyBtdWx0aXBsZSBjaGFuZ2VcblxuXHRcdGNvbnN0IGNoYW5nZUZ1dHVyZTE6IFByb21pc2U8dW5rbm93bj4gPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoMSwgRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCk7XG5cdFx0Y29uc3QgY2hhbmdlRnV0dXJlMjogUHJvbWlzZTx1bmtub3duPiA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGgyLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKTtcblx0XHRjb25zdCBjaGFuZ2VGdXR1cmUzOiBQcm9taXNlPHVua25vd24+ID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aDMsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKG5ld0ZpbGVQYXRoMSwgJ0hlbGxvIFVwZGF0ZSAxJyksXG5cdFx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUobmV3RmlsZVBhdGgyLCAnSGVsbG8gVXBkYXRlIDInKSxcblx0XHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShuZXdGaWxlUGF0aDMsICdIZWxsbyBVcGRhdGUgMycpLFxuXHRcdF0pO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW2NoYW5nZUZ1dHVyZTEsIGNoYW5nZUZ1dHVyZTIsIGNoYW5nZUZ1dHVyZTNdKTtcblxuXHRcdC8vIGNvcHkgd2l0aCBtdWx0aXBsZSBmaWxlc1xuXG5cdFx0Y29uc3QgY29weUZ1dHVyZTE6IFByb21pc2U8dW5rbm93bj4gPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGpvaW4odGVzdERpciwgJ25ld0ZpbGUtMS1jb3B5LnR4dCcpLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0Y29uc3QgY29weUZ1dHVyZTI6IFByb21pc2U8dW5rbm93bj4gPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGpvaW4odGVzdERpciwgJ25ld0ZpbGUtMi1jb3B5LnR4dCcpLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0Y29uc3QgY29weUZ1dHVyZTM6IFByb21pc2U8dW5rbm93bj4gPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGpvaW4odGVzdERpciwgJ25ld0ZpbGUtMy1jb3B5LnR4dCcpLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRQcm9taXNlcy5jb3B5KGpvaW4odGVzdERpciwgJ25ld0ZpbGUtMS50eHQnKSwgam9pbih0ZXN0RGlyLCAnbmV3RmlsZS0xLWNvcHkudHh0JyksIHsgcHJlc2VydmVTeW1saW5rczogZmFsc2UgfSksXG5cdFx0XHRQcm9taXNlcy5jb3B5KGpvaW4odGVzdERpciwgJ25ld0ZpbGUtMi50eHQnKSwgam9pbih0ZXN0RGlyLCAnbmV3RmlsZS0yLWNvcHkudHh0JyksIHsgcHJlc2VydmVTeW1saW5rczogZmFsc2UgfSksXG5cdFx0XHRQcm9taXNlcy5jb3B5KGpvaW4odGVzdERpciwgJ25ld0ZpbGUtMy50eHQnKSwgam9pbih0ZXN0RGlyLCAnbmV3RmlsZS0zLWNvcHkudHh0JyksIHsgcHJlc2VydmVTeW1saW5rczogZmFsc2UgfSlcblx0XHRdKTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtjb3B5RnV0dXJlMSwgY29weUZ1dHVyZTIsIGNvcHlGdXR1cmUzXSk7XG5cblx0XHQvLyBtdWx0aXBsZSBkZWxldGVcblxuXHRcdGNvbnN0IGRlbGV0ZUZ1dHVyZTE6IFByb21pc2U8dW5rbm93bj4gPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoMSwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCk7XG5cdFx0Y29uc3QgZGVsZXRlRnV0dXJlMjogUHJvbWlzZTx1bmtub3duPiA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGgyLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKTtcblx0XHRjb25zdCBkZWxldGVGdXR1cmUzOiBQcm9taXNlPHVua25vd24+ID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aDMsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0YXdhaXQgZnMucHJvbWlzZXMudW5saW5rKG5ld0ZpbGVQYXRoMSksXG5cdFx0XHRhd2FpdCBmcy5wcm9taXNlcy51bmxpbmsobmV3RmlsZVBhdGgyKSxcblx0XHRcdGF3YWl0IGZzLnByb21pc2VzLnVubGluayhuZXdGaWxlUGF0aDMpXG5cdFx0XSk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbZGVsZXRlRnV0dXJlMSwgZGVsZXRlRnV0dXJlMiwgZGVsZXRlRnV0dXJlM10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aXBsZSBldmVudHMgKGZpbGUgd2F0Y2gpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZpbGVQYXRoID0gam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0Jyk7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiBmaWxlUGF0aCwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IGZhbHNlIH1dKTtcblxuXHRcdC8vIG11bHRpcGxlIGNoYW5nZVxuXG5cdFx0Y29uc3QgY2hhbmdlRnV0dXJlMTogUHJvbWlzZTx1bmtub3duPiA9IGF3YWl0RXZlbnQod2F0Y2hlciwgZmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKGZpbGVQYXRoLCAnSGVsbG8gVXBkYXRlIDEnKSxcblx0XHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShmaWxlUGF0aCwgJ0hlbGxvIFVwZGF0ZSAyJyksXG5cdFx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUoZmlsZVBhdGgsICdIZWxsbyBVcGRhdGUgMycpLFxuXHRcdF0pO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW2NoYW5nZUZ1dHVyZTFdKTtcblx0fSk7XG5cblx0dGVzdCgnZXhjbHVkZXMgY2FuIGJlIHVwZGF0ZWQgKGZvbGRlciB3YXRjaCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogWycqKiddLCByZWN1cnNpdmU6IGZhbHNlIH1dKTtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiBmYWxzZSB9XSk7XG5cblx0XHRyZXR1cm4gYmFzaWNDcnVkVGVzdChqb2luKHRlc3REaXIsICdmaWxlcy1leGNsdWRlcy50eHQnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4Y2x1ZGVzIGFyZSBpZ25vcmVkIChmaWxlIHdhdGNoKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmaWxlUGF0aCA9IGpvaW4odGVzdERpciwgJ2xvcmVtLnR4dCcpO1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogZmlsZVBhdGgsIGV4Y2x1ZGVzOiBbJyoqJ10sIHJlY3Vyc2l2ZTogZmFsc2UgfV0pO1xuXG5cdFx0cmV0dXJuIGJhc2ljQ3J1ZFRlc3QoZmlsZVBhdGgsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmNsdWRlcyBjYW4gYmUgdXBkYXRlZCAoZm9sZGVyIHdhdGNoKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgaW5jbHVkZXM6IFsnbm90aGluZyddLCByZWN1cnNpdmU6IGZhbHNlIH1dKTtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiBmYWxzZSB9XSk7XG5cblx0XHRyZXR1cm4gYmFzaWNDcnVkVGVzdChqb2luKHRlc3REaXIsICdmaWxlcy1pbmNsdWRlcy50eHQnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vbi1pbmNsdWRlcyBhcmUgaWdub3JlZCAoZmlsZSB3YXRjaCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZmlsZVBhdGggPSBqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKTtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IGZpbGVQYXRoLCBleGNsdWRlczogW10sIGluY2x1ZGVzOiBbJ25vdGhpbmcnXSwgcmVjdXJzaXZlOiBmYWxzZSB9XSk7XG5cblx0XHRyZXR1cm4gYmFzaWNDcnVkVGVzdChmaWxlUGF0aCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luY2x1ZGVzIGFyZSBzdXBwb3J0ZWQgKGZvbGRlciB3YXRjaCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIGluY2x1ZGVzOiBbJyoqL2ZpbGVzLWluY2x1ZGVzLnR4dCddLCByZWN1cnNpdmU6IGZhbHNlIH1dKTtcblxuXHRcdHJldHVybiBiYXNpY0NydWRUZXN0KGpvaW4odGVzdERpciwgJ2ZpbGVzLWluY2x1ZGVzLnR4dCcpKTtcblx0fSk7XG5cblx0dGVzdCgnaW5jbHVkZXMgYXJlIHN1cHBvcnRlZCAoZm9sZGVyIHdhdGNoLCByZWxhdGl2ZSBwYXR0ZXJuIGV4cGxpY2l0KScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgaW5jbHVkZXM6IFt7IGJhc2U6IHRlc3REaXIsIHBhdHRlcm46ICdmaWxlcy1pbmNsdWRlcy50eHQnIH1dLCByZWN1cnNpdmU6IGZhbHNlIH1dKTtcblxuXHRcdHJldHVybiBiYXNpY0NydWRUZXN0KGpvaW4odGVzdERpciwgJ2ZpbGVzLWluY2x1ZGVzLnR4dCcpKTtcblx0fSk7XG5cblx0dGVzdCgnaW5jbHVkZXMgYXJlIHN1cHBvcnRlZCAoZm9sZGVyIHdhdGNoLCByZWxhdGl2ZSBwYXR0ZXJuIGltcGxpY2l0KScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgaW5jbHVkZXM6IFsnZmlsZXMtaW5jbHVkZXMudHh0J10sIHJlY3Vyc2l2ZTogZmFsc2UgfV0pO1xuXG5cdFx0cmV0dXJuIGJhc2ljQ3J1ZFRlc3Qoam9pbih0ZXN0RGlyLCAnZmlsZXMtaW5jbHVkZXMudHh0JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb3JyZWxhdGlvbklkIGlzIHN1cHBvcnRlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBjb3JyZWxhdGlvbklkID0gTWF0aC5yYW5kb20oKTtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IGNvcnJlbGF0aW9uSWQsIHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiBmYWxzZSB9XSk7XG5cblx0XHRyZXR1cm4gYmFzaWNDcnVkVGVzdChqb2luKHRlc3REaXIsICduZXdGaWxlLnR4dCcpLCB1bmRlZmluZWQsIGNvcnJlbGF0aW9uSWQpO1xuXHR9KTtcblxuXHQoaXNXaW5kb3dzIC8qIHdpbmRvd3M6IGNhbm5vdCBjcmVhdGUgZmlsZSBzeW1ib2xpYyBsaW5rIHdpdGhvdXQgZWxldmF0ZWQgY29udGV4dCAqLyA/IHRlc3Quc2tpcCA6IHRlc3QpKCdzeW1saW5rIHN1cHBvcnQgKGZvbGRlciB3YXRjaCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbGluayA9IGpvaW4odGVzdERpciwgJ2RlZXAtbGlua2VkJyk7XG5cdFx0Y29uc3QgbGlua1RhcmdldCA9IGpvaW4odGVzdERpciwgJ2RlZXAnKTtcblx0XHRhd2FpdCBmcy5wcm9taXNlcy5zeW1saW5rKGxpbmtUYXJnZXQsIGxpbmspO1xuXG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiBsaW5rLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UgfV0pO1xuXG5cdFx0cmV0dXJuIGJhc2ljQ3J1ZFRlc3Qoam9pbihsaW5rLCAnbmV3RmlsZS50eHQnKSk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIGJhc2ljQ3J1ZFRlc3QoZmlsZVBhdGg6IHN0cmluZywgc2tpcEFkZD86IGJvb2xlYW4sIGNvcnJlbGF0aW9uSWQ/OiBudW1iZXIgfCBudWxsLCBleHBlY3RlZENvdW50PzogbnVtYmVyLCBhd2FpdFdhdGNoQWZ0ZXJBZGQ/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IGNoYW5nZUZ1dHVyZTogUHJvbWlzZTx1bmtub3duPjtcblxuXHRcdC8vIE5ldyBmaWxlXG5cdFx0aWYgKCFza2lwQWRkKSB7XG5cdFx0XHRjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCwgY29ycmVsYXRpb25JZCwgZXhwZWN0ZWRDb3VudCk7XG5cdFx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUoZmlsZVBhdGgsICdIZWxsbyBXb3JsZCcpO1xuXHRcdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXHRcdFx0aWYgKGF3YWl0V2F0Y2hBZnRlckFkZCkge1xuXHRcdFx0XHRhd2FpdCBFdmVudC50b1Byb21pc2Uod2F0Y2hlci5vbkRpZFdhdGNoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDaGFuZ2UgZmlsZVxuXHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgZmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQsIGNvcnJlbGF0aW9uSWQsIGV4cGVjdGVkQ291bnQpO1xuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShmaWxlUGF0aCwgJ0hlbGxvIENoYW5nZScpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblxuXHRcdC8vIERlbGV0ZSBmaWxlXG5cdFx0Y2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBmaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCwgY29ycmVsYXRpb25JZCwgZXhwZWN0ZWRDb3VudCk7XG5cdFx0YXdhaXQgZnMucHJvbWlzZXMudW5saW5rKGF3YWl0IFByb21pc2VzLnJlYWxwYXRoKGZpbGVQYXRoKSk7IC8vIHN1cHBvcnQgc3ltbGlua3Ncblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cdH1cblxuXHQoaXNXaW5kb3dzIC8qIHdpbmRvd3M6IGNhbm5vdCBjcmVhdGUgZmlsZSBzeW1ib2xpYyBsaW5rIHdpdGhvdXQgZWxldmF0ZWQgY29udGV4dCAqLyA/IHRlc3Quc2tpcCA6IHRlc3QpKCdzeW1saW5rIHN1cHBvcnQgKGZpbGUgd2F0Y2gpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGxpbmsgPSBqb2luKHRlc3REaXIsICdsb3JlbS50eHQtbGlua2VkJyk7XG5cdFx0Y29uc3QgbGlua1RhcmdldCA9IGpvaW4odGVzdERpciwgJ2xvcmVtLnR4dCcpO1xuXHRcdGF3YWl0IGZzLnByb21pc2VzLnN5bWxpbmsobGlua1RhcmdldCwgbGluayk7XG5cblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IGxpbmssIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiBmYWxzZSB9XSk7XG5cblx0XHRyZXR1cm4gYmFzaWNDcnVkVGVzdChsaW5rLCB0cnVlKTtcblx0fSk7XG5cblx0KCFpc1dpbmRvd3MgLyogVU5DIGlzIHdpbmRvd3Mgb25seSAqLyA/IHRlc3Quc2tpcCA6IHRlc3QpKCd1bmMgc3VwcG9ydCAoZm9sZGVyIHdhdGNoKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhZGRVTkNIb3N0VG9BbGxvd2xpc3QoJ2xvY2FsaG9zdCcpO1xuXG5cdFx0Ly8gTG9jYWwgVU5DIHBhdGhzIGFyZSBpbiB0aGUgZm9ybSBvZjogXFxcXGxvY2FsaG9zdFxcYyRcXG15X2RpclxuXHRcdGNvbnN0IHVuY1BhdGggPSBgXFxcXFxcXFxsb2NhbGhvc3RcXFxcJHtnZXREcml2ZUxldHRlcih0ZXN0RGlyKT8udG9Mb3dlckNhc2UoKX0kXFxcXCR7bHRyaW0odGVzdERpci5zdWJzdHIodGVzdERpci5pbmRleE9mKCc6JykgKyAxKSwgJ1xcXFwnKX1gO1xuXG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiB1bmNQYXRoLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UgfV0pO1xuXG5cdFx0cmV0dXJuIGJhc2ljQ3J1ZFRlc3Qoam9pbih1bmNQYXRoLCAnbmV3RmlsZS50eHQnKSk7XG5cdH0pO1xuXG5cdCghaXNXaW5kb3dzIC8qIFVOQyBpcyB3aW5kb3dzIG9ubHkgKi8gPyB0ZXN0LnNraXAgOiB0ZXN0KSgndW5jIHN1cHBvcnQgKGZpbGUgd2F0Y2gpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGFkZFVOQ0hvc3RUb0FsbG93bGlzdCgnbG9jYWxob3N0Jyk7XG5cblx0XHQvLyBMb2NhbCBVTkMgcGF0aHMgYXJlIGluIHRoZSBmb3JtIG9mOiBcXFxcbG9jYWxob3N0XFxjJFxcbXlfZGlyXG5cdFx0Y29uc3QgdW5jUGF0aCA9IGBcXFxcXFxcXGxvY2FsaG9zdFxcXFwke2dldERyaXZlTGV0dGVyKHRlc3REaXIpPy50b0xvd2VyQ2FzZSgpfSRcXFxcJHtsdHJpbSh0ZXN0RGlyLnN1YnN0cih0ZXN0RGlyLmluZGV4T2YoJzonKSArIDEpLCAnXFxcXCcpfVxcXFxsb3JlbS50eHRgO1xuXG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiB1bmNQYXRoLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UgfV0pO1xuXG5cdFx0cmV0dXJuIGJhc2ljQ3J1ZFRlc3QodW5jUGF0aCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdChpc0xpbnV4IC8qIGxpbnV4OiBpcyBjYXNlIHNlbnNpdGl2ZSAqLyA/IHRlc3Quc2tpcCA6IHRlc3QpKCd3cm9uZyBjYXNpbmcgKGZvbGRlciB3YXRjaCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgd3JvbmdDYXNlID0gam9pbihkaXJuYW1lKHRlc3REaXIpLCBiYXNlbmFtZSh0ZXN0RGlyKS50b1VwcGVyQ2FzZSgpKTtcblxuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogd3JvbmdDYXNlLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UgfV0pO1xuXG5cdFx0cmV0dXJuIGJhc2ljQ3J1ZFRlc3Qoam9pbih3cm9uZ0Nhc2UsICduZXdGaWxlLnR4dCcpKTtcblx0fSk7XG5cblx0KGlzTGludXggLyogbGludXg6IGlzIGNhc2Ugc2Vuc2l0aXZlICovID8gdGVzdC5za2lwIDogdGVzdCkoJ3dyb25nIGNhc2luZyAoZmlsZSB3YXRjaCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZmlsZVBhdGggPSBqb2luKHRlc3REaXIsICdMT1JFTS50eHQnKTtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IGZpbGVQYXRoLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UgfV0pO1xuXG5cdFx0cmV0dXJuIGJhc2ljQ3J1ZFRlc3QoZmlsZVBhdGgsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnZhbGlkIHBhdGggZG9lcyBub3QgZXhwbG9kZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBpbnZhbGlkUGF0aCA9IGpvaW4odGVzdERpciwgJ2ludmFsaWQnKTtcblxuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogaW52YWxpZFBhdGgsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiBmYWxzZSB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dhdGNoRmlsZUNvbnRlbnRzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHdhdGNoZWRQYXRoID0gam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0Jyk7XG5cblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRcdGNvbnN0IHJlYWR5UHJvbWlzZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBjaHVua1Byb21pc2UgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3Qgd2F0Y2hQcm9taXNlID0gd2F0Y2hGaWxlQ29udGVudHMod2F0Y2hlZFBhdGgsICgpID0+IGNodW5rUHJvbWlzZS5jb21wbGV0ZSgpLCAoKSA9PiByZWFkeVByb21pc2UuY29tcGxldGUoKSwgY3RzLnRva2VuKTtcblxuXHRcdGF3YWl0IHJlYWR5UHJvbWlzZS5wO1xuXG5cdFx0UHJvbWlzZXMud3JpdGVGaWxlKHdhdGNoZWRQYXRoLCAnSGVsbG8gV29ybGQnKTtcblxuXHRcdGF3YWl0IGNodW5rUHJvbWlzZS5wO1xuXG5cdFx0Y3RzLmNhbmNlbCgpOyAvLyB0aGlzIHdpbGwgcmVzb2x2ZSBgd2F0Y2hQcm9taXNlYFxuXG5cdFx0cmV0dXJuIHdhdGNoUHJvbWlzZTtcblx0fSk7XG5cblx0dGVzdCgnd2F0Y2hpbmcgc2FtZSBvciBvdmVybGFwcGluZyBwYXRocyBzdXBwb3J0ZWQgd2hlbiBjb3JyZWxhdGlvbiBpcyBhcHBsaWVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW1xuXHRcdFx0eyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UsIGNvcnJlbGF0aW9uSWQ6IDEgfVxuXHRcdF0pO1xuXG5cdFx0YXdhaXQgYmFzaWNDcnVkVGVzdChqb2luKHRlc3REaXIsICduZXdGaWxlXzEudHh0JyksIHVuZGVmaW5lZCwgbnVsbCwgMSk7XG5cblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFtcblx0XHRcdHsgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IGZhbHNlLCBjb3JyZWxhdGlvbklkOiAxIH0sXG5cdFx0XHR7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiBmYWxzZSwgY29ycmVsYXRpb25JZDogMiwgfSxcblx0XHRcdHsgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IGZhbHNlLCBjb3JyZWxhdGlvbklkOiB1bmRlZmluZWQgfVxuXHRcdF0pO1xuXG5cdFx0YXdhaXQgYmFzaWNDcnVkVGVzdChqb2luKHRlc3REaXIsICduZXdGaWxlXzIudHh0JyksIHVuZGVmaW5lZCwgbnVsbCwgMyk7XG5cdFx0YXdhaXQgYmFzaWNDcnVkVGVzdChqb2luKHRlc3REaXIsICdvdGhlck5ld0ZpbGUudHh0JyksIHVuZGVmaW5lZCwgbnVsbCwgMyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dhdGNoaW5nIG1pc3NpbmcgcGF0aCBlbWl0cyB3YXRjaGVyIGZhaWwgZXZlbnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgb25EaWRXYXRjaEZhaWwgPSBFdmVudC50b1Byb21pc2Uod2F0Y2hlci5vbldhdGNoRmFpbCk7XG5cblx0XHRjb25zdCBmb2xkZXJQYXRoID0gam9pbih0ZXN0RGlyLCAnbWlzc2luZycpO1xuXHRcdHdhdGNoZXIud2F0Y2goW3sgcGF0aDogZm9sZGVyUGF0aCwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IHRydWUgfV0pO1xuXG5cdFx0YXdhaXQgb25EaWRXYXRjaEZhaWw7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0aW5nIHdhdGNoZWQgcGF0aCBlbWl0cyB3YXRjaGVyIGZhaWwgYW5kIGRlbGV0ZSBldmVudCB3aGVuIGNvcnJlbGF0ZWQgKGZpbGUgd2F0Y2gpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZpbGVQYXRoID0gam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0Jyk7XG5cblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IGZpbGVQYXRoLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UsIGNvcnJlbGF0aW9uSWQ6IDEgfV0pO1xuXG5cdFx0Y29uc3QgaW5zdGFuY2UgPSBBcnJheS5mcm9tKHdhdGNoZXIud2F0Y2hlcnMpWzBdLmluc3RhbmNlO1xuXG5cdFx0Y29uc3Qgb25EaWRXYXRjaEZhaWwgPSBFdmVudC50b1Byb21pc2Uod2F0Y2hlci5vbldhdGNoRmFpbCk7XG5cdFx0Y29uc3QgY2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBmaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCwgMSk7XG5cdFx0ZnMucHJvbWlzZXMudW5saW5rKGZpbGVQYXRoKTtcblx0XHRhd2FpdCBvbkRpZFdhdGNoRmFpbDtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RhbmNlLmZhaWxlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdChpc01hY2ludG9zaCB8fCBpc1dpbmRvd3MgLyogbWFjT1M6IGRvZXMgbm90IHNlZW0gdG8gcmVwb3J0IGRlbGV0ZXMgb24gZm9sZGVycyB8IFdpbmRvd3M6IHJlcG9ydHMgb24oJ2Vycm9yJykgZXZlbnQgb25seSAqLyA/IHRlc3Quc2tpcCA6IHRlc3QpKCdkZWxldGluZyB3YXRjaGVkIHBhdGggZW1pdHMgd2F0Y2hlciBmYWlsIGFuZCBkZWxldGUgZXZlbnQgd2hlbiBjb3JyZWxhdGVkIChmb2xkZXIgd2F0Y2gpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZvbGRlclBhdGggPSBqb2luKHRlc3REaXIsICdkZWVwJyk7XG5cblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IGZvbGRlclBhdGgsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiBmYWxzZSwgY29ycmVsYXRpb25JZDogMSB9XSk7XG5cblx0XHRjb25zdCBvbkRpZFdhdGNoRmFpbCA9IEV2ZW50LnRvUHJvbWlzZSh3YXRjaGVyLm9uV2F0Y2hGYWlsKTtcblx0XHRjb25zdCBjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGZvbGRlclBhdGgsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQsIDEpO1xuXHRcdFByb21pc2VzLnJtKGZvbGRlclBhdGgsIFJpbVJhZk1vZGUuVU5MSU5LKTtcblx0XHRhd2FpdCBvbkRpZFdhdGNoRmFpbDtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cdH0pO1xuXG5cdHRlc3QoJ3dhdGNoIHJlcXVlc3RzIHN1cHBvcnQgc3VzcGVuZC9yZXN1bWUgKGZpbGUsIGRvZXMgbm90IGV4aXN0IGluIGJlZ2lubmluZyknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZmlsZVBhdGggPSBqb2luKHRlc3REaXIsICdub3QtZm91bmQudHh0Jyk7XG5cblx0XHRjb25zdCBvbkRpZFdhdGNoRmFpbCA9IEV2ZW50LnRvUHJvbWlzZSh3YXRjaGVyLm9uV2F0Y2hGYWlsKTtcblx0XHRjb25zdCByZXF1ZXN0ID0geyBwYXRoOiBmaWxlUGF0aCwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IGZhbHNlIH07XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbcmVxdWVzdF0pO1xuXHRcdGF3YWl0IG9uRGlkV2F0Y2hGYWlsO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXRjaGVyLmlzU3VzcGVuZGVkKHJlcXVlc3QpLCAncG9sbGluZycpO1xuXG5cdFx0YXdhaXQgYmFzaWNDcnVkVGVzdChmaWxlUGF0aCwgdW5kZWZpbmVkLCBudWxsLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdGF3YWl0IGJhc2ljQ3J1ZFRlc3QoZmlsZVBhdGgsIHVuZGVmaW5lZCwgbnVsbCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnd2F0Y2ggcmVxdWVzdHMgc3VwcG9ydCBzdXNwZW5kL3Jlc3VtZSAoZmlsZSwgZXhpc3RzIGluIGJlZ2lubmluZyknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZmlsZVBhdGggPSBqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKTtcblx0XHRjb25zdCByZXF1ZXN0ID0geyBwYXRoOiBmaWxlUGF0aCwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IGZhbHNlIH07XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbcmVxdWVzdF0pO1xuXG5cdFx0Y29uc3Qgb25EaWRXYXRjaEZhaWwgPSBFdmVudC50b1Byb21pc2Uod2F0Y2hlci5vbldhdGNoRmFpbCk7XG5cdFx0YXdhaXQgYmFzaWNDcnVkVGVzdChmaWxlUGF0aCwgdHJ1ZSk7XG5cdFx0YXdhaXQgb25EaWRXYXRjaEZhaWw7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhdGNoZXIuaXNTdXNwZW5kZWQocmVxdWVzdCksICdwb2xsaW5nJyk7XG5cblx0XHRhd2FpdCBiYXNpY0NydWRUZXN0KGZpbGVQYXRoLCB1bmRlZmluZWQsIG51bGwsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdChpc1dpbmRvd3MgLyogV2luZG93czogZG9lcyBub3Qgc2VlbSB0byByZXBvcnQgdGhpcyAqLyA/IHRlc3Quc2tpcCA6IHRlc3QpKCd3YXRjaCByZXF1ZXN0cyBzdXBwb3J0IHN1c3BlbmQvcmVzdW1lIChmb2xkZXIsIGRvZXMgbm90IGV4aXN0IGluIGJlZ2lubmluZyknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IG9uRGlkV2F0Y2hGYWlsID0gRXZlbnQudG9Qcm9taXNlKHdhdGNoZXIub25XYXRjaEZhaWwpO1xuXG5cdFx0Y29uc3QgZm9sZGVyUGF0aCA9IGpvaW4odGVzdERpciwgJ25vdC1mb3VuZCcpO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSB7IHBhdGg6IGZvbGRlclBhdGgsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiBmYWxzZSB9O1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3JlcXVlc3RdKTtcblx0XHRhd2FpdCBvbkRpZFdhdGNoRmFpbDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2F0Y2hlci5pc1N1c3BlbmRlZChyZXF1ZXN0KSwgJ3BvbGxpbmcnKTtcblxuXHRcdGxldCBjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGZvbGRlclBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRsZXQgb25EaWRXYXRjaCA9IEV2ZW50LnRvUHJvbWlzZSh3YXRjaGVyLm9uRGlkV2F0Y2gpO1xuXHRcdGF3YWl0IGZzLnByb21pc2VzLm1rZGlyKGZvbGRlclBhdGgpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblx0XHRhd2FpdCBvbkRpZFdhdGNoO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhdGNoZXIuaXNTdXNwZW5kZWQocmVxdWVzdCksIGZhbHNlKTtcblxuXHRcdGlmIChpc1dpbmRvd3MpIHsgLy8gc29tZWhvdyBmYWlsaW5nIG9uIG1hY09TL0xpbnV4XG5cdFx0XHRjb25zdCBmaWxlUGF0aCA9IGpvaW4oZm9sZGVyUGF0aCwgJ25ld0ZpbGUudHh0Jyk7XG5cdFx0XHRhd2FpdCBiYXNpY0NydWRUZXN0KGZpbGVQYXRoKTtcblxuXHRcdFx0b25EaWRXYXRjaEZhaWwgPSBFdmVudC50b1Byb21pc2Uod2F0Y2hlci5vbldhdGNoRmFpbCk7XG5cdFx0XHRhd2FpdCBmcy5wcm9taXNlcy5ybWRpcihmb2xkZXJQYXRoKTtcblx0XHRcdGF3YWl0IG9uRGlkV2F0Y2hGYWlsO1xuXG5cdFx0XHRjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGZvbGRlclBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRcdG9uRGlkV2F0Y2ggPSBFdmVudC50b1Byb21pc2Uod2F0Y2hlci5vbkRpZFdhdGNoKTtcblx0XHRcdGF3YWl0IGZzLnByb21pc2VzLm1rZGlyKGZvbGRlclBhdGgpO1xuXHRcdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXHRcdFx0YXdhaXQgb25EaWRXYXRjaDtcblxuXHRcdFx0YXdhaXQgdGltZW91dCg1MDApOyAvLyBzb21laG93IG5lZWRlZCBvbiBMaW51eFxuXG5cdFx0XHRhd2FpdCBiYXNpY0NydWRUZXN0KGZpbGVQYXRoKTtcblx0XHR9XG5cdH0pO1xuXG5cdChpc01hY2ludG9zaCAvKiBtYWNPUzogZG9lcyBub3Qgc2VlbSB0byByZXBvcnQgdGhpcyAqLyA/IHRlc3Quc2tpcCA6IHRlc3QpKCd3YXRjaCByZXF1ZXN0cyBzdXBwb3J0IHN1c3BlbmQvcmVzdW1lIChmb2xkZXIsIGV4aXN0cyBpbiBiZWdpbm5pbmcpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZvbGRlclBhdGggPSBqb2luKHRlc3REaXIsICdkZWVwJyk7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiBmb2xkZXJQYXRoLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UgfV0pO1xuXG5cdFx0Y29uc3QgZmlsZVBhdGggPSBqb2luKGZvbGRlclBhdGgsICduZXdGaWxlLnR4dCcpO1xuXHRcdGF3YWl0IGJhc2ljQ3J1ZFRlc3QoZmlsZVBhdGgpO1xuXG5cdFx0Y29uc3Qgb25EaWRXYXRjaEZhaWwgPSBFdmVudC50b1Byb21pc2Uod2F0Y2hlci5vbldhdGNoRmFpbCk7XG5cdFx0YXdhaXQgUHJvbWlzZXMucm0oZm9sZGVyUGF0aCk7XG5cdFx0YXdhaXQgb25EaWRXYXRjaEZhaWw7XG5cblx0XHRjb25zdCBjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGZvbGRlclBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRjb25zdCBvbkRpZFdhdGNoID0gRXZlbnQudG9Qcm9taXNlKHdhdGNoZXIub25EaWRXYXRjaCk7XG5cdFx0YXdhaXQgZnMucHJvbWlzZXMubWtkaXIoZm9sZGVyUGF0aCk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXHRcdGF3YWl0IG9uRGlkV2F0Y2g7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDUwMCk7IC8vIHNvbWVob3cgbmVlZGVkIG9uIExpbnV4XG5cblx0XHRhd2FpdCBiYXNpY0NydWRUZXN0KGZpbGVQYXRoKTtcblx0fSk7XG5cblx0dGVzdCgncGFyY2VsIHdhdGNoZXIgcmV1c2VkIHdoZW4gcHJlc2VudCBmb3Igbm9uLXJlY3Vyc2l2ZSBmaWxlIHdhdGNoaW5nICh1bmNvcnJlbGF0ZWQpJywgZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiB0ZXN0UGFyY2VsV2F0Y2hlclJldXNlZCh1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJjZWwgd2F0Y2hlciByZXVzZWQgd2hlbiBwcmVzZW50IGZvciBub24tcmVjdXJzaXZlIGZpbGUgd2F0Y2hpbmcgKGNvcnJlbGF0ZWQpJywgZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiB0ZXN0UGFyY2VsV2F0Y2hlclJldXNlZCgyKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlUGFyY2VsV2F0Y2hlcigpIHtcblx0XHRjb25zdCByZWN1cnNpdmVXYXRjaGVyID0gbmV3IFRlc3RQYXJjZWxXYXRjaGVyKCk7XG5cdFx0cmVjdXJzaXZlV2F0Y2hlci5zZXRWZXJib3NlTG9nZ2luZyhsb2dnaW5nRW5hYmxlZCk7XG5cdFx0cmVjdXJzaXZlV2F0Y2hlci5vbkRpZExvZ01lc3NhZ2UoZSA9PiB7XG5cdFx0XHRpZiAobG9nZ2luZ0VuYWJsZWQpIHtcblx0XHRcdFx0Y29uc29sZS5sb2coYFtyZWN1cnNpdmUgd2F0Y2hlciB0ZXN0IG1lc3NhZ2VdICR7ZS5tZXNzYWdlfWApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmVjdXJzaXZlV2F0Y2hlci5vbkRpZEVycm9yKGUgPT4ge1xuXHRcdFx0aWYgKGxvZ2dpbmdFbmFibGVkKSB7XG5cdFx0XHRcdGNvbnNvbGUubG9nKGBbcmVjdXJzaXZlIHdhdGNoZXIgdGVzdCBlcnJvcl0gJHtlLmVycm9yfWApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHJlY3Vyc2l2ZVdhdGNoZXI7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0UGFyY2VsV2F0Y2hlclJldXNlZChjb3JyZWxhdGlvbklkOiBudW1iZXIgfCB1bmRlZmluZWQpIHtcblx0XHRjb25zdCByZWN1cnNpdmVXYXRjaGVyID0gY3JlYXRlUGFyY2VsV2F0Y2hlcigpO1xuXHRcdGF3YWl0IHJlY3Vyc2l2ZVdhdGNoZXIud2F0Y2goW3sgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IHRydWUsIGNvcnJlbGF0aW9uSWQ6IDEgfV0pO1xuXG5cdFx0Y29uc3QgcmVjdXJzaXZlSW5zdGFuY2UgPSBBcnJheS5mcm9tKHJlY3Vyc2l2ZVdhdGNoZXIud2F0Y2hlcnMpWzBdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWN1cnNpdmVJbnN0YW5jZS5zdWJzY3JpcHRpb25zQ291bnQsIDApO1xuXG5cdFx0YXdhaXQgY3JlYXRlV2F0Y2hlcihyZWN1cnNpdmVXYXRjaGVyKTtcblxuXHRcdGNvbnN0IGZpbGVQYXRoID0gam9pbih0ZXN0RGlyLCAnZGVlcCcsICdjb253YXkuanMnKTtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IGZpbGVQYXRoLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UsIGNvcnJlbGF0aW9uSWQgfV0pO1xuXG5cdFx0Y29uc3QgeyBpbnN0YW5jZSB9ID0gQXJyYXkuZnJvbSh3YXRjaGVyLndhdGNoZXJzKVswXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdGFuY2UuaXNSZXVzaW5nUmVjdXJzaXZlV2F0Y2hlciwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlY3Vyc2l2ZUluc3RhbmNlLnN1YnNjcmlwdGlvbnNDb3VudCwgMSk7XG5cblx0XHRsZXQgY2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBmaWxlUGF0aCwgaXNNYWNpbnRvc2ggLyogc29tZWhvdyBmc2V2ZW50cyBzZWVtcyB0byByZXBvcnQgc3RpbGwgb24gdGhlIGluaXRpYWwgY3JlYXRlIGZyb20gdGVzdCBzZXR1cCAqLyA/IEZpbGVDaGFuZ2VUeXBlLkFEREVEIDogRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCwgY29ycmVsYXRpb25JZCk7XG5cdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKGZpbGVQYXRoLCAnSGVsbG8gV29ybGQnKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cblx0XHRhd2FpdCByZWN1cnNpdmVXYXRjaGVyLnN0b3AoKTtcblx0XHRyZWN1cnNpdmVXYXRjaGVyLmRpc3Bvc2UoKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoNTAwKTsgLy8gZ2l2ZSB0aGUgd2F0Y2hlciBzb21lIHRpbWUgdG8gcmVzdGFydFxuXG5cdFx0Y2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBmaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCwgY29ycmVsYXRpb25JZCk7XG5cdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKGZpbGVQYXRoLCAnSGVsbG8gV29ybGQnKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdGFuY2UuaXNSZXVzaW5nUmVjdXJzaXZlV2F0Y2hlciwgZmFsc2UpO1xuXHR9XG5cblx0dGVzdCgnd2F0Y2ggcmVxdWVzdHMgc3VwcG9ydCBzdXNwZW5kL3Jlc3VtZSAoZmlsZSwgZG9lcyBub3QgZXhpc3QgaW4gYmVnaW5uaW5nLCBwYXJjZWwgd2F0Y2hlciByZXVzZWQpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlY3Vyc2l2ZVdhdGNoZXIgPSBjcmVhdGVQYXJjZWxXYXRjaGVyKCk7XG5cdFx0YXdhaXQgcmVjdXJzaXZlV2F0Y2hlci53YXRjaChbeyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogdHJ1ZSB9XSk7XG5cblx0XHRhd2FpdCBjcmVhdGVXYXRjaGVyKHJlY3Vyc2l2ZVdhdGNoZXIpO1xuXG5cdFx0Y29uc3QgZmlsZVBhdGggPSBqb2luKHRlc3REaXIsICdub3QtZm91bmQtMi50eHQnKTtcblxuXHRcdGNvbnN0IG9uRGlkV2F0Y2hGYWlsID0gRXZlbnQudG9Qcm9taXNlKHdhdGNoZXIub25XYXRjaEZhaWwpO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSB7IHBhdGg6IGZpbGVQYXRoLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UgfTtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFtyZXF1ZXN0XSk7XG5cdFx0YXdhaXQgb25EaWRXYXRjaEZhaWw7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhdGNoZXIuaXNTdXNwZW5kZWQocmVxdWVzdCksIHRydWUpO1xuXG5cdFx0Y29uc3QgY2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBmaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShmaWxlUGF0aCwgJ0hlbGxvIFdvcmxkJyk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhdGNoZXIuaXNTdXNwZW5kZWQocmVxdWVzdCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZXZlbnQgdHlwZSBmaWx0ZXIgKGZpbGUgd2F0Y2gpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZpbGVQYXRoID0gam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0Jyk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IHsgcGF0aDogZmlsZVBhdGgsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiBmYWxzZSwgZmlsdGVyOiBGaWxlQ2hhbmdlRmlsdGVyLlVQREFURUQgfCBGaWxlQ2hhbmdlRmlsdGVyLkRFTEVURUQsIGNvcnJlbGF0aW9uSWQ6IDEgfTtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFtyZXF1ZXN0XSk7XG5cblx0XHQvLyBDaGFuZ2UgZmlsZVxuXHRcdGxldCBjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVELCAxKTtcblx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUoZmlsZVBhdGgsICdIZWxsbyBDaGFuZ2UnKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cblx0XHQvLyBEZWxldGUgZmlsZVxuXHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgZmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQsIDEpO1xuXHRcdGF3YWl0IGZzLnByb21pc2VzLnVubGluayhmaWxlUGF0aCk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXHR9KTtcblxuXHR0ZXN0KCdldmVudCB0eXBlIGZpbHRlciAoZm9sZGVyIHdhdGNoKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXF1ZXN0ID0geyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UsIGZpbHRlcjogRmlsZUNoYW5nZUZpbHRlci5VUERBVEVEIHwgRmlsZUNoYW5nZUZpbHRlci5ERUxFVEVELCBjb3JyZWxhdGlvbklkOiAxIH07XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbcmVxdWVzdF0pO1xuXG5cdFx0Ly8gQ2hhbmdlIGZpbGVcblx0XHRjb25zdCBmaWxlUGF0aCA9IGpvaW4odGVzdERpciwgJ2xvcmVtLnR4dCcpO1xuXHRcdGxldCBjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVELCAxKTtcblx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUoZmlsZVBhdGgsICdIZWxsbyBDaGFuZ2UnKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cblx0XHQvLyBEZWxldGUgZmlsZVxuXHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgZmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQsIDEpO1xuXHRcdGF3YWl0IGZzLnByb21pc2VzLnVubGluayhmaWxlUGF0aCk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXHR9KTtcblxuXHQoaXNMaW51eCA/IHRlc3Quc2tpcCA6IHRlc3QpKCdpbmNsdWRlcyBhcmUgY2FzZSBpbnNlbnNpdGl2ZSBvbiBXaW5kb3dzL01hYycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgaW5jbHVkZXM6IFsnKi5UWFQnXSwgcmVjdXJzaXZlOiBmYWxzZSB9XSk7XG5cblx0XHRyZXR1cm4gYmFzaWNDcnVkVGVzdChqb2luKHRlc3REaXIsICduZXdGaWxlLnR4dCcpKTtcblx0fSk7XG5cblx0KGlzTGludXggPyB0ZXN0LnNraXAgOiB0ZXN0KSgnZXhjbHVkZXMgYXJlIGNhc2UgaW5zZW5zaXRpdmUgb24gV2luZG93cy9NYWMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogWycqLlRYVCddLCByZWN1cnNpdmU6IGZhbHNlIH1dKTtcblxuXHRcdC8vIE5ldyBmaWxlIChzaG91bGQgYmUgZXhjbHVkZWQpXG5cdFx0Y29uc3QgbmV3RmlsZVBhdGggPSBqb2luKHRlc3REaXIsICduZXdGaWxlLnR4dCcpO1xuXHRcdGNvbnN0IGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUobmV3RmlsZVBhdGgsICdIZWxsbyBXb3JsZCcpO1xuXG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgUHJvbWlzZS5hbnkoW1xuXHRcdFx0dGltZW91dCg1MDApLnRoZW4oKCkgPT4gdHJ1ZSksXG5cdFx0XHRjaGFuZ2VGdXR1cmUudGhlbigoKSA9PiBmYWxzZSlcblx0XHRdKTtcblxuXHRcdGlmICghcmVzKSB7XG5cdFx0XHRhc3NlcnQuZmFpbCgnVW5leHBlY3RlZCBjaGFuZ2UgZXZlbnQnKTtcblx0XHR9XG5cdH0pO1xuXG5cdChpc0xpbnV4ID8gdGVzdC5za2lwIDogdGVzdCkoJ2V4Y2x1ZGVzIGFyZSBjYXNlIGluc2Vuc2l0aXZlIG9uIFdpbmRvd3MvTWFjJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFsnKi5UWFQnXSwgcmVjdXJzaXZlOiBmYWxzZSB9XSk7XG5cblx0XHQvLyBOZXcgZmlsZSAoc2hvdWxkIGJlIGV4Y2x1ZGVkKVxuXHRcdGNvbnN0IG5ld0ZpbGVQYXRoID0gam9pbih0ZXN0RGlyLCAnbmV3RmlsZS50eHQnKTtcblx0XHRjb25zdCBjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKG5ld0ZpbGVQYXRoLCAnSGVsbG8gV29ybGQnKTtcblxuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IFByb21pc2UuYW55KFtcblx0XHRcdHRpbWVvdXQoNTAwKS50aGVuKCgpID0+IHRydWUpLFxuXHRcdFx0Y2hhbmdlRnV0dXJlLnRoZW4oKCkgPT4gZmFsc2UpXG5cdFx0XSk7XG5cblx0XHRpZiAoIXJlcykge1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ1VuZXhwZWN0ZWQgY2hhbmdlIGV2ZW50Jyk7XG5cdFx0fVxuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxRQUFRO0FBQ3BCLE9BQU8sWUFBWTtBQUNuQixTQUFTLGNBQWM7QUFDdkIsU0FBUyxVQUFVLFNBQVMsWUFBWTtBQUN4QyxTQUFTLFVBQVUsa0JBQWtCO0FBQ3JDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0JBQWtCLHNCQUFzQjtBQUVqRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFNBQVMsYUFBYSxpQkFBaUI7QUFDaEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlCLGVBQWU7QUFDekMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMseUJBQXlCO0FBT2xDLE1BQU0sS0FBSywwQkFBMEIsV0FBWTtBQUVoRCxPQUFLLFFBQVEsR0FBSztBQUFBLEVBRWxCLE1BQU0sMEJBQTBCLGNB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LFNBQVMsT0FBTyxRQUFRO0FBQ2pDLFVBQU07QUFBQSxFQUNQLENBQUM7QUFFRCxHQUFDLFVBQVUsS0FBSyxPQUFPLE1BQU0sZ0RBQWdELGlCQUFrQjtBQUM5RixVQUFNLFFBQVEsTUFBTSxDQUFDLEVBQUUsTUFBTSxTQUFTLFVBQVUsQ0FBQyxHQUFHLFVBQVUsQ0FBQyxPQUFPLEdBQUcsV0FBVyxNQUFNLENBQUMsQ0FBQztBQUU1RixXQUFPLGNBQWMsS0FBSyxTQUFTLGFBQWEsQ0FBQztBQUFBLEVBQ2xELENBQUM7QUFFRCxHQUFDLFVBQVUsS0FBSyxPQUFPLE1BQU0sZ0RBQWdELGlCQUFrQjtBQUM5RixVQUFNLFFBQVEsTUFBTSxDQUFDLEVBQUUsTUFBTSxTQUFTLFVBQVUsQ0FBQyxPQUFPLEdBQUcsV0FBVyxNQUFNLENBQUMsQ0FBQztBQUc5RSxVQUFNLGNBQWMsS0FBSyxTQUFTLGFBQWE7QUFDL0MsVUFBTSxlQUFlLFdBQVcsU0FBUyxhQUFhLGVBQWUsS0FBSztBQUMxRSxVQUFNLFNBQVMsVUFBVSxhQUFhLGFBQWE7QUFFbkQsVUFBTSxNQUFNLE1BQU0sUUFBUSxJQUFJO0FBQUEsTUFDN0IsUUFBUSxHQUFHLEVBQUUsS0FBSyxNQUFNLElBQUk7QUFBQSxNQUM1QixhQUFhLEtBQUssTUFBTSxLQUFLO0FBQUEsSUFDOUIsQ0FBQztBQUVELFFBQUksQ0FBQyxLQUFLO0FBQ1QsYUFBTyxLQUFLLHlCQUF5QjtBQUFBLElBQ3RDO0FBQUEsRUFDRCxDQUFDO0FBRUQsR0FBQyxVQUFVLEtBQUssT0FBTyxNQUFNLGdEQUFnRCxpQkFBa0I7QUFDOUYsVUFBTSxRQUFRLE1BQU0sQ0FBQyxFQUFFLE1BQU0sU0FBUyxVQUFVLENBQUMsT0FBTyxHQUFHLFdBQVcsTUFBTSxDQUFDLENBQUM7QUFHOUUsVUFBTSxjQUFjLEtBQUssU0FBUyxhQUFhO0FBQy9DLFVBQU0sZUFBZSxXQUFXLFNBQVMsYUFBYSxlQUFlLEtBQUs7QUFDMUUsVUFBTSxTQUFTLFVBQVUsYUFBYSxhQUFhO0FBRW5ELFVBQU0sTUFBTSxNQUFNLFFBQVEsSUFBSTtBQUFBLE1BQzdCLFFBQVEsR0FBRyxFQUFFLEtBQUssTUFBTSxJQUFJO0FBQUEsTUFDNUIsYUFBYSxLQUFLLE1BQU0sS0FBSztBQUFBLElBQzlCLENBQUM7QUFFRCxRQUFJLENBQUMsS0FBSztBQUNULGFBQU8sS0FBSyx5QkFBeUI7QUFBQSxJQUN0QztBQUFBLEVBQ0QsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbIndhdGNoZXIiXQp9Cg==
