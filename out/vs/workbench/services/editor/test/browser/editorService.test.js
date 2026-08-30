import assert from "assert";
import { EditorActivation } from "../../../../../platform/editor/common/editor.js";
import { URI } from "../../../../../base/common/uri.js";
import { Event } from "../../../../../base/common/event.js";
import { DEFAULT_EDITOR_ASSOCIATION, EditorCloseContext, EditorsOrder, isEditorInputWithOptions, SideBySideEditor, isEditorInput, EditorInputCapabilities } from "../../../../common/editor.js";
import { workbenchInstantiationService, TestServiceAccessor, registerTestEditor, TestFileEditorInput, registerTestResourceEditor, registerTestSideBySideEditor, createEditorPart, registerTestFileEditor, TestTextFileEditor, TestForceRevealFileEditorInput, workbenchTeardown } from "../../../../test/browser/workbenchTestServices.js";
import { EditorService } from "../../browser/editorService.js";
import { IEditorGroupsService, GroupDirection, GroupsArrangement } from "../../common/editorGroupsService.js";
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from "../../common/editorService.js";
import { SyncDescriptor } from "../../../../../platform/instantiation/common/descriptors.js";
import { FileEditorInput } from "../../../../contrib/files/browser/editors/fileEditorInput.js";
import { timeout } from "../../../../../base/common/async.js";
import { FileOperationEvent, FileOperation } from "../../../../../platform/files/common/files.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { MockScopableContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { RegisteredEditorPriority } from "../../common/editorResolverService.js";
import { WorkspaceTrustUriResponse } from "../../../../../platform/workspace/common/workspaceTrust.js";
import { SideBySideEditorInput } from "../../../../common/editor/sideBySideEditorInput.js";
import { ErrorPlaceholderEditor } from "../../../../browser/parts/editor/editorPlaceholder.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../../editor/common/languages/modesRegistry.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
suite("EditorService", () => {
  const TEST_EDITOR_ID = "MyTestEditorForEditorService";
  const TEST_EDITOR_INPUT_ID = "testEditorInputForEditorService";
  const disposables = new DisposableStore();
  let testLocalInstantiationService = void 0;
  setup(() => {
    disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput), new SyncDescriptor(TestForceRevealFileEditorInput)], TEST_EDITOR_INPUT_ID));
    disposables.add(registerTestResourceEditor());
    disposables.add(registerTestSideBySideEditor());
  });
  teardown(async () => {
    if (testLocalInstantiationService) {
      await workbenchTeardown(testLocalInstantiationService);
      testLocalInstantiationService = void 0;
    }
    disposables.clear();
  });
  async function createEditorService(instantiationService = workbenchInstantiationService(void 0, disposables)) {
    const part = await createEditorPart(instantiationService, disposables);
    instantiationService.stub(IEditorGroupsService, part);
    const editorService = disposables.add(instantiationService.createInstance(EditorService, void 0));
    instantiationService.stub(IEditorService, editorService);
    testLocalInstantiationService = instantiationService;
    return [part, editorService, instantiationService.createInstance(TestServiceAccessor)];
  }
  function createTestFileEditorInput(resource, typeId) {
    return disposables.add(new TestFileEditorInput(resource, typeId));
  }
  test("openEditor() - basics", async () => {
    const [, service, accessor] = await createEditorService();
    await testOpenBasics(service, accessor.editorPaneService);
  });
  test("openEditor() - basics (scoped)", async () => {
    const [part, service, accessor] = await createEditorService();
    const scoped = service.createScoped(part, disposables);
    await part.whenReady;
    await testOpenBasics(scoped, accessor.editorPaneService);
  });
  async function testOpenBasics(editorService, editorPaneService) {
    let input = createTestFileEditorInput(URI.parse("my://resource-basics"), TEST_EDITOR_INPUT_ID);
    let otherInput = createTestFileEditorInput(URI.parse("my://resource2-basics"), TEST_EDITOR_INPUT_ID);
    let activeEditorChangeEventCounter = 0;
    disposables.add(editorService.onDidActiveEditorChange(() => {
      activeEditorChangeEventCounter++;
    }));
    let visibleEditorChangeEventCounter = 0;
    disposables.add(editorService.onDidVisibleEditorsChange(() => {
      visibleEditorChangeEventCounter++;
    }));
    let willOpenEditorListenerCounter = 0;
    disposables.add(editorService.onWillOpenEditor(() => {
      willOpenEditorListenerCounter++;
    }));
    let didCloseEditorListenerCounter = 0;
    disposables.add(editorService.onDidCloseEditor(() => {
      didCloseEditorListenerCounter++;
    }));
    let willInstantiateEditorPaneListenerCounter = 0;
    disposables.add(editorPaneService.onWillInstantiateEditorPane((e) => {
      if (e.typeId === TEST_EDITOR_ID) {
        willInstantiateEditorPaneListenerCounter++;
      }
    }));
    let editor = await editorService.openEditor(input, { pinned: true });
    assert.strictEqual(editor?.getId(), TEST_EDITOR_ID);
    assert.strictEqual(editor, editorService.activeEditorPane);
    assert.strictEqual(1, editorService.count);
    assert.strictEqual(input, editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0].editor);
    assert.strictEqual(input, editorService.getEditors(EditorsOrder.SEQUENTIAL)[0].editor);
    assert.strictEqual(input, editorService.activeEditor);
    assert.strictEqual(editorService.visibleEditorPanes.length, 1);
    assert.strictEqual(editorService.visibleEditorPanes[0], editor);
    assert.ok(!editorService.activeTextEditorControl);
    assert.ok(!editorService.activeTextEditorLanguageId);
    assert.strictEqual(editorService.visibleTextEditorControls.length, 0);
    assert.strictEqual(editorService.getVisibleTextEditorControls(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);
    assert.strictEqual(editorService.isOpened(input), true);
    assert.strictEqual(editorService.isOpened({ resource: input.resource, typeId: input.typeId, editorId: input.editorId }), true);
    assert.strictEqual(editorService.isOpened({ resource: input.resource, typeId: input.typeId, editorId: "unknownTypeId" }), false);
    assert.strictEqual(editorService.isOpened({ resource: input.resource, typeId: "unknownTypeId", editorId: input.editorId }), false);
    assert.strictEqual(editorService.isOpened({ resource: input.resource, typeId: "unknownTypeId", editorId: "unknownTypeId" }), false);
    assert.strictEqual(editorService.isVisible(input), true);
    assert.strictEqual(editorService.isVisible(otherInput), false);
    assert.strictEqual(willOpenEditorListenerCounter, 1);
    assert.strictEqual(activeEditorChangeEventCounter, 1);
    assert.strictEqual(visibleEditorChangeEventCounter, 1);
    assert.ok(editorPaneService.didInstantiateEditorPane(TEST_EDITOR_ID));
    assert.strictEqual(willInstantiateEditorPaneListenerCounter, 1);
    await editor?.group.closeEditor(input);
    assert.strictEqual(0, editorService.count);
    assert.strictEqual(0, editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length);
    assert.strictEqual(0, editorService.getEditors(EditorsOrder.SEQUENTIAL).length);
    assert.strictEqual(didCloseEditorListenerCounter, 1);
    assert.strictEqual(activeEditorChangeEventCounter, 2);
    assert.strictEqual(visibleEditorChangeEventCounter, 2);
    assert.ok(input.gotDisposed);
    await editorService.openEditor(input, { pinned: true });
    assert.strictEqual(0, editorService.count);
    input = createTestFileEditorInput(URI.parse("my://resource-basics"), TEST_EDITOR_INPUT_ID);
    otherInput = createTestFileEditorInput(URI.parse("my://resource2-basics"), TEST_EDITOR_INPUT_ID);
    await editorService.openEditor(input, { pinned: true });
    editor = await editorService.openEditor(otherInput, { pinned: true });
    assert.strictEqual(2, editorService.count);
    assert.strictEqual(otherInput, editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[0].editor);
    assert.strictEqual(input, editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)[1].editor);
    assert.strictEqual(input, editorService.getEditors(EditorsOrder.SEQUENTIAL)[0].editor);
    assert.strictEqual(otherInput, editorService.getEditors(EditorsOrder.SEQUENTIAL)[1].editor);
    assert.strictEqual(editorService.visibleEditorPanes.length, 1);
    assert.strictEqual(editorService.isOpened(input), true);
    assert.strictEqual(editorService.isOpened({ resource: input.resource, typeId: input.typeId, editorId: input.editorId }), true);
    assert.strictEqual(editorService.isOpened(otherInput), true);
    assert.strictEqual(editorService.isOpened({ resource: otherInput.resource, typeId: otherInput.typeId, editorId: otherInput.editorId }), true);
    assert.strictEqual(activeEditorChangeEventCounter, 4);
    assert.strictEqual(willOpenEditorListenerCounter, 3);
    assert.strictEqual(visibleEditorChangeEventCounter, 4);
    const stickyInput = createTestFileEditorInput(URI.parse("my://resource3-basics"), TEST_EDITOR_INPUT_ID);
    await editorService.openEditor(stickyInput, { sticky: true });
    assert.strictEqual(3, editorService.count);
    const allSequentialEditors = editorService.getEditors(EditorsOrder.SEQUENTIAL);
    assert.strictEqual(allSequentialEditors.length, 3);
    assert.strictEqual(stickyInput, allSequentialEditors[0].editor);
    assert.strictEqual(input, allSequentialEditors[1].editor);
    assert.strictEqual(otherInput, allSequentialEditors[2].editor);
    const sequentialEditorsExcludingSticky = editorService.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true });
    assert.strictEqual(sequentialEditorsExcludingSticky.length, 2);
    assert.strictEqual(input, sequentialEditorsExcludingSticky[0].editor);
    assert.strictEqual(otherInput, sequentialEditorsExcludingSticky[1].editor);
    const mruEditorsExcludingSticky = editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true });
    assert.strictEqual(mruEditorsExcludingSticky.length, 2);
    assert.strictEqual(input, sequentialEditorsExcludingSticky[0].editor);
    assert.strictEqual(otherInput, sequentialEditorsExcludingSticky[1].editor);
  }
  test("openEditor() - multiple calls are cancelled and indicated as such", async () => {
    const [, service] = await createEditorService();
    const input = createTestFileEditorInput(URI.parse("my://resource-basics"), TEST_EDITOR_INPUT_ID);
    const otherInput = createTestFileEditorInput(URI.parse("my://resource2-basics"), TEST_EDITOR_INPUT_ID);
    let activeEditorChangeEventCounter = 0;
    const activeEditorChangeListener = service.onDidActiveEditorChange(() => {
      activeEditorChangeEventCounter++;
    });
    let visibleEditorChangeEventCounter = 0;
    const visibleEditorChangeListener = service.onDidVisibleEditorsChange(() => {
      visibleEditorChangeEventCounter++;
    });
    const editorP1 = service.openEditor(input, { pinned: true });
    const editorP2 = service.openEditor(otherInput, { pinned: true });
    const editor1 = await editorP1;
    assert.strictEqual(editor1, void 0);
    const editor2 = await editorP2;
    assert.strictEqual(editor2?.input, otherInput);
    assert.strictEqual(activeEditorChangeEventCounter, 1);
    assert.strictEqual(visibleEditorChangeEventCounter, 1);
    activeEditorChangeListener.dispose();
    visibleEditorChangeListener.dispose();
  });
  test("openEditor() - same input does not cancel previous one - https://github.com/microsoft/vscode/issues/136684", async () => {
    const [, service] = await createEditorService();
    let input = createTestFileEditorInput(URI.parse("my://resource-basics"), TEST_EDITOR_INPUT_ID);
    let editorP1 = service.openEditor(input, { pinned: true });
    let editorP2 = service.openEditor(input, { pinned: true });
    let editor1 = await editorP1;
    assert.strictEqual(editor1?.input, input);
    let editor2 = await editorP2;
    assert.strictEqual(editor2?.input, input);
    assert.ok(editor2.group);
    await editor2.group.closeAllEditors();
    input = createTestFileEditorInput(URI.parse("my://resource-basics"), TEST_EDITOR_INPUT_ID);
    const inputSame = createTestFileEditorInput(URI.parse("my://resource-basics"), TEST_EDITOR_INPUT_ID);
    editorP1 = service.openEditor(input, { pinned: true });
    editorP2 = service.openEditor(inputSame, { pinned: true });
    editor1 = await editorP1;
    assert.strictEqual(editor1?.input, input);
    editor2 = await editorP2;
    assert.strictEqual(editor2?.input, input);
  });
  test("openEditor() - force-reveal typed editors reveal instead of split", async () => {
    const [part, service] = await createEditorService();
    const input1 = disposables.add(new TestForceRevealFileEditorInput(URI.parse("my://resource-basics1"), TEST_EDITOR_INPUT_ID));
    const input2 = disposables.add(new TestForceRevealFileEditorInput(URI.parse("my://resource-basics2"), TEST_EDITOR_INPUT_ID));
    const input1Group = (await service.openEditor(input1, { pinned: true }))?.group;
    const input2Group = (await service.openEditor(input2, { pinned: true }, SIDE_GROUP))?.group;
    assert.strictEqual(part.activeGroup, input2Group);
    await service.openEditor(input1, { pinned: true });
    assert.strictEqual(part.activeGroup, input1Group);
  });
  test("openEditor() - locked groups", async () => {
    disposables.add(registerTestFileEditor());
    const [part, service, accessor] = await createEditorService();
    disposables.add(accessor.editorResolverService.registerEditor(
      "*.editor-service-locked-group-tests",
      { id: TEST_EDITOR_INPUT_ID, label: "Label", priority: RegisteredEditorPriority.exclusive },
      {},
      {
        createEditorInput: (editor) => ({ editor: createTestFileEditorInput(editor.resource, TEST_EDITOR_INPUT_ID) })
      }
    ));
    const input1 = { resource: URI.parse("file://resource-basics.editor-service-locked-group-tests"), options: { pinned: true } };
    const input2 = { resource: URI.parse("file://resource2-basics.editor-service-locked-group-tests"), options: { pinned: true } };
    const input3 = { resource: URI.parse("file://resource3-basics.editor-service-locked-group-tests"), options: { pinned: true } };
    const input4 = { resource: URI.parse("file://resource4-basics.editor-service-locked-group-tests"), options: { pinned: true } };
    const input5 = { resource: URI.parse("file://resource5-basics.editor-service-locked-group-tests"), options: { pinned: true } };
    const input6 = { resource: URI.parse("file://resource6-basics.editor-service-locked-group-tests"), options: { pinned: true } };
    const input7 = { resource: URI.parse("file://resource7-basics.editor-service-locked-group-tests"), options: { pinned: true } };
    const editor1 = await service.openEditor(input1, { pinned: true });
    const editor2 = await service.openEditor(input2, { pinned: true }, SIDE_GROUP);
    const group1 = editor1?.group;
    assert.strictEqual(group1?.count, 1);
    const group2 = editor2?.group;
    assert.strictEqual(group2?.count, 1);
    group2.lock(true);
    part.activateGroup(group2.id);
    await service.openEditor(input3, { pinned: true });
    assert.strictEqual(group1.count, 2);
    assert.strictEqual(group1.activeEditor?.resource?.toString(), input3.resource.toString());
    assert.strictEqual(group2.count, 1);
    await service.openEditor(input3, { pinned: true }, group2.id);
    assert.strictEqual(group1.count, 2);
    assert.strictEqual(group2.count, 2);
    assert.strictEqual(group2.activeEditor?.resource?.toString(), input3.resource.toString());
    await service.openEditor(input2, { pinned: true }, group2);
    await service.openEditor(input2, { pinned: true }, ACTIVE_GROUP);
    assert.strictEqual(group1.count, 2);
    assert.strictEqual(group2.count, 2);
    assert.strictEqual(group2.activeEditor?.resource?.toString(), input2.resource.toString());
    part.activateGroup(group1.id);
    const editor3 = await service.openEditor(input4, { pinned: true }, SIDE_GROUP);
    assert.strictEqual(part.count, 3);
    const group3 = editor3?.group;
    assert.strictEqual(group3?.count, 1);
    await service.openEditor(input3, { pinned: true }, group2);
    part.activateGroup(group1.id);
    await service.openEditor(input3, { pinned: true }, SIDE_GROUP);
    assert.strictEqual(part.count, 3);
    group1.lock(true);
    group2.lock(true);
    group3.lock(true);
    part.activateGroup(group1.id);
    const editor5 = await service.openEditor(input5, { pinned: true });
    const group4 = editor5?.group;
    assert.strictEqual(group4?.count, 1);
    assert.strictEqual(group4.activeEditor?.resource?.toString(), input5.resource.toString());
    assert.strictEqual(part.count, 4);
    group1.lock(false);
    group2.lock(false);
    group3.lock(false);
    group4.lock(false);
    part.activateGroup(group3.id);
    part.activateGroup(group2.id);
    part.activateGroup(group4.id);
    group4.lock(true);
    group2.lock(true);
    await service.openEditor(input6, { pinned: true });
    assert.strictEqual(part.count, 4);
    assert.strictEqual(part.activeGroup, group3);
    assert.strictEqual(group3.activeEditor?.resource?.toString(), input6.resource.toString());
    group1.lock(true);
    group2.lock(true);
    group3.lock(true);
    group4.lock(true);
    part.activateGroup(group1.id);
    await service.openEditor(input6, { pinned: true });
    assert.strictEqual(part.count, 4);
    assert.strictEqual(part.activeGroup, group3);
    assert.strictEqual(group3.activeEditor?.resource?.toString(), input6.resource.toString());
    assert.strictEqual(part.activeGroup, group3);
    assert.strictEqual(group3.activeEditor?.resource?.toString(), input6.resource.toString());
    part.activateGroup(group1.id);
    await service.openEditor(input6, { pinned: true });
    assert.strictEqual(part.count, 4);
    assert.strictEqual(part.activeGroup, group3);
    assert.strictEqual(group3.activeEditor?.resource?.toString(), input6.resource.toString());
    await service.openEditor(input7, { pinned: true }, group3);
    await service.openEditor(input6, { pinned: true });
    assert.strictEqual(part.count, 4);
    assert.strictEqual(part.activeGroup, group3);
    assert.strictEqual(group3.activeEditor?.resource?.toString(), input6.resource.toString());
  });
  test("locked groups - workbench.editor.revealIfOpen", async () => {
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const configurationService = new TestConfigurationService();
    await configurationService.setUserConfiguration("workbench", { "editor": { "revealIfOpen": true } });
    instantiationService.stub(IConfigurationService, configurationService);
    disposables.add(registerTestFileEditor());
    const [part, service, accessor] = await createEditorService(instantiationService);
    disposables.add(accessor.editorResolverService.registerEditor(
      "*.editor-service-locked-group-tests",
      { id: TEST_EDITOR_INPUT_ID, label: "Label", priority: RegisteredEditorPriority.exclusive },
      {},
      {
        createEditorInput: (editor) => ({ editor: createTestFileEditorInput(editor.resource, TEST_EDITOR_INPUT_ID) })
      }
    ));
    const rootGroup = part.activeGroup;
    const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    part.activateGroup(rootGroup);
    const input1 = { resource: URI.parse("file://resource-basics.editor-service-locked-group-tests"), options: { pinned: true } };
    const input2 = { resource: URI.parse("file://resource2-basics.editor-service-locked-group-tests"), options: { pinned: true } };
    const input3 = { resource: URI.parse("file://resource3-basics.editor-service-locked-group-tests"), options: { pinned: true } };
    const input4 = { resource: URI.parse("file://resource4-basics.editor-service-locked-group-tests"), options: { pinned: true } };
    await service.openEditor(input1, rootGroup.id);
    await service.openEditor(input2, rootGroup.id);
    assert.strictEqual(part.activeGroup.id, rootGroup.id);
    await service.openEditor(input3, rightGroup.id);
    await service.openEditor(input4, rightGroup.id);
    assert.strictEqual(part.activeGroup.id, rightGroup.id);
    rootGroup.lock(true);
    rightGroup.lock(true);
    await service.openEditor(input1);
    assert.strictEqual(part.activeGroup.id, rootGroup.id);
    assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), input1.resource.toString());
    await service.openEditor(input3);
    assert.strictEqual(part.activeGroup.id, rightGroup.id);
    assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), input3.resource.toString());
    assert.strictEqual(part.groups.length, 2);
  });
  test("locked groups - revealIfVisible", async () => {
    disposables.add(registerTestFileEditor());
    const [part, service, accessor] = await createEditorService();
    disposables.add(accessor.editorResolverService.registerEditor(
      "*.editor-service-locked-group-tests",
      { id: TEST_EDITOR_INPUT_ID, label: "Label", priority: RegisteredEditorPriority.exclusive },
      {},
      {
        createEditorInput: (editor) => ({ editor: createTestFileEditorInput(editor.resource, TEST_EDITOR_INPUT_ID) })
      }
    ));
    const rootGroup = part.activeGroup;
    const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    part.activateGroup(rootGroup);
    const input1 = { resource: URI.parse("file://resource-basics.editor-service-locked-group-tests"), options: { pinned: true } };
    const input2 = { resource: URI.parse("file://resource2-basics.editor-service-locked-group-tests"), options: { pinned: true } };
    const input3 = { resource: URI.parse("file://resource3-basics.editor-service-locked-group-tests"), options: { pinned: true } };
    const input4 = { resource: URI.parse("file://resource4-basics.editor-service-locked-group-tests"), options: { pinned: true } };
    await service.openEditor(input1, rootGroup.id);
    await service.openEditor(input2, rootGroup.id);
    assert.strictEqual(part.activeGroup.id, rootGroup.id);
    await service.openEditor(input3, rightGroup.id);
    await service.openEditor(input4, rightGroup.id);
    assert.strictEqual(part.activeGroup.id, rightGroup.id);
    rootGroup.lock(true);
    rightGroup.lock(true);
    await service.openEditor({ ...input2, options: { ...input2.options, revealIfVisible: true } });
    assert.strictEqual(part.activeGroup.id, rootGroup.id);
    assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), input2.resource.toString());
    await service.openEditor({ ...input4, options: { ...input4.options, revealIfVisible: true } });
    assert.strictEqual(part.activeGroup.id, rightGroup.id);
    assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), input4.resource.toString());
    assert.strictEqual(part.groups.length, 2);
  });
  test("locked groups - revealIfOpened", async () => {
    disposables.add(registerTestFileEditor());
    const [part, service, accessor] = await createEditorService();
    disposables.add(accessor.editorResolverService.registerEditor(
      "*.editor-service-locked-group-tests",
      { id: TEST_EDITOR_INPUT_ID, label: "Label", priority: RegisteredEditorPriority.exclusive },
      {},
      {
        createEditorInput: (editor) => ({ editor: createTestFileEditorInput(editor.resource, TEST_EDITOR_INPUT_ID) })
      }
    ));
    const rootGroup = part.activeGroup;
    const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    part.activateGroup(rootGroup);
    const input1 = { resource: URI.parse("file://resource-basics.editor-service-locked-group-tests"), options: { pinned: true } };
    const input2 = { resource: URI.parse("file://resource2-basics.editor-service-locked-group-tests"), options: { pinned: true } };
    const input3 = { resource: URI.parse("file://resource3-basics.editor-service-locked-group-tests"), options: { pinned: true } };
    const input4 = { resource: URI.parse("file://resource4-basics.editor-service-locked-group-tests"), options: { pinned: true } };
    await service.openEditor(input1, rootGroup.id);
    await service.openEditor(input2, rootGroup.id);
    assert.strictEqual(part.activeGroup.id, rootGroup.id);
    await service.openEditor(input3, rightGroup.id);
    await service.openEditor(input4, rightGroup.id);
    assert.strictEqual(part.activeGroup.id, rightGroup.id);
    rootGroup.lock(true);
    rightGroup.lock(true);
    await service.openEditor({ ...input1, options: { ...input1.options, revealIfOpened: true } });
    assert.strictEqual(part.activeGroup.id, rootGroup.id);
    assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), input1.resource.toString());
    await service.openEditor({ ...input3, options: { ...input3.options, revealIfOpened: true } });
    assert.strictEqual(part.activeGroup.id, rightGroup.id);
    assert.strictEqual(part.activeGroup.activeEditor?.resource?.toString(), input3.resource.toString());
    assert.strictEqual(part.groups.length, 2);
  });
  test("openEditor() - untyped, typed", () => {
    return testOpenEditors(false);
  });
  test("openEditors() - untyped, typed", () => {
    return testOpenEditors(true);
  });
  async function testOpenEditors(useOpenEditors) {
    disposables.add(registerTestFileEditor());
    const [part, service, accessor] = await createEditorService();
    let rootGroup = part.activeGroup;
    let editorFactoryCalled = 0;
    let untitledEditorFactoryCalled = 0;
    let diffEditorFactoryCalled = 0;
    let lastEditorFactoryEditor = void 0;
    let lastUntitledEditorFactoryEditor = void 0;
    let lastDiffEditorFactoryEditor = void 0;
    disposables.add(accessor.editorResolverService.registerEditor(
      "*.editor-service-override-tests",
      { id: TEST_EDITOR_INPUT_ID, label: "Label", priority: RegisteredEditorPriority.exclusive },
      {},
      {
        createEditorInput: (editor) => {
          editorFactoryCalled++;
          lastEditorFactoryEditor = editor;
          return { editor: createTestFileEditorInput(editor.resource, TEST_EDITOR_INPUT_ID) };
        },
        createUntitledEditorInput: (untitledEditor) => {
          untitledEditorFactoryCalled++;
          lastUntitledEditorFactoryEditor = untitledEditor;
          return { editor: createTestFileEditorInput(untitledEditor.resource ?? URI.parse(`untitled://my-untitled-editor-${untitledEditorFactoryCalled}`), TEST_EDITOR_INPUT_ID) };
        },
        createDiffEditorInput: (diffEditor) => {
          diffEditorFactoryCalled++;
          lastDiffEditorFactoryEditor = diffEditor;
          return { editor: createTestFileEditorInput(URI.file(`diff-editor-${diffEditorFactoryCalled}`), TEST_EDITOR_INPUT_ID) };
        }
      }
    ));
    async function resetTestState() {
      editorFactoryCalled = 0;
      untitledEditorFactoryCalled = 0;
      diffEditorFactoryCalled = 0;
      lastEditorFactoryEditor = void 0;
      lastUntitledEditorFactoryEditor = void 0;
      lastDiffEditorFactoryEditor = void 0;
      await workbenchTeardown(accessor.instantiationService);
      rootGroup = part.activeGroup;
    }
    async function openEditor(editor, group) {
      if (useOpenEditors) {
        if (!isEditorInputWithOptions(editor) && isEditorInput(editor)) {
          editor = { editor, options: {} };
        }
        const panes = await service.openEditors([editor], group);
        return panes[0];
      }
      if (isEditorInputWithOptions(editor)) {
        return service.openEditor(editor.editor, editor.options, group);
      }
      return service.openEditor(editor, group);
    }
    {
      {
        const untypedEditor = { resource: URI.file("file.editor-service-override-tests") };
        const pane = await openEditor(untypedEditor);
        let typedEditor = pane?.input;
        assert.strictEqual(pane?.group, rootGroup);
        assert.ok(typedEditor instanceof TestFileEditorInput);
        assert.strictEqual(typedEditor.resource.toString(), untypedEditor.resource.toString());
        assert.strictEqual(editorFactoryCalled, 1);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.strictEqual(lastEditorFactoryEditor, untypedEditor);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await openEditor(untypedEditor);
        assert.strictEqual(pane?.group.activeEditor, typedEditor);
        const untypedEditorReplacement = { resource: URI.file("file-replaced.editor-service-override-tests") };
        await service.replaceEditors([{
          editor: typedEditor,
          replacement: untypedEditorReplacement
        }], rootGroup);
        typedEditor = rootGroup.activeEditor;
        assert.ok(typedEditor instanceof TestFileEditorInput);
        assert.strictEqual(typedEditor?.resource?.toString(), untypedEditorReplacement.resource.toString());
        assert.strictEqual(editorFactoryCalled, 3);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.strictEqual(lastEditorFactoryEditor, untypedEditorReplacement);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await resetTestState();
      }
      {
        const untypedEditor = { resource: URI.file("file.editor-service-override-tests"), options: { override: DEFAULT_EDITOR_ASSOCIATION.id } };
        const pane = await openEditor(untypedEditor);
        const typedEditor = pane?.input;
        assert.strictEqual(pane?.group, rootGroup);
        assert.ok(typedEditor instanceof FileEditorInput);
        assert.strictEqual(typedEditor.resource.toString(), untypedEditor.resource.toString());
        assert.strictEqual(editorFactoryCalled, 0);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.ok(!lastEditorFactoryEditor);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await openEditor(untypedEditor);
        assert.strictEqual(pane?.group.activeEditor, typedEditor);
        await resetTestState();
      }
      {
        const untypedEditor = { resource: URI.file("file.editor-service-override-tests"), options: { sticky: true, preserveFocus: true, override: DEFAULT_EDITOR_ASSOCIATION.id } };
        const pane = await openEditor(untypedEditor);
        assert.strictEqual(pane?.group, rootGroup);
        assert.ok(pane.input instanceof FileEditorInput);
        assert.strictEqual(pane.input.resource.toString(), untypedEditor.resource.toString());
        assert.strictEqual(pane.group.isSticky(pane.input), true);
        assert.strictEqual(editorFactoryCalled, 0);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.ok(!lastEditorFactoryEditor);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await resetTestState();
        await part.activeGroup.closeEditor(pane.input);
      }
      {
        const untypedEditor = { resource: URI.file("file.editor-service-override-tests"), options: { override: DEFAULT_EDITOR_ASSOCIATION.id } };
        const pane = await openEditor(untypedEditor);
        assert.strictEqual(pane?.group, rootGroup);
        assert.ok(pane.input instanceof FileEditorInput);
        assert.strictEqual(pane.input.resource.toString(), untypedEditor.resource.toString());
        assert.strictEqual(editorFactoryCalled, 0);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.ok(!lastEditorFactoryEditor);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await resetTestState();
      }
      {
        const untypedEditor = { resource: URI.file("file.editor-service-override-tests"), options: { override: TEST_EDITOR_INPUT_ID } };
        const pane = await openEditor(untypedEditor);
        assert.strictEqual(pane?.group, rootGroup);
        assert.ok(pane.input instanceof TestFileEditorInput);
        assert.strictEqual(pane.input.resource.toString(), untypedEditor.resource.toString());
        assert.strictEqual(editorFactoryCalled, 1);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.strictEqual(lastEditorFactoryEditor, untypedEditor);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await resetTestState();
      }
      {
        const untypedEditor = { resource: URI.file("file.editor-service-override-tests"), options: { sticky: true, preserveFocus: true } };
        const pane = await openEditor(untypedEditor);
        assert.strictEqual(pane?.group, rootGroup);
        assert.ok(pane.input instanceof TestFileEditorInput);
        assert.strictEqual(pane.input.resource.toString(), untypedEditor.resource.toString());
        assert.strictEqual(pane.group.isSticky(pane.input), true);
        assert.strictEqual(editorFactoryCalled, 1);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.strictEqual(lastEditorFactoryEditor.resource.toString(), untypedEditor.resource.toString());
        assert.strictEqual(lastEditorFactoryEditor.options?.preserveFocus, true);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await resetTestState();
        await part.activeGroup.closeEditor(pane.input);
      }
      {
        const untypedEditor = { resource: URI.file("file.editor-service-override-tests"), options: { sticky: true, preserveFocus: true, override: TEST_EDITOR_INPUT_ID } };
        const pane = await openEditor(untypedEditor);
        assert.strictEqual(pane?.group, rootGroup);
        assert.ok(pane.input instanceof TestFileEditorInput);
        assert.strictEqual(pane.input.resource.toString(), untypedEditor.resource.toString());
        assert.strictEqual(pane.group.isSticky(pane.input), true);
        assert.strictEqual(editorFactoryCalled, 1);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.strictEqual(lastEditorFactoryEditor.resource.toString(), untypedEditor.resource.toString());
        assert.strictEqual(lastEditorFactoryEditor.options?.preserveFocus, true);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await resetTestState();
        await part.activeGroup.closeEditor(pane.input);
      }
      {
        const untypedEditor = { resource: URI.file("file.editor-service-override-tests") };
        const pane = await openEditor(untypedEditor, SIDE_GROUP);
        assert.strictEqual(accessor.editorGroupService.groups.length, 2);
        assert.notStrictEqual(pane?.group, rootGroup);
        assert.ok(pane?.input instanceof TestFileEditorInput);
        assert.strictEqual(pane?.input.resource.toString(), untypedEditor.resource.toString());
        assert.strictEqual(editorFactoryCalled, 1);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.strictEqual(lastEditorFactoryEditor, untypedEditor);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await resetTestState();
      }
      {
        const untypedEditor = { resource: URI.file("file.editor-service-override-tests"), options: { override: DEFAULT_EDITOR_ASSOCIATION.id } };
        const pane = await openEditor(untypedEditor, SIDE_GROUP);
        assert.strictEqual(accessor.editorGroupService.groups.length, 2);
        assert.notStrictEqual(pane?.group, rootGroup);
        assert.ok(pane?.input instanceof FileEditorInput);
        assert.strictEqual(pane.input.resource.toString(), untypedEditor.resource.toString());
        assert.strictEqual(editorFactoryCalled, 0);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.ok(!lastEditorFactoryEditor);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await resetTestState();
      }
    }
    {
      {
        const typedEditor = createTestFileEditorInput(URI.file("file.editor-service-override-tests"), TEST_EDITOR_INPUT_ID);
        const pane = await openEditor({ editor: typedEditor });
        let typedInput = pane?.input;
        assert.strictEqual(pane?.group, rootGroup);
        assert.ok(typedInput instanceof TestFileEditorInput);
        assert.strictEqual(typedInput.resource.toString(), typedEditor.resource.toString());
        assert.strictEqual(editorFactoryCalled, 0);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.ok(!lastEditorFactoryEditor);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await openEditor(typedEditor);
        assert.strictEqual(pane?.group.activeEditor, typedInput);
        const typedEditorReplacement = createTestFileEditorInput(URI.file("file-replaced.editor-service-override-tests"), TEST_EDITOR_INPUT_ID);
        await service.replaceEditors([{
          editor: typedEditor,
          replacement: typedEditorReplacement
        }], rootGroup);
        typedInput = rootGroup.activeEditor;
        assert.ok(typedInput instanceof TestFileEditorInput);
        assert.strictEqual(typedInput.resource.toString(), typedEditorReplacement.resource.toString());
        assert.strictEqual(editorFactoryCalled, 0);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await resetTestState();
      }
      {
        const typedEditor = createTestFileEditorInput(URI.file("file.editor-service-override-tests"), TEST_EDITOR_INPUT_ID);
        const pane = await openEditor({ editor: typedEditor });
        const typedInput = pane?.input;
        assert.strictEqual(pane?.group, rootGroup);
        assert.ok(typedInput instanceof TestFileEditorInput);
        assert.strictEqual(typedInput.resource.toString(), typedEditor.resource.toString());
        assert.strictEqual(editorFactoryCalled, 0);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.ok(!lastEditorFactoryEditor);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await openEditor(typedEditor);
        assert.strictEqual(pane?.group.activeEditor, typedEditor);
        await resetTestState();
      }
      {
        const typedEditor = createTestFileEditorInput(URI.file("file.editor-service-override-tests"), TEST_EDITOR_INPUT_ID);
        const pane = await openEditor({ editor: typedEditor, options: { sticky: true, preserveFocus: true } });
        assert.strictEqual(pane?.group, rootGroup);
        assert.ok(pane.input instanceof TestFileEditorInput);
        assert.strictEqual(pane.input.resource.toString(), typedEditor.resource.toString());
        assert.strictEqual(pane.group.isSticky(pane.input), true);
        assert.strictEqual(editorFactoryCalled, 0);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.ok(!lastEditorFactoryEditor);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await resetTestState();
        await part.activeGroup.closeEditor(pane.input);
      }
      {
        const typedEditor = createTestFileEditorInput(URI.file("file.editor-service-override-tests"), TEST_EDITOR_INPUT_ID);
        const pane = await openEditor({ editor: typedEditor, options: { override: DEFAULT_EDITOR_ASSOCIATION.id } });
        assert.strictEqual(pane?.group, rootGroup);
        assert.ok(pane.input instanceof TestFileEditorInput);
        assert.strictEqual(pane.input.resource.toString(), typedEditor.resource.toString());
        assert.strictEqual(editorFactoryCalled, 0);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.ok(!lastEditorFactoryEditor);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await resetTestState();
      }
      {
        const typedEditor = createTestFileEditorInput(URI.file("file.editor-service-override-tests"), TEST_EDITOR_INPUT_ID);
        const pane = await openEditor({ editor: typedEditor, options: { override: TEST_EDITOR_INPUT_ID } });
        assert.strictEqual(pane?.group, rootGroup);
        assert.ok(pane.input instanceof TestFileEditorInput);
        assert.strictEqual(pane.input.resource.toString(), typedEditor.resource.toString());
        assert.strictEqual(editorFactoryCalled, 0);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.ok(!lastEditorFactoryEditor);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await resetTestState();
      }
      {
        const typedEditor = createTestFileEditorInput(URI.file("file.editor-service-override-tests"), TEST_EDITOR_INPUT_ID);
        const pane = await openEditor({ editor: typedEditor, options: { sticky: true, preserveFocus: true } });
        assert.strictEqual(pane?.group, rootGroup);
        assert.ok(pane.input instanceof TestFileEditorInput);
        assert.strictEqual(pane.input.resource.toString(), typedEditor.resource.toString());
        assert.strictEqual(pane.group.isSticky(pane.input), true);
        assert.strictEqual(editorFactoryCalled, 0);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.ok(!lastEditorFactoryEditor);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await resetTestState();
        await part.activeGroup.closeEditor(pane.input);
      }
      {
        const typedEditor = createTestFileEditorInput(URI.file("file.editor-service-override-tests"), TEST_EDITOR_INPUT_ID);
        const pane = await openEditor({ editor: typedEditor, options: { sticky: true, preserveFocus: true, override: TEST_EDITOR_INPUT_ID } });
        assert.strictEqual(pane?.group, rootGroup);
        assert.ok(pane.input instanceof TestFileEditorInput);
        assert.strictEqual(pane.input.resource.toString(), typedEditor.resource.toString());
        assert.strictEqual(pane.group.isSticky(pane.input), true);
        assert.strictEqual(editorFactoryCalled, 0);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.ok(!lastEditorFactoryEditor);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await resetTestState();
        await part.activeGroup.closeEditor(pane.input);
      }
      {
        const typedEditor = createTestFileEditorInput(URI.file("file.editor-service-override-tests"), TEST_EDITOR_INPUT_ID);
        const pane = await openEditor({ editor: typedEditor }, SIDE_GROUP);
        assert.strictEqual(accessor.editorGroupService.groups.length, 2);
        assert.notStrictEqual(pane?.group, rootGroup);
        assert.ok(pane?.input instanceof TestFileEditorInput);
        assert.strictEqual(pane?.input.resource.toString(), typedEditor.resource.toString());
        assert.strictEqual(editorFactoryCalled, 0);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.ok(!lastEditorFactoryEditor);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await resetTestState();
      }
      {
        const typedEditor = createTestFileEditorInput(URI.file("file.editor-service-override-tests"), TEST_EDITOR_INPUT_ID);
        const pane = await openEditor({ editor: typedEditor }, SIDE_GROUP);
        assert.strictEqual(accessor.editorGroupService.groups.length, 2);
        assert.notStrictEqual(pane?.group, rootGroup);
        assert.ok(pane?.input instanceof TestFileEditorInput);
        assert.strictEqual(pane.input.resource.toString(), typedEditor.resource.toString());
        assert.strictEqual(editorFactoryCalled, 0);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.ok(!lastEditorFactoryEditor);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await resetTestState();
      }
    }
    {
      {
        const untypedEditor = { resource: void 0, options: { override: TEST_EDITOR_INPUT_ID } };
        const pane = await openEditor(untypedEditor);
        assert.strictEqual(pane?.group, rootGroup);
        assert.ok(pane.input instanceof TestFileEditorInput);
        assert.strictEqual(pane.input.resource.scheme, "untitled");
        assert.strictEqual(editorFactoryCalled, 0);
        assert.strictEqual(untitledEditorFactoryCalled, 1);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.ok(!lastEditorFactoryEditor);
        assert.strictEqual(lastUntitledEditorFactoryEditor, untypedEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await resetTestState();
      }
      {
        const untypedEditor = { resource: void 0, options: { override: TEST_EDITOR_INPUT_ID } };
        const pane = await openEditor(untypedEditor, SIDE_GROUP);
        assert.strictEqual(accessor.editorGroupService.groups.length, 2);
        assert.notStrictEqual(pane?.group, rootGroup);
        assert.ok(pane?.input instanceof TestFileEditorInput);
        assert.strictEqual(pane?.input.resource.scheme, "untitled");
        assert.strictEqual(editorFactoryCalled, 0);
        assert.strictEqual(untitledEditorFactoryCalled, 1);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.ok(!lastEditorFactoryEditor);
        assert.strictEqual(lastUntitledEditorFactoryEditor, untypedEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await resetTestState();
      }
      {
        const untypedEditor = { resource: URI.file("file-original.editor-service-override-tests").with({ scheme: "untitled" }) };
        const pane = await openEditor(untypedEditor);
        const typedEditor = pane?.input;
        assert.strictEqual(pane?.group, rootGroup);
        assert.ok(typedEditor instanceof TestFileEditorInput);
        assert.strictEqual(typedEditor.resource.scheme, "untitled");
        assert.strictEqual(editorFactoryCalled, 0);
        assert.strictEqual(untitledEditorFactoryCalled, 1);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.ok(!lastEditorFactoryEditor);
        assert.strictEqual(lastUntitledEditorFactoryEditor, untypedEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await openEditor(untypedEditor);
        assert.strictEqual(pane?.group.activeEditor, typedEditor);
        await resetTestState();
      }
      {
        const untypedEditor = { resource: void 0, options: { sticky: true, preserveFocus: true, override: TEST_EDITOR_INPUT_ID } };
        const pane = await openEditor(untypedEditor);
        assert.strictEqual(pane?.group, rootGroup);
        assert.ok(pane.input instanceof TestFileEditorInput);
        assert.strictEqual(pane.input.resource.scheme, "untitled");
        assert.strictEqual(pane.group.isSticky(pane.input), true);
        assert.strictEqual(editorFactoryCalled, 0);
        assert.strictEqual(untitledEditorFactoryCalled, 1);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.ok(!lastEditorFactoryEditor);
        assert.strictEqual(lastUntitledEditorFactoryEditor, untypedEditor);
        assert.strictEqual(lastUntitledEditorFactoryEditor.options?.preserveFocus, true);
        assert.strictEqual(lastUntitledEditorFactoryEditor.options?.sticky, true);
        assert.ok(!lastDiffEditorFactoryEditor);
        await resetTestState();
      }
    }
    {
      {
        const untypedEditor = {
          original: { resource: URI.file("file-original.editor-service-override-tests") },
          modified: { resource: URI.file("file-modified.editor-service-override-tests") },
          options: { override: TEST_EDITOR_INPUT_ID }
        };
        const pane = await openEditor(untypedEditor);
        const typedEditor = pane?.input;
        assert.strictEqual(pane?.group, rootGroup);
        assert.ok(typedEditor instanceof TestFileEditorInput);
        assert.strictEqual(editorFactoryCalled, 0);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 1);
        assert.ok(!lastEditorFactoryEditor);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.strictEqual(lastDiffEditorFactoryEditor, untypedEditor);
        await resetTestState();
      }
      {
        const untypedEditor = {
          original: { resource: URI.file("file-original.editor-service-override-tests") },
          modified: { resource: URI.file("file-modified.editor-service-override-tests") },
          options: { override: TEST_EDITOR_INPUT_ID }
        };
        const pane = await openEditor(untypedEditor, SIDE_GROUP);
        assert.strictEqual(accessor.editorGroupService.groups.length, 2);
        assert.notStrictEqual(pane?.group, rootGroup);
        assert.ok(pane?.input instanceof TestFileEditorInput);
        assert.strictEqual(editorFactoryCalled, 0);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 1);
        assert.ok(!lastEditorFactoryEditor);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.strictEqual(lastDiffEditorFactoryEditor, untypedEditor);
        await resetTestState();
      }
      {
        const untypedEditor = {
          original: { resource: URI.file("file-original.editor-service-override-tests") },
          modified: { resource: URI.file("file-modified.editor-service-override-tests") },
          options: {
            override: TEST_EDITOR_INPUT_ID,
            sticky: true,
            preserveFocus: true
          }
        };
        const pane = await openEditor(untypedEditor);
        assert.strictEqual(pane?.group, rootGroup);
        assert.ok(pane.input instanceof TestFileEditorInput);
        assert.strictEqual(pane.group.isSticky(pane.input), true);
        assert.strictEqual(editorFactoryCalled, 0);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 1);
        assert.ok(!lastEditorFactoryEditor);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.strictEqual(lastDiffEditorFactoryEditor, untypedEditor);
        assert.strictEqual(lastDiffEditorFactoryEditor.options?.preserveFocus, true);
        assert.strictEqual(lastDiffEditorFactoryEditor.options?.sticky, true);
        await resetTestState();
      }
    }
    {
      {
        const typedEditor = createTestFileEditorInput(URI.file("file.something"), TEST_EDITOR_INPUT_ID);
        const pane = await openEditor({ editor: typedEditor });
        assert.strictEqual(pane?.group, rootGroup);
        assert.ok(pane.input instanceof TestFileEditorInput);
        assert.strictEqual(pane.input, typedEditor);
        assert.strictEqual(editorFactoryCalled, 0);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.ok(!lastEditorFactoryEditor);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await resetTestState();
      }
      {
        const typedEditor = createTestFileEditorInput(URI.file("file.something"), TEST_EDITOR_INPUT_ID);
        const pane = await openEditor({ editor: typedEditor }, SIDE_GROUP);
        assert.strictEqual(accessor.editorGroupService.groups.length, 2);
        assert.notStrictEqual(pane?.group, rootGroup);
        assert.ok(pane?.input instanceof TestFileEditorInput);
        assert.strictEqual(pane?.input, typedEditor);
        assert.strictEqual(editorFactoryCalled, 0);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.ok(!lastEditorFactoryEditor);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await resetTestState();
      }
    }
    {
      {
        const typedEditor = createTestFileEditorInput(URI.file("file.something"), TEST_EDITOR_INPUT_ID);
        typedEditor.disableToUntyped = true;
        const pane = await openEditor({ editor: typedEditor });
        assert.strictEqual(pane?.group, rootGroup);
        assert.ok(pane.input instanceof TestFileEditorInput);
        assert.strictEqual(pane.input, typedEditor);
        assert.strictEqual(editorFactoryCalled, 0);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.ok(!lastEditorFactoryEditor);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await resetTestState();
      }
      {
        const typedEditor = createTestFileEditorInput(URI.file("file.something"), TEST_EDITOR_INPUT_ID);
        typedEditor.disableToUntyped = true;
        const pane = await openEditor({ editor: typedEditor }, SIDE_GROUP);
        assert.strictEqual(accessor.editorGroupService.groups.length, 2);
        assert.notStrictEqual(pane?.group, rootGroup);
        assert.ok(pane?.input instanceof TestFileEditorInput);
        assert.strictEqual(pane?.input, typedEditor);
        assert.strictEqual(editorFactoryCalled, 0);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.ok(!lastEditorFactoryEditor);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await resetTestState();
      }
    }
    if (useOpenEditors) {
      {
        const untypedEditor1 = { resource: URI.file("file1.editor-service-override-tests") };
        const untypedEditor2 = { resource: URI.file("file2.editor-service-override-tests") };
        const untypedEditor3 = { editor: createTestFileEditorInput(URI.file("file3.editor-service-override-tests"), TEST_EDITOR_INPUT_ID) };
        const untypedEditor4 = { editor: createTestFileEditorInput(URI.file("file4.editor-service-override-tests"), TEST_EDITOR_INPUT_ID) };
        const untypedEditor5 = { resource: URI.file("file5.editor-service-override-tests") };
        const pane = (await service.openEditors([untypedEditor1, untypedEditor2, untypedEditor3, untypedEditor4, untypedEditor5]))[0];
        assert.strictEqual(pane?.group, rootGroup);
        assert.strictEqual(pane?.group.count, 5);
        assert.strictEqual(editorFactoryCalled, 3);
        assert.strictEqual(untitledEditorFactoryCalled, 0);
        assert.strictEqual(diffEditorFactoryCalled, 0);
        assert.ok(lastEditorFactoryEditor);
        assert.ok(!lastUntitledEditorFactoryEditor);
        assert.ok(!lastDiffEditorFactoryEditor);
        await resetTestState();
      }
    }
    {
      {
        const untypedEditor1 = { resource: URI.file("file-1"), options: { revealIfVisible: true, pinned: true } };
        const untypedEditor2 = { resource: URI.file("file-2"), options: { pinned: true } };
        const rootPane = await openEditor(untypedEditor1);
        const sidePane = await openEditor(untypedEditor2, SIDE_GROUP);
        assert.strictEqual(rootPane?.group.count, 1);
        assert.strictEqual(sidePane?.group.count, 1);
        accessor.editorGroupService.activateGroup(sidePane.group);
        await openEditor(untypedEditor1);
        assert.strictEqual(rootPane?.group.count, 1);
        assert.strictEqual(sidePane?.group.count, 1);
        await resetTestState();
      }
      {
        const untypedEditor1 = { resource: URI.file("file-1"), options: { revealIfOpened: true, pinned: true } };
        const untypedEditor2 = { resource: URI.file("file-2"), options: { pinned: true } };
        const rootPane = await openEditor(untypedEditor1);
        await openEditor(untypedEditor2);
        assert.strictEqual(rootPane?.group.activeEditor?.resource?.toString(), untypedEditor2.resource.toString());
        const sidePane = await openEditor(untypedEditor2, SIDE_GROUP);
        assert.strictEqual(rootPane?.group.count, 2);
        assert.strictEqual(sidePane?.group.count, 1);
        accessor.editorGroupService.activateGroup(sidePane.group);
        await openEditor(untypedEditor1);
        assert.strictEqual(rootPane?.group.count, 2);
        assert.strictEqual(sidePane?.group.count, 1);
        await resetTestState();
      }
    }
  }
  test("openEditor() applies options if editor already opened", async () => {
    disposables.add(registerTestFileEditor());
    const [, service, accessor] = await createEditorService();
    disposables.add(accessor.editorResolverService.registerEditor(
      "*.editor-service-override-tests",
      { id: TEST_EDITOR_INPUT_ID, label: "Label", priority: RegisteredEditorPriority.exclusive },
      {},
      {
        createEditorInput: (editor) => ({ editor: createTestFileEditorInput(editor.resource, TEST_EDITOR_INPUT_ID) })
      }
    ));
    let pane = await service.openEditor(createTestFileEditorInput(URI.parse("my://resource-openEditors"), TEST_EDITOR_INPUT_ID));
    pane = await service.openEditor(createTestFileEditorInput(URI.parse("my://resource-openEditors"), TEST_EDITOR_INPUT_ID), { sticky: true, preserveFocus: true });
    assert.strictEqual(pane?.options?.sticky, true);
    assert.strictEqual(pane?.options?.preserveFocus, true);
    await pane.group.closeAllEditors();
    pane = await service.openEditor({ resource: URI.file("resource-openEditors") });
    pane = await service.openEditor({ resource: URI.file("resource-openEditors"), options: { sticky: true, preserveFocus: true } });
    assert.ok(pane instanceof TestTextFileEditor);
    assert.strictEqual(pane?.options?.sticky, true);
    assert.strictEqual(pane?.options?.preserveFocus, true);
    pane = await service.openEditor({ resource: URI.file("file.editor-service-override-tests") });
    pane = await service.openEditor({ resource: URI.file("file.editor-service-override-tests"), options: { sticky: true, preserveFocus: true } });
    assert.strictEqual(pane?.options?.sticky, true);
    assert.strictEqual(pane?.options?.preserveFocus, true);
  });
  test("isOpen() with side by side editor", async () => {
    const [part, service] = await createEditorService();
    const input = createTestFileEditorInput(URI.parse("my://resource-openEditors"), TEST_EDITOR_INPUT_ID);
    const otherInput = createTestFileEditorInput(URI.parse("my://resource2-openEditors"), TEST_EDITOR_INPUT_ID);
    const sideBySideInput = new SideBySideEditorInput("sideBySide", "", input, otherInput, service);
    const editor1 = await service.openEditor(sideBySideInput, { pinned: true });
    assert.strictEqual(part.activeGroup.count, 1);
    assert.strictEqual(service.isOpened(input), false);
    assert.strictEqual(service.isOpened(otherInput), true);
    assert.strictEqual(service.isOpened({ resource: input.resource, typeId: input.typeId, editorId: input.editorId }), false);
    assert.strictEqual(service.isOpened({ resource: otherInput.resource, typeId: otherInput.typeId, editorId: otherInput.editorId }), true);
    const editor2 = await service.openEditor(input, { pinned: true });
    assert.strictEqual(part.activeGroup.count, 2);
    assert.strictEqual(service.isOpened(input), true);
    assert.strictEqual(service.isOpened(otherInput), true);
    assert.strictEqual(service.isOpened({ resource: input.resource, typeId: input.typeId, editorId: input.editorId }), true);
    assert.strictEqual(service.isOpened({ resource: otherInput.resource, typeId: otherInput.typeId, editorId: otherInput.editorId }), true);
    await editor2?.group.closeEditor(input);
    assert.strictEqual(part.activeGroup.count, 1);
    assert.strictEqual(service.isOpened(input), false);
    assert.strictEqual(service.isOpened(otherInput), true);
    assert.strictEqual(service.isOpened({ resource: input.resource, typeId: input.typeId, editorId: input.editorId }), false);
    assert.strictEqual(service.isOpened({ resource: otherInput.resource, typeId: otherInput.typeId, editorId: otherInput.editorId }), true);
    await editor1?.group.closeEditor(sideBySideInput);
    assert.strictEqual(service.isOpened(input), false);
    assert.strictEqual(service.isOpened(otherInput), false);
    assert.strictEqual(service.isOpened({ resource: input.resource, typeId: input.typeId, editorId: input.editorId }), false);
    assert.strictEqual(service.isOpened({ resource: otherInput.resource, typeId: otherInput.typeId, editorId: otherInput.editorId }), false);
  });
  test("openEditors() / replaceEditors()", async () => {
    const [part, service] = await createEditorService();
    const input = createTestFileEditorInput(URI.parse("my://resource-openEditors"), TEST_EDITOR_INPUT_ID);
    const otherInput = createTestFileEditorInput(URI.parse("my://resource2-openEditors"), TEST_EDITOR_INPUT_ID);
    const replaceInput = createTestFileEditorInput(URI.parse("my://resource3-openEditors"), TEST_EDITOR_INPUT_ID);
    await service.openEditors([{ editor: input }, { editor: otherInput }]);
    assert.strictEqual(part.activeGroup.count, 2);
    await service.replaceEditors([{ editor: input, replacement: replaceInput }], part.activeGroup);
    assert.strictEqual(part.activeGroup.count, 2);
    assert.strictEqual(part.activeGroup.getIndexOfEditor(replaceInput), 0);
  });
  test("openEditors() handles workspace trust (typed editors)", async () => {
    const [part, service, accessor] = await createEditorService();
    const input1 = createTestFileEditorInput(URI.parse("my://resource1-openEditors"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.parse("my://resource2-openEditors"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.parse("my://resource3-openEditors"), TEST_EDITOR_INPUT_ID);
    const input4 = createTestFileEditorInput(URI.parse("my://resource4-openEditors"), TEST_EDITOR_INPUT_ID);
    const sideBySideInput = new SideBySideEditorInput("side by side", void 0, input3, input4, service);
    const oldHandler = accessor.workspaceTrustRequestService.requestOpenUrisHandler;
    try {
      let trustEditorUris = [];
      accessor.workspaceTrustRequestService.requestOpenUrisHandler = async (uris) => {
        trustEditorUris = uris;
        return WorkspaceTrustUriResponse.Cancel;
      };
      await service.openEditors([{ editor: input1 }, { editor: input2 }, { editor: sideBySideInput }], void 0, { validateTrust: true });
      assert.strictEqual(part.activeGroup.count, 0);
      assert.strictEqual(trustEditorUris.length, 4);
      assert.strictEqual(trustEditorUris.some((uri) => uri.toString() === input1.resource.toString()), true);
      assert.strictEqual(trustEditorUris.some((uri) => uri.toString() === input2.resource.toString()), true);
      assert.strictEqual(trustEditorUris.some((uri) => uri.toString() === input3.resource.toString()), true);
      assert.strictEqual(trustEditorUris.some((uri) => uri.toString() === input4.resource.toString()), true);
      accessor.workspaceTrustRequestService.requestOpenUrisHandler = async (uris) => WorkspaceTrustUriResponse.OpenInNewWindow;
      await service.openEditors([{ editor: input1 }, { editor: input2 }, { editor: sideBySideInput }], void 0, { validateTrust: true });
      assert.strictEqual(part.activeGroup.count, 0);
      accessor.workspaceTrustRequestService.requestOpenUrisHandler = async (uris) => WorkspaceTrustUriResponse.Open;
      await service.openEditors([{ editor: input1 }, { editor: input2 }, { editor: sideBySideInput }], void 0, { validateTrust: true });
      assert.strictEqual(part.activeGroup.count, 3);
    } finally {
      accessor.workspaceTrustRequestService.requestOpenUrisHandler = oldHandler;
    }
  });
  test("openEditors() ignores trust when `validateTrust: false", async () => {
    const [part, service, accessor] = await createEditorService();
    const input1 = createTestFileEditorInput(URI.parse("my://resource1-openEditors"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.parse("my://resource2-openEditors"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.parse("my://resource3-openEditors"), TEST_EDITOR_INPUT_ID);
    const input4 = createTestFileEditorInput(URI.parse("my://resource4-openEditors"), TEST_EDITOR_INPUT_ID);
    const sideBySideInput = new SideBySideEditorInput("side by side", void 0, input3, input4, service);
    const oldHandler = accessor.workspaceTrustRequestService.requestOpenUrisHandler;
    try {
      accessor.workspaceTrustRequestService.requestOpenUrisHandler = async (uris) => WorkspaceTrustUriResponse.Cancel;
      await service.openEditors([{ editor: input1 }, { editor: input2 }, { editor: sideBySideInput }]);
      assert.strictEqual(part.activeGroup.count, 3);
    } finally {
      accessor.workspaceTrustRequestService.requestOpenUrisHandler = oldHandler;
    }
  });
  test("openEditors() extracts proper resources from untyped editors for workspace trust", async () => {
    const [, service, accessor] = await createEditorService();
    const input = { resource: URI.file("resource-openEditors") };
    const otherInput = {
      original: { resource: URI.parse("my://resource2-openEditors") },
      modified: { resource: URI.parse("my://resource3-openEditors") }
    };
    const oldHandler = accessor.workspaceTrustRequestService.requestOpenUrisHandler;
    try {
      let trustEditorUris = [];
      accessor.workspaceTrustRequestService.requestOpenUrisHandler = async (uris) => {
        trustEditorUris = uris;
        return oldHandler(uris);
      };
      await service.openEditors([input, otherInput], void 0, { validateTrust: true });
      assert.strictEqual(trustEditorUris.length, 3);
      assert.strictEqual(trustEditorUris.some((uri) => uri.toString() === input.resource.toString()), true);
      assert.strictEqual(trustEditorUris.some((uri) => uri.toString() === otherInput.original.resource?.toString()), true);
      assert.strictEqual(trustEditorUris.some((uri) => uri.toString() === otherInput.modified.resource?.toString()), true);
    } finally {
      accessor.workspaceTrustRequestService.requestOpenUrisHandler = oldHandler;
    }
  });
  test("close editor does not dispose when editor opened in other group", async () => {
    const [part, service] = await createEditorService();
    const input = createTestFileEditorInput(URI.parse("my://resource-close1"), TEST_EDITOR_INPUT_ID);
    const rootGroup = part.activeGroup;
    const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    await service.openEditor(input, { pinned: true });
    await service.openEditor(input, { pinned: true }, rightGroup);
    const editors = service.editors;
    assert.strictEqual(editors.length, 2);
    assert.strictEqual(editors[0], input);
    assert.strictEqual(editors[1], input);
    await rootGroup.closeEditor(input);
    assert.strictEqual(input.isDisposed(), false);
    await rightGroup.closeEditor(input);
    assert.strictEqual(input.isDisposed(), true);
  });
  test("open to the side", async () => {
    const [part, service] = await createEditorService();
    const input1 = createTestFileEditorInput(URI.parse("my://resource1-openside"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.parse("my://resource2-openside"), TEST_EDITOR_INPUT_ID);
    const rootGroup = part.activeGroup;
    await service.openEditor(input1, { pinned: true }, rootGroup);
    let editor = await service.openEditor(input1, { pinned: true, preserveFocus: true }, SIDE_GROUP);
    assert.strictEqual(part.activeGroup, rootGroup);
    assert.strictEqual(part.count, 2);
    assert.strictEqual(editor?.group, part.groups[1]);
    assert.strictEqual(service.isVisible(input1), true);
    assert.strictEqual(service.isOpened(input1), true);
    editor = await service.openEditor(input2, { pinned: true, preserveFocus: true }, SIDE_GROUP);
    assert.strictEqual(part.activeGroup, rootGroup);
    assert.strictEqual(part.count, 2);
    assert.strictEqual(editor?.group, part.groups[1]);
    assert.strictEqual(service.isVisible(input2), true);
    assert.strictEqual(service.isOpened(input2), true);
  });
  test("editor group activation", async () => {
    const [part, service] = await createEditorService();
    const input1 = createTestFileEditorInput(URI.parse("my://resource1-openside"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.parse("my://resource2-openside"), TEST_EDITOR_INPUT_ID);
    const rootGroup = part.activeGroup;
    await service.openEditor(input1, { pinned: true }, rootGroup);
    let editor = await service.openEditor(input2, { pinned: true, preserveFocus: true, activation: EditorActivation.ACTIVATE }, SIDE_GROUP);
    const sideGroup = editor?.group;
    assert.strictEqual(part.activeGroup, sideGroup);
    editor = await service.openEditor(input1, { pinned: true, preserveFocus: true, activation: EditorActivation.PRESERVE }, rootGroup);
    assert.strictEqual(part.activeGroup, sideGroup);
    editor = await service.openEditor(input1, { pinned: true, preserveFocus: true, activation: EditorActivation.ACTIVATE }, rootGroup);
    assert.strictEqual(part.activeGroup, rootGroup);
    editor = await service.openEditor(input2, { pinned: true, activation: EditorActivation.PRESERVE }, sideGroup);
    assert.strictEqual(part.activeGroup, rootGroup);
    editor = await service.openEditor(input2, { pinned: true, activation: EditorActivation.ACTIVATE }, sideGroup);
    assert.strictEqual(part.activeGroup, sideGroup);
    part.arrangeGroups(GroupsArrangement.EXPAND);
    editor = await service.openEditor(input1, { pinned: true, preserveFocus: true, activation: EditorActivation.RESTORE }, rootGroup);
    assert.strictEqual(part.activeGroup, sideGroup);
  });
  test("inactive editor group does not activate when closing editor (#117686)", async () => {
    const [part, service] = await createEditorService();
    const input1 = createTestFileEditorInput(URI.parse("my://resource1-openside"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.parse("my://resource2-openside"), TEST_EDITOR_INPUT_ID);
    const rootGroup = part.activeGroup;
    await service.openEditor(input1, { pinned: true }, rootGroup);
    await service.openEditor(input2, { pinned: true }, rootGroup);
    const sideGroup = (await service.openEditor(input2, { pinned: true }, SIDE_GROUP))?.group;
    assert.strictEqual(part.activeGroup, sideGroup);
    assert.notStrictEqual(rootGroup, sideGroup);
    part.arrangeGroups(GroupsArrangement.EXPAND, part.activeGroup);
    await rootGroup.closeEditor(input2);
    assert.strictEqual(part.activeGroup, sideGroup);
    assert(!part.isGroupExpanded(rootGroup));
    assert(part.isGroupExpanded(part.activeGroup));
  });
  test("active editor change / visible editor change events", async function() {
    const [part, service] = await createEditorService();
    let input = createTestFileEditorInput(URI.parse("my://resource-active"), TEST_EDITOR_INPUT_ID);
    let otherInput = createTestFileEditorInput(URI.parse("my://resource2-active"), TEST_EDITOR_INPUT_ID);
    let activeEditorChangeEventFired = false;
    const activeEditorChangeListener = service.onDidActiveEditorChange(() => {
      activeEditorChangeEventFired = true;
    });
    let visibleEditorChangeEventFired = false;
    const visibleEditorChangeListener = service.onDidVisibleEditorsChange(() => {
      visibleEditorChangeEventFired = true;
    });
    function assertActiveEditorChangedEvent(expected) {
      assert.strictEqual(activeEditorChangeEventFired, expected, `Unexpected active editor change state (got ${activeEditorChangeEventFired}, expected ${expected})`);
      activeEditorChangeEventFired = false;
    }
    function assertVisibleEditorsChangedEvent(expected) {
      assert.strictEqual(visibleEditorChangeEventFired, expected, `Unexpected visible editors change state (got ${visibleEditorChangeEventFired}, expected ${expected})`);
      visibleEditorChangeEventFired = false;
    }
    async function closeEditorAndWaitForNextToOpen(group2, input2) {
      await group2.closeEditor(input2);
      await timeout(0);
    }
    let editor = await service.openEditor(input, { pinned: true });
    const group = editor?.group;
    assertActiveEditorChangedEvent(true);
    assertVisibleEditorsChangedEvent(true);
    editor = await service.openEditor(input);
    assertActiveEditorChangedEvent(false);
    assertVisibleEditorsChangedEvent(false);
    editor = await service.openEditor(otherInput);
    assertActiveEditorChangedEvent(true);
    assertVisibleEditorsChangedEvent(true);
    await closeEditorAndWaitForNextToOpen(group, otherInput);
    assertActiveEditorChangedEvent(true);
    assertVisibleEditorsChangedEvent(true);
    await closeEditorAndWaitForNextToOpen(group, input);
    assertActiveEditorChangedEvent(true);
    assertVisibleEditorsChangedEvent(true);
    input = createTestFileEditorInput(URI.parse("my://resource-active"), TEST_EDITOR_INPUT_ID);
    otherInput = createTestFileEditorInput(URI.parse("my://resource2-active"), TEST_EDITOR_INPUT_ID);
    editor = await service.openEditor(input);
    assertActiveEditorChangedEvent(true);
    assertVisibleEditorsChangedEvent(true);
    editor = await service.openEditor(input, { forceReload: true });
    assertActiveEditorChangedEvent(false);
    assertVisibleEditorsChangedEvent(false);
    await closeEditorAndWaitForNextToOpen(group, input);
    input = createTestFileEditorInput(URI.parse("my://resource-active"), TEST_EDITOR_INPUT_ID);
    otherInput = createTestFileEditorInput(URI.parse("my://resource2-active"), TEST_EDITOR_INPUT_ID);
    editor = await service.openEditor(input, { pinned: true });
    assertActiveEditorChangedEvent(true);
    assertVisibleEditorsChangedEvent(true);
    editor = await service.openEditor(otherInput, { inactive: true });
    assertActiveEditorChangedEvent(false);
    assertVisibleEditorsChangedEvent(false);
    await group.closeAllEditors();
    assertActiveEditorChangedEvent(true);
    assertVisibleEditorsChangedEvent(true);
    input = createTestFileEditorInput(URI.parse("my://resource-active"), TEST_EDITOR_INPUT_ID);
    otherInput = createTestFileEditorInput(URI.parse("my://resource2-active"), TEST_EDITOR_INPUT_ID);
    editor = await service.openEditor(input, { pinned: true });
    assertActiveEditorChangedEvent(true);
    assertVisibleEditorsChangedEvent(true);
    editor = await service.openEditor(otherInput, { inactive: true });
    assertActiveEditorChangedEvent(false);
    assertVisibleEditorsChangedEvent(false);
    await closeEditorAndWaitForNextToOpen(group, otherInput);
    assertActiveEditorChangedEvent(false);
    assertVisibleEditorsChangedEvent(false);
    await group.closeAllEditors();
    assertActiveEditorChangedEvent(true);
    assertVisibleEditorsChangedEvent(true);
    input = createTestFileEditorInput(URI.parse("my://resource-active"), TEST_EDITOR_INPUT_ID);
    otherInput = createTestFileEditorInput(URI.parse("my://resource2-active"), TEST_EDITOR_INPUT_ID);
    editor = await service.openEditor(input, { pinned: true });
    assertActiveEditorChangedEvent(true);
    assertVisibleEditorsChangedEvent(true);
    let rightGroup = part.addGroup(part.activeGroup, GroupDirection.RIGHT);
    assertActiveEditorChangedEvent(false);
    assertVisibleEditorsChangedEvent(false);
    rightGroup.focus();
    assertActiveEditorChangedEvent(true);
    assertVisibleEditorsChangedEvent(false);
    part.removeGroup(rightGroup);
    assertActiveEditorChangedEvent(true);
    assertVisibleEditorsChangedEvent(false);
    await group.closeAllEditors();
    assertActiveEditorChangedEvent(true);
    assertVisibleEditorsChangedEvent(true);
    input = createTestFileEditorInput(URI.parse("my://resource-active"), TEST_EDITOR_INPUT_ID);
    otherInput = createTestFileEditorInput(URI.parse("my://resource2-active"), TEST_EDITOR_INPUT_ID);
    editor = await service.openEditor(input, { pinned: true });
    assertActiveEditorChangedEvent(true);
    assertVisibleEditorsChangedEvent(true);
    rightGroup = part.addGroup(part.activeGroup, GroupDirection.RIGHT);
    assertActiveEditorChangedEvent(false);
    assertVisibleEditorsChangedEvent(false);
    await rightGroup.openEditor(otherInput);
    assertActiveEditorChangedEvent(true);
    assertVisibleEditorsChangedEvent(true);
    await closeEditorAndWaitForNextToOpen(rightGroup, otherInput);
    assertActiveEditorChangedEvent(true);
    assertVisibleEditorsChangedEvent(true);
    await group.closeAllEditors();
    assertActiveEditorChangedEvent(true);
    assertVisibleEditorsChangedEvent(true);
    input = createTestFileEditorInput(URI.parse("my://resource-active"), TEST_EDITOR_INPUT_ID);
    otherInput = createTestFileEditorInput(URI.parse("my://resource2-active"), TEST_EDITOR_INPUT_ID);
    editor = await service.openEditor(input, { pinned: true });
    assertActiveEditorChangedEvent(true);
    assertVisibleEditorsChangedEvent(true);
    rightGroup = part.addGroup(part.activeGroup, GroupDirection.RIGHT);
    assertActiveEditorChangedEvent(false);
    assertVisibleEditorsChangedEvent(false);
    await rightGroup.openEditor(otherInput);
    assertActiveEditorChangedEvent(true);
    assertVisibleEditorsChangedEvent(true);
    group.focus();
    assertActiveEditorChangedEvent(true);
    assertVisibleEditorsChangedEvent(false);
    await closeEditorAndWaitForNextToOpen(rightGroup, otherInput);
    assertActiveEditorChangedEvent(false);
    assertVisibleEditorsChangedEvent(true);
    await group.closeAllEditors();
    assertActiveEditorChangedEvent(true);
    assertVisibleEditorsChangedEvent(true);
    input = createTestFileEditorInput(URI.parse("my://resource-active"), TEST_EDITOR_INPUT_ID);
    otherInput = createTestFileEditorInput(URI.parse("my://resource2-active"), TEST_EDITOR_INPUT_ID);
    editor = await service.openEditor(input, { pinned: true });
    assertActiveEditorChangedEvent(true);
    assertVisibleEditorsChangedEvent(true);
    editor = await service.openEditor(otherInput, { pinned: true });
    assertActiveEditorChangedEvent(true);
    assertVisibleEditorsChangedEvent(true);
    group.moveEditor(otherInput, group, { index: 0 });
    assertActiveEditorChangedEvent(false);
    assertVisibleEditorsChangedEvent(false);
    await group.closeAllEditors();
    assertActiveEditorChangedEvent(true);
    assertVisibleEditorsChangedEvent(true);
    input = createTestFileEditorInput(URI.parse("my://resource-active"), TEST_EDITOR_INPUT_ID);
    otherInput = createTestFileEditorInput(URI.parse("my://resource2-active"), TEST_EDITOR_INPUT_ID);
    editor = await service.openEditor(input, { pinned: true });
    assertActiveEditorChangedEvent(true);
    assertVisibleEditorsChangedEvent(true);
    rightGroup = part.addGroup(part.activeGroup, GroupDirection.RIGHT);
    assertActiveEditorChangedEvent(false);
    assertVisibleEditorsChangedEvent(false);
    await rightGroup.openEditor(otherInput);
    assertActiveEditorChangedEvent(true);
    assertVisibleEditorsChangedEvent(true);
    await closeEditorAndWaitForNextToOpen(group, input);
    assertActiveEditorChangedEvent(false);
    assertVisibleEditorsChangedEvent(true);
    activeEditorChangeListener.dispose();
    visibleEditorChangeListener.dispose();
  });
  test("editors change event", async function() {
    const [part, service] = await createEditorService();
    const rootGroup = part.activeGroup;
    let input = createTestFileEditorInput(URI.parse("my://resource-active"), TEST_EDITOR_INPUT_ID);
    let otherInput = createTestFileEditorInput(URI.parse("my://resource2-active"), TEST_EDITOR_INPUT_ID);
    let editorsChangeEventCounter = 0;
    async function assertEditorsChangeEvent(fn, expected) {
      const p = Event.toPromise(service.onDidEditorsChange);
      await fn();
      await p;
      editorsChangeEventCounter++;
      assert.strictEqual(editorsChangeEventCounter, expected);
    }
    await assertEditorsChangeEvent(() => service.openEditor(input, { pinned: true }), 1);
    await assertEditorsChangeEvent(() => service.openEditor(otherInput, { pinned: true }), 2);
    await assertEditorsChangeEvent(() => rootGroup.closeEditor(input), 3);
    await assertEditorsChangeEvent(() => rootGroup.closeEditor(otherInput), 4);
    input = createTestFileEditorInput(URI.parse("my://resource-active"), TEST_EDITOR_INPUT_ID);
    otherInput = createTestFileEditorInput(URI.parse("my://resource2-active"), TEST_EDITOR_INPUT_ID);
    await assertEditorsChangeEvent(() => service.openEditors([{ editor: input, options: { pinned: true } }, { editor: otherInput, options: { pinned: true } }]), 5);
    await assertEditorsChangeEvent(() => service.openEditor(otherInput), 6);
    await assertEditorsChangeEvent(() => service.openEditor(input, { pinned: true, index: 1 }), 7);
    const rightGroup = part.addGroup(part.activeGroup, GroupDirection.RIGHT);
    await assertEditorsChangeEvent(async () => rootGroup.moveEditor(input, rightGroup), 8);
    await assertEditorsChangeEvent(async () => part.moveGroup(rightGroup, rootGroup, GroupDirection.LEFT), 9);
  });
  test("two active editor change events when opening editor to the side", async function() {
    const [, service] = await createEditorService();
    const input = createTestFileEditorInput(URI.parse("my://resource-active"), TEST_EDITOR_INPUT_ID);
    let activeEditorChangeEvents = 0;
    const activeEditorChangeListener = service.onDidActiveEditorChange(() => {
      activeEditorChangeEvents++;
    });
    function assertActiveEditorChangedEvent(expected) {
      assert.strictEqual(activeEditorChangeEvents, expected, `Unexpected active editor change state (got ${activeEditorChangeEvents}, expected ${expected})`);
      activeEditorChangeEvents = 0;
    }
    await service.openEditor(input, { pinned: true });
    assertActiveEditorChangedEvent(1);
    await service.openEditor(input, { pinned: true }, SIDE_GROUP);
    assertActiveEditorChangedEvent(2);
    activeEditorChangeListener.dispose();
  });
  test("activeTextEditorControl / activeTextEditorMode", async () => {
    const [, service] = await createEditorService();
    const editor = await service.openEditor({ resource: void 0 });
    assert.strictEqual(service.activeEditorPane, editor);
    assert.strictEqual(service.activeTextEditorControl, editor?.getControl());
    assert.strictEqual(service.activeTextEditorLanguageId, PLAINTEXT_LANGUAGE_ID);
  });
  test("openEditor returns undefined when inactive", async function() {
    const [, service] = await createEditorService();
    const input = createTestFileEditorInput(URI.parse("my://resource-active"), TEST_EDITOR_INPUT_ID);
    const otherInput = createTestFileEditorInput(URI.parse("my://resource2-inactive"), TEST_EDITOR_INPUT_ID);
    const editor = await service.openEditor(input, { pinned: true });
    assert.ok(editor);
    const otherEditor = await service.openEditor(otherInput, { inactive: true });
    assert.ok(!otherEditor);
  });
  test("openEditor shows placeholder when opening fails", async function() {
    const [, service] = await createEditorService();
    const failingInput = createTestFileEditorInput(URI.parse("my://resource-failing"), TEST_EDITOR_INPUT_ID);
    failingInput.setFailToOpen();
    const failingEditor = await service.openEditor(failingInput);
    assert.ok(failingEditor instanceof ErrorPlaceholderEditor);
  });
  test("openEditor shows placeholder when restoring fails", async function() {
    const [, service] = await createEditorService();
    const input = createTestFileEditorInput(URI.parse("my://resource-active"), TEST_EDITOR_INPUT_ID);
    const failingInput = createTestFileEditorInput(URI.parse("my://resource-failing"), TEST_EDITOR_INPUT_ID);
    await service.openEditor(input, { pinned: true });
    await service.openEditor(failingInput, { inactive: true });
    failingInput.setFailToOpen();
    const failingEditor = await service.openEditor(failingInput);
    assert.ok(failingEditor instanceof ErrorPlaceholderEditor);
  });
  test("save, saveAll, revertAll", async function() {
    const [part, service] = await createEditorService();
    const input1 = createTestFileEditorInput(URI.parse("my://resource1"), TEST_EDITOR_INPUT_ID);
    input1.dirty = true;
    const input2 = createTestFileEditorInput(URI.parse("my://resource2"), TEST_EDITOR_INPUT_ID);
    input2.dirty = true;
    const sameInput1 = createTestFileEditorInput(URI.parse("my://resource1"), TEST_EDITOR_INPUT_ID);
    sameInput1.dirty = true;
    const rootGroup = part.activeGroup;
    await service.openEditor(input1, { pinned: true });
    await service.openEditor(input2, { pinned: true });
    await service.openEditor(sameInput1, { pinned: true }, SIDE_GROUP);
    const res1 = await service.save({ groupId: rootGroup.id, editor: input1 });
    assert.strictEqual(res1.success, true);
    assert.strictEqual(res1.editors[0], input1);
    assert.strictEqual(input1.gotSaved, true);
    input1.gotSaved = false;
    input1.gotSavedAs = false;
    input1.gotReverted = false;
    input1.dirty = true;
    input2.dirty = true;
    sameInput1.dirty = true;
    const res2 = await service.save({ groupId: rootGroup.id, editor: input1 }, { saveAs: true });
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.editors[0], input1);
    assert.strictEqual(input1.gotSavedAs, true);
    input1.gotSaved = false;
    input1.gotSavedAs = false;
    input1.gotReverted = false;
    input1.dirty = true;
    input2.dirty = true;
    sameInput1.dirty = true;
    const revertRes = await service.revertAll();
    assert.strictEqual(revertRes, true);
    assert.strictEqual(input1.gotReverted, true);
    input1.gotSaved = false;
    input1.gotSavedAs = false;
    input1.gotReverted = false;
    input1.dirty = true;
    input2.dirty = true;
    sameInput1.dirty = true;
    const res3 = await service.saveAll();
    assert.strictEqual(res3.success, true);
    assert.strictEqual(res3.editors.length, 2);
    assert.strictEqual(input1.gotSaved, true);
    assert.strictEqual(input2.gotSaved, true);
    input1.gotSaved = false;
    input1.gotSavedAs = false;
    input1.gotReverted = false;
    input2.gotSaved = false;
    input2.gotSavedAs = false;
    input2.gotReverted = false;
    input1.dirty = true;
    input2.dirty = true;
    sameInput1.dirty = true;
    await service.saveAll({ saveAs: true });
    assert.strictEqual(input1.gotSavedAs, true);
    assert.strictEqual(input2.gotSavedAs, true);
    assert.strictEqual(sameInput1.gotSaved, false);
    assert.strictEqual(sameInput1.gotSavedAs, false);
    assert.strictEqual(sameInput1.gotReverted, false);
  });
  test("saveAll, revertAll (sticky editor)", async function() {
    const [, service] = await createEditorService();
    const input1 = createTestFileEditorInput(URI.parse("my://resource1"), TEST_EDITOR_INPUT_ID);
    input1.dirty = true;
    const input2 = createTestFileEditorInput(URI.parse("my://resource2"), TEST_EDITOR_INPUT_ID);
    input2.dirty = true;
    const sameInput1 = createTestFileEditorInput(URI.parse("my://resource1"), TEST_EDITOR_INPUT_ID);
    sameInput1.dirty = true;
    await service.openEditor(input1, { pinned: true, sticky: true });
    await service.openEditor(input2, { pinned: true });
    await service.openEditor(sameInput1, { pinned: true }, SIDE_GROUP);
    const revertRes = await service.revertAll({ excludeSticky: true });
    assert.strictEqual(revertRes, true);
    assert.strictEqual(input1.gotReverted, false);
    assert.strictEqual(sameInput1.gotReverted, true);
    input1.gotSaved = false;
    input1.gotSavedAs = false;
    input1.gotReverted = false;
    sameInput1.gotSaved = false;
    sameInput1.gotSavedAs = false;
    sameInput1.gotReverted = false;
    input1.dirty = true;
    input2.dirty = true;
    sameInput1.dirty = true;
    const saveRes = await service.saveAll({ excludeSticky: true });
    assert.strictEqual(saveRes.success, true);
    assert.strictEqual(saveRes.editors.length, 2);
    assert.strictEqual(input1.gotSaved, false);
    assert.strictEqual(input2.gotSaved, true);
    assert.strictEqual(sameInput1.gotSaved, true);
  });
  test("saveAll, revertAll untitled (exclude untitled)", async function() {
    await testSaveRevertUntitled({}, false, false);
    await testSaveRevertUntitled({ includeUntitled: false }, false, false);
  });
  test("saveAll, revertAll untitled (include untitled)", async function() {
    await testSaveRevertUntitled({ includeUntitled: true }, true, false);
    await testSaveRevertUntitled({ includeUntitled: { includeScratchpad: false } }, true, false);
  });
  test("saveAll, revertAll untitled (include scratchpad)", async function() {
    await testSaveRevertUntitled({ includeUntitled: { includeScratchpad: true } }, true, true);
  });
  async function testSaveRevertUntitled(options, expectUntitled, expectScratchpad) {
    const [, service] = await createEditorService();
    const input1 = createTestFileEditorInput(URI.parse("my://resource1"), TEST_EDITOR_INPUT_ID);
    input1.dirty = true;
    const untitledInput = createTestFileEditorInput(URI.parse("my://resource2"), TEST_EDITOR_INPUT_ID);
    untitledInput.dirty = true;
    untitledInput.capabilities = EditorInputCapabilities.Untitled;
    const scratchpadInput = createTestFileEditorInput(URI.parse("my://resource3"), TEST_EDITOR_INPUT_ID);
    scratchpadInput.modified = true;
    scratchpadInput.capabilities = EditorInputCapabilities.Scratchpad | EditorInputCapabilities.Untitled;
    await service.openEditor(input1, { pinned: true, sticky: true });
    await service.openEditor(untitledInput, { pinned: true });
    await service.openEditor(scratchpadInput, { pinned: true });
    const revertRes = await service.revertAll(options);
    assert.strictEqual(revertRes, true);
    assert.strictEqual(input1.gotReverted, true);
    assert.strictEqual(untitledInput.gotReverted, expectUntitled);
    assert.strictEqual(scratchpadInput.gotReverted, expectScratchpad);
    input1.gotSaved = false;
    untitledInput.gotSavedAs = false;
    scratchpadInput.gotReverted = false;
    input1.gotSaved = false;
    untitledInput.gotSavedAs = false;
    scratchpadInput.gotReverted = false;
    input1.dirty = true;
    untitledInput.dirty = true;
    scratchpadInput.modified = true;
    const saveRes = await service.saveAll(options);
    assert.strictEqual(saveRes.success, true);
    assert.strictEqual(saveRes.editors.length, expectScratchpad ? 3 : expectUntitled ? 2 : 1);
    assert.strictEqual(input1.gotSaved, true);
    assert.strictEqual(untitledInput.gotSaved, expectUntitled);
    assert.strictEqual(scratchpadInput.gotSaved, expectScratchpad);
  }
  test("file delete closes editor", async function() {
    return testFileDeleteEditorClose(false);
  });
  test("file delete leaves dirty editors open", function() {
    return testFileDeleteEditorClose(true);
  });
  test("file delete closes editor by preferred resource", async function() {
    const [part, service, accessor] = await createEditorService();
    const resource = URI.parse("my://resource");
    const input = createTestFileEditorInput(URI.parse("test-browser://editor"), TEST_EDITOR_INPUT_ID);
    Object.defineProperty(input, "preferredResource", { value: resource });
    await service.openEditor(input, { pinned: true });
    const activeEditorChangePromise = awaitActiveEditorChange(service);
    accessor.fileService.fireAfterOperation(new FileOperationEvent(resource, FileOperation.DELETE));
    await activeEditorChangePromise;
    assert.strictEqual(part.activeGroup.activeEditor, null);
  });
  async function testFileDeleteEditorClose(dirty) {
    const [part, service, accessor] = await createEditorService();
    const input1 = createTestFileEditorInput(URI.parse("my://resource1"), TEST_EDITOR_INPUT_ID);
    input1.dirty = dirty;
    const input2 = createTestFileEditorInput(URI.parse("my://resource2"), TEST_EDITOR_INPUT_ID);
    input2.dirty = dirty;
    const rootGroup = part.activeGroup;
    await service.openEditor(input1, { pinned: true });
    await service.openEditor(input2, { pinned: true });
    assert.strictEqual(rootGroup.activeEditor, input2);
    const activeEditorChangePromise = awaitActiveEditorChange(service);
    accessor.fileService.fireAfterOperation(new FileOperationEvent(input2.resource, FileOperation.DELETE));
    if (!dirty) {
      await activeEditorChangePromise;
    }
    if (dirty) {
      assert.strictEqual(rootGroup.activeEditor, input2);
    } else {
      assert.strictEqual(rootGroup.activeEditor, input1);
    }
  }
  test("file move asks input to move", async function() {
    const [part, service, accessor] = await createEditorService();
    const input1 = createTestFileEditorInput(URI.parse("my://resource1"), TEST_EDITOR_INPUT_ID);
    const movedInput = createTestFileEditorInput(URI.parse("my://resource2"), TEST_EDITOR_INPUT_ID);
    input1.movedEditor = { editor: movedInput };
    const rootGroup = part.activeGroup;
    await service.openEditor(input1, { pinned: true });
    const activeEditorChangePromise = awaitActiveEditorChange(service);
    accessor.fileService.fireAfterOperation(new FileOperationEvent(input1.resource, FileOperation.MOVE, {
      resource: movedInput.resource,
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
    }));
    await activeEditorChangePromise;
    assert.strictEqual(rootGroup.activeEditor, movedInput);
  });
  test("file move asks input to move by preferred resource", async function() {
    const [part, service, accessor] = await createEditorService();
    const resource = URI.parse("my://resource1");
    const target = URI.parse("my://resource2");
    const input = createTestFileEditorInput(URI.parse("test-browser://editor"), TEST_EDITOR_INPUT_ID);
    Object.defineProperty(input, "preferredResource", { value: resource });
    const movedInput = createTestFileEditorInput(target, TEST_EDITOR_INPUT_ID);
    input.movedEditor = { editor: movedInput };
    await service.openEditor(input, { pinned: true });
    const activeEditorChangePromise = awaitActiveEditorChange(service);
    accessor.fileService.fireAfterOperation(new FileOperationEvent(resource, FileOperation.MOVE, {
      resource: target,
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
    }));
    await activeEditorChangePromise;
    assert.strictEqual(part.activeGroup.activeEditor, movedInput);
  });
  test("file move is only handled by the global editor service", async function() {
    const [part, service, accessor] = await createEditorService();
    const resource = URI.parse("my://resource1");
    const target = URI.parse("my://resource2");
    const movedInput = createTestFileEditorInput(target, TEST_EDITOR_INPUT_ID);
    let renameCalls = 0;
    const input = disposables.add(new class extends TestFileEditorInput {
      async rename() {
        renameCalls++;
        return { editor: movedInput };
      }
    }(resource, TEST_EDITOR_INPUT_ID));
    service.createScoped(part, disposables);
    await service.openEditor(input, { pinned: true });
    const activeEditorChangePromise = awaitActiveEditorChange(service);
    accessor.fileService.fireAfterOperation(new FileOperationEvent(resource, FileOperation.MOVE, {
      resource: target,
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
    }));
    await activeEditorChangePromise;
    assert.deepStrictEqual({
      renameCalls,
      activeEditor: part.activeGroup.activeEditor
    }, {
      renameCalls: 1,
      activeEditor: movedInput
    });
  });
  function awaitActiveEditorChange(editorService) {
    return Event.toPromise(Event.once(editorService.onDidActiveEditorChange));
  }
  test("file watcher gets installed for out of workspace files", async function() {
    const [, service, accessor] = await createEditorService();
    const input1 = createTestFileEditorInput(URI.parse("file://resource1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.parse("file://resource2"), TEST_EDITOR_INPUT_ID);
    await service.openEditor(input1, { pinned: true });
    assert.strictEqual(accessor.fileService.watches.length, 1);
    assert.strictEqual(accessor.fileService.watches[0].toString(), input1.resource.toString());
    const editor = await service.openEditor(input2, { pinned: true });
    assert.strictEqual(accessor.fileService.watches.length, 1);
    assert.strictEqual(accessor.fileService.watches[0].toString(), input2.resource.toString());
    await editor?.group.closeAllEditors();
    assert.strictEqual(accessor.fileService.watches.length, 0);
  });
  test("activeEditorPane scopedContextKeyService", async function() {
    const instantiationService = workbenchInstantiationService({ contextKeyService: (instantiationService2) => instantiationService2.createInstance(MockScopableContextKeyService) }, disposables);
    const [part, service] = await createEditorService(instantiationService);
    const input1 = createTestFileEditorInput(URI.parse("file://resource1"), TEST_EDITOR_INPUT_ID);
    createTestFileEditorInput(URI.parse("file://resource2"), TEST_EDITOR_INPUT_ID);
    await service.openEditor(input1, { pinned: true });
    const editorContextKeyService = service.activeEditorPane?.scopedContextKeyService;
    assert.ok(!!editorContextKeyService);
    assert.strictEqual(editorContextKeyService, part.activeGroup.activeEditorPane?.scopedContextKeyService);
  });
  test("editorResolverService - openEditor", async function() {
    const [, service, accessor] = await createEditorService();
    const editorResolverService = accessor.editorResolverService;
    const textEditorService = accessor.textEditorService;
    let editorCount = 0;
    const registrationDisposable = editorResolverService.registerEditor(
      "*.md",
      {
        id: "TestEditor",
        label: "Test Editor",
        detail: "Test Editor Provider",
        priority: RegisteredEditorPriority.builtin
      },
      {},
      {
        createEditorInput: (editorInput) => {
          editorCount++;
          return { editor: textEditorService.createTextEditor(editorInput) };
        },
        createDiffEditorInput: (diffEditor) => ({ editor: textEditorService.createTextEditor(diffEditor) })
      }
    );
    assert.strictEqual(editorCount, 0);
    const input1 = { resource: URI.parse("file://test/path/resource1.txt") };
    const input2 = { resource: URI.parse("file://test/path/resource1.md") };
    await service.openEditor(input1);
    assert.strictEqual(editorCount, 0);
    await service.openEditor(input2);
    assert.strictEqual(editorCount, 1);
    await service.openEditor({ ...input2, options: { override: "default" } });
    assert.strictEqual(editorCount, 1);
    registrationDisposable.dispose();
  });
  test("editorResolverService - openEditors", async function() {
    const [, service, accessor] = await createEditorService();
    const editorResolverService = accessor.editorResolverService;
    const textEditorService = accessor.textEditorService;
    let editorCount = 0;
    const registrationDisposable = editorResolverService.registerEditor(
      "*.md",
      {
        id: "TestEditor",
        label: "Test Editor",
        detail: "Test Editor Provider",
        priority: RegisteredEditorPriority.builtin
      },
      {},
      {
        createEditorInput: (editorInput) => {
          editorCount++;
          return { editor: textEditorService.createTextEditor(editorInput) };
        },
        createDiffEditorInput: (diffEditor) => ({ editor: textEditorService.createTextEditor(diffEditor) })
      }
    );
    assert.strictEqual(editorCount, 0);
    const input1 = createTestFileEditorInput(URI.parse("file://test/path/resource1.txt"), TEST_EDITOR_INPUT_ID).toUntyped();
    const input2 = createTestFileEditorInput(URI.parse("file://test/path/resource2.txt"), TEST_EDITOR_INPUT_ID).toUntyped();
    const input3 = createTestFileEditorInput(URI.parse("file://test/path/resource3.md"), TEST_EDITOR_INPUT_ID).toUntyped();
    const input4 = createTestFileEditorInput(URI.parse("file://test/path/resource4.md"), TEST_EDITOR_INPUT_ID).toUntyped();
    assert.ok(input1);
    assert.ok(input2);
    assert.ok(input3);
    assert.ok(input4);
    await service.openEditors([input1, input2, input3, input4]);
    assert.strictEqual(editorCount, 2);
    registrationDisposable.dispose();
  });
  test("editorResolverService - replaceEditors", async function() {
    const [part, service, accessor] = await createEditorService();
    const editorResolverService = accessor.editorResolverService;
    const textEditorService = accessor.textEditorService;
    let editorCount = 0;
    const registrationDisposable = editorResolverService.registerEditor(
      "*.md",
      {
        id: "TestEditor",
        label: "Test Editor",
        detail: "Test Editor Provider",
        priority: RegisteredEditorPriority.builtin
      },
      {},
      {
        createEditorInput: (editorInput) => {
          editorCount++;
          return { editor: textEditorService.createTextEditor(editorInput) };
        },
        createDiffEditorInput: (diffEditor) => ({ editor: textEditorService.createTextEditor(diffEditor) })
      }
    );
    assert.strictEqual(editorCount, 0);
    const input1 = createTestFileEditorInput(URI.parse("file://test/path/resource2.md"), TEST_EDITOR_INPUT_ID);
    const untypedInput1 = input1.toUntyped();
    assert.ok(untypedInput1);
    await service.openEditor(input1);
    assert.strictEqual(editorCount, 0);
    await service.replaceEditors([{
      editor: input1,
      replacement: untypedInput1
    }], part.activeGroup);
    assert.strictEqual(editorCount, 1);
    registrationDisposable.dispose();
  });
  test("closeEditor", async () => {
    const [part, service] = await createEditorService();
    const input = createTestFileEditorInput(URI.parse("my://resource-openEditors"), TEST_EDITOR_INPUT_ID);
    const otherInput = createTestFileEditorInput(URI.parse("my://resource2-openEditors"), TEST_EDITOR_INPUT_ID);
    await service.openEditors([{ editor: input }, { editor: otherInput }]);
    assert.strictEqual(part.activeGroup.count, 2);
    await service.closeEditor({ editor: input, groupId: part.activeGroup.id });
    assert.strictEqual(part.activeGroup.count, 1);
    await service.closeEditor({ editor: input, groupId: part.activeGroup.id });
    assert.strictEqual(part.activeGroup.count, 1);
    await service.closeEditor({ editor: otherInput, groupId: part.activeGroup.id });
    assert.strictEqual(part.activeGroup.count, 0);
    await service.closeEditor({ editor: otherInput, groupId: 999 });
    assert.strictEqual(part.activeGroup.count, 0);
  });
  test("closeEditors", async () => {
    const [part, service] = await createEditorService();
    const input = createTestFileEditorInput(URI.parse("my://resource-openEditors"), TEST_EDITOR_INPUT_ID);
    const otherInput = createTestFileEditorInput(URI.parse("my://resource2-openEditors"), TEST_EDITOR_INPUT_ID);
    await service.openEditors([{ editor: input }, { editor: otherInput }]);
    assert.strictEqual(part.activeGroup.count, 2);
    await service.closeEditors([{ editor: input, groupId: part.activeGroup.id }, { editor: otherInput, groupId: part.activeGroup.id }]);
    assert.strictEqual(part.activeGroup.count, 0);
  });
  test("findEditors (in group)", async () => {
    const [part, service] = await createEditorService();
    const input = createTestFileEditorInput(URI.parse("my://resource-openEditors"), TEST_EDITOR_INPUT_ID);
    const otherInput = createTestFileEditorInput(URI.parse("my://resource2-openEditors"), TEST_EDITOR_INPUT_ID);
    await service.openEditors([{ editor: input }, { editor: otherInput }]);
    assert.strictEqual(part.activeGroup.count, 2);
    {
      const found1 = service.findEditors(input.resource, void 0, part.activeGroup);
      assert.strictEqual(found1.length, 1);
      assert.strictEqual(found1[0], input);
      const found2 = service.findEditors(input, void 0, part.activeGroup);
      assert.strictEqual(found2, input);
    }
    {
      const found1 = service.findEditors(otherInput.resource, void 0, part.activeGroup);
      assert.strictEqual(found1.length, 1);
      assert.strictEqual(found1[0], otherInput);
      const found2 = service.findEditors(otherInput, void 0, part.activeGroup);
      assert.strictEqual(found2, otherInput);
    }
    {
      const found1 = service.findEditors(URI.parse("my://no-such-resource"), void 0, part.activeGroup);
      assert.strictEqual(found1.length, 0);
      const found2 = service.findEditors({ resource: URI.parse("my://no-such-resource"), typeId: "", editorId: TEST_EDITOR_INPUT_ID }, void 0, part.activeGroup);
      assert.strictEqual(found2, void 0);
    }
    {
      const newEditor = await service.openEditor(createTestFileEditorInput(URI.parse("my://other-group-resource"), TEST_EDITOR_INPUT_ID), { pinned: true, preserveFocus: true }, SIDE_GROUP);
      const found1 = service.findEditors(input.resource, void 0, newEditor.group.id);
      assert.strictEqual(found1.length, 0);
      const found2 = service.findEditors(input, void 0, newEditor.group.id);
      assert.strictEqual(found2, void 0);
    }
    await part.activeGroup.closeAllEditors();
    {
      const found1 = service.findEditors(input.resource, void 0, part.activeGroup);
      assert.strictEqual(found1.length, 0);
      const found2 = service.findEditors(input, void 0, part.activeGroup);
      assert.strictEqual(found2, void 0);
    }
  });
  test("findEditors (across groups)", async () => {
    const [part, service] = await createEditorService();
    const rootGroup = part.activeGroup;
    const input = createTestFileEditorInput(URI.parse("my://resource-openEditors"), TEST_EDITOR_INPUT_ID);
    const otherInput = createTestFileEditorInput(URI.parse("my://resource2-openEditors"), TEST_EDITOR_INPUT_ID);
    await service.openEditors([{ editor: input }, { editor: otherInput }]);
    const sideEditor = await service.openEditor(input, { pinned: true }, SIDE_GROUP);
    {
      const found1 = service.findEditors(input.resource);
      assert.strictEqual(found1.length, 2);
      assert.strictEqual(found1[0].editor, input);
      assert.strictEqual(found1[0].groupId, sideEditor?.group.id);
      assert.strictEqual(found1[1].editor, input);
      assert.strictEqual(found1[1].groupId, rootGroup.id);
      const found2 = service.findEditors(input);
      assert.strictEqual(found2.length, 2);
      assert.strictEqual(found2[0].editor, input);
      assert.strictEqual(found2[0].groupId, sideEditor?.group.id);
      assert.strictEqual(found2[1].editor, input);
      assert.strictEqual(found2[1].groupId, rootGroup.id);
    }
    {
      const found1 = service.findEditors(otherInput.resource);
      assert.strictEqual(found1.length, 1);
      assert.strictEqual(found1[0].editor, otherInput);
      assert.strictEqual(found1[0].groupId, rootGroup.id);
      const found2 = service.findEditors(otherInput);
      assert.strictEqual(found2.length, 1);
      assert.strictEqual(found2[0].editor, otherInput);
      assert.strictEqual(found2[0].groupId, rootGroup.id);
    }
    {
      const found1 = service.findEditors(URI.parse("my://no-such-resource"));
      assert.strictEqual(found1.length, 0);
      const found2 = service.findEditors({ resource: URI.parse("my://no-such-resource"), typeId: "", editorId: TEST_EDITOR_INPUT_ID });
      assert.strictEqual(found2.length, 0);
    }
    await rootGroup.closeAllEditors();
    await sideEditor?.group.closeAllEditors();
    {
      const found1 = service.findEditors(input.resource);
      assert.strictEqual(found1.length, 0);
      const found2 = service.findEditors(input);
      assert.strictEqual(found2.length, 0);
    }
  });
  test("findEditors (support side by side via options)", async () => {
    const [, service] = await createEditorService();
    const secondaryInput = createTestFileEditorInput(URI.parse("my://resource-findEditors-secondary"), TEST_EDITOR_INPUT_ID);
    const primaryInput = createTestFileEditorInput(URI.parse("my://resource-findEditors-primary"), TEST_EDITOR_INPUT_ID);
    const sideBySideInput = new SideBySideEditorInput(void 0, void 0, secondaryInput, primaryInput, service);
    await service.openEditor(sideBySideInput, { pinned: true });
    let foundEditors = service.findEditors(URI.parse("my://resource-findEditors-primary"));
    assert.strictEqual(foundEditors.length, 0);
    foundEditors = service.findEditors(URI.parse("my://resource-findEditors-primary"), { supportSideBySide: SideBySideEditor.PRIMARY });
    assert.strictEqual(foundEditors.length, 1);
    foundEditors = service.findEditors(URI.parse("my://resource-findEditors-secondary"), { supportSideBySide: SideBySideEditor.PRIMARY });
    assert.strictEqual(foundEditors.length, 0);
    foundEditors = service.findEditors(URI.parse("my://resource-findEditors-primary"), { supportSideBySide: SideBySideEditor.SECONDARY });
    assert.strictEqual(foundEditors.length, 0);
    foundEditors = service.findEditors(URI.parse("my://resource-findEditors-secondary"), { supportSideBySide: SideBySideEditor.SECONDARY });
    assert.strictEqual(foundEditors.length, 1);
    foundEditors = service.findEditors(URI.parse("my://resource-findEditors-primary"), { supportSideBySide: SideBySideEditor.ANY });
    assert.strictEqual(foundEditors.length, 1);
    foundEditors = service.findEditors(URI.parse("my://resource-findEditors-secondary"), { supportSideBySide: SideBySideEditor.ANY });
    assert.strictEqual(foundEditors.length, 1);
  });
  test("side by side editor is not matching all other editors (https://github.com/microsoft/vscode/issues/132859)", async () => {
    const [part, service] = await createEditorService();
    const rootGroup = part.activeGroup;
    const input = createTestFileEditorInput(URI.parse("my://resource-openEditors"), TEST_EDITOR_INPUT_ID);
    const otherInput = createTestFileEditorInput(URI.parse("my://resource2-openEditors"), TEST_EDITOR_INPUT_ID);
    const sideBySideInput = new SideBySideEditorInput(void 0, void 0, input, input, service);
    const otherSideBySideInput = new SideBySideEditorInput(void 0, void 0, otherInput, otherInput, service);
    await service.openEditor(sideBySideInput, void 0, SIDE_GROUP);
    part.activateGroup(rootGroup);
    await service.openEditor(otherSideBySideInput, { revealIfOpened: true, revealIfVisible: true });
    assert.strictEqual(rootGroup.count, 1);
  });
  test("onDidCloseEditor indicates proper context when moving editor across groups", async () => {
    const [part, service] = await createEditorService();
    const rootGroup = part.activeGroup;
    const input1 = createTestFileEditorInput(URI.parse("my://resource-onDidCloseEditor1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.parse("my://resource-onDidCloseEditor2"), TEST_EDITOR_INPUT_ID);
    await service.openEditor(input1, { pinned: true });
    await service.openEditor(input2, { pinned: true });
    const sidegroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    const events = [];
    disposables.add(service.onDidCloseEditor((e) => {
      events.push(e);
    }));
    rootGroup.moveEditor(input1, sidegroup);
    assert.strictEqual(events[0].context, EditorCloseContext.MOVE);
    await sidegroup.closeEditor(input1);
    assert.strictEqual(events[1].context, EditorCloseContext.UNKNOWN);
  });
  test("onDidCloseEditor indicates proper context when replacing an editor", async () => {
    const [part, service] = await createEditorService();
    const rootGroup = part.activeGroup;
    const input1 = createTestFileEditorInput(URI.parse("my://resource-onDidCloseEditor1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.parse("my://resource-onDidCloseEditor2"), TEST_EDITOR_INPUT_ID);
    await service.openEditor(input1, { pinned: true });
    const events = [];
    disposables.add(service.onDidCloseEditor((e) => {
      events.push(e);
    }));
    await rootGroup.replaceEditors([{ editor: input1, replacement: input2 }]);
    assert.strictEqual(events[0].context, EditorCloseContext.REPLACE);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxlZGl0b3JcXHRlc3RcXGJyb3dzZXJcXGVkaXRvclNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEVkaXRvckFjdGl2YXRpb24sIElSZXNvdXJjZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04sIEVkaXRvckNsb3NlQ29udGV4dCwgRWRpdG9yc09yZGVyLCBJRWRpdG9yQ2xvc2VFdmVudCwgRWRpdG9ySW5wdXRXaXRoT3B0aW9ucywgSUVkaXRvclBhbmUsIElSZXNvdXJjZURpZmZFZGl0b3JJbnB1dCwgaXNFZGl0b3JJbnB1dFdpdGhPcHRpb25zLCBJVW50aXRsZWRUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCwgSVVudHlwZWRFZGl0b3JJbnB1dCwgU2lkZUJ5U2lkZUVkaXRvciwgaXNFZGl0b3JJbnB1dCwgRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlLCBUZXN0U2VydmljZUFjY2Vzc29yLCByZWdpc3RlclRlc3RFZGl0b3IsIFRlc3RGaWxlRWRpdG9ySW5wdXQsIElUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UsIHJlZ2lzdGVyVGVzdFJlc291cmNlRWRpdG9yLCByZWdpc3RlclRlc3RTaWRlQnlTaWRlRWRpdG9yLCBjcmVhdGVFZGl0b3JQYXJ0LCByZWdpc3RlclRlc3RGaWxlRWRpdG9yLCBUZXN0VGV4dEZpbGVFZGl0b3IsIFRlc3RGb3JjZVJldmVhbEZpbGVFZGl0b3JJbnB1dCwgd29ya2JlbmNoVGVhcmRvd24gfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IEVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3VwLCBJRWRpdG9yR3JvdXBzU2VydmljZSwgR3JvdXBEaXJlY3Rpb24sIEdyb3Vwc0FycmFuZ2VtZW50IH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFydCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvclBhcnQuanMnO1xuaW1wb3J0IHsgQUNUSVZFX0dST1VQLCBJQmFzZVNhdmVSZXZlcnRBbGxFZGl0b3JPcHRpb25zLCBJRWRpdG9yU2VydmljZSwgUHJlZmVycmVkR3JvdXAsIFNJREVfR1JPVVAgfSBmcm9tICcuLi8uLi9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IEZpbGVFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvZmlsZXMvYnJvd3Nlci9lZGl0b3JzL2ZpbGVFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvbkV2ZW50LCBGaWxlT3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNb2NrU2NvcGFibGVDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvdGVzdC9jb21tb24vbW9ja0tleWJpbmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eSB9IGZyb20gJy4uLy4uL2NvbW1vbi9lZGl0b3JSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgV29ya3NwYWNlVHJ1c3RVcmlSZXNwb25zZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgU2lkZUJ5U2lkZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci9zaWRlQnlTaWRlRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEVycm9yUGxhY2Vob2xkZXJFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JQbGFjZWhvbGRlci5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL21vZGVzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUGFuZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZWRpdG9yUGFuZVNlcnZpY2UuanMnO1xuXG5zdWl0ZSgnRWRpdG9yU2VydmljZScsICgpID0+IHtcblxuXHRjb25zdCBURVNUX0VESVRPUl9JRCA9ICdNeVRlc3RFZGl0b3JGb3JFZGl0b3JTZXJ2aWNlJztcblx0Y29uc3QgVEVTVF9FRElUT1JfSU5QVVRfSUQgPSAndGVzdEVkaXRvcklucHV0Rm9yRWRpdG9yU2VydmljZSc7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0bGV0IHRlc3RMb2NhbEluc3RhbnRpYXRpb25TZXJ2aWNlOiBJVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJUZXN0RWRpdG9yKFRFU1RfRURJVE9SX0lELCBbbmV3IFN5bmNEZXNjcmlwdG9yKFRlc3RGaWxlRWRpdG9ySW5wdXQpLCBuZXcgU3luY0Rlc2NyaXB0b3IoVGVzdEZvcmNlUmV2ZWFsRmlsZUVkaXRvcklucHV0KV0sIFRFU1RfRURJVE9SX0lOUFVUX0lEKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyVGVzdFJlc291cmNlRWRpdG9yKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RlclRlc3RTaWRlQnlTaWRlRWRpdG9yKCkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bihhc3luYyAoKSA9PiB7XG5cdFx0aWYgKHRlc3RMb2NhbEluc3RhbnRpYXRpb25TZXJ2aWNlKSB7XG5cdFx0XHRhd2FpdCB3b3JrYmVuY2hUZWFyZG93bih0ZXN0TG9jYWxJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0XHR0ZXN0TG9jYWxJbnN0YW50aWF0aW9uU2VydmljZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiBjcmVhdGVFZGl0b3JTZXJ2aWNlKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBkaXNwb3NhYmxlcykpOiBQcm9taXNlPFtFZGl0b3JQYXJ0LCBFZGl0b3JTZXJ2aWNlLCBUZXN0U2VydmljZUFjY2Vzc29yXT4ge1xuXHRcdGNvbnN0IHBhcnQgPSBhd2FpdCBjcmVhdGVFZGl0b3JQYXJ0KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRWRpdG9yR3JvdXBzU2VydmljZSwgcGFydCk7XG5cblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVkaXRvclNlcnZpY2UsIHVuZGVmaW5lZCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVkaXRvclNlcnZpY2UsIGVkaXRvclNlcnZpY2UpO1xuXG5cdFx0dGVzdExvY2FsSW5zdGFudGlhdGlvblNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZTtcblxuXHRcdHJldHVybiBbcGFydCwgZWRpdG9yU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFNlcnZpY2VBY2Nlc3NvcildO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChyZXNvdXJjZTogVVJJLCB0eXBlSWQ6IHN0cmluZyk6IFRlc3RGaWxlRWRpdG9ySW5wdXQge1xuXHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RGaWxlRWRpdG9ySW5wdXQocmVzb3VyY2UsIHR5cGVJZCkpO1xuXHR9XG5cblx0dGVzdCgnb3BlbkVkaXRvcigpIC0gYmFzaWNzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFssIHNlcnZpY2UsIGFjY2Vzc29yXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclNlcnZpY2UoKTtcblxuXHRcdGF3YWl0IHRlc3RPcGVuQmFzaWNzKHNlcnZpY2UsIGFjY2Vzc29yLmVkaXRvclBhbmVTZXJ2aWNlKTtcblx0fSk7XG5cblx0dGVzdCgnb3BlbkVkaXRvcigpIC0gYmFzaWNzIChzY29wZWQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0LCBzZXJ2aWNlLCBhY2Nlc3Nvcl0gPSBhd2FpdCBjcmVhdGVFZGl0b3JTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc2NvcGVkID0gc2VydmljZS5jcmVhdGVTY29wZWQocGFydCwgZGlzcG9zYWJsZXMpO1xuXHRcdGF3YWl0IHBhcnQud2hlblJlYWR5O1xuXG5cdFx0YXdhaXQgdGVzdE9wZW5CYXNpY3Moc2NvcGVkLCBhY2Nlc3Nvci5lZGl0b3JQYW5lU2VydmljZSk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RPcGVuQmFzaWNzKGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLCBlZGl0b3JQYW5lU2VydmljZTogSUVkaXRvclBhbmVTZXJ2aWNlKSB7XG5cdFx0bGV0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UtYmFzaWNzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRsZXQgb3RoZXJJbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlMi1iYXNpY3MnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0bGV0IGFjdGl2ZUVkaXRvckNoYW5nZUV2ZW50Q291bnRlciA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGVkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0YWN0aXZlRWRpdG9yQ2hhbmdlRXZlbnRDb3VudGVyKys7XG5cdFx0fSkpO1xuXG5cdFx0bGV0IHZpc2libGVFZGl0b3JDaGFuZ2VFdmVudENvdW50ZXIgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3JTZXJ2aWNlLm9uRGlkVmlzaWJsZUVkaXRvcnNDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dmlzaWJsZUVkaXRvckNoYW5nZUV2ZW50Q291bnRlcisrO1xuXHRcdH0pKTtcblxuXHRcdGxldCB3aWxsT3BlbkVkaXRvckxpc3RlbmVyQ291bnRlciA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGVkaXRvclNlcnZpY2Uub25XaWxsT3BlbkVkaXRvcigoKSA9PiB7XG5cdFx0XHR3aWxsT3BlbkVkaXRvckxpc3RlbmVyQ291bnRlcisrO1xuXHRcdH0pKTtcblxuXHRcdGxldCBkaWRDbG9zZUVkaXRvckxpc3RlbmVyQ291bnRlciA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGVkaXRvclNlcnZpY2Uub25EaWRDbG9zZUVkaXRvcigoKSA9PiB7XG5cdFx0XHRkaWRDbG9zZUVkaXRvckxpc3RlbmVyQ291bnRlcisrO1xuXHRcdH0pKTtcblxuXHRcdGxldCB3aWxsSW5zdGFudGlhdGVFZGl0b3JQYW5lTGlzdGVuZXJDb3VudGVyID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZWRpdG9yUGFuZVNlcnZpY2Uub25XaWxsSW5zdGFudGlhdGVFZGl0b3JQYW5lKGUgPT4ge1xuXHRcdFx0aWYgKGUudHlwZUlkID09PSBURVNUX0VESVRPUl9JRCkge1xuXHRcdFx0XHR3aWxsSW5zdGFudGlhdGVFZGl0b3JQYW5lTGlzdGVuZXJDb3VudGVyKys7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gT3BlbiBpbnB1dFxuXHRcdGxldCBlZGl0b3IgPSBhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQsIHsgcGlubmVkOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvcj8uZ2V0SWQoKSwgVEVTVF9FRElUT1JfSUQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IsIGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDEsIGVkaXRvclNlcnZpY2UuY291bnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dCwgZWRpdG9yU2VydmljZS5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSlbMF0uZWRpdG9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXQsIGVkaXRvclNlcnZpY2UuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTClbMF0uZWRpdG9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXQsIGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yU2VydmljZS52aXNpYmxlRWRpdG9yUGFuZXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yU2VydmljZS52aXNpYmxlRWRpdG9yUGFuZXNbMF0sIGVkaXRvcik7XG5cdFx0YXNzZXJ0Lm9rKCFlZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sKTtcblx0XHRhc3NlcnQub2soIWVkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckxhbmd1YWdlSWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JTZXJ2aWNlLnZpc2libGVUZXh0RWRpdG9yQ29udHJvbHMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yU2VydmljZS5nZXRWaXNpYmxlVGV4dEVkaXRvckNvbnRyb2xzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yU2VydmljZS5pc09wZW5lZChpbnB1dCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JTZXJ2aWNlLmlzT3BlbmVkKHsgcmVzb3VyY2U6IGlucHV0LnJlc291cmNlLCB0eXBlSWQ6IGlucHV0LnR5cGVJZCwgZWRpdG9ySWQ6IGlucHV0LmVkaXRvcklkIH0pLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yU2VydmljZS5pc09wZW5lZCh7IHJlc291cmNlOiBpbnB1dC5yZXNvdXJjZSwgdHlwZUlkOiBpbnB1dC50eXBlSWQsIGVkaXRvcklkOiAndW5rbm93blR5cGVJZCcgfSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yU2VydmljZS5pc09wZW5lZCh7IHJlc291cmNlOiBpbnB1dC5yZXNvdXJjZSwgdHlwZUlkOiAndW5rbm93blR5cGVJZCcsIGVkaXRvcklkOiBpbnB1dC5lZGl0b3JJZCB9KSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JTZXJ2aWNlLmlzT3BlbmVkKHsgcmVzb3VyY2U6IGlucHV0LnJlc291cmNlLCB0eXBlSWQ6ICd1bmtub3duVHlwZUlkJywgZWRpdG9ySWQ6ICd1bmtub3duVHlwZUlkJyB9KSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JTZXJ2aWNlLmlzVmlzaWJsZShpbnB1dCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JTZXJ2aWNlLmlzVmlzaWJsZShvdGhlcklucHV0KSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWxsT3BlbkVkaXRvckxpc3RlbmVyQ291bnRlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGl2ZUVkaXRvckNoYW5nZUV2ZW50Q291bnRlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpc2libGVFZGl0b3JDaGFuZ2VFdmVudENvdW50ZXIsIDEpO1xuXHRcdGFzc2VydC5vayhlZGl0b3JQYW5lU2VydmljZS5kaWRJbnN0YW50aWF0ZUVkaXRvclBhbmUoVEVTVF9FRElUT1JfSUQpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lsbEluc3RhbnRpYXRlRWRpdG9yUGFuZUxpc3RlbmVyQ291bnRlciwgMSk7XG5cblx0XHQvLyBDbG9zZSBpbnB1dFxuXHRcdGF3YWl0IGVkaXRvcj8uZ3JvdXAuY2xvc2VFZGl0b3IoaW5wdXQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDAsIGVkaXRvclNlcnZpY2UuY291bnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgwLCBlZGl0b3JTZXJ2aWNlLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKS5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgwLCBlZGl0b3JTZXJ2aWNlLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZENsb3NlRWRpdG9yTGlzdGVuZXJDb3VudGVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlRWRpdG9yQ2hhbmdlRXZlbnRDb3VudGVyLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlzaWJsZUVkaXRvckNoYW5nZUV2ZW50Q291bnRlciwgMik7XG5cdFx0YXNzZXJ0Lm9rKGlucHV0LmdvdERpc3Bvc2VkKTtcblxuXHRcdC8vIE9wZW4gYWdhaW4gMiBpbnB1dHMgKGRpc3Bvc2VkIGVkaXRvcnMgYXJlIGlnbm9yZWQhKVxuXHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDAsIGVkaXRvclNlcnZpY2UuY291bnQpO1xuXG5cdFx0Ly8gT3BlbiBhZ2FpbiAyIGlucHV0cyAocmVjcmVhdGUgYmVjYXVzZSBkaXNwb3NlZClcblx0XHRpbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlLWJhc2ljcycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0b3RoZXJJbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlMi1iYXNpY3MnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKGlucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRlZGl0b3IgPSBhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Iob3RoZXJJbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoMiwgZWRpdG9yU2VydmljZS5jb3VudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG90aGVySW5wdXQsIGVkaXRvclNlcnZpY2UuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpWzBdLmVkaXRvcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlucHV0LCBlZGl0b3JTZXJ2aWNlLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKVsxXS5lZGl0b3IpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dCwgZWRpdG9yU2VydmljZS5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKVswXS5lZGl0b3IpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdGhlcklucHV0LCBlZGl0b3JTZXJ2aWNlLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpWzFdLmVkaXRvcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvclNlcnZpY2UudmlzaWJsZUVkaXRvclBhbmVzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvclNlcnZpY2UuaXNPcGVuZWQoaW5wdXQpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yU2VydmljZS5pc09wZW5lZCh7IHJlc291cmNlOiBpbnB1dC5yZXNvdXJjZSwgdHlwZUlkOiBpbnB1dC50eXBlSWQsIGVkaXRvcklkOiBpbnB1dC5lZGl0b3JJZCB9KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvclNlcnZpY2UuaXNPcGVuZWQob3RoZXJJbnB1dCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JTZXJ2aWNlLmlzT3BlbmVkKHsgcmVzb3VyY2U6IG90aGVySW5wdXQucmVzb3VyY2UsIHR5cGVJZDogb3RoZXJJbnB1dC50eXBlSWQsIGVkaXRvcklkOiBvdGhlcklucHV0LmVkaXRvcklkIH0pLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3RpdmVFZGl0b3JDaGFuZ2VFdmVudENvdW50ZXIsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWxsT3BlbkVkaXRvckxpc3RlbmVyQ291bnRlciwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpc2libGVFZGl0b3JDaGFuZ2VFdmVudENvdW50ZXIsIDQpO1xuXG5cdFx0Y29uc3Qgc3RpY2t5SW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZTMtYmFzaWNzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioc3RpY2t5SW5wdXQsIHsgc3RpY2t5OiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDMsIGVkaXRvclNlcnZpY2UuY291bnQpO1xuXG5cdFx0Y29uc3QgYWxsU2VxdWVudGlhbEVkaXRvcnMgPSBlZGl0b3JTZXJ2aWNlLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhbGxTZXF1ZW50aWFsRWRpdG9ycy5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGlja3lJbnB1dCwgYWxsU2VxdWVudGlhbEVkaXRvcnNbMF0uZWRpdG9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXQsIGFsbFNlcXVlbnRpYWxFZGl0b3JzWzFdLmVkaXRvcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG90aGVySW5wdXQsIGFsbFNlcXVlbnRpYWxFZGl0b3JzWzJdLmVkaXRvcik7XG5cblx0XHRjb25zdCBzZXF1ZW50aWFsRWRpdG9yc0V4Y2x1ZGluZ1N0aWNreSA9IGVkaXRvclNlcnZpY2UuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCwgeyBleGNsdWRlU3RpY2t5OiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXF1ZW50aWFsRWRpdG9yc0V4Y2x1ZGluZ1N0aWNreS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dCwgc2VxdWVudGlhbEVkaXRvcnNFeGNsdWRpbmdTdGlja3lbMF0uZWRpdG9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3RoZXJJbnB1dCwgc2VxdWVudGlhbEVkaXRvcnNFeGNsdWRpbmdTdGlja3lbMV0uZWRpdG9yKTtcblxuXHRcdGNvbnN0IG1ydUVkaXRvcnNFeGNsdWRpbmdTdGlja3kgPSBlZGl0b3JTZXJ2aWNlLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFLCB7IGV4Y2x1ZGVTdGlja3k6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ydUVkaXRvcnNFeGNsdWRpbmdTdGlja3kubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXQsIHNlcXVlbnRpYWxFZGl0b3JzRXhjbHVkaW5nU3RpY2t5WzBdLmVkaXRvcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG90aGVySW5wdXQsIHNlcXVlbnRpYWxFZGl0b3JzRXhjbHVkaW5nU3RpY2t5WzFdLmVkaXRvcik7XG5cdH1cblxuXHR0ZXN0KCdvcGVuRWRpdG9yKCkgLSBtdWx0aXBsZSBjYWxscyBhcmUgY2FuY2VsbGVkIGFuZCBpbmRpY2F0ZWQgYXMgc3VjaCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbLCBzZXJ2aWNlXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclNlcnZpY2UoKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UtYmFzaWNzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBvdGhlcklucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UyLWJhc2ljcycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRsZXQgYWN0aXZlRWRpdG9yQ2hhbmdlRXZlbnRDb3VudGVyID0gMDtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3JDaGFuZ2VMaXN0ZW5lciA9IHNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0YWN0aXZlRWRpdG9yQ2hhbmdlRXZlbnRDb3VudGVyKys7XG5cdFx0fSk7XG5cblx0XHRsZXQgdmlzaWJsZUVkaXRvckNoYW5nZUV2ZW50Q291bnRlciA9IDA7XG5cdFx0Y29uc3QgdmlzaWJsZUVkaXRvckNoYW5nZUxpc3RlbmVyID0gc2VydmljZS5vbkRpZFZpc2libGVFZGl0b3JzQ2hhbmdlKCgpID0+IHtcblx0XHRcdHZpc2libGVFZGl0b3JDaGFuZ2VFdmVudENvdW50ZXIrKztcblx0XHR9KTtcblxuXHRcdGNvbnN0IGVkaXRvclAxID0gc2VydmljZS5vcGVuRWRpdG9yKGlucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRjb25zdCBlZGl0b3JQMiA9IHNlcnZpY2Uub3BlbkVkaXRvcihvdGhlcklucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblxuXHRcdGNvbnN0IGVkaXRvcjEgPSBhd2FpdCBlZGl0b3JQMTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yMSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IGVkaXRvcjIgPSBhd2FpdCBlZGl0b3JQMjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yMj8uaW5wdXQsIG90aGVySW5wdXQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGl2ZUVkaXRvckNoYW5nZUV2ZW50Q291bnRlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpc2libGVFZGl0b3JDaGFuZ2VFdmVudENvdW50ZXIsIDEpO1xuXG5cdFx0YWN0aXZlRWRpdG9yQ2hhbmdlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdHZpc2libGVFZGl0b3JDaGFuZ2VMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29wZW5FZGl0b3IoKSAtIHNhbWUgaW5wdXQgZG9lcyBub3QgY2FuY2VsIHByZXZpb3VzIG9uZSAtIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMzY2ODQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgWywgc2VydmljZV0gPSBhd2FpdCBjcmVhdGVFZGl0b3JTZXJ2aWNlKCk7XG5cblx0XHRsZXQgaW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZS1iYXNpY3MnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0bGV0IGVkaXRvclAxID0gc2VydmljZS5vcGVuRWRpdG9yKGlucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRsZXQgZWRpdG9yUDIgPSBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQsIHsgcGlubmVkOiB0cnVlIH0pO1xuXG5cdFx0bGV0IGVkaXRvcjEgPSBhd2FpdCBlZGl0b3JQMTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yMT8uaW5wdXQsIGlucHV0KTtcblxuXHRcdGxldCBlZGl0b3IyID0gYXdhaXQgZWRpdG9yUDI7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvcjI/LmlucHV0LCBpbnB1dCk7XG5cblx0XHRhc3NlcnQub2soZWRpdG9yMi5ncm91cCk7XG5cdFx0YXdhaXQgZWRpdG9yMi5ncm91cC5jbG9zZUFsbEVkaXRvcnMoKTtcblxuXHRcdGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UtYmFzaWNzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dFNhbWUgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZS1iYXNpY3MnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0ZWRpdG9yUDEgPSBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGVkaXRvclAyID0gc2VydmljZS5vcGVuRWRpdG9yKGlucHV0U2FtZSwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cblx0XHRlZGl0b3IxID0gYXdhaXQgZWRpdG9yUDE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvcjE/LmlucHV0LCBpbnB1dCk7XG5cblx0XHRlZGl0b3IyID0gYXdhaXQgZWRpdG9yUDI7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvcjI/LmlucHV0LCBpbnB1dCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29wZW5FZGl0b3IoKSAtIGZvcmNlLXJldmVhbCB0eXBlZCBlZGl0b3JzIHJldmVhbCBpbnN0ZWFkIG9mIHNwbGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0LCBzZXJ2aWNlXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclNlcnZpY2UoKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEZvcmNlUmV2ZWFsRmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZS1iYXNpY3MxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKSk7XG5cdFx0Y29uc3QgaW5wdXQyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0Rm9yY2VSZXZlYWxGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlLWJhc2ljczInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpKTtcblxuXHRcdGNvbnN0IGlucHV0MUdyb3VwID0gKGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dDEsIHsgcGlubmVkOiB0cnVlIH0pKT8uZ3JvdXA7XG5cdFx0Y29uc3QgaW5wdXQyR3JvdXAgPSAoYXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUgfSwgU0lERV9HUk9VUCkpPy5ncm91cDtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLCBpbnB1dDJHcm91cCk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLCBpbnB1dDFHcm91cCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29wZW5FZGl0b3IoKSAtIGxvY2tlZCBncm91cHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyVGVzdEZpbGVFZGl0b3IoKSk7XG5cblx0XHRjb25zdCBbcGFydCwgc2VydmljZSwgYWNjZXNzb3JdID0gYXdhaXQgY3JlYXRlRWRpdG9yU2VydmljZSgpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjY2Vzc29yLmVkaXRvclJlc29sdmVyU2VydmljZS5yZWdpc3RlckVkaXRvcihcblx0XHRcdCcqLmVkaXRvci1zZXJ2aWNlLWxvY2tlZC1ncm91cC10ZXN0cycsXG5cdFx0XHR7IGlkOiBURVNUX0VESVRPUl9JTlBVVF9JRCwgbGFiZWw6ICdMYWJlbCcsIHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZXhjbHVzaXZlIH0sXG5cdFx0XHR7fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6IGVkaXRvciA9PiAoeyBlZGl0b3I6IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoZWRpdG9yLnJlc291cmNlLCBURVNUX0VESVRPUl9JTlBVVF9JRCkgfSlcblx0XHRcdH1cblx0XHQpKTtcblxuXHRcdGNvbnN0IGlucHV0MTogSVJlc291cmNlRWRpdG9ySW5wdXQgPSB7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly9yZXNvdXJjZS1iYXNpY3MuZWRpdG9yLXNlcnZpY2UtbG9ja2VkLWdyb3VwLXRlc3RzJyksIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfTtcblx0XHRjb25zdCBpbnB1dDI6IElSZXNvdXJjZUVkaXRvcklucHV0ID0geyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vcmVzb3VyY2UyLWJhc2ljcy5lZGl0b3Itc2VydmljZS1sb2NrZWQtZ3JvdXAtdGVzdHMnKSwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9O1xuXHRcdGNvbnN0IGlucHV0MzogSVJlc291cmNlRWRpdG9ySW5wdXQgPSB7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly9yZXNvdXJjZTMtYmFzaWNzLmVkaXRvci1zZXJ2aWNlLWxvY2tlZC1ncm91cC10ZXN0cycpLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH07XG5cdFx0Y29uc3QgaW5wdXQ0OiBJUmVzb3VyY2VFZGl0b3JJbnB1dCA9IHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovL3Jlc291cmNlNC1iYXNpY3MuZWRpdG9yLXNlcnZpY2UtbG9ja2VkLWdyb3VwLXRlc3RzJyksIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfTtcblx0XHRjb25zdCBpbnB1dDU6IElSZXNvdXJjZUVkaXRvcklucHV0ID0geyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vcmVzb3VyY2U1LWJhc2ljcy5lZGl0b3Itc2VydmljZS1sb2NrZWQtZ3JvdXAtdGVzdHMnKSwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9O1xuXHRcdGNvbnN0IGlucHV0NjogSVJlc291cmNlRWRpdG9ySW5wdXQgPSB7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly9yZXNvdXJjZTYtYmFzaWNzLmVkaXRvci1zZXJ2aWNlLWxvY2tlZC1ncm91cC10ZXN0cycpLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH07XG5cdFx0Y29uc3QgaW5wdXQ3OiBJUmVzb3VyY2VFZGl0b3JJbnB1dCA9IHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovL3Jlc291cmNlNy1iYXNpY3MuZWRpdG9yLXNlcnZpY2UtbG9ja2VkLWdyb3VwLXRlc3RzJyksIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfTtcblxuXHRcdGNvbnN0IGVkaXRvcjEgPSBhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRjb25zdCBlZGl0b3IyID0gYXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUgfSwgU0lERV9HUk9VUCk7XG5cblx0XHRjb25zdCBncm91cDEgPSBlZGl0b3IxPy5ncm91cDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAxPy5jb3VudCwgMSk7XG5cblx0XHRjb25zdCBncm91cDIgPSBlZGl0b3IyPy5ncm91cDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAyPy5jb3VudCwgMSk7XG5cblx0XHRncm91cDIubG9jayh0cnVlKTtcblx0XHRwYXJ0LmFjdGl2YXRlR3JvdXAoZ3JvdXAyLmlkKTtcblxuXHRcdC8vIFdpbGwgb3BlbiBpbiBncm91cCAxIGJlY2F1c2UgZ3JvdXAgMiBpcyBsb2NrZWRcblx0XHRhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQzLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDEuY291bnQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDEuYWN0aXZlRWRpdG9yPy5yZXNvdXJjZT8udG9TdHJpbmcoKSwgaW5wdXQzLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDIuY291bnQsIDEpO1xuXG5cdFx0Ly8gV2lsbCBvcGVuIGluIGdyb3VwIDIgYmVjYXVzZSBncm91cCB3YXMgcHJvdmlkZWRcblx0XHRhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQzLCB7IHBpbm5lZDogdHJ1ZSB9LCBncm91cDIuaWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMS5jb3VudCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMi5jb3VudCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMi5hY3RpdmVFZGl0b3I/LnJlc291cmNlPy50b1N0cmluZygpLCBpbnB1dDMucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0XHQvLyBXaWxsIHJldmVhbCBlZGl0b3IgaW4gZ3JvdXAgMiBiZWNhdXNlIGl0IGlzIGNvbnRhaW5lZFxuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dDIsIHsgcGlubmVkOiB0cnVlIH0sIGdyb3VwMik7XG5cdFx0YXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUgfSwgQUNUSVZFX0dST1VQKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDEuY291bnQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDIuY291bnQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDIuYWN0aXZlRWRpdG9yPy5yZXNvdXJjZT8udG9TdHJpbmcoKSwgaW5wdXQyLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXG5cdFx0Ly8gV2lsbCBvcGVuIGEgbmV3IGdyb3VwIGJlY2F1c2Ugc2lkZSBncm91cCBpcyBsb2NrZWRcblx0XHRwYXJ0LmFjdGl2YXRlR3JvdXAoZ3JvdXAxLmlkKTtcblx0XHRjb25zdCBlZGl0b3IzID0gYXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGlucHV0NCwgeyBwaW5uZWQ6IHRydWUgfSwgU0lERV9HUk9VUCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY291bnQsIDMpO1xuXG5cdFx0Y29uc3QgZ3JvdXAzID0gZWRpdG9yMz8uZ3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMz8uY291bnQsIDEpO1xuXG5cdFx0Ly8gV2lsbCByZXZlYWwgZWRpdG9yIGluIGdyb3VwIDIgYmVjYXVzZSBpdCBpcyBjb250YWluZWRcblx0XHRhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQzLCB7IHBpbm5lZDogdHJ1ZSB9LCBncm91cDIpO1xuXHRcdHBhcnQuYWN0aXZhdGVHcm91cChncm91cDEuaWQpO1xuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dDMsIHsgcGlubmVkOiB0cnVlIH0sIFNJREVfR1JPVVApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmNvdW50LCAzKTtcblxuXHRcdC8vIFdpbGwgb3BlbiBhIG5ldyBncm91cCBpZiBhbGwgZ3JvdXBzIGFyZSBsb2NrZWRcblx0XHRncm91cDEubG9jayh0cnVlKTtcblx0XHRncm91cDIubG9jayh0cnVlKTtcblx0XHRncm91cDMubG9jayh0cnVlKTtcblxuXHRcdHBhcnQuYWN0aXZhdGVHcm91cChncm91cDEuaWQpO1xuXHRcdGNvbnN0IGVkaXRvcjUgPSBhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQ1LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRjb25zdCBncm91cDQgPSBlZGl0b3I1Py5ncm91cDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXA0Py5jb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwNC5hY3RpdmVFZGl0b3I/LnJlc291cmNlPy50b1N0cmluZygpLCBpbnB1dDUucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY291bnQsIDQpO1xuXG5cdFx0Ly8gV2lsbCBvcGVuIGVkaXRvciBpbiBtb3N0IHJlY2VudGx5IG5vbi1sb2NrZWQgZ3JvdXBcblx0XHRncm91cDEubG9jayhmYWxzZSk7XG5cdFx0Z3JvdXAyLmxvY2soZmFsc2UpO1xuXHRcdGdyb3VwMy5sb2NrKGZhbHNlKTtcblx0XHRncm91cDQubG9jayhmYWxzZSk7XG5cblx0XHRwYXJ0LmFjdGl2YXRlR3JvdXAoZ3JvdXAzLmlkKTtcblx0XHRwYXJ0LmFjdGl2YXRlR3JvdXAoZ3JvdXAyLmlkKTtcblx0XHRwYXJ0LmFjdGl2YXRlR3JvdXAoZ3JvdXA0LmlkKTtcblx0XHRncm91cDQubG9jayh0cnVlKTtcblx0XHRncm91cDIubG9jayh0cnVlKTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dDYsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmNvdW50LCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5hY3RpdmVHcm91cCwgZ3JvdXAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAzLmFjdGl2ZUVkaXRvcj8ucmVzb3VyY2U/LnRvU3RyaW5nKCksIGlucHV0Ni5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdC8vIFdpbGwgZmluZCB0aGUgcmlnaHQgZ3JvdXAgd2hlcmUgZWRpdG9yIGlzIGFscmVhZHkgb3BlbmVkIGluIHdoZW4gYWxsIGdyb3VwcyBhcmUgbG9ja2VkXG5cdFx0Z3JvdXAxLmxvY2sodHJ1ZSk7XG5cdFx0Z3JvdXAyLmxvY2sodHJ1ZSk7XG5cdFx0Z3JvdXAzLmxvY2sodHJ1ZSk7XG5cdFx0Z3JvdXA0LmxvY2sodHJ1ZSk7XG5cblx0XHRwYXJ0LmFjdGl2YXRlR3JvdXAoZ3JvdXAxLmlkKTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dDYsIHsgcGlubmVkOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY291bnQsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLCBncm91cDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDMuYWN0aXZlRWRpdG9yPy5yZXNvdXJjZT8udG9TdHJpbmcoKSwgaW5wdXQ2LnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuYWN0aXZlR3JvdXAsIGdyb3VwMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMy5hY3RpdmVFZGl0b3I/LnJlc291cmNlPy50b1N0cmluZygpLCBpbnB1dDYucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0XHRwYXJ0LmFjdGl2YXRlR3JvdXAoZ3JvdXAxLmlkKTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dDYsIHsgcGlubmVkOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY291bnQsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLCBncm91cDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDMuYWN0aXZlRWRpdG9yPy5yZXNvdXJjZT8udG9TdHJpbmcoKSwgaW5wdXQ2LnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXG5cdFx0Ly8gV2lsbCByZXZlYWwgYW4gb3BlbmVkIGVkaXRvciBpbiB0aGUgYWN0aXZlIGxvY2tlZCBncm91cFxuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dDcsIHsgcGlubmVkOiB0cnVlIH0sIGdyb3VwMyk7XG5cdFx0YXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGlucHV0NiwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5jb3VudCwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuYWN0aXZlR3JvdXAsIGdyb3VwMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMy5hY3RpdmVFZGl0b3I/LnJlc291cmNlPy50b1N0cmluZygpLCBpbnB1dDYucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvY2tlZCBncm91cHMgLSB3b3JrYmVuY2guZWRpdG9yLnJldmVhbElmT3BlbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCd3b3JrYmVuY2gnLCB7ICdlZGl0b3InOiB7ICdyZXZlYWxJZk9wZW4nOiB0cnVlIH0gfSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RlclRlc3RGaWxlRWRpdG9yKCkpO1xuXG5cdFx0Y29uc3QgW3BhcnQsIHNlcnZpY2UsIGFjY2Vzc29yXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclNlcnZpY2UoaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjY2Vzc29yLmVkaXRvclJlc29sdmVyU2VydmljZS5yZWdpc3RlckVkaXRvcihcblx0XHRcdCcqLmVkaXRvci1zZXJ2aWNlLWxvY2tlZC1ncm91cC10ZXN0cycsXG5cdFx0XHR7IGlkOiBURVNUX0VESVRPUl9JTlBVVF9JRCwgbGFiZWw6ICdMYWJlbCcsIHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZXhjbHVzaXZlIH0sXG5cdFx0XHR7fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6IGVkaXRvciA9PiAoeyBlZGl0b3I6IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoZWRpdG9yLnJlc291cmNlLCBURVNUX0VESVRPUl9JTlBVVF9JRCkgfSlcblx0XHRcdH1cblx0XHQpKTtcblxuXHRcdGNvbnN0IHJvb3RHcm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0Y29uc3QgcmlnaHRHcm91cCA9IHBhcnQuYWRkR3JvdXAocm9vdEdyb3VwLCBHcm91cERpcmVjdGlvbi5SSUdIVCk7XG5cblx0XHRwYXJ0LmFjdGl2YXRlR3JvdXAocm9vdEdyb3VwKTtcblxuXHRcdGNvbnN0IGlucHV0MTogSVJlc291cmNlRWRpdG9ySW5wdXQgPSB7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly9yZXNvdXJjZS1iYXNpY3MuZWRpdG9yLXNlcnZpY2UtbG9ja2VkLWdyb3VwLXRlc3RzJyksIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfTtcblx0XHRjb25zdCBpbnB1dDI6IElSZXNvdXJjZUVkaXRvcklucHV0ID0geyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vcmVzb3VyY2UyLWJhc2ljcy5lZGl0b3Itc2VydmljZS1sb2NrZWQtZ3JvdXAtdGVzdHMnKSwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9O1xuXHRcdGNvbnN0IGlucHV0MzogSVJlc291cmNlRWRpdG9ySW5wdXQgPSB7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly9yZXNvdXJjZTMtYmFzaWNzLmVkaXRvci1zZXJ2aWNlLWxvY2tlZC1ncm91cC10ZXN0cycpLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH07XG5cdFx0Y29uc3QgaW5wdXQ0OiBJUmVzb3VyY2VFZGl0b3JJbnB1dCA9IHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovL3Jlc291cmNlNC1iYXNpY3MuZWRpdG9yLXNlcnZpY2UtbG9ja2VkLWdyb3VwLXRlc3RzJyksIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dDEsIHJvb3RHcm91cC5pZCk7XG5cdFx0YXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGlucHV0Miwgcm9vdEdyb3VwLmlkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLmlkLCByb290R3JvdXAuaWQpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGlucHV0MywgcmlnaHRHcm91cC5pZCk7XG5cdFx0YXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGlucHV0NCwgcmlnaHRHcm91cC5pZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5hY3RpdmVHcm91cC5pZCwgcmlnaHRHcm91cC5pZCk7XG5cblx0XHRyb290R3JvdXAubG9jayh0cnVlKTtcblx0XHRyaWdodEdyb3VwLmxvY2sodHJ1ZSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLmlkLCByb290R3JvdXAuaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLmFjdGl2ZUVkaXRvcj8ucmVzb3VyY2U/LnRvU3RyaW5nKCksIGlucHV0MS5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dDMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuYWN0aXZlR3JvdXAuaWQsIHJpZ2h0R3JvdXAuaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLmFjdGl2ZUVkaXRvcj8ucmVzb3VyY2U/LnRvU3RyaW5nKCksIGlucHV0My5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Lmdyb3Vwcy5sZW5ndGgsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2NrZWQgZ3JvdXBzIC0gcmV2ZWFsSWZWaXNpYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RlclRlc3RGaWxlRWRpdG9yKCkpO1xuXG5cdFx0Y29uc3QgW3BhcnQsIHNlcnZpY2UsIGFjY2Vzc29yXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclNlcnZpY2UoKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChhY2Nlc3Nvci5lZGl0b3JSZXNvbHZlclNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoXG5cdFx0XHQnKi5lZGl0b3Itc2VydmljZS1sb2NrZWQtZ3JvdXAtdGVzdHMnLFxuXHRcdFx0eyBpZDogVEVTVF9FRElUT1JfSU5QVVRfSUQsIGxhYmVsOiAnTGFiZWwnLCBwcmlvcml0eTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmV4Y2x1c2l2ZSB9LFxuXHRcdFx0e30sXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUVkaXRvcklucHV0OiBlZGl0b3IgPT4gKHsgZWRpdG9yOiBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KGVkaXRvci5yZXNvdXJjZSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpIH0pXG5cdFx0XHR9XG5cdFx0KSk7XG5cblx0XHRjb25zdCByb290R3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdGNvbnN0IHJpZ2h0R3JvdXAgPSBwYXJ0LmFkZEdyb3VwKHJvb3RHcm91cCwgR3JvdXBEaXJlY3Rpb24uUklHSFQpO1xuXG5cdFx0cGFydC5hY3RpdmF0ZUdyb3VwKHJvb3RHcm91cCk7XG5cblx0XHRjb25zdCBpbnB1dDE6IElSZXNvdXJjZUVkaXRvcklucHV0ID0geyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vcmVzb3VyY2UtYmFzaWNzLmVkaXRvci1zZXJ2aWNlLWxvY2tlZC1ncm91cC10ZXN0cycpLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH07XG5cdFx0Y29uc3QgaW5wdXQyOiBJUmVzb3VyY2VFZGl0b3JJbnB1dCA9IHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovL3Jlc291cmNlMi1iYXNpY3MuZWRpdG9yLXNlcnZpY2UtbG9ja2VkLWdyb3VwLXRlc3RzJyksIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfTtcblx0XHRjb25zdCBpbnB1dDM6IElSZXNvdXJjZUVkaXRvcklucHV0ID0geyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vcmVzb3VyY2UzLWJhc2ljcy5lZGl0b3Itc2VydmljZS1sb2NrZWQtZ3JvdXAtdGVzdHMnKSwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9O1xuXHRcdGNvbnN0IGlucHV0NDogSVJlc291cmNlRWRpdG9ySW5wdXQgPSB7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly9yZXNvdXJjZTQtYmFzaWNzLmVkaXRvci1zZXJ2aWNlLWxvY2tlZC1ncm91cC10ZXN0cycpLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH07XG5cblx0XHRhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQxLCByb290R3JvdXAuaWQpO1xuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dDIsIHJvb3RHcm91cC5pZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5hY3RpdmVHcm91cC5pZCwgcm9vdEdyb3VwLmlkKTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dDMsIHJpZ2h0R3JvdXAuaWQpO1xuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dDQsIHJpZ2h0R3JvdXAuaWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuYWN0aXZlR3JvdXAuaWQsIHJpZ2h0R3JvdXAuaWQpO1xuXG5cdFx0cm9vdEdyb3VwLmxvY2sodHJ1ZSk7XG5cdFx0cmlnaHRHcm91cC5sb2NrKHRydWUpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKHsgLi4uaW5wdXQyLCBvcHRpb25zOiB7IC4uLmlucHV0Mi5vcHRpb25zLCByZXZlYWxJZlZpc2libGU6IHRydWUgfSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLmlkLCByb290R3JvdXAuaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLmFjdGl2ZUVkaXRvcj8ucmVzb3VyY2U/LnRvU3RyaW5nKCksIGlucHV0Mi5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcih7IC4uLmlucHV0NCwgb3B0aW9uczogeyAuLi5pbnB1dDQub3B0aW9ucywgcmV2ZWFsSWZWaXNpYmxlOiB0cnVlIH0gfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5hY3RpdmVHcm91cC5pZCwgcmlnaHRHcm91cC5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuYWN0aXZlR3JvdXAuYWN0aXZlRWRpdG9yPy5yZXNvdXJjZT8udG9TdHJpbmcoKSwgaW5wdXQ0LnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZ3JvdXBzLmxlbmd0aCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvY2tlZCBncm91cHMgLSByZXZlYWxJZk9wZW5lZCcsIGFzeW5jICgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJUZXN0RmlsZUVkaXRvcigpKTtcblxuXHRcdGNvbnN0IFtwYXJ0LCBzZXJ2aWNlLCBhY2Nlc3Nvcl0gPSBhd2FpdCBjcmVhdGVFZGl0b3JTZXJ2aWNlKCk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoYWNjZXNzb3IuZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKFxuXHRcdFx0JyouZWRpdG9yLXNlcnZpY2UtbG9ja2VkLWdyb3VwLXRlc3RzJyxcblx0XHRcdHsgaWQ6IFRFU1RfRURJVE9SX0lOUFVUX0lELCBsYWJlbDogJ0xhYmVsJywgcHJpb3JpdHk6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5leGNsdXNpdmUgfSxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogZWRpdG9yID0+ICh7IGVkaXRvcjogY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChlZGl0b3IucmVzb3VyY2UsIFRFU1RfRURJVE9SX0lOUFVUX0lEKSB9KVxuXHRcdFx0fVxuXHRcdCkpO1xuXG5cdFx0Y29uc3Qgcm9vdEdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblx0XHRjb25zdCByaWdodEdyb3VwID0gcGFydC5hZGRHcm91cChyb290R3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblxuXHRcdHBhcnQuYWN0aXZhdGVHcm91cChyb290R3JvdXApO1xuXG5cdFx0Y29uc3QgaW5wdXQxOiBJUmVzb3VyY2VFZGl0b3JJbnB1dCA9IHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovL3Jlc291cmNlLWJhc2ljcy5lZGl0b3Itc2VydmljZS1sb2NrZWQtZ3JvdXAtdGVzdHMnKSwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9O1xuXHRcdGNvbnN0IGlucHV0MjogSVJlc291cmNlRWRpdG9ySW5wdXQgPSB7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly9yZXNvdXJjZTItYmFzaWNzLmVkaXRvci1zZXJ2aWNlLWxvY2tlZC1ncm91cC10ZXN0cycpLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH07XG5cdFx0Y29uc3QgaW5wdXQzOiBJUmVzb3VyY2VFZGl0b3JJbnB1dCA9IHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovL3Jlc291cmNlMy1iYXNpY3MuZWRpdG9yLXNlcnZpY2UtbG9ja2VkLWdyb3VwLXRlc3RzJyksIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfTtcblx0XHRjb25zdCBpbnB1dDQ6IElSZXNvdXJjZUVkaXRvcklucHV0ID0geyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vcmVzb3VyY2U0LWJhc2ljcy5lZGl0b3Itc2VydmljZS1sb2NrZWQtZ3JvdXAtdGVzdHMnKSwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9O1xuXG5cdFx0YXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGlucHV0MSwgcm9vdEdyb3VwLmlkKTtcblx0XHRhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQyLCByb290R3JvdXAuaWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuYWN0aXZlR3JvdXAuaWQsIHJvb3RHcm91cC5pZCk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQzLCByaWdodEdyb3VwLmlkKTtcblx0XHRhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQ0LCByaWdodEdyb3VwLmlkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLmlkLCByaWdodEdyb3VwLmlkKTtcblxuXHRcdHJvb3RHcm91cC5sb2NrKHRydWUpO1xuXHRcdHJpZ2h0R3JvdXAubG9jayh0cnVlKTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcih7IC4uLmlucHV0MSwgb3B0aW9uczogeyAuLi5pbnB1dDEub3B0aW9ucywgcmV2ZWFsSWZPcGVuZWQ6IHRydWUgfSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLmlkLCByb290R3JvdXAuaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLmFjdGl2ZUVkaXRvcj8ucmVzb3VyY2U/LnRvU3RyaW5nKCksIGlucHV0MS5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcih7IC4uLmlucHV0Mywgb3B0aW9uczogeyAuLi5pbnB1dDMub3B0aW9ucywgcmV2ZWFsSWZPcGVuZWQ6IHRydWUgfSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLmlkLCByaWdodEdyb3VwLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5hY3RpdmVHcm91cC5hY3RpdmVFZGl0b3I/LnJlc291cmNlPy50b1N0cmluZygpLCBpbnB1dDMucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5ncm91cHMubGVuZ3RoLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnb3BlbkVkaXRvcigpIC0gdW50eXBlZCwgdHlwZWQnLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHRlc3RPcGVuRWRpdG9ycyhmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29wZW5FZGl0b3JzKCkgLSB1bnR5cGVkLCB0eXBlZCcsICgpID0+IHtcblx0XHRyZXR1cm4gdGVzdE9wZW5FZGl0b3JzKHRydWUpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0T3BlbkVkaXRvcnModXNlT3BlbkVkaXRvcnM6IGJvb2xlYW4pIHtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJUZXN0RmlsZUVkaXRvcigpKTtcblxuXHRcdGNvbnN0IFtwYXJ0LCBzZXJ2aWNlLCBhY2Nlc3Nvcl0gPSBhd2FpdCBjcmVhdGVFZGl0b3JTZXJ2aWNlKCk7XG5cblx0XHRsZXQgcm9vdEdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblxuXHRcdGxldCBlZGl0b3JGYWN0b3J5Q2FsbGVkID0gMDtcblx0XHRsZXQgdW50aXRsZWRFZGl0b3JGYWN0b3J5Q2FsbGVkID0gMDtcblx0XHRsZXQgZGlmZkVkaXRvckZhY3RvcnlDYWxsZWQgPSAwO1xuXG5cdFx0bGV0IGxhc3RFZGl0b3JGYWN0b3J5RWRpdG9yOiBJUmVzb3VyY2VFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgbGFzdFVudGl0bGVkRWRpdG9yRmFjdG9yeUVkaXRvcjogSVVudGl0bGVkVGV4dFJlc291cmNlRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IGxhc3REaWZmRWRpdG9yRmFjdG9yeUVkaXRvcjogSVJlc291cmNlRGlmZkVkaXRvcklucHV0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjY2Vzc29yLmVkaXRvclJlc29sdmVyU2VydmljZS5yZWdpc3RlckVkaXRvcihcblx0XHRcdCcqLmVkaXRvci1zZXJ2aWNlLW92ZXJyaWRlLXRlc3RzJyxcblx0XHRcdHsgaWQ6IFRFU1RfRURJVE9SX0lOUFVUX0lELCBsYWJlbDogJ0xhYmVsJywgcHJpb3JpdHk6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5leGNsdXNpdmUgfSxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogZWRpdG9yID0+IHtcblx0XHRcdFx0XHRlZGl0b3JGYWN0b3J5Q2FsbGVkKys7XG5cdFx0XHRcdFx0bGFzdEVkaXRvckZhY3RvcnlFZGl0b3IgPSBlZGl0b3I7XG5cblx0XHRcdFx0XHRyZXR1cm4geyBlZGl0b3I6IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoZWRpdG9yLnJlc291cmNlLCBURVNUX0VESVRPUl9JTlBVVF9JRCkgfTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Y3JlYXRlVW50aXRsZWRFZGl0b3JJbnB1dDogdW50aXRsZWRFZGl0b3IgPT4ge1xuXHRcdFx0XHRcdHVudGl0bGVkRWRpdG9yRmFjdG9yeUNhbGxlZCsrO1xuXHRcdFx0XHRcdGxhc3RVbnRpdGxlZEVkaXRvckZhY3RvcnlFZGl0b3IgPSB1bnRpdGxlZEVkaXRvcjtcblxuXHRcdFx0XHRcdHJldHVybiB7IGVkaXRvcjogY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dCh1bnRpdGxlZEVkaXRvci5yZXNvdXJjZSA/PyBVUkkucGFyc2UoYHVudGl0bGVkOi8vbXktdW50aXRsZWQtZWRpdG9yLSR7dW50aXRsZWRFZGl0b3JGYWN0b3J5Q2FsbGVkfWApLCBURVNUX0VESVRPUl9JTlBVVF9JRCkgfTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Y3JlYXRlRGlmZkVkaXRvcklucHV0OiBkaWZmRWRpdG9yID0+IHtcblx0XHRcdFx0XHRkaWZmRWRpdG9yRmFjdG9yeUNhbGxlZCsrO1xuXHRcdFx0XHRcdGxhc3REaWZmRWRpdG9yRmFjdG9yeUVkaXRvciA9IGRpZmZFZGl0b3I7XG5cblx0XHRcdFx0XHRyZXR1cm4geyBlZGl0b3I6IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoYGRpZmYtZWRpdG9yLSR7ZGlmZkVkaXRvckZhY3RvcnlDYWxsZWR9YCksIFRFU1RfRURJVE9SX0lOUFVUX0lEKSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KSk7XG5cblx0XHRhc3luYyBmdW5jdGlvbiByZXNldFRlc3RTdGF0ZSgpIHtcblx0XHRcdGVkaXRvckZhY3RvcnlDYWxsZWQgPSAwO1xuXHRcdFx0dW50aXRsZWRFZGl0b3JGYWN0b3J5Q2FsbGVkID0gMDtcblx0XHRcdGRpZmZFZGl0b3JGYWN0b3J5Q2FsbGVkID0gMDtcblxuXHRcdFx0bGFzdEVkaXRvckZhY3RvcnlFZGl0b3IgPSB1bmRlZmluZWQ7XG5cdFx0XHRsYXN0VW50aXRsZWRFZGl0b3JGYWN0b3J5RWRpdG9yID0gdW5kZWZpbmVkO1xuXHRcdFx0bGFzdERpZmZFZGl0b3JGYWN0b3J5RWRpdG9yID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRhd2FpdCB3b3JrYmVuY2hUZWFyZG93bihhY2Nlc3Nvci5pbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRcdHJvb3RHcm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0fVxuXG5cdFx0YXN5bmMgZnVuY3Rpb24gb3BlbkVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0V2l0aE9wdGlvbnMgfCBJVW50eXBlZEVkaXRvcklucHV0LCBncm91cD86IFByZWZlcnJlZEdyb3VwKTogUHJvbWlzZTxJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZD4ge1xuXHRcdFx0aWYgKHVzZU9wZW5FZGl0b3JzKSB7XG5cdFx0XHRcdC8vIFRoZSB0eXBlIHNhZmV0eSBpc24ndCBzdXBlciBnb29kIGhlcmUsIHNvIHdlIGFzc2lzdCB3aXRoIHJ1bnRpbWUgY2hlY2tzXG5cdFx0XHRcdC8vIE9wZW4gZWRpdG9ycyBleHBlY3RzIHVudHlwZWQgb3IgZWRpdG9yIGlucHV0IHdpdGggb3B0aW9ucywgeW91IGNhbm5vdCBwYXNzIGEgdHlwZWQgZWRpdG9yIGlucHV0XG5cdFx0XHRcdC8vIHdpdGhvdXQgb3B0aW9uc1xuXHRcdFx0XHRpZiAoIWlzRWRpdG9ySW5wdXRXaXRoT3B0aW9ucyhlZGl0b3IpICYmIGlzRWRpdG9ySW5wdXQoZWRpdG9yKSkge1xuXHRcdFx0XHRcdGVkaXRvciA9IHsgZWRpdG9yOiBlZGl0b3IsIG9wdGlvbnM6IHt9IH07XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcGFuZXMgPSBhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3JzKFtlZGl0b3JdLCBncm91cCk7XG5cdFx0XHRcdHJldHVybiBwYW5lc1swXTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGlzRWRpdG9ySW5wdXRXaXRoT3B0aW9ucyhlZGl0b3IpKSB7XG5cdFx0XHRcdHJldHVybiBzZXJ2aWNlLm9wZW5FZGl0b3IoZWRpdG9yLmVkaXRvciwgZWRpdG9yLm9wdGlvbnMsIGdyb3VwKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHNlcnZpY2Uub3BlbkVkaXRvcihlZGl0b3IsIGdyb3VwKTtcblx0XHR9XG5cblx0XHQvLyB1bnR5cGVkXG5cdFx0e1xuXHRcdFx0Ly8gdW50eXBlZCByZXNvdXJjZSBlZGl0b3IsIG5vIG9wdGlvbnMsIG5vIGdyb3VwXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IHVudHlwZWRFZGl0b3I6IElSZXNvdXJjZUVkaXRvcklucHV0ID0geyByZXNvdXJjZTogVVJJLmZpbGUoJ2ZpbGUuZWRpdG9yLXNlcnZpY2Utb3ZlcnJpZGUtdGVzdHMnKSB9O1xuXHRcdFx0XHRjb25zdCBwYW5lID0gYXdhaXQgb3BlbkVkaXRvcih1bnR5cGVkRWRpdG9yKTtcblx0XHRcdFx0bGV0IHR5cGVkRWRpdG9yID0gcGFuZT8uaW5wdXQ7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhbmU/Lmdyb3VwLCByb290R3JvdXApO1xuXHRcdFx0XHRhc3NlcnQub2sodHlwZWRFZGl0b3IgaW5zdGFuY2VvZiBUZXN0RmlsZUVkaXRvcklucHV0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVkRWRpdG9yLnJlc291cmNlLnRvU3RyaW5nKCksIHVudHlwZWRFZGl0b3IucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvckZhY3RvcnlDYWxsZWQsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW50aXRsZWRFZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZFZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdEVkaXRvckZhY3RvcnlFZGl0b3IsIHVudHlwZWRFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQub2soIWxhc3RVbnRpdGxlZEVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQub2soIWxhc3REaWZmRWRpdG9yRmFjdG9yeUVkaXRvcik7XG5cblx0XHRcdFx0Ly8gb3BlbmluZyB0aGUgc2FtZSBlZGl0b3Igc2hvdWxkIG5vdCBjcmVhdGVcblx0XHRcdFx0Ly8gYSBuZXcgZWRpdG9yIGlucHV0XG5cdFx0XHRcdGF3YWl0IG9wZW5FZGl0b3IodW50eXBlZEVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYW5lPy5ncm91cC5hY3RpdmVFZGl0b3IsIHR5cGVkRWRpdG9yKTtcblxuXHRcdFx0XHQvLyByZXBsYWNlRWRpdG9ycyBzaG91bGQgd29yayB0b29cblx0XHRcdFx0Y29uc3QgdW50eXBlZEVkaXRvclJlcGxhY2VtZW50OiBJUmVzb3VyY2VFZGl0b3JJbnB1dCA9IHsgcmVzb3VyY2U6IFVSSS5maWxlKCdmaWxlLXJlcGxhY2VkLmVkaXRvci1zZXJ2aWNlLW92ZXJyaWRlLXRlc3RzJykgfTtcblx0XHRcdFx0YXdhaXQgc2VydmljZS5yZXBsYWNlRWRpdG9ycyhbe1xuXHRcdFx0XHRcdGVkaXRvcjogdHlwZWRFZGl0b3IsXG5cdFx0XHRcdFx0cmVwbGFjZW1lbnQ6IHVudHlwZWRFZGl0b3JSZXBsYWNlbWVudFxuXHRcdFx0XHR9XSwgcm9vdEdyb3VwKTtcblxuXHRcdFx0XHR0eXBlZEVkaXRvciA9IHJvb3RHcm91cC5hY3RpdmVFZGl0b3IhO1xuXG5cdFx0XHRcdGFzc2VydC5vayh0eXBlZEVkaXRvciBpbnN0YW5jZW9mIFRlc3RGaWxlRWRpdG9ySW5wdXQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZWRFZGl0b3I/LnJlc291cmNlPy50b1N0cmluZygpLCB1bnR5cGVkRWRpdG9yUmVwbGFjZW1lbnQucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvckZhY3RvcnlDYWxsZWQsIDMpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW50aXRsZWRFZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZFZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdEVkaXRvckZhY3RvcnlFZGl0b3IsIHVudHlwZWRFZGl0b3JSZXBsYWNlbWVudCk7XG5cdFx0XHRcdGFzc2VydC5vayghbGFzdFVudGl0bGVkRWRpdG9yRmFjdG9yeUVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5vayghbGFzdERpZmZFZGl0b3JGYWN0b3J5RWRpdG9yKTtcblxuXHRcdFx0XHRhd2FpdCByZXNldFRlc3RTdGF0ZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB1bnR5cGVkIHJlc291cmNlIGVkaXRvciwgb3B0aW9ucyAob3ZlcnJpZGUgdGV4dCksIG5vIGdyb3VwXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IHVudHlwZWRFZGl0b3I6IElSZXNvdXJjZUVkaXRvcklucHV0ID0geyByZXNvdXJjZTogVVJJLmZpbGUoJ2ZpbGUuZWRpdG9yLXNlcnZpY2Utb3ZlcnJpZGUtdGVzdHMnKSwgb3B0aW9uczogeyBvdmVycmlkZTogREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04uaWQgfSB9O1xuXHRcdFx0XHRjb25zdCBwYW5lID0gYXdhaXQgb3BlbkVkaXRvcih1bnR5cGVkRWRpdG9yKTtcblx0XHRcdFx0Y29uc3QgdHlwZWRFZGl0b3IgPSBwYW5lPy5pbnB1dDtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFuZT8uZ3JvdXAsIHJvb3RHcm91cCk7XG5cdFx0XHRcdGFzc2VydC5vayh0eXBlZEVkaXRvciBpbnN0YW5jZW9mIEZpbGVFZGl0b3JJbnB1dCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlZEVkaXRvci5yZXNvdXJjZS50b1N0cmluZygpLCB1bnR5cGVkRWRpdG9yLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVudGl0bGVkRWRpdG9yRmFjdG9yeUNhbGxlZCwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmRWRpdG9yRmFjdG9yeUNhbGxlZCwgMCk7XG5cblx0XHRcdFx0YXNzZXJ0Lm9rKCFsYXN0RWRpdG9yRmFjdG9yeUVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5vayghbGFzdFVudGl0bGVkRWRpdG9yRmFjdG9yeUVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5vayghbGFzdERpZmZFZGl0b3JGYWN0b3J5RWRpdG9yKTtcblxuXHRcdFx0XHQvLyBvcGVuaW5nIHRoZSBzYW1lIGVkaXRvciBzaG91bGQgbm90IGNyZWF0ZVxuXHRcdFx0XHQvLyBhIG5ldyBlZGl0b3IgaW5wdXRcblx0XHRcdFx0YXdhaXQgb3BlbkVkaXRvcih1bnR5cGVkRWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhbmU/Lmdyb3VwLmFjdGl2ZUVkaXRvciwgdHlwZWRFZGl0b3IpO1xuXG5cdFx0XHRcdGF3YWl0IHJlc2V0VGVzdFN0YXRlKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHVudHlwZWQgcmVzb3VyY2UgZWRpdG9yLCBvcHRpb25zIChvdmVycmlkZSB0ZXh0LCBzdGlja3k6IHRydWUsIHByZXNlcnZlRm9jdXM6IHRydWUpLCBubyBncm91cFxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCB1bnR5cGVkRWRpdG9yOiBJUmVzb3VyY2VFZGl0b3JJbnB1dCA9IHsgcmVzb3VyY2U6IFVSSS5maWxlKCdmaWxlLmVkaXRvci1zZXJ2aWNlLW92ZXJyaWRlLXRlc3RzJyksIG9wdGlvbnM6IHsgc3RpY2t5OiB0cnVlLCBwcmVzZXJ2ZUZvY3VzOiB0cnVlLCBvdmVycmlkZTogREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04uaWQgfSB9O1xuXHRcdFx0XHRjb25zdCBwYW5lID0gYXdhaXQgb3BlbkVkaXRvcih1bnR5cGVkRWRpdG9yKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFuZT8uZ3JvdXAsIHJvb3RHcm91cCk7XG5cdFx0XHRcdGFzc2VydC5vayhwYW5lLmlucHV0IGluc3RhbmNlb2YgRmlsZUVkaXRvcklucHV0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhbmUuaW5wdXQucmVzb3VyY2UudG9TdHJpbmcoKSwgdW50eXBlZEVkaXRvci5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhbmUuZ3JvdXAuaXNTdGlja3kocGFuZS5pbnB1dCksIHRydWUpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVudGl0bGVkRWRpdG9yRmFjdG9yeUNhbGxlZCwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmRWRpdG9yRmFjdG9yeUNhbGxlZCwgMCk7XG5cblx0XHRcdFx0YXNzZXJ0Lm9rKCFsYXN0RWRpdG9yRmFjdG9yeUVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5vayghbGFzdFVudGl0bGVkRWRpdG9yRmFjdG9yeUVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5vayghbGFzdERpZmZFZGl0b3JGYWN0b3J5RWRpdG9yKTtcblxuXHRcdFx0XHRhd2FpdCByZXNldFRlc3RTdGF0ZSgpO1xuXHRcdFx0XHRhd2FpdCBwYXJ0LmFjdGl2ZUdyb3VwLmNsb3NlRWRpdG9yKHBhbmUuaW5wdXQpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB1bnR5cGVkIHJlc291cmNlIGVkaXRvciwgb3B0aW9ucyAob3ZlcnJpZGUgZGVmYXVsdCksIG5vIGdyb3VwXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IHVudHlwZWRFZGl0b3I6IElSZXNvdXJjZUVkaXRvcklucHV0ID0geyByZXNvdXJjZTogVVJJLmZpbGUoJ2ZpbGUuZWRpdG9yLXNlcnZpY2Utb3ZlcnJpZGUtdGVzdHMnKSwgb3B0aW9uczogeyBvdmVycmlkZTogREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04uaWQgfSB9O1xuXHRcdFx0XHRjb25zdCBwYW5lID0gYXdhaXQgb3BlbkVkaXRvcih1bnR5cGVkRWRpdG9yKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFuZT8uZ3JvdXAsIHJvb3RHcm91cCk7XG5cdFx0XHRcdGFzc2VydC5vayhwYW5lLmlucHV0IGluc3RhbmNlb2YgRmlsZUVkaXRvcklucHV0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhbmUuaW5wdXQucmVzb3VyY2UudG9TdHJpbmcoKSwgdW50eXBlZEVkaXRvci5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yRmFjdG9yeUNhbGxlZCwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnRpdGxlZEVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZkVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXG5cdFx0XHRcdGFzc2VydC5vayghbGFzdEVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQub2soIWxhc3RVbnRpdGxlZEVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQub2soIWxhc3REaWZmRWRpdG9yRmFjdG9yeUVkaXRvcik7XG5cblx0XHRcdFx0YXdhaXQgcmVzZXRUZXN0U3RhdGUoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdW50eXBlZCByZXNvdXJjZSBlZGl0b3IsIG9wdGlvbnMgKG92ZXJyaWRlOiBURVNUX0VESVRPUl9JTlBVVF9JRCksIG5vIGdyb3VwXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IHVudHlwZWRFZGl0b3I6IElSZXNvdXJjZUVkaXRvcklucHV0ID0geyByZXNvdXJjZTogVVJJLmZpbGUoJ2ZpbGUuZWRpdG9yLXNlcnZpY2Utb3ZlcnJpZGUtdGVzdHMnKSwgb3B0aW9uczogeyBvdmVycmlkZTogVEVTVF9FRElUT1JfSU5QVVRfSUQgfSB9O1xuXHRcdFx0XHRjb25zdCBwYW5lID0gYXdhaXQgb3BlbkVkaXRvcih1bnR5cGVkRWRpdG9yKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFuZT8uZ3JvdXAsIHJvb3RHcm91cCk7XG5cdFx0XHRcdGFzc2VydC5vayhwYW5lLmlucHV0IGluc3RhbmNlb2YgVGVzdEZpbGVFZGl0b3JJbnB1dCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYW5lLmlucHV0LnJlc291cmNlLnRvU3RyaW5nKCksIHVudHlwZWRFZGl0b3IucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvckZhY3RvcnlDYWxsZWQsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW50aXRsZWRFZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZFZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdEVkaXRvckZhY3RvcnlFZGl0b3IsIHVudHlwZWRFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQub2soIWxhc3RVbnRpdGxlZEVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQub2soIWxhc3REaWZmRWRpdG9yRmFjdG9yeUVkaXRvcik7XG5cblx0XHRcdFx0YXdhaXQgcmVzZXRUZXN0U3RhdGUoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdW50eXBlZCByZXNvdXJjZSBlZGl0b3IsIG9wdGlvbnMgKHN0aWNreTogdHJ1ZSwgcHJlc2VydmVGb2N1czogdHJ1ZSksIG5vIGdyb3VwXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IHVudHlwZWRFZGl0b3I6IElSZXNvdXJjZUVkaXRvcklucHV0ID0geyByZXNvdXJjZTogVVJJLmZpbGUoJ2ZpbGUuZWRpdG9yLXNlcnZpY2Utb3ZlcnJpZGUtdGVzdHMnKSwgb3B0aW9uczogeyBzdGlja3k6IHRydWUsIHByZXNlcnZlRm9jdXM6IHRydWUgfSB9O1xuXHRcdFx0XHRjb25zdCBwYW5lID0gYXdhaXQgb3BlbkVkaXRvcih1bnR5cGVkRWRpdG9yKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFuZT8uZ3JvdXAsIHJvb3RHcm91cCk7XG5cdFx0XHRcdGFzc2VydC5vayhwYW5lLmlucHV0IGluc3RhbmNlb2YgVGVzdEZpbGVFZGl0b3JJbnB1dCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYW5lLmlucHV0LnJlc291cmNlLnRvU3RyaW5nKCksIHVudHlwZWRFZGl0b3IucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYW5lLmdyb3VwLmlzU3RpY2t5KHBhbmUuaW5wdXQpLCB0cnVlKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yRmFjdG9yeUNhbGxlZCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnRpdGxlZEVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZkVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgobGFzdEVkaXRvckZhY3RvcnlFZGl0b3IgYXMgSVJlc291cmNlRWRpdG9ySW5wdXQpLnJlc291cmNlLnRvU3RyaW5nKCksIHVudHlwZWRFZGl0b3IucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgobGFzdEVkaXRvckZhY3RvcnlFZGl0b3IgYXMgSVJlc291cmNlRWRpdG9ySW5wdXQpLm9wdGlvbnM/LnByZXNlcnZlRm9jdXMsIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQub2soIWxhc3RVbnRpdGxlZEVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQub2soIWxhc3REaWZmRWRpdG9yRmFjdG9yeUVkaXRvcik7XG5cblx0XHRcdFx0YXdhaXQgcmVzZXRUZXN0U3RhdGUoKTtcblx0XHRcdFx0YXdhaXQgcGFydC5hY3RpdmVHcm91cC5jbG9zZUVkaXRvcihwYW5lLmlucHV0KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdW50eXBlZCByZXNvdXJjZSBlZGl0b3IsIG9wdGlvbnMgKG92ZXJyaWRlOiBURVNUX0VESVRPUl9JTlBVVF9JRCwgc3RpY2t5OiB0cnVlLCBwcmVzZXJ2ZUZvY3VzOiB0cnVlKSwgbm8gZ3JvdXBcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgdW50eXBlZEVkaXRvcjogSVJlc291cmNlRWRpdG9ySW5wdXQgPSB7IHJlc291cmNlOiBVUkkuZmlsZSgnZmlsZS5lZGl0b3Itc2VydmljZS1vdmVycmlkZS10ZXN0cycpLCBvcHRpb25zOiB7IHN0aWNreTogdHJ1ZSwgcHJlc2VydmVGb2N1czogdHJ1ZSwgb3ZlcnJpZGU6IFRFU1RfRURJVE9SX0lOUFVUX0lEIH0gfTtcblx0XHRcdFx0Y29uc3QgcGFuZSA9IGF3YWl0IG9wZW5FZGl0b3IodW50eXBlZEVkaXRvcik7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhbmU/Lmdyb3VwLCByb290R3JvdXApO1xuXHRcdFx0XHRhc3NlcnQub2socGFuZS5pbnB1dCBpbnN0YW5jZW9mIFRlc3RGaWxlRWRpdG9ySW5wdXQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFuZS5pbnB1dC5yZXNvdXJjZS50b1N0cmluZygpLCB1bnR5cGVkRWRpdG9yLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFuZS5ncm91cC5pc1N0aWNreShwYW5lLmlucHV0KSwgdHJ1ZSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvckZhY3RvcnlDYWxsZWQsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW50aXRsZWRFZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZFZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGxhc3RFZGl0b3JGYWN0b3J5RWRpdG9yIGFzIElSZXNvdXJjZUVkaXRvcklucHV0KS5yZXNvdXJjZS50b1N0cmluZygpLCB1bnR5cGVkRWRpdG9yLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGxhc3RFZGl0b3JGYWN0b3J5RWRpdG9yIGFzIElSZXNvdXJjZUVkaXRvcklucHV0KS5vcHRpb25zPy5wcmVzZXJ2ZUZvY3VzLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCFsYXN0VW50aXRsZWRFZGl0b3JGYWN0b3J5RWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCFsYXN0RGlmZkVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXG5cdFx0XHRcdGF3YWl0IHJlc2V0VGVzdFN0YXRlKCk7XG5cdFx0XHRcdGF3YWl0IHBhcnQuYWN0aXZlR3JvdXAuY2xvc2VFZGl0b3IocGFuZS5pbnB1dCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHVudHlwZWQgcmVzb3VyY2UgZWRpdG9yLCBubyBvcHRpb25zLCBTSURFX0dST1VQXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IHVudHlwZWRFZGl0b3I6IElSZXNvdXJjZUVkaXRvcklucHV0ID0geyByZXNvdXJjZTogVVJJLmZpbGUoJ2ZpbGUuZWRpdG9yLXNlcnZpY2Utb3ZlcnJpZGUtdGVzdHMnKSB9O1xuXHRcdFx0XHRjb25zdCBwYW5lID0gYXdhaXQgb3BlbkVkaXRvcih1bnR5cGVkRWRpdG9yLCBTSURFX0dST1VQKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXNzb3IuZWRpdG9yR3JvdXBTZXJ2aWNlLmdyb3Vwcy5sZW5ndGgsIDIpO1xuXHRcdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwocGFuZT8uZ3JvdXAsIHJvb3RHcm91cCk7XG5cdFx0XHRcdGFzc2VydC5vayhwYW5lPy5pbnB1dCBpbnN0YW5jZW9mIFRlc3RGaWxlRWRpdG9ySW5wdXQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFuZT8uaW5wdXQucmVzb3VyY2UudG9TdHJpbmcoKSwgdW50eXBlZEVkaXRvci5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yRmFjdG9yeUNhbGxlZCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnRpdGxlZEVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZkVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0RWRpdG9yRmFjdG9yeUVkaXRvciwgdW50eXBlZEVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5vayghbGFzdFVudGl0bGVkRWRpdG9yRmFjdG9yeUVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5vayghbGFzdERpZmZFZGl0b3JGYWN0b3J5RWRpdG9yKTtcblxuXHRcdFx0XHRhd2FpdCByZXNldFRlc3RTdGF0ZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB1bnR5cGVkIHJlc291cmNlIGVkaXRvciwgb3B0aW9ucyAob3ZlcnJpZGUgdGV4dCksIFNJREVfR1JPVVBcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgdW50eXBlZEVkaXRvcjogSVJlc291cmNlRWRpdG9ySW5wdXQgPSB7IHJlc291cmNlOiBVUkkuZmlsZSgnZmlsZS5lZGl0b3Itc2VydmljZS1vdmVycmlkZS10ZXN0cycpLCBvcHRpb25zOiB7IG92ZXJyaWRlOiBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTi5pZCB9IH07XG5cdFx0XHRcdGNvbnN0IHBhbmUgPSBhd2FpdCBvcGVuRWRpdG9yKHVudHlwZWRFZGl0b3IsIFNJREVfR1JPVVApO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY2Nlc3Nvci5lZGl0b3JHcm91cFNlcnZpY2UuZ3JvdXBzLmxlbmd0aCwgMik7XG5cdFx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChwYW5lPy5ncm91cCwgcm9vdEdyb3VwKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHBhbmU/LmlucHV0IGluc3RhbmNlb2YgRmlsZUVkaXRvcklucHV0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhbmUuaW5wdXQucmVzb3VyY2UudG9TdHJpbmcoKSwgdW50eXBlZEVkaXRvci5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yRmFjdG9yeUNhbGxlZCwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnRpdGxlZEVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZkVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXG5cdFx0XHRcdGFzc2VydC5vayghbGFzdEVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQub2soIWxhc3RVbnRpdGxlZEVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQub2soIWxhc3REaWZmRWRpdG9yRmFjdG9yeUVkaXRvcik7XG5cblx0XHRcdFx0YXdhaXQgcmVzZXRUZXN0U3RhdGUoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBUeXBlZFxuXHRcdHtcblx0XHRcdC8vIHR5cGVkIGVkaXRvciwgbm8gb3B0aW9ucywgbm8gZ3JvdXBcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgdHlwZWRFZGl0b3IgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmaWxlLmVkaXRvci1zZXJ2aWNlLW92ZXJyaWRlLXRlc3RzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRcdFx0Y29uc3QgcGFuZSA9IGF3YWl0IG9wZW5FZGl0b3IoeyBlZGl0b3I6IHR5cGVkRWRpdG9yIH0pO1xuXHRcdFx0XHRsZXQgdHlwZWRJbnB1dCA9IHBhbmU/LmlucHV0O1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYW5lPy5ncm91cCwgcm9vdEdyb3VwKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHR5cGVkSW5wdXQgaW5zdGFuY2VvZiBUZXN0RmlsZUVkaXRvcklucHV0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVkSW5wdXQucmVzb3VyY2UudG9TdHJpbmcoKSwgdHlwZWRFZGl0b3IucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0XHRcdFx0Ly8gSXQncyBhIHR5cGVkIGVkaXRvciBpbnB1dCBzbyB0aGUgcmVzb2x2ZXIgc2hvdWxkIG5vdCBoYXZlIGJlZW4gY2FsbGVkXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVudGl0bGVkRWRpdG9yRmFjdG9yeUNhbGxlZCwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmRWRpdG9yRmFjdG9yeUNhbGxlZCwgMCk7XG5cblx0XHRcdFx0YXNzZXJ0Lm9rKCFsYXN0RWRpdG9yRmFjdG9yeUVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5vayghbGFzdFVudGl0bGVkRWRpdG9yRmFjdG9yeUVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5vayghbGFzdERpZmZFZGl0b3JGYWN0b3J5RWRpdG9yKTtcblxuXHRcdFx0XHQvLyBvcGVuaW5nIHRoZSBzYW1lIGVkaXRvciBzaG91bGQgbm90IGNyZWF0ZVxuXHRcdFx0XHQvLyBhIG5ldyBlZGl0b3IgaW5wdXRcblx0XHRcdFx0YXdhaXQgb3BlbkVkaXRvcih0eXBlZEVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYW5lPy5ncm91cC5hY3RpdmVFZGl0b3IsIHR5cGVkSW5wdXQpO1xuXG5cdFx0XHRcdC8vIHJlcGxhY2VFZGl0b3JzIHNob3VsZCB3b3JrIHRvb1xuXHRcdFx0XHRjb25zdCB0eXBlZEVkaXRvclJlcGxhY2VtZW50ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZmlsZS1yZXBsYWNlZC5lZGl0b3Itc2VydmljZS1vdmVycmlkZS10ZXN0cycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0XHRcdGF3YWl0IHNlcnZpY2UucmVwbGFjZUVkaXRvcnMoW3tcblx0XHRcdFx0XHRlZGl0b3I6IHR5cGVkRWRpdG9yLFxuXHRcdFx0XHRcdHJlcGxhY2VtZW50OiB0eXBlZEVkaXRvclJlcGxhY2VtZW50XG5cdFx0XHRcdH1dLCByb290R3JvdXApO1xuXG5cdFx0XHRcdHR5cGVkSW5wdXQgPSByb290R3JvdXAuYWN0aXZlRWRpdG9yITtcblxuXHRcdFx0XHRhc3NlcnQub2sodHlwZWRJbnB1dCBpbnN0YW5jZW9mIFRlc3RGaWxlRWRpdG9ySW5wdXQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZWRJbnB1dC5yZXNvdXJjZS50b1N0cmluZygpLCB0eXBlZEVkaXRvclJlcGxhY2VtZW50LnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVudGl0bGVkRWRpdG9yRmFjdG9yeUNhbGxlZCwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmRWRpdG9yRmFjdG9yeUNhbGxlZCwgMCk7XG5cblx0XHRcdFx0YXNzZXJ0Lm9rKCFsYXN0VW50aXRsZWRFZGl0b3JGYWN0b3J5RWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCFsYXN0RGlmZkVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXG5cdFx0XHRcdGF3YWl0IHJlc2V0VGVzdFN0YXRlKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHR5cGVkIGVkaXRvciwgbm8gb3B0aW9ucywgbm8gZ3JvdXBcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgdHlwZWRFZGl0b3IgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmaWxlLmVkaXRvci1zZXJ2aWNlLW92ZXJyaWRlLXRlc3RzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRcdFx0Y29uc3QgcGFuZSA9IGF3YWl0IG9wZW5FZGl0b3IoeyBlZGl0b3I6IHR5cGVkRWRpdG9yIH0pO1xuXHRcdFx0XHRjb25zdCB0eXBlZElucHV0ID0gcGFuZT8uaW5wdXQ7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhbmU/Lmdyb3VwLCByb290R3JvdXApO1xuXHRcdFx0XHRhc3NlcnQub2sodHlwZWRJbnB1dCBpbnN0YW5jZW9mIFRlc3RGaWxlRWRpdG9ySW5wdXQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZWRJbnB1dC5yZXNvdXJjZS50b1N0cmluZygpLCB0eXBlZEVkaXRvci5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yRmFjdG9yeUNhbGxlZCwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnRpdGxlZEVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZkVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXG5cdFx0XHRcdGFzc2VydC5vayghbGFzdEVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQub2soIWxhc3RVbnRpdGxlZEVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQub2soIWxhc3REaWZmRWRpdG9yRmFjdG9yeUVkaXRvcik7XG5cblx0XHRcdFx0Ly8gb3BlbmluZyB0aGUgc2FtZSBlZGl0b3Igc2hvdWxkIG5vdCBjcmVhdGVcblx0XHRcdFx0Ly8gYSBuZXcgZWRpdG9yIGlucHV0XG5cdFx0XHRcdGF3YWl0IG9wZW5FZGl0b3IodHlwZWRFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFuZT8uZ3JvdXAuYWN0aXZlRWRpdG9yLCB0eXBlZEVkaXRvcik7XG5cblx0XHRcdFx0YXdhaXQgcmVzZXRUZXN0U3RhdGUoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdHlwZWQgZWRpdG9yLCBvcHRpb25zIChubyBvdmVycmlkZSwgc3RpY2t5OiB0cnVlLCBwcmVzZXJ2ZUZvY3VzOiB0cnVlKSwgbm8gZ3JvdXBcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgdHlwZWRFZGl0b3IgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmaWxlLmVkaXRvci1zZXJ2aWNlLW92ZXJyaWRlLXRlc3RzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRcdFx0Y29uc3QgcGFuZSA9IGF3YWl0IG9wZW5FZGl0b3IoeyBlZGl0b3I6IHR5cGVkRWRpdG9yLCBvcHRpb25zOiB7IHN0aWNreTogdHJ1ZSwgcHJlc2VydmVGb2N1czogdHJ1ZSB9IH0pO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYW5lPy5ncm91cCwgcm9vdEdyb3VwKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHBhbmUuaW5wdXQgaW5zdGFuY2VvZiBUZXN0RmlsZUVkaXRvcklucHV0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhbmUuaW5wdXQucmVzb3VyY2UudG9TdHJpbmcoKSwgdHlwZWRFZGl0b3IucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYW5lLmdyb3VwLmlzU3RpY2t5KHBhbmUuaW5wdXQpLCB0cnVlKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yRmFjdG9yeUNhbGxlZCwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnRpdGxlZEVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZkVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXG5cdFx0XHRcdGFzc2VydC5vayghbGFzdEVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQub2soIWxhc3RVbnRpdGxlZEVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQub2soIWxhc3REaWZmRWRpdG9yRmFjdG9yeUVkaXRvcik7XG5cblx0XHRcdFx0YXdhaXQgcmVzZXRUZXN0U3RhdGUoKTtcblx0XHRcdFx0YXdhaXQgcGFydC5hY3RpdmVHcm91cC5jbG9zZUVkaXRvcihwYW5lLmlucHV0KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdHlwZWQgZWRpdG9yLCBvcHRpb25zIChvdmVycmlkZSBkZWZhdWx0KSwgbm8gZ3JvdXBcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgdHlwZWRFZGl0b3IgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmaWxlLmVkaXRvci1zZXJ2aWNlLW92ZXJyaWRlLXRlc3RzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRcdFx0Y29uc3QgcGFuZSA9IGF3YWl0IG9wZW5FZGl0b3IoeyBlZGl0b3I6IHR5cGVkRWRpdG9yLCBvcHRpb25zOiB7IG92ZXJyaWRlOiBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTi5pZCB9IH0pO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYW5lPy5ncm91cCwgcm9vdEdyb3VwKTtcblx0XHRcdFx0Ly8gV2Ugc2hvdWxkbid0IGhhdmUgcmVzb2x2ZWQgYmVjYXVzZSBpdCBpcyBhIHR5cGVkIGVkaXRvciwgZXZlbiB0aG91Z2ggd2UgaGF2ZSBhbiBvdmVycmlkZSBzcGVjaWZpZWRcblx0XHRcdFx0YXNzZXJ0Lm9rKHBhbmUuaW5wdXQgaW5zdGFuY2VvZiBUZXN0RmlsZUVkaXRvcklucHV0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhbmUuaW5wdXQucmVzb3VyY2UudG9TdHJpbmcoKSwgdHlwZWRFZGl0b3IucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW50aXRsZWRFZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZFZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblxuXHRcdFx0XHRhc3NlcnQub2soIWxhc3RFZGl0b3JGYWN0b3J5RWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCFsYXN0VW50aXRsZWRFZGl0b3JGYWN0b3J5RWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCFsYXN0RGlmZkVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXG5cdFx0XHRcdGF3YWl0IHJlc2V0VGVzdFN0YXRlKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHR5cGVkIGVkaXRvciwgb3B0aW9ucyAob3ZlcnJpZGU6IFRFU1RfRURJVE9SX0lOUFVUX0lEKSwgbm8gZ3JvdXBcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgdHlwZWRFZGl0b3IgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmaWxlLmVkaXRvci1zZXJ2aWNlLW92ZXJyaWRlLXRlc3RzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRcdFx0Y29uc3QgcGFuZSA9IGF3YWl0IG9wZW5FZGl0b3IoeyBlZGl0b3I6IHR5cGVkRWRpdG9yLCBvcHRpb25zOiB7IG92ZXJyaWRlOiBURVNUX0VESVRPUl9JTlBVVF9JRCB9IH0pO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYW5lPy5ncm91cCwgcm9vdEdyb3VwKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHBhbmUuaW5wdXQgaW5zdGFuY2VvZiBUZXN0RmlsZUVkaXRvcklucHV0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhbmUuaW5wdXQucmVzb3VyY2UudG9TdHJpbmcoKSwgdHlwZWRFZGl0b3IucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW50aXRsZWRFZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZFZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblxuXHRcdFx0XHRhc3NlcnQub2soIWxhc3RFZGl0b3JGYWN0b3J5RWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCFsYXN0VW50aXRsZWRFZGl0b3JGYWN0b3J5RWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCFsYXN0RGlmZkVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXG5cdFx0XHRcdGF3YWl0IHJlc2V0VGVzdFN0YXRlKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHR5cGVkIGVkaXRvciwgb3B0aW9ucyAoc3RpY2t5OiB0cnVlLCBwcmVzZXJ2ZUZvY3VzOiB0cnVlKSwgbm8gZ3JvdXBcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgdHlwZWRFZGl0b3IgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmaWxlLmVkaXRvci1zZXJ2aWNlLW92ZXJyaWRlLXRlc3RzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRcdFx0Y29uc3QgcGFuZSA9IGF3YWl0IG9wZW5FZGl0b3IoeyBlZGl0b3I6IHR5cGVkRWRpdG9yLCBvcHRpb25zOiB7IHN0aWNreTogdHJ1ZSwgcHJlc2VydmVGb2N1czogdHJ1ZSB9IH0pO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYW5lPy5ncm91cCwgcm9vdEdyb3VwKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHBhbmUuaW5wdXQgaW5zdGFuY2VvZiBUZXN0RmlsZUVkaXRvcklucHV0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhbmUuaW5wdXQucmVzb3VyY2UudG9TdHJpbmcoKSwgdHlwZWRFZGl0b3IucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYW5lLmdyb3VwLmlzU3RpY2t5KHBhbmUuaW5wdXQpLCB0cnVlKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yRmFjdG9yeUNhbGxlZCwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnRpdGxlZEVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZkVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXG5cdFx0XHRcdGFzc2VydC5vayghbGFzdEVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQub2soIWxhc3RVbnRpdGxlZEVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQub2soIWxhc3REaWZmRWRpdG9yRmFjdG9yeUVkaXRvcik7XG5cblx0XHRcdFx0YXdhaXQgcmVzZXRUZXN0U3RhdGUoKTtcblx0XHRcdFx0YXdhaXQgcGFydC5hY3RpdmVHcm91cC5jbG9zZUVkaXRvcihwYW5lLmlucHV0KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdHlwZWQgZWRpdG9yLCBvcHRpb25zIChvdmVycmlkZTogVEVTVF9FRElUT1JfSU5QVVRfSUQsIHN0aWNreTogdHJ1ZSwgcHJlc2VydmVGb2N1czogdHJ1ZSksIG5vIGdyb3VwXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IHR5cGVkRWRpdG9yID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZmlsZS5lZGl0b3Itc2VydmljZS1vdmVycmlkZS10ZXN0cycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0XHRcdGNvbnN0IHBhbmUgPSBhd2FpdCBvcGVuRWRpdG9yKHsgZWRpdG9yOiB0eXBlZEVkaXRvciwgb3B0aW9uczogeyBzdGlja3k6IHRydWUsIHByZXNlcnZlRm9jdXM6IHRydWUsIG92ZXJyaWRlOiBURVNUX0VESVRPUl9JTlBVVF9JRCB9IH0pO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYW5lPy5ncm91cCwgcm9vdEdyb3VwKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHBhbmUuaW5wdXQgaW5zdGFuY2VvZiBUZXN0RmlsZUVkaXRvcklucHV0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhbmUuaW5wdXQucmVzb3VyY2UudG9TdHJpbmcoKSwgdHlwZWRFZGl0b3IucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYW5lLmdyb3VwLmlzU3RpY2t5KHBhbmUuaW5wdXQpLCB0cnVlKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yRmFjdG9yeUNhbGxlZCwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnRpdGxlZEVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZkVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXG5cdFx0XHRcdGFzc2VydC5vayghbGFzdEVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQub2soIWxhc3RVbnRpdGxlZEVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQub2soIWxhc3REaWZmRWRpdG9yRmFjdG9yeUVkaXRvcik7XG5cblx0XHRcdFx0YXdhaXQgcmVzZXRUZXN0U3RhdGUoKTtcblx0XHRcdFx0YXdhaXQgcGFydC5hY3RpdmVHcm91cC5jbG9zZUVkaXRvcihwYW5lLmlucHV0KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdHlwZWQgZWRpdG9yLCBubyBvcHRpb25zLCBTSURFX0dST1VQXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IHR5cGVkRWRpdG9yID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZmlsZS5lZGl0b3Itc2VydmljZS1vdmVycmlkZS10ZXN0cycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0XHRcdGNvbnN0IHBhbmUgPSBhd2FpdCBvcGVuRWRpdG9yKHsgZWRpdG9yOiB0eXBlZEVkaXRvciB9LCBTSURFX0dST1VQKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXNzb3IuZWRpdG9yR3JvdXBTZXJ2aWNlLmdyb3Vwcy5sZW5ndGgsIDIpO1xuXHRcdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwocGFuZT8uZ3JvdXAsIHJvb3RHcm91cCk7XG5cdFx0XHRcdGFzc2VydC5vayhwYW5lPy5pbnB1dCBpbnN0YW5jZW9mIFRlc3RGaWxlRWRpdG9ySW5wdXQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFuZT8uaW5wdXQucmVzb3VyY2UudG9TdHJpbmcoKSwgdHlwZWRFZGl0b3IucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW50aXRsZWRFZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZFZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblxuXHRcdFx0XHRhc3NlcnQub2soIWxhc3RFZGl0b3JGYWN0b3J5RWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCFsYXN0VW50aXRsZWRFZGl0b3JGYWN0b3J5RWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCFsYXN0RGlmZkVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXG5cdFx0XHRcdGF3YWl0IHJlc2V0VGVzdFN0YXRlKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHR5cGVkIGVkaXRvciwgb3B0aW9ucyAobm8gb3ZlcnJpZGUpLCBTSURFX0dST1VQXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IHR5cGVkRWRpdG9yID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZmlsZS5lZGl0b3Itc2VydmljZS1vdmVycmlkZS10ZXN0cycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0XHRcdGNvbnN0IHBhbmUgPSBhd2FpdCBvcGVuRWRpdG9yKHsgZWRpdG9yOiB0eXBlZEVkaXRvciB9LCBTSURFX0dST1VQKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXNzb3IuZWRpdG9yR3JvdXBTZXJ2aWNlLmdyb3Vwcy5sZW5ndGgsIDIpO1xuXHRcdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwocGFuZT8uZ3JvdXAsIHJvb3RHcm91cCk7XG5cdFx0XHRcdGFzc2VydC5vayhwYW5lPy5pbnB1dCBpbnN0YW5jZW9mIFRlc3RGaWxlRWRpdG9ySW5wdXQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFuZS5pbnB1dC5yZXNvdXJjZS50b1N0cmluZygpLCB0eXBlZEVkaXRvci5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yRmFjdG9yeUNhbGxlZCwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnRpdGxlZEVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZkVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXG5cdFx0XHRcdGFzc2VydC5vayghbGFzdEVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQub2soIWxhc3RVbnRpdGxlZEVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQub2soIWxhc3REaWZmRWRpdG9yRmFjdG9yeUVkaXRvcik7XG5cblx0XHRcdFx0YXdhaXQgcmVzZXRUZXN0U3RhdGUoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBVbnR5cGVkIHVudGl0bGVkXG5cdFx0e1xuXHRcdFx0Ly8gdW50eXBlZCB1bnRpdGxlZCBlZGl0b3IsIG5vIG9wdGlvbnMsIG5vIGdyb3VwXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IHVudHlwZWRFZGl0b3I6IElVbnRpdGxlZFRleHRSZXNvdXJjZUVkaXRvcklucHV0ID0geyByZXNvdXJjZTogdW5kZWZpbmVkLCBvcHRpb25zOiB7IG92ZXJyaWRlOiBURVNUX0VESVRPUl9JTlBVVF9JRCB9IH07XG5cdFx0XHRcdGNvbnN0IHBhbmUgPSBhd2FpdCBvcGVuRWRpdG9yKHVudHlwZWRFZGl0b3IpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYW5lPy5ncm91cCwgcm9vdEdyb3VwKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHBhbmUuaW5wdXQgaW5zdGFuY2VvZiBUZXN0RmlsZUVkaXRvcklucHV0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhbmUuaW5wdXQucmVzb3VyY2Uuc2NoZW1lLCAndW50aXRsZWQnKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yRmFjdG9yeUNhbGxlZCwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnRpdGxlZEVkaXRvckZhY3RvcnlDYWxsZWQsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZkVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXG5cdFx0XHRcdGFzc2VydC5vayghbGFzdEVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdFVudGl0bGVkRWRpdG9yRmFjdG9yeUVkaXRvciwgdW50eXBlZEVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5vayghbGFzdERpZmZFZGl0b3JGYWN0b3J5RWRpdG9yKTtcblxuXHRcdFx0XHRhd2FpdCByZXNldFRlc3RTdGF0ZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB1bnR5cGVkIHVudGl0bGVkIGVkaXRvciwgbm8gb3B0aW9ucywgU0lERV9HUk9VUFxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCB1bnR5cGVkRWRpdG9yOiBJVW50aXRsZWRUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCA9IHsgcmVzb3VyY2U6IHVuZGVmaW5lZCwgb3B0aW9uczogeyBvdmVycmlkZTogVEVTVF9FRElUT1JfSU5QVVRfSUQgfSB9O1xuXHRcdFx0XHRjb25zdCBwYW5lID0gYXdhaXQgb3BlbkVkaXRvcih1bnR5cGVkRWRpdG9yLCBTSURFX0dST1VQKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXNzb3IuZWRpdG9yR3JvdXBTZXJ2aWNlLmdyb3Vwcy5sZW5ndGgsIDIpO1xuXHRcdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwocGFuZT8uZ3JvdXAsIHJvb3RHcm91cCk7XG5cdFx0XHRcdGFzc2VydC5vayhwYW5lPy5pbnB1dCBpbnN0YW5jZW9mIFRlc3RGaWxlRWRpdG9ySW5wdXQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFuZT8uaW5wdXQucmVzb3VyY2Uuc2NoZW1lLCAndW50aXRsZWQnKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yRmFjdG9yeUNhbGxlZCwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnRpdGxlZEVkaXRvckZhY3RvcnlDYWxsZWQsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZkVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXG5cdFx0XHRcdGFzc2VydC5vayghbGFzdEVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdFVudGl0bGVkRWRpdG9yRmFjdG9yeUVkaXRvciwgdW50eXBlZEVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5vayghbGFzdERpZmZFZGl0b3JGYWN0b3J5RWRpdG9yKTtcblxuXHRcdFx0XHRhd2FpdCByZXNldFRlc3RTdGF0ZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB1bnR5cGVkIHVudGl0bGVkIGVkaXRvciB3aXRoIGFzc29jaWF0ZWQgcmVzb3VyY2UsIG5vIG9wdGlvbnMsIG5vIGdyb3VwXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IHVudHlwZWRFZGl0b3I6IElVbnRpdGxlZFRleHRSZXNvdXJjZUVkaXRvcklucHV0ID0geyByZXNvdXJjZTogVVJJLmZpbGUoJ2ZpbGUtb3JpZ2luYWwuZWRpdG9yLXNlcnZpY2Utb3ZlcnJpZGUtdGVzdHMnKS53aXRoKHsgc2NoZW1lOiAndW50aXRsZWQnIH0pIH07XG5cdFx0XHRcdGNvbnN0IHBhbmUgPSBhd2FpdCBvcGVuRWRpdG9yKHVudHlwZWRFZGl0b3IpO1xuXHRcdFx0XHRjb25zdCB0eXBlZEVkaXRvciA9IHBhbmU/LmlucHV0O1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYW5lPy5ncm91cCwgcm9vdEdyb3VwKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHR5cGVkRWRpdG9yIGluc3RhbmNlb2YgVGVzdEZpbGVFZGl0b3JJbnB1dCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlZEVkaXRvci5yZXNvdXJjZS5zY2hlbWUsICd1bnRpdGxlZCcpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVudGl0bGVkRWRpdG9yRmFjdG9yeUNhbGxlZCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmRWRpdG9yRmFjdG9yeUNhbGxlZCwgMCk7XG5cblx0XHRcdFx0YXNzZXJ0Lm9rKCFsYXN0RWRpdG9yRmFjdG9yeUVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0VW50aXRsZWRFZGl0b3JGYWN0b3J5RWRpdG9yLCB1bnR5cGVkRWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCFsYXN0RGlmZkVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXG5cdFx0XHRcdC8vIG9wZW5pbmcgdGhlIHNhbWUgZWRpdG9yIHNob3VsZCBub3QgY3JlYXRlXG5cdFx0XHRcdC8vIGEgbmV3IGVkaXRvciBpbnB1dFxuXHRcdFx0XHRhd2FpdCBvcGVuRWRpdG9yKHVudHlwZWRFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFuZT8uZ3JvdXAuYWN0aXZlRWRpdG9yLCB0eXBlZEVkaXRvcik7XG5cblx0XHRcdFx0YXdhaXQgcmVzZXRUZXN0U3RhdGUoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdW50eXBlZCB1bnRpdGxlZCBlZGl0b3IsIG9wdGlvbnMgKHN0aWNreTogdHJ1ZSwgcHJlc2VydmVGb2N1czogdHJ1ZSksIG5vIGdyb3VwXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IHVudHlwZWRFZGl0b3I6IElVbnRpdGxlZFRleHRSZXNvdXJjZUVkaXRvcklucHV0ID0geyByZXNvdXJjZTogdW5kZWZpbmVkLCBvcHRpb25zOiB7IHN0aWNreTogdHJ1ZSwgcHJlc2VydmVGb2N1czogdHJ1ZSwgb3ZlcnJpZGU6IFRFU1RfRURJVE9SX0lOUFVUX0lEIH0gfTtcblx0XHRcdFx0Y29uc3QgcGFuZSA9IGF3YWl0IG9wZW5FZGl0b3IodW50eXBlZEVkaXRvcik7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhbmU/Lmdyb3VwLCByb290R3JvdXApO1xuXHRcdFx0XHRhc3NlcnQub2socGFuZS5pbnB1dCBpbnN0YW5jZW9mIFRlc3RGaWxlRWRpdG9ySW5wdXQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFuZS5pbnB1dC5yZXNvdXJjZS5zY2hlbWUsICd1bnRpdGxlZCcpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFuZS5ncm91cC5pc1N0aWNreShwYW5lLmlucHV0KSwgdHJ1ZSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW50aXRsZWRFZGl0b3JGYWN0b3J5Q2FsbGVkLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZFZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblxuXHRcdFx0XHRhc3NlcnQub2soIWxhc3RFZGl0b3JGYWN0b3J5RWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3RVbnRpdGxlZEVkaXRvckZhY3RvcnlFZGl0b3IsIHVudHlwZWRFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGxhc3RVbnRpdGxlZEVkaXRvckZhY3RvcnlFZGl0b3IgYXMgSVVudGl0bGVkVGV4dFJlc291cmNlRWRpdG9ySW5wdXQpLm9wdGlvbnM/LnByZXNlcnZlRm9jdXMsIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGxhc3RVbnRpdGxlZEVkaXRvckZhY3RvcnlFZGl0b3IgYXMgSVVudGl0bGVkVGV4dFJlc291cmNlRWRpdG9ySW5wdXQpLm9wdGlvbnM/LnN0aWNreSwgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5vayghbGFzdERpZmZFZGl0b3JGYWN0b3J5RWRpdG9yKTtcblxuXHRcdFx0XHRhd2FpdCByZXNldFRlc3RTdGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFVudHlwZWQgZGlmZlxuXHRcdHtcblx0XHRcdC8vIHVudHlwZWQgZGlmZiBlZGl0b3IsIG5vIG9wdGlvbnMsIG5vIGdyb3VwXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IHVudHlwZWRFZGl0b3I6IElSZXNvdXJjZURpZmZFZGl0b3JJbnB1dCA9IHtcblx0XHRcdFx0XHRvcmlnaW5hbDogeyByZXNvdXJjZTogVVJJLmZpbGUoJ2ZpbGUtb3JpZ2luYWwuZWRpdG9yLXNlcnZpY2Utb3ZlcnJpZGUtdGVzdHMnKSB9LFxuXHRcdFx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBVUkkuZmlsZSgnZmlsZS1tb2RpZmllZC5lZGl0b3Itc2VydmljZS1vdmVycmlkZS10ZXN0cycpIH0sXG5cdFx0XHRcdFx0b3B0aW9uczogeyBvdmVycmlkZTogVEVTVF9FRElUT1JfSU5QVVRfSUQgfVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjb25zdCBwYW5lID0gYXdhaXQgb3BlbkVkaXRvcih1bnR5cGVkRWRpdG9yKTtcblx0XHRcdFx0Y29uc3QgdHlwZWRFZGl0b3IgPSBwYW5lPy5pbnB1dDtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFuZT8uZ3JvdXAsIHJvb3RHcm91cCk7XG5cdFx0XHRcdGFzc2VydC5vayh0eXBlZEVkaXRvciBpbnN0YW5jZW9mIFRlc3RGaWxlRWRpdG9ySW5wdXQpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVudGl0bGVkRWRpdG9yRmFjdG9yeUNhbGxlZCwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmRWRpdG9yRmFjdG9yeUNhbGxlZCwgMSk7XG5cblx0XHRcdFx0YXNzZXJ0Lm9rKCFsYXN0RWRpdG9yRmFjdG9yeUVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5vayghbGFzdFVudGl0bGVkRWRpdG9yRmFjdG9yeUVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0RGlmZkVkaXRvckZhY3RvcnlFZGl0b3IsIHVudHlwZWRFZGl0b3IpO1xuXG5cdFx0XHRcdGF3YWl0IHJlc2V0VGVzdFN0YXRlKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHVudHlwZWQgZGlmZiBlZGl0b3IsIG5vIG9wdGlvbnMsIFNJREVfR1JPVVBcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgdW50eXBlZEVkaXRvcjogSVJlc291cmNlRGlmZkVkaXRvcklucHV0ID0ge1xuXHRcdFx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBVUkkuZmlsZSgnZmlsZS1vcmlnaW5hbC5lZGl0b3Itc2VydmljZS1vdmVycmlkZS10ZXN0cycpIH0sXG5cdFx0XHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IFVSSS5maWxlKCdmaWxlLW1vZGlmaWVkLmVkaXRvci1zZXJ2aWNlLW92ZXJyaWRlLXRlc3RzJykgfSxcblx0XHRcdFx0XHRvcHRpb25zOiB7IG92ZXJyaWRlOiBURVNUX0VESVRPUl9JTlBVVF9JRCB9XG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnN0IHBhbmUgPSBhd2FpdCBvcGVuRWRpdG9yKHVudHlwZWRFZGl0b3IsIFNJREVfR1JPVVApO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY2Nlc3Nvci5lZGl0b3JHcm91cFNlcnZpY2UuZ3JvdXBzLmxlbmd0aCwgMik7XG5cdFx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChwYW5lPy5ncm91cCwgcm9vdEdyb3VwKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHBhbmU/LmlucHV0IGluc3RhbmNlb2YgVGVzdEZpbGVFZGl0b3JJbnB1dCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW50aXRsZWRFZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZFZGl0b3JGYWN0b3J5Q2FsbGVkLCAxKTtcblxuXHRcdFx0XHRhc3NlcnQub2soIWxhc3RFZGl0b3JGYWN0b3J5RWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCFsYXN0VW50aXRsZWRFZGl0b3JGYWN0b3J5RWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3REaWZmRWRpdG9yRmFjdG9yeUVkaXRvciwgdW50eXBlZEVkaXRvcik7XG5cblx0XHRcdFx0YXdhaXQgcmVzZXRUZXN0U3RhdGUoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdW50eXBlZCBkaWZmIGVkaXRvciwgb3B0aW9ucyAoc3RpY2t5OiB0cnVlLCBwcmVzZXJ2ZUZvY3VzOiB0cnVlKSwgbm8gZ3JvdXBcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgdW50eXBlZEVkaXRvcjogSVJlc291cmNlRGlmZkVkaXRvcklucHV0ID0ge1xuXHRcdFx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBVUkkuZmlsZSgnZmlsZS1vcmlnaW5hbC5lZGl0b3Itc2VydmljZS1vdmVycmlkZS10ZXN0cycpIH0sXG5cdFx0XHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IFVSSS5maWxlKCdmaWxlLW1vZGlmaWVkLmVkaXRvci1zZXJ2aWNlLW92ZXJyaWRlLXRlc3RzJykgfSxcblx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRvdmVycmlkZTogVEVTVF9FRElUT1JfSU5QVVRfSUQsIHN0aWNreTogdHJ1ZSwgcHJlc2VydmVGb2N1czogdHJ1ZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgcGFuZSA9IGF3YWl0IG9wZW5FZGl0b3IodW50eXBlZEVkaXRvcik7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhbmU/Lmdyb3VwLCByb290R3JvdXApO1xuXHRcdFx0XHRhc3NlcnQub2socGFuZS5pbnB1dCBpbnN0YW5jZW9mIFRlc3RGaWxlRWRpdG9ySW5wdXQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFuZS5ncm91cC5pc1N0aWNreShwYW5lLmlucHV0KSwgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVudGl0bGVkRWRpdG9yRmFjdG9yeUNhbGxlZCwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmRWRpdG9yRmFjdG9yeUNhbGxlZCwgMSk7XG5cblx0XHRcdFx0YXNzZXJ0Lm9rKCFsYXN0RWRpdG9yRmFjdG9yeUVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5vayghbGFzdFVudGl0bGVkRWRpdG9yRmFjdG9yeUVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0RGlmZkVkaXRvckZhY3RvcnlFZGl0b3IsIHVudHlwZWRFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGxhc3REaWZmRWRpdG9yRmFjdG9yeUVkaXRvciBhcyBJVW50aXRsZWRUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCkub3B0aW9ucz8ucHJlc2VydmVGb2N1cywgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgobGFzdERpZmZFZGl0b3JGYWN0b3J5RWRpdG9yIGFzIElVbnRpdGxlZFRleHRSZXNvdXJjZUVkaXRvcklucHV0KS5vcHRpb25zPy5zdGlja3ksIHRydWUpO1xuXG5cdFx0XHRcdGF3YWl0IHJlc2V0VGVzdFN0YXRlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gdHlwZWQgZWRpdG9yLCBub3QgcmVnaXN0ZXJlZFxuXHRcdHtcblxuXHRcdFx0Ly8gbm8gb3B0aW9ucywgbm8gZ3JvdXBcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgdHlwZWRFZGl0b3IgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmaWxlLnNvbWV0aGluZycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0XHRcdGNvbnN0IHBhbmUgPSBhd2FpdCBvcGVuRWRpdG9yKHsgZWRpdG9yOiB0eXBlZEVkaXRvciB9KTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFuZT8uZ3JvdXAsIHJvb3RHcm91cCk7XG5cdFx0XHRcdGFzc2VydC5vayhwYW5lLmlucHV0IGluc3RhbmNlb2YgVGVzdEZpbGVFZGl0b3JJbnB1dCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYW5lLmlucHV0LCB0eXBlZEVkaXRvcik7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW50aXRsZWRFZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZFZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblxuXHRcdFx0XHRhc3NlcnQub2soIWxhc3RFZGl0b3JGYWN0b3J5RWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCFsYXN0VW50aXRsZWRFZGl0b3JGYWN0b3J5RWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCFsYXN0RGlmZkVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXG5cdFx0XHRcdGF3YWl0IHJlc2V0VGVzdFN0YXRlKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIG5vIG9wdGlvbnMsIFNJREVfR1JPVVBcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgdHlwZWRFZGl0b3IgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmaWxlLnNvbWV0aGluZycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0XHRcdGNvbnN0IHBhbmUgPSBhd2FpdCBvcGVuRWRpdG9yKHsgZWRpdG9yOiB0eXBlZEVkaXRvciB9LCBTSURFX0dST1VQKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXNzb3IuZWRpdG9yR3JvdXBTZXJ2aWNlLmdyb3Vwcy5sZW5ndGgsIDIpO1xuXHRcdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwocGFuZT8uZ3JvdXAsIHJvb3RHcm91cCk7XG5cdFx0XHRcdGFzc2VydC5vayhwYW5lPy5pbnB1dCBpbnN0YW5jZW9mIFRlc3RGaWxlRWRpdG9ySW5wdXQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFuZT8uaW5wdXQsIHR5cGVkRWRpdG9yKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yRmFjdG9yeUNhbGxlZCwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnRpdGxlZEVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZkVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXG5cdFx0XHRcdGFzc2VydC5vayghbGFzdEVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQub2soIWxhc3RVbnRpdGxlZEVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQub2soIWxhc3REaWZmRWRpdG9yRmFjdG9yeUVkaXRvcik7XG5cblx0XHRcdFx0YXdhaXQgcmVzZXRUZXN0U3RhdGUoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyB0eXBlZCBlZGl0b3IsIG5vdCBzdXBwb3J0aW5nIGB0b1VudHlwZWRgXG5cdFx0e1xuXG5cdFx0XHQvLyBubyBvcHRpb25zLCBubyBncm91cFxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCB0eXBlZEVkaXRvciA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2ZpbGUuc29tZXRoaW5nJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRcdFx0dHlwZWRFZGl0b3IuZGlzYWJsZVRvVW50eXBlZCA9IHRydWU7XG5cdFx0XHRcdGNvbnN0IHBhbmUgPSBhd2FpdCBvcGVuRWRpdG9yKHsgZWRpdG9yOiB0eXBlZEVkaXRvciB9KTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFuZT8uZ3JvdXAsIHJvb3RHcm91cCk7XG5cdFx0XHRcdGFzc2VydC5vayhwYW5lLmlucHV0IGluc3RhbmNlb2YgVGVzdEZpbGVFZGl0b3JJbnB1dCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYW5lLmlucHV0LCB0eXBlZEVkaXRvcik7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW50aXRsZWRFZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZFZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblxuXHRcdFx0XHRhc3NlcnQub2soIWxhc3RFZGl0b3JGYWN0b3J5RWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCFsYXN0VW50aXRsZWRFZGl0b3JGYWN0b3J5RWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCFsYXN0RGlmZkVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXG5cdFx0XHRcdGF3YWl0IHJlc2V0VGVzdFN0YXRlKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIG5vIG9wdGlvbnMsIFNJREVfR1JPVVBcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgdHlwZWRFZGl0b3IgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmaWxlLnNvbWV0aGluZycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0XHRcdHR5cGVkRWRpdG9yLmRpc2FibGVUb1VudHlwZWQgPSB0cnVlO1xuXHRcdFx0XHRjb25zdCBwYW5lID0gYXdhaXQgb3BlbkVkaXRvcih7IGVkaXRvcjogdHlwZWRFZGl0b3IgfSwgU0lERV9HUk9VUCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLmVkaXRvckdyb3VwU2VydmljZS5ncm91cHMubGVuZ3RoLCAyKTtcblx0XHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHBhbmU/Lmdyb3VwLCByb290R3JvdXApO1xuXHRcdFx0XHRhc3NlcnQub2socGFuZT8uaW5wdXQgaW5zdGFuY2VvZiBUZXN0RmlsZUVkaXRvcklucHV0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhbmU/LmlucHV0LCB0eXBlZEVkaXRvcik7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvckZhY3RvcnlDYWxsZWQsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW50aXRsZWRFZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZFZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblxuXHRcdFx0XHRhc3NlcnQub2soIWxhc3RFZGl0b3JGYWN0b3J5RWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCFsYXN0VW50aXRsZWRFZGl0b3JGYWN0b3J5RWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCFsYXN0RGlmZkVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXG5cdFx0XHRcdGF3YWl0IHJlc2V0VGVzdFN0YXRlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gb3BlbkVkaXRvcnMgd2l0aCA+MSBlZGl0b3Jcblx0XHRpZiAodXNlT3BlbkVkaXRvcnMpIHtcblxuXHRcdFx0Ly8gbWl4IG9mIHVudHlwZWQgYW5kIHR5cGVkIGVkaXRvcnNcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgdW50eXBlZEVkaXRvcjE6IElSZXNvdXJjZUVkaXRvcklucHV0ID0geyByZXNvdXJjZTogVVJJLmZpbGUoJ2ZpbGUxLmVkaXRvci1zZXJ2aWNlLW92ZXJyaWRlLXRlc3RzJykgfTtcblx0XHRcdFx0Y29uc3QgdW50eXBlZEVkaXRvcjI6IElSZXNvdXJjZUVkaXRvcklucHV0ID0geyByZXNvdXJjZTogVVJJLmZpbGUoJ2ZpbGUyLmVkaXRvci1zZXJ2aWNlLW92ZXJyaWRlLXRlc3RzJykgfTtcblx0XHRcdFx0Y29uc3QgdW50eXBlZEVkaXRvcjM6IEVkaXRvcklucHV0V2l0aE9wdGlvbnMgPSB7IGVkaXRvcjogY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZmlsZTMuZWRpdG9yLXNlcnZpY2Utb3ZlcnJpZGUtdGVzdHMnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpIH07XG5cdFx0XHRcdGNvbnN0IHVudHlwZWRFZGl0b3I0OiBFZGl0b3JJbnB1dFdpdGhPcHRpb25zID0geyBlZGl0b3I6IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2ZpbGU0LmVkaXRvci1zZXJ2aWNlLW92ZXJyaWRlLXRlc3RzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKSB9O1xuXHRcdFx0XHRjb25zdCB1bnR5cGVkRWRpdG9yNTogSVJlc291cmNlRWRpdG9ySW5wdXQgPSB7IHJlc291cmNlOiBVUkkuZmlsZSgnZmlsZTUuZWRpdG9yLXNlcnZpY2Utb3ZlcnJpZGUtdGVzdHMnKSB9O1xuXHRcdFx0XHRjb25zdCBwYW5lID0gKGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcnMoW3VudHlwZWRFZGl0b3IxLCB1bnR5cGVkRWRpdG9yMiwgdW50eXBlZEVkaXRvcjMsIHVudHlwZWRFZGl0b3I0LCB1bnR5cGVkRWRpdG9yNV0pKVswXTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFuZT8uZ3JvdXAsIHJvb3RHcm91cCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYW5lPy5ncm91cC5jb3VudCwgNSk7XG5cblx0XHRcdFx0Ly8gT25seSB0aGUgdW50eXBlZCBlZGl0b3JzIHNob3VsZCBoYXZlIGhhZCBmYWN0b3JpZXMgY2FsbGVkICgzIHVudHlwZWQgZWRpdG9ycylcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvckZhY3RvcnlDYWxsZWQsIDMpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW50aXRsZWRFZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZFZGl0b3JGYWN0b3J5Q2FsbGVkLCAwKTtcblxuXHRcdFx0XHRhc3NlcnQub2sobGFzdEVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQub2soIWxhc3RVbnRpdGxlZEVkaXRvckZhY3RvcnlFZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQub2soIWxhc3REaWZmRWRpdG9yRmFjdG9yeUVkaXRvcik7XG5cblx0XHRcdFx0YXdhaXQgcmVzZXRUZXN0U3RhdGUoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyB1bnR5cGVkIGRlZmF1bHQgZWRpdG9yXG5cdFx0e1xuXHRcdFx0Ly8gdW50eXBlZCBkZWZhdWx0IGVkaXRvciwgb3B0aW9uczogcmV2ZWFsSWZWaXNpYmxlXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IHVudHlwZWRFZGl0b3IxOiBJUmVzb3VyY2VFZGl0b3JJbnB1dCA9IHsgcmVzb3VyY2U6IFVSSS5maWxlKCdmaWxlLTEnKSwgb3B0aW9uczogeyByZXZlYWxJZlZpc2libGU6IHRydWUsIHBpbm5lZDogdHJ1ZSB9IH07XG5cdFx0XHRcdGNvbnN0IHVudHlwZWRFZGl0b3IyOiBJUmVzb3VyY2VFZGl0b3JJbnB1dCA9IHsgcmVzb3VyY2U6IFVSSS5maWxlKCdmaWxlLTInKSwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9O1xuXG5cdFx0XHRcdGNvbnN0IHJvb3RQYW5lID0gYXdhaXQgb3BlbkVkaXRvcih1bnR5cGVkRWRpdG9yMSk7XG5cdFx0XHRcdGNvbnN0IHNpZGVQYW5lID0gYXdhaXQgb3BlbkVkaXRvcih1bnR5cGVkRWRpdG9yMiwgU0lERV9HUk9VUCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3RQYW5lPy5ncm91cC5jb3VudCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaWRlUGFuZT8uZ3JvdXAuY291bnQsIDEpO1xuXG5cdFx0XHRcdGFjY2Vzc29yLmVkaXRvckdyb3VwU2VydmljZS5hY3RpdmF0ZUdyb3VwKHNpZGVQYW5lLmdyb3VwKTtcblxuXHRcdFx0XHRhd2FpdCBvcGVuRWRpdG9yKHVudHlwZWRFZGl0b3IxKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdFBhbmU/Lmdyb3VwLmNvdW50LCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNpZGVQYW5lPy5ncm91cC5jb3VudCwgMSk7XG5cblx0XHRcdFx0YXdhaXQgcmVzZXRUZXN0U3RhdGUoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdW50eXBlZCBkZWZhdWx0IGVkaXRvciwgb3B0aW9uczogcmV2ZWFsSWZPcGVuZWRcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgdW50eXBlZEVkaXRvcjE6IElSZXNvdXJjZUVkaXRvcklucHV0ID0geyByZXNvdXJjZTogVVJJLmZpbGUoJ2ZpbGUtMScpLCBvcHRpb25zOiB7IHJldmVhbElmT3BlbmVkOiB0cnVlLCBwaW5uZWQ6IHRydWUgfSB9O1xuXHRcdFx0XHRjb25zdCB1bnR5cGVkRWRpdG9yMjogSVJlc291cmNlRWRpdG9ySW5wdXQgPSB7IHJlc291cmNlOiBVUkkuZmlsZSgnZmlsZS0yJyksIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfTtcblxuXHRcdFx0XHRjb25zdCByb290UGFuZSA9IGF3YWl0IG9wZW5FZGl0b3IodW50eXBlZEVkaXRvcjEpO1xuXHRcdFx0XHRhd2FpdCBvcGVuRWRpdG9yKHVudHlwZWRFZGl0b3IyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3RQYW5lPy5ncm91cC5hY3RpdmVFZGl0b3I/LnJlc291cmNlPy50b1N0cmluZygpLCB1bnR5cGVkRWRpdG9yMi5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0Y29uc3Qgc2lkZVBhbmUgPSBhd2FpdCBvcGVuRWRpdG9yKHVudHlwZWRFZGl0b3IyLCBTSURFX0dST1VQKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdFBhbmU/Lmdyb3VwLmNvdW50LCAyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNpZGVQYW5lPy5ncm91cC5jb3VudCwgMSk7XG5cblx0XHRcdFx0YWNjZXNzb3IuZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2YXRlR3JvdXAoc2lkZVBhbmUuZ3JvdXApO1xuXG5cdFx0XHRcdGF3YWl0IG9wZW5FZGl0b3IodW50eXBlZEVkaXRvcjEpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290UGFuZT8uZ3JvdXAuY291bnQsIDIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2lkZVBhbmU/Lmdyb3VwLmNvdW50LCAxKTtcblxuXHRcdFx0XHRhd2FpdCByZXNldFRlc3RTdGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHRlc3QoJ29wZW5FZGl0b3IoKSBhcHBsaWVzIG9wdGlvbnMgaWYgZWRpdG9yIGFscmVhZHkgb3BlbmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RlclRlc3RGaWxlRWRpdG9yKCkpO1xuXG5cdFx0Y29uc3QgWywgc2VydmljZSwgYWNjZXNzb3JdID0gYXdhaXQgY3JlYXRlRWRpdG9yU2VydmljZSgpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjY2Vzc29yLmVkaXRvclJlc29sdmVyU2VydmljZS5yZWdpc3RlckVkaXRvcihcblx0XHRcdCcqLmVkaXRvci1zZXJ2aWNlLW92ZXJyaWRlLXRlc3RzJyxcblx0XHRcdHsgaWQ6IFRFU1RfRURJVE9SX0lOUFVUX0lELCBsYWJlbDogJ0xhYmVsJywgcHJpb3JpdHk6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5leGNsdXNpdmUgfSxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogZWRpdG9yID0+ICh7IGVkaXRvcjogY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChlZGl0b3IucmVzb3VyY2UsIFRFU1RfRURJVE9SX0lOUFVUX0lEKSB9KVxuXHRcdFx0fVxuXHRcdCkpO1xuXG5cdFx0Ly8gVHlwZWQgZWRpdG9yXG5cdFx0bGV0IHBhbmUgPSBhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2Utb3BlbkVkaXRvcnMnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpKTtcblx0XHRwYW5lID0gYXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlLW9wZW5FZGl0b3JzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKSwgeyBzdGlja3k6IHRydWUsIHByZXNlcnZlRm9jdXM6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFuZT8ub3B0aW9ucz8uc3RpY2t5LCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFuZT8ub3B0aW9ucz8ucHJlc2VydmVGb2N1cywgdHJ1ZSk7XG5cblx0XHRhd2FpdCBwYW5lLmdyb3VwLmNsb3NlQWxsRWRpdG9ycygpO1xuXG5cdFx0Ly8gVW50eXBlZCBlZGl0b3IgKHdpdGhvdXQgcmVnaXN0ZXJlZCBlZGl0b3IpXG5cdFx0cGFuZSA9IGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBVUkkuZmlsZSgncmVzb3VyY2Utb3BlbkVkaXRvcnMnKSB9KTtcblx0XHRwYW5lID0gYXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IFVSSS5maWxlKCdyZXNvdXJjZS1vcGVuRWRpdG9ycycpLCBvcHRpb25zOiB7IHN0aWNreTogdHJ1ZSwgcHJlc2VydmVGb2N1czogdHJ1ZSB9IH0pO1xuXG5cdFx0YXNzZXJ0Lm9rKHBhbmUgaW5zdGFuY2VvZiBUZXN0VGV4dEZpbGVFZGl0b3IpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYW5lPy5vcHRpb25zPy5zdGlja3ksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYW5lPy5vcHRpb25zPy5wcmVzZXJ2ZUZvY3VzLCB0cnVlKTtcblxuXHRcdC8vIFVudHlwZWQgZWRpdG9yICh3aXRoIHJlZ2lzdGVyZWQgZWRpdG9yKVxuXHRcdHBhbmUgPSBhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogVVJJLmZpbGUoJ2ZpbGUuZWRpdG9yLXNlcnZpY2Utb3ZlcnJpZGUtdGVzdHMnKSB9KTtcblx0XHRwYW5lID0gYXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IFVSSS5maWxlKCdmaWxlLmVkaXRvci1zZXJ2aWNlLW92ZXJyaWRlLXRlc3RzJyksIG9wdGlvbnM6IHsgc3RpY2t5OiB0cnVlLCBwcmVzZXJ2ZUZvY3VzOiB0cnVlIH0gfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFuZT8ub3B0aW9ucz8uc3RpY2t5LCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFuZT8ub3B0aW9ucz8ucHJlc2VydmVGb2N1cywgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzT3BlbigpIHdpdGggc2lkZSBieSBzaWRlIGVkaXRvcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydCwgc2VydmljZV0gPSBhd2FpdCBjcmVhdGVFZGl0b3JTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCBpbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlLW9wZW5FZGl0b3JzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBvdGhlcklucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UyLW9wZW5FZGl0b3JzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBzaWRlQnlTaWRlSW5wdXQgPSBuZXcgU2lkZUJ5U2lkZUVkaXRvcklucHV0KCdzaWRlQnlTaWRlJywgJycsIGlucHV0LCBvdGhlcklucHV0LCBzZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGVkaXRvcjEgPSBhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3Ioc2lkZUJ5U2lkZUlucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5hY3RpdmVHcm91cC5jb3VudCwgMSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pc09wZW5lZChpbnB1dCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pc09wZW5lZChvdGhlcklucHV0KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaXNPcGVuZWQoeyByZXNvdXJjZTogaW5wdXQucmVzb3VyY2UsIHR5cGVJZDogaW5wdXQudHlwZUlkLCBlZGl0b3JJZDogaW5wdXQuZWRpdG9ySWQgfSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pc09wZW5lZCh7IHJlc291cmNlOiBvdGhlcklucHV0LnJlc291cmNlLCB0eXBlSWQ6IG90aGVySW5wdXQudHlwZUlkLCBlZGl0b3JJZDogb3RoZXJJbnB1dC5lZGl0b3JJZCB9KSwgdHJ1ZSk7XG5cblx0XHRjb25zdCBlZGl0b3IyID0gYXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGlucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5hY3RpdmVHcm91cC5jb3VudCwgMik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pc09wZW5lZChpbnB1dCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmlzT3BlbmVkKG90aGVySW5wdXQpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pc09wZW5lZCh7IHJlc291cmNlOiBpbnB1dC5yZXNvdXJjZSwgdHlwZUlkOiBpbnB1dC50eXBlSWQsIGVkaXRvcklkOiBpbnB1dC5lZGl0b3JJZCB9KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaXNPcGVuZWQoeyByZXNvdXJjZTogb3RoZXJJbnB1dC5yZXNvdXJjZSwgdHlwZUlkOiBvdGhlcklucHV0LnR5cGVJZCwgZWRpdG9ySWQ6IG90aGVySW5wdXQuZWRpdG9ySWQgfSksIHRydWUpO1xuXG5cdFx0YXdhaXQgZWRpdG9yMj8uZ3JvdXAuY2xvc2VFZGl0b3IoaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLmNvdW50LCAxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmlzT3BlbmVkKGlucHV0KSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmlzT3BlbmVkKG90aGVySW5wdXQpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pc09wZW5lZCh7IHJlc291cmNlOiBpbnB1dC5yZXNvdXJjZSwgdHlwZUlkOiBpbnB1dC50eXBlSWQsIGVkaXRvcklkOiBpbnB1dC5lZGl0b3JJZCB9KSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmlzT3BlbmVkKHsgcmVzb3VyY2U6IG90aGVySW5wdXQucmVzb3VyY2UsIHR5cGVJZDogb3RoZXJJbnB1dC50eXBlSWQsIGVkaXRvcklkOiBvdGhlcklucHV0LmVkaXRvcklkIH0pLCB0cnVlKTtcblxuXHRcdGF3YWl0IGVkaXRvcjE/Lmdyb3VwLmNsb3NlRWRpdG9yKHNpZGVCeVNpZGVJbnB1dCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pc09wZW5lZChpbnB1dCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pc09wZW5lZChvdGhlcklucHV0KSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmlzT3BlbmVkKHsgcmVzb3VyY2U6IGlucHV0LnJlc291cmNlLCB0eXBlSWQ6IGlucHV0LnR5cGVJZCwgZWRpdG9ySWQ6IGlucHV0LmVkaXRvcklkIH0pLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaXNPcGVuZWQoeyByZXNvdXJjZTogb3RoZXJJbnB1dC5yZXNvdXJjZSwgdHlwZUlkOiBvdGhlcklucHV0LnR5cGVJZCwgZWRpdG9ySWQ6IG90aGVySW5wdXQuZWRpdG9ySWQgfSksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnb3BlbkVkaXRvcnMoKSAvIHJlcGxhY2VFZGl0b3JzKCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnQsIHNlcnZpY2VdID0gYXdhaXQgY3JlYXRlRWRpdG9yU2VydmljZSgpO1xuXG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZS1vcGVuRWRpdG9ycycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3Qgb3RoZXJJbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlMi1vcGVuRWRpdG9ycycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgcmVwbGFjZUlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UzLW9wZW5FZGl0b3JzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdC8vIE9wZW4gZWRpdG9yc1xuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcnMoW3sgZWRpdG9yOiBpbnB1dCB9LCB7IGVkaXRvcjogb3RoZXJJbnB1dCB9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuYWN0aXZlR3JvdXAuY291bnQsIDIpO1xuXG5cdFx0Ly8gUmVwbGFjZSBlZGl0b3JzXG5cdFx0YXdhaXQgc2VydmljZS5yZXBsYWNlRWRpdG9ycyhbeyBlZGl0b3I6IGlucHV0LCByZXBsYWNlbWVudDogcmVwbGFjZUlucHV0IH1dLCBwYXJ0LmFjdGl2ZUdyb3VwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5hY3RpdmVHcm91cC5jb3VudCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuYWN0aXZlR3JvdXAuZ2V0SW5kZXhPZkVkaXRvcihyZXBsYWNlSW5wdXQpLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnb3BlbkVkaXRvcnMoKSBoYW5kbGVzIHdvcmtzcGFjZSB0cnVzdCAodHlwZWQgZWRpdG9ycyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnQsIHNlcnZpY2UsIGFjY2Vzc29yXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclNlcnZpY2UoKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlMS1vcGVuRWRpdG9ycycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UyLW9wZW5FZGl0b3JzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGNvbnN0IGlucHV0MyA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlMy1vcGVuRWRpdG9ycycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQ0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2U0LW9wZW5FZGl0b3JzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBzaWRlQnlTaWRlSW5wdXQgPSBuZXcgU2lkZUJ5U2lkZUVkaXRvcklucHV0KCdzaWRlIGJ5IHNpZGUnLCB1bmRlZmluZWQsIGlucHV0MywgaW5wdXQ0LCBzZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG9sZEhhbmRsZXIgPSBhY2Nlc3Nvci53b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLnJlcXVlc3RPcGVuVXJpc0hhbmRsZXI7XG5cblx0XHR0cnkge1xuXG5cdFx0XHQvLyBUcnVzdDogY2FuY2VsXG5cdFx0XHRsZXQgdHJ1c3RFZGl0b3JVcmlzOiBVUklbXSA9IFtdO1xuXHRcdFx0YWNjZXNzb3Iud29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5yZXF1ZXN0T3BlblVyaXNIYW5kbGVyID0gYXN5bmMgdXJpcyA9PiB7XG5cdFx0XHRcdHRydXN0RWRpdG9yVXJpcyA9IHVyaXM7XG5cdFx0XHRcdHJldHVybiBXb3Jrc3BhY2VUcnVzdFVyaVJlc3BvbnNlLkNhbmNlbDtcblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcnMoW3sgZWRpdG9yOiBpbnB1dDEgfSwgeyBlZGl0b3I6IGlucHV0MiB9LCB7IGVkaXRvcjogc2lkZUJ5U2lkZUlucHV0IH1dLCB1bmRlZmluZWQsIHsgdmFsaWRhdGVUcnVzdDogdHJ1ZSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLmNvdW50LCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cnVzdEVkaXRvclVyaXMubGVuZ3RoLCA0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cnVzdEVkaXRvclVyaXMuc29tZSh1cmkgPT4gdXJpLnRvU3RyaW5nKCkgPT09IGlucHV0MS5yZXNvdXJjZS50b1N0cmluZygpKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJ1c3RFZGl0b3JVcmlzLnNvbWUodXJpID0+IHVyaS50b1N0cmluZygpID09PSBpbnB1dDIucmVzb3VyY2UudG9TdHJpbmcoKSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRydXN0RWRpdG9yVXJpcy5zb21lKHVyaSA9PiB1cmkudG9TdHJpbmcoKSA9PT0gaW5wdXQzLnJlc291cmNlLnRvU3RyaW5nKCkpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cnVzdEVkaXRvclVyaXMuc29tZSh1cmkgPT4gdXJpLnRvU3RyaW5nKCkgPT09IGlucHV0NC5yZXNvdXJjZS50b1N0cmluZygpKSwgdHJ1ZSk7XG5cblx0XHRcdC8vIFRydXN0OiBvcGVuIGluIG5ldyB3aW5kb3dcblx0XHRcdGFjY2Vzc29yLndvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UucmVxdWVzdE9wZW5VcmlzSGFuZGxlciA9IGFzeW5jIHVyaXMgPT4gV29ya3NwYWNlVHJ1c3RVcmlSZXNwb25zZS5PcGVuSW5OZXdXaW5kb3c7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcnMoW3sgZWRpdG9yOiBpbnB1dDEgfSwgeyBlZGl0b3I6IGlucHV0MiB9LCB7IGVkaXRvcjogc2lkZUJ5U2lkZUlucHV0IH1dLCB1bmRlZmluZWQsIHsgdmFsaWRhdGVUcnVzdDogdHJ1ZSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLmNvdW50LCAwKTtcblxuXHRcdFx0Ly8gVHJ1c3Q6IGFsbG93XG5cdFx0XHRhY2Nlc3Nvci53b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLnJlcXVlc3RPcGVuVXJpc0hhbmRsZXIgPSBhc3luYyB1cmlzID0+IFdvcmtzcGFjZVRydXN0VXJpUmVzcG9uc2UuT3BlbjtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5vcGVuRWRpdG9ycyhbeyBlZGl0b3I6IGlucHV0MSB9LCB7IGVkaXRvcjogaW5wdXQyIH0sIHsgZWRpdG9yOiBzaWRlQnlTaWRlSW5wdXQgfV0sIHVuZGVmaW5lZCwgeyB2YWxpZGF0ZVRydXN0OiB0cnVlIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuYWN0aXZlR3JvdXAuY291bnQsIDMpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhY2Nlc3Nvci53b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLnJlcXVlc3RPcGVuVXJpc0hhbmRsZXIgPSBvbGRIYW5kbGVyO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnb3BlbkVkaXRvcnMoKSBpZ25vcmVzIHRydXN0IHdoZW4gYHZhbGlkYXRlVHJ1c3Q6IGZhbHNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0LCBzZXJ2aWNlLCBhY2Nlc3Nvcl0gPSBhd2FpdCBjcmVhdGVFZGl0b3JTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZTEtb3BlbkVkaXRvcnMnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0MiA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlMi1vcGVuRWRpdG9ycycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRjb25zdCBpbnB1dDMgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZTMtb3BlbkVkaXRvcnMnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0NCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlNC1vcGVuRWRpdG9ycycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3Qgc2lkZUJ5U2lkZUlucHV0ID0gbmV3IFNpZGVCeVNpZGVFZGl0b3JJbnB1dCgnc2lkZSBieSBzaWRlJywgdW5kZWZpbmVkLCBpbnB1dDMsIGlucHV0NCwgc2VydmljZSk7XG5cblx0XHRjb25zdCBvbGRIYW5kbGVyID0gYWNjZXNzb3Iud29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5yZXF1ZXN0T3BlblVyaXNIYW5kbGVyO1xuXG5cdFx0dHJ5IHtcblxuXHRcdFx0Ly8gVHJ1c3Q6IGNhbmNlbFxuXHRcdFx0YWNjZXNzb3Iud29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5yZXF1ZXN0T3BlblVyaXNIYW5kbGVyID0gYXN5bmMgdXJpcyA9PiBXb3Jrc3BhY2VUcnVzdFVyaVJlc3BvbnNlLkNhbmNlbDtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5vcGVuRWRpdG9ycyhbeyBlZGl0b3I6IGlucHV0MSB9LCB7IGVkaXRvcjogaW5wdXQyIH0sIHsgZWRpdG9yOiBzaWRlQnlTaWRlSW5wdXQgfV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuYWN0aXZlR3JvdXAuY291bnQsIDMpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhY2Nlc3Nvci53b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLnJlcXVlc3RPcGVuVXJpc0hhbmRsZXIgPSBvbGRIYW5kbGVyO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnb3BlbkVkaXRvcnMoKSBleHRyYWN0cyBwcm9wZXIgcmVzb3VyY2VzIGZyb20gdW50eXBlZCBlZGl0b3JzIGZvciB3b3Jrc3BhY2UgdHJ1c3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgWywgc2VydmljZSwgYWNjZXNzb3JdID0gYXdhaXQgY3JlYXRlRWRpdG9yU2VydmljZSgpO1xuXG5cdFx0Y29uc3QgaW5wdXQgPSB7IHJlc291cmNlOiBVUkkuZmlsZSgncmVzb3VyY2Utb3BlbkVkaXRvcnMnKSB9O1xuXHRcdGNvbnN0IG90aGVySW5wdXQ6IElSZXNvdXJjZURpZmZFZGl0b3JJbnB1dCA9IHtcblx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UyLW9wZW5FZGl0b3JzJykgfSxcblx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UzLW9wZW5FZGl0b3JzJykgfVxuXHRcdH07XG5cblx0XHRjb25zdCBvbGRIYW5kbGVyID0gYWNjZXNzb3Iud29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5yZXF1ZXN0T3BlblVyaXNIYW5kbGVyO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGxldCB0cnVzdEVkaXRvclVyaXM6IFVSSVtdID0gW107XG5cdFx0XHRhY2Nlc3Nvci53b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLnJlcXVlc3RPcGVuVXJpc0hhbmRsZXIgPSBhc3luYyB1cmlzID0+IHtcblx0XHRcdFx0dHJ1c3RFZGl0b3JVcmlzID0gdXJpcztcblx0XHRcdFx0cmV0dXJuIG9sZEhhbmRsZXIodXJpcyk7XG5cdFx0XHR9O1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3JzKFtpbnB1dCwgb3RoZXJJbnB1dF0sIHVuZGVmaW5lZCwgeyB2YWxpZGF0ZVRydXN0OiB0cnVlIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRydXN0RWRpdG9yVXJpcy5sZW5ndGgsIDMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRydXN0RWRpdG9yVXJpcy5zb21lKHVyaSA9PiB1cmkudG9TdHJpbmcoKSA9PT0gaW5wdXQucmVzb3VyY2UudG9TdHJpbmcoKSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRydXN0RWRpdG9yVXJpcy5zb21lKHVyaSA9PiB1cmkudG9TdHJpbmcoKSA9PT0gb3RoZXJJbnB1dC5vcmlnaW5hbC5yZXNvdXJjZT8udG9TdHJpbmcoKSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRydXN0RWRpdG9yVXJpcy5zb21lKHVyaSA9PiB1cmkudG9TdHJpbmcoKSA9PT0gb3RoZXJJbnB1dC5tb2RpZmllZC5yZXNvdXJjZT8udG9TdHJpbmcoKSksIHRydWUpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhY2Nlc3Nvci53b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLnJlcXVlc3RPcGVuVXJpc0hhbmRsZXIgPSBvbGRIYW5kbGVyO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnY2xvc2UgZWRpdG9yIGRvZXMgbm90IGRpc3Bvc2Ugd2hlbiBlZGl0b3Igb3BlbmVkIGluIG90aGVyIGdyb3VwJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0LCBzZXJ2aWNlXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclNlcnZpY2UoKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UtY2xvc2UxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGNvbnN0IHJvb3RHcm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0Y29uc3QgcmlnaHRHcm91cCA9IHBhcnQuYWRkR3JvdXAocm9vdEdyb3VwLCBHcm91cERpcmVjdGlvbi5SSUdIVCk7XG5cblx0XHQvLyBPcGVuIGlucHV0XG5cdFx0YXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGlucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQsIHsgcGlubmVkOiB0cnVlIH0sIHJpZ2h0R3JvdXApO1xuXG5cdFx0Y29uc3QgZWRpdG9ycyA9IHNlcnZpY2UuZWRpdG9ycztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9ycy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JzWzBdLCBpbnB1dCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvcnNbMV0sIGlucHV0KTtcblxuXHRcdC8vIENsb3NlIGlucHV0XG5cdFx0YXdhaXQgcm9vdEdyb3VwLmNsb3NlRWRpdG9yKGlucHV0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXQuaXNEaXNwb3NlZCgpLCBmYWxzZSk7XG5cblx0XHRhd2FpdCByaWdodEdyb3VwLmNsb3NlRWRpdG9yKGlucHV0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXQuaXNEaXNwb3NlZCgpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnb3BlbiB0byB0aGUgc2lkZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydCwgc2VydmljZV0gPSBhd2FpdCBjcmVhdGVFZGl0b3JTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZTEtb3BlbnNpZGUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0MiA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlMi1vcGVuc2lkZScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRjb25zdCByb290R3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXG5cdFx0YXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGlucHV0MSwgeyBwaW5uZWQ6IHRydWUgfSwgcm9vdEdyb3VwKTtcblx0XHRsZXQgZWRpdG9yID0gYXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGlucHV0MSwgeyBwaW5uZWQ6IHRydWUsIHByZXNlcnZlRm9jdXM6IHRydWUgfSwgU0lERV9HUk9VUCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5hY3RpdmVHcm91cCwgcm9vdEdyb3VwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5jb3VudCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvcj8uZ3JvdXAsIHBhcnQuZ3JvdXBzWzFdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmlzVmlzaWJsZShpbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pc09wZW5lZChpbnB1dDEpLCB0cnVlKTtcblxuXHRcdC8vIE9wZW4gdG8gdGhlIHNpZGUgdXNlcyBleGlzdGluZyBuZWlnaGJvdXIgZ3JvdXAgaWYgYW55XG5cdFx0ZWRpdG9yID0gYXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUsIHByZXNlcnZlRm9jdXM6IHRydWUgfSwgU0lERV9HUk9VUCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuYWN0aXZlR3JvdXAsIHJvb3RHcm91cCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY291bnQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3I/Lmdyb3VwLCBwYXJ0Lmdyb3Vwc1sxXSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pc1Zpc2libGUoaW5wdXQyKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaXNPcGVuZWQoaW5wdXQyKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VkaXRvciBncm91cCBhY3RpdmF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0LCBzZXJ2aWNlXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclNlcnZpY2UoKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlMS1vcGVuc2lkZScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UyLW9wZW5zaWRlJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGNvbnN0IHJvb3RHcm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSB9LCByb290R3JvdXApO1xuXHRcdGxldCBlZGl0b3IgPSBhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQyLCB7IHBpbm5lZDogdHJ1ZSwgcHJlc2VydmVGb2N1czogdHJ1ZSwgYWN0aXZhdGlvbjogRWRpdG9yQWN0aXZhdGlvbi5BQ1RJVkFURSB9LCBTSURFX0dST1VQKTtcblx0XHRjb25zdCBzaWRlR3JvdXAgPSBlZGl0b3I/Lmdyb3VwO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuYWN0aXZlR3JvdXAsIHNpZGVHcm91cCk7XG5cblx0XHRlZGl0b3IgPSBhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSwgcHJlc2VydmVGb2N1czogdHJ1ZSwgYWN0aXZhdGlvbjogRWRpdG9yQWN0aXZhdGlvbi5QUkVTRVJWRSB9LCByb290R3JvdXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLCBzaWRlR3JvdXApO1xuXG5cdFx0ZWRpdG9yID0gYXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGlucHV0MSwgeyBwaW5uZWQ6IHRydWUsIHByZXNlcnZlRm9jdXM6IHRydWUsIGFjdGl2YXRpb246IEVkaXRvckFjdGl2YXRpb24uQUNUSVZBVEUgfSwgcm9vdEdyb3VwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5hY3RpdmVHcm91cCwgcm9vdEdyb3VwKTtcblxuXHRcdGVkaXRvciA9IGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dDIsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmF0aW9uOiBFZGl0b3JBY3RpdmF0aW9uLlBSRVNFUlZFIH0sIHNpZGVHcm91cCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuYWN0aXZlR3JvdXAsIHJvb3RHcm91cCk7XG5cblx0XHRlZGl0b3IgPSBhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQyLCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZhdGlvbjogRWRpdG9yQWN0aXZhdGlvbi5BQ1RJVkFURSB9LCBzaWRlR3JvdXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLCBzaWRlR3JvdXApO1xuXG5cdFx0cGFydC5hcnJhbmdlR3JvdXBzKEdyb3Vwc0FycmFuZ2VtZW50LkVYUEFORCk7XG5cdFx0ZWRpdG9yID0gYXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGlucHV0MSwgeyBwaW5uZWQ6IHRydWUsIHByZXNlcnZlRm9jdXM6IHRydWUsIGFjdGl2YXRpb246IEVkaXRvckFjdGl2YXRpb24uUkVTVE9SRSB9LCByb290R3JvdXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLCBzaWRlR3JvdXApO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmFjdGl2ZSBlZGl0b3IgZ3JvdXAgZG9lcyBub3QgYWN0aXZhdGUgd2hlbiBjbG9zaW5nIGVkaXRvciAoIzExNzY4NiknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnQsIHNlcnZpY2VdID0gYXdhaXQgY3JlYXRlRWRpdG9yU2VydmljZSgpO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UxLW9wZW5zaWRlJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDIgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZTItb3BlbnNpZGUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0Y29uc3Qgcm9vdEdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblxuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dDEsIHsgcGlubmVkOiB0cnVlIH0sIHJvb3RHcm91cCk7XG5cdFx0YXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUgfSwgcm9vdEdyb3VwKTtcblxuXHRcdGNvbnN0IHNpZGVHcm91cCA9IChhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQyLCB7IHBpbm5lZDogdHJ1ZSB9LCBTSURFX0dST1VQKSk/Lmdyb3VwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLCBzaWRlR3JvdXApO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChyb290R3JvdXAsIHNpZGVHcm91cCk7XG5cblx0XHRwYXJ0LmFycmFuZ2VHcm91cHMoR3JvdXBzQXJyYW5nZW1lbnQuRVhQQU5ELCBwYXJ0LmFjdGl2ZUdyb3VwKTtcblxuXHRcdGF3YWl0IHJvb3RHcm91cC5jbG9zZUVkaXRvcihpbnB1dDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLCBzaWRlR3JvdXApO1xuXG5cdFx0YXNzZXJ0KCFwYXJ0LmlzR3JvdXBFeHBhbmRlZChyb290R3JvdXApKTtcblx0XHRhc3NlcnQocGFydC5pc0dyb3VwRXhwYW5kZWQocGFydC5hY3RpdmVHcm91cCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdhY3RpdmUgZWRpdG9yIGNoYW5nZSAvIHZpc2libGUgZWRpdG9yIGNoYW5nZSBldmVudHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgW3BhcnQsIHNlcnZpY2VdID0gYXdhaXQgY3JlYXRlRWRpdG9yU2VydmljZSgpO1xuXG5cdFx0bGV0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UtYWN0aXZlJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRsZXQgb3RoZXJJbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlMi1hY3RpdmUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0bGV0IGFjdGl2ZUVkaXRvckNoYW5nZUV2ZW50RmlyZWQgPSBmYWxzZTtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3JDaGFuZ2VMaXN0ZW5lciA9IHNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0YWN0aXZlRWRpdG9yQ2hhbmdlRXZlbnRGaXJlZCA9IHRydWU7XG5cdFx0fSk7XG5cblx0XHRsZXQgdmlzaWJsZUVkaXRvckNoYW5nZUV2ZW50RmlyZWQgPSBmYWxzZTtcblx0XHRjb25zdCB2aXNpYmxlRWRpdG9yQ2hhbmdlTGlzdGVuZXIgPSBzZXJ2aWNlLm9uRGlkVmlzaWJsZUVkaXRvcnNDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dmlzaWJsZUVkaXRvckNoYW5nZUV2ZW50RmlyZWQgPSB0cnVlO1xuXHRcdH0pO1xuXG5cdFx0ZnVuY3Rpb24gYXNzZXJ0QWN0aXZlRWRpdG9yQ2hhbmdlZEV2ZW50KGV4cGVjdGVkOiBib29sZWFuKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlRWRpdG9yQ2hhbmdlRXZlbnRGaXJlZCwgZXhwZWN0ZWQsIGBVbmV4cGVjdGVkIGFjdGl2ZSBlZGl0b3IgY2hhbmdlIHN0YXRlIChnb3QgJHthY3RpdmVFZGl0b3JDaGFuZ2VFdmVudEZpcmVkfSwgZXhwZWN0ZWQgJHtleHBlY3RlZH0pYCk7XG5cdFx0XHRhY3RpdmVFZGl0b3JDaGFuZ2VFdmVudEZpcmVkID0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gYXNzZXJ0VmlzaWJsZUVkaXRvcnNDaGFuZ2VkRXZlbnQoZXhwZWN0ZWQ6IGJvb2xlYW4pIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aXNpYmxlRWRpdG9yQ2hhbmdlRXZlbnRGaXJlZCwgZXhwZWN0ZWQsIGBVbmV4cGVjdGVkIHZpc2libGUgZWRpdG9ycyBjaGFuZ2Ugc3RhdGUgKGdvdCAke3Zpc2libGVFZGl0b3JDaGFuZ2VFdmVudEZpcmVkfSwgZXhwZWN0ZWQgJHtleHBlY3RlZH0pYCk7XG5cdFx0XHR2aXNpYmxlRWRpdG9yQ2hhbmdlRXZlbnRGaXJlZCA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdGFzeW5jIGZ1bmN0aW9uIGNsb3NlRWRpdG9yQW5kV2FpdEZvck5leHRUb09wZW4oZ3JvdXA6IElFZGl0b3JHcm91cCwgaW5wdXQ6IEVkaXRvcklucHV0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRhd2FpdCBncm91cC5jbG9zZUVkaXRvcihpbnB1dCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApOyAvLyBjbG9zaW5nIGFuIGVkaXRvciB3aWxsIG5vdCBpbW1lZGlhdGVseSBvcGVuIHRoZSBuZXh0IG9uZSwgc28gd2UgbmVlZCB0byB3YWl0XG5cdFx0fVxuXG5cdFx0Ly8gMS4pIG9wZW4sIG9wZW4gc2FtZSwgb3BlbiBvdGhlciwgY2xvc2Vcblx0XHRsZXQgZWRpdG9yID0gYXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGlucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRjb25zdCBncm91cCA9IGVkaXRvcj8uZ3JvdXAhO1xuXHRcdGFzc2VydEFjdGl2ZUVkaXRvckNoYW5nZWRFdmVudCh0cnVlKTtcblx0XHRhc3NlcnRWaXNpYmxlRWRpdG9yc0NoYW5nZWRFdmVudCh0cnVlKTtcblxuXHRcdGVkaXRvciA9IGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dCk7XG5cdFx0YXNzZXJ0QWN0aXZlRWRpdG9yQ2hhbmdlZEV2ZW50KGZhbHNlKTtcblx0XHRhc3NlcnRWaXNpYmxlRWRpdG9yc0NoYW5nZWRFdmVudChmYWxzZSk7XG5cblx0XHRlZGl0b3IgPSBhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3Iob3RoZXJJbnB1dCk7XG5cdFx0YXNzZXJ0QWN0aXZlRWRpdG9yQ2hhbmdlZEV2ZW50KHRydWUpO1xuXHRcdGFzc2VydFZpc2libGVFZGl0b3JzQ2hhbmdlZEV2ZW50KHRydWUpO1xuXG5cdFx0YXdhaXQgY2xvc2VFZGl0b3JBbmRXYWl0Rm9yTmV4dFRvT3Blbihncm91cCwgb3RoZXJJbnB1dCk7XG5cdFx0YXNzZXJ0QWN0aXZlRWRpdG9yQ2hhbmdlZEV2ZW50KHRydWUpO1xuXHRcdGFzc2VydFZpc2libGVFZGl0b3JzQ2hhbmdlZEV2ZW50KHRydWUpO1xuXG5cdFx0YXdhaXQgY2xvc2VFZGl0b3JBbmRXYWl0Rm9yTmV4dFRvT3Blbihncm91cCwgaW5wdXQpO1xuXHRcdGFzc2VydEFjdGl2ZUVkaXRvckNoYW5nZWRFdmVudCh0cnVlKTtcblx0XHRhc3NlcnRWaXNpYmxlRWRpdG9yc0NoYW5nZWRFdmVudCh0cnVlKTtcblxuXHRcdC8vIDIuKSBvcGVuLCBvcGVuIHNhbWUgKGZvcmNlZCBvcGVuKSAocmVjcmVhdGUgaW5wdXRzIHRoYXQgZ290IGRpc3Bvc2VkKVxuXHRcdGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UtYWN0aXZlJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRvdGhlcklucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UyLWFjdGl2ZScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0ZWRpdG9yID0gYXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGlucHV0KTtcblx0XHRhc3NlcnRBY3RpdmVFZGl0b3JDaGFuZ2VkRXZlbnQodHJ1ZSk7XG5cdFx0YXNzZXJ0VmlzaWJsZUVkaXRvcnNDaGFuZ2VkRXZlbnQodHJ1ZSk7XG5cblx0XHRlZGl0b3IgPSBhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQsIHsgZm9yY2VSZWxvYWQ6IHRydWUgfSk7XG5cdFx0YXNzZXJ0QWN0aXZlRWRpdG9yQ2hhbmdlZEV2ZW50KGZhbHNlKTtcblx0XHRhc3NlcnRWaXNpYmxlRWRpdG9yc0NoYW5nZWRFdmVudChmYWxzZSk7XG5cblx0XHRhd2FpdCBjbG9zZUVkaXRvckFuZFdhaXRGb3JOZXh0VG9PcGVuKGdyb3VwLCBpbnB1dCk7XG5cblx0XHQvLyAzLikgb3Blbiwgb3BlbiBpbmFjdGl2ZSwgY2xvc2UgKHJlY3JlYXRlIGlucHV0cyB0aGF0IGdvdCBkaXNwb3NlZClcblx0XHRpbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlLWFjdGl2ZScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0b3RoZXJJbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlMi1hY3RpdmUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGVkaXRvciA9IGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXNzZXJ0QWN0aXZlRWRpdG9yQ2hhbmdlZEV2ZW50KHRydWUpO1xuXHRcdGFzc2VydFZpc2libGVFZGl0b3JzQ2hhbmdlZEV2ZW50KHRydWUpO1xuXG5cdFx0ZWRpdG9yID0gYXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKG90aGVySW5wdXQsIHsgaW5hY3RpdmU6IHRydWUgfSk7XG5cdFx0YXNzZXJ0QWN0aXZlRWRpdG9yQ2hhbmdlZEV2ZW50KGZhbHNlKTtcblx0XHRhc3NlcnRWaXNpYmxlRWRpdG9yc0NoYW5nZWRFdmVudChmYWxzZSk7XG5cblx0XHRhd2FpdCBncm91cC5jbG9zZUFsbEVkaXRvcnMoKTtcblx0XHRhc3NlcnRBY3RpdmVFZGl0b3JDaGFuZ2VkRXZlbnQodHJ1ZSk7XG5cdFx0YXNzZXJ0VmlzaWJsZUVkaXRvcnNDaGFuZ2VkRXZlbnQodHJ1ZSk7XG5cblx0XHQvLyA0Likgb3Blbiwgb3BlbiBpbmFjdGl2ZSwgY2xvc2UgaW5hY3RpdmUgKHJlY3JlYXRlIGlucHV0cyB0aGF0IGdvdCBkaXNwb3NlZClcblx0XHRpbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlLWFjdGl2ZScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0b3RoZXJJbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlMi1hY3RpdmUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGVkaXRvciA9IGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXNzZXJ0QWN0aXZlRWRpdG9yQ2hhbmdlZEV2ZW50KHRydWUpO1xuXHRcdGFzc2VydFZpc2libGVFZGl0b3JzQ2hhbmdlZEV2ZW50KHRydWUpO1xuXG5cdFx0ZWRpdG9yID0gYXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKG90aGVySW5wdXQsIHsgaW5hY3RpdmU6IHRydWUgfSk7XG5cdFx0YXNzZXJ0QWN0aXZlRWRpdG9yQ2hhbmdlZEV2ZW50KGZhbHNlKTtcblx0XHRhc3NlcnRWaXNpYmxlRWRpdG9yc0NoYW5nZWRFdmVudChmYWxzZSk7XG5cblx0XHRhd2FpdCBjbG9zZUVkaXRvckFuZFdhaXRGb3JOZXh0VG9PcGVuKGdyb3VwLCBvdGhlcklucHV0KTtcblx0XHRhc3NlcnRBY3RpdmVFZGl0b3JDaGFuZ2VkRXZlbnQoZmFsc2UpO1xuXHRcdGFzc2VydFZpc2libGVFZGl0b3JzQ2hhbmdlZEV2ZW50KGZhbHNlKTtcblxuXHRcdGF3YWl0IGdyb3VwLmNsb3NlQWxsRWRpdG9ycygpO1xuXHRcdGFzc2VydEFjdGl2ZUVkaXRvckNoYW5nZWRFdmVudCh0cnVlKTtcblx0XHRhc3NlcnRWaXNpYmxlRWRpdG9yc0NoYW5nZWRFdmVudCh0cnVlKTtcblxuXHRcdC8vIDUuKSBhZGQgZ3JvdXAsIHJlbW92ZSBncm91cCAocmVjcmVhdGUgaW5wdXRzIHRoYXQgZ290IGRpc3Bvc2VkKVxuXHRcdGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UtYWN0aXZlJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRvdGhlcklucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UyLWFjdGl2ZScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0ZWRpdG9yID0gYXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGlucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRhc3NlcnRBY3RpdmVFZGl0b3JDaGFuZ2VkRXZlbnQodHJ1ZSk7XG5cdFx0YXNzZXJ0VmlzaWJsZUVkaXRvcnNDaGFuZ2VkRXZlbnQodHJ1ZSk7XG5cblx0XHRsZXQgcmlnaHRHcm91cCA9IHBhcnQuYWRkR3JvdXAocGFydC5hY3RpdmVHcm91cCwgR3JvdXBEaXJlY3Rpb24uUklHSFQpO1xuXHRcdGFzc2VydEFjdGl2ZUVkaXRvckNoYW5nZWRFdmVudChmYWxzZSk7XG5cdFx0YXNzZXJ0VmlzaWJsZUVkaXRvcnNDaGFuZ2VkRXZlbnQoZmFsc2UpO1xuXG5cdFx0cmlnaHRHcm91cC5mb2N1cygpO1xuXHRcdGFzc2VydEFjdGl2ZUVkaXRvckNoYW5nZWRFdmVudCh0cnVlKTtcblx0XHRhc3NlcnRWaXNpYmxlRWRpdG9yc0NoYW5nZWRFdmVudChmYWxzZSk7XG5cblx0XHRwYXJ0LnJlbW92ZUdyb3VwKHJpZ2h0R3JvdXApO1xuXHRcdGFzc2VydEFjdGl2ZUVkaXRvckNoYW5nZWRFdmVudCh0cnVlKTtcblx0XHRhc3NlcnRWaXNpYmxlRWRpdG9yc0NoYW5nZWRFdmVudChmYWxzZSk7XG5cblx0XHRhd2FpdCBncm91cC5jbG9zZUFsbEVkaXRvcnMoKTtcblx0XHRhc3NlcnRBY3RpdmVFZGl0b3JDaGFuZ2VkRXZlbnQodHJ1ZSk7XG5cdFx0YXNzZXJ0VmlzaWJsZUVkaXRvcnNDaGFuZ2VkRXZlbnQodHJ1ZSk7XG5cblx0XHQvLyA2Likgb3BlbiBlZGl0b3IgaW4gaW5hY3RpdmUgZ3JvdXAgKHJlY3JlYXRlIGlucHV0cyB0aGF0IGdvdCBkaXNwb3NlZClcblx0XHRpbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlLWFjdGl2ZScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0b3RoZXJJbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlMi1hY3RpdmUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGVkaXRvciA9IGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXNzZXJ0QWN0aXZlRWRpdG9yQ2hhbmdlZEV2ZW50KHRydWUpO1xuXHRcdGFzc2VydFZpc2libGVFZGl0b3JzQ2hhbmdlZEV2ZW50KHRydWUpO1xuXG5cdFx0cmlnaHRHcm91cCA9IHBhcnQuYWRkR3JvdXAocGFydC5hY3RpdmVHcm91cCwgR3JvdXBEaXJlY3Rpb24uUklHSFQpO1xuXHRcdGFzc2VydEFjdGl2ZUVkaXRvckNoYW5nZWRFdmVudChmYWxzZSk7XG5cdFx0YXNzZXJ0VmlzaWJsZUVkaXRvcnNDaGFuZ2VkRXZlbnQoZmFsc2UpO1xuXG5cdFx0YXdhaXQgcmlnaHRHcm91cC5vcGVuRWRpdG9yKG90aGVySW5wdXQpO1xuXHRcdGFzc2VydEFjdGl2ZUVkaXRvckNoYW5nZWRFdmVudCh0cnVlKTtcblx0XHRhc3NlcnRWaXNpYmxlRWRpdG9yc0NoYW5nZWRFdmVudCh0cnVlKTtcblxuXHRcdGF3YWl0IGNsb3NlRWRpdG9yQW5kV2FpdEZvck5leHRUb09wZW4ocmlnaHRHcm91cCwgb3RoZXJJbnB1dCk7XG5cdFx0YXNzZXJ0QWN0aXZlRWRpdG9yQ2hhbmdlZEV2ZW50KHRydWUpO1xuXHRcdGFzc2VydFZpc2libGVFZGl0b3JzQ2hhbmdlZEV2ZW50KHRydWUpO1xuXG5cdFx0YXdhaXQgZ3JvdXAuY2xvc2VBbGxFZGl0b3JzKCk7XG5cdFx0YXNzZXJ0QWN0aXZlRWRpdG9yQ2hhbmdlZEV2ZW50KHRydWUpO1xuXHRcdGFzc2VydFZpc2libGVFZGl0b3JzQ2hhbmdlZEV2ZW50KHRydWUpO1xuXG5cdFx0Ly8gNy4pIGFjdGl2YXRlIGdyb3VwIChyZWNyZWF0ZSBpbnB1dHMgdGhhdCBnb3QgZGlzcG9zZWQpXG5cdFx0aW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZS1hY3RpdmUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdG90aGVySW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZTItYWN0aXZlJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRlZGl0b3IgPSBhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGFzc2VydEFjdGl2ZUVkaXRvckNoYW5nZWRFdmVudCh0cnVlKTtcblx0XHRhc3NlcnRWaXNpYmxlRWRpdG9yc0NoYW5nZWRFdmVudCh0cnVlKTtcblxuXHRcdHJpZ2h0R3JvdXAgPSBwYXJ0LmFkZEdyb3VwKHBhcnQuYWN0aXZlR3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblx0XHRhc3NlcnRBY3RpdmVFZGl0b3JDaGFuZ2VkRXZlbnQoZmFsc2UpO1xuXHRcdGFzc2VydFZpc2libGVFZGl0b3JzQ2hhbmdlZEV2ZW50KGZhbHNlKTtcblxuXHRcdGF3YWl0IHJpZ2h0R3JvdXAub3BlbkVkaXRvcihvdGhlcklucHV0KTtcblx0XHRhc3NlcnRBY3RpdmVFZGl0b3JDaGFuZ2VkRXZlbnQodHJ1ZSk7XG5cdFx0YXNzZXJ0VmlzaWJsZUVkaXRvcnNDaGFuZ2VkRXZlbnQodHJ1ZSk7XG5cblx0XHRncm91cC5mb2N1cygpO1xuXHRcdGFzc2VydEFjdGl2ZUVkaXRvckNoYW5nZWRFdmVudCh0cnVlKTtcblx0XHRhc3NlcnRWaXNpYmxlRWRpdG9yc0NoYW5nZWRFdmVudChmYWxzZSk7XG5cblx0XHRhd2FpdCBjbG9zZUVkaXRvckFuZFdhaXRGb3JOZXh0VG9PcGVuKHJpZ2h0R3JvdXAsIG90aGVySW5wdXQpO1xuXHRcdGFzc2VydEFjdGl2ZUVkaXRvckNoYW5nZWRFdmVudChmYWxzZSk7XG5cdFx0YXNzZXJ0VmlzaWJsZUVkaXRvcnNDaGFuZ2VkRXZlbnQodHJ1ZSk7XG5cblx0XHRhd2FpdCBncm91cC5jbG9zZUFsbEVkaXRvcnMoKTtcblx0XHRhc3NlcnRBY3RpdmVFZGl0b3JDaGFuZ2VkRXZlbnQodHJ1ZSk7XG5cdFx0YXNzZXJ0VmlzaWJsZUVkaXRvcnNDaGFuZ2VkRXZlbnQodHJ1ZSk7XG5cblx0XHQvLyA4LikgbW92ZSBlZGl0b3IgKHJlY3JlYXRlIGlucHV0cyB0aGF0IGdvdCBkaXNwb3NlZClcblx0XHRpbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlLWFjdGl2ZScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0b3RoZXJJbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlMi1hY3RpdmUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGVkaXRvciA9IGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXNzZXJ0QWN0aXZlRWRpdG9yQ2hhbmdlZEV2ZW50KHRydWUpO1xuXHRcdGFzc2VydFZpc2libGVFZGl0b3JzQ2hhbmdlZEV2ZW50KHRydWUpO1xuXG5cdFx0ZWRpdG9yID0gYXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKG90aGVySW5wdXQsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGFzc2VydEFjdGl2ZUVkaXRvckNoYW5nZWRFdmVudCh0cnVlKTtcblx0XHRhc3NlcnRWaXNpYmxlRWRpdG9yc0NoYW5nZWRFdmVudCh0cnVlKTtcblxuXHRcdGdyb3VwLm1vdmVFZGl0b3Iob3RoZXJJbnB1dCwgZ3JvdXAsIHsgaW5kZXg6IDAgfSk7XG5cdFx0YXNzZXJ0QWN0aXZlRWRpdG9yQ2hhbmdlZEV2ZW50KGZhbHNlKTtcblx0XHRhc3NlcnRWaXNpYmxlRWRpdG9yc0NoYW5nZWRFdmVudChmYWxzZSk7XG5cblx0XHRhd2FpdCBncm91cC5jbG9zZUFsbEVkaXRvcnMoKTtcblx0XHRhc3NlcnRBY3RpdmVFZGl0b3JDaGFuZ2VkRXZlbnQodHJ1ZSk7XG5cdFx0YXNzZXJ0VmlzaWJsZUVkaXRvcnNDaGFuZ2VkRXZlbnQodHJ1ZSk7XG5cblx0XHQvLyA5LikgY2xvc2UgZWRpdG9yIGluIGluYWN0aXZlIGdyb3VwIChyZWNyZWF0ZSBpbnB1dHMgdGhhdCBnb3QgZGlzcG9zZWQpXG5cdFx0aW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZS1hY3RpdmUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdG90aGVySW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZTItYWN0aXZlJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRlZGl0b3IgPSBhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGFzc2VydEFjdGl2ZUVkaXRvckNoYW5nZWRFdmVudCh0cnVlKTtcblx0XHRhc3NlcnRWaXNpYmxlRWRpdG9yc0NoYW5nZWRFdmVudCh0cnVlKTtcblxuXHRcdHJpZ2h0R3JvdXAgPSBwYXJ0LmFkZEdyb3VwKHBhcnQuYWN0aXZlR3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblx0XHRhc3NlcnRBY3RpdmVFZGl0b3JDaGFuZ2VkRXZlbnQoZmFsc2UpO1xuXHRcdGFzc2VydFZpc2libGVFZGl0b3JzQ2hhbmdlZEV2ZW50KGZhbHNlKTtcblxuXHRcdGF3YWl0IHJpZ2h0R3JvdXAub3BlbkVkaXRvcihvdGhlcklucHV0KTtcblx0XHRhc3NlcnRBY3RpdmVFZGl0b3JDaGFuZ2VkRXZlbnQodHJ1ZSk7XG5cdFx0YXNzZXJ0VmlzaWJsZUVkaXRvcnNDaGFuZ2VkRXZlbnQodHJ1ZSk7XG5cblx0XHRhd2FpdCBjbG9zZUVkaXRvckFuZFdhaXRGb3JOZXh0VG9PcGVuKGdyb3VwLCBpbnB1dCk7XG5cdFx0YXNzZXJ0QWN0aXZlRWRpdG9yQ2hhbmdlZEV2ZW50KGZhbHNlKTtcblx0XHRhc3NlcnRWaXNpYmxlRWRpdG9yc0NoYW5nZWRFdmVudCh0cnVlKTtcblxuXHRcdC8vIGNsZWFudXBcblx0XHRhY3RpdmVFZGl0b3JDaGFuZ2VMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0dmlzaWJsZUVkaXRvckNoYW5nZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZWRpdG9ycyBjaGFuZ2UgZXZlbnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgW3BhcnQsIHNlcnZpY2VdID0gYXdhaXQgY3JlYXRlRWRpdG9yU2VydmljZSgpO1xuXHRcdGNvbnN0IHJvb3RHcm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cblx0XHRsZXQgaW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZS1hY3RpdmUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGxldCBvdGhlcklucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UyLWFjdGl2ZScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRsZXQgZWRpdG9yc0NoYW5nZUV2ZW50Q291bnRlciA9IDA7XG5cdFx0YXN5bmMgZnVuY3Rpb24gYXNzZXJ0RWRpdG9yc0NoYW5nZUV2ZW50KGZuOiAoKSA9PiBQcm9taXNlPHVua25vd24+LCBleHBlY3RlZDogbnVtYmVyKSB7XG5cdFx0XHRjb25zdCBwID0gRXZlbnQudG9Qcm9taXNlKHNlcnZpY2Uub25EaWRFZGl0b3JzQ2hhbmdlKTtcblx0XHRcdGF3YWl0IGZuKCk7XG5cdFx0XHRhd2FpdCBwO1xuXHRcdFx0ZWRpdG9yc0NoYW5nZUV2ZW50Q291bnRlcisrO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yc0NoYW5nZUV2ZW50Q291bnRlciwgZXhwZWN0ZWQpO1xuXHRcdH1cblxuXHRcdC8vIG9wZW5cblx0XHRhd2FpdCBhc3NlcnRFZGl0b3JzQ2hhbmdlRXZlbnQoKCkgPT4gc2VydmljZS5vcGVuRWRpdG9yKGlucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KSwgMSk7XG5cblx0XHQvLyBvcGVuIChvdGhlcilcblx0XHRhd2FpdCBhc3NlcnRFZGl0b3JzQ2hhbmdlRXZlbnQoKCkgPT4gc2VydmljZS5vcGVuRWRpdG9yKG90aGVySW5wdXQsIHsgcGlubmVkOiB0cnVlIH0pLCAyKTtcblxuXHRcdC8vIGNsb3NlIChpbmFjdGl2ZSlcblx0XHRhd2FpdCBhc3NlcnRFZGl0b3JzQ2hhbmdlRXZlbnQoKCkgPT4gcm9vdEdyb3VwLmNsb3NlRWRpdG9yKGlucHV0KSwgMyk7XG5cblx0XHQvLyBjbG9zZSAoYWN0aXZlKVxuXHRcdGF3YWl0IGFzc2VydEVkaXRvcnNDaGFuZ2VFdmVudCgoKSA9PiByb290R3JvdXAuY2xvc2VFZGl0b3Iob3RoZXJJbnB1dCksIDQpO1xuXG5cdFx0aW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZS1hY3RpdmUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdG90aGVySW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZTItYWN0aXZlJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdC8vIG9wZW4gZWRpdG9yc1xuXHRcdGF3YWl0IGFzc2VydEVkaXRvcnNDaGFuZ2VFdmVudCgoKSA9PiBzZXJ2aWNlLm9wZW5FZGl0b3JzKFt7IGVkaXRvcjogaW5wdXQsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfSwgeyBlZGl0b3I6IG90aGVySW5wdXQsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfV0pLCA1KTtcblxuXHRcdC8vIGFjdGl2ZSBlZGl0b3IgY2hhbmdlXG5cdFx0YXdhaXQgYXNzZXJ0RWRpdG9yc0NoYW5nZUV2ZW50KCgpID0+IHNlcnZpY2Uub3BlbkVkaXRvcihvdGhlcklucHV0KSwgNik7XG5cblx0XHQvLyBtb3ZlIGVkaXRvciAoaW4gZ3JvdXApXG5cdFx0YXdhaXQgYXNzZXJ0RWRpdG9yc0NoYW5nZUV2ZW50KCgpID0+IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dCwgeyBwaW5uZWQ6IHRydWUsIGluZGV4OiAxIH0pLCA3KTtcblxuXHRcdGNvbnN0IHJpZ2h0R3JvdXAgPSBwYXJ0LmFkZEdyb3VwKHBhcnQuYWN0aXZlR3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblx0XHRhd2FpdCBhc3NlcnRFZGl0b3JzQ2hhbmdlRXZlbnQoYXN5bmMgKCkgPT4gcm9vdEdyb3VwLm1vdmVFZGl0b3IoaW5wdXQsIHJpZ2h0R3JvdXApLCA4KTtcblxuXHRcdC8vIG1vdmUgZ3JvdXBcblx0XHRhd2FpdCBhc3NlcnRFZGl0b3JzQ2hhbmdlRXZlbnQoYXN5bmMgKCkgPT4gcGFydC5tb3ZlR3JvdXAocmlnaHRHcm91cCwgcm9vdEdyb3VwLCBHcm91cERpcmVjdGlvbi5MRUZUKSwgOSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R3byBhY3RpdmUgZWRpdG9yIGNoYW5nZSBldmVudHMgd2hlbiBvcGVuaW5nIGVkaXRvciB0byB0aGUgc2lkZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBbLCBzZXJ2aWNlXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclNlcnZpY2UoKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UtYWN0aXZlJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGxldCBhY3RpdmVFZGl0b3JDaGFuZ2VFdmVudHMgPSAwO1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvckNoYW5nZUxpc3RlbmVyID0gc2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgoKSA9PiB7XG5cdFx0XHRhY3RpdmVFZGl0b3JDaGFuZ2VFdmVudHMrKztcblx0XHR9KTtcblxuXHRcdGZ1bmN0aW9uIGFzc2VydEFjdGl2ZUVkaXRvckNoYW5nZWRFdmVudChleHBlY3RlZDogbnVtYmVyKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlRWRpdG9yQ2hhbmdlRXZlbnRzLCBleHBlY3RlZCwgYFVuZXhwZWN0ZWQgYWN0aXZlIGVkaXRvciBjaGFuZ2Ugc3RhdGUgKGdvdCAke2FjdGl2ZUVkaXRvckNoYW5nZUV2ZW50c30sIGV4cGVjdGVkICR7ZXhwZWN0ZWR9KWApO1xuXHRcdFx0YWN0aXZlRWRpdG9yQ2hhbmdlRXZlbnRzID0gMDtcblx0XHR9XG5cblx0XHRhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGFzc2VydEFjdGl2ZUVkaXRvckNoYW5nZWRFdmVudCgxKTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSwgU0lERV9HUk9VUCk7XG5cblx0XHQvLyB3ZSBleHBlY3QgMiBhY3RpdmUgZWRpdG9yIGNoYW5nZSBldmVudHM6IG9uZSBmb3IgdGhlIGZhY3QgdGhhdCB0aGVcblx0XHQvLyBhY3RpdmUgZWRpdG9yIGlzIG5vdyBpbiB0aGUgc2lkZSBncm91cCBidXQgYWxzbyBvbmUgZm9yIHdoZW4gdGhlXG5cdFx0Ly8gZWRpdG9yIGhhcyBmaW5pc2hlZCBsb2FkaW5nLiB3ZSB1c2VkIHRvIGlnbm9yZSB0aGF0IHNlY29uZCBjaGFuZ2Vcblx0XHQvLyBldmVudCwgaG93ZXZlciBtYW55IGxpc3RlbmVycyBhcmUgaW50ZXJlc3RlZCBvbiB0aGUgYWN0aXZlIGVkaXRvclxuXHRcdC8vIHdoZW4gaXQgaGFzIGZ1bGx5IGxvYWRlZCAoZS5nLiBhIG1vZGVsIGlzIHNldCkuIGFzIHN1Y2gsIHdlIGNhbm5vdFxuXHRcdC8vIHNpbXBseSBpZ25vcmUgdGhhdCBzZWNvbmQgZXZlbnQgZnJvbSB0aGUgZWRpdG9yIHNlcnZpY2UsIGV2ZW4gdGhvdWdoXG5cdFx0Ly8gdGhlIGFjdHVhbCBlZGl0b3IgaW5wdXQgaXMgdGhlIHNhbWVcblx0XHRhc3NlcnRBY3RpdmVFZGl0b3JDaGFuZ2VkRXZlbnQoMik7XG5cblx0XHQvLyBjbGVhbnVwXG5cdFx0YWN0aXZlRWRpdG9yQ2hhbmdlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCAvIGFjdGl2ZVRleHRFZGl0b3JNb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFssIHNlcnZpY2VdID0gYXdhaXQgY3JlYXRlRWRpdG9yU2VydmljZSgpO1xuXG5cdFx0Ly8gT3BlbiB1bnRpdGxlZCBpbnB1dFxuXHRcdGNvbnN0IGVkaXRvciA9IGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiB1bmRlZmluZWQgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5hY3RpdmVFZGl0b3JQYW5lLCBlZGl0b3IpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sLCBlZGl0b3I/LmdldENvbnRyb2woKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckxhbmd1YWdlSWQsIFBMQUlOVEVYVF9MQU5HVUFHRV9JRCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29wZW5FZGl0b3IgcmV0dXJucyB1bmRlZmluZWQgd2hlbiBpbmFjdGl2ZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBbLCBzZXJ2aWNlXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclNlcnZpY2UoKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UtYWN0aXZlJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBvdGhlcklucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UyLWluYWN0aXZlJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGNvbnN0IGVkaXRvciA9IGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXNzZXJ0Lm9rKGVkaXRvcik7XG5cblx0XHRjb25zdCBvdGhlckVkaXRvciA9IGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihvdGhlcklucHV0LCB7IGluYWN0aXZlOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5vayghb3RoZXJFZGl0b3IpO1xuXHR9KTtcblxuXHR0ZXN0KCdvcGVuRWRpdG9yIHNob3dzIHBsYWNlaG9sZGVyIHdoZW4gb3BlbmluZyBmYWlscycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBbLCBzZXJ2aWNlXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclNlcnZpY2UoKTtcblxuXHRcdGNvbnN0IGZhaWxpbmdJbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlLWZhaWxpbmcnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGZhaWxpbmdJbnB1dC5zZXRGYWlsVG9PcGVuKCk7XG5cblx0XHRjb25zdCBmYWlsaW5nRWRpdG9yID0gYXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGZhaWxpbmdJbnB1dCk7XG5cdFx0YXNzZXJ0Lm9rKGZhaWxpbmdFZGl0b3IgaW5zdGFuY2VvZiBFcnJvclBsYWNlaG9sZGVyRWRpdG9yKTtcblx0fSk7XG5cblx0dGVzdCgnb3BlbkVkaXRvciBzaG93cyBwbGFjZWhvbGRlciB3aGVuIHJlc3RvcmluZyBmYWlscycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBbLCBzZXJ2aWNlXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclNlcnZpY2UoKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UtYWN0aXZlJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBmYWlsaW5nSW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZS1mYWlsaW5nJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGZhaWxpbmdJbnB1dCwgeyBpbmFjdGl2ZTogdHJ1ZSB9KTtcblxuXHRcdGZhaWxpbmdJbnB1dC5zZXRGYWlsVG9PcGVuKCk7XG5cdFx0Y29uc3QgZmFpbGluZ0VkaXRvciA9IGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihmYWlsaW5nSW5wdXQpO1xuXHRcdGFzc2VydC5vayhmYWlsaW5nRWRpdG9yIGluc3RhbmNlb2YgRXJyb3JQbGFjZWhvbGRlckVkaXRvcik7XG5cdH0pO1xuXG5cdHRlc3QoJ3NhdmUsIHNhdmVBbGwsIHJldmVydEFsbCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBbcGFydCwgc2VydmljZV0gPSBhd2FpdCBjcmVhdGVFZGl0b3JTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZTEnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGlucHV0MS5kaXJ0eSA9IHRydWU7XG5cdFx0Y29uc3QgaW5wdXQyID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRpbnB1dDIuZGlydHkgPSB0cnVlO1xuXHRcdGNvbnN0IHNhbWVJbnB1dDEgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZTEnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdHNhbWVJbnB1dDEuZGlydHkgPSB0cnVlO1xuXG5cdFx0Y29uc3Qgcm9vdEdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblxuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dDEsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dDIsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihzYW1lSW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSB9LCBTSURFX0dST1VQKTtcblxuXHRcdGNvbnN0IHJlczEgPSBhd2FpdCBzZXJ2aWNlLnNhdmUoeyBncm91cElkOiByb290R3JvdXAuaWQsIGVkaXRvcjogaW5wdXQxIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMxLnN1Y2Nlc3MsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMxLmVkaXRvcnNbMF0sIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlucHV0MS5nb3RTYXZlZCwgdHJ1ZSk7XG5cblx0XHRpbnB1dDEuZ290U2F2ZWQgPSBmYWxzZTtcblx0XHRpbnB1dDEuZ290U2F2ZWRBcyA9IGZhbHNlO1xuXHRcdGlucHV0MS5nb3RSZXZlcnRlZCA9IGZhbHNlO1xuXG5cdFx0aW5wdXQxLmRpcnR5ID0gdHJ1ZTtcblx0XHRpbnB1dDIuZGlydHkgPSB0cnVlO1xuXHRcdHNhbWVJbnB1dDEuZGlydHkgPSB0cnVlO1xuXG5cdFx0Y29uc3QgcmVzMiA9IGF3YWl0IHNlcnZpY2Uuc2F2ZSh7IGdyb3VwSWQ6IHJvb3RHcm91cC5pZCwgZWRpdG9yOiBpbnB1dDEgfSwgeyBzYXZlQXM6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlczIuc3VjY2VzcywgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlczIuZWRpdG9yc1swXSwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXQxLmdvdFNhdmVkQXMsIHRydWUpO1xuXG5cdFx0aW5wdXQxLmdvdFNhdmVkID0gZmFsc2U7XG5cdFx0aW5wdXQxLmdvdFNhdmVkQXMgPSBmYWxzZTtcblx0XHRpbnB1dDEuZ290UmV2ZXJ0ZWQgPSBmYWxzZTtcblxuXHRcdGlucHV0MS5kaXJ0eSA9IHRydWU7XG5cdFx0aW5wdXQyLmRpcnR5ID0gdHJ1ZTtcblx0XHRzYW1lSW5wdXQxLmRpcnR5ID0gdHJ1ZTtcblxuXHRcdGNvbnN0IHJldmVydFJlcyA9IGF3YWl0IHNlcnZpY2UucmV2ZXJ0QWxsKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJldmVydFJlcywgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlucHV0MS5nb3RSZXZlcnRlZCwgdHJ1ZSk7XG5cblx0XHRpbnB1dDEuZ290U2F2ZWQgPSBmYWxzZTtcblx0XHRpbnB1dDEuZ290U2F2ZWRBcyA9IGZhbHNlO1xuXHRcdGlucHV0MS5nb3RSZXZlcnRlZCA9IGZhbHNlO1xuXG5cdFx0aW5wdXQxLmRpcnR5ID0gdHJ1ZTtcblx0XHRpbnB1dDIuZGlydHkgPSB0cnVlO1xuXHRcdHNhbWVJbnB1dDEuZGlydHkgPSB0cnVlO1xuXG5cdFx0Y29uc3QgcmVzMyA9IGF3YWl0IHNlcnZpY2Uuc2F2ZUFsbCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMzLnN1Y2Nlc3MsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMzLmVkaXRvcnMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXQxLmdvdFNhdmVkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXQyLmdvdFNhdmVkLCB0cnVlKTtcblxuXHRcdGlucHV0MS5nb3RTYXZlZCA9IGZhbHNlO1xuXHRcdGlucHV0MS5nb3RTYXZlZEFzID0gZmFsc2U7XG5cdFx0aW5wdXQxLmdvdFJldmVydGVkID0gZmFsc2U7XG5cdFx0aW5wdXQyLmdvdFNhdmVkID0gZmFsc2U7XG5cdFx0aW5wdXQyLmdvdFNhdmVkQXMgPSBmYWxzZTtcblx0XHRpbnB1dDIuZ290UmV2ZXJ0ZWQgPSBmYWxzZTtcblxuXHRcdGlucHV0MS5kaXJ0eSA9IHRydWU7XG5cdFx0aW5wdXQyLmRpcnR5ID0gdHJ1ZTtcblx0XHRzYW1lSW5wdXQxLmRpcnR5ID0gdHJ1ZTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uuc2F2ZUFsbCh7IHNhdmVBczogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dDEuZ290U2F2ZWRBcywgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlucHV0Mi5nb3RTYXZlZEFzLCB0cnVlKTtcblxuXHRcdC8vIHNlcnZpY2VzIGRlZHVwZXMgaW5wdXRzIGF1dG9tYXRpY2FsbHlcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2FtZUlucHV0MS5nb3RTYXZlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYW1lSW5wdXQxLmdvdFNhdmVkQXMsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2FtZUlucHV0MS5nb3RSZXZlcnRlZCwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdzYXZlQWxsLCByZXZlcnRBbGwgKHN0aWNreSBlZGl0b3IpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IFssIHNlcnZpY2VdID0gYXdhaXQgY3JlYXRlRWRpdG9yU2VydmljZSgpO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRpbnB1dDEuZGlydHkgPSB0cnVlO1xuXHRcdGNvbnN0IGlucHV0MiA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlMicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0aW5wdXQyLmRpcnR5ID0gdHJ1ZTtcblx0XHRjb25zdCBzYW1lSW5wdXQxID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRzYW1lSW5wdXQxLmRpcnR5ID0gdHJ1ZTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dDEsIHsgcGlubmVkOiB0cnVlLCBzdGlja3k6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKHNhbWVJbnB1dDEsIHsgcGlubmVkOiB0cnVlIH0sIFNJREVfR1JPVVApO1xuXG5cdFx0Y29uc3QgcmV2ZXJ0UmVzID0gYXdhaXQgc2VydmljZS5yZXZlcnRBbGwoeyBleGNsdWRlU3RpY2t5OiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXZlcnRSZXMsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dDEuZ290UmV2ZXJ0ZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2FtZUlucHV0MS5nb3RSZXZlcnRlZCwgdHJ1ZSk7XG5cblx0XHRpbnB1dDEuZ290U2F2ZWQgPSBmYWxzZTtcblx0XHRpbnB1dDEuZ290U2F2ZWRBcyA9IGZhbHNlO1xuXHRcdGlucHV0MS5nb3RSZXZlcnRlZCA9IGZhbHNlO1xuXG5cdFx0c2FtZUlucHV0MS5nb3RTYXZlZCA9IGZhbHNlO1xuXHRcdHNhbWVJbnB1dDEuZ290U2F2ZWRBcyA9IGZhbHNlO1xuXHRcdHNhbWVJbnB1dDEuZ290UmV2ZXJ0ZWQgPSBmYWxzZTtcblxuXHRcdGlucHV0MS5kaXJ0eSA9IHRydWU7XG5cdFx0aW5wdXQyLmRpcnR5ID0gdHJ1ZTtcblx0XHRzYW1lSW5wdXQxLmRpcnR5ID0gdHJ1ZTtcblxuXHRcdGNvbnN0IHNhdmVSZXMgPSBhd2FpdCBzZXJ2aWNlLnNhdmVBbGwoeyBleGNsdWRlU3RpY2t5OiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYXZlUmVzLnN1Y2Nlc3MsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYXZlUmVzLmVkaXRvcnMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXQxLmdvdFNhdmVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlucHV0Mi5nb3RTYXZlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhbWVJbnB1dDEuZ290U2F2ZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzYXZlQWxsLCByZXZlcnRBbGwgdW50aXRsZWQgKGV4Y2x1ZGUgdW50aXRsZWQpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHRlc3RTYXZlUmV2ZXJ0VW50aXRsZWQoe30sIGZhbHNlLCBmYWxzZSk7XG5cdFx0YXdhaXQgdGVzdFNhdmVSZXZlcnRVbnRpdGxlZCh7IGluY2x1ZGVVbnRpdGxlZDogZmFsc2UgfSwgZmFsc2UsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnc2F2ZUFsbCwgcmV2ZXJ0QWxsIHVudGl0bGVkIChpbmNsdWRlIHVudGl0bGVkKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB0ZXN0U2F2ZVJldmVydFVudGl0bGVkKHsgaW5jbHVkZVVudGl0bGVkOiB0cnVlIH0sIHRydWUsIGZhbHNlKTtcblx0XHRhd2FpdCB0ZXN0U2F2ZVJldmVydFVudGl0bGVkKHsgaW5jbHVkZVVudGl0bGVkOiB7IGluY2x1ZGVTY3JhdGNocGFkOiBmYWxzZSB9IH0sIHRydWUsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnc2F2ZUFsbCwgcmV2ZXJ0QWxsIHVudGl0bGVkIChpbmNsdWRlIHNjcmF0Y2hwYWQpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHRlc3RTYXZlUmV2ZXJ0VW50aXRsZWQoeyBpbmNsdWRlVW50aXRsZWQ6IHsgaW5jbHVkZVNjcmF0Y2hwYWQ6IHRydWUgfSB9LCB0cnVlLCB0cnVlKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdFNhdmVSZXZlcnRVbnRpdGxlZChvcHRpb25zOiBJQmFzZVNhdmVSZXZlcnRBbGxFZGl0b3JPcHRpb25zLCBleHBlY3RVbnRpdGxlZDogYm9vbGVhbiwgZXhwZWN0U2NyYXRjaHBhZDogYm9vbGVhbikge1xuXHRcdGNvbnN0IFssIHNlcnZpY2VdID0gYXdhaXQgY3JlYXRlRWRpdG9yU2VydmljZSgpO1xuXHRcdGNvbnN0IGlucHV0MSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlMScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0aW5wdXQxLmRpcnR5ID0gdHJ1ZTtcblx0XHRjb25zdCB1bnRpdGxlZElucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHR1bnRpdGxlZElucHV0LmRpcnR5ID0gdHJ1ZTtcblx0XHR1bnRpdGxlZElucHV0LmNhcGFiaWxpdGllcyA9IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlVudGl0bGVkO1xuXHRcdGNvbnN0IHNjcmF0Y2hwYWRJbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlMycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0c2NyYXRjaHBhZElucHV0Lm1vZGlmaWVkID0gdHJ1ZTtcblx0XHRzY3JhdGNocGFkSW5wdXQuY2FwYWJpbGl0aWVzID0gRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuU2NyYXRjaHBhZCB8IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlVudGl0bGVkO1xuXG5cdFx0YXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGlucHV0MSwgeyBwaW5uZWQ6IHRydWUsIHN0aWNreTogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IodW50aXRsZWRJbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKHNjcmF0Y2hwYWRJbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cblx0XHRjb25zdCByZXZlcnRSZXMgPSBhd2FpdCBzZXJ2aWNlLnJldmVydEFsbChvcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmV2ZXJ0UmVzLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXQxLmdvdFJldmVydGVkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW50aXRsZWRJbnB1dC5nb3RSZXZlcnRlZCwgZXhwZWN0VW50aXRsZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY3JhdGNocGFkSW5wdXQuZ290UmV2ZXJ0ZWQsIGV4cGVjdFNjcmF0Y2hwYWQpO1xuXG5cdFx0aW5wdXQxLmdvdFNhdmVkID0gZmFsc2U7XG5cdFx0dW50aXRsZWRJbnB1dC5nb3RTYXZlZEFzID0gZmFsc2U7XG5cdFx0c2NyYXRjaHBhZElucHV0LmdvdFJldmVydGVkID0gZmFsc2U7XG5cblx0XHRpbnB1dDEuZ290U2F2ZWQgPSBmYWxzZTtcblx0XHR1bnRpdGxlZElucHV0LmdvdFNhdmVkQXMgPSBmYWxzZTtcblx0XHRzY3JhdGNocGFkSW5wdXQuZ290UmV2ZXJ0ZWQgPSBmYWxzZTtcblxuXHRcdGlucHV0MS5kaXJ0eSA9IHRydWU7XG5cdFx0dW50aXRsZWRJbnB1dC5kaXJ0eSA9IHRydWU7XG5cdFx0c2NyYXRjaHBhZElucHV0Lm1vZGlmaWVkID0gdHJ1ZTtcblxuXHRcdGNvbnN0IHNhdmVSZXMgPSBhd2FpdCBzZXJ2aWNlLnNhdmVBbGwob3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhdmVSZXMuc3VjY2VzcywgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhdmVSZXMuZWRpdG9ycy5sZW5ndGgsIGV4cGVjdFNjcmF0Y2hwYWQgPyAzIDogZXhwZWN0VW50aXRsZWQgPyAyIDogMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlucHV0MS5nb3RTYXZlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVudGl0bGVkSW5wdXQuZ290U2F2ZWQsIGV4cGVjdFVudGl0bGVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NyYXRjaHBhZElucHV0LmdvdFNhdmVkLCBleHBlY3RTY3JhdGNocGFkKTtcblx0fVxuXG5cdHRlc3QoJ2ZpbGUgZGVsZXRlIGNsb3NlcyBlZGl0b3InLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIHRlc3RGaWxlRGVsZXRlRWRpdG9yQ2xvc2UoZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaWxlIGRlbGV0ZSBsZWF2ZXMgZGlydHkgZWRpdG9ycyBvcGVuJywgZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiB0ZXN0RmlsZURlbGV0ZUVkaXRvckNsb3NlKHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaWxlIGRlbGV0ZSBjbG9zZXMgZWRpdG9yIGJ5IHByZWZlcnJlZCByZXNvdXJjZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBbcGFydCwgc2VydmljZSwgYWNjZXNzb3JdID0gYXdhaXQgY3JlYXRlRWRpdG9yU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKCdteTovL3Jlc291cmNlJyk7XG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgndGVzdC1icm93c2VyOi8vZWRpdG9yJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoaW5wdXQsICdwcmVmZXJyZWRSZXNvdXJjZScsIHsgdmFsdWU6IHJlc291cmNlIH0pO1xuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cblx0XHRjb25zdCBhY3RpdmVFZGl0b3JDaGFuZ2VQcm9taXNlID0gYXdhaXRBY3RpdmVFZGl0b3JDaGFuZ2Uoc2VydmljZSk7XG5cdFx0YWNjZXNzb3IuZmlsZVNlcnZpY2UuZmlyZUFmdGVyT3BlcmF0aW9uKG5ldyBGaWxlT3BlcmF0aW9uRXZlbnQocmVzb3VyY2UsIEZpbGVPcGVyYXRpb24uREVMRVRFKSk7XG5cdFx0YXdhaXQgYWN0aXZlRWRpdG9yQ2hhbmdlUHJvbWlzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLmFjdGl2ZUVkaXRvciwgbnVsbCk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RGaWxlRGVsZXRlRWRpdG9yQ2xvc2UoZGlydHk6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBbcGFydCwgc2VydmljZSwgYWNjZXNzb3JdID0gYXdhaXQgY3JlYXRlRWRpdG9yU2VydmljZSgpO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRpbnB1dDEuZGlydHkgPSBkaXJ0eTtcblx0XHRjb25zdCBpbnB1dDIgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZTInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGlucHV0Mi5kaXJ0eSA9IGRpcnR5O1xuXG5cdFx0Y29uc3Qgcm9vdEdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblxuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dDEsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dDIsIHsgcGlubmVkOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3RHcm91cC5hY3RpdmVFZGl0b3IsIGlucHV0Mik7XG5cblx0XHRjb25zdCBhY3RpdmVFZGl0b3JDaGFuZ2VQcm9taXNlID0gYXdhaXRBY3RpdmVFZGl0b3JDaGFuZ2Uoc2VydmljZSk7XG5cdFx0YWNjZXNzb3IuZmlsZVNlcnZpY2UuZmlyZUFmdGVyT3BlcmF0aW9uKG5ldyBGaWxlT3BlcmF0aW9uRXZlbnQoaW5wdXQyLnJlc291cmNlLCBGaWxlT3BlcmF0aW9uLkRFTEVURSkpO1xuXHRcdGlmICghZGlydHkpIHtcblx0XHRcdGF3YWl0IGFjdGl2ZUVkaXRvckNoYW5nZVByb21pc2U7XG5cdFx0fVxuXG5cdFx0aWYgKGRpcnR5KSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdEdyb3VwLmFjdGl2ZUVkaXRvciwgaW5wdXQyKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3RHcm91cC5hY3RpdmVFZGl0b3IsIGlucHV0MSk7XG5cdFx0fVxuXHR9XG5cblx0dGVzdCgnZmlsZSBtb3ZlIGFza3MgaW5wdXQgdG8gbW92ZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBbcGFydCwgc2VydmljZSwgYWNjZXNzb3JdID0gYXdhaXQgY3JlYXRlRWRpdG9yU2VydmljZSgpO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBtb3ZlZElucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRpbnB1dDEubW92ZWRFZGl0b3IgPSB7IGVkaXRvcjogbW92ZWRJbnB1dCB9O1xuXG5cdFx0Y29uc3Qgcm9vdEdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblxuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dDEsIHsgcGlubmVkOiB0cnVlIH0pO1xuXG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yQ2hhbmdlUHJvbWlzZSA9IGF3YWl0QWN0aXZlRWRpdG9yQ2hhbmdlKHNlcnZpY2UpO1xuXHRcdGFjY2Vzc29yLmZpbGVTZXJ2aWNlLmZpcmVBZnRlck9wZXJhdGlvbihuZXcgRmlsZU9wZXJhdGlvbkV2ZW50KGlucHV0MS5yZXNvdXJjZSwgRmlsZU9wZXJhdGlvbi5NT1ZFLCB7XG5cdFx0XHRyZXNvdXJjZTogbW92ZWRJbnB1dC5yZXNvdXJjZSxcblx0XHRcdGN0aW1lOiAwLFxuXHRcdFx0ZXRhZzogJycsXG5cdFx0XHRpc0RpcmVjdG9yeTogZmFsc2UsXG5cdFx0XHRpc0ZpbGU6IHRydWUsXG5cdFx0XHRtdGltZTogMCxcblx0XHRcdG5hbWU6ICdyZXNvdXJjZTInLFxuXHRcdFx0c2l6ZTogMCxcblx0XHRcdGlzU3ltYm9saWNMaW5rOiBmYWxzZSxcblx0XHRcdHJlYWRvbmx5OiBmYWxzZSxcblx0XHRcdGxvY2tlZDogZmFsc2UsXG5cdFx0XHRleGVjdXRhYmxlOiBmYWxzZSxcblx0XHRcdGNoaWxkcmVuOiB1bmRlZmluZWRcblx0XHR9KSk7XG5cdFx0YXdhaXQgYWN0aXZlRWRpdG9yQ2hhbmdlUHJvbWlzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290R3JvdXAuYWN0aXZlRWRpdG9yLCBtb3ZlZElucHV0KTtcblx0fSk7XG5cblx0dGVzdCgnZmlsZSBtb3ZlIGFza3MgaW5wdXQgdG8gbW92ZSBieSBwcmVmZXJyZWQgcmVzb3VyY2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgW3BhcnQsIHNlcnZpY2UsIGFjY2Vzc29yXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclNlcnZpY2UoKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZTEnKTtcblx0XHRjb25zdCB0YXJnZXQgPSBVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UyJyk7XG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgndGVzdC1icm93c2VyOi8vZWRpdG9yJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoaW5wdXQsICdwcmVmZXJyZWRSZXNvdXJjZScsIHsgdmFsdWU6IHJlc291cmNlIH0pO1xuXHRcdGNvbnN0IG1vdmVkSW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KHRhcmdldCwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGlucHV0Lm1vdmVkRWRpdG9yID0geyBlZGl0b3I6IG1vdmVkSW5wdXQgfTtcblx0XHRhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQsIHsgcGlubmVkOiB0cnVlIH0pO1xuXG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yQ2hhbmdlUHJvbWlzZSA9IGF3YWl0QWN0aXZlRWRpdG9yQ2hhbmdlKHNlcnZpY2UpO1xuXHRcdGFjY2Vzc29yLmZpbGVTZXJ2aWNlLmZpcmVBZnRlck9wZXJhdGlvbihuZXcgRmlsZU9wZXJhdGlvbkV2ZW50KHJlc291cmNlLCBGaWxlT3BlcmF0aW9uLk1PVkUsIHtcblx0XHRcdHJlc291cmNlOiB0YXJnZXQsXG5cdFx0XHRjdGltZTogMCxcblx0XHRcdGV0YWc6ICcnLFxuXHRcdFx0aXNEaXJlY3Rvcnk6IGZhbHNlLFxuXHRcdFx0aXNGaWxlOiB0cnVlLFxuXHRcdFx0bXRpbWU6IDAsXG5cdFx0XHRuYW1lOiAncmVzb3VyY2UyJyxcblx0XHRcdHNpemU6IDAsXG5cdFx0XHRpc1N5bWJvbGljTGluazogZmFsc2UsXG5cdFx0XHRyZWFkb25seTogZmFsc2UsXG5cdFx0XHRsb2NrZWQ6IGZhbHNlLFxuXHRcdFx0ZXhlY3V0YWJsZTogZmFsc2UsXG5cdFx0XHRjaGlsZHJlbjogdW5kZWZpbmVkXG5cdFx0fSkpO1xuXHRcdGF3YWl0IGFjdGl2ZUVkaXRvckNoYW5nZVByb21pc2U7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5hY3RpdmVHcm91cC5hY3RpdmVFZGl0b3IsIG1vdmVkSW5wdXQpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaWxlIG1vdmUgaXMgb25seSBoYW5kbGVkIGJ5IHRoZSBnbG9iYWwgZWRpdG9yIHNlcnZpY2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgW3BhcnQsIHNlcnZpY2UsIGFjY2Vzc29yXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclNlcnZpY2UoKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZTEnKTtcblx0XHRjb25zdCB0YXJnZXQgPSBVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UyJyk7XG5cdFx0Y29uc3QgbW92ZWRJbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQodGFyZ2V0LCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0bGV0IHJlbmFtZUNhbGxzID0gMDtcblx0XHRjb25zdCBpbnB1dCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0RmlsZUVkaXRvcklucHV0IHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJlbmFtZSgpIHtcblx0XHRcdFx0cmVuYW1lQ2FsbHMrKztcblx0XHRcdFx0cmV0dXJuIHsgZWRpdG9yOiBtb3ZlZElucHV0IH07XG5cdFx0XHR9XG5cdFx0fShyZXNvdXJjZSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpKTtcblx0XHRzZXJ2aWNlLmNyZWF0ZVNjb3BlZChwYXJ0LCBkaXNwb3NhYmxlcyk7XG5cdFx0YXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGlucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblxuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvckNoYW5nZVByb21pc2UgPSBhd2FpdEFjdGl2ZUVkaXRvckNoYW5nZShzZXJ2aWNlKTtcblx0XHRhY2Nlc3Nvci5maWxlU2VydmljZS5maXJlQWZ0ZXJPcGVyYXRpb24obmV3IEZpbGVPcGVyYXRpb25FdmVudChyZXNvdXJjZSwgRmlsZU9wZXJhdGlvbi5NT1ZFLCB7XG5cdFx0XHRyZXNvdXJjZTogdGFyZ2V0LFxuXHRcdFx0Y3RpbWU6IDAsXG5cdFx0XHRldGFnOiAnJyxcblx0XHRcdGlzRGlyZWN0b3J5OiBmYWxzZSxcblx0XHRcdGlzRmlsZTogdHJ1ZSxcblx0XHRcdG10aW1lOiAwLFxuXHRcdFx0bmFtZTogJ3Jlc291cmNlMicsXG5cdFx0XHRzaXplOiAwLFxuXHRcdFx0aXNTeW1ib2xpY0xpbms6IGZhbHNlLFxuXHRcdFx0cmVhZG9ubHk6IGZhbHNlLFxuXHRcdFx0bG9ja2VkOiBmYWxzZSxcblx0XHRcdGV4ZWN1dGFibGU6IGZhbHNlLFxuXHRcdFx0Y2hpbGRyZW46IHVuZGVmaW5lZFxuXHRcdH0pKTtcblx0XHRhd2FpdCBhY3RpdmVFZGl0b3JDaGFuZ2VQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZW5hbWVDYWxscyxcblx0XHRcdGFjdGl2ZUVkaXRvcjogcGFydC5hY3RpdmVHcm91cC5hY3RpdmVFZGl0b3Jcblx0XHR9LCB7XG5cdFx0XHRyZW5hbWVDYWxsczogMSxcblx0XHRcdGFjdGl2ZUVkaXRvcjogbW92ZWRJbnB1dFxuXHRcdH0pO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBhd2FpdEFjdGl2ZUVkaXRvckNoYW5nZShlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBFdmVudC50b1Byb21pc2UoRXZlbnQub25jZShlZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKSk7XG5cdH1cblxuXHR0ZXN0KCdmaWxlIHdhdGNoZXIgZ2V0cyBpbnN0YWxsZWQgZm9yIG91dCBvZiB3b3Jrc3BhY2UgZmlsZXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgWywgc2VydmljZSwgYWNjZXNzb3JdID0gYXdhaXQgY3JlYXRlRWRpdG9yU2VydmljZSgpO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ2ZpbGU6Ly9yZXNvdXJjZTEnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0MiA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdmaWxlOi8vcmVzb3VyY2UyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dDEsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY2Nlc3Nvci5maWxlU2VydmljZS53YXRjaGVzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLmZpbGVTZXJ2aWNlLndhdGNoZXNbMF0udG9TdHJpbmcoKSwgaW5wdXQxLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXG5cdFx0Y29uc3QgZWRpdG9yID0gYXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLmZpbGVTZXJ2aWNlLndhdGNoZXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXNzb3IuZmlsZVNlcnZpY2Uud2F0Y2hlc1swXS50b1N0cmluZygpLCBpbnB1dDIucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0XHRhd2FpdCBlZGl0b3I/Lmdyb3VwLmNsb3NlQWxsRWRpdG9ycygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY2Nlc3Nvci5maWxlU2VydmljZS53YXRjaGVzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjdGl2ZUVkaXRvclBhbmUgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7IGNvbnRleHRLZXlTZXJ2aWNlOiBpbnN0YW50aWF0aW9uU2VydmljZSA9PiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNb2NrU2NvcGFibGVDb250ZXh0S2V5U2VydmljZSkgfSwgZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IFtwYXJ0LCBzZXJ2aWNlXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclNlcnZpY2UoaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ2ZpbGU6Ly9yZXNvdXJjZTEnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdmaWxlOi8vcmVzb3VyY2UyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dDEsIHsgcGlubmVkOiB0cnVlIH0pO1xuXG5cdFx0Y29uc3QgZWRpdG9yQ29udGV4dEtleVNlcnZpY2UgPSBzZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU/LnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlO1xuXHRcdGFzc2VydC5vayghIWVkaXRvckNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yQ29udGV4dEtleVNlcnZpY2UsIHBhcnQuYWN0aXZlR3JvdXAuYWN0aXZlRWRpdG9yUGFuZT8uc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdlZGl0b3JSZXNvbHZlclNlcnZpY2UgLSBvcGVuRWRpdG9yJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IFssIHNlcnZpY2UsIGFjY2Vzc29yXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclNlcnZpY2UoKTtcblx0XHRjb25zdCBlZGl0b3JSZXNvbHZlclNlcnZpY2UgPSBhY2Nlc3Nvci5lZGl0b3JSZXNvbHZlclNlcnZpY2U7XG5cdFx0Y29uc3QgdGV4dEVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci50ZXh0RWRpdG9yU2VydmljZTtcblxuXHRcdGxldCBlZGl0b3JDb3VudCA9IDA7XG5cblx0XHRjb25zdCByZWdpc3RyYXRpb25EaXNwb3NhYmxlID0gZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKFxuXHRcdFx0JyoubWQnLFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ1Rlc3RFZGl0b3InLFxuXHRcdFx0XHRsYWJlbDogJ1Rlc3QgRWRpdG9yJyxcblx0XHRcdFx0ZGV0YWlsOiAnVGVzdCBFZGl0b3IgUHJvdmlkZXInLFxuXHRcdFx0XHRwcmlvcml0eTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmJ1aWx0aW5cblx0XHRcdH0sXG5cdFx0XHR7fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6IChlZGl0b3JJbnB1dCkgPT4ge1xuXHRcdFx0XHRcdGVkaXRvckNvdW50Kys7XG5cdFx0XHRcdFx0cmV0dXJuICh7IGVkaXRvcjogdGV4dEVkaXRvclNlcnZpY2UuY3JlYXRlVGV4dEVkaXRvcihlZGl0b3JJbnB1dCkgfSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNyZWF0ZURpZmZFZGl0b3JJbnB1dDogZGlmZkVkaXRvciA9PiAoeyBlZGl0b3I6IHRleHRFZGl0b3JTZXJ2aWNlLmNyZWF0ZVRleHRFZGl0b3IoZGlmZkVkaXRvcikgfSlcblx0XHRcdH1cblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JDb3VudCwgMCk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSB7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly90ZXN0L3BhdGgvcmVzb3VyY2UxLnR4dCcpIH07XG5cdFx0Y29uc3QgaW5wdXQyID0geyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vdGVzdC9wYXRoL3Jlc291cmNlMS5tZCcpIH07XG5cblx0XHQvLyBPcGVuIGVkaXRvciBpbnB1dCAxIGFuZCBpdCBzaG91bG4ndCB0cmlnZ2VyIG92ZXJyaWRlIGFzIHRoZSBnbG9iIGRvZXNuJ3QgbWF0Y2hcblx0XHRhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yQ291bnQsIDApO1xuXG5cdFx0Ly8gT3BlbiBlZGl0b3IgaW5wdXQgMiBhbmQgaXQgc2hvdWxkIHRyaWdnZXIgb3ZlcnJpZGUgYXMgdGhlIGdsb2IgZG9lc24gbWF0Y2hcblx0XHRhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yQ291bnQsIDEpO1xuXG5cdFx0Ly8gQmVjYXVzZSB3ZSBzcGVjaWZ5IGFuIG92ZXJyaWRlIHdlIHNob3VsZG4ndCBzZWUgaXQgdHJpZ2dlcmVkIGV2ZW4gaWYgaXQgbWF0Y2hlc1xuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcih7IC4uLmlucHV0Miwgb3B0aW9uczogeyBvdmVycmlkZTogJ2RlZmF1bHQnIH0gfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvckNvdW50LCAxKTtcblxuXHRcdHJlZ2lzdHJhdGlvbkRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdlZGl0b3JSZXNvbHZlclNlcnZpY2UgLSBvcGVuRWRpdG9ycycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBbLCBzZXJ2aWNlLCBhY2Nlc3Nvcl0gPSBhd2FpdCBjcmVhdGVFZGl0b3JTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlID0gYWNjZXNzb3IuZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlO1xuXHRcdGNvbnN0IHRleHRFZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IudGV4dEVkaXRvclNlcnZpY2U7XG5cblx0XHRsZXQgZWRpdG9yQ291bnQgPSAwO1xuXG5cdFx0Y29uc3QgcmVnaXN0cmF0aW9uRGlzcG9zYWJsZSA9IGVkaXRvclJlc29sdmVyU2VydmljZS5yZWdpc3RlckVkaXRvcihcblx0XHRcdCcqLm1kJyxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdUZXN0RWRpdG9yJyxcblx0XHRcdFx0bGFiZWw6ICdUZXN0IEVkaXRvcicsXG5cdFx0XHRcdGRldGFpbDogJ1Rlc3QgRWRpdG9yIFByb3ZpZGVyJyxcblx0XHRcdFx0cHJpb3JpdHk6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5idWlsdGluXG5cdFx0XHR9LFxuXHRcdFx0e30sXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUVkaXRvcklucHV0OiAoZWRpdG9ySW5wdXQpID0+IHtcblx0XHRcdFx0XHRlZGl0b3JDb3VudCsrO1xuXHRcdFx0XHRcdHJldHVybiAoeyBlZGl0b3I6IHRleHRFZGl0b3JTZXJ2aWNlLmNyZWF0ZVRleHRFZGl0b3IoZWRpdG9ySW5wdXQpIH0pO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRjcmVhdGVEaWZmRWRpdG9ySW5wdXQ6IGRpZmZFZGl0b3IgPT4gKHsgZWRpdG9yOiB0ZXh0RWRpdG9yU2VydmljZS5jcmVhdGVUZXh0RWRpdG9yKGRpZmZFZGl0b3IpIH0pXG5cdFx0XHR9XG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yQ291bnQsIDApO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ2ZpbGU6Ly90ZXN0L3BhdGgvcmVzb3VyY2UxLnR4dCcpLCBURVNUX0VESVRPUl9JTlBVVF9JRCkudG9VbnR5cGVkKCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ2ZpbGU6Ly90ZXN0L3BhdGgvcmVzb3VyY2UyLnR4dCcpLCBURVNUX0VESVRPUl9JTlBVVF9JRCkudG9VbnR5cGVkKCk7XG5cdFx0Y29uc3QgaW5wdXQzID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ2ZpbGU6Ly90ZXN0L3BhdGgvcmVzb3VyY2UzLm1kJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKS50b1VudHlwZWQoKTtcblx0XHRjb25zdCBpbnB1dDQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnZmlsZTovL3Rlc3QvcGF0aC9yZXNvdXJjZTQubWQnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpLnRvVW50eXBlZCgpO1xuXG5cdFx0YXNzZXJ0Lm9rKGlucHV0MSk7XG5cdFx0YXNzZXJ0Lm9rKGlucHV0Mik7XG5cdFx0YXNzZXJ0Lm9rKGlucHV0Myk7XG5cdFx0YXNzZXJ0Lm9rKGlucHV0NCk7XG5cblx0XHQvLyBPcGVuIGVkaXRvciBpbnB1dHNcblx0XHRhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3JzKFtpbnB1dDEsIGlucHV0MiwgaW5wdXQzLCBpbnB1dDRdKTtcblx0XHQvLyBPbmx5IHR3byBtYXRjaGVkIHRoZSBmYWN0b3J5IGdsb2Jcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yQ291bnQsIDIpO1xuXG5cdFx0cmVnaXN0cmF0aW9uRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VkaXRvclJlc29sdmVyU2VydmljZSAtIHJlcGxhY2VFZGl0b3JzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IFtwYXJ0LCBzZXJ2aWNlLCBhY2Nlc3Nvcl0gPSBhd2FpdCBjcmVhdGVFZGl0b3JTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlID0gYWNjZXNzb3IuZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlO1xuXHRcdGNvbnN0IHRleHRFZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IudGV4dEVkaXRvclNlcnZpY2U7XG5cblx0XHRsZXQgZWRpdG9yQ291bnQgPSAwO1xuXG5cdFx0Y29uc3QgcmVnaXN0cmF0aW9uRGlzcG9zYWJsZSA9IGVkaXRvclJlc29sdmVyU2VydmljZS5yZWdpc3RlckVkaXRvcihcblx0XHRcdCcqLm1kJyxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdUZXN0RWRpdG9yJyxcblx0XHRcdFx0bGFiZWw6ICdUZXN0IEVkaXRvcicsXG5cdFx0XHRcdGRldGFpbDogJ1Rlc3QgRWRpdG9yIFByb3ZpZGVyJyxcblx0XHRcdFx0cHJpb3JpdHk6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5idWlsdGluXG5cdFx0XHR9LFxuXHRcdFx0e30sXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUVkaXRvcklucHV0OiAoZWRpdG9ySW5wdXQpID0+IHtcblx0XHRcdFx0XHRlZGl0b3JDb3VudCsrO1xuXHRcdFx0XHRcdHJldHVybiAoeyBlZGl0b3I6IHRleHRFZGl0b3JTZXJ2aWNlLmNyZWF0ZVRleHRFZGl0b3IoZWRpdG9ySW5wdXQpIH0pO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRjcmVhdGVEaWZmRWRpdG9ySW5wdXQ6IGRpZmZFZGl0b3IgPT4gKHsgZWRpdG9yOiB0ZXh0RWRpdG9yU2VydmljZS5jcmVhdGVUZXh0RWRpdG9yKGRpZmZFZGl0b3IpIH0pXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JDb3VudCwgMCk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnZmlsZTovL3Rlc3QvcGF0aC9yZXNvdXJjZTIubWQnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IHVudHlwZWRJbnB1dDEgPSBpbnB1dDEudG9VbnR5cGVkKCk7XG5cdFx0YXNzZXJ0Lm9rKHVudHlwZWRJbnB1dDEpO1xuXG5cdFx0Ly8gT3BlbiBlZGl0b3IgaW5wdXQgMSBhbmQgaXQgc2hvdWxkbid0IHRyaWdnZXIgYmVjYXVzZSB0eXBlZCBpbnB1dHMgYXJlbid0IG92ZXJyaWRlblxuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JDb3VudCwgMCk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLnJlcGxhY2VFZGl0b3JzKFt7XG5cdFx0XHRlZGl0b3I6IGlucHV0MSxcblx0XHRcdHJlcGxhY2VtZW50OiB1bnR5cGVkSW5wdXQxLFxuXHRcdH1dLCBwYXJ0LmFjdGl2ZUdyb3VwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yQ291bnQsIDEpO1xuXG5cdFx0cmVnaXN0cmF0aW9uRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nsb3NlRWRpdG9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0LCBzZXJ2aWNlXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclNlcnZpY2UoKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2Utb3BlbkVkaXRvcnMnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IG90aGVySW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZTItb3BlbkVkaXRvcnMnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0Ly8gT3BlbiBlZGl0b3JzXG5cdFx0YXdhaXQgc2VydmljZS5vcGVuRWRpdG9ycyhbeyBlZGl0b3I6IGlucHV0IH0sIHsgZWRpdG9yOiBvdGhlcklucHV0IH1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5hY3RpdmVHcm91cC5jb3VudCwgMik7XG5cblx0XHQvLyBDbG9zZSBlZGl0b3Jcblx0XHRhd2FpdCBzZXJ2aWNlLmNsb3NlRWRpdG9yKHsgZWRpdG9yOiBpbnB1dCwgZ3JvdXBJZDogcGFydC5hY3RpdmVHcm91cC5pZCB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5hY3RpdmVHcm91cC5jb3VudCwgMSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmNsb3NlRWRpdG9yKHsgZWRpdG9yOiBpbnB1dCwgZ3JvdXBJZDogcGFydC5hY3RpdmVHcm91cC5pZCB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5hY3RpdmVHcm91cC5jb3VudCwgMSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmNsb3NlRWRpdG9yKHsgZWRpdG9yOiBvdGhlcklucHV0LCBncm91cElkOiBwYXJ0LmFjdGl2ZUdyb3VwLmlkIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLmNvdW50LCAwKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY2xvc2VFZGl0b3IoeyBlZGl0b3I6IG90aGVySW5wdXQsIGdyb3VwSWQ6IDk5OSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5hY3RpdmVHcm91cC5jb3VudCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nsb3NlRWRpdG9ycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydCwgc2VydmljZV0gPSBhd2FpdCBjcmVhdGVFZGl0b3JTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCBpbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlLW9wZW5FZGl0b3JzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBvdGhlcklucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UyLW9wZW5FZGl0b3JzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdC8vIE9wZW4gZWRpdG9yc1xuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcnMoW3sgZWRpdG9yOiBpbnB1dCB9LCB7IGVkaXRvcjogb3RoZXJJbnB1dCB9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuYWN0aXZlR3JvdXAuY291bnQsIDIpO1xuXG5cdFx0Ly8gQ2xvc2UgZWRpdG9yc1xuXHRcdGF3YWl0IHNlcnZpY2UuY2xvc2VFZGl0b3JzKFt7IGVkaXRvcjogaW5wdXQsIGdyb3VwSWQ6IHBhcnQuYWN0aXZlR3JvdXAuaWQgfSwgeyBlZGl0b3I6IG90aGVySW5wdXQsIGdyb3VwSWQ6IHBhcnQuYWN0aXZlR3JvdXAuaWQgfV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLmNvdW50LCAwKTtcblx0fSk7XG5cblx0dGVzdCgnZmluZEVkaXRvcnMgKGluIGdyb3VwKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydCwgc2VydmljZV0gPSBhd2FpdCBjcmVhdGVFZGl0b3JTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCBpbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlLW9wZW5FZGl0b3JzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBvdGhlcklucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UyLW9wZW5FZGl0b3JzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdC8vIE9wZW4gZWRpdG9yc1xuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcnMoW3sgZWRpdG9yOiBpbnB1dCB9LCB7IGVkaXRvcjogb3RoZXJJbnB1dCB9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuYWN0aXZlR3JvdXAuY291bnQsIDIpO1xuXG5cdFx0Ly8gVHJ5IHVzaW5nIGZpbmQgZWRpdG9ycyBmb3Igb3BlbmVkIGVkaXRvcnNcblx0XHR7XG5cdFx0XHRjb25zdCBmb3VuZDEgPSBzZXJ2aWNlLmZpbmRFZGl0b3JzKGlucHV0LnJlc291cmNlLCB1bmRlZmluZWQsIHBhcnQuYWN0aXZlR3JvdXApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kMS5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kMVswXSwgaW5wdXQpO1xuXG5cdFx0XHRjb25zdCBmb3VuZDIgPSBzZXJ2aWNlLmZpbmRFZGl0b3JzKGlucHV0LCB1bmRlZmluZWQsIHBhcnQuYWN0aXZlR3JvdXApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kMiwgaW5wdXQpO1xuXHRcdH1cblx0XHR7XG5cdFx0XHRjb25zdCBmb3VuZDEgPSBzZXJ2aWNlLmZpbmRFZGl0b3JzKG90aGVySW5wdXQucmVzb3VyY2UsIHVuZGVmaW5lZCwgcGFydC5hY3RpdmVHcm91cCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm91bmQxLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm91bmQxWzBdLCBvdGhlcklucHV0KTtcblxuXHRcdFx0Y29uc3QgZm91bmQyID0gc2VydmljZS5maW5kRWRpdG9ycyhvdGhlcklucHV0LCB1bmRlZmluZWQsIHBhcnQuYWN0aXZlR3JvdXApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kMiwgb3RoZXJJbnB1dCk7XG5cdFx0fVxuXG5cdFx0Ly8gTWFrZSBzdXJlIHdlIGRvbid0IGZpbmQgbm9uLW9wZW5lZCBlZGl0b3JzXG5cdFx0e1xuXHRcdFx0Y29uc3QgZm91bmQxID0gc2VydmljZS5maW5kRWRpdG9ycyhVUkkucGFyc2UoJ215Oi8vbm8tc3VjaC1yZXNvdXJjZScpLCB1bmRlZmluZWQsIHBhcnQuYWN0aXZlR3JvdXApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kMS5sZW5ndGgsIDApO1xuXG5cdFx0XHRjb25zdCBmb3VuZDIgPSBzZXJ2aWNlLmZpbmRFZGl0b3JzKHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnbXk6Ly9uby1zdWNoLXJlc291cmNlJyksIHR5cGVJZDogJycsIGVkaXRvcklkOiBURVNUX0VESVRPUl9JTlBVVF9JRCB9LCB1bmRlZmluZWQsIHBhcnQuYWN0aXZlR3JvdXApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kMiwgdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHQvLyBNYWtlIHN1cmUgd2UgZG9uJ3QgZmluZCBlZGl0b3JzIGFjcm9zcyBncm91cHNcblx0XHR7XG5cdFx0XHRjb25zdCBuZXdFZGl0b3IgPSBhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vb3RoZXItZ3JvdXAtcmVzb3VyY2UnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpLCB7IHBpbm5lZDogdHJ1ZSwgcHJlc2VydmVGb2N1czogdHJ1ZSB9LCBTSURFX0dST1VQKTtcblxuXHRcdFx0Y29uc3QgZm91bmQxID0gc2VydmljZS5maW5kRWRpdG9ycyhpbnB1dC5yZXNvdXJjZSwgdW5kZWZpbmVkLCBuZXdFZGl0b3IhLmdyb3VwIS5pZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm91bmQxLmxlbmd0aCwgMCk7XG5cblx0XHRcdGNvbnN0IGZvdW5kMiA9IHNlcnZpY2UuZmluZEVkaXRvcnMoaW5wdXQsIHVuZGVmaW5lZCwgbmV3RWRpdG9yIS5ncm91cCEuaWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kMiwgdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayB3ZSBkb24ndCBmaW5kIGVkaXRvcnMgYWZ0ZXIgY2xvc2luZyB0aGVtXG5cdFx0YXdhaXQgcGFydC5hY3RpdmVHcm91cC5jbG9zZUFsbEVkaXRvcnMoKTtcblx0XHR7XG5cdFx0XHRjb25zdCBmb3VuZDEgPSBzZXJ2aWNlLmZpbmRFZGl0b3JzKGlucHV0LnJlc291cmNlLCB1bmRlZmluZWQsIHBhcnQuYWN0aXZlR3JvdXApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kMS5sZW5ndGgsIDApO1xuXG5cdFx0XHRjb25zdCBmb3VuZDIgPSBzZXJ2aWNlLmZpbmRFZGl0b3JzKGlucHV0LCB1bmRlZmluZWQsIHBhcnQuYWN0aXZlR3JvdXApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kMiwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmRFZGl0b3JzIChhY3Jvc3MgZ3JvdXBzKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydCwgc2VydmljZV0gPSBhd2FpdCBjcmVhdGVFZGl0b3JTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCByb290R3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZS1vcGVuRWRpdG9ycycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3Qgb3RoZXJJbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlMi1vcGVuRWRpdG9ycycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHQvLyBPcGVuIGVkaXRvcnNcblx0XHRhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3JzKFt7IGVkaXRvcjogaW5wdXQgfSwgeyBlZGl0b3I6IG90aGVySW5wdXQgfV0pO1xuXHRcdGNvbnN0IHNpZGVFZGl0b3IgPSBhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQsIHsgcGlubmVkOiB0cnVlIH0sIFNJREVfR1JPVVApO1xuXG5cdFx0Ly8gVHJ5IHVzaW5nIGZpbmQgZWRpdG9ycyBmb3Igb3BlbmVkIGVkaXRvcnNcblx0XHR7XG5cdFx0XHRjb25zdCBmb3VuZDEgPSBzZXJ2aWNlLmZpbmRFZGl0b3JzKGlucHV0LnJlc291cmNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZDEubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZDFbMF0uZWRpdG9yLCBpbnB1dCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm91bmQxWzBdLmdyb3VwSWQsIHNpZGVFZGl0b3I/Lmdyb3VwLmlkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZDFbMV0uZWRpdG9yLCBpbnB1dCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm91bmQxWzFdLmdyb3VwSWQsIHJvb3RHcm91cC5pZCk7XG5cblx0XHRcdGNvbnN0IGZvdW5kMiA9IHNlcnZpY2UuZmluZEVkaXRvcnMoaW5wdXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kMi5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kMlswXS5lZGl0b3IsIGlucHV0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZDJbMF0uZ3JvdXBJZCwgc2lkZUVkaXRvcj8uZ3JvdXAuaWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kMlsxXS5lZGl0b3IsIGlucHV0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZDJbMV0uZ3JvdXBJZCwgcm9vdEdyb3VwLmlkKTtcblx0XHR9XG5cdFx0e1xuXHRcdFx0Y29uc3QgZm91bmQxID0gc2VydmljZS5maW5kRWRpdG9ycyhvdGhlcklucHV0LnJlc291cmNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZDEubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZDFbMF0uZWRpdG9yLCBvdGhlcklucHV0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZDFbMF0uZ3JvdXBJZCwgcm9vdEdyb3VwLmlkKTtcblxuXHRcdFx0Y29uc3QgZm91bmQyID0gc2VydmljZS5maW5kRWRpdG9ycyhvdGhlcklucHV0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZDIubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZDJbMF0uZWRpdG9yLCBvdGhlcklucHV0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZDJbMF0uZ3JvdXBJZCwgcm9vdEdyb3VwLmlkKTtcblx0XHR9XG5cblx0XHQvLyBNYWtlIHN1cmUgd2UgZG9uJ3QgZmluZCBub24tb3BlbmVkIGVkaXRvcnNcblx0XHR7XG5cdFx0XHRjb25zdCBmb3VuZDEgPSBzZXJ2aWNlLmZpbmRFZGl0b3JzKFVSSS5wYXJzZSgnbXk6Ly9uby1zdWNoLXJlc291cmNlJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kMS5sZW5ndGgsIDApO1xuXG5cdFx0XHRjb25zdCBmb3VuZDIgPSBzZXJ2aWNlLmZpbmRFZGl0b3JzKHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnbXk6Ly9uby1zdWNoLXJlc291cmNlJyksIHR5cGVJZDogJycsIGVkaXRvcklkOiBURVNUX0VESVRPUl9JTlBVVF9JRCB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZDIubGVuZ3RoLCAwKTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayB3ZSBkb24ndCBmaW5kIGVkaXRvcnMgYWZ0ZXIgY2xvc2luZyB0aGVtXG5cdFx0YXdhaXQgcm9vdEdyb3VwLmNsb3NlQWxsRWRpdG9ycygpO1xuXHRcdGF3YWl0IHNpZGVFZGl0b3I/Lmdyb3VwLmNsb3NlQWxsRWRpdG9ycygpO1xuXHRcdHtcblx0XHRcdGNvbnN0IGZvdW5kMSA9IHNlcnZpY2UuZmluZEVkaXRvcnMoaW5wdXQucmVzb3VyY2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kMS5sZW5ndGgsIDApO1xuXG5cdFx0XHRjb25zdCBmb3VuZDIgPSBzZXJ2aWNlLmZpbmRFZGl0b3JzKGlucHV0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZDIubGVuZ3RoLCAwKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmRFZGl0b3JzIChzdXBwb3J0IHNpZGUgYnkgc2lkZSB2aWEgb3B0aW9ucyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgWywgc2VydmljZV0gPSBhd2FpdCBjcmVhdGVFZGl0b3JTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCBzZWNvbmRhcnlJbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlLWZpbmRFZGl0b3JzLXNlY29uZGFyeScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgcHJpbWFyeUlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UtZmluZEVkaXRvcnMtcHJpbWFyeScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRjb25zdCBzaWRlQnlTaWRlSW5wdXQgPSBuZXcgU2lkZUJ5U2lkZUVkaXRvcklucHV0KHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBzZWNvbmRhcnlJbnB1dCwgcHJpbWFyeUlucHV0LCBzZXJ2aWNlKTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkVkaXRvcihzaWRlQnlTaWRlSW5wdXQsIHsgcGlubmVkOiB0cnVlIH0pO1xuXG5cdFx0bGV0IGZvdW5kRWRpdG9ycyA9IHNlcnZpY2UuZmluZEVkaXRvcnMoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlLWZpbmRFZGl0b3JzLXByaW1hcnknKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kRWRpdG9ycy5sZW5ndGgsIDApO1xuXG5cdFx0Zm91bmRFZGl0b3JzID0gc2VydmljZS5maW5kRWRpdG9ycyhVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UtZmluZEVkaXRvcnMtcHJpbWFyeScpLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kRWRpdG9ycy5sZW5ndGgsIDEpO1xuXG5cdFx0Zm91bmRFZGl0b3JzID0gc2VydmljZS5maW5kRWRpdG9ycyhVUkkucGFyc2UoJ215Oi8vcmVzb3VyY2UtZmluZEVkaXRvcnMtc2Vjb25kYXJ5JyksIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm91bmRFZGl0b3JzLmxlbmd0aCwgMCk7XG5cblx0XHRmb3VuZEVkaXRvcnMgPSBzZXJ2aWNlLmZpbmRFZGl0b3JzKFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZS1maW5kRWRpdG9ycy1wcmltYXJ5JyksIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuU0VDT05EQVJZIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZEVkaXRvcnMubGVuZ3RoLCAwKTtcblxuXHRcdGZvdW5kRWRpdG9ycyA9IHNlcnZpY2UuZmluZEVkaXRvcnMoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlLWZpbmRFZGl0b3JzLXNlY29uZGFyeScpLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlNFQ09OREFSWSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm91bmRFZGl0b3JzLmxlbmd0aCwgMSk7XG5cblx0XHRmb3VuZEVkaXRvcnMgPSBzZXJ2aWNlLmZpbmRFZGl0b3JzKFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZS1maW5kRWRpdG9ycy1wcmltYXJ5JyksIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuQU5ZIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZEVkaXRvcnMubGVuZ3RoLCAxKTtcblxuXHRcdGZvdW5kRWRpdG9ycyA9IHNlcnZpY2UuZmluZEVkaXRvcnMoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlLWZpbmRFZGl0b3JzLXNlY29uZGFyeScpLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLkFOWSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm91bmRFZGl0b3JzLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpZGUgYnkgc2lkZSBlZGl0b3IgaXMgbm90IG1hdGNoaW5nIGFsbCBvdGhlciBlZGl0b3JzIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTMyODU5KScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydCwgc2VydmljZV0gPSBhd2FpdCBjcmVhdGVFZGl0b3JTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCByb290R3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZS1vcGVuRWRpdG9ycycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3Qgb3RoZXJJbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlMi1vcGVuRWRpdG9ycycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3Qgc2lkZUJ5U2lkZUlucHV0ID0gbmV3IFNpZGVCeVNpZGVFZGl0b3JJbnB1dCh1bmRlZmluZWQsIHVuZGVmaW5lZCwgaW5wdXQsIGlucHV0LCBzZXJ2aWNlKTtcblx0XHRjb25zdCBvdGhlclNpZGVCeVNpZGVJbnB1dCA9IG5ldyBTaWRlQnlTaWRlRWRpdG9ySW5wdXQodW5kZWZpbmVkLCB1bmRlZmluZWQsIG90aGVySW5wdXQsIG90aGVySW5wdXQsIHNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKHNpZGVCeVNpZGVJbnB1dCwgdW5kZWZpbmVkLCBTSURFX0dST1VQKTtcblxuXHRcdHBhcnQuYWN0aXZhdGVHcm91cChyb290R3JvdXApO1xuXG5cdFx0YXdhaXQgc2VydmljZS5vcGVuRWRpdG9yKG90aGVyU2lkZUJ5U2lkZUlucHV0LCB7IHJldmVhbElmT3BlbmVkOiB0cnVlLCByZXZlYWxJZlZpc2libGU6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdEdyb3VwLmNvdW50LCAxKTtcblx0fSk7XG5cblx0dGVzdCgnb25EaWRDbG9zZUVkaXRvciBpbmRpY2F0ZXMgcHJvcGVyIGNvbnRleHQgd2hlbiBtb3ZpbmcgZWRpdG9yIGFjcm9zcyBncm91cHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnQsIHNlcnZpY2VdID0gYXdhaXQgY3JlYXRlRWRpdG9yU2VydmljZSgpO1xuXG5cdFx0Y29uc3Qgcm9vdEdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlLW9uRGlkQ2xvc2VFZGl0b3IxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDIgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZS1vbkRpZENsb3NlRWRpdG9yMicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQyLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblxuXHRcdGNvbnN0IHNpZGVncm91cCA9IHBhcnQuYWRkR3JvdXAocm9vdEdyb3VwLCBHcm91cERpcmVjdGlvbi5SSUdIVCk7XG5cblx0XHRjb25zdCBldmVudHM6IElFZGl0b3JDbG9zZUV2ZW50W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZENsb3NlRWRpdG9yKGUgPT4ge1xuXHRcdFx0ZXZlbnRzLnB1c2goZSk7XG5cdFx0fSkpO1xuXG5cdFx0cm9vdEdyb3VwLm1vdmVFZGl0b3IoaW5wdXQxLCBzaWRlZ3JvdXApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50c1swXS5jb250ZXh0LCBFZGl0b3JDbG9zZUNvbnRleHQuTU9WRSk7XG5cblx0XHRhd2FpdCBzaWRlZ3JvdXAuY2xvc2VFZGl0b3IoaW5wdXQxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHNbMV0uY29udGV4dCwgRWRpdG9yQ2xvc2VDb250ZXh0LlVOS05PV04pO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkRpZENsb3NlRWRpdG9yIGluZGljYXRlcyBwcm9wZXIgY29udGV4dCB3aGVuIHJlcGxhY2luZyBhbiBlZGl0b3InLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnQsIHNlcnZpY2VdID0gYXdhaXQgY3JlYXRlRWRpdG9yU2VydmljZSgpO1xuXG5cdFx0Y29uc3Qgcm9vdEdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdteTovL3Jlc291cmNlLW9uRGlkQ2xvc2VFZGl0b3IxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDIgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZSgnbXk6Ly9yZXNvdXJjZS1vbkRpZENsb3NlRWRpdG9yMicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblxuXHRcdGNvbnN0IGV2ZW50czogSUVkaXRvckNsb3NlRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQ2xvc2VFZGl0b3IoZSA9PiB7XG5cdFx0XHRldmVudHMucHVzaChlKTtcblx0XHR9KSk7XG5cblx0XHRhd2FpdCByb290R3JvdXAucmVwbGFjZUVkaXRvcnMoW3sgZWRpdG9yOiBpbnB1dDEsIHJlcGxhY2VtZW50OiBpbnB1dDIgfV0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50c1swXS5jb250ZXh0LCBFZGl0b3JDbG9zZUNvbnRleHQuUkVQTEFDRSk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG4iXSwKICAibWFwcGluZ3Mi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T0FBTyxDQUFDLEVBQUUsU0FBUyxtQkFBbUIsT0FBTztBQUFBLEVBQ2pFLENBQUM7QUFFRCxPQUFLLHNFQUFzRSxZQUFZO0FBQ3RGLFVBQU0sQ0FBQyxNQUFNLE9BQU8sSUFBSSxNQUFNLG9CQUFvQjtBQUVsRCxVQUFNLFlBQVksS0FBSztBQUV2QixVQUFNLFNBQVMsMEJBQTBCLElBQUksTUFBTSxpQ0FBaUMsR0FBRyxvQkFBb0I7QUFDM0csVUFBTSxTQUFTLDBCQUEwQixJQUFJLE1BQU0saUNBQWlDLEdBQUcsb0JBQW9CO0FBRTNHLFVBQU0sUUFBUSxXQUFXLFFBQVEsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUVqRCxVQUFNLFNBQThCLENBQUM7QUFDckMsZ0JBQVksSUFBSSxRQUFRLGlCQUFpQixPQUFLO0FBQzdDLGFBQU8sS0FBSyxDQUFDO0FBQUEsSUFDZCxDQUFDLENBQUM7QUFFRixVQUFNLFVBQVUsZUFBZSxDQUFDLEVBQUUsUUFBUSxRQUFRLGFBQWEsT0FBTyxDQUFDLENBQUM7QUFFeEUsV0FBTyxZQUFZLE9BQU8sQ0FBQyxFQUFFLFNBQVMsbUJBQW1CLE9BQU87QUFBQSxFQUNqRSxDQUFDO0FBRUQsMENBQXdDO0FBQ3pDLENBQUM7IiwKICAibmFtZXMiOiBbImdyb3VwIiwgImlucHV0IiwgImluc3RhbnRpYXRpb25TZXJ2aWNlIl0KfQo=
