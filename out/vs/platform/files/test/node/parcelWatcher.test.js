import assert from "assert";
import { realpathSync, promises } from "fs";
import { tmpdir } from "os";
import { timeout } from "../../../../base/common/async.js";
import { dirname, join } from "../../../../base/common/path.js";
import { isLinux, isMacintosh, isWindows } from "../../../../base/common/platform.js";
import { Promises, RimRafMode } from "../../../../base/node/pfs.js";
import { getRandomTestPath } from "../../../../base/test/node/testUtils.js";
import { FileChangeFilter, FileChangeType } from "../../common/files.js";
import { ParcelWatcher } from "../../node/watcher/parcel/parcelWatcher.js";
import { getDriveLetter } from "../../../../base/common/extpath.js";
import { ltrim } from "../../../../base/common/strings.js";
import { FileAccess } from "../../../../base/common/network.js";
import { extUriBiasedIgnorePathCase } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { addUNCHostToAllowlist } from "../../../../base/node/unc.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
class TestParcelWatcher extends ParcelWatcher {
  constructor() {
    super(...arguments);
    this.suspendedWatchRequestPollingInterval = 100;
    this._onDidWatch = this._register(new Emitter());
    this.onDidWatch = this._onDidWatch.event;
    this.onWatchFail = this._onDidWatchFail.event;
  }
  async testRemoveDuplicateRequests(paths, excludes = []) {
    const requests = paths.map((path) => {
      return { path, excludes, recursive: true };
    });
    return (await this.removeDuplicateRequests(
      requests,
      false
      /* validate paths skipped for tests */
    )).map((request) => request.path);
  }
  getUpdateWatchersDelay() {
    return 0;
  }
  async doWatch(requests) {
    await super.doWatch(requests);
    await this.whenReady();
    this._onDidWatch.fire();
  }
  async whenReady() {
    for (const watcher of this.watchers) {
      await watcher.ready;
    }
  }
}
suite.skip("File Watcher (parcel)", function() {
  this.timeout(1e4);
  let testDir;
  let watcher;
  let loggingEnabled = false;
  function enableLogging(enable) {
    loggingEnabled = enable;
    watcher?.setVerboseLogging(enable);
  }
  enableLogging(loggingEnabled);
  setup(async () => {
    watcher = new TestParcelWatcher();
    watcher.setVerboseLogging(loggingEnabled);
    watcher.onDidLogMessage((e) => {
      if (loggingEnabled) {
        console.log(`[recursive watcher test message] ${e.message}`);
      }
    });
    watcher.onDidError((e) => {
      if (loggingEnabled) {
        console.log(`[recursive watcher test error] ${e.error}`);
      }
    });
    testDir = URI.file(getRandomTestPath(realpathSync(tmpdir()), "vsctests", "filewatcher")).fsPath;
    const sourceDir = FileAccess.asFileUri("vs/platform/files/test/node/fixtures/service").fsPath;
    await Promises.copy(sourceDir, testDir, { preserveSymlinks: false });
  });
  teardown(async () => {
    const watchers = Array.from(watcher.watchers).length;
    let stoppedInstances = 0;
    for (const instance of watcher.watchers) {
      Event.once(instance.onDidStop)(() => {
        if (instance.stopped) {
          stoppedInstances++;
        }
      });
    }
    await watcher.stop();
    assert.strictEqual(stoppedInstances, watchers, "All watchers must be stopped before the test ends");
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
  async function awaitEvent(watcher2, path, type, failOnEventReason, correlationId, expectedCount) {
    if (loggingEnabled) {
      console.log(`Awaiting change type '${toMsg(type)}' on file '${path}'`);
    }
    const res = await new Promise((resolve, reject) => {
      let counter = 0;
      const disposable = watcher2.onDidChangeFile((events) => {
        for (const event of events) {
          if (extUriBiasedIgnorePathCase.isEqual(event.resource, URI.file(path)) && event.type === type && (correlationId === null || event.cId === correlationId)) {
            counter++;
            if (typeof expectedCount === "number" && counter < expectedCount) {
              continue;
            }
            disposable.dispose();
            if (failOnEventReason) {
              reject(new Error(`Unexpected file event: ${failOnEventReason}`));
            } else {
              setImmediate(() => resolve(events));
            }
            break;
          }
        }
      });
    });
    await timeout(1);
    return res;
  }
  function awaitMessage(watcher2, type) {
    if (loggingEnabled) {
      console.log(`Awaiting message of type ${type}`);
    }
    return new Promise((resolve) => {
      const disposable = watcher2.onDidLogMessage((msg) => {
        if (msg.type === type) {
          disposable.dispose();
          resolve();
        }
      });
    });
  }
  test("basics", async function() {
    const request = { path: testDir, excludes: [], recursive: true };
    await watcher.watch([request]);
    const instance = Array.from(watcher.watchers)[0];
    assert.strictEqual(request, instance.request);
    assert.strictEqual(instance.failed, false);
    assert.strictEqual(instance.stopped, false);
    const disposables = new DisposableStore();
    const subscriptions1 = /* @__PURE__ */ new Map();
    const subscriptions2 = /* @__PURE__ */ new Map();
    const newFilePath = join(testDir, "deep", "newFile.txt");
    disposables.add(instance.subscribe(newFilePath, (change) => subscriptions1.set(change.resource.fsPath, change.type)));
    disposables.add(instance.subscribe(newFilePath, (change) => subscriptions2.set(change.resource.fsPath, change.type)));
    assert.strictEqual(instance.include(newFilePath), true);
    assert.strictEqual(instance.exclude(newFilePath), false);
    let changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.ADDED);
    await Promises.writeFile(newFilePath, "Hello World");
    await changeFuture;
    assert.strictEqual(subscriptions1.get(newFilePath), FileChangeType.ADDED);
    assert.strictEqual(subscriptions2.get(newFilePath), FileChangeType.ADDED);
    const newFolderPath = join(testDir, "deep", "New Folder");
    disposables.add(instance.subscribe(newFolderPath, (change) => subscriptions1.set(change.resource.fsPath, change.type)));
    const disposable = instance.subscribe(newFolderPath, (change) => subscriptions2.set(change.resource.fsPath, change.type));
    disposable.dispose();
    assert.strictEqual(instance.include(newFolderPath), true);
    assert.strictEqual(instance.exclude(newFolderPath), false);
    changeFuture = awaitEvent(watcher, newFolderPath, FileChangeType.ADDED);
    await promises.mkdir(newFolderPath);
    await changeFuture;
    assert.strictEqual(subscriptions1.get(newFolderPath), FileChangeType.ADDED);
    assert.strictEqual(
      subscriptions2.has(newFolderPath),
      false
      /* subscription was disposed before the event */
    );
    let renamedFilePath = join(testDir, "deep", "renamedFile.txt");
    disposables.add(instance.subscribe(renamedFilePath, (change) => subscriptions1.set(change.resource.fsPath, change.type)));
    changeFuture = Promise.all([
      awaitEvent(watcher, newFilePath, FileChangeType.DELETED),
      awaitEvent(watcher, renamedFilePath, FileChangeType.ADDED)
    ]);
    await Promises.rename(newFilePath, renamedFilePath);
    await changeFuture;
    assert.strictEqual(subscriptions1.get(newFilePath), FileChangeType.DELETED);
    assert.strictEqual(subscriptions1.get(renamedFilePath), FileChangeType.ADDED);
    let renamedFolderPath = join(testDir, "deep", "Renamed Folder");
    disposables.add(instance.subscribe(renamedFolderPath, (change) => subscriptions1.set(change.resource.fsPath, change.type)));
    changeFuture = Promise.all([
      awaitEvent(watcher, newFolderPath, FileChangeType.DELETED),
      awaitEvent(watcher, renamedFolderPath, FileChangeType.ADDED)
    ]);
    await Promises.rename(newFolderPath, renamedFolderPath);
    await changeFuture;
    assert.strictEqual(subscriptions1.get(newFolderPath), FileChangeType.DELETED);
    assert.strictEqual(subscriptions1.get(renamedFolderPath), FileChangeType.ADDED);
    const caseRenamedFilePath = join(testDir, "deep", "RenamedFile.txt");
    changeFuture = Promise.all([
      awaitEvent(watcher, renamedFilePath, FileChangeType.DELETED),
      awaitEvent(watcher, caseRenamedFilePath, FileChangeType.ADDED)
    ]);
    await Promises.rename(renamedFilePath, caseRenamedFilePath);
    await changeFuture;
    renamedFilePath = caseRenamedFilePath;
    const caseRenamedFolderPath = join(testDir, "deep", "REnamed Folder");
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
    const copiedFilepath = join(testDir, "deep", "copiedFile.txt");
    changeFuture = awaitEvent(watcher, copiedFilepath, FileChangeType.ADDED);
    await promises.copyFile(movedFilepath, copiedFilepath);
    await changeFuture;
    const copiedFolderpath = join(testDir, "deep", "Copied Folder");
    changeFuture = awaitEvent(watcher, copiedFolderpath, FileChangeType.ADDED);
    await Promises.copy(movedFolderpath, copiedFolderpath, { preserveSymlinks: false });
    await changeFuture;
    changeFuture = awaitEvent(watcher, copiedFilepath, FileChangeType.UPDATED);
    await Promises.writeFile(copiedFilepath, "Hello Change");
    await changeFuture;
    const anotherNewFilePath = join(testDir, "deep", "anotherNewFile.txt");
    changeFuture = awaitEvent(watcher, anotherNewFilePath, FileChangeType.ADDED);
    await Promises.writeFile(anotherNewFilePath, "Hello Another World");
    await changeFuture;
    changeFuture = awaitEvent(watcher, anotherNewFilePath, FileChangeType.UPDATED, "unexpected-event-from-read-file");
    await promises.readFile(anotherNewFilePath);
    await Promise.race([timeout(100), changeFuture]);
    changeFuture = awaitEvent(watcher, anotherNewFilePath, FileChangeType.UPDATED, "unexpected-event-from-stat");
    await promises.stat(anotherNewFilePath);
    await Promise.race([timeout(100), changeFuture]);
    changeFuture = awaitEvent(watcher, copiedFolderpath, FileChangeType.UPDATED, "unexpected-event-from-stat");
    await promises.stat(copiedFolderpath);
    await Promise.race([timeout(100), changeFuture]);
    changeFuture = awaitEvent(watcher, copiedFilepath, FileChangeType.DELETED);
    disposables.add(instance.subscribe(copiedFilepath, (change) => subscriptions1.set(change.resource.fsPath, change.type)));
    await promises.unlink(copiedFilepath);
    await changeFuture;
    assert.strictEqual(subscriptions1.get(copiedFilepath), FileChangeType.DELETED);
    changeFuture = awaitEvent(watcher, copiedFolderpath, FileChangeType.DELETED);
    disposables.add(instance.subscribe(copiedFolderpath, (change) => subscriptions1.set(change.resource.fsPath, change.type)));
    await promises.rmdir(copiedFolderpath);
    await changeFuture;
    assert.strictEqual(subscriptions1.get(copiedFolderpath), FileChangeType.DELETED);
    disposables.dispose();
  });
  (isMacintosh ? test.skip : test)("basics (atomic writes)", async function() {
    await watcher.watch([{ path: testDir, excludes: [], recursive: true }]);
    const newFilePath = join(testDir, "deep", "conway.js");
    const changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.UPDATED);
    await promises.unlink(newFilePath);
    Promises.writeFile(newFilePath, "Hello Atomic World");
    await changeFuture;
  });
  (!isLinux ? test.skip : test)("basics (polling)", async function() {
    await watcher.watch([{ path: testDir, excludes: [], pollingInterval: 100, recursive: true }]);
    return basicCrudTest(join(testDir, "deep", "newFile.txt"));
  });
  async function basicCrudTest(filePath, correlationId, expectedCount) {
    let changeFuture = awaitEvent(watcher, filePath, FileChangeType.ADDED, void 0, correlationId, expectedCount);
    await Promises.writeFile(filePath, "Hello World");
    await changeFuture;
    changeFuture = awaitEvent(watcher, filePath, FileChangeType.UPDATED, void 0, correlationId, expectedCount);
    await Promises.writeFile(filePath, "Hello Change");
    await changeFuture;
    changeFuture = awaitEvent(watcher, filePath, FileChangeType.DELETED, void 0, correlationId, expectedCount);
    await promises.unlink(filePath);
    await changeFuture;
  }
  test("multiple events", async function() {
    await watcher.watch([{ path: testDir, excludes: [], recursive: true }]);
    await promises.mkdir(join(testDir, "deep-multiple"));
    const newFilePath1 = join(testDir, "newFile-1.txt");
    const newFilePath2 = join(testDir, "newFile-2.txt");
    const newFilePath3 = join(testDir, "newFile-3.txt");
    const newFilePath4 = join(testDir, "deep-multiple", "newFile-1.txt");
    const newFilePath5 = join(testDir, "deep-multiple", "newFile-2.txt");
    const newFilePath6 = join(testDir, "deep-multiple", "newFile-3.txt");
    const addedFuture1 = awaitEvent(watcher, newFilePath1, FileChangeType.ADDED);
    const addedFuture2 = awaitEvent(watcher, newFilePath2, FileChangeType.ADDED);
    const addedFuture3 = awaitEvent(watcher, newFilePath3, FileChangeType.ADDED);
    const addedFuture4 = awaitEvent(watcher, newFilePath4, FileChangeType.ADDED);
    const addedFuture5 = awaitEvent(watcher, newFilePath5, FileChangeType.ADDED);
    const addedFuture6 = awaitEvent(watcher, newFilePath6, FileChangeType.ADDED);
    await Promise.all([
      await Promises.writeFile(newFilePath1, "Hello World 1"),
      await Promises.writeFile(newFilePath2, "Hello World 2"),
      await Promises.writeFile(newFilePath3, "Hello World 3"),
      await Promises.writeFile(newFilePath4, "Hello World 4"),
      await Promises.writeFile(newFilePath5, "Hello World 5"),
      await Promises.writeFile(newFilePath6, "Hello World 6")
    ]);
    await Promise.all([addedFuture1, addedFuture2, addedFuture3, addedFuture4, addedFuture5, addedFuture6]);
    const changeFuture1 = awaitEvent(watcher, newFilePath1, FileChangeType.UPDATED);
    const changeFuture2 = awaitEvent(watcher, newFilePath2, FileChangeType.UPDATED);
    const changeFuture3 = awaitEvent(watcher, newFilePath3, FileChangeType.UPDATED);
    const changeFuture4 = awaitEvent(watcher, newFilePath4, FileChangeType.UPDATED);
    const changeFuture5 = awaitEvent(watcher, newFilePath5, FileChangeType.UPDATED);
    const changeFuture6 = awaitEvent(watcher, newFilePath6, FileChangeType.UPDATED);
    await Promise.all([
      await Promises.writeFile(newFilePath1, "Hello Update 1"),
      await Promises.writeFile(newFilePath2, "Hello Update 2"),
      await Promises.writeFile(newFilePath3, "Hello Update 3"),
      await Promises.writeFile(newFilePath4, "Hello Update 4"),
      await Promises.writeFile(newFilePath5, "Hello Update 5"),
      await Promises.writeFile(newFilePath6, "Hello Update 6")
    ]);
    await Promise.all([changeFuture1, changeFuture2, changeFuture3, changeFuture4, changeFuture5, changeFuture6]);
    const copyFuture1 = awaitEvent(watcher, join(testDir, "deep-multiple-copy", "newFile-1.txt"), FileChangeType.ADDED);
    const copyFuture2 = awaitEvent(watcher, join(testDir, "deep-multiple-copy", "newFile-2.txt"), FileChangeType.ADDED);
    const copyFuture3 = awaitEvent(watcher, join(testDir, "deep-multiple-copy", "newFile-3.txt"), FileChangeType.ADDED);
    const copyFuture4 = awaitEvent(watcher, join(testDir, "deep-multiple-copy"), FileChangeType.ADDED);
    await Promises.copy(join(testDir, "deep-multiple"), join(testDir, "deep-multiple-copy"), { preserveSymlinks: false });
    await Promise.all([copyFuture1, copyFuture2, copyFuture3, copyFuture4]);
    const deleteFuture1 = awaitEvent(watcher, newFilePath1, FileChangeType.DELETED);
    const deleteFuture2 = awaitEvent(watcher, newFilePath2, FileChangeType.DELETED);
    const deleteFuture3 = awaitEvent(watcher, newFilePath3, FileChangeType.DELETED);
    const deleteFuture4 = awaitEvent(watcher, newFilePath4, FileChangeType.DELETED);
    const deleteFuture5 = awaitEvent(watcher, newFilePath5, FileChangeType.DELETED);
    const deleteFuture6 = awaitEvent(watcher, newFilePath6, FileChangeType.DELETED);
    await Promise.all([
      await promises.unlink(newFilePath1),
      await promises.unlink(newFilePath2),
      await promises.unlink(newFilePath3),
      await promises.unlink(newFilePath4),
      await promises.unlink(newFilePath5),
      await promises.unlink(newFilePath6)
    ]);
    await Promise.all([deleteFuture1, deleteFuture2, deleteFuture3, deleteFuture4, deleteFuture5, deleteFuture6]);
    const deleteFolderFuture1 = awaitEvent(watcher, join(testDir, "deep-multiple"), FileChangeType.DELETED);
    const deleteFolderFuture2 = awaitEvent(watcher, join(testDir, "deep-multiple-copy"), FileChangeType.DELETED);
    await Promise.all([Promises.rm(join(testDir, "deep-multiple"), RimRafMode.UNLINK), Promises.rm(join(testDir, "deep-multiple-copy"), RimRafMode.UNLINK)]);
    await Promise.all([deleteFolderFuture1, deleteFolderFuture2]);
  });
  test("subsequent watch updates watchers (path)", async function() {
    await watcher.watch([{ path: testDir, excludes: [join(realpathSync(testDir), "unrelated")], recursive: true }]);
    let newTextFilePath = join(testDir, "deep", "newFile.txt");
    let changeFuture = awaitEvent(watcher, newTextFilePath, FileChangeType.ADDED);
    await Promises.writeFile(newTextFilePath, "Hello World");
    await changeFuture;
    await watcher.watch([{ path: join(testDir, "deep"), excludes: [join(realpathSync(testDir), "unrelated")], recursive: true }]);
    newTextFilePath = join(testDir, "deep", "newFile2.txt");
    changeFuture = awaitEvent(watcher, newTextFilePath, FileChangeType.ADDED);
    await Promises.writeFile(newTextFilePath, "Hello World");
    await changeFuture;
    await watcher.watch([{ path: join(testDir, "deep"), excludes: [realpathSync(testDir)], recursive: true }]);
    await watcher.watch([{ path: join(testDir, "deep"), excludes: [], recursive: true }]);
    newTextFilePath = join(testDir, "deep", "newFile3.txt");
    changeFuture = awaitEvent(watcher, newTextFilePath, FileChangeType.ADDED);
    await Promises.writeFile(newTextFilePath, "Hello World");
    await changeFuture;
  });
  test("invalid path does not crash watcher", async function() {
    await watcher.watch([
      { path: testDir, excludes: [], recursive: true },
      { path: join(testDir, "invalid-folder"), excludes: [], recursive: true },
      { path: FileAccess.asFileUri("").fsPath, excludes: [], recursive: true }
    ]);
    return basicCrudTest(join(testDir, "deep", "newFile.txt"));
  });
  test("subsequent watch updates watchers (excludes)", async function() {
    await watcher.watch([{ path: testDir, excludes: [realpathSync(testDir)], recursive: true }]);
    await watcher.watch([{ path: testDir, excludes: [], recursive: true }]);
    return basicCrudTest(join(testDir, "deep", "newFile.txt"));
  });
  test("subsequent watch updates watchers (includes)", async function() {
    await watcher.watch([{ path: testDir, excludes: [], includes: ["nothing"], recursive: true }]);
    await watcher.watch([{ path: testDir, excludes: [], recursive: true }]);
    return basicCrudTest(join(testDir, "deep", "newFile.txt"));
  });
  test("includes are supported", async function() {
    await watcher.watch([{ path: testDir, excludes: [], includes: ["**/deep/**"], recursive: true }]);
    return basicCrudTest(join(testDir, "deep", "newFile.txt"));
  });
  test("includes are supported (relative pattern explicit)", async function() {
    await watcher.watch([{ path: testDir, excludes: [], includes: [{ base: testDir, pattern: "deep/newFile.txt" }], recursive: true }]);
    return basicCrudTest(join(testDir, "deep", "newFile.txt"));
  });
  test("includes are supported (relative pattern implicit)", async function() {
    await watcher.watch([{ path: testDir, excludes: [], includes: ["deep/newFile.txt"], recursive: true }]);
    return basicCrudTest(join(testDir, "deep", "newFile.txt"));
  });
  test("excludes are supported (path)", async function() {
    return testExcludes([join(realpathSync(testDir), "deep")]);
  });
  test("excludes are supported (glob)", function() {
    return testExcludes(["deep/**"]);
  });
  async function testExcludes(excludes) {
    await watcher.watch([{ path: testDir, excludes, recursive: true }]);
    const newTextFilePath = join(testDir, "deep", "newFile.txt");
    const changeFuture = awaitEvent(watcher, newTextFilePath, FileChangeType.ADDED);
    await Promises.writeFile(newTextFilePath, "Hello World");
    const res = await Promise.any([
      timeout(500).then(() => true),
      changeFuture.then(() => false)
    ]);
    if (!res) {
      assert.fail("Unexpected change event");
    }
  }
  (isWindows ? test.skip : test)("symlink support (root)", async function() {
    const link = join(testDir, "deep-linked");
    const linkTarget = join(testDir, "deep");
    await promises.symlink(linkTarget, link);
    await watcher.watch([{ path: link, excludes: [], recursive: true }]);
    return basicCrudTest(join(link, "newFile.txt"));
  });
  (isWindows ? test.skip : test)("symlink support (via extra watch)", async function() {
    const link = join(testDir, "deep-linked");
    const linkTarget = join(testDir, "deep");
    await promises.symlink(linkTarget, link);
    await watcher.watch([{ path: testDir, excludes: [], recursive: true }, { path: link, excludes: [], recursive: true }]);
    return basicCrudTest(join(link, "newFile.txt"));
  });
  (!isWindows ? test.skip : test)("unc support", async function() {
    addUNCHostToAllowlist("localhost");
    const uncPath = `\\\\localhost\\${getDriveLetter(testDir)?.toLowerCase()}$\\${ltrim(testDir.substr(testDir.indexOf(":") + 1), "\\")}`;
    await watcher.watch([{ path: uncPath, excludes: [], recursive: true }]);
    return basicCrudTest(join(uncPath, "deep", "newFile.txt"));
  });
  (isLinux ? test.skip : test)("wrong casing", async function() {
    const deepWrongCasedPath = join(testDir, "DEEP");
    await watcher.watch([{ path: deepWrongCasedPath, excludes: [], recursive: true }]);
    return basicCrudTest(join(deepWrongCasedPath, "newFile.txt"));
  });
  test("invalid folder does not explode", async function() {
    const invalidPath = join(testDir, "invalid");
    await watcher.watch([{ path: invalidPath, excludes: [], recursive: true }]);
  });
  (isWindows ? test.skip : test)("deleting watched path without correlation restarts watching", async function() {
    const watchedPath = join(testDir, "deep");
    await watcher.watch([{ path: watchedPath, excludes: [], recursive: true }]);
    const warnFuture = awaitMessage(watcher, "warn");
    await Promises.rm(watchedPath, RimRafMode.UNLINK);
    await warnFuture;
    await timeout(1500);
    await promises.mkdir(watchedPath);
    await timeout(1500);
    await watcher.whenReady();
    const newFilePath = join(watchedPath, "newFile.txt");
    const changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.ADDED);
    await Promises.writeFile(newFilePath, "Hello World");
    await changeFuture;
  });
  test("correlationId is supported", async function() {
    const correlationId = Math.random();
    await watcher.watch([{ correlationId, path: testDir, excludes: [], recursive: true }]);
    return basicCrudTest(join(testDir, "newFile.txt"), correlationId);
  });
  test("should not exclude roots that do not overlap", async () => {
    if (isWindows) {
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["C:\\a"]), ["C:\\a"]);
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["C:\\a", "C:\\b"]), ["C:\\a", "C:\\b"]);
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["C:\\a", "C:\\b", "C:\\c\\d\\e"]), ["C:\\a", "C:\\b", "C:\\c\\d\\e"]);
    } else {
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["/a"]), ["/a"]);
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["/a", "/b"]), ["/a", "/b"]);
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["/a", "/b", "/c/d/e"]), ["/a", "/b", "/c/d/e"]);
    }
  });
  test("should remove sub-folders of other paths", async () => {
    if (isWindows) {
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["C:\\a", "C:\\a\\b"]), ["C:\\a"]);
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["C:\\a", "C:\\b", "C:\\a\\b"]), ["C:\\a", "C:\\b"]);
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["C:\\b\\a", "C:\\a", "C:\\b", "C:\\a\\b"]), ["C:\\a", "C:\\b"]);
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["C:\\a", "C:\\a\\b", "C:\\a\\c\\d"]), ["C:\\a"]);
    } else {
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["/a", "/a/b"]), ["/a"]);
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["/a", "/b", "/a/b"]), ["/a", "/b"]);
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["/b/a", "/a", "/b", "/a/b"]), ["/a", "/b"]);
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["/a", "/a/b", "/a/c/d"]), ["/a"]);
    }
  });
  test("should ignore when everything excluded", async () => {
    assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["/foo/bar", "/bar"], ["**", "something"]), []);
  });
  test("watching same or overlapping paths supported when correlation is applied", async () => {
    await watcher.watch([
      { path: testDir, excludes: [], recursive: true, correlationId: 1 }
    ]);
    await basicCrudTest(join(testDir, "newFile.txt"), null, 1);
    await watcher.watch([
      { path: testDir, excludes: [], recursive: true, correlationId: 1 },
      { path: testDir, excludes: [], recursive: true, correlationId: 2 },
      { path: testDir, excludes: [], recursive: true, correlationId: void 0 }
    ]);
    await basicCrudTest(join(testDir, "newFile.txt"), null, 3);
    await basicCrudTest(join(testDir, "otherNewFile.txt"), null, 3);
    await watcher.watch([
      { path: testDir, excludes: [], recursive: true, correlationId: 1 },
      { path: testDir, excludes: [], recursive: true, correlationId: 2 },
      { path: testDir, excludes: [], recursive: true, correlationId: void 0 },
      { path: testDir, excludes: [join(realpathSync(testDir), "deep")], recursive: true, correlationId: 3 },
      { path: testDir, excludes: [join(realpathSync(testDir), "other")], recursive: true, correlationId: 4 }
    ]);
    await basicCrudTest(join(testDir, "newFile.txt"), null, 5);
    await basicCrudTest(join(testDir, "otherNewFile.txt"), null, 5);
    await watcher.watch([
      { path: dirname(testDir), excludes: [], recursive: true, correlationId: 1 },
      { path: testDir, excludes: [], recursive: true, correlationId: 2 },
      { path: join(testDir, "deep"), excludes: [], recursive: true, correlationId: 3 }
    ]);
    await basicCrudTest(join(testDir, "deep", "newFile.txt"), null, 3);
    await basicCrudTest(join(testDir, "deep", "otherNewFile.txt"), null, 3);
    await watcher.watch([
      { path: dirname(testDir), excludes: [], recursive: true, correlationId: 1 },
      { path: testDir, excludes: [join(realpathSync(testDir), "some")], recursive: true, correlationId: 2 },
      { path: join(testDir, "deep"), excludes: [join(realpathSync(testDir), "other")], recursive: true, correlationId: 3 }
    ]);
    await basicCrudTest(join(testDir, "deep", "newFile.txt"), null, 3);
    await basicCrudTest(join(testDir, "deep", "otherNewFile.txt"), null, 3);
  });
  test("watching missing path emits watcher fail event", async function() {
    const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
    const folderPath = join(testDir, "missing");
    watcher.watch([{ path: folderPath, excludes: [], recursive: true }]);
    await onDidWatchFail;
  });
  test("deleting watched path emits watcher fail and delete event if correlated", async function() {
    const folderPath = join(testDir, "deep");
    await watcher.watch([{ path: folderPath, excludes: [], recursive: true, correlationId: 1 }]);
    let failed = false;
    const instance = Array.from(watcher.watchers)[0];
    assert.strictEqual(instance.include(folderPath), true);
    instance.onDidFail(() => failed = true);
    const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
    const changeFuture = awaitEvent(watcher, folderPath, FileChangeType.DELETED, void 0, 1);
    Promises.rm(folderPath, RimRafMode.UNLINK);
    await onDidWatchFail;
    await changeFuture;
    assert.strictEqual(failed, true);
    assert.strictEqual(instance.failed, true);
  });
  (!isMacintosh ? test.skip : test)("watch requests support suspend/resume (folder, does not exist in beginning, not reusing watcher)", async () => {
    await testWatchFolderDoesNotExist(false);
  });
  test("watch requests support suspend/resume (folder, does not exist in beginning, reusing watcher)", async () => {
    await testWatchFolderDoesNotExist(true);
  });
  async function testWatchFolderDoesNotExist(reuseExistingWatcher) {
    let onDidWatchFail = Event.toPromise(watcher.onWatchFail);
    const folderPath = join(testDir, "not-found");
    const requests = [];
    if (reuseExistingWatcher) {
      requests.push({ path: testDir, excludes: [], recursive: true });
      await watcher.watch(requests);
    }
    const request = { path: folderPath, excludes: [], recursive: true };
    requests.push(request);
    await watcher.watch(requests);
    await onDidWatchFail;
    if (reuseExistingWatcher) {
      assert.strictEqual(watcher.isSuspended(request), true);
    } else {
      assert.strictEqual(watcher.isSuspended(request), "polling");
    }
    let changeFuture = awaitEvent(watcher, folderPath, FileChangeType.ADDED);
    let onDidWatch = Event.toPromise(watcher.onDidWatch);
    await promises.mkdir(folderPath);
    await changeFuture;
    await onDidWatch;
    assert.strictEqual(watcher.isSuspended(request), false);
    const filePath = join(folderPath, "newFile.txt");
    await basicCrudTest(filePath);
    if (!reuseExistingWatcher) {
      onDidWatchFail = Event.toPromise(watcher.onWatchFail);
      await Promises.rm(folderPath);
      await onDidWatchFail;
      changeFuture = awaitEvent(watcher, folderPath, FileChangeType.ADDED);
      onDidWatch = Event.toPromise(watcher.onDidWatch);
      await promises.mkdir(folderPath);
      await changeFuture;
      await onDidWatch;
      await basicCrudTest(filePath);
    }
  }
  (!isMacintosh ? test.skip : test)("watch requests support suspend/resume (folder, exist in beginning, not reusing watcher)", async () => {
    await testWatchFolderExists(false);
  });
  test("watch requests support suspend/resume (folder, exist in beginning, reusing watcher)", async () => {
    await testWatchFolderExists(true);
  });
  async function testWatchFolderExists(reuseExistingWatcher) {
    const folderPath = join(testDir, "deep");
    const requests = [{ path: folderPath, excludes: [], recursive: true }];
    if (reuseExistingWatcher) {
      requests.push({ path: testDir, excludes: [], recursive: true });
    }
    await watcher.watch(requests);
    const filePath = join(folderPath, "newFile.txt");
    await basicCrudTest(filePath);
    if (!reuseExistingWatcher) {
      const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
      await Promises.rm(folderPath);
      await onDidWatchFail;
      const changeFuture = awaitEvent(watcher, folderPath, FileChangeType.ADDED);
      const onDidWatch = Event.toPromise(watcher.onDidWatch);
      await promises.mkdir(folderPath);
      await changeFuture;
      await onDidWatch;
      await basicCrudTest(filePath);
    }
  }
  test("watch request reuses another recursive watcher even when requests are coming in at the same time", async function() {
    const folderPath1 = join(testDir, "deep", "not-existing1");
    const folderPath2 = join(testDir, "deep", "not-existing2");
    const folderPath3 = join(testDir, "not-existing3");
    const requests = [
      { path: folderPath1, excludes: [], recursive: true, correlationId: 1 },
      { path: folderPath2, excludes: [], recursive: true, correlationId: 2 },
      { path: folderPath3, excludes: [], recursive: true, correlationId: 3 },
      { path: join(testDir, "deep"), excludes: [], recursive: true }
    ];
    await watcher.watch(requests);
    assert.strictEqual(watcher.isSuspended(requests[0]), true);
    assert.strictEqual(watcher.isSuspended(requests[1]), true);
    assert.strictEqual(watcher.isSuspended(requests[2]), "polling");
    assert.strictEqual(watcher.isSuspended(requests[3]), false);
  });
  test("event type filter", async function() {
    const request = { path: testDir, excludes: [], recursive: true, filter: FileChangeFilter.ADDED | FileChangeFilter.DELETED, correlationId: 1 };
    await watcher.watch([request]);
    const filePath = join(testDir, "lorem-newfile.txt");
    let changeFuture = awaitEvent(watcher, filePath, FileChangeType.ADDED, void 0, 1);
    await Promises.writeFile(filePath, "Hello Change");
    await changeFuture;
    changeFuture = awaitEvent(watcher, filePath, FileChangeType.DELETED, void 0, 1);
    await promises.unlink(filePath);
    await changeFuture;
  });
  (isLinux ? test.skip : test)("includes are case insensitive on Windows/Mac", async function() {
    await watcher.watch([{ path: testDir, excludes: [], includes: ["**/*.TXT"], recursive: true }]);
    const newFilePath = join(testDir, "deep", "newFile.txt");
    let changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.ADDED);
    await Promises.writeFile(newFilePath, "Hello World");
    await changeFuture;
    changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.UPDATED);
    await Promises.writeFile(newFilePath, "Hello Change");
    await changeFuture;
    changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.DELETED);
    await promises.unlink(newFilePath);
    await changeFuture;
  });
  (isLinux ? test.skip : test)("includes are case insensitive on Windows/Mac", async function() {
    await watcher.watch([{ path: testDir, excludes: [], includes: ["**/*.TXT"], recursive: true }]);
    const newFilePath = join(testDir, "deep", "newFile.txt");
    let changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.ADDED);
    await Promises.writeFile(newFilePath, "Hello World");
    await changeFuture;
    changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.UPDATED);
    await Promises.writeFile(newFilePath, "Hello Change");
    await changeFuture;
    changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.DELETED);
    await promises.unlink(newFilePath);
    await changeFuture;
  });
  (isLinux ? test.skip : test)("excludes are case insensitive on Windows/Mac", async function() {
    await watcher.watch([{ path: testDir, excludes: ["**/DEEP/**"], recursive: true }]);
    const newTextFilePath = join(testDir, "deep", "newFile.txt");
    const changeFuture = awaitEvent(watcher, newTextFilePath, FileChangeType.ADDED);
    await Promises.writeFile(newTextFilePath, "Hello World");
    const res = await Promise.any([
      timeout(500).then(() => true),
      changeFuture.then(() => false)
    ]);
    if (!res) {
      assert.fail("Unexpected change event");
    }
  });
  (isLinux ? test.skip : test)("excludes are case insensitive on Windows/Mac", async function() {
    await watcher.watch([{ path: testDir, excludes: ["**/DEEP/**"], recursive: true }]);
    const newTextFilePath = join(testDir, "deep", "newFile.txt");
    const changeFuture = awaitEvent(watcher, newTextFilePath, FileChangeType.ADDED);
    await Promises.writeFile(newTextFilePath, "Hello World");
    const res = await Promise.any([
      timeout(500).then(() => true),
      changeFuture.then(() => false)
    ]);
    if (!res) {
      assert.fail("Unexpected change event");
    }
  });
});
export {
  TestParcelWatcher
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZmlsZXNcXHRlc3RcXG5vZGVcXHBhcmNlbFdhdGNoZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHJlYWxwYXRoU3luYywgcHJvbWlzZXMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZGlybmFtZSwgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgaXNMaW51eCwgaXNNYWNpbnRvc2gsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFByb21pc2VzLCBSaW1SYWZNb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9ub2RlL3Bmcy5qcyc7XG5pbXBvcnQgeyBnZXRSYW5kb21UZXN0UGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9ub2RlL3Rlc3RVdGlscy5qcyc7XG5pbXBvcnQgeyBGaWxlQ2hhbmdlRmlsdGVyLCBGaWxlQ2hhbmdlVHlwZSwgSUZpbGVDaGFuZ2UgfSBmcm9tICcuLi8uLi9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgUGFyY2VsV2F0Y2hlciB9IGZyb20gJy4uLy4uL25vZGUvd2F0Y2hlci9wYXJjZWwvcGFyY2VsV2F0Y2hlci5qcyc7XG5pbXBvcnQgeyBJUmVjdXJzaXZlV2F0Y2hSZXF1ZXN0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3dhdGNoZXIuanMnO1xuaW1wb3J0IHsgZ2V0RHJpdmVMZXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9leHRwYXRoLmpzJztcbmltcG9ydCB7IGx0cmltIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgYWRkVU5DSG9zdFRvQWxsb3dsaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9ub2RlL3VuYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBUZXN0UGFyY2VsV2F0Y2hlciBleHRlbmRzIFBhcmNlbFdhdGNoZXIge1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZWFkb25seSBzdXNwZW5kZWRXYXRjaFJlcXVlc3RQb2xsaW5nSW50ZXJ2YWwgPSAxMDA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRXYXRjaCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFdhdGNoID0gdGhpcy5fb25EaWRXYXRjaC5ldmVudDtcblxuXHRyZWFkb25seSBvbldhdGNoRmFpbCA9IHRoaXMuX29uRGlkV2F0Y2hGYWlsLmV2ZW50O1xuXG5cdGFzeW5jIHRlc3RSZW1vdmVEdXBsaWNhdGVSZXF1ZXN0cyhwYXRoczogc3RyaW5nW10sIGV4Y2x1ZGVzOiBzdHJpbmdbXSA9IFtdKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXG5cdFx0Ly8gV29yayB3aXRoIHN0cmluZ3MgYXMgcGF0aHMgdG8gc2ltcGxpZnkgdGVzdGluZ1xuXHRcdGNvbnN0IHJlcXVlc3RzOiBJUmVjdXJzaXZlV2F0Y2hSZXF1ZXN0W10gPSBwYXRocy5tYXAocGF0aCA9PiB7XG5cdFx0XHRyZXR1cm4geyBwYXRoLCBleGNsdWRlcywgcmVjdXJzaXZlOiB0cnVlIH07XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gKGF3YWl0IHRoaXMucmVtb3ZlRHVwbGljYXRlUmVxdWVzdHMocmVxdWVzdHMsIGZhbHNlIC8qIHZhbGlkYXRlIHBhdGhzIHNraXBwZWQgZm9yIHRlc3RzICovKSkubWFwKHJlcXVlc3QgPT4gcmVxdWVzdC5wYXRoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRVcGRhdGVXYXRjaGVyc0RlbGF5KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgZG9XYXRjaChyZXF1ZXN0czogSVJlY3Vyc2l2ZVdhdGNoUmVxdWVzdFtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgc3VwZXIuZG9XYXRjaChyZXF1ZXN0cyk7XG5cdFx0YXdhaXQgdGhpcy53aGVuUmVhZHkoKTtcblxuXHRcdHRoaXMuX29uRGlkV2F0Y2guZmlyZSgpO1xuXHR9XG5cblx0YXN5bmMgd2hlblJlYWR5KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGZvciAoY29uc3Qgd2F0Y2hlciBvZiB0aGlzLndhdGNoZXJzKSB7XG5cdFx0XHRhd2FpdCB3YXRjaGVyLnJlYWR5O1xuXHRcdH1cblx0fVxufVxuXG4vLyB0aGlzIHN1aXRlIGhhcyBzaG93biBmbGFreSBydW5zIGluIEF6dXJlIHBpcGVsaW5lcyB3aGVyZVxuLy8gdGFza3Mgd291bGQganVzdCBoYW5nIGFuZCB0aW1lb3V0IGFmdGVyIGEgd2hpbGUgKG5vdCBpblxuLy8gbW9jaGEgYnV0IGdlbmVyYWxseSkuIGFzIHN1Y2ggdGhleSB3aWxsIHJ1biBvbmx5IG9uIGRlbWFuZFxuLy8gd2hlbmV2ZXIgd2UgdXBkYXRlIHRoZSB3YXRjaGVyIGxpYnJhcnkuXG5cbnN1aXRlLnNraXAoJ0ZpbGUgV2F0Y2hlciAocGFyY2VsKScsIGZ1bmN0aW9uICgpIHtcblxuXHR0aGlzLnRpbWVvdXQoMTAwMDApO1xuXG5cdGxldCB0ZXN0RGlyOiBzdHJpbmc7XG5cdGxldCB3YXRjaGVyOiBUZXN0UGFyY2VsV2F0Y2hlcjtcblxuXHRsZXQgbG9nZ2luZ0VuYWJsZWQgPSBmYWxzZTtcblxuXHRmdW5jdGlvbiBlbmFibGVMb2dnaW5nKGVuYWJsZTogYm9vbGVhbikge1xuXHRcdGxvZ2dpbmdFbmFibGVkID0gZW5hYmxlO1xuXHRcdHdhdGNoZXI/LnNldFZlcmJvc2VMb2dnaW5nKGVuYWJsZSk7XG5cdH1cblxuXHRlbmFibGVMb2dnaW5nKGxvZ2dpbmdFbmFibGVkKTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0d2F0Y2hlciA9IG5ldyBUZXN0UGFyY2VsV2F0Y2hlcigpO1xuXHRcdHdhdGNoZXIuc2V0VmVyYm9zZUxvZ2dpbmcobG9nZ2luZ0VuYWJsZWQpO1xuXG5cdFx0d2F0Y2hlci5vbkRpZExvZ01lc3NhZ2UoZSA9PiB7XG5cdFx0XHRpZiAobG9nZ2luZ0VuYWJsZWQpIHtcblx0XHRcdFx0Y29uc29sZS5sb2coYFtyZWN1cnNpdmUgd2F0Y2hlciB0ZXN0IG1lc3NhZ2VdICR7ZS5tZXNzYWdlfWApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0d2F0Y2hlci5vbkRpZEVycm9yKGUgPT4ge1xuXHRcdFx0aWYgKGxvZ2dpbmdFbmFibGVkKSB7XG5cdFx0XHRcdGNvbnNvbGUubG9nKGBbcmVjdXJzaXZlIHdhdGNoZXIgdGVzdCBlcnJvcl0gJHtlLmVycm9yfWApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gUnVsZSBvdXQgc3RyYW5nZSB0ZXN0aW5nIGNvbmRpdGlvbnMgYnkgdXNpbmcgdGhlIHJlYWxwYXRoXG5cdFx0Ly8gaGVyZS4gZm9yIGV4YW1wbGUsIG9uIG1hY09TIHRoZSB0bXAgZGlyIGlzIHBvdGVudGlhbGx5IGFcblx0XHQvLyBzeW1saW5rIGluIHNvbWUgb2YgdGhlIHJvb3QgZm9sZGVycywgd2hpY2ggaXMgYSByYXRoZXJcblx0XHQvLyB1bnJlYWxpc2ljIGNhc2UgZm9yIHRoZSBmaWxlIHdhdGNoZXIuXG5cdFx0dGVzdERpciA9IFVSSS5maWxlKGdldFJhbmRvbVRlc3RQYXRoKHJlYWxwYXRoU3luYyh0bXBkaXIoKSksICd2c2N0ZXN0cycsICdmaWxld2F0Y2hlcicpKS5mc1BhdGg7XG5cblx0XHRjb25zdCBzb3VyY2VEaXIgPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvcGxhdGZvcm0vZmlsZXMvdGVzdC9ub2RlL2ZpeHR1cmVzL3NlcnZpY2UnKS5mc1BhdGg7XG5cblx0XHRhd2FpdCBQcm9taXNlcy5jb3B5KHNvdXJjZURpciwgdGVzdERpciwgeyBwcmVzZXJ2ZVN5bWxpbmtzOiBmYWxzZSB9KTtcblx0fSk7XG5cblx0dGVhcmRvd24oYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdhdGNoZXJzID0gQXJyYXkuZnJvbSh3YXRjaGVyLndhdGNoZXJzKS5sZW5ndGg7XG5cdFx0bGV0IHN0b3BwZWRJbnN0YW5jZXMgPSAwO1xuXHRcdGZvciAoY29uc3QgaW5zdGFuY2Ugb2Ygd2F0Y2hlci53YXRjaGVycykge1xuXHRcdFx0RXZlbnQub25jZShpbnN0YW5jZS5vbkRpZFN0b3ApKCgpID0+IHtcblx0XHRcdFx0aWYgKGluc3RhbmNlLnN0b3BwZWQpIHtcblx0XHRcdFx0XHRzdG9wcGVkSW5zdGFuY2VzKys7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGF3YWl0IHdhdGNoZXIuc3RvcCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9wcGVkSW5zdGFuY2VzLCB3YXRjaGVycywgJ0FsbCB3YXRjaGVycyBtdXN0IGJlIHN0b3BwZWQgYmVmb3JlIHRoZSB0ZXN0IGVuZHMnKTtcblx0XHR3YXRjaGVyLmRpc3Bvc2UoKTtcblxuXHRcdC8vIFBvc3NpYmxlIHRoYXQgdGhlIGZpbGUgd2F0Y2hlciBpcyBzdGlsbCBob2xkaW5nXG5cdFx0Ly8gb250byB0aGUgZm9sZGVycyBvbiBXaW5kb3dzIHNwZWNpZmljYWxseSBhbmQgdGhlXG5cdFx0Ly8gdW5saW5rIHdvdWxkIGZhaWwuIEluIHRoYXQgY2FzZSwgZG8gbm90IGZhaWwgdGhlXG5cdFx0Ly8gdGVzdCBzdWl0ZS5cblx0XHRyZXR1cm4gUHJvbWlzZXMucm0odGVzdERpcikuY2F0Y2goZXJyb3IgPT4gY29uc29sZS5lcnJvcihlcnJvcikpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiB0b01zZyh0eXBlOiBGaWxlQ2hhbmdlVHlwZSk6IHN0cmluZyB7XG5cdFx0c3dpdGNoICh0eXBlKSB7XG5cdFx0XHRjYXNlIEZpbGVDaGFuZ2VUeXBlLkFEREVEOiByZXR1cm4gJ2FkZGVkJztcblx0XHRcdGNhc2UgRmlsZUNoYW5nZVR5cGUuREVMRVRFRDogcmV0dXJuICdkZWxldGVkJztcblx0XHRcdGRlZmF1bHQ6IHJldHVybiAnY2hhbmdlZCc7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gYXdhaXRFdmVudCh3YXRjaGVyOiBUZXN0UGFyY2VsV2F0Y2hlciwgcGF0aDogc3RyaW5nLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZSwgZmFpbE9uRXZlbnRSZWFzb24/OiBzdHJpbmcsIGNvcnJlbGF0aW9uSWQ/OiBudW1iZXIgfCBudWxsLCBleHBlY3RlZENvdW50PzogbnVtYmVyKTogUHJvbWlzZTxJRmlsZUNoYW5nZVtdPiB7XG5cdFx0aWYgKGxvZ2dpbmdFbmFibGVkKSB7XG5cdFx0XHRjb25zb2xlLmxvZyhgQXdhaXRpbmcgY2hhbmdlIHR5cGUgJyR7dG9Nc2codHlwZSl9JyBvbiBmaWxlICcke3BhdGh9J2ApO1xuXHRcdH1cblxuXHRcdC8vIEF3YWl0IHRoZSBldmVudFxuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IG5ldyBQcm9taXNlPElGaWxlQ2hhbmdlW10+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGxldCBjb3VudGVyID0gMDtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB3YXRjaGVyLm9uRGlkQ2hhbmdlRmlsZShldmVudHMgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGV2ZW50IG9mIGV2ZW50cykge1xuXHRcdFx0XHRcdGlmIChleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsKGV2ZW50LnJlc291cmNlLCBVUkkuZmlsZShwYXRoKSkgJiYgZXZlbnQudHlwZSA9PT0gdHlwZSAmJiAoY29ycmVsYXRpb25JZCA9PT0gbnVsbCB8fCBldmVudC5jSWQgPT09IGNvcnJlbGF0aW9uSWQpKSB7XG5cdFx0XHRcdFx0XHRjb3VudGVyKys7XG5cdFx0XHRcdFx0XHRpZiAodHlwZW9mIGV4cGVjdGVkQ291bnQgPT09ICdudW1iZXInICYmIGNvdW50ZXIgPCBleHBlY3RlZENvdW50KSB7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlOyAvLyBub3QgeWV0XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0aWYgKGZhaWxPbkV2ZW50UmVhc29uKSB7XG5cdFx0XHRcdFx0XHRcdHJlamVjdChuZXcgRXJyb3IoYFVuZXhwZWN0ZWQgZmlsZSBldmVudDogJHtmYWlsT25FdmVudFJlYXNvbn1gKSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRzZXRJbW1lZGlhdGUoKCkgPT4gcmVzb2x2ZShldmVudHMpKTsgLy8gY29waWVkIGZyb20gcGFyY2VsIHdhdGNoZXIgdGVzdHMsIHNlZW1zIHRvIGRyb3AgdW5yZWxhdGVkIGV2ZW50cyBvbiBtYWNPU1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdC8vIFVud2luZCBmcm9tIHRoZSBldmVudCBjYWxsIHN0YWNrOiB3ZSBoYXZlIHNlZW4gY3Jhc2hlcyBpbiBQYXJjZWxcblx0XHQvLyB3aGVuIGUuZy4gY2FsbGluZyBgdW5zdWJzY3JpYmVgIGRpcmVjdGx5IGZyb20gdGhlIHN0YWNrIG9mIGEgZmlsZVxuXHRcdC8vIGNoYW5nZSBldmVudFxuXHRcdC8vIFJlZnM6IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMzc0MzBcblx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXG5cdFx0cmV0dXJuIHJlcztcblx0fVxuXG5cdGZ1bmN0aW9uIGF3YWl0TWVzc2FnZSh3YXRjaGVyOiBUZXN0UGFyY2VsV2F0Y2hlciwgdHlwZTogJ3RyYWNlJyB8ICd3YXJuJyB8ICdlcnJvcicgfCAnaW5mbycgfCAnZGVidWcnKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGxvZ2dpbmdFbmFibGVkKSB7XG5cdFx0XHRjb25zb2xlLmxvZyhgQXdhaXRpbmcgbWVzc2FnZSBvZiB0eXBlICR7dHlwZX1gKTtcblx0XHR9XG5cblx0XHQvLyBBd2FpdCB0aGUgbWVzc2FnZVxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB3YXRjaGVyLm9uRGlkTG9nTWVzc2FnZShtc2cgPT4ge1xuXHRcdFx0XHRpZiAobXNnLnR5cGUgPT09IHR5cGUpIHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0dGVzdCgnYmFzaWNzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlcXVlc3QgPSB7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlIH07XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbcmVxdWVzdF0pO1xuXG5cdFx0Y29uc3QgaW5zdGFuY2UgPSBBcnJheS5mcm9tKHdhdGNoZXIud2F0Y2hlcnMpWzBdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXF1ZXN0LCBpbnN0YW5jZS5yZXF1ZXN0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdGFuY2UuZmFpbGVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RhbmNlLnN0b3BwZWQsIGZhbHNlKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3Qgc3Vic2NyaXB0aW9uczEgPSBuZXcgTWFwPHN0cmluZywgRmlsZUNoYW5nZVR5cGU+KCk7XG5cdFx0Y29uc3Qgc3Vic2NyaXB0aW9uczIgPSBuZXcgTWFwPHN0cmluZywgRmlsZUNoYW5nZVR5cGU+KCk7XG5cblx0XHQvLyBOZXcgZmlsZVxuXHRcdGNvbnN0IG5ld0ZpbGVQYXRoID0gam9pbih0ZXN0RGlyLCAnZGVlcCcsICduZXdGaWxlLnR4dCcpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChpbnN0YW5jZS5zdWJzY3JpYmUobmV3RmlsZVBhdGgsIGNoYW5nZSA9PiBzdWJzY3JpcHRpb25zMS5zZXQoY2hhbmdlLnJlc291cmNlLmZzUGF0aCwgY2hhbmdlLnR5cGUpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGluc3RhbmNlLnN1YnNjcmliZShuZXdGaWxlUGF0aCwgY2hhbmdlID0+IHN1YnNjcmlwdGlvbnMyLnNldChjaGFuZ2UucmVzb3VyY2UuZnNQYXRoLCBjaGFuZ2UudHlwZSkpKTsgLy8gY2FuIHN1YnNjcmliZSBtdWx0aXBsZSB0aW1lc1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnN0YW5jZS5pbmNsdWRlKG5ld0ZpbGVQYXRoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RhbmNlLmV4Y2x1ZGUobmV3RmlsZVBhdGgpLCBmYWxzZSk7XG5cdFx0bGV0IGNoYW5nZUZ1dHVyZTogUHJvbWlzZTx1bmtub3duPiA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUobmV3RmlsZVBhdGgsICdIZWxsbyBXb3JsZCcpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3Vic2NyaXB0aW9uczEuZ2V0KG5ld0ZpbGVQYXRoKSwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWJzY3JpcHRpb25zMi5nZXQobmV3RmlsZVBhdGgpLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cblx0XHQvLyBOZXcgZm9sZGVyXG5cdFx0Y29uc3QgbmV3Rm9sZGVyUGF0aCA9IGpvaW4odGVzdERpciwgJ2RlZXAnLCAnTmV3IEZvbGRlcicpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChpbnN0YW5jZS5zdWJzY3JpYmUobmV3Rm9sZGVyUGF0aCwgY2hhbmdlID0+IHN1YnNjcmlwdGlvbnMxLnNldChjaGFuZ2UucmVzb3VyY2UuZnNQYXRoLCBjaGFuZ2UudHlwZSkpKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gaW5zdGFuY2Uuc3Vic2NyaWJlKG5ld0ZvbGRlclBhdGgsIGNoYW5nZSA9PiBzdWJzY3JpcHRpb25zMi5zZXQoY2hhbmdlLnJlc291cmNlLmZzUGF0aCwgY2hhbmdlLnR5cGUpKTtcblx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdGFuY2UuaW5jbHVkZShuZXdGb2xkZXJQYXRoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RhbmNlLmV4Y2x1ZGUobmV3Rm9sZGVyUGF0aCksIGZhbHNlKTtcblx0XHRjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZvbGRlclBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRhd2FpdCBwcm9taXNlcy5ta2RpcihuZXdGb2xkZXJQYXRoKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1YnNjcmlwdGlvbnMxLmdldChuZXdGb2xkZXJQYXRoKSwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWJzY3JpcHRpb25zMi5oYXMobmV3Rm9sZGVyUGF0aCksIGZhbHNlIC8qIHN1YnNjcmlwdGlvbiB3YXMgZGlzcG9zZWQgYmVmb3JlIHRoZSBldmVudCAqLyk7XG5cblx0XHQvLyBSZW5hbWUgZmlsZVxuXHRcdGxldCByZW5hbWVkRmlsZVBhdGggPSBqb2luKHRlc3REaXIsICdkZWVwJywgJ3JlbmFtZWRGaWxlLnR4dCcpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChpbnN0YW5jZS5zdWJzY3JpYmUocmVuYW1lZEZpbGVQYXRoLCBjaGFuZ2UgPT4gc3Vic2NyaXB0aW9uczEuc2V0KGNoYW5nZS5yZXNvdXJjZS5mc1BhdGgsIGNoYW5nZS50eXBlKSkpO1xuXHRcdGNoYW5nZUZ1dHVyZSA9IFByb21pc2UuYWxsKFtcblx0XHRcdGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpLFxuXHRcdFx0YXdhaXRFdmVudCh3YXRjaGVyLCByZW5hbWVkRmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKVxuXHRcdF0pO1xuXHRcdGF3YWl0IFByb21pc2VzLnJlbmFtZShuZXdGaWxlUGF0aCwgcmVuYW1lZEZpbGVQYXRoKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1YnNjcmlwdGlvbnMxLmdldChuZXdGaWxlUGF0aCksIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWJzY3JpcHRpb25zMS5nZXQocmVuYW1lZEZpbGVQYXRoKSwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXG5cdFx0Ly8gUmVuYW1lIGZvbGRlclxuXHRcdGxldCByZW5hbWVkRm9sZGVyUGF0aCA9IGpvaW4odGVzdERpciwgJ2RlZXAnLCAnUmVuYW1lZCBGb2xkZXInKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoaW5zdGFuY2Uuc3Vic2NyaWJlKHJlbmFtZWRGb2xkZXJQYXRoLCBjaGFuZ2UgPT4gc3Vic2NyaXB0aW9uczEuc2V0KGNoYW5nZS5yZXNvdXJjZS5mc1BhdGgsIGNoYW5nZS50eXBlKSkpO1xuXHRcdGNoYW5nZUZ1dHVyZSA9IFByb21pc2UuYWxsKFtcblx0XHRcdGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3Rm9sZGVyUGF0aCwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCksXG5cdFx0XHRhd2FpdEV2ZW50KHdhdGNoZXIsIHJlbmFtZWRGb2xkZXJQYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRClcblx0XHRdKTtcblx0XHRhd2FpdCBQcm9taXNlcy5yZW5hbWUobmV3Rm9sZGVyUGF0aCwgcmVuYW1lZEZvbGRlclBhdGgpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3Vic2NyaXB0aW9uczEuZ2V0KG5ld0ZvbGRlclBhdGgpLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3Vic2NyaXB0aW9uczEuZ2V0KHJlbmFtZWRGb2xkZXJQYXRoKSwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXG5cdFx0Ly8gUmVuYW1lIGZpbGUgKHNhbWUgbmFtZSwgZGlmZmVyZW50IGNhc2UpXG5cdFx0Y29uc3QgY2FzZVJlbmFtZWRGaWxlUGF0aCA9IGpvaW4odGVzdERpciwgJ2RlZXAnLCAnUmVuYW1lZEZpbGUudHh0Jyk7XG5cdFx0Y2hhbmdlRnV0dXJlID0gUHJvbWlzZS5hbGwoW1xuXHRcdFx0YXdhaXRFdmVudCh3YXRjaGVyLCByZW5hbWVkRmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpLFxuXHRcdFx0YXdhaXRFdmVudCh3YXRjaGVyLCBjYXNlUmVuYW1lZEZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRClcblx0XHRdKTtcblx0XHRhd2FpdCBQcm9taXNlcy5yZW5hbWUocmVuYW1lZEZpbGVQYXRoLCBjYXNlUmVuYW1lZEZpbGVQYXRoKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cdFx0cmVuYW1lZEZpbGVQYXRoID0gY2FzZVJlbmFtZWRGaWxlUGF0aDtcblxuXHRcdC8vIFJlbmFtZSBmb2xkZXIgKHNhbWUgbmFtZSwgZGlmZmVyZW50IGNhc2UpXG5cdFx0Y29uc3QgY2FzZVJlbmFtZWRGb2xkZXJQYXRoID0gam9pbih0ZXN0RGlyLCAnZGVlcCcsICdSRW5hbWVkIEZvbGRlcicpO1xuXHRcdGNoYW5nZUZ1dHVyZSA9IFByb21pc2UuYWxsKFtcblx0XHRcdGF3YWl0RXZlbnQod2F0Y2hlciwgcmVuYW1lZEZvbGRlclBhdGgsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpLFxuXHRcdFx0YXdhaXRFdmVudCh3YXRjaGVyLCBjYXNlUmVuYW1lZEZvbGRlclBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKVxuXHRcdF0pO1xuXHRcdGF3YWl0IFByb21pc2VzLnJlbmFtZShyZW5hbWVkRm9sZGVyUGF0aCwgY2FzZVJlbmFtZWRGb2xkZXJQYXRoKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cdFx0cmVuYW1lZEZvbGRlclBhdGggPSBjYXNlUmVuYW1lZEZvbGRlclBhdGg7XG5cblx0XHQvLyBNb3ZlIGZpbGVcblx0XHRjb25zdCBtb3ZlZEZpbGVwYXRoID0gam9pbih0ZXN0RGlyLCAnbW92ZWRGaWxlLnR4dCcpO1xuXHRcdGNoYW5nZUZ1dHVyZSA9IFByb21pc2UuYWxsKFtcblx0XHRcdGF3YWl0RXZlbnQod2F0Y2hlciwgcmVuYW1lZEZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKSxcblx0XHRcdGF3YWl0RXZlbnQod2F0Y2hlciwgbW92ZWRGaWxlcGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQpXG5cdFx0XSk7XG5cdFx0YXdhaXQgUHJvbWlzZXMucmVuYW1lKHJlbmFtZWRGaWxlUGF0aCwgbW92ZWRGaWxlcGF0aCk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXG5cdFx0Ly8gTW92ZSBmb2xkZXJcblx0XHRjb25zdCBtb3ZlZEZvbGRlcnBhdGggPSBqb2luKHRlc3REaXIsICdNb3ZlZCBGb2xkZXInKTtcblx0XHRjaGFuZ2VGdXR1cmUgPSBQcm9taXNlLmFsbChbXG5cdFx0XHRhd2FpdEV2ZW50KHdhdGNoZXIsIHJlbmFtZWRGb2xkZXJQYXRoLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKSxcblx0XHRcdGF3YWl0RXZlbnQod2F0Y2hlciwgbW92ZWRGb2xkZXJwYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRClcblx0XHRdKTtcblx0XHRhd2FpdCBQcm9taXNlcy5yZW5hbWUocmVuYW1lZEZvbGRlclBhdGgsIG1vdmVkRm9sZGVycGF0aCk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXG5cdFx0Ly8gQ29weSBmaWxlXG5cdFx0Y29uc3QgY29waWVkRmlsZXBhdGggPSBqb2luKHRlc3REaXIsICdkZWVwJywgJ2NvcGllZEZpbGUudHh0Jyk7XG5cdFx0Y2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBjb3BpZWRGaWxlcGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdGF3YWl0IHByb21pc2VzLmNvcHlGaWxlKG1vdmVkRmlsZXBhdGgsIGNvcGllZEZpbGVwYXRoKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cblx0XHQvLyBDb3B5IGZvbGRlclxuXHRcdGNvbnN0IGNvcGllZEZvbGRlcnBhdGggPSBqb2luKHRlc3REaXIsICdkZWVwJywgJ0NvcGllZCBGb2xkZXInKTtcblx0XHRjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGNvcGllZEZvbGRlcnBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRhd2FpdCBQcm9taXNlcy5jb3B5KG1vdmVkRm9sZGVycGF0aCwgY29waWVkRm9sZGVycGF0aCwgeyBwcmVzZXJ2ZVN5bWxpbmtzOiBmYWxzZSB9KTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cblx0XHQvLyBDaGFuZ2UgZmlsZVxuXHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgY29waWVkRmlsZXBhdGgsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQpO1xuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShjb3BpZWRGaWxlcGF0aCwgJ0hlbGxvIENoYW5nZScpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblxuXHRcdC8vIENyZWF0ZSBuZXcgZmlsZVxuXHRcdGNvbnN0IGFub3RoZXJOZXdGaWxlUGF0aCA9IGpvaW4odGVzdERpciwgJ2RlZXAnLCAnYW5vdGhlck5ld0ZpbGUudHh0Jyk7XG5cdFx0Y2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBhbm90aGVyTmV3RmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUoYW5vdGhlck5ld0ZpbGVQYXRoLCAnSGVsbG8gQW5vdGhlciBXb3JsZCcpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblxuXHRcdC8vIFJlYWQgZmlsZSBkb2VzIG5vdCBlbWl0IGV2ZW50XG5cdFx0Y2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBhbm90aGVyTmV3RmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQsICd1bmV4cGVjdGVkLWV2ZW50LWZyb20tcmVhZC1maWxlJyk7XG5cdFx0YXdhaXQgcHJvbWlzZXMucmVhZEZpbGUoYW5vdGhlck5ld0ZpbGVQYXRoKTtcblx0XHRhd2FpdCBQcm9taXNlLnJhY2UoW3RpbWVvdXQoMTAwKSwgY2hhbmdlRnV0dXJlXSk7XG5cblx0XHQvLyBTdGF0IGZpbGUgZG9lcyBub3QgZW1pdCBldmVudFxuXHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgYW5vdGhlck5ld0ZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVELCAndW5leHBlY3RlZC1ldmVudC1mcm9tLXN0YXQnKTtcblx0XHRhd2FpdCBwcm9taXNlcy5zdGF0KGFub3RoZXJOZXdGaWxlUGF0aCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yYWNlKFt0aW1lb3V0KDEwMCksIGNoYW5nZUZ1dHVyZV0pO1xuXG5cdFx0Ly8gU3RhdCBmb2xkZXIgZG9lcyBub3QgZW1pdCBldmVudFxuXHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgY29waWVkRm9sZGVycGF0aCwgRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCwgJ3VuZXhwZWN0ZWQtZXZlbnQtZnJvbS1zdGF0Jyk7XG5cdFx0YXdhaXQgcHJvbWlzZXMuc3RhdChjb3BpZWRGb2xkZXJwYXRoKTtcblx0XHRhd2FpdCBQcm9taXNlLnJhY2UoW3RpbWVvdXQoMTAwKSwgY2hhbmdlRnV0dXJlXSk7XG5cblx0XHQvLyBEZWxldGUgZmlsZVxuXHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgY29waWVkRmlsZXBhdGgsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChpbnN0YW5jZS5zdWJzY3JpYmUoY29waWVkRmlsZXBhdGgsIGNoYW5nZSA9PiBzdWJzY3JpcHRpb25zMS5zZXQoY2hhbmdlLnJlc291cmNlLmZzUGF0aCwgY2hhbmdlLnR5cGUpKSk7XG5cdFx0YXdhaXQgcHJvbWlzZXMudW5saW5rKGNvcGllZEZpbGVwYXRoKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1YnNjcmlwdGlvbnMxLmdldChjb3BpZWRGaWxlcGF0aCksIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpO1xuXG5cdFx0Ly8gRGVsZXRlIGZvbGRlclxuXHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgY29waWVkRm9sZGVycGF0aCwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGluc3RhbmNlLnN1YnNjcmliZShjb3BpZWRGb2xkZXJwYXRoLCBjaGFuZ2UgPT4gc3Vic2NyaXB0aW9uczEuc2V0KGNoYW5nZS5yZXNvdXJjZS5mc1BhdGgsIGNoYW5nZS50eXBlKSkpO1xuXHRcdGF3YWl0IHByb21pc2VzLnJtZGlyKGNvcGllZEZvbGRlcnBhdGgpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3Vic2NyaXB0aW9uczEuZ2V0KGNvcGllZEZvbGRlcnBhdGgpLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0KGlzTWFjaW50b3NoIC8qIHRoaXMgdGVzdCBzZWVtcyBub3QgcG9zc2libGUgd2l0aCBmc2V2ZW50cyBiYWNrZW5kICovID8gdGVzdC5za2lwIDogdGVzdCkoJ2Jhc2ljcyAoYXRvbWljIHdyaXRlcyknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogdHJ1ZSB9XSk7XG5cblx0XHQvLyBEZWxldGUgKyBSZWNyZWF0ZSBmaWxlXG5cdFx0Y29uc3QgbmV3RmlsZVBhdGggPSBqb2luKHRlc3REaXIsICdkZWVwJywgJ2NvbndheS5qcycpO1xuXHRcdGNvbnN0IGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQpO1xuXHRcdGF3YWl0IHByb21pc2VzLnVubGluayhuZXdGaWxlUGF0aCk7XG5cdFx0UHJvbWlzZXMud3JpdGVGaWxlKG5ld0ZpbGVQYXRoLCAnSGVsbG8gQXRvbWljIFdvcmxkJyk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXHR9KTtcblxuXHQoIWlzTGludXggLyogcG9sbGluZyBpcyBvbmx5IHVzZWQgaW4gbGludXggZW52aXJvbm1lbnRzIChXU0wpICovID8gdGVzdC5za2lwIDogdGVzdCkoJ2Jhc2ljcyAocG9sbGluZyknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIHBvbGxpbmdJbnRlcnZhbDogMTAwLCByZWN1cnNpdmU6IHRydWUgfV0pO1xuXG5cdFx0cmV0dXJuIGJhc2ljQ3J1ZFRlc3Qoam9pbih0ZXN0RGlyLCAnZGVlcCcsICduZXdGaWxlLnR4dCcpKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gYmFzaWNDcnVkVGVzdChmaWxlUGF0aDogc3RyaW5nLCBjb3JyZWxhdGlvbklkPzogbnVtYmVyIHwgbnVsbCwgZXhwZWN0ZWRDb3VudD86IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gTmV3IGZpbGVcblx0XHRsZXQgY2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBmaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQsIHVuZGVmaW5lZCwgY29ycmVsYXRpb25JZCwgZXhwZWN0ZWRDb3VudCk7XG5cdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKGZpbGVQYXRoLCAnSGVsbG8gV29ybGQnKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cblx0XHQvLyBDaGFuZ2UgZmlsZVxuXHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgZmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQsIHVuZGVmaW5lZCwgY29ycmVsYXRpb25JZCwgZXhwZWN0ZWRDb3VudCk7XG5cdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKGZpbGVQYXRoLCAnSGVsbG8gQ2hhbmdlJyk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXG5cdFx0Ly8gRGVsZXRlIGZpbGVcblx0XHRjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVELCB1bmRlZmluZWQsIGNvcnJlbGF0aW9uSWQsIGV4cGVjdGVkQ291bnQpO1xuXHRcdGF3YWl0IHByb21pc2VzLnVubGluayhmaWxlUGF0aCk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXHR9XG5cblx0dGVzdCgnbXVsdGlwbGUgZXZlbnRzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IHRydWUgfV0pO1xuXHRcdGF3YWl0IHByb21pc2VzLm1rZGlyKGpvaW4odGVzdERpciwgJ2RlZXAtbXVsdGlwbGUnKSk7XG5cblx0XHQvLyBtdWx0aXBsZSBhZGRcblxuXHRcdGNvbnN0IG5ld0ZpbGVQYXRoMSA9IGpvaW4odGVzdERpciwgJ25ld0ZpbGUtMS50eHQnKTtcblx0XHRjb25zdCBuZXdGaWxlUGF0aDIgPSBqb2luKHRlc3REaXIsICduZXdGaWxlLTIudHh0Jyk7XG5cdFx0Y29uc3QgbmV3RmlsZVBhdGgzID0gam9pbih0ZXN0RGlyLCAnbmV3RmlsZS0zLnR4dCcpO1xuXHRcdGNvbnN0IG5ld0ZpbGVQYXRoNCA9IGpvaW4odGVzdERpciwgJ2RlZXAtbXVsdGlwbGUnLCAnbmV3RmlsZS0xLnR4dCcpO1xuXHRcdGNvbnN0IG5ld0ZpbGVQYXRoNSA9IGpvaW4odGVzdERpciwgJ2RlZXAtbXVsdGlwbGUnLCAnbmV3RmlsZS0yLnR4dCcpO1xuXHRcdGNvbnN0IG5ld0ZpbGVQYXRoNiA9IGpvaW4odGVzdERpciwgJ2RlZXAtbXVsdGlwbGUnLCAnbmV3RmlsZS0zLnR4dCcpO1xuXG5cdFx0Y29uc3QgYWRkZWRGdXR1cmUxID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aDEsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRjb25zdCBhZGRlZEZ1dHVyZTIgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoMiwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdGNvbnN0IGFkZGVkRnV0dXJlMyA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGgzLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0Y29uc3QgYWRkZWRGdXR1cmU0ID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aDQsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRjb25zdCBhZGRlZEZ1dHVyZTUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoNSwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdGNvbnN0IGFkZGVkRnV0dXJlNiA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGg2LCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUobmV3RmlsZVBhdGgxLCAnSGVsbG8gV29ybGQgMScpLFxuXHRcdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKG5ld0ZpbGVQYXRoMiwgJ0hlbGxvIFdvcmxkIDInKSxcblx0XHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShuZXdGaWxlUGF0aDMsICdIZWxsbyBXb3JsZCAzJyksXG5cdFx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUobmV3RmlsZVBhdGg0LCAnSGVsbG8gV29ybGQgNCcpLFxuXHRcdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKG5ld0ZpbGVQYXRoNSwgJ0hlbGxvIFdvcmxkIDUnKSxcblx0XHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShuZXdGaWxlUGF0aDYsICdIZWxsbyBXb3JsZCA2Jylcblx0XHRdKTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFthZGRlZEZ1dHVyZTEsIGFkZGVkRnV0dXJlMiwgYWRkZWRGdXR1cmUzLCBhZGRlZEZ1dHVyZTQsIGFkZGVkRnV0dXJlNSwgYWRkZWRGdXR1cmU2XSk7XG5cblx0XHQvLyBtdWx0aXBsZSBjaGFuZ2VcblxuXHRcdGNvbnN0IGNoYW5nZUZ1dHVyZTEgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoMSwgRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCk7XG5cdFx0Y29uc3QgY2hhbmdlRnV0dXJlMiA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGgyLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKTtcblx0XHRjb25zdCBjaGFuZ2VGdXR1cmUzID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aDMsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQpO1xuXHRcdGNvbnN0IGNoYW5nZUZ1dHVyZTQgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoNCwgRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCk7XG5cdFx0Y29uc3QgY2hhbmdlRnV0dXJlNSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGg1LCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKTtcblx0XHRjb25zdCBjaGFuZ2VGdXR1cmU2ID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aDYsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKG5ld0ZpbGVQYXRoMSwgJ0hlbGxvIFVwZGF0ZSAxJyksXG5cdFx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUobmV3RmlsZVBhdGgyLCAnSGVsbG8gVXBkYXRlIDInKSxcblx0XHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShuZXdGaWxlUGF0aDMsICdIZWxsbyBVcGRhdGUgMycpLFxuXHRcdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKG5ld0ZpbGVQYXRoNCwgJ0hlbGxvIFVwZGF0ZSA0JyksXG5cdFx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUobmV3RmlsZVBhdGg1LCAnSGVsbG8gVXBkYXRlIDUnKSxcblx0XHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShuZXdGaWxlUGF0aDYsICdIZWxsbyBVcGRhdGUgNicpXG5cdFx0XSk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbY2hhbmdlRnV0dXJlMSwgY2hhbmdlRnV0dXJlMiwgY2hhbmdlRnV0dXJlMywgY2hhbmdlRnV0dXJlNCwgY2hhbmdlRnV0dXJlNSwgY2hhbmdlRnV0dXJlNl0pO1xuXG5cdFx0Ly8gY29weSB3aXRoIG11bHRpcGxlIGZpbGVzXG5cblx0XHRjb25zdCBjb3B5RnV0dXJlMSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgam9pbih0ZXN0RGlyLCAnZGVlcC1tdWx0aXBsZS1jb3B5JywgJ25ld0ZpbGUtMS50eHQnKSwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdGNvbnN0IGNvcHlGdXR1cmUyID0gYXdhaXRFdmVudCh3YXRjaGVyLCBqb2luKHRlc3REaXIsICdkZWVwLW11bHRpcGxlLWNvcHknLCAnbmV3RmlsZS0yLnR4dCcpLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0Y29uc3QgY29weUZ1dHVyZTMgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGpvaW4odGVzdERpciwgJ2RlZXAtbXVsdGlwbGUtY29weScsICduZXdGaWxlLTMudHh0JyksIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRjb25zdCBjb3B5RnV0dXJlNCA9IGF3YWl0RXZlbnQod2F0Y2hlciwgam9pbih0ZXN0RGlyLCAnZGVlcC1tdWx0aXBsZS1jb3B5JyksIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblxuXHRcdGF3YWl0IFByb21pc2VzLmNvcHkoam9pbih0ZXN0RGlyLCAnZGVlcC1tdWx0aXBsZScpLCBqb2luKHRlc3REaXIsICdkZWVwLW11bHRpcGxlLWNvcHknKSwgeyBwcmVzZXJ2ZVN5bWxpbmtzOiBmYWxzZSB9KTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtjb3B5RnV0dXJlMSwgY29weUZ1dHVyZTIsIGNvcHlGdXR1cmUzLCBjb3B5RnV0dXJlNF0pO1xuXG5cdFx0Ly8gbXVsdGlwbGUgZGVsZXRlIChzaW5nbGUgZmlsZXMpXG5cblx0XHRjb25zdCBkZWxldGVGdXR1cmUxID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aDEsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpO1xuXHRcdGNvbnN0IGRlbGV0ZUZ1dHVyZTIgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoMiwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCk7XG5cdFx0Y29uc3QgZGVsZXRlRnV0dXJlMyA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGgzLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKTtcblx0XHRjb25zdCBkZWxldGVGdXR1cmU0ID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aDQsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpO1xuXHRcdGNvbnN0IGRlbGV0ZUZ1dHVyZTUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoNSwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCk7XG5cdFx0Y29uc3QgZGVsZXRlRnV0dXJlNiA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGg2LCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdGF3YWl0IHByb21pc2VzLnVubGluayhuZXdGaWxlUGF0aDEpLFxuXHRcdFx0YXdhaXQgcHJvbWlzZXMudW5saW5rKG5ld0ZpbGVQYXRoMiksXG5cdFx0XHRhd2FpdCBwcm9taXNlcy51bmxpbmsobmV3RmlsZVBhdGgzKSxcblx0XHRcdGF3YWl0IHByb21pc2VzLnVubGluayhuZXdGaWxlUGF0aDQpLFxuXHRcdFx0YXdhaXQgcHJvbWlzZXMudW5saW5rKG5ld0ZpbGVQYXRoNSksXG5cdFx0XHRhd2FpdCBwcm9taXNlcy51bmxpbmsobmV3RmlsZVBhdGg2KVxuXHRcdF0pO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW2RlbGV0ZUZ1dHVyZTEsIGRlbGV0ZUZ1dHVyZTIsIGRlbGV0ZUZ1dHVyZTMsIGRlbGV0ZUZ1dHVyZTQsIGRlbGV0ZUZ1dHVyZTUsIGRlbGV0ZUZ1dHVyZTZdKTtcblxuXHRcdC8vIG11bHRpcGxlIGRlbGV0ZSAoZm9sZGVyKVxuXG5cdFx0Y29uc3QgZGVsZXRlRm9sZGVyRnV0dXJlMSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgam9pbih0ZXN0RGlyLCAnZGVlcC1tdWx0aXBsZScpLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKTtcblx0XHRjb25zdCBkZWxldGVGb2xkZXJGdXR1cmUyID0gYXdhaXRFdmVudCh3YXRjaGVyLCBqb2luKHRlc3REaXIsICdkZWVwLW11bHRpcGxlLWNvcHknKSwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbUHJvbWlzZXMucm0oam9pbih0ZXN0RGlyLCAnZGVlcC1tdWx0aXBsZScpLCBSaW1SYWZNb2RlLlVOTElOSyksIFByb21pc2VzLnJtKGpvaW4odGVzdERpciwgJ2RlZXAtbXVsdGlwbGUtY29weScpLCBSaW1SYWZNb2RlLlVOTElOSyldKTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtkZWxldGVGb2xkZXJGdXR1cmUxLCBkZWxldGVGb2xkZXJGdXR1cmUyXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N1YnNlcXVlbnQgd2F0Y2ggdXBkYXRlcyB3YXRjaGVycyAocGF0aCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW2pvaW4ocmVhbHBhdGhTeW5jKHRlc3REaXIpLCAndW5yZWxhdGVkJyldLCByZWN1cnNpdmU6IHRydWUgfV0pO1xuXG5cdFx0Ly8gTmV3IGZpbGUgKCoudHh0KVxuXHRcdGxldCBuZXdUZXh0RmlsZVBhdGggPSBqb2luKHRlc3REaXIsICdkZWVwJywgJ25ld0ZpbGUudHh0Jyk7XG5cdFx0bGV0IGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3VGV4dEZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKG5ld1RleHRGaWxlUGF0aCwgJ0hlbGxvIFdvcmxkJyk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiBqb2luKHRlc3REaXIsICdkZWVwJyksIGV4Y2x1ZGVzOiBbam9pbihyZWFscGF0aFN5bmModGVzdERpciksICd1bnJlbGF0ZWQnKV0sIHJlY3Vyc2l2ZTogdHJ1ZSB9XSk7XG5cdFx0bmV3VGV4dEZpbGVQYXRoID0gam9pbih0ZXN0RGlyLCAnZGVlcCcsICduZXdGaWxlMi50eHQnKTtcblx0XHRjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld1RleHRGaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShuZXdUZXh0RmlsZVBhdGgsICdIZWxsbyBXb3JsZCcpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblxuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogam9pbih0ZXN0RGlyLCAnZGVlcCcpLCBleGNsdWRlczogW3JlYWxwYXRoU3luYyh0ZXN0RGlyKV0sIHJlY3Vyc2l2ZTogdHJ1ZSB9XSk7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiBqb2luKHRlc3REaXIsICdkZWVwJyksIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlIH1dKTtcblx0XHRuZXdUZXh0RmlsZVBhdGggPSBqb2luKHRlc3REaXIsICdkZWVwJywgJ25ld0ZpbGUzLnR4dCcpO1xuXHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3VGV4dEZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKG5ld1RleHRGaWxlUGF0aCwgJ0hlbGxvIFdvcmxkJyk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnZhbGlkIHBhdGggZG9lcyBub3QgY3Jhc2ggd2F0Y2hlcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFtcblx0XHRcdHsgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IHRydWUgfSxcblx0XHRcdHsgcGF0aDogam9pbih0ZXN0RGlyLCAnaW52YWxpZC1mb2xkZXInKSwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IHRydWUgfSxcblx0XHRcdHsgcGF0aDogRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJycpLmZzUGF0aCwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IHRydWUgfVxuXHRcdF0pO1xuXG5cdFx0cmV0dXJuIGJhc2ljQ3J1ZFRlc3Qoam9pbih0ZXN0RGlyLCAnZGVlcCcsICduZXdGaWxlLnR4dCcpKTtcblx0fSk7XG5cblx0dGVzdCgnc3Vic2VxdWVudCB3YXRjaCB1cGRhdGVzIHdhdGNoZXJzIChleGNsdWRlcyknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW3JlYWxwYXRoU3luYyh0ZXN0RGlyKV0sIHJlY3Vyc2l2ZTogdHJ1ZSB9XSk7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogdHJ1ZSB9XSk7XG5cblx0XHRyZXR1cm4gYmFzaWNDcnVkVGVzdChqb2luKHRlc3REaXIsICdkZWVwJywgJ25ld0ZpbGUudHh0JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdWJzZXF1ZW50IHdhdGNoIHVwZGF0ZXMgd2F0Y2hlcnMgKGluY2x1ZGVzKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgaW5jbHVkZXM6IFsnbm90aGluZyddLCByZWN1cnNpdmU6IHRydWUgfV0pO1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IHRydWUgfV0pO1xuXG5cdFx0cmV0dXJuIGJhc2ljQ3J1ZFRlc3Qoam9pbih0ZXN0RGlyLCAnZGVlcCcsICduZXdGaWxlLnR4dCcpKTtcblx0fSk7XG5cblx0dGVzdCgnaW5jbHVkZXMgYXJlIHN1cHBvcnRlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgaW5jbHVkZXM6IFsnKiovZGVlcC8qKiddLCByZWN1cnNpdmU6IHRydWUgfV0pO1xuXG5cdFx0cmV0dXJuIGJhc2ljQ3J1ZFRlc3Qoam9pbih0ZXN0RGlyLCAnZGVlcCcsICduZXdGaWxlLnR4dCcpKTtcblx0fSk7XG5cblx0dGVzdCgnaW5jbHVkZXMgYXJlIHN1cHBvcnRlZCAocmVsYXRpdmUgcGF0dGVybiBleHBsaWNpdCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIGluY2x1ZGVzOiBbeyBiYXNlOiB0ZXN0RGlyLCBwYXR0ZXJuOiAnZGVlcC9uZXdGaWxlLnR4dCcgfV0sIHJlY3Vyc2l2ZTogdHJ1ZSB9XSk7XG5cblx0XHRyZXR1cm4gYmFzaWNDcnVkVGVzdChqb2luKHRlc3REaXIsICdkZWVwJywgJ25ld0ZpbGUudHh0JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmNsdWRlcyBhcmUgc3VwcG9ydGVkIChyZWxhdGl2ZSBwYXR0ZXJuIGltcGxpY2l0KScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgaW5jbHVkZXM6IFsnZGVlcC9uZXdGaWxlLnR4dCddLCByZWN1cnNpdmU6IHRydWUgfV0pO1xuXG5cdFx0cmV0dXJuIGJhc2ljQ3J1ZFRlc3Qoam9pbih0ZXN0RGlyLCAnZGVlcCcsICduZXdGaWxlLnR4dCcpKTtcblx0fSk7XG5cblx0dGVzdCgnZXhjbHVkZXMgYXJlIHN1cHBvcnRlZCAocGF0aCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIHRlc3RFeGNsdWRlcyhbam9pbihyZWFscGF0aFN5bmModGVzdERpciksICdkZWVwJyldKTtcblx0fSk7XG5cblx0dGVzdCgnZXhjbHVkZXMgYXJlIHN1cHBvcnRlZCAoZ2xvYiknLCBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIHRlc3RFeGNsdWRlcyhbJ2RlZXAvKionXSk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RFeGNsdWRlcyhleGNsdWRlczogc3RyaW5nW10pIHtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzLCByZWN1cnNpdmU6IHRydWUgfV0pO1xuXG5cdFx0Ly8gTmV3IGZpbGUgKCoudHh0KVxuXHRcdGNvbnN0IG5ld1RleHRGaWxlUGF0aCA9IGpvaW4odGVzdERpciwgJ2RlZXAnLCAnbmV3RmlsZS50eHQnKTtcblx0XHRjb25zdCBjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld1RleHRGaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShuZXdUZXh0RmlsZVBhdGgsICdIZWxsbyBXb3JsZCcpO1xuXG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgUHJvbWlzZS5hbnkoW1xuXHRcdFx0dGltZW91dCg1MDApLnRoZW4oKCkgPT4gdHJ1ZSksXG5cdFx0XHRjaGFuZ2VGdXR1cmUudGhlbigoKSA9PiBmYWxzZSlcblx0XHRdKTtcblxuXHRcdGlmICghcmVzKSB7XG5cdFx0XHRhc3NlcnQuZmFpbCgnVW5leHBlY3RlZCBjaGFuZ2UgZXZlbnQnKTtcblx0XHR9XG5cdH1cblxuXHQoaXNXaW5kb3dzIC8qIHdpbmRvd3M6IGNhbm5vdCBjcmVhdGUgZmlsZSBzeW1ib2xpYyBsaW5rIHdpdGhvdXQgZWxldmF0ZWQgY29udGV4dCAqLyA/IHRlc3Quc2tpcCA6IHRlc3QpKCdzeW1saW5rIHN1cHBvcnQgKHJvb3QpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGxpbmsgPSBqb2luKHRlc3REaXIsICdkZWVwLWxpbmtlZCcpO1xuXHRcdGNvbnN0IGxpbmtUYXJnZXQgPSBqb2luKHRlc3REaXIsICdkZWVwJyk7XG5cdFx0YXdhaXQgcHJvbWlzZXMuc3ltbGluayhsaW5rVGFyZ2V0LCBsaW5rKTtcblxuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogbGluaywgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IHRydWUgfV0pO1xuXG5cdFx0cmV0dXJuIGJhc2ljQ3J1ZFRlc3Qoam9pbihsaW5rLCAnbmV3RmlsZS50eHQnKSk7XG5cdH0pO1xuXG5cdChpc1dpbmRvd3MgLyogd2luZG93czogY2Fubm90IGNyZWF0ZSBmaWxlIHN5bWJvbGljIGxpbmsgd2l0aG91dCBlbGV2YXRlZCBjb250ZXh0ICovID8gdGVzdC5za2lwIDogdGVzdCkoJ3N5bWxpbmsgc3VwcG9ydCAodmlhIGV4dHJhIHdhdGNoKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBsaW5rID0gam9pbih0ZXN0RGlyLCAnZGVlcC1saW5rZWQnKTtcblx0XHRjb25zdCBsaW5rVGFyZ2V0ID0gam9pbih0ZXN0RGlyLCAnZGVlcCcpO1xuXHRcdGF3YWl0IHByb21pc2VzLnN5bWxpbmsobGlua1RhcmdldCwgbGluayk7XG5cblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlIH0sIHsgcGF0aDogbGluaywgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IHRydWUgfV0pO1xuXG5cdFx0cmV0dXJuIGJhc2ljQ3J1ZFRlc3Qoam9pbihsaW5rLCAnbmV3RmlsZS50eHQnKSk7XG5cdH0pO1xuXG5cdCghaXNXaW5kb3dzIC8qIFVOQyBpcyB3aW5kb3dzIG9ubHkgKi8gPyB0ZXN0LnNraXAgOiB0ZXN0KSgndW5jIHN1cHBvcnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YWRkVU5DSG9zdFRvQWxsb3dsaXN0KCdsb2NhbGhvc3QnKTtcblxuXHRcdC8vIExvY2FsIFVOQyBwYXRocyBhcmUgaW4gdGhlIGZvcm0gb2Y6IFxcXFxsb2NhbGhvc3RcXGMkXFxteV9kaXJcblx0XHRjb25zdCB1bmNQYXRoID0gYFxcXFxcXFxcbG9jYWxob3N0XFxcXCR7Z2V0RHJpdmVMZXR0ZXIodGVzdERpcik/LnRvTG93ZXJDYXNlKCl9JFxcXFwke2x0cmltKHRlc3REaXIuc3Vic3RyKHRlc3REaXIuaW5kZXhPZignOicpICsgMSksICdcXFxcJyl9YDtcblxuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogdW5jUGF0aCwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IHRydWUgfV0pO1xuXG5cdFx0cmV0dXJuIGJhc2ljQ3J1ZFRlc3Qoam9pbih1bmNQYXRoLCAnZGVlcCcsICduZXdGaWxlLnR4dCcpKTtcblx0fSk7XG5cblx0KGlzTGludXggLyogbGludXg6IGlzIGNhc2Ugc2Vuc2l0aXZlICovID8gdGVzdC5za2lwIDogdGVzdCkoJ3dyb25nIGNhc2luZycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBkZWVwV3JvbmdDYXNlZFBhdGggPSBqb2luKHRlc3REaXIsICdERUVQJyk7XG5cblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IGRlZXBXcm9uZ0Nhc2VkUGF0aCwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IHRydWUgfV0pO1xuXG5cdFx0cmV0dXJuIGJhc2ljQ3J1ZFRlc3Qoam9pbihkZWVwV3JvbmdDYXNlZFBhdGgsICduZXdGaWxlLnR4dCcpKTtcblx0fSk7XG5cblx0dGVzdCgnaW52YWxpZCBmb2xkZXIgZG9lcyBub3QgZXhwbG9kZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBpbnZhbGlkUGF0aCA9IGpvaW4odGVzdERpciwgJ2ludmFsaWQnKTtcblxuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogaW52YWxpZFBhdGgsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlIH1dKTtcblx0fSk7XG5cblx0KGlzV2luZG93cyAvKiBmbGFreSBvbiB3aW5kb3dzICovID8gdGVzdC5za2lwIDogdGVzdCkoJ2RlbGV0aW5nIHdhdGNoZWQgcGF0aCB3aXRob3V0IGNvcnJlbGF0aW9uIHJlc3RhcnRzIHdhdGNoaW5nJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHdhdGNoZWRQYXRoID0gam9pbih0ZXN0RGlyLCAnZGVlcCcpO1xuXG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiB3YXRjaGVkUGF0aCwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IHRydWUgfV0pO1xuXG5cdFx0Ly8gRGVsZXRlIHdhdGNoZWQgcGF0aCBhbmQgYXdhaXRcblx0XHRjb25zdCB3YXJuRnV0dXJlID0gYXdhaXRNZXNzYWdlKHdhdGNoZXIsICd3YXJuJyk7XG5cdFx0YXdhaXQgUHJvbWlzZXMucm0od2F0Y2hlZFBhdGgsIFJpbVJhZk1vZGUuVU5MSU5LKTtcblx0XHRhd2FpdCB3YXJuRnV0dXJlO1xuXG5cdFx0Ly8gUmVzdG9yZSB3YXRjaGVkIHBhdGhcblx0XHRhd2FpdCB0aW1lb3V0KDE1MDApOyAvLyBub2RlLmpzIHdhdGNoZXIgdXNlZCBmb3IgbW9uaXRvcmluZyBmb2xkZXIgcmVzdG9yZSBpcyBhc3luY1xuXHRcdGF3YWl0IHByb21pc2VzLm1rZGlyKHdhdGNoZWRQYXRoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDE1MDApOyAvLyByZXN0YXJ0IGlzIGRlbGF5ZWRcblx0XHRhd2FpdCB3YXRjaGVyLndoZW5SZWFkeSgpO1xuXG5cdFx0Ly8gVmVyaWZ5IGV2ZW50cyBjb21lIGluIGFnYWluXG5cdFx0Y29uc3QgbmV3RmlsZVBhdGggPSBqb2luKHdhdGNoZWRQYXRoLCAnbmV3RmlsZS50eHQnKTtcblx0XHRjb25zdCBjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKG5ld0ZpbGVQYXRoLCAnSGVsbG8gV29ybGQnKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcnJlbGF0aW9uSWQgaXMgc3VwcG9ydGVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGNvcnJlbGF0aW9uSWQgPSBNYXRoLnJhbmRvbSgpO1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgY29ycmVsYXRpb25JZCwgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IHRydWUgfV0pO1xuXG5cdFx0cmV0dXJuIGJhc2ljQ3J1ZFRlc3Qoam9pbih0ZXN0RGlyLCAnbmV3RmlsZS50eHQnKSwgY29ycmVsYXRpb25JZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBub3QgZXhjbHVkZSByb290cyB0aGF0IGRvIG5vdCBvdmVybGFwJywgYXN5bmMgKCkgPT4ge1xuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgd2F0Y2hlci50ZXN0UmVtb3ZlRHVwbGljYXRlUmVxdWVzdHMoWydDOlxcXFxhJ10pLCBbJ0M6XFxcXGEnXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHdhdGNoZXIudGVzdFJlbW92ZUR1cGxpY2F0ZVJlcXVlc3RzKFsnQzpcXFxcYScsICdDOlxcXFxiJ10pLCBbJ0M6XFxcXGEnLCAnQzpcXFxcYiddKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgd2F0Y2hlci50ZXN0UmVtb3ZlRHVwbGljYXRlUmVxdWVzdHMoWydDOlxcXFxhJywgJ0M6XFxcXGInLCAnQzpcXFxcY1xcXFxkXFxcXGUnXSksIFsnQzpcXFxcYScsICdDOlxcXFxiJywgJ0M6XFxcXGNcXFxcZFxcXFxlJ10pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHdhdGNoZXIudGVzdFJlbW92ZUR1cGxpY2F0ZVJlcXVlc3RzKFsnL2EnXSksIFsnL2EnXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHdhdGNoZXIudGVzdFJlbW92ZUR1cGxpY2F0ZVJlcXVlc3RzKFsnL2EnLCAnL2InXSksIFsnL2EnLCAnL2InXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHdhdGNoZXIudGVzdFJlbW92ZUR1cGxpY2F0ZVJlcXVlc3RzKFsnL2EnLCAnL2InLCAnL2MvZC9lJ10pLCBbJy9hJywgJy9iJywgJy9jL2QvZSddKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZW1vdmUgc3ViLWZvbGRlcnMgb2Ygb3RoZXIgcGF0aHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCB3YXRjaGVyLnRlc3RSZW1vdmVEdXBsaWNhdGVSZXF1ZXN0cyhbJ0M6XFxcXGEnLCAnQzpcXFxcYVxcXFxiJ10pLCBbJ0M6XFxcXGEnXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHdhdGNoZXIudGVzdFJlbW92ZUR1cGxpY2F0ZVJlcXVlc3RzKFsnQzpcXFxcYScsICdDOlxcXFxiJywgJ0M6XFxcXGFcXFxcYiddKSwgWydDOlxcXFxhJywgJ0M6XFxcXGInXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHdhdGNoZXIudGVzdFJlbW92ZUR1cGxpY2F0ZVJlcXVlc3RzKFsnQzpcXFxcYlxcXFxhJywgJ0M6XFxcXGEnLCAnQzpcXFxcYicsICdDOlxcXFxhXFxcXGInXSksIFsnQzpcXFxcYScsICdDOlxcXFxiJ10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCB3YXRjaGVyLnRlc3RSZW1vdmVEdXBsaWNhdGVSZXF1ZXN0cyhbJ0M6XFxcXGEnLCAnQzpcXFxcYVxcXFxiJywgJ0M6XFxcXGFcXFxcY1xcXFxkJ10pLCBbJ0M6XFxcXGEnXSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgd2F0Y2hlci50ZXN0UmVtb3ZlRHVwbGljYXRlUmVxdWVzdHMoWycvYScsICcvYS9iJ10pLCBbJy9hJ10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCB3YXRjaGVyLnRlc3RSZW1vdmVEdXBsaWNhdGVSZXF1ZXN0cyhbJy9hJywgJy9iJywgJy9hL2InXSksIFsnL2EnLCAnL2InXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHdhdGNoZXIudGVzdFJlbW92ZUR1cGxpY2F0ZVJlcXVlc3RzKFsnL2IvYScsICcvYScsICcvYicsICcvYS9iJ10pLCBbJy9hJywgJy9iJ10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCB3YXRjaGVyLnRlc3RSZW1vdmVEdXBsaWNhdGVSZXF1ZXN0cyhbJy9hJywgJy9hL2InLCAnL2EvYy9kJ10pLCBbJy9hJ10pO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGlnbm9yZSB3aGVuIGV2ZXJ5dGhpbmcgZXhjbHVkZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCB3YXRjaGVyLnRlc3RSZW1vdmVEdXBsaWNhdGVSZXF1ZXN0cyhbJy9mb28vYmFyJywgJy9iYXInXSwgWycqKicsICdzb21ldGhpbmcnXSksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnd2F0Y2hpbmcgc2FtZSBvciBvdmVybGFwcGluZyBwYXRocyBzdXBwb3J0ZWQgd2hlbiBjb3JyZWxhdGlvbiBpcyBhcHBsaWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW1xuXHRcdFx0eyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogdHJ1ZSwgY29ycmVsYXRpb25JZDogMSB9XG5cdFx0XSk7XG5cblx0XHRhd2FpdCBiYXNpY0NydWRUZXN0KGpvaW4odGVzdERpciwgJ25ld0ZpbGUudHh0JyksIG51bGwsIDEpO1xuXG5cdFx0Ly8gc2FtZSBwYXRoLCBzYW1lIG9wdGlvbnNcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFtcblx0XHRcdHsgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IHRydWUsIGNvcnJlbGF0aW9uSWQ6IDEgfSxcblx0XHRcdHsgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IHRydWUsIGNvcnJlbGF0aW9uSWQ6IDIsIH0sXG5cdFx0XHR7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlLCBjb3JyZWxhdGlvbklkOiB1bmRlZmluZWQgfVxuXHRcdF0pO1xuXG5cdFx0YXdhaXQgYmFzaWNDcnVkVGVzdChqb2luKHRlc3REaXIsICduZXdGaWxlLnR4dCcpLCBudWxsLCAzKTtcblx0XHRhd2FpdCBiYXNpY0NydWRUZXN0KGpvaW4odGVzdERpciwgJ290aGVyTmV3RmlsZS50eHQnKSwgbnVsbCwgMyk7XG5cblx0XHQvLyBzYW1lIHBhdGgsIGRpZmZlcmVudCBvcHRpb25zXG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbXG5cdFx0XHR7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlLCBjb3JyZWxhdGlvbklkOiAxIH0sXG5cdFx0XHR7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlLCBjb3JyZWxhdGlvbklkOiAyIH0sXG5cdFx0XHR7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlLCBjb3JyZWxhdGlvbklkOiB1bmRlZmluZWQgfSxcblx0XHRcdHsgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtqb2luKHJlYWxwYXRoU3luYyh0ZXN0RGlyKSwgJ2RlZXAnKV0sIHJlY3Vyc2l2ZTogdHJ1ZSwgY29ycmVsYXRpb25JZDogMyB9LFxuXHRcdFx0eyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW2pvaW4ocmVhbHBhdGhTeW5jKHRlc3REaXIpLCAnb3RoZXInKV0sIHJlY3Vyc2l2ZTogdHJ1ZSwgY29ycmVsYXRpb25JZDogNCB9LFxuXHRcdF0pO1xuXG5cdFx0YXdhaXQgYmFzaWNDcnVkVGVzdChqb2luKHRlc3REaXIsICduZXdGaWxlLnR4dCcpLCBudWxsLCA1KTtcblx0XHRhd2FpdCBiYXNpY0NydWRUZXN0KGpvaW4odGVzdERpciwgJ290aGVyTmV3RmlsZS50eHQnKSwgbnVsbCwgNSk7XG5cblx0XHQvLyBvdmVybGFwcGluZyBwYXRocyAoc2FtZSBvcHRpb25zKVxuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW1xuXHRcdFx0eyBwYXRoOiBkaXJuYW1lKHRlc3REaXIpLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogdHJ1ZSwgY29ycmVsYXRpb25JZDogMSB9LFxuXHRcdFx0eyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogdHJ1ZSwgY29ycmVsYXRpb25JZDogMiB9LFxuXHRcdFx0eyBwYXRoOiBqb2luKHRlc3REaXIsICdkZWVwJyksIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlLCBjb3JyZWxhdGlvbklkOiAzIH0sXG5cdFx0XSk7XG5cblx0XHRhd2FpdCBiYXNpY0NydWRUZXN0KGpvaW4odGVzdERpciwgJ2RlZXAnLCAnbmV3RmlsZS50eHQnKSwgbnVsbCwgMyk7XG5cdFx0YXdhaXQgYmFzaWNDcnVkVGVzdChqb2luKHRlc3REaXIsICdkZWVwJywgJ290aGVyTmV3RmlsZS50eHQnKSwgbnVsbCwgMyk7XG5cblx0XHQvLyBvdmVybGFwcGluZyBwYXRocyAoZGlmZmVyZW50IG9wdGlvbnMpXG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbXG5cdFx0XHR7IHBhdGg6IGRpcm5hbWUodGVzdERpciksIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlLCBjb3JyZWxhdGlvbklkOiAxIH0sXG5cdFx0XHR7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbam9pbihyZWFscGF0aFN5bmModGVzdERpciksICdzb21lJyldLCByZWN1cnNpdmU6IHRydWUsIGNvcnJlbGF0aW9uSWQ6IDIgfSxcblx0XHRcdHsgcGF0aDogam9pbih0ZXN0RGlyLCAnZGVlcCcpLCBleGNsdWRlczogW2pvaW4ocmVhbHBhdGhTeW5jKHRlc3REaXIpLCAnb3RoZXInKV0sIHJlY3Vyc2l2ZTogdHJ1ZSwgY29ycmVsYXRpb25JZDogMyB9LFxuXHRcdF0pO1xuXG5cdFx0YXdhaXQgYmFzaWNDcnVkVGVzdChqb2luKHRlc3REaXIsICdkZWVwJywgJ25ld0ZpbGUudHh0JyksIG51bGwsIDMpO1xuXHRcdGF3YWl0IGJhc2ljQ3J1ZFRlc3Qoam9pbih0ZXN0RGlyLCAnZGVlcCcsICdvdGhlck5ld0ZpbGUudHh0JyksIG51bGwsIDMpO1xuXHR9KTtcblxuXHR0ZXN0KCd3YXRjaGluZyBtaXNzaW5nIHBhdGggZW1pdHMgd2F0Y2hlciBmYWlsIGV2ZW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG9uRGlkV2F0Y2hGYWlsID0gRXZlbnQudG9Qcm9taXNlKHdhdGNoZXIub25XYXRjaEZhaWwpO1xuXG5cdFx0Y29uc3QgZm9sZGVyUGF0aCA9IGpvaW4odGVzdERpciwgJ21pc3NpbmcnKTtcblx0XHR3YXRjaGVyLndhdGNoKFt7IHBhdGg6IGZvbGRlclBhdGgsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlIH1dKTtcblxuXHRcdGF3YWl0IG9uRGlkV2F0Y2hGYWlsO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGluZyB3YXRjaGVkIHBhdGggZW1pdHMgd2F0Y2hlciBmYWlsIGFuZCBkZWxldGUgZXZlbnQgaWYgY29ycmVsYXRlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmb2xkZXJQYXRoID0gam9pbih0ZXN0RGlyLCAnZGVlcCcpO1xuXG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiBmb2xkZXJQYXRoLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogdHJ1ZSwgY29ycmVsYXRpb25JZDogMSB9XSk7XG5cblx0XHRsZXQgZmFpbGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgaW5zdGFuY2UgPSBBcnJheS5mcm9tKHdhdGNoZXIud2F0Y2hlcnMpWzBdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnN0YW5jZS5pbmNsdWRlKGZvbGRlclBhdGgpLCB0cnVlKTtcblx0XHRpbnN0YW5jZS5vbkRpZEZhaWwoKCkgPT4gZmFpbGVkID0gdHJ1ZSk7XG5cblx0XHRjb25zdCBvbkRpZFdhdGNoRmFpbCA9IEV2ZW50LnRvUHJvbWlzZSh3YXRjaGVyLm9uV2F0Y2hGYWlsKTtcblx0XHRjb25zdCBjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGZvbGRlclBhdGgsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQsIHVuZGVmaW5lZCwgMSk7XG5cdFx0UHJvbWlzZXMucm0oZm9sZGVyUGF0aCwgUmltUmFmTW9kZS5VTkxJTkspO1xuXHRcdGF3YWl0IG9uRGlkV2F0Y2hGYWlsO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFpbGVkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdGFuY2UuZmFpbGVkLCB0cnVlKTtcblx0fSk7XG5cblx0KCFpc01hY2ludG9zaCAvKiBMaW51eC9XaW5kb3dzOiB0aW1lcyBvdXQgZm9yIHNvbWUgcmVhc29uICovID8gdGVzdC5za2lwIDogdGVzdCkoJ3dhdGNoIHJlcXVlc3RzIHN1cHBvcnQgc3VzcGVuZC9yZXN1bWUgKGZvbGRlciwgZG9lcyBub3QgZXhpc3QgaW4gYmVnaW5uaW5nLCBub3QgcmV1c2luZyB3YXRjaGVyKScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXN0V2F0Y2hGb2xkZXJEb2VzTm90RXhpc3QoZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCd3YXRjaCByZXF1ZXN0cyBzdXBwb3J0IHN1c3BlbmQvcmVzdW1lIChmb2xkZXIsIGRvZXMgbm90IGV4aXN0IGluIGJlZ2lubmluZywgcmV1c2luZyB3YXRjaGVyKScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXN0V2F0Y2hGb2xkZXJEb2VzTm90RXhpc3QodHJ1ZSk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RXYXRjaEZvbGRlckRvZXNOb3RFeGlzdChyZXVzZUV4aXN0aW5nV2F0Y2hlcjogYm9vbGVhbikge1xuXHRcdGxldCBvbkRpZFdhdGNoRmFpbCA9IEV2ZW50LnRvUHJvbWlzZSh3YXRjaGVyLm9uV2F0Y2hGYWlsKTtcblxuXHRcdGNvbnN0IGZvbGRlclBhdGggPSBqb2luKHRlc3REaXIsICdub3QtZm91bmQnKTtcblxuXHRcdGNvbnN0IHJlcXVlc3RzOiBJUmVjdXJzaXZlV2F0Y2hSZXF1ZXN0W10gPSBbXTtcblx0XHRpZiAocmV1c2VFeGlzdGluZ1dhdGNoZXIpIHtcblx0XHRcdHJlcXVlc3RzLnB1c2goeyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRcdGF3YWl0IHdhdGNoZXIud2F0Y2gocmVxdWVzdHMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcXVlc3Q6IElSZWN1cnNpdmVXYXRjaFJlcXVlc3QgPSB7IHBhdGg6IGZvbGRlclBhdGgsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlIH07XG5cdFx0cmVxdWVzdHMucHVzaChyZXF1ZXN0KTtcblxuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2gocmVxdWVzdHMpO1xuXHRcdGF3YWl0IG9uRGlkV2F0Y2hGYWlsO1xuXG5cdFx0aWYgKHJldXNlRXhpc3RpbmdXYXRjaGVyKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2F0Y2hlci5pc1N1c3BlbmRlZChyZXF1ZXN0KSwgdHJ1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXRjaGVyLmlzU3VzcGVuZGVkKHJlcXVlc3QpLCAncG9sbGluZycpO1xuXHRcdH1cblxuXHRcdGxldCBjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGZvbGRlclBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRsZXQgb25EaWRXYXRjaCA9IEV2ZW50LnRvUHJvbWlzZSh3YXRjaGVyLm9uRGlkV2F0Y2gpO1xuXHRcdGF3YWl0IHByb21pc2VzLm1rZGlyKGZvbGRlclBhdGgpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblx0XHRhd2FpdCBvbkRpZFdhdGNoO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhdGNoZXIuaXNTdXNwZW5kZWQocmVxdWVzdCksIGZhbHNlKTtcblxuXHRcdGNvbnN0IGZpbGVQYXRoID0gam9pbihmb2xkZXJQYXRoLCAnbmV3RmlsZS50eHQnKTtcblx0XHRhd2FpdCBiYXNpY0NydWRUZXN0KGZpbGVQYXRoKTtcblxuXHRcdGlmICghcmV1c2VFeGlzdGluZ1dhdGNoZXIpIHtcblx0XHRcdG9uRGlkV2F0Y2hGYWlsID0gRXZlbnQudG9Qcm9taXNlKHdhdGNoZXIub25XYXRjaEZhaWwpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZXMucm0oZm9sZGVyUGF0aCk7XG5cdFx0XHRhd2FpdCBvbkRpZFdhdGNoRmFpbDtcblxuXHRcdFx0Y2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBmb2xkZXJQYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0XHRvbkRpZFdhdGNoID0gRXZlbnQudG9Qcm9taXNlKHdhdGNoZXIub25EaWRXYXRjaCk7XG5cdFx0XHRhd2FpdCBwcm9taXNlcy5ta2Rpcihmb2xkZXJQYXRoKTtcblx0XHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblx0XHRcdGF3YWl0IG9uRGlkV2F0Y2g7XG5cblx0XHRcdGF3YWl0IGJhc2ljQ3J1ZFRlc3QoZmlsZVBhdGgpO1xuXHRcdH1cblx0fVxuXG5cdCghaXNNYWNpbnRvc2ggLyogTGludXgvV2luZG93czogdGltZXMgb3V0IGZvciBzb21lIHJlYXNvbiAqLyA/IHRlc3Quc2tpcCA6IHRlc3QpKCd3YXRjaCByZXF1ZXN0cyBzdXBwb3J0IHN1c3BlbmQvcmVzdW1lIChmb2xkZXIsIGV4aXN0IGluIGJlZ2lubmluZywgbm90IHJldXNpbmcgd2F0Y2hlciknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdFdhdGNoRm9sZGVyRXhpc3RzKGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnd2F0Y2ggcmVxdWVzdHMgc3VwcG9ydCBzdXNwZW5kL3Jlc3VtZSAoZm9sZGVyLCBleGlzdCBpbiBiZWdpbm5pbmcsIHJldXNpbmcgd2F0Y2hlciknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdFdhdGNoRm9sZGVyRXhpc3RzKHRydWUpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0V2F0Y2hGb2xkZXJFeGlzdHMocmV1c2VFeGlzdGluZ1dhdGNoZXI6IGJvb2xlYW4pIHtcblx0XHRjb25zdCBmb2xkZXJQYXRoID0gam9pbih0ZXN0RGlyLCAnZGVlcCcpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdHM6IElSZWN1cnNpdmVXYXRjaFJlcXVlc3RbXSA9IFt7IHBhdGg6IGZvbGRlclBhdGgsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlIH1dO1xuXHRcdGlmIChyZXVzZUV4aXN0aW5nV2F0Y2hlcikge1xuXHRcdFx0cmVxdWVzdHMucHVzaCh7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdH1cblxuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2gocmVxdWVzdHMpO1xuXG5cdFx0Y29uc3QgZmlsZVBhdGggPSBqb2luKGZvbGRlclBhdGgsICduZXdGaWxlLnR4dCcpO1xuXHRcdGF3YWl0IGJhc2ljQ3J1ZFRlc3QoZmlsZVBhdGgpO1xuXG5cdFx0aWYgKCFyZXVzZUV4aXN0aW5nV2F0Y2hlcikge1xuXHRcdFx0Y29uc3Qgb25EaWRXYXRjaEZhaWwgPSBFdmVudC50b1Byb21pc2Uod2F0Y2hlci5vbldhdGNoRmFpbCk7XG5cdFx0XHRhd2FpdCBQcm9taXNlcy5ybShmb2xkZXJQYXRoKTtcblx0XHRcdGF3YWl0IG9uRGlkV2F0Y2hGYWlsO1xuXG5cdFx0XHRjb25zdCBjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGZvbGRlclBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRcdGNvbnN0IG9uRGlkV2F0Y2ggPSBFdmVudC50b1Byb21pc2Uod2F0Y2hlci5vbkRpZFdhdGNoKTtcblx0XHRcdGF3YWl0IHByb21pc2VzLm1rZGlyKGZvbGRlclBhdGgpO1xuXHRcdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXHRcdFx0YXdhaXQgb25EaWRXYXRjaDtcblxuXHRcdFx0YXdhaXQgYmFzaWNDcnVkVGVzdChmaWxlUGF0aCk7XG5cdFx0fVxuXHR9XG5cblx0dGVzdCgnd2F0Y2ggcmVxdWVzdCByZXVzZXMgYW5vdGhlciByZWN1cnNpdmUgd2F0Y2hlciBldmVuIHdoZW4gcmVxdWVzdHMgYXJlIGNvbWluZyBpbiBhdCB0aGUgc2FtZSB0aW1lJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZvbGRlclBhdGgxID0gam9pbih0ZXN0RGlyLCAnZGVlcCcsICdub3QtZXhpc3RpbmcxJyk7XG5cdFx0Y29uc3QgZm9sZGVyUGF0aDIgPSBqb2luKHRlc3REaXIsICdkZWVwJywgJ25vdC1leGlzdGluZzInKTtcblx0XHRjb25zdCBmb2xkZXJQYXRoMyA9IGpvaW4odGVzdERpciwgJ25vdC1leGlzdGluZzMnKTtcblxuXHRcdGNvbnN0IHJlcXVlc3RzOiBJUmVjdXJzaXZlV2F0Y2hSZXF1ZXN0W10gPSBbXG5cdFx0XHR7IHBhdGg6IGZvbGRlclBhdGgxLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogdHJ1ZSwgY29ycmVsYXRpb25JZDogMSB9LFxuXHRcdFx0eyBwYXRoOiBmb2xkZXJQYXRoMiwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IHRydWUsIGNvcnJlbGF0aW9uSWQ6IDIgfSxcblx0XHRcdHsgcGF0aDogZm9sZGVyUGF0aDMsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlLCBjb3JyZWxhdGlvbklkOiAzIH0sXG5cdFx0XHR7IHBhdGg6IGpvaW4odGVzdERpciwgJ2RlZXAnKSwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IHRydWUgfVxuXHRcdF07XG5cblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKHJlcXVlc3RzKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXRjaGVyLmlzU3VzcGVuZGVkKHJlcXVlc3RzWzBdKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhdGNoZXIuaXNTdXNwZW5kZWQocmVxdWVzdHNbMV0pLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2F0Y2hlci5pc1N1c3BlbmRlZChyZXF1ZXN0c1syXSksICdwb2xsaW5nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhdGNoZXIuaXNTdXNwZW5kZWQocmVxdWVzdHNbM10pLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V2ZW50IHR5cGUgZmlsdGVyJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlcXVlc3QgPSB7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlLCBmaWx0ZXI6IEZpbGVDaGFuZ2VGaWx0ZXIuQURERUQgfCBGaWxlQ2hhbmdlRmlsdGVyLkRFTEVURUQsIGNvcnJlbGF0aW9uSWQ6IDEgfTtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFtyZXF1ZXN0XSk7XG5cblx0XHQvLyBDaGFuZ2UgZmlsZVxuXHRcdGNvbnN0IGZpbGVQYXRoID0gam9pbih0ZXN0RGlyLCAnbG9yZW0tbmV3ZmlsZS50eHQnKTtcblx0XHRsZXQgY2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBmaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQsIHVuZGVmaW5lZCwgMSk7XG5cdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKGZpbGVQYXRoLCAnSGVsbG8gQ2hhbmdlJyk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXG5cdFx0Ly8gRGVsZXRlIGZpbGVcblx0XHRjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVELCB1bmRlZmluZWQsIDEpO1xuXHRcdGF3YWl0IHByb21pc2VzLnVubGluayhmaWxlUGF0aCk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXHR9KTtcblxuXHQoaXNMaW51eCA/IHRlc3Quc2tpcCA6IHRlc3QpKCdpbmNsdWRlcyBhcmUgY2FzZSBpbnNlbnNpdGl2ZSBvbiBXaW5kb3dzL01hYycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgaW5jbHVkZXM6IFsnKiovKi5UWFQnXSwgcmVjdXJzaXZlOiB0cnVlIH1dKTtcblxuXHRcdC8vIE5ldyBmaWxlIChtYXRjaGVzICouVFhUIGNhc2UtaW5zZW5zaXRpdmVseSlcblx0XHRjb25zdCBuZXdGaWxlUGF0aCA9IGpvaW4odGVzdERpciwgJ2RlZXAnLCAnbmV3RmlsZS50eHQnKTtcblx0XHRsZXQgY2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShuZXdGaWxlUGF0aCwgJ0hlbGxvIFdvcmxkJyk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXG5cdFx0Ly8gQ2hhbmdlIGZpbGVcblx0XHRjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKTtcblx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUobmV3RmlsZVBhdGgsICdIZWxsbyBDaGFuZ2UnKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cblx0XHQvLyBEZWxldGUgZmlsZVxuXHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpO1xuXHRcdGF3YWl0IHByb21pc2VzLnVubGluayhuZXdGaWxlUGF0aCk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXHR9KTtcblxuXHQoaXNMaW51eCA/IHRlc3Quc2tpcCA6IHRlc3QpKCdpbmNsdWRlcyBhcmUgY2FzZSBpbnNlbnNpdGl2ZSBvbiBXaW5kb3dzL01hYycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgaW5jbHVkZXM6IFsnKiovKi5UWFQnXSwgcmVjdXJzaXZlOiB0cnVlIH1dKTtcblxuXHRcdC8vIE5ldyBmaWxlIChtYXRjaGVzICouVFhUIGNhc2UtaW5zZW5zaXRpdmVseSlcblx0XHRjb25zdCBuZXdGaWxlUGF0aCA9IGpvaW4odGVzdERpciwgJ2RlZXAnLCAnbmV3RmlsZS50eHQnKTtcblx0XHRsZXQgY2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShuZXdGaWxlUGF0aCwgJ0hlbGxvIFdvcmxkJyk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXG5cdFx0Ly8gQ2hhbmdlIGZpbGVcblx0XHRjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKTtcblx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUobmV3RmlsZVBhdGgsICdIZWxsbyBDaGFuZ2UnKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cblx0XHQvLyBEZWxldGUgZmlsZVxuXHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpO1xuXHRcdGF3YWl0IHByb21pc2VzLnVubGluayhuZXdGaWxlUGF0aCk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXHR9KTtcblxuXHQoaXNMaW51eCA/IHRlc3Quc2tpcCA6IHRlc3QpKCdleGNsdWRlcyBhcmUgY2FzZSBpbnNlbnNpdGl2ZSBvbiBXaW5kb3dzL01hYycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbJyoqL0RFRVAvKionXSwgcmVjdXJzaXZlOiB0cnVlIH1dKTtcblxuXHRcdC8vIE5ldyBmaWxlIGluIGV4Y2x1ZGVkIGZvbGRlciAoc2hvdWxkIG5vdCB0cmlnZ2VyIGV2ZW50KVxuXHRcdGNvbnN0IG5ld1RleHRGaWxlUGF0aCA9IGpvaW4odGVzdERpciwgJ2RlZXAnLCAnbmV3RmlsZS50eHQnKTtcblx0XHRjb25zdCBjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld1RleHRGaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShuZXdUZXh0RmlsZVBhdGgsICdIZWxsbyBXb3JsZCcpO1xuXG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgUHJvbWlzZS5hbnkoW1xuXHRcdFx0dGltZW91dCg1MDApLnRoZW4oKCkgPT4gdHJ1ZSksXG5cdFx0XHRjaGFuZ2VGdXR1cmUudGhlbigoKSA9PiBmYWxzZSlcblx0XHRdKTtcblxuXHRcdGlmICghcmVzKSB7XG5cdFx0XHRhc3NlcnQuZmFpbCgnVW5leHBlY3RlZCBjaGFuZ2UgZXZlbnQnKTtcblx0XHR9XG5cdH0pO1xuXG5cdChpc0xpbnV4ID8gdGVzdC5za2lwIDogdGVzdCkoJ2V4Y2x1ZGVzIGFyZSBjYXNlIGluc2Vuc2l0aXZlIG9uIFdpbmRvd3MvTWFjJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFsnKiovREVFUC8qKiddLCByZWN1cnNpdmU6IHRydWUgfV0pO1xuXG5cdFx0Ly8gTmV3IGZpbGUgaW4gZXhjbHVkZWQgZm9sZGVyIChzaG91bGQgbm90IHRyaWdnZXIgZXZlbnQpXG5cdFx0Y29uc3QgbmV3VGV4dEZpbGVQYXRoID0gam9pbih0ZXN0RGlyLCAnZGVlcCcsICduZXdGaWxlLnR4dCcpO1xuXHRcdGNvbnN0IGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3VGV4dEZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKG5ld1RleHRGaWxlUGF0aCwgJ0hlbGxvIFdvcmxkJyk7XG5cblx0XHRjb25zdCByZXMgPSBhd2FpdCBQcm9taXNlLmFueShbXG5cdFx0XHR0aW1lb3V0KDUwMCkudGhlbigoKSA9PiB0cnVlKSxcblx0XHRcdGNoYW5nZUZ1dHVyZS50aGVuKCgpID0+IGZhbHNlKVxuXHRcdF0pO1xuXG5cdFx0aWYgKCFyZXMpIHtcblx0XHRcdGFzc2VydC5mYWlsKCdVbmV4cGVjdGVkIGNoYW5nZSBldmVudCcpO1xuXHRcdH1cblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGNBQWMsZ0JBQWdCO0FBQ3ZDLFNBQVMsY0FBYztBQUN2QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLFlBQVk7QUFDOUIsU0FBUyxTQUFTLGFBQWEsaUJBQWlCO0FBQ2hELFNBQVMsVUFBVSxrQkFBa0I7QUFDckMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQkFBa0Isc0JBQW1DO0FBQzlELFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsYUFBYTtBQUN0QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyx1QkFBdUI7QUFFekIsTUFBTSwwQkFBMEIsY0FBYztBQUFBLEVBQTlDO0FBQUE7QUFFTixTQUE0Qix1Q0FBdUM7QUFFbkUsU0FBaUIsY0FBYyxLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDakUsU0FBUyxhQUFhLEtBQUssWUFBWTtBQUV2QyxTQUFTLGNBQWMsS0FBSyxnQkFBZ0I7QUFBQTtBQUFBLEVBRTVDLE1BQU0sNEJBQTRCLE9BQWlCLFdBQXFCLENBQUMsR0FBc0I7QUFHOUYsVUFBTSxXQUFxQyxNQUFNLElBQUksVUFBUTtBQUM1RCxhQUFPLEVBQUUsTUFBTSxVQUFVLFdBQVcsS0FBSztBQUFBLElBQzFDLENBQUM7QUFFRCxZQUFRLE1BQU0sS0FBSztBQUFBLE1BQXdCO0FBQUEsTUFBVTtBQUFBO0FBQUEsSUFBNEMsR0FBRyxJQUFJLGFBQVcsUUFBUSxJQUFJO0FBQUEsRUFDaEk7QUFB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
