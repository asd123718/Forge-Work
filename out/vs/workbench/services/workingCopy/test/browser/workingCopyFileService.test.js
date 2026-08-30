import assert from "assert";
import { TextFileEditorModel } from "../../../textfile/common/textFileEditorModel.js";
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from "../../../../../base/test/common/utils.js";
import { workbenchInstantiationService, TestServiceAccessor } from "../../../../test/browser/workbenchTestServices.js";
import { FileOperation } from "../../../../../platform/files/common/files.js";
import { TestWorkingCopy } from "../../../../test/common/workbenchTestServices.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { timeout } from "../../../../../base/common/async.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
suite("WorkingCopyFileService", () => {
  const disposables = new DisposableStore();
  let instantiationService;
  let accessor;
  setup(() => {
    instantiationService = workbenchInstantiationService(void 0, disposables);
    accessor = instantiationService.createInstance(TestServiceAccessor);
    disposables.add(accessor.textFileService.files);
  });
  teardown(() => {
    disposables.clear();
  });
  test("create - dirty file", async function() {
    await testCreate(toResource.call(this, "/path/file.txt"), VSBuffer.fromString("Hello World"));
  });
  test("delete - dirty file", async function() {
    await testDelete([toResource.call(this, "/path/file.txt")]);
  });
  test("delete multiple - dirty files", async function() {
    await testDelete([
      toResource.call(this, "/path/file1.txt"),
      toResource.call(this, "/path/file2.txt"),
      toResource.call(this, "/path/file3.txt"),
      toResource.call(this, "/path/file4.txt")
    ]);
  });
  test("move - dirty file", async function() {
    await testMoveOrCopy([{ source: toResource.call(this, "/path/file.txt"), target: toResource.call(this, "/path/file_target.txt") }], true);
  });
  test("move - source identical to target", async function() {
    const sourceModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/file.txt"), "utf8", void 0);
    accessor.textFileService.files.add(sourceModel.resource, sourceModel);
    const eventCounter = await testEventsMoveOrCopy([{ file: { source: sourceModel.resource, target: sourceModel.resource }, overwrite: true }], true);
    sourceModel.dispose();
    assert.strictEqual(eventCounter, 3);
  });
  test("move - one source == target and another source != target", async function() {
    const sourceModel1 = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/file1.txt"), "utf8", void 0);
    const sourceModel2 = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/file2.txt"), "utf8", void 0);
    const targetModel2 = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/file_target2.txt"), "utf8", void 0);
    accessor.textFileService.files.add(sourceModel1.resource, sourceModel1);
    accessor.textFileService.files.add(sourceModel2.resource, sourceModel2);
    accessor.textFileService.files.add(targetModel2.resource, targetModel2);
    const eventCounter = await testEventsMoveOrCopy([
      { file: { source: sourceModel1.resource, target: sourceModel1.resource }, overwrite: true },
      { file: { source: sourceModel2.resource, target: targetModel2.resource }, overwrite: true }
    ], true);
    sourceModel1.dispose();
    sourceModel2.dispose();
    targetModel2.dispose();
    assert.strictEqual(eventCounter, 3);
  });
  test("move multiple - dirty file", async function() {
    await testMoveOrCopy(
      [
        { source: toResource.call(this, "/path/file1.txt"), target: toResource.call(this, "/path/file1_target.txt") },
        { source: toResource.call(this, "/path/file2.txt"), target: toResource.call(this, "/path/file2_target.txt") }
      ],
      true
    );
  });
  test("move - dirty file (target exists and is dirty)", async function() {
    await testMoveOrCopy([{ source: toResource.call(this, "/path/file.txt"), target: toResource.call(this, "/path/file_target.txt") }], true, true);
  });
  test("copy - dirty file", async function() {
    await testMoveOrCopy([{ source: toResource.call(this, "/path/file.txt"), target: toResource.call(this, "/path/file_target.txt") }], false);
  });
  test("copy - source identical to target", async function() {
    const sourceModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/file.txt"), "utf8", void 0);
    accessor.textFileService.files.add(sourceModel.resource, sourceModel);
    const eventCounter = await testEventsMoveOrCopy([{ file: { source: sourceModel.resource, target: sourceModel.resource }, overwrite: true }]);
    sourceModel.dispose();
    assert.strictEqual(eventCounter, 3);
  });
  test("copy - one source == target and another source != target", async function() {
    const sourceModel1 = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/file1.txt"), "utf8", void 0);
    const sourceModel2 = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/file2.txt"), "utf8", void 0);
    const targetModel2 = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/file_target2.txt"), "utf8", void 0);
    accessor.textFileService.files.add(sourceModel1.resource, sourceModel1);
    accessor.textFileService.files.add(sourceModel2.resource, sourceModel2);
    accessor.textFileService.files.add(targetModel2.resource, targetModel2);
    const eventCounter = await testEventsMoveOrCopy([
      { file: { source: sourceModel1.resource, target: sourceModel1.resource }, overwrite: true },
      { file: { source: sourceModel2.resource, target: targetModel2.resource }, overwrite: true }
    ]);
    sourceModel1.dispose();
    sourceModel2.dispose();
    targetModel2.dispose();
    assert.strictEqual(eventCounter, 3);
  });
  test("copy multiple - dirty file", async function() {
    await testMoveOrCopy(
      [
        { source: toResource.call(this, "/path/file1.txt"), target: toResource.call(this, "/path/file_target1.txt") },
        { source: toResource.call(this, "/path/file2.txt"), target: toResource.call(this, "/path/file_target2.txt") },
        { source: toResource.call(this, "/path/file3.txt"), target: toResource.call(this, "/path/file_target3.txt") }
      ],
      false
    );
  });
  test("copy - dirty file (target exists and is dirty)", async function() {
    await testMoveOrCopy([{ source: toResource.call(this, "/path/file.txt"), target: toResource.call(this, "/path/file_target.txt") }], false, true);
  });
  test("getDirty", async function() {
    const model1 = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/file-1.txt"), "utf8", void 0);
    accessor.textFileService.files.add(model1.resource, model1);
    const model2 = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/file-2.txt"), "utf8", void 0);
    accessor.textFileService.files.add(model2.resource, model2);
    let dirty = accessor.workingCopyFileService.getDirty(model1.resource);
    assert.strictEqual(dirty.length, 0);
    await model1.resolve();
    model1.textEditorModel.setValue("foo");
    dirty = accessor.workingCopyFileService.getDirty(model1.resource);
    assert.strictEqual(dirty.length, 1);
    assert.strictEqual(dirty[0], model1);
    dirty = accessor.workingCopyFileService.getDirty(toResource.call(this, "/path"));
    assert.strictEqual(dirty.length, 1);
    assert.strictEqual(dirty[0], model1);
    await model2.resolve();
    model2.textEditorModel.setValue("bar");
    dirty = accessor.workingCopyFileService.getDirty(toResource.call(this, "/path"));
    assert.strictEqual(dirty.length, 2);
    model1.dispose();
    model2.dispose();
  });
  test("registerWorkingCopyProvider", async function() {
    const model1 = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/file-1.txt"), "utf8", void 0));
    accessor.textFileService.files.add(model1.resource, model1);
    await model1.resolve();
    model1.textEditorModel.setValue("foo");
    const testWorkingCopy = disposables.add(new TestWorkingCopy(toResource.call(this, "/path/file-2.txt"), true));
    const registration = accessor.workingCopyFileService.registerWorkingCopyProvider(() => {
      return [model1, testWorkingCopy];
    });
    let dirty = accessor.workingCopyFileService.getDirty(model1.resource);
    assert.strictEqual(dirty.length, 2, "Should return default working copy + working copy from provider");
    assert.strictEqual(dirty[0], model1);
    assert.strictEqual(dirty[1], testWorkingCopy);
    registration.dispose();
    dirty = accessor.workingCopyFileService.getDirty(model1.resource);
    assert.strictEqual(dirty.length, 1, "Should have unregistered our provider");
    assert.strictEqual(dirty[0], model1);
  });
  test("createFolder", async function() {
    let eventCounter = 0;
    let correlationId = void 0;
    const resource = toResource.call(this, "/path/folder");
    disposables.add(accessor.workingCopyFileService.addFileOperationParticipant({
      participate: async (files, operation) => {
        assert.strictEqual(files.length, 1);
        const file = files[0];
        assert.strictEqual(file.target.toString(), resource.toString());
        assert.strictEqual(operation, FileOperation.CREATE);
        eventCounter++;
      }
    }));
    disposables.add(accessor.workingCopyFileService.onWillRunWorkingCopyFileOperation((e) => {
      assert.strictEqual(e.files.length, 1);
      const file = e.files[0];
      assert.strictEqual(file.target.toString(), resource.toString());
      assert.strictEqual(e.operation, FileOperation.CREATE);
      correlationId = e.correlationId;
      eventCounter++;
    }));
    disposables.add(accessor.workingCopyFileService.onDidRunWorkingCopyFileOperation((e) => {
      assert.strictEqual(e.files.length, 1);
      const file = e.files[0];
      assert.strictEqual(file.target.toString(), resource.toString());
      assert.strictEqual(e.operation, FileOperation.CREATE);
      assert.strictEqual(e.correlationId, correlationId);
      eventCounter++;
    }));
    await accessor.workingCopyFileService.createFolder([{ resource }], CancellationToken.None);
    assert.strictEqual(eventCounter, 3);
  });
  test("cancellation of participants", async function() {
    const resource = toResource.call(this, "/path/folder");
    let canceled = false;
    disposables.add(accessor.workingCopyFileService.addFileOperationParticipant({
      participate: async (files, operation, info, t, token) => {
        await timeout(0);
        canceled = token.isCancellationRequested;
      }
    }));
    let cts = new CancellationTokenSource();
    let promise = accessor.workingCopyFileService.create([{ resource }], cts.token);
    cts.cancel();
    await promise;
    assert.strictEqual(canceled, true);
    canceled = false;
    cts = new CancellationTokenSource();
    promise = accessor.workingCopyFileService.createFolder([{ resource }], cts.token);
    cts.cancel();
    await promise;
    assert.strictEqual(canceled, true);
    canceled = false;
    cts = new CancellationTokenSource();
    promise = accessor.workingCopyFileService.move([{ file: { source: resource, target: resource } }], cts.token);
    cts.cancel();
    await promise;
    assert.strictEqual(canceled, true);
    canceled = false;
    cts = new CancellationTokenSource();
    promise = accessor.workingCopyFileService.copy([{ file: { source: resource, target: resource } }], cts.token);
    cts.cancel();
    await promise;
    assert.strictEqual(canceled, true);
    canceled = false;
    cts = new CancellationTokenSource();
    promise = accessor.workingCopyFileService.delete([{ resource }], cts.token);
    cts.cancel();
    await promise;
    assert.strictEqual(canceled, true);
    canceled = false;
  });
  async function testEventsMoveOrCopy(files, move) {
    let eventCounter = 0;
    const participant = accessor.workingCopyFileService.addFileOperationParticipant({
      participate: async (files2) => {
        eventCounter++;
      }
    });
    const listener1 = accessor.workingCopyFileService.onWillRunWorkingCopyFileOperation((e) => {
      eventCounter++;
    });
    const listener2 = accessor.workingCopyFileService.onDidRunWorkingCopyFileOperation((e) => {
      eventCounter++;
    });
    if (move) {
      await accessor.workingCopyFileService.move(files, CancellationToken.None);
    } else {
      await accessor.workingCopyFileService.copy(files, CancellationToken.None);
    }
    participant.dispose();
    listener1.dispose();
    listener2.dispose();
    return eventCounter;
  }
  async function testMoveOrCopy(files, move, targetDirty) {
    let eventCounter = 0;
    const models = await Promise.all(files.map(async ({ source, target }, i) => {
      const sourceModel = instantiationService.createInstance(TextFileEditorModel, source, "utf8", void 0);
      const targetModel = instantiationService.createInstance(TextFileEditorModel, target, "utf8", void 0);
      accessor.textFileService.files.add(sourceModel.resource, sourceModel);
      accessor.textFileService.files.add(targetModel.resource, targetModel);
      await sourceModel.resolve();
      sourceModel.textEditorModel.setValue("foo" + i);
      assert.ok(accessor.textFileService.isDirty(sourceModel.resource));
      if (targetDirty) {
        await targetModel.resolve();
        targetModel.textEditorModel.setValue("bar" + i);
        assert.ok(accessor.textFileService.isDirty(targetModel.resource));
      }
      return { sourceModel, targetModel };
    }));
    const participant = accessor.workingCopyFileService.addFileOperationParticipant({
      participate: async (files2, operation) => {
        for (let i = 0; i < files2.length; i++) {
          const { target, source } = files2[i];
          const { targetModel, sourceModel } = models[i];
          assert.strictEqual(target.toString(), targetModel.resource.toString());
          assert.strictEqual(source?.toString(), sourceModel.resource.toString());
        }
        eventCounter++;
        assert.strictEqual(operation, move ? FileOperation.MOVE : FileOperation.COPY);
      }
    });
    let correlationId;
    const listener1 = accessor.workingCopyFileService.onWillRunWorkingCopyFileOperation((e) => {
      for (let i = 0; i < e.files.length; i++) {
        const { target, source } = files[i];
        const { targetModel, sourceModel } = models[i];
        assert.strictEqual(target.toString(), targetModel.resource.toString());
        assert.strictEqual(source?.toString(), sourceModel.resource.toString());
      }
      eventCounter++;
      correlationId = e.correlationId;
      assert.strictEqual(e.operation, move ? FileOperation.MOVE : FileOperation.COPY);
    });
    const listener2 = accessor.workingCopyFileService.onDidRunWorkingCopyFileOperation((e) => {
      for (let i = 0; i < e.files.length; i++) {
        const { target, source } = files[i];
        const { targetModel, sourceModel } = models[i];
        assert.strictEqual(target.toString(), targetModel.resource.toString());
        assert.strictEqual(source?.toString(), sourceModel.resource.toString());
      }
      eventCounter++;
      assert.strictEqual(e.operation, move ? FileOperation.MOVE : FileOperation.COPY);
      assert.strictEqual(e.correlationId, correlationId);
    });
    if (move) {
      await accessor.workingCopyFileService.move(models.map((model) => ({ file: { source: model.sourceModel.resource, target: model.targetModel.resource }, options: { overwrite: true } })), CancellationToken.None);
    } else {
      await accessor.workingCopyFileService.copy(models.map((model) => ({ file: { source: model.sourceModel.resource, target: model.targetModel.resource }, options: { overwrite: true } })), CancellationToken.None);
    }
    for (let i = 0; i < models.length; i++) {
      const { sourceModel, targetModel } = models[i];
      assert.strictEqual(targetModel.textEditorModel.getValue(), "foo" + i);
      if (move) {
        assert.ok(!accessor.textFileService.isDirty(sourceModel.resource));
      } else {
        assert.ok(accessor.textFileService.isDirty(sourceModel.resource));
      }
      assert.ok(accessor.textFileService.isDirty(targetModel.resource));
      sourceModel.dispose();
      targetModel.dispose();
    }
    assert.strictEqual(eventCounter, 3);
    participant.dispose();
    listener1.dispose();
    listener2.dispose();
  }
  async function testDelete(resources) {
    const models = await Promise.all(resources.map(async (resource) => {
      const model = instantiationService.createInstance(TextFileEditorModel, resource, "utf8", void 0);
      accessor.textFileService.files.add(model.resource, model);
      await model.resolve();
      model.textEditorModel.setValue("foo");
      assert.ok(accessor.workingCopyService.isDirty(model.resource));
      return model;
    }));
    let eventCounter = 0;
    let correlationId = void 0;
    const participant = accessor.workingCopyFileService.addFileOperationParticipant({
      participate: async (files, operation) => {
        for (let i = 0; i < models.length; i++) {
          const model = models[i];
          const file = files[i];
          assert.strictEqual(file.target.toString(), model.resource.toString());
        }
        assert.strictEqual(operation, FileOperation.DELETE);
        eventCounter++;
      }
    });
    const listener1 = accessor.workingCopyFileService.onWillRunWorkingCopyFileOperation((e) => {
      for (let i = 0; i < models.length; i++) {
        const model = models[i];
        const file = e.files[i];
        assert.strictEqual(file.target.toString(), model.resource.toString());
      }
      assert.strictEqual(e.operation, FileOperation.DELETE);
      correlationId = e.correlationId;
      eventCounter++;
    });
    const listener2 = accessor.workingCopyFileService.onDidRunWorkingCopyFileOperation((e) => {
      for (let i = 0; i < models.length; i++) {
        const model = models[i];
        const file = e.files[i];
        assert.strictEqual(file.target.toString(), model.resource.toString());
      }
      assert.strictEqual(e.operation, FileOperation.DELETE);
      assert.strictEqual(e.correlationId, correlationId);
      eventCounter++;
    });
    await accessor.workingCopyFileService.delete(models.map((model) => ({ resource: model.resource })), CancellationToken.None);
    for (const model of models) {
      assert.ok(!accessor.workingCopyService.isDirty(model.resource));
      model.dispose();
    }
    assert.strictEqual(eventCounter, 3);
    participant.dispose();
    listener1.dispose();
    listener2.dispose();
  }
  async function testCreate(resource, contents) {
    const model = instantiationService.createInstance(TextFileEditorModel, resource, "utf8", void 0);
    accessor.textFileService.files.add(model.resource, model);
    await model.resolve();
    model.textEditorModel.setValue("foo");
    assert.ok(accessor.workingCopyService.isDirty(model.resource));
    let eventCounter = 0;
    let correlationId = void 0;
    disposables.add(accessor.workingCopyFileService.addFileOperationParticipant({
      participate: async (files, operation) => {
        assert.strictEqual(files.length, 1);
        const file = files[0];
        assert.strictEqual(file.target.toString(), model.resource.toString());
        assert.strictEqual(operation, FileOperation.CREATE);
        eventCounter++;
      }
    }));
    disposables.add(accessor.workingCopyFileService.onWillRunWorkingCopyFileOperation((e) => {
      assert.strictEqual(e.files.length, 1);
      const file = e.files[0];
      assert.strictEqual(file.target.toString(), model.resource.toString());
      assert.strictEqual(e.operation, FileOperation.CREATE);
      correlationId = e.correlationId;
      eventCounter++;
    }));
    disposables.add(accessor.workingCopyFileService.onDidRunWorkingCopyFileOperation((e) => {
      assert.strictEqual(e.files.length, 1);
      const file = e.files[0];
      assert.strictEqual(file.target.toString(), model.resource.toString());
      assert.strictEqual(e.operation, FileOperation.CREATE);
      assert.strictEqual(e.correlationId, correlationId);
      eventCounter++;
    }));
    await accessor.workingCopyFileService.create([{ resource, contents }], CancellationToken.None);
    assert.ok(!accessor.workingCopyService.isDirty(model.resource));
    model.dispose();
    assert.strictEqual(eventCounter, 3);
  }
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx3b3JraW5nQ29weVxcdGVzdFxcYnJvd3Nlclxcd29ya2luZ0NvcHlGaWxlU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVGV4dEZpbGVFZGl0b3JNb2RlbCB9IGZyb20gJy4uLy4uLy4uL3RleHRmaWxlL2NvbW1vbi90ZXh0RmlsZUVkaXRvck1vZGVsLmpzJztcbmltcG9ydCB7IFRleHRGaWxlRWRpdG9yTW9kZWxNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vLi4vdGV4dGZpbGUvY29tbW9uL3RleHRGaWxlRWRpdG9yTW9kZWxNYW5hZ2VyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlLCB0b1Jlc291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSwgVGVzdFNlcnZpY2VBY2Nlc3NvciwgSVRlc3RUZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlciB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgVGVzdFdvcmtpbmdDb3B5IH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IElDb3B5T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3dvcmtpbmdDb3B5RmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuXG5zdWl0ZSgnV29ya2luZ0NvcHlGaWxlU2VydmljZScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBhY2Nlc3NvcjogVGVzdFNlcnZpY2VBY2Nlc3NvcjtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHRhY2Nlc3NvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTZXJ2aWNlQWNjZXNzb3IpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCg8VGV4dEZpbGVFZGl0b3JNb2RlbE1hbmFnZXI+YWNjZXNzb3IudGV4dEZpbGVTZXJ2aWNlLmZpbGVzKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZSAtIGRpcnR5IGZpbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgdGVzdENyZWF0ZSh0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2ZpbGUudHh0JyksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ0hlbGxvIFdvcmxkJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGUgLSBkaXJ0eSBmaWxlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHRlc3REZWxldGUoW3RvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvZmlsZS50eHQnKV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGUgbXVsdGlwbGUgLSBkaXJ0eSBmaWxlcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB0ZXN0RGVsZXRlKFtcblx0XHRcdHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvZmlsZTEudHh0JyksXG5cdFx0XHR0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2ZpbGUyLnR4dCcpLFxuXHRcdFx0dG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9maWxlMy50eHQnKSxcblx0XHRcdHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvZmlsZTQudHh0JyldKTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSAtIGRpcnR5IGZpbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgdGVzdE1vdmVPckNvcHkoW3sgc291cmNlOiB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2ZpbGUudHh0JyksIHRhcmdldDogdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9maWxlX3RhcmdldC50eHQnKSB9XSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgLSBzb3VyY2UgaWRlbnRpY2FsIHRvIHRhcmdldCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzb3VyY2VNb2RlbDogVGV4dEZpbGVFZGl0b3JNb2RlbCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlRWRpdG9yTW9kZWwsIHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvZmlsZS50eHQnKSwgJ3V0ZjgnLCB1bmRlZmluZWQpO1xuXHRcdCg8SVRlc3RUZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlcj5hY2Nlc3Nvci50ZXh0RmlsZVNlcnZpY2UuZmlsZXMpLmFkZChzb3VyY2VNb2RlbC5yZXNvdXJjZSwgc291cmNlTW9kZWwpO1xuXG5cdFx0Y29uc3QgZXZlbnRDb3VudGVyID0gYXdhaXQgdGVzdEV2ZW50c01vdmVPckNvcHkoW3sgZmlsZTogeyBzb3VyY2U6IHNvdXJjZU1vZGVsLnJlc291cmNlLCB0YXJnZXQ6IHNvdXJjZU1vZGVsLnJlc291cmNlIH0sIG92ZXJ3cml0ZTogdHJ1ZSB9XSwgdHJ1ZSk7XG5cblx0XHRzb3VyY2VNb2RlbC5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Q291bnRlciwgMyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgLSBvbmUgc291cmNlID09IHRhcmdldCBhbmQgYW5vdGhlciBzb3VyY2UgIT0gdGFyZ2V0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNvdXJjZU1vZGVsMTogVGV4dEZpbGVFZGl0b3JNb2RlbCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlRWRpdG9yTW9kZWwsIHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvZmlsZTEudHh0JyksICd1dGY4JywgdW5kZWZpbmVkKTtcblx0XHRjb25zdCBzb3VyY2VNb2RlbDI6IFRleHRGaWxlRWRpdG9yTW9kZWwgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0RmlsZUVkaXRvck1vZGVsLCB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2ZpbGUyLnR4dCcpLCAndXRmOCcsIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgdGFyZ2V0TW9kZWwyOiBUZXh0RmlsZUVkaXRvck1vZGVsID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGV4dEZpbGVFZGl0b3JNb2RlbCwgdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9maWxlX3RhcmdldDIudHh0JyksICd1dGY4JywgdW5kZWZpbmVkKTtcblx0XHQoPElUZXN0VGV4dEZpbGVFZGl0b3JNb2RlbE1hbmFnZXI+YWNjZXNzb3IudGV4dEZpbGVTZXJ2aWNlLmZpbGVzKS5hZGQoc291cmNlTW9kZWwxLnJlc291cmNlLCBzb3VyY2VNb2RlbDEpO1xuXHRcdCg8SVRlc3RUZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlcj5hY2Nlc3Nvci50ZXh0RmlsZVNlcnZpY2UuZmlsZXMpLmFkZChzb3VyY2VNb2RlbDIucmVzb3VyY2UsIHNvdXJjZU1vZGVsMik7XG5cdFx0KDxJVGVzdFRleHRGaWxlRWRpdG9yTW9kZWxNYW5hZ2VyPmFjY2Vzc29yLnRleHRGaWxlU2VydmljZS5maWxlcykuYWRkKHRhcmdldE1vZGVsMi5yZXNvdXJjZSwgdGFyZ2V0TW9kZWwyKTtcblxuXHRcdGNvbnN0IGV2ZW50Q291bnRlciA9IGF3YWl0IHRlc3RFdmVudHNNb3ZlT3JDb3B5KFtcblx0XHRcdHsgZmlsZTogeyBzb3VyY2U6IHNvdXJjZU1vZGVsMS5yZXNvdXJjZSwgdGFyZ2V0OiBzb3VyY2VNb2RlbDEucmVzb3VyY2UgfSwgb3ZlcndyaXRlOiB0cnVlIH0sXG5cdFx0XHR7IGZpbGU6IHsgc291cmNlOiBzb3VyY2VNb2RlbDIucmVzb3VyY2UsIHRhcmdldDogdGFyZ2V0TW9kZWwyLnJlc291cmNlIH0sIG92ZXJ3cml0ZTogdHJ1ZSB9XG5cdFx0XSwgdHJ1ZSk7XG5cblx0XHRzb3VyY2VNb2RlbDEuZGlzcG9zZSgpO1xuXHRcdHNvdXJjZU1vZGVsMi5kaXNwb3NlKCk7XG5cdFx0dGFyZ2V0TW9kZWwyLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRDb3VudGVyLCAzKTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSBtdWx0aXBsZSAtIGRpcnR5IGZpbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgdGVzdE1vdmVPckNvcHkoW1xuXHRcdFx0eyBzb3VyY2U6IHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvZmlsZTEudHh0JyksIHRhcmdldDogdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9maWxlMV90YXJnZXQudHh0JykgfSxcblx0XHRcdHsgc291cmNlOiB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2ZpbGUyLnR4dCcpLCB0YXJnZXQ6IHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvZmlsZTJfdGFyZ2V0LnR4dCcpIH1dLFxuXHRcdFx0dHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgLSBkaXJ0eSBmaWxlICh0YXJnZXQgZXhpc3RzIGFuZCBpcyBkaXJ0eSknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgdGVzdE1vdmVPckNvcHkoW3sgc291cmNlOiB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2ZpbGUudHh0JyksIHRhcmdldDogdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9maWxlX3RhcmdldC50eHQnKSB9XSwgdHJ1ZSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcHkgLSBkaXJ0eSBmaWxlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHRlc3RNb3ZlT3JDb3B5KFt7IHNvdXJjZTogdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9maWxlLnR4dCcpLCB0YXJnZXQ6IHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvZmlsZV90YXJnZXQudHh0JykgfV0sIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnY29weSAtIHNvdXJjZSBpZGVudGljYWwgdG8gdGFyZ2V0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNvdXJjZU1vZGVsOiBUZXh0RmlsZUVkaXRvck1vZGVsID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGV4dEZpbGVFZGl0b3JNb2RlbCwgdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9maWxlLnR4dCcpLCAndXRmOCcsIHVuZGVmaW5lZCk7XG5cdFx0KDxJVGVzdFRleHRGaWxlRWRpdG9yTW9kZWxNYW5hZ2VyPmFjY2Vzc29yLnRleHRGaWxlU2VydmljZS5maWxlcykuYWRkKHNvdXJjZU1vZGVsLnJlc291cmNlLCBzb3VyY2VNb2RlbCk7XG5cblx0XHRjb25zdCBldmVudENvdW50ZXIgPSBhd2FpdCB0ZXN0RXZlbnRzTW92ZU9yQ29weShbeyBmaWxlOiB7IHNvdXJjZTogc291cmNlTW9kZWwucmVzb3VyY2UsIHRhcmdldDogc291cmNlTW9kZWwucmVzb3VyY2UgfSwgb3ZlcndyaXRlOiB0cnVlIH1dKTtcblxuXHRcdHNvdXJjZU1vZGVsLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRDb3VudGVyLCAzKTtcblx0fSk7XG5cblx0dGVzdCgnY29weSAtIG9uZSBzb3VyY2UgPT0gdGFyZ2V0IGFuZCBhbm90aGVyIHNvdXJjZSAhPSB0YXJnZXQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc291cmNlTW9kZWwxOiBUZXh0RmlsZUVkaXRvck1vZGVsID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGV4dEZpbGVFZGl0b3JNb2RlbCwgdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9maWxlMS50eHQnKSwgJ3V0ZjgnLCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IHNvdXJjZU1vZGVsMjogVGV4dEZpbGVFZGl0b3JNb2RlbCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlRWRpdG9yTW9kZWwsIHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvZmlsZTIudHh0JyksICd1dGY4JywgdW5kZWZpbmVkKTtcblx0XHRjb25zdCB0YXJnZXRNb2RlbDI6IFRleHRGaWxlRWRpdG9yTW9kZWwgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0RmlsZUVkaXRvck1vZGVsLCB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2ZpbGVfdGFyZ2V0Mi50eHQnKSwgJ3V0ZjgnLCB1bmRlZmluZWQpO1xuXHRcdCg8SVRlc3RUZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlcj5hY2Nlc3Nvci50ZXh0RmlsZVNlcnZpY2UuZmlsZXMpLmFkZChzb3VyY2VNb2RlbDEucmVzb3VyY2UsIHNvdXJjZU1vZGVsMSk7XG5cdFx0KDxJVGVzdFRleHRGaWxlRWRpdG9yTW9kZWxNYW5hZ2VyPmFjY2Vzc29yLnRleHRGaWxlU2VydmljZS5maWxlcykuYWRkKHNvdXJjZU1vZGVsMi5yZXNvdXJjZSwgc291cmNlTW9kZWwyKTtcblx0XHQoPElUZXN0VGV4dEZpbGVFZGl0b3JNb2RlbE1hbmFnZXI+YWNjZXNzb3IudGV4dEZpbGVTZXJ2aWNlLmZpbGVzKS5hZGQodGFyZ2V0TW9kZWwyLnJlc291cmNlLCB0YXJnZXRNb2RlbDIpO1xuXG5cdFx0Y29uc3QgZXZlbnRDb3VudGVyID0gYXdhaXQgdGVzdEV2ZW50c01vdmVPckNvcHkoW1xuXHRcdFx0eyBmaWxlOiB7IHNvdXJjZTogc291cmNlTW9kZWwxLnJlc291cmNlLCB0YXJnZXQ6IHNvdXJjZU1vZGVsMS5yZXNvdXJjZSB9LCBvdmVyd3JpdGU6IHRydWUgfSxcblx0XHRcdHsgZmlsZTogeyBzb3VyY2U6IHNvdXJjZU1vZGVsMi5yZXNvdXJjZSwgdGFyZ2V0OiB0YXJnZXRNb2RlbDIucmVzb3VyY2UgfSwgb3ZlcndyaXRlOiB0cnVlIH1cblx0XHRdKTtcblxuXHRcdHNvdXJjZU1vZGVsMS5kaXNwb3NlKCk7XG5cdFx0c291cmNlTW9kZWwyLmRpc3Bvc2UoKTtcblx0XHR0YXJnZXRNb2RlbDIuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50ZXIsIDMpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb3B5IG11bHRpcGxlIC0gZGlydHkgZmlsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB0ZXN0TW92ZU9yQ29weShbXG5cdFx0XHR7IHNvdXJjZTogdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9maWxlMS50eHQnKSwgdGFyZ2V0OiB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2ZpbGVfdGFyZ2V0MS50eHQnKSB9LFxuXHRcdFx0eyBzb3VyY2U6IHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvZmlsZTIudHh0JyksIHRhcmdldDogdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9maWxlX3RhcmdldDIudHh0JykgfSxcblx0XHRcdHsgc291cmNlOiB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2ZpbGUzLnR4dCcpLCB0YXJnZXQ6IHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvZmlsZV90YXJnZXQzLnR4dCcpIH1dLFxuXHRcdFx0ZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb3B5IC0gZGlydHkgZmlsZSAodGFyZ2V0IGV4aXN0cyBhbmQgaXMgZGlydHkpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHRlc3RNb3ZlT3JDb3B5KFt7IHNvdXJjZTogdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9maWxlLnR4dCcpLCB0YXJnZXQ6IHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvZmlsZV90YXJnZXQudHh0JykgfV0sIGZhbHNlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0RGlydHknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbW9kZWwxID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGV4dEZpbGVFZGl0b3JNb2RlbCwgdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9maWxlLTEudHh0JyksICd1dGY4JywgdW5kZWZpbmVkKTtcblx0XHQoPElUZXN0VGV4dEZpbGVFZGl0b3JNb2RlbE1hbmFnZXI+YWNjZXNzb3IudGV4dEZpbGVTZXJ2aWNlLmZpbGVzKS5hZGQobW9kZWwxLnJlc291cmNlLCBtb2RlbDEpO1xuXG5cdFx0Y29uc3QgbW9kZWwyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGV4dEZpbGVFZGl0b3JNb2RlbCwgdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9maWxlLTIudHh0JyksICd1dGY4JywgdW5kZWZpbmVkKTtcblx0XHQoPElUZXN0VGV4dEZpbGVFZGl0b3JNb2RlbE1hbmFnZXI+YWNjZXNzb3IudGV4dEZpbGVTZXJ2aWNlLmZpbGVzKS5hZGQobW9kZWwyLnJlc291cmNlLCBtb2RlbDIpO1xuXG5cdFx0bGV0IGRpcnR5ID0gYWNjZXNzb3Iud29ya2luZ0NvcHlGaWxlU2VydmljZS5nZXREaXJ0eShtb2RlbDEucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXJ0eS5sZW5ndGgsIDApO1xuXG5cdFx0YXdhaXQgbW9kZWwxLnJlc29sdmUoKTtcblx0XHRtb2RlbDEudGV4dEVkaXRvck1vZGVsIS5zZXRWYWx1ZSgnZm9vJyk7XG5cblx0XHRkaXJ0eSA9IGFjY2Vzc29yLndvcmtpbmdDb3B5RmlsZVNlcnZpY2UuZ2V0RGlydHkobW9kZWwxLnJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlydHkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlydHlbMF0sIG1vZGVsMSk7XG5cblx0XHRkaXJ0eSA9IGFjY2Vzc29yLndvcmtpbmdDb3B5RmlsZVNlcnZpY2UuZ2V0RGlydHkodG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aCcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlydHkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlydHlbMF0sIG1vZGVsMSk7XG5cblx0XHRhd2FpdCBtb2RlbDIucmVzb2x2ZSgpO1xuXHRcdG1vZGVsMi50ZXh0RWRpdG9yTW9kZWwhLnNldFZhbHVlKCdiYXInKTtcblxuXHRcdGRpcnR5ID0gYWNjZXNzb3Iud29ya2luZ0NvcHlGaWxlU2VydmljZS5nZXREaXJ0eSh0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXJ0eS5sZW5ndGgsIDIpO1xuXG5cdFx0bW9kZWwxLmRpc3Bvc2UoKTtcblx0XHRtb2RlbDIuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWdpc3RlcldvcmtpbmdDb3B5UHJvdmlkZXInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbW9kZWwxOiBUZXh0RmlsZUVkaXRvck1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlRWRpdG9yTW9kZWwsIHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvZmlsZS0xLnR4dCcpLCAndXRmOCcsIHVuZGVmaW5lZCkpO1xuXHRcdCg8SVRlc3RUZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlcj5hY2Nlc3Nvci50ZXh0RmlsZVNlcnZpY2UuZmlsZXMpLmFkZChtb2RlbDEucmVzb3VyY2UsIG1vZGVsMSk7XG5cdFx0YXdhaXQgbW9kZWwxLnJlc29sdmUoKTtcblx0XHRtb2RlbDEudGV4dEVkaXRvck1vZGVsIS5zZXRWYWx1ZSgnZm9vJyk7XG5cblx0XHRjb25zdCB0ZXN0V29ya2luZ0NvcHk6IFRlc3RXb3JraW5nQ29weSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFdvcmtpbmdDb3B5KHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvZmlsZS0yLnR4dCcpLCB0cnVlKSk7XG5cdFx0Y29uc3QgcmVnaXN0cmF0aW9uID0gYWNjZXNzb3Iud29ya2luZ0NvcHlGaWxlU2VydmljZS5yZWdpc3RlcldvcmtpbmdDb3B5UHJvdmlkZXIoKCkgPT4ge1xuXHRcdFx0cmV0dXJuIFttb2RlbDEsIHRlc3RXb3JraW5nQ29weV07XG5cdFx0fSk7XG5cblx0XHRsZXQgZGlydHkgPSBhY2Nlc3Nvci53b3JraW5nQ29weUZpbGVTZXJ2aWNlLmdldERpcnR5KG1vZGVsMS5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpcnR5Lmxlbmd0aCwgMiwgJ1Nob3VsZCByZXR1cm4gZGVmYXVsdCB3b3JraW5nIGNvcHkgKyB3b3JraW5nIGNvcHkgZnJvbSBwcm92aWRlcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXJ0eVswXSwgbW9kZWwxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlydHlbMV0sIHRlc3RXb3JraW5nQ29weSk7XG5cblx0XHRyZWdpc3RyYXRpb24uZGlzcG9zZSgpO1xuXG5cdFx0ZGlydHkgPSBhY2Nlc3Nvci53b3JraW5nQ29weUZpbGVTZXJ2aWNlLmdldERpcnR5KG1vZGVsMS5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpcnR5Lmxlbmd0aCwgMSwgJ1Nob3VsZCBoYXZlIHVucmVnaXN0ZXJlZCBvdXIgcHJvdmlkZXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlydHlbMF0sIG1vZGVsMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUZvbGRlcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRsZXQgZXZlbnRDb3VudGVyID0gMDtcblx0XHRsZXQgY29ycmVsYXRpb25JZDogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2ZvbGRlcicpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjY2Vzc29yLndvcmtpbmdDb3B5RmlsZVNlcnZpY2UuYWRkRmlsZU9wZXJhdGlvblBhcnRpY2lwYW50KHtcblx0XHRcdHBhcnRpY2lwYXRlOiBhc3luYyAoZmlsZXMsIG9wZXJhdGlvbikgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZXMubGVuZ3RoLCAxKTtcblx0XHRcdFx0Y29uc3QgZmlsZSA9IGZpbGVzWzBdO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZS50YXJnZXQudG9TdHJpbmcoKSwgcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcGVyYXRpb24sIEZpbGVPcGVyYXRpb24uQ1JFQVRFKTtcblx0XHRcdFx0ZXZlbnRDb3VudGVyKys7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjY2Vzc29yLndvcmtpbmdDb3B5RmlsZVNlcnZpY2Uub25XaWxsUnVuV29ya2luZ0NvcHlGaWxlT3BlcmF0aW9uKGUgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUuZmlsZXMubGVuZ3RoLCAxKTtcblx0XHRcdGNvbnN0IGZpbGUgPSBlLmZpbGVzWzBdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGUudGFyZ2V0LnRvU3RyaW5nKCksIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUub3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uLkNSRUFURSk7XG5cdFx0XHRjb3JyZWxhdGlvbklkID0gZS5jb3JyZWxhdGlvbklkO1xuXHRcdFx0ZXZlbnRDb3VudGVyKys7XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjY2Vzc29yLndvcmtpbmdDb3B5RmlsZVNlcnZpY2Uub25EaWRSdW5Xb3JraW5nQ29weUZpbGVPcGVyYXRpb24oZSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5maWxlcy5sZW5ndGgsIDEpO1xuXHRcdFx0Y29uc3QgZmlsZSA9IGUuZmlsZXNbMF07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZS50YXJnZXQudG9TdHJpbmcoKSwgcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5vcGVyYXRpb24sIEZpbGVPcGVyYXRpb24uQ1JFQVRFKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLmNvcnJlbGF0aW9uSWQsIGNvcnJlbGF0aW9uSWQpO1xuXHRcdFx0ZXZlbnRDb3VudGVyKys7XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgYWNjZXNzb3Iud29ya2luZ0NvcHlGaWxlU2VydmljZS5jcmVhdGVGb2xkZXIoW3sgcmVzb3VyY2UgfV0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Q291bnRlciwgMyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbmNlbGxhdGlvbiBvZiBwYXJ0aWNpcGFudHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2ZvbGRlcicpO1xuXG5cdFx0bGV0IGNhbmNlbGVkID0gZmFsc2U7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjY2Vzc29yLndvcmtpbmdDb3B5RmlsZVNlcnZpY2UuYWRkRmlsZU9wZXJhdGlvblBhcnRpY2lwYW50KHtcblx0XHRcdHBhcnRpY2lwYXRlOiBhc3luYyAoZmlsZXMsIG9wZXJhdGlvbiwgaW5mbywgdCwgdG9rZW4pID0+IHtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdFx0Y2FuY2VsZWQgPSB0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBDcmVhdGVcblx0XHRsZXQgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0bGV0IHByb21pc2U6IFByb21pc2U8dW5rbm93bj4gPSBhY2Nlc3Nvci53b3JraW5nQ29weUZpbGVTZXJ2aWNlLmNyZWF0ZShbeyByZXNvdXJjZSB9XSwgY3RzLnRva2VuKTtcblx0XHRjdHMuY2FuY2VsKCk7XG5cdFx0YXdhaXQgcHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FuY2VsZWQsIHRydWUpO1xuXHRcdGNhbmNlbGVkID0gZmFsc2U7XG5cblx0XHQvLyBDcmVhdGUgRm9sZGVyXG5cdFx0Y3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0cHJvbWlzZSA9IGFjY2Vzc29yLndvcmtpbmdDb3B5RmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKFt7IHJlc291cmNlIH1dLCBjdHMudG9rZW4pO1xuXHRcdGN0cy5jYW5jZWwoKTtcblx0XHRhd2FpdCBwcm9taXNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYW5jZWxlZCwgdHJ1ZSk7XG5cdFx0Y2FuY2VsZWQgPSBmYWxzZTtcblxuXHRcdC8vIE1vdmVcblx0XHRjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRwcm9taXNlID0gYWNjZXNzb3Iud29ya2luZ0NvcHlGaWxlU2VydmljZS5tb3ZlKFt7IGZpbGU6IHsgc291cmNlOiByZXNvdXJjZSwgdGFyZ2V0OiByZXNvdXJjZSB9IH1dLCBjdHMudG9rZW4pO1xuXHRcdGN0cy5jYW5jZWwoKTtcblx0XHRhd2FpdCBwcm9taXNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYW5jZWxlZCwgdHJ1ZSk7XG5cdFx0Y2FuY2VsZWQgPSBmYWxzZTtcblxuXHRcdC8vIENvcHlcblx0XHRjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRwcm9taXNlID0gYWNjZXNzb3Iud29ya2luZ0NvcHlGaWxlU2VydmljZS5jb3B5KFt7IGZpbGU6IHsgc291cmNlOiByZXNvdXJjZSwgdGFyZ2V0OiByZXNvdXJjZSB9IH1dLCBjdHMudG9rZW4pO1xuXHRcdGN0cy5jYW5jZWwoKTtcblx0XHRhd2FpdCBwcm9taXNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYW5jZWxlZCwgdHJ1ZSk7XG5cdFx0Y2FuY2VsZWQgPSBmYWxzZTtcblxuXHRcdC8vIERlbGV0ZVxuXHRcdGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHByb21pc2UgPSBhY2Nlc3Nvci53b3JraW5nQ29weUZpbGVTZXJ2aWNlLmRlbGV0ZShbeyByZXNvdXJjZSB9XSwgY3RzLnRva2VuKTtcblx0XHRjdHMuY2FuY2VsKCk7XG5cdFx0YXdhaXQgcHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FuY2VsZWQsIHRydWUpO1xuXHRcdGNhbmNlbGVkID0gZmFsc2U7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RFdmVudHNNb3ZlT3JDb3B5KGZpbGVzOiBJQ29weU9wZXJhdGlvbltdLCBtb3ZlPzogYm9vbGVhbik6IFByb21pc2U8bnVtYmVyPiB7XG5cdFx0bGV0IGV2ZW50Q291bnRlciA9IDA7XG5cblx0XHRjb25zdCBwYXJ0aWNpcGFudCA9IGFjY2Vzc29yLndvcmtpbmdDb3B5RmlsZVNlcnZpY2UuYWRkRmlsZU9wZXJhdGlvblBhcnRpY2lwYW50KHtcblx0XHRcdHBhcnRpY2lwYXRlOiBhc3luYyBmaWxlcyA9PiB7XG5cdFx0XHRcdGV2ZW50Q291bnRlcisrO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbGlzdGVuZXIxID0gYWNjZXNzb3Iud29ya2luZ0NvcHlGaWxlU2VydmljZS5vbldpbGxSdW5Xb3JraW5nQ29weUZpbGVPcGVyYXRpb24oZSA9PiB7XG5cdFx0XHRldmVudENvdW50ZXIrKztcblx0XHR9KTtcblxuXHRcdGNvbnN0IGxpc3RlbmVyMiA9IGFjY2Vzc29yLndvcmtpbmdDb3B5RmlsZVNlcnZpY2Uub25EaWRSdW5Xb3JraW5nQ29weUZpbGVPcGVyYXRpb24oZSA9PiB7XG5cdFx0XHRldmVudENvdW50ZXIrKztcblx0XHR9KTtcblxuXHRcdGlmIChtb3ZlKSB7XG5cdFx0XHRhd2FpdCBhY2Nlc3Nvci53b3JraW5nQ29weUZpbGVTZXJ2aWNlLm1vdmUoZmlsZXMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCBhY2Nlc3Nvci53b3JraW5nQ29weUZpbGVTZXJ2aWNlLmNvcHkoZmlsZXMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH1cblxuXHRcdHBhcnRpY2lwYW50LmRpc3Bvc2UoKTtcblx0XHRsaXN0ZW5lcjEuZGlzcG9zZSgpO1xuXHRcdGxpc3RlbmVyMi5kaXNwb3NlKCk7XG5cdFx0cmV0dXJuIGV2ZW50Q291bnRlcjtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RNb3ZlT3JDb3B5KGZpbGVzOiB7IHNvdXJjZTogVVJJOyB0YXJnZXQ6IFVSSSB9W10sIG1vdmU6IGJvb2xlYW4sIHRhcmdldERpcnR5PzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0bGV0IGV2ZW50Q291bnRlciA9IDA7XG5cdFx0Y29uc3QgbW9kZWxzID0gYXdhaXQgUHJvbWlzZS5hbGwoZmlsZXMubWFwKGFzeW5jICh7IHNvdXJjZSwgdGFyZ2V0IH0sIGkpID0+IHtcblx0XHRcdGNvbnN0IHNvdXJjZU1vZGVsOiBUZXh0RmlsZUVkaXRvck1vZGVsID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGV4dEZpbGVFZGl0b3JNb2RlbCwgc291cmNlLCAndXRmOCcsIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCB0YXJnZXRNb2RlbDogVGV4dEZpbGVFZGl0b3JNb2RlbCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlRWRpdG9yTW9kZWwsIHRhcmdldCwgJ3V0ZjgnLCB1bmRlZmluZWQpO1xuXHRcdFx0KDxJVGVzdFRleHRGaWxlRWRpdG9yTW9kZWxNYW5hZ2VyPmFjY2Vzc29yLnRleHRGaWxlU2VydmljZS5maWxlcykuYWRkKHNvdXJjZU1vZGVsLnJlc291cmNlLCBzb3VyY2VNb2RlbCk7XG5cdFx0XHQoPElUZXN0VGV4dEZpbGVFZGl0b3JNb2RlbE1hbmFnZXI+YWNjZXNzb3IudGV4dEZpbGVTZXJ2aWNlLmZpbGVzKS5hZGQodGFyZ2V0TW9kZWwucmVzb3VyY2UsIHRhcmdldE1vZGVsKTtcblxuXHRcdFx0YXdhaXQgc291cmNlTW9kZWwucmVzb2x2ZSgpO1xuXHRcdFx0c291cmNlTW9kZWwudGV4dEVkaXRvck1vZGVsIS5zZXRWYWx1ZSgnZm9vJyArIGkpO1xuXHRcdFx0YXNzZXJ0Lm9rKGFjY2Vzc29yLnRleHRGaWxlU2VydmljZS5pc0RpcnR5KHNvdXJjZU1vZGVsLnJlc291cmNlKSk7XG5cdFx0XHRpZiAodGFyZ2V0RGlydHkpIHtcblx0XHRcdFx0YXdhaXQgdGFyZ2V0TW9kZWwucmVzb2x2ZSgpO1xuXHRcdFx0XHR0YXJnZXRNb2RlbC50ZXh0RWRpdG9yTW9kZWwhLnNldFZhbHVlKCdiYXInICsgaSk7XG5cdFx0XHRcdGFzc2VydC5vayhhY2Nlc3Nvci50ZXh0RmlsZVNlcnZpY2UuaXNEaXJ0eSh0YXJnZXRNb2RlbC5yZXNvdXJjZSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4geyBzb3VyY2VNb2RlbCwgdGFyZ2V0TW9kZWwgfTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBwYXJ0aWNpcGFudCA9IGFjY2Vzc29yLndvcmtpbmdDb3B5RmlsZVNlcnZpY2UuYWRkRmlsZU9wZXJhdGlvblBhcnRpY2lwYW50KHtcblx0XHRcdHBhcnRpY2lwYXRlOiBhc3luYyAoZmlsZXMsIG9wZXJhdGlvbikgPT4ge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGZpbGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgeyB0YXJnZXQsIHNvdXJjZSB9ID0gZmlsZXNbaV07XG5cdFx0XHRcdFx0Y29uc3QgeyB0YXJnZXRNb2RlbCwgc291cmNlTW9kZWwgfSA9IG1vZGVsc1tpXTtcblxuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQudG9TdHJpbmcoKSwgdGFyZ2V0TW9kZWwucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvdXJjZT8udG9TdHJpbmcoKSwgc291cmNlTW9kZWwucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRldmVudENvdW50ZXIrKztcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3BlcmF0aW9uLCBtb3ZlID8gRmlsZU9wZXJhdGlvbi5NT1ZFIDogRmlsZU9wZXJhdGlvbi5DT1BZKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGxldCBjb3JyZWxhdGlvbklkOiBudW1iZXI7XG5cblx0XHRjb25zdCBsaXN0ZW5lcjEgPSBhY2Nlc3Nvci53b3JraW5nQ29weUZpbGVTZXJ2aWNlLm9uV2lsbFJ1bldvcmtpbmdDb3B5RmlsZU9wZXJhdGlvbihlID0+IHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZS5maWxlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCB7IHRhcmdldCwgc291cmNlIH0gPSBmaWxlc1tpXTtcblx0XHRcdFx0Y29uc3QgeyB0YXJnZXRNb2RlbCwgc291cmNlTW9kZWwgfSA9IG1vZGVsc1tpXTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LnRvU3RyaW5nKCksIHRhcmdldE1vZGVsLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc291cmNlPy50b1N0cmluZygpLCBzb3VyY2VNb2RlbC5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdH1cblxuXHRcdFx0ZXZlbnRDb3VudGVyKys7XG5cblx0XHRcdGNvcnJlbGF0aW9uSWQgPSBlLmNvcnJlbGF0aW9uSWQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5vcGVyYXRpb24sIG1vdmUgPyBGaWxlT3BlcmF0aW9uLk1PVkUgOiBGaWxlT3BlcmF0aW9uLkNPUFkpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbGlzdGVuZXIyID0gYWNjZXNzb3Iud29ya2luZ0NvcHlGaWxlU2VydmljZS5vbkRpZFJ1bldvcmtpbmdDb3B5RmlsZU9wZXJhdGlvbihlID0+IHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZS5maWxlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCB7IHRhcmdldCwgc291cmNlIH0gPSBmaWxlc1tpXTtcblx0XHRcdFx0Y29uc3QgeyB0YXJnZXRNb2RlbCwgc291cmNlTW9kZWwgfSA9IG1vZGVsc1tpXTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC50b1N0cmluZygpLCB0YXJnZXRNb2RlbC5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvdXJjZT8udG9TdHJpbmcoKSwgc291cmNlTW9kZWwucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHR9XG5cblx0XHRcdGV2ZW50Q291bnRlcisrO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5vcGVyYXRpb24sIG1vdmUgPyBGaWxlT3BlcmF0aW9uLk1PVkUgOiBGaWxlT3BlcmF0aW9uLkNPUFkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUuY29ycmVsYXRpb25JZCwgY29ycmVsYXRpb25JZCk7XG5cdFx0fSk7XG5cblx0XHRpZiAobW92ZSkge1xuXHRcdFx0YXdhaXQgYWNjZXNzb3Iud29ya2luZ0NvcHlGaWxlU2VydmljZS5tb3ZlKG1vZGVscy5tYXAobW9kZWwgPT4gKHsgZmlsZTogeyBzb3VyY2U6IG1vZGVsLnNvdXJjZU1vZGVsLnJlc291cmNlLCB0YXJnZXQ6IG1vZGVsLnRhcmdldE1vZGVsLnJlc291cmNlIH0sIG9wdGlvbnM6IHsgb3ZlcndyaXRlOiB0cnVlIH0gfSkpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgYWNjZXNzb3Iud29ya2luZ0NvcHlGaWxlU2VydmljZS5jb3B5KG1vZGVscy5tYXAobW9kZWwgPT4gKHsgZmlsZTogeyBzb3VyY2U6IG1vZGVsLnNvdXJjZU1vZGVsLnJlc291cmNlLCB0YXJnZXQ6IG1vZGVsLnRhcmdldE1vZGVsLnJlc291cmNlIH0sIG9wdGlvbnM6IHsgb3ZlcndyaXRlOiB0cnVlIH0gfSkpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG1vZGVscy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgeyBzb3VyY2VNb2RlbCwgdGFyZ2V0TW9kZWwgfSA9IG1vZGVsc1tpXTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldE1vZGVsLnRleHRFZGl0b3JNb2RlbCEuZ2V0VmFsdWUoKSwgJ2ZvbycgKyBpKTtcblxuXHRcdFx0aWYgKG1vdmUpIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKCFhY2Nlc3Nvci50ZXh0RmlsZVNlcnZpY2UuaXNEaXJ0eShzb3VyY2VNb2RlbC5yZXNvdXJjZSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKGFjY2Vzc29yLnRleHRGaWxlU2VydmljZS5pc0RpcnR5KHNvdXJjZU1vZGVsLnJlc291cmNlKSk7XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQub2soYWNjZXNzb3IudGV4dEZpbGVTZXJ2aWNlLmlzRGlydHkodGFyZ2V0TW9kZWwucmVzb3VyY2UpKTtcblxuXHRcdFx0c291cmNlTW9kZWwuZGlzcG9zZSgpO1xuXHRcdFx0dGFyZ2V0TW9kZWwuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRDb3VudGVyLCAzKTtcblxuXHRcdHBhcnRpY2lwYW50LmRpc3Bvc2UoKTtcblx0XHRsaXN0ZW5lcjEuZGlzcG9zZSgpO1xuXHRcdGxpc3RlbmVyMi5kaXNwb3NlKCk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0RGVsZXRlKHJlc291cmNlczogVVJJW10pIHtcblxuXHRcdGNvbnN0IG1vZGVscyA9IGF3YWl0IFByb21pc2UuYWxsKHJlc291cmNlcy5tYXAoYXN5bmMgcmVzb3VyY2UgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0RmlsZUVkaXRvck1vZGVsLCByZXNvdXJjZSwgJ3V0ZjgnLCB1bmRlZmluZWQpO1xuXHRcdFx0KDxJVGVzdFRleHRGaWxlRWRpdG9yTW9kZWxNYW5hZ2VyPmFjY2Vzc29yLnRleHRGaWxlU2VydmljZS5maWxlcykuYWRkKG1vZGVsLnJlc291cmNlLCBtb2RlbCk7XG5cblx0XHRcdGF3YWl0IG1vZGVsLnJlc29sdmUoKTtcblx0XHRcdG1vZGVsLnRleHRFZGl0b3JNb2RlbCEuc2V0VmFsdWUoJ2ZvbycpO1xuXHRcdFx0YXNzZXJ0Lm9rKGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS5pc0RpcnR5KG1vZGVsLnJlc291cmNlKSk7XG5cdFx0XHRyZXR1cm4gbW9kZWw7XG5cdFx0fSkpO1xuXG5cdFx0bGV0IGV2ZW50Q291bnRlciA9IDA7XG5cdFx0bGV0IGNvcnJlbGF0aW9uSWQ6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHBhcnRpY2lwYW50ID0gYWNjZXNzb3Iud29ya2luZ0NvcHlGaWxlU2VydmljZS5hZGRGaWxlT3BlcmF0aW9uUGFydGljaXBhbnQoe1xuXHRcdFx0cGFydGljaXBhdGU6IGFzeW5jIChmaWxlcywgb3BlcmF0aW9uKSA9PiB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbW9kZWxzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWwgPSBtb2RlbHNbaV07XG5cdFx0XHRcdFx0Y29uc3QgZmlsZSA9IGZpbGVzW2ldO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlLnRhcmdldC50b1N0cmluZygpLCBtb2RlbC5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uLkRFTEVURSk7XG5cdFx0XHRcdGV2ZW50Q291bnRlcisrO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbGlzdGVuZXIxID0gYWNjZXNzb3Iud29ya2luZ0NvcHlGaWxlU2VydmljZS5vbldpbGxSdW5Xb3JraW5nQ29weUZpbGVPcGVyYXRpb24oZSA9PiB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG1vZGVscy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IG1vZGVsc1tpXTtcblx0XHRcdFx0Y29uc3QgZmlsZSA9IGUuZmlsZXNbaV07XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlLnRhcmdldC50b1N0cmluZygpLCBtb2RlbC5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdH1cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLm9wZXJhdGlvbiwgRmlsZU9wZXJhdGlvbi5ERUxFVEUpO1xuXHRcdFx0Y29ycmVsYXRpb25JZCA9IGUuY29ycmVsYXRpb25JZDtcblx0XHRcdGV2ZW50Q291bnRlcisrO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbGlzdGVuZXIyID0gYWNjZXNzb3Iud29ya2luZ0NvcHlGaWxlU2VydmljZS5vbkRpZFJ1bldvcmtpbmdDb3B5RmlsZU9wZXJhdGlvbihlID0+IHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbW9kZWxzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gbW9kZWxzW2ldO1xuXHRcdFx0XHRjb25zdCBmaWxlID0gZS5maWxlc1tpXTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGUudGFyZ2V0LnRvU3RyaW5nKCksIG1vZGVsLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0fVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUub3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uLkRFTEVURSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5jb3JyZWxhdGlvbklkLCBjb3JyZWxhdGlvbklkKTtcblx0XHRcdGV2ZW50Q291bnRlcisrO1xuXHRcdH0pO1xuXG5cdFx0YXdhaXQgYWNjZXNzb3Iud29ya2luZ0NvcHlGaWxlU2VydmljZS5kZWxldGUobW9kZWxzLm1hcChtb2RlbCA9PiAoeyByZXNvdXJjZTogbW9kZWwucmVzb3VyY2UgfSkpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRmb3IgKGNvbnN0IG1vZGVsIG9mIG1vZGVscykge1xuXHRcdFx0YXNzZXJ0Lm9rKCFhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2UuaXNEaXJ0eShtb2RlbC5yZXNvdXJjZSkpO1xuXHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50ZXIsIDMpO1xuXG5cdFx0cGFydGljaXBhbnQuZGlzcG9zZSgpO1xuXHRcdGxpc3RlbmVyMS5kaXNwb3NlKCk7XG5cdFx0bGlzdGVuZXIyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RDcmVhdGUocmVzb3VyY2U6IFVSSSwgY29udGVudHM6IFZTQnVmZmVyKSB7XG5cdFx0Y29uc3QgbW9kZWwgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0RmlsZUVkaXRvck1vZGVsLCByZXNvdXJjZSwgJ3V0ZjgnLCB1bmRlZmluZWQpO1xuXHRcdCg8SVRlc3RUZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlcj5hY2Nlc3Nvci50ZXh0RmlsZVNlcnZpY2UuZmlsZXMpLmFkZChtb2RlbC5yZXNvdXJjZSwgbW9kZWwpO1xuXG5cdFx0YXdhaXQgbW9kZWwucmVzb2x2ZSgpO1xuXHRcdG1vZGVsLnRleHRFZGl0b3JNb2RlbCEuc2V0VmFsdWUoJ2ZvbycpO1xuXHRcdGFzc2VydC5vayhhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2UuaXNEaXJ0eShtb2RlbC5yZXNvdXJjZSkpO1xuXG5cdFx0bGV0IGV2ZW50Q291bnRlciA9IDA7XG5cdFx0bGV0IGNvcnJlbGF0aW9uSWQ6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChhY2Nlc3Nvci53b3JraW5nQ29weUZpbGVTZXJ2aWNlLmFkZEZpbGVPcGVyYXRpb25QYXJ0aWNpcGFudCh7XG5cdFx0XHRwYXJ0aWNpcGF0ZTogYXN5bmMgKGZpbGVzLCBvcGVyYXRpb24pID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVzLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGNvbnN0IGZpbGUgPSBmaWxlc1swXTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGUudGFyZ2V0LnRvU3RyaW5nKCksIG1vZGVsLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uLkNSRUFURSk7XG5cdFx0XHRcdGV2ZW50Q291bnRlcisrO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChhY2Nlc3Nvci53b3JraW5nQ29weUZpbGVTZXJ2aWNlLm9uV2lsbFJ1bldvcmtpbmdDb3B5RmlsZU9wZXJhdGlvbihlID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLmZpbGVzLmxlbmd0aCwgMSk7XG5cdFx0XHRjb25zdCBmaWxlID0gZS5maWxlc1swXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlLnRhcmdldC50b1N0cmluZygpLCBtb2RlbC5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLm9wZXJhdGlvbiwgRmlsZU9wZXJhdGlvbi5DUkVBVEUpO1xuXHRcdFx0Y29ycmVsYXRpb25JZCA9IGUuY29ycmVsYXRpb25JZDtcblx0XHRcdGV2ZW50Q291bnRlcisrO1xuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChhY2Nlc3Nvci53b3JraW5nQ29weUZpbGVTZXJ2aWNlLm9uRGlkUnVuV29ya2luZ0NvcHlGaWxlT3BlcmF0aW9uKGUgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUuZmlsZXMubGVuZ3RoLCAxKTtcblx0XHRcdGNvbnN0IGZpbGUgPSBlLmZpbGVzWzBdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGUudGFyZ2V0LnRvU3RyaW5nKCksIG1vZGVsLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUub3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uLkNSRUFURSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5jb3JyZWxhdGlvbklkLCBjb3JyZWxhdGlvbklkKTtcblx0XHRcdGV2ZW50Q291bnRlcisrO1xuXHRcdH0pKTtcblxuXHRcdGF3YWl0IGFjY2Vzc29yLndvcmtpbmdDb3B5RmlsZVNlcnZpY2UuY3JlYXRlKFt7IHJlc291cmNlLCBjb250ZW50cyB9XSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0Lm9rKCFhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2UuaXNEaXJ0eShtb2RlbC5yZXNvdXJjZSkpO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50ZXIsIDMpO1xuXHR9XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLDJCQUEyQjtBQUdwQyxTQUFTLHlDQUF5QyxrQkFBa0I7QUFDcEUsU0FBUywrQkFBK0IsMkJBQTREO0FBRXBHLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyx1QkFBdUI7QUFFaEMsTUFBTSwwQkFBMEIsTUFBTTtBQUVyQyxRQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLE1BQU07QUFDWCwyQkFBdUIsOEJBQThCLFFBQVcsV0FBVztBQUMzRSxlQUFXLHFCQUFxQixlQUFlLG1CQUFtQjtBQUNsRSxnQkFBWSxJQUFnQyxTQUFTLGdCQUFnQixLQUFLO0FBQUEsRUFDM0UsQ0FBQztBQUVELFdBQVMsTUFBTTtBQUNkLGdCQUFZLE1BQU07QUFBQSxFQUNuQixDQUFDO0FBRUQsT0FBSyx1QkFBdUIsaUJBQWtCO0FBQzdDLFVBQU0sV0FBVyxXQUFXLEtBQUssTUFBTSxnQkFBZ0IsR0FBRyxTQUFTLFdBQVcsYUFBYSxDQUFDO0FBQUEsRUFDN0YsQ0FBQztBQUVELE9BQUssdUJBQXVCLGlCQUFrQjtBQUM3QyxVQUFNLFdBQVcsQ0FBQyxXQUFXLEtBQUssTUFBTSxnQkFBZ0IsQ0FBQyxDQUFDO0FBQUEsRUFDM0QsQ0FBQztBQUVELE9BQUssaUNBQWlDLGlCQUFrQjtBQUN2RCxVQUFNLFdBQVc7QUFBQSxNQUNoQixXQUFXLEtBQUssTUFBTSxpQkFBaUI7QUFBQSxNQUN2QyxXQUFXLEtBQUssTUFBTSxpQkFBaUI7QUFBQSxNQUN2QyxXQUFXLEtBQUssTUFBTSxpQkFBaUI7QUFBQSxNQUN2QyxXQUFXLEtBQUssTUFBTSxpQkFBaUI7QUFBQSxJQUFDLENBQUM7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
