import assert from "assert";
import { Event } from "../../../../base/common/event.js";
import { DisposableStore, ImmortalReference } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { mock } from "../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { IBulkEditService } from "../../../../editor/browser/services/bulkEditService.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { EditOperation } from "../../../../editor/common/core/editOperation.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { ILanguageConfigurationService } from "../../../../editor/common/languages/languageConfigurationRegistry.js";
import { EndOfLineSequence } from "../../../../editor/common/model.js";
import { IEditorWorkerService } from "../../../../editor/common/services/editorWorker.js";
import { LanguageService } from "../../../../editor/common/services/languageService.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ModelService } from "../../../../editor/common/services/modelService.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { ITreeSitterLibraryService } from "../../../../editor/common/services/treeSitter/treeSitterLibraryService.js";
import { TestCodeEditorService } from "../../../../editor/test/browser/editorTestServices.js";
import { TestLanguageConfigurationService } from "../../../../editor/test/common/modes/testLanguageConfigurationService.js";
import { TestTreeSitterLibraryService } from "../../../../editor/test/common/services/testTreeSitterLibraryService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../platform/configuration/test/common/testConfigurationService.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { TestDialogService } from "../../../../platform/dialogs/test/common/testDialogService.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { InstantiationService } from "../../../../platform/instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { ILogService, NullLogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { TestNotificationService } from "../../../../platform/notification/test/common/testNotificationService.js";
import { TestThemeService } from "../../../../platform/theme/test/common/testThemeService.js";
import { IUndoRedoService } from "../../../../platform/undoRedo/common/undoRedo.js";
import { UndoRedoService } from "../../../../platform/undoRedo/common/undoRedoService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { UriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentityService.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { BulkEditService } from "../../../contrib/bulkEdit/browser/bulkEditService.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { SerializableObjectWithBuffers } from "../../../services/extensions/common/proxyIdentifier.js";
import { LabelService } from "../../../services/label/common/labelService.js";
import { ILifecycleService } from "../../../services/lifecycle/common/lifecycle.js";
import { IPaneCompositePartService } from "../../../services/panecomposite/browser/panecomposite.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { IWorkingCopyFileService } from "../../../services/workingCopy/common/workingCopyFileService.js";
import { IWorkingCopyService } from "../../../services/workingCopy/common/workingCopyService.js";
import { TestEditorGroupsService, TestEditorService, TestEnvironmentService, TestLifecycleService, TestWorkingCopyService } from "../../../test/browser/workbenchTestServices.js";
import { TestContextService, TestFileService, TestTextResourcePropertiesService } from "../../../test/common/workbenchTestServices.js";
import { MainThreadBulkEdits } from "../../browser/mainThreadBulkEdits.js";
import { MainThreadTextEditors } from "../../browser/mainThreadEditors.js";
import { MainThreadTextEditor } from "../../browser/mainThreadEditor.js";
import { MainThreadDocuments } from "../../browser/mainThreadDocuments.js";
import { SingleProxyRPCProtocol } from "../common/testRPCProtocol.js";
import { ITextResourcePropertiesService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { TestClipboardService } from "../../../../platform/clipboard/test/common/testClipboardService.js";
import { createTestCodeEditor } from "../../../../editor/test/browser/testCodeEditor.js";
suite("MainThreadEditors", () => {
  let disposables;
  const existingResource = URI.parse("foo:existing");
  const resource = URI.parse("foo:bar");
  let modelService;
  let bulkEdits;
  let editors;
  let editorLocator;
  let testEditor;
  const movedResources = /* @__PURE__ */ new Map();
  const copiedResources = /* @__PURE__ */ new Map();
  const createdResources = /* @__PURE__ */ new Set();
  const deletedResources = /* @__PURE__ */ new Set();
  const editorId = "testEditorId";
  setup(() => {
    disposables = new DisposableStore();
    movedResources.clear();
    copiedResources.clear();
    createdResources.clear();
    deletedResources.clear();
    const configService = new TestConfigurationService();
    const dialogService = new TestDialogService();
    const notificationService = new TestNotificationService();
    const undoRedoService = new UndoRedoService(dialogService, notificationService);
    const themeService = new TestThemeService();
    const services = new ServiceCollection();
    services.set(IBulkEditService, new SyncDescriptor(BulkEditService));
    services.set(ILabelService, new SyncDescriptor(LabelService));
    services.set(ILogService, new NullLogService());
    services.set(IWorkspaceContextService, new TestContextService());
    services.set(IEnvironmentService, TestEnvironmentService);
    services.set(IWorkbenchEnvironmentService, TestEnvironmentService);
    services.set(IConfigurationService, configService);
    services.set(IDialogService, dialogService);
    services.set(INotificationService, notificationService);
    services.set(IUndoRedoService, undoRedoService);
    services.set(ITextResourcePropertiesService, new SyncDescriptor(TestTextResourcePropertiesService));
    services.set(IModelService, new SyncDescriptor(ModelService));
    services.set(ICodeEditorService, new TestCodeEditorService(themeService));
    services.set(IFileService, new TestFileService());
    services.set(IUriIdentityService, new SyncDescriptor(UriIdentityService));
    services.set(ITreeSitterLibraryService, new TestTreeSitterLibraryService());
    services.set(IEditorService, disposables.add(new TestEditorService()));
    services.set(ILifecycleService, new TestLifecycleService());
    services.set(IWorkingCopyService, new TestWorkingCopyService());
    services.set(IEditorGroupsService, new TestEditorGroupsService());
    services.set(IClipboardService, new TestClipboardService());
    services.set(ITextFileService, new class extends mock() {
      constructor() {
        super(...arguments);
        // eslint-disable-next-line local/code-no-any-casts
        this.files = {
          onDidSave: Event.None,
          onDidRevert: Event.None,
          onDidChangeDirty: Event.None,
          onDidChangeEncoding: Event.None
        };
        // eslint-disable-next-line local/code-no-any-casts
        this.untitled = {
          onDidChangeEncoding: Event.None
        };
      }
      isDirty() {
        return false;
      }
      create(operations) {
        for (const o of operations) {
          createdResources.add(o.resource);
        }
        return Promise.resolve(/* @__PURE__ */ Object.create(null));
      }
      async getEncodedReadable(resource2, value) {
        return void 0;
      }
    }());
    services.set(IWorkingCopyFileService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidRunWorkingCopyFileOperation = Event.None;
      }
      createFolder(operations) {
        this.create(operations);
      }
      create(operations) {
        for (const operation of operations) {
          createdResources.add(operation.resource);
        }
        return Promise.resolve(/* @__PURE__ */ Object.create(null));
      }
      move(operations) {
        const { source, target } = operations[0].file;
        movedResources.set(source, target);
        return Promise.resolve(/* @__PURE__ */ Object.create(null));
      }
      copy(operations) {
        const { source, target } = operations[0].file;
        copiedResources.set(source, target);
        return Promise.resolve(/* @__PURE__ */ Object.create(null));
      }
      delete(operations) {
        for (const operation of operations) {
          deletedResources.add(operation.resource);
        }
        return Promise.resolve(void 0);
      }
    }());
    services.set(ITextModelService, new class extends mock() {
      createModelReference(resource2) {
        const textEditorModel = new class extends mock() {
          constructor() {
            super(...arguments);
            this.textEditorModel = modelService.getModel(resource2);
          }
        }();
        textEditorModel.isReadonly = () => false;
        return Promise.resolve(new ImmortalReference(textEditorModel));
      }
    }());
    services.set(IEditorWorkerService, new class extends mock() {
    }());
    services.set(IPaneCompositePartService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidPaneCompositeOpen = Event.None;
        this.onDidPaneCompositeClose = Event.None;
      }
      getActivePaneComposite() {
        return void 0;
      }
    }());
    services.set(ILanguageService, disposables.add(new LanguageService()));
    services.set(ILanguageConfigurationService, new TestLanguageConfigurationService());
    const instaService = new InstantiationService(services);
    bulkEdits = instaService.createInstance(MainThreadBulkEdits, SingleProxyRPCProtocol(null));
    const documents = instaService.createInstance(MainThreadDocuments, SingleProxyRPCProtocol(null));
    editorLocator = {
      getEditor(id) {
        return id === editorId ? testEditor : void 0;
      },
      findTextEditorIdFor() {
        return void 0;
      },
      getIdOfCodeEditor() {
        return void 0;
      }
    };
    editors = instaService.createInstance(MainThreadTextEditors, editorLocator, SingleProxyRPCProtocol(null));
    modelService = instaService.invokeFunction((accessor) => accessor.get(IModelService));
    const model = modelService.createModel("Hello world!", null, existingResource);
    const testCodeEditor = disposables.add(createTestCodeEditor(model));
    testEditor = disposables.add(instaService.createInstance(
      MainThreadTextEditor,
      editorId,
      model,
      testCodeEditor,
      { onGainedFocus() {
      }, onLostFocus() {
      } },
      documents
    ));
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test(`applyWorkspaceEdit returns false if model is changed by user`, () => {
    const model = disposables.add(modelService.createModel("something", null, resource));
    const workspaceResourceEdit = {
      resource,
      versionId: model.getVersionId(),
      textEdit: {
        text: "asdfg",
        range: new Range(1, 1, 1, 1)
      }
    };
    model.applyEdits([EditOperation.insert(new Position(0, 0), "something")]);
    return bulkEdits.$tryApplyWorkspaceEdit(new SerializableObjectWithBuffers({ edits: [workspaceResourceEdit] })).then((result) => {
      assert.strictEqual(result, false);
    });
  });
  test(`issue #54773: applyWorkspaceEdit checks model version in race situation`, () => {
    const model = disposables.add(modelService.createModel("something", null, resource));
    const workspaceResourceEdit1 = {
      resource,
      versionId: model.getVersionId(),
      textEdit: {
        text: "asdfg",
        range: new Range(1, 1, 1, 1)
      }
    };
    const workspaceResourceEdit2 = {
      resource,
      versionId: model.getVersionId(),
      textEdit: {
        text: "asdfg",
        range: new Range(1, 1, 1, 1)
      }
    };
    const p1 = bulkEdits.$tryApplyWorkspaceEdit(new SerializableObjectWithBuffers({ edits: [workspaceResourceEdit1] })).then((result) => {
      assert.strictEqual(result, true);
    });
    const p2 = bulkEdits.$tryApplyWorkspaceEdit(new SerializableObjectWithBuffers({ edits: [workspaceResourceEdit2] })).then((result) => {
      assert.strictEqual(result, false);
    });
    return Promise.all([p1, p2]);
  });
  test("applyWorkspaceEdit: noop eol edit keeps undo stack clean", async () => {
    const initialText = "hello\nworld";
    const model = disposables.add(modelService.createModel(initialText, null, resource));
    const initialAlternativeVersionId = model.getAlternativeVersionId();
    const insertEdit = {
      resource,
      versionId: model.getVersionId(),
      textEdit: {
        range: new Range(1, 6, 1, 6),
        text: "2"
      }
    };
    const insertResult = await bulkEdits.$tryApplyWorkspaceEdit(new SerializableObjectWithBuffers({ edits: [insertEdit] }));
    assert.strictEqual(insertResult, true);
    assert.strictEqual(model.getValue(), "hello2\nworld");
    assert.notStrictEqual(model.getAlternativeVersionId(), initialAlternativeVersionId);
    const eolEdit = {
      resource,
      versionId: model.getVersionId(),
      textEdit: {
        range: new Range(1, 1, 1, 1),
        text: "",
        eol: EndOfLineSequence.LF
      }
    };
    const eolResult = await bulkEdits.$tryApplyWorkspaceEdit(new SerializableObjectWithBuffers({ edits: [eolEdit] }));
    assert.strictEqual(eolResult, true);
    assert.strictEqual(model.getValue(), "hello2\nworld");
    const undoResult = model.undo();
    if (undoResult) {
      await undoResult;
    }
    assert.strictEqual(model.getValue(), initialText);
    assert.strictEqual(model.getAlternativeVersionId(), initialAlternativeVersionId);
  });
  test(`applyWorkspaceEdit with only resource edit`, () => {
    return bulkEdits.$tryApplyWorkspaceEdit(new SerializableObjectWithBuffers({
      edits: [
        { oldResource: resource, newResource: resource, options: void 0 },
        { oldResource: void 0, newResource: resource, options: void 0 },
        { oldResource: resource, newResource: void 0, options: void 0 }
      ]
    })).then((result) => {
      assert.strictEqual(result, true);
      assert.strictEqual(movedResources.get(resource), resource);
      assert.strictEqual(createdResources.has(resource), true);
      assert.strictEqual(deletedResources.has(resource), true);
    });
  });
  test("applyWorkspaceEdit can control undo/redo stack 1", async () => {
    const model = modelService.getModel(existingResource);
    const edit1 = {
      range: new Range(1, 1, 1, 2),
      text: "h",
      forceMoveMarkers: false
    };
    const applied1 = await editors.$tryApplyEdits(editorId, model.getVersionId(), [edit1], { undoStopBefore: false, undoStopAfter: false });
    assert.strictEqual(applied1, true);
    assert.strictEqual(model.getValue(), "hello world!");
    const edit2 = {
      range: new Range(1, 2, 1, 6),
      text: "ELLO",
      forceMoveMarkers: false
    };
    const applied2 = await editors.$tryApplyEdits(editorId, model.getVersionId(), [edit2], { undoStopBefore: false, undoStopAfter: false });
    assert.strictEqual(applied2, true);
    assert.strictEqual(model.getValue(), "hELLO world!");
    await model.undo();
    assert.strictEqual(model.getValue(), "Hello world!");
  });
  test("applyWorkspaceEdit can control undo/redo stack 2", async () => {
    const model = modelService.getModel(existingResource);
    const edit1 = {
      range: new Range(1, 1, 1, 2),
      text: "h",
      forceMoveMarkers: false
    };
    const applied1 = await editors.$tryApplyEdits(editorId, model.getVersionId(), [edit1], { undoStopBefore: false, undoStopAfter: false });
    assert.strictEqual(applied1, true);
    assert.strictEqual(model.getValue(), "hello world!");
    const edit2 = {
      range: new Range(1, 2, 1, 6),
      text: "ELLO",
      forceMoveMarkers: false
    };
    const applied2 = await editors.$tryApplyEdits(editorId, model.getVersionId(), [edit2], { undoStopBefore: true, undoStopAfter: false });
    assert.strictEqual(applied2, true);
    assert.strictEqual(model.getValue(), "hELLO world!");
    await model.undo();
    assert.strictEqual(model.getValue(), "hello world!");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcYnJvd3NlclxcbWFpblRocmVhZEVkaXRvcnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJUmVmZXJlbmNlLCBJbW1vcnRhbFJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElCdWxrRWRpdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9idWxrRWRpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdE9wZXJhdGlvbiwgSVNpbmdsZUVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBFbmRPZkxpbmVTZXF1ZW5jZSwgSVRleHRTbmFwc2hvdCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUVkaXRvcldvcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2VkaXRvcldvcmtlci5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWwsIElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdHJlZVNpdHRlci90cmVlU2l0dGVyTGlicmFyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdENvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL3Rlc3QvYnJvd3Nlci9lZGl0b3JUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvdGVzdC9jb21tb24vbW9kZXMvdGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdFRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2NvbW1vbi9zZXJ2aWNlcy90ZXN0VHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IFRlc3REaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy90ZXN0L2NvbW1vbi90ZXN0RGlhbG9nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vdGVzdC9jb21tb24vdGVzdE5vdGlmaWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdFRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL3Rlc3QvY29tbW9uL3Rlc3RUaGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVuZG9SZWRvU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VuZG9SZWRvL2NvbW1vbi91bmRvUmVkby5qcyc7XG5pbXBvcnQgeyBVbmRvUmVkb1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91bmRvUmVkby9jb21tb24vdW5kb1JlZG9TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBCdWxrRWRpdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb250cmliL2J1bGtFZGl0L2Jyb3dzZXIvYnVsa0VkaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vcHJveHlJZGVudGlmaWVyLmpzJztcbmltcG9ydCB7IExhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xhYmVsL2NvbW1vbi9sYWJlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcGFuZWNvbXBvc2l0ZS9icm93c2VyL3BhbmVjb21wb3NpdGUuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgSUNvcHlPcGVyYXRpb24sIElDcmVhdGVGaWxlT3BlcmF0aW9uLCBJQ3JlYXRlT3BlcmF0aW9uLCBJRGVsZXRlT3BlcmF0aW9uLCBJTW92ZU9wZXJhdGlvbiwgSVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlGaWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0RWRpdG9yR3JvdXBzU2VydmljZSwgVGVzdEVkaXRvclNlcnZpY2UsIFRlc3RFbnZpcm9ubWVudFNlcnZpY2UsIFRlc3RMaWZlY3ljbGVTZXJ2aWNlLCBUZXN0V29ya2luZ0NvcHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBUZXN0Q29udGV4dFNlcnZpY2UsIFRlc3RGaWxlU2VydmljZSwgVGVzdFRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWRCdWxrRWRpdHMgfSBmcm9tICcuLi8uLi9icm93c2VyL21haW5UaHJlYWRCdWxrRWRpdHMuanMnO1xuaW1wb3J0IHsgTWFpblRocmVhZFRleHRFZGl0b3JzLCBJTWFpblRocmVhZEVkaXRvckxvY2F0b3IgfSBmcm9tICcuLi8uLi9icm93c2VyL21haW5UaHJlYWRFZGl0b3JzLmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWRUZXh0RWRpdG9yIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9tYWluVGhyZWFkRWRpdG9yLmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWREb2N1bWVudHMgfSBmcm9tICcuLi8uLi9icm93c2VyL21haW5UaHJlYWREb2N1bWVudHMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRleHRFZGl0RHRvIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgU2luZ2xlUHJveHlSUENQcm90b2NvbCB9IGZyb20gJy4uL2NvbW1vbi90ZXN0UlBDUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL3Rlc3QvY29tbW9uL3Rlc3RDbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRlc3RDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL3Rlc3QvYnJvd3Nlci90ZXN0Q29kZUVkaXRvci5qcyc7XG5cbnN1aXRlKCdNYWluVGhyZWFkRWRpdG9ycycsICgpID0+IHtcblxuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0Y29uc3QgZXhpc3RpbmdSZXNvdXJjZSA9IFVSSS5wYXJzZSgnZm9vOmV4aXN0aW5nJyk7XG5cdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKCdmb286YmFyJyk7XG5cblx0bGV0IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZTtcblxuXHRsZXQgYnVsa0VkaXRzOiBNYWluVGhyZWFkQnVsa0VkaXRzO1xuXHRsZXQgZWRpdG9yczogTWFpblRocmVhZFRleHRFZGl0b3JzO1xuXHRsZXQgZWRpdG9yTG9jYXRvcjogSU1haW5UaHJlYWRFZGl0b3JMb2NhdG9yO1xuXHRsZXQgdGVzdEVkaXRvcjogTWFpblRocmVhZFRleHRFZGl0b3I7XG5cblx0Y29uc3QgbW92ZWRSZXNvdXJjZXMgPSBuZXcgTWFwPFVSSSwgVVJJPigpO1xuXHRjb25zdCBjb3BpZWRSZXNvdXJjZXMgPSBuZXcgTWFwPFVSSSwgVVJJPigpO1xuXHRjb25zdCBjcmVhdGVkUmVzb3VyY2VzID0gbmV3IFNldDxVUkk+KCk7XG5cdGNvbnN0IGRlbGV0ZWRSZXNvdXJjZXMgPSBuZXcgU2V0PFVSST4oKTtcblxuXHRjb25zdCBlZGl0b3JJZCA9ICd0ZXN0RWRpdG9ySWQnO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdG1vdmVkUmVzb3VyY2VzLmNsZWFyKCk7XG5cdFx0Y29waWVkUmVzb3VyY2VzLmNsZWFyKCk7XG5cdFx0Y3JlYXRlZFJlc291cmNlcy5jbGVhcigpO1xuXHRcdGRlbGV0ZWRSZXNvdXJjZXMuY2xlYXIoKTtcblxuXHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IG5ldyBUZXN0RGlhbG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBuZXcgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCB1bmRvUmVkb1NlcnZpY2UgPSBuZXcgVW5kb1JlZG9TZXJ2aWNlKGRpYWxvZ1NlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHRoZW1lU2VydmljZSA9IG5ldyBUZXN0VGhlbWVTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCBzZXJ2aWNlcyA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpO1xuXHRcdHNlcnZpY2VzLnNldChJQnVsa0VkaXRTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoQnVsa0VkaXRTZXJ2aWNlKSk7XG5cdFx0c2VydmljZXMuc2V0KElMYWJlbFNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihMYWJlbFNlcnZpY2UpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCkpO1xuXHRcdHNlcnZpY2VzLnNldChJRW52aXJvbm1lbnRTZXJ2aWNlLCBUZXN0RW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHRzZXJ2aWNlcy5zZXQoSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSwgVGVzdEVudmlyb25tZW50U2VydmljZSk7XG5cdFx0c2VydmljZXMuc2V0KElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlnU2VydmljZSk7XG5cdFx0c2VydmljZXMuc2V0KElEaWFsb2dTZXJ2aWNlLCBkaWFsb2dTZXJ2aWNlKTtcblx0XHRzZXJ2aWNlcy5zZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdHNlcnZpY2VzLnNldChJVW5kb1JlZG9TZXJ2aWNlLCB1bmRvUmVkb1NlcnZpY2UpO1xuXHRcdHNlcnZpY2VzLnNldChJVGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihUZXN0VGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSU1vZGVsU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKE1vZGVsU2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJQ29kZUVkaXRvclNlcnZpY2UsIG5ldyBUZXN0Q29kZUVkaXRvclNlcnZpY2UodGhlbWVTZXJ2aWNlKSk7XG5cdFx0c2VydmljZXMuc2V0KElGaWxlU2VydmljZSwgbmV3IFRlc3RGaWxlU2VydmljZSgpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSVVyaUlkZW50aXR5U2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKFVyaUlkZW50aXR5U2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJVHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlLCBuZXcgVGVzdFRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSgpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUVkaXRvclNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEVkaXRvclNlcnZpY2UoKSkpO1xuXHRcdHNlcnZpY2VzLnNldChJTGlmZWN5Y2xlU2VydmljZSwgbmV3IFRlc3RMaWZlY3ljbGVTZXJ2aWNlKCkpO1xuXHRcdHNlcnZpY2VzLnNldChJV29ya2luZ0NvcHlTZXJ2aWNlLCBuZXcgVGVzdFdvcmtpbmdDb3B5U2VydmljZSgpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UsIG5ldyBUZXN0RWRpdG9yR3JvdXBzU2VydmljZSgpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUNsaXBib2FyZFNlcnZpY2UsIG5ldyBUZXN0Q2xpcGJvYXJkU2VydmljZSgpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSVRleHRGaWxlU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVGV4dEZpbGVTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGlzRGlydHkoKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRvdmVycmlkZSBmaWxlcyA9IDxhbnk+e1xuXHRcdFx0XHRvbkRpZFNhdmU6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdG9uRGlkUmV2ZXJ0OiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZENoYW5nZURpcnR5OiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZENoYW5nZUVuY29kaW5nOiBFdmVudC5Ob25lXG5cdFx0XHR9O1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRvdmVycmlkZSB1bnRpdGxlZCA9IDxhbnk+e1xuXHRcdFx0XHRvbkRpZENoYW5nZUVuY29kaW5nOiBFdmVudC5Ob25lXG5cdFx0XHR9O1xuXHRcdFx0b3ZlcnJpZGUgY3JlYXRlKG9wZXJhdGlvbnM6IHsgcmVzb3VyY2U6IFVSSSB9W10pIHtcblx0XHRcdFx0Zm9yIChjb25zdCBvIG9mIG9wZXJhdGlvbnMpIHtcblx0XHRcdFx0XHRjcmVhdGVkUmVzb3VyY2VzLmFkZChvLnJlc291cmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKE9iamVjdC5jcmVhdGUobnVsbCkpO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0RW5jb2RlZFJlYWRhYmxlKHJlc291cmNlOiBVUkksIHZhbHVlPzogc3RyaW5nIHwgSVRleHRTbmFwc2hvdCk6IFByb21pc2U8YW55PiB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0c2VydmljZXMuc2V0KElXb3JraW5nQ29weUZpbGVTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3JraW5nQ29weUZpbGVTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIG9uRGlkUnVuV29ya2luZ0NvcHlGaWxlT3BlcmF0aW9uID0gRXZlbnQuTm9uZTtcblx0XHRcdG92ZXJyaWRlIGNyZWF0ZUZvbGRlcihvcGVyYXRpb25zOiBJQ3JlYXRlT3BlcmF0aW9uW10pOiBhbnkge1xuXHRcdFx0XHR0aGlzLmNyZWF0ZShvcGVyYXRpb25zKTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGNyZWF0ZShvcGVyYXRpb25zOiBJQ3JlYXRlRmlsZU9wZXJhdGlvbltdKSB7XG5cdFx0XHRcdGZvciAoY29uc3Qgb3BlcmF0aW9uIG9mIG9wZXJhdGlvbnMpIHtcblx0XHRcdFx0XHRjcmVhdGVkUmVzb3VyY2VzLmFkZChvcGVyYXRpb24ucmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoT2JqZWN0LmNyZWF0ZShudWxsKSk7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBtb3ZlKG9wZXJhdGlvbnM6IElNb3ZlT3BlcmF0aW9uW10pIHtcblx0XHRcdFx0Y29uc3QgeyBzb3VyY2UsIHRhcmdldCB9ID0gb3BlcmF0aW9uc1swXS5maWxlO1xuXHRcdFx0XHRtb3ZlZFJlc291cmNlcy5zZXQoc291cmNlLCB0YXJnZXQpO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKE9iamVjdC5jcmVhdGUobnVsbCkpO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgY29weShvcGVyYXRpb25zOiBJQ29weU9wZXJhdGlvbltdKSB7XG5cdFx0XHRcdGNvbnN0IHsgc291cmNlLCB0YXJnZXQgfSA9IG9wZXJhdGlvbnNbMF0uZmlsZTtcblx0XHRcdFx0Y29waWVkUmVzb3VyY2VzLnNldChzb3VyY2UsIHRhcmdldCk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoT2JqZWN0LmNyZWF0ZShudWxsKSk7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBkZWxldGUob3BlcmF0aW9uczogSURlbGV0ZU9wZXJhdGlvbltdKSB7XG5cdFx0XHRcdGZvciAoY29uc3Qgb3BlcmF0aW9uIG9mIG9wZXJhdGlvbnMpIHtcblx0XHRcdFx0XHRkZWxldGVkUmVzb3VyY2VzLmFkZChvcGVyYXRpb24ucmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRzZXJ2aWNlcy5zZXQoSVRleHRNb2RlbFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVRleHRNb2RlbFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgY3JlYXRlTW9kZWxSZWZlcmVuY2UocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SVJlZmVyZW5jZTxJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWw+PiB7XG5cdFx0XHRcdGNvbnN0IHRleHRFZGl0b3JNb2RlbCA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVJlc29sdmVkVGV4dEVkaXRvck1vZGVsPigpIHtcblx0XHRcdFx0XHRvdmVycmlkZSB0ZXh0RWRpdG9yTW9kZWwgPSBtb2RlbFNlcnZpY2UuZ2V0TW9kZWwocmVzb3VyY2UpITtcblx0XHRcdFx0fTtcblx0XHRcdFx0dGV4dEVkaXRvck1vZGVsLmlzUmVhZG9ubHkgPSAoKSA9PiBmYWxzZTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShuZXcgSW1tb3J0YWxSZWZlcmVuY2UodGV4dEVkaXRvck1vZGVsKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0c2VydmljZXMuc2V0KElFZGl0b3JXb3JrZXJTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JXb3JrZXJTZXJ2aWNlPigpIHtcblxuXHRcdH0pO1xuXHRcdHNlcnZpY2VzLnNldChJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2U+KCkgaW1wbGVtZW50cyBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlIHtcblx0XHRcdG92ZXJyaWRlIG9uRGlkUGFuZUNvbXBvc2l0ZU9wZW4gPSBFdmVudC5Ob25lO1xuXHRcdFx0b3ZlcnJpZGUgb25EaWRQYW5lQ29tcG9zaXRlQ2xvc2UgPSBFdmVudC5Ob25lO1xuXHRcdFx0b3ZlcnJpZGUgZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZSgpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHNlcnZpY2VzLnNldChJTGFuZ3VhZ2VTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IExhbmd1YWdlU2VydmljZSgpKSk7XG5cdFx0c2VydmljZXMuc2V0KElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBuZXcgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UoKSk7XG5cblx0XHRjb25zdCBpbnN0YVNlcnZpY2UgPSBuZXcgSW5zdGFudGlhdGlvblNlcnZpY2Uoc2VydmljZXMpO1xuXG5cdFx0YnVsa0VkaXRzID0gaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1haW5UaHJlYWRCdWxrRWRpdHMsIFNpbmdsZVByb3h5UlBDUHJvdG9jb2wobnVsbCkpO1xuXHRcdGNvbnN0IGRvY3VtZW50cyA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYWluVGhyZWFkRG9jdW1lbnRzLCBTaW5nbGVQcm94eVJQQ1Byb3RvY29sKG51bGwpKTtcblxuXHRcdC8vIENyZWF0ZSBlZGl0b3IgbG9jYXRvclxuXHRcdGVkaXRvckxvY2F0b3IgPSB7XG5cdFx0XHRnZXRFZGl0b3IoaWQ6IHN0cmluZyk6IE1haW5UaHJlYWRUZXh0RWRpdG9yIHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0cmV0dXJuIGlkID09PSBlZGl0b3JJZCA/IHRlc3RFZGl0b3IgOiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0ZmluZFRleHRFZGl0b3JJZEZvcigpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfSxcblx0XHRcdGdldElkT2ZDb2RlRWRpdG9yKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0fTtcblxuXHRcdGVkaXRvcnMgPSBpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWFpblRocmVhZFRleHRFZGl0b3JzLCBlZGl0b3JMb2NhdG9yLCBTaW5nbGVQcm94eVJQQ1Byb3RvY29sKG51bGwpKTtcblx0XHRtb2RlbFNlcnZpY2UgPSBpbnN0YVNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gYWNjZXNzb3IuZ2V0KElNb2RlbFNlcnZpY2UpKTtcblxuXHRcdC8vIENyZWF0ZSBhIHRlc3QgY29kZSBlZGl0b3IgdXNpbmcgdGhlIGhlbHBlclxuXHRcdGNvbnN0IG1vZGVsID0gbW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKCdIZWxsbyB3b3JsZCEnLCBudWxsLCBleGlzdGluZ1Jlc291cmNlKTtcblx0XHRjb25zdCB0ZXN0Q29kZUVkaXRvciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXN0Q29kZUVkaXRvcihtb2RlbCkpO1xuXG5cdFx0dGVzdEVkaXRvciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRNYWluVGhyZWFkVGV4dEVkaXRvcixcblx0XHRcdGVkaXRvcklkLFxuXHRcdFx0bW9kZWwsXG5cdFx0XHR0ZXN0Q29kZUVkaXRvcixcblx0XHRcdHsgb25HYWluZWRGb2N1cygpIHsgfSwgb25Mb3N0Rm9jdXMoKSB7IH0gfSxcblx0XHRcdGRvY3VtZW50c1xuXHRcdCkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KGBhcHBseVdvcmtzcGFjZUVkaXQgcmV0dXJucyBmYWxzZSBpZiBtb2RlbCBpcyBjaGFuZ2VkIGJ5IHVzZXJgLCAoKSA9PiB7XG5cblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChtb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwoJ3NvbWV0aGluZycsIG51bGwsIHJlc291cmNlKSk7XG5cblx0XHRjb25zdCB3b3Jrc3BhY2VSZXNvdXJjZUVkaXQ6IElXb3Jrc3BhY2VUZXh0RWRpdER0byA9IHtcblx0XHRcdHJlc291cmNlOiByZXNvdXJjZSxcblx0XHRcdHZlcnNpb25JZDogbW9kZWwuZ2V0VmVyc2lvbklkKCksXG5cdFx0XHR0ZXh0RWRpdDoge1xuXHRcdFx0XHR0ZXh0OiAnYXNkZmcnLFxuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpXG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIEFjdCBhcyBpZiB0aGUgdXNlciBlZGl0ZWQgdGhlIG1vZGVsXG5cdFx0bW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5pbnNlcnQobmV3IFBvc2l0aW9uKDAsIDApLCAnc29tZXRoaW5nJyldKTtcblxuXHRcdHJldHVybiBidWxrRWRpdHMuJHRyeUFwcGx5V29ya3NwYWNlRWRpdChuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMoeyBlZGl0czogW3dvcmtzcGFjZVJlc291cmNlRWRpdF0gfSkpLnRoZW4oKHJlc3VsdCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KGBpc3N1ZSAjNTQ3NzM6IGFwcGx5V29ya3NwYWNlRWRpdCBjaGVja3MgbW9kZWwgdmVyc2lvbiBpbiByYWNlIHNpdHVhdGlvbmAsICgpID0+IHtcblxuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG1vZGVsU2VydmljZS5jcmVhdGVNb2RlbCgnc29tZXRoaW5nJywgbnVsbCwgcmVzb3VyY2UpKTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZVJlc291cmNlRWRpdDE6IElXb3Jrc3BhY2VUZXh0RWRpdER0byA9IHtcblx0XHRcdHJlc291cmNlOiByZXNvdXJjZSxcblx0XHRcdHZlcnNpb25JZDogbW9kZWwuZ2V0VmVyc2lvbklkKCksXG5cdFx0XHR0ZXh0RWRpdDoge1xuXHRcdFx0XHR0ZXh0OiAnYXNkZmcnLFxuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpXG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCB3b3Jrc3BhY2VSZXNvdXJjZUVkaXQyOiBJV29ya3NwYWNlVGV4dEVkaXREdG8gPSB7XG5cdFx0XHRyZXNvdXJjZTogcmVzb3VyY2UsXG5cdFx0XHR2ZXJzaW9uSWQ6IG1vZGVsLmdldFZlcnNpb25JZCgpLFxuXHRcdFx0dGV4dEVkaXQ6IHtcblx0XHRcdFx0dGV4dDogJ2FzZGZnJyxcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBwMSA9IGJ1bGtFZGl0cy4kdHJ5QXBwbHlXb3Jrc3BhY2VFZGl0KG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyh7IGVkaXRzOiBbd29ya3NwYWNlUmVzb3VyY2VFZGl0MV0gfSkpLnRoZW4oKHJlc3VsdCkgPT4ge1xuXHRcdFx0Ly8gZmlyc3QgZWRpdCByZXF1ZXN0IHN1Y2NlZWRzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0cnVlKTtcblx0XHR9KTtcblx0XHRjb25zdCBwMiA9IGJ1bGtFZGl0cy4kdHJ5QXBwbHlXb3Jrc3BhY2VFZGl0KG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyh7IGVkaXRzOiBbd29ya3NwYWNlUmVzb3VyY2VFZGl0Ml0gfSkpLnRoZW4oKHJlc3VsdCkgPT4ge1xuXHRcdFx0Ly8gc2Vjb25kIGVkaXQgcmVxdWVzdCBmYWlsc1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgZmFsc2UpO1xuXHRcdH0pO1xuXHRcdHJldHVybiBQcm9taXNlLmFsbChbcDEsIHAyXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGx5V29ya3NwYWNlRWRpdDogbm9vcCBlb2wgZWRpdCBrZWVwcyB1bmRvIHN0YWNrIGNsZWFuJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0Y29uc3QgaW5pdGlhbFRleHQgPSAnaGVsbG9cXG53b3JsZCc7XG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKGluaXRpYWxUZXh0LCBudWxsLCByZXNvdXJjZSkpO1xuXHRcdGNvbnN0IGluaXRpYWxBbHRlcm5hdGl2ZVZlcnNpb25JZCA9IG1vZGVsLmdldEFsdGVybmF0aXZlVmVyc2lvbklkKCk7XG5cblx0XHRjb25zdCBpbnNlcnRFZGl0OiBJV29ya3NwYWNlVGV4dEVkaXREdG8gPSB7XG5cdFx0XHRyZXNvdXJjZTogcmVzb3VyY2UsXG5cdFx0XHR2ZXJzaW9uSWQ6IG1vZGVsLmdldFZlcnNpb25JZCgpLFxuXHRcdFx0dGV4dEVkaXQ6IHtcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCA2LCAxLCA2KSxcblx0XHRcdFx0dGV4dDogJzInXG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGluc2VydFJlc3VsdCA9IGF3YWl0IGJ1bGtFZGl0cy4kdHJ5QXBwbHlXb3Jrc3BhY2VFZGl0KG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyh7IGVkaXRzOiBbaW5zZXJ0RWRpdF0gfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnNlcnRSZXN1bHQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnaGVsbG8yXFxud29ybGQnKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwobW9kZWwuZ2V0QWx0ZXJuYXRpdmVWZXJzaW9uSWQoKSwgaW5pdGlhbEFsdGVybmF0aXZlVmVyc2lvbklkKTtcblxuXHRcdGNvbnN0IGVvbEVkaXQ6IElXb3Jrc3BhY2VUZXh0RWRpdER0byA9IHtcblx0XHRcdHJlc291cmNlOiByZXNvdXJjZSxcblx0XHRcdHZlcnNpb25JZDogbW9kZWwuZ2V0VmVyc2lvbklkKCksXG5cdFx0XHR0ZXh0RWRpdDoge1xuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpLFxuXHRcdFx0XHR0ZXh0OiAnJyxcblx0XHRcdFx0ZW9sOiBFbmRPZkxpbmVTZXF1ZW5jZS5MRlxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBlb2xSZXN1bHQgPSBhd2FpdCBidWxrRWRpdHMuJHRyeUFwcGx5V29ya3NwYWNlRWRpdChuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMoeyBlZGl0czogW2VvbEVkaXRdIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW9sUmVzdWx0LCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ2hlbGxvMlxcbndvcmxkJyk7XG5cblx0XHRjb25zdCB1bmRvUmVzdWx0ID0gbW9kZWwudW5kbygpO1xuXHRcdGlmICh1bmRvUmVzdWx0KSB7XG5cdFx0XHRhd2FpdCB1bmRvUmVzdWx0O1xuXHRcdH1cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgaW5pdGlhbFRleHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRBbHRlcm5hdGl2ZVZlcnNpb25JZCgpLCBpbml0aWFsQWx0ZXJuYXRpdmVWZXJzaW9uSWQpO1xuXHR9KTtcblxuXHR0ZXN0KGBhcHBseVdvcmtzcGFjZUVkaXQgd2l0aCBvbmx5IHJlc291cmNlIGVkaXRgLCAoKSA9PiB7XG5cdFx0cmV0dXJuIGJ1bGtFZGl0cy4kdHJ5QXBwbHlXb3Jrc3BhY2VFZGl0KG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyh7XG5cdFx0XHRlZGl0czogW1xuXHRcdFx0XHR7IG9sZFJlc291cmNlOiByZXNvdXJjZSwgbmV3UmVzb3VyY2U6IHJlc291cmNlLCBvcHRpb25zOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0eyBvbGRSZXNvdXJjZTogdW5kZWZpbmVkLCBuZXdSZXNvdXJjZTogcmVzb3VyY2UsIG9wdGlvbnM6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR7IG9sZFJlc291cmNlOiByZXNvdXJjZSwgbmV3UmVzb3VyY2U6IHVuZGVmaW5lZCwgb3B0aW9uczogdW5kZWZpbmVkIH1cblx0XHRcdF1cblx0XHR9KSkudGhlbigocmVzdWx0KSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb3ZlZFJlc291cmNlcy5nZXQocmVzb3VyY2UpLCByZXNvdXJjZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFJlc291cmNlcy5oYXMocmVzb3VyY2UpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWxldGVkUmVzb3VyY2VzLmhhcyhyZXNvdXJjZSksIHRydWUpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBseVdvcmtzcGFjZUVkaXQgY2FuIGNvbnRyb2wgdW5kby9yZWRvIHN0YWNrIDEnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBtb2RlbFNlcnZpY2UuZ2V0TW9kZWwoZXhpc3RpbmdSZXNvdXJjZSkhO1xuXG5cdFx0Y29uc3QgZWRpdDE6IElTaW5nbGVFZGl0T3BlcmF0aW9uID0ge1xuXHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAyKSxcblx0XHRcdHRleHQ6ICdoJyxcblx0XHRcdGZvcmNlTW92ZU1hcmtlcnM6IGZhbHNlXG5cdFx0fTtcblxuXHRcdGNvbnN0IGFwcGxpZWQxID0gYXdhaXQgZWRpdG9ycy4kdHJ5QXBwbHlFZGl0cyhlZGl0b3JJZCwgbW9kZWwuZ2V0VmVyc2lvbklkKCksIFtlZGl0MV0sIHsgdW5kb1N0b3BCZWZvcmU6IGZhbHNlLCB1bmRvU3RvcEFmdGVyOiBmYWxzZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwbGllZDEsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnaGVsbG8gd29ybGQhJyk7XG5cblx0XHRjb25zdCBlZGl0MjogSVNpbmdsZUVkaXRPcGVyYXRpb24gPSB7XG5cdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDIsIDEsIDYpLFxuXHRcdFx0dGV4dDogJ0VMTE8nLFxuXHRcdFx0Zm9yY2VNb3ZlTWFya2VyczogZmFsc2Vcblx0XHR9O1xuXG5cdFx0Y29uc3QgYXBwbGllZDIgPSBhd2FpdCBlZGl0b3JzLiR0cnlBcHBseUVkaXRzKGVkaXRvcklkLCBtb2RlbC5nZXRWZXJzaW9uSWQoKSwgW2VkaXQyXSwgeyB1bmRvU3RvcEJlZm9yZTogZmFsc2UsIHVuZG9TdG9wQWZ0ZXI6IGZhbHNlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHBsaWVkMiwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdoRUxMTyB3b3JsZCEnKTtcblxuXHRcdGF3YWl0IG1vZGVsLnVuZG8oKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ0hlbGxvIHdvcmxkIScpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBseVdvcmtzcGFjZUVkaXQgY2FuIGNvbnRyb2wgdW5kby9yZWRvIHN0YWNrIDInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBtb2RlbFNlcnZpY2UuZ2V0TW9kZWwoZXhpc3RpbmdSZXNvdXJjZSkhO1xuXG5cdFx0Y29uc3QgZWRpdDE6IElTaW5nbGVFZGl0T3BlcmF0aW9uID0ge1xuXHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAyKSxcblx0XHRcdHRleHQ6ICdoJyxcblx0XHRcdGZvcmNlTW92ZU1hcmtlcnM6IGZhbHNlXG5cdFx0fTtcblxuXHRcdGNvbnN0IGFwcGxpZWQxID0gYXdhaXQgZWRpdG9ycy4kdHJ5QXBwbHlFZGl0cyhlZGl0b3JJZCwgbW9kZWwuZ2V0VmVyc2lvbklkKCksIFtlZGl0MV0sIHsgdW5kb1N0b3BCZWZvcmU6IGZhbHNlLCB1bmRvU3RvcEFmdGVyOiBmYWxzZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwbGllZDEsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnaGVsbG8gd29ybGQhJyk7XG5cblx0XHRjb25zdCBlZGl0MjogSVNpbmdsZUVkaXRPcGVyYXRpb24gPSB7XG5cdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDIsIDEsIDYpLFxuXHRcdFx0dGV4dDogJ0VMTE8nLFxuXHRcdFx0Zm9yY2VNb3ZlTWFya2VyczogZmFsc2Vcblx0XHR9O1xuXG5cdFx0Y29uc3QgYXBwbGllZDIgPSBhd2FpdCBlZGl0b3JzLiR0cnlBcHBseUVkaXRzKGVkaXRvcklkLCBtb2RlbC5nZXRWZXJzaW9uSWQoKSwgW2VkaXQyXSwgeyB1bmRvU3RvcEJlZm9yZTogdHJ1ZSwgdW5kb1N0b3BBZnRlcjogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcGxpZWQyLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ2hFTExPIHdvcmxkIScpO1xuXG5cdFx0YXdhaXQgbW9kZWwudW5kbygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnaGVsbG8gd29ybGQhJyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQTZCLHlCQUF5QjtBQUMvRCxTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMscUJBQTJDO0FBQ3BELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUN0QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLHlCQUF3QztBQUNqRCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG9CQUFvQjtBQUM3QixTQUFtQyx5QkFBeUI7QUFDNUQsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDRCQUE0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
