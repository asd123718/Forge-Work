import assert from "assert";
import { URI } from "../../../../../base/common/uri.js";
import { workbenchInstantiationService, TestServiceAccessor } from "../../../../test/browser/workbenchTestServices.js";
import { TextFileEditorModel } from "../../common/textFileEditorModel.js";
import { FileChangesEvent, FileChangeType, FileOperationError, FileOperationResult } from "../../../../../platform/files/common/files.js";
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from "../../../../../base/test/common/utils.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../../editor/common/languages/modesRegistry.js";
import { createTextBufferFactory } from "../../../../../editor/common/model/textModel.js";
import { timeout } from "../../../../../base/common/async.js";
import { DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
suite("Files - TextFileEditorModelManager", () => {
  const disposables = new DisposableStore();
  let instantiationService;
  let accessor;
  setup(() => {
    instantiationService = workbenchInstantiationService(void 0, disposables);
    accessor = instantiationService.createInstance(TestServiceAccessor);
    disposables.add(toDisposable(() => accessor.textFileService.files));
  });
  teardown(() => {
    disposables.clear();
  });
  test("add, remove, clear, get, getAll", function() {
    const manager = accessor.textFileService.files;
    const model1 = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/random1.txt"), "utf8", void 0));
    const model2 = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/random2.txt"), "utf8", void 0));
    const model3 = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/random3.txt"), "utf8", void 0));
    manager.add(URI.file("/test.html"), model1);
    manager.add(URI.file("/some/other.html"), model2);
    manager.add(URI.file("/some/this.txt"), model3);
    const fileUpper = URI.file("/TEST.html");
    assert(!manager.get(URI.file("foo")));
    assert.strictEqual(manager.get(URI.file("/test.html")), model1);
    assert.ok(!manager.get(fileUpper));
    let results = manager.models;
    assert.strictEqual(3, results.length);
    let result = manager.get(URI.file("/yes"));
    assert.ok(!result);
    result = manager.get(URI.file("/some/other.txt"));
    assert.ok(!result);
    result = manager.get(URI.file("/some/other.html"));
    assert.ok(result);
    result = manager.get(fileUpper);
    assert.ok(!result);
    manager.remove(URI.file(""));
    results = manager.models;
    assert.strictEqual(3, results.length);
    manager.remove(URI.file("/some/other.html"));
    results = manager.models;
    assert.strictEqual(2, results.length);
    manager.remove(fileUpper);
    results = manager.models;
    assert.strictEqual(2, results.length);
    manager.dispose();
    results = manager.models;
    assert.strictEqual(0, results.length);
  });
  test("resolve", async () => {
    const manager = accessor.textFileService.files;
    const resource = URI.file("/test.html");
    const encoding = "utf8";
    const events = [];
    disposables.add(manager.onDidCreate((model) => {
      events.push(model);
    }));
    const modelPromise = manager.resolve(resource, { encoding });
    assert.ok(manager.get(resource));
    const model1 = await modelPromise;
    assert.ok(model1);
    assert.strictEqual(model1.getEncoding(), encoding);
    assert.strictEqual(manager.get(resource), model1);
    const model2 = await manager.resolve(resource, { encoding });
    assert.strictEqual(model2, model1);
    model1.dispose();
    const model3 = await manager.resolve(resource, { encoding });
    assert.notStrictEqual(model3, model2);
    assert.strictEqual(manager.get(resource), model3);
    model3.dispose();
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].resource.toString(), model1.resource.toString());
    assert.strictEqual(events[1].resource.toString(), model2.resource.toString());
  });
  test("resolve (async)", async () => {
    const manager = accessor.textFileService.files;
    const resource = URI.file("/path/index.txt");
    disposables.add(await manager.resolve(resource));
    let didResolve = false;
    const onDidResolve = new Promise((resolve) => {
      disposables.add(manager.onDidResolve(({ model }) => {
        if (model.resource.toString() === resource.toString()) {
          didResolve = true;
          resolve();
        }
      }));
    });
    manager.resolve(resource, { reload: { async: true } });
    await onDidResolve;
    assert.strictEqual(didResolve, true);
  });
  test("resolve (sync)", async () => {
    const manager = accessor.textFileService.files;
    const resource = URI.file("/path/index.txt");
    disposables.add(await manager.resolve(resource));
    let didResolve = false;
    disposables.add(manager.onDidResolve(({ model }) => {
      if (model.resource.toString() === resource.toString()) {
        didResolve = true;
      }
    }));
    await manager.resolve(resource, { reload: { async: false } });
    assert.strictEqual(didResolve, true);
  });
  test("resolve (sync) - model disposed when error and first call to resolve", async () => {
    const manager = accessor.textFileService.files;
    const resource = URI.file("/path/index.txt");
    accessor.textFileService.setReadStreamErrorOnce(new FileOperationError("fail", FileOperationResult.FILE_OTHER_ERROR));
    let error = void 0;
    try {
      disposables.add(await manager.resolve(resource));
    } catch (e) {
      error = e;
    }
    assert.ok(error);
    assert.strictEqual(manager.models.length, 0);
  });
  test("resolve (sync) - model not disposed when error and model existed before", async () => {
    const manager = accessor.textFileService.files;
    const resource = URI.file("/path/index.txt");
    disposables.add(await manager.resolve(resource));
    accessor.textFileService.setReadStreamErrorOnce(new FileOperationError("fail", FileOperationResult.FILE_OTHER_ERROR));
    let error = void 0;
    try {
      disposables.add(await manager.resolve(resource, { reload: { async: false } }));
    } catch (e) {
      error = e;
    }
    assert.ok(error);
    assert.strictEqual(manager.models.length, 1);
  });
  test("resolve with initial contents", async () => {
    const manager = accessor.textFileService.files;
    const resource = URI.file("/test.html");
    const model = disposables.add(await manager.resolve(resource, { contents: createTextBufferFactory("Hello World") }));
    assert.strictEqual(model.textEditorModel?.getValue(), "Hello World");
    assert.strictEqual(model.isDirty(), true);
    disposables.add(await manager.resolve(resource, { contents: createTextBufferFactory("More Changes") }));
    assert.strictEqual(model.textEditorModel?.getValue(), "More Changes");
    assert.strictEqual(model.isDirty(), true);
  });
  test("multiple resolves execute in sequence", async () => {
    const manager = accessor.textFileService.files;
    const resource = URI.file("/test.html");
    let resolvedModel;
    const contents = [];
    disposables.add(manager.onDidResolve((e) => {
      if (e.model.resource.toString() === resource.toString()) {
        resolvedModel = disposables.add(e.model);
        contents.push(e.model.textEditorModel.getValue());
      }
    }));
    await Promise.all([
      manager.resolve(resource),
      manager.resolve(resource, { contents: createTextBufferFactory("Hello World") }),
      manager.resolve(resource, { reload: { async: false } }),
      manager.resolve(resource, { contents: createTextBufferFactory("More Changes") })
    ]);
    assert.ok(resolvedModel instanceof TextFileEditorModel);
    assert.strictEqual(resolvedModel.textEditorModel?.getValue(), "More Changes");
    assert.strictEqual(resolvedModel.isDirty(), true);
    assert.strictEqual(contents[0], "Hello Html");
    assert.strictEqual(contents[1], "Hello World");
    assert.strictEqual(contents[2], "More Changes");
  });
  test("removed from cache when model disposed", function() {
    const manager = accessor.textFileService.files;
    const model1 = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/random1.txt"), "utf8", void 0));
    const model2 = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/random2.txt"), "utf8", void 0));
    const model3 = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, "/path/random3.txt"), "utf8", void 0));
    manager.add(URI.file("/test.html"), model1);
    manager.add(URI.file("/some/other.html"), model2);
    manager.add(URI.file("/some/this.txt"), model3);
    assert.strictEqual(manager.get(URI.file("/test.html")), model1);
    model1.dispose();
    assert(!manager.get(URI.file("/test.html")));
  });
  test("events", async function() {
    const manager = accessor.textFileService.files;
    const resource1 = toResource.call(this, "/path/index.txt");
    const resource2 = toResource.call(this, "/path/other.txt");
    let resolvedCounter = 0;
    let removedCounter = 0;
    let gotDirtyCounter = 0;
    let gotNonDirtyCounter = 0;
    let revertedCounter = 0;
    let savedCounter = 0;
    let encodingCounter = 0;
    disposables.add(manager.onDidResolve(({ model }) => {
      if (model.resource.toString() === resource1.toString()) {
        resolvedCounter++;
      }
    }));
    disposables.add(manager.onDidRemove((resource) => {
      if (resource.toString() === resource1.toString() || resource.toString() === resource2.toString()) {
        removedCounter++;
      }
    }));
    disposables.add(manager.onDidChangeDirty((model) => {
      if (model.resource.toString() === resource1.toString()) {
        if (model.isDirty()) {
          gotDirtyCounter++;
        } else {
          gotNonDirtyCounter++;
        }
      }
    }));
    disposables.add(manager.onDidRevert((model) => {
      if (model.resource.toString() === resource1.toString()) {
        revertedCounter++;
      }
    }));
    disposables.add(manager.onDidSave(({ model }) => {
      if (model.resource.toString() === resource1.toString()) {
        savedCounter++;
      }
    }));
    disposables.add(manager.onDidChangeEncoding((model) => {
      if (model.resource.toString() === resource1.toString()) {
        encodingCounter++;
      }
    }));
    const model1 = await manager.resolve(resource1, { encoding: "utf8" });
    assert.strictEqual(resolvedCounter, 1);
    accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource: resource1, type: FileChangeType.DELETED }], false));
    accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource: resource1, type: FileChangeType.ADDED }], false));
    const model2 = await manager.resolve(resource2, { encoding: "utf8" });
    assert.strictEqual(resolvedCounter, 2);
    model1.updateTextEditorModel(createTextBufferFactory("changed"));
    model1.updatePreferredEncoding("utf16");
    await model1.revert();
    model1.updateTextEditorModel(createTextBufferFactory("changed again"));
    await model1.save();
    model1.dispose();
    model2.dispose();
    await model1.revert();
    assert.strictEqual(removedCounter, 2);
    assert.strictEqual(gotDirtyCounter, 2);
    assert.strictEqual(gotNonDirtyCounter, 2);
    assert.strictEqual(revertedCounter, 1);
    assert.strictEqual(savedCounter, 1);
    assert.strictEqual(encodingCounter, 2);
    model1.dispose();
    model2.dispose();
    assert.ok(!accessor.modelService.getModel(resource1));
    assert.ok(!accessor.modelService.getModel(resource2));
  });
  test("disposing model takes it out of the manager", async function() {
    const manager = accessor.textFileService.files;
    const resource = toResource.call(this, "/path/index_something.txt");
    const model = await manager.resolve(resource, { encoding: "utf8" });
    model.dispose();
    assert.ok(!manager.get(resource));
    assert.ok(!accessor.modelService.getModel(model.resource));
  });
  test("canDispose with dirty model", async function() {
    const manager = accessor.textFileService.files;
    const resource = toResource.call(this, "/path/index_something.txt");
    const model = disposables.add(await manager.resolve(resource, { encoding: "utf8" }));
    model.updateTextEditorModel(createTextBufferFactory("make dirty"));
    const canDisposePromise = manager.canDispose(model);
    assert.ok(canDisposePromise instanceof Promise);
    let canDispose = false;
    (async () => {
      canDispose = await canDisposePromise;
    })();
    assert.strictEqual(canDispose, false);
    model.revert({ soft: true });
    await timeout(0);
    assert.strictEqual(canDispose, true);
    const canDispose2 = manager.canDispose(model);
    assert.strictEqual(canDispose2, true);
  });
  test("language", async function() {
    const languageId = "text-file-model-manager-test";
    disposables.add(accessor.languageService.registerLanguage({
      id: languageId
    }));
    const manager = accessor.textFileService.files;
    const resource = toResource.call(this, "/path/index_something.txt");
    let model = disposables.add(await manager.resolve(resource, { languageId }));
    assert.strictEqual(model.textEditorModel.getLanguageId(), languageId);
    model = await manager.resolve(resource, { languageId: "text" });
    assert.strictEqual(model.textEditorModel.getLanguageId(), PLAINTEXT_LANGUAGE_ID);
  });
  test("file change events trigger reload (on a resolved model)", async () => {
    const manager = accessor.textFileService.files;
    const resource = URI.file("/path/index.txt");
    disposables.add(await manager.resolve(resource));
    let didResolve = false;
    const onDidResolve = new Promise((resolve) => {
      disposables.add(manager.onDidResolve(({ model }) => {
        if (model.resource.toString() === resource.toString()) {
          didResolve = true;
          resolve();
        }
      }));
    });
    accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: FileChangeType.UPDATED }], false));
    await onDidResolve;
    assert.strictEqual(didResolve, true);
  });
  test("file change events trigger reload (after a model is resolved: https://github.com/microsoft/vscode/issues/132765)", async () => {
    const manager = accessor.textFileService.files;
    const resource = URI.file("/path/index.txt");
    manager.resolve(resource);
    let didResolve = false;
    let resolvedCounter = 0;
    const onDidResolve = new Promise((resolve) => {
      disposables.add(manager.onDidResolve(({ model }) => {
        disposables.add(model);
        if (model.resource.toString() === resource.toString()) {
          resolvedCounter++;
          if (resolvedCounter === 2) {
            didResolve = true;
            resolve();
          }
        }
      }));
    });
    accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: FileChangeType.UPDATED }], false));
    await onDidResolve;
    assert.strictEqual(didResolve, true);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0ZXh0ZmlsZVxcdGVzdFxcYnJvd3NlclxcdGV4dEZpbGVFZGl0b3JNb2RlbE1hbmFnZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlLCBUZXN0U2VydmljZUFjY2Vzc29yLCBJVGVzdFRleHRGaWxlRWRpdG9yTW9kZWxNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBUZXh0RmlsZUVkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL3RleHRGaWxlRWRpdG9yTW9kZWwuanMnO1xuaW1wb3J0IHsgRmlsZUNoYW5nZXNFdmVudCwgRmlsZUNoYW5nZVR5cGUsIEZpbGVPcGVyYXRpb25FcnJvciwgRmlsZU9wZXJhdGlvblJlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUsIHRvUmVzb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL21vZGVzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlRWRpdG9yTW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuc3VpdGUoJ0ZpbGVzIC0gVGV4dEZpbGVFZGl0b3JNb2RlbE1hbmFnZXInLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgYWNjZXNzb3I6IFRlc3RTZXJ2aWNlQWNjZXNzb3I7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBkaXNwb3NhYmxlcyk7XG5cdFx0YWNjZXNzb3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0U2VydmljZUFjY2Vzc29yKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGFjY2Vzc29yLnRleHRGaWxlU2VydmljZS5maWxlcyBhcyBJVGVzdFRleHRGaWxlRWRpdG9yTW9kZWxNYW5hZ2VyKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGQsIHJlbW92ZSwgY2xlYXIsIGdldCwgZ2V0QWxsJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBhY2Nlc3Nvci50ZXh0RmlsZVNlcnZpY2UuZmlsZXMgYXMgSVRlc3RUZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlcjtcblxuXHRcdGNvbnN0IG1vZGVsMTogVGV4dEZpbGVFZGl0b3JNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0RmlsZUVkaXRvck1vZGVsLCB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL3JhbmRvbTEudHh0JyksICd1dGY4JywgdW5kZWZpbmVkKSk7XG5cdFx0Y29uc3QgbW9kZWwyOiBUZXh0RmlsZUVkaXRvck1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlRWRpdG9yTW9kZWwsIHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvcmFuZG9tMi50eHQnKSwgJ3V0ZjgnLCB1bmRlZmluZWQpKTtcblx0XHRjb25zdCBtb2RlbDM6IFRleHRGaWxlRWRpdG9yTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGV4dEZpbGVFZGl0b3JNb2RlbCwgdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9yYW5kb20zLnR4dCcpLCAndXRmOCcsIHVuZGVmaW5lZCkpO1xuXG5cdFx0bWFuYWdlci5hZGQoVVJJLmZpbGUoJy90ZXN0Lmh0bWwnKSwgbW9kZWwxKTtcblx0XHRtYW5hZ2VyLmFkZChVUkkuZmlsZSgnL3NvbWUvb3RoZXIuaHRtbCcpLCBtb2RlbDIpO1xuXHRcdG1hbmFnZXIuYWRkKFVSSS5maWxlKCcvc29tZS90aGlzLnR4dCcpLCBtb2RlbDMpO1xuXG5cdFx0Y29uc3QgZmlsZVVwcGVyID0gVVJJLmZpbGUoJy9URVNULmh0bWwnKTtcblxuXHRcdGFzc2VydCghbWFuYWdlci5nZXQoVVJJLmZpbGUoJ2ZvbycpKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0KFVSSS5maWxlKCcvdGVzdC5odG1sJykpLCBtb2RlbDEpO1xuXG5cdFx0YXNzZXJ0Lm9rKCFtYW5hZ2VyLmdldChmaWxlVXBwZXIpKTtcblxuXHRcdGxldCByZXN1bHRzID0gbWFuYWdlci5tb2RlbHM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDMsIHJlc3VsdHMubGVuZ3RoKTtcblxuXHRcdGxldCByZXN1bHQgPSBtYW5hZ2VyLmdldChVUkkuZmlsZSgnL3llcycpKTtcblx0XHRhc3NlcnQub2soIXJlc3VsdCk7XG5cblx0XHRyZXN1bHQgPSBtYW5hZ2VyLmdldChVUkkuZmlsZSgnL3NvbWUvb3RoZXIudHh0JykpO1xuXHRcdGFzc2VydC5vayghcmVzdWx0KTtcblxuXHRcdHJlc3VsdCA9IG1hbmFnZXIuZ2V0KFVSSS5maWxlKCcvc29tZS9vdGhlci5odG1sJykpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXG5cdFx0cmVzdWx0ID0gbWFuYWdlci5nZXQoZmlsZVVwcGVyKTtcblx0XHRhc3NlcnQub2soIXJlc3VsdCk7XG5cblx0XHRtYW5hZ2VyLnJlbW92ZShVUkkuZmlsZSgnJykpO1xuXG5cdFx0cmVzdWx0cyA9IG1hbmFnZXIubW9kZWxzO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgzLCByZXN1bHRzLmxlbmd0aCk7XG5cblx0XHRtYW5hZ2VyLnJlbW92ZShVUkkuZmlsZSgnL3NvbWUvb3RoZXIuaHRtbCcpKTtcblx0XHRyZXN1bHRzID0gbWFuYWdlci5tb2RlbHM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDIsIHJlc3VsdHMubGVuZ3RoKTtcblxuXHRcdG1hbmFnZXIucmVtb3ZlKGZpbGVVcHBlcik7XG5cdFx0cmVzdWx0cyA9IG1hbmFnZXIubW9kZWxzO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgyLCByZXN1bHRzLmxlbmd0aCk7XG5cblx0XHRtYW5hZ2VyLmRpc3Bvc2UoKTtcblx0XHRyZXN1bHRzID0gbWFuYWdlci5tb2RlbHM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDAsIHJlc3VsdHMubGVuZ3RoKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gYWNjZXNzb3IudGV4dEZpbGVTZXJ2aWNlLmZpbGVzIGFzIElUZXN0VGV4dEZpbGVFZGl0b3JNb2RlbE1hbmFnZXI7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3Rlc3QuaHRtbCcpO1xuXHRcdGNvbnN0IGVuY29kaW5nID0gJ3V0ZjgnO1xuXG5cdFx0Y29uc3QgZXZlbnRzOiBJVGV4dEZpbGVFZGl0b3JNb2RlbFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRDcmVhdGUobW9kZWwgPT4ge1xuXHRcdFx0ZXZlbnRzLnB1c2gobW9kZWwpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG1vZGVsUHJvbWlzZSA9IG1hbmFnZXIucmVzb2x2ZShyZXNvdXJjZSwgeyBlbmNvZGluZyB9KTtcblx0XHRhc3NlcnQub2sobWFuYWdlci5nZXQocmVzb3VyY2UpKTsgLy8gbW9kZWwga25vd24gZXZlbiBiZWZvcmUgcmVzb2x2ZWQoKVxuXG5cdFx0Y29uc3QgbW9kZWwxID0gYXdhaXQgbW9kZWxQcm9taXNlO1xuXHRcdGFzc2VydC5vayhtb2RlbDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbDEuZ2V0RW5jb2RpbmcoKSwgZW5jb2RpbmcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldChyZXNvdXJjZSksIG1vZGVsMSk7XG5cblx0XHRjb25zdCBtb2RlbDIgPSBhd2FpdCBtYW5hZ2VyLnJlc29sdmUocmVzb3VyY2UsIHsgZW5jb2RpbmcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsMiwgbW9kZWwxKTtcblx0XHRtb2RlbDEuZGlzcG9zZSgpO1xuXG5cdFx0Y29uc3QgbW9kZWwzID0gYXdhaXQgbWFuYWdlci5yZXNvbHZlKHJlc291cmNlLCB7IGVuY29kaW5nIH0pO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChtb2RlbDMsIG1vZGVsMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0KHJlc291cmNlKSwgbW9kZWwzKTtcblx0XHRtb2RlbDMuZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHNbMF0ucmVzb3VyY2UudG9TdHJpbmcoKSwgbW9kZWwxLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHNbMV0ucmVzb3VyY2UudG9TdHJpbmcoKSwgbW9kZWwyLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlIChhc3luYyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IGFjY2Vzc29yLnRleHRGaWxlU2VydmljZS5maWxlcyBhcyBJVGVzdFRleHRGaWxlRWRpdG9yTW9kZWxNYW5hZ2VyO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy9wYXRoL2luZGV4LnR4dCcpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGF3YWl0IG1hbmFnZXIucmVzb2x2ZShyZXNvdXJjZSkpO1xuXG5cdFx0bGV0IGRpZFJlc29sdmUgPSBmYWxzZTtcblx0XHRjb25zdCBvbkRpZFJlc29sdmUgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkUmVzb2x2ZSgoeyBtb2RlbCB9KSA9PiB7XG5cdFx0XHRcdGlmIChtb2RlbC5yZXNvdXJjZS50b1N0cmluZygpID09PSByZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHRcdFx0ZGlkUmVzb2x2ZSA9IHRydWU7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cblx0XHRtYW5hZ2VyLnJlc29sdmUocmVzb3VyY2UsIHsgcmVsb2FkOiB7IGFzeW5jOiB0cnVlIH0gfSk7XG5cblx0XHRhd2FpdCBvbkRpZFJlc29sdmU7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlkUmVzb2x2ZSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmUgKHN5bmMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBhY2Nlc3Nvci50ZXh0RmlsZVNlcnZpY2UuZmlsZXMgYXMgSVRlc3RUZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlcjtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvcGF0aC9pbmRleC50eHQnKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChhd2FpdCBtYW5hZ2VyLnJlc29sdmUocmVzb3VyY2UpKTtcblxuXHRcdGxldCBkaWRSZXNvbHZlID0gZmFsc2U7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRSZXNvbHZlKCh7IG1vZGVsIH0pID0+IHtcblx0XHRcdGlmIChtb2RlbC5yZXNvdXJjZS50b1N0cmluZygpID09PSByZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHRcdGRpZFJlc29sdmUgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IG1hbmFnZXIucmVzb2x2ZShyZXNvdXJjZSwgeyByZWxvYWQ6IHsgYXN5bmM6IGZhbHNlIH0gfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZFJlc29sdmUsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlIChzeW5jKSAtIG1vZGVsIGRpc3Bvc2VkIHdoZW4gZXJyb3IgYW5kIGZpcnN0IGNhbGwgdG8gcmVzb2x2ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gYWNjZXNzb3IudGV4dEZpbGVTZXJ2aWNlLmZpbGVzIGFzIElUZXN0VGV4dEZpbGVFZGl0b3JNb2RlbE1hbmFnZXI7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3BhdGgvaW5kZXgudHh0Jyk7XG5cblx0XHRhY2Nlc3Nvci50ZXh0RmlsZVNlcnZpY2Uuc2V0UmVhZFN0cmVhbUVycm9yT25jZShuZXcgRmlsZU9wZXJhdGlvbkVycm9yKCdmYWlsJywgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX09USEVSX0VSUk9SKSk7XG5cblx0XHRsZXQgZXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoYXdhaXQgbWFuYWdlci5yZXNvbHZlKHJlc291cmNlKSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0ZXJyb3IgPSBlO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhlcnJvcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIubW9kZWxzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmUgKHN5bmMpIC0gbW9kZWwgbm90IGRpc3Bvc2VkIHdoZW4gZXJyb3IgYW5kIG1vZGVsIGV4aXN0ZWQgYmVmb3JlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBhY2Nlc3Nvci50ZXh0RmlsZVNlcnZpY2UuZmlsZXMgYXMgSVRlc3RUZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlcjtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvcGF0aC9pbmRleC50eHQnKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChhd2FpdCBtYW5hZ2VyLnJlc29sdmUocmVzb3VyY2UpKTtcblxuXHRcdGFjY2Vzc29yLnRleHRGaWxlU2VydmljZS5zZXRSZWFkU3RyZWFtRXJyb3JPbmNlKG5ldyBGaWxlT3BlcmF0aW9uRXJyb3IoJ2ZhaWwnLCBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfT1RIRVJfRVJST1IpKTtcblxuXHRcdGxldCBlcnJvcjogRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChhd2FpdCBtYW5hZ2VyLnJlc29sdmUocmVzb3VyY2UsIHsgcmVsb2FkOiB7IGFzeW5jOiBmYWxzZSB9IH0pKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRlcnJvciA9IGU7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGVycm9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5tb2RlbHMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZSB3aXRoIGluaXRpYWwgY29udGVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IGFjY2Vzc29yLnRleHRGaWxlU2VydmljZS5maWxlcyBhcyBJVGVzdFRleHRGaWxlRWRpdG9yTW9kZWxNYW5hZ2VyO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy90ZXN0Lmh0bWwnKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IG1hbmFnZXIucmVzb2x2ZShyZXNvdXJjZSwgeyBjb250ZW50czogY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnkoJ0hlbGxvIFdvcmxkJykgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC50ZXh0RWRpdG9yTW9kZWw/LmdldFZhbHVlKCksICdIZWxsbyBXb3JsZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5pc0RpcnR5KCksIHRydWUpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGF3YWl0IG1hbmFnZXIucmVzb2x2ZShyZXNvdXJjZSwgeyBjb250ZW50czogY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnkoJ01vcmUgQ2hhbmdlcycpIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwudGV4dEVkaXRvck1vZGVsPy5nZXRWYWx1ZSgpLCAnTW9yZSBDaGFuZ2VzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmlzRGlydHkoKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpcGxlIHJlc29sdmVzIGV4ZWN1dGUgaW4gc2VxdWVuY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IGFjY2Vzc29yLnRleHRGaWxlU2VydmljZS5maWxlcyBhcyBJVGVzdFRleHRGaWxlRWRpdG9yTW9kZWxNYW5hZ2VyO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy90ZXN0Lmh0bWwnKTtcblxuXHRcdGxldCByZXNvbHZlZE1vZGVsOiB1bmtub3duO1xuXG5cdFx0Y29uc3QgY29udGVudHM6IHN0cmluZ1tdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRSZXNvbHZlKGUgPT4ge1xuXHRcdFx0aWYgKGUubW9kZWwucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRyZXNvbHZlZE1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGUubW9kZWwgYXMgVGV4dEZpbGVFZGl0b3JNb2RlbCk7XG5cdFx0XHRcdGNvbnRlbnRzLnB1c2goZS5tb2RlbC50ZXh0RWRpdG9yTW9kZWwhLmdldFZhbHVlKCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdG1hbmFnZXIucmVzb2x2ZShyZXNvdXJjZSksXG5cdFx0XHRtYW5hZ2VyLnJlc29sdmUocmVzb3VyY2UsIHsgY29udGVudHM6IGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5KCdIZWxsbyBXb3JsZCcpIH0pLFxuXHRcdFx0bWFuYWdlci5yZXNvbHZlKHJlc291cmNlLCB7IHJlbG9hZDogeyBhc3luYzogZmFsc2UgfSB9KSxcblx0XHRcdG1hbmFnZXIucmVzb2x2ZShyZXNvdXJjZSwgeyBjb250ZW50czogY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnkoJ01vcmUgQ2hhbmdlcycpIH0pXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQub2socmVzb2x2ZWRNb2RlbCBpbnN0YW5jZW9mIFRleHRGaWxlRWRpdG9yTW9kZWwpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkTW9kZWwudGV4dEVkaXRvck1vZGVsPy5nZXRWYWx1ZSgpLCAnTW9yZSBDaGFuZ2VzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkTW9kZWwuaXNEaXJ0eSgpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50c1swXSwgJ0hlbGxvIEh0bWwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudHNbMV0sICdIZWxsbyBXb3JsZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50c1syXSwgJ01vcmUgQ2hhbmdlcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVkIGZyb20gY2FjaGUgd2hlbiBtb2RlbCBkaXNwb3NlZCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtYW5hZ2VyID0gYWNjZXNzb3IudGV4dEZpbGVTZXJ2aWNlLmZpbGVzIGFzIElUZXN0VGV4dEZpbGVFZGl0b3JNb2RlbE1hbmFnZXI7XG5cblx0XHRjb25zdCBtb2RlbDE6IFRleHRGaWxlRWRpdG9yTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGV4dEZpbGVFZGl0b3JNb2RlbCwgdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9yYW5kb20xLnR4dCcpLCAndXRmOCcsIHVuZGVmaW5lZCkpO1xuXHRcdGNvbnN0IG1vZGVsMjogVGV4dEZpbGVFZGl0b3JNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0RmlsZUVkaXRvck1vZGVsLCB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL3JhbmRvbTIudHh0JyksICd1dGY4JywgdW5kZWZpbmVkKSk7XG5cdFx0Y29uc3QgbW9kZWwzOiBUZXh0RmlsZUVkaXRvck1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlRWRpdG9yTW9kZWwsIHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvcmFuZG9tMy50eHQnKSwgJ3V0ZjgnLCB1bmRlZmluZWQpKTtcblxuXHRcdG1hbmFnZXIuYWRkKFVSSS5maWxlKCcvdGVzdC5odG1sJyksIG1vZGVsMSk7XG5cdFx0bWFuYWdlci5hZGQoVVJJLmZpbGUoJy9zb21lL290aGVyLmh0bWwnKSwgbW9kZWwyKTtcblx0XHRtYW5hZ2VyLmFkZChVUkkuZmlsZSgnL3NvbWUvdGhpcy50eHQnKSwgbW9kZWwzKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldChVUkkuZmlsZSgnL3Rlc3QuaHRtbCcpKSwgbW9kZWwxKTtcblxuXHRcdG1vZGVsMS5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0KCFtYW5hZ2VyLmdldChVUkkuZmlsZSgnL3Rlc3QuaHRtbCcpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V2ZW50cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtYW5hZ2VyID0gYWNjZXNzb3IudGV4dEZpbGVTZXJ2aWNlLmZpbGVzIGFzIElUZXN0VGV4dEZpbGVFZGl0b3JNb2RlbE1hbmFnZXI7XG5cblx0XHRjb25zdCByZXNvdXJjZTEgPSB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2luZGV4LnR4dCcpO1xuXHRcdGNvbnN0IHJlc291cmNlMiA9IHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvb3RoZXIudHh0Jyk7XG5cblx0XHRsZXQgcmVzb2x2ZWRDb3VudGVyID0gMDtcblx0XHRsZXQgcmVtb3ZlZENvdW50ZXIgPSAwO1xuXHRcdGxldCBnb3REaXJ0eUNvdW50ZXIgPSAwO1xuXHRcdGxldCBnb3ROb25EaXJ0eUNvdW50ZXIgPSAwO1xuXHRcdGxldCByZXZlcnRlZENvdW50ZXIgPSAwO1xuXHRcdGxldCBzYXZlZENvdW50ZXIgPSAwO1xuXHRcdGxldCBlbmNvZGluZ0NvdW50ZXIgPSAwO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRSZXNvbHZlKCh7IG1vZGVsIH0pID0+IHtcblx0XHRcdGlmIChtb2RlbC5yZXNvdXJjZS50b1N0cmluZygpID09PSByZXNvdXJjZTEudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRyZXNvbHZlZENvdW50ZXIrKztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZFJlbW92ZShyZXNvdXJjZSA9PiB7XG5cdFx0XHRpZiAocmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2UxLnRvU3RyaW5nKCkgfHwgcmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2UyLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0cmVtb3ZlZENvdW50ZXIrKztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZENoYW5nZURpcnR5KG1vZGVsID0+IHtcblx0XHRcdGlmIChtb2RlbC5yZXNvdXJjZS50b1N0cmluZygpID09PSByZXNvdXJjZTEudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRpZiAobW9kZWwuaXNEaXJ0eSgpKSB7XG5cdFx0XHRcdFx0Z290RGlydHlDb3VudGVyKys7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Z290Tm9uRGlydHlDb3VudGVyKys7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZFJldmVydChtb2RlbCA9PiB7XG5cdFx0XHRpZiAobW9kZWwucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2UxLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0cmV2ZXJ0ZWRDb3VudGVyKys7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRTYXZlKCh7IG1vZGVsIH0pID0+IHtcblx0XHRcdGlmIChtb2RlbC5yZXNvdXJjZS50b1N0cmluZygpID09PSByZXNvdXJjZTEudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRzYXZlZENvdW50ZXIrKztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZENoYW5nZUVuY29kaW5nKG1vZGVsID0+IHtcblx0XHRcdGlmIChtb2RlbC5yZXNvdXJjZS50b1N0cmluZygpID09PSByZXNvdXJjZTEudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRlbmNvZGluZ0NvdW50ZXIrKztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBtb2RlbDEgPSBhd2FpdCBtYW5hZ2VyLnJlc29sdmUocmVzb3VyY2UxLCB7IGVuY29kaW5nOiAndXRmOCcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkQ291bnRlciwgMSk7XG5cblx0XHRhY2Nlc3Nvci5maWxlU2VydmljZS5maXJlRmlsZUNoYW5nZXMobmV3IEZpbGVDaGFuZ2VzRXZlbnQoW3sgcmVzb3VyY2U6IHJlc291cmNlMSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuREVMRVRFRCB9XSwgZmFsc2UpKTtcblx0XHRhY2Nlc3Nvci5maWxlU2VydmljZS5maXJlRmlsZUNoYW5nZXMobmV3IEZpbGVDaGFuZ2VzRXZlbnQoW3sgcmVzb3VyY2U6IHJlc291cmNlMSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuQURERUQgfV0sIGZhbHNlKSk7XG5cblx0XHRjb25zdCBtb2RlbDIgPSBhd2FpdCBtYW5hZ2VyLnJlc29sdmUocmVzb3VyY2UyLCB7IGVuY29kaW5nOiAndXRmOCcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkQ291bnRlciwgMik7XG5cblx0XHQobW9kZWwxIGFzIFRleHRGaWxlRWRpdG9yTW9kZWwpLnVwZGF0ZVRleHRFZGl0b3JNb2RlbChjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeSgnY2hhbmdlZCcpKTtcblx0XHRtb2RlbDEudXBkYXRlUHJlZmVycmVkRW5jb2RpbmcoJ3V0ZjE2Jyk7XG5cblx0XHRhd2FpdCBtb2RlbDEucmV2ZXJ0KCk7XG5cdFx0KG1vZGVsMSBhcyBUZXh0RmlsZUVkaXRvck1vZGVsKS51cGRhdGVUZXh0RWRpdG9yTW9kZWwoY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnkoJ2NoYW5nZWQgYWdhaW4nKSk7XG5cblx0XHRhd2FpdCBtb2RlbDEuc2F2ZSgpO1xuXHRcdG1vZGVsMS5kaXNwb3NlKCk7XG5cdFx0bW9kZWwyLmRpc3Bvc2UoKTtcblxuXHRcdGF3YWl0IG1vZGVsMS5yZXZlcnQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVtb3ZlZENvdW50ZXIsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnb3REaXJ0eUNvdW50ZXIsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnb3ROb25EaXJ0eUNvdW50ZXIsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXZlcnRlZENvdW50ZXIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYXZlZENvdW50ZXIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmNvZGluZ0NvdW50ZXIsIDIpO1xuXG5cdFx0bW9kZWwxLmRpc3Bvc2UoKTtcblx0XHRtb2RlbDIuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5vayghYWNjZXNzb3IubW9kZWxTZXJ2aWNlLmdldE1vZGVsKHJlc291cmNlMSkpO1xuXHRcdGFzc2VydC5vayghYWNjZXNzb3IubW9kZWxTZXJ2aWNlLmdldE1vZGVsKHJlc291cmNlMikpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NpbmcgbW9kZWwgdGFrZXMgaXQgb3V0IG9mIHRoZSBtYW5hZ2VyJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBhY2Nlc3Nvci50ZXh0RmlsZVNlcnZpY2UuZmlsZXMgYXMgSVRlc3RUZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlcjtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9pbmRleF9zb21ldGhpbmcudHh0Jyk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGF3YWl0IG1hbmFnZXIucmVzb2x2ZShyZXNvdXJjZSwgeyBlbmNvZGluZzogJ3V0ZjgnIH0pO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQub2soIW1hbmFnZXIuZ2V0KHJlc291cmNlKSk7XG5cdFx0YXNzZXJ0Lm9rKCFhY2Nlc3Nvci5tb2RlbFNlcnZpY2UuZ2V0TW9kZWwobW9kZWwucmVzb3VyY2UpKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuRGlzcG9zZSB3aXRoIGRpcnR5IG1vZGVsJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBhY2Nlc3Nvci50ZXh0RmlsZVNlcnZpY2UuZmlsZXMgYXMgSVRlc3RUZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlcjtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9pbmRleF9zb21ldGhpbmcudHh0Jyk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBtYW5hZ2VyLnJlc29sdmUocmVzb3VyY2UsIHsgZW5jb2Rpbmc6ICd1dGY4JyB9KSk7XG5cdFx0KG1vZGVsIGFzIFRleHRGaWxlRWRpdG9yTW9kZWwpLnVwZGF0ZVRleHRFZGl0b3JNb2RlbChjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeSgnbWFrZSBkaXJ0eScpKTtcblxuXHRcdGNvbnN0IGNhbkRpc3Bvc2VQcm9taXNlID0gbWFuYWdlci5jYW5EaXNwb3NlKG1vZGVsIGFzIFRleHRGaWxlRWRpdG9yTW9kZWwpO1xuXHRcdGFzc2VydC5vayhjYW5EaXNwb3NlUHJvbWlzZSBpbnN0YW5jZW9mIFByb21pc2UpO1xuXG5cdFx0bGV0IGNhbkRpc3Bvc2UgPSBmYWxzZTtcblx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y2FuRGlzcG9zZSA9IGF3YWl0IGNhbkRpc3Bvc2VQcm9taXNlO1xuXHRcdH0pKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FuRGlzcG9zZSwgZmFsc2UpO1xuXHRcdG1vZGVsLnJldmVydCh7IHNvZnQ6IHRydWUgfSk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbkRpc3Bvc2UsIHRydWUpO1xuXG5cdFx0Y29uc3QgY2FuRGlzcG9zZTIgPSBtYW5hZ2VyLmNhbkRpc3Bvc2UobW9kZWwgYXMgVGV4dEZpbGVFZGl0b3JNb2RlbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbkRpc3Bvc2UyLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnbGFuZ3VhZ2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBsYW5ndWFnZUlkID0gJ3RleHQtZmlsZS1tb2RlbC1tYW5hZ2VyLXRlc3QnO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhY2Nlc3Nvci5sYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7XG5cdFx0XHRpZDogbGFuZ3VhZ2VJZCxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBtYW5hZ2VyID0gYWNjZXNzb3IudGV4dEZpbGVTZXJ2aWNlLmZpbGVzIGFzIElUZXN0VGV4dEZpbGVFZGl0b3JNb2RlbE1hbmFnZXI7XG5cblx0XHRjb25zdCByZXNvdXJjZTogVVJJID0gdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9pbmRleF9zb21ldGhpbmcudHh0Jyk7XG5cblx0XHRsZXQgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgbWFuYWdlci5yZXNvbHZlKHJlc291cmNlLCB7IGxhbmd1YWdlSWQ6IGxhbmd1YWdlSWQgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC50ZXh0RWRpdG9yTW9kZWwhLmdldExhbmd1YWdlSWQoKSwgbGFuZ3VhZ2VJZCk7XG5cblx0XHRtb2RlbCA9IGF3YWl0IG1hbmFnZXIucmVzb2x2ZShyZXNvdXJjZSwgeyBsYW5ndWFnZUlkOiAndGV4dCcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLnRleHRFZGl0b3JNb2RlbCEuZ2V0TGFuZ3VhZ2VJZCgpLCBQTEFJTlRFWFRfTEFOR1VBR0VfSUQpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaWxlIGNoYW5nZSBldmVudHMgdHJpZ2dlciByZWxvYWQgKG9uIGEgcmVzb2x2ZWQgbW9kZWwpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBhY2Nlc3Nvci50ZXh0RmlsZVNlcnZpY2UuZmlsZXMgYXMgSVRlc3RUZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlcjtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvcGF0aC9pbmRleC50eHQnKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChhd2FpdCBtYW5hZ2VyLnJlc29sdmUocmVzb3VyY2UpKTtcblxuXHRcdGxldCBkaWRSZXNvbHZlID0gZmFsc2U7XG5cdFx0Y29uc3Qgb25EaWRSZXNvbHZlID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZFJlc29sdmUoKHsgbW9kZWwgfSkgPT4ge1xuXHRcdFx0XHRpZiAobW9kZWwucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRcdGRpZFJlc29sdmUgPSB0cnVlO1xuXHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXG5cdFx0YWNjZXNzb3IuZmlsZVNlcnZpY2UuZmlyZUZpbGVDaGFuZ2VzKG5ldyBGaWxlQ2hhbmdlc0V2ZW50KFt7IHJlc291cmNlLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEIH1dLCBmYWxzZSkpO1xuXG5cdFx0YXdhaXQgb25EaWRSZXNvbHZlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWRSZXNvbHZlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZmlsZSBjaGFuZ2UgZXZlbnRzIHRyaWdnZXIgcmVsb2FkIChhZnRlciBhIG1vZGVsIGlzIHJlc29sdmVkOiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTMyNzY1KScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gYWNjZXNzb3IudGV4dEZpbGVTZXJ2aWNlLmZpbGVzIGFzIElUZXN0VGV4dEZpbGVFZGl0b3JNb2RlbE1hbmFnZXI7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3BhdGgvaW5kZXgudHh0Jyk7XG5cblx0XHRtYW5hZ2VyLnJlc29sdmUocmVzb3VyY2UpO1xuXG5cdFx0bGV0IGRpZFJlc29sdmUgPSBmYWxzZTtcblx0XHRsZXQgcmVzb2x2ZWRDb3VudGVyID0gMDtcblx0XHRjb25zdCBvbkRpZFJlc29sdmUgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkUmVzb2x2ZSgoeyBtb2RlbCB9KSA9PiB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbCk7XG5cdFx0XHRcdGlmIChtb2RlbC5yZXNvdXJjZS50b1N0cmluZygpID09PSByZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZWRDb3VudGVyKys7XG5cdFx0XHRcdFx0aWYgKHJlc29sdmVkQ291bnRlciA9PT0gMikge1xuXHRcdFx0XHRcdFx0ZGlkUmVzb2x2ZSA9IHRydWU7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cblx0XHRhY2Nlc3Nvci5maWxlU2VydmljZS5maXJlRmlsZUNoYW5nZXMobmV3IEZpbGVDaGFuZ2VzRXZlbnQoW3sgcmVzb3VyY2UsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLlVQREFURUQgfV0sIGZhbHNlKSk7XG5cblx0XHRhd2FpdCBvbkRpZFJlc29sdmU7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZFJlc29sdmUsIHRydWUpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVztBQUVwQixTQUFTLCtCQUErQiwyQkFBNEQ7QUFDcEcsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxrQkFBa0IsZ0JBQWdCLG9CQUFvQiwyQkFBMkI7QUFDMUYsU0FBUyx5Q0FBeUMsa0JBQWtCO0FBQ3BFLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQixvQkFBb0I7QUFFOUMsTUFBTSxzQ0FBc0MsTUFBTTtBQUVqRCxRQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLE1BQU07QUFDWCwyQkFBdUIsOEJBQThCLFFBQVcsV0FBVztBQUMzRSxlQUFXLHFCQUFxQixlQUFlLG1CQUFtQjtBQUNsRSxnQkFBWSxJQUFJLGFBQWEsTUFBTSxTQUFTLGdCQUFnQixL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
