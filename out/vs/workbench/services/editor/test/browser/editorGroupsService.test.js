import assert from "assert";
import { workbenchInstantiationService, registerTestEditor, TestFileEditorInput, TestServiceAccessor, workbenchTeardown, createEditorParts } from "../../../../test/browser/workbenchTestServices.js";
import { GroupDirection, GroupsOrder, MergeGroupMode, GroupOrientation, GroupLocation, isEditorGroup, IEditorGroupsService, GroupsArrangement, GroupActivationReason } from "../../common/editorGroupsService.js";
import { CloseDirection, EditorsOrder, EditorInputCapabilities, GroupModelChangeKind, SideBySideEditor, EditorExtensions } from "../../../../common/editor.js";
import { URI } from "../../../../../base/common/uri.js";
import { SyncDescriptor } from "../../../../../platform/instantiation/common/descriptors.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { MockScopableContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { ConfirmResult } from "../../../../../platform/dialogs/common/dialogs.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { SideBySideEditorInput } from "../../../../common/editor/sideBySideEditorInput.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { IContextKeyService, RawContextKey } from "../../../../../platform/contextkey/common/contextkey.js";
import { Emitter } from "../../../../../base/common/event.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { CloseAllEditorGroupsAction } from "../../../../browser/parts/editor/editorActions.js";
suite("EditorGroupsService", () => {
  const TEST_EDITOR_ID = "MyFileEditorForEditorGroupService";
  const TEST_EDITOR_INPUT_ID = "testEditorInputForEditorGroupService";
  const disposables = new DisposableStore();
  let testLocalInstantiationService = void 0;
  setup(() => {
    disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput), new SyncDescriptor(SideBySideEditorInput)], TEST_EDITOR_INPUT_ID));
  });
  teardown(async () => {
    if (testLocalInstantiationService) {
      await workbenchTeardown(testLocalInstantiationService);
      testLocalInstantiationService = void 0;
    }
    disposables.clear();
  });
  async function createParts(instantiationService = workbenchInstantiationService(void 0, disposables)) {
    instantiationService.invokeFunction((accessor) => Registry.as(EditorExtensions.EditorFactory).start(accessor));
    const parts = await createEditorParts(instantiationService, disposables);
    instantiationService.stub(IEditorGroupsService, parts);
    testLocalInstantiationService = instantiationService;
    return [parts, instantiationService];
  }
  async function createPart(instantiationService) {
    const [parts, testInstantiationService] = await createParts(instantiationService);
    return [parts.testMainPart, testInstantiationService];
  }
  function createTestFileEditorInput(resource, typeId) {
    return disposables.add(new TestFileEditorInput(resource, typeId));
  }
  function createCannotCloseTestFileEditorInput(resource, typeId) {
    const input = createTestFileEditorInput(resource, typeId);
    input.capabilities = EditorInputCapabilities.CannotClose;
    return input;
  }
  test("groups basics", async function() {
    const instantiationService = workbenchInstantiationService({ contextKeyService: (instantiationService2) => instantiationService2.createInstance(MockScopableContextKeyService) }, disposables);
    const [part] = await createPart(instantiationService);
    let activeGroupModelChangeCounter = 0;
    const activeGroupModelChangeListener = part.onDidChangeActiveGroup(() => {
      activeGroupModelChangeCounter++;
    });
    let groupAddedCounter = 0;
    const groupAddedListener = part.onDidAddGroup(() => {
      groupAddedCounter++;
    });
    let groupRemovedCounter = 0;
    const groupRemovedListener = part.onDidRemoveGroup(() => {
      groupRemovedCounter++;
    });
    let groupMovedCounter = 0;
    const groupMovedListener = part.onDidMoveGroup(() => {
      groupMovedCounter++;
    });
    const rootGroup = part.groups[0];
    assert.strictEqual(isEditorGroup(rootGroup), true);
    assert.strictEqual(part.groups.length, 1);
    assert.strictEqual(part.count, 1);
    assert.strictEqual(rootGroup, part.getGroup(rootGroup.id));
    assert.ok(part.activeGroup === rootGroup);
    assert.strictEqual(rootGroup.label, "Group 1");
    let mru = part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
    assert.strictEqual(mru.length, 1);
    assert.strictEqual(mru[0], rootGroup);
    const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    assert.strictEqual(rightGroup, part.getGroup(rightGroup.id));
    assert.strictEqual(groupAddedCounter, 1);
    assert.strictEqual(part.groups.length, 2);
    assert.strictEqual(part.count, 2);
    assert.ok(part.activeGroup === rootGroup);
    assert.strictEqual(rootGroup.label, "Group 1");
    assert.strictEqual(rightGroup.label, "Group 2");
    mru = part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
    assert.strictEqual(mru.length, 2);
    assert.strictEqual(mru[0], rootGroup);
    assert.strictEqual(mru[1], rightGroup);
    assert.strictEqual(activeGroupModelChangeCounter, 0);
    let rootGroupActiveChangeCounter = 0;
    const rootGroupModelChangeListener = rootGroup.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.GROUP_ACTIVE) {
        rootGroupActiveChangeCounter++;
      }
    });
    let rightGroupActiveChangeCounter = 0;
    const rightGroupModelChangeListener = rightGroup.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.GROUP_ACTIVE) {
        rightGroupActiveChangeCounter++;
      }
    });
    part.activateGroup(rightGroup);
    assert.ok(part.activeGroup === rightGroup);
    assert.strictEqual(activeGroupModelChangeCounter, 1);
    assert.strictEqual(rootGroupActiveChangeCounter, 1);
    assert.strictEqual(rightGroupActiveChangeCounter, 1);
    rootGroupModelChangeListener.dispose();
    rightGroupModelChangeListener.dispose();
    mru = part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
    assert.strictEqual(mru.length, 2);
    assert.strictEqual(mru[0], rightGroup);
    assert.strictEqual(mru[1], rootGroup);
    const downGroup = part.addGroup(rightGroup, GroupDirection.DOWN);
    let didDispose = false;
    disposables.add(downGroup.onWillDispose(() => {
      didDispose = true;
    }));
    assert.strictEqual(groupAddedCounter, 2);
    assert.strictEqual(part.groups.length, 3);
    assert.ok(part.activeGroup === rightGroup);
    assert.ok(!downGroup.activeEditorPane);
    assert.strictEqual(rootGroup.label, "Group 1");
    assert.strictEqual(rightGroup.label, "Group 2");
    assert.strictEqual(downGroup.label, "Group 3");
    mru = part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
    assert.strictEqual(mru.length, 3);
    assert.strictEqual(mru[0], rightGroup);
    assert.strictEqual(mru[1], rootGroup);
    assert.strictEqual(mru[2], downGroup);
    const gridOrder = part.getGroups(GroupsOrder.GRID_APPEARANCE);
    assert.strictEqual(gridOrder.length, 3);
    assert.strictEqual(gridOrder[0], rootGroup);
    assert.strictEqual(gridOrder[0].index, 0);
    assert.strictEqual(gridOrder[1], rightGroup);
    assert.strictEqual(gridOrder[1].index, 1);
    assert.strictEqual(gridOrder[2], downGroup);
    assert.strictEqual(gridOrder[2].index, 2);
    part.moveGroup(downGroup, rightGroup, GroupDirection.DOWN);
    assert.strictEqual(groupMovedCounter, 1);
    part.removeGroup(downGroup);
    assert.ok(!part.getGroup(downGroup.id));
    assert.ok(!part.hasGroup(downGroup.id));
    assert.strictEqual(didDispose, true);
    assert.strictEqual(groupRemovedCounter, 1);
    assert.strictEqual(part.groups.length, 2);
    assert.ok(part.activeGroup === rightGroup);
    assert.strictEqual(rootGroup.label, "Group 1");
    assert.strictEqual(rightGroup.label, "Group 2");
    mru = part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
    assert.strictEqual(mru.length, 2);
    assert.strictEqual(mru[0], rightGroup);
    assert.strictEqual(mru[1], rootGroup);
    const rightGroupContextKeyService = part.activeGroup.scopedContextKeyService;
    const rootGroupContextKeyService = rootGroup.scopedContextKeyService;
    assert.ok(rightGroupContextKeyService);
    assert.ok(rootGroupContextKeyService);
    assert.ok(rightGroupContextKeyService !== rootGroupContextKeyService);
    part.removeGroup(rightGroup);
    assert.strictEqual(groupRemovedCounter, 2);
    assert.strictEqual(part.groups.length, 1);
    assert.ok(part.activeGroup === rootGroup);
    mru = part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
    assert.strictEqual(mru.length, 1);
    assert.strictEqual(mru[0], rootGroup);
    part.removeGroup(rootGroup);
    assert.strictEqual(part.groups.length, 1);
    assert.strictEqual(groupRemovedCounter, 2);
    assert.ok(part.activeGroup === rootGroup);
    part.setGroupOrientation(part.orientation === GroupOrientation.HORIZONTAL ? GroupOrientation.VERTICAL : GroupOrientation.HORIZONTAL);
    activeGroupModelChangeListener.dispose();
    groupAddedListener.dispose();
    groupRemovedListener.dispose();
    groupMovedListener.dispose();
  });
  test("sideGroup", async () => {
    const instantiationService = workbenchInstantiationService({ contextKeyService: (instantiationService2) => instantiationService2.createInstance(MockScopableContextKeyService) }, disposables);
    const [part] = await createPart(instantiationService);
    const rootGroup = part.activeGroup;
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    await rootGroup.openEditor(input1, { pinned: true });
    await part.sideGroup.openEditor(input2, { pinned: true });
    assert.strictEqual(part.count, 2);
    part.activateGroup(rootGroup);
    await part.sideGroup.openEditor(input3, { pinned: true });
    assert.strictEqual(part.count, 2);
  });
  test("save & restore state", async function() {
    const [part, instantiationService] = await createPart();
    const rootGroup = part.groups[0];
    const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    const downGroup = part.addGroup(rightGroup, GroupDirection.DOWN);
    const rootGroupInput = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    await rootGroup.openEditor(rootGroupInput, { pinned: true });
    const rightGroupInput = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    await rightGroup.openEditor(rightGroupInput, { pinned: true });
    assert.strictEqual(part.groups.length, 3);
    part.testSaveState();
    part.dispose();
    const [restoredPart] = await createPart(instantiationService);
    assert.strictEqual(restoredPart.groups.length, 3);
    assert.ok(restoredPart.getGroup(rootGroup.id));
    assert.ok(restoredPart.hasGroup(rootGroup.id));
    assert.ok(restoredPart.getGroup(rightGroup.id));
    assert.ok(restoredPart.hasGroup(rightGroup.id));
    assert.ok(restoredPart.getGroup(downGroup.id));
    assert.ok(restoredPart.hasGroup(downGroup.id));
    restoredPart.clearState();
  });
  test("groups index / labels", async function() {
    const [part] = await createPart();
    const rootGroup = part.groups[0];
    const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    const downGroup = part.addGroup(rightGroup, GroupDirection.DOWN);
    let groupIndexChangedCounter = 0;
    const groupIndexChangedListener = part.onDidChangeGroupIndex(() => {
      groupIndexChangedCounter++;
    });
    let indexChangeCounter = 0;
    const labelChangeListener = downGroup.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.GROUP_INDEX) {
        indexChangeCounter++;
      }
    });
    assert.strictEqual(rootGroup.index, 0);
    assert.strictEqual(rightGroup.index, 1);
    assert.strictEqual(downGroup.index, 2);
    assert.strictEqual(rootGroup.label, "Group 1");
    assert.strictEqual(rightGroup.label, "Group 2");
    assert.strictEqual(downGroup.label, "Group 3");
    part.removeGroup(rightGroup);
    assert.strictEqual(rootGroup.index, 0);
    assert.strictEqual(downGroup.index, 1);
    assert.strictEqual(rootGroup.label, "Group 1");
    assert.strictEqual(downGroup.label, "Group 2");
    assert.strictEqual(indexChangeCounter, 1);
    assert.strictEqual(groupIndexChangedCounter, 1);
    part.moveGroup(downGroup, rootGroup, GroupDirection.UP);
    assert.strictEqual(downGroup.index, 0);
    assert.strictEqual(rootGroup.index, 1);
    assert.strictEqual(downGroup.label, "Group 1");
    assert.strictEqual(rootGroup.label, "Group 2");
    assert.strictEqual(indexChangeCounter, 2);
    assert.strictEqual(groupIndexChangedCounter, 3);
    const newFirstGroup = part.addGroup(downGroup, GroupDirection.UP);
    assert.strictEqual(newFirstGroup.index, 0);
    assert.strictEqual(downGroup.index, 1);
    assert.strictEqual(rootGroup.index, 2);
    assert.strictEqual(newFirstGroup.label, "Group 1");
    assert.strictEqual(downGroup.label, "Group 2");
    assert.strictEqual(rootGroup.label, "Group 3");
    assert.strictEqual(indexChangeCounter, 3);
    assert.strictEqual(groupIndexChangedCounter, 6);
    labelChangeListener.dispose();
    groupIndexChangedListener.dispose();
  });
  test("groups label", async function() {
    const [part] = await createPart();
    const rootGroup = part.groups[0];
    const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    let partLabelChangedCounter = 0;
    const groupIndexChangedListener = part.onDidChangeGroupLabel(() => {
      partLabelChangedCounter++;
    });
    let rootGroupLabelChangeCounter = 0;
    const rootGroupLabelChangeListener = rootGroup.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.GROUP_LABEL) {
        rootGroupLabelChangeCounter++;
      }
    });
    let rightGroupLabelChangeCounter = 0;
    const rightGroupLabelChangeListener = rightGroup.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.GROUP_LABEL) {
        rightGroupLabelChangeCounter++;
      }
    });
    assert.strictEqual(rootGroup.label, "Group 1");
    assert.strictEqual(rightGroup.label, "Group 2");
    part.notifyGroupsLabelChange("Window 2");
    assert.strictEqual(rootGroup.label, "Window 2: Group 1");
    assert.strictEqual(rightGroup.label, "Window 2: Group 2");
    assert.strictEqual(rootGroupLabelChangeCounter, 1);
    assert.strictEqual(rightGroupLabelChangeCounter, 1);
    assert.strictEqual(partLabelChangedCounter, 2);
    part.notifyGroupsLabelChange("Window 3");
    assert.strictEqual(rootGroup.label, "Window 3: Group 1");
    assert.strictEqual(rightGroup.label, "Window 3: Group 2");
    assert.strictEqual(rootGroupLabelChangeCounter, 2);
    assert.strictEqual(rightGroupLabelChangeCounter, 2);
    assert.strictEqual(partLabelChangedCounter, 4);
    rootGroupLabelChangeListener.dispose();
    rightGroupLabelChangeListener.dispose();
    groupIndexChangedListener.dispose();
  });
  test("copy/merge groups", async () => {
    const [part] = await createPart();
    let groupAddedCounter = 0;
    const groupAddedListener = part.onDidAddGroup(() => {
      groupAddedCounter++;
    });
    let groupRemovedCounter = 0;
    const groupRemovedListener = part.onDidRemoveGroup(() => {
      groupRemovedCounter++;
    });
    const rootGroup = part.groups[0];
    let rootGroupDisposed = false;
    const disposeListener = rootGroup.onWillDispose(() => {
      rootGroupDisposed = true;
    });
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    await rootGroup.openEditor(input, { pinned: true });
    const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    part.activateGroup(rightGroup);
    const downGroup = part.copyGroup(rootGroup, rightGroup, GroupDirection.DOWN);
    assert.strictEqual(groupAddedCounter, 2);
    assert.strictEqual(downGroup.count, 1);
    assert.ok(downGroup.activeEditor instanceof TestFileEditorInput);
    let res = part.mergeGroup(rootGroup, rightGroup, { mode: MergeGroupMode.COPY_EDITORS });
    assert.strictEqual(res, true);
    assert.strictEqual(rightGroup.count, 1);
    assert.ok(rightGroup.activeEditor instanceof TestFileEditorInput);
    res = part.mergeGroup(rootGroup, rightGroup, { mode: MergeGroupMode.MOVE_EDITORS });
    assert.strictEqual(res, true);
    assert.strictEqual(rootGroup.count, 0);
    res = part.mergeGroup(rootGroup, downGroup);
    assert.strictEqual(res, true);
    assert.strictEqual(groupRemovedCounter, 1);
    assert.strictEqual(rootGroupDisposed, true);
    groupAddedListener.dispose();
    groupRemovedListener.dispose();
    disposeListener.dispose();
    part.dispose();
  });
  test("merge all groups", async () => {
    const [part] = await createPart();
    const rootGroup = part.groups[0];
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    await rootGroup.openEditor(input1, { pinned: true });
    const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    await rightGroup.openEditor(input2, { pinned: true });
    const downGroup = part.copyGroup(rootGroup, rightGroup, GroupDirection.DOWN);
    await downGroup.openEditor(input3, { pinned: true });
    part.activateGroup(rootGroup);
    assert.strictEqual(rootGroup.count, 1);
    const result = part.mergeAllGroups(part.activeGroup);
    assert.strictEqual(result, true);
    assert.strictEqual(rootGroup.count, 3);
    part.dispose();
  });
  test("whenReady / whenRestored", async () => {
    const [part] = await createPart();
    await part.whenReady;
    assert.strictEqual(part.isReady, true);
    await part.whenRestored;
  });
  test("options", async () => {
    const [part] = await createPart();
    let oldOptions;
    let newOptions;
    disposables.add(part.onDidChangeEditorPartOptions((event) => {
      oldOptions = event.oldPartOptions;
      newOptions = event.newPartOptions;
    }));
    const currentOptions = part.partOptions;
    assert.ok(currentOptions);
    disposables.add(part.enforcePartOptions({ showTabs: "single" }));
    assert.strictEqual(part.partOptions.showTabs, "single");
    assert.strictEqual(newOptions.showTabs, "single");
    assert.strictEqual(oldOptions, currentOptions);
    const enforced = part.enforcePartOptions({ allowDropIntoGroup: false });
    assert.strictEqual(part.partOptions.allowDropIntoGroup, false);
    enforced.dispose();
    assert.strictEqual(part.partOptions.allowDropIntoGroup, true);
  });
  test("editor basics", async function() {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    let activeEditorChangeCounter = 0;
    let editorDidOpenCounter = 0;
    const editorOpenEvents = [];
    let editorCloseCounter = 0;
    const editorCloseEvents = [];
    let editorPinCounter = 0;
    let editorStickyCounter = 0;
    let editorCapabilitiesCounter = 0;
    const editorGroupModelChangeListener = group.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.EDITOR_OPEN) {
        assert.ok(e.editor);
        editorDidOpenCounter++;
        editorOpenEvents.push(e);
      } else if (e.kind === GroupModelChangeKind.EDITOR_PIN) {
        assert.ok(e.editor);
        editorPinCounter++;
      } else if (e.kind === GroupModelChangeKind.EDITOR_STICKY) {
        assert.ok(e.editor);
        editorStickyCounter++;
      } else if (e.kind === GroupModelChangeKind.EDITOR_CAPABILITIES) {
        assert.ok(e.editor);
        editorCapabilitiesCounter++;
      } else if (e.kind === GroupModelChangeKind.EDITOR_CLOSE) {
        assert.ok(e.editor);
        editorCloseCounter++;
        editorCloseEvents.push(e);
      }
    });
    const activeEditorChangeListener = group.onDidActiveEditorChange((e) => {
      assert.ok(e.editor);
      activeEditorChangeCounter++;
    });
    let editorCloseCounter1 = 0;
    const editorCloseListener = group.onDidCloseEditor(() => {
      editorCloseCounter1++;
    });
    let editorWillCloseCounter = 0;
    const editorWillCloseListener = group.onWillCloseEditor(() => {
      editorWillCloseCounter++;
    });
    let editorDidCloseCounter = 0;
    const editorDidCloseListener = group.onDidCloseEditor(() => {
      editorDidCloseCounter++;
    });
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input, { pinned: true });
    await group.openEditor(inputInactive, { inactive: true });
    assert.strictEqual(group.isActive(input), true);
    assert.strictEqual(group.isActive(inputInactive), false);
    assert.strictEqual(group.contains(input), true);
    assert.strictEqual(group.contains(inputInactive), true);
    assert.strictEqual(group.isEmpty, false);
    assert.strictEqual(group.count, 2);
    assert.strictEqual(editorCapabilitiesCounter, 0);
    assert.strictEqual(editorDidOpenCounter, 2);
    assert.strictEqual(editorOpenEvents[0].editorIndex, 0);
    assert.strictEqual(editorOpenEvents[1].editorIndex, 1);
    assert.strictEqual(editorOpenEvents[0].editor, input);
    assert.strictEqual(editorOpenEvents[1].editor, inputInactive);
    assert.strictEqual(activeEditorChangeCounter, 1);
    assert.strictEqual(group.getEditorByIndex(0), input);
    assert.strictEqual(group.getEditorByIndex(1), inputInactive);
    assert.strictEqual(group.getIndexOfEditor(input), 0);
    assert.strictEqual(group.getIndexOfEditor(inputInactive), 1);
    assert.strictEqual(group.isFirst(input), true);
    assert.strictEqual(group.isFirst(inputInactive), false);
    assert.strictEqual(group.isLast(input), false);
    assert.strictEqual(group.isLast(inputInactive), true);
    input.capabilities = EditorInputCapabilities.RequiresTrust;
    assert.strictEqual(editorCapabilitiesCounter, 1);
    inputInactive.capabilities = EditorInputCapabilities.Singleton;
    assert.strictEqual(editorCapabilitiesCounter, 2);
    assert.strictEqual(group.previewEditor, inputInactive);
    assert.strictEqual(group.isPinned(inputInactive), false);
    group.pinEditor(inputInactive);
    assert.strictEqual(editorPinCounter, 1);
    assert.strictEqual(group.isPinned(inputInactive), true);
    assert.ok(!group.previewEditor);
    assert.strictEqual(group.activeEditor, input);
    assert.strictEqual(group.activeEditorPane?.getId(), TEST_EDITOR_ID);
    assert.strictEqual(group.count, 2);
    const mru = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
    assert.strictEqual(mru[0], input);
    assert.strictEqual(mru[1], inputInactive);
    await group.openEditor(inputInactive);
    assert.strictEqual(activeEditorChangeCounter, 2);
    assert.strictEqual(group.activeEditor, inputInactive);
    await group.openEditor(input);
    const closed = await group.closeEditor(inputInactive);
    assert.strictEqual(closed, true);
    assert.strictEqual(activeEditorChangeCounter, 3);
    assert.strictEqual(editorCloseCounter, 1);
    assert.strictEqual(editorCloseEvents[0].editorIndex, 1);
    assert.strictEqual(editorCloseEvents[0].editor, inputInactive);
    assert.strictEqual(editorCloseCounter1, 1);
    assert.strictEqual(editorWillCloseCounter, 1);
    assert.strictEqual(editorDidCloseCounter, 1);
    assert.ok(inputInactive.gotDisposed);
    assert.strictEqual(group.activeEditor, input);
    assert.strictEqual(editorStickyCounter, 0);
    group.stickEditor(input);
    assert.strictEqual(editorStickyCounter, 1);
    group.unstickEditor(input);
    assert.strictEqual(editorStickyCounter, 2);
    editorCloseListener.dispose();
    editorWillCloseListener.dispose();
    editorDidCloseListener.dispose();
    activeEditorChangeListener.dispose();
    editorGroupModelChangeListener.dispose();
  });
  test("openEditors / closeEditors", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([
      { editor: input, options: { pinned: true } },
      { editor: inputInactive }
    ]);
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.getEditorByIndex(0), input);
    assert.strictEqual(group.getEditorByIndex(1), inputInactive);
    await group.closeEditors([input, inputInactive]);
    assert.ok(input.gotDisposed);
    assert.ok(inputInactive.gotDisposed);
    assert.strictEqual(group.isEmpty, true);
  });
  test("closeEditor - dirty editor handling", async () => {
    const [part, instantiationService] = await createPart();
    const accessor = instantiationService.createInstance(TestServiceAccessor);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);
    const group = part.activeGroup;
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    input.dirty = true;
    await group.openEditor(input);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.CANCEL);
    let closed = await group.closeEditor(input);
    assert.strictEqual(closed, false);
    assert.ok(!input.gotDisposed);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);
    closed = await group.closeEditor(input);
    assert.strictEqual(closed, true);
    assert.ok(input.gotDisposed);
  });
  test("closeEditor (one, opened in multiple groups)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const rightGroup = part.addGroup(group, GroupDirection.RIGHT);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([{ editor: input, options: { pinned: true } }, { editor: inputInactive }]);
    await rightGroup.openEditors([{ editor: input, options: { pinned: true } }, { editor: inputInactive }]);
    let closed = await rightGroup.closeEditor(input);
    assert.strictEqual(closed, true);
    assert.ok(!input.gotDisposed);
    closed = await group.closeEditor(input);
    assert.strictEqual(closed, true);
    assert.ok(input.gotDisposed);
  });
  test("closeEditor - cannot close editor handling", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    const input = createCannotCloseTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input);
    const closed = await group.closeEditor(input);
    assert.strictEqual(closed, false);
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.activeEditor, input);
    assert.ok(!input.gotDisposed);
    const forceClosed = await group.closeEditor(input, { force: true });
    assert.strictEqual(forceClosed, true);
    assert.strictEqual(group.isEmpty, true);
    assert.ok(input.gotDisposed);
  });
  test("closeEditors - dirty editor handling", async () => {
    const [part, instantiationService] = await createPart();
    const accessor = instantiationService.createInstance(TestServiceAccessor);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);
    let closeResult = false;
    const group = part.activeGroup;
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    input1.dirty = true;
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input1);
    await group.openEditor(input2);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.CANCEL);
    closeResult = await group.closeEditors([input1, input2]);
    assert.strictEqual(closeResult, false);
    assert.ok(!input1.gotDisposed);
    assert.ok(!input2.gotDisposed);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);
    closeResult = await group.closeEditors([input1, input2]);
    assert.strictEqual(closeResult, true);
    assert.ok(input1.gotDisposed);
    assert.ok(input2.gotDisposed);
  });
  test("closeEditors (except one)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([
      { editor: input1, options: { pinned: true } },
      { editor: input2, options: { pinned: true } },
      { editor: input3 }
    ]);
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    assert.strictEqual(group.getEditorByIndex(2), input3);
    await group.closeEditors({ except: input2 });
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.getEditorByIndex(0), input2);
  });
  test("closeEditors - cannot close editor handling", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createCannotCloseTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([
      { editor: input1, options: { pinned: true } },
      { editor: input2, options: { pinned: true } }
    ]);
    const closeResult = await group.closeEditors([input1, input2]);
    assert.strictEqual(closeResult, true);
    assert.deepStrictEqual(group.getEditors(EditorsOrder.SEQUENTIAL), [input2]);
    assert.ok(input1.gotDisposed);
    assert.ok(!input2.gotDisposed);
    const forceCloseResult = await group.closeEditors([input2], { force: true });
    assert.strictEqual(forceCloseResult, true);
    assert.strictEqual(group.isEmpty, true);
    assert.ok(input2.gotDisposed);
  });
  test("closeEditors (except one, sticky editor)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([
      { editor: input1, options: { pinned: true, sticky: true } },
      { editor: input2, options: { pinned: true } },
      { editor: input3 }
    ]);
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    assert.strictEqual(group.getEditorByIndex(2), input3);
    await group.closeEditors({ except: input2, excludeSticky: true });
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    await group.closeEditors({ except: input2 });
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.stickyCount, 0);
    assert.strictEqual(group.getEditorByIndex(0), input2);
  });
  test("closeEditors (saved only)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([
      { editor: input1, options: { pinned: true } },
      { editor: input2, options: { pinned: true } },
      { editor: input3 }
    ]);
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    assert.strictEqual(group.getEditorByIndex(2), input3);
    await group.closeEditors({ savedOnly: true });
    assert.strictEqual(group.count, 0);
  });
  test("closeEditors (saved only, sticky editor)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([
      { editor: input1, options: { pinned: true, sticky: true } },
      { editor: input2, options: { pinned: true } },
      { editor: input3 }
    ]);
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    assert.strictEqual(group.getEditorByIndex(2), input3);
    await group.closeEditors({ savedOnly: true, excludeSticky: true });
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    await group.closeEditors({ savedOnly: true });
    assert.strictEqual(group.count, 0);
  });
  test("closeEditors (direction: right)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([
      { editor: input1, options: { pinned: true } },
      { editor: input2, options: { pinned: true } },
      { editor: input3 }
    ]);
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    assert.strictEqual(group.getEditorByIndex(2), input3);
    await group.closeEditors({ direction: CloseDirection.RIGHT, except: input2 });
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
  });
  test("closeEditors (direction: right, sticky editor)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([
      { editor: input1, options: { pinned: true, sticky: true } },
      { editor: input2, options: { pinned: true } },
      { editor: input3 }
    ]);
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    assert.strictEqual(group.getEditorByIndex(2), input3);
    await group.closeEditors({ direction: CloseDirection.RIGHT, except: input2, excludeSticky: true });
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    await group.closeEditors({ direction: CloseDirection.RIGHT, except: input2 });
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
  });
  test("closeEditors (direction: left)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([
      { editor: input1, options: { pinned: true } },
      { editor: input2, options: { pinned: true } },
      { editor: input3 }
    ]);
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    assert.strictEqual(group.getEditorByIndex(2), input3);
    await group.closeEditors({ direction: CloseDirection.LEFT, except: input2 });
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.getEditorByIndex(0), input2);
    assert.strictEqual(group.getEditorByIndex(1), input3);
  });
  test("closeEditors (direction: left, sticky editor)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([
      { editor: input1, options: { pinned: true, sticky: true } },
      { editor: input2, options: { pinned: true } },
      { editor: input3 }
    ]);
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    assert.strictEqual(group.getEditorByIndex(2), input3);
    await group.closeEditors({ direction: CloseDirection.LEFT, except: input2, excludeSticky: true });
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    assert.strictEqual(group.getEditorByIndex(2), input3);
    await group.closeEditors({ direction: CloseDirection.LEFT, except: input2 });
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.getEditorByIndex(0), input2);
    assert.strictEqual(group.getEditorByIndex(1), input3);
  });
  test("closeAllEditors", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([
      { editor: input, options: { pinned: true } },
      { editor: inputInactive }
    ]);
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.getEditorByIndex(0), input);
    assert.strictEqual(group.getEditorByIndex(1), inputInactive);
    await group.closeAllEditors();
    assert.strictEqual(group.isEmpty, true);
  });
  test("closeAllEditors - dirty editor handling", async () => {
    const [part, instantiationService] = await createPart();
    let closeResult = true;
    const accessor = instantiationService.createInstance(TestServiceAccessor);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);
    const group = part.activeGroup;
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    input1.dirty = true;
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input1);
    await group.openEditor(input2);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.CANCEL);
    closeResult = await group.closeAllEditors();
    assert.strictEqual(closeResult, false);
    assert.ok(!input1.gotDisposed);
    assert.ok(!input2.gotDisposed);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);
    closeResult = await group.closeAllEditors();
    assert.strictEqual(closeResult, true);
    assert.ok(input1.gotDisposed);
    assert.ok(input2.gotDisposed);
  });
  test("closeAllEditors (sticky editor)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([
      { editor: input, options: { pinned: true, sticky: true } },
      { editor: inputInactive }
    ]);
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.stickyCount, 1);
    await group.closeAllEditors({ excludeSticky: true });
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.getEditorByIndex(0), input);
    await group.closeAllEditors();
    assert.strictEqual(group.isEmpty, true);
  });
  test("closeAllEditors - cannot close editor handling", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createCannotCloseTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([
      { editor: input1, options: { pinned: true } },
      { editor: input2, options: { pinned: true } }
    ]);
    const closeResult = await group.closeAllEditors();
    assert.strictEqual(closeResult, true);
    assert.deepStrictEqual(group.getEditors(EditorsOrder.SEQUENTIAL), [input2]);
    assert.ok(input1.gotDisposed);
    assert.ok(!input2.gotDisposed);
  });
  test("closeAllEditors - force closes cannot close editors", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    const input = createCannotCloseTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input);
    const closeResult = await group.closeAllEditors({ force: true });
    assert.strictEqual(closeResult, true);
    assert.strictEqual(group.isEmpty, true);
    assert.ok(input.gotDisposed);
  });
  test("moveEditor (same group)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    const moveEvents = [];
    const editorGroupModelChangeListener = group.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.EDITOR_MOVE) {
        assert.ok(e.editor);
        moveEvents.push(e);
      }
    });
    await group.openEditors([{ editor: input, options: { pinned: true } }, { editor: inputInactive }]);
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.getEditorByIndex(0), input);
    assert.strictEqual(group.getEditorByIndex(1), inputInactive);
    group.moveEditor(inputInactive, group, { index: 0 });
    assert.strictEqual(moveEvents.length, 1);
    assert.strictEqual(moveEvents[0].editorIndex, 0);
    assert.strictEqual(moveEvents[0].oldEditorIndex, 1);
    assert.strictEqual(moveEvents[0].editor, inputInactive);
    assert.strictEqual(group.getEditorByIndex(0), inputInactive);
    assert.strictEqual(group.getEditorByIndex(1), input);
    const res = group.moveEditors([{ editor: inputInactive, options: { index: 1 } }], group);
    assert.strictEqual(res, true);
    assert.strictEqual(moveEvents.length, 2);
    assert.strictEqual(moveEvents[1].editorIndex, 1);
    assert.strictEqual(moveEvents[1].oldEditorIndex, 0);
    assert.strictEqual(moveEvents[1].editor, inputInactive);
    assert.strictEqual(group.getEditorByIndex(0), input);
    assert.strictEqual(group.getEditorByIndex(1), inputInactive);
    editorGroupModelChangeListener.dispose();
  });
  test("moveEditor (across groups)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const rightGroup = part.addGroup(group, GroupDirection.RIGHT);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([{ editor: input, options: { pinned: true } }, { editor: inputInactive }]);
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.getEditorByIndex(0), input);
    assert.strictEqual(group.getEditorByIndex(1), inputInactive);
    group.moveEditor(inputInactive, rightGroup, { index: 0 });
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.getEditorByIndex(0), input);
    assert.strictEqual(rightGroup.count, 1);
    assert.strictEqual(rightGroup.getEditorByIndex(0), inputInactive);
  });
  test("moveEditors (across groups)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const rightGroup = part.addGroup(group, GroupDirection.RIGHT);
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([{ editor: input1, options: { pinned: true } }, { editor: input2, options: { pinned: true } }, { editor: input3, options: { pinned: true } }]);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    assert.strictEqual(group.getEditorByIndex(2), input3);
    group.moveEditors([{ editor: input2 }, { editor: input3 }], rightGroup);
    assert.strictEqual(group.count, 1);
    assert.strictEqual(rightGroup.count, 2);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(rightGroup.getEditorByIndex(0), input2);
    assert.strictEqual(rightGroup.getEditorByIndex(1), input3);
  });
  test("copyEditor (across groups)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const rightGroup = part.addGroup(group, GroupDirection.RIGHT);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([{ editor: input, options: { pinned: true } }, { editor: inputInactive }]);
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.getEditorByIndex(0), input);
    assert.strictEqual(group.getEditorByIndex(1), inputInactive);
    group.copyEditor(inputInactive, rightGroup, { index: 0 });
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.getEditorByIndex(0), input);
    assert.strictEqual(group.getEditorByIndex(1), inputInactive);
    assert.strictEqual(rightGroup.count, 1);
    assert.strictEqual(rightGroup.getEditorByIndex(0), inputInactive);
  });
  test("copyEditors (across groups)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const rightGroup = part.addGroup(group, GroupDirection.RIGHT);
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([{ editor: input1, options: { pinned: true } }, { editor: input2, options: { pinned: true } }, { editor: input3, options: { pinned: true } }]);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    assert.strictEqual(group.getEditorByIndex(2), input3);
    group.copyEditors([{ editor: input1 }, { editor: input2 }, { editor: input3 }], rightGroup);
    [group, rightGroup].forEach((group2) => {
      assert.strictEqual(group2.getEditorByIndex(0), input1);
      assert.strictEqual(group2.getEditorByIndex(1), input2);
      assert.strictEqual(group2.getEditorByIndex(2), input3);
    });
  });
  test("replaceEditors", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input);
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.getEditorByIndex(0), input);
    await group.replaceEditors([{ editor: input, replacement: inputInactive }]);
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.getEditorByIndex(0), inputInactive);
  });
  test("replaceEditors - dirty editor handling", async () => {
    const [part, instantiationService] = await createPart();
    const accessor = instantiationService.createInstance(TestServiceAccessor);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);
    const group = part.activeGroup;
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    input1.dirty = true;
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input1);
    assert.strictEqual(group.activeEditor, input1);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.CANCEL);
    await group.replaceEditors([{ editor: input1, replacement: input2 }]);
    assert.strictEqual(group.activeEditor, input1);
    assert.ok(!input1.gotDisposed);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);
    await group.replaceEditors([{ editor: input1, replacement: input2 }]);
    assert.strictEqual(group.activeEditor, input2);
    assert.ok(input1.gotDisposed);
  });
  test("replaceEditors - forceReplaceDirty flag", async () => {
    const [part, instantiationService] = await createPart();
    const accessor = instantiationService.createInstance(TestServiceAccessor);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);
    const group = part.activeGroup;
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    input1.dirty = true;
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input1);
    assert.strictEqual(group.activeEditor, input1);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.CANCEL);
    await group.replaceEditors([{ editor: input1, replacement: input2, forceReplaceDirty: false }]);
    assert.strictEqual(group.activeEditor, input1);
    assert.ok(!input1.gotDisposed);
    await group.replaceEditors([{ editor: input1, replacement: input2, forceReplaceDirty: true }]);
    assert.strictEqual(group.activeEditor, input2);
    assert.ok(input1.gotDisposed);
  });
  test("replaceEditors - proper index handling", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    const input4 = createTestFileEditorInput(URI.file("foo/bar4"), TEST_EDITOR_INPUT_ID);
    const input5 = createTestFileEditorInput(URI.file("foo/bar5"), TEST_EDITOR_INPUT_ID);
    const input6 = createTestFileEditorInput(URI.file("foo/bar6"), TEST_EDITOR_INPUT_ID);
    const input7 = createTestFileEditorInput(URI.file("foo/bar7"), TEST_EDITOR_INPUT_ID);
    const input8 = createTestFileEditorInput(URI.file("foo/bar8"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input1, { pinned: true });
    await group.openEditor(input2, { pinned: true });
    await group.openEditor(input3, { pinned: true });
    await group.openEditor(input4, { pinned: true });
    await group.openEditor(input5, { pinned: true });
    await group.replaceEditors([
      { editor: input1, replacement: input6 },
      { editor: input3, replacement: input7 },
      { editor: input5, replacement: input8 }
    ]);
    assert.strictEqual(group.getEditorByIndex(0), input6);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    assert.strictEqual(group.getEditorByIndex(2), input7);
    assert.strictEqual(group.getEditorByIndex(3), input4);
    assert.strictEqual(group.getEditorByIndex(4), input8);
  });
  test("replaceEditors - should be able to replace when side by side editor is involved with same input side by side", async () => {
    const [part, instantiationService] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const sideBySideInput = instantiationService.createInstance(SideBySideEditorInput, void 0, void 0, input, input);
    await group.openEditor(input);
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.getEditorByIndex(0), input);
    await group.replaceEditors([{ editor: input, replacement: sideBySideInput }]);
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.getEditorByIndex(0), sideBySideInput);
    await group.replaceEditors([{ editor: sideBySideInput, replacement: input }]);
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.getEditorByIndex(0), input);
  });
  test("replaceEditors - cannot close editor handling", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    const input = createCannotCloseTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const replacement = createTestFileEditorInput(URI.file("foo/baz"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input);
    await group.replaceEditors([{ editor: input, replacement }]);
    assert.deepStrictEqual(group.getEditors(EditorsOrder.SEQUENTIAL), [replacement]);
    assert.ok(input.gotDisposed);
  });
  test("find editors", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    const group2 = part.addGroup(group, GroupDirection.RIGHT);
    assert.strictEqual(group.isEmpty, true);
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar1"), `${TEST_EDITOR_INPUT_ID}-1`);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    const input4 = createTestFileEditorInput(URI.file("foo/bar4"), TEST_EDITOR_INPUT_ID);
    const input5 = createTestFileEditorInput(URI.file("foo/bar4"), `${TEST_EDITOR_INPUT_ID}-1`);
    await group.openEditor(input1, { pinned: true });
    await group.openEditor(input2, { pinned: true });
    await group.openEditor(input3, { pinned: true });
    await group.openEditor(input4, { pinned: true });
    await group2.openEditor(input5, { pinned: true });
    let foundEditors = group.findEditors(URI.file("foo/bar1"));
    assert.strictEqual(foundEditors.length, 2);
    foundEditors = group2.findEditors(URI.file("foo/bar4"));
    assert.strictEqual(foundEditors.length, 1);
  });
  test("find editors (side by side support)", async () => {
    const [part, instantiationService] = await createPart();
    const accessor = instantiationService.createInstance(TestServiceAccessor);
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const secondaryInput = createTestFileEditorInput(URI.file("foo/bar-secondary"), TEST_EDITOR_INPUT_ID);
    const primaryInput = createTestFileEditorInput(URI.file("foo/bar-primary"), `${TEST_EDITOR_INPUT_ID}-1`);
    const sideBySideEditor = new SideBySideEditorInput(void 0, void 0, secondaryInput, primaryInput, accessor.editorService);
    await group.openEditor(sideBySideEditor, { pinned: true });
    let foundEditors = group.findEditors(URI.file("foo/bar-secondary"));
    assert.strictEqual(foundEditors.length, 0);
    foundEditors = group.findEditors(URI.file("foo/bar-secondary"), { supportSideBySide: SideBySideEditor.PRIMARY });
    assert.strictEqual(foundEditors.length, 0);
    foundEditors = group.findEditors(URI.file("foo/bar-primary"), { supportSideBySide: SideBySideEditor.PRIMARY });
    assert.strictEqual(foundEditors.length, 1);
    foundEditors = group.findEditors(URI.file("foo/bar-secondary"), { supportSideBySide: SideBySideEditor.SECONDARY });
    assert.strictEqual(foundEditors.length, 1);
    foundEditors = group.findEditors(URI.file("foo/bar-primary"), { supportSideBySide: SideBySideEditor.SECONDARY });
    assert.strictEqual(foundEditors.length, 0);
    foundEditors = group.findEditors(URI.file("foo/bar-secondary"), { supportSideBySide: SideBySideEditor.ANY });
    assert.strictEqual(foundEditors.length, 1);
    foundEditors = group.findEditors(URI.file("foo/bar-primary"), { supportSideBySide: SideBySideEditor.ANY });
    assert.strictEqual(foundEditors.length, 1);
  });
  test("find neighbour group (left/right)", async function() {
    const [part] = await createPart();
    const rootGroup = part.activeGroup;
    const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    assert.strictEqual(rightGroup, part.findGroup({ direction: GroupDirection.RIGHT }, rootGroup));
    assert.strictEqual(rootGroup, part.findGroup({ direction: GroupDirection.LEFT }, rightGroup));
  });
  test("find neighbour group (up/down)", async function() {
    const [part] = await createPart();
    const rootGroup = part.activeGroup;
    const downGroup = part.addGroup(rootGroup, GroupDirection.DOWN);
    assert.strictEqual(downGroup, part.findGroup({ direction: GroupDirection.DOWN }, rootGroup));
    assert.strictEqual(rootGroup, part.findGroup({ direction: GroupDirection.UP }, downGroup));
  });
  test("find group by location (left/right)", async function() {
    const [part] = await createPart();
    const rootGroup = part.activeGroup;
    const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    const downGroup = part.addGroup(rightGroup, GroupDirection.DOWN);
    assert.strictEqual(rootGroup, part.findGroup({ location: GroupLocation.FIRST }));
    assert.strictEqual(downGroup, part.findGroup({ location: GroupLocation.LAST }));
    assert.strictEqual(rightGroup, part.findGroup({ location: GroupLocation.NEXT }, rootGroup));
    assert.strictEqual(rootGroup, part.findGroup({ location: GroupLocation.PREVIOUS }, rightGroup));
    assert.strictEqual(downGroup, part.findGroup({ location: GroupLocation.NEXT }, rightGroup));
    assert.strictEqual(rightGroup, part.findGroup({ location: GroupLocation.PREVIOUS }, downGroup));
  });
  test("applyLayout (2x2)", async function() {
    const [part] = await createPart();
    part.applyLayout({ groups: [{ groups: [{}, {}] }, { groups: [{}, {}] }], orientation: GroupOrientation.HORIZONTAL });
    assert.strictEqual(part.groups.length, 4);
  });
  test("getLayout", async function() {
    const [part] = await createPart();
    part.applyLayout({ groups: [{ groups: [{}, {}] }, { groups: [{}, {}] }], orientation: GroupOrientation.HORIZONTAL });
    let layout = part.getLayout();
    assert.strictEqual(layout.orientation, GroupOrientation.HORIZONTAL);
    assert.strictEqual(layout.groups.length, 2);
    assert.strictEqual(layout.groups[0].groups.length, 2);
    assert.strictEqual(layout.groups[1].groups.length, 2);
    part.applyLayout({ groups: [{}, {}, {}], orientation: GroupOrientation.VERTICAL });
    layout = part.getLayout();
    assert.strictEqual(layout.orientation, GroupOrientation.VERTICAL);
    assert.strictEqual(layout.groups.length, 3);
    assert.ok(typeof layout.groups[0].size === "number");
    assert.ok(typeof layout.groups[1].size === "number");
    assert.ok(typeof layout.groups[2].size === "number");
  });
  test("centeredLayout", async function() {
    const [part] = await createPart();
    part.centerLayout(true);
    assert.strictEqual(part.isLayoutCentered(), true);
  });
  test("sticky editors", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.stickyCount, 0);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL).length, 0);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true }).length, 0);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true }).length, 0);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input, { pinned: true });
    await group.openEditor(inputInactive, { inactive: true });
    assert.strictEqual(group.stickyCount, 0);
    assert.strictEqual(group.isSticky(input), false);
    assert.strictEqual(group.isSticky(inputInactive), false);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL).length, 2);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 2);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true }).length, 2);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true }).length, 2);
    group.stickEditor(input);
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.isSticky(input), true);
    assert.strictEqual(group.isSticky(inputInactive), false);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL).length, 2);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 2);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true }).length, 1);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true }).length, 1);
    group.unstickEditor(input);
    assert.strictEqual(group.stickyCount, 0);
    assert.strictEqual(group.isSticky(input), false);
    assert.strictEqual(group.isSticky(inputInactive), false);
    assert.strictEqual(group.getIndexOfEditor(input), 0);
    assert.strictEqual(group.getIndexOfEditor(inputInactive), 1);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL).length, 2);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 2);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true }).length, 2);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true }).length, 2);
    let editorMoveCounter = 0;
    const editorGroupModelChangeListener = group.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.EDITOR_MOVE) {
        assert.ok(e.editor);
        editorMoveCounter++;
      }
    });
    group.stickEditor(inputInactive);
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.isSticky(input), false);
    assert.strictEqual(group.isSticky(inputInactive), true);
    assert.strictEqual(group.getIndexOfEditor(input), 1);
    assert.strictEqual(group.getIndexOfEditor(inputInactive), 0);
    assert.strictEqual(editorMoveCounter, 1);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL).length, 2);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 2);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true }).length, 1);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true }).length, 1);
    const inputSticky = createTestFileEditorInput(URI.file("foo/bar/sticky"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(inputSticky, { sticky: true });
    assert.strictEqual(group.stickyCount, 2);
    assert.strictEqual(group.isSticky(input), false);
    assert.strictEqual(group.isSticky(inputInactive), true);
    assert.strictEqual(group.isSticky(inputSticky), true);
    assert.strictEqual(group.getIndexOfEditor(inputInactive), 0);
    assert.strictEqual(group.getIndexOfEditor(inputSticky), 1);
    assert.strictEqual(group.getIndexOfEditor(input), 2);
    await group.openEditor(input, { sticky: true });
    assert.strictEqual(group.stickyCount, 3);
    assert.strictEqual(group.isSticky(input), true);
    assert.strictEqual(group.isSticky(inputInactive), true);
    assert.strictEqual(group.isSticky(inputSticky), true);
    assert.strictEqual(group.getIndexOfEditor(inputInactive), 0);
    assert.strictEqual(group.getIndexOfEditor(inputSticky), 1);
    assert.strictEqual(group.getIndexOfEditor(input), 2);
    editorGroupModelChangeListener.dispose();
  });
  test("sticky: true wins over index", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.stickyCount, 0);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    const inputSticky = createTestFileEditorInput(URI.file("foo/bar/sticky"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input, { pinned: true });
    await group.openEditor(inputInactive, { inactive: true });
    await group.openEditor(inputSticky, { sticky: true, index: 2 });
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.isSticky(inputSticky), true);
    assert.strictEqual(group.getIndexOfEditor(input), 1);
    assert.strictEqual(group.getIndexOfEditor(inputInactive), 2);
    assert.strictEqual(group.getIndexOfEditor(inputSticky), 0);
  });
  test("selection: setSelection, isSelected, selectedEditors", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    function isSelection(inputs) {
      for (const input of inputs) {
        if (group.selectedEditors.indexOf(input) === -1) {
          return false;
        }
      }
      return inputs.length === group.selectedEditors.length;
    }
    await group.openEditors([input1, input2, input3].map((editor) => ({ editor, options: { pinned: true } })));
    assert.strictEqual(group.isActive(input1), true);
    assert.strictEqual(group.isSelected(input1), true);
    assert.strictEqual(group.isSelected(input2), false);
    assert.strictEqual(group.isSelected(input3), false);
    assert.strictEqual(isSelection([input1]), true);
    await group.setSelection(input1, [input3]);
    assert.strictEqual(group.isActive(input1), true);
    assert.strictEqual(group.isSelected(input1), true);
    assert.strictEqual(group.isSelected(input2), false);
    assert.strictEqual(group.isSelected(input3), true);
    assert.strictEqual(isSelection([input1, input3]), true);
    await group.setSelection(input2, [input1, input3]);
    assert.strictEqual(group.isSelected(input1), true);
    assert.strictEqual(group.isActive(input2), true);
    assert.strictEqual(group.isSelected(input2), true);
    assert.strictEqual(group.isSelected(input3), true);
    assert.strictEqual(isSelection([input1, input2, input3]), true);
    await group.setSelection(input1, []);
    assert.strictEqual(group.isActive(input1), true);
    assert.strictEqual(group.isSelected(input1), true);
    assert.strictEqual(group.isSelected(input2), false);
    assert.strictEqual(group.isSelected(input3), false);
    assert.strictEqual(isSelection([input1]), true);
  });
  test("moveEditor with context (across groups)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const rightGroup = part.addGroup(group, GroupDirection.RIGHT);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    const thirdInput = createTestFileEditorInput(URI.file("foo/bar/third"), TEST_EDITOR_INPUT_ID);
    let leftFiredCount = 0;
    const leftGroupListener = group.onWillMoveEditor(() => {
      leftFiredCount++;
    });
    let rightFiredCount = 0;
    const rightGroupListener = rightGroup.onWillMoveEditor(() => {
      rightFiredCount++;
    });
    await group.openEditors([{ editor: input, options: { pinned: true } }, { editor: inputInactive }, { editor: thirdInput }]);
    assert.strictEqual(leftFiredCount, 0);
    assert.strictEqual(rightFiredCount, 0);
    let result = group.moveEditor(input, rightGroup);
    assert.strictEqual(result, true);
    assert.strictEqual(leftFiredCount, 1);
    assert.strictEqual(rightFiredCount, 0);
    result = group.moveEditor(inputInactive, rightGroup);
    assert.strictEqual(result, true);
    assert.strictEqual(leftFiredCount, 2);
    assert.strictEqual(rightFiredCount, 0);
    result = rightGroup.moveEditor(inputInactive, group);
    assert.strictEqual(result, true);
    assert.strictEqual(leftFiredCount, 2);
    assert.strictEqual(rightFiredCount, 1);
    leftGroupListener.dispose();
    rightGroupListener.dispose();
  });
  test("moveEditor disabled", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const rightGroup = part.addGroup(group, GroupDirection.RIGHT);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    const thirdInput = createTestFileEditorInput(URI.file("foo/bar/third"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([{ editor: input, options: { pinned: true } }, { editor: inputInactive }, { editor: thirdInput }]);
    input.setMoveDisabled("disabled");
    const result = group.moveEditor(input, rightGroup);
    assert.strictEqual(result, false);
    assert.strictEqual(group.count, 3);
  });
  test("onWillOpenEditor", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const rightGroup = part.addGroup(group, GroupDirection.RIGHT);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const secondInput = createTestFileEditorInput(URI.file("foo/bar/second"), TEST_EDITOR_INPUT_ID);
    const thirdInput = createTestFileEditorInput(URI.file("foo/bar/third"), TEST_EDITOR_INPUT_ID);
    let leftFiredCount = 0;
    const leftGroupListener = group.onWillOpenEditor(() => {
      leftFiredCount++;
    });
    let rightFiredCount = 0;
    const rightGroupListener = rightGroup.onWillOpenEditor(() => {
      rightFiredCount++;
    });
    await group.openEditor(input);
    assert.strictEqual(leftFiredCount, 1);
    assert.strictEqual(rightFiredCount, 0);
    rightGroup.openEditor(secondInput);
    assert.strictEqual(leftFiredCount, 1);
    assert.strictEqual(rightFiredCount, 1);
    group.openEditor(thirdInput);
    assert.strictEqual(leftFiredCount, 2);
    assert.strictEqual(rightFiredCount, 1);
    rightGroup.moveEditor(secondInput, group);
    assert.strictEqual(leftFiredCount, 3);
    assert.strictEqual(rightFiredCount, 1);
    leftGroupListener.dispose();
    rightGroupListener.dispose();
  });
  test("copyEditor with context (across groups)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    let firedCount = 0;
    const moveListener = group.onWillMoveEditor(() => firedCount++);
    const rightGroup = part.addGroup(group, GroupDirection.RIGHT);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([{ editor: input, options: { pinned: true } }, { editor: inputInactive }]);
    assert.strictEqual(firedCount, 0);
    group.copyEditor(inputInactive, rightGroup, { index: 0 });
    assert.strictEqual(firedCount, 0);
    moveListener.dispose();
  });
  test("locked groups - basics", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    const rightGroup = part.addGroup(group, GroupDirection.RIGHT);
    let leftFiredCountFromPart = 0;
    let rightFiredCountFromPart = 0;
    const partListener = part.onDidChangeGroupLocked((g) => {
      if (g === group) {
        leftFiredCountFromPart++;
      } else if (g === rightGroup) {
        rightFiredCountFromPart++;
      }
    });
    let leftFiredCountFromGroup = 0;
    const leftGroupListener = group.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.GROUP_LOCKED) {
        leftFiredCountFromGroup++;
      }
    });
    let rightFiredCountFromGroup = 0;
    const rightGroupListener = rightGroup.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.GROUP_LOCKED) {
        rightFiredCountFromGroup++;
      }
    });
    rightGroup.lock(true);
    rightGroup.lock(true);
    assert.strictEqual(leftFiredCountFromGroup, 0);
    assert.strictEqual(leftFiredCountFromPart, 0);
    assert.strictEqual(rightFiredCountFromGroup, 1);
    assert.strictEqual(rightFiredCountFromPart, 1);
    rightGroup.lock(false);
    rightGroup.lock(false);
    assert.strictEqual(leftFiredCountFromGroup, 0);
    assert.strictEqual(leftFiredCountFromPart, 0);
    assert.strictEqual(rightFiredCountFromGroup, 2);
    assert.strictEqual(rightFiredCountFromPart, 2);
    group.lock(true);
    group.lock(true);
    assert.strictEqual(leftFiredCountFromGroup, 1);
    assert.strictEqual(leftFiredCountFromPart, 1);
    assert.strictEqual(rightFiredCountFromGroup, 2);
    assert.strictEqual(rightFiredCountFromPart, 2);
    group.lock(false);
    group.lock(false);
    assert.strictEqual(leftFiredCountFromGroup, 2);
    assert.strictEqual(leftFiredCountFromPart, 2);
    assert.strictEqual(rightFiredCountFromGroup, 2);
    assert.strictEqual(rightFiredCountFromPart, 2);
    partListener.dispose();
    leftGroupListener.dispose();
    rightGroupListener.dispose();
  });
  test("locked groups - single group is can be locked", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    group.lock(true);
    assert.strictEqual(group.isLocked, true);
    const rightGroup = part.addGroup(group, GroupDirection.RIGHT);
    rightGroup.lock(true);
    assert.strictEqual(rightGroup.isLocked, true);
    part.removeGroup(group);
    assert.strictEqual(rightGroup.isLocked, true);
    const rightGroup2 = part.addGroup(rightGroup, GroupDirection.RIGHT);
    rightGroup.lock(true);
    rightGroup2.lock(true);
    assert.strictEqual(rightGroup.isLocked, true);
    assert.strictEqual(rightGroup2.isLocked, true);
    part.removeGroup(rightGroup2);
    assert.strictEqual(rightGroup.isLocked, true);
  });
  test("closeAllGroups action - cannot close editor handling", async () => {
    const [part, instantiationService] = await createPart();
    const rootGroup = part.activeGroup;
    const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    const rootInput = createTestFileEditorInput(URI.file("foo/root"), TEST_EDITOR_INPUT_ID);
    const rightInput = createCannotCloseTestFileEditorInput(URI.file("foo/right"), TEST_EDITOR_INPUT_ID);
    await rootGroup.openEditor(rootInput);
    await rightGroup.openEditor(rightInput);
    await instantiationService.invokeFunction((accessor) => new CloseAllEditorGroupsAction().run(accessor));
    assert.strictEqual(part.count, 1);
    assert.strictEqual(part.activeGroup, rightGroup);
    assert.deepStrictEqual(rightGroup.getEditors(EditorsOrder.SEQUENTIAL), [rightInput]);
    assert.ok(rootInput.gotDisposed);
    assert.ok(!rightInput.gotDisposed);
  });
  test("locked groups - auto locking via setting", async () => {
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const configurationService = new TestConfigurationService();
    await configurationService.setUserConfiguration("workbench", { "editor": { "autoLockGroups": { "testEditorInputForEditorGroupService": true } } });
    instantiationService.stub(IConfigurationService, configurationService);
    const [part] = await createPart(instantiationService);
    const rootGroup = part.activeGroup;
    let rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    let input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    let input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    await rightGroup.openEditor(input1, { pinned: true });
    assert.strictEqual(rightGroup.isLocked, true);
    rightGroup.lock(false);
    await rightGroup.openEditor(input2, { pinned: true });
    assert.strictEqual(rightGroup.isLocked, false);
    await rightGroup.closeAllEditors();
    part.removeGroup(rightGroup);
    await rootGroup.closeAllEditors();
    input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    await rootGroup.openEditor(input1, { pinned: true });
    assert.strictEqual(rootGroup.isLocked, false);
    rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    assert.strictEqual(rootGroup.isLocked, false);
    const leftGroup = part.addGroup(rootGroup, GroupDirection.LEFT);
    assert.strictEqual(rootGroup.isLocked, false);
    part.removeGroup(leftGroup);
    assert.strictEqual(rootGroup.isLocked, false);
  });
  test("maximize editor group", async () => {
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const [part] = await createPart(instantiationService);
    const rootGroup = part.activeGroup;
    const editorPartSize = part.getSize(rootGroup);
    assert.strictEqual(part.hasMaximizedGroup(), false);
    const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    const rightBottomGroup = part.addGroup(rightGroup, GroupDirection.DOWN);
    const sizeRootGroup = part.getSize(rootGroup);
    const sizeRightGroup = part.getSize(rightGroup);
    const sizeRightBottomGroup = part.getSize(rightBottomGroup);
    let maximizedValue;
    const maxiizeGroupEventDisposable = part.onDidChangeGroupMaximized((maximized) => {
      maximizedValue = maximized;
    });
    assert.strictEqual(part.hasMaximizedGroup(), false);
    part.arrangeGroups(GroupsArrangement.MAXIMIZE, rootGroup);
    assert.strictEqual(part.hasMaximizedGroup(), true);
    assert.deepStrictEqual(part.getSize(rootGroup), editorPartSize);
    assert.deepStrictEqual(part.getSize(rightGroup), { width: 0, height: 0 });
    assert.deepStrictEqual(part.getSize(rightBottomGroup), { width: 0, height: 0 });
    assert.deepStrictEqual(maximizedValue, true);
    part.toggleMaximizeGroup();
    assert.strictEqual(part.hasMaximizedGroup(), false);
    assert.deepStrictEqual(part.getSize(rootGroup), sizeRootGroup);
    assert.deepStrictEqual(part.getSize(rightGroup), sizeRightGroup);
    assert.deepStrictEqual(part.getSize(rightBottomGroup), sizeRightBottomGroup);
    assert.deepStrictEqual(maximizedValue, false);
    maxiizeGroupEventDisposable.dispose();
  });
  test("transient editors - basics", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputTransient = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input, { pinned: true });
    await group.openEditor(inputTransient, { transient: true });
    assert.strictEqual(group.isTransient(input), false);
    assert.strictEqual(group.isTransient(inputTransient), true);
    await group.openEditor(input, { pinned: true });
    await group.openEditor(inputTransient, { transient: true });
    assert.strictEqual(group.isTransient(inputTransient), true);
    await group.openEditor(inputTransient, { transient: false });
    assert.strictEqual(group.isTransient(inputTransient), false);
    await group.openEditor(inputTransient, { transient: true });
    assert.strictEqual(group.isTransient(inputTransient), false);
  });
  test("transient editors - pinning clears transient", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputTransient = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input, { pinned: true });
    await group.openEditor(inputTransient, { transient: true });
    assert.strictEqual(group.isTransient(input), false);
    assert.strictEqual(group.isTransient(inputTransient), true);
    await group.openEditor(input, { pinned: true });
    await group.openEditor(inputTransient, { pinned: true, transient: true });
    assert.strictEqual(group.isTransient(inputTransient), false);
  });
  test("transient editors - overrides enablePreview setting", async function() {
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const configurationService = new TestConfigurationService();
    await configurationService.setUserConfiguration("workbench", { "editor": { "enablePreview": false } });
    instantiationService.stub(IConfigurationService, configurationService);
    const [part] = await createPart(instantiationService);
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input, { pinned: false });
    assert.strictEqual(group.isPinned(input), true);
    await group.openEditor(input2, { transient: true });
    assert.strictEqual(group.isPinned(input2), false);
    group.focus();
    assert.strictEqual(group.isPinned(input2), true);
  });
  test("working sets - create / apply state", async function() {
    const [part] = await createPart();
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const pane1 = await part.activeGroup.openEditor(input, { pinned: true });
    const pane2 = await part.sideGroup.openEditor(input2, { pinned: true });
    const state = part.createState();
    await pane2?.group.closeAllEditors();
    await pane1?.group.closeAllEditors();
    assert.strictEqual(part.count, 1);
    assert.strictEqual(part.activeGroup.isEmpty, true);
    await part.applyState(state);
    assert.strictEqual(part.count, 2);
    assert.strictEqual(part.groups[0].contains(input), true);
    assert.strictEqual(part.groups[1].contains(input2), true);
    for (const group of part.groups) {
      await group.closeAllEditors();
    }
    const emptyState = part.createState();
    await part.applyState(emptyState);
    assert.strictEqual(part.count, 1);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    input3.dirty = true;
    await part.activeGroup.openEditor(input3, { pinned: true });
    await part.applyState(emptyState);
    assert.strictEqual(part.count, 1);
    assert.strictEqual(part.groups[0].contains(input3), true);
    await part.applyState("empty");
    assert.strictEqual(part.count, 1);
    assert.strictEqual(part.groups[0].contains(input3), true);
    input3.dirty = false;
    await part.applyState("empty");
    assert.strictEqual(part.count, 1);
    assert.strictEqual(part.activeGroup.isEmpty, true);
  });
  test("working sets - apply state when the part has never been laid out does not throw and registers restored groups", async function() {
    const [part] = await createPart();
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    await part.activeGroup.openEditor(input, { pinned: true });
    await part.sideGroup.openEditor(input2, { pinned: true });
    const state = part.createState();
    for (const group of part.groups) {
      await group.closeAllEditors();
    }
    part._contentDimension = void 0;
    let addedGroups = 0;
    const listener = part.onDidAddGroup(() => addedGroups++);
    await part.applyState(state);
    listener.dispose();
    assert.strictEqual(part.count, 2);
    assert.strictEqual(part.groups[0].contains(input), true);
    assert.strictEqual(part.groups[1].contains(input2), true);
    assert.strictEqual(addedGroups, 2, `expected exactly 2 onDidAddGroup events, got ${addedGroups}`);
  });
  test("context key provider", async function() {
    const disposables2 = new DisposableStore();
    const instantiationService = workbenchInstantiationService({ contextKeyService: (instantiationService2) => instantiationService2.createInstance(MockScopableContextKeyService) }, disposables2);
    const rootContextKeyService = instantiationService.get(IContextKeyService);
    const [parts] = await createParts(instantiationService);
    const input1 = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    const group1 = parts.activeGroup;
    const group2 = parts.addGroup(group1, GroupDirection.RIGHT);
    await group2.openEditor(input2, { pinned: true });
    await group1.openEditor(input1, { pinned: true });
    const rawContextKey = new RawContextKey("testContextKey", parts.activeGroup.id);
    const contextKeyProvider = {
      contextKey: rawContextKey,
      getGroupContextKeyValue: (group) => group.id
    };
    disposables2.add(parts.registerContextKeyProvider(contextKeyProvider));
    assert.strictEqual(parts.activeGroup.id, group1.id);
    let globalContextKeyValue = rootContextKeyService.getContextKeyValue(rawContextKey.key);
    let group1ContextKeyValue = group1.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
    let group2ContextKeyValue = group2.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
    assert.strictEqual(globalContextKeyValue, group1.id);
    assert.strictEqual(group1ContextKeyValue, group1.id);
    assert.strictEqual(group2ContextKeyValue, group2.id);
    parts.activateGroup(group2);
    globalContextKeyValue = rootContextKeyService.getContextKeyValue(rawContextKey.key);
    group1ContextKeyValue = group1.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
    group2ContextKeyValue = group2.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
    assert.strictEqual(globalContextKeyValue, group2.id);
    assert.strictEqual(group1ContextKeyValue, group1.id);
    assert.strictEqual(group2ContextKeyValue, group2.id);
    const group3 = parts.addGroup(group2, GroupDirection.RIGHT);
    await group3.openEditor(input3, { pinned: true });
    globalContextKeyValue = rootContextKeyService.getContextKeyValue(rawContextKey.key);
    group1ContextKeyValue = group1.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
    group2ContextKeyValue = group2.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
    const group3ContextKeyValue = group3.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
    assert.strictEqual(globalContextKeyValue, group3.id);
    assert.strictEqual(group1ContextKeyValue, group1.id);
    assert.strictEqual(group2ContextKeyValue, group2.id);
    assert.strictEqual(group3ContextKeyValue, group3.id);
    disposables2.dispose();
  });
  test("context key provider: onDidChange", async function() {
    const disposables2 = new DisposableStore();
    const instantiationService = workbenchInstantiationService({ contextKeyService: (instantiationService2) => instantiationService2.createInstance(MockScopableContextKeyService) }, disposables2);
    const rootContextKeyService = instantiationService.get(IContextKeyService);
    const parts = await createEditorParts(instantiationService, disposables2);
    const input1 = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const group1 = parts.activeGroup;
    const group2 = parts.addGroup(group1, GroupDirection.RIGHT);
    await group2.openEditor(input2, { pinned: true });
    await group1.openEditor(input1, { pinned: true });
    let offset = 0;
    const _onDidChange = new Emitter();
    const rawContextKey = new RawContextKey("testContextKey", parts.activeGroup.id);
    const contextKeyProvider = {
      contextKey: rawContextKey,
      getGroupContextKeyValue: (group) => group.id + offset,
      onDidChange: _onDidChange.event
    };
    disposables2.add(parts.registerContextKeyProvider(contextKeyProvider));
    assert.strictEqual(parts.activeGroup.id, group1.id);
    let globalContextKeyValue = rootContextKeyService.getContextKeyValue(rawContextKey.key);
    let group1ContextKeyValue = group1.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
    let group2ContextKeyValue = group2.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
    assert.strictEqual(globalContextKeyValue, group1.id + offset);
    assert.strictEqual(group1ContextKeyValue, group1.id + offset);
    assert.strictEqual(group2ContextKeyValue, group2.id + offset);
    offset = 10;
    _onDidChange.fire();
    globalContextKeyValue = rootContextKeyService.getContextKeyValue(rawContextKey.key);
    group1ContextKeyValue = group1.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
    group2ContextKeyValue = group2.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
    assert.strictEqual(globalContextKeyValue, group1.id + offset);
    assert.strictEqual(group1ContextKeyValue, group1.id + offset);
    assert.strictEqual(group2ContextKeyValue, group2.id + offset);
    disposables2.dispose();
  });
  test("context key provider: active editor change", async function() {
    const disposables2 = new DisposableStore();
    const instantiationService = workbenchInstantiationService({ contextKeyService: (instantiationService2) => instantiationService2.createInstance(MockScopableContextKeyService) }, disposables2);
    const rootContextKeyService = instantiationService.get(IContextKeyService);
    const parts = await createEditorParts(instantiationService, disposables2);
    const input1 = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const group1 = parts.activeGroup;
    await group1.openEditor(input2, { pinned: true });
    await group1.openEditor(input1, { pinned: true });
    const rawContextKey = new RawContextKey("testContextKey", input1.resource.toString());
    const contextKeyProvider = {
      contextKey: rawContextKey,
      getGroupContextKeyValue: (group) => group.activeEditor?.resource?.toString() ?? ""
    };
    disposables2.add(parts.registerContextKeyProvider(contextKeyProvider));
    assert.strictEqual(isEqual(group1.activeEditor?.resource, input1.resource), true);
    let globalContextKeyValue = rootContextKeyService.getContextKeyValue(rawContextKey.key);
    let group1ContextKeyValue = group1.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
    assert.strictEqual(globalContextKeyValue, input1.resource.toString());
    assert.strictEqual(group1ContextKeyValue, input1.resource.toString());
    await group1.openEditor(input2);
    globalContextKeyValue = rootContextKeyService.getContextKeyValue(rawContextKey.key);
    group1ContextKeyValue = group1.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
    assert.strictEqual(globalContextKeyValue, input2.resource.toString());
    assert.strictEqual(group1ContextKeyValue, input2.resource.toString());
    disposables2.dispose();
  });
  test("onDidActivateGroup carries activation reason", async function() {
    const [part] = await createPart();
    const activationEvents = [];
    disposables.add(part.onDidActivateGroup((e) => activationEvents.push(e)));
    const rootGroup = part.groups[0];
    const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    activationEvents.length = 0;
    part.activateGroup(rightGroup);
    assert.strictEqual(activationEvents.length, 1);
    assert.strictEqual(activationEvents[0].group, rightGroup);
    assert.strictEqual(activationEvents[0].reason, GroupActivationReason.DEFAULT);
    activationEvents.length = 0;
    part.activateGroup(rightGroup);
    assert.strictEqual(activationEvents.length, 1);
    assert.strictEqual(activationEvents[0].group, rightGroup);
    assert.strictEqual(activationEvents[0].reason, GroupActivationReason.DEFAULT);
    activationEvents.length = 0;
    part.activateGroup(rootGroup);
    assert.strictEqual(activationEvents.length, 1);
    assert.strictEqual(activationEvents[0].group, rootGroup);
    assert.strictEqual(activationEvents[0].reason, GroupActivationReason.DEFAULT);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxlZGl0b3JcXHRlc3RcXGJyb3dzZXJcXGVkaXRvckdyb3Vwc1NlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlLCByZWdpc3RlclRlc3RFZGl0b3IsIFRlc3RGaWxlRWRpdG9ySW5wdXQsIFRlc3RFZGl0b3JQYXJ0LCBUZXN0U2VydmljZUFjY2Vzc29yLCBJVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlLCB3b3JrYmVuY2hUZWFyZG93biwgY3JlYXRlRWRpdG9yUGFydHMsIFRlc3RFZGl0b3JQYXJ0cyB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgR3JvdXBEaXJlY3Rpb24sIEdyb3Vwc09yZGVyLCBNZXJnZUdyb3VwTW9kZSwgR3JvdXBPcmllbnRhdGlvbiwgR3JvdXBMb2NhdGlvbiwgaXNFZGl0b3JHcm91cCwgSUVkaXRvckdyb3Vwc1NlcnZpY2UsIEdyb3Vwc0FycmFuZ2VtZW50LCBJRWRpdG9yR3JvdXBDb250ZXh0S2V5UHJvdmlkZXIsIEdyb3VwQWN0aXZhdGlvblJlYXNvbiwgSUVkaXRvckdyb3VwQWN0aXZhdGlvbkV2ZW50IH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2xvc2VEaXJlY3Rpb24sIElFZGl0b3JQYXJ0T3B0aW9ucywgRWRpdG9yc09yZGVyLCBFZGl0b3JJbnB1dENhcGFiaWxpdGllcywgR3JvdXBNb2RlbENoYW5nZUtpbmQsIFNpZGVCeVNpZGVFZGl0b3IsIElFZGl0b3JGYWN0b3J5UmVnaXN0cnksIEVkaXRvckV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNb2NrU2NvcGFibGVDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvdGVzdC9jb21tb24vbW9ja0tleWJpbmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbmZpcm1SZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgU2lkZUJ5U2lkZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci9zaWRlQnlTaWRlRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUdyb3VwTW9kZWxDaGFuZ2VFdmVudCwgSUdyb3VwRWRpdG9yTW92ZUV2ZW50LCBJR3JvdXBFZGl0b3JPcGVuRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvckdyb3VwTW9kZWwuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IENsb3NlQWxsRWRpdG9yR3JvdXBzQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yQWN0aW9ucy5qcyc7XG5cbnN1aXRlKCdFZGl0b3JHcm91cHNTZXJ2aWNlJywgKCkgPT4ge1xuXG5cdGNvbnN0IFRFU1RfRURJVE9SX0lEID0gJ015RmlsZUVkaXRvckZvckVkaXRvckdyb3VwU2VydmljZSc7XG5cdGNvbnN0IFRFU1RfRURJVE9SX0lOUFVUX0lEID0gJ3Rlc3RFZGl0b3JJbnB1dEZvckVkaXRvckdyb3VwU2VydmljZSc7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0bGV0IHRlc3RMb2NhbEluc3RhbnRpYXRpb25TZXJ2aWNlOiBJVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJUZXN0RWRpdG9yKFRFU1RfRURJVE9SX0lELCBbbmV3IFN5bmNEZXNjcmlwdG9yKFRlc3RGaWxlRWRpdG9ySW5wdXQpLCBuZXcgU3luY0Rlc2NyaXB0b3IoU2lkZUJ5U2lkZUVkaXRvcklucHV0KV0sIFRFU1RfRURJVE9SX0lOUFVUX0lEKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKGFzeW5jICgpID0+IHtcblx0XHRpZiAodGVzdExvY2FsSW5zdGFudGlhdGlvblNlcnZpY2UpIHtcblx0XHRcdGF3YWl0IHdvcmtiZW5jaFRlYXJkb3duKHRlc3RMb2NhbEluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdHRlc3RMb2NhbEluc3RhbnRpYXRpb25TZXJ2aWNlID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVBhcnRzKGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBkaXNwb3NhYmxlcykpOiBQcm9taXNlPFtUZXN0RWRpdG9yUGFydHMsIFRlc3RJbnN0YW50aWF0aW9uU2VydmljZV0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBSZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLnN0YXJ0KGFjY2Vzc29yKSk7XG5cdFx0Y29uc3QgcGFydHMgPSBhd2FpdCBjcmVhdGVFZGl0b3JQYXJ0cyhpbnN0YW50aWF0aW9uU2VydmljZSwgZGlzcG9zYWJsZXMpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVkaXRvckdyb3Vwc1NlcnZpY2UsIHBhcnRzKTtcblxuXHRcdHRlc3RMb2NhbEluc3RhbnRpYXRpb25TZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0XHRyZXR1cm4gW3BhcnRzLCBpbnN0YW50aWF0aW9uU2VydmljZV07XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBjcmVhdGVQYXJ0KGluc3RhbnRpYXRpb25TZXJ2aWNlPzogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKTogUHJvbWlzZTxbVGVzdEVkaXRvclBhcnQsIFRlc3RJbnN0YW50aWF0aW9uU2VydmljZV0+IHtcblx0XHRjb25zdCBbcGFydHMsIHRlc3RJbnN0YW50aWF0aW9uU2VydmljZV0gPSBhd2FpdCBjcmVhdGVQYXJ0cyhpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0cmV0dXJuIFtwYXJ0cy50ZXN0TWFpblBhcnQsIHRlc3RJbnN0YW50aWF0aW9uU2VydmljZV07XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KHJlc291cmNlOiBVUkksIHR5cGVJZDogc3RyaW5nKTogVGVzdEZpbGVFZGl0b3JJbnB1dCB7XG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEZpbGVFZGl0b3JJbnB1dChyZXNvdXJjZSwgdHlwZUlkKSk7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVDYW5ub3RDbG9zZVRlc3RGaWxlRWRpdG9ySW5wdXQocmVzb3VyY2U6IFVSSSwgdHlwZUlkOiBzdHJpbmcpOiBUZXN0RmlsZUVkaXRvcklucHV0IHtcblx0XHRjb25zdCBpbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQocmVzb3VyY2UsIHR5cGVJZCk7XG5cdFx0aW5wdXQuY2FwYWJpbGl0aWVzID0gRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuQ2Fubm90Q2xvc2U7XG5cblx0XHRyZXR1cm4gaW5wdXQ7XG5cdH1cblxuXHR0ZXN0KCdncm91cHMgYmFzaWNzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UoeyBjb250ZXh0S2V5U2VydmljZTogaW5zdGFudGlhdGlvblNlcnZpY2UgPT4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTW9ja1Njb3BhYmxlQ29udGV4dEtleVNlcnZpY2UpIH0sIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdGxldCBhY3RpdmVHcm91cE1vZGVsQ2hhbmdlQ291bnRlciA9IDA7XG5cdFx0Y29uc3QgYWN0aXZlR3JvdXBNb2RlbENoYW5nZUxpc3RlbmVyID0gcGFydC5vbkRpZENoYW5nZUFjdGl2ZUdyb3VwKCgpID0+IHtcblx0XHRcdGFjdGl2ZUdyb3VwTW9kZWxDaGFuZ2VDb3VudGVyKys7XG5cdFx0fSk7XG5cblx0XHRsZXQgZ3JvdXBBZGRlZENvdW50ZXIgPSAwO1xuXHRcdGNvbnN0IGdyb3VwQWRkZWRMaXN0ZW5lciA9IHBhcnQub25EaWRBZGRHcm91cCgoKSA9PiB7XG5cdFx0XHRncm91cEFkZGVkQ291bnRlcisrO1xuXHRcdH0pO1xuXG5cdFx0bGV0IGdyb3VwUmVtb3ZlZENvdW50ZXIgPSAwO1xuXHRcdGNvbnN0IGdyb3VwUmVtb3ZlZExpc3RlbmVyID0gcGFydC5vbkRpZFJlbW92ZUdyb3VwKCgpID0+IHtcblx0XHRcdGdyb3VwUmVtb3ZlZENvdW50ZXIrKztcblx0XHR9KTtcblxuXHRcdGxldCBncm91cE1vdmVkQ291bnRlciA9IDA7XG5cdFx0Y29uc3QgZ3JvdXBNb3ZlZExpc3RlbmVyID0gcGFydC5vbkRpZE1vdmVHcm91cCgoKSA9PiB7XG5cdFx0XHRncm91cE1vdmVkQ291bnRlcisrO1xuXHRcdH0pO1xuXG5cdFx0Ly8gYWx3YXlzIGEgcm9vdCBncm91cFxuXHRcdGNvbnN0IHJvb3RHcm91cCA9IHBhcnQuZ3JvdXBzWzBdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0VkaXRvckdyb3VwKHJvb3RHcm91cCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Lmdyb3Vwcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdEdyb3VwLCBwYXJ0LmdldEdyb3VwKHJvb3RHcm91cC5pZCkpO1xuXHRcdGFzc2VydC5vayhwYXJ0LmFjdGl2ZUdyb3VwID09PSByb290R3JvdXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290R3JvdXAubGFiZWwsICdHcm91cCAxJyk7XG5cblx0XHRsZXQgbXJ1ID0gcGFydC5nZXRHcm91cHMoR3JvdXBzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtcnUubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobXJ1WzBdLCByb290R3JvdXApO1xuXG5cdFx0Y29uc3QgcmlnaHRHcm91cCA9IHBhcnQuYWRkR3JvdXAocm9vdEdyb3VwLCBHcm91cERpcmVjdGlvbi5SSUdIVCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0R3JvdXAsIHBhcnQuZ2V0R3JvdXAocmlnaHRHcm91cC5pZCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cEFkZGVkQ291bnRlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZ3JvdXBzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY291bnQsIDIpO1xuXHRcdGFzc2VydC5vayhwYXJ0LmFjdGl2ZUdyb3VwID09PSByb290R3JvdXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290R3JvdXAubGFiZWwsICdHcm91cCAxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0R3JvdXAubGFiZWwsICdHcm91cCAyJyk7XG5cblx0XHRtcnUgPSBwYXJ0LmdldEdyb3VwcyhHcm91cHNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ydS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtcnVbMF0sIHJvb3RHcm91cCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ydVsxXSwgcmlnaHRHcm91cCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlR3JvdXBNb2RlbENoYW5nZUNvdW50ZXIsIDApO1xuXG5cdFx0bGV0IHJvb3RHcm91cEFjdGl2ZUNoYW5nZUNvdW50ZXIgPSAwO1xuXHRcdGNvbnN0IHJvb3RHcm91cE1vZGVsQ2hhbmdlTGlzdGVuZXIgPSByb290R3JvdXAub25EaWRNb2RlbENoYW5nZShlID0+IHtcblx0XHRcdGlmIChlLmtpbmQgPT09IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkdST1VQX0FDVElWRSkge1xuXHRcdFx0XHRyb290R3JvdXBBY3RpdmVDaGFuZ2VDb3VudGVyKys7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRsZXQgcmlnaHRHcm91cEFjdGl2ZUNoYW5nZUNvdW50ZXIgPSAwO1xuXHRcdGNvbnN0IHJpZ2h0R3JvdXBNb2RlbENoYW5nZUxpc3RlbmVyID0gcmlnaHRHcm91cC5vbkRpZE1vZGVsQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUua2luZCA9PT0gR3JvdXBNb2RlbENoYW5nZUtpbmQuR1JPVVBfQUNUSVZFKSB7XG5cdFx0XHRcdHJpZ2h0R3JvdXBBY3RpdmVDaGFuZ2VDb3VudGVyKys7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRwYXJ0LmFjdGl2YXRlR3JvdXAocmlnaHRHcm91cCk7XG5cdFx0YXNzZXJ0Lm9rKHBhcnQuYWN0aXZlR3JvdXAgPT09IHJpZ2h0R3JvdXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3RpdmVHcm91cE1vZGVsQ2hhbmdlQ291bnRlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3RHcm91cEFjdGl2ZUNoYW5nZUNvdW50ZXIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyaWdodEdyb3VwQWN0aXZlQ2hhbmdlQ291bnRlciwgMSk7XG5cblx0XHRyb290R3JvdXBNb2RlbENoYW5nZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRyaWdodEdyb3VwTW9kZWxDaGFuZ2VMaXN0ZW5lci5kaXNwb3NlKCk7XG5cblx0XHRtcnUgPSBwYXJ0LmdldEdyb3VwcyhHcm91cHNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ydS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtcnVbMF0sIHJpZ2h0R3JvdXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtcnVbMV0sIHJvb3RHcm91cCk7XG5cblx0XHRjb25zdCBkb3duR3JvdXAgPSBwYXJ0LmFkZEdyb3VwKHJpZ2h0R3JvdXAsIEdyb3VwRGlyZWN0aW9uLkRPV04pO1xuXHRcdGxldCBkaWREaXNwb3NlID0gZmFsc2U7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGRvd25Hcm91cC5vbldpbGxEaXNwb3NlKCgpID0+IHtcblx0XHRcdGRpZERpc3Bvc2UgPSB0cnVlO1xuXHRcdH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXBBZGRlZENvdW50ZXIsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Lmdyb3Vwcy5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5vayhwYXJ0LmFjdGl2ZUdyb3VwID09PSByaWdodEdyb3VwKTtcblx0XHRhc3NlcnQub2soIWRvd25Hcm91cC5hY3RpdmVFZGl0b3JQYW5lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdEdyb3VwLmxhYmVsLCAnR3JvdXAgMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyaWdodEdyb3VwLmxhYmVsLCAnR3JvdXAgMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkb3duR3JvdXAubGFiZWwsICdHcm91cCAzJyk7XG5cblx0XHRtcnUgPSBwYXJ0LmdldEdyb3VwcyhHcm91cHNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ydS5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtcnVbMF0sIHJpZ2h0R3JvdXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtcnVbMV0sIHJvb3RHcm91cCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ydVsyXSwgZG93bkdyb3VwKTtcblxuXHRcdGNvbnN0IGdyaWRPcmRlciA9IHBhcnQuZ2V0R3JvdXBzKEdyb3Vwc09yZGVyLkdSSURfQVBQRUFSQU5DRSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyaWRPcmRlci5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncmlkT3JkZXJbMF0sIHJvb3RHcm91cCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyaWRPcmRlclswXS5pbmRleCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyaWRPcmRlclsxXSwgcmlnaHRHcm91cCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyaWRPcmRlclsxXS5pbmRleCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyaWRPcmRlclsyXSwgZG93bkdyb3VwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JpZE9yZGVyWzJdLmluZGV4LCAyKTtcblxuXHRcdHBhcnQubW92ZUdyb3VwKGRvd25Hcm91cCwgcmlnaHRHcm91cCwgR3JvdXBEaXJlY3Rpb24uRE9XTik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwTW92ZWRDb3VudGVyLCAxKTtcblxuXHRcdHBhcnQucmVtb3ZlR3JvdXAoZG93bkdyb3VwKTtcblx0XHRhc3NlcnQub2soIXBhcnQuZ2V0R3JvdXAoZG93bkdyb3VwLmlkKSk7XG5cdFx0YXNzZXJ0Lm9rKCFwYXJ0Lmhhc0dyb3VwKGRvd25Hcm91cC5pZCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWREaXNwb3NlLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXBSZW1vdmVkQ291bnRlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZ3JvdXBzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0Lm9rKHBhcnQuYWN0aXZlR3JvdXAgPT09IHJpZ2h0R3JvdXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290R3JvdXAubGFiZWwsICdHcm91cCAxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0R3JvdXAubGFiZWwsICdHcm91cCAyJyk7XG5cblx0XHRtcnUgPSBwYXJ0LmdldEdyb3VwcyhHcm91cHNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ydS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtcnVbMF0sIHJpZ2h0R3JvdXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtcnVbMV0sIHJvb3RHcm91cCk7XG5cblx0XHRjb25zdCByaWdodEdyb3VwQ29udGV4dEtleVNlcnZpY2UgPSBwYXJ0LmFjdGl2ZUdyb3VwLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlO1xuXHRcdGNvbnN0IHJvb3RHcm91cENvbnRleHRLZXlTZXJ2aWNlID0gcm9vdEdyb3VwLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlO1xuXG5cdFx0YXNzZXJ0Lm9rKHJpZ2h0R3JvdXBDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YXNzZXJ0Lm9rKHJvb3RHcm91cENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQub2socmlnaHRHcm91cENvbnRleHRLZXlTZXJ2aWNlICE9PSByb290R3JvdXBDb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRwYXJ0LnJlbW92ZUdyb3VwKHJpZ2h0R3JvdXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cFJlbW92ZWRDb3VudGVyLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5ncm91cHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQub2socGFydC5hY3RpdmVHcm91cCA9PT0gcm9vdEdyb3VwKTtcblxuXHRcdG1ydSA9IHBhcnQuZ2V0R3JvdXBzKEdyb3Vwc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobXJ1Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ydVswXSwgcm9vdEdyb3VwKTtcblxuXHRcdHBhcnQucmVtb3ZlR3JvdXAocm9vdEdyb3VwKTsgLy8gY2Fubm90IHJlbW92ZSByb290IGdyb3VwXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZ3JvdXBzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwUmVtb3ZlZENvdW50ZXIsIDIpO1xuXHRcdGFzc2VydC5vayhwYXJ0LmFjdGl2ZUdyb3VwID09PSByb290R3JvdXApO1xuXG5cdFx0cGFydC5zZXRHcm91cE9yaWVudGF0aW9uKHBhcnQub3JpZW50YXRpb24gPT09IEdyb3VwT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IEdyb3VwT3JpZW50YXRpb24uVkVSVElDQUwgOiBHcm91cE9yaWVudGF0aW9uLkhPUklaT05UQUwpO1xuXG5cdFx0YWN0aXZlR3JvdXBNb2RlbENoYW5nZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRncm91cEFkZGVkTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdGdyb3VwUmVtb3ZlZExpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRncm91cE1vdmVkTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaWRlR3JvdXAnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7IGNvbnRleHRLZXlTZXJ2aWNlOiBpbnN0YW50aWF0aW9uU2VydmljZSA9PiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNb2NrU2NvcGFibGVDb250ZXh0S2V5U2VydmljZSkgfSwgZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgcm9vdEdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDIgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQzID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjMnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgcm9vdEdyb3VwLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBwYXJ0LnNpZGVHcm91cC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY291bnQsIDIpO1xuXG5cdFx0cGFydC5hY3RpdmF0ZUdyb3VwKHJvb3RHcm91cCk7XG5cdFx0YXdhaXQgcGFydC5zaWRlR3JvdXAub3BlbkVkaXRvcihpbnB1dDMsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmNvdW50LCAyKTtcblx0fSk7XG5cblx0dGVzdCgnc2F2ZSAmIHJlc3RvcmUgc3RhdGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgW3BhcnQsIGluc3RhbnRpYXRpb25TZXJ2aWNlXSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblxuXHRcdGNvbnN0IHJvb3RHcm91cCA9IHBhcnQuZ3JvdXBzWzBdO1xuXHRcdGNvbnN0IHJpZ2h0R3JvdXAgPSBwYXJ0LmFkZEdyb3VwKHJvb3RHcm91cCwgR3JvdXBEaXJlY3Rpb24uUklHSFQpO1xuXHRcdGNvbnN0IGRvd25Hcm91cCA9IHBhcnQuYWRkR3JvdXAocmlnaHRHcm91cCwgR3JvdXBEaXJlY3Rpb24uRE9XTik7XG5cblx0XHRjb25zdCByb290R3JvdXBJbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRhd2FpdCByb290R3JvdXAub3BlbkVkaXRvcihyb290R3JvdXBJbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cblx0XHRjb25zdCByaWdodEdyb3VwSW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0YXdhaXQgcmlnaHRHcm91cC5vcGVuRWRpdG9yKHJpZ2h0R3JvdXBJbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5ncm91cHMubGVuZ3RoLCAzKTtcblxuXHRcdHBhcnQudGVzdFNhdmVTdGF0ZSgpO1xuXHRcdHBhcnQuZGlzcG9zZSgpO1xuXG5cdFx0Y29uc3QgW3Jlc3RvcmVkUGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN0b3JlZFBhcnQuZ3JvdXBzLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3RvcmVkUGFydC5nZXRHcm91cChyb290R3JvdXAuaWQpKTtcblx0XHRhc3NlcnQub2socmVzdG9yZWRQYXJ0Lmhhc0dyb3VwKHJvb3RHcm91cC5pZCkpO1xuXHRcdGFzc2VydC5vayhyZXN0b3JlZFBhcnQuZ2V0R3JvdXAocmlnaHRHcm91cC5pZCkpO1xuXHRcdGFzc2VydC5vayhyZXN0b3JlZFBhcnQuaGFzR3JvdXAocmlnaHRHcm91cC5pZCkpO1xuXHRcdGFzc2VydC5vayhyZXN0b3JlZFBhcnQuZ2V0R3JvdXAoZG93bkdyb3VwLmlkKSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3RvcmVkUGFydC5oYXNHcm91cChkb3duR3JvdXAuaWQpKTtcblxuXHRcdHJlc3RvcmVkUGFydC5jbGVhclN0YXRlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dyb3VwcyBpbmRleCAvIGxhYmVscycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cblx0XHRjb25zdCByb290R3JvdXAgPSBwYXJ0Lmdyb3Vwc1swXTtcblx0XHRjb25zdCByaWdodEdyb3VwID0gcGFydC5hZGRHcm91cChyb290R3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblx0XHRjb25zdCBkb3duR3JvdXAgPSBwYXJ0LmFkZEdyb3VwKHJpZ2h0R3JvdXAsIEdyb3VwRGlyZWN0aW9uLkRPV04pO1xuXG5cdFx0bGV0IGdyb3VwSW5kZXhDaGFuZ2VkQ291bnRlciA9IDA7XG5cdFx0Y29uc3QgZ3JvdXBJbmRleENoYW5nZWRMaXN0ZW5lciA9IHBhcnQub25EaWRDaGFuZ2VHcm91cEluZGV4KCgpID0+IHtcblx0XHRcdGdyb3VwSW5kZXhDaGFuZ2VkQ291bnRlcisrO1xuXHRcdH0pO1xuXG5cdFx0bGV0IGluZGV4Q2hhbmdlQ291bnRlciA9IDA7XG5cdFx0Y29uc3QgbGFiZWxDaGFuZ2VMaXN0ZW5lciA9IGRvd25Hcm91cC5vbkRpZE1vZGVsQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUua2luZCA9PT0gR3JvdXBNb2RlbENoYW5nZUtpbmQuR1JPVVBfSU5ERVgpIHtcblx0XHRcdFx0aW5kZXhDaGFuZ2VDb3VudGVyKys7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdEdyb3VwLmluZGV4LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRHcm91cC5pbmRleCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvd25Hcm91cC5pbmRleCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3RHcm91cC5sYWJlbCwgJ0dyb3VwIDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRHcm91cC5sYWJlbCwgJ0dyb3VwIDInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZG93bkdyb3VwLmxhYmVsLCAnR3JvdXAgMycpO1xuXG5cdFx0cGFydC5yZW1vdmVHcm91cChyaWdodEdyb3VwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdEdyb3VwLmluZGV4LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZG93bkdyb3VwLmluZGV4LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdEdyb3VwLmxhYmVsLCAnR3JvdXAgMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkb3duR3JvdXAubGFiZWwsICdHcm91cCAyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluZGV4Q2hhbmdlQ291bnRlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwSW5kZXhDaGFuZ2VkQ291bnRlciwgMSk7XG5cblx0XHRwYXJ0Lm1vdmVHcm91cChkb3duR3JvdXAsIHJvb3RHcm91cCwgR3JvdXBEaXJlY3Rpb24uVVApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkb3duR3JvdXAuaW5kZXgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290R3JvdXAuaW5kZXgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkb3duR3JvdXAubGFiZWwsICdHcm91cCAxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3RHcm91cC5sYWJlbCwgJ0dyb3VwIDInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5kZXhDaGFuZ2VDb3VudGVyLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXBJbmRleENoYW5nZWRDb3VudGVyLCAzKTtcblxuXHRcdGNvbnN0IG5ld0ZpcnN0R3JvdXAgPSBwYXJ0LmFkZEdyb3VwKGRvd25Hcm91cCwgR3JvdXBEaXJlY3Rpb24uVVApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXdGaXJzdEdyb3VwLmluZGV4LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZG93bkdyb3VwLmluZGV4LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdEdyb3VwLmluZGV4LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3Rmlyc3RHcm91cC5sYWJlbCwgJ0dyb3VwIDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZG93bkdyb3VwLmxhYmVsLCAnR3JvdXAgMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290R3JvdXAubGFiZWwsICdHcm91cCAzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluZGV4Q2hhbmdlQ291bnRlciwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwSW5kZXhDaGFuZ2VkQ291bnRlciwgNik7XG5cblx0XHRsYWJlbENoYW5nZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRncm91cEluZGV4Q2hhbmdlZExpc3RlbmVyLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZ3JvdXBzIGxhYmVsJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblxuXHRcdGNvbnN0IHJvb3RHcm91cCA9IHBhcnQuZ3JvdXBzWzBdO1xuXHRcdGNvbnN0IHJpZ2h0R3JvdXAgPSBwYXJ0LmFkZEdyb3VwKHJvb3RHcm91cCwgR3JvdXBEaXJlY3Rpb24uUklHSFQpO1xuXG5cdFx0bGV0IHBhcnRMYWJlbENoYW5nZWRDb3VudGVyID0gMDtcblx0XHRjb25zdCBncm91cEluZGV4Q2hhbmdlZExpc3RlbmVyID0gcGFydC5vbkRpZENoYW5nZUdyb3VwTGFiZWwoKCkgPT4ge1xuXHRcdFx0cGFydExhYmVsQ2hhbmdlZENvdW50ZXIrKztcblx0XHR9KTtcblxuXHRcdGxldCByb290R3JvdXBMYWJlbENoYW5nZUNvdW50ZXIgPSAwO1xuXHRcdGNvbnN0IHJvb3RHcm91cExhYmVsQ2hhbmdlTGlzdGVuZXIgPSByb290R3JvdXAub25EaWRNb2RlbENoYW5nZShlID0+IHtcblx0XHRcdGlmIChlLmtpbmQgPT09IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkdST1VQX0xBQkVMKSB7XG5cdFx0XHRcdHJvb3RHcm91cExhYmVsQ2hhbmdlQ291bnRlcisrO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0bGV0IHJpZ2h0R3JvdXBMYWJlbENoYW5nZUNvdW50ZXIgPSAwO1xuXHRcdGNvbnN0IHJpZ2h0R3JvdXBMYWJlbENoYW5nZUxpc3RlbmVyID0gcmlnaHRHcm91cC5vbkRpZE1vZGVsQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUua2luZCA9PT0gR3JvdXBNb2RlbENoYW5nZUtpbmQuR1JPVVBfTEFCRUwpIHtcblx0XHRcdFx0cmlnaHRHcm91cExhYmVsQ2hhbmdlQ291bnRlcisrO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3RHcm91cC5sYWJlbCwgJ0dyb3VwIDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRHcm91cC5sYWJlbCwgJ0dyb3VwIDInKTtcblxuXHRcdHBhcnQubm90aWZ5R3JvdXBzTGFiZWxDaGFuZ2UoJ1dpbmRvdyAyJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdEdyb3VwLmxhYmVsLCAnV2luZG93IDI6IEdyb3VwIDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRHcm91cC5sYWJlbCwgJ1dpbmRvdyAyOiBHcm91cCAyJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdEdyb3VwTGFiZWxDaGFuZ2VDb3VudGVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRHcm91cExhYmVsQ2hhbmdlQ291bnRlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnRMYWJlbENoYW5nZWRDb3VudGVyLCAyKTtcblxuXHRcdHBhcnQubm90aWZ5R3JvdXBzTGFiZWxDaGFuZ2UoJ1dpbmRvdyAzJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdEdyb3VwLmxhYmVsLCAnV2luZG93IDM6IEdyb3VwIDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRHcm91cC5sYWJlbCwgJ1dpbmRvdyAzOiBHcm91cCAyJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdEdyb3VwTGFiZWxDaGFuZ2VDb3VudGVyLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRHcm91cExhYmVsQ2hhbmdlQ291bnRlciwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnRMYWJlbENoYW5nZWRDb3VudGVyLCA0KTtcblxuXHRcdHJvb3RHcm91cExhYmVsQ2hhbmdlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdHJpZ2h0R3JvdXBMYWJlbENoYW5nZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRncm91cEluZGV4Q2hhbmdlZExpc3RlbmVyLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnY29weS9tZXJnZSBncm91cHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXG5cdFx0bGV0IGdyb3VwQWRkZWRDb3VudGVyID0gMDtcblx0XHRjb25zdCBncm91cEFkZGVkTGlzdGVuZXIgPSBwYXJ0Lm9uRGlkQWRkR3JvdXAoKCkgPT4ge1xuXHRcdFx0Z3JvdXBBZGRlZENvdW50ZXIrKztcblx0XHR9KTtcblxuXHRcdGxldCBncm91cFJlbW92ZWRDb3VudGVyID0gMDtcblx0XHRjb25zdCBncm91cFJlbW92ZWRMaXN0ZW5lciA9IHBhcnQub25EaWRSZW1vdmVHcm91cCgoKSA9PiB7XG5cdFx0XHRncm91cFJlbW92ZWRDb3VudGVyKys7XG5cdFx0fSk7XG5cblx0XHRjb25zdCByb290R3JvdXAgPSBwYXJ0Lmdyb3Vwc1swXTtcblx0XHRsZXQgcm9vdEdyb3VwRGlzcG9zZWQgPSBmYWxzZTtcblx0XHRjb25zdCBkaXNwb3NlTGlzdGVuZXIgPSByb290R3JvdXAub25XaWxsRGlzcG9zZSgoKSA9PiB7XG5cdFx0XHRyb290R3JvdXBEaXNwb3NlZCA9IHRydWU7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBpbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgcm9vdEdyb3VwLm9wZW5FZGl0b3IoaW5wdXQsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHJpZ2h0R3JvdXAgPSBwYXJ0LmFkZEdyb3VwKHJvb3RHcm91cCwgR3JvdXBEaXJlY3Rpb24uUklHSFQpO1xuXHRcdHBhcnQuYWN0aXZhdGVHcm91cChyaWdodEdyb3VwKTtcblx0XHRjb25zdCBkb3duR3JvdXAgPSBwYXJ0LmNvcHlHcm91cChyb290R3JvdXAsIHJpZ2h0R3JvdXAsIEdyb3VwRGlyZWN0aW9uLkRPV04pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cEFkZGVkQ291bnRlciwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvd25Hcm91cC5jb3VudCwgMSk7XG5cdFx0YXNzZXJ0Lm9rKGRvd25Hcm91cC5hY3RpdmVFZGl0b3IgaW5zdGFuY2VvZiBUZXN0RmlsZUVkaXRvcklucHV0KTtcblx0XHRsZXQgcmVzID0gcGFydC5tZXJnZUdyb3VwKHJvb3RHcm91cCwgcmlnaHRHcm91cCwgeyBtb2RlOiBNZXJnZUdyb3VwTW9kZS5DT1BZX0VESVRPUlMgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcywgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0R3JvdXAuY291bnQsIDEpO1xuXHRcdGFzc2VydC5vayhyaWdodEdyb3VwLmFjdGl2ZUVkaXRvciBpbnN0YW5jZW9mIFRlc3RGaWxlRWRpdG9ySW5wdXQpO1xuXHRcdHJlcyA9IHBhcnQubWVyZ2VHcm91cChyb290R3JvdXAsIHJpZ2h0R3JvdXAsIHsgbW9kZTogTWVyZ2VHcm91cE1vZGUuTU9WRV9FRElUT1JTIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290R3JvdXAuY291bnQsIDApO1xuXHRcdHJlcyA9IHBhcnQubWVyZ2VHcm91cChyb290R3JvdXAsIGRvd25Hcm91cCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcywgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwUmVtb3ZlZENvdW50ZXIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290R3JvdXBEaXNwb3NlZCwgdHJ1ZSk7XG5cblx0XHRncm91cEFkZGVkTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdGdyb3VwUmVtb3ZlZExpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRkaXNwb3NlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdHBhcnQuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSBhbGwgZ3JvdXBzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblxuXHRcdGNvbnN0IHJvb3RHcm91cCA9IHBhcnQuZ3JvdXBzWzBdO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjEnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0MiA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDMgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRhd2FpdCByb290R3JvdXAub3BlbkVkaXRvcihpbnB1dDEsIHsgcGlubmVkOiB0cnVlIH0pO1xuXG5cdFx0Y29uc3QgcmlnaHRHcm91cCA9IHBhcnQuYWRkR3JvdXAocm9vdEdyb3VwLCBHcm91cERpcmVjdGlvbi5SSUdIVCk7XG5cdFx0YXdhaXQgcmlnaHRHcm91cC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cblx0XHRjb25zdCBkb3duR3JvdXAgPSBwYXJ0LmNvcHlHcm91cChyb290R3JvdXAsIHJpZ2h0R3JvdXAsIEdyb3VwRGlyZWN0aW9uLkRPV04pO1xuXHRcdGF3YWl0IGRvd25Hcm91cC5vcGVuRWRpdG9yKGlucHV0MywgeyBwaW5uZWQ6IHRydWUgfSk7XG5cblx0XHRwYXJ0LmFjdGl2YXRlR3JvdXAocm9vdEdyb3VwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290R3JvdXAuY291bnQsIDEpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFydC5tZXJnZUFsbEdyb3VwcyhwYXJ0LmFjdGl2ZUdyb3VwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdEdyb3VwLmNvdW50LCAzKTtcblxuXHRcdHBhcnQuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd3aGVuUmVhZHkgLyB3aGVuUmVzdG9yZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXG5cdFx0YXdhaXQgcGFydC53aGVuUmVhZHk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuaXNSZWFkeSwgdHJ1ZSk7XG5cdFx0YXdhaXQgcGFydC53aGVuUmVzdG9yZWQ7XG5cdH0pO1xuXG5cdHRlc3QoJ29wdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXG5cdFx0bGV0IG9sZE9wdGlvbnMhOiBJRWRpdG9yUGFydE9wdGlvbnM7XG5cdFx0bGV0IG5ld09wdGlvbnMhOiBJRWRpdG9yUGFydE9wdGlvbnM7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBhcnQub25EaWRDaGFuZ2VFZGl0b3JQYXJ0T3B0aW9ucyhldmVudCA9PiB7XG5cdFx0XHRvbGRPcHRpb25zID0gZXZlbnQub2xkUGFydE9wdGlvbnM7XG5cdFx0XHRuZXdPcHRpb25zID0gZXZlbnQubmV3UGFydE9wdGlvbnM7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgY3VycmVudE9wdGlvbnMgPSBwYXJ0LnBhcnRPcHRpb25zO1xuXHRcdGFzc2VydC5vayhjdXJyZW50T3B0aW9ucyk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocGFydC5lbmZvcmNlUGFydE9wdGlvbnMoeyBzaG93VGFiczogJ3NpbmdsZScgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LnBhcnRPcHRpb25zLnNob3dUYWJzLCAnc2luZ2xlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ld09wdGlvbnMuc2hvd1RhYnMsICdzaW5nbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob2xkT3B0aW9ucywgY3VycmVudE9wdGlvbnMpO1xuXG5cdFx0Y29uc3QgZW5mb3JjZWQgPSBwYXJ0LmVuZm9yY2VQYXJ0T3B0aW9ucyh7IGFsbG93RHJvcEludG9Hcm91cDogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQucGFydE9wdGlvbnMuYWxsb3dEcm9wSW50b0dyb3VwLCBmYWxzZSk7XG5cdFx0ZW5mb3JjZWQuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LnBhcnRPcHRpb25zLmFsbG93RHJvcEludG9Hcm91cCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VkaXRvciBiYXNpY3MnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXHRcdGNvbnN0IGdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNFbXB0eSwgdHJ1ZSk7XG5cblx0XHRsZXQgYWN0aXZlRWRpdG9yQ2hhbmdlQ291bnRlciA9IDA7XG5cdFx0bGV0IGVkaXRvckRpZE9wZW5Db3VudGVyID0gMDtcblx0XHRjb25zdCBlZGl0b3JPcGVuRXZlbnRzOiBJR3JvdXBNb2RlbENoYW5nZUV2ZW50W10gPSBbXTtcblx0XHRsZXQgZWRpdG9yQ2xvc2VDb3VudGVyID0gMDtcblx0XHRjb25zdCBlZGl0b3JDbG9zZUV2ZW50czogSUdyb3VwTW9kZWxDaGFuZ2VFdmVudFtdID0gW107XG5cdFx0bGV0IGVkaXRvclBpbkNvdW50ZXIgPSAwO1xuXHRcdGxldCBlZGl0b3JTdGlja3lDb3VudGVyID0gMDtcblx0XHRsZXQgZWRpdG9yQ2FwYWJpbGl0aWVzQ291bnRlciA9IDA7XG5cdFx0Y29uc3QgZWRpdG9yR3JvdXBNb2RlbENoYW5nZUxpc3RlbmVyID0gZ3JvdXAub25EaWRNb2RlbENoYW5nZShlID0+IHtcblx0XHRcdGlmIChlLmtpbmQgPT09IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9PUEVOKSB7XG5cdFx0XHRcdGFzc2VydC5vayhlLmVkaXRvcik7XG5cdFx0XHRcdGVkaXRvckRpZE9wZW5Db3VudGVyKys7XG5cdFx0XHRcdGVkaXRvck9wZW5FdmVudHMucHVzaChlKTtcblx0XHRcdH0gZWxzZSBpZiAoZS5raW5kID09PSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfUElOKSB7XG5cdFx0XHRcdGFzc2VydC5vayhlLmVkaXRvcik7XG5cdFx0XHRcdGVkaXRvclBpbkNvdW50ZXIrKztcblx0XHRcdH0gZWxzZSBpZiAoZS5raW5kID09PSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfU1RJQ0tZKSB7XG5cdFx0XHRcdGFzc2VydC5vayhlLmVkaXRvcik7XG5cdFx0XHRcdGVkaXRvclN0aWNreUNvdW50ZXIrKztcblx0XHRcdH0gZWxzZSBpZiAoZS5raW5kID09PSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfQ0FQQUJJTElUSUVTKSB7XG5cdFx0XHRcdGFzc2VydC5vayhlLmVkaXRvcik7XG5cdFx0XHRcdGVkaXRvckNhcGFiaWxpdGllc0NvdW50ZXIrKztcblx0XHRcdH0gZWxzZSBpZiAoZS5raW5kID09PSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfQ0xPU0UpIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKGUuZWRpdG9yKTtcblx0XHRcdFx0ZWRpdG9yQ2xvc2VDb3VudGVyKys7XG5cdFx0XHRcdGVkaXRvckNsb3NlRXZlbnRzLnB1c2goZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yQ2hhbmdlTGlzdGVuZXIgPSBncm91cC5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZShlID0+IHtcblx0XHRcdGFzc2VydC5vayhlLmVkaXRvcik7XG5cdFx0XHRhY3RpdmVFZGl0b3JDaGFuZ2VDb3VudGVyKys7XG5cdFx0fSk7XG5cblx0XHRsZXQgZWRpdG9yQ2xvc2VDb3VudGVyMSA9IDA7XG5cdFx0Y29uc3QgZWRpdG9yQ2xvc2VMaXN0ZW5lciA9IGdyb3VwLm9uRGlkQ2xvc2VFZGl0b3IoKCkgPT4ge1xuXHRcdFx0ZWRpdG9yQ2xvc2VDb3VudGVyMSsrO1xuXHRcdH0pO1xuXG5cdFx0bGV0IGVkaXRvcldpbGxDbG9zZUNvdW50ZXIgPSAwO1xuXHRcdGNvbnN0IGVkaXRvcldpbGxDbG9zZUxpc3RlbmVyID0gZ3JvdXAub25XaWxsQ2xvc2VFZGl0b3IoKCkgPT4ge1xuXHRcdFx0ZWRpdG9yV2lsbENsb3NlQ291bnRlcisrO1xuXHRcdH0pO1xuXG5cdFx0bGV0IGVkaXRvckRpZENsb3NlQ291bnRlciA9IDA7XG5cdFx0Y29uc3QgZWRpdG9yRGlkQ2xvc2VMaXN0ZW5lciA9IGdyb3VwLm9uRGlkQ2xvc2VFZGl0b3IoKCkgPT4ge1xuXHRcdFx0ZWRpdG9yRGlkQ2xvc2VDb3VudGVyKys7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBpbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0SW5hY3RpdmUgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyL2luYWN0aXZlJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3IoaW5wdXRJbmFjdGl2ZSwgeyBpbmFjdGl2ZTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0FjdGl2ZShpbnB1dCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0FjdGl2ZShpbnB1dEluYWN0aXZlKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyhpbnB1dCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb250YWlucyhpbnB1dEluYWN0aXZlKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JDYXBhYmlsaXRpZXNDb3VudGVyLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yRGlkT3BlbkNvdW50ZXIsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoZWRpdG9yT3BlbkV2ZW50c1swXSBhcyBJR3JvdXBFZGl0b3JPcGVuRXZlbnQpLmVkaXRvckluZGV4LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGVkaXRvck9wZW5FdmVudHNbMV0gYXMgSUdyb3VwRWRpdG9yT3BlbkV2ZW50KS5lZGl0b3JJbmRleCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvck9wZW5FdmVudHNbMF0uZWRpdG9yLCBpbnB1dCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvck9wZW5FdmVudHNbMV0uZWRpdG9yLCBpbnB1dEluYWN0aXZlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlRWRpdG9yQ2hhbmdlQ291bnRlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMCksIGlucHV0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgxKSwgaW5wdXRJbmFjdGl2ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEluZGV4T2ZFZGl0b3IoaW5wdXQpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0SW5kZXhPZkVkaXRvcihpbnB1dEluYWN0aXZlKSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRmlyc3QoaW5wdXQpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNGaXJzdChpbnB1dEluYWN0aXZlKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0xhc3QoaW5wdXQpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzTGFzdChpbnB1dEluYWN0aXZlKSwgdHJ1ZSk7XG5cblx0XHRpbnB1dC5jYXBhYmlsaXRpZXMgPSBFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5SZXF1aXJlc1RydXN0O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JDYXBhYmlsaXRpZXNDb3VudGVyLCAxKTtcblxuXHRcdGlucHV0SW5hY3RpdmUuY2FwYWJpbGl0aWVzID0gRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuU2luZ2xldG9uO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JDYXBhYmlsaXRpZXNDb3VudGVyLCAyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5wcmV2aWV3RWRpdG9yLCBpbnB1dEluYWN0aXZlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNQaW5uZWQoaW5wdXRJbmFjdGl2ZSksIGZhbHNlKTtcblx0XHRncm91cC5waW5FZGl0b3IoaW5wdXRJbmFjdGl2ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvclBpbkNvdW50ZXIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1Bpbm5lZChpbnB1dEluYWN0aXZlKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0Lm9rKCFncm91cC5wcmV2aWV3RWRpdG9yKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5hY3RpdmVFZGl0b3IsIGlucHV0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yUGFuZT8uZ2V0SWQoKSwgVEVTVF9FRElUT1JfSUQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMik7XG5cblx0XHRjb25zdCBtcnUgPSBncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ydVswXSwgaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtcnVbMV0sIGlucHV0SW5hY3RpdmUpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dEluYWN0aXZlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlRWRpdG9yQ2hhbmdlQ291bnRlciwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmFjdGl2ZUVkaXRvciwgaW5wdXRJbmFjdGl2ZSk7XG5cblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKGlucHV0KTtcblx0XHRjb25zdCBjbG9zZWQgPSBhd2FpdCBncm91cC5jbG9zZUVkaXRvcihpbnB1dEluYWN0aXZlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvc2VkLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3RpdmVFZGl0b3JDaGFuZ2VDb3VudGVyLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yQ2xvc2VDb3VudGVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGVkaXRvckNsb3NlRXZlbnRzWzBdIGFzIElHcm91cEVkaXRvck9wZW5FdmVudCkuZWRpdG9ySW5kZXgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JDbG9zZUV2ZW50c1swXS5lZGl0b3IsIGlucHV0SW5hY3RpdmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JDbG9zZUNvdW50ZXIxLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yV2lsbENsb3NlQ291bnRlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvckRpZENsb3NlQ291bnRlciwgMSk7XG5cblx0XHRhc3NlcnQub2soaW5wdXRJbmFjdGl2ZS5nb3REaXNwb3NlZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBpbnB1dCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yU3RpY2t5Q291bnRlciwgMCk7XG5cdFx0Z3JvdXAuc3RpY2tFZGl0b3IoaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JTdGlja3lDb3VudGVyLCAxKTtcblx0XHRncm91cC51bnN0aWNrRWRpdG9yKGlucHV0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yU3RpY2t5Q291bnRlciwgMik7XG5cblx0XHRlZGl0b3JDbG9zZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRlZGl0b3JXaWxsQ2xvc2VMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0ZWRpdG9yRGlkQ2xvc2VMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0YWN0aXZlRWRpdG9yQ2hhbmdlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdGVkaXRvckdyb3VwTW9kZWxDaGFuZ2VMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29wZW5FZGl0b3JzIC8gY2xvc2VFZGl0b3JzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dEluYWN0aXZlID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2Jhci9pbmFjdGl2ZScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9ycyhbXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfSxcblx0XHRcdHsgZWRpdG9yOiBpbnB1dEluYWN0aXZlIH1cblx0XHRdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMCksIGlucHV0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgxKSwgaW5wdXRJbmFjdGl2ZSk7XG5cblx0XHRhd2FpdCBncm91cC5jbG9zZUVkaXRvcnMoW2lucHV0LCBpbnB1dEluYWN0aXZlXSk7XG5cblx0XHRhc3NlcnQub2soaW5wdXQuZ290RGlzcG9zZWQpO1xuXHRcdGFzc2VydC5vayhpbnB1dEluYWN0aXZlLmdvdERpc3Bvc2VkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0VtcHR5LCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnY2xvc2VFZGl0b3IgLSBkaXJ0eSBlZGl0b3IgaGFuZGxpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnQsIGluc3RhbnRpYXRpb25TZXJ2aWNlXSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblxuXHRcdGNvbnN0IGFjY2Vzc29yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFNlcnZpY2VBY2Nlc3Nvcik7XG5cdFx0YWNjZXNzb3IuZmlsZURpYWxvZ1NlcnZpY2Uuc2V0Q29uZmlybVJlc3VsdChDb25maXJtUmVzdWx0LkRPTlRfU0FWRSk7XG5cblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cblx0XHRjb25zdCBpbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGlucHV0LmRpcnR5ID0gdHJ1ZTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQpO1xuXG5cdFx0YWNjZXNzb3IuZmlsZURpYWxvZ1NlcnZpY2Uuc2V0Q29uZmlybVJlc3VsdChDb25maXJtUmVzdWx0LkNBTkNFTCk7XG5cdFx0bGV0IGNsb3NlZCA9IGF3YWl0IGdyb3VwLmNsb3NlRWRpdG9yKGlucHV0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvc2VkLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQub2soIWlucHV0LmdvdERpc3Bvc2VkKTtcblxuXHRcdGFjY2Vzc29yLmZpbGVEaWFsb2dTZXJ2aWNlLnNldENvbmZpcm1SZXN1bHQoQ29uZmlybVJlc3VsdC5ET05UX1NBVkUpO1xuXHRcdGNsb3NlZCA9IGF3YWl0IGdyb3VwLmNsb3NlRWRpdG9yKGlucHV0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvc2VkLCB0cnVlKTtcblxuXHRcdGFzc2VydC5vayhpbnB1dC5nb3REaXNwb3NlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nsb3NlRWRpdG9yIChvbmUsIG9wZW5lZCBpbiBtdWx0aXBsZSBncm91cHMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXG5cdFx0Y29uc3QgcmlnaHRHcm91cCA9IHBhcnQuYWRkR3JvdXAoZ3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXRJbmFjdGl2ZSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIvaW5hY3RpdmUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcnMoW3sgZWRpdG9yOiBpbnB1dCwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9LCB7IGVkaXRvcjogaW5wdXRJbmFjdGl2ZSB9XSk7XG5cdFx0YXdhaXQgcmlnaHRHcm91cC5vcGVuRWRpdG9ycyhbeyBlZGl0b3I6IGlucHV0LCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0sIHsgZWRpdG9yOiBpbnB1dEluYWN0aXZlIH1dKTtcblxuXHRcdGxldCBjbG9zZWQgPSBhd2FpdCByaWdodEdyb3VwLmNsb3NlRWRpdG9yKGlucHV0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvc2VkLCB0cnVlKTtcblxuXHRcdGFzc2VydC5vayghaW5wdXQuZ290RGlzcG9zZWQpO1xuXG5cdFx0Y2xvc2VkID0gYXdhaXQgZ3JvdXAuY2xvc2VFZGl0b3IoaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbG9zZWQsIHRydWUpO1xuXG5cdFx0YXNzZXJ0Lm9rKGlucHV0LmdvdERpc3Bvc2VkKTtcblx0fSk7XG5cblx0dGVzdCgnY2xvc2VFZGl0b3IgLSBjYW5ub3QgY2xvc2UgZWRpdG9yIGhhbmRsaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cblx0XHRjb25zdCBpbnB1dCA9IGNyZWF0ZUNhbm5vdENsb3NlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKGlucHV0KTtcblxuXHRcdGNvbnN0IGNsb3NlZCA9IGF3YWl0IGdyb3VwLmNsb3NlRWRpdG9yKGlucHV0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvc2VkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBpbnB1dCk7XG5cdFx0YXNzZXJ0Lm9rKCFpbnB1dC5nb3REaXNwb3NlZCk7XG5cblx0XHRjb25zdCBmb3JjZUNsb3NlZCA9IGF3YWl0IGdyb3VwLmNsb3NlRWRpdG9yKGlucHV0LCB7IGZvcmNlOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JjZUNsb3NlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXHRcdGFzc2VydC5vayhpbnB1dC5nb3REaXNwb3NlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nsb3NlRWRpdG9ycyAtIGRpcnR5IGVkaXRvciBoYW5kbGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydCwgaW5zdGFudGlhdGlvblNlcnZpY2VdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXG5cdFx0Y29uc3QgYWNjZXNzb3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0U2VydmljZUFjY2Vzc29yKTtcblx0XHRhY2Nlc3Nvci5maWxlRGlhbG9nU2VydmljZS5zZXRDb25maXJtUmVzdWx0KENvbmZpcm1SZXN1bHQuRE9OVF9TQVZFKTtcblx0XHRsZXQgY2xvc2VSZXN1bHQgPSBmYWxzZTtcblxuXHRcdGNvbnN0IGdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRpbnB1dDEuZGlydHkgPSB0cnVlO1xuXG5cdFx0Y29uc3QgaW5wdXQyID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dDEpO1xuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQyKTtcblxuXHRcdGFjY2Vzc29yLmZpbGVEaWFsb2dTZXJ2aWNlLnNldENvbmZpcm1SZXN1bHQoQ29uZmlybVJlc3VsdC5DQU5DRUwpO1xuXHRcdGNsb3NlUmVzdWx0ID0gYXdhaXQgZ3JvdXAuY2xvc2VFZGl0b3JzKFtpbnB1dDEsIGlucHV0Ml0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbG9zZVJlc3VsdCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0Lm9rKCFpbnB1dDEuZ290RGlzcG9zZWQpO1xuXHRcdGFzc2VydC5vayghaW5wdXQyLmdvdERpc3Bvc2VkKTtcblxuXHRcdGFjY2Vzc29yLmZpbGVEaWFsb2dTZXJ2aWNlLnNldENvbmZpcm1SZXN1bHQoQ29uZmlybVJlc3VsdC5ET05UX1NBVkUpO1xuXHRcdGNsb3NlUmVzdWx0ID0gYXdhaXQgZ3JvdXAuY2xvc2VFZGl0b3JzKFtpbnB1dDEsIGlucHV0Ml0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbG9zZVJlc3VsdCwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQub2soaW5wdXQxLmdvdERpc3Bvc2VkKTtcblx0XHRhc3NlcnQub2soaW5wdXQyLmdvdERpc3Bvc2VkKTtcblx0fSk7XG5cblx0dGVzdCgnY2xvc2VFZGl0b3JzIChleGNlcHQgb25lKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0VtcHR5LCB0cnVlKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDIgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQzID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjMnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcnMoW1xuXHRcdFx0eyBlZGl0b3I6IGlucHV0MSwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9LFxuXHRcdFx0eyBlZGl0b3I6IGlucHV0Miwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9LFxuXHRcdFx0eyBlZGl0b3I6IGlucHV0MyB9XG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDApLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDIpLCBpbnB1dDMpO1xuXG5cdFx0YXdhaXQgZ3JvdXAuY2xvc2VFZGl0b3JzKHsgZXhjZXB0OiBpbnB1dDIgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQyKTtcblx0fSk7XG5cblx0dGVzdCgnY2xvc2VFZGl0b3JzIC0gY2Fubm90IGNsb3NlIGVkaXRvciBoYW5kbGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjEnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0MiA9IGNyZWF0ZUNhbm5vdENsb3NlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcnMoW1xuXHRcdFx0eyBlZGl0b3I6IGlucHV0MSwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9LFxuXHRcdFx0eyBlZGl0b3I6IGlucHV0Miwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9XG5cdFx0XSk7XG5cblx0XHRjb25zdCBjbG9zZVJlc3VsdCA9IGF3YWl0IGdyb3VwLmNsb3NlRWRpdG9ycyhbaW5wdXQxLCBpbnB1dDJdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvc2VSZXN1bHQsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCksIFtpbnB1dDJdKTtcblx0XHRhc3NlcnQub2soaW5wdXQxLmdvdERpc3Bvc2VkKTtcblx0XHRhc3NlcnQub2soIWlucHV0Mi5nb3REaXNwb3NlZCk7XG5cblx0XHRjb25zdCBmb3JjZUNsb3NlUmVzdWx0ID0gYXdhaXQgZ3JvdXAuY2xvc2VFZGl0b3JzKFtpbnB1dDJdLCB7IGZvcmNlOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JjZUNsb3NlUmVzdWx0LCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNFbXB0eSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0Lm9rKGlucHV0Mi5nb3REaXNwb3NlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nsb3NlRWRpdG9ycyAoZXhjZXB0IG9uZSwgc3RpY2t5IGVkaXRvciknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXHRcdGNvbnN0IGdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNFbXB0eSwgdHJ1ZSk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0MyA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3JzKFtcblx0XHRcdHsgZWRpdG9yOiBpbnB1dDEsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlLCBzdGlja3k6IHRydWUgfSB9LFxuXHRcdFx0eyBlZGl0b3I6IGlucHV0Miwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9LFxuXHRcdFx0eyBlZGl0b3I6IGlucHV0MyB9XG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5zdGlja3lDb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMCksIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMSksIGlucHV0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMiksIGlucHV0Myk7XG5cblx0XHRhd2FpdCBncm91cC5jbG9zZUVkaXRvcnMoeyBleGNlcHQ6IGlucHV0MiwgZXhjbHVkZVN0aWNreTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnN0aWNreUNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgxKSwgaW5wdXQyKTtcblxuXHRcdGF3YWl0IGdyb3VwLmNsb3NlRWRpdG9ycyh7IGV4Y2VwdDogaW5wdXQyIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RpY2t5Q291bnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDApLCBpbnB1dDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG9zZUVkaXRvcnMgKHNhdmVkIG9ubHkpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjEnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0MiA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDMgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9ycyhbXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQxLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0sXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQyLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0sXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQzIH1cblx0XHRdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMCksIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMSksIGlucHV0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMiksIGlucHV0Myk7XG5cblx0XHRhd2FpdCBncm91cC5jbG9zZUVkaXRvcnMoeyBzYXZlZE9ubHk6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAwKTtcblx0fSk7XG5cblx0dGVzdCgnY2xvc2VFZGl0b3JzIChzYXZlZCBvbmx5LCBzdGlja3kgZWRpdG9yKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0VtcHR5LCB0cnVlKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDIgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQzID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjMnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcnMoW1xuXHRcdFx0eyBlZGl0b3I6IGlucHV0MSwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUsIHN0aWNreTogdHJ1ZSB9IH0sXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQyLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0sXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQzIH1cblx0XHRdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnN0aWNreUNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgxKSwgaW5wdXQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgyKSwgaW5wdXQzKTtcblxuXHRcdGF3YWl0IGdyb3VwLmNsb3NlRWRpdG9ycyh7IHNhdmVkT25seTogdHJ1ZSwgZXhjbHVkZVN0aWNreTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnN0aWNreUNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQxKTtcblxuXHRcdGF3YWl0IGdyb3VwLmNsb3NlRWRpdG9ycyh7IHNhdmVkT25seTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG9zZUVkaXRvcnMgKGRpcmVjdGlvbjogcmlnaHQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjEnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0MiA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDMgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9ycyhbXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQxLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0sXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQyLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0sXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQzIH1cblx0XHRdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMCksIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMSksIGlucHV0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMiksIGlucHV0Myk7XG5cblx0XHRhd2FpdCBncm91cC5jbG9zZUVkaXRvcnMoeyBkaXJlY3Rpb246IENsb3NlRGlyZWN0aW9uLlJJR0hULCBleGNlcHQ6IGlucHV0MiB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDApLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG9zZUVkaXRvcnMgKGRpcmVjdGlvbjogcmlnaHQsIHN0aWNreSBlZGl0b3IpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjEnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0MiA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDMgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9ycyhbXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQxLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSwgc3RpY2t5OiB0cnVlIH0gfSxcblx0XHRcdHsgZWRpdG9yOiBpbnB1dDIsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfSxcblx0XHRcdHsgZWRpdG9yOiBpbnB1dDMgfVxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RpY2t5Q291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDApLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDIpLCBpbnB1dDMpO1xuXG5cdFx0YXdhaXQgZ3JvdXAuY2xvc2VFZGl0b3JzKHsgZGlyZWN0aW9uOiBDbG9zZURpcmVjdGlvbi5SSUdIVCwgZXhjZXB0OiBpbnB1dDIsIGV4Y2x1ZGVTdGlja3k6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RpY2t5Q291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDApLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dDIpO1xuXG5cdFx0YXdhaXQgZ3JvdXAuY2xvc2VFZGl0b3JzKHsgZGlyZWN0aW9uOiBDbG9zZURpcmVjdGlvbi5SSUdIVCwgZXhjZXB0OiBpbnB1dDIgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgxKSwgaW5wdXQyKTtcblx0fSk7XG5cblx0dGVzdCgnY2xvc2VFZGl0b3JzIChkaXJlY3Rpb246IGxlZnQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjEnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0MiA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDMgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9ycyhbXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQxLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0sXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQyLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0sXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQzIH1cblx0XHRdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMCksIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMSksIGlucHV0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMiksIGlucHV0Myk7XG5cblx0XHRhd2FpdCBncm91cC5jbG9zZUVkaXRvcnMoeyBkaXJlY3Rpb246IENsb3NlRGlyZWN0aW9uLkxFRlQsIGV4Y2VwdDogaW5wdXQyIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMCksIGlucHV0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMSksIGlucHV0Myk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nsb3NlRWRpdG9ycyAoZGlyZWN0aW9uOiBsZWZ0LCBzdGlja3kgZWRpdG9yKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0VtcHR5LCB0cnVlKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDIgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQzID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjMnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcnMoW1xuXHRcdFx0eyBlZGl0b3I6IGlucHV0MSwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUsIHN0aWNreTogdHJ1ZSB9IH0sXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQyLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0sXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQzIH1cblx0XHRdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnN0aWNreUNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgxKSwgaW5wdXQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgyKSwgaW5wdXQzKTtcblxuXHRcdGF3YWl0IGdyb3VwLmNsb3NlRWRpdG9ycyh7IGRpcmVjdGlvbjogQ2xvc2VEaXJlY3Rpb24uTEVGVCwgZXhjZXB0OiBpbnB1dDIsIGV4Y2x1ZGVTdGlja3k6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RpY2t5Q291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDApLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDIpLCBpbnB1dDMpO1xuXG5cdFx0YXdhaXQgZ3JvdXAuY2xvc2VFZGl0b3JzKHsgZGlyZWN0aW9uOiBDbG9zZURpcmVjdGlvbi5MRUZULCBleGNlcHQ6IGlucHV0MiB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDApLCBpbnB1dDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dDMpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG9zZUFsbEVkaXRvcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXHRcdGNvbnN0IGdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNFbXB0eSwgdHJ1ZSk7XG5cblx0XHRjb25zdCBpbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0SW5hY3RpdmUgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyL2luYWN0aXZlJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3JzKFtcblx0XHRcdHsgZWRpdG9yOiBpbnB1dCwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9LFxuXHRcdFx0eyBlZGl0b3I6IGlucHV0SW5hY3RpdmUgfVxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dEluYWN0aXZlKTtcblxuXHRcdGF3YWl0IGdyb3VwLmNsb3NlQWxsRWRpdG9ycygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0VtcHR5LCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnY2xvc2VBbGxFZGl0b3JzIC0gZGlydHkgZWRpdG9yIGhhbmRsaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0LCBpbnN0YW50aWF0aW9uU2VydmljZV0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0bGV0IGNsb3NlUmVzdWx0ID0gdHJ1ZTtcblxuXHRcdGNvbnN0IGFjY2Vzc29yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFNlcnZpY2VBY2Nlc3Nvcik7XG5cdFx0YWNjZXNzb3IuZmlsZURpYWxvZ1NlcnZpY2Uuc2V0Q29uZmlybVJlc3VsdChDb25maXJtUmVzdWx0LkRPTlRfU0FWRSk7XG5cblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0aW5wdXQxLmRpcnR5ID0gdHJ1ZTtcblxuXHRcdGNvbnN0IGlucHV0MiA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQxKTtcblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKGlucHV0Mik7XG5cblx0XHRhY2Nlc3Nvci5maWxlRGlhbG9nU2VydmljZS5zZXRDb25maXJtUmVzdWx0KENvbmZpcm1SZXN1bHQuQ0FOQ0VMKTtcblx0XHRjbG9zZVJlc3VsdCA9IGF3YWl0IGdyb3VwLmNsb3NlQWxsRWRpdG9ycygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsb3NlUmVzdWx0LCBmYWxzZSk7XG5cdFx0YXNzZXJ0Lm9rKCFpbnB1dDEuZ290RGlzcG9zZWQpO1xuXHRcdGFzc2VydC5vayghaW5wdXQyLmdvdERpc3Bvc2VkKTtcblxuXHRcdGFjY2Vzc29yLmZpbGVEaWFsb2dTZXJ2aWNlLnNldENvbmZpcm1SZXN1bHQoQ29uZmlybVJlc3VsdC5ET05UX1NBVkUpO1xuXHRcdGNsb3NlUmVzdWx0ID0gYXdhaXQgZ3JvdXAuY2xvc2VBbGxFZGl0b3JzKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvc2VSZXN1bHQsIHRydWUpO1xuXHRcdGFzc2VydC5vayhpbnB1dDEuZ290RGlzcG9zZWQpO1xuXHRcdGFzc2VydC5vayhpbnB1dDIuZ290RGlzcG9zZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG9zZUFsbEVkaXRvcnMgKHN0aWNreSBlZGl0b3IpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dEluYWN0aXZlID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2Jhci9pbmFjdGl2ZScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9ycyhbXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlLCBzdGlja3k6IHRydWUgfSB9LFxuXHRcdFx0eyBlZGl0b3I6IGlucHV0SW5hY3RpdmUgfVxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RpY2t5Q291bnQsIDEpO1xuXG5cdFx0YXdhaXQgZ3JvdXAuY2xvc2VBbGxFZGl0b3JzKHsgZXhjbHVkZVN0aWNreTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnN0aWNreUNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAuY2xvc2VBbGxFZGl0b3JzKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNFbXB0eSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nsb3NlQWxsRWRpdG9ycyAtIGNhbm5vdCBjbG9zZSBlZGl0b3IgaGFuZGxpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXHRcdGNvbnN0IGdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDIgPSBjcmVhdGVDYW5ub3RDbG9zZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3JzKFtcblx0XHRcdHsgZWRpdG9yOiBpbnB1dDEsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfSxcblx0XHRcdHsgZWRpdG9yOiBpbnB1dDIsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfVxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgY2xvc2VSZXN1bHQgPSBhd2FpdCBncm91cC5jbG9zZUFsbEVkaXRvcnMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvc2VSZXN1bHQsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCksIFtpbnB1dDJdKTtcblx0XHRhc3NlcnQub2soaW5wdXQxLmdvdERpc3Bvc2VkKTtcblx0XHRhc3NlcnQub2soIWlucHV0Mi5nb3REaXNwb3NlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nsb3NlQWxsRWRpdG9ycyAtIGZvcmNlIGNsb3NlcyBjYW5ub3QgY2xvc2UgZWRpdG9ycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVDYW5ub3RDbG9zZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dCk7XG5cblx0XHRjb25zdCBjbG9zZVJlc3VsdCA9IGF3YWl0IGdyb3VwLmNsb3NlQWxsRWRpdG9ycyh7IGZvcmNlOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbG9zZVJlc3VsdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXHRcdGFzc2VydC5vayhpbnB1dC5nb3REaXNwb3NlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmVFZGl0b3IgKHNhbWUgZ3JvdXApJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dEluYWN0aXZlID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2Jhci9pbmFjdGl2ZScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRjb25zdCBtb3ZlRXZlbnRzOiBJR3JvdXBNb2RlbENoYW5nZUV2ZW50W10gPSBbXTtcblx0XHRjb25zdCBlZGl0b3JHcm91cE1vZGVsQ2hhbmdlTGlzdGVuZXIgPSBncm91cC5vbkRpZE1vZGVsQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUua2luZCA9PT0gR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX01PVkUpIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKGUuZWRpdG9yKTtcblx0XHRcdFx0bW92ZUV2ZW50cy5wdXNoKGUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcnMoW3sgZWRpdG9yOiBpbnB1dCwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9LCB7IGVkaXRvcjogaW5wdXRJbmFjdGl2ZSB9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dEluYWN0aXZlKTtcblx0XHRncm91cC5tb3ZlRWRpdG9yKGlucHV0SW5hY3RpdmUsIGdyb3VwLCB7IGluZGV4OiAwIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb3ZlRXZlbnRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChtb3ZlRXZlbnRzWzBdIGFzIElHcm91cEVkaXRvck9wZW5FdmVudCkuZWRpdG9ySW5kZXgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgobW92ZUV2ZW50c1swXSBhcyBJR3JvdXBFZGl0b3JNb3ZlRXZlbnQpLm9sZEVkaXRvckluZGV4LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW92ZUV2ZW50c1swXS5lZGl0b3IsIGlucHV0SW5hY3RpdmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDApLCBpbnB1dEluYWN0aXZlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgxKSwgaW5wdXQpO1xuXG5cdFx0Y29uc3QgcmVzID0gZ3JvdXAubW92ZUVkaXRvcnMoW3sgZWRpdG9yOiBpbnB1dEluYWN0aXZlLCBvcHRpb25zOiB7IGluZGV4OiAxIH0gfV0sIGdyb3VwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW92ZUV2ZW50cy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgobW92ZUV2ZW50c1sxXSBhcyBJR3JvdXBFZGl0b3JPcGVuRXZlbnQpLmVkaXRvckluZGV4LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKG1vdmVFdmVudHNbMV0gYXMgSUdyb3VwRWRpdG9yTW92ZUV2ZW50KS5vbGRFZGl0b3JJbmRleCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vdmVFdmVudHNbMV0uZWRpdG9yLCBpbnB1dEluYWN0aXZlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dEluYWN0aXZlKTtcblxuXHRcdGVkaXRvckdyb3VwTW9kZWxDaGFuZ2VMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmVFZGl0b3IgKGFjcm9zcyBncm91cHMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXG5cdFx0Y29uc3QgcmlnaHRHcm91cCA9IHBhcnQuYWRkR3JvdXAoZ3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXRJbmFjdGl2ZSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIvaW5hY3RpdmUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcnMoW3sgZWRpdG9yOiBpbnB1dCwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9LCB7IGVkaXRvcjogaW5wdXRJbmFjdGl2ZSB9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dEluYWN0aXZlKTtcblx0XHRncm91cC5tb3ZlRWRpdG9yKGlucHV0SW5hY3RpdmUsIHJpZ2h0R3JvdXAsIHsgaW5kZXg6IDAgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyaWdodEdyb3VwLmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRHcm91cC5nZXRFZGl0b3JCeUluZGV4KDApLCBpbnB1dEluYWN0aXZlKTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZUVkaXRvcnMgKGFjcm9zcyBncm91cHMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXG5cdFx0Y29uc3QgcmlnaHRHcm91cCA9IHBhcnQuYWRkR3JvdXAoZ3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDIgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQzID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjMnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcnMoW3sgZWRpdG9yOiBpbnB1dDEsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfSwgeyBlZGl0b3I6IGlucHV0Miwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9LCB7IGVkaXRvcjogaW5wdXQzLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgxKSwgaW5wdXQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgyKSwgaW5wdXQzKTtcblx0XHRncm91cC5tb3ZlRWRpdG9ycyhbeyBlZGl0b3I6IGlucHV0MiB9LCB7IGVkaXRvcjogaW5wdXQzIH1dLCByaWdodEdyb3VwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyaWdodEdyb3VwLmNvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRHcm91cC5nZXRFZGl0b3JCeUluZGV4KDApLCBpbnB1dDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyaWdodEdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMSksIGlucHV0Myk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcHlFZGl0b3IgKGFjcm9zcyBncm91cHMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXG5cdFx0Y29uc3QgcmlnaHRHcm91cCA9IHBhcnQuYWRkR3JvdXAoZ3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXRJbmFjdGl2ZSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIvaW5hY3RpdmUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcnMoW3sgZWRpdG9yOiBpbnB1dCwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9LCB7IGVkaXRvcjogaW5wdXRJbmFjdGl2ZSB9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dEluYWN0aXZlKTtcblx0XHRncm91cC5jb3B5RWRpdG9yKGlucHV0SW5hY3RpdmUsIHJpZ2h0R3JvdXAsIHsgaW5kZXg6IDAgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dEluYWN0aXZlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRHcm91cC5jb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0R3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXRJbmFjdGl2ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcHlFZGl0b3JzIChhY3Jvc3MgZ3JvdXBzKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0VtcHR5LCB0cnVlKTtcblxuXHRcdGNvbnN0IHJpZ2h0R3JvdXAgPSBwYXJ0LmFkZEdyb3VwKGdyb3VwLCBHcm91cERpcmVjdGlvbi5SSUdIVCk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0MyA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3JzKFt7IGVkaXRvcjogaW5wdXQxLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0sIHsgZWRpdG9yOiBpbnB1dDIsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfSwgeyBlZGl0b3I6IGlucHV0Mywgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMCksIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMSksIGlucHV0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMiksIGlucHV0Myk7XG5cdFx0Z3JvdXAuY29weUVkaXRvcnMoW3sgZWRpdG9yOiBpbnB1dDEgfSwgeyBlZGl0b3I6IGlucHV0MiB9LCB7IGVkaXRvcjogaW5wdXQzIH1dLCByaWdodEdyb3VwKTtcblx0XHRbZ3JvdXAsIHJpZ2h0R3JvdXBdLmZvckVhY2goZ3JvdXAgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMCksIGlucHV0MSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgxKSwgaW5wdXQyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDIpLCBpbnB1dDMpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNlRWRpdG9ycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0VtcHR5LCB0cnVlKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXRJbmFjdGl2ZSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIvaW5hY3RpdmUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAucmVwbGFjZUVkaXRvcnMoW3sgZWRpdG9yOiBpbnB1dCwgcmVwbGFjZW1lbnQ6IGlucHV0SW5hY3RpdmUgfV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMCksIGlucHV0SW5hY3RpdmUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNlRWRpdG9ycyAtIGRpcnR5IGVkaXRvciBoYW5kbGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydCwgaW5zdGFudGlhdGlvblNlcnZpY2VdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXG5cdFx0Y29uc3QgYWNjZXNzb3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0U2VydmljZUFjY2Vzc29yKTtcblx0XHRhY2Nlc3Nvci5maWxlRGlhbG9nU2VydmljZS5zZXRDb25maXJtUmVzdWx0KENvbmZpcm1SZXN1bHQuRE9OVF9TQVZFKTtcblxuXHRcdGNvbnN0IGdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRpbnB1dDEuZGlydHkgPSB0cnVlO1xuXG5cdFx0Y29uc3QgaW5wdXQyID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5hY3RpdmVFZGl0b3IsIGlucHV0MSk7XG5cblx0XHRhY2Nlc3Nvci5maWxlRGlhbG9nU2VydmljZS5zZXRDb25maXJtUmVzdWx0KENvbmZpcm1SZXN1bHQuQ0FOQ0VMKTtcblx0XHRhd2FpdCBncm91cC5yZXBsYWNlRWRpdG9ycyhbeyBlZGl0b3I6IGlucHV0MSwgcmVwbGFjZW1lbnQ6IGlucHV0MiB9XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5vayghaW5wdXQxLmdvdERpc3Bvc2VkKTtcblxuXHRcdGFjY2Vzc29yLmZpbGVEaWFsb2dTZXJ2aWNlLnNldENvbmZpcm1SZXN1bHQoQ29uZmlybVJlc3VsdC5ET05UX1NBVkUpO1xuXHRcdGF3YWl0IGdyb3VwLnJlcGxhY2VFZGl0b3JzKFt7IGVkaXRvcjogaW5wdXQxLCByZXBsYWNlbWVudDogaW5wdXQyIH1dKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5hY3RpdmVFZGl0b3IsIGlucHV0Mik7XG5cdFx0YXNzZXJ0Lm9rKGlucHV0MS5nb3REaXNwb3NlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcGxhY2VFZGl0b3JzIC0gZm9yY2VSZXBsYWNlRGlydHkgZmxhZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydCwgaW5zdGFudGlhdGlvblNlcnZpY2VdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXG5cdFx0Y29uc3QgYWNjZXNzb3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0U2VydmljZUFjY2Vzc29yKTtcblx0XHRhY2Nlc3Nvci5maWxlRGlhbG9nU2VydmljZS5zZXRDb25maXJtUmVzdWx0KENvbmZpcm1SZXN1bHQuRE9OVF9TQVZFKTtcblxuXHRcdGNvbnN0IGdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRpbnB1dDEuZGlydHkgPSB0cnVlO1xuXG5cdFx0Y29uc3QgaW5wdXQyID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5hY3RpdmVFZGl0b3IsIGlucHV0MSk7XG5cdFx0YWNjZXNzb3IuZmlsZURpYWxvZ1NlcnZpY2Uuc2V0Q29uZmlybVJlc3VsdChDb25maXJtUmVzdWx0LkNBTkNFTCk7XG5cdFx0YXdhaXQgZ3JvdXAucmVwbGFjZUVkaXRvcnMoW3sgZWRpdG9yOiBpbnB1dDEsIHJlcGxhY2VtZW50OiBpbnB1dDIsIGZvcmNlUmVwbGFjZURpcnR5OiBmYWxzZSB9XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5vayghaW5wdXQxLmdvdERpc3Bvc2VkKTtcblxuXHRcdGF3YWl0IGdyb3VwLnJlcGxhY2VFZGl0b3JzKFt7IGVkaXRvcjogaW5wdXQxLCByZXBsYWNlbWVudDogaW5wdXQyLCBmb3JjZVJlcGxhY2VEaXJ0eTogdHJ1ZSB9XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBpbnB1dDIpO1xuXHRcdGFzc2VydC5vayhpbnB1dDEuZ290RGlzcG9zZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNlRWRpdG9ycyAtIHByb3BlciBpbmRleCBoYW5kbGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0VtcHR5LCB0cnVlKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDIgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQzID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjMnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0NCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXI0JyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDUgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyNScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRjb25zdCBpbnB1dDYgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyNicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQ3ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjcnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0OCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXI4JyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dDMsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQ0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKGlucHV0NSwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cblx0XHRhd2FpdCBncm91cC5yZXBsYWNlRWRpdG9ycyhbXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQxLCByZXBsYWNlbWVudDogaW5wdXQ2IH0sXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQzLCByZXBsYWNlbWVudDogaW5wdXQ3IH0sXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQ1LCByZXBsYWNlbWVudDogaW5wdXQ4IH1cblx0XHRdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDApLCBpbnB1dDYpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDIpLCBpbnB1dDcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDMpLCBpbnB1dDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDQpLCBpbnB1dDgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNlRWRpdG9ycyAtIHNob3VsZCBiZSBhYmxlIHRvIHJlcGxhY2Ugd2hlbiBzaWRlIGJ5IHNpZGUgZWRpdG9yIGlzIGludm9sdmVkIHdpdGggc2FtZSBpbnB1dCBzaWRlIGJ5IHNpZGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnQsIGluc3RhbnRpYXRpb25TZXJ2aWNlXSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBzaWRlQnlTaWRlSW5wdXQgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaWRlQnlTaWRlRWRpdG9ySW5wdXQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBpbnB1dCwgaW5wdXQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAucmVwbGFjZUVkaXRvcnMoW3sgZWRpdG9yOiBpbnB1dCwgcmVwbGFjZW1lbnQ6IHNpZGVCeVNpZGVJbnB1dCB9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgc2lkZUJ5U2lkZUlucHV0KTtcblxuXHRcdGF3YWl0IGdyb3VwLnJlcGxhY2VFZGl0b3JzKFt7IGVkaXRvcjogc2lkZUJ5U2lkZUlucHV0LCByZXBsYWNlbWVudDogaW5wdXQgfV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMCksIGlucHV0KTtcblx0fSk7XG5cblx0dGVzdCgncmVwbGFjZUVkaXRvcnMgLSBjYW5ub3QgY2xvc2UgZWRpdG9yIGhhbmRsaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cblx0XHRjb25zdCBpbnB1dCA9IGNyZWF0ZUNhbm5vdENsb3NlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgcmVwbGFjZW1lbnQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmF6JyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQpO1xuXHRcdGF3YWl0IGdyb3VwLnJlcGxhY2VFZGl0b3JzKFt7IGVkaXRvcjogaW5wdXQsIHJlcGxhY2VtZW50IH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCksIFtyZXBsYWNlbWVudF0pO1xuXHRcdGFzc2VydC5vayhpbnB1dC5nb3REaXNwb3NlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmQgZWRpdG9ycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdGNvbnN0IGdyb3VwMiA9IHBhcnQuYWRkR3JvdXAoZ3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNFbXB0eSwgdHJ1ZSk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjEnKSwgYCR7VEVTVF9FRElUT1JfSU5QVVRfSUR9LTFgKTtcblx0XHRjb25zdCBpbnB1dDMgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQ0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjQnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0NSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXI0JyksIGAke1RFU1RfRURJVE9SX0lOUFVUX0lEfS0xYCk7XG5cblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKGlucHV0MSwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dDIsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQzLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKGlucHV0NCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgZ3JvdXAyLm9wZW5FZGl0b3IoaW5wdXQ1LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblxuXHRcdGxldCBmb3VuZEVkaXRvcnMgPSBncm91cC5maW5kRWRpdG9ycyhVUkkuZmlsZSgnZm9vL2JhcjEnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kRWRpdG9ycy5sZW5ndGgsIDIpO1xuXHRcdGZvdW5kRWRpdG9ycyA9IGdyb3VwMi5maW5kRWRpdG9ycyhVUkkuZmlsZSgnZm9vL2JhcjQnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kRWRpdG9ycy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5kIGVkaXRvcnMgKHNpZGUgYnkgc2lkZSBzdXBwb3J0KScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydCwgaW5zdGFudGlhdGlvblNlcnZpY2VdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXG5cdFx0Y29uc3QgYWNjZXNzb3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0U2VydmljZUFjY2Vzc29yKTtcblxuXHRcdGNvbnN0IGdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNFbXB0eSwgdHJ1ZSk7XG5cblx0XHRjb25zdCBzZWNvbmRhcnlJbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXItc2Vjb25kYXJ5JyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBwcmltYXJ5SW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyLXByaW1hcnknKSwgYCR7VEVTVF9FRElUT1JfSU5QVVRfSUR9LTFgKTtcblxuXHRcdGNvbnN0IHNpZGVCeVNpZGVFZGl0b3IgPSBuZXcgU2lkZUJ5U2lkZUVkaXRvcklucHV0KHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBzZWNvbmRhcnlJbnB1dCwgcHJpbWFyeUlucHV0LCBhY2Nlc3Nvci5lZGl0b3JTZXJ2aWNlKTtcblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKHNpZGVCeVNpZGVFZGl0b3IsIHsgcGlubmVkOiB0cnVlIH0pO1xuXG5cdFx0bGV0IGZvdW5kRWRpdG9ycyA9IGdyb3VwLmZpbmRFZGl0b3JzKFVSSS5maWxlKCdmb28vYmFyLXNlY29uZGFyeScpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm91bmRFZGl0b3JzLmxlbmd0aCwgMCk7XG5cblx0XHRmb3VuZEVkaXRvcnMgPSBncm91cC5maW5kRWRpdG9ycyhVUkkuZmlsZSgnZm9vL2Jhci1zZWNvbmRhcnknKSwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5QUklNQVJZIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZEVkaXRvcnMubGVuZ3RoLCAwKTtcblxuXHRcdGZvdW5kRWRpdG9ycyA9IGdyb3VwLmZpbmRFZGl0b3JzKFVSSS5maWxlKCdmb28vYmFyLXByaW1hcnknKSwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5QUklNQVJZIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZEVkaXRvcnMubGVuZ3RoLCAxKTtcblxuXHRcdGZvdW5kRWRpdG9ycyA9IGdyb3VwLmZpbmRFZGl0b3JzKFVSSS5maWxlKCdmb28vYmFyLXNlY29uZGFyeScpLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlNFQ09OREFSWSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm91bmRFZGl0b3JzLmxlbmd0aCwgMSk7XG5cblx0XHRmb3VuZEVkaXRvcnMgPSBncm91cC5maW5kRWRpdG9ycyhVUkkuZmlsZSgnZm9vL2Jhci1wcmltYXJ5JyksIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuU0VDT05EQVJZIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZEVkaXRvcnMubGVuZ3RoLCAwKTtcblxuXHRcdGZvdW5kRWRpdG9ycyA9IGdyb3VwLmZpbmRFZGl0b3JzKFVSSS5maWxlKCdmb28vYmFyLXNlY29uZGFyeScpLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLkFOWSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm91bmRFZGl0b3JzLmxlbmd0aCwgMSk7XG5cblx0XHRmb3VuZEVkaXRvcnMgPSBncm91cC5maW5kRWRpdG9ycyhVUkkuZmlsZSgnZm9vL2Jhci1wcmltYXJ5JyksIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuQU5ZIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZEVkaXRvcnMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnZmluZCBuZWlnaGJvdXIgZ3JvdXAgKGxlZnQvcmlnaHQpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCByb290R3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdGNvbnN0IHJpZ2h0R3JvdXAgPSBwYXJ0LmFkZEdyb3VwKHJvb3RHcm91cCwgR3JvdXBEaXJlY3Rpb24uUklHSFQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0R3JvdXAsIHBhcnQuZmluZEdyb3VwKHsgZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbi5SSUdIVCB9LCByb290R3JvdXApKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdEdyb3VwLCBwYXJ0LmZpbmRHcm91cCh7IGRpcmVjdGlvbjogR3JvdXBEaXJlY3Rpb24uTEVGVCB9LCByaWdodEdyb3VwKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmQgbmVpZ2hib3VyIGdyb3VwICh1cC9kb3duKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0Y29uc3Qgcm9vdEdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblx0XHRjb25zdCBkb3duR3JvdXAgPSBwYXJ0LmFkZEdyb3VwKHJvb3RHcm91cCwgR3JvdXBEaXJlY3Rpb24uRE9XTik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZG93bkdyb3VwLCBwYXJ0LmZpbmRHcm91cCh7IGRpcmVjdGlvbjogR3JvdXBEaXJlY3Rpb24uRE9XTiB9LCByb290R3JvdXApKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdEdyb3VwLCBwYXJ0LmZpbmRHcm91cCh7IGRpcmVjdGlvbjogR3JvdXBEaXJlY3Rpb24uVVAgfSwgZG93bkdyb3VwKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmQgZ3JvdXAgYnkgbG9jYXRpb24gKGxlZnQvcmlnaHQpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCByb290R3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdGNvbnN0IHJpZ2h0R3JvdXAgPSBwYXJ0LmFkZEdyb3VwKHJvb3RHcm91cCwgR3JvdXBEaXJlY3Rpb24uUklHSFQpO1xuXHRcdGNvbnN0IGRvd25Hcm91cCA9IHBhcnQuYWRkR3JvdXAocmlnaHRHcm91cCwgR3JvdXBEaXJlY3Rpb24uRE9XTik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdEdyb3VwLCBwYXJ0LmZpbmRHcm91cCh7IGxvY2F0aW9uOiBHcm91cExvY2F0aW9uLkZJUlNUIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZG93bkdyb3VwLCBwYXJ0LmZpbmRHcm91cCh7IGxvY2F0aW9uOiBHcm91cExvY2F0aW9uLkxBU1QgfSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0R3JvdXAsIHBhcnQuZmluZEdyb3VwKHsgbG9jYXRpb246IEdyb3VwTG9jYXRpb24uTkVYVCB9LCByb290R3JvdXApKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdEdyb3VwLCBwYXJ0LmZpbmRHcm91cCh7IGxvY2F0aW9uOiBHcm91cExvY2F0aW9uLlBSRVZJT1VTIH0sIHJpZ2h0R3JvdXApKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkb3duR3JvdXAsIHBhcnQuZmluZEdyb3VwKHsgbG9jYXRpb246IEdyb3VwTG9jYXRpb24uTkVYVCB9LCByaWdodEdyb3VwKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0R3JvdXAsIHBhcnQuZmluZEdyb3VwKHsgbG9jYXRpb246IEdyb3VwTG9jYXRpb24uUFJFVklPVVMgfSwgZG93bkdyb3VwKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGx5TGF5b3V0ICgyeDIpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblxuXHRcdHBhcnQuYXBwbHlMYXlvdXQoeyBncm91cHM6IFt7IGdyb3VwczogW3t9LCB7fV0gfSwgeyBncm91cHM6IFt7fSwge31dIH1dLCBvcmllbnRhdGlvbjogR3JvdXBPcmllbnRhdGlvbi5IT1JJWk9OVEFMIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZ3JvdXBzLmxlbmd0aCwgNCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldExheW91dCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cblx0XHQvLyAyeDJcblx0XHRwYXJ0LmFwcGx5TGF5b3V0KHsgZ3JvdXBzOiBbeyBncm91cHM6IFt7fSwge31dIH0sIHsgZ3JvdXBzOiBbe30sIHt9XSB9XSwgb3JpZW50YXRpb246IEdyb3VwT3JpZW50YXRpb24uSE9SSVpPTlRBTCB9KTtcblx0XHRsZXQgbGF5b3V0ID0gcGFydC5nZXRMYXlvdXQoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXlvdXQub3JpZW50YXRpb24sIEdyb3VwT3JpZW50YXRpb24uSE9SSVpPTlRBTCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxheW91dC5ncm91cHMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGF5b3V0Lmdyb3Vwc1swXS5ncm91cHMhLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxheW91dC5ncm91cHNbMV0uZ3JvdXBzIS5sZW5ndGgsIDIpO1xuXG5cdFx0Ly8gMyBjb2x1bW5zXG5cdFx0cGFydC5hcHBseUxheW91dCh7IGdyb3VwczogW3t9LCB7fSwge31dLCBvcmllbnRhdGlvbjogR3JvdXBPcmllbnRhdGlvbi5WRVJUSUNBTCB9KTtcblx0XHRsYXlvdXQgPSBwYXJ0LmdldExheW91dCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxheW91dC5vcmllbnRhdGlvbiwgR3JvdXBPcmllbnRhdGlvbi5WRVJUSUNBTCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxheW91dC5ncm91cHMubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIGxheW91dC5ncm91cHNbMF0uc2l6ZSA9PT0gJ251bWJlcicpO1xuXHRcdGFzc2VydC5vayh0eXBlb2YgbGF5b3V0Lmdyb3Vwc1sxXS5zaXplID09PSAnbnVtYmVyJyk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiBsYXlvdXQuZ3JvdXBzWzJdLnNpemUgPT09ICdudW1iZXInKTtcblx0fSk7XG5cblx0dGVzdCgnY2VudGVyZWRMYXlvdXQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXG5cdFx0cGFydC5jZW50ZXJMYXlvdXQodHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5pc0xheW91dENlbnRlcmVkKCksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGlja3kgZWRpdG9ycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnN0aWNreUNvdW50LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCkubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwsIHsgZXhjbHVkZVN0aWNreTogdHJ1ZSB9KS5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSwgeyBleGNsdWRlU3RpY2t5OiB0cnVlIH0pLmxlbmd0aCwgMCk7XG5cblx0XHRjb25zdCBpbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0SW5hY3RpdmUgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyL2luYWN0aXZlJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3IoaW5wdXRJbmFjdGl2ZSwgeyBpbmFjdGl2ZTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5zdGlja3lDb3VudCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0KSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dEluYWN0aXZlKSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMLCB7IGV4Y2x1ZGVTdGlja3k6IHRydWUgfSkubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUsIHsgZXhjbHVkZVN0aWNreTogdHJ1ZSB9KS5sZW5ndGgsIDIpO1xuXG5cdFx0Z3JvdXAuc3RpY2tFZGl0b3IoaW5wdXQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnN0aWNreUNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXQpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXRJbmFjdGl2ZSksIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCwgeyBleGNsdWRlU3RpY2t5OiB0cnVlIH0pLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFLCB7IGV4Y2x1ZGVTdGlja3k6IHRydWUgfSkubGVuZ3RoLCAxKTtcblxuXHRcdGdyb3VwLnVuc3RpY2tFZGl0b3IoaW5wdXQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnN0aWNreUNvdW50LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXQpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0SW5hY3RpdmUpLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0SW5kZXhPZkVkaXRvcihpbnB1dCksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRJbmRleE9mRWRpdG9yKGlucHV0SW5hY3RpdmUpLCAxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCwgeyBleGNsdWRlU3RpY2t5OiB0cnVlIH0pLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFLCB7IGV4Y2x1ZGVTdGlja3k6IHRydWUgfSkubGVuZ3RoLCAyKTtcblxuXHRcdGxldCBlZGl0b3JNb3ZlQ291bnRlciA9IDA7XG5cdFx0Y29uc3QgZWRpdG9yR3JvdXBNb2RlbENoYW5nZUxpc3RlbmVyID0gZ3JvdXAub25EaWRNb2RlbENoYW5nZShlID0+IHtcblx0XHRcdGlmIChlLmtpbmQgPT09IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9NT1ZFKSB7XG5cdFx0XHRcdGFzc2VydC5vayhlLmVkaXRvcik7XG5cdFx0XHRcdGVkaXRvck1vdmVDb3VudGVyKys7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRncm91cC5zdGlja0VkaXRvcihpbnB1dEluYWN0aXZlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5zdGlja3lDb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0KSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dEluYWN0aXZlKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0SW5kZXhPZkVkaXRvcihpbnB1dCksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRJbmRleE9mRWRpdG9yKGlucHV0SW5hY3RpdmUpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yTW92ZUNvdW50ZXIsIDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMLCB7IGV4Y2x1ZGVTdGlja3k6IHRydWUgfSkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUsIHsgZXhjbHVkZVN0aWNreTogdHJ1ZSB9KS5sZW5ndGgsIDEpO1xuXG5cdFx0Y29uc3QgaW5wdXRTdGlja3kgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyL3N0aWNreScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKGlucHV0U3RpY2t5LCB7IHN0aWNreTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5zdGlja3lDb3VudCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0KSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dEluYWN0aXZlKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0U3RpY2t5KSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0SW5kZXhPZkVkaXRvcihpbnB1dEluYWN0aXZlKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEluZGV4T2ZFZGl0b3IoaW5wdXRTdGlja3kpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0SW5kZXhPZkVkaXRvcihpbnB1dCksIDIpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dCwgeyBzdGlja3k6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RpY2t5Q291bnQsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dEluYWN0aXZlKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0U3RpY2t5KSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0SW5kZXhPZkVkaXRvcihpbnB1dEluYWN0aXZlKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEluZGV4T2ZFZGl0b3IoaW5wdXRTdGlja3kpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0SW5kZXhPZkVkaXRvcihpbnB1dCksIDIpO1xuXG5cdFx0ZWRpdG9yR3JvdXBNb2RlbENoYW5nZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnc3RpY2t5OiB0cnVlIHdpbnMgb3ZlciBpbmRleCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnN0aWNreUNvdW50LCAwKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXRJbmFjdGl2ZSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIvaW5hY3RpdmUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0U3RpY2t5ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2Jhci9zdGlja3knKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dEluYWN0aXZlLCB7IGluYWN0aXZlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3IoaW5wdXRTdGlja3ksIHsgc3RpY2t5OiB0cnVlLCBpbmRleDogMiB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5zdGlja3lDb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0U3RpY2t5KSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0SW5kZXhPZkVkaXRvcihpbnB1dCksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRJbmRleE9mRWRpdG9yKGlucHV0SW5hY3RpdmUpLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0SW5kZXhPZkVkaXRvcihpbnB1dFN0aWNreSksIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzZWxlY3Rpb246IHNldFNlbGVjdGlvbiwgaXNTZWxlY3RlZCwgc2VsZWN0ZWRFZGl0b3JzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0MyA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGZ1bmN0aW9uIGlzU2VsZWN0aW9uKGlucHV0czogVGVzdEZpbGVFZGl0b3JJbnB1dFtdKTogYm9vbGVhbiB7XG5cdFx0XHRmb3IgKGNvbnN0IGlucHV0IG9mIGlucHV0cykge1xuXHRcdFx0XHRpZiAoZ3JvdXAuc2VsZWN0ZWRFZGl0b3JzLmluZGV4T2YoaW5wdXQpID09PSAtMSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGlucHV0cy5sZW5ndGggPT09IGdyb3VwLnNlbGVjdGVkRWRpdG9ycy5sZW5ndGg7XG5cdFx0fVxuXG5cdFx0Ly8gQWN0aXZlOiBpbnB1dDEsIFNlbGVjdGVkOiBpbnB1dDFcblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9ycyhbaW5wdXQxLCBpbnB1dDIsIGlucHV0M10ubWFwKGVkaXRvciA9PiAoeyBlZGl0b3IsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfSkpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0FjdGl2ZShpbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTZWxlY3RlZChpbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTZWxlY3RlZChpbnB1dDIpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU2VsZWN0ZWQoaW5wdXQzKSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzU2VsZWN0aW9uKFtpbnB1dDFdKSwgdHJ1ZSk7XG5cblx0XHQvLyBBY3RpdmU6IGlucHV0MSwgU2VsZWN0ZWQ6IGlucHV0MSwgaW5wdXQzXG5cdFx0YXdhaXQgZ3JvdXAuc2V0U2VsZWN0aW9uKGlucHV0MSwgW2lucHV0M10pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzQWN0aXZlKGlucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1NlbGVjdGVkKGlucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1NlbGVjdGVkKGlucHV0MiksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTZWxlY3RlZChpbnB1dDMpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1NlbGVjdGlvbihbaW5wdXQxLCBpbnB1dDNdKSwgdHJ1ZSk7XG5cblx0XHQvLyBBY3RpdmU6IGlucHV0MiwgU2VsZWN0ZWQ6IGlucHV0MSwgaW5wdXQzXG5cdFx0YXdhaXQgZ3JvdXAuc2V0U2VsZWN0aW9uKGlucHV0MiwgW2lucHV0MSwgaW5wdXQzXSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTZWxlY3RlZChpbnB1dDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNBY3RpdmUoaW5wdXQyKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU2VsZWN0ZWQoaW5wdXQyKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU2VsZWN0ZWQoaW5wdXQzKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNTZWxlY3Rpb24oW2lucHV0MSwgaW5wdXQyLCBpbnB1dDNdKSwgdHJ1ZSk7XG5cblx0XHRhd2FpdCBncm91cC5zZXRTZWxlY3Rpb24oaW5wdXQxLCBbXSk7XG5cblx0XHQvLyBTZWxlY3RlZDogaW5wdXQzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzQWN0aXZlKGlucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1NlbGVjdGVkKGlucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1NlbGVjdGVkKGlucHV0MiksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTZWxlY3RlZChpbnB1dDMpLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNTZWxlY3Rpb24oW2lucHV0MV0pLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZUVkaXRvciB3aXRoIGNvbnRleHQgKGFjcm9zcyBncm91cHMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXG5cdFx0Y29uc3QgcmlnaHRHcm91cCA9IHBhcnQuYWRkR3JvdXAoZ3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXRJbmFjdGl2ZSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIvaW5hY3RpdmUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IHRoaXJkSW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyL3RoaXJkJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGxldCBsZWZ0RmlyZWRDb3VudCA9IDA7XG5cdFx0Y29uc3QgbGVmdEdyb3VwTGlzdGVuZXIgPSBncm91cC5vbldpbGxNb3ZlRWRpdG9yKCgpID0+IHtcblx0XHRcdGxlZnRGaXJlZENvdW50Kys7XG5cdFx0fSk7XG5cblx0XHRsZXQgcmlnaHRGaXJlZENvdW50ID0gMDtcblx0XHRjb25zdCByaWdodEdyb3VwTGlzdGVuZXIgPSByaWdodEdyb3VwLm9uV2lsbE1vdmVFZGl0b3IoKCkgPT4ge1xuXHRcdFx0cmlnaHRGaXJlZENvdW50Kys7XG5cdFx0fSk7XG5cblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9ycyhbeyBlZGl0b3I6IGlucHV0LCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0sIHsgZWRpdG9yOiBpbnB1dEluYWN0aXZlIH0sIHsgZWRpdG9yOiB0aGlyZElucHV0IH1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGVmdEZpcmVkQ291bnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyaWdodEZpcmVkQ291bnQsIDApO1xuXG5cdFx0bGV0IHJlc3VsdCA9IGdyb3VwLm1vdmVFZGl0b3IoaW5wdXQsIHJpZ2h0R3JvdXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsZWZ0RmlyZWRDb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0RmlyZWRDb3VudCwgMCk7XG5cblx0XHRyZXN1bHQgPSBncm91cC5tb3ZlRWRpdG9yKGlucHV0SW5hY3RpdmUsIHJpZ2h0R3JvdXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsZWZ0RmlyZWRDb3VudCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0RmlyZWRDb3VudCwgMCk7XG5cblx0XHRyZXN1bHQgPSByaWdodEdyb3VwLm1vdmVFZGl0b3IoaW5wdXRJbmFjdGl2ZSwgZ3JvdXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsZWZ0RmlyZWRDb3VudCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0RmlyZWRDb3VudCwgMSk7XG5cblx0XHRsZWZ0R3JvdXBMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0cmlnaHRHcm91cExpc3RlbmVyLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZUVkaXRvciBkaXNhYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0VtcHR5LCB0cnVlKTtcblxuXHRcdGNvbnN0IHJpZ2h0R3JvdXAgPSBwYXJ0LmFkZEdyb3VwKGdyb3VwLCBHcm91cERpcmVjdGlvbi5SSUdIVCk7XG5cblx0XHRjb25zdCBpbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0SW5hY3RpdmUgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyL2luYWN0aXZlJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCB0aGlyZElucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2Jhci90aGlyZCcpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9ycyhbeyBlZGl0b3I6IGlucHV0LCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0sIHsgZWRpdG9yOiBpbnB1dEluYWN0aXZlIH0sIHsgZWRpdG9yOiB0aGlyZElucHV0IH1dKTtcblxuXHRcdGlucHV0LnNldE1vdmVEaXNhYmxlZCgnZGlzYWJsZWQnKTtcblx0XHRjb25zdCByZXN1bHQgPSBncm91cC5tb3ZlRWRpdG9yKGlucHV0LCByaWdodEdyb3VwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDMpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbldpbGxPcGVuRWRpdG9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXG5cdFx0Y29uc3QgcmlnaHRHcm91cCA9IHBhcnQuYWRkR3JvdXAoZ3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3Qgc2Vjb25kSW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyL3NlY29uZCcpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgdGhpcmRJbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIvdGhpcmQnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0bGV0IGxlZnRGaXJlZENvdW50ID0gMDtcblx0XHRjb25zdCBsZWZ0R3JvdXBMaXN0ZW5lciA9IGdyb3VwLm9uV2lsbE9wZW5FZGl0b3IoKCkgPT4ge1xuXHRcdFx0bGVmdEZpcmVkQ291bnQrKztcblx0XHR9KTtcblxuXHRcdGxldCByaWdodEZpcmVkQ291bnQgPSAwO1xuXHRcdGNvbnN0IHJpZ2h0R3JvdXBMaXN0ZW5lciA9IHJpZ2h0R3JvdXAub25XaWxsT3BlbkVkaXRvcigoKSA9PiB7XG5cdFx0XHRyaWdodEZpcmVkQ291bnQrKztcblx0XHR9KTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsZWZ0RmlyZWRDb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0RmlyZWRDb3VudCwgMCk7XG5cblx0XHRyaWdodEdyb3VwLm9wZW5FZGl0b3Ioc2Vjb25kSW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsZWZ0RmlyZWRDb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0RmlyZWRDb3VudCwgMSk7XG5cblx0XHRncm91cC5vcGVuRWRpdG9yKHRoaXJkSW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsZWZ0RmlyZWRDb3VudCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0RmlyZWRDb3VudCwgMSk7XG5cblx0XHQvLyBFbnN1cmUgbW92ZSBmaXJlcyB0aGUgb3BlbiBldmVudCB0b29cblx0XHRyaWdodEdyb3VwLm1vdmVFZGl0b3Ioc2Vjb25kSW5wdXQsIGdyb3VwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGVmdEZpcmVkQ291bnQsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyaWdodEZpcmVkQ291bnQsIDEpO1xuXG5cdFx0bGVmdEdyb3VwTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdHJpZ2h0R3JvdXBMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcHlFZGl0b3Igd2l0aCBjb250ZXh0IChhY3Jvc3MgZ3JvdXBzKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0VtcHR5LCB0cnVlKTtcblx0XHRsZXQgZmlyZWRDb3VudCA9IDA7XG5cdFx0Y29uc3QgbW92ZUxpc3RlbmVyID0gZ3JvdXAub25XaWxsTW92ZUVkaXRvcigoKSA9PiBmaXJlZENvdW50KyspO1xuXG5cdFx0Y29uc3QgcmlnaHRHcm91cCA9IHBhcnQuYWRkR3JvdXAoZ3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblx0XHRjb25zdCBpbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0SW5hY3RpdmUgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyL2luYWN0aXZlJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9ycyhbeyBlZGl0b3I6IGlucHV0LCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0sIHsgZWRpdG9yOiBpbnB1dEluYWN0aXZlIH1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyZWRDb3VudCwgMCk7XG5cblx0XHRncm91cC5jb3B5RWRpdG9yKGlucHV0SW5hY3RpdmUsIHJpZ2h0R3JvdXAsIHsgaW5kZXg6IDAgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyZWRDb3VudCwgMCk7XG5cdFx0bW92ZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnbG9ja2VkIGdyb3VwcyAtIGJhc2ljcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXG5cdFx0Y29uc3QgcmlnaHRHcm91cCA9IHBhcnQuYWRkR3JvdXAoZ3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblxuXHRcdGxldCBsZWZ0RmlyZWRDb3VudEZyb21QYXJ0ID0gMDtcblx0XHRsZXQgcmlnaHRGaXJlZENvdW50RnJvbVBhcnQgPSAwO1xuXHRcdGNvbnN0IHBhcnRMaXN0ZW5lciA9IHBhcnQub25EaWRDaGFuZ2VHcm91cExvY2tlZChnID0+IHtcblx0XHRcdGlmIChnID09PSBncm91cCkge1xuXHRcdFx0XHRsZWZ0RmlyZWRDb3VudEZyb21QYXJ0Kys7XG5cdFx0XHR9IGVsc2UgaWYgKGcgPT09IHJpZ2h0R3JvdXApIHtcblx0XHRcdFx0cmlnaHRGaXJlZENvdW50RnJvbVBhcnQrKztcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGxldCBsZWZ0RmlyZWRDb3VudEZyb21Hcm91cCA9IDA7XG5cdFx0Y29uc3QgbGVmdEdyb3VwTGlzdGVuZXIgPSBncm91cC5vbkRpZE1vZGVsQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUua2luZCA9PT0gR3JvdXBNb2RlbENoYW5nZUtpbmQuR1JPVVBfTE9DS0VEKSB7XG5cdFx0XHRcdGxlZnRGaXJlZENvdW50RnJvbUdyb3VwKys7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRsZXQgcmlnaHRGaXJlZENvdW50RnJvbUdyb3VwID0gMDtcblx0XHRjb25zdCByaWdodEdyb3VwTGlzdGVuZXIgPSByaWdodEdyb3VwLm9uRGlkTW9kZWxDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5raW5kID09PSBHcm91cE1vZGVsQ2hhbmdlS2luZC5HUk9VUF9MT0NLRUQpIHtcblx0XHRcdFx0cmlnaHRGaXJlZENvdW50RnJvbUdyb3VwKys7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyaWdodEdyb3VwLmxvY2sodHJ1ZSk7XG5cdFx0cmlnaHRHcm91cC5sb2NrKHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxlZnRGaXJlZENvdW50RnJvbUdyb3VwLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGVmdEZpcmVkQ291bnRGcm9tUGFydCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0RmlyZWRDb3VudEZyb21Hcm91cCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0RmlyZWRDb3VudEZyb21QYXJ0LCAxKTtcblxuXHRcdHJpZ2h0R3JvdXAubG9jayhmYWxzZSk7XG5cdFx0cmlnaHRHcm91cC5sb2NrKGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsZWZ0RmlyZWRDb3VudEZyb21Hcm91cCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxlZnRGaXJlZENvdW50RnJvbVBhcnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyaWdodEZpcmVkQ291bnRGcm9tR3JvdXAsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyaWdodEZpcmVkQ291bnRGcm9tUGFydCwgMik7XG5cblx0XHRncm91cC5sb2NrKHRydWUpO1xuXHRcdGdyb3VwLmxvY2sodHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGVmdEZpcmVkQ291bnRGcm9tR3JvdXAsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsZWZ0RmlyZWRDb3VudEZyb21QYXJ0LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRGaXJlZENvdW50RnJvbUdyb3VwLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRGaXJlZENvdW50RnJvbVBhcnQsIDIpO1xuXG5cdFx0Z3JvdXAubG9jayhmYWxzZSk7XG5cdFx0Z3JvdXAubG9jayhmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGVmdEZpcmVkQ291bnRGcm9tR3JvdXAsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsZWZ0RmlyZWRDb3VudEZyb21QYXJ0LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRGaXJlZENvdW50RnJvbUdyb3VwLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRGaXJlZENvdW50RnJvbVBhcnQsIDIpO1xuXG5cdFx0cGFydExpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRsZWZ0R3JvdXBMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0cmlnaHRHcm91cExpc3RlbmVyLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnbG9ja2VkIGdyb3VwcyAtIHNpbmdsZSBncm91cCBpcyBjYW4gYmUgbG9ja2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cblx0XHRncm91cC5sb2NrKHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0xvY2tlZCwgdHJ1ZSk7XG5cblx0XHRjb25zdCByaWdodEdyb3VwID0gcGFydC5hZGRHcm91cChncm91cCwgR3JvdXBEaXJlY3Rpb24uUklHSFQpO1xuXHRcdHJpZ2h0R3JvdXAubG9jayh0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyaWdodEdyb3VwLmlzTG9ja2VkLCB0cnVlKTtcblxuXHRcdHBhcnQucmVtb3ZlR3JvdXAoZ3JvdXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyaWdodEdyb3VwLmlzTG9ja2VkLCB0cnVlKTtcblxuXHRcdGNvbnN0IHJpZ2h0R3JvdXAyID0gcGFydC5hZGRHcm91cChyaWdodEdyb3VwLCBHcm91cERpcmVjdGlvbi5SSUdIVCk7XG5cdFx0cmlnaHRHcm91cC5sb2NrKHRydWUpO1xuXHRcdHJpZ2h0R3JvdXAyLmxvY2sodHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRHcm91cC5pc0xvY2tlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0R3JvdXAyLmlzTG9ja2VkLCB0cnVlKTtcblxuXHRcdHBhcnQucmVtb3ZlR3JvdXAocmlnaHRHcm91cDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0R3JvdXAuaXNMb2NrZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG9zZUFsbEdyb3VwcyBhY3Rpb24gLSBjYW5ub3QgY2xvc2UgZWRpdG9yIGhhbmRsaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0LCBpbnN0YW50aWF0aW9uU2VydmljZV0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0Y29uc3Qgcm9vdEdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblx0XHRjb25zdCByaWdodEdyb3VwID0gcGFydC5hZGRHcm91cChyb290R3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblxuXHRcdGNvbnN0IHJvb3RJbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9yb290JyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCByaWdodElucHV0ID0gY3JlYXRlQ2Fubm90Q2xvc2VUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vcmlnaHQnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgcm9vdEdyb3VwLm9wZW5FZGl0b3Iocm9vdElucHV0KTtcblx0XHRhd2FpdCByaWdodEdyb3VwLm9wZW5FZGl0b3IocmlnaHRJbnB1dCk7XG5cblx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBuZXcgQ2xvc2VBbGxFZGl0b3JHcm91cHNBY3Rpb24oKS5ydW4oYWNjZXNzb3IpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5hY3RpdmVHcm91cCwgcmlnaHRHcm91cCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyaWdodEdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpLCBbcmlnaHRJbnB1dF0pO1xuXHRcdGFzc2VydC5vayhyb290SW5wdXQuZ290RGlzcG9zZWQpO1xuXHRcdGFzc2VydC5vayghcmlnaHRJbnB1dC5nb3REaXNwb3NlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvY2tlZCBncm91cHMgLSBhdXRvIGxvY2tpbmcgdmlhIHNldHRpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignd29ya2JlbmNoJywgeyAnZWRpdG9yJzogeyAnYXV0b0xvY2tHcm91cHMnOiB7ICd0ZXN0RWRpdG9ySW5wdXRGb3JFZGl0b3JHcm91cFNlcnZpY2UnOiB0cnVlIH0gfSB9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydChpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCByb290R3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdGxldCByaWdodEdyb3VwID0gcGFydC5hZGRHcm91cChyb290R3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblxuXHRcdGxldCBpbnB1dDEgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0bGV0IGlucHV0MiA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdC8vIEZpcnN0IGVkaXRvciBvcGVucyBpbiByaWdodCBncm91cDogTG9ja2VkPXRydWVcblx0XHRhd2FpdCByaWdodEdyb3VwLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRHcm91cC5pc0xvY2tlZCwgdHJ1ZSk7XG5cblx0XHQvLyBTZWNvbmQgZWRpdG9ycyBvcGVucyBpbiBub3cgdW5sb2NrZWQgcmlnaHQgZ3JvdXA6IExvY2tlZD1mYWxzZVxuXHRcdHJpZ2h0R3JvdXAubG9jayhmYWxzZSk7XG5cdFx0YXdhaXQgcmlnaHRHcm91cC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0R3JvdXAuaXNMb2NrZWQsIGZhbHNlKTtcblxuXHRcdC8vRmlyc3QgZWRpdG9yIG9wZW5zIGluIHJvb3QgZ3JvdXAgd2l0aG91dCBvdGhlciBncm91cHMgYmVpbmcgb3BlbmVkOiBMb2NrZWQ9ZmFsc2Vcblx0XHRhd2FpdCByaWdodEdyb3VwLmNsb3NlQWxsRWRpdG9ycygpO1xuXHRcdHBhcnQucmVtb3ZlR3JvdXAocmlnaHRHcm91cCk7XG5cdFx0YXdhaXQgcm9vdEdyb3VwLmNsb3NlQWxsRWRpdG9ycygpO1xuXG5cdFx0aW5wdXQxID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjEnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGlucHV0MiA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGF3YWl0IHJvb3RHcm91cC5vcGVuRWRpdG9yKGlucHV0MSwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3RHcm91cC5pc0xvY2tlZCwgZmFsc2UpO1xuXHRcdHJpZ2h0R3JvdXAgPSBwYXJ0LmFkZEdyb3VwKHJvb3RHcm91cCwgR3JvdXBEaXJlY3Rpb24uUklHSFQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290R3JvdXAuaXNMb2NrZWQsIGZhbHNlKTtcblx0XHRjb25zdCBsZWZ0R3JvdXAgPSBwYXJ0LmFkZEdyb3VwKHJvb3RHcm91cCwgR3JvdXBEaXJlY3Rpb24uTEVGVCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3RHcm91cC5pc0xvY2tlZCwgZmFsc2UpO1xuXHRcdHBhcnQucmVtb3ZlR3JvdXAobGVmdEdyb3VwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdEdyb3VwLmlzTG9ja2VkLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21heGltaXplIGVkaXRvciBncm91cCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgcm9vdEdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblx0XHRjb25zdCBlZGl0b3JQYXJ0U2l6ZSA9IHBhcnQuZ2V0U2l6ZShyb290R3JvdXApO1xuXG5cdFx0Ly8gSWYgdGhlcmUgaXMgb25seSBvbmUgZ3JvdXAsIGl0IHNob3VsZCBub3QgYmUgY29uc2lkZXJlZCBtYXhpbWl6ZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5oYXNNYXhpbWl6ZWRHcm91cCgpLCBmYWxzZSk7XG5cblx0XHRjb25zdCByaWdodEdyb3VwID0gcGFydC5hZGRHcm91cChyb290R3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblx0XHRjb25zdCByaWdodEJvdHRvbUdyb3VwID0gcGFydC5hZGRHcm91cChyaWdodEdyb3VwLCBHcm91cERpcmVjdGlvbi5ET1dOKTtcblxuXHRcdGNvbnN0IHNpemVSb290R3JvdXAgPSBwYXJ0LmdldFNpemUocm9vdEdyb3VwKTtcblx0XHRjb25zdCBzaXplUmlnaHRHcm91cCA9IHBhcnQuZ2V0U2l6ZShyaWdodEdyb3VwKTtcblx0XHRjb25zdCBzaXplUmlnaHRCb3R0b21Hcm91cCA9IHBhcnQuZ2V0U2l6ZShyaWdodEJvdHRvbUdyb3VwKTtcblxuXHRcdGxldCBtYXhpbWl6ZWRWYWx1ZTtcblx0XHRjb25zdCBtYXhpaXplR3JvdXBFdmVudERpc3Bvc2FibGUgPSBwYXJ0Lm9uRGlkQ2hhbmdlR3JvdXBNYXhpbWl6ZWQoKG1heGltaXplZCkgPT4ge1xuXHRcdFx0bWF4aW1pemVkVmFsdWUgPSBtYXhpbWl6ZWQ7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5oYXNNYXhpbWl6ZWRHcm91cCgpLCBmYWxzZSk7XG5cblx0XHRwYXJ0LmFycmFuZ2VHcm91cHMoR3JvdXBzQXJyYW5nZW1lbnQuTUFYSU1JWkUsIHJvb3RHcm91cCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5oYXNNYXhpbWl6ZWRHcm91cCgpLCB0cnVlKTtcblxuXHRcdC8vIGdldFNpemUoKVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFydC5nZXRTaXplKHJvb3RHcm91cCksIGVkaXRvclBhcnRTaXplKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnQuZ2V0U2l6ZShyaWdodEdyb3VwKSwgeyB3aWR0aDogMCwgaGVpZ2h0OiAwIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFydC5nZXRTaXplKHJpZ2h0Qm90dG9tR3JvdXApLCB7IHdpZHRoOiAwLCBoZWlnaHQ6IDAgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1heGltaXplZFZhbHVlLCB0cnVlKTtcblxuXHRcdHBhcnQudG9nZ2xlTWF4aW1pemVHcm91cCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuaGFzTWF4aW1pemVkR3JvdXAoKSwgZmFsc2UpO1xuXG5cdFx0Ly8gU2l6ZSBpcyByZXN0b3JlZFxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFydC5nZXRTaXplKHJvb3RHcm91cCksIHNpemVSb290R3JvdXApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFydC5nZXRTaXplKHJpZ2h0R3JvdXApLCBzaXplUmlnaHRHcm91cCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJ0LmdldFNpemUocmlnaHRCb3R0b21Hcm91cCksIHNpemVSaWdodEJvdHRvbUdyb3VwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWF4aW1pemVkVmFsdWUsIGZhbHNlKTtcblx0XHRtYXhpaXplR3JvdXBFdmVudERpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd0cmFuc2llbnQgZWRpdG9ycyAtIGJhc2ljcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dFRyYW5zaWVudCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIvaW5hY3RpdmUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dFRyYW5zaWVudCwgeyB0cmFuc2llbnQ6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNUcmFuc2llbnQoaW5wdXQpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzVHJhbnNpZW50KGlucHV0VHJhbnNpZW50KSwgdHJ1ZSk7XG5cblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKGlucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKGlucHV0VHJhbnNpZW50LCB7IHRyYW5zaWVudDogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1RyYW5zaWVudChpbnB1dFRyYW5zaWVudCksIHRydWUpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dFRyYW5zaWVudCwgeyB0cmFuc2llbnQ6IGZhbHNlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1RyYW5zaWVudChpbnB1dFRyYW5zaWVudCksIGZhbHNlKTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3IoaW5wdXRUcmFuc2llbnQsIHsgdHJhbnNpZW50OiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1RyYW5zaWVudChpbnB1dFRyYW5zaWVudCksIGZhbHNlKTsgLy8gY2Fubm90IG1ha2UgYSBub24tdHJhbnNpZW50IGVkaXRvciB0cmFuc2llbnQgd2hlbiBhbHJlYWR5IG9wZW5lZFxuXHR9KTtcblxuXHR0ZXN0KCd0cmFuc2llbnQgZWRpdG9ycyAtIHBpbm5pbmcgY2xlYXJzIHRyYW5zaWVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dFRyYW5zaWVudCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIvaW5hY3RpdmUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dFRyYW5zaWVudCwgeyB0cmFuc2llbnQ6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNUcmFuc2llbnQoaW5wdXQpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzVHJhbnNpZW50KGlucHV0VHJhbnNpZW50KSwgdHJ1ZSk7XG5cblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKGlucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKGlucHV0VHJhbnNpZW50LCB7IHBpbm5lZDogdHJ1ZSwgdHJhbnNpZW50OiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzVHJhbnNpZW50KGlucHV0VHJhbnNpZW50KSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCd0cmFuc2llbnQgZWRpdG9ycyAtIG92ZXJyaWRlcyBlbmFibGVQcmV2aWV3IHNldHRpbmcnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignd29ya2JlbmNoJywgeyAnZWRpdG9yJzogeyAnZW5hYmxlUHJldmlldyc6IGZhbHNlIH0gfSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0VtcHR5LCB0cnVlKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dCwgeyBwaW5uZWQ6IGZhbHNlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1Bpbm5lZChpbnB1dCksIHRydWUpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dDIsIHsgdHJhbnNpZW50OiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1Bpbm5lZChpbnB1dDIpLCBmYWxzZSk7XG5cblx0XHRncm91cC5mb2N1cygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1Bpbm5lZChpbnB1dDIpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnd29ya2luZyBzZXRzIC0gY3JlYXRlIC8gYXBwbHkgc3RhdGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDIgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRjb25zdCBwYW5lMSA9IGF3YWl0IHBhcnQuYWN0aXZlR3JvdXAub3BlbkVkaXRvcihpbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0Y29uc3QgcGFuZTIgPSBhd2FpdCBwYXJ0LnNpZGVHcm91cC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cblx0XHRjb25zdCBzdGF0ZSA9IHBhcnQuY3JlYXRlU3RhdGUoKTtcblxuXHRcdGF3YWl0IHBhbmUyPy5ncm91cC5jbG9zZUFsbEVkaXRvcnMoKTtcblx0XHRhd2FpdCBwYW5lMT8uZ3JvdXAuY2xvc2VBbGxFZGl0b3JzKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5jb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuYWN0aXZlR3JvdXAuaXNFbXB0eSwgdHJ1ZSk7XG5cblx0XHRhd2FpdCBwYXJ0LmFwcGx5U3RhdGUoc3RhdGUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY291bnQsIDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZ3JvdXBzWzBdLmNvbnRhaW5zKGlucHV0KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZ3JvdXBzWzFdLmNvbnRhaW5zKGlucHV0MiksIHRydWUpO1xuXG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiBwYXJ0Lmdyb3Vwcykge1xuXHRcdFx0YXdhaXQgZ3JvdXAuY2xvc2VBbGxFZGl0b3JzKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW1wdHlTdGF0ZSA9IHBhcnQuY3JlYXRlU3RhdGUoKTtcblxuXHRcdGF3YWl0IHBhcnQuYXBwbHlTdGF0ZShlbXB0eVN0YXRlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5jb3VudCwgMSk7XG5cblx0XHRjb25zdCBpbnB1dDMgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0aW5wdXQzLmRpcnR5ID0gdHJ1ZTtcblx0XHRhd2FpdCBwYXJ0LmFjdGl2ZUdyb3VwLm9wZW5FZGl0b3IoaW5wdXQzLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblxuXHRcdGF3YWl0IHBhcnQuYXBwbHlTdGF0ZShlbXB0eVN0YXRlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5ncm91cHNbMF0uY29udGFpbnMoaW5wdXQzKSwgdHJ1ZSk7IC8vIGRpcnR5IGVkaXRvcnMgZW5mb3JjZSB0byBiZSB0aGVyZSBldmVuIHdoZW4gc3RhdGUgaXMgZW1wdHlcblxuXHRcdGF3YWl0IHBhcnQuYXBwbHlTdGF0ZSgnZW1wdHknKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5ncm91cHNbMF0uY29udGFpbnMoaW5wdXQzKSwgdHJ1ZSk7IC8vIGRpcnR5IGVkaXRvcnMgZW5mb3JjZSB0byBiZSB0aGVyZSBldmVuIHdoZW4gc3RhdGUgaXMgZW1wdHlcblxuXHRcdGlucHV0My5kaXJ0eSA9IGZhbHNlO1xuXG5cdFx0YXdhaXQgcGFydC5hcHBseVN0YXRlKCdlbXB0eScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLmlzRW1wdHksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCd3b3JraW5nIHNldHMgLSBhcHBseSBzdGF0ZSB3aGVuIHRoZSBwYXJ0IGhhcyBuZXZlciBiZWVuIGxhaWQgb3V0IGRvZXMgbm90IHRocm93IGFuZCByZWdpc3RlcnMgcmVzdG9yZWQgZ3JvdXBzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgcGFydC5hY3RpdmVHcm91cC5vcGVuRWRpdG9yKGlucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBwYXJ0LnNpZGVHcm91cC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cblx0XHRjb25zdCBzdGF0ZSA9IHBhcnQuY3JlYXRlU3RhdGUoKTtcblxuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgcGFydC5ncm91cHMpIHtcblx0XHRcdGF3YWl0IGdyb3VwLmNsb3NlQWxsRWRpdG9ycygpO1xuXHRcdH1cblxuXHRcdC8vIFNpbXVsYXRlIGFuIGVkaXRvciBwYXJ0IHRoYXQgaGFzIG5ldmVyIGJlZW4gbGFpZCBvdXQgKGUuZy4gaXQgc3RheWVkXG5cdFx0Ly8gaGlkZGVuIHNpbmNlIHRoZSB3aW5kb3cgb3BlbmVkLCBsaWtlIHRoZSBBZ2VudHMgd2luZG93IGVkaXRvciBhcmVhXG5cdFx0Ly8gYWZ0ZXIgYSByZWxvYWQgd2l0aCB0aGUgc2lkZSBwYW5lIGNsb3NlZCkuIEluIHRoYXQgc3RhdGVcblx0XHQvLyBgX2NvbnRlbnREaW1lbnNpb25gIGlzIHN0aWxsIHVuZGVmaW5lZCBhbmQgbGF5aW5nIG91dCBkdXJpbmcgdGhlXG5cdFx0Ly8gcmVzdG9yZSB3b3VsZCB0aHJvdywgYWJvcnRpbmcgYmVmb3JlIHRoZSBgb25EaWRBZGRHcm91cGAgZXZlbnRzIGZpcmUuXG5cdFx0KHBhcnQgYXMgdW5rbm93biBhcyB7IF9jb250ZW50RGltZW5zaW9uOiB1bmtub3duIH0pLl9jb250ZW50RGltZW5zaW9uID0gdW5kZWZpbmVkO1xuXG5cdFx0bGV0IGFkZGVkR3JvdXBzID0gMDtcblx0XHRjb25zdCBsaXN0ZW5lciA9IHBhcnQub25EaWRBZGRHcm91cCgoKSA9PiBhZGRlZEdyb3VwcysrKTtcblxuXHRcdC8vIE11c3Qgbm90IHRocm93LCBtdXN0IHJlc3RvcmUgdGhlIGdyb3VwcywgYW5kIG11c3QgZmlyZSBgb25EaWRBZGRHcm91cGBcblx0XHQvLyBmb3IgdGhlbSBzbyBsaXN0ZW5lcnMgKGUuZy4gdGhlIGVkaXRvciBzZXJ2aWNlKSByZWdpc3RlciB0aGVtLlxuXHRcdGF3YWl0IHBhcnQuYXBwbHlTdGF0ZShzdGF0ZSk7XG5cdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY291bnQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Lmdyb3Vwc1swXS5jb250YWlucyhpbnB1dCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Lmdyb3Vwc1sxXS5jb250YWlucyhpbnB1dDIpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWRkZWRHcm91cHMsIDIsIGBleHBlY3RlZCBleGFjdGx5IDIgb25EaWRBZGRHcm91cCBldmVudHMsIGdvdCAke2FkZGVkR3JvdXBzfWApO1xuXHR9KTtcblxuXHR0ZXN0KCdjb250ZXh0IGtleSBwcm92aWRlcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdC8vIEluc3RhbnRpYXRlIHdvcmtiZW5jaCBhbmQgc2V0dXAgaW5pdGlhbCBzdGF0ZVxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UoeyBjb250ZXh0S2V5U2VydmljZTogaW5zdGFudGlhdGlvblNlcnZpY2UgPT4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTW9ja1Njb3BhYmxlQ29udGV4dEtleVNlcnZpY2UpIH0sIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCByb290Q29udGV4dEtleVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IFtwYXJ0c10gPSBhd2FpdCBjcmVhdGVQYXJ0cyhpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDIgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQzID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjMnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0Y29uc3QgZ3JvdXAxID0gcGFydHMuYWN0aXZlR3JvdXA7XG5cdFx0Y29uc3QgZ3JvdXAyID0gcGFydHMuYWRkR3JvdXAoZ3JvdXAxLCBHcm91cERpcmVjdGlvbi5SSUdIVCk7XG5cblx0XHRhd2FpdCBncm91cDIub3BlbkVkaXRvcihpbnB1dDIsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGF3YWl0IGdyb3VwMS5vcGVuRWRpdG9yKGlucHV0MSwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cblx0XHQvLyBDcmVhdGUgY29udGV4dCBrZXkgcHJvdmlkZXJcblx0XHRjb25zdCByYXdDb250ZXh0S2V5ID0gbmV3IFJhd0NvbnRleHRLZXk8bnVtYmVyPigndGVzdENvbnRleHRLZXknLCBwYXJ0cy5hY3RpdmVHcm91cC5pZCk7XG5cdFx0Y29uc3QgY29udGV4dEtleVByb3ZpZGVyOiBJRWRpdG9yR3JvdXBDb250ZXh0S2V5UHJvdmlkZXI8bnVtYmVyPiA9IHtcblx0XHRcdGNvbnRleHRLZXk6IHJhd0NvbnRleHRLZXksXG5cdFx0XHRnZXRHcm91cENvbnRleHRLZXlWYWx1ZTogKGdyb3VwKSA9PiBncm91cC5pZFxuXHRcdH07XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBhcnRzLnJlZ2lzdGVyQ29udGV4dEtleVByb3ZpZGVyKGNvbnRleHRLZXlQcm92aWRlcikpO1xuXG5cdFx0Ly8gSW5pdGlhbCBzdGF0ZTogZ3JvdXAxIGlzIGFjdGl2ZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0cy5hY3RpdmVHcm91cC5pZCwgZ3JvdXAxLmlkKTtcblxuXHRcdGxldCBnbG9iYWxDb250ZXh0S2V5VmFsdWUgPSByb290Q29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKHJhd0NvbnRleHRLZXkua2V5KTtcblx0XHRsZXQgZ3JvdXAxQ29udGV4dEtleVZhbHVlID0gZ3JvdXAxLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZShyYXdDb250ZXh0S2V5LmtleSk7XG5cdFx0bGV0IGdyb3VwMkNvbnRleHRLZXlWYWx1ZSA9IGdyb3VwMi5zY29wZWRDb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUocmF3Q29udGV4dEtleS5rZXkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iYWxDb250ZXh0S2V5VmFsdWUsIGdyb3VwMS5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMUNvbnRleHRLZXlWYWx1ZSwgZ3JvdXAxLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAyQ29udGV4dEtleVZhbHVlLCBncm91cDIuaWQpO1xuXG5cdFx0Ly8gTWFrZSBncm91cDIgYWN0aXZlIGFuZCBlbnN1cmUgYm90aCBnbG9hYmFsIGFuZCBsb2NhbCBjb250ZXh0IGtleSB2YWx1ZXMgYXJlIHVwZGF0ZWRcblx0XHRwYXJ0cy5hY3RpdmF0ZUdyb3VwKGdyb3VwMik7XG5cblx0XHRnbG9iYWxDb250ZXh0S2V5VmFsdWUgPSByb290Q29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKHJhd0NvbnRleHRLZXkua2V5KTtcblx0XHRncm91cDFDb250ZXh0S2V5VmFsdWUgPSBncm91cDEuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKHJhd0NvbnRleHRLZXkua2V5KTtcblx0XHRncm91cDJDb250ZXh0S2V5VmFsdWUgPSBncm91cDIuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKHJhd0NvbnRleHRLZXkua2V5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYmFsQ29udGV4dEtleVZhbHVlLCBncm91cDIuaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDFDb250ZXh0S2V5VmFsdWUsIGdyb3VwMS5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMkNvbnRleHRLZXlWYWx1ZSwgZ3JvdXAyLmlkKTtcblxuXHRcdC8vIEFkZCBhIG5ldyBncm91cCBhbmQgZW5zdXJlIGJvdGggZ2xvYWJhbCBhbmQgbG9jYWwgY29udGV4dCBrZXkgdmFsdWVzIGFyZSB1cGRhdGVkXG5cdFx0Ly8gR3JvdXAgMyB3aWxsIGJlIGFjdGl2ZVxuXHRcdGNvbnN0IGdyb3VwMyA9IHBhcnRzLmFkZEdyb3VwKGdyb3VwMiwgR3JvdXBEaXJlY3Rpb24uUklHSFQpO1xuXHRcdGF3YWl0IGdyb3VwMy5vcGVuRWRpdG9yKGlucHV0MywgeyBwaW5uZWQ6IHRydWUgfSk7XG5cblx0XHRnbG9iYWxDb250ZXh0S2V5VmFsdWUgPSByb290Q29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKHJhd0NvbnRleHRLZXkua2V5KTtcblx0XHRncm91cDFDb250ZXh0S2V5VmFsdWUgPSBncm91cDEuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKHJhd0NvbnRleHRLZXkua2V5KTtcblx0XHRncm91cDJDb250ZXh0S2V5VmFsdWUgPSBncm91cDIuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKHJhd0NvbnRleHRLZXkua2V5KTtcblx0XHRjb25zdCBncm91cDNDb250ZXh0S2V5VmFsdWUgPSBncm91cDMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKHJhd0NvbnRleHRLZXkua2V5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYmFsQ29udGV4dEtleVZhbHVlLCBncm91cDMuaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDFDb250ZXh0S2V5VmFsdWUsIGdyb3VwMS5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMkNvbnRleHRLZXlWYWx1ZSwgZ3JvdXAyLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAzQ29udGV4dEtleVZhbHVlLCBncm91cDMuaWQpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb250ZXh0IGtleSBwcm92aWRlcjogb25EaWRDaGFuZ2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHQvLyBJbnN0YW50aWF0ZSB3b3JrYmVuY2ggYW5kIHNldHVwIGluaXRpYWwgc3RhdGVcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHsgY29udGV4dEtleVNlcnZpY2U6IGluc3RhbnRpYXRpb25TZXJ2aWNlID0+IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1vY2tTY29wYWJsZUNvbnRleHRLZXlTZXJ2aWNlKSB9LCBkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3Qgcm9vdENvbnRleHRLZXlTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElDb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRjb25zdCBwYXJ0cyA9IGF3YWl0IGNyZWF0ZUVkaXRvclBhcnRzKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDIgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRjb25zdCBncm91cDEgPSBwYXJ0cy5hY3RpdmVHcm91cDtcblx0XHRjb25zdCBncm91cDIgPSBwYXJ0cy5hZGRHcm91cChncm91cDEsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblxuXHRcdGF3YWl0IGdyb3VwMi5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgZ3JvdXAxLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblxuXHRcdC8vIENyZWF0ZSBjb250ZXh0IGtleSBwcm92aWRlclxuXHRcdGxldCBvZmZzZXQgPSAwO1xuXHRcdGNvbnN0IF9vbkRpZENoYW5nZSA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cblx0XHRjb25zdCByYXdDb250ZXh0S2V5ID0gbmV3IFJhd0NvbnRleHRLZXk8bnVtYmVyPigndGVzdENvbnRleHRLZXknLCBwYXJ0cy5hY3RpdmVHcm91cC5pZCk7XG5cdFx0Y29uc3QgY29udGV4dEtleVByb3ZpZGVyOiBJRWRpdG9yR3JvdXBDb250ZXh0S2V5UHJvdmlkZXI8bnVtYmVyPiA9IHtcblx0XHRcdGNvbnRleHRLZXk6IHJhd0NvbnRleHRLZXksXG5cdFx0XHRnZXRHcm91cENvbnRleHRLZXlWYWx1ZTogKGdyb3VwKSA9PiBncm91cC5pZCArIG9mZnNldCxcblx0XHRcdG9uRGlkQ2hhbmdlOiBfb25EaWRDaGFuZ2UuZXZlbnRcblx0XHR9O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwYXJ0cy5yZWdpc3RlckNvbnRleHRLZXlQcm92aWRlcihjb250ZXh0S2V5UHJvdmlkZXIpKTtcblxuXHRcdC8vIEluaXRpYWwgc3RhdGU6IGdyb3VwMSBpcyBhY3RpdmVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydHMuYWN0aXZlR3JvdXAuaWQsIGdyb3VwMS5pZCk7XG5cblx0XHRsZXQgZ2xvYmFsQ29udGV4dEtleVZhbHVlID0gcm9vdENvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZShyYXdDb250ZXh0S2V5LmtleSk7XG5cdFx0bGV0IGdyb3VwMUNvbnRleHRLZXlWYWx1ZSA9IGdyb3VwMS5zY29wZWRDb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUocmF3Q29udGV4dEtleS5rZXkpO1xuXHRcdGxldCBncm91cDJDb250ZXh0S2V5VmFsdWUgPSBncm91cDIuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKHJhd0NvbnRleHRLZXkua2V5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYmFsQ29udGV4dEtleVZhbHVlLCBncm91cDEuaWQgKyBvZmZzZXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDFDb250ZXh0S2V5VmFsdWUsIGdyb3VwMS5pZCArIG9mZnNldCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMkNvbnRleHRLZXlWYWx1ZSwgZ3JvdXAyLmlkICsgb2Zmc2V0KTtcblxuXHRcdC8vIE1ha2UgYSBjaGFuZ2UgdG8gdGhlIGNvbnRleHQga2V5IHByb3ZpZGVyIGFuZCBmaXJlIG9uRGlkQ2hhbmdlIHN1Y2ggdGhhdCBhbGwgY29udGV4dCBrZXkgdmFsdWVzIGFyZSB1cGRhdGVkXG5cdFx0b2Zmc2V0ID0gMTA7XG5cdFx0X29uRGlkQ2hhbmdlLmZpcmUoKTtcblxuXHRcdGdsb2JhbENvbnRleHRLZXlWYWx1ZSA9IHJvb3RDb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUocmF3Q29udGV4dEtleS5rZXkpO1xuXHRcdGdyb3VwMUNvbnRleHRLZXlWYWx1ZSA9IGdyb3VwMS5zY29wZWRDb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUocmF3Q29udGV4dEtleS5rZXkpO1xuXHRcdGdyb3VwMkNvbnRleHRLZXlWYWx1ZSA9IGdyb3VwMi5zY29wZWRDb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUocmF3Q29udGV4dEtleS5rZXkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iYWxDb250ZXh0S2V5VmFsdWUsIGdyb3VwMS5pZCArIG9mZnNldCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMUNvbnRleHRLZXlWYWx1ZSwgZ3JvdXAxLmlkICsgb2Zmc2V0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAyQ29udGV4dEtleVZhbHVlLCBncm91cDIuaWQgKyBvZmZzZXQpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb250ZXh0IGtleSBwcm92aWRlcjogYWN0aXZlIGVkaXRvciBjaGFuZ2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHQvLyBJbnN0YW50aWF0ZSB3b3JrYmVuY2ggYW5kIHNldHVwIGluaXRpYWwgc3RhdGVcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHsgY29udGV4dEtleVNlcnZpY2U6IGluc3RhbnRpYXRpb25TZXJ2aWNlID0+IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1vY2tTY29wYWJsZUNvbnRleHRLZXlTZXJ2aWNlKSB9LCBkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3Qgcm9vdENvbnRleHRLZXlTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElDb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRjb25zdCBwYXJ0cyA9IGF3YWl0IGNyZWF0ZUVkaXRvclBhcnRzKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDIgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRjb25zdCBncm91cDEgPSBwYXJ0cy5hY3RpdmVHcm91cDtcblxuXHRcdGF3YWl0IGdyb3VwMS5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgZ3JvdXAxLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblxuXHRcdC8vIENyZWF0ZSBjb250ZXh0IGtleSBwcm92aWRlclxuXHRcdGNvbnN0IHJhd0NvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxzdHJpbmc+KCd0ZXN0Q29udGV4dEtleScsIGlucHV0MS5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRjb25zdCBjb250ZXh0S2V5UHJvdmlkZXI6IElFZGl0b3JHcm91cENvbnRleHRLZXlQcm92aWRlcjxzdHJpbmc+ID0ge1xuXHRcdFx0Y29udGV4dEtleTogcmF3Q29udGV4dEtleSxcblx0XHRcdGdldEdyb3VwQ29udGV4dEtleVZhbHVlOiAoZ3JvdXApID0+IGdyb3VwLmFjdGl2ZUVkaXRvcj8ucmVzb3VyY2U/LnRvU3RyaW5nKCkgPz8gJycsXG5cdFx0fTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGFydHMucmVnaXN0ZXJDb250ZXh0S2V5UHJvdmlkZXIoY29udGV4dEtleVByb3ZpZGVyKSk7XG5cblx0XHQvLyBJbml0aWFsIHN0YXRlOiBpbnB1dDEgaXMgYWN0aXZlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRXF1YWwoZ3JvdXAxLmFjdGl2ZUVkaXRvcj8ucmVzb3VyY2UsIGlucHV0MS5yZXNvdXJjZSksIHRydWUpO1xuXG5cdFx0bGV0IGdsb2JhbENvbnRleHRLZXlWYWx1ZSA9IHJvb3RDb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUocmF3Q29udGV4dEtleS5rZXkpO1xuXHRcdGxldCBncm91cDFDb250ZXh0S2V5VmFsdWUgPSBncm91cDEuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKHJhd0NvbnRleHRLZXkua2V5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYmFsQ29udGV4dEtleVZhbHVlLCBpbnB1dDEucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMUNvbnRleHRLZXlWYWx1ZSwgaW5wdXQxLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXG5cdFx0Ly8gTWFrZSBpbnB1dDIgYWN0aXZlIGFuZCBlbnN1cmUgYm90aCBnbG9hYmFsIGFuZCBsb2NhbCBjb250ZXh0IGtleSB2YWx1ZXMgYXJlIHVwZGF0ZWRcblx0XHRhd2FpdCBncm91cDEub3BlbkVkaXRvcihpbnB1dDIpO1xuXG5cdFx0Z2xvYmFsQ29udGV4dEtleVZhbHVlID0gcm9vdENvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZShyYXdDb250ZXh0S2V5LmtleSk7XG5cdFx0Z3JvdXAxQ29udGV4dEtleVZhbHVlID0gZ3JvdXAxLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZShyYXdDb250ZXh0S2V5LmtleSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2JhbENvbnRleHRLZXlWYWx1ZSwgaW5wdXQyLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDFDb250ZXh0S2V5VmFsdWUsIGlucHV0Mi5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnb25EaWRBY3RpdmF0ZUdyb3VwIGNhcnJpZXMgYWN0aXZhdGlvbiByZWFzb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXG5cdFx0Y29uc3QgYWN0aXZhdGlvbkV2ZW50czogSUVkaXRvckdyb3VwQWN0aXZhdGlvbkV2ZW50W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGFydC5vbkRpZEFjdGl2YXRlR3JvdXAoZSA9PiBhY3RpdmF0aW9uRXZlbnRzLnB1c2goZSkpKTtcblxuXHRcdGNvbnN0IHJvb3RHcm91cCA9IHBhcnQuZ3JvdXBzWzBdO1xuXHRcdGNvbnN0IHJpZ2h0R3JvdXAgPSBwYXJ0LmFkZEdyb3VwKHJvb3RHcm91cCwgR3JvdXBEaXJlY3Rpb24uUklHSFQpO1xuXG5cdFx0Ly8gQWN0aXZhdGUgYSBncm91cCBleHBsaWNpdGx5IC0gc2hvdWxkIGNhcnJ5IERFRkFVTFQgcmVhc29uXG5cdFx0YWN0aXZhdGlvbkV2ZW50cy5sZW5ndGggPSAwO1xuXHRcdHBhcnQuYWN0aXZhdGVHcm91cChyaWdodEdyb3VwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZhdGlvbkV2ZW50cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3RpdmF0aW9uRXZlbnRzWzBdLmdyb3VwLCByaWdodEdyb3VwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZhdGlvbkV2ZW50c1swXS5yZWFzb24sIEdyb3VwQWN0aXZhdGlvblJlYXNvbi5ERUZBVUxUKTtcblxuXHRcdC8vIEFjdGl2YXRlIHRoZSBzYW1lIGdyb3VwIGFnYWluIC0gc2hvdWxkIHN0aWxsIGZpcmUgd2l0aCBERUZBVUxUIHJlYXNvblxuXHRcdGFjdGl2YXRpb25FdmVudHMubGVuZ3RoID0gMDtcblx0XHRwYXJ0LmFjdGl2YXRlR3JvdXAocmlnaHRHcm91cCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGl2YXRpb25FdmVudHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZhdGlvbkV2ZW50c1swXS5ncm91cCwgcmlnaHRHcm91cCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGl2YXRpb25FdmVudHNbMF0ucmVhc29uLCBHcm91cEFjdGl2YXRpb25SZWFzb24uREVGQVVMVCk7XG5cblx0XHQvLyBBY3RpdmF0ZSByb290IGdyb3VwIGJhY2tcblx0XHRhY3RpdmF0aW9uRXZlbnRzLmxlbmd0aCA9IDA7XG5cdFx0cGFydC5hY3RpdmF0ZUdyb3VwKHJvb3RHcm91cCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGl2YXRpb25FdmVudHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZhdGlvbkV2ZW50c1swXS5ncm91cCwgcm9vdEdyb3VwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZhdGlvbkV2ZW50c1swXS5yZWFzb24sIEdyb3VwQWN0aXZhdGlvblJlYXNvbi5ERUZBVUxUKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtCQUErQixvQkFBb0IscUJBQXFDLHFCQUFnRCxtQkFBbUIseUJBQTBDO0FBQzlNLFNBQVMsZ0JBQWdCLGFBQWEsZ0JBQWdCLGtCQUFrQixlQUFlLGVBQWUsc0JBQXNCLG1CQUFtRCw2QkFBMEQ7QUFDek8sU0FBUyxnQkFBb0MsY0FBYyx5QkFBeUIsc0JBQXNCLGtCQUEwQyx3QkFBd0I7QUFDNUssU0FBUyxXQUFXO0FBQ3BCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBR3RDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0JBQWdCO0FBQ3pC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
