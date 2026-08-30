import assert from "assert";
import { bufferToStream, VSBuffer } from "../../../../../base/common/buffer.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { FileWorkingCopyManager } from "../../common/fileWorkingCopyManager.js";
import { NO_TYPE_ID, WorkingCopyCapabilities } from "../../common/workingCopy.js";
import { TestStoredFileWorkingCopyModelFactory } from "./storedFileWorkingCopy.test.js";
import { TestUntitledFileWorkingCopyModelFactory } from "./untitledFileWorkingCopy.test.js";
import { TestInMemoryFileSystemProvider, TestServiceAccessor, workbenchInstantiationService } from "../../../../test/browser/workbenchTestServices.js";
suite("UntitledFileWorkingCopyManager", () => {
  const disposables = new DisposableStore();
  let instantiationService;
  let accessor;
  let manager;
  setup(() => {
    instantiationService = workbenchInstantiationService(void 0, disposables);
    accessor = instantiationService.createInstance(TestServiceAccessor);
    disposables.add(accessor.fileService.registerProvider(Schemas.file, disposables.add(new TestInMemoryFileSystemProvider())));
    disposables.add(accessor.fileService.registerProvider(Schemas.vscodeRemote, disposables.add(new TestInMemoryFileSystemProvider())));
    manager = disposables.add(new FileWorkingCopyManager(
      "testUntitledFileWorkingCopyType",
      new TestStoredFileWorkingCopyModelFactory(),
      new TestUntitledFileWorkingCopyModelFactory(),
      accessor.fileService,
      accessor.lifecycleService,
      accessor.labelService,
      accessor.logService,
      accessor.workingCopyFileService,
      accessor.workingCopyBackupService,
      accessor.uriIdentityService,
      accessor.fileDialogService,
      accessor.filesConfigurationService,
      accessor.workingCopyService,
      accessor.notificationService,
      accessor.workingCopyEditorService,
      accessor.editorService,
      accessor.elevatedFileService,
      accessor.pathService,
      accessor.environmentService,
      accessor.dialogService,
      accessor.decorationsService,
      accessor.progressService
    ));
  });
  teardown(() => {
    for (const workingCopy of [...manager.untitled.workingCopies, ...manager.stored.workingCopies]) {
      workingCopy.dispose();
    }
    disposables.clear();
  });
  test("basics", async () => {
    let createCounter = 0;
    disposables.add(manager.untitled.onDidCreate((e) => {
      createCounter++;
    }));
    let disposeCounter = 0;
    disposables.add(manager.untitled.onWillDispose((e) => {
      disposeCounter++;
    }));
    let dirtyCounter = 0;
    disposables.add(manager.untitled.onDidChangeDirty((e) => {
      dirtyCounter++;
    }));
    assert.strictEqual(accessor.workingCopyService.workingCopies.length, 0);
    assert.strictEqual(manager.untitled.workingCopies.length, 0);
    assert.strictEqual(manager.untitled.get(URI.file("/some/invalidPath")), void 0);
    assert.strictEqual(manager.untitled.get(URI.file("/some/invalidPath").with({ scheme: Schemas.untitled })), void 0);
    const workingCopy1 = await manager.untitled.resolve();
    const workingCopy2 = await manager.untitled.resolve();
    assert.strictEqual(workingCopy1.typeId, "testUntitledFileWorkingCopyType");
    assert.strictEqual(workingCopy1.resource.scheme, Schemas.untitled);
    assert.strictEqual(createCounter, 2);
    assert.strictEqual(manager.untitled.get(workingCopy1.resource), workingCopy1);
    assert.strictEqual(manager.untitled.get(workingCopy2.resource), workingCopy2);
    assert.strictEqual(accessor.workingCopyService.workingCopies.length, 2);
    assert.strictEqual(manager.untitled.workingCopies.length, 2);
    assert.notStrictEqual(workingCopy1.resource.toString(), workingCopy2.resource.toString());
    for (const workingCopy of [workingCopy1, workingCopy2]) {
      assert.strictEqual(workingCopy.capabilities, WorkingCopyCapabilities.Untitled);
      assert.strictEqual(workingCopy.isDirty(), false);
      assert.strictEqual(workingCopy.isModified(), false);
      assert.ok(workingCopy.model);
    }
    workingCopy1.model?.updateContents("Hello World");
    assert.strictEqual(workingCopy1.isDirty(), true);
    assert.strictEqual(workingCopy1.isModified(), true);
    assert.strictEqual(dirtyCounter, 1);
    workingCopy1.model?.updateContents("");
    assert.strictEqual(workingCopy1.isDirty(), false);
    assert.strictEqual(workingCopy1.isModified(), false);
    assert.strictEqual(dirtyCounter, 2);
    workingCopy2.model?.fireContentChangeEvent({ isInitial: false });
    assert.strictEqual(workingCopy2.isDirty(), true);
    assert.strictEqual(workingCopy2.isModified(), true);
    assert.strictEqual(dirtyCounter, 3);
    workingCopy1.dispose();
    assert.strictEqual(manager.untitled.workingCopies.length, 1);
    assert.strictEqual(manager.untitled.get(workingCopy1.resource), void 0);
    workingCopy2.dispose();
    assert.strictEqual(manager.untitled.workingCopies.length, 0);
    assert.strictEqual(manager.untitled.get(workingCopy2.resource), void 0);
    assert.strictEqual(disposeCounter, 2);
  });
  test("dirty - scratchpads are never dirty", async () => {
    let dirtyCounter = 0;
    disposables.add(manager.untitled.onDidChangeDirty((e) => {
      dirtyCounter++;
    }));
    const workingCopy1 = await manager.resolve({
      untitledResource: URI.from({ scheme: Schemas.untitled, path: `/myscratchpad` }),
      isScratchpad: true
    });
    assert.strictEqual(workingCopy1.resource.scheme, Schemas.untitled);
    assert.strictEqual(manager.untitled.workingCopies.length, 1);
    workingCopy1.model?.updateContents("contents");
    assert.strictEqual(workingCopy1.isDirty(), false);
    assert.strictEqual(workingCopy1.isModified(), true);
    workingCopy1.model?.fireContentChangeEvent({ isInitial: true });
    assert.strictEqual(workingCopy1.isDirty(), false);
    assert.strictEqual(workingCopy1.isModified(), false);
    assert.strictEqual(dirtyCounter, 0);
    workingCopy1.dispose();
  });
  test("resolve - with initial value", async () => {
    let dirtyCounter = 0;
    disposables.add(manager.untitled.onDidChangeDirty((e) => {
      dirtyCounter++;
    }));
    const workingCopy1 = await manager.untitled.resolve({ contents: { value: bufferToStream(VSBuffer.fromString("Hello World")) } });
    assert.strictEqual(workingCopy1.isModified(), true);
    assert.strictEqual(workingCopy1.isDirty(), true);
    assert.strictEqual(dirtyCounter, 1);
    assert.strictEqual(workingCopy1.model?.contents, "Hello World");
    workingCopy1.dispose();
    const workingCopy2 = await manager.untitled.resolve({ contents: { value: bufferToStream(VSBuffer.fromString("Hello World")), markModified: true } });
    assert.strictEqual(workingCopy2.isModified(), true);
    assert.strictEqual(workingCopy2.isDirty(), true);
    assert.strictEqual(dirtyCounter, 2);
    assert.strictEqual(workingCopy2.model?.contents, "Hello World");
    workingCopy2.dispose();
  });
  test("resolve - with initial value but markDirty: false", async () => {
    let dirtyCounter = 0;
    disposables.add(manager.untitled.onDidChangeDirty((e) => {
      dirtyCounter++;
    }));
    const workingCopy = await manager.untitled.resolve({ contents: { value: bufferToStream(VSBuffer.fromString("Hello World")), markModified: false } });
    assert.strictEqual(workingCopy.isModified(), false);
    assert.strictEqual(workingCopy.isDirty(), false);
    assert.strictEqual(dirtyCounter, 0);
    assert.strictEqual(workingCopy.model?.contents, "Hello World");
    workingCopy.dispose();
  });
  test("resolve begins counter from 1 for disposed untitled", async () => {
    const untitled1 = await manager.untitled.resolve();
    untitled1.dispose();
    const untitled1Again = disposables.add(await manager.untitled.resolve());
    assert.strictEqual(untitled1.resource.toString(), untitled1Again.resource.toString());
  });
  test("resolve - existing", async () => {
    let createCounter = 0;
    disposables.add(manager.untitled.onDidCreate((e) => {
      createCounter++;
    }));
    const workingCopy1 = await manager.untitled.resolve();
    assert.strictEqual(createCounter, 1);
    const workingCopy2 = await manager.untitled.resolve({ untitledResource: workingCopy1.resource });
    assert.strictEqual(workingCopy1, workingCopy2);
    assert.strictEqual(createCounter, 1);
    const workingCopy3 = await manager.untitled.resolve({ untitledResource: URI.file("/invalid/untitled") });
    assert.strictEqual(workingCopy3.resource.scheme, Schemas.untitled);
    workingCopy1.dispose();
    workingCopy2.dispose();
    workingCopy3.dispose();
  });
  test("resolve - untitled resource used for new working copy", async () => {
    const invalidUntitledResource = URI.file("my/untitled.txt");
    const validUntitledResource = invalidUntitledResource.with({ scheme: Schemas.untitled });
    const workingCopy1 = await manager.untitled.resolve({ untitledResource: invalidUntitledResource });
    assert.notStrictEqual(workingCopy1.resource.toString(), invalidUntitledResource.toString());
    const workingCopy2 = await manager.untitled.resolve({ untitledResource: validUntitledResource });
    assert.strictEqual(workingCopy2.resource.toString(), validUntitledResource.toString());
    workingCopy1.dispose();
    workingCopy2.dispose();
  });
  test("resolve - with associated resource", async () => {
    const workingCopy = await manager.untitled.resolve({ associatedResource: { path: "/some/associated.txt" } });
    assert.strictEqual(workingCopy.hasAssociatedFilePath, true);
    assert.strictEqual(workingCopy.resource.path, "/some/associated.txt");
    workingCopy.dispose();
  });
  test("save - without associated resource", async () => {
    let savedEvent = void 0;
    disposables.add(manager.untitled.onDidSave((e) => {
      savedEvent = e;
    }));
    const workingCopy = await manager.untitled.resolve();
    workingCopy.model?.updateContents("Simple Save");
    accessor.fileDialogService.setPickFileToSave(URI.file("simple/file.txt"));
    const result = await workingCopy.save();
    assert.ok(result);
    assert.strictEqual(manager.untitled.get(workingCopy.resource), void 0);
    assert.strictEqual(savedEvent.source.toString(), workingCopy.resource.toString());
    assert.strictEqual(savedEvent.target.toString(), URI.file("simple/file.txt").toString());
    workingCopy.dispose();
  });
  test("save - with associated resource", async () => {
    let savedEvent = void 0;
    disposables.add(manager.untitled.onDidSave((e) => {
      savedEvent = e;
    }));
    const workingCopy = await manager.untitled.resolve({ associatedResource: { path: "/some/associated.txt" } });
    workingCopy.model?.updateContents("Simple Save with associated resource");
    accessor.fileService.notExistsSet.set(URI.from({ scheme: Schemas.file, path: "/some/associated.txt" }), true);
    const result = await workingCopy.save();
    assert.ok(result);
    assert.strictEqual(manager.untitled.get(workingCopy.resource), void 0);
    assert.strictEqual(savedEvent.source.toString(), workingCopy.resource.toString());
    assert.strictEqual(savedEvent.target.toString(), URI.file("/some/associated.txt").toString());
    workingCopy.dispose();
  });
  test("save - with associated resource (asks to overwrite)", async () => {
    const workingCopy = await manager.untitled.resolve({ associatedResource: { path: "/some/associated.txt" } });
    workingCopy.model?.updateContents("Simple Save with associated resource");
    let result = await workingCopy.save();
    assert.ok(!result);
    assert.strictEqual(manager.untitled.get(workingCopy.resource), workingCopy);
    accessor.dialogService.setConfirmResult({ confirmed: true });
    result = await workingCopy.save();
    assert.ok(result);
    assert.strictEqual(manager.untitled.get(workingCopy.resource), void 0);
    workingCopy.dispose();
  });
  test("destroy", async () => {
    assert.strictEqual(accessor.workingCopyService.workingCopies.length, 0);
    await manager.untitled.resolve();
    await manager.untitled.resolve();
    await manager.untitled.resolve();
    assert.strictEqual(accessor.workingCopyService.workingCopies.length, 3);
    assert.strictEqual(manager.untitled.workingCopies.length, 3);
    await manager.untitled.destroy();
    assert.strictEqual(accessor.workingCopyService.workingCopies.length, 0);
    assert.strictEqual(manager.untitled.workingCopies.length, 0);
  });
  test("manager with different types produce different URIs", async () => {
    try {
      manager = disposables.add(new FileWorkingCopyManager(
        "someOtherUntitledTypeId",
        new TestStoredFileWorkingCopyModelFactory(),
        new TestUntitledFileWorkingCopyModelFactory(),
        accessor.fileService,
        accessor.lifecycleService,
        accessor.labelService,
        accessor.logService,
        accessor.workingCopyFileService,
        accessor.workingCopyBackupService,
        accessor.uriIdentityService,
        accessor.fileDialogService,
        accessor.filesConfigurationService,
        accessor.workingCopyService,
        accessor.notificationService,
        accessor.workingCopyEditorService,
        accessor.editorService,
        accessor.elevatedFileService,
        accessor.pathService,
        accessor.environmentService,
        accessor.dialogService,
        accessor.decorationsService,
        accessor.progressService
      ));
      const untitled1OriginalType = disposables.add(await manager.untitled.resolve());
      const untitled1OtherType = disposables.add(await manager.untitled.resolve());
      assert.notStrictEqual(untitled1OriginalType.resource.toString(), untitled1OtherType.resource.toString());
    } finally {
      manager.destroy();
    }
  });
  test("manager without typeId produces backwards compatible URIs", async () => {
    try {
      manager = disposables.add(new FileWorkingCopyManager(
        NO_TYPE_ID,
        new TestStoredFileWorkingCopyModelFactory(),
        new TestUntitledFileWorkingCopyModelFactory(),
        accessor.fileService,
        accessor.lifecycleService,
        accessor.labelService,
        accessor.logService,
        accessor.workingCopyFileService,
        accessor.workingCopyBackupService,
        accessor.uriIdentityService,
        accessor.fileDialogService,
        accessor.filesConfigurationService,
        accessor.workingCopyService,
        accessor.notificationService,
        accessor.workingCopyEditorService,
        accessor.editorService,
        accessor.elevatedFileService,
        accessor.pathService,
        accessor.environmentService,
        accessor.dialogService,
        accessor.decorationsService,
        accessor.progressService
      ));
      const result = disposables.add(await manager.untitled.resolve());
      assert.strictEqual(result.resource.scheme, Schemas.untitled);
      assert.ok(result.resource.path.length > 0);
      assert.strictEqual(result.resource.query, "");
      assert.strictEqual(result.resource.authority, "");
      assert.strictEqual(result.resource.fragment, "");
    } finally {
      manager.destroy();
    }
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx3b3JraW5nQ29weVxcdGVzdFxcYnJvd3NlclxcdW50aXRsZWRGaWxlV29ya2luZ0NvcHlNYW5hZ2VyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBidWZmZXJUb1N0cmVhbSwgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgRmlsZVdvcmtpbmdDb3B5TWFuYWdlciwgSUZpbGVXb3JraW5nQ29weU1hbmFnZXIgfSBmcm9tICcuLi8uLi9jb21tb24vZmlsZVdvcmtpbmdDb3B5TWFuYWdlci5qcyc7XG5pbXBvcnQgeyBOT19UWVBFX0lELCBXb3JraW5nQ29weUNhcGFiaWxpdGllcyB9IGZyb20gJy4uLy4uL2NvbW1vbi93b3JraW5nQ29weS5qcyc7XG5pbXBvcnQgeyBUZXN0U3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWwsIFRlc3RTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbEZhY3RvcnkgfSBmcm9tICcuL3N0b3JlZEZpbGVXb3JraW5nQ29weS50ZXN0LmpzJztcbmltcG9ydCB7IFRlc3RVbnRpdGxlZEZpbGVXb3JraW5nQ29weU1vZGVsLCBUZXN0VW50aXRsZWRGaWxlV29ya2luZ0NvcHlNb2RlbEZhY3RvcnkgfSBmcm9tICcuL3VudGl0bGVkRmlsZVdvcmtpbmdDb3B5LnRlc3QuanMnO1xuaW1wb3J0IHsgVGVzdEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyLCBUZXN0U2VydmljZUFjY2Vzc29yLCB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuXG5zdWl0ZSgnVW50aXRsZWRGaWxlV29ya2luZ0NvcHlNYW5hZ2VyJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGFjY2Vzc29yOiBUZXN0U2VydmljZUFjY2Vzc29yO1xuXG5cdGxldCBtYW5hZ2VyOiBJRmlsZVdvcmtpbmdDb3B5TWFuYWdlcjxUZXN0U3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWwsIFRlc3RVbnRpdGxlZEZpbGVXb3JraW5nQ29weU1vZGVsPjtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHRhY2Nlc3NvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTZXJ2aWNlQWNjZXNzb3IpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjY2Vzc29yLmZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5maWxlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhY2Nlc3Nvci5maWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMudnNjb2RlUmVtb3RlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXG5cdFx0bWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVdvcmtpbmdDb3B5TWFuYWdlcihcblx0XHRcdCd0ZXN0VW50aXRsZWRGaWxlV29ya2luZ0NvcHlUeXBlJyxcblx0XHRcdG5ldyBUZXN0U3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWxGYWN0b3J5KCksXG5cdFx0XHRuZXcgVGVzdFVudGl0bGVkRmlsZVdvcmtpbmdDb3B5TW9kZWxGYWN0b3J5KCksXG5cdFx0XHRhY2Nlc3Nvci5maWxlU2VydmljZSwgYWNjZXNzb3IubGlmZWN5Y2xlU2VydmljZSwgYWNjZXNzb3IubGFiZWxTZXJ2aWNlLCBhY2Nlc3Nvci5sb2dTZXJ2aWNlLFxuXHRcdFx0YWNjZXNzb3Iud29ya2luZ0NvcHlGaWxlU2VydmljZSwgYWNjZXNzb3Iud29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLCBhY2Nlc3Nvci51cmlJZGVudGl0eVNlcnZpY2UsIGFjY2Vzc29yLmZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdFx0YWNjZXNzb3IuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZSwgYWNjZXNzb3Iud29ya2luZ0NvcHlTZXJ2aWNlLCBhY2Nlc3Nvci5ub3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdFx0YWNjZXNzb3Iud29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlLCBhY2Nlc3Nvci5lZGl0b3JTZXJ2aWNlLCBhY2Nlc3Nvci5lbGV2YXRlZEZpbGVTZXJ2aWNlLCBhY2Nlc3Nvci5wYXRoU2VydmljZSxcblx0XHRcdGFjY2Vzc29yLmVudmlyb25tZW50U2VydmljZSwgYWNjZXNzb3IuZGlhbG9nU2VydmljZSwgYWNjZXNzb3IuZGVjb3JhdGlvbnNTZXJ2aWNlLCBhY2Nlc3Nvci5wcm9ncmVzc1NlcnZpY2Vcblx0XHQpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGZvciAoY29uc3Qgd29ya2luZ0NvcHkgb2YgWy4uLm1hbmFnZXIudW50aXRsZWQud29ya2luZ0NvcGllcywgLi4ubWFuYWdlci5zdG9yZWQud29ya2luZ0NvcGllc10pIHtcblx0XHRcdHdvcmtpbmdDb3B5LmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHR0ZXN0KCdiYXNpY3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGNyZWF0ZUNvdW50ZXIgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLnVudGl0bGVkLm9uRGlkQ3JlYXRlKGUgPT4ge1xuXHRcdFx0Y3JlYXRlQ291bnRlcisrO1xuXHRcdH0pKTtcblxuXHRcdGxldCBkaXNwb3NlQ291bnRlciA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIudW50aXRsZWQub25XaWxsRGlzcG9zZShlID0+IHtcblx0XHRcdGRpc3Bvc2VDb3VudGVyKys7XG5cdFx0fSkpO1xuXG5cdFx0bGV0IGRpcnR5Q291bnRlciA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIudW50aXRsZWQub25EaWRDaGFuZ2VEaXJ0eShlID0+IHtcblx0XHRcdGRpcnR5Q291bnRlcisrO1xuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2Uud29ya2luZ0NvcGllcy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLnVudGl0bGVkLndvcmtpbmdDb3BpZXMubGVuZ3RoLCAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLnVudGl0bGVkLmdldChVUkkuZmlsZSgnL3NvbWUvaW52YWxpZFBhdGgnKSksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIudW50aXRsZWQuZ2V0KFVSSS5maWxlKCcvc29tZS9pbnZhbGlkUGF0aCcpLndpdGgoeyBzY2hlbWU6IFNjaGVtYXMudW50aXRsZWQgfSkpLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3Qgd29ya2luZ0NvcHkxID0gYXdhaXQgbWFuYWdlci51bnRpdGxlZC5yZXNvbHZlKCk7XG5cdFx0Y29uc3Qgd29ya2luZ0NvcHkyID0gYXdhaXQgbWFuYWdlci51bnRpdGxlZC5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkxLnR5cGVJZCwgJ3Rlc3RVbnRpdGxlZEZpbGVXb3JraW5nQ29weVR5cGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkxLnJlc291cmNlLnNjaGVtZSwgU2NoZW1hcy51bnRpdGxlZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlQ291bnRlciwgMik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci51bnRpdGxlZC5nZXQod29ya2luZ0NvcHkxLnJlc291cmNlKSwgd29ya2luZ0NvcHkxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci51bnRpdGxlZC5nZXQod29ya2luZ0NvcHkyLnJlc291cmNlKSwgd29ya2luZ0NvcHkyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2Uud29ya2luZ0NvcGllcy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLnVudGl0bGVkLndvcmtpbmdDb3BpZXMubGVuZ3RoLCAyKTtcblxuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh3b3JraW5nQ29weTEucmVzb3VyY2UudG9TdHJpbmcoKSwgd29ya2luZ0NvcHkyLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXG5cdFx0Zm9yIChjb25zdCB3b3JraW5nQ29weSBvZiBbd29ya2luZ0NvcHkxLCB3b3JraW5nQ29weTJdKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuY2FwYWJpbGl0aWVzLCBXb3JraW5nQ29weUNhcGFiaWxpdGllcy5VbnRpdGxlZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaXNEaXJ0eSgpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaXNNb2RpZmllZCgpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQub2sod29ya2luZ0NvcHkubW9kZWwpO1xuXHRcdH1cblxuXHRcdHdvcmtpbmdDb3B5MS5tb2RlbD8udXBkYXRlQ29udGVudHMoJ0hlbGxvIFdvcmxkJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkxLmlzRGlydHkoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5MS5pc01vZGlmaWVkKCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXJ0eUNvdW50ZXIsIDEpO1xuXG5cdFx0d29ya2luZ0NvcHkxLm1vZGVsPy51cGRhdGVDb250ZW50cygnJyk7IC8vIGNoYW5nZSB0byBlbXB0eSBjbGVhcnMgZGlydHkvbW9kaWZpZWQgZmxhZ3Ncblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkxLmlzRGlydHkoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weTEuaXNNb2RpZmllZCgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpcnR5Q291bnRlciwgMik7XG5cblx0XHR3b3JraW5nQ29weTIubW9kZWw/LmZpcmVDb250ZW50Q2hhbmdlRXZlbnQoeyBpc0luaXRpYWw6IGZhbHNlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weTIuaXNEaXJ0eSgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkyLmlzTW9kaWZpZWQoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpcnR5Q291bnRlciwgMyk7XG5cblx0XHR3b3JraW5nQ29weTEuZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIudW50aXRsZWQud29ya2luZ0NvcGllcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLnVudGl0bGVkLmdldCh3b3JraW5nQ29weTEucmVzb3VyY2UpLCB1bmRlZmluZWQpO1xuXG5cdFx0d29ya2luZ0NvcHkyLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLnVudGl0bGVkLndvcmtpbmdDb3BpZXMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci51bnRpdGxlZC5nZXQod29ya2luZ0NvcHkyLnJlc291cmNlKSwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlQ291bnRlciwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2RpcnR5IC0gc2NyYXRjaHBhZHMgYXJlIG5ldmVyIGRpcnR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBkaXJ0eUNvdW50ZXIgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLnVudGl0bGVkLm9uRGlkQ2hhbmdlRGlydHkoZSA9PiB7XG5cdFx0XHRkaXJ0eUNvdW50ZXIrKztcblx0XHR9KSk7XG5cblx0XHRjb25zdCB3b3JraW5nQ29weTEgPSBhd2FpdCBtYW5hZ2VyLnJlc29sdmUoe1xuXHRcdFx0dW50aXRsZWRSZXNvdXJjZTogVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMudW50aXRsZWQsIHBhdGg6IGAvbXlzY3JhdGNocGFkYCB9KSxcblx0XHRcdGlzU2NyYXRjaHBhZDogdHJ1ZVxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5MS5yZXNvdXJjZS5zY2hlbWUsIFNjaGVtYXMudW50aXRsZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLnVudGl0bGVkLndvcmtpbmdDb3BpZXMubGVuZ3RoLCAxKTtcblxuXHRcdHdvcmtpbmdDb3B5MS5tb2RlbD8udXBkYXRlQ29udGVudHMoJ2NvbnRlbnRzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5MS5pc0RpcnR5KCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkxLmlzTW9kaWZpZWQoKSwgdHJ1ZSk7XG5cblx0XHR3b3JraW5nQ29weTEubW9kZWw/LmZpcmVDb250ZW50Q2hhbmdlRXZlbnQoeyBpc0luaXRpYWw6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5MS5pc0RpcnR5KCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkxLmlzTW9kaWZpZWQoKSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpcnR5Q291bnRlciwgMCk7XG5cblx0XHR3b3JraW5nQ29weTEuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlIC0gd2l0aCBpbml0aWFsIHZhbHVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBkaXJ0eUNvdW50ZXIgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLnVudGl0bGVkLm9uRGlkQ2hhbmdlRGlydHkoZSA9PiB7XG5cdFx0XHRkaXJ0eUNvdW50ZXIrKztcblx0XHR9KSk7XG5cblx0XHRjb25zdCB3b3JraW5nQ29weTEgPSBhd2FpdCBtYW5hZ2VyLnVudGl0bGVkLnJlc29sdmUoeyBjb250ZW50czogeyB2YWx1ZTogYnVmZmVyVG9TdHJlYW0oVlNCdWZmZXIuZnJvbVN0cmluZygnSGVsbG8gV29ybGQnKSkgfSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weTEuaXNNb2RpZmllZCgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkxLmlzRGlydHkoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpcnR5Q291bnRlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5MS5tb2RlbD8uY29udGVudHMsICdIZWxsbyBXb3JsZCcpO1xuXG5cdFx0d29ya2luZ0NvcHkxLmRpc3Bvc2UoKTtcblxuXHRcdGNvbnN0IHdvcmtpbmdDb3B5MiA9IGF3YWl0IG1hbmFnZXIudW50aXRsZWQucmVzb2x2ZSh7IGNvbnRlbnRzOiB7IHZhbHVlOiBidWZmZXJUb1N0cmVhbShWU0J1ZmZlci5mcm9tU3RyaW5nKCdIZWxsbyBXb3JsZCcpKSwgbWFya01vZGlmaWVkOiB0cnVlIH0gfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkyLmlzTW9kaWZpZWQoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5Mi5pc0RpcnR5KCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXJ0eUNvdW50ZXIsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weTIubW9kZWw/LmNvbnRlbnRzLCAnSGVsbG8gV29ybGQnKTtcblxuXHRcdHdvcmtpbmdDb3B5Mi5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmUgLSB3aXRoIGluaXRpYWwgdmFsdWUgYnV0IG1hcmtEaXJ0eTogZmFsc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGRpcnR5Q291bnRlciA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIudW50aXRsZWQub25EaWRDaGFuZ2VEaXJ0eShlID0+IHtcblx0XHRcdGRpcnR5Q291bnRlcisrO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHdvcmtpbmdDb3B5ID0gYXdhaXQgbWFuYWdlci51bnRpdGxlZC5yZXNvbHZlKHsgY29udGVudHM6IHsgdmFsdWU6IGJ1ZmZlclRvU3RyZWFtKFZTQnVmZmVyLmZyb21TdHJpbmcoJ0hlbGxvIFdvcmxkJykpLCBtYXJrTW9kaWZpZWQ6IGZhbHNlIH0gfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaXNNb2RpZmllZCgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5LmlzRGlydHkoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXJ0eUNvdW50ZXIsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weS5tb2RlbD8uY29udGVudHMsICdIZWxsbyBXb3JsZCcpO1xuXG5cdFx0d29ya2luZ0NvcHkuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlIGJlZ2lucyBjb3VudGVyIGZyb20gMSBmb3IgZGlzcG9zZWQgdW50aXRsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdW50aXRsZWQxID0gYXdhaXQgbWFuYWdlci51bnRpdGxlZC5yZXNvbHZlKCk7XG5cdFx0dW50aXRsZWQxLmRpc3Bvc2UoKTtcblxuXHRcdGNvbnN0IHVudGl0bGVkMUFnYWluID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IG1hbmFnZXIudW50aXRsZWQucmVzb2x2ZSgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW50aXRsZWQxLnJlc291cmNlLnRvU3RyaW5nKCksIHVudGl0bGVkMUFnYWluLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlIC0gZXhpc3RpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGNyZWF0ZUNvdW50ZXIgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLnVudGl0bGVkLm9uRGlkQ3JlYXRlKGUgPT4ge1xuXHRcdFx0Y3JlYXRlQ291bnRlcisrO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHdvcmtpbmdDb3B5MSA9IGF3YWl0IG1hbmFnZXIudW50aXRsZWQucmVzb2x2ZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVDb3VudGVyLCAxKTtcblxuXHRcdGNvbnN0IHdvcmtpbmdDb3B5MiA9IGF3YWl0IG1hbmFnZXIudW50aXRsZWQucmVzb2x2ZSh7IHVudGl0bGVkUmVzb3VyY2U6IHdvcmtpbmdDb3B5MS5yZXNvdXJjZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkxLCB3b3JraW5nQ29weTIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVDb3VudGVyLCAxKTtcblxuXHRcdGNvbnN0IHdvcmtpbmdDb3B5MyA9IGF3YWl0IG1hbmFnZXIudW50aXRsZWQucmVzb2x2ZSh7IHVudGl0bGVkUmVzb3VyY2U6IFVSSS5maWxlKCcvaW52YWxpZC91bnRpdGxlZCcpIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weTMucmVzb3VyY2Uuc2NoZW1lLCBTY2hlbWFzLnVudGl0bGVkKTtcblxuXHRcdHdvcmtpbmdDb3B5MS5kaXNwb3NlKCk7XG5cdFx0d29ya2luZ0NvcHkyLmRpc3Bvc2UoKTtcblx0XHR3b3JraW5nQ29weTMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlIC0gdW50aXRsZWQgcmVzb3VyY2UgdXNlZCBmb3IgbmV3IHdvcmtpbmcgY29weScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbnZhbGlkVW50aXRsZWRSZXNvdXJjZSA9IFVSSS5maWxlKCdteS91bnRpdGxlZC50eHQnKTtcblx0XHRjb25zdCB2YWxpZFVudGl0bGVkUmVzb3VyY2UgPSBpbnZhbGlkVW50aXRsZWRSZXNvdXJjZS53aXRoKHsgc2NoZW1lOiBTY2hlbWFzLnVudGl0bGVkIH0pO1xuXG5cdFx0Y29uc3Qgd29ya2luZ0NvcHkxID0gYXdhaXQgbWFuYWdlci51bnRpdGxlZC5yZXNvbHZlKHsgdW50aXRsZWRSZXNvdXJjZTogaW52YWxpZFVudGl0bGVkUmVzb3VyY2UgfSk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHdvcmtpbmdDb3B5MS5yZXNvdXJjZS50b1N0cmluZygpLCBpbnZhbGlkVW50aXRsZWRSZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdGNvbnN0IHdvcmtpbmdDb3B5MiA9IGF3YWl0IG1hbmFnZXIudW50aXRsZWQucmVzb2x2ZSh7IHVudGl0bGVkUmVzb3VyY2U6IHZhbGlkVW50aXRsZWRSZXNvdXJjZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkyLnJlc291cmNlLnRvU3RyaW5nKCksIHZhbGlkVW50aXRsZWRSZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdHdvcmtpbmdDb3B5MS5kaXNwb3NlKCk7XG5cdFx0d29ya2luZ0NvcHkyLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZSAtIHdpdGggYXNzb2NpYXRlZCByZXNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3JraW5nQ29weSA9IGF3YWl0IG1hbmFnZXIudW50aXRsZWQucmVzb2x2ZSh7IGFzc29jaWF0ZWRSZXNvdXJjZTogeyBwYXRoOiAnL3NvbWUvYXNzb2NpYXRlZC50eHQnIH0gfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkuaGFzQXNzb2NpYXRlZEZpbGVQYXRoLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHkucmVzb3VyY2UucGF0aCwgJy9zb21lL2Fzc29jaWF0ZWQudHh0Jyk7XG5cblx0XHR3b3JraW5nQ29weS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NhdmUgLSB3aXRob3V0IGFzc29jaWF0ZWQgcmVzb3VyY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHNhdmVkRXZlbnQ6IHsgc291cmNlOiBVUkk7IHRhcmdldDogVVJJIH0gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIudW50aXRsZWQub25EaWRTYXZlKGUgPT4ge1xuXHRcdFx0c2F2ZWRFdmVudCA9IGU7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgd29ya2luZ0NvcHkgPSBhd2FpdCBtYW5hZ2VyLnVudGl0bGVkLnJlc29sdmUoKTtcblx0XHR3b3JraW5nQ29weS5tb2RlbD8udXBkYXRlQ29udGVudHMoJ1NpbXBsZSBTYXZlJyk7XG5cblx0XHRhY2Nlc3Nvci5maWxlRGlhbG9nU2VydmljZS5zZXRQaWNrRmlsZVRvU2F2ZShVUkkuZmlsZSgnc2ltcGxlL2ZpbGUudHh0JykpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgd29ya2luZ0NvcHkuc2F2ZSgpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIudW50aXRsZWQuZ2V0KHdvcmtpbmdDb3B5LnJlc291cmNlKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2F2ZWRFdmVudCEuc291cmNlLnRvU3RyaW5nKCksIHdvcmtpbmdDb3B5LnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYXZlZEV2ZW50IS50YXJnZXQudG9TdHJpbmcoKSwgVVJJLmZpbGUoJ3NpbXBsZS9maWxlLnR4dCcpLnRvU3RyaW5nKCkpO1xuXG5cdFx0d29ya2luZ0NvcHkuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdzYXZlIC0gd2l0aCBhc3NvY2lhdGVkIHJlc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBzYXZlZEV2ZW50OiB7IHNvdXJjZTogVVJJOyB0YXJnZXQ6IFVSSSB9IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLnVudGl0bGVkLm9uRGlkU2F2ZShlID0+IHtcblx0XHRcdHNhdmVkRXZlbnQgPSBlO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHdvcmtpbmdDb3B5ID0gYXdhaXQgbWFuYWdlci51bnRpdGxlZC5yZXNvbHZlKHsgYXNzb2NpYXRlZFJlc291cmNlOiB7IHBhdGg6ICcvc29tZS9hc3NvY2lhdGVkLnR4dCcgfSB9KTtcblx0XHR3b3JraW5nQ29weS5tb2RlbD8udXBkYXRlQ29udGVudHMoJ1NpbXBsZSBTYXZlIHdpdGggYXNzb2NpYXRlZCByZXNvdXJjZScpO1xuXG5cdFx0YWNjZXNzb3IuZmlsZVNlcnZpY2Uubm90RXhpc3RzU2V0LnNldChVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiAnL3NvbWUvYXNzb2NpYXRlZC50eHQnIH0pLCB0cnVlKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHdvcmtpbmdDb3B5LnNhdmUoKTtcblx0XHRhc3NlcnQub2socmVzdWx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLnVudGl0bGVkLmdldCh3b3JraW5nQ29weS5yZXNvdXJjZSksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhdmVkRXZlbnQhLnNvdXJjZS50b1N0cmluZygpLCB3b3JraW5nQ29weS5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2F2ZWRFdmVudCEudGFyZ2V0LnRvU3RyaW5nKCksIFVSSS5maWxlKCcvc29tZS9hc3NvY2lhdGVkLnR4dCcpLnRvU3RyaW5nKCkpO1xuXG5cdFx0d29ya2luZ0NvcHkuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdzYXZlIC0gd2l0aCBhc3NvY2lhdGVkIHJlc291cmNlIChhc2tzIHRvIG92ZXJ3cml0ZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya2luZ0NvcHkgPSBhd2FpdCBtYW5hZ2VyLnVudGl0bGVkLnJlc29sdmUoeyBhc3NvY2lhdGVkUmVzb3VyY2U6IHsgcGF0aDogJy9zb21lL2Fzc29jaWF0ZWQudHh0JyB9IH0pO1xuXHRcdHdvcmtpbmdDb3B5Lm1vZGVsPy51cGRhdGVDb250ZW50cygnU2ltcGxlIFNhdmUgd2l0aCBhc3NvY2lhdGVkIHJlc291cmNlJyk7XG5cblx0XHRsZXQgcmVzdWx0ID0gYXdhaXQgd29ya2luZ0NvcHkuc2F2ZSgpO1xuXHRcdGFzc2VydC5vayghcmVzdWx0KTsgLy8gbm90IGNvbmZpcm1lZFxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIudW50aXRsZWQuZ2V0KHdvcmtpbmdDb3B5LnJlc291cmNlKSwgd29ya2luZ0NvcHkpO1xuXG5cdFx0YWNjZXNzb3IuZGlhbG9nU2VydmljZS5zZXRDb25maXJtUmVzdWx0KHsgY29uZmlybWVkOiB0cnVlIH0pO1xuXG5cdFx0cmVzdWx0ID0gYXdhaXQgd29ya2luZ0NvcHkuc2F2ZSgpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQpOyAvLyBjb25maXJtZWRcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLnVudGl0bGVkLmdldCh3b3JraW5nQ29weS5yZXNvdXJjZSksIHVuZGVmaW5lZCk7XG5cblx0XHR3b3JraW5nQ29weS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rlc3Ryb3knLCBhc3luYyAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS53b3JraW5nQ29waWVzLmxlbmd0aCwgMCk7XG5cblx0XHRhd2FpdCBtYW5hZ2VyLnVudGl0bGVkLnJlc29sdmUoKTtcblx0XHRhd2FpdCBtYW5hZ2VyLnVudGl0bGVkLnJlc29sdmUoKTtcblx0XHRhd2FpdCBtYW5hZ2VyLnVudGl0bGVkLnJlc29sdmUoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2Uud29ya2luZ0NvcGllcy5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLnVudGl0bGVkLndvcmtpbmdDb3BpZXMubGVuZ3RoLCAzKTtcblxuXHRcdGF3YWl0IG1hbmFnZXIudW50aXRsZWQuZGVzdHJveSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS53b3JraW5nQ29waWVzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIudW50aXRsZWQud29ya2luZ0NvcGllcy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdtYW5hZ2VyIHdpdGggZGlmZmVyZW50IHR5cGVzIHByb2R1Y2UgZGlmZmVyZW50IFVSSXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0dHJ5IHtcblx0XHRcdG1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVXb3JraW5nQ29weU1hbmFnZXIoXG5cdFx0XHRcdCdzb21lT3RoZXJVbnRpdGxlZFR5cGVJZCcsXG5cdFx0XHRcdG5ldyBUZXN0U3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWxGYWN0b3J5KCksXG5cdFx0XHRcdG5ldyBUZXN0VW50aXRsZWRGaWxlV29ya2luZ0NvcHlNb2RlbEZhY3RvcnkoKSxcblx0XHRcdFx0YWNjZXNzb3IuZmlsZVNlcnZpY2UsIGFjY2Vzc29yLmxpZmVjeWNsZVNlcnZpY2UsIGFjY2Vzc29yLmxhYmVsU2VydmljZSwgYWNjZXNzb3IubG9nU2VydmljZSxcblx0XHRcdFx0YWNjZXNzb3Iud29ya2luZ0NvcHlGaWxlU2VydmljZSwgYWNjZXNzb3Iud29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLCBhY2Nlc3Nvci51cmlJZGVudGl0eVNlcnZpY2UsIGFjY2Vzc29yLmZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdFx0XHRhY2Nlc3Nvci5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLCBhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2UsIGFjY2Vzc29yLm5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0XHRcdGFjY2Vzc29yLndvcmtpbmdDb3B5RWRpdG9yU2VydmljZSwgYWNjZXNzb3IuZWRpdG9yU2VydmljZSwgYWNjZXNzb3IuZWxldmF0ZWRGaWxlU2VydmljZSwgYWNjZXNzb3IucGF0aFNlcnZpY2UsXG5cdFx0XHRcdGFjY2Vzc29yLmVudmlyb25tZW50U2VydmljZSwgYWNjZXNzb3IuZGlhbG9nU2VydmljZSwgYWNjZXNzb3IuZGVjb3JhdGlvbnNTZXJ2aWNlLCBhY2Nlc3Nvci5wcm9ncmVzc1NlcnZpY2Vcblx0XHRcdCkpO1xuXG5cdFx0XHRjb25zdCB1bnRpdGxlZDFPcmlnaW5hbFR5cGUgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgbWFuYWdlci51bnRpdGxlZC5yZXNvbHZlKCkpO1xuXHRcdFx0Y29uc3QgdW50aXRsZWQxT3RoZXJUeXBlID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IG1hbmFnZXIudW50aXRsZWQucmVzb2x2ZSgpKTtcblxuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHVudGl0bGVkMU9yaWdpbmFsVHlwZS5yZXNvdXJjZS50b1N0cmluZygpLCB1bnRpdGxlZDFPdGhlclR5cGUucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdG1hbmFnZXIuZGVzdHJveSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnbWFuYWdlciB3aXRob3V0IHR5cGVJZCBwcm9kdWNlcyBiYWNrd2FyZHMgY29tcGF0aWJsZSBVUklzJywgYXN5bmMgKCkgPT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRtYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlV29ya2luZ0NvcHlNYW5hZ2VyKFxuXHRcdFx0XHROT19UWVBFX0lELFxuXHRcdFx0XHRuZXcgVGVzdFN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsRmFjdG9yeSgpLFxuXHRcdFx0XHRuZXcgVGVzdFVudGl0bGVkRmlsZVdvcmtpbmdDb3B5TW9kZWxGYWN0b3J5KCksXG5cdFx0XHRcdGFjY2Vzc29yLmZpbGVTZXJ2aWNlLCBhY2Nlc3Nvci5saWZlY3ljbGVTZXJ2aWNlLCBhY2Nlc3Nvci5sYWJlbFNlcnZpY2UsIGFjY2Vzc29yLmxvZ1NlcnZpY2UsXG5cdFx0XHRcdGFjY2Vzc29yLndvcmtpbmdDb3B5RmlsZVNlcnZpY2UsIGFjY2Vzc29yLndvcmtpbmdDb3B5QmFja3VwU2VydmljZSwgYWNjZXNzb3IudXJpSWRlbnRpdHlTZXJ2aWNlLCBhY2Nlc3Nvci5maWxlRGlhbG9nU2VydmljZSxcblx0XHRcdFx0YWNjZXNzb3IuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZSwgYWNjZXNzb3Iud29ya2luZ0NvcHlTZXJ2aWNlLCBhY2Nlc3Nvci5ub3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHRhY2Nlc3Nvci53b3JraW5nQ29weUVkaXRvclNlcnZpY2UsIGFjY2Vzc29yLmVkaXRvclNlcnZpY2UsIGFjY2Vzc29yLmVsZXZhdGVkRmlsZVNlcnZpY2UsIGFjY2Vzc29yLnBhdGhTZXJ2aWNlLFxuXHRcdFx0XHRhY2Nlc3Nvci5lbnZpcm9ubWVudFNlcnZpY2UsIGFjY2Vzc29yLmRpYWxvZ1NlcnZpY2UsIGFjY2Vzc29yLmRlY29yYXRpb25zU2VydmljZSwgYWNjZXNzb3IucHJvZ3Jlc3NTZXJ2aWNlXG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IG1hbmFnZXIudW50aXRsZWQucmVzb2x2ZSgpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucmVzb3VyY2Uuc2NoZW1lLCBTY2hlbWFzLnVudGl0bGVkKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQucmVzb3VyY2UucGF0aC5sZW5ndGggPiAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucmVzb3VyY2UucXVlcnksICcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucmVzb3VyY2UuYXV0aG9yaXR5LCAnJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnJlc291cmNlLmZyYWdtZW50LCAnJyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdG1hbmFnZXIuZGVzdHJveSgpO1xuXHRcdH1cblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdCQUFnQixnQkFBZ0I7QUFDekMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUV4RCxTQUFTLDhCQUF1RDtBQUNoRSxTQUFTLFlBQVksK0JBQStCO0FBQ3BELFNBQXlDLDZDQUE2QztBQUN0RixTQUEyQywrQ0FBK0M7QUFDMUYsU0FBUyxnQ0FBZ0MscUJBQXFCLHFDQUFxQztBQUVuRyxNQUFNLGtDQUFrQyxNQUFNO0FBRTdDLFFBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxNQUFJO0FBQ0osTUFBSTtBQUVKLE1BQUk7QUFFSixRQUFNLE1BQU07QUFDWCwyQkFBdUIsOEJBQThCLFFBQVcsV0FBVztBQUMzRSxlQUFXLHFCQUFxQixlQUFlLG1CQUFtQjtBQUVsRSxnQkFBWSxJQUFJLFNBQVMsWUFBWSxpQkFBaUIsUUFBUSxNQUFNLFlBQVksSUFBSSxJQUFJLCtCQUErQixDQUFDLENBQUMsQ0FBQztBQUMx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
