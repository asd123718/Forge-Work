var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import assert from "assert";
import { URI } from "../../../../../base/common/uri.js";
import { IEditorService } from "../../../editor/common/editorService.js";
import { IEditorGroupsService } from "../../../editor/common/editorGroupsService.js";
import { EditorService } from "../../../editor/browser/editorService.js";
import { IWorkingCopyBackupService } from "../../common/workingCopyBackup.js";
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from "../../../../../base/test/common/utils.js";
import { IFilesConfigurationService } from "../../../filesConfiguration/common/filesConfigurationService.js";
import { IWorkingCopyService } from "../../common/workingCopyService.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { ILifecycleService, LifecyclePhase } from "../../../lifecycle/common/lifecycle.js";
import { UntitledTextEditorInput } from "../../../untitled/common/untitledTextEditorInput.js";
import { createEditorPart, InMemoryTestWorkingCopyBackupService, registerTestResourceEditor, TestServiceAccessor, toTypedWorkingCopyId, toUntypedWorkingCopyId, workbenchInstantiationService, workbenchTeardown } from "../../../../test/browser/workbenchTestServices.js";
import { TestWorkingCopy } from "../../../../test/common/workbenchTestServices.js";
import { timeout } from "../../../../../base/common/async.js";
import { BrowserWorkingCopyBackupTracker } from "../../browser/workingCopyBackupTracker.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { IWorkingCopyEditorService } from "../../common/workingCopyEditorService.js";
import { bufferToReadable, VSBuffer } from "../../../../../base/common/buffer.js";
import { isWindows } from "../../../../../base/common/platform.js";
import { Schemas } from "../../../../../base/common/network.js";
suite("WorkingCopyBackupTracker (browser)", function() {
  let accessor;
  const disposables = new DisposableStore();
  setup(() => {
    disposables.add(registerTestResourceEditor());
  });
  teardown(async () => {
    await workbenchTeardown(accessor.instantiationService);
    disposables.clear();
  });
  let TestWorkingCopyBackupTracker = class extends BrowserWorkingCopyBackupTracker {
    constructor(workingCopyBackupService, filesConfigurationService, workingCopyService, lifecycleService, logService, workingCopyEditorService, editorService) {
      super(workingCopyBackupService, filesConfigurationService, workingCopyService, lifecycleService, logService, workingCopyEditorService, editorService);
    }
    getBackupScheduleDelay() {
      return 10;
    }
    get pendingBackupOperationCount() {
      return this.pendingBackupOperations.size;
    }
    getUnrestoredBackups() {
      return this.unrestoredBackups;
    }
    async testRestoreBackups(handler) {
      return super.restoreBackups(handler);
    }
  };
  TestWorkingCopyBackupTracker = __decorateClass([
    __decorateParam(0, IWorkingCopyBackupService),
    __decorateParam(1, IFilesConfigurationService),
    __decorateParam(2, IWorkingCopyService),
    __decorateParam(3, ILifecycleService),
    __decorateParam(4, ILogService),
    __decorateParam(5, IWorkingCopyEditorService),
    __decorateParam(6, IEditorService)
  ], TestWorkingCopyBackupTracker);
  class TestUntitledTextEditorInput extends UntitledTextEditorInput {
    constructor() {
      super(...arguments);
      this.resolved = false;
    }
    resolve() {
      this.resolved = true;
      return super.resolve();
    }
  }
  async function createTracker() {
    const workingCopyBackupService = disposables.add(new InMemoryTestWorkingCopyBackupService());
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    instantiationService.stub(IWorkingCopyBackupService, workingCopyBackupService);
    const part = await createEditorPart(instantiationService, disposables);
    instantiationService.stub(IEditorGroupsService, part);
    disposables.add(registerTestResourceEditor());
    const editorService = disposables.add(instantiationService.createInstance(EditorService, void 0));
    instantiationService.stub(IEditorService, editorService);
    accessor = instantiationService.createInstance(TestServiceAccessor);
    const tracker = disposables.add(instantiationService.createInstance(TestWorkingCopyBackupTracker));
    return { accessor, part, tracker, workingCopyBackupService, instantiationService };
  }
  async function untitledBackupTest(untitled = { resource: void 0 }) {
    const { accessor: accessor2, workingCopyBackupService } = await createTracker();
    const untitledTextEditor = disposables.add((await accessor2.editorService.openEditor(untitled))?.input);
    const untitledTextModel = disposables.add(await untitledTextEditor.resolve());
    if (!untitled?.contents) {
      untitledTextModel.textEditorModel?.setValue("Super Good");
    }
    await workingCopyBackupService.joinBackupResource();
    assert.strictEqual(workingCopyBackupService.hasBackupSync(untitledTextModel), true);
    untitledTextModel.dispose();
    await workingCopyBackupService.joinDiscardBackup();
    assert.strictEqual(workingCopyBackupService.hasBackupSync(untitledTextModel), false);
  }
  test("Track backups (untitled)", function() {
    return untitledBackupTest();
  });
  test("Track backups (untitled with initial contents)", function() {
    return untitledBackupTest({ resource: void 0, contents: "Foo Bar" });
  });
  test("Track backups (custom)", async function() {
    const { accessor: accessor2, tracker, workingCopyBackupService } = await createTracker();
    class TestBackupWorkingCopy extends TestWorkingCopy {
      constructor(resource2) {
        super(resource2);
        this.backupDelay = 10;
        disposables.add(accessor2.workingCopyService.registerWorkingCopy(this));
      }
      async backup(token) {
        await timeout(0);
        return {};
      }
    }
    const resource = toResource.call(this, "/path/custom.txt");
    const customWorkingCopy = disposables.add(new TestBackupWorkingCopy(resource));
    customWorkingCopy.setDirty(true);
    assert.strictEqual(tracker.pendingBackupOperationCount, 1);
    await workingCopyBackupService.joinBackupResource();
    assert.strictEqual(workingCopyBackupService.hasBackupSync(customWorkingCopy), true);
    customWorkingCopy.setDirty(false);
    customWorkingCopy.setDirty(true);
    assert.strictEqual(tracker.pendingBackupOperationCount, 1);
    await workingCopyBackupService.joinBackupResource();
    assert.strictEqual(workingCopyBackupService.hasBackupSync(customWorkingCopy), true);
    customWorkingCopy.setDirty(false);
    assert.strictEqual(tracker.pendingBackupOperationCount, 1);
    await workingCopyBackupService.joinDiscardBackup();
    assert.strictEqual(workingCopyBackupService.hasBackupSync(customWorkingCopy), false);
    customWorkingCopy.setDirty(true);
    await timeout(0);
    customWorkingCopy.setDirty(false);
    assert.strictEqual(tracker.pendingBackupOperationCount, 1);
    await workingCopyBackupService.joinDiscardBackup();
    assert.strictEqual(workingCopyBackupService.hasBackupSync(customWorkingCopy), false);
  });
  async function restoreBackupsInit() {
    const fooFile = URI.file(isWindows ? "c:\\Foo" : "/Foo");
    const barFile = URI.file(isWindows ? "c:\\Bar" : "/Bar");
    const untitledFile1 = URI.from({ scheme: Schemas.untitled, path: "Untitled-1" });
    const untitledFile2 = URI.from({ scheme: Schemas.untitled, path: "Untitled-2" });
    const workingCopyBackupService = disposables.add(new InMemoryTestWorkingCopyBackupService());
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    instantiationService.stub(IWorkingCopyBackupService, workingCopyBackupService);
    const part = await createEditorPart(instantiationService, disposables);
    instantiationService.stub(IEditorGroupsService, part);
    const editorService = disposables.add(instantiationService.createInstance(EditorService, void 0));
    instantiationService.stub(IEditorService, editorService);
    accessor = instantiationService.createInstance(TestServiceAccessor);
    const untitledFile1WorkingCopyId = toUntypedWorkingCopyId(untitledFile1);
    const untitledFile2WorkingCopyId = toTypedWorkingCopyId(untitledFile2);
    await workingCopyBackupService.backup(untitledFile1WorkingCopyId, bufferToReadable(VSBuffer.fromString("untitled-1")));
    await workingCopyBackupService.backup(untitledFile2WorkingCopyId, bufferToReadable(VSBuffer.fromString("untitled-2")));
    const fooFileWorkingCopyId = toUntypedWorkingCopyId(fooFile);
    const barFileWorkingCopyId = toTypedWorkingCopyId(barFile);
    await workingCopyBackupService.backup(fooFileWorkingCopyId, bufferToReadable(VSBuffer.fromString("fooFile")));
    await workingCopyBackupService.backup(barFileWorkingCopyId, bufferToReadable(VSBuffer.fromString("barFile")));
    const tracker = disposables.add(instantiationService.createInstance(TestWorkingCopyBackupTracker));
    accessor.lifecycleService.phase = LifecyclePhase.Restored;
    return [tracker, accessor];
  }
  test("Restore backups (basics, some handled)", async function() {
    const [tracker, accessor2] = await restoreBackupsInit();
    assert.strictEqual(tracker.getUnrestoredBackups().size, 0);
    let handlesCounter = 0;
    let isOpenCounter = 0;
    let createEditorCounter = 0;
    await tracker.testRestoreBackups({
      handles: (workingCopy) => {
        handlesCounter++;
        return workingCopy.typeId === "testBackupTypeId";
      },
      isOpen: (workingCopy, editor) => {
        isOpenCounter++;
        return false;
      },
      createEditor: (workingCopy) => {
        createEditorCounter++;
        return disposables.add(accessor2.instantiationService.createInstance(TestUntitledTextEditorInput, accessor2.untitledTextEditorService.create({ initialValue: "foo" })));
      }
    });
    assert.strictEqual(handlesCounter, 4);
    assert.strictEqual(isOpenCounter, 0);
    assert.strictEqual(createEditorCounter, 2);
    assert.strictEqual(accessor2.editorService.count, 2);
    assert.ok(accessor2.editorService.editors.every((editor) => editor.isDirty()));
    assert.strictEqual(tracker.getUnrestoredBackups().size, 2);
    for (const editor of accessor2.editorService.editors) {
      assert.ok(editor instanceof TestUntitledTextEditorInput);
      assert.strictEqual(editor.resolved, true);
    }
  });
  test("Restore backups (basics, none handled)", async function() {
    const [tracker, accessor2] = await restoreBackupsInit();
    await tracker.testRestoreBackups({
      handles: (workingCopy) => false,
      isOpen: (workingCopy, editor) => {
        throw new Error("unexpected");
      },
      createEditor: (workingCopy) => {
        throw new Error("unexpected");
      }
    });
    assert.strictEqual(accessor2.editorService.count, 0);
    assert.strictEqual(tracker.getUnrestoredBackups().size, 4);
  });
  test("Restore backups (basics, error case)", async function() {
    const [tracker] = await restoreBackupsInit();
    try {
      await tracker.testRestoreBackups({
        handles: (workingCopy) => true,
        isOpen: (workingCopy, editor) => {
          throw new Error("unexpected");
        },
        createEditor: (workingCopy) => {
          throw new Error("unexpected");
        }
      });
    } catch (error) {
    }
    assert.strictEqual(tracker.getUnrestoredBackups().size, 4);
  });
  test("Restore backups (multiple handlers)", async function() {
    const [tracker, accessor2] = await restoreBackupsInit();
    const firstHandler = tracker.testRestoreBackups({
      handles: (workingCopy) => {
        return workingCopy.typeId === "testBackupTypeId";
      },
      isOpen: (workingCopy, editor) => {
        return false;
      },
      createEditor: (workingCopy) => {
        return disposables.add(accessor2.instantiationService.createInstance(TestUntitledTextEditorInput, accessor2.untitledTextEditorService.create({ initialValue: "foo" })));
      }
    });
    const secondHandler = tracker.testRestoreBackups({
      handles: (workingCopy) => {
        return workingCopy.typeId.length === 0;
      },
      isOpen: (workingCopy, editor) => {
        return false;
      },
      createEditor: (workingCopy) => {
        return disposables.add(accessor2.instantiationService.createInstance(TestUntitledTextEditorInput, accessor2.untitledTextEditorService.create({ initialValue: "foo" })));
      }
    });
    await Promise.all([firstHandler, secondHandler]);
    assert.strictEqual(accessor2.editorService.count, 4);
    assert.ok(accessor2.editorService.editors.every((editor) => editor.isDirty()));
    assert.strictEqual(tracker.getUnrestoredBackups().size, 0);
    for (const editor of accessor2.editorService.editors) {
      assert.ok(editor instanceof TestUntitledTextEditorInput);
      assert.strictEqual(editor.resolved, true);
    }
  });
  test("Restore backups (editors already opened)", async function() {
    const [tracker, accessor2] = await restoreBackupsInit();
    assert.strictEqual(tracker.getUnrestoredBackups().size, 0);
    let handlesCounter = 0;
    let isOpenCounter = 0;
    const editor1 = disposables.add(accessor2.instantiationService.createInstance(TestUntitledTextEditorInput, accessor2.untitledTextEditorService.create({ initialValue: "foo" })));
    const editor2 = disposables.add(accessor2.instantiationService.createInstance(TestUntitledTextEditorInput, accessor2.untitledTextEditorService.create({ initialValue: "foo" })));
    await accessor2.editorService.openEditors([{ editor: editor1 }, { editor: editor2 }]);
    editor1.resolved = false;
    editor2.resolved = false;
    await tracker.testRestoreBackups({
      handles: (workingCopy) => {
        handlesCounter++;
        return workingCopy.typeId === "testBackupTypeId";
      },
      isOpen: (workingCopy, editor) => {
        isOpenCounter++;
        return true;
      },
      createEditor: (workingCopy) => {
        throw new Error("unexpected");
      }
    });
    assert.strictEqual(handlesCounter, 4);
    assert.strictEqual(isOpenCounter, 4);
    assert.strictEqual(accessor2.editorService.count, 2);
    assert.strictEqual(tracker.getUnrestoredBackups().size, 2);
    for (const editor of accessor2.editorService.editors) {
      assert.ok(editor instanceof TestUntitledTextEditorInput);
      if (accessor2.editorService.isVisible(editor)) {
        assert.strictEqual(editor.resolved, false);
      } else {
        assert.strictEqual(editor.resolved, true);
      }
    }
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx3b3JraW5nQ29weVxcdGVzdFxcYnJvd3Nlclxcd29ya2luZ0NvcHlCYWNrdXBUcmFja2VyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFydCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvclBhcnQuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVudGl0bGVkVGV4dFJlc291cmNlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vd29ya2luZ0NvcHlCYWNrdXAuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlLCB0b1Jlc291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzQ29uZmlndXJhdGlvbi9jb21tb24vZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3dvcmtpbmdDb3B5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlCYWNrdXAgfSBmcm9tICcuLi8uLi9jb21tb24vd29ya2luZ0NvcHkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSwgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi8uLi9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFVudGl0bGVkVGV4dEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vdW50aXRsZWQvY29tbW9uL3VudGl0bGVkVGV4dEVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IGNyZWF0ZUVkaXRvclBhcnQsIEluTWVtb3J5VGVzdFdvcmtpbmdDb3B5QmFja3VwU2VydmljZSwgcmVnaXN0ZXJUZXN0UmVzb3VyY2VFZGl0b3IsIFRlc3RTZXJ2aWNlQWNjZXNzb3IsIHRvVHlwZWRXb3JraW5nQ29weUlkLCB0b1VudHlwZWRXb3JraW5nQ29weUlkLCB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSwgd29ya2JlbmNoVGVhcmRvd24gfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IFRlc3RXb3JraW5nQ29weSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQnJvd3NlcldvcmtpbmdDb3B5QmFja3VwVHJhY2tlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvd29ya2luZ0NvcHlCYWNrdXBUcmFja2VyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlFZGl0b3JIYW5kbGVyLCBJV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3dvcmtpbmdDb3B5RWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBidWZmZXJUb1JlYWRhYmxlLCBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5cbnN1aXRlKCdXb3JraW5nQ29weUJhY2t1cFRyYWNrZXIgKGJyb3dzZXIpJywgZnVuY3Rpb24gKCkge1xuXHRsZXQgYWNjZXNzb3I6IFRlc3RTZXJ2aWNlQWNjZXNzb3I7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJUZXN0UmVzb3VyY2VFZGl0b3IoKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3b3JrYmVuY2hUZWFyZG93bihhY2Nlc3Nvci5pbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHRjbGFzcyBUZXN0V29ya2luZ0NvcHlCYWNrdXBUcmFja2VyIGV4dGVuZHMgQnJvd3NlcldvcmtpbmdDb3B5QmFja3VwVHJhY2tlciB7XG5cblx0XHRjb25zdHJ1Y3Rvcihcblx0XHRcdEBJV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlIHdvcmtpbmdDb3B5QmFja3VwU2VydmljZTogSVdvcmtpbmdDb3B5QmFja3VwU2VydmljZSxcblx0XHRcdEBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSBmaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdEBJV29ya2luZ0NvcHlTZXJ2aWNlIHdvcmtpbmdDb3B5U2VydmljZTogSVdvcmtpbmdDb3B5U2VydmljZSxcblx0XHRcdEBJTGlmZWN5Y2xlU2VydmljZSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRcdEBJV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlIHdvcmtpbmdDb3B5RWRpdG9yU2VydmljZTogSVdvcmtpbmdDb3B5RWRpdG9yU2VydmljZSxcblx0XHRcdEBJRWRpdG9yU2VydmljZSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHQpIHtcblx0XHRcdHN1cGVyKHdvcmtpbmdDb3B5QmFja3VwU2VydmljZSwgZmlsZXNDb25maWd1cmF0aW9uU2VydmljZSwgd29ya2luZ0NvcHlTZXJ2aWNlLCBsaWZlY3ljbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlLCB3b3JraW5nQ29weUVkaXRvclNlcnZpY2UsIGVkaXRvclNlcnZpY2UpO1xuXHRcdH1cblxuXHRcdHByb3RlY3RlZCBvdmVycmlkZSBnZXRCYWNrdXBTY2hlZHVsZURlbGF5KCk6IG51bWJlciB7XG5cdFx0XHRyZXR1cm4gMTA7IC8vIFJlZHVjZSB0aW1lb3V0IGZvciB0ZXN0c1xuXHRcdH1cblxuXHRcdGdldCBwZW5kaW5nQmFja3VwT3BlcmF0aW9uQ291bnQoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMucGVuZGluZ0JhY2t1cE9wZXJhdGlvbnMuc2l6ZTsgfVxuXG5cdFx0Z2V0VW5yZXN0b3JlZEJhY2t1cHMoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy51bnJlc3RvcmVkQmFja3Vwcztcblx0XHR9XG5cblx0XHRhc3luYyB0ZXN0UmVzdG9yZUJhY2t1cHMoaGFuZGxlcjogSVdvcmtpbmdDb3B5RWRpdG9ySGFuZGxlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0cmV0dXJuIHN1cGVyLnJlc3RvcmVCYWNrdXBzKGhhbmRsZXIpO1xuXHRcdH1cblx0fVxuXG5cdGNsYXNzIFRlc3RVbnRpdGxlZFRleHRFZGl0b3JJbnB1dCBleHRlbmRzIFVudGl0bGVkVGV4dEVkaXRvcklucHV0IHtcblxuXHRcdHJlc29sdmVkID0gZmFsc2U7XG5cblx0XHRvdmVycmlkZSByZXNvbHZlKCkge1xuXHRcdFx0dGhpcy5yZXNvbHZlZCA9IHRydWU7XG5cblx0XHRcdHJldHVybiBzdXBlci5yZXNvbHZlKCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gY3JlYXRlVHJhY2tlcigpOiBQcm9taXNlPHsgYWNjZXNzb3I6IFRlc3RTZXJ2aWNlQWNjZXNzb3I7IHBhcnQ6IEVkaXRvclBhcnQ7IHRyYWNrZXI6IFRlc3RXb3JraW5nQ29weUJhY2t1cFRyYWNrZXI7IHdvcmtpbmdDb3B5QmFja3VwU2VydmljZTogSW5NZW1vcnlUZXN0V29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlOyBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0+IHtcblx0XHRjb25zdCB3b3JraW5nQ29weUJhY2t1cFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5VGVzdFdvcmtpbmdDb3B5QmFja3VwU2VydmljZSgpKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtpbmdDb3B5QmFja3VwU2VydmljZSwgd29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHBhcnQgPSBhd2FpdCBjcmVhdGVFZGl0b3JQYXJ0KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRWRpdG9yR3JvdXBzU2VydmljZSwgcGFydCk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJUZXN0UmVzb3VyY2VFZGl0b3IoKSk7XG5cblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlOiBFZGl0b3JTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVkaXRvclNlcnZpY2UsIHVuZGVmaW5lZCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVkaXRvclNlcnZpY2UsIGVkaXRvclNlcnZpY2UpO1xuXG5cdFx0YWNjZXNzb3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0U2VydmljZUFjY2Vzc29yKTtcblxuXHRcdGNvbnN0IHRyYWNrZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFdvcmtpbmdDb3B5QmFja3VwVHJhY2tlcikpO1xuXG5cdFx0cmV0dXJuIHsgYWNjZXNzb3IsIHBhcnQsIHRyYWNrZXIsIHdvcmtpbmdDb3B5QmFja3VwU2VydmljZTogd29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSB9O1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gdW50aXRsZWRCYWNrdXBUZXN0KHVudGl0bGVkOiBJVW50aXRsZWRUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCA9IHsgcmVzb3VyY2U6IHVuZGVmaW5lZCB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgeyBhY2Nlc3Nvciwgd29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlIH0gPSBhd2FpdCBjcmVhdGVUcmFja2VyKCk7XG5cblx0XHRjb25zdCB1bnRpdGxlZFRleHRFZGl0b3IgPSBkaXNwb3NhYmxlcy5hZGQoKGF3YWl0IGFjY2Vzc29yLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih1bnRpdGxlZCkpPy5pbnB1dCBhcyBVbnRpdGxlZFRleHRFZGl0b3JJbnB1dCk7XG5cdFx0Y29uc3QgdW50aXRsZWRUZXh0TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgdW50aXRsZWRUZXh0RWRpdG9yLnJlc29sdmUoKSk7XG5cblx0XHRpZiAoIXVudGl0bGVkPy5jb250ZW50cykge1xuXHRcdFx0dW50aXRsZWRUZXh0TW9kZWwudGV4dEVkaXRvck1vZGVsPy5zZXRWYWx1ZSgnU3VwZXIgR29vZCcpO1xuXHRcdH1cblxuXHRcdGF3YWl0IHdvcmtpbmdDb3B5QmFja3VwU2VydmljZS5qb2luQmFja3VwUmVzb3VyY2UoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weUJhY2t1cFNlcnZpY2UuaGFzQmFja3VwU3luYyh1bnRpdGxlZFRleHRNb2RlbCksIHRydWUpO1xuXG5cdFx0dW50aXRsZWRUZXh0TW9kZWwuZGlzcG9zZSgpO1xuXG5cdFx0YXdhaXQgd29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLmpvaW5EaXNjYXJkQmFja3VwKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLmhhc0JhY2t1cFN5bmModW50aXRsZWRUZXh0TW9kZWwpLCBmYWxzZSk7XG5cdH1cblxuXHR0ZXN0KCdUcmFjayBiYWNrdXBzICh1bnRpdGxlZCknLCBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIHVudGl0bGVkQmFja3VwVGVzdCgpO1xuXHR9KTtcblxuXHR0ZXN0KCdUcmFjayBiYWNrdXBzICh1bnRpdGxlZCB3aXRoIGluaXRpYWwgY29udGVudHMpJywgZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiB1bnRpdGxlZEJhY2t1cFRlc3QoeyByZXNvdXJjZTogdW5kZWZpbmVkLCBjb250ZW50czogJ0ZvbyBCYXInIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdUcmFjayBiYWNrdXBzIChjdXN0b20pJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgYWNjZXNzb3IsIHRyYWNrZXIsIHdvcmtpbmdDb3B5QmFja3VwU2VydmljZSB9ID0gYXdhaXQgY3JlYXRlVHJhY2tlcigpO1xuXG5cdFx0Y2xhc3MgVGVzdEJhY2t1cFdvcmtpbmdDb3B5IGV4dGVuZHMgVGVzdFdvcmtpbmdDb3B5IHtcblxuXHRcdFx0Y29uc3RydWN0b3IocmVzb3VyY2U6IFVSSSkge1xuXHRcdFx0XHRzdXBlcihyZXNvdXJjZSk7XG5cblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS5yZWdpc3RlcldvcmtpbmdDb3B5KHRoaXMpKTtcblx0XHRcdH1cblxuXHRcdFx0cmVhZG9ubHkgYmFja3VwRGVsYXkgPSAxMDtcblxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgYmFja3VwKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVdvcmtpbmdDb3B5QmFja3VwPiB7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdFx0cmV0dXJuIHt9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHJlc291cmNlOiBVUkkgPSB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2N1c3RvbS50eHQnKTtcblx0XHRjb25zdCBjdXN0b21Xb3JraW5nQ29weSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEJhY2t1cFdvcmtpbmdDb3B5KHJlc291cmNlKSk7XG5cblx0XHQvLyBOb3JtYWxcblx0XHRjdXN0b21Xb3JraW5nQ29weS5zZXREaXJ0eSh0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5wZW5kaW5nQmFja3VwT3BlcmF0aW9uQ291bnQsIDEpO1xuXHRcdGF3YWl0IHdvcmtpbmdDb3B5QmFja3VwU2VydmljZS5qb2luQmFja3VwUmVzb3VyY2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLmhhc0JhY2t1cFN5bmMoY3VzdG9tV29ya2luZ0NvcHkpLCB0cnVlKTtcblxuXHRcdGN1c3RvbVdvcmtpbmdDb3B5LnNldERpcnR5KGZhbHNlKTtcblx0XHRjdXN0b21Xb3JraW5nQ29weS5zZXREaXJ0eSh0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5wZW5kaW5nQmFja3VwT3BlcmF0aW9uQ291bnQsIDEpO1xuXHRcdGF3YWl0IHdvcmtpbmdDb3B5QmFja3VwU2VydmljZS5qb2luQmFja3VwUmVzb3VyY2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLmhhc0JhY2t1cFN5bmMoY3VzdG9tV29ya2luZ0NvcHkpLCB0cnVlKTtcblxuXHRcdGN1c3RvbVdvcmtpbmdDb3B5LnNldERpcnR5KGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5wZW5kaW5nQmFja3VwT3BlcmF0aW9uQ291bnQsIDEpO1xuXHRcdGF3YWl0IHdvcmtpbmdDb3B5QmFja3VwU2VydmljZS5qb2luRGlzY2FyZEJhY2t1cCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JraW5nQ29weUJhY2t1cFNlcnZpY2UuaGFzQmFja3VwU3luYyhjdXN0b21Xb3JraW5nQ29weSksIGZhbHNlKTtcblxuXHRcdC8vIENhbmNlbGxhdGlvblxuXHRcdGN1c3RvbVdvcmtpbmdDb3B5LnNldERpcnR5KHRydWUpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y3VzdG9tV29ya2luZ0NvcHkuc2V0RGlydHkoZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLnBlbmRpbmdCYWNrdXBPcGVyYXRpb25Db3VudCwgMSk7XG5cdFx0YXdhaXQgd29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLmpvaW5EaXNjYXJkQmFja3VwKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtpbmdDb3B5QmFja3VwU2VydmljZS5oYXNCYWNrdXBTeW5jKGN1c3RvbVdvcmtpbmdDb3B5KSwgZmFsc2UpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiByZXN0b3JlQmFja3Vwc0luaXQoKTogUHJvbWlzZTxbVGVzdFdvcmtpbmdDb3B5QmFja3VwVHJhY2tlciwgVGVzdFNlcnZpY2VBY2Nlc3Nvcl0+IHtcblx0XHRjb25zdCBmb29GaWxlID0gVVJJLmZpbGUoaXNXaW5kb3dzID8gJ2M6XFxcXEZvbycgOiAnL0ZvbycpO1xuXHRcdGNvbnN0IGJhckZpbGUgPSBVUkkuZmlsZShpc1dpbmRvd3MgPyAnYzpcXFxcQmFyJyA6ICcvQmFyJyk7XG5cdFx0Y29uc3QgdW50aXRsZWRGaWxlMSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLnVudGl0bGVkLCBwYXRoOiAnVW50aXRsZWQtMScgfSk7XG5cdFx0Y29uc3QgdW50aXRsZWRGaWxlMiA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLnVudGl0bGVkLCBwYXRoOiAnVW50aXRsZWQtMicgfSk7XG5cblx0XHRjb25zdCB3b3JraW5nQ29weUJhY2t1cFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5VGVzdFdvcmtpbmdDb3B5QmFja3VwU2VydmljZSgpKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtpbmdDb3B5QmFja3VwU2VydmljZSwgd29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHBhcnQgPSBhd2FpdCBjcmVhdGVFZGl0b3JQYXJ0KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRWRpdG9yR3JvdXBzU2VydmljZSwgcGFydCk7XG5cblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlOiBFZGl0b3JTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVkaXRvclNlcnZpY2UsIHVuZGVmaW5lZCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVkaXRvclNlcnZpY2UsIGVkaXRvclNlcnZpY2UpO1xuXG5cdFx0YWNjZXNzb3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0U2VydmljZUFjY2Vzc29yKTtcblxuXHRcdC8vIEJhY2t1cCAyIG5vcm1hbCBmaWxlcyBhbmQgMiB1bnRpdGxlZCBmaWxlc1xuXHRcdGNvbnN0IHVudGl0bGVkRmlsZTFXb3JraW5nQ29weUlkID0gdG9VbnR5cGVkV29ya2luZ0NvcHlJZCh1bnRpdGxlZEZpbGUxKTtcblx0XHRjb25zdCB1bnRpdGxlZEZpbGUyV29ya2luZ0NvcHlJZCA9IHRvVHlwZWRXb3JraW5nQ29weUlkKHVudGl0bGVkRmlsZTIpO1xuXHRcdGF3YWl0IHdvcmtpbmdDb3B5QmFja3VwU2VydmljZS5iYWNrdXAodW50aXRsZWRGaWxlMVdvcmtpbmdDb3B5SWQsIGJ1ZmZlclRvUmVhZGFibGUoVlNCdWZmZXIuZnJvbVN0cmluZygndW50aXRsZWQtMScpKSk7XG5cdFx0YXdhaXQgd29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLmJhY2t1cCh1bnRpdGxlZEZpbGUyV29ya2luZ0NvcHlJZCwgYnVmZmVyVG9SZWFkYWJsZShWU0J1ZmZlci5mcm9tU3RyaW5nKCd1bnRpdGxlZC0yJykpKTtcblxuXHRcdGNvbnN0IGZvb0ZpbGVXb3JraW5nQ29weUlkID0gdG9VbnR5cGVkV29ya2luZ0NvcHlJZChmb29GaWxlKTtcblx0XHRjb25zdCBiYXJGaWxlV29ya2luZ0NvcHlJZCA9IHRvVHlwZWRXb3JraW5nQ29weUlkKGJhckZpbGUpO1xuXHRcdGF3YWl0IHdvcmtpbmdDb3B5QmFja3VwU2VydmljZS5iYWNrdXAoZm9vRmlsZVdvcmtpbmdDb3B5SWQsIGJ1ZmZlclRvUmVhZGFibGUoVlNCdWZmZXIuZnJvbVN0cmluZygnZm9vRmlsZScpKSk7XG5cdFx0YXdhaXQgd29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLmJhY2t1cChiYXJGaWxlV29ya2luZ0NvcHlJZCwgYnVmZmVyVG9SZWFkYWJsZShWU0J1ZmZlci5mcm9tU3RyaW5nKCdiYXJGaWxlJykpKTtcblxuXHRcdGNvbnN0IHRyYWNrZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFdvcmtpbmdDb3B5QmFja3VwVHJhY2tlcikpO1xuXG5cdFx0YWNjZXNzb3IubGlmZWN5Y2xlU2VydmljZS5waGFzZSA9IExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkO1xuXG5cdFx0cmV0dXJuIFt0cmFja2VyLCBhY2Nlc3Nvcl07XG5cdH1cblxuXHR0ZXN0KCdSZXN0b3JlIGJhY2t1cHMgKGJhc2ljcywgc29tZSBoYW5kbGVkKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBbdHJhY2tlciwgYWNjZXNzb3JdID0gYXdhaXQgcmVzdG9yZUJhY2t1cHNJbml0KCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5nZXRVbnJlc3RvcmVkQmFja3VwcygpLnNpemUsIDApO1xuXG5cdFx0bGV0IGhhbmRsZXNDb3VudGVyID0gMDtcblx0XHRsZXQgaXNPcGVuQ291bnRlciA9IDA7XG5cdFx0bGV0IGNyZWF0ZUVkaXRvckNvdW50ZXIgPSAwO1xuXG5cdFx0YXdhaXQgdHJhY2tlci50ZXN0UmVzdG9yZUJhY2t1cHMoe1xuXHRcdFx0aGFuZGxlczogd29ya2luZ0NvcHkgPT4ge1xuXHRcdFx0XHRoYW5kbGVzQ291bnRlcisrO1xuXG5cdFx0XHRcdHJldHVybiB3b3JraW5nQ29weS50eXBlSWQgPT09ICd0ZXN0QmFja3VwVHlwZUlkJztcblx0XHRcdH0sXG5cdFx0XHRpc09wZW46ICh3b3JraW5nQ29weSwgZWRpdG9yKSA9PiB7XG5cdFx0XHRcdGlzT3BlbkNvdW50ZXIrKztcblxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9LFxuXHRcdFx0Y3JlYXRlRWRpdG9yOiB3b3JraW5nQ29weSA9PiB7XG5cdFx0XHRcdGNyZWF0ZUVkaXRvckNvdW50ZXIrKztcblxuXHRcdFx0XHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKGFjY2Vzc29yLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RVbnRpdGxlZFRleHRFZGl0b3JJbnB1dCwgYWNjZXNzb3IudW50aXRsZWRUZXh0RWRpdG9yU2VydmljZS5jcmVhdGUoeyBpbml0aWFsVmFsdWU6ICdmb28nIH0pKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFuZGxlc0NvdW50ZXIsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc09wZW5Db3VudGVyLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlRWRpdG9yQ291bnRlciwgMik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXNzb3IuZWRpdG9yU2VydmljZS5jb3VudCwgMik7XG5cdFx0YXNzZXJ0Lm9rKGFjY2Vzc29yLmVkaXRvclNlcnZpY2UuZWRpdG9ycy5ldmVyeShlZGl0b3IgPT4gZWRpdG9yLmlzRGlydHkoKSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmdldFVucmVzdG9yZWRCYWNrdXBzKCkuc2l6ZSwgMik7XG5cblx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBhY2Nlc3Nvci5lZGl0b3JTZXJ2aWNlLmVkaXRvcnMpIHtcblx0XHRcdGFzc2VydC5vayhlZGl0b3IgaW5zdGFuY2VvZiBUZXN0VW50aXRsZWRUZXh0RWRpdG9ySW5wdXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5yZXNvbHZlZCwgdHJ1ZSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdSZXN0b3JlIGJhY2t1cHMgKGJhc2ljcywgbm9uZSBoYW5kbGVkKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBbdHJhY2tlciwgYWNjZXNzb3JdID0gYXdhaXQgcmVzdG9yZUJhY2t1cHNJbml0KCk7XG5cblx0XHRhd2FpdCB0cmFja2VyLnRlc3RSZXN0b3JlQmFja3Vwcyh7XG5cdFx0XHRoYW5kbGVzOiB3b3JraW5nQ29weSA9PiBmYWxzZSxcblx0XHRcdGlzT3BlbjogKHdvcmtpbmdDb3B5LCBlZGl0b3IpID0+IHsgdGhyb3cgbmV3IEVycm9yKCd1bmV4cGVjdGVkJyk7IH0sXG5cdFx0XHRjcmVhdGVFZGl0b3I6IHdvcmtpbmdDb3B5ID0+IHsgdGhyb3cgbmV3IEVycm9yKCd1bmV4cGVjdGVkJyk7IH1cblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY2Nlc3Nvci5lZGl0b3JTZXJ2aWNlLmNvdW50LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5nZXRVbnJlc3RvcmVkQmFja3VwcygpLnNpemUsIDQpO1xuXHR9KTtcblxuXHR0ZXN0KCdSZXN0b3JlIGJhY2t1cHMgKGJhc2ljcywgZXJyb3IgY2FzZSknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgW3RyYWNrZXJdID0gYXdhaXQgcmVzdG9yZUJhY2t1cHNJbml0KCk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdHJhY2tlci50ZXN0UmVzdG9yZUJhY2t1cHMoe1xuXHRcdFx0XHRoYW5kbGVzOiB3b3JraW5nQ29weSA9PiB0cnVlLFxuXHRcdFx0XHRpc09wZW46ICh3b3JraW5nQ29weSwgZWRpdG9yKSA9PiB7IHRocm93IG5ldyBFcnJvcigndW5leHBlY3RlZCcpOyB9LFxuXHRcdFx0XHRjcmVhdGVFZGl0b3I6IHdvcmtpbmdDb3B5ID0+IHsgdGhyb3cgbmV3IEVycm9yKCd1bmV4cGVjdGVkJyk7IH1cblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBpZ25vcmVcblx0XHR9XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5nZXRVbnJlc3RvcmVkQmFja3VwcygpLnNpemUsIDQpO1xuXHR9KTtcblxuXHR0ZXN0KCdSZXN0b3JlIGJhY2t1cHMgKG11bHRpcGxlIGhhbmRsZXJzKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBbdHJhY2tlciwgYWNjZXNzb3JdID0gYXdhaXQgcmVzdG9yZUJhY2t1cHNJbml0KCk7XG5cblx0XHRjb25zdCBmaXJzdEhhbmRsZXIgPSB0cmFja2VyLnRlc3RSZXN0b3JlQmFja3Vwcyh7XG5cdFx0XHRoYW5kbGVzOiB3b3JraW5nQ29weSA9PiB7XG5cdFx0XHRcdHJldHVybiB3b3JraW5nQ29weS50eXBlSWQgPT09ICd0ZXN0QmFja3VwVHlwZUlkJztcblx0XHRcdH0sXG5cdFx0XHRpc09wZW46ICh3b3JraW5nQ29weSwgZWRpdG9yKSA9PiB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVFZGl0b3I6IHdvcmtpbmdDb3B5ID0+IHtcblx0XHRcdFx0cmV0dXJuIGRpc3Bvc2FibGVzLmFkZChhY2Nlc3Nvci5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VW50aXRsZWRUZXh0RWRpdG9ySW5wdXQsIGFjY2Vzc29yLnVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2UuY3JlYXRlKHsgaW5pdGlhbFZhbHVlOiAnZm9vJyB9KSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2Vjb25kSGFuZGxlciA9IHRyYWNrZXIudGVzdFJlc3RvcmVCYWNrdXBzKHtcblx0XHRcdGhhbmRsZXM6IHdvcmtpbmdDb3B5ID0+IHtcblx0XHRcdFx0cmV0dXJuIHdvcmtpbmdDb3B5LnR5cGVJZC5sZW5ndGggPT09IDA7XG5cdFx0XHR9LFxuXHRcdFx0aXNPcGVuOiAod29ya2luZ0NvcHksIGVkaXRvcikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9LFxuXHRcdFx0Y3JlYXRlRWRpdG9yOiB3b3JraW5nQ29weSA9PiB7XG5cdFx0XHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQoYWNjZXNzb3IuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFVudGl0bGVkVGV4dEVkaXRvcklucHV0LCBhY2Nlc3Nvci51bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlLmNyZWF0ZSh7IGluaXRpYWxWYWx1ZTogJ2ZvbycgfSkpKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtmaXJzdEhhbmRsZXIsIHNlY29uZEhhbmRsZXJdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY2Nlc3Nvci5lZGl0b3JTZXJ2aWNlLmNvdW50LCA0KTtcblx0XHRhc3NlcnQub2soYWNjZXNzb3IuZWRpdG9yU2VydmljZS5lZGl0b3JzLmV2ZXJ5KGVkaXRvciA9PiBlZGl0b3IuaXNEaXJ0eSgpKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuZ2V0VW5yZXN0b3JlZEJhY2t1cHMoKS5zaXplLCAwKTtcblxuXHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGFjY2Vzc29yLmVkaXRvclNlcnZpY2UuZWRpdG9ycykge1xuXHRcdFx0YXNzZXJ0Lm9rKGVkaXRvciBpbnN0YW5jZW9mIFRlc3RVbnRpdGxlZFRleHRFZGl0b3JJbnB1dCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLnJlc29sdmVkLCB0cnVlKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ1Jlc3RvcmUgYmFja3VwcyAoZWRpdG9ycyBhbHJlYWR5IG9wZW5lZCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgW3RyYWNrZXIsIGFjY2Vzc29yXSA9IGF3YWl0IHJlc3RvcmVCYWNrdXBzSW5pdCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuZ2V0VW5yZXN0b3JlZEJhY2t1cHMoKS5zaXplLCAwKTtcblxuXHRcdGxldCBoYW5kbGVzQ291bnRlciA9IDA7XG5cdFx0bGV0IGlzT3BlbkNvdW50ZXIgPSAwO1xuXG5cdFx0Y29uc3QgZWRpdG9yMSA9IGRpc3Bvc2FibGVzLmFkZChhY2Nlc3Nvci5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VW50aXRsZWRUZXh0RWRpdG9ySW5wdXQsIGFjY2Vzc29yLnVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2UuY3JlYXRlKHsgaW5pdGlhbFZhbHVlOiAnZm9vJyB9KSkpO1xuXHRcdGNvbnN0IGVkaXRvcjIgPSBkaXNwb3NhYmxlcy5hZGQoYWNjZXNzb3IuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFVudGl0bGVkVGV4dEVkaXRvcklucHV0LCBhY2Nlc3Nvci51bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlLmNyZWF0ZSh7IGluaXRpYWxWYWx1ZTogJ2ZvbycgfSkpKTtcblxuXHRcdGF3YWl0IGFjY2Vzc29yLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcnMoW3sgZWRpdG9yOiBlZGl0b3IxIH0sIHsgZWRpdG9yOiBlZGl0b3IyIH1dKTtcblxuXHRcdGVkaXRvcjEucmVzb2x2ZWQgPSBmYWxzZTtcblx0XHRlZGl0b3IyLnJlc29sdmVkID0gZmFsc2U7XG5cblx0XHRhd2FpdCB0cmFja2VyLnRlc3RSZXN0b3JlQmFja3Vwcyh7XG5cdFx0XHRoYW5kbGVzOiB3b3JraW5nQ29weSA9PiB7XG5cdFx0XHRcdGhhbmRsZXNDb3VudGVyKys7XG5cblx0XHRcdFx0cmV0dXJuIHdvcmtpbmdDb3B5LnR5cGVJZCA9PT0gJ3Rlc3RCYWNrdXBUeXBlSWQnO1xuXHRcdFx0fSxcblx0XHRcdGlzT3BlbjogKHdvcmtpbmdDb3B5LCBlZGl0b3IpID0+IHtcblx0XHRcdFx0aXNPcGVuQ291bnRlcisrO1xuXG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZUVkaXRvcjogd29ya2luZ0NvcHkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ3VuZXhwZWN0ZWQnKTsgfVxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhbmRsZXNDb3VudGVyLCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNPcGVuQ291bnRlciwgNCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXNzb3IuZWRpdG9yU2VydmljZS5jb3VudCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuZ2V0VW5yZXN0b3JlZEJhY2t1cHMoKS5zaXplLCAyKTtcblxuXHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGFjY2Vzc29yLmVkaXRvclNlcnZpY2UuZWRpdG9ycykge1xuXHRcdFx0YXNzZXJ0Lm9rKGVkaXRvciBpbnN0YW5jZW9mIFRlc3RVbnRpdGxlZFRleHRFZGl0b3JJbnB1dCk7XG5cblx0XHRcdC8vIGFzc2VydCB0aGF0IHdlIG9ubHkgY2FsbCBgcmVzb2x2ZWAgb24gaW5hY3RpdmUgZWRpdG9yc1xuXHRcdFx0aWYgKGFjY2Vzc29yLmVkaXRvclNlcnZpY2UuaXNWaXNpYmxlKGVkaXRvcikpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5yZXNvbHZlZCwgZmFsc2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci5yZXNvbHZlZCwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMseUNBQXlDLGtCQUFrQjtBQUNwRSxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG1CQUFtQixzQkFBc0I7QUFFbEQsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxrQkFBa0Isc0NBQXNDLDRCQUE0QixxQkFBcUIsc0JBQXNCLHdCQUF3QiwrQkFBK0IseUJBQXlCO0FBQ3hOLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHVDQUF1QztBQUNoRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFvQyxpQ0FBaUM7QUFDckUsU0FBUyxrQkFBa0IsZ0JBQWdCO0FBQzNDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZUFBZTtBQUV4QixNQUFNLHNDQUFzQyxXQUFZO0FBQ3ZELE1BQUk7QUFDSixR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
