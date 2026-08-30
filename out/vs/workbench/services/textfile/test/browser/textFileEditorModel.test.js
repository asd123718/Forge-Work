import assert from "assert";
import { TextFileEditorModel } from "../../common/textFileEditorModel.js";
import { EncodingMode, TextFileEditorModelState, snapshotToString, isTextFileEditorModel } from "../../common/textfiles.js";
import { createFileEditorInput, workbenchInstantiationService, TestServiceAccessor, TestReadonlyTextFileEditorModel, getLastResolvedFileStat } from "../../../../test/browser/workbenchTestServices.js";
import { assertThrowsAsync, ensureNoDisposablesAreLeakedInTestSuite, toResource } from "../../../../../base/test/common/utils.js";
import { FileOperationResult, FileOperationError, NotModifiedSinceFileOperationError } from "../../../../../platform/files/common/files.js";
import { DeferredPromise, timeout } from "../../../../../base/common/async.js";
import { assertReturnsDefined } from "../../../../../base/common/types.js";
import { createTextBufferFactory } from "../../../../../editor/common/model/textModel.js";
import { DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { SaveReason, SaveSourceRegistry } from "../../../../common/editor.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { UTF16be } from "../../common/encoding.js";
import { isWeb } from "../../../../../base/common/platform.js";
import { URI } from "../../../../../base/common/uri.js";
suite("Files - TextFileEditorModel", () => {
  function getLastModifiedTime(model) {
    const stat = getLastResolvedFileStat(model);
    return stat ? stat.mtime : -1;
  }
  const disposables = new DisposableStore();
  let instantiationService;
  let accessor;
  let content;
  setup(() => {
    instantiationService = workbenchInstantiationService(void 0, disposables);
    accessor = instantiationService.createInstance(TestServiceAccessor);
    content = accessor.fileService.getContent();
    disposables.add(accessor.textFileService.files);
    disposables.add(toDisposable(() => accessor.fileService.setContent(content)));
  });
  teardown(async () => {
    for (const textFileEditorModel of accessor.textFileService.files.models) {
      textFileEditorModel.dispose();
    }
    disposables.clear();
  });
  test("basic events", async function() {
    const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0));
    accessor.workingCopyService.testUnregisterWorkingCopy(model);
    let onDidResolveCounter = 0;
    disposables.add(model.onDidResolve(() => onDidResolveCounter++));
    await model.resolve();
    assert.strictEqual(onDidResolveCounter, 1);
    let onDidChangeContentCounter = 0;
    disposables.add(model.onDidChangeContent(() => onDidChangeContentCounter++));
    let onDidChangeDirtyCounter = 0;
    disposables.add(model.onDidChangeDirty(() => onDidChangeDirtyCounter++));
    model.updateTextEditorModel(createTextBufferFactory("bar"));
    assert.strictEqual(onDidChangeContentCounter, 1);
    assert.strictEqual(onDidChangeDirtyCounter, 1);
    model.updateTextEditorModel(createTextBufferFactory("foo"));
    assert.strictEqual(onDidChangeContentCounter, 2);
    assert.strictEqual(onDidChangeDirtyCounter, 1);
    await model.revert();
    assert.strictEqual(onDidChangeDirtyCounter, 2);
  });
  test("isTextFileEditorModel", async function() {
    const model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0);
    assert.strictEqual(isTextFileEditorModel(model), true);
    model.dispose();
  });
  test("save", async function() {
    const model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0);
    await model.resolve();
    assert.strictEqual(accessor.workingCopyService.dirtyCount, 0);
    let savedEvent = void 0;
    disposables.add(model.onDidSave((e) => savedEvent = e));
    await model.save();
    assert.ok(!savedEvent);
    model.updateTextEditorModel(createTextBufferFactory("bar"));
    assert.ok(getLastModifiedTime(model) <= Date.now());
    assert.ok(model.hasState(TextFileEditorModelState.DIRTY));
    assert.ok(model.isModified());
    assert.strictEqual(accessor.workingCopyService.dirtyCount, 1);
    assert.strictEqual(accessor.workingCopyService.isDirty(model.resource, model.typeId), true);
    let workingCopyEvent = false;
    disposables.add(accessor.workingCopyService.onDidChangeDirty((e) => {
      if (e.resource.toString() === model.resource.toString()) {
        workingCopyEvent = true;
      }
    }));
    const source = SaveSourceRegistry.registerSource("testSource", "Hello Save");
    const pendingSave = model.save({ reason: SaveReason.AUTO, source });
    assert.ok(model.hasState(TextFileEditorModelState.PENDING_SAVE));
    await Promise.all([pendingSave, model.joinState(TextFileEditorModelState.PENDING_SAVE)]);
    assert.ok(model.hasState(TextFileEditorModelState.SAVED));
    assert.ok(!model.isDirty());
    assert.ok(!model.isModified());
    assert.ok(savedEvent);
    assert.ok(savedEvent.stat);
    assert.strictEqual(savedEvent.reason, SaveReason.AUTO);
    assert.strictEqual(savedEvent.source, source);
    assert.ok(workingCopyEvent);
    assert.strictEqual(accessor.workingCopyService.dirtyCount, 0);
    assert.strictEqual(accessor.workingCopyService.isDirty(model.resource, model.typeId), false);
    savedEvent = void 0;
    await model.save({ force: true });
    assert.ok(savedEvent);
    model.dispose();
    assert.ok(!accessor.modelService.getModel(model.resource));
  });
  test("save - touching also emits saved event", async function() {
    const model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0);
    await model.resolve();
    let savedEvent = false;
    disposables.add(model.onDidSave(() => savedEvent = true));
    let workingCopyEvent = false;
    disposables.add(accessor.workingCopyService.onDidChangeDirty((e) => {
      if (e.resource.toString() === model.resource.toString()) {
        workingCopyEvent = true;
      }
    }));
    await model.save({ force: true });
    assert.ok(savedEvent);
    assert.ok(!workingCopyEvent);
    model.dispose();
    assert.ok(!accessor.modelService.getModel(model.resource));
  });
  test("save - touching with error turns model dirty", async function() {
    const model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0);
    await model.resolve();
    let saveErrorEvent = false;
    disposables.add(model.onDidSaveError(() => saveErrorEvent = true));
    let savedEvent = false;
    disposables.add(model.onDidSave(() => savedEvent = true));
    accessor.fileService.writeShouldThrowError = new Error("failed to write");
    try {
      await model.save({ force: true });
      assert.ok(model.hasState(TextFileEditorModelState.ERROR));
      assert.ok(model.isDirty());
      assert.ok(model.isModified());
      assert.ok(saveErrorEvent);
      assert.strictEqual(accessor.workingCopyService.dirtyCount, 1);
      assert.strictEqual(accessor.workingCopyService.isDirty(model.resource, model.typeId), true);
    } finally {
      accessor.fileService.writeShouldThrowError = void 0;
    }
    await model.save({ force: true });
    assert.ok(savedEvent);
    assert.strictEqual(model.isDirty(), false);
    model.dispose();
    assert.ok(!accessor.modelService.getModel(model.resource));
  });
  test("save - returns false when save fails", async function() {
    const model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0);
    await model.resolve();
    accessor.fileService.writeShouldThrowError = new Error("failed to write");
    try {
      const res2 = await model.save({ force: true });
      assert.strictEqual(res2, false);
    } finally {
      accessor.fileService.writeShouldThrowError = void 0;
    }
    const res = await model.save({ force: true });
    assert.strictEqual(res, true);
    model.dispose();
    assert.ok(!accessor.modelService.getModel(model.resource));
  });
  test("save error (generic)", async function() {
    const model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0);
    await model.resolve();
    model.updateTextEditorModel(createTextBufferFactory("bar"));
    let saveErrorEvent = false;
    disposables.add(model.onDidSaveError(() => saveErrorEvent = true));
    accessor.fileService.writeShouldThrowError = new Error("failed to write");
    try {
      const pendingSave = model.save();
      assert.ok(model.hasState(TextFileEditorModelState.PENDING_SAVE));
      await pendingSave;
      assert.ok(model.hasState(TextFileEditorModelState.ERROR));
      assert.ok(model.isDirty());
      assert.ok(model.isModified());
      assert.ok(saveErrorEvent);
      assert.strictEqual(accessor.workingCopyService.dirtyCount, 1);
      assert.strictEqual(accessor.workingCopyService.isDirty(model.resource, model.typeId), true);
      model.dispose();
    } finally {
      accessor.fileService.writeShouldThrowError = void 0;
    }
  });
  test("save error (conflict)", async function() {
    const model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0);
    await model.resolve();
    model.updateTextEditorModel(createTextBufferFactory("bar"));
    let saveErrorEvent = false;
    disposables.add(model.onDidSaveError(() => saveErrorEvent = true));
    accessor.fileService.writeShouldThrowError = new FileOperationError("save conflict", FileOperationResult.FILE_MODIFIED_SINCE);
    try {
      const pendingSave = model.save();
      assert.ok(model.hasState(TextFileEditorModelState.PENDING_SAVE));
      await pendingSave;
      assert.ok(model.hasState(TextFileEditorModelState.CONFLICT));
      assert.ok(model.isDirty());
      assert.ok(model.isModified());
      assert.ok(saveErrorEvent);
      assert.strictEqual(accessor.workingCopyService.dirtyCount, 1);
      assert.strictEqual(accessor.workingCopyService.isDirty(model.resource, model.typeId), true);
      model.dispose();
    } finally {
      accessor.fileService.writeShouldThrowError = void 0;
    }
  });
  test("setEncoding - encode", async function() {
    const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0));
    let encodingEvent = false;
    disposables.add(model.onDidChangeEncoding(() => encodingEvent = true));
    await model.setEncoding("utf8", EncodingMode.Encode);
    assert.strictEqual(getLastModifiedTime(model), -1);
    assert.ok(!encodingEvent);
    await model.setEncoding("utf16", EncodingMode.Encode);
    assert.ok(encodingEvent);
    assert.ok(getLastModifiedTime(model) <= Date.now());
  });
  test("setEncoding - decode", async function() {
    let model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0));
    accessor.workingCopyService.testUnregisterWorkingCopy(model);
    await model.setEncoding("utf16", EncodingMode.Decode);
    model = accessor.workingCopyService.get(model);
    assert.ok(model.isResolved());
  });
  test("setEncoding - decode dirty file throws", async function() {
    const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0));
    accessor.workingCopyService.testUnregisterWorkingCopy(model);
    await model.resolve();
    model.updateTextEditorModel(createTextBufferFactory("bar"));
    assert.strictEqual(model.isDirty(), true);
    assertThrowsAsync(() => model.setEncoding("utf16", EncodingMode.Decode));
  });
  test("encoding updates with language based configuration", async function() {
    const languageId = "text-file-model-test";
    disposables.add(accessor.languageService.registerLanguage({
      id: languageId
    }));
    accessor.testConfigurationService.setOverrideIdentifiers("files.encoding", [languageId]);
    const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0));
    accessor.workingCopyService.testUnregisterWorkingCopy(model);
    await model.resolve();
    const deferredPromise = new DeferredPromise();
    disposables.add(accessor.workingCopyService.onDidRegister((e) => {
      if (isEqual(e.resource, model.resource)) {
        deferredPromise.complete(model);
      }
    }));
    accessor.testConfigurationService.setUserConfiguration("files.encoding", UTF16be);
    model.setLanguageId(languageId);
    await deferredPromise.p;
  });
  test("create with language", async function() {
    const languageId = "text-file-model-test";
    disposables.add(accessor.languageService.registerLanguage({
      id: languageId
    }));
    const model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", languageId);
    await model.resolve();
    assert.strictEqual(model.textEditorModel.getLanguageId(), languageId);
    model.dispose();
    assert.ok(!accessor.modelService.getModel(model.resource));
  });
  test("disposes when underlying model is destroyed", async function() {
    const model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0);
    await model.resolve();
    model.textEditorModel.dispose();
    assert.ok(model.isDisposed());
  });
  test("Resolve does not trigger save", async function() {
    const model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index.txt"), "utf8", void 0);
    assert.ok(model.hasState(TextFileEditorModelState.SAVED));
    disposables.add(model.onDidSave(() => assert.fail()));
    disposables.add(model.onDidChangeDirty(() => assert.fail()));
    await model.resolve();
    assert.ok(model.isResolved());
    model.dispose();
    assert.ok(!accessor.modelService.getModel(model.resource));
  });
  test("Resolve returns dirty model as long as model is dirty", async function() {
    const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0));
    await model.resolve();
    model.updateTextEditorModel(createTextBufferFactory("foo"));
    assert.ok(model.isDirty());
    assert.ok(model.hasState(TextFileEditorModelState.DIRTY));
    await model.resolve();
    assert.ok(model.isDirty());
  });
  test("Resolve with contents", async function() {
    const model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0);
    await model.resolve({ contents: createTextBufferFactory("Hello World") });
    assert.strictEqual(model.textEditorModel?.getValue(), "Hello World");
    assert.strictEqual(model.isDirty(), true);
    await model.resolve({ contents: createTextBufferFactory("Hello Changes") });
    assert.strictEqual(model.textEditorModel?.getValue(), "Hello Changes");
    assert.strictEqual(model.isDirty(), true);
    await model.textEditorModel.undo();
    assert.ok(model.isDirty());
    model.dispose();
    assert.ok(!accessor.modelService.getModel(model.resource));
  });
  test("Revert", async function() {
    let eventCounter = 0;
    let model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0));
    disposables.add(model.onDidRevert(() => eventCounter++));
    let workingCopyEvent = false;
    disposables.add(accessor.workingCopyService.onDidChangeDirty((e) => {
      if (e.resource.toString() === model.resource.toString()) {
        workingCopyEvent = true;
      }
    }));
    await model.resolve();
    model.updateTextEditorModel(createTextBufferFactory("foo"));
    assert.ok(model.isDirty());
    assert.ok(model.isModified());
    assert.strictEqual(accessor.workingCopyService.dirtyCount, 1);
    assert.strictEqual(accessor.workingCopyService.isDirty(model.resource, model.typeId), true);
    accessor.workingCopyService.testUnregisterWorkingCopy(model);
    await model.revert();
    model = accessor.workingCopyService.get(model);
    assert.strictEqual(model.isDirty(), false);
    assert.strictEqual(model.isModified(), false);
    assert.strictEqual(eventCounter, 1);
    assert.ok(workingCopyEvent);
    assert.strictEqual(accessor.workingCopyService.dirtyCount, 0);
    assert.strictEqual(accessor.workingCopyService.isDirty(model.resource, model.typeId), false);
  });
  test("Revert (soft)", async function() {
    let eventCounter = 0;
    const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0));
    disposables.add(model.onDidRevert(() => eventCounter++));
    let workingCopyEvent = false;
    disposables.add(accessor.workingCopyService.onDidChangeDirty((e) => {
      if (e.resource.toString() === model.resource.toString()) {
        workingCopyEvent = true;
      }
    }));
    await model.resolve();
    model.updateTextEditorModel(createTextBufferFactory("foo"));
    assert.ok(model.isDirty());
    assert.ok(model.isModified());
    assert.strictEqual(accessor.workingCopyService.dirtyCount, 1);
    assert.strictEqual(accessor.workingCopyService.isDirty(model.resource, model.typeId), true);
    await model.revert({ soft: true });
    assert.strictEqual(model.isDirty(), false);
    assert.strictEqual(model.isModified(), false);
    assert.strictEqual(model.textEditorModel.getValue(), "foo");
    assert.strictEqual(eventCounter, 1);
    assert.ok(workingCopyEvent);
    assert.strictEqual(accessor.workingCopyService.dirtyCount, 0);
    assert.strictEqual(accessor.workingCopyService.isDirty(model.resource, model.typeId), false);
  });
  test("Undo to saved state turns model non-dirty", async function() {
    const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0));
    await model.resolve();
    model.updateTextEditorModel(createTextBufferFactory("Hello Text"));
    assert.ok(model.isDirty());
    await model.textEditorModel.undo();
    assert.ok(!model.isDirty());
  });
  test("Resolve and undo turns model dirty", async function() {
    const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0));
    await model.resolve();
    accessor.fileService.setContent("Hello Change");
    await model.resolve();
    await model.textEditorModel.undo();
    assert.ok(model.isDirty());
    assert.strictEqual(accessor.workingCopyService.dirtyCount, 1);
    assert.strictEqual(accessor.workingCopyService.isDirty(model.resource, model.typeId), true);
  });
  test("Update Dirty", async function() {
    let eventCounter = 0;
    const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0));
    model.setDirty(true);
    assert.ok(!model.isDirty());
    await model.resolve();
    model.updateTextEditorModel(createTextBufferFactory("foo"));
    assert.ok(model.isDirty());
    await model.revert({ soft: true });
    assert.strictEqual(model.isDirty(), false);
    disposables.add(model.onDidChangeDirty(() => eventCounter++));
    let workingCopyEvent = false;
    disposables.add(accessor.workingCopyService.onDidChangeDirty((e) => {
      if (e.resource.toString() === model.resource.toString()) {
        workingCopyEvent = true;
      }
    }));
    model.setDirty(true);
    assert.ok(model.isDirty());
    assert.strictEqual(eventCounter, 1);
    assert.ok(workingCopyEvent);
    model.setDirty(false);
    assert.strictEqual(model.isDirty(), false);
    assert.strictEqual(eventCounter, 2);
  });
  test("No Dirty or saving for readonly models", async function() {
    let workingCopyEvent = false;
    disposables.add(accessor.workingCopyService.onDidChangeDirty((e) => {
      if (e.resource.toString() === model.resource.toString()) {
        workingCopyEvent = true;
      }
    }));
    const model = disposables.add(instantiationService.createInstance(TestReadonlyTextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0));
    let saveEvent = false;
    disposables.add(model.onDidSave(() => {
      saveEvent = true;
    }));
    await model.resolve();
    model.updateTextEditorModel(createTextBufferFactory("foo"));
    assert.ok(!model.isDirty());
    await model.save({ force: true });
    assert.strictEqual(saveEvent, false);
    await model.revert({ soft: true });
    assert.ok(!model.isDirty());
    assert.ok(!workingCopyEvent);
  });
  test("File not modified error is handled gracefully", async function() {
    const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0));
    await model.resolve();
    const mtime = getLastModifiedTime(model);
    accessor.textFileService.setReadStreamErrorOnce(new FileOperationError("error", FileOperationResult.FILE_NOT_MODIFIED_SINCE));
    await model.resolve();
    assert.ok(model);
    assert.strictEqual(getLastModifiedTime(model), mtime);
  });
  test("stat.readonly and stat.locked can change when decreased mtime is ignored", async function() {
    const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0));
    await model.resolve();
    const stat = assertReturnsDefined(getLastResolvedFileStat(model));
    accessor.textFileService.setReadStreamErrorOnce(new NotModifiedSinceFileOperationError("error", { ...stat, mtime: stat.mtime - 1, readonly: !stat.readonly, locked: !stat.locked }));
    await model.resolve();
    assert.ok(model);
    assert.strictEqual(getLastModifiedTime(model), stat.mtime, "mtime should not decrease");
    assert.notStrictEqual(getLastResolvedFileStat(model)?.readonly, stat.readonly, "readonly should have changed despite simultaneous attempt to decrease mtime");
    assert.notStrictEqual(getLastResolvedFileStat(model)?.locked, stat.locked, "locked should have changed despite simultaneous attempt to decrease mtime");
  });
  test("Resolve error is handled gracefully if model already exists", async function() {
    const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0));
    await model.resolve();
    accessor.textFileService.setReadStreamErrorOnce(new FileOperationError("error", FileOperationResult.FILE_NOT_FOUND));
    await model.resolve();
    assert.ok(model);
  });
  test("save() and isDirty() - proper with check for mtimes", async function() {
    const input1 = disposables.add(createFileEditorInput(instantiationService, toResource.call(this, "/path/index_async2.txt")));
    const input2 = disposables.add(createFileEditorInput(instantiationService, toResource.call(this, "/path/index_async.txt")));
    const model1 = disposables.add(await input1.resolve());
    const model2 = disposables.add(await input2.resolve());
    model1.updateTextEditorModel(createTextBufferFactory("foo"));
    const m1Mtime = assertReturnsDefined(getLastResolvedFileStat(model1)).mtime;
    const m2Mtime = assertReturnsDefined(getLastResolvedFileStat(model2)).mtime;
    assert.ok(m1Mtime > 0);
    assert.ok(m2Mtime > 0);
    assert.ok(accessor.textFileService.isDirty(toResource.call(this, "/path/index_async2.txt")));
    assert.ok(!accessor.textFileService.isDirty(toResource.call(this, "/path/index_async.txt")));
    model2.updateTextEditorModel(createTextBufferFactory("foo"));
    assert.ok(accessor.textFileService.isDirty(toResource.call(this, "/path/index_async.txt")));
    await timeout(10);
    await accessor.textFileService.save(toResource.call(this, "/path/index_async.txt"));
    await accessor.textFileService.save(toResource.call(this, "/path/index_async2.txt"));
    assert.ok(!accessor.textFileService.isDirty(toResource.call(this, "/path/index_async.txt")));
    assert.ok(!accessor.textFileService.isDirty(toResource.call(this, "/path/index_async2.txt")));
    if (isWeb) {
      assert.ok(assertReturnsDefined(getLastResolvedFileStat(model1)).mtime >= m1Mtime);
      assert.ok(assertReturnsDefined(getLastResolvedFileStat(model2)).mtime >= m2Mtime);
    } else {
      assert.ok(assertReturnsDefined(getLastResolvedFileStat(model1)).mtime > m1Mtime);
      assert.ok(assertReturnsDefined(getLastResolvedFileStat(model2)).mtime > m2Mtime);
    }
  });
  test("Save Participant", async function() {
    let eventCounter = 0;
    const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0));
    disposables.add(model.onDidSave(() => {
      assert.strictEqual(snapshotToString(model.createSnapshot()), eventCounter === 1 ? "bar" : "foobar");
      assert.ok(!model.isDirty());
      eventCounter++;
    }));
    const participant = accessor.textFileService.files.addSaveParticipant({
      participate: async (model2) => {
        assert.ok(model2.isDirty());
        model2.updateTextEditorModel(createTextBufferFactory("bar"));
        assert.ok(model2.isDirty());
        eventCounter++;
      }
    });
    await model.resolve();
    model.updateTextEditorModel(createTextBufferFactory("foo"));
    assert.ok(model.isDirty());
    await model.save();
    assert.strictEqual(eventCounter, 2);
    participant.dispose();
    model.updateTextEditorModel(createTextBufferFactory("foobar"));
    assert.ok(model.isDirty());
    await model.save();
    assert.strictEqual(eventCounter, 3);
  });
  test("Save Participant - skip", async function() {
    let eventCounter = 0;
    const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0));
    disposables.add(accessor.textFileService.files.addSaveParticipant({
      participate: async () => {
        eventCounter++;
      }
    }));
    await model.resolve();
    model.updateTextEditorModel(createTextBufferFactory("foo"));
    await model.save({ skipSaveParticipants: true });
    assert.strictEqual(eventCounter, 0);
  });
  test("Save Participant, async participant", async function() {
    let eventCounter = 0;
    const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0));
    disposables.add(model.onDidSave(() => {
      assert.ok(!model.isDirty());
      eventCounter++;
    }));
    disposables.add(accessor.textFileService.files.addSaveParticipant({
      participate: (model2) => {
        assert.ok(model2.isDirty());
        model2.updateTextEditorModel(createTextBufferFactory("bar"));
        assert.ok(model2.isDirty());
        eventCounter++;
        return timeout(10);
      }
    }));
    await model.resolve();
    model.updateTextEditorModel(createTextBufferFactory("foo"));
    const now = Date.now();
    await model.save();
    assert.strictEqual(eventCounter, 2);
    assert.ok(Date.now() - now >= 10);
  });
  test("Save Participant, bad participant", async function() {
    const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0));
    disposables.add(accessor.textFileService.files.addSaveParticipant({
      participate: async () => {
        new Error("boom");
      }
    }));
    await model.resolve();
    model.updateTextEditorModel(createTextBufferFactory("foo"));
    await model.save();
  });
  test("Save Participant, participant cancelled when saved again", async function() {
    const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0));
    const participations = [];
    disposables.add(accessor.textFileService.files.addSaveParticipant({
      participate: async (model2, context, progress, token) => {
        await timeout(10);
        if (!token.isCancellationRequested) {
          participations.push(true);
        }
      }
    }));
    await model.resolve();
    model.updateTextEditorModel(createTextBufferFactory("foo"));
    const p1 = model.save();
    model.updateTextEditorModel(createTextBufferFactory("foo 1"));
    const p2 = model.save();
    model.updateTextEditorModel(createTextBufferFactory("foo 2"));
    const p3 = model.save();
    model.updateTextEditorModel(createTextBufferFactory("foo 3"));
    const p4 = model.save();
    await Promise.all([p1, p2, p3, p4]);
    assert.strictEqual(participations.length, 1);
  });
  test("Save Participant, calling save from within is unsupported but does not explode (sync save, no model change)", async function() {
    const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0));
    await testSaveFromSaveParticipant(model, false, false, false);
  });
  test("Save Participant, calling save from within is unsupported but does not explode (async save, no model change)", async function() {
    const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0));
    await testSaveFromSaveParticipant(model, true, false, false);
  });
  test("Save Participant, calling save from within is unsupported but does not explode (sync save, model change)", async function() {
    const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0));
    await testSaveFromSaveParticipant(model, false, true, false);
  });
  test("Save Participant, calling save from within is unsupported but does not explode (async save, model change)", async function() {
    const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0));
    await testSaveFromSaveParticipant(model, true, true, false);
  });
  test("Save Participant, calling save from within is unsupported but does not explode (force)", async function() {
    const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0));
    await testSaveFromSaveParticipant(model, false, false, true);
  });
  async function testSaveFromSaveParticipant(model, async, modelChange, force) {
    disposables.add(accessor.textFileService.files.addSaveParticipant({
      participate: async () => {
        if (async) {
          await timeout(10);
        }
        if (modelChange) {
          model.updateTextEditorModel(createTextBufferFactory("bar"));
          const newSavePromise = model.save(force ? { force } : void 0);
          assert.notStrictEqual(savePromise, newSavePromise);
          await newSavePromise;
        } else {
          const newSavePromise = model.save(force ? { force } : void 0);
          assert.strictEqual(savePromise, newSavePromise);
          await savePromise;
        }
      }
    }));
    await model.resolve();
    model.updateTextEditorModel(createTextBufferFactory("foo"));
    const savePromise = model.save(force ? { force } : void 0);
    await savePromise;
  }
  test("Save Participant carries context", async function() {
    const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/index_async.txt"), "utf8", void 0));
    const from = URI.file("testFrom");
    let e = void 0;
    disposables.add(accessor.textFileService.files.addSaveParticipant({
      participate: async (wc, context) => {
        try {
          assert.strictEqual(context.reason, SaveReason.EXPLICIT);
          assert.strictEqual(context.savedFrom?.toString(), from.toString());
        } catch (error) {
          e = error;
        }
      }
    }));
    await model.resolve();
    model.updateTextEditorModel(createTextBufferFactory("foo"));
    await model.save({ force: true, from });
    if (e) {
      throw e;
    }
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0ZXh0ZmlsZVxcdGVzdFxcYnJvd3NlclxcdGV4dEZpbGVFZGl0b3JNb2RlbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXh0RmlsZUVkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL3RleHRGaWxlRWRpdG9yTW9kZWwuanMnO1xuaW1wb3J0IHsgRW5jb2RpbmdNb2RlLCBUZXh0RmlsZUVkaXRvck1vZGVsU3RhdGUsIHNuYXBzaG90VG9TdHJpbmcsIGlzVGV4dEZpbGVFZGl0b3JNb2RlbCwgSVRleHRGaWxlRWRpdG9yTW9kZWxTYXZlRXZlbnQgfSBmcm9tICcuLi8uLi9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUZpbGVFZGl0b3JJbnB1dCwgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UsIFRlc3RTZXJ2aWNlQWNjZXNzb3IsIFRlc3RSZWFkb25seVRleHRGaWxlRWRpdG9yTW9kZWwsIGdldExhc3RSZXNvbHZlZEZpbGVTdGF0IH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRUaHJvd3NBc3luYywgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlLCB0b1Jlc291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlciB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uUmVzdWx0LCBGaWxlT3BlcmF0aW9uRXJyb3IsIE5vdE1vZGlmaWVkU2luY2VGaWxlT3BlcmF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNhdmVSZWFzb24sIFNhdmVTb3VyY2VSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVVEYxNmJlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2VuY29kaW5nLmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcblxuc3VpdGUoJ0ZpbGVzIC0gVGV4dEZpbGVFZGl0b3JNb2RlbCcsICgpID0+IHtcblxuXHRmdW5jdGlvbiBnZXRMYXN0TW9kaWZpZWRUaW1lKG1vZGVsOiBUZXh0RmlsZUVkaXRvck1vZGVsKTogbnVtYmVyIHtcblx0XHRjb25zdCBzdGF0ID0gZ2V0TGFzdFJlc29sdmVkRmlsZVN0YXQobW9kZWwpO1xuXG5cdFx0cmV0dXJuIHN0YXQgPyBzdGF0Lm10aW1lIDogLTE7XG5cdH1cblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBhY2Nlc3NvcjogVGVzdFNlcnZpY2VBY2Nlc3Nvcjtcblx0bGV0IGNvbnRlbnQ6IHN0cmluZztcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHRhY2Nlc3NvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTZXJ2aWNlQWNjZXNzb3IpO1xuXHRcdGNvbnRlbnQgPSBhY2Nlc3Nvci5maWxlU2VydmljZS5nZXRDb250ZW50KCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKDxUZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlcj5hY2Nlc3Nvci50ZXh0RmlsZVNlcnZpY2UuZmlsZXMpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gYWNjZXNzb3IuZmlsZVNlcnZpY2Uuc2V0Q29udGVudChjb250ZW50KSkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bihhc3luYyAoKSA9PiB7XG5cdFx0Zm9yIChjb25zdCB0ZXh0RmlsZUVkaXRvck1vZGVsIG9mIGFjY2Vzc29yLnRleHRGaWxlU2VydmljZS5maWxlcy5tb2RlbHMpIHtcblx0XHRcdHRleHRGaWxlRWRpdG9yTW9kZWwuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Jhc2ljIGV2ZW50cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0RmlsZUVkaXRvck1vZGVsLCB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2luZGV4X2FzeW5jLnR4dCcpLCAndXRmOCcsIHVuZGVmaW5lZCkpO1xuXHRcdGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS50ZXN0VW5yZWdpc3RlcldvcmtpbmdDb3B5KG1vZGVsKTsgLy8gY2F1c2VzIGlzc3VlcyB3aXRoIHN1YnNlcXVlbnQgcmVzb2x2ZXMgb3RoZXJ3aXNlXG5cblx0XHRsZXQgb25EaWRSZXNvbHZlQ291bnRlciA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsLm9uRGlkUmVzb2x2ZSgoKSA9PiBvbkRpZFJlc29sdmVDb3VudGVyKyspKTtcblxuXHRcdGF3YWl0IG1vZGVsLnJlc29sdmUoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvbkRpZFJlc29sdmVDb3VudGVyLCAxKTtcblxuXHRcdGxldCBvbkRpZENoYW5nZUNvbnRlbnRDb3VudGVyID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwub25EaWRDaGFuZ2VDb250ZW50KCgpID0+IG9uRGlkQ2hhbmdlQ29udGVudENvdW50ZXIrKykpO1xuXG5cdFx0bGV0IG9uRGlkQ2hhbmdlRGlydHlDb3VudGVyID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwub25EaWRDaGFuZ2VEaXJ0eSgoKSA9PiBvbkRpZENoYW5nZURpcnR5Q291bnRlcisrKSk7XG5cblx0XHRtb2RlbC51cGRhdGVUZXh0RWRpdG9yTW9kZWwoY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnkoJ2JhcicpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvbkRpZENoYW5nZUNvbnRlbnRDb3VudGVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob25EaWRDaGFuZ2VEaXJ0eUNvdW50ZXIsIDEpO1xuXG5cdFx0bW9kZWwudXBkYXRlVGV4dEVkaXRvck1vZGVsKGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5KCdmb28nKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob25EaWRDaGFuZ2VDb250ZW50Q291bnRlciwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9uRGlkQ2hhbmdlRGlydHlDb3VudGVyLCAxKTtcblxuXHRcdGF3YWl0IG1vZGVsLnJldmVydCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9uRGlkQ2hhbmdlRGlydHlDb3VudGVyLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnaXNUZXh0RmlsZUVkaXRvck1vZGVsJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG1vZGVsOiBUZXh0RmlsZUVkaXRvck1vZGVsID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGV4dEZpbGVFZGl0b3JNb2RlbCwgdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9pbmRleF9hc3luYy50eHQnKSwgJ3V0ZjgnLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVGV4dEZpbGVFZGl0b3JNb2RlbChtb2RlbCksIHRydWUpO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdzYXZlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG1vZGVsOiBUZXh0RmlsZUVkaXRvck1vZGVsID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGV4dEZpbGVFZGl0b3JNb2RlbCwgdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9pbmRleF9hc3luYy50eHQnKSwgJ3V0ZjgnLCB1bmRlZmluZWQpO1xuXG5cdFx0YXdhaXQgbW9kZWwucmVzb2x2ZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS5kaXJ0eUNvdW50LCAwKTtcblxuXHRcdGxldCBzYXZlZEV2ZW50OiBJVGV4dEZpbGVFZGl0b3JNb2RlbFNhdmVFdmVudCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwub25EaWRTYXZlKGUgPT4gc2F2ZWRFdmVudCA9IGUpKTtcblxuXHRcdGF3YWl0IG1vZGVsLnNhdmUoKTtcblx0XHRhc3NlcnQub2soIXNhdmVkRXZlbnQpO1xuXG5cdFx0bW9kZWwudXBkYXRlVGV4dEVkaXRvck1vZGVsKGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5KCdiYXInKSk7XG5cdFx0YXNzZXJ0Lm9rKGdldExhc3RNb2RpZmllZFRpbWUobW9kZWwpIDw9IERhdGUubm93KCkpO1xuXHRcdGFzc2VydC5vayhtb2RlbC5oYXNTdGF0ZShUZXh0RmlsZUVkaXRvck1vZGVsU3RhdGUuRElSVFkpKTtcblx0XHRhc3NlcnQub2sobW9kZWwuaXNNb2RpZmllZCgpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2UuZGlydHlDb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS5pc0RpcnR5KG1vZGVsLnJlc291cmNlLCBtb2RlbC50eXBlSWQpLCB0cnVlKTtcblxuXHRcdGxldCB3b3JraW5nQ29weUV2ZW50ID0gZmFsc2U7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS5vbkRpZENoYW5nZURpcnR5KGUgPT4ge1xuXHRcdFx0aWYgKGUucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gbW9kZWwucmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0XHR3b3JraW5nQ29weUV2ZW50ID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBzb3VyY2UgPSBTYXZlU291cmNlUmVnaXN0cnkucmVnaXN0ZXJTb3VyY2UoJ3Rlc3RTb3VyY2UnLCAnSGVsbG8gU2F2ZScpO1xuXHRcdGNvbnN0IHBlbmRpbmdTYXZlID0gbW9kZWwuc2F2ZSh7IHJlYXNvbjogU2F2ZVJlYXNvbi5BVVRPLCBzb3VyY2UgfSk7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVsLmhhc1N0YXRlKFRleHRGaWxlRWRpdG9yTW9kZWxTdGF0ZS5QRU5ESU5HX1NBVkUpKTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtwZW5kaW5nU2F2ZSwgbW9kZWwuam9pblN0YXRlKFRleHRGaWxlRWRpdG9yTW9kZWxTdGF0ZS5QRU5ESU5HX1NBVkUpXSk7XG5cblx0XHRhc3NlcnQub2sobW9kZWwuaGFzU3RhdGUoVGV4dEZpbGVFZGl0b3JNb2RlbFN0YXRlLlNBVkVEKSk7XG5cdFx0YXNzZXJ0Lm9rKCFtb2RlbC5pc0RpcnR5KCkpO1xuXHRcdGFzc2VydC5vayghbW9kZWwuaXNNb2RpZmllZCgpKTtcblx0XHRhc3NlcnQub2soc2F2ZWRFdmVudCk7XG5cdFx0YXNzZXJ0Lm9rKChzYXZlZEV2ZW50IGFzIElUZXh0RmlsZUVkaXRvck1vZGVsU2F2ZUV2ZW50KS5zdGF0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHNhdmVkRXZlbnQgYXMgSVRleHRGaWxlRWRpdG9yTW9kZWxTYXZlRXZlbnQpLnJlYXNvbiwgU2F2ZVJlYXNvbi5BVVRPKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHNhdmVkRXZlbnQgYXMgSVRleHRGaWxlRWRpdG9yTW9kZWxTYXZlRXZlbnQpLnNvdXJjZSwgc291cmNlKTtcblx0XHRhc3NlcnQub2sod29ya2luZ0NvcHlFdmVudCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXNzb3Iud29ya2luZ0NvcHlTZXJ2aWNlLmRpcnR5Q291bnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2UuaXNEaXJ0eShtb2RlbC5yZXNvdXJjZSwgbW9kZWwudHlwZUlkKSwgZmFsc2UpO1xuXG5cdFx0c2F2ZWRFdmVudCA9IHVuZGVmaW5lZDtcblxuXHRcdGF3YWl0IG1vZGVsLnNhdmUoeyBmb3JjZTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQub2soc2F2ZWRFdmVudCk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY2Nlc3Nvci5tb2RlbFNlcnZpY2UuZ2V0TW9kZWwobW9kZWwucmVzb3VyY2UpKTtcblx0fSk7XG5cblx0dGVzdCgnc2F2ZSAtIHRvdWNoaW5nIGFsc28gZW1pdHMgc2F2ZWQgZXZlbnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbW9kZWw6IFRleHRGaWxlRWRpdG9yTW9kZWwgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0RmlsZUVkaXRvck1vZGVsLCB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2luZGV4X2FzeW5jLnR4dCcpLCAndXRmOCcsIHVuZGVmaW5lZCk7XG5cblx0XHRhd2FpdCBtb2RlbC5yZXNvbHZlKCk7XG5cblx0XHRsZXQgc2F2ZWRFdmVudCA9IGZhbHNlO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbC5vbkRpZFNhdmUoKCkgPT4gc2F2ZWRFdmVudCA9IHRydWUpKTtcblxuXHRcdGxldCB3b3JraW5nQ29weUV2ZW50ID0gZmFsc2U7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS5vbkRpZENoYW5nZURpcnR5KGUgPT4ge1xuXHRcdFx0aWYgKGUucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gbW9kZWwucmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0XHR3b3JraW5nQ29weUV2ZW50ID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBtb2RlbC5zYXZlKHsgZm9yY2U6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQub2soc2F2ZWRFdmVudCk7XG5cdFx0YXNzZXJ0Lm9rKCF3b3JraW5nQ29weUV2ZW50KTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQub2soIWFjY2Vzc29yLm1vZGVsU2VydmljZS5nZXRNb2RlbChtb2RlbC5yZXNvdXJjZSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzYXZlIC0gdG91Y2hpbmcgd2l0aCBlcnJvciB0dXJucyBtb2RlbCBkaXJ0eScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtb2RlbDogVGV4dEZpbGVFZGl0b3JNb2RlbCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlRWRpdG9yTW9kZWwsIHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvaW5kZXhfYXN5bmMudHh0JyksICd1dGY4JywgdW5kZWZpbmVkKTtcblxuXHRcdGF3YWl0IG1vZGVsLnJlc29sdmUoKTtcblxuXHRcdGxldCBzYXZlRXJyb3JFdmVudCA9IGZhbHNlO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbC5vbkRpZFNhdmVFcnJvcigoKSA9PiBzYXZlRXJyb3JFdmVudCA9IHRydWUpKTtcblxuXHRcdGxldCBzYXZlZEV2ZW50ID0gZmFsc2U7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsLm9uRGlkU2F2ZSgoKSA9PiBzYXZlZEV2ZW50ID0gdHJ1ZSkpO1xuXG5cdFx0YWNjZXNzb3IuZmlsZVNlcnZpY2Uud3JpdGVTaG91bGRUaHJvd0Vycm9yID0gbmV3IEVycm9yKCdmYWlsZWQgdG8gd3JpdGUnKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgbW9kZWwuc2F2ZSh7IGZvcmNlOiB0cnVlIH0pO1xuXG5cdFx0XHRhc3NlcnQub2sobW9kZWwuaGFzU3RhdGUoVGV4dEZpbGVFZGl0b3JNb2RlbFN0YXRlLkVSUk9SKSk7XG5cdFx0XHRhc3NlcnQub2sobW9kZWwuaXNEaXJ0eSgpKTtcblx0XHRcdGFzc2VydC5vayhtb2RlbC5pc01vZGlmaWVkKCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNhdmVFcnJvckV2ZW50KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS5kaXJ0eUNvdW50LCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2UuaXNEaXJ0eShtb2RlbC5yZXNvdXJjZSwgbW9kZWwudHlwZUlkKSwgdHJ1ZSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGFjY2Vzc29yLmZpbGVTZXJ2aWNlLndyaXRlU2hvdWxkVGhyb3dFcnJvciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRhd2FpdCBtb2RlbC5zYXZlKHsgZm9yY2U6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQub2soc2F2ZWRFdmVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmlzRGlydHkoKSwgZmFsc2UpO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5vayghYWNjZXNzb3IubW9kZWxTZXJ2aWNlLmdldE1vZGVsKG1vZGVsLnJlc291cmNlKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NhdmUgLSByZXR1cm5zIGZhbHNlIHdoZW4gc2F2ZSBmYWlscycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtb2RlbDogVGV4dEZpbGVFZGl0b3JNb2RlbCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlRWRpdG9yTW9kZWwsIHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvaW5kZXhfYXN5bmMudHh0JyksICd1dGY4JywgdW5kZWZpbmVkKTtcblxuXHRcdGF3YWl0IG1vZGVsLnJlc29sdmUoKTtcblxuXHRcdGFjY2Vzc29yLmZpbGVTZXJ2aWNlLndyaXRlU2hvdWxkVGhyb3dFcnJvciA9IG5ldyBFcnJvcignZmFpbGVkIHRvIHdyaXRlJyk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IG1vZGVsLnNhdmUoeyBmb3JjZTogdHJ1ZSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMsIGZhbHNlKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YWNjZXNzb3IuZmlsZVNlcnZpY2Uud3JpdGVTaG91bGRUaHJvd0Vycm9yID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IG1vZGVsLnNhdmUoeyBmb3JjZTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLCB0cnVlKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQub2soIWFjY2Vzc29yLm1vZGVsU2VydmljZS5nZXRNb2RlbChtb2RlbC5yZXNvdXJjZSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzYXZlIGVycm9yIChnZW5lcmljKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtb2RlbDogVGV4dEZpbGVFZGl0b3JNb2RlbCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlRWRpdG9yTW9kZWwsIHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvaW5kZXhfYXN5bmMudHh0JyksICd1dGY4JywgdW5kZWZpbmVkKTtcblxuXHRcdGF3YWl0IG1vZGVsLnJlc29sdmUoKTtcblxuXHRcdG1vZGVsLnVwZGF0ZVRleHRFZGl0b3JNb2RlbChjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeSgnYmFyJykpO1xuXG5cdFx0bGV0IHNhdmVFcnJvckV2ZW50ID0gZmFsc2U7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsLm9uRGlkU2F2ZUVycm9yKCgpID0+IHNhdmVFcnJvckV2ZW50ID0gdHJ1ZSkpO1xuXG5cdFx0YWNjZXNzb3IuZmlsZVNlcnZpY2Uud3JpdGVTaG91bGRUaHJvd0Vycm9yID0gbmV3IEVycm9yKCdmYWlsZWQgdG8gd3JpdGUnKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGVuZGluZ1NhdmUgPSBtb2RlbC5zYXZlKCk7XG5cdFx0XHRhc3NlcnQub2sobW9kZWwuaGFzU3RhdGUoVGV4dEZpbGVFZGl0b3JNb2RlbFN0YXRlLlBFTkRJTkdfU0FWRSkpO1xuXG5cdFx0XHRhd2FpdCBwZW5kaW5nU2F2ZTtcblxuXHRcdFx0YXNzZXJ0Lm9rKG1vZGVsLmhhc1N0YXRlKFRleHRGaWxlRWRpdG9yTW9kZWxTdGF0ZS5FUlJPUikpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1vZGVsLmlzRGlydHkoKSk7XG5cdFx0XHRhc3NlcnQub2sobW9kZWwuaXNNb2RpZmllZCgpKTtcblx0XHRcdGFzc2VydC5vayhzYXZlRXJyb3JFdmVudCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2UuZGlydHlDb3VudCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXNzb3Iud29ya2luZ0NvcHlTZXJ2aWNlLmlzRGlydHkobW9kZWwucmVzb3VyY2UsIG1vZGVsLnR5cGVJZCksIHRydWUpO1xuXG5cdFx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGFjY2Vzc29yLmZpbGVTZXJ2aWNlLndyaXRlU2hvdWxkVGhyb3dFcnJvciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3NhdmUgZXJyb3IgKGNvbmZsaWN0KScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtb2RlbDogVGV4dEZpbGVFZGl0b3JNb2RlbCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlRWRpdG9yTW9kZWwsIHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvaW5kZXhfYXN5bmMudHh0JyksICd1dGY4JywgdW5kZWZpbmVkKTtcblxuXHRcdGF3YWl0IG1vZGVsLnJlc29sdmUoKTtcblxuXHRcdG1vZGVsLnVwZGF0ZVRleHRFZGl0b3JNb2RlbChjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeSgnYmFyJykpO1xuXG5cdFx0bGV0IHNhdmVFcnJvckV2ZW50ID0gZmFsc2U7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsLm9uRGlkU2F2ZUVycm9yKCgpID0+IHNhdmVFcnJvckV2ZW50ID0gdHJ1ZSkpO1xuXG5cdFx0YWNjZXNzb3IuZmlsZVNlcnZpY2Uud3JpdGVTaG91bGRUaHJvd0Vycm9yID0gbmV3IEZpbGVPcGVyYXRpb25FcnJvcignc2F2ZSBjb25mbGljdCcsIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9NT0RJRklFRF9TSU5DRSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBlbmRpbmdTYXZlID0gbW9kZWwuc2F2ZSgpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1vZGVsLmhhc1N0YXRlKFRleHRGaWxlRWRpdG9yTW9kZWxTdGF0ZS5QRU5ESU5HX1NBVkUpKTtcblxuXHRcdFx0YXdhaXQgcGVuZGluZ1NhdmU7XG5cblx0XHRcdGFzc2VydC5vayhtb2RlbC5oYXNTdGF0ZShUZXh0RmlsZUVkaXRvck1vZGVsU3RhdGUuQ09ORkxJQ1QpKTtcblx0XHRcdGFzc2VydC5vayhtb2RlbC5pc0RpcnR5KCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1vZGVsLmlzTW9kaWZpZWQoKSk7XG5cdFx0XHRhc3NlcnQub2soc2F2ZUVycm9yRXZlbnQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXNzb3Iud29ya2luZ0NvcHlTZXJ2aWNlLmRpcnR5Q291bnQsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS5pc0RpcnR5KG1vZGVsLnJlc291cmNlLCBtb2RlbC50eXBlSWQpLCB0cnVlKTtcblxuXHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhY2Nlc3Nvci5maWxlU2VydmljZS53cml0ZVNob3VsZFRocm93RXJyb3IgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdzZXRFbmNvZGluZyAtIGVuY29kZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtb2RlbDogVGV4dEZpbGVFZGl0b3JNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0RmlsZUVkaXRvck1vZGVsLCB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2luZGV4X2FzeW5jLnR4dCcpLCAndXRmOCcsIHVuZGVmaW5lZCkpO1xuXG5cdFx0bGV0IGVuY29kaW5nRXZlbnQgPSBmYWxzZTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwub25EaWRDaGFuZ2VFbmNvZGluZygoKSA9PiBlbmNvZGluZ0V2ZW50ID0gdHJ1ZSkpO1xuXG5cdFx0YXdhaXQgbW9kZWwuc2V0RW5jb2RpbmcoJ3V0ZjgnLCBFbmNvZGluZ01vZGUuRW5jb2RlKTsgLy8gbm8tb3Bcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TGFzdE1vZGlmaWVkVGltZShtb2RlbCksIC0xKTtcblxuXHRcdGFzc2VydC5vayghZW5jb2RpbmdFdmVudCk7XG5cblx0XHRhd2FpdCBtb2RlbC5zZXRFbmNvZGluZygndXRmMTYnLCBFbmNvZGluZ01vZGUuRW5jb2RlKTtcblxuXHRcdGFzc2VydC5vayhlbmNvZGluZ0V2ZW50KTtcblxuXHRcdGFzc2VydC5vayhnZXRMYXN0TW9kaWZpZWRUaW1lKG1vZGVsKSA8PSBEYXRlLm5vdygpKTsgLy8gaW5kaWNhdGVzIG1vZGVsIHdhcyBzYXZlZCBkdWUgdG8gZW5jb2RpbmcgY2hhbmdlXG5cdH0pO1xuXG5cdHRlc3QoJ3NldEVuY29kaW5nIC0gZGVjb2RlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGxldCBtb2RlbDogVGV4dEZpbGVFZGl0b3JNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0RmlsZUVkaXRvck1vZGVsLCB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2luZGV4X2FzeW5jLnR4dCcpLCAndXRmOCcsIHVuZGVmaW5lZCkpO1xuXHRcdGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS50ZXN0VW5yZWdpc3RlcldvcmtpbmdDb3B5KG1vZGVsKTsgLy8gY2F1c2VzIGlzc3VlcyB3aXRoIHN1YnNlcXVlbnQgcmVzb2x2ZXMgb3RoZXJ3aXNlXG5cblx0XHRhd2FpdCBtb2RlbC5zZXRFbmNvZGluZygndXRmMTYnLCBFbmNvZGluZ01vZGUuRGVjb2RlKTtcblxuXHRcdC8vIHdlIGhhdmUgdG8gZ2V0IHRoZSBtb2RlbCBhZ2FpbiBmcm9tIHdvcmtpbmcgY29weSBzZXJ2aWNlXG5cdFx0Ly8gYmVjYXVzZSBgc2V0RW5jb2RpbmdgIHdpbGwgcmVzb2x2ZSBpdCBhZ2FpbiB0aHJvdWdoIHRoZVxuXHRcdC8vIHRleHQgZmlsZSBzZXJ2aWNlIHdoaWNoIGlzIG91dHNpZGUgb3VyIHNjb3BlXG5cdFx0bW9kZWwgPSBhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2UuZ2V0KG1vZGVsKSBhcyBUZXh0RmlsZUVkaXRvck1vZGVsO1xuXG5cdFx0YXNzZXJ0Lm9rKG1vZGVsLmlzUmVzb2x2ZWQoKSk7IC8vIG1vZGVsIGdvdCByZXNvbHZlZCBkdWUgdG8gZGVjb2Rpbmdcblx0fSk7XG5cblx0dGVzdCgnc2V0RW5jb2RpbmcgLSBkZWNvZGUgZGlydHkgZmlsZSB0aHJvd3MnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbW9kZWw6IFRleHRGaWxlRWRpdG9yTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGV4dEZpbGVFZGl0b3JNb2RlbCwgdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9pbmRleF9hc3luYy50eHQnKSwgJ3V0ZjgnLCB1bmRlZmluZWQpKTtcblx0XHRhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2UudGVzdFVucmVnaXN0ZXJXb3JraW5nQ29weShtb2RlbCk7IC8vIGNhdXNlcyBpc3N1ZXMgd2l0aCBzdWJzZXF1ZW50IHJlc29sdmVzIG90aGVyd2lzZVxuXG5cdFx0YXdhaXQgbW9kZWwucmVzb2x2ZSgpO1xuXG5cdFx0bW9kZWwudXBkYXRlVGV4dEVkaXRvck1vZGVsKGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5KCdiYXInKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmlzRGlydHkoKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnRUaHJvd3NBc3luYygoKSA9PiBtb2RlbC5zZXRFbmNvZGluZygndXRmMTYnLCBFbmNvZGluZ01vZGUuRGVjb2RlKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VuY29kaW5nIHVwZGF0ZXMgd2l0aCBsYW5ndWFnZSBiYXNlZCBjb25maWd1cmF0aW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSAndGV4dC1maWxlLW1vZGVsLXRlc3QnO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhY2Nlc3Nvci5sYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7XG5cdFx0XHRpZDogbGFuZ3VhZ2VJZCxcblx0XHR9KSk7XG5cblx0XHRhY2Nlc3Nvci50ZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uuc2V0T3ZlcnJpZGVJZGVudGlmaWVycygnZmlsZXMuZW5jb2RpbmcnLCBbbGFuZ3VhZ2VJZF0pO1xuXG5cdFx0Y29uc3QgbW9kZWw6IFRleHRGaWxlRWRpdG9yTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGV4dEZpbGVFZGl0b3JNb2RlbCwgdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9pbmRleF9hc3luYy50eHQnKSwgJ3V0ZjgnLCB1bmRlZmluZWQpKTtcblx0XHRhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2UudGVzdFVucmVnaXN0ZXJXb3JraW5nQ29weShtb2RlbCk7IC8vIGNhdXNlcyBpc3N1ZXMgd2l0aCBzdWJzZXF1ZW50IHJlc29sdmVzIG90aGVyd2lzZVxuXG5cdFx0YXdhaXQgbW9kZWwucmVzb2x2ZSgpO1xuXG5cdFx0Y29uc3QgZGVmZXJyZWRQcm9taXNlID0gbmV3IERlZmVycmVkUHJvbWlzZTxUZXh0RmlsZUVkaXRvck1vZGVsPigpO1xuXG5cdFx0Ly8gV2UgdXNlIHRoaXMgbGlzdGVuZXIgYXMgYSB3YXkgdG8gZmlndXJlIG91dCB0aGF0IHRoZSB3b3JraW5nXG5cdFx0Ly8gY29weSB3YXMgcmVzb2x2ZWQgYWdhaW4gYXMgcGFydCBvZiB0aGUgbGFuZ3VhZ2UgY2hhbmdlXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS5vbkRpZFJlZ2lzdGVyKGUgPT4ge1xuXHRcdFx0aWYgKGlzRXF1YWwoZS5yZXNvdXJjZSwgbW9kZWwucmVzb3VyY2UpKSB7XG5cdFx0XHRcdGRlZmVycmVkUHJvbWlzZS5jb21wbGV0ZShtb2RlbCBhcyBUZXh0RmlsZUVkaXRvck1vZGVsKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhY2Nlc3Nvci50ZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2ZpbGVzLmVuY29kaW5nJywgVVRGMTZiZSk7XG5cblx0XHRtb2RlbC5zZXRMYW5ndWFnZUlkKGxhbmd1YWdlSWQpO1xuXG5cdFx0YXdhaXQgZGVmZXJyZWRQcm9taXNlLnA7IC8vIHRoaXMgYXNzZXJ0cyB0aGF0IHRoZSBtb2RlbCB3YXMgcmVsb2FkZWQgZHVlIHRvIHRoZSBsYW5ndWFnZSBjaGFuZ2Vcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlIHdpdGggbGFuZ3VhZ2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9ICd0ZXh0LWZpbGUtbW9kZWwtdGVzdCc7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjY2Vzc29yLmxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHtcblx0XHRcdGlkOiBsYW5ndWFnZUlkLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG1vZGVsOiBUZXh0RmlsZUVkaXRvck1vZGVsID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGV4dEZpbGVFZGl0b3JNb2RlbCwgdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9pbmRleF9hc3luYy50eHQnKSwgJ3V0ZjgnLCBsYW5ndWFnZUlkKTtcblxuXHRcdGF3YWl0IG1vZGVsLnJlc29sdmUoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC50ZXh0RWRpdG9yTW9kZWwhLmdldExhbmd1YWdlSWQoKSwgbGFuZ3VhZ2VJZCk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY2Nlc3Nvci5tb2RlbFNlcnZpY2UuZ2V0TW9kZWwobW9kZWwucmVzb3VyY2UpKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zZXMgd2hlbiB1bmRlcmx5aW5nIG1vZGVsIGlzIGRlc3Ryb3llZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtb2RlbDogVGV4dEZpbGVFZGl0b3JNb2RlbCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlRWRpdG9yTW9kZWwsIHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvaW5kZXhfYXN5bmMudHh0JyksICd1dGY4JywgdW5kZWZpbmVkKTtcblxuXHRcdGF3YWl0IG1vZGVsLnJlc29sdmUoKTtcblxuXHRcdG1vZGVsLnRleHRFZGl0b3JNb2RlbCEuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5vayhtb2RlbC5pc0Rpc3Bvc2VkKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdSZXNvbHZlIGRvZXMgbm90IHRyaWdnZXIgc2F2ZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtb2RlbCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlRWRpdG9yTW9kZWwsIHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvaW5kZXgudHh0JyksICd1dGY4JywgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQub2sobW9kZWwuaGFzU3RhdGUoVGV4dEZpbGVFZGl0b3JNb2RlbFN0YXRlLlNBVkVEKSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwub25EaWRTYXZlKCgpID0+IGFzc2VydC5mYWlsKCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwub25EaWRDaGFuZ2VEaXJ0eSgoKSA9PiBhc3NlcnQuZmFpbCgpKSk7XG5cblx0XHRhd2FpdCBtb2RlbC5yZXNvbHZlKCk7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVsLmlzUmVzb2x2ZWQoKSk7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5vayghYWNjZXNzb3IubW9kZWxTZXJ2aWNlLmdldE1vZGVsKG1vZGVsLnJlc291cmNlKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Jlc29sdmUgcmV0dXJucyBkaXJ0eSBtb2RlbCBhcyBsb25nIGFzIG1vZGVsIGlzIGRpcnR5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlRWRpdG9yTW9kZWwsIHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvaW5kZXhfYXN5bmMudHh0JyksICd1dGY4JywgdW5kZWZpbmVkKSk7XG5cblx0XHRhd2FpdCBtb2RlbC5yZXNvbHZlKCk7XG5cdFx0bW9kZWwudXBkYXRlVGV4dEVkaXRvck1vZGVsKGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5KCdmb28nKSk7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVsLmlzRGlydHkoKSk7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVsLmhhc1N0YXRlKFRleHRGaWxlRWRpdG9yTW9kZWxTdGF0ZS5ESVJUWSkpO1xuXG5cdFx0YXdhaXQgbW9kZWwucmVzb2x2ZSgpO1xuXHRcdGFzc2VydC5vayhtb2RlbC5pc0RpcnR5KCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdSZXNvbHZlIHdpdGggY29udGVudHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbW9kZWw6IFRleHRGaWxlRWRpdG9yTW9kZWwgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0RmlsZUVkaXRvck1vZGVsLCB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2luZGV4X2FzeW5jLnR4dCcpLCAndXRmOCcsIHVuZGVmaW5lZCk7XG5cblx0XHRhd2FpdCBtb2RlbC5yZXNvbHZlKHsgY29udGVudHM6IGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5KCdIZWxsbyBXb3JsZCcpIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLnRleHRFZGl0b3JNb2RlbD8uZ2V0VmFsdWUoKSwgJ0hlbGxvIFdvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmlzRGlydHkoKSwgdHJ1ZSk7XG5cblx0XHRhd2FpdCBtb2RlbC5yZXNvbHZlKHsgY29udGVudHM6IGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5KCdIZWxsbyBDaGFuZ2VzJykgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwudGV4dEVkaXRvck1vZGVsPy5nZXRWYWx1ZSgpLCAnSGVsbG8gQ2hhbmdlcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5pc0RpcnR5KCksIHRydWUpO1xuXG5cdFx0Ly8gdmVyaWZ5IHRoYXQgd2UgZG8gbm90IG1hcmsgdGhlIG1vZGVsIGFzIHNhdmVkIHdoZW4gdW5kb2luZyBvbmNlIGJlY2F1c2Vcblx0XHQvLyB3ZSBuZXZlciByZWFsbHkgaGFkIGEgc2F2ZWQgc3RhdGVcblx0XHRhd2FpdCBtb2RlbC50ZXh0RWRpdG9yTW9kZWwudW5kbygpO1xuXHRcdGFzc2VydC5vayhtb2RlbC5pc0RpcnR5KCkpO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5vayghYWNjZXNzb3IubW9kZWxTZXJ2aWNlLmdldE1vZGVsKG1vZGVsLnJlc291cmNlKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1JldmVydCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRsZXQgZXZlbnRDb3VudGVyID0gMDtcblxuXHRcdGxldCBtb2RlbDogVGV4dEZpbGVFZGl0b3JNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0RmlsZUVkaXRvck1vZGVsLCB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2luZGV4X2FzeW5jLnR4dCcpLCAndXRmOCcsIHVuZGVmaW5lZCkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsLm9uRGlkUmV2ZXJ0KCgpID0+IGV2ZW50Q291bnRlcisrKSk7XG5cblx0XHRsZXQgd29ya2luZ0NvcHlFdmVudCA9IGZhbHNlO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2Uub25EaWRDaGFuZ2VEaXJ0eShlID0+IHtcblx0XHRcdGlmIChlLnJlc291cmNlLnRvU3RyaW5nKCkgPT09IG1vZGVsLnJlc291cmNlLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0d29ya2luZ0NvcHlFdmVudCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgbW9kZWwucmVzb2x2ZSgpO1xuXHRcdG1vZGVsLnVwZGF0ZVRleHRFZGl0b3JNb2RlbChjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeSgnZm9vJykpO1xuXHRcdGFzc2VydC5vayhtb2RlbC5pc0RpcnR5KCkpO1xuXHRcdGFzc2VydC5vayhtb2RlbC5pc01vZGlmaWVkKCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS5kaXJ0eUNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXNzb3Iud29ya2luZ0NvcHlTZXJ2aWNlLmlzRGlydHkobW9kZWwucmVzb3VyY2UsIG1vZGVsLnR5cGVJZCksIHRydWUpO1xuXG5cdFx0YWNjZXNzb3Iud29ya2luZ0NvcHlTZXJ2aWNlLnRlc3RVbnJlZ2lzdGVyV29ya2luZ0NvcHkobW9kZWwpOyAvLyBjYXVzZXMgaXNzdWVzIHdpdGggc3Vic2VxdWVudCByZXNvbHZlcyBvdGhlcndpc2VcblxuXHRcdGF3YWl0IG1vZGVsLnJldmVydCgpO1xuXG5cdFx0Ly8gd2UgaGF2ZSB0byBnZXQgdGhlIG1vZGVsIGFnYWluIGZyb20gd29ya2luZyBjb3B5IHNlcnZpY2Vcblx0XHQvLyBiZWNhdXNlIGBzZXRFbmNvZGluZ2Agd2lsbCByZXNvbHZlIGl0IGFnYWluIHRocm91Z2ggdGhlXG5cdFx0Ly8gdGV4dCBmaWxlIHNlcnZpY2Ugd2hpY2ggaXMgb3V0c2lkZSBvdXIgc2NvcGVcblx0XHRtb2RlbCA9IGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS5nZXQobW9kZWwpIGFzIFRleHRGaWxlRWRpdG9yTW9kZWw7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuaXNEaXJ0eSgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmlzTW9kaWZpZWQoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50ZXIsIDEpO1xuXG5cdFx0YXNzZXJ0Lm9rKHdvcmtpbmdDb3B5RXZlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2UuZGlydHlDb3VudCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS5pc0RpcnR5KG1vZGVsLnJlc291cmNlLCBtb2RlbC50eXBlSWQpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1JldmVydCAoc29mdCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IGV2ZW50Q291bnRlciA9IDA7XG5cblx0XHRjb25zdCBtb2RlbDogVGV4dEZpbGVFZGl0b3JNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0RmlsZUVkaXRvck1vZGVsLCB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2luZGV4X2FzeW5jLnR4dCcpLCAndXRmOCcsIHVuZGVmaW5lZCkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsLm9uRGlkUmV2ZXJ0KCgpID0+IGV2ZW50Q291bnRlcisrKSk7XG5cblx0XHRsZXQgd29ya2luZ0NvcHlFdmVudCA9IGZhbHNlO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2Uub25EaWRDaGFuZ2VEaXJ0eShlID0+IHtcblx0XHRcdGlmIChlLnJlc291cmNlLnRvU3RyaW5nKCkgPT09IG1vZGVsLnJlc291cmNlLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0d29ya2luZ0NvcHlFdmVudCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgbW9kZWwucmVzb2x2ZSgpO1xuXHRcdG1vZGVsLnVwZGF0ZVRleHRFZGl0b3JNb2RlbChjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeSgnZm9vJykpO1xuXHRcdGFzc2VydC5vayhtb2RlbC5pc0RpcnR5KCkpO1xuXHRcdGFzc2VydC5vayhtb2RlbC5pc01vZGlmaWVkKCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS5kaXJ0eUNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXNzb3Iud29ya2luZ0NvcHlTZXJ2aWNlLmlzRGlydHkobW9kZWwucmVzb3VyY2UsIG1vZGVsLnR5cGVJZCksIHRydWUpO1xuXG5cdFx0YXdhaXQgbW9kZWwucmV2ZXJ0KHsgc29mdDogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuaXNEaXJ0eSgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmlzTW9kaWZpZWQoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC50ZXh0RWRpdG9yTW9kZWwuZ2V0VmFsdWUoKSwgJ2ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50ZXIsIDEpO1xuXG5cdFx0YXNzZXJ0Lm9rKHdvcmtpbmdDb3B5RXZlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2UuZGlydHlDb3VudCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS5pc0RpcnR5KG1vZGVsLnJlc291cmNlLCBtb2RlbC50eXBlSWQpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1VuZG8gdG8gc2F2ZWQgc3RhdGUgdHVybnMgbW9kZWwgbm9uLWRpcnR5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG1vZGVsOiBUZXh0RmlsZUVkaXRvck1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlRWRpdG9yTW9kZWwsIHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvaW5kZXhfYXN5bmMudHh0JyksICd1dGY4JywgdW5kZWZpbmVkKSk7XG5cdFx0YXdhaXQgbW9kZWwucmVzb2x2ZSgpO1xuXHRcdG1vZGVsLnVwZGF0ZVRleHRFZGl0b3JNb2RlbChjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeSgnSGVsbG8gVGV4dCcpKTtcblx0XHRhc3NlcnQub2sobW9kZWwuaXNEaXJ0eSgpKTtcblxuXHRcdGF3YWl0IG1vZGVsLnRleHRFZGl0b3JNb2RlbC51bmRvKCk7XG5cdFx0YXNzZXJ0Lm9rKCFtb2RlbC5pc0RpcnR5KCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdSZXNvbHZlIGFuZCB1bmRvIHR1cm5zIG1vZGVsIGRpcnR5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG1vZGVsOiBUZXh0RmlsZUVkaXRvck1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlRWRpdG9yTW9kZWwsIHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvaW5kZXhfYXN5bmMudHh0JyksICd1dGY4JywgdW5kZWZpbmVkKSk7XG5cdFx0YXdhaXQgbW9kZWwucmVzb2x2ZSgpO1xuXHRcdGFjY2Vzc29yLmZpbGVTZXJ2aWNlLnNldENvbnRlbnQoJ0hlbGxvIENoYW5nZScpO1xuXG5cdFx0YXdhaXQgbW9kZWwucmVzb2x2ZSgpO1xuXHRcdGF3YWl0IG1vZGVsLnRleHRFZGl0b3JNb2RlbCEudW5kbygpO1xuXHRcdGFzc2VydC5vayhtb2RlbC5pc0RpcnR5KCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS5kaXJ0eUNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXNzb3Iud29ya2luZ0NvcHlTZXJ2aWNlLmlzRGlydHkobW9kZWwucmVzb3VyY2UsIG1vZGVsLnR5cGVJZCksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdVcGRhdGUgRGlydHknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IGV2ZW50Q291bnRlciA9IDA7XG5cblx0XHRjb25zdCBtb2RlbDogVGV4dEZpbGVFZGl0b3JNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0RmlsZUVkaXRvck1vZGVsLCB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2luZGV4X2FzeW5jLnR4dCcpLCAndXRmOCcsIHVuZGVmaW5lZCkpO1xuXG5cdFx0bW9kZWwuc2V0RGlydHkodHJ1ZSk7XG5cdFx0YXNzZXJ0Lm9rKCFtb2RlbC5pc0RpcnR5KCkpOyAvLyBuZWVkcyB0byBiZSByZXNvbHZlZFxuXG5cdFx0YXdhaXQgbW9kZWwucmVzb2x2ZSgpO1xuXHRcdG1vZGVsLnVwZGF0ZVRleHRFZGl0b3JNb2RlbChjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeSgnZm9vJykpO1xuXHRcdGFzc2VydC5vayhtb2RlbC5pc0RpcnR5KCkpO1xuXG5cdFx0YXdhaXQgbW9kZWwucmV2ZXJ0KHsgc29mdDogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuaXNEaXJ0eSgpLCBmYWxzZSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwub25EaWRDaGFuZ2VEaXJ0eSgoKSA9PiBldmVudENvdW50ZXIrKykpO1xuXG5cdFx0bGV0IHdvcmtpbmdDb3B5RXZlbnQgPSBmYWxzZTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWNjZXNzb3Iud29ya2luZ0NvcHlTZXJ2aWNlLm9uRGlkQ2hhbmdlRGlydHkoZSA9PiB7XG5cdFx0XHRpZiAoZS5yZXNvdXJjZS50b1N0cmluZygpID09PSBtb2RlbC5yZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHRcdHdvcmtpbmdDb3B5RXZlbnQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdG1vZGVsLnNldERpcnR5KHRydWUpO1xuXHRcdGFzc2VydC5vayhtb2RlbC5pc0RpcnR5KCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50ZXIsIDEpO1xuXHRcdGFzc2VydC5vayh3b3JraW5nQ29weUV2ZW50KTtcblxuXHRcdG1vZGVsLnNldERpcnR5KGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuaXNEaXJ0eSgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Q291bnRlciwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ05vIERpcnR5IG9yIHNhdmluZyBmb3IgcmVhZG9ubHkgbW9kZWxzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGxldCB3b3JraW5nQ29weUV2ZW50ID0gZmFsc2U7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS5vbkRpZENoYW5nZURpcnR5KGUgPT4ge1xuXHRcdFx0aWYgKGUucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gbW9kZWwucmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0XHR3b3JraW5nQ29weUV2ZW50ID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0UmVhZG9ubHlUZXh0RmlsZUVkaXRvck1vZGVsLCB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2luZGV4X2FzeW5jLnR4dCcpLCAndXRmOCcsIHVuZGVmaW5lZCkpO1xuXG5cdFx0bGV0IHNhdmVFdmVudCA9IGZhbHNlO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbC5vbkRpZFNhdmUoKCkgPT4ge1xuXHRcdFx0c2F2ZUV2ZW50ID0gdHJ1ZTtcblx0XHR9KSk7XG5cblx0XHRhd2FpdCBtb2RlbC5yZXNvbHZlKCk7XG5cdFx0bW9kZWwudXBkYXRlVGV4dEVkaXRvck1vZGVsKGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5KCdmb28nKSk7XG5cdFx0YXNzZXJ0Lm9rKCFtb2RlbC5pc0RpcnR5KCkpO1xuXG5cdFx0YXdhaXQgbW9kZWwuc2F2ZSh7IGZvcmNlOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYXZlRXZlbnQsIGZhbHNlKTtcblxuXHRcdGF3YWl0IG1vZGVsLnJldmVydCh7IHNvZnQ6IHRydWUgfSk7XG5cdFx0YXNzZXJ0Lm9rKCFtb2RlbC5pc0RpcnR5KCkpO1xuXG5cdFx0YXNzZXJ0Lm9rKCF3b3JraW5nQ29weUV2ZW50KTtcblx0fSk7XG5cblx0dGVzdCgnRmlsZSBub3QgbW9kaWZpZWQgZXJyb3IgaXMgaGFuZGxlZCBncmFjZWZ1bGx5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG1vZGVsOiBUZXh0RmlsZUVkaXRvck1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlRWRpdG9yTW9kZWwsIHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvaW5kZXhfYXN5bmMudHh0JyksICd1dGY4JywgdW5kZWZpbmVkKSk7XG5cblx0XHRhd2FpdCBtb2RlbC5yZXNvbHZlKCk7XG5cblx0XHRjb25zdCBtdGltZSA9IGdldExhc3RNb2RpZmllZFRpbWUobW9kZWwpO1xuXHRcdGFjY2Vzc29yLnRleHRGaWxlU2VydmljZS5zZXRSZWFkU3RyZWFtRXJyb3JPbmNlKG5ldyBGaWxlT3BlcmF0aW9uRXJyb3IoJ2Vycm9yJywgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9NT0RJRklFRF9TSU5DRSkpO1xuXG5cdFx0YXdhaXQgbW9kZWwucmVzb2x2ZSgpO1xuXG5cdFx0YXNzZXJ0Lm9rKG1vZGVsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TGFzdE1vZGlmaWVkVGltZShtb2RlbCksIG10aW1lKTtcblx0fSk7XG5cblx0dGVzdCgnc3RhdC5yZWFkb25seSBhbmQgc3RhdC5sb2NrZWQgY2FuIGNoYW5nZSB3aGVuIGRlY3JlYXNlZCBtdGltZSBpcyBpZ25vcmVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG1vZGVsOiBUZXh0RmlsZUVkaXRvck1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlRWRpdG9yTW9kZWwsIHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvaW5kZXhfYXN5bmMudHh0JyksICd1dGY4JywgdW5kZWZpbmVkKSk7XG5cblx0XHRhd2FpdCBtb2RlbC5yZXNvbHZlKCk7XG5cblx0XHRjb25zdCBzdGF0ID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQoZ2V0TGFzdFJlc29sdmVkRmlsZVN0YXQobW9kZWwpKTtcblx0XHRhY2Nlc3Nvci50ZXh0RmlsZVNlcnZpY2Uuc2V0UmVhZFN0cmVhbUVycm9yT25jZShuZXcgTm90TW9kaWZpZWRTaW5jZUZpbGVPcGVyYXRpb25FcnJvcignZXJyb3InLCB7IC4uLnN0YXQsIG10aW1lOiBzdGF0Lm10aW1lIC0gMSwgcmVhZG9ubHk6ICFzdGF0LnJlYWRvbmx5LCBsb2NrZWQ6ICFzdGF0LmxvY2tlZCB9KSk7XG5cblx0XHRhd2FpdCBtb2RlbC5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQub2sobW9kZWwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRMYXN0TW9kaWZpZWRUaW1lKG1vZGVsKSwgc3RhdC5tdGltZSwgJ210aW1lIHNob3VsZCBub3QgZGVjcmVhc2UnKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoZ2V0TGFzdFJlc29sdmVkRmlsZVN0YXQobW9kZWwpPy5yZWFkb25seSwgc3RhdC5yZWFkb25seSwgJ3JlYWRvbmx5IHNob3VsZCBoYXZlIGNoYW5nZWQgZGVzcGl0ZSBzaW11bHRhbmVvdXMgYXR0ZW1wdCB0byBkZWNyZWFzZSBtdGltZScpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChnZXRMYXN0UmVzb2x2ZWRGaWxlU3RhdChtb2RlbCk/LmxvY2tlZCwgc3RhdC5sb2NrZWQsICdsb2NrZWQgc2hvdWxkIGhhdmUgY2hhbmdlZCBkZXNwaXRlIHNpbXVsdGFuZW91cyBhdHRlbXB0IHRvIGRlY3JlYXNlIG10aW1lJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Jlc29sdmUgZXJyb3IgaXMgaGFuZGxlZCBncmFjZWZ1bGx5IGlmIG1vZGVsIGFscmVhZHkgZXhpc3RzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG1vZGVsOiBUZXh0RmlsZUVkaXRvck1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlRWRpdG9yTW9kZWwsIHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvaW5kZXhfYXN5bmMudHh0JyksICd1dGY4JywgdW5kZWZpbmVkKSk7XG5cblx0XHRhd2FpdCBtb2RlbC5yZXNvbHZlKCk7XG5cdFx0YWNjZXNzb3IudGV4dEZpbGVTZXJ2aWNlLnNldFJlYWRTdHJlYW1FcnJvck9uY2UobmV3IEZpbGVPcGVyYXRpb25FcnJvcignZXJyb3InLCBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSk7XG5cblx0XHRhd2FpdCBtb2RlbC5yZXNvbHZlKCk7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVsKTtcblx0fSk7XG5cblx0dGVzdCgnc2F2ZSgpIGFuZCBpc0RpcnR5KCkgLSBwcm9wZXIgd2l0aCBjaGVjayBmb3IgbXRpbWVzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGlucHV0MSA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVGaWxlRWRpdG9ySW5wdXQoaW5zdGFudGlhdGlvblNlcnZpY2UsIHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvaW5kZXhfYXN5bmMyLnR4dCcpKSk7XG5cdFx0Y29uc3QgaW5wdXQyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZUZpbGVFZGl0b3JJbnB1dChpbnN0YW50aWF0aW9uU2VydmljZSwgdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9pbmRleF9hc3luYy50eHQnKSkpO1xuXG5cdFx0Y29uc3QgbW9kZWwxID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IGlucHV0MS5yZXNvbHZlKCkgYXMgVGV4dEZpbGVFZGl0b3JNb2RlbCk7XG5cdFx0Y29uc3QgbW9kZWwyID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IGlucHV0Mi5yZXNvbHZlKCkgYXMgVGV4dEZpbGVFZGl0b3JNb2RlbCk7XG5cblx0XHRtb2RlbDEudXBkYXRlVGV4dEVkaXRvck1vZGVsKGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5KCdmb28nKSk7XG5cblx0XHRjb25zdCBtMU10aW1lID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQoZ2V0TGFzdFJlc29sdmVkRmlsZVN0YXQobW9kZWwxKSkubXRpbWU7XG5cdFx0Y29uc3QgbTJNdGltZSA9IGFzc2VydFJldHVybnNEZWZpbmVkKGdldExhc3RSZXNvbHZlZEZpbGVTdGF0KG1vZGVsMikpLm10aW1lO1xuXHRcdGFzc2VydC5vayhtMU10aW1lID4gMCk7XG5cdFx0YXNzZXJ0Lm9rKG0yTXRpbWUgPiAwKTtcblxuXHRcdGFzc2VydC5vayhhY2Nlc3Nvci50ZXh0RmlsZVNlcnZpY2UuaXNEaXJ0eSh0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2luZGV4X2FzeW5jMi50eHQnKSkpO1xuXHRcdGFzc2VydC5vayghYWNjZXNzb3IudGV4dEZpbGVTZXJ2aWNlLmlzRGlydHkodG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9pbmRleF9hc3luYy50eHQnKSkpO1xuXG5cdFx0bW9kZWwyLnVwZGF0ZVRleHRFZGl0b3JNb2RlbChjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeSgnZm9vJykpO1xuXHRcdGFzc2VydC5vayhhY2Nlc3Nvci50ZXh0RmlsZVNlcnZpY2UuaXNEaXJ0eSh0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2luZGV4X2FzeW5jLnR4dCcpKSk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0XHRhd2FpdCBhY2Nlc3Nvci50ZXh0RmlsZVNlcnZpY2Uuc2F2ZSh0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2luZGV4X2FzeW5jLnR4dCcpKTtcblx0XHRhd2FpdCBhY2Nlc3Nvci50ZXh0RmlsZVNlcnZpY2Uuc2F2ZSh0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2luZGV4X2FzeW5jMi50eHQnKSk7XG5cdFx0YXNzZXJ0Lm9rKCFhY2Nlc3Nvci50ZXh0RmlsZVNlcnZpY2UuaXNEaXJ0eSh0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2luZGV4X2FzeW5jLnR4dCcpKSk7XG5cdFx0YXNzZXJ0Lm9rKCFhY2Nlc3Nvci50ZXh0RmlsZVNlcnZpY2UuaXNEaXJ0eSh0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2luZGV4X2FzeW5jMi50eHQnKSkpO1xuXG5cdFx0aWYgKGlzV2ViKSB7XG5cdFx0XHQvLyB3ZWIgdGVzdHMgZG9lcyBub3QgZW5zdXJlIHRpbWVvdXRzIGFyZSByZXNwZWN0ZWQgYXQgYWxsLCBzbyB3ZSBjYW5ub3Rcblx0XHRcdC8vIHJlYWxseSBhc3NlcnQgdGhlIG10aW1lIHRvIGJlIGRpZmZlcmVudCwgb25seSB0aGF0IGl0IGlzIGVxdWFsIG9yIGdyZWF0ZXIuXG5cdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTYxODg2XG5cdFx0XHRhc3NlcnQub2soYXNzZXJ0UmV0dXJuc0RlZmluZWQoZ2V0TGFzdFJlc29sdmVkRmlsZVN0YXQobW9kZWwxKSkubXRpbWUgPj0gbTFNdGltZSk7XG5cdFx0XHRhc3NlcnQub2soYXNzZXJ0UmV0dXJuc0RlZmluZWQoZ2V0TGFzdFJlc29sdmVkRmlsZVN0YXQobW9kZWwyKSkubXRpbWUgPj0gbTJNdGltZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIG9uIGRlc2t0b3Agd2Ugd2FudCB0byBhc3NlcnQgdGhpcyBjb25kaXRpb24gbW9yZSBzdHJpY3RseSB0aG91Z2hcblx0XHRcdGFzc2VydC5vayhhc3NlcnRSZXR1cm5zRGVmaW5lZChnZXRMYXN0UmVzb2x2ZWRGaWxlU3RhdChtb2RlbDEpKS5tdGltZSA+IG0xTXRpbWUpO1xuXHRcdFx0YXNzZXJ0Lm9rKGFzc2VydFJldHVybnNEZWZpbmVkKGdldExhc3RSZXNvbHZlZEZpbGVTdGF0KG1vZGVsMikpLm10aW1lID4gbTJNdGltZSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdTYXZlIFBhcnRpY2lwYW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGxldCBldmVudENvdW50ZXIgPSAwO1xuXHRcdGNvbnN0IG1vZGVsOiBUZXh0RmlsZUVkaXRvck1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlRWRpdG9yTW9kZWwsIHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvaW5kZXhfYXN5bmMudHh0JyksICd1dGY4JywgdW5kZWZpbmVkKSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwub25EaWRTYXZlKCgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmFwc2hvdFRvU3RyaW5nKG1vZGVsLmNyZWF0ZVNuYXBzaG90KCkhKSwgZXZlbnRDb3VudGVyID09PSAxID8gJ2JhcicgOiAnZm9vYmFyJyk7XG5cdFx0XHRhc3NlcnQub2soIW1vZGVsLmlzRGlydHkoKSk7XG5cdFx0XHRldmVudENvdW50ZXIrKztcblx0XHR9KSk7XG5cblx0XHRjb25zdCBwYXJ0aWNpcGFudCA9IGFjY2Vzc29yLnRleHRGaWxlU2VydmljZS5maWxlcy5hZGRTYXZlUGFydGljaXBhbnQoe1xuXHRcdFx0cGFydGljaXBhdGU6IGFzeW5jIG1vZGVsID0+IHtcblx0XHRcdFx0YXNzZXJ0Lm9rKG1vZGVsLmlzRGlydHkoKSk7XG5cdFx0XHRcdChtb2RlbCBhcyBUZXh0RmlsZUVkaXRvck1vZGVsKS51cGRhdGVUZXh0RWRpdG9yTW9kZWwoY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnkoJ2JhcicpKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKG1vZGVsLmlzRGlydHkoKSk7XG5cdFx0XHRcdGV2ZW50Q291bnRlcisrO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgbW9kZWwucmVzb2x2ZSgpO1xuXHRcdG1vZGVsLnVwZGF0ZVRleHRFZGl0b3JNb2RlbChjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeSgnZm9vJykpO1xuXHRcdGFzc2VydC5vayhtb2RlbC5pc0RpcnR5KCkpO1xuXG5cdFx0YXdhaXQgbW9kZWwuc2F2ZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50ZXIsIDIpO1xuXG5cdFx0cGFydGljaXBhbnQuZGlzcG9zZSgpO1xuXHRcdG1vZGVsLnVwZGF0ZVRleHRFZGl0b3JNb2RlbChjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeSgnZm9vYmFyJykpO1xuXHRcdGFzc2VydC5vayhtb2RlbC5pc0RpcnR5KCkpO1xuXG5cdFx0YXdhaXQgbW9kZWwuc2F2ZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50ZXIsIDMpO1xuXHR9KTtcblxuXHR0ZXN0KCdTYXZlIFBhcnRpY2lwYW50IC0gc2tpcCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRsZXQgZXZlbnRDb3VudGVyID0gMDtcblx0XHRjb25zdCBtb2RlbDogVGV4dEZpbGVFZGl0b3JNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0RmlsZUVkaXRvck1vZGVsLCB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2luZGV4X2FzeW5jLnR4dCcpLCAndXRmOCcsIHVuZGVmaW5lZCkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjY2Vzc29yLnRleHRGaWxlU2VydmljZS5maWxlcy5hZGRTYXZlUGFydGljaXBhbnQoe1xuXHRcdFx0cGFydGljaXBhdGU6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0ZXZlbnRDb3VudGVyKys7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgbW9kZWwucmVzb2x2ZSgpO1xuXHRcdG1vZGVsLnVwZGF0ZVRleHRFZGl0b3JNb2RlbChjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeSgnZm9vJykpO1xuXG5cdFx0YXdhaXQgbW9kZWwuc2F2ZSh7IHNraXBTYXZlUGFydGljaXBhbnRzOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50ZXIsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdTYXZlIFBhcnRpY2lwYW50LCBhc3luYyBwYXJ0aWNpcGFudCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRsZXQgZXZlbnRDb3VudGVyID0gMDtcblx0XHRjb25zdCBtb2RlbDogVGV4dEZpbGVFZGl0b3JNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0RmlsZUVkaXRvck1vZGVsLCB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2luZGV4X2FzeW5jLnR4dCcpLCAndXRmOCcsIHVuZGVmaW5lZCkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsLm9uRGlkU2F2ZSgoKSA9PiB7XG5cdFx0XHRhc3NlcnQub2soIW1vZGVsLmlzRGlydHkoKSk7XG5cdFx0XHRldmVudENvdW50ZXIrKztcblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoYWNjZXNzb3IudGV4dEZpbGVTZXJ2aWNlLmZpbGVzLmFkZFNhdmVQYXJ0aWNpcGFudCh7XG5cdFx0XHRwYXJ0aWNpcGF0ZTogbW9kZWwgPT4ge1xuXHRcdFx0XHRhc3NlcnQub2sobW9kZWwuaXNEaXJ0eSgpKTtcblx0XHRcdFx0KG1vZGVsIGFzIFRleHRGaWxlRWRpdG9yTW9kZWwpLnVwZGF0ZVRleHRFZGl0b3JNb2RlbChjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeSgnYmFyJykpO1xuXHRcdFx0XHRhc3NlcnQub2sobW9kZWwuaXNEaXJ0eSgpKTtcblx0XHRcdFx0ZXZlbnRDb3VudGVyKys7XG5cblx0XHRcdFx0cmV0dXJuIHRpbWVvdXQoMTApO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IG1vZGVsLnJlc29sdmUoKTtcblx0XHRtb2RlbC51cGRhdGVUZXh0RWRpdG9yTW9kZWwoY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnkoJ2ZvbycpKTtcblxuXHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0YXdhaXQgbW9kZWwuc2F2ZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50ZXIsIDIpO1xuXHRcdGFzc2VydC5vayhEYXRlLm5vdygpIC0gbm93ID49IDEwKTtcblx0fSk7XG5cblx0dGVzdCgnU2F2ZSBQYXJ0aWNpcGFudCwgYmFkIHBhcnRpY2lwYW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG1vZGVsOiBUZXh0RmlsZUVkaXRvck1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlRWRpdG9yTW9kZWwsIHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvaW5kZXhfYXN5bmMudHh0JyksICd1dGY4JywgdW5kZWZpbmVkKSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoYWNjZXNzb3IudGV4dEZpbGVTZXJ2aWNlLmZpbGVzLmFkZFNhdmVQYXJ0aWNpcGFudCh7XG5cdFx0XHRwYXJ0aWNpcGF0ZTogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRuZXcgRXJyb3IoJ2Jvb20nKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBtb2RlbC5yZXNvbHZlKCk7XG5cdFx0bW9kZWwudXBkYXRlVGV4dEVkaXRvck1vZGVsKGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5KCdmb28nKSk7XG5cblx0XHRhd2FpdCBtb2RlbC5zYXZlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NhdmUgUGFydGljaXBhbnQsIHBhcnRpY2lwYW50IGNhbmNlbGxlZCB3aGVuIHNhdmVkIGFnYWluJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG1vZGVsOiBUZXh0RmlsZUVkaXRvck1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlRWRpdG9yTW9kZWwsIHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvaW5kZXhfYXN5bmMudHh0JyksICd1dGY4JywgdW5kZWZpbmVkKSk7XG5cblx0XHRjb25zdCBwYXJ0aWNpcGF0aW9uczogYm9vbGVhbltdID0gW107XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoYWNjZXNzb3IudGV4dEZpbGVTZXJ2aWNlLmZpbGVzLmFkZFNhdmVQYXJ0aWNpcGFudCh7XG5cdFx0XHRwYXJ0aWNpcGF0ZTogYXN5bmMgKG1vZGVsLCBjb250ZXh0LCBwcm9ncmVzcywgdG9rZW4pID0+IHtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRcdFx0aWYgKCF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHBhcnRpY2lwYXRpb25zLnB1c2godHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBtb2RlbC5yZXNvbHZlKCk7XG5cblx0XHRtb2RlbC51cGRhdGVUZXh0RWRpdG9yTW9kZWwoY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnkoJ2ZvbycpKTtcblx0XHRjb25zdCBwMSA9IG1vZGVsLnNhdmUoKTtcblxuXHRcdG1vZGVsLnVwZGF0ZVRleHRFZGl0b3JNb2RlbChjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeSgnZm9vIDEnKSk7XG5cdFx0Y29uc3QgcDIgPSBtb2RlbC5zYXZlKCk7XG5cblx0XHRtb2RlbC51cGRhdGVUZXh0RWRpdG9yTW9kZWwoY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnkoJ2ZvbyAyJykpO1xuXHRcdGNvbnN0IHAzID0gbW9kZWwuc2F2ZSgpO1xuXG5cdFx0bW9kZWwudXBkYXRlVGV4dEVkaXRvck1vZGVsKGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5KCdmb28gMycpKTtcblx0XHRjb25zdCBwNCA9IG1vZGVsLnNhdmUoKTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtwMSwgcDIsIHAzLCBwNF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0aWNpcGF0aW9ucy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdTYXZlIFBhcnRpY2lwYW50LCBjYWxsaW5nIHNhdmUgZnJvbSB3aXRoaW4gaXMgdW5zdXBwb3J0ZWQgYnV0IGRvZXMgbm90IGV4cGxvZGUgKHN5bmMgc2F2ZSwgbm8gbW9kZWwgY2hhbmdlKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtb2RlbDogVGV4dEZpbGVFZGl0b3JNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0RmlsZUVkaXRvck1vZGVsLCB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2luZGV4X2FzeW5jLnR4dCcpLCAndXRmOCcsIHVuZGVmaW5lZCkpO1xuXG5cdFx0YXdhaXQgdGVzdFNhdmVGcm9tU2F2ZVBhcnRpY2lwYW50KG1vZGVsLCBmYWxzZSwgZmFsc2UsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnU2F2ZSBQYXJ0aWNpcGFudCwgY2FsbGluZyBzYXZlIGZyb20gd2l0aGluIGlzIHVuc3VwcG9ydGVkIGJ1dCBkb2VzIG5vdCBleHBsb2RlIChhc3luYyBzYXZlLCBubyBtb2RlbCBjaGFuZ2UpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG1vZGVsOiBUZXh0RmlsZUVkaXRvck1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlRWRpdG9yTW9kZWwsIHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvaW5kZXhfYXN5bmMudHh0JyksICd1dGY4JywgdW5kZWZpbmVkKSk7XG5cblx0XHRhd2FpdCB0ZXN0U2F2ZUZyb21TYXZlUGFydGljaXBhbnQobW9kZWwsIHRydWUsIGZhbHNlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NhdmUgUGFydGljaXBhbnQsIGNhbGxpbmcgc2F2ZSBmcm9tIHdpdGhpbiBpcyB1bnN1cHBvcnRlZCBidXQgZG9lcyBub3QgZXhwbG9kZSAoc3luYyBzYXZlLCBtb2RlbCBjaGFuZ2UpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG1vZGVsOiBUZXh0RmlsZUVkaXRvck1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlRWRpdG9yTW9kZWwsIHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvaW5kZXhfYXN5bmMudHh0JyksICd1dGY4JywgdW5kZWZpbmVkKSk7XG5cblx0XHRhd2FpdCB0ZXN0U2F2ZUZyb21TYXZlUGFydGljaXBhbnQobW9kZWwsIGZhbHNlLCB0cnVlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NhdmUgUGFydGljaXBhbnQsIGNhbGxpbmcgc2F2ZSBmcm9tIHdpdGhpbiBpcyB1bnN1cHBvcnRlZCBidXQgZG9lcyBub3QgZXhwbG9kZSAoYXN5bmMgc2F2ZSwgbW9kZWwgY2hhbmdlKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtb2RlbDogVGV4dEZpbGVFZGl0b3JNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0RmlsZUVkaXRvck1vZGVsLCB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2luZGV4X2FzeW5jLnR4dCcpLCAndXRmOCcsIHVuZGVmaW5lZCkpO1xuXG5cdFx0YXdhaXQgdGVzdFNhdmVGcm9tU2F2ZVBhcnRpY2lwYW50KG1vZGVsLCB0cnVlLCB0cnVlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NhdmUgUGFydGljaXBhbnQsIGNhbGxpbmcgc2F2ZSBmcm9tIHdpdGhpbiBpcyB1bnN1cHBvcnRlZCBidXQgZG9lcyBub3QgZXhwbG9kZSAoZm9yY2UpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG1vZGVsOiBUZXh0RmlsZUVkaXRvck1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlRWRpdG9yTW9kZWwsIHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvaW5kZXhfYXN5bmMudHh0JyksICd1dGY4JywgdW5kZWZpbmVkKSk7XG5cblx0XHRhd2FpdCB0ZXN0U2F2ZUZyb21TYXZlUGFydGljaXBhbnQobW9kZWwsIGZhbHNlLCBmYWxzZSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RTYXZlRnJvbVNhdmVQYXJ0aWNpcGFudChtb2RlbDogVGV4dEZpbGVFZGl0b3JNb2RlbCwgYXN5bmM6IGJvb2xlYW4sIG1vZGVsQ2hhbmdlOiBib29sZWFuLCBmb3JjZTogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjY2Vzc29yLnRleHRGaWxlU2VydmljZS5maWxlcy5hZGRTYXZlUGFydGljaXBhbnQoe1xuXHRcdFx0cGFydGljaXBhdGU6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0aWYgKGFzeW5jKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAobW9kZWxDaGFuZ2UpIHtcblx0XHRcdFx0XHRtb2RlbC51cGRhdGVUZXh0RWRpdG9yTW9kZWwoY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnkoJ2JhcicpKTtcblxuXHRcdFx0XHRcdGNvbnN0IG5ld1NhdmVQcm9taXNlID0gbW9kZWwuc2F2ZShmb3JjZSA/IHsgZm9yY2UgfSA6IHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0XHQvLyBhc3NlcnQgdGhhdCB0aGlzIGlzIG5vdCB0aGUgc2FtZSBwcm9taXNlIGFzIHRoZSBvdXRlciBvbmVcblx0XHRcdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoc2F2ZVByb21pc2UsIG5ld1NhdmVQcm9taXNlKTtcblxuXHRcdFx0XHRcdGF3YWl0IG5ld1NhdmVQcm9taXNlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IG5ld1NhdmVQcm9taXNlID0gbW9kZWwuc2F2ZShmb3JjZSA/IHsgZm9yY2UgfSA6IHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0XHQvLyBhc3NlcnQgdGhhdCB0aGlzIGlzIHRoZSBzYW1lIHByb21pc2UgYXMgdGhlIG91dGVyIG9uZVxuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYXZlUHJvbWlzZSwgbmV3U2F2ZVByb21pc2UpO1xuXG5cdFx0XHRcdFx0YXdhaXQgc2F2ZVByb21pc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBtb2RlbC5yZXNvbHZlKCk7XG5cdFx0bW9kZWwudXBkYXRlVGV4dEVkaXRvck1vZGVsKGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5KCdmb28nKSk7XG5cblx0XHRjb25zdCBzYXZlUHJvbWlzZSA9IG1vZGVsLnNhdmUoZm9yY2UgPyB7IGZvcmNlIH0gOiB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNhdmVQcm9taXNlO1xuXHR9XG5cblx0dGVzdCgnU2F2ZSBQYXJ0aWNpcGFudCBjYXJyaWVzIGNvbnRleHQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbW9kZWw6IFRleHRGaWxlRWRpdG9yTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGV4dEZpbGVFZGl0b3JNb2RlbCwgdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9pbmRleF9hc3luYy50eHQnKSwgJ3V0ZjgnLCB1bmRlZmluZWQpKTtcblxuXHRcdGNvbnN0IGZyb20gPSBVUkkuZmlsZSgndGVzdEZyb20nKTtcblx0XHRsZXQgZTogRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjY2Vzc29yLnRleHRGaWxlU2VydmljZS5maWxlcy5hZGRTYXZlUGFydGljaXBhbnQoe1xuXHRcdFx0cGFydGljaXBhdGU6IGFzeW5jICh3YywgY29udGV4dCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZXh0LnJlYXNvbiwgU2F2ZVJlYXNvbi5FWFBMSUNJVCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHQuc2F2ZWRGcm9tPy50b1N0cmluZygpLCBmcm9tLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdGUgPSBlcnJvcjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IG1vZGVsLnJlc29sdmUoKTtcblx0XHRtb2RlbC51cGRhdGVUZXh0RWRpdG9yTW9kZWwoY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnkoJ2ZvbycpKTtcblxuXHRcdGF3YWl0IG1vZGVsLnNhdmUoeyBmb3JjZTogdHJ1ZSwgZnJvbSB9KTtcblxuXHRcdGlmIChlKSB7XG5cdFx0XHR0aHJvdyBlO1xuXHRcdH1cblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUVuQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGNBQWMsMEJBQTBCLGtCQUFrQiw2QkFBNEQ7QUFDL0gsU0FBUyx1QkFBdUIsK0JBQStCLHFCQUFxQixpQ0FBaUMsK0JBQStCO0FBQ3BKLFNBQVMsbUJBQW1CLHlDQUF5QyxrQkFBa0I7QUFFdkYsU0FBUyxxQkFBcUIsb0JBQW9CLDBDQUEwQztBQUM1RixTQUFTLGlCQUFpQixlQUFlO0FBQ3pDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsaUJBQWlCLG9CQUFvQjtBQUM5QyxTQUFTLFlBQVksMEJBQTBCO0FBQy9DLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsV0FBVztBQUVwQixNQUFNLCtCQUErQixNQUFNO0FBRTFDLFdBQVMs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
