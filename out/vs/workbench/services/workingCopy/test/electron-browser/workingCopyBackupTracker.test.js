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
import { isMacintosh, isWindows } from "../../../../../base/common/platform.js";
import { join } from "../../../../../base/common/path.js";
import { URI } from "../../../../../base/common/uri.js";
import { hash } from "../../../../../base/common/hash.js";
import { NativeWorkingCopyBackupTracker } from "../../electron-browser/workingCopyBackupTracker.js";
import { IEditorService } from "../../../editor/common/editorService.js";
import { IEditorGroupsService } from "../../../editor/common/editorGroupsService.js";
import { EditorService } from "../../../editor/browser/editorService.js";
import { IWorkingCopyBackupService } from "../../common/workingCopyBackup.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from "../../../../../base/test/common/utils.js";
import { IFilesConfigurationService } from "../../../filesConfiguration/common/filesConfigurationService.js";
import { IWorkingCopyService } from "../../common/workingCopyService.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { HotExitConfiguration } from "../../../../../platform/files/common/files.js";
import { ShutdownReason, ILifecycleService } from "../../../lifecycle/common/lifecycle.js";
import { IFileDialogService, ConfirmResult, IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { INativeHostService } from "../../../../../platform/native/common/native.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { createEditorPart, registerTestFileEditor, TestBeforeShutdownEvent, TestEnvironmentService, TestFilesConfigurationService, TestFileService, TestTextResourceConfigurationService, workbenchTeardown } from "../../../../test/browser/workbenchTestServices.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { IEnvironmentService } from "../../../../../platform/environment/common/environment.js";
import { TestWorkspace, Workspace } from "../../../../../platform/workspace/test/common/testWorkspace.js";
import { IProgressService } from "../../../../../platform/progress/common/progress.js";
import { IWorkingCopyEditorService } from "../../common/workingCopyEditorService.js";
import { TestContextService, TestMarkerService, TestWorkingCopy } from "../../../../test/common/workbenchTestServices.js";
import { WorkingCopyCapabilities } from "../../common/workingCopy.js";
import { Event, Emitter } from "../../../../../base/common/event.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { Schemas } from "../../../../../base/common/network.js";
import { joinPath } from "../../../../../base/common/resources.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { TestServiceAccessor, workbenchInstantiationService } from "../../../../test/electron-browser/workbenchTestServices.js";
import { UriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentityService.js";
suite("WorkingCopyBackupTracker (native)", function() {
  let TestWorkingCopyBackupTracker = class extends NativeWorkingCopyBackupTracker {
    constructor(workingCopyBackupService, filesConfigurationService, workingCopyService, lifecycleService, fileDialogService, dialogService, contextService, nativeHostService, logService, editorService, environmentService, progressService, workingCopyEditorService) {
      super(workingCopyBackupService, filesConfigurationService, workingCopyService, lifecycleService, fileDialogService, dialogService, contextService, nativeHostService, logService, environmentService, progressService, workingCopyEditorService, editorService);
      this._onDidResume = this._register(new Emitter());
      this.onDidResume = this._onDidResume.event;
      this._onDidSuspend = this._register(new Emitter());
      this.onDidSuspend = this._onDidSuspend.event;
    }
    getBackupScheduleDelay() {
      return 10;
    }
    waitForReady() {
      return this.whenReady;
    }
    get pendingBackupOperationCount() {
      return this.pendingBackupOperations.size;
    }
    dispose() {
      super.dispose();
      for (const [_, pending] of this.pendingBackupOperations) {
        pending.cancel();
        pending.disposable.dispose();
      }
    }
    suspendBackupOperations() {
      const { resume } = super.suspendBackupOperations();
      this._onDidSuspend.fire();
      return {
        resume: () => {
          resume();
          this._onDidResume.fire();
        }
      };
    }
  };
  TestWorkingCopyBackupTracker = __decorateClass([
    __decorateParam(0, IWorkingCopyBackupService),
    __decorateParam(1, IFilesConfigurationService),
    __decorateParam(2, IWorkingCopyService),
    __decorateParam(3, ILifecycleService),
    __decorateParam(4, IFileDialogService),
    __decorateParam(5, IDialogService),
    __decorateParam(6, IWorkspaceContextService),
    __decorateParam(7, INativeHostService),
    __decorateParam(8, ILogService),
    __decorateParam(9, IEditorService),
    __decorateParam(10, IEnvironmentService),
    __decorateParam(11, IProgressService),
    __decorateParam(12, IWorkingCopyEditorService)
  ], TestWorkingCopyBackupTracker);
  let testDir;
  let backupHome;
  let workspaceBackupPath;
  let accessor;
  const disposables = new DisposableStore();
  setup(async () => {
    testDir = URI.file(join(generateUuid(), "vsctests", "workingcopybackuptracker")).with({ scheme: Schemas.inMemory });
    backupHome = joinPath(testDir, "Backups");
    const workspacesJsonPath = joinPath(backupHome, "workspaces.json");
    const workspaceResource = URI.file(isWindows ? "c:\\workspace" : "/workspace").with({ scheme: Schemas.inMemory });
    workspaceBackupPath = joinPath(backupHome, hash(workspaceResource.toString()).toString(16));
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    accessor = instantiationService.createInstance(TestServiceAccessor);
    disposables.add(accessor.textFileService.files);
    disposables.add(registerTestFileEditor());
    await accessor.fileService.createFolder(backupHome);
    await accessor.fileService.createFolder(workspaceBackupPath);
    return accessor.fileService.writeFile(workspacesJsonPath, VSBuffer.fromString(""));
  });
  teardown(() => {
    disposables.clear();
  });
  async function createTracker(autoSaveEnabled = false) {
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const configurationService = new TestConfigurationService();
    if (autoSaveEnabled) {
      configurationService.setUserConfiguration("files", { autoSave: "afterDelay", autoSaveDelay: 1 });
    } else {
      configurationService.setUserConfiguration("files", { autoSave: "off", autoSaveDelay: 1 });
    }
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(IFilesConfigurationService, disposables.add(new TestFilesConfigurationService(
      instantiationService.createInstance(MockContextKeyService),
      configurationService,
      new TestContextService(TestWorkspace),
      TestEnvironmentService,
      disposables.add(new UriIdentityService(disposables.add(new TestFileService()))),
      disposables.add(new TestFileService()),
      new TestMarkerService(),
      new TestTextResourceConfigurationService(configurationService)
    )));
    const part = await createEditorPart(instantiationService, disposables);
    instantiationService.stub(IEditorGroupsService, part);
    const editorService = disposables.add(instantiationService.createInstance(EditorService, void 0));
    instantiationService.stub(IEditorService, editorService);
    accessor = instantiationService.createInstance(TestServiceAccessor);
    const tracker = instantiationService.createInstance(TestWorkingCopyBackupTracker);
    const cleanup = async () => {
      await accessor.workingCopyBackupService.waitForAllBackups();
      await workbenchTeardown(instantiationService);
      part.dispose();
      tracker.dispose();
    };
    return { accessor, part, tracker, instantiationService, cleanup };
  }
  test("Track backups (file, auto save off)", function() {
    return trackBackupsTest(toResource.call(this, "/path/index.txt"), false);
  });
  test("Track backups (file, auto save on)", function() {
    return trackBackupsTest(toResource.call(this, "/path/index.txt"), true);
  });
  async function trackBackupsTest(resource, autoSave) {
    const { accessor: accessor2, cleanup } = await createTracker(autoSave);
    await accessor2.editorService.openEditor({ resource, options: { pinned: true } });
    const fileModel = accessor2.textFileService.files.get(resource);
    assert.ok(fileModel);
    fileModel.textEditorModel?.setValue("Super Good");
    await accessor2.workingCopyBackupService.joinBackupResource();
    assert.strictEqual(accessor2.workingCopyBackupService.hasBackupSync(fileModel), true);
    fileModel.dispose();
    await accessor2.workingCopyBackupService.joinDiscardBackup();
    assert.strictEqual(accessor2.workingCopyBackupService.hasBackupSync(fileModel), false);
    await cleanup();
  }
  test("onWillShutdown - no veto if no dirty files", async function() {
    const { accessor: accessor2, cleanup } = await createTracker();
    const resource = toResource.call(this, "/path/index.txt");
    await accessor2.editorService.openEditor({ resource, options: { pinned: true } });
    const event = new TestBeforeShutdownEvent();
    accessor2.lifecycleService.fireBeforeShutdown(event);
    const veto = await event.value;
    assert.ok(!veto);
    await cleanup();
  });
  test("onWillShutdown - veto if user cancels (hot.exit: off)", async function() {
    const { accessor: accessor2, cleanup } = await createTracker();
    const resource = toResource.call(this, "/path/index.txt");
    await accessor2.editorService.openEditor({ resource, options: { pinned: true } });
    const model = accessor2.textFileService.files.get(resource);
    accessor2.fileDialogService.setConfirmResult(ConfirmResult.CANCEL);
    accessor2.filesConfigurationService.testOnFilesConfigurationChange({ files: { hotExit: "off" } });
    await model?.resolve();
    model?.textEditorModel?.setValue("foo");
    assert.strictEqual(accessor2.workingCopyService.dirtyCount, 1);
    const event = new TestBeforeShutdownEvent();
    accessor2.lifecycleService.fireBeforeShutdown(event);
    const veto = await event.value;
    assert.ok(veto);
    await cleanup();
  });
  test("onWillShutdown - no veto if auto save is on", async function() {
    const { accessor: accessor2, cleanup } = await createTracker(
      true
      /* auto save enabled */
    );
    const resource = toResource.call(this, "/path/index.txt");
    await accessor2.editorService.openEditor({ resource, options: { pinned: true } });
    const model = accessor2.textFileService.files.get(resource);
    await model?.resolve();
    model?.textEditorModel?.setValue("foo");
    assert.strictEqual(accessor2.workingCopyService.dirtyCount, 1);
    const event = new TestBeforeShutdownEvent();
    accessor2.lifecycleService.fireBeforeShutdown(event);
    const veto = await event.value;
    assert.ok(!veto);
    assert.strictEqual(accessor2.workingCopyService.dirtyCount, 0);
    await cleanup();
  });
  test("onWillShutdown - no veto and backups cleaned up if user does not want to save (hot.exit: off)", async function() {
    const { accessor: accessor2, cleanup } = await createTracker();
    const resource = toResource.call(this, "/path/index.txt");
    await accessor2.editorService.openEditor({ resource, options: { pinned: true } });
    const model = accessor2.textFileService.files.get(resource);
    accessor2.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);
    accessor2.filesConfigurationService.testOnFilesConfigurationChange({ files: { hotExit: "off" } });
    await model?.resolve();
    model?.textEditorModel?.setValue("foo");
    assert.strictEqual(accessor2.workingCopyService.dirtyCount, 1);
    const event = new TestBeforeShutdownEvent();
    accessor2.lifecycleService.fireBeforeShutdown(event);
    const veto = await event.value;
    assert.ok(!veto);
    assert.ok(accessor2.workingCopyBackupService.discardedBackups.length > 0);
    await cleanup();
  });
  test("onWillShutdown - no backups discarded when shutdown without dirty but tracker not ready", async function() {
    const { accessor: accessor2, cleanup } = await createTracker();
    const event = new TestBeforeShutdownEvent();
    accessor2.lifecycleService.fireBeforeShutdown(event);
    const veto = await event.value;
    assert.ok(!veto);
    assert.ok(!accessor2.workingCopyBackupService.discardedAllBackups);
    await cleanup();
  });
  test("onWillShutdown - backups discarded when shutdown without dirty", async function() {
    const { accessor: accessor2, tracker, cleanup } = await createTracker();
    await tracker.waitForReady();
    const event = new TestBeforeShutdownEvent();
    accessor2.lifecycleService.fireBeforeShutdown(event);
    const veto = await event.value;
    assert.ok(!veto);
    assert.ok(accessor2.workingCopyBackupService.discardedAllBackups);
    await cleanup();
  });
  test("onWillShutdown - save (hot.exit: off)", async function() {
    const { accessor: accessor2, cleanup } = await createTracker();
    const resource = toResource.call(this, "/path/index.txt");
    await accessor2.editorService.openEditor({ resource, options: { pinned: true } });
    const model = accessor2.textFileService.files.get(resource);
    accessor2.fileDialogService.setConfirmResult(ConfirmResult.SAVE);
    accessor2.filesConfigurationService.testOnFilesConfigurationChange({ files: { hotExit: "off" } });
    await model?.resolve();
    model?.textEditorModel?.setValue("foo");
    assert.strictEqual(accessor2.workingCopyService.dirtyCount, 1);
    const event = new TestBeforeShutdownEvent();
    accessor2.lifecycleService.fireBeforeShutdown(event);
    const veto = await event.value;
    assert.ok(!veto);
    assert.ok(!model?.isDirty());
    await cleanup();
  });
  test("onWillShutdown - veto if backup fails", async function() {
    const { accessor: accessor2, cleanup } = await createTracker();
    class TestBackupWorkingCopy extends TestWorkingCopy {
      constructor(resource2) {
        super(resource2);
        this._register(accessor2.workingCopyService.registerWorkingCopy(this));
      }
      async backup(token) {
        throw new Error("unable to backup");
      }
    }
    const resource = toResource.call(this, "/path/custom.txt");
    const customWorkingCopy = disposables.add(new TestBackupWorkingCopy(resource));
    customWorkingCopy.setDirty(true);
    const event = new TestBeforeShutdownEvent();
    event.reason = ShutdownReason.QUIT;
    accessor2.lifecycleService.fireBeforeShutdown(event);
    const veto = await event.value;
    assert.ok(veto);
    const finalVeto = await event.finalValue?.();
    assert.ok(finalVeto);
    await cleanup();
  });
  test("onWillShutdown - scratchpads - veto if backup fails", async function() {
    const { accessor: accessor2, cleanup } = await createTracker();
    class TestBackupWorkingCopy extends TestWorkingCopy {
      constructor(resource2) {
        super(resource2);
        this.capabilities = WorkingCopyCapabilities.Untitled | WorkingCopyCapabilities.Scratchpad;
        this._register(accessor2.workingCopyService.registerWorkingCopy(this));
      }
      async backup(token) {
        throw new Error("unable to backup");
      }
      isDirty() {
        return false;
      }
      isModified() {
        return true;
      }
    }
    const resource = toResource.call(this, "/path/custom.txt");
    disposables.add(new TestBackupWorkingCopy(resource));
    const event = new TestBeforeShutdownEvent();
    event.reason = ShutdownReason.QUIT;
    accessor2.lifecycleService.fireBeforeShutdown(event);
    const veto = await event.value;
    assert.ok(veto);
    const finalVeto = await event.finalValue?.();
    assert.ok(finalVeto);
    await cleanup();
  });
  test("onWillShutdown - pending backup operations canceled and tracker suspended/resumsed", async function() {
    const { accessor: accessor2, tracker, cleanup } = await createTracker();
    const resource = toResource.call(this, "/path/index.txt");
    await accessor2.editorService.openEditor({ resource, options: { pinned: true } });
    const model = accessor2.textFileService.files.get(resource);
    await model?.resolve();
    model?.textEditorModel?.setValue("foo");
    assert.strictEqual(accessor2.workingCopyService.dirtyCount, 1);
    assert.strictEqual(tracker.pendingBackupOperationCount, 1);
    const onSuspend = Event.toPromise(tracker.onDidSuspend);
    const event = new TestBeforeShutdownEvent();
    event.reason = ShutdownReason.QUIT;
    accessor2.lifecycleService.fireBeforeShutdown(event);
    await onSuspend;
    assert.strictEqual(tracker.pendingBackupOperationCount, 0);
    model?.textEditorModel?.setValue("bar");
    assert.strictEqual(accessor2.workingCopyService.dirtyCount, 1);
    assert.strictEqual(tracker.pendingBackupOperationCount, 0);
    const onResume = Event.toPromise(tracker.onDidResume);
    await event.value;
    model?.textEditorModel?.setValue("foo");
    await onResume;
    assert.strictEqual(tracker.pendingBackupOperationCount, 1);
    await cleanup();
  });
  suite("Hot Exit", () => {
    suite('"onExit" setting', () => {
      test("should hot exit on non-Mac (reason: CLOSE, windows: single, workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.CLOSE, false, true, !!isMacintosh);
      });
      test("should hot exit on non-Mac (reason: CLOSE, windows: single, empty workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.CLOSE, false, false, !!isMacintosh);
      });
      test("should NOT hot exit (reason: CLOSE, windows: multiple, workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.CLOSE, true, true, true);
      });
      test("should NOT hot exit (reason: CLOSE, windows: multiple, empty workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.CLOSE, true, false, true);
      });
      test("should hot exit (reason: QUIT, windows: single, workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.QUIT, false, true, false);
      });
      test("should hot exit (reason: QUIT, windows: single, empty workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.QUIT, false, false, false);
      });
      test("should hot exit (reason: QUIT, windows: multiple, workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.QUIT, true, true, false);
      });
      test("should hot exit (reason: QUIT, windows: multiple, empty workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.QUIT, true, false, false);
      });
      test("should hot exit (reason: RELOAD, windows: single, workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.RELOAD, false, true, false);
      });
      test("should hot exit (reason: RELOAD, windows: single, empty workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.RELOAD, false, false, false);
      });
      test("should hot exit (reason: RELOAD, windows: multiple, workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.RELOAD, true, true, false);
      });
      test("should hot exit (reason: RELOAD, windows: multiple, empty workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.RELOAD, true, false, false);
      });
      test("should NOT hot exit (reason: LOAD, windows: single, workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.LOAD, false, true, true);
      });
      test("should NOT hot exit (reason: LOAD, windows: single, empty workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.LOAD, false, false, true);
      });
      test("should NOT hot exit (reason: LOAD, windows: multiple, workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.LOAD, true, true, true);
      });
      test("should NOT hot exit (reason: LOAD, windows: multiple, empty workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.LOAD, true, false, true);
      });
    });
    suite('"onExitAndWindowClose" setting', () => {
      test("should hot exit (reason: CLOSE, windows: single, workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.CLOSE, false, true, false);
      });
      test("should hot exit (reason: CLOSE, windows: single, empty workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.CLOSE, false, false, !!isMacintosh);
      });
      test("should hot exit (reason: CLOSE, windows: multiple, workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.CLOSE, true, true, false);
      });
      test("should NOT hot exit (reason: CLOSE, windows: multiple, empty workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.CLOSE, true, false, true);
      });
      test("should hot exit (reason: QUIT, windows: single, workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.QUIT, false, true, false);
      });
      test("should hot exit (reason: QUIT, windows: single, empty workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.QUIT, false, false, false);
      });
      test("should hot exit (reason: QUIT, windows: multiple, workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.QUIT, true, true, false);
      });
      test("should hot exit (reason: QUIT, windows: multiple, empty workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.QUIT, true, false, false);
      });
      test("should hot exit (reason: RELOAD, windows: single, workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.RELOAD, false, true, false);
      });
      test("should hot exit (reason: RELOAD, windows: single, empty workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.RELOAD, false, false, false);
      });
      test("should hot exit (reason: RELOAD, windows: multiple, workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.RELOAD, true, true, false);
      });
      test("should hot exit (reason: RELOAD, windows: multiple, empty workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.RELOAD, true, false, false);
      });
      test("should hot exit (reason: LOAD, windows: single, workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.LOAD, false, true, false);
      });
      test("should NOT hot exit (reason: LOAD, windows: single, empty workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.LOAD, false, false, true);
      });
      test("should hot exit (reason: LOAD, windows: multiple, workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.LOAD, true, true, false);
      });
      test("should NOT hot exit (reason: LOAD, windows: multiple, empty workspace)", function() {
        return hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.LOAD, true, false, true);
      });
    });
    suite('"onExit" setting - scratchpad', () => {
      test("should hot exit (reason: CLOSE, windows: single, workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.CLOSE, false, true, false);
      });
      test("should hot exit (reason: CLOSE, windows: single, empty workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.CLOSE, false, false, !!isMacintosh);
      });
      test("should hot exit (reason: CLOSE, windows: multiple, workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.CLOSE, true, true, false);
      });
      test("should NOT hot exit (reason: CLOSE, windows: multiple, empty workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.CLOSE, true, false, true);
      });
      test("should hot exit (reason: QUIT, windows: single, workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.QUIT, false, true, false);
      });
      test("should hot exit (reason: QUIT, windows: single, empty workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.QUIT, false, false, false);
      });
      test("should hot exit (reason: QUIT, windows: multiple, workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.QUIT, true, true, false);
      });
      test("should hot exit (reason: QUIT, windows: multiple, empty workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.QUIT, true, false, false);
      });
      test("should hot exit (reason: RELOAD, windows: single, workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.RELOAD, false, true, false);
      });
      test("should hot exit (reason: RELOAD, windows: single, empty workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.RELOAD, false, false, false);
      });
      test("should hot exit (reason: RELOAD, windows: multiple, workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.RELOAD, true, true, false);
      });
      test("should hot exit (reason: RELOAD, windows: multiple, empty workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.RELOAD, true, false, false);
      });
      test("should hot exit (reason: LOAD, windows: single, workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.LOAD, false, true, false);
      });
      test("should NOT hot exit (reason: LOAD, windows: single, empty workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.LOAD, false, false, true);
      });
      test("should hot exit (reason: LOAD, windows: multiple, workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.LOAD, true, true, false);
      });
      test("should NOT hot exit (reason: LOAD, windows: multiple, empty workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT, ShutdownReason.LOAD, true, false, true);
      });
    });
    suite('"onExitAndWindowClose" setting - scratchpad', () => {
      test("should hot exit (reason: CLOSE, windows: single, workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.CLOSE, false, true, false);
      });
      test("should hot exit (reason: CLOSE, windows: single, empty workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.CLOSE, false, false, !!isMacintosh);
      });
      test("should hot exit (reason: CLOSE, windows: multiple, workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.CLOSE, true, true, false);
      });
      test("should NOT hot exit (reason: CLOSE, windows: multiple, empty workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.CLOSE, true, false, true);
      });
      test("should hot exit (reason: QUIT, windows: single, workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.QUIT, false, true, false);
      });
      test("should hot exit (reason: QUIT, windows: single, empty workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.QUIT, false, false, false);
      });
      test("should hot exit (reason: QUIT, windows: multiple, workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.QUIT, true, true, false);
      });
      test("should hot exit (reason: QUIT, windows: multiple, empty workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.QUIT, true, false, false);
      });
      test("should hot exit (reason: RELOAD, windows: single, workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.RELOAD, false, true, false);
      });
      test("should hot exit (reason: RELOAD, windows: single, empty workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.RELOAD, false, false, false);
      });
      test("should hot exit (reason: RELOAD, windows: multiple, workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.RELOAD, true, true, false);
      });
      test("should hot exit (reason: RELOAD, windows: multiple, empty workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.RELOAD, true, false, false);
      });
      test("should hot exit (reason: LOAD, windows: single, workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.LOAD, false, true, false);
      });
      test("should NOT hot exit (reason: LOAD, windows: single, empty workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.LOAD, false, false, true);
      });
      test("should hot exit (reason: LOAD, windows: multiple, workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.LOAD, true, true, false);
      });
      test("should NOT hot exit (reason: LOAD, windows: multiple, empty workspace)", function() {
        return scratchpadHotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, ShutdownReason.LOAD, true, false, true);
      });
    });
    async function hotExitTest(setting, shutdownReason, multipleWindows, workspace, shouldVeto) {
      const { accessor: accessor2, cleanup } = await createTracker();
      const resource = toResource.call(this, "/path/index.txt");
      await accessor2.editorService.openEditor({ resource, options: { pinned: true } });
      const model = accessor2.textFileService.files.get(resource);
      accessor2.filesConfigurationService.testOnFilesConfigurationChange({ files: { hotExit: setting } });
      if (!workspace) {
        accessor2.contextService.setWorkspace(new Workspace("empty:1508317022751"));
      }
      if (multipleWindows) {
        accessor2.nativeHostService.windowCount = Promise.resolve(2);
      }
      accessor2.fileDialogService.setConfirmResult(ConfirmResult.CANCEL);
      await model?.resolve();
      model?.textEditorModel?.setValue("foo");
      assert.strictEqual(accessor2.workingCopyService.dirtyCount, 1);
      const event = new TestBeforeShutdownEvent();
      event.reason = shutdownReason;
      accessor2.lifecycleService.fireBeforeShutdown(event);
      const veto = await event.value;
      assert.ok(typeof event.finalValue === "function");
      assert.strictEqual(accessor2.workingCopyBackupService.discardedBackups.length, 0);
      assert.strictEqual(veto, shouldVeto);
      await cleanup();
    }
    async function scratchpadHotExitTest(setting, shutdownReason, multipleWindows, workspace, shouldVeto) {
      const { accessor: accessor2, cleanup } = await createTracker();
      class TestBackupWorkingCopy extends TestWorkingCopy {
        constructor(resource2) {
          super(resource2);
          this.capabilities = WorkingCopyCapabilities.Untitled | WorkingCopyCapabilities.Scratchpad;
          this._register(accessor2.workingCopyService.registerWorkingCopy(this));
        }
        isDirty() {
          return false;
        }
        isModified() {
          return true;
        }
      }
      accessor2.filesConfigurationService.testOnFilesConfigurationChange({ files: { hotExit: setting } });
      if (!workspace) {
        accessor2.contextService.setWorkspace(new Workspace("empty:1508317022751"));
      }
      if (multipleWindows) {
        accessor2.nativeHostService.windowCount = Promise.resolve(2);
      }
      accessor2.fileDialogService.setConfirmResult(ConfirmResult.CANCEL);
      const resource = toResource.call(this, "/path/custom.txt");
      disposables.add(new TestBackupWorkingCopy(resource));
      const event = new TestBeforeShutdownEvent();
      event.reason = shutdownReason;
      accessor2.lifecycleService.fireBeforeShutdown(event);
      const veto = await event.value;
      assert.ok(typeof event.finalValue === "function");
      assert.strictEqual(accessor2.workingCopyBackupService.discardedBackups.length, 0);
      assert.strictEqual(veto, shouldVeto);
      await cleanup();
    }
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx3b3JraW5nQ29weVxcdGVzdFxcZWxlY3Ryb24tYnJvd3Nlclxcd29ya2luZ0NvcHlCYWNrdXBUcmFja2VyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IE5hdGl2ZVdvcmtpbmdDb3B5QmFja3VwVHJhY2tlciB9IGZyb20gJy4uLy4uL2VsZWN0cm9uLWJyb3dzZXIvd29ya2luZ0NvcHlCYWNrdXBUcmFja2VyLmpzJztcbmltcG9ydCB7IFRleHRGaWxlRWRpdG9yTW9kZWxNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vLi4vdGV4dGZpbGUvY29tbW9uL3RleHRGaWxlRWRpdG9yTW9kZWxNYW5hZ2VyLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvclBhcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JQYXJ0LmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vd29ya2luZ0NvcHlCYWNrdXAuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSwgdG9SZXNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlc0NvbmZpZ3VyYXRpb24vY29tbW9uL2ZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi93b3JraW5nQ29weVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBIb3RFeGl0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBTaHV0ZG93blJlYXNvbiwgSUxpZmVjeWNsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UsIENvbmZpcm1SZXN1bHQsIElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgY3JlYXRlRWRpdG9yUGFydCwgcmVnaXN0ZXJUZXN0RmlsZUVkaXRvciwgVGVzdEJlZm9yZVNodXRkb3duRXZlbnQsIFRlc3RFbnZpcm9ubWVudFNlcnZpY2UsIFRlc3RGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLCBUZXN0RmlsZVNlcnZpY2UsIFRlc3RUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSwgd29ya2JlbmNoVGVhcmRvd24gfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IE1vY2tDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvdGVzdC9jb21tb24vbW9ja0tleWJpbmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBUZXN0V29ya3NwYWNlLCBXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvdGVzdC9jb21tb24vdGVzdFdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vd29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RDb250ZXh0U2VydmljZSwgVGVzdE1hcmtlclNlcnZpY2UsIFRlc3RXb3JraW5nQ29weSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlCYWNrdXAsIFdvcmtpbmdDb3B5Q2FwYWJpbGl0aWVzIH0gZnJvbSAnLi4vLi4vY29tbW9uL3dvcmtpbmdDb3B5LmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBUZXN0U2VydmljZUFjY2Vzc29yLCB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvZWxlY3Ryb24tYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5U2VydmljZS5qcyc7XG5cbnN1aXRlKCdXb3JraW5nQ29weUJhY2t1cFRyYWNrZXIgKG5hdGl2ZSknLCBmdW5jdGlvbiAoKSB7XG5cblx0Y2xhc3MgVGVzdFdvcmtpbmdDb3B5QmFja3VwVHJhY2tlciBleHRlbmRzIE5hdGl2ZVdvcmtpbmdDb3B5QmFja3VwVHJhY2tlciB7XG5cblx0XHRjb25zdHJ1Y3Rvcihcblx0XHRcdEBJV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlIHdvcmtpbmdDb3B5QmFja3VwU2VydmljZTogSVdvcmtpbmdDb3B5QmFja3VwU2VydmljZSxcblx0XHRcdEBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSBmaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdEBJV29ya2luZ0NvcHlTZXJ2aWNlIHdvcmtpbmdDb3B5U2VydmljZTogSVdvcmtpbmdDb3B5U2VydmljZSxcblx0XHRcdEBJTGlmZWN5Y2xlU2VydmljZSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRcdEBJRGlhbG9nU2VydmljZSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRcdEBJTmF0aXZlSG9zdFNlcnZpY2UgbmF0aXZlSG9zdFNlcnZpY2U6IElOYXRpdmVIb3N0U2VydmljZSxcblx0XHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRcdEBJRWRpdG9yU2VydmljZSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0XHRcdEBJV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlIHdvcmtpbmdDb3B5RWRpdG9yU2VydmljZTogSVdvcmtpbmdDb3B5RWRpdG9yU2VydmljZSxcblx0XHQpIHtcblx0XHRcdHN1cGVyKHdvcmtpbmdDb3B5QmFja3VwU2VydmljZSwgZmlsZXNDb25maWd1cmF0aW9uU2VydmljZSwgd29ya2luZ0NvcHlTZXJ2aWNlLCBsaWZlY3ljbGVTZXJ2aWNlLCBmaWxlRGlhbG9nU2VydmljZSwgZGlhbG9nU2VydmljZSwgY29udGV4dFNlcnZpY2UsIG5hdGl2ZUhvc3RTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIHByb2dyZXNzU2VydmljZSwgd29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlLCBlZGl0b3JTZXJ2aWNlKTtcblx0XHR9XG5cblx0XHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0QmFja3VwU2NoZWR1bGVEZWxheSgpOiBudW1iZXIge1xuXHRcdFx0cmV0dXJuIDEwOyAvLyBSZWR1Y2UgdGltZW91dCBmb3IgdGVzdHNcblx0XHR9XG5cblx0XHR3YWl0Rm9yUmVhZHkoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRyZXR1cm4gdGhpcy53aGVuUmVhZHk7XG5cdFx0fVxuXG5cdFx0Z2V0IHBlbmRpbmdCYWNrdXBPcGVyYXRpb25Db3VudCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5wZW5kaW5nQmFja3VwT3BlcmF0aW9ucy5zaXplOyB9XG5cblx0XHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdFx0c3VwZXIuZGlzcG9zZSgpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IFtfLCBwZW5kaW5nXSBvZiB0aGlzLnBlbmRpbmdCYWNrdXBPcGVyYXRpb25zKSB7XG5cdFx0XHRcdHBlbmRpbmcuY2FuY2VsKCk7XG5cdFx0XHRcdHBlbmRpbmcuZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXN1bWUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRyZWFkb25seSBvbkRpZFJlc3VtZSA9IHRoaXMuX29uRGlkUmVzdW1lLmV2ZW50O1xuXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTdXNwZW5kID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0cmVhZG9ubHkgb25EaWRTdXNwZW5kID0gdGhpcy5fb25EaWRTdXNwZW5kLmV2ZW50O1xuXG5cdFx0cHJvdGVjdGVkIG92ZXJyaWRlIHN1c3BlbmRCYWNrdXBPcGVyYXRpb25zKCk6IHsgcmVzdW1lOiAoKSA9PiB2b2lkIH0ge1xuXHRcdFx0Y29uc3QgeyByZXN1bWUgfSA9IHN1cGVyLnN1c3BlbmRCYWNrdXBPcGVyYXRpb25zKCk7XG5cblx0XHRcdHRoaXMuX29uRGlkU3VzcGVuZC5maXJlKCk7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJlc3VtZTogKCkgPT4ge1xuXHRcdFx0XHRcdHJlc3VtZSgpO1xuXG5cdFx0XHRcdFx0dGhpcy5fb25EaWRSZXN1bWUuZmlyZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdGxldCB0ZXN0RGlyOiBVUkk7XG5cdGxldCBiYWNrdXBIb21lOiBVUkk7XG5cdGxldCB3b3Jrc3BhY2VCYWNrdXBQYXRoOiBVUkk7XG5cblx0bGV0IGFjY2Vzc29yOiBUZXN0U2VydmljZUFjY2Vzc29yO1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHR0ZXN0RGlyID0gVVJJLmZpbGUoam9pbihnZW5lcmF0ZVV1aWQoKSwgJ3ZzY3Rlc3RzJywgJ3dvcmtpbmdjb3B5YmFja3VwdHJhY2tlcicpKS53aXRoKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5IH0pO1xuXHRcdGJhY2t1cEhvbWUgPSBqb2luUGF0aCh0ZXN0RGlyLCAnQmFja3VwcycpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZXNKc29uUGF0aCA9IGpvaW5QYXRoKGJhY2t1cEhvbWUsICd3b3Jrc3BhY2VzLmpzb24nKTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZVJlc291cmNlID0gVVJJLmZpbGUoaXNXaW5kb3dzID8gJ2M6XFxcXHdvcmtzcGFjZScgOiAnL3dvcmtzcGFjZScpLndpdGgoeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnkgfSk7XG5cdFx0d29ya3NwYWNlQmFja3VwUGF0aCA9IGpvaW5QYXRoKGJhY2t1cEhvbWUsIGhhc2god29ya3NwYWNlUmVzb3VyY2UudG9TdHJpbmcoKSkudG9TdHJpbmcoMTYpKTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBkaXNwb3NhYmxlcyk7XG5cdFx0YWNjZXNzb3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0U2VydmljZUFjY2Vzc29yKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoKDxUZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlcj5hY2Nlc3Nvci50ZXh0RmlsZVNlcnZpY2UuZmlsZXMpKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RlclRlc3RGaWxlRWRpdG9yKCkpO1xuXG5cdFx0YXdhaXQgYWNjZXNzb3IuZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKGJhY2t1cEhvbWUpO1xuXHRcdGF3YWl0IGFjY2Vzc29yLmZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcih3b3Jrc3BhY2VCYWNrdXBQYXRoKTtcblxuXHRcdHJldHVybiBhY2Nlc3Nvci5maWxlU2VydmljZS53cml0ZUZpbGUod29ya3NwYWNlc0pzb25QYXRoLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCcnKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiBjcmVhdGVUcmFja2VyKGF1dG9TYXZlRW5hYmxlZCA9IGZhbHNlKTogUHJvbWlzZTx7IGFjY2Vzc29yOiBUZXN0U2VydmljZUFjY2Vzc29yOyBwYXJ0OiBFZGl0b3JQYXJ0OyB0cmFja2VyOiBUZXN0V29ya2luZ0NvcHlCYWNrdXBUcmFja2VyOyBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlOyBjbGVhbnVwOiAoKSA9PiBQcm9taXNlPHZvaWQ+IH0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0aWYgKGF1dG9TYXZlRW5hYmxlZCkge1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2ZpbGVzJywgeyBhdXRvU2F2ZTogJ2FmdGVyRGVsYXknLCBhdXRvU2F2ZURlbGF5OiAxIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignZmlsZXMnLCB7IGF1dG9TYXZlOiAnb2ZmJywgYXV0b1NhdmVEZWxheTogMSB9KTtcblx0XHR9XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UoXG5cdFx0XHQ8SUNvbnRleHRLZXlTZXJ2aWNlPmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1vY2tDb250ZXh0S2V5U2VydmljZSksXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoVGVzdFdvcmtzcGFjZSksXG5cdFx0XHRUZXN0RW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBVcmlJZGVudGl0eVNlcnZpY2UoZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0RmlsZVNlcnZpY2UoKSkpKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEZpbGVTZXJ2aWNlKCkpLFxuXHRcdFx0bmV3IFRlc3RNYXJrZXJTZXJ2aWNlKCksXG5cdFx0XHRuZXcgVGVzdFRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKVxuXHRcdCkpKTtcblxuXHRcdGNvbnN0IHBhcnQgPSBhd2FpdCBjcmVhdGVFZGl0b3JQYXJ0KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRWRpdG9yR3JvdXBzU2VydmljZSwgcGFydCk7XG5cblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlOiBFZGl0b3JTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVkaXRvclNlcnZpY2UsIHVuZGVmaW5lZCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVkaXRvclNlcnZpY2UsIGVkaXRvclNlcnZpY2UpO1xuXG5cdFx0YWNjZXNzb3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0U2VydmljZUFjY2Vzc29yKTtcblxuXHRcdGNvbnN0IHRyYWNrZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0V29ya2luZ0NvcHlCYWNrdXBUcmFja2VyKTtcblxuXHRcdGNvbnN0IGNsZWFudXAgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBhY2Nlc3Nvci53b3JraW5nQ29weUJhY2t1cFNlcnZpY2Uud2FpdEZvckFsbEJhY2t1cHMoKTsgLy8gRmlsZSBjaGFuZ2VzIGNvdWxkIGFsc28gc2NoZWR1bGUgc29tZSBiYWNrdXAgb3BlcmF0aW9ucyBzbyB3ZSBuZWVkIHRvIHdhaXQgZm9yIHRoZW0gYmVmb3JlIGZpbmlzaGluZyB0aGUgdGVzdFxuXG5cdFx0XHRhd2FpdCB3b3JrYmVuY2hUZWFyZG93bihpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRcdHBhcnQuZGlzcG9zZSgpO1xuXHRcdFx0dHJhY2tlci5kaXNwb3NlKCk7XG5cdFx0fTtcblxuXHRcdHJldHVybiB7IGFjY2Vzc29yLCBwYXJ0LCB0cmFja2VyLCBpbnN0YW50aWF0aW9uU2VydmljZSwgY2xlYW51cCB9O1xuXHR9XG5cblx0dGVzdCgnVHJhY2sgYmFja3VwcyAoZmlsZSwgYXV0byBzYXZlIG9mZiknLCBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIHRyYWNrQmFja3Vwc1Rlc3QodG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9pbmRleC50eHQnKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdUcmFjayBiYWNrdXBzIChmaWxlLCBhdXRvIHNhdmUgb24pJywgZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiB0cmFja0JhY2t1cHNUZXN0KHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvaW5kZXgudHh0JyksIHRydWUpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0cmFja0JhY2t1cHNUZXN0KHJlc291cmNlOiBVUkksIGF1dG9TYXZlOiBib29sZWFuKSB7XG5cdFx0Y29uc3QgeyBhY2Nlc3NvciwgY2xlYW51cCB9ID0gYXdhaXQgY3JlYXRlVHJhY2tlcihhdXRvU2F2ZSk7XG5cblx0XHRhd2FpdCBhY2Nlc3Nvci5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZSwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9KTtcblxuXHRcdGNvbnN0IGZpbGVNb2RlbCA9IGFjY2Vzc29yLnRleHRGaWxlU2VydmljZS5maWxlcy5nZXQocmVzb3VyY2UpO1xuXHRcdGFzc2VydC5vayhmaWxlTW9kZWwpO1xuXHRcdGZpbGVNb2RlbC50ZXh0RWRpdG9yTW9kZWw/LnNldFZhbHVlKCdTdXBlciBHb29kJyk7XG5cblx0XHRhd2FpdCBhY2Nlc3Nvci53b3JraW5nQ29weUJhY2t1cFNlcnZpY2Uuam9pbkJhY2t1cFJlc291cmNlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXNzb3Iud29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLmhhc0JhY2t1cFN5bmMoZmlsZU1vZGVsKSwgdHJ1ZSk7XG5cblx0XHRmaWxlTW9kZWwuZGlzcG9zZSgpO1xuXG5cdFx0YXdhaXQgYWNjZXNzb3Iud29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLmpvaW5EaXNjYXJkQmFja3VwKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXNzb3Iud29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLmhhc0JhY2t1cFN5bmMoZmlsZU1vZGVsKSwgZmFsc2UpO1xuXG5cdFx0YXdhaXQgY2xlYW51cCgpO1xuXHR9XG5cblx0dGVzdCgnb25XaWxsU2h1dGRvd24gLSBubyB2ZXRvIGlmIG5vIGRpcnR5IGZpbGVzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgYWNjZXNzb3IsIGNsZWFudXAgfSA9IGF3YWl0IGNyZWF0ZVRyYWNrZXIoKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9pbmRleC50eHQnKTtcblx0XHRhd2FpdCBhY2Nlc3Nvci5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZSwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9KTtcblxuXHRcdGNvbnN0IGV2ZW50ID0gbmV3IFRlc3RCZWZvcmVTaHV0ZG93bkV2ZW50KCk7XG5cdFx0YWNjZXNzb3IubGlmZWN5Y2xlU2VydmljZS5maXJlQmVmb3JlU2h1dGRvd24oZXZlbnQpO1xuXG5cdFx0Y29uc3QgdmV0byA9IGF3YWl0IGV2ZW50LnZhbHVlO1xuXHRcdGFzc2VydC5vayghdmV0byk7XG5cblx0XHRhd2FpdCBjbGVhbnVwKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uV2lsbFNodXRkb3duIC0gdmV0byBpZiB1c2VyIGNhbmNlbHMgKGhvdC5leGl0OiBvZmYpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgYWNjZXNzb3IsIGNsZWFudXAgfSA9IGF3YWl0IGNyZWF0ZVRyYWNrZXIoKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9pbmRleC50eHQnKTtcblx0XHRhd2FpdCBhY2Nlc3Nvci5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZSwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9KTtcblxuXHRcdGNvbnN0IG1vZGVsID0gYWNjZXNzb3IudGV4dEZpbGVTZXJ2aWNlLmZpbGVzLmdldChyZXNvdXJjZSk7XG5cblx0XHRhY2Nlc3Nvci5maWxlRGlhbG9nU2VydmljZS5zZXRDb25maXJtUmVzdWx0KENvbmZpcm1SZXN1bHQuQ0FOQ0VMKTtcblx0XHRhY2Nlc3Nvci5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLnRlc3RPbkZpbGVzQ29uZmlndXJhdGlvbkNoYW5nZSh7IGZpbGVzOiB7IGhvdEV4aXQ6ICdvZmYnIH0gfSk7XG5cblx0XHRhd2FpdCBtb2RlbD8ucmVzb2x2ZSgpO1xuXHRcdG1vZGVsPy50ZXh0RWRpdG9yTW9kZWw/LnNldFZhbHVlKCdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXNzb3Iud29ya2luZ0NvcHlTZXJ2aWNlLmRpcnR5Q291bnQsIDEpO1xuXG5cdFx0Y29uc3QgZXZlbnQgPSBuZXcgVGVzdEJlZm9yZVNodXRkb3duRXZlbnQoKTtcblx0XHRhY2Nlc3Nvci5saWZlY3ljbGVTZXJ2aWNlLmZpcmVCZWZvcmVTaHV0ZG93bihldmVudCk7XG5cblx0XHRjb25zdCB2ZXRvID0gYXdhaXQgZXZlbnQudmFsdWU7XG5cdFx0YXNzZXJ0Lm9rKHZldG8pO1xuXG5cdFx0YXdhaXQgY2xlYW51cCgpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbldpbGxTaHV0ZG93biAtIG5vIHZldG8gaWYgYXV0byBzYXZlIGlzIG9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgYWNjZXNzb3IsIGNsZWFudXAgfSA9IGF3YWl0IGNyZWF0ZVRyYWNrZXIodHJ1ZSAvKiBhdXRvIHNhdmUgZW5hYmxlZCAqLyk7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvaW5kZXgudHh0Jyk7XG5cdFx0YXdhaXQgYWNjZXNzb3IuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2UsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGFjY2Vzc29yLnRleHRGaWxlU2VydmljZS5maWxlcy5nZXQocmVzb3VyY2UpO1xuXG5cdFx0YXdhaXQgbW9kZWw/LnJlc29sdmUoKTtcblx0XHRtb2RlbD8udGV4dEVkaXRvck1vZGVsPy5zZXRWYWx1ZSgnZm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS5kaXJ0eUNvdW50LCAxKTtcblxuXHRcdGNvbnN0IGV2ZW50ID0gbmV3IFRlc3RCZWZvcmVTaHV0ZG93bkV2ZW50KCk7XG5cdFx0YWNjZXNzb3IubGlmZWN5Y2xlU2VydmljZS5maXJlQmVmb3JlU2h1dGRvd24oZXZlbnQpO1xuXG5cdFx0Y29uc3QgdmV0byA9IGF3YWl0IGV2ZW50LnZhbHVlO1xuXHRcdGFzc2VydC5vayghdmV0byk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXNzb3Iud29ya2luZ0NvcHlTZXJ2aWNlLmRpcnR5Q291bnQsIDApO1xuXG5cdFx0YXdhaXQgY2xlYW51cCgpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbldpbGxTaHV0ZG93biAtIG5vIHZldG8gYW5kIGJhY2t1cHMgY2xlYW5lZCB1cCBpZiB1c2VyIGRvZXMgbm90IHdhbnQgdG8gc2F2ZSAoaG90LmV4aXQ6IG9mZiknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBhY2Nlc3NvciwgY2xlYW51cCB9ID0gYXdhaXQgY3JlYXRlVHJhY2tlcigpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2luZGV4LnR4dCcpO1xuXHRcdGF3YWl0IGFjY2Vzc29yLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0pO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBhY2Nlc3Nvci50ZXh0RmlsZVNlcnZpY2UuZmlsZXMuZ2V0KHJlc291cmNlKTtcblxuXHRcdGFjY2Vzc29yLmZpbGVEaWFsb2dTZXJ2aWNlLnNldENvbmZpcm1SZXN1bHQoQ29uZmlybVJlc3VsdC5ET05UX1NBVkUpO1xuXHRcdGFjY2Vzc29yLmZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UudGVzdE9uRmlsZXNDb25maWd1cmF0aW9uQ2hhbmdlKHsgZmlsZXM6IHsgaG90RXhpdDogJ29mZicgfSB9KTtcblxuXHRcdGF3YWl0IG1vZGVsPy5yZXNvbHZlKCk7XG5cdFx0bW9kZWw/LnRleHRFZGl0b3JNb2RlbD8uc2V0VmFsdWUoJ2ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2UuZGlydHlDb3VudCwgMSk7XG5cdFx0Y29uc3QgZXZlbnQgPSBuZXcgVGVzdEJlZm9yZVNodXRkb3duRXZlbnQoKTtcblx0XHRhY2Nlc3Nvci5saWZlY3ljbGVTZXJ2aWNlLmZpcmVCZWZvcmVTaHV0ZG93bihldmVudCk7XG5cblx0XHRjb25zdCB2ZXRvID0gYXdhaXQgZXZlbnQudmFsdWU7XG5cdFx0YXNzZXJ0Lm9rKCF2ZXRvKTtcblx0XHRhc3NlcnQub2soYWNjZXNzb3Iud29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLmRpc2NhcmRlZEJhY2t1cHMubGVuZ3RoID4gMCk7XG5cblx0XHRhd2FpdCBjbGVhbnVwKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uV2lsbFNodXRkb3duIC0gbm8gYmFja3VwcyBkaXNjYXJkZWQgd2hlbiBzaHV0ZG93biB3aXRob3V0IGRpcnR5IGJ1dCB0cmFja2VyIG5vdCByZWFkeScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IGFjY2Vzc29yLCBjbGVhbnVwIH0gPSBhd2FpdCBjcmVhdGVUcmFja2VyKCk7XG5cblx0XHRjb25zdCBldmVudCA9IG5ldyBUZXN0QmVmb3JlU2h1dGRvd25FdmVudCgpO1xuXHRcdGFjY2Vzc29yLmxpZmVjeWNsZVNlcnZpY2UuZmlyZUJlZm9yZVNodXRkb3duKGV2ZW50KTtcblxuXHRcdGNvbnN0IHZldG8gPSBhd2FpdCBldmVudC52YWx1ZTtcblx0XHRhc3NlcnQub2soIXZldG8pO1xuXHRcdGFzc2VydC5vayghYWNjZXNzb3Iud29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLmRpc2NhcmRlZEFsbEJhY2t1cHMpO1xuXG5cdFx0YXdhaXQgY2xlYW51cCgpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbldpbGxTaHV0ZG93biAtIGJhY2t1cHMgZGlzY2FyZGVkIHdoZW4gc2h1dGRvd24gd2l0aG91dCBkaXJ0eScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IGFjY2Vzc29yLCB0cmFja2VyLCBjbGVhbnVwIH0gPSBhd2FpdCBjcmVhdGVUcmFja2VyKCk7XG5cblx0XHRhd2FpdCB0cmFja2VyLndhaXRGb3JSZWFkeSgpO1xuXG5cdFx0Y29uc3QgZXZlbnQgPSBuZXcgVGVzdEJlZm9yZVNodXRkb3duRXZlbnQoKTtcblx0XHRhY2Nlc3Nvci5saWZlY3ljbGVTZXJ2aWNlLmZpcmVCZWZvcmVTaHV0ZG93bihldmVudCk7XG5cblx0XHRjb25zdCB2ZXRvID0gYXdhaXQgZXZlbnQudmFsdWU7XG5cdFx0YXNzZXJ0Lm9rKCF2ZXRvKTtcblx0XHRhc3NlcnQub2soYWNjZXNzb3Iud29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLmRpc2NhcmRlZEFsbEJhY2t1cHMpO1xuXG5cdFx0YXdhaXQgY2xlYW51cCgpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbldpbGxTaHV0ZG93biAtIHNhdmUgKGhvdC5leGl0OiBvZmYpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgYWNjZXNzb3IsIGNsZWFudXAgfSA9IGF3YWl0IGNyZWF0ZVRyYWNrZXIoKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9pbmRleC50eHQnKTtcblx0XHRhd2FpdCBhY2Nlc3Nvci5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZSwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9KTtcblxuXHRcdGNvbnN0IG1vZGVsID0gYWNjZXNzb3IudGV4dEZpbGVTZXJ2aWNlLmZpbGVzLmdldChyZXNvdXJjZSk7XG5cblx0XHRhY2Nlc3Nvci5maWxlRGlhbG9nU2VydmljZS5zZXRDb25maXJtUmVzdWx0KENvbmZpcm1SZXN1bHQuU0FWRSk7XG5cdFx0YWNjZXNzb3IuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS50ZXN0T25GaWxlc0NvbmZpZ3VyYXRpb25DaGFuZ2UoeyBmaWxlczogeyBob3RFeGl0OiAnb2ZmJyB9IH0pO1xuXG5cdFx0YXdhaXQgbW9kZWw/LnJlc29sdmUoKTtcblx0XHRtb2RlbD8udGV4dEVkaXRvck1vZGVsPy5zZXRWYWx1ZSgnZm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS5kaXJ0eUNvdW50LCAxKTtcblx0XHRjb25zdCBldmVudCA9IG5ldyBUZXN0QmVmb3JlU2h1dGRvd25FdmVudCgpO1xuXHRcdGFjY2Vzc29yLmxpZmVjeWNsZVNlcnZpY2UuZmlyZUJlZm9yZVNodXRkb3duKGV2ZW50KTtcblxuXHRcdGNvbnN0IHZldG8gPSBhd2FpdCBldmVudC52YWx1ZTtcblx0XHRhc3NlcnQub2soIXZldG8pO1xuXHRcdGFzc2VydC5vayghbW9kZWw/LmlzRGlydHkoKSk7XG5cblx0XHRhd2FpdCBjbGVhbnVwKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uV2lsbFNodXRkb3duIC0gdmV0byBpZiBiYWNrdXAgZmFpbHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBhY2Nlc3NvciwgY2xlYW51cCB9ID0gYXdhaXQgY3JlYXRlVHJhY2tlcigpO1xuXG5cdFx0Y2xhc3MgVGVzdEJhY2t1cFdvcmtpbmdDb3B5IGV4dGVuZHMgVGVzdFdvcmtpbmdDb3B5IHtcblxuXHRcdFx0Y29uc3RydWN0b3IocmVzb3VyY2U6IFVSSSkge1xuXHRcdFx0XHRzdXBlcihyZXNvdXJjZSk7XG5cblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWNjZXNzb3Iud29ya2luZ0NvcHlTZXJ2aWNlLnJlZ2lzdGVyV29ya2luZ0NvcHkodGhpcykpO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBhc3luYyBiYWNrdXAodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJV29ya2luZ0NvcHlCYWNrdXA+IHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCd1bmFibGUgdG8gYmFja3VwJyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2N1c3RvbS50eHQnKTtcblx0XHRjb25zdCBjdXN0b21Xb3JraW5nQ29weSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEJhY2t1cFdvcmtpbmdDb3B5KHJlc291cmNlKSk7XG5cdFx0Y3VzdG9tV29ya2luZ0NvcHkuc2V0RGlydHkodHJ1ZSk7XG5cblx0XHRjb25zdCBldmVudCA9IG5ldyBUZXN0QmVmb3JlU2h1dGRvd25FdmVudCgpO1xuXHRcdGV2ZW50LnJlYXNvbiA9IFNodXRkb3duUmVhc29uLlFVSVQ7XG5cdFx0YWNjZXNzb3IubGlmZWN5Y2xlU2VydmljZS5maXJlQmVmb3JlU2h1dGRvd24oZXZlbnQpO1xuXG5cdFx0Y29uc3QgdmV0byA9IGF3YWl0IGV2ZW50LnZhbHVlO1xuXHRcdGFzc2VydC5vayh2ZXRvKTtcblxuXHRcdGNvbnN0IGZpbmFsVmV0byA9IGF3YWl0IGV2ZW50LmZpbmFsVmFsdWU/LigpO1xuXHRcdGFzc2VydC5vayhmaW5hbFZldG8pOyAvLyBhc3NlcnQgdGhlIHRyYWNrZXIgdXNlcyB0aGUgaW50ZXJuYWwgZmluYWxWZXRvIEFQSVxuXG5cdFx0YXdhaXQgY2xlYW51cCgpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbldpbGxTaHV0ZG93biAtIHNjcmF0Y2hwYWRzIC0gdmV0byBpZiBiYWNrdXAgZmFpbHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBhY2Nlc3NvciwgY2xlYW51cCB9ID0gYXdhaXQgY3JlYXRlVHJhY2tlcigpO1xuXG5cdFx0Y2xhc3MgVGVzdEJhY2t1cFdvcmtpbmdDb3B5IGV4dGVuZHMgVGVzdFdvcmtpbmdDb3B5IHtcblxuXHRcdFx0Y29uc3RydWN0b3IocmVzb3VyY2U6IFVSSSkge1xuXHRcdFx0XHRzdXBlcihyZXNvdXJjZSk7XG5cblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWNjZXNzb3Iud29ya2luZ0NvcHlTZXJ2aWNlLnJlZ2lzdGVyV29ya2luZ0NvcHkodGhpcykpO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBjYXBhYmlsaXRpZXMgPSBXb3JraW5nQ29weUNhcGFiaWxpdGllcy5VbnRpdGxlZCB8IFdvcmtpbmdDb3B5Q2FwYWJpbGl0aWVzLlNjcmF0Y2hwYWQ7XG5cblx0XHRcdG92ZXJyaWRlIGFzeW5jIGJhY2t1cCh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElXb3JraW5nQ29weUJhY2t1cD4ge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3VuYWJsZSB0byBiYWNrdXAnKTtcblx0XHRcdH1cblxuXHRcdFx0b3ZlcnJpZGUgaXNEaXJ0eSgpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBpc01vZGlmaWVkKCk6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvY3VzdG9tLnR4dCcpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEJhY2t1cFdvcmtpbmdDb3B5KHJlc291cmNlKSk7XG5cblx0XHRjb25zdCBldmVudCA9IG5ldyBUZXN0QmVmb3JlU2h1dGRvd25FdmVudCgpO1xuXHRcdGV2ZW50LnJlYXNvbiA9IFNodXRkb3duUmVhc29uLlFVSVQ7XG5cdFx0YWNjZXNzb3IubGlmZWN5Y2xlU2VydmljZS5maXJlQmVmb3JlU2h1dGRvd24oZXZlbnQpO1xuXG5cdFx0Y29uc3QgdmV0byA9IGF3YWl0IGV2ZW50LnZhbHVlO1xuXHRcdGFzc2VydC5vayh2ZXRvKTtcblxuXHRcdGNvbnN0IGZpbmFsVmV0byA9IGF3YWl0IGV2ZW50LmZpbmFsVmFsdWU/LigpO1xuXHRcdGFzc2VydC5vayhmaW5hbFZldG8pOyAvLyBhc3NlcnQgdGhlIHRyYWNrZXIgdXNlcyB0aGUgaW50ZXJuYWwgZmluYWxWZXRvIEFQSVxuXG5cdFx0YXdhaXQgY2xlYW51cCgpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbldpbGxTaHV0ZG93biAtIHBlbmRpbmcgYmFja3VwIG9wZXJhdGlvbnMgY2FuY2VsZWQgYW5kIHRyYWNrZXIgc3VzcGVuZGVkL3Jlc3Vtc2VkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgYWNjZXNzb3IsIHRyYWNrZXIsIGNsZWFudXAgfSA9IGF3YWl0IGNyZWF0ZVRyYWNrZXIoKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gdG9SZXNvdXJjZS5jYWxsKHRoaXMsICcvcGF0aC9pbmRleC50eHQnKTtcblx0XHRhd2FpdCBhY2Nlc3Nvci5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZSwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9KTtcblxuXHRcdGNvbnN0IG1vZGVsID0gYWNjZXNzb3IudGV4dEZpbGVTZXJ2aWNlLmZpbGVzLmdldChyZXNvdXJjZSk7XG5cblx0XHRhd2FpdCBtb2RlbD8ucmVzb2x2ZSgpO1xuXHRcdG1vZGVsPy50ZXh0RWRpdG9yTW9kZWw/LnNldFZhbHVlKCdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXNzb3Iud29ya2luZ0NvcHlTZXJ2aWNlLmRpcnR5Q291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLnBlbmRpbmdCYWNrdXBPcGVyYXRpb25Db3VudCwgMSk7XG5cblx0XHRjb25zdCBvblN1c3BlbmQgPSBFdmVudC50b1Byb21pc2UodHJhY2tlci5vbkRpZFN1c3BlbmQpO1xuXG5cdFx0Y29uc3QgZXZlbnQgPSBuZXcgVGVzdEJlZm9yZVNodXRkb3duRXZlbnQoKTtcblx0XHRldmVudC5yZWFzb24gPSBTaHV0ZG93blJlYXNvbi5RVUlUO1xuXHRcdGFjY2Vzc29yLmxpZmVjeWNsZVNlcnZpY2UuZmlyZUJlZm9yZVNodXRkb3duKGV2ZW50KTtcblxuXHRcdGF3YWl0IG9uU3VzcGVuZDtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLnBlbmRpbmdCYWNrdXBPcGVyYXRpb25Db3VudCwgMCk7XG5cblx0XHQvLyBPcHMgYXJlIHN1c3BlbmRlZCBkdXJpbmcgc2h1dGRvd24hXG5cdFx0bW9kZWw/LnRleHRFZGl0b3JNb2RlbD8uc2V0VmFsdWUoJ2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2UuZGlydHlDb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIucGVuZGluZ0JhY2t1cE9wZXJhdGlvbkNvdW50LCAwKTtcblxuXHRcdGNvbnN0IG9uUmVzdW1lID0gRXZlbnQudG9Qcm9taXNlKHRyYWNrZXIub25EaWRSZXN1bWUpO1xuXHRcdGF3YWl0IGV2ZW50LnZhbHVlO1xuXG5cdFx0Ly8gT3BzIGFyZSByZXN1bWVkIGFmdGVyIHNodXRkb3duIVxuXHRcdG1vZGVsPy50ZXh0RWRpdG9yTW9kZWw/LnNldFZhbHVlKCdmb28nKTtcblx0XHRhd2FpdCBvblJlc3VtZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5wZW5kaW5nQmFja3VwT3BlcmF0aW9uQ291bnQsIDEpO1xuXG5cdFx0YXdhaXQgY2xlYW51cCgpO1xuXHR9KTtcblxuXHRzdWl0ZSgnSG90IEV4aXQnLCAoKSA9PiB7XG5cdFx0c3VpdGUoJ1wib25FeGl0XCIgc2V0dGluZycsICgpID0+IHtcblx0XHRcdHRlc3QoJ3Nob3VsZCBob3QgZXhpdCBvbiBub24tTWFjIChyZWFzb246IENMT1NFLCB3aW5kb3dzOiBzaW5nbGUsIHdvcmtzcGFjZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHJldHVybiBob3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVQsIFNodXRkb3duUmVhc29uLkNMT1NFLCBmYWxzZSwgdHJ1ZSwgISFpc01hY2ludG9zaCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ3Nob3VsZCBob3QgZXhpdCBvbiBub24tTWFjIChyZWFzb246IENMT1NFLCB3aW5kb3dzOiBzaW5nbGUsIGVtcHR5IHdvcmtzcGFjZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHJldHVybiBob3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVQsIFNodXRkb3duUmVhc29uLkNMT1NFLCBmYWxzZSwgZmFsc2UsICEhaXNNYWNpbnRvc2gpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzaG91bGQgTk9UIGhvdCBleGl0IChyZWFzb246IENMT1NFLCB3aW5kb3dzOiBtdWx0aXBsZSwgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIGhvdEV4aXRUZXN0LmNhbGwodGhpcywgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVCwgU2h1dGRvd25SZWFzb24uQ0xPU0UsIHRydWUsIHRydWUsIHRydWUpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzaG91bGQgTk9UIGhvdCBleGl0IChyZWFzb246IENMT1NFLCB3aW5kb3dzOiBtdWx0aXBsZSwgZW1wdHkgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIGhvdEV4aXRUZXN0LmNhbGwodGhpcywgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVCwgU2h1dGRvd25SZWFzb24uQ0xPU0UsIHRydWUsIGZhbHNlLCB0cnVlKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnc2hvdWxkIGhvdCBleGl0IChyZWFzb246IFFVSVQsIHdpbmRvd3M6IHNpbmdsZSwgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIGhvdEV4aXRUZXN0LmNhbGwodGhpcywgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVCwgU2h1dGRvd25SZWFzb24uUVVJVCwgZmFsc2UsIHRydWUsIGZhbHNlKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnc2hvdWxkIGhvdCBleGl0IChyZWFzb246IFFVSVQsIHdpbmRvd3M6IHNpbmdsZSwgZW1wdHkgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIGhvdEV4aXRUZXN0LmNhbGwodGhpcywgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVCwgU2h1dGRvd25SZWFzb24uUVVJVCwgZmFsc2UsIGZhbHNlLCBmYWxzZSk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ3Nob3VsZCBob3QgZXhpdCAocmVhc29uOiBRVUlULCB3aW5kb3dzOiBtdWx0aXBsZSwgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIGhvdEV4aXRUZXN0LmNhbGwodGhpcywgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVCwgU2h1dGRvd25SZWFzb24uUVVJVCwgdHJ1ZSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzaG91bGQgaG90IGV4aXQgKHJlYXNvbjogUVVJVCwgd2luZG93czogbXVsdGlwbGUsIGVtcHR5IHdvcmtzcGFjZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHJldHVybiBob3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVQsIFNodXRkb3duUmVhc29uLlFVSVQsIHRydWUsIGZhbHNlLCBmYWxzZSk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ3Nob3VsZCBob3QgZXhpdCAocmVhc29uOiBSRUxPQUQsIHdpbmRvd3M6IHNpbmdsZSwgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIGhvdEV4aXRUZXN0LmNhbGwodGhpcywgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVCwgU2h1dGRvd25SZWFzb24uUkVMT0FELCBmYWxzZSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzaG91bGQgaG90IGV4aXQgKHJlYXNvbjogUkVMT0FELCB3aW5kb3dzOiBzaW5nbGUsIGVtcHR5IHdvcmtzcGFjZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHJldHVybiBob3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVQsIFNodXRkb3duUmVhc29uLlJFTE9BRCwgZmFsc2UsIGZhbHNlLCBmYWxzZSk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ3Nob3VsZCBob3QgZXhpdCAocmVhc29uOiBSRUxPQUQsIHdpbmRvd3M6IG11bHRpcGxlLCB3b3Jrc3BhY2UpJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRyZXR1cm4gaG90RXhpdFRlc3QuY2FsbCh0aGlzLCBIb3RFeGl0Q29uZmlndXJhdGlvbi5PTl9FWElULCBTaHV0ZG93blJlYXNvbi5SRUxPQUQsIHRydWUsIHRydWUsIGZhbHNlKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnc2hvdWxkIGhvdCBleGl0IChyZWFzb246IFJFTE9BRCwgd2luZG93czogbXVsdGlwbGUsIGVtcHR5IHdvcmtzcGFjZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHJldHVybiBob3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVQsIFNodXRkb3duUmVhc29uLlJFTE9BRCwgdHJ1ZSwgZmFsc2UsIGZhbHNlKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnc2hvdWxkIE5PVCBob3QgZXhpdCAocmVhc29uOiBMT0FELCB3aW5kb3dzOiBzaW5nbGUsIHdvcmtzcGFjZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHJldHVybiBob3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVQsIFNodXRkb3duUmVhc29uLkxPQUQsIGZhbHNlLCB0cnVlLCB0cnVlKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnc2hvdWxkIE5PVCBob3QgZXhpdCAocmVhc29uOiBMT0FELCB3aW5kb3dzOiBzaW5nbGUsIGVtcHR5IHdvcmtzcGFjZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHJldHVybiBob3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVQsIFNodXRkb3duUmVhc29uLkxPQUQsIGZhbHNlLCBmYWxzZSwgdHJ1ZSk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ3Nob3VsZCBOT1QgaG90IGV4aXQgKHJlYXNvbjogTE9BRCwgd2luZG93czogbXVsdGlwbGUsIHdvcmtzcGFjZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHJldHVybiBob3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVQsIFNodXRkb3duUmVhc29uLkxPQUQsIHRydWUsIHRydWUsIHRydWUpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzaG91bGQgTk9UIGhvdCBleGl0IChyZWFzb246IExPQUQsIHdpbmRvd3M6IG11bHRpcGxlLCBlbXB0eSB3b3Jrc3BhY2UpJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRyZXR1cm4gaG90RXhpdFRlc3QuY2FsbCh0aGlzLCBIb3RFeGl0Q29uZmlndXJhdGlvbi5PTl9FWElULCBTaHV0ZG93blJlYXNvbi5MT0FELCB0cnVlLCBmYWxzZSwgdHJ1ZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdcIm9uRXhpdEFuZFdpbmRvd0Nsb3NlXCIgc2V0dGluZycsICgpID0+IHtcblx0XHRcdHRlc3QoJ3Nob3VsZCBob3QgZXhpdCAocmVhc29uOiBDTE9TRSwgd2luZG93czogc2luZ2xlLCB3b3Jrc3BhY2UpJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRyZXR1cm4gaG90RXhpdFRlc3QuY2FsbCh0aGlzLCBIb3RFeGl0Q29uZmlndXJhdGlvbi5PTl9FWElUX0FORF9XSU5ET1dfQ0xPU0UsIFNodXRkb3duUmVhc29uLkNMT1NFLCBmYWxzZSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzaG91bGQgaG90IGV4aXQgKHJlYXNvbjogQ0xPU0UsIHdpbmRvd3M6IHNpbmdsZSwgZW1wdHkgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIGhvdEV4aXRUZXN0LmNhbGwodGhpcywgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVF9BTkRfV0lORE9XX0NMT1NFLCBTaHV0ZG93blJlYXNvbi5DTE9TRSwgZmFsc2UsIGZhbHNlLCAhIWlzTWFjaW50b3NoKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnc2hvdWxkIGhvdCBleGl0IChyZWFzb246IENMT1NFLCB3aW5kb3dzOiBtdWx0aXBsZSwgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIGhvdEV4aXRUZXN0LmNhbGwodGhpcywgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVF9BTkRfV0lORE9XX0NMT1NFLCBTaHV0ZG93blJlYXNvbi5DTE9TRSwgdHJ1ZSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzaG91bGQgTk9UIGhvdCBleGl0IChyZWFzb246IENMT1NFLCB3aW5kb3dzOiBtdWx0aXBsZSwgZW1wdHkgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIGhvdEV4aXRUZXN0LmNhbGwodGhpcywgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVF9BTkRfV0lORE9XX0NMT1NFLCBTaHV0ZG93blJlYXNvbi5DTE9TRSwgdHJ1ZSwgZmFsc2UsIHRydWUpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzaG91bGQgaG90IGV4aXQgKHJlYXNvbjogUVVJVCwgd2luZG93czogc2luZ2xlLCB3b3Jrc3BhY2UpJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRyZXR1cm4gaG90RXhpdFRlc3QuY2FsbCh0aGlzLCBIb3RFeGl0Q29uZmlndXJhdGlvbi5PTl9FWElUX0FORF9XSU5ET1dfQ0xPU0UsIFNodXRkb3duUmVhc29uLlFVSVQsIGZhbHNlLCB0cnVlLCBmYWxzZSk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ3Nob3VsZCBob3QgZXhpdCAocmVhc29uOiBRVUlULCB3aW5kb3dzOiBzaW5nbGUsIGVtcHR5IHdvcmtzcGFjZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHJldHVybiBob3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVRfQU5EX1dJTkRPV19DTE9TRSwgU2h1dGRvd25SZWFzb24uUVVJVCwgZmFsc2UsIGZhbHNlLCBmYWxzZSk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ3Nob3VsZCBob3QgZXhpdCAocmVhc29uOiBRVUlULCB3aW5kb3dzOiBtdWx0aXBsZSwgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIGhvdEV4aXRUZXN0LmNhbGwodGhpcywgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVF9BTkRfV0lORE9XX0NMT1NFLCBTaHV0ZG93blJlYXNvbi5RVUlULCB0cnVlLCB0cnVlLCBmYWxzZSk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ3Nob3VsZCBob3QgZXhpdCAocmVhc29uOiBRVUlULCB3aW5kb3dzOiBtdWx0aXBsZSwgZW1wdHkgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIGhvdEV4aXRUZXN0LmNhbGwodGhpcywgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVF9BTkRfV0lORE9XX0NMT1NFLCBTaHV0ZG93blJlYXNvbi5RVUlULCB0cnVlLCBmYWxzZSwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzaG91bGQgaG90IGV4aXQgKHJlYXNvbjogUkVMT0FELCB3aW5kb3dzOiBzaW5nbGUsIHdvcmtzcGFjZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHJldHVybiBob3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVRfQU5EX1dJTkRPV19DTE9TRSwgU2h1dGRvd25SZWFzb24uUkVMT0FELCBmYWxzZSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzaG91bGQgaG90IGV4aXQgKHJlYXNvbjogUkVMT0FELCB3aW5kb3dzOiBzaW5nbGUsIGVtcHR5IHdvcmtzcGFjZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHJldHVybiBob3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVRfQU5EX1dJTkRPV19DTE9TRSwgU2h1dGRvd25SZWFzb24uUkVMT0FELCBmYWxzZSwgZmFsc2UsIGZhbHNlKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnc2hvdWxkIGhvdCBleGl0IChyZWFzb246IFJFTE9BRCwgd2luZG93czogbXVsdGlwbGUsIHdvcmtzcGFjZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHJldHVybiBob3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVRfQU5EX1dJTkRPV19DTE9TRSwgU2h1dGRvd25SZWFzb24uUkVMT0FELCB0cnVlLCB0cnVlLCBmYWxzZSk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ3Nob3VsZCBob3QgZXhpdCAocmVhc29uOiBSRUxPQUQsIHdpbmRvd3M6IG11bHRpcGxlLCBlbXB0eSB3b3Jrc3BhY2UpJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRyZXR1cm4gaG90RXhpdFRlc3QuY2FsbCh0aGlzLCBIb3RFeGl0Q29uZmlndXJhdGlvbi5PTl9FWElUX0FORF9XSU5ET1dfQ0xPU0UsIFNodXRkb3duUmVhc29uLlJFTE9BRCwgdHJ1ZSwgZmFsc2UsIGZhbHNlKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnc2hvdWxkIGhvdCBleGl0IChyZWFzb246IExPQUQsIHdpbmRvd3M6IHNpbmdsZSwgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIGhvdEV4aXRUZXN0LmNhbGwodGhpcywgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVF9BTkRfV0lORE9XX0NMT1NFLCBTaHV0ZG93blJlYXNvbi5MT0FELCBmYWxzZSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzaG91bGQgTk9UIGhvdCBleGl0IChyZWFzb246IExPQUQsIHdpbmRvd3M6IHNpbmdsZSwgZW1wdHkgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIGhvdEV4aXRUZXN0LmNhbGwodGhpcywgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVF9BTkRfV0lORE9XX0NMT1NFLCBTaHV0ZG93blJlYXNvbi5MT0FELCBmYWxzZSwgZmFsc2UsIHRydWUpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzaG91bGQgaG90IGV4aXQgKHJlYXNvbjogTE9BRCwgd2luZG93czogbXVsdGlwbGUsIHdvcmtzcGFjZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHJldHVybiBob3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVRfQU5EX1dJTkRPV19DTE9TRSwgU2h1dGRvd25SZWFzb24uTE9BRCwgdHJ1ZSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzaG91bGQgTk9UIGhvdCBleGl0IChyZWFzb246IExPQUQsIHdpbmRvd3M6IG11bHRpcGxlLCBlbXB0eSB3b3Jrc3BhY2UpJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRyZXR1cm4gaG90RXhpdFRlc3QuY2FsbCh0aGlzLCBIb3RFeGl0Q29uZmlndXJhdGlvbi5PTl9FWElUX0FORF9XSU5ET1dfQ0xPU0UsIFNodXRkb3duUmVhc29uLkxPQUQsIHRydWUsIGZhbHNlLCB0cnVlKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ1wib25FeGl0XCIgc2V0dGluZyAtIHNjcmF0Y2hwYWQnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdzaG91bGQgaG90IGV4aXQgKHJlYXNvbjogQ0xPU0UsIHdpbmRvd3M6IHNpbmdsZSwgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIHNjcmF0Y2hwYWRIb3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVQsIFNodXRkb3duUmVhc29uLkNMT1NFLCBmYWxzZSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzaG91bGQgaG90IGV4aXQgKHJlYXNvbjogQ0xPU0UsIHdpbmRvd3M6IHNpbmdsZSwgZW1wdHkgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIHNjcmF0Y2hwYWRIb3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVQsIFNodXRkb3duUmVhc29uLkNMT1NFLCBmYWxzZSwgZmFsc2UsICEhaXNNYWNpbnRvc2gpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzaG91bGQgaG90IGV4aXQgKHJlYXNvbjogQ0xPU0UsIHdpbmRvd3M6IG11bHRpcGxlLCB3b3Jrc3BhY2UpJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRyZXR1cm4gc2NyYXRjaHBhZEhvdEV4aXRUZXN0LmNhbGwodGhpcywgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVCwgU2h1dGRvd25SZWFzb24uQ0xPU0UsIHRydWUsIHRydWUsIGZhbHNlKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnc2hvdWxkIE5PVCBob3QgZXhpdCAocmVhc29uOiBDTE9TRSwgd2luZG93czogbXVsdGlwbGUsIGVtcHR5IHdvcmtzcGFjZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHJldHVybiBzY3JhdGNocGFkSG90RXhpdFRlc3QuY2FsbCh0aGlzLCBIb3RFeGl0Q29uZmlndXJhdGlvbi5PTl9FWElULCBTaHV0ZG93blJlYXNvbi5DTE9TRSwgdHJ1ZSwgZmFsc2UsIHRydWUpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzaG91bGQgaG90IGV4aXQgKHJlYXNvbjogUVVJVCwgd2luZG93czogc2luZ2xlLCB3b3Jrc3BhY2UpJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRyZXR1cm4gc2NyYXRjaHBhZEhvdEV4aXRUZXN0LmNhbGwodGhpcywgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVCwgU2h1dGRvd25SZWFzb24uUVVJVCwgZmFsc2UsIHRydWUsIGZhbHNlKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnc2hvdWxkIGhvdCBleGl0IChyZWFzb246IFFVSVQsIHdpbmRvd3M6IHNpbmdsZSwgZW1wdHkgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIHNjcmF0Y2hwYWRIb3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVQsIFNodXRkb3duUmVhc29uLlFVSVQsIGZhbHNlLCBmYWxzZSwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzaG91bGQgaG90IGV4aXQgKHJlYXNvbjogUVVJVCwgd2luZG93czogbXVsdGlwbGUsIHdvcmtzcGFjZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHJldHVybiBzY3JhdGNocGFkSG90RXhpdFRlc3QuY2FsbCh0aGlzLCBIb3RFeGl0Q29uZmlndXJhdGlvbi5PTl9FWElULCBTaHV0ZG93blJlYXNvbi5RVUlULCB0cnVlLCB0cnVlLCBmYWxzZSk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ3Nob3VsZCBob3QgZXhpdCAocmVhc29uOiBRVUlULCB3aW5kb3dzOiBtdWx0aXBsZSwgZW1wdHkgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIHNjcmF0Y2hwYWRIb3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVQsIFNodXRkb3duUmVhc29uLlFVSVQsIHRydWUsIGZhbHNlLCBmYWxzZSk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ3Nob3VsZCBob3QgZXhpdCAocmVhc29uOiBSRUxPQUQsIHdpbmRvd3M6IHNpbmdsZSwgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIHNjcmF0Y2hwYWRIb3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVQsIFNodXRkb3duUmVhc29uLlJFTE9BRCwgZmFsc2UsIHRydWUsIGZhbHNlKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnc2hvdWxkIGhvdCBleGl0IChyZWFzb246IFJFTE9BRCwgd2luZG93czogc2luZ2xlLCBlbXB0eSB3b3Jrc3BhY2UpJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRyZXR1cm4gc2NyYXRjaHBhZEhvdEV4aXRUZXN0LmNhbGwodGhpcywgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVCwgU2h1dGRvd25SZWFzb24uUkVMT0FELCBmYWxzZSwgZmFsc2UsIGZhbHNlKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnc2hvdWxkIGhvdCBleGl0IChyZWFzb246IFJFTE9BRCwgd2luZG93czogbXVsdGlwbGUsIHdvcmtzcGFjZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHJldHVybiBzY3JhdGNocGFkSG90RXhpdFRlc3QuY2FsbCh0aGlzLCBIb3RFeGl0Q29uZmlndXJhdGlvbi5PTl9FWElULCBTaHV0ZG93blJlYXNvbi5SRUxPQUQsIHRydWUsIHRydWUsIGZhbHNlKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnc2hvdWxkIGhvdCBleGl0IChyZWFzb246IFJFTE9BRCwgd2luZG93czogbXVsdGlwbGUsIGVtcHR5IHdvcmtzcGFjZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHJldHVybiBzY3JhdGNocGFkSG90RXhpdFRlc3QuY2FsbCh0aGlzLCBIb3RFeGl0Q29uZmlndXJhdGlvbi5PTl9FWElULCBTaHV0ZG93blJlYXNvbi5SRUxPQUQsIHRydWUsIGZhbHNlLCBmYWxzZSk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ3Nob3VsZCBob3QgZXhpdCAocmVhc29uOiBMT0FELCB3aW5kb3dzOiBzaW5nbGUsIHdvcmtzcGFjZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHJldHVybiBzY3JhdGNocGFkSG90RXhpdFRlc3QuY2FsbCh0aGlzLCBIb3RFeGl0Q29uZmlndXJhdGlvbi5PTl9FWElULCBTaHV0ZG93blJlYXNvbi5MT0FELCBmYWxzZSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzaG91bGQgTk9UIGhvdCBleGl0IChyZWFzb246IExPQUQsIHdpbmRvd3M6IHNpbmdsZSwgZW1wdHkgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIHNjcmF0Y2hwYWRIb3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVQsIFNodXRkb3duUmVhc29uLkxPQUQsIGZhbHNlLCBmYWxzZSwgdHJ1ZSk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ3Nob3VsZCBob3QgZXhpdCAocmVhc29uOiBMT0FELCB3aW5kb3dzOiBtdWx0aXBsZSwgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIHNjcmF0Y2hwYWRIb3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVQsIFNodXRkb3duUmVhc29uLkxPQUQsIHRydWUsIHRydWUsIGZhbHNlKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnc2hvdWxkIE5PVCBob3QgZXhpdCAocmVhc29uOiBMT0FELCB3aW5kb3dzOiBtdWx0aXBsZSwgZW1wdHkgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIHNjcmF0Y2hwYWRIb3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVQsIFNodXRkb3duUmVhc29uLkxPQUQsIHRydWUsIGZhbHNlLCB0cnVlKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ1wib25FeGl0QW5kV2luZG93Q2xvc2VcIiBzZXR0aW5nIC0gc2NyYXRjaHBhZCcsICgpID0+IHtcblx0XHRcdHRlc3QoJ3Nob3VsZCBob3QgZXhpdCAocmVhc29uOiBDTE9TRSwgd2luZG93czogc2luZ2xlLCB3b3Jrc3BhY2UpJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRyZXR1cm4gc2NyYXRjaHBhZEhvdEV4aXRUZXN0LmNhbGwodGhpcywgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVF9BTkRfV0lORE9XX0NMT1NFLCBTaHV0ZG93blJlYXNvbi5DTE9TRSwgZmFsc2UsIHRydWUsIGZhbHNlKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnc2hvdWxkIGhvdCBleGl0IChyZWFzb246IENMT1NFLCB3aW5kb3dzOiBzaW5nbGUsIGVtcHR5IHdvcmtzcGFjZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHJldHVybiBzY3JhdGNocGFkSG90RXhpdFRlc3QuY2FsbCh0aGlzLCBIb3RFeGl0Q29uZmlndXJhdGlvbi5PTl9FWElUX0FORF9XSU5ET1dfQ0xPU0UsIFNodXRkb3duUmVhc29uLkNMT1NFLCBmYWxzZSwgZmFsc2UsICEhaXNNYWNpbnRvc2gpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzaG91bGQgaG90IGV4aXQgKHJlYXNvbjogQ0xPU0UsIHdpbmRvd3M6IG11bHRpcGxlLCB3b3Jrc3BhY2UpJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRyZXR1cm4gc2NyYXRjaHBhZEhvdEV4aXRUZXN0LmNhbGwodGhpcywgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVF9BTkRfV0lORE9XX0NMT1NFLCBTaHV0ZG93blJlYXNvbi5DTE9TRSwgdHJ1ZSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzaG91bGQgTk9UIGhvdCBleGl0IChyZWFzb246IENMT1NFLCB3aW5kb3dzOiBtdWx0aXBsZSwgZW1wdHkgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIHNjcmF0Y2hwYWRIb3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVRfQU5EX1dJTkRPV19DTE9TRSwgU2h1dGRvd25SZWFzb24uQ0xPU0UsIHRydWUsIGZhbHNlLCB0cnVlKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnc2hvdWxkIGhvdCBleGl0IChyZWFzb246IFFVSVQsIHdpbmRvd3M6IHNpbmdsZSwgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIHNjcmF0Y2hwYWRIb3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVRfQU5EX1dJTkRPV19DTE9TRSwgU2h1dGRvd25SZWFzb24uUVVJVCwgZmFsc2UsIHRydWUsIGZhbHNlKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnc2hvdWxkIGhvdCBleGl0IChyZWFzb246IFFVSVQsIHdpbmRvd3M6IHNpbmdsZSwgZW1wdHkgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIHNjcmF0Y2hwYWRIb3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVRfQU5EX1dJTkRPV19DTE9TRSwgU2h1dGRvd25SZWFzb24uUVVJVCwgZmFsc2UsIGZhbHNlLCBmYWxzZSk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ3Nob3VsZCBob3QgZXhpdCAocmVhc29uOiBRVUlULCB3aW5kb3dzOiBtdWx0aXBsZSwgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIHNjcmF0Y2hwYWRIb3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVRfQU5EX1dJTkRPV19DTE9TRSwgU2h1dGRvd25SZWFzb24uUVVJVCwgdHJ1ZSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzaG91bGQgaG90IGV4aXQgKHJlYXNvbjogUVVJVCwgd2luZG93czogbXVsdGlwbGUsIGVtcHR5IHdvcmtzcGFjZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHJldHVybiBzY3JhdGNocGFkSG90RXhpdFRlc3QuY2FsbCh0aGlzLCBIb3RFeGl0Q29uZmlndXJhdGlvbi5PTl9FWElUX0FORF9XSU5ET1dfQ0xPU0UsIFNodXRkb3duUmVhc29uLlFVSVQsIHRydWUsIGZhbHNlLCBmYWxzZSk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ3Nob3VsZCBob3QgZXhpdCAocmVhc29uOiBSRUxPQUQsIHdpbmRvd3M6IHNpbmdsZSwgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIHNjcmF0Y2hwYWRIb3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVRfQU5EX1dJTkRPV19DTE9TRSwgU2h1dGRvd25SZWFzb24uUkVMT0FELCBmYWxzZSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzaG91bGQgaG90IGV4aXQgKHJlYXNvbjogUkVMT0FELCB3aW5kb3dzOiBzaW5nbGUsIGVtcHR5IHdvcmtzcGFjZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHJldHVybiBzY3JhdGNocGFkSG90RXhpdFRlc3QuY2FsbCh0aGlzLCBIb3RFeGl0Q29uZmlndXJhdGlvbi5PTl9FWElUX0FORF9XSU5ET1dfQ0xPU0UsIFNodXRkb3duUmVhc29uLlJFTE9BRCwgZmFsc2UsIGZhbHNlLCBmYWxzZSk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ3Nob3VsZCBob3QgZXhpdCAocmVhc29uOiBSRUxPQUQsIHdpbmRvd3M6IG11bHRpcGxlLCB3b3Jrc3BhY2UpJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRyZXR1cm4gc2NyYXRjaHBhZEhvdEV4aXRUZXN0LmNhbGwodGhpcywgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVF9BTkRfV0lORE9XX0NMT1NFLCBTaHV0ZG93blJlYXNvbi5SRUxPQUQsIHRydWUsIHRydWUsIGZhbHNlKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnc2hvdWxkIGhvdCBleGl0IChyZWFzb246IFJFTE9BRCwgd2luZG93czogbXVsdGlwbGUsIGVtcHR5IHdvcmtzcGFjZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHJldHVybiBzY3JhdGNocGFkSG90RXhpdFRlc3QuY2FsbCh0aGlzLCBIb3RFeGl0Q29uZmlndXJhdGlvbi5PTl9FWElUX0FORF9XSU5ET1dfQ0xPU0UsIFNodXRkb3duUmVhc29uLlJFTE9BRCwgdHJ1ZSwgZmFsc2UsIGZhbHNlKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnc2hvdWxkIGhvdCBleGl0IChyZWFzb246IExPQUQsIHdpbmRvd3M6IHNpbmdsZSwgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIHNjcmF0Y2hwYWRIb3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVRfQU5EX1dJTkRPV19DTE9TRSwgU2h1dGRvd25SZWFzb24uTE9BRCwgZmFsc2UsIHRydWUsIGZhbHNlKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnc2hvdWxkIE5PVCBob3QgZXhpdCAocmVhc29uOiBMT0FELCB3aW5kb3dzOiBzaW5nbGUsIGVtcHR5IHdvcmtzcGFjZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHJldHVybiBzY3JhdGNocGFkSG90RXhpdFRlc3QuY2FsbCh0aGlzLCBIb3RFeGl0Q29uZmlndXJhdGlvbi5PTl9FWElUX0FORF9XSU5ET1dfQ0xPU0UsIFNodXRkb3duUmVhc29uLkxPQUQsIGZhbHNlLCBmYWxzZSwgdHJ1ZSk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ3Nob3VsZCBob3QgZXhpdCAocmVhc29uOiBMT0FELCB3aW5kb3dzOiBtdWx0aXBsZSwgd29ya3NwYWNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuIHNjcmF0Y2hwYWRIb3RFeGl0VGVzdC5jYWxsKHRoaXMsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVRfQU5EX1dJTkRPV19DTE9TRSwgU2h1dGRvd25SZWFzb24uTE9BRCwgdHJ1ZSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzaG91bGQgTk9UIGhvdCBleGl0IChyZWFzb246IExPQUQsIHdpbmRvd3M6IG11bHRpcGxlLCBlbXB0eSB3b3Jrc3BhY2UpJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRyZXR1cm4gc2NyYXRjaHBhZEhvdEV4aXRUZXN0LmNhbGwodGhpcywgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVF9BTkRfV0lORE9XX0NMT1NFLCBTaHV0ZG93blJlYXNvbi5MT0FELCB0cnVlLCBmYWxzZSwgdHJ1ZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXG5cdFx0YXN5bmMgZnVuY3Rpb24gaG90RXhpdFRlc3QodGhpczogYW55LCBzZXR0aW5nOiBzdHJpbmcsIHNodXRkb3duUmVhc29uOiBTaHV0ZG93blJlYXNvbiwgbXVsdGlwbGVXaW5kb3dzOiBib29sZWFuLCB3b3Jrc3BhY2U6IGJvb2xlYW4sIHNob3VsZFZldG86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IHsgYWNjZXNzb3IsIGNsZWFudXAgfSA9IGF3YWl0IGNyZWF0ZVRyYWNrZXIoKTtcblxuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSB0b1Jlc291cmNlLmNhbGwodGhpcywgJy9wYXRoL2luZGV4LnR4dCcpO1xuXHRcdFx0YXdhaXQgYWNjZXNzb3IuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2UsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfSk7XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gYWNjZXNzb3IudGV4dEZpbGVTZXJ2aWNlLmZpbGVzLmdldChyZXNvdXJjZSk7XG5cblx0XHRcdC8vIFNldCBob3QgZXhpdCBjb25maWdcblx0XHRcdGFjY2Vzc29yLmZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UudGVzdE9uRmlsZXNDb25maWd1cmF0aW9uQ2hhbmdlKHsgZmlsZXM6IHsgaG90RXhpdDogc2V0dGluZyB9IH0pO1xuXG5cdFx0XHQvLyBTZXQgZW1wdHkgd29ya3NwYWNlIGlmIHJlcXVpcmVkXG5cdFx0XHRpZiAoIXdvcmtzcGFjZSkge1xuXHRcdFx0XHRhY2Nlc3Nvci5jb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UobmV3IFdvcmtzcGFjZSgnZW1wdHk6MTUwODMxNzAyMjc1MScpKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2V0IG11bHRpcGxlIHdpbmRvd3MgaWYgcmVxdWlyZWRcblx0XHRcdGlmIChtdWx0aXBsZVdpbmRvd3MpIHtcblx0XHRcdFx0YWNjZXNzb3IubmF0aXZlSG9zdFNlcnZpY2Uud2luZG93Q291bnQgPSBQcm9taXNlLnJlc29sdmUoMik7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNldCBjYW5jZWwgdG8gZm9yY2UgYSB2ZXRvIGlmIGhvdCBleGl0IGRvZXMgbm90IHRyaWdnZXJcblx0XHRcdGFjY2Vzc29yLmZpbGVEaWFsb2dTZXJ2aWNlLnNldENvbmZpcm1SZXN1bHQoQ29uZmlybVJlc3VsdC5DQU5DRUwpO1xuXG5cdFx0XHRhd2FpdCBtb2RlbD8ucmVzb2x2ZSgpO1xuXHRcdFx0bW9kZWw/LnRleHRFZGl0b3JNb2RlbD8uc2V0VmFsdWUoJ2ZvbycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLndvcmtpbmdDb3B5U2VydmljZS5kaXJ0eUNvdW50LCAxKTtcblxuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgVGVzdEJlZm9yZVNodXRkb3duRXZlbnQoKTtcblx0XHRcdGV2ZW50LnJlYXNvbiA9IHNodXRkb3duUmVhc29uO1xuXHRcdFx0YWNjZXNzb3IubGlmZWN5Y2xlU2VydmljZS5maXJlQmVmb3JlU2h1dGRvd24oZXZlbnQpO1xuXG5cdFx0XHRjb25zdCB2ZXRvID0gYXdhaXQgZXZlbnQudmFsdWU7XG5cdFx0XHRhc3NlcnQub2sodHlwZW9mIGV2ZW50LmZpbmFsVmFsdWUgPT09ICdmdW5jdGlvbicpOyAvLyBhc3NlcnQgdGhlIHRyYWNrZXIgdXNlcyB0aGUgaW50ZXJuYWwgZmluYWxWZXRvIEFQSVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLndvcmtpbmdDb3B5QmFja3VwU2VydmljZS5kaXNjYXJkZWRCYWNrdXBzLmxlbmd0aCwgMCk7IC8vIFdoZW4gaG90IGV4aXQgaXMgc2V0LCBiYWNrdXBzIHNob3VsZCBuZXZlciBiZSBjbGVhbmVkIHNpbmNlIHRoZSBjb25maXJtIHJlc3VsdCBpcyBjYW5jZWxcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2ZXRvLCBzaG91bGRWZXRvKTtcblxuXHRcdFx0YXdhaXQgY2xlYW51cCgpO1xuXHRcdH1cblxuXHRcdGFzeW5jIGZ1bmN0aW9uIHNjcmF0Y2hwYWRIb3RFeGl0VGVzdCh0aGlzOiBhbnksIHNldHRpbmc6IHN0cmluZywgc2h1dGRvd25SZWFzb246IFNodXRkb3duUmVhc29uLCBtdWx0aXBsZVdpbmRvd3M6IGJvb2xlYW4sIHdvcmtzcGFjZTogYm9vbGVhbiwgc2hvdWxkVmV0bzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0Y29uc3QgeyBhY2Nlc3NvciwgY2xlYW51cCB9ID0gYXdhaXQgY3JlYXRlVHJhY2tlcigpO1xuXG5cdFx0XHRjbGFzcyBUZXN0QmFja3VwV29ya2luZ0NvcHkgZXh0ZW5kcyBUZXN0V29ya2luZ0NvcHkge1xuXG5cdFx0XHRcdGNvbnN0cnVjdG9yKHJlc291cmNlOiBVUkkpIHtcblx0XHRcdFx0XHRzdXBlcihyZXNvdXJjZSk7XG5cblx0XHRcdFx0XHR0aGlzLl9yZWdpc3RlcihhY2Nlc3Nvci53b3JraW5nQ29weVNlcnZpY2UucmVnaXN0ZXJXb3JraW5nQ29weSh0aGlzKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRvdmVycmlkZSBjYXBhYmlsaXRpZXMgPSBXb3JraW5nQ29weUNhcGFiaWxpdGllcy5VbnRpdGxlZCB8IFdvcmtpbmdDb3B5Q2FwYWJpbGl0aWVzLlNjcmF0Y2hwYWQ7XG5cblx0XHRcdFx0b3ZlcnJpZGUgaXNEaXJ0eSgpOiBib29sZWFuIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRvdmVycmlkZSBpc01vZGlmaWVkKCk6IGJvb2xlYW4ge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNldCBob3QgZXhpdCBjb25maWdcblx0XHRcdGFjY2Vzc29yLmZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UudGVzdE9uRmlsZXNDb25maWd1cmF0aW9uQ2hhbmdlKHsgZmlsZXM6IHsgaG90RXhpdDogc2V0dGluZyB9IH0pO1xuXG5cdFx0XHQvLyBTZXQgZW1wdHkgd29ya3NwYWNlIGlmIHJlcXVpcmVkXG5cdFx0XHRpZiAoIXdvcmtzcGFjZSkge1xuXHRcdFx0XHRhY2Nlc3Nvci5jb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UobmV3IFdvcmtzcGFjZSgnZW1wdHk6MTUwODMxNzAyMjc1MScpKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2V0IG11bHRpcGxlIHdpbmRvd3MgaWYgcmVxdWlyZWRcblx0XHRcdGlmIChtdWx0aXBsZVdpbmRvd3MpIHtcblx0XHRcdFx0YWNjZXNzb3IubmF0aXZlSG9zdFNlcnZpY2Uud2luZG93Q291bnQgPSBQcm9taXNlLnJlc29sdmUoMik7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNldCBjYW5jZWwgdG8gZm9yY2UgYSB2ZXRvIGlmIGhvdCBleGl0IGRvZXMgbm90IHRyaWdnZXJcblx0XHRcdGFjY2Vzc29yLmZpbGVEaWFsb2dTZXJ2aWNlLnNldENvbmZpcm1SZXN1bHQoQ29uZmlybVJlc3VsdC5DQU5DRUwpO1xuXG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IHRvUmVzb3VyY2UuY2FsbCh0aGlzLCAnL3BhdGgvY3VzdG9tLnR4dCcpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0QmFja3VwV29ya2luZ0NvcHkocmVzb3VyY2UpKTtcblxuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgVGVzdEJlZm9yZVNodXRkb3duRXZlbnQoKTtcblx0XHRcdGV2ZW50LnJlYXNvbiA9IHNodXRkb3duUmVhc29uO1xuXHRcdFx0YWNjZXNzb3IubGlmZWN5Y2xlU2VydmljZS5maXJlQmVmb3JlU2h1dGRvd24oZXZlbnQpO1xuXG5cdFx0XHRjb25zdCB2ZXRvID0gYXdhaXQgZXZlbnQudmFsdWU7XG5cdFx0XHRhc3NlcnQub2sodHlwZW9mIGV2ZW50LmZpbmFsVmFsdWUgPT09ICdmdW5jdGlvbicpOyAvLyBhc3NlcnQgdGhlIHRyYWNrZXIgdXNlcyB0aGUgaW50ZXJuYWwgZmluYWxWZXRvIEFQSVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLndvcmtpbmdDb3B5QmFja3VwU2VydmljZS5kaXNjYXJkZWRCYWNrdXBzLmxlbmd0aCwgMCk7IC8vIFdoZW4gaG90IGV4aXQgaXMgc2V0LCBiYWNrdXBzIHNob3VsZCBuZXZlciBiZSBjbGVhbmVkIHNpbmNlIHRoZSBjb25maXJtIHJlc3VsdCBpcyBjYW5jZWxcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2ZXRvLCBzaG91bGRWZXRvKTtcblxuXHRcdFx0YXdhaXQgY2xlYW51cCgpO1xuXHRcdH1cblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsYUFBYSxpQkFBaUI7QUFDdkMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVk7QUFDckIsU0FBUyxzQ0FBc0M7QUFFL0MsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5Q0FBeUMsa0JBQWtCO0FBQ3BFLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0JBQWdCLHlCQUF5QjtBQUNsRCxTQUFTLG9CQUFvQixlQUFlLHNCQUFzQjtBQUNsRSxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGtCQUFrQix3QkFBd0IseUJBQXlCLHdCQUF3QiwrQkFBK0IsaUJBQWlCLHNDQUFzQyx5QkFBeUI7QUFDbk4sU0FBUyw2QkFBNkI7QUFFdEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxlQUFlLGlCQUFpQjtBQUN6QyxTQUFTLHdCQUF3QjtBQUNq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QUF5QixpQkFBaUIsUUFBUSxDQUFDO0FBQy9FLGFBQU8sWUFBWSxNQUFNLFVBQVU7QUFFbkMsWUFBTSxRQUFRO0FBQUEsSUFDZjtBQUVBLG1CQUFlLHNCQUFpQyxTQUFpQixnQkFBZ0MsaUJBQTBCLFdBQW9CLFlBQW9DO0FBQ2xMLFlBQU0sRUFBRSxVQUFBQSxXQUFVLFFBQVEsSUFBSSxNQUFNLGNBQWM7QUFBQSxNQUVsRCxNQUFNLDhCQUE4QixnQkFBZ0I7QUFBQSxRQUVuRCxZQUFZQyxXQUFlO0FBQzFCLGdCQUFNQSxTQUFRO0FBS2YsZUFBUyxlQUFlLHdCQUF3QixXQUFXLHdCQUF3QjtBQUhsRixlQUFLLFVBQVVELFVBQVMsbUJBQW1CLG9CQUFvQixJQUFJLENBQUM7QUFBQSxRQUNyRTtBQUFBLFFBSVMsVUFBbUI7QUFDM0IsaUJBQU87QUFBQSxRQUNSO0FBQUEsUUFFUyxhQUFzQjtBQUM5QixpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBR0EsTUFBQUEsVUFBUywwQkFBMEIsK0JBQStCLEVBQUUsT0FBTyxFQUFFLFNBQVMsUUFBUSxFQUFFLENBQUM7QUFHakcsVUFBSSxDQUFDLFdBQVc7QUFDZixRQUFBQSxVQUFTLGVBQWUsYUFBYSxJQUFJLFVBQVUscUJBQXFCLENBQUM7QUFBQSxNQUMxRTtBQUdBLFVBQUksaUJBQWlCO0FBQ3BCLFFBQUFBLFVBQVMsa0JBQWtCLGNBQWMsUUFBUSxRQUFRLENBQUM7QUFBQSxNQUMzRDtBQUdBLE1BQUFBLFVBQVMsa0JBQWtCLGlCQUFpQixjQUFjLE1BQU07QUFFaEUsWUFBTSxXQUFXLFdBQVcsS0FBSyxNQUFNLGtCQUFrQjtBQUN6RCxrQkFBWSxJQUFJLElBQUksc0JBQXNCLFFBQVEsQ0FBQztBQUVuRCxZQUFNLFFBQVEsSUFBSSx3QkFBd0I7QUFDMUMsWUFBTSxTQUFTO0FBQ2YsTUFBQUEsVUFBUyxpQkFBaUIsbUJBQW1CLEtBQUs7QUFFbEQsWUFBTSxPQUFPLE1BQU0sTUFBTTtBQUN6QixhQUFPLEdBQUcsT0FBTyxNQUFNLGVBQWUsVUFBVTtBQUNoRCxhQUFPLFlBQVlBLFVBQVMseUJBQXlCLGlCQUFpQixRQUFRLENBQUM7QUFDL0UsYUFBTyxZQUFZLE1BQU0sVUFBVTtBQUVuQyxZQUFNLFFBQVE7QUFBQSxJQUNmO0FBQUEsRUFDRCxDQUFDO0FBRUQsMENBQXdDO0FBQ3pDLENBQUM7IiwKICAibmFtZXMiOiBbImFjY2Vzc29yIiwgInJlc291cmNlIl0KfQo=
