import assert from "assert";
import { Event, Emitter } from "../../../../../base/common/event.js";
import { URI } from "../../../../../base/common/uri.js";
import { StoredFileWorkingCopy, StoredFileWorkingCopyState, isStoredFileWorkingCopySaveEvent } from "../../common/storedFileWorkingCopy.js";
import { bufferToStream, newWriteableBufferStream, streamToBuffer, VSBuffer } from "../../../../../base/common/buffer.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { getLastResolvedFileStat, TestServiceAccessor, workbenchInstantiationService } from "../../../../test/browser/workbenchTestServices.js";
import { basename } from "../../../../../base/common/resources.js";
import { FileChangesEvent, FileChangeType, FileOperationError, FileOperationResult, NotModifiedSinceFileOperationError } from "../../../../../platform/files/common/files.js";
import { SaveReason, SaveSourceRegistry } from "../../../../common/editor.js";
import { Promises, timeout } from "../../../../../base/common/async.js";
import { consumeReadable, consumeStream, isReadableStream } from "../../../../../base/common/stream.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { assertReturnsDefined } from "../../../../../base/common/types.js";
class TestStoredFileWorkingCopyModel extends Disposable {
  constructor(resource, contents) {
    super();
    this.resource = resource;
    this.contents = contents;
    this._onDidChangeContent = this._register(new Emitter());
    this.onDidChangeContent = this._onDidChangeContent.event;
    this._onWillDispose = this._register(new Emitter());
    this.onWillDispose = this._onWillDispose.event;
    this.throwOnSnapshot = false;
    this.versionId = 0;
    this.pushedStackElement = false;
  }
  fireContentChangeEvent(event) {
    this._onDidChangeContent.fire(event);
  }
  updateContents(newContents) {
    this.doUpdate(newContents);
  }
  setThrowOnSnapshot() {
    this.throwOnSnapshot = true;
  }
  async snapshot(context, token) {
    if (this.throwOnSnapshot) {
      throw new Error("Fail");
    }
    const stream = newWriteableBufferStream();
    stream.end(VSBuffer.fromString(this.contents));
    return stream;
  }
  async update(contents, token) {
    this.doUpdate((await streamToBuffer(contents)).toString());
  }
  doUpdate(newContents) {
    this.contents = newContents;
    this.versionId++;
    this._onDidChangeContent.fire({ isRedoing: false, isUndoing: false });
  }
  pushStackElement() {
    this.pushedStackElement = true;
  }
  dispose() {
    this._onWillDispose.fire();
    super.dispose();
  }
}
class TestStoredFileWorkingCopyModelWithCustomSave extends TestStoredFileWorkingCopyModel {
  constructor() {
    super(...arguments);
    this.saveCounter = 0;
    this.throwOnSave = false;
    this.saveOperation = void 0;
  }
  async save(options, token) {
    if (this.throwOnSave) {
      throw new Error("Fail");
    }
    if (this.saveOperation) {
      await this.saveOperation;
    }
    if (token.isCancellationRequested) {
      throw new Error("Canceled");
    }
    this.saveCounter++;
    return {
      resource: this.resource,
      ctime: 0,
      etag: "",
      isDirectory: false,
      isFile: true,
      mtime: 0,
      name: "resource2",
      size: 0,
      isSymbolicLink: false,
      readonly: false,
      locked: false,
      executable: false,
      children: void 0
    };
  }
}
class TestStoredFileWorkingCopyModelFactory {
  async createModel(resource, contents, token) {
    return new TestStoredFileWorkingCopyModel(resource, (await streamToBuffer(contents)).toString());
  }
}
class TestStoredFileWorkingCopyModelWithCustomSaveFactory {
  async createModel(resource, contents, token) {
    return new TestStoredFileWorkingCopyModelWithCustomSave(resource, (await streamToBuffer(contents)).toString());
  }
}
suite("StoredFileWorkingCopy (with custom save)", function() {
  const factory = new TestStoredFileWorkingCopyModelWithCustomSaveFactory();
  const disposables = new DisposableStore();
  let instantiationService;
  let accessor;
  let workingCopy;
  setup(() => {
    instantiationService = workbenchInstantiationService(void 0, disposables);
    accessor = instantiationService.createInstance(TestServiceAccessor);
    const resource = URI.file("test/resource");
    workingCopy = disposables.add(new StoredFileWorkingCopy("testStoredFileWorkingCopyType", resource, basename(resource), factory, (options) => workingCopy.resolve(options), accessor.fileService, accessor.logService, accessor.workingCopyFileService, accessor.filesConfigurationService, accessor.workingCopyBackupService, accessor.workingCopyService, accessor.notificationService, accessor.workingCopyEditorService, accessor.editorService, accessor.elevatedFileService, accessor.progressService));
  });
  teardown(() => {
    disposables.clear();
  });
  test("save (custom implemented)", async () => {
    let savedCounter = 0;
    let lastSaveEvent = void 0;
    disposables.add(workingCopy.onDidSave((e) => {
      savedCounter++;
      lastSaveEvent = e;
    }));
    let saveErrorCounter = 0;
    disposables.add(workingCopy.onDidSaveError(() => {
      saveErrorCounter++;
    }));
    await workingCopy.save();
    assert.strictEqual(savedCounter, 0);
    assert.strictEqual(saveErrorCounter, 0);
    await workingCopy.resolve();
    workingCopy.model?.updateContents("hello save");
    await workingCopy.save();
    assert.strictEqual(savedCounter, 1);
    assert.strictEqual(saveErrorCounter, 0);
    assert.strictEqual(workingCopy.isDirty(), false);
    assert.strictEqual(lastSaveEvent.reason, SaveReason.EXPLICIT);
    assert.ok(lastSaveEvent.stat);
    assert.ok(isStoredFileWorkingCopySaveEvent(lastSaveEvent));
    assert.strictEqual(workingCopy.model?.pushedStackElement, true);
    assert.strictEqual(workingCopy.model.saveCounter, 1);
    workingCopy.model?.updateContents("hello save error");
    workingCopy.model.throwOnSave = true;
    await workingCopy.save();
    assert.strictEqual(saveErrorCounter, 1);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ERROR), true);
  });
  test("save cancelled (custom implemented)", async () => {
    let savedCounter = 0;
    let lastSaveEvent = void 0;
    disposables.add(workingCopy.onDidSave((e) => {
      savedCounter++;
      lastSaveEvent = e;
    }));
    let saveErrorCounter = 0;
    disposables.add(workingCopy.onDidSaveError(() => {
      saveErrorCounter++;
    }));
    await workingCopy.resolve();
    let resolve;
    workingCopy.model.saveOperation = new Promise((r) => resolve = r);
    workingCopy.model?.updateContents("first");
    const firstSave = workingCopy.save();
    workingCopy.model?.updateContents("second");
    const secondSave = workingCopy.save();
    resolve();
    await firstSave;
    await secondSave;
    assert.strictEqual(savedCounter, 1);
    assert.strictEqual(saveErrorCounter, 0);
    assert.strictEqual(workingCopy.isDirty(), false);
    assert.strictEqual(lastSaveEvent.reason, SaveReason.EXPLICIT);
    assert.ok(lastSaveEvent.stat);
    assert.ok(isStoredFileWorkingCopySaveEvent(lastSaveEvent));
    assert.strictEqual(workingCopy.model?.pushedStackElement, true);
    assert.strictEqual(workingCopy.model.saveCounter, 1);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
suite("StoredFileWorkingCopy", function() {
  const factory = new TestStoredFileWorkingCopyModelFactory();
  const disposables = new DisposableStore();
  const resource = URI.file("test/resource");
  let instantiationService;
  let accessor;
  let workingCopy;
  function createWorkingCopy(uri = resource) {
    const workingCopy2 = new StoredFileWorkingCopy("testStoredFileWorkingCopyType", uri, basename(uri), factory, (options) => workingCopy2.resolve(options), accessor.fileService, accessor.logService, accessor.workingCopyFileService, accessor.filesConfigurationService, accessor.workingCopyBackupService, accessor.workingCopyService, accessor.notificationService, accessor.workingCopyEditorService, accessor.editorService, accessor.elevatedFileService, accessor.progressService);
    return workingCopy2;
  }
  setup(() => {
    instantiationService = workbenchInstantiationService(void 0, disposables);
    accessor = instantiationService.createInstance(TestServiceAccessor);
    workingCopy = disposables.add(createWorkingCopy());
  });
  teardown(() => {
    workingCopy.dispose();
    for (const workingCopy2 of accessor.workingCopyService.workingCopies) {
      workingCopy2.dispose();
    }
    disposables.clear();
  });
  test("registers with working copy service", async () => {
    assert.strictEqual(accessor.workingCopyService.workingCopies.length, 1);
    workingCopy.dispose();
    assert.strictEqual(accessor.workingCopyService.workingCopies.length, 0);
  });
  test("orphaned tracking", async () => {
    return runWithFakedTimers({}, async () => {
      assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN), false);
      let onDidChangeOrphanedPromise = Event.toPromise(workingCopy.onDidChangeOrphaned);
      accessor.fileService.notExistsSet.set(resource, true);
      accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: FileChangeType.DELETED }], false));
      await onDidChangeOrphanedPromise;
      assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN), true);
      onDidChangeOrphanedPromise = Event.toPromise(workingCopy.onDidChangeOrphaned);
      accessor.fileService.notExistsSet.delete(resource);
      accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: FileChangeType.ADDED }], false));
      await onDidChangeOrphanedPromise;
      assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN), false);
    });
  });
  test("dirty / modified", async () => {
    assert.strictEqual(workingCopy.isModified(), false);
    assert.strictEqual(workingCopy.isDirty(), false);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.DIRTY), false);
    await workingCopy.resolve();
    assert.strictEqual(workingCopy.isResolved(), true);
    let changeDirtyCounter = 0;
    disposables.add(workingCopy.onDidChangeDirty(() => {
      changeDirtyCounter++;
    }));
    let contentChangeCounter = 0;
    disposables.add(workingCopy.onDidChangeContent(() => {
      contentChangeCounter++;
    }));
    let savedCounter = 0;
    disposables.add(workingCopy.onDidSave(() => {
      savedCounter++;
    }));
    workingCopy.model?.updateContents("hello dirty");
    assert.strictEqual(contentChangeCounter, 1);
    assert.strictEqual(workingCopy.isModified(), true);
    assert.strictEqual(workingCopy.isDirty(), true);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.DIRTY), true);
    assert.strictEqual(changeDirtyCounter, 1);
    await workingCopy.save();
    assert.strictEqual(workingCopy.isModified(), false);
    assert.strictEqual(workingCopy.isDirty(), false);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.DIRTY), false);
    assert.strictEqual(changeDirtyCounter, 2);
    assert.strictEqual(savedCounter, 1);
    await workingCopy.resolve({ contents: bufferToStream(VSBuffer.fromString("hello dirty stream")) });
    assert.strictEqual(contentChangeCounter, 2);
    assert.strictEqual(workingCopy.isModified(), true);
    assert.strictEqual(workingCopy.isDirty(), true);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.DIRTY), true);
    assert.strictEqual(changeDirtyCounter, 3);
    await workingCopy.revert({ soft: true });
    assert.strictEqual(workingCopy.isModified(), false);
    assert.strictEqual(workingCopy.isDirty(), false);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.DIRTY), false);
    assert.strictEqual(changeDirtyCounter, 4);
    workingCopy.markModified();
    assert.strictEqual(workingCopy.isModified(), true);
    assert.strictEqual(workingCopy.isDirty(), true);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.DIRTY), true);
    assert.strictEqual(changeDirtyCounter, 5);
    await workingCopy.revert();
    assert.strictEqual(workingCopy.isModified(), false);
    assert.strictEqual(workingCopy.isDirty(), false);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.DIRTY), false);
    assert.strictEqual(changeDirtyCounter, 6);
  });
  test("dirty - working copy marks non-dirty when undo reaches saved version ID", async () => {
    await workingCopy.resolve();
    workingCopy.model?.updateContents("hello saved state");
    await workingCopy.save();
    assert.strictEqual(workingCopy.isDirty(), false);
    workingCopy.model?.updateContents("changing content once");
    assert.strictEqual(workingCopy.isDirty(), true);
    workingCopy.model.versionId--;
    workingCopy.model?.fireContentChangeEvent({ isRedoing: false, isUndoing: true });
    assert.strictEqual(workingCopy.isDirty(), false);
  });
  test("resolve (without backup)", async () => {
    let onDidResolveCounter = 0;
    disposables.add(workingCopy.onDidResolve(() => {
      onDidResolveCounter++;
    }));
    await workingCopy.resolve();
    assert.strictEqual(workingCopy.isResolved(), true);
    assert.strictEqual(onDidResolveCounter, 1);
    assert.strictEqual(workingCopy.model?.contents, "Hello Html");
    workingCopy.model?.updateContents("hello resolve");
    assert.strictEqual(workingCopy.isDirty(), true);
    await workingCopy.resolve();
    assert.strictEqual(onDidResolveCounter, 1);
    assert.strictEqual(workingCopy.model?.contents, "hello resolve");
    await workingCopy.resolve({ contents: bufferToStream(VSBuffer.fromString("hello initial contents")) });
    assert.strictEqual(workingCopy.isDirty(), true);
    assert.strictEqual(workingCopy.model?.contents, "hello initial contents");
    assert.strictEqual(onDidResolveCounter, 2);
    const pendingSave = workingCopy.save();
    await workingCopy.resolve();
    await pendingSave;
    assert.strictEqual(workingCopy.isDirty(), false);
    assert.strictEqual(workingCopy.model?.contents, "hello initial contents");
    assert.strictEqual(onDidResolveCounter, 2);
    workingCopy.dispose();
    await workingCopy.resolve();
    assert.strictEqual(workingCopy.isDisposed(), true);
    assert.strictEqual(onDidResolveCounter, 2);
  });
  test("resolve (with backup)", async () => {
    await workingCopy.resolve({ contents: bufferToStream(VSBuffer.fromString("hello backup")) });
    const backup = await workingCopy.backup(CancellationToken.None);
    await accessor.workingCopyBackupService.backup(workingCopy, backup.content, void 0, backup.meta);
    assert.strictEqual(accessor.workingCopyBackupService.hasBackupSync(workingCopy), true);
    workingCopy.dispose();
    workingCopy = createWorkingCopy();
    await workingCopy.resolve();
    assert.strictEqual(workingCopy.isDirty(), true);
    assert.strictEqual(workingCopy.isReadonly(), false);
    assert.strictEqual(workingCopy.model?.contents, "hello backup");
    workingCopy.model.updateContents("hello updated");
    await workingCopy.save();
    await workingCopy.resolve();
    assert.strictEqual(workingCopy.isDirty(), false);
    assert.strictEqual(workingCopy.model?.contents, "Hello Html");
  });
  test("resolve (with backup, preserves metadata and orphaned state)", async () => {
    return runWithFakedTimers({}, async () => {
      await workingCopy.resolve({ contents: bufferToStream(VSBuffer.fromString("hello backup")) });
      const orphanedPromise = Event.toPromise(workingCopy.onDidChangeOrphaned);
      accessor.fileService.notExistsSet.set(resource, true);
      accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: FileChangeType.DELETED }], false));
      await orphanedPromise;
      assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN), true);
      const backup = await workingCopy.backup(CancellationToken.None);
      await accessor.workingCopyBackupService.backup(workingCopy, backup.content, void 0, backup.meta);
      assert.strictEqual(accessor.workingCopyBackupService.hasBackupSync(workingCopy), true);
      workingCopy.dispose();
      workingCopy = createWorkingCopy();
      await workingCopy.resolve();
      assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN), true);
      const backup2 = await workingCopy.backup(CancellationToken.None);
      assert.deepStrictEqual(backup.meta, backup2.meta);
    });
  });
  test("resolve (updates orphaned state accordingly)", async () => {
    return runWithFakedTimers({}, async () => {
      await workingCopy.resolve();
      const orphanedPromise = Event.toPromise(workingCopy.onDidChangeOrphaned);
      accessor.fileService.notExistsSet.set(resource, true);
      accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: FileChangeType.DELETED }], false));
      await orphanedPromise;
      assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN), true);
      accessor.fileService.notExistsSet.delete(resource);
      await workingCopy.resolve({ forceReadFromFile: true });
      assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN), false);
      try {
        accessor.fileService.readShouldThrowError = new FileOperationError("file not found", FileOperationResult.FILE_NOT_FOUND);
        await workingCopy.resolve();
        assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN), true);
      } finally {
        accessor.fileService.readShouldThrowError = void 0;
      }
    });
  });
  test("stat.readonly and stat.locked can change when decreased mtime is ignored", async function() {
    await workingCopy.resolve();
    const stat = assertReturnsDefined(getLastResolvedFileStat(workingCopy));
    try {
      accessor.fileService.readShouldThrowError = new NotModifiedSinceFileOperationError("error", { ...stat, mtime: stat.mtime - 1, readonly: !stat.readonly, locked: !stat.locked });
      await workingCopy.resolve();
    } finally {
      accessor.fileService.readShouldThrowError = void 0;
    }
    assert.strictEqual(getLastResolvedFileStat(workingCopy)?.mtime, stat.mtime, "mtime should not decrease");
    assert.notStrictEqual(getLastResolvedFileStat(workingCopy)?.readonly, stat.readonly, "readonly should have changed despite simultaneous attempt to decrease mtime");
    assert.notStrictEqual(getLastResolvedFileStat(workingCopy)?.locked, stat.locked, "locked should have changed despite simultaneous attempt to decrease mtime");
  });
  test("resolve (FILE_NOT_MODIFIED_SINCE can be handled for resolved working copies)", async () => {
    await workingCopy.resolve();
    try {
      accessor.fileService.readShouldThrowError = new FileOperationError("file not modified since", FileOperationResult.FILE_NOT_MODIFIED_SINCE);
      await workingCopy.resolve();
    } finally {
      accessor.fileService.readShouldThrowError = void 0;
    }
    assert.strictEqual(workingCopy.model?.contents, "Hello Html");
  });
  test("resolve (FILE_NOT_MODIFIED_SINCE still updates readonly state)", async () => {
    let readonlyChangeCounter = 0;
    disposables.add(workingCopy.onDidChangeReadonly(() => readonlyChangeCounter++));
    await workingCopy.resolve();
    assert.strictEqual(workingCopy.isReadonly(), false);
    const stat = await accessor.fileService.resolve(workingCopy.resource, { resolveMetadata: true });
    try {
      accessor.fileService.readShouldThrowError = new NotModifiedSinceFileOperationError("file not modified since", { ...stat, readonly: true });
      await workingCopy.resolve();
    } finally {
      accessor.fileService.readShouldThrowError = void 0;
    }
    assert.strictEqual(!!workingCopy.isReadonly(), true);
    assert.strictEqual(readonlyChangeCounter, 1);
    try {
      accessor.fileService.readShouldThrowError = new NotModifiedSinceFileOperationError("file not modified since", { ...stat, readonly: false });
      await workingCopy.resolve();
    } finally {
      accessor.fileService.readShouldThrowError = void 0;
    }
    assert.strictEqual(workingCopy.isReadonly(), false);
    assert.strictEqual(readonlyChangeCounter, 2);
  });
  test("resolve does not alter content when model content changed in parallel", async () => {
    await workingCopy.resolve();
    const resolvePromise = workingCopy.resolve();
    workingCopy.model?.updateContents("changed content");
    await resolvePromise;
    assert.strictEqual(workingCopy.isDirty(), true);
    assert.strictEqual(workingCopy.model?.contents, "changed content");
  });
  test("backup", async () => {
    await workingCopy.resolve();
    workingCopy.model?.updateContents("hello backup");
    const backup = await workingCopy.backup(CancellationToken.None);
    assert.ok(backup.meta);
    let backupContents = void 0;
    if (backup.content instanceof VSBuffer) {
      backupContents = backup.content.toString();
    } else if (isReadableStream(backup.content)) {
      backupContents = (await consumeStream(backup.content, (chunks) => VSBuffer.concat(chunks))).toString();
    } else if (backup.content) {
      backupContents = consumeReadable(backup.content, (chunks) => VSBuffer.concat(chunks)).toString();
    }
    assert.strictEqual(backupContents, "hello backup");
  });
  test("save (no errors) - simple", async () => {
    let savedCounter = 0;
    let lastSaveEvent = void 0;
    disposables.add(workingCopy.onDidSave((e) => {
      savedCounter++;
      lastSaveEvent = e;
    }));
    let saveErrorCounter = 0;
    disposables.add(workingCopy.onDidSaveError(() => {
      saveErrorCounter++;
    }));
    await workingCopy.save();
    assert.strictEqual(savedCounter, 0);
    assert.strictEqual(saveErrorCounter, 0);
    await workingCopy.resolve();
    workingCopy.model?.updateContents("hello save");
    await workingCopy.save();
    assert.strictEqual(savedCounter, 1);
    assert.strictEqual(saveErrorCounter, 0);
    assert.strictEqual(workingCopy.isDirty(), false);
    assert.strictEqual(lastSaveEvent.reason, SaveReason.EXPLICIT);
    assert.ok(lastSaveEvent.stat);
    assert.ok(isStoredFileWorkingCopySaveEvent(lastSaveEvent));
    assert.strictEqual(workingCopy.model?.pushedStackElement, true);
  });
  test("save (no errors) - save reason", async () => {
    let savedCounter = 0;
    let lastSaveEvent = void 0;
    disposables.add(workingCopy.onDidSave((e) => {
      savedCounter++;
      lastSaveEvent = e;
    }));
    let saveErrorCounter = 0;
    disposables.add(workingCopy.onDidSaveError(() => {
      saveErrorCounter++;
    }));
    await workingCopy.resolve();
    workingCopy.model?.updateContents("hello save");
    const source = SaveSourceRegistry.registerSource("testSource", "Hello Save");
    await workingCopy.save({ reason: SaveReason.AUTO, source });
    assert.strictEqual(savedCounter, 1);
    assert.strictEqual(saveErrorCounter, 0);
    assert.strictEqual(workingCopy.isDirty(), false);
    assert.strictEqual(lastSaveEvent.reason, SaveReason.AUTO);
    assert.strictEqual(lastSaveEvent.source, source);
  });
  test("save (no errors) - multiple", async () => {
    let savedCounter = 0;
    disposables.add(workingCopy.onDidSave((e) => {
      savedCounter++;
    }));
    let saveErrorCounter = 0;
    disposables.add(workingCopy.onDidSaveError(() => {
      saveErrorCounter++;
    }));
    await workingCopy.resolve();
    workingCopy.model?.updateContents("hello save");
    await Promises.settled([
      workingCopy.save({ reason: SaveReason.AUTO }),
      workingCopy.save({ reason: SaveReason.EXPLICIT }),
      workingCopy.save({ reason: SaveReason.WINDOW_CHANGE })
    ]);
    assert.strictEqual(savedCounter, 1);
    assert.strictEqual(saveErrorCounter, 0);
    assert.strictEqual(workingCopy.isDirty(), false);
  });
  test("save (no errors) - multiple, cancellation", async () => {
    let savedCounter = 0;
    disposables.add(workingCopy.onDidSave((e) => {
      savedCounter++;
    }));
    let saveErrorCounter = 0;
    disposables.add(workingCopy.onDidSaveError(() => {
      saveErrorCounter++;
    }));
    await workingCopy.resolve();
    workingCopy.model?.updateContents("hello save");
    const firstSave = workingCopy.save();
    workingCopy.model?.updateContents("hello save more");
    const secondSave = workingCopy.save();
    await Promises.settled([firstSave, secondSave]);
    assert.strictEqual(savedCounter, 1);
    assert.strictEqual(saveErrorCounter, 0);
    assert.strictEqual(workingCopy.isDirty(), false);
  });
  test("save (no errors) - not forced but not dirty", async () => {
    let savedCounter = 0;
    disposables.add(workingCopy.onDidSave((e) => {
      savedCounter++;
    }));
    let saveErrorCounter = 0;
    disposables.add(workingCopy.onDidSaveError(() => {
      saveErrorCounter++;
    }));
    await workingCopy.resolve();
    await workingCopy.save();
    assert.strictEqual(savedCounter, 0);
    assert.strictEqual(saveErrorCounter, 0);
    assert.strictEqual(workingCopy.isDirty(), false);
  });
  test("save (no errors) - forced but not dirty", async () => {
    let savedCounter = 0;
    disposables.add(workingCopy.onDidSave((e) => {
      savedCounter++;
    }));
    let saveErrorCounter = 0;
    disposables.add(workingCopy.onDidSaveError(() => {
      saveErrorCounter++;
    }));
    await workingCopy.resolve();
    await workingCopy.save({ force: true });
    assert.strictEqual(savedCounter, 1);
    assert.strictEqual(saveErrorCounter, 0);
    assert.strictEqual(workingCopy.isDirty(), false);
  });
  test("save (no errors) - save clears orphaned", async () => {
    return runWithFakedTimers({}, async () => {
      let savedCounter = 0;
      disposables.add(workingCopy.onDidSave((e) => {
        savedCounter++;
      }));
      let saveErrorCounter = 0;
      disposables.add(workingCopy.onDidSaveError(() => {
        saveErrorCounter++;
      }));
      await workingCopy.resolve();
      const orphanedPromise = Event.toPromise(workingCopy.onDidChangeOrphaned);
      accessor.fileService.notExistsSet.set(resource, true);
      accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: FileChangeType.DELETED }], false));
      await orphanedPromise;
      assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN), true);
      await workingCopy.save({ force: true });
      assert.strictEqual(savedCounter, 1);
      assert.strictEqual(saveErrorCounter, 0);
      assert.strictEqual(workingCopy.isDirty(), false);
      assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN), false);
    });
  });
  test("save (errors)", async () => {
    let savedCounter = 0;
    disposables.add(workingCopy.onDidSave((reason) => {
      savedCounter++;
    }));
    let saveErrorCounter = 0;
    disposables.add(workingCopy.onDidSaveError(() => {
      saveErrorCounter++;
    }));
    await workingCopy.resolve();
    try {
      accessor.fileService.writeShouldThrowError = new FileOperationError("write error", FileOperationResult.FILE_PERMISSION_DENIED);
      await workingCopy.save({ force: true });
    } finally {
      accessor.fileService.writeShouldThrowError = void 0;
    }
    assert.strictEqual(savedCounter, 0);
    assert.strictEqual(saveErrorCounter, 1);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ERROR), true);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.SAVED), false);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.PENDING_SAVE), false);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.CONFLICT), false);
    assert.strictEqual(workingCopy.isDirty(), true);
    await workingCopy.save({ reason: SaveReason.AUTO });
    assert.strictEqual(savedCounter, 0);
    assert.strictEqual(saveErrorCounter, 1);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ERROR), true);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.SAVED), false);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.PENDING_SAVE), false);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.CONFLICT), false);
    assert.strictEqual(workingCopy.isDirty(), true);
    await workingCopy.save({ reason: SaveReason.EXPLICIT });
    assert.strictEqual(savedCounter, 1);
    assert.strictEqual(saveErrorCounter, 1);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ERROR), false);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.SAVED), true);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.PENDING_SAVE), false);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.CONFLICT), false);
    assert.strictEqual(workingCopy.isDirty(), false);
    try {
      accessor.fileService.writeShouldThrowError = new FileOperationError("write error conflict", FileOperationResult.FILE_MODIFIED_SINCE);
      await workingCopy.save({ force: true });
    } catch (error) {
    } finally {
      accessor.fileService.writeShouldThrowError = void 0;
    }
    assert.strictEqual(savedCounter, 1);
    assert.strictEqual(saveErrorCounter, 2);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ERROR), true);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.SAVED), false);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.PENDING_SAVE), false);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.CONFLICT), true);
    assert.strictEqual(workingCopy.isDirty(), true);
    await workingCopy.save({ reason: SaveReason.EXPLICIT });
    assert.strictEqual(savedCounter, 2);
    assert.strictEqual(saveErrorCounter, 2);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.ERROR), false);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.SAVED), true);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.PENDING_SAVE), false);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.CONFLICT), false);
    assert.strictEqual(workingCopy.isDirty(), false);
  });
  test("save (errors, bubbles up with `ignoreErrorHandler`)", async () => {
    await workingCopy.resolve();
    let error = void 0;
    try {
      accessor.fileService.writeShouldThrowError = new FileOperationError("write error", FileOperationResult.FILE_PERMISSION_DENIED);
      await workingCopy.save({ force: true, ignoreErrorHandler: true });
    } catch (e) {
      error = e;
    } finally {
      accessor.fileService.writeShouldThrowError = void 0;
    }
    assert.ok(error);
  });
  test("save - returns false when save fails", async function() {
    await workingCopy.resolve();
    try {
      accessor.fileService.writeShouldThrowError = new FileOperationError("write error", FileOperationResult.FILE_PERMISSION_DENIED);
      const res2 = await workingCopy.save({ force: true });
      assert.strictEqual(res2, false);
    } finally {
      accessor.fileService.writeShouldThrowError = void 0;
    }
    const res = await workingCopy.save({ force: true });
    assert.strictEqual(res, true);
  });
  test("save participant", async () => {
    await workingCopy.resolve();
    assert.strictEqual(accessor.workingCopyFileService.hasSaveParticipants, false);
    let participationCounter = 0;
    const disposable = accessor.workingCopyFileService.addSaveParticipant({
      participate: async (wc) => {
        if (workingCopy === wc) {
          participationCounter++;
        }
      }
    });
    assert.strictEqual(accessor.workingCopyFileService.hasSaveParticipants, true);
    await workingCopy.save({ force: true });
    assert.strictEqual(participationCounter, 1);
    await workingCopy.save({ force: true, skipSaveParticipants: true });
    assert.strictEqual(participationCounter, 1);
    disposable.dispose();
    assert.strictEqual(accessor.workingCopyFileService.hasSaveParticipants, false);
    await workingCopy.save({ force: true });
    assert.strictEqual(participationCounter, 1);
  });
  test("Save Participant, calling save from within is unsupported but does not explode (sync save)", async function() {
    await workingCopy.resolve();
    await testSaveFromSaveParticipant(workingCopy, false);
  });
  test("Save Participant, calling save from within is unsupported but does not explode (async save)", async function() {
    await workingCopy.resolve();
    await testSaveFromSaveParticipant(workingCopy, true);
  });
  async function testSaveFromSaveParticipant(workingCopy2, async) {
    const from = URI.file("testFrom");
    assert.strictEqual(accessor.workingCopyFileService.hasSaveParticipants, false);
    const disposable = accessor.workingCopyFileService.addSaveParticipant({
      participate: async (wc, context) => {
        if (async) {
          await timeout(10);
        }
        await workingCopy2.save({ force: true });
      }
    });
    assert.strictEqual(accessor.workingCopyFileService.hasSaveParticipants, true);
    await workingCopy2.save({ force: true, from });
    disposable.dispose();
  }
  test("Save Participant carries context", async function() {
    await workingCopy.resolve();
    const from = URI.file("testFrom");
    assert.strictEqual(accessor.workingCopyFileService.hasSaveParticipants, false);
    let e = void 0;
    const disposable = accessor.workingCopyFileService.addSaveParticipant({
      participate: async (wc, context) => {
        try {
          assert.strictEqual(context.reason, SaveReason.EXPLICIT);
          assert.strictEqual(context.savedFrom?.toString(), from.toString());
        } catch (error) {
          e = error;
        }
      }
    });
    assert.strictEqual(accessor.workingCopyFileService.hasSaveParticipants, true);
    await workingCopy.save({ force: true, from });
    if (e) {
      throw e;
    }
    disposable.dispose();
  });
  test("revert", async () => {
    await workingCopy.resolve();
    workingCopy.model?.updateContents("hello revert");
    let revertedCounter = 0;
    disposables.add(workingCopy.onDidRevert(() => {
      revertedCounter++;
    }));
    await workingCopy.revert({ soft: true });
    assert.strictEqual(revertedCounter, 1);
    assert.strictEqual(workingCopy.isDirty(), false);
    assert.strictEqual(workingCopy.model?.contents, "hello revert");
    await workingCopy.revert();
    assert.strictEqual(revertedCounter, 1);
    assert.strictEqual(workingCopy.model?.contents, "hello revert");
    await workingCopy.revert({ force: true });
    assert.strictEqual(revertedCounter, 2);
    assert.strictEqual(workingCopy.model?.contents, "Hello Html");
    try {
      workingCopy.model?.updateContents("hello revert");
      accessor.fileService.readShouldThrowError = new FileOperationError("error", FileOperationResult.FILE_PERMISSION_DENIED);
      await workingCopy.revert({ force: true });
    } catch (error) {
    } finally {
      accessor.fileService.readShouldThrowError = void 0;
    }
    assert.strictEqual(revertedCounter, 2);
    assert.strictEqual(workingCopy.isDirty(), true);
    try {
      workingCopy.model?.updateContents("hello revert");
      accessor.fileService.readShouldThrowError = new FileOperationError("error", FileOperationResult.FILE_NOT_FOUND);
      await workingCopy.revert({ force: true });
    } catch (error) {
    } finally {
      accessor.fileService.readShouldThrowError = void 0;
    }
    assert.strictEqual(revertedCounter, 3);
    assert.strictEqual(workingCopy.isDirty(), false);
  });
  test("state", async () => {
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.SAVED), true);
    await workingCopy.resolve({ contents: bufferToStream(VSBuffer.fromString("hello state")) });
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.DIRTY), true);
    const savePromise = workingCopy.save();
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.DIRTY), true);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.SAVED), false);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.PENDING_SAVE), true);
    await savePromise;
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.DIRTY), false);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.SAVED), true);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.PENDING_SAVE), false);
  });
  test("joinState", async () => {
    await workingCopy.resolve({ contents: bufferToStream(VSBuffer.fromString("hello state")) });
    workingCopy.save();
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.PENDING_SAVE), true);
    await workingCopy.joinState(StoredFileWorkingCopyState.PENDING_SAVE);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.DIRTY), false);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.SAVED), true);
    assert.strictEqual(workingCopy.hasState(StoredFileWorkingCopyState.PENDING_SAVE), false);
  });
  test("isReadonly, isResolved, dispose, isDisposed", async () => {
    assert.strictEqual(workingCopy.isResolved(), false);
    assert.strictEqual(workingCopy.isReadonly(), false);
    assert.strictEqual(workingCopy.isDisposed(), false);
    await workingCopy.resolve();
    assert.ok(workingCopy.model);
    assert.strictEqual(workingCopy.isResolved(), true);
    assert.strictEqual(workingCopy.isReadonly(), false);
    assert.strictEqual(workingCopy.isDisposed(), false);
    let disposedEvent = false;
    disposables.add(workingCopy.onWillDispose(() => {
      disposedEvent = true;
    }));
    let disposedModelEvent = false;
    disposables.add(workingCopy.model.onWillDispose(() => {
      disposedModelEvent = true;
    }));
    workingCopy.dispose();
    assert.strictEqual(workingCopy.isDisposed(), true);
    assert.strictEqual(disposedEvent, true);
    assert.strictEqual(disposedModelEvent, true);
  });
  test("readonly change event", async () => {
    accessor.fileService.readonly = true;
    await workingCopy.resolve();
    assert.strictEqual(!!workingCopy.isReadonly(), true);
    accessor.fileService.readonly = false;
    let readonlyEvent = false;
    disposables.add(workingCopy.onDidChangeReadonly(() => {
      readonlyEvent = true;
    }));
    await workingCopy.resolve();
    assert.strictEqual(workingCopy.isReadonly(), false);
    assert.strictEqual(readonlyEvent, true);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
export {
  TestStoredFileWorkingCopyModel,
  TestStoredFileWorkingCopyModelFactory,
  TestStoredFileWorkingCopyModelWithCustomSave,
  TestStoredFileWorkingCopyModelWithCustomSaveFactory
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx3b3JraW5nQ29weVxcdGVzdFxcYnJvd3Nlclxcc3RvcmVkRmlsZVdvcmtpbmdDb3B5LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBTdG9yZWRGaWxlV29ya2luZ0NvcHksIFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLCBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWwsIElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQsIElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbEZhY3RvcnksIGlzU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZUV2ZW50LCBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZUV2ZW50IH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0b3JlZEZpbGVXb3JraW5nQ29weS5qcyc7XG5pbXBvcnQgeyBidWZmZXJUb1N0cmVhbSwgbmV3V3JpdGVhYmxlQnVmZmVyU3RyZWFtLCBzdHJlYW1Ub0J1ZmZlciwgVlNCdWZmZXIsIFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGdldExhc3RSZXNvbHZlZEZpbGVTdGF0LCBUZXN0U2VydmljZUFjY2Vzc29yLCB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBGaWxlQ2hhbmdlc0V2ZW50LCBGaWxlQ2hhbmdlVHlwZSwgRmlsZU9wZXJhdGlvbkVycm9yLCBGaWxlT3BlcmF0aW9uUmVzdWx0LCBJRmlsZVN0YXRXaXRoTWV0YWRhdGEsIElXcml0ZUZpbGVPcHRpb25zLCBOb3RNb2RpZmllZFNpbmNlRmlsZU9wZXJhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFNhdmVSZWFzb24sIFNhdmVTb3VyY2VSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBjb25zdW1lUmVhZGFibGUsIGNvbnN1bWVTdHJlYW0sIGlzUmVhZGFibGVTdHJlYW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJlYW0uanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgU25hcHNob3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2ZpbGVXb3JraW5nQ29weS5qcyc7XG5pbXBvcnQgeyBhc3NlcnRSZXR1cm5zRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuZXhwb3J0IGNsYXNzIFRlc3RTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWwge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29udGVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbnRlbnQgPSB0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsRGlzcG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbldpbGxEaXNwb3NlID0gdGhpcy5fb25XaWxsRGlzcG9zZS5ldmVudDtcblxuXHRjb25zdHJ1Y3RvcihyZWFkb25seSByZXNvdXJjZTogVVJJLCBwdWJsaWMgY29udGVudHM6IHN0cmluZykge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRmaXJlQ29udGVudENoYW5nZUV2ZW50KGV2ZW50OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWxDb250ZW50Q2hhbmdlZEV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZW50LmZpcmUoZXZlbnQpO1xuXHR9XG5cblx0dXBkYXRlQ29udGVudHMobmV3Q29udGVudHM6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuZG9VcGRhdGUobmV3Q29udGVudHMpO1xuXHR9XG5cblx0cHJpdmF0ZSB0aHJvd09uU25hcHNob3QgPSBmYWxzZTtcblx0c2V0VGhyb3dPblNuYXBzaG90KCk6IHZvaWQge1xuXHRcdHRoaXMudGhyb3dPblNuYXBzaG90ID0gdHJ1ZTtcblx0fVxuXG5cdGFzeW5jIHNuYXBzaG90KGNvbnRleHQ6IFNuYXBzaG90Q29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxWU0J1ZmZlclJlYWRhYmxlU3RyZWFtPiB7XG5cdFx0aWYgKHRoaXMudGhyb3dPblNuYXBzaG90KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ZhaWwnKTtcblx0XHR9XG5cblx0XHRjb25zdCBzdHJlYW0gPSBuZXdXcml0ZWFibGVCdWZmZXJTdHJlYW0oKTtcblx0XHRzdHJlYW0uZW5kKFZTQnVmZmVyLmZyb21TdHJpbmcodGhpcy5jb250ZW50cykpO1xuXG5cdFx0cmV0dXJuIHN0cmVhbTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZShjb250ZW50czogVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5kb1VwZGF0ZSgoYXdhaXQgc3RyZWFtVG9CdWZmZXIoY29udGVudHMpKS50b1N0cmluZygpKTtcblx0fVxuXG5cdHByaXZhdGUgZG9VcGRhdGUobmV3Q29udGVudHM6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuY29udGVudHMgPSBuZXdDb250ZW50cztcblxuXHRcdHRoaXMudmVyc2lvbklkKys7XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnQuZmlyZSh7IGlzUmVkb2luZzogZmFsc2UsIGlzVW5kb2luZzogZmFsc2UgfSk7XG5cdH1cblxuXHR2ZXJzaW9uSWQgPSAwO1xuXG5cdHB1c2hlZFN0YWNrRWxlbWVudCA9IGZhbHNlO1xuXG5cdHB1c2hTdGFja0VsZW1lbnQoKTogdm9pZCB7XG5cdFx0dGhpcy5wdXNoZWRTdGFja0VsZW1lbnQgPSB0cnVlO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbldpbGxEaXNwb3NlLmZpcmUoKTtcblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsV2l0aEN1c3RvbVNhdmUgZXh0ZW5kcyBUZXN0U3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWwge1xuXG5cdHNhdmVDb3VudGVyID0gMDtcblx0dGhyb3dPblNhdmUgPSBmYWxzZTtcblx0c2F2ZU9wZXJhdGlvbjogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRhc3luYyBzYXZlKG9wdGlvbnM6IElXcml0ZUZpbGVPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElGaWxlU3RhdFdpdGhNZXRhZGF0YT4ge1xuXHRcdGlmICh0aGlzLnRocm93T25TYXZlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ZhaWwnKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5zYXZlT3BlcmF0aW9uKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnNhdmVPcGVyYXRpb247XG5cdFx0fVxuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NhbmNlbGVkJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zYXZlQ291bnRlcisrO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlc291cmNlOiB0aGlzLnJlc291cmNlLFxuXHRcdFx0Y3RpbWU6IDAsXG5cdFx0XHRldGFnOiAnJyxcblx0XHRcdGlzRGlyZWN0b3J5OiBmYWxzZSxcblx0XHRcdGlzRmlsZTogdHJ1ZSxcblx0XHRcdG10aW1lOiAwLFxuXHRcdFx0bmFtZTogJ3Jlc291cmNlMicsXG5cdFx0XHRzaXplOiAwLFxuXHRcdFx0aXNTeW1ib2xpY0xpbms6IGZhbHNlLFxuXHRcdFx0cmVhZG9ubHk6IGZhbHNlLFxuXHRcdFx0bG9ja2VkOiBmYWxzZSxcblx0XHRcdGV4ZWN1dGFibGU6IGZhbHNlLFxuXHRcdFx0Y2hpbGRyZW46IHVuZGVmaW5lZFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbEZhY3RvcnkgaW1wbGVtZW50cyBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWxGYWN0b3J5PFRlc3RTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbD4ge1xuXG5cdGFzeW5jIGNyZWF0ZU1vZGVsKHJlc291cmNlOiBVUkksIGNvbnRlbnRzOiBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFRlc3RTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbD4ge1xuXHRcdHJldHVybiBuZXcgVGVzdFN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsKHJlc291cmNlLCAoYXdhaXQgc3RyZWFtVG9CdWZmZXIoY29udGVudHMpKS50b1N0cmluZygpKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsV2l0aEN1c3RvbVNhdmVGYWN0b3J5IGltcGxlbWVudHMgSVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsRmFjdG9yeTxUZXN0U3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWxXaXRoQ3VzdG9tU2F2ZT4ge1xuXG5cdGFzeW5jIGNyZWF0ZU1vZGVsKHJlc291cmNlOiBVUkksIGNvbnRlbnRzOiBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFRlc3RTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbFdpdGhDdXN0b21TYXZlPiB7XG5cdFx0cmV0dXJuIG5ldyBUZXN0U3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWxXaXRoQ3VzdG9tU2F2ZShyZXNvdXJjZSwgKGF3YWl0IHN0cmVhbVRvQnVmZmVyKGNvbnRlbnRzKSkudG9TdHJpbmcoKSk7XG5cdH1cbn1cblxuc3VpdGUoJ1N0b3JlZEZpbGVXb3JraW5nQ29weSAod2l0aCBjdXN0b20gc2F2ZSknLCBmdW5jdGlvbiAoKSB7XG5cblx0Y29uc3QgZmFjdG9yeSA9IG5ldyBUZXN0U3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWxXaXRoQ3VzdG9tU2F2ZUZhY3RvcnkoKTtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGFjY2Vzc29yOiBUZXN0U2VydmljZUFjY2Vzc29yO1xuXHRsZXQgd29ya2luZ0NvcHk6IFN0b3JlZEZpbGVXb3JraW5nQ29weTxUZXN0U3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWxXaXRoQ3VzdG9tU2F2ZT47XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBkaXNwb3NhYmxlcyk7XG5cdFx0YWNjZXNzb3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0U2VydmljZUFjY2Vzc29yKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJ3Rlc3QvcmVzb3VyY2UnKTtcblx0XHR3b3JraW5nQ29weSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU3RvcmVkRmlsZVdvcmtpbmdDb3B5PFRlc3RTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbFdpdGhDdXN0b21TYXZlPigndGVzdFN0b3JlZEZpbGVXb3JraW5nQ29weVR5cGUnLCByZXNvdXJjZSwgYmFzZW5hbWUocmVzb3VyY2UpLCBmYWN0b3J5LCBvcHRpb25zID0+IHdvcmtpbmdDb3B5LnJlc29sdmUob3B0aW9ucyksIGFjY2Vzc29yLmZpbGVTZXJ2aWNlLCBhY2Nlc3Nvci5sb2dTZXJ2aWNlLCBhY2Nlc3Nvci53b3JraW5nQ29weUZpbGVTZXJ2aWNlLCBhY2Nlc3Nvci5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLCBhY2Nlc3Nvci53b3JraW5nQ29weUJhY2t1cFNlcnZpY2UsIGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZSwgYWNjZXNzb3Iubm90aWZpY2F0aW9uU2VydmljZSwgYWNjZXNzb3Iud29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlLCBhY2Nlc3Nvci5lZGl0b3JTZXJ2aWNlLCBhY2Nlc3Nvci5lbGV2YXRlZEZpbGVTZXJ2aWNlLCBhY2Nlc3Nvci5wcm9ncmVzc1NlcnZpY2UpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NhdmUgKGN1c3RvbSBpbXBsZW1lbnRlZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHNhdmVkQ291bnRlciA9IDA7XG5cdFx0bGV0IGxhc3RTYXZlRXZlbnQ6IElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlRXZlbnQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHdvcmtpbmdDb3B5Lm9uRGlkU2F2ZShlID0+IHtcblx0XHRcdHNhdmVkQ291bnRlcisrO1xuXHRcdFx0bGFzdFNhdmVFdmVudCA9IGU7XG5cdFx0fSkpO1xuXG5cdFx0bGV0IHNhdmVFcnJvckNvdW50ZXIgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh3b3JraW5nQ29weS5vbkRpZFNhdmVFcnJvcigoKSA9PiB7XG5cdFx0XHRzYXZlRXJyb3JDb3VudGVyKys7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gdW5yZXNvbHZlZFxuXHRcdGF3YWl0IHdvcmtpbmdDb3B5LnNhdmUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2F2ZWRDb3VudGVyLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2F2ZUVycm9yQ291bnRlciwgMCk7XG5cblx0XHQvLyBzaW1wbGVcblx0XHRhd2FpdCB3b3JraW5nQ29weS5yZXNvbHZlKCk7XG5cdFx0d29ya2luZ0NvcHkubW9kZWw/LnVwZGF0ZUNvbnRlbnRzKCdoZWxsbyBzYXZlJyk7XG5cdFx0YXdhaXQgd29ya2luZ0NvcHkuc2F2ZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhdmVkQ291bnRlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhdmVFcnJvckNvdW50ZXIsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5pc0RpcnR5KCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdFNhdmVFdmVudCEucmVhc29uLCBTYXZlUmVhc29uLkVYUExJQ0lUKTtcblx0XHRhc3NlcnQub2sobGFzdFNhdmVFdmVudCEuc3RhdCk7XG5cdFx0YXNzZXJ0Lm9rKGlzU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZUV2ZW50KGxhc3RTYXZlRXZlbnQhKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5Lm1vZGVsPy5wdXNoZWRTdGFja0VsZW1lbnQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgod29ya2luZ0NvcHkubW9kZWwgYXMgVGVzdFN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsV2l0aEN1c3RvbVNhdmUpLnNhdmVDb3VudGVyLCAxKTtcblxuXHRcdC8vIGVycm9yXG5cdFx0d29ya2luZ0NvcHkubW9kZWw/LnVwZGF0ZUNvbnRlbnRzKCdoZWxsbyBzYXZlIGVycm9yJyk7XG5cdFx0KHdvcmtpbmdDb3B5Lm1vZGVsIGFzIFRlc3RTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbFdpdGhDdXN0b21TYXZlKS50aHJvd09uU2F2ZSA9IHRydWU7XG5cdFx0YXdhaXQgd29ya2luZ0NvcHkuc2F2ZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhdmVFcnJvckNvdW50ZXIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5FUlJPUiksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzYXZlIGNhbmNlbGxlZCAoY3VzdG9tIGltcGxlbWVudGVkKScsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgc2F2ZWRDb3VudGVyID0gMDtcblx0XHRsZXQgbGFzdFNhdmVFdmVudDogSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVFdmVudCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRkaXNwb3NhYmxlcy5hZGQod29ya2luZ0NvcHkub25EaWRTYXZlKGUgPT4ge1xuXHRcdFx0c2F2ZWRDb3VudGVyKys7XG5cdFx0XHRsYXN0U2F2ZUV2ZW50ID0gZTtcblx0XHR9KSk7XG5cblx0XHRsZXQgc2F2ZUVycm9yQ291bnRlciA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHdvcmtpbmdDb3B5Lm9uRGlkU2F2ZUVycm9yKCgpID0+IHtcblx0XHRcdHNhdmVFcnJvckNvdW50ZXIrKztcblx0XHR9KSk7XG5cblx0XHRhd2FpdCB3b3JraW5nQ29weS5yZXNvbHZlKCk7XG5cdFx0bGV0IHJlc29sdmU6ICgpID0+IHZvaWQ7XG5cdFx0KHdvcmtpbmdDb3B5Lm1vZGVsIGFzIFRlc3RTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbFdpdGhDdXN0b21TYXZlKS5zYXZlT3BlcmF0aW9uID0gbmV3IFByb21pc2UociA9PiByZXNvbHZlID0gcik7XG5cblx0XHR3b3JraW5nQ29weS5tb2RlbD8udXBkYXRlQ29udGVudHMoJ2ZpcnN0Jyk7XG5cdFx0Y29uc3QgZmlyc3RTYXZlID0gd29ya2luZ0NvcHkuc2F2ZSgpO1xuXHRcdC8vIGNhbmNlbCB0aGUgZmlyc3Qgc2F2ZSBieSByZXF1ZXN0aW5nIGEgc2Vjb25kIHdoaWxlIGl0IGlzIHN0aWxsIG1pZCBvcGVyYXRpb25cblx0XHR3b3JraW5nQ29weS5tb2RlbD8udXBkYXRlQ29udGVudHMoJ3NlY29uZCcpO1xuXHRcdGNvbnN0IHNlY29uZFNhdmUgPSB3b3JraW5nQ29weS5zYXZlKCk7XG5cdFx0cmVzb2x2ZSEoKTtcblx0XHRhd2FpdCBmaXJzdFNhdmU7XG5cdFx0YXdhaXQgc2Vjb25kU2F2ZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYXZlZENvdW50ZXIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYXZlRXJyb3JDb3VudGVyLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaXNEaXJ0eSgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3RTYXZlRXZlbnQhLnJlYXNvbiwgU2F2ZVJlYXNvbi5FWFBMSUNJVCk7XG5cdFx0YXNzZXJ0Lm9rKGxhc3RTYXZlRXZlbnQhLnN0YXQpO1xuXHRcdGFzc2VydC5vayhpc1N0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVFdmVudChsYXN0U2F2ZUV2ZW50ISkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5tb2RlbD8ucHVzaGVkU3RhY2tFbGVtZW50LCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHdvcmtpbmdDb3B5Lm1vZGVsIGFzIFRlc3RTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbFdpdGhDdXN0b21TYXZlKS5zYXZlQ291bnRlciwgMSk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG5cbnN1aXRlKCdTdG9yZWRGaWxlV29ya2luZ0NvcHknLCBmdW5jdGlvbiAoKSB7XG5cblx0Y29uc3QgZmFjdG9yeSA9IG5ldyBUZXN0U3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWxGYWN0b3J5KCk7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJ3Rlc3QvcmVzb3VyY2UnKTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBhY2Nlc3NvcjogVGVzdFNlcnZpY2VBY2Nlc3Nvcjtcblx0bGV0IHdvcmtpbmdDb3B5OiBTdG9yZWRGaWxlV29ya2luZ0NvcHk8VGVzdFN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsPjtcblxuXHRmdW5jdGlvbiBjcmVhdGVXb3JraW5nQ29weSh1cmk6IFVSSSA9IHJlc291cmNlKSB7XG5cdFx0Y29uc3Qgd29ya2luZ0NvcHk6IFN0b3JlZEZpbGVXb3JraW5nQ29weTxUZXN0U3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWw+ID0gbmV3IFN0b3JlZEZpbGVXb3JraW5nQ29weTxUZXN0U3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWw+KCd0ZXN0U3RvcmVkRmlsZVdvcmtpbmdDb3B5VHlwZScsIHVyaSwgYmFzZW5hbWUodXJpKSwgZmFjdG9yeSwgb3B0aW9ucyA9PiB3b3JraW5nQ29weS5yZXNvbHZlKG9wdGlvbnMpLCBhY2Nlc3Nvci5maWxlU2VydmljZSwgYWNjZXNzb3IubG9nU2VydmljZSwgYWNjZXNzb3Iud29ya2luZ0NvcHlGaWxlU2VydmljZSwgYWNjZXNzb3IuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZSwgYWNjZXNzb3Iud29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLCBhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2UsIGFjY2Vzc29yLm5vdGlmaWNhdGlvblNlcnZpY2UsIGFjY2Vzc29yLndvcmtpbmdDb3B5RWRpdG9yU2VydmljZSwgYWNjZXNzb3IuZWRpdG9yU2VydmljZSwgYWNjZXNzb3IuZWxldmF0ZWRGaWxlU2VydmljZSwgYWNjZXNzb3IucHJvZ3Jlc3NTZXJ2aWNlKTtcblxuXHRcdHJldHVybiB3b3JraW5nQ29weTtcblx0fVxuXG5cdHNldHVwKCgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpO1xuXHRcdGFjY2Vzc29yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFNlcnZpY2VBY2Nlc3Nvcik7XG5cblx0XHR3b3JraW5nQ29weSA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVXb3JraW5nQ29weSgpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHdvcmtpbmdDb3B5LmRpc3Bvc2UoKTtcblxuXHRcdGZvciAoY29uc3Qgd29ya2luZ0NvcHkgb2YgYWNjZXNzb3Iud29ya2luZ0NvcHlTZXJ2aWNlLndvcmtpbmdDb3BpZXMpIHtcblx0XHRcdCh3b3JraW5nQ29weSBhcyBTdG9yZWRGaWxlV29ya2luZ0NvcHk8VGVzdFN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsPikuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZ2lzdGVycyB3aXRoIHdvcmtpbmcgY29weSBzZXJ2aWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2Uud29ya2luZ0NvcGllcy5sZW5ndGgsIDEpO1xuXG5cdFx0d29ya2luZ0NvcHkuZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS53b3JraW5nQ29waWVzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29ycGhhbmVkIHRyYWNraW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5PUlBIQU4pLCBmYWxzZSk7XG5cblx0XHRcdGxldCBvbkRpZENoYW5nZU9ycGhhbmVkUHJvbWlzZSA9IEV2ZW50LnRvUHJvbWlzZSh3b3JraW5nQ29weS5vbkRpZENoYW5nZU9ycGhhbmVkKTtcblx0XHRcdGFjY2Vzc29yLmZpbGVTZXJ2aWNlLm5vdEV4aXN0c1NldC5zZXQocmVzb3VyY2UsIHRydWUpO1xuXHRcdFx0YWNjZXNzb3IuZmlsZVNlcnZpY2UuZmlyZUZpbGVDaGFuZ2VzKG5ldyBGaWxlQ2hhbmdlc0V2ZW50KFt7IHJlc291cmNlLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEIH1dLCBmYWxzZSkpO1xuXG5cdFx0XHRhd2FpdCBvbkRpZENoYW5nZU9ycGhhbmVkUHJvbWlzZTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5PUlBIQU4pLCB0cnVlKTtcblxuXHRcdFx0b25EaWRDaGFuZ2VPcnBoYW5lZFByb21pc2UgPSBFdmVudC50b1Byb21pc2Uod29ya2luZ0NvcHkub25EaWRDaGFuZ2VPcnBoYW5lZCk7XG5cdFx0XHRhY2Nlc3Nvci5maWxlU2VydmljZS5ub3RFeGlzdHNTZXQuZGVsZXRlKHJlc291cmNlKTtcblx0XHRcdGFjY2Vzc29yLmZpbGVTZXJ2aWNlLmZpcmVGaWxlQ2hhbmdlcyhuZXcgRmlsZUNoYW5nZXNFdmVudChbeyByZXNvdXJjZSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuQURERUQgfV0sIGZhbHNlKSk7XG5cblx0XHRcdGF3YWl0IG9uRGlkQ2hhbmdlT3JwaGFuZWRQcm9taXNlO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5Lmhhc1N0YXRlKFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLk9SUEhBTiksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGlydHkgLyBtb2RpZmllZCcsIGFzeW5jICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaXNNb2RpZmllZCgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5LmlzRGlydHkoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5ESVJUWSksIGZhbHNlKTtcblxuXHRcdGF3YWl0IHdvcmtpbmdDb3B5LnJlc29sdmUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaXNSZXNvbHZlZCgpLCB0cnVlKTtcblxuXHRcdGxldCBjaGFuZ2VEaXJ0eUNvdW50ZXIgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh3b3JraW5nQ29weS5vbkRpZENoYW5nZURpcnR5KCgpID0+IHtcblx0XHRcdGNoYW5nZURpcnR5Q291bnRlcisrO1xuXHRcdH0pKTtcblxuXHRcdGxldCBjb250ZW50Q2hhbmdlQ291bnRlciA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHdvcmtpbmdDb3B5Lm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB7XG5cdFx0XHRjb250ZW50Q2hhbmdlQ291bnRlcisrO1xuXHRcdH0pKTtcblxuXHRcdGxldCBzYXZlZENvdW50ZXIgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh3b3JraW5nQ29weS5vbkRpZFNhdmUoKCkgPT4ge1xuXHRcdFx0c2F2ZWRDb3VudGVyKys7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gRGlydHkgZnJvbTogTW9kZWwgY29udGVudCBjaGFuZ2Vcblx0XHR3b3JraW5nQ29weS5tb2RlbD8udXBkYXRlQ29udGVudHMoJ2hlbGxvIGRpcnR5Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnRDaGFuZ2VDb3VudGVyLCAxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5pc01vZGlmaWVkKCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5pc0RpcnR5KCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5ESVJUWSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VEaXJ0eUNvdW50ZXIsIDEpO1xuXG5cdFx0YXdhaXQgd29ya2luZ0NvcHkuc2F2ZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5LmlzTW9kaWZpZWQoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5pc0RpcnR5KCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaGFzU3RhdGUoU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuRElSVFkpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZURpcnR5Q291bnRlciwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhdmVkQ291bnRlciwgMSk7XG5cblx0XHQvLyBEaXJ0eSBmcm9tOiBJbml0aWFsIGNvbnRlbnRzXG5cdFx0YXdhaXQgd29ya2luZ0NvcHkucmVzb2x2ZSh7IGNvbnRlbnRzOiBidWZmZXJUb1N0cmVhbShWU0J1ZmZlci5mcm9tU3RyaW5nKCdoZWxsbyBkaXJ0eSBzdHJlYW0nKSkgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudENoYW5nZUNvdW50ZXIsIDIpOyAvLyBjb250ZW50IG9mIG1vZGVsIGRpZCBub3QgY2hhbmdlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5LmlzTW9kaWZpZWQoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5LmlzRGlydHkoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5Lmhhc1N0YXRlKFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLkRJUlRZKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZURpcnR5Q291bnRlciwgMyk7XG5cblx0XHRhd2FpdCB3b3JraW5nQ29weS5yZXZlcnQoeyBzb2Z0OiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5LmlzTW9kaWZpZWQoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5pc0RpcnR5KCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaGFzU3RhdGUoU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuRElSVFkpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZURpcnR5Q291bnRlciwgNCk7XG5cblx0XHQvLyBNb2RpZmllZCBmcm9tOiBBUElcblx0XHR3b3JraW5nQ29weS5tYXJrTW9kaWZpZWQoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5pc01vZGlmaWVkKCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5pc0RpcnR5KCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5ESVJUWSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VEaXJ0eUNvdW50ZXIsIDUpO1xuXG5cdFx0YXdhaXQgd29ya2luZ0NvcHkucmV2ZXJ0KCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaXNNb2RpZmllZCgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5LmlzRGlydHkoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5ESVJUWSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlRGlydHlDb3VudGVyLCA2KTtcblx0fSk7XG5cblx0dGVzdCgnZGlydHkgLSB3b3JraW5nIGNvcHkgbWFya3Mgbm9uLWRpcnR5IHdoZW4gdW5kbyByZWFjaGVzIHNhdmVkIHZlcnNpb24gSUQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd29ya2luZ0NvcHkucmVzb2x2ZSgpO1xuXG5cdFx0d29ya2luZ0NvcHkubW9kZWw/LnVwZGF0ZUNvbnRlbnRzKCdoZWxsbyBzYXZlZCBzdGF0ZScpO1xuXHRcdGF3YWl0IHdvcmtpbmdDb3B5LnNhdmUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaXNEaXJ0eSgpLCBmYWxzZSk7XG5cblx0XHR3b3JraW5nQ29weS5tb2RlbD8udXBkYXRlQ29udGVudHMoJ2NoYW5naW5nIGNvbnRlbnQgb25jZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5pc0RpcnR5KCksIHRydWUpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgYW4gdW5kbyB0aGF0IGdvZXMgYmFjayB0byB0aGUgbGFzdCAoc2F2ZWQpIHZlcnNpb24gSURcblx0XHR3b3JraW5nQ29weS5tb2RlbCEudmVyc2lvbklkLS07XG5cblx0XHR3b3JraW5nQ29weS5tb2RlbD8uZmlyZUNvbnRlbnRDaGFuZ2VFdmVudCh7IGlzUmVkb2luZzogZmFsc2UsIGlzVW5kb2luZzogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaXNEaXJ0eSgpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmUgKHdpdGhvdXQgYmFja3VwKScsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgb25EaWRSZXNvbHZlQ291bnRlciA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHdvcmtpbmdDb3B5Lm9uRGlkUmVzb2x2ZSgoKSA9PiB7XG5cdFx0XHRvbkRpZFJlc29sdmVDb3VudGVyKys7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gcmVzb2x2ZSBmcm9tIGZpbGVcblx0XHRhd2FpdCB3b3JraW5nQ29weS5yZXNvbHZlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5LmlzUmVzb2x2ZWQoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9uRGlkUmVzb2x2ZUNvdW50ZXIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5tb2RlbD8uY29udGVudHMsICdIZWxsbyBIdG1sJyk7XG5cblx0XHQvLyBkaXJ0eSByZXNvbHZlIHJldHVybnMgZWFybHlcblx0XHR3b3JraW5nQ29weS5tb2RlbD8udXBkYXRlQ29udGVudHMoJ2hlbGxvIHJlc29sdmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaXNEaXJ0eSgpLCB0cnVlKTtcblx0XHRhd2FpdCB3b3JraW5nQ29weS5yZXNvbHZlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9uRGlkUmVzb2x2ZUNvdW50ZXIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5tb2RlbD8uY29udGVudHMsICdoZWxsbyByZXNvbHZlJyk7XG5cblx0XHQvLyBkaXJ0eSByZXNvbHZlIHdpdGggY29udGVudHMgdXBkYXRlcyBjb250ZW50c1xuXHRcdGF3YWl0IHdvcmtpbmdDb3B5LnJlc29sdmUoeyBjb250ZW50czogYnVmZmVyVG9TdHJlYW0oVlNCdWZmZXIuZnJvbVN0cmluZygnaGVsbG8gaW5pdGlhbCBjb250ZW50cycpKSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaXNEaXJ0eSgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkubW9kZWw/LmNvbnRlbnRzLCAnaGVsbG8gaW5pdGlhbCBjb250ZW50cycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvbkRpZFJlc29sdmVDb3VudGVyLCAyKTtcblxuXHRcdC8vIHJlc29sdmUgd2l0aCBwZW5kaW5nIHNhdmUgcmV0dXJucyBkaXJlY3RseVxuXHRcdGNvbnN0IHBlbmRpbmdTYXZlID0gd29ya2luZ0NvcHkuc2F2ZSgpO1xuXHRcdGF3YWl0IHdvcmtpbmdDb3B5LnJlc29sdmUoKTtcblx0XHRhd2FpdCBwZW5kaW5nU2F2ZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaXNEaXJ0eSgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5Lm1vZGVsPy5jb250ZW50cywgJ2hlbGxvIGluaXRpYWwgY29udGVudHMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob25EaWRSZXNvbHZlQ291bnRlciwgMik7XG5cblx0XHQvLyBkaXNwb3NlZCByZXNvbHZlIGlzIG5vdCB0aHJvd2luZyBhbiBlcnJvclxuXHRcdHdvcmtpbmdDb3B5LmRpc3Bvc2UoKTtcblx0XHRhd2FpdCB3b3JraW5nQ29weS5yZXNvbHZlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5LmlzRGlzcG9zZWQoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9uRGlkUmVzb2x2ZUNvdW50ZXIsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlICh3aXRoIGJhY2t1cCknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd29ya2luZ0NvcHkucmVzb2x2ZSh7IGNvbnRlbnRzOiBidWZmZXJUb1N0cmVhbShWU0J1ZmZlci5mcm9tU3RyaW5nKCdoZWxsbyBiYWNrdXAnKSkgfSk7XG5cblx0XHRjb25zdCBiYWNrdXAgPSBhd2FpdCB3b3JraW5nQ29weS5iYWNrdXAoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXdhaXQgYWNjZXNzb3Iud29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLmJhY2t1cCh3b3JraW5nQ29weSwgYmFja3VwLmNvbnRlbnQsIHVuZGVmaW5lZCwgYmFja3VwLm1ldGEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLndvcmtpbmdDb3B5QmFja3VwU2VydmljZS5oYXNCYWNrdXBTeW5jKHdvcmtpbmdDb3B5KSwgdHJ1ZSk7XG5cblx0XHR3b3JraW5nQ29weS5kaXNwb3NlKCk7XG5cblx0XHQvLyBmaXJzdCByZXNvbHZlIGxvYWRzIGZyb20gYmFja3VwXG5cdFx0d29ya2luZ0NvcHkgPSBjcmVhdGVXb3JraW5nQ29weSgpO1xuXHRcdGF3YWl0IHdvcmtpbmdDb3B5LnJlc29sdmUoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5pc0RpcnR5KCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5pc1JlYWRvbmx5KCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkubW9kZWw/LmNvbnRlbnRzLCAnaGVsbG8gYmFja3VwJyk7XG5cblx0XHR3b3JraW5nQ29weS5tb2RlbC51cGRhdGVDb250ZW50cygnaGVsbG8gdXBkYXRlZCcpO1xuXHRcdGF3YWl0IHdvcmtpbmdDb3B5LnNhdmUoKTtcblxuXHRcdC8vIHN1YnNlcXVlbnQgcmVzb2x2ZSBpZ25vcmVzIGFueSBiYWNrdXBzXG5cdFx0YXdhaXQgd29ya2luZ0NvcHkucmVzb2x2ZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5LmlzRGlydHkoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5tb2RlbD8uY29udGVudHMsICdIZWxsbyBIdG1sJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmUgKHdpdGggYmFja3VwLCBwcmVzZXJ2ZXMgbWV0YWRhdGEgYW5kIG9ycGhhbmVkIHN0YXRlKScsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3b3JraW5nQ29weS5yZXNvbHZlKHsgY29udGVudHM6IGJ1ZmZlclRvU3RyZWFtKFZTQnVmZmVyLmZyb21TdHJpbmcoJ2hlbGxvIGJhY2t1cCcpKSB9KTtcblxuXHRcdFx0Y29uc3Qgb3JwaGFuZWRQcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKHdvcmtpbmdDb3B5Lm9uRGlkQ2hhbmdlT3JwaGFuZWQpO1xuXG5cdFx0XHRhY2Nlc3Nvci5maWxlU2VydmljZS5ub3RFeGlzdHNTZXQuc2V0KHJlc291cmNlLCB0cnVlKTtcblx0XHRcdGFjY2Vzc29yLmZpbGVTZXJ2aWNlLmZpcmVGaWxlQ2hhbmdlcyhuZXcgRmlsZUNoYW5nZXNFdmVudChbeyByZXNvdXJjZSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuREVMRVRFRCB9XSwgZmFsc2UpKTtcblxuXHRcdFx0YXdhaXQgb3JwaGFuZWRQcm9taXNlO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5Lmhhc1N0YXRlKFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLk9SUEhBTiksIHRydWUpO1xuXG5cdFx0XHRjb25zdCBiYWNrdXAgPSBhd2FpdCB3b3JraW5nQ29weS5iYWNrdXAoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhd2FpdCBhY2Nlc3Nvci53b3JraW5nQ29weUJhY2t1cFNlcnZpY2UuYmFja3VwKHdvcmtpbmdDb3B5LCBiYWNrdXAuY29udGVudCwgdW5kZWZpbmVkLCBiYWNrdXAubWV0YSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY2Nlc3Nvci53b3JraW5nQ29weUJhY2t1cFNlcnZpY2UuaGFzQmFja3VwU3luYyh3b3JraW5nQ29weSksIHRydWUpO1xuXG5cdFx0XHR3b3JraW5nQ29weS5kaXNwb3NlKCk7XG5cblx0XHRcdHdvcmtpbmdDb3B5ID0gY3JlYXRlV29ya2luZ0NvcHkoKTtcblx0XHRcdGF3YWl0IHdvcmtpbmdDb3B5LnJlc29sdmUoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5Lmhhc1N0YXRlKFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLk9SUEhBTiksIHRydWUpO1xuXG5cdFx0XHRjb25zdCBiYWNrdXAyID0gYXdhaXQgd29ya2luZ0NvcHkuYmFja3VwKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChiYWNrdXAubWV0YSwgYmFja3VwMi5tZXRhKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZSAodXBkYXRlcyBvcnBoYW5lZCBzdGF0ZSBhY2NvcmRpbmdseSknLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd29ya2luZ0NvcHkucmVzb2x2ZSgpO1xuXG5cdFx0XHRjb25zdCBvcnBoYW5lZFByb21pc2UgPSBFdmVudC50b1Byb21pc2Uod29ya2luZ0NvcHkub25EaWRDaGFuZ2VPcnBoYW5lZCk7XG5cblx0XHRcdGFjY2Vzc29yLmZpbGVTZXJ2aWNlLm5vdEV4aXN0c1NldC5zZXQocmVzb3VyY2UsIHRydWUpO1xuXHRcdFx0YWNjZXNzb3IuZmlsZVNlcnZpY2UuZmlyZUZpbGVDaGFuZ2VzKG5ldyBGaWxlQ2hhbmdlc0V2ZW50KFt7IHJlc291cmNlLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEIH1dLCBmYWxzZSkpO1xuXG5cdFx0XHRhd2FpdCBvcnBoYW5lZFByb21pc2U7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaGFzU3RhdGUoU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuT1JQSEFOKSwgdHJ1ZSk7XG5cblx0XHRcdC8vIHJlc29sdmluZyBjbGVhcnMgb3JwaGFuZWQgc3RhdGUgd2hlbiBzdWNjZXNzZnVsXG5cdFx0XHRhY2Nlc3Nvci5maWxlU2VydmljZS5ub3RFeGlzdHNTZXQuZGVsZXRlKHJlc291cmNlKTtcblx0XHRcdGF3YWl0IHdvcmtpbmdDb3B5LnJlc29sdmUoeyBmb3JjZVJlYWRGcm9tRmlsZTogdHJ1ZSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5PUlBIQU4pLCBmYWxzZSk7XG5cblx0XHRcdC8vIHJlc29sdmluZyBhZGRzIG9ycGhhbmVkIHN0YXRlIHdoZW4gZmFpbCB0byByZWFkXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhY2Nlc3Nvci5maWxlU2VydmljZS5yZWFkU2hvdWxkVGhyb3dFcnJvciA9IG5ldyBGaWxlT3BlcmF0aW9uRXJyb3IoJ2ZpbGUgbm90IGZvdW5kJywgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCk7XG5cdFx0XHRcdGF3YWl0IHdvcmtpbmdDb3B5LnJlc29sdmUoKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5Lmhhc1N0YXRlKFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLk9SUEhBTiksIHRydWUpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YWNjZXNzb3IuZmlsZVNlcnZpY2UucmVhZFNob3VsZFRocm93RXJyb3IgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXQucmVhZG9ubHkgYW5kIHN0YXQubG9ja2VkIGNhbiBjaGFuZ2Ugd2hlbiBkZWNyZWFzZWQgbXRpbWUgaXMgaWdub3JlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGF3YWl0IHdvcmtpbmdDb3B5LnJlc29sdmUoKTtcblxuXHRcdGNvbnN0IHN0YXQgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZChnZXRMYXN0UmVzb2x2ZWRGaWxlU3RhdCh3b3JraW5nQ29weSkpO1xuXHRcdHRyeSB7XG5cdFx0XHRhY2Nlc3Nvci5maWxlU2VydmljZS5yZWFkU2hvdWxkVGhyb3dFcnJvciA9IG5ldyBOb3RNb2RpZmllZFNpbmNlRmlsZU9wZXJhdGlvbkVycm9yKCdlcnJvcicsIHsgLi4uc3RhdCwgbXRpbWU6IHN0YXQubXRpbWUgLSAxLCByZWFkb25seTogIXN0YXQucmVhZG9ubHksIGxvY2tlZDogIXN0YXQubG9ja2VkIH0pO1xuXHRcdFx0YXdhaXQgd29ya2luZ0NvcHkucmVzb2x2ZSgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhY2Nlc3Nvci5maWxlU2VydmljZS5yZWFkU2hvdWxkVGhyb3dFcnJvciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TGFzdFJlc29sdmVkRmlsZVN0YXQod29ya2luZ0NvcHkpPy5tdGltZSwgc3RhdC5tdGltZSwgJ210aW1lIHNob3VsZCBub3QgZGVjcmVhc2UnKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoZ2V0TGFzdFJlc29sdmVkRmlsZVN0YXQod29ya2luZ0NvcHkpPy5yZWFkb25seSwgc3RhdC5yZWFkb25seSwgJ3JlYWRvbmx5IHNob3VsZCBoYXZlIGNoYW5nZWQgZGVzcGl0ZSBzaW11bHRhbmVvdXMgYXR0ZW1wdCB0byBkZWNyZWFzZSBtdGltZScpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChnZXRMYXN0UmVzb2x2ZWRGaWxlU3RhdCh3b3JraW5nQ29weSk/LmxvY2tlZCwgc3RhdC5sb2NrZWQsICdsb2NrZWQgc2hvdWxkIGhhdmUgY2hhbmdlZCBkZXNwaXRlIHNpbXVsdGFuZW91cyBhdHRlbXB0IHRvIGRlY3JlYXNlIG10aW1lJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmUgKEZJTEVfTk9UX01PRElGSUVEX1NJTkNFIGNhbiBiZSBoYW5kbGVkIGZvciByZXNvbHZlZCB3b3JraW5nIGNvcGllcyknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd29ya2luZ0NvcHkucmVzb2x2ZSgpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGFjY2Vzc29yLmZpbGVTZXJ2aWNlLnJlYWRTaG91bGRUaHJvd0Vycm9yID0gbmV3IEZpbGVPcGVyYXRpb25FcnJvcignZmlsZSBub3QgbW9kaWZpZWQgc2luY2UnLCBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX01PRElGSUVEX1NJTkNFKTtcblx0XHRcdGF3YWl0IHdvcmtpbmdDb3B5LnJlc29sdmUoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YWNjZXNzb3IuZmlsZVNlcnZpY2UucmVhZFNob3VsZFRocm93RXJyb3IgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5Lm1vZGVsPy5jb250ZW50cywgJ0hlbGxvIEh0bWwnKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZSAoRklMRV9OT1RfTU9ESUZJRURfU0lOQ0Ugc3RpbGwgdXBkYXRlcyByZWFkb25seSBzdGF0ZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHJlYWRvbmx5Q2hhbmdlQ291bnRlciA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHdvcmtpbmdDb3B5Lm9uRGlkQ2hhbmdlUmVhZG9ubHkoKCkgPT4gcmVhZG9ubHlDaGFuZ2VDb3VudGVyKyspKTtcblxuXHRcdGF3YWl0IHdvcmtpbmdDb3B5LnJlc29sdmUoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5pc1JlYWRvbmx5KCksIGZhbHNlKTtcblxuXHRcdGNvbnN0IHN0YXQgPSBhd2FpdCBhY2Nlc3Nvci5maWxlU2VydmljZS5yZXNvbHZlKHdvcmtpbmdDb3B5LnJlc291cmNlLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhY2Nlc3Nvci5maWxlU2VydmljZS5yZWFkU2hvdWxkVGhyb3dFcnJvciA9IG5ldyBOb3RNb2RpZmllZFNpbmNlRmlsZU9wZXJhdGlvbkVycm9yKCdmaWxlIG5vdCBtb2RpZmllZCBzaW5jZScsIHsgLi4uc3RhdCwgcmVhZG9ubHk6IHRydWUgfSk7XG5cdFx0XHRhd2FpdCB3b3JraW5nQ29weS5yZXNvbHZlKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGFjY2Vzc29yLmZpbGVTZXJ2aWNlLnJlYWRTaG91bGRUaHJvd0Vycm9yID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCghIXdvcmtpbmdDb3B5LmlzUmVhZG9ubHkoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRvbmx5Q2hhbmdlQ291bnRlciwgMSk7XG5cblx0XHR0cnkge1xuXHRcdFx0YWNjZXNzb3IuZmlsZVNlcnZpY2UucmVhZFNob3VsZFRocm93RXJyb3IgPSBuZXcgTm90TW9kaWZpZWRTaW5jZUZpbGVPcGVyYXRpb25FcnJvcignZmlsZSBub3QgbW9kaWZpZWQgc2luY2UnLCB7IC4uLnN0YXQsIHJlYWRvbmx5OiBmYWxzZSB9KTtcblx0XHRcdGF3YWl0IHdvcmtpbmdDb3B5LnJlc29sdmUoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YWNjZXNzb3IuZmlsZVNlcnZpY2UucmVhZFNob3VsZFRocm93RXJyb3IgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5LmlzUmVhZG9ubHkoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkb25seUNoYW5nZUNvdW50ZXIsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlIGRvZXMgbm90IGFsdGVyIGNvbnRlbnQgd2hlbiBtb2RlbCBjb250ZW50IGNoYW5nZWQgaW4gcGFyYWxsZWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd29ya2luZ0NvcHkucmVzb2x2ZSgpO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZVByb21pc2UgPSB3b3JraW5nQ29weS5yZXNvbHZlKCk7XG5cblx0XHR3b3JraW5nQ29weS5tb2RlbD8udXBkYXRlQ29udGVudHMoJ2NoYW5nZWQgY29udGVudCcpO1xuXG5cdFx0YXdhaXQgcmVzb2x2ZVByb21pc2U7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaXNEaXJ0eSgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkubW9kZWw/LmNvbnRlbnRzLCAnY2hhbmdlZCBjb250ZW50Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2JhY2t1cCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3b3JraW5nQ29weS5yZXNvbHZlKCk7XG5cdFx0d29ya2luZ0NvcHkubW9kZWw/LnVwZGF0ZUNvbnRlbnRzKCdoZWxsbyBiYWNrdXAnKTtcblxuXHRcdGNvbnN0IGJhY2t1cCA9IGF3YWl0IHdvcmtpbmdDb3B5LmJhY2t1cChDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5vayhiYWNrdXAubWV0YSk7XG5cblx0XHRsZXQgYmFja3VwQ29udGVudHM6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAoYmFja3VwLmNvbnRlbnQgaW5zdGFuY2VvZiBWU0J1ZmZlcikge1xuXHRcdFx0YmFja3VwQ29udGVudHMgPSBiYWNrdXAuY29udGVudC50b1N0cmluZygpO1xuXHRcdH0gZWxzZSBpZiAoaXNSZWFkYWJsZVN0cmVhbShiYWNrdXAuY29udGVudCkpIHtcblx0XHRcdGJhY2t1cENvbnRlbnRzID0gKGF3YWl0IGNvbnN1bWVTdHJlYW0oYmFja3VwLmNvbnRlbnQsIGNodW5rcyA9PiBWU0J1ZmZlci5jb25jYXQoY2h1bmtzKSkpLnRvU3RyaW5nKCk7XG5cdFx0fSBlbHNlIGlmIChiYWNrdXAuY29udGVudCkge1xuXHRcdFx0YmFja3VwQ29udGVudHMgPSBjb25zdW1lUmVhZGFibGUoYmFja3VwLmNvbnRlbnQsIGNodW5rcyA9PiBWU0J1ZmZlci5jb25jYXQoY2h1bmtzKSkudG9TdHJpbmcoKTtcblx0XHR9XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFja3VwQ29udGVudHMsICdoZWxsbyBiYWNrdXAnKTtcblx0fSk7XG5cblx0dGVzdCgnc2F2ZSAobm8gZXJyb3JzKSAtIHNpbXBsZScsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgc2F2ZWRDb3VudGVyID0gMDtcblx0XHRsZXQgbGFzdFNhdmVFdmVudDogSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVFdmVudCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRkaXNwb3NhYmxlcy5hZGQod29ya2luZ0NvcHkub25EaWRTYXZlKGUgPT4ge1xuXHRcdFx0c2F2ZWRDb3VudGVyKys7XG5cdFx0XHRsYXN0U2F2ZUV2ZW50ID0gZTtcblx0XHR9KSk7XG5cblx0XHRsZXQgc2F2ZUVycm9yQ291bnRlciA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHdvcmtpbmdDb3B5Lm9uRGlkU2F2ZUVycm9yKCgpID0+IHtcblx0XHRcdHNhdmVFcnJvckNvdW50ZXIrKztcblx0XHR9KSk7XG5cblx0XHQvLyB1bnJlc29sdmVkXG5cdFx0YXdhaXQgd29ya2luZ0NvcHkuc2F2ZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYXZlZENvdW50ZXIsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYXZlRXJyb3JDb3VudGVyLCAwKTtcblxuXHRcdC8vIHNpbXBsZVxuXHRcdGF3YWl0IHdvcmtpbmdDb3B5LnJlc29sdmUoKTtcblx0XHR3b3JraW5nQ29weS5tb2RlbD8udXBkYXRlQ29udGVudHMoJ2hlbGxvIHNhdmUnKTtcblx0XHRhd2FpdCB3b3JraW5nQ29weS5zYXZlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2F2ZWRDb3VudGVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2F2ZUVycm9yQ291bnRlciwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5LmlzRGlydHkoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0U2F2ZUV2ZW50IS5yZWFzb24sIFNhdmVSZWFzb24uRVhQTElDSVQpO1xuXHRcdGFzc2VydC5vayhsYXN0U2F2ZUV2ZW50IS5zdGF0KTtcblx0XHRhc3NlcnQub2soaXNTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlRXZlbnQobGFzdFNhdmVFdmVudCEpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkubW9kZWw/LnB1c2hlZFN0YWNrRWxlbWVudCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NhdmUgKG5vIGVycm9ycykgLSBzYXZlIHJlYXNvbicsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgc2F2ZWRDb3VudGVyID0gMDtcblx0XHRsZXQgbGFzdFNhdmVFdmVudDogSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVFdmVudCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRkaXNwb3NhYmxlcy5hZGQod29ya2luZ0NvcHkub25EaWRTYXZlKGUgPT4ge1xuXHRcdFx0c2F2ZWRDb3VudGVyKys7XG5cdFx0XHRsYXN0U2F2ZUV2ZW50ID0gZTtcblx0XHR9KSk7XG5cblx0XHRsZXQgc2F2ZUVycm9yQ291bnRlciA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHdvcmtpbmdDb3B5Lm9uRGlkU2F2ZUVycm9yKCgpID0+IHtcblx0XHRcdHNhdmVFcnJvckNvdW50ZXIrKztcblx0XHR9KSk7XG5cblx0XHQvLyBzYXZlIHJlYXNvblxuXHRcdGF3YWl0IHdvcmtpbmdDb3B5LnJlc29sdmUoKTtcblx0XHR3b3JraW5nQ29weS5tb2RlbD8udXBkYXRlQ29udGVudHMoJ2hlbGxvIHNhdmUnKTtcblxuXHRcdGNvbnN0IHNvdXJjZSA9IFNhdmVTb3VyY2VSZWdpc3RyeS5yZWdpc3RlclNvdXJjZSgndGVzdFNvdXJjZScsICdIZWxsbyBTYXZlJyk7XG5cdFx0YXdhaXQgd29ya2luZ0NvcHkuc2F2ZSh7IHJlYXNvbjogU2F2ZVJlYXNvbi5BVVRPLCBzb3VyY2UgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2F2ZWRDb3VudGVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2F2ZUVycm9yQ291bnRlciwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5LmlzRGlydHkoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0U2F2ZUV2ZW50IS5yZWFzb24sIFNhdmVSZWFzb24uQVVUTyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3RTYXZlRXZlbnQhLnNvdXJjZSwgc291cmNlKTtcblx0fSk7XG5cblx0dGVzdCgnc2F2ZSAobm8gZXJyb3JzKSAtIG11bHRpcGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBzYXZlZENvdW50ZXIgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh3b3JraW5nQ29weS5vbkRpZFNhdmUoZSA9PiB7XG5cdFx0XHRzYXZlZENvdW50ZXIrKztcblx0XHR9KSk7XG5cblx0XHRsZXQgc2F2ZUVycm9yQ291bnRlciA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHdvcmtpbmdDb3B5Lm9uRGlkU2F2ZUVycm9yKCgpID0+IHtcblx0XHRcdHNhdmVFcnJvckNvdW50ZXIrKztcblx0XHR9KSk7XG5cblx0XHQvLyBtdWx0aXBsZSBzYXZlcyBpbiBwYXJhbGxlbCBhcmUgZmluZSBhbmQgcmVzdWx0XG5cdFx0Ly8gaW4gYSBzaW5nbGUgc2F2ZSB3aGVuIGNvbnRlbnQgZG9lcyBub3QgY2hhbmdlXG5cdFx0YXdhaXQgd29ya2luZ0NvcHkucmVzb2x2ZSgpO1xuXHRcdHdvcmtpbmdDb3B5Lm1vZGVsPy51cGRhdGVDb250ZW50cygnaGVsbG8gc2F2ZScpO1xuXHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQoW1xuXHRcdFx0d29ya2luZ0NvcHkuc2F2ZSh7IHJlYXNvbjogU2F2ZVJlYXNvbi5BVVRPIH0pLFxuXHRcdFx0d29ya2luZ0NvcHkuc2F2ZSh7IHJlYXNvbjogU2F2ZVJlYXNvbi5FWFBMSUNJVCB9KSxcblx0XHRcdHdvcmtpbmdDb3B5LnNhdmUoeyByZWFzb246IFNhdmVSZWFzb24uV0lORE9XX0NIQU5HRSB9KVxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhdmVkQ291bnRlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhdmVFcnJvckNvdW50ZXIsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5pc0RpcnR5KCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnc2F2ZSAobm8gZXJyb3JzKSAtIG11bHRpcGxlLCBjYW5jZWxsYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHNhdmVkQ291bnRlciA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHdvcmtpbmdDb3B5Lm9uRGlkU2F2ZShlID0+IHtcblx0XHRcdHNhdmVkQ291bnRlcisrO1xuXHRcdH0pKTtcblxuXHRcdGxldCBzYXZlRXJyb3JDb3VudGVyID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQod29ya2luZ0NvcHkub25EaWRTYXZlRXJyb3IoKCkgPT4ge1xuXHRcdFx0c2F2ZUVycm9yQ291bnRlcisrO1xuXHRcdH0pKTtcblxuXHRcdC8vIG11bHRpcGxlIHNhdmVzIGluIHBhcmFsbGVsIGFyZSBmaW5lIGFuZCByZXN1bHRcblx0XHQvLyBpbiBqdXN0IG9uZSBzYXZlIG9wZXJhdGlvbiAodGhlIHNlY29uZCBvbmVcblx0XHQvLyBjYW5jZWxzIHRoZSBmaXJzdClcblx0XHRhd2FpdCB3b3JraW5nQ29weS5yZXNvbHZlKCk7XG5cdFx0d29ya2luZ0NvcHkubW9kZWw/LnVwZGF0ZUNvbnRlbnRzKCdoZWxsbyBzYXZlJyk7XG5cdFx0Y29uc3QgZmlyc3RTYXZlID0gd29ya2luZ0NvcHkuc2F2ZSgpO1xuXHRcdHdvcmtpbmdDb3B5Lm1vZGVsPy51cGRhdGVDb250ZW50cygnaGVsbG8gc2F2ZSBtb3JlJyk7XG5cdFx0Y29uc3Qgc2Vjb25kU2F2ZSA9IHdvcmtpbmdDb3B5LnNhdmUoKTtcblxuXHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQoW2ZpcnN0U2F2ZSwgc2Vjb25kU2F2ZV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYXZlZENvdW50ZXIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYXZlRXJyb3JDb3VudGVyLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaXNEaXJ0eSgpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NhdmUgKG5vIGVycm9ycykgLSBub3QgZm9yY2VkIGJ1dCBub3QgZGlydHknLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHNhdmVkQ291bnRlciA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHdvcmtpbmdDb3B5Lm9uRGlkU2F2ZShlID0+IHtcblx0XHRcdHNhdmVkQ291bnRlcisrO1xuXHRcdH0pKTtcblxuXHRcdGxldCBzYXZlRXJyb3JDb3VudGVyID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQod29ya2luZ0NvcHkub25EaWRTYXZlRXJyb3IoKCkgPT4ge1xuXHRcdFx0c2F2ZUVycm9yQ291bnRlcisrO1xuXHRcdH0pKTtcblxuXHRcdC8vIG5vIHNhdmUgd2hlbiBub3QgZm9yY2VkIGFuZCBub3QgZGlydHlcblx0XHRhd2FpdCB3b3JraW5nQ29weS5yZXNvbHZlKCk7XG5cdFx0YXdhaXQgd29ya2luZ0NvcHkuc2F2ZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYXZlZENvdW50ZXIsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYXZlRXJyb3JDb3VudGVyLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaXNEaXJ0eSgpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NhdmUgKG5vIGVycm9ycykgLSBmb3JjZWQgYnV0IG5vdCBkaXJ0eScsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgc2F2ZWRDb3VudGVyID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQod29ya2luZ0NvcHkub25EaWRTYXZlKGUgPT4ge1xuXHRcdFx0c2F2ZWRDb3VudGVyKys7XG5cdFx0fSkpO1xuXG5cdFx0bGV0IHNhdmVFcnJvckNvdW50ZXIgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh3b3JraW5nQ29weS5vbkRpZFNhdmVFcnJvcigoKSA9PiB7XG5cdFx0XHRzYXZlRXJyb3JDb3VudGVyKys7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gc2F2ZSB3aGVuIGZvcmNlZCBldmVuIHdoZW4gbm90IGRpcnR5XG5cdFx0YXdhaXQgd29ya2luZ0NvcHkucmVzb2x2ZSgpO1xuXHRcdGF3YWl0IHdvcmtpbmdDb3B5LnNhdmUoeyBmb3JjZTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2F2ZWRDb3VudGVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2F2ZUVycm9yQ291bnRlciwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5LmlzRGlydHkoKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdzYXZlIChubyBlcnJvcnMpIC0gc2F2ZSBjbGVhcnMgb3JwaGFuZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IHNhdmVkQ291bnRlciA9IDA7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQod29ya2luZ0NvcHkub25EaWRTYXZlKGUgPT4ge1xuXHRcdFx0XHRzYXZlZENvdW50ZXIrKztcblx0XHRcdH0pKTtcblxuXHRcdFx0bGV0IHNhdmVFcnJvckNvdW50ZXIgPSAwO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHdvcmtpbmdDb3B5Lm9uRGlkU2F2ZUVycm9yKCgpID0+IHtcblx0XHRcdFx0c2F2ZUVycm9yQ291bnRlcisrO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRhd2FpdCB3b3JraW5nQ29weS5yZXNvbHZlKCk7XG5cblx0XHRcdC8vIHNhdmUgY2xlYXJzIG9ycGhhbmVkXG5cdFx0XHRjb25zdCBvcnBoYW5lZFByb21pc2UgPSBFdmVudC50b1Byb21pc2Uod29ya2luZ0NvcHkub25EaWRDaGFuZ2VPcnBoYW5lZCk7XG5cblx0XHRcdGFjY2Vzc29yLmZpbGVTZXJ2aWNlLm5vdEV4aXN0c1NldC5zZXQocmVzb3VyY2UsIHRydWUpO1xuXHRcdFx0YWNjZXNzb3IuZmlsZVNlcnZpY2UuZmlyZUZpbGVDaGFuZ2VzKG5ldyBGaWxlQ2hhbmdlc0V2ZW50KFt7IHJlc291cmNlLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEIH1dLCBmYWxzZSkpO1xuXG5cdFx0XHRhd2FpdCBvcnBoYW5lZFByb21pc2U7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaGFzU3RhdGUoU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuT1JQSEFOKSwgdHJ1ZSk7XG5cblx0XHRcdGF3YWl0IHdvcmtpbmdDb3B5LnNhdmUoeyBmb3JjZTogdHJ1ZSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYXZlZENvdW50ZXIsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhdmVFcnJvckNvdW50ZXIsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5LmlzRGlydHkoKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5Lmhhc1N0YXRlKFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLk9SUEhBTiksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2F2ZSAoZXJyb3JzKScsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgc2F2ZWRDb3VudGVyID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQod29ya2luZ0NvcHkub25EaWRTYXZlKHJlYXNvbiA9PiB7XG5cdFx0XHRzYXZlZENvdW50ZXIrKztcblx0XHR9KSk7XG5cblx0XHRsZXQgc2F2ZUVycm9yQ291bnRlciA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHdvcmtpbmdDb3B5Lm9uRGlkU2F2ZUVycm9yKCgpID0+IHtcblx0XHRcdHNhdmVFcnJvckNvdW50ZXIrKztcblx0XHR9KSk7XG5cblx0XHRhd2FpdCB3b3JraW5nQ29weS5yZXNvbHZlKCk7XG5cblx0XHQvLyBzYXZlIGVycm9yOiBhbnkgZXJyb3IgbWFya3Mgd29ya2luZyBjb3B5IGRpcnR5XG5cdFx0dHJ5IHtcblx0XHRcdGFjY2Vzc29yLmZpbGVTZXJ2aWNlLndyaXRlU2hvdWxkVGhyb3dFcnJvciA9IG5ldyBGaWxlT3BlcmF0aW9uRXJyb3IoJ3dyaXRlIGVycm9yJywgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX1BFUk1JU1NJT05fREVOSUVEKTtcblxuXHRcdFx0YXdhaXQgd29ya2luZ0NvcHkuc2F2ZSh7IGZvcmNlOiB0cnVlIH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhY2Nlc3Nvci5maWxlU2VydmljZS53cml0ZVNob3VsZFRocm93RXJyb3IgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhdmVkQ291bnRlciwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhdmVFcnJvckNvdW50ZXIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5FUlJPUiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5TQVZFRCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaGFzU3RhdGUoU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuUEVORElOR19TQVZFKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5DT05GTElDVCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaXNEaXJ0eSgpLCB0cnVlKTtcblxuXHRcdC8vIHNhdmUgaXMgYSBuby1vcCB1bmxlc3MgZm9yY2VkIHdoZW4gaW4gZXJyb3IgY2FzZVxuXHRcdGF3YWl0IHdvcmtpbmdDb3B5LnNhdmUoeyByZWFzb246IFNhdmVSZWFzb24uQVVUTyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2F2ZWRDb3VudGVyLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2F2ZUVycm9yQ291bnRlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5Lmhhc1N0YXRlKFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLkVSUk9SKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5Lmhhc1N0YXRlKFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLlNBVkVEKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5QRU5ESU5HX1NBVkUpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5Lmhhc1N0YXRlKFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLkNPTkZMSUNUKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5pc0RpcnR5KCksIHRydWUpO1xuXG5cdFx0Ly8gc2F2ZSBjbGVhcnMgZXJyb3IgZmxhZ3Mgd2hlbiBzdWNjZXNzZnVsXG5cdFx0YXdhaXQgd29ya2luZ0NvcHkuc2F2ZSh7IHJlYXNvbjogU2F2ZVJlYXNvbi5FWFBMSUNJVCB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2F2ZWRDb3VudGVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2F2ZUVycm9yQ291bnRlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5Lmhhc1N0YXRlKFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLkVSUk9SKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5TQVZFRCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5QRU5ESU5HX1NBVkUpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5Lmhhc1N0YXRlKFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLkNPTkZMSUNUKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5pc0RpcnR5KCksIGZhbHNlKTtcblxuXHRcdC8vIHNhdmUgZXJyb3I6IGNvbmZsaWN0XG5cdFx0dHJ5IHtcblx0XHRcdGFjY2Vzc29yLmZpbGVTZXJ2aWNlLndyaXRlU2hvdWxkVGhyb3dFcnJvciA9IG5ldyBGaWxlT3BlcmF0aW9uRXJyb3IoJ3dyaXRlIGVycm9yIGNvbmZsaWN0JywgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX01PRElGSUVEX1NJTkNFKTtcblxuXHRcdFx0YXdhaXQgd29ya2luZ0NvcHkuc2F2ZSh7IGZvcmNlOiB0cnVlIH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBlcnJvciBpcyBleHBlY3RlZFxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhY2Nlc3Nvci5maWxlU2VydmljZS53cml0ZVNob3VsZFRocm93RXJyb3IgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhdmVkQ291bnRlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhdmVFcnJvckNvdW50ZXIsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5FUlJPUiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5TQVZFRCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaGFzU3RhdGUoU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuUEVORElOR19TQVZFKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5DT05GTElDVCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5pc0RpcnR5KCksIHRydWUpO1xuXG5cdFx0Ly8gc2F2ZSBjbGVhcnMgZXJyb3IgZmxhZ3Mgd2hlbiBzdWNjZXNzZnVsXG5cdFx0YXdhaXQgd29ya2luZ0NvcHkuc2F2ZSh7IHJlYXNvbjogU2F2ZVJlYXNvbi5FWFBMSUNJVCB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2F2ZWRDb3VudGVyLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2F2ZUVycm9yQ291bnRlciwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5Lmhhc1N0YXRlKFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLkVSUk9SKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5TQVZFRCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5QRU5ESU5HX1NBVkUpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5Lmhhc1N0YXRlKFN0b3JlZEZpbGVXb3JraW5nQ29weVN0YXRlLkNPTkZMSUNUKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5pc0RpcnR5KCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnc2F2ZSAoZXJyb3JzLCBidWJibGVzIHVwIHdpdGggYGlnbm9yZUVycm9ySGFuZGxlcmApJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdvcmtpbmdDb3B5LnJlc29sdmUoKTtcblxuXHRcdGxldCBlcnJvcjogRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGFjY2Vzc29yLmZpbGVTZXJ2aWNlLndyaXRlU2hvdWxkVGhyb3dFcnJvciA9IG5ldyBGaWxlT3BlcmF0aW9uRXJyb3IoJ3dyaXRlIGVycm9yJywgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX1BFUk1JU1NJT05fREVOSUVEKTtcblxuXHRcdFx0YXdhaXQgd29ya2luZ0NvcHkuc2F2ZSh7IGZvcmNlOiB0cnVlLCBpZ25vcmVFcnJvckhhbmRsZXI6IHRydWUgfSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0ZXJyb3IgPSBlO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhY2Nlc3Nvci5maWxlU2VydmljZS53cml0ZVNob3VsZFRocm93RXJyb3IgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGVycm9yKTtcblx0fSk7XG5cblx0dGVzdCgnc2F2ZSAtIHJldHVybnMgZmFsc2Ugd2hlbiBzYXZlIGZhaWxzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdvcmtpbmdDb3B5LnJlc29sdmUoKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhY2Nlc3Nvci5maWxlU2VydmljZS53cml0ZVNob3VsZFRocm93RXJyb3IgPSBuZXcgRmlsZU9wZXJhdGlvbkVycm9yKCd3cml0ZSBlcnJvcicsIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9QRVJNSVNTSU9OX0RFTklFRCk7XG5cblx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IHdvcmtpbmdDb3B5LnNhdmUoeyBmb3JjZTogdHJ1ZSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMsIGZhbHNlKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YWNjZXNzb3IuZmlsZVNlcnZpY2Uud3JpdGVTaG91bGRUaHJvd0Vycm9yID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHdvcmtpbmdDb3B5LnNhdmUoeyBmb3JjZTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnc2F2ZSBwYXJ0aWNpcGFudCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3b3JraW5nQ29weS5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXNzb3Iud29ya2luZ0NvcHlGaWxlU2VydmljZS5oYXNTYXZlUGFydGljaXBhbnRzLCBmYWxzZSk7XG5cblx0XHRsZXQgcGFydGljaXBhdGlvbkNvdW50ZXIgPSAwO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBhY2Nlc3Nvci53b3JraW5nQ29weUZpbGVTZXJ2aWNlLmFkZFNhdmVQYXJ0aWNpcGFudCh7XG5cdFx0XHRwYXJ0aWNpcGF0ZTogYXN5bmMgKHdjKSA9PiB7XG5cdFx0XHRcdGlmICh3b3JraW5nQ29weSA9PT0gd2MpIHtcblx0XHRcdFx0XHRwYXJ0aWNpcGF0aW9uQ291bnRlcisrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXNzb3Iud29ya2luZ0NvcHlGaWxlU2VydmljZS5oYXNTYXZlUGFydGljaXBhbnRzLCB0cnVlKTtcblxuXHRcdGF3YWl0IHdvcmtpbmdDb3B5LnNhdmUoeyBmb3JjZTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydGljaXBhdGlvbkNvdW50ZXIsIDEpO1xuXG5cdFx0YXdhaXQgd29ya2luZ0NvcHkuc2F2ZSh7IGZvcmNlOiB0cnVlLCBza2lwU2F2ZVBhcnRpY2lwYW50czogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydGljaXBhdGlvbkNvdW50ZXIsIDEpO1xuXG5cdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLndvcmtpbmdDb3B5RmlsZVNlcnZpY2UuaGFzU2F2ZVBhcnRpY2lwYW50cywgZmFsc2UpO1xuXG5cdFx0YXdhaXQgd29ya2luZ0NvcHkuc2F2ZSh7IGZvcmNlOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0aWNpcGF0aW9uQ291bnRlciwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NhdmUgUGFydGljaXBhbnQsIGNhbGxpbmcgc2F2ZSBmcm9tIHdpdGhpbiBpcyB1bnN1cHBvcnRlZCBidXQgZG9lcyBub3QgZXhwbG9kZSAoc3luYyBzYXZlKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3b3JraW5nQ29weS5yZXNvbHZlKCk7XG5cblx0XHRhd2FpdCB0ZXN0U2F2ZUZyb21TYXZlUGFydGljaXBhbnQod29ya2luZ0NvcHksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnU2F2ZSBQYXJ0aWNpcGFudCwgY2FsbGluZyBzYXZlIGZyb20gd2l0aGluIGlzIHVuc3VwcG9ydGVkIGJ1dCBkb2VzIG5vdCBleHBsb2RlIChhc3luYyBzYXZlKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3b3JraW5nQ29weS5yZXNvbHZlKCk7XG5cblx0XHRhd2FpdCB0ZXN0U2F2ZUZyb21TYXZlUGFydGljaXBhbnQod29ya2luZ0NvcHksIHRydWUpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0U2F2ZUZyb21TYXZlUGFydGljaXBhbnQod29ya2luZ0NvcHk6IFN0b3JlZEZpbGVXb3JraW5nQ29weTxUZXN0U3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWw+LCBhc3luYzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZyb20gPSBVUkkuZmlsZSgndGVzdEZyb20nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXNzb3Iud29ya2luZ0NvcHlGaWxlU2VydmljZS5oYXNTYXZlUGFydGljaXBhbnRzLCBmYWxzZSk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlID0gYWNjZXNzb3Iud29ya2luZ0NvcHlGaWxlU2VydmljZS5hZGRTYXZlUGFydGljaXBhbnQoe1xuXHRcdFx0cGFydGljaXBhdGU6IGFzeW5jICh3YywgY29udGV4dCkgPT4ge1xuXG5cdFx0XHRcdGlmIChhc3luYykge1xuXHRcdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXdhaXQgd29ya2luZ0NvcHkuc2F2ZSh7IGZvcmNlOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLndvcmtpbmdDb3B5RmlsZVNlcnZpY2UuaGFzU2F2ZVBhcnRpY2lwYW50cywgdHJ1ZSk7XG5cblx0XHRhd2FpdCB3b3JraW5nQ29weS5zYXZlKHsgZm9yY2U6IHRydWUsIGZyb20gfSk7XG5cblx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHRlc3QoJ1NhdmUgUGFydGljaXBhbnQgY2FycmllcyBjb250ZXh0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdvcmtpbmdDb3B5LnJlc29sdmUoKTtcblxuXHRcdGNvbnN0IGZyb20gPSBVUkkuZmlsZSgndGVzdEZyb20nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXNzb3Iud29ya2luZ0NvcHlGaWxlU2VydmljZS5oYXNTYXZlUGFydGljaXBhbnRzLCBmYWxzZSk7XG5cblx0XHRsZXQgZTogRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGFjY2Vzc29yLndvcmtpbmdDb3B5RmlsZVNlcnZpY2UuYWRkU2F2ZVBhcnRpY2lwYW50KHtcblx0XHRcdHBhcnRpY2lwYXRlOiBhc3luYyAod2MsIGNvbnRleHQpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGV4dC5yZWFzb24sIFNhdmVSZWFzb24uRVhQTElDSVQpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZXh0LnNhdmVkRnJvbT8udG9TdHJpbmcoKSwgZnJvbS50b1N0cmluZygpKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRlID0gZXJyb3I7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY2Nlc3Nvci53b3JraW5nQ29weUZpbGVTZXJ2aWNlLmhhc1NhdmVQYXJ0aWNpcGFudHMsIHRydWUpO1xuXG5cdFx0YXdhaXQgd29ya2luZ0NvcHkuc2F2ZSh7IGZvcmNlOiB0cnVlLCBmcm9tIH0pO1xuXG5cdFx0aWYgKGUpIHtcblx0XHRcdHRocm93IGU7XG5cdFx0fVxuXG5cdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldmVydCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3b3JraW5nQ29weS5yZXNvbHZlKCk7XG5cdFx0d29ya2luZ0NvcHkubW9kZWw/LnVwZGF0ZUNvbnRlbnRzKCdoZWxsbyByZXZlcnQnKTtcblxuXHRcdGxldCByZXZlcnRlZENvdW50ZXIgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh3b3JraW5nQ29weS5vbkRpZFJldmVydCgoKSA9PiB7XG5cdFx0XHRyZXZlcnRlZENvdW50ZXIrKztcblx0XHR9KSk7XG5cblx0XHQvLyByZXZlcnQ6IHNvZnRcblx0XHRhd2FpdCB3b3JraW5nQ29weS5yZXZlcnQoeyBzb2Z0OiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJldmVydGVkQ291bnRlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5LmlzRGlydHkoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5tb2RlbD8uY29udGVudHMsICdoZWxsbyByZXZlcnQnKTtcblxuXHRcdC8vIHJldmVydDogbm90IGZvcmNlZFxuXHRcdGF3YWl0IHdvcmtpbmdDb3B5LnJldmVydCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXZlcnRlZENvdW50ZXIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5tb2RlbD8uY29udGVudHMsICdoZWxsbyByZXZlcnQnKTtcblxuXHRcdC8vIHJldmVydDogZm9yY2VkXG5cdFx0YXdhaXQgd29ya2luZ0NvcHkucmV2ZXJ0KHsgZm9yY2U6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJldmVydGVkQ291bnRlciwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5Lm1vZGVsPy5jb250ZW50cywgJ0hlbGxvIEh0bWwnKTtcblxuXHRcdC8vIHJldmVydDogZm9yY2VkLCBlcnJvclxuXHRcdHRyeSB7XG5cdFx0XHR3b3JraW5nQ29weS5tb2RlbD8udXBkYXRlQ29udGVudHMoJ2hlbGxvIHJldmVydCcpO1xuXHRcdFx0YWNjZXNzb3IuZmlsZVNlcnZpY2UucmVhZFNob3VsZFRocm93RXJyb3IgPSBuZXcgRmlsZU9wZXJhdGlvbkVycm9yKCdlcnJvcicsIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9QRVJNSVNTSU9OX0RFTklFRCk7XG5cblx0XHRcdGF3YWl0IHdvcmtpbmdDb3B5LnJldmVydCh7IGZvcmNlOiB0cnVlIH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBleHBlY3RlZCAob3VyIGVycm9yKVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhY2Nlc3Nvci5maWxlU2VydmljZS5yZWFkU2hvdWxkVGhyb3dFcnJvciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmV2ZXJ0ZWRDb3VudGVyLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaXNEaXJ0eSgpLCB0cnVlKTtcblxuXHRcdC8vIHJldmVydDogZm9yY2VkLCBmaWxlIG5vdCBmb3VuZCBlcnJvciBpcyBpZ25vcmVkXG5cdFx0dHJ5IHtcblx0XHRcdHdvcmtpbmdDb3B5Lm1vZGVsPy51cGRhdGVDb250ZW50cygnaGVsbG8gcmV2ZXJ0Jyk7XG5cdFx0XHRhY2Nlc3Nvci5maWxlU2VydmljZS5yZWFkU2hvdWxkVGhyb3dFcnJvciA9IG5ldyBGaWxlT3BlcmF0aW9uRXJyb3IoJ2Vycm9yJywgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCk7XG5cblx0XHRcdGF3YWl0IHdvcmtpbmdDb3B5LnJldmVydCh7IGZvcmNlOiB0cnVlIH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBleHBlY3RlZCAob3VyIGVycm9yKVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhY2Nlc3Nvci5maWxlU2VydmljZS5yZWFkU2hvdWxkVGhyb3dFcnJvciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmV2ZXJ0ZWRDb3VudGVyLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaXNEaXJ0eSgpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5TQVZFRCksIHRydWUpO1xuXG5cdFx0YXdhaXQgd29ya2luZ0NvcHkucmVzb2x2ZSh7IGNvbnRlbnRzOiBidWZmZXJUb1N0cmVhbShWU0J1ZmZlci5mcm9tU3RyaW5nKCdoZWxsbyBzdGF0ZScpKSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaGFzU3RhdGUoU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuRElSVFkpLCB0cnVlKTtcblxuXHRcdGNvbnN0IHNhdmVQcm9taXNlID0gd29ya2luZ0NvcHkuc2F2ZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5ESVJUWSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5TQVZFRCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaGFzU3RhdGUoU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuUEVORElOR19TQVZFKSwgdHJ1ZSk7XG5cblx0XHRhd2FpdCBzYXZlUHJvbWlzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5ESVJUWSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaGFzU3RhdGUoU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuU0FWRUQpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaGFzU3RhdGUoU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuUEVORElOR19TQVZFKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdqb2luU3RhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd29ya2luZ0NvcHkucmVzb2x2ZSh7IGNvbnRlbnRzOiBidWZmZXJUb1N0cmVhbShWU0J1ZmZlci5mcm9tU3RyaW5nKCdoZWxsbyBzdGF0ZScpKSB9KTtcblxuXHRcdHdvcmtpbmdDb3B5LnNhdmUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaGFzU3RhdGUoU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuUEVORElOR19TQVZFKSwgdHJ1ZSk7XG5cblx0XHRhd2FpdCB3b3JraW5nQ29weS5qb2luU3RhdGUoU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuUEVORElOR19TQVZFKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5oYXNTdGF0ZShTdG9yZWRGaWxlV29ya2luZ0NvcHlTdGF0ZS5ESVJUWSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaGFzU3RhdGUoU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuU0FWRUQpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaGFzU3RhdGUoU3RvcmVkRmlsZVdvcmtpbmdDb3B5U3RhdGUuUEVORElOR19TQVZFKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc1JlYWRvbmx5LCBpc1Jlc29sdmVkLCBkaXNwb3NlLCBpc0Rpc3Bvc2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5pc1Jlc29sdmVkKCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaXNSZWFkb25seSgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5LmlzRGlzcG9zZWQoKSwgZmFsc2UpO1xuXG5cdFx0YXdhaXQgd29ya2luZ0NvcHkucmVzb2x2ZSgpO1xuXG5cdFx0YXNzZXJ0Lm9rKHdvcmtpbmdDb3B5Lm1vZGVsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaXNSZXNvbHZlZCgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaXNSZWFkb25seSgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5LmlzRGlzcG9zZWQoKSwgZmFsc2UpO1xuXG5cdFx0bGV0IGRpc3Bvc2VkRXZlbnQgPSBmYWxzZTtcblx0XHRkaXNwb3NhYmxlcy5hZGQod29ya2luZ0NvcHkub25XaWxsRGlzcG9zZSgoKSA9PiB7XG5cdFx0XHRkaXNwb3NlZEV2ZW50ID0gdHJ1ZTtcblx0XHR9KSk7XG5cblx0XHRsZXQgZGlzcG9zZWRNb2RlbEV2ZW50ID0gZmFsc2U7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHdvcmtpbmdDb3B5Lm1vZGVsLm9uV2lsbERpc3Bvc2UoKCkgPT4ge1xuXHRcdFx0ZGlzcG9zZWRNb2RlbEV2ZW50ID0gdHJ1ZTtcblx0XHR9KSk7XG5cblx0XHR3b3JraW5nQ29weS5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaXNEaXNwb3NlZCgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZWRFdmVudCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VkTW9kZWxFdmVudCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRvbmx5IGNoYW5nZSBldmVudCcsIGFzeW5jICgpID0+IHtcblx0XHRhY2Nlc3Nvci5maWxlU2VydmljZS5yZWFkb25seSA9IHRydWU7XG5cblx0XHRhd2FpdCB3b3JraW5nQ29weS5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoISF3b3JraW5nQ29weS5pc1JlYWRvbmx5KCksIHRydWUpO1xuXG5cdFx0YWNjZXNzb3IuZmlsZVNlcnZpY2UucmVhZG9ubHkgPSBmYWxzZTtcblxuXHRcdGxldCByZWFkb25seUV2ZW50ID0gZmFsc2U7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHdvcmtpbmdDb3B5Lm9uRGlkQ2hhbmdlUmVhZG9ubHkoKCkgPT4ge1xuXHRcdFx0cmVhZG9ubHlFdmVudCA9IHRydWU7XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgd29ya2luZ0NvcHkucmVzb2x2ZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5LmlzUmVhZG9ubHkoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkb25seUV2ZW50LCB0cnVlKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLE9BQU8sZUFBZTtBQUMvQixTQUFTLFdBQVc7QUFDcEIsU0FBUyx1QkFBdUIsNEJBQTZJLHdDQUF5RTtBQUN0UCxTQUFTLGdCQUFnQiwwQkFBMEIsZ0JBQWdCLGdCQUF3QztBQUMzRyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMseUJBQXlCLHFCQUFxQixxQ0FBcUM7QUFFNUYsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxrQkFBa0IsZ0JBQWdCLG9CQUFvQixxQkFBK0QsMENBQTBDO0FBQ3hLLFNBQVMsWUFBWSwwQkFBMEI7QUFDL0MsU0FBUyxVQUFVLGVBQWU7QUFDbEMsU0FBUyxpQkFBaUIsZUFBZSx3QkFBd0I7QUFDakUsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyw0QkFBNEI7QUFFOUIsTUFBTSx1Q0FBdUMsV0FBa0Q7QUFBQSxFQVFyRyxZQUFxQixVQUFzQixVQUFrQjtBQUM1RCxVQUFNO0FBRGM7QUFBc0I7QUFOM0MsU0FBaUIsc0JBQXNCLEtBQUssVUFBVSxJQUFJLFFBQXdELENBQUM7QUFDbkgsU0FBUyxxQkFBcUIsS0FBSyxvQkFBb0I7QUFFdkQsU0FBaUIsaUJBQWlCLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUNw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QUFXLEdBQUcsSUFBSTtBQUNqRCxXQUFPLFlBQVksZUFBZSxJQUFJO0FBQ3RDLFdBQU8sWUFBWSxvQkFBb0IsSUFBSTtBQUFBLEVBQzVDLENBQUM7QUFFRCxPQUFLLHlCQUF5QixZQUFZO0FBQ3pDLGFBQVMsWUFBWSxXQUFXO0FBRWhDLFVBQU0sWUFBWSxRQUFRO0FBRTFCLFdBQU8sWUFBWSxDQUFDLENBQUMsWUFBWSxXQUFXLEdBQUcsSUFBSTtBQUVuRCxhQUFTLFlBQVksV0FBVztBQUVoQyxRQUFJLGdCQUFnQjtBQUNwQixnQkFBWSxJQUFJLFlBQVksb0JBQW9CLE1BQU07QUFDckQsc0JBQWdCO0FBQUEsSUFDakIsQ0FBQyxDQUFDO0FBRUYsVUFBTSxZQUFZLFFBQVE7QUFFMUIsV0FBTyxZQUFZLFlBQVksV0FBVyxHQUFHLEtBQUs7QUFDbEQsV0FBTyxZQUFZLGVBQWUsSUFBSTtBQUFBLEVBQ3ZDLENBQUM7QUFFRCwwQ0FBd0M7QUFDekMsQ0FBQzsiLAogICJuYW1lcyI6IFsid29ya2luZ0NvcHkiLCAicmVzIl0KfQo=
