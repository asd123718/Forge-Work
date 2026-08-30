import assert from "assert";
import { URI } from "../../../../../base/common/uri.js";
import { workbenchInstantiationService, TestServiceAccessor, TestWillShutdownEvent } from "../../../../test/browser/workbenchTestServices.js";
import { StoredFileWorkingCopyManager } from "../../common/storedFileWorkingCopyManager.js";
import { bufferToStream, VSBuffer } from "../../../../../base/common/buffer.js";
import { FileChangesEvent, FileChangeType, FileOperationError, FileOperationResult } from "../../../../../platform/files/common/files.js";
import { timeout } from "../../../../../base/common/async.js";
import { TestStoredFileWorkingCopyModelFactory } from "./storedFileWorkingCopy.test.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { InMemoryFileSystemProvider } from "../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { isWeb } from "../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
suite("StoredFileWorkingCopyManager", () => {
  const disposables = new DisposableStore();
  let instantiationService;
  let accessor;
  let manager;
  setup(() => {
    instantiationService = workbenchInstantiationService(void 0, disposables);
    accessor = instantiationService.createInstance(TestServiceAccessor);
    manager = disposables.add(new StoredFileWorkingCopyManager(
      "testStoredFileWorkingCopyType",
      new TestStoredFileWorkingCopyModelFactory(),
      accessor.fileService,
      accessor.lifecycleService,
      accessor.labelService,
      accessor.logService,
      accessor.workingCopyFileService,
      accessor.workingCopyBackupService,
      accessor.uriIdentityService,
      accessor.filesConfigurationService,
      accessor.workingCopyService,
      accessor.notificationService,
      accessor.workingCopyEditorService,
      accessor.editorService,
      accessor.elevatedFileService,
      accessor.progressService
    ));
  });
  teardown(() => {
    for (const workingCopy of manager.workingCopies) {
      workingCopy.dispose();
    }
    disposables.clear();
  });
  test("resolve", async () => {
    const resource = URI.file("/test.html");
    const events = [];
    const listener = manager.onDidCreate((workingCopy) => {
      events.push(workingCopy);
    });
    const resolvePromise = manager.resolve(resource);
    assert.ok(manager.get(resource));
    assert.strictEqual(manager.workingCopies.length, 1);
    const workingCopy1 = await resolvePromise;
    assert.ok(workingCopy1);
    assert.ok(workingCopy1.model);
    assert.strictEqual(workingCopy1.typeId, "testStoredFileWorkingCopyType");
    assert.strictEqual(workingCopy1.resource.toString(), resource.toString());
    assert.strictEqual(manager.get(resource), workingCopy1);
    const workingCopy2 = await manager.resolve(resource);
    assert.strictEqual(workingCopy2, workingCopy1);
    assert.strictEqual(manager.workingCopies.length, 1);
    workingCopy1.dispose();
    const workingCopy3 = await manager.resolve(resource);
    assert.notStrictEqual(workingCopy3, workingCopy2);
    assert.strictEqual(manager.workingCopies.length, 1);
    assert.strictEqual(manager.get(resource), workingCopy3);
    workingCopy3.dispose();
    assert.strictEqual(manager.workingCopies.length, 0);
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].resource.toString(), workingCopy1.resource.toString());
    assert.strictEqual(events[1].resource.toString(), workingCopy2.resource.toString());
    listener.dispose();
    workingCopy1.dispose();
    workingCopy2.dispose();
    workingCopy3.dispose();
  });
  test("resolve (async)", async () => {
    const resource = URI.file("/path/index.txt");
    disposables.add(await manager.resolve(resource));
    let didResolve = false;
    let onDidResolve = new Promise((resolve2) => {
      disposables.add(manager.onDidResolve(({ model }) => {
        if (model?.resource.toString() === resource.toString()) {
          didResolve = true;
          resolve2();
        }
      }));
    });
    const resolve = manager.resolve(resource, { reload: { async: true } });
    await onDidResolve;
    assert.strictEqual(didResolve, true);
    didResolve = false;
    onDidResolve = new Promise((resolve2) => {
      disposables.add(manager.onDidResolve(({ model }) => {
        if (model?.resource.toString() === resource.toString()) {
          didResolve = true;
          resolve2();
        }
      }));
    });
    manager.resolve(resource, { reload: { async: true, force: true } });
    await onDidResolve;
    assert.strictEqual(didResolve, true);
    disposables.add(await resolve);
  });
  test("resolve (sync)", async () => {
    const resource = URI.file("/path/index.txt");
    await manager.resolve(resource);
    let didResolve = false;
    disposables.add(manager.onDidResolve(({ model }) => {
      if (model?.resource.toString() === resource.toString()) {
        didResolve = true;
      }
    }));
    disposables.add(await manager.resolve(resource, { reload: { async: false } }));
    assert.strictEqual(didResolve, true);
    didResolve = false;
    disposables.add(await manager.resolve(resource, { reload: { async: false, force: true } }));
    assert.strictEqual(didResolve, true);
  });
  test("resolve (sync) - model disposed when error and first call to resolve", async () => {
    const resource = URI.file("/path/index.txt");
    accessor.fileService.readShouldThrowError = new FileOperationError("fail", FileOperationResult.FILE_OTHER_ERROR);
    try {
      let error = void 0;
      try {
        await manager.resolve(resource);
      } catch (e) {
        error = e;
      }
      assert.ok(error);
      assert.strictEqual(manager.workingCopies.length, 0);
    } finally {
      accessor.fileService.readShouldThrowError = void 0;
    }
  });
  test("resolve (sync) - model not disposed when error and model existed before", async () => {
    const resource = URI.file("/path/index.txt");
    disposables.add(await manager.resolve(resource));
    accessor.fileService.readShouldThrowError = new FileOperationError("fail", FileOperationResult.FILE_OTHER_ERROR);
    try {
      let error = void 0;
      try {
        await manager.resolve(resource, { reload: { async: false } });
      } catch (e) {
        error = e;
      }
      assert.ok(error);
      assert.strictEqual(manager.workingCopies.length, 1);
    } finally {
      accessor.fileService.readShouldThrowError = void 0;
    }
  });
  test("resolve with initial contents", async () => {
    const resource = URI.file("/test.html");
    const workingCopy = await manager.resolve(resource, { contents: bufferToStream(VSBuffer.fromString("Hello World")) });
    assert.strictEqual(workingCopy.model?.contents, "Hello World");
    assert.strictEqual(workingCopy.isDirty(), true);
    await manager.resolve(resource, { contents: bufferToStream(VSBuffer.fromString("More Changes")) });
    assert.strictEqual(workingCopy.model?.contents, "More Changes");
    assert.strictEqual(workingCopy.isDirty(), true);
    workingCopy.dispose();
  });
  test("multiple resolves execute in sequence (same resources)", async () => {
    const resource = URI.file("/test.html");
    const firstPromise = manager.resolve(resource);
    const secondPromise = manager.resolve(resource, { contents: bufferToStream(VSBuffer.fromString("Hello World")) });
    const thirdPromise = manager.resolve(resource, { contents: bufferToStream(VSBuffer.fromString("More Changes")) });
    await firstPromise;
    await secondPromise;
    const workingCopy = await thirdPromise;
    assert.strictEqual(workingCopy.model?.contents, "More Changes");
    assert.strictEqual(workingCopy.isDirty(), true);
    workingCopy.dispose();
  });
  test("multiple resolves execute in parallel (different resources)", async () => {
    const resource1 = URI.file("/test1.html");
    const resource2 = URI.file("/test2.html");
    const resource3 = URI.file("/test3.html");
    const firstPromise = manager.resolve(resource1);
    const secondPromise = manager.resolve(resource2);
    const thirdPromise = manager.resolve(resource3);
    const [workingCopy1, workingCopy2, workingCopy3] = await Promise.all([firstPromise, secondPromise, thirdPromise]);
    assert.strictEqual(manager.workingCopies.length, 3);
    assert.strictEqual(workingCopy1.resource.toString(), resource1.toString());
    assert.strictEqual(workingCopy2.resource.toString(), resource2.toString());
    assert.strictEqual(workingCopy3.resource.toString(), resource3.toString());
    workingCopy1.dispose();
    workingCopy2.dispose();
    workingCopy3.dispose();
  });
  test("removed from cache when working copy or model gets disposed", async () => {
    const resource = URI.file("/test.html");
    let workingCopy = await manager.resolve(resource, { contents: bufferToStream(VSBuffer.fromString("Hello World")) });
    assert.strictEqual(manager.get(URI.file("/test.html")), workingCopy);
    workingCopy.dispose();
    assert(!manager.get(URI.file("/test.html")));
    workingCopy = await manager.resolve(resource, { contents: bufferToStream(VSBuffer.fromString("Hello World")) });
    assert.strictEqual(manager.get(URI.file("/test.html")), workingCopy);
    workingCopy.model?.dispose();
    assert(!manager.get(URI.file("/test.html")));
  });
  test("events", async () => {
    const resource1 = URI.file("/path/index.txt");
    const resource2 = URI.file("/path/other.txt");
    let createdCounter = 0;
    let resolvedCounter = 0;
    let removedCounter = 0;
    let gotDirtyCounter = 0;
    let gotNonDirtyCounter = 0;
    let revertedCounter = 0;
    let savedCounter = 0;
    let saveErrorCounter = 0;
    disposables.add(manager.onDidCreate(() => {
      createdCounter++;
    }));
    disposables.add(manager.onDidRemove((resource) => {
      if (resource.toString() === resource1.toString() || resource.toString() === resource2.toString()) {
        removedCounter++;
      }
    }));
    disposables.add(manager.onDidResolve((workingCopy) => {
      if (workingCopy.resource.toString() === resource1.toString()) {
        resolvedCounter++;
      }
    }));
    disposables.add(manager.onDidChangeDirty((workingCopy) => {
      if (workingCopy.resource.toString() === resource1.toString()) {
        if (workingCopy.isDirty()) {
          gotDirtyCounter++;
        } else {
          gotNonDirtyCounter++;
        }
      }
    }));
    disposables.add(manager.onDidRevert((workingCopy) => {
      if (workingCopy.resource.toString() === resource1.toString()) {
        revertedCounter++;
      }
    }));
    let lastSaveEvent = void 0;
    disposables.add(manager.onDidSave((e) => {
      if (e.workingCopy.resource.toString() === resource1.toString()) {
        lastSaveEvent = e;
        savedCounter++;
      }
    }));
    disposables.add(manager.onDidSaveError((workingCopy) => {
      if (workingCopy.resource.toString() === resource1.toString()) {
        saveErrorCounter++;
      }
    }));
    const workingCopy1 = disposables.add(await manager.resolve(resource1));
    assert.strictEqual(resolvedCounter, 1);
    assert.strictEqual(createdCounter, 1);
    accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource: resource1, type: FileChangeType.DELETED }], false));
    accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource: resource1, type: FileChangeType.ADDED }], false));
    const workingCopy2 = disposables.add(await manager.resolve(resource2));
    assert.strictEqual(resolvedCounter, 2);
    assert.strictEqual(createdCounter, 2);
    workingCopy1.model?.updateContents("changed");
    await workingCopy1.revert();
    workingCopy1.model?.updateContents("changed again");
    await workingCopy1.save();
    try {
      accessor.fileService.writeShouldThrowError = new FileOperationError("write error", FileOperationResult.FILE_PERMISSION_DENIED);
      await workingCopy1.save({ force: true });
    } finally {
      accessor.fileService.writeShouldThrowError = void 0;
    }
    workingCopy1.dispose();
    workingCopy2.dispose();
    await workingCopy1.revert();
    assert.strictEqual(removedCounter, 2);
    assert.strictEqual(gotDirtyCounter, 3);
    assert.strictEqual(gotNonDirtyCounter, 2);
    assert.strictEqual(revertedCounter, 1);
    assert.strictEqual(savedCounter, 1);
    assert.strictEqual(lastSaveEvent.workingCopy, workingCopy1);
    assert.ok(lastSaveEvent.stat);
    assert.strictEqual(saveErrorCounter, 1);
    assert.strictEqual(createdCounter, 2);
    workingCopy1.dispose();
    workingCopy2.dispose();
  });
  test("resolve registers as working copy and dispose clears", async () => {
    const resource1 = URI.file("/test1.html");
    const resource2 = URI.file("/test2.html");
    const resource3 = URI.file("/test3.html");
    assert.strictEqual(accessor.workingCopyService.workingCopies.length, 0);
    const firstPromise = manager.resolve(resource1);
    const secondPromise = manager.resolve(resource2);
    const thirdPromise = manager.resolve(resource3);
    await Promise.all([firstPromise, secondPromise, thirdPromise]);
    assert.strictEqual(accessor.workingCopyService.workingCopies.length, 3);
    assert.strictEqual(manager.workingCopies.length, 3);
    manager.dispose();
    assert.strictEqual(manager.workingCopies.length, 0);
    assert.strictEqual(accessor.workingCopyService.workingCopies.length, 3);
    disposables.add(await firstPromise);
    disposables.add(await secondPromise);
    disposables.add(await thirdPromise);
  });
  test("destroy", async () => {
    const resource1 = URI.file("/test1.html");
    const resource2 = URI.file("/test2.html");
    const resource3 = URI.file("/test3.html");
    assert.strictEqual(accessor.workingCopyService.workingCopies.length, 0);
    const firstPromise = manager.resolve(resource1);
    const secondPromise = manager.resolve(resource2);
    const thirdPromise = manager.resolve(resource3);
    await Promise.all([firstPromise, secondPromise, thirdPromise]);
    assert.strictEqual(accessor.workingCopyService.workingCopies.length, 3);
    assert.strictEqual(manager.workingCopies.length, 3);
    await manager.destroy();
    assert.strictEqual(accessor.workingCopyService.workingCopies.length, 0);
    assert.strictEqual(manager.workingCopies.length, 0);
  });
  test("destroy saves dirty working copies", async () => {
    const resource = URI.file("/path/source.txt");
    const workingCopy = await manager.resolve(resource);
    let saved = false;
    disposables.add(workingCopy.onDidSave(() => {
      saved = true;
    }));
    workingCopy.model?.updateContents("hello create");
    assert.strictEqual(workingCopy.isDirty(), true);
    assert.strictEqual(accessor.workingCopyService.workingCopies.length, 1);
    assert.strictEqual(manager.workingCopies.length, 1);
    await manager.destroy();
    assert.strictEqual(accessor.workingCopyService.workingCopies.length, 0);
    assert.strictEqual(manager.workingCopies.length, 0);
    assert.strictEqual(saved, true);
  });
  test("destroy falls back to using backup when save fails", async () => {
    const resource = URI.file("/path/source.txt");
    const workingCopy = await manager.resolve(resource);
    workingCopy.model?.setThrowOnSnapshot();
    let unexpectedSave = false;
    disposables.add(workingCopy.onDidSave(() => {
      unexpectedSave = true;
    }));
    workingCopy.model?.updateContents("hello create");
    assert.strictEqual(workingCopy.isDirty(), true);
    assert.strictEqual(accessor.workingCopyService.workingCopies.length, 1);
    assert.strictEqual(manager.workingCopies.length, 1);
    assert.strictEqual(accessor.workingCopyBackupService.resolved.has(workingCopy), true);
    await manager.destroy();
    assert.strictEqual(accessor.workingCopyService.workingCopies.length, 0);
    assert.strictEqual(manager.workingCopies.length, 0);
    assert.strictEqual(unexpectedSave, false);
  });
  test("file change event triggers working copy resolve", async () => {
    const resource = URI.file("/path/index.txt");
    await manager.resolve(resource);
    let didResolve = false;
    const onDidResolve = new Promise((resolve) => {
      disposables.add(manager.onDidResolve(({ model }) => {
        if (model?.resource.toString() === resource.toString()) {
          didResolve = true;
          resolve();
        }
      }));
    });
    accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: FileChangeType.UPDATED }], false));
    await onDidResolve;
    assert.strictEqual(didResolve, true);
  });
  test("file change event triggers working copy resolve (when working copy is pending to resolve)", async () => {
    const resource = URI.file("/path/index.txt");
    manager.resolve(resource);
    let didResolve = false;
    let resolvedCounter = 0;
    const onDidResolve = new Promise((resolve) => {
      disposables.add(manager.onDidResolve(({ model }) => {
        if (model?.resource.toString() === resource.toString()) {
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
  test("file system provider change triggers working copy resolve", async () => {
    const resource = URI.file("/path/index.txt");
    disposables.add(await manager.resolve(resource));
    let didResolve = false;
    const onDidResolve = new Promise((resolve) => {
      disposables.add(manager.onDidResolve(({ model }) => {
        if (model?.resource.toString() === resource.toString()) {
          didResolve = true;
          resolve();
        }
      }));
    });
    accessor.fileService.fireFileSystemProviderCapabilitiesChangeEvent({ provider: disposables.add(new InMemoryFileSystemProvider()), scheme: resource.scheme });
    await onDidResolve;
    assert.strictEqual(didResolve, true);
  });
  test("working copy file event handling: create", async () => {
    const resource = URI.file("/path/source.txt");
    const workingCopy = await manager.resolve(resource);
    workingCopy.model?.updateContents("hello create");
    assert.strictEqual(workingCopy.isDirty(), true);
    await accessor.workingCopyFileService.create([{ resource }], CancellationToken.None);
    assert.strictEqual(workingCopy.isDirty(), false);
  });
  test("working copy file event handling: move", () => {
    return testMoveCopyFileWorkingCopy(true);
  });
  test("working copy file event handling: copy", () => {
    return testMoveCopyFileWorkingCopy(false);
  });
  async function testMoveCopyFileWorkingCopy(move) {
    const source = URI.file("/path/source.txt");
    const target = URI.file("/path/other.txt");
    const sourceWorkingCopy = await manager.resolve(source);
    sourceWorkingCopy.model?.updateContents("hello move or copy");
    assert.strictEqual(sourceWorkingCopy.isDirty(), true);
    if (move) {
      await accessor.workingCopyFileService.move([{ file: { source, target } }], CancellationToken.None);
    } else {
      await accessor.workingCopyFileService.copy([{ file: { source, target } }], CancellationToken.None);
    }
    const targetWorkingCopy = await manager.resolve(target);
    assert.strictEqual(targetWorkingCopy.isDirty(), true);
    assert.strictEqual(targetWorkingCopy.model?.contents, "hello move or copy");
  }
  test("working copy file event handling: delete", async () => {
    const resource = URI.file("/path/source.txt");
    const workingCopy = await manager.resolve(resource);
    workingCopy.model?.updateContents("hello delete");
    assert.strictEqual(workingCopy.isDirty(), true);
    await accessor.workingCopyFileService.delete([{ resource }], CancellationToken.None);
    assert.strictEqual(workingCopy.isDirty(), false);
  });
  test("working copy file event handling: move to same resource", async () => {
    const source = URI.file("/path/source.txt");
    const sourceWorkingCopy = await manager.resolve(source);
    sourceWorkingCopy.model?.updateContents("hello move");
    assert.strictEqual(sourceWorkingCopy.isDirty(), true);
    await accessor.workingCopyFileService.move([{ file: { source, target: source } }], CancellationToken.None);
    assert.strictEqual(sourceWorkingCopy.isDirty(), true);
    assert.strictEqual(sourceWorkingCopy.model?.contents, "hello move");
  });
  test("canDispose with dirty working copy", async () => {
    const resource = URI.file("/path/index_something.txt");
    const workingCopy = await manager.resolve(resource);
    workingCopy.model?.updateContents("make dirty");
    const canDisposePromise = manager.canDispose(workingCopy);
    assert.ok(canDisposePromise instanceof Promise);
    let canDispose = false;
    (async () => {
      canDispose = await canDisposePromise;
    })();
    assert.strictEqual(canDispose, false);
    workingCopy.revert({ soft: true });
    await timeout(0);
    assert.strictEqual(canDispose, true);
    const canDispose2 = manager.canDispose(workingCopy);
    assert.strictEqual(canDispose2, true);
  });
  (isWeb ? test.skip : test)("pending saves join on shutdown", async () => {
    const resource1 = URI.file("/path/index_something1.txt");
    const resource2 = URI.file("/path/index_something2.txt");
    const workingCopy1 = disposables.add(await manager.resolve(resource1));
    workingCopy1.model?.updateContents("make dirty");
    const workingCopy2 = disposables.add(await manager.resolve(resource2));
    workingCopy2.model?.updateContents("make dirty");
    let saved1 = false;
    workingCopy1.save().then(() => {
      saved1 = true;
    });
    let saved2 = false;
    workingCopy2.save().then(() => {
      saved2 = true;
    });
    const event = new TestWillShutdownEvent();
    accessor.lifecycleService.fireWillShutdown(event);
    assert.ok(event.value.length > 0);
    await Promise.all(event.value);
    assert.strictEqual(saved1, true);
    assert.strictEqual(saved2, true);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx3b3JraW5nQ29weVxcdGVzdFxcYnJvd3Nlclxcc3RvcmVkRmlsZVdvcmtpbmdDb3B5TWFuYWdlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UsIFRlc3RTZXJ2aWNlQWNjZXNzb3IsIFRlc3RXaWxsU2h1dGRvd25FdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgU3RvcmVkRmlsZVdvcmtpbmdDb3B5TWFuYWdlciwgSVN0b3JlZEZpbGVXb3JraW5nQ29weU1hbmFnZXIsIElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlRXZlbnQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RvcmVkRmlsZVdvcmtpbmdDb3B5TWFuYWdlci5qcyc7XG5pbXBvcnQgeyBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5LCBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vc3RvcmVkRmlsZVdvcmtpbmdDb3B5LmpzJztcbmltcG9ydCB7IGJ1ZmZlclRvU3RyZWFtLCBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBGaWxlQ2hhbmdlc0V2ZW50LCBGaWxlQ2hhbmdlVHlwZSwgRmlsZU9wZXJhdGlvbkVycm9yLCBGaWxlT3BlcmF0aW9uUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBUZXN0U3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWwsIFRlc3RTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbEZhY3RvcnkgfSBmcm9tICcuL3N0b3JlZEZpbGVXb3JraW5nQ29weS50ZXN0LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuXG5zdWl0ZSgnU3RvcmVkRmlsZVdvcmtpbmdDb3B5TWFuYWdlcicsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBhY2Nlc3NvcjogVGVzdFNlcnZpY2VBY2Nlc3NvcjtcblxuXHRsZXQgbWFuYWdlcjogSVN0b3JlZEZpbGVXb3JraW5nQ29weU1hbmFnZXI8VGVzdFN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsPjtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHRhY2Nlc3NvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTZXJ2aWNlQWNjZXNzb3IpO1xuXG5cdFx0bWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU3RvcmVkRmlsZVdvcmtpbmdDb3B5TWFuYWdlcjxUZXN0U3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWw+KFxuXHRcdFx0J3Rlc3RTdG9yZWRGaWxlV29ya2luZ0NvcHlUeXBlJyxcblx0XHRcdG5ldyBUZXN0U3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWxGYWN0b3J5KCksXG5cdFx0XHRhY2Nlc3Nvci5maWxlU2VydmljZSwgYWNjZXNzb3IubGlmZWN5Y2xlU2VydmljZSwgYWNjZXNzb3IubGFiZWxTZXJ2aWNlLCBhY2Nlc3Nvci5sb2dTZXJ2aWNlLFxuXHRcdFx0YWNjZXNzb3Iud29ya2luZ0NvcHlGaWxlU2VydmljZSwgYWNjZXNzb3Iud29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLCBhY2Nlc3Nvci51cmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0XHRhY2Nlc3Nvci5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLCBhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2UsIGFjY2Vzc29yLm5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0XHRhY2Nlc3Nvci53b3JraW5nQ29weUVkaXRvclNlcnZpY2UsIGFjY2Vzc29yLmVkaXRvclNlcnZpY2UsIGFjY2Vzc29yLmVsZXZhdGVkRmlsZVNlcnZpY2UsXG5cdFx0XHRhY2Nlc3Nvci5wcm9ncmVzc1NlcnZpY2Vcblx0XHQpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGZvciAoY29uc3Qgd29ya2luZ0NvcHkgb2YgbWFuYWdlci53b3JraW5nQ29waWVzKSB7XG5cdFx0XHR3b3JraW5nQ29weS5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvdGVzdC5odG1sJyk7XG5cblx0XHRjb25zdCBldmVudHM6IElTdG9yZWRGaWxlV29ya2luZ0NvcHk8SVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsPltdID0gW107XG5cdFx0Y29uc3QgbGlzdGVuZXIgPSBtYW5hZ2VyLm9uRGlkQ3JlYXRlKHdvcmtpbmdDb3B5ID0+IHtcblx0XHRcdGV2ZW50cy5wdXNoKHdvcmtpbmdDb3B5KTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc29sdmVQcm9taXNlID0gbWFuYWdlci5yZXNvbHZlKHJlc291cmNlKTtcblx0XHRhc3NlcnQub2sobWFuYWdlci5nZXQocmVzb3VyY2UpKTsgLy8gd29ya2luZyBjb3B5IGtub3duIGV2ZW4gYmVmb3JlIHJlc29sdmVkKClcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci53b3JraW5nQ29waWVzLmxlbmd0aCwgMSk7XG5cblx0XHRjb25zdCB3b3JraW5nQ29weTEgPSBhd2FpdCByZXNvbHZlUHJvbWlzZTtcblx0XHRhc3NlcnQub2sod29ya2luZ0NvcHkxKTtcblx0XHRhc3NlcnQub2sod29ya2luZ0NvcHkxLm1vZGVsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkxLnR5cGVJZCwgJ3Rlc3RTdG9yZWRGaWxlV29ya2luZ0NvcHlUeXBlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5MS5yZXNvdXJjZS50b1N0cmluZygpLCByZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXQocmVzb3VyY2UpLCB3b3JraW5nQ29weTEpO1xuXG5cdFx0Y29uc3Qgd29ya2luZ0NvcHkyID0gYXdhaXQgbWFuYWdlci5yZXNvbHZlKHJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkyLCB3b3JraW5nQ29weTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLndvcmtpbmdDb3BpZXMubGVuZ3RoLCAxKTtcblx0XHR3b3JraW5nQ29weTEuZGlzcG9zZSgpO1xuXG5cdFx0Y29uc3Qgd29ya2luZ0NvcHkzID0gYXdhaXQgbWFuYWdlci5yZXNvbHZlKHJlc291cmNlKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwod29ya2luZ0NvcHkzLCB3b3JraW5nQ29weTIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLndvcmtpbmdDb3BpZXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXQocmVzb3VyY2UpLCB3b3JraW5nQ29weTMpO1xuXHRcdHdvcmtpbmdDb3B5My5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci53b3JraW5nQ29waWVzLmxlbmd0aCwgMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50c1swXS5yZXNvdXJjZS50b1N0cmluZygpLCB3b3JraW5nQ29weTEucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50c1sxXS5yZXNvdXJjZS50b1N0cmluZygpLCB3b3JraW5nQ29weTIucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cblx0XHR3b3JraW5nQ29weTEuZGlzcG9zZSgpO1xuXHRcdHdvcmtpbmdDb3B5Mi5kaXNwb3NlKCk7XG5cdFx0d29ya2luZ0NvcHkzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZSAoYXN5bmMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy9wYXRoL2luZGV4LnR4dCcpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGF3YWl0IG1hbmFnZXIucmVzb2x2ZShyZXNvdXJjZSkpO1xuXG5cdFx0bGV0IGRpZFJlc29sdmUgPSBmYWxzZTtcblx0XHRsZXQgb25EaWRSZXNvbHZlID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZFJlc29sdmUoKHsgbW9kZWwgfSkgPT4ge1xuXHRcdFx0XHRpZiAobW9kZWw/LnJlc291cmNlLnRvU3RyaW5nKCkgPT09IHJlc291cmNlLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0XHRkaWRSZXNvbHZlID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc29sdmUgPSBtYW5hZ2VyLnJlc29sdmUocmVzb3VyY2UsIHsgcmVsb2FkOiB7IGFzeW5jOiB0cnVlIH0gfSk7XG5cblx0XHRhd2FpdCBvbkRpZFJlc29sdmU7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlkUmVzb2x2ZSwgdHJ1ZSk7XG5cblx0XHRkaWRSZXNvbHZlID0gZmFsc2U7XG5cblx0XHRvbkRpZFJlc29sdmUgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkUmVzb2x2ZSgoeyBtb2RlbCB9KSA9PiB7XG5cdFx0XHRcdGlmIChtb2RlbD8ucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRcdGRpZFJlc29sdmUgPSB0cnVlO1xuXHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXG5cdFx0bWFuYWdlci5yZXNvbHZlKHJlc291cmNlLCB7IHJlbG9hZDogeyBhc3luYzogdHJ1ZSwgZm9yY2U6IHRydWUgfSB9KTtcblxuXHRcdGF3YWl0IG9uRGlkUmVzb2x2ZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWRSZXNvbHZlLCB0cnVlKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChhd2FpdCByZXNvbHZlKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZSAoc3luYyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3BhdGgvaW5kZXgudHh0Jyk7XG5cblx0XHRhd2FpdCBtYW5hZ2VyLnJlc29sdmUocmVzb3VyY2UpO1xuXG5cdFx0bGV0IGRpZFJlc29sdmUgPSBmYWxzZTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZFJlc29sdmUoKHsgbW9kZWwgfSkgPT4ge1xuXHRcdFx0aWYgKG1vZGVsPy5yZXNvdXJjZS50b1N0cmluZygpID09PSByZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHRcdGRpZFJlc29sdmUgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChhd2FpdCBtYW5hZ2VyLnJlc29sdmUocmVzb3VyY2UsIHsgcmVsb2FkOiB7IGFzeW5jOiBmYWxzZSB9IH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlkUmVzb2x2ZSwgdHJ1ZSk7XG5cblx0XHRkaWRSZXNvbHZlID0gZmFsc2U7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoYXdhaXQgbWFuYWdlci5yZXNvbHZlKHJlc291cmNlLCB7IHJlbG9hZDogeyBhc3luYzogZmFsc2UsIGZvcmNlOiB0cnVlIH0gfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWRSZXNvbHZlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZSAoc3luYykgLSBtb2RlbCBkaXNwb3NlZCB3aGVuIGVycm9yIGFuZCBmaXJzdCBjYWxsIHRvIHJlc29sdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3BhdGgvaW5kZXgudHh0Jyk7XG5cblx0XHRhY2Nlc3Nvci5maWxlU2VydmljZS5yZWFkU2hvdWxkVGhyb3dFcnJvciA9IG5ldyBGaWxlT3BlcmF0aW9uRXJyb3IoJ2ZhaWwnLCBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfT1RIRVJfRVJST1IpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGxldCBlcnJvcjogRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBtYW5hZ2VyLnJlc29sdmUocmVzb3VyY2UpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRlcnJvciA9IGU7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5vayhlcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci53b3JraW5nQ29waWVzLmxlbmd0aCwgMCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGFjY2Vzc29yLmZpbGVTZXJ2aWNlLnJlYWRTaG91bGRUaHJvd0Vycm9yID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZSAoc3luYykgLSBtb2RlbCBub3QgZGlzcG9zZWQgd2hlbiBlcnJvciBhbmQgbW9kZWwgZXhpc3RlZCBiZWZvcmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3BhdGgvaW5kZXgudHh0Jyk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoYXdhaXQgbWFuYWdlci5yZXNvbHZlKHJlc291cmNlKSk7XG5cblx0XHRhY2Nlc3Nvci5maWxlU2VydmljZS5yZWFkU2hvdWxkVGhyb3dFcnJvciA9IG5ldyBGaWxlT3BlcmF0aW9uRXJyb3IoJ2ZhaWwnLCBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfT1RIRVJfRVJST1IpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGxldCBlcnJvcjogRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBtYW5hZ2VyLnJlc29sdmUocmVzb3VyY2UsIHsgcmVsb2FkOiB7IGFzeW5jOiBmYWxzZSB9IH0pO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRlcnJvciA9IGU7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5vayhlcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci53b3JraW5nQ29waWVzLmxlbmd0aCwgMSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGFjY2Vzc29yLmZpbGVTZXJ2aWNlLnJlYWRTaG91bGRUaHJvd0Vycm9yID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZSB3aXRoIGluaXRpYWwgY29udGVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3Rlc3QuaHRtbCcpO1xuXG5cdFx0Y29uc3Qgd29ya2luZ0NvcHkgPSBhd2FpdCBtYW5hZ2VyLnJlc29sdmUocmVzb3VyY2UsIHsgY29udGVudHM6IGJ1ZmZlclRvU3RyZWFtKFZTQnVmZmVyLmZyb21TdHJpbmcoJ0hlbGxvIFdvcmxkJykpIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5tb2RlbD8uY29udGVudHMsICdIZWxsbyBXb3JsZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5pc0RpcnR5KCksIHRydWUpO1xuXG5cdFx0YXdhaXQgbWFuYWdlci5yZXNvbHZlKHJlc291cmNlLCB7IGNvbnRlbnRzOiBidWZmZXJUb1N0cmVhbShWU0J1ZmZlci5mcm9tU3RyaW5nKCdNb3JlIENoYW5nZXMnKSkgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5Lm1vZGVsPy5jb250ZW50cywgJ01vcmUgQ2hhbmdlcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5pc0RpcnR5KCksIHRydWUpO1xuXG5cdFx0d29ya2luZ0NvcHkuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aXBsZSByZXNvbHZlcyBleGVjdXRlIGluIHNlcXVlbmNlIChzYW1lIHJlc291cmNlcyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3Rlc3QuaHRtbCcpO1xuXG5cdFx0Y29uc3QgZmlyc3RQcm9taXNlID0gbWFuYWdlci5yZXNvbHZlKHJlc291cmNlKTtcblx0XHRjb25zdCBzZWNvbmRQcm9taXNlID0gbWFuYWdlci5yZXNvbHZlKHJlc291cmNlLCB7IGNvbnRlbnRzOiBidWZmZXJUb1N0cmVhbShWU0J1ZmZlci5mcm9tU3RyaW5nKCdIZWxsbyBXb3JsZCcpKSB9KTtcblx0XHRjb25zdCB0aGlyZFByb21pc2UgPSBtYW5hZ2VyLnJlc29sdmUocmVzb3VyY2UsIHsgY29udGVudHM6IGJ1ZmZlclRvU3RyZWFtKFZTQnVmZmVyLmZyb21TdHJpbmcoJ01vcmUgQ2hhbmdlcycpKSB9KTtcblxuXHRcdGF3YWl0IGZpcnN0UHJvbWlzZTtcblx0XHRhd2FpdCBzZWNvbmRQcm9taXNlO1xuXHRcdGNvbnN0IHdvcmtpbmdDb3B5ID0gYXdhaXQgdGhpcmRQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5Lm1vZGVsPy5jb250ZW50cywgJ01vcmUgQ2hhbmdlcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5pc0RpcnR5KCksIHRydWUpO1xuXG5cdFx0d29ya2luZ0NvcHkuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aXBsZSByZXNvbHZlcyBleGVjdXRlIGluIHBhcmFsbGVsIChkaWZmZXJlbnQgcmVzb3VyY2VzKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZTEgPSBVUkkuZmlsZSgnL3Rlc3QxLmh0bWwnKTtcblx0XHRjb25zdCByZXNvdXJjZTIgPSBVUkkuZmlsZSgnL3Rlc3QyLmh0bWwnKTtcblx0XHRjb25zdCByZXNvdXJjZTMgPSBVUkkuZmlsZSgnL3Rlc3QzLmh0bWwnKTtcblxuXHRcdGNvbnN0IGZpcnN0UHJvbWlzZSA9IG1hbmFnZXIucmVzb2x2ZShyZXNvdXJjZTEpO1xuXHRcdGNvbnN0IHNlY29uZFByb21pc2UgPSBtYW5hZ2VyLnJlc29sdmUocmVzb3VyY2UyKTtcblx0XHRjb25zdCB0aGlyZFByb21pc2UgPSBtYW5hZ2VyLnJlc29sdmUocmVzb3VyY2UzKTtcblxuXHRcdGNvbnN0IFt3b3JraW5nQ29weTEsIHdvcmtpbmdDb3B5Miwgd29ya2luZ0NvcHkzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtmaXJzdFByb21pc2UsIHNlY29uZFByb21pc2UsIHRoaXJkUHJvbWlzZV0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIud29ya2luZ0NvcGllcy5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weTEucmVzb3VyY2UudG9TdHJpbmcoKSwgcmVzb3VyY2UxLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weTIucmVzb3VyY2UudG9TdHJpbmcoKSwgcmVzb3VyY2UyLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weTMucmVzb3VyY2UudG9TdHJpbmcoKSwgcmVzb3VyY2UzLnRvU3RyaW5nKCkpO1xuXG5cdFx0d29ya2luZ0NvcHkxLmRpc3Bvc2UoKTtcblx0XHR3b3JraW5nQ29weTIuZGlzcG9zZSgpO1xuXHRcdHdvcmtpbmdDb3B5My5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZWQgZnJvbSBjYWNoZSB3aGVuIHdvcmtpbmcgY29weSBvciBtb2RlbCBnZXRzIGRpc3Bvc2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy90ZXN0Lmh0bWwnKTtcblxuXHRcdGxldCB3b3JraW5nQ29weSA9IGF3YWl0IG1hbmFnZXIucmVzb2x2ZShyZXNvdXJjZSwgeyBjb250ZW50czogYnVmZmVyVG9TdHJlYW0oVlNCdWZmZXIuZnJvbVN0cmluZygnSGVsbG8gV29ybGQnKSkgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXQoVVJJLmZpbGUoJy90ZXN0Lmh0bWwnKSksIHdvcmtpbmdDb3B5KTtcblxuXHRcdHdvcmtpbmdDb3B5LmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQoIW1hbmFnZXIuZ2V0KFVSSS5maWxlKCcvdGVzdC5odG1sJykpKTtcblxuXHRcdHdvcmtpbmdDb3B5ID0gYXdhaXQgbWFuYWdlci5yZXNvbHZlKHJlc291cmNlLCB7IGNvbnRlbnRzOiBidWZmZXJUb1N0cmVhbShWU0J1ZmZlci5mcm9tU3RyaW5nKCdIZWxsbyBXb3JsZCcpKSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldChVUkkuZmlsZSgnL3Rlc3QuaHRtbCcpKSwgd29ya2luZ0NvcHkpO1xuXG5cdFx0d29ya2luZ0NvcHkubW9kZWw/LmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQoIW1hbmFnZXIuZ2V0KFVSSS5maWxlKCcvdGVzdC5odG1sJykpKTtcblx0fSk7XG5cblx0dGVzdCgnZXZlbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlMSA9IFVSSS5maWxlKCcvcGF0aC9pbmRleC50eHQnKTtcblx0XHRjb25zdCByZXNvdXJjZTIgPSBVUkkuZmlsZSgnL3BhdGgvb3RoZXIudHh0Jyk7XG5cblx0XHRsZXQgY3JlYXRlZENvdW50ZXIgPSAwO1xuXHRcdGxldCByZXNvbHZlZENvdW50ZXIgPSAwO1xuXHRcdGxldCByZW1vdmVkQ291bnRlciA9IDA7XG5cdFx0bGV0IGdvdERpcnR5Q291bnRlciA9IDA7XG5cdFx0bGV0IGdvdE5vbkRpcnR5Q291bnRlciA9IDA7XG5cdFx0bGV0IHJldmVydGVkQ291bnRlciA9IDA7XG5cdFx0bGV0IHNhdmVkQ291bnRlciA9IDA7XG5cdFx0bGV0IHNhdmVFcnJvckNvdW50ZXIgPSAwO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRDcmVhdGUoKCkgPT4ge1xuXHRcdFx0Y3JlYXRlZENvdW50ZXIrKztcblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZFJlbW92ZShyZXNvdXJjZSA9PiB7XG5cdFx0XHRpZiAocmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2UxLnRvU3RyaW5nKCkgfHwgcmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2UyLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0cmVtb3ZlZENvdW50ZXIrKztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZFJlc29sdmUod29ya2luZ0NvcHkgPT4ge1xuXHRcdFx0aWYgKHdvcmtpbmdDb3B5LnJlc291cmNlLnRvU3RyaW5nKCkgPT09IHJlc291cmNlMS50b1N0cmluZygpKSB7XG5cdFx0XHRcdHJlc29sdmVkQ291bnRlcisrO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkQ2hhbmdlRGlydHkod29ya2luZ0NvcHkgPT4ge1xuXHRcdFx0aWYgKHdvcmtpbmdDb3B5LnJlc291cmNlLnRvU3RyaW5nKCkgPT09IHJlc291cmNlMS50b1N0cmluZygpKSB7XG5cdFx0XHRcdGlmICh3b3JraW5nQ29weS5pc0RpcnR5KCkpIHtcblx0XHRcdFx0XHRnb3REaXJ0eUNvdW50ZXIrKztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRnb3ROb25EaXJ0eUNvdW50ZXIrKztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkUmV2ZXJ0KHdvcmtpbmdDb3B5ID0+IHtcblx0XHRcdGlmICh3b3JraW5nQ29weS5yZXNvdXJjZS50b1N0cmluZygpID09PSByZXNvdXJjZTEudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRyZXZlcnRlZENvdW50ZXIrKztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRsZXQgbGFzdFNhdmVFdmVudDogSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVFdmVudDxUZXN0U3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWw+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkU2F2ZSgoZSkgPT4ge1xuXHRcdFx0aWYgKGUud29ya2luZ0NvcHkucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2UxLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0bGFzdFNhdmVFdmVudCA9IGU7XG5cdFx0XHRcdHNhdmVkQ291bnRlcisrO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkU2F2ZUVycm9yKHdvcmtpbmdDb3B5ID0+IHtcblx0XHRcdGlmICh3b3JraW5nQ29weS5yZXNvdXJjZS50b1N0cmluZygpID09PSByZXNvdXJjZTEudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRzYXZlRXJyb3JDb3VudGVyKys7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgd29ya2luZ0NvcHkxID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IG1hbmFnZXIucmVzb2x2ZShyZXNvdXJjZTEpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWRDb3VudGVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZENvdW50ZXIsIDEpO1xuXG5cdFx0YWNjZXNzb3IuZmlsZVNlcnZpY2UuZmlyZUZpbGVDaGFuZ2VzKG5ldyBGaWxlQ2hhbmdlc0V2ZW50KFt7IHJlc291cmNlOiByZXNvdXJjZTEsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQgfV0sIGZhbHNlKSk7XG5cdFx0YWNjZXNzb3IuZmlsZVNlcnZpY2UuZmlyZUZpbGVDaGFuZ2VzKG5ldyBGaWxlQ2hhbmdlc0V2ZW50KFt7IHJlc291cmNlOiByZXNvdXJjZTEsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkFEREVEIH1dLCBmYWxzZSkpO1xuXG5cdFx0Y29uc3Qgd29ya2luZ0NvcHkyID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IG1hbmFnZXIucmVzb2x2ZShyZXNvdXJjZTIpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWRDb3VudGVyLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZENvdW50ZXIsIDIpO1xuXG5cdFx0d29ya2luZ0NvcHkxLm1vZGVsPy51cGRhdGVDb250ZW50cygnY2hhbmdlZCcpO1xuXG5cdFx0YXdhaXQgd29ya2luZ0NvcHkxLnJldmVydCgpO1xuXHRcdHdvcmtpbmdDb3B5MS5tb2RlbD8udXBkYXRlQ29udGVudHMoJ2NoYW5nZWQgYWdhaW4nKTtcblxuXHRcdGF3YWl0IHdvcmtpbmdDb3B5MS5zYXZlKCk7XG5cblx0XHR0cnkge1xuXHRcdFx0YWNjZXNzb3IuZmlsZVNlcnZpY2Uud3JpdGVTaG91bGRUaHJvd0Vycm9yID0gbmV3IEZpbGVPcGVyYXRpb25FcnJvcignd3JpdGUgZXJyb3InLCBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfUEVSTUlTU0lPTl9ERU5JRUQpO1xuXG5cdFx0XHRhd2FpdCB3b3JraW5nQ29weTEuc2F2ZSh7IGZvcmNlOiB0cnVlIH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhY2Nlc3Nvci5maWxlU2VydmljZS53cml0ZVNob3VsZFRocm93RXJyb3IgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0d29ya2luZ0NvcHkxLmRpc3Bvc2UoKTtcblx0XHR3b3JraW5nQ29weTIuZGlzcG9zZSgpO1xuXG5cdFx0YXdhaXQgd29ya2luZ0NvcHkxLnJldmVydCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW1vdmVkQ291bnRlciwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdvdERpcnR5Q291bnRlciwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdvdE5vbkRpcnR5Q291bnRlciwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJldmVydGVkQ291bnRlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhdmVkQ291bnRlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3RTYXZlRXZlbnQhLndvcmtpbmdDb3B5LCB3b3JraW5nQ29weTEpO1xuXHRcdGFzc2VydC5vayhsYXN0U2F2ZUV2ZW50IS5zdGF0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2F2ZUVycm9yQ291bnRlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRDb3VudGVyLCAyKTtcblxuXHRcdHdvcmtpbmdDb3B5MS5kaXNwb3NlKCk7XG5cdFx0d29ya2luZ0NvcHkyLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZSByZWdpc3RlcnMgYXMgd29ya2luZyBjb3B5IGFuZCBkaXNwb3NlIGNsZWFycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZTEgPSBVUkkuZmlsZSgnL3Rlc3QxLmh0bWwnKTtcblx0XHRjb25zdCByZXNvdXJjZTIgPSBVUkkuZmlsZSgnL3Rlc3QyLmh0bWwnKTtcblx0XHRjb25zdCByZXNvdXJjZTMgPSBVUkkuZmlsZSgnL3Rlc3QzLmh0bWwnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2Uud29ya2luZ0NvcGllcy5sZW5ndGgsIDApO1xuXG5cdFx0Y29uc3QgZmlyc3RQcm9taXNlID0gbWFuYWdlci5yZXNvbHZlKHJlc291cmNlMSk7XG5cdFx0Y29uc3Qgc2Vjb25kUHJvbWlzZSA9IG1hbmFnZXIucmVzb2x2ZShyZXNvdXJjZTIpO1xuXHRcdGNvbnN0IHRoaXJkUHJvbWlzZSA9IG1hbmFnZXIucmVzb2x2ZShyZXNvdXJjZTMpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW2ZpcnN0UHJvbWlzZSwgc2Vjb25kUHJvbWlzZSwgdGhpcmRQcm9taXNlXSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXNzb3Iud29ya2luZ0NvcHlTZXJ2aWNlLndvcmtpbmdDb3BpZXMubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci53b3JraW5nQ29waWVzLmxlbmd0aCwgMyk7XG5cblx0XHRtYW5hZ2VyLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLndvcmtpbmdDb3BpZXMubGVuZ3RoLCAwKTtcblxuXHRcdC8vIGRpc3Bvc2UgZG9lcyBub3QgcmVtb3ZlIGZyb20gd29ya2luZyBjb3B5IHNlcnZpY2UsIG9ubHkgYGRlc3Ryb3lgIHNob3VsZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2Uud29ya2luZ0NvcGllcy5sZW5ndGgsIDMpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGF3YWl0IGZpcnN0UHJvbWlzZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGF3YWl0IHNlY29uZFByb21pc2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhd2FpdCB0aGlyZFByb21pc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXN0cm95JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlMSA9IFVSSS5maWxlKCcvdGVzdDEuaHRtbCcpO1xuXHRcdGNvbnN0IHJlc291cmNlMiA9IFVSSS5maWxlKCcvdGVzdDIuaHRtbCcpO1xuXHRcdGNvbnN0IHJlc291cmNlMyA9IFVSSS5maWxlKCcvdGVzdDMuaHRtbCcpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS53b3JraW5nQ29waWVzLmxlbmd0aCwgMCk7XG5cblx0XHRjb25zdCBmaXJzdFByb21pc2UgPSBtYW5hZ2VyLnJlc29sdmUocmVzb3VyY2UxKTtcblx0XHRjb25zdCBzZWNvbmRQcm9taXNlID0gbWFuYWdlci5yZXNvbHZlKHJlc291cmNlMik7XG5cdFx0Y29uc3QgdGhpcmRQcm9taXNlID0gbWFuYWdlci5yZXNvbHZlKHJlc291cmNlMyk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbZmlyc3RQcm9taXNlLCBzZWNvbmRQcm9taXNlLCB0aGlyZFByb21pc2VdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2Uud29ya2luZ0NvcGllcy5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLndvcmtpbmdDb3BpZXMubGVuZ3RoLCAzKTtcblxuXHRcdGF3YWl0IG1hbmFnZXIuZGVzdHJveSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS53b3JraW5nQ29waWVzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIud29ya2luZ0NvcGllcy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXN0cm95IHNhdmVzIGRpcnR5IHdvcmtpbmcgY29waWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy9wYXRoL3NvdXJjZS50eHQnKTtcblxuXHRcdGNvbnN0IHdvcmtpbmdDb3B5ID0gYXdhaXQgbWFuYWdlci5yZXNvbHZlKHJlc291cmNlKTtcblxuXHRcdGxldCBzYXZlZCA9IGZhbHNlO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh3b3JraW5nQ29weS5vbkRpZFNhdmUoKCkgPT4ge1xuXHRcdFx0c2F2ZWQgPSB0cnVlO1xuXHRcdH0pKTtcblxuXHRcdHdvcmtpbmdDb3B5Lm1vZGVsPy51cGRhdGVDb250ZW50cygnaGVsbG8gY3JlYXRlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5LmlzRGlydHkoKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXNzb3Iud29ya2luZ0NvcHlTZXJ2aWNlLndvcmtpbmdDb3BpZXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci53b3JraW5nQ29waWVzLmxlbmd0aCwgMSk7XG5cblx0XHRhd2FpdCBtYW5hZ2VyLmRlc3Ryb3koKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2Uud29ya2luZ0NvcGllcy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLndvcmtpbmdDb3BpZXMubGVuZ3RoLCAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYXZlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rlc3Ryb3kgZmFsbHMgYmFjayB0byB1c2luZyBiYWNrdXAgd2hlbiBzYXZlIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy9wYXRoL3NvdXJjZS50eHQnKTtcblxuXHRcdGNvbnN0IHdvcmtpbmdDb3B5ID0gYXdhaXQgbWFuYWdlci5yZXNvbHZlKHJlc291cmNlKTtcblx0XHR3b3JraW5nQ29weS5tb2RlbD8uc2V0VGhyb3dPblNuYXBzaG90KCk7XG5cblx0XHRsZXQgdW5leHBlY3RlZFNhdmUgPSBmYWxzZTtcblx0XHRkaXNwb3NhYmxlcy5hZGQod29ya2luZ0NvcHkub25EaWRTYXZlKCgpID0+IHtcblx0XHRcdHVuZXhwZWN0ZWRTYXZlID0gdHJ1ZTtcblx0XHR9KSk7XG5cblx0XHR3b3JraW5nQ29weS5tb2RlbD8udXBkYXRlQ29udGVudHMoJ2hlbGxvIGNyZWF0ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5pc0RpcnR5KCksIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS53b3JraW5nQ29waWVzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIud29ya2luZ0NvcGllcy5sZW5ndGgsIDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLndvcmtpbmdDb3B5QmFja3VwU2VydmljZS5yZXNvbHZlZC5oYXMod29ya2luZ0NvcHkpLCB0cnVlKTtcblxuXHRcdGF3YWl0IG1hbmFnZXIuZGVzdHJveSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS53b3JraW5nQ29waWVzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIud29ya2luZ0NvcGllcy5sZW5ndGgsIDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuZXhwZWN0ZWRTYXZlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbGUgY2hhbmdlIGV2ZW50IHRyaWdnZXJzIHdvcmtpbmcgY29weSByZXNvbHZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy9wYXRoL2luZGV4LnR4dCcpO1xuXG5cdFx0YXdhaXQgbWFuYWdlci5yZXNvbHZlKHJlc291cmNlKTtcblxuXHRcdGxldCBkaWRSZXNvbHZlID0gZmFsc2U7XG5cdFx0Y29uc3Qgb25EaWRSZXNvbHZlID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZFJlc29sdmUoKHsgbW9kZWwgfSkgPT4ge1xuXHRcdFx0XHRpZiAobW9kZWw/LnJlc291cmNlLnRvU3RyaW5nKCkgPT09IHJlc291cmNlLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0XHRkaWRSZXNvbHZlID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9KTtcblxuXHRcdGFjY2Vzc29yLmZpbGVTZXJ2aWNlLmZpcmVGaWxlQ2hhbmdlcyhuZXcgRmlsZUNoYW5nZXNFdmVudChbeyByZXNvdXJjZSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCB9XSwgZmFsc2UpKTtcblxuXHRcdGF3YWl0IG9uRGlkUmVzb2x2ZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWRSZXNvbHZlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZmlsZSBjaGFuZ2UgZXZlbnQgdHJpZ2dlcnMgd29ya2luZyBjb3B5IHJlc29sdmUgKHdoZW4gd29ya2luZyBjb3B5IGlzIHBlbmRpbmcgdG8gcmVzb2x2ZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3BhdGgvaW5kZXgudHh0Jyk7XG5cblx0XHRtYW5hZ2VyLnJlc29sdmUocmVzb3VyY2UpO1xuXG5cdFx0bGV0IGRpZFJlc29sdmUgPSBmYWxzZTtcblx0XHRsZXQgcmVzb2x2ZWRDb3VudGVyID0gMDtcblx0XHRjb25zdCBvbkRpZFJlc29sdmUgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkUmVzb2x2ZSgoeyBtb2RlbCB9KSA9PiB7XG5cdFx0XHRcdGlmIChtb2RlbD8ucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRcdHJlc29sdmVkQ291bnRlcisrO1xuXHRcdFx0XHRcdGlmIChyZXNvbHZlZENvdW50ZXIgPT09IDIpIHtcblx0XHRcdFx0XHRcdGRpZFJlc29sdmUgPSB0cnVlO1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXG5cdFx0YWNjZXNzb3IuZmlsZVNlcnZpY2UuZmlyZUZpbGVDaGFuZ2VzKG5ldyBGaWxlQ2hhbmdlc0V2ZW50KFt7IHJlc291cmNlLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEIH1dLCBmYWxzZSkpO1xuXG5cdFx0YXdhaXQgb25EaWRSZXNvbHZlO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZFJlc29sdmUsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaWxlIHN5c3RlbSBwcm92aWRlciBjaGFuZ2UgdHJpZ2dlcnMgd29ya2luZyBjb3B5IHJlc29sdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3BhdGgvaW5kZXgudHh0Jyk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoYXdhaXQgbWFuYWdlci5yZXNvbHZlKHJlc291cmNlKSk7XG5cblx0XHRsZXQgZGlkUmVzb2x2ZSA9IGZhbHNlO1xuXHRcdGNvbnN0IG9uRGlkUmVzb2x2ZSA9IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRSZXNvbHZlKCh7IG1vZGVsIH0pID0+IHtcblx0XHRcdFx0aWYgKG1vZGVsPy5yZXNvdXJjZS50b1N0cmluZygpID09PSByZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHRcdFx0ZGlkUmVzb2x2ZSA9IHRydWU7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cblx0XHRhY2Nlc3Nvci5maWxlU2VydmljZS5maXJlRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzQ2hhbmdlRXZlbnQoeyBwcm92aWRlcjogZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSwgc2NoZW1lOiByZXNvdXJjZS5zY2hlbWUgfSk7XG5cblx0XHRhd2FpdCBvbkRpZFJlc29sdmU7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlkUmVzb2x2ZSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dvcmtpbmcgY29weSBmaWxlIGV2ZW50IGhhbmRsaW5nOiBjcmVhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3BhdGgvc291cmNlLnR4dCcpO1xuXG5cdFx0Y29uc3Qgd29ya2luZ0NvcHkgPSBhd2FpdCBtYW5hZ2VyLnJlc29sdmUocmVzb3VyY2UpO1xuXHRcdHdvcmtpbmdDb3B5Lm1vZGVsPy51cGRhdGVDb250ZW50cygnaGVsbG8gY3JlYXRlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5LmlzRGlydHkoKSwgdHJ1ZSk7XG5cblx0XHRhd2FpdCBhY2Nlc3Nvci53b3JraW5nQ29weUZpbGVTZXJ2aWNlLmNyZWF0ZShbeyByZXNvdXJjZSB9XSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5LmlzRGlydHkoKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCd3b3JraW5nIGNvcHkgZmlsZSBldmVudCBoYW5kbGluZzogbW92ZScsICgpID0+IHtcblx0XHRyZXR1cm4gdGVzdE1vdmVDb3B5RmlsZVdvcmtpbmdDb3B5KHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCd3b3JraW5nIGNvcHkgZmlsZSBldmVudCBoYW5kbGluZzogY29weScsICgpID0+IHtcblx0XHRyZXR1cm4gdGVzdE1vdmVDb3B5RmlsZVdvcmtpbmdDb3B5KGZhbHNlKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdE1vdmVDb3B5RmlsZVdvcmtpbmdDb3B5KG1vdmU6IGJvb2xlYW4pIHtcblx0XHRjb25zdCBzb3VyY2UgPSBVUkkuZmlsZSgnL3BhdGgvc291cmNlLnR4dCcpO1xuXHRcdGNvbnN0IHRhcmdldCA9IFVSSS5maWxlKCcvcGF0aC9vdGhlci50eHQnKTtcblxuXHRcdGNvbnN0IHNvdXJjZVdvcmtpbmdDb3B5ID0gYXdhaXQgbWFuYWdlci5yZXNvbHZlKHNvdXJjZSk7XG5cdFx0c291cmNlV29ya2luZ0NvcHkubW9kZWw/LnVwZGF0ZUNvbnRlbnRzKCdoZWxsbyBtb3ZlIG9yIGNvcHknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc291cmNlV29ya2luZ0NvcHkuaXNEaXJ0eSgpLCB0cnVlKTtcblxuXHRcdGlmIChtb3ZlKSB7XG5cdFx0XHRhd2FpdCBhY2Nlc3Nvci53b3JraW5nQ29weUZpbGVTZXJ2aWNlLm1vdmUoW3sgZmlsZTogeyBzb3VyY2UsIHRhcmdldCB9IH1dLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgYWNjZXNzb3Iud29ya2luZ0NvcHlGaWxlU2VydmljZS5jb3B5KFt7IGZpbGU6IHsgc291cmNlLCB0YXJnZXQgfSB9XSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0V29ya2luZ0NvcHkgPSBhd2FpdCBtYW5hZ2VyLnJlc29sdmUodGFyZ2V0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0V29ya2luZ0NvcHkuaXNEaXJ0eSgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0V29ya2luZ0NvcHkubW9kZWw/LmNvbnRlbnRzLCAnaGVsbG8gbW92ZSBvciBjb3B5Jyk7XG5cdH1cblxuXHR0ZXN0KCd3b3JraW5nIGNvcHkgZmlsZSBldmVudCBoYW5kbGluZzogZGVsZXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy9wYXRoL3NvdXJjZS50eHQnKTtcblxuXHRcdGNvbnN0IHdvcmtpbmdDb3B5ID0gYXdhaXQgbWFuYWdlci5yZXNvbHZlKHJlc291cmNlKTtcblx0XHR3b3JraW5nQ29weS5tb2RlbD8udXBkYXRlQ29udGVudHMoJ2hlbGxvIGRlbGV0ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5pc0RpcnR5KCksIHRydWUpO1xuXG5cdFx0YXdhaXQgYWNjZXNzb3Iud29ya2luZ0NvcHlGaWxlU2VydmljZS5kZWxldGUoW3sgcmVzb3VyY2UgfV0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5pc0RpcnR5KCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnd29ya2luZyBjb3B5IGZpbGUgZXZlbnQgaGFuZGxpbmc6IG1vdmUgdG8gc2FtZSByZXNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzb3VyY2UgPSBVUkkuZmlsZSgnL3BhdGgvc291cmNlLnR4dCcpO1xuXG5cdFx0Y29uc3Qgc291cmNlV29ya2luZ0NvcHkgPSBhd2FpdCBtYW5hZ2VyLnJlc29sdmUoc291cmNlKTtcblx0XHRzb3VyY2VXb3JraW5nQ29weS5tb2RlbD8udXBkYXRlQ29udGVudHMoJ2hlbGxvIG1vdmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc291cmNlV29ya2luZ0NvcHkuaXNEaXJ0eSgpLCB0cnVlKTtcblxuXHRcdGF3YWl0IGFjY2Vzc29yLndvcmtpbmdDb3B5RmlsZVNlcnZpY2UubW92ZShbeyBmaWxlOiB7IHNvdXJjZSwgdGFyZ2V0OiBzb3VyY2UgfSB9XSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc291cmNlV29ya2luZ0NvcHkuaXNEaXJ0eSgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc291cmNlV29ya2luZ0NvcHkubW9kZWw/LmNvbnRlbnRzLCAnaGVsbG8gbW92ZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5EaXNwb3NlIHdpdGggZGlydHkgd29ya2luZyBjb3B5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy9wYXRoL2luZGV4X3NvbWV0aGluZy50eHQnKTtcblxuXHRcdGNvbnN0IHdvcmtpbmdDb3B5ID0gYXdhaXQgbWFuYWdlci5yZXNvbHZlKHJlc291cmNlKTtcblx0XHR3b3JraW5nQ29weS5tb2RlbD8udXBkYXRlQ29udGVudHMoJ21ha2UgZGlydHknKTtcblxuXHRcdGNvbnN0IGNhbkRpc3Bvc2VQcm9taXNlID0gbWFuYWdlci5jYW5EaXNwb3NlKHdvcmtpbmdDb3B5KTtcblx0XHRhc3NlcnQub2soY2FuRGlzcG9zZVByb21pc2UgaW5zdGFuY2VvZiBQcm9taXNlKTtcblxuXHRcdGxldCBjYW5EaXNwb3NlID0gZmFsc2U7XG5cdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdGNhbkRpc3Bvc2UgPSBhd2FpdCBjYW5EaXNwb3NlUHJvbWlzZTtcblx0XHR9KSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbkRpc3Bvc2UsIGZhbHNlKTtcblx0XHR3b3JraW5nQ29weS5yZXZlcnQoeyBzb2Z0OiB0cnVlIH0pO1xuXG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYW5EaXNwb3NlLCB0cnVlKTtcblxuXHRcdGNvbnN0IGNhbkRpc3Bvc2UyID0gbWFuYWdlci5jYW5EaXNwb3NlKHdvcmtpbmdDb3B5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FuRGlzcG9zZTIsIHRydWUpO1xuXHR9KTtcblxuXHQoaXNXZWIgPyB0ZXN0LnNraXAgOiB0ZXN0KSgncGVuZGluZyBzYXZlcyBqb2luIG9uIHNodXRkb3duJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlMSA9IFVSSS5maWxlKCcvcGF0aC9pbmRleF9zb21ldGhpbmcxLnR4dCcpO1xuXHRcdGNvbnN0IHJlc291cmNlMiA9IFVSSS5maWxlKCcvcGF0aC9pbmRleF9zb21ldGhpbmcyLnR4dCcpO1xuXG5cdFx0Y29uc3Qgd29ya2luZ0NvcHkxID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IG1hbmFnZXIucmVzb2x2ZShyZXNvdXJjZTEpKTtcblx0XHR3b3JraW5nQ29weTEubW9kZWw/LnVwZGF0ZUNvbnRlbnRzKCdtYWtlIGRpcnR5Jyk7XG5cblx0XHRjb25zdCB3b3JraW5nQ29weTIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgbWFuYWdlci5yZXNvbHZlKHJlc291cmNlMikpO1xuXHRcdHdvcmtpbmdDb3B5Mi5tb2RlbD8udXBkYXRlQ29udGVudHMoJ21ha2UgZGlydHknKTtcblxuXHRcdGxldCBzYXZlZDEgPSBmYWxzZTtcblx0XHR3b3JraW5nQ29weTEuc2F2ZSgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0c2F2ZWQxID0gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdGxldCBzYXZlZDIgPSBmYWxzZTtcblx0XHR3b3JraW5nQ29weTIuc2F2ZSgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0c2F2ZWQyID0gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGV2ZW50ID0gbmV3IFRlc3RXaWxsU2h1dGRvd25FdmVudCgpO1xuXHRcdGFjY2Vzc29yLmxpZmVjeWNsZVNlcnZpY2UuZmlyZVdpbGxTaHV0ZG93bihldmVudCk7XG5cblx0XHRhc3NlcnQub2soZXZlbnQudmFsdWUubGVuZ3RoID4gMCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoZXZlbnQudmFsdWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhdmVkMSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhdmVkMiwgdHJ1ZSk7XG5cdH0pO1xuXG5cdGVuc3Vy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QUFPLFlBQVksa0JBQWtCLFFBQVEsR0FBRyxJQUFJO0FBQ3BELFdBQU8sWUFBWSxrQkFBa0IsT0FBTyxVQUFVLFlBQVk7QUFBQSxFQUNuRSxDQUFDO0FBRUQsT0FBSyxzQ0FBc0MsWUFBWTtBQUN0RCxVQUFNLFdBQVcsSUFBSSxLQUFLLDJCQUEyQjtBQUVyRCxVQUFNLGNBQWMsTUFBTSxRQUFRLFFBQVEsUUFBUTtBQUNsRCxnQkFBWSxPQUFPLGVBQWUsWUFBWTtBQUU5QyxVQUFNLG9CQUFvQixRQUFRLFdBQVcsV0FBVztBQUN4RCxXQUFPLEdBQUcsNkJBQTZCLE9BQU87QUFFOUMsUUFBSSxhQUFhO0FBQ2pCLEtBQUMsWUFBWTtBQUNaLG1CQUFhLE1BQU07QUFBQSxJQUNwQixHQUFHO0FBRUgsV0FBTyxZQUFZLFlBQVksS0FBSztBQUNwQyxnQkFBWSxPQUFPLEVBQUUsTUFBTSxLQUFLLENBQUM7QUFFakMsVUFBTSxRQUFRLENBQUM7QUFFZixXQUFPLFlBQVksWUFBWSxJQUFJO0FBRW5DLFVBQU0sY0FBYyxRQUFRLFdBQVcsV0FBVztBQUNsRCxXQUFPLFlBQVksYUFBYSxJQUFJO0FBQUEsRUFDckMsQ0FBQztBQUVELEdBQUMsUUFBUSxLQUFLLE9BQU8sTUFBTSxrQ0FBa0MsWUFBWTtBQUN4RSxVQUFNLFlBQVksSUFBSSxLQUFLLDRCQUE0QjtBQUN2RCxVQUFNLFlBQVksSUFBSSxLQUFLLDRCQUE0QjtBQUV2RCxVQUFNLGVBQWUsWUFBWSxJQUFJLE1BQU0sUUFBUSxRQUFRLFNBQVMsQ0FBQztBQUNyRSxpQkFBYSxPQUFPLGVBQWUsWUFBWTtBQUUvQyxVQUFNLGVBQWUsWUFBWSxJQUFJLE1BQU0sUUFBUSxRQUFRLFNBQVMsQ0FBQztBQUNyRSxpQkFBYSxPQUFPLGVBQWUsWUFBWTtBQUUvQyxRQUFJLFNBQVM7QUFDYixpQkFBYSxLQUFLLEVBQUUsS0FBSyxNQUFNO0FBQzlCLGVBQVM7QUFBQSxJQUNWLENBQUM7QUFFRCxRQUFJLFNBQVM7QUFDYixpQkFBYSxLQUFLLEVBQUUsS0FBSyxNQUFNO0FBQzlCLGVBQVM7QUFBQSxJQUNWLENBQUM7QUFFRCxVQUFNLFFBQVEsSUFBSSxzQkFBc0I7QUFDeEMsYUFBUyxpQkFBaUIsaUJBQWlCLEtBQUs7QUFFaEQsV0FBTyxHQUFHLE1BQU0sTUFBTSxTQUFTLENBQUM7QUFDaEMsVUFBTSxRQUFRLElBQUksTUFBTSxLQUFLO0FBRTdCLFdBQU8sWUFBWSxRQUFRLElBQUk7QUFDL0IsV0FBTyxZQUFZLFFBQVEsSUFBSTtBQUFBLEVBQ2hDLENBQUM7QUFFRCwwQ0FBd0M7QUFDekMsQ0FBQzsiLAogICJuYW1lcyI6IFsicmVzb2x2ZSJdCn0K
